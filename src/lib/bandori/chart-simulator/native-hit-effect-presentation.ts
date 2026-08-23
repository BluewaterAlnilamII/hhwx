import {
  BANDORI_COMPILED_DIRECTION,
  BANDORI_COMPILED_NOTE_FLAG,
  BANDORI_COMPILED_NOTE_KIND,
  type CompiledBandoriChart,
} from "./compiler";
import {
  isBandoriHabahiroChart,
  upperBoundBandoriNoteTime,
  type BandoriNativeChartVisuals,
  type BandoriNativeNoteVisual,
} from "./native-note-presentation";
import type { BandoriNativeSwipeEffectKind } from "./native-swipe-effect-presentation";

export type BandoriNativeTapHitEffectKind = "normal" | "skill";
export type BandoriNativeHitEffectKind =
  | BandoriNativeTapHitEffectKind
  | BandoriNativeSwipeEffectKind;

type BandoriEffectAtlas = "set1" | "set2";

type BandoriEffectColor = {
  readonly blue: number;
  readonly green: number;
  readonly red: number;
};

type BandoriEffectNumberKey = {
  readonly time: number;
  readonly value: number;
};

type BandoriEffectColorKey = {
  readonly color: BandoriEffectColor;
  readonly time: number;
};

type BandoriEffectGradient = {
  readonly alphaKeys: readonly BandoriEffectNumberKey[];
  readonly colorKeys: readonly BandoriEffectColorKey[];
};

type BandoriEffectCurveKey = {
  readonly inSlope: number;
  readonly outSlope: number;
  readonly time: number;
  readonly value: number;
};

export type BandoriApproximateStaticHitLayer = {
  readonly atlas: BandoriEffectAtlas;
  readonly frame: number;
  readonly gradient: BandoriEffectGradient;
  readonly id: string;
  readonly lifetimeSeconds: number;
  readonly localPositionYWorld: number;
  readonly localScaleX: number;
  readonly order: 5 | 50;
  readonly projection: "billboard" | "stretched" | "tilted";
  readonly sizeCurve?: readonly BandoriEffectCurveKey[];
  readonly startSizeWorld: number;
};

type BandoriApproximateKiraContract = {
  readonly atlas: "set1";
  readonly count: 25;
  readonly dampen: number;
  readonly frame: 11;
  readonly lifetimeMaximumSeconds: number;
  readonly lifetimeMinimumSeconds: number;
  readonly limitWorldPerSecond: number;
  readonly localPositionYWorld: number;
  readonly maximumGradient: BandoriEffectGradient;
  readonly minimumGradient: BandoriEffectGradient;
  readonly rotationMaximumRadians: number;
  readonly shapeSizeXWorld: number;
  readonly shapeSizeYWorld: number;
  readonly sizeMaximumWorld: number;
  readonly sizeMinimumWorld: number;
  readonly speedMaximumWorldPerSecond: number;
  readonly speedMinimumWorldPerSecond: number;
};

export type BandoriNativeHitEvent = {
  readonly fingerKind: BandoriNativeSwipeEffectKind | null;
  readonly index: number;
  readonly kind: BandoriNativeHitEffectKind;
  readonly lane: number;
  readonly rangeWidth: number;
  readonly terminalLane: number | null;
  readonly timeSeconds: number;
  readonly triggersLaneEffect: boolean;
};

export type BandoriNativeLaneEffectEvent = {
  readonly action: "off" | "on-reserve";
  readonly index: number;
  readonly lane: number;
  readonly timeSeconds: number;
};

export type BandoriApproximateKiraParticle = {
  readonly colorMix: number;
  readonly lifetimeSeconds: number;
  readonly rotationRadians: number;
  readonly sizeWorld: number;
  readonly spawnXWorld: number;
  readonly spawnYWorld: number;
  readonly speedWorldPerSecond: number;
};

export type BandoriApproximateHitLayerSample = {
  readonly alpha: number;
  readonly blue: number;
  readonly green: number;
  readonly red: number;
  readonly sizeMultiplier: number;
};

