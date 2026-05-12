import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import { normalizeGameUid } from "@/lib/game-account-binding";
import { syncAutoGameProfile } from "@/lib/user-game-profiles-server";

export async function POST(request: Request) {
  try {
    const user = await requireVerifiedAccount(request);
    let body: { gameUid?: unknown };

    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    const gameUid = normalizeGameUid(body.gameUid);
    return jsonSuccess(await syncAutoGameProfile(user.id, gameUid));
  } catch (error) {
    console.error("Game profile sync API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_PROFILE_SYNC_FAILED",
      message: "同步游戏档案失败",
    });
  }
}
