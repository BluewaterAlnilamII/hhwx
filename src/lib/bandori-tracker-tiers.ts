export const EVENT_TIERS = [1, 10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 1500, 2000, 3000, 4000, 5000, 10000, 20000, 30000, 40000, 50000, 70000, 100000];
export const SONG_TIERS = [1, 10, 20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000, 5000, 10000, 20000];
export const MONTHLY_TIERS = [1, 10, 20, 30, 40, 50, 100, 200, 300, 500, 1000, 2000, 3000, 4000];

export type TrackerTierMode = "event" | "song" | "monthly";

export function getTiersForMode(mode: TrackerTierMode): number[] {
  if (mode === "event") return EVENT_TIERS;
  if (mode === "song") return SONG_TIERS;
  return MONTHLY_TIERS;
}

export function isSupportedTrackerTier(mode: string, tier: number): boolean {
  if (mode !== "event" && mode !== "song" && mode !== "monthly") {
    return false;
  }

  return getTiersForMode(mode).includes(tier);
}