export type BandoriApproximateKiraSample = BandoriApproximateHitLayerSample & {
  readonly rotationRadians: number;
  readonly sizeWorld: number;
  readonly worldX: number;
  readonly worldY: number;
};

function getBandoriNativeTargetCenterLane(lane: number): number {
  const lower = Math.floor(lane);
  const fraction = lane - lower;
  if (fraction < 0.5) return lower;
  if (fraction > 0.5) return lower + 1;
  return lower % 2 === 0 ? lower : lower + 1;
}

function getBandoriNativeEffectTarget(
  visual: BandoriNativeNoteVisual,
  isDirectional: boolean,
): { lane: number; rangeWidth: number } {
  if (isDirectional) return { lane: visual.lane, rangeWidth: 1 };
  const coveredLanes = visual.coveredLanes ?? [visual.lane];
  const rangeWidth = coveredLanes.length;
  if (rangeWidth < 1 || rangeWidth > 7) {
    throw new Error("Native tap effect requires one through seven covered lanes");
  }
  return {
    lane: coveredLanes[(rangeWidth - 1) >> 1],
    rangeWidth,
  };
}

export const BANDORI_NATIVE_TAP_EFFECT_ATLAS_1_URL =
  "/local/chart-simulator/ingameskin/tapeffect/skin00/textures/Tex_parSet_1.png";
export const BANDORI_NATIVE_TAP_EFFECT_ATLAS_2_URL =
  "/local/chart-simulator/ingameskin/tapeffect/skin00/textures/Tex_parSet_2.png";
export const BANDORI_NATIVE_TAP_EFFECT_ATLAS_SIZE = 1024;
export const BANDORI_NATIVE_TAP_EFFECT_ATLAS_COLUMNS = 4;
export const BANDORI_NATIVE_TAP_EFFECT_FRAME_SIZE = 256;
export const BANDORI_NATIVE_HIT_EFFECT_MAX_SECONDS = 0.9;
export const BANDORI_NATIVE_LANE_EFFECT_PIXELS_PER_UNIT = 69;
export const BANDORI_NATIVE_LANE_EFFECT_FADE_SECONDS = 0.1666666716337204;
export const BANDORI_NATIVE_LANE_EFFECT_WAIT_FRAMES = 2;

const COLOR_WHITE = { red: 1, green: 1, blue: 1 } as const;
const FADE_ALPHA = [
  { time: 0, value: 1 },
  { time: 1, value: 0 },
] as const;
const RING_ALPHA = [
  { time: 0, value: 1 },
  { time: 0.32353704127565425, value: 1 },
  { time: 0.6470588235294118, value: 0 },
] as const;
const RING_SIZE = [
  {
    time: 0,
    value: 0.20554299652576447,
    inSlope: 2.349672317504883,
    outSlope: 2.349672317504883,
  },
  {
    time: 1,
    value: 0.7987220883369446,
    inSlope: 0.15642186999320984,
    outSlope: 0.15642186999320984,
  },
] as const;
const SMALL_RING_SIZE = [
  {
    time: 0,
    value: 0.07142860442399979,
    inSlope: 2.349672317504883,
    outSlope: 2.349672317504883,
  },
  {
    time: 0.995708167552948,
    value: 0.6558648347854614,
    inSlope: 0.15642186999320984,
    outSlope: 0.15642186999320984,
  },
] as const;
const CENTER_SIZE = [
  {
    time: 0,
    value: 0,
    inSlope: 2.349672317504883,
    outSlope: 2.349672317504883,
  },
  {
    time: 1,
    value: 0.584436297416687,
    inSlope: 0.15642186999320984,
    outSlope: 0.15642186999320984,
  },
] as const;
const KIRA_SIZE = [
  { time: 0, value: 1, inSlope: 0, outSlope: 0 },
  { time: 1, value: 0, inSlope: -2, outSlope: -2 },
] as const;

