export type BandoriTrackerSpeedPoint = {
  time: number;
  ep: number;
  isBaseline?: boolean;
  speed?: number;
  speed24?: number;
  refSpeed24?: number;
};

export const INSTANT_SPEED_MIN_WINDOW_MS = (9 * 60 + 45) * 1000;
export const DAY_SPEED_MIN_WINDOW_MS = (23 * 60 + 55) * 60 * 1000;

function calculateRate(current: BandoriTrackerSpeedPoint, reference: BandoriTrackerSpeedPoint, unitMs: number) {
  const elapsedMs = current.time - reference.time;
  if (elapsedMs <= 0) return undefined;

  return Math.round((current.ep - reference.ep) / (elapsedMs / unitMs));
}

/**
 * Add the short-window and 24-hour speeds used by tracker projections.
 * Each pointer selects the newest prior point that is still at least the
 * configured window behind the current point. Before that window is
 * available, event and monthly tracking use their explicit EP=0 baseline.
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

    const instantReference = (
      processed[right].time - processed[instantLeft].time >= INSTANT_SPEED_MIN_WINDOW_MS
        ? processed[instantLeft]
        : (processed[0].isBaseline ? processed[0] : undefined)
    );
    if (instantReference) {
      processed[right].speed = calculateRate(processed[right], instantReference, 3_600_000);
    }

    while (
      dayLeft + 1 < right
      && processed[right].time - processed[dayLeft + 1].time >= DAY_SPEED_MIN_WINDOW_MS
    ) {
      dayLeft++;
    }

    const dayReference = (
      processed[right].time - processed[dayLeft].time >= DAY_SPEED_MIN_WINDOW_MS
        ? processed[dayLeft]
        : (processed[0].isBaseline ? processed[0] : undefined)
    );
    if (dayReference) {
      processed[right].speed24 = calculateRate(processed[right], dayReference, 86_400_000);
      processed[right].refSpeed24 = dayReference.speed24;
    }
  }

  return processed;
}
