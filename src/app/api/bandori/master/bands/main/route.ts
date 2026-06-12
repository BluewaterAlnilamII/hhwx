import {
  BANDORI_MASTER_DATA_API_CACHE_CONTROL,
  LIVE_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  readBandoriMasterPath,
  refineBandoriMasterRecordPayload,
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
    const result = await readBandoriMasterPath("bands_main", "bands/main.1.json", "bands");
    if (!result) {
      return jsonError(503, "BANDORI_MASTER_BANDS_NOT_CONFIGURED", "Bandori master bands are not configured", {
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
      });
    }

    return jsonSuccess(refineBandoriMasterRecordPayload(result, {
      predicate: (record) => {
        if (!("bandType" in record)) {
          return true;
        }
        return record.bandType === "normal";
      },
    }), {
      headers: withCacheControl(BANDORI_MASTER_DATA_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori master bands main API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_MASTER_BANDS_MAIN_READ_FAILED",
      message: "Failed to fetch Bandori master bands",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
