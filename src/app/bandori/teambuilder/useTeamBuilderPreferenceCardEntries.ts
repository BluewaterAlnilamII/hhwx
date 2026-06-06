"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";
import {
  calculateBandoriCard,
  type BandoriCardAttribute,
  type BandoriCharacterBonusState,
  type BestdoriCardMaster,
} from "@/lib/bandori-team-calculator";
import {
  normalizeBandoriSkillLabel,
  type BandoriSkillLabelMaster,
} from "@/lib/bandori-skill-label";
import { pickGameProfileCardName } from "@/lib/bandori-game-profile-card";
import { type UserGameProfileCardRecord } from "@/lib/user-game-profile-payload";

const PROFILE_CARD_ENTRY_BUILD_CHUNK_SIZE = 80;

export type TeamBuilderPreferenceCharacterMaster = {
  nickname?: string[] | string;
  firstName?: string[] | string;
  characterName?: string[] | string;
  bandId?: number | null;
};

export type TeamBuilderPreferenceSkillMaster = BandoriSkillLabelMaster;

export type TeamBuilderPreferenceCardMetadata = {
  characterId?: number;
  rarity?: number;
  attribute?: string;
  skillId?: number;
  levelLimit?: number;
  resourceSetName?: string;
  assetRegion?: BandoriAssetRegion;
  releasedAt?: Array<string | number | null>;
  displayName?: string | null;
  hasTrainedArt?: boolean;
  stat?: {
    training?: {
      levelLimit?: number;
    };
  };
};

export type TeamBuilderPreferenceCardEntry = {
  card: UserGameProfileCardRecord;
  metadata: TeamBuilderPreferenceCardMetadata | undefined;
  bandId: number | null;
  characterId: number | null;
  attribute: BandoriCardAttribute | null;
  rarity: number | null;
  totalPower: number;
  cardName: string;
  characterName: string;
  skillEffectLabel: string;
  searchText: string;
};

function pickLocalizedName(value: string[] | string | undefined, fallback = ""): string {
  if (typeof value === "string") {
    return value.trim() || fallback;
  }
  if (!Array.isArray(value)) {
    return fallback;
  }
  return value[3]?.trim() || value[0]?.trim() || fallback;
}

function pickCharacterDisplayName(character: TeamBuilderPreferenceCharacterMaster | undefined, fallback = ""): string {
  return pickLocalizedName(character?.nickname)
    || pickLocalizedName(character?.characterName)
    || pickLocalizedName(character?.firstName)
    || fallback;
}

function getCardCharacterLabel(
  metadata: TeamBuilderPreferenceCardMetadata | undefined,
  characters: Record<string, TeamBuilderPreferenceCharacterMaster | undefined>,
): string {
  const characterId = Number(metadata?.characterId);
  if (!Number.isFinite(characterId)) {
    return "";
  }
  const character = characters[String(Math.trunc(characterId))];
  return pickCharacterDisplayName(character);
}

function isKnownAttribute(value: string | undefined): value is BandoriCardAttribute {
  return value === "powerful" || value === "cool" || value === "happy" || value === "pure";
}

function getCardBandId(
  metadata: TeamBuilderPreferenceCardMetadata | undefined,
  characters: Record<string, TeamBuilderPreferenceCharacterMaster | undefined>,
): number | null {
  const characterId = Number(metadata?.characterId);
  if (!Number.isFinite(characterId)) {
    return null;
  }

  const bandId = Number(characters[String(Math.trunc(characterId))]?.bandId);
  return Number.isFinite(bandId) && bandId > 0 ? Math.trunc(bandId) : null;
}

function getCardSkillId(
  card: { skillId?: unknown } | undefined,
  metadata: TeamBuilderPreferenceCardMetadata | undefined,
): number | null {
  const rawSkillId = card?.skillId ?? metadata?.skillId;
  const skillId = Number(rawSkillId);
  return Number.isFinite(skillId) && skillId > 0 ? Math.trunc(skillId) : null;
}

function getCardSkillEffectLabel(
  card: { skillId?: unknown; skillLevel?: unknown } | undefined,
  metadata: TeamBuilderPreferenceCardMetadata | undefined,
  skills: Record<string, TeamBuilderPreferenceSkillMaster | undefined> | undefined,
): string {
  const skillId = getCardSkillId(card, metadata);
  return normalizeBandoriSkillLabel(skillId ? skills?.[String(skillId)] : undefined, card?.skillLevel, 5);
}

