import { pickBestdoriLocalizedName } from "@/lib/bestdori-regional-names";
import {
  bandoriMasterTransforms,
  pickBandoriCharacterDisplayName,
  type BandoriCardMaster,
  type BandoriCharacterMaster,
} from "@/lib/bandori-card-master";
import { hasTrainedCardArt } from "@/lib/bandori-card-training";
import {
  expandBandoriCardCatalog,
  materializeBandoriCardForServer,
} from "@/lib/bandori-card-server-extensions";
import {
  buildBandoriCardFilterSelection,
  getBandoriCardReleaseSortServer,
  isBandoriCardAttribute,
  matchesBandoriCardFilterSelection,
  normalizeBandoriCardReleaseSortTimestamp,
} from "@/lib/bandori-card-filter";
import {
  BANDORI_SERVERS,
  DEFAULT_BANDORI_PREFERRED_SERVER,
  type BandoriServer,
} from "@/lib/bandori-server";
import {
  listBandoriCardAssetVariants,
  type BandoriCardsAssetIndex,
} from "@/lib/bandori-public-asset-index";
import type {
  BandoriCardArtVariant,
  BandoriCardCatalogEntry,
  BandoriCardPickerFilter,
} from "./types";

function toPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.trunc(parsed);
}

function readRegionalTimestampAt(values: BandoriCardMaster["releasedAt"], index: number): number {
  if (!Array.isArray(values)) {
    return 0;
  }

  const parsed = Number(values[index]);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return 0;
}

export const bandoriCardCatalogTransforms = bandoriMasterTransforms;

export interface BandoriCardCatalogFallbackLabels {
  getCardLabel: (cardId: number) => string;
  getCharacterLabel: (characterId: number) => string;
}

export interface BandoriCardCatalogSourceContext {
  canonicalCards?: Record<string, BandoriCardMaster | null | undefined>;
  assetIndex?: BandoriCardsAssetIndex | null;
}

export function buildBandoriCardCatalog(
  cards: Record<string, BandoriCardMaster | null | undefined>,
  characters: Record<string, BandoriCharacterMaster | null | undefined>,
  preferredServer: BandoriServer = DEFAULT_BANDORI_PREFERRED_SERVER,
  expandEntityCollisions = false,
  contextServer?: BandoriServer | null,
  fallbackLabels?: BandoriCardCatalogFallbackLabels,
  sourceContext: BandoriCardCatalogSourceContext = {},
): BandoriCardCatalogEntry[] {
  const cardEntries = expandEntityCollisions
    ? expandBandoriCardCatalog(cards).map(({ cardId, cardRef, server, card }) => ({
        rawCardId: String(cardId),
        cardRef,
        entityServer: server,
        card,
      }))
    : Object.entries(cards).map(([rawCardId, card]) => ({
        rawCardId,
        cardRef: rawCardId,
        entityServer: null,
        card,
      }));

  return cardEntries.flatMap(({ rawCardId, cardRef, entityServer, card }) => {
    const cardId = toPositiveInteger(rawCardId);
    const characterId = toPositiveInteger(card?.characterId);
    const skillId = toPositiveInteger(card?.skillId);
    const rarity = toPositiveInteger(card?.rarity);
    const resourceSetName = card?.resourceSetName?.trim();
    if (!cardId || !characterId || !rarity || !resourceSetName) {
      return [];
    }

    const character = characters[String(characterId)];
    const bandId = toPositiveInteger(character?.bandId);
    const displayName = pickBestdoriLocalizedName(card?.prefix, preferredServer, contextServer)
      ?? fallbackLabels?.getCardLabel(cardId)
      ?? `#${cardId}`;
    const releaseTimestamps = [0, 1, 2, 3].map(
      (server) => normalizeBandoriCardReleaseSortTimestamp(
        readRegionalTimestampAt(card?.releasedAt, server),
      ),
    ) as [number, number, number, number];
    const characterName = pickBandoriCharacterDisplayName(
      character,
      preferredServer,
      contextServer,
      fallbackLabels?.getCharacterLabel(characterId) ?? `#${characterId}`,
    );
    const attribute = isBandoriCardAttribute(card?.attribute) ? card.attribute : null;
    const levelLimit = toPositiveInteger(card?.levelLimit) ?? 1;
    const masterHasTrainedArt = hasTrainedCardArt(card);
    const indexedArtVariants = listBandoriCardAssetVariants(
      sourceContext.assetIndex,
      resourceSetName,
    );
    const availableArtVariants: readonly BandoriCardArtVariant[] = sourceContext.assetIndex
      ? indexedArtVariants
      : masterHasTrainedArt
        ? ["normal", "after_training"]
        : ["normal"];
    const hasTrainedArt = availableArtVariants.includes("after_training");
    const trainingLevelLimit = masterHasTrainedArt
      ? toPositiveInteger((card?.stat?.training as { levelLimit?: unknown }).levelLimit) ?? 0
      : 0;
    const canonicalCard = sourceContext.canonicalCards === undefined
      ? card
      : sourceContext.canonicalCards[rawCardId];
    const availableServers = entityServer !== null
      ? [entityServer]
      : contextServer !== undefined && contextServer !== null
        ? canonicalCard && materializeBandoriCardForServer(canonicalCard, contextServer)
          ? [contextServer]
          : []
        : BANDORI_SERVERS.filter((server) => (
            canonicalCard
              ? materializeBandoriCardForServer(canonicalCard, server) !== null
              : false
          ));
    const searchText = [
      cardId,
      displayName,
      characterName,
      characterId,
      bandId,
      attribute,
      rarity,
    ].join(" ").toLowerCase();

    return [{
      cardId,
      cardRef,
      entityServer,
      availableServers,
      characterId,
      skillId,
      characterName,
      bandId,
      rarity,
      attribute,
      levelLimit,
      trainingLevelLimit,
      resourceSetName,
      type: card?.type,
      displayName,
      searchText,
      releaseTimestamps,
      availableArtVariants,
      hasTrainedArt,
    }];
  }).sort((left, right) => right.releaseTimestamps[0] - left.releaseTimestamps[0] || right.cardId - left.cardId);
}

