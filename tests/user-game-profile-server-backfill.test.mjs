import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { gzipSync } from "node:zlib";

import { encodeBestdoriProfile } from "../src/lib/bestdori-profile-codec.ts";
import { encodeGameProfilePayload } from "../src/lib/user-game-profile-payload-server.ts";
import { inspectStoredGameProfileServer } from "../src/lib/user-game-profile-server-backfill-server.ts";

function storedRow(payloadServer, storedServer = payloadServer) {
  const compressed = encodeGameProfilePayload({
    bestdoriProfile: encodeBestdoriProfile({
      name: "Backfill Test",
      server: payloadServer,
      cards: [],
      items: {},
      potentials: [],
    }),
  });
  return {
    id: "00000000-0000-0000-0000-000000000001",
    server: storedServer,
    storage_codec: compressed.storageCodec,
    payload_compressed: compressed.payloadCompressed,
    payload_sha256: compressed.payloadSha256,
    payload_size: compressed.payloadSize,
  };
}

function invalidServerRow() {
  const rawBytes = Buffer.from(JSON.stringify({ bestdoriProfile: { server: 4 } }), "utf8");
  return {
    id: "00000000-0000-0000-0000-000000000002",
    server: 0,
    storage_codec: "hhwx-profile+gzip+base64-v1",
    payload_compressed: gzipSync(rawBytes).toString("base64"),
    payload_sha256: createHash("sha256").update(rawBytes).digest("hex"),
    payload_size: rawBytes.length,
  };
}

test("identifies matching stored and payload servers", () => {
  assert.deepEqual(inspectStoredGameProfileServer(storedRow(1)), {
    payloadServer: 1,
    storedServer: 1,
    matches: true,
  });
});

test("identifies a legacy JP summary for an EN payload", () => {
  assert.deepEqual(inspectStoredGameProfileServer(storedRow(1, 0)), {
    payloadServer: 1,
    storedServer: 0,
    matches: false,
  });
});

test("rejects invalid payload servers", () => {
  assert.throws(
    () => inspectStoredGameProfileServer(invalidServerRow()),
    /Invalid Bandori server in stored game profile payload/u,
  );
});

test("rejects a corrupted payload checksum", () => {
  const row = storedRow(1, 0);
  row.payload_sha256 = "0".repeat(64);
  assert.throws(
    () => inspectStoredGameProfileServer(row),
    /payload checksum mismatch/u,
  );
});
