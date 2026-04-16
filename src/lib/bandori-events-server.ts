import type { CalendarCharacter } from "@/lib/calendar-character-service";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  BANDORI_CHARACTERS_TABLE,
  BANDORI_EVENT_BONUSES_TABLE,
  BANDORI_EVENTS_TABLE,
  BANDORI_EVENT_SCHEDULES_CN_TABLE,
} from "@/lib/supabase-table-names";


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

type CharacterRow = {
  character_id: number;
  character_type: string;
  band_id: number;
  color_code: string | null;
  character_name_jp: string;
  character_name_en: string;
  character_name_tw: string | null;
  character_name_cn: string | null;
  first_name_jp: string;
  first_name_en: string;
  first_name_tw: string | null;
  first_name_cn: string | null;
  last_name_jp: string;
  last_name_en: string;
  last_name_tw: string | null;
  last_name_cn: string | null;
  nickname_jp: string | null;
  nickname_en: string | null;
  nickname_tw: string | null;
  nickname_cn: string | null;
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
};

export type BandoriEventBonusRecord = {
  eventId: number;
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

export type BandoriScheduleEvent = {
  eventId: number;
  predictedStart: string | null;
  predictedEnd: string | null;
  durationDays: number;
  hasRestDay: boolean;
  sortOrder: number;
};

export type BandoriPublicEventSummary = {
  eventId: number;
  eventType: string;
  name: {
    jp: string;
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
      startAt: number;
      endAt: number;
    };
    cn: {
      startAt: number | null;
      endAt: number | null;
    };
    cnSchedule?: {
      startAt: number;
      endAt: number;
    };
  };
  musicIds: {
    jp: number[];
    cn: number[];
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

// cnSchedule 只在“官方国服时间还不存在，但本地已经维护了预测排期”时输出。
// 这样 events DTO 可以同时满足 tracker 的时间窗需求，又不会在官方时间已知时
// 额外重复一份和 timeline.cn 完全相同的数据。
function toCnSchedule(record: BandoriEventRecord): BandoriPublicEventSummary["timeline"]["cnSchedule"] {
  if (record.cn_start_at !== null && record.cn_end_at !== null) {
    return undefined;
  }

  if (record.predicted_start && record.predicted_end) {
    return {
      startAt: Date.parse(`${record.predicted_start}T15:00:00+08:00`),
      endAt: Date.parse(`${record.predicted_end}T22:59:59+08:00`),
    };
  }

  return undefined;
}

function toBandoriEventBonusRecord(row: BonusRow): BandoriEventBonusRecord {
  return {
    eventId: row.event_id,
    attributes: normalizeJsonArray(row.attributes_jsonb),
    characters: normalizeJsonArray(row.characters_jsonb),
    pointPercent: normalizeNullableNumber(row.point_percent),
    parameterPercent: normalizeNullableNumber(row.parameter_percent),
    performancePercent: normalizeNullableNumber(row.performance_percent),
    techniquePercent: normalizeNullableNumber(row.technique_percent),
    visualPercent: normalizeNullableNumber(row.visual_percent),
    members: normalizeJsonArray(row.members_jsonb),
    limitBreaks: normalizeJsonArray(row.limit_breaks_jsonb),
  };
}

function toCalendarCharacter(row: CharacterRow): CalendarCharacter {
  return {
    characterId: row.character_id,
    characterType: row.character_type,
    bandId: row.band_id,
    colorCode: row.color_code,
    characterNameJp: row.character_name_jp,
    characterNameEn: row.character_name_en,
    characterNameTw: row.character_name_tw,
    characterNameCn: row.character_name_cn,
    firstNameJp: row.first_name_jp,
    firstNameEn: row.first_name_en,
    firstNameTw: row.first_name_tw,
    firstNameCn: row.first_name_cn,
    lastNameJp: row.last_name_jp,
    lastNameEn: row.last_name_en,
    lastNameTw: row.last_name_tw,
    lastNameCn: row.last_name_cn,
    nicknameJp: row.nickname_jp,
    nicknameEn: row.nickname_en,
    nicknameTw: row.nickname_tw,
    nicknameCn: row.nickname_cn,
  };
}

export async function fetchBandoriCharacters(): Promise<CalendarCharacter[]> {
  const serviceClient = createServerSupabaseClient();
  const { data, error } = await serviceClient
    .from(BANDORI_CHARACTERS_TABLE)
    .select(CHARACTER_SELECT_FIELDS)
    .order("character_id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as CharacterRow[]).map((row) => toCalendarCharacter(row));
}

/**
 * 单独读取活动 bonus 资源。
 *
 * 为什么拆成独立查询：
 * 当前 eventtracker、calendar、ICS 和 schedule 编辑都不依赖 bonus，
 * 如果继续在活动目录查询里顺带拉取 bandori_event_bonuses，会让每次活动目录读取都多出一份无用 payload。
 * 将其拆成独立 API 后，只有真正需要活动加成的页面才会触发这张表的读取。
 */
export async function fetchBandoriEventBonuses(options?: { eventId?: number }): Promise<BandoriEventBonusRecord[]> {
  const serviceClient = createServerSupabaseClient();
  let bonusQuery = serviceClient
    .from(BANDORI_EVENT_BONUSES_TABLE)
    .select(BONUS_SELECT_FIELDS)
    .order("event_id", { ascending: true });

  if (options?.eventId !== undefined) {
    bonusQuery = bonusQuery.eq("event_id", options.eventId);
  }

  const { data, error } = await bonusQuery;
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as BonusRow[]).map((row) => toBandoriEventBonusRecord(row));
}

/**
 * 读取 Bandori 活动目录三表并合成为统一记录。
 *
 * 为什么这里要保留 has_schedule_row：
 * 删除 is_skipped 之后，未来时间线是否保留该活动改成由 schedule 行是否存在来表达。
 * 但前端仍然需要区分“官方时间已知但被移出未来时间线”和“官方时间已知且仍在时间线中”，
 * 所以这里把 schedule 行存在性显式带出来，避免每个调用方重复推断。
 */
export async function fetchBandoriEventRecords(options?: { eventId?: number }): Promise<BandoriEventRecord[]> {
  const serviceClient = createServerSupabaseClient();

  let eventsQuery = serviceClient
    .from(BANDORI_EVENTS_TABLE)
    .select(EVENT_SELECT_FIELDS)
    .order("event_id", { ascending: true });

  let scheduleQuery = serviceClient
    .from(BANDORI_EVENT_SCHEDULES_CN_TABLE)
    .select(SCHEDULE_SELECT_FIELDS)
    .order("sort_order", { ascending: true });

  if (options?.eventId !== undefined) {
    eventsQuery = eventsQuery.eq("event_id", options.eventId);
    scheduleQuery = scheduleQuery.eq("event_id", options.eventId);
  }

  const [eventsResult, scheduleResult] = await Promise.all([
    eventsQuery,
    scheduleQuery,
  ]);

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }
  if (scheduleResult.error) {
    throw new Error(scheduleResult.error.message);
  }

  const scheduleMap = new Map<number, ScheduleRow>(
    ((scheduleResult.data ?? []) as unknown as ScheduleRow[]).map((row) => [row.event_id, row]),
  );

  return ((eventsResult.data ?? []) as unknown as EventRow[])
    .map((eventRow) => {
      const scheduleRow = scheduleMap.get(eventRow.event_id);

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
      } satisfies BandoriEventRecord;
    })
    .sort((left, right) => {
      if (left.sort_order !== right.sort_order) {
        return left.sort_order - right.sort_order;
      }
      return left.event_id - right.event_id;
    });
}

