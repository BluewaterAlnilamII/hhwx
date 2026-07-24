import { unstable_cache } from "next/cache";
import {
  NO_STORE_HTTP_CACHE_POLICY,
  SNAPSHOT_HTTP_CACHE_POLICY,
  withHttpCachePolicy,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  BandoriStampCatalogReadError,
  readBandoriStampCatalogFromObjectStorage,
} from "@/lib/bandori-stamp-assets-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const readBandoriStampCatalogResponse = unstable_cache(
  readBandoriStampCatalogFromObjectStorage,
  ["bandori-stamps-catalog-r2:v1"],
  { revalidate: SNAPSHOT_HTTP_CACHE_POLICY.nextRevalidateSeconds },
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.has("region") || searchParams.has("regions")) {
    return jsonError(400, "BANDORI_STAMPS_REGION_QUERY_UNSUPPORTED", "Use /api/bandori/stamps without region filters", {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  }

  try {
    return jsonSuccess(await readBandoriStampCatalogResponse(), {
      headers: withHttpCachePolicy(SNAPSHOT_HTTP_CACHE_POLICY),
    });
  } catch (error) {
    console.error("Bandori stamps API error:", error);
    if (error instanceof BandoriStampCatalogReadError) {
      return jsonError(error.httpStatus, error.code, error.message, {
        headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
        details: error.details,
      });
    }

    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_STAMPS_READ_FAILED",
      message: "Failed to fetch Bandori stamp catalog",
    }, {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  }
}
