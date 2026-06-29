import { getTiersForMode } from "./constants";
import type { TrackingMode } from "./types";

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
  const tiers = getTiersForMode(mode);
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

  return getTiersForMode(mode).includes(tier) ? tier : null;
}

export function readTrackerTierPreference(mode: TrackingMode): number {
  if (typeof window === "undefined") {
    return getDefaultTierForMode(mode);
  }

  try {
    const rawValue = window.localStorage.getItem(TIER_PREFERENCE_STORAGE_KEY_BY_MODE[mode]);
    const normalizedTier = rawValue === null ? null : normalizeTierForMode(mode, rawValue);

    return normalizedTier ?? getDefaultTierForMode(mode);
  } catch {
    return getDefaultTierForMode(mode);
  }
}

export function writeTrackerTierPreference(mode: TrackingMode, tier: number) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedTier = normalizeTierForMode(mode, tier);
  if (normalizedTier === null) {
    return;
  }

  try {
    const storageKey = TIER_PREFERENCE_STORAGE_KEY_BY_MODE[mode];
    const nextValue = String(normalizedTier);
    if (window.localStorage.getItem(storageKey) === nextValue) {
      return;
    }

    window.localStorage.setItem(storageKey, nextValue);
  } catch {
    return;
  }
}
