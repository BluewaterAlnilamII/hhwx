import { pickBestdoriCnThenJpName, pickBestdoriCnThenJpRegionalName } from "@/lib/bestdori-regional-names";
import { parseApiSuccessData } from "@/lib/api-contracts";
import type { BandoriSkillLabelMaster } from "@/lib/bandori-skill-label";
import type { BandoriCardAttribute, BandoriCardCatalogEntry, BandoriCardPickerFilter } from "./types";

type BestdoriMasterResponse<T> = {
  payload?: Record<string, T | null | undefined>;
};

type BestdoriCardMetadata = {
  characterId?: number;
  skillId?: unknown;
  rarity?: number;
  attribute?: string;
  levelLimit?: number;
  resourceSetName?: string;
  prefix?: Array<string | null>;
  releasedAt?: Array<string | number | null>;
  stat?: {
    training?: {
      levelLimit?: number;
    } | unknown;
  } & Record<string, unknown>;
};

type BestdoriCharacterMetadata = {
  bandId?: number;
  nickname?: Array<string | null>;
  characterName?: Array<string | null>;
  firstName?: Array<string | null>;
};

const KNOWN_ATTRIBUTES = new Set(["powerful", "pure", "cool", "happy"]);
const JP_RELEASE_SORT_CUTOFF_TIMESTAMP = Date.UTC(2100, 0, 1);

function isKnownAttribute(value: string | undefined): value is BandoriCardAttribute {
  return Boolean(value && KNOWN_ATTRIBUTES.has(value));
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.trunc(parsed);
}

function readRegionalTimestampAt(values: BestdoriCardMetadata["releasedAt"], index: number): number {
  if (!Array.isArray(values)) {
    return 0;
  }

  const parsed = Number(values[index]);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return 0;
}

function hasCnRelease(values: BestdoriCardMetadata["releasedAt"]): boolean {
  return readRegionalTimestampAt(values, 3) > 0;
}

function hasTrainedCardArt(card: BestdoriCardMetadata | null | undefined): boolean {
  return typeof card?.stat?.training === "object" && card.stat.training !== null;
}

function transformCardsResponse(raw: unknown): Record<string, BestdoriCardMetadata | null | undefined> {
  return parseApiSuccessData<BestdoriMasterResponse<BestdoriCardMetadata>>(raw)?.payload ?? {};
}

function transformCharactersResponse(raw: unknown): Record<string, BestdoriCharacterMetadata | null | undefined> {
  return parseApiSuccessData<BestdoriMasterResponse<BestdoriCharacterMetadata>>(raw)?.payload ?? {};
}

function transformSkillsResponse(raw: unknown): Record<string, BandoriSkillLabelMaster | null | undefined> {
  return parseApiSuccessData<BestdoriMasterResponse<BandoriSkillLabelMaster>>(raw)?.payload ?? {};
}

export const bandoriCardCatalogTransforms = {
  cards: transformCardsResponse,
  characters: transformCharactersResponse,
  skills: transformSkillsResponse,
};

export function buildBandoriCardCatalog(
  cards: Record<string, BestdoriCardMetadata | null | undefined>,
  characters: Record<string, BestdoriCharacterMetadata | null | undefined>,
): BandoriCardCatalogEntry[] {
  return Object.entries(cards).flatMap(([rawCardId, card]) => {
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
    const displayNameResult = pickBestdoriCnThenJpRegionalName(card?.prefix);
    const displayName = displayNameResult?.name ?? `Card ${cardId}`;
    const assetRegion = displayNameResult?.assetRegion ?? (hasCnRelease(card?.releasedAt) ? "cn" : "jp");
    const characterName = pickBestdoriCnThenJpName(character?.nickname)
      ?? pickBestdoriCnThenJpName(character?.characterName)
      ?? pickBestdoriCnThenJpName(character?.firstName)
      ?? `Character ${characterId}`;
    const attribute = isKnownAttribute(card?.attribute) ? card.attribute : null;
    const levelLimit = toPositiveInteger(card?.levelLimit) ?? 1;
    const hasTrainedArt = hasTrainedCardArt(card);
    const trainingLevelLimit = hasTrainedArt
      ? toPositiveInteger((card?.stat?.training as { levelLimit?: unknown }).levelLimit) ?? 0
      : 0;
    const releasedAtJp = readRegionalTimestampAt(card?.releasedAt, 0);
    const releasedAtCn = readRegionalTimestampAt(card?.releasedAt, 3);
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
      characterId,
      skillId,
      characterName,
      bandId,
      rarity,
      attribute,
      levelLimit,
      trainingLevelLimit,
      resourceSetName,
      assetRegion,
      displayName,
      searchText,
      releasedAtJp,
      releasedAtCn,
      hasTrainedArt,
    }];
  }).sort((left, right) => right.releasedAtJp - left.releasedAtJp || right.cardId - left.cardId);
}

export function filterBandoriCardCatalog(
  cards: readonly BandoriCardCatalogEntry[],
  filter: BandoriCardPickerFilter,
): BandoriCardCatalogEntry[] {
  if (
    filter.bandIds.length === 0
    || filter.attributes.length === 0
    || filter.rarities.length === 0
    || filter.characterIds.length === 0
  ) {
    return [];
  }

  const query = filter.query.trim().toLowerCase();
  const bandIds = new Set(filter.bandIds);
  const attributes = new Set(filter.attributes);
  const rarities = new Set(filter.rarities);
  const characterIds = new Set(filter.characterIds);
  const filtered = cards.filter((card) => {
    if (query && !card.searchText.includes(query)) {
      return false;
    }
    if (!rarities.has(card.rarity)) {
      return false;
    }
    if (card.attribute && !attributes.has(card.attribute)) {
      return false;
    }
    if (!card.attribute && filter.attributes.length > 0) {
      return false;
    }
    if (card.bandId !== null && !bandIds.has(card.bandId)) {
      return false;
    }
    if (card.bandId === null && filter.bandIds.length > 0) {
      return false;
    }
    if (!characterIds.has(card.characterId)) {
      return false;
    }
    if (filter.sortBy === "release_jp" && (card.releasedAtJp <= 0 || card.releasedAtJp >= JP_RELEASE_SORT_CUTOFF_TIMESTAMP)) {
      return false;
    }
    if (filter.sortBy === "release_cn" && card.releasedAtCn <= 0) {
      return false;
    }
    return true;
  });

  return filtered.sort((left, right) => {
    const direction = filter.sortDirection === "asc" ? 1 : -1;
    switch (filter.sortBy) {
      case "release_cn":
        return direction * (left.releasedAtCn - right.releasedAtCn) || direction * (left.cardId - right.cardId);
      case "id":
        return direction * (left.cardId - right.cardId);
      case "release_jp":
      default:
        return direction * (left.releasedAtJp - right.releasedAtJp) || direction * (left.cardId - right.cardId);
    }
  });
}

export function getDefaultTrainType(card: Pick<BandoriCardCatalogEntry, "hasTrainedArt"> | null | undefined) {
  return card?.hasTrainedArt ? "after_training" : "normal";
}
