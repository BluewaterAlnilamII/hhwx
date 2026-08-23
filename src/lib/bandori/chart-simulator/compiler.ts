import {
  parseBandoriChartForSimulator,
  type BandoriChartEntity,
} from "@/lib/bandori-chart-simulator-contract";

export const BANDORI_CHART_SIMULATOR_PAYLOAD_VERSION = 4 as const;

export const BANDORI_COMPILED_NOTE_KIND = {
  single: 1,
  directional: 2,
  longStart: 3,
  longEnd: 4,
  slide: 5,
} as const;

export const BANDORI_COMPILED_NOTE_FLAG = {
  flick: 1 << 0,
  charge: 1 << 1,
  skill: 1 << 2,
  hidden: 1 << 3,
  ribbonStart: 1 << 4,
  ribbonEnd: 1 << 5,
} as const;

export const BANDORI_COMPILED_RIBBON_KIND = {
  long: 1,
  slide: 2,
} as const;

export const BANDORI_COMPILED_DIRECTION = {
  none: 0,
  left: -1,
  right: 1,
} as const;

export const BANDORI_COMPILED_CURVE_POSITION = {
  none: 0,
  front: 1,
  back: 2,
} as const;

export type CompiledBandoriChart = {
  schemaVersion: typeof BANDORI_CHART_SIMULATOR_PAYLOAD_VERSION;
  source: BandoriChartEntity[];
  sourceEntityCount: number;
  chartEndSeconds: number;
  timelineDurationSeconds: number;
  maxCombo: number;
  bpm: {
    beats: Float64Array;
    times: Float64Array;
    values: Float64Array;
  };
  notes: {
    times: Float64Array;
    beats: Float64Array;
    /** Scalar source anchors used for positioning and compatibility. */
    lanes: Float32Array;
    /** Offsets into coverageLanes for the authoritative lanes ?? [lane] coverage. */
    coverageOffsets: Uint32Array;
    coverageLanes: Float32Array;
    widths: Float32Array;
    kinds: Uint8Array;
    directions: Int8Array;
    flags: Uint16Array;
    sourceEntityIndexes: Uint32Array;
    sourceNodeIndexes: Int32Array;
    ribbonIndexes: Int32Array;
  };
  ribbons: {
    kinds: Uint8Array;
    sourceEntityIndexes: Uint32Array;
    startTimes: Float64Array;
    endTimes: Float64Array;
    connectionOffsets: Uint32Array;
    connectionTimes: Float64Array;
    connectionBeats: Float64Array;
    connectionLanes: Float32Array;
    connectionCoverageOffsets: Uint32Array;
    connectionCoverageLanes: Float32Array;
    connectionWidths: Float32Array;
    connectionDirections: Int8Array;
    connectionFlags: Uint16Array;
    curveOffsets: Uint32Array;
    curveTimes: Float64Array;
    curveBeats: Float64Array;
    curveLanes: Float32Array;
    curveWidths: Float32Array;
    curvePositions: Int8Array;
    curveFlags: Uint16Array;
  };
};

export type BandoriChartSeekState = {
  timeSeconds: number;
  combo: number;
  nextNoteIndex: number;
  visibleNoteEndIndex: number;
  activeRibbonIndexes: Uint32Array;
};

type BpmSegment = {
  beat: number;
  bpm: number;
  time: number;
  sourceIndex: number;
};

type CompiledPoint = {
  beat: number;
  time: number;
  lane: number;
  coveredLanes: number[];
  width: number;
  direction: number;
  flags: number;
  sourceIndex: number;
  position: number;
};

type CompiledNote = CompiledPoint & {
  kind: number;
  sourceEntityIndex: number;
  sourceNodeIndex: number;
  ribbonIndex: number;
  sourceOrder: number;
};

type CompiledRibbon = {
  kind: number;
  sourceEntityIndex: number;
  startTime: number;
  endTime: number;
  connections: CompiledPoint[];
  curves: CompiledPoint[];
};

type CurveSequenceNode = {
  kind: "connection" | "control";
  order: number;
  point: CompiledPoint;
};

const BANDORI_BEZIER_TICKS_PER_BEAT = 48;
const BANDORI_BEZIER_SAMPLE_DIVISOR = 200;
const BANDORI_BEZIER_REDUCTION_DEGREES = 2;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }
  return value;
}

