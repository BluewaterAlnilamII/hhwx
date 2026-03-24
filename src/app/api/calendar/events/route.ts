import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

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

export const dynamic = "force-dynamic";

const UPDATE_BATCH_SIZE = 5;
const UPDATE_MAX_RETRIES = 3;

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

async function createServiceClient() {
  return createServerSupabaseClient();
}

async function hasCalendarEditorRole(userId: string): Promise<boolean> {
  const serviceClient = await createServiceClient();
  const { data, error } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "calendar_editor")
    .maybeSingle();

  if (error) {
    console.error("Calendar POST API 查询 user_roles 失败:", error);
    return false;
  }

  return !!data;
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

async function updateCalendarEvent(
  serviceClient: Awaited<ReturnType<typeof createServiceClient>>,
  ev: {
    event_id: number;
    stamp?: number | null;
    predicted_start: string | null;
    predicted_end: string | null;
    duration_days: number;
    has_rest_day: boolean;
    sort_order: number;
    is_skipped: boolean;
  },
) {
  const updatePayload: Record<string, unknown> = {
    predicted_start: ev.predicted_start,
    predicted_end: ev.predicted_end,
    duration_days: ev.duration_days,
    has_rest_day: ev.has_rest_day,
    sort_order: ev.sort_order,
    is_skipped: ev.is_skipped,
    updated_at: new Date().toISOString(),
  };

  if (ev.stamp !== undefined) {
    updatePayload.stamp = ev.stamp;
  }

  for (let attempt = 1; attempt <= UPDATE_MAX_RETRIES; attempt++) {
    try {
      const result = await serviceClient
        .from("gbp_event")
        .update(updatePayload)
        .eq("event_id", ev.event_id);

      if (!result.error) {
        return { eventId: ev.event_id, error: null };
      }

      const normalizedResultError = normalizeUpdateError(result.error);

      if (attempt < UPDATE_MAX_RETRIES && isRetriableUpdateError(normalizedResultError)) {
        await sleep(attempt * 400);
        continue;
      }

      return { eventId: ev.event_id, error: normalizedResultError };
    } catch (error) {
      const normalizedError = normalizeUpdateError({
        message: error instanceof Error ? error.message : String(error),
        details: error instanceof Error ? error.cause ? String(error.cause) : null : null,
        hint: null,
      });

      if (attempt < UPDATE_MAX_RETRIES && isRetriableUpdateError(normalizedError)) {
        await sleep(attempt * 400);
        continue;
      }

      return { eventId: ev.event_id, error: normalizedError };
    }
  }

  return {
    eventId: ev.event_id,
    error: { message: "更新失败", details: "超过最大重试次数", hint: null },
  };
}

/**
 * GET /api/calendar/events
 * 读取 gbp_event 表全部数据，返回供日历渲染的活动列表。
 */
