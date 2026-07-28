import {
  FAST_MUTABLE_HTTP_CACHE_POLICY,
  NO_STORE_HTTP_CACHE_POLICY,
  SNAPSHOT_HTTP_CACHE_POLICY,
  withHttpCachePolicy,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  readBandoriMasterDataset,
  rejectUnsupportedBandoriMasterQuery,
} from "@/lib/bandori-master-api";
import {
  readBandoriCardsApiDataset,
  readBandoriCardsApiDatasetForServer,
} from "@/lib/bandori-cards-api-server";
import { parseBandoriCardServerQuery } from "@/lib/bandori-card-server-extensions";
import { readBandoriPublicEventApiDataset } from "@/lib/bandori-events-api-server";
import { readBandoriStampsApiDataset } from "@/lib/bandori-stamps-api-server";
import { readBandoriMusicApiDataset } from "@/lib/bandori-music-api-server";
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
  return Object.hasOwn(BESTDORI_MASTER_DATASETS, value);
}

type LegacyMasterDatasetKey = Exclude<BestdoriMasterDatasetKey, "cards" | "events" | "songs">;
type MasterDatasetKey = LegacyMasterDatasetKey | "cards" | "events" | "music" | "stamps";

function isLegacyMasterDatasetKey(value: string): value is LegacyMasterDatasetKey {
  return value !== "cards"
    && value !== "events"
    && value !== "songs"
    && isBestdoriMasterDatasetKey(value);
}

function normalizeDatasetKey(value: string): MasterDatasetKey | null {
  if (value === "cards" || value === "events" || value === "music" || value === "stamps") {
    return value;
  }
  if (isLegacyMasterDatasetKey(value)) {
    return value;
  }

  const alias = BESTDORI_MASTER_DATASET_ALIASES[
    value as keyof typeof BESTDORI_MASTER_DATASET_ALIASES
  ];
  return alias && isLegacyMasterDatasetKey(alias) ? alias : null;
}

export async function GET(request: Request, context: RouteContext) {
  const { dataset: rawDataset } = await context.params;
  const dataset = normalizeDatasetKey(rawDataset);

  if (!dataset) {
    return jsonError(404, "BANDORI_MASTER_DATASET_NOT_FOUND", "Unknown Bandori master dataset", {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  }

  const serverQuery = dataset === "cards"
    ? parseBandoriCardServerQuery(request)
    : { status: "unsupported" as const };
  if (serverQuery.status === "invalid") {
    return jsonError(
      400,
      "BANDORI_MASTER_CARD_SERVER_INVALID",
      "server must be exactly one of 0, 1, 2, or 3",
      { headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY) },
    );
  }
  if (serverQuery.status === "unsupported") {
    const rejection = rejectUnsupportedBandoriMasterQuery(request);
    if (rejection) {
      return rejection;
    }
  }

  try {
    if (dataset === "events") {
      return jsonSuccess(await readBandoriPublicEventApiDataset("events"), {
        headers: withHttpCachePolicy(FAST_MUTABLE_HTTP_CACHE_POLICY),
      });
    }

    if (dataset === "cards") {
      const cards = serverQuery.status === "valid"
        ? await readBandoriCardsApiDatasetForServer(serverQuery.server)
        : await readBandoriCardsApiDataset();
      return jsonSuccess(cards, {
        headers: withHttpCachePolicy(SNAPSHOT_HTTP_CACHE_POLICY),
      });
    }

    if (dataset === "stamps") {
      return jsonSuccess(await readBandoriStampsApiDataset(), {
        headers: withHttpCachePolicy(SNAPSHOT_HTTP_CACHE_POLICY),
      });
    }

    if (dataset === "music") {
      return jsonSuccess(await readBandoriMusicApiDataset(), {
        headers: withHttpCachePolicy(SNAPSHOT_HTTP_CACHE_POLICY),
      });
    }

    const result = await readBandoriMasterDataset(dataset);
    if (!result) {
      return jsonError(503, "BANDORI_MASTER_ARTIFACT_NOT_CONFIGURED", "Bandori master artifacts are not configured", {
        headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
      });
    }

    return jsonSuccess(result, {
      headers: withHttpCachePolicy(SNAPSHOT_HTTP_CACHE_POLICY),
    });
  } catch (error) {
    console.error("Bandori master data API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_MASTER_DATA_READ_FAILED",
      message: "Failed to fetch Bandori master data",
    }, {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  }
}
