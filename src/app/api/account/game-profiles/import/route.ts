import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import { importManualGameProfile } from "@/lib/user-game-profiles-server";

export async function POST(request: Request) {
  try {
    const user = await requireVerifiedAccount(request);
    let body: { profile?: unknown };

    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    if (!body.profile) {
      throw new ApiRouteError(400, "MISSING_PROFILE", "请提供 Bestdori Profile 数据");
    }

    return jsonSuccess(await importManualGameProfile(user.id, body.profile), { status: 201 });
  } catch (error) {
    console.error("Game profile import API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_PROFILE_IMPORT_FAILED",
      message: "导入游戏 Profile 失败",
    });
  }
}
