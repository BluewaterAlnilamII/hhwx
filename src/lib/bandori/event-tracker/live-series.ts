import type {
  BandoriTrackerLiveServer,
  BandoriTrackerLiveSnapshot,
} from "@/lib/bandori/event-tracker/live-contract";

export type BandoriTrackerSeriesPoint = {
  time: number;
  ep: number;
  isFinal?: boolean;
};

export type BandoriTrackerLiveCutoffUpdate = BandoriTrackerSeriesPoint & {
  cacheKey: string;
};

export type BandoriTrackerLiveSongUpdate = BandoriTrackerLiveCutoffUpdate & {
  songId: number;
};

export type BandoriTrackerLiveSeriesUpdates = {
  cutoffUpdates: BandoriTrackerLiveCutoffUpdate[];
  songUpdates: BandoriTrackerLiveSongUpdate[];
  resultKeys: string[];
};

const LEGACY_SERVER_INDEX: Record<BandoriTrackerLiveServer, number> = {
  jp: 0,
  en: 1,
  tw: 2,
  cn: 3,
};

function buildTrackerCacheKey(
  snapshot: BandoriTrackerLiveSnapshot,
  mode: "event" | "song" | "monthly",
  tier: number,
): string {
  return `tracker-${LEGACY_SERVER_INDEX[snapshot.server]}-${snapshot.targetId}-${mode}-${tier}`;
}

/**
 * Fan a complete event snapshot out into the per-tier cache keys used by the
 * tracker page. Song/monthly snapshots remain parseable for compatibility but
 * are intentionally ignored by the current event-only live feature.
 */
export function buildBandoriTrackerLiveSeriesUpdates(
  snapshot: BandoriTrackerLiveSnapshot,
): BandoriTrackerLiveSeriesUpdates {
  const cutoffUpdates: BandoriTrackerLiveCutoffUpdate[] = [];
  const songUpdates: BandoriTrackerLiveSongUpdate[] = [];
  const resultKeys = new Set<string>();

  if (snapshot.namespace === "events") {
    for (const point of snapshot.event) {
      const cacheKey = buildTrackerCacheKey(snapshot, "event", point.tier);
      cutoffUpdates.push({
        cacheKey,
        time: point.time,
        ep: point.ep,
        isFinal: point.isFinal,
      });
      resultKeys.add(cacheKey);
    }

  }

  return {
    cutoffUpdates,
    songUpdates,
    resultKeys: Array.from(resultKeys),
  };
}

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
