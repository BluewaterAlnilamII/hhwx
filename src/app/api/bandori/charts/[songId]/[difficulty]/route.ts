import { unstable_cache } from "next/cache";
import {
  LIVE_API_CACHE_CONTROL,
  PUBLIC_METADATA_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  fetchBestdoriChart,
  isBestdoriChartDifficulty,
  type BestdoriChartDifficulty,
} from "@/lib/bestdori-master-data";

export const dynamic = "force-dynamic";

const readBestdoriChart = unstable_cache(
  async (songId: number, difficulty: BestdoriChartDifficulty) => ({
    songId,
    difficulty,
    chart: await fetchBestdoriChart(songId, difficulty),
  }),
  ["bandori-chart-route:v1"],
  { revalidate: 86400 },
);

type RouteContext = {
  params: Promise<{
    songId: string;
    difficulty: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { songId: rawSongId, difficulty } = await context.params;
  const songId = Number.parseInt(rawSongId, 10);

  if (!Number.isFinite(songId) || songId <= 0) {
    return jsonError(400, "INVALID_SONG_ID", "Invalid song id", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  if (!isBestdoriChartDifficulty(difficulty)) {
    return jsonError(400, "INVALID_CHART_DIFFICULTY", "Invalid chart difficulty", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  try {
    return jsonSuccess(await readBestdoriChart(songId, difficulty), {
      headers: withCacheControl(PUBLIC_METADATA_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori chart API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_CHART_READ_FAILED",
      message: "Failed to fetch Bandori chart",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
