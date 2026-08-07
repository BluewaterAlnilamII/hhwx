import { unstable_cache } from "next/cache";
import { SNAPSHOT_HTTP_CACHE_POLICY } from "@/lib/api-cache";
import {
  BANDORI_MUSIC_INDEX_KEY,
  parseBandoriMusicAssetIndex,
  type BandoriMusicAssetIndex,
} from "@/lib/bandori-public-asset-index";
import { fetchBandoriPublicAssetIndexJson } from "@/lib/bandori-public-asset-index-server";

export type BandoriMusicIndex = BandoriMusicAssetIndex;

export const BANDORI_MUSIC_METADATA_REVALIDATE_SECONDS =
  SNAPSHOT_HTTP_CACHE_POLICY.nextRevalidateSeconds ?? 1800;

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
