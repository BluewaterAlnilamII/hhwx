import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EVENT_TRACKER_TIERS,
  getEventTrackerTiersForMode,
} from "../src/app/[locale]/bandori/events/_tracker/constants.ts";
import {
  normalizeTrackerRankingForMode,
  TOP10_RANKING_SELECTION,
} from "../src/app/[locale]/bandori/events/_tracker/tracker-tier-preference.ts";
import {
  isSongRankingDisabledEventType,
  resolveMainTrackerTier,
} from "../src/app/[locale]/bandori/events/_tracker/tracker-model.ts";
import { isSupportedTrackerTier } from "../src/lib/bandori-tracker-tiers.ts";

const trackerPageSource = readFileSync(
  new URL("../src/app/[locale]/bandori/events/EventTrackerPage.tsx", import.meta.url),
  "utf8",
);
const modeTierControlsSource = readFileSync(
  new URL("../src/app/[locale]/bandori/events/_tracker/TrackerModeTierControls.tsx", import.meta.url),
  "utf8",
);

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

test("legacy CN T1500 fallback remains scoped to the affected event range", () => {
  assert.equal(resolveMainTrackerTier(3, "event", 312, 1500), 1000);
  assert.equal(resolveMainTrackerTier(3, "event", 311, 1500), 1500);
  assert.equal(resolveMainTrackerTier(0, "event", 312, 1500), 1500);
  assert.equal(resolveMainTrackerTier(3, "monthly", 312, 1500), 1500);
});

test("song ranking availability remains event-type driven", () => {
  assert.equal(isSongRankingDisabledEventType("story"), true);
  assert.equal(isSongRankingDisabledEventType("challenge"), false);
  assert.equal(isSongRankingDisabledEventType(null), false);
});

test("mode tabs use Radix state styling without a measured indicator", () => {
  assert.match(modeTierControlsSource, /data-\[state=active\]:bg-/u);
  assert.doesNotMatch(modeTierControlsSource, /modeIndicator|getBoundingClientRect|ResizeObserver|requestAnimationFrame/u);
  assert.doesNotMatch(trackerPageSource, /modeIndicator|modeTabsListRef|modeTriggerRefs|updateModeIndicator/u);
});
