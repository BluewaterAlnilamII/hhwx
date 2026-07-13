import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { once } from "node:events";
import { createServer } from "node:net";
import { spawn } from "node:child_process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextBin = join(repositoryRoot, "node_modules", "next", "dist", "bin", "next");
const pointerKey = "bandori/event-history-v3/api/active.json";
const packPrefix = "bandori/event-history-v3/api/packs";
const maxDecompressedBytes = 128 * 1024 * 1024;

async function writeObject(root, key, body) {
  const path = join(root, ...key.split("/"));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}

function pack(dataset, payload, options = {}) {
  let body = options.corrupt
    ? Buffer.from("not-a-gzip-pack")
    : gzipSync(Buffer.from(JSON.stringify(payload), "utf8"), { mtime: 0 });
  if (options.oversizedAdvertisedBody) {
    body = Buffer.from(body);
    body.writeUInt32LE(maxDecompressedBytes + 1, body.length - 4);
  }
  const compressedSha256 = createHash("sha256").update(body).digest("hex");
  const semanticSha256 = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return {
    body,
    descriptor: {
      key: `${packPrefix}/${dataset}/${compressedSha256}.json.gz`,
      semanticSha256,
      compressedSha256,
      compressedSize: body.length,
      recordCount: options.recordCount ?? Object.keys(payload).length,
    },
  };
}

async function createStore(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "hhwx-events-v3-"));
  if (options.legacyOnly) {
    await writeObject(
      root,
      "bandori/master-history-v2/events-api/active.json",
      Buffer.from(JSON.stringify({ schemaVersion: "bandori-events-api-pointer-v1" })),
    );
    return root;
  }

  const events = { "1": { eventType: "story", eventName: ["Test", null, null, null] } };
  const eventDetails = {
    "1": {
      eventType: "story",
      eventName: ["Test", null, null, null],
      stories: [],
    },
  };
  const eventsPack = pack("events", events, {
    corrupt: options.corruptDataset === "events",
    oversizedAdvertisedBody: options.oversizedDataset === "events",
    recordCount: options.recordCountMismatch ? 2 : undefined,
  });
  const detailsPack = pack("eventDetails", eventDetails, {
    corrupt: options.corruptDataset === "eventDetails",
    oversizedAdvertisedBody: options.oversizedDataset === "eventDetails",
  });
  await writeObject(root, eventsPack.descriptor.key, eventsPack.body);
  await writeObject(root, detailsPack.descriptor.key, detailsPack.body);
  await writeObject(
    root,
    pointerKey,
    Buffer.from(JSON.stringify({
      schemaVersion: "bandori-events-api-pointer-v2",
      generation: 1,
      datasets: {
        events: eventsPack.descriptor,
        eventDetails: detailsPack.descriptor,
      },
    })),
  );
  return root;
}

async function reservePort() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const server = createServer();
    const port = 20_000 + Math.floor(Math.random() * 20_000);
    try {
      await new Promise((resolvePromise, rejectPromise) => {
        server.once("error", rejectPromise);
        server.listen(port, "127.0.0.1", resolvePromise);
      });
      server.close();
      await once(server, "close");
      return port;
    } catch (error) {
      if (error?.code !== "EADDRINUSE" && error?.code !== "EACCES") throw error;
    }
  }
  throw new Error("Unable to reserve a Next.js-safe test port");
}

async function stopServer(child) {
  if (child.exitCode !== null) {
    return;
  }
  const exitPromise = once(child, "exit");
  child.kill("SIGTERM");
  const exited = await Promise.race([
    exitPromise.then(() => true),
    new Promise((resolvePromise) => setTimeout(() => resolvePromise(false), 5_000)),
  ]);
  if (!exited) {
    child.kill("SIGKILL");
    await exitPromise;
  }
}

async function withServer(storeRoot, assertion) {
  const port = await reservePort();
  const logs = [];
  const child = spawn(
    process.execPath,
    [nextBin, "dev", "--hostname", "localhost", "--port", String(port)],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        BANDORI_EVENT_API_LOCAL_STORE_ROOT: storeRoot,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  const url = `http://localhost:${port}`;
  try {
    let response = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (child.exitCode !== null) {
        throw new Error(`Next dev exited before becoming ready:\n${logs.join("")}`);
      }
      try {
        response = await fetch(`${url}/api/bandori/master/events`);
        break;
      } catch {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
      }
    }
    if (!response) {
      throw new Error(`Next dev did not become ready:\n${logs.join("")}`);
    }
    await assertion(url, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\nNext output:\n${logs.join("")}`, { cause: error });
  } finally {
    await stopServer(child);
  }
}

async function expectReadFailure(options) {
  const root = await createStore(options);
  try {
    await withServer(root, async (_url, response) => {
      assert.equal(response.status, 500);
      const body = await response.json();
      assert.equal(body.success, false);
      assert.equal(body.error.code, "BANDORI_MASTER_DATA_READ_FAILED");
      assert.equal("data" in body, false);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const validRoot = await createStore();
try {
  await withServer(validRoot, async (url, listResponse) => {
    assert.equal(listResponse.status, 200);
    assert.deepEqual(await listResponse.json(), {
      success: true,
      data: { "1": { eventType: "story", eventName: ["Test", null, null, null] } },
    });

    const detailResponse = await fetch(`${url}/api/bandori/master/events/1`);
    assert.equal(detailResponse.status, 200);
    assert.deepEqual(await detailResponse.json(), {
      success: true,
      data: {
        eventType: "story",
        eventName: ["Test", null, null, null],
        stories: [],
      },
    });

    const missingResponse = await fetch(`${url}/api/bandori/master/events/999`);
    assert.equal(missingResponse.status, 404);
    assert.deepEqual(await missingResponse.json(), {
      success: false,
      error: {
        code: "BANDORI_MASTER_EVENT_DETAIL_NOT_FOUND",
        message: "Bandori master event detail is not available",
      },
    });
  });
} finally {
  await rm(validRoot, { recursive: true, force: true });
}

await expectReadFailure({ legacyOnly: true });
await expectReadFailure({ corruptDataset: "events" });
await expectReadFailure({ oversizedDataset: "events" });
await expectReadFailure({ recordCountMismatch: true });

console.log("Bandori Events v3 local-store integration checks passed.");
