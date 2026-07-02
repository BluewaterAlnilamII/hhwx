"use client";

import { useMemo } from "react";
import {
  BANDORI_STAMP_CLIENT_STALE_TIME_MS,
  buildBandoriStampCatalogApiUrl,
  getBandoriStampCatalogItemsForRegion,
  parseBandoriStampAnimationCdnResponse,
  parseBandoriStampCatalogApiResponse,
  type BandoriStampAnimationSummary,
  type BandoriStampAnimationResponse,
  type BandoriStampCatalogApiResponse,
} from "@/lib/bandori-stamp-assets";
import {
  getCommentStampsForRegion,
  type CommentStamp,
  type CommentStampRegion,
} from "@/lib/comment-stamps";
import { useCachedFetch } from "@/hooks/useCachedFetch";

export function useCommentStampCatalog(enabled = true): {
  catalog: BandoriStampCatalogApiResponse | null;
  loading: boolean;
} {
  const catalogUrl = useMemo(() => buildBandoriStampCatalogApiUrl(), []);
  const { data, loading } = useCachedFetch<BandoriStampCatalogApiResponse | null>(
    enabled ? "bandori-comment-stamps:catalog:v1" : null,
    enabled ? catalogUrl : null,
    parseBandoriStampCatalogApiResponse,
    {
      staleTimeMs: BANDORI_STAMP_CLIENT_STALE_TIME_MS,
      refreshOnVisible: false,
    },
  );

  return { catalog: data, loading };
}

export function useCommentStampsForRegion(
  region: CommentStampRegion,
  enabled = true,
): { stamps: readonly CommentStamp[]; loading: boolean } {
  const fallbackStamps = useMemo(() => getCommentStampsForRegion(region), [region]);
  const { catalog, loading } = useCommentStampCatalog(enabled);

  return {
    stamps: catalog ? getBandoriStampCatalogItemsForRegion(catalog, region) : fallbackStamps,
    loading: loading && catalog === null,
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
