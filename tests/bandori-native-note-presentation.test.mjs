import assert from "node:assert/strict";
import test from "node:test";
import {
  BANDORI_COMPILED_DIRECTION,
  BANDORI_COMPILED_NOTE_FLAG,
  BANDORI_COMPILED_NOTE_KIND,
  compileBandoriChart,
  getBandoriCompiledBeatAtTime,
} from "../src/lib/bandori/chart-simulator/compiler.ts";
import {
  compileBandoriEffectRecipe,
  createBandoriEffectRecipeRuntime,
  evaluateBandoriEffectGradient,
} from "../src/lib/bandori/chart-simulator/effect-recipe-runtime.ts";
import nativeSwipeEffectRecipes from "../src/lib/bandori/chart-simulator/native-swipe-effect-recipes.json" with { type: "json" };
import {
  BANDORI_NATIVE_APPROXIMATE_HIT_EFFECTS,
  BANDORI_NATIVE_LANE_EFFECTS,
  BANDORI_NATIVE_TAP_EFFECT_ATLAS_1_URL,
  BANDORI_NATIVE_TAP_EFFECT_ATLAS_2_URL,
  collectBandoriNativeHitEvents,
  collectBandoriNativeLaneEffectEvents,
  createBandoriApproximateKiraParticles,
  evaluateBandoriApproximateKiraParticle,
  evaluateBandoriApproximateStaticHitLayer,
} from "../src/lib/bandori/chart-simulator/native-hit-effect-presentation.ts";
import {
  BANDORI_NATIVE_HOLD_EFFECT_TEXTURE_URLS,
  BANDORI_NATIVE_LONG_FLASH_PEAK_SECONDS,
  BANDORI_NATIVE_LONG_FLASH_PERIOD_SECONDS,
  collectBandoriNativeHoldStates,
  createBandoriNativeHoldEffectRuntime,
  evaluateBandoriNativeLongFlashColor,
  getBandoriNativeHoldEffectSeed,
  projectBandoriNativeHoldState,
  projectBandoriNativeRibbonBody,
} from "../src/lib/bandori/chart-simulator/native-hold-effect-presentation.ts";
import {
  BANDORI_NATIVE_ALL_PERFECT_COMBO_DIGIT_URLS,
  BANDORI_NATIVE_COMBO_DIGIT_URLS,
  BANDORI_NATIVE_PERFECT_JUDGMENT_POSITION,
  BANDORI_NATIVE_PERFECT_JUDGMENT_SIZE,
  evaluateBandoriNativeAllPerfectComboAlpha,
  evaluateBandoriNativeComboPopScale,
  evaluateBandoriNativePerfectJudgment,
  getBandoriNativeComboDigitPlacements,
} from "../src/lib/bandori/chart-simulator/native-judgment-combo-presentation.ts";
import {
  BANDORI_APPROVED_MANUAL_VERTICAL_BEAM_ABOVE_JUDGMENT_RATIO,
  BANDORI_NATIVE_DIRECTIONAL_EFFECT_FRAME_URLS,
  BANDORI_NATIVE_SWIPE_EFFECT_TEXTURE_URLS,
  createBandoriNativeSwipeEffectRuntime,
  getBandoriApprovedAnimatedTravelScreenY,
  getBandoriApprovedManualDirectionalNotesCenterOffsetPixels,
  getBandoriApprovedManualVerticalBeamScreenY,
  getBandoriNativeSwipeEffectPlacement,
  getBandoriNativeSwipeEffectSeed,
  getBandoriNativeSwipeParticleWidthScale,
  isBandoriNativeDirectionalTerminalParticle,
} from "../src/lib/bandori/chart-simulator/native-swipe-effect-presentation.ts";
import {
  BANDORI_NATIVE_CURVE_SLIDE_BELT_THRESHOLD,
  BANDORI_NATIVE_DIRECTIONAL_BACK_LINE_THRESHOLD,
  BANDORI_NATIVE_LONG_BELT_THRESHOLD,
  BANDORI_NATIVE_LONG_NOTE_LINE_BRIGHTNESS_DEFAULT,
  BANDORI_NATIVE_LONG_NOTE_LINE_VERTEX_ALPHA,
  createBandoriNativeTransparentColoredShaderSources,
  evaluateBandoriNativeTransparentColoredAlpha,
} from "../src/lib/bandori/chart-simulator/native-note-material.ts";
import {
  adjustBandoriSimulatorNoteSpeed,
  BANDORI_NATIVE_DIRECTIONAL_CONNECTOR_UVS,
  BANDORI_NATIVE_NOTE_ARRIVAL_SECONDS,
  BANDORI_NATIVE_NOTE_SPEED_DEFAULT,
  BANDORI_NATIVE_NOTE_SPEED_MAX,
  BANDORI_NATIVE_NOTE_SPEED_MIN,
  BANDORI_NATIVE_NOTE_SPEED_STEP,
  BANDORI_NATIVE_SYNC_LINE_WIDTH,
  BandoriNativeNoteContractError,
  collectBandoriNativeSyncLinePairs,
  createBandoriNativeRibbonMeshGeometry,
  getBandoriDirectionalFlickIconOffset,
  getBandoriNativeNoteArrivalSeconds,
  getBandoriNativeMultiRangeMeshWidthRate,
  getBandoriSimulatorNoteArrivalSeconds,
  isBandoriNativeAdvancedNoteSpeed,
  isBandoriHabahiroChart,
  isBandoriNativeRhythmSupportNote,
  isBandoriNativeRibbonPointBodyVisible,
  isBandoriNativeShortRhythmUnderEighthBeat,
  prepareBandoriNativeChartVisuals,
  prepareBandoriNativeNoteVisuals,
  projectBandoriNativeNote,
  projectBandoriNativeRibbonPoint,
  resolveBandoriNativeNoteVisual,
  updateBandoriNativeDirectionalConnectorVertices,
  updateBandoriNativeRibbonMeshVertices,
} from "../src/lib/bandori/chart-simulator/native-note-presentation.ts";
import {
  BANDORI_NATIVE_DIRECTIONAL_FLICK_SKIN,
  BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS,
  BANDORI_NATIVE_NOTE_SKIN,
  BANDORI_NATIVE_NOTE_SKINS,
  getBandoriHabahiroBodySpriteName,
  getBandoriHabahiroIconSpriteName,
  getBandoriHabahiroLongFlashSpriteName,
  getBandoriHabahiroRhythmSpriteName,
  getBandoriNativeBodyFrameId,
  getBandoriNativeIconFrameId,
  getBandoriNativeLongFlashUrl,
  getBandoriNativeNoteFrame,
  getBandoriNativeRhythmSupportNoteUrl,
  isBandoriHabahiroMultiRangeFlickIcon,
} from "../src/app/[locale]/bandori/songs/[songId]/native-note-assets.ts";
import {
  BANDORI_HABAHIRO_SPRITES,
} from "../src/app/[locale]/bandori/songs/[songId]/habahiro-note-assets.ts";

const resolve = (overrides = {}) => resolveBandoriNativeNoteVisual({
  direction: BANDORI_COMPILED_DIRECTION.none,
  flags: 0,
  isMirrored: false,
  kind: BANDORI_COMPILED_NOTE_KIND.single,
  lane: 2,
  width: 1,
  ...overrides,
});

const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
};

test("Perfect judgment and Combo retain the recovered JP animation contract", () => {
  assert.deepEqual(BANDORI_NATIVE_PERFECT_JUDGMENT_POSITION, { x: 667, y: 535 });
  assert.deepEqual(BANDORI_NATIVE_PERFECT_JUDGMENT_SIZE, { width: 286, height: 78 });
  assert.equal(BANDORI_NATIVE_COMBO_DIGIT_URLS.length, 10);
  assert.equal(BANDORI_NATIVE_ALL_PERFECT_COMBO_DIGIT_URLS.length, 10);

  assert.deepEqual(evaluateBandoriNativePerfectJudgment(0), {
    alpha: 0.6,
    childScale: 0.8,
    visible: true,
  });
  closeTo(evaluateBandoriNativePerfectJudgment(0.04).alpha, 1, 1e-7);
  closeTo(evaluateBandoriNativePerfectJudgment(0.04).childScale, 1.1, 1e-7);
  closeTo(evaluateBandoriNativePerfectJudgment(0.08).alpha, 1, 1e-6);
  closeTo(evaluateBandoriNativePerfectJudgment(0.08).childScale, 1, 1e-6);
  assert.equal(evaluateBandoriNativePerfectJudgment(1).visible, false);

  assert.deepEqual(getBandoriNativeComboDigitPlacements(123), [
    { digit: 3, x: 57 },
    { digit: 2, x: -13 },
    { digit: 1, x: -83 },
  ]);
  closeTo(evaluateBandoriNativeComboPopScale(0), 0.8);
  closeTo(evaluateBandoriNativeComboPopScale(1 / 12), 1.1, 1e-7);
  closeTo(evaluateBandoriNativeComboPopScale(2 / 12), 1, 1e-8);
  closeTo(evaluateBandoriNativeAllPerfectComboAlpha(0), 1);
  closeTo(evaluateBandoriNativeAllPerfectComboAlpha(5 / 12), 0.5, 1e-7);
  closeTo(evaluateBandoriNativeAllPerfectComboAlpha(10 / 12), 1, 1e-8);
});

test("confirmed point-note semantic priority selects the native Sprite families", () => {
  assert.deepEqual(resolve(), {
    body: "normal",
    direction: BANDORI_COMPILED_DIRECTION.none,
    icon: null,
    lane: 2,
  });
  assert.equal(resolve({ flags: BANDORI_COMPILED_NOTE_FLAG.skill }).body, "skill");
  assert.deepEqual(resolve({
    flags: BANDORI_COMPILED_NOTE_FLAG.skill | BANDORI_COMPILED_NOTE_FLAG.flick,
  }), {
    body: "flick",
    direction: BANDORI_COMPILED_DIRECTION.none,
    icon: "flick",
    lane: 2,
  });

  assert.deepEqual(resolve({
    direction: BANDORI_COMPILED_DIRECTION.left,
    isMirrored: true,
    kind: BANDORI_COMPILED_NOTE_KIND.directional,
    lane: 1,
  }), {
    body: "directionalRight",
    direction: BANDORI_COMPILED_DIRECTION.right,
    icon: "right",
    lane: 5,
  });

  assert.equal(resolve({
    flags: BANDORI_COMPILED_NOTE_FLAG.ribbonStart,
    kind: BANDORI_COMPILED_NOTE_KIND.longStart,
  }).body, "long");
  assert.equal(resolve({
    flags: BANDORI_COMPILED_NOTE_FLAG.ribbonEnd,
    kind: BANDORI_COMPILED_NOTE_KIND.longEnd,
  }).body, "long");
  assert.equal(resolve({
    flags: 0,
    kind: BANDORI_COMPILED_NOTE_KIND.slide,
  }).body, "slideAmong");
  assert.equal(resolve({
    flags: BANDORI_COMPILED_NOTE_FLAG.ribbonEnd,
    kind: BANDORI_COMPILED_NOTE_KIND.slide,
  }).body, "long");

});

test("invalid point-note combinations fail closed", () => {
  const failureCases = [
    { width: 2 },
    { lane: 1.5 },
    { kind: BANDORI_COMPILED_NOTE_KIND.directional },
    {
      flags: BANDORI_COMPILED_NOTE_FLAG.charge | BANDORI_COMPILED_NOTE_FLAG.skill,
    },
    { kind: BANDORI_COMPILED_NOTE_KIND.longStart },
    { kind: BANDORI_COMPILED_NOTE_KIND.longEnd },
    {
      direction: BANDORI_COMPILED_DIRECTION.left,
      flags: BANDORI_COMPILED_NOTE_FLAG.ribbonEnd,
      kind: BANDORI_COMPILED_NOTE_KIND.slide,
    },
  ];
  for (const input of failureCases) {
    assert.throws(() => resolve(input), BandoriNativeNoteContractError);
  }
});

test("JP 77 HARD retains same-lane Charge and Long-start scoring Notes", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 140 },
    { type: "Single", lane: 2, beat: 176, charge: true },
    { type: "Single", lane: 6, beat: 176, charge: true },
    {
      type: "Long",
      connections: [
        { lane: 6, beat: 176 },
        { lane: 6, beat: 177 },
      ],
    },
  ]);
  const visuals = prepareBandoriNativeChartVisuals(compiled, false);

  assert.equal(compiled.maxCombo, 4);
  assert.deepEqual(
    visuals.notes.map((group) => group?.visuals[0].body),
    ["normal", "normal", "long", "long"],
  );
});

