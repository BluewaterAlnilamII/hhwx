import {
  BandoriNativeNoteContractError,
  type BandoriNativeNoteBody,
  type BandoriNativeNoteIcon,
  type BandoriNativeNoteVisual,
} from "@/lib/bandori/chart-simulator/native-note-presentation";
import {
  getBandoriHabahiroSpriteUrl,
  isBandoriHabahiroSpriteName,
  type BandoriHabahiroSpriteName,
} from "./habahiro-note-assets";

const NOTE_SKIN_ROOT =
  "/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/noteskin";
const NOTE_SKIN_SPRITE_ROOT =
  "/local/chart-simulator/ingameskin/noteskin";

type StandardNoteFrameLayout = "a" | "b" | "c";
type DirectionalNoteFrameLayout = "short-right-icon" | "tall-right-icon";
type NativeNoteFrameSource = "atlas" | "sprites";

export type BandoriNativeNoteSkin = {
  assetBundleName: string;
  atlasUrl: string;
  curveSlideNoteLineUrl: string;
  frameLayout: StandardNoteFrameLayout;
  frameSource: NativeNoteFrameSource;
  id: number | string;
  longNoteLineUrl: string;
  spriteAnchorsUrl: string | null;
  syncLineEdgeMargin: number;
  syncLineUrl: string;
};

export type BandoriNativeDirectionalFlickSkin = {
  assetBundleName: string;
  atlasUrl: string;
  frameLayout: DirectionalNoteFrameLayout;
  frameSource: NativeNoteFrameSource;
  id: number | string;
  lineLeftUrl: string;
  lineRightUrl: string;
  spriteAnchorsUrl: string | null;
};

function createNoteSkin(
  id: number,
  assetBundleName: string,
  frameLayout: StandardNoteFrameLayout,
  syncLineEdgeMargin = 0,
): BandoriNativeNoteSkin {
  return {
    assetBundleName,
    atlasUrl: `${NOTE_SKIN_ROOT}/${assetBundleName}/rhythmgamesprites.png`,
    curveSlideNoteLineUrl: `${NOTE_SKIN_ROOT}/${assetBundleName}/longnoteline2.png`,
    frameLayout,
    frameSource: "atlas",
    id,
    longNoteLineUrl: `${NOTE_SKIN_ROOT}/${assetBundleName}/longnoteline.png`,
    spriteAnchorsUrl: null,
    syncLineEdgeMargin,
    syncLineUrl: `${NOTE_SKIN_ROOT}/${assetBundleName}/simultaneous_line.png`,
  };
}

function createDirectionalFlickSkin(
  id: number,
  assetBundleName: string,
  frameLayout: DirectionalNoteFrameLayout,
): BandoriNativeDirectionalFlickSkin {
  return {
    assetBundleName,
    atlasUrl: `${NOTE_SKIN_ROOT}/directionalflick${assetBundleName}/directionalflicksprites.png`,
    frameLayout,
    frameSource: "atlas",
    id,
    lineLeftUrl: `${NOTE_SKIN_ROOT}/directionalflick${assetBundleName}/flicknoteline_l.png`,
    lineRightUrl: `${NOTE_SKIN_ROOT}/directionalflick${assetBundleName}/flicknoteline_r.png`,
    spriteAnchorsUrl: null,
  };
}

/** MasterSkin.skinNotesMap order and exact bundle mapping. */
export const BANDORI_NATIVE_NOTE_SKINS = [
  createNoteSkin(1, "skin00", "a"),
  createNoteSkin(2, "skin01", "a"),
  createNoteSkin(3, "skin02", "b"),
  createNoteSkin(4, "skin03", "b"),
  createNoteSkin(5, "skin04", "a"),
  createNoteSkin(6, "skin06", "c"),
  createNoteSkin(7, "skin05", "b", 1.100000023841858),
] as const satisfies readonly BandoriNativeNoteSkin[];

