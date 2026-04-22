export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";

export function isTurnstileEnabled(): boolean {
  return Boolean(TURNSTILE_SITE_KEY);
}