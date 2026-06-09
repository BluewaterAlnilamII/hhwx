import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import { ApiRouteError } from "@/lib/api-contracts";
import { listGameProfileCards, normalizeProfileId, updateGameProfileCards } from "@/lib/user-game-profiles-server";

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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ profileId: string }> },
) {
  try {
    const user = await requireVerifiedAccount(request);
    const { profileId: rawProfileId } = await context.params;
    const profileId = normalizeProfileId(rawProfileId);
    let body: {
      baseCardsHash?: unknown;
      cards?: unknown;
    };

    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    return jsonSuccess(await updateGameProfileCards(user.id, profileId, body.baseCardsHash, body.cards));
  } catch (error) {
    console.error("Game profile cards PATCH API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_PROFILE_CARDS_UPDATE_FAILED",
      message: "保存档案卡牌失败",
    });
  }
}
