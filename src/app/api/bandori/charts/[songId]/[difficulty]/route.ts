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

function normalizeCdnBaseUrl(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue.replace(/\/+$/u, "") : null;
}

function getBandoriMusicCdnBaseUrl(): string | null {
  return normalizeCdnBaseUrl(
    process.env.BANDORI_MUSIC_CDN_BASE_URL
      ?? process.env.BANDORI_ASSET_CDN_BASE_URL
      ?? process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL,
  );
}

function buildBandoriMusicChartUrl(songId: number, difficulty: BestdoriChartDifficulty): string {
  const baseUrl = getBandoriMusicCdnBaseUrl();
  if (!baseUrl) {
    throw new BandoriChartAssetError("Bandori music CDN base URL is not configured", 503);
  }

  return `${baseUrl}/bandori/music/${songId}/charts/${encodeURIComponent(difficulty)}.json`;
}

async function fetchBandoriAssetChart(songId: number, difficulty: BestdoriChartDifficulty): Promise<unknown> {
  const url = buildBandoriMusicChartUrl(songId, difficulty);
  const response = await fetch(url, {
    next: { revalidate: 86400 },
  });

  if (response.status === 404) {
    throw new BandoriChartAssetError(`Bandori chart asset not found: ${url}`, 404);
  }
  if (!response.ok) {
    throw new BandoriChartAssetError(`Bandori chart asset failed: HTTP ${response.status} ${url}`, 502);
  }

  return response.json();
}

const readAssetChart = unstable_cache(
  async (songId: number, difficulty: BestdoriChartDifficulty) => ({
    songId,
    difficulty,
    chart: await fetchBandoriAssetChart(songId, difficulty),
  }),
  ["bandori-chart-route-assets:v1"],
  { revalidate: 86400 },
);

async function readConfiguredChart(songId: number, difficulty: BestdoriChartDifficulty) {
  if (getBandoriChartSource() !== "assets") {
    return readBestdoriChart(songId, difficulty);
  }

  try {
    return await readAssetChart(songId, difficulty);
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
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  if (!isBestdoriChartDifficulty(difficulty)) {
    return jsonError(400, "INVALID_CHART_DIFFICULTY", "Invalid chart difficulty", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  try {
    return jsonSuccess(await readConfiguredChart(songId, difficulty), {
      headers: withCacheControl(PUBLIC_METADATA_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori chart API error:", error);
    if (error instanceof BandoriChartAssetError && error.status === 404) {
      return jsonError(404, "BANDORI_CHART_NOT_FOUND", "Bandori chart is not available", {
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
      });
    }

    return jsonRouteError(error, {
      status: error instanceof BandoriChartAssetError ? error.status : 500,
      code: "BANDORI_CHART_READ_FAILED",
      message: "Failed to fetch Bandori chart",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
