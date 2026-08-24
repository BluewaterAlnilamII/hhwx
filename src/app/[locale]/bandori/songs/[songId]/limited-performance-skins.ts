import type { BandoriNativeTapSeSkin } from "@/lib/bandori/chart-simulator/native-note-sound-presentation";
import type { BandoriNativeDirectionalFlickSkin, BandoriNativeNoteSkin } from "./native-note-assets";
import {
  BANDORI_NATIVE_BACKGROUND_RECT,
  type BandoriNativeBackgroundSkin,
  type BandoriNativeFieldSkin,
} from "./native-stage-contract";

const CHART_SIMULATOR_LOGICAL_ASSET_ROOT = "/local/chart-simulator";

export type BandoriLimitedPerformanceSkinSlot =
  | "background"
  | "lane"
  | "judgment"
  | "notes"
  | "directionalFlick"
  | "tapEffect"
  | "directionalFlickEffect"
  | "soundEffect";

export type BandoriTapEffectRecipe = "flick" | "hold" | "normal" | "skill";

export type BandoriTapEffectAssetContract = Readonly<{
  animatedVerticalBeam: Readonly<{
    hierarchyPath: string;
    recipe: BandoriTapEffectRecipe;
    travelSpeedMultiplier: number;
  }> | null;
  recipes: Readonly<Record<BandoriTapEffectRecipe, string>>;
  resources: Readonly<Record<string, string>>;
}>;

export type BandoriLimitedPerformanceEffectContract =
  BandoriTapEffectAssetContract;

export type BandoriLimitedPerformanceSkin = Readonly<{
  backgroundSkin: BandoriNativeBackgroundSkin | null;
  coverage: readonly BandoriLimitedPerformanceSkinSlot[];
  directionalFlickSkin: BandoriNativeDirectionalFlickSkin | null;
  effects: BandoriLimitedPerformanceEffectContract | null;
  fieldSkin: BandoriNativeFieldSkin | null;
  id:
    | "5th"
    | "april2018"
    | "april2019"
    | "april2021"
    | "april2024"
    | "bike"
    | "cafe"
    | "coin"
    | "collabo23_summer_g"
    | "collabo23_winter_d"
    | "collabo24_autumn_i"
    | "collabo25_autumn_s"
    | "delta"
    | "gbp2020"
    | "maid"
    | "miku"
    | "persona"
    | "satan"
    | "stage"
    | "witch";
  judgmentPerfectTextureUrl: string | null;
  noteSkin: BandoriNativeNoteSkin | null;
  tapSeSkin: BandoriNativeTapSeSkin | null;
}>;

const PERSONA_NOTE_ROOT = `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/assets/star/forassetbundle/startapp/ingameskin/noteskin/skin_persona`;
const PERSONA_DIRECTIONAL_NOTE_ROOT = `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/assets/star/forassetbundle/startapp/ingameskin/noteskin/directionalflickskin_persona`;
const PERSONA_FIELD_ROOT = `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/assets/star/forassetbundle/startapp/ingameskin/fieldskin/skin_persona`;
const PERSONA_BACKGROUND_ROOT = `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/assets/star/forassetbundle/asneeded/ingameskin/bgskin/skin_persona`;
const PERSONA_TAP_EFFECT_ROOT = `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/ingameskin/tapeffect/skin_persona`;
const APRIL_2019_NOTE_ROOT = `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/assets/star/forassetbundle/startapp/ingameskin/noteskin/skin_april2019`;
const APRIL_2019_FIELD_ROOT = `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/assets/star/forassetbundle/startapp/ingameskin/fieldskin/skin_april2019`;
const APRIL_2019_BACKGROUND_ROOT = `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/assets/star/forassetbundle/asneeded/ingameskin/bgskin/skin_april2019`;
const APRIL_2019_TAP_EFFECT_ROOT = `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/ingameskin/tapeffect/skin_april2019`;
const MIKU_TAP_EFFECT_ROOT = `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/ingameskin/tapeffect/skin_miku`;
const STAGE_TAP_EFFECT_ROOT = `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/ingameskin/tapeffect/skin_stage`;

