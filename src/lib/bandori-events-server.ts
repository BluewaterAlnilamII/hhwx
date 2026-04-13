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
  is_skipped: boolean;
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

export type BandoriEventRecord = EventRow & {
  predicted_start: string | null;
  predicted_end: string | null;
  duration_days: number;
  has_rest_day: boolean;
  sort_order: number;
  is_skipped: boolean;
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
  "is_skipped",
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

function buildRegionArray<T>(jpValue: T | null, cnValue: T | null): [T | null, null, null, T | null] {
  return [jpValue, null, null, cnValue];
}

function toTimestampText(value: number | null): string | null {
  return value !== null && Number.isFinite(value) ? String(value) : null;
}

function toMusicEntries(musicIds: number[]): { musicId: number }[] | null {
  return musicIds.length > 0 ? musicIds.map((musicId) => ({ musicId })) : null;
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
        predicted_start: scheduleRow?.predicted_start ?? null,
        predicted_end: scheduleRow?.predicted_end ?? null,
        duration_days: scheduleRow?.duration_days ?? 7,
        has_rest_day: scheduleRow?.has_rest_day ?? true,
        sort_order: scheduleRow?.sort_order ?? eventRow.event_id,
        is_skipped: scheduleRow?.is_skipped ?? false,
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

export function toBestdoriAll5Event(record: BandoriEventRecord) {
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

export function toBestdoriEventDetail(record: BandoriEventRecord) {
  return {
    ...toBestdoriAll5Event(record),
    musics: buildRegionArray(toMusicEntries(record.music_ids_jp), toMusicEntries(record.music_ids_cn)),
  };
}