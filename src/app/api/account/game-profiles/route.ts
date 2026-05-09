import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import { createManualGameProfile, listUserGameProfiles } from "@/lib/user-game-profiles-server";

export async function GET(request: Request) {
  try {
    const user = await requireVerifiedAccount(request);
    return jsonSuccess(await listUserGameProfiles(user.id));
  } catch (error) {
    console.error("Game profiles GET API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_PROFILES_READ_FAILED",
      message: "读取游戏 Profile 失败",
    });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireVerifiedAccount(request);
    let body: { name?: unknown };

    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    return jsonSuccess(await createManualGameProfile(user.id, body.name), { status: 201 });
  } catch (error) {
    console.error("Game profiles POST API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_PROFILE_CREATE_FAILED",
      message: "创建游戏 Profile 失败",
    });
  }
}
