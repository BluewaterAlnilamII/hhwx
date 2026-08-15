"use client";

import { useMemo } from "react";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { useBandoriDegreesAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import {
  buildBandoriDegreeMasterApiUrl,
  getBandoriDegreeCatalogItemsForRegion,
  parseBandoriDegreeAnimationManifest,
  parseBandoriDegreeMasterApiResponse,
  type BandoriDegreeAnimationResponse,
  type BandoriDegreeAnimationSummary,
  type BandoriDegreeCatalog,
  type BandoriDegreeCatalogItem,
  type BandoriDegreeMasterMap,
  type BandoriDegreeRegion,
} from "@/lib/bandori-degree-assets";
import { buildBandoriPublicAssetUrl } from "@/lib/bandori-public-asset-index";

const BANDORI_DEGREES_STALE_TIME_MS = 60 * 60 * 1000;

export function useBandoriDegreeCatalog(enabled = true): {
  catalog: BandoriDegreeCatalog | null;
  loading: boolean;
  error: Error | null;
} {
  const masterUrl = useMemo(() => buildBandoriDegreeMasterApiUrl(), []);
  const masterResult = useCachedFetch<BandoriDegreeMasterMap>(
    enabled ? "bandori-degrees:master:v1" : null,
    enabled ? masterUrl : null,
    parseBandoriDegreeMasterApiResponse,
    { staleTimeMs: BANDORI_DEGREES_STALE_TIME_MS, refreshOnVisible: false },
  );
  const assetsResult = useBandoriDegreesAssetIndex(enabled);
  const catalog = useMemo(
    () => (masterResult.data && assetsResult.value
      ? { master: masterResult.data, assets: assetsResult.value }
      : null),
    [assetsResult.value, masterResult.data],
  );

  return {
    catalog,
    loading: catalog === null && (masterResult.loading || assetsResult.loading),
    error: masterResult.error ?? assetsResult.error,
  };
}

export function useBandoriDegreesForRegion(
  region: BandoriDegreeRegion,
  enabled = true,
): { degrees: readonly BandoriDegreeCatalogItem[]; loading: boolean; error: Error | null } {
  const { catalog, loading, error } = useBandoriDegreeCatalog(enabled);
  const degrees = useMemo(
    () => getBandoriDegreeCatalogItemsForRegion(catalog, region)
      .sort((left, right) => left.seq - right.seq || left.id - right.id),
    [catalog, region],
  );
  return { degrees, loading, error };
}

export function useBandoriDegreeAnimation(
  summary: BandoriDegreeAnimationSummary | undefined,
  enabled = true,
): { animation: BandoriDegreeAnimationResponse | null; loading: boolean } {
  const manifestUrl = buildBandoriPublicAssetUrl(summary?.manifest);
  const atlasUrl = buildBandoriPublicAssetUrl(summary?.atlas);
  const parser = useMemo(
    () => (raw: unknown) => parseBandoriDegreeAnimationManifest(
      raw,
      manifestUrl ?? "",
      atlasUrl ?? "",
    ),
    [atlasUrl, manifestUrl],
  );
  const result = useCachedFetch<BandoriDegreeAnimationResponse>(
    enabled && manifestUrl && atlasUrl ? `bandori-degree-animation:${manifestUrl}` : null,
    enabled && manifestUrl && atlasUrl ? manifestUrl : null,
    parser,
    { staleTimeMs: BANDORI_DEGREES_STALE_TIME_MS, refreshOnVisible: false },
  );
  return { animation: result.data, loading: result.loading };
}
