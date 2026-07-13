import assert from "node:assert/strict";
import test from "node:test";

import {
  BANDORI_CUTOFF_HISTORY_MAX_PACK_RECORDS,
  BANDORI_CUTOFF_HISTORY_MAX_ROWS,
  bandoriCutoffHistoryMonthIdToPeriod,
  buildBandoriCutoffHistoryManifestKey,
  buildBandoriCutoffHistoryTargetPrefix,
  parseBandoriCutoffHistoryManifest,
  parseBandoriCutoffHistoryPack,
  selectBandoriCutoffHistoryCutoffs,
} from "../src/lib/bandori-cutoff-history-contract.ts";

const semanticSha256 = "a".repeat(64);
const compressedSha256 = "b".repeat(64);

function query(overrides = {}) {
  return {
    server: "cn",
    targetId: 316,
    tier: 1000,
    type: "event",
    ...overrides,
  };
}

function descriptor(targetQuery, overrides = {}) {
  return {
    key: `${buildBandoriCutoffHistoryTargetPrefix(targetQuery)}/packs/${targetQuery.type}/${compressedSha256}.json.gz`,
    semanticSha256,
    compressedSha256,
    compressedSize: 100,
    recordCount: 2,
    tierCount: 1,
    hasFinalPoint: true,
    ...overrides,
  };
}

function manifest(targetQuery, packDescriptor = descriptor(targetQuery)) {
  const monthly = targetQuery.type === "monthly";
  return {
    schemaVersion: 1,
    kind: monthly ? "monthly" : "events",
    server: "cn",
    generation: 3,
    publishedAt: "2026-07-13T13:00:00+00:00",
    preserveIrregularPoints: true,
    hasFinalPoint: true,
    ...(monthly
      ? { period: bandoriCutoffHistoryMonthIdToPeriod(targetQuery.targetId), sourceMonthId: targetQuery.targetId }
      : { eventId: targetQuery.targetId }),
    packs: { [targetQuery.type]: packDescriptor },
  };
}

function eventPack(targetQuery, points = [[1000, 10], [2000, 20, 1]]) {
  return {
    schemaVersion: 1,
    kind: targetQuery.type,
    server: "cn",
    ...(targetQuery.type === "monthly"
      ? { period: bandoriCutoffHistoryMonthIdToPeriod(targetQuery.targetId), sourceMonthId: targetQuery.targetId }
      : { eventId: targetQuery.targetId }),
    tiers: { [targetQuery.tier]: points },
  };
}

test("target keys preserve event/server ordering and map month IDs", () => {
  assert.equal(
    buildBandoriCutoffHistoryManifestKey(query()),
    "bandori/trackerdata/events/316/cn/manifest.json",
  );
  const monthlyQuery = query({ targetId: 18, type: "monthly" });
  assert.equal(bandoriCutoffHistoryMonthIdToPeriod(18), "2026-07");
  assert.equal(
    buildBandoriCutoffHistoryManifestKey(monthlyQuery),
    "bandori/trackerdata/monthly/2026-07/cn/manifest.json",
  );
});

test("missing requested kind is a valid empty selection", () => {
  const targetQuery = query({ type: "song" });
  const payload = manifest(targetQuery);
  payload.packs = { event: descriptor(query()) };
  assert.equal(parseBandoriCutoffHistoryManifest(payload, targetQuery).descriptor, null);
});

test("manifest validates every published pack before treating a missing kind as empty", () => {
  const targetQuery = query({ type: "song" });

  const unknownKind = manifest(targetQuery);
  unknownKind.packs = { garbage: {} };
  assert.throws(
    () => parseBandoriCutoffHistoryManifest(unknownKind, targetQuery),
    /pack kind is invalid/u,
  );

  const invalidOtherDescriptor = manifest(targetQuery);
  invalidOtherDescriptor.packs = { event: { ...descriptor(query()), compressedSize: 0 } };
  assert.throws(
    () => parseBandoriCutoffHistoryManifest(invalidOtherDescriptor, targetQuery),
    /greater than or equal to 1/u,
  );

  const wrongFinalSummary = manifest(targetQuery);
  wrongFinalSummary.packs = { event: descriptor(query(), { hasFinalPoint: false }) };
  assert.throws(
    () => parseBandoriCutoffHistoryManifest(wrongFinalSummary, targetQuery),
    /final-point summary mismatch/u,
  );
});

test("manifest validation requires the writer's irregular-point contract", () => {
  const targetQuery = query();
  for (const mutate of [
    (payload) => { delete payload.preserveIrregularPoints; },
    (payload) => { payload.preserveIrregularPoints = false; },
    (payload) => { delete payload.hasFinalPoint; },
    (payload) => { payload.publishedAt = "2026-07-13T13:00:00"; },
    (payload) => { payload.packs = {}; },
  ]) {
    const payload = manifest(targetQuery);
    mutate(payload);
    assert.throws(() => parseBandoriCutoffHistoryManifest(payload, targetQuery));
  }
});

test("event and monthly packs preserve irregular times and final flags", () => {
  for (const targetQuery of [query(), query({ targetId: 18, type: "monthly" })]) {
    const selected = parseBandoriCutoffHistoryManifest(manifest(targetQuery), targetQuery);
    const parsed = parseBandoriCutoffHistoryPack(
      eventPack(targetQuery),
      targetQuery,
      selected.descriptor,
    );
    assert.deepEqual(selectBandoriCutoffHistoryCutoffs(parsed, targetQuery.tier), [
      { time: 1000, ep: 10 },
      { time: 2000, ep: 20, isFinal: true },
    ]);
    assert.deepEqual(selectBandoriCutoffHistoryCutoffs(parsed, 1), []);
  }
});

