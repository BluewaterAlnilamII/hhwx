import { BANDORI_CHARACTER_GROUPS } from "@/lib/bandori-character-groups";
import {
  BANDORI_SEARCH_BAND_ALIASES,
  BANDORI_SEARCH_SERVER_ALIASES,
  normalizeBandoriSearchText,
  tokenizeBandoriSearch,
} from "@/lib/bandori/search";
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
  BANDORI_SERVERS,
  getBandoriServerFromCode,
  pickBandoriRegionalText,
  readBandoriRegionalNumberAt,
  type BandoriServer,
} from "@/lib/bandori-server";

export const BANDORI_SONG_TYPES = ["original", "cover", "extra"] as const;
export const BANDORI_SONG_SORTS = [
  "id",
  "title",
  "level",
  "release_jp",
  "release_en",
  "release_tw",
  "release_cn",
] as const;
export const BANDORI_SONG_DIFFICULTY_FILTERS = [...BANDORI_CHART_DIFFICULTIES] as const;
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
  publishedAtServer: BandoriServer;
  publishedAtByServer: readonly [
    number | null,
    number | null,
    number | null,
    number | null,
  ];
  difficultyLevels: Partial<Record<BandoriChartDifficulty, number>>;
  searchText: string;
  searchNames: readonly string[];
};

export type BandoriSongsPageFilter = {
  query: string;
  servers: BandoriServer[];
  bands: BandoriSongBandFilter[];
  types: BandoriSongType[];
  difficulties: BandoriSongDifficultyFilter[];
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

function getSongReleaseSortServer(sortBy: BandoriSongSort): BandoriServer | null {
  return sortBy.startsWith("release_")
    ? getBandoriServerFromCode(sortBy.slice("release_".length))
    : null;
}

function getPublishedAtByServer(
  publishedAt: unknown,
): BandoriSongCatalogEntry["publishedAtByServer"] {
  return [
    readBandoriRegionalNumberAt(publishedAt, BANDORI_SERVERS[0]),
    readBandoriRegionalNumberAt(publishedAt, BANDORI_SERVERS[1]),
    readBandoriRegionalNumberAt(publishedAt, BANDORI_SERVERS[2]),
    readBandoriRegionalNumberAt(publishedAt, BANDORI_SERVERS[3]),
  ];
}

function getFirstRelease(
  publishedAtByServer: BandoriSongCatalogEntry["publishedAtByServer"],
): { timestamp: number; server: BandoriServer } | null {
  return BANDORI_SERVERS.reduce<{ timestamp: number; server: BandoriServer } | null>(
    (earliest, server) => {
      const timestamp = publishedAtByServer[server];
      if (timestamp === null || timestamp <= 0) return earliest;
      return earliest === null || timestamp < earliest.timestamp
        ? { timestamp, server }
        : earliest;
    },
    null,
  );
}

function parsePositiveInteger(value: string | null): number | null {
  if (value === null || !/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
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

function collectSearchText(record: BandoriMusicMasterRecord): string {
  return [
    ...(Array.isArray(record.musicTitle) ? record.musicTitle : []),
    ...(Array.isArray(record.bandName) ? record.bandName : []),
  ].filter((value): value is string => typeof value === "string")
    .map(normalizeBandoriSearchText).join("\n");
}

function resolveSongType(tag: unknown): BandoriSongCatalogType {
  return typeof tag === "string" ? SONG_TAG_TYPE_MAP[tag] ?? "other" : "other";
}

function getDifficultyLevel(
  record: BandoriMusicMasterRecord,
  difficulty: BandoriChartDifficulty,
  availableServers: readonly BandoriServer[],
  now: number,
): number | null {
  const difficultyIndex = String(BANDORI_CHART_DIFFICULTIES.indexOf(difficulty));
  const entry = record.difficulty?.[difficultyIndex];
  if (
    !entry
    || !Number.isSafeInteger(entry.playLevel)
    || (entry.playLevel ?? 0) <= 0
    || !availableServers.some((server) => isDifficultyReleased(entry, server, now))
  ) {
    return null;
  }
  return entry.playLevel as number;
}

export function buildBandoriSongCatalog(
  music: BandoriMusicMasterMap,
  preferredTextServer: BandoriServer,
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
    ) {
      return [];
    }

    const publishedAtByServer = getPublishedAtByServer(record.publishedAt);
    const firstRelease = getFirstRelease(publishedAtByServer);
    if (firstRelease === null) return [];
    const availableServers = BANDORI_SERVERS.filter(
      (server) => publishedAtByServer[server] !== null,
    );
    const difficultyLevels = Object.fromEntries(
      BANDORI_CHART_DIFFICULTIES.flatMap((difficulty) => {
        const level = getDifficultyLevel(record, difficulty, availableServers, now);
        return level === null ? [] : [[difficulty, level]];
      }),
    ) as Partial<Record<BandoriChartDifficulty, number>>;
    if (Object.keys(difficultyLevels).length === 0) return [];

    const bandId = record.bandId as number;
    return [{
      songId,
      bandId,
      bandFilter: MAIN_BAND_ID_SET.has(bandId) ? bandId : "other",
      title: pickBandoriRegionalText(
        record.musicTitle,
        preferredTextServer,
        preferredTextServer,
      )
        ?? options.unknownTitle(songId),
      bandName: pickBandoriRegionalText(
        record.bandName,
        preferredTextServer,
        preferredTextServer,
      )
        ?? options.unknownBand,
      type: resolveSongType(record.tag),
      publishedAt: firstRelease.timestamp,
      publishedAtServer: firstRelease.server,
      publishedAtByServer,
      difficultyLevels,
      searchText: collectSearchText(record),
      searchNames: (Array.isArray(record.musicTitle) ? record.musicTitle : [])
        .filter((value): value is string => typeof value === "string")
        .map(normalizeBandoriSearchText),
    }];
  });
}

