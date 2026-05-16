import { LIVE_API_CACHE_CONTROL, PUBLIC_METADATA_API_CACHE_CONTROL, withCacheControl } from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";

const BESTDORI_SONGS_URL = "https://bestdori.com/api/songs/all.7.json";
const TITLE_PREFERENCE_ORDER = [3, 2, 1, 0, 4] as const;

type BestdoriSongMetadata = {
  musicTitle?: Array<string | null>;
};

// 当前 songs 仍直接请求 Bestdori，是因为我们本地只同步了活动目录三表，
// 还没有把歌曲名称目录纳入数据库。这里先把外部依赖收敛到单一路由，
// 未来若补 songs 同步任务，只需要替换这一层实现即可。

function parseRequestedSongIds(request: Request): number[] {
  const { searchParams } = new URL(request.url);
  const rawIds = searchParams.get("ids");

  if (!rawIds) {
    return [];
  }

  return Array.from(
    new Set(
      rawIds
        .split(",")
        .map((rawId) => Number.parseInt(rawId.trim(), 10))
        .filter((songId) => Number.isFinite(songId) && songId > 0),
    ),
  );
}

function pickBestSongTitle(titles: Array<string | null> | undefined): string | null {
  if (!Array.isArray(titles)) {
    return null;
  }

  for (const index of TITLE_PREFERENCE_ORDER) {
    const title = titles[index]?.trim();
    if (title) {
      return title;
    }
  }

  for (const candidate of titles) {
    const title = candidate?.trim();
    if (title) {
      return title;
    }
  }

  return null;
}

export async function GET(request: Request) {
  const songIds = parseRequestedSongIds(request);

  if (songIds.length === 0) {
    return jsonError(400, "SONG_IDS_REQUIRED", "Query parameter ids is required", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  try {
    const response = await fetch(BESTDORI_SONGS_URL, {
      headers: { "User-Agent": "hhwx-tracker/1.0" },
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      return jsonError(response.status, "BESTDORI_SONGS_UPSTREAM_FAILED", "Bestdori API error", {
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
        details: `HTTP ${response.status}`,
      });
    }

    const payload = await response.json() as Record<string, BestdoriSongMetadata>;
    const songs: Record<string, string> = {};

    for (const songId of songIds) {
      const title = pickBestSongTitle(payload[String(songId)]?.musicTitle);
      if (title) {
        songs[String(songId)] = title;
      }
    }

    return jsonSuccess({ songs }, {
      headers: withCacheControl(PUBLIC_METADATA_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori songs API 错误:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_SONGS_READ_FAILED",
      message: "Failed to fetch song metadata",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
