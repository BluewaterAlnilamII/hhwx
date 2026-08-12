import { buildLocalizedPathname, normalizeLocale } from "@/i18n/routing";
import { getBandoriServerCode, type BandoriServer } from "@/lib/bandori-server";

export type BandoriCardDetailUrlPatch = {
  server?: BandoriServer | null;
  commentPage?: number | null;
  commentId?: string | null;
};

export function readBandoriCardDetailLocation(): {
  page: number;
  commentId: string | null;
} {
  if (typeof window === "undefined") {
    return { page: 1, commentId: null };
  }

  const params = new URLSearchParams(window.location.search);
  const rawPage = params.get("page");
  const page = rawPage !== null && /^[1-9]\d*$/u.test(rawPage)
    ? Number(rawPage)
    : 1;
  return {
    page: Number.isSafeInteger(page) ? page : 1,
    commentId: params.get("comment"),
  };
}

function setPositiveIntegerParam(
  params: URLSearchParams,
  name: string,
  value: number | null | undefined,
): void {
  if (value === undefined) return;
  if (value === null || !Number.isSafeInteger(value) || value <= 0) {
    params.delete(name);
    return;
  }
  params.set(name, String(value));
}

function setStringParam(
  params: URLSearchParams,
  name: string,
  value: string | null | undefined,
): void {
  if (value === undefined) return;
  const normalized = value?.trim() ?? "";
  if (normalized) {
    params.set(name, normalized);
  } else {
    params.delete(name);
  }
}

export function buildBandoriCardDetailHref(
  pathname: string,
  patch: BandoriCardDetailUrlPatch,
  currentParams = typeof window === "undefined"
    ? new URLSearchParams()
    : new URLSearchParams(window.location.search),
): string {
  const params = new URLSearchParams(currentParams);
  if (patch.server !== undefined) {
    if (patch.server === null) {
      params.delete("server");
    } else {
      params.set("server", getBandoriServerCode(patch.server));
    }
  }
  setPositiveIntegerParam(params, "page", patch.commentPage);
  setStringParam(params, "comment", patch.commentId);

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function replaceBandoriCardDetailUrlQuery(
  patch: Pick<BandoriCardDetailUrlPatch, "commentPage" | "commentId">,
): void {
  if (typeof window === "undefined") return;
  const nextUrl = `${buildBandoriCardDetailHref(window.location.pathname, patch)}${window.location.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) {
    window.history.replaceState(null, "", nextUrl);
  }
}

export function buildBandoriCardCommentPermalink({
  currentHref,
  locale,
  cardId,
  page,
  commentId,
}: {
  currentHref: string;
  locale: string;
  cardId: number;
  page: number;
  commentId: string;
}): string {
  if (!Number.isSafeInteger(cardId) || cardId <= 0) return "";

  const currentUrl = new URL(currentHref);
  const pathname = buildLocalizedPathname(
    `/bandori/cards/${cardId}`,
    normalizeLocale(locale),
  );
  const canonicalUrl = new URL(buildBandoriCardDetailHref(
    pathname,
    { commentPage: page, commentId },
    currentUrl.searchParams,
  ), currentUrl.origin);
  canonicalUrl.hash = currentUrl.hash;
  return canonicalUrl.toString();
}
