import "server-only";
import { createClient } from "@supabase/supabase-js";
import { ApiRouteError } from "@/lib/api-contracts";
import type { AuthenticatedRequestUser } from "@/lib/auth-server";
import { emailChangeProofExpiresAt, EMAIL_CHANGE_PROOF_MAX_AGE_SECONDS } from "@/lib/account-email-change";
import { accountEmailDeliveryConfig, sendNewAccountEmailCode } from "@/lib/account-email-delivery-server";

export async function requestAccountEmailChange(user: AuthenticatedRequestUser, proofToken: string, newEmail: string) {
  const authUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!authUrl || !publicUrl || !secret || !publishableKey) throw new Error("Missing Auth configuration");
  const delivery = accountEmailDeliveryConfig();
  // Bound the whole operation below the shared 60-second per-account reservation.
  const signal = AbortSignal.timeout(30_000);
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, signal }) } };
  const admin = createClient(authUrl, secret, options);
  const verifier = createClient(publicUrl, publishableKey, options);
  const [identity, proof] = await Promise.all([verifier.auth.getUser(proofToken), verifier.auth.getClaims(proofToken)]);
  const claims = proof.data?.claims;
  const expiresAt = claims ? emailChangeProofExpiresAt(claims) : null;
  const now = Date.now();
  if (identity.error || proof.error || !claims || identity.data.user?.id !== user.id || claims.sub !== user.id
    || claims.iss !== `${new URL(publicUrl).origin}/auth/v1` || claims.aud !== "authenticated" || claims.role !== "authenticated"
    || typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp * 1000 <= now
    || !user.email || identity.data.user.email?.toLowerCase() !== user.email.toLowerCase()
    || typeof claims.email !== "string" || claims.email.toLowerCase() !== user.email.toLowerCase()
    || !expiresAt || expiresAt <= now || expiresAt > now + (EMAIL_CHANGE_PROOF_MAX_AGE_SECONDS + 30) * 1000) {
    throw new ApiRouteError(403, "EMAIL_CHANGE_PROOF_REQUIRED", "请重新验证当前邮箱，再申请更换");
  }
  const reserved = await admin.rpc("reserve_account_email_change", { p_user_id: user.id });
  if (reserved.error) {
    if (["EMAIL_CHANGE_RATE_LIMITED", "EMAIL_CHANGE_QUOTA_EXCEEDED"].includes(reserved.error.message)) {
      throw new ApiRouteError(429, reserved.error.message, "发送过于频繁，请稍后再试");
    }
    throw new Error("Could not reserve account email dispatch");
  }
  const params = { email: user.email, newEmail };
  // Current MUST be generated first: each call resets confirmation progress;
  // generating New last also keeps the pending address paired with its new token.
  const current = await admin.auth.admin.generateLink({ type: "email_change_current", ...params });
  if (current.error) {
    if (current.error.code === "email_exists") throw new ApiRouteError(409, "EMAIL_TAKEN", "这个邮箱已被使用");
    throw new ApiRouteError(502, "EMAIL_UPDATE_FAILED", "申请更换邮箱失败");
  }
  if (current.data.user.id !== user.id) throw new Error("Email change identity mismatch");
  const next = await admin.auth.admin.generateLink({ type: "email_change_new", ...params });
  if (next.error || next.data.user.id !== user.id) throw new ApiRouteError(409, "EMAIL_CHANGE_RESTART_REQUIRED", "邮箱变更申请已改变，请重新申请");
  const code = next.data.properties.email_otp;
  if (!/^\d{8}$/u.test(code)) throw new Error("Email OTP length must be eight");
  const accepted = await verifier.auth.verifyOtp({ email: user.email, token: current.data.properties.email_otp, type: "email_change" });
  // With Secure email change enabled the first confirmation never issues a session.
  if (accepted.error || accepted.data.session || accepted.data.user) {
    throw new ApiRouteError(409, "EMAIL_CHANGE_RESTART_REQUIRED", "邮箱变更申请已改变，请重新申请");
  }
  await sendNewAccountEmailCode(delivery, newEmail, code, signal);
  return { currentEmail: user.email, newEmail };
}
