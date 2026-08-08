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

test("Event Tracker retires T1/T10 in every mode without changing the compatibility API", () => {
  for (const mode of ["event", "song", "monthly"]) {
    assert.deepEqual(getEventTrackerTiersForMode(mode).slice(0, 3), [20, 30, 40]);
    assert.strictEqual(getEventTrackerTiersForMode(mode), getEventTrackerTiersForMode(mode));
    assert.equal(isSupportedTrackerTier(mode, 1), true);
    assert.equal(isSupportedTrackerTier(mode, 10), true);
  }

  assert.strictEqual(getEventTrackerTiersForMode("event"), EVENT_TRACKER_TIERS);
});

test("all tracker modes accept TOP10 and reject retired UI tiers", () => {
  for (const mode of ["event", "song", "monthly"]) {
    assert.equal(
      normalizeTrackerRankingForMode(mode, TOP10_RANKING_SELECTION),
      TOP10_RANKING_SELECTION,
    );
    assert.equal(normalizeTrackerRankingForMode(mode, "1"), null);
    assert.equal(normalizeTrackerRankingForMode(mode, "10"), null);
    assert.equal(normalizeTrackerRankingForMode(mode, "20"), 20);
  }
});
