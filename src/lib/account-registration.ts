import type { User } from "@supabase/supabase-js";

// This marker is written only by the registration service, never by user_metadata.
export function isAccountRegistrationComplete(user: Pick<User, "app_metadata">): boolean {
  const registration = user.app_metadata?.hhwx_registration;
  return typeof registration?.id === "string" && registration.id.length > 0;
}

export function isAccountEmailVerified(user: Pick<User, "app_metadata" | "email_confirmed_at">): boolean {
  return Boolean(user.email_confirmed_at) && isAccountRegistrationComplete(user);
}

export const EMAIL_OTP_LENGTH = 8;
export const EMAIL_RESEND_INTERVAL_SECONDS = 60;
export const REGISTRATION_PROOF_MAX_AGE_SECONDS = 15 * 60;

export function hasRecentEmailProof(claims: Record<string, unknown>, now = Date.now() / 1000): boolean {
  return Array.isArray(claims.amr) && claims.amr.some((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    return (method === "otp" || method === "recovery") && typeof timestamp === "number"
      && Number.isFinite(timestamp) && timestamp <= now + 30
      && timestamp > now - REGISTRATION_PROOF_MAX_AGE_SECONDS;
  });
}
