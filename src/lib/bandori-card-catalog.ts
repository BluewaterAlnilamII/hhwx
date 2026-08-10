import {
  pickBandoriCharacterDisplayName,
  type BandoriCardMaster,
  type BandoriCharacterMaster,
  type BandoriSkillMaster,
} from "@/lib/bandori-card-master";
import { hasTrainedCardArt } from "@/lib/bandori-card-training";
import {
  expandBandoriCardCatalog,
  materializeBandoriCardForServer,
  type BandoriCardServer,
} from "@/lib/bandori-card-server-extensions";
import {
  BANDORI_CARD_ATTRIBUTES,
  BANDORI_CARD_RARITIES,
  getBandoriCardReleaseSortServer,
  isBandoriCardAttribute,
  normalizeBandoriCardReleaseSortTimestamp,
  type BandoriCardAttribute,
  type BandoriCardFilterState,
  type BandoriCardPickerSortBy,
} from "@/lib/bandori-card-filter";
import { resolveBandoriSkillLabelForServer } from "@/lib/bandori-skill-label";
import {
  BANDORI_SERVERS,
  pickAvailableBandoriServer,
  readBandoriRegionalNumberAt,
  readBandoriRegionalTextAt,
  type BandoriServer,
} from "@/lib/bandori-server";

export const BANDORI_CARD_CATALOG_TYPES = [
  "permanent",
  "kirafes",
  "dreamfes",
  "limited",
  "birthday",
  "event",
  "campaign",
  "initial",
  "special",
  "others",
] as const;

export type BandoriCardCatalogType = typeof BANDORI_CARD_CATALOG_TYPES[number];

const BANDORI_CARD_CATALOG_TYPE_SET = new Set<string>(BANDORI_CARD_CATALOG_TYPES);

export type BandoriCardsPageFilter = BandoriCardFilterState<BandoriCardPickerSortBy> & {
  types: BandoriCardCatalogType[];
};

export type BandoriCardsPageCatalogEntry = {
  cardId: number;
  cardRef: string;
  entityServer: BandoriCardServer | null;
  availableServers: readonly BandoriServer[];
  displayServer: BandoriServer;
  displayCard: BandoriCardMaster;
  displayName: string;
  characterName: string;
  skillEffectLabel: string;
  bandId: number | null;
  characterId: number;
  rarity: number;
  attribute: BandoriCardAttribute | null;
  type: BandoriCardCatalogType;
  resourceSetName: string;
  levelLimit: number;
  trainingLevelLimit: number;
  hasTrainedArt: boolean;
  releaseTimestamps: readonly [number, number, number, number];
  displayReleaseTimestamp: number;
  filterBandId: number | null;
  filterCharacterId: number | null;
  filterRarity: number | null;
  filterAttribute: BandoriCardAttribute | null;
  filterType: BandoriCardCatalogType | null;
  filterSearchText: string;
};

export function normalizeBandoriCardCatalogType(value: unknown): BandoriCardCatalogType {
  return typeof value === "string" && BANDORI_CARD_CATALOG_TYPE_SET.has(value)
    ? value as BandoriCardCatalogType
    : "others";
}

function toPositiveInteger(value: unknown): number | null {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0
    ? Math.trunc(numericValue)
    : null;
}

function readCharacterNameAt(
  character: BandoriCharacterMaster | null | undefined,
  server: BandoriServer,
): string | null {
  return readBandoriRegionalTextAt(character?.nickname, server)
    ?? readBandoriRegionalTextAt(character?.characterName, server)
    ?? readBandoriRegionalTextAt(character?.firstName, server);
}

function resolveBandId(
  characterId: number | null,
  characters: Readonly<Record<string, BandoriCharacterMaster | null | undefined>>,
): number | null {
  return characterId === null
    ? null
    : toPositiveInteger(characters[String(characterId)]?.bandId);
}

function getAvailableServers(
  card: BandoriCardMaster,
  entityServer: BandoriCardServer | null,
): BandoriServer[] {
  if (entityServer !== null) {
    return [entityServer];
  }
  return BANDORI_SERVERS.filter((server) => materializeBandoriCardForServer(card, server) !== null);
}

