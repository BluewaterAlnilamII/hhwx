import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/lib/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { USER_GAME_BINDINGS_TABLE } from "@/lib/supabase-table-names";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const serviceClient = createServerSupabaseClient();
    const { data, error } = await serviceClient
      .from(USER_GAME_BINDINGS_TABLE)
      .select("game_uid, bound_at, last_verified_at")
      .eq("web_user_id", user.id)
      .order("bound_at", { ascending: false });

    if (error) {
      throw new ApiRouteError(500, "GAME_BINDINGS_READ_FAILED", "读取已绑定游戏账号失败", error.message);
    }

    return jsonSuccess((data ?? []).map((row) => ({
      gameUid: row.game_uid,
      boundAt: row.bound_at,
      lastVerifiedAt: row.last_verified_at,
    })));
  } catch (error) {
    console.error("Game bindings GET API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_BINDINGS_READ_FAILED",
      message: "读取已绑定游戏账号失败",
    });
  }
}
