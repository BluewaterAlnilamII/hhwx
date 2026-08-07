import { NextResponse } from "next/server";
import { NO_STORE_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";
import {
  type BandoriCutoffHistoryCutoffs,
  type BandoriCutoffHistoryQuery,
  type BandoriCutoffHistoryType,
} from "@/lib/bandori-cutoff-history-contract";
import {
  BandoriCutoffHistoryReadError,
  readBandoriCutoffHistoryFromR2,
} from "@/lib/bandori-cutoff-history-server";
import { jsonError } from "@/lib/api-response";
import { getBandoriServerCode, normalizeBandoriServer } from "@/lib/bandori-server";
import { isSupportedTrackerTier } from "@/lib/bandori-tracker-tiers";

const VALID_TRACKER_TYPES = new Set<BandoriCutoffHistoryType>(["event", "song", "monthly"]);
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/u;
const DEGRADED_LOG_INTERVAL_MS = 60_000;
const MAX_DEGRADED_LOG_KEYS = 256;
const MAX_R2_SUCCESS_LOG_KEYS = 256;

const degradedLogTimes = new Map<string, number>();
const r2SuccessLogKeys = new Map<string, true>();

function errorResponse(
  status: number,
  code: string,
  message: string,
  options?: {
    details?: Record<string, string | number | boolean | null>;
  },
) {
  return jsonError(status, code, message, {
    headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    details: options?.details,
  });
}

function isTrackerType(value: string): value is BandoriCutoffHistoryType {
  return VALID_TRACKER_TYPES.has(value as BandoriCutoffHistoryType);
}

function logR2Degraded(
  query: BandoriCutoffHistoryQuery,
  error: unknown,
  mode: "stale" | "unavailable",
): void {
  const reason = error instanceof BandoriCutoffHistoryReadError ? error.reason : "unexpected";
  const key = `${query.server}:${query.targetId}:${query.type}:${query.tier}:${mode}:${reason}`;
  const now = Date.now();
  if ((degradedLogTimes.get(key) ?? 0) + DEGRADED_LOG_INTERVAL_MS > now) return;
  degradedLogTimes.delete(key);
  degradedLogTimes.set(key, now);
  while (degradedLogTimes.size > MAX_DEGRADED_LOG_KEYS) {
    const oldestKey = degradedLogTimes.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    degradedLogTimes.delete(oldestKey);
  }
  console.warn("Bandori tracker history R2 degraded", {
    server: query.server,
    event: query.targetId,
    tier: query.tier,
    type: query.type,
    mode,
    reason,
  });
}

function cutoffCount(cutoffs: BandoriCutoffHistoryCutoffs): number {
  if (Array.isArray(cutoffs)) return cutoffs.length;
  return Object.values(cutoffs).reduce((total, points) => total + points.length, 0);
}

function logR2Success(
  query: BandoriCutoffHistoryQuery,
  result: Awaited<ReturnType<typeof readBandoriCutoffHistoryFromR2>>,
  elapsedMs: number,
): void {
  const key = `${query.server}:${query.targetId}:${query.type}:${result.generation ?? "missing"}`;
  if (r2SuccessLogKeys.has(key)) return;
  r2SuccessLogKeys.set(key, true);
  while (r2SuccessLogKeys.size > MAX_R2_SUCCESS_LOG_KEYS) {
    const oldestKey = r2SuccessLogKeys.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    r2SuccessLogKeys.delete(oldestKey);
  }
  console.info("Bandori tracker history R2 read succeeded", {
    server: query.server,
    event: query.targetId,
    tier: query.tier,
    type: query.type,
    generation: result.generation,
    publishedAt: result.publishedAt,
    elapsedMs,
    recordCount: cutoffCount(result.cutoffs),
  });
}

async function readTrackerHistory(
  query: BandoriCutoffHistoryQuery,
): Promise<BandoriCutoffHistoryCutoffs> {
  try {
    const startedAt = Date.now();
    const result = await readBandoriCutoffHistoryFromR2(query, {
      allowStale: true,
    });
    if (result.isStale) {
      logR2Degraded(query, null, "stale");
    } else {
      logR2Success(query, result, Date.now() - startedAt);
    }
    return result.cutoffs;
  } catch (error) {
    logR2Degraded(query, error, "unavailable");
    throw error;
  }
}

/**
 * Keeps the historical result/cutoffs success shape while reading private R2
 * artifacts exclusively. Missing supported datasets remain a normal 200;
 * operational or contract failures return an explicit non-2xx error.
 */
export async function handleBandoriTrackerDataRequest(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const server = searchParams.get("server");
    const eventIdParam = searchParams.get("event");
    const tierParam = searchParams.get("tier");
    const typeParam = searchParams.get("type") || "event";

    const normalizedServer = normalizeBandoriServer(server);
    if (normalizedServer === null) {
      return errorResponse(400, "INVALID_REQUEST", "Server must be an integer from 0 to 3.", {
        details: { server },
      });
    }
    if (!eventIdParam || !tierParam) {
      return errorResponse(400, "INVALID_REQUEST", "Missing required parameters: event, tier.", {
        details: { event: eventIdParam, tier: tierParam },
      });
    }
    if (!isTrackerType(typeParam)) {
      return errorResponse(400, "INVALID_REQUEST", "Unsupported tracker type.", {
        details: { type: typeParam },
      });
    }

    if (
      !POSITIVE_INTEGER_PATTERN.test(eventIdParam)
      || !POSITIVE_INTEGER_PATTERN.test(tierParam)
    ) {
      return errorResponse(400, "INVALID_REQUEST", "Numeric parameters must be positive integers.", {
        details: { event: eventIdParam, tier: tierParam },
      });
    }
    const eventId = Number(eventIdParam);
    const tier = Number(tierParam);
    if (!Number.isSafeInteger(eventId) || !Number.isSafeInteger(tier)) {
      return errorResponse(400, "INVALID_REQUEST", "Numeric parameters are outside the supported range.", {
        details: { event: eventIdParam, tier: tierParam },
      });
    }
    if (!isSupportedTrackerTier(typeParam, tier)) {
      return errorResponse(404, "TRACKER_TIER_NOT_SUPPORTED", "The requested tracker tier is not supported.", {
        details: { event: eventId, tier, type: typeParam },
      });
    }

    const query: BandoriCutoffHistoryQuery = {
      server: getBandoriServerCode(normalizedServer),
      targetId: eventId,
      tier,
      type: typeParam,
    };
    const cutoffs = await readTrackerHistory(query);
    return NextResponse.json({ result: true, cutoffs }, {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  } catch (error) {
    if (error instanceof BandoriCutoffHistoryReadError) {
      return errorResponse(503, "TRACKER_HISTORY_UNAVAILABLE", "Tracker history is temporarily unavailable.");
    }
    console.error("Bandori tracker API failed", error);
    return errorResponse(500, "INTERNAL_SERVER_ERROR", "Internal server error.");
  }
}