function readBeat(value: unknown, path: string): number {
  const beat = readFiniteNumber(value, path);
  if (beat < 0) throw new Error(`${path} must not be negative`);
  return beat;
}

function readWidth(value: unknown, path: string): number {
  if (value === undefined) return 1;
  const width = readFiniteNumber(value, path);
  if (!Number.isInteger(width) || width <= 0 || width > 7) {
    throw new Error(`${path} must be an integer from 1 through 7`);
  }
  return width;
}

function readCoveredLanes(
  value: unknown,
  path: string,
  anchorLane: number,
): number[] {
  if (value === undefined) return [anchorLane];
  if (!Array.isArray(value) || value.length === 0 || value.length > 7) {
    throw new Error(`${path} must be a non-empty array with at most seven lanes`);
  }

  const lanes = value.map((lane, index) => {
    const laneNumber = readFiniteNumber(lane, `${path}[${index}]`);
    if (!Number.isInteger(laneNumber) || laneNumber < 0 || laneNumber > 6) {
      throw new Error(`${path}[${index}] must be an integer from 0 through 6`);
    }
    return laneNumber;
  });
  for (let index = 1; index < lanes.length; index += 1) {
    if (lanes[index] !== lanes[index - 1] + 1) {
      throw new Error(`${path} must contain one contiguous ascending lane range`);
    }
  }
  const expectedAnchor = lanes[Math.floor((lanes.length - 1) / 2)];
  if (anchorLane !== expectedAnchor) {
    throw new Error(`${path} does not match its scalar lane anchor`);
  }
  return lanes;
}

function readDirection(value: unknown, path: string): number {
  if (value === undefined) return BANDORI_COMPILED_DIRECTION.none;
  if (value === "Left") return BANDORI_COMPILED_DIRECTION.left;
  if (value === "Right") return BANDORI_COMPILED_DIRECTION.right;
  throw new Error(`${path} must be Left or Right`);
}

function readCurvePosition(value: unknown, path: string): number {
  if (value === undefined) return BANDORI_COMPILED_CURVE_POSITION.none;
  if (value === "Front") return BANDORI_COMPILED_CURVE_POSITION.front;
  if (value === "Back") return BANDORI_COMPILED_CURVE_POSITION.back;
  throw new Error(`${path} must be Front or Back`);
}

function readFlags(value: Record<string, unknown>): number {
  let flags = 0;
  if (Object.hasOwn(value, "flick")) flags |= BANDORI_COMPILED_NOTE_FLAG.flick;
  if (Object.hasOwn(value, "charge")) flags |= BANDORI_COMPILED_NOTE_FLAG.charge;
  if (Object.hasOwn(value, "skill")) flags |= BANDORI_COMPILED_NOTE_FLAG.skill;
  if (Object.hasOwn(value, "hidden")) flags |= BANDORI_COMPILED_NOTE_FLAG.hidden;
  return flags;
}

function cloneLosslessSource(chart: readonly BandoriChartEntity[]): BandoriChartEntity[] {
  return structuredClone(chart) as BandoriChartEntity[];
}

function buildBpmSegments(chart: readonly BandoriChartEntity[]): BpmSegment[] {
  const bpms = chart.flatMap((entity, sourceIndex) => {
    if (entity.type !== "BPM") return [];
    const beat = readBeat(entity.beat, `chart[${sourceIndex}].beat`);
    const bpm = readFiniteNumber(entity.bpm, `chart[${sourceIndex}].bpm`);
    if (bpm <= 0) throw new Error(`chart[${sourceIndex}].bpm must be greater than 0`);
    return [{ beat, bpm, sourceIndex }];
  }).sort((left, right) => left.beat - right.beat || left.sourceIndex - right.sourceIndex);

  if (bpms.length === 0 || bpms[0].beat !== 0) {
    throw new Error("Bandori chart must declare a BPM at beat 0");
  }

  const segments: BpmSegment[] = [];
  for (const bpm of bpms) {
    const previous = segments.at(-1);
    if (previous?.beat === bpm.beat) {
      segments[segments.length - 1] = { ...bpm, time: previous.time };
      continue;
    }
    const time = previous
      ? previous.time + ((bpm.beat - previous.beat) * 60) / previous.bpm
      : 0;
    segments.push({ ...bpm, time });
  }
  return segments;
}