/** MasterSkin.skinDirectionalFlickMap order and exact bundle mapping. */
export const BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS = [
  createDirectionalFlickSkin(1, "skin00", "short-right-icon"),
  createDirectionalFlickSkin(2, "skin01", "tall-right-icon"),
  createDirectionalFlickSkin(3, "skin02", "tall-right-icon"),
  createDirectionalFlickSkin(4, "skin03", "tall-right-icon"),
  createDirectionalFlickSkin(5, "skin04", "tall-right-icon"),
] as const satisfies readonly BandoriNativeDirectionalFlickSkin[];

export const BANDORI_NATIVE_NOTE_SKIN = BANDORI_NATIVE_NOTE_SKINS[0];
export const BANDORI_NATIVE_DIRECTIONAL_FLICK_SKIN =
  BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS[0];

export function getBandoriNativeLongFlashUrl(
  noteSkin: BandoriNativeNoteSkin,
  lane: number,
): string {
  if (!Number.isInteger(lane) || lane < 0 || lane > 6) {
    throw new Error("Native LongNoteFlash lane must be an integer from 0 through 6");
  }
  return `${NOTE_SKIN_SPRITE_ROOT}/${noteSkin.assetBundleName}/sprites/note_long_flash_${lane}.png`;
}

export function getBandoriNativeRhythmSupportNoteUrl(
  noteSkin: BandoriNativeNoteSkin,
  lane: number,
): string {
  if (!Number.isInteger(lane) || lane < 0 || lane > 6) {
    throw new Error("Native rhythm-support lane must be an integer from 0 through 6");
  }
  return `${NOTE_SKIN_SPRITE_ROOT}/${noteSkin.assetBundleName}/sprites/note_normal_16_${lane}.png`;
}

function getHabahiroCoverageSuffix(visual: BandoriNativeNoteVisual): string {
  return (visual.coveredLanes ?? [visual.lane]).join("_");
}

function requireHabahiroSpriteName(name: string): BandoriHabahiroSpriteName {
  if (!isBandoriHabahiroSpriteName(name)) {
    throw new Error(`Habahiro Sprite is outside the verified JP set: ${name}`);
  }
  return name;
}

export function getBandoriHabahiroBodySpriteName(
  visual: BandoriNativeNoteVisual,
): BandoriHabahiroSpriteName | null {
  const coverageLength = (visual.coveredLanes ?? [visual.lane]).length;
  if (
    coverageLength === 1
    || visual.body === "directionalLeft"
    || visual.body === "directionalRight"
  ) return null;
  const name = visual.body === "slideAmong"
    ? `note_slide_among${coverageLength === 1 ? "" : `_${coverageLength}`}`
    : `${BODY_PREFIX[visual.body]}_${getHabahiroCoverageSuffix(visual)}`;
  return requireHabahiroSpriteName(name);
}

export function getBandoriHabahiroIconSpriteName(
  visual: BandoriNativeNoteVisual,
): BandoriHabahiroSpriteName | null {
  if (!isBandoriHabahiroMultiRangeFlickIcon(visual)) return null;
  const coverageLength = visual.coveredLanes?.length ?? 1;
  // The range Flick contract has three top widths. Wider bodies keep using
  // the width-3 top instead of requiring nonexistent width-4...7 assets.
  const topWidth = Math.min(coverageLength, 3);
  const name = `note_flick_top${topWidth === 1 ? "" : `_${topWidth}`}`;
  return requireHabahiroSpriteName(name);
}

export function isBandoriHabahiroMultiRangeFlickIcon(
  visual: BandoriNativeNoteVisual,
): boolean {
  return visual.icon === "flick" && (visual.coveredLanes?.length ?? 1) > 1;
}

export function getBandoriHabahiroLongFlashSpriteName(
  coveredLanes: readonly number[],
): BandoriHabahiroSpriteName {
  return requireHabahiroSpriteName(`note_long_flash_${coveredLanes.join("_")}`);
}

export function getBandoriHabahiroRhythmSpriteName(
  visual: BandoriNativeNoteVisual,
): BandoriHabahiroSpriteName {
  return requireHabahiroSpriteName(`note_normal_16_${getHabahiroCoverageSuffix(visual)}`);
}

export { getBandoriHabahiroSpriteUrl };

export const BANDORI_NATIVE_NOTE_ATLAS_SIZE = {
  standard: { width: 2048, height: 1024 },
  directional: { width: 1024, height: 1024 },
} as const;

