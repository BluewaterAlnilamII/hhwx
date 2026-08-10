import {
  FAST_MUTABLE_HTTP_CACHE_POLICY,
  NO_STORE_HTTP_CACHE_POLICY,
  withHttpCachePolicy,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { readBandoriEventApiDetail } from "@/lib/bandori/events/api-server";
import {
  BANDORI_MASTER_ID_PATTERN,
  rejectUnsupportedBandoriMasterQuery,
} from "@/lib/bandori-master-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const rejection = rejectUnsupportedBandoriMasterQuery(request);
  if (rejection) {
    return rejection;
  }

  const { eventId } = await context.params;
  if (!BANDORI_MASTER_ID_PATTERN.test(eventId)) {
    return jsonError(404, "BANDORI_MASTER_EVENT_NOT_FOUND", "Unknown Bandori master event", {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  }

  try {
    const result = await readBandoriEventApiDetail(eventId);
    if (!result) {
      return jsonError(404, "BANDORI_MASTER_EVENT_DETAIL_NOT_FOUND", "Bandori master event detail is not available", {
        headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
      });
    }

    return jsonSuccess(result, {
      headers: withHttpCachePolicy(FAST_MUTABLE_HTTP_CACHE_POLICY),
    });
  } catch (error) {
    console.error("Bandori master event detail API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_MASTER_EVENT_DETAIL_READ_FAILED",
      message: "Failed to fetch Bandori master event detail",
    }, {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  }
}
