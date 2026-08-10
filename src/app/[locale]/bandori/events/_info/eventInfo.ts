import { parseApiSuccessData } from "@/lib/api-contracts";
import {
  resolveBandoriEventScheduleWindow,
  resolveBandoriEventServerScheduleWindow,
  type BandoriEventScheduleWindow,
  type BandoriRegionalEventTimeline,
} from "@/lib/bandori/events/region";
import type {
  BandoriMusicMasterMap,
  BandoriMusicMasterRecord,
} from "@/lib/bandori-music-api-client";
import {
  getBandoriRegionalDisplayOrder,
  pickBandoriRegionalText,
  type BandoriServer,
} from "@/lib/bandori-server";

export type EventReward = {
  point?: number;
  fromRank?: number;
  toRank?: number;
  rewardType: string;
  rewardId: number | null;
  rewardQuantity: number;
};

export type EventBonusEntry = {
  id: number;
  percent: number;
};

export type EventAttributeBonus = {
  attribute: string;
  percent: number;
};

export type EventMemberBonus = {
  situationId: number;
  percent: number;
};

export type EventSong = {
  id: number;
  title: string;
  bandName: string | null;
  publishedAt: number;
  difficultyLevels: number[];
  record: BandoriMusicMasterRecord;
};

export type EventSongsSelection = {
  songs: EventSong[];
  sourceServer: BandoriServer;
  startAt: number | null;
  endAt: number | null;
};

export type EventInfoModel = {
  eventType: string;
  eventName: unknown[];
  band: string | null;
  startAt: number | null;
  endAt: number | null;
  timeServer: BandoriServer;
  timeSource: BandoriEventScheduleWindow["source"];
  statusStartAt: number | null;
  statusEndAt: number | null;
  publicStartAt: number | null;
  publicEndAt: number | null;
  aggregateEndAt: number | null;
  distributionStartAt: number | null;
  distributionEndAt: number | null;
  exchangeEndAt: number | null;
  attributes: EventAttributeBonus[];
  characters: EventBonusEntry[];
  combinedPointPercent: number | null;
  combinedParameterPercent: number | null;
  parameterBonuses: Record<string, number>;
  members: EventMemberBonus[];
  limitBreaks: Array<{ rarity: number; rank: number; percent: number }>;
  rewardCardIds: number[];
  rewardStampIds: number[];
  rewardStampIdsByServer: [number[], number[], number[], number[]];
  rewardStampServer: BandoriServer;
  pointRewards: EventReward[];
  rankingRewards: EventReward[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toPositiveInteger(value: unknown): number | null {
  const number = toFiniteNumber(value);
  return number !== null && Number.isInteger(number) && number > 0 ? number : null;
}

function eventScheduleWindow(value: unknown): { startAt: number; endAt: number } | null {
  if (!isRecord(value)) return null;
  const startAt = toFiniteNumber(value.startAt);
  const endAt = toFiniteNumber(value.endAt);
  return startAt !== null && endAt !== null ? { startAt, endAt } : null;
}

export function buildEventTimeline(record: Record<string, unknown>): BandoriRegionalEventTimeline {
  const jpSchedule = eventScheduleWindow(record.jpSchedule);
  const enSchedule = eventScheduleWindow(record.enSchedule);
  const twSchedule = eventScheduleWindow(record.twSchedule);
  const cnSchedule = eventScheduleWindow(record.cnSchedule);

  return {
    jp: {
      startAt: toFiniteNumber(getRegionalValue(record.startAt, 0)),
      endAt: toFiniteNumber(getRegionalValue(record.endAt, 0)),
    },
    en: {
      startAt: toFiniteNumber(getRegionalValue(record.startAt, 1)),
      endAt: toFiniteNumber(getRegionalValue(record.endAt, 1)),
    },
    tw: {
      startAt: toFiniteNumber(getRegionalValue(record.startAt, 2)),
      endAt: toFiniteNumber(getRegionalValue(record.endAt, 2)),
    },
    cn: {
      startAt: toFiniteNumber(getRegionalValue(record.startAt, 3)),
      endAt: toFiniteNumber(getRegionalValue(record.endAt, 3)),
    },
    ...(jpSchedule ? { jpSchedule } : {}),
    ...(enSchedule ? { enSchedule } : {}),
    ...(twSchedule ? { twSchedule } : {}),
    ...(cnSchedule ? { cnSchedule } : {}),
  };
}

export function getRegionalValue(value: unknown, server: BandoriServer): unknown {
  return Array.isArray(value) && value.length === 4 ? value[server] : value;
}

function parseBonusEntries(value: unknown, idKey: string): EventBonusEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const id = toPositiveInteger(entry[idKey]);
    const percent = toFiniteNumber(entry.percent);
    return id === null || percent === null ? [] : [{ id, percent }];
  });
}