export type BandoriNativeNoteAtlas = keyof typeof BANDORI_NATIVE_NOTE_ATLAS_SIZE;

export type BandoriNativeNoteFrame = {
  atlas: BandoriNativeNoteAtlas;
  height: number;
  width: number;
  x: number;
  /** Unity Sprite rect Y measured from the atlas bottom edge. */
  y: number;
};

const NOTE_FRAMES = {
  note_flick_0: { atlas: "standard", x: 620, y: 610, width: 308, height: 120 },
  note_flick_1: { atlas: "standard", x: 0, y: 854, width: 308, height: 120 },
  note_flick_2: { atlas: "standard", x: 0, y: 732, width: 308, height: 120 },
  note_flick_3: { atlas: "standard", x: 0, y: 0, width: 308, height: 120 },
  note_flick_4: { atlas: "standard", x: 1240, y: 0, width: 308, height: 120 },
  note_flick_5: { atlas: "standard", x: 0, y: 488, width: 308, height: 120 },
  note_flick_6: { atlas: "standard", x: 310, y: 244, width: 308, height: 120 },
  note_flick_l_0: { atlas: "directional", x: 0, y: 0, width: 308, height: 120 },
  note_flick_l_1: { atlas: "directional", x: 310, y: 0, width: 308, height: 120 },
  note_flick_l_2: { atlas: "directional", x: 620, y: 0, width: 308, height: 120 },
  note_flick_l_3: { atlas: "directional", x: 0, y: 122, width: 308, height: 120 },
  note_flick_l_4: { atlas: "directional", x: 310, y: 122, width: 308, height: 120 },
  note_flick_l_5: { atlas: "directional", x: 620, y: 122, width: 308, height: 120 },
  note_flick_l_6: { atlas: "directional", x: 0, y: 244, width: 308, height: 120 },
  note_flick_r_0: { atlas: "directional", x: 0, y: 366, width: 308, height: 120 },
  note_flick_r_1: { atlas: "directional", x: 0, y: 488, width: 308, height: 120 },
  note_flick_r_2: { atlas: "directional", x: 0, y: 610, width: 308, height: 120 },
  note_flick_r_3: { atlas: "directional", x: 0, y: 732, width: 308, height: 120 },
  note_flick_r_4: { atlas: "directional", x: 0, y: 854, width: 308, height: 120 },
  note_flick_r_5: { atlas: "directional", x: 310, y: 244, width: 308, height: 120 },
  note_flick_r_6: { atlas: "directional", x: 620, y: 244, width: 308, height: 120 },
  note_flick_top: { atlas: "standard", x: 1240, y: 854, width: 171, height: 138 },
  note_flick_top_l: { atlas: "directional", x: 310, y: 366, width: 138, height: 171 },
  note_flick_top_r: { atlas: "directional", x: 310, y: 539, width: 138, height: 170 },
  note_long_0: { atlas: "standard", x: 1550, y: 366, width: 308, height: 120 },
  note_long_1: { atlas: "standard", x: 620, y: 244, width: 308, height: 120 },
  note_long_2: { atlas: "standard", x: 310, y: 854, width: 308, height: 120 },
  note_long_3: { atlas: "standard", x: 620, y: 122, width: 308, height: 120 },
  note_long_4: { atlas: "standard", x: 1240, y: 122, width: 308, height: 120 },
  note_long_5: { atlas: "standard", x: 1240, y: 610, width: 308, height: 120 },
  note_long_6: { atlas: "standard", x: 1240, y: 366, width: 308, height: 120 },
  note_normal_0: { atlas: "standard", x: 620, y: 732, width: 308, height: 120 },
  note_normal_1: { atlas: "standard", x: 620, y: 488, width: 308, height: 120 },
  note_normal_2: { atlas: "standard", x: 620, y: 0, width: 308, height: 120 },
  note_normal_3: { atlas: "standard", x: 1550, y: 0, width: 308, height: 120 },
  note_normal_4: { atlas: "standard", x: 930, y: 244, width: 308, height: 120 },
  note_normal_5: { atlas: "standard", x: 620, y: 854, width: 308, height: 120 },
  note_normal_6: { atlas: "standard", x: 1550, y: 122, width: 308, height: 120 },
  note_skill_0: { atlas: "standard", x: 930, y: 732, width: 308, height: 120 },
  note_skill_1: { atlas: "standard", x: 930, y: 366, width: 308, height: 120 },
  note_skill_2: { atlas: "standard", x: 310, y: 488, width: 308, height: 120 },
  note_skill_3: { atlas: "standard", x: 930, y: 122, width: 308, height: 120 },
  note_skill_4: { atlas: "standard", x: 1240, y: 732, width: 308, height: 120 },
  note_skill_5: { atlas: "standard", x: 0, y: 610, width: 308, height: 120 },
  note_skill_6: { atlas: "standard", x: 1240, y: 488, width: 308, height: 120 },
  note_slide_among: { atlas: "standard", x: 310, y: 610, width: 308, height: 120 },
} as const satisfies Record<string, BandoriNativeNoteFrame>;

