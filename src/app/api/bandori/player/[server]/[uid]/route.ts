import { NO_STORE_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  fetchBandoriPlayerProfile,
  normalizeBandoriPlayerMode,
  normalizeBandoriPlayerServer,
} from "@/lib/bandori-player-fetcher";
import { normalizeGameUid } from "@/lib/game-account-binding";
import { ApiRouteError } from "@/lib/api-contracts";

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
    const player = await fetchBandoriPlayerProfile(server, uid, mode, { allowDevelopmentProxy: true });

    return jsonSuccess(player, {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  } catch (error) {
    console.error("Bandori player API error:", error instanceof ApiRouteError ? error.code : "BANDORI_PLAYER_FETCH_FAILED");
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_PLAYER_FETCH_FAILED",
      message: "Failed to fetch player profile",
    }, {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  }
}
