import {
  BANDORI_COMPILED_DIRECTION,
  BANDORI_COMPILED_NOTE_FLAG,
  BANDORI_COMPILED_NOTE_KIND,
  BANDORI_COMPILED_RIBBON_KIND,
  getBandoriCompiledLaneSpan,
  getBandoriNativeCurveLaneAnchor,
  type CompiledBandoriChart,
} from "./compiler";
import { lowerBoundNumber, upperBoundNumber } from "./numeric";

export const BANDORI_NATIVE_NOTE_PIXELS_PER_UNIT = 375;
export const BANDORI_NATIVE_NOTE_SPEED_MIN = 1;
export const BANDORI_NATIVE_NOTE_SPEED_MAX = 12;
export const BANDORI_NATIVE_NOTE_SPEED_STEP = 0.01;
export const BANDORI_NATIVE_NOTE_SPEED_DEFAULT = 10;
export const BANDORI_NATIVE_SYNC_LINE_WIDTH = 0.28;

const NATIVE_STAGE_CENTER_X = 667;
const NATIVE_STAGE_CENTER_Y = 375;
const NATIVE_LANE_LOCAL_X = [-6.6, -4.4, -2.2, 0, 2.2, 4.4, 6.6] as const;
const NATIVE_GOAL_LOCAL_Y = -3.4500000477;
const NATIVE_CAMERA_ASPECT_DIVISOR = 9.578571319580078;
export const BANDORI_NATIVE_BUTTON_SCALE = (1334 / 750)
  / NATIVE_CAMERA_ASPECT_DIVISOR;
export const BANDORI_NATIVE_BUTTON_EFFECT_PIXELS_PER_WORLD_UNIT =
  BANDORI_NATIVE_NOTE_PIXELS_PER_UNIT * BANDORI_NATIVE_BUTTON_SCALE;
export const BANDORI_NATIVE_JUDGMENT_LANE_SPACING_PIXELS =
  2.2 * BANDORI_NATIVE_BUTTON_EFFECT_PIXELS_PER_WORLD_UNIT;
const NATIVE_LAUNCHER_SLOPE = -1.3439395427703857;
const NATIVE_DEPTH_EXPONENT_BASE = 1.1;
const NATIVE_DEPTH_EXPONENT_RANGE = 50;
const NATIVE_HIGH_ASPECT_RATIO_MIX = 0.996;
const NATIVE_FLICK_ICON_PERIOD_SECONDS = 1 / 3;
const NATIVE_NOTE_SPEED_ADJUSTMENTS = new Set([-0.5, -0.1, -0.01, 0.01, 0.1, 0.5]);

const KNOWN_NOTE_FLAGS = Object.values(BANDORI_COMPILED_NOTE_FLAG)
  .reduce((mask, flag) => mask | flag, 0);

export type BandoriNativeNoteBody =
  | "normal"
  | "skill"
  | "flick"
  | "long"
  | "slideAmong"
  | "directionalLeft"
  | "directionalRight";

export type BandoriNativeNoteIcon = "flick" | "left" | "right";

export type BandoriNativeNoteVisual = {
  body: BandoriNativeNoteBody;
  coveredLanes?: readonly number[];
  direction: number;
  icon: BandoriNativeNoteIcon | null;
  lane: number;
};

export type BandoriNativeDirectionalConnector = {
  direction: number;
  leftLane: number;
  rightLane: number;
};

export type BandoriNativeNoteVisualGroup = {
  connectors: BandoriNativeDirectionalConnector[];
  visuals: BandoriNativeNoteVisual[];
};

export type BandoriNativeRibbonPoint = {
  beat: number;
  coveredLanes: readonly number[];
  hidden: boolean;
  lane: number;
  meshWidthRate: number;
  time: number;
};

export type BandoriNativeRibbonVisual = {
  isCurvedSlide: boolean;
  kind: "long" | "slide";
  points: BandoriNativeRibbonPoint[];
  rangeWidth: number;
  ribbonIndex: number;
};

export type BandoriNativeChartVisuals = {
  notes: Array<BandoriNativeNoteVisualGroup | null>;
  ribbons: BandoriNativeRibbonVisual[];
};

export type BandoriNativeSyncLinePair = {
  leftNoteIndex: number;
  leftVisualLane: number;
  rightNoteIndex: number;
  rightVisualLane: number;
};

export type BandoriNativeRibbonMeshMode = "ordinary" | "advanced";

export type BandoriNativeRibbonMeshGeometry = {
  indices: Uint32Array;
  mode: BandoriNativeRibbonMeshMode;
  uvs: Float32Array;
  vertices: Float32Array;
};

export type BandoriNativeProjectedNote = {
  iconOffsetX: number;
  iconOffsetY: number;
  progress: number;
  screenX: number;
  screenY: number;
  spawnTimeSeconds: number;
  spritePixelScale: number;
  worldScale: number;
};

export type BandoriNativeProjectedRibbonPoint = BandoriNativeProjectedNote & {
  lane: number;
  phase: "launcher" | "move" | "stop";
};

export class BandoriNativeNoteContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BandoriNativeNoteContractError";
  }
}

type ResolveBandoriNativeNoteInput = {
  direction: number;
  flags: number;
  isMirrored: boolean;
  kind: number;
  lane: number;
  width: number;
};

function hasFlag(flags: number, flag: number): boolean {
  return (flags & flag) !== 0;
}

