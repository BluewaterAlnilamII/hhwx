import {
  OURNOTES_MAX_JSON_BYTES, ourNotesHash, ourNotesId, ourNotesInteger, ourNotesRecord,
  ourNotesSize, ourNotesString, ourNotesTimestamp, requireOurNotes, type OurNotesServer, type OurNotesText,
} from "../master-contract";
import { CARD_TYPES, GEKISOU_MISSION_TYPES, MUSIC_TYPES, RESOURCE_TYPES } from "../api-enums";
import type { OurNotesBand } from "../catalogs-contract";

export const OURNOTES_MUSIC_API_PREFIX = "ournotes/master/music-v1/api";
export const OURNOTES_MUSIC_API_POINTER_KEY = `${OURNOTES_MUSIC_API_PREFIX}/active.json`;
export type OurNotesMusicDataset = "music" | "musicDetails";
export type OurNotesMusicPack = {
  key: string; compressedSha256: string; compressedSize: number;
  semanticSha256: string; jsonSha256: string; jsonSize: number; recordCount: number;
};
type Row = Record<string, unknown>;
type Slots<T> = [T, T, T, T, T];
type Extension<T> = { [K in keyof T]?: T[K] | null };
type Regional<T> = T & { serverExtensions?: Slots<Extension<T> | null> };
const SCORE_RANKS = ["None", "E", "D", "C", "B", "A", "S", "SS"] as const;
const COMBO_TYPES = ["Quarter", "Half", "ThreeQuarters", "Full"] as const;
const SUMMARY_ORDER = [
  "sortOrder", "musicTitle", "bandIds", "bandName", "vocalCharacterIds", "musicType", "musicCategories",
  "bestMusicTagIds", "startAt", "gekisouMission1", "gekisouMission2", "gekisouMission3",
  "difficulty", "length", "bpm", "serverExtensions",
] as const;
const DETAIL_ORDER = [
  "sortOrder", "musicTitle", "ruby", "phonetic", "lyricist", "composer", "arranger", "bandIds", "bandName",
  "vocalCharacterIds", "musicType", "musicCategories", "bestMusicTagIds", "startAt",
  "defaultUnlock", "acquisition", "difficulty", "gekisouMission1", "gekisouMission2",
  "gekisouMission3", "scoreRanks", "scoreRewards", "comboRewards", "resources",
  "anotherVocalIds", "anotherVocals", "musicVideoIds", "musicVideos", "releaseEffects", "performance",
  "length", "bpm", "serverExtensions",
] as const;

export function parseOurNotesMusicPointer(value: unknown) {
  const row = ourNotesRecord(value);
  requireOurNotes(row.schema === "ournotes-music-api-pointer-v1");
  ourNotesInteger(row.generation, 1);
  const raw = ourNotesRecord(row.datasets);
  const datasets = {} as Record<OurNotesMusicDataset, OurNotesMusicPack>;
  for (const name of ["music", "musicDetails"] as const) {
    const pack = ourNotesRecord(raw[name]);
    const compressedSha256 = ourNotesHash(pack.compressedSha256);
    const semanticSha256 = ourNotesHash(pack.semanticSha256);
    const key = `${OURNOTES_MUSIC_API_PREFIX}/packs/${name}/${compressedSha256}.json.gz`;
    requireOurNotes(pack.key === key);
    datasets[name] = {
      key, compressedSha256, compressedSize: ourNotesSize(pack.compressedSize), semanticSha256,
      jsonSha256: semanticSha256, jsonSize: ourNotesSize(pack.jsonSize), recordCount: ourNotesInteger(pack.recordCount),
    };
  }
  requireOurNotes(datasets.music.recordCount === datasets.musicDetails.recordCount);
  return { datasets };
}

