import { parseApiSuccessData } from "@/lib/api-contracts";
import {
  materializeBandoriCardMapForServer,
  materializeBandoriCardMapForServerWithJpFallback,
} from "@/lib/bandori-card-server-extensions";
import type { BandoriServer } from "@/lib/bandori-server";

export type BandoriCardMasterRecord = Record<string, unknown> & {
  attribute?: string;
  characterId?: number;
  levelLimit?: number;
  prefix?: Array<string | null>;
  rarity?: number;
  releasedAt?: Array<string | number | null>;
  resourceSetName?: string;
  skillId?: number;
  stat?: Record<string, unknown>;
};

export type BandoriCardsMasterMap = Record<
  string,
  BandoriCardMasterRecord | null | undefined
>;

const materializedCardsByServer = new WeakMap<
  BandoriCardsMasterMap,
  Map<BandoriServer, BandoriCardsMasterMap>
>();
const materializedCardsWithJpFallbackByServer = new WeakMap<
  BandoriCardsMasterMap,
  Map<BandoriServer, BandoriCardsMasterMap>
>();
const BANDORI_CARD_ID_PATTERN = /^[1-9]\d*$/u;

export function parseBandoriCardsMasterResponse(raw: unknown): BandoriCardsMasterMap {
  const data = parseApiSuccessData<unknown>(raw);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Bandori Cards API returned an invalid dataset");
  }
  for (const [cardId, card] of Object.entries(data)) {
    if (
      !BANDORI_CARD_ID_PATTERN.test(cardId)
      || !Number.isSafeInteger(Number(cardId))
      || !card
      || typeof card !== "object"
      || Array.isArray(card)
    ) {
      throw new Error(`Bandori Cards API returned an invalid card record: ${cardId}`);
    }
  }
  return data as BandoriCardsMasterMap;
}

export function materializeBandoriCardsMasterForServer(
  cards: BandoriCardsMasterMap,
  server: BandoriServer,
): BandoriCardsMasterMap {
  let byServer = materializedCardsByServer.get(cards);
  if (!byServer) {
    byServer = new Map();
    materializedCardsByServer.set(cards, byServer);
  }

  const cached = byServer.get(server);
  if (cached) {
    return cached;
  }

  const materialized = materializeBandoriCardMapForServer(cards, server);
  byServer.set(server, materialized);
  return materialized;
}

export function materializeBandoriCardsMasterForServerWithJpFallback(
  cards: BandoriCardsMasterMap,
  server: BandoriServer,
): BandoriCardsMasterMap {
  let byServer = materializedCardsWithJpFallbackByServer.get(cards);
  if (!byServer) {
    byServer = new Map();
    materializedCardsWithJpFallbackByServer.set(cards, byServer);
  }

  const cached = byServer.get(server);
  if (cached) {
    return cached;
  }

  const materialized = materializeBandoriCardMapForServerWithJpFallback(cards, server);
  byServer.set(server, materialized);
  return materialized;
}
