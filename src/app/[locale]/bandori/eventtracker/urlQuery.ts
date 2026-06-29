import type { TrackingMode } from "./types";

type EventTrackerUrlQueryPatch = {
  eventId?: number | null;
  trackingMode?: TrackingMode | null;
  tier?: number | null;
  commentPage?: number | null;
  commentId?: string | null;
};

const TRACKING_MODES = new Set<TrackingMode>(["event", "song", "monthly"]);

export function parseTrackingModeSearchParam(value: string | null): TrackingMode | null {
  if (value === null) {
    return null;
  }

  return TRACKING_MODES.has(value as TrackingMode) ? value as TrackingMode : null;
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
  setPositiveIntegerParam(url.searchParams, "event", patch.eventId);

  if (patch.trackingMode !== undefined) {
    if (patch.trackingMode === null) {
      url.searchParams.delete("type");
    } else {
      url.searchParams.set("type", patch.trackingMode);
    }
  }

  setPositiveIntegerParam(url.searchParams, "tier", patch.tier);
  setPositiveIntegerParam(url.searchParams, "page", patch.commentPage);
  setStringParam(url.searchParams, "comment", patch.commentId);

  const nextUrl = url.toString();
  if (nextUrl === window.location.href) {
    return;
  }

  window.history.replaceState(null, "", nextUrl);
}
