import { revalidateTag, unstable_cache } from "next/cache";
import { ApiRouteError } from "@/lib/api-contracts";
import {
  BANDORI_EVENTS_CACHE_TAG,
  BANDORI_SCHEDULE_CACHE_TAG,
} from "@/lib/api-cache";
import {
  fetchBandoriEventRecords,
  toBandoriScheduleEvent,
  type BandoriEventRecord,
  type BandoriScheduleEvent,
} from "@/lib/bandori-events-server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  BANDORI_EVENTS_TABLE,
  BANDORI_EVENT_SCHEDULES_CN_TABLE,
  USER_ROLES_TABLE,
} from "@/lib/supabase-table-names";

const UPDATE_BATCH_SIZE = 5;
const UPDATE_MAX_RETRIES = 3;

type ScheduleLifecycleRow = {
  event_id: number;
  cn_end_at: number | null;
};

type OngoingCnEventRow = {
  event_id: number;
  cn_end_at: number | null;
};

type NormalizedUpdateError = {
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export type BandoriScheduleWritePayload = {
  eventId: number;
  predictedStart: string | null;
  predictedEnd: string | null;
  durationDays: number;
  hasRestDay: boolean;
  sortOrder: number;
};

export type BandoriScheduleWriteResult = {
  updated: number;
  deleted: number;
  skippedPast: number;
};

type BandoriScheduleResponseData = {
  events: BandoriScheduleEvent[];
};

const readBandoriScheduleResponseDataCached = unstable_cache(
  async (): Promise<BandoriScheduleResponseData> => {
    const nowMs = Date.now();
    const todayChinaDate = toChinaDateText(nowMs);
    const events = await fetchBandoriEventRecords();

    return {
      events: events
        .filter((record) => shouldExposeScheduleRecord(record, nowMs, todayChinaDate))
        .map((record) => toBandoriScheduleEvent(record)),
    };
  },
  ["bandori-schedules-cn-route:v4"],
  { revalidate: 300, tags: [BANDORI_EVENTS_CACHE_TAG, BANDORI_SCHEDULE_CACHE_TAG] },
);

function normalizeNullableDateText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeScheduleWritePayload(value: unknown): BandoriScheduleWritePayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const eventId = Number(raw.eventId);
  if (!Number.isFinite(eventId) || eventId <= 0) {
    return null;
  }

  const durationDays = Number(raw.durationDays);
  const sortOrder = Number(raw.sortOrder);

  return {
    eventId,
    predictedStart: normalizeNullableDateText(raw.predictedStart),
    predictedEnd: normalizeNullableDateText(raw.predictedEnd),
    durationDays: Number.isFinite(durationDays) && durationDays > 0 ? durationDays : 7,
    hasRestDay: Boolean(raw.hasRestDay),
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : eventId,
  };
}

function isScheduleDeletionPayload(event: BandoriScheduleWritePayload) {
  return !event.predictedStart && !event.predictedEnd;
}

function canonicalizeScheduleOrder(events: BandoriScheduleWritePayload[]): BandoriScheduleWritePayload[] {
  return events.map((event, index) => ({
    ...event,
    sortOrder: index,
  }));
}

function normalizeExternalErrorText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();

  if (trimmed.startsWith("<!DOCTYPE html") || trimmed.startsWith("<html")) {
    if (normalized.includes("502") || normalized.includes("bad gateway")) {
      return "Supabase 网关暂时不可用（502 Bad Gateway）";
    }

    return "上游服务返回了异常 HTML 错误页";
  }

  if (normalized.includes("bad gateway") || normalized.includes("502")) {
    return "Supabase 网关暂时不可用（502 Bad Gateway）";
  }

  return trimmed;
}

function normalizeUpdateError(error: NormalizedUpdateError | null | undefined): NormalizedUpdateError | null {
  if (!error) {
    return null;
  }

  return {
    message: normalizeExternalErrorText(error.message) ?? error.message ?? null,
    details: normalizeExternalErrorText(error.details) ?? error.details ?? null,
    hint: normalizeExternalErrorText(error.hint) ?? error.hint ?? null,
  };
}

