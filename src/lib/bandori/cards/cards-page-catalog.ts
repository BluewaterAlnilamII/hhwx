import {
  type BandoriCardMaster,
  type BandoriCharacterMaster,
  type BandoriSkillMaster,
} from "@/lib/bandori/cards/master";
import {
  materializeBandoriCardForServer,
  type BandoriCardServer,
} from "@/lib/bandori/cards/regional-extensions";
import {
  BANDORI_CARD_ATTRIBUTES,
  BANDORI_CARD_CATALOG_TYPES,
  BANDORI_CARD_RARITIES,
  normalizeBandoriCardCatalogType,
  type BandoriCardCatalogType,
  getBandoriCardReleaseSortServer,
  type BandoriCardAttribute,
  type BandoriCardFilterState,
  type BandoriCardPickerSortBy,
} from "@/lib/bandori/cards/filter";
import {
  expandBandoriCardCatalog,
  listBandoriCardCatalogAvailableServers,
  normalizeBandoriCardCatalogBase,
  readBandoriCardCatalogReleaseTimestamp,
  type BandoriCardCatalogBaseEntry,
} from "@/lib/bandori/cards/catalog";
import { resolveBandoriSkillLabelForServer } from "@/lib/bandori-skill-label";
import {
  BANDORI_SERVERS,
  pickAvailableBandoriServer,
  readBandoriRegionalTextAt,
  type BandoriServer,
} from "@/lib/bandori-server";
import {
  buildBandoriCardSearchData,
  buildBandoriCardSearchMetadata,
  compileBandoriCardSearch,
  type BandoriCardSearchData,
} from "@/lib/bandori/cards/search";

export { BANDORI_CARD_CATALOG_TYPES, normalizeBandoriCardCatalogType, type BandoriCardCatalogType } from "./filter";

export type BandoriCardsPageFilter = BandoriCardFilterState<BandoriCardPickerSortBy> & {
  types: BandoriCardCatalogType[];
};

export type BandoriCardsPageCatalogEntry = BandoriCardCatalogBaseEntry & BandoriCardSearchData & {
  entityServer: BandoriCardServer | null;
  displayServer: BandoriServer;
  displayCard: BandoriCardMaster;
  displayName: string;
  characterName: string;
  skillEffectLabel: string;
  type: BandoriCardCatalogType;
  displayReleaseTimestamp: number;
  filterBandId: number | null;
  filterCharacterId: number | null;
  filterRarity: number | null;
  filterAttribute: BandoriCardAttribute | null;
  filterType: BandoriCardCatalogType | null;
};

function readCharacterNameAt(
  character: BandoriCharacterMaster | null | undefined,
  server: BandoriServer,
): string | null {
  return readBandoriRegionalTextAt(character?.nickname, server)
    ?? readBandoriRegionalTextAt(character?.characterName, server)
    ?? readBandoriRegionalTextAt(character?.firstName, server);
}

