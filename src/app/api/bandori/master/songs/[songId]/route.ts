import {
  BANDORI_MASTER_DATA_API_CACHE_CONTROL,
  LIVE_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  BANDORI_MASTER_ID_PATTERN,
  readBandoriMasterRecord,
  redirectBandoriMasterSearch,
} from "@/lib/bandori-master-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    songId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const redirect = redirectBandoriMasterSearch(request);
  if (redirect) {
    return redirect;
  }

  const { songId } = await context.params;
  if (!BANDORI_MASTER_ID_PATTERN.test(songId)) {
    return jsonError(404, "BANDORI_MASTER_SONG_NOT_FOUND", "Unknown Bandori master song", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  try {
    const result = await readBandoriMasterRecord("songs", songId, "song_detail", `songs/${songId}.json`);
    if (!result) {
      return jsonError(404, "BANDORI_MASTER_SONG_NOT_FOUND", "Bandori master song is not available", {
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
      });
    }

    return jsonSuccess({ ...result, songId }, {
      headers: withCacheControl(BANDORI_MASTER_DATA_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori master song detail API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_MASTER_SONG_READ_FAILED",
      message: "Failed to fetch Bandori master song",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
