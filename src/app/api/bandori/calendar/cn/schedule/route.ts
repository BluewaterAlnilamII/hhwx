import { NextResponse } from "next/server";
import { revalidateTag, unstable_cache } from "next/cache";
import {
  BANDORI_EVENTS_CACHE_TAG,
  BANDORI_SCHEDULE_CACHE_TAG,
  LIVE_API_CACHE_CONTROL,
  PUBLIC_SHORT_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import {
  fetchBandoriEventRecords,
  toBandoriScheduleEvent,
  type BandoriEventRecord,
} from "@/lib/bandori-events-server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  BANDORI_EVENTS_TABLE,
  BANDORI_EVENT_SCHEDULES_CN_TABLE,
  USER_ROLES_TABLE,
} from "@/lib/supabase-table-names";

export const dynamic = "force-dynamic";

const UPDATE_BATCH_SIZE = 5;
const UPDATE_MAX_RETRIES = 3;

const readBandoriScheduleResponse = unstable_cache(
  async () => {
    const nowMs = Date.now();
    const todayChinaDate = toChinaDateText(nowMs);
    const events = await fetchBandoriEventRecords();

    return {
      events: events
        .filter((record) => shouldExposeScheduleRecord(record, nowMs, todayChinaDate))
        .map((record) => toBandoriScheduleEvent(record)),
    };
  },
  ["bandori-schedule-cn-route:v2"],
  { revalidate: 300, tags: [BANDORI_EVENTS_CACHE_TAG, BANDORI_SCHEDULE_CACHE_TAG] },
);

type ScheduleWritePayload = {
  eventId: number;
  predictedStart: string | null;
  predictedEnd: string | null;
  durationDays: number;
  hasRestDay: boolean;
  sortOrder: number;
};

