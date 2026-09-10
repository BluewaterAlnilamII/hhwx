import { NO_STORE_HTTP_CACHE_POLICY, SNAPSHOT_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { isCostumeId } from "@/lib/bandori/costumes/api-contract";
import { readBandoriCostumeApiDetail } from "@/lib/bandori/costumes/api-server";
import { parseBandoriMasterServerQuery } from "@/lib/bandori/master-api-query";
import { rejectUnsupportedBandoriMasterQuery } from "@/lib/bandori-master-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ costumeId: string }> }) {
  const query = parseBandoriMasterServerQuery(request);
  const errors = { headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY) };
  if (query.status === "invalid") {
    return jsonError(400, "BANDORI_MASTER_COSTUME_SERVER_INVALID", "server must be exactly one of 0, 1, 2, or 3", errors);
  }
  if (query.status === "unsupported") {
    const rejection = rejectUnsupportedBandoriMasterQuery(request);
    if (rejection) return rejection;
  }
  const { costumeId } = await context.params;
  if (!isCostumeId(costumeId)) {
    return jsonError(404, "BANDORI_MASTER_COSTUME_NOT_FOUND", "Unknown Bandori master costume", errors);
  }
  try {
    const record = await readBandoriCostumeApiDetail(costumeId, query.status === "valid" ? query.server : undefined);
    if (!record) return jsonError(404, "BANDORI_MASTER_COSTUME_NOT_FOUND", "Bandori master costume is not available", errors);
    return jsonSuccess(record, { headers: withHttpCachePolicy(SNAPSHOT_HTTP_CACHE_POLICY) });
  } catch (error) {
    return jsonRouteError(error, {
      status: 500, code: "BANDORI_MASTER_COSTUME_READ_FAILED", message: "Failed to fetch Bandori master costume",
    }, errors);
  }
}
