import assert from "node:assert/strict";
import test from "node:test";
import {
  BANDORI_COMPILED_NOTE_FLAG,
  BANDORI_COMPILED_NOTE_KIND,
  compileBandoriChart,
} from "../src/lib/bandori/chart-simulator/compiler.ts";
import {
  BANDORI_NATIVE_LONG_RELEASE_GREAT_BOUNDARY_SECONDS,
  BANDORI_NATIVE_LONG_RELEASE_PERFECT_BOUNDARY_SECONDS,
  BANDORI_NATIVE_JUDGMENT_ADJUST_VALUE_B,
  BANDORI_NATIVE_SLIDE_FLICK_SLOW_TIMEOUT_SECONDS,
  BANDORI_NATIVE_STANDARD_GREAT_BOUNDARY_SECONDS,
  BANDORI_NATIVE_STANDARD_PERFECT_BOUNDARY_SECONDS,
  BANDORI_NATIVE_JUDGMENT_FRAME_SECONDS,
  BANDORI_NATIVE_SLIDE_SLOW_TIMEOUT_SECONDS,
  BANDORI_NATIVE_STANDARD_TRIGGER_BOUNDARY_SECONDS,
  classifyBandoriNativeLongReleaseJudgment,
  classifyBandoriNativeStandardJudgment,
  collectBandoriNativeJudgmentWindowSegments,
  isBandoriNativeStandardPressTriggerable,
  prepareBandoriNativeJudgmentWindowCandidates,
} from "../src/lib/bandori/chart-simulator/native-judgment-window-presentation.ts";
import {
  prepareBandoriNativeChartVisuals,
  projectBandoriNativeTimelinePosition,
} from "../src/lib/bandori/chart-simulator/native-note-presentation.ts";

