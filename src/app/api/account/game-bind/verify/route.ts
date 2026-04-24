import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/lib/auth-server";
import { GAME_BIND_CHALLENGE_MAX_ATTEMPTS, fetchGameProfileSignature, isSignatureMatch } from "@/lib/game-account-binding";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { USER_GAME_BIND_CHALLENGES_TABLE } from "@/lib/supabase-table-names";

type ChallengeRow = {
  id: string;
  game_uid: string;
  challenge: string;
  status: string;
  expires_at: string;
  attempt_count: number;
};

function normalizeChallengeId(value: unknown): string {
  const challengeId = typeof value === "string" ? value.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(challengeId)) {
    throw new ApiRouteError(400, "INVALID_CHALLENGE_ID", "无效的绑定验证请求");
  }

  return challengeId;
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    let body: { challengeId?: unknown };

    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    const challengeId = normalizeChallengeId(body.challengeId);
    const serviceClient = createServerSupabaseClient();
    const { data, error } = await serviceClient
      .from(USER_GAME_BIND_CHALLENGES_TABLE)
      .select("id, game_uid, challenge, status, expires_at, attempt_count")
      .eq("id", challengeId)
      .eq("web_user_id", user.id)
      .maybeSingle();

    if (error) {
      throw new ApiRouteError(500, "GAME_BIND_CHALLENGE_READ_FAILED", "读取绑定验证请求失败", error.message);
    }

    const challenge = data as ChallengeRow | null;
    if (!challenge || challenge.status !== "pending") {
      throw new ApiRouteError(404, "GAME_BIND_CHALLENGE_NOT_FOUND", "绑定验证请求不存在或已失效");
    }

    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      await serviceClient.from(USER_GAME_BIND_CHALLENGES_TABLE).update({ status: "expired" }).eq("id", challenge.id);
      throw new ApiRouteError(410, "GAME_BIND_CHALLENGE_EXPIRED", "绑定验证码已过期，请重新生成");
    }

    if (challenge.attempt_count >= GAME_BIND_CHALLENGE_MAX_ATTEMPTS) {
      throw new ApiRouteError(429, "GAME_BIND_TOO_MANY_ATTEMPTS", "验证次数过多，请重新生成验证码");
    }

    const profile = await fetchGameProfileSignature(challenge.game_uid);
    if (!isSignatureMatch(profile.signature, challenge.challenge)) {
      const nextAttempts = challenge.attempt_count + 1;
      await serviceClient
        .from(USER_GAME_BIND_CHALLENGES_TABLE)
        .update({
          attempt_count: nextAttempts,
          status: nextAttempts >= GAME_BIND_CHALLENGE_MAX_ATTEMPTS ? "failed" : "pending",
        })
        .eq("id", challenge.id);
      throw new ApiRouteError(400, "GAME_BIND_SIGNATURE_MISMATCH", "验证失败，请确认游戏内个性签名与验证码完全一致");
    }

    const { data: result, error: rpcError } = await serviceClient.rpc("complete_game_uid_binding", {
      p_challenge_id: challenge.id,
      p_game_uid: challenge.game_uid,
      p_web_user_id: user.id,
    });

    if (rpcError) {
      throw new ApiRouteError(500, "GAME_BIND_COMPLETE_FAILED", "保存游戏账号绑定失败", rpcError.message);
    }

    return jsonSuccess({
      gameUid: challenge.game_uid,
      transferred: Boolean((result as { transferred?: boolean } | null)?.transferred),
    });
  } catch (error) {
    console.error("Game bind verify API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "GAME_BIND_VERIFY_FAILED",
      message: "验证游戏账号绑定失败",
    });
  }
}
