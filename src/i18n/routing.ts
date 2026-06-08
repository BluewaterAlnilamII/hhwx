import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["zh-CN", "en"],
  defaultLocale: "zh-CN",
  localePrefix: "as-needed",
  localeDetection: false,
  localeCookie: false,
});

export type AppLocale = typeof routing.locales[number];

export const DEFAULT_LOCALE = routing.defaultLocale;

export const LOCALE_LABELS: Record<AppLocale, string> = {
  "zh-CN": "简体中文",
  en: "English",
};

export function isSupportedLocale(value: string | null | undefined): value is AppLocale {
  return routing.locales.includes(value as AppLocale);
}

export function normalizeLocale(value: string | null | undefined): AppLocale {
  return isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

export function stripLocalePrefix(pathname: string): string {
  const safePathname = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const [firstSegment = "", ...restSegments] = safePathname.split("/").filter(Boolean);

  if (!isSupportedLocale(firstSegment)) {
    return safePathname;
  }

  const stripped = `/${restSegments.join("/")}`;
  return stripped === "/" ? "/" : stripped.replace(/\/+$/, "");
}

export function buildLocalizedPathname(pathname: string, locale: AppLocale): string {
  const internalPathname = stripLocalePrefix(pathname);
  if (locale === DEFAULT_LOCALE) {
    return internalPathname;
  }

  return internalPathname === "/" ? `/${locale}` : `/${locale}${internalPathname}`;
}

export function getLocaleFromPathname(pathname: string | null | undefined): AppLocale | null {
  if (!pathname) {
    return null;
  }

  const firstSegment = pathname.split("/").filter(Boolean)[0];
  return isSupportedLocale(firstSegment) ? firstSegment : null;
}