function array<T>(value: unknown, parse: (value: unknown) => T): T[] {
  requireOurNotes(Array.isArray(value));
  return value.map(parse);
}
function slots<T>(value: unknown, parse: (value: unknown) => T): Slots<T> {
  const result = array(value, parse);
  requireOurNotes(result.length === 5);
  return result as Slots<T>;
}
function boolean(value: unknown): boolean {
  requireOurNotes(typeof value === "boolean");
  return value;
}
function finite(value: unknown): number {
  requireOurNotes(typeof value === "number" && Number.isFinite(value));
  return value;
}
function nonnegative(value: unknown): number {
  const number = finite(value);
  requireOurNotes(number >= 0);
  return number;
}
function integer(value: unknown): number {
  return ourNotesInteger(value, Number.MIN_SAFE_INTEGER);
}
function enumName<T extends string>(value: unknown, names: Readonly<Partial<Record<number, T>>>): T | number {
  const code = ourNotesInteger(value);
  return names[code] ?? code;
}
function fields<K extends string, T>(row: Row, keys: readonly K[], parse: (value: unknown) => T): Partial<Record<K, T>> {
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(row, key)).map((key) => [key, parse(row[key])])) as Partial<Record<K, T>>;
}
function numbers<K extends string>(row: Row, keys: readonly K[]) { return fields(row, keys, integer); }
function strings<K extends string>(row: Row, keys: readonly K[]) { return fields(row, keys, ourNotesString); }
function times<K extends string>(row: Row, keys: readonly K[]) { return fields(row, keys, ourNotesTimestamp); }
function flags<K extends string>(row: Row, keys: readonly K[]) { return fields(row, keys, boolean); }
function ids(value: unknown) { return array(value, (v) => ourNotesInteger(v)); }
function references<K extends string>(row: Row, names: Record<K, string>): Partial<Record<K, number>> {
  return Object.fromEntries(Object.entries<string>(names).filter(([, key]) => Object.hasOwn(row, key))
    .map(([key, source]) => [key, ourNotesInteger(row[source])])) as Partial<Record<K, number>>;
}
function ordered<T extends object>(row: T, order: readonly string[]): T {
  return Object.fromEntries(order.filter((key) => Object.hasOwn(row, key)).map((key) => [key, (row as Row)[key]])) as T;
}
function collection<T>(row: Row, key: string, parse: (value: unknown) => T): T[] | undefined {
  return Object.hasOwn(row, key) ? array(row[key], parse) : undefined;
}
function present<T extends object>(row: T): T {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined)) as T;
}

function difficulty(value: unknown, detail: boolean) {
  return Object.fromEntries(Object.entries(ourNotesRecord(value)).map(([key, value]) => {
    requireOurNotes(/^[0-3]$/u.test(key));
    const row = ourNotesRecord(value);
    const scoreId = ourNotesInteger(row.scoreId, 1);
    if (row.missing === true) {
      requireOurNotes(!Object.hasOwn(row, "data"));
      return [key, { scoreId, missing: true as const }];
    }
    requireOurNotes(!Object.hasOwn(row, "missing"));
    const data = ourNotesRecord(row.data);
    requireOurNotes(ourNotesInteger(data.id, 1) === scoreId);
    return [key, {
      scoreId, ...fields(data, ["musicScoreLevel"], (v) => ourNotesInteger(v)),
      ...fields(data, ["musicScoreDisplayLevel"], nonnegative),
      ...fields(data, ["fullComboCount"], (v) => ourNotesInteger(v)),
      ...(detail ? strings(data, ["musicScoreTextFileName"]) : {}),
    }];
  }));
}
function assetMetadata(value: unknown) {
  const row = ourNotesRecord(value);
  const bpm = Object.fromEntries(Object.entries(ourNotesRecord(row.bpm)).map(([key, value]) => {
    requireOurNotes(/^[0-3]$/u.test(key));
    const chart = ourNotesRecord(value);
    requireOurNotes(chart.ticksPerBeat === 480);
    let previous = -1;
    const events = array(chart.events, (value) => {
      const event = ourNotesRecord(value);
      const t = ourNotesInteger(event.t);
      const bpm = finite(event.bpm);
      requireOurNotes(t >= previous && bpm > 0);
      previous = t;
      return { t, bpm, ...Object.fromEntries(Object.entries(event).filter(([key]) => key !== "t" && key !== "bpm")) };
    });
    requireOurNotes(events.length > 0);
    return [key, { events }];
  }));
  return { ...fields(row, ["length"], (value) => {
    const length = finite(value);
    requireOurNotes(length > 0);
    return length;
  }), bpm };
}

