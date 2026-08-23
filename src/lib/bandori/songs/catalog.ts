import { BANDORI_CHARACTER_GROUPS } from "@/lib/bandori-character-groups";
import {
  BANDORI_CHART_DIFFICULTIES,
  type BandoriChartDifficulty,
} from "@/lib/bandori-master-contract";
import type {
  BandoriMusicDifficulty,
  BandoriMusicMasterMap,
  BandoriMusicMasterRecord,
} from "@/lib/bandori-music-api-client";
import {
  pickBandoriRegionalText,
  readBandoriRegionalNumberAt,
  type BandoriServer,
} from "@/lib/bandori-server";

export const BANDORI_SONG_TYPES = ["original", "cover", "extra"] as const;
export const BANDORI_SONG_SORTS = ["release", "title", "level", "id"] as const;
export const BANDORI_SONG_DIFFICULTY_FILTERS = [
  "all",
  ...BANDORI_CHART_DIFFICULTIES,
] as const;
export const BANDORI_SONG_MAIN_BAND_IDS = BANDORI_CHARACTER_GROUPS.map(
  (group) => group.bandId,
);
export const BANDORI_SONG_BAND_FILTERS: BandoriSongBandFilter[] = [
  ...BANDORI_SONG_MAIN_BAND_IDS,
  "other",
];

export type BandoriSongType = (typeof BANDORI_SONG_TYPES)[number];
export type BandoriSongCatalogType = BandoriSongType | "other";
export type BandoriSongSort = (typeof BANDORI_SONG_SORTS)[number];
export type BandoriSongDifficultyFilter =
  (typeof BANDORI_SONG_DIFFICULTY_FILTERS)[number];
export type BandoriSongBandFilter = number | "other";

export type BandoriSongCatalogEntry = {
  songId: number;
  bandId: number;
  bandFilter: BandoriSongBandFilter;
  title: string;
  bandName: string;
  type: BandoriSongCatalogType;
  publishedAt: number;
  difficultyLevels: Partial<Record<BandoriChartDifficulty, number>>;
  searchText: string;
};

export type BandoriSongsPageFilter = {
  query: string;
  bands: BandoriSongBandFilter[];
  types: BandoriSongType[];
  difficulty: BandoriSongDifficultyFilter;
  minLevel: number | null;
  maxLevel: number | null;
  sortBy: BandoriSongSort;
  sortDirection: "asc" | "desc";
};

type BuildBandoriSongCatalogOptions = {
  unknownTitle: (songId: number) => string;
  unknownBand: string;
  now?: number;
};

const MAIN_BAND_ID_SET = new Set(BANDORI_SONG_MAIN_BAND_IDS);
const SONG_TAG_TYPE_MAP: Record<string, BandoriSongType> = {
  normal: "original",
  anime: "cover",
  tie_up: "extra",
};

function parsePositiveInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isReleasedAt(
  publishedAt: unknown,
  closedAt: unknown,
  server: BandoriServer,
  now: number,
): boolean {
  const publishedTimestamp = readBandoriRegionalNumberAt(publishedAt, server);
  const closedTimestamp = readBandoriRegionalNumberAt(closedAt, server);
  return publishedTimestamp !== null
    && publishedTimestamp > 0
    && publishedTimestamp <= now
    && (closedTimestamp === null || closedTimestamp <= 0 || closedTimestamp > now);
}

function isDifficultyReleased(
  difficulty: BandoriMusicDifficulty,
  server: BandoriServer,
  now: number,
): boolean {
  if (!Array.isArray(difficulty.publishedAt)) return true;
  const publishedTimestamp = readBandoriRegionalNumberAt(difficulty.publishedAt, server);
  return publishedTimestamp !== null && publishedTimestamp > 0 && publishedTimestamp <= now;
}

function collectSearchText(record: BandoriMusicMasterRecord, songId: number): string {
  return [
    String(songId),
    ...(Array.isArray(record.musicTitle) ? record.musicTitle : []),
    ...(Array.isArray(record.bandName) ? record.bandName : []),
  ].filter((value): value is string => typeof value === "string")
    .join("\n")
    .toLocaleLowerCase();
}

function resolveSongType(tag: unknown): BandoriSongCatalogType {
  return typeof tag === "string" ? SONG_TAG_TYPE_MAP[tag] ?? "other" : "other";
}

function getDifficultyLevel(
  record: BandoriMusicMasterRecord,
  difficulty: BandoriChartDifficulty,
  server: BandoriServer,
  now: number,
): number | null {
  const difficultyIndex = String(BANDORI_CHART_DIFFICULTIES.indexOf(difficulty));
  const entry = record.difficulty?.[difficultyIndex];
  if (
    !entry
    || !Number.isSafeInteger(entry.playLevel)
    || (entry.playLevel ?? 0) <= 0
    || !isDifficultyReleased(entry, server, now)
  ) {
    return null;
  }
  return entry.playLevel as number;
}