function isRetriableUpdateError(error: NormalizedUpdateError | null | undefined): boolean {
  if (!error) {
    return false;
  }

  const text = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return text.includes("fetch failed")
    || text.includes("connect timeout")
    || text.includes("timeout")
    || text.includes("bad gateway")
    || text.includes("502");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toChinaDateText(timestampMs: number) {
  return new Date(timestampMs + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function shouldPersistScheduleEvent(
  event: { predictedEnd?: string | null; predicted_end?: string | null },
  source: { cn_end_at: number | null },
  nowMs: number,
  todayChinaDate: string,
) {
  const predictedEnd = event.predictedEnd ?? event.predicted_end ?? null;

  if (source.cn_end_at !== null && Number(source.cn_end_at) < nowMs) {
    return false;
  }

  if (source.cn_end_at === null && predictedEnd && predictedEnd < todayChinaDate) {
    return false;
  }

  return true;
}

function shouldExposeScheduleRecord(record: BandoriEventRecord, nowMs: number, todayChinaDate: string) {
  if (!record.has_schedule_row) {
    return false;
  }

  if (record.cn_start_at !== null && record.cn_start_at <= nowMs) {
    return false;
  }

  return shouldPersistScheduleEvent(
    { predicted_end: record.predicted_end },
    { cn_end_at: record.cn_end_at },
    nowMs,
    todayChinaDate,
  );
}

function revalidateBandoriTimelineCaches() {
  revalidateTag(BANDORI_EVENTS_CACHE_TAG, "max");
  revalidateTag(BANDORI_SCHEDULE_CACHE_TAG, "max");
}

async function updateScheduleEvent(
  serviceClient: ReturnType<typeof createServerSupabaseClient>,
  event: BandoriScheduleWritePayload,
) {
  const updatePayload: Record<string, unknown> = {
    event_id: event.eventId,
    predicted_start: event.predictedStart,
    predicted_end: event.predictedEnd,
    duration_days: event.durationDays,
    has_rest_day: event.hasRestDay,
    sort_order: event.sortOrder,
  };

  for (let attempt = 1; attempt <= UPDATE_MAX_RETRIES; attempt += 1) {
    try {
      const result = await serviceClient
        .from(BANDORI_EVENT_SCHEDULES_CN_TABLE)
        .upsert(updatePayload, { onConflict: "event_id" });

      if (!result.error) {
        return { eventId: event.eventId, error: null };
      }

      const normalizedResultError = normalizeUpdateError(result.error);

      if (attempt < UPDATE_MAX_RETRIES && isRetriableUpdateError(normalizedResultError)) {
        await sleep(attempt * 400);
        continue;
      }

      return { eventId: event.eventId, error: normalizedResultError };
    } catch (error) {
      const normalizedError = normalizeUpdateError({
        message: error instanceof Error ? error.message : String(error),
        details: error instanceof Error && error.cause ? String(error.cause) : null,
        hint: null,
      });

      if (attempt < UPDATE_MAX_RETRIES && isRetriableUpdateError(normalizedError)) {
        await sleep(attempt * 400);
        continue;
      }

      return { eventId: event.eventId, error: normalizedError };
    }
  }

  return {
    eventId: event.eventId,
    error: { message: "更新失败", details: "超过最大重试次数", hint: null },
  };
}

export async function readBandoriScheduleResponseData(): Promise<BandoriScheduleResponseData> {
  return readBandoriScheduleResponseDataCached();
}

export async function ensureBandoriCalendarEditor(userId: string): Promise<void> {
  const serviceClient = createServerSupabaseClient();
  const { data, error } = await serviceClient
    .from(USER_ROLES_TABLE)
    .select("role")
    .eq("user_id", userId)
    .eq("role", "calendar_editor")
    .maybeSingle();

  if (error) {
    throw new ApiRouteError(500, "USER_ROLE_READ_FAILED", "读取用户权限失败", error.message);
  }

  if (!data) {
    throw new ApiRouteError(403, "CALENDAR_EDITOR_REQUIRED", "没有编辑权限");
  }
}

export function parseBandoriScheduleWritePayloads(body: unknown): BandoriScheduleWritePayload[] {
  if (!body || typeof body !== "object" || !Array.isArray((body as { events?: unknown }).events)) {
    throw new ApiRouteError(400, "INVALID_REQUEST_BODY", "无效的请求数据");
  }

  const events = (body as { events: unknown[] }).events
    .map((event) => normalizeScheduleWritePayload(event))
    .filter((event): event is BandoriScheduleWritePayload => event !== null);

  const invalidDateRangeEvent = events.find((event) => {
    const hasStart = Boolean(event.predictedStart);
    const hasEnd = Boolean(event.predictedEnd);
    return hasStart !== hasEnd;
  });

  if (invalidDateRangeEvent) {
    throw new ApiRouteError(
      400,
      "INCOMPLETE_SCHEDULE_RANGE",
      "开始日期和结束日期必须同时填写，或同时清空",
      `活动 ${invalidDateRangeEvent.eventId} 的预测日期不完整`,
    );
  }

  return events;
}

export async function saveBandoriScheduleEvents(
  events: BandoriScheduleWritePayload[],
): Promise<BandoriScheduleWriteResult> {
  const serviceClient = createServerSupabaseClient();
  const nowMs = Date.now();
  const todayChinaDate = toChinaDateText(nowMs);
  const eventIds = Array.from(new Set(
    events
      .map((event) => Number(event.eventId))
      .filter((eventId) => Number.isFinite(eventId) && eventId > 0),
  ));

  if (eventIds.length === 0) {
    return { updated: 0, deleted: 0, skippedPast: 0 };
  }

  const requestEventMap = new Map(events.map((event) => [Number(event.eventId), event]));

  const { data: lifecycleRows, error: lifecycleError } = await serviceClient
    .from(BANDORI_EVENTS_TABLE)
    .select("event_id, cn_end_at")
    .in("event_id", eventIds);

  if (lifecycleError) {
    throw new ApiRouteError(500, "EVENT_LIFECYCLE_READ_FAILED", "读取活动生命周期失败", lifecycleError.message);
  }

  const lifecycleMap = new Map<number, ScheduleLifecycleRow>(
    ((lifecycleRows ?? []) as ScheduleLifecycleRow[]).map((row) => [
      Number(row.event_id),
      {
        event_id: Number(row.event_id),
        cn_end_at: row.cn_end_at ? Number(row.cn_end_at) : null,
      },
    ]),
  );

  const unknownEventIds = eventIds.filter((eventId) => !lifecycleMap.has(eventId));
  if (unknownEventIds.length > 0) {
    throw new ApiRouteError(
      400,
      "UNKNOWN_EVENT_IDS",
      "请求中包含未知活动",
      `未知 eventId: ${unknownEventIds.slice(0, 10).join(", ")}`,
    );
  }

  const ignoredPastEventIds = eventIds.filter((eventId) => {
    const source = lifecycleMap.get(eventId);
    if (!source) {
      return false;
    }

    const requestEvent = requestEventMap.get(eventId);
    if (!requestEvent) {
      return false;
    }

    return !shouldPersistScheduleEvent(requestEvent, source, nowMs, todayChinaDate);
  });

  const deletionEventIds = events
    .filter((event) => isScheduleDeletionPayload(event))
    .map((event) => Number(event.eventId));

  const scheduleRowIdsToDelete = Array.from(new Set([...ignoredPastEventIds, ...deletionEventIds]));
  let didMutate = false;

  if (scheduleRowIdsToDelete.length > 0) {
    const deleteResult = await serviceClient
      .from(BANDORI_EVENT_SCHEDULES_CN_TABLE)
      .delete()
      .in("event_id", scheduleRowIdsToDelete);

    if (deleteResult.error) {
      throw new ApiRouteError(500, "SCHEDULE_DELETE_FAILED", "清理历史排期失败", deleteResult.error.message);
    }

    didMutate = true;
  }

  const editableEvents = events.filter((event) => {
    const source = lifecycleMap.get(Number(event.eventId));
    if (!source) {
      return false;
    }

    return shouldPersistScheduleEvent(event, source, nowMs, todayChinaDate);
  });

  const upsertEvents = canonicalizeScheduleOrder(
    editableEvents.filter((event) => !isScheduleDeletionPayload(event)),
  );

  if (upsertEvents.length === 0) {
    if (didMutate) {
      revalidateBandoriTimelineCaches();
    }

    return {
      updated: 0,
      deleted: deletionEventIds.length,
      skippedPast: ignoredPastEventIds.length,
    };
  }

  const { data: ongoingEvent, error: ongoingError } = await serviceClient
    .from(BANDORI_EVENTS_TABLE)
    .select("event_id, cn_end_at")
    .not("cn_start_at", "is", null)
    .not("cn_end_at", "is", null)
    .lte("cn_start_at", nowMs)
    .gte("cn_end_at", nowMs)
    .order("cn_end_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ongoingError) {
    throw new ApiRouteError(500, "ONGOING_EVENT_READ_FAILED", "读取当前国服活动失败", ongoingError.message);
  }

  if ((ongoingEvent as OngoingCnEventRow | null)?.cn_end_at) {
    const lockedUntil = new Date(Number((ongoingEvent as OngoingCnEventRow).cn_end_at));
    lockedUntil.setDate(lockedUntil.getDate() + 1);
    const earliestSelectableDate = lockedUntil.toISOString().slice(0, 10);

    const invalidEvent = upsertEvents.find(
      (event) => event.predictedStart && event.predictedStart < earliestSelectableDate,
    );

    if (invalidEvent) {
      throw new ApiRouteError(
        400,
        "SCHEDULE_DATE_LOCKED",
        "开始日期不能落在已确定国服活动占用的日期范围内",
        `活动 ${invalidEvent.eventId} 的开始日期 ${invalidEvent.predictedStart} 早于允许编辑的最早日期 ${earliestSelectableDate}`,
      );
    }
  }

  const activeEvents = upsertEvents
    .filter((event) => event.predictedStart && event.predictedEnd)
    .sort((left, right) => (left.predictedStart! > right.predictedStart! ? 1 : -1));

  for (let index = 0; index < activeEvents.length - 1; index += 1) {
    const currentEvent = activeEvents[index];
    const nextEvent = activeEvents[index + 1];

    if (currentEvent.predictedEnd! >= nextEvent.predictedStart!) {
      throw new ApiRouteError(
        409,
        "SCHEDULE_CONFLICT",
        `时间冲突：活动 ${currentEvent.eventId} 的结束日期 (${currentEvent.predictedEnd}) 与活动 ${nextEvent.eventId} 的开始日期 (${nextEvent.predictedStart}) 重叠`,
      );
    }
  }

  const failures: Array<{
    eventId: number;
    error: NormalizedUpdateError;
  }> = [];

  for (let index = 0; index < upsertEvents.length; index += UPDATE_BATCH_SIZE) {
    const batch = upsertEvents.slice(index, index + UPDATE_BATCH_SIZE);
    const batchResults = await Promise.all(batch.map((event) => updateScheduleEvent(serviceClient, event)));

    for (const result of batchResults) {
      if (result.error) {
        failures.push({ eventId: result.eventId, error: result.error });
      }
    }
  }

  if (failures.length > 0) {
    revalidateBandoriTimelineCaches();
    console.error("部分更新失败:", failures);
    const firstFailure = failures[0];
    const firstError = firstFailure?.error;
    const details = firstError
      ? [
        `活动 ${firstFailure.eventId}`,
        firstError.message,
        firstError.details,
        firstError.hint,
      ].filter(Boolean).join(" | ")
      : "未知数据库错误";

    throw new ApiRouteError(500, "SCHEDULE_PARTIAL_UPDATE_FAILED", "部分数据更新失败", details);
  }

  revalidateBandoriTimelineCaches();
  return {
    updated: upsertEvents.length,
    deleted: deletionEventIds.length,
    skippedPast: ignoredPastEventIds.length,
  };
}
