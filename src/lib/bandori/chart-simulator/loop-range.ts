import type { CompiledBandoriChart } from "@/lib/bandori/chart-simulator/compiler";

export type BandoriChartLoopRange = {
  endTimeSeconds: number;
  startTimeSeconds: number;
};

export type BandoriChartNoteLoopRange = BandoriChartLoopRange & {
  normalizedEndNoteNumber: number;
  normalizedStartNoteNumber: number;
};

function assertDuration(durationSeconds: number): void {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new RangeError("Loop duration must be a positive finite number");
  }
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

export function createBandoriFullSongLoopRange(
  durationSeconds: number,
): BandoriChartLoopRange {
  return createBandoriTimeLoopRange(durationSeconds, 0, durationSeconds);
}

export function resolveBandoriNoteLoopRange(
  compiled: CompiledBandoriChart,
  startNoteNumber: number,
  endNoteNumber: number,
): BandoriChartNoteLoopRange {
  const noteTimes = compiled.notes.times;
  if (
    noteTimes.length !== compiled.maxCombo
    || !Number.isSafeInteger(startNoteNumber)
    || !Number.isSafeInteger(endNoteNumber)
    || startNoteNumber < 1
    || endNoteNumber > noteTimes.length
    || startNoteNumber > endNoteNumber
  ) {
    throw new RangeError("Loop Note range must be an ordered one-based range inside the chart");
  }

  let startIndex = startNoteNumber - 1;
  const selectedStartTime = noteTimes[startIndex];
  while (startIndex > 0 && noteTimes[startIndex - 1] === selectedStartTime) {
    startIndex -= 1;
  }

  let endIndex = endNoteNumber - 1;
  const selectedEndTime = noteTimes[endIndex];
  while (endIndex + 1 < noteTimes.length && noteTimes[endIndex + 1] === selectedEndTime) {
    endIndex += 1;
  }

  const startTimeSeconds = startIndex === 0
    ? 0
    : (noteTimes[startIndex - 1] + noteTimes[startIndex]) / 2;
  const endTimeSeconds = endIndex === noteTimes.length - 1
    ? compiled.timelineDurationSeconds
    : noteTimes[endIndex + 1];
  createBandoriTimeLoopRange(
    compiled.timelineDurationSeconds,
    startTimeSeconds,
    endTimeSeconds,
  );

  return {
    endTimeSeconds,
    normalizedEndNoteNumber: endIndex + 1,
    normalizedStartNoteNumber: startIndex + 1,
    startTimeSeconds,
  };
}

export function isBandoriTimeInsideLoopRange(
  range: BandoriChartLoopRange,
  timeSeconds: number,
): boolean {
  return Number.isFinite(timeSeconds)
    && timeSeconds >= range.startTimeSeconds
    && timeSeconds < range.endTimeSeconds;
}
