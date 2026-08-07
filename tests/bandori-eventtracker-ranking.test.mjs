import assert from "node:assert/strict";
import test from "node:test";

import {
  EVENT_TRACKER_TIERS,
  getEventTrackerTiersForMode,
} from "../src/app/[locale]/bandori/events/constants.ts";
import {
  normalizeTrackerRankingForMode,
  TOP10_RANKING_SELECTION,
} from "../src/app/[locale]/bandori/events/tracker-tier-preference.ts";
import { isSupportedTrackerTier } from "../src/lib/bandori-tracker-tiers.ts";

test("Event Tracker retires event T1/T10 without changing the compatibility API", () => {
  assert.deepEqual(getEventTrackerTiersForMode("event").slice(0, 3), [20, 30, 40]);
  assert.equal(getEventTrackerTiersForMode("song").includes(1), true);
  assert.equal(getEventTrackerTiersForMode("song").includes(10), true);
  assert.equal(getEventTrackerTiersForMode("monthly").includes(1), true);
  assert.equal(getEventTrackerTiersForMode("monthly").includes(10), true);
  assert.strictEqual(getEventTrackerTiersForMode("event"), EVENT_TRACKER_TIERS);
  assert.strictEqual(getEventTrackerTiersForMode("event"), getEventTrackerTiersForMode("event"));

  assert.equal(isSupportedTrackerTier("event", 1), true);
  assert.equal(isSupportedTrackerTier("event", 10), true);
});

test("event ranking accepts TOP10 and rejects retired URL or preference tiers", () => {
  assert.equal(
    normalizeTrackerRankingForMode("event", TOP10_RANKING_SELECTION),
    TOP10_RANKING_SELECTION,
  );
  assert.equal(normalizeTrackerRankingForMode("event", "1"), null);
  assert.equal(normalizeTrackerRankingForMode("event", "10"), null);
  assert.equal(normalizeTrackerRankingForMode("event", "20"), 20);
  assert.equal(normalizeTrackerRankingForMode("song", TOP10_RANKING_SELECTION), null);
  assert.equal(normalizeTrackerRankingForMode("song", "1"), 1);
});
