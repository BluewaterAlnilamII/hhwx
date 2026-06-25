import { unstable_cache } from "next/cache";
import {
  LIVE_API_CACHE_CONTROL,
  PUBLIC_SHORT_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  BANDORI_STAMP_METADATA_REVALIDATE_SECONDS,
  fetchBandoriStampManifest,
  isBandoriStampRegion,
  normalizeBandoriStampId,
  type BandoriStampRegion,
} from "@/lib/bandori-stamp-assets";

export const dynamic = "force-dynamic";

const readBandoriStampManifest = unstable_cache(
  async (region: BandoriStampRegion, stampId: number) => fetchBandoriStampManifest(region, stampId),
  ["bandori-stamp-manifest-route:v2"],
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
    return jsonSuccess(await readBandoriStampManifest(rawRegion, stampId), {
      headers: withCacheControl(PUBLIC_SHORT_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori stamp manifest API error:", error);
    const isMissingConfiguration = error instanceof Error && error.message.includes("not configured");
    return jsonRouteError(error, {
      status: isMissingConfiguration ? 503 : 502,
      code: "BANDORI_STAMP_MANIFEST_READ_FAILED",
      message: "Failed to fetch Bandori stamp manifest",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
