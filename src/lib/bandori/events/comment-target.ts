import { ApiRouteError } from "@/lib/api-contracts";
import {
  DEFAULT_BANDORI_PREFERRED_SERVER,
  getBandoriServerCode,
  parseBandoriServerParam,
  type BandoriServer,
} from "@/lib/bandori-server";

export const COMMENT_TARGET_BANDORI_EVENT = "bandori_event";

const BANDORI_EVENT_COMMENT_TARGET_PATTERN = /^(jp|en|tw|cn):([1-9]\d*)$/u;
const BANDORI_EVENT_ID_PATTERN = /^[1-9]\d*$/u;

export function parseBandoriEventCommentEventId(value: unknown): string {
  if (typeof value !== "string" || !BANDORI_EVENT_ID_PATTERN.test(value)) {
    throw new ApiRouteError(400, "INVALID_EVENT_ID", "活动 ID 无效");
  }

  const eventId = Number(value);
  if (!Number.isSafeInteger(eventId)) {
    throw new ApiRouteError(400, "INVALID_EVENT_ID", "活动 ID 无效");
  }

  return value;
}

export function buildBandoriEventCommentTargetId(
  eventId: string | number,
  server: BandoriServer,
): string {
  const normalizedEventId = parseBandoriEventCommentEventId(String(eventId));
  return `${getBandoriServerCode(server)}:${normalizedEventId}`;
}

export function parseBandoriEventCommentServer(url: URL): BandoriServer | null {
  const rawServer = url.searchParams.get("server");
  return rawServer === null
    ? DEFAULT_BANDORI_PREFERRED_SERVER
    : parseBandoriServerParam(rawServer);
}

export function parseBandoriEventCommentTargetId(value: string): {
  eventId: number;
  server: BandoriServer;
} | null {
  const match = BANDORI_EVENT_COMMENT_TARGET_PATTERN.exec(value);
  if (!match) return null;
  const server = parseBandoriServerParam(match[1]);
  const eventId = Number(match[2]);
  return server === null || !Number.isSafeInteger(eventId) ? null : { eventId, server };
}

function readRegionalValue(value: unknown, server: BandoriServer): unknown {
  return Array.isArray(value) && value.length === 4 ? value[server] : value;
}

function isFiniteTimestamp(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  return Number.isFinite(Number(value));
}

function hasCompleteSchedule(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const schedule = value as Record<string, unknown>;
  return isFiniteTimestamp(schedule.startAt) && isFiniteTimestamp(schedule.endAt);
}

export function isBandoriEventCommentTargetAccessible(
  event: Record<string, unknown>,
  server: BandoriServer,
): boolean {
  const regionalName = readRegionalValue(event.eventName, server);
  if (typeof regionalName === "string" && regionalName.trim()) return true;

  const hasOfficialWindow = isFiniteTimestamp(readRegionalValue(event.startAt, server))
    && isFiniteTimestamp(readRegionalValue(event.endAt, server));
  if (hasOfficialWindow) return true;

  const serverCode = getBandoriServerCode(server);
  return hasCompleteSchedule(event[`${serverCode}Schedule`]);
}