test("Long, Slide, and width-2 Directional join the same point-note timeline", () => {
  const mixedChart = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    { type: "Single", beat: 1, lane: 2, laneChange: true },
    { type: "Single", beat: 2, lane: 3, lanes: [2, 3, 4] },
    { type: "Directional", beat: 3, lane: 2, width: 2, direction: "Right" },
    {
      type: "Long",
      connections: [
        { beat: 4, lane: 2 },
        { beat: 5, lane: 2 },
      ],
    },
    {
      type: "Slide",
      connections: [
        { beat: 6, lane: 2 },
        { beat: 7, lane: 3 },
      ],
    },
    { type: "Single", beat: 8, lane: 4, flick: true },
  ]);
  const visuals = prepareBandoriNativeNoteVisuals(mixedChart, false);

  assert.equal(visuals.length, 8);
  assert.equal(mixedChart.source[1].laneChange, true);
  assert.equal(visuals[0].visuals[0].body, "normal");
  assert.deepEqual(visuals[1], {
    connectors: [],
    visuals: [{
      body: "normal",
      coveredLanes: [2, 3, 4],
      direction: 0,
      icon: null,
      lane: 3,
    }],
  });
  assert.deepEqual(visuals[2], {
    connectors: [{
      direction: BANDORI_COMPILED_DIRECTION.right,
      leftLane: 2,
      rightLane: 3,
    }],
    visuals: [
      { body: "directionalRight", direction: 1, icon: null, lane: 2 },
      { body: "directionalRight", direction: 1, icon: "right", lane: 3 },
    ],
  });
  assert.equal(visuals[3].visuals[0].body, "long");
  assert.equal(visuals[4].visuals[0].body, "long");
  assert.equal(visuals[5].visuals[0].body, "long");
  assert.equal(visuals[6].visuals[0].body, "long");
  assert.equal(visuals[7].visuals[0].body, "flick");
});

test("Slide hidden nodes select the curve belt while unsupported ribbon variants fail closed", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    {
      type: "Slide",
      connections: [
        { beat: 1, lane: 1 },
        { beat: 2, lane: 2, hidden: true },
        { beat: 3, lane: 4 },
      ],
    },
    {
      type: "Long",
      connections: [
        { beat: 4, lane: 2 },
        { beat: 5, lane: 2, direction: "Right" },
      ],
    },
    {
      type: "Slide",
      connections: [
        { beat: 6, lane: 2, lanes: [2, 3] },
        { beat: 7, lane: 3 },
      ],
    },
  ]);
  const visuals = prepareBandoriNativeChartVisuals(compiled, true);

  assert.equal(visuals.ribbons.length, 1);
  assert.deepEqual(visuals.ribbons[0], {
    isCurvedSlide: true,
    kind: "slide",
    points: [
      { beat: 1, coveredLanes: [5], hidden: false, lane: 5, meshWidthRate: 1, time: 0.5 },
      { beat: 2, coveredLanes: [4], hidden: true, lane: 4, meshWidthRate: 1, time: 1 },
      { beat: 3, coveredLanes: [2], hidden: false, lane: 2, meshWidthRate: 1, time: 1.5 },
    ],
    ribbonIndex: 0,
  });
  assert.equal(visuals.notes[0].visuals[0].body, "long");
  assert.equal(visuals.notes[1].visuals[0].body, "long");
  assert.deepEqual(visuals.notes.slice(2), [null, null, null, null]);
});

test("JP 689 SPECIAL charge markers keep their Slide and Long ribbons renderable", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 190 },
    {
      type: "Slide",
      connections: [
        { lane: 1, beat: 146, charge: true },
        { lane: 0, beat: 146.0625, hidden: true },
        { lane: 0, beat: 147 },
      ],
    },
    {
      type: "Long",
      connections: [
        { lane: 5, beat: 160, charge: true },
        { lane: 5, beat: 160.75 },
      ],
    },
  ]);
  const visuals = prepareBandoriNativeChartVisuals(compiled, false);

  assert.equal(compiled.maxCombo, 4);
  assert.equal(visuals.ribbons.length, 2);
  assert.deepEqual(visuals.ribbons.map((ribbon) => ribbon.points.length), [3, 2]);
  assert.deepEqual(
    visuals.notes.map((group) => group?.visuals[0].body),
    ["long", "long", "long", "long"],
  );
  assert.equal(
    compiled.ribbons.connectionFlags[0] & BANDORI_COMPILED_NOTE_FLAG.charge,
    BANDORI_COMPILED_NOTE_FLAG.charge,
  );
  assert.equal(
    compiled.ribbons.connectionFlags[3] & BANDORI_COMPILED_NOTE_FLAG.charge,
    BANDORI_COMPILED_NOTE_FLAG.charge,
  );
});

test("JP 792 EXPERT retains a single-connection Slide as its one scoring point", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 182 },
    { type: "Slide", connections: [{ lane: 3, beat: 124 }] },
  ]);
  const visuals = prepareBandoriNativeChartVisuals(compiled, false);

  assert.equal(compiled.maxCombo, 1);
  assert.equal(compiled.ribbons.kinds.length, 0);
  assert.equal(compiled.notes.sourceEntityIndexes[0], 1);
  assert.equal(compiled.notes.sourceNodeIndexes[0], 0);
  assert.equal(visuals.notes[0]?.visuals[0].body, "normal");
});

test("hidden Slide DiffVolume may extend beyond the outer lane centers", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    {
      type: "Slide",
      connections: [
        { beat: 1, lane: 6 },
        { beat: 1.25, lane: 6.4, hidden: true },
        { beat: 1.5, lane: 6 },
      ],
    },
    {
      type: "Slide",
      connections: [
        { beat: 2, lane: 0 },
        { beat: 2.25, lane: -0.4, hidden: true },
        { beat: 2.5, lane: 0 },
      ],
    },
  ]);
  const visuals = prepareBandoriNativeChartVisuals(compiled, false);
  const mirrored = prepareBandoriNativeChartVisuals(compiled, true);

  assert.equal(visuals.ribbons.length, 2);
  assert.ok(Math.abs(visuals.ribbons[0].points[1].lane - 6.4) < 0.000001);
  assert.ok(Math.abs(visuals.ribbons[1].points[1].lane - -0.4) < 0.000001);
  assert.ok(Math.abs(mirrored.ribbons[0].points[1].lane - -0.4) < 0.000001);
  assert.ok(Math.abs(mirrored.ribbons[1].points[1].lane - 6.4) < 0.000001);
  assert.ok(projectBandoriNativeRibbonPoint(visuals.ribbons[0], 1, 1.25, 0.625));
  assert.ok(projectBandoriNativeRibbonPoint(visuals.ribbons[1], 1, 2.25, 1.125));
});

test("generated ordinary Slide curves retain fractional centers during presentation", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    {
      type: "Slide",
      connections: [
        { beat: 9.5, lane: 4 },
        { beat: 11, lane: 6 },
      ],
      curveControls: [{ beat: 10.5, lane: 6, position: "Back" }],
    },
  ]);
  const [ribbon] = prepareBandoriNativeChartVisuals(compiled, false).ribbons;
  const [mirroredRibbon] = prepareBandoriNativeChartVisuals(compiled, true).ribbons;
  const hiddenPointIndex = ribbon.points.findIndex((point) => (
    point.hidden && Math.abs(point.lane - Math.round(point.lane)) > 0.000001
  ));

  assert.notEqual(hiddenPointIndex, -1);
  closeTo(ribbon.points[hiddenPointIndex].lane, compiled.ribbons.connectionLanes[hiddenPointIndex]);
  closeTo(mirroredRibbon.points[hiddenPointIndex].lane, 6 - ribbon.points[hiddenPointIndex].lane);
});

test("multi-range hidden Slide nodes still use their covered-lane center", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    { type: "System", beat: 0, data: "lane_change", laneChange: true },
    {
      type: "Slide",
      connections: [
        { beat: 1, lane: 0, lanes: [0, 1] },
        { beat: 2, lane: 5, lanes: [5, 6], hidden: true },
        { beat: 3, lane: 1 },
      ],
    },
  ]);
  const [ribbon] = prepareBandoriNativeChartVisuals(compiled, false).ribbons;
  const [mirroredRibbon] = prepareBandoriNativeChartVisuals(compiled, true).ribbons;

  closeTo(ribbon.points[1].lane, 5.5);
  closeTo(mirroredRibbon.points[1].lane, 0.5);
});

test("ribbon endpoints keep their native bodies while visible Slide middle nodes use slideAmong", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 60 },
    {
      type: "Long",
      connections: [
        { beat: 1, lane: 1, skill: true },
        { beat: 2, lane: 1, flick: true },
      ],
    },
    {
      type: "Slide",
      connections: [
        { beat: 3, lane: 2, skill: true },
        { beat: 4, lane: 3 },
        {
          beat: 5,
          lane: 3,
          width: 2,
          direction: "Right",
          flick: true,
          skill: true,
        },
      ],
    },
  ]);
  const visuals = prepareBandoriNativeChartVisuals(compiled, false);

  assert.deepEqual(
    visuals.notes.map((group) => group?.visuals.map(({ body, icon, lane }) => ({ body, icon, lane }))),
    [
      [{ body: "skill", icon: null, lane: 1 }],
      [{ body: "flick", icon: "flick", lane: 1 }],
      [{ body: "skill", icon: null, lane: 2 }],
      [{ body: "slideAmong", icon: null, lane: 3 }],
      [
        { body: "skill", icon: null, lane: 3 },
        { body: "skill", icon: "right", lane: 4 },
      ],
    ],
  );
  assert.deepEqual(
    visuals.ribbons[1].points.map(({ lane, meshWidthRate }) => ({ lane, meshWidthRate })),
    [
      { lane: 2, meshWidthRate: 1 },
      { lane: 3, meshWidthRate: 1 },
      { lane: 3, meshWidthRate: 1 },
    ],
  );
});

test("Long and Slide Directional tails keep NoteMesh on the one-lane root Note", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 60 },
    {
      type: "Long",
      connections: [
        { beat: 1, lane: 0 },
        { beat: 2, lane: 0, width: 3, direction: "Right", flick: true },
      ],
    },
    {
      type: "Slide",
      connections: [
        { beat: 3, lane: 6 },
        { beat: 4, lane: 6, width: 3, direction: "Left", flick: true },
      ],
    },
  ]);
  const visuals = prepareBandoriNativeChartVisuals(compiled, false);

  assert.deepEqual(
    visuals.ribbons.map((ribbon) => (
      ribbon.points.map(({ lane, meshWidthRate }) => ({ lane, meshWidthRate }))
    )),
    [
      [
        { lane: 0, meshWidthRate: 1 },
        { lane: 0, meshWidthRate: 1 },
      ],
      [
        { lane: 6, meshWidthRate: 1 },
        { lane: 6, meshWidthRate: 1 },
      ],
    ],
  );
  assert.deepEqual(visuals.notes[1].visuals.map(({ lane }) => lane), [0, 1, 2]);
  assert.deepEqual(visuals.notes[3].visuals.map(({ lane }) => lane), [6, 5, 4]);
});

test("width-3 Directional mirrors lanes, direction, outer icon, and native overlap order", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    { type: "Directional", beat: 1, lane: 4, width: 3, direction: "Left" },
  ]);
  const [group] = prepareBandoriNativeNoteVisuals(compiled, true);

  assert.deepEqual(group.connectors, [
    { direction: 1, leftLane: 2, rightLane: 3 },
    { direction: 1, leftLane: 3, rightLane: 4 },
  ]);
  assert.deepEqual(group.visuals, [
    { body: "directionalRight", direction: 1, icon: null, lane: 2 },
    { body: "directionalRight", direction: 1, icon: null, lane: 3 },
    { body: "directionalRight", direction: 1, icon: "right", lane: 4 },
  ]);
});

