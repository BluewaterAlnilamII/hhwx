import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceBandoriEffectAnimationClock,
} from "../src/lib/bandori/chart-simulator/effect-animation-clock.ts";

const baseInput = {
  animationTimeSeconds: 4,
  isPlaying: true,
  playbackRate: 1,
  presentationTimeSeconds: 10.02,
  previousPresentationTimeSeconds: 10,
  previousTimelineVersion: 3,
  timelineVersion: 3,
};

test("effect animation converts adjacent media progress to 1x wall-clock time", () => {
  const regular = advanceBandoriEffectAnimationClock(baseInput);
  assert.ok(Math.abs(regular.animationDeltaSeconds - 0.02) < 1e-12);
  assert.ok(Math.abs(regular.animationTimeSeconds - 4.02) < 1e-12);
  assert.equal(regular.didResetTimeline, false);

  const slowPlayback = advanceBandoriEffectAnimationClock({
    ...baseInput,
    playbackRate: 0.5,
    presentationTimeSeconds: 10.01,
  });
  assert.ok(Math.abs(slowPlayback.animationDeltaSeconds - 0.02) < 1e-12);
  assert.ok(Math.abs(slowPlayback.animationTimeSeconds - 4.02) < 1e-12);
});

test("paused media freezes effect animation without resetting its clock", () => {
  assert.deepEqual(
    advanceBandoriEffectAnimationClock({
      ...baseInput,
      isPlaying: false,
    }),
    {
      animationDeltaSeconds: 0,
      animationTimeSeconds: 4,
      didResetTimeline: false,
    },
  );
});

test("timeline changes and backward media jumps reset without replaying skipped time", () => {
  const forwardSeek = advanceBandoriEffectAnimationClock({
    ...baseInput,
    presentationTimeSeconds: 25,
    timelineVersion: 4,
  });
  assert.deepEqual(forwardSeek, {
    animationDeltaSeconds: 0,
    animationTimeSeconds: 0,
    didResetTimeline: true,
  });

  const backwardJump = advanceBandoriEffectAnimationClock({
    ...baseInput,
    presentationTimeSeconds: 9,
  });
  assert.deepEqual(backwardJump, {
    animationDeltaSeconds: 0,
    animationTimeSeconds: 0,
    didResetTimeline: true,
  });
});
