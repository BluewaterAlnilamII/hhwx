"use client";

import { useEffect, useRef, useState } from "react";
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
import { type AppLocale } from "@/i18n/routing";
import { pickGameProfileCardName } from "@/lib/bandori-game-profile-card";
import { pickBestdoriLocalizedName } from "@/lib/bestdori-regional-names";
import {
  DEFAULT_BANDORI_PREFERRED_SERVER,
  type BandoriServer,
} from "@/lib/bandori-server";
import { type UserGameProfileCardRecord } from "@/lib/user-game-profile-payload";
import { useBandoriPreferredServer } from "@/store/useBandoriPreferencesStore";

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

function pickLocalizedName(
  value: string[] | string | undefined,
  preferredServer: BandoriServer,
  contextServer: BandoriServer,
  fallback = "",
): string {
  if (typeof value === "string") {
    return value.trim() || fallback;
  }
  if (!Array.isArray(value)) {
    return fallback;
  }
  return pickBestdoriLocalizedName(value, preferredServer, contextServer) ?? fallback;
}

function pickCharacterDisplayName(
  character: TeamBuilderPreferenceCharacterMaster | undefined,
  preferredServer: BandoriServer,
  contextServer: BandoriServer,
  fallback = "",
): string {
  return pickLocalizedName(character?.nickname, preferredServer, contextServer)
    || pickLocalizedName(character?.characterName, preferredServer, contextServer)
    || pickLocalizedName(character?.firstName, preferredServer, contextServer)
    || fallback;
}

