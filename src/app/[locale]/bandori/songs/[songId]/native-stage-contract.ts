import {
  BANDORI_COMPILED_DIRECTION,
  getBandoriCompiledLaneSpan,
} from "@/lib/bandori/chart-simulator/compiler";

export const BANDORI_NATIVE_STAGE_SIZE = {
  width: 1334,
  height: 750,
} as const;

export const BANDORI_NATIVE_FIELD_RECT = {
  left: 87,
  top: 5,
  width: 1160,
  height: 610,
} as const;

export const BANDORI_NATIVE_BACKGROUND_RECT = {
  left: -216.2,
  top: -131,
  width: 1766.4,
  height: 1324.8,
} as const;

export type BandoriNativeBackgroundSkinId =
  | "skin00"
  | "skin02"
  | "skin03"
  | "5th"
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
  | "practice"
  | "persona"
  | "satan"
  | "stage"
  | "april2019"
  | "witch"
  | "teamLiveJudgment"
  | "teamLiveCombo"
  | "teamLiveLife";

export type BandoriNativeBackgroundLayer = {
  rect: {
    height: number;
    left: number;
    top: number;
    width: number;
  };
  textureUrl: string;
};

export type BandoriNativeBackgroundSkin = {
  id: BandoriNativeBackgroundSkinId;
  layers: readonly BandoriNativeBackgroundLayer[];
};

const BACKGROUND_STARTAPP_ROOT =
  "/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/bgskin";
const BACKGROUND_ASNEEDED_ROOT =
  "/local/chart-simulator/assets/star/forassetbundle/asneeded/ingameskin/bgskin";
const NATIVE_BACKGROUND_SCALE = 0.92;
const NATIVE_BACKGROUND_OBJECT_IMAGE_Y = 546;

function projectNativeBackgroundLayer(
  textureUrl: string,
  nativeWidth: number,
  nativeHeight: number,
  nativeX = 0,
  nativeY = NATIVE_BACKGROUND_OBJECT_IMAGE_Y,
): BandoriNativeBackgroundLayer {
  const width = nativeWidth * NATIVE_BACKGROUND_SCALE;
  const height = nativeHeight * NATIVE_BACKGROUND_SCALE;
  const centerX = BANDORI_NATIVE_STAGE_SIZE.width / 2
    + nativeX * NATIVE_BACKGROUND_SCALE;
  const centerY = BANDORI_NATIVE_STAGE_SIZE.height / 2
    - nativeY * NATIVE_BACKGROUND_SCALE;
  return {
    rect: {
      height,
      left: centerX - width / 2,
      top: centerY - height / 2,
      width,
    },
    textureUrl,
  };
}

function createMainBackgroundLayer(textureUrl: string): BandoriNativeBackgroundLayer {
  return {
    rect: BANDORI_NATIVE_BACKGROUND_RECT,
    textureUrl,
  };
}

function createTeamLiveBackground(
  id: Extract<BandoriNativeBackgroundSkinId, `teamLive${string}`>,
  stageTextureName: "combostage" | "lifestage" | "perfectstage",
): BandoriNativeBackgroundSkin {
  const root = `${BACKGROUND_ASNEEDED_ROOT}/skin_teamlivefestival`;
  return {
    id,
    layers: [
      createMainBackgroundLayer(`${root}/${stageTextureName}.png`),
    ],
  };
}

/** Statically verified normal-play and team-live background compositions. */
export const BANDORI_NATIVE_BACKGROUND_SKINS = [
  {
    id: "skin00",
    layers: [
      createMainBackgroundLayer(`${BACKGROUND_STARTAPP_ROOT}/skin00/livebg_normal.png`),
    ],
  },
  {
    id: "skin02",
    layers: [
      createMainBackgroundLayer(`${BACKGROUND_ASNEEDED_ROOT}/skin02/livebg_normal.png`),
      projectNativeBackgroundLayer(
        `${BACKGROUND_ASNEEDED_ROOT}/skin02/livebg_layer1.png`,
        1920,
        601,
      ),
    ],
  },
  {
    id: "skin03",
    layers: [
      createMainBackgroundLayer(`${BACKGROUND_ASNEEDED_ROOT}/skin03/livebg_normal.png`),
      projectNativeBackgroundLayer(
        `${BACKGROUND_ASNEEDED_ROOT}/skin03/livebg_layer1.png`,
        1920,
        609,
      ),
      projectNativeBackgroundLayer(
        `${BACKGROUND_ASNEEDED_ROOT}/skin03/livebg_layer2.png`,
        1920,
        476,
      ),
    ],
  },
  {
    id: "practice",
    layers: [
      createMainBackgroundLayer(
        `${BACKGROUND_ASNEEDED_ROOT}/skinpractice/livebg_normal.png`,
      ),
    ],
  },
  createTeamLiveBackground("teamLiveJudgment", "perfectstage"),
  createTeamLiveBackground("teamLiveCombo", "combostage"),
  createTeamLiveBackground("teamLiveLife", "lifestage"),
] as const satisfies readonly BandoriNativeBackgroundSkin[];

export const BANDORI_NATIVE_BACKGROUND_SKIN = BANDORI_NATIVE_BACKGROUND_SKINS[0];