const PERSONA_FIELD_SKIN: BandoriNativeFieldSkin = {
  assetBundleName: "skin_persona",
  id: "persona",
  judgmentLineSpriteHeight: 40,
  judgmentLineSpriteWidth: 1800,
  judgmentLineTextureUrl: `${PERSONA_FIELD_ROOT}/game_play_line.png`,
  skinType: "normal",
  textureUrl: `${PERSONA_FIELD_ROOT}/bg_line_rhythm.png`,
};

const PERSONA_BACKGROUND_SKIN: BandoriNativeBackgroundSkin = {
  id: "persona",
  layers: [{
    rect: BANDORI_NATIVE_BACKGROUND_RECT,
    textureUrl: `${PERSONA_BACKGROUND_ROOT}/livebg.png`,
  }],
};

const PERSONA_NOTE_SKIN: BandoriNativeNoteSkin = {
  assetBundleName: "skin_persona",
  curveSlideNoteLineUrl: `${PERSONA_NOTE_ROOT}/longnoteline2.png`,
  frameLayout: "b",
  frameSource: "sprites",
  id: "persona",
  longNoteLineUrl: `${PERSONA_NOTE_ROOT}/longnoteline.png`,
  spriteAnchorsUrl: null,
  syncLineEdgeMargin: 0,
  syncLineUrl: `${PERSONA_NOTE_ROOT}/simultaneous_line.png`,
};

const PERSONA_DIRECTIONAL_FLICK_SKIN: BandoriNativeDirectionalFlickSkin = {
  assetBundleName: "skin_persona",
  frameLayout: "tall-right-icon",
  frameSource: "sprites",
  id: "persona",
  lineLeftUrl: `${PERSONA_DIRECTIONAL_NOTE_ROOT}/flicknoteline_l.png`,
  lineRightUrl: `${PERSONA_DIRECTIONAL_NOTE_ROOT}/flicknoteline_r.png`,
  spriteAnchorsUrl: null,
};

const PERSONA_TAP_SE_SKIN: BandoriNativeTapSeSkin = {
  id: "persona",
  cueUrls: {
    flick: `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/sound/tapseskin/skin_persona/TapSE/flick.wav`,
    "long-keep": `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/sound/tapseskin/skin_persona/TapSE/SE_RHYTHM_TAP_LONG.wav`,
    perfect: `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/sound/tapseskin/skin_persona/TapSE/perfect.wav`,
  },
};

const PERSONA_EFFECT_RESOURCES = {
  "limited-persona-tap-default-particle": `${PERSONA_TAP_EFFECT_ROOT}/textures/default-particle.png`,
  "limited-persona-tap-tex_e_001": `${PERSONA_TAP_EFFECT_ROOT}/textures/tex_e_001.png`,
  "limited-persona-tap-tex_e_002": `${PERSONA_TAP_EFFECT_ROOT}/textures/tex_e_002.png`,
  "limited-persona-tap-tex_e_003": `${PERSONA_TAP_EFFECT_ROOT}/textures/tex_e_003.png`,
} as const;

const APRIL_2019_FIELD_SKIN: BandoriNativeFieldSkin = {
  assetBundleName: "skin_april2019",
  id: "april2019",
  judgmentLineSpriteHeight: 38,
  judgmentLineSpriteWidth: 1800,
  judgmentLineTextureUrl: `${APRIL_2019_FIELD_ROOT}/game_play_line.png`,
  skinType: "normal",
  textureUrl: `${APRIL_2019_FIELD_ROOT}/bg_line_rhythm.png`,
};

const APRIL_2019_BACKGROUND_SKIN: BandoriNativeBackgroundSkin = {
  id: "april2019",
  layers: [{
    rect: BANDORI_NATIVE_BACKGROUND_RECT,
    textureUrl: `${APRIL_2019_BACKGROUND_ROOT}/livebg.png`,
  }],
};

