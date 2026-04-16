import { NextResponse } from "next/server";
import { LIVE_API_CACHE_CONTROL, withCacheControl } from "@/lib/api-cache";
import { jsonError } from "@/lib/api-response";
import { supabase } from "@/lib/supabase";
import { BANDORI_TRACKER_DATA_TABLE } from "@/lib/supabase-table-names";

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
  code: string,
  message: string,
  options?: {
    details?: Record<string, string | number | boolean | null>;
  },
) {
  return jsonError(status, code, message, {
    headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    details: options?.details,
  });
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
 * 3. 当前成功响应的 result/cutoffs 结构已经被现有 tracker 页面和外部调用方依赖，
 *    因此成功体保持不变；失败体则回到项目统一错误信封，避免继续扩散旧协议。
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
        details: {
          event: eventIdParam,
          tier: tierParam,
        },
      });
    }

    if (!VALID_TRACKER_TYPES.has(typeParam)) {
      return errorResponse(400, "INVALID_REQUEST", "Unsupported tracker type.", {
        details: { type: typeParam },
      });
    }

    const eventId = Number.parseInt(eventIdParam, 10);
    const tier = Number.parseInt(tierParam, 10);

    if (!Number.isFinite(eventId) || !Number.isFinite(tier) || eventId <= 0 || tier <= 0) {
      return errorResponse(400, "INVALID_REQUEST", "Numeric parameters must be positive integers.", {
        details: {
          event: eventIdParam,
          tier: tierParam,
        },
      });
    }

    if (typeParam === "song") {
      // 为什么 song 模式要一次返回全部 song_id 分组：
      // challenge 活动切歌只是在前端本地切换视图，如果服务端按单曲逐次查询，
      // 会让相同档位的数据被重复请求多次，既增加带宽也更容易打乱缓存一致性。
      const { data, error } = await supabase
        .from(BANDORI_TRACKER_DATA_TABLE)
        .select("time, ep, song_id, is_final")
        .eq("event_id", eventId)
        .eq("type", "song")
        .eq("tier", tier)
        .order("song_id", { ascending: true })
        .order("time", { ascending: true });

      if (error) {
        console.error("Supabase query error:", error);
        return errorResponse(500, "DATABASE_QUERY_FAILED", "Failed to query tracker data.", {
          details: {
            event: eventId,
            tier,
            type: typeParam,
          },
        });
      }

      if ((data ?? []).length === 0) {
        return errorResponse(404, "TRACKER_DATA_NOT_FOUND", "No song ranking data found for the requested query.", {
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
      }, {
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
      });
    }

    const { data, error } = await supabase
      .from(BANDORI_TRACKER_DATA_TABLE)
      .select("time, ep, is_final")
      .eq("event_id", eventId)
      .eq("type", typeParam)
      .eq("tier", tier)
      .eq("song_id", 0)
      .order("time", { ascending: true });

    if (error) {
      console.error("Supabase query error:", error);
      return errorResponse(500, "DATABASE_QUERY_FAILED", "Failed to query tracker data.", {
        details: {
          event: eventId,
          tier,
          type: typeParam,
        },
      });
    }

    const formattedData = formatCutoffs((data ?? []) as TrackerRow[]);

    if (formattedData.length === 0) {
      return errorResponse(404, "TRACKER_DATA_NOT_FOUND", "No tracker data found for the requested query.", {
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
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Tracker API error:", error);
    return errorResponse(500, "INTERNAL_SERVER_ERROR", "Internal server error.");
  }
}