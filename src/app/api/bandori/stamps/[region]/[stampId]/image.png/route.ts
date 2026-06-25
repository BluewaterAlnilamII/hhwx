import { NextResponse } from "next/server";
import { LIVE_API_CACHE_CONTROL, STATIC_ASSET_PROXY_CACHE_PROFILE, withCacheControl } from "@/lib/api-cache";
import { jsonError, jsonRouteError } from "@/lib/api-response";
import {
  buildBandoriStampAssetKey,
  buildBandoriStampCdnUrl,
  isBandoriStampRegion,
  normalizeBandoriStampId,
} from "@/lib/bandori-stamp-assets";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    region: string;
    stampId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { region: rawRegion, stampId: rawStampId } = await context.params;
  const stampId = normalizeBandoriStampId(rawStampId);

  if (!isBandoriStampRegion(rawRegion)) {
    return jsonError(400, "INVALID_STAMP_REGION", "Invalid stamp region", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  if (stampId === null) {
    return jsonError(400, "INVALID_STAMP_ID", "Invalid stamp id", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  try {
    const redirectUrl = buildBandoriStampCdnUrl(buildBandoriStampAssetKey(rawRegion, stampId, "image.png"));
    const response = NextResponse.redirect(redirectUrl, 307);
    response.headers.set("Cache-Control", STATIC_ASSET_PROXY_CACHE_PROFILE.cacheControl);
    return response;
  } catch (error) {
    const isMissingConfiguration = error instanceof Error && error.message.includes("not configured");
    return jsonRouteError(error, {
      status: isMissingConfiguration ? 503 : 502,
      code: "BANDORI_STAMP_IMAGE_READ_FAILED",
      message: "Failed to fetch Bandori stamp image",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