const normalKiraMinimumGradient: BandoriEffectGradient = {
  alphaKeys: FADE_ALPHA,
  colorKeys: [
    { time: 0, color: { red: 0, green: 0.8196078538894653, blue: 0.7843137383460999 } },
    { time: 0.6256809338521401, color: { red: 0.10980392247438431, green: 0.24313725531101227, blue: 0.30980393290519714 } },
  ],
};
const normalKiraMaximumGradient: BandoriEffectGradient = {
  alphaKeys: FADE_ALPHA,
  colorKeys: [
    { time: 0, color: COLOR_WHITE },
    { time: 1, color: { red: 0.3607843220233917, green: 0.886274516582489, blue: 0.8470588326454163 } },
  ],
};
const skillKiraMinimumGradient: BandoriEffectGradient = {
  alphaKeys: FADE_ALPHA,
  colorKeys: [
    { time: 0, color: { red: 0.8980392217636108, green: 0.800000011920929, blue: 0.027450980618596077 } },
    { time: 0.6256809338521401, color: { red: 0.10980392247438431, green: 0.24313725531101227, blue: 0.30980393290519714 } },
  ],
};
const skillKiraMaximumGradient: BandoriEffectGradient = {
  alphaKeys: FADE_ALPHA,
  colorKeys: [
    { time: 0, color: COLOR_WHITE },
    { time: 1, color: { red: 0.886274516582489, green: 0.8705882430076599, blue: 0.3607843220233917 } },
  ],
};

const commonKira = {
  atlas: "set1",
  count: 25,
  dampen: 0.20000000298023224,
  frame: 11,
  lifetimeMaximumSeconds: 0.6000000238418579,
  lifetimeMinimumSeconds: 0.30000001192092896,
  limitWorldPerSecond: 0.699999988079071,
  localPositionYWorld: 0.38999998569488525,
  rotationMaximumRadians: 6.108652114868164,
  shapeSizeXWorld: 2.5,
  shapeSizeYWorld: 0.7200000286102295,
  sizeMaximumWorld: 0.6000000238418579,
  sizeMinimumWorld: 0.20000000298023224,
  speedMaximumWorldPerSecond: 40,
  speedMinimumWorldPerSecond: 1,
} as const;

export const BANDORI_NATIVE_APPROXIMATE_HIT_EFFECTS: Readonly<Record<
  BandoriNativeTapHitEffectKind,
  {
    readonly kira: BandoriApproximateKiraContract;
    readonly staticLayers: readonly BandoriApproximateStaticHitLayer[];
  }
