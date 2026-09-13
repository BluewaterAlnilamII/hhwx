import { ApiRouteError } from "@/lib/api-contracts";
import { getBandoriBackendToken } from "@/lib/hhwx-bandori-backend-server";
import { BANDORI_SERVER_CODES } from "@/lib/bandori-server";
import { isValidPlayerUid, redactBandoriPlayerProfile } from "@/lib/bandori/player-profile";

const BANDORI_PLAYER_SERVERS = ["jp", "en", "tw", "cn", "kr"] as const;
const SUPPORTED_BANDORI_PLAYER_SERVERS = BANDORI_SERVER_CODES;

export type BandoriPlayerServer = typeof SUPPORTED_BANDORI_PLAYER_SERVERS[number];

export type BandoriPlayerData = {
  server: BandoriPlayerServer;
  uid: string;
  fetchedAt: string | null;
  profile: Record<string, unknown>;
};

type TrackerBandoriPlayerPayload = {
  server?: unknown;
  gameUid?: unknown;
  fetchedAt?: unknown;
  profile?: unknown;
};

const PLAYER_FAILURES: Record<string, { status: number; message: string }> = {
  BANDORI_PLAYER_NOT_FOUND: { status: 404, message: "Player was not found" },
  TRACKER_SERVICE_BUSY: { status: 503, message: "Player profile service is busy" },
  BANDORI_PLAYER_MAINTENANCE: { status: 503, message: "Game server is under maintenance" },
  TRACKER_SERVICE_UNAVAILABLE: { status: 503, message: "Player profile service is unavailable" },
  TRACKER_SERVICE_TIMEOUT: { status: 504, message: "Player profile request timed out" },
  TRACKER_SERVICE_INVALID_RESPONSE: { status: 502, message: "Player profile service returned an invalid response" },
  TRACKER_SERVICE_FAILED: { status: 502, message: "Failed to fetch player profile" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeBandoriPlayerServer(value: unknown): BandoriPlayerServer {
  const server = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (!BANDORI_PLAYER_SERVERS.includes(server as typeof BANDORI_PLAYER_SERVERS[number])) {
    throw new ApiRouteError(400, "INVALID_BANDORI_PLAYER_SERVER", "server must be jp, en, tw, cn, or kr");
  }

  if (!SUPPORTED_BANDORI_PLAYER_SERVERS.includes(server as BandoriPlayerServer)) {
    throw new ApiRouteError(
      501,
      "BANDORI_PLAYER_SERVER_UNSUPPORTED",
      "Only JP, EN, TW, and CN player profiles are supported",
    );
  }

  return server as BandoriPlayerServer;
}

export function normalizeBandoriPlayerUid(value: unknown): string {
  const uid = typeof value === "string" ? value.trim() : "";
  if (!isValidPlayerUid(uid)) {
    throw new ApiRouteError(400, "INVALID_GAME_UID", "Player ID must be 1–20 digits within the uint64 range");
  }
  return uid.replace(/^0+(?=[0-9])/u, "");
}

function normalizeTrackerPlayerPayload(payload: TrackerBandoriPlayerPayload | null, fallback: {
  server: BandoriPlayerServer;
  uid: string;
}): BandoriPlayerData {
  if (!payload || typeof payload !== "object") {
    throw new ApiRouteError(
      502,
      "TRACKER_SERVICE_INVALID_RESPONSE",
      "Player profile service returned an invalid response",
    );
  }

  if (!isRecord(payload.profile)) {
    throw new ApiRouteError(
      502,
      "TRACKER_SERVICE_INVALID_RESPONSE",
      "Player profile service response is missing profile data",
    );
  }

  if (payload.profile.userId !== fallback.uid
    || (payload.gameUid !== undefined && payload.gameUid !== fallback.uid)
    || (payload.server !== undefined && payload.server !== fallback.server)) {
    throw new ApiRouteError(502, "TRACKER_SERVICE_INVALID_RESPONSE", "Player profile identity did not match the request");
  }

  // Reject the retired cache contract, including during binding verification.
  if ("mode" in payload || "cache" in payload || "refreshError" in payload) {
    throw new ApiRouteError(502, "TRACKER_SERVICE_INVALID_RESPONSE", "Player profile service returned the retired cache contract");
  }

  return {
    server: SUPPORTED_BANDORI_PLAYER_SERVERS.includes(payload.server as BandoriPlayerServer)
      ? payload.server as BandoriPlayerServer
      : fallback.server,
    uid: typeof payload.gameUid === "string" ? payload.gameUid : fallback.uid,
    fetchedAt: typeof payload.fetchedAt === "string" ? payload.fetchedAt : null,
    profile: redactBandoriPlayerProfile(payload.profile),
  };
}

export async function fetchBandoriPlayerProfile(
  server: BandoriPlayerServer,
  uid: string,
  options: { allowDevelopmentProxy?: boolean } = {},
): Promise<BandoriPlayerData> {
  const developmentProxy = options.allowDevelopmentProxy === true
    && process.env.NODE_ENV === "development"
    && process.env.HHWX_DEV_PLAYER_API_PROXY === "1";
  const baseUrl = process.env.HHWX_USER_FETCHER_BASE_URL?.trim();
  const token = getBandoriBackendToken();

  if (!developmentProxy && (!baseUrl || !token)) {
    throw new ApiRouteError(500, "TRACKER_SERVICE_NOT_CONFIGURED", "Player profile service is not configured");
  }

  const endpoint = developmentProxy
    ? new URL(`https://hhwx.org/api/bandori/player/${server}/${uid}`)
    : new URL(`${baseUrl!.replace(/\/+$/, "")}/internal/hhwx-user-fetcher/player/${server}/${uid}`);

  const signal = AbortSignal.timeout(30_000);
  const response = await fetch(endpoint, {
    method: "GET",
    headers: developmentProxy ? undefined : { Authorization: `Bearer ${token}` },
    cache: "no-store",
    redirect: "error",
    signal,
  }).catch((error: unknown) => {
    if (signal.aborted || error instanceof Error && error.name === "TimeoutError") {
      throw new ApiRouteError(504, "TRACKER_SERVICE_TIMEOUT", "Player profile request timed out");
    }
    throw new ApiRouteError(502, "TRACKER_SERVICE_FAILED", "Failed to fetch player profile");
  });

  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (reader) while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024 * 1024) throw new Error("Player response exceeds limit");
      chunks.push(value);
    }
  } catch {
    await reader?.cancel().catch(() => undefined);
    if (signal.aborted) throw new ApiRouteError(504, "TRACKER_SERVICE_TIMEOUT", "Player profile request timed out");
    throw new ApiRouteError(502, "TRACKER_SERVICE_INVALID_RESPONSE", "Player profile service returned an invalid response");
  } finally {
    reader?.releaseLock();
  }
  let payload: unknown = null;
  try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* Invalid JSON is handled below. */ }

  if (!response.ok) {
    const code = isRecord(payload)
      ? developmentProxy && isRecord(payload.error) ? payload.error.code : payload.code
      : null;
    const failure = typeof code === "string" && Object.hasOwn(PLAYER_FAILURES, code) ? PLAYER_FAILURES[code] : null;
    if (failure && (failure.status === response.status || code === "TRACKER_SERVICE_BUSY" && response.status === 429)) {
      throw new ApiRouteError(failure.status, code as string, failure.message);
    }
    if (response.status === 401 || response.status === 403) {
      throw new ApiRouteError(502, "TRACKER_SERVICE_FAILED", "Failed to fetch player profile");
    }

    throw new ApiRouteError(
      502,
      "TRACKER_SERVICE_INVALID_RESPONSE",
      "Player profile service returned an invalid response",
    );
  }

  if (developmentProxy) {
    if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)
      || payload.data.uid !== uid || payload.data.server !== server) {
      throw new ApiRouteError(502, "TRACKER_SERVICE_INVALID_RESPONSE", "Player profile service returned an invalid response");
    }
    payload = { ...payload.data, gameUid: payload.data.uid };
  }
  return normalizeTrackerPlayerPayload(isRecord(payload) ? payload : null, { server, uid });
}