const FIELD_SKIN_ROOT =
  "/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/fieldskin";

export type BandoriNativeFieldSkin = {
  assetBundleName: string;
  id: number | string;
  judgmentLineSpriteHeight: number;
  judgmentLineSpriteWidth: number;
  judgmentLineTextureUrl: string;
  skinType: "normal" | "mission";
  textureUrl: string;
};

function createFieldSkin(
  id: number,
  assetBundleName: string,
  judgmentLineSpriteHeight: BandoriNativeFieldSkin["judgmentLineSpriteHeight"],
  skinType: BandoriNativeFieldSkin["skinType"],
): BandoriNativeFieldSkin {
  const baseUrl = `${FIELD_SKIN_ROOT}/${assetBundleName}`;
  return {
    assetBundleName,
    id,
    judgmentLineSpriteHeight,
    judgmentLineSpriteWidth: 1800,
    judgmentLineTextureUrl: `${baseUrl}/game_play_line.png`,
    skinType,
    textureUrl: `${baseUrl}/bg_line_rhythm.png`,
  };
}

/** MasterSkin.skinLaneMap order from the frozen JP 10.1.3 master. */
export const BANDORI_NATIVE_FIELD_SKINS = [
  createFieldSkin(1, "skin00", 38, "normal"),
  createFieldSkin(2, "skin01", 38, "normal"),
  createFieldSkin(3, "skin02", 38, "normal"),
  createFieldSkin(4, "skin03", 18, "normal"),
  createFieldSkin(5, "skin04", 40, "normal"),
  createFieldSkin(6, "skin05", 56, "mission"),
  createFieldSkin(7, "skin06", 56, "mission"),
  createFieldSkin(8, "skin07", 56, "mission"),
  createFieldSkin(9, "skin08", 56, "mission"),
  createFieldSkin(10, "skin09", 56, "mission"),
  createFieldSkin(11, "skin10", 56, "mission"),
  createFieldSkin(12, "skin11", 56, "mission"),
  createFieldSkin(13, "skin12", 56, "normal"),
  createFieldSkin(14, "skin13", 40, "normal"),
  createFieldSkin(15, "skin14", 56, "mission"),
] as const satisfies readonly BandoriNativeFieldSkin[];

/** User-approved simulator default: Hello, Happy World! (master ID 10). */
export const BANDORI_NATIVE_FIELD_SKIN = BANDORI_NATIVE_FIELD_SKINS[9];

const JUDGMENT_LINE_CENTER_X = BANDORI_NATIVE_STAGE_SIZE.width / 2;
const JUDGMENT_LINE_CENTER_Y = BANDORI_NATIVE_STAGE_SIZE.height / 2
  + 0.180089489996874 * BANDORI_NATIVE_STAGE_SIZE.width;
const JUDGMENT_LINE_PIXEL_SCALE = 0.99
  / (69 * 2 * 9.578571319580078)
  * BANDORI_NATIVE_STAGE_SIZE.width;

export function getBandoriNativeJudgmentLineRect(
  spriteHeight: BandoriNativeFieldSkin["judgmentLineSpriteHeight"],
  spriteWidth: BandoriNativeFieldSkin["judgmentLineSpriteWidth"] = 1800,
): {
  height: number;
  left: number;
  top: number;
  width: number;
} {
  const width = spriteWidth * JUDGMENT_LINE_PIXEL_SCALE;
  const height = spriteHeight * JUDGMENT_LINE_PIXEL_SCALE;
  return {
    height,
    left: JUDGMENT_LINE_CENTER_X - width / 2,
    top: JUDGMENT_LINE_CENTER_Y - height / 2,
    width,
  };
}

export function mirrorBandoriChartLane(lane: number): number {
  if (!Number.isFinite(lane)) {
    throw new Error("Bandori mirror requires a finite lane");
  }
  return 6 - lane;
}

export function mirrorBandoriChartDirection(direction: number): number {
  if (direction === BANDORI_COMPILED_DIRECTION.left) {
    return BANDORI_COMPILED_DIRECTION.right;
  }
  if (direction === BANDORI_COMPILED_DIRECTION.right) {
    return BANDORI_COMPILED_DIRECTION.left;
  }
  if (direction === BANDORI_COMPILED_DIRECTION.none) {
    return BANDORI_COMPILED_DIRECTION.none;
  }
  throw new Error("Bandori mirror has an unsupported direction");
}

/**
 * Mirrors chart data without transforming the stage. The projected span is
 * reflected from the original seven-lane span so multi-width notes remain in
 * bounds while the stored lane follows the native 0↔6 mapping.
 */
export function mirrorBandoriChartPoint(
  lane: number,
  width: number,
  direction: number,
): {
  lane: number;
  width: number;
  direction: number;
  leftLane: number;
  rightLane: number;
} {
  const span = getBandoriCompiledLaneSpan(lane, width, direction);
  return {
    lane: mirrorBandoriChartLane(lane),
    width,
    direction: mirrorBandoriChartDirection(direction),
    leftLane: 7 - span.rightLane,
    rightLane: 7 - span.leftLane,
  };
}