>> = {
  normal: {
    staticLayers: [
      {
        id: "star",
        atlas: "set2",
        frame: 1,
        lifetimeSeconds: 0.8999999761581421,
        startSizeWorld: 2.5,
        localPositionYWorld: 0,
        localScaleX: 1,
        order: 50,
        projection: "billboard",
        gradient: {
          alphaKeys: FADE_ALPHA,
          colorKeys: [
            { time: 0, color: { red: 0.2705882489681244, green: 0.8980392217636108, blue: 0.7960784435272217 } },
            { time: 1, color: COLOR_WHITE },
          ],
        },
      },
      {
        id: "Smatt_1",
        atlas: "set2",
        frame: 4,
        lifetimeSeconds: 0.5,
        startSizeWorld: 2.799999952316284,
        localPositionYWorld: 0,
        localScaleX: 1,
        order: 5,
        projection: "stretched",
        gradient: {
          alphaKeys: [
            { time: 0.2882429236285954, value: 0.8627451062202454 },
            { time: 0.8058899824521248, value: 0 },
          ],
          colorKeys: [
            { time: 0.2605477988860914, color: { red: 0.6117647290229797, green: 1, blue: 1 } },
            { time: 0.4500038147554742, color: { red: 0, green: 0.5764706134796143, blue: 0.529411792755127 } },
            { time: 0.77431906614786, color: { red: 0.2705882489681244, green: 0.5176470875740051, blue: 0.5176470875740051 } },
          ],
        },
      },
      {
        id: "Sring_2",
        atlas: "set1",
        frame: 15,
        lifetimeSeconds: 0.8999999761581421,
        startSizeWorld: 10,
        localPositionYWorld: -0.009999990463256836,
        localScaleX: 1,
        order: 50,
        projection: "tilted",
        sizeCurve: RING_SIZE,
        gradient: {
          alphaKeys: RING_ALPHA,
          colorKeys: [
            { time: 0, color: { red: 0.9254902005195618, green: 1, blue: 0.9137254953384399 } },
            { time: 0.6500038147554742, color: { red: 0.22745098173618317, green: 0.7411764860153198, blue: 0.6666666865348816 } },
          ],
        },
      },
      {
        id: "ring_2",
        atlas: "set2",
        frame: 14,
        lifetimeSeconds: 0.699999988079071,
        startSizeWorld: 10,
        localPositionYWorld: -0.009999999776482582,
        localScaleX: 1,
        order: 50,
        projection: "tilted",
        sizeCurve: RING_SIZE,
        gradient: {
          alphaKeys: RING_ALPHA,
          colorKeys: [
            { time: 0, color: { red: 0.8470588326454163, green: 0.9921568632125854, blue: 0.9803921580314636 } },
            { time: 0.6500038147554742, color: { red: 0.22745098173618317, green: 0.7372549176216125, blue: 0.8588235378265381 } },
          ],
        },
      },
      {
        id: "ring_3",
        atlas: "set2",
        frame: 14,
        lifetimeSeconds: 0.699999988079071,
        startSizeWorld: 10,
        localPositionYWorld: -0.009999999776482582,
        localScaleX: 1,
        order: 50,
        projection: "tilted",
        sizeCurve: SMALL_RING_SIZE,
        gradient: {
          alphaKeys: RING_ALPHA,
          colorKeys: [
            { time: 0, color: { red: 0.8470588326454163, green: 0.9921568632125854, blue: 0.9803921580314636 } },
            { time: 0.6500038147554742, color: { red: 0.22745098173618317, green: 0.7372549176216125, blue: 0.8588235378265381 } },
          ],
        },
      },
    ],
    kira: {
      ...commonKira,
      minimumGradient: normalKiraMinimumGradient,
      maximumGradient: normalKiraMaximumGradient,
    },
  },
  skill: {
    staticLayers: [
      {
        id: "Sring_2",
        atlas: "set1",
        frame: 15,
        lifetimeSeconds: 0.8999999761581421,
        startSizeWorld: 10,
        localPositionYWorld: -0.009999990463256836,
        localScaleX: 1,
        order: 50,
        projection: "tilted",
        sizeCurve: RING_SIZE,
        gradient: {
          alphaKeys: RING_ALPHA,
          colorKeys: [
            { time: 0, color: { red: 0.9254902005195618, green: 0.8980392217636108, blue: 0.24705882370471954 } },
            { time: 0.6500038147554742, color: { red: 0.7960784435272217, green: 0.8078431487083435, blue: 0 } },
          ],
        },
      },
      {
        id: "Smatt_1",
        atlas: "set2",
        frame: 3,
        lifetimeSeconds: 0.5,
        startSizeWorld: 2.799999952316284,
        localPositionYWorld: 0,
        localScaleX: 0.5,
        order: 5,
        projection: "stretched",
        gradient: {
          alphaKeys: [
            { time: 0.2882429236285954, value: 0.8627451062202454 },
            { time: 0.8058899824521248, value: 0 },
          ],
          colorKeys: [
            { time: 0.2605477988860914, color: { red: 1, green: 0.9725490212440491, blue: 0 } },
            { time: 0.4500038147554742, color: { red: 0.7647058963775635, green: 0.6666666865348816, blue: 0.12941177189350128 } },
            { time: 0.77431906614786, color: { red: 0.6196078658103943, green: 0.5490196347236633, blue: 0.15294118225574493 } },
          ],
        },
      },
      {
        id: "star",
        atlas: "set2",
        frame: 1,
        lifetimeSeconds: 0.8999999761581421,
        startSizeWorld: 2.5,
        localPositionYWorld: 0,
        localScaleX: 1,
        order: 50,
        projection: "billboard",
        gradient: {
          alphaKeys: FADE_ALPHA,
          colorKeys: [
            { time: 0, color: { red: 0.8980392217636108, green: 0.8823529481887817, blue: 0.2705882489681244 } },
            { time: 1, color: COLOR_WHITE },
          ],
        },
      },
      {
        id: "Sring_1",
        atlas: "set2",
        frame: 14,
        lifetimeSeconds: 0.699999988079071,
        startSizeWorld: 10,
        localPositionYWorld: -0.009999999776482582,
        localScaleX: 1,
        order: 50,
        projection: "tilted",
        sizeCurve: RING_SIZE,
        gradient: {
          alphaKeys: RING_ALPHA,
          colorKeys: [
            { time: 0, color: { red: 0.9921568632125854, green: 0.9647058844566345, blue: 0.8470588326454163 } },
            { time: 0.6500038147554742, color: { red: 0.8588235378265381, green: 0.7647058963775635, blue: 0.22745098173618317 } },
          ],
        },
      },
      {
        id: "Star_center",
        atlas: "set1",
        frame: 2,
        lifetimeSeconds: 0.6000000238418579,
        startSizeWorld: 10,
        localPositionYWorld: 0.14000000059604645,
        localScaleX: 1,
        order: 50,
        projection: "tilted",
        sizeCurve: CENTER_SIZE,
        gradient: {
          alphaKeys: RING_ALPHA,
          colorKeys: [
            { time: 0, color: { red: 0.9921568632125854, green: 0.9647058844566345, blue: 0.8470588326454163 } },
            { time: 0.6500038147554742, color: { red: 0.8588235378265381, green: 0.7647058963775635, blue: 0.22745098173618317 } },
          ],
        },
      },
    ],
    kira: {
      ...commonKira,
      minimumGradient: skillKiraMinimumGradient,
      maximumGradient: skillKiraMaximumGradient,
    },
  },
};

