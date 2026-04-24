import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/lib/auth-server";
import {
  GAME_BIND_CHALLENGE_RETENTION_DAYS,
  createChallengeExpiresAt,
  createGameBindChallenge,
  normalizeGameUid,
} from "@/lib/game-account-binding";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { USER_GAME_BIND_CHALLENGES_TABLE } from "@/lib/supabase-table-names";

function getChallengeRetentionCutoff(): string {
  return new Date(Date.now() - GAME_BIND_CHALLENGE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    let body: { gameUid?: unknown };

    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "\u8bf7\u6c42\u4f53\u4e0d\u662f\u6709\u6548\u7684 JSON");
    }

    const gameUid = normalizeGameUid(body.gameUid);
    const serviceClient = createServerSupabaseClient();

    await serviceClient
      .from(USER_GAME_BIND_CHALLENGES_TABLE)
      .delete()
      .eq("web_user_id", user.id)
      .lt("created_at", getChallengeRetentionCutoff());

    await serviceClient
      .from(USER_GAME_BIND_CHALLENGES_TABLE)
      .delete()
      .eq("web_user_id", user.id)
      .eq("game_uid", gameUid);

    const { data, error } = await serviceClient
      .from(USER_GAME_BIND_CHALLENGES_TABLE)
      .insert({
        web_user_id: user.id,
        game_uid: gameUid,
        challenge: createGameBindChallenge(),
        expires_at: createChallengeExpiresAt(),
      })
      .select("id, game_uid, challenge, expires_at")
      .single();

    if (error) {
      throw new ApiRouteError(500, "GAME_BIND_CHALLENGE_CREATE_FAILED", "\u521b\u5efa\u7ed1\u5b9a\u9a8c\u8bc1\u7801\u5931\u8d25", error.message);
    }

    return jsonSuccess({
      id: data.id,
      gameUid: data.game_uid,
      challenge: data.challenge,
      expiresAt: data.expires_at,
    });
  } catch (error) {
    console.error("Game bind challenge API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_BIND_CHALLENGE_FAILED",
      message: "\u521b\u5efa\u7ed1\u5b9a\u9a8c\u8bc1\u7801\u5931\u8d25",
    });
  }
}
