"use client";

import { usePublicAssetIndex as useBandoriPublicAssetIndex, type PublicAssetIndexHookResult as BandoriPublicAssetIndexHookResult } from "@/hooks/usePublicAssetIndex";
export type { PublicAssetIndexHookResult as BandoriPublicAssetIndexHookResult } from "@/hooks/usePublicAssetIndex";
import {
  buildBandoriPublicAssetIndexUrl,
  type BandoriCardsAssetIndex,
  type BandoriDegreesAssetIndex,
  type BandoriEventsAssetIndex,
  type BandoriMusicAssetIndex,
  type BandoriStampsAssetIndex,
} from "@/lib/bandori-public-asset-index";
import {
  bandoriCardsAssetIndexStore,
  bandoriCostumesAssetIndexStore,
  bandoriLiveSdAssetIndexStore,
  bandoriDegreesAssetIndexStore,
  bandoriEventsAssetIndexStore,
  bandoriMusicAssetIndexStore,
  bandoriStampsAssetIndexStore,
} from "@/lib/bandori-public-asset-index-client";

export function useBandoriCardsAssetIndex(
  enabled = true,
): BandoriPublicAssetIndexHookResult<BandoriCardsAssetIndex> {
  return useBandoriPublicAssetIndex(
    enabled ? buildBandoriPublicAssetIndexUrl("cards") : null,
    bandoriCardsAssetIndexStore,
  );
}

export function useBandoriCostumesAssetIndex(enabled = true) {
  return useBandoriPublicAssetIndex(
    enabled ? buildBandoriPublicAssetIndexUrl("costumes") : null,
    bandoriCostumesAssetIndexStore,
  );
}

export function useBandoriLiveSdAssetIndex(enabled = true) {
  return useBandoriPublicAssetIndex(
    enabled ? buildBandoriPublicAssetIndexUrl("liveSd") : null,
    bandoriLiveSdAssetIndexStore,
  );
}

export function useBandoriDegreesAssetIndex(
  enabled = true,
): BandoriPublicAssetIndexHookResult<BandoriDegreesAssetIndex> {
  return useBandoriPublicAssetIndex(
    enabled ? buildBandoriPublicAssetIndexUrl("degrees") : null,
    bandoriDegreesAssetIndexStore,
  );
}

export function useBandoriEventsAssetIndex(
  enabled = true,
): BandoriPublicAssetIndexHookResult<BandoriEventsAssetIndex> {
  return useBandoriPublicAssetIndex(
    enabled ? buildBandoriPublicAssetIndexUrl("events") : null,
    bandoriEventsAssetIndexStore,
  );
}

export function useBandoriMusicAssetIndex(
  enabled = true,
): BandoriPublicAssetIndexHookResult<BandoriMusicAssetIndex> {
  return useBandoriPublicAssetIndex(
    enabled ? buildBandoriPublicAssetIndexUrl("music") : null,
    bandoriMusicAssetIndexStore,
  );
}

export function useBandoriStampsAssetIndex(
  enabled = true,
): BandoriPublicAssetIndexHookResult<BandoriStampsAssetIndex> {
  return useBandoriPublicAssetIndex(
    enabled ? buildBandoriPublicAssetIndexUrl("stamps") : null,
    bandoriStampsAssetIndexStore,
  );
}
