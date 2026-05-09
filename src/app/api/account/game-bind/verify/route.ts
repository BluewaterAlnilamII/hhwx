import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import { GAME_BIND_CHALLENGE_MAX_ATTEMPTS, fetchGameProfileSignature, isSignatureMatch } from "@/lib/game-account-binding";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { USER_GAME_BIND_CHALLENGES_TABLE } from "@/lib/supabase-table-names";

type ChallengeRow = {
  id: string;
  game_uid: string;
  challenge: string;
  expires_at: string;
  attempt_count: number;
};

function normalizeChallengeId(value: unknown): string {
  const challengeId = typeof value === "string" ? value.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(challengeId)) {
    throw new ApiRouteError(400, "INVALID_CHALLENGE_ID", "\u65e0\u6548\u7684\u7ed1\u5b9a\u9a8c\u8bc1\u8bf7\u6c42");
  }

  return challengeId;
}

export async function POST(request: Request) {
  try {
    const user = await requireVerifiedAccount(request);
    let body: { challengeId?: unknown };

    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "\u8bf7\u6c42\u4f53\u4e0d\u662f\u6709\u6548\u7684 JSON");
    }

    const challengeId = normalizeChallengeId(body.challengeId);
    const serviceClient = createServerSupabaseClient();
    const { data, error } = await serviceClient
      .from(USER_GAME_BIND_CHALLENGES_TABLE)
      .select("id, game_uid, challenge, expires_at, attempt_count")
      .eq("id", challengeId)
      .eq("web_user_id", user.id)
      .maybeSingle();

    if (error) {
      throw new ApiRouteError(500, "GAME_BIND_CHALLENGE_READ_FAILED", "\u8bfb\u53d6\u7ed1\u5b9a\u9a8c\u8bc1\u8bf7\u6c42\u5931\u8d25", error.message);
    }

    const challenge = data as ChallengeRow | null;
    if (!challenge) {
      throw new ApiRouteError(404, "GAME_BIND_CHALLENGE_NOT_FOUND", "\u7ed1\u5b9a\u9a8c\u8bc1\u8bf7\u6c42\u4e0d\u5b58\u5728\u6216\u5df2\u5931\u6548");
    }

    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      await serviceClient.from(USER_GAME_BIND_CHALLENGES_TABLE).delete().eq("id", challenge.id);
      throw new ApiRouteError(410, "GAME_BIND_CHALLENGE_EXPIRED", "\u7ed1\u5b9a\u9a8c\u8bc1\u7801\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u751f\u6210");
    }

    if (challenge.attempt_count >= GAME_BIND_CHALLENGE_MAX_ATTEMPTS) {
      throw new ApiRouteError(429, "GAME_BIND_TOO_MANY_ATTEMPTS", "\u9a8c\u8bc1\u6b21\u6570\u8fc7\u591a\uff0c\u8bf7\u91cd\u65b0\u751f\u6210\u9a8c\u8bc1\u7801");
    }

    const profile = await fetchGameProfileSignature(challenge.game_uid);
    if (!isSignatureMatch(profile.signature, challenge.challenge)) {
      await serviceClient.rpc("increment_game_bind_challenge_attempt", {
        p_challenge_id: challenge.id,
        p_web_user_id: user.id,
      });
      throw new ApiRouteError(400, "GAME_BIND_SIGNATURE_MISMATCH", "\u9a8c\u8bc1\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4\u6e38\u620f\u5185\u4e2a\u6027\u7b7e\u540d\u4e0e\u9a8c\u8bc1\u7801\u5b8c\u5168\u4e00\u81f4");
    }

    const { data: result, error: rpcError } = await serviceClient.rpc("complete_game_uid_binding", {
      p_challenge_id: challenge.id,
      p_game_uid: challenge.game_uid,
      p_web_user_id: user.id,
    });

    if (rpcError) {
      throw new ApiRouteError(500, "GAME_BIND_COMPLETE_FAILED", "\u4fdd\u5b58\u6e38\u620f\u8d26\u53f7\u7ed1\u5b9a\u5931\u8d25", rpcError.message);
    }

    return jsonSuccess({
      gameUid: challenge.game_uid,
      transferred: Boolean((result as { transferred?: unknown } | null)?.transferred),
    });
  } catch (error) {
    console.error("Game bind verify API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_BIND_VERIFY_FAILED",
      message: "\u9a8c\u8bc1\u6e38\u620f\u8d26\u53f7\u7ed1\u5b9a\u5931\u8d25",
    });
  }
}
