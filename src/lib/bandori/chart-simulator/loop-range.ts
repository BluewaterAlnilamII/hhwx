import { BANDORI_CHART_REFERENCE_FRAME_RATE } from "@/lib/bandori/chart-simulator/transport";

export type BandoriChartLoopRange = {
  endTimeSeconds: number;
  startTimeSeconds: number;
};

export type BandoriChartLoopPoints = {
  endTimeSeconds: number | null;
  startTimeSeconds: number | null;
};

export type BandoriChartLoopPointKind = "start" | "end";

function assertDuration(durationSeconds: number): void {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new RangeError("Loop duration must be a positive finite number");
  }
}

function clampLoopPoint(durationSeconds: number, timeSeconds: number): number {
  assertDuration(durationSeconds);
  if (!Number.isFinite(timeSeconds)) {
    throw new RangeError("Loop point must be finite");
  }
  return Math.max(0, Math.min(durationSeconds, timeSeconds));
}

function createOneFrameLoopRange(
  durationSeconds: number,
  timeSeconds: number,
): BandoriChartLoopRange {
  const frameDurationSeconds = 1 / BANDORI_CHART_REFERENCE_FRAME_RATE;
  if (timeSeconds + frameDurationSeconds <= durationSeconds) {
    return {
      endTimeSeconds: timeSeconds + frameDurationSeconds,
      startTimeSeconds: timeSeconds,
    };
  }
  return {
    endTimeSeconds: durationSeconds,
    startTimeSeconds: Math.max(0, durationSeconds - frameDurationSeconds),
  };
}

export function createBandoriChartLoopPoints(): BandoriChartLoopPoints {
  return { endTimeSeconds: null, startTimeSeconds: null };
}

export function clearBandoriChartLoopPoint(
  points: BandoriChartLoopPoints,
  kind: BandoriChartLoopPointKind,
): BandoriChartLoopPoints {
  if (kind === "start") {
    return points.startTimeSeconds === null
      ? points
      : { ...points, startTimeSeconds: null };
  }
  return points.endTimeSeconds === null
    ? points
    : { ...points, endTimeSeconds: null };
}

export function createBandoriTimeLoopRange(
  durationSeconds: number,
  startTimeSeconds: number,
  endTimeSeconds: number,
): BandoriChartLoopRange {
  assertDuration(durationSeconds);
  if (
    !Number.isFinite(startTimeSeconds)
    || !Number.isFinite(endTimeSeconds)
    || startTimeSeconds < 0
    || endTimeSeconds > durationSeconds
    || startTimeSeconds >= endTimeSeconds
  ) {
    throw new RangeError("Loop time range must satisfy 0 <= start < end <= duration");
  }
  return { endTimeSeconds, startTimeSeconds };
}

export function setBandoriChartLoopPoint(
  points: BandoriChartLoopPoints,
  durationSeconds: number,
  kind: BandoriChartLoopPointKind,
  timeSeconds: number,
): BandoriChartLoopPoints {
  const nextTimeSeconds = clampLoopPoint(durationSeconds, timeSeconds);
  const oppositeTimeSeconds = kind === "start"
    ? points.endTimeSeconds
    : points.startTimeSeconds;

  if (oppositeTimeSeconds === null) {
    return kind === "start"
      ? { ...points, startTimeSeconds: nextTimeSeconds }
      : { ...points, endTimeSeconds: nextTimeSeconds };
  }

  if (nextTimeSeconds === oppositeTimeSeconds) {
    return createOneFrameLoopRange(durationSeconds, nextTimeSeconds);
  }

  return {
    endTimeSeconds: Math.max(nextTimeSeconds, oppositeTimeSeconds),
    startTimeSeconds: Math.min(nextTimeSeconds, oppositeTimeSeconds),
  };
}

export function getBandoriChartLoopRange(
  points: BandoriChartLoopPoints,
): BandoriChartLoopRange | null {
  if (points.startTimeSeconds === null || points.endTimeSeconds === null) {
    return null;
  }
  return {
    endTimeSeconds: points.endTimeSeconds,
    startTimeSeconds: points.startTimeSeconds,
  };
}
