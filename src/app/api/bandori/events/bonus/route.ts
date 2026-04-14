import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import {
  BANDORI_EVENT_BONUS_CACHE_TAG,
  LIVE_API_CACHE_CONTROL,
  PUBLIC_SHORT_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { fetchBandoriEventBonuses } from "@/lib/bandori-events-server";

export const dynamic = "force-dynamic";

const readBandoriEventBonusResponse = unstable_cache(
  async (eventId: number | null) => ({
    bonuses: await fetchBandoriEventBonuses(eventId !== null ? { eventId } : undefined),
  }),
  ["bandori-event-bonus-route"],
  { revalidate: 300, tags: [BANDORI_EVENT_BONUS_CACHE_TAG] },
);

function parseRequestedEventId(request: Request): number | undefined {
  const { searchParams } = new URL(request.url);
  const eventParam = searchParams.get("event");

  if (!eventParam) {
    return undefined;
  }

  const eventId = Number.parseInt(eventParam, 10);
  if (!Number.isFinite(eventId) || eventId <= 0) {
    throw new Error("INVALID_EVENT_ID");
  }

  return eventId;
}

export async function GET(request: Request) {
  try {
    const eventId = parseRequestedEventId(request);

    // 将 bonus 拆成独立资源后，只有真正需要活动加成的页面才会触发这条查询，
    // 避免 events 目录接口为了照顾少数场景把整张 bonus 表反复带给所有调用方。
    return NextResponse.json(await readBandoriEventBonusResponse(eventId ?? null), {
      headers: withCacheControl(PUBLIC_SHORT_API_CACHE_CONTROL),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_EVENT_ID") {
      return NextResponse.json({ error: "无效的活动编号" }, {
        status: 400,
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
      });
    }

    console.error("Bandori events/bonus API 错误:", error);
    return NextResponse.json({ error: "读取活动加成失败" }, {
      status: 500,
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}