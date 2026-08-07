import {
  NO_STORE_HTTP_CACHE_POLICY,
  SNAPSHOT_HTTP_CACHE_POLICY,
  withHttpCachePolicy,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  readBandoriMasterPath,
  refineBandoriMasterRecordPayload,
  rejectUnsupportedBandoriMasterQuery,
} from "@/lib/bandori-master-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const rejection = rejectUnsupportedBandoriMasterQuery(request);
  if (rejection) {
    return rejection;
  }

  try {
    const result = await readBandoriMasterPath("bands_main", "bands");
    if (!result) {
      return jsonError(503, "BANDORI_MASTER_BANDS_NOT_CONFIGURED", "Bandori master bands are not configured", {
        headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
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
      headers: withHttpCachePolicy(SNAPSHOT_HTTP_CACHE_POLICY),
    });
  } catch (error) {
    console.error("Bandori master bands main API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_MASTER_BANDS_MAIN_READ_FAILED",
      message: "Failed to fetch Bandori master bands",
    }, {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  }
}
