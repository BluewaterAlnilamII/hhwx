import {
  LIVE_API_CACHE_CONTROL,
  MUTABLE_DIRECTORY_CACHE_PROFILE,
  PUBLIC_SHORT_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  buildBandoriStampCatalogCdnUrl,
  parseBandoriStampCatalogApiResponse,
} from "@/lib/bandori-stamp-assets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.has("region") || searchParams.has("regions")) {
    return jsonError(400, "BANDORI_STAMPS_REGION_QUERY_UNSUPPORTED", "Use /api/bandori/stamps without region filters", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  const catalogUrl = buildBandoriStampCatalogCdnUrl();
  if (!catalogUrl) {
    return jsonError(503, "BANDORI_STAMPS_CDN_UNCONFIGURED", "Bandori stamp CDN base URL is not configured", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  try {
    const response = await fetch(catalogUrl, {
      next: { revalidate: MUTABLE_DIRECTORY_CACHE_PROFILE.nextRevalidateSeconds },
    });

    if (!response.ok) {
      return jsonError(503, "BANDORI_STAMPS_UNAVAILABLE", "Bandori stamp catalog is unavailable", {
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
        details: { status: response.status },
      });
    }

    const catalog = parseBandoriStampCatalogApiResponse(await response.json());
    if (!catalog) {
      return jsonError(502, "BANDORI_STAMPS_INVALID_CATALOG", "Bandori stamp catalog payload is invalid", {
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
      });
    }

    return jsonSuccess(catalog, {
      headers: withCacheControl(PUBLIC_SHORT_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori stamps API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_STAMPS_READ_FAILED",
      message: "Failed to fetch Bandori stamp catalog",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
