/**
 * Deterministic, renderer-agnostic evaluator for the verified JP particle
 * recipes used by the native-stage simulator. This is deliberately a small
 * interpreter for the recovered module allowlist, not a general Unity
 * ParticleSystem implementation.
 */

export const BANDORI_DEFAULT_EFFECT_RECIPE_SCHEMA =
  "hhwx-bandori-chart-simulator-browser-effect-recipe-v2" as const;

const DEFAULT_FIXED_STEP_SECONDS = 1 / 120;
const CALIBRATED_DAMPEN_STEPS_PER_SECOND = 30;
const UINT32_RANGE = 0x1_0000_0000;
const EPSILON = 1e-9;
const BOUNDED_CUSTOM_MESH_PROFILES: ReadonlyMap<string, Readonly<{
  indexCount: number;
  name: string;
  profile: string;
  rawObjectSha256: string;
  vertexCount: number;
}>> = new Map([
  [
    "3077011630755533612",
    {
      indexCount: 240,
      name: "screwTowerLow",
      profile: "witch-screw-tower-low-v1",
      rawObjectSha256:
        "29ebb9c3f84ab4081b3751ba663e8ba2da95de0bb9397489eff59f6460aafb9d",
      vertexCount: 82,
    },
  ],
  [
    "6557177055925279836",
    {
      indexCount: 768,
      name: "crossCylinder",
      profile: "witch-cross-cylinder-v1",
      rawObjectSha256:
        "5b2b0f8978cf1bdb6ebcd0a4a9495e3bfb9c2c3d4b9338aa8c046dc8f7a65c27",
      vertexCount: 448,
    },
  ],
  [
    "7141092885653479763",
    {
      indexCount: 96,
      name: "screwTower",
      profile: "witch-screw-tower-v1",
      rawObjectSha256:
        "e7e2328d60c428527f7d0b545ce86d4ed70e308e6d1025818b8ba8b86084242a",
      vertexCount: 35,
    },
  ],
]);
const TWO_PI = Math.PI * 2;
const ZERO_CURVE: MinMaxCurve = { mode: "constant", value: 0 };

type JsonRecord = Record<string, unknown>;

export interface BandoriEffectColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface BandoriEffectUvFrame {
  column: number;
  row: number;
  index: number;
  frameColumns: number;
  frameRows: number;
  flipU: boolean;
  flipV: boolean;
}

export interface BandoriEffectStretchFrame {
  cameraVelocityScale: number;
  velocityScale: number;
  lengthScale: number;
  velocityPixelsPerSecond: number;
  lengthPixels: number;
  rotateWithStretchDirection: boolean;
}

export interface BandoriEffectMeshFrame {
  pathId: string;
  vertices: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  uvOffsetU: number;
}

type BandoriEffectTextureAddressMode = "clamp-to-edge" | "repeat";

export interface BandoriEffectFrameInstance {
  hierarchyPath: string;
  particleIndex: number;
  materialId: string;
  textureResource: string;
  textureAddressModeU: BandoriEffectTextureAddressMode;
  textureAddressModeV: BandoriEffectTextureAddressMode;
  blendSource: string;
  blendDestination: string;
  blendEquation: string;
  premultipliedAlpha: boolean;
  rendererMode: "billboard" | "mesh" | "stretched-billboard";
  screenX: number;
  screenY: number;
  depth: number;
  rotationRadians: number;
  basisX: { x: number; y: number };
  basisY: { x: number; y: number };
  widthPixels: number;
  heightPixels: number;
  color: BandoriEffectColor;
  uv: BandoriEffectUvFrame;
  mesh: BandoriEffectMeshFrame | null;
  stretch: BandoriEffectStretchFrame | null;
  sortingLayerId: number;
  sortingOrder: number;
  sortingFudge: number;
  rendererPriority: number;
}

export interface BandoriEffectFrame {
  readonly instances: BandoriEffectFrameInstance[];
  count: number;
  timeSeconds: number;
  isPlaying: boolean;
  isRootActive: boolean;
}

export interface BandoriDefaultEffectRuntimeOptions {
  seed: number;
  buttonIndex: number;
  fixedStepSeconds?: number;
  cameraVelocityWorldUnitsPerSecond?: Readonly<{
    x: number;
    y: number;
    z: number;
  }>;
}

export interface BandoriDefaultEffectRuntime {
  readonly frame: BandoriEffectFrame;
  readonly seed: number;
  readonly buttonIndex: number;
  play(timeSeconds?: number, seed?: number): BandoriEffectFrame;
  stop(): BandoriEffectFrame;
  clear(): BandoriEffectFrame;
  seek(timeSeconds: number): BandoriEffectFrame;
  sample(timeSeconds: number): BandoriEffectFrame;
  setButtonIndex(buttonIndex: number): void;
}

export interface BandoriDefaultEffectPlacement {
  pixelsPerWorldUnit: number;
  screenX: number;
  screenY: number;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Quaternion extends Vec3 {
  w: number;
}

interface CurveKey {
  time: number;
  value: number;
  inSlope: number;
  outSlope: number;
  stepAfter: boolean;
}

interface AnimationCurve {
  keys: CurveKey[];
}

type MinMaxCurve =
  | { mode: "constant"; value: number }
  | { mode: "curve"; multiplier: number; curve: AnimationCurve }
  | {
      mode: "uniform-between-constants";
      minimum: number;
      maximum: number;
    }
  | {
      mode: "uniform-between-curves";
      minimumMultiplier: number;
      maximumMultiplier: number;
      minimumCurve: AnimationCurve;
      maximumCurve: AnimationCurve;
    };

interface GradientColorKey {
  time: number;
  color: Omit<BandoriEffectColor, "a">;
}

interface GradientAlphaKey {
  time: number;
  alpha: number;
}

interface Gradient {
  interpolation: "linear" | "fixed";
  colorKeys: GradientColorKey[];
  alphaKeys: GradientAlphaKey[];
}

type MinMaxGradient =
  | { mode: "color"; color: BandoriEffectColor }
  | { mode: "gradient"; gradient: Gradient }
  | {
      mode: "random-color-from-gradient";
      gradient: Gradient;
    }
  | {
      mode: "uniform-between-colors";
      minimumColor: BandoriEffectColor;
      maximumColor: BandoriEffectColor;
    }
  | {
      mode: "uniform-between-gradients";
      minimumGradient: Gradient;
      maximumGradient: Gradient;
    };

interface ShapeTransform {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

interface ArcSpec {
  degrees: number;
  mode: "burst-spread" | "random";
}

type ShapeSpec =
  | {
      type: "sphere";
      transform: ShapeTransform;
      radius: number;
      innerRadius: number;
      randomDirectionAmount: number;
      sphericalDirectionAmount: number;
      randomPositionAmount: number;
    }
  | {
      type: "box";
      transform: ShapeTransform;
      dimensions: Vec3;
      thickness: Vec3;
      randomDirectionAmount: number;
      sphericalDirectionAmount: number;
      randomPositionAmount: number;
    }
  | {
      type: "circle";
      transform: ShapeTransform;
      radius: number;
      innerRadius: number;
      arc: ArcSpec;
      randomDirectionAmount: number;
      sphericalDirectionAmount: number;
      randomPositionAmount: number;
    }
  | {
      type: "cone";
      transform: ShapeTransform;
      radius: number;
      innerRadius: number;
      arc: ArcSpec;
      angleDegrees: number;
      length: number;
      emissionSurface: string;
      randomDirectionAmount: number;
      sphericalDirectionAmount: number;
      randomPositionAmount: number;
    };

interface BurstSpec {
  timeSeconds: number;
  count: MinMaxCurve;
  cycleCount: number;
  repeatIntervalSeconds: number;
  probability: number;
}

interface InitialModule {
  maxParticles: number;
  startLifetime: MinMaxCurve;
  startSpeed: MinMaxCurve;
  startSizeX: MinMaxCurve;
  startSizeY: MinMaxCurve;
  startSizeZ: MinMaxCurve;
  startRotationX: MinMaxCurve;
  startRotationY: MinMaxCurve;
  startRotationZ: MinMaxCurve;
  startColor: MinMaxGradient;
  gravityMultiplier: MinMaxCurve;
  randomizeRotationDirection: number;
  customEmitterVelocity: Vec3;
}

interface TextureSheetModule {
  tilesX: number;
  tilesY: number;
  frameOverTime: MinMaxCurve;
  startFrame: MinMaxCurve;
  cycles: number;
  flipU: number;
  flipV: number;
  uvChannelMask: number;
}

interface LimitVelocityModule {
  dampen: number;
  limit: MinMaxCurve;
  drag: MinMaxCurve;
  multiplyDragByParticleSize: boolean;
  multiplyDragByParticleVelocity: boolean;
}

interface VelocityModule {
  space: "local" | "world";
  x: MinMaxCurve;
  y: MinMaxCurve;
  z: MinMaxCurve;
  speedModifier: MinMaxCurve;
  orbitalZ: MinMaxCurve | null;
}

interface MaterialSpec {
  id: string;
  textureResource: string;
  textureAddressModeU: BandoriEffectTextureAddressMode;
  textureAddressModeV: BandoriEffectTextureAddressMode;
  blendSource: string;
  blendDestination: string;
  blendEquation: string;
  premultipliedAlpha: boolean;
}

interface MeshSpec {
  pathId: string;
  vertices: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
}

interface RendererSpec {
  enabled: boolean;
  mode: "billboard" | "mesh" | "stretched-billboard";
  alignment: "view" | "local";
  material: MaterialSpec | null;
  mesh: MeshSpec | null;
  sortingLayerId: number;
  sortingOrder: number;
  sortingFudge: number;
  rendererPriority: number;
  pivot: Vec3;
  flipX: number;
  flipY: number;
  cameraVelocityScale: number;
  velocityScale: number;
  lengthScale: number;
  rotateWithStretchDirection: boolean;
}

interface CompiledSystem {
  hierarchyPath: string;
  durationSeconds: number;
  startDelay: MinMaxCurve;
  simulationSpeed: number;
  looping: boolean;
  prewarm: boolean;
  simulationSpace: string;
  initial: InitialModule;
  rateOverTime: MinMaxCurve;
  rateOverDistance: MinMaxCurve;
  bursts: BurstSpec[];
  shape: ShapeSpec | null;
  colorOverLifetime: MinMaxGradient | null;
  sizeOverLifetimeX: MinMaxCurve | null;
  sizeOverLifetimeY: MinMaxCurve | null;
  sizeOverLifetimeZ: MinMaxCurve | null;
  rotationOverLifetimeX: MinMaxCurve | null;
  rotationOverLifetimeY: MinMaxCurve | null;
  rotationOverLifetimeZ: MinMaxCurve | null;
  textureSheet: TextureSheetModule | null;
  velocityOverLifetime: VelocityModule | null;
  limitVelocity: LimitVelocityModule | null;
  customDataVector0W: MinMaxCurve | null;
  renderer: RendererSpec;
  worldPosition: Vec3;
  worldRotation: Quaternion;
  worldScale: Vec3;
  autoRandomSeed: boolean;
  serializedRandomSeed: number;
  particles: ParticlePool;
  renderInstances: BandoriEffectFrameInstance[];
  nextOrdinal: number;
  rateCarry: number;
}

interface ParticlePool {
  alive: Uint8Array;
  ordinal: Uint32Array;
  birth: Float64Array;
  lifetime: Float32Array;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  vz: Float32Array;
  sizeX: Float32Array;
  sizeY: Float32Array;
  sizeZ: Float32Array;
  rotationX: Float32Array;
  rotationY: Float32Array;
  rotationZ: Float32Array;
  colorR: Float32Array;
  colorG: Float32Array;
  colorB: Float32Array;
  colorA: Float32Array;
}

interface CompiledRecipe {
  initialRootActive: boolean;
  longHold: boolean;
  pixelsPerWorldUnit: number;
  sourceButtons: Vec3[];
  screenButtons: Array<{ x: number; y: number }>;
  materials: Map<string, MaterialSpec>;
  systems: CompiledSystem[];
  frameCapacity: number;
}

function fail(path: string, message: string): never {
  throw new Error(`Invalid Bandori effect recipe at ${path}: ${message}`);
}

function record(value: unknown, path: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "expected object");
  }
  return value as JsonRecord;
}

