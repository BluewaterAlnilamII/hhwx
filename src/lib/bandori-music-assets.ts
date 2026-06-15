import { MUTABLE_DIRECTORY_CACHE_PROFILE } from "@/lib/api-cache";

export type BandoriMusicIndexSong = {
  musicId?: number;
  sourceServer?: string;
  manifest?: string;
  difficulties?: string[];
  notes?: Record<string, number>;
  bgmId?: string;
  bgmFile?: string;
};

export type BandoriMusicIndex = {
  schemaVersion?: string;
  generatedAt?: string;
  baselineServer?: string;
  songs?: BandoriMusicIndexSong[];
};

export const BANDORI_MUSIC_METADATA_REVALIDATE_SECONDS =
  MUTABLE_DIRECTORY_CACHE_PROFILE.nextRevalidateSeconds ?? 300;

function normalizeCdnBaseUrl(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue.replace(/\/+$/u, "") : null;
}

export function getBandoriMusicCdnBaseUrl(): string | null {
  return normalizeCdnBaseUrl(
    process.env.BANDORI_MUSIC_CDN_BASE_URL
      ?? process.env.BANDORI_ASSET_CDN_BASE_URL
      ?? process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL,
  );
}

export function buildBandoriMusicAssetUrl(path: string, baseUrl = getBandoriMusicCdnBaseUrl()): string {
  if (!baseUrl) {
    throw new Error("Bandori music CDN base URL is not configured");
  }

  return `${baseUrl}/bandori/music/${path.replace(/^\/+/u, "")}`;
}

export async function fetchBandoriMusicIndex(baseUrl = getBandoriMusicCdnBaseUrl()): Promise<BandoriMusicIndex> {
  const url = buildBandoriMusicAssetUrl("index.json", baseUrl);
  const response = await fetch(url, {
    next: { revalidate: BANDORI_MUSIC_METADATA_REVALIDATE_SECONDS },
  });

  if (!response.ok) {
    throw new Error(`Bandori music index fetch failed: HTTP ${response.status} ${url}`);
  }

  return response.json() as Promise<BandoriMusicIndex>;
}