const RELATED_TEXT_FIELDS = {
  video: "displayNameTextId", exchange: "nameTextId", chapters: "nameTextId",
  episodes: "descriptionTextId", missions: "descriptionTextId",
} as const;
type TextKind = keyof typeof RELATED_TEXT_FIELDS;
function relatedTexts(regions: Slots<Row | null>) {
  const catalogs = regions.map((region) => {
    const rows = new Map<string, string>();
    function add(kind: TextKind, value: unknown) {
      const row = ourNotesRecord(value);
      const key = `${kind}:${ourNotesInteger(row.id, 1)}`;
      const rawText = ourNotesRecord(row.texts ?? {})[RELATED_TEXT_FIELDS[kind]];
      const text = rawText === undefined ? "" : ourNotesString(rawText);
      const previous = rows.get(key);
      requireOurNotes(previous === undefined || previous === text);
      rows.set(key, text);
    }
    function addAll(kind: TextKind, values: unknown) { if (values !== undefined) array(values, (v) => add(kind, v)); }
    if (region) {
      addAll("video", region.musicVideos);
      if (region.acquisition !== undefined) array(region.acquisition, (value) => {
        const row = ourNotesRecord(value);
        if (row.type === "exchange" && row.exchange !== undefined) add("exchange", row.exchange);
        if (row.type === "story") { addAll("chapters", row.chapters); addAll("episodes", row.episodes); }
        if (row.type === "mission") addAll("missions", row.missions);
      });
    }
    return rows;
  });
  return (kind: TextKind, row: Row): OurNotesText => {
    const key = `${kind}:${ourNotesInteger(row.id, 1)}`;
    return catalogs.map((catalog) => catalog.get(key) ?? "") as OurNotesText;
  };
}
type RelatedText = ReturnType<typeof relatedTexts>;
function rootText(row: Row, key: string): OurNotesText {
  const value = ourNotesRecord(row.texts)[key];
  return value === undefined ? ["", "", "", "", ""] : slots(value, ourNotesString);
}
function summary(row: Row, assets: ReturnType<typeof assetMetadata>) {
  return present({
    ...numbers(row, ["sortOrder"]), musicTitle: rootText(row, "titleTextID"),
    bandIds: row.bandIDs === undefined ? undefined : ids(row.bandIDs), bandName: rootText(row, "bandNameTextID"),
    vocalCharacterIds: row.vocalCharacterIDs === undefined ? undefined : ids(row.vocalCharacterIDs),
    musicType: row.musicType === undefined ? undefined : enumName(row.musicType, MUSIC_TYPES),
    musicCategories: row.musicCategories === undefined ? undefined : ids(row.musicCategories),
    bestMusicTagIds: row.bestMusicTagIDs === undefined ? undefined : ids(row.bestMusicTagIDs),
    startAt: row.startAt === undefined ? null : ourNotesTimestamp(row.startAt),
    ...fields(row, ["gekisouMission1", "gekisouMission2", "gekisouMission3"], (v) => enumName(v, GEKISOU_MISSION_TYPES)),
    difficulty: difficulty(row.difficulties, false), ...assets,
  });
}
function reward(value: unknown) {
  const row = ourNotesRecord(value);
  return { resourceType: enumName(row.resourceType, RESOURCE_TYPES), resourceId: ourNotesInteger(row.resourceId), resourceCount: ourNotesInteger(row.resourceCount) };
}
function video(value: unknown, text: RelatedText) {
  const row = ourNotesRecord(value);
  return {
    id: ourNotesInteger(row.id, 1), displayName: text("video", row), ...strings(row, ["assetName"]),
  };
}
function acquisition(value: unknown, text: RelatedText) {
  const row = ourNotesRecord(value);
  if (row.type === "exchange") {
    const product = ourNotesRecord(row.product);
    const exchange = row.exchange === undefined ? undefined : ourNotesRecord(row.exchange);
    return present({
      type: "exchange" as const,
      product: {
        id: ourNotesInteger(product.id, 1), ...numbers(product, ["exchangeId"]), ...reward(product),
        ...numbers(product, ["paymentResourceCount"]), ...fields(product, ["paymentSteps", "paymentStepResourceCounts"], ids),
        ...numbers(product, ["limitCount", "resetType"]), ...times(product, ["startAt", "endAt"]),
      },
      exchange: exchange && {
        id: ourNotesInteger(exchange.id, 1), name: text("exchange", exchange),
        ...fields(exchange, ["paymentResourceType"], (v) => enumName(v, RESOURCE_TYPES)),
        ...numbers(exchange, ["paymentResourceId"]), ...times(exchange, ["startAt", "endAt"]),
      },
    });
  }
  if (row.type === "story") return present({
    type: "story" as const, reward: reward(row.reward),
    chapters: collection(row, "chapters", (value) => {
      const chapter = ourNotesRecord(value);
      return {
        chapterId: ourNotesInteger(chapter.id, 1), name: text("chapters", chapter),
        ...numbers(chapter, ["bandId"]), ...flags(chapter, ["isSpecialStory"]), ...times(chapter, ["startAt", "endAt"]),
      };
    }),
    episodes: collection(row, "episodes", (value) => {
      const episode = ourNotesRecord(value);
      return {
        episodeId: ourNotesInteger(episode.id, 1), ...numbers(episode, ["chapterId", "episodeNumber", "advId"]),
        description: text("episodes", episode), ...times(episode, ["startAt", "endAt"]),
        ...flags(episode, ["isAnotherEpisode", "isExtraEpisode"]),
        ...numbers(episode, ["unlockEpisodeNumber", "eventPoint", "characterId", "characterRank", "playerRank", "bandRank", "storyFriendshipEpisodeId"]),
      };
    }),
  });
  requireOurNotes(row.type === "mission");
  return present({
    type: "mission" as const, reward: reward(row.reward),
    missions: collection(row, "missions", (value) => {
      const mission = ourNotesRecord(value);
      return {
        missionId: ourNotesInteger(mission.id, 1), description: text("missions", mission),
        ...numbers(mission, ["missionCategory", "missionType"]),
        ...numbers(mission, ["achievementCount", "initialValue", "value", "arenaRankId", "bandId", "bandRank"]),
        ...fields(mission, ["cardType"], (v) => enumName(v, CARD_TYPES)),
        ...numbers(mission, ["characterId", "episodeId", "eventId", "exchangeId", "gachaId", "memberCardId", "missionLiveChapterId", "missionLiveStageId",
          "musicDifficulty", "musicId", "notesJudgement", "scoreRank", "storyChapterId", "supportCardId"]),
        ...times(mission, ["startAt", "endAt", "loginTimeStartAt", "loginTimeEndAt"]),
      };
    }),
  });
}

