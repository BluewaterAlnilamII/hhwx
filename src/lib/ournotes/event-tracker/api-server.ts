import { ApiRouteError } from "@/lib/api-contracts";
import { jsonSuccess, jsonRouteError } from "@/lib/api-response";
import { NO_STORE_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";
import {
  OURNOTES_TRACKER_SERVERS, OURNOTES_TRACKER_TIERS, OURNOTES_TRACKER_MAX_ROWS, type OurNotesTrackerKind,
} from "./contract";
import { OurNotesTrackerReadError, readOurNotesTrackerHistory, readOurNotesParticipation } from "./history-server";

export async function handleOurNotesTrackerRequest(request: Request, kind: OurNotesTrackerKind) {
  const headers = withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY);
  try {
    const params = new URL(request.url).searchParams;
    const fields = kind === "data" ? ["server", "eventId", "tier"] : ["server", "eventId"];
    if (params.size !== fields.length || fields.some((key) => params.getAll(key).length !== 1)) {
      throw new ApiRouteError(400, "INVALID_REQUEST", `Required parameters: ${fields.join(", ")}. Unknown or repeated parameters are not accepted.`);
    }
    const serverParam = params.get("server")!;
    if (!/^[0124]$/u.test(serverParam)) {
      throw new ApiRouteError(400, "INVALID_REQUEST", "Server must be one of 0, 1, 2, or 4.", { server: serverParam });
    }
    const positiveInteger = (key: string) => {
      const raw = params.get(key)!;
      if (!/^[1-9]\d*$/u.test(raw) || !Number.isSafeInteger(Number(raw))) {
        throw new ApiRouteError(400, "INVALID_REQUEST", `${key} must be a positive safe integer.`);
      }
      return Number(raw);
    };
    const eventId = positiveInteger("eventId");
    const tier = kind === "data" ? positiveInteger("tier") : undefined;
    if (tier !== undefined && !OURNOTES_TRACKER_TIERS.some((supported) => supported === tier)) {
      throw new ApiRouteError(404, "TRACKER_TIER_NOT_SUPPORTED", "The requested tracker tier is not supported.");
    }
    const server = OURNOTES_TRACKER_SERVERS[Number(serverParam) as keyof typeof OURNOTES_TRACKER_SERVERS];
    const pack = await readOurNotesTrackerHistory({ kind, server, eventId });
    return jsonSuccess(pack.kind === "data"
      ? { cutoffs: (pack.tiers.get(tier!) ?? []).slice(0, OURNOTES_TRACKER_MAX_ROWS) }
      : { points: pack.points, users: pack.users }, { headers });
  } catch (error) {
    return jsonRouteError(error instanceof OurNotesTrackerReadError
      ? new ApiRouteError(503, "TRACKER_HISTORY_UNAVAILABLE", "Tracker history is temporarily unavailable.") : error,
    { status: 500, code: "INTERNAL_SERVER_ERROR", message: "Internal server error." }, { headers });
  }
}

export async function handleOurNotesParticipationRequest(request: Request) {
  const headers = withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY);
  try {
    if (new URL(request.url).searchParams.size !== 0) {
      throw new ApiRouteError(400, "INVALID_REQUEST", "This endpoint does not accept query parameters.");
    }
    return jsonSuccess(await readOurNotesParticipation(), { headers });
  } catch (error) {
    return jsonRouteError(error instanceof OurNotesTrackerReadError
      ? new ApiRouteError(503, "TRACKER_HISTORY_UNAVAILABLE", "Tracker history is temporarily unavailable.") : error,
    { status: 500, code: "INTERNAL_SERVER_ERROR", message: "Internal server error." }, { headers });
  }
}
