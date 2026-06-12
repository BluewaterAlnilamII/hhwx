import {
  BANDORI_MASTER_DATA_API_CACHE_CONTROL,
  LIVE_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  readBandoriMasterPath,
  redirectBandoriMasterSearch,
} from "@/lib/bandori-master-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const redirect = redirectBandoriMasterSearch(request);
  if (redirect) {
    return redirect;
  }

  try {
    const result = await readBandoriMasterPath("characters_all", "characters/all.5.json", "characters");
    if (!result) {
      return jsonError(503, "BANDORI_MASTER_CHARACTERS_NOT_CONFIGURED", "Bandori master characters are not configured", {
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
      });
    }

    return jsonSuccess(result, {
      headers: withCacheControl(BANDORI_MASTER_DATA_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori master characters all API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_MASTER_CHARACTERS_ALL_READ_FAILED",
      message: "Failed to fetch Bandori master characters",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
