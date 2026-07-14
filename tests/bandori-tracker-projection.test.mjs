import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateBandoriTrackerSpeeds,
  INSTANT_SPEED_MIN_WINDOW_MS,
} from "../src/lib/bandori-tracker-projection.ts";

test("instant speed uses the newest point at least four minutes thirty seconds behind", () => {
  const minute = 60_000;
  const points = calculateBandoriTrackerSpeeds([
    { time: 0, ep: 0 },
    { time: 30_000, ep: 50 },
    { time: INSTANT_SPEED_MIN_WINDOW_MS, ep: 900 },
    { time: 5 * minute, ep: 1_000 },
  ]);

  assert.equal(points[1].speed, undefined);
  assert.equal(points[2].speed, 12_000);
  // At 05:00, the 00:30 point is the nearest eligible reference (exactly 04:30 ago).
  assert.equal(points[3].speed, 12_667);
});

test("instant speed remains unavailable until the minimum window and preserves zero speed", () => {
  const points = calculateBandoriTrackerSpeeds([
    { time: 0, ep: 1_000 },
    { time: INSTANT_SPEED_MIN_WINDOW_MS - 1, ep: 1_000 },
    { time: INSTANT_SPEED_MIN_WINDOW_MS, ep: 1_000 },
  ]);

  assert.equal(points[1].speed, undefined);
  assert.equal(points[2].speed, 0);
});
