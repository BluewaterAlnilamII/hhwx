import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/lib/auth-server";
import { copyGameProfileToManual, normalizeProfileId } from "@/lib/user-game-profiles-server";

export async function POST(
  request: Request,
  context: { params: Promise<{ profileId: string }> },
) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { profileId: rawProfileId } = await context.params;
    const profileId = normalizeProfileId(rawProfileId);
    let body: { name?: unknown } = {};

    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    return jsonSuccess(await copyGameProfileToManual(user.id, profileId, body.name), { status: 201 });
  } catch (error) {
    console.error("Game profile copy API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_PROFILE_COPY_FAILED",
      message: "复制游戏 Profile 失败",
    });
  }
}
