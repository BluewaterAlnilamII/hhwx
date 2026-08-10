export type BandoriTrackerUpdateAge = {
  label: string;
  isStale: boolean;
};

export function formatBandoriTrackerUpdateAge(
  timestamp: number,
  now: number,
): BandoriTrackerUpdateAge {
  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  return {
    label: elapsedSeconds < 60
      ? `${elapsedSeconds}秒前`
      : `${elapsedMinutes}分钟前`,
    isStale: elapsedMinutes > 30,
  };
}
