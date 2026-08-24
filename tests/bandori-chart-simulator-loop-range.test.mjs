import assert from "node:assert/strict";
import test from "node:test";
import {
  clearBandoriChartLoopPoint,
  createBandoriChartLoopPoints,
  createBandoriTimeLoopRange,
  getBandoriChartLoopRange,
  setBandoriChartLoopPoint,
} from "../src/lib/bandori/chart-simulator/loop-range.ts";

test("clearing one loop point preserves the other and disables the range", () => {
  const complete = { endTimeSeconds: 6, startTimeSeconds: 2 };
  const withoutA = clearBandoriChartLoopPoint(complete, "start");
  assert.deepEqual(withoutA, { endTimeSeconds: 6, startTimeSeconds: null });
  assert.equal(getBandoriChartLoopRange(withoutA), null);

  const withoutB = clearBandoriChartLoopPoint(complete, "end");
  assert.deepEqual(withoutB, { endTimeSeconds: null, startTimeSeconds: 2 });
  assert.equal(getBandoriChartLoopRange(withoutB), null);
  assert.equal(clearBandoriChartLoopPoint(withoutB, "end"), withoutB);
});

test("loop points stay incomplete until both A and B are set", () => {
  const empty = createBandoriChartLoopPoints();
  assert.deepEqual(empty, { endTimeSeconds: null, startTimeSeconds: null });
  assert.equal(getBandoriChartLoopRange(empty), null);

  const onlyA = setBandoriChartLoopPoint(empty, 8, "start", 1.125);
  assert.deepEqual(onlyA, { endTimeSeconds: null, startTimeSeconds: 1.125 });
  assert.equal(getBandoriChartLoopRange(onlyA), null);

  const complete = setBandoriChartLoopPoint(onlyA, 8, "end", 6.875);
  assert.deepEqual(getBandoriChartLoopRange(complete), {
    endTimeSeconds: 6.875,
    startTimeSeconds: 1.125,
  });
});

test("setting either loop point across the opposite point sorts the range", () => {
  const empty = createBandoriChartLoopPoints();
  const onlyA = setBandoriChartLoopPoint(empty, 8, "start", 5);
  assert.deepEqual(setBandoriChartLoopPoint(onlyA, 8, "end", 2), {
    endTimeSeconds: 5,
    startTimeSeconds: 2,
  });

  const onlyB = setBandoriChartLoopPoint(empty, 8, "end", 2);
  assert.deepEqual(setBandoriChartLoopPoint(onlyB, 8, "start", 5), {
    endTimeSeconds: 5,
    startTimeSeconds: 2,
  });
});

test("equal loop points expand to one reference frame with an end-of-song fallback", () => {
  const empty = createBandoriChartLoopPoints();
  const onlyA = setBandoriChartLoopPoint(empty, 8, "start", 3);
  const middleRange = setBandoriChartLoopPoint(onlyA, 8, "end", 3);
  assert.equal(middleRange.startTimeSeconds, 3);
  assert.ok(Math.abs(middleRange.endTimeSeconds - (3 + 1 / 60)) < 1e-12);

  const onlyBAtEnd = setBandoriChartLoopPoint(empty, 8, "end", 8);
  const endRange = setBandoriChartLoopPoint(onlyBAtEnd, 8, "start", 8);
  assert.equal(endRange.endTimeSeconds, 8);
  assert.ok(Math.abs(endRange.startTimeSeconds - (8 - 1 / 60)) < 1e-12);
});

test("explicit loop ranges still reject invalid external values", () => {
  assert.deepEqual(createBandoriTimeLoopRange(8, 1.125, 6.875), {
    endTimeSeconds: 6.875,
    startTimeSeconds: 1.125,
  });
  assert.throws(() => createBandoriTimeLoopRange(8, 3, 3), RangeError);
  assert.throws(() => createBandoriTimeLoopRange(8, -1, 3), RangeError);
  assert.throws(() => createBandoriTimeLoopRange(8, 1, 9), RangeError);
});
