import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after, before } from "node:test";
import { gzipSync } from "node:zlib";

import {
  bandoriCutoffHistoryMonthIdToPeriod,
  buildBandoriCutoffHistoryTargetPrefix,
} from "../src/lib/bandori/event-tracker/cutoff-history-contract.ts";
import { handleBandoriTrackerDataRequest } from "../src/lib/bandori/event-tracker/api-server.ts";

let storeRoot;

async function writeObject(key, body) {
  const path = join(storeRoot, ...key.split("/"));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
}

function buildPack(query, payload) {
  const compressed = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"), { mtime: 0 });
  const compressedSha256 = createHash("sha256").update(compressed).digest("hex");
  return {
    compressed,
    descriptor: {
      key: `${buildBandoriCutoffHistoryTargetPrefix(query)}/packs/${query.type}/${compressedSha256}.json.gz`,
      semanticSha256: "a".repeat(64),
      compressedSha256,
      compressedSize: compressed.length,
      recordCount: 2,
      tierCount: 1,
      hasFinalPoint: true,
    },
  };
}

async function writeServerHistory(server, eventId, monthId) {
  const eventQuery = { server, targetId: eventId, tier: 1000, type: "event" };
  const songQuery = { ...eventQuery, type: "song" };
  const eventPack = buildPack(eventQuery, {
    schemaVersion: 1,
    kind: "event",
    server,
    eventId,
    tiers: { 1000: [[1000, eventId], [2000, eventId + 1, 1]] },
  });
  const songPack = buildPack(songQuery, {
    schemaVersion: 1,
    kind: "song",
    server,
    eventId,
    tiers: { 1000: { 42: [[1000, eventId + 10], [2000, eventId + 11, 1]] } },
  });
  await writeObject(eventPack.descriptor.key, eventPack.compressed);
  await writeObject(songPack.descriptor.key, songPack.compressed);
  await writeObject(
    `${buildBandoriCutoffHistoryTargetPrefix(eventQuery)}/manifest.json`,
    Buffer.from(JSON.stringify({
      schemaVersion: 1,
      kind: "events",
      server,
      eventId,
      generation: 1,
      publishedAt: "2026-08-01T00:00:00Z",
      preserveIrregularPoints: true,
      hasFinalPoint: true,
      packs: { event: eventPack.descriptor, song: songPack.descriptor },
    }), "utf8"),
  );

  const monthlyQuery = { server, targetId: monthId, tier: 1000, type: "monthly" };
  const period = bandoriCutoffHistoryMonthIdToPeriod(monthId, server);
  const monthlyPack = buildPack(monthlyQuery, {
    schemaVersion: 1,
    kind: "monthly",
    server,
    period,
    sourceMonthId: monthId,
    tiers: { 1000: [[3000, monthId], [4000, monthId + 1, 1]] },
  });
  await writeObject(monthlyPack.descriptor.key, monthlyPack.compressed);
  await writeObject(
    `${buildBandoriCutoffHistoryTargetPrefix(monthlyQuery)}/manifest.json`,
    Buffer.from(JSON.stringify({
      schemaVersion: 1,
      kind: "monthly",
      server,
      period,
      sourceMonthId: monthId,
      generation: 1,
      publishedAt: "2026-08-01T00:00:00Z",
      preserveIrregularPoints: true,
      hasFinalPoint: true,
      packs: { monthly: monthlyPack.descriptor },
    }), "utf8"),
  );
}

async function request(query) {
  return handleBandoriTrackerDataRequest(
    new Request(`http://localhost/api/bandori/tracker/data?${query}`),
  );
}

before(async () => {
  storeRoot = await mkdtemp(join(tmpdir(), "hhwx-regional-tracker-"));
  process.env.BANDORI_TRACKER_HISTORY_LOCAL_STORE_ROOT = storeRoot;
  const cases = [["jp", 700, 23], ["en", 701, 11], ["tw", 702, 15], ["cn", 703, 19]];
  for (const [server, eventId, monthId] of cases) {
    await writeServerHistory(server, eventId, monthId);
  }
});

after(async () => {
  delete process.env.BANDORI_TRACKER_HISTORY_LOCAL_STORE_ROOT;
  await rm(storeRoot, { recursive: true, force: true });
});

test("cutoff API reads event, song, and monthly history for every server", async () => {
  const cases = [[0, 700, 23], [1, 701, 11], [2, 702, 15], [3, 703, 19]];
  for (const [server, eventId, monthId] of cases) {
    const event = await request(`server=${server}&event=${eventId}&tier=1000&type=event`);
    assert.equal(event.status, 200);
    assert.equal((await event.json()).cutoffs[0].ep, eventId);

    const song = await request(`server=${server}&event=${eventId}&tier=1000&type=song`);
    assert.equal(song.status, 200);
    assert.deepEqual(Object.keys((await song.json()).cutoffs), ["42"]);

    const monthly = await request(`server=${server}&event=${monthId}&tier=1000&type=monthly`);
    assert.equal(monthly.status, 200);
    assert.equal((await monthly.json()).cutoffs[0].ep, monthId);
  }
});

test("regional missing manifests are empty and invalid servers are rejected", async () => {
  for (const server of [0, 1, 2]) {
    const response = await request(`server=${server}&event=999&tier=1000&type=event`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { result: true, cutoffs: [] });
  }
  const invalid = await request("server=4&event=700&tier=1000&type=event");
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, "INVALID_REQUEST");
});

test("cross-server manifest identity returns unavailable", async () => {
  const wrongQuery = { server: "en", targetId: 704, tier: 1000, type: "event" };
  const wrongPrefix = buildBandoriCutoffHistoryTargetPrefix(wrongQuery);
  await writeObject(`${wrongPrefix}/manifest.json`, Buffer.from(JSON.stringify({
    schemaVersion: 1,
    kind: "events",
    server: "jp",
    eventId: 704,
    generation: 1,
    publishedAt: "2026-08-01T00:00:00Z",
    preserveIrregularPoints: true,
    hasFinalPoint: true,
    packs: { event: { invalid: true } },
  }), "utf8"));
  const response = await request("server=1&event=704&tier=1000&type=event");
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "TRACKER_HISTORY_UNAVAILABLE");
});
