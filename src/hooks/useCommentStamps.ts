"use client";

import { useMemo } from "react";
import { parseApiSuccessData } from "@/lib/api-contracts";
import {
  BANDORI_STAMP_CLIENT_STALE_TIME_MS,
  buildBandoriStampApiPath,
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

function parseIndexResponse(raw: unknown): BandoriStampIndexResponse | null {
  return parseApiSuccessData<BandoriStampIndexResponse>(raw);
}

function parseAssetResponse(raw: unknown): BandoriStampAssetResponse | null {
  return parseApiSuccessData<BandoriStampAssetResponse>(raw);
}

function parseAnimationResponse(raw: unknown): BandoriStampAnimationResponse | null {
  return parseApiSuccessData<BandoriStampAnimationResponse>(raw);
}

export function useCommentStampsForRegion(
  region: CommentStampRegion,
  enabled = true,
): { stamps: readonly CommentStamp[]; loading: boolean } {
  const fallbackStamps = useMemo(() => getCommentStampsForRegion(region), [region]);
  const { data, loading } = useCachedFetch<BandoriStampIndexResponse | null>(
    enabled ? `bandori-comment-stamps:${region}:index:v1` : null,
    enabled ? `/api/bandori/stamps/${region}` : null,
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
  const stampApiPath = buildBandoriStampApiPath(region, stampId);
  const { data, loading } = useCachedFetch<BandoriStampAssetResponse | null>(
    enabled ? `bandori-comment-stamps:${region}:${stampId}:manifest:v2` : null,
    enabled ? stampApiPath : null,
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
  const { data, loading } = useCachedFetch<BandoriStampAnimationResponse | null>(
    enabled ? `bandori-comment-stamps:${region}:${stampId}:animation:v1` : null,
    enabled ? `/api/bandori/stamps/${region}/${stampId}/animation` : null,
    parseAnimationResponse,
    {
      staleTimeMs: BANDORI_STAMP_CLIENT_STALE_TIME_MS,
      refreshOnVisible: false,
    },
  );

  return { animation: data, loading };
}