test("lane-change marked charts retain multi-range ribbon centers, widths, and hidden segments", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    { type: "Single", beat: 0.25, lane: 0, laneChange: true },
    {
      type: "Slide",
      connections: [
        { beat: 1, lane: 5, lanes: [5, 6] },
        { beat: 2, lane: 4, lanes: [3, 4, 5], hidden: true },
        { beat: 3, lane: 5, lanes: [5, 6] },
      ],
    },
  ]);
  assert.equal(isBandoriHabahiroChart(compiled), true);
  const visuals = prepareBandoriNativeChartVisuals(compiled, false);
  const mirrored = prepareBandoriNativeChartVisuals(compiled, true);
  const width2 = 2 * getBandoriNativeMultiRangeMeshWidthRate(2);
  const width3 = 3 * getBandoriNativeMultiRangeMeshWidthRate(3);

  assert.equal(visuals.ribbons[0].isCurvedSlide, true);
  assert.deepEqual(
    visuals.ribbons[0].points.map(({ coveredLanes, lane, meshWidthRate }) => ({
      coveredLanes,
      lane,
      meshWidthRate,
    })),
    [
      { coveredLanes: [5, 6], lane: 5.5, meshWidthRate: width2 },
      { coveredLanes: [3, 4, 5], lane: 4, meshWidthRate: width3 },
      { coveredLanes: [5, 6], lane: 5.5, meshWidthRate: width2 },
    ],
  );
  assert.deepEqual(
    mirrored.ribbons[0].points.map(({ coveredLanes, lane }) => ({ coveredLanes, lane })),
    [
      { coveredLanes: [0, 1], lane: 0.5 },
      { coveredLanes: [1, 2, 3], lane: 2 },
      { coveredLanes: [0, 1], lane: 0.5 },
    ],
  );
});

test("Habahiro multi-range point roots project their continuous lane centers", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    { type: "Single", beat: 0.25, lane: 0, laneChange: true },
    { type: "Single", beat: 1, lane: 0, lanes: [0, 1] },
    { type: "Single", beat: 2, lane: 1, lanes: [0, 1, 2, 3], skill: true },
    { type: "Single", beat: 3, lane: 2, lanes: [0, 1, 2, 3, 4, 5], flick: true },
  ]);
  const visuals = prepareBandoriNativeChartVisuals(compiled, false);
  const expectedCenters = [0.5, 1.5, 2.5];

  for (let offset = 0; offset < expectedCenters.length; offset += 1) {
    const noteIndex = offset + 1;
    const visual = visuals.notes[noteIndex]?.visuals[0];
    assert.ok(visual);
    assert.equal(visual.lane, expectedCenters[offset]);
    assert.ok(projectBandoriNativeNote(
      visual.lane,
      compiled.notes.times[noteIndex],
      compiled.notes.times[noteIndex],
    ));
  }
});

test("width-7 Directional uses seven scalar bodies, one outer icon, and six back-lines", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    { type: "Directional", beat: 1, lane: 0, width: 7, direction: "Right" },
  ]);
  const [group] = prepareBandoriNativeNoteVisuals(compiled, false);
  assert.equal(group.visuals.length, 7);
  assert.equal(group.connectors.length, 6);
  assert.deepEqual(group.visuals.map(({ lane }) => lane), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(group.visuals.filter(({ icon }) => icon).map(({ lane }) => lane), [6]);
});

test("native ribbon and Directional connector geometry preserves verified tessellation", () => {
  const ordinary = createBandoriNativeRibbonMeshGeometry("ordinary");
  assert.equal(ordinary.vertices.length, 44);
  assert.equal(ordinary.uvs.length, 44);
  assert.equal(ordinary.indices.length, 60);
  updateBandoriNativeRibbonMeshVertices(
    ordinary,
    { x: 0, y: 10, halfWidth: 10 },
    { x: 100, y: 20, halfWidth: 20 },
  );
  [-1, 11, 21, 11].forEach((expected, index) => {
    closeTo(ordinary.vertices[4 + index], expected, 1e-6);
  });

  const advanced = createBandoriNativeRibbonMeshGeometry("advanced");
  assert.equal(advanced.vertices.length, 84);
  assert.equal(advanced.uvs.length, 84);
  assert.equal(advanced.indices.length, 120);
  updateBandoriNativeRibbonMeshVertices(
    advanced,
    { x: 0, y: 0, halfWidth: 0 },
    { x: 40, y: 80, halfWidth: 20 },
  );
  [7.5, 30, 22.5, 30].forEach((expected, index) => {
    closeTo(advanced.vertices[28 + index], expected, 1e-6);
  });
  closeTo(advanced.uvs[29], 0.35, 1e-7);
  assert.equal(isBandoriNativeAdvancedNoteSpeed(11.01), false);
  assert.equal(isBandoriNativeAdvancedNoteSpeed(11.02), true);

  const lineVertices = new Float32Array(8);
  updateBandoriNativeDirectionalConnectorVertices(
    lineVertices,
    { x: 10, y: 20 },
    { x: 30, y: 20 },
    6,
  );
  assert.deepEqual(Array.from(lineVertices), [10, 17, 10, 23, 30, 17, 30, 23]);
  assert.deepEqual(
    Array.from(BANDORI_NATIVE_DIRECTIONAL_CONNECTOR_UVS),
    [0, 0, 0, 1, 1, 0, 1, 1],
  );
});

test("native transparent-colored material preserves the APK shader constants", () => {
  assert.equal(BANDORI_NATIVE_DIRECTIONAL_BACK_LINE_THRESHOLD, 750);
  assert.equal(BANDORI_NATIVE_CURVE_SLIDE_BELT_THRESHOLD, 704.72900390625);
  assert.equal(BANDORI_NATIVE_LONG_BELT_THRESHOLD, 2000);
  assert.equal(BANDORI_NATIVE_LONG_NOTE_LINE_BRIGHTNESS_DEFAULT, 80);
  assert.equal(BANDORI_NATIVE_LONG_NOTE_LINE_VERTEX_ALPHA, 0.8);
  closeTo(
    evaluateBandoriNativeTransparentColoredAlpha(0.5, 0.5),
    0.564221945153564,
    1e-12,
  );
  closeTo(
    evaluateBandoriNativeTransparentColoredAlpha(
      0.5,
      0.5,
      BANDORI_NATIVE_LONG_NOTE_LINE_VERTEX_ALPHA,
    ),
    0.4746678894437837,
    1e-12,
  );
  const sources = createBandoriNativeTransparentColoredShaderSources();
  assert.match(sources.glFragment, /0\.305299997/u);
  assert.match(sources.glFragment, /0\.649999976/u);
  assert.doesNotMatch(sources.glFragment, /step\(|vStagePosition/u);
  assert.doesNotMatch(sources.wgsl, /step\(|stagePosition/u);
  assert.match(sources.wgsl, /@group\(2\) @binding\(0\) var uTexture/u);

  const longBeltSources = createBandoriNativeTransparentColoredShaderSources(
    BANDORI_NATIVE_LONG_NOTE_LINE_VERTEX_ALPHA,
  );
  assert.match(longBeltSources.glFragment, /sourceColor\.a \* 0\.8/u);
  assert.match(longBeltSources.wgsl, /sourceColor\.a \* 0\.8/u);
});

test("fixed NoteSpeed 5 projection reaches the native lane endpoints", () => {
  assert.equal(getBandoriNativeNoteArrivalSeconds(5), 3.5);
  const spawn = projectBandoriNativeNote(0, 3.5, 0, 5);
  const goal = projectBandoriNativeNote(0, 3.5, 3.5, 5);
  assert.ok(spawn);
  assert.ok(goal);
  closeTo(spawn.progress, 0);
  closeTo(spawn.screenX, 644.020581394006);
  closeTo(spawn.screenY, 28.46334230205207);
  closeTo(spawn.worldScale, 0.013247475123866714);
  closeTo(goal.progress, 1);
  closeTo(goal.screenX, 207.41162788011786);
  closeTo(goal.screenY, 615.2393796569635);
  closeTo(goal.worldScale, 0.18894950247733439);
  closeTo(goal.spritePixelScale, 0.708560634290004);
  assert.equal(projectBandoriNativeNote(0, 3.5, -0.001, 5), null);
  assert.equal(projectBandoriNativeNote(0, 3.5, 3.501, 5), null);

  const laneZero = projectBandoriNativeNote(0, 3.5, 1.75, 5);
  const laneOne = projectBandoriNativeNote(1, 3.5, 1.75, 5);
  const wideCenter = projectBandoriNativeNote(0.5, 3.5, 1.75, 5);
  assert.ok(laneZero);
  assert.ok(laneOne);
  assert.ok(wideCenter);
  closeTo(wideCenter.screenX, (laneZero.screenX + laneOne.screenX) / 2);
  closeTo(wideCenter.screenY, laneZero.screenY);
  closeTo(wideCenter.spritePixelScale, laneZero.spritePixelScale);
  assert.throws(
    () => projectBandoriNativeNote(Number.NaN, 3.5, 1.75, 5),
    BandoriNativeNoteContractError,
  );
  assert.throws(
    () => projectBandoriNativeNote(Number.POSITIVE_INFINITY, 3.5, 1.75, 5),
    BandoriNativeNoteContractError,
  );

  const leftIcon = getBandoriDirectionalFlickIconOffset(
    BANDORI_COMPILED_DIRECTION.left,
    goal,
    3.5,
    3.5,
  );
  closeTo(leftIcon.x, -138.1693236865508);
  closeTo(leftIcon.y, 0);
});

test("verified native note speeds use the APK arrival-time branches", () => {
  assert.equal(BANDORI_NATIVE_NOTE_SPEED_MIN, 1);
  assert.equal(BANDORI_NATIVE_NOTE_SPEED_MAX, 12);
  assert.equal(BANDORI_NATIVE_NOTE_SPEED_STEP, 0.01);
  assert.equal(BANDORI_NATIVE_NOTE_SPEED_DEFAULT, 10);
  assert.equal(BANDORI_NATIVE_NOTE_ARRIVAL_SECONDS, 1);
  closeTo(getBandoriNativeNoteArrivalSeconds(1), 5.5);
  closeTo(getBandoriNativeNoteArrivalSeconds(5), 3.5);
  closeTo(getBandoriNativeNoteArrivalSeconds(11.01), 0.495);
  closeTo(getBandoriNativeNoteArrivalSeconds(11.02), 0.498);
  closeTo(getBandoriNativeNoteArrivalSeconds(12), 0.4);
  assert.throws(
    () => getBandoriNativeNoteArrivalSeconds(0.99),
    BandoriNativeNoteContractError,
  );
  assert.throws(
    () => getBandoriNativeNoteArrivalSeconds(12.01),
    BandoriNativeNoteContractError,
  );
  assert.throws(
    () => getBandoriNativeNoteArrivalSeconds(5.001),
    BandoriNativeNoteContractError,
  );

  assert.equal(adjustBandoriSimulatorNoteSpeed(5, 0.01), 5.01);
  assert.equal(adjustBandoriSimulatorNoteSpeed(5, -0.1), 4.9);
  assert.equal(adjustBandoriSimulatorNoteSpeed(5, 0.5), 5.5);
  assert.equal(adjustBandoriSimulatorNoteSpeed(11.8, 0.5), 12);
  assert.equal(adjustBandoriSimulatorNoteSpeed(11.99, 0.1), 12);
  assert.equal(adjustBandoriSimulatorNoteSpeed(12, 0.01), 12);
  assert.equal(adjustBandoriSimulatorNoteSpeed(1.2, -0.5), 1);
  assert.equal(adjustBandoriSimulatorNoteSpeed(1.01, -0.1), 1);
  assert.equal(adjustBandoriSimulatorNoteSpeed(1, -0.01), 1);
  assert.throws(
    () => adjustBandoriSimulatorNoteSpeed(5, 0.02),
    BandoriNativeNoteContractError,
  );

  assert.ok(projectBandoriNativeNote(0, 10, 4.5, 1));
  assert.equal(projectBandoriNativeNote(0, 10, 4.499, 1), null);
  assert.ok(projectBandoriNativeNote(0, 10, 9.6, 12));
  assert.equal(projectBandoriNativeNote(0, 10, 9.599, 12), null);
});

test("music-only slow play preserves wall-clock Note and ribbon approach speed by default", () => {
  closeTo(getBandoriSimulatorNoteArrivalSeconds(10, 1), 1);
  closeTo(getBandoriSimulatorNoteArrivalSeconds(10, 0.5), 0.5);
  assert.throws(
    () => getBandoriSimulatorNoteArrivalSeconds(10, 0),
    BandoriNativeNoteContractError,
  );
  assert.throws(
    () => getBandoriSimulatorNoteArrivalSeconds(10, 1.01),
    BandoriNativeNoteContractError,
  );

  const normalRate = projectBandoriNativeNote(0, 10, 9.5, 10, 1);
  const independentHalfRate = projectBandoriNativeNote(0, 10, 9.75, 10, 0.5);
  const synchronizedHalfRate = projectBandoriNativeNote(0, 10, 9.75, 10, 1);
  assert.ok(normalRate);
  assert.ok(independentHalfRate);
  assert.ok(synchronizedHalfRate);
  closeTo(normalRate.progress, independentHalfRate.progress);
  closeTo(normalRate.screenX, independentHalfRate.screenX);
  closeTo(normalRate.screenY, independentHalfRate.screenY);
  closeTo(normalRate.worldScale, independentHalfRate.worldScale);
  closeTo(synchronizedHalfRate.progress, 0.75);

  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 60 },
    {
      type: "Slide",
      connections: [
        { beat: 10, lane: 1 },
        { beat: 11, lane: 3 },
      ],
    },
  ]);
  const [ribbon] = prepareBandoriNativeChartVisuals(compiled, false).ribbons;
  const normalRibbon = projectBandoriNativeRibbonPoint(ribbon, 0, 9.5, 9.5, 10, 0, 1);
  const independentHalfRateRibbon = projectBandoriNativeRibbonPoint(
    ribbon,
    0,
    9.75,
    9.75,
    10,
    0,
    0.5,
  );
  assert.ok(normalRibbon);
  assert.ok(independentHalfRateRibbon);
  closeTo(normalRibbon.progress, independentHalfRateRibbon.progress);
  closeTo(normalRibbon.screenX, independentHalfRateRibbon.screenX);
  closeTo(normalRibbon.screenY, independentHalfRateRibbon.screenY);
});

