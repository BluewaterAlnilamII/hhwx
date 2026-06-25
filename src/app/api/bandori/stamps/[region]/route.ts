import { unstable_cache } from "next/cache";
import {
  LIVE_API_CACHE_CONTROL,
  PUBLIC_SHORT_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  BANDORI_STAMP_METADATA_REVALIDATE_SECONDS,
  fetchBandoriStampIndex,
  isBandoriStampRegion,
} from "@/lib/bandori-stamp-assets";

export const dynamic = "force-dynamic";

const readBandoriStampIndex = unstable_cache(
  async (region: "jp" | "en" | "tw" | "cn") => fetchBandoriStampIndex(region),
  ["bandori-stamps-index-route:v1"],
  { revalidate: BANDORI_STAMP_METADATA_REVALIDATE_SECONDS },
);

type RouteContext = {
  params: Promise<{
    region: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { region } = await context.params;

  if (!isBandoriStampRegion(region)) {
    return jsonError(400, "INVALID_STAMP_REGION", "Invalid stamp region", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  try {
    return jsonSuccess(await readBandoriStampIndex(region), {
      headers: withCacheControl(PUBLIC_SHORT_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori stamp index API error:", error);
    const isMissingConfiguration = error instanceof Error && error.message.includes("not configured");
    return jsonRouteError(error, {
      status: isMissingConfiguration ? 503 : 502,
      code: "BANDORI_STAMP_INDEX_READ_FAILED",
      message: "Failed to fetch Bandori stamp index",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
