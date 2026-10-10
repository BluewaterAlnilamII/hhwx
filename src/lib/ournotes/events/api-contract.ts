import {
  OURNOTES_MAX_RECORDS, ourNotesHash, ourNotesId, ourNotesInteger,
  ourNotesRecord, ourNotesSize, ourNotesString, ourNotesTimestamp as timestamp, requireOurNotes, type OurNotesText,
} from "../master-contract";
import { RESOURCE_TYPES, CARD_TYPES, MUSIC_TYPES, GEKISOU_MISSION_TYPES } from "../api-enums";

export const OURNOTES_EVENTS_API_PREFIX = "ournotes/master/events-v1/api";
export const OURNOTES_EVENTS_API_POINTER_KEY = `${OURNOTES_EVENTS_API_PREFIX}/active.json`;
export const OURNOTES_EVENTS_MAX_COMPRESSED_BYTES = 32 * 1024 * 1024;
export const OURNOTES_EVENTS_MAX_JSON_BYTES = 128 * 1024 * 1024;
export type OurNotesEventDataset = "events" | "eventDetails";
type Slots<T> = [T, T, T, T, T];
type Regional<T> = Slots<T[] | null>;
type Timestamp = string | null;
type EventTimes = { startAt: Timestamp; endAt: Timestamp; displayEndAt: Timestamp };
type EventAssets = { imageAsset: string; logoAsset: string; backgroundAsset: string; bannerAsset: string };
const ASSET_FIELDS = ["imageAsset", "logoAsset", "backgroundAsset", "bannerAsset"] as const;
const EVENT_TYPES = ["None", "ChallengeLive"] as const;
const EVENT_BONUS_TYPES = ["EventPoint", "EventItem", "ParameterAll", "ParameterPfm", "ParameterTec", "ParameterVis"] as const;
const BONUS_FIELDS = {
  EventPoint: "pointPercent", EventItem: "itemPercent", ParameterAll: "parameterPercent",
  ParameterPfm: "performancePercent", ParameterTec: "technicPercent", ParameterVis: "visualPercent",
} as const;
type ResourceType = typeof RESOURCE_TYPES[keyof typeof RESOURCE_TYPES] | number;
type CardType = typeof CARD_TYPES[number] | number;
type GekisouMissionType = typeof GEKISOU_MISSION_TYPES[number] | number;
type Resource = { resourceType: ResourceType; resourceId: number };
type Reward = Resource & { resourceCount: number };
type RankingReward = Reward & { fromRank: number; toRank: number };
type Music = {
  musicId: number; challengeMusicId: number; musicType: CardType | "All";
  gekisouMission1: GekisouMissionType; gekisouMission2: GekisouMissionType; gekisouMission3: GekisouMissionType;
  startAt: Timestamp; endAt: Timestamp; musicRankingRewards: RankingReward[];
};
type BonusTarget = {
  characterId?: number;
  bandId?: number; cardType?: CardType; tagId?: number; memberCardId?: number;
  supportCardId?: number;
};
type Effect = BonusTarget & {
  resourceTypeConstraint: ResourceType; eventBonusType: typeof EVENT_BONUS_TYPES[number] | number;
  effectValue: Slots<number>;
};
type Bonus = BonusTarget & Partial<Record<typeof BONUS_FIELDS[keyof typeof BONUS_FIELDS], Slots<number>>>;
type Story = {
  episodeId: number; episodeNumber: number; advId: number;
  description: OurNotesText; startAt: Timestamp; endAt: Timestamp;
  unlockEpisodeNumber: number; eventPoint: number; characterId: number;
  characterRank: number; playerRank: number; bandRank: number; storyFriendshipEpisodeId: number;
  isAnotherEpisode: boolean; isExtraEpisode: boolean;
  banner: string; image: string; rewards: Reward[]; eventRewards: Reward[];
};
type EventRewards = {
  pointRewards: (Reward & { point: number })[];
  pointLoopRewards: (Reward & { loopStartEventPoint: number; loopEventPoint: number })[];
  rankingRewards: RankingReward[];
};
type SummaryExtension = Partial<EventTimes & EventAssets> & { musics?: number[] };
type DetailExtension = Partial<EventTimes & EventAssets & EventRewards> & { musics?: Music[]; stories?: Story[] };
type ProjectionExtension = Partial<EventTimes & EventAssets & EventRewards> & { musics?: number[] | Music[]; stories?: Story[] };
const SUMMARY_EXTENSION_ORDER = ["startAt", "endAt", "displayEndAt", ...ASSET_FIELDS, "musics"] as const;
const DETAIL_EXTENSION_ORDER = [...SUMMARY_EXTENSION_ORDER, "pointRewards", "pointLoopRewards", "rankingRewards", "stories"] as const;
const BONUS_ORDER = ["characterId", "bandId", "cardType", "tagId", "memberCardId", "supportCardId", ...Object.values(BONUS_FIELDS)] as const;
export type OurNotesEventSummary = EventTimes & EventAssets & {
  eventType: typeof EVENT_TYPES[number] | number; eventName: OurNotesText;
  memberBonuses: Bonus[]; supportBonuses: Bonus[]; effects?: Effect[]; musics: number[];
  pickUpCards: Resource[]; rewardCards: Resource[];
  serverExtensions?: Slots<SummaryExtension | null>;
};
export type OurNotesEventDetail = Omit<OurNotesEventSummary, "musics" | "serverExtensions"> & EventRewards & {
  isRankingDisabled: boolean; isMusicRankingDisabled: boolean; isTotalMusicRankingDisabled: boolean;
  storyChapterId: number; eventItemId: number; musicId: number;
  musics: Music[]; stories: Story[];
  serverExtensions?: Slots<DetailExtension | null>;
};
export type OurNotesEventPack = {
  key: string; compressedSha256: string; semanticSha256: string;
  compressedSize: number; jsonSize: number; recordCount: number;
};
export type OurNotesEventsPointer = { datasets: Record<OurNotesEventDataset, OurNotesEventPack> };

