import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  BANDORI_EVENTS_CACHE_TAG,
  BANDORI_SCHEDULE_CACHE_TAG,
  LIVE_API_CACHE_CONTROL,
  PUBLIC_SHORT_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
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
    // 列表接口返回结构化目录 DTO，而不是数据库原表或 Bestdori 原始形状，
    // 这样页面消费方只依赖业务语义，不会被底层存储结构牵着走。
    return NextResponse.json(await readBandoriEventsListResponse(), {
      headers: withCacheControl(PUBLIC_SHORT_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori events API 错误:", error);
    return NextResponse.json({ error: "读取活动目录失败" }, {
      status: 500,
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}