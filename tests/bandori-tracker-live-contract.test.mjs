import assert from "node:assert/strict";
import test from "node:test";

import {
  bandoriTrackerMonthIdToPeriod,
  buildBandoriTrackerLiveTopic,
  mergeBandoriTrackerLiveSnapshots,
  parseBandoriTrackerLiveSnapshot,
} from "../src/lib/bandori-tracker-live-contract.ts";

const eventPayload = {
  schemaVersion: 1,
  server: "cn",
  namespace: "events",
  targetId: 316,
  revision: 42,
  sampleId: "cn:events:316:1780000000000",
  publishedAt: 1780000000000,
  event: [
    [100, 1780000000000, 123456],
    [1000, 1780000000000, 112233, 3],
  ],
  songs: [[123, 100, 1780000000000, 654321]],
};

test("parses event/song points and interprets only the final flag bit", () => {
  const parsed = parseBandoriTrackerLiveSnapshot(eventPayload, {
    server: "cn",
    namespace: "events",
    targetId: 316,
  });

  assert.equal(parsed.revision, 42);
  assert.equal(parsed.event[0].isFinal, undefined);
  assert.equal(parsed.event[1].isFinal, true);
  assert.equal(parsed.songs[0].songId, 123);
});

test("rejects null/default flags and target mismatches", () => {
  assert.throws(
    () => parseBandoriTrackerLiveSnapshot({ ...eventPayload, event: [[100, 1, 1, null]] }),
    /flags/,
  );
  assert.throws(
    () => parseBandoriTrackerLiveSnapshot(eventPayload, {
      server: "cn",
      namespace: "events",
      targetId: 317,
    }),
    /does not match/,
  );
  assert.throws(
    () => parseBandoriTrackerLiveSnapshot({
      ...eventPayload,
      event: [[100, eventPayload.publishedAt + 1, 123456]],
    }),
    /cannot exceed publishedAt/,
  );
  assert.throws(
    () => parseBandoriTrackerLiveSnapshot({ ...eventPayload, period: "2026-07" }),
    /must not contain period/,
  );
  assert.throws(
    () => parseBandoriTrackerLiveSnapshot({
      ...eventPayload,
      publishedAt: Number.MAX_SAFE_INTEGER + 1,
      sampleId: `cn:events:316:${Number.MAX_SAFE_INTEGER + 1}`,
    }),
    /revision and publishedAt/,
  );
  assert.throws(
    () => parseBandoriTrackerLiveSnapshot({
      ...eventPayload,
      event: [...eventPayload.event].reverse(),
    }),
    /canonical/,
  );
});

test("revision merge ignores duplicate and out-of-order snapshots", () => {
  const current = parseBandoriTrackerLiveSnapshot(eventPayload);
  const stale = parseBandoriTrackerLiveSnapshot({
    ...eventPayload,
    revision: 41,
    sampleId: "cn:events:316:1779999999000",
    publishedAt: 1779999999000,
    event: [[100, 1779999999000, 120000]],
    songs: [[123, 100, 1779999999000, 650000]],
  });
  const newer = parseBandoriTrackerLiveSnapshot({
    ...eventPayload,
    revision: 43,
    sampleId: "cn:events:316:1780000060000",
    publishedAt: 1780000060000,
    event: [[100, 1780000060000, 124000]],
  });

  assert.equal(mergeBandoriTrackerLiveSnapshots(current, stale), current);
  assert.equal(mergeBandoriTrackerLiveSnapshots(current, current), current);
  assert.equal(mergeBandoriTrackerLiveSnapshots(current, newer), newer);
  const conflicting = parseBandoriTrackerLiveSnapshot({
    ...eventPayload,
    event: [[100, 1780000000000, 999999]],
  });
  assert.throws(
    () => mergeBandoriTrackerLiveSnapshots(current, conflicting),
    /same revision/,
  );
});

test("monthly target derives the source period and private topic", () => {
  const period = bandoriTrackerMonthIdToPeriod(18);
  assert.equal(period, "2026-07");
  assert.equal(
    buildBandoriTrackerLiveTopic({ server: "cn", namespace: "monthly", targetId: 18, period }),
    "bandori:cutoff:cn:monthly:2026-07",
  );
});