function parseRewards(value: unknown, server: BandoriServer): EventReward[] {
  const regional = getRegionalValue(value, server);
  if (!Array.isArray(regional)) return [];
  return regional.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.rewardType !== "string") return [];
    const rewardQuantity = toFiniteNumber(entry.rewardQuantity);
    if (rewardQuantity === null) return [];
    return [{
      point: toFiniteNumber(entry.point) ?? undefined,
      fromRank: toFiniteNumber(entry.fromRank) ?? undefined,
      toRank: toFiniteNumber(entry.toRank) ?? undefined,
      rewardType: entry.rewardType,
      rewardId: toPositiveInteger(entry.rewardId),
      rewardQuantity,
    }];
  });
}

export function parseBandoriEventDetailResponse(raw: unknown): Record<string, unknown> {
  const data = parseApiSuccessData<unknown>(raw);
  if (!isRecord(data)) {
    throw new Error("Bandori event detail API returned an invalid record");
  }
  return data;
}

export function buildEventInfoModel(
  record: Record<string, unknown>,
  server: BandoriServer,
): EventInfoModel {
  const timeline = buildEventTimeline(record);
  const timeWindow = resolveBandoriEventScheduleWindow(
    { timeline },
    server,
  );
  const statusWindow = resolveBandoriEventServerScheduleWindow({ timeline }, server);
  const combined = isRecord(record.eventAttributeAndCharacterBonus)
    ? record.eventAttributeAndCharacterBonus
    : null;
  const parameters = isRecord(record.eventCharacterParameterBonus)
    ? record.eventCharacterParameterBonus
    : null;
  const attributes = Array.isArray(record.attributes)
    ? record.attributes.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.attribute !== "string") return [];
        const percent = toFiniteNumber(entry.percent);
        return percent === null ? [] : [{ attribute: entry.attribute, percent }];
      })
    : [];
  const members = parseBonusEntries(record.members, "situationId").map((entry) => ({
    situationId: entry.id,
    percent: entry.percent,
  }));
  const limitBreaks = Array.isArray(record.limitBreaks)
    ? record.limitBreaks.flatMap((entry) => {
        if (!isRecord(entry)) return [];
        const rarity = toPositiveInteger(entry.rarity);
        const rank = toFiniteNumber(entry.rank);
        const percent = toFiniteNumber(entry.percent);
        return rarity === null || rank === null || percent === null
          ? []
          : [{ rarity, rank, percent }];
      })
    : [];
  const rewardCardIds = Array.isArray(record.rewardCards)
    ? record.rewardCards.flatMap((value) => {
        const id = toPositiveInteger(value);
        return id === null ? [] : [id];
      })
    : [];
  const pointRewards = parseRewards(record.pointRewards, server);
  const rankingRewards = parseRewards(record.rankingRewards, server);
  const rewardStampIdsByServer = ([0, 1, 2, 3] as const).map((candidateServer) => {
    const regionalRewards = [
      ...parseRewards(record.pointRewards, candidateServer),
      ...parseRewards(record.rankingRewards, candidateServer),
    ];
    return [...new Set(regionalRewards.flatMap((reward) => (
      (reward.rewardType === "stamp" || reward.rewardType === "voice_stamp")
      && reward.rewardId !== null
        ? [reward.rewardId]
        : []
    )))];
  }) as [number[], number[], number[], number[]];
  const rewardStampServer = getBandoriRegionalDisplayOrder(server).find(
    (candidateServer) => rewardStampIdsByServer[candidateServer].length > 0,
  ) ?? server;
  const rewardStampIds = rewardStampIdsByServer[rewardStampServer];

  return {
    eventType: typeof record.eventType === "string" ? record.eventType : "unknown",
    eventName: Array.isArray(record.eventName) ? record.eventName : [],
    band: typeof record.band === "string" ? record.band : null,
    startAt: timeWindow.startAt,
    endAt: timeWindow.endAt,
    timeServer: timeWindow.displayServer,
    timeSource: timeWindow.source,
    statusStartAt: statusWindow.startAt,
    statusEndAt: statusWindow.endAt,
    publicStartAt: toFiniteNumber(getRegionalValue(record.publicStartAt, server)),
    publicEndAt: toFiniteNumber(getRegionalValue(record.publicEndAt, server)),
    aggregateEndAt: toFiniteNumber(getRegionalValue(record.aggregateEndAt, server)),
    distributionStartAt: toFiniteNumber(getRegionalValue(record.distributionStartAt, server)),
    distributionEndAt: toFiniteNumber(getRegionalValue(record.distributionEndAt, server)),
    exchangeEndAt: toFiniteNumber(getRegionalValue(record.exchangeEndAt, server)),
    attributes,
    characters: parseBonusEntries(record.characters, "characterId"),
    combinedPointPercent: toFiniteNumber(combined?.pointPercent),
    combinedParameterPercent: toFiniteNumber(combined?.parameterPercent),
    parameterBonuses: Object.fromEntries(Object.entries(parameters ?? {}).flatMap(([key, value]) => {
      const number = toFiniteNumber(value);
      return number === null ? [] : [[key, number]];
    })),
    members,
    limitBreaks,
    rewardCardIds,
    rewardStampIds,
    rewardStampIdsByServer,
    rewardStampServer,
    pointRewards,
    rankingRewards,
  };
}