export const BANDORI_NATIVE_LANE_EFFECTS = [
  { lane: 0, file: "NoteLaneEffect_1.png", sourceWidth: 774, flipX: false },
  { lane: 1, file: "NoteLaneEffect_2.png", sourceWidth: 526, flipX: false },
  { lane: 2, file: "NoteLaneEffect_3.png", sourceWidth: 278, flipX: false },
  { lane: 3, file: "NoteLaneEffect_4.png", sourceWidth: 154, flipX: false },
  { lane: 4, file: "NoteLaneEffect_3.png", sourceWidth: 278, flipX: true },
  { lane: 5, file: "NoteLaneEffect_2.png", sourceWidth: 526, flipX: true },
  { lane: 6, file: "NoteLaneEffect_1.png", sourceWidth: 774, flipX: true },
] as const;

export function getBandoriNativeLaneEffectUrl(file: string): string {
  return `/local/chart-simulator/apk/textures/${file}`;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function interpolate(left: number, right: number, progress: number): number {
  return left + (right - left) * progress;
}

function sampleNumberKeys(keys: readonly BandoriEffectNumberKey[], time: number): number {
  if (time <= keys[0].time) return keys[0].value;
  for (let index = 1; index < keys.length; index += 1) {
    const right = keys[index];
    const left = keys[index - 1];
    if (time <= right.time) {
      const progress = (time - left.time) / (right.time - left.time);
      return interpolate(left.value, right.value, progress);
    }
  }
  return keys.at(-1)?.value ?? 0;
}

function sampleColorKeys(
  keys: readonly BandoriEffectColorKey[],
  time: number,
): BandoriEffectColor {
  if (time <= keys[0].time) return keys[0].color;
  for (let index = 1; index < keys.length; index += 1) {
    const right = keys[index];
    const left = keys[index - 1];
    if (time <= right.time) {
      const progress = (time - left.time) / (right.time - left.time);
      return {
        red: interpolate(left.color.red, right.color.red, progress),
        green: interpolate(left.color.green, right.color.green, progress),
        blue: interpolate(left.color.blue, right.color.blue, progress),
      };
    }
  }
  return keys.at(-1)?.color ?? COLOR_WHITE;
}

function sampleCurve(keys: readonly BandoriEffectCurveKey[], time: number): number {
  if (time <= keys[0].time) return keys[0].value;
  for (let index = 1; index < keys.length; index += 1) {
    const right = keys[index];
    const left = keys[index - 1];
    if (time <= right.time) {
      const duration = right.time - left.time;
      const progress = (time - left.time) / duration;
      const progress2 = progress * progress;
      const progress3 = progress2 * progress;
      return (2 * progress3 - 3 * progress2 + 1) * left.value
        + (progress3 - 2 * progress2 + progress) * left.outSlope * duration
        + (-2 * progress3 + 3 * progress2) * right.value
        + (progress3 - progress2) * right.inSlope * duration;
    }
  }
  return keys.at(-1)?.value ?? 0;
}

function sampleGradient(
  gradient: BandoriEffectGradient,
  time: number,
): Omit<BandoriApproximateHitLayerSample, "sizeMultiplier"> {
  const color = sampleColorKeys(gradient.colorKeys, time);
  return {
    alpha: sampleNumberKeys(gradient.alphaKeys, time),
    ...color,
  };
}

export function evaluateBandoriApproximateStaticHitLayer(
  layer: BandoriApproximateStaticHitLayer,
  elapsedSeconds: number,
): BandoriApproximateHitLayerSample | null {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds >= layer.lifetimeSeconds) {
    return null;
  }
  const progress = clampUnit(elapsedSeconds / layer.lifetimeSeconds);
  return {
    ...sampleGradient(layer.gradient, progress),
    sizeMultiplier: layer.sizeCurve ? sampleCurve(layer.sizeCurve, progress) : 1,
  };
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function effectSeed(index: number, lane: number, kind: BandoriNativeTapHitEffectKind): number {
  return (
    Math.imul(index + 1, 0x9e3779b1)
    ^ Math.imul(lane + 1, 0x85ebca6b)
    ^ (kind === "skill" ? 0xc2b2ae35 : 0x27d4eb2f)
  ) >>> 0;
}

export function createBandoriApproximateKiraParticles(
  event: Pick<BandoriNativeHitEvent, "index" | "kind" | "lane"> & {
    readonly kind: BandoriNativeTapHitEffectKind;
  },
): BandoriApproximateKiraParticle[] {
  const contract = BANDORI_NATIVE_APPROXIMATE_HIT_EFFECTS[event.kind].kira;
  const random = createRandom(effectSeed(event.index, event.lane, event.kind));
  return Array.from({ length: contract.count }, () => ({
    colorMix: random(),
    lifetimeSeconds: interpolate(
      contract.lifetimeMinimumSeconds,
      contract.lifetimeMaximumSeconds,
      random(),
    ),
    rotationRadians: contract.rotationMaximumRadians * random(),
    sizeWorld: interpolate(contract.sizeMinimumWorld, contract.sizeMaximumWorld, random()),
    spawnXWorld: (random() - 0.5) * contract.shapeSizeXWorld,
    spawnYWorld: contract.localPositionYWorld
      + (random() - 0.5) * contract.shapeSizeYWorld,
    speedWorldPerSecond: interpolate(
      contract.speedMinimumWorldPerSecond,
      contract.speedMaximumWorldPerSecond,
      random(),
    ),
  }));
}

export function evaluateBandoriApproximateKiraParticle(
  kind: BandoriNativeTapHitEffectKind,
  particle: BandoriApproximateKiraParticle,
  elapsedSeconds: number,
): BandoriApproximateKiraSample | null {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds >= particle.lifetimeSeconds) {
    return null;
  }
  const contract = BANDORI_NATIVE_APPROXIMATE_HIT_EFFECTS[kind].kira;
  const progress = clampUnit(elapsedSeconds / particle.lifetimeSeconds);
  const minimum = sampleGradient(contract.minimumGradient, progress);
  const maximum = sampleGradient(contract.maximumGradient, progress);

  // Unity's per-frame Limit Velocity integration is the only motion semantic
  // approximated here. The exact serialized limit and dampen are retained and
  // evaluated at the game's 60 Hz presentation cadence as a continuous decay.
  const dampingRate = -60 * Math.log(1 - contract.dampen);
  const excessSpeed = particle.speedWorldPerSecond - contract.limitWorldPerSecond;
  const travelWorld = contract.limitWorldPerSecond * elapsedSeconds
    + excessSpeed * (1 - Math.exp(-dampingRate * elapsedSeconds)) / dampingRate;
  const sizeMultiplier = sampleCurve(KIRA_SIZE, progress);

  return {
    alpha: interpolate(minimum.alpha, maximum.alpha, particle.colorMix),
    red: interpolate(minimum.red, maximum.red, particle.colorMix),
    green: interpolate(minimum.green, maximum.green, particle.colorMix),
    blue: interpolate(minimum.blue, maximum.blue, particle.colorMix),
    rotationRadians: particle.rotationRadians,
    sizeMultiplier,
    sizeWorld: particle.sizeWorld * sizeMultiplier,
    worldX: particle.spawnXWorld,
    worldY: particle.spawnYWorld + travelWorld,
  };
}

