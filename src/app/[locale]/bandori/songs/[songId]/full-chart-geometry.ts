import {
  BANDORI_COMPILED_DIRECTION,
  getBandoriCompiledLaneSpan,
  type CompiledBandoriChart,
} from "@/lib/bandori/chart-simulator/compiler";
import { mirrorBandoriChartPoint } from "./native-stage-contract";

export const BANDORI_FULL_CHART_LANE_COUNT = 7;

const DEFAULT_SEGMENT_SECONDS = 8;
const DEFAULT_SEGMENT_WIDTH = 168;
const DEFAULT_CANVAS_HEIGHT = 640;
const DEFAULT_HORIZONTAL_PADDING = 14;
const DEFAULT_TOP_PADDING = 34;
const DEFAULT_BOTTOM_PADDING = 18;

export type BandoriFullChartSegment = {
  index: number;
  startTime: number;
  endTime: number;
  x: number;
  width: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
};

export type BandoriFullChartProjectedPoint = {
  time: number;
  lane: number;
  width: number;
  flags: number;
  segmentIndex: number;
  x: number;
  y: number;
  leftX: number;
  rightX: number;
};

export type BandoriFullChartNoteGeometry = BandoriFullChartProjectedPoint & {
  noteIndex: number;
  kind: number;
  direction: number;
};

export type BandoriFullChartRibbonGeometry = {
  ribbonIndex: number;
  kind: number;
  segments: Array<{
    segmentIndex: number;
    points: BandoriFullChartProjectedPoint[];
  }>;
  curvePoints: Array<BandoriFullChartProjectedPoint & { position: number }>;
};

export type BandoriFullChartGeometry = {
  durationSeconds: number;
  canvasWidth: number;
  canvasHeight: number;
  segments: BandoriFullChartSegment[];
  notes: BandoriFullChartNoteGeometry[];
  ribbons: BandoriFullChartRibbonGeometry[];
  bpmMarkers: Array<{
    bpmIndex: number;
    beat: number;
    value: number;
    point: BandoriFullChartProjectedPoint;
  }>;
};

type RawPoint = {
  time: number;
  lane: number;
  projectedLane: number;
  width: number;
  flags: number;
};

function rawPoint(
  time: number,
  lane: number,
  width: number,
  flags: number,
  direction: number = BANDORI_COMPILED_DIRECTION.none,
  isMirrored = false,
): RawPoint {
  const span = getBandoriCompiledLaneSpan(lane, width, direction);
  if (!isMirrored) {
    return { time, lane, projectedLane: span.leftLane, width, flags };
  }
  const mirrored = mirrorBandoriChartPoint(lane, width, direction);
  return {
    time,
    lane: mirrored.lane,
    projectedLane: mirrored.leftLane,
    width,
    flags,
  };
}

function buildSegments(durationSeconds: number): BandoriFullChartSegment[] {
  const segmentCount = Math.max(1, Math.ceil(durationSeconds / DEFAULT_SEGMENT_SECONDS));
  return Array.from({ length: segmentCount }, (_, index) => ({
    index,
    startTime: index * DEFAULT_SEGMENT_SECONDS,
    endTime: Math.min(durationSeconds, (index + 1) * DEFAULT_SEGMENT_SECONDS),
    x: index * DEFAULT_SEGMENT_WIDTH,
    width: DEFAULT_SEGMENT_WIDTH,
    plotLeft: index * DEFAULT_SEGMENT_WIDTH + DEFAULT_HORIZONTAL_PADDING,
    plotRight: (index + 1) * DEFAULT_SEGMENT_WIDTH - DEFAULT_HORIZONTAL_PADDING,
    plotTop: DEFAULT_TOP_PADDING,
    plotBottom: DEFAULT_CANVAS_HEIGHT - DEFAULT_BOTTOM_PADDING,
  }));
}

function segmentIndexFor(
  time: number,
  durationSeconds: number,
  segmentCount: number,
): number {
  if (time >= durationSeconds) return segmentCount - 1;
  return Math.max(0, Math.min(segmentCount - 1, Math.floor(time / DEFAULT_SEGMENT_SECONDS)));
}

function projectInSegment(
  point: RawPoint,
  segment: BandoriFullChartSegment,
): BandoriFullChartProjectedPoint {
  const plotWidth = segment.plotRight - segment.plotLeft;
  const localTime = Math.max(
    0,
    Math.min(DEFAULT_SEGMENT_SECONDS, point.time - segment.startTime),
  );
  const leftX = segment.plotLeft
    + (point.projectedLane / BANDORI_FULL_CHART_LANE_COUNT) * plotWidth;
  const rightX = segment.plotLeft
    + ((point.projectedLane + point.width) / BANDORI_FULL_CHART_LANE_COUNT) * plotWidth;
  return {
    time: point.time,
    lane: point.lane,
    width: point.width,
    flags: point.flags,
    segmentIndex: segment.index,
    x: (leftX + rightX) / 2,
    y: segment.plotBottom
      - (localTime / DEFAULT_SEGMENT_SECONDS) * (segment.plotBottom - segment.plotTop),
    leftX,
    rightX,
  };
}

function project(
  point: RawPoint,
  segments: readonly BandoriFullChartSegment[],
  durationSeconds: number,
): BandoriFullChartProjectedPoint {
  return projectInSegment(
    point,
    segments[segmentIndexFor(point.time, durationSeconds, segments.length)],
  );
}

function interpolate(start: RawPoint, end: RawPoint, time: number): RawPoint {
  const duration = end.time - start.time;
  const progress = duration === 0 ? 0 : (time - start.time) / duration;
  return {
    time,
    lane: start.lane + (end.lane - start.lane) * progress,
    projectedLane: start.projectedLane
      + (end.projectedLane - start.projectedLane) * progress,
    width: start.width + (end.width - start.width) * progress,
    flags: 0,
  };
}

