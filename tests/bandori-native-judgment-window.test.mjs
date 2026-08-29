import assert from "node:assert/strict";
import test from "node:test";
import {
  BANDORI_COMPILED_NOTE_FLAG,
  BANDORI_COMPILED_NOTE_KIND,
  compileBandoriChart,
} from "../src/lib/bandori/chart-simulator/compiler.ts";
import {
  BANDORI_NATIVE_ADJACENT_LANE_COLLISION_RADIUS,
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
  collectBandoriNativeJudgmentWindowOutlineEdges,
  collectBandoriNativeJudgmentWindowOffsetLabels,
  collectBandoriNativeJudgmentWindowSegments,
  formatBandoriNativeJudgmentWindowOffsetFrames,
  isBandoriNativeStandardPressTriggerable,
  prepareBandoriNativeJudgmentWindowCandidates,
  prepareBandoriNativeJudgmentWindowPriorityIndex,
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

const standardCandidate = (
  noteIndex,
  timeSeconds,
  buttons = [3],
  positionBeat = timeSeconds,
) => ({
  buttons,
  isSlideHead: false,
  isSlideMiddle: false,
  noteIndex,
  positionBeat,
  slidePreviousScoringTimeSeconds: null,
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
  positionBeat: timeSeconds,
  slidePreviousScoringTimeSeconds: null,
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
    slidePreviousScoringTimeSeconds = null,
    slideSlowMidpointTimeSeconds = null,
    slideTailKind = "plain",
  } = {},
) => ({
  buttons,
  isSlideHead,
  isSlideMiddle,
  noteIndex,
  positionBeat: timeSeconds,
  slidePreviousScoringTimeSeconds,
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
  assert.equal(candidates[4].positionBeat, 5);
  assert.equal(candidates[4].slidePreviousScoringTimeSeconds, null);
  assert.equal(candidates[5].slidePreviousScoringTimeSeconds, 5);
  assert.equal(candidates[6].slidePreviousScoringTimeSeconds, 6);
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
  assert.equal(candidates[0].slidePreviousScoringTimeSeconds, null);
  closeTo(candidates[0].slideSlowMidpointTimeSeconds, 0.5);
  closeTo(candidates[1].timeSeconds, 0.8);
  closeTo(candidates[1].slidePreviousScoringTimeSeconds, 0.38);
  closeTo(candidates[1].slideSlowMidpointTimeSeconds, 0.9);
  closeTo(candidates[2].slidePreviousScoringTimeSeconds, 0.8);
  assert.equal(candidates[2].slideSlowMidpointTimeSeconds, null);
  assert.equal(candidates[3].slidePreviousScoringTimeSeconds, null);
  closeTo(candidates[3].slideSlowMidpointTimeSeconds, 1.9);
  closeTo(candidates[4].slidePreviousScoringTimeSeconds, 1.4);
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

test("Slide heads split acquisition while bound nodes stay out of priority selection", () => {
  const standard = standardCandidate(0, 1);
  const slideHead = slideCandidate(1, 1.08, { isSlideHead: true });
  const bothActive = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [standard, slideHead],
    noteSpeed: 10,
    showGreat: true,
    showPerfect: true,
    slideFrameCorrectionTenths: 5,
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
    slideFrameCorrectionTenths: 5,
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

test("bound Slide nodes cannot start before their previous visible scoring node", () => {
  const previousScoringTimeSeconds = 1;
  const plainTail = slideCandidate(1, 1.04, {
    slidePreviousScoringTimeSeconds: previousScoringTimeSeconds,
  });
  const tailSegments = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [plainTail],
    showGreat: true,
    showPerfect: true,
    slideFrameCorrectionTenths: 5,
  });

  assert.equal(tailSegments.length, 1);
  assert.equal(tailSegments[0].category, "perfect");
  closeTo(tailSegments[0].startTimeSeconds, previousScoringTimeSeconds);

  const middle = slideCandidate(2, 1.005, {
    isSlideMiddle: true,
    slidePreviousScoringTimeSeconds: previousScoringTimeSeconds,
  });
  const [middlePerfect] = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [middle],
    showGreat: true,
    showPerfect: true,
    slideFrameCorrectionTenths: 5,
  });

  assert.equal(middlePerfect.category, "perfect");
  closeTo(middlePerfect.startTimeSeconds, previousScoringTimeSeconds);
});

test("a distant candidate only clips the spatial portion owned through its button", () => {
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
  const slidePerfectSegments = segments.filter((segment) => (
    segment.noteIndex === slideHead.noteIndex && segment.category === "perfect"
  ));

  assert.equal(slidePerfectSegments.length, 2);
  const narrowedSlowRegion = slidePerfectSegments.find((segment) => (
    segment.startTimeSeconds > slideHead.timeSeconds
  ));
  assert.ok(narrowedSlowRegion);
  closeTo(narrowedSlowRegion.endTimeSeconds, 62.2);
  closeTo(
    narrowedSlowRegion.leftLane,
    1 - BANDORI_NATIVE_ADJACENT_LANE_COLLISION_RADIUS,
  );
});

test("future priority candidates compete only after their movement activation", () => {
  const slideHead = slideCandidate(61, 8.1, {
    buttons: [2],
    isSlideHead: true,
  });
  const futureStandard = standardCandidate(65, 8.85, [2]);
  const priorityIndex = prepareBandoriNativeJudgmentWindowPriorityIndex([
    slideHead,
    futureStandard,
  ]);
  const collectSlideSlowEnd = (noteSpeed) => {
    const segments = collectBandoriNativeJudgmentWindowSegments({
      activeCandidates: [slideHead],
      minimumInputTimeSeconds: 8.033,
      noteSpeed,
      priorityIndex,
      showGreat: false,
      showPerfect: true,
      slideFrameCorrectionTenths: 5,
    });
    return Math.max(
      ...segments
        .filter((segment) => segment.noteIndex === slideHead.noteIndex)
        .map((segment) => segment.endTimeSeconds),
    );
  };

  closeTo(collectSlideSlowEnd(10), 8.2396479028, 1e-9);
  closeTo(collectSlideSlowEnd(10.8), 8.25);
  closeTo(
    collectSlideSlowEnd(10.94),
    slideHead.timeSeconds + BANDORI_NATIVE_SLIDE_SLOW_TIMEOUT_SECONDS,
  );
  closeTo(
    collectSlideSlowEnd(12),
    slideHead.timeSeconds + BANDORI_NATIVE_SLIDE_SLOW_TIMEOUT_SECONDS,
  );
});

test("per-button selection happens before triggerability and can leave a blank gap", () => {
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
  const standardPerfect = segments.find((segment) => (
    segment.noteIndex === standard.noteIndex && segment.category === "perfect"
  ));

  assert.ok(slidePerfect);
  assert.ok(standardPerfect);
  assert.ok(
    slidePerfect.endTimeSeconds
      < standard.timeSeconds - BANDORI_NATIVE_STANDARD_TRIGGER_BOUNDARY_SECONDS,
  );
  closeTo(
    standardPerfect.startTimeSeconds,
    standard.timeSeconds - BANDORI_NATIVE_STANDARD_PERFECT_BOUNDARY_SECONDS,
  );
  assert.ok(slidePerfect.endTimeSeconds < standardPerfect.startTimeSeconds);
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

test("wide notes use circle unions and split spatial ownership at button midpoints", () => {
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
    wideSegments.map(({ leftLane, rightLane }) => [leftLane, rightLane]),
    [
      [
        1 - BANDORI_NATIVE_ADJACENT_LANE_COLLISION_RADIUS,
        2 + BANDORI_NATIVE_ADJACENT_LANE_COLLISION_RADIUS,
      ],
      [1 - BANDORI_NATIVE_ADJACENT_LANE_COLLISION_RADIUS, 1.5],
    ],
  );
  closeTo(wideSegments[0].endTimeSeconds, 1.02);
  closeTo(wideSegments[1].startTimeSeconds, 1.02);
  closeTo(
    wideSegments[1].endTimeSeconds,
    wide.timeSeconds + BANDORI_NATIVE_STANDARD_PERFECT_BOUNDARY_SECONDS,
  );
});

test("a single Note owns the full adjacent-lane collision diameter", () => {
  const [segment] = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [standardCandidate(0, 1, [3])],
    showGreat: false,
    showPerfect: true,
  });

  closeTo(
    segment.leftLane,
    3 - BANDORI_NATIVE_ADJACENT_LANE_COLLISION_RADIUS,
  );
  closeTo(
    segment.rightLane,
    3 + BANDORI_NATIVE_ADJACENT_LANE_COLLISION_RADIUS,
  );
});

