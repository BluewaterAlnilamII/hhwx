import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const VALID_TRACKER_TYPES = new Set(["event", "song", "monthly"]);

type TrackerRow = {
  time: number | string;
  ep: number | string;
  song_id?: number | string | null;
  is_final?: boolean | null;
};

type TrackerPoint = {
  time: number;
  ep: number;
  isFinal?: true;
};

type TrackerSongCutoffMap = Record<string, TrackerPoint[]>;

function errorResponse(
  status: number,
  message: string,
  options?: {
    code?: string;
    cutoffs?: TrackerPoint[] | TrackerSongCutoffMap;
    details?: Record<string, string | number | boolean | null>;
  },
) {
  return NextResponse.json(
    {
      result: false,
      cutoffs: options?.cutoffs ?? [],
      error: {
        code: options?.code ?? "INTERNAL_SERVER_ERROR",
        message,
        details: options?.details,
      },
    },
    { status },
  );
}

function toTrackerPoint(row: TrackerRow): TrackerPoint {
  const point: TrackerPoint = {
    time: Number(row.time),
    ep: Number(row.ep),
  };

  if (Boolean(row.is_final)) {
    point.isFinal = true;
  }

  return point;
}

function formatCutoffs(rows: TrackerRow[]) {
  return rows.map((item) => toTrackerPoint(item));
}

function buildSongCutoffs(rows: TrackerRow[]): TrackerPoint[] | TrackerSongCutoffMap {
  const groups = new Map<number, TrackerPoint[]>();

  for (const row of rows) {
    const songId = Number(row.song_id ?? 0);
    const cutoff = toTrackerPoint(row);

    if (!groups.has(songId)) {
      groups.set(songId, []);
    }

    groups.get(songId)?.push(cutoff);
  }

  if (groups.size === 1 && groups.has(0)) {
    return groups.get(0) ?? [];
  }

  return Object.fromEntries(
    Array.from(groups.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([songId, cutoffs]) => [String(songId), cutoffs]),
  );
}

/**
 * 统一的 tracker data 服务端处理器。
 *
 * 为什么要抽到共享模块：
 * 1. 新旧路径需要在兼容期内返回完全一致的结构，避免行为漂移。
 * 2. 未来下线旧路径时，只需要删除别名路由，不需要再次搬运查询逻辑。
 */
export async function handleBandoriTrackerDataRequest(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const server = searchParams.get("server");
    const eventIdParam = searchParams.get("event");
    const tierParam = searchParams.get("tier");
    const typeParam = searchParams.get("type") || "event";

    if (server !== "3") {
      return errorResponse(400, "Only server 3 (CN) is currently supported.", {
        code: "INVALID_REQUEST",
        details: { server },
      });
    }

    if (!eventIdParam || !tierParam) {
      return errorResponse(400, "Missing required parameters: event, tier.", {
        code: "INVALID_REQUEST",
        details: {
          event: eventIdParam,
          tier: tierParam,
        },
      });
    }

    if (!VALID_TRACKER_TYPES.has(typeParam)) {
      return errorResponse(400, "Unsupported tracker type.", {
        code: "INVALID_REQUEST",
        details: { type: typeParam },
      });
    }

    const eventId = Number.parseInt(eventIdParam, 10);
    const tier = Number.parseInt(tierParam, 10);

    if (!Number.isFinite(eventId) || !Number.isFinite(tier) || eventId <= 0 || tier <= 0) {
      return errorResponse(400, "Numeric parameters must be positive integers.", {
        code: "INVALID_REQUEST",
        details: {
          event: eventIdParam,
          tier: tierParam,
        },
      });
    }

    if (typeParam === "song") {
      const { data, error } = await supabase
        .from("bandori_tracker_data")
        .select("time, ep, song_id, is_final")
        .eq("event_id", eventId)
        .eq("type", "song")
        .eq("tier", tier)
        .order("song_id", { ascending: true })
        .order("time", { ascending: true });

      if (error) {
        console.error("Supabase query error:", error);
        return errorResponse(500, "Failed to query tracker data.", {
          code: "DATABASE_QUERY_FAILED",
          details: {
            event: eventId,
            tier,
            type: typeParam,
          },
        });
      }

      if ((data ?? []).length === 0) {
        return errorResponse(200, "No song ranking data found for the requested query.", {
          code: "TRACKER_DATA_NOT_FOUND",
          cutoffs: [],
          details: {
            event: eventId,
            tier,
            type: typeParam,
          },
        });
      }

      return NextResponse.json({
        result: true,
        cutoffs: buildSongCutoffs((data ?? []) as TrackerRow[]),
      });
    }

    const { data, error } = await supabase
      .from("bandori_tracker_data")
      .select("time, ep, is_final")
      .eq("event_id", eventId)
      .eq("type", typeParam)
      .eq("tier", tier)
      .eq("song_id", 0)
      .order("time", { ascending: true });

    if (error) {
      console.error("Supabase query error:", error);
      return errorResponse(500, "Failed to query tracker data.", {
        code: "DATABASE_QUERY_FAILED",
        details: {
          event: eventId,
          tier,
          type: typeParam,
        },
      });
    }

    const formattedData = formatCutoffs((data ?? []) as TrackerRow[]);

    if (formattedData.length === 0) {
      return errorResponse(200, "No tracker data found for the requested query.", {
        code: "TRACKER_DATA_NOT_FOUND",
        cutoffs: [],
        details: {
          event: eventId,
          tier,
          type: typeParam,
        },
      });
    }

    return NextResponse.json({
      result: true,
      cutoffs: formattedData,
    });
  } catch (error) {
    console.error("Tracker API error:", error);
    return errorResponse(500, "Internal server error.", {
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}