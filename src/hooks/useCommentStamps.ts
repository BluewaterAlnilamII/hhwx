"use client";

import { useMemo } from "react";
import {
  BANDORI_STAMP_CLIENT_STALE_TIME_MS,
  buildBandoriStampAnimationManifestCdnUrl,
  buildBandoriStampIndexCdnUrl,
  buildBandoriStampManifestCdnUrl,
  parseBandoriStampAnimationCdnResponse,
  parseBandoriStampIndexCdnResponse,
  parseBandoriStampManifestCdnResponse,
  type BandoriStampAnimationResponse,
  type BandoriStampAssetResponse,
  type BandoriStampIndexResponse,
} from "@/lib/bandori-stamp-assets";
import {
  getCommentStampsForRegion,
  type CommentStamp,
  type CommentStampRegion,
} from "@/lib/comment-stamps";
import { useCachedFetch } from "@/hooks/useCachedFetch";

export function useCommentStampsForRegion(
  region: CommentStampRegion,
  enabled = true,
): { stamps: readonly CommentStamp[]; loading: boolean } {
  const fallbackStamps = useMemo(() => getCommentStampsForRegion(region), [region]);
  const indexUrl = useMemo(() => buildBandoriStampIndexCdnUrl(region), [region]);
  const parseIndexResponse = useMemo(
    () => (raw: unknown): BandoriStampIndexResponse | null => parseBandoriStampIndexCdnResponse(region, raw),
    [region],
  );
  const { data, loading } = useCachedFetch<BandoriStampIndexResponse | null>(
    enabled ? `bandori-comment-stamps:${region}:index:v1` : null,
    enabled ? indexUrl : null,
    parseIndexResponse,
    {
      staleTimeMs: BANDORI_STAMP_CLIENT_STALE_TIME_MS,
      refreshOnVisible: false,
    },
  );

  return {
    stamps: data?.stamps ?? fallbackStamps,
    loading: loading && data === null,
  };
}

export function useCommentStampAsset(
  region: CommentStampRegion,
  stampId: number,
  enabled = true,
): { asset: BandoriStampAssetResponse | null; loading: boolean } {
  const manifestUrl = useMemo(() => buildBandoriStampManifestCdnUrl(region, stampId), [region, stampId]);
  const parseAssetResponse = useMemo(
    () => (raw: unknown): BandoriStampAssetResponse | null => parseBandoriStampManifestCdnResponse(region, stampId, raw),
    [region, stampId],
  );
  const { data, loading } = useCachedFetch<BandoriStampAssetResponse | null>(
    enabled ? `bandori-comment-stamps:${region}:${stampId}:manifest:v2` : null,
    enabled ? manifestUrl : null,
    parseAssetResponse,
    {
      staleTimeMs: BANDORI_STAMP_CLIENT_STALE_TIME_MS,
      refreshOnVisible: false,
    },
  );

  return { asset: data, loading };
}

export function useCommentStampAnimation(
  region: CommentStampRegion,
  stampId: number,
  enabled = true,
): { animation: BandoriStampAnimationResponse | null; loading: boolean } {
  const animationUrl = useMemo(() => buildBandoriStampAnimationManifestCdnUrl(region, stampId), [region, stampId]);
  const parseAnimationResponse = useMemo(
    () => (raw: unknown): BandoriStampAnimationResponse | null => parseBandoriStampAnimationCdnResponse(region, stampId, raw),
    [region, stampId],
  );
  const { data, loading } = useCachedFetch<BandoriStampAnimationResponse | null>(
    enabled ? `bandori-comment-stamps:${region}:${stampId}:animation:v1` : null,
    enabled ? animationUrl : null,
    parseAnimationResponse,
    {
      staleTimeMs: BANDORI_STAMP_CLIENT_STALE_TIME_MS,
      refreshOnVisible: false,
    },
  );

  return { animation: data, loading };
}