function performance(row: Row) {
  return {
    ...references(row, { liveMusicPenLightColorId: "liveMusicPenLightColorID", musicLightColorIdNormal: "musicLightColorIDNormal", musicLightColorIdChorus: "musicLightColorIDChorus" }),
    ...numbers(row, ["lazerLightMotionNormal", "lazerLightMotionChorus", "stageLightMotionNormal", "stageLightMotionChorus", "vjVideoPattern", "backgroundCameraType", "gekisouCallSe"]),
  };
}
function resources(row: Row) {
  const source = row.resources === undefined ? {} : ourNotesRecord(row.resources);
  const sound = row.sound === undefined ? {} : ourNotesRecord(row.sound);
  const sheet = row.soundCueSheet === undefined ? {} : ourNotesRecord(row.soundCueSheet);
  const audio = source.audio === undefined ? {} : ourNotesRecord(source.audio);
  return {
    ...strings(source, ["jacketAssetName"]),
    audio: {
      ...references(row, { musicSoundId: "musicSoundID" }), ...references(sound, { soundCueSheetId: "soundCueSheetID" }),
      ...strings({ ...audio, ...sheet }, ["cueSheetName"]), ...strings({ ...audio, ...sound }, ["cueName"]),
    },
  };
}
function detail(row: Row, assets: ReturnType<typeof assetMetadata>, text: RelatedText) {
  return ordered(present({
    ...summary(row, assets), ruby: rootText(row, "rubyTitleTextID"), phonetic: rootText(row, "phoneticTextID"),
    lyricist: rootText(row, "lyricistTextID"), composer: rootText(row, "composerTextID"), arranger: rootText(row, "arrangerTextID"),
    ...flags(row, ["defaultUnlock"]),
    acquisition: collection(row, "acquisition", (v) => acquisition(v, text)),
    difficulty: difficulty(row.difficulties, true),
    scoreRanks: collection(row, "scoreRanks", (value) => {
      const rank = ourNotesRecord(value);
      return { liveScoreRank: enumName(rank.liveScoreRank, SCORE_RANKS), ...numbers(rank, ["requiredScore", "battleLiveRequiredScore"]) };
    }),
    scoreRewards: collection(row, "scoreRewards", (value) => ({ liveScoreRank: enumName(ourNotesRecord(value).liveScoreRank, SCORE_RANKS), ...reward(value) })),
    comboRewards: collection(row, "comboRewards", (value) => {
      const combo = ourNotesRecord(value);
      return { difficulty: ourNotesInteger(combo.difficulty), comboRateType: enumName(combo.comboRateType, COMBO_TYPES), ...numbers(combo, ["requiredCombo"]), ...reward(combo) };
    }),
    resources: resources(row), anotherVocalIds: row.anotherVocalIDs === undefined ? undefined : ids(row.anotherVocalIDs),
    anotherVocals: collection(row, "anotherVocals", (value) => {
      const vocal = ourNotesRecord(value);
      return present({ id: ourNotesInteger(vocal.id, 1), vocalCharacterIds: vocal.vocalCharacterIDs === undefined ? undefined : ids(vocal.vocalCharacterIDs),
        ...references(vocal, { musicSoundId: "musicSoundID", unlockConditionId: "unlockConditionID" }), ...times(vocal, ["startAt"]) });
    }),
    musicVideoIds: row.musicVideoIDs === undefined ? undefined : ids(row.musicVideoIDs), musicVideos: collection(row, "musicVideos", (v) => video(v, text)),
    releaseEffects: collection(row, "releaseEffects", (value) => {
      const effect = ourNotesRecord(value);
      requireOurNotes(effect.liveMusicId === row.id);
      return { id: ourNotesInteger(effect.id, 1), ...numbers(effect, ["difficulty", "releaseEffectType"]), ...times(effect, ["startAt", "endAt"]) };
    }),
    performance: performance(row),
  }), DETAIL_ORDER);
}

