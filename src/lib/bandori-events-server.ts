import type { CalendarCharacter } from "@/lib/calendar-character-service";
import { createServerSupabaseClient } from "@/lib/supabase-server";


type EventRow = {
  event_id: number;
  event_type: string;
  event_name_jp: string;
  event_name_cn: string | null;
  asset_bundle_name: string;
  banner_asset_bundle_name: string | null;
  jp_start_at: number;
  jp_end_at: number;
  cn_start_at: number | null;
  cn_end_at: number | null;
  music_ids_jp: number[] | null;
  music_ids_cn: number[] | null;
  band: string;
  stamp_character_id: number | null;
};

type ScheduleRow = {
  event_id: number;
  predicted_start: string | null;
  predicted_end: string | null;
  duration_days: number;
  has_rest_day: boolean;
  sort_order: number;
};

type BonusRow = {
  event_id: number;
  attributes_jsonb: unknown;
  characters_jsonb: unknown;
  point_percent: number | null;
  parameter_percent: number | null;
  performance_percent: number | null;
  technique_percent: number | null;
  visual_percent: number | null;
  members_jsonb: unknown;
  limit_breaks_jsonb: unknown;
};

export type BandoriEventRecord = Omit<EventRow, "music_ids_jp" | "music_ids_cn"> & {
  music_ids_jp: number[];
  music_ids_cn: number[];
  has_schedule_row: boolean;
  predicted_start: string | null;
  predicted_end: string | null;
  duration_days: number;
  has_rest_day: boolean;
  sort_order: number;
  attributes_jsonb: unknown[];
  characters_jsonb: unknown[];
  point_percent: number | null;
  parameter_percent: number | null;
  performance_percent: number | null;
  technique_percent: number | null;
  visual_percent: number | null;
  members_jsonb: unknown[];
  limit_breaks_jsonb: unknown[];
};

export type BandoriScheduleEvent = Pick<
  BandoriEventRecord,
  | "event_id"
  | "event_name_jp"
  | "event_name_cn"
  | "band"
  | "stamp_character_id"
  | "cn_start_at"
  | "cn_end_at"
  | "predicted_start"
  | "predicted_end"
  | "duration_days"
  | "has_rest_day"
  | "sort_order"
>;

export type BandoriPublicEventSummary = {
  eventId: number;
  eventType: string;
  band: string;
  stampCharacterId: number | null;
  name: {
    jp: string;
    cn: string | null;
    display: string;
  };
  availability: {
    hasJp: boolean;
    hasCn: boolean;
  };
  asset: {
    bundleName: string;
    bannerBundleName: string | null;
    bannerRegion: "jp" | "cn";
  };
  timeline: {
    jp: {
      startAt: number;
      endAt: number;
    };
    cn: {
      startAt: number | null;
      endAt: number | null;
    };
    scheduleCn: {
      predictedStart: string | null;
      predictedEnd: string | null;
      durationDays: number;
      hasRestDay: boolean;
      sortOrder: number;
    };
    trackerWindow: {
      startAt: number | null;
      endAt: number | null;
      source: "official" | "predicted" | "unknown";
    };
  };
  bonus: {
    attributes: unknown[];
    characters: unknown[];
    pointPercent: number | null;
    parameterPercent: number | null;
    performancePercent: number | null;
    techniquePercent: number | null;
    visualPercent: number | null;
    members: unknown[];
    limitBreaks: unknown[];
  };
  music: {
    jpIds: number[];
    cnIds: number[];
  };
};

export type BandoriPublicEventDetail = BandoriPublicEventSummary & {
  music: BandoriPublicEventSummary["music"] & {
    entries: {
      jp: { musicId: number }[];
      cn: { musicId: number }[];
    };
  };
};

const EVENT_SELECT_FIELDS = [
  "event_id",
  "event_type",
  "event_name_jp",
  "event_name_cn",
  "asset_bundle_name",
  "banner_asset_bundle_name",
  "jp_start_at",
  "jp_end_at",
  "cn_start_at",
  "cn_end_at",
  "music_ids_jp",
  "music_ids_cn",
  "band",
  "stamp_character_id",
].join(",");

const SCHEDULE_SELECT_FIELDS = [
  "event_id",
  "predicted_start",
  "predicted_end",
  "duration_days",
  "has_rest_day",
  "sort_order",
].join(",");

const BONUS_SELECT_FIELDS = [
  "event_id",
  "attributes_jsonb",
  "characters_jsonb",
  "point_percent",
  "parameter_percent",
  "performance_percent",
  "technique_percent",
  "visual_percent",
  "members_jsonb",
  "limit_breaks_jsonb",
].join(",");

const CHARACTER_SELECT_FIELDS = [
  "character_id",
  "character_type",
  "band_id",
  "color_code",
  "character_name_jp",
  "character_name_en",
  "character_name_tw",
  "character_name_cn",
  "first_name_jp",
  "first_name_en",
  "first_name_tw",
  "first_name_cn",
  "last_name_jp",
  "last_name_en",
  "last_name_tw",
  "last_name_cn",
  "nickname_jp",
  "nickname_en",
  "nickname_tw",
  "nickname_cn",
].join(",");

function normalizeIntegerArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function normalizeJsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeNullableNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function resolveEventDisplayName(record: BandoriEventRecord): string {
  const preferredName = record.event_name_cn?.trim();
  if (preferredName) {
    return preferredName;
  }

  const fallbackName = record.event_name_jp.trim();
  if (fallbackName) {
    return fallbackName;
  }

  return `活动 #${record.event_id}`;
}

function resolveBannerRegion(record: BandoriEventRecord): "jp" | "cn" {
  return record.event_name_cn ? "cn" : "jp";
}

function toTrackerWindow(record: BandoriEventRecord): BandoriPublicEventSummary["timeline"]["trackerWindow"] {
  if (record.cn_start_at !== null && record.cn_end_at !== null) {
    return {
      startAt: record.cn_start_at,
      endAt: record.cn_end_at,
      source: "official",
    };
  }

  if (record.predicted_start && record.predicted_end) {
    return {
      startAt: Date.parse(`${record.predicted_start}T15:00:00+08:00`),
      endAt: Date.parse(`${record.predicted_end}T22:59:59+08:00`),
      source: "predicted",
    };
  }

  return {
    startAt: null,
    endAt: null,
    source: "unknown",
  };
}

function buildRegionArray<T>(jpValue: T | null, cnValue: T | null): [T | null, null, null, T | null] {
  return [jpValue, null, null, cnValue];
}

function toTimestampText(value: number | null): string | null {
  return value !== null && Number.isFinite(value) ? String(value) : null;
}

function toMusicEntries(musicIds: number[]): { musicId: number }[] | null {
  return musicIds.length > 0 ? musicIds.map((musicId) => ({ musicId })) : null;
}

export async function fetchBandoriCharacters(): Promise<CalendarCharacter[]> {
  const serviceClient = createServerSupabaseClient();
  const { data, error } = await serviceClient
    .from("gbp_characters")
    .select(CHARACTER_SELECT_FIELDS)
    .order("character_id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as unknown as CalendarCharacter[];
}

export async function fetchBandoriEventRecords(options?: { eventId?: number }): Promise<BandoriEventRecord[]> {
  const serviceClient = createServerSupabaseClient();

  let eventsQuery = serviceClient
    .from("gbp_events")
    .select(EVENT_SELECT_FIELDS)
    .order("event_id", { ascending: true });

  let scheduleQuery = serviceClient
    .from("gbp_event_schedule_cn")
    .select(SCHEDULE_SELECT_FIELDS)
    .order("sort_order", { ascending: true });

  let bonusQuery = serviceClient
    .from("gbp_event_bonus")
    .select(BONUS_SELECT_FIELDS)
    .order("event_id", { ascending: true });

  if (options?.eventId !== undefined) {
    eventsQuery = eventsQuery.eq("event_id", options.eventId);
    scheduleQuery = scheduleQuery.eq("event_id", options.eventId);
    bonusQuery = bonusQuery.eq("event_id", options.eventId);
  }

  const [eventsResult, scheduleResult, bonusResult] = await Promise.all([
    eventsQuery,
    scheduleQuery,
    bonusQuery,
  ]);

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }
  if (scheduleResult.error) {
    throw new Error(scheduleResult.error.message);
  }
  if (bonusResult.error) {
    throw new Error(bonusResult.error.message);
  }

  const scheduleMap = new Map<number, ScheduleRow>(
    ((scheduleResult.data ?? []) as unknown as ScheduleRow[]).map((row) => [row.event_id, row]),
  );

  const bonusMap = new Map<number, BonusRow>(
    ((bonusResult.data ?? []) as unknown as BonusRow[]).map((row) => [row.event_id, row]),
  );

  return ((eventsResult.data ?? []) as unknown as EventRow[])
    .map((eventRow) => {
      const scheduleRow = scheduleMap.get(eventRow.event_id);
      const bonusRow = bonusMap.get(eventRow.event_id);

      return {
        ...eventRow,
        music_ids_jp: normalizeIntegerArray(eventRow.music_ids_jp),
        music_ids_cn: normalizeIntegerArray(eventRow.music_ids_cn),
        has_schedule_row: scheduleRow !== undefined,
        predicted_start: scheduleRow?.predicted_start ?? null,
        predicted_end: scheduleRow?.predicted_end ?? null,
        duration_days: scheduleRow?.duration_days ?? 7,
        has_rest_day: scheduleRow?.has_rest_day ?? true,
        sort_order: scheduleRow?.sort_order ?? eventRow.event_id,
        attributes_jsonb: normalizeJsonArray(bonusRow?.attributes_jsonb),
        characters_jsonb: normalizeJsonArray(bonusRow?.characters_jsonb),
        point_percent: normalizeNullableNumber(bonusRow?.point_percent),
        parameter_percent: normalizeNullableNumber(bonusRow?.parameter_percent),
        performance_percent: normalizeNullableNumber(bonusRow?.performance_percent),
        technique_percent: normalizeNullableNumber(bonusRow?.technique_percent),
        visual_percent: normalizeNullableNumber(bonusRow?.visual_percent),
        members_jsonb: normalizeJsonArray(bonusRow?.members_jsonb),
        limit_breaks_jsonb: normalizeJsonArray(bonusRow?.limit_breaks_jsonb),
      } satisfies BandoriEventRecord;
    })
    .sort((left, right) => {
      if (left.sort_order !== right.sort_order) {
        return left.sort_order - right.sort_order;
      }
      return left.event_id - right.event_id;
    });
}

