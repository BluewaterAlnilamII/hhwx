import { LIVE_API_CACHE_CONTROL, withCacheControl } from "@/lib/api-cache";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  fetchBandoriPlayerProfile,
  normalizeBandoriPlayerMode,
  normalizeBandoriPlayerServer,
} from "@/lib/bandori-player-fetcher";
import { normalizeGameUid } from "@/lib/game-account-binding";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    server: string;
    uid: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { server: rawServer, uid: rawUid } = await context.params;
    const server = normalizeBandoriPlayerServer(rawServer);
    const uid = normalizeGameUid(rawUid);
    const mode = normalizeBandoriPlayerMode(new URL(request.url).searchParams.get("mode"));
    const player = await fetchBandoriPlayerProfile(server, uid, mode);

    return jsonSuccess(player, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori player API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_PLAYER_FETCH_FAILED",
      message: "Failed to fetch player profile",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
