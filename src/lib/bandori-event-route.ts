export const BANDORI_EVENTS_PATH = "/bandori/events";
export const LEGACY_BANDORI_EVENT_TRACKER_PATH = "/bandori/eventtracker";

const BANDORI_EVENT_ROUTE_ID_PATTERN = /^[1-9]\d*$/u;

export function parseBandoriEventRouteId(value: string | null | undefined): number | null {
  if (!value || !BANDORI_EVENT_ROUTE_ID_PATTERN.test(value)) {
    return null;
  }

  const eventId = Number(value);
  return Number.isSafeInteger(eventId) ? eventId : null;
}

export function buildBandoriEventsPath(eventId: number | null): string {
  return eventId === null ? BANDORI_EVENTS_PATH : `${BANDORI_EVENTS_PATH}/${eventId}`;
}