test("rhythm support replaces only ordinary off-eighth Point Note bodies", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    { type: "Single", beat: 1, lane: 0 },
    { type: "Single", beat: 1.25, lane: 1 },
    { type: "Single", beat: 1.5, lane: 2 },
    { type: "Single", beat: 1.75, lane: 3, skill: true },
    { type: "Single", beat: 2.25, lane: 4, flick: true },
  ]);
  const visuals = prepareBandoriNativeChartVisuals(compiled, false);

  assert.equal(isBandoriNativeShortRhythmUnderEighthBeat(1), false);
  assert.equal(isBandoriNativeShortRhythmUnderEighthBeat(1.25), true);
  assert.equal(isBandoriNativeShortRhythmUnderEighthBeat(1.5), false);
  // JP 189 SPECIAL compiled Notes 69...71 (one-based numbering).
  assert.equal(isBandoriNativeShortRhythmUnderEighthBeat(30.25), true);
  assert.equal(isBandoriNativeShortRhythmUnderEighthBeat(30.5), false);
  assert.equal(isBandoriNativeShortRhythmUnderEighthBeat(30.75), true);
  assert.deepEqual(
    Array.from(compiled.notes.times, (_, index) => (
      isBandoriNativeRhythmSupportNote(compiled, visuals, index)
    )),
    [false, true, false, false, false],
  );
});

test("Habahiro wide Point Notes retain the same off-eighth rhythm eligibility", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    { type: "System", beat: 0, data: "lane_change", laneChange: true },
    { type: "Single", beat: 1, lane: 1, lanes: [1, 2] },
    { type: "Single", beat: 1.25, lane: 3, lanes: [2, 3, 4] },
  ]);
  const visuals = prepareBandoriNativeChartVisuals(compiled, false);

  assert.deepEqual(
    Array.from(compiled.notes.times, (_, index) => (
      isBandoriNativeRhythmSupportNote(compiled, visuals, index)
    )),
    [false, true],
  );
});

test("simultaneous lines chain admitted targets by their facing visual edges", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    { type: "Single", beat: 1, lane: 4 },
    { type: "Single", beat: 1, lane: 0 },
    { type: "Single", beat: 1, lane: 2 },
    {
      type: "Slide",
      connections: [
        { beat: 2, lane: 0 },
        { beat: 3, lane: 1 },
        { beat: 4, lane: 2 },
      ],
    },
    { type: "Single", beat: 3, lane: 5 },
    { type: "Single", beat: 4, lane: 6 },
    { type: "Directional", beat: 5, lane: 2, width: 2, direction: "Right" },
    { type: "Single", beat: 5, lane: 6 },
  ]);
  const visuals = prepareBandoriNativeChartVisuals(compiled, false);

  assert.equal(BANDORI_NATIVE_SYNC_LINE_WIDTH, 0.28);
  assert.deepEqual(collectBandoriNativeSyncLinePairs(compiled, visuals), [
    { leftNoteIndex: 1, leftVisualLane: 0, rightNoteIndex: 2, rightVisualLane: 2 },
    { leftNoteIndex: 2, leftVisualLane: 2, rightNoteIndex: 0, rightVisualLane: 4 },
    { leftNoteIndex: 6, leftVisualLane: 2, rightNoteIndex: 7, rightVisualLane: 6 },
    { leftNoteIndex: 8, leftVisualLane: 3, rightNoteIndex: 9, rightVisualLane: 6 },
  ]);
});

test("simultaneous lines include admitted wide Directional Long and Slide tails", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    {
      type: "Long",
      connections: [
        { beat: 1, lane: 0 },
        { beat: 2, lane: 0, width: 3, direction: "Right", flick: true },
      ],
    },
    { type: "Single", beat: 2, lane: 5 },
    {
      type: "Slide",
      connections: [
        { beat: 3, lane: 6 },
        { beat: 4, lane: 6, width: 3, direction: "Left", flick: true },
      ],
    },
    { type: "Single", beat: 4, lane: 1 },
  ]);
  const visuals = prepareBandoriNativeChartVisuals(compiled, false);

  assert.deepEqual(collectBandoriNativeSyncLinePairs(compiled, visuals), [
    { leftNoteIndex: 1, leftVisualLane: 2, rightNoteIndex: 2, rightVisualLane: 5 },
    { leftNoteIndex: 5, leftVisualLane: 1, rightNoteIndex: 4, rightVisualLane: 4 },
  ]);
});

test("Habahiro simultaneous lines connect multi-range roots rather than Sprite edges", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    { type: "Single", beat: 0.5, lane: 3, laneChange: true },
    { type: "Single", beat: 1, lane: 0, lanes: [0, 1] },
    {
      type: "Slide",
      connections: [
        { beat: 1, lane: 5, lanes: [5, 6] },
        { beat: 2, lane: 5, lanes: [5, 6] },
      ],
    },
  ]);
  const visuals = prepareBandoriNativeChartVisuals(compiled, false);
  assert.deepEqual(collectBandoriNativeSyncLinePairs(compiled, visuals), [
    { leftNoteIndex: 1, leftVisualLane: 0.5, rightNoteIndex: 2, rightVisualLane: 5.5 },
  ]);
});

test("point-note projection uses one native exponential position along the straight lane ray", () => {
  const projectedAtProgressZero = projectBandoriNativeNote(0, 3.5, 0, 5);
  const middle = projectBandoriNativeNote(0, 3.5, 1.75, 5);
  const goal = projectBandoriNativeNote(0, 3.5, 3.5, 5);
  assert.ok(projectedAtProgressZero);
  assert.ok(middle);
  assert.ok(goal);

  const activationStart = {
    screenX: 644.020581394006,
    screenY: 28.46334230205207,
  };
  const horizontalProgress = (middle.screenX - activationStart.screenX)
    / (goal.screenX - activationStart.screenX);
  const verticalProgress = (middle.screenY - activationStart.screenY)
    / (goal.screenY - activationStart.screenY);
  closeTo(horizontalProgress, verticalProgress);
  closeTo(middle.screenX, 603.7233222163983);
  closeTo(middle.screenY, 82.62042237610586);
});

test("ribbon lifecycle keeps future mesh points at Launcher without showing their Note bodies", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 60 },
    {
      type: "Slide",
      connections: [
        { beat: 2, lane: 1 },
        { beat: 4, lane: 3 },
        { beat: 6, lane: 5 },
      ],
    },
  ]);
  const [ribbon] = prepareBandoriNativeChartVisuals(compiled, false).ribbons;

  assert.equal(projectBandoriNativeRibbonPoint(ribbon, 0, 0, -1.501, 5), null);
  const movingHead = projectBandoriNativeRibbonPoint(ribbon, 0, 0, 0, 5);
  const waitingMiddle = projectBandoriNativeRibbonPoint(ribbon, 1, 0, 0, 5);
  const waitingTail = projectBandoriNativeRibbonPoint(ribbon, 2, 0, 0, 5);
  assert.equal(movingHead.phase, "move");
  assert.equal(waitingMiddle.phase, "launcher");
  assert.equal(waitingTail.phase, "launcher");
  assert.equal(isBandoriNativeRibbonPointBodyVisible(movingHead), true);
  assert.equal(isBandoriNativeRibbonPointBodyVisible(waitingMiddle), false);
  assert.equal(isBandoriNativeRibbonPointBodyVisible(waitingTail), false);

  const stoppedHead = projectBandoriNativeRibbonPoint(ribbon, 0, 3, 3, 5);
  const movingMiddle = projectBandoriNativeRibbonPoint(ribbon, 1, 3, 3, 5);
  assert.equal(stoppedHead.phase, "stop");
  assert.equal(movingMiddle.phase, "move");
  assert.equal(isBandoriNativeRibbonPointBodyVisible(stoppedHead), true);
  assert.equal(isBandoriNativeRibbonPointBodyVisible(movingMiddle), true);
  closeTo(stoppedHead.screenX, projectBandoriNativeNote(2, 3, 3, 5).screenX);
  closeTo(stoppedHead.screenY, projectBandoriNativeNote(2, 3, 3, 5).screenY);

  const stoppedMiddle = projectBandoriNativeRibbonPoint(ribbon, 1, 5, 5, 5);
  const movingTail = projectBandoriNativeRibbonPoint(ribbon, 2, 5, 5, 5);
  assert.equal(stoppedMiddle.phase, "stop");
  assert.equal(movingTail.phase, "move");
  assert.equal(isBandoriNativeRibbonPointBodyVisible(stoppedMiddle), true);
  assert.equal(isBandoriNativeRibbonPointBodyVisible(movingTail), true);
  closeTo(stoppedMiddle.screenX, projectBandoriNativeNote(4, 5, 5, 5).screenX);
  assert.equal(projectBandoriNativeRibbonPoint(ribbon, 0, 6.001, 6.001, 5), null);
});

test("the bounded Perfect approximation keeps both original JP hierarchies", () => {
  assert.deepEqual(
    BANDORI_NATIVE_APPROXIMATE_HIT_EFFECTS.normal.staticLayers.map((layer) => layer.id),
    ["star", "Smatt_1", "Sring_2", "ring_2", "ring_3"],
  );
  assert.deepEqual(
    BANDORI_NATIVE_APPROXIMATE_HIT_EFFECTS.skill.staticLayers.map((layer) => layer.id),
    ["Sring_2", "Smatt_1", "star", "Sring_1", "Star_center"],
  );
  assert.equal(BANDORI_NATIVE_APPROXIMATE_HIT_EFFECTS.normal.kira.count, 25);
  assert.equal(BANDORI_NATIVE_APPROXIMATE_HIT_EFFECTS.skill.kira.count, 25);
  assert.equal(BANDORI_NATIVE_APPROXIMATE_HIT_EFFECTS.normal.staticLayers[1].order, 5);
  assert.equal(BANDORI_NATIVE_APPROXIMATE_HIT_EFFECTS.normal.staticLayers[1].projection, "stretched");
  assert.equal(BANDORI_NATIVE_APPROXIMATE_HIT_EFFECTS.skill.staticLayers[1].projection, "stretched");
  assert.equal(BANDORI_NATIVE_APPROXIMATE_HIT_EFFECTS.skill.staticLayers[1].localScaleX, 0.5);
  assert.match(BANDORI_NATIVE_TAP_EFFECT_ATLAS_1_URL, /skin00\/textures\/Tex_parSet_1\.png$/u);
  assert.match(BANDORI_NATIVE_TAP_EFFECT_ATLAS_2_URL, /skin00\/textures\/Tex_parSet_2\.png$/u);
  assert.doesNotMatch(
    `${BANDORI_NATIVE_TAP_EFFECT_ATLAS_1_URL}\n${BANDORI_NATIVE_TAP_EFFECT_ATLAS_2_URL}`,
    /\/(?:jp|cn)\//iu,
  );
  assert.deepEqual(
    BANDORI_NATIVE_LANE_EFFECTS.map(({ file, flipX }) => [file, flipX]),
    [
      ["NoteLaneEffect_1.png", false],
      ["NoteLaneEffect_2.png", false],
      ["NoteLaneEffect_3.png", false],
      ["NoteLaneEffect_4.png", false],
      ["NoteLaneEffect_3.png", true],
      ["NoteLaneEffect_2.png", true],
      ["NoteLaneEffect_1.png", true],
    ],
  );
});

