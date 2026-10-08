import { ApiRouteError } from "@/lib/api-contracts";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireAuthenticatedUserId, requireVerifiedAccount } from "@/lib/auth-server";
import { normalizeGameUid } from "@/lib/game-account-binding";
import { requireBoundGameUid, syncAutoGameProfile } from "@/lib/user-game-profiles-server";
import { GAME_PROFILE_SYNC_ENABLED } from "@/lib/user-game-profile-sync";
import { readSnapshotLoginJson, requestGameProfileLogin } from "@/lib/user-game-snapshot-fetcher";

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function POST(request: Request) {
  try {
    if (!GAME_PROFILE_SYNC_ENABLED) {
      return jsonError(503, "USER_SNAPSHOT_UNAVAILABLE", "游戏档案自动同步暂不可用，请稍后再试", noStore);
    }
    let body: Record<string, unknown>;
    try {
      const value = await readSnapshotLoginJson(request);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
      body = value as Record<string, unknown>;
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "同步请求格式无效，请刷新页面后重试");
    }
    const { action, taskId } = body;
    const keys = action === "start" ? ["action", "gameUid"] : ["action", "gameUid", "taskId"];
    if (typeof action !== "string" || !["start", "confirm"].includes(action)
      || Object.keys(body).length !== keys.length || Object.keys(body).some((key) => !keys.includes(key))
      || (action !== "start" && (typeof taskId !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(taskId)))) {
      throw new ApiRouteError(400, "INVALID_LOGIN_REQUEST", "登录请求参数无效，请刷新页面后重新同步");
    }
    const gameUid = normalizeGameUid(body.gameUid);
    if (action === "start") {
      const user = await requireVerifiedAccount(request);
      await requireBoundGameUid(user.id, gameUid);
      return jsonSuccess(await requestGameProfileLogin(user.id, gameUid), noStore);
    }
    const ownerId = await requireAuthenticatedUserId(request);
    return jsonSuccess(await syncAutoGameProfile(ownerId, gameUid, taskId as string), noStore);
  } catch (error) {
    // Upstream bodies and privileged database details must never enter the browser or logs.
    const safeError = error instanceof ApiRouteError ? new ApiRouteError(error.status, error.code, error.message) : error;
    return jsonRouteError(safeError, {
      status: 500,
      code: "GAME_PROFILE_SYNC_FAILED",
      message: "本次同步未能完成，请重新同步",
    }, noStore);
  }
}
