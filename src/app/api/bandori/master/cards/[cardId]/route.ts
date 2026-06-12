import {
  BANDORI_MASTER_DATA_API_CACHE_CONTROL,
  LIVE_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  BANDORI_MASTER_ID_PATTERN,
  readBandoriMasterRecord,
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
  const redirect = redirectBandoriMasterSearch(request);
  if (redirect) {
    return redirect;
  }

  const { cardId } = await context.params;
  if (!BANDORI_MASTER_ID_PATTERN.test(cardId)) {
    return jsonError(404, "BANDORI_MASTER_CARD_NOT_FOUND", "Unknown Bandori master card", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  try {
    const result = await readBandoriMasterRecord("cards", cardId, "card_detail", `cards/${cardId}.json`);
    if (!result) {
      return jsonError(404, "BANDORI_MASTER_CARD_NOT_FOUND", "Bandori master card is not available", {
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
      });
    }

    return jsonSuccess({ ...result, cardId }, {
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
