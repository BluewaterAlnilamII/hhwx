import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { gzipSync } from "node:zlib";

import {
  createBandoriSnapshotPointerCache,
  createBandoriSnapshotRecordMapCache,
} from "../src/lib/bandori-snapshot-api-server.ts";

function objectResponse(body) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-length": String(body.length) }),
    buffer: async () => body,
    arrayBuffer: async () => body.buffer.slice(
      body.byteOffset,
      body.byteOffset + body.byteLength,
    ),
    json: async () => JSON.parse(body.toString("utf8")),
    text: async () => body.toString("utf8"),
  };
}

function createPack(recordId) {
  const payload = { [recordId]: { id: Number(recordId) } };
  const body = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"), { mtime: 0 });
  const compressedSha256 = createHash("sha256").update(body).digest("hex");
  return {
    body,
    descriptor: {
      key: `packs/${compressedSha256}.json.gz`,
      semanticSha256: "a".repeat(64),
      compressedSha256,
      compressedSize: body.length,
      recordCount: 1,
    },
  };
}

function createCache(maxEntries) {
  return createBandoriSnapshotRecordMapCache({
    maxEntries,
    maxCompressedBytes: 1024 * 1024,
    maxDecompressedBytes: 1024 * 1024,
    maxRecords: 50,
    datasetLabel: "Test snapshot pack",
  });
}

test("concurrent reads for one pack share the same in-flight object request", async () => {
  const pack = createPack("1");
  let reads = 0;
  let receivedOptions = null;
  const source = {
    scope: "concurrent",
    read: async (_key, options) => {
      reads += 1;
      receivedOptions = options;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return objectResponse(pack.body);
    },
  };
  const read = createCache(1);

  const [first, second] = await Promise.all([
    read(source, "card00000", pack.descriptor),
    read(source, "card00000", pack.descriptor),
  ]);
  assert.deepEqual(first, second);
  assert.equal(reads, 1);
  assert.deepEqual(receivedOptions, { maxBytes: pack.body.length, timeoutMs: 15_000 });
});

test("pointer reads are bounded and failed pointer promises are evicted", async () => {
  let reads = 0;
  let receivedOptions = null;
  const source = {
    scope: "pointer-failure",
    read: async (_key, options) => {
      reads += 1;
      receivedOptions = options;
      if (reads === 1) {
        throw new Error("temporary pointer failure");
      }
      return objectResponse(Buffer.from('{"generation":2}', "utf8"));
    },
  };
  const readPointer = createBandoriSnapshotPointerCache({
    pointerKey: "pointer.json",
    pointerTtlMs: 60_000,
    pointerReadLabel: "Test pointer",
    parse: (value) => value,
  });

  await assert.rejects(readPointer(source), /temporary pointer failure/u);
  assert.deepEqual(await readPointer(source), { generation: 2 });
  assert.equal(reads, 2);
  assert.deepEqual(receivedOptions, { maxBytes: 1024 * 1024, timeoutMs: 15_000 });
});

test("failed pack promises are evicted immediately", async () => {
  const pack = createPack("1");
  let reads = 0;
  const source = {
    scope: "failure",
    read: async () => {
      reads += 1;
      if (reads === 1) {
        throw new Error("temporary failure");
      }
      return objectResponse(pack.body);
    },
  };
  const read = createCache(1);

  await assert.rejects(read(source, "card00000", pack.descriptor), /temporary failure/u);
  assert.deepEqual(await read(source, "card00000", pack.descriptor), { "1": { id: 1 } });
  assert.equal(reads, 2);
});

test("resolved packs use a bounded LRU without evicting pending reads", async () => {
  const packs = [createPack("1"), createPack("51"), createPack("101")];
  const readCounts = new Map();
  const source = {
    scope: "lru",
    read: async (key) => {
      readCounts.set(key, (readCounts.get(key) ?? 0) + 1);
      const pack = packs.find((candidate) => candidate.descriptor.key === key);
      return objectResponse(pack.body);
    },
  };
  const read = createCache(2);

  await read(source, "card00000", packs[0].descriptor);
  await read(source, "card00001", packs[1].descriptor);
  await read(source, "card00002", packs[2].descriptor);
  await read(source, "card00000", packs[0].descriptor);

  assert.equal(readCounts.get(packs[0].descriptor.key), 2);
  assert.equal(readCounts.get(packs[1].descriptor.key), 1);
  assert.equal(readCounts.get(packs[2].descriptor.key), 1);
});