const APRIL_2019_NOTE_SKIN: BandoriNativeNoteSkin = {
  assetBundleName: "skin_april2019",
  curveSlideNoteLineUrl: `${APRIL_2019_NOTE_ROOT}/longnoteline2.png`,
  frameLayout: "b",
  frameSource: "sprites",
  id: "april2019",
  longNoteLineUrl: `${APRIL_2019_NOTE_ROOT}/longnoteline.png`,
  spriteAnchorsUrl: `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/ingameskin/noteskin/skin_april2019/sprites/sprite-anchors.json`,
  syncLineEdgeMargin: 0,
  syncLineUrl: `${APRIL_2019_NOTE_ROOT}/simultaneous_line.png`,
};

const APRIL_2019_TAP_SE_SKIN: BandoriNativeTapSeSkin = {
  id: "april2019",
  cueUrls: {
    flick: `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/sound/tapseskin/skin_april2019/TapSE/flick.wav`,
    "long-keep": `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/sound/tapseskin/skin_april2019/TapSE/SE_RHYTHM_TAP_LONG.wav`,
    perfect: `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/sound/tapseskin/skin_april2019/TapSE/perfect.wav`,
  },
};

const APRIL_2019_EFFECT_RESOURCES = {
  "limited-april2019-tap-tex_e_april2019": `${APRIL_2019_TAP_EFFECT_ROOT}/textures/tex_e_april2019.png`,
} as const;

function createSparseBackgroundSkin(
  id: BandoriNativeBackgroundSkin["id"],
  assetBundleName: string,
  filename: string,
): BandoriNativeBackgroundSkin {
  return {
    id,
    layers: [{
      rect: BANDORI_NATIVE_BACKGROUND_RECT,
      textureUrl: `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/assets/star/forassetbundle/asneeded/ingameskin/bgskin/${assetBundleName}/${filename}`,
    }],
  };
}

function createSparseNoteSkin(
  id: BandoriLimitedPerformanceSkin["id"],
  assetBundleName: string,
  curveSlideFilename: "longnoteline.png" | "longnoteline2.png",
): BandoriNativeNoteSkin {
  const noteRoot = `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/assets/star/forassetbundle/startapp/ingameskin/noteskin/${assetBundleName}`;
  return {
    assetBundleName,
    curveSlideNoteLineUrl: `${noteRoot}/${curveSlideFilename}`,
    frameLayout: "b",
    frameSource: "sprites",
    id,
    longNoteLineUrl: `${noteRoot}/longnoteline.png`,
    spriteAnchorsUrl: `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/ingameskin/noteskin/${assetBundleName}/sprites/sprite-anchors.json`,
    syncLineEdgeMargin: 0,
    syncLineUrl: `${noteRoot}/simultaneous_line.png`,
  };
}

function createSparseTapSeSkin(
  id: BandoriNativeTapSeSkin["id"],
  assetBundleName: string,
): BandoriNativeTapSeSkin {
  const root = `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/sound/tapseskin/${assetBundleName}/TapSE`;
  return {
    id,
    cueUrls: {
      flick: `${root}/flick.wav`,
      "long-keep": `${root}/SE_RHYTHM_TAP_LONG.wav`,
      perfect: `${root}/perfect.wav`,
    },
  };
}

function createSparseTapEffectContract(
  id: BandoriLimitedPerformanceSkin["id"],
  assetBundleName: string,
  textureNames: readonly string[],
): BandoriLimitedPerformanceEffectContract {
  const root = `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/ingameskin/tapeffect/${assetBundleName}`;
  return {
    animatedVerticalBeam: null,
    recipes: {
      flick: `${root}/recipes/flick.json`,
      hold: `${root}/recipes/hold.json`,
      normal: `${root}/recipes/normal.json`,
      skill: `${root}/recipes/skill.json`,
    },
    resources: Object.fromEntries(textureNames.map((textureName) => [
      `limited-${id}-tap-${textureName}`,
      `${root}/textures/${textureName}.png`,
    ])),
  };
}

