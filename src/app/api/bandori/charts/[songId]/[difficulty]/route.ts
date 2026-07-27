import { unstable_cache } from "next/cache";
import {
  NO_STORE_HTTP_CACHE_POLICY,
  REFERENCE_HTTP_CACHE_POLICY,
  withHttpCachePolicy,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  fetchBestdoriChart,
  isBestdoriChartDifficulty,
  type BestdoriChartDifficulty,
} from "@/lib/bestdori-master-data";
import {
  BANDORI_MUSIC_METADATA_REVALIDATE_SECONDS,
  readBandoriMusicIndex,
} from "@/lib/bandori-music-assets";
import {
  lookupBandoriMusicChart,
  type BandoriJsonAssetDescriptor,
} from "@/lib/bandori-public-asset-index";
import { fetchBandoriPublicAssetJson } from "@/lib/bandori-public-asset-index-server";

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

class BandoriChartAssetError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function getBandoriChartSource(): "assets" | "bestdori" {
  return process.env.BANDORI_CHART_SOURCE === "assets" ? "assets" : "bestdori";
}

function allowBestdoriChartFallback(): boolean {
  return process.env.BANDORI_CHART_BESTDORI_FALLBACK === "1";
}

async function fetchBandoriAssetChart(
  chart: Pick<BandoriJsonAssetDescriptor, "key" | "sha256">,
): Promise<unknown> {
  try {
    return await fetchBandoriPublicAssetJson(chart.key, chart.sha256);
  } catch (error) {
    throw new BandoriChartAssetError(
      `Bandori chart R2 read failed: ${error instanceof Error ? error.message : String(error)}`,
      502,
    );
  }
}

const readAssetChart = unstable_cache(
  async (
    songId: number,
    difficulty: BestdoriChartDifficulty,
    chartKey: string,
    chartSha256: string,
  ) => ({
    songId,
    difficulty,
    chart: await fetchBandoriAssetChart({ key: chartKey, sha256: chartSha256 }),
  }),
  ["bandori-chart-route-assets:v4"],
  { revalidate: BANDORI_MUSIC_METADATA_REVALIDATE_SECONDS },
);

async function readConfiguredChart(songId: number, difficulty: BestdoriChartDifficulty) {
  if (getBandoriChartSource() !== "assets") {
    return readBestdoriChart(songId, difficulty);
  }

  try {
    const chart = lookupBandoriMusicChart(
      await readBandoriMusicIndex(),
      songId,
      difficulty,
    );
    if (!chart) {
      throw new BandoriChartAssetError(
        `Bandori chart asset is not indexed: ${songId}:${difficulty}`,
        404,
      );
    }
    return await readAssetChart(
      songId,
      difficulty,
      chart.key,
      chart.sha256,
    );
  } catch (error) {
    if (!allowBestdoriChartFallback()) {
      throw error;
    }
    console.warn("Bandori chart asset read failed; falling back to Bestdori:", error);
    return readBestdoriChart(songId, difficulty);
  }
}

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
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  }

  if (!isBestdoriChartDifficulty(difficulty)) {
    return jsonError(400, "INVALID_CHART_DIFFICULTY", "Invalid chart difficulty", {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  }

  try {
    return jsonSuccess(await readConfiguredChart(songId, difficulty), {
      headers: withHttpCachePolicy(REFERENCE_HTTP_CACHE_POLICY),
    });
  } catch (error) {
    console.error("Bandori chart API error:", error);
    if (error instanceof BandoriChartAssetError && error.status === 404) {
      return jsonError(404, "BANDORI_CHART_NOT_FOUND", "Bandori chart is not available", {
        headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
      });
    }

    return jsonRouteError(error, {
      status: error instanceof BandoriChartAssetError ? error.status : 500,
      code: "BANDORI_CHART_READ_FAILED",
      message: "Failed to fetch Bandori chart",
    }, {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  }
}
