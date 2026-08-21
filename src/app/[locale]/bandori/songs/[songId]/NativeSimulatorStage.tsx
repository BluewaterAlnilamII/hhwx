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
  getBandoriApprovedManualDirectionalNotesCenterOffsetPixels,
  getBandoriApprovedManualSlashScreenY,
  getBandoriNativeSwipeEffectPlacement,
  getBandoriNativeSwipeEffectSeed,
  getBandoriNativeSwipeParticleWidthScale,
  isBandoriNativeDirectionalTerminalParticle,
  type BandoriNativeSwipeEffectKind,
} from "@/lib/bandori/chart-simulator/native-swipe-effect-presentation";
import type {
  BandoriDefaultEffectRuntime,
  BandoriEffectFrameInstance,
} from "@/lib/bandori/chart-simulator/default-effects";
import {
  BANDORI_NATIVE_BACKGROUND_RECT,
  BANDORI_NATIVE_BACKGROUND_TEXTURE_URL,
  BANDORI_NATIVE_FIELD_RECT,
  BANDORI_NATIVE_STAGE_SIZE,
  getBandoriNativeJudgmentLineRect,
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
  getBandoriNativeRhythmSupportNoteUrl,
  type BandoriNativeDirectionalFlickSkin,
  type BandoriNativeNoteFrameId,
  type BandoriNativeNoteSkin,
} from "./native-note-assets";
import {
  BANDORI_HABAHIRO_SPRITES,
  type BandoriHabahiroSpriteName,
} from "./habahiro-note-assets";

type NativeSimulatorStageProps = {
  allPerfectStatusEnabled: boolean;
  ariaLabel: string;
  compiled: CompiledBandoriChart;
  directionalFlickSkin: BandoriNativeDirectionalFlickSkin;
  fieldSkin: BandoriNativeFieldSkin;
  getEffectPlaybackState: () => NativeSimulatorEffectPlaybackState;
  getPresentationTime: () => number;
  isMirrored: boolean;
  laneEffectEnabled: boolean;
  loadingLabel: string;
  noteApproachTimeScale: number;
  noteSpeed: number;
  noteSkin: BandoriNativeNoteSkin;
  noteContractErrorLabel: string;
  readyLabel: string;
  rendererErrorLabel: string;
  resourceErrorLabel: string;
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
  baseBodyTexture: Texture;
  body: Sprite;
  container: Container;
  icon: Sprite | null;
  projected: BandoriNativeProjectedNote | null;
  rhythmSupportTexture: Texture | null;
  visual: BandoriNativeNoteVisual;
};

type HabahiroTexture = {
  anchorX: number;
  anchorY: number;
  texture: Texture;
};

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

type SwipeEffectDisplay = {
  high: Container;
  kind: BandoriNativeSwipeEffectKind;
  lane: number;
  low: Container;
  placement: ReturnType<typeof getBandoriNativeSwipeEffectPlacement>;
  rangeWidth: number;
  runtime: BandoriDefaultEffectRuntime;
  sprites: Sprite[];
  terminalOffsetX: number;
  terminalOffsetY: number;
  triggerAnimationTimeSeconds: number | null;
};

