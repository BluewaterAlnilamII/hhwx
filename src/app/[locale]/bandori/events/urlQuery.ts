import type { TrackingMode } from "./_tracker/types";
import type { TrackerRankingSelection } from "./_tracker/tracker-tier-preference";
import { buildLocalizedPathname, normalizeLocale } from "@/i18n/routing";
import { buildBandoriEventsPath, parseBandoriEventRouteId } from "@/lib/bandori/events/route";
import {
  getBandoriServerCode,
  parseBandoriServerParam,
  type BandoriServer,
} from "@/lib/bandori-server";

export type EventTrackerView = "tracker" | "info";

type SearchParamsReader = Pick<URLSearchParams, "get">;

type EventTrackerUrlQueryPatch = {
  trackingMode?: TrackingMode | null;
  tier?: TrackerRankingSelection | null;
  commentPage?: number | null;
  commentId?: string | null;
  server?: BandoriServer | null;
  view?: EventTrackerView | null;
};

const TRACKING_MODES = new Set<TrackingMode>(["event", "song", "monthly"]);
const EVENT_TRACKER_VIEWS = new Set<EventTrackerView>(["tracker", "info"]);

export function parseTrackingModeSearchParam(value: string | null): TrackingMode | null {
  if (value === null) {
    return null;
  }

  return TRACKING_MODES.has(value as TrackingMode) ? value as TrackingMode : null;
}

export function parseEventTrackerViewSearchParam(value: string | null): EventTrackerView | null {
  return value !== null && EVENT_TRACKER_VIEWS.has(value as EventTrackerView)
    ? value as EventTrackerView
    : null;
}

export function parseEventTrackerServerSearchParam(value: string | null): BandoriServer | null {
  return parseBandoriServerParam(value);
}

export function resolveEventTrackerServerSelection(
  value: string | null,
  preferredServer: BandoriServer,
): BandoriServer {
  return parseEventTrackerServerSearchParam(value) ?? preferredServer;
}

export function readPositiveIntegerSearchParam(params: URLSearchParams, name: string): number | null {
  const rawValue = params.get(name);
  if (rawValue === null) {
    return null;
  }

  const value = Number.parseInt(rawValue, 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function readEventTrackerSearchParams(): URLSearchParams {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }

  return new URLSearchParams(window.location.search);
}

export function buildEventTrackerRouteStateKey(
  initialEventId: number | null,
  params: SearchParamsReader,
  preferredServer: BandoriServer,
): string {
  return JSON.stringify({
    eventId: initialEventId,
    type: params.get("type"),
    tier: params.get("tier"),
    server: params.get("server"),
    view: params.get("view"),
    preferredServer,
  });
}

function setPositiveIntegerParam(params: URLSearchParams, name: string, value: number | null | undefined) {
  if (value === undefined) {
    return;
  }

  if (value === null || !Number.isInteger(value) || value <= 0) {
    params.delete(name);
    return;
  }

  params.set(name, String(value));
}

function setTrackerRankingParam(
  params: URLSearchParams,
  value: TrackerRankingSelection | null | undefined,
) {
  if (value === undefined) {
    return;
  }
  if (value === "top10") {
    params.set("tier", value);
    return;
  }
  setPositiveIntegerParam(params, "tier", value);
}

function setStringParam(params: URLSearchParams, name: string, value: string | null | undefined) {
  if (value === undefined) {
    return;
  }

  const normalizedValue = value?.trim() ?? "";
  if (!normalizedValue) {
    params.delete(name);
    return;
  }

  params.set(name, normalizedValue);
}

export function buildEventTrackerHref(
  pathname: string,
  patch: EventTrackerUrlQueryPatch,
  currentParams: URLSearchParams = readEventTrackerSearchParams(),
): string {
  const params = new URLSearchParams(currentParams);

  // Event identity is owned by /events/[eventId], never by query state.
  params.delete("event");

  if (patch.trackingMode !== undefined) {
    if (patch.trackingMode === null) {
      params.delete("type");
    } else {
      params.set("type", patch.trackingMode);
    }
  }

  setTrackerRankingParam(params, patch.tier);
  setPositiveIntegerParam(params, "page", patch.commentPage);
  setStringParam(params, "comment", patch.commentId);

  if (patch.server !== undefined) {
    if (patch.server === null) {
      params.delete("server");
    } else {
      params.set("server", getBandoriServerCode(patch.server));
    }
  }

  if (patch.view !== undefined) {
    if (patch.view === null || patch.view === "tracker") {
      params.delete("view");
    } else {
      params.set("view", patch.view);
    }
  }

  const queryString = params.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

export function buildEventCommentPermalink({
  currentHref,
  locale,
  eventId,
  server,
  page,
  commentId,
}: {
  currentHref: string;
  locale: string;
  eventId: number | null;
  server: BandoriServer;
  page: number;
  commentId: string;
}): string {
  const canonicalEventId = parseBandoriEventRouteId(String(eventId ?? ""));
  if (canonicalEventId === null) {
    return "";
  }

  const currentUrl = new URL(currentHref);
  const canonicalPathname = buildLocalizedPathname(
    buildBandoriEventsPath(canonicalEventId),
    normalizeLocale(locale),
  );
  const canonicalUrl = new URL(
    buildEventTrackerHref(
      canonicalPathname,
      {
        server,
        commentPage: page,
        commentId,
      },
      currentUrl.searchParams,
    ),
    currentUrl.origin,
  );
  canonicalUrl.hash = currentUrl.hash;
  return canonicalUrl.toString();
}

export function replaceEventTrackerUrlQuery(patch: EventTrackerUrlQueryPatch) {
  if (typeof window === "undefined") {
    return;
  }

  const nextUrl = `${buildEventTrackerHref(window.location.pathname, patch)}${window.location.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl === currentUrl) {
    return;
  }

  window.history.replaceState(null, "", nextUrl);
}
