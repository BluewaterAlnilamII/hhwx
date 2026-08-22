import type { BandoriNativeTapSeSkin } from "@/lib/bandori/chart-simulator/native-note-sound-presentation";
import type { BandoriNativeDirectionalFlickSkin, BandoriNativeNoteSkin } from "./native-note-assets";
import type { BandoriNativeFieldSkin } from "./native-stage-contract";

const LOCAL_ROOT = "/local/chart-simulator";

export type BandoriLimitedPerformanceSkinSlot =
  | "lane"
  | "notes"
  | "directionalFlick"
  | "tapEffect"
  | "directionalFlickEffect"
  | "soundEffect";

type LimitedTapEffectRecipe = "flick" | "hold" | "normal" | "skill";
export type LimitedDirectionalEffectRecipe =
  | "finger-left"
  | "finger-right"
  | "left-1"
  | "left-2"
  | "left-3"
  | "right-1"
  | "right-2"
  | "right-3";

export type BandoriLimitedPerformanceEffectContract = Readonly<{
  animatedVerticalBeam: Readonly<{
    hierarchyPath: string;
    recipe: LimitedTapEffectRecipe;
    travelSpeedMultiplier: number;
  }> | null;
  directionalRecipes: Readonly<Record<LimitedDirectionalEffectRecipe, string>>;
  recipes: Readonly<Record<LimitedTapEffectRecipe, string>>;
  resources: Readonly<Record<string, string>>;
}>;

export type BandoriLimitedPerformanceSkin = Readonly<{
  coverage: readonly BandoriLimitedPerformanceSkinSlot[];
  directionalFlickSkin: BandoriNativeDirectionalFlickSkin;
  effects: BandoriLimitedPerformanceEffectContract;
  fieldSkin: BandoriNativeFieldSkin;
  group: "collaboration";
  id: "persona";
  noteSkin: BandoriNativeNoteSkin;
  tapSeSkin: BandoriNativeTapSeSkin;
}>;

const PERSONA_NOTE_ROOT = `${LOCAL_ROOT}/assets/star/forassetbundle/startapp/ingameskin/noteskin/skin_persona`;
const PERSONA_DIRECTIONAL_NOTE_ROOT = `${LOCAL_ROOT}/assets/star/forassetbundle/startapp/ingameskin/noteskin/directionalflickskin_persona`;
const PERSONA_FIELD_ROOT = `${LOCAL_ROOT}/assets/star/forassetbundle/startapp/ingameskin/fieldskin/skin_persona`;
const PERSONA_TAP_EFFECT_ROOT = `${LOCAL_ROOT}/ingameskin/tapeffect/skin_persona`;
const PERSONA_DIRECTIONAL_EFFECT_ROOT = `${LOCAL_ROOT}/ingameskin/tapeffect/directionalflickskin_personanormal`;

const PERSONA_FIELD_SKIN: BandoriNativeFieldSkin = {
  assetBundleName: "skin_persona",
  id: "persona",
  judgmentLineSpriteHeight: 40,
  judgmentLineTextureUrl: `${PERSONA_FIELD_ROOT}/game_play_line.png`,
  skinType: "normal",
  textureUrl: `${PERSONA_FIELD_ROOT}/bg_line_rhythm.png`,
};

const PERSONA_NOTE_SKIN: BandoriNativeNoteSkin = {
  assetBundleName: "skin_persona",
  atlasUrl: "",
  curveSlideNoteLineUrl: `${PERSONA_NOTE_ROOT}/longnoteline2.png`,
  frameLayout: "b",
  frameSource: "sprites",
  id: "persona",
  longNoteLineUrl: `${PERSONA_NOTE_ROOT}/longnoteline.png`,
  syncLineEdgeMargin: 0,
  syncLineUrl: `${PERSONA_NOTE_ROOT}/simultaneous_line.png`,
};

const PERSONA_DIRECTIONAL_FLICK_SKIN: BandoriNativeDirectionalFlickSkin = {
  assetBundleName: "skin_persona",
  atlasUrl: "",
  frameLayout: "tall-right-icon",
  frameSource: "sprites",
  id: "persona",
  lineLeftUrl: `${PERSONA_DIRECTIONAL_NOTE_ROOT}/flicknoteline_l.png`,
  lineRightUrl: `${PERSONA_DIRECTIONAL_NOTE_ROOT}/flicknoteline_r.png`,
};

