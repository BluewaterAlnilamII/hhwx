import {
  ensureBandoriCalendarEditor,
  parseBandoriScheduleWritePayloads,
  readBandoriScheduleResponseData,
  saveBandoriScheduleEvents,
} from "@/lib/bandori-schedule-server";
import {
  LIVE_API_CACHE_CONTROL,
  PUBLIC_SHORT_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return jsonSuccess(await readBandoriScheduleResponseData(), {
      headers: withCacheControl(PUBLIC_SHORT_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori schedules API 错误:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_SCHEDULES_READ_FAILED",
      message: "读取国服活动排期失败",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return jsonError(401, "UNAUTHENTICATED", "未登录");
    }

    const serviceClient = createServerSupabaseClient();
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await serviceClient.auth.getUser(token);

    if (authError || !user) {
      return jsonError(401, "AUTHENTICATION_FAILED", "认证失败");
    }

    await ensureBandoriCalendarEditor(user.id);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    const events = parseBandoriScheduleWritePayloads(body);
    const result = await saveBandoriScheduleEvents(events);
    return jsonSuccess(result);
  } catch (error) {
    console.error("Bandori schedules POST API 错误:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_SCHEDULES_WRITE_FAILED",
      message: "保存国服活动排期失败",
    });
  }
}