function createSparseFieldSkin(
  id: BandoriLimitedPerformanceSkin["id"],
  assetBundleName: string,
  judgmentLineSpriteWidth: number,
  judgmentLineSpriteHeight: number,
): BandoriNativeFieldSkin {
  const root = `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/assets/star/forassetbundle/startapp/ingameskin/fieldskin/${assetBundleName}`;
  return {
    assetBundleName,
    id,
    judgmentLineSpriteHeight,
    judgmentLineSpriteWidth,
    judgmentLineTextureUrl: `${root}/game_play_line.png`,
    skinType: "normal",
    textureUrl: `${root}/bg_line_rhythm.png`,
  };
}

const MIKU_FIELD_SKIN: BandoriNativeFieldSkin = {
  assetBundleName: "skin_miku",
  id: "miku",
  judgmentLineSpriteHeight: 40,
  judgmentLineSpriteWidth: 1800,
  judgmentLineTextureUrl: `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/assets/star/forassetbundle/startapp/ingameskin/fieldskin/skin_miku/game_play_line.png`,
  skinType: "normal",
  textureUrl: `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/assets/star/forassetbundle/startapp/ingameskin/fieldskin/skin_miku/bg_line_rhythm.png`,
};

const MIKU_EFFECT_RESOURCES = {
  "limited-miku-tap-tex_e_miku": `${MIKU_TAP_EFFECT_ROOT}/textures/tex_e_miku.png`,
} as const;

const STAGE_EFFECT_RESOURCES = {
  "limited-stage-tap-default-particlesystem": `${STAGE_TAP_EFFECT_ROOT}/textures/default-particlesystem.png`,
  "limited-stage-tap-par_circle": `${STAGE_TAP_EFFECT_ROOT}/textures/par_circle.png`,
  "limited-stage-tap-par_circle_ripple": `${STAGE_TAP_EFFECT_ROOT}/textures/par_circle_ripple.png`,
  "limited-stage-tap-par_cross_1": `${STAGE_TAP_EFFECT_ROOT}/textures/par_cross_1.png`,
  "limited-stage-tap-par_cross_2": `${STAGE_TAP_EFFECT_ROOT}/textures/par_cross_2.png`,
  "limited-stage-tap-par_kira": `${STAGE_TAP_EFFECT_ROOT}/textures/par_kira.png`,
  "limited-stage-tap-par_kira_red": `${STAGE_TAP_EFFECT_ROOT}/textures/par_kira_red.png`,
  "limited-stage-tap-par_roar_flash": `${STAGE_TAP_EFFECT_ROOT}/textures/par_roar_flash.png`,
  "limited-stage-tap-par_roar_line": `${STAGE_TAP_EFFECT_ROOT}/textures/par_roar_line.png`,
  "limited-stage-tap-par_roar_ripple": `${STAGE_TAP_EFFECT_ROOT}/textures/par_roar_ripple.png`,
  "limited-stage-tap-par_shiny": `${STAGE_TAP_EFFECT_ROOT}/textures/par_shiny.png`,
  "limited-stage-tap-par_thunder": `${STAGE_TAP_EFFECT_ROOT}/textures/par_thunder.png`,
} as const;

const DELTA_EFFECTS = createSparseTapEffectContract("delta", "skin_delta", [
  "par_circle",
  "par_circle_anim",
  "par_circlec",
  "par_cross",
  "par_delta",
  "par_flash",
  "par_kira",
  "par_ripple",
  "par_shiny",
  "par_slash",
  "par_square",
  "par_square_filled",
]);
const DELTA_FIELD_SKIN = createSparseFieldSkin("delta", "skin_delta", 1797, 41);
const DELTA_NOTE_SKIN = createSparseNoteSkin(
  "delta",
  "skin_delta",
  "longnoteline2.png",
);
const DELTA_TAP_SE_SKIN = createSparseTapSeSkin("delta", "skin_delta");

