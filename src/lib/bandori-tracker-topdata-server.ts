import { NextResponse } from "next/server";
import { NO_STORE_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";
import { jsonError } from "@/lib/api-response";
import {
  BandoriTopDataHistoryReadError,
  readBandoriTopDataHistory,
} from "@/lib/bandori-topdata-history-server";

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

    if (server !== "3") {
      return invalidRequest("Only server 3 (CN) is currently supported.");
    }
    if (!eventParam || !EVENT_ID_PATTERN.test(eventParam)) {
      return invalidRequest("Event must be a positive integer.");
    }
    const eventId = Number(eventParam);
    if (!Number.isSafeInteger(eventId) || eventId < 1 || eventId > MAX_EVENT_ID) {
      return invalidRequest(`Event must be between 1 and ${MAX_EVENT_ID}.`);
    }
    if (type !== "event") {
      return invalidRequest("Only event TOP10 history is currently supported.");
    }

    const result = await readBandoriTopDataHistory("cn", eventId);
    return NextResponse.json(result.payload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof BandoriTopDataHistoryReadError) {
      return jsonError(
        503,
        "TRACKER_HISTORY_UNAVAILABLE",
        "Tracker history is temporarily unavailable.",
        { headers: NO_STORE_HEADERS },
      );
    }
    console.error("Bandori TOP10 tracker API failed", error);
    return jsonError(500, "INTERNAL_SERVER_ERROR", "Internal server error.", {
      headers: NO_STORE_HEADERS,
    });
  }
}
