import assert from "node:assert/strict";
import test from "node:test";
import { compileBandoriChart } from "../src/lib/bandori/chart-simulator/compiler.ts";
import {
  createBandoriFullSongLoopRange,
  createBandoriTimeLoopRange,
  isBandoriTimeInsideLoopRange,
  resolveBandoriNoteLoopRange,
} from "../src/lib/bandori/chart-simulator/loop-range.ts";

const compiled = compileBandoriChart([
  { type: "BPM", beat: 0, bpm: 60 },
  { type: "Single", beat: 1, lane: 0 },
  { type: "Single", beat: 2, lane: 1 },
  { type: "Single", beat: 2, lane: 5 },
  { type: "Single", beat: 3, lane: 2 },
  { type: "Single", beat: 4, lane: 3 },
], { mediaDurationSeconds: 8 });

test("time loop ranges preserve exact user media times and use half-open membership", () => {
  assert.deepEqual(createBandoriTimeLoopRange(8, 1.125, 6.875), {
    endTimeSeconds: 6.875,
    startTimeSeconds: 1.125,
  });
  assert.deepEqual(createBandoriFullSongLoopRange(8), {
    endTimeSeconds: 8,
    startTimeSeconds: 0,
  });
  assert.equal(isBandoriTimeInsideLoopRange({ startTimeSeconds: 1, endTimeSeconds: 2 }, 1), true);
  assert.equal(isBandoriTimeInsideLoopRange({ startTimeSeconds: 1, endTimeSeconds: 2 }, 2), false);
  assert.throws(() => createBandoriTimeLoopRange(8, 3, 3), RangeError);
  assert.throws(() => createBandoriTimeLoopRange(8, -1, 3), RangeError);
  assert.throws(() => createBandoriTimeLoopRange(8, 1, 9), RangeError);
});

test("Note loop ranges expand simultaneous groups and derive judgment-free boundaries", () => {
  assert.deepEqual(resolveBandoriNoteLoopRange(compiled, 3, 4), {
    endTimeSeconds: 4,
    normalizedEndNoteNumber: 4,
    normalizedStartNoteNumber: 2,
    startTimeSeconds: 1.5,
  });
  assert.deepEqual(resolveBandoriNoteLoopRange(compiled, 2, 3), {
    endTimeSeconds: 3,
    normalizedEndNoteNumber: 3,
    normalizedStartNoteNumber: 2,
    startTimeSeconds: 1.5,
  });
  assert.deepEqual(resolveBandoriNoteLoopRange(compiled, 1, 5), {
    endTimeSeconds: 8,
    normalizedEndNoteNumber: 5,
    normalizedStartNoteNumber: 1,
    startTimeSeconds: 0,
  });
  assert.throws(() => resolveBandoriNoteLoopRange(compiled, 0, 2), RangeError);
  assert.throws(() => resolveBandoriNoteLoopRange(compiled, 4, 3), RangeError);
  assert.throws(() => resolveBandoriNoteLoopRange(compiled, 1, 6), RangeError);
});