function fail(message: string): never {
  throw new BandoriNativeNoteContractError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getBandoriNativeNoteArrivalSeconds(noteSpeed: number): number {
  const hundredths = Math.round(noteSpeed / BANDORI_NATIVE_NOTE_SPEED_STEP);
  const normalized = hundredths * BANDORI_NATIVE_NOTE_SPEED_STEP;
  if (
    !Number.isFinite(noteSpeed)
    || noteSpeed < BANDORI_NATIVE_NOTE_SPEED_MIN
    || noteSpeed > BANDORI_NATIVE_NOTE_SPEED_MAX
    || Math.abs(noteSpeed - normalized) > 1e-9
  ) {
    return fail("Native note speed must be a whole hundredth from 1.00 through 12.00");
  }
  return noteSpeed > 11.01
    ? 1.6 - 0.1 * noteSpeed
    : 6 - 0.5 * noteSpeed;
}

export function getBandoriSimulatorNoteArrivalSeconds(
  noteSpeed: number,
  approachTimeScale = 1,
): number {
  if (
    !Number.isFinite(approachTimeScale)
    || approachTimeScale <= 0
    || approachTimeScale > 1
  ) {
    return fail("Simulator note approach time scale must be greater than zero and at most one");
  }
  return getBandoriNativeNoteArrivalSeconds(noteSpeed) * approachTimeScale;
}

export const BANDORI_NATIVE_NOTE_ARRIVAL_SECONDS = getBandoriNativeNoteArrivalSeconds(
  BANDORI_NATIVE_NOTE_SPEED_DEFAULT,
);

export function adjustBandoriSimulatorNoteSpeed(noteSpeed: number, adjustment: number): number {
  getBandoriNativeNoteArrivalSeconds(noteSpeed);
  if (!NATIVE_NOTE_SPEED_ADJUSTMENTS.has(adjustment)) {
    return fail("Simulator note speed adjustment must be ±0.50, ±0.10, or ±0.01");
  }

  const clamped = Math.min(
    BANDORI_NATIVE_NOTE_SPEED_MAX,
    Math.max(BANDORI_NATIVE_NOTE_SPEED_MIN, noteSpeed + adjustment),
  );
  return Math.round(clamped / BANDORI_NATIVE_NOTE_SPEED_STEP)
    * BANDORI_NATIVE_NOTE_SPEED_STEP;
}

function directionalVisual(
  lane: number,
  direction: number,
  hasIcon = true,
): BandoriNativeNoteVisual {
  if (direction === BANDORI_COMPILED_DIRECTION.left) {
    return { body: "directionalLeft", direction, icon: hasIcon ? "left" : null, lane };
  }
  if (direction === BANDORI_COMPILED_DIRECTION.right) {
    return { body: "directionalRight", direction, icon: hasIcon ? "right" : null, lane };
  }
  return fail("Directional note requires a confirmed left or right direction");
}

function pointVisual(
  body: BandoriNativeNoteBody,
  lane: number,
  direction = BANDORI_COMPILED_DIRECTION.none,
  icon: BandoriNativeNoteIcon | null = null,
): BandoriNativeNoteVisual {
  return { body, direction, icon, lane };
}

function withBody(
  visual: BandoriNativeNoteVisual,
  body: BandoriNativeNoteBody,
): BandoriNativeNoteVisual {
  return { ...visual, body };
}

/**
 * Resolves one verified Sprite. Wide Directional expansion and whole-ribbon
 * eligibility are handled by the chart-level preparation pass.
 */
export function resolveBandoriNativeNoteVisual({
  direction: sourceDirection,
  flags,
  isMirrored,
  kind,
  lane: sourceLane,
  width,
}: ResolveBandoriNativeNoteInput): BandoriNativeNoteVisual | null {
  if (!Number.isInteger(sourceLane) || sourceLane < 0 || sourceLane > 6 || width !== 1) {
    return fail("Native point-note presentation supports only integer lanes 0-6 at width 1");
  }
  if (!Number.isInteger(flags) || flags < 0 || (flags & ~KNOWN_NOTE_FLAGS) !== 0) {
    return fail("Native point-note presentation received unsupported flags");
  }
  if (
    sourceDirection !== BANDORI_COMPILED_DIRECTION.none
    && sourceDirection !== BANDORI_COMPILED_DIRECTION.left
    && sourceDirection !== BANDORI_COMPILED_DIRECTION.right
  ) {
    return fail("Native point-note presentation received an unsupported direction");
  }

  const lane = isMirrored ? 6 - sourceLane : sourceLane;
  const direction = isMirrored ? -sourceDirection : sourceDirection;
  const isFlick = hasFlag(flags, BANDORI_COMPILED_NOTE_FLAG.flick);
  const isCharge = hasFlag(flags, BANDORI_COMPILED_NOTE_FLAG.charge);
  const isSkill = hasFlag(flags, BANDORI_COMPILED_NOTE_FLAG.skill);
  const isHidden = hasFlag(flags, BANDORI_COMPILED_NOTE_FLAG.hidden);
  const isRibbonStart = hasFlag(flags, BANDORI_COMPILED_NOTE_FLAG.ribbonStart);
  const isRibbonEnd = hasFlag(flags, BANDORI_COMPILED_NOTE_FLAG.ribbonEnd);

  if (isCharge && isSkill) {
    return fail("The native charge-plus-skill point-note appearance is not confirmed");
  }

  if (kind === BANDORI_COMPILED_NOTE_KIND.single) {
    if (direction !== BANDORI_COMPILED_DIRECTION.none || isHidden || isRibbonStart || isRibbonEnd) {
      return fail("Single note contains non-native direction, hidden, or ribbon state");
    }
    if (isFlick) return pointVisual("flick", lane, direction, "flick");
    if (isSkill) return pointVisual("skill", lane);
    return pointVisual("normal", lane);
  }

  if (kind === BANDORI_COMPILED_NOTE_KIND.directional) {
    if (isHidden || isRibbonStart || isRibbonEnd) {
      return fail("Directional note contains non-native hidden or ribbon state");
    }
    return directionalVisual(lane, direction);
  }

  if (
    kind === BANDORI_COMPILED_NOTE_KIND.longStart
    || kind === BANDORI_COMPILED_NOTE_KIND.longEnd
  ) {
    const expectedRibbonFlag = kind === BANDORI_COMPILED_NOTE_KIND.longStart
      ? BANDORI_COMPILED_NOTE_FLAG.ribbonStart
      : BANDORI_COMPILED_NOTE_FLAG.ribbonEnd;
    if (
      isHidden
      || !hasFlag(flags, expectedRibbonFlag)
      || hasFlag(
        flags,
        kind === BANDORI_COMPILED_NOTE_KIND.longStart
          ? BANDORI_COMPILED_NOTE_FLAG.ribbonEnd
          : BANDORI_COMPILED_NOTE_FLAG.ribbonStart,
      )
    ) {
      return fail("Long endpoint contains an unconfirmed direction, flag, or ribbon role");
    }
    if (direction !== BANDORI_COMPILED_DIRECTION.none) {
      if (!isFlick || kind !== BANDORI_COMPILED_NOTE_KIND.longEnd) {
        return fail("Long Directional appearance is confirmed only for a Flick tail");
      }
      const visual = directionalVisual(lane, direction);
      return isSkill ? withBody(visual, "skill") : visual;
    }
    if (isFlick) {
      if (kind !== BANDORI_COMPILED_NOTE_KIND.longEnd) {
        return fail("Long Flick appearance is confirmed only for the tail");
      }
      return pointVisual(isSkill ? "skill" : "flick", lane, direction, "flick");
    }
    if (isSkill) return pointVisual("skill", lane);
    return pointVisual("long", lane);
  }

  if (kind === BANDORI_COMPILED_NOTE_KIND.slide) {
    if (isHidden || (isRibbonStart && isRibbonEnd)) {
      return fail("Slide node contains an unconfirmed direction or flag");
    }
    if (direction !== BANDORI_COMPILED_DIRECTION.none) {
      if (!isRibbonEnd || !isFlick) {
        return fail("Slide Directional appearance is confirmed only for a Flick tail");
      }
      const visual = directionalVisual(lane, direction);
      return isSkill ? withBody(visual, "skill") : visual;
    }
    if (isFlick) {
      if (!isRibbonEnd) return fail("Slide Flick appearance is confirmed only for the tail");
      return pointVisual(isSkill ? "skill" : "flick", lane, direction, "flick");
    }
    if (isSkill) return pointVisual("skill", lane);
    return pointVisual(isRibbonStart || isRibbonEnd ? "long" : "slideAmong", lane);
  }

  return fail(`Unsupported compiled point-note kind: ${kind}`);
}

function validateRibbonColumns(compiled: CompiledBandoriChart): void {
  const { ribbons } = compiled;
  const ribbonLength = ribbons.kinds.length;
  const ribbonColumns: ArrayLike<number>[] = [
    ribbons.sourceEntityIndexes,
    ribbons.startTimes,
    ribbons.endTimes,
  ];
  if (ribbonColumns.some((column) => column.length !== ribbonLength)) {
    return fail("Compiled ribbon columns have inconsistent lengths");
  }
  if (
    ribbons.connectionOffsets.length !== ribbonLength + 1
    || ribbons.connectionOffsets[0] !== 0
    || ribbons.connectionOffsets[ribbonLength] !== ribbons.connectionTimes.length
  ) {
    return fail("Compiled ribbon connection offsets have inconsistent lengths");
  }
  const connectionLength = ribbons.connectionTimes.length;
  const connectionColumns: ArrayLike<number>[] = [
    ribbons.connectionBeats,
    ribbons.connectionLanes,
    ribbons.connectionWidths,
    ribbons.connectionDirections,
    ribbons.connectionFlags,
  ];
  if (connectionColumns.some((column) => column.length !== connectionLength)) {
    return fail("Compiled ribbon connection columns have inconsistent lengths");
  }
  if (
    ribbons.connectionCoverageOffsets.length !== connectionLength + 1
    || ribbons.connectionCoverageOffsets[0] !== 0
    || ribbons.connectionCoverageOffsets[connectionLength]
      !== ribbons.connectionCoverageLanes.length
  ) {
    return fail("Compiled ribbon connection coverage has inconsistent lengths");
  }
  if (
    ribbons.curveOffsets.length !== ribbonLength + 1
    || ribbons.curveOffsets[0] !== 0
    || ribbons.curveOffsets[ribbonLength] !== ribbons.curveTimes.length
  ) {
    return fail("Compiled ribbon curve offsets have inconsistent lengths");
  }
  const curveLength = ribbons.curveTimes.length;
  const curveColumns: ArrayLike<number>[] = [
    ribbons.curveBeats,
    ribbons.curveLanes,
    ribbons.curveWidths,
    ribbons.curvePositions,
    ribbons.curveFlags,
  ];
  if (curveColumns.some((column) => column.length !== curveLength)) {
    return fail("Compiled ribbon curve columns have inconsistent lengths");
  }
}

export function isBandoriHabahiroChart(compiled: CompiledBandoriChart): boolean {
  return compiled.source.some((entity) => isRecord(entity) && entity.laneChange === true);
}

export function getBandoriNativeMultiRangeMeshWidthRate(coverageLength: number): number {
  if (!Number.isInteger(coverageLength) || coverageLength < 1 || coverageLength > 7) {
    return fail("Native multi-range mesh width requires one through seven lanes");
  }
  if (coverageLength === 1) return 1;
  if (coverageLength === 2) return 1.0499999523162842;
  return 1.05 + 0.03000009059906006 * Math.min(NATIVE_HIGH_ASPECT_RATIO_MIX, 1);
}

function readRibbonCoverage(
  compiled: CompiledBandoriChart,
  pointIndex: number,
  isMirrored: boolean,
  allowFractionalLane: boolean,
): number[] {
  const { connectionCoverageLanes, connectionCoverageOffsets } = compiled.ribbons;
  const start = connectionCoverageOffsets[pointIndex];
  const end = connectionCoverageOffsets[pointIndex + 1];
  if (end <= start || end > connectionCoverageLanes.length) {
    return fail("Compiled ribbon connection coverage has an invalid offset");
  }
  const lanes = Array.from(connectionCoverageLanes.slice(start, end));
  if (
    allowFractionalLane
    && lanes.length === 1
    && getBandoriNativeCurveLaneAnchor(lanes[0]) !== null
  ) {
    return isMirrored ? [6 - lanes[0]] : lanes;
  }
  for (let index = 0; index < lanes.length; index += 1) {
    const lane = lanes[index];
    if (!Number.isInteger(lane) || lane < 0 || lane > 6 || (index > 0 && lane !== lanes[index - 1] + 1)) {
      return fail("Compiled ribbon connection coverage must be contiguous lanes 0 through 6");
    }
  }
  return isMirrored ? lanes.map((lane) => 6 - lane).reverse() : lanes;
}

function prepareRibbonVisuals(
  compiled: CompiledBandoriChart,
  isMirrored: boolean,
): BandoriNativeRibbonVisual[] {
  validateRibbonColumns(compiled);
  const { ribbons } = compiled;
  const isHabahiro = isBandoriHabahiroChart(compiled);
  const visuals: BandoriNativeRibbonVisual[] = [];
  for (let ribbonIndex = 0; ribbonIndex < ribbons.kinds.length; ribbonIndex += 1) {
    const kind = ribbons.kinds[ribbonIndex];
    if (
      kind !== BANDORI_COMPILED_RIBBON_KIND.long
      && kind !== BANDORI_COMPILED_RIBBON_KIND.slide
    ) {
      return fail(`Unsupported compiled ribbon kind: ${kind}`);
    }
    const connectionStart = ribbons.connectionOffsets[ribbonIndex];
    const connectionEnd = ribbons.connectionOffsets[ribbonIndex + 1];
    const connectionCount = connectionEnd - connectionStart;
    const isLong = kind === BANDORI_COMPILED_RIBBON_KIND.long;
    if (isLong ? connectionCount !== 2 : connectionCount < 2) {
      continue;
    }

    let isSupported = true;
    const points: BandoriNativeRibbonPoint[] = [];
    for (let pointIndex = connectionStart; pointIndex < connectionEnd; pointIndex += 1) {
      const lane = ribbons.connectionLanes[pointIndex];
      const width = ribbons.connectionWidths[pointIndex];
      const direction = ribbons.connectionDirections[pointIndex];
      const flags = ribbons.connectionFlags[pointIndex];
      const hidden = hasFlag(flags, BANDORI_COMPILED_NOTE_FLAG.hidden);
      const relativeIndex = pointIndex - connectionStart;
      const isEndpoint = relativeIndex === 0 || relativeIndex === connectionCount - 1;
      const isFlick = hasFlag(flags, BANDORI_COMPILED_NOTE_FLAG.flick);
      const isDirectional = direction === BANDORI_COMPILED_DIRECTION.left
        || direction === BANDORI_COMPILED_DIRECTION.right;
      const sourceCoverage = readRibbonCoverage(compiled, pointIndex, isMirrored, hidden);
      // Directional add bodies never become NoteMesh endpoints. The ribbon keeps
      // the scalar root lane and one-lane width even when the body spans N lanes.
      const coveredLanes = isDirectional
        ? [isMirrored ? 6 - lane : lane]
        : sourceCoverage;
      // MusicScoreBezierConverter stores a one-lane hidden sample's continuous
      // DiffVolume position in connectionLanes while coverage retains the
      // quantized native button. Multi-range hidden nodes still use the average
      // of their covered buttons. This keeps generated curves continuous
      // without changing native multi-range centers.
      const centerLane = hidden && sourceCoverage.length === 1
        ? (isMirrored ? 6 - lane : lane)
        : coveredLanes.reduce((sum, value) => sum + value, 0) / coveredLanes.length;
      const span = getBandoriCompiledLaneSpan(lane, width, direction);
      const hasValidLane = hidden
        ? getBandoriNativeCurveLaneAnchor(lane) !== null
        : Number.isInteger(lane)
          && lane >= 0
          && lane <= 6
          && span.leftLane >= 0
          && span.rightLane <= 7;
      if (
        !Number.isFinite(lane)
        || !hasValidLane
        || !Number.isInteger(width)
        || width < 1
        || width > 7
        || (hidden && (isLong || isEndpoint))
        || (hidden && direction !== BANDORI_COMPILED_DIRECTION.none)
        || (direction !== BANDORI_COMPILED_DIRECTION.none && !isDirectional)
        || (isDirectional && (!isEndpoint || !isFlick))
        || (!isDirectional && width !== 1)
        || (!isHabahiro && sourceCoverage.length !== 1)
        || (isFlick && !isEndpoint)
      ) {
        isSupported = false;
        break;
      }
      points.push({
        beat: ribbons.connectionBeats[pointIndex],
        coveredLanes,
        hidden,
        lane: centerLane,
        meshWidthRate: coveredLanes.length
          * getBandoriNativeMultiRangeMeshWidthRate(coveredLanes.length),
        time: ribbons.connectionTimes[pointIndex],
      });
    }
    if (!isSupported) continue;
    const rangeWidth = points[0]?.coveredLanes.length;
    if (
      rangeWidth === undefined
      || points.some((point) => point.coveredLanes.length !== rangeWidth)
    ) {
      continue;
    }
    visuals.push({
      isCurvedSlide: !isLong && points.some((point) => point.hidden),
      kind: isLong ? "long" : "slide",
      points,
      rangeWidth,
      ribbonIndex,
    });
  }
  return visuals;
}

function prepareDirectionalGroup(
  sourceLane: number,
  sourceDirection: number,
  width: number,
  flags: number,
  isMirrored: boolean,
  allowRibbonFlags = false,
): BandoriNativeNoteVisualGroup | null {
  if (!Number.isInteger(width) || width < 1) {
    return fail("Directional note width must be a positive integer");
  }
  if (width > 7) return null;
  if (
    sourceDirection !== BANDORI_COMPILED_DIRECTION.left
    && sourceDirection !== BANDORI_COMPILED_DIRECTION.right
  ) {
    return fail("Directional note requires a confirmed left or right direction");
  }
  if (
    !Number.isInteger(flags)
    || flags < 0
    || (flags & ~KNOWN_NOTE_FLAGS) !== 0
    || hasFlag(flags, BANDORI_COMPILED_NOTE_FLAG.hidden)
    || (!allowRibbonFlags && (
      hasFlag(flags, BANDORI_COMPILED_NOTE_FLAG.ribbonStart)
      || hasFlag(flags, BANDORI_COMPILED_NOTE_FLAG.ribbonEnd)
    ))
  ) {
    return fail("Directional note contains unsupported flags");
  }

  const sourceSpan = getBandoriCompiledLaneSpan(sourceLane, width, sourceDirection);
  if (sourceSpan.leftLane < 0 || sourceSpan.rightLane > 7) return null;
  const lanes = Array.from(
    { length: width },
    (_, index) => sourceSpan.leftLane + index,
  ).map((lane) => isMirrored ? 6 - lane : lane).sort((left, right) => left - right);
  const direction = isMirrored ? -sourceDirection : sourceDirection;
  const iconLane = direction === BANDORI_COMPILED_DIRECTION.left
    ? lanes[0]
    : lanes.at(-1);
  const visuals = lanes.map((lane) => directionalVisual(lane, direction, lane === iconLane));
  // This insertion order is the 2D equivalent of the native ±0.00001 z offsets.
  if (direction === BANDORI_COMPILED_DIRECTION.left) visuals.reverse();
  return {
    connectors: lanes.slice(0, -1).map((leftLane, index) => ({
      direction,
      leftLane,
      rightLane: lanes[index + 1],
    })),
    visuals,
  };
}

function preparePointVisuals(
  compiled: CompiledBandoriChart,
  isMirrored: boolean,
  supportedRibbonIndexes: ReadonlySet<number>,
): Array<BandoriNativeNoteVisualGroup | null> {
  const { notes } = compiled;
  const isHabahiro = isBandoriHabahiroChart(compiled);
  const length = notes.times.length;
  const columns: ArrayLike<number>[] = [
    notes.lanes,
    notes.widths,
    notes.kinds,
    notes.directions,
    notes.flags,
    notes.sourceEntityIndexes,
    notes.sourceNodeIndexes,
    notes.ribbonIndexes,
  ];
  if (columns.some((column) => column.length !== length)) {
    return fail("Compiled point-note columns have inconsistent lengths");
  }
  if (
    notes.coverageOffsets.length !== length + 1
    || notes.coverageOffsets[0] !== 0
    || notes.coverageOffsets[length] !== notes.coverageLanes.length
  ) {
    return fail("Compiled point-note lane coverage has inconsistent lengths");
  }

  const groups: Array<BandoriNativeNoteVisualGroup | null> = [];
  for (let index = 0; index < length; index += 1) {
    const coverageStart = notes.coverageOffsets[index];
    const coverageEnd = notes.coverageOffsets[index + 1];
    if (coverageEnd <= coverageStart || coverageEnd > notes.coverageLanes.length) {
      return fail("Compiled point-note lane coverage has an invalid offset");
    }
    const kind = notes.kinds[index];
    if (
      kind !== BANDORI_COMPILED_NOTE_KIND.single
      && kind !== BANDORI_COMPILED_NOTE_KIND.directional
      && kind !== BANDORI_COMPILED_NOTE_KIND.longStart
      && kind !== BANDORI_COMPILED_NOTE_KIND.longEnd
      && kind !== BANDORI_COMPILED_NOTE_KIND.slide
    ) {
      return fail(`Unsupported compiled point-note kind: ${kind}`);
    }

    const isRibbonNode = kind === BANDORI_COMPILED_NOTE_KIND.longStart
      || kind === BANDORI_COMPILED_NOTE_KIND.longEnd
      || kind === BANDORI_COMPILED_NOTE_KIND.slide;
    if (isRibbonNode && !supportedRibbonIndexes.has(notes.ribbonIndexes[index])) {
      groups.push(null);
      continue;
    }

    const sourceCoverage = Array.from(notes.coverageLanes.slice(coverageStart, coverageEnd));
    const coverageLength = sourceCoverage.length;
    if (coverageLength === 1 && sourceCoverage[0] !== notes.lanes[index]) {
      return fail("Single-lane point-note coverage does not match its scalar lane anchor");
    }
    if (coverageLength > 1 && !isHabahiro) {
      groups.push(null);
      continue;
    }

    let group: BandoriNativeNoteVisualGroup | null;
    if (kind === BANDORI_COMPILED_NOTE_KIND.directional) {
      if (coverageLength !== 1) {
        groups.push(null);
        continue;
      }
      group = prepareDirectionalGroup(
        notes.lanes[index],
        notes.directions[index],
        notes.widths[index],
        notes.flags[index],
        isMirrored,
      );
    } else if (
      isRibbonNode
      && notes.directions[index] !== BANDORI_COMPILED_DIRECTION.none
    ) {
      if (coverageLength !== 1) {
        groups.push(null);
        continue;
      }
      const isRibbonEnd = hasFlag(
        notes.flags[index],
        BANDORI_COMPILED_NOTE_FLAG.ribbonEnd,
      );
      if (
        !isRibbonEnd
        || !hasFlag(notes.flags[index], BANDORI_COMPILED_NOTE_FLAG.flick)
      ) {
        return fail("Ribbon Directional appearance is confirmed only for a Flick tail");
      }
      group = prepareDirectionalGroup(
        notes.lanes[index],
        notes.directions[index],
        notes.widths[index],
        notes.flags[index],
        isMirrored,
        true,
      );
      if (group && hasFlag(notes.flags[index], BANDORI_COMPILED_NOTE_FLAG.skill)) {
        group = {
          ...group,
          visuals: group.visuals.map((visual) => withBody(visual, "skill")),
        };
      }
    } else if (notes.widths[index] !== 1) {
      group = null;
    } else {
      const visual = resolveBandoriNativeNoteVisual({
        direction: notes.directions[index],
        flags: notes.flags[index],
        isMirrored,
        kind,
        lane: notes.lanes[index],
        width: notes.widths[index],
      });
      if (!visual) {
        group = null;
      } else if (coverageLength === 1) {
        group = { connectors: [], visuals: [visual] };
      } else {
        const coveredLanes = isMirrored
          ? sourceCoverage.map((lane) => 6 - lane).reverse()
          : sourceCoverage;
        const lane = coveredLanes.reduce((sum, value) => sum + value, 0)
          / coveredLanes.length;
        group = {
          connectors: [],
          visuals: [{ ...visual, coveredLanes, lane }],
        };
      }
    }
    groups.push(group);
  }
  return groups;
}

export function prepareBandoriNativeNoteVisuals(
  compiled: CompiledBandoriChart,
  isMirrored: boolean,
): Array<BandoriNativeNoteVisualGroup | null> {
  return prepareBandoriNativeChartVisuals(compiled, isMirrored).notes;
}

export function prepareBandoriNativeChartVisuals(
  compiled: CompiledBandoriChart,
  isMirrored: boolean,
): BandoriNativeChartVisuals {
  const ribbons = prepareRibbonVisuals(compiled, isMirrored);
  const supportedRibbonIndexes = new Set(
    ribbons.map((ribbon) => ribbon.ribbonIndex),
  );
  return {
    notes: preparePointVisuals(compiled, isMirrored, supportedRibbonIndexes),
    ribbons,
  };
}

export function isBandoriNativeShortRhythmUnderEighthBeat(beat: number): boolean {
  if (!Number.isFinite(beat) || beat < 0) {
    return fail("Native rhythm support requires a finite non-negative beat");
  }
  // Imported BMS beat units count quarter notes: one 4/4 measure spans four.
  // Native evaluates the equivalent measure-relative fraction as
  // ((numerator * 8) % denominator) > 0, which becomes beat * 2 here.
  return !Number.isInteger(beat * 2);
}

export function isBandoriNativeRhythmSupportNote(
  compiled: CompiledBandoriChart,
  visuals: BandoriNativeChartVisuals,
  noteIndex: number,
): boolean {
  if (!Number.isInteger(noteIndex) || noteIndex < 0 || noteIndex >= compiled.notes.times.length) {
    return fail("Native rhythm-support lookup received an invalid note index");
  }
  const group = visuals.notes[noteIndex];
  return compiled.notes.kinds[noteIndex] === BANDORI_COMPILED_NOTE_KIND.single
    && group?.visuals.length === 1
    && group.visuals[0].body === "normal"
    && isBandoriNativeShortRhythmUnderEighthBeat(compiled.notes.beats[noteIndex]);
}

/** Builds the native adjacent-target chain after collapsing each Directional group. */
export function collectBandoriNativeSyncLinePairs(
  compiled: CompiledBandoriChart,
  visuals: BandoriNativeChartVisuals,
): BandoriNativeSyncLinePair[] {
  if (visuals.notes.length !== compiled.notes.times.length) {
    return fail("Native sync-line lookup received inconsistent note columns");
  }

  const targetsByTime = new Map<number, Array<{
    leftLane: number;
    noteIndex: number;
    rightLane: number;
  }>>();
  for (let noteIndex = 0; noteIndex < visuals.notes.length; noteIndex += 1) {
    const group = visuals.notes[noteIndex];
    const kind = compiled.notes.kinds[noteIndex];
    const flags = compiled.notes.flags[noteIndex];
    const direction = compiled.notes.directions[noteIndex];
    const width = compiled.notes.widths[noteIndex];
    const isEndpoint = kind !== BANDORI_COMPILED_NOTE_KIND.slide
      || hasFlag(flags, BANDORI_COMPILED_NOTE_FLAG.ribbonStart)
      || hasFlag(flags, BANDORI_COMPILED_NOTE_FLAG.ribbonEnd);
    const isDirectionalGroup = direction !== BANDORI_COMPILED_DIRECTION.none;
    const isAdmittedGroup = isDirectionalGroup
      ? width >= 1 && width <= 7 && group?.visuals.length === width
      : group?.visuals.length === 1;
    if (
      !group
      || !isAdmittedGroup
      || !isEndpoint
    ) continue;

    const lanes = group.visuals.map((visual) => visual.lane);
    const time = compiled.notes.times[noteIndex];
    const targets = targetsByTime.get(time) ?? [];
    targets.push({
      leftLane: Math.min(...lanes),
      noteIndex,
      rightLane: Math.max(...lanes),
    });
    targetsByTime.set(time, targets);
  }

  const pairs: BandoriNativeSyncLinePair[] = [];
  for (const targets of targetsByTime.values()) {
    targets.sort((left, right) => (
      left.leftLane - right.leftLane
      || left.rightLane - right.rightLane
      || left.noteIndex - right.noteIndex
    ));
    for (let index = 1; index < targets.length; index += 1) {
      pairs.push({
        leftNoteIndex: targets[index - 1].noteIndex,
        leftVisualLane: targets[index - 1].rightLane,
        rightNoteIndex: targets[index].noteIndex,
        rightVisualLane: targets[index].leftLane,
      });
    }
  }
  return pairs;
}

const ORDINARY_RIBBON_SECTION_PROGRESS = new Float32Array([
  0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1,
]);

const ADVANCED_RIBBON_SECTION_PROGRESS = new Float32Array([
  0,
  2 / 40,
  4 / 40,
  6 / 40,
  8 / 40,
  10 / 40,
  12 / 40,
  15 / 40,
  17 / 40,
  19 / 40,
  22 / 40,
  25 / 40,
  28 / 40,
  31 / 40,
  33 / 40,
  35 / 40,
  36 / 40,
  37 / 40,
  38 / 40,
  39 / 40,
  1,
]);

function getRibbonSectionProgress(
  mode: BandoriNativeRibbonMeshMode,
): Float32Array {
  return mode === "advanced"
    ? ADVANCED_RIBBON_SECTION_PROGRESS
    : ORDINARY_RIBBON_SECTION_PROGRESS;
}

export function isBandoriNativeAdvancedNoteSpeed(noteSpeed: number): boolean {
  getBandoriNativeNoteArrivalSeconds(noteSpeed);
  return noteSpeed > 11.01;
}

export function createBandoriNativeRibbonMeshGeometry(
  mode: BandoriNativeRibbonMeshMode,
): BandoriNativeRibbonMeshGeometry {
  const progress = getRibbonSectionProgress(mode);
  const vertices = new Float32Array(progress.length * 4);
  const uvs = new Float32Array(progress.length * 4);
  const indices = new Uint32Array((progress.length - 1) * 6);
  for (let section = 0; section < progress.length; section += 1) {
    const vertexOffset = section * 4;
    const v = section / (progress.length - 1);
    uvs[vertexOffset] = 0;
    uvs[vertexOffset + 1] = v;
    uvs[vertexOffset + 2] = 1;
    uvs[vertexOffset + 3] = v;
    if (section === progress.length - 1) continue;
    const left = section * 2;
    const right = left + 1;
    const nextLeft = left + 2;
    const nextRight = left + 3;
    const indexOffset = section * 6;
    indices.set([left, right, nextLeft, right, nextRight, nextLeft], indexOffset);
  }
  return { indices, mode, uvs, vertices };
}

export function updateBandoriNativeRibbonMeshVertices(
  geometry: BandoriNativeRibbonMeshGeometry,
  start: { halfWidth: number; x: number; y: number },
  end: { halfWidth: number; x: number; y: number },
): void {
  const progress = getRibbonSectionProgress(geometry.mode);
  if (geometry.vertices.length !== progress.length * 4) {
    return fail("Native ribbon mesh geometry has an invalid vertex count");
  }
  for (let section = 0; section < progress.length; section += 1) {
    const t = progress[section];
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;
    const halfWidth = start.halfWidth + (end.halfWidth - start.halfWidth) * t;
    const offset = section * 4;
    geometry.vertices[offset] = x - halfWidth;
    geometry.vertices[offset + 1] = y;
    geometry.vertices[offset + 2] = x + halfWidth;
    geometry.vertices[offset + 3] = y;
  }
}

export const BANDORI_NATIVE_DIRECTIONAL_CONNECTOR_UVS = new Float32Array([
  0, 0,
  0, 1,
  1, 0,
  1, 1,
]);

export const BANDORI_NATIVE_DIRECTIONAL_CONNECTOR_INDICES = new Uint32Array([
  0, 1, 2,
  1, 3, 2,
]);

export function updateBandoriNativeDirectionalConnectorVertices(
  vertices: Float32Array,
  start: { x: number; y: number },
  end: { x: number; y: number },
  width: number,
): void {
  if (vertices.length !== 8 || !Number.isFinite(width) || width < 0) {
    return fail("Native Directional connector geometry is invalid");
  }
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);
  if (length === 0) {
    vertices.fill(0);
    return;
  }
  const halfWidth = width / 2;
  const normalX = (-deltaY / length) * halfWidth;
  const normalY = (deltaX / length) * halfWidth;
  vertices.set([
    start.x - normalX, start.y - normalY,
    start.x + normalX, start.y + normalY,
    end.x - normalX, end.y - normalY,
    end.x + normalX, end.y + normalY,
  ]);
}