export function parseOurNotesEventsPointer(value: unknown): OurNotesEventsPointer {
  const row = ourNotesRecord(value);
  requireOurNotes(row.schema === "ournotes-events-api-pointer-v3");
  ourNotesInteger(row.generation, 1);
  const raw = ourNotesRecord(row.datasets);
  const datasets = {} as OurNotesEventsPointer["datasets"];
  for (const name of ["events", "eventDetails"] as const) {
    const pack = ourNotesRecord(raw[name]);
    const compressedSha256 = ourNotesHash(pack.compressedSha256);
    const key = `${OURNOTES_EVENTS_API_PREFIX}/packs/${name}/${compressedSha256}.json.gz`;
    requireOurNotes(pack.key === key);
    const recordCount = ourNotesInteger(pack.recordCount);
    requireOurNotes(recordCount <= OURNOTES_MAX_RECORDS);
    datasets[name] = {
      key, compressedSha256, semanticSha256: ourNotesHash(pack.semanticSha256),
      compressedSize: ourNotesSize(pack.compressedSize, OURNOTES_EVENTS_MAX_COMPRESSED_BYTES),
      jsonSize: ourNotesSize(pack.jsonSize, OURNOTES_EVENTS_MAX_JSON_BYTES), recordCount,
    };
  }
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
function regional<T>(value: unknown, parse: (value: unknown) => T): Regional<T> {
  return slots(value, (slot) => slot === null ? null : array(slot, parse));
}
function ordered<T extends object>(value: T, fields: readonly (keyof T)[]): T {
  return Object.fromEntries(fields.filter((field) => Object.hasOwn(value, field)).map((field) => [field, value[field]])) as T;
}
function numbers<K extends string>(row: Record<string, unknown>, fields: readonly K[]): Record<K, number> {
  return Object.fromEntries(fields.map((field) => [field, ourNotesInteger(row[field])])) as Record<K, number>;
}
function boolean(value: unknown): boolean {
  requireOurNotes(typeof value === "boolean");
  return value;
}
function enumName<T extends string>(value: unknown, names: Readonly<Partial<Record<number, T>>>): T | number {
  const code = ourNotesInteger(value);
  return names[code] ?? code;
}
function resource(value: unknown): Resource {
  const row = ourNotesRecord(value);
  return { resourceType: enumName(row.resourceType, RESOURCE_TYPES), resourceId: ourNotesInteger(row.resourceId) };
}
function reward(value: unknown): Reward {
  return { ...resource(value), resourceCount: ourNotesInteger(ourNotesRecord(value).resourceCount) };
}
function rankingReward(value: unknown): RankingReward {
  return { ...numbers(ourNotesRecord(value), ["fromRank", "toRank"]), ...reward(value) };
}
function music(value: unknown): Music {
  const row = ourNotesRecord(value);
  return {
    ...numbers(row, ["musicId", "challengeMusicId"]),
    musicType: enumName(row.musicType, MUSIC_TYPES),
    gekisouMission1: enumName(row.gekisouMission1, GEKISOU_MISSION_TYPES),
    gekisouMission2: enumName(row.gekisouMission2, GEKISOU_MISSION_TYPES),
    gekisouMission3: enumName(row.gekisouMission3, GEKISOU_MISSION_TYPES),
    startAt: timestamp(row.startAt), endAt: timestamp(row.endAt),
    musicRankingRewards: array(row.musicRankingRewards, rankingReward),
  };
}
function story(value: unknown) {
  const row = ourNotesRecord(value);
  return {
    ...numbers(row, ["episodeId", "episodeNumber", "advId"]),
    description: slots(row.description, ourNotesString), startAt: slots(row.startAt, timestamp), endAt: slots(row.endAt, timestamp),
    isAnotherEpisode: boolean(row.isAnotherEpisode), isExtraEpisode: boolean(row.isExtraEpisode),
    ...numbers(row, ["unlockEpisodeNumber", "eventPoint", "characterId", "characterRank", "playerRank", "bandRank", "storyFriendshipEpisodeId"]),
    banner: ourNotesString(row.banner), image: ourNotesString(row.image),
    rewards: array(row.rewards, reward), eventRewards: array(row.eventRewards, reward),
  };
}
function bonuses(value: unknown) {
  const member = { rows: [] as Bonus[], targets: new Map<string, Bonus>() };
  const support = { rows: [] as Bonus[], targets: new Map<string, Bonus>() };
  const effects: Effect[] = [];
  for (const effect of array(value, (value): Effect => {
    const row = ourNotesRecord(value);
    return {
      resourceTypeConstraint: enumName(row.resourceTypeConstraint, RESOURCE_TYPES),
      eventBonusType: enumName(row.eventBonusType, EVENT_BONUS_TYPES),
      ...Object.fromEntries(Object.entries(numbers(row, ["characterId", "bandId", "cardType", "tagId", "memberCardId", "supportCardId"]))
        .filter(([, value]) => value !== 0)
        .map(([field, value]) => [field, field === "cardType" ? enumName(value, CARD_TYPES) : value])),
      effectValue: slots(row.effectValue, (value) => ourNotesInteger(value, Number.MIN_SAFE_INTEGER)),
    };
  })) {
    const { resourceTypeConstraint, eventBonusType, effectValue, ...target } = effect;
    const bucket = resourceTypeConstraint === "MemberCard" ? member : resourceTypeConstraint === "SupportCard" ? support : undefined;
    const field = typeof eventBonusType === "string" ? BONUS_FIELDS[eventBonusType] : undefined;
    const percent = effectValue.map((value) => value / 100) as Slots<number>;
    if (!bucket || !field || !percent.every((value, rank) => Math.round(value * 100) === effectValue[rank])) {
      effects.push(effect);
      continue;
    }
    const key = JSON.stringify(target);
    let group = bucket.targets.get(key);
    if (!group || Object.hasOwn(group, field)) {
      group = { ...target };
      bucket.rows.push(group);
      bucket.targets.set(key, group);
    }
    group[field] = percent;
  }
  return {
    memberBonuses: member.rows.map((row) => ordered(row, BONUS_ORDER)),
    supportBonuses: support.rows.map((row) => ordered(row, BONUS_ORDER)),
    ...(effects.length ? { effects } : {}),
  };
}
function event(value: unknown, detail: boolean): OurNotesEventSummary | OurNotesEventDetail {
  const row = ourNotesRecord(value);
  const serverExtensions = slots<ProjectionExtension | null>(row.serverExtensions, (value) => {
    if (value === null) return null;
    const extension = ourNotesRecord(value);
    requireOurNotes(Object.keys(extension).every((key) => ASSET_FIELDS.some((field) => field === key)));
    return Object.fromEntries(Object.entries(extension).map(([key, asset]) => [key, ourNotesString(asset)]));
  });
  const baseServer = serverExtensions.findIndex((value) => value !== null);
  requireOurNotes(baseServer >= 0);
  function common<T>(field: keyof ProjectionExtension, values: Slots<T>): T {
    const base = values[baseServer];
    const serialized = JSON.stringify(base);
    values.forEach((value, server) => {
      const extension = serverExtensions[server];
      if (extension !== null && JSON.stringify(value) !== serialized) Object.assign(extension, { [field]: value });
    });
    return base;
  }
  const identity = {
    eventType: enumName(row.eventType, EVENT_TYPES), eventName: slots(row.eventName, ourNotesString),
    startAt: common("startAt", slots(row.startAt, timestamp)), endAt: common("endAt", slots(row.endAt, timestamp)),
    displayEndAt: common("displayEndAt", slots(row.displayEndAt, timestamp)),
  };
  const assets = {
    imageAsset: ourNotesString(row.imageAsset), logoAsset: ourNotesString(row.logoAsset),
    backgroundAsset: ourNotesString(row.backgroundAsset), bannerAsset: ourNotesString(row.bannerAsset),
  };
  const bonusFields = bonuses(row.effects);
  const references = {
    pickUpCards: array(row.pickUpCards, resource), rewardCards: array(row.rewardCards, resource),
  };
  if (!detail) {
    const musics = common("musics", regional(row.musics, (value) => ourNotesInteger(ourNotesRecord(value).musicId, 1)));
    requireOurNotes(musics !== null);
    const extensions = serverExtensions as Slots<SummaryExtension | null>;
    return {
      ...identity, ...assets, ...bonusFields, musics, ...references,
      serverExtensions: extensions.map((slot) => slot === null ? null : ordered(slot, SUMMARY_EXTENSION_ORDER)) as Slots<SummaryExtension | null>,
    };
  }
  const musics = common("musics", regional(row.musics, music));
  requireOurNotes(musics !== null);
  const rawStories = array(row.stories, story);
  const stories = common("stories", serverExtensions.map((_, server) => rawStories.map((story) => ({
    ...story, startAt: story.startAt[server], endAt: story.endAt[server],
  }))) as Slots<Story[]>);
  const pointRewards = common("pointRewards", regional(row.pointRewards, (value) => ({
    ...numbers(ourNotesRecord(value), ["point"]), ...reward(value),
  })));
  const pointLoopRewards = common("pointLoopRewards", regional(row.pointLoopRewards, (value) => ({
    ...numbers(ourNotesRecord(value), ["loopStartEventPoint", "loopEventPoint"]), ...reward(value),
  })));
  const rankingRewards = common("rankingRewards", regional(row.rankingRewards, rankingReward));
  requireOurNotes(pointRewards !== null && pointLoopRewards !== null && rankingRewards !== null);
  const extensions = serverExtensions as Slots<DetailExtension | null>;
  return {
    ...identity,
    ...numbers(row, ["storyChapterId", "eventItemId", "musicId"]),
    isRankingDisabled: boolean(row.isRankingDisabled), isMusicRankingDisabled: boolean(row.isMusicRankingDisabled),
    isTotalMusicRankingDisabled: boolean(row.isTotalMusicRankingDisabled),
    ...assets, ...bonusFields, ...references, musics,
    pointRewards, pointLoopRewards, rankingRewards, stories,
    serverExtensions: extensions.map((slot) => slot === null ? null : ordered(slot, DETAIL_EXTENSION_ORDER)) as Slots<DetailExtension | null>,
  };
}
export function parseOurNotesEventMap(value: unknown, descriptor: OurNotesEventPack, dataset: OurNotesEventDataset) {
  const entries = Object.entries(ourNotesRecord(value));
  requireOurNotes(entries.length === descriptor.recordCount && entries.length <= OURNOTES_MAX_RECORDS);
  return Object.fromEntries(entries.map(([id, value]) => {
    requireOurNotes(ourNotesId(id));
    return [id, event(value, dataset === "eventDetails")];
  }));
}
