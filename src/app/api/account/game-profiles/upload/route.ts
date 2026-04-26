import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/lib/auth-server";
import { uploadManualGameProfilePayload } from "@/lib/user-game-profiles-server";
import type { CompressedGameProfilePayload } from "@/lib/user-game-profile-payload";

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    let body: { name?: unknown; compressed?: CompressedGameProfilePayload };

    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    if (!body.compressed) {
      throw new ApiRouteError(400, "MISSING_PROFILE_PAYLOAD", "请提供 Profile 数据");
    }

    return jsonSuccess(await uploadManualGameProfilePayload(user.id, body.name, body.compressed), { status: 201 });
  } catch (error) {
    console.error("Game profile upload API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_PROFILE_UPLOAD_FAILED",
      message: "上传游戏 Profile 失败",
    });
  }
}