export function lowerBoundBandoriNoteTime(
  values: ArrayLike<number>,
  target: number,
): number {
  return lowerBoundNumber(values, target);
}

export function upperBoundBandoriNoteTime(
  values: ArrayLike<number>,
  target: number,
): number {
  return upperBoundNumber(values, target);
}

function projectBandoriNativeLane(
  centerLane: number,
  progress: number,
  positionProgress: number,
  spawnTimeSeconds: number,
  presentationTimeSeconds: number,
): BandoriNativeProjectedNote {
  const cameraRatio = BANDORI_NATIVE_BUTTON_SCALE;
  const goalX = (NATIVE_LANE_LOCAL_X[0] + 2.2 * centerLane) * cameraRatio;
  const goalY = NATIVE_GOAL_LOCAL_Y * cameraRatio;
  const leftGoalX = NATIVE_LANE_LOCAL_X[0] * cameraRatio;
  const launcherY = goalY + leftGoalX * NATIVE_LAUNCHER_SLOPE;
  const startX = 0.05 * goalX;
  const startY = goalY + 0.95 * (launcherY - goalY);
  const worldY = startY - Math.abs(
    (startY - goalY) * positionProgress,
  );
  const worldX = startX + positionProgress * (goalX - startX);
  const depthProgress = Math.abs(launcherY - worldY)
    / Math.abs(launcherY - goalY);
  const depthScale = cameraRatio * depthProgress;
  const worldScale = depthScale * NATIVE_HIGH_ASPECT_RATIO_MIX
    + (1 - NATIVE_HIGH_ASPECT_RATIO_MIX);
  const elapsedSeconds = Math.max(0, presentationTimeSeconds - spawnTimeSeconds);
  const flickPhaseSeconds = elapsedSeconds % NATIVE_FLICK_ICON_PERIOD_SECONDS;

  return {
    iconOffsetX: 0,
    iconOffsetY: -(0.7 + 1.8 * flickPhaseSeconds)
      * worldScale
      * BANDORI_NATIVE_NOTE_PIXELS_PER_UNIT,
    progress,
    screenX: NATIVE_STAGE_CENTER_X + BANDORI_NATIVE_NOTE_PIXELS_PER_UNIT * worldX,
    screenY: NATIVE_STAGE_CENTER_Y - BANDORI_NATIVE_NOTE_PIXELS_PER_UNIT * worldY,
    spawnTimeSeconds,
    spritePixelScale: worldScale * BANDORI_NATIVE_NOTE_PIXELS_PER_UNIT / 100,
    worldScale,
  };
}

