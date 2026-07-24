import { NextResponse } from "next/server";
import { NO_STORE_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";
import {
  BANDORI_CUTOFF_HISTORY_MAX_ROWS,
  type BandoriCutoffHistoryCutoffs,
  type BandoriCutoffHistoryPoint,
  type BandoriCutoffHistoryQuery,
  type BandoriCutoffHistorySongMap,
  type BandoriCutoffHistoryType,
} from "@/lib/bandori-cutoff-history-contract";
import {
  BandoriCutoffHistoryReadError,
  getBandoriTrackerHistorySource,
  readBandoriCutoffHistoryFromR2,
} from "@/lib/bandori-cutoff-history-server";
import { jsonError } from "@/lib/api-response";
import { isSupportedTrackerTier } from "@/lib/bandori-tracker-tiers";
import { supabase } from "@/lib/supabase";
import { BANDORI_TRACKER_DATA_TABLE } from "@/lib/supabase-table-names";

const VALID_TRACKER_TYPES = new Set<BandoriCutoffHistoryType>(["event", "song", "monthly"]);
const TRACKER_PAGE_SIZE = 1_000;
const FALLBACK_LOG_INTERVAL_MS = 60_000;
const MAX_FALLBACK_LOG_KEYS = 256;
const MAX_R2_SUCCESS_LOG_KEYS = 256;

type TrackerRow = {
  time: number | string;
  ep: number | string;
  song_id?: number | string | null;
  is_final?: boolean | null;
};

class TrackerDatabaseError extends Error {
  constructor(
    public readonly query: BandoriCutoffHistoryQuery,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TrackerDatabaseError";
  }
}

const fallbackLogTimes = new Map<string, number>();
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

function toTrackerPoint(row: TrackerRow): BandoriCutoffHistoryPoint {
  const point: BandoriCutoffHistoryPoint = {
    time: Number(row.time),
    ep: Number(row.ep),
  };
  if (Boolean(row.is_final)) point.isFinal = true;
  return point;
}

function buildSongCutoffs(rows: TrackerRow[]): BandoriCutoffHistoryPoint[] | BandoriCutoffHistorySongMap {
  const groups = new Map<number, BandoriCutoffHistoryPoint[]>();
  for (const row of rows) {
    const songId = Number(row.song_id ?? 0);
    const cutoffs = groups.get(songId) ?? [];
    cutoffs.push(toTrackerPoint(row));
    groups.set(songId, cutoffs);
  }
  if (groups.size === 1 && groups.has(0)) return groups.get(0) ?? [];
  return Object.fromEntries(
    Array.from(groups.entries())
      .sort(([left], [right]) => left - right)
      .map(([songId, cutoffs]) => [String(songId), cutoffs]),
  );
}

async function readTrackerHistoryFromSupabase(
  query: BandoriCutoffHistoryQuery,
): Promise<BandoriCutoffHistoryCutoffs> {
  const rows: TrackerRow[] = [];
  for (let offset = 0; offset < BANDORI_CUTOFF_HISTORY_MAX_ROWS; offset += TRACKER_PAGE_SIZE) {
    const pageEnd = Math.min(
      offset + TRACKER_PAGE_SIZE,
      BANDORI_CUTOFF_HISTORY_MAX_ROWS,
    ) - 1;
    let pageRows: TrackerRow[];
    let queryError: unknown;
    if (query.type === "song") {
      const { data, error } = await supabase
        .from(BANDORI_TRACKER_DATA_TABLE)
        .select("time, ep, song_id, is_final")
        .eq("event_id", query.targetId)
        .eq("type", query.type)
        .eq("tier", query.tier)
        .order("song_id", { ascending: true })
        .order("time", { ascending: true })
        .range(offset, pageEnd);
      pageRows = (data ?? []) as TrackerRow[];
      queryError = error;
    } else {
      const { data, error } = await supabase
        .from(BANDORI_TRACKER_DATA_TABLE)
        .select("time, ep, is_final")
        .eq("event_id", query.targetId)
        .eq("type", query.type)
        .eq("tier", query.tier)
        .eq("song_id", 0)
        .order("time", { ascending: true })
        .range(offset, pageEnd);
      pageRows = (data ?? []) as TrackerRow[];
      queryError = error;
    }
    if (queryError) {
      console.error("Bandori tracker Supabase query failed", {
        error: queryError,
        event: query.targetId,
        tier: query.tier,
        type: query.type,
      });
      throw new TrackerDatabaseError(query, "Failed to query tracker data", { cause: queryError });
    }
    rows.push(...pageRows);
    if (pageRows.length < TRACKER_PAGE_SIZE) break;
  }
  if (query.type === "song") return rows.length === 0 ? [] : buildSongCutoffs(rows);
  return rows.map(toTrackerPoint);
}

function logR2Fallback(
  query: BandoriCutoffHistoryQuery,
  error: unknown,
  mode: "fallback" | "stale" | "unavailable",
): void {
  const reason = error instanceof BandoriCutoffHistoryReadError ? error.reason : "unexpected";
  const key = `${query.targetId}:${query.type}:${query.tier}:${mode}:${reason}`;
  const now = Date.now();
  if ((fallbackLogTimes.get(key) ?? 0) + FALLBACK_LOG_INTERVAL_MS > now) return;
  fallbackLogTimes.delete(key);
  fallbackLogTimes.set(key, now);
  while (fallbackLogTimes.size > MAX_FALLBACK_LOG_KEYS) {
    const oldestKey = fallbackLogTimes.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    fallbackLogTimes.delete(oldestKey);
  }
  console.warn("Bandori tracker history R2 degraded", {
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
  const key = `${query.targetId}:${query.type}:${result.generation ?? "missing"}`;
  if (r2SuccessLogKeys.has(key)) return;
  r2SuccessLogKeys.set(key, true);
  while (r2SuccessLogKeys.size > MAX_R2_SUCCESS_LOG_KEYS) {
    const oldestKey = r2SuccessLogKeys.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    r2SuccessLogKeys.delete(oldestKey);
  }
  console.info("Bandori tracker history R2 read succeeded", {
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
  const source = getBandoriTrackerHistorySource();
  if (source === "supabase") return readTrackerHistoryFromSupabase(query);

  try {
    const startedAt = Date.now();
    const result = await readBandoriCutoffHistoryFromR2(query, {
      allowStale: source === "r2",
    });
    if (result.isStale) {
      logR2Fallback(query, null, "stale");
    } else {
      logR2Success(query, result, Date.now() - startedAt);
    }
    return result.cutoffs;
  } catch (error) {
    if (source === "r2-with-supabase-fallback") {
      logR2Fallback(query, error, "fallback");
      return readTrackerHistoryFromSupabase(query);
    }
    logR2Fallback(query, error, "unavailable");
    throw error;
  }
}

/**
 * Keeps the historical result/cutoffs success shape while moving storage reads
 * behind a server-side source policy. Empty supported datasets remain a normal
 * 200 response; only operational R2 failures may use the Supabase fallback.
 */
export async function handleBandoriTrackerDataRequest(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const server = searchParams.get("server");
    const eventIdParam = searchParams.get("event");
    const tierParam = searchParams.get("tier");
    const typeParam = searchParams.get("type") || "event";

    if (server !== "3") {
      return errorResponse(400, "INVALID_REQUEST", "Only server 3 (CN) is currently supported.", {
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

    const eventId = Number.parseInt(eventIdParam, 10);
    const tier = Number.parseInt(tierParam, 10);
    if (!Number.isFinite(eventId) || !Number.isFinite(tier) || eventId <= 0 || tier <= 0) {
      return errorResponse(400, "INVALID_REQUEST", "Numeric parameters must be positive integers.", {
        details: { event: eventIdParam, tier: tierParam },
      });
    }
    if (!isSupportedTrackerTier(typeParam, tier)) {
      return errorResponse(404, "TRACKER_TIER_NOT_SUPPORTED", "The requested tracker tier is not supported.", {
        details: { event: eventId, tier, type: typeParam },
      });
    }

    const query: BandoriCutoffHistoryQuery = {
      server: "cn",
      targetId: eventId,
      tier,
      type: typeParam,
    };
    const cutoffs = await readTrackerHistory(query);
    return NextResponse.json({ result: true, cutoffs }, {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  } catch (error) {
    if (error instanceof TrackerDatabaseError) {
      return errorResponse(500, "DATABASE_QUERY_FAILED", "Failed to query tracker data.", {
        details: {
          event: error.query.targetId,
          tier: error.query.tier,
          type: error.query.type,
        },
      });
    }
    if (error instanceof BandoriCutoffHistoryReadError) {
      return errorResponse(503, "TRACKER_HISTORY_UNAVAILABLE", "Tracker history is temporarily unavailable.");
    }
    console.error("Bandori tracker API failed", error);
    return errorResponse(500, "INTERNAL_SERVER_ERROR", "Internal server error.");
  }
}
