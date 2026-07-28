import {
  NO_STORE_HTTP_CACHE_POLICY,
  SNAPSHOT_HTTP_CACHE_POLICY,
  withHttpCachePolicy,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { readBandoriMusicApiDetail } from "@/lib/bandori-music-api-server";
import {
  BANDORI_MASTER_ID_PATTERN,
  rejectUnsupportedBandoriMasterQuery,
} from "@/lib/bandori-master-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    musicId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const rejection = rejectUnsupportedBandoriMasterQuery(request);
  if (rejection) {
    return rejection;
  }

  const { musicId } = await context.params;
  if (!BANDORI_MASTER_ID_PATTERN.test(musicId)) {
    return jsonError(404, "BANDORI_MASTER_MUSIC_NOT_FOUND", "Unknown Bandori master Music record", {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  }

  try {
    const result = await readBandoriMusicApiDetail(musicId);
    if (!result) {
      return jsonError(404, "BANDORI_MASTER_MUSIC_NOT_FOUND", "Bandori master Music record is not available", {
        headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
      });
    }
    return jsonSuccess(result, {
      headers: withHttpCachePolicy(SNAPSHOT_HTTP_CACHE_POLICY),
    });
  } catch (error) {
    console.error("Bandori master Music detail API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_MASTER_MUSIC_READ_FAILED",
      message: "Failed to fetch Bandori master Music record",
    }, {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  }
}
