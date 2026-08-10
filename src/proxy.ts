import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import {
  buildLocalizedPathname,
  DEFAULT_LOCALE,
  getLocaleFromPathname,
  isSupportedLocale,
  routing,
  stripLocalePrefix,
} from "@/i18n/routing";
import {
  BANDORI_EVENTS_PATH,
  LEGACY_BANDORI_EVENT_TRACKER_PATH,
} from "@/lib/bandori/events/route";

const intlMiddleware = createMiddleware(routing);
const NEXT_INTL_LOCALE_HEADER = "X-NEXT-INTL-LOCALE";
const INTERNAL_DEFAULT_LOCALE_REWRITE_HEADER = "X-HHWX-Default-Locale-Rewrite";
const INTERNAL_UPSTREAM_PORTS = new Set(["3000"]);
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function getFirstHeaderValue(value: string | null): string | null {
  const firstValue = value?.split(",")[0]?.trim();
  return firstValue || null;
}

function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith(".localhost");
}

function normalizePublicHost(value: string | null): string | null {
  const host = getFirstHeaderValue(value);
  if (!host) {
    return null;
  }

  try {
    const parsed = new URL(`http://${host}`);
    if (parsed.port && INTERNAL_UPSTREAM_PORTS.has(parsed.port) && !isLocalHostname(parsed.hostname)) {
      return parsed.hostname;
    }

    return parsed.host;
  } catch {
    return null;
  }
}

function applyPublicHost(url: URL, host: string): void {
  const parsed = new URL(`http://${host}`);
  url.hostname = parsed.hostname;
  url.port = parsed.port;
}

function createPublicRedirectUrl(request: NextRequest): URL {
  const url = request.nextUrl.clone();
  const host = normalizePublicHost(request.headers.get("x-forwarded-host"))
    ?? normalizePublicHost(request.headers.get("host"))
    ?? normalizePublicHost(url.host);
  const protocol = getFirstHeaderValue(request.headers.get("x-forwarded-proto"));

  if (host) {
    applyPublicHost(url, host);
  }

  if (protocol === "http" || protocol === "https") {
    url.protocol = `${protocol}:`;
  }

  return url;
}

function normalizePagePathname(pathname: string): string {
  const normalized = stripLocalePrefix(pathname).replace(/\/+$/u, "");
  return normalized || "/";
}

function redirectLegacyBandoriEventTracker(request: NextRequest): NextResponse | null {
  if (normalizePagePathname(request.nextUrl.pathname) !== LEGACY_BANDORI_EVENT_TRACKER_PATH) {
    return null;
  }

  const rawEventId = request.nextUrl.searchParams.get("event")?.trim() || null;
  const locale = getLocaleFromPathname(request.nextUrl.pathname) ?? DEFAULT_LOCALE;
  const destinationPath = rawEventId === null
    ? BANDORI_EVENTS_PATH
    : `${BANDORI_EVENTS_PATH}/${encodeURIComponent(rawEventId)}`;
  const url = createPublicRedirectUrl(request);
  url.pathname = buildLocalizedPathname(destinationPath, locale);
  url.searchParams.delete("event");
  return NextResponse.redirect(url, 308);
}

export default function proxy(request: NextRequest) {
  const legacyEventTrackerRedirect = redirectLegacyBandoriEventTracker(request);
  if (legacyEventTrackerRedirect) {
    return legacyEventTrackerRedirect;
  }

  const pathname = request.nextUrl.pathname;
  const firstSegment = pathname.split("/").filter(Boolean)[0];

  if (firstSegment === DEFAULT_LOCALE) {
    if (request.headers.get(INTERNAL_DEFAULT_LOCALE_REWRITE_HEADER) === "1") {
      const headers = new Headers(request.headers);
      headers.set(NEXT_INTL_LOCALE_HEADER, DEFAULT_LOCALE);
      return NextResponse.next({
        request: {
          headers,
        },
      });
    }

    const url = createPublicRedirectUrl(request);
    url.pathname = stripLocalePrefix(pathname);
    return NextResponse.redirect(url);
  }

  if (isSupportedLocale(firstSegment)) {
    return intlMiddleware(request);
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? `/${DEFAULT_LOCALE}` : `/${DEFAULT_LOCALE}${pathname}`;
  const headers = new Headers(request.headers);
  headers.set(NEXT_INTL_LOCALE_HEADER, DEFAULT_LOCALE);
  headers.set(INTERNAL_DEFAULT_LOCALE_REWRITE_HEADER, "1");

  return NextResponse.rewrite(url, {
    request: {
      headers,
    },
  });
}

export const config = {
  matcher: [
    "/:locale(zh-CN|en)/manifest.webmanifest",
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
};
