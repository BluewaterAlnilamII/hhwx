export type BandoriTrackerSpeedPoint = {
  time: number;
  ep: number;
  speed?: number;
  speed24?: number;
  refSpeed24?: number;
};

export const INSTANT_SPEED_MIN_WINDOW_MS = (4 * 60 + 30) * 1000;
const DAY_SPEED_MIN_WINDOW_MS = (23 * 60 + 55) * 60 * 1000;

/**
 * Add the short-window and 24-hour speeds used by tracker projections.
 * Each pointer selects the newest prior point that is still at least the
 * configured window behind the current point.
 */
export function calculateBandoriTrackerSpeeds<T extends BandoriTrackerSpeedPoint>(
  points: readonly T[],
): T[] {
  const processed = points.map((point) => ({ ...point }));
  let instantLeft = 0;
  let dayLeft = 0;

  for (let right = 0; right < processed.length; right++) {
    while (
      instantLeft + 1 < right
      && processed[right].time - processed[instantLeft + 1].time >= INSTANT_SPEED_MIN_WINDOW_MS
    ) {
      instantLeft++;
    }

    if (processed[right].time - processed[instantLeft].time >= INSTANT_SPEED_MIN_WINDOW_MS) {
      const elapsedHours = (processed[right].time - processed[instantLeft].time) / 3_600_000;
      if (elapsedHours > 0) {
        processed[right].speed = Math.round(
          (processed[right].ep - processed[instantLeft].ep) / elapsedHours,
        );
      }
    }

    while (
      dayLeft + 1 < right
      && processed[right].time - processed[dayLeft + 1].time >= DAY_SPEED_MIN_WINDOW_MS
    ) {
      dayLeft++;
    }

    if (processed[right].time - processed[dayLeft].time >= DAY_SPEED_MIN_WINDOW_MS) {
      const elapsedDays = (processed[right].time - processed[dayLeft].time) / 86_400_000;
      if (elapsedDays > 0) {
        processed[right].speed24 = Math.round(
          (processed[right].ep - processed[dayLeft].ep) / elapsedDays,
        );
        processed[right].refSpeed24 = processed[dayLeft].speed24;
      }
    } else if (right > 0) {
      // Preserve the existing early-event approximation until a full day is available.
      processed[right].speed24 = processed[right].ep;
      processed[right].refSpeed24 = processed[0].speed24;
    }
  }

  return processed;
}