function getCardCharacterLabel(
  metadata: TeamBuilderPreferenceCardMetadata | undefined,
  characters: Record<string, TeamBuilderPreferenceCharacterMaster | undefined>,
  preferredServer: BandoriServer,
  contextServer: BandoriServer,
): string {
  const characterId = Number(metadata?.characterId);
  if (!Number.isFinite(characterId)) {
    return "";
  }
  const character = characters[String(Math.trunc(characterId))];
  return pickCharacterDisplayName(character, preferredServer, contextServer);
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
  preferredServer: BandoriServer,
  contextServer: BandoriServer,
): string {
  const skillId = getCardSkillId(card, metadata);
  return normalizeBandoriSkillLabel(
    skillId ? skills?.[String(skillId)] : undefined,
    card?.skillLevel,
    5,
    preferredServer,
    contextServer,
  );
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
  locale: AppLocale = "zh-CN",
  preferredServer: BandoriServer = DEFAULT_BANDORI_PREFERRED_SERVER,
  contextServer: BandoriServer = preferredServer,
): TeamBuilderPreferenceCardEntry {
  const metadata = cardMetadata[String(card.cardId)];
  const characterId = Number(metadata?.characterId);
  const normalizedCharacterId = Number.isFinite(characterId) && characterId > 0 ? Math.trunc(characterId) : null;
  const bandId = getCardBandId(metadata, characters);
  const attribute = isKnownAttribute(metadata?.attribute) ? metadata.attribute : null;
  const rarity = Number(metadata?.rarity);
  const normalizedRarity = Number.isFinite(rarity) && rarity > 0 ? Math.trunc(rarity) : null;
  const cardName = pickGameProfileCardName(
    card.cardId,
    metadata,
    preferredServer,
    locale,
    contextServer,
  );
  const characterName = getCardCharacterLabel(
    metadata,
    characters,
    preferredServer,
    contextServer,
  );
  const skillEffectLabel = getCardSkillEffectLabel(
    card,
    metadata,
    skills,
    preferredServer,
    contextServer,
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

function getNormalizedMetadataCharacterId(metadata: TeamBuilderPreferenceCardMetadata | undefined): number | null {
  const characterId = Number(metadata?.characterId);
  return Number.isFinite(characterId) && characterId > 0 ? Math.trunc(characterId) : null;
}

function buildCachePart(value: unknown): string {
  if (value === undefined) {
    return "";
  }

  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

function buildPreferenceCardMetadataCachePart(metadata: TeamBuilderPreferenceCardMetadata | undefined): string {
  return [
    metadata?.characterId ?? "",
    metadata?.rarity ?? "",
    metadata?.attribute ?? "",
    metadata?.skillId ?? "",
    metadata?.levelLimit ?? "",
    metadata?.resourceSetName ?? "",
    metadata?.displayName ?? "",
    metadata?.hasTrainedArt === undefined ? "" : metadata.hasTrainedArt ? 1 : 0,
    buildCachePart(metadata?.stat),
    buildCachePart(metadata?.releasedAt),
  ].join("|");
}

function buildPreferenceCardCharacterCachePart(
  metadata: TeamBuilderPreferenceCardMetadata | undefined,
  characters: Record<string, TeamBuilderPreferenceCharacterMaster | undefined>,
): string {
  const characterId = getNormalizedMetadataCharacterId(metadata);
  const character = characterId === null ? undefined : characters[String(characterId)];
  return [
    characterId ?? "",
    character?.bandId ?? "",
    buildCachePart(character?.nickname),
    buildCachePart(character?.firstName),
    buildCachePart(character?.characterName),
  ].join("|");
}

function buildPreferenceCardSkillCachePart(
  card: UserGameProfileCardRecord,
  metadata: TeamBuilderPreferenceCardMetadata | undefined,
  skills: Record<string, TeamBuilderPreferenceSkillMaster | undefined>,
): string {
  const skillId = getCardSkillId(undefined, metadata);
  const skill = skillId === null ? undefined : skills[String(skillId)];
  return [
    skillId ?? "",
    card.skillLevel,
    buildCachePart(skill?.description),
    buildCachePart(skill?.simpleDescription),
    buildCachePart(skill?.duration),
    buildCachePart(skill?.onceEffect?.onceEffectValue),
  ].join("|");
}

function buildPreferenceCardBonusCachePart(
  metadata: TeamBuilderPreferenceCardMetadata | undefined,
  characterBonusesById: Record<string, BandoriCharacterBonusState | undefined>,
): string {
  const characterId = getNormalizedMetadataCharacterId(metadata);
  return characterId === null ? "" : buildCachePart(characterBonusesById[String(characterId)]);
}

function buildPreferenceCardEntryCacheKey(
  cacheScopeKey: string,
  locale: AppLocale,
  preferredServer: BandoriServer,
  contextServer: BandoriServer,
  card: UserGameProfileCardRecord,
  metadata: TeamBuilderPreferenceCardMetadata | undefined,
  characters: Record<string, TeamBuilderPreferenceCharacterMaster | undefined>,
  skills: Record<string, TeamBuilderPreferenceSkillMaster | undefined>,
  characterBonusesById: Record<string, BandoriCharacterBonusState | undefined>,
): string {
  return [
    cacheScopeKey,
    locale,
    preferredServer,
    contextServer,
    card.cardId,
    card.level,
    card.masterRank,
    card.skillLevel,
    card.episodeCount,
    card.isTrained ? 1 : 0,
    card.hasTrainedArt ? 1 : 0,
    card.isExcluded ? 1 : 0,
    buildPreferenceCardMetadataCachePart(metadata),
    buildPreferenceCardCharacterCachePart(metadata, characters),
    buildPreferenceCardSkillCachePart(card, metadata, skills),
    buildPreferenceCardBonusCachePart(metadata, characterBonusesById),
  ].join("|");
}

export function useTeamBuilderPreferenceCardEntries({
  cacheScopeKey,
  locale,
  profileCards,
  cardMetadata,
  characters,
  skills,
  characterBonusesById,
  displayServer,
}: {
  cacheScopeKey: string;
  locale: AppLocale;
  profileCards: UserGameProfileCardRecord[];
  cardMetadata: Record<string, TeamBuilderPreferenceCardMetadata | undefined>;
  characters: Record<string, TeamBuilderPreferenceCharacterMaster | undefined>;
  skills: Record<string, TeamBuilderPreferenceSkillMaster | undefined>;
  characterBonusesById: Record<string, BandoriCharacterBonusState | undefined>;
  displayServer: BandoriServer;
}): { entries: TeamBuilderPreferenceCardEntry[]; ready: boolean } {
  const preferredServer = useBandoriPreferredServer();
  const entryCacheRef = useRef(new Map<string, TeamBuilderPreferenceCardEntry>());
  const cacheScopeKeyRef = useRef(cacheScopeKey);
  const [state, setState] = useState<{ entries: TeamBuilderPreferenceCardEntry[]; ready: boolean }>({
    entries: [],
    ready: profileCards.length === 0,
  });

  useEffect(() => {
    const cacheScopeChanged = cacheScopeKeyRef.current !== cacheScopeKey;
    if (cacheScopeChanged) {
      cacheScopeKeyRef.current = cacheScopeKey;
      entryCacheRef.current.clear();
    }

    if (profileCards.length === 0) {
      setState({ entries: [], ready: true });
      return;
    }

    let canceled = false;
    let timer: number | null = null;
    let index = 0;
    const nextEntries: TeamBuilderPreferenceCardEntry[] = [];
    const previousEntryCache = entryCacheRef.current;
    const nextEntryCache = new Map<string, TeamBuilderPreferenceCardEntry>();

    // Keep same-profile entries visible while changed metadata is rebuilt in chunks.
    setState((current) => ({
      entries: cacheScopeChanged ? [] : current.entries,
      ready: false,
    }));

    const buildChunk = () => {
      const endIndex = Math.min(index + PROFILE_CARD_ENTRY_BUILD_CHUNK_SIZE, profileCards.length);
      for (; index < endIndex; index += 1) {
        const card = profileCards[index];
        const metadata = cardMetadata[String(card.cardId)];
        const entryCacheKey = buildPreferenceCardEntryCacheKey(
          cacheScopeKey,
          locale,
          preferredServer,
          displayServer,
          card,
          metadata,
          characters,
          skills,
          characterBonusesById,
        );
        const cachedEntry = previousEntryCache.get(entryCacheKey);
        if (cachedEntry) {
          nextEntryCache.set(entryCacheKey, cachedEntry);
          nextEntries.push(cachedEntry);
          continue;
        }

        const entry = buildPreferenceCardEntry(
          card,
          cardMetadata,
          characters,
          skills,
          characterBonusesById,
          locale,
          preferredServer,
          displayServer,
        );
        nextEntryCache.set(entryCacheKey, entry);
        nextEntries.push(entry);
      }

      if (canceled) {
        return;
      }

      if (index < profileCards.length) {
        timer = window.setTimeout(buildChunk, 0);
        return;
      }

      entryCacheRef.current = nextEntryCache;
      setState({ entries: nextEntries, ready: true });
    };

    timer = window.setTimeout(buildChunk, 0);

    return () => {
      canceled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [
    cacheScopeKey,
    cardMetadata,
    characterBonusesById,
    characters,
    displayServer,
    locale,
    preferredServer,
    profileCards,
    skills,
  ]);

  return state;
}
