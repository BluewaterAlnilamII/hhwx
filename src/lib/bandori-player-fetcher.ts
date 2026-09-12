import { ApiRouteError } from "@/lib/api-contracts";
import { getBandoriBackendToken } from "@/lib/hhwx-bandori-backend-server";
import { BANDORI_SERVER_CODES } from "@/lib/bandori-server";
import { redactBandoriPlayerProfile } from "@/lib/bandori/player-profile";

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

  return {
    server: SUPPORTED_BANDORI_PLAYER_SERVERS.includes(payload.server as BandoriPlayerServer)
      ? payload.server as BandoriPlayerServer
      : fallback.server,
    uid: typeof payload.gameUid === "string" ? payload.gameUid : fallback.uid,
    mode: BANDORI_PLAYER_MODES.includes(payload.mode as BandoriPlayerMode)
      ? payload.mode as BandoriPlayerMode
      : fallback.mode,
    cache: payload.cache === true,
    fetchedAt: typeof payload.fetchedAt === "string" ? payload.fetchedAt : null,
    profile: redactBandoriPlayerProfile(payload.profile),
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

  const response = await fetch(endpoint, {
    method: "GET",
    headers: developmentProxy ? undefined : { Authorization: `Bearer ${token}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  }).catch(() => {
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
    throw new ApiRouteError(502, "TRACKER_SERVICE_INVALID_RESPONSE", "Player profile service returned an invalid response");
  } finally {
    reader?.releaseLock();
  }
  let payload: unknown = null;
  try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* Invalid JSON is handled below. */ }

  if (!response.ok) {
    if (response.status === 404) {
      throw new ApiRouteError(404, "BANDORI_PLAYER_NOT_FOUND", "Player profile is unavailable");
    }

    if (response.status === 429) {
      throw new ApiRouteError(503, "TRACKER_SERVICE_BUSY", "Player profile service is busy");
    }

    if (response.status === 503) {
      if (developmentProxy) throw new ApiRouteError(503, "TRACKER_SERVICE_BUSY", "Player profile service is unavailable");
      throw new ApiRouteError(
        503,
        "TRACKER_PLAYER_SERVER_NOT_CONFIGURED",
        "Player profile account is not configured for this server",
      );
    }

    throw new ApiRouteError(
      response.status >= 500 ? 502 : 400,
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