test("an invisible nearer-button Bad blocks and then restores adjacent Perfect", () => {
  const segments = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [
      standardCandidate(0, 1, [0]),
      standardCandidate(1, 1.11, [1]),
    ],
    showGreat: false,
    showPerfect: true,
  });
  const adjacentPerfect = segments.filter((segment) => segment.noteIndex === 1);

  assert.equal(adjacentPerfect.length, 2);
  closeTo(adjacentPerfect[0].leftLane, 0.5);
  closeTo(
    adjacentPerfect[1].leftLane,
    1 - BANDORI_NATIVE_ADJACENT_LANE_COLLISION_RADIUS,
  );
  closeTo(
    adjacentPerfect[0].endTimeSeconds,
    1 + BANDORI_NATIVE_STANDARD_TRIGGER_BOUNDARY_SECONDS,
  );
  closeTo(
    adjacentPerfect[1].startTimeSeconds,
    adjacentPerfect[0].endTimeSeconds,
  );
});

test("standard ownership uses Beat midpoint across a BPM boundary", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 60 },
    { type: "BPM", beat: 2, bpm: 120 },
  ]);
  const segments = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [
      standardCandidate(0, 1.96, [3], 1.96),
      standardCandidate(1, 2.02, [3], 2.04),
    ],
    compiled,
    showGreat: false,
    showPerfect: true,
  });
  const first = segments.find((segment) => segment.noteIndex === 0);
  const second = segments.find((segment) => segment.noteIndex === 1);

  assert.ok(first);
  assert.ok(second);
  closeTo(first.endTimeSeconds, 2);
  closeTo(second.startTimeSeconds, 2);
});

