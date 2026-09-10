"use client";

import { useMemo } from "react";
import { useBandoriStampsAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import {
  BANDORI_STAMP_CLIENT_STALE_TIME_MS,
  buildBandoriStampMasterApiUrl,
  getBandoriStampCatalogItemsForRegion,
  parseBandoriStampAnimationCdnResponse,
  parseBandoriStampMasterApiResponse,
  type BandoriStampAnimationSummary,
  type BandoriStampAnimationResponse,
  type BandoriStampCatalog,
  type BandoriStampMasterMap,
} from "@/lib/bandori-stamp-assets";
import {
  type CommentStamp,
  type CommentStampRegion,
} from "@/lib/comments/stamps";
import { useCachedFetch } from "@/hooks/useCachedFetch";

export function useCommentStampCatalog(enabled = true): {
  catalog: BandoriStampCatalog | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
} {
  const masterUrl = useMemo(() => buildBandoriStampMasterApiUrl(), []);
  const { data: master, loading: masterLoading, error: masterError, refresh: refreshMaster } = useCachedFetch<BandoriStampMasterMap>(
    enabled ? "bandori-comment-stamps:master:v2" : null,
    enabled ? masterUrl : null,
    parseBandoriStampMasterApiResponse,
    {
      staleTimeMs: BANDORI_STAMP_CLIENT_STALE_TIME_MS,
      refreshOnVisible: false,
    },
  );
  const {
    value: assets,
    loading: assetsLoading,
    error: assetsError,
    refresh: refreshAssets,
  } = useBandoriStampsAssetIndex(enabled);
  const catalog = useMemo(
    () => (master && assets ? { master, assets } : null),
    [assets, master],
  );

  return {
    catalog,
    loading: catalog === null && (masterLoading || assetsLoading),
    error: masterError ?? assetsError,
    refresh: () => { if (masterError) refreshMaster(); if (assetsError) refreshAssets(); },
  };
}

export function useCommentStampsForRegion(
  region: CommentStampRegion,
  enabled = true,
): { stamps: readonly CommentStamp[]; loading: boolean; error: Error | null; refresh: () => void } {
  const { catalog, loading, error, refresh } = useCommentStampCatalog(enabled);

  return {
    stamps: catalog ? getBandoriStampCatalogItemsForRegion(catalog, region) : [],
    loading: loading && catalog === null,
    error,
    refresh,
  };
}

export function useCommentStampAnimation(
  region: CommentStampRegion,
  stampId: number,
  summary: BandoriStampAnimationSummary | undefined,
  enabled = true,
): { animation: BandoriStampAnimationResponse | null; loading: boolean } {
  const manifestUrl = summary?.manifestUrl ?? "";
  const atlasUrl = summary?.atlasUrl ?? "";
  const parseAnimationResponse = useMemo(
    () => (raw: unknown): BandoriStampAnimationResponse | null => (
      parseBandoriStampAnimationCdnResponse(region, stampId, raw, manifestUrl, atlasUrl)
    ),
    [atlasUrl, manifestUrl, region, stampId],
  );
  const { data, loading } = useCachedFetch<BandoriStampAnimationResponse | null>(
    enabled && manifestUrl ? `bandori-comment-stamps:${region}:${stampId}:animation:v2` : null,
    enabled && manifestUrl ? manifestUrl : null,
    parseAnimationResponse,
    {
      staleTimeMs: BANDORI_STAMP_CLIENT_STALE_TIME_MS,
      refreshOnVisible: false,
    },
  );

  return { animation: data, loading };
}