function normalizeNullableDateText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeScheduleWritePayload(value: unknown): ScheduleWritePayload | null {
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

function isScheduleDeletionPayload(event: ScheduleWritePayload) {
  return !event.predictedStart && !event.predictedEnd;
}

function normalizeExternalErrorText(value: string | null | undefined): string | null {
  if (!value) return null;

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

function normalizeUpdateError(error: { message?: string | null; details?: string | null; hint?: string | null } | null | undefined) {
  if (!error) return null;

  return {
    message: normalizeExternalErrorText(error.message) ?? error.message ?? null,
    details: normalizeExternalErrorText(error.details) ?? error.details ?? null,
    hint: normalizeExternalErrorText(error.hint) ?? error.hint ?? null,
  };
}

function isRetriableUpdateError(error: { message?: string | null; details?: string | null; hint?: string | null } | null | undefined): boolean {
  if (!error) return false;

  const text = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return text.includes("fetch failed") || text.includes("connect timeout") || text.includes("timeout") || text.includes("bad gateway") || text.includes("502");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toChinaDateText(timestampMs: number) {
  return new Date(timestampMs + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 业务规则：calendar/cn/schedule 只保留“当前与未来”排期。
// 因此不管请求来自同步任务还是手工编辑，只要活动已结束，
// 都应该视为不可持久化对象，并在必要时主动删除已有 schedule 行。
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

// 业务规则：未来时间线里的“跳过活动”不再用布尔字段表达，
// 而是通过 schedule 行不存在来表达。这里在 GET 阶段统一做一次过滤，
// 避免前端重新理解 has_schedule_row 的底层语义。
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

async function hasCalendarEditorRole(userId: string): Promise<boolean> {
  const serviceClient = createServerSupabaseClient();
  const { data, error } = await serviceClient
    .from(USER_ROLES_TABLE)
    .select("role")
    .eq("user_id", userId)
    .eq("role", "calendar_editor")
    .maybeSingle();

  if (error) {
    console.error("Bandori schedule POST API 查询 user_roles 失败:", error);
    return false;
  }

  return !!data;
}

async function updateScheduleEvent(
  serviceClient: ReturnType<typeof createServerSupabaseClient>,
  event: ScheduleWritePayload,
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

export async function GET() {
  try {
    return NextResponse.json(await readBandoriScheduleResponse(), {
      headers: withCacheControl(PUBLIC_SHORT_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori schedule API 错误:", error);
    return NextResponse.json({ error: "服务器内部错误" }, {
      status: 500,
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}

function revalidateBandoriTimelineCaches() {
  revalidateTag(BANDORI_EVENTS_CACHE_TAG, "max");
  revalidateTag(BANDORI_SCHEDULE_CACHE_TAG, "max");
}

export async function POST(request: Request) {
  try {
    const serviceClient = createServerSupabaseClient();
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "认证失败" }, { status: 401 });
    }

    // 为什么这里仍然使用 service role 查询权限：
    // 这个写接口需要在服务端统一鉴权并绕过 RLS 读 user_roles，
    // 否则 API 路由内没有稳定的用户上下文去复用客户端那套权限判断。
    const hasPermission = await hasCalendarEditorRole(user.id);
    if (!hasPermission) {
      return NextResponse.json({ error: "没有编辑权限" }, { status: 403 });
    }

    const body = await request.json();
    const events: ScheduleWritePayload[] | null = Array.isArray(body.events)
      ? body.events.map(normalizeScheduleWritePayload).filter((event: ScheduleWritePayload | null): event is ScheduleWritePayload => event !== null)
      : null;

    if (!events) {
      return NextResponse.json({ error: "无效的请求数据" }, { status: 400 });
    }

    const invalidDateRangeEvent = events.find((event) => {
      const hasStart = Boolean(event.predictedStart);
      const hasEnd = Boolean(event.predictedEnd);
      return hasStart !== hasEnd;
    });

    if (invalidDateRangeEvent) {
      return NextResponse.json(
        {
          error: "开始日期和结束日期必须同时填写，或同时清空",
          details: `活动 ${invalidDateRangeEvent.eventId} 的预测日期不完整`,
        },
        { status: 400 },
      );
    }

    const nowMs = Date.now();
    const todayChinaDate = toChinaDateText(nowMs);
    const eventIds = Array.from(new Set(
      events
        .map((event) => Number(event.eventId))
        .filter((eventId) => Number.isFinite(eventId) && eventId > 0),
    ));

    if (eventIds.length === 0) {
      return NextResponse.json({ success: true, updated: 0, skippedPast: 0 });
    }

    const requestEventMap = new Map(events.map((event) => [Number(event.eventId), event]));

    const { data: lifecycleRows, error: lifecycleError } = await serviceClient
      .from(BANDORI_EVENTS_TABLE)
      .select("event_id, cn_end_at")
      .in("event_id", eventIds);

    if (lifecycleError) {
      return NextResponse.json(
        { error: "读取活动生命周期失败", details: lifecycleError.message },
        { status: 500 },
      );
    }

    const lifecycleMap = new Map<number, { event_id: number; cn_end_at: number | null }>(
      (lifecycleRows ?? []).map((row) => [Number(row.event_id), { event_id: Number(row.event_id), cn_end_at: row.cn_end_at ? Number(row.cn_end_at) : null }]),
    );

    const unknownEventIds = eventIds.filter((eventId) => !lifecycleMap.has(eventId));
    if (unknownEventIds.length > 0) {
      return NextResponse.json(
        {
          error: "请求中包含未知活动",
          details: `未知 eventId: ${unknownEventIds.slice(0, 10).join(", ")}`,
        },
        { status: 400 },
      );
    }

    const ignoredPastEventIds = eventIds.filter((eventId) => {
      const source = lifecycleMap.get(eventId);
      if (!source) return false;

      const requestEvent = requestEventMap.get(eventId);
      if (!requestEvent) return false;

      return !shouldPersistScheduleEvent(requestEvent, source, nowMs, todayChinaDate);
    });

    const deletionEventIds = events
      .filter((event) => isScheduleDeletionPayload(event))
      .map((event) => Number(event.eventId));

    const scheduleRowIdsToDelete = Array.from(new Set([...ignoredPastEventIds, ...deletionEventIds]));

    if (scheduleRowIdsToDelete.length > 0) {
      const deleteResult = await serviceClient
        .from(BANDORI_EVENT_SCHEDULES_CN_TABLE)
        .delete()
        .in("event_id", scheduleRowIdsToDelete);

      if (deleteResult.error) {
        return NextResponse.json(
          { error: "清理历史排期失败", details: deleteResult.error.message },
          { status: 500 },
        );
      }
    }

    const editableEvents = events.filter((event) => {
      const source = lifecycleMap.get(Number(event.eventId));
      if (!source) return false;
      return shouldPersistScheduleEvent(event, source, nowMs, todayChinaDate);
    });

    const upsertEvents = editableEvents.filter((event) => !isScheduleDeletionPayload(event));

    if (upsertEvents.length === 0) {
      if (scheduleRowIdsToDelete.length > 0) {
        revalidateBandoriTimelineCaches();
      }
      return NextResponse.json({
        success: true,
        updated: 0,
        deleted: deletionEventIds.length,
        skippedPast: ignoredPastEventIds.length,
      });
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
      return NextResponse.json(
        { error: "读取当前国服活动失败", details: ongoingError.message },
        { status: 500 },
      );
    }

    if (ongoingEvent?.cn_end_at) {
      const lockedUntil = new Date(Number(ongoingEvent.cn_end_at));
      lockedUntil.setDate(lockedUntil.getDate() + 1);
      const earliestSelectableDate = lockedUntil.toISOString().slice(0, 10);

      const invalidEvent = upsertEvents.find(
        (event) => event.predictedStart && event.predictedStart < earliestSelectableDate,
      );

      if (invalidEvent) {
        return NextResponse.json(
          {
            error: "开始日期不能落在已确定国服活动占用的日期范围内",
            details: `活动 ${invalidEvent.eventId} 的开始日期 ${invalidEvent.predictedStart} 早于允许编辑的最早日期 ${earliestSelectableDate}`,
          },
          { status: 400 },
        );
      }
    }

    const activeEvents = upsertEvents
      .filter((event) => event.predictedStart && event.predictedEnd)
      .sort((left, right) => (left.predictedStart! > right.predictedStart! ? 1 : -1));

    // 为什么冲突检测只看 activeEvents：
    // calendar/cn/schedule 现在不再支持“跳过但保留占位行”的状态，
    // 因此凡是被提交的可编辑对象都应该形成一条连续时间线，
    // 这里只需要确保相邻区间没有重叠即可。
    for (let index = 0; index < activeEvents.length - 1; index += 1) {
      const currentEvent = activeEvents[index];
      const nextEvent = activeEvents[index + 1];
      if (currentEvent.predictedEnd! >= nextEvent.predictedStart!) {
        return NextResponse.json(
          {
            error: `时间冲突：活动 ${currentEvent.eventId} 的结束日期 (${currentEvent.predictedEnd}) 与活动 ${nextEvent.eventId} 的开始日期 (${nextEvent.predictedStart}) 重叠`,
          },
          { status: 409 },
        );
      }
    }

    const failures: Array<{
      eventId: number;
      error: { message?: string | null; details?: string | null; hint?: string | null };
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
        ? [`活动 ${firstFailure.eventId}`, firstError.message, firstError.details, firstError.hint].filter(Boolean).join(" | ")
        : "未知数据库错误";
      return NextResponse.json(
        {
          error: "部分数据更新失败",
          details,
        },
        { status: 500 },
      );
    }

    revalidateBandoriTimelineCaches();
    return NextResponse.json({
      success: true,
      updated: upsertEvents.length,
      deleted: deletionEventIds.length,
      skippedPast: ignoredPastEventIds.length,
    });
  } catch (error) {
    console.error("Bandori schedule POST API 错误:", error);
    return NextResponse.json(
      {
        error: "服务器内部错误",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}