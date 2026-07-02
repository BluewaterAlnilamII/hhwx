import { unstable_cache } from "next/cache";
import {
  LIVE_API_CACHE_CONTROL,
  MUTABLE_DIRECTORY_CACHE_PROFILE,
  PUBLIC_SHORT_API_CACHE_CONTROL,
  withCacheControl,
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
  { revalidate: MUTABLE_DIRECTORY_CACHE_PROFILE.nextRevalidateSeconds },
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.has("region") || searchParams.has("regions")) {
    return jsonError(400, "BANDORI_STAMPS_REGION_QUERY_UNSUPPORTED", "Use /api/bandori/stamps without region filters", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  try {
    return jsonSuccess(await readBandoriStampCatalogResponse(), {
      headers: withCacheControl(PUBLIC_SHORT_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori stamps API error:", error);
    if (error instanceof BandoriStampCatalogReadError) {
      return jsonError(error.httpStatus, error.code, error.message, {
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
        details: error.details,
      });
    }

    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_STAMPS_READ_FAILED",
      message: "Failed to fetch Bandori stamp catalog",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
