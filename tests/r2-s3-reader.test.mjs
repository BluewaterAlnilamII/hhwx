import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";

import { fetchR2Object } from "../src/lib/r2-s3-reader.ts";
import {
  fetchBandoriPublicAssetIndexJson,
  fetchBandoriPublicAssetJson,
} from "../src/lib/bandori-public-asset-index-server.ts";

async function withServer(handler, assertion) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const config = {
    endpoint: `http://127.0.0.1:${address.port}`,
    bucket: "test-bucket",
    accessKeyId: "test-access-key",
    secretAccessKey: "test-secret-key",
    region: "auto",
  };
  try {
    await assertion(config);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("R2 reader returns a raw Buffer without eagerly copying it", async () => {
  await withServer((_request, response) => {
    response.end(Buffer.from("hello"));
  }, async (config) => {
    const result = await fetchR2Object(config, "object.json", undefined, {
      maxBytes: 10,
      timeoutMs: 1000,
    });
    assert.equal(result.status, 200);
    assert.deepEqual(await result.buffer(), Buffer.from("hello"));
    assert.equal(await result.text(), "hello");
  });
});

test("R2 reader rejects declared and streamed bodies over the limit", async () => {
  await withServer((request, response) => {
    if (request.url?.endsWith("/declared")) {
      response.writeHead(200, { "content-length": "1000" });
      response.end();
      return;
    }
    response.writeHead(200, { "transfer-encoding": "chunked" });
    response.write(Buffer.alloc(8));
    response.end(Buffer.alloc(8));
  }, async (config) => {
    await assert.rejects(
      fetchR2Object(config, "declared", undefined, { maxBytes: 10, timeoutMs: 1000 }),
      /byte limit/u,
    );
    await assert.rejects(
      fetchR2Object(config, "streamed", undefined, { maxBytes: 10, timeoutMs: 1000 }),
      /byte limit/u,
    );
  });
});

test("R2 reader destroys a request when the socket timeout expires", async () => {
  await withServer(() => {
    // Keep the response pending until the client timeout destroys the socket.
  }, async (config) => {
    await assert.rejects(
      fetchR2Object(config, "timeout", undefined, { maxBytes: 10, timeoutMs: 25 }),
      /timed out/u,
    );
  });
});

test("R2 reader enforces a wall-clock budget even while bytes keep arriving", async () => {
  await withServer((_request, response) => {
    response.writeHead(200, { "transfer-encoding": "chunked" });
    const interval = setInterval(() => response.write("x"), 5);
    response.on("close", () => clearInterval(interval));
  }, async (config) => {
    await assert.rejects(
      fetchR2Object(config, "trickle", undefined, { maxBytes: 1000, timeoutMs: 30 }),
      /timed out/u,
    );
  });
});

test("Bandori public asset index reader uses its explicit public bucket configuration", async () => {
  await withServer((request, response) => {
    assert.equal(request.url, "/test-bucket/bandori/music/index.json");
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ schemaVersion: 2 }));
  }, async (config) => {
    const names = [
      "BANDORI_ASSET_R2_ENDPOINT",
      "BANDORI_ASSET_R2_BUCKET",
      "BANDORI_ASSET_R2_ACCESS_KEY_ID",
      "BANDORI_ASSET_R2_SECRET_ACCESS_KEY",
      "BANDORI_ASSET_R2_REGION",
    ];
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    Object.assign(process.env, {
      BANDORI_ASSET_R2_ENDPOINT: config.endpoint,
      BANDORI_ASSET_R2_BUCKET: config.bucket,
      BANDORI_ASSET_R2_ACCESS_KEY_ID: config.accessKeyId,
      BANDORI_ASSET_R2_SECRET_ACCESS_KEY: config.secretAccessKey,
      BANDORI_ASSET_R2_REGION: config.region,
    });
    try {
      assert.deepEqual(
        await fetchBandoriPublicAssetIndexJson("bandori/music/index.json"),
        { schemaVersion: 2 },
      );
    } finally {
      for (const name of names) {
        if (previous[name] === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = previous[name];
        }
      }
    }
  });
});

test("Bandori public asset object reader verifies content-addressed JSON", async () => {
  const body = Buffer.from('{"notes":[]}');
  const sha256 = createHash("sha256").update(body).digest("hex");
  await withServer((request, response) => {
    assert.equal(request.url, `/test-bucket/bandori/music/charts/${sha256}.json`);
    response.setHeader("content-type", "application/json");
    response.end(body);
  }, async (config) => {
    const names = [
      "BANDORI_ASSET_R2_ENDPOINT",
      "BANDORI_ASSET_R2_BUCKET",
      "BANDORI_ASSET_R2_ACCESS_KEY_ID",
      "BANDORI_ASSET_R2_SECRET_ACCESS_KEY",
      "BANDORI_ASSET_R2_REGION",
    ];
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    Object.assign(process.env, {
      BANDORI_ASSET_R2_ENDPOINT: config.endpoint,
      BANDORI_ASSET_R2_BUCKET: config.bucket,
      BANDORI_ASSET_R2_ACCESS_KEY_ID: config.accessKeyId,
      BANDORI_ASSET_R2_SECRET_ACCESS_KEY: config.secretAccessKey,
      BANDORI_ASSET_R2_REGION: config.region,
    });
    try {
      assert.deepEqual(
        await fetchBandoriPublicAssetJson(
          `bandori/music/charts/${sha256}.json`,
          sha256,
        ),
        { notes: [] },
      );
      await assert.rejects(
        fetchBandoriPublicAssetJson(
          `bandori/music/charts/${sha256}.json`,
          "0".repeat(64),
        ),
        /checksum mismatch/u,
      );
    } finally {
      for (const name of names) {
        if (previous[name] === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = previous[name];
        }
      }
    }
  });
});
