import { unstable_cache } from "next/cache";
import { SNAPSHOT_HTTP_CACHE_POLICY } from "@/lib/api-cache";
import {
  BANDORI_MUSIC_INDEX_KEY,
  buildBandoriPublicAssetUrl,
  parseBandoriMusicAssetIndex,
  type BandoriAudioAssetDescriptor,
  type BandoriJsonAssetDescriptor,
  type BandoriMusicAssetIndex,
  type BandoriPngAssetDescriptor,
} from "@/lib/bandori-public-asset-index";
import { fetchBandoriPublicAssetIndexJson } from "@/lib/bandori-public-asset-index-server";

export type BandoriMusicIndex = BandoriMusicAssetIndex;

export const BANDORI_MUSIC_METADATA_REVALIDATE_SECONDS =
  SNAPSHOT_HTTP_CACHE_POLICY.nextRevalidateSeconds ?? 1800;

function normalizeCdnBaseUrl(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue.replace(/\/+$/u, "") : null;
}

export function getBandoriMusicCdnBaseUrl(): string | null {
  return normalizeCdnBaseUrl(
    process.env.BANDORI_MUSIC_CDN_BASE_URL
      ?? process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL,
  );
}

export function buildBandoriMusicAssetUrl(
  descriptor: Pick<
    BandoriPngAssetDescriptor | BandoriAudioAssetDescriptor | BandoriJsonAssetDescriptor,
    "key"
  >,
  baseUrl = getBandoriMusicCdnBaseUrl(),
): string {
  const url = buildBandoriPublicAssetUrl(descriptor, baseUrl);
  if (!url) {
    throw new Error("Bandori music CDN base URL is not configured");
  }
  return url;
}

export async function fetchBandoriMusicIndex(): Promise<BandoriMusicIndex> {
  return parseBandoriMusicAssetIndex(
    await fetchBandoriPublicAssetIndexJson(BANDORI_MUSIC_INDEX_KEY),
  );
}

export const readBandoriMusicIndex = unstable_cache(
  fetchBandoriMusicIndex,
  ["bandori-public-music-index:v3"],
  { revalidate: BANDORI_MUSIC_METADATA_REVALIDATE_SECONDS },
);