function findLastAtOrBefore(values: ArrayLike<number>, target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle] <= target) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

export function upperBound(values: ArrayLike<number>, target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle] <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function beatToTime(segments: readonly BpmSegment[], beat: number): number {
  const index = findLastAtOrBefore(segments.map((segment) => segment.beat), beat);
  if (index < 0) throw new Error(`No BPM is active at beat ${beat}`);
  const segment = segments[index];
  return segment.time + ((beat - segment.beat) * 60) / segment.bpm;
}

export function getBandoriCompiledBeatAtTime(
  compiled: Pick<CompiledBandoriChart, "bpm">,
  timeSeconds: number,
): number {
  if (!Number.isFinite(timeSeconds)) {
    throw new Error("Bandori chart time must be finite");
  }
  const index = findLastAtOrBefore(compiled.bpm.times, Math.max(0, timeSeconds));
  if (index < 0) throw new Error("Bandori chart has no BPM at the requested time");
  return compiled.bpm.beats[index]
    + ((Math.max(0, timeSeconds) - compiled.bpm.times[index]) * compiled.bpm.values[index]) / 60;
}

export function getBandoriCompiledLaneSpan(
  lane: number,
  width: number,
  direction: number,
): { leftLane: number; rightLane: number } {
  if (!Number.isFinite(lane) || !Number.isFinite(width) || width <= 0) {
    throw new Error("Bandori lane span requires a finite lane and positive width");
  }
  if (
    direction !== BANDORI_COMPILED_DIRECTION.none
    && direction !== BANDORI_COMPILED_DIRECTION.left
    && direction !== BANDORI_COMPILED_DIRECTION.right
  ) {
    throw new Error("Bandori lane span has an unsupported direction");
  }
  const leftLane = direction === BANDORI_COMPILED_DIRECTION.left
    ? lane - width + 1
    : lane;
  return { leftLane, rightLane: leftLane + width };
}

function compilePoint(
  rawPoint: unknown,
  path: string,
  sourceIndex: number,
  segments: readonly BpmSegment[],
  isCurve: boolean,
  allowFractionalHiddenLane = false,
): CompiledPoint {
  if (!isRecord(rawPoint)) throw new Error(`${path} must be an object`);
  const beat = readBeat(rawPoint.beat, `${path}.beat`);
  const lane = readFiniteNumber(rawPoint.lane, `${path}.lane`);
  const isIntegerNativeLane = Number.isInteger(lane) && lane >= 0 && lane <= 6;
  const isAdmittedFractionalHiddenLane = allowFractionalHiddenLane
    && Object.hasOwn(rawPoint, "hidden")
    && !Number.isInteger(lane)
    && getBandoriNativeCurveLaneAnchor(lane) !== null;
  if (!isIntegerNativeLane && !isAdmittedFractionalHiddenLane) {
    throw new Error(`${path}.lane must be an integer from 0 through 6`);
  }
  if (Object.hasOwn(rawPoint, "multiRangeWidth")) {
    throw new Error(`${path}.multiRangeWidth is an obsolete pre-v7 field`);
  }
  return {
    beat,
    time: beatToTime(segments, beat),
    lane,
    coveredLanes: readCoveredLanes(rawPoint.lanes, `${path}.lanes`, lane),
    width: readWidth(rawPoint.width, `${path}.width`),
    direction: readDirection(rawPoint.direction, `${path}.direction`),
    flags: readFlags(rawPoint),
    sourceIndex,
    position: isCurve
      ? readCurvePosition(rawPoint.position, `${path}.position`)
      : BANDORI_COMPILED_CURVE_POSITION.none,
  };
}

function validateChronologicalPoints(points: readonly CompiledPoint[], path: string): void {
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].beat < points[index - 1].beat) {
      throw new Error(`${path} must be ordered by beat`);
    }
  }
}

function curveSequenceRank(point: CompiledPoint, kind: CurveSequenceNode["kind"]): number {
  if (kind === "connection") return 1;
  return point.position === BANDORI_COMPILED_CURVE_POSITION.front ? 0 : 2;
}

function toBezierTick(beat: number): number {
  return Math.round(Math.fround(beat * BANDORI_BEZIER_TICKS_PER_BEAT));
}

