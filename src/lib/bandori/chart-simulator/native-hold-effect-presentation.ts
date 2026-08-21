import recipe from "./native-hold-effect-recipe.json";
import {
  createBandoriDefaultEffectRuntime,
  type BandoriDefaultEffectRuntime,
} from "./default-effects";
import {
  projectBandoriNativeRibbonPoint,
  type BandoriNativeChartVisuals,
  type BandoriNativeProjectedRibbonPoint,
  type BandoriNativeRibbonVisual,
} from "./native-note-presentation";

export const BANDORI_NATIVE_HOLD_EFFECT_TEXTURE_URLS = {
  "tap-default-particle":
    "/local/chart-simulator/ingameskin/tapeffect/skin00/textures/Default-Particle.png",
  "tap-set1":
    "/local/chart-simulator/ingameskin/tapeffect/skin00/textures/Tex_parSet_1.png",
  "tap-set2":
    "/local/chart-simulator/ingameskin/tapeffect/skin00/textures/Tex_parSet_2.png",
} as const;

export const BANDORI_NATIVE_LONG_FLASH_PERIOD_SECONDS = 0.8333333135;
export const BANDORI_NATIVE_LONG_FLASH_PEAK_SECONDS = 0.4166666567;

export type BandoriNativeHoldState = Readonly<{
  elapsedSeconds: number;
  pointIndex: number;
  ribbon: BandoriNativeRibbonVisual;
}>;

export type BandoriNativeHoldEffectVariant = Readonly<{
  kind: "long" | "slide";
  rangeWidth: number;
}>;

export type BandoriNativeLongFlashColor = Readonly<{
  alpha: 1;
  blue: number;
  green: number;
  red: number;
}>;

function resolveBandoriNativeHoldState(
  ribbon: BandoriNativeRibbonVisual,
  presentationTimeSeconds: number,
): BandoriNativeHoldState | null {
  const first = ribbon.points[0];
  const last = ribbon.points.at(-1);
  if (
    !first
    || !last
    || presentationTimeSeconds < first.time
    || presentationTimeSeconds >= last.time
  ) {
    return null;
  }
  let low = 0;
  let high = ribbon.points.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (ribbon.points[middle].time <= presentationTimeSeconds) low = middle + 1;
    else high = middle;
  }
  return {
    elapsedSeconds: presentationTimeSeconds - first.time,
    pointIndex: Math.max(0, low - 1),
    ribbon,
  };
}

export function collectBandoriNativeHoldStates(
  chartVisuals: BandoriNativeChartVisuals,
  presentationTimeSeconds: number,
): BandoriNativeHoldState[] {
  if (!Number.isFinite(presentationTimeSeconds)) {
    throw new Error("Native hold-state time must be finite");
  }
  const states: BandoriNativeHoldState[] = [];
  for (const ribbon of chartVisuals.ribbons) {
    const state = resolveBandoriNativeHoldState(ribbon, presentationTimeSeconds);
    if (state) states.push(state);
  }
  return states;
}

export function projectBandoriNativeHoldState(
  state: BandoriNativeHoldState,
  currentBeat: number,
  presentationTimeSeconds: number,
  noteSpeed: number,
  approachTimeScale = 1,
): BandoriNativeProjectedRibbonPoint | null {
  // The sustained root shares NoteMesh's Stop-phase interpolation. Anchoring
  // it to the last reached connection would make it jump between lanes while
  // the ribbon contact point continues moving across the judgment line.
  return projectBandoriNativeRibbonPoint(
    state.ribbon,
    state.pointIndex,
    currentBeat,
    presentationTimeSeconds,
    noteSpeed,
    0,
    approachTimeScale,
  );
}

export function projectBandoriNativeRibbonBody(
  ribbon: BandoriNativeRibbonVisual,
  pointIndex: number,
  currentBeat: number,
  presentationTimeSeconds: number,
  noteSpeed: number,
  laneOffset = 0,
  approachTimeScale = 1,
): BandoriNativeProjectedRibbonPoint | null {
  const point = ribbon.points[pointIndex];
  if (!point) return null;
  if (pointIndex === 0 && presentationTimeSeconds >= point.time) {
    const holdState = resolveBandoriNativeHoldState(ribbon, presentationTimeSeconds);
    return holdState
      ? projectBandoriNativeHoldState(
        holdState,
        currentBeat,
        presentationTimeSeconds,
        noteSpeed,
        approachTimeScale,
      )
      : null;
  }
  if (pointIndex > 0 && presentationTimeSeconds > point.time) return null;
  return projectBandoriNativeRibbonPoint(
    ribbon,
    pointIndex,
    currentBeat,
    presentationTimeSeconds,
    noteSpeed,
    laneOffset,
    approachTimeScale,
  );
}

