import {
  BANDORI_MASTER_DATA_API_CACHE_CONTROL,
  LIVE_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  readBandoriMasterDataset,
  redirectBandoriMasterSearch,
} from "@/lib/bandori-master-api";
import {
  BESTDORI_MASTER_DATASET_ALIASES,
  BESTDORI_MASTER_DATASETS,
  type BestdoriMasterDatasetKey,
} from "@/lib/bestdori-master-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export async function GET(request: Request, context: RouteContext) {
  const redirect = redirectBandoriMasterSearch(request);
  if (redirect) {
    return redirect;
  }

  const { dataset: rawDataset } = await context.params;
  const dataset = normalizeDatasetKey(rawDataset);

  if (!dataset) {
    return jsonError(404, "BANDORI_MASTER_DATASET_NOT_FOUND", "Unknown Bandori master dataset", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  try {
    const result = await readBandoriMasterDataset(dataset);
    if (!result) {
      return jsonError(503, "BANDORI_MASTER_ARTIFACT_NOT_CONFIGURED", "Bandori master artifacts are not configured", {
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
      });
    }

    return jsonSuccess(result, {
      headers: withCacheControl(BANDORI_MASTER_DATA_API_CACHE_CONTROL),
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
