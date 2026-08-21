import recipes from "./native-swipe-effect-recipes.json";
import {
  createBandoriDefaultEffectRuntime,
  type BandoriDefaultEffectRuntime,
  type BandoriEffectFrameInstance,
} from "./default-effects";

export const BANDORI_NATIVE_SWIPE_EFFECT_TEXTURE_URLS = {
  "tap-circle": "/local/chart-simulator/ingameskin/tapeffect/skin00/textures/effect_circle.png",
  "tap-light": "/local/chart-simulator/ingameskin/tapeffect/skin00/textures/light.png",
  "tap-set1": "/local/chart-simulator/ingameskin/tapeffect/skin00/textures/Tex_parSet_1.png",
  "tap-set2": "/local/chart-simulator/ingameskin/tapeffect/skin00/textures/Tex_parSet_2.png",
} as const;

const DIRECTIONAL_EFFECT_SPRITE_ROOT =
  "/local/chart-simulator/ingameskin/tapeffect/directionalflickskin00normal/sprites";

export const BANDORI_NATIVE_DIRECTIONAL_EFFECT_FRAME_URLS = Array.from(
  { length: 16 },
  (_, frame) => `${DIRECTIONAL_EFFECT_SPRITE_ROOT}/Tex_parSet_1_${frame}.png`,
);

export type BandoriNativeSwipeEffectKind = keyof typeof recipes;

export const BANDORI_APPROVED_MANUAL_VERTICAL_BEAM_ABOVE_JUDGMENT_RATIO = 1 / 3;

export type BandoriNativeSwipeEffectPlacement = Readonly<{
  pixelsPerWorldUnit: number;
  screenX: number;
  screenY: number;
}>;

type NativeSwipeRecipe = (typeof recipes)[BandoriNativeSwipeEffectKind];

export function getBandoriNativeSwipeEffectRecipe(
  kind: BandoriNativeSwipeEffectKind,
): NativeSwipeRecipe {
  return recipes[kind];
}

export function getBandoriNativeSwipeEffectPlacement(
  kind: BandoriNativeSwipeEffectKind,
  lane: number,
): BandoriNativeSwipeEffectPlacement {
  if (!Number.isInteger(lane) || lane < 0 || lane > 6) {
    throw new Error("Bandori swipe effect lane must be an integer from 0 through 6");
  }
  const recipe = getBandoriNativeSwipeEffectRecipe(kind);
  const button = recipe.placement.screenButtons[lane];
  return {
    pixelsPerWorldUnit: recipe.placement.pixelsPerWorldUnit,
    screenX: button.x,
    screenY: button.y,
  };
}

function hashEffectKind(kind: BandoriNativeSwipeEffectKind): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < kind.length; index += 1) {
    hash = Math.imul(hash ^ kind.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}

export function getBandoriNativeSwipeEffectSeed(
  noteIndex: number,
  lane: number,
  kind: BandoriNativeSwipeEffectKind,
): number {
  return (
    Math.imul(noteIndex + 1, 0x9e3779b1)
    ^ Math.imul(lane + 1, 0x85ebca6b)
    ^ hashEffectKind(kind)
  ) >>> 0;
}

export function createBandoriNativeSwipeEffectRuntime(
  kind: BandoriNativeSwipeEffectKind,
  lane: number,
  seed: number,
): BandoriDefaultEffectRuntime {
  return createBandoriDefaultEffectRuntime(
    getBandoriNativeSwipeEffectRecipe(kind),
    { buttonIndex: lane, seed },
  );
}

export function isBandoriNativeDirectionalTerminalParticle(
  instance: Pick<BandoriEffectFrameInstance, "hierarchyPath">,
): boolean {
  return instance.hierarchyPath.endsWith("/notes");
}

export function getBandoriNativeSwipeParticleWidthScale(
  kind: BandoriNativeSwipeEffectKind,
  rangeWidth: number,
  instance: Pick<BandoriEffectFrameInstance, "hierarchyPath">,
): number {
  if (!Number.isInteger(rangeWidth) || rangeWidth < 1 || rangeWidth > 7) {
    throw new Error("Bandori swipe effect width must be an integer from 1 through 7");
  }
  // Habahiro's width-specific Swipe prefabs change only square.startSize.x.
  // The slash and every other emitter retain their original dimensions.
  return kind === "flick" && instance.hierarchyPath.endsWith("/square")
    ? rangeWidth
    : 1;
}

export function getBandoriApprovedManualVerticalBeamScreenY(
  kind: BandoriNativeSwipeEffectKind,
  judgmentScreenY: number,
  instance: Pick<
    BandoriEffectFrameInstance,
    "basisX" | "basisY" | "heightPixels" | "hierarchyPath" | "screenY" | "widthPixels"
  >,
): number {
  const isApprovedVerticalBeam = (
    kind === "flick"
    && (
      instance.hierarchyPath.endsWith("/slash")
      || instance.hierarchyPath.endsWith("/line1")
    )
  ) || (
    instance.hierarchyPath.endsWith("/slash")
    && (kind === "directional-finger-left" || kind === "directional-finger-right")
  );
  if (!isApprovedVerticalBeam) return instance.screenY;

  const verticalExtentPixels = Math.abs(instance.basisX.y * instance.widthPixels)
    + Math.abs(instance.basisY.y * instance.heightPixels);
  return judgmentScreenY + verticalExtentPixels
    * (0.5 - BANDORI_APPROVED_MANUAL_VERTICAL_BEAM_ABOVE_JUDGMENT_RATIO);
}

export function getBandoriApprovedManualDirectionalNotesCenterOffsetPixels(
  instance: Pick<BandoriEffectFrameInstance, "hierarchyPath" | "widthPixels">,
): number {
  return isBandoriNativeDirectionalTerminalParticle(instance)
    ? instance.widthPixels / 2
    : 0;
}