function quadraticBezierFloat32(start: number, control: number, end: number, t: number): number {
  const first = Math.fround(start + Math.fround(t * Math.fround(control - start)));
  const second = Math.fround(control + Math.fround(t * Math.fround(end - control)));
  return Math.fround(first + Math.fround(t * Math.fround(second - first)));
}

function roundMidpointToEven(value: number): number {
  const lower = Math.floor(value);
  const fraction = value - lower;
  if (fraction < 0.5) return lower;
  if (fraction > 0.5) return lower + 1;
  return lower % 2 === 0 ? lower : lower + 1;
}

/** Resolves a continuous lane + DiffVolume position to its native scalar lane. */
export function getBandoriNativeCurveLaneAnchor(laneAbsolutePosition: number): number | null {
  if (!Number.isFinite(laneAbsolutePosition)) return null;
  const roundedLane = roundMidpointToEven(laneAbsolutePosition);
  return roundedLane >= 0 && roundedLane <= 6 ? roundedLane : null;
}

function quantizeBezierLane(laneAbsolutePosition: number, path: string): {
  diffVolume: number;
  lane: number;
  roundedLane: number;
} {
  const roundedLane = getBandoriNativeCurveLaneAnchor(laneAbsolutePosition);
  if (roundedLane === null) {
    throw new Error(`${path} leaves the seven native lanes`);
  }
  const diffVolume = Math.trunc(Math.fround(
    Math.fround(laneAbsolutePosition - roundedLane) * 100,
  ));
  return {
    diffVolume,
    lane: roundedLane + diffVolume / 100,
    roundedLane,
  };
}

function simplifyBezierPoints<T extends { diffVolume: number; tick: number }>(
  points: readonly T[],
): T[] {
  if (points.length < 3) return [...points];
  const removed = new Set<number>();
  let consecutiveRemoved = 0;
  for (let middleIndex = 1; middleIndex < points.length - 1; middleIndex += 1) {
    const previousIndex = middleIndex - consecutiveRemoved - 1;
    const previous = points[previousIndex];
    const middle = points[middleIndex];
    const next = points[middleIndex + 1];
    const isFlat = previous.diffVolume === middle.diffVolume
      && middle.diffVolume === next.diffVolume;
    const previousAngle = Math.atan2(
      middle.diffVolume - previous.diffVolume,
      middle.tick - previous.tick,
    ) * (180 / Math.PI);
    const nextAngle = Math.atan2(
      next.diffVolume - middle.diffVolume,
      next.tick - middle.tick,
    ) * (180 / Math.PI);
    if (isFlat || Math.abs(previousAngle - nextAngle) < BANDORI_BEZIER_REDUCTION_DEGREES) {
      removed.add(middleIndex);
      consecutiveRemoved += 1;
    } else {
      consecutiveRemoved = 0;
    }
  }
  return points.filter((_, index) => !removed.has(index));
}

/**
 * Mirrors MusicScoreBezierConverter: curve controls are consumed into hidden,
 * quantized Slide nodes before any runtime note or mesh is created.
 */
