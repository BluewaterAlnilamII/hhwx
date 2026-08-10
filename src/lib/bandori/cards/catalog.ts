import type {
  BandoriCardMaster,
  BandoriCharacterMaster,
} from "@/lib/bandori/cards/master";
import { hasTrainedCardArt } from "@/lib/bandori/cards/training";
import {
  isKnownBandoriCardEntityCollision,
  materializeBandoriCardForServer,
  validateBandoriCardServerExtensions,
} from "@/lib/bandori/cards/regional-extensions";
import {
  isBandoriCardAttribute,
  normalizeBandoriCardReleaseSortTimestamp,
  type BandoriCardAttribute,
} from "@/lib/bandori/cards/filter";
import {
  BANDORI_SERVERS,
  getBandoriServerCode,
  readBandoriRegionalNumberAt,
  type BandoriServer,
} from "@/lib/bandori-server";

export type BandoriCardCatalogReleaseTimestamps = readonly [
  number,
  number,
  number,
  number,
];

export type BandoriCardCatalogBaseEntry = {
  cardId: number;
  cardRef: string;
  entityServer: BandoriServer | null;
  availableServers: readonly BandoriServer[];
  characterId: number;
  bandId: number | null;
  rarity: number;
  attribute: BandoriCardAttribute | null;
  resourceSetName: string;
  levelLimit: number;
  trainingLevelLimit: number;
  hasTrainedArt: boolean;
  releaseTimestamps: BandoriCardCatalogReleaseTimestamps;
};

export type NormalizedBandoriCardCatalogBase = {
  entry: BandoriCardCatalogBaseEntry;
  card: BandoriCardMaster;
  character: BandoriCharacterMaster | null | undefined;
  skillId: number | null;
  rawType: string | undefined;
};

export type BandoriCardCatalogBaseSource = {
  rawCardId: string;
  cardRef: string;
  entityServer: BandoriServer | null;
  card: BandoriCardMaster;
  availableServers: readonly BandoriServer[];
  releaseTimestamps: BandoriCardCatalogReleaseTimestamps;
};

type ExpandedBandoriCardCatalogEntry<T extends object> = {
  cardId: number;
  cardRef: string;
  server: BandoriServer | null;
  card: T;
};

export function parsePositiveBandoriCardCatalogInteger(value: unknown): number | null {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? Math.trunc(numericValue)
    : null;
}

export function listBandoriCardCatalogAvailableServers(
  canonicalCard: BandoriCardMaster,
  entityServer: BandoriServer | null,
): BandoriServer[] {
  if (entityServer !== null) {
    return [entityServer];
  }
  return BANDORI_SERVERS.filter((server) => (
    materializeBandoriCardForServer(canonicalCard, server) !== null
  ));
}

export function readBandoriCardCatalogReleaseTimestamp(
  card: BandoriCardMaster,
  server: BandoriServer,
): number {
  return normalizeBandoriCardReleaseSortTimestamp(
    readBandoriRegionalNumberAt(card.releasedAt, server),
  );
}

/**
 * Normalizes fields shared by every Cards catalog projection. Callers choose
 * their own entity expansion, availability scope, labels, and search model.
 */
export function normalizeBandoriCardCatalogBase(
  source: BandoriCardCatalogBaseSource,
  characters: Readonly<Record<string, BandoriCharacterMaster | null | undefined>>,
): NormalizedBandoriCardCatalogBase | null {
  const cardId = parsePositiveBandoriCardCatalogInteger(source.rawCardId);
  const characterId = parsePositiveBandoriCardCatalogInteger(source.card.characterId);
  const rarity = parsePositiveBandoriCardCatalogInteger(source.card.rarity);
  const resourceSetName = source.card.resourceSetName?.trim();
  if (cardId === null || characterId === null || rarity === null || !resourceSetName) {
    return null;
  }

  const character = characters[String(characterId)];
  const hasTrainedArt = hasTrainedCardArt(source.card);
  return {
    entry: {
      cardId,
      cardRef: source.cardRef,
      entityServer: source.entityServer,
      availableServers: source.availableServers,
      characterId,
      bandId: parsePositiveBandoriCardCatalogInteger(character?.bandId),
      rarity,
      attribute: isBandoriCardAttribute(source.card.attribute)
        ? source.card.attribute
        : null,
      resourceSetName,
      levelLimit: parsePositiveBandoriCardCatalogInteger(source.card.levelLimit) ?? 1,
      trainingLevelLimit: hasTrainedArt
        ? parsePositiveBandoriCardCatalogInteger(
            (source.card.stat?.training as { levelLimit?: unknown } | undefined)?.levelLimit,
          ) ?? 0
        : 0,
      hasTrainedArt,
      releaseTimestamps: source.releaseTimestamps,
    },
    card: source.card,
    character,
    skillId: parsePositiveBandoriCardCatalogInteger(source.card.skillId),
    rawType: source.card.type,
  };
}

export function expandBandoriCardCatalog<T extends object>(
  cards: Record<string, T | null | undefined>,
): ExpandedBandoriCardCatalogEntry<T>[] {
  const entries: ExpandedBandoriCardCatalogEntry<T>[] = [];
  const sortedCards = Object.entries(cards).sort(([left], [right]) => Number(left) - Number(right));

  for (const [rawCardId, card] of sortedCards) {
    if (!card) {
      continue;
    }
    const cardId = Number(rawCardId);
    if (!Number.isSafeInteger(cardId) || cardId < 1 || String(cardId) !== rawCardId) {
      throw new Error(`Bandori card catalog contains an invalid card ID: ${rawCardId}`);
    }
    if (!isKnownBandoriCardEntityCollision(rawCardId)) {
      entries.push({
        cardId,
        cardRef: rawCardId,
        server: null,
        card,
      });
      continue;
    }

    validateBandoriCardServerExtensions(
      card as T & Record<string, unknown>,
      `Bandori card catalog record ${rawCardId}`,
      { dataset: "cards", recordId: rawCardId },
    );
    for (const server of [1, 3] as const) {
      const serverCard = materializeBandoriCardForServer(card, server);
      if (!serverCard) {
        throw new Error(
          `Bandori card catalog collision is missing server `
          + `${getBandoriServerCode(server)}: ${rawCardId}`,
        );
      }
      entries.push({
        cardId,
        cardRef: `${server}:${rawCardId}`,
        server,
        card: serverCard,
      });
    }
  }

  return entries;
}
