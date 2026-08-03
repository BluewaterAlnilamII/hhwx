import { getEventTrackerTiersForMode } from "./constants";
import type { TrackingMode } from "./types";

export const TOP10_RANKING_SELECTION = "top10" as const;
export type TrackerRankingSelection = number | typeof TOP10_RANKING_SELECTION;

const DEFAULT_TIER_BY_MODE: Record<TrackingMode, number> = {
  event: 500,
  song: 500,
  monthly: 300,
};

const TIER_PREFERENCE_STORAGE_KEY_BY_MODE: Record<TrackingMode, string> = {
  event: "eventtracker_tier_event",
  song: "eventtracker_tier_song",
  monthly: "eventtracker_tier_monthly",
};

export function getDefaultTierForMode(mode: TrackingMode): number {
  const tiers = getEventTrackerTiersForMode(mode);
  const defaultTier = DEFAULT_TIER_BY_MODE[mode];

  return tiers.includes(defaultTier) ? defaultTier : tiers[0];
}

export function normalizeTierForMode(mode: TrackingMode, value: unknown): number | null {
  const tier = typeof value === "number"
    ? value
    : Number.parseInt(String(value), 10);

  if (!Number.isInteger(tier)) {
    return null;
  }

  return getEventTrackerTiersForMode(mode).includes(tier) ? tier : null;
}

export function normalizeTrackerRankingForMode(
  mode: TrackingMode,
  value: unknown,
): TrackerRankingSelection | null {
  if (mode === "event" && value === TOP10_RANKING_SELECTION) {
    return TOP10_RANKING_SELECTION;
  }

  return normalizeTierForMode(mode, value);
}

export function readTrackerRankingPreference(mode: TrackingMode): TrackerRankingSelection {
  if (typeof window === "undefined") {
    return getDefaultTierForMode(mode);
  }

  try {
    const rawValue = window.localStorage.getItem(TIER_PREFERENCE_STORAGE_KEY_BY_MODE[mode]);
    const normalizedRanking = rawValue === null
      ? null
      : normalizeTrackerRankingForMode(mode, rawValue);

    return normalizedRanking ?? getDefaultTierForMode(mode);
  } catch {
    return getDefaultTierForMode(mode);
  }
}

export function writeTrackerRankingPreference(
  mode: TrackingMode,
  ranking: TrackerRankingSelection,
) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedRanking = normalizeTrackerRankingForMode(mode, ranking);
  if (normalizedRanking === null) {
    return;
  }

  try {
    const storageKey = TIER_PREFERENCE_STORAGE_KEY_BY_MODE[mode];
    const nextValue = String(normalizedRanking);
    if (window.localStorage.getItem(storageKey) === nextValue) {
      return;
    }

    window.localStorage.setItem(storageKey, nextValue);
  } catch {
    return;
  }
}
