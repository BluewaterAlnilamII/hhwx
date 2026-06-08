import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import { ApiRouteError } from "@/lib/api-contracts";
import { normalizeProfileId, readGameProfilePayloadResponse, updateGameProfilePayload } from "@/lib/user-game-profiles-server";
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
    return jsonSuccess(await readGameProfilePayloadResponse(user.id, profileId));
  } catch (error) {
    console.error("Game profile payload API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_PROFILE_PAYLOAD_READ_FAILED",
      message: "读取档案数据失败",
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
      basePayloadSha256?: unknown;
      compressed?: CompressedGameProfilePayload;
    };

    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    if (!body.compressed) {
      throw new ApiRouteError(400, "MISSING_PROFILE_PAYLOAD", "请提供档案数据");
    }

    const payload = decodeGameProfilePayload(body.compressed);
    return jsonSuccess(await updateGameProfilePayload(user.id, profileId, payload, body.basePayloadSha256));
  } catch (error) {
    console.error("Game profile payload PATCH API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_PROFILE_PAYLOAD_UPDATE_FAILED",
      message: "保存档案数据失败",
    });
  }
}