function exactKeys(
  value: JsonRecord,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${path}.${key}`, "unknown field");
  }
  for (const key of required) {
    if (!(key in value)) fail(`${path}.${key}`, "missing field");
  }
}

function finite(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path, "expected finite number");
  }
  return value;
}

function integer(value: unknown, path: string): number {
  const result = finite(value, path);
  if (!Number.isInteger(result)) fail(path, "expected integer");
  return result;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "expected boolean");
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(path, "expected non-empty string");
  }
  return value;
}

function textureAddressMode(
  value: unknown,
  path: string,
): BandoriEffectTextureAddressMode {
  const result = text(value, path);
  if (result !== "clamp-to-edge" && result !== "repeat") {
    fail(path, "unsupported texture address mode");
  }
  return result;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "expected array");
  return value;
}

function vec3(value: unknown, path: string): Vec3 {
  const source = record(value, path);
  exactKeys(source, path, ["x", "y", "z"]);
  return {
    x: finite(source.x, `${path}.x`),
    y: finite(source.y, `${path}.y`),
    z: finite(source.z, `${path}.z`),
  };
}

function quaternion(value: unknown, path: string): Quaternion {
  const source = record(value, path);
  exactKeys(source, path, ["w", "x", "y", "z"]);
  const result = {
    w: finite(source.w, `${path}.w`),
    x: finite(source.x, `${path}.x`),
    y: finite(source.y, `${path}.y`),
    z: finite(source.z, `${path}.z`),
  };
  const length = Math.hypot(result.w, result.x, result.y, result.z);
  if (length <= EPSILON) fail(path, "zero quaternion");
  result.w /= length;
  result.x /= length;
  result.y /= length;
  result.z /= length;
  return result;
}

function color(value: unknown, path: string): BandoriEffectColor {
  const source = record(value, path);
  exactKeys(source, path, ["a", "b", "g", "r"]);
  return {
    r: finite(source.r, `${path}.r`),
    g: finite(source.g, `${path}.g`),
    b: finite(source.b, `${path}.b`),
    a: finite(source.a, `${path}.a`),
  };
}

function curveKey(value: unknown, path: string): CurveKey {
  const source = record(value, path);
  exactKeys(source, path, [
    "inSlope",
    "inWeight",
    "outSlope",
    "outWeight",
    "time",
    "value",
    "weightedMode",
  ], ["stepAfter"]);
  if (source.weightedMode !== "none") {
    fail(`${path}.weightedMode`, "only none is supported");
  }
  finite(source.inWeight, `${path}.inWeight`);
  finite(source.outWeight, `${path}.outWeight`);
  return {
    time: finite(source.time, `${path}.time`),
    value: finite(source.value, `${path}.value`),
    inSlope: finite(source.inSlope, `${path}.inSlope`),
    outSlope: finite(source.outSlope, `${path}.outSlope`),
    stepAfter: source.stepAfter === undefined
      ? false
      : bool(source.stepAfter, `${path}.stepAfter`),
  };
}

function animationCurve(value: unknown, path: string): AnimationCurve {
  const source = record(value, path);
  exactKeys(source, path, ["interpolation", "keys", "postWrap", "preWrap"]);
  if (source.interpolation !== "unity-hermite") {
    fail(`${path}.interpolation`, "only unity-hermite is supported");
  }
  if (source.preWrap !== "clamp-forever" || source.postWrap !== "clamp-forever") {
    fail(path, "only clamp-forever wrap mode is supported");
  }
  const keys = array(source.keys, `${path}.keys`).map((entry, index) =>
    curveKey(entry, `${path}.keys[${index}]`),
  );
  if (keys.length === 0) fail(`${path}.keys`, "expected at least one key");
  for (let index = 1; index < keys.length; index += 1) {
    if (keys[index].time < keys[index - 1].time) {
      fail(`${path}.keys`, "key times must be sorted");
    }
  }
  return { keys };
}

function minMaxCurve(value: unknown, path: string): MinMaxCurve {
  const source = record(value, path);
  const mode = text(source.mode, `${path}.mode`);
  const common = ["domain", "mode", "unit"] as const;
  text(source.domain, `${path}.domain`);
  text(source.unit, `${path}.unit`);
  switch (mode) {
    case "constant":
      exactKeys(source, path, [...common, "value"]);
      return { mode, value: finite(source.value, `${path}.value`) };
    case "curve":
      exactKeys(source, path, [...common, "curve", "multiplier"]);
      return {
        mode,
        multiplier: finite(source.multiplier, `${path}.multiplier`),
        curve: animationCurve(source.curve, `${path}.curve`),
      };
    case "uniform-between-constants":
      exactKeys(source, path, [...common, "maximum", "minimum", "sample"]);
      if (source.sample !== "uniform-once-per-particle") {
        fail(`${path}.sample`, "unsupported distribution");
      }
      return {
        mode,
        minimum: finite(source.minimum, `${path}.minimum`),
        maximum: finite(source.maximum, `${path}.maximum`),
      };
    case "uniform-between-curves":
      exactKeys(source, path, [
        ...common,
        "maximumCurve",
        "maximumMultiplier",
        "minimumCurve",
        "minimumMultiplier",
        "sample",
      ]);
      if (source.sample !== "uniform-once-per-particle") {
        fail(`${path}.sample`, "unsupported distribution");
      }
      return {
        mode,
        minimumMultiplier: finite(
          source.minimumMultiplier,
          `${path}.minimumMultiplier`,
        ),
        maximumMultiplier: finite(
          source.maximumMultiplier,
          `${path}.maximumMultiplier`,
        ),
        minimumCurve: animationCurve(source.minimumCurve, `${path}.minimumCurve`),
        maximumCurve: animationCurve(source.maximumCurve, `${path}.maximumCurve`),
      };
    default:
      fail(`${path}.mode`, `unsupported curve mode ${mode}`);
  }
}

function gradient(value: unknown, path: string): Gradient {
  const source = record(value, path);
  exactKeys(source, path, [
    "alphaKeys",
    "colorKeys",
    "interpolation",
    "serializedColorSpace",
  ]);
  if (source.interpolation !== "linear" && source.interpolation !== "fixed") {
    fail(`${path}.interpolation`, "unsupported gradient interpolation");
  }
  integer(source.serializedColorSpace, `${path}.serializedColorSpace`);
  const colorKeys = array(source.colorKeys, `${path}.colorKeys`).map(
    (entry, index): GradientColorKey => {
      const keyPath = `${path}.colorKeys[${index}]`;
      const key = record(entry, keyPath);
      exactKeys(key, keyPath, ["color", "time"]);
      const rgb = record(key.color, `${keyPath}.color`);
      exactKeys(rgb, `${keyPath}.color`, ["b", "g", "r"]);
      return {
        time: finite(key.time, `${keyPath}.time`),
        color: {
          r: finite(rgb.r, `${keyPath}.color.r`),
          g: finite(rgb.g, `${keyPath}.color.g`),
          b: finite(rgb.b, `${keyPath}.color.b`),
        },
      };
    },
  );
  const alphaKeys = array(source.alphaKeys, `${path}.alphaKeys`).map(
    (entry, index): GradientAlphaKey => {
      const keyPath = `${path}.alphaKeys[${index}]`;
      const key = record(entry, keyPath);
      exactKeys(key, keyPath, ["alpha", "time"]);
      return {
        time: finite(key.time, `${keyPath}.time`),
        alpha: finite(key.alpha, `${keyPath}.alpha`),
      };
    },
  );
  if (colorKeys.length === 0 || alphaKeys.length === 0) {
    fail(path, "gradient requires color and alpha keys");
  }
  return { interpolation: source.interpolation, colorKeys, alphaKeys };
}

function minMaxGradient(value: unknown, path: string): MinMaxGradient {
  const source = record(value, path);
  const mode = text(source.mode, `${path}.mode`);
  text(source.domain, `${path}.domain`);
  switch (mode) {
    case "color":
      exactKeys(source, path, ["color", "domain", "mode"]);
      return { mode, color: color(source.color, `${path}.color`) };
    case "gradient":
      exactKeys(source, path, ["domain", "gradient", "mode"]);
      return { mode, gradient: gradient(source.gradient, `${path}.gradient`) };
    case "random-color-from-gradient":
      exactKeys(source, path, ["domain", "gradient", "mode", "sample"]);
      if (source.sample !== "uniform-gradient-position-once-per-particle") {
        fail(`${path}.sample`, "unsupported distribution");
      }
      return { mode, gradient: gradient(source.gradient, `${path}.gradient`) };
    case "uniform-between-colors":
      exactKeys(source, path, [
        "domain",
        "maximumColor",
        "minimumColor",
        "mode",
        "sample",
      ]);
      if (source.sample !== "uniform-once-per-particle") {
        fail(`${path}.sample`, "unsupported distribution");
      }
      return {
        mode,
        minimumColor: color(source.minimumColor, `${path}.minimumColor`),
        maximumColor: color(source.maximumColor, `${path}.maximumColor`),
      };
    case "uniform-between-gradients":
      exactKeys(source, path, [
        "domain",
        "maximumGradient",
        "minimumGradient",
        "mode",
        "sample",
      ]);
      if (source.sample !== "uniform-once-per-particle") {
        fail(`${path}.sample`, "unsupported distribution");
      }
      return {
        mode,
        minimumGradient: gradient(source.minimumGradient, `${path}.minimumGradient`),
        maximumGradient: gradient(source.maximumGradient, `${path}.maximumGradient`),
      };
    default:
      fail(`${path}.mode`, `unsupported gradient mode ${mode}`);
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function evaluateAnimationCurve(curve: AnimationCurve, input: number): number {
  const keys = curve.keys;
  if (input <= keys[0].time) return keys[0].value;
  const last = keys[keys.length - 1];
  if (input >= last.time) return last.value;
  for (let index = 1; index < keys.length; index += 1) {
    const right = keys[index];
    if (input > right.time) continue;
    const left = keys[index - 1];
    const duration = right.time - left.time;
    if (duration <= EPSILON) return right.value;
    if (left.stepAfter) return left.value;
    const amount = (input - left.time) / duration;
    const amount2 = amount * amount;
    const amount3 = amount2 * amount;
    const h00 = 2 * amount3 - 3 * amount2 + 1;
    const h10 = amount3 - 2 * amount2 + amount;
    const h01 = -2 * amount3 + 3 * amount2;
    const h11 = amount3 - amount2;
    return (
      h00 * left.value +
      h10 * left.outSlope * duration +
      h01 * right.value +
      h11 * right.inSlope * duration
    );
  }
  return last.value;
}

function evaluateCurve(curve: MinMaxCurve, input: number, random01: number): number {
  const random = clamp01(random01);
  switch (curve.mode) {
    case "constant":
      return curve.value;
    case "curve":
      return curve.multiplier * evaluateAnimationCurve(curve.curve, input);
    case "uniform-between-constants":
      return lerp(curve.minimum, curve.maximum, random);
    case "uniform-between-curves":
      return lerp(
        curve.minimumMultiplier * evaluateAnimationCurve(curve.minimumCurve, input),
        curve.maximumMultiplier * evaluateAnimationCurve(curve.maximumCurve, input),
        random,
      );
  }
}

function sampleKeys<T extends { time: number }>(
  keys: readonly T[],
  input: number,
  interpolation: "linear" | "fixed",
  read: (key: T) => number,
): number {
  if (input <= keys[0].time) return read(keys[0]);
  const last = keys[keys.length - 1];
  if (input >= last.time) return read(last);
  for (let index = 1; index < keys.length; index += 1) {
    const right = keys[index];
    if (input > right.time) continue;
    const left = keys[index - 1];
    if (interpolation === "fixed") return read(left);
    const span = right.time - left.time;
    const amount = span <= EPSILON ? 1 : (input - left.time) / span;
    return lerp(read(left), read(right), amount);
  }
  return read(last);
}

function evaluateGradientValue(
  source: Gradient,
  input: number,
  target: BandoriEffectColor,
): BandoriEffectColor {
  const time = clamp01(input);
  target.r = sampleKeys(source.colorKeys, time, source.interpolation, readColorR);
  target.g = sampleKeys(source.colorKeys, time, source.interpolation, readColorG);
  target.b = sampleKeys(source.colorKeys, time, source.interpolation, readColorB);
  target.a = sampleKeys(source.alphaKeys, time, source.interpolation, readAlpha);
  return target;
}

function sampleFixedRandomKey<T extends { time: number }>(
  keys: readonly T[],
  random01: number,
  read: (key: T) => number,
): number {
  const random = clamp01(random01);
  for (const key of keys) {
    if (random <= key.time) return read(key);
  }
  return read(keys[keys.length - 1]);
}

function evaluateRandomColorGradient(
  source: Gradient,
  random01: number,
  target: BandoriEffectColor,
): BandoriEffectColor {
  if (source.interpolation !== "fixed") {
    return evaluateGradientValue(source, random01, target);
  }

  // Unity Fixed Random Color uses key times as cumulative selection bounds.
  // Generic Fixed lifetime interpolation instead returns the preceding key.
  target.r = sampleFixedRandomKey(source.colorKeys, random01, readColorR);
  target.g = sampleFixedRandomKey(source.colorKeys, random01, readColorG);
  target.b = sampleFixedRandomKey(source.colorKeys, random01, readColorB);
  target.a = sampleFixedRandomKey(source.alphaKeys, random01, readAlpha);
  return target;
}

function readColorR(key: GradientColorKey): number {
  return key.color.r;
}

function readColorG(key: GradientColorKey): number {
  return key.color.g;
}

function readColorB(key: GradientColorKey): number {
  return key.color.b;
}

function readAlpha(key: GradientAlphaKey): number {
  return key.alpha;
}

function mixColor(
  target: BandoriEffectColor,
  left: BandoriEffectColor,
  right: BandoriEffectColor,
  amount: number,
): BandoriEffectColor {
  target.r = lerp(left.r, right.r, amount);
  target.g = lerp(left.g, right.g, amount);
  target.b = lerp(left.b, right.b, amount);
  target.a = lerp(left.a, right.a, amount);
  return target;
}

function evaluateGradient(
  source: MinMaxGradient,
  input: number,
  random01: number,
  target: BandoriEffectColor,
): BandoriEffectColor {
  const random = clamp01(random01);
  switch (source.mode) {
    case "color":
      return mixColor(target, source.color, source.color, 0);
    case "gradient": {
      return evaluateGradientValue(source.gradient, input, target);
    }
    case "random-color-from-gradient": {
      return evaluateRandomColorGradient(source.gradient, random, target);
    }
    case "uniform-between-colors":
      return mixColor(target, source.minimumColor, source.maximumColor, random);
    case "uniform-between-gradients": {
      const time = clamp01(input);
      target.r = lerp(
        sampleKeys(source.minimumGradient.colorKeys, time, source.minimumGradient.interpolation, readColorR),
        sampleKeys(source.maximumGradient.colorKeys, time, source.maximumGradient.interpolation, readColorR),
        random,
      );
      target.g = lerp(
        sampleKeys(source.minimumGradient.colorKeys, time, source.minimumGradient.interpolation, readColorG),
        sampleKeys(source.maximumGradient.colorKeys, time, source.maximumGradient.interpolation, readColorG),
        random,
      );
      target.b = lerp(
        sampleKeys(source.minimumGradient.colorKeys, time, source.minimumGradient.interpolation, readColorB),
        sampleKeys(source.maximumGradient.colorKeys, time, source.maximumGradient.interpolation, readColorB),
        random,
      );
      target.a = lerp(
        sampleKeys(source.minimumGradient.alphaKeys, time, source.minimumGradient.interpolation, readAlpha),
        sampleKeys(source.maximumGradient.alphaKeys, time, source.maximumGradient.interpolation, readAlpha),
        random,
      );
      return target;
    }
  }
}

/** Strict standalone evaluator used by tests and dev tooling. */
export function evaluateBandoriEffectGradient(
  source: unknown,
  domainValue: number,
  random01: number,
): BandoriEffectColor {
  if (!Number.isFinite(domainValue) || !Number.isFinite(random01)) {
    throw new Error("Bandori effect gradient inputs must be finite");
  }
  return evaluateGradient(
    minMaxGradient(source, "gradient"),
    domainValue,
    random01,
    { r: 0, g: 0, b: 0, a: 0 },
  );
}

function parseShapeTransform(value: unknown, path: string): ShapeTransform {
  const source = record(value, path);
  exactKeys(source, path, ["positionWorldUnits", "rotationDegrees", "scale"]);
  return {
    position: vec3(source.positionWorldUnits, `${path}.positionWorldUnits`),
    rotation: vec3(source.rotationDegrees, `${path}.rotationDegrees`),
    scale: vec3(source.scale, `${path}.scale`),
  };
}

function parseShapeDirection(
  value: unknown,
  path: string,
): {
  randomDirectionAmount: number;
  sphericalDirectionAmount: number;
  randomPositionAmount: number;
} {
  const source = record(value, path);
  exactKeys(source, path, [
    "alignToDirection",
    "randomDirectionAmount",
    "randomPositionAmountWorldUnits",
    "sphericalDirectionAmount",
  ]);
  bool(source.alignToDirection, `${path}.alignToDirection`);
  return {
    randomDirectionAmount: finite(
      source.randomDirectionAmount,
      `${path}.randomDirectionAmount`,
    ),
    sphericalDirectionAmount: finite(
      source.sphericalDirectionAmount,
      `${path}.sphericalDirectionAmount`,
    ),
    randomPositionAmount: finite(
      source.randomPositionAmountWorldUnits,
      `${path}.randomPositionAmountWorldUnits`,
    ),
  };
}

function parseArc(value: unknown, path: string): ArcSpec {
  const source = record(value, path);
  exactKeys(source, path, ["degrees", "mode", "speed", "spread"]);
  if (source.mode !== "random" && source.mode !== "burst-spread") {
    fail(`${path}.mode`, "unsupported arc mode");
  }
  const speed = minMaxCurve(source.speed, `${path}.speed`);
  const spread = finite(source.spread, `${path}.spread`);
  const degrees = finite(source.degrees, `${path}.degrees`);
  if (source.mode === "burst-spread") {
    if (Math.abs(spread) > EPSILON) {
      fail(`${path}.spread`, "burst-spread approximation requires zero spread");
    }
    if (Math.abs(degrees - 360) > EPSILON) {
      fail(`${path}.degrees`, "burst-spread approximation requires a full arc");
    }
    if (speed.mode !== "constant" || Math.abs(speed.value - 1) > EPSILON) {
      fail(`${path}.speed`, "burst-spread approximation requires constant speed 1");
    }
  }
  return {
    degrees,
    mode: source.mode,
  };
}

function parseRadius(
  value: unknown,
  path: string,
): { outer: number; inner: number } {
  const source = record(value, path);
  exactKeys(source, path, ["innerWorldUnits", "outerWorldUnits", "thickness"]);
  finite(source.thickness, `${path}.thickness`);
  return {
    inner: finite(source.innerWorldUnits, `${path}.innerWorldUnits`),
    outer: finite(source.outerWorldUnits, `${path}.outerWorldUnits`),
  };
}

function shape(value: unknown, path: string): ShapeSpec {
  const source = record(value, path);
  const type = text(source.type, `${path}.type`);
  const distribution = record(source.distribution, `${path}.distribution`);
  exactKeys(distribution, `${path}.distribution`, ["algorithm", "sample"]);
  if (distribution.sample !== "uniform-once-per-particle") {
    fail(`${path}.distribution.sample`, "unsupported shape distribution");
  }
  const direction = parseShapeDirection(source.direction, `${path}.direction`);
  const transform = parseShapeTransform(source.transform, `${path}.transform`);
  if (type === "sphere") {
    exactKeys(source, path, [
      "direction",
      "distribution",
      "radius",
      "transform",
      "type",
    ]);
    if (distribution.algorithm !== "bounded-sphere-shell") {
      fail(`${path}.distribution.algorithm`, "unsupported sphere algorithm");
    }
    const radius = parseRadius(source.radius, `${path}.radius`);
    return {
      type,
      transform,
      radius: radius.outer,
      innerRadius: radius.inner,
      ...direction,
    };
  }
  if (type === "box") {
    exactKeys(source, path, [
      "boxThickness",
      "dimensionsWorldUnits",
      "direction",
      "distribution",
      "transform",
      "type",
    ]);
    if (distribution.algorithm !== "unity-box-volume") {
      fail(`${path}.distribution.algorithm`, "unsupported box algorithm");
    }
    return {
      type,
      transform,
      dimensions: vec3(source.dimensionsWorldUnits, `${path}.dimensionsWorldUnits`),
      thickness: vec3(source.boxThickness, `${path}.boxThickness`),
      ...direction,
    };
  }
  if (type === "circle") {
    exactKeys(source, path, [
      "arc",
      "direction",
      "distribution",
      "radius",
      "transform",
      "type",
    ]);
    if (distribution.algorithm !== "unity-circle-annulus") {
      fail(`${path}.distribution.algorithm`, "unsupported circle algorithm");
    }
    const radius = parseRadius(source.radius, `${path}.radius`);
    return {
      type,
      transform,
      radius: radius.outer,
      innerRadius: radius.inner,
      arc: parseArc(source.arc, `${path}.arc`),
      ...direction,
    };
  }
  if (type === "cone") {
    exactKeys(source, path, [
      "angleDegrees",
      "arc",
      "direction",
      "distribution",
      "emissionSurface",
      "lengthWorldUnits",
      "radius",
      "transform",
      "type",
    ]);
    if (distribution.algorithm !== "unity-cone-base-annulus") {
      fail(`${path}.distribution.algorithm`, "unsupported cone algorithm");
    }
    const radius = parseRadius(source.radius, `${path}.radius`);
    return {
      type,
      transform,
      radius: radius.outer,
      innerRadius: radius.inner,
      arc: parseArc(source.arc, `${path}.arc`),
      angleDegrees: finite(source.angleDegrees, `${path}.angleDegrees`),
      length: finite(source.lengthWorldUnits, `${path}.lengthWorldUnits`),
      emissionSurface: text(source.emissionSurface, `${path}.emissionSurface`),
      ...direction,
    };
  }
  return fail(`${path}.type`, `unsupported shape ${type}`);
}

function axisCurves(
  value: unknown,
  path: string,
  defaultMissingAxes: boolean,
): { x: MinMaxCurve; y: MinMaxCurve; z: MinMaxCurve } {
  const source = record(value, path);
  const separateAxes = bool(source.separateAxes, `${path}.separateAxes`);
  if (separateAxes) {
    exactKeys(source, path, ["separateAxes", "x", "y", "z"]);
    return {
      x: minMaxCurve(source.x, `${path}.x`),
      y: minMaxCurve(source.y, `${path}.y`),
      z: minMaxCurve(source.z, `${path}.z`),
    };
  }
  const scalarKey = defaultMissingAxes ? "x" : "z";
  exactKeys(source, path, ["separateAxes", scalarKey]);
  const scalar = minMaxCurve(source[scalarKey], `${path}.${scalarKey}`);
  return defaultMissingAxes
    ? { x: scalar, y: scalar, z: scalar }
    : { x: ZERO_CURVE, y: ZERO_CURVE, z: scalar };
}

function initialModule(value: unknown, path: string): InitialModule {
  const source = record(value, path);
  exactKeys(source, path, [
    "customEmitterVelocityWorldUnitsPerSecond",
    "gravity",
    "maxParticles",
    "randomizeRotationDirection",
    "startColor",
    "startLifetime",
    "startRotation",
    "startSize",
    "startSpeed",
  ]);
  const gravity = record(source.gravity, `${path}.gravity`);
  exactKeys(gravity, `${path}.gravity`, ["multiplier", "source"]);
  if (gravity.source !== "physics-3d") {
    fail(`${path}.gravity.source`, "only physics-3d is supported");
  }
  const startSize = axisCurves(source.startSize, `${path}.startSize`, true);
  const startRotation = axisCurves(
    source.startRotation,
    `${path}.startRotation`,
    false,
  );
  const maxParticles = integer(source.maxParticles, `${path}.maxParticles`);
  if (maxParticles < 0 || maxParticles > 100_000) {
    fail(`${path}.maxParticles`, "outside safe runtime range");
  }
  return {
    maxParticles,
    startLifetime: minMaxCurve(source.startLifetime, `${path}.startLifetime`),
    startSpeed: minMaxCurve(source.startSpeed, `${path}.startSpeed`),
    startSizeX: startSize.x,
    startSizeY: startSize.y,
    startSizeZ: startSize.z,
    startRotationX: startRotation.x,
    startRotationY: startRotation.y,
    startRotationZ: startRotation.z,
    startColor: minMaxGradient(source.startColor, `${path}.startColor`),
    gravityMultiplier: minMaxCurve(gravity.multiplier, `${path}.gravity.multiplier`),
    randomizeRotationDirection: finite(
      source.randomizeRotationDirection,
      `${path}.randomizeRotationDirection`,
    ),
    customEmitterVelocity: vec3(
      source.customEmitterVelocityWorldUnitsPerSecond,
      `${path}.customEmitterVelocityWorldUnitsPerSecond`,
    ),
  };
}

function emissionModule(
  value: unknown,
  path: string,
): { rateOverTime: MinMaxCurve; rateOverDistance: MinMaxCurve; bursts: BurstSpec[] } {
  const source = record(value, path);
  exactKeys(source, path, ["bursts", "rateOverDistance", "rateOverTime"]);
  const bursts = array(source.bursts, `${path}.bursts`).map((entry, index) => {
    const burstPath = `${path}.bursts[${index}]`;
    const burst = record(entry, burstPath);
    exactKeys(burst, burstPath, [
      "count",
      "cycleCount",
      "probability",
      "repeatIntervalSeconds",
      "timeSeconds",
    ]);
    const cycleCount = integer(burst.cycleCount, `${burstPath}.cycleCount`);
    if (cycleCount < 0) fail(`${burstPath}.cycleCount`, "must be non-negative");
    return {
      timeSeconds: finite(burst.timeSeconds, `${burstPath}.timeSeconds`),
      count: minMaxCurve(burst.count, `${burstPath}.count`),
      cycleCount,
      repeatIntervalSeconds: finite(
        burst.repeatIntervalSeconds,
        `${burstPath}.repeatIntervalSeconds`,
      ),
      probability: finite(burst.probability, `${burstPath}.probability`),
    };
  });
  return {
    rateOverTime: minMaxCurve(source.rateOverTime, `${path}.rateOverTime`),
    rateOverDistance: minMaxCurve(source.rateOverDistance, `${path}.rateOverDistance`),
    bursts,
  };
}

function textureSheetModule(value: unknown, path: string): TextureSheetModule {
  const source = record(value, path);
  exactKeys(source, path, [
    "cycles",
    "flipProbability",
    "frameOverTime",
    "startFrame",
    "tiles",
    "timeMode",
    "type",
    "uvChannelMask",
  ]);
  if (source.type !== "whole-sheet-grid") {
    fail(`${path}.type`, "only whole-sheet-grid is supported");
  }
  if (source.timeMode !== "normalized-particle-lifetime") {
    fail(`${path}.timeMode`, "unsupported time mode");
  }
  const tiles = record(source.tiles, `${path}.tiles`);
  exactKeys(tiles, `${path}.tiles`, ["x", "y"]);
  const flip = record(source.flipProbability, `${path}.flipProbability`);
  exactKeys(flip, `${path}.flipProbability`, ["u", "v"]);
  const tilesX = integer(tiles.x, `${path}.tiles.x`);
  const tilesY = integer(tiles.y, `${path}.tiles.y`);
  if (tilesX <= 0 || tilesY <= 0) fail(`${path}.tiles`, "must be positive");
  return {
    tilesX,
    tilesY,
    frameOverTime: minMaxCurve(source.frameOverTime, `${path}.frameOverTime`),
    startFrame: minMaxCurve(source.startFrame, `${path}.startFrame`),
    cycles: finite(source.cycles, `${path}.cycles`),
    flipU: finite(flip.u, `${path}.flipProbability.u`),
    flipV: finite(flip.v, `${path}.flipProbability.v`),
    uvChannelMask: integer(source.uvChannelMask, `${path}.uvChannelMask`),
  };
}

function limitVelocityModule(value: unknown, path: string): LimitVelocityModule {
  const source = record(value, path);
  exactKeys(source, path, [
    "dampen",
    "drag",
    "limit",
    "multiplyDragByParticleSize",
    "multiplyDragByParticleVelocity",
    "separateAxes",
    "space",
  ]);
  if (bool(source.separateAxes, `${path}.separateAxes`)) {
    fail(`${path}.separateAxes`, "axis-separated limits are outside the frozen profile");
  }
  if (source.space !== "local" && source.space !== "world") {
    fail(`${path}.space`, "unsupported velocity space");
  }
  return {
    dampen: finite(source.dampen, `${path}.dampen`),
    limit: minMaxCurve(source.limit, `${path}.limit`),
    drag: minMaxCurve(source.drag, `${path}.drag`),
    multiplyDragByParticleSize: bool(
      source.multiplyDragByParticleSize,
      `${path}.multiplyDragByParticleSize`,
    ),
    multiplyDragByParticleVelocity: bool(
      source.multiplyDragByParticleVelocity,
      `${path}.multiplyDragByParticleVelocity`,
    ),
  };
}

function velocityModule(value: unknown, path: string): VelocityModule {
  const source = record(value, path);
  exactKeys(source, path, ["space", "speedModifier", "x", "y", "z"], ["orbitalZ"]);
  if (source.space !== "local" && source.space !== "world") {
    fail(`${path}.space`, "unsupported velocity space");
  }
  const orbitalZ = source.orbitalZ === undefined
    ? null
    : minMaxCurve(source.orbitalZ, `${path}.orbitalZ`);
  if (
    orbitalZ !== null
    && (
      source.space !== "world"
      || orbitalZ.mode !== "constant"
      || Math.abs(orbitalZ.value + 4) > EPSILON
    )
  ) {
    fail(`${path}.orbitalZ`, "unsupported orbital Z approximation profile");
  }
  return {
    space: source.space,
    x: minMaxCurve(source.x, `${path}.x`),
    y: minMaxCurve(source.y, `${path}.y`),
    z: minMaxCurve(source.z, `${path}.z`),
    speedModifier: minMaxCurve(source.speedModifier, `${path}.speedModifier`),
    orbitalZ,
  };
}

function particlePool(capacity: number): ParticlePool {
  return {
    alive: new Uint8Array(capacity),
    ordinal: new Uint32Array(capacity),
    birth: new Float64Array(capacity),
    lifetime: new Float32Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    z: new Float32Array(capacity),
    vx: new Float32Array(capacity),
    vy: new Float32Array(capacity),
    vz: new Float32Array(capacity),
    sizeX: new Float32Array(capacity),
    sizeY: new Float32Array(capacity),
    sizeZ: new Float32Array(capacity),
    rotationX: new Float32Array(capacity),
    rotationY: new Float32Array(capacity),
    rotationZ: new Float32Array(capacity),
    colorR: new Float32Array(capacity),
    colorG: new Float32Array(capacity),
    colorB: new Float32Array(capacity),
    colorA: new Float32Array(capacity),
  };
}

function parseMaterials(value: unknown, path: string): Map<string, MaterialSpec> {
  const source = record(value, path);
  const result = new Map<string, MaterialSpec>();
  for (const [id, rawMaterial] of Object.entries(source)) {
    const materialPath = `${path}.${id}`;
    const material = record(rawMaterial, materialPath);
    exactKeys(material, materialPath, ["mainTexture", "shader"], ["sampler"]);
    let textureAddressModeU: BandoriEffectTextureAddressMode = "repeat";
    let textureAddressModeV: BandoriEffectTextureAddressMode = "clamp-to-edge";
    if (material.sampler !== undefined) {
      const samplerPath = `${materialPath}.sampler`;
      const sampler = record(material.sampler, samplerPath);
      exactKeys(sampler, samplerPath, ["addressModeU", "addressModeV"]);
      textureAddressModeU = textureAddressMode(
        sampler.addressModeU,
        `${samplerPath}.addressModeU`,
      );
      textureAddressModeV = textureAddressMode(
        sampler.addressModeV,
        `${samplerPath}.addressModeV`,
      );
    }
    const shader = record(material.shader, `${materialPath}.shader`);
    exactKeys(shader, `${materialPath}.shader`, ["blend"]);
    const blend = record(shader.blend, `${materialPath}.shader.blend`);
    exactKeys(blend, `${materialPath}.shader.blend`, [
      "destination",
      "equation",
      "premultipliedAlpha",
      "source",
      "zWrite",
    ]);
    if (bool(blend.zWrite, `${materialPath}.shader.blend.zWrite`)) {
      fail(`${materialPath}.shader.blend.zWrite`, "z-write is outside the profile");
    }
    result.set(id, {
      id,
      textureResource: text(material.mainTexture, `${materialPath}.mainTexture`),
      textureAddressModeU,
      textureAddressModeV,
      blendSource: text(blend.source, `${materialPath}.shader.blend.source`),
      blendDestination: text(
        blend.destination,
        `${materialPath}.shader.blend.destination`,
      ),
      blendEquation: text(blend.equation, `${materialPath}.shader.blend.equation`),
      premultipliedAlpha: bool(
        blend.premultipliedAlpha,
        `${materialPath}.shader.blend.premultipliedAlpha`,
      ),
    });
  }
  return result;
}

function parseMeshes(value: unknown, path: string): Map<string, MeshSpec> {
  const source = record(value, path);
  const result = new Map<string, MeshSpec>();
  for (const [id, rawMesh] of Object.entries(source)) {
    const meshPath = `${path}.${id}`;
    const mesh = record(rawMesh, meshPath);
    exactKeys(mesh, meshPath, [
      "indices",
      "name",
      "pathId",
      "profile",
      "rawObjectSha256",
      "uvs",
      "vertices",
    ]);
    const expected = BOUNDED_CUSTOM_MESH_PROFILES.get(id);
    if (!expected) fail(meshPath, "mesh path is outside the Witch allowlist");
    if (text(mesh.pathId, `${meshPath}.pathId`) !== id) {
      fail(`${meshPath}.pathId`, "does not match the mesh registry key");
    }
    if (mesh.profile !== expected.profile || mesh.name !== expected.name) {
      fail(meshPath, "mesh profile identity changed");
    }
    if (
      text(mesh.rawObjectSha256, `${meshPath}.rawObjectSha256`)
      !== expected.rawObjectSha256
    ) {
      fail(`${meshPath}.rawObjectSha256`, "mesh source hash changed");
    }
    const rawVertices = array(mesh.vertices, `${meshPath}.vertices`);
    const rawUvs = array(mesh.uvs, `${meshPath}.uvs`);
    const rawIndices = array(mesh.indices, `${meshPath}.indices`);
    if (rawVertices.length !== expected.vertexCount * 3) {
      fail(`${meshPath}.vertices`, "unexpected vertex count");
    }
    if (rawUvs.length !== expected.vertexCount * 2) {
      fail(`${meshPath}.uvs`, "unexpected UV count");
    }
    if (rawIndices.length !== expected.indexCount) {
      fail(`${meshPath}.indices`, "unexpected index count");
    }
    const vertices = new Float32Array(rawVertices.length);
    for (let index = 0; index < rawVertices.length; index += 1) {
      vertices[index] = finite(rawVertices[index], `${meshPath}.vertices[${index}]`);
    }
    const uvs = new Float32Array(rawUvs.length);
    for (let index = 0; index < rawUvs.length; index += 1) {
      uvs[index] = finite(rawUvs[index], `${meshPath}.uvs[${index}]`);
    }
    const indices = new Uint32Array(rawIndices.length);
    for (let index = 0; index < rawIndices.length; index += 1) {
      const vertexIndex = integer(rawIndices[index], `${meshPath}.indices[${index}]`);
      if (vertexIndex < 0 || vertexIndex >= expected.vertexCount) {
        fail(`${meshPath}.indices[${index}]`, "index is outside the vertex array");
      }
      indices[index] = vertexIndex;
    }
    result.set(id, { pathId: id, vertices, uvs, indices });
  }
  return result;
}

function parseRenderer(
  value: unknown,
  path: string,
  materials: ReadonlyMap<string, MaterialSpec>,
  meshes: ReadonlyMap<string, MeshSpec>,
): RendererSpec {
  const source = record(value, path);
  exactKeys(source, path, [
    "alignment",
    "billboard",
    "draw",
    "enabled",
    "materials",
    "meshDistribution",
    "mode",
    "stretch",
  ], ["mesh"]);
  if (source.alignment !== "view" && source.alignment !== "local") {
    fail(`${path}.alignment`, "unsupported renderer alignment");
  }
  const mode = text(source.mode, `${path}.mode`);
  if (mode !== "billboard" && mode !== "mesh" && mode !== "stretched-billboard") {
    fail(`${path}.mode`, `unsupported renderer mode ${mode}`);
  }
  let resolvedMesh: MeshSpec | null = null;
  if (mode === "mesh") {
    const mesh = record(source.mesh, `${path}.mesh`);
    exactKeys(mesh, `${path}.mesh`, ["fileId", "geometry", "pathId"]);
    const fileId = integer(mesh.fileId, `${path}.mesh.fileId`);
    const isBuiltinQuad =
      mesh.geometry === "unity-builtin-quad"
      && fileId === 1
      && integer(mesh.pathId, `${path}.mesh.pathId`) === 10210;
    const customMeshPathId = fileId === 0
      ? text(mesh.pathId, `${path}.mesh.pathId`)
      : null;
    const isBoundedCustomMesh =
      mesh.geometry === "bounded-custom-mesh"
      && customMeshPathId !== null
      && meshes.has(customMeshPathId);
    if (!isBuiltinQuad && !isBoundedCustomMesh) {
      fail(`${path}.mesh`, "unsupported mesh profile");
    }
    resolvedMesh = isBoundedCustomMesh ? meshes.get(customMeshPathId!) ?? null : null;
  } else if (source.mesh !== undefined) {
    fail(`${path}.mesh`, "mesh geometry requires mesh renderer mode");
  }
  finite(source.meshDistribution, `${path}.meshDistribution`);
  const billboard = record(source.billboard, `${path}.billboard`);
  exactKeys(billboard, `${path}.billboard`, [
    "allowRoll",
    "applyActiveColorSpace",
    "flipProbability",
    "maximumScreenFraction",
    "minimumScreenFraction",
    "normalDirection",
    "pivotWorldUnits",
  ]);
  bool(billboard.allowRoll, `${path}.billboard.allowRoll`);
  bool(billboard.applyActiveColorSpace, `${path}.billboard.applyActiveColorSpace`);
  finite(billboard.maximumScreenFraction, `${path}.billboard.maximumScreenFraction`);
  finite(billboard.minimumScreenFraction, `${path}.billboard.minimumScreenFraction`);
  finite(billboard.normalDirection, `${path}.billboard.normalDirection`);
  const flip = vec3(billboard.flipProbability, `${path}.billboard.flipProbability`);
  const stretch = record(source.stretch, `${path}.stretch`);
  exactKeys(stretch, `${path}.stretch`, [
    "cameraVelocityScale",
    "freeformStretching",
    "lengthScale",
    "rotateWithStretchDirection",
    "velocityScale",
  ]);
  if (bool(stretch.freeformStretching, `${path}.stretch.freeformStretching`)) {
    fail(`${path}.stretch.freeformStretching`, "outside the frozen profile");
  }
  const draw = record(source.draw, `${path}.draw`);
  exactKeys(draw, `${path}.draw`, [
    "rendererPriority",
    "renderingLayerMask",
    "sortMode",
    "sortingFudge",
    "sortingLayerId",
    "sortingOrder",
  ]);
  if (draw.sortMode !== "none") fail(`${path}.draw.sortMode`, "unsupported sort mode");
  integer(draw.renderingLayerMask, `${path}.draw.renderingLayerMask`);
  const materialIds = array(source.materials, `${path}.materials`).map((entry, index) =>
    text(entry, `${path}.materials[${index}]`),
  );
  const uniqueMaterialIds = [...new Set(materialIds)];
  if (uniqueMaterialIds.length > 1) {
    fail(`${path}.materials`, "distinct multiple renderer materials are outside the profile");
  }
  const material =
    uniqueMaterialIds.length === 0 ? null : materials.get(uniqueMaterialIds[0]);
  if (uniqueMaterialIds.length > 0 && !material) {
    fail(`${path}.materials[0]`, "unknown material reference");
  }
  return {
    enabled: bool(source.enabled, `${path}.enabled`),
    mode,
    alignment: source.alignment,
    material: material ?? null,
    mesh: resolvedMesh,
    sortingLayerId: integer(draw.sortingLayerId, `${path}.draw.sortingLayerId`),
    sortingOrder: integer(draw.sortingOrder, `${path}.draw.sortingOrder`),
    sortingFudge: finite(draw.sortingFudge, `${path}.draw.sortingFudge`),
    rendererPriority: integer(draw.rendererPriority, `${path}.draw.rendererPriority`),
    pivot: vec3(billboard.pivotWorldUnits, `${path}.billboard.pivotWorldUnits`),
    flipX: flip.x,
    flipY: flip.y,
    cameraVelocityScale: finite(
      stretch.cameraVelocityScale,
      `${path}.stretch.cameraVelocityScale`,
    ),
    velocityScale: finite(stretch.velocityScale, `${path}.stretch.velocityScale`),
    lengthScale: finite(stretch.lengthScale, `${path}.stretch.lengthScale`),
    rotateWithStretchDirection: bool(
      stretch.rotateWithStretchDirection,
      `${path}.stretch.rotateWithStretchDirection`,
    ),
  };
}

function multiplyQuaternion(left: Quaternion, right: Quaternion): Quaternion {
  return {
    w: left.w * right.w - left.x * right.x - left.y * right.y - left.z * right.z,
    x: left.w * right.x + left.x * right.w + left.y * right.z - left.z * right.y,
    y: left.w * right.y - left.x * right.z + left.y * right.w + left.z * right.x,
    z: left.w * right.z + left.x * right.y - left.y * right.x + left.z * right.w,
  };
}

function rotateVector(rotation: Quaternion, value: Vec3): Vec3 {
  const x2 = rotation.x + rotation.x;
  const y2 = rotation.y + rotation.y;
  const z2 = rotation.z + rotation.z;
  const xx = rotation.x * x2;
  const yy = rotation.y * y2;
  const zz = rotation.z * z2;
  const xy = rotation.x * y2;
  const xz = rotation.x * z2;
  const yz = rotation.y * z2;
  const wx = rotation.w * x2;
  const wy = rotation.w * y2;
  const wz = rotation.w * z2;
  return {
    x: (1 - (yy + zz)) * value.x + (xy - wz) * value.y + (xz + wy) * value.z,
    y: (xy + wz) * value.x + (1 - (xx + zz)) * value.y + (yz - wx) * value.z,
    z: (xz - wy) * value.x + (yz + wx) * value.y + (1 - (xx + yy)) * value.z,
  };
}

function eulerDegreesQuaternion(value: Vec3): Quaternion {
  const x = (value.x * Math.PI) / 360;
  const y = (value.y * Math.PI) / 360;
  const z = (value.z * Math.PI) / 360;
  const sx = Math.sin(x);
  const cx = Math.cos(x);
  const sy = Math.sin(y);
  const cy = Math.cos(y);
  const sz = Math.sin(z);
  const cz = Math.cos(z);
  return multiplyQuaternion(
    multiplyQuaternion(
      { x: sx, y: 0, z: 0, w: cx },
      { x: 0, y: sy, z: 0, w: cy },
    ),
    { x: 0, y: 0, z: sz, w: cz },
  );
}

function eulerRadiansQuaternion(value: Vec3): Quaternion {
  return eulerDegreesQuaternion({
    x: (value.x * 180) / Math.PI,
    y: (value.y * 180) / Math.PI,
    z: (value.z * 180) / Math.PI,
  });
}

function projectedZRotation(rotation: Quaternion): number {
  return Math.atan2(
    2 * (rotation.w * rotation.z + rotation.x * rotation.y),
    1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z),
  );
}

function composeTransform(
  parentPosition: Vec3,
  parentRotation: Quaternion,
  parentScale: Vec3,
  localPosition: Vec3,
  localRotation: Quaternion,
  localScale: Vec3,
): { position: Vec3; rotation: Quaternion; scale: Vec3 } {
  const offset = rotateVector(parentRotation, {
    x: localPosition.x * parentScale.x,
    y: localPosition.y * parentScale.y,
    z: localPosition.z * parentScale.z,
  });
  return {
    position: {
      x: parentPosition.x + offset.x,
      y: parentPosition.y + offset.y,
      z: parentPosition.z + offset.z,
    },
    rotation: multiplyQuaternion(parentRotation, localRotation),
    scale: {
      x: parentScale.x * localScale.x,
      y: parentScale.y * localScale.y,
      z: parentScale.z * localScale.z,
    },
  };
}

function parseNode(
  value: unknown,
  path: string,
  materials: ReadonlyMap<string, MaterialSpec>,
  meshes: ReadonlyMap<string, MeshSpec>,
  systems: CompiledSystem[],
  parentPosition: Vec3,
  parentRotation: Quaternion,
  parentScale: Vec3,
  parentIncluded: boolean,
): void {
  const source = record(value, path);
  exactKeys(source, path, [
    "children",
    "hierarchyPath",
    "name",
    "particleSystem",
    "renderer",
    "runtimeParticipation",
    "serializedActive",
    "serializedHierarchyActive",
    "transform",
  ]);
  const hierarchyPath = text(source.hierarchyPath, `${path}.hierarchyPath`);
  text(source.name, `${path}.name`);
  const serializedActive = bool(source.serializedActive, `${path}.serializedActive`);
  const serializedHierarchyActive = bool(
    source.serializedHierarchyActive,
    `${path}.serializedHierarchyActive`,
  );
  const participation = text(
    source.runtimeParticipation,
    `${path}.runtimeParticipation`,
  );
  if (
    participation !== "play-with-root-active-hierarchy" &&
    participation !== "excluded-serialized-inactive"
  ) {
    fail(`${path}.runtimeParticipation`, "unsupported participation policy");
  }
  const included =
    parentIncluded &&
    serializedActive &&
    serializedHierarchyActive &&
    participation === "play-with-root-active-hierarchy";
  const transform = record(source.transform, `${path}.transform`);
  exactKeys(transform, `${path}.transform`, [
    "localPosition",
    "localRotation",
    "localScale",
  ]);
  const world = composeTransform(
    parentPosition,
    parentRotation,
    parentScale,
    vec3(transform.localPosition, `${path}.transform.localPosition`),
    quaternion(transform.localRotation, `${path}.transform.localRotation`),
    vec3(transform.localScale, `${path}.transform.localScale`),
  );
  if ((source.particleSystem === null) !== (source.renderer === null)) {
    fail(path, "particleSystem and renderer must both be present or null");
  }
  if (source.particleSystem !== null) {
    const particlePath = `${path}.particleSystem`;
    const particle = record(source.particleSystem, particlePath);
    exactKeys(particle, particlePath, [
      "autoRandomSeed",
      "cullingMode",
      "durationSeconds",
      "emitterVelocity",
      "looping",
      "modules",
      "playOnAwake",
      "prewarm",
      "randomSeed",
      "ringBuffer",
      "scalingSpace",
      "seedMode",
      "simulationSpace",
      "simulationSpeed",
      "startDelay",
      "stopAction",
      "useUnscaledTime",
    ]);
    bool(particle.playOnAwake, `${particlePath}.playOnAwake`);
    const prewarm = bool(particle.prewarm, `${particlePath}.prewarm`);
    bool(particle.useUnscaledTime, `${particlePath}.useUnscaledTime`);
    if (particle.emitterVelocity !== "transform") {
      fail(`${particlePath}.emitterVelocity`, "unsupported emitter velocity mode");
    }
    if (particle.ringBuffer !== "disabled") {
      fail(`${particlePath}.ringBuffer`, "ring buffer is outside the frozen profile");
    }
    if (particle.stopAction !== "none") {
      fail(`${particlePath}.stopAction`, "unsupported stop action");
    }
    if (particle.seedMode !== "runtime-auto" && particle.seedMode !== "serialized") {
      fail(`${particlePath}.seedMode`, "unsupported seed mode");
    }
    const autoRandomSeed = bool(
      particle.autoRandomSeed,
      `${particlePath}.autoRandomSeed`,
    );
    if ((particle.seedMode === "runtime-auto") !== autoRandomSeed) {
      fail(`${particlePath}.seedMode`, "seed mode disagrees with autoRandomSeed");
    }
    const simulationSpace = text(
      particle.simulationSpace,
      `${particlePath}.simulationSpace`,
    );
    if (simulationSpace !== "local" && simulationSpace !== "world") {
      fail(`${particlePath}.simulationSpace`, "unsupported simulation space");
    }
    const scalingSpace = text(particle.scalingSpace, `${particlePath}.scalingSpace`);
    if (!new Set(["hierarchy", "local", "shape"]).has(scalingSpace)) {
      fail(`${particlePath}.scalingSpace`, "unsupported scaling space");
    }
    text(particle.cullingMode, `${particlePath}.cullingMode`);
    const modules = record(particle.modules, `${particlePath}.modules`);
    const supportedModules = new Set([
      "colorOverLifetime",
      "customData",
      "emission",
      "initial",
      "limitVelocityOverLifetime",
      "rotationOverLifetime",
      "shape",
      "sizeOverLifetime",
      "textureSheetAnimation",
      "velocityOverLifetime",
    ]);
    for (const moduleName of Object.keys(modules)) {
      if (!supportedModules.has(moduleName)) {
        fail(`${particlePath}.modules.${moduleName}`, "unknown module");
      }
    }
    if (!("initial" in modules)) {
      fail(`${particlePath}.modules`, "initial is required");
    }
    const initial = initialModule(modules.initial, `${particlePath}.modules.initial`);
    const emission =
      modules.emission === undefined
        ? { rateOverTime: ZERO_CURVE, rateOverDistance: ZERO_CURVE, bursts: [] }
        : emissionModule(modules.emission, `${particlePath}.modules.emission`);
    let sizeOverLifetimeX: MinMaxCurve | null = null;
    let sizeOverLifetimeY: MinMaxCurve | null = null;
    let sizeOverLifetimeZ: MinMaxCurve | null = null;
    if (modules.sizeOverLifetime !== undefined) {
      const modulePath = `${particlePath}.modules.sizeOverLifetime`;
      const size = record(modules.sizeOverLifetime, modulePath);
      const separateAxes = bool(size.separateAxes, `${modulePath}.separateAxes`);
      if (separateAxes) {
        exactKeys(size, modulePath, ["separateAxes", "x", "y", "z"]);
        sizeOverLifetimeY = minMaxCurve(size.y, `${modulePath}.y`);
        sizeOverLifetimeZ = minMaxCurve(size.z, `${modulePath}.z`);
      } else {
        exactKeys(size, modulePath, ["separateAxes", "x"]);
      }
      sizeOverLifetimeX = minMaxCurve(size.x, `${modulePath}.x`);
    }
    let rotationX: MinMaxCurve | null = null;
    let rotationY: MinMaxCurve | null = null;
    let rotationZ: MinMaxCurve | null = null;
    if (modules.rotationOverLifetime !== undefined) {
      const modulePath = `${particlePath}.modules.rotationOverLifetime`;
      const rotation = record(modules.rotationOverLifetime, modulePath);
      const separateAxes = bool(rotation.separateAxes, `${modulePath}.separateAxes`);
      if (separateAxes) {
        exactKeys(rotation, modulePath, ["separateAxes", "x", "y", "z"]);
        rotationX = minMaxCurve(rotation.x, `${modulePath}.x`);
        rotationY = minMaxCurve(rotation.y, `${modulePath}.y`);
        rotationZ = minMaxCurve(rotation.z, `${modulePath}.z`);
      } else {
        exactKeys(rotation, modulePath, ["separateAxes", "z"]);
        rotationZ = minMaxCurve(rotation.z, `${modulePath}.z`);
      }
    }
    const renderer = parseRenderer(
      source.renderer,
      `${path}.renderer`,
      materials,
      meshes,
    );
    const velocityOverLifetime = modules.velocityOverLifetime === undefined
      ? null
      : velocityModule(
          modules.velocityOverLifetime,
          `${particlePath}.modules.velocityOverLifetime`,
        );
    const limitVelocity = modules.limitVelocityOverLifetime === undefined
      ? null
      : limitVelocityModule(
          modules.limitVelocityOverLifetime,
          `${particlePath}.modules.limitVelocityOverLifetime`,
        );
    let customDataVector0W: MinMaxCurve | null = null;
    if (modules.customData !== undefined) {
      const customDataPath = `${particlePath}.modules.customData`;
      const customData = record(modules.customData, customDataPath);
      exactKeys(customData, customDataPath, ["profile", "vector0W"]);
      if (
        customData.profile !== "witch-vector0-w-uv-scroll-u-v1"
        || renderer.mesh === null
      ) {
        fail(`${customDataPath}.profile`, "unsupported Witch UV-scroll profile");
      }
      customDataVector0W = minMaxCurve(
        customData.vector0W,
        `${customDataPath}.vector0W`,
      );
    }
    if (included) {
      systems.push({
        hierarchyPath,
        durationSeconds: finite(
          particle.durationSeconds,
          `${particlePath}.durationSeconds`,
        ),
        startDelay: minMaxCurve(particle.startDelay, `${particlePath}.startDelay`),
        simulationSpeed: (() => {
          const speed = finite(
            particle.simulationSpeed,
            `${particlePath}.simulationSpeed`,
          );
          if (!(speed > 0)) {
            fail(`${particlePath}.simulationSpeed`, "must be positive");
          }
          return speed;
        })(),
        looping: bool(particle.looping, `${particlePath}.looping`),
        prewarm,
        simulationSpace,
        initial,
        rateOverTime: emission.rateOverTime,
        rateOverDistance: emission.rateOverDistance,
        bursts: emission.bursts,
        shape:
          modules.shape === undefined
            ? null
            : shape(modules.shape, `${particlePath}.modules.shape`),
        colorOverLifetime:
          modules.colorOverLifetime === undefined
            ? null
            : (() => {
                const modulePath = `${particlePath}.modules.colorOverLifetime`;
                const colorModule = record(modules.colorOverLifetime, modulePath);
                exactKeys(colorModule, modulePath, ["color"]);
                return minMaxGradient(colorModule.color, `${modulePath}.color`);
              })(),
        sizeOverLifetimeX,
        sizeOverLifetimeY,
        sizeOverLifetimeZ,
        rotationOverLifetimeX: rotationX,
        rotationOverLifetimeY: rotationY,
        rotationOverLifetimeZ: rotationZ,
        textureSheet:
          modules.textureSheetAnimation === undefined
            ? null
            : textureSheetModule(
                modules.textureSheetAnimation,
                `${particlePath}.modules.textureSheetAnimation`,
              ),
        velocityOverLifetime,
        limitVelocity,
        customDataVector0W,
        renderer,
        worldPosition: world.position,
        worldRotation: world.rotation,
        worldScale: world.scale,
        autoRandomSeed,
        serializedRandomSeed: integer(particle.randomSeed, `${particlePath}.randomSeed`),
        particles: particlePool(initial.maxParticles),
        renderInstances: createRenderInstances(
          initial.maxParticles,
          hierarchyPath,
          renderer,
        ),
        nextOrdinal: 0,
        rateCarry: 0,
      });
    }
  }
  const children = array(source.children, `${path}.children`);
  for (let index = 0; index < children.length; index += 1) {
    parseNode(
      children[index],
      `${path}.children[${index}]`,
      materials,
      meshes,
      systems,
      world.position,
      world.rotation,
      world.scale,
      included,
    );
  }
}

function compileRecipe(value: unknown): CompiledRecipe {
  const source = record(value, "recipe");
  exactKeys(source, "recipe", [
    "kind",
    "lifecycle",
    "materials",
    "placement",
    "root",
    "schemaVersion",
  ], ["meshes"]);
  if (source.schemaVersion !== BANDORI_DEFAULT_EFFECT_RECIPE_SCHEMA) {
    fail("recipe.schemaVersion", "unsupported schema");
  }
  if (source.kind !== "particle-system-hierarchy") {
    fail("recipe.kind", "unsupported recipe kind");
  }
  const lifecycle = record(source.lifecycle, "recipe.lifecycle");
  exactKeys(lifecycle, "recipe.lifecycle", ["initialRootActive", "onStop"]);
  const onStop = array(lifecycle.onStop, "recipe.lifecycle.onStop").map(
    (entry, index) => text(entry, `recipe.lifecycle.onStop[${index}]`),
  );
  for (const action of onStop) {
    if (action !== "set-root-inactive" && action !== "stop-root-active-hierarchy") {
      fail("recipe.lifecycle.onStop", `unsupported action ${String(action)}`);
    }
  }
  const placement = record(source.placement, "recipe.placement");
  exactKeys(placement, "recipe.placement", [
    "pixelsPerWorldUnit",
    "screenButtons",
    "sourceButtons",
  ]);
  const pixelsPerWorldUnit = finite(
    placement.pixelsPerWorldUnit,
    "recipe.placement.pixelsPerWorldUnit",
  );
  const screenButtons = array(
    placement.screenButtons,
    "recipe.placement.screenButtons",
  ).map((entry, index) => {
    const buttonPath = `recipe.placement.screenButtons[${index}]`;
    const button = record(entry, buttonPath);
    exactKeys(button, buttonPath, ["index", "x", "y"]);
    if (integer(button.index, `${buttonPath}.index`) !== index) {
      fail(`${buttonPath}.index`, "button indexes must be contiguous");
    }
    return {
      x: finite(button.x, `${buttonPath}.x`),
      y: finite(button.y, `${buttonPath}.y`),
    };
  });
  const sourceButtons = array(placement.sourceButtons, "recipe.placement.sourceButtons").map(
    (entry, index) => {
      const buttonPath = `recipe.placement.sourceButtons[${index}]`;
      const button = record(entry, buttonPath);
      exactKeys(button, buttonPath, ["index", "position"]);
      if (integer(button.index, `${buttonPath}.index`) !== index) {
        fail(`${buttonPath}.index`, "button indexes must be contiguous");
      }
      return vec3(button.position, `${buttonPath}.position`);
    },
  );
  if (sourceButtons.length !== screenButtons.length || sourceButtons.length === 0) {
    fail("recipe.placement", "source and screen buttons must have the same length");
  }
  const materials = parseMaterials(source.materials, "recipe.materials");
  const meshes = parseMeshes(source.meshes ?? {}, "recipe.meshes");
  const systems: CompiledSystem[] = [];
  parseNode(
    source.root,
    "recipe.root",
    materials,
    meshes,
    systems,
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0, w: 1 },
    { x: 1, y: 1, z: 1 },
    true,
  );
  let frameCapacity = 0;
  for (const system of systems) {
    if (system.renderer.enabled && system.renderer.material) {
      frameCapacity += system.initial.maxParticles;
    }
  }
  return {
    initialRootActive: bool(
      lifecycle.initialRootActive,
      "recipe.lifecycle.initialRootActive",
    ),
    longHold: onStop.includes("set-root-inactive"),
    pixelsPerWorldUnit,
    sourceButtons,
    screenButtons,
    materials,
    systems,
    frameCapacity,
  };
}

function createRenderInstances(
  count: number,
  hierarchyPath: string,
  renderer: RendererSpec,
): BandoriEffectFrameInstance[] {
  const result: BandoriEffectFrameInstance[] = [];
  const material = renderer.material;
  for (let index = 0; index < count; index += 1) {
    result.push({
      hierarchyPath,
      particleIndex: 0,
      materialId: material?.id ?? "",
      textureResource: material?.textureResource ?? "",
      textureAddressModeU: material?.textureAddressModeU ?? "repeat",
      textureAddressModeV: material?.textureAddressModeV ?? "clamp-to-edge",
      blendSource: material?.blendSource ?? "",
      blendDestination: material?.blendDestination ?? "",
      blendEquation: material?.blendEquation ?? "",
      premultipliedAlpha: material?.premultipliedAlpha ?? false,
      rendererMode: renderer.mode,
      screenX: 0,
      screenY: 0,
      depth: 0,
      rotationRadians: 0,
      basisX: { x: 1, y: 0 },
      basisY: { x: 0, y: 1 },
      widthPixels: 0,
      heightPixels: 0,
      color: { r: 0, g: 0, b: 0, a: 0 },
      uv: {
        column: 0,
        row: 0,
        index: 0,
        frameColumns: 1,
        frameRows: 1,
        flipU: false,
        flipV: false,
      },
      mesh: renderer.mesh
        ? {
            pathId: renderer.mesh.pathId,
            vertices: new Float32Array(renderer.mesh.vertices.length / 3 * 2),
            uvs: renderer.mesh.uvs,
            indices: renderer.mesh.indices,
            uvOffsetU: 0,
          }
        : null,
      stretch:
        renderer.mode === "stretched-billboard"
          ? {
              cameraVelocityScale: renderer.cameraVelocityScale,
              velocityScale: renderer.velocityScale,
              lengthScale: renderer.lengthScale,
              velocityPixelsPerSecond: 0,
              lengthPixels: 0,
              rotateWithStretchDirection: renderer.rotateWithStretchDirection,
            }
          : null,
      sortingLayerId: renderer.sortingLayerId,
      sortingOrder: renderer.sortingOrder,
      sortingFudge: renderer.sortingFudge,
      rendererPriority: renderer.rendererPriority,
    });
  }
  return result;
}

function mixUint32(value: number): number {
  let result = value >>> 0;
  result ^= result >>> 16;
  result = Math.imul(result, 0x7feb352d);
  result ^= result >>> 15;
  result = Math.imul(result, 0x846ca68b);
  result ^= result >>> 16;
  return result >>> 0;
}

function keyedUint32(seed: number, first: number, second: number): number {
  return mixUint32(
    (seed >>> 0) ^ Math.imul((first + 1) >>> 0, 0x9e3779b1) ^ Math.imul(second, 0x85ebca6b),
  );
}

function keyedRandom(seed: number, ordinal: number, salt: number): number {
  return keyedUint32(seed, ordinal, salt) / UINT32_RANGE;
}

function systemSeed(baseSeed: number, system: CompiledSystem, index: number): number {
  if (!system.autoRandomSeed && system.serializedRandomSeed !== 0) {
    return system.serializedRandomSeed >>> 0;
  }
  return keyedUint32(baseSeed, index, 0x5a17);
}

function normalize(value: Vec3): Vec3 {
  const length = Math.hypot(value.x, value.y, value.z);
  if (length <= EPSILON) return { x: 0, y: 1, z: 0 };
  return { x: value.x / length, y: value.y / length, z: value.z / length };
}

function applyScaleHandedness(value: Vec3, scale: Vec3): Vec3 {
  return {
    x: scale.x < 0 ? -value.x : value.x,
    y: scale.y < 0 ? -value.y : value.y,
    z: scale.z < 0 ? -value.z : value.z,
  };
}

function randomUnitVector(seed: number, ordinal: number, salt: number): Vec3 {
  const z = keyedRandom(seed, ordinal, salt) * 2 - 1;
  const angle = keyedRandom(seed, ordinal, salt + 1) * TWO_PI;
  const radius = Math.sqrt(Math.max(0, 1 - z * z));
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle), z };
}

function shapeSample(
  spec: ShapeSpec | null,
  seed: number,
  ordinal: number,
  burstIndex?: number,
  burstCount?: number,
): { position: Vec3; direction: Vec3 } {
  if (!spec) {
    return { position: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: 1 } };
  }
  let position: Vec3;
  let direction: Vec3;
  if (spec.type === "sphere") {
    direction = randomUnitVector(seed, ordinal, 20);
    const radius = Math.cbrt(lerp(
      spec.innerRadius ** 3,
      spec.radius ** 3,
      keyedRandom(seed, ordinal, 22),
    ));
    position = {
      x: direction.x * radius,
      y: direction.y * radius,
      z: direction.z * radius,
    };
  } else if (spec.type === "box") {
    position = {
      x: (keyedRandom(seed, ordinal, 20) - 0.5) * spec.dimensions.x,
      y: (keyedRandom(seed, ordinal, 21) - 0.5) * spec.dimensions.y,
      z: (keyedRandom(seed, ordinal, 22) - 0.5) * spec.dimensions.z,
    };
    direction = { x: 0, y: 0, z: 1 };
  } else {
    const arcFraction =
      spec.arc.mode === "burst-spread" && burstCount !== undefined && burstCount > 0
        ? (burstIndex ?? 0) / burstCount
        : keyedRandom(seed, ordinal, 20);
    const angle = arcFraction * ((spec.arc.degrees * Math.PI) / 180);
    const radiusSquared = lerp(
      spec.innerRadius * spec.innerRadius,
      spec.radius * spec.radius,
      keyedRandom(seed, ordinal, 21),
    );
    const radius = Math.sqrt(Math.max(0, radiusSquared));
    position = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: 0 };
    if (spec.type === "circle") {
      direction = normalize({ x: position.x, y: position.y, z: 0 });
    } else {
      const coneAngle = (spec.angleDegrees * Math.PI) / 180;
      direction = normalize({
        x: Math.cos(angle) * Math.sin(coneAngle),
        y: Math.sin(angle) * Math.sin(coneAngle),
        z: Math.cos(coneAngle),
      });
      if (spec.emissionSurface !== "base" && spec.emissionSurface !== "volume") {
        fail("recipe.shape.emissionSurface", "unsupported cone emission surface");
      }
      if (spec.emissionSurface === "volume") {
        position.z = keyedRandom(seed, ordinal, 22) * spec.length;
        const radiusScale = spec.radius > EPSILON
          ? (spec.radius + Math.tan(coneAngle) * position.z) / spec.radius
          : 1;
        position.x *= radiusScale;
        position.y *= radiusScale;
      }
    }
  }
  /*
   * Unity serializes a box ShapeModule's m_Scale both as its box dimensions
   * and as the common shape-transform scale. Applying both would square the
   * authored box size. Cone and circle radii remain unscaled source values,
   * so only those shapes consume the common transform scale here.
   */
  if (spec.type !== "box") {
    position.x *= spec.transform.scale.x;
    position.y *= spec.transform.scale.y;
    position.z *= spec.transform.scale.z;
  }
  const randomPosition = randomUnitVector(seed, ordinal, 30);
  position.x += spec.transform.position.x + randomPosition.x * spec.randomPositionAmount;
  position.y += spec.transform.position.y + randomPosition.y * spec.randomPositionAmount;
  position.z += spec.transform.position.z + randomPosition.z * spec.randomPositionAmount;
  const shapeRotation = eulerDegreesQuaternion(spec.transform.rotation);
  position = rotateVector(shapeRotation, position);
  direction = rotateVector(shapeRotation, direction);
  if (spec.sphericalDirectionAmount > 0) {
    const radial = normalize(position);
    direction = normalize({
      x: lerp(direction.x, radial.x, spec.sphericalDirectionAmount),
      y: lerp(direction.y, radial.y, spec.sphericalDirectionAmount),
      z: lerp(direction.z, radial.z, spec.sphericalDirectionAmount),
    });
  }
  if (spec.randomDirectionAmount > 0) {
    const randomDirection = randomUnitVector(seed, ordinal, 32);
    direction = normalize({
      x: lerp(direction.x, randomDirection.x, spec.randomDirectionAmount),
      y: lerp(direction.y, randomDirection.y, spec.randomDirectionAmount),
      z: lerp(direction.z, randomDirection.z, spec.randomDirectionAmount),
    });
  }
  return { position, direction };
}

function findFreeSlot(pool: ParticlePool): number {
  for (let index = 0; index < pool.alive.length; index += 1) {
    if (pool.alive[index] === 0) return index;
  }
  return -1;
}

function clearSystem(system: CompiledSystem): void {
  system.particles.alive.fill(0);
  system.nextOrdinal = 0;
  system.rateCarry = 0;
}

function spawnParticle(
  system: CompiledSystem,
  seed: number,
  eventTime: number,
  normalizedSystemTime: number,
  burstIndex?: number,
  burstCount?: number,
): void {
  const pool = system.particles;
  const slot = findFreeSlot(pool);
  const ordinal = system.nextOrdinal;
  system.nextOrdinal = (system.nextOrdinal + 1) >>> 0;
  if (slot < 0) return;
  const lifetime = evaluateCurve(
    system.initial.startLifetime,
    normalizedSystemTime,
    keyedRandom(seed, ordinal, 1),
  );
  if (!(lifetime > 0)) return;
  const sampledShape = shapeSample(
    system.shape,
    seed,
    ordinal,
    burstIndex,
    burstCount,
  );
  const scaledPosition = {
    x: sampledShape.position.x * system.worldScale.x,
    y: sampledShape.position.y * system.worldScale.y,
    z: sampledShape.position.z * system.worldScale.z,
  };
  const rotatedPosition = rotateVector(system.worldRotation, scaledPosition);
  // Right Directional prefabs mirror their local X axis with a negative scale.
  // Preserve that handedness without applying unverified positive scale magnitudes.
  const direction = normalize(rotateVector(
    system.worldRotation,
    applyScaleHandedness(sampledShape.direction, system.worldScale),
  ));
  const speed = evaluateCurve(
    system.initial.startSpeed,
    normalizedSystemTime,
    keyedRandom(seed, ordinal, 2),
  );
  const customVelocity = rotateVector(
    system.worldRotation,
    system.initial.customEmitterVelocity,
  );
  const randomRotationSign =
    keyedRandom(seed, ordinal, 8) < system.initial.randomizeRotationDirection ? -1 : 1;
  const initialColor = evaluateGradient(
    system.initial.startColor,
    normalizedSystemTime,
    keyedRandom(seed, ordinal, 9),
    { r: 0, g: 0, b: 0, a: 0 },
  );
  pool.alive[slot] = 1;
  pool.ordinal[slot] = ordinal;
  pool.birth[slot] = eventTime;
  pool.lifetime[slot] = lifetime;
  pool.x[slot] = system.worldPosition.x + rotatedPosition.x;
  pool.y[slot] = system.worldPosition.y + rotatedPosition.y;
  pool.z[slot] = system.worldPosition.z + rotatedPosition.z;
  pool.vx[slot] = direction.x * speed + customVelocity.x;
  pool.vy[slot] = direction.y * speed + customVelocity.y;
  pool.vz[slot] = direction.z * speed + customVelocity.z;
  pool.sizeX[slot] = evaluateCurve(
    system.initial.startSizeX,
    normalizedSystemTime,
    keyedRandom(seed, ordinal, 3),
  );
  pool.sizeY[slot] = evaluateCurve(
    system.initial.startSizeY,
    normalizedSystemTime,
    keyedRandom(seed, ordinal, 4),
  );
  pool.sizeZ[slot] = evaluateCurve(
    system.initial.startSizeZ,
    normalizedSystemTime,
    keyedRandom(seed, ordinal, 5),
  );
  pool.rotationX[slot] =
    randomRotationSign *
    evaluateCurve(
      system.initial.startRotationX,
      normalizedSystemTime,
      keyedRandom(seed, ordinal, 6),
    );
  pool.rotationY[slot] =
    randomRotationSign *
    evaluateCurve(
      system.initial.startRotationY,
      normalizedSystemTime,
      keyedRandom(seed, ordinal, 6),
    );
  pool.rotationZ[slot] =
    randomRotationSign *
    evaluateCurve(
      system.initial.startRotationZ,
      normalizedSystemTime,
      keyedRandom(seed, ordinal, 7),
    );
  pool.colorR[slot] = initialColor.r;
  pool.colorG[slot] = initialColor.g;
  pool.colorB[slot] = initialColor.b;
  pool.colorA[slot] = initialColor.a;
}

function normalizedSystemTime(system: CompiledSystem, activeTime: number): number {
  if (system.durationSeconds <= EPSILON) return 0;
  const time = system.looping
    ? ((activeTime % system.durationSeconds) + system.durationSeconds) %
      system.durationSeconds
    : Math.max(0, Math.min(system.durationSeconds, activeTime));
  return time / system.durationSeconds;
}

function emitBursts(
  system: CompiledSystem,
  seed: number,
  previousActiveTime: number,
  activeTime: number,
  startDelaySeconds: number,
): void {
  if (activeTime < -EPSILON || activeTime < previousActiveTime) return;
  const duration = Math.max(system.durationSeconds, EPSILON);
  const firstCycle = system.looping
    ? Math.max(0, Math.floor(Math.max(0, previousActiveTime) / duration) - 1)
    : 0;
  const lastCycle = system.looping ? Math.floor(Math.max(0, activeTime) / duration) : 0;
  for (let cycle = firstCycle; cycle <= lastCycle; cycle += 1) {
    const cycleBase = cycle * duration;
    for (let burstIndex = 0; burstIndex < system.bursts.length; burstIndex += 1) {
      const burst = system.bursts[burstIndex];
      for (let repeat = 0; repeat < burst.cycleCount; repeat += 1) {
        const eventActiveTime =
          cycleBase + burst.timeSeconds + repeat * burst.repeatIntervalSeconds;
        if (!system.looping && eventActiveTime > duration + EPSILON) continue;
        if (eventActiveTime <= previousActiveTime || eventActiveTime > activeTime + EPSILON) {
          continue;
        }
        const probabilityOrdinal = cycle * 65_537 + burstIndex * 257 + repeat;
        if (keyedRandom(seed, probabilityOrdinal, 101) > burst.probability) continue;
        const normalized = normalizedSystemTime(system, eventActiveTime);
        const count = Math.max(
          0,
          Math.floor(
            evaluateCurve(
              burst.count,
              normalized,
              keyedRandom(seed, probabilityOrdinal, 102),
            ) + 1e-6,
          ),
        );
        const eventTime = startDelaySeconds + eventActiveTime / system.simulationSpeed;
        for (let index = 0; index < count; index += 1) {
          spawnParticle(system, seed, eventTime, normalized, index, count);
        }
      }
    }
  }
}

function emitRate(
  system: CompiledSystem,
  seed: number,
  activeStart: number,
  activeEnd: number,
  wallEnd: number,
): void {
  if (activeEnd <= 0 || activeEnd <= activeStart) return;
  if (!system.looping && activeStart >= system.durationSeconds) return;
  const clampedStart = Math.max(0, activeStart);
  const clampedEnd = system.looping
    ? activeEnd
    : Math.min(activeEnd, system.durationSeconds);
  if (clampedEnd <= clampedStart) return;
  const normalized = normalizedSystemTime(system, (clampedStart + clampedEnd) / 2);
  const randomOrdinal = Math.floor(clampedEnd / DEFAULT_FIXED_STEP_SECONDS);
  const rate = Math.max(
    0,
    evaluateCurve(
      system.rateOverTime,
      normalized,
      keyedRandom(seed, randomOrdinal, 110),
    ),
  );
  // The frozen roots are stationary. A non-zero distance rate is still
  // evaluated, but contributes zero because emitter distance is zero.
  evaluateCurve(
    system.rateOverDistance,
    normalized,
    keyedRandom(seed, randomOrdinal, 111),
  );
  system.rateCarry += rate * (clampedEnd - clampedStart);
  const count = Math.floor(system.rateCarry + 1e-9);
  system.rateCarry -= count;
  for (let index = 0; index < count; index += 1) {
    spawnParticle(system, seed, wallEnd, normalized);
  }
}

function evaluateParticleVelocity(
  system: CompiledSystem,
  pool: ParticlePool,
  slot: number,
  seed: number,
  normalizedAge: number,
): Vec3 {
  const velocityModule = system.velocityOverLifetime;
  if (!velocityModule) {
    return { x: pool.vx[slot], y: pool.vy[slot], z: pool.vz[slot] };
  }
  const ordinal = pool.ordinal[slot];
  let additionalVelocity = {
    x: evaluateCurve(
      velocityModule.x,
      normalizedAge,
      keyedRandom(seed, ordinal, 126),
    ),
    y: evaluateCurve(
      velocityModule.y,
      normalizedAge,
      keyedRandom(seed, ordinal, 127),
    ),
    z: evaluateCurve(
      velocityModule.z,
      normalizedAge,
      keyedRandom(seed, ordinal, 128),
    ),
  };
  if (velocityModule.orbitalZ) {
    const angularVelocity = evaluateCurve(
      velocityModule.orbitalZ,
      normalizedAge,
      keyedRandom(seed, ordinal, 130),
    );
    const radialX = pool.x[slot] - system.worldPosition.x;
    const radialY = pool.y[slot] - system.worldPosition.y;
    additionalVelocity.x -= radialY * angularVelocity;
    additionalVelocity.y += radialX * angularVelocity;
  }
  if (velocityModule.space === "local") {
    additionalVelocity = rotateVector(system.worldRotation, additionalVelocity);
  }
  const speedModifier = evaluateCurve(
    velocityModule.speedModifier,
    normalizedAge,
    keyedRandom(seed, ordinal, 129),
  );
  return {
    x: (pool.vx[slot] + additionalVelocity.x) * speedModifier,
    y: (pool.vy[slot] + additionalVelocity.y) * speedModifier,
    z: (pool.vz[slot] + additionalVelocity.z) * speedModifier,
  };
}

function updateParticles(
  system: CompiledSystem,
  seed: number,
  fromTime: number,
  toTime: number,
): void {
  const pool = system.particles;
  for (let slot = 0; slot < pool.alive.length; slot += 1) {
    if (pool.alive[slot] === 0) continue;
    if (pool.birth[slot] > toTime + EPSILON) continue;
    const ageAtEnd = toTime - pool.birth[slot];
    if (ageAtEnd >= pool.lifetime[slot] - EPSILON) {
      pool.alive[slot] = 0;
      continue;
    }
    const activeDt = Math.max(0, toTime - Math.max(fromTime, pool.birth[slot]));
    if (activeDt <= 0) continue;
    const normalizedAge = clamp01(
      (Math.max(fromTime, pool.birth[slot]) - pool.birth[slot] + activeDt / 2) /
        pool.lifetime[slot],
    );
    const ordinal = pool.ordinal[slot];
    const gravity = evaluateCurve(
      system.initial.gravityMultiplier,
      normalizedAge,
      keyedRandom(seed, ordinal, 120),
    );
    pool.vy[slot] -= 9.81 * gravity * activeDt;
    if (system.limitVelocity) {
      const limit = Math.max(
        0,
        evaluateCurve(
          system.limitVelocity.limit,
          normalizedAge,
          keyedRandom(seed, ordinal, 121),
        ),
      );
      let speed = Math.hypot(pool.vx[slot], pool.vy[slot], pool.vz[slot]);
      if (speed > limit && speed > EPSILON) {
        /*
         * Compose the serialized fraction exponentially when our deterministic
         * evaluator subdivides the step. The 30-step rate is calibrated from
         * the APK recording: using the fraction at 120 Hz collapses the burst,
         * while treating it as a raw per-second rate overshoots the recorded
         * envelope.
         */
        const dampen = clamp01(
          1 - Math.pow(
            1 - clamp01(system.limitVelocity.dampen),
            activeDt * CALIBRATED_DAMPEN_STEPS_PER_SECOND,
          ),
        );
        const targetSpeed = lerp(speed, limit, dampen);
        const ratio = targetSpeed / speed;
        pool.vx[slot] *= ratio;
        pool.vy[slot] *= ratio;
        pool.vz[slot] *= ratio;
        speed = targetSpeed;
      }
      let drag = Math.max(
        0,
        evaluateCurve(
          system.limitVelocity.drag,
          normalizedAge,
          keyedRandom(seed, ordinal, 122),
        ),
      );
      if (system.limitVelocity.multiplyDragByParticleSize) {
        drag *= Math.max(Math.abs(pool.sizeX[slot]), EPSILON);
      }
      if (system.limitVelocity.multiplyDragByParticleVelocity) drag *= speed;
      const dragScale = Math.max(0, 1 - drag * activeDt);
      pool.vx[slot] *= dragScale;
      pool.vy[slot] *= dragScale;
      pool.vz[slot] *= dragScale;
    }
    const velocity = evaluateParticleVelocity(
      system,
      pool,
      slot,
      seed,
      normalizedAge,
    );
    pool.x[slot] += velocity.x * activeDt;
    pool.y[slot] += velocity.y * activeDt;
    pool.z[slot] += velocity.z * activeDt;
    if (system.rotationOverLifetimeX) {
      pool.rotationX[slot] +=
        evaluateCurve(
          system.rotationOverLifetimeX,
          normalizedAge,
          keyedRandom(seed, ordinal, 123),
        ) * activeDt;
    }
    if (system.rotationOverLifetimeY) {
      pool.rotationY[slot] +=
        evaluateCurve(
          system.rotationOverLifetimeY,
          normalizedAge,
          keyedRandom(seed, ordinal, 124),
        ) * activeDt;
    }
    if (system.rotationOverLifetimeZ) {
      pool.rotationZ[slot] +=
        evaluateCurve(
          system.rotationOverLifetimeZ,
          normalizedAge,
          keyedRandom(seed, ordinal, 125),
        ) * activeDt;
    }
  }
}

function multiplyParticleColor(
  target: BandoriEffectColor,
  pool: ParticlePool,
  slot: number,
  lifetimeColor: BandoriEffectColor,
): void {
  target.r = pool.colorR[slot] * lifetimeColor.r;
  target.g = pool.colorG[slot] * lifetimeColor.g;
  target.b = pool.colorB[slot] * lifetimeColor.b;
  target.a = pool.colorA[slot] * lifetimeColor.a;
}

function fillUvFrame(
  target: BandoriEffectUvFrame,
  module: TextureSheetModule | null,
  normalizedAge: number,
  seed: number,
  ordinal: number,
  renderer: RendererSpec,
): void {
  if (!module) {
    target.column = 0;
    target.row = 0;
    target.index = 0;
    target.frameColumns = 1;
    target.frameRows = 1;
    target.flipU = keyedRandom(seed, ordinal, 141) < renderer.flipX;
    target.flipV = keyedRandom(seed, ordinal, 142) < renderer.flipY;
    return;
  }
  const frameCount = module.tilesX * module.tilesY;
  const startFrame = evaluateCurve(
    module.startFrame,
    0,
    keyedRandom(seed, ordinal, 143),
  );
  const frameOverTime = evaluateCurve(
    module.frameOverTime,
    normalizedAge,
    keyedRandom(seed, ordinal, 144),
  );
  const continuousFrame = (startFrame + frameOverTime * module.cycles) * frameCount;
  const index = ((Math.floor(continuousFrame) % frameCount) + frameCount) % frameCount;
  target.index = index;
  target.column = index % module.tilesX;
  target.row = Math.floor(index / module.tilesX);
  target.frameColumns = module.tilesX;
  target.frameRows = module.tilesY;
  target.flipU =
    keyedRandom(seed, ordinal, 145) < module.flipU ||
    keyedRandom(seed, ordinal, 141) < renderer.flipX;
  target.flipV =
    keyedRandom(seed, ordinal, 146) < module.flipV ||
    keyedRandom(seed, ordinal, 142) < renderer.flipY;
}

function frameComesAfter(
  left: BandoriEffectFrameInstance,
  right: BandoriEffectFrameInstance,
): boolean {
  if (left.sortingLayerId !== right.sortingLayerId) {
    return left.sortingLayerId > right.sortingLayerId;
  }
  if (left.sortingOrder !== right.sortingOrder) {
    return left.sortingOrder > right.sortingOrder;
  }
  if (left.rendererPriority !== right.rendererPriority) {
    return left.rendererPriority > right.rendererPriority;
  }
  if (left.sortingFudge !== right.sortingFudge) {
    return left.sortingFudge > right.sortingFudge;
  }
  return left.depth < right.depth;
}

function sortFrameInstances(instances: BandoriEffectFrameInstance[], count: number): void {
  // Insertion sort avoids the temporary arrays created by generic sort paths,
  // and particle counts in the frozen default effects remain small.
  for (let index = 1; index < count; index += 1) {
    const current = instances[index];
    let position = index;
    while (position > 0 && frameComesAfter(instances[position - 1], current)) {
      instances[position] = instances[position - 1];
      position -= 1;
    }
    instances[position] = current;
  }
}

function writeCustomMeshFrame(
  instance: BandoriEffectFrameInstance,
  system: CompiledSystem,
  pool: ParticlePool,
  slot: number,
  screenButton: Readonly<{ x: number; y: number }>,
  pixelsPerWorldUnit: number,
  sizeMultiplierX: number,
  sizeMultiplierY: number,
  sizeMultiplierZ: number,
  normalizedAge: number,
  seed: number,
  ordinal: number,
): void {
  const mesh = system.renderer.mesh;
  const target = instance.mesh;
  if (!mesh || !target) return;
  const particleRotation = eulerRadiansQuaternion({
    x: pool.rotationX[slot],
    y: pool.rotationY[slot],
    z: pool.rotationZ[slot],
  });
  // View-aligned Mesh particles receive their authored 3D particle rotation in
  // camera space. Local-aligned particles additionally inherit the hierarchy.
  const rotation = system.renderer.alignment === "local"
    ? multiplyQuaternion(system.worldRotation, particleRotation)
    : particleRotation;
  const scaleX = pool.sizeX[slot] * system.worldScale.x * sizeMultiplierX;
  const scaleY = pool.sizeY[slot] * system.worldScale.y * sizeMultiplierY;
  const scaleZ = pool.sizeZ[slot] * system.worldScale.z * sizeMultiplierZ;
  let minimumX = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < mesh.vertices.length; index += 3) {
    const projected = rotateVector(rotation, {
      x: mesh.vertices[index] * scaleX,
      y: mesh.vertices[index + 1] * scaleY,
      z: mesh.vertices[index + 2] * scaleZ,
    });
    const screenX = screenButton.x + (pool.x[slot] + projected.x) * pixelsPerWorldUnit;
    const screenY = screenButton.y - (pool.y[slot] + projected.y) * pixelsPerWorldUnit;
    const targetIndex = (index / 3) * 2;
    target.vertices[targetIndex] = screenX;
    target.vertices[targetIndex + 1] = screenY;
    minimumX = Math.min(minimumX, screenX);
    maximumX = Math.max(maximumX, screenX);
    minimumY = Math.min(minimumY, screenY);
    maximumY = Math.max(maximumY, screenY);
  }
  instance.screenX = screenButton.x + pool.x[slot] * pixelsPerWorldUnit;
  instance.screenY = screenButton.y - pool.y[slot] * pixelsPerWorldUnit;
  instance.rotationRadians = 0;
  instance.basisX.x = 1;
  instance.basisX.y = 0;
  instance.basisY.x = 0;
  instance.basisY.y = 1;
  instance.widthPixels = maximumX - minimumX;
  instance.heightPixels = maximumY - minimumY;
  target.uvOffsetU = system.customDataVector0W
    ? evaluateCurve(
        system.customDataVector0W,
        normalizedAge,
        keyedRandom(seed, ordinal, 147),
      )
    : 0;
}

class DefaultEffectRuntime implements BandoriDefaultEffectRuntime {
  readonly frame: BandoriEffectFrame;
  private readonly recipe: CompiledRecipe;
  private readonly fixedStepSeconds: number;
  private readonly cameraVelocity: Vec3;
  private runtimeSeed: number;
  private runtimeButtonIndex: number;
  private currentTick = 0;
  private hasTriggered = false;
  private playing = false;
  private rootActive: boolean;

  constructor(recipe: unknown, options: BandoriDefaultEffectRuntimeOptions) {
    this.recipe = compileRecipe(recipe);
    if (!Number.isInteger(options.seed) || !Number.isFinite(options.seed)) {
      throw new Error("Bandori effect seed must be a finite integer");
    }
    this.runtimeSeed = options.seed >>> 0;
    this.runtimeButtonIndex = this.validateButtonIndex(options.buttonIndex);
    this.fixedStepSeconds = options.fixedStepSeconds ?? DEFAULT_FIXED_STEP_SECONDS;
    if (!(this.fixedStepSeconds > 0) || !Number.isFinite(this.fixedStepSeconds)) {
      throw new Error("Bandori effect fixed step must be a positive finite number");
    }
    this.cameraVelocity = options.cameraVelocityWorldUnitsPerSecond
      ? {
          x: finite(options.cameraVelocityWorldUnitsPerSecond.x, "options.cameraVelocity.x"),
          y: finite(options.cameraVelocityWorldUnitsPerSecond.y, "options.cameraVelocity.y"),
          z: finite(options.cameraVelocityWorldUnitsPerSecond.z, "options.cameraVelocity.z"),
        }
      : { x: 0, y: 0, z: 0 };
    this.rootActive = this.recipe.initialRootActive;
    this.frame = {
      instances: new Array<BandoriEffectFrameInstance>(this.recipe.frameCapacity),
      count: 0,
      timeSeconds: 0,
      isPlaying: false,
      isRootActive: this.rootActive,
    };
    this.writeFrame(0);
  }

  get seed(): number {
    return this.runtimeSeed;
  }

  get buttonIndex(): number {
    return this.runtimeButtonIndex;
  }

  play(timeSeconds = 0, seed = this.runtimeSeed): BandoriEffectFrame {
    if (!Number.isInteger(seed) || !Number.isFinite(seed)) {
      throw new Error("Bandori effect seed must be a finite integer");
    }
    this.runtimeSeed = seed >>> 0;
    this.hasTriggered = true;
    this.playing = true;
    this.rootActive = true;
    this.resetSimulation();
    this.prewarmSystems();
    this.emitZeroTimeBursts();
    return this.advanceAndWrite(timeSeconds);
  }

  stop(): BandoriEffectFrame {
    this.playing = false;
    this.clearParticles();
    if (this.recipe.longHold) this.rootActive = false;
    return this.writeFrame(this.currentTick * this.fixedStepSeconds);
  }

  clear(): BandoriEffectFrame {
    this.playing = false;
    this.clearParticles();
    return this.writeFrame(this.currentTick * this.fixedStepSeconds);
  }

  seek(timeSeconds: number): BandoriEffectFrame {
    this.validateTime(timeSeconds);
    if (!this.hasTriggered) {
      this.currentTick = Math.floor(timeSeconds / this.fixedStepSeconds + EPSILON);
      return this.writeFrame(timeSeconds);
    }
    const shouldPlay = this.playing;
    const shouldBeActive = this.rootActive;
    this.resetSimulation();
    this.playing = true;
    this.rootActive = true;
    this.prewarmSystems();
    this.emitZeroTimeBursts();
    const frame = this.advanceAndWrite(timeSeconds);
    if (!shouldPlay) {
      this.playing = false;
      this.clearParticles();
    }
    this.rootActive = shouldBeActive;
    return shouldPlay ? frame : this.writeFrame(timeSeconds);
  }

  sample(timeSeconds: number): BandoriEffectFrame {
    this.validateTime(timeSeconds);
    const currentTime = this.currentTick * this.fixedStepSeconds;
    if (timeSeconds + EPSILON < currentTime) return this.seek(timeSeconds);
    return this.advanceAndWrite(timeSeconds);
  }

  setButtonIndex(buttonIndex: number): void {
    this.runtimeButtonIndex = this.validateButtonIndex(buttonIndex);
    this.writeFrame(this.frame.timeSeconds);
  }

  private validateButtonIndex(buttonIndex: number): number {
    if (
      !Number.isInteger(buttonIndex) ||
      buttonIndex < 0 ||
      buttonIndex >= this.recipe.sourceButtons.length
    ) {
      throw new Error(
        `Bandori effect buttonIndex must be between 0 and ${this.recipe.sourceButtons.length - 1}`,
      );
    }
    return buttonIndex;
  }

  private validateTime(timeSeconds: number): void {
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) {
      throw new Error("Bandori effect time must be a non-negative finite number");
    }
  }

  private resetSimulation(): void {
    this.currentTick = 0;
    for (const system of this.recipe.systems) clearSystem(system);
  }

  private clearParticles(): void {
    for (const system of this.recipe.systems) system.particles.alive.fill(0);
  }

  private startDelay(system: CompiledSystem, index: number): number {
    const seed = systemSeed(this.runtimeSeed, system, index);
    return Math.max(0, evaluateCurve(system.startDelay, 0, keyedRandom(seed, 0, 90)));
  }

  private emitZeroTimeBursts(): void {
    for (let index = 0; index < this.recipe.systems.length; index += 1) {
      const system = this.recipe.systems[index];
      const delay = this.startDelay(system, index);
      if (delay > EPSILON) continue;
      const seed = systemSeed(this.runtimeSeed, system, index);
      emitBursts(system, seed, -EPSILON, 0, delay);
    }
  }

  private prewarmSystems(): void {
    for (let index = 0; index < this.recipe.systems.length; index += 1) {
      const system = this.recipe.systems[index];
      if (!system.prewarm) continue;
      if (!system.looping) {
        fail(
          `recipe.systems[${index}].prewarm`,
          "prewarm requires a looping particle system",
        );
      }
      const seed = systemSeed(this.runtimeSeed, system, index);
      const wallDuration = system.durationSeconds / system.simulationSpeed;
      const wallOrigin = -wallDuration;
      emitBursts(system, seed, -EPSILON, 0, wallOrigin);
      let elapsed = 0;
      while (elapsed < wallDuration - EPSILON) {
        const next = Math.min(wallDuration - EPSILON, elapsed + this.fixedStepSeconds);
        const activeStart = elapsed * system.simulationSpeed;
        const activeEnd = next * system.simulationSpeed;
        emitBursts(system, seed, activeStart, activeEnd, wallOrigin);
        emitRate(system, seed, activeStart, activeEnd, wallOrigin + next);
        updateParticles(system, seed, wallOrigin + elapsed, wallOrigin + next);
        elapsed = next;
      }
    }
  }

  private advanceAndWrite(timeSeconds: number): BandoriEffectFrame {
    this.validateTime(timeSeconds);
    if (this.playing) {
      const targetTick = Math.floor(timeSeconds / this.fixedStepSeconds + EPSILON);
      while (this.currentTick < targetTick) this.advanceOneTick();
    }
    return this.writeFrame(timeSeconds);
  }

  private advanceOneTick(): void {
    const fromTime = this.currentTick * this.fixedStepSeconds;
    const toTime = fromTime + this.fixedStepSeconds;
    for (let index = 0; index < this.recipe.systems.length; index += 1) {
      const system = this.recipe.systems[index];
      const seed = systemSeed(this.runtimeSeed, system, index);
      const delay = this.startDelay(system, index);
      const previousActive = (fromTime - delay) * system.simulationSpeed;
      const active = (toTime - delay) * system.simulationSpeed;
      emitBursts(system, seed, previousActive, active, delay);
      emitRate(system, seed, previousActive, active, toTime);
      updateParticles(system, seed, fromTime, toTime);
    }
    this.currentTick += 1;
    if (this.isNaturallyComplete(toTime)) this.playing = false;
  }

  private isNaturallyComplete(timeSeconds: number): boolean {
    for (let index = 0; index < this.recipe.systems.length; index += 1) {
      const system = this.recipe.systems[index];
      if (system.looping) return false;
      const endTime =
        this.startDelay(system, index) + system.durationSeconds / system.simulationSpeed;
      if (timeSeconds <= endTime + EPSILON) return false;
      for (const alive of system.particles.alive) {
        if (alive !== 0) return false;
      }
    }
    return true;
  }

  private writeFrame(timeSeconds: number): BandoriEffectFrame {
    const instances = this.frame.instances;
    let count = 0;
    if (this.rootActive) {
      const buttonScreen = this.recipe.screenButtons[this.runtimeButtonIndex];
      const buttonWorld = this.recipe.sourceButtons[this.runtimeButtonIndex];
      const ppu = this.recipe.pixelsPerWorldUnit;
      for (let systemIndex = 0; systemIndex < this.recipe.systems.length; systemIndex += 1) {
        const system = this.recipe.systems[systemIndex];
        if (!system.renderer.enabled || !system.renderer.material) continue;
        const seed = systemSeed(this.runtimeSeed, system, systemIndex);
        const pool = system.particles;
        for (let slot = 0; slot < pool.alive.length; slot += 1) {
          if (pool.alive[slot] === 0 || pool.birth[slot] > timeSeconds + EPSILON) continue;
          const age = timeSeconds - pool.birth[slot];
          if (age < 0 || age >= pool.lifetime[slot]) continue;
          const normalizedAge = clamp01(age / pool.lifetime[slot]);
          const ordinal = pool.ordinal[slot];
          const sizeMultiplierX = system.sizeOverLifetimeX
            ? evaluateCurve(
                system.sizeOverLifetimeX,
                normalizedAge,
                keyedRandom(seed, ordinal, 130),
              )
            : 1;
          const sizeMultiplierY = system.sizeOverLifetimeY
            ? evaluateCurve(
                system.sizeOverLifetimeY,
                normalizedAge,
                keyedRandom(seed, ordinal, 131),
              )
            : sizeMultiplierX;
          const sizeMultiplierZ = system.sizeOverLifetimeZ
            ? evaluateCurve(
                system.sizeOverLifetimeZ,
                normalizedAge,
                keyedRandom(seed, ordinal, 132),
              )
            : sizeMultiplierX;
          const sizeX = Math.abs(
            pool.sizeX[slot] * system.worldScale.x * sizeMultiplierX,
          );
          const sizeY = Math.abs(
            pool.sizeY[slot] * system.worldScale.y * sizeMultiplierY,
          );
          let renderSizeX = sizeX;
          let renderSizeY = sizeY;
          const instance = system.renderInstances[slot];
          instance.particleIndex = ordinal;
          instance.depth = buttonWorld.z + pool.z[slot];
          if (instance.mesh) {
            writeCustomMeshFrame(
              instance,
              system,
              pool,
              slot,
              buttonScreen,
              ppu,
              sizeMultiplierX,
              sizeMultiplierY,
              sizeMultiplierZ,
              normalizedAge,
              seed,
              ordinal,
            );
          } else {
            let rotation =
              pool.rotationZ[slot] +
              (system.renderer.alignment === "local"
                ? projectedZRotation(system.worldRotation)
                : 0);
            const particleVelocity = evaluateParticleVelocity(
              system,
              pool,
              slot,
              seed,
              normalizedAge,
            );
            const velocityX = particleVelocity.x * ppu;
            const velocityY = -particleVelocity.y * ppu;
            if (instance.stretch) {
              const particleVelocityPixels = Math.hypot(velocityX, velocityY);
              const cameraVelocity =
                Math.hypot(this.cameraVelocity.x, this.cameraVelocity.y) * ppu;
              const length =
                Math.abs(sizeY * ppu * system.renderer.lengthScale) +
                particleVelocityPixels * Math.abs(system.renderer.velocityScale) +
                cameraVelocity * Math.abs(system.renderer.cameraVelocityScale);
              instance.stretch.velocityPixelsPerSecond = particleVelocityPixels;
              instance.stretch.lengthPixels = length;
              if (
                system.renderer.rotateWithStretchDirection &&
                particleVelocityPixels > EPSILON
              ) {
                /*
                 * The recovered particle atlases author streaks along texture X
                 * (the normal-hit beam and directional-flick taper are both
                 * horizontal inside their cells). Unity's stretched billboard
                 * turns that authored axis onto the particle velocity. Rotating
                 * local Y instead leaves normal hits as horizontal capsules and
                 * turns directional beams away from their recorded travel axis.
                 */
                rotation = Math.atan2(velocityY, velocityX);
              }
              /*
               * Unity's stretched particle shader maps the authored atlas X
               * direction to the motion/length axis. Keep the un-stretched X
               * size as the cross-axis thickness and put the stretch magnitude
               * on the texture-X extent. Direction is already carried by the
               * velocity-aligned basis; retaining a negative length here would
               * mirror the atlas a second time. This matters for the recovered
               * horizontal taper cells: normal hits become vertical columns,
               * while left/right flicks remain long horizontal beams.
               */
              renderSizeX = length / ppu;
              renderSizeY = sizeX;
            }
            const cos = Math.cos(rotation);
            const sin = Math.sin(rotation);
            const pivotX = system.renderer.pivot.x * renderSizeX;
            const pivotY = system.renderer.pivot.y * renderSizeY;
            const worldX = pool.x[slot] + pivotX * cos - pivotY * sin;
            const worldY = pool.y[slot] + pivotX * sin + pivotY * cos;
            instance.screenX = buttonScreen.x + worldX * ppu;
            instance.screenY = buttonScreen.y - worldY * ppu;
            instance.rotationRadians = rotation;
            if (system.renderer.alignment === "local") {
              const localRight = rotateVector(system.worldRotation, {
                x: cos,
                y: sin,
                z: 0,
              });
              const localUp = rotateVector(system.worldRotation, {
                x: -sin,
                y: cos,
                z: 0,
              });
              instance.basisX.x = localRight.x;
              instance.basisX.y = localRight.y;
              instance.basisY.x = localUp.x;
              instance.basisY.y = localUp.y;
            } else {
              instance.basisX.x = cos;
              instance.basisX.y = sin;
              instance.basisY.x = -sin;
              instance.basisY.y = cos;
            }
            instance.widthPixels = renderSizeX * ppu;
            instance.heightPixels = renderSizeY * ppu;
          }
          if (system.colorOverLifetime) {
            const lifetimeColor = evaluateGradient(
              system.colorOverLifetime,
              normalizedAge,
              keyedRandom(seed, ordinal, 131),
              instance.color,
            );
            multiplyParticleColor(instance.color, pool, slot, lifetimeColor);
          } else {
            instance.color.r = pool.colorR[slot];
            instance.color.g = pool.colorG[slot];
            instance.color.b = pool.colorB[slot];
            instance.color.a = pool.colorA[slot];
          }
          fillUvFrame(
            instance.uv,
            system.textureSheet,
            normalizedAge,
            seed,
            ordinal,
            system.renderer,
          );
          if (
            instance.color.a <= 1 / 255 ||
            Math.abs(instance.widthPixels) <= EPSILON ||
            Math.abs(instance.heightPixels) <= EPSILON
          ) {
            continue;
          }
          instances[count] = instance;
          count += 1;
        }
      }
      sortFrameInstances(instances, count);
    }
    this.frame.count = count;
    this.frame.timeSeconds = timeSeconds;
    this.frame.isPlaying = this.playing;
    this.frame.isRootActive = this.rootActive;
    return this.frame;
  }
}

export function createBandoriDefaultEffectRuntime(
  recipe: unknown,
  options: BandoriDefaultEffectRuntimeOptions,
): BandoriDefaultEffectRuntime {
  return new DefaultEffectRuntime(recipe, options);
}

export function getBandoriDefaultEffectPlacement(
  recipe: unknown,
  buttonIndex: number,
): BandoriDefaultEffectPlacement {
  const compiled = compileRecipe(recipe);
  if (
    !Number.isInteger(buttonIndex)
    || buttonIndex < 0
    || buttonIndex >= compiled.screenButtons.length
  ) {
    throw new Error(
      `Bandori effect buttonIndex must be between 0 and ${compiled.screenButtons.length - 1}`,
    );
  }
  const button = compiled.screenButtons[buttonIndex];
  return {
    pixelsPerWorldUnit: compiled.pixelsPerWorldUnit,
    screenX: button.x,
    screenY: button.y,
  };
}
