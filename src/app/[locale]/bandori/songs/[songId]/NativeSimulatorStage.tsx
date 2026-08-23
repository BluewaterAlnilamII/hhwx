"use client";

import { useEffect, useRef, useState } from "react";
import {
  Application,
  Assets,
  Container,
  GlProgram,
  GpuProgram,
  Matrix,
  MeshSimple,
  Rectangle,
  Shader,
  Sprite,
  Texture,
} from "pixi.js";
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
  getBandoriHabahiroLongFlashSpriteName,
  getBandoriHabahiroRhythmSpriteName,
  getBandoriHabahiroSpriteUrl,
  isBandoriHabahiroMultiRangeFlickIcon,
  getBandoriNativeIconFrameId,
  getBandoriNativeLongFlashUrl,
  getBandoriNativeNoteFrame,
  getBandoriNativeNoteFrameUrl,
  getBandoriNativeRhythmSupportNoteUrl,
  type BandoriNativeDirectionalFlickSkin,
  type BandoriNativeNoteFrameId,
  type BandoriNativeNoteSkin,
} from "./native-note-assets";
import type { BandoriLimitedPerformanceSkin } from "./limited-performance-skins";
import type {
  BandoriChartSimulatorAssetResolver,
} from "@/lib/bandori/chart-simulator/asset-manifest";
import {
  BANDORI_HABAHIRO_SPRITES,
  type BandoriHabahiroSpriteName,
} from "./habahiro-note-assets";

type NativeSimulatorStageProps = {
  allPerfectStatusEnabled: boolean;
  ariaLabel: string;
  backgroundSkin: BandoriNativeBackgroundSkin;
  compiled: CompiledBandoriChart;
  directionalFlickSkin: BandoriNativeDirectionalFlickSkin;
  fieldSkin: BandoriNativeFieldSkin;
  getEffectPlaybackState: () => NativeSimulatorEffectPlaybackState;
  getPresentationTime: () => number;
  isActive: boolean;
  isMirrored: boolean;
  laneEffectEnabled: boolean;
  limitedPerformanceSkin: BandoriLimitedPerformanceSkin | null;
  loadId: string;
  noteApproachTimeScale: number;
  noteSpeed: number;
  noteSkin: BandoriNativeNoteSkin;
  noteContractErrorLabel: string;
  onLoadProgress: (progress: NativeSimulatorStageLoadProgress) => void;
  rendererErrorLabel: string;
  resourceErrorLabel: string;
  resolveAssetUrl: BandoriChartSimulatorAssetResolver;
  rhythmSupportEnabled: boolean;
  syncLineEnabled: boolean;
};

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
  lane: number;
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