export function projectBandoriNativeNote(
  centerLane: number,
  hitTimeSeconds: number,
  presentationTimeSeconds: number,
  noteSpeed = BANDORI_NATIVE_NOTE_SPEED_DEFAULT,
  approachTimeScale = 1,
): BandoriNativeProjectedNote | null {
  if (!Number.isFinite(centerLane)) {
    return fail("Native point-note projection requires a finite lane center");
  }
  if (!Number.isFinite(hitTimeSeconds) || !Number.isFinite(presentationTimeSeconds)) {
    return fail("Native point-note projection requires finite times");
  }

  const arrivalSeconds = getBandoriSimulatorNoteArrivalSeconds(noteSpeed, approachTimeScale);
  const spawnTimeSeconds = hitTimeSeconds - arrivalSeconds;
  if (presentationTimeSeconds < spawnTimeSeconds || presentationTimeSeconds > hitTimeSeconds) {
    return null;
  }

  const progress = Math.max(0, Math.min(
    1,
    1 - ((hitTimeSeconds - presentationTimeSeconds) / arrivalSeconds),
  ));
  const positionProgress = progress === 0
    ? 0
    : NATIVE_DEPTH_EXPONENT_BASE ** (
      (progress - 1) * NATIVE_DEPTH_EXPONENT_RANGE
    );
  return projectBandoriNativeLane(
    centerLane,
    progress,
    positionProgress,
    spawnTimeSeconds,
    presentationTimeSeconds,
  );
}