export function collectBandoriNativeHitEvents(
  compiled: CompiledBandoriChart,
  chartVisuals: BandoriNativeChartVisuals,
  previousTimeSeconds: number,
  currentTimeSeconds: number,
): BandoriNativeHitEvent[] {
  if (
    !Number.isFinite(previousTimeSeconds)
    || !Number.isFinite(currentTimeSeconds)
    || currentTimeSeconds <= previousTimeSeconds
  ) {
    return [];
  }
  const startIndex = upperBoundBandoriNoteTime(compiled.notes.times, previousTimeSeconds);
  const endIndex = upperBoundBandoriNoteTime(compiled.notes.times, currentTimeSeconds);
  const events: BandoriNativeHitEvent[] = [];
  for (let index = startIndex; index < endIndex; index += 1) {
    const noteKind = compiled.notes.kinds[index];
    const flags = compiled.notes.flags[index];
    const group = chartVisuals.notes[index];
    const rootVisual = group?.visuals[0];
    if (!group || !rootVisual) continue;
    const isSkill = (flags & BANDORI_COMPILED_NOTE_FLAG.skill) !== 0;
    const isFlick = (flags & BANDORI_COMPILED_NOTE_FLAG.flick) !== 0;
    const isRibbonNode = noteKind === BANDORI_COMPILED_NOTE_KIND.longStart
      || noteKind === BANDORI_COMPILED_NOTE_KIND.longEnd
      || noteKind === BANDORI_COMPILED_NOTE_KIND.slide;
    const isRibbonStart = isRibbonNode
      && (flags & BANDORI_COMPILED_NOTE_FLAG.ribbonStart) !== 0;
    const isRibbonTail = (
      noteKind === BANDORI_COMPILED_NOTE_KIND.longEnd
      || noteKind === BANDORI_COMPILED_NOTE_KIND.slide
    ) && (flags & BANDORI_COMPILED_NOTE_FLAG.ribbonEnd) !== 0;
    // Long resets the skill attribute after the head judgment, and Slide tail
    // and intermediate dispatch hard-code isSkill=false. A skill-marked visual
    // node therefore uses Skill only at the accepted head, never later in the chain.
    const usesSkillHitEffect = isSkill && (!isRibbonNode || isRibbonStart);
    const isDirectional = noteKind === BANDORI_COMPILED_NOTE_KIND.directional
      || (
        isRibbonTail
        && rootVisual.direction !== BANDORI_COMPILED_DIRECTION.none
      );

    let kind: BandoriNativeHitEffectKind | null = null;
    let fingerKind: BandoriNativeSwipeEffectKind | null = null;
    let terminalLane: number | null = null;
    if (isDirectional) {
      if (
        rootVisual.direction !== BANDORI_COMPILED_DIRECTION.left
        && rootVisual.direction !== BANDORI_COMPILED_DIRECTION.right
      ) continue;
      const width = compiled.notes.widths[index];
      if (!Number.isInteger(width) || width < 1 || width > 7) continue;
      const renderedDirection = rootVisual.direction < 0 ? "left" : "right";
      const widthBucket: 1 | 2 | 3 = width === 1 ? 1 : width === 2 ? 2 : 3;
      kind = usesSkillHitEffect
        ? "skill"
        : `directional-${renderedDirection}-${widthBucket}`;
      fingerKind = `directional-finger-${renderedDirection}`;
      // Native width 3...7 reuses the same span-3 main prefab at the scalar
      // Directional root. Its terminal emitter therefore stays one lane from
      // that root rather than following the expanded group's outer body.
      terminalLane = widthBucket < 3
        ? rootVisual.lane
        : rootVisual.lane + (rootVisual.direction < 0 ? -1 : 1);
    } else if (
      noteKind === BANDORI_COMPILED_NOTE_KIND.single
      || (isRibbonTail && isFlick)
    ) {
      kind = usesSkillHitEffect ? "skill" : isFlick ? "flick" : "normal";
    } else if (isRibbonNode) {
      kind = usesSkillHitEffect ? "skill" : "normal";
    }
    if (!kind) continue;
    const effectTarget = getBandoriNativeEffectTarget(rootVisual, isDirectional);
    events.push({
      fingerKind,
      index,
      kind,
      lane: effectTarget.lane,
      rangeWidth: effectTarget.rangeWidth,
      terminalLane,
      timeSeconds: compiled.notes.times[index],
      triggersLaneEffect: true,
    });
  }
  return events;
}