// calendar/cn/schedule 现在只承担“未来排期补充层”，
// 因此这里只暴露 schedule 表本身的字段，并统一转换成前端可直接消费的小驼峰命名。
export function toBandoriScheduleEvent(record: BandoriEventRecord): BandoriScheduleEvent {
  return {
    eventId: record.event_id,
    predictedStart: record.predicted_start,
    predictedEnd: record.predicted_end,
    durationDays: record.duration_days,
    hasRestDay: record.has_rest_day,
    sortOrder: record.sort_order,
  };
}

export function toBandoriEventSummary(record: BandoriEventRecord): BandoriPublicEventSummary {
  const cnSchedule = toCnSchedule(record);

  return {
    eventId: record.event_id,
    eventType: record.event_type,
    name: {
      jp: record.event_name_jp,
      cn: record.event_name_cn,
    },
    asset: {
      bundleName: record.asset_bundle_name,
      bannerBundleName: record.banner_asset_bundle_name,
    },
    band: record.band,
    stampCharacterId: record.stamp_character_id,
    timeline: {
      jp: {
        startAt: record.jp_start_at,
        endAt: record.jp_end_at,
      },
      cn: {
        startAt: record.cn_start_at,
        endAt: record.cn_end_at,
      },
      ...(cnSchedule ? { cnSchedule } : {}),
    },
    musicIds: {
      jp: record.music_ids_jp,
      cn: record.music_ids_cn,
    },
  };
}

export function toBandoriEventsListResponse(records: BandoriEventRecord[]) {
  return {
    events: records.map((record) => toBandoriEventSummary(record)),
  };
}
