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
      .select("game_uid, bound_at")
      .eq("web_user_id", user.id)
      .order("bound_at", { ascending: false });

    if (error) {
      throw new ApiRouteError(500, "GAME_BINDINGS_READ_FAILED", "\u8bfb\u53d6\u5df2\u7ed1\u5b9a\u6e38\u620f\u8d26\u53f7\u5931\u8d25", error.message);
    }

    return jsonSuccess((data ?? []).map((row) => ({
      gameUid: row.game_uid,
      boundAt: row.bound_at,
    })));
  } catch (error) {
    console.error("Game bindings GET API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_BINDINGS_READ_FAILED",
      message: "\u8bfb\u53d6\u5df2\u7ed1\u5b9a\u6e38\u620f\u8d26\u53f7\u5931\u8d25",
    });
  }
}
