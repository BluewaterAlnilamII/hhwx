import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateBandoriTrackerSpeeds,
  DAY_SPEED_MIN_WINDOW_MS,
  INSTANT_SPEED_MIN_WINDOW_MS,
} from "../src/lib/bandori-tracker-projection.ts";

test("instant speed uses the newest point at least nine minutes forty-five seconds behind", () => {
  const points = calculateBandoriTrackerSpeeds([
    { time: 0, ep: 0 },
    { time: 15_000, ep: 50 },
    { time: INSTANT_SPEED_MIN_WINDOW_MS, ep: 1_950 },
    { time: 10 * 60_000, ep: 2_000 },
  ]);

  assert.equal(points[1].speed, undefined);
  assert.equal(points[2].speed, 12_000);
  // At 10:00, the 00:15 point is the nearest eligible reference (exactly 09:45 ago).
  assert.equal(points[3].speed, 12_000);
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

test("both speeds use the EP=0 event baseline before their minimum windows", () => {
  const points = calculateBandoriTrackerSpeeds([
    { time: 0, ep: 0, isBaseline: true },
    { time: 5 * 60_000, ep: 1_000 },
  ]);

  assert.equal(points[0].speed, undefined);
  assert.equal(points[0].speed24, undefined);
  assert.equal(points[1].speed, 12_000);
  assert.equal(points[1].speed24, 288_000);
});

test("24-hour speed switches to the newest eligible real point", () => {
  const points = calculateBandoriTrackerSpeeds([
    { time: 0, ep: 0, isBaseline: true },
    { time: 60 * 60_000, ep: 24_000 },
    { time: 60 * 60_000 + DAY_SPEED_MIN_WINDOW_MS, ep: 598_000 },
  ]);

  assert.equal(points[1].speed24, 576_000);
  assert.equal(points[2].speed24, 576_000);
  assert.equal(points[2].refSpeed24, 576_000);
});
