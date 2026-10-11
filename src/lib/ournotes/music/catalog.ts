import { compareSearchValue, normalizeSearchText, SEARCH_SERVER_ALIASES, tokenizeSearch } from "@/lib/catalog-search";
import { SONG_DIFFICULTY_ALIASES, parseSongPositiveInteger } from "@/lib/song-search";
import type { OurNotesBand } from "../catalogs-contract";
import { OURNOTES_SLOTS, type OurNotesServer } from "../master-contract";
import { OURNOTES_SERVERS, OURNOTES_SERVER_CODES, getOurNotesServerFromCode, pickAvailableOurNotesServer } from "../server";
import { OURNOTES_SEARCH_BAND_ALIASES } from "../search";
import { selectOurNotesMusic, type OurNotesMusicRecord, type OurNotesMusicSummary } from "./api-contract";

export const OURNOTES_SONG_DIFFICULTIES = ["easy", "normal", "hard", "expert"] as const;
export const OURNOTES_SONG_CATEGORIES = [1, 2, 3, 4, 5, 6] as const;
export const OURNOTES_SONG_SORTS = ["id", "title", "level", "release_jp", "release_en", "release_tw", "release_cn", "release_kr"] as const;
export type OurNotesSongDifficulty = typeof OURNOTES_SONG_DIFFICULTIES[number];
export type OurNotesSongBandFilter = number | "other";
export type OurNotesSongFilter = {
  query: string; servers: OurNotesServer[]; bands: OurNotesSongBandFilter[]; types: number[]; difficulties: OurNotesSongDifficulty[];
  minLevel: number | null; maxLevel: number | null; sortBy: typeof OURNOTES_SONG_SORTS[number]; sortDirection: "asc" | "desc";
};
export type OurNotesSongChart = { difficulty: OurNotesSongDifficulty; level: number | null; sortLevel: number | null; combo: number | null; bpmValues: number[] };
export type OurNotesSongEntry = {
  songId: number; title: string; bandName: string; bandIds: number[]; categories: number[]; servers: OurNotesServer[];
  releaseAt: number | null; releaseAtByServer: (number | null)[]; charts: OurNotesSongChart[]; searchNames: string[]; searchText: string;
};

export function isOurNotesSongDifficulty(value: string): value is OurNotesSongDifficulty {
  return (OURNOTES_SONG_DIFFICULTIES as readonly string[]).includes(value);
}

export function resolveOurNotesSong<T extends OurNotesMusicRecord>(record: T, preferred: OurNotesServer): { server: OurNotesServer; music: T } | null {
  const available = OURNOTES_SERVERS.filter((server) => record.serverExtensions?.[server] != null);
  const server = pickAvailableOurNotesServer(available, preferred);
  if (server === null) return null;
  return { server, music: selectOurNotesMusic(record, server, "resources" in record ? "musicDetails" : "music")! };
}

export function buildOurNotesSongDetail(record: OurNotesMusicRecord) {
  return {
    durationSeconds: record.length ?? null,
    regions: OURNOTES_SERVERS.map((server) => {
      const music = selectOurNotesMusic(record, server, "music");
      return music ? { title: music.musicTitle[0] || music.musicTitle[server], bandName: music.bandName[server], charts: ourNotesSongCharts(music),
        attribute: music.musicType ?? null,
        missions: [music.gekisouMission1 ?? null, music.gekisouMission2 ?? null, music.gekisouMission3 ?? null],
      } : null;
    }),
  };
}
export type OurNotesSongDetail = ReturnType<typeof buildOurNotesSongDetail>;

export function ourNotesSongCharts(music: OurNotesMusicRecord): OurNotesSongChart[] {
  return OURNOTES_SONG_DIFFICULTIES.flatMap((difficulty, index) => {
    const score = music.difficulty[String(index)];
    if (!score) return [];
    const sortLevel = "missing" in score ? null : score.musicScoreDisplayLevel ?? null;
    return [{ difficulty, sortLevel, level: sortLevel === null ? null : Math.trunc(sortLevel),
      combo: "missing" in score ? null : score.fullComboCount ?? null,
      bpmValues: music.bpm[String(index)]?.events.map((event) => event.bpm) ?? [],
    }];
  });
}

