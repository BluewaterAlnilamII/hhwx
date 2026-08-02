import { type AppLocale } from "@/i18n/routing";
import {
  pickBandoriCharacterDisplayName,
  resolveBandoriCardBandId,
  resolveBandoriCardSkillLabel,
  type BandoriCharacterMaster,
  type BandoriSkillMaster,
} from "@/lib/bandori-card-master";
import {
  BANDORI_CARD_ATTRIBUTES,
  BANDORI_CARD_RARITIES,
  buildBandoriCardFilterSelection,
  getBandoriCardReleaseSortServer,
  isBandoriCardAttribute,
  matchesBandoriCardFilterSelection,
  normalizeBandoriCardReleaseSortTimestamp,
  type BandoriCardAttribute,
  type BandoriCardFilterState,
  type BandoriCardSortBy,
} from "@/lib/bandori-card-filter";
import {
  areGameProfileCardsEqual,
  type GameProfileCardMetadata,
  pickGameProfileCardName,
} from "@/lib/bandori-game-profile-card";
import {
  DEFAULT_BANDORI_PREFERRED_SERVER,
  type BandoriServer,
  type BandoriServerLanguageTag,
} from "@/lib/bandori-server";
import {
  calculateBandoriCard,
  type BandoriCharacterBonusState,
  type BestdoriCardMaster,
} from "@/lib/bandori-team-calculator";
import { type UserGameProfileCardRecord } from "@/lib/user-game-profile-payload";

export type BandoriProfileCardEntry = {
  card: UserGameProfileCardRecord;
  metadata: GameProfileCardMetadata | undefined;
  bandId: number | null;
  characterId: number | null;
  attribute: BandoriCardAttribute | null;
  rarity: number | null;
  totalPower: number;
  cardName: string;
  characterName: string;
  skillEffectLabel: string;
  skillEffectLanguageTag: BandoriServerLanguageTag;
  searchText: string;
};

export type BandoriProfileCardSortBy = BandoriCardSortBy;
export type BandoriProfileCardFilterState = BandoriCardFilterState<BandoriProfileCardSortBy>;

export type GameProfileCardChangeSummary = {
  added: number;
  updated: number;
  removed: number;
  total: number;
};

function calculateProfileCardTotalPower(
  card: UserGameProfileCardRecord,
  metadata: GameProfileCardMetadata | undefined,
  characters: Record<string, BandoriCharacterMaster | undefined>,
  characterBonusesById: Record<string, BandoriCharacterBonusState | undefined>,
): number {
  if (!metadata) {
    return 0;
  }
  try {
    return calculateBandoriCard(card, metadata as BestdoriCardMaster, characters, characterBonusesById).totalPower;
  } catch {
    return 0;
  }
}

export function buildBandoriProfileCardEntry(
  card: UserGameProfileCardRecord,
  cardMetadata: Record<string, GameProfileCardMetadata | undefined>,
  characters: Record<string, BandoriCharacterMaster | undefined>,
  skills: Record<string, BandoriSkillMaster | undefined>,
  characterBonusesById: Record<string, BandoriCharacterBonusState | undefined>,
  locale: AppLocale = "zh-CN",
  preferredServer: BandoriServer = DEFAULT_BANDORI_PREFERRED_SERVER,
  contextServer: BandoriServer = preferredServer,
  unknownSkillLabel = "",
): BandoriProfileCardEntry {
  const metadata = cardMetadata[String(card.cardId)];
  const characterId = Number(metadata?.characterId);
  const normalizedCharacterId = Number.isFinite(characterId) && characterId > 0 ? Math.trunc(characterId) : null;
  const bandId = resolveBandoriCardBandId(metadata, characters);
  const attribute = isBandoriCardAttribute(metadata?.attribute) ? metadata.attribute : null;
  const rarity = Number(metadata?.rarity);
  const normalizedRarity = Number.isFinite(rarity) && rarity > 0 ? Math.trunc(rarity) : null;
  const cardName = pickGameProfileCardName(card.cardId, metadata, preferredServer, locale, contextServer);
  const characterName = normalizedCharacterId === null
    ? ""
    : pickBandoriCharacterDisplayName(characters[String(normalizedCharacterId)], preferredServer, contextServer);
  const skillEffect = resolveBandoriCardSkillLabel(
    card,
    metadata,
    skills,
    5,
    preferredServer,
    contextServer,
    unknownSkillLabel,
  );
  const totalPower = calculateProfileCardTotalPower(card, metadata, characters, characterBonusesById);
  return {
    card,
    metadata,
    bandId,
    characterId: normalizedCharacterId,
    attribute,
    rarity: normalizedRarity,
    totalPower,
    cardName,
    characterName,
    skillEffectLabel: skillEffect.label,
    skillEffectLanguageTag: skillEffect.languageTag,
    searchText: [
      card.cardId,
      cardName,
      characterName,
      skillEffect.label,
      normalizedCharacterId,
      bandId,
      attribute,
      normalizedRarity,
      totalPower,
    ].join(" ").toLowerCase(),
  };
}