test("one Note outline removes the shared edge between Perfect and Great fills", () => {
  const edges = collectBandoriNativeJudgmentWindowOutlineEdges([
    {
      category: "great",
      endTimeSeconds: 1,
      leftLane: 2,
      noteIndex: 0,
      rightLane: 4,
      startTimeSeconds: 0,
      timingKind: "standardPress",
    },
    {
      category: "perfect",
      endTimeSeconds: 2,
      leftLane: 2,
      noteIndex: 0,
      rightLane: 4,
      startTimeSeconds: 1,
      timingKind: "standardPress",
    },
  ]);

  assert.equal(
    edges.some((edge) => (
      edge.startTimeSeconds === 1
      && edge.endTimeSeconds === 1
    )),
    false,
  );
  assert.equal(edges.length, 6);
});

test("one Note outline keeps only the exposed part of a stepped split", () => {
  const edges = collectBandoriNativeJudgmentWindowOutlineEdges([
    {
      category: "perfect",
      endTimeSeconds: 1,
      leftLane: 1,
      noteIndex: 0,
      rightLane: 3,
      startTimeSeconds: 0,
      timingKind: "standardPress",
    },
    {
      category: "perfect",
      endTimeSeconds: 2,
      leftLane: 1,
      noteIndex: 0,
      rightLane: 2,
      startTimeSeconds: 1,
      timingKind: "standardPress",
    },
  ]);
  const middleEdges = edges.filter((edge) => (
    edge.startTimeSeconds === 1 && edge.endTimeSeconds === 1
  ));

  assert.deepEqual(
    middleEdges.map((edge) => [edge.startLane, edge.endLane]),
    [[2, 3]],
  );
});

test("offset labels report the actual outer Perfect and Great boundaries", () => {
  const candidate = standardCandidate(0, 1, [2, 3, 4]);
  const segments = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [candidate],
    showGreat: true,
    showPerfect: true,
  });
  const labels = collectBandoriNativeJudgmentWindowOffsetLabels({
    candidatesByNoteIndex: [candidate],
    segments,
  });

  assert.deepEqual(labels.map((label) => ({
    category: label.category,
    lane: label.lane,
    side: label.side,
    text: formatBandoriNativeJudgmentWindowOffsetFrames(label.offsetFrames),
  })), [
    { category: "perfect", lane: 3, side: "fast", text: "-2.50" },
    { category: "perfect", lane: 3, side: "slow", text: "+2.50" },
    { category: "great", lane: 3, side: "fast", text: "-5.50" },
    { category: "great", lane: 3, side: "slow", text: "+5.50" },
  ]);
});

