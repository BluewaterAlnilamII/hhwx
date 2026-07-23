import {
  BANDORI_MASTER_DATA_API_CACHE_CONTROL,
  LIVE_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  readBandoriCardApiDetail,
  readBandoriCardApiDetailForServer,
} from "@/lib/bandori-cards-api-server";
import { parseBandoriCardServerQuery } from "@/lib/bandori-card-server-extensions";
import {
  BANDORI_MASTER_ID_PATTERN,
  redirectBandoriMasterSearch,
} from "@/lib/bandori-master-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    cardId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const serverQuery = parseBandoriCardServerQuery(request);
  if (serverQuery.status === "invalid") {
    return jsonError(
      400,
      "BANDORI_MASTER_CARD_SERVER_INVALID",
      "server must be exactly one of jp, en, tw, or cn",
      { headers: withCacheControl(LIVE_API_CACHE_CONTROL) },
    );
  }
  if (serverQuery.status === "unsupported") {
    const redirect = redirectBandoriMasterSearch(request);
    if (redirect) {
      return redirect;
    }
  }

  const { cardId } = await context.params;
  if (!BANDORI_MASTER_ID_PATTERN.test(cardId)) {
    return jsonError(404, "BANDORI_MASTER_CARD_NOT_FOUND", "Unknown Bandori master card", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  try {
    const result = serverQuery.status === "valid"
      ? await readBandoriCardApiDetailForServer(cardId, serverQuery.server)
      : await readBandoriCardApiDetail(cardId);
    if (!result) {
      return jsonError(404, "BANDORI_MASTER_CARD_NOT_FOUND", "Bandori master card is not available", {
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
      });
    }

    return jsonSuccess(result, {
      headers: withCacheControl(BANDORI_MASTER_DATA_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori master card detail API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_MASTER_CARD_READ_FAILED",
      message: "Failed to fetch Bandori master card",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