const BANDORI_LIMITED_PERFORMANCE_SKIN_DEFINITIONS = [
  {
    backgroundSkin: PERSONA_BACKGROUND_SKIN,
    coverage: [
      "background",
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
      recipes: {
        flick: `${PERSONA_TAP_EFFECT_ROOT}/recipes/flick.json`,
        hold: `${PERSONA_TAP_EFFECT_ROOT}/recipes/hold.json`,
        normal: `${PERSONA_TAP_EFFECT_ROOT}/recipes/normal.json`,
        skill: `${PERSONA_TAP_EFFECT_ROOT}/recipes/skill.json`,
      },
      resources: PERSONA_EFFECT_RESOURCES,
    },
    fieldSkin: PERSONA_FIELD_SKIN,
    id: "persona",
    judgmentPerfectTextureUrl: null,
    noteSkin: PERSONA_NOTE_SKIN,
    tapSeSkin: PERSONA_TAP_SE_SKIN,
  },
  {
    backgroundSkin: APRIL_2019_BACKGROUND_SKIN,
    coverage: [
      "background",
      "lane",
      "judgment",
      "notes",
      "tapEffect",
      "soundEffect",
    ],
    directionalFlickSkin: null,
    effects: {
      animatedVerticalBeam: null,
      recipes: {
        flick: `${APRIL_2019_TAP_EFFECT_ROOT}/recipes/flick.json`,
        hold: `${APRIL_2019_TAP_EFFECT_ROOT}/recipes/hold.json`,
        normal: `${APRIL_2019_TAP_EFFECT_ROOT}/recipes/normal.json`,
        skill: `${APRIL_2019_TAP_EFFECT_ROOT}/recipes/skill.json`,
      },
      resources: APRIL_2019_EFFECT_RESOURCES,
    },
    fieldSkin: APRIL_2019_FIELD_SKIN,
    id: "april2019",
    judgmentPerfectTextureUrl: `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/ingameskin/judgeskin/skin_april2019/perfect.png`,
    noteSkin: APRIL_2019_NOTE_SKIN,
    tapSeSkin: APRIL_2019_TAP_SE_SKIN,
  },
  {
    backgroundSkin: createSparseBackgroundSkin("5th", "skin_5th", "livebg.png"),
    coverage: ["background"],
    directionalFlickSkin: null,
    effects: null,
    fieldSkin: null,
    id: "5th",
    judgmentPerfectTextureUrl: null,
    noteSkin: null,
    tapSeSkin: null,
  },
  {
    backgroundSkin: createSparseBackgroundSkin(
      "collabo23_winter_d",
      "skin_collabo23_winter_d",
      "livebg.png",
    ),
    coverage: ["background", "lane", "notes", "tapEffect", "soundEffect"],
    directionalFlickSkin: null,
    effects: DELTA_EFFECTS,
    fieldSkin: DELTA_FIELD_SKIN,
    id: "collabo23_winter_d",
    judgmentPerfectTextureUrl: null,
    noteSkin: DELTA_NOTE_SKIN,
    tapSeSkin: DELTA_TAP_SE_SKIN,
  },
  {
    backgroundSkin: null,
    coverage: ["notes", "soundEffect"],
    directionalFlickSkin: null,
    effects: null,
    fieldSkin: null,
    id: "april2018",
    judgmentPerfectTextureUrl: null,
    noteSkin: createSparseNoteSkin(
      "april2018",
      "skin_april2018",
      "longnoteline2.png",
    ),
    tapSeSkin: createSparseTapSeSkin("april2018", "skin_april2018"),
  },
  {
    backgroundSkin: createSparseBackgroundSkin("miku", "skin_miku", "livebg.png"),
    coverage: ["background", "lane", "notes", "tapEffect", "soundEffect"],
    directionalFlickSkin: null,
    effects: {
      animatedVerticalBeam: null,
      recipes: {
        flick: `${MIKU_TAP_EFFECT_ROOT}/recipes/flick.json`,
        hold: `${MIKU_TAP_EFFECT_ROOT}/recipes/hold.json`,
        normal: `${MIKU_TAP_EFFECT_ROOT}/recipes/normal.json`,
        skill: `${MIKU_TAP_EFFECT_ROOT}/recipes/skill.json`,
      },
      resources: MIKU_EFFECT_RESOURCES,
    },
    fieldSkin: MIKU_FIELD_SKIN,
    id: "miku",
    judgmentPerfectTextureUrl: null,
    noteSkin: createSparseNoteSkin("miku", "skin_miku", "longnoteline.png"),
    tapSeSkin: createSparseTapSeSkin("miku", "skin_miku"),
  },
  {
    backgroundSkin: createSparseBackgroundSkin(
      "gbp2020",
      "skin_gbp2020",
      "livebg.png",
    ),
    coverage: ["background", "lane"],
    directionalFlickSkin: null,
    effects: null,
    fieldSkin: createSparseFieldSkin("gbp2020", "skin_gbp2020", 1782, 55),
    id: "gbp2020",
    judgmentPerfectTextureUrl: null,
    noteSkin: null,
    tapSeSkin: null,
  },
  {
    backgroundSkin: createSparseBackgroundSkin("satan", "skin_satan", "livebg.png"),
    coverage: ["background", "lane"],
    directionalFlickSkin: null,
    effects: null,
    fieldSkin: createSparseFieldSkin("satan", "skin_satan", 1800, 96),
    id: "satan",
    judgmentPerfectTextureUrl: null,
    noteSkin: null,
    tapSeSkin: null,
  },
  {
    backgroundSkin: createSparseBackgroundSkin("bike", "skin_bike", "livebg.png"),
    coverage: ["background", "lane", "judgment"],
    directionalFlickSkin: null,
    effects: null,
    fieldSkin: createSparseFieldSkin("bike", "skin_bike", 1801, 56),
    id: "bike",
    judgmentPerfectTextureUrl: `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/ingameskin/judgeskin/skin_bike/perfect.png`,
    noteSkin: null,
    tapSeSkin: null,
  },
  {
    backgroundSkin: createSparseBackgroundSkin(
      "april2024",
      "skin_april_2024",
      "livebg.png",
    ),
    coverage: ["background", "lane", "notes"],
    directionalFlickSkin: null,
    effects: null,
    fieldSkin: createSparseFieldSkin(
      "april2024",
      "skin_april_2024",
      1800,
      43,
    ),
    id: "april2024",
    judgmentPerfectTextureUrl: null,
    noteSkin: createSparseNoteSkin(
      "april2024",
      "skin_april_2024",
      "longnoteline2.png",
    ),
    tapSeSkin: null,
  },
  {
    backgroundSkin: createSparseBackgroundSkin(
      "collabo23_summer_g",
      "skin_collabo23_summer_g",
      "livebg.png",
    ),
    coverage: ["background", "lane", "notes"],
    directionalFlickSkin: null,
    effects: null,
    fieldSkin: createSparseFieldSkin(
      "collabo23_summer_g",
      "collabo23_summer_g",
      1800,
      186,
    ),
    id: "collabo23_summer_g",
    judgmentPerfectTextureUrl: null,
    noteSkin: createSparseNoteSkin(
      "collabo23_summer_g",
      "collabo23_summer_g",
      "longnoteline2.png",
    ),
    tapSeSkin: null,
  },
  {
    backgroundSkin: createSparseBackgroundSkin(
      "collabo24_autumn_i",
      "skin_collabo24_autumn_i",
      "livebg.png",
    ),
    coverage: ["background", "lane", "notes"],
    directionalFlickSkin: null,
    effects: null,
    fieldSkin: createSparseFieldSkin(
      "collabo24_autumn_i",
      "skin_collabo24_autumn_i",
      1800,
      127,
    ),
    id: "collabo24_autumn_i",
    judgmentPerfectTextureUrl: null,
    noteSkin: createSparseNoteSkin(
      "collabo24_autumn_i",
      "skin_collabo24_autumn_i",
      "longnoteline2.png",
    ),
    tapSeSkin: null,
  },
  {
    backgroundSkin: createSparseBackgroundSkin(
      "collabo25_autumn_s",
      "skin_collabo25_autumn_s",
      "livebg.png",
    ),
    coverage: ["background", "lane", "notes"],
    directionalFlickSkin: null,
    effects: null,
    fieldSkin: createSparseFieldSkin(
      "collabo25_autumn_s",
      "skin_collabo25_autumn_s",
      1800,
      127,
    ),
    id: "collabo25_autumn_s",
    judgmentPerfectTextureUrl: null,
    noteSkin: createSparseNoteSkin(
      "collabo25_autumn_s",
      "skin_collabo25_autumn_s",
      "longnoteline2.png",
    ),
    tapSeSkin: null,
  },
  {
    backgroundSkin: createSparseBackgroundSkin(
      "april2021",
      "skin_april2021",
      "livebg.png",
    ),
    coverage: ["background", "lane", "judgment", "notes", "soundEffect"],
    directionalFlickSkin: null,
    effects: null,
    fieldSkin: createSparseFieldSkin(
      "april2021",
      "skin_april2021",
      1800,
      36,
    ),
    id: "april2021",
    judgmentPerfectTextureUrl: `${CHART_SIMULATOR_LOGICAL_ASSET_ROOT}/ingameskin/judgeskin/skinapril2021/perfect.png`,
    noteSkin: createSparseNoteSkin(
      "april2021",
      "skin_april2021",
      "longnoteline2.png",
    ),
    tapSeSkin: createSparseTapSeSkin("april2021", "skinapril2021"),
  },
  {
    backgroundSkin: createSparseBackgroundSkin("cafe", "skin_cafe", "livebg.png"),
    coverage: ["background", "lane", "notes", "tapEffect", "soundEffect"],
    directionalFlickSkin: null,
    effects: createSparseTapEffectContract("cafe", "skin_cafe", ["tex_cafe"]),
    fieldSkin: createSparseFieldSkin("cafe", "skin_cafe", 1800, 40),
    id: "cafe",
    judgmentPerfectTextureUrl: null,
    noteSkin: createSparseNoteSkin("cafe", "skin_cafe", "longnoteline.png"),
    tapSeSkin: createSparseTapSeSkin("cafe", "skin_cafe"),
  },
  {
    backgroundSkin: createSparseBackgroundSkin("coin", "skin_coin", "livebg.png"),
    coverage: ["background", "lane", "notes", "tapEffect", "soundEffect"],
    directionalFlickSkin: null,
    effects: createSparseTapEffectContract("coin", "skin_coin", [
      "tex_coin",
      "tex_electric",
      "tex_railgun",
      "tex_rainbow",
    ]),
    fieldSkin: createSparseFieldSkin("coin", "skin_coin", 1800, 56),
    id: "coin",
    judgmentPerfectTextureUrl: null,
    noteSkin: createSparseNoteSkin("coin", "skin_coin", "longnoteline.png"),
    tapSeSkin: createSparseTapSeSkin("coin", "skin_coin"),
  },
  {
    backgroundSkin: createSparseBackgroundSkin("delta", "skin_delta", "livebg.png"),
    coverage: ["background", "lane", "notes", "tapEffect", "soundEffect"],
    directionalFlickSkin: null,
    effects: DELTA_EFFECTS,
    fieldSkin: DELTA_FIELD_SKIN,
    id: "delta",
    judgmentPerfectTextureUrl: null,
    noteSkin: DELTA_NOTE_SKIN,
    tapSeSkin: DELTA_TAP_SE_SKIN,
  },
  {
    backgroundSkin: createSparseBackgroundSkin("maid", "skin_maid", "livebg.png"),
    coverage: ["background", "lane", "notes", "tapEffect", "soundEffect"],
    directionalFlickSkin: null,
    effects: createSparseTapEffectContract("maid", "skin_maid", [
      "tex_maid",
      "tex_maid_rainbow",
    ]),
    fieldSkin: createSparseFieldSkin("maid", "skin_maid", 1800, 56),
    id: "maid",
    judgmentPerfectTextureUrl: null,
    noteSkin: createSparseNoteSkin("maid", "skin_maid", "longnoteline2.png"),
    tapSeSkin: createSparseTapSeSkin("maid", "skin_maid"),
  },
  {
    backgroundSkin: createSparseBackgroundSkin("stage", "skin_stage", "livebg.png"),
    coverage: ["background", "lane", "notes", "tapEffect", "soundEffect"],
    directionalFlickSkin: null,
    effects: {
      animatedVerticalBeam: null,
      recipes: {
        flick: `${STAGE_TAP_EFFECT_ROOT}/recipes/flick.json`,
        hold: `${STAGE_TAP_EFFECT_ROOT}/recipes/hold.json`,
        normal: `${STAGE_TAP_EFFECT_ROOT}/recipes/normal.json`,
        skill: `${STAGE_TAP_EFFECT_ROOT}/recipes/skill.json`,
      },
      resources: STAGE_EFFECT_RESOURCES,
    },
    fieldSkin: createSparseFieldSkin("stage", "skin_stage", 1800, 80),
    id: "stage",
    judgmentPerfectTextureUrl: null,
    noteSkin: createSparseNoteSkin("stage", "skin_stage", "longnoteline2.png"),
    tapSeSkin: createSparseTapSeSkin("stage", "skin_stage"),
  },
  {
    backgroundSkin: createSparseBackgroundSkin("witch", "skin_witch", "livebg.png"),
    coverage: ["background", "lane", "notes", "tapEffect", "soundEffect"],
    directionalFlickSkin: null,
    effects: createSparseTapEffectContract("witch", "skin_witch", [
      "tex_belt_note_02",
      "tex_belt_rainbow_01",
      "tex_belt_rainbow_02",
      "tex_belt_rainbow_03",
      "tex_witch",
      "tex_witch_whiteball",
    ]),
    fieldSkin: createSparseFieldSkin("witch", "skin_witch", 1800, 96),
    id: "witch",
    judgmentPerfectTextureUrl: null,
    noteSkin: createSparseNoteSkin("witch", "skin_witch", "longnoteline.png"),
    tapSeSkin: createSparseTapSeSkin("witch", "skin_witch"),
  },
] as const satisfies readonly BandoriLimitedPerformanceSkin[];

const LIMITED_PERFORMANCE_SKIN_FIRST_AVAILABLE_DATE = {
  april2018: 20180401,
  persona: 20180720,
  miku: 20180824,
  april2019: 20190401,
  cafe: 20190426,
  maid: 20191120,
  gbp2020: 20200503,
  coin: 20200630,
  witch: 20201031,
  april2021: 20210401,
  stage: 20210620,
  delta: 20211022,
  "5th": 20220318,
  bike: 20220521,
  satan: 20221029,
  collabo23_summer_g: 20230630,
  collabo23_winter_d: 20231206,
  april2024: 20240401,
  collabo24_autumn_i: 20241004,
  collabo25_autumn_s: 20251110,
} as const satisfies Record<BandoriLimitedPerformanceSkin["id"], number>;

/** Selectable limited overlays ordered by their first JP availability window. */
export const BANDORI_LIMITED_PERFORMANCE_SKINS =
  BANDORI_LIMITED_PERFORMANCE_SKIN_DEFINITIONS.toSorted(
    (left, right) => LIMITED_PERFORMANCE_SKIN_FIRST_AVAILABLE_DATE[left.id]
      - LIMITED_PERFORMANCE_SKIN_FIRST_AVAILABLE_DATE[right.id],
  );
