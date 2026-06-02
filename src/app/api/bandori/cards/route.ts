import { LIVE_API_CACHE_CONTROL, PUBLIC_METADATA_API_CACHE_CONTROL, withCacheControl } from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { pickBestdoriCnThenJpRegionalName } from "@/lib/bestdori-regional-names";
import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";

const BESTDORI_CARDS_URL = "https://bestdori.com/api/cards/all.5.json";

type BestdoriCardMetadata = {
  characterId?: number;
  rarity?: number;
  attribute?: string;
  levelLimit?: number;
  resourceSetName?: string;
  prefix?: Array<string | null>;
  releasedAt?: Array<string | null>;
  type?: string;
  stat?: {
    training?: {
      levelLimit?: number;
    };
  } & Record<string, unknown>;
};

type BestdoriCardMetadataResponse = BestdoriCardMetadata & {
  displayName: string | null;
  assetRegion: BandoriAssetRegion;
  hasTrainedArt: boolean;
};

function hasCnRelease(values: BestdoriCardMetadata["releasedAt"]): boolean {
  if (!Array.isArray(values)) {
    return false;
  }

  const parsed = Number(values[3]);
  return Number.isFinite(parsed) && parsed > 0;
}

function parseRequestedCardIds(request: Request): number[] {
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
        .filter((cardId) => Number.isFinite(cardId) && cardId > 0),
    ),
  );
}

function hasTrainedCardArt(card: BestdoriCardMetadata | null | undefined): boolean {
  return typeof card?.stat?.training === "object" && card.stat.training !== null;
}

export async function GET(request: Request) {
  const cardIds = parseRequestedCardIds(request);

  if (cardIds.length === 0) {
    return jsonError(400, "CARD_IDS_REQUIRED", "Query parameter ids is required", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  try {
    const response = await fetch(BESTDORI_CARDS_URL, {
      headers: { "User-Agent": "hhwx-tracker/1.0" },
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      return jsonError(response.status, "BESTDORI_CARDS_UPSTREAM_FAILED", "Bestdori API error", {
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
        details: `HTTP ${response.status}`,
      });
    }

    const payload = await response.json() as Record<string, BestdoriCardMetadata>;
    const cards: Record<string, BestdoriCardMetadataResponse> = {};

    for (const cardId of cardIds) {
      const card = payload[String(cardId)];
      if (card) {
        const displayName = pickBestdoriCnThenJpRegionalName(card.prefix);
        cards[String(cardId)] = {
          ...card,
          displayName: displayName?.name ?? null,
          assetRegion: displayName?.assetRegion ?? (hasCnRelease(card.releasedAt) ? "cn" : "jp"),
          hasTrainedArt: hasTrainedCardArt(card),
        };
      }
    }

    return jsonSuccess({ cards }, {
      headers: withCacheControl(PUBLIC_METADATA_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori cards API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_CARDS_READ_FAILED",
      message: "Failed to fetch card metadata",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
