import {
  NO_STORE_HTTP_CACHE_POLICY,
  SNAPSHOT_HTTP_CACHE_POLICY,
  withHttpCachePolicy,
} from "@/lib/api-cache";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { rejectUnsupportedBandoriMasterQuery } from "@/lib/bandori-master-api";
import { readBandoriSongMetaDataset } from "@/lib/bandori-song-meta-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const rejection = rejectUnsupportedBandoriMasterQuery(request);
  if (rejection) return rejection;

  try {
    return jsonSuccess(await readBandoriSongMetaDataset(), {
      headers: withHttpCachePolicy(SNAPSHOT_HTTP_CACHE_POLICY),
    });
  } catch (error) {
    console.error("Bandori song meta API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_SONG_META_READ_FAILED",
      message: "Failed to fetch Bandori song meta",
    }, {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  }
}