test("Perfect hit events route Flick and Directional roots, mirrors, fingers, and ribbon tails", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    { type: "Single", beat: 1, lane: 0 },
    { type: "Single", beat: 2, lane: 1, skill: true },
    { type: "Single", beat: 3, lane: 2, flick: true },
    { type: "Directional", beat: 4, lane: 3, width: 2, direction: "Left" },
    { type: "Directional", beat: 5, lane: 2, width: 1, direction: "Right", skill: true },
    {
      type: "Long",
      connections: [
        { beat: 6, lane: 1 },
        { beat: 7, lane: 1, flick: true, skill: true },
      ],
    },
    {
      type: "Slide",
      connections: [
        { beat: 8, lane: 5 },
        { beat: 9, lane: 5, width: 2, direction: "Left", flick: true, skill: true },
      ],
    },
  ]);
  const visuals = prepareBandoriNativeChartVisuals(compiled, true);
  assert.deepEqual(
    collectBandoriNativeHitEvents(compiled, visuals, 0, 5),
    [
      {
        fingerKind: null,
        index: 0,
        kind: "normal",
        lane: 6,
        rangeWidth: 1,
        terminalLane: null,
        timeSeconds: 0.5,
        triggersLaneEffect: true,
      },
      {
        fingerKind: null,
        index: 1,
        kind: "skill",
        lane: 5,
        rangeWidth: 1,
        terminalLane: null,
        timeSeconds: 1,
        triggersLaneEffect: true,
      },
      {
        fingerKind: null,
        index: 2,
        kind: "flick",
        lane: 4,
        rangeWidth: 1,
        terminalLane: null,
        timeSeconds: 1.5,
        triggersLaneEffect: true,
      },
      {
        fingerKind: "directional-finger-right",
        index: 3,
        kind: "directional-right-2",
        lane: 3,
        rangeWidth: 1,
        terminalLane: 3,
        timeSeconds: 2,
        triggersLaneEffect: true,
      },
      {
        fingerKind: "directional-finger-left",
        index: 4,
        kind: "skill",
        lane: 4,
        rangeWidth: 1,
        terminalLane: 4,
        timeSeconds: 2.5,
        triggersLaneEffect: true,
      },
      {
        fingerKind: null,
        index: 5,
        kind: "normal",
        lane: 5,
        rangeWidth: 1,
        terminalLane: null,
        timeSeconds: 3,
        triggersLaneEffect: true,
      },
      {
        fingerKind: null,
        index: 6,
        kind: "flick",
        lane: 5,
        rangeWidth: 1,
        terminalLane: null,
        timeSeconds: 3.5,
        triggersLaneEffect: true,
      },
      {
        fingerKind: null,
        index: 7,
        kind: "normal",
        lane: 1,
        rangeWidth: 1,
        terminalLane: null,
        timeSeconds: 4,
        triggersLaneEffect: true,
      },
      {
        fingerKind: "directional-finger-right",
        index: 8,
        kind: "directional-right-2",
        lane: 1,
        rangeWidth: 1,
        terminalLane: 1,
        timeSeconds: 4.5,
        triggersLaneEffect: true,
      },
    ],
  );
  assert.deepEqual(collectBandoriNativeHitEvents(compiled, visuals, 2, 1), []);
});

test("Directional width 1 through 7 uses the native three-main buckets at the scalar root", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    { type: "Directional", beat: 1, lane: 2, width: 1, direction: "Right" },
    { type: "Directional", beat: 2, lane: 2, width: 2, direction: "Right" },
    { type: "Directional", beat: 3, lane: 2, width: 3, direction: "Right" },
    { type: "Directional", beat: 4, lane: 0, width: 4, direction: "Right" },
    { type: "Directional", beat: 5, lane: 0, width: 5, direction: "Right" },
    { type: "Directional", beat: 6, lane: 0, width: 6, direction: "Right" },
    { type: "Directional", beat: 7, lane: 0, width: 7, direction: "Right" },
    { type: "Directional", beat: 8, lane: 4, width: 1, direction: "Left" },
    { type: "Directional", beat: 9, lane: 4, width: 2, direction: "Left" },
    { type: "Directional", beat: 10, lane: 4, width: 3, direction: "Left" },
    { type: "Directional", beat: 11, lane: 6, width: 4, direction: "Left" },
    { type: "Directional", beat: 12, lane: 6, width: 5, direction: "Left" },
    { type: "Directional", beat: 13, lane: 6, width: 6, direction: "Left" },
    { type: "Directional", beat: 14, lane: 6, width: 7, direction: "Left" },
  ]);
  const visuals = prepareBandoriNativeChartVisuals(compiled, false);
  const events = collectBandoriNativeHitEvents(compiled, visuals, 0, 7.5);
  assert.deepEqual(
    events.map(({ fingerKind, kind, lane, rangeWidth, terminalLane }) => ({
      fingerKind,
      kind,
      lane,
      rangeWidth,
      terminalLane,
    })),
    [
      ["directional-right-1", 2, 2],
      ["directional-right-2", 2, 2],
      ["directional-right-3", 2, 3],
      ["directional-right-3", 0, 1],
      ["directional-right-3", 0, 1],
      ["directional-right-3", 0, 1],
      ["directional-right-3", 0, 1],
      ["directional-left-1", 4, 4],
      ["directional-left-2", 4, 4],
      ["directional-left-3", 4, 3],
      ["directional-left-3", 6, 5],
      ["directional-left-3", 6, 5],
      ["directional-left-3", 6, 5],
      ["directional-left-3", 6, 5],
    ].map(([kind, lane, terminalLane]) => ({
      fingerKind: kind.startsWith("directional-left")
        ? "directional-finger-left"
        : "directional-finger-right",
      kind,
      lane,
      rangeWidth: 1,
      terminalLane,
    })),
  );
  assert.equal(events.length, 14);
  assert.ok(events.every((event) => event.fingerKind !== null));
  assert.ok(events.every((event) => event.rangeWidth === 1));
  assert.deepEqual(
    events.slice(3, 7).map((event) => event.kind),
    Array(4).fill("directional-right-3"),
  );
  assert.deepEqual(
    events.slice(10).map((event) => event.kind),
    Array(4).fill("directional-left-3"),
  );
  assert.equal(
    getBandoriNativeSwipeParticleWidthScale(
      "flick",
      7,
      { hierarchyPath: "effect_tap_swipe/square" },
    ),
    7,
  );
  assert.equal(
    getBandoriNativeSwipeParticleWidthScale(
      "flick",
      7,
      { hierarchyPath: "effect_tap_swipe/slash" },
    ),
    1,
  );
});

test("Long and Slide Directional tails share the width 3 main and one finger through width 7", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    {
      type: "Long",
      connections: [
        { beat: 1, lane: 0 },
        { beat: 2, lane: 0, width: 7, direction: "Right", flick: true },
      ],
    },
    {
      type: "Slide",
      connections: [
        { beat: 3, lane: 6 },
        { beat: 4, lane: 6, width: 7, direction: "Left", flick: true },
      ],
    },
  ]);
  const visuals = prepareBandoriNativeChartVisuals(compiled, false);
  assert.deepEqual(
    collectBandoriNativeHitEvents(compiled, visuals, 0, 2.5)
      .filter((event) => event.fingerKind !== null)
      .map(({ fingerKind, kind, lane, rangeWidth, terminalLane }) => ({
        fingerKind,
        kind,
        lane,
        rangeWidth,
        terminalLane,
      })),
    [
      {
        fingerKind: "directional-finger-right",
        kind: "directional-right-3",
        lane: 0,
        rangeWidth: 1,
        terminalLane: 1,
      },
      {
        fingerKind: "directional-finger-left",
        kind: "directional-left-3",
        lane: 6,
        rangeWidth: 1,
        terminalLane: 5,
      },
    ],
  );
});

test("Habahiro hit effects use range-specific selection at the lower-middle button", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    { type: "System", beat: 0, data: "lane_change", laneChange: true },
    { type: "Single", beat: 1, lane: 1, lanes: [1, 2] },
    { type: "Single", beat: 2, lane: 3, lanes: [2, 3, 4], skill: true },
    { type: "Single", beat: 3, lane: 3, lanes: [0, 1, 2, 3, 4, 5, 6], flick: true },
    {
      type: "Long",
      connections: [
        { beat: 4, lane: 4, lanes: [4, 5] },
        { beat: 5, lane: 4, lanes: [4, 5] },
      ],
    },
    {
      type: "Slide",
      connections: [
        { beat: 6, lane: 1, lanes: [0, 1, 2] },
        { beat: 7, lane: 3, lanes: [3, 4] },
        { beat: 8, lane: 5, lanes: [5, 6], flick: true },
      ],
    },
  ]);
  const visuals = prepareBandoriNativeChartVisuals(compiled, false);
  assert.deepEqual(
    collectBandoriNativeHitEvents(compiled, visuals, 0, 5).map((event) => [
      event.kind,
      event.lane,
      event.rangeWidth,
    ]),
    [
      ["normal", 1, 2],
      ["skill", 3, 3],
      ["flick", 3, 7],
      ["normal", 4, 2],
      ["normal", 4, 2],
      ["normal", 1, 3],
      ["normal", 3, 2],
      ["flick", 5, 2],
    ],
  );
  assert.deepEqual(collectBandoriNativeLaneEffectEvents(compiled, visuals, 0, 5), []);
  assert.equal(
    getBandoriHabahiroLongFlashSpriteName([0, 1, 2]),
    "note_long_flash_0_1_2",
  );
});