function expandOrdinaryBezierSlide(
  connections: readonly CompiledPoint[],
  curves: readonly CompiledPoint[],
  segments: readonly BpmSegment[],
  path: string,
): CompiledPoint[] {
  if (curves.length === 0) return [...connections];
  const sequence: CurveSequenceNode[] = [
    ...connections.map((point, order) => ({ kind: "connection" as const, order, point })),
    ...curves.map((point, order) => ({ kind: "control" as const, order, point })),
  ].sort((left, right) => (
    left.point.beat - right.point.beat
    || curveSequenceRank(left.point, left.kind) - curveSequenceRank(right.point, right.kind)
    || left.order - right.order
  ));

  const consumedControls = new Set<number>();
  const samples: Array<{
    laneAbsolutePosition: number;
    sourceIndex: number;
    tick: number;
  }> = [];
  for (let index = 1; index < sequence.length - 1; index += 1) {
    const start = sequence[index - 1];
    const control = sequence[index];
    const end = sequence[index + 1];
    if (
      start.kind !== "connection"
      || control.kind !== "control"
      || end.kind !== "connection"
    ) {
      continue;
    }
    consumedControls.add(control.order);
    const startTick = toBezierTick(start.point.beat);
    const controlTick = toBezierTick(control.point.beat);
    const endTick = toBezierTick(end.point.beat);
    for (let sampleIndex = 1; sampleIndex < BANDORI_BEZIER_SAMPLE_DIVISOR; sampleIndex += 1) {
      const t = Math.fround(sampleIndex / BANDORI_BEZIER_SAMPLE_DIVISOR);
      const tick = Math.round(quadraticBezierFloat32(startTick, controlTick, endTick, t));
      if (tick === startTick || tick === endTick) continue;
      samples.push({
        laneAbsolutePosition: quadraticBezierFloat32(
          start.point.lane,
          control.point.lane,
          end.point.lane,
          t,
        ),
        sourceIndex: control.point.sourceIndex,
        tick,
      });
    }
  }
  if (consumedControls.size !== curves.length) {
    throw new Error(`${path}.curveControls do not form native connection-control-connection triples`);
  }

  const samplesByTick = new Map<number, typeof samples>();
  for (const sample of samples) {
    const group = samplesByTick.get(sample.tick) ?? [];
    group.push(sample);
    samplesByTick.set(sample.tick, group);
  }
  const merged = [...samplesByTick.entries()].map(([tick, group]) => {
    const laneSum = group.reduce(
      (sum, sample) => Math.fround(sum + sample.laneAbsolutePosition),
      0,
    );
    const laneAbsolutePosition = Math.fround(laneSum / group.length);
    return {
      ...quantizeBezierLane(laneAbsolutePosition, path),
      laneAbsolutePosition,
      sourceIndex: group[0].sourceIndex,
      tick,
    };
  }).sort((left, right) => left.tick - right.tick);

  const generated = simplifyBezierPoints(merged).map((point): CompiledPoint => {
    const beat = point.tick / BANDORI_BEZIER_TICKS_PER_BEAT;
    return {
      beat,
      coveredLanes: [point.roundedLane],
      direction: BANDORI_COMPILED_DIRECTION.none,
      flags: BANDORI_COMPILED_NOTE_FLAG.hidden,
      lane: point.lane,
      position: BANDORI_COMPILED_CURVE_POSITION.none,
      sourceIndex: point.sourceIndex,
      time: beatToTime(segments, beat),
      width: 1,
    };
  });

  return [...connections, ...generated].sort((left, right) => {
    const beatDifference = left.beat - right.beat;
    if (beatDifference !== 0) return beatDifference;
    return Number((left.flags & BANDORI_COMPILED_NOTE_FLAG.hidden) !== 0)
      - Number((right.flags & BANDORI_COMPILED_NOTE_FLAG.hidden) !== 0);
  });
}

function appendNote(
  notes: CompiledNote[],
  point: CompiledPoint,
  options: {
    kind: number;
    direction: number;
    sourceEntityIndex: number;
    sourceNodeIndex: number;
    ribbonIndex: number;
    flags?: number;
  },
): void {
  const span = getBandoriCompiledLaneSpan(point.lane, point.width, options.direction);
  if (span.leftLane < 0 || span.rightLane > 7) {
    throw new Error(`chart[${options.sourceEntityIndex}] lane span must stay within seven lanes`);
  }
  notes.push({
    ...point,
    kind: options.kind,
    direction: options.direction,
    flags: point.flags | (options.flags ?? 0),
    sourceEntityIndex: options.sourceEntityIndex,
    sourceNodeIndex: options.sourceNodeIndex,
    ribbonIndex: options.ribbonIndex,
    sourceOrder: notes.length,
  });
}

