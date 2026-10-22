import { randomUUID } from "node:crypto";
import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { hasRecentEmailProof, isAccountRegistrationComplete } from "@/lib/account-registration";
import { parseBearerToken, requireAuthenticatedUserId } from "@/lib/auth-server";
import { validatePasswordValue } from "@/lib/password-policy";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { normalizeUsernameValue, validateUsernameValue } from "@/lib/username-policy";

// OTP sending/verification use the public Auth API. Only the final registration
// requires this privileged endpoint, after a fresh proof of email ownership.
export async function POST(request: Request) {
  try {
    const userId = await requireAuthenticatedUserId(request);
    const body = await request.json().catch(() => null) as { username?: unknown; password?: unknown } | null;
    if (!body) throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    const username = typeof body.username === "string" ? normalizeUsernameValue(body.username) : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || validateUsernameValue(username)) {
      throw new ApiRouteError(400, "INVALID_USERNAME", "请输入有效的昵称");
    }
    if (!password || validatePasswordValue(password)) {
      throw new ApiRouteError(400, "INVALID_PASSWORD", "请输入符合要求的密码");
    }
    const client = createServerSupabaseClient();
    const token = parseBearerToken(request);
    const [userResult, claimsResult] = await Promise.all([
      client.auth.getUser(token), client.auth.getClaims(token),
    ]);
    const user = userResult.data.user;
    if (userResult.error || !user || user.id !== userId || claimsResult.error || !claimsResult.data?.claims) {
      throw new ApiRouteError(401, "AUTHENTICATION_FAILED", "认证失败");
    }
    if (isAccountRegistrationComplete(user)) {
      throw new ApiRouteError(409, "ACCOUNT_ALREADY_REGISTERED", "此账号已完成注册，请登录或找回密码");
    }
    if (!user.email_confirmed_at || !hasRecentEmailProof(claimsResult.data.claims)) {
      throw new ApiRouteError(403, "FRESH_EMAIL_VERIFICATION_REQUIRED", "请重新获取并验证邮箱验证码");
    }

    // Auth commits credentials and metadata atomically. The registration trigger
    // commits the profile in that transaction and rejects a concurrent second winner.
    const { error } = await client.auth.admin.updateUserById(user.id, {
      password,
      user_metadata: { username },
      app_metadata: { hhwx_registration: { id: randomUUID(), username } },
    });
    if (error) {
      const current = await client.auth.admin.getUserById(user.id);
      if (current.data.user && isAccountRegistrationComplete(current.data.user)) {
        throw new ApiRouteError(409, "ACCOUNT_ALREADY_REGISTERED", "此账号已完成注册，请登录或找回密码");
      }
      throw new ApiRouteError(400, "SIGN_UP_FAILED", "注册未完成，请重试");
    }
    // Admin password changes revoke temporary OTP sessions. The normal sign-in
    // form obtains a new session with Turnstile instead of an admin-minted login.
    return jsonSuccess({ registered: true });
  } catch (error) {
    return jsonRouteError(error, { status: 500, code: "SIGN_UP_FAILED", message: "注册失败" });
  }
}
