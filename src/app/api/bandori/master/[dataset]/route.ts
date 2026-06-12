import { unstable_cache } from "next/cache";
import {
  LIVE_API_CACHE_CONTROL,
  PUBLIC_METADATA_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  fetchBandoriMasterArtifactDataset,
  getDefaultBandoriMasterArtifactServer,
  type BandoriMasterArtifactServer,
} from "@/lib/bandori-master-artifacts";
import {
  BESTDORI_MASTER_DATASET_ALIASES,
  BESTDORI_MASTER_DATASETS,
  fetchBestdoriMasterDataset,
  filterBestdoriSongsForJpOrCn,
  type BestdoriMasterDatasetKey,
} from "@/lib/bestdori-master-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const readBestdoriMasterDataset = unstable_cache(
  async (dataset: BestdoriMasterDatasetKey) => ({
    dataset,
    source: "bestdori" as const,
    payload: dataset === "songs"
      ? filterBestdoriSongsForJpOrCn(await fetchBestdoriMasterDataset(dataset))
      : await fetchBestdoriMasterDataset(dataset),
  }),
  ["bandori-master-dataset-route:v2"],
  { revalidate: 86400 },
);

const readArtifactMasterDataset = unstable_cache(
  async (dataset: BestdoriMasterDatasetKey, server: BandoriMasterArtifactServer) => {
    const artifact = await fetchBandoriMasterArtifactDataset(dataset, server);
    if (!artifact) {
      return null;
    }

    return {
      dataset,
      source: artifact.source,
      server: artifact.server,
      masterVersion: artifact.manifest.masterVersion,
      artifactVersion: artifact.manifest.version,
      artifactDataset: artifact.artifactDataset,
      payload: artifact.payload,
    };
  },
  ["bandori-master-artifact-dataset-route:v3"],
  { revalidate: 86400 },
);

type RouteContext = {
  params: Promise<{
    dataset: string;
  }>;
};

function isBestdoriMasterDatasetKey(value: string): value is BestdoriMasterDatasetKey {
  return value in BESTDORI_MASTER_DATASETS;
}

function normalizeDatasetKey(value: string): BestdoriMasterDatasetKey | null {
  if (isBestdoriMasterDatasetKey(value)) {
    return value;
  }

  return BESTDORI_MASTER_DATASET_ALIASES[value as keyof typeof BESTDORI_MASTER_DATASET_ALIASES] ?? null;
}

function shouldUseArtifacts(): boolean {
  return process.env.BANDORI_MASTER_SOURCE === "artifacts";
}

export async function GET(request: Request, context: RouteContext) {
  const requestUrl = new URL(request.url);
  if (requestUrl.search) {
    requestUrl.search = "";
    return Response.redirect(requestUrl, 308);
  }

  const { dataset: rawDataset } = await context.params;
  const dataset = normalizeDatasetKey(rawDataset);

  if (!dataset) {
    return jsonError(404, "BANDORI_MASTER_DATASET_NOT_FOUND", "Unknown Bandori master dataset", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  try {
    if (shouldUseArtifacts()) {
      const server = getDefaultBandoriMasterArtifactServer();
      const artifactResult = await readArtifactMasterDataset(dataset, server);
      if (artifactResult) {
        return jsonSuccess(artifactResult, {
          headers: withCacheControl(PUBLIC_METADATA_API_CACHE_CONTROL),
        });
      }

      return jsonError(503, "BANDORI_MASTER_ARTIFACT_NOT_CONFIGURED", "Bandori master artifacts are not configured", {
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
      });
    }

    return jsonSuccess(await readBestdoriMasterDataset(dataset), {
      headers: withCacheControl(PUBLIC_METADATA_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori master data API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_MASTER_DATA_READ_FAILED",
      message: "Failed to fetch Bandori master data",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
