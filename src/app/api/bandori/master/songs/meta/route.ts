import {
  BANDORI_MASTER_DATA_API_CACHE_CONTROL,
  LIVE_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  readBandoriMasterPath,
  redirectBandoriMasterSearch,
} from "@/lib/bandori-master-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const redirect = redirectBandoriMasterSearch(request);
  if (redirect) {
    return redirect;
  }

  try {
    const result = await readBandoriMasterPath("songs_meta", "songs/meta/all.5.json", "song_meta", {
      emptyWhenArtifactMissing: true,
      emptyReason: "songs/meta is chart-stat-derived data, not generated directly from suite/master; artifact mode returns an empty object for now.",
    });

    return jsonSuccess(result, {
      headers: withCacheControl(BANDORI_MASTER_DATA_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori master song meta API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_MASTER_SONG_META_READ_FAILED",
      message: "Failed to fetch Bandori master song meta",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