test("Long and Slide AutoPerfect lifecycle keeps only confirmed sustained and one-shot effects", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    {
      type: "Long",
      connections: [
        { beat: 1, lane: 1, skill: true },
        { beat: 2, lane: 1 },
      ],
    },
    {
      type: "Slide",
      connections: [
        { beat: 3, lane: 2, skill: true },
        { beat: 4, lane: 3, skill: true },
        { beat: 5, lane: 4, hidden: true },
        { beat: 6, lane: 5 },
      ],
    },
  ]);
  const visuals = prepareBandoriNativeChartVisuals(compiled, false);
  assert.deepEqual(
    collectBandoriNativeHitEvents(compiled, visuals, 0, 4).map((event) => [
      event.timeSeconds,
      event.kind,
      event.lane,
    ]),
    [
      [0.5, "skill", 1],
      [1, "normal", 1],
      [1.5, "skill", 2],
      [2, "normal", 3],
      [3, "normal", 5],
    ],
  );
  assert.deepEqual(
    collectBandoriNativeLaneEffectEvents(compiled, visuals, 0, 4).map((event) => [
      event.timeSeconds,
      event.action,
      event.lane,
    ]),
    [
      [0.5, "on-reserve", 1],
      [1, "on-reserve", 1],
      [1.5, "on-reserve", 2],
      [1.5, "on-reserve", 3],
      [2, "off", 2],
      [2, "on-reserve", 3],
      [3, "off", 3],
      [3, "on-reserve", 5],
    ],
  );

  assert.deepEqual(
    collectBandoriNativeHoldStates(visuals, 0.75).map((state) => [
      state.ribbon.kind,
      state.pointIndex,
      state.elapsedSeconds,
    ]),
    [["long", 0, 0.25]],
  );
  assert.deepEqual(
    collectBandoriNativeHoldStates(visuals, 2.6).map((state) => [
      state.ribbon.kind,
      state.pointIndex,
    ]),
    [["slide", 2]],
  );
  assert.deepEqual(collectBandoriNativeHoldStates(visuals, 3), []);

  const movingState = collectBandoriNativeHoldStates(visuals, 2.25)[0];
  const movingProjection = projectBandoriNativeHoldState(
    movingState,
    getBandoriCompiledBeatAtTime(compiled, 2.25),
    2.25,
    BANDORI_NATIVE_NOTE_SPEED_DEFAULT,
  );
  const leftProjection = projectBandoriNativeNote(3, 2.25, 2.25);
  const rightProjection = projectBandoriNativeNote(4, 2.25, 2.25);
  assert.ok(movingProjection);
  assert.ok(leftProjection);
  assert.ok(rightProjection);
  assert.ok(movingProjection.screenX > leftProjection.screenX);
  assert.ok(movingProjection.screenX < rightProjection.screenX);

  const slideRibbon = visuals.ribbons.find((ribbon) => ribbon.kind === "slide");
  const longRibbon = visuals.ribbons.find((ribbon) => ribbon.kind === "long");
  assert.ok(slideRibbon);
  assert.ok(longRibbon);
  const movingHead = projectBandoriNativeRibbonBody(
    slideRibbon,
    0,
    getBandoriCompiledBeatAtTime(compiled, 2.25),
    2.25,
    BANDORI_NATIVE_NOTE_SPEED_DEFAULT,
  );
  assert.ok(movingHead);
  closeTo(movingHead.screenX, movingProjection.screenX);
  closeTo(movingHead.screenY, movingProjection.screenY);
  assert.equal(
    projectBandoriNativeRibbonBody(
      slideRibbon,
      1,
      getBandoriCompiledBeatAtTime(compiled, 2.25),
      2.25,
      BANDORI_NATIVE_NOTE_SPEED_DEFAULT,
    ),
    null,
  );
  assert.ok(projectBandoriNativeRibbonBody(
    slideRibbon,
    3,
    getBandoriCompiledBeatAtTime(compiled, 2.25),
    2.25,
    BANDORI_NATIVE_NOTE_SPEED_DEFAULT,
  ));
  assert.ok(projectBandoriNativeRibbonBody(
    longRibbon,
    0,
    getBandoriCompiledBeatAtTime(compiled, 0.75),
    0.75,
    BANDORI_NATIVE_NOTE_SPEED_DEFAULT,
  ));
  assert.equal(
    projectBandoriNativeRibbonBody(
      longRibbon,
      0,
      getBandoriCompiledBeatAtTime(compiled, 1),
      1,
      BANDORI_NATIVE_NOTE_SPEED_DEFAULT,
    ),
    null,
  );

  closeTo(evaluateBandoriNativeLongFlashColor(0).red, 0.2000000030);
  closeTo(
    evaluateBandoriNativeLongFlashColor(BANDORI_NATIVE_LONG_FLASH_PEAK_SECONDS).red,
    0.6000000238,
    1e-7,
  );
  closeTo(
    evaluateBandoriNativeLongFlashColor(BANDORI_NATIVE_LONG_FLASH_PERIOD_SECONDS).red,
    0.2000000030,
  );

  const seed = getBandoriNativeHoldEffectSeed(2);
  const runtime = createBandoriNativeHoldEffectRuntime(seed);
  assert.equal(runtime.frame.isRootActive, false);
  const playing = runtime.play(0, seed);
  assert.equal(playing.isRootActive, true);
  assert.ok(runtime.sample(0.5).count > 0);
  const stopped = runtime.stop();
  assert.equal(stopped.isRootActive, false);
  assert.equal(stopped.count, 0);
  assert.match(BANDORI_NATIVE_HOLD_EFFECT_TEXTURE_URLS["tap-set2"], /Tex_parSet_2\.png$/u);
  assert.match(getBandoriNativeLongFlashUrl(BANDORI_NATIVE_NOTE_SKINS[0], 4), /skin00\/sprites\/note_long_flash_4\.png$/u);

  const baseLongRuntime = createBandoriNativeHoldEffectRuntime(seed, {
    kind: "long",
    rangeWidth: 1,
  });
  const wideLongRuntime = createBandoriNativeHoldEffectRuntime(seed, {
    kind: "long",
    rangeWidth: 3,
  });
  const wideSlideRuntime = createBandoriNativeHoldEffectRuntime(seed, {
    kind: "slide",
    rangeWidth: 7,
  });
  for (const candidate of [baseLongRuntime, wideLongRuntime, wideSlideRuntime]) {
    candidate.play(0, seed);
  }
  const baseLongFrame = baseLongRuntime.sample(0.01);
  const wideLongFrame = wideLongRuntime.sample(0.01);
  const wideSlideFrame = wideSlideRuntime.sample(0.01);
  const square = (frame) => frame.instances
    .slice(0, frame.count)
    .find((instance) => instance.hierarchyPath.endsWith("/par_square"));
  assert.ok(square(baseLongFrame));
  assert.ok(square(wideLongFrame));
  assert.ok(square(wideSlideFrame));
  assert.ok(square(wideLongFrame).widthPixels > square(baseLongFrame).widthPixels * 3);
  assert.equal(square(wideSlideFrame).widthPixels, square(baseLongFrame).widthPixels);
  assert.equal(
    wideLongFrame.instances
      .slice(0, wideLongFrame.count)
      .some((instance) => instance.hierarchyPath.includes("par_parOnpu")),
    false,
  );
  assert.equal(
    wideSlideFrame.instances
      .slice(0, wideSlideFrame.count)
      .some((instance) => instance.hierarchyPath.includes("par_parOnpu")),
    true,
  );
});

test("Slide lane effects pulse scalar buttons without treating hidden nodes as checkpoints", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    {
      type: "Slide",
      connections: [
        { beat: 1, lane: 5 },
        { beat: 2, lane: 6, hidden: true },
        { beat: 3, lane: 2, width: 3, direction: "Left", flick: true },
      ],
    },
    {
      type: "Slide",
      connections: [
        { beat: 4, lane: 4 },
        { beat: 5, lane: 4 },
      ],
    },
  ]);
  const visuals = prepareBandoriNativeChartVisuals(compiled, false);
  assert.deepEqual(
    collectBandoriNativeLaneEffectEvents(compiled, visuals, 0, 3).map((event) => [
      event.timeSeconds,
      event.action,
      event.lane,
    ]),
    [
      [0.5, "on-reserve", 5],
      [0.5, "on-reserve", 6],
      [1.5, "off", 5],
      [1.5, "on-reserve", 2],
      [2, "on-reserve", 4],
      [2, "on-reserve", 4],
      [2.5, "off", 4],
      [2.5, "on-reserve", 4],
    ],
  );
});

test("the only randomized layer is deterministic and stays inside JP envelopes", () => {
  const event = { index: 7, kind: "normal", lane: 3, timeSeconds: 4 };
  const first = createBandoriApproximateKiraParticles(event);
  const second = createBandoriApproximateKiraParticles(event);
  assert.deepEqual(first, second);
  assert.equal(first.length, 25);
  for (const particle of first) {
    assert.ok(particle.lifetimeSeconds >= 0.3 && particle.lifetimeSeconds <= 0.6000000238418579);
    assert.ok(particle.sizeWorld >= 0.2 && particle.sizeWorld <= 0.6000000238418579);
    assert.ok(particle.speedWorldPerSecond >= 1 && particle.speedWorldPerSecond <= 40);
    assert.ok(particle.spawnXWorld >= -1.25 && particle.spawnXWorld <= 1.25);
    assert.ok(particle.spawnYWorld >= 0.029999971389770508);
    assert.ok(particle.spawnYWorld <= 0.7500000000000000);
  }
  const initial = evaluateBandoriApproximateKiraParticle("normal", first[0], 0);
  const later = evaluateBandoriApproximateKiraParticle("normal", first[0], 0.1);
  assert.ok(initial);
  assert.ok(later);
  assert.ok(later.worldY > initial.worldY);
  assert.equal(
    evaluateBandoriApproximateKiraParticle("normal", first[0], first[0].lifetimeSeconds),
    null,
  );

  const normalStar = BANDORI_NATIVE_APPROXIMATE_HIT_EFFECTS.normal.staticLayers[0];
  const starStart = evaluateBandoriApproximateStaticHitLayer(normalStar, 0);
  assert.ok(starStart);
  closeTo(starStart.red, 0.2705882489681244);
  closeTo(starStart.green, 0.8980392217636108);
  closeTo(starStart.blue, 0.7960784435272217);
  assert.equal(
    evaluateBandoriApproximateStaticHitLayer(normalStar, normalStar.lifetimeSeconds),
    null,
  );
});

test("JP Flick and Directional recipes execute the recovered particle module allowlist", () => {
  const kinds = [
    "flick",
    "directional-left-1",
    "directional-left-2",
    "directional-left-3",
    "directional-right-1",
    "directional-right-2",
    "directional-right-3",
    "directional-finger-left",
    "directional-finger-right",
  ];
  const counts = new Map();
  for (const kind of kinds) {
    const seed = 42;
    const runtime = createBandoriNativeSwipeEffectRuntime(kind, 3, seed);
    const frame = runtime.play(0.1, seed);
    assert.equal(frame.isPlaying, true);
    assert.ok(frame.count > 0, `${kind} must produce a visible burst`);
    for (const instance of frame.instances.slice(0, frame.count)) {
      assert.equal(instance.blendSource, "src-alpha");
      assert.equal(instance.blendDestination, "one");
      assert.equal(instance.blendEquation, "add");
      assert.equal(instance.premultipliedAlpha, false);
      assert.ok(instance.uv.index >= 0 && instance.uv.index < 16);
    }
    counts.set(kind, frame.count);
  }
  assert.equal(counts.get("flick"), 21);
  assert.equal(counts.get("directional-left-1"), counts.get("directional-right-1"));
  assert.equal(counts.get("directional-left-2"), counts.get("directional-right-2"));
  assert.equal(counts.get("directional-left-3"), counts.get("directional-right-3"));
  assert.equal(counts.get("directional-finger-left"), 4);
  assert.equal(counts.get("directional-finger-right"), 4);
  assert.notEqual(
    getBandoriNativeSwipeEffectSeed(1, 3, "flick"),
    getBandoriNativeSwipeEffectSeed(1, 3, "directional-left-1"),
  );

  const placement = getBandoriNativeSwipeEffectPlacement("directional-left-3", 3);
  assert.ok(placement.pixelsPerWorldUnit > 0);
  assert.equal(BANDORI_NATIVE_DIRECTIONAL_EFFECT_FRAME_URLS.length, 16);
  assert.match(BANDORI_NATIVE_SWIPE_EFFECT_TEXTURE_URLS["tap-light"], /tapeffect\/skin00\/textures\/light\.png$/u);
  assert.doesNotMatch(
    `${Object.values(BANDORI_NATIVE_SWIPE_EFFECT_TEXTURE_URLS).join("\n")}\n${BANDORI_NATIVE_DIRECTIONAL_EFFECT_FRAME_URLS.join("\n")}`,
    /\/(?:jp|cn)\//iu,
  );

  const directional = createBandoriNativeSwipeEffectRuntime(
    "directional-left-3",
    3,
    9,
  ).play(0.1, 9);
  assert.ok(
    directional.instances
      .slice(0, directional.count)
      .some(isBandoriNativeDirectionalTerminalParticle),
  );
});

