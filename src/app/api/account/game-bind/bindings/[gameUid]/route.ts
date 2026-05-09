import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import { normalizeGameUid } from "@/lib/game-account-binding";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ gameUid: string }> },
) {
  try {
    const user = await requireVerifiedAccount(request);
    const { gameUid: rawGameUid } = await context.params;
    const gameUid = normalizeGameUid(rawGameUid);
    const serviceClient = createServerSupabaseClient();
    const { error } = await serviceClient.rpc("unbind_game_uid", {
      p_game_uid: gameUid,
      p_web_user_id: user.id,
    });

    if (error) {
      throw new ApiRouteError(500, "GAME_BIND_UNBIND_FAILED", "解绑游戏账号失败", error.message);
    }

    return jsonSuccess({ gameUid });
  } catch (error) {
    console.error("Game binding DELETE API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_BIND_UNBIND_FAILED",
      message: "解绑游戏账号失败",
    });
  }
}