export function compileBandoriChart(
  value: unknown,
  options: { mediaDurationSeconds?: number } = {},
): CompiledBandoriChart {
  const chart = parseBandoriChartForSimulator(value);
  const source = cloneLosslessSource(chart);
  const segments = buildBpmSegments(chart);
  const notes: CompiledNote[] = [];
  const ribbons: CompiledRibbon[] = [];

  chart.forEach((entity, entityIndex) => {
    if (entity.type === "BPM" || entity.type === "Meta") return;
    if (entity.type === "System") {
      readBeat(entity.beat, `chart[${entityIndex}].beat`);
      if (typeof entity.data !== "string" || !entity.data) {
        throw new Error(`chart[${entityIndex}].data must be a non-empty string`);
      }
      return;
    }

    if (entity.type === "Single" || entity.type === "Directional") {
      const point = compilePoint(entity, `chart[${entityIndex}]`, 0, segments, false);
      appendNote(notes, point, {
        kind: entity.type === "Single"
          ? BANDORI_COMPILED_NOTE_KIND.single
          : BANDORI_COMPILED_NOTE_KIND.directional,
        direction: entity.type === "Directional"
          ? point.direction
          : BANDORI_COMPILED_DIRECTION.none,
        sourceEntityIndex: entityIndex,
        sourceNodeIndex: -1,
        ribbonIndex: -1,
      });
      return;
    }

    if (entity.type !== "Long" && entity.type !== "Slide") {
      throw new Error(`chart[${entityIndex}] has unsupported entity type: ${entity.type}`);
    }

    if (!Array.isArray(entity.connections) || entity.connections.length === 0) {
      throw new Error(`chart[${entityIndex}].connections is incomplete`);
    }
    if (entity.type === "Slide" && entity.connections.length === 1) {
      if (entity.curveControls !== undefined && (
        !Array.isArray(entity.curveControls)
        || entity.curveControls.length !== 0
      )) {
        throw new Error(`chart[${entityIndex}] single-connection Slide cannot contain curve controls`);
      }
      // One published JP chart contains an orphan Slide that still contributes
      // one Combo. With no second point there is no ribbon geometry to invent,
      // so retain its only scoring point as an ordinary point-note entity.
      const point = compilePoint(
        entity.connections[0],
        `chart[${entityIndex}].connections[0]`,
        0,
        segments,
        false,
      );
      appendNote(notes, point, {
        kind: point.direction === BANDORI_COMPILED_DIRECTION.none
          ? BANDORI_COMPILED_NOTE_KIND.single
          : BANDORI_COMPILED_NOTE_KIND.directional,
        direction: point.direction,
        sourceEntityIndex: entityIndex,
        sourceNodeIndex: 0,
        ribbonIndex: -1,
      });
      return;
    }
    if (entity.connections.length < 2) {
      throw new Error(`chart[${entityIndex}].connections is incomplete`);
    }
    const sourceConnectionCount = entity.connections.length;
    const sourceConnections = entity.connections.map((point, pointIndex) => compilePoint(
      point,
      `chart[${entityIndex}].connections[${pointIndex}]`,
      pointIndex,
      segments,
      false,
      // Published charts can already contain MusicScoreBezierConverter output.
      // Only hidden, non-endpoint Slide samples may retain their fractional DiffVolume lane.
      entity.type === "Slide"
        && pointIndex > 0
        && pointIndex < sourceConnectionCount - 1,
    ));
    validateChronologicalPoints(sourceConnections, `chart[${entityIndex}].connections`);
    if (entity.curveControls !== undefined && !Array.isArray(entity.curveControls)) {
      throw new Error(`chart[${entityIndex}].curveControls must be an array`);
    }
    const sourceCurves = (Array.isArray(entity.curveControls) ? entity.curveControls : []).map(
      (point, pointIndex) => compilePoint(
        point,
        `chart[${entityIndex}].curveControls[${pointIndex}]`,
        pointIndex,
        segments,
        true,
      ),
    );
    validateChronologicalPoints(sourceCurves, `chart[${entityIndex}].curveControls`);

    if (entity.type === "Long") {
      if (sourceConnections.length !== 2) {
        throw new Error(`chart[${entityIndex}] Long must contain exactly two native endpoints`);
      }
      if (sourceConnections[0].lane !== sourceConnections[1].lane) {
        throw new Error(`chart[${entityIndex}] Long endpoints must stay on the same native lane`);
      }
      if (sourceCurves.length !== 0) {
        throw new Error(`chart[${entityIndex}] Long cannot contain native curve controls`);
      }
    }

    const canExpandOrdinarySlide = entity.type === "Slide"
      && sourceConnections.every((point) => point.coveredLanes.length === 1)
      && sourceCurves.every((point) => point.coveredLanes.length === 1 && point.width === 1);
    const connections = canExpandOrdinarySlide
      ? expandOrdinaryBezierSlide(
        sourceConnections,
        sourceCurves,
        segments,
        `chart[${entityIndex}]`,
      )
      : sourceConnections;
    const curves = canExpandOrdinarySlide ? [] : sourceCurves;

    const ribbonIndex = ribbons.length;
    ribbons.push({
      kind: entity.type === "Long"
        ? BANDORI_COMPILED_RIBBON_KIND.long
        : BANDORI_COMPILED_RIBBON_KIND.slide,
      sourceEntityIndex: entityIndex,
      startTime: connections[0].time,
      endTime: connections.at(-1)?.time ?? connections[0].time,
      connections,
      curves,
    });

    if (entity.type === "Long") {
      appendNote(notes, connections[0], {
        kind: BANDORI_COMPILED_NOTE_KIND.longStart,
        direction: BANDORI_COMPILED_DIRECTION.none,
        sourceEntityIndex: entityIndex,
        sourceNodeIndex: 0,
        ribbonIndex,
        flags: BANDORI_COMPILED_NOTE_FLAG.ribbonStart,
      });
      const lastIndex = connections.length - 1;
      appendNote(notes, connections[lastIndex], {
        kind: BANDORI_COMPILED_NOTE_KIND.longEnd,
        direction: connections[lastIndex].direction,
        sourceEntityIndex: entityIndex,
        sourceNodeIndex: lastIndex,
        ribbonIndex,
        flags: BANDORI_COMPILED_NOTE_FLAG.ribbonEnd,
      });
      return;
    }

    connections.forEach((point, pointIndex) => {
      const isHiddenMiddle = pointIndex > 0
        && pointIndex < connections.length - 1
        && (point.flags & BANDORI_COMPILED_NOTE_FLAG.hidden) !== 0;
      if (isHiddenMiddle) return;
      appendNote(notes, point, {
        kind: BANDORI_COMPILED_NOTE_KIND.slide,
        direction: point.direction,
        sourceEntityIndex: entityIndex,
        sourceNodeIndex: pointIndex,
        ribbonIndex,
        flags: (pointIndex === 0 ? BANDORI_COMPILED_NOTE_FLAG.ribbonStart : 0)
          | (pointIndex === connections.length - 1 ? BANDORI_COMPILED_NOTE_FLAG.ribbonEnd : 0),
      });
    });
  });

  notes.sort((left, right) => left.time - right.time || left.sourceOrder - right.sourceOrder);
  const chartEndSeconds = Math.max(
    notes.at(-1)?.time ?? 0,
    ...ribbons.map((ribbon) => ribbon.endTime),
  );
  const mediaDurationSeconds = options.mediaDurationSeconds ?? 0;
  if (!Number.isFinite(mediaDurationSeconds) || mediaDurationSeconds < 0) {
    throw new Error("mediaDurationSeconds must be a non-negative finite number");
  }

  const connectionOffsets = [0];
  const connectionCoverageOffsets = [0];
  const connectionCoverageLanes: number[] = [];
  const curveOffsets = [0];
  const noteCoverageOffsets = [0];
  const noteCoverageLanes: number[] = [];
  const allConnections: CompiledPoint[] = [];
  const allCurves: CompiledPoint[] = [];
  for (const note of notes) {
    noteCoverageLanes.push(...note.coveredLanes);
    noteCoverageOffsets.push(noteCoverageLanes.length);
  }
  for (const ribbon of ribbons) {
    allConnections.push(...ribbon.connections);
    for (const connection of ribbon.connections) {
      connectionCoverageLanes.push(...connection.coveredLanes);
      connectionCoverageOffsets.push(connectionCoverageLanes.length);
    }
    allCurves.push(...ribbon.curves);
    connectionOffsets.push(allConnections.length);
    curveOffsets.push(allCurves.length);
  }

  return {
    schemaVersion: BANDORI_CHART_SIMULATOR_PAYLOAD_VERSION,
    source,
    sourceEntityCount: source.length,
    chartEndSeconds,
    timelineDurationSeconds: Math.max(chartEndSeconds, mediaDurationSeconds),
    maxCombo: notes.length,
    bpm: {
      beats: Float64Array.from(segments.map((segment) => segment.beat)),
      times: Float64Array.from(segments.map((segment) => segment.time)),
      values: Float64Array.from(segments.map((segment) => segment.bpm)),
    },
    notes: {
      times: Float64Array.from(notes.map((note) => note.time)),
      beats: Float64Array.from(notes.map((note) => note.beat)),
      lanes: Float32Array.from(notes.map((note) => note.lane)),
      coverageOffsets: Uint32Array.from(noteCoverageOffsets),
      coverageLanes: Float32Array.from(noteCoverageLanes),
      widths: Float32Array.from(notes.map((note) => note.width)),
      kinds: Uint8Array.from(notes.map((note) => note.kind)),
      directions: Int8Array.from(notes.map((note) => note.direction)),
      flags: Uint16Array.from(notes.map((note) => note.flags)),
      sourceEntityIndexes: Uint32Array.from(notes.map((note) => note.sourceEntityIndex)),
      sourceNodeIndexes: Int32Array.from(notes.map((note) => note.sourceNodeIndex)),
      ribbonIndexes: Int32Array.from(notes.map((note) => note.ribbonIndex)),
    },
    ribbons: {
      kinds: Uint8Array.from(ribbons.map((ribbon) => ribbon.kind)),
      sourceEntityIndexes: Uint32Array.from(ribbons.map((ribbon) => ribbon.sourceEntityIndex)),
      startTimes: Float64Array.from(ribbons.map((ribbon) => ribbon.startTime)),
      endTimes: Float64Array.from(ribbons.map((ribbon) => ribbon.endTime)),
      connectionOffsets: Uint32Array.from(connectionOffsets),
      connectionTimes: Float64Array.from(allConnections.map((point) => point.time)),
      connectionBeats: Float64Array.from(allConnections.map((point) => point.beat)),
      connectionLanes: Float32Array.from(allConnections.map((point) => point.lane)),
      connectionCoverageOffsets: Uint32Array.from(connectionCoverageOffsets),
      connectionCoverageLanes: Float32Array.from(connectionCoverageLanes),
      connectionWidths: Float32Array.from(allConnections.map((point) => point.width)),
      connectionDirections: Int8Array.from(allConnections.map((point) => point.direction)),
      connectionFlags: Uint16Array.from(allConnections.map((point) => point.flags)),
      curveOffsets: Uint32Array.from(curveOffsets),
      curveTimes: Float64Array.from(allCurves.map((point) => point.time)),
      curveBeats: Float64Array.from(allCurves.map((point) => point.beat)),
      curveLanes: Float32Array.from(allCurves.map((point) => point.lane)),
      curveWidths: Float32Array.from(allCurves.map((point) => point.width)),
      curvePositions: Int8Array.from(allCurves.map((point) => point.position)),
      curveFlags: Uint16Array.from(allCurves.map((point) => point.flags)),
    },
  };
}