export function deriveEventSongs(
  music: BandoriMusicMasterMap | null,
  server: BandoriServer,
  startAt: number | null,
  endAt: number | null,
): EventSong[] {
  if (!music || startAt === null || endAt === null) return [];

  return Object.entries(music).flatMap(([musicId, record]) => {
    if (!record) return [];
    const publishedAt = toFiniteNumber(getRegionalValue(record.publishedAt, server));
    if (publishedAt === null || publishedAt < startAt || publishedAt > endAt) return [];
    const id = toPositiveInteger(musicId);
    if (id === null) return [];
    const difficultyLevels = Object.entries(record.difficulty ?? {})
      .sort(([left], [right]) => Number(left) - Number(right))
      .flatMap(([, difficulty]) => {
        const level = toPositiveInteger(difficulty?.playLevel);
        return level === null ? [] : [level];
      });
    return [{
      id,
      title: pickBandoriRegionalText(record.musicTitle, server, server) ?? `Music #${id}`,
      bandName: pickBandoriRegionalText(record.bandName, server, server),
      publishedAt,
      difficultyLevels,
      record,
    }];
  }).sort((left, right) => left.publishedAt - right.publishedAt || left.id - right.id);
}

export function deriveEventSongsWithFallback(
  music: BandoriMusicMasterMap | null,
  eventRecord: Record<string, unknown>,
  server: BandoriServer,
): EventSongsSelection {
  const event = { timeline: buildEventTimeline(eventRecord) };
  let firstWindow: EventSongsSelection | null = null;

  for (const candidateServer of getBandoriRegionalDisplayOrder(server)) {
    const window = resolveBandoriEventServerScheduleWindow(event, candidateServer);
    if (window.startAt === null || window.endAt === null) {
      continue;
    }
    const songs = deriveEventSongs(music, candidateServer, window.startAt, window.endAt);
    const selection = {
      songs,
      sourceServer: candidateServer,
      startAt: window.startAt,
      endAt: window.endAt,
    };
    firstWindow ??= selection;
    if (songs.length > 0) {
      return selection;
    }
  }

  return firstWindow ?? {
    songs: [],
    sourceServer: server,
    startAt: null,
    endAt: null,
  };
}