test("offset label anchors prefer the Note center then the leftmost widest fragment", () => {
  const candidate = standardCandidate(0, 10, [2, 3, 4]);
  const labels = collectBandoriNativeJudgmentWindowOffsetLabels({
    candidatesByNoteIndex: [candidate],
    segments: [
      {
        category: "perfect",
        endTimeSeconds: 9.5,
        leftLane: 2.8,
        noteIndex: 0,
        rightLane: 3.2,
        startTimeSeconds: 9,
        timingKind: "standardPress",
      },
      {
        category: "perfect",
        endTimeSeconds: 9.5,
        leftLane: 4,
        noteIndex: 0,
        rightLane: 6,
        startTimeSeconds: 9,
        timingKind: "standardPress",
      },
      {
        category: "great",
        endTimeSeconds: 8.5,
        leftLane: 0,
        noteIndex: 0,
        rightLane: 2.5,
        startTimeSeconds: 8,
        timingKind: "standardPress",
      },
      {
        category: "great",
        endTimeSeconds: 8.5,
        leftLane: 3.5,
        noteIndex: 0,
        rightLane: 6,
        startTimeSeconds: 8,
        timingKind: "standardPress",
      },
    ],
  });

  assert.equal(labels.find((label) => label.category === "perfect")?.lane, 3);
  assert.equal(labels.find((label) => label.category === "great")?.lane, 1.25);
});

test("offset labels keep priority clipping but ignore the moving playback cut", () => {
  const first = standardCandidate(0, 1);
  const second = standardCandidate(1, 1.04);
  const bothActiveSegments = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [first, second],
    showGreat: false,
    showPerfect: true,
  });
  const bothActiveLabels = collectBandoriNativeJudgmentWindowOffsetLabels({
    candidatesByNoteIndex: [first, second],
    segments: bothActiveSegments,
  });
  const firstSlow = bothActiveLabels.find((label) => (
    label.noteIndex === 0 && label.side === "slow"
  ));
  const secondFast = bothActiveLabels.find((label) => (
    label.noteIndex === 1 && label.side === "fast"
  ));
  assert.ok(firstSlow);
  assert.ok(secondFast);
  closeTo(firstSlow.offsetFrames, 0.02 / BANDORI_NATIVE_JUDGMENT_FRAME_SECONDS);
  closeTo(secondFast.offsetFrames, -0.02 / BANDORI_NATIVE_JUDGMENT_FRAME_SECONDS);

  const minimumInputTimeSeconds = 1.001;
  const restoredSegments = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [second],
    minimumInputTimeSeconds,
    showGreat: false,
    showPerfect: true,
  });
  const restoredLabels = collectBandoriNativeJudgmentWindowOffsetLabels({
    candidatesByNoteIndex: [null, second],
    minimumInputTimeSeconds,
    segments: restoredSegments,
  });
  assert.equal(restoredLabels.some((label) => label.side === "fast"), false);
  assert.equal(
    formatBandoriNativeJudgmentWindowOffsetFrames(
      restoredLabels.find((label) => label.side === "slow").offsetFrames,
    ),
    "+2.50",
  );
});

test("Slide gesture labels preserve the zero Fast boundary", () => {
  const candidate = slideCandidate(0, 1, { slideTailKind: "flick" });
  const segments = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [candidate],
    showGreat: true,
    showPerfect: true,
  });
  const labels = collectBandoriNativeJudgmentWindowOffsetLabels({
    candidatesByNoteIndex: [candidate],
    segments,
  });

  assert.deepEqual(labels.map((label) => (
    formatBandoriNativeJudgmentWindowOffsetFrames(label.offsetFrames)
  )), ["0.00", "+7.00"]);
  assert.equal(labels.some((label) => label.category === "great"), false);
});

test("offset labels preserve separate simultaneous Notes with identical values", () => {
  const left = standardCandidate(0, 1, [1]);
  const right = standardCandidate(1, 1, [5]);
  const segments = collectBandoriNativeJudgmentWindowSegments({
    activeCandidates: [left, right],
    showGreat: false,
    showPerfect: true,
  });
  const labels = collectBandoriNativeJudgmentWindowOffsetLabels({
    candidatesByNoteIndex: [left, right],
    segments,
  });

  assert.deepEqual(
    labels.filter((label) => label.side === "fast").map((label) => label.noteIndex),
    [0, 1],
  );
  assert.deepEqual(
    labels.filter((label) => label.side === "slow").map((label) => label.noteIndex),
    [0, 1],
  );
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