test("unknown positive flag bits are ignored while bit zero remains final", () => {
  const targetQuery = query();
  const packDescriptor = descriptor(targetQuery, { recordCount: 2, hasFinalPoint: true });
  const parsed = parseBandoriCutoffHistoryPack(
    eventPack(targetQuery, [[1000, 10, 2], [2000, 20, 3]]),
    targetQuery,
    packDescriptor,
  );
  assert.deepEqual(selectBandoriCutoffHistoryCutoffs(parsed, targetQuery.tier), [
    { time: 1000, ep: 10 },
    { time: 2000, ep: 20, isFinal: true },
  ]);
});

test("non-canonical points and time order are rejected", () => {
  const targetQuery = query();
  const packDescriptor = descriptor(targetQuery);
  for (const points of [
    [[1000, 10, null], [2000, 20, 1]],
    [[1000, 10, 0], [2000, 20, 1]],
    [[2000, 10], [1000, 20, 1]],
    [[1000, 10], [1000, 20, 1]],
    [[0, 10], [2000, 20, 1]],
    [[1000, 0], [2000, 20, 1]],
    [],
  ]) {
    assert.throws(
      () => parseBandoriCutoffHistoryPack(
        eventPack(targetQuery, points),
        targetQuery,
        packDescriptor,
      ),
    );
  }
});

test("referenced packs reject empty writer-impossible structures", () => {
  const targetQuery = query();
  assert.throws(
    () => parseBandoriCutoffHistoryPack(
      { ...eventPack(targetQuery), tiers: {} },
      targetQuery,
      descriptor(targetQuery, { recordCount: 1, tierCount: 1 }),
    ),
    /must not be empty/u,
  );

  const songQuery = query({ type: "song" });
  assert.throws(
    () => parseBandoriCutoffHistoryPack(
      { ...eventPack(songQuery), tiers: { 1000: {} } },
      songQuery,
      descriptor(songQuery),
    ),
    /must not be empty/u,
  );
  assert.throws(
    () => parseBandoriCutoffHistoryManifest(
      manifest(targetQuery, descriptor(targetQuery, { recordCount: 0 })),
      targetQuery,
    ),
    /greater than or equal to 1/u,
  );
  assert.throws(
    () => parseBandoriCutoffHistoryManifest(
      manifest(targetQuery, descriptor(targetQuery, { tierCount: 0 })),
      targetQuery,
    ),
    /greater than or equal to 1/u,
  );
  assert.throws(
    () => parseBandoriCutoffHistoryManifest(
      manifest(targetQuery, descriptor(targetQuery, {
        recordCount: BANDORI_CUTOFF_HISTORY_MAX_PACK_RECORDS + 1,
      })),
      targetQuery,
    ),
    /record limit/u,
  );
});

test("descriptor identity and pack statistics are enforced", () => {
  const targetQuery = query();
  const redirected = descriptor(targetQuery, { key: "other/packs/event/file.json.gz" });
  assert.throws(
    () => parseBandoriCutoffHistoryManifest(manifest(targetQuery, redirected), targetQuery),
    /pack key/u,
  );
  assert.throws(
    () => parseBandoriCutoffHistoryPack(
      eventPack(targetQuery),
      targetQuery,
      descriptor(targetQuery, { recordCount: 3 }),
    ),
    /record count/u,
  );
});

test("song packs preserve numeric song ordering and the global 5000-row limit", () => {
  const targetQuery = query({ type: "song" });
  const firstSong = Array.from({ length: BANDORI_CUTOFF_HISTORY_MAX_ROWS - 1 }, (_, index) => [
    1000 + index,
    index + 1,
  ]);
  const payload = {
    schemaVersion: 1,
    kind: "song",
    server: "cn",
    eventId: targetQuery.targetId,
    tiers: {
      [targetQuery.tier]: {
        10: [[9000, 30], [10000, 40]],
        2: firstSong,
      },
    },
  };
  const packDescriptor = descriptor(targetQuery, {
    recordCount: BANDORI_CUTOFF_HISTORY_MAX_ROWS + 1,
    tierCount: 1,
    hasFinalPoint: false,
  });
  const parsed = parseBandoriCutoffHistoryPack(payload, targetQuery, packDescriptor);
  const cutoffs = selectBandoriCutoffHistoryCutoffs(parsed, targetQuery.tier);
  assert.ok(!Array.isArray(cutoffs));
  assert.deepEqual(Object.keys(cutoffs), ["2", "10"]);
  assert.equal(cutoffs["2"].length, BANDORI_CUTOFF_HISTORY_MAX_ROWS - 1);
  assert.equal(cutoffs["10"].length, 1);
});

test("a lone song ID zero keeps the legacy array response", () => {
  const targetQuery = query({ type: "song" });
  const payload = {
    schemaVersion: 1,
    kind: "song",
    server: "cn",
    eventId: targetQuery.targetId,
    tiers: { [targetQuery.tier]: { 0: [[1000, 10], [2000, 20, 1]] } },
  };
  const parsed = parseBandoriCutoffHistoryPack(payload, targetQuery, descriptor(targetQuery));
  assert.deepEqual(selectBandoriCutoffHistoryCutoffs(parsed, targetQuery.tier), [
    { time: 1000, ep: 10 },
    { time: 2000, ep: 20, isFinal: true },
  ]);
});