test("approved slash beams are corrected while Persona line1 retains its authored position", () => {
  const judgmentScreenY = 700;
  const assertApprovedSlashPlacement = (kind) => {
    const frame = createBandoriNativeSwipeEffectRuntime(kind, 3, 9).play(0, 9);
    const slash = frame.instances
      .slice(0, frame.count)
      .find((instance) => instance.hierarchyPath.endsWith("/slash"));
    assert.ok(slash);
    const verticalExtentPixels = Math.abs(slash.basisX.y * slash.widthPixels)
      + Math.abs(slash.basisY.y * slash.heightPixels);
    const screenY = getBandoriApprovedManualVerticalBeamScreenY(
      kind,
      judgmentScreenY,
      slash,
    );
    assert.ok(Math.abs(
      screenY - (judgmentScreenY + verticalExtentPixels / 6),
    ) < 1e-9);
    assert.ok(Math.abs(
      screenY - verticalExtentPixels / 2
        - (judgmentScreenY - verticalExtentPixels / 3),
    ) < 1e-9);
    assert.ok(Math.abs(
      screenY + verticalExtentPixels / 2
        - (judgmentScreenY + verticalExtentPixels * 2 / 3),
    ) < 1e-9);
  };

  assert.equal(BANDORI_APPROVED_MANUAL_VERTICAL_BEAM_ABOVE_JUDGMENT_RATIO, 1 / 3);
  assertApprovedSlashPlacement("flick");
  assertApprovedSlashPlacement("directional-finger-left");
  assertApprovedSlashPlacement("directional-finger-right");

  const personaFlickLine = {
    basisX: { x: 1, y: 0 },
    basisY: { x: 0, y: 1 },
    heightPixels: 1_200,
    hierarchyPath: "effect_tap_swipe/line1",
    screenY: 1_260,
    widthPixels: 300,
  };
  assert.equal(
    getBandoriApprovedManualVerticalBeamScreenY(
      "flick",
      judgmentScreenY,
      personaFlickLine,
    ),
    personaFlickLine.screenY,
  );
  assert.equal(
    getBandoriApprovedAnimatedTravelScreenY(
      personaFlickLine.screenY,
      personaFlickLine.screenY,
      4,
    ),
    personaFlickLine.screenY,
  );
  assert.equal(
    getBandoriApprovedAnimatedTravelScreenY(
      personaFlickLine.screenY,
      personaFlickLine.screenY - 130,
      4,
    ),
    personaFlickLine.screenY - 520,
  );

  const directionalFrame = createBandoriNativeSwipeEffectRuntime(
    "directional-left-1",
    3,
    9,
  ).play(0, 9);
  const directionalParticle = directionalFrame.instances[0];
  assert.equal(
    getBandoriApprovedManualVerticalBeamScreenY(
      "directional-left-1",
      judgmentScreenY,
      directionalParticle,
    ),
    directionalParticle.screenY,
  );
});

test("approved Directional notes keep the inner root fixed while source length grows outward", () => {
  const runtime = createBandoriNativeSwipeEffectRuntime(
    "directional-right-1",
    3,
    9,
  );
  const firstFrame = runtime.play(0, 9);
  const firstNotes = firstFrame.instances
    .slice(0, firstFrame.count)
    .find(isBandoriNativeDirectionalTerminalParticle);
  assert.ok(firstNotes);
  const firstWidth = firstNotes.widthPixels;
  const firstOffset = getBandoriApprovedManualDirectionalNotesCenterOffsetPixels(firstNotes);

  const laterFrame = runtime.play(0.1, 9);
  const laterNotes = laterFrame.instances
    .slice(0, laterFrame.count)
    .find(isBandoriNativeDirectionalTerminalParticle);
  assert.ok(laterNotes);
  const laterWidth = laterNotes.widthPixels;
  const laterOffset = getBandoriApprovedManualDirectionalNotesCenterOffsetPixels(laterNotes);

  assert.equal(firstOffset, firstWidth / 2);
  assert.equal(laterOffset, laterWidth / 2);
  assert.ok(laterOffset > firstOffset);
  assert.equal(
    getBandoriApprovedManualDirectionalNotesCenterOffsetPixels({
      hierarchyPath: "effect_tap_directional_flick_r/glow",
      widthPixels: 100,
    }),
    0,
  );
});

test("Directional width 3 preserves its two source notes bursts", () => {
  const countNotes = (kind) => {
    const frame = createBandoriNativeSwipeEffectRuntime(kind, 3, 9).play(0.15, 9);
    return frame.instances
      .slice(0, frame.count)
      .filter(isBandoriNativeDirectionalTerminalParticle)
      .length;
  };
  assert.equal(countNotes("directional-right-2"), 1);
  assert.equal(countNotes("directional-right-3"), 2);
});

test("Fixed Random Color selects every authored discrete color interval", () => {
  const fixedRandomColor = {
    mode: "random-color-from-gradient",
    domain: "spawn",
    gradient: {
      interpolation: "fixed",
      serializedColorSpace: -1,
      colorKeys: [
        { time: 0.7, color: { r: 1, g: 0, b: 0 } },
        { time: 1, color: { r: 0, g: 0, b: 1 } },
      ],
      alphaKeys: [
        { time: 0, alpha: 1 },
        { time: 1, alpha: 1 },
      ],
    },
    sample: "uniform-gradient-position-once-per-particle",
  };

  assert.deepEqual(
    evaluateBandoriEffectGradient(fixedRandomColor, 0, 0.7),
    { r: 1, g: 0, b: 0, a: 1 },
  );
  assert.deepEqual(
    evaluateBandoriEffectGradient(fixedRandomColor, 0, 0.700001),
    { r: 0, g: 0, b: 1, a: 1 },
  );

  const sourceColors = new Set();
  for (let seed = 0; seed < 128; seed += 1) {
    const frame = createBandoriNativeSwipeEffectRuntime(
      "directional-left-1",
      3,
      seed,
    ).play(0, seed);
    for (const instance of frame.instances.slice(0, frame.count)) {
      if (!instance.hierarchyPath.endsWith("/star_1")) continue;
      sourceColors.add(`${instance.color.r},${instance.color.g},${instance.color.b}`);
    }
  }
  assert.ok(sourceColors.size >= 2);
});

test("bounded effects evaluate verified lifetime velocity and built-in Quad meshes", () => {
  const baselineRecipe = structuredClone(nativeSwipeEffectRecipes.flick);
  const aprilRecipe = structuredClone(nativeSwipeEffectRecipes.flick);
  const hierarchyPath = "effect_tap_swipe/glow";
  const target = aprilRecipe.root.children.find(
    (node) => node.hierarchyPath === hierarchyPath,
  );
  assert.ok(target?.particleSystem);
  assert.ok(target.renderer);
  const constant = (value, unit) => ({
    mode: "constant",
    unit,
    domain: "normalized-particle-lifetime",
    value,
  });
  target.particleSystem.modules.velocityOverLifetime = {
    space: "world",
    x: constant(0, "world-units-per-second"),
    y: constant(20, "world-units-per-second"),
    z: constant(0, "world-units-per-second"),
    speedModifier: constant(1, "velocity-multiplier"),
  };
  target.renderer.mode = "mesh";
  target.renderer.mesh = {
    geometry: "unity-builtin-quad",
    fileId: 1,
    pathId: 10210,
  };

  const sample = (recipe) => {
    const runtime = createBandoriEffectRecipeRuntime(recipe, {
      buttonIndex: 3,
      seed: 27,
    });
    runtime.play(0, 27);
    return runtime.sample(0.05).instances
      .slice(0, runtime.frame.count)
      .filter((instance) => instance.hierarchyPath === hierarchyPath);
  };
  const baseline = sample(baselineRecipe);
  const april = sample(aprilRecipe);
  assert.equal(april.length, baseline.length);
  assert.ok(april.length > 0);
  assert.ok(april.every((instance) => instance.rendererMode === "mesh"));
  const averageY = (instances) => instances.reduce(
    (sum, instance) => sum + instance.screenY,
    0,
  ) / instances.length;
  assert.ok(averageY(april) < averageY(baseline));
});

test("effect recipes fail closed for ignored Unity lifecycle and direction fields", () => {
  const findNode = (node, predicate) => {
    if (predicate(node)) return node;
    for (const child of node.children) {
      const match = findNode(child, predicate);
      if (match) return match;
    }
    return null;
  };
  const assertRejected = (mutate, expected) => {
    const recipe = structuredClone(nativeSwipeEffectRecipes.flick);
    mutate(recipe);
    assert.throws(
      () => createBandoriEffectRecipeRuntime(recipe, {
        buttonIndex: 3,
        seed: 27,
      }),
      expected,
    );
  };

  assertRejected((recipe) => {
    recipe.root.particleSystem.playOnAwake = true;
  }, /playOnAwake.*outside the runtime lifecycle/u);
  assertRejected((recipe) => {
    recipe.root.particleSystem.useUnscaledTime = true;
  }, /useUnscaledTime.*unsupported/u);
  assertRejected((recipe) => {
    recipe.root.particleSystem.scalingSpace = "hierarchy";
  }, /scalingSpace.*unsupported/u);
  assertRejected((recipe) => {
    recipe.root.particleSystem.cullingMode = "pause";
  }, /cullingMode.*unsupported/u);
  assertRejected((recipe) => {
    const node = findNode(
      recipe.root,
      (candidate) => candidate.particleSystem?.modules.shape?.direction,
    );
    assert.ok(node);
    node.particleSystem.modules.shape.direction.alignToDirection = true;
  }, /alignToDirection.*unsupported/u);
});

test("compiled effect recipes validate once while keeping runtime state isolated", () => {
  const compiledRecipe = compileBandoriEffectRecipe(nativeSwipeEffectRecipes.flick);
  const first = createBandoriEffectRecipeRuntime(compiledRecipe, {
    buttonIndex: 3,
    seed: 27,
  });
  const second = createBandoriEffectRecipeRuntime(compiledRecipe, {
    buttonIndex: 3,
    seed: 27,
  });
  first.play(0, 27);
  second.play(0, 27);
  first.sample(0.2);
  const secondFrame = second.sample(0.05);
  const baseline = createBandoriEffectRecipeRuntime(compiledRecipe, {
    buttonIndex: 3,
    seed: 27,
  });
  baseline.play(0, 27);
  const baselineFrame = baseline.sample(0.05);

  assert.equal(secondFrame.count, baselineFrame.count);
  assert.deepEqual(
    secondFrame.instances.slice(0, secondFrame.count),
    baselineFrame.instances.slice(0, baselineFrame.count),
  );
});

test("Witch custom Mesh recipes retain 3D geometry and CustomData U scrolling", () => {
  const recipe = structuredClone(nativeSwipeEffectRecipes.flick);
  const hierarchyPath = "effect_tap_swipe/glow";
  const target = recipe.root.children.find(
    (node) => node.hierarchyPath === hierarchyPath,
  );
  assert.ok(target?.particleSystem);
  assert.ok(target.renderer);
  const pathId = "7141092885653479763";
  const vertices = Array.from({ length: 35 }, (_, index) => [
    index % 2 === 0 ? -1 : 1,
    0,
    (index / 34) * 10,
  ]).flat();
  recipe.meshes = {
    [pathId]: {
      indices: Array.from({ length: 96 }, (_, index) => index % 35),
      name: "screwTower",
      pathId,
      profile: "witch-screw-tower-v1",
      rawObjectSha256:
        "e7e2328d60c428527f7d0b545ce86d4ed70e308e6d1025818b8ba8b86084242a",
      uvs: Array.from({ length: 35 }, (_, index) => [index / 34, index % 2]).flat(),
      vertices,
    },
  };
  target.renderer.mode = "mesh";
  target.renderer.mesh = {
    fileId: 0,
    geometry: "bounded-custom-mesh",
    pathId,
  };
  const materialId = target.renderer.materials[0];
  recipe.materials[materialId].sampler = {
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  };
  target.particleSystem.modules.initial.startRotation = {
    separateAxes: true,
    x: { domain: "spawn", mode: "constant", unit: "radians", value: -Math.PI / 2 },
    y: { domain: "spawn", mode: "constant", unit: "radians", value: 0 },
    z: { domain: "spawn", mode: "constant", unit: "radians", value: 0 },
  };
  target.particleSystem.modules.customData = {
    profile: "witch-vector0-w-uv-scroll-u-v1",
    vector0W: {
      domain: "normalized-particle-lifetime",
      mode: "constant",
      unit: "shader-custom-data",
      value: 0.5,
    },
  };

  const runtime = createBandoriEffectRecipeRuntime(recipe, {
    buttonIndex: 3,
    seed: 27,
  });
  runtime.play(0, 27);
  const meshInstance = runtime.sample(0.05).instances
    .slice(0, runtime.frame.count)
    .find((instance) => instance.hierarchyPath === hierarchyPath);
  assert.ok(meshInstance?.mesh);
  assert.equal(meshInstance.mesh.pathId, pathId);
  assert.equal(meshInstance.mesh.vertices.length, 70);
  assert.equal(meshInstance.mesh.uvs.length, 70);
  assert.equal(meshInstance.mesh.indices.length, 96);
  assert.equal(meshInstance.mesh.uvOffsetU, 0.5);
  assert.equal(meshInstance.textureAddressModeU, "clamp-to-edge");
  assert.equal(meshInstance.textureAddressModeV, "clamp-to-edge");
  assert.ok(meshInstance.heightPixels > meshInstance.widthPixels);

  const unsupportedSamplerRecipe = structuredClone(recipe);
  unsupportedSamplerRecipe.materials[materialId].sampler.addressModeU = "mirror-repeat";
  assert.throws(
    () => createBandoriEffectRecipeRuntime(unsupportedSamplerRecipe, {
      buttonIndex: 3,
      seed: 27,
    }),
    /unsupported texture address mode/u,
  );
});