export function evaluateBandoriNativeLongFlashColor(
  elapsedSeconds: number,
): BandoriNativeLongFlashColor {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new Error("Native LongNoteFlash elapsed time must be non-negative and finite");
  }
  const time = elapsedSeconds % BANDORI_NATIVE_LONG_FLASH_PERIOD_SECONDS;
  const value = time <= BANDORI_NATIVE_LONG_FLASH_PEAK_SECONDS
    ? (
      -5.5296010971 * time ** 3
      + 2.3039999008 * time ** 2
      + 0.9600000978 * time
      + 0.2000000030
    )
    : (() => {
      const delta = time - BANDORI_NATIVE_LONG_FLASH_PEAK_SECONDS;
      return 5.5296010971 * delta ** 3
        - 4.6080002785 * delta ** 2
        + 0.6000000238;
    })();
  const channel = Math.max(0, Math.min(1, value));
  return { alpha: 1, blue: channel, green: channel, red: channel };
}

export function getBandoriNativeHoldEffectSeed(ribbonIndex: number): number {
  if (!Number.isInteger(ribbonIndex) || ribbonIndex < 0) {
    throw new Error("Native hold-effect ribbon index must be a non-negative integer");
  }
  return (Math.imul(ribbonIndex + 1, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
}

type MutableCurveKey = {
  inSlope: number;
  outSlope: number;
  value: number;
};

type MutableHoldRecipeNode = {
  children: MutableHoldRecipeNode[];
  name: string;
  particleSystem?: {
    modules: {
      initial: {
        startSize: {
          separateAxes: boolean;
          x: Record<string, unknown> & { value: number };
          y?: Record<string, unknown> & { value: number };
          z?: Record<string, unknown> & { value: number };
        };
      };
      sizeOverLifetime?: {
        x: {
          curve: { keys: MutableCurveKey[] };
        };
      };
    };
  };
  runtimeParticipation: string;
  serializedActive: boolean;
  serializedHierarchyActive: boolean;
};

type MutableHoldRecipe = {
  root: MutableHoldRecipeNode;
};

const LONG_TAP_KEEP_CURVE_BY_WIDTH = [
  null,
  [0.48826292157173157, 0.5117371082305908],
  [0.48826292157173157, 0.5117371082305908],
  [0.5859267712, 0.4140732288],
  [0.6114089489, 0.3885910511],
  [0.6496245861, 0.3503754139],
  [0.6496245861, 0.3503754139],
  [0.7005774379, 0.2994225621],
] as const;

const longTapKeepRecipes = new Map<number, unknown>([[1, recipe]]);

function getBandoriNativeLongTapKeepRecipe(rangeWidth: number): unknown {
  const cached = longTapKeepRecipes.get(rangeWidth);
  if (cached) return cached;
  const cloned = structuredClone(recipe) as unknown as MutableHoldRecipe;
  const parSquare = cloned.root.children.find((child) => child.name === "par_square");
  const curveContract = LONG_TAP_KEEP_CURVE_BY_WIDTH[rangeWidth];
  if (!parSquare?.particleSystem || !curveContract) {
    throw new Error("Native Long TapKeep width recipe is incomplete");
  }
  const baseSize = parSquare.particleSystem.modules.initial.startSize.x;
  parSquare.particleSystem.modules.initial.startSize = {
    separateAxes: true,
    x: { ...baseSize, value: 2.5 * rangeWidth },
    y: { ...baseSize, value: 2.5 },
    z: { ...baseSize, value: 2.5 },
  };
  const sizeKeys = parSquare.particleSystem.modules.sizeOverLifetime?.x.curve.keys;
  if (!sizeKeys || sizeKeys.length !== 2) {
    throw new Error("Native Long TapKeep size curve is incomplete");
  }
  const [initialValue, slope] = curveContract;
  sizeKeys[0].value = initialValue;
  for (const key of sizeKeys) {
    key.inSlope = slope;
    key.outSlope = slope;
  }
  for (const child of cloned.root.children) {
    if (child.name !== "par_parOnpu_a" && child.name !== "par_parOnpu_b") continue;
    child.serializedActive = false;
    child.serializedHierarchyActive = false;
    child.runtimeParticipation = "excluded-serialized-inactive";
  }
  longTapKeepRecipes.set(rangeWidth, cloned);
  return cloned;
}

export function createBandoriNativeHoldEffectRuntime(
  seed: number,
  variant: BandoriNativeHoldEffectVariant = { kind: "slide", rangeWidth: 1 },
): BandoriDefaultEffectRuntime {
  if (
    !Number.isInteger(variant.rangeWidth)
    || variant.rangeWidth < 1
    || variant.rangeWidth > 7
  ) {
    throw new Error("Native hold effect width must be an integer from 1 through 7");
  }
  // The particle hierarchy is placement-invariant. The stage supplies the
  // current Long/Slide root transform, so the center button is a neutral source.
  // Slide always borrows the one unsuffixed pooled TapKeep instance. Long uses
  // the width-specific button prefab selected from the head range.
  const selectedRecipe = variant.kind === "long"
    ? getBandoriNativeLongTapKeepRecipe(variant.rangeWidth)
    : recipe;
  return createBandoriDefaultEffectRuntime(selectedRecipe, { buttonIndex: 3, seed });
}

export const BANDORI_NATIVE_HOLD_EFFECT_PLACEMENT = {
  pixelsPerWorldUnit: recipe.placement.pixelsPerWorldUnit,
  screenX: recipe.placement.screenButtons[3].x,
  screenY: recipe.placement.screenButtons[3].y,
} as const;
