import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import { listGameProfileCards, normalizeProfileId } from "@/lib/user-game-profiles-server";

export async function GET(
  request: Request,
  context: { params: Promise<{ profileId: string }> },
) {
  try {
    const user = await requireVerifiedAccount(request);
    const { profileId: rawProfileId } = await context.params;
    const profileId = normalizeProfileId(rawProfileId);
    return jsonSuccess(await listGameProfileCards(user.id, profileId));
  } catch (error) {
    console.error("Game profile cards API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_PROFILE_CARDS_READ_FAILED",
      message: "读取档案卡牌失败",
    });
  }
}
