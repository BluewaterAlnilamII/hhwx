import { unstable_cache } from "next/cache";
import {
  LIVE_API_CACHE_CONTROL,
  PUBLIC_SHORT_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  BANDORI_STAMP_METADATA_REVALIDATE_SECONDS,
  fetchBandoriStampAnimation,
  isBandoriStampRegion,
  normalizeBandoriStampId,
  type BandoriStampRegion,
} from "@/lib/bandori-stamp-assets";

export const dynamic = "force-dynamic";

const readBandoriStampAnimation = unstable_cache(
  async (region: BandoriStampRegion, stampId: number) => fetchBandoriStampAnimation(region, stampId),
  ["bandori-stamp-animation-route:v1"],
  { revalidate: BANDORI_STAMP_METADATA_REVALIDATE_SECONDS },
);

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
    return jsonSuccess(await readBandoriStampAnimation(rawRegion, stampId), {
      headers: withCacheControl(PUBLIC_SHORT_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori stamp animation API error:", error);
    const isMissingConfiguration = error instanceof Error && error.message.includes("not configured");
    return jsonRouteError(error, {
      status: isMissingConfiguration ? 503 : 502,
      code: "BANDORI_STAMP_ANIMATION_READ_FAILED",
      message: "Failed to fetch Bandori stamp animation",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