const closeTo = (actual, expected, epsilon = 1e-12) => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`,
  );
};

const standardCandidate = (noteIndex, timeSeconds, buttons = [3]) => ({
  buttons,
  isSlideHead: false,
  isSlideMiddle: false,
  noteIndex,
  slideSlowMidpointTimeSeconds: null,
  slideTailKind: "none",
  timingKind: "standardPress",
  timeSeconds,
});

const longReleaseCandidate = (noteIndex, timeSeconds, buttons = [3]) => ({
  buttons,
  isSlideHead: false,
  isSlideMiddle: false,
  noteIndex,
  slideSlowMidpointTimeSeconds: null,
  slideTailKind: "none",
  timingKind: "longRelease",
  timeSeconds,
});

const slideCandidate = (
  noteIndex,
  timeSeconds,
  {
    buttons = [3],
    isSlideHead = false,
    isSlideMiddle = false,
    slideSlowMidpointTimeSeconds = null,
    slideTailKind = "plain",
  } = {},
) => ({
  buttons,
  isSlideHead,
  isSlideMiddle,
  noteIndex,
  slideSlowMidpointTimeSeconds,
  slideTailKind,
  timingKind: "slidePosition",
  timeSeconds,
});

test("standard judgment classification preserves midpoint-to-even boundaries", () => {
  const perfect = BANDORI_NATIVE_STANDARD_PERFECT_BOUNDARY_SECONDS;
  const great = BANDORI_NATIVE_STANDARD_GREAT_BOUNDARY_SECONDS;

  assert.equal(classifyBandoriNativeStandardJudgment(perfect), "perfect");
  assert.equal(classifyBandoriNativeStandardJudgment(-perfect), "perfect");
  assert.equal(classifyBandoriNativeStandardJudgment(perfect + 1e-12), "great");
  assert.equal(classifyBandoriNativeStandardJudgment(-perfect - 1e-12), "great");
  assert.equal(classifyBandoriNativeStandardJudgment(great - 1e-12), "great");
  assert.equal(classifyBandoriNativeStandardJudgment(great), "good");
  assert.equal(classifyBandoriNativeStandardJudgment(Number.NaN), "none");
});

test("Long release classification applies the confirmed sweetFrame=1 boundaries", () => {
  const perfect = BANDORI_NATIVE_LONG_RELEASE_PERFECT_BOUNDARY_SECONDS;
  const great = BANDORI_NATIVE_LONG_RELEASE_GREAT_BOUNDARY_SECONDS;

  assert.equal(classifyBandoriNativeLongReleaseJudgment(perfect - 1e-12), "perfect");
  assert.equal(classifyBandoriNativeLongReleaseJudgment(-perfect + 1e-12), "perfect");
  assert.equal(classifyBandoriNativeLongReleaseJudgment(perfect), "great");
  assert.equal(classifyBandoriNativeLongReleaseJudgment(great), "great");
  assert.equal(classifyBandoriNativeLongReleaseJudgment(great + 1e-12), "good");
});

test("standard press acquisition excludes both 7.5-frame boundaries", () => {
  const boundary = BANDORI_NATIVE_STANDARD_TRIGGER_BOUNDARY_SECONDS;

  assert.equal(isBandoriNativeStandardPressTriggerable(boundary - 1e-12), true);
  assert.equal(isBandoriNativeStandardPressTriggerable(-boundary + 1e-12), true);
  assert.equal(isBandoriNativeStandardPressTriggerable(boundary), false);
  assert.equal(isBandoriNativeStandardPressTriggerable(-boundary), false);
  assert.equal(isBandoriNativeStandardPressTriggerable(Number.NaN), false);
});

test("Slide cross-type priority fixes JudgementAdjustValueB at zero", () => {
  assert.equal(BANDORI_NATIVE_JUDGMENT_ADJUST_VALUE_B, 0);
});

test("judgment candidates distinguish standard presses and Long releases", () => {
  const kinds = [
    BANDORI_COMPILED_NOTE_KIND.single,
    BANDORI_COMPILED_NOTE_KIND.directional,
    BANDORI_COMPILED_NOTE_KIND.longStart,
    BANDORI_COMPILED_NOTE_KIND.longEnd,
    BANDORI_COMPILED_NOTE_KIND.slide,
    BANDORI_COMPILED_NOTE_KIND.slide,
    BANDORI_COMPILED_NOTE_KIND.slide,
  ];
  const candidates = prepareBandoriNativeJudgmentWindowCandidates(
    {
      bpm: {
        beats: new Float64Array([0]),
        times: new Float64Array([0]),
        values: new Float64Array([60]),
      },
      notes: {
        beats: new Float64Array([1, 2, 3, 4, 5, 6, 7]),
        directions: new Int8Array(kinds.length),
        kinds: new Uint8Array(kinds),
        flags: new Uint16Array([
          0,
          0,
          BANDORI_COMPILED_NOTE_FLAG.ribbonStart,
          BANDORI_COMPILED_NOTE_FLAG.ribbonEnd,
          BANDORI_COMPILED_NOTE_FLAG.ribbonStart,
          0,
          BANDORI_COMPILED_NOTE_FLAG.ribbonEnd,
        ]),
        ribbonIndexes: new Int32Array([-1, -1, -1, -1, 0, 0, 0]),
        sourceNodeIndexes: new Int32Array([-1, -1, -1, -1, 0, 1, 2]),
        times: new Float64Array([1, 2, 3, 4, 5, 6, 7]),
      },
      ribbons: {
        connectionBeats: new Float64Array([5, 6, 7]),
        connectionFlags: new Uint16Array([0, 0, 0]),
        connectionOffsets: new Uint32Array([0, 3]),
        kinds: new Uint8Array([2]),
      },
    },
    {
      notes: kinds.map((_, noteIndex) => ({
        visuals: [{ coveredLanes: noteIndex === 0 ? [1, 2] : undefined, lane: 3 }],
      })),
    },
  );

  assert.deepEqual(
    candidates.map((candidate) => candidate
      ? [
        candidate.buttons,
        candidate.timingKind,
        candidate.isSlideMiddle,
        candidate.slideTailKind,
      ]
      : null),
    [
      [[1, 2], "standardPress", false, "none"],
      [[3], "standardPress", false, "none"],
      [[3], "standardPress", false, "none"],
      [[3], "longRelease", false, "none"],
      [[3], "slidePosition", false, "none"],
      [[3], "slidePosition", true, "none"],
      [[3], "slidePosition", false, "plain"],
    ],
  );
  assert.equal(candidates[4].isSlideHead, true);
  assert.equal(candidates[4].slideSlowMidpointTimeSeconds, 5.5);
  assert.equal(candidates[5].slideSlowMidpointTimeSeconds, 6.5);
  assert.equal(candidates[6].slideSlowMidpointTimeSeconds, null);
});

test("Slide Fast windows use the manual frame correction instead of Note Speed", () => {
  for (const correctionTenths of [0, 5, 10]) {
    const segments = collectBandoriNativeJudgmentWindowSegments({
      activeCandidates: [slideCandidate(0, 2)],
      noteSpeed: correctionTenths === 5 ? 12 : 1,
      showGreat: true,
      showPerfect: true,
      slideFrameCorrectionTenths: correctionTenths,
    });
    const perfect = segments.find((segment) => segment.category === "perfect");
    const [great] = segments.filter((segment) => segment.category === "great");
    const correctionFrames = correctionTenths / 10;
    assert.equal(segments.length, 2);
    assert.ok(perfect);
    assert.ok(great);
    assert.equal(perfect.timingKind, "slidePosition");
    closeTo(
      perfect.startTimeSeconds,
      2 - (2 + correctionFrames) * BANDORI_NATIVE_JUDGMENT_FRAME_SECONDS,
    );
    closeTo(
      perfect.endTimeSeconds,
      2 + BANDORI_NATIVE_SLIDE_SLOW_TIMEOUT_SECONDS,
    );
    closeTo(
      great.startTimeSeconds,
      2 - (5 + correctionFrames) * BANDORI_NATIVE_JUDGMENT_FRAME_SECONDS,
    );
    closeTo(great.endTimeSeconds, perfect.startTimeSeconds);
  }
});

test("Slide middle nodes combine the corrected Fast sliver with Slow Perfect", () => {
  const segments = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [slideCandidate(0, 2, { isSlideMiddle: true })],
    showGreat: true,
    showPerfect: true,
    slideFrameCorrectionTenths: 5,
  });

  assert.equal(segments.length, 1);
  assert.equal(segments[0].category, "perfect");
  closeTo(
    segments[0].startTimeSeconds,
    2 - 0.5 * BANDORI_NATIVE_JUDGMENT_FRAME_SECONDS,
  );
  closeTo(
    segments[0].endTimeSeconds,
    2 + BANDORI_NATIVE_SLIDE_SLOW_TIMEOUT_SECONDS,
  );
});

test("Slide gesture tails have no Fast window and use their confirmed Slow timeout", () => {
  for (const [slideTailKind, timeoutSeconds] of [
    ["flick", BANDORI_NATIVE_SLIDE_FLICK_SLOW_TIMEOUT_SECONDS],
    ["directional", BANDORI_NATIVE_SLIDE_SLOW_TIMEOUT_SECONDS],
  ]) {
    for (const correctionTenths of [0, 10]) {
      const segments = collectBandoriNativeJudgmentWindowSegments({
        activeCandidates: [slideCandidate(0, 2, { slideTailKind })],
        showGreat: true,
        showPerfect: true,
        slideFrameCorrectionTenths: correctionTenths,
      });

      assert.equal(segments.length, 1);
      assert.equal(segments[0].category, "perfect");
      closeTo(segments[0].startTimeSeconds, 2);
      closeTo(segments[0].endTimeSeconds, 2 + timeoutSeconds);
    }
  }
});

test("compiled Slide tails preserve plain, Flick, and Directional timing roles", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 60 },
    {
      type: "Slide",
      connections: [
        { beat: 1, lane: 0 },
        { beat: 2, lane: 1 },
      ],
    },
    {
      type: "Slide",
      connections: [
        { beat: 3, lane: 2 },
        { beat: 4, flick: true, lane: 3 },
      ],
    },
    {
      type: "Slide",
      connections: [
        { beat: 5, lane: 4 },
        { beat: 6, direction: "Left", flick: true, lane: 5 },
      ],
    },
  ]);
  const candidates = prepareBandoriNativeJudgmentWindowCandidates(
    compiled,
    prepareBandoriNativeChartVisuals(compiled, false),
  ).filter((candidate) => candidate?.slideTailKind !== "none");

  assert.deepEqual(
    candidates.map((candidate) => candidate.slideTailKind),
    ["plain", "flick", "directional"],
  );
});

test("Slide Fast frames scale with the visual clock while Slow timeout stays absolute", () => {
  const [perfect] = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [slideCandidate(0, 2)],
    approachTimeScale: 0.5,
    showGreat: false,
    showPerfect: true,
    slideFrameCorrectionTenths: 5,
  });

  closeTo(
    perfect.startTimeSeconds,
    2 - 2.5 * BANDORI_NATIVE_JUDGMENT_FRAME_SECONDS * 0.5,
  );
  closeTo(
    perfect.endTimeSeconds,
    2 + BANDORI_NATIVE_SLIDE_SLOW_TIMEOUT_SECONDS,
  );
});

test("Slide Slow Perfect stops at the earlier native timeout or visible-node midpoint", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 600 },
    { type: "BPM", beat: 4, bpm: 60 },
    {
      type: "Slide",
      connections: [
        { beat: 3.8, lane: 1 },
        { beat: 4, hidden: true, lane: 2 },
        { beat: 4.4, lane: 4 },
        { beat: 4.5, hidden: true, lane: 3 },
        { beat: 4.6, lane: 5 },
      ],
    },
    {
      type: "Slide",
      connections: [
        { beat: 5, lane: 0 },
        { beat: 6, lane: 0 },
      ],
    },
  ]);
  const visuals = prepareBandoriNativeChartVisuals(compiled, false);
  const candidates = prepareBandoriNativeJudgmentWindowCandidates(compiled, visuals)
    .filter((candidate) => candidate?.timingKind === "slidePosition");

  assert.equal(candidates.length, 5);
  closeTo(candidates[0].timeSeconds, 0.38);
  closeTo(candidates[0].slideSlowMidpointTimeSeconds, 0.5);
  closeTo(candidates[1].timeSeconds, 0.8);
  closeTo(candidates[1].slideSlowMidpointTimeSeconds, 0.9);
  assert.equal(candidates[2].slideSlowMidpointTimeSeconds, null);
  closeTo(candidates[3].slideSlowMidpointTimeSeconds, 1.9);
  assert.equal(candidates[4].slideSlowMidpointTimeSeconds, null);

  const slowEnds = candidates.map((candidate) => {
    const [perfect] = collectBandoriNativeJudgmentWindowSegments({
      activeCandidates: [candidate],
      showGreat: false,
      showPerfect: true,
    });
    return perfect.endTimeSeconds;
  });
  closeTo(slowEnds[0], 0.5);
  closeTo(slowEnds[1], 0.9);
  closeTo(slowEnds[2], 1 + BANDORI_NATIVE_SLIDE_SLOW_TIMEOUT_SECONDS);
  closeTo(slowEnds[3], 1.4 + BANDORI_NATIVE_SLIDE_SLOW_TIMEOUT_SECONDS);
  closeTo(slowEnds[4], 2.4 + BANDORI_NATIVE_SLIDE_SLOW_TIMEOUT_SECONDS);
});

test("Slide heads split acquisition by projected position while bound nodes stay independent", () => {
  const standard = standardCandidate(0, 1);
  const slideHead = slideCandidate(1, 1.08, { isSlideHead: true });
  const bothActive = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [standard, slideHead],
    noteSpeed: 10,
    showGreat: true,
    showPerfect: true,
  });
  const standardPerfect = bothActive.find((segment) => (
    segment.noteIndex === 0 && segment.category === "perfect"
  ));
  const slideFastGreat = bothActive.find((segment) => (
    segment.noteIndex === 1
    && segment.category === "great"
    && segment.endTimeSeconds < slideHead.timeSeconds
  ));
  assert.ok(standardPerfect);
  assert.ok(slideFastGreat);
  closeTo(standardPerfect.endTimeSeconds, slideFastGreat.startTimeSeconds);
  assert.notEqual(standardPerfect.endTimeSeconds, 1.04);

  const boundSlide = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [standard, slideCandidate(1, 1.04)],
    noteSpeed: 10,
    showGreat: false,
    showPerfect: true,
  }).find((segment) => segment.noteIndex === 1);
  assert.ok(boundSlide);
  closeTo(
    boundSlide.startTimeSeconds,
    1.04 - 2.5 * BANDORI_NATIVE_JUDGMENT_FRAME_SECONDS,
  );
  assert.ok(
    boundSlide.startTimeSeconds
      < standard.timeSeconds + BANDORI_NATIVE_STANDARD_PERFECT_BOUNDARY_SECONDS,
  );
});

test("candidates outside their trigger windows do not over-clip Slide heads", () => {
  const slideHead = slideCandidate(0, 62, {
    buttons: [0, 1, 2],
    isSlideHead: true,
    slideSlowMidpointTimeSeconds: 62.2,
  });
  const farStandard = standardCandidate(1, 62.6, [0]);
  const segments = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [slideHead, farStandard],
    noteSpeed: 10.5,
    showGreat: true,
    showPerfect: true,
    slideFrameCorrectionTenths: 5,
  });
  const slidePerfect = segments.find((segment) => (
    segment.noteIndex === slideHead.noteIndex && segment.category === "perfect"
  ));

  assert.ok(slidePerfect);
  closeTo(slidePerfect.endTimeSeconds, 62.2);
});

test("ownership begins when a competing standard Note becomes triggerable", () => {
  const slideHead = slideCandidate(0, 1, {
    isSlideHead: true,
  });
  const standard = standardCandidate(1, 1.3);
  const segments = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [slideHead, standard],
    noteSpeed: 10,
    showGreat: false,
    showPerfect: true,
    slideFrameCorrectionTenths: 5,
  });
  const slidePerfect = segments.find((segment) => (
    segment.noteIndex === slideHead.noteIndex && segment.category === "perfect"
  ));

  assert.ok(slidePerfect);
  closeTo(
    slidePerfect.endTimeSeconds,
    standard.timeSeconds - 7.5 * BANDORI_NATIVE_JUDGMENT_FRAME_SECONDS,
  );
});

test("Great-only rendering keeps two outer intervals independent from Perfect", () => {
  const [fast, slow] = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [standardCandidate(0, 1)],
    showGreat: true,
    showPerfect: false,
  });

  assert.equal(fast.category, "great");
  assert.equal(slow.category, "great");
  closeTo(
    fast.startTimeSeconds,
    1 - BANDORI_NATIVE_STANDARD_GREAT_BOUNDARY_SECONDS,
  );
  closeTo(
    fast.endTimeSeconds,
    1 - BANDORI_NATIVE_STANDARD_PERFECT_BOUNDARY_SECONDS,
  );
  closeTo(
    slow.startTimeSeconds,
    1 + BANDORI_NATIVE_STANDARD_PERFECT_BOUNDARY_SECONDS,
  );
  closeTo(
    slow.endTimeSeconds,
    1 + BANDORI_NATIVE_STANDARD_GREAT_BOUNDARY_SECONDS,
  );
});

test("Long release bands use wider intervals and remain independently finger-bound", () => {
  const first = longReleaseCandidate(0, 1);
  const second = longReleaseCandidate(1, 1.04);
  const segments = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [first, second, standardCandidate(2, 1.02)],
    showGreat: false,
    showPerfect: true,
  });

  const firstTail = segments.find((segment) => segment.noteIndex === first.noteIndex);
  const secondTail = segments.find((segment) => segment.noteIndex === second.noteIndex);
  assert.ok(firstTail);
  assert.ok(secondTail);
  closeTo(
    firstTail.endTimeSeconds,
    first.timeSeconds + BANDORI_NATIVE_LONG_RELEASE_PERFECT_BOUNDARY_SECONDS,
  );
  closeTo(
    secondTail.startTimeSeconds,
    second.timeSeconds - BANDORI_NATIVE_LONG_RELEASE_PERFECT_BOUNDARY_SECONDS,
  );
  assert.ok(firstTail.endTimeSeconds > secondTail.startTimeSeconds);

  const [greatFast, greatSlow] = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [first],
    showGreat: true,
    showPerfect: false,
  });
  closeTo(
    greatFast.startTimeSeconds,
    first.timeSeconds - BANDORI_NATIVE_LONG_RELEASE_GREAT_BOUNDARY_SECONDS,
  );
  closeTo(
    greatFast.endTimeSeconds,
    first.timeSeconds - BANDORI_NATIVE_LONG_RELEASE_PERFECT_BOUNDARY_SECONDS,
  );
  closeTo(
    greatSlow.startTimeSeconds,
    first.timeSeconds + BANDORI_NATIVE_LONG_RELEASE_PERFECT_BOUNDARY_SECONDS,
  );
  closeTo(
    greatSlow.endTimeSeconds,
    first.timeSeconds + BANDORI_NATIVE_LONG_RELEASE_GREAT_BOUNDARY_SECONDS,
  );
});

test("same-button ownership splits close notes and restores after the first clears", () => {
  const first = standardCandidate(0, 1);
  const second = standardCandidate(1, 1.04);
  const midpoint = 1.02;
  const bothActive = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [first, second],
    showGreat: false,
    showPerfect: true,
  });

  assert.equal(bothActive.length, 2);
  const firstSegment = bothActive.find((segment) => segment.noteIndex === 0);
  const secondSegment = bothActive.find((segment) => segment.noteIndex === 1);
  assert.ok(firstSegment);
  assert.ok(secondSegment);
  closeTo(firstSegment.endTimeSeconds, midpoint);
  closeTo(secondSegment.startTimeSeconds, midpoint);

  const afterFirstClears = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [second],
    minimumInputTimeSeconds: 1.001,
    showGreat: false,
    showPerfect: true,
  });
  assert.equal(afterFirstClears.length, 1);
  closeTo(afterFirstClears[0].startTimeSeconds, 1.001);
  assert.ok(afterFirstClears[0].startTimeSeconds < midpoint);
});

test("ownership is split per covered button for partially overlapping wide notes", () => {
  const wide = standardCandidate(0, 1, [1, 2]);
  const narrow = standardCandidate(1, 1.04, [2]);
  const segments = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [wide, narrow],
    showGreat: false,
    showPerfect: true,
  });

  const wideSegments = segments.filter((segment) => segment.noteIndex === 0);
  assert.equal(wideSegments.length, 2);
  assert.deepEqual(
    wideSegments.map(({ leftButton, rightButton }) => [leftButton, rightButton]),
    [[1, 1], [2, 2]],
  );
  closeTo(
    wideSegments[0].endTimeSeconds,
    wide.timeSeconds + BANDORI_NATIVE_STANDARD_PERFECT_BOUNDARY_SECONDS,
  );
  closeTo(wideSegments[1].endTimeSeconds, 1.02);
});

test("diagnostic timeline projection continues past the judgment line", () => {
  const atTarget = projectBandoriNativeTimelinePosition(3, 1, 1, 10);
  const afterTarget = projectBandoriNativeTimelinePosition(3, 1, 1.04, 10);
  const beforeSpawn = projectBandoriNativeTimelinePosition(3, 1, -0.1, 10);
  const atSpawn = projectBandoriNativeTimelinePosition(3, 1, 0, 10);

  assert.ok(afterTarget.progress > 1);
  assert.ok(afterTarget.screenY > atTarget.screenY);
  closeTo(beforeSpawn.progress, 0);
  closeTo(beforeSpawn.screenX, atSpawn.screenX);
  closeTo(beforeSpawn.screenY, atSpawn.screenY);
});
