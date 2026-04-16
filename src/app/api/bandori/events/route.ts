import { unstable_cache } from "next/cache";
import {
  BANDORI_EVENTS_CACHE_TAG,
  BANDORI_SCHEDULE_CACHE_TAG,
  LIVE_API_CACHE_CONTROL,
  PUBLIC_SHORT_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { fetchBandoriEventRecords, toBandoriEventsListResponse } from "@/lib/bandori-events-server";

export const dynamic = "force-dynamic";

const readBandoriEventsListResponse = unstable_cache(
  async () => {
    const records = await fetchBandoriEventRecords();
    return toBandoriEventsListResponse(records);
  },
  // 当 events DTO 结构发生破坏性调整时，需要同步提升 cache key 版本，
  // 否则 data cache 可能继续回放旧 schema 的对象形状。
  ["bandori-events-route:v3"],
  { revalidate: 300, tags: [BANDORI_EVENTS_CACHE_TAG, BANDORI_SCHEDULE_CACHE_TAG] },
);

export async function GET() {
  try {
    return jsonSuccess(await readBandoriEventsListResponse(), {
      headers: withCacheControl(PUBLIC_SHORT_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori events API 错误:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_EVENTS_READ_FAILED",
      message: "读取活动目录失败",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}