export function buildBandoriCardsPageCatalog(
  cards: Readonly<Record<string, BandoriCardMaster | null | undefined>>,
  characters: Readonly<Record<string, BandoriCharacterMaster | null | undefined>>,
  skills: Readonly<Record<string, BandoriSkillMaster | null | undefined>>,
  preferredServer: BandoriServer,
  fallbackLabels: {
    card: (cardId: number) => string;
    character: (characterId: number) => string;
    skill: string;
  },
): BandoriCardsPageCatalogEntry[] {
  const searchMetadata = buildBandoriCardSearchMetadata(characters, skills);
  return expandBandoriCardCatalog(cards).flatMap((catalogEntry) => {
    const canonicalCard = cards[String(catalogEntry.cardId)];
    if (!canonicalCard) {
      return [];
    }

    const availableServers = listBandoriCardCatalogAvailableServers(
      canonicalCard,
      catalogEntry.server,
    );
    const displayServer = catalogEntry.server
      ?? pickAvailableBandoriServer(availableServers, preferredServer);
    if (displayServer === null) {
      return [];
    }

    const displayCard = catalogEntry.server !== null
      ? catalogEntry.card
      : materializeBandoriCardForServer(canonicalCard, displayServer);
    if (!displayCard) {
      return [];
    }

    const releaseTimestamps = BANDORI_SERVERS.map((server) => {
      if (!availableServers.includes(server)) {
        return 0;
      }
      const serverCard = catalogEntry.server !== null
        ? catalogEntry.server === server ? catalogEntry.card : null
        : materializeBandoriCardForServer(canonicalCard, server);
      return serverCard ? readBandoriCardCatalogReleaseTimestamp(serverCard, server) : 0;
    }) as [number, number, number, number];
    const normalized = normalizeBandoriCardCatalogBase({
      rawCardId: String(catalogEntry.cardId),
      cardRef: catalogEntry.cardRef,
      entityServer: catalogEntry.server,
      card: displayCard,
      availableServers,
      releaseTimestamps,
    }, characters);
    if (!normalized) {
      return [];
    }

    const { entry, character, skillId: displaySkillId, rawType } = normalized;
    const displaySkill = displaySkillId === null ? undefined : skills[String(displaySkillId)] ?? undefined;
    const displayName = readBandoriRegionalTextAt(displayCard.prefix, displayServer)
      ?? fallbackLabels.card(entry.cardId);
    const characterName = readCharacterNameAt(character, displayServer)
      ?? fallbackLabels.character(entry.characterId);
    return [{
      ...entry,
      displayServer,
      displayCard,
      displayName,
      characterName,
      skillEffectLabel: resolveBandoriSkillLabelForServer(
        displaySkill,
        5,
        displayServer,
        5,
        fallbackLabels.skill,
      ).label,
      type: normalizeBandoriCardCatalogType(rawType),
      displayReleaseTimestamp: releaseTimestamps[displayServer],
      // Structural filters follow the displayed entity, even when the preferred server lacks it.
      filterBandId: entry.bandId,
      filterCharacterId: entry.characterId,
      filterRarity: entry.rarity,
      filterAttribute: entry.attribute,
      filterType: normalizeBandoriCardCatalogType(rawType),
      ...buildBandoriCardSearchData(canonicalCard, catalogEntry.server, searchMetadata),
    }];
  });
}

function matchesNullableSelection<T>(
  value: T | null,
  selectedValues: readonly T[],
  availableValues: readonly T[],
): boolean {
  if (selectedValues.length === 0) {
    return false;
  }
  return value === null
    ? selectedValues.length === availableValues.length
    : selectedValues.includes(value);
}

export function filterBandoriCardsPageCatalog(
  entries: readonly BandoriCardsPageCatalogEntry[],
  filter: BandoriCardsPageFilter,
  availableBandIds: readonly number[],
  availableCharacterIds: readonly number[],
): BandoriCardsPageCatalogEntry[] {
  if (filter.servers.length === 0 || filter.types.length === 0) {
    return [];
  }

  const matchesSearch = compileBandoriCardSearch(filter.query);
  const releaseServer = getBandoriCardReleaseSortServer(filter.sortBy);
  const direction = filter.sortDirection === "asc" ? 1 : -1;

  return entries.filter((entry) => {
    if (!entry.availableServers.some((server) => filter.servers.includes(server))) return false;
    if (!matchesSearch(entry)) return false;
    if (!matchesNullableSelection(entry.filterBandId, filter.bandIds, availableBandIds)) return false;
    if (!matchesNullableSelection(entry.filterAttribute, filter.attributes, BANDORI_CARD_ATTRIBUTES)) return false;
    if (!matchesNullableSelection(entry.filterRarity, filter.rarities, BANDORI_CARD_RARITIES)) return false;
    if (!matchesNullableSelection(entry.filterCharacterId, filter.characterIds, availableCharacterIds)) return false;
    if (!matchesNullableSelection(entry.filterType, filter.types, BANDORI_CARD_CATALOG_TYPES)) return false;
    return true;
  }).sort((left, right) => {
    if (filter.sortBy === "id" || releaseServer === null) {
      return direction * (left.cardId - right.cardId)
        || left.cardRef.localeCompare(right.cardRef);
    }
    const leftTimestamp = left.releaseTimestamps[releaseServer];
    const rightTimestamp = right.releaseTimestamps[releaseServer];
    if (leftTimestamp <= 0 || rightTimestamp <= 0) {
      if (leftTimestamp <= 0 && rightTimestamp <= 0) {
        return direction * (left.cardId - right.cardId)
          || left.cardRef.localeCompare(right.cardRef);
      }
      return leftTimestamp <= 0 ? 1 : -1;
    }
    return direction * (leftTimestamp - rightTimestamp)
      || direction * (left.cardId - right.cardId)
      || left.cardRef.localeCompare(right.cardRef);
  });
}