type LoadedLimitedPerformanceEffects = {
  animatedVerticalBeam: Readonly<{
    hierarchyPath: string;
    recipeKey: string;
    travelSpeedMultiplier: number;
  }> | null;
  recipes: ReadonlyMap<string, BandoriCompiledEffectRecipe>;
  textures: ReadonlyMap<string, Texture>;
  usesDirectionalFlickEffect: boolean;
  usesTapEffect: boolean;
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

async function loadLimitedPerformanceEffects(
  skin: BandoriLimitedPerformanceSkin | null,
  loadJson: (logicalUrl: string) => Promise<unknown>,
  loadTexture: (logicalUrl: string) => Promise<Texture>,
): Promise<LoadedLimitedPerformanceEffects | null> {
  if (!skin?.effects) return null;
  const effects = skin.effects;
  const recipeUrls = {
    ...Object.fromEntries(
      Object.entries(effects.recipes).map(([key, url]) => [`tap:${key}`, url]),
    ),
    ...Object.fromEntries(
      Object.entries(effects.directionalRecipes).map(
        ([key, url]) => [`directional:${key}`, url],
      ),
    ),
  };
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
    usesDirectionalFlickEffect: skin.coverage.includes("directionalFlickEffect"),
    usesTapEffect: skin.coverage.includes("tapEffect"),
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
  if (kind.startsWith("directional-")) {
    return `directional:${kind.slice("directional-".length)}`;
  }
  throw new BandoriNativeNoteContractError(
    `Limited performance effect kind is unsupported: ${kind}`,
  );
}

function getLimitedFingerEffectRecipeKey(kind: string): string {
  if (!kind.startsWith("directional-")) {
    throw new BandoriNativeNoteContractError(
      `Limited performance finger effect kind is unsupported: ${kind}`,
    );
  }
  return `directional:${kind.slice("directional-".length)}`;
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
  animatedVerticalBeam: LoadedLimitedPerformanceEffects["animatedVerticalBeam"],
  lane: number,
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
    animatedVerticalBeam: animatedVerticalBeam
      ? {
          hierarchyPath: animatedVerticalBeam.hierarchyPath,
          initialScreenY: null,
          travelSpeedMultiplier: animatedVerticalBeam.travelSpeedMultiplier,
        }
      : null,
    high,
    isNativeDefault: false,
    kind: "flick",
    lane,
    low,
    placement: getBandoriEffectRecipePlacement(recipe, lane),
    rangeWidth,
    runtime: createBandoriEffectRecipeRuntime(recipe, { buttonIndex: lane, seed: 0 }),
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

function updateHitEffect(display: HitEffectDisplay, animationTimeSeconds: number): void {
  if (display.triggerAnimationTimeSeconds === null) return;
  const elapsedSeconds = animationTimeSeconds - display.triggerAnimationTimeSeconds;
  if (elapsedSeconds < 0 || elapsedSeconds >= BANDORI_NATIVE_HIT_EFFECT_MAX_SECONDS) {
    clearHitEffect(display);
    return;
  }
  display.low.visible = true;
  display.high.visible = true;

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
  updateHitEffect(display, animationTimeSeconds);
}

function getParticleEffectFrameTexture(
  instance: BandoriEffectFrameInstance,
  textures: ReadonlyMap<string, Texture>,
  subtextures: Map<string, Texture>,
  ownedTextures: Texture[],
): Texture {
  if (instance.textureResource === "directional-set1") {
    const texture = textures.get(`directional-set1:${instance.uv.index}`);
    if (!texture) {
      throw new BandoriNativeNoteContractError(
        `Directional effect frame ${instance.uv.index} is absent`,
      );
    }
    return texture;
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
  lane: number,
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
    high,
    isNativeDefault: true,
    kind,
    lane,
    low,
    placement: getBandoriNativeSwipeEffectPlacement(kind, lane),
    rangeWidth,
    runtime: createBandoriNativeSwipeEffectRuntime(kind, lane, 0),
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
  seedOverride?: number,
): void {
  if (display.rangeWidth !== event.rangeWidth) {
    throw new BandoriNativeNoteContractError("Swipe-effect display width does not match its event");
  }
  if (display.animatedVerticalBeam) display.animatedVerticalBeam.initialScreenY = null;
  display.runtime.setButtonIndex(display.lane);
  display.runtime.play(
    0,
    seedOverride ?? getBandoriNativeSwipeEffectSeed(event.index, event.lane, display.kind),
  );
  display.triggerAnimationTimeSeconds = animationTimeSeconds;
  display.low.position.set(screenX, screenY);
  display.high.position.set(screenX, screenY);
  display.terminalOffsetX = terminalScreenX - screenX;
  display.terminalOffsetY = terminalScreenY - screenY;
  updateSwipeEffect(
    display,
    animationTimeSeconds,
    textures,
    subtextures,
    ownedTextures,
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
): void {
  const frame = display.runtime.sample(elapsedSeconds);
  display.low.position.set(effectScreenX, effectScreenY);
  display.high.position.set(effectScreenX, effectScreenY);
  display.low.visible = true;
  display.high.visible = true;
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
  display.flash.scale.set(spritePixelScale);
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
    * BANDORI_NATIVE_NOTE_PIXELS_PER_UNIT;
  const endX = right.projected.screenX
    - display.rightEdgeMargin
    * right.projected.worldScale
    * BANDORI_NATIVE_NOTE_PIXELS_PER_UNIT;
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
    * BANDORI_NATIVE_NOTE_PIXELS_PER_UNIT;
  display.sprite.visible = true;
}

/** Owns the fixed native coordinate space and its explicitly verified sprites. */
export default function NativeSimulatorStage({
  allPerfectStatusEnabled,
  ariaLabel,
  backgroundSkin,
  compiled,
  directionalFlickSkin,
  fieldSkin,
  getEffectPlaybackState,
  getPresentationTime,
  isActive,
  isMirrored,
  laneEffectEnabled,
  limitedPerformanceSkin,
  loadId,
  noteApproachTimeScale,
  noteSpeed,
  noteSkin,
  noteContractErrorLabel,
  onLoadProgress,
  rendererErrorLabel,
  resourceErrorLabel,
  resolveAssetUrl,
  rhythmSupportEnabled,
  syncLineEnabled,
}: NativeSimulatorStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const applicationRef = useRef<Application | null>(null);
  const allPerfectStatusEnabledRef = useRef(allPerfectStatusEnabled);
  const isActiveRef = useRef(isActive);
  const isMirroredRef = useRef(isMirrored);
  const laneEffectEnabledRef = useRef(laneEffectEnabled);
  const noteApproachTimeScaleRef = useRef(noteApproachTimeScale);
  const noteSpeedRef = useRef(noteSpeed);
  const rhythmSupportEnabledRef = useRef(rhythmSupportEnabled);
  const syncLineEnabledRef = useRef(syncLineEnabled);
  const [status, setStatus] = useState<StageStatus>("loading");

  useEffect(() => {
    allPerfectStatusEnabledRef.current = allPerfectStatusEnabled;
  }, [allPerfectStatusEnabled]);

  useEffect(() => {
    isActiveRef.current = isActive;
    const application = applicationRef.current;
    if (!application) return;
    if (isActive) application.start();
    else application.stop();
  }, [isActive]);

  useEffect(() => {
    isMirroredRef.current = isMirrored;
  }, [isMirrored]);

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
    rhythmSupportEnabledRef.current = rhythmSupportEnabled;
  }, [rhythmSupportEnabled]);

  useEffect(() => {
    syncLineEnabledRef.current = syncLineEnabled;
  }, [syncLineEnabled]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    const resourceAbortController = new AbortController();
    const localFrameTextures: Texture[] = [];
    const localShaders: Shader[] = [];
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
          backgroundAlpha: 0,
          antialias: true,
          autoStart: false,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
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
            const head = ribbon.points[0];
            if (head && head.coveredLanes.length > 1) {
              habahiroSpriteNames.add(
                getBandoriHabahiroLongFlashSpriteName(head.coveredLanes),
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
      let habahiroTextures = new Map<BandoriHabahiroSpriteName, HabahiroTexture>();
      let noteSpriteAnchors = new Map<string, NativeSpriteAnchor>();
      let limitedEffects: LoadedLimitedPerformanceEffects | null = null;
      let spriteFrameTextures = new Map<BandoriNativeNoteFrameId, Texture>();
      try {
        const usesLimitedTapEffect = limitedPerformanceSkin?.coverage.includes(
          "tapEffect",
        ) === true;
        const usesLimitedDirectionalEffect = limitedPerformanceSkin?.coverage.includes(
          "directionalFlickEffect",
        ) === true;
        const rhythmSupportUrls = Array.from(
          { length: 7 },
          (_, lane) => getBandoriNativeRhythmSupportNoteUrl(noteSkin, lane),
        );
        const longFlashUrls = Array.from(
          { length: 7 },
          (_, lane) => getBandoriNativeLongFlashUrl(noteSkin, lane),
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
          usesLimitedTapEffect ? null : BANDORI_NATIVE_TAP_EFFECT_ATLAS_1_URL,
          usesLimitedTapEffect ? null : BANDORI_NATIVE_TAP_EFFECT_ATLAS_2_URL,
          usesLimitedTapEffect
            ? null
            : BANDORI_NATIVE_SWIPE_EFFECT_TEXTURE_URLS["tap-light"],
          usesLimitedTapEffect
            ? null
            : BANDORI_NATIVE_SWIPE_EFFECT_TEXTURE_URLS["tap-circle"],
          usesLimitedTapEffect
            ? null
            : BANDORI_NATIVE_HOLD_EFFECT_TEXTURE_URLS["tap-default-particle"],
          limitedPerformanceSkin?.judgmentPerfectTextureUrl
            ?? BANDORI_NATIVE_PERFECT_JUDGMENT_URL,
          BANDORI_NATIVE_COMBO_UNIT_URL,
          BANDORI_NATIVE_ALL_PERFECT_COMBO_UNIT_URL,
          ...BANDORI_NATIVE_COMBO_DIGIT_URLS,
          ...BANDORI_NATIVE_ALL_PERFECT_COMBO_DIGIT_URLS,
          ...rhythmSupportUrls,
          ...longFlashUrls,
          ...laneEffectUrls,
          ...BANDORI_NATIVE_DIRECTIONAL_EFFECT_FRAME_URLS.map(
            (url) => usesLimitedDirectionalEffect ? null : url,
          ),
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
        const effectRecipeUrls = limitedPerformanceSkin?.effects
          ? [
              ...Object.values(limitedPerformanceSkin.effects.recipes),
              ...Object.values(limitedPerformanceSkin.effects.directionalRecipes),
            ]
          : [];
        const effectTextureUrls = limitedPerformanceSkin?.effects
          ? Object.values(limitedPerformanceSkin.effects.resources)
          : [];
        const requiredLogicalUrls = [
          ...mainTextureUrls.filter((url): url is string => url !== null),
          ...spriteFrameUrls,
          ...habahiroUrls,
          ...(noteSkin.spriteAnchorsUrl ? [noteSkin.spriteAnchorsUrl] : []),
          ...effectRecipeUrls,
          ...effectTextureUrls,
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
          const texture = await Assets.load<Texture>(resolvedUrl);
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
          loadedLimitedEffects,
          loadedSpriteFrames,
          loadedNoteSpriteAnchors,
          habahiroEntries,
        ] = await Promise.all([
          Promise.all(mainTextureUrls.map(
            (url) => url ? loadTexture(url) : Promise.resolve(Texture.EMPTY),
          )),
          loadLimitedPerformanceEffects(
            limitedPerformanceSkin,
            loadJson,
            loadTexture,
          ),
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
        limitedEffects = loadedLimitedEffects;
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
        ...directionalEffectFrameTextures
      ] = resources.slice(backgroundSkin.layers.length);
      for (const texture of resources) texture.source.scaleMode = "linear";
      for (const texture of limitedEffects?.textures.values() ?? []) {
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
      const swipeEffectTextures = new Map<string, Texture>([
        ["tap-set1", tapEffectAtlas1],
        ["tap-set2", tapEffectAtlas2],
        ["tap-light", tapEffectLight],
        ["tap-circle", tapEffectCircle],
        ["tap-default-particle", tapEffectDefaultParticle],
        ...(limitedEffects?.textures.entries() ?? []),
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
      if (!limitedEffects?.usesDirectionalFlickEffect) {
        directionalEffectFrameTextures.forEach((texture, frame) => {
          swipeEffectTextures.set(`directional-set1:${frame}`, texture);
        });
      }
      const swipeEffectSubtextures = new Map<string, Texture>();

      const directionalLineLayer = new Container();
      const syncLineLayer = new Container();
      const laneEffectLayer = new Container();
      const lowHitEffectLayer = new Container();
      const highHitEffectLayer = new Container();
      const ribbonLayer = new Container();
      const noteLayer = new Container();
      const touchingFlashLayer = new Container();
      const informationLayer = new Container();
      directionalLineLayer.eventMode = "none";
      syncLineLayer.eventMode = "none";
      laneEffectLayer.eventMode = "none";
      lowHitEffectLayer.eventMode = "none";
      highHitEffectLayer.eventMode = "none";
      ribbonLayer.eventMode = "none";
      noteLayer.eventMode = "none";
      touchingFlashLayer.eventMode = "none";
      informationLayer.eventMode = "none";
      app.stage.addChild(
        ...backgroundLayers,
        field,
        directionalLineLayer,
        syncLineLayer,
        judgmentLine,
        laneEffectLayer,
        lowHitEffectLayer,
        highHitEffectLayer,
        ribbonLayer,
        noteLayer,
        touchingFlashLayer,
        informationLayer,
      );

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
          updateHitEffect(display, effectAnimationTimeSeconds);
        }
        for (const display of swipeEffects.values()) {
          updateSwipeEffect(
            display,
            effectAnimationTimeSeconds,
            swipeEffectTextures,
            swipeEffectSubtextures,
            localFrameTextures,
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
        const firstIndex = lowerBoundBandoriNoteTime(compiled.notes.times, presentationTime);
        const endIndex = upperBoundBandoriNoteTime(
          compiled.notes.times,
          presentationTime + arrivalSeconds,
        );

        const activeHoldIndexes = new Set<number>();
        for (const state of holdStates) {
          const head = state.ribbon.points[0];
          if (!head) continue;
          const projection = projectBandoriNativeHoldState(
            state,
            currentBeat,
            presentationTime,
            currentNoteSpeed,
            currentNoteApproachTimeScale,
          );
          if (!projection) continue;
          let flashTexture: Texture | undefined;
          let flashAnchorX = 0.5;
          let flashAnchorY = 0.5;
          if (head.coveredLanes.length > 1) {
            const flashName = getBandoriHabahiroLongFlashSpriteName(head.coveredLanes);
            const flash = habahiroTextures.get(flashName);
            flashTexture = flash?.texture;
            flashAnchorX = flash?.anchorX ?? 0.5;
            flashAnchorY = flash?.anchorY ?? 0.5;
          } else {
            const lane = head.coveredLanes[0];
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
            ? head.coveredLanes.length
            : 1;
          const effectTargetLane = head.coveredLanes[(head.coveredLanes.length - 1) >> 1];
          const longEffectProjection = state.ribbon.kind === "long"
            ? projectBandoriNativeNote(
                effectTargetLane,
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
              limitedEffects?.recipes.get("tap:hold") ?? null,
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
                * segment.start.meshWidthRate,
              x: start.screenX,
              y: start.screenY,
            },
            {
              halfWidth: end.worldScale
                * BANDORI_NATIVE_NOTE_PIXELS_PER_UNIT
                * segment.end.meshWidthRate,
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
            note.body.texture = useRhythmSupport
              ? note.rhythmSupportTexture!
              : note.baseBodyTexture;
            const bodyAnchor = useRhythmSupport
              ? note.rhythmSupportAnchor!
              : note.baseBodyAnchor;
            note.body.anchor.set(bodyAnchor.x, bodyAnchor.y);
            const ribbonNode = ribbonPointByNoteIndex[index];
            const ribbonPoint = ribbonNode?.ribbon.points[ribbonNode.pointIndex];
            const projected = ribbonNode && ribbonPoint
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
              );
            note.projected = projected;
            note.container.visible = ribbonNode
              ? isBandoriNativeRibbonPointBodyVisible(projected)
              : projected !== null;
            if (!projected) {
              isGroupVisible = false;
              continue;
            }
            note.container.position.set(projected.screenX, projected.screenY);
            note.body.scale.set(projected.spritePixelScale);

            if (note.icon && note.visual.icon) {
              note.icon.scale.set(projected.spritePixelScale);
              if (note.visual.icon === "flick") {
                note.icon.position.set(projected.iconOffsetX, projected.iconOffsetY);
              } else {
                const offset = getBandoriDirectionalFlickIconOffset(
                  note.visual.direction,
                  projected,
                  compiled.notes.times[index],
                  presentationTime,
                );
                note.icon.position.set(offset.x, offset.y);
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
              0.75 * leftProjection.worldScale * BANDORI_NATIVE_NOTE_PIXELS_PER_UNIT,
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
          updateSyncLine(display, activeNotes, true);
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
              event.lane,
              event.timeSeconds,
              event.timeSeconds,
              currentNoteSpeed,
            );
            const laneEffect = laneEffects[event.lane];
            if (!projection || !laneEffect) continue;
            const terminalScreenX = event.terminalLane === null
              ? projection.screenX
              : projection.screenX
                + (event.terminalLane - event.lane)
                * BANDORI_NATIVE_JUDGMENT_LANE_SPACING_PIXELS;

            const useLimitedEffect = event.kind.startsWith("directional-")
              ? limitedEffects?.usesDirectionalFlickEffect === true
              : limitedEffects?.usesTapEffect === true;
            if (limitedEffects && useLimitedEffect) {
              const semantic = getLimitedMainEffectRecipeKey(event.kind);
              const recipe = limitedEffects.recipes.get(semantic);
              if (!recipe) {
                throw new BandoriNativeNoteContractError(
                  `Limited performance effect recipe is absent: ${semantic}`,
                );
              }
              const key = `limited:${semantic}:${event.lane}:${event.rangeWidth}`;
              let display = swipeEffects.get(key);
              if (!display) {
                display = createLimitedEffectDisplay(
                  recipe,
                  limitedEffects.animatedVerticalBeam?.recipeKey === semantic
                    ? limitedEffects.animatedVerticalBeam
                    : null,
                  event.lane,
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
                limitedEffectSeed(event.index, event.lane, semantic),
              );

              if (event.fingerKind) {
                const fingerSemantic = getLimitedFingerEffectRecipeKey(
                  event.fingerKind,
                );
                const fingerRecipe = limitedEffects.recipes.get(fingerSemantic);
                if (!fingerRecipe) {
                  throw new BandoriNativeNoteContractError(
                    `Limited performance finger recipe is absent: ${fingerSemantic}`,
                  );
                }
                const fingerKey = `limited:${fingerSemantic}:${event.lane}:${event.rangeWidth}`;
                let fingerDisplay = swipeEffects.get(fingerKey);
                if (!fingerDisplay) {
                  fingerDisplay = createLimitedEffectDisplay(
                    fingerRecipe,
                    limitedEffects.animatedVerticalBeam?.recipeKey === fingerSemantic
                      ? limitedEffects.animatedVerticalBeam
                      : null,
                    event.lane,
                    event.rangeWidth,
                    lowHitEffectLayer,
                    highHitEffectLayer,
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
                  limitedEffectSeed(event.index, event.lane, fingerSemantic),
                );
              }
              continue;
            }

            if (event.kind === "normal" || event.kind === "skill") {
              const key = `${event.kind}:${event.lane}:${event.rangeWidth}`;
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
              );
            } else {
              const key = `${event.kind}:${event.lane}:${event.rangeWidth}`;
              let display = swipeEffects.get(key);
              if (!display) {
                display = createSwipeEffectDisplay(
                  event.kind,
                  event.lane,
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
              );
            }

            if (event.fingerKind) {
              const key = `${event.fingerKind}:${event.lane}:${event.rangeWidth}`;
              let fingerDisplay = swipeEffects.get(key);
              if (!fingerDisplay) {
                fingerDisplay = createSwipeEffectDisplay(
                  event.fingerKind,
                  event.lane,
                  event.rangeWidth,
                  lowHitEffectLayer,
                  highHitEffectLayer,
                );
                swipeEffects.set(key, fingerDisplay);
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
        allPerfectCombo.root.visible = currentCombo > 0
          && allPerfectStatusEnabledRef.current;
        updatePerfectJudgment(perfectJudgment, effectAnimationTimeSeconds);
        lastEffectTimeSeconds = presentationTime;
      };

      applicationRef.current = app;
      renderNotes();
      app.ticker.add(renderNotes);
      if (isActiveRef.current) app.start();
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
    directionalFlickSkin,
    fieldSkin,
    getEffectPlaybackState,
    getPresentationTime,
    limitedPerformanceSkin,
    loadId,
    noteSkin,
    onLoadProgress,
    resolveAssetUrl,
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