type HoldEffectDisplay = {
  animationElapsedSeconds: number;
  flash: Sprite;
  high: Container;
  low: Container;
  runtime: BandoriDefaultEffectRuntime;
  sprites: Sprite[];
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
  standardRhythmSupportTexture: Texture | null,
  isRhythmSupportNote: boolean,
): NoteDisplay {
  const habahiroBodyName = getBandoriHabahiroBodySpriteName(visual);
  const habahiroBody = habahiroBodyName ? habahiroTextures.get(habahiroBodyName) : null;
  const bodyTexture = habahiroBody?.texture
    ?? textures.get(getBandoriNativeBodyFrameId(visual));
  if (!bodyTexture) {
    throw new BandoriNativeNoteContractError("Resolved body Sprite is absent from the verified atlas frames");
  }

  const container = new Container();
  container.eventMode = "none";
  const body = new Sprite(bodyTexture);
  body.anchor.set(habahiroBody?.anchorX ?? 0.5, habahiroBody?.anchorY ?? 0.5);
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
    icon.anchor.set(habahiroIcon?.anchorX ?? 0.5, habahiroIcon?.anchorY ?? 0.5);
    icon.eventMode = "none";
    icon.tint = 0xffffff;
    icon.alpha = 1;
    container.addChild(icon);
  }

  return {
    baseBodyTexture: bodyTexture,
    body,
    container,
    icon,
    projected: null,
    rhythmSupportTexture: isRhythmSupportNote && visual.body === "normal"
      ? habahiroBodyName
        ? habahiroTextures.get(getBandoriHabahiroRhythmSpriteName(visual))?.texture ?? null
        : standardRhythmSupportTexture
      : null,
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
    high,
    kind,
    lane,
    low,
    placement: getBandoriNativeSwipeEffectPlacement(kind, lane),
    rangeWidth,
    runtime: createBandoriNativeSwipeEffectRuntime(kind, lane, 0),
    sprites: [],
    terminalOffsetX: 0,
    terminalOffsetY: 0,
    triggerAnimationTimeSeconds: null,
  };
}