export function rebuildBandoriChartState(
  compiled: CompiledBandoriChart,
  requestedTimeSeconds: number,
  visibleFutureSeconds: number,
): BandoriChartSeekState {
  if (
    !Number.isFinite(requestedTimeSeconds)
    || !Number.isFinite(visibleFutureSeconds)
    || visibleFutureSeconds < 0
  ) {
    throw new Error("Chart seek inputs must be finite and the visible window non-negative");
  }
  const timeSeconds = Math.max(0, Math.min(compiled.timelineDurationSeconds, requestedTimeSeconds));
  const nextNoteIndex = upperBound(compiled.notes.times, timeSeconds);
  const activeRibbons: number[] = [];
  for (let index = 0; index < compiled.ribbons.kinds.length; index += 1) {
    if (
      compiled.ribbons.startTimes[index] <= timeSeconds
      && compiled.ribbons.endTimes[index] > timeSeconds
    ) {
      activeRibbons.push(index);
    }
  }
  return {
    timeSeconds,
    combo: nextNoteIndex,
    nextNoteIndex,
    visibleNoteEndIndex: upperBound(
      compiled.notes.times,
      Math.min(compiled.timelineDurationSeconds, timeSeconds + visibleFutureSeconds),
    ),
    activeRibbonIndexes: Uint32Array.from(activeRibbons),
  };
}

export function collectCompiledBandoriChartTransferables(
  compiled: CompiledBandoriChart,
): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  const visit = (value: unknown): void => {
    if (ArrayBuffer.isView(value)) {
      buffers.add(value.buffer as ArrayBuffer);
      return;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    Object.values(value).forEach(visit);
  };
  visit(compiled);
  return [...buffers];
}
