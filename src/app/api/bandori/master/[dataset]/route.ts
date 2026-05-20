import { unstable_cache } from "next/cache";
import {
  LIVE_API_CACHE_CONTROL,
  PUBLIC_METADATA_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  BESTDORI_MASTER_DATASET_ALIASES,
  BESTDORI_MASTER_DATASETS,
  fetchBestdoriMasterDataset,
  filterBestdoriSongsForJpOrCn,
  type BestdoriMasterDatasetKey,
} from "@/lib/bestdori-master-data";

export const dynamic = "force-dynamic";

const readBestdoriMasterDataset = unstable_cache(
  async (dataset: BestdoriMasterDatasetKey) => ({
    dataset,
    payload: dataset === "songs"
      ? filterBestdoriSongsForJpOrCn(await fetchBestdoriMasterDataset(dataset))
      : await fetchBestdoriMasterDataset(dataset),
  }),
  ["bandori-master-dataset-route:v2"],
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

export async function GET(_request: Request, context: RouteContext) {
  const { dataset: rawDataset } = await context.params;
  const dataset = normalizeDatasetKey(rawDataset);

  if (!dataset) {
    return jsonError(404, "BANDORI_MASTER_DATASET_NOT_FOUND", "Unknown Bandori master dataset", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  try {
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