function calculateProfileCardTotalPower(
  card: UserGameProfileCardRecord,
  metadata: TeamBuilderPreferenceCardMetadata | undefined,
  characters: Record<string, TeamBuilderPreferenceCharacterMaster | undefined>,
  characterBonusesById: Record<string, BandoriCharacterBonusState | undefined> = {},
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

export function buildPreferenceCardEntry(
  card: UserGameProfileCardRecord,
  cardMetadata: Record<string, TeamBuilderPreferenceCardMetadata | undefined>,
  characters: Record<string, TeamBuilderPreferenceCharacterMaster | undefined>,
  skills: Record<string, TeamBuilderPreferenceSkillMaster | undefined>,
  characterBonusesById: Record<string, BandoriCharacterBonusState | undefined>,
): TeamBuilderPreferenceCardEntry {
  const metadata = cardMetadata[String(card.cardId)];
  const characterId = Number(metadata?.characterId);
  const normalizedCharacterId = Number.isFinite(characterId) && characterId > 0 ? Math.trunc(characterId) : null;
  const bandId = getCardBandId(metadata, characters);
  const attribute = isKnownAttribute(metadata?.attribute) ? metadata.attribute : null;
  const rarity = Number(metadata?.rarity);
  const normalizedRarity = Number.isFinite(rarity) && rarity > 0 ? Math.trunc(rarity) : null;
  const cardName = pickGameProfileCardName(card.cardId, metadata);
  const characterName = getCardCharacterLabel(metadata, characters);
  const skillEffectLabel = getCardSkillEffectLabel(card, metadata, skills);
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
    skillEffectLabel,
    searchText: [
      card.cardId,
      cardName,
      characterName,
      skillEffectLabel,
      normalizedCharacterId,
      bandId,
      attribute,
      normalizedRarity,
      totalPower,
    ].join(" ").toLowerCase(),
  };
}

function buildPreferenceCardEntryCacheKey(
  dependencyVersion: string,
  card: UserGameProfileCardRecord,
  metadata: TeamBuilderPreferenceCardMetadata | undefined,
): string {
  return [
    dependencyVersion,
    card.cardId,
    card.level,
    card.masterRank,
    card.skillLevel,
    card.episodeCount,
    card.isTrained ? 1 : 0,
    card.hasTrainedArt ? 1 : 0,
    metadata?.characterId ?? "",
    metadata?.rarity ?? "",
    metadata?.attribute ?? "",
    metadata?.skillId ?? "",
    metadata?.levelLimit ?? "",
    metadata?.resourceSetName ?? "",
    metadata?.assetRegion ?? "",
    metadata?.displayName ?? "",
    metadata?.hasTrainedArt === undefined ? "" : metadata.hasTrainedArt ? 1 : 0,
    metadata?.stat?.training?.levelLimit ?? "",
    metadata?.releasedAt?.join(",") ?? "",
  ].join("|");
}

export function useTeamBuilderPreferenceCardEntries({
  cacheScopeKey,
  profileCards,
  cardMetadata,
  characters,
  skills,
  characterBonusesById,
}: {
  cacheScopeKey: string;
  profileCards: UserGameProfileCardRecord[];
  cardMetadata: Record<string, TeamBuilderPreferenceCardMetadata | undefined>;
  characters: Record<string, TeamBuilderPreferenceCharacterMaster | undefined>;
  skills: Record<string, TeamBuilderPreferenceSkillMaster | undefined>;
  characterBonusesById: Record<string, BandoriCharacterBonusState | undefined>;
}): { entries: TeamBuilderPreferenceCardEntry[]; ready: boolean } {
  const entryCacheRef = useRef(new Map<string, TeamBuilderPreferenceCardEntry>());
  const [state, setState] = useState<{ entries: TeamBuilderPreferenceCardEntry[]; ready: boolean }>({
    entries: [],
    ready: profileCards.length === 0,
  });
  const dependencyVersion = useMemo(() => [
    cacheScopeKey,
    Object.keys(cardMetadata).length,
    Object.keys(characters).length,
    Object.keys(skills).length,
    Object.keys(characterBonusesById).length,
  ].join(":"), [cacheScopeKey, cardMetadata, characterBonusesById, characters, skills]);

  useEffect(() => {
    entryCacheRef.current.clear();
  }, [cacheScopeKey, cardMetadata, characterBonusesById, characters, skills]);

  useEffect(() => {
    if (profileCards.length === 0) {
      setState({ entries: [], ready: true });
      return;
    }

    let canceled = false;
    let timer: number | null = null;
    let index = 0;
    const nextEntries: TeamBuilderPreferenceCardEntry[] = [];
    const entryCache = entryCacheRef.current;

    setState({ entries: [], ready: false });

    const buildChunk = () => {
      const endIndex = Math.min(index + PROFILE_CARD_ENTRY_BUILD_CHUNK_SIZE, profileCards.length);
      for (; index < endIndex; index += 1) {
        const card = profileCards[index];
        const metadata = cardMetadata[String(card.cardId)];
        const entryCacheKey = buildPreferenceCardEntryCacheKey(dependencyVersion, card, metadata);
        const cachedEntry = entryCache.get(entryCacheKey);
        if (cachedEntry) {
          nextEntries.push(cachedEntry);
          continue;
        }

        const entry = buildPreferenceCardEntry(card, cardMetadata, characters, skills, characterBonusesById);
        entryCache.set(entryCacheKey, entry);
        nextEntries.push(entry);
      }

      if (canceled) {
        return;
      }

      if (index < profileCards.length) {
        timer = window.setTimeout(buildChunk, 0);
        return;
      }

      setState({ entries: nextEntries, ready: true });
    };

    timer = window.setTimeout(buildChunk, 0);

    return () => {
      canceled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [cardMetadata, characterBonusesById, characters, dependencyVersion, profileCards, skills]);

  return state;
}
