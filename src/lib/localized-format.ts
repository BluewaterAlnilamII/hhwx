import { type AppLocale } from "@/i18n/routing";

export function formatLocalizedDateTime(value: string | number | null | undefined, locale: AppLocale, fallback: string): string {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatLocalizedDate(value: string | number | null | undefined, locale: AppLocale, fallback: string): string {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatLocalizedInteger(value: number | null | undefined, locale: AppLocale): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value));
}
