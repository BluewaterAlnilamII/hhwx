import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import { ApiRouteError } from "@/lib/api-contracts";
import { normalizeProfileId, readGameProfileItemsView, updateGameProfileItems } from "@/lib/user-game-profiles-server";

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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ profileId: string }> },
) {
  try {
    const user = await requireVerifiedAccount(request);
    const { profileId: rawProfileId } = await context.params;
    const profileId = normalizeProfileId(rawProfileId);
    let body: {
      baseItemsHash?: unknown;
      areaItems?: unknown;
      characterPotentials?: unknown;
      characterMissionBonuses?: unknown;
    };

    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    return jsonSuccess(await updateGameProfileItems(user.id, profileId, body.baseItemsHash, body));
  } catch (error) {
    console.error("Game profile items PATCH API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_PROFILE_ITEMS_UPDATE_FAILED",
      message: "保存档案道具失败",
    });
  }
}