const PERSONA_TAP_SE_SKIN: BandoriNativeTapSeSkin = {
  id: "persona",
  cueUrls: {
    flick: `${LOCAL_ROOT}/sound/tapseskin/skin_persona/TapSE/flick.wav`,
    "long-keep": `${LOCAL_ROOT}/sound/tapseskin/skin_persona/TapSE/SE_RHYTHM_TAP_LONG.wav`,
    perfect: `${LOCAL_ROOT}/sound/tapseskin/skin_persona/TapSE/perfect.wav`,
  },
};

const PERSONA_EFFECT_RESOURCES = {
  "limited-persona-directional-normal-default-particlesystem": `${PERSONA_DIRECTIONAL_EFFECT_ROOT}/textures/default-particlesystem.png`,
  "limited-persona-directional-normal-effect_circle": `${PERSONA_DIRECTIONAL_EFFECT_ROOT}/textures/effect_circle.png`,
  "limited-persona-directional-normal-tex_parset_1": `${PERSONA_DIRECTIONAL_EFFECT_ROOT}/textures/tex_parset_1.png`,
  "limited-persona-tap-default-particle": `${PERSONA_TAP_EFFECT_ROOT}/textures/default-particle.png`,
  "limited-persona-tap-tex_e_001": `${PERSONA_TAP_EFFECT_ROOT}/textures/tex_e_001.png`,
  "limited-persona-tap-tex_e_002": `${PERSONA_TAP_EFFECT_ROOT}/textures/tex_e_002.png`,
  "limited-persona-tap-tex_e_003": `${PERSONA_TAP_EFFECT_ROOT}/textures/tex_e_003.png`,
} as const;

export const BANDORI_LIMITED_PERFORMANCE_SKINS = [
  {
    coverage: [
      "lane",
      "notes",
      "directionalFlick",
      "tapEffect",
      "directionalFlickEffect",
      "soundEffect",
    ],
    directionalFlickSkin: PERSONA_DIRECTIONAL_FLICK_SKIN,
    effects: {
      animatedVerticalBeam: {
        hierarchyPath: "effect_tap_swipe/line1",
        recipe: "flick",
        travelSpeedMultiplier: 4,
      },
      directionalRecipes: {
        "finger-left": `${PERSONA_DIRECTIONAL_EFFECT_ROOT}/recipes/finger-left.json`,
        "finger-right": `${PERSONA_DIRECTIONAL_EFFECT_ROOT}/recipes/finger-right.json`,
        "left-1": `${PERSONA_DIRECTIONAL_EFFECT_ROOT}/recipes/left-1.json`,
        "left-2": `${PERSONA_DIRECTIONAL_EFFECT_ROOT}/recipes/left-2.json`,
        "left-3": `${PERSONA_DIRECTIONAL_EFFECT_ROOT}/recipes/left-3.json`,
        "right-1": `${PERSONA_DIRECTIONAL_EFFECT_ROOT}/recipes/right-1.json`,
        "right-2": `${PERSONA_DIRECTIONAL_EFFECT_ROOT}/recipes/right-2.json`,
        "right-3": `${PERSONA_DIRECTIONAL_EFFECT_ROOT}/recipes/right-3.json`,
      },
      recipes: {
        flick: `${PERSONA_TAP_EFFECT_ROOT}/recipes/flick.json`,
        hold: `${PERSONA_TAP_EFFECT_ROOT}/recipes/hold.json`,
        normal: `${PERSONA_TAP_EFFECT_ROOT}/recipes/normal.json`,
        skill: `${PERSONA_TAP_EFFECT_ROOT}/recipes/skill.json`,
      },
      resources: PERSONA_EFFECT_RESOURCES,
    },
    fieldSkin: PERSONA_FIELD_SKIN,
    group: "collaboration",
    id: "persona",
    noteSkin: PERSONA_NOTE_SKIN,
    tapSeSkin: PERSONA_TAP_SE_SKIN,
  },
] as const satisfies readonly BandoriLimitedPerformanceSkin[];

export type BandoriLimitedPerformanceSkinId =
  (typeof BANDORI_LIMITED_PERFORMANCE_SKINS)[number]["id"];

export function getBandoriLimitedPerformanceSkin(
  id: BandoriLimitedPerformanceSkinId | null,
): BandoriLimitedPerformanceSkin | null {
  return id === null
    ? null
    : BANDORI_LIMITED_PERFORMANCE_SKINS.find((skin) => skin.id === id) ?? null;
}
