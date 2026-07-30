import {
  DEFAULT_BANDORI_PREFERRED_SERVER,
  getBandoriServerCode,
  parseBandoriServerParam,
  type BandoriServer,
} from "@/lib/bandori-server";

const BANDORI_EVENT_COMMENT_TARGET_PATTERN = /^(jp|en|tw|cn):([1-9]\d*)$/u;

export function buildBandoriEventCommentTargetId(
  eventId: string | number,
  server: BandoriServer,
): string {
  return `${getBandoriServerCode(server)}:${eventId}`;
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
