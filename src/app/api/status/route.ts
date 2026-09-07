import { NO_STORE_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { readServiceStatus } from "@/lib/service-status-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const headers = withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY);
  try {
    const { data, meta } = readServiceStatus();
    return jsonSuccess(data, { headers, meta });
  } catch (error) {
    return jsonRouteError(error, {
      status: 503,
      code: "SERVICE_STATUS_UNAVAILABLE",
      message: "Service status is unavailable",
    }, { headers });
  }
}