export function buildDefaultBandoriProfileCardFilter(
  bandIds: number[],
  characterIds: number[],
  sortBy: BandoriProfileCardSortBy = "power",
): BandoriProfileCardFilterState {
  return {
    query: "",
    bandIds,
    attributes: BANDORI_CARD_ATTRIBUTES,
    rarities: BANDORI_CARD_RARITIES,
    characterIds,
    sortBy,
    sortDirection: "desc",
  };
}

export function readBandoriProfileCardReleaseTimestamp(
  metadata: GameProfileCardMetadata | undefined,
  sortBy: BandoriProfileCardSortBy,
): number {
  if (sortBy === "power" || sortBy === "id") {
    return 0;
  }
  const releaseServer = getBandoriCardReleaseSortServer(sortBy);
  return releaseServer === null
    ? 0
    : normalizeBandoriCardReleaseSortTimestamp(metadata?.releasedAt?.[releaseServer]);
}

function includesUnknownValue(
  selectedCount: number,
  availableCount: number,
  unknownMetadataPolicy: "exclude" | "include-when-unfiltered",
): boolean {
  return unknownMetadataPolicy === "include-when-unfiltered"
    && selectedCount === availableCount;
}

export function filterAndSortBandoriProfileCardEntries(
  entries: readonly BandoriProfileCardEntry[],
  filter: BandoriProfileCardFilterState,
  options: {
    availableBandIds: readonly number[];
    availableCharacterIds: readonly number[];
    unknownMetadataPolicy: "exclude" | "include-when-unfiltered";
  },
): BandoriProfileCardEntry[] {
  if (
    (filter.bandIds.length === 0 && options.availableBandIds.length > 0)
    || filter.attributes.length === 0
    || filter.rarities.length === 0
    || (filter.characterIds.length === 0 && options.availableCharacterIds.length > 0)
  ) {
    return [];
  }

  const selection = buildBandoriCardFilterSelection(filter);
  const unknownFieldPolicy = {
    shouldIncludeUnknownBand: includesUnknownValue(filter.bandIds.length, options.availableBandIds.length, options.unknownMetadataPolicy),
    shouldIncludeUnknownAttribute: includesUnknownValue(filter.attributes.length, BANDORI_CARD_ATTRIBUTES.length, options.unknownMetadataPolicy),
    shouldIncludeUnknownRarity: includesUnknownValue(filter.rarities.length, BANDORI_CARD_RARITIES.length, options.unknownMetadataPolicy),
    shouldIncludeUnknownCharacter: includesUnknownValue(filter.characterIds.length, options.availableCharacterIds.length, options.unknownMetadataPolicy),
  };
  const direction = filter.sortDirection === "asc" ? 1 : -1;

  return entries.filter((entry) => {
    if (selection.query && !entry.searchText.includes(selection.query)) return false;
    if (!matchesBandoriCardFilterSelection(entry, selection, unknownFieldPolicy)) return false;
    if (getBandoriCardReleaseSortServer(filter.sortBy) !== null
      && readBandoriProfileCardReleaseTimestamp(entry.metadata, filter.sortBy) <= 0) return false;
    return true;
  }).sort((left, right) => {
    if (filter.sortBy === "power") {
      return direction * (left.totalPower - right.totalPower) || direction * (left.card.cardId - right.card.cardId);
    }
    if (filter.sortBy === "id") {
      return direction * (left.card.cardId - right.card.cardId);
    }
    return direction * (
      readBandoriProfileCardReleaseTimestamp(left.metadata, filter.sortBy)
      - readBandoriProfileCardReleaseTimestamp(right.metadata, filter.sortBy)
    ) || direction * (left.card.cardId - right.card.cardId);
  });
}

export function summarizeGameProfileCardChanges(
  savedCards: readonly UserGameProfileCardRecord[],
  draftCards: readonly UserGameProfileCardRecord[],
): GameProfileCardChangeSummary {
  const savedById = new Map(savedCards.map((card) => [card.cardId, card]));
  const draftById = new Map(draftCards.map((card) => [card.cardId, card]));
  let added = 0;
  let updated = 0;
  let removed = 0;

  draftById.forEach((draftCard, cardId) => {
    const savedCard = savedById.get(cardId);
    if (!savedCard) added += 1;
    else if (!areGameProfileCardsEqual(savedCard, draftCard)) updated += 1;
  });
  savedById.forEach((_, cardId) => {
    if (!draftById.has(cardId)) removed += 1;
  });

  return { added, updated, removed, total: added + updated + removed };
}