export type OurNotesMusicSummary = Regional<ReturnType<typeof summary>>;
export type OurNotesMusicDetail = Regional<ReturnType<typeof detail>>;
export type OurNotesMusicRecord = OurNotesMusicSummary | OurNotesMusicDetail;

export function fillOurNotesMusicBandName<T extends OurNotesMusicRecord>(record: T, bands: Record<string, OurNotesBand>): T {
  const bandName = record.serverExtensions!.map((extension, slot) => {
    if (extension === null) return "";
    if (record.bandName[slot]) return record.bandName[slot];
    const bandIds = Object.hasOwn(extension, "bandIds") ? extension.bandIds : record.bandIds;
    const names = (bandIds ?? []).map((id) => bands[String(id)]?.bandName[slot] ?? "");
    return names.every(Boolean) ? names.join(" / ") : "";
  }) as OurNotesText;
  return { ...record, bandName };
}

function projectMusic(value: unknown, id: string, isDetail: boolean): OurNotesMusicRecord {
  const row = ourNotesRecord(value);
  requireOurNotes(ourNotesInteger(row.id, 1) === Number(id));
  const available = slots(row.available, boolean);
  const extensions = slots(row.serverExtensions, (v) => v === null ? null : ourNotesRecord(v));
  requireOurNotes(available.some(Boolean));
  for (const value of Object.values(ourNotesRecord(row.texts))) {
    const text = slots(value, ourNotesString);
    requireOurNotes(text.every((v, slot) => available[slot] || v === ""));
  }
  const regions = extensions.map((extension, slot) => {
    requireOurNotes(available[slot] === (extension !== null));
    if (extension === null) return null;
    const copy = { ...row };
    delete copy.serverExtensions; delete copy.available;
    for (const [key, value] of Object.entries(extension)) {
      requireOurNotes(!["id", "texts", "assets", "available", "serverExtensions", "__proto__", "constructor", "prototype"].includes(key));
      if (value === null) delete copy[key]; else copy[key] = value;
    }
    return copy;
  }) as Slots<Row | null>;
  const assets = assetMetadata(row.assets);
  const text = isDetail ? relatedTexts(regions) : undefined;
  const projected = regions.map((row) => row === null ? null : isDetail ? detail(row, assets, text!) : summary(row, assets));
  const base = projected.find((row) => row !== null)!;
  const order = isDetail ? DETAIL_ORDER : SUMMARY_ORDER;
  const publicExtensions = projected.map((row) => row === null ? null : Object.fromEntries(order
    .filter((key) => key !== "serverExtensions" && JSON.stringify((base as Row)[key]) !== JSON.stringify((row as Row)[key]))
    .map((key) => [key, (row as Row)[key] ?? null])));
  return { ...base, serverExtensions: publicExtensions } as OurNotesMusicRecord;
}
export function parseOurNotesMusicMap(value: unknown, descriptor: OurNotesMusicPack, dataset: OurNotesMusicDataset): Record<string, OurNotesMusicRecord> {
  const entries = Object.entries(ourNotesRecord(value));
  requireOurNotes(entries.length === descriptor.recordCount);
  return Object.fromEntries(entries.map(([id, row]) => {
    requireOurNotes(ourNotesId(id));
    return [id, projectMusic(row, id, dataset === "musicDetails")];
  }));
}
export function selectOurNotesMusic<T extends OurNotesMusicRecord>(record: T, server: OurNotesServer | undefined, dataset: OurNotesMusicDataset): T | null {
  if (server === undefined) return record;
  const extension = record.serverExtensions![server];
  if (extension === null) return null;
  const copy = { ...record } as Row;
  delete copy.serverExtensions;
  for (const [key, value] of Object.entries(extension)) {
    if (value === null && key !== "startAt") delete copy[key]; else copy[key] = value;
  }
  return ordered(copy, dataset === "music" ? SUMMARY_ORDER : DETAIL_ORDER) as T;
}

export { OURNOTES_MAX_JSON_BYTES as OURNOTES_MUSIC_MAX_JSON_BYTES };
