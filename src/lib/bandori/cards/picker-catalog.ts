import { pickBestdoriLocalizedName } from "@/lib/bestdori-regional-names";
import {
  bandoriMasterTransforms,
  pickBandoriCharacterDisplayName,
  type BandoriCardMaster,
  type BandoriCharacterMaster,
} from "@/lib/bandori/cards/master";
import {
  expandBandoriCardCatalog,
} from "@/lib/bandori/cards/regional-extensions";
import {
  buildBandoriCardFilterSelection,
  getBandoriCardReleaseSortServer,
  matchesBandoriCardFilterSelection,
  type BandoriCardFilterState,
  type BandoriCardPickerSortBy,
} from "@/lib/bandori/cards/filter";
import {
  listBandoriCardCatalogAvailableServers,
  normalizeBandoriCardCatalogBase,
  readBandoriCardCatalogReleaseTimestamp,
  type BandoriCardCatalogBaseEntry,
} from "@/lib/bandori/cards/catalog";
import {
  BANDORI_SERVERS,
  DEFAULT_BANDORI_PREFERRED_SERVER,
  type BandoriServer,
} from "@/lib/bandori-server";
import {
  listBandoriCardAssetVariants,
  type BandoriCardAssetVariant,
  type BandoriCardsAssetIndex,
} from "@/lib/bandori-public-asset-index";

export type BandoriCardCatalogEntry = BandoriCardCatalogBaseEntry & {
  skillId: number | null;
  characterName: string;
  type?: string;
  displayName: string;
  searchText: string;
  availableArtVariants: readonly BandoriCardAssetVariant[];
};

export type BandoriCardPickerFilter = BandoriCardFilterState<BandoriCardPickerSortBy>;

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
    if (!card) {
      return [];
    }

    const canonicalCard = sourceContext.canonicalCards === undefined
      ? card
      : sourceContext.canonicalCards[rawCardId];
    const allAvailableServers = canonicalCard
      ? listBandoriCardCatalogAvailableServers(canonicalCard, entityServer)
      : entityServer === null ? [] : [entityServer];
    const availableServers = entityServer !== null
      ? allAvailableServers
      : contextServer !== undefined && contextServer !== null
        ? allAvailableServers.includes(contextServer) ? [contextServer] : []
        : allAvailableServers;
    const normalized = normalizeBandoriCardCatalogBase({
      rawCardId,
      cardRef,
      entityServer,
      card,
      availableServers,
      releaseTimestamps: BANDORI_SERVERS.map((server) => (
        readBandoriCardCatalogReleaseTimestamp(card, server)
      )) as [number, number, number, number],
    }, characters);
    if (!normalized) {
      return [];
    }

    const { entry, character, skillId, rawType } = normalized;
    const displayName = pickBestdoriLocalizedName(card.prefix, preferredServer, contextServer)
      ?? fallbackLabels?.getCardLabel(entry.cardId)
      ?? `#${entry.cardId}`;
    const characterName = pickBandoriCharacterDisplayName(
      character,
      preferredServer,
      contextServer,
      fallbackLabels?.getCharacterLabel(entry.characterId) ?? `#${entry.characterId}`,
    );
    const indexedArtVariants = listBandoriCardAssetVariants(
      sourceContext.assetIndex,
      entry.resourceSetName,
    );
    const availableArtVariants: readonly BandoriCardAssetVariant[] = sourceContext.assetIndex
      ? indexedArtVariants
      : entry.hasTrainedArt
        ? ["normal", "after_training"]
        : ["normal"];
    const hasTrainedArt = availableArtVariants.includes("after_training");
    const searchText = [
      entry.cardId,
      displayName,
      characterName,
      entry.characterId,
      entry.bandId,
      entry.attribute,
      entry.rarity,
    ].join(" ").toLowerCase();

    return [{
      ...entry,
      skillId,
      characterName,
      type: rawType,
      displayName,
      searchText,
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
): BandoriCardAssetVariant {
  if (card?.availableArtVariants.length === 1) {
    return card.availableArtVariants[0];
  }
  return card?.hasTrainedArt ? "after_training" : "normal";
}

export function resolveBandoriCardCatalogTrainType(
  card: Pick<BandoriCardCatalogEntry, "availableArtVariants">,
  requestedTrainType: BandoriCardAssetVariant,
): BandoriCardAssetVariant {
  if (card.availableArtVariants.includes(requestedTrainType)) {
    return requestedTrainType;
  }
  return card.availableArtVariants.length === 1
    ? card.availableArtVariants[0]
    : "normal";
}
