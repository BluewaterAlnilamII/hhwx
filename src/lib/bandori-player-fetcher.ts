import { ApiRouteError } from "@/lib/api-contracts";
import { getBandoriBackendToken } from "@/lib/hhwx-bandori-backend-server";
import { BANDORI_SERVER_CODES } from "@/lib/bandori-server";
import { isPlayerDataFresh, PLAYER_REFRESH_ERROR_CODES, redactBandoriPlayerProfile, type PlayerRefreshError } from "@/lib/bandori/player-profile";

export const BANDORI_PLAYER_MODES = [0, 1, 2, 3] as const;
export type BandoriPlayerMode = typeof BANDORI_PLAYER_MODES[number];

const BANDORI_PLAYER_SERVERS = ["jp", "en", "tw", "cn", "kr"] as const;
const SUPPORTED_BANDORI_PLAYER_SERVERS = BANDORI_SERVER_CODES;

export type BandoriPlayerServer = typeof SUPPORTED_BANDORI_PLAYER_SERVERS[number];

export type BandoriPlayerData = {
  server: BandoriPlayerServer;
  uid: string;
  mode: BandoriPlayerMode;
  cache: boolean;
  fetchedAt: string | null;
  profile: Record<string, unknown>;
  refreshError?: PlayerRefreshError;
};

type TrackerBandoriPlayerPayload = {
  server?: unknown;
  gameUid?: unknown;
  mode?: unknown;
  cache?: unknown;
  fetchedAt?: unknown;
  profile?: unknown;
  error?: unknown;
  details?: unknown;
  refreshError?: unknown;
};

const PLAYER_FAILURES: Record<string, { status: number; message: string }> = {
  BANDORI_PLAYER_NOT_FOUND: { status: 404, message: "Player was not found" },
  BANDORI_PLAYER_CACHE_MISS: { status: 404, message: "No valid cached player profile is available" },
  BANDORI_PLAYER_UNAVAILABLE: { status: 404, message: "Player profile is unavailable" },
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

export function normalizeBandoriPlayerMode(value: unknown): BandoriPlayerMode {
  const rawMode = value === null || value === undefined || value === "" ? "2" : String(value).trim();

  if (!/^[0-3]$/.test(rawMode)) {
    throw new ApiRouteError(400, "INVALID_BANDORI_PLAYER_MODE", "mode must be 0, 1, 2, or 3");
  }

  return Number.parseInt(rawMode, 10) as BandoriPlayerMode;
}

function normalizeTrackerPlayerPayload(payload: TrackerBandoriPlayerPayload | null, fallback: {
  server: BandoriPlayerServer;
  uid: string;
  mode: BandoriPlayerMode;
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

  if (fallback.mode === 3 && payload.cache !== false) {
    throw new ApiRouteError(502, "TRACKER_SERVICE_INVALID_RESPONSE", "A live player profile was required");
  }
  const fetchedAt = typeof payload.fetchedAt === "string" ? payload.fetchedAt : null;
  if (payload.cache === true && !isPlayerDataFresh({ fetchedAt })) {
    throw new ApiRouteError(404, "BANDORI_PLAYER_CACHE_MISS", "Cached player profile has expired");
  }
  let refreshError: PlayerRefreshError | undefined;
  if (payload.refreshError !== undefined) {
    const code = isRecord(payload.refreshError) ? payload.refreshError.code : null;
    if (payload.cache !== true || !PLAYER_REFRESH_ERROR_CODES.includes(code as PlayerRefreshError["code"])) {
      throw new ApiRouteError(502, "TRACKER_SERVICE_INVALID_RESPONSE", "Invalid player refresh status");
    }
    refreshError = { code: code as PlayerRefreshError["code"] };
  }

  return {
    server: SUPPORTED_BANDORI_PLAYER_SERVERS.includes(payload.server as BandoriPlayerServer)
      ? payload.server as BandoriPlayerServer
      : fallback.server,
    uid: typeof payload.gameUid === "string" ? payload.gameUid : fallback.uid,
    mode: BANDORI_PLAYER_MODES.includes(payload.mode as BandoriPlayerMode)
      ? payload.mode as BandoriPlayerMode
      : fallback.mode,
    cache: payload.cache === true,
    fetchedAt,
    profile: redactBandoriPlayerProfile(payload.profile),
    ...(refreshError ? { refreshError } : {}),
  };
}

export async function fetchBandoriPlayerProfile(
  server: BandoriPlayerServer,
  uid: string,
  mode: BandoriPlayerMode,
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
  endpoint.searchParams.set("mode", String(mode));

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
    if (response.status === 404) {
      // Legacy backends conflate cache misses and upstream failures with absent players.
      throw new ApiRouteError(404, "BANDORI_PLAYER_UNAVAILABLE", "Player profile is unavailable");
    }

    if (response.status === 429) {
      throw new ApiRouteError(503, "TRACKER_SERVICE_BUSY", "Player profile service is busy");
    }

    if (response.status === 503) {
      throw new ApiRouteError(503, "TRACKER_SERVICE_UNAVAILABLE", "Player profile service is unavailable");
    }
    if (response.status === 504) throw new ApiRouteError(504, "TRACKER_SERVICE_TIMEOUT", "Player profile request timed out");

    throw new ApiRouteError(
      response.status === 400 ? 400 : 502,
      "TRACKER_SERVICE_FAILED",
      "Failed to fetch player profile",
    );
  }

  if (developmentProxy) {
    if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)
      || payload.data.uid !== uid || payload.data.server !== server) {
      throw new ApiRouteError(502, "TRACKER_SERVICE_INVALID_RESPONSE", "Player profile service returned an invalid response");
    }
    payload = { ...payload.data, gameUid: payload.data.uid };
  }
  return normalizeTrackerPlayerPayload(isRecord(payload) ? payload : null, { server, uid, mode });
}
