import { NextResponse } from "next/server";
import { NO_STORE_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";
import { jsonError } from "@/lib/api-response";
import { getBandoriServerCode, normalizeBandoriServer } from "@/lib/bandori-server";
import {
  BandoriTopDataHistoryReadError,
  readBandoriTopDataHistory,
} from "@/lib/bandori-topdata-history-server";
export {
  inspectBandoriTopDataTargetStateSizesForTests,
  resetBandoriTopDataTargetStatesForTests,
} from "@/lib/bandori-topdata-history-server";
import {
  BandoriScopedTopDataNotFoundError,
  BandoriScopedTopDataReadError,
  BandoriSongTopDataRequiredError,
  readBandoriMonthlyTopDataHistory,
  readBandoriSongTopDataHistory,
} from "@/lib/bandori-topdata-scoped-history-server";

const EVENT_ID_PATTERN = /^[0-9]+$/u;
const MAX_EVENT_ID = 2_147_483_647;
const NO_STORE_HEADERS = withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY);

function invalidRequest(message: string) {
  return jsonError(400, "INVALID_REQUEST", message, { headers: NO_STORE_HEADERS });
}

/**
 * Registered Bestdori wire-compatible adapter: successful history reads keep
 * the exact points/users body while operational failures use HHWX errors.
 */
export async function handleBandoriTrackerTopDataRequest(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const server = searchParams.get("server");
    const eventParam = searchParams.get("event");
    const type = searchParams.get("type") || "event";
    const songParam = searchParams.get("song");

    const normalizedServer = normalizeBandoriServer(server);
    if (normalizedServer === null) {
      return invalidRequest("Server must be an integer from 0 to 3.");
    }
    if (!eventParam || !EVENT_ID_PATTERN.test(eventParam)) {
      return invalidRequest("Event must be a positive integer.");
    }
    const eventId = Number(eventParam);
    if (!Number.isSafeInteger(eventId) || eventId < 1 || eventId > MAX_EVENT_ID) {
      return invalidRequest(`Event must be between 1 and ${MAX_EVENT_ID}.`);
    }
    const serverCode = getBandoriServerCode(normalizedServer);
    if (type === "event") {
      const result = await readBandoriTopDataHistory(serverCode, eventId);
      return NextResponse.json(result.payload, { headers: NO_STORE_HEADERS });
    }
    if (type === "song") {
      if (songParam !== null && !EVENT_ID_PATTERN.test(songParam)) {
        return invalidRequest("Song must be a non-negative integer.");
      }
      const songId = songParam === null ? null : Number(songParam);
      if (songId !== null && (!Number.isSafeInteger(songId) || songId < 0 || songId > MAX_EVENT_ID)) {
        return invalidRequest("Song must be a non-negative integer.");
      }
      const payload = await readBandoriSongTopDataHistory(serverCode, eventId, songId);
      return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
    }
    if (type === "monthly") {
      const payload = await readBandoriMonthlyTopDataHistory(serverCode, eventId);
      return NextResponse.json(payload, { headers: NO_STORE_HEADERS });
    }
    return invalidRequest("Type must be event, song, or monthly.");
  } catch (error) {
    if (error instanceof BandoriSongTopDataRequiredError) {
      return jsonError(400, "SONG_REQUIRED", "Song is required for challenge TOP10 history.", { headers: NO_STORE_HEADERS });
    }
    if (error instanceof BandoriScopedTopDataNotFoundError) {
      return jsonError(404, "SONG_TOP10_NOT_FOUND", "Song TOP10 history target was not found.", { headers: NO_STORE_HEADERS });
    }
    if (error instanceof BandoriTopDataHistoryReadError) {
      return jsonError(
        503,
        "TRACKER_HISTORY_UNAVAILABLE",
        "Tracker history is temporarily unavailable.",
        { headers: NO_STORE_HEADERS },
      );
    }
    if (error instanceof BandoriScopedTopDataReadError) {
      return jsonError(503, "TRACKER_HISTORY_UNAVAILABLE", "Tracker history is temporarily unavailable.", { headers: NO_STORE_HEADERS });
    }
    console.error("Bandori TOP10 tracker API failed", error);
    return jsonError(500, "INTERNAL_SERVER_ERROR", "Internal server error.", {
      headers: NO_STORE_HEADERS,
    });
  }
}
