import { ApiRouteError } from "@/lib/api-contracts";
import { stripLocalePrefix } from "@/i18n/routing";

const DEFAULT_AUTH_SITE_URL = "http://localhost:3000";
const AUTH_CALLBACK_PATH = "/auth/confirm";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function readConfiguredSiteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_VERCEL_URL?.trim();
  const siteUrl = configured
    ? configured.startsWith("http") ? configured : `https://${configured}`
    : DEFAULT_AUTH_SITE_URL;
  return new URL(trimTrailingSlash(siteUrl)).origin;
}

function readRequestOrigin(request: Request): string | null {
  try {
    return new URL(request.url).origin;
  } catch {
    return null;
  }
}

function readRedirectUrl(value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new ApiRouteError(400, "INVALID_REDIRECT_URL", "Invalid auth redirect URL");
  }
}

export function readAuthEmailRedirectTo(value: unknown, request: Request): string {
  if (typeof value !== "string") {
    return "";
  }

  const redirectTo = value.trim();
  if (!redirectTo) {
    return "";
  }

  const redirectUrl = readRedirectUrl(redirectTo);
  const allowedOrigins = new Set([readConfiguredSiteOrigin()]);
  const requestOrigin = readRequestOrigin(request);
  if (requestOrigin) {
    allowedOrigins.add(requestOrigin);
  }

  if (!allowedOrigins.has(redirectUrl.origin)) {
    throw new ApiRouteError(400, "INVALID_REDIRECT_URL", "Auth redirect URL must stay on this site");
  }

  if (stripLocalePrefix(redirectUrl.pathname) !== AUTH_CALLBACK_PATH) {
    throw new ApiRouteError(400, "INVALID_REDIRECT_URL", "Auth redirect URL must target the auth confirmation page");
  }

  return redirectUrl.toString();
}
