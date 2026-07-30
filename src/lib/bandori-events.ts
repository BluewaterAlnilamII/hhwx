import { parseApiSuccessData } from "@/lib/api-contracts";
import type { BandoriEventBonus } from "@/lib/bandori-team-calculator";

export const BANDORI_EVENTS_MASTER_CACHE_KEY = "bandori-master-events";
export const BANDORI_EVENTS_MASTER_URL = "/api/bandori/master/events";

export type BandoriMasterEventRecord = Record<string, unknown>;
export type BandoriMasterEventMap = Record<string, BandoriMasterEventRecord>;

export type BandoriCnScheduleSource = {
  eventId: number;
  predictedStart: string | null;
  predictedEnd: string | null;
};

export type BandoriEventSummary = {
  eventId: number;
  eventType: string;
  name: {
    jp: string;
    en: string | null;
    tw: string | null;
    cn: string | null;
  };
  asset: {
    bundleName: string;
    bannerBundleName: string | null;
  };
  band: string;
  stampCharacterId: number | null;
  timeline: {
    jp: {
      startAt: number | null;
      endAt: number | null;
    };
    en: {
      startAt: number | null;
      endAt: number | null;
    };
    tw: {
      startAt: number | null;
      endAt: number | null;
    };
    cn: {
      startAt: number | null;
      endAt: number | null;
    };
    jpSchedule?: {
      startAt: number;
      endAt: number;
    };
    enSchedule?: {
      startAt: number;
      endAt: number;
    };
    twSchedule?: {
      startAt: number;
      endAt: number;
    };
    cnSchedule?: {
      startAt: number;
      endAt: number;
    };
  };
  musicIds: {
    jp: number[];
    en: number[];
    tw: number[];
    cn: number[];
  };
  bonus: BandoriEventBonus | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function eventStampCharacterId(value: unknown): number | null {
  // Accept the former regional array during the deployment transition. New
  // snapshots publish the cross-server invariant as one scalar.
  return toPositiveInteger(Array.isArray(value) ? preferredRegionalSlot(value, 3) : value);
}

function toPositiveInteger(value: unknown): number | null {
  const numeric = toFiniteNumber(value);
  return numeric !== null && Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function regionalSlot(value: unknown, server: 0 | 1 | 2 | 3): unknown {
  return Array.isArray(value) && value.length === 4 ? value[server] : value;
}

function preferredRegionalSlot(value: unknown, server: 0 | 1 | 2 | 3): unknown {
  if (!Array.isArray(value) || value.length !== 4) {
    return value;
  }
  for (const index of [server, 0, 1, 2, 3] as const) {
    const candidate = value[index];
    if (candidate !== null && candidate !== undefined && candidate !== "") {
      return candidate;
    }
  }
  return null;
}

function regionalString(value: unknown, server: 0 | 1 | 2 | 3, fallback = true): string | null {
  const candidate = fallback ? preferredRegionalSlot(value, server) : regionalSlot(value, server);
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

function regionalTimestamp(value: unknown, server: 0 | 1 | 2 | 3): number | null {
  return toFiniteNumber(regionalSlot(value, server));
}

function eventScheduleWindow(value: unknown): { startAt: number; endAt: number } | null {
  if (!isRecord(value)) {
    return null;
  }
  const startAt = toFiniteNumber(value.startAt);
  const endAt = toFiniteNumber(value.endAt);
  return startAt !== null && endAt !== null ? { startAt, endAt } : null;
}

function regionalMusicIds(value: unknown, server: 0 | 1 | 2 | 3): number[] {
  const musics = regionalSlot(value, server);
  if (!Array.isArray(musics)) {
    return [];
  }
  return musics.flatMap((music) => {
    if (!isRecord(music)) {
      return [];
    }
    const musicId = toPositiveInteger(music.musicId);
    return musicId === null ? [] : [musicId];
  });
}

function eventBonus(record: BandoriMasterEventRecord): BandoriEventBonus | null {
  const combined = isRecord(record.eventAttributeAndCharacterBonus)
    ? record.eventAttributeAndCharacterBonus
    : null;
  const parameters = isRecord(record.eventCharacterParameterBonus)
    ? record.eventCharacterParameterBonus
    : null;
  const attributes = Array.isArray(record.attributes) ? record.attributes : [];
  const characters = Array.isArray(record.characters) ? record.characters : [];
  const members = Array.isArray(record.members) ? record.members : [];
  const limitBreaks = Array.isArray(record.limitBreaks) ? record.limitBreaks : [];

  if (!combined && !parameters && attributes.length === 0 && characters.length === 0 && members.length === 0 && limitBreaks.length === 0) {
    return null;
  }

  return {
    attributes,
    characters,
    pointPercent: toFiniteNumber(combined?.pointPercent),
    parameterPercent: toFiniteNumber(combined?.parameterPercent),
    performancePercent: toFiniteNumber(parameters?.performance),
    techniquePercent: toFiniteNumber(parameters?.technique),
    visualPercent: toFiniteNumber(parameters?.visual),
    members,
    limitBreaks,
  };
}

export function parseBandoriMasterEventMap(raw: unknown): BandoriMasterEventMap {
  const payload = parseApiSuccessData<unknown>(raw);
  if (!isRecord(payload)) {
    throw new Error("Bandori master events response is invalid");
  }

  const events: BandoriMasterEventMap = {};
  for (const [eventId, value] of Object.entries(payload)) {
    if (!/^[1-9]\d*$/u.test(eventId) || !isRecord(value)) {
      throw new Error(`Bandori master event record is invalid: ${eventId}`);
    }
    events[eventId] = value;
  }
  return events;
}

export function toBandoriEventSummary(
  eventId: string,
  record: BandoriMasterEventRecord,
): BandoriEventSummary {
  const numericEventId = Number(eventId);
  const eventType = typeof record.eventType === "string" ? record.eventType : "story";
  const jpName = regionalString(record.eventName, 0) ?? `Event #${eventId}`;
  const jpStartAt = regionalTimestamp(record.startAt, 0);
  const jpEndAt = regionalTimestamp(record.endAt, 0);
  const jpSchedule = eventScheduleWindow(record.jpSchedule);
  const enSchedule = eventScheduleWindow(record.enSchedule);
  const twSchedule = eventScheduleWindow(record.twSchedule);
  const cnSchedule = eventScheduleWindow(record.cnSchedule);

  return {
    eventId: numericEventId,
    eventType,
    name: {
      jp: jpName,
      en: regionalString(record.eventName, 1, false),
      tw: regionalString(record.eventName, 2, false),
      cn: regionalString(record.eventName, 3, false),
    },
    asset: {
      bundleName: regionalString(record.assetBundleName, 3) ?? "",
      bannerBundleName: regionalString(record.bannerAssetBundleName, 3),
    },
    band: typeof record.band === "string" ? record.band : "mix",
    stampCharacterId: eventStampCharacterId(record.stampCharacterId),
    timeline: {
      jp: {
        startAt: jpStartAt,
        endAt: jpEndAt,
      },
      en: {
        startAt: regionalTimestamp(record.startAt, 1),
        endAt: regionalTimestamp(record.endAt, 1),
      },
      tw: {
        startAt: regionalTimestamp(record.startAt, 2),
        endAt: regionalTimestamp(record.endAt, 2),
      },
      cn: {
        startAt: regionalTimestamp(record.startAt, 3),
        endAt: regionalTimestamp(record.endAt, 3),
      },
      ...(jpSchedule ? { jpSchedule } : {}),
      ...(enSchedule ? { enSchedule } : {}),
      ...(twSchedule ? { twSchedule } : {}),
      ...(cnSchedule ? { cnSchedule } : {}),
    },
    musicIds: {
      jp: regionalMusicIds(record.musics, 0),
      en: regionalMusicIds(record.musics, 1),
      tw: regionalMusicIds(record.musics, 2),
      cn: regionalMusicIds(record.musics, 3),
    },
    bonus: eventBonus(record),
  };
}

export function toBandoriEventSummaries(events: BandoriMasterEventMap): BandoriEventSummary[] {
  return Object.entries(events)
    .map(([eventId, record]) => toBandoriEventSummary(eventId, record))
    .sort((left, right) => left.eventId - right.eventId);
}

export function parseBandoriEventSummaries(raw: unknown): { events: BandoriEventSummary[] } {
  return { events: toBandoriEventSummaries(parseBandoriMasterEventMap(raw)) };
}

export function addBandoriCnSchedules(
  records: BandoriMasterEventMap,
  schedules: readonly BandoriCnScheduleSource[],
): BandoriMasterEventMap {
  const schedulesByEventId = new Map(schedules.map((schedule) => [String(schedule.eventId), schedule]));
  let changed = false;
  const result: BandoriMasterEventMap = {};

  for (const [eventId, record] of Object.entries(records)) {
    const schedule = schedulesByEventId.get(eventId);
    const hasOfficialCnRange = regionalTimestamp(record.startAt, 3) !== null
      && regionalTimestamp(record.endAt, 3) !== null;
    const scheduleStartAt = schedule?.predictedStart
      ? Date.parse(`${schedule.predictedStart}T15:00:00+08:00`)
      : Number.NaN;
    const scheduleEndAt = schedule?.predictedEnd
      ? Date.parse(`${schedule.predictedEnd}T22:59:59+08:00`)
      : Number.NaN;
    if (hasOfficialCnRange || !Number.isFinite(scheduleStartAt) || !Number.isFinite(scheduleEndAt)) {
      result[eventId] = record;
      continue;
    }

    changed = true;
    const nextRecord: BandoriMasterEventRecord = {};
    let inserted = false;
    for (const [key, value] of Object.entries(record)) {
      nextRecord[key] = value;
      if (key === "endAt") {
        nextRecord.cnSchedule = { startAt: scheduleStartAt, endAt: scheduleEndAt };
        inserted = true;
      }
    }
    if (!inserted) {
      nextRecord.cnSchedule = { startAt: scheduleStartAt, endAt: scheduleEndAt };
    }
    result[eventId] = nextRecord;
  }

  return changed ? result : records;
}
