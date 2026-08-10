import assert from "node:assert/strict";
import test from "node:test";

import {
  BANDORI_TRACKER_TOPDATA_LIVE_EVENT,
  buildBandoriTrackerTopDataLiveTopic,
  mergeBandoriTopDataHistoryWithLiveSnapshot,
  mergeBandoriTrackerTopDataLiveSnapshots,
  parseBandoriTrackerTopDataLiveSnapshot,
} from "../src/lib/bandori/event-tracker/topdata-live-contract.ts";
import { BANDORI_TRACKER_TOPDATA_LATEST_TABLE } from "../src/lib/supabase-table-names.ts";

function snapshot(revision, publishedAt = 1_785_501_041_920, count = 10) {
  const targetId = 318;
  return {
    schemaVersion: 1,
    server: "cn",
    namespace: "events",
    targetId,
    revision,
    sampleId: `cn:topdata:events:${targetId}:${publishedAt}`,
    publishedAt,
    points: Array.from({ length: count }, (_, index) => ({
      time: publishedAt,
      uid: 1_001 + index,
      value: 1_000_000 - index,
    })),
    users: Array.from({ length: count }, (_, index) => ({
      uid: 1_001 + index,
      name: `Player ${index + 1}`,
      introduction: "",
      rank: 300,
      sid: 1_801 + index,
      strained: index % 2,
      degrees: [8_508, 20_094],
    })),
  };
}

test("builds the private TOP10 topic and event contract", () => {
  assert.equal(buildBandoriTrackerTopDataLiveTopic(318), "bandori:topdata:cn:events:318");
  assert.equal(BANDORI_TRACKER_TOPDATA_LIVE_EVENT, "topdata_snapshot");
  assert.equal(
    BANDORI_TRACKER_TOPDATA_LATEST_TABLE,
    "bandori_tracker_topdata_latest_snapshots",
  );
});

test("parses complete live snapshots and merges by revision", () => {
  const first = parseBandoriTrackerTopDataLiveSnapshot(snapshot(1));
  const second = parseBandoriTrackerTopDataLiveSnapshot(snapshot(2, first.publishedAt + 30_000));
  assert.equal(mergeBandoriTrackerTopDataLiveSnapshots(first, second), second);
  assert.equal(mergeBandoriTrackerTopDataLiveSnapshots(second, first), second);
});

test("accepts one through ten live entries and rejects zero or eleven", () => {
  for (const count of [1, 3, 9, 10]) {
    assert.equal(
      parseBandoriTrackerTopDataLiveSnapshot(snapshot(1, 1_785_501_041_920, count)).points.length,
      count,
    );
  }

  assert.throws(
    () => parseBandoriTrackerTopDataLiveSnapshot(snapshot(1, 1_785_501_041_920, 0)),
    /one complete current sample/u,
  );
  assert.throws(
    () => parseBandoriTrackerTopDataLiveSnapshot(snapshot(1, 1_785_501_041_920, 11)),
    /between one and ten|one complete current sample/u,
  );
});

test("rejects conflicting equal revisions and sample identity mismatches", () => {
  const first = parseBandoriTrackerTopDataLiveSnapshot(snapshot(1));
  const changed = structuredClone(first);
  changed.points[0].value += 1;
  assert.throws(() => mergeBandoriTrackerTopDataLiveSnapshots(first, changed), /Conflicting/u);

  const invalid = snapshot(1);
  invalid.sampleId = "cn:topdata:events:318:1";
  assert.throws(() => parseBandoriTrackerTopDataLiveSnapshot(invalid), /sampleId/u);
});

test("appends a newer live sample and refreshes current player profiles", () => {
  const live = parseBandoriTrackerTopDataLiveSnapshot(snapshot(2, 1_785_501_071_920, 2));
  live.users[0].name = "Updated player";
  const history = {
    points: [{ time: 1_785_501_041_920, uid: 1_001, value: 900_000 }],
    users: [{ ...snapshot(1, 1_785_501_041_920, 1).users[0], name: "Old player" }],
  };

  const merged = mergeBandoriTopDataHistoryWithLiveSnapshot(history, live);

  assert.equal(merged.points.length, 3);
  assert.equal(merged.points.at(-1).time, live.publishedAt);
  assert.equal(merged.users.find((user) => user.uid === 1_001).name, "Updated player");
  assert.deepEqual(merged.users.map((user) => user.uid), [1_001, 1_002]);
});

test("replaces an equal-time sample and drops users no longer referenced by history", () => {
  const publishedAt = 1_785_501_041_920;
  const live = parseBandoriTrackerTopDataLiveSnapshot(snapshot(2, publishedAt, 1));
  const old = snapshot(1, publishedAt, 2);
  const merged = mergeBandoriTopDataHistoryWithLiveSnapshot(
    { points: old.points, users: old.users },
    live,
  );

  assert.deepEqual(merged.points, live.points);
  assert.deepEqual(merged.users, live.users);
});

test("ignores a live sample older than the latest historical sample", () => {
  const live = parseBandoriTrackerTopDataLiveSnapshot(snapshot(1, 1_785_501_041_920, 1));
  const newer = snapshot(2, live.publishedAt + 30_000, 1);
  const history = { points: newer.points, users: newer.users };

  assert.equal(mergeBandoriTopDataHistoryWithLiveSnapshot(history, live), history);
});