export function buildBandoriSongCatalog(
  music: BandoriMusicMasterMap,
  server: BandoriServer,
  options: BuildBandoriSongCatalogOptions,
): BandoriSongCatalogEntry[] {
  const now = options.now ?? Date.now();

  return Object.entries(music).flatMap(([rawSongId, record]) => {
    const songId = Number(rawSongId);
    if (
      !record
      || !Number.isSafeInteger(songId)
      || songId <= 0
      || !Number.isSafeInteger(record.bandId)
      || !isReleasedAt(record.publishedAt, record.closedAt, server, now)
    ) {
      return [];
    }

    const publishedAt = readBandoriRegionalNumberAt(record.publishedAt, server);
    if (publishedAt === null) return [];
    const difficultyLevels = Object.fromEntries(
      BANDORI_CHART_DIFFICULTIES.flatMap((difficulty) => {
        const level = getDifficultyLevel(record, difficulty, server, now);
        return level === null ? [] : [[difficulty, level]];
      }),
    ) as Partial<Record<BandoriChartDifficulty, number>>;
    if (Object.keys(difficultyLevels).length === 0) return [];

    const bandId = record.bandId as number;
    return [{
      songId,
      bandId,
      bandFilter: MAIN_BAND_ID_SET.has(bandId) ? bandId : "other",
      title: pickBandoriRegionalText(record.musicTitle, server, server)
        ?? options.unknownTitle(songId),
      bandName: pickBandoriRegionalText(record.bandName, server, server)
        ?? options.unknownBand,
      type: resolveSongType(record.tag),
      publishedAt,
      difficultyLevels,
      searchText: collectSearchText(record, songId),
    }];
  });
}

function selectedLevels(
  entry: BandoriSongCatalogEntry,
  difficulty: BandoriSongDifficultyFilter,
): number[] {
  if (difficulty === "all") return Object.values(entry.difficultyLevels);
  const level = entry.difficultyLevels[difficulty];
  return level === undefined ? [] : [level];
}

function sortLevel(
  entry: BandoriSongCatalogEntry,
  difficulty: BandoriSongDifficultyFilter,
): number {
  const levels = selectedLevels(entry, difficulty);
  return levels.length > 0 ? Math.max(...levels) : 0;
}

export function filterBandoriSongCatalog(
  catalog: readonly BandoriSongCatalogEntry[],
  filter: BandoriSongsPageFilter,
): BandoriSongCatalogEntry[] {
  const query = filter.query.trim().toLocaleLowerCase();
  const shouldFilterBands = filter.bands.length < BANDORI_SONG_BAND_FILTERS.length;
  const shouldFilterTypes = filter.types.length < BANDORI_SONG_TYPES.length;
  const direction = filter.sortDirection === "asc" ? 1 : -1;

  return catalog.filter((entry) => {
    if (query && !entry.searchText.includes(query)) return false;
    if (shouldFilterBands && !filter.bands.includes(entry.bandFilter)) return false;
    if (
      shouldFilterTypes
      && (entry.type === "other" || !filter.types.includes(entry.type))
    ) {
      return false;
    }
    const levels = selectedLevels(entry, filter.difficulty);
    if (levels.length === 0) return false;
    return levels.some((level) => (
      (filter.minLevel === null || level >= filter.minLevel)
      && (filter.maxLevel === null || level <= filter.maxLevel)
    ));
  }).sort((left, right) => {
    let comparison = 0;
    if (filter.sortBy === "title") comparison = left.title.localeCompare(right.title);
    else if (filter.sortBy === "level") {
      comparison = sortLevel(left, filter.difficulty) - sortLevel(right, filter.difficulty);
    } else if (filter.sortBy === "id") comparison = left.songId - right.songId;
    else comparison = left.publishedAt - right.publishedAt;
    return comparison * direction || left.songId - right.songId;
  });
}

function parseBandSelection(rawValue: string | null): BandoriSongBandFilter[] {
  if (rawValue === null) return [...BANDORI_SONG_BAND_FILTERS];
  const available = new Set<string>(BANDORI_SONG_BAND_FILTERS.map(String));
  return [...new Set(rawValue.split(",").flatMap((value) => {
    if (!available.has(value)) return [];
    return [value === "other" ? "other" : Number(value) as BandoriSongBandFilter];
  }))];
}

function parseTypeSelection(rawValue: string | null): BandoriSongType[] {
  if (rawValue === null) return [...BANDORI_SONG_TYPES];
  const available = new Set<string>(BANDORI_SONG_TYPES);
  return [...new Set(rawValue.split(",").filter(
    (value): value is BandoriSongType => available.has(value),
  ))];
}

export function parseBandoriSongsPageFilter(
  searchParams: URLSearchParams,
): BandoriSongsPageFilter {
  const rawDifficulty = searchParams.get("difficulty");
  const difficulty = BANDORI_SONG_DIFFICULTY_FILTERS.includes(
    rawDifficulty as BandoriSongDifficultyFilter,
  ) ? rawDifficulty as BandoriSongDifficultyFilter : "all";
  const rawSort = searchParams.get("sort");
  const sortBy = BANDORI_SONG_SORTS.includes(rawSort as BandoriSongSort)
    ? rawSort as BandoriSongSort
    : "release";

  return {
    query: searchParams.get("q") ?? "",
    bands: parseBandSelection(searchParams.get("bands")),
    types: parseTypeSelection(searchParams.get("types")),
    difficulty,
    minLevel: parsePositiveInteger(searchParams.get("minLevel")),
    maxLevel: parsePositiveInteger(searchParams.get("maxLevel")),
    sortBy,
    sortDirection: searchParams.get("direction") === "asc" ? "asc" : "desc",
  };
}
