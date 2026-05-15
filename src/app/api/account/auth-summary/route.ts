import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/lib/auth-server";
import { LIVE_API_CACHE_CONTROL, withCacheControl } from "@/lib/api-cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { PROFILES_TABLE } from "@/lib/supabase-table-names";

export const dynamic = "force-dynamic";

type ProfileUsernameRow = {
  username: string | null;
};

async function readUsername(userId: string, fallbackUsername: string | null): Promise<string> {
  const serviceClient = createServerSupabaseClient();
  const { data, error } = await serviceClient
    .from(PROFILES_TABLE)
    .select("username")
    .eq("id", userId)
    .maybeSingle<ProfileUsernameRow>();

  if (error) {
    throw error;
  }

  return data?.username ?? fallbackUsername ?? "User";
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const username = await readUsername(user.id, user.metadataUsername);

    return jsonSuccess({
      userId: user.id,
      username,
      email: user.email,
      emailVerified: user.emailVerified,
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Auth summary API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "AUTH_SUMMARY_READ_FAILED",
      message: "读取登录状态失败",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