function readReleaseTimestamp(card: BandoriCardMaster, server: BandoriServer): number {
  return normalizeBandoriCardReleaseSortTimestamp(
    readBandoriRegionalNumberAt(card.releasedAt, server),
  );
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
  return expandBandoriCardCatalog(cards).flatMap((catalogEntry) => {
    const canonicalCard = cards[String(catalogEntry.cardId)];
    if (!canonicalCard) {
      return [];
    }

    const availableServers = getAvailableServers(canonicalCard, catalogEntry.server);
    const displayServer = catalogEntry.server
      ?? pickAvailableBandoriServer(availableServers, preferredServer);
    if (displayServer === null) {
      return [];
    }

    const displayCard = catalogEntry.server !== null
      ? catalogEntry.card
      : materializeBandoriCardForServer(canonicalCard, displayServer);
    const filterCard = catalogEntry.server !== null
      ? catalogEntry.server === preferredServer ? catalogEntry.card : null
      : materializeBandoriCardForServer(canonicalCard, preferredServer);
    if (!displayCard) {
      return [];
    }

    const characterId = toPositiveInteger(displayCard.characterId);
    const rarity = toPositiveInteger(displayCard.rarity);
    const resourceSetName = displayCard.resourceSetName?.trim();
    if (characterId === null || rarity === null || !resourceSetName) {
      return [];
    }

    const filterCharacterId = filterCard ? toPositiveInteger(filterCard.characterId) : null;
    const filterCharacter = filterCharacterId === null
      ? null
      : characters[String(filterCharacterId)];
    const filterSkillId = filterCard ? toPositiveInteger(filterCard.skillId) : null;
    const filterSkill = filterSkillId === null ? undefined : skills[String(filterSkillId)] ?? undefined;
    const displaySkillId = toPositiveInteger(displayCard.skillId);
    const displaySkill = displaySkillId === null ? undefined : skills[String(displaySkillId)] ?? undefined;
    const displayName = readBandoriRegionalTextAt(displayCard.prefix, displayServer)
      ?? fallbackLabels.card(catalogEntry.cardId);
    const characterName = readCharacterNameAt(characters[String(characterId)], displayServer)
      ?? fallbackLabels.character(characterId);
    const filterName = filterCard
      ? readBandoriRegionalTextAt(filterCard.prefix, preferredServer)
      : null;
    const filterCharacterName = filterCard
      ? readCharacterNameAt(filterCharacter, preferredServer)
      : null;
    const filterSkillName = filterCard
      ? readBandoriRegionalTextAt(filterCard.skillName, preferredServer)
      : null;
    const filterSkillEffect = filterCard
      ? resolveBandoriSkillLabelForServer(filterSkill, 5, preferredServer, 5).label
      : "";
    const hasTrainedArt = hasTrainedCardArt(displayCard);
    const trainingLevelLimit = hasTrainedArt
      ? toPositiveInteger((displayCard.stat?.training as { levelLimit?: unknown } | undefined)?.levelLimit) ?? 0
      : 0;
    const releaseTimestamps = BANDORI_SERVERS.map((server) => {
      if (!availableServers.includes(server)) {
        return 0;
      }
      const serverCard = catalogEntry.server !== null
        ? catalogEntry.server === server ? catalogEntry.card : null
        : materializeBandoriCardForServer(canonicalCard, server);
      return serverCard ? readReleaseTimestamp(serverCard, server) : 0;
    }) as [number, number, number, number];

    return [{
      cardId: catalogEntry.cardId,
      cardRef: catalogEntry.cardRef,
      entityServer: catalogEntry.server,
      availableServers,
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
      bandId: resolveBandId(characterId, characters),
      characterId,
      rarity,
      attribute: isBandoriCardAttribute(displayCard.attribute) ? displayCard.attribute : null,
      type: normalizeBandoriCardCatalogType(displayCard.type),
      resourceSetName,
      levelLimit: toPositiveInteger(displayCard.levelLimit) ?? 1,
      trainingLevelLimit,
      hasTrainedArt,
      releaseTimestamps,
      displayReleaseTimestamp: releaseTimestamps[displayServer],
      filterBandId: filterCard ? resolveBandId(filterCharacterId, characters) : null,
      filterCharacterId,
      filterRarity: filterCard ? toPositiveInteger(filterCard.rarity) : null,
      filterAttribute: filterCard && isBandoriCardAttribute(filterCard.attribute)
        ? filterCard.attribute
        : null,
      filterType: filterCard ? normalizeBandoriCardCatalogType(filterCard.type) : null,
      filterSearchText: [
        filterName,
        filterCharacterName,
        filterSkillName,
        filterSkillEffect,
      ].filter(Boolean).join(" ").toLowerCase(),
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

  const normalizedQuery = filter.query.trim().toLowerCase();
  const exactId = /^[1-9]\d*$/u.test(normalizedQuery) ? Number(normalizedQuery) : null;
  const releaseServer = getBandoriCardReleaseSortServer(filter.sortBy);
  const direction = filter.sortDirection === "asc" ? 1 : -1;

  return entries.filter((entry) => {
    if (!entry.availableServers.some((server) => filter.servers.includes(server))) return false;
    if (exactId !== null ? entry.cardId !== exactId : normalizedQuery && !entry.filterSearchText.includes(normalizedQuery)) return false;
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

export function buildBandoriCardsPageFallbackCharacterName(
  character: BandoriCharacterMaster | null | undefined,
  preferredServer: BandoriServer,
  fallback: string,
): string {
  return pickBandoriCharacterDisplayName(character, preferredServer, preferredServer, fallback);
}