export function collectBandoriNativeLaneEffectEvents(
  compiled: CompiledBandoriChart,
  chartVisuals: BandoriNativeChartVisuals,
  previousTimeSeconds: number,
  currentTimeSeconds: number,
): BandoriNativeLaneEffectEvent[] {
  if (
    !Number.isFinite(previousTimeSeconds)
    || !Number.isFinite(currentTimeSeconds)
    || currentTimeSeconds <= previousTimeSeconds
  ) {
    return [];
  }
  // NoteLaneEffectOn returns before enabling its Animator for every
  // IsMultiRangeNotes chart. OffReserve cannot make a disabled renderer visible.
  if (isBandoriHabahiroChart(compiled)) return [];
  const ribbonByIndex = new Map(
    chartVisuals.ribbons.map((ribbon) => [ribbon.ribbonIndex, ribbon]),
  );
  const startIndex = upperBoundBandoriNoteTime(compiled.notes.times, previousTimeSeconds);
  const endIndex = upperBoundBandoriNoteTime(compiled.notes.times, currentTimeSeconds);
  const events: BandoriNativeLaneEffectEvent[] = [];
  const push = (
    action: BandoriNativeLaneEffectEvent["action"],
    index: number,
    lane: number,
  ) => {
    events.push({ action, index, lane, timeSeconds: compiled.notes.times[index] });
  };

  for (let index = startIndex; index < endIndex; index += 1) {
    const group = chartVisuals.notes[index];
    const rootVisual = group?.visuals[0];
    if (!rootVisual) continue;
    const ribbonIndex = compiled.notes.ribbonIndexes[index];
    const ribbon = ribbonByIndex.get(ribbonIndex);
    if (!ribbon || ribbon.kind !== "slide") {
      push("on-reserve", index, rootVisual.lane);
      continue;
    }

    const pointIndex = compiled.notes.sourceNodeIndexes[index];
    if (pointIndex === 0) {
      push("on-reserve", index, rootVisual.lane);
      const firstAfter = ribbon.points[1];
      if (firstAfter) {
        // Native curve conversion keeps a fractional virtual X but bakes one
        // scalar TargetCenterButton with the same midpoint-to-even rule.
        push("on-reserve", index, getBandoriNativeTargetCenterLane(firstAfter.lane));
      }
      continue;
    }

    let trackedPointIndex = pointIndex - 1;
    while (trackedPointIndex > 0 && ribbon.points[trackedPointIndex]?.hidden) {
      trackedPointIndex -= 1;
    }
    const trackedPoint = ribbon.points[trackedPointIndex];
    if (trackedPoint) push("off", index, trackedPoint.lane);
    push("on-reserve", index, rootVisual.lane);
  }
  return events;
}