function appendUnique(
  points: BandoriFullChartProjectedPoint[],
  point: BandoriFullChartProjectedPoint,
): void {
  const previous = points.at(-1);
  if (
    previous?.time !== point.time
    || previous.lane !== point.lane
    || previous.width !== point.width
  ) {
    points.push(point);
  }
}

function splitConnections(
  rawPoints: readonly RawPoint[],
  segments: readonly BandoriFullChartSegment[],
  durationSeconds: number,
): BandoriFullChartRibbonGeometry["segments"] {
  if (rawPoints.length === 0) return [];
  if (rawPoints.length === 1) {
    const point = project(rawPoints[0], segments, durationSeconds);
    return [{ segmentIndex: point.segmentIndex, points: [point] }];
  }

  const pointsBySegment = new Map<number, BandoriFullChartProjectedPoint[]>();
  for (let index = 1; index < rawPoints.length; index += 1) {
    const start = rawPoints[index - 1];
    const end = rawPoints[index];
    const first = segmentIndexFor(start.time, durationSeconds, segments.length);
    const last = segmentIndexFor(end.time, durationSeconds, segments.length);
    for (let segmentIndex = first; segmentIndex <= last; segmentIndex += 1) {
      const segment = segments[segmentIndex];
      const startTime = Math.max(start.time, segment.startTime);
      const endTime = Math.min(end.time, segment.endTime);
      if (endTime < startTime) continue;
      const points = pointsBySegment.get(segmentIndex) ?? [];
      appendUnique(points, projectInSegment(interpolate(start, end, startTime), segment));
      appendUnique(points, projectInSegment(interpolate(start, end, endTime), segment));
      pointsBySegment.set(segmentIndex, points);
    }
  }
  return [...pointsBySegment.entries()]
    .sort(([left], [right]) => left - right)
    .map(([segmentIndex, points]) => ({ segmentIndex, points }));
}

/**
 * Projects the complete chart into an analysis-only layout. These dimensions
 * are product UI choices and are deliberately unrelated to native live-stage
 * projection or effect parameters.
 */
export function buildBandoriFullChartGeometry(
  compiled: CompiledBandoriChart,
  options: { isMirrored?: boolean } = {},
): BandoriFullChartGeometry {
  const isMirrored = options.isMirrored === true;
  const durationSeconds = Math.max(
    Number.EPSILON,
    compiled.timelineDurationSeconds,
    compiled.chartEndSeconds,
  );
  const segments = buildSegments(durationSeconds);
  const notes: BandoriFullChartNoteGeometry[] = [];
  for (let index = 0; index < compiled.notes.times.length; index += 1) {
    notes.push({
      ...project(rawPoint(
        compiled.notes.times[index],
        compiled.notes.lanes[index],
        compiled.notes.widths[index],
        compiled.notes.flags[index],
        compiled.notes.directions[index],
        isMirrored,
      ), segments, durationSeconds),
      noteIndex: index,
      kind: compiled.notes.kinds[index],
      direction: isMirrored
        ? -compiled.notes.directions[index]
        : compiled.notes.directions[index],
    });
  }

  const ribbons: BandoriFullChartRibbonGeometry[] = [];
  for (let ribbonIndex = 0; ribbonIndex < compiled.ribbons.kinds.length; ribbonIndex += 1) {
    const connectionStart = compiled.ribbons.connectionOffsets[ribbonIndex];
    const connectionEnd = compiled.ribbons.connectionOffsets[ribbonIndex + 1];
    const connections: RawPoint[] = [];
    for (let index = connectionStart; index < connectionEnd; index += 1) {
      connections.push(rawPoint(
        compiled.ribbons.connectionTimes[index],
        compiled.ribbons.connectionLanes[index],
        compiled.ribbons.connectionWidths[index],
        compiled.ribbons.connectionFlags[index],
        compiled.ribbons.connectionDirections[index],
        isMirrored,
      ));
    }
    const curveStart = compiled.ribbons.curveOffsets[ribbonIndex];
    const curveEnd = compiled.ribbons.curveOffsets[ribbonIndex + 1];
    const curvePoints: BandoriFullChartRibbonGeometry["curvePoints"] = [];
    for (let index = curveStart; index < curveEnd; index += 1) {
      curvePoints.push({
        ...project(rawPoint(
          compiled.ribbons.curveTimes[index],
          compiled.ribbons.curveLanes[index],
          compiled.ribbons.curveWidths[index],
          compiled.ribbons.curveFlags[index],
          BANDORI_COMPILED_DIRECTION.none,
          isMirrored,
        ), segments, durationSeconds),
        position: compiled.ribbons.curvePositions[index],
      });
    }
    ribbons.push({
      ribbonIndex,
      kind: compiled.ribbons.kinds[ribbonIndex],
      segments: splitConnections(connections, segments, durationSeconds),
      curvePoints,
    });
  }

  const bpmMarkers = Array.from(compiled.bpm.times, (time, bpmIndex) => ({
    bpmIndex,
    beat: compiled.bpm.beats[bpmIndex],
    value: compiled.bpm.values[bpmIndex],
    point: project(rawPoint(
      time,
      0,
      BANDORI_FULL_CHART_LANE_COUNT,
      0,
      BANDORI_COMPILED_DIRECTION.none,
      isMirrored,
    ), segments, durationSeconds),
  }));

  return {
    durationSeconds,
    canvasWidth: segments.length * DEFAULT_SEGMENT_WIDTH,
    canvasHeight: DEFAULT_CANVAS_HEIGHT,
    segments,
    notes,
    ribbons,
    bpmMarkers,
  };
}
