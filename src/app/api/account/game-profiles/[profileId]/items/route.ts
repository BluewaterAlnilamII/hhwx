import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import { normalizeProfileId, readGameProfileItemsView } from "@/lib/user-game-profiles-server";

export async function GET(
  request: Request,
  context: { params: Promise<{ profileId: string }> },
) {
  try {
    const user = await requireVerifiedAccount(request);
    const { profileId: rawProfileId } = await context.params;
    const profileId = normalizeProfileId(rawProfileId);
    return jsonSuccess(await readGameProfileItemsView(user.id, profileId));
  } catch (error) {
    console.error("Game profile items API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_PROFILE_ITEMS_READ_FAILED",
      message: "读取档案道具失败",
    });
  }
}