test("Miku separate-axis Size over Lifetime scales rendered X and Y independently", () => {
  const hierarchyPath = "effect_tap_swipe/glow";
  const constant = (value) => ({
    mode: "constant",
    unit: "start-size-multiplier",
    domain: "normalized-particle-lifetime",
    value,
  });
  const createRecipe = (x, y) => {
    const recipe = structuredClone(nativeSwipeEffectRecipes.flick);
    const target = recipe.root.children.find(
      (node) => node.hierarchyPath === hierarchyPath,
    );
    assert.ok(target?.particleSystem);
    target.particleSystem.modules.sizeOverLifetime = {
      separateAxes: true,
      x: constant(x),
      y: constant(y),
      z: constant(1),
    };
    return recipe;
  };
  const sample = (recipe) => {
    const runtime = createBandoriEffectRecipeRuntime(recipe, {
      buttonIndex: 3,
      seed: 27,
    });
    runtime.play(0, 27);
    return runtime.sample(0.05).instances
      .slice(0, runtime.frame.count)
      .filter((instance) => instance.hierarchyPath === hierarchyPath);
  };
  const uniform = sample(createRecipe(1, 1));
  const separate = sample(createRecipe(2, 0.5));

  assert.equal(separate.length, uniform.length);
  assert.ok(separate.length > 0);
  for (let index = 0; index < separate.length; index += 1) {
    assert.ok(Math.abs(separate[index].widthPixels / uniform[index].widthPixels - 2) < 1e-6);
    assert.ok(Math.abs(separate[index].heightPixels / uniform[index].heightPixels - 0.5) < 1e-6);
  }
});

test("Directional particles retain authored white and discrete colored children", () => {
  const frame = createBandoriNativeSwipeEffectRuntime(
    "directional-left-1",
    3,
    9,
  ).play(0, 9);
  const instances = frame.instances.slice(0, frame.count);
  assert.ok(instances.some((instance) => (
    instance.hierarchyPath.endsWith("/spark_1")
    && instance.color.r === 1
    && instance.color.g === 1
      && instance.color.b === 1
  )));
  assert.ok(instances.some((instance) => (
    instance.hierarchyPath.includes("/star_")
      && instance.color.g < 0.9
  )));
});

test("right Directional moving particles mirror the matching left source systems", () => {
  const movingSuffixes = {
    1: ["spark_1", "star_1", "star_2", "star_glitter_1"],
    2: ["spark_1", "star_1", "star_glitter_1"],
    3: ["spark_1", "spark_2", "spark_3", "star_1", "star_glitter_1"],
  };

  for (const span of [1, 2, 3]) {
    const leftKind = `directional-left-${span}`;
    const rightKind = `directional-right-${span}`;
    const leftPlacement = getBandoriNativeSwipeEffectPlacement(leftKind, 3);
    const rightPlacement = getBandoriNativeSwipeEffectPlacement(rightKind, 3);
    const collect = (kind) => {
      const frame = createBandoriNativeSwipeEffectRuntime(kind, 3, 42).play(0.1, 42);
      const particles = new Map();
      for (const instance of frame.instances.slice(0, frame.count)) {
        const suffix = instance.hierarchyPath.slice(instance.hierarchyPath.lastIndexOf("/") + 1);
        if (!movingSuffixes[span].includes(suffix)) continue;
        particles.set(`${suffix}:${instance.particleIndex}`, instance);
      }
      return particles;
    };
    const left = collect(leftKind);
    const right = collect(rightKind);

    assert.equal(left.size, right.size);
    assert.deepEqual([...left.keys()].sort(), [...right.keys()].sort());
    for (const [key, leftParticle] of left) {
      const rightParticle = right.get(key);
      assert.ok(rightParticle);
      closeTo(
        leftParticle.screenX - leftPlacement.screenX,
        -(rightParticle.screenX - rightPlacement.screenX),
      );
      closeTo(leftParticle.screenY, rightParticle.screenY);
    }
  }
});

test("the same Directional note seed remains exactly deterministic", () => {
  const sample = () => {
    const frame = createBandoriNativeSwipeEffectRuntime(
      "directional-right-3",
      5,
      0x12345678,
    ).play(0.1, 0x12345678);
    return structuredClone(frame.instances.slice(0, frame.count));
  };

  assert.deepEqual(sample(), sample());
});

test("runtime frame lookup preserves the two original JP atlases and Unity rects", () => {
  assert.match(BANDORI_NATIVE_NOTE_SKIN.atlasUrl, /skin00\/rhythmgamesprites\.png$/u);
  assert.match(BANDORI_NATIVE_DIRECTIONAL_FLICK_SKIN.atlasUrl, /directionalflickskin00\/directionalflicksprites\.png$/u);
  assert.doesNotMatch(
    `${BANDORI_NATIVE_NOTE_SKIN.atlasUrl}\n${BANDORI_NATIVE_DIRECTIONAL_FLICK_SKIN.atlasUrl}`,
    /\/(?:jp|cn)\//iu,
  );

  const visual = resolve();
  assert.ok(visual);
  assert.equal(getBandoriNativeBodyFrameId(visual), "note_normal_2");
  assert.deepEqual(getBandoriNativeNoteFrame(
    "note_normal_2",
    BANDORI_NATIVE_NOTE_SKIN,
    BANDORI_NATIVE_DIRECTIONAL_FLICK_SKIN,
  ), {
    atlas: "standard",
    x: 620,
    y: 0,
    width: 308,
    height: 120,
  });
  assert.equal(getBandoriNativeIconFrameId("left"), "note_flick_top_l");
  assert.deepEqual(getBandoriNativeNoteFrame(
    "note_flick_top_l",
    BANDORI_NATIVE_NOTE_SKIN,
    BANDORI_NATIVE_DIRECTIONAL_FLICK_SKIN,
  ), {
    atlas: "directional",
    x: 310,
    y: 366,
    width: 138,
    height: 171,
  });
  assert.deepEqual(getBandoriNativeNoteFrame(
    "note_long_0",
    BANDORI_NATIVE_NOTE_SKIN,
    BANDORI_NATIVE_DIRECTIONAL_FLICK_SKIN,
  ), {
    atlas: "standard",
    x: 1550,
    y: 366,
    width: 308,
    height: 120,
  });
  assert.deepEqual(getBandoriNativeNoteFrame(
    "note_slide_among",
    BANDORI_NATIVE_NOTE_SKIN,
    BANDORI_NATIVE_DIRECTIONAL_FLICK_SKIN,
  ), {
    atlas: "standard",
    x: 310,
    y: 610,
    width: 308,
    height: 120,
  });
  assert.match(BANDORI_NATIVE_NOTE_SKINS[0].longNoteLineUrl, /skin00\/longnoteline\.png$/u);
  assert.match(BANDORI_NATIVE_NOTE_SKINS[0].curveSlideNoteLineUrl, /skin00\/longnoteline2\.png$/u);
  assert.match(BANDORI_NATIVE_NOTE_SKINS[0].syncLineUrl, /skin00\/simultaneous_line\.png$/u);
  assert.match(
    getBandoriNativeRhythmSupportNoteUrl(BANDORI_NATIVE_NOTE_SKINS[0], 6),
    /skin00\/sprites\/note_normal_16_6\.png$/u,
  );
  assert.match(BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS[0].lineLeftUrl, /directionalflickskin00\/flicknoteline_l\.png$/u);
  assert.match(BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS[0].lineRightUrl, /directionalflickskin00\/flicknoteline_r\.png$/u);
});

test("the rhythm-marker selector exposes only the seven master note styles", () => {
  assert.deepEqual(
    BANDORI_NATIVE_NOTE_SKINS.map((skin) => [
      skin.id,
      skin.assetBundleName,
      skin.frameLayout,
      skin.syncLineEdgeMargin,
    ]),
    [
      [1, "skin00", "a", 0],
      [2, "skin01", "a", 0],
      [3, "skin02", "b", 0],
      [4, "skin03", "b", 0],
      [5, "skin04", "a", 0],
      [6, "skin06", "c", 0],
      [7, "skin05", "b", 1.100000023841858],
    ],
  );

  assert.deepEqual(
    getBandoriNativeNoteFrame(
      "note_normal_2",
      BANDORI_NATIVE_NOTE_SKINS[2],
      BANDORI_NATIVE_DIRECTIONAL_FLICK_SKIN,
    ),
    { atlas: "standard", x: 1240, y: 366, width: 308, height: 120 },
  );
  assert.deepEqual(
    getBandoriNativeNoteFrame(
      "note_flick_0",
      BANDORI_NATIVE_NOTE_SKINS[5],
      BANDORI_NATIVE_DIRECTIONAL_FLICK_SKIN,
    ),
    { atlas: "standard", x: 930, y: 488, width: 308, height: 120 },
  );
  assert.deepEqual(
    getBandoriNativeNoteFrame(
      "note_skill_3",
      BANDORI_NATIVE_NOTE_SKINS[5],
      BANDORI_NATIVE_DIRECTIONAL_FLICK_SKIN,
    ),
    { atlas: "standard", x: 0, y: 738, width: 308, height: 120 },
  );
  assert.deepEqual(
    getBandoriNativeNoteFrame(
      "note_long_4",
      BANDORI_NATIVE_NOTE_SKINS[2],
      BANDORI_NATIVE_DIRECTIONAL_FLICK_SKIN,
    ),
    { atlas: "standard", x: 310, y: 610, width: 308, height: 120 },
  );
});

test("Habahiro direct Sprites retain the JP rendered pivots and coverage names", () => {
  assert.equal(Object.keys(BANDORI_HABAHIRO_SPRITES).length, 179);
  assert.notEqual(BANDORI_HABAHIRO_SPRITES.note_slide_among.anchorY, 0.5);
  const visual = {
    body: "normal",
    coveredLanes: [2, 3, 4],
    direction: 0,
    icon: null,
    lane: 3,
  };
  assert.equal(getBandoriHabahiroBodySpriteName(visual), "note_normal_2_3_4");
  assert.equal(getBandoriHabahiroRhythmSpriteName(visual), "note_normal_16_2_3_4");
  assert.equal(getBandoriHabahiroIconSpriteName({ ...visual, body: "flick", icon: "flick" }), "note_flick_top_3");
  const widthFiveFlick = {
    ...visual,
    body: "flick",
    coveredLanes: [1, 2, 3, 4, 5],
    icon: "flick",
  };
  assert.equal(isBandoriHabahiroMultiRangeFlickIcon(widthFiveFlick), true);
  assert.equal(getBandoriHabahiroIconSpriteName(widthFiveFlick), "note_flick_top_3");
  assert.equal(
    getBandoriHabahiroIconSpriteName({
      ...widthFiveFlick,
      coveredLanes: [0, 1, 2, 3, 4, 5, 6],
    }),
    "note_flick_top_3",
  );
  assert.equal(
    getBandoriHabahiroBodySpriteName({ ...visual, coveredLanes: undefined, lane: 2 }),
    null,
  );
});

test("the five directional Flick choices preserve master order and the sole frame-height difference", () => {
  assert.deepEqual(
    BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS.map((skin) => [
      skin.id,
      skin.assetBundleName,
      skin.frameLayout,
    ]),
    [
      [1, "skin00", "short-right-icon"],
      [2, "skin01", "tall-right-icon"],
      [3, "skin02", "tall-right-icon"],
      [4, "skin03", "tall-right-icon"],
      [5, "skin04", "tall-right-icon"],
    ],
  );
  assert.equal(
    getBandoriNativeNoteFrame(
      "note_flick_top_r",
      BANDORI_NATIVE_NOTE_SKINS[0],
      BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS[0],
    ).height,
    170,
  );
  assert.equal(
    getBandoriNativeNoteFrame(
      "note_flick_top_r",
      BANDORI_NATIVE_NOTE_SKINS[0],
      BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS[1],
    ).height,
    171,
  );
});
