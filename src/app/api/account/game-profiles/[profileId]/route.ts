import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import { deleteGameProfile, normalizeProfileId } from "@/lib/user-game-profiles-server";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ profileId: string }> },
) {
  try {
    const user = await requireVerifiedAccount(request);
    const { profileId: rawProfileId } = await context.params;
    const profileId = normalizeProfileId(rawProfileId);
    await deleteGameProfile(user.id, profileId);
    return jsonSuccess({ profileId });
  } catch (error) {
    console.error("Game profile DELETE API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_PROFILE_DELETE_FAILED",
      message: "删除游戏档案失败",
    });
  }
}