function clearSwipeEffect(display: SwipeEffectDisplay): void {
  display.runtime.stop();
  display.triggerAnimationTimeSeconds = null;
  display.low.visible = false;
  display.high.visible = false;
  for (const sprite of display.sprites) sprite.visible = false;
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
  for (const sprite of display.sprites) sprite.visible = false;

  const pixelScale = BANDORI_NATIVE_BUTTON_EFFECT_PIXELS_PER_WORLD_UNIT
    / display.placement.pixelsPerWorldUnit;
  for (let index = 0; index < frame.count; index += 1) {
    const instance = frame.instances[index];
    if (
      instance.blendSource !== "src-alpha"
      || instance.blendDestination !== "one"
      || instance.blendEquation !== "add"
      || instance.premultipliedAlpha
    ) {
      throw new BandoriNativeNoteContractError(
        "Swipe-effect particle left the verified additive material profile",
      );
    }
    let sprite = display.sprites[index];
    if (!sprite) {
      sprite = new Sprite(Texture.EMPTY);
      sprite.anchor.set(0.5);
      sprite.blendMode = "add";
      sprite.eventMode = "none";
      display.sprites[index] = sprite;
    }
    const targetLayer = instance.sortingOrder >= 50 ? display.high : display.low;
    if (sprite.parent !== targetLayer) targetLayer.addChild(sprite);
    const texture = getParticleEffectFrameTexture(
      instance,
      textures,
      subtextures,
      ownedTextures,
    );
    const anchorX = isBandoriNativeDirectionalTerminalParticle(instance)
      ? display.terminalOffsetX
      : 0;
    const anchorY = isBandoriNativeDirectionalTerminalParticle(instance)
      ? display.terminalOffsetY
      : 0;
    const scaleX = instance.widthPixels / texture.orig.width
      * pixelScale
      * getBandoriNativeSwipeParticleWidthScale(
        display.kind,
        display.rangeWidth,
        instance,
      )
      * (instance.uv.flipU ? -1 : 1);
    const scaleY = instance.heightPixels / texture.orig.height
      * pixelScale
      * (instance.uv.flipV ? -1 : 1);
    const directionalNotesCenterOffsetPixels =
      getBandoriApprovedManualDirectionalNotesCenterOffsetPixels(instance);
    const particleScreenY = getBandoriApprovedManualSlashScreenY(
      display.kind,
      display.placement.screenY,
      instance,
    );
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
    sprite.tint = effectTint(instance.color.r, instance.color.g, instance.color.b);
    sprite.alpha = Math.max(0, Math.min(1, instance.color.a));
    sprite.zIndex = instance.sortingOrder * 100_000 + index;
    sprite.visible = true;
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
): void {
  if (display.rangeWidth !== event.rangeWidth) {
    throw new BandoriNativeNoteContractError("Swipe-effect display width does not match its event");
  }
  display.runtime.setButtonIndex(display.lane);
  display.runtime.play(
    0,
    getBandoriNativeSwipeEffectSeed(event.index, event.lane, display.kind),
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

  const runtime = createBandoriNativeHoldEffectRuntime(seed, { kind, rangeWidth });
  runtime.play(0, seed);
  return {
    animationElapsedSeconds: initialAnimationElapsedSeconds,
    flash,
    high,
    low,
    runtime,
    sprites: [],
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
  for (const sprite of display.sprites) sprite.visible = false;

  const pixelScale = BANDORI_NATIVE_BUTTON_EFFECT_PIXELS_PER_WORLD_UNIT
    / BANDORI_NATIVE_HOLD_EFFECT_PLACEMENT.pixelsPerWorldUnit;
  for (let index = 0; index < frame.count; index += 1) {
    const instance = frame.instances[index];
    if (
      instance.blendSource !== "src-alpha"
      || instance.blendDestination !== "one"
      || instance.blendEquation !== "add"
      || instance.premultipliedAlpha
    ) {
      throw new BandoriNativeNoteContractError(
        "TapKeep particle left the verified additive material profile",
      );
    }
    let sprite = display.sprites[index];
    if (!sprite) {
      sprite = new Sprite(Texture.EMPTY);
      sprite.anchor.set(0.5);
      sprite.blendMode = "add";
      sprite.eventMode = "none";
      display.sprites[index] = sprite;
    }
    const targetLayer = instance.sortingOrder >= 50 ? display.high : display.low;
    if (sprite.parent !== targetLayer) targetLayer.addChild(sprite);
    const texture = getParticleEffectFrameTexture(
      instance,
      textures,
      subtextures,
      ownedTextures,
    );
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
      (instance.screenX - BANDORI_NATIVE_HOLD_EFFECT_PLACEMENT.screenX) * pixelScale,
      (instance.screenY - BANDORI_NATIVE_HOLD_EFFECT_PLACEMENT.screenY) * pixelScale,
    ));
    sprite.tint = effectTint(instance.color.r, instance.color.g, instance.color.b);
    sprite.alpha = Math.max(0, Math.min(1, instance.color.a));
    sprite.zIndex = instance.sortingOrder * 100_000 + index;
    sprite.visible = true;
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
  compiled,
  directionalFlickSkin,
  fieldSkin,
  getEffectPlaybackState,
  getPresentationTime,
  isMirrored,
  laneEffectEnabled,
  loadingLabel,
  noteApproachTimeScale,
  noteSpeed,
  noteSkin,
  noteContractErrorLabel,
  readyLabel,
  rendererErrorLabel,
  resourceErrorLabel,
  rhythmSupportEnabled,
  syncLineEnabled,
}: NativeSimulatorStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const allPerfectStatusEnabledRef = useRef(allPerfectStatusEnabled);
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
    const localFrameTextures: Texture[] = [];
    const localShaders: Shader[] = [];
    let disposed = false;

    const initialize = async () => {
      try {
        await app.init({
          width: BANDORI_NATIVE_STAGE_SIZE.width,
          height: BANDORI_NATIVE_STAGE_SIZE.height,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
        });
      } catch {
        if (!disposed) setStatus("rendererError");
        return;
      }
      if (disposed) {
        app.destroy({ removeView: true }, { children: true });
        return;
      }

      app.canvas.setAttribute("aria-hidden", "true");
      app.canvas.className = "absolute inset-0 h-full w-full";
      app.canvas.style.width = "100%";
      app.canvas.style.height = "100%";
      container.appendChild(app.canvas);

      let chartVisuals: BandoriNativeChartVisuals;
      try {
        chartVisuals = prepareBandoriNativeChartVisuals(compiled, isMirrored);
      } catch (error) {
        if (error instanceof BandoriNativeNoteContractError) {
          if (!disposed) setStatus("noteContractError");
          return;
        }
        throw error;
      }

      let resources: Texture[];
      const habahiroSpriteNames = new Set<BandoriHabahiroSpriteName>();
      try {
        for (const group of chartVisuals.notes) {
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
        for (const ribbon of chartVisuals.ribbons) {
          const head = ribbon.points[0];
          if (head && head.coveredLanes.length > 1) {
            habahiroSpriteNames.add(
              getBandoriHabahiroLongFlashSpriteName(head.coveredLanes),
            );
          }
        }
      } catch {
        if (!disposed) setStatus("noteContractError");
        return;
      }
      let habahiroTextures = new Map<BandoriHabahiroSpriteName, HabahiroTexture>();
      try {
        resources = await Promise.all([
          Assets.load<Texture>(BANDORI_NATIVE_BACKGROUND_TEXTURE_URL),
          Assets.load<Texture>(fieldSkin.textureUrl),
          Assets.load<Texture>(fieldSkin.judgmentLineTextureUrl),
          Assets.load<Texture>(noteSkin.atlasUrl),
          Assets.load<Texture>(directionalFlickSkin.atlasUrl),
          Assets.load<Texture>(noteSkin.longNoteLineUrl),
          Assets.load<Texture>(noteSkin.curveSlideNoteLineUrl),
          Assets.load<Texture>(noteSkin.syncLineUrl),
          Assets.load<Texture>(directionalFlickSkin.lineLeftUrl),
          Assets.load<Texture>(directionalFlickSkin.lineRightUrl),
          Assets.load<Texture>(BANDORI_NATIVE_TAP_EFFECT_ATLAS_1_URL),
          Assets.load<Texture>(BANDORI_NATIVE_TAP_EFFECT_ATLAS_2_URL),
          Assets.load<Texture>(BANDORI_NATIVE_SWIPE_EFFECT_TEXTURE_URLS["tap-light"]),
          Assets.load<Texture>(BANDORI_NATIVE_SWIPE_EFFECT_TEXTURE_URLS["tap-circle"]),
          Assets.load<Texture>(BANDORI_NATIVE_HOLD_EFFECT_TEXTURE_URLS["tap-default-particle"]),
          Assets.load<Texture>(BANDORI_NATIVE_PERFECT_JUDGMENT_URL),
          Assets.load<Texture>(BANDORI_NATIVE_COMBO_UNIT_URL),
          Assets.load<Texture>(BANDORI_NATIVE_ALL_PERFECT_COMBO_UNIT_URL),
          ...BANDORI_NATIVE_COMBO_DIGIT_URLS.map((url) => Assets.load<Texture>(url)),
          ...BANDORI_NATIVE_ALL_PERFECT_COMBO_DIGIT_URLS.map(
            (url) => Assets.load<Texture>(url),
          ),
          ...Array.from(
            { length: 7 },
            (_, lane) => Assets.load<Texture>(getBandoriNativeRhythmSupportNoteUrl(noteSkin, lane)),
          ),
          ...Array.from(
            { length: 7 },
            (_, lane) => Assets.load<Texture>(getBandoriNativeLongFlashUrl(noteSkin, lane)),
          ),
          Assets.load<Texture>(getBandoriNativeLaneEffectUrl("NoteLaneEffect_1.png")),
          Assets.load<Texture>(getBandoriNativeLaneEffectUrl("NoteLaneEffect_2.png")),
          Assets.load<Texture>(getBandoriNativeLaneEffectUrl("NoteLaneEffect_3.png")),
          Assets.load<Texture>(getBandoriNativeLaneEffectUrl("NoteLaneEffect_4.png")),
          ...BANDORI_NATIVE_DIRECTIONAL_EFFECT_FRAME_URLS.map(
            (url) => Assets.load<Texture>(url),
          ),
        ]);
        if (habahiroSpriteNames.size > 0) {
          const entries = await Promise.all([...habahiroSpriteNames].map(async (name) => {
            const texture = await Assets.load<Texture>(getBandoriHabahiroSpriteUrl(name));
            const contract = BANDORI_HABAHIRO_SPRITES[name];
            return [name, {
              anchorX: contract.anchorX,
              anchorY: contract.anchorY,
              texture,
            }] as const;
          }));
          habahiroTextures = new Map(entries);
        }
      } catch {
        if (!disposed) setStatus("resourceError");
        return;
      }
      if (disposed) return;

      const [
        backgroundTexture,
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
      ] = resources;
      for (const texture of resources) texture.source.scaleMode = "linear";

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

      const background = new Sprite(backgroundTexture);
      background.eventMode = "none";
      background.position.set(
        BANDORI_NATIVE_BACKGROUND_RECT.left,
        BANDORI_NATIVE_BACKGROUND_RECT.top,
      );
      background.width = BANDORI_NATIVE_BACKGROUND_RECT.width;
      background.height = BANDORI_NATIVE_BACKGROUND_RECT.height;
      background.tint = 0xffffff;
      background.alpha = 1;

      const field = new Sprite(fieldTexture);
      field.eventMode = "none";
      field.position.set(BANDORI_NATIVE_FIELD_RECT.left, BANDORI_NATIVE_FIELD_RECT.top);
      field.width = BANDORI_NATIVE_FIELD_RECT.width;
      field.height = BANDORI_NATIVE_FIELD_RECT.height;

      const judgmentLine = new Sprite(judgmentLineTexture);
      const judgmentLineRect = getBandoriNativeJudgmentLineRect(
        fieldSkin.judgmentLineSpriteHeight,
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

      const usedFrameIds = new Set<BandoriNativeNoteFrameId>();
      for (const group of chartVisuals.notes) {
        if (!group) continue;
        for (const visual of group.visuals) {
          if (!getBandoriHabahiroBodySpriteName(visual)) {
            usedFrameIds.add(getBandoriNativeBodyFrameId(visual));
          }
          if (
            visual.icon
            && !isBandoriHabahiroMultiRangeFlickIcon(visual)
          ) {
            usedFrameIds.add(getBandoriNativeIconFrameId(visual.icon));
          }
        }
      }
      const frameTextures = new Map<BandoriNativeNoteFrameId, Texture>();
      try {
        for (const frameId of usedFrameIds) {
          const texture = createFrameTexture(
            standardAtlas,
            directionalAtlas,
            frameId,
            noteSkin,
            directionalFlickSkin,
          );
          frameTextures.set(frameId, texture);
          localFrameTextures.push(texture);
        }
      } catch (error) {
        if (error instanceof BandoriNativeNoteContractError) {
          if (!disposed) setStatus("noteContractError");
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
      directionalEffectFrameTextures.forEach((texture, frame) => {
        swipeEffectTextures.set(`directional-set1:${frame}`, texture);
      });
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
        background,
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
      const syncLineDisplays = collectBandoriNativeSyncLinePairs(
        compiled,
        chartVisuals,
      ).map((pair) => {
        const display = createSyncLineDisplay(
          pair,
          syncLineTexture,
          compiled,
          noteSkin,
        );
        syncLineLayer.addChild(display.sprite);
        return display;
      });
      const hitEffects = new Map<string, HitEffectDisplay>();
      const swipeEffects = new Map<string, SwipeEffectDisplay>();
      const holdEffects = new Map<number, HoldEffectDisplay>();

      const ribbonSegments: RibbonSegmentDisplay[] = [];
      for (const ribbon of chartVisuals.ribbons) {
        const texture = ribbon.isCurvedSlide
          ? curveSlideNoteLineTexture
          : longNoteLineTexture;
        for (let pointIndex = 1; pointIndex < ribbon.points.length; pointIndex += 1) {
          const ordinary = createRibbonMeshDisplay(texture, "ordinary");
          const advanced = createRibbonMeshDisplay(texture, "advanced");
          ribbonLayer.addChild(ordinary.mesh, advanced.mesh);
          ribbonSegments.push({
            advanced,
            end: ribbon.points[pointIndex],
            ordinary,
            ribbon,
            ribbonPointIndex: pointIndex - 1,
            start: ribbon.points[pointIndex - 1],
          });
        }
      }

      const ribbonByIndex = new Map(
        chartVisuals.ribbons.map((ribbon) => [ribbon.ribbonIndex, ribbon]),
      );
      const ribbonPointByNoteIndex: Array<{
        pointIndex: number;
        ribbon: BandoriNativeRibbonVisual;
      } | null> = Array.from({ length: compiled.notes.times.length }, () => null);
      const ribbonNoteIndexes = new Map<number, number[]>();
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

      const activeNotes = new Map<number, NoteGroupDisplay>();
      let effectPlaybackState = getEffectPlaybackState();
      let effectTimelineVersion = effectPlaybackState.timelineVersion;
      let lastEffectTimeSeconds = getPresentationTime();
      let effectAnimationTimeSeconds = 0;

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
        const holdStates = collectBandoriNativeHoldStates(chartVisuals, presentationTime);
        effectPlaybackState = getEffectPlaybackState();
        let didResetTimeline = false;
        const effectAnimationDeltaSeconds = effectPlaybackState.isPlaying
          ? Math.max(0, app.ticker.deltaMS / 1000)
          : 0;
        effectAnimationTimeSeconds += effectAnimationDeltaSeconds;
        if (
          effectPlaybackState.timelineVersion !== effectTimelineVersion
          || presentationTime < lastEffectTimeSeconds
        ) {
          clearEffects();
          didResetTimeline = true;
          effectTimelineVersion = effectPlaybackState.timelineVersion;
          lastEffectTimeSeconds = presentationTime;
        }
        for (let lane = 0; lane < laneEffects.length; lane += 1) {
          if (laneEffectEnabledRef.current) {
            updateLaneEffect(
              laneEffects[lane],
              app.ticker.deltaMS / 1000,
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
            flashTexture = longFlashTextures[head.coveredLanes[0]];
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
        for (const segment of ribbonSegments) {
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

        const desiredNoteIndexes = new Set<number>();
        for (let index = firstIndex; index < endIndex; index += 1) {
          if (chartVisuals.notes[index]) desiredNoteIndexes.add(index);
        }
        for (const [ribbonIndex, noteIndexes] of ribbonNoteIndexes) {
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
          for (const noteIndex of noteIndexes) desiredNoteIndexes.add(noteIndex);
        }

        for (const [index, display] of activeNotes) {
          if (!desiredNoteIndexes.has(index)) {
            removeNoteGroup(index, display);
          }
        }

        for (const index of [...desiredNoteIndexes].sort((left, right) => left - right)) {
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
            note.body.texture = rhythmSupportEnabledRef.current && note.rhythmSupportTexture
              ? note.rhythmSupportTexture
              : note.baseBodyTexture;
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

        for (const display of syncLineDisplays) {
          updateSyncLine(display, activeNotes, syncLineEnabledRef.current);
        }

        if (effectPlaybackState.isPlaying) {
          if (laneEffectEnabledRef.current) {
            const laneEffectEvents = collectBandoriNativeLaneEffectEvents(
              compiled,
              chartVisuals,
              lastEffectTimeSeconds,
              presentationTime,
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
              const terminalScreenX = event.terminalLane === null
                ? projection.screenX
                : projection.screenX
                  + (event.terminalLane - event.lane)
                  * BANDORI_NATIVE_JUDGMENT_LANE_SPACING_PIXELS;
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

      renderNotes();
      app.ticker.add(renderNotes);
      setStatus("ready");
    };

    void initialize();
    return () => {
      disposed = true;
      try {
        app.destroy({ removeView: true }, { children: true });
        for (const shader of localShaders) shader.destroy();
        for (const texture of localFrameTextures) texture.destroy(false);
      } catch {
        // Initialization can be aborted before the renderer exists.
      }
    };
  }, [
    compiled,
    directionalFlickSkin,
    fieldSkin,
    getEffectPlaybackState,
    getPresentationTime,
    isMirrored,
    noteSkin,
  ]);

  const statusLabel = status === "rendererError"
    ? rendererErrorLabel
    : status === "resourceError"
      ? resourceErrorLabel
      : status === "noteContractError"
        ? noteContractErrorLabel
        : status === "ready"
          ? readyLabel
          : loadingLabel;

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
      <p
        aria-live="polite"
        className="mt-2 text-sm text-[var(--theme-color-text-muted)]"
      >
        {statusLabel}
      </p>
    </div>
  );
}
