import { REFERENCE_METADATA_CACHE_PROFILE } from "@/lib/api-cache";

const BESTDORI_API_ORIGIN = "https://bestdori.com/api";
const BESTDORI_USER_AGENT = "hhwx-tracker/1.0";

export const BESTDORI_MASTER_DATASETS = {
  cards: "cards/all.5.json",
  songs: "songs/all.7.json",
  events: "events/all.6.json",
  areaItems: "areaItems/main.5.json",
  skills: "skills/all.10.json",
  bands: "bands/all.1.json",
  characters: "characters/main.3.json",
} as const;

export type BestdoriMasterDatasetKey = keyof typeof BESTDORI_MASTER_DATASETS;

export const BESTDORI_MASTER_DATASET_ALIASES = {
  "area-items": "areaItems",
} as const satisfies Record<string, BestdoriMasterDatasetKey>;

export const BESTDORI_CHART_DIFFICULTIES = ["easy", "normal", "hard", "expert", "special"] as const;

export type BestdoriChartDifficulty = typeof BESTDORI_CHART_DIFFICULTIES[number];

export function isBestdoriChartDifficulty(value: string): value is BestdoriChartDifficulty {
  return (BESTDORI_CHART_DIFFICULTIES as readonly string[]).includes(value);
}

type BestdoriRegionalMetadata = {
  musicTitle?: Array<string | null> | null;
  publishedAt?: Array<string | number | null> | null;
};

function hasRegionalValue(values: unknown, regionIndex: number): boolean {
  if (!Array.isArray(values)) {
    return false;
  }

  const value = values[regionIndex];
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return value !== null && value !== undefined;
}

export function isBestdoriSongSupportedByJpOrCn(song: BestdoriRegionalMetadata | null | undefined): boolean {
  if (!song) {
    return false;
  }

  return hasRegionalValue(song.publishedAt, 0)
    || hasRegionalValue(song.publishedAt, 3)
    || hasRegionalValue(song.musicTitle, 0)
    || hasRegionalValue(song.musicTitle, 3);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function filterBestdoriSongsForJpOrCn(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload;
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([, song]) => isBestdoriSongSupportedByJpOrCn(song as BestdoriRegionalMetadata)),
  );
}

function buildBestdoriApiUrl(path: string): string {
  return `${BESTDORI_API_ORIGIN}/${path}`;
}

async function fetchBestdoriJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "User-Agent": BESTDORI_USER_AGENT },
    next: { revalidate: REFERENCE_METADATA_CACHE_PROFILE.nextRevalidateSeconds },
  });

  if (!response.ok) {
    throw new Error(`Bestdori API failed: HTTP ${response.status}`);
  }

  return response.json();
}

export async function fetchBestdoriMasterDataset(dataset: BestdoriMasterDatasetKey): Promise<unknown> {
  return fetchBestdoriJson(buildBestdoriApiUrl(BESTDORI_MASTER_DATASETS[dataset]));
}

export async function fetchBestdoriChart(songId: number, difficulty: BestdoriChartDifficulty): Promise<unknown> {
  return fetchBestdoriJson(buildBestdoriApiUrl(`charts/${songId}/${difficulty}.json`));
}