function selectedLevels(
  entry: BandoriSongCatalogEntry,
  difficulties: readonly BandoriSongDifficultyFilter[],
): number[] {
  return difficulties.flatMap((difficulty) => {
    const level = entry.difficultyLevels[difficulty];
    return level === undefined ? [] : [level];
  });
}

function sortLevel(
  entry: BandoriSongCatalogEntry,
  difficulties: readonly BandoriSongDifficultyFilter[],
): number {
  const levels = selectedLevels(entry, difficulties);
  return levels.length > 0 ? Math.max(...levels) : 0;
}

const DIFFICULTY_ALIASES: Record<BandoriChartDifficulty, readonly string[]> = {
  easy: ["easy", "ez", "简单", "簡單", "イージー"],
  normal: ["normal", "nm", "普通", "ノーマル"],
  hard: ["hard", "hd", "困难", "困難", "ハード"],
  expert: ["expert", "ex", "专家", "專家", "エキスパート"],
  special: ["special", "sp", "特殊", "スペシャル"],
};
const difficultyRanks = new Map(BANDORI_CHART_DIFFICULTIES.flatMap((difficulty, rank) => (
  DIFFICULTY_ALIASES[difficulty].map((alias) => [alias, rank] as const)
)));

type SongKeywordCondition = (entry: BandoriSongCatalogEntry) => boolean;
const keywordConditions = new Map<string, SongKeywordCondition[]>();
function addKeywords(aliases: readonly string[], condition: SongKeywordCondition) {
  for (const alias of aliases) {
    const key = normalizeBandoriSearchText(alias);
    const conditions = keywordConditions.get(key) ?? [];
    conditions.push(condition);
    keywordConditions.set(key, conditions);
  }
}
for (const [id, aliases] of Object.entries(BANDORI_SEARCH_BAND_ALIASES)) {
  const bandId = Number(id);
  addKeywords(aliases, (entry) => entry.bandId === bandId);
}
addKeywords(["other", "others", "其他"], (entry) => entry.bandFilter === "other");
for (const server of BANDORI_SERVERS) {
  addKeywords(BANDORI_SEARCH_SERVER_ALIASES[server], (entry) => entry.publishedAtByServer[server] !== null);
}
for (const [type, aliases] of Object.entries({
  original: ["og", "original", "原创", "原創", "オリジナル"],
  cover: ["cv", "cover", "anime", "翻唱", "カバー"],
  extra: ["extra", "エキストラ"],
})) addKeywords(aliases, (entry) => entry.type === type);

function matchesSearchRange(value: number, target: number, operator: string): boolean {
  switch (operator) {
    case "+": case ">=": return value >= target;
    case "-": case "<=": return value <= target;
    case ">": return value > target;
    case "<": return value < target;
    default: return value === target;
  }
}