export function filterBandoriCardCatalog(
  cards: readonly BandoriCardCatalogEntry[],
  filter: BandoriCardPickerFilter,
): BandoriCardCatalogEntry[] {
  if (
    (filter.servers?.length ?? BANDORI_SERVERS.length) === 0
    ||
    filter.bandIds.length === 0
    || filter.attributes.length === 0
    || filter.rarities.length === 0
    || filter.characterIds.length === 0
  ) {
    return [];
  }

  const selection = buildBandoriCardFilterSelection(filter);
  const releaseServer = getBandoriCardReleaseSortServer(filter.sortBy);
  const filtered = cards.filter((card) => {
    if (selection.query && !card.searchText.includes(selection.query)) {
      return false;
    }
    if (!matchesBandoriCardFilterSelection(card, selection)) {
      return false;
    }
    const releaseTimestamp = releaseServer === null ? 0 : card.releaseTimestamps[releaseServer];
    if (releaseServer !== null && releaseTimestamp <= 0) {
      return false;
    }
    return true;
  });

  return filtered.sort((left, right) => {
    const direction = filter.sortDirection === "asc" ? 1 : -1;
    if (filter.sortBy === "id" || releaseServer === null) {
      return direction * (left.cardId - right.cardId);
    }
    return direction * (
      left.releaseTimestamps[releaseServer] - right.releaseTimestamps[releaseServer]
    ) || direction * (left.cardId - right.cardId);
  });
}

export function getDefaultTrainType(
  card: Pick<BandoriCardCatalogEntry, "availableArtVariants" | "hasTrainedArt"> | null | undefined,
): BandoriCardArtVariant {
  if (card?.availableArtVariants.length === 1) {
    return card.availableArtVariants[0];
  }
  return card?.hasTrainedArt ? "after_training" : "normal";
}

export function resolveBandoriCardCatalogTrainType(
  card: Pick<BandoriCardCatalogEntry, "availableArtVariants">,
  requestedTrainType: BandoriCardArtVariant,
): BandoriCardArtVariant {
  if (card.availableArtVariants.includes(requestedTrainType)) {
    return requestedTrainType;
  }
  return card.availableArtVariants.length === 1
    ? card.availableArtVariants[0]
    : "normal";
}