export function buildOurNotesSongCatalog(records: Record<string, OurNotesMusicSummary>, preferred: OurNotesServer): OurNotesSongEntry[] {
  return Object.entries(records).flatMap(([id, record]) => {
    const resolved = resolveOurNotesSong(record, preferred);
    if (!resolved) return [];
    const { server, music } = resolved;
    const releaseAtByServer = OURNOTES_SERVERS.map((slot) => {
      const regional = selectOurNotesMusic(record, slot, "music");
      return regional?.startAt == null ? null : Number(regional.startAt);
    });
    const releases = releaseAtByServer.filter((value): value is number => value !== null && value > 0);
    return [{ songId: Number(id), title: music.musicTitle[0] || music.musicTitle[server], bandName: music.bandName[server],
      bandIds: music.bandIds ?? [], categories: music.musicCategories ?? [],
      servers: OURNOTES_SERVERS.filter((slot) => record.serverExtensions?.[slot] != null),
      releaseAt: releases.length ? Math.min(...releases) : null, releaseAtByServer, charts: ourNotesSongCharts(music),
      searchNames: music.musicTitle.map(normalizeSearchText),
      searchText: [...music.musicTitle, ...music.bandName].map(normalizeSearchText).join("\n"),
    }];
  });
}

export function ourNotesSongBandFilters(bands: Record<string, OurNotesBand>): OurNotesSongBandFilter[] {
  return [...Object.keys(bands).map(Number).sort((a, b) => a - b), "other"];
}

function selection<T extends string | number>(raw: string | null, values: readonly T[]): T[] {
  return raw === null ? [...values] : values.filter((value) => raw.split(",").includes(String(value)));
}

export function parseOurNotesSongFilter(query: string, bands: readonly OurNotesSongBandFilter[]): OurNotesSongFilter {
  const params = new URLSearchParams(query);
  const available = params.get("available");
  const sort = params.get("sort");
  return {
    query: params.get("q") ?? "",
    servers: available === null ? [...OURNOTES_SERVERS] : [...new Set(available.split(",").flatMap((value) => {
      const slot = getOurNotesServerFromCode(value);
      return slot === null ? [] : [slot];
    }))],
    bands: selection(params.get("bands"), bands), types: selection(params.get("types"), OURNOTES_SONG_CATEGORIES),
    difficulties: selection(params.get("difficulty"), OURNOTES_SONG_DIFFICULTIES),
    minLevel: parseSongPositiveInteger(params.get("minLevel")), maxLevel: parseSongPositiveInteger(params.get("maxLevel")),
    sortBy: OURNOTES_SONG_SORTS.includes(sort as OurNotesSongFilter["sortBy"]) ? sort as OurNotesSongFilter["sortBy"] : "id",
    sortDirection: params.get("direction") === "asc" ? "asc" : "desc",
  };
}

export function updateOurNotesSongsQuery(query: string, patch: Partial<OurNotesSongFilter>, bands: readonly OurNotesSongBandFilter[]): string {
  const filter = { ...parseOurNotesSongFilter(query, bands), ...patch };
  const params = new URLSearchParams(query);
  params.delete("server");
  function set(key: string, value: string, omit: boolean) { if (omit) params.delete(key); else params.set(key, value); }
  function list<T extends string | number>(key: string, values: readonly T[], defaults: readonly T[]) {
    set(key, values.join(","), values.length === defaults.length && defaults.every((value) => values.includes(value)));
  }
  set("q", filter.query.trim(), !filter.query.trim());
  list("available", filter.servers.map((slot) => OURNOTES_SLOTS[slot]), OURNOTES_SLOTS);
  list("bands", filter.bands, bands); list("types", filter.types, OURNOTES_SONG_CATEGORIES);
  list("difficulty", filter.difficulties, OURNOTES_SONG_DIFFICULTIES);
  set("minLevel", String(filter.minLevel), filter.minLevel === null); set("maxLevel", String(filter.maxLevel), filter.maxLevel === null);
  set("sort", filter.sortBy, filter.sortBy === "id"); set("direction", filter.sortDirection, filter.sortDirection === "desc");
  return params.toString();
}

const CATEGORY_ALIASES: Record<number, string[]> = {
  1: ["original", "og", "原创", "原創", "オリジナル"], 2: ["virtual", "虚拟歌手", "虛擬歌手", "バーチャル"],
  3: ["jpop", "j-pop", "j pop"], 4: ["anime", "动画", "動畫", "アニメ"],
  5: ["game", "游戏", "遊戲", "ゲーム"], 6: ["anotherband", "another band"],
};

