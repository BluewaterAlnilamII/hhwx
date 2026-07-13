import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";

import { fetchR2Object } from "../src/lib/r2-s3-reader.ts";

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