export type BandoriNativeNoteFrameId = keyof typeof NOTE_FRAMES;

const STANDARD_NOTE_LAYOUT_B_OVERRIDES: Partial<
  Record<BandoriNativeNoteFrameId, BandoriNativeNoteFrame>
> = {
  note_flick_0: { atlas: "standard", x: 0, y: 0, width: 308, height: 120 },
  note_flick_1: { atlas: "standard", x: 930, y: 366, width: 308, height: 120 },
  note_flick_2: { atlas: "standard", x: 930, y: 244, width: 308, height: 120 },
  note_flick_3: { atlas: "standard", x: 620, y: 732, width: 308, height: 120 },
  note_flick_4: { atlas: "standard", x: 0, y: 488, width: 308, height: 120 },
  note_flick_5: { atlas: "standard", x: 1550, y: 0, width: 308, height: 120 },
  note_flick_6: { atlas: "standard", x: 930, y: 732, width: 308, height: 120 },
  note_long_0: { atlas: "standard", x: 620, y: 244, width: 308, height: 120 },
  note_long_1: { atlas: "standard", x: 1240, y: 488, width: 308, height: 120 },
  note_long_2: { atlas: "standard", x: 1550, y: 244, width: 308, height: 120 },
  note_long_3: { atlas: "standard", x: 1550, y: 366, width: 308, height: 120 },
  note_long_4: { atlas: "standard", x: 310, y: 610, width: 308, height: 120 },
  note_long_5: { atlas: "standard", x: 620, y: 488, width: 308, height: 120 },
  note_long_6: { atlas: "standard", x: 620, y: 122, width: 308, height: 120 },
  note_normal_0: { atlas: "standard", x: 0, y: 122, width: 308, height: 120 },
  note_normal_1: { atlas: "standard", x: 1240, y: 732, width: 308, height: 120 },
  note_normal_2: { atlas: "standard", x: 1240, y: 366, width: 308, height: 120 },
  note_normal_3: { atlas: "standard", x: 0, y: 610, width: 308, height: 120 },
  note_normal_4: { atlas: "standard", x: 0, y: 854, width: 308, height: 120 },
  note_normal_5: { atlas: "standard", x: 0, y: 244, width: 308, height: 120 },
  note_normal_6: { atlas: "standard", x: 310, y: 732, width: 308, height: 120 },
  note_skill_0: { atlas: "standard", x: 310, y: 366, width: 308, height: 120 },
  note_skill_1: { atlas: "standard", x: 310, y: 0, width: 308, height: 120 },
  note_skill_2: { atlas: "standard", x: 1240, y: 122, width: 308, height: 120 },
  note_skill_3: { atlas: "standard", x: 0, y: 732, width: 308, height: 120 },
  note_skill_4: { atlas: "standard", x: 620, y: 610, width: 308, height: 120 },
  note_skill_5: { atlas: "standard", x: 930, y: 122, width: 308, height: 120 },
  note_skill_6: { atlas: "standard", x: 620, y: 366, width: 308, height: 120 },
  note_slide_among: { atlas: "standard", x: 1550, y: 122, width: 308, height: 120 },
};

