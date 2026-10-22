export const EMAIL_CHANGE_PROOF_MAX_AGE_SECONDS = 15 * 60;

// The caller must authenticate these claims before treating the timestamp as proof.
export function emailChangeProofExpiresAt(claims: Record<string, unknown>): number | null {
  if (!Array.isArray(claims.amr)) return null;
  const timestamps = claims.amr.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object") return [];
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    return method === "otp" && typeof timestamp === "number" && Number.isFinite(timestamp) ? [timestamp] : [];
  });
  return timestamps.length ? (Math.max(...timestamps) + EMAIL_CHANGE_PROOF_MAX_AGE_SECONDS) * 1000 : null;
}
