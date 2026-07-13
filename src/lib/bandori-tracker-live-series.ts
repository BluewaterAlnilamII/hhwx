export type BandoriTrackerSeriesPoint = {
  time: number;
  ep: number;
  isFinal?: boolean;
};

export function appendBandoriTrackerLivePoint<T extends BandoriTrackerSeriesPoint>(
  seriesByKey: Record<string, T[]>,
  cacheKey: string,
  point: NoInfer<T>,
): Record<string, T[]> {
  const current = seriesByKey[cacheKey] ?? [];
  if (current.length > 0 && point.time <= current[current.length - 1].time) {
    return seriesByKey as Record<string, T[]>;
  }

  return {
    ...seriesByKey,
    [cacheKey]: [...current, point],
  };
}
