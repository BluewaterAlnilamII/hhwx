"use client";

import { useEffect, useRef, useState } from "react";
import {
  Application,
  Container,
  GlProgram,
  Graphics,
  GpuProgram,
  Matrix,
  MeshSimple,
  NineSliceSprite,
  Rectangle,
  Shader,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import {
  acquireBandoriChartSimulatorTexture,
} from "@/lib/bandori/chart-simulator/pixi-texture-cache";
import {
  getBandoriSimulatorRendererResolution,
  getBandoriSimulatorTickerMaxFps,
  type BandoriSimulatorFrameRateLimit,
  type BandoriSimulatorResolutionScale,
} from "@/lib/bandori/chart-simulator/render-settings";
import type {
  BandoriChartSimulatorTextureLease,
} from "@/lib/bandori/chart-simulator/texture-lease-cache";
import {
  getBandoriCompiledBeatAtTime,
  type CompiledBandoriChart,
} from "@/lib/bandori/chart-simulator/compiler";
import {
  advanceBandoriEffectAnimationClock,
} from "@/lib/bandori/chart-simulator/effect-animation-clock";
import {
  createBandoriNativeTransparentColoredShaderSources,
} from "@/lib/bandori/chart-simulator/native-note-material";
import {
  collectBandoriNativeJudgmentWindowOutlineEdges,
  collectBandoriNativeJudgmentWindowOffsetLabels,
  collectBandoriNativeJudgmentWindowSegments,
  formatBandoriNativeJudgmentWindowOffsetFrames,
  prepareBandoriNativeJudgmentWindowCandidates,
  prepareBandoriNativeJudgmentWindowPriorityIndex,
  type BandoriNativeJudgmentWindowCandidate,
  type BandoriSlideJudgmentFrameCorrectionTenths,
} from "@/lib/bandori/chart-simulator/native-judgment-window-presentation";
import {
  BandoriNativeNoteContractError,
  BANDORI_NATIVE_BUTTON_EFFECT_PIXELS_PER_WORLD_UNIT,
  BANDORI_NATIVE_DIRECTIONAL_CONNECTOR_INDICES,
  BANDORI_NATIVE_DIRECTIONAL_CONNECTOR_UVS,
  BANDORI_NATIVE_JUDGMENT_LANE_SPACING_PIXELS,
  BANDORI_NATIVE_NOTE_PIXELS_PER_UNIT,
  BANDORI_NATIVE_SYNC_LINE_WIDTH,
  collectBandoriNativeSyncLinePairs,
  createBandoriNativeRibbonMeshGeometry,
  getBandoriDirectionalFlickIconOffset,
  getBandoriSimulatorNoteArrivalSeconds,
  isBandoriNativeAdvancedNoteSpeed,
  isBandoriNativeRhythmSupportNote,
  isBandoriNativeRibbonPointBodyVisible,
  lowerBoundBandoriNoteTime,
  prepareBandoriNativeChartVisuals,
  projectBandoriNativeNote,
  projectBandoriNativeRibbonPoint,
  projectBandoriNativeTimelinePosition,
  updateBandoriNativeDirectionalConnectorVertices,
  updateBandoriNativeRibbonMeshVertices,
  upperBoundBandoriNoteTime,
  type BandoriNativeChartVisuals,
  type BandoriNativeDirectionalConnector,
  type BandoriNativeNoteVisual,
  type BandoriNativeNoteVisualGroup,
  type BandoriNativeProjectedNote,
  type BandoriNativeRibbonMeshGeometry,
  type BandoriNativeRibbonPoint,
  type BandoriNativeRibbonVisual,
  type BandoriNativeSyncLinePair,
} from "@/lib/bandori/chart-simulator/native-note-presentation";
import {
  BANDORI_NATIVE_APPROXIMATE_HIT_EFFECTS,
  BANDORI_NATIVE_HIT_EFFECT_MAX_SECONDS,
  BANDORI_NATIVE_LANE_EFFECTS,
  BANDORI_NATIVE_LANE_EFFECT_FADE_SECONDS,
  BANDORI_NATIVE_LANE_EFFECT_PIXELS_PER_UNIT,
  BANDORI_NATIVE_LANE_EFFECT_WAIT_FRAMES,
  BANDORI_NATIVE_TAP_EFFECT_ATLAS_1_URL,
  BANDORI_NATIVE_TAP_EFFECT_ATLAS_2_URL,
  BANDORI_NATIVE_TAP_EFFECT_ATLAS_COLUMNS,
  BANDORI_NATIVE_TAP_EFFECT_FRAME_SIZE,
  collectBandoriNativeHitEvents,
  collectBandoriNativeLaneEffectEvents,
  createBandoriApproximateKiraParticles,
  evaluateBandoriApproximateKiraParticle,
  evaluateBandoriApproximateStaticHitLayer,
  getBandoriNativeLaneEffectUrl,
  type BandoriApproximateKiraParticle,
  type BandoriApproximateStaticHitLayer,
  type BandoriNativeHitEvent,
  type BandoriNativeTapHitEffectKind,
} from "@/lib/bandori/chart-simulator/native-hit-effect-presentation";
import {
  BANDORI_NATIVE_HOLD_EFFECT_PLACEMENT,
  BANDORI_NATIVE_HOLD_EFFECT_TEXTURE_URLS,
  collectBandoriNativeHoldStates,
  createBandoriNativeHoldEffectRuntime,
  evaluateBandoriNativeLongFlashColor,
  getBandoriNativeHoldEffectSeed,
  projectBandoriNativeHoldState,
  projectBandoriNativeRibbonBody,
  type BandoriNativeProjectedHoldState,
} from "@/lib/bandori/chart-simulator/native-hold-effect-presentation";
import {
  BANDORI_NATIVE_ALL_PERFECT_COMBO_DIGIT_URLS,
  BANDORI_NATIVE_ALL_PERFECT_COMBO_UNIT_URL,
  BANDORI_NATIVE_COMBO_DIGIT_SIZE,
  BANDORI_NATIVE_COMBO_DIGIT_URLS,
  BANDORI_NATIVE_COMBO_POSITION,
  BANDORI_NATIVE_COMBO_UNIT_POSITION,
  BANDORI_NATIVE_COMBO_UNIT_SIZE,
  BANDORI_NATIVE_COMBO_UNIT_URL,
  BANDORI_NATIVE_PERFECT_JUDGMENT_PARENT_SCALE,
  BANDORI_NATIVE_PERFECT_JUDGMENT_POSITION,
  BANDORI_NATIVE_PERFECT_JUDGMENT_SIZE,
  BANDORI_NATIVE_PERFECT_JUDGMENT_URL,
  evaluateBandoriNativeAllPerfectComboAlpha,
  evaluateBandoriNativeComboPopScale,
  evaluateBandoriNativePerfectJudgment,
  getBandoriNativeComboDigitPlacements,
} from "@/lib/bandori/chart-simulator/native-judgment-combo-presentation";
import {
  BANDORI_NATIVE_SWIPE_EFFECT_TEXTURE_URLS,
  createBandoriNativeSwipeEffectRuntime,
  getBandoriApprovedAnimatedTravelScreenY,
  getBandoriApprovedManualDirectionalNotesCenterOffsetPixels,
  getBandoriApprovedManualVerticalBeamScreenY,
  getBandoriNativeSwipeEffectPlacement,
  getBandoriNativeSwipeEffectSeed,
  getBandoriNativeSwipeParticleWidthScale,
  isBandoriNativeDirectionalTerminalParticle,
  type BandoriNativeSwipeEffectKind,
} from "@/lib/bandori/chart-simulator/native-swipe-effect-presentation";
import {
  compileBandoriEffectRecipe,
  createBandoriEffectRecipeRuntime,
  getBandoriEffectRecipePlacement,
  type BandoriCompiledEffectRecipe,
  type BandoriEffectRecipePlacement,
  type BandoriEffectRecipeRuntime,
  type BandoriEffectFrameInstance,
} from "@/lib/bandori/chart-simulator/effect-recipe-runtime";
import {
  BANDORI_NATIVE_FIELD_RECT,
  BANDORI_NATIVE_STAGE_SIZE,
  getBandoriNativeJudgmentLineRect,
  type BandoriNativeBackgroundSkin,
  type BandoriNativeFieldSkin,
} from "./native-stage-contract";
import {
  BANDORI_NATIVE_NOTE_ATLAS_SIZE,
  getBandoriNativeBodyFrameId,
  getBandoriHabahiroBodySpriteName,
  getBandoriHabahiroIconSpriteName,
  getBandoriHabahiroLongBodySpriteName,
  getBandoriHabahiroLongFlashSpriteName,
  getBandoriHabahiroRhythmSpriteName,
  getBandoriHabahiroSpriteUrl,
  isBandoriHabahiroMultiRangeFlickIcon,
  getBandoriNativeIconFrameId,
  getBandoriNativeLongBodyFrameId,
  getBandoriNativeLongFlashUrl,
  getBandoriNativeNoteFrame,
  getBandoriNativeNoteFrameUrl,
  getBandoriNativeRhythmSupportNoteUrl,
  type BandoriNativeDirectionalFlickSkin,
  type BandoriNativeNoteFrameId,
  type BandoriNativeNoteSkin,
} from "./native-note-assets";
import type {
  BandoriLimitedPerformanceSkin,
  BandoriTapEffectAssetContract,
} from "./limited-performance-skins";
import type {
  BandoriChartSimulatorAssetResolver,
} from "@/lib/bandori/chart-simulator/asset-manifest";
import {
  BANDORI_HABAHIRO_SPRITES,
  type BandoriHabahiroSpriteName,
} from "./habahiro-note-assets";
import {
  BANDORI_NATIVE_DIRECTIONAL_EFFECT_RECIPE_KEYS,
  BANDORI_NATIVE_DIRECTIONAL_EFFECT_VARIANTS,
  getBandoriNativeDirectionalEffectAssetContract,
  type BandoriNativeDirectionalEffectRecipeKey,
} from "./native-directional-effect-assets";
import {
  BANDORI_NATIVE_SUDDEN_LINE_BORDER_PIXELS,
  BANDORI_NATIVE_SUDDEN_LINE_URL,
  getBandoriNativeNoteScale,
  getBandoriNativeSuddenLineScreenY,
  getBandoriNativeSuddenLineSize,
  getBandoriNativeSuddenRatio,
  getBandoriNativeSuddenScreenY,
  isBandoriNativeMultiRangeChart,
  type BandoriNativeDirectionalEffectVariant,
} from "./native-live-settings";

type NativeSimulatorStageProps = {
  ariaLabel: string;
  backgroundSkin: BandoriNativeBackgroundSkin;
  compiled: CompiledBandoriChart;
  directionalEffectEnabled: boolean;
  directionalFlickSkin: BandoriNativeDirectionalFlickSkin;
  directionalEffectVariant: BandoriNativeDirectionalEffectVariant;
  fieldSkin: BandoriNativeFieldSkin;
  frameRateLimit: BandoriSimulatorFrameRateLimit;
  getEffectPlaybackState: () => NativeSimulatorEffectPlaybackState;
  getPresentationTime: () => number;
  greatJudgmentWindowEnabled: boolean;
  isActive: boolean;
  isMirrored: boolean;
  judgmentWindowOffsetLabelEnabled: boolean;
  laneEffectEnabled: boolean;
  limitedPerformanceSkin: BandoriLimitedPerformanceSkin | null;
  loadId: string;
  noteApproachTimeScale: number;
  noteSpeed: number;
  noteSize: number;
  noteSkin: BandoriNativeNoteSkin;
  noteContractErrorLabel: string;
  onLoadProgress: (progress: NativeSimulatorStageLoadProgress) => void;
  onRenderFpsChange: (framesPerSecond: number | null) => void;
  perfectJudgmentWindowEnabled: boolean;
  rendererErrorLabel: string;
  resolutionScale: BandoriSimulatorResolutionScale;
  resourceErrorLabel: string;
  resolveAssetUrl: BandoriChartSimulatorAssetResolver;
  rhythmSupportEnabled: boolean;
  slideJudgmentFrameCorrectionTenths: BandoriSlideJudgmentFrameCorrectionTenths;
  syncLineEnabled: boolean;
  suddenLaneEnabled: boolean;
  suddenRate: number;
  tapEffectContract: BandoriTapEffectAssetContract | null;
  tapEffectEnabled: boolean;
};

const RENDER_FPS_SAMPLE_INTERVAL_MS = 1000;
const PERFECT_JUDGMENT_WINDOW_COLOR = 0x41dfff;
const GREAT_JUDGMENT_WINDOW_COLOR = 0xffc247;
const JUDGMENT_WINDOW_ALPHA = 0.28;
const JUDGMENT_WINDOW_BORDER_ALPHA = 0.9;
const JUDGMENT_WINDOW_BORDER_WIDTH = 2;
const JUDGMENT_WINDOW_OFFSET_LABEL_BASE_FONT_SIZE = 24;
const JUDGMENT_WINDOW_OFFSET_LABEL_MIN_FONT_SIZE = 12;
const JUDGMENT_WINDOW_OFFSET_LABEL_MAX_FONT_SIZE = 18;
const JUDGMENT_WINDOW_OFFSET_LABEL_TOP_HIDDEN_RATIO = 0.1;
const JUDGMENT_WINDOW_OFFSET_LABEL_GAP = 2;

function getJudgmentWindowOffsetLabelFontSize(
  screenY: number,
  visibleStartY: number,
  judgmentLineY: number,
): number {
  const progress = Math.min(
    1,
    Math.max(0, (screenY - visibleStartY) / (judgmentLineY - visibleStartY)),
  );
  const smoothProgress = progress * progress * (3 - 2 * progress);
  return JUDGMENT_WINDOW_OFFSET_LABEL_MIN_FONT_SIZE
    + (JUDGMENT_WINDOW_OFFSET_LABEL_MAX_FONT_SIZE
      - JUDGMENT_WINDOW_OFFSET_LABEL_MIN_FONT_SIZE)
      * smoothProgress;
}

function createJudgmentWindowOffsetLabelText(
  category: "perfect" | "great",
  resolution: number,
): Text {
  const text = new Text({
    resolution,
    roundPixels: false,
    style: {
      align: "center",
      fill: category === "perfect"
        ? PERFECT_JUDGMENT_WINDOW_COLOR
        : GREAT_JUDGMENT_WINDOW_COLOR,
      fontFamily: "Arial",
      fontSize: JUDGMENT_WINDOW_OFFSET_LABEL_BASE_FONT_SIZE,
      fontWeight: "700",
      stroke: { color: 0x071018, width: 3 },
    },
    text: "",
  });
  text.anchor.set(0.5);
  text.eventMode = "none";
  text.visible = false;
  return text;
}

type RenderFpsSample = {
  frameCount: number;
  startedAtMs: number | null;
};

function resizeBandoriNativeStageRenderer(
  application: Application,
  resolutionScale: BandoriSimulatorResolutionScale,
): void {
  application.renderer.resize(
    BANDORI_NATIVE_STAGE_SIZE.width,
    BANDORI_NATIVE_STAGE_SIZE.height,
    getBandoriSimulatorRendererResolution(
      window.devicePixelRatio,
      resolutionScale,
    ),
  );
  // Pixi auto-density writes fixed CSS pixels during resize; the stage itself
  // must remain responsive inside the simulator viewport.
  application.canvas.style.width = "100%";
  application.canvas.style.height = "100%";
}

type StageStatus =
  | "loading"
  | "ready"
  | "rendererError"
  | "resourceError"
  | "noteContractError";

type NoteDisplay = {
  baseBodyAnchor: NativeSpriteAnchor;
  baseBodyTexture: Texture;
  body: Sprite;
  container: Container;
  icon: Sprite | null;
  projected: BandoriNativeProjectedNote | null;
  rhythmSupportAnchor: NativeSpriteAnchor | null;
  rhythmSupportTexture: Texture | null;
  visual: BandoriNativeNoteVisual;
};

export type NativeSimulatorStageLoadProgress = {
  readonly completedResources: number;
  readonly loadId: string;
  readonly phase: "resources" | "initializing" | "ready" | "error";
  readonly totalResources: number | null;
};

type HabahiroTexture = {
  anchorX: number;
  anchorY: number;
  texture: Texture;
};

type NativeSpriteAnchor = Readonly<{
  x: number;
  y: number;
}>;

const CENTER_SPRITE_ANCHOR: NativeSpriteAnchor = { x: 0.5, y: 0.5 };
const LIMITED_SPRITE_ANCHORS_SCHEMA =
  "hhwx-bandori-limited-performance-sprite-anchors-v1";

async function loadNativeSpriteAnchors(
  url: string | null,
  loadJson: (logicalUrl: string) => Promise<unknown>,
): Promise<ReadonlyMap<string, NativeSpriteAnchor>> {
  if (!url) return new Map();
  const payload = await loadJson(url);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Limited Sprite anchor contract must be an object");
  }
  const source = payload as Record<string, unknown>;
  if (
    source.schemaVersion !== LIMITED_SPRITE_ANCHORS_SCHEMA
    || !source.anchors
    || typeof source.anchors !== "object"
    || Array.isArray(source.anchors)
    || Object.keys(source).some((key) => key !== "anchors" && key !== "schemaVersion")
  ) {
    throw new Error("Limited Sprite anchor contract has an unsupported schema");
  }
  const anchors = new Map<string, NativeSpriteAnchor>();
  for (const [name, value] of Object.entries(
    source.anchors as Record<string, unknown>,
  )) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Limited Sprite anchor is invalid: ${name}`);
    }
    const anchor = value as Record<string, unknown>;
    if (
      Object.keys(anchor).some((key) => key !== "x" && key !== "y")
      || typeof anchor.x !== "number"
      || !Number.isFinite(anchor.x)
      || anchor.x < 0
      || anchor.x > 1
      || typeof anchor.y !== "number"
      || !Number.isFinite(anchor.y)
      || anchor.y < 0
      || anchor.y > 1
    ) {
      throw new Error(`Limited Sprite anchor is invalid: ${name}`);
    }
    anchors.set(name, { x: anchor.x, y: anchor.y });
  }
  return anchors;
}

function getNativeSpriteAnchor(
  anchors: ReadonlyMap<string, NativeSpriteAnchor>,
  name: string,
): NativeSpriteAnchor {
  return anchors.get(name) ?? CENTER_SPRITE_ANCHOR;
}

export type NativeSimulatorEffectPlaybackState = {
  isPlaying: boolean;
  playbackRate: number;
  timelineVersion: number;
};

type DirectionalConnectorDisplay = {
  connector: BandoriNativeDirectionalConnector;
  mesh: MeshSimple;
  vertices: Float32Array;
};

type NoteGroupDisplay = {
  connectors: DirectionalConnectorDisplay[];
  notes: NoteDisplay[];
};

type RibbonMeshDisplay = {
  geometry: BandoriNativeRibbonMeshGeometry;
  mesh: MeshSimple;
};

type RibbonSegmentDisplay = {
  advanced: RibbonMeshDisplay;
  end: BandoriNativeRibbonPoint;
  ordinary: RibbonMeshDisplay;
  ribbon: BandoriNativeRibbonVisual;
  ribbonPointIndex: number;
  start: BandoriNativeRibbonPoint;
};

type StaticHitLayerDisplay = {
  contract: BandoriApproximateStaticHitLayer;
  sprite: Sprite;
};

type KiraParticleDisplay = {
  contract: BandoriApproximateKiraParticle;
  sprite: Sprite;
};

type HitEffectDisplay = {
  high: Container;
  kind: BandoriNativeTapHitEffectKind;
  kira: KiraParticleDisplay[];
  low: Container;
  rangeWidth: number;
  staticLayers: StaticHitLayerDisplay[];
  triggerAnimationTimeSeconds: number | null;
};

type ParticleEffectRenderable =
  | {
      kind: "sprite";
      display: Sprite;
    }
  | {
      kind: "mesh";
      baseUvs: Float32Array;
      display: MeshSimple;
      meshPathId: string;
      uvs: Float32Array;
      vertices: Float32Array;
    };

type SwipeEffectDisplay = {
  animatedVerticalBeam: {
    hierarchyPath: string;
    initialScreenY: number | null;
    travelSpeedMultiplier: number;
  } | null;
  high: Container;
  kind: BandoriNativeSwipeEffectKind;
  buttonLane: number;
  low: Container;
  isNativeDefault: boolean;
  placement: BandoriEffectRecipePlacement;
  rangeWidth: number;
  runtime: BandoriEffectRecipeRuntime;
  renderables: ParticleEffectRenderable[];
  terminalOffsetX: number;
  terminalOffsetY: number;
  triggerAnimationTimeSeconds: number | null;
};

type HoldEffectDisplay = {
  animationElapsedSeconds: number;
  flash: Sprite;
  high: Container;
  low: Container;
  placement: BandoriEffectRecipePlacement;
  runtime: BandoriEffectRecipeRuntime;
  renderables: ParticleEffectRenderable[];
};

type LoadedTapEffects = {
  animatedVerticalBeam: Readonly<{
    hierarchyPath: string;
    recipeKey: string;
    travelSpeedMultiplier: number;
  }> | null;
  recipes: ReadonlyMap<string, BandoriCompiledEffectRecipe>;
  textures: ReadonlyMap<string, Texture>;
};

type LoadedDirectionalEffects = {
  recipes: ReadonlyMap<string, BandoriCompiledEffectRecipe>;
  textures: ReadonlyMap<string, Texture>;
};

type LaneEffectDisplay = {
  baseScaleX: number;
  baseScaleY: number;
  fadeElapsedSeconds: number;
  framesBeforeFade: number;
  sprite: Sprite;
};

type SyncLineDisplay = BandoriNativeSyncLinePair & {
  leftEdgeMargin: number;
  rightEdgeMargin: number;
  sprite: Sprite;
};

type PerfectJudgmentDisplay = {
  animated: Container;
  root: Container;
  sprite: Sprite;
  triggerAnimationTimeSeconds: number | null;
};

type ComboDisplay = {
  digitTextures: readonly Texture[];
  digits: Sprite[];
  lastCombo: number;
  number: Container;
  popStartAnimationTimeSeconds: number | null;
  root: Container;
  unit: Sprite;
};

type NativeTextureShader = Shader & { texture: Texture };

function createNativeTransparentColoredShader(
  texture: Texture,
  vertexAlpha = 1,
): NativeTextureShader {
  const source = texture.source;
  if (source.alphaMode !== "no-premultiply-alpha") {
    // The native shader outputs straight RGB and uses SrcAlpha/OneMinusSrcAlpha.
    source.alphaMode = "no-premultiply-alpha";
    source.update();
  }
  const shaderSources = createBandoriNativeTransparentColoredShaderSources(
    vertexAlpha,
  );
  const shader = new Shader({
    glProgram: GlProgram.from({
      fragment: shaderSources.glFragment,
      name: "bandori-native-transparent-colored",
      vertex: shaderSources.glVertex,
    }),
    gpuProgram: GpuProgram.from({
      fragment: { entryPoint: "mainFragment", source: shaderSources.wgsl },
      name: "bandori-native-transparent-colored",
      vertex: { entryPoint: "mainVertex", source: shaderSources.wgsl },
    }),
    resources: {
      uSampler: source.style,
      uTexture: source,
    },
  }) as NativeTextureShader;
  shader.texture = texture;
  return shader;
}

function createPerfectJudgmentDisplay(texture: Texture): PerfectJudgmentDisplay {
  const root = new Container();
  const animated = new Container();
  const sprite = new Sprite(texture);
  root.eventMode = "none";
  root.position.set(
    BANDORI_NATIVE_PERFECT_JUDGMENT_POSITION.x,
    BANDORI_NATIVE_PERFECT_JUDGMENT_POSITION.y,
  );
  root.scale.set(BANDORI_NATIVE_PERFECT_JUDGMENT_PARENT_SCALE);
  root.visible = false;
  animated.eventMode = "none";
  sprite.anchor.set(0.5);
  sprite.eventMode = "none";
  sprite.width = BANDORI_NATIVE_PERFECT_JUDGMENT_SIZE.width;
  sprite.height = BANDORI_NATIVE_PERFECT_JUDGMENT_SIZE.height;
  animated.addChild(sprite);
  root.addChild(animated);
  return {
    animated,
    root,
    sprite,
    triggerAnimationTimeSeconds: null,
  };
}

function clearPerfectJudgment(display: PerfectJudgmentDisplay): void {
  display.triggerAnimationTimeSeconds = null;
  display.root.visible = false;
}

function triggerPerfectJudgment(
  display: PerfectJudgmentDisplay,
  animationTimeSeconds: number,
): void {
  display.triggerAnimationTimeSeconds = animationTimeSeconds;
}

function updatePerfectJudgment(
  display: PerfectJudgmentDisplay,
  animationTimeSeconds: number,
): void {
  if (display.triggerAnimationTimeSeconds === null) {
    display.root.visible = false;
    return;
  }
  const sample = evaluateBandoriNativePerfectJudgment(
    animationTimeSeconds - display.triggerAnimationTimeSeconds,
  );
  display.root.visible = sample.visible;
  if (!sample.visible) return;
  display.animated.scale.set(sample.childScale);
  display.sprite.alpha = sample.alpha;
}

function createComboDisplay(
  unitTexture: Texture,
  digitTextures: readonly Texture[],
): ComboDisplay {
  const root = new Container();
  const number = new Container();
  const unit = new Sprite(unitTexture);
  root.eventMode = "none";
  root.position.set(BANDORI_NATIVE_COMBO_POSITION.x, BANDORI_NATIVE_COMBO_POSITION.y);
  root.visible = false;
  number.eventMode = "none";
  unit.anchor.set(0.5);
  unit.eventMode = "none";
  unit.position.set(
    BANDORI_NATIVE_COMBO_UNIT_POSITION.x,
    BANDORI_NATIVE_COMBO_UNIT_POSITION.y,
  );
  unit.width = BANDORI_NATIVE_COMBO_UNIT_SIZE.width;
  unit.height = BANDORI_NATIVE_COMBO_UNIT_SIZE.height;
  const digits = Array.from({ length: 4 }, () => {
    const digit = new Sprite(digitTextures[0]);
    digit.anchor.set(0.5);
    digit.eventMode = "none";
    digit.visible = false;
    number.addChild(digit);
    return digit;
  });
  root.addChild(number, unit);
  return {
    digitTextures,
    digits,
    lastCombo: 0,
    number,
    popStartAnimationTimeSeconds: null,
    root,
    unit,
  };
}

function setComboValue(
  display: ComboDisplay,
  combo: number,
  animationTimeSeconds: number,
  shouldAnimate: boolean,
): void {
  if (display.lastCombo === combo) return;
  display.lastCombo = combo;
  display.root.visible = combo > 0;
  display.popStartAnimationTimeSeconds = shouldAnimate && combo > 0
    ? animationTimeSeconds
    : null;
  const placements = getBandoriNativeComboDigitPlacements(combo);
  for (let index = 0; index < display.digits.length; index += 1) {
    const digit = display.digits[index];
    const placement = placements[index];
    digit.visible = placement !== undefined;
    if (!placement) continue;
    digit.texture = display.digitTextures[placement.digit];
    digit.position.set(placement.x, 0);
    digit.width = BANDORI_NATIVE_COMBO_DIGIT_SIZE.width;
    digit.height = BANDORI_NATIVE_COMBO_DIGIT_SIZE.height;
  }
}

function updateComboDisplay(
  display: ComboDisplay,
  animationTimeSeconds: number,
  alpha: number,
): void {
  display.root.alpha = alpha;
  const popElapsedSeconds = display.popStartAnimationTimeSeconds === null
    ? -1
    : animationTimeSeconds - display.popStartAnimationTimeSeconds;
  display.number.scale.set(evaluateBandoriNativeComboPopScale(popElapsedSeconds));
}

function createFrameTexture(
  standardAtlas: Texture,
  directionalAtlas: Texture,
  frameId: BandoriNativeNoteFrameId,
  noteSkin: BandoriNativeNoteSkin,
  directionalFlickSkin: BandoriNativeDirectionalFlickSkin,
): Texture {
  const frame = getBandoriNativeNoteFrame(
    frameId,
    noteSkin,
    directionalFlickSkin,
  );
  const atlasTexture = frame.atlas === "standard" ? standardAtlas : directionalAtlas;
  const atlasHeight = BANDORI_NATIVE_NOTE_ATLAS_SIZE[frame.atlas].height;
  return new Texture({
    source: atlasTexture.source,
    frame: new Rectangle(
      frame.x,
      atlasHeight - frame.y - frame.height,
      frame.width,
      frame.height,
    ),
  });
}

function createNoteDisplay(
  visual: BandoriNativeNoteVisual,
  textures: ReadonlyMap<BandoriNativeNoteFrameId, Texture>,
  habahiroTextures: ReadonlyMap<BandoriHabahiroSpriteName, HabahiroTexture>,
  spriteAnchors: ReadonlyMap<string, NativeSpriteAnchor>,
  standardRhythmSupportTexture: Texture | null,
  isRhythmSupportNote: boolean,
): NoteDisplay {
  const habahiroBodyName = getBandoriHabahiroBodySpriteName(visual);
  const habahiroBody = habahiroBodyName ? habahiroTextures.get(habahiroBodyName) : null;
  const bodyFrameId = getBandoriNativeBodyFrameId(visual);
  const bodyTexture = habahiroBody?.texture
    ?? textures.get(bodyFrameId);
  if (!bodyTexture) {
    throw new BandoriNativeNoteContractError("Resolved body Sprite is absent from the verified atlas frames");
  }

  const container = new Container();
  container.eventMode = "none";
  const body = new Sprite(bodyTexture);
  const baseBodyAnchor = habahiroBody
    ? { x: habahiroBody.anchorX, y: habahiroBody.anchorY }
    : getNativeSpriteAnchor(spriteAnchors, bodyFrameId);
  body.anchor.set(baseBodyAnchor.x, baseBodyAnchor.y);
  body.eventMode = "none";
  body.tint = 0xffffff;
  body.alpha = 1;
  container.addChild(body);

  let icon: Sprite | null = null;
  const usesHabahiroFlickIcon = isBandoriHabahiroMultiRangeFlickIcon(visual);
  const habahiroIconName = getBandoriHabahiroIconSpriteName(visual);
  if (visual.icon && (!usesHabahiroFlickIcon || habahiroIconName)) {
    const habahiroIcon = habahiroIconName ? habahiroTextures.get(habahiroIconName) : null;
    const iconTexture = habahiroIcon?.texture
      ?? textures.get(getBandoriNativeIconFrameId(visual.icon));
    if (!iconTexture) {
      throw new BandoriNativeNoteContractError("Resolved flick icon is absent from the verified atlas frames");
    }
    icon = new Sprite(iconTexture);
    const iconAnchor = habahiroIcon
      ? { x: habahiroIcon.anchorX, y: habahiroIcon.anchorY }
      : getNativeSpriteAnchor(
          spriteAnchors,
          getBandoriNativeIconFrameId(visual.icon),
        );
    icon.anchor.set(iconAnchor.x, iconAnchor.y);
    icon.eventMode = "none";
    icon.tint = 0xffffff;
    icon.alpha = 1;
    container.addChild(icon);
  }

  const rhythmSupport = isRhythmSupportNote && visual.body === "normal"
    ? habahiroBodyName
      ? habahiroTextures.get(getBandoriHabahiroRhythmSpriteName(visual)) ?? null
      : standardRhythmSupportTexture
        ? {
            anchorX: getNativeSpriteAnchor(
              spriteAnchors,
              `note_normal_16_${visual.lane}`,
            ).x,
            anchorY: getNativeSpriteAnchor(
              spriteAnchors,
              `note_normal_16_${visual.lane}`,
            ).y,
            texture: standardRhythmSupportTexture,
          }
        : null
    : null;
  return {
    baseBodyAnchor,
    baseBodyTexture: bodyTexture,
    body,
    container,
    icon,
    projected: null,
    rhythmSupportAnchor: rhythmSupport
      ? { x: rhythmSupport.anchorX, y: rhythmSupport.anchorY }
      : null,
    rhythmSupportTexture: rhythmSupport?.texture ?? null,
    visual,
  };
}

function createDirectionalConnectorDisplay(
  connector: BandoriNativeDirectionalConnector,
  leftTexture: Texture,
  rightTexture: Texture,
  leftShader: NativeTextureShader,
  rightShader: NativeTextureShader,
): DirectionalConnectorDisplay {
  const vertices = new Float32Array(8);
  const mesh = new MeshSimple({
    indices: BANDORI_NATIVE_DIRECTIONAL_CONNECTOR_INDICES,
    texture: connector.direction < 0 ? leftTexture : rightTexture,
    shader: connector.direction < 0 ? leftShader : rightShader,
    topology: "triangle-list",
    uvs: BANDORI_NATIVE_DIRECTIONAL_CONNECTOR_UVS,
    vertices,
  });
  mesh.eventMode = "none";
  return { connector, mesh, vertices };
}

function createNoteGroupDisplay(
  group: BandoriNativeNoteVisualGroup,
  textures: ReadonlyMap<BandoriNativeNoteFrameId, Texture>,
  habahiroTextures: ReadonlyMap<BandoriHabahiroSpriteName, HabahiroTexture>,
  spriteAnchors: ReadonlyMap<string, NativeSpriteAnchor>,
  standardRhythmSupportTexture: Texture | null,
  isRhythmSupportNote: boolean,
  leftLineTexture: Texture,
  rightLineTexture: Texture,
  leftLineShader: NativeTextureShader,
  rightLineShader: NativeTextureShader,
): NoteGroupDisplay {
  return {
    connectors: group.connectors.map((connector) => createDirectionalConnectorDisplay(
      connector,
      leftLineTexture,
      rightLineTexture,
      leftLineShader,
      rightLineShader,
    )),
    notes: group.visuals.map((visual) => createNoteDisplay(
      visual,
      textures,
      habahiroTextures,
      spriteAnchors,
      standardRhythmSupportTexture,
      isRhythmSupportNote,
    )),
  };
}

function createRibbonMeshDisplay(
  texture: Texture,
  mode: BandoriNativeRibbonMeshGeometry["mode"],
): RibbonMeshDisplay {
  const geometry = createBandoriNativeRibbonMeshGeometry(mode);
  const mesh = new MeshSimple({
    indices: geometry.indices,
    texture,
    topology: "triangle-list",
    uvs: geometry.uvs,
    vertices: geometry.vertices,
  });
  mesh.eventMode = "none";
  mesh.visible = false;
  return { geometry, mesh };
}

const NATIVE_TILTED_PARTICLE_Y_SCALE = Math.cos(46 * Math.PI / 180);
const NATIVE_STRETCHED_PARTICLE_LENGTH_SCALE = 1.159999966621399;
const NATIVE_STRETCHED_PARTICLE_ROTATION = -Math.PI / 2;

function createTapEffectFrameTexture(atlas: Texture, frame: number): Texture {
  const column = frame % BANDORI_NATIVE_TAP_EFFECT_ATLAS_COLUMNS;
  const row = Math.floor(frame / BANDORI_NATIVE_TAP_EFFECT_ATLAS_COLUMNS);
  return new Texture({
    source: atlas.source,
    frame: new Rectangle(
      column * BANDORI_NATIVE_TAP_EFFECT_FRAME_SIZE,
      row * BANDORI_NATIVE_TAP_EFFECT_FRAME_SIZE,
      BANDORI_NATIVE_TAP_EFFECT_FRAME_SIZE,
      BANDORI_NATIVE_TAP_EFFECT_FRAME_SIZE,
    ),
  });
}

function effectTint(red: number, green: number, blue: number): number {
  const channel = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255);
  return (channel(red) << 16) | (channel(green) << 8) | channel(blue);
}

async function loadTapEffects(
  effects: BandoriTapEffectAssetContract | null,
  loadJson: (logicalUrl: string) => Promise<unknown>,
  loadTexture: (logicalUrl: string) => Promise<Texture>,
): Promise<LoadedTapEffects | null> {
  if (!effects) return null;
  const recipeUrls = Object.fromEntries(
    Object.entries(effects.recipes).map(([key, url]) => [`tap:${key}`, url]),
  );
  const [recipeEntries, textureEntries] = await Promise.all([
    Promise.all(Object.entries(recipeUrls).map(async ([key, url]) => {
      return [key, compileBandoriEffectRecipe(await loadJson(url))] as const;
    })),
    Promise.all(Object.entries(effects.resources).map(async ([key, url]) => (
      [key, await loadTexture(url)] as const
    ))),
  ]);
  return {
    animatedVerticalBeam: effects.animatedVerticalBeam
      ? {
          hierarchyPath: effects.animatedVerticalBeam.hierarchyPath,
          recipeKey: `tap:${effects.animatedVerticalBeam.recipe}`,
          travelSpeedMultiplier: effects.animatedVerticalBeam.travelSpeedMultiplier,
        }
      : null,
    recipes: new Map(recipeEntries),
    textures: new Map(textureEntries),
  };
}

function getDirectionalEffectRecipeMapKey(
  variant: Exclude<BandoriNativeDirectionalEffectVariant, "off">,
  recipe: BandoriNativeDirectionalEffectRecipeKey,
): string {
  return `${variant}:${recipe}`;
}

async function loadDirectionalEffects(
  skin: BandoriNativeDirectionalFlickSkin,
  loadJson: (logicalUrl: string) => Promise<unknown>,
  loadTexture: (logicalUrl: string) => Promise<Texture>,
): Promise<LoadedDirectionalEffects> {
  const contract = getBandoriNativeDirectionalEffectAssetContract(skin);
  const [recipeEntries, textureEntries] = await Promise.all([
    Promise.all(BANDORI_NATIVE_DIRECTIONAL_EFFECT_VARIANTS.flatMap((variant) => (
      BANDORI_NATIVE_DIRECTIONAL_EFFECT_RECIPE_KEYS.map(async (key) => ([
        getDirectionalEffectRecipeMapKey(variant, key),
        compileBandoriEffectRecipe(await loadJson(contract.recipes[variant][key])),
      ] as const))
    ))),
    Promise.all(Object.entries(contract.resources).map(async ([key, url]) => (
      [key, await loadTexture(url)] as const
    ))),
  ]);
  return {
    recipes: new Map(recipeEntries),
    textures: new Map(textureEntries),
  };
}

function configureParticleBlend(
  display: Sprite | MeshSimple,
  instance: BandoriEffectFrameInstance,
): void {
  if (
    instance.blendEquation === "add"
    && instance.blendSource === "src-alpha"
    && instance.blendDestination === "one"
    && !instance.premultipliedAlpha
  ) {
    display.blendMode = "add";
    return;
  }
  if (
    instance.blendEquation === "add"
    && instance.blendDestination === "one-minus-src-alpha"
    && (
      (instance.blendSource === "src-alpha" && !instance.premultipliedAlpha)
      || (instance.blendSource === "one" && instance.premultipliedAlpha)
    )
  ) {
    display.blendMode = "normal";
    return;
  }
  throw new BandoriNativeNoteContractError(
    "Particle effect left the verified additive/alpha material profiles",
  );
}

function limitedEffectSeed(noteIndex: number, lane: number, semantic: string): number {
  let semanticHash = 0x811c9dc5;
  for (let index = 0; index < semantic.length; index += 1) {
    semanticHash = Math.imul(semanticHash ^ semantic.charCodeAt(index), 0x01000193);
  }
  return (
    Math.imul(noteIndex + 1, 0x9e3779b1)
    ^ Math.imul(lane + 1, 0x85ebca6b)
    ^ semanticHash
  ) >>> 0;
}

function getLimitedMainEffectRecipeKey(kind: string): string {
  if (kind === "normal" || kind === "skill" || kind === "flick") {
    return `tap:${kind}`;
  }
  throw new BandoriNativeNoteContractError(
    `Limited performance effect kind is unsupported: ${kind}`,
  );
}

function getDirectionalEffectRecipeKey(kind: string): BandoriNativeDirectionalEffectRecipeKey {
  if (!kind.startsWith("directional-")) {
    throw new BandoriNativeNoteContractError(
      `Directional performance effect kind is unsupported: ${kind}`,
    );
  }
  const key = kind.slice("directional-".length);
  if (!(BANDORI_NATIVE_DIRECTIONAL_EFFECT_RECIPE_KEYS as readonly string[]).includes(key)) {
    throw new BandoriNativeNoteContractError(
      `Directional performance effect kind is unsupported: ${kind}`,
    );
  }
  return key as BandoriNativeDirectionalEffectRecipeKey;
}

function createHitEffectDisplay(
  kind: BandoriNativeTapHitEffectKind,
  rangeWidth: number,
  textures: ReadonlyMap<string, Texture>,
  lowLayer: Container,
  highLayer: Container,
): HitEffectDisplay {
  const low = new Container();
  const high = new Container();
  low.eventMode = "none";
  high.eventMode = "none";
  low.visible = false;
  high.visible = false;
  lowLayer.addChild(low);
  highLayer.addChild(high);

  const contract = BANDORI_NATIVE_APPROXIMATE_HIT_EFFECTS[kind];
  const staticLayers = contract.staticLayers.map((layer): StaticHitLayerDisplay => {
    const texture = textures.get(`${layer.atlas}:${layer.frame}`);
    if (!texture) {
      throw new BandoriNativeNoteContractError(
        `Tap-effect frame ${layer.atlas}:${layer.frame} is absent`,
      );
    }
    const sprite = new Sprite(texture);
    sprite.anchor.set(layer.projection === "stretched" ? 0 : 0.5, 0.5);
    sprite.blendMode = "add";
    sprite.eventMode = "none";
    sprite.visible = false;
    (layer.order === 5 ? low : high).addChild(sprite);
    return { contract: layer, sprite };
  });

  const kiraTexture = textures.get(`${contract.kira.atlas}:${contract.kira.frame}`);
  if (!kiraTexture) {
    throw new BandoriNativeNoteContractError("Tap-effect kira frame is absent");
  }
  const kira = Array.from({ length: contract.kira.count }, (): KiraParticleDisplay => {
    const sprite = new Sprite(kiraTexture);
    sprite.anchor.set(0.5);
    sprite.blendMode = "add";
    sprite.eventMode = "none";
    sprite.visible = false;
    high.addChild(sprite);
    return {
      contract: {
        colorMix: 0,
        lifetimeSeconds: contract.kira.lifetimeMinimumSeconds,
        rotationRadians: 0,
        sizeWorld: contract.kira.sizeMinimumWorld,
        spawnXWorld: 0,
        spawnYWorld: contract.kira.localPositionYWorld,
        speedWorldPerSecond: contract.kira.speedMinimumWorldPerSecond,
      },
      sprite,
    };
  });

  return {
    high,
    kind,
    kira,
    low,
    rangeWidth,
    staticLayers,
    triggerAnimationTimeSeconds: null,
  };
}

function createLimitedEffectDisplay(
  recipe: BandoriCompiledEffectRecipe,
  animatedVerticalBeam: LoadedTapEffects["animatedVerticalBeam"],
  buttonLane: number,
  rangeWidth: number,
  lowLayer: Container,
  highLayer: Container,
  kind: BandoriNativeSwipeEffectKind = "flick",
): SwipeEffectDisplay {
  const low = new Container();
  const high = new Container();
  low.eventMode = "none";
  high.eventMode = "none";
  low.sortableChildren = true;
  high.sortableChildren = true;
  low.visible = false;
  high.visible = false;
  lowLayer.addChild(low);
  highLayer.addChild(high);
  return {
    animatedVerticalBeam: animatedVerticalBeam
      ? {
          hierarchyPath: animatedVerticalBeam.hierarchyPath,
          initialScreenY: null,
          travelSpeedMultiplier: animatedVerticalBeam.travelSpeedMultiplier,
        }
      : null,
    buttonLane,
    high,
    isNativeDefault: false,
    kind,
    low,
    placement: getBandoriEffectRecipePlacement(recipe, buttonLane),
    rangeWidth,
    runtime: createBandoriEffectRecipeRuntime(recipe, { buttonIndex: buttonLane, seed: 0 }),
    renderables: [],
    terminalOffsetX: 0,
    terminalOffsetY: 0,
    triggerAnimationTimeSeconds: null,
  };
}

function clearHitEffect(display: HitEffectDisplay): void {
  display.triggerAnimationTimeSeconds = null;
  display.low.visible = false;
  display.high.visible = false;
}

function updateHitEffect(
  display: HitEffectDisplay,
  animationTimeSeconds: number,
  noteScale: number,
): void {
  if (display.triggerAnimationTimeSeconds === null) return;
  const elapsedSeconds = animationTimeSeconds - display.triggerAnimationTimeSeconds;
  if (elapsedSeconds < 0 || elapsedSeconds >= BANDORI_NATIVE_HIT_EFFECT_MAX_SECONDS) {
    clearHitEffect(display);
    return;
  }
  display.low.visible = true;
  display.high.visible = true;
  display.low.scale.set(noteScale);
  display.high.scale.set(noteScale);

  for (const layer of display.staticLayers) {
    const sample = evaluateBandoriApproximateStaticHitLayer(
      layer.contract,
      elapsedSeconds,
    );
    layer.sprite.visible = sample !== null;
    if (!sample) continue;
    const sizePixels = layer.contract.startSizeWorld
      * sample.sizeMultiplier
      * BANDORI_NATIVE_BUTTON_EFFECT_PIXELS_PER_WORLD_UNIT;
    const widthScale = display.kind === "normal" && layer.contract.id === "star"
      ? display.rangeWidth
      : 1;
    const isStretched = layer.contract.projection === "stretched";
    const heightScale = layer.contract.projection === "tilted"
      ? NATIVE_TILTED_PARTICLE_Y_SCALE
      : 1;
    layer.sprite.position.set(
      0,
      -layer.contract.localPositionYWorld
        * BANDORI_NATIVE_BUTTON_EFFECT_PIXELS_PER_WORLD_UNIT,
    );
    // Unity's Stretched Billboard aligns the texture's horizontal length axis
    // to the particle direction. The texture's U=0 root stays on the particle
    // origin and the length grows upward at -90 degrees; centering that axis
    // incorrectly split Smatt_1 across both sides of the judgment line.
    layer.sprite.rotation = isStretched ? NATIVE_STRETCHED_PARTICLE_ROTATION : 0;
    layer.sprite.width = sizePixels * widthScale * (
      isStretched ? NATIVE_STRETCHED_PARTICLE_LENGTH_SCALE : layer.contract.localScaleX
    );
    layer.sprite.height = sizePixels * (
      isStretched ? layer.contract.localScaleX : heightScale
    );
    layer.sprite.alpha = sample.alpha;
    layer.sprite.tint = effectTint(sample.red, sample.green, sample.blue);
  }

  for (const particle of display.kira) {
    const sample = evaluateBandoriApproximateKiraParticle(
      display.kind,
      particle.contract,
      elapsedSeconds,
    );
    particle.sprite.visible = sample !== null;
    if (!sample) continue;
    particle.sprite.position.set(
      sample.worldX * BANDORI_NATIVE_BUTTON_EFFECT_PIXELS_PER_WORLD_UNIT,
      -sample.worldY * BANDORI_NATIVE_BUTTON_EFFECT_PIXELS_PER_WORLD_UNIT,
    );
    const sizePixels = sample.sizeWorld
      * BANDORI_NATIVE_BUTTON_EFFECT_PIXELS_PER_WORLD_UNIT;
    particle.sprite.width = sizePixels;
    particle.sprite.height = sizePixels;
    particle.sprite.rotation = -sample.rotationRadians;
    particle.sprite.alpha = sample.alpha;
    particle.sprite.tint = effectTint(sample.red, sample.green, sample.blue);
  }
}

function triggerHitEffect(
  display: HitEffectDisplay,
  event: BandoriNativeHitEvent & { readonly kind: BandoriNativeTapHitEffectKind },
  screenX: number,
  screenY: number,
  animationTimeSeconds: number,
  noteScale: number,
): void {
  if (display.rangeWidth !== event.rangeWidth) {
    throw new BandoriNativeNoteContractError("Tap-effect display width does not match its event");
  }
  const particles = createBandoriApproximateKiraParticles(event);
  for (let index = 0; index < display.kira.length; index += 1) {
    display.kira[index].contract = particles[index];
  }
  display.triggerAnimationTimeSeconds = animationTimeSeconds;
  display.low.position.set(screenX, screenY);
  display.high.position.set(screenX, screenY);
  updateHitEffect(display, animationTimeSeconds, noteScale);
}

function getParticleEffectFrameTexture(
  instance: BandoriEffectFrameInstance,
  textures: ReadonlyMap<string, Texture>,
  subtextures: Map<string, Texture>,
  ownedTextures: Texture[],
): Texture {
  if (instance.textureResource === "directional-set1") {
    const texture = textures.get(`directional-set1:${instance.uv.index}`);
    if (texture) return texture;
  }

  const base = textures.get(instance.textureResource);
  if (!base) {
    throw new BandoriNativeNoteContractError(
      `Particle-effect texture ${instance.textureResource} is absent`,
    );
  }
  const { column, row, frameColumns, frameRows } = instance.uv;
  if (frameColumns === 1 && frameRows === 1) return base;
  const key = `${instance.textureResource}:${frameColumns}:${frameRows}:${column}:${row}`;
  const cached = subtextures.get(key);
  if (cached) return cached;
  if (
    !Number.isInteger(frameColumns) || frameColumns < 1
    || !Number.isInteger(frameRows) || frameRows < 1
    || !Number.isInteger(column) || column < 0 || column >= frameColumns
    || !Number.isInteger(row) || row < 0 || row >= frameRows
  ) {
    throw new BandoriNativeNoteContractError(`Particle-effect UV frame ${key} is invalid`);
  }
  const width = base.orig.width / frameColumns;
  const height = base.orig.height / frameRows;
  const texture = new Texture({
    source: base.source,
    frame: new Rectangle(column * width, row * height, width, height),
  });
  subtextures.set(key, texture);
  ownedTextures.push(texture);
  return texture;
}

function hideParticleEffectRenderables(
  renderables: readonly ParticleEffectRenderable[],
): void {
  for (const renderable of renderables) renderable.display.visible = false;
}

function replaceParticleEffectRenderable(
  renderables: ParticleEffectRenderable[],
  index: number,
  instance: BandoriEffectFrameInstance,
  texture: Texture,
): ParticleEffectRenderable {
  const existing = renderables[index];
  const meshFrame = instance.mesh;
  if (!meshFrame && existing?.kind === "sprite") return existing;
  if (
    meshFrame
    && existing?.kind === "mesh"
    && existing.meshPathId === meshFrame.pathId
    && existing.vertices.length === meshFrame.vertices.length
    && existing.uvs.length === meshFrame.uvs.length
  ) {
    return existing;
  }
  if (existing) {
    existing.display.removeFromParent();
    existing.display.destroy();
  }
  if (!meshFrame) {
    const sprite = new Sprite(Texture.EMPTY);
    sprite.anchor.set(0.5);
    sprite.eventMode = "none";
    const renderable: ParticleEffectRenderable = { display: sprite, kind: "sprite" };
    renderables[index] = renderable;
    return renderable;
  }

  const vertices = new Float32Array(meshFrame.vertices.length);
  const baseUvs = new Float32Array(meshFrame.uvs);
  const uvs = new Float32Array(baseUvs);
  const mesh = new MeshSimple({
    indices: meshFrame.indices,
    texture,
    topology: "triangle-list",
    uvs,
    vertices,
  });
  mesh.autoUpdate = false;
  mesh.eventMode = "none";
  const renderable: ParticleEffectRenderable = {
    baseUvs,
    display: mesh,
    kind: "mesh",
    meshPathId: meshFrame.pathId,
    uvs,
    vertices,
  };
  renderables[index] = renderable;
  return renderable;
}

function updateParticleEffectMesh(
  renderable: Extract<ParticleEffectRenderable, { kind: "mesh" }>,
  instance: BandoriEffectFrameInstance,
  texture: Texture,
  placement: BandoriEffectRecipePlacement,
  pixelScale: number,
): void {
  const meshFrame = instance.mesh;
  if (!meshFrame || meshFrame.pathId !== renderable.meshPathId) {
    throw new BandoriNativeNoteContractError(
      "Particle-effect Mesh frame does not match its display",
    );
  }
  const style = texture.source.style;
  if (
    style.addressModeU !== instance.textureAddressModeU
    || style.addressModeV !== instance.textureAddressModeV
  ) {
    style.addressModeU = instance.textureAddressModeU;
    style.addressModeV = instance.textureAddressModeV;
    style.update();
  }
  renderable.display.texture = texture;
  for (let index = 0; index < meshFrame.vertices.length; index += 2) {
    renderable.vertices[index] =
      (meshFrame.vertices[index] - placement.screenX) * pixelScale;
    renderable.vertices[index + 1] =
      (meshFrame.vertices[index + 1] - placement.screenY) * pixelScale;
  }
  renderable.display.geometry.getBuffer("aPosition").update();
  for (let index = 0; index < renderable.baseUvs.length; index += 2) {
    const baseU = renderable.baseUvs[index];
    const baseV = renderable.baseUvs[index + 1];
    renderable.uvs[index] =
      (instance.uv.flipU ? 1 - baseU : baseU) + meshFrame.uvOffsetU;
    renderable.uvs[index + 1] = instance.uv.flipV ? 1 - baseV : baseV;
  }
  renderable.display.geometry.getBuffer("aUV").update();
  renderable.display.position.set(0);
  renderable.display.scale.set(1);
  renderable.display.rotation = 0;
}

function createSwipeEffectDisplay(
  kind: BandoriNativeSwipeEffectKind,
  buttonLane: number,
  rangeWidth: number,
  lowLayer: Container,
  highLayer: Container,
): SwipeEffectDisplay {
  const low = new Container();
  const high = new Container();
  low.eventMode = "none";
  high.eventMode = "none";
  low.sortableChildren = true;
  high.sortableChildren = true;
  low.visible = false;
  high.visible = false;
  lowLayer.addChild(low);
  highLayer.addChild(high);
  return {
    animatedVerticalBeam: null,
    buttonLane,
    high,
    isNativeDefault: true,
    kind,
    low,
    placement: getBandoriNativeSwipeEffectPlacement(kind, buttonLane),
    rangeWidth,
    runtime: createBandoriNativeSwipeEffectRuntime(kind, buttonLane, 0),
    renderables: [],
    terminalOffsetX: 0,
    terminalOffsetY: 0,
    triggerAnimationTimeSeconds: null,
  };
}

function clearSwipeEffect(display: SwipeEffectDisplay): void {
  display.runtime.stop();
  if (display.animatedVerticalBeam) display.animatedVerticalBeam.initialScreenY = null;
  display.triggerAnimationTimeSeconds = null;
  display.low.visible = false;
  display.high.visible = false;
  hideParticleEffectRenderables(display.renderables);
}

function updateSwipeEffect(
  display: SwipeEffectDisplay,
  animationTimeSeconds: number,
  textures: ReadonlyMap<string, Texture>,
  subtextures: Map<string, Texture>,
  ownedTextures: Texture[],
  noteScale: number,
): void {
  if (display.triggerAnimationTimeSeconds === null) return;
  const elapsedSeconds = animationTimeSeconds - display.triggerAnimationTimeSeconds;
  if (elapsedSeconds < 0) {
    clearSwipeEffect(display);
    return;
  }
  const frame = display.runtime.sample(elapsedSeconds);
  if (!frame.isPlaying && frame.count === 0) {
    clearSwipeEffect(display);
    return;
  }
  display.low.visible = true;
  display.high.visible = true;
  display.low.scale.set(noteScale);
  display.high.scale.set(noteScale);
  hideParticleEffectRenderables(display.renderables);

  const pixelScale = BANDORI_NATIVE_BUTTON_EFFECT_PIXELS_PER_WORLD_UNIT
    / display.placement.pixelsPerWorldUnit;
  for (let index = 0; index < frame.count; index += 1) {
    const instance = frame.instances[index];
    const texture = getParticleEffectFrameTexture(
      instance,
      textures,
      subtextures,
      ownedTextures,
    );
    const renderable = replaceParticleEffectRenderable(
      display.renderables,
      index,
      instance,
      texture,
    );
    configureParticleBlend(renderable.display, instance);
    const targetLayer = instance.sortingOrder >= 50 ? display.high : display.low;
    if (renderable.display.parent !== targetLayer) {
      targetLayer.addChild(renderable.display);
    }
    if (renderable.kind === "mesh") {
      updateParticleEffectMesh(
        renderable,
        instance,
        texture,
        display.placement,
        pixelScale,
      );
    } else {
      const sprite = renderable.display;
      const anchorX = isBandoriNativeDirectionalTerminalParticle(instance)
        ? display.terminalOffsetX
        : 0;
      const anchorY = isBandoriNativeDirectionalTerminalParticle(instance)
        ? display.terminalOffsetY
        : 0;
      const scaleX = instance.widthPixels / texture.orig.width
        * pixelScale
        * (display.isNativeDefault
          ? getBandoriNativeSwipeParticleWidthScale(
              display.kind,
              display.rangeWidth,
              instance,
            )
          : 1)
        * (instance.uv.flipU ? -1 : 1);
      const scaleY = instance.heightPixels / texture.orig.height
        * pixelScale
        * (instance.uv.flipV ? -1 : 1);
      const directionalNotesCenterOffsetPixels =
        getBandoriApprovedManualDirectionalNotesCenterOffsetPixels(instance);
      let particleScreenY = getBandoriApprovedManualVerticalBeamScreenY(
        display.kind,
        display.placement.screenY,
        instance,
      );
      const animatedVerticalBeam = display.animatedVerticalBeam;
      if (instance.hierarchyPath === animatedVerticalBeam?.hierarchyPath) {
        // Persona line1 keeps its authored spawn and lifetime while its upward
        // displacement receives the user-approved Web speed compensation.
        let initialScreenY = animatedVerticalBeam.initialScreenY;
        if (initialScreenY === null) {
          initialScreenY = instance.screenY;
          animatedVerticalBeam.initialScreenY = initialScreenY;
        }
        particleScreenY = getBandoriApprovedAnimatedTravelScreenY(
          initialScreenY,
          instance.screenY,
          animatedVerticalBeam.travelSpeedMultiplier,
        );
      }
      sprite.texture = texture;
      sprite.setFromMatrix(new Matrix(
        instance.basisX.x * scaleX,
        instance.basisX.y * scaleX,
        instance.basisY.x * scaleY,
        instance.basisY.y * scaleY,
        anchorX
          + (instance.screenX - display.placement.screenX) * pixelScale
          + instance.basisX.x * directionalNotesCenterOffsetPixels * pixelScale,
        anchorY
          + (particleScreenY - display.placement.screenY) * pixelScale
          + instance.basisX.y * directionalNotesCenterOffsetPixels * pixelScale,
      ));
    }
    renderable.display.tint = effectTint(
      instance.color.r,
      instance.color.g,
      instance.color.b,
    );
    renderable.display.alpha = Math.max(0, Math.min(1, instance.color.a));
    renderable.display.zIndex = instance.sortingOrder * 100_000 + index;
    renderable.display.visible = true;
  }
}

function triggerSwipeEffect(
  display: SwipeEffectDisplay,
  event: BandoriNativeHitEvent,
  screenX: number,
  screenY: number,
  terminalScreenX: number,
  terminalScreenY: number,
  animationTimeSeconds: number,
  textures: ReadonlyMap<string, Texture>,
  subtextures: Map<string, Texture>,
  ownedTextures: Texture[],
  noteScale: number,
  seedOverride?: number,
): void {
  if (display.rangeWidth !== event.rangeWidth) {
    throw new BandoriNativeNoteContractError("Swipe-effect display width does not match its event");
  }
  if (display.animatedVerticalBeam) display.animatedVerticalBeam.initialScreenY = null;
  display.runtime.setButtonIndex(display.buttonLane);
  display.runtime.play(
    0,
    seedOverride ?? getBandoriNativeSwipeEffectSeed(
      event.index,
      event.buttonLane,
      display.kind,
    ),
  );
  display.triggerAnimationTimeSeconds = animationTimeSeconds;
  display.low.position.set(screenX, screenY);
  display.high.position.set(screenX, screenY);
  display.terminalOffsetX = (terminalScreenX - screenX) / noteScale;
  display.terminalOffsetY = (terminalScreenY - screenY) / noteScale;
  updateSwipeEffect(
    display,
    animationTimeSeconds,
    textures,
    subtextures,
    ownedTextures,
    noteScale,
  );
}

function createHoldEffectDisplay(
  flashTexture: Texture,
  flashAnchorX: number,
  flashAnchorY: number,
  limitedRecipe: BandoriCompiledEffectRecipe | null,
  seed: number,
  kind: "long" | "slide",
  rangeWidth: number,
  initialAnimationElapsedSeconds: number,
  lowLayer: Container,
  highLayer: Container,
  flashLayer: Container,
): HoldEffectDisplay {
  const low = new Container();
  const high = new Container();
  low.eventMode = "none";
  high.eventMode = "none";
  low.sortableChildren = true;
  high.sortableChildren = true;
  lowLayer.addChild(low);
  highLayer.addChild(high);

  const flash = new Sprite(flashTexture);
  flash.anchor.set(flashAnchorX, flashAnchorY);
  flash.blendMode = "add";
  flash.eventMode = "none";
  flashLayer.addChild(flash);

  const runtime = limitedRecipe
    ? createBandoriEffectRecipeRuntime(limitedRecipe, { buttonIndex: 3, seed })
    : createBandoriNativeHoldEffectRuntime(seed, { kind, rangeWidth });
  const placement = limitedRecipe
    ? getBandoriEffectRecipePlacement(limitedRecipe, 3)
    : BANDORI_NATIVE_HOLD_EFFECT_PLACEMENT;
  runtime.play(0, seed);
  return {
    animationElapsedSeconds: initialAnimationElapsedSeconds,
    flash,
    high,
    low,
    placement,
    renderables: [],
    runtime,
  };
}

function updateHoldEffect(
  display: HoldEffectDisplay,
  elapsedSeconds: number,
  effectScreenX: number,
  effectScreenY: number,
  flashScreenX: number,
  flashScreenY: number,
  spritePixelScale: number,
  flashTexture: Texture,
  flashAnchorX: number,
  flashAnchorY: number,
  textures: ReadonlyMap<string, Texture>,
  subtextures: Map<string, Texture>,
  ownedTextures: Texture[],
  noteScale: number,
): void {
  const frame = display.runtime.sample(elapsedSeconds);
  display.low.position.set(effectScreenX, effectScreenY);
  display.high.position.set(effectScreenX, effectScreenY);
  display.low.visible = true;
  display.high.visible = true;
  display.low.scale.set(noteScale);
  display.high.scale.set(noteScale);
  hideParticleEffectRenderables(display.renderables);

  const pixelScale = BANDORI_NATIVE_BUTTON_EFFECT_PIXELS_PER_WORLD_UNIT
    / display.placement.pixelsPerWorldUnit;
  for (let index = 0; index < frame.count; index += 1) {
    const instance = frame.instances[index];
    const texture = getParticleEffectFrameTexture(
      instance,
      textures,
      subtextures,
      ownedTextures,
    );
    const renderable = replaceParticleEffectRenderable(
      display.renderables,
      index,
      instance,
      texture,
    );
    configureParticleBlend(renderable.display, instance);
    const targetLayer = instance.sortingOrder >= 50 ? display.high : display.low;
    if (renderable.display.parent !== targetLayer) {
      targetLayer.addChild(renderable.display);
    }
    if (renderable.kind === "mesh") {
      updateParticleEffectMesh(
        renderable,
        instance,
        texture,
        display.placement,
        pixelScale,
      );
    } else {
      const sprite = renderable.display;
      const scaleX = instance.widthPixels / texture.orig.width
        * pixelScale
        * (instance.uv.flipU ? -1 : 1);
      const scaleY = instance.heightPixels / texture.orig.height
        * pixelScale
        * (instance.uv.flipV ? -1 : 1);
      sprite.texture = texture;
      sprite.setFromMatrix(new Matrix(
        instance.basisX.x * scaleX,
        instance.basisX.y * scaleX,
        instance.basisY.x * scaleY,
        instance.basisY.y * scaleY,
        (instance.screenX - display.placement.screenX) * pixelScale,
        (instance.screenY - display.placement.screenY) * pixelScale,
      ));
    }
    renderable.display.tint = effectTint(
      instance.color.r,
      instance.color.g,
      instance.color.b,
    );
    renderable.display.alpha = Math.max(0, Math.min(1, instance.color.a));
    renderable.display.zIndex = instance.sortingOrder * 100_000 + index;
    renderable.display.visible = true;
  }

  const flashColor = evaluateBandoriNativeLongFlashColor(elapsedSeconds);
  display.flash.texture = flashTexture;
  display.flash.anchor.set(flashAnchorX, flashAnchorY);
  display.flash.position.set(flashScreenX, flashScreenY);
  display.flash.scale.set(spritePixelScale * noteScale);
  display.flash.tint = effectTint(flashColor.red, flashColor.green, flashColor.blue);
  display.flash.alpha = flashColor.alpha;
  display.flash.visible = true;
}

function destroyHoldEffect(display: HoldEffectDisplay): void {
  display.runtime.stop();
  display.low.removeFromParent();
  display.high.removeFromParent();
  display.flash.removeFromParent();
  display.low.destroy({ children: true });
  display.high.destroy({ children: true });
  display.flash.destroy();
}

function createLaneEffectDisplay(texture: Texture, sourceWidth: number, flipX: boolean): LaneEffectDisplay {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5, 1);
  sprite.eventMode = "none";
  sprite.visible = false;
  const sourcePixelScale = BANDORI_NATIVE_BUTTON_EFFECT_PIXELS_PER_WORLD_UNIT
    / BANDORI_NATIVE_LANE_EFFECT_PIXELS_PER_UNIT;
  sprite.width = sourceWidth * sourcePixelScale;
  sprite.height = 500 * sourcePixelScale;
  if (flipX) sprite.scale.x *= -1;
  return {
    baseScaleX: sprite.scale.x,
    baseScaleY: sprite.scale.y,
    fadeElapsedSeconds: 0,
    framesBeforeFade: 0,
    sprite,
  };
}

function clearLaneEffect(display: LaneEffectDisplay): void {
  display.framesBeforeFade = 0;
  display.fadeElapsedSeconds = 0;
  display.sprite.visible = false;
}

function triggerLaneEffect(display: LaneEffectDisplay): void {
  display.framesBeforeFade = BANDORI_NATIVE_LANE_EFFECT_WAIT_FRAMES;
  display.fadeElapsedSeconds = 0;
  display.sprite.tint = 0xffffff;
  display.sprite.alpha = 1;
  display.sprite.scale.set(display.baseScaleX, display.baseScaleY);
  display.sprite.visible = true;
}

function updateLaneEffect(
  display: LaneEffectDisplay,
  deltaSeconds: number,
  isPlaying: boolean,
): void {
  if (!display.sprite.visible || !isPlaying) return;
  if (display.framesBeforeFade > 0) {
    display.framesBeforeFade -= 1;
    return;
  }
  display.fadeElapsedSeconds += deltaSeconds;
  const progress = Math.min(
    1,
    display.fadeElapsedSeconds / BANDORI_NATIVE_LANE_EFFECT_FADE_SECONDS,
  );
  display.sprite.tint = effectTint(1 - 0.3 * progress, 1 - 0.3 * progress, 1);
  display.sprite.alpha = 1 - progress;
  if (progress >= 1) clearLaneEffect(display);
}

function createSyncLineDisplay(
  pair: BandoriNativeSyncLinePair,
  texture: Texture,
  compiled: CompiledBandoriChart,
  noteSkin: BandoriNativeNoteSkin,
): SyncLineDisplay {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  sprite.eventMode = "none";
  sprite.tint = 0xffffff;
  sprite.alpha = 1;
  sprite.visible = false;
  return {
    ...pair,
    leftEdgeMargin: compiled.notes.directions[pair.leftNoteIndex] === 0
      ? noteSkin.syncLineEdgeMargin
      : 0,
    rightEdgeMargin: compiled.notes.directions[pair.rightNoteIndex] === 0
      ? noteSkin.syncLineEdgeMargin
      : 0,
    sprite,
  };
}

function updateSyncLine(
  display: SyncLineDisplay,
  activeNotes: ReadonlyMap<number, NoteGroupDisplay>,
  isEnabled: boolean,
  noteScale: number,
): void {
  const left = activeNotes
    .get(display.leftNoteIndex)
    ?.notes.find((note) => note.visual.lane === display.leftVisualLane);
  const right = activeNotes
    .get(display.rightNoteIndex)
    ?.notes.find((note) => note.visual.lane === display.rightVisualLane);
  if (
    !isEnabled
    || !left?.container.visible
    || !right?.container.visible
    || !left.projected
    || !right.projected
  ) {
    display.sprite.visible = false;
    return;
  }

  const startX = left.projected.screenX
    + display.leftEdgeMargin
    * left.projected.worldScale
    * BANDORI_NATIVE_NOTE_PIXELS_PER_UNIT
    * noteScale;
  const endX = right.projected.screenX
    - display.rightEdgeMargin
    * right.projected.worldScale
    * BANDORI_NATIVE_NOTE_PIXELS_PER_UNIT
    * noteScale;
  if (endX <= startX) {
    display.sprite.visible = false;
    return;
  }

  display.sprite.position.set(
    (startX + endX) / 2,
    (left.projected.screenY + right.projected.screenY) / 2,
  );
  display.sprite.width = endX - startX;
  display.sprite.height = left.projected.worldScale
    * BANDORI_NATIVE_SYNC_LINE_WIDTH
    * BANDORI_NATIVE_NOTE_PIXELS_PER_UNIT
    * noteScale;
  display.sprite.visible = true;
}

/** Owns the fixed native coordinate space and its explicitly verified sprites. */
export default function NativeSimulatorStage({
  ariaLabel,
  backgroundSkin,
  compiled,
  directionalEffectEnabled,
  directionalEffectVariant,
  directionalFlickSkin,
  fieldSkin,
  frameRateLimit,
  getEffectPlaybackState,
  getPresentationTime,
  greatJudgmentWindowEnabled,
  isActive,
  isMirrored,
  judgmentWindowOffsetLabelEnabled,
  laneEffectEnabled,
  limitedPerformanceSkin,
  loadId,
  noteApproachTimeScale,
  noteSpeed,
  noteSize,
  noteSkin,
  noteContractErrorLabel,
  onLoadProgress,
  onRenderFpsChange,
  perfectJudgmentWindowEnabled,
  rendererErrorLabel,
  resolutionScale,
  resourceErrorLabel,
  resolveAssetUrl,
  rhythmSupportEnabled,
  slideJudgmentFrameCorrectionTenths,
  syncLineEnabled,
  suddenLaneEnabled,
  suddenRate,
  tapEffectContract,
  tapEffectEnabled,
}: NativeSimulatorStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const applicationRef = useRef<Application | null>(null);
  const renderFpsSampleRef = useRef<RenderFpsSample>({
    frameCount: 0,
    startedAtMs: null,
  });
  const frameRateLimitRef = useRef(frameRateLimit);
  const greatJudgmentWindowEnabledRef = useRef(greatJudgmentWindowEnabled);
  const isActiveRef = useRef(isActive);
  const isMirroredRef = useRef(isMirrored);
  const judgmentWindowOffsetLabelEnabledRef = useRef(
    judgmentWindowOffsetLabelEnabled,
  );
  const laneEffectEnabledRef = useRef(laneEffectEnabled);
  const noteApproachTimeScaleRef = useRef(noteApproachTimeScale);
  const noteSpeedRef = useRef(noteSpeed);
  const noteSizeRef = useRef(noteSize);
  const perfectJudgmentWindowEnabledRef = useRef(perfectJudgmentWindowEnabled);
  const rhythmSupportEnabledRef = useRef(rhythmSupportEnabled);
  const resolutionScaleRef = useRef(resolutionScale);
  const slideJudgmentFrameCorrectionTenthsRef = useRef(
    slideJudgmentFrameCorrectionTenths,
  );
  const syncLineEnabledRef = useRef(syncLineEnabled);
  const suddenLaneEnabledRef = useRef(suddenLaneEnabled);
  const suddenRateRef = useRef(suddenRate);
  const directionalEffectVariantRef = useRef(directionalEffectVariant);
  const [status, setStatus] = useState<StageStatus>("loading");

  useEffect(() => {
    isActiveRef.current = isActive;
    const application = applicationRef.current;
    if (!application) {
      if (!isActive) onRenderFpsChange(null);
      return;
    }
    if (isActive) {
      renderFpsSampleRef.current = {
        frameCount: 0,
        startedAtMs: performance.now(),
      };
      application.start();
      return;
    }
    application.stop();
    renderFpsSampleRef.current = {
      frameCount: 0,
      startedAtMs: null,
    };
    onRenderFpsChange(null);
  }, [isActive, onRenderFpsChange]);

  useEffect(() => {
    isMirroredRef.current = isMirrored;
  }, [isMirrored]);

  useEffect(() => {
    judgmentWindowOffsetLabelEnabledRef.current = judgmentWindowOffsetLabelEnabled;
  }, [judgmentWindowOffsetLabelEnabled]);

  useEffect(() => {
    greatJudgmentWindowEnabledRef.current = greatJudgmentWindowEnabled;
  }, [greatJudgmentWindowEnabled]);

  useEffect(() => {
    perfectJudgmentWindowEnabledRef.current = perfectJudgmentWindowEnabled;
  }, [perfectJudgmentWindowEnabled]);

  useEffect(() => {
    slideJudgmentFrameCorrectionTenthsRef.current =
      slideJudgmentFrameCorrectionTenths;
  }, [slideJudgmentFrameCorrectionTenths]);

  useEffect(() => {
    frameRateLimitRef.current = frameRateLimit;
    const application = applicationRef.current;
    if (application) {
      application.ticker.maxFPS = getBandoriSimulatorTickerMaxFps(frameRateLimit);
    }
  }, [frameRateLimit]);

  useEffect(() => {
    resolutionScaleRef.current = resolutionScale;
    const application = applicationRef.current;
    if (!application) return;
    resizeBandoriNativeStageRenderer(application, resolutionScale);
    // Resizing clears the backing canvas, so paused stages need one immediate frame.
    application.render();
  }, [resolutionScale]);

  useEffect(() => {
    // Speed is read by the ticker and must not recreate the Pixi renderer.
    noteSpeedRef.current = noteSpeed;
  }, [noteSpeed]);

  useEffect(() => {
    // The coupling switch is read by the ticker and must not recreate Pixi.
    noteApproachTimeScaleRef.current = noteApproachTimeScale;
  }, [noteApproachTimeScale]);

  useEffect(() => {
    laneEffectEnabledRef.current = laneEffectEnabled;
  }, [laneEffectEnabled]);

  useEffect(() => {
    noteSizeRef.current = noteSize;
  }, [noteSize]);

  useEffect(() => {
    rhythmSupportEnabledRef.current = rhythmSupportEnabled;
  }, [rhythmSupportEnabled]);

  useEffect(() => {
    syncLineEnabledRef.current = syncLineEnabled;
  }, [syncLineEnabled]);

  useEffect(() => {
    suddenLaneEnabledRef.current = suddenLaneEnabled;
  }, [suddenLaneEnabled]);

  useEffect(() => {
    suddenRateRef.current = suddenRate;
  }, [suddenRate]);

  useEffect(() => {
    directionalEffectVariantRef.current = directionalEffectVariant;
  }, [directionalEffectVariant]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    onRenderFpsChange(null);

    const app = new Application();
    const resourceAbortController = new AbortController();
    const localFrameTextures: Texture[] = [];
    const localShaders: Shader[] = [];
    const textureLeases: BandoriChartSimulatorTextureLease<Texture>[] = [];
    let disposed = false;
    let appInitialized = false;
    let appDestroyed = false;
    let loadedResourceTotal: number | null = null;
    const destroyApp = () => {
      if (appDestroyed) return;
      appDestroyed = true;
      resourceAbortController.abort();
      try {
        if (appInitialized) app.stop();
        app.destroy({ removeView: true }, { children: true });
      } catch {
        // Initialization can be aborted before the renderer exists.
      }
      for (const shader of localShaders.splice(0)) shader.destroy();
      for (const texture of localFrameTextures.splice(0)) texture.destroy(false);
      for (const lease of textureLeases.splice(0)) lease.release();
      if (applicationRef.current === app) applicationRef.current = null;
    };
    const failStage = (
      failureStatus: Exclude<StageStatus, "loading" | "ready">,
      completedResources = 0,
      totalResources: number | null = null,
    ) => {
      if (disposed) return;
      setStatus(failureStatus);
      onLoadProgress({
        completedResources,
        loadId,
        phase: "error",
        totalResources,
      });
      destroyApp();
    };
    onLoadProgress({
      completedResources: 0,
      loadId,
      phase: "resources",
      totalResources: null,
    });

    const initialize = async () => {
      try {
        await app.init({
          width: BANDORI_NATIVE_STAGE_SIZE.width,
          height: BANDORI_NATIVE_STAGE_SIZE.height,
          backgroundAlpha: backgroundSkin.id === "off" ? 1 : 0,
          backgroundColor: 0x000000,
          antialias: true,
          autoStart: false,
          autoDensity: true,
          resolution: getBandoriSimulatorRendererResolution(
            window.devicePixelRatio,
            resolutionScaleRef.current,
          ),
        });
      } catch {
        failStage("rendererError");
        return;
      }
      appInitialized = true;
      if (disposed) {
        destroyApp();
        return;
      }

      app.canvas.setAttribute("aria-hidden", "true");
      app.canvas.className = "absolute inset-0 h-full w-full";
      app.canvas.style.width = "100%";
      app.canvas.style.height = "100%";
      container.appendChild(app.canvas);

      let normalChartVisuals: BandoriNativeChartVisuals;
      let mirroredChartVisuals: BandoriNativeChartVisuals;
      try {
        normalChartVisuals = prepareBandoriNativeChartVisuals(compiled, false);
        mirroredChartVisuals = prepareBandoriNativeChartVisuals(compiled, true);
      } catch (error) {
        if (error instanceof BandoriNativeNoteContractError) {
          failStage("noteContractError");
          return;
        }
        throw error;
      }
      let chartVisuals = isMirroredRef.current
        ? mirroredChartVisuals
        : normalChartVisuals;

      let resources: Texture[];
      const habahiroSpriteNames = new Set<BandoriHabahiroSpriteName>();
      const slideBodyRangeWidths = new Set<number>();
      const longFlashRangeWidths = new Set<number>();
      let hasSingleLaneSlide = false;
      try {
        for (const preparedVisuals of [normalChartVisuals, mirroredChartVisuals]) {
          for (const group of preparedVisuals.notes) {
            if (!group) continue;
            for (const visual of group.visuals) {
              const bodyName = getBandoriHabahiroBodySpriteName(visual);
              const iconName = getBandoriHabahiroIconSpriteName(visual);
              if (bodyName) habahiroSpriteNames.add(bodyName);
              if (iconName) habahiroSpriteNames.add(iconName);
              if (bodyName && visual.body === "normal") {
                habahiroSpriteNames.add(getBandoriHabahiroRhythmSpriteName(visual));
              }
            }
          }
          for (const ribbon of preparedVisuals.ribbons) {
            if (ribbon.kind === "slide") {
              if (ribbon.rangeWidth === 1) {
                hasSingleLaneSlide = true;
              } else if (ribbon.rangeWidth > 1) {
                slideBodyRangeWidths.add(ribbon.rangeWidth);
              }
            }
            if (tapEffectEnabled && ribbon.rangeWidth > 1) {
              longFlashRangeWidths.add(ribbon.rangeWidth);
            }
          }
        }
        const dynamicWideRangeWidths = new Set([
          ...slideBodyRangeWidths,
          ...longFlashRangeWidths,
        ]);
        for (const rangeWidth of dynamicWideRangeWidths) {
          for (let firstLane = 0; firstLane <= 7 - rangeWidth; firstLane += 1) {
            const coveredLanes = Array.from(
              { length: rangeWidth },
              (_, laneOffset) => firstLane + laneOffset,
            );
            if (slideBodyRangeWidths.has(rangeWidth)) {
              habahiroSpriteNames.add(
                getBandoriHabahiroLongBodySpriteName(coveredLanes),
              );
            }
            if (longFlashRangeWidths.has(rangeWidth)) {
              habahiroSpriteNames.add(
                getBandoriHabahiroLongFlashSpriteName(coveredLanes),
              );
            }
          }
        }
      } catch {
        failStage("noteContractError");
        return;
      }
      const usedFrameIds = new Set<BandoriNativeNoteFrameId>();
      for (const preparedVisuals of [normalChartVisuals, mirroredChartVisuals]) {
        for (const group of preparedVisuals.notes) {
          if (!group) continue;
          for (const visual of group.visuals) {
            if (!getBandoriHabahiroBodySpriteName(visual)) {
              usedFrameIds.add(getBandoriNativeBodyFrameId(visual));
            }
            if (visual.icon && !isBandoriHabahiroMultiRangeFlickIcon(visual)) {
              usedFrameIds.add(getBandoriNativeIconFrameId(visual.icon));
            }
          }
        }
      }
      if (hasSingleLaneSlide) {
        for (let lane = 0; lane < 7; lane += 1) {
          usedFrameIds.add(getBandoriNativeLongBodyFrameId(lane));
        }
      }
      let habahiroTextures = new Map<BandoriHabahiroSpriteName, HabahiroTexture>();
      let noteSpriteAnchors = new Map<string, NativeSpriteAnchor>();
      let tapEffects: LoadedTapEffects | null = null;
      let directionalEffects: LoadedDirectionalEffects | null = null;
      let spriteFrameTextures = new Map<BandoriNativeNoteFrameId, Texture>();
      try {
        const usesRecipeTapEffect = tapEffectEnabled && tapEffectContract !== null;
        const usesDefaultTapEffect = tapEffectEnabled && !usesRecipeTapEffect;
        const usesDirectionalEffects = directionalEffectEnabled
          && compiled.notes.directions.some((direction) => direction !== 0);
        const directionalEffectAssets = usesDirectionalEffects
          ? getBandoriNativeDirectionalEffectAssetContract(directionalFlickSkin)
          : null;
        const rhythmSupportUrls = Array.from(
          { length: 7 },
          (_, lane) => getBandoriNativeRhythmSupportNoteUrl(noteSkin, lane),
        );
        const longFlashUrls: Array<string | null> = Array.from(
          { length: 7 },
          (_, lane) => tapEffectEnabled
            ? getBandoriNativeLongFlashUrl(noteSkin, lane)
            : null,
        );
        const laneEffectUrls = [
          getBandoriNativeLaneEffectUrl("NoteLaneEffect_1.png"),
          getBandoriNativeLaneEffectUrl("NoteLaneEffect_2.png"),
          getBandoriNativeLaneEffectUrl("NoteLaneEffect_3.png"),
          getBandoriNativeLaneEffectUrl("NoteLaneEffect_4.png"),
        ];
        const mainTextureUrls: Array<string | null> = [
          ...backgroundSkin.layers.map((layer) => layer.textureUrl),
          fieldSkin.textureUrl,
          BANDORI_NATIVE_SUDDEN_LINE_URL,
          fieldSkin.judgmentLineTextureUrl,
          noteSkin.frameSource === "atlas" ? noteSkin.atlasUrl : null,
          directionalFlickSkin.frameSource === "atlas"
            ? directionalFlickSkin.atlasUrl
            : null,
          noteSkin.longNoteLineUrl,
          noteSkin.curveSlideNoteLineUrl,
          noteSkin.syncLineUrl,
          directionalFlickSkin.lineLeftUrl,
          directionalFlickSkin.lineRightUrl,
          usesDefaultTapEffect ? BANDORI_NATIVE_TAP_EFFECT_ATLAS_1_URL : null,
          usesDefaultTapEffect ? BANDORI_NATIVE_TAP_EFFECT_ATLAS_2_URL : null,
          usesDefaultTapEffect
            ? BANDORI_NATIVE_SWIPE_EFFECT_TEXTURE_URLS["tap-light"]
            : null,
          usesDefaultTapEffect
            ? BANDORI_NATIVE_SWIPE_EFFECT_TEXTURE_URLS["tap-circle"]
            : null,
          usesDefaultTapEffect
            ? BANDORI_NATIVE_HOLD_EFFECT_TEXTURE_URLS["tap-default-particle"]
            : null,
          limitedPerformanceSkin?.judgmentPerfectTextureUrl
            ?? BANDORI_NATIVE_PERFECT_JUDGMENT_URL,
          BANDORI_NATIVE_COMBO_UNIT_URL,
          BANDORI_NATIVE_ALL_PERFECT_COMBO_UNIT_URL,
          ...BANDORI_NATIVE_COMBO_DIGIT_URLS,
          ...BANDORI_NATIVE_ALL_PERFECT_COMBO_DIGIT_URLS,
          ...rhythmSupportUrls,
          ...longFlashUrls,
          ...laneEffectUrls,
        ];
        const spriteFrameUrls = [...usedFrameIds].flatMap((frameId) => {
          const url = getBandoriNativeNoteFrameUrl(
            frameId,
            noteSkin,
            directionalFlickSkin,
          );
          return url ? [url] : [];
        });
        const habahiroUrls = [...habahiroSpriteNames].map(
          getBandoriHabahiroSpriteUrl,
        );
        const effectRecipeUrls = tapEffectContract
          ? Object.values(tapEffectContract.recipes)
          : [];
        const effectTextureUrls = tapEffectContract
          ? Object.values(tapEffectContract.resources)
          : [];
        const directionalEffectRecipeUrls = directionalEffectAssets
          ? BANDORI_NATIVE_DIRECTIONAL_EFFECT_VARIANTS.flatMap(
              (variant) => Object.values(directionalEffectAssets.recipes[variant]),
            )
          : [];
        const directionalEffectTextureUrls = directionalEffectAssets
          ? Object.values(directionalEffectAssets.resources)
          : [];
        const requiredLogicalUrls = [
          ...mainTextureUrls.filter((url): url is string => url !== null),
          ...spriteFrameUrls,
          ...habahiroUrls,
          ...(noteSkin.spriteAnchorsUrl ? [noteSkin.spriteAnchorsUrl] : []),
          ...effectRecipeUrls,
          ...effectTextureUrls,
          ...directionalEffectRecipeUrls,
          ...directionalEffectTextureUrls,
        ];
        const plannedResourceUrls = new Set(
          requiredLogicalUrls.map(resolveAssetUrl),
        );
        const completedResourceUrls = new Set<string>();
        const totalResources = plannedResourceUrls.size;
        loadedResourceTotal = totalResources;
        onLoadProgress({
          completedResources: 0,
          loadId,
          phase: "resources",
          totalResources,
        });
        const markResourceComplete = (resolvedUrl: string) => {
          if (
            disposed
            || !plannedResourceUrls.has(resolvedUrl)
            || completedResourceUrls.has(resolvedUrl)
          ) return;
          completedResourceUrls.add(resolvedUrl);
          onLoadProgress({
            completedResources: completedResourceUrls.size,
            loadId,
            phase: "resources",
            totalResources,
          });
        };
        const loadTexture = async (logicalUrl: string) => {
          const resolvedUrl = resolveAssetUrl(logicalUrl);
          const lease = acquireBandoriChartSimulatorTexture(resolvedUrl);
          textureLeases.push(lease);
          const texture = await lease.resource;
          markResourceComplete(resolvedUrl);
          return texture;
        };
        const loadJson = async (logicalUrl: string): Promise<unknown> => {
          const resolvedUrl = resolveAssetUrl(logicalUrl);
          const response = await fetch(resolvedUrl, {
            cache: "force-cache",
            credentials: "omit",
            signal: resourceAbortController.signal,
          });
          if (!response.ok) {
            throw new Error(`Simulator resource failed: ${logicalUrl}`);
          }
          const payload: unknown = await response.json();
          markResourceComplete(resolvedUrl);
          return payload;
        };
        const [
          loadedResources,
          loadedTapEffects,
          loadedDirectionalEffects,
          loadedSpriteFrames,
          loadedNoteSpriteAnchors,
          habahiroEntries,
        ] = await Promise.all([
          Promise.all(mainTextureUrls.map(
            (url) => url ? loadTexture(url) : Promise.resolve(Texture.EMPTY),
          )),
          loadTapEffects(
            tapEffectEnabled ? tapEffectContract : null,
            loadJson,
            loadTexture,
          ),
          usesDirectionalEffects
            ? loadDirectionalEffects(
                directionalFlickSkin,
                loadJson,
                loadTexture,
              )
            : Promise.resolve(null),
          Promise.all([...usedFrameIds].map(async (frameId) => {
            const url = getBandoriNativeNoteFrameUrl(
              frameId,
              noteSkin,
              directionalFlickSkin,
            );
            return url
              ? [frameId, await loadTexture(url)] as const
              : null;
          })),
          loadNativeSpriteAnchors(noteSkin.spriteAnchorsUrl, loadJson),
          Promise.all([...habahiroSpriteNames].map(async (name) => {
            const texture = await loadTexture(getBandoriHabahiroSpriteUrl(name));
            const contract = BANDORI_HABAHIRO_SPRITES[name];
            return [name, {
              anchorX: contract.anchorX,
              anchorY: contract.anchorY,
              texture,
            }] as const;
          })),
        ]);
        if (completedResourceUrls.size !== totalResources) {
          throw new Error("Simulator resource plan did not complete");
        }
        resources = loadedResources;
        tapEffects = loadedTapEffects;
        directionalEffects = loadedDirectionalEffects;
        noteSpriteAnchors = new Map(loadedNoteSpriteAnchors);
        spriteFrameTextures = new Map(
          loadedSpriteFrames.filter((entry) => entry !== null),
        );
        habahiroTextures = new Map(habahiroEntries);
        onLoadProgress({
          completedResources: totalResources,
          loadId,
          phase: "initializing",
          totalResources,
        });
      } catch {
        failStage("resourceError");
        return;
      }
      if (disposed) return;

      const backgroundTextures = resources.slice(0, backgroundSkin.layers.length);
      const [
        fieldTexture,
        suddenLineTexture,
        judgmentLineTexture,
        standardAtlas,
        directionalAtlas,
        longNoteLineTexture,
        curveSlideNoteLineTexture,
        syncLineTexture,
        directionalLineLeftTexture,
        directionalLineRightTexture,
        tapEffectAtlas1,
        tapEffectAtlas2,
        tapEffectLight,
        tapEffectCircle,
        tapEffectDefaultParticle,
        perfectJudgmentTexture,
        comboUnitTexture,
        allPerfectComboUnitTexture,
        comboDigitTexture0,
        comboDigitTexture1,
        comboDigitTexture2,
        comboDigitTexture3,
        comboDigitTexture4,
        comboDigitTexture5,
        comboDigitTexture6,
        comboDigitTexture7,
        comboDigitTexture8,
        comboDigitTexture9,
        allPerfectComboDigitTexture0,
        allPerfectComboDigitTexture1,
        allPerfectComboDigitTexture2,
        allPerfectComboDigitTexture3,
        allPerfectComboDigitTexture4,
        allPerfectComboDigitTexture5,
        allPerfectComboDigitTexture6,
        allPerfectComboDigitTexture7,
        allPerfectComboDigitTexture8,
        allPerfectComboDigitTexture9,
        rhythmSupportTexture0,
        rhythmSupportTexture1,
        rhythmSupportTexture2,
        rhythmSupportTexture3,
        rhythmSupportTexture4,
        rhythmSupportTexture5,
        rhythmSupportTexture6,
        longFlashTexture0,
        longFlashTexture1,
        longFlashTexture2,
        longFlashTexture3,
        longFlashTexture4,
        longFlashTexture5,
        longFlashTexture6,
        laneEffectTexture1,
        laneEffectTexture2,
        laneEffectTexture3,
        laneEffectTexture4,
      ] = resources.slice(backgroundSkin.layers.length);
      for (const texture of resources) texture.source.scaleMode = "linear";
      for (const texture of tapEffects?.textures.values() ?? []) {
        texture.source.scaleMode = "linear";
      }
      for (const texture of directionalEffects?.textures.values() ?? []) {
        texture.source.scaleMode = "linear";
      }
      for (const texture of spriteFrameTextures.values()) {
        texture.source.scaleMode = "linear";
      }

      const directionalLineLeftShader = createNativeTransparentColoredShader(
        directionalLineLeftTexture,
      );
      const directionalLineRightShader = createNativeTransparentColoredShader(
        directionalLineRightTexture,
      );
      localShaders.push(
        directionalLineLeftShader,
        directionalLineRightShader,
      );
      const backgroundLayers = backgroundTextures.map((texture, index) => {
        const layer = backgroundSkin.layers[index];
        const background = new Sprite(texture);
        background.anchor.set(0.5);
        background.eventMode = "none";
        background.position.set(
          layer.rect.left + layer.rect.width / 2,
          layer.rect.top + layer.rect.height / 2,
        );
        background.width = layer.rect.width;
        background.height = layer.rect.height;
        background.tint = 0xffffff;
        background.alpha = 1;
        return background;
      });

      const field = new Sprite(fieldTexture);
      field.eventMode = "none";
      field.position.set(BANDORI_NATIVE_FIELD_RECT.left, BANDORI_NATIVE_FIELD_RECT.top);
      field.width = BANDORI_NATIVE_FIELD_RECT.width;
      field.height = BANDORI_NATIVE_FIELD_RECT.height;

      const suddenLine = new NineSliceSprite({
        anchor: 0.5,
        bottomHeight: BANDORI_NATIVE_SUDDEN_LINE_BORDER_PIXELS.bottom,
        leftWidth: BANDORI_NATIVE_SUDDEN_LINE_BORDER_PIXELS.left,
        rightWidth: BANDORI_NATIVE_SUDDEN_LINE_BORDER_PIXELS.right,
        texture: suddenLineTexture,
        topHeight: BANDORI_NATIVE_SUDDEN_LINE_BORDER_PIXELS.top,
      });
      suddenLine.alpha = 0.6980392;
      suddenLine.eventMode = "none";
      suddenLine.visible = false;

      const judgmentLine = new Sprite(judgmentLineTexture);
      const judgmentLineRect = getBandoriNativeJudgmentLineRect(
        fieldSkin.judgmentLineSpriteHeight,
        fieldSkin.judgmentLineSpriteWidth,
      );
      judgmentLine.eventMode = "none";
      judgmentLine.position.set(
        judgmentLineRect.left,
        judgmentLineRect.top,
      );
      judgmentLine.width = judgmentLineRect.width;
      judgmentLine.height = judgmentLineRect.height;
      judgmentLine.tint = 0xffffff;
      judgmentLine.alpha = 1;

      const frameTextures = new Map<BandoriNativeNoteFrameId, Texture>();
      try {
        for (const frameId of usedFrameIds) {
          const directTexture = spriteFrameTextures.get(frameId);
          const texture = directTexture ?? createFrameTexture(
              standardAtlas,
              directionalAtlas,
              frameId,
              noteSkin,
              directionalFlickSkin,
            );
          frameTextures.set(frameId, texture);
          if (!directTexture) localFrameTextures.push(texture);
        }
      } catch (error) {
        if (error instanceof BandoriNativeNoteContractError) {
          failStage(
            "noteContractError",
            loadedResourceTotal ?? 0,
            loadedResourceTotal,
          );
          return;
        }
        throw error;
      }

      const hitEffectTextures = new Map<string, Texture>();
      if (tapEffectEnabled) {
        for (const effect of Object.values(BANDORI_NATIVE_APPROXIMATE_HIT_EFFECTS)) {
          const frameContracts = [
            ...effect.staticLayers.map((layer) => ({ atlas: layer.atlas, frame: layer.frame })),
            { atlas: effect.kira.atlas, frame: effect.kira.frame },
          ];
          for (const frameContract of frameContracts) {
            const key = `${frameContract.atlas}:${frameContract.frame}`;
            if (hitEffectTextures.has(key)) continue;
            const texture = createTapEffectFrameTexture(
              frameContract.atlas === "set1" ? tapEffectAtlas1 : tapEffectAtlas2,
              frameContract.frame,
            );
            hitEffectTextures.set(key, texture);
            localFrameTextures.push(texture);
          }
        }
      }
      const swipeEffectTextures = new Map<string, Texture>([
        ["tap-set1", tapEffectAtlas1],
        ["tap-set2", tapEffectAtlas2],
        ["tap-light", tapEffectLight],
        ["tap-circle", tapEffectCircle],
        ["tap-default-particle", tapEffectDefaultParticle],
        ...(tapEffects?.textures.entries() ?? []),
        ...(directionalEffects?.textures.entries() ?? []),
      ]);
      const longFlashTextures = [
        longFlashTexture0,
        longFlashTexture1,
        longFlashTexture2,
        longFlashTexture3,
        longFlashTexture4,
        longFlashTexture5,
        longFlashTexture6,
      ] as const;
      const rhythmSupportTextures = [
        rhythmSupportTexture0,
        rhythmSupportTexture1,
        rhythmSupportTexture2,
        rhythmSupportTexture3,
        rhythmSupportTexture4,
        rhythmSupportTexture5,
        rhythmSupportTexture6,
      ] as const;
      const comboDigitTextures = [
        comboDigitTexture0,
        comboDigitTexture1,
        comboDigitTexture2,
        comboDigitTexture3,
        comboDigitTexture4,
        comboDigitTexture5,
        comboDigitTexture6,
        comboDigitTexture7,
        comboDigitTexture8,
        comboDigitTexture9,
      ] as const;
      const allPerfectComboDigitTextures = [
        allPerfectComboDigitTexture0,
        allPerfectComboDigitTexture1,
        allPerfectComboDigitTexture2,
        allPerfectComboDigitTexture3,
        allPerfectComboDigitTexture4,
        allPerfectComboDigitTexture5,
        allPerfectComboDigitTexture6,
        allPerfectComboDigitTexture7,
        allPerfectComboDigitTexture8,
        allPerfectComboDigitTexture9,
      ] as const;
      const swipeEffectSubtextures = new Map<string, Texture>();

      const directionalLineLayer = new Container();
      const judgmentWindowLayer = new Graphics();
      const judgmentWindowOffsetLabelLayer = new Container();
      const syncLineLayer = new Container();
      const laneEffectLayer = new Container();
      const lowHitEffectLayer = new Container();
      const highHitEffectLayer = new Container();
      const ribbonLayer = new Container();
      const noteLayer = new Container();
      const touchingFlashLayer = new Container();
      const informationLayer = new Container();
      const suddenMask = new Graphics();
      directionalLineLayer.eventMode = "none";
      judgmentWindowLayer.eventMode = "none";
      judgmentWindowOffsetLabelLayer.eventMode = "none";
      syncLineLayer.eventMode = "none";
      laneEffectLayer.eventMode = "none";
      lowHitEffectLayer.eventMode = "none";
      highHitEffectLayer.eventMode = "none";
      ribbonLayer.eventMode = "none";
      noteLayer.eventMode = "none";
      touchingFlashLayer.eventMode = "none";
      informationLayer.eventMode = "none";
      suddenMask.eventMode = "none";
      app.stage.addChild(
        ...backgroundLayers,
        field,
        judgmentWindowLayer,
        judgmentLine,
        laneEffectLayer,
        lowHitEffectLayer,
        highHitEffectLayer,
        informationLayer,
        directionalLineLayer,
        ribbonLayer,
        syncLineLayer,
        noteLayer,
        judgmentWindowOffsetLabelLayer,
        touchingFlashLayer,
        suddenLine,
        suddenMask,
      );
      const judgmentWindowOffsetLabelPools = {
        great: [] as Text[],
        perfect: [] as Text[],
      };

      const perfectJudgment = createPerfectJudgmentDisplay(perfectJudgmentTexture);
      const combo = createComboDisplay(comboUnitTexture, comboDigitTextures);
      const allPerfectCombo = createComboDisplay(
        allPerfectComboUnitTexture,
        allPerfectComboDigitTextures,
      );
      informationLayer.addChild(
        combo.root,
        allPerfectCombo.root,
        perfectJudgment.root,
      );

      const laneEffectTextures = new Map([
        ["NoteLaneEffect_1.png", laneEffectTexture1],
        ["NoteLaneEffect_2.png", laneEffectTexture2],
        ["NoteLaneEffect_3.png", laneEffectTexture3],
        ["NoteLaneEffect_4.png", laneEffectTexture4],
      ]);
      const laneEffects = BANDORI_NATIVE_LANE_EFFECTS.map((contract) => {
        const texture = laneEffectTextures.get(contract.file);
        const projection = projectBandoriNativeNote(contract.lane, 0, 0);
        if (!texture || !projection) {
          throw new BandoriNativeNoteContractError("Native lane-effect placement is unavailable");
        }
        const display = createLaneEffectDisplay(
          texture,
          contract.sourceWidth,
          contract.flipX,
        );
        display.sprite.position.set(projection.screenX, projection.screenY);
        laneEffectLayer.addChild(display.sprite);
        return display;
      });
      const normalSyncLinePairs = collectBandoriNativeSyncLinePairs(
        compiled,
        normalChartVisuals,
      );
      const mirroredSyncLinePairs = collectBandoriNativeSyncLinePairs(
        compiled,
        mirroredChartVisuals,
      );
      const normalJudgmentCandidates = prepareBandoriNativeJudgmentWindowCandidates(
        compiled,
        normalChartVisuals,
      );
      const mirroredJudgmentCandidates = prepareBandoriNativeJudgmentWindowCandidates(
        compiled,
        mirroredChartVisuals,
      );
      const normalJudgmentPriorityIndex =
        prepareBandoriNativeJudgmentWindowPriorityIndex(
          normalJudgmentCandidates,
        );
      const mirroredJudgmentPriorityIndex =
        prepareBandoriNativeJudgmentWindowPriorityIndex(
          mirroredJudgmentCandidates,
        );
      let judgmentCandidatesByNoteIndex = isMirroredRef.current
        ? mirroredJudgmentCandidates
        : normalJudgmentCandidates;
      let judgmentPriorityIndex = isMirroredRef.current
        ? mirroredJudgmentPriorityIndex
        : normalJudgmentPriorityIndex;
      if (normalSyncLinePairs.length !== mirroredSyncLinePairs.length) {
        throw new BandoriNativeNoteContractError(
          "Mirrored sync-line topology does not match the source chart",
        );
      }
      const initialSyncLinePairs = isMirroredRef.current
        ? mirroredSyncLinePairs
        : normalSyncLinePairs;
      const syncLineDisplays = initialSyncLinePairs.map((pair) => {
        const display = createSyncLineDisplay(
          pair,
          syncLineTexture,
          compiled,
          noteSkin,
        );
        syncLineLayer.addChild(display.sprite);
        return display;
      });
      const syncLinesByNoteIndex: SyncLineDisplay[][] = Array.from(
        { length: compiled.notes.times.length },
        () => [],
      );
      const visibleSyncLines = new Set<SyncLineDisplay>();
      const desiredSyncLines = new Set<SyncLineDisplay>();
      const hitEffects = new Map<string, HitEffectDisplay>();
      const swipeEffects = new Map<string, SwipeEffectDisplay>();
      const holdEffects = new Map<number, HoldEffectDisplay>();

      const ribbonSegments: RibbonSegmentDisplay[] = [];
      const ribbonSegmentsByIndex = new Map<number, RibbonSegmentDisplay[]>();
      for (const ribbon of chartVisuals.ribbons) {
        const displays: RibbonSegmentDisplay[] = [];
        ribbonSegmentsByIndex.set(ribbon.ribbonIndex, displays);
        const texture = ribbon.isCurvedSlide
          ? curveSlideNoteLineTexture
          : longNoteLineTexture;
        for (let pointIndex = 1; pointIndex < ribbon.points.length; pointIndex += 1) {
          const ordinary = createRibbonMeshDisplay(texture, "ordinary");
          const advanced = createRibbonMeshDisplay(texture, "advanced");
          ribbonLayer.addChild(ordinary.mesh, advanced.mesh);
          const display = {
            advanced,
            end: ribbon.points[pointIndex],
            ordinary,
            ribbon,
            ribbonPointIndex: pointIndex - 1,
            start: ribbon.points[pointIndex - 1],
          };
          ribbonSegments.push(display);
          displays.push(display);
        }
      }

      const ribbonByIndex = new Map<number, BandoriNativeRibbonVisual>();
      const ribbonPointByNoteIndex: Array<{
        pointIndex: number;
        ribbon: BandoriNativeRibbonVisual;
      } | null> = Array.from({ length: compiled.notes.times.length }, () => null);
      const ribbonNoteIndexes = new Map<number, number[]>();
      const applyChartVisuals = (
        nextVisuals: BandoriNativeChartVisuals,
        syncLinePairs: readonly BandoriNativeSyncLinePair[],
      ) => {
        chartVisuals = nextVisuals;
        judgmentCandidatesByNoteIndex = nextVisuals === mirroredChartVisuals
          ? mirroredJudgmentCandidates
          : normalJudgmentCandidates;
        judgmentPriorityIndex = nextVisuals === mirroredChartVisuals
          ? mirroredJudgmentPriorityIndex
          : normalJudgmentPriorityIndex;
        for (const displays of syncLinesByNoteIndex) displays.length = 0;
        ribbonByIndex.clear();
        ribbonNoteIndexes.clear();
        ribbonPointByNoteIndex.fill(null);
        for (const ribbon of chartVisuals.ribbons) {
          ribbonByIndex.set(ribbon.ribbonIndex, ribbon);
        }
        for (let noteIndex = 0; noteIndex < compiled.notes.times.length; noteIndex += 1) {
          const ribbonIndex = compiled.notes.ribbonIndexes[noteIndex];
          const ribbon = ribbonByIndex.get(ribbonIndex);
          const pointIndex = compiled.notes.sourceNodeIndexes[noteIndex];
          if (!ribbon || pointIndex < 0 || pointIndex >= ribbon.points.length) continue;
          ribbonPointByNoteIndex[noteIndex] = { pointIndex, ribbon };
          const indexes = ribbonNoteIndexes.get(ribbonIndex) ?? [];
          indexes.push(noteIndex);
          ribbonNoteIndexes.set(ribbonIndex, indexes);
        }
        let segmentIndex = 0;
        for (const ribbon of chartVisuals.ribbons) {
          for (let pointIndex = 1; pointIndex < ribbon.points.length; pointIndex += 1) {
            const segment = ribbonSegments[segmentIndex];
            if (!segment) {
              throw new BandoriNativeNoteContractError(
                "Mirrored ribbon topology does not match the source chart",
              );
            }
            segment.end = ribbon.points[pointIndex];
            segment.ribbon = ribbon;
            segment.ribbonPointIndex = pointIndex - 1;
            segment.start = ribbon.points[pointIndex - 1];
            segmentIndex += 1;
          }
        }
        if (segmentIndex !== ribbonSegments.length) {
          throw new BandoriNativeNoteContractError(
            "Mirrored ribbon topology does not match the source chart",
          );
        }
        for (let index = 0; index < syncLineDisplays.length; index += 1) {
          const display = syncLineDisplays[index];
          const pair = syncLinePairs[index];
          if (!pair) {
            throw new BandoriNativeNoteContractError(
              "Mirrored sync-line topology does not match the source chart",
            );
          }
          display.leftNoteIndex = pair.leftNoteIndex;
          display.leftVisualLane = pair.leftVisualLane;
          display.rightNoteIndex = pair.rightNoteIndex;
          display.rightVisualLane = pair.rightVisualLane;
          display.sprite.visible = false;
          syncLinesByNoteIndex[display.leftNoteIndex]?.push(display);
          if (display.rightNoteIndex !== display.leftNoteIndex) {
            syncLinesByNoteIndex[display.rightNoteIndex]?.push(display);
          }
        }
      };
      applyChartVisuals(chartVisuals, initialSyncLinePairs);

      const ribbonIntervalsByStart = normalChartVisuals.ribbons.map((ribbon) => {
        const first = ribbon.points[0];
        const last = ribbon.points.at(-1);
        if (!first || !last) {
          throw new BandoriNativeNoteContractError("Ribbon interval is empty");
        }
        return {
          endTimeSeconds: last.time,
          ribbonIndex: ribbon.ribbonIndex,
          startTimeSeconds: first.time,
        };
      }).sort((left, right) => left.startTimeSeconds - right.startTimeSeconds);
      const ribbonIntervalsByEnd = [...ribbonIntervalsByStart].sort(
        (left, right) => left.endTimeSeconds - right.endTimeSeconds,
      );
      const visibleRibbonIndexes = new Set<number>();
      const visibleRibbons: BandoriNativeRibbonVisual[] = [];
      const isMultiRangeChart = isBandoriNativeMultiRangeChart(compiled);
      let renderedSuddenLaneEnabled = !suddenLaneEnabledRef.current;
      let renderedSuddenRate = Number.NaN;
      const applySuddenDisplay = () => {
        const rate = suddenRateRef.current;
        const isLaneHidden = suddenLaneEnabledRef.current;
        if (
          rate === renderedSuddenRate
          && isLaneHidden === renderedSuddenLaneEnabled
        ) return;
        renderedSuddenRate = rate;
        renderedSuddenLaneEnabled = isLaneHidden;
        const ratio = getBandoriNativeSuddenRatio(rate);
        const thresholdY = getBandoriNativeSuddenScreenY(rate);
        const mask = ratio > 0 ? suddenMask : null;
        directionalLineLayer.mask = mask;
        syncLineLayer.mask = mask;
        ribbonLayer.mask = mask;
        noteLayer.mask = mask;
        suddenMask.clear();
        suddenMask.visible = ratio > 0;
        if (ratio > 0) {
          suddenMask
            .rect(
              0,
              thresholdY,
              BANDORI_NATIVE_STAGE_SIZE.width,
              BANDORI_NATIVE_STAGE_SIZE.height - thresholdY,
            )
            .fill(0xffffff);
        }
        suddenLine.visible = ratio > 0;
        if (ratio > 0) {
          const size = getBandoriNativeSuddenLineSize(rate);
          const sourcePixelScale = size.height / suddenLineTexture.height;
          suddenLine.position.set(
            BANDORI_NATIVE_FIELD_RECT.left + BANDORI_NATIVE_FIELD_RECT.width / 2,
            getBandoriNativeSuddenLineScreenY(rate),
          );
          suddenLine.setSize(
            size.width / sourcePixelScale,
            suddenLineTexture.height,
          );
          suddenLine.scale.set(sourcePixelScale);
        }

        field.mask = isLaneHidden ? mask : null;
      };
      applySuddenDisplay();
      let nextRibbonStartIndex = 0;
      let nextRibbonEndIndex = 0;
      let previousRibbonStartThreshold = Number.NEGATIVE_INFINITY;
      let previousRibbonTimeSeconds = Number.NEGATIVE_INFINITY;
      const updateVisibleRibbonIndexes = (
        presentationTimeSeconds: number,
        arrivalSeconds: number,
      ) => {
        const startThreshold = presentationTimeSeconds + arrivalSeconds;
        if (
          presentationTimeSeconds < previousRibbonTimeSeconds
          || startThreshold < previousRibbonStartThreshold
        ) {
          visibleRibbonIndexes.clear();
          nextRibbonStartIndex = 0;
          nextRibbonEndIndex = 0;
        }
        while (
          nextRibbonStartIndex < ribbonIntervalsByStart.length
          && ribbonIntervalsByStart[nextRibbonStartIndex].startTimeSeconds
            <= startThreshold
        ) {
          visibleRibbonIndexes.add(
            ribbonIntervalsByStart[nextRibbonStartIndex].ribbonIndex,
          );
          nextRibbonStartIndex += 1;
        }
        while (
          nextRibbonEndIndex < ribbonIntervalsByEnd.length
          && ribbonIntervalsByEnd[nextRibbonEndIndex].endTimeSeconds
            < presentationTimeSeconds
        ) {
          visibleRibbonIndexes.delete(
            ribbonIntervalsByEnd[nextRibbonEndIndex].ribbonIndex,
          );
          nextRibbonEndIndex += 1;
        }
        previousRibbonStartThreshold = startThreshold;
        previousRibbonTimeSeconds = presentationTimeSeconds;
      };

      const activeNotes = new Map<number, NoteGroupDisplay>();
      const projectedHoldStates = new Map<number, BandoriNativeProjectedHoldState>();
      const activeJudgmentCandidates: BandoriNativeJudgmentWindowCandidate[] = [];
      const renderedRibbonIndexes = new Set<number>();
      const desiredNoteMarks = new Uint32Array(compiled.notes.times.length);
      const desiredNoteIndexes: number[] = [];
      let desiredNoteGeneration = 0;
      const markDesiredNote = (index: number) => {
        if (desiredNoteMarks[index] === desiredNoteGeneration) return;
        desiredNoteMarks[index] = desiredNoteGeneration;
        desiredNoteIndexes.push(index);
      };
      let effectPlaybackState = getEffectPlaybackState();
      let effectTimelineVersion = effectPlaybackState.timelineVersion;
      let lastEffectTimeSeconds = getPresentationTime();
      let effectAnimationTimeSeconds = 0;
      let renderedMirror = isMirroredRef.current;
      let renderedDirectionalEffectVariant = directionalEffectVariantRef.current;

      const clearEffects = () => {
        clearPerfectJudgment(perfectJudgment);
        for (const display of laneEffects) clearLaneEffect(display);
        for (const display of hitEffects.values()) clearHitEffect(display);
        for (const display of swipeEffects.values()) clearSwipeEffect(display);
        for (const display of holdEffects.values()) destroyHoldEffect(display);
        holdEffects.clear();
      };

      const removeNoteGroup = (index: number, display: NoteGroupDisplay) => {
        for (const connector of display.connectors) {
          directionalLineLayer.removeChild(connector.mesh);
          connector.mesh.destroy();
        }
        for (const note of display.notes) {
          noteLayer.removeChild(note.container);
          note.container.destroy({ children: true });
        }
        activeNotes.delete(index);
      };

      const renderNotes = () => {
        const presentationTime = getPresentationTime();
        effectPlaybackState = getEffectPlaybackState();
        applySuddenDisplay();
        if (renderedDirectionalEffectVariant !== directionalEffectVariantRef.current) {
          clearEffects();
          renderedDirectionalEffectVariant = directionalEffectVariantRef.current;
          lastEffectTimeSeconds = presentationTime;
        }
        if (renderedMirror !== isMirroredRef.current) {
          for (const [index, display] of activeNotes) {
            removeNoteGroup(index, display);
          }
          for (const segment of ribbonSegments) {
            segment.ordinary.mesh.visible = false;
            segment.advanced.mesh.visible = false;
          }
          renderedRibbonIndexes.clear();
          clearEffects();
          renderedMirror = isMirroredRef.current;
          applyChartVisuals(
            renderedMirror ? mirroredChartVisuals : normalChartVisuals,
            renderedMirror ? mirroredSyncLinePairs : normalSyncLinePairs,
          );
          effectTimelineVersion = effectPlaybackState.timelineVersion;
          lastEffectTimeSeconds = presentationTime;
        }
        const effectClockStep = advanceBandoriEffectAnimationClock({
          animationTimeSeconds: effectAnimationTimeSeconds,
          isPlaying: effectPlaybackState.isPlaying,
          playbackRate: effectPlaybackState.playbackRate,
          presentationTimeSeconds: presentationTime,
          previousPresentationTimeSeconds: lastEffectTimeSeconds,
          previousTimelineVersion: effectTimelineVersion,
          timelineVersion: effectPlaybackState.timelineVersion,
        });
        const effectAnimationDeltaSeconds = effectClockStep.animationDeltaSeconds;
        const didResetTimeline = effectClockStep.didResetTimeline;
        effectAnimationTimeSeconds = effectClockStep.animationTimeSeconds;
        if (didResetTimeline) {
          clearEffects();
          combo.popStartAnimationTimeSeconds = null;
          allPerfectCombo.popStartAnimationTimeSeconds = null;
          effectTimelineVersion = effectPlaybackState.timelineVersion;
          lastEffectTimeSeconds = presentationTime;
        }
        const currentNoteScale = getBandoriNativeNoteScale(
          noteSizeRef.current,
          isMultiRangeChart,
        );
        for (let lane = 0; lane < laneEffects.length; lane += 1) {
          if (laneEffectEnabledRef.current) {
            updateLaneEffect(
              laneEffects[lane],
              effectAnimationDeltaSeconds,
              effectPlaybackState.isPlaying,
            );
          } else {
            clearLaneEffect(laneEffects[lane]);
          }
        }
        for (const display of hitEffects.values()) {
          updateHitEffect(display, effectAnimationTimeSeconds, currentNoteScale);
        }
        for (const display of swipeEffects.values()) {
          updateSwipeEffect(
            display,
            effectAnimationTimeSeconds,
            swipeEffectTextures,
            swipeEffectSubtextures,
            localFrameTextures,
            currentNoteScale,
          );
        }

        const currentNoteSpeed = noteSpeedRef.current;
        const currentNoteApproachTimeScale = noteApproachTimeScaleRef.current;
        const arrivalSeconds = getBandoriSimulatorNoteArrivalSeconds(
          currentNoteSpeed,
          currentNoteApproachTimeScale,
        );
        updateVisibleRibbonIndexes(presentationTime, arrivalSeconds);
        visibleRibbons.length = 0;
        for (const ribbonIndex of visibleRibbonIndexes) {
          const ribbon = ribbonByIndex.get(ribbonIndex);
          if (ribbon) visibleRibbons.push(ribbon);
        }
        const holdStates = collectBandoriNativeHoldStates(
          chartVisuals,
          presentationTime,
          visibleRibbons,
        );
        const currentBeat = getBandoriCompiledBeatAtTime(compiled, presentationTime);
        projectedHoldStates.clear();
        for (const state of holdStates) {
          const projection = projectBandoriNativeHoldState(
            state,
            currentBeat,
            presentationTime,
            currentNoteSpeed,
            currentNoteApproachTimeScale,
          );
          if (projection) {
            projectedHoldStates.set(state.ribbon.ribbonIndex, projection);
          }
        }
        const firstIndex = lowerBoundBandoriNoteTime(compiled.notes.times, presentationTime);
        const firstJudgmentIndex = upperBoundBandoriNoteTime(
          compiled.notes.times,
          presentationTime,
        );
        const endIndex = upperBoundBandoriNoteTime(
          compiled.notes.times,
          presentationTime + arrivalSeconds,
        );

        judgmentWindowLayer.clear();
        const showGreat = greatJudgmentWindowEnabledRef.current;
        const showPerfect = perfectJudgmentWindowEnabledRef.current;
        const showOffsetLabels = showPerfect
          && judgmentWindowOffsetLabelEnabledRef.current;
        judgmentWindowOffsetLabelLayer.visible = showOffsetLabels;
        let usedGreatOffsetLabelCount = 0;
        let usedPerfectOffsetLabelCount = 0;
        if (showGreat || showPerfect) {
          activeJudgmentCandidates.length = 0;
          for (let index = firstJudgmentIndex; index < endIndex; index += 1) {
            const candidate = judgmentCandidatesByNoteIndex[index];
            if (candidate) activeJudgmentCandidates.push(candidate);
          }
          const judgmentWindowSegments = collectBandoriNativeJudgmentWindowSegments({
            activeCandidates: activeJudgmentCandidates,
            approachTimeScale: currentNoteApproachTimeScale,
            compiled,
            minimumInputTimeSeconds: presentationTime,
            noteSpeed: currentNoteSpeed,
            priorityIndex: judgmentPriorityIndex,
            showGreat,
            showPerfect,
            slideFrameCorrectionTenths:
              slideJudgmentFrameCorrectionTenthsRef.current,
          });
          const judgmentWindowOutlineEdges =
            collectBandoriNativeJudgmentWindowOutlineEdges(
              judgmentWindowSegments,
            );
          for (const segment of judgmentWindowSegments) {
            const startLeftLane = segment.leftLane;
            const startRightLane = segment.rightLane;
            const endLeftLane = startLeftLane;
            const endRightLane = startRightLane;
            const startLeft = projectBandoriNativeTimelinePosition(
              startLeftLane,
              segment.startTimeSeconds,
              presentationTime,
              currentNoteSpeed,
              currentNoteApproachTimeScale,
            );
            const startRight = projectBandoriNativeTimelinePosition(
              startRightLane,
              segment.startTimeSeconds,
              presentationTime,
              currentNoteSpeed,
              currentNoteApproachTimeScale,
            );
            const endLeft = projectBandoriNativeTimelinePosition(
              endLeftLane,
              segment.endTimeSeconds,
              presentationTime,
              currentNoteSpeed,
              currentNoteApproachTimeScale,
            );
            const endRight = projectBandoriNativeTimelinePosition(
              endRightLane,
              segment.endTimeSeconds,
              presentationTime,
              currentNoteSpeed,
              currentNoteApproachTimeScale,
            );
            judgmentWindowLayer
              .poly([
                startLeft.screenX,
                startLeft.screenY,
                startRight.screenX,
                startRight.screenY,
                endRight.screenX,
                endRight.screenY,
                endLeft.screenX,
                endLeft.screenY,
              ])
              .fill({
                alpha: JUDGMENT_WINDOW_ALPHA,
                color: segment.category === "perfect"
                  ? PERFECT_JUDGMENT_WINDOW_COLOR
                  : GREAT_JUDGMENT_WINDOW_COLOR,
              });
          }
          for (const category of ["perfect", "great"] as const) {
            let hasOutline = false;
            for (const edge of judgmentWindowOutlineEdges) {
              if (edge.category !== category) continue;
              const start = projectBandoriNativeTimelinePosition(
                edge.startLane,
                edge.startTimeSeconds,
                presentationTime,
                currentNoteSpeed,
                currentNoteApproachTimeScale,
              );
              const end = projectBandoriNativeTimelinePosition(
                edge.endLane,
                edge.endTimeSeconds,
                presentationTime,
                currentNoteSpeed,
                currentNoteApproachTimeScale,
              );
              judgmentWindowLayer
                .moveTo(start.screenX, start.screenY)
                .lineTo(end.screenX, end.screenY);
              hasOutline = true;
            }
            if (hasOutline) {
              judgmentWindowLayer.stroke({
                alpha: JUDGMENT_WINDOW_BORDER_ALPHA,
                color: category === "perfect"
                  ? PERFECT_JUDGMENT_WINDOW_COLOR
                  : GREAT_JUDGMENT_WINDOW_COLOR,
                width: JUDGMENT_WINDOW_BORDER_WIDTH,
              });
            }
          }
          if (showOffsetLabels) {
            const offsetLabels = collectBandoriNativeJudgmentWindowOffsetLabels({
              candidatesByNoteIndex: judgmentCandidatesByNoteIndex,
              minimumInputTimeSeconds: presentationTime,
              segments: judgmentWindowSegments,
            });
            const visibleStartY = BANDORI_NATIVE_STAGE_SIZE.height
              * JUDGMENT_WINDOW_OFFSET_LABEL_TOP_HIDDEN_RATIO;
            const judgmentLineY = projectBandoriNativeTimelinePosition(
              3,
              presentationTime,
              presentationTime,
              currentNoteSpeed,
              currentNoteApproachTimeScale,
            ).screenY;
            for (const label of offsetLabels) {
              const anchor = projectBandoriNativeTimelinePosition(
                label.lane,
                label.boundaryTimeSeconds,
                presentationTime,
                currentNoteSpeed,
                currentNoteApproachTimeScale,
              );
              if (
                anchor.screenX < 0
                || anchor.screenX > BANDORI_NATIVE_STAGE_SIZE.width
                || anchor.screenY < visibleStartY
                || anchor.screenY > BANDORI_NATIVE_STAGE_SIZE.height
              ) {
                continue;
              }
              const pool = judgmentWindowOffsetLabelPools[label.category];
              const poolIndex = label.category === "perfect"
                ? usedPerfectOffsetLabelCount++
                : usedGreatOffsetLabelCount++;
              let display = pool[poolIndex];
              if (!display) {
                display = createJudgmentWindowOffsetLabelText(
                  label.category,
                  app.renderer.resolution,
                );
                pool.push(display);
                judgmentWindowOffsetLabelLayer.addChild(display);
              }
              if (display.resolution !== app.renderer.resolution) {
                display.resolution = app.renderer.resolution;
              }
              const text = formatBandoriNativeJudgmentWindowOffsetFrames(
                label.offsetFrames,
              );
              if (display.text !== text) display.text = text;
              const labelFontSize = getJudgmentWindowOffsetLabelFontSize(
                anchor.screenY,
                visibleStartY,
                judgmentLineY,
              );
              const labelLayoutScale = labelFontSize
                / JUDGMENT_WINDOW_OFFSET_LABEL_MAX_FONT_SIZE;
              display.scale.set(
                labelFontSize / JUDGMENT_WINDOW_OFFSET_LABEL_BASE_FONT_SIZE,
              );
              const halfWidth = display.width / 2;
              const halfHeight = display.height / 2;
              const direction = label.side === "fast" ? -1 : 1;
              const preferredY = anchor.screenY + direction * (
                halfHeight
                  + JUDGMENT_WINDOW_OFFSET_LABEL_GAP * labelLayoutScale
              );
              const screenX = Math.min(
                BANDORI_NATIVE_STAGE_SIZE.width - halfWidth,
                Math.max(halfWidth, anchor.screenX),
              );
              const screenY = Math.min(
                BANDORI_NATIVE_STAGE_SIZE.height - halfHeight,
                Math.max(halfHeight, preferredY),
              );
              display.position.set(screenX, screenY);
              display.visible = true;
            }
            for (
              let index = usedPerfectOffsetLabelCount;
              index < judgmentWindowOffsetLabelPools.perfect.length;
              index += 1
            ) {
              judgmentWindowOffsetLabelPools.perfect[index].visible = false;
            }
            for (
              let index = usedGreatOffsetLabelCount;
              index < judgmentWindowOffsetLabelPools.great.length;
              index += 1
            ) {
              judgmentWindowOffsetLabelPools.great[index].visible = false;
            }
          }
        }

        const activeHoldIndexes = new Set<number>();
        for (const state of tapEffectEnabled ? holdStates : []) {
          const projection = projectedHoldStates.get(state.ribbon.ribbonIndex);
          if (!projection) continue;
          let flashTexture: Texture | undefined;
          let flashAnchorX = 0.5;
          let flashAnchorY = 0.5;
          if (projection.flashCoveredLanes.length > 1) {
            const flashName = getBandoriHabahiroLongFlashSpriteName(
              projection.flashCoveredLanes,
            );
            const flash = habahiroTextures.get(flashName);
            flashTexture = flash?.texture;
            flashAnchorX = flash?.anchorX ?? 0.5;
            flashAnchorY = flash?.anchorY ?? 0.5;
          } else {
            const lane = projection.flashCoveredLanes[0];
            flashTexture = longFlashTextures[lane];
            const anchor = getNativeSpriteAnchor(
              noteSpriteAnchors,
              `note_long_flash_${lane}`,
            );
            flashAnchorX = anchor.x;
            flashAnchorY = anchor.y;
          }
          if (!flashTexture) continue;
          const holdRangeWidth = state.ribbon.kind === "long"
            ? state.ribbon.rangeWidth
            : 1;
          const longEffectProjection = state.ribbon.kind === "long"
            ? projectBandoriNativeNote(
                projection.lane,
                presentationTime,
                presentationTime,
                currentNoteSpeed,
                currentNoteApproachTimeScale,
              )
            : null;
          const effectScreenX = longEffectProjection?.screenX ?? projection.screenX;
          const effectScreenY = longEffectProjection?.screenY ?? projection.screenY;
          activeHoldIndexes.add(state.ribbon.ribbonIndex);
          let display = holdEffects.get(state.ribbon.ribbonIndex);
          if (!display) {
            const seed = getBandoriNativeHoldEffectSeed(state.ribbon.ribbonIndex);
            display = createHoldEffectDisplay(
              flashTexture,
              flashAnchorX,
              flashAnchorY,
              tapEffects?.recipes.get("tap:hold") ?? null,
              seed,
              state.ribbon.kind,
              holdRangeWidth,
              state.elapsedSeconds / effectPlaybackState.playbackRate,
              lowHitEffectLayer,
              highHitEffectLayer,
              touchingFlashLayer,
            );
            holdEffects.set(state.ribbon.ribbonIndex, display);
          } else {
            display.animationElapsedSeconds += effectAnimationDeltaSeconds;
          }
          updateHoldEffect(
            display,
            display.animationElapsedSeconds,
            effectScreenX,
            effectScreenY,
            projection.screenX,
            projection.screenY,
            projection.spritePixelScale,
            flashTexture,
            flashAnchorX,
            flashAnchorY,
            swipeEffectTextures,
            swipeEffectSubtextures,
            localFrameTextures,
            currentNoteScale,
          );
        }
        for (const [ribbonIndex, display] of holdEffects) {
          if (activeHoldIndexes.has(ribbonIndex)) continue;
          destroyHoldEffect(display);
          holdEffects.delete(ribbonIndex);
        }

        const useAdvancedMesh = isBandoriNativeAdvancedNoteSpeed(currentNoteSpeed);
        for (const ribbonIndex of renderedRibbonIndexes) {
          if (visibleRibbonIndexes.has(ribbonIndex)) continue;
          for (const segment of ribbonSegmentsByIndex.get(ribbonIndex) ?? []) {
            segment.ordinary.mesh.visible = false;
            segment.advanced.mesh.visible = false;
          }
          renderedRibbonIndexes.delete(ribbonIndex);
        }
        for (const ribbonIndex of visibleRibbonIndexes) {
          renderedRibbonIndexes.add(ribbonIndex);
          for (const segment of ribbonSegmentsByIndex.get(ribbonIndex) ?? []) {
          const start = projectBandoriNativeRibbonPoint(
            segment.ribbon,
            segment.ribbonPointIndex,
            currentBeat,
            presentationTime,
            currentNoteSpeed,
            0,
            currentNoteApproachTimeScale,
          );
          const end = projectBandoriNativeRibbonPoint(
            segment.ribbon,
            segment.ribbonPointIndex + 1,
            currentBeat,
            presentationTime,
            currentNoteSpeed,
            0,
            currentNoteApproachTimeScale,
          );
          const selected = useAdvancedMesh ? segment.advanced : segment.ordinary;
          const deferred = useAdvancedMesh ? segment.ordinary : segment.advanced;
          deferred.mesh.visible = false;
          selected.mesh.visible = start !== null && end !== null;
          if (!start || !end) continue;
          updateBandoriNativeRibbonMeshVertices(
            selected.geometry,
            {
              halfWidth: start.worldScale
                * BANDORI_NATIVE_NOTE_PIXELS_PER_UNIT
                * segment.start.meshWidthRate
                * currentNoteScale,
              x: start.screenX,
              y: start.screenY,
            },
            {
              halfWidth: end.worldScale
                * BANDORI_NATIVE_NOTE_PIXELS_PER_UNIT
                * segment.end.meshWidthRate
                * currentNoteScale,
              x: end.screenX,
              y: end.screenY,
            },
          );
          }
        }

        desiredNoteGeneration = (desiredNoteGeneration + 1) >>> 0;
        if (desiredNoteGeneration === 0) {
          desiredNoteMarks.fill(0);
          desiredNoteGeneration = 1;
        }
        desiredNoteIndexes.length = 0;
        for (let index = firstIndex; index < endIndex; index += 1) {
          if (chartVisuals.notes[index]) markDesiredNote(index);
        }
        for (const ribbonIndex of visibleRibbonIndexes) {
          const noteIndexes = ribbonNoteIndexes.get(ribbonIndex);
          if (!noteIndexes) continue;
          const ribbon = ribbonByIndex.get(ribbonIndex);
          const firstPoint = ribbon?.points[0];
          const lastPoint = ribbon?.points.at(-1);
          if (
            !firstPoint
            || !lastPoint
            || presentationTime < firstPoint.time - arrivalSeconds
            || presentationTime > lastPoint.time
          ) {
            continue;
          }
          for (const noteIndex of noteIndexes) markDesiredNote(noteIndex);
        }

        for (const [index, display] of activeNotes) {
          if (desiredNoteMarks[index] !== desiredNoteGeneration) {
            removeNoteGroup(index, display);
          }
        }

        desiredNoteIndexes.sort((left, right) => left - right);
        for (const index of desiredNoteIndexes) {
          const group = chartVisuals.notes[index];
          if (!group) continue;
          let display = activeNotes.get(index);
          if (!display) {
            const primaryVisual = group.visuals[0];
            const isRhythmSupportNote = isBandoriNativeRhythmSupportNote(
              compiled,
              chartVisuals,
              index,
            );
            const rhythmSupportTexture = isRhythmSupportNote
              && (primaryVisual.coveredLanes?.length ?? 1) === 1
              ? rhythmSupportTextures[primaryVisual.lane] ?? null
              : null;
            display = createNoteGroupDisplay(
              group,
              frameTextures,
              habahiroTextures,
              noteSpriteAnchors,
              rhythmSupportTexture,
              isRhythmSupportNote,
              directionalLineLeftTexture,
              directionalLineRightTexture,
              directionalLineLeftShader,
              directionalLineRightShader,
            );
            activeNotes.set(index, display);
            for (const connector of display.connectors) {
              directionalLineLayer.addChild(connector.mesh);
            }
            for (const note of display.notes) noteLayer.addChild(note.container);
          }

          let isGroupVisible = true;
          for (const note of display.notes) {
            const useRhythmSupport = rhythmSupportEnabledRef.current
              && note.rhythmSupportTexture
              && note.rhythmSupportAnchor;
            let bodyTexture = useRhythmSupport
              ? note.rhythmSupportTexture!
              : note.baseBodyTexture;
            let bodyAnchorX = useRhythmSupport
              ? note.rhythmSupportAnchor!.x
              : note.baseBodyAnchor.x;
            let bodyAnchorY = useRhythmSupport
              ? note.rhythmSupportAnchor!.y
              : note.baseBodyAnchor.y;
            const ribbonNode = ribbonPointByNoteIndex[index];
            const ribbonPoint = ribbonNode?.ribbon.points[ribbonNode.pointIndex];
            const holdProjection = ribbonNode && ribbonNode.pointIndex === 0
              ? projectedHoldStates.get(ribbonNode.ribbon.ribbonIndex)
              : undefined;
            const projected = holdProjection
              ?? (ribbonNode && ribbonPoint
                ? projectBandoriNativeRibbonBody(
                  ribbonNode.ribbon,
                  ribbonNode.pointIndex,
                  currentBeat,
                  presentationTime,
                  currentNoteSpeed,
                  note.visual.lane - ribbonPoint.lane,
                  currentNoteApproachTimeScale,
                )
                : projectBandoriNativeNote(
                  note.visual.lane,
                  compiled.notes.times[index],
                  presentationTime,
                  currentNoteSpeed,
                  currentNoteApproachTimeScale,
                ));
            if (
              !useRhythmSupport
              && note.visual.body === "long"
              && ribbonNode?.ribbon.kind === "slide"
              && ribbonNode.pointIndex === 0
            ) {
              const coveredLanes = holdProjection?.flashCoveredLanes;
              if (coveredLanes?.length === 1) {
                const frameId = getBandoriNativeLongBodyFrameId(coveredLanes[0]);
                bodyTexture = frameTextures.get(frameId) ?? bodyTexture;
                const anchor = getNativeSpriteAnchor(noteSpriteAnchors, frameId);
                bodyAnchorX = anchor.x;
                bodyAnchorY = anchor.y;
              } else if (coveredLanes && coveredLanes.length > 1) {
                const bodyName = getBandoriHabahiroLongBodySpriteName(coveredLanes);
                const body = habahiroTextures.get(bodyName);
                if (body) {
                  bodyTexture = body.texture;
                  bodyAnchorX = body.anchorX;
                  bodyAnchorY = body.anchorY;
                }
              }
            }
            note.body.texture = bodyTexture;
            note.body.anchor.set(bodyAnchorX, bodyAnchorY);
            note.projected = projected;
            note.container.visible = ribbonNode
              ? isBandoriNativeRibbonPointBodyVisible(projected)
              : projected !== null;
            if (!projected) {
              isGroupVisible = false;
              continue;
            }
            note.container.position.set(projected.screenX, projected.screenY);
            note.body.scale.set(projected.spritePixelScale * currentNoteScale);

            if (note.icon && note.visual.icon) {
              note.icon.scale.set(projected.spritePixelScale * currentNoteScale);
              if (note.visual.icon === "flick") {
                note.icon.position.set(
                  projected.iconOffsetX * currentNoteScale,
                  projected.iconOffsetY * currentNoteScale,
                );
              } else {
                const offset = getBandoriDirectionalFlickIconOffset(
                  note.visual.direction,
                  projected,
                  compiled.notes.times[index],
                  presentationTime,
                );
                note.icon.position.set(
                  offset.x * currentNoteScale,
                  offset.y * currentNoteScale,
                );
              }
            }
          }

          for (const connector of display.connectors) {
            const left = display.notes.find(
              (note) => note.visual.lane === connector.connector.leftLane,
            );
            const right = display.notes.find(
              (note) => note.visual.lane === connector.connector.rightLane,
            );
            const leftProjection = left?.projected;
            const rightProjection = right?.projected;
            connector.mesh.visible = isGroupVisible
              && leftProjection !== null
              && leftProjection !== undefined
              && rightProjection !== null
              && rightProjection !== undefined;
            if (!connector.mesh.visible || !leftProjection || !rightProjection) continue;
            updateBandoriNativeDirectionalConnectorVertices(
              connector.vertices,
              { x: leftProjection.screenX, y: leftProjection.screenY },
              { x: rightProjection.screenX, y: rightProjection.screenY },
              0.75
                * leftProjection.worldScale
                * BANDORI_NATIVE_NOTE_PIXELS_PER_UNIT
                * currentNoteScale,
            );
          }
        }

        desiredSyncLines.clear();
        if (syncLineEnabledRef.current) {
          for (const noteIndex of desiredNoteIndexes) {
            for (const display of syncLinesByNoteIndex[noteIndex] ?? []) {
              desiredSyncLines.add(display);
            }
          }
        }
        for (const display of visibleSyncLines) {
          if (desiredSyncLines.has(display)) continue;
          display.sprite.visible = false;
          visibleSyncLines.delete(display);
        }
        for (const display of desiredSyncLines) {
          updateSyncLine(display, activeNotes, true, currentNoteScale);
          visibleSyncLines.add(display);
        }

        if (effectPlaybackState.isPlaying) {
          if (laneEffectEnabledRef.current) {
            const laneEffectEvents = collectBandoriNativeLaneEffectEvents(
              compiled,
              chartVisuals,
              lastEffectTimeSeconds,
              presentationTime,
              ribbonByIndex,
            );
            for (const event of laneEffectEvents) {
              const laneEffect = laneEffects[event.lane];
              if (!laneEffect) continue;
              if (event.action === "off") clearLaneEffect(laneEffect);
              else triggerLaneEffect(laneEffect);
            }
          }
          const events = collectBandoriNativeHitEvents(
            compiled,
            chartVisuals,
            lastEffectTimeSeconds,
            presentationTime,
          );
          for (const event of events) {
            const projection = projectBandoriNativeNote(
              event.visualLane,
              event.timeSeconds,
              event.timeSeconds,
              currentNoteSpeed,
            );
            const laneEffect = laneEffects[event.buttonLane];
            if (!projection || !laneEffect) continue;
            const terminalScreenX = event.terminalVisualLane === null
              ? projection.screenX
              : projection.screenX
                + (event.terminalVisualLane - event.visualLane)
                * BANDORI_NATIVE_JUDGMENT_LANE_SPACING_PIXELS;

            if (event.kind.startsWith("directional-")) {
              const variant = directionalEffectVariantRef.current;
              if (variant === "off") continue;
              const recipeKey = getDirectionalEffectRecipeKey(event.kind);
              const semantic = getDirectionalEffectRecipeMapKey(variant, recipeKey);
              const recipe = directionalEffects?.recipes.get(semantic);
              if (!recipe) {
                throw new BandoriNativeNoteContractError(
                  `Directional performance effect recipe is absent: ${semantic}`,
                );
              }
              const key = `directional:${semantic}:${event.buttonLane}:${event.rangeWidth}`;
              let display = swipeEffects.get(key);
              if (!display) {
                display = createLimitedEffectDisplay(
                  recipe,
                  null,
                  event.buttonLane,
                  event.rangeWidth,
                  lowHitEffectLayer,
                  highHitEffectLayer,
                  event.kind as BandoriNativeSwipeEffectKind,
                );
                swipeEffects.set(key, display);
              }
              triggerSwipeEffect(
                display,
                event,
                projection.screenX,
                projection.screenY,
                terminalScreenX,
                projection.screenY,
                effectAnimationTimeSeconds,
                swipeEffectTextures,
                swipeEffectSubtextures,
                localFrameTextures,
                currentNoteScale,
                limitedEffectSeed(event.index, event.buttonLane, semantic),
              );

              if (event.fingerKind) {
                const fingerRecipeKey = getDirectionalEffectRecipeKey(event.fingerKind);
                const fingerSemantic = getDirectionalEffectRecipeMapKey(
                  variant,
                  fingerRecipeKey,
                );
                const fingerRecipe = directionalEffects?.recipes.get(fingerSemantic);
                if (!fingerRecipe) {
                  throw new BandoriNativeNoteContractError(
                    `Directional performance finger recipe is absent: ${fingerSemantic}`,
                  );
                }
                const fingerKey = `directional:${fingerSemantic}:${event.buttonLane}:${event.rangeWidth}`;
                let fingerDisplay = swipeEffects.get(fingerKey);
                if (!fingerDisplay) {
                  fingerDisplay = createLimitedEffectDisplay(
                    fingerRecipe,
                    null,
                    event.buttonLane,
                    event.rangeWidth,
                    lowHitEffectLayer,
                    highHitEffectLayer,
                    event.fingerKind as BandoriNativeSwipeEffectKind,
                  );
                  swipeEffects.set(fingerKey, fingerDisplay);
                }
                triggerSwipeEffect(
                  fingerDisplay,
                  event,
                  projection.screenX,
                  projection.screenY,
                  projection.screenX,
                  projection.screenY,
                  effectAnimationTimeSeconds,
                  swipeEffectTextures,
                  swipeEffectSubtextures,
                  localFrameTextures,
                  currentNoteScale,
                  limitedEffectSeed(event.index, event.buttonLane, fingerSemantic),
                );
              }
              continue;
            }

            if (!tapEffectEnabled) continue;

            if (tapEffects) {
              const semantic = getLimitedMainEffectRecipeKey(event.kind);
              const recipe = tapEffects.recipes.get(semantic);
              if (!recipe) {
                throw new BandoriNativeNoteContractError(
                  `Tap effect recipe is absent: ${semantic}`,
                );
              }
              const key = `limited:${semantic}:${event.buttonLane}:${event.rangeWidth}`;
              let display = swipeEffects.get(key);
              if (!display) {
                display = createLimitedEffectDisplay(
                  recipe,
                  tapEffects.animatedVerticalBeam?.recipeKey === semantic
                    ? tapEffects.animatedVerticalBeam
                    : null,
                  event.buttonLane,
                  event.rangeWidth,
                  lowHitEffectLayer,
                  highHitEffectLayer,
                );
                swipeEffects.set(key, display);
              }
              triggerSwipeEffect(
                display,
                event,
                projection.screenX,
                projection.screenY,
                terminalScreenX,
                projection.screenY,
                effectAnimationTimeSeconds,
                swipeEffectTextures,
                swipeEffectSubtextures,
                localFrameTextures,
                currentNoteScale,
                limitedEffectSeed(event.index, event.buttonLane, semantic),
              );
              continue;
            }

            if (event.kind === "normal" || event.kind === "skill") {
              const key = `${event.kind}:${event.buttonLane}:${event.rangeWidth}`;
              let display = hitEffects.get(key);
              if (!display) {
                display = createHitEffectDisplay(
                  event.kind,
                  event.rangeWidth,
                  hitEffectTextures,
                  lowHitEffectLayer,
                  highHitEffectLayer,
                );
                hitEffects.set(key, display);
              }
              triggerHitEffect(
                display,
                event as BandoriNativeHitEvent & { kind: BandoriNativeTapHitEffectKind },
                projection.screenX,
                projection.screenY,
                effectAnimationTimeSeconds,
                currentNoteScale,
              );
            } else {
              const key = `${event.kind}:${event.buttonLane}:${event.rangeWidth}`;
              let display = swipeEffects.get(key);
              if (!display) {
                display = createSwipeEffectDisplay(
                  event.kind,
                  event.buttonLane,
                  event.rangeWidth,
                  lowHitEffectLayer,
                  highHitEffectLayer,
                );
                swipeEffects.set(key, display);
              }
              triggerSwipeEffect(
                display,
                event,
                projection.screenX,
                projection.screenY,
                terminalScreenX,
                projection.screenY,
                effectAnimationTimeSeconds,
                swipeEffectTextures,
                swipeEffectSubtextures,
                localFrameTextures,
                currentNoteScale,
              );
            }
          }
          if (events.length > 0) {
            triggerPerfectJudgment(perfectJudgment, effectAnimationTimeSeconds);
          }
        }

        const currentCombo = upperBoundBandoriNoteTime(
          compiled.notes.times,
          presentationTime,
        );
        const shouldAnimateCombo = effectPlaybackState.isPlaying
          && !didResetTimeline
          && currentCombo !== combo.lastCombo;
        setComboValue(
          combo,
          currentCombo,
          effectAnimationTimeSeconds,
          shouldAnimateCombo,
        );
        setComboValue(
          allPerfectCombo,
          currentCombo,
          effectAnimationTimeSeconds,
          shouldAnimateCombo,
        );
        updateComboDisplay(combo, effectAnimationTimeSeconds, 1);
        updateComboDisplay(
          allPerfectCombo,
          effectAnimationTimeSeconds,
          evaluateBandoriNativeAllPerfectComboAlpha(effectAnimationTimeSeconds),
        );
        allPerfectCombo.root.visible = currentCombo > 0;
        updatePerfectJudgment(perfectJudgment, effectAnimationTimeSeconds);
        lastEffectTimeSeconds = presentationTime;
      };

      const renderStageFrame = () => {
        renderNotes();
        const nowMs = performance.now();
        const sample = renderFpsSampleRef.current;
        if (sample.startedAtMs === null) {
          sample.startedAtMs = nowMs;
          sample.frameCount = 1;
          return;
        }
        sample.frameCount += 1;
        const elapsedMs = nowMs - sample.startedAtMs;
        if (elapsedMs < RENDER_FPS_SAMPLE_INTERVAL_MS) return;
        onRenderFpsChange(Math.round(sample.frameCount * 1000 / elapsedMs));
        sample.frameCount = 0;
        sample.startedAtMs = nowMs;
      };

      resizeBandoriNativeStageRenderer(app, resolutionScaleRef.current);
      app.ticker.maxFPS = getBandoriSimulatorTickerMaxFps(
        frameRateLimitRef.current,
      );
      applicationRef.current = app;
      renderNotes();
      app.ticker.add(renderStageFrame);
      if (isActiveRef.current) {
        renderFpsSampleRef.current = {
          frameCount: 0,
          startedAtMs: performance.now(),
        };
        app.start();
      }
      setStatus("ready");
      onLoadProgress({
        completedResources: loadedResourceTotal ?? 0,
        loadId,
        phase: "ready",
        totalResources: loadedResourceTotal,
      });
    };

    void initialize().catch((error: unknown) => {
      failStage(
        error instanceof BandoriNativeNoteContractError
          ? "noteContractError"
          : "resourceError",
        loadedResourceTotal ?? 0,
        loadedResourceTotal,
      );
    });
    return () => {
      disposed = true;
      destroyApp();
    };
  }, [
    backgroundSkin,
    compiled,
    directionalEffectEnabled,
    directionalFlickSkin,
    fieldSkin,
    getEffectPlaybackState,
    getPresentationTime,
    limitedPerformanceSkin,
    loadId,
    noteSkin,
    onLoadProgress,
    onRenderFpsChange,
    resolveAssetUrl,
    tapEffectContract,
    tapEffectEnabled,
  ]);

  const statusLabel: string | null = status === "rendererError"
    ? rendererErrorLabel
    : status === "resourceError"
      ? resourceErrorLabel
      : status === "noteContractError"
        ? noteContractErrorLabel
        : null;

  return (
    <div>
      <div
        ref={containerRef}
        role="img"
        aria-label={ariaLabel}
        className="relative w-full overflow-hidden rounded-2xl bg-[var(--theme-color-control-background-muted)] ring-1 ring-inset ring-[var(--theme-color-border-subtle)]"
        style={{
          aspectRatio: `${BANDORI_NATIVE_STAGE_SIZE.width} / ${BANDORI_NATIVE_STAGE_SIZE.height}`,
        }}
      />
      {statusLabel ? (
        <p
          aria-live="polite"
          className="mt-2 text-sm text-[var(--theme-color-text-muted)]"
        >
          {statusLabel}
        </p>
      ) : null}
    </div>
  );
}
