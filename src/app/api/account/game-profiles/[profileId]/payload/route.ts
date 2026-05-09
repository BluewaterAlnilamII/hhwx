import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import { ApiRouteError } from "@/lib/api-contracts";
import { normalizeProfileId, readCompressedGameProfilePayload, updateGameProfilePayload } from "@/lib/user-game-profiles-server";
import { decodeGameProfilePayload } from "@/lib/user-game-profile-payload-server";
import type { CompressedGameProfilePayload } from "@/lib/user-game-profile-payload";

export async function GET(
  request: Request,
  context: { params: Promise<{ profileId: string }> },
) {
  try {
    const user = await requireVerifiedAccount(request);
    const { profileId: rawProfileId } = await context.params;
    const profileId = normalizeProfileId(rawProfileId);
    return jsonSuccess(await readCompressedGameProfilePayload(user.id, profileId));
  } catch (error) {
    console.error("Game profile payload API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_PROFILE_PAYLOAD_READ_FAILED",
      message: "读取 Profile 数据失败",
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
    let body: { compressed?: CompressedGameProfilePayload };

    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    if (!body.compressed) {
      throw new ApiRouteError(400, "MISSING_PROFILE_PAYLOAD", "请提供 Profile 数据");
    }

    const payload = decodeGameProfilePayload(body.compressed);
    return jsonSuccess(await updateGameProfilePayload(user.id, profileId, payload));
  } catch (error) {
    console.error("Game profile payload PATCH API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_PROFILE_PAYLOAD_UPDATE_FAILED",
      message: "保存 Profile 数据失败",
    });
  }
}