const STANDARD_NOTE_LAYOUT_C_OVERRIDES: Partial<
  Record<BandoriNativeNoteFrameId, BandoriNativeNoteFrame>
> = {
  ...STANDARD_NOTE_LAYOUT_B_OVERRIDES,
  note_flick_0: { atlas: "standard", x: 930, y: 488, width: 308, height: 120 },
  note_flick_4: { atlas: "standard", x: 0, y: 494, width: 308, height: 120 },
  note_normal_0: { atlas: "standard", x: 0, y: 128, width: 308, height: 120 },
  note_normal_3: { atlas: "standard", x: 0, y: 616, width: 308, height: 120 },
  note_normal_4: { atlas: "standard", x: 0, y: 860, width: 308, height: 120 },
  note_normal_5: { atlas: "standard", x: 0, y: 250, width: 308, height: 120 },
  note_skill_3: { atlas: "standard", x: 0, y: 738, width: 308, height: 120 },
};

const BODY_PREFIX: Record<BandoriNativeNoteBody, string> = {
  normal: "note_normal",
  skill: "note_skill",
  flick: "note_flick",
  long: "note_long",
  directionalLeft: "note_flick_l",
  directionalRight: "note_flick_r",
  slideAmong: "note_slide_among",
};

const ICON_FRAME_ID: Record<BandoriNativeNoteIcon, BandoriNativeNoteFrameId> = {
  flick: "note_flick_top",
  left: "note_flick_top_l",
  right: "note_flick_top_r",
};

export function getBandoriNativeBodyFrameId(
  visual: BandoriNativeNoteVisual,
): BandoriNativeNoteFrameId {
  if (visual.body === "slideAmong") return "note_slide_among";
  return `${BODY_PREFIX[visual.body]}_${visual.lane}` as BandoriNativeNoteFrameId;
}

export function getBandoriNativeIconFrameId(
  icon: BandoriNativeNoteIcon,
): BandoriNativeNoteFrameId {
  return ICON_FRAME_ID[icon];
}

export function getBandoriNativeNoteFrame(
  frameId: BandoriNativeNoteFrameId,
  noteSkin: BandoriNativeNoteSkin,
  directionalFlickSkin: BandoriNativeDirectionalFlickSkin,
): BandoriNativeNoteFrame {
  const defaultFrame = NOTE_FRAMES[frameId];
  if (!defaultFrame) {
    throw new BandoriNativeNoteContractError(
      `Resolved Note frame is outside the verified JP atlases: ${frameId}`,
    );
  }
  if (defaultFrame.atlas === "directional") {
    if (
      frameId === "note_flick_top_r"
      && directionalFlickSkin.frameLayout === "tall-right-icon"
    ) {
      return { ...defaultFrame, height: 171 };
    }
    return defaultFrame;
  }
  if (noteSkin.frameLayout === "b") {
    return STANDARD_NOTE_LAYOUT_B_OVERRIDES[frameId] ?? defaultFrame;
  }
  if (noteSkin.frameLayout === "c") {
    return STANDARD_NOTE_LAYOUT_C_OVERRIDES[frameId] ?? defaultFrame;
  }
  return defaultFrame;
}

export function getBandoriNativeNoteFrameUrl(
  frameId: BandoriNativeNoteFrameId,
  noteSkin: BandoriNativeNoteSkin,
  directionalFlickSkin: BandoriNativeDirectionalFlickSkin,
): string | null {
  const frame = NOTE_FRAMES[frameId];
  if (!frame) {
    throw new BandoriNativeNoteContractError(
      `Resolved Note frame is outside the verified JP set: ${frameId}`,
    );
  }
  const skin = frame.atlas === "standard" ? noteSkin : directionalFlickSkin;
  if (skin.frameSource !== "sprites") return null;
  const prefix = frame.atlas === "standard"
    ? `${NOTE_SKIN_SPRITE_ROOT}/${skin.assetBundleName}`
    : `${NOTE_SKIN_SPRITE_ROOT}/directionalflick${skin.assetBundleName}`;
  return `${prefix}/sprites/${frameId}.png`;
}