function compileSongSearch(query: string) {
  type Condition = (entry: BandoriSongCatalogEntry, difficulty: BandoriChartDifficulty, level: number) => boolean;
  const conditions: Condition[] = tokenizeBandoriSearch(query).map(({ value: token, nameOnly }): Condition => {
    if (nameOnly) return (entry) => token !== "" && entry.searchNames.some((name) => name.includes(token));
    const explicitId = /^#(\d+)$/u.exec(token);
    if (explicitId) {
      const id = parsePositiveInteger(explicitId[1]);
      return (entry) => entry.songId === id;
    }
    const range = /^(>=|<=|>|<)?(.+?)([+-])?$/u.exec(token);
    const value = range?.[2] ?? token;
    const rank = difficultyRanks.get(value);
    const level = parsePositiveInteger(value);
    if (rank !== undefined || level !== null) {
      if (range?.[1] && range[3]) return () => false;
      const operator = range?.[1] ?? range?.[3] ?? "";
      if (rank !== undefined) {
        return (_entry, difficulty) => matchesSearchRange(BANDORI_CHART_DIFFICULTIES.indexOf(difficulty), rank, operator);
      }
      return (entry, _difficulty, candidateLevel) => (
        (operator === "" && entry.songId === level)
        || matchesSearchRange(candidateLevel, level!, operator)
      );
    }
    const keywords = keywordConditions.get(token);
    if (keywords) return (entry) => keywords.some((condition) => condition(entry));
    if (/^[#<>]|^\d+$|^\d.*[+-]$/u.test(token)) return () => false;
    return (entry) => entry.searchText.includes(token);
  });
  return (entry: BandoriSongCatalogEntry, difficulty: BandoriChartDifficulty, level: number) => (
    conditions.every((condition) => condition(entry, difficulty, level))
  );
}

export function filterBandoriSongCatalog(
  catalog: readonly BandoriSongCatalogEntry[],
  filter: BandoriSongsPageFilter,
): BandoriSongCatalogEntry[] {
  const matchesSearch = compileSongSearch(filter.query);
  const shouldFilterBands = filter.bands.length < BANDORI_SONG_BAND_FILTERS.length;
  const shouldFilterTypes = filter.types.length < BANDORI_SONG_TYPES.length;
  const direction = filter.sortDirection === "asc" ? 1 : -1;
  const releaseServer = getSongReleaseSortServer(filter.sortBy);

  return catalog.filter((entry) => {
    if (!filter.servers.some((server) => entry.publishedAtByServer[server] !== null)) {
      return false;
    }
    if (shouldFilterBands && !filter.bands.includes(entry.bandFilter)) return false;
    if (
      shouldFilterTypes
      && (entry.type === "other" || !filter.types.includes(entry.type))
    ) {
      return false;
    }
    return filter.difficulties.some((difficulty) => {
      const level = entry.difficultyLevels[difficulty];
      return level !== undefined
        && (filter.minLevel === null || level >= filter.minLevel)
        && (filter.maxLevel === null || level <= filter.maxLevel)
        && matchesSearch(entry, difficulty, level);
    });
  }).sort((left, right) => {
    let comparison = 0;
    if (filter.sortBy === "title") comparison = left.title.localeCompare(right.title);
    else if (filter.sortBy === "level") {
      comparison = sortLevel(left, filter.difficulties) - sortLevel(right, filter.difficulties);
    } else if (filter.sortBy === "id") comparison = left.songId - right.songId;
    else if (releaseServer !== null) {
      const leftTimestamp = left.publishedAtByServer[releaseServer] ?? 0;
      const rightTimestamp = right.publishedAtByServer[releaseServer] ?? 0;
      if (leftTimestamp <= 0 || rightTimestamp <= 0) {
        if (leftTimestamp <= 0 && rightTimestamp <= 0) {
          return left.songId - right.songId;
        }
        return leftTimestamp <= 0 ? 1 : -1;
      }
      comparison = leftTimestamp - rightTimestamp;
    }
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

function parseServerSelection(rawValue: string | null): BandoriServer[] {
  if (rawValue === null) return [...BANDORI_SERVERS];
  return [...new Set(rawValue.split(",").flatMap((value) => {
    const server = getBandoriServerFromCode(value);
    return server === null ? [] : [server];
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
  const difficulties = rawDifficulty === null
    ? [...BANDORI_SONG_DIFFICULTY_FILTERS]
    : BANDORI_SONG_DIFFICULTY_FILTERS.filter((difficulty) => rawDifficulty.split(",").includes(difficulty));
  const rawSort = searchParams.get("sort");
  const sortBy = BANDORI_SONG_SORTS.includes(rawSort as BandoriSongSort)
    ? rawSort as BandoriSongSort
    : "id";

  return {
    query: searchParams.get("q") ?? "",
    servers: parseServerSelection(searchParams.get("available")),
    bands: parseBandSelection(searchParams.get("bands")),
    types: parseTypeSelection(searchParams.get("types")),
    difficulties,
    minLevel: parsePositiveInteger(searchParams.get("minLevel")),
    maxLevel: parsePositiveInteger(searchParams.get("maxLevel")),
    sortBy,
    sortDirection: searchParams.get("direction") === "asc" ? "asc" : "desc",
  };
}
