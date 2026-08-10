import type { TrackingMode } from "./_tracker/types";
import type { TrackerRankingSelection } from "./_tracker/tracker-tier-preference";
import { buildLocalizedPathname, DEFAULT_LOCALE, getLocaleFromPathname } from "@/i18n/routing";
import { buildBandoriEventsPath } from "@/lib/bandori/events/route";
import {
  getBandoriServerCode,
  parseBandoriServerParam,
  type BandoriServer,
} from "@/lib/bandori-server";

export type EventTrackerView = "tracker" | "info";

type EventTrackerUrlQueryPatch = {
  eventId?: number | null;
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

export function replaceEventTrackerUrlQuery(patch: EventTrackerUrlQueryPatch) {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  if (patch.eventId !== undefined) {
    url.searchParams.delete("event");
    url.pathname = buildLocalizedPathname(
      buildBandoriEventsPath(patch.eventId),
      getLocaleFromPathname(url.pathname) ?? DEFAULT_LOCALE,
    );
  }

  if (patch.trackingMode !== undefined) {
    if (patch.trackingMode === null) {
      url.searchParams.delete("type");
    } else {
      url.searchParams.set("type", patch.trackingMode);
    }
  }

  setTrackerRankingParam(url.searchParams, patch.tier);
  setPositiveIntegerParam(url.searchParams, "page", patch.commentPage);
  setStringParam(url.searchParams, "comment", patch.commentId);

  if (patch.server !== undefined) {
    if (patch.server === null) {
      url.searchParams.delete("server");
    } else {
      url.searchParams.set("server", getBandoriServerCode(patch.server));
    }
  }

  if (patch.view !== undefined) {
    if (patch.view === null || patch.view === "tracker") {
      url.searchParams.delete("view");
    } else {
      url.searchParams.set("view", patch.view);
    }
  }

  const nextUrl = url.toString();
  if (nextUrl === window.location.href) {
    return;
  }

  window.history.replaceState(null, "", nextUrl);
}
