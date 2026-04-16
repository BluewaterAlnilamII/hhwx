import { unstable_cache } from "next/cache";
import { ApiRouteError } from "@/lib/api-contracts";
import {
  BANDORI_EVENT_BONUS_CACHE_TAG,
  LIVE_API_CACHE_CONTROL,
  PUBLIC_SHORT_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { fetchBandoriEventBonuses } from "@/lib/bandori-events-server";

export const dynamic = "force-dynamic";

const readBandoriEventBonusesResponse = unstable_cache(
  async (eventId: number | null) => ({
    bonuses: await fetchBandoriEventBonuses(eventId !== null ? { eventId } : undefined),
  }),
  ["bandori-event-bonuses-route:v2"],
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
    throw new ApiRouteError(400, "INVALID_EVENT_ID", "无效的活动编号");
  }

  return eventId;
}

export async function GET(request: Request) {
  try {
    const eventId = parseRequestedEventId(request);

    return jsonSuccess(await readBandoriEventBonusesResponse(eventId ?? null), {
      headers: withCacheControl(PUBLIC_SHORT_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori events/bonuses API 错误:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_EVENT_BONUSES_READ_FAILED",
      message: "读取活动加成失败",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}