export async function fetchBandoriEventRecord(eventId: number): Promise<BandoriEventRecord | null> {
  const records = await fetchBandoriEventRecords({ eventId });
  return records[0] ?? null;
}

export function toBandoriScheduleEvent(record: BandoriEventRecord): BandoriScheduleEvent {
  return {
    event_id: record.event_id,
    event_name_jp: record.event_name_jp,
    event_name_cn: record.event_name_cn,
    band: record.band,
    stamp_character_id: record.stamp_character_id,
    cn_start_at: record.cn_start_at,
    cn_end_at: record.cn_end_at,
    predicted_start: record.predicted_start,
    predicted_end: record.predicted_end,
    duration_days: record.duration_days,
    has_rest_day: record.has_rest_day,
    sort_order: record.sort_order,
  };
}

export function toBandoriEventSummary(record: BandoriEventRecord): BandoriPublicEventSummary {
  return {
    eventId: record.event_id,
    eventType: record.event_type,
    band: record.band,
    stampCharacterId: record.stamp_character_id,
    name: {
      jp: record.event_name_jp,
      cn: record.event_name_cn,
      display: resolveEventDisplayName(record),
    },
    availability: {
      hasJp: Boolean(record.event_name_jp.trim()),
      hasCn: Boolean(record.event_name_cn?.trim()),
    },
    asset: {
      bundleName: record.asset_bundle_name,
      bannerBundleName: record.banner_asset_bundle_name,
      bannerRegion: resolveBannerRegion(record),
    },
    timeline: {
      jp: {
        startAt: record.jp_start_at,
        endAt: record.jp_end_at,
      },
      cn: {
        startAt: record.cn_start_at,
        endAt: record.cn_end_at,
      },
      scheduleCn: {
        predictedStart: record.predicted_start,
        predictedEnd: record.predicted_end,
        durationDays: record.duration_days,
        hasRestDay: record.has_rest_day,
        sortOrder: record.sort_order,
      },
      trackerWindow: toTrackerWindow(record),
    },
    bonus: {
      attributes: record.attributes_jsonb,
      characters: record.characters_jsonb,
      pointPercent: record.point_percent,
      parameterPercent: record.parameter_percent,
      performancePercent: record.performance_percent,
      techniquePercent: record.technique_percent,
      visualPercent: record.visual_percent,
      members: record.members_jsonb,
      limitBreaks: record.limit_breaks_jsonb,
    },
    music: {
      jpIds: record.music_ids_jp,
      cnIds: record.music_ids_cn,
    },
  };
}

export function toBandoriEventDetail(record: BandoriEventRecord): BandoriPublicEventDetail {
  return {
    ...toBandoriEventSummary(record),
    music: {
      jpIds: record.music_ids_jp,
      cnIds: record.music_ids_cn,
      entries: {
        jp: toMusicEntries(record.music_ids_jp) ?? [],
        cn: toMusicEntries(record.music_ids_cn) ?? [],
      },
    },
  };
}

export function toBandoriEventsListResponse(records: BandoriEventRecord[]) {
  return {
    meta: {
      total: records.length,
      generatedAt: new Date().toISOString(),
    },
    events: records.map((record) => toBandoriEventSummary(record)),
  };
}

export function toLegacyBestdoriAll5Event(record: BandoriEventRecord) {
  return {
    eventType: record.event_type,
    eventName: buildRegionArray(record.event_name_jp || null, record.event_name_cn),
    assetBundleName: record.asset_bundle_name,
    bannerAssetBundleName: record.banner_asset_bundle_name,
    startAt: buildRegionArray(toTimestampText(record.jp_start_at), toTimestampText(record.cn_start_at)),
    endAt: buildRegionArray(toTimestampText(record.jp_end_at), toTimestampText(record.cn_end_at)),
    attributes: record.attributes_jsonb,
    characters: record.characters_jsonb,
    eventAttributeAndCharacterBonus: {
      pointPercent: record.point_percent ?? 0,
      parameterPercent: record.parameter_percent ?? 0,
    },
    eventCharacterParameterBonus: {
      performance: record.performance_percent ?? 0,
      technique: record.technique_percent ?? 0,
      visual: record.visual_percent ?? 0,
    },
    members: record.members_jsonb,
    limitBreaks: record.limit_breaks_jsonb,
  };
}

export function toLegacyBestdoriEventDetail(record: BandoriEventRecord) {
  return {
    ...toLegacyBestdoriAll5Event(record),
    musics: buildRegionArray(toMusicEntries(record.music_ids_jp), toMusicEntries(record.music_ids_cn)),
  };
}