export async function GET() {
  try {
    const serviceClient = await createServiceClient();
    const { data, error } = await serviceClient
      .from("gbp_event")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("gbp_event 查询失败:", error);
      return NextResponse.json({ error: "数据库查询失败" }, { status: 500 });
    }

    const { data: characters, error: characterError } = await serviceClient
      .from("gbp_characters")
      .select(CHARACTER_SELECT_FIELDS)
      .order("character_id", { ascending: true });

    if (characterError) {
      console.error("gbp_characters 查询失败:", characterError);
    }

    return NextResponse.json({
      events: data ?? [],
      characters: characterError ? [] : (characters ?? []),
    });
  } catch (error) {
    console.error("Calendar API 错误:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * POST /api/calendar/events
 * 接收编辑后的活动数组，鉴权后做冲突检测并批量更新。
 */
export async function POST(request: Request) {
  try {
    const serviceClient = await createServiceClient();

    // 1. 鉴权：从请求头获取用户 token
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "认证失败" }, { status: 401 });
    }

    // 2. 检查权限：查询 user_roles 表
    // 为什么这么做：使用 service role key 绕过 RLS 来检查权限，
    // 因为 anon key 下 user_roles 的 RLS 要求 auth.uid() 匹配，
    // 而服务端 API 路由中的 supabase client 没有用户上下文。
    const hasPermission = await hasCalendarEditorRole(user.id);
    if (!hasPermission) {
      return NextResponse.json({ error: "没有编辑权限" }, { status: 403 });
    }

    // 3. 解析请求体
    const body = await request.json();
    const events: Array<{
      event_id: number;
      stamp?: number | null;
      predicted_start: string | null;
      predicted_end: string | null;
      duration_days: number;
      has_rest_day: boolean;
      sort_order: number;
      is_skipped: boolean;
    }> = body.events;

    if (!Array.isArray(events)) {
      return NextResponse.json({ error: "无效的请求数据" }, { status: 400 });
    }

    const stampIds = [...new Set(events.map((event) => event.stamp).filter((stamp): stamp is number => typeof stamp === "number"))];
    if (stampIds.length > 0) {
      const { data: stampCharacters, error: stampError } = await serviceClient
        .from("gbp_characters")
        .select("character_id")
        .in("character_id", stampIds);

      if (stampError) {
        return NextResponse.json(
          { error: "校验表情角色失败", details: stampError.message },
          { status: 500 },
        );
      }

      const existingStampIds = new Set((stampCharacters ?? []).map((character) => character.character_id));
      const missingStampId = stampIds.find((stampId) => !existingStampIds.has(stampId));
      if (missingStampId !== undefined) {
        return NextResponse.json(
          { error: "表情角色不存在", details: `角色 ${missingStampId} 不存在于 gbp_characters` },
          { status: 400 },
        );
      }
    }

    const nowMs = Date.now();
    const { data: ongoingEvent, error: ongoingError } = await serviceClient
      .from("gbp_event")
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

      const invalidEvent = events.find(
        (event) => !event.is_skipped && event.predicted_start && event.predicted_start < earliestSelectableDate,
      );

      if (invalidEvent) {
        return NextResponse.json(
          {
            error: "开始日期不能落在已确定国服活动占用的日期范围内",
            details: `活动 ${invalidEvent.event_id} 的开始日期 ${invalidEvent.predicted_start} 早于允许编辑的最早日期 ${earliestSelectableDate}`,
          },
          { status: 400 },
        );
      }
    }

    // 4. 冲突检测：按 predicted_start 排序，检查相邻活动无时间重叠
    const activeEvents = events
      .filter(e => !e.is_skipped && e.predicted_start && e.predicted_end)
      .sort((a, b) => (a.predicted_start! > b.predicted_start! ? 1 : -1));

    for (let i = 0; i < activeEvents.length - 1; i++) {
      const curr = activeEvents[i];
      const next = activeEvents[i + 1];
      if (curr.predicted_end! >= next.predicted_start!) {
        return NextResponse.json({
          error: `时间冲突：活动 ${curr.event_id} 的结束日期 (${curr.predicted_end}) 与活动 ${next.event_id} 的开始日期 (${next.predicted_start}) 重叠`
        }, { status: 409 });
      }
    }

    // 5. 分批更新
    // 为什么这么做：之前一次性并发更新全部活动，容易在窄网络环境下触发 Supabase REST 连接超时。
    // 改为小批量并发并对网络超时重试，能明显降低保存失败概率。
    const failures: Array<{
      eventId: number;
      error: { message?: string | null; details?: string | null; hint?: string | null };
    }> = [];

    for (let index = 0; index < events.length; index += UPDATE_BATCH_SIZE) {
      const batch = events.slice(index, index + UPDATE_BATCH_SIZE);
      const batchResults = await Promise.all(batch.map((event) => updateCalendarEvent(serviceClient, event)));

      for (const result of batchResults) {
        if (result.error) {
          failures.push({ eventId: result.eventId, error: result.error });
        }
      }
    }

    if (failures.length > 0) {
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

    return NextResponse.json({ success: true, updated: events.length });
  } catch (error) {
    console.error("Calendar POST API 错误:", error);
    return NextResponse.json(
      {
        error: "服务器内部错误",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
