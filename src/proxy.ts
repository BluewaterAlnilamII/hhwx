import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isSupportedLocale, routing, stripLocalePrefix } from "@/i18n/routing";

const intlMiddleware = createMiddleware(routing);
const NEXT_INTL_LOCALE_HEADER = "X-NEXT-INTL-LOCALE";
const INTERNAL_DEFAULT_LOCALE_REWRITE_HEADER = "X-HHWX-Default-Locale-Rewrite";

function createRequestHostUrl(request: NextRequest): URL {
  const url = request.nextUrl.clone();
  const host = request.headers.get("host");
  if (host) {
    url.host = host;
  }
  return url;
}

export default function proxy(request: NextRequest) {
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

    const url = createRequestHostUrl(request);
    url.pathname = stripLocalePrefix(pathname);
    return NextResponse.redirect(url);
  }

  if (isSupportedLocale(firstSegment)) {
    return intlMiddleware(request);
  }

  const url = createRequestHostUrl(request);
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