export function filterOurNotesSongs(entries: readonly OurNotesSongEntry[], filter: OurNotesSongFilter, bands: Record<string, OurNotesBand>): OurNotesSongEntry[] {
  type Condition = (entry: OurNotesSongEntry, difficulty: OurNotesSongDifficulty | null, level: number | null) => boolean;
  const keywords = new Map<string, Condition[]>();
  const bandFilters = ourNotesSongBandFilters(bands);
  const matchesBand = (entry: OurNotesSongEntry, band: OurNotesSongBandFilter) => band === "other"
    ? !entry.bandIds.some((id) => Object.hasOwn(bands, id)) : entry.bandIds.includes(band);
  function add(names: readonly string[], predicate: Condition) {
    for (const name of names.map(normalizeSearchText).filter(Boolean)) keywords.set(name, [...(keywords.get(name) ?? []), predicate]);
  }
  for (const [id, band] of Object.entries(bands)) add([...band.bandName, ...(OURNOTES_SEARCH_BAND_ALIASES[Number(id)] ?? [])], (entry) => entry.bandIds.includes(Number(id)));
  add(["other", "others", "其他"], (entry) => matchesBand(entry, "other"));
  for (const slot of OURNOTES_SERVERS) add([...SEARCH_SERVER_ALIASES[OURNOTES_SERVER_CODES[slot]], OURNOTES_SLOTS[slot]], (entry) => entry.servers.includes(slot));
  for (const [id, names] of Object.entries(CATEGORY_ALIASES)) add(names, (entry) => entry.categories.includes(Number(id)));
  const difficultyRanks = new Map<string, number>(OURNOTES_SONG_DIFFICULTIES.flatMap((difficulty, rank) => SONG_DIFFICULTY_ALIASES[difficulty].map((alias) => [alias, rank] as const)));
  const phrases = [...keywords.keys()].filter((name) => name.includes(" ")).map((name) => name.split(" ")).sort((a, b) => b.length - a.length);
  const compare = (candidate: number | null, value: number, operator: string) => candidate !== null && (operator ? compareSearchValue(candidate, value, operator) : candidate === value);
  const conditions = tokenizeSearch(filter.query, phrases).map(({ value: token, nameOnly }): Condition => {
    if (nameOnly) return (entry) => token !== "" && entry.searchNames.some((name) => name.includes(token));
    const explicitId = /^#(\d+)$/u.exec(token);
    if (explicitId) return (entry) => entry.songId === parseSongPositiveInteger(explicitId[1]);
    const range = /^(>=|<=|>|<)?(.+?)([+-])?$/u.exec(token);
    const value = range?.[2] ?? token;
    const rank = difficultyRanks.get(value);
    const level = parseSongPositiveInteger(value);
    if (rank !== undefined || level !== null) {
      if (range?.[1] && range[3]) return () => false;
      const operator = range?.[1] ?? range?.[3] ?? "";
      return rank !== undefined
        ? (_entry, difficulty) => difficulty !== null && compare(OURNOTES_SONG_DIFFICULTIES.indexOf(difficulty), rank, operator)
        : (entry, _difficulty, candidate) => (operator === "" && entry.songId === level) || compare(candidate, level!, operator);
    }
    const predicates = keywords.get(token);
    if (predicates) return (entry, difficulty, level) => predicates.some((predicate) => predicate(entry, difficulty, level));
    if (/^[#<>]|^\d+$|^\d.*[+-]$/u.test(token)) return () => false;
    return (entry) => entry.searchText.includes(token);
  });
  const releaseServer = filter.sortBy.startsWith("release_") ? getOurNotesServerFromCode(filter.sortBy.slice(8)) : null;
  const direction = filter.sortDirection === "asc" ? 1 : -1;
  const sortLevel = (entry: OurNotesSongEntry) => {
    const values = entry.charts.filter((chart) => filter.difficulties.includes(chart.difficulty)).flatMap((chart) => chart.sortLevel === null ? [] : [chart.sortLevel]);
    return values.length ? Math.max(...values) : null;
  };
  return entries.filter((entry) => {
    if (!filter.servers.some((server) => entry.servers.includes(server)) || !filter.difficulties.length) return false;
    if (filter.bands.length < bandFilters.length && !filter.bands.some((band) => matchesBand(entry, band))) return false;
    if (filter.types.length < OURNOTES_SONG_CATEGORIES.length && !filter.types.some((category) => entry.categories.includes(category))) return false;
    const matchesChart = (difficulty: OurNotesSongDifficulty | null, level: number | null) =>
      (filter.minLevel === null || (level !== null && level >= filter.minLevel))
      && (filter.maxLevel === null || (level !== null && level <= filter.maxLevel))
      && conditions.every((condition) => condition(entry, difficulty, level));
    if (!entry.charts.length) return filter.difficulties.length === OURNOTES_SONG_DIFFICULTIES.length && matchesChart(null, null);
    return entry.charts.some((chart) => filter.difficulties.includes(chart.difficulty) && matchesChart(chart.difficulty, chart.level));
  }).sort((left, right) => {
    if (filter.sortBy === "title") return left.title.localeCompare(right.title) * direction || left.songId - right.songId;
    const a = filter.sortBy === "level" ? sortLevel(left) : releaseServer !== null ? left.releaseAtByServer[releaseServer] : left.songId;
    const b = filter.sortBy === "level" ? sortLevel(right) : releaseServer !== null ? right.releaseAtByServer[releaseServer] : right.songId;
    if (a === null || b === null) return a === b ? left.songId - right.songId : a === null ? 1 : -1;
    return (a - b) * direction || left.songId - right.songId;
  });
}
