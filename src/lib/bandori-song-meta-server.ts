import { unstable_cache } from "next/cache";
import { SNAPSHOT_HTTP_CACHE_POLICY } from "@/lib/api-cache";
import {
  BANDORI_MUSIC_INDEX_KEY,
  BANDORI_MUSIC_META_INDEX_KEY,
} from "@/lib/bandori-public-asset-index";
import {
  fetchBandoriPublicAssetIndexJson,
  fetchBandoriPublicAssetJson,
} from "@/lib/bandori-public-asset-index-server";

export const BANDORI_SONG_META_KEY = BANDORI_MUSIC_META_INDEX_KEY;
export const BANDORI_SONG_META_SCHEMA_VERSION = 1;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

type ScoreCoefficients = [number, number, number, number];

export type BandoriSongMetaDataset = {
  durations: number[];
  songs: Record<string, Record<string, Record<string, ScoreCoefficients>>>;
};

export type BandoriSongMetaArtifact = BandoriSongMetaDataset & {
  musicIndexSha256: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function parseCoefficients(value: unknown, label: string): ScoreCoefficients {
  if (
    !Array.isArray(value)
    || value.length !== 4
    || value.some((item) => typeof item !== "number" || !Number.isFinite(item) || item < 0)
  ) {
    throw new Error(`${label} is invalid`);
  }
  return [value[0], value[1], value[2], value[3]];
}

function durationKey(value: number): string {
  return String(value);
}

export function parseBandoriSongMetaArtifact(raw: unknown): BandoriSongMetaArtifact {
  if (
    !isRecord(raw)
    || !hasExactKeys(raw, [
      "schemaVersion",
      "updatedAt",
      "musicIndexSha256",
      "durations",
      "songs",
    ])
    || raw.schemaVersion !== BANDORI_SONG_META_SCHEMA_VERSION
    || typeof raw.updatedAt !== "string"
    || typeof raw.musicIndexSha256 !== "string"
    || !SHA256_PATTERN.test(raw.musicIndexSha256)
    || !Array.isArray(raw.durations)
    || raw.durations.length < 1
    || raw.durations.length > 64
    || raw.durations.some((duration) => (
      typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0
    ))
  ) {
    throw new Error("Bandori song meta artifact is invalid");
  }

  const durations = [...raw.durations] as number[];
  if (durations.some((duration, index) => index > 0 && duration <= durations[index - 1])) {
    throw new Error("Bandori song meta durations must be unique and sorted");
  }
  if (!isRecord(raw.songs) || Object.keys(raw.songs).length > 10_000) {
    throw new Error("Bandori song meta songs are invalid");
  }

  const durationKeys = durations.map(durationKey);
  const songs: BandoriSongMetaDataset["songs"] = {};
  for (const [songId, rawDifficulties] of Object.entries(raw.songs)) {
    if (!/^[1-9]\d*$/u.test(songId) || !isRecord(rawDifficulties)) {
      throw new Error(`Bandori song meta record is invalid: ${songId}`);
    }
    const difficulties: BandoriSongMetaDataset["songs"][string] = {};
    for (const [difficulty, rawEntry] of Object.entries(rawDifficulties)) {
      if (!/^[0-4]$/u.test(difficulty) || !isRecord(rawEntry)
        || !hasExactKeys(rawEntry, durationKeys)) {
        throw new Error(`Bandori song meta difficulty is invalid: ${songId}:${difficulty}`);
      }
      const coefficients: Record<string, ScoreCoefficients> = {};
      for (const key of durationKeys) {
        coefficients[key] = parseCoefficients(
          rawEntry[key],
          `Bandori song meta coefficients ${songId}:${difficulty}:${key}`,
        );
      }
      difficulties[difficulty] = coefficients;
    }
    if (Object.keys(difficulties).length === 0) {
      throw new Error(`Bandori song meta record is empty: ${songId}`);
    }
    songs[songId] = difficulties;
  }
  return { musicIndexSha256: raw.musicIndexSha256, durations, songs };
}

async function fetchBandoriSongMeta(): Promise<BandoriSongMetaDataset> {
  const artifact = parseBandoriSongMetaArtifact(
    await fetchBandoriPublicAssetIndexJson(BANDORI_SONG_META_KEY),
  );
  await fetchBandoriPublicAssetJson(
    BANDORI_MUSIC_INDEX_KEY,
    artifact.musicIndexSha256,
  );
  return { durations: artifact.durations, songs: artifact.songs };
}

export const readBandoriSongMetaDataset = unstable_cache(
  fetchBandoriSongMeta,
  ["bandori-public-song-meta:v2"],
  { revalidate: SNAPSHOT_HTTP_CACHE_POLICY.nextRevalidateSeconds ?? 1800 },
);