export function projectBandoriNativeRibbonPoint(
  ribbon: BandoriNativeRibbonVisual,
  pointIndex: number,
  currentBeat: number,
  presentationTimeSeconds: number,
  noteSpeed = BANDORI_NATIVE_NOTE_SPEED_DEFAULT,
  laneOffset = 0,
  approachTimeScale = 1,
): BandoriNativeProjectedRibbonPoint | null {
  if (
    !Number.isInteger(pointIndex)
    || pointIndex < 0
    || pointIndex >= ribbon.points.length
    || !Number.isFinite(currentBeat)
    || !Number.isFinite(presentationTimeSeconds)
    || !Number.isFinite(laneOffset)
  ) {
    return fail("Native ribbon projection received invalid lifecycle inputs");
  }
  const arrivalSeconds = getBandoriSimulatorNoteArrivalSeconds(noteSpeed, approachTimeScale);
  const first = ribbon.points[0];
  const last = ribbon.points.at(-1);
  if (
    !first
    || !last
    || presentationTimeSeconds < first.time - arrivalSeconds
    || presentationTimeSeconds > last.time
  ) {
    return null;
  }

  const point = ribbon.points[pointIndex];
  const next = ribbon.points[pointIndex + 1];
  const spawnTimeSeconds = point.time - arrivalSeconds;
  if (presentationTimeSeconds < spawnTimeSeconds) {
    const lane = point.lane + laneOffset;
    return {
      ...projectBandoriNativeLane(
        lane,
        0,
        0,
        spawnTimeSeconds,
        presentationTimeSeconds,
      ),
      lane,
      phase: "launcher",
    };
  }
  if (presentationTimeSeconds <= point.time) {
    const lane = point.lane + laneOffset;
    const progress = Math.max(0, Math.min(
      1,
      1 - ((point.time - presentationTimeSeconds) / arrivalSeconds),
    ));
    const positionProgress = progress === 0
      ? 0
      : NATIVE_DEPTH_EXPONENT_BASE ** (
        (progress - 1) * NATIVE_DEPTH_EXPONENT_RANGE
      );
    return {
      ...projectBandoriNativeLane(
        lane,
        progress,
        positionProgress,
        spawnTimeSeconds,
        presentationTimeSeconds,
      ),
      lane,
      phase: "move",
    };
  }
  if (!next) return null;
  const beatDuration = next.beat - point.beat;
  const progress = beatDuration === 0
    ? 1
    : Math.max(0, Math.min(1, (currentBeat - point.beat) / beatDuration));
  const lane = point.lane + (next.lane - point.lane) * progress + laneOffset;
  return {
    ...projectBandoriNativeLane(
      lane,
      1,
      1,
      spawnTimeSeconds,
      presentationTimeSeconds,
    ),
    lane,
    phase: "stop",
  };
}

/**
 * Launcher projections keep a future ribbon vertex available to NoteMesh, but
 * the corresponding Note body is not activated until its own move window.
 */
export function isBandoriNativeRibbonPointBodyVisible(
  projected: BandoriNativeProjectedNote | null,
): boolean {
  return projected !== null
    && "phase" in projected
    && projected.phase !== "launcher";
}

export function getBandoriDirectionalFlickIconOffset(
  direction: number,
  projected: BandoriNativeProjectedNote,
  hitTimeSeconds: number,
  presentationTimeSeconds: number,
): { x: number; y: number } {
  if (
    direction !== BANDORI_COMPILED_DIRECTION.left
    && direction !== BANDORI_COMPILED_DIRECTION.right
  ) {
    return fail("Directional flick icon offset requires a left or right direction");
  }
  const elapsedSeconds = Math.max(0, presentationTimeSeconds - projected.spawnTimeSeconds);
  const phaseSeconds = elapsedSeconds % NATIVE_FLICK_ICON_PERIOD_SECONDS;
  const localX = direction === BANDORI_COMPILED_DIRECTION.left
    ? -1.6 - 2.1 * phaseSeconds
    : 1.6 + 2.1 * phaseSeconds;
  if (presentationTimeSeconds > hitTimeSeconds) {
    return fail("Directional flick icon cannot be projected after its hit time");
  }
  return {
    x: localX * projected.worldScale * BANDORI_NATIVE_NOTE_PIXELS_PER_UNIT,
    y: 0,
  };
}
