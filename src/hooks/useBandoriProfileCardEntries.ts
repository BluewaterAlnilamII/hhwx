"use client";

import { useEffect, useRef, useState } from "react";
import { type AppLocale } from "@/i18n/routing";
import {
  buildBandoriProfileCardEntry,
  type BandoriProfileCardEntry,
} from "@/lib/bandori/cards/profile-card-collection";
import { type BandoriCharacterMaster, type BandoriSkillMaster } from "@/lib/bandori/cards/master";
import { type GameProfileCardMetadata } from "@/lib/bandori/cards/game-profile-card";
import { type BandoriServer } from "@/lib/bandori-server";
import { type BandoriCharacterBonusState } from "@/lib/bandori-team-calculator";
import { type UserGameProfileCardRecord } from "@/lib/user-game-profile-payload";
import { useBandoriPreferredServer } from "@/store/useBandoriPreferencesStore";

const PROFILE_CARD_ENTRY_BUILD_CHUNK_SIZE = 80;
const metadataCacheParts = new WeakMap<object, string>();
const characterCacheParts = new WeakMap<object, string>();
const skillCacheParts = new WeakMap<object, string>();
const bonusCacheParts = new WeakMap<object, string>();

function getNormalizedCharacterId(metadata: GameProfileCardMetadata | undefined): number | null {
  const characterId = Number(metadata?.characterId);
  return Number.isFinite(characterId) && characterId > 0 ? Math.trunc(characterId) : null;
}

function buildCachePart(value: unknown): string {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

function readCachedObjectPart<T extends object>(
  cache: WeakMap<object, string>,
  value: T | undefined,
  build: (item: T) => string,
): string {
  if (!value) return "";
  const cached = cache.get(value);
  if (cached !== undefined) return cached;
  const next = build(value);
  cache.set(value, next);
  return next;
}

function buildMetadataCachePart(metadata: GameProfileCardMetadata | undefined): string {
  return readCachedObjectPart(metadataCacheParts, metadata, (item) => [
    item.characterId ?? "",
    item.rarity ?? "",
    item.attribute ?? "",
    item.skillId ?? "",
    item.levelLimit ?? "",
    item.resourceSetName ?? "",
    item.displayName ?? "",
    item.hasTrainedArt === undefined ? "" : item.hasTrainedArt ? 1 : 0,
    buildCachePart(item.prefix),
    buildCachePart(item.stat),
    buildCachePart(item.releasedAt),
  ].join("|"));
}

function buildCharacterCachePart(
  metadata: GameProfileCardMetadata | undefined,
  characters: Record<string, BandoriCharacterMaster | undefined>,
): string {
  const characterId = getNormalizedCharacterId(metadata);
  const character = characterId === null ? undefined : characters[String(characterId)];
  return [
    characterId ?? "",
    readCachedObjectPart(characterCacheParts, character, (item) => [
      item.bandId ?? "",
      buildCachePart(item.nickname),
      buildCachePart(item.firstName),
      buildCachePart(item.characterName),
    ].join("|")),
  ].join("|");
}

function buildSkillCachePart(
  card: UserGameProfileCardRecord,
  metadata: GameProfileCardMetadata | undefined,
  skills: Record<string, BandoriSkillMaster | undefined>,
): string {
  const rawSkillId = metadata?.skillId;
  const skillId = Number.isFinite(Number(rawSkillId)) && Number(rawSkillId) > 0 ? Math.trunc(Number(rawSkillId)) : null;
  const skill = skillId === null ? undefined : skills[String(skillId)];
  return [
    skillId ?? "",
    card.skillLevel,
    readCachedObjectPart(skillCacheParts, skill, (item) => [
      buildCachePart(item.description),
      buildCachePart(item.simpleDescription),
      buildCachePart(item.duration),
      buildCachePart(item.onceEffect?.onceEffectValue),
    ].join("|")),
  ].join("|");
}

function buildBonusCachePart(bonus: BandoriCharacterBonusState | undefined): string {
  return readCachedObjectPart(bonusCacheParts, bonus, buildCachePart);
}

function buildEntryCacheKey(
  cacheScopeKey: string,
  locale: AppLocale,
  preferredServer: BandoriServer,
  displayServer: BandoriServer,
  card: UserGameProfileCardRecord,
  metadata: GameProfileCardMetadata | undefined,
  characters: Record<string, BandoriCharacterMaster | undefined>,
  skills: Record<string, BandoriSkillMaster | undefined>,
  characterBonusesById: Record<string, BandoriCharacterBonusState | undefined>,
): string {
  const characterId = getNormalizedCharacterId(metadata);
  return [
    cacheScopeKey,
    locale,
    preferredServer,
    displayServer,
    card.cardId,
    card.level,
    card.masterRank,
    card.skillLevel,
    card.episodeCount,
    card.isTrained ? 1 : 0,
    card.hasTrainedArt ? 1 : 0,
    card.isExcluded ? 1 : 0,
    buildMetadataCachePart(metadata),
    buildCharacterCachePart(metadata, characters),
    buildSkillCachePart(card, metadata, skills),
    characterId === null ? "" : buildBonusCachePart(characterBonusesById[String(characterId)]),
  ].join("|");
}

export function useBandoriProfileCardEntries({
  cacheScopeKey,
  isEnabled,
  locale,
  profileCards,
  cardMetadata,
  characters,
  skills,
  characterBonusesById,
  displayServer,
  unknownSkillLabel,
}: {
  cacheScopeKey: string;
  isEnabled: boolean;
  locale: AppLocale;
  profileCards: UserGameProfileCardRecord[];
  cardMetadata: Record<string, GameProfileCardMetadata | undefined>;
  characters: Record<string, BandoriCharacterMaster | undefined>;
  skills: Record<string, BandoriSkillMaster | undefined>;
  characterBonusesById: Record<string, BandoriCharacterBonusState | undefined>;
  displayServer: BandoriServer;
  unknownSkillLabel: string;
}): { entries: BandoriProfileCardEntry[]; isReady: boolean } {
  const preferredServer = useBandoriPreferredServer();
  const entryCacheRef = useRef(new Map<string, BandoriProfileCardEntry>());
  const cacheScopeKeyRef = useRef(cacheScopeKey);
  const [state, setState] = useState<{ entries: BandoriProfileCardEntry[]; isReady: boolean }>({
    entries: [],
    isReady: isEnabled && profileCards.length === 0,
  });

  useEffect(() => {
    const hasCacheScopeChanged = cacheScopeKeyRef.current !== cacheScopeKey;
    if (hasCacheScopeChanged) {
      cacheScopeKeyRef.current = cacheScopeKey;
      entryCacheRef.current.clear();
    }

    if (!isEnabled) {
      setState((current) => ({
        entries: hasCacheScopeChanged ? [] : current.entries,
        isReady: false,
      }));
      return;
    }
    if (profileCards.length === 0) {
      setState({ entries: [], isReady: true });
      return;
    }

    let isCanceled = false;
    let timer: number | null = null;
    let index = 0;
    const nextEntries: BandoriProfileCardEntry[] = [];
    const previousEntryCache = entryCacheRef.current;
    const nextEntryCache = new Map<string, BandoriProfileCardEntry>();

    setState((current) => ({
      entries: hasCacheScopeChanged ? [] : current.entries,
      isReady: false,
    }));

    const buildChunk = () => {
      const endIndex = Math.min(index + PROFILE_CARD_ENTRY_BUILD_CHUNK_SIZE, profileCards.length);
      for (; index < endIndex; index += 1) {
        const card = profileCards[index];
        const metadata = cardMetadata[String(card.cardId)];
        const cacheKey = buildEntryCacheKey(
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
        const cachedEntry = previousEntryCache.get(cacheKey);
        const entry = cachedEntry ?? buildBandoriProfileCardEntry(
          card,
          cardMetadata,
          characters,
          skills,
          characterBonusesById,
          locale,
          preferredServer,
          displayServer,
          unknownSkillLabel,
        );
        nextEntryCache.set(cacheKey, entry);
        nextEntries.push(entry);
      }

      if (isCanceled) return;
      if (index < profileCards.length) {
        timer = window.setTimeout(buildChunk, 0);
        return;
      }
      entryCacheRef.current = nextEntryCache;
      setState({ entries: nextEntries, isReady: true });
    };

    timer = window.setTimeout(buildChunk, 0);
    return () => {
      isCanceled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [
    cacheScopeKey,
    cardMetadata,
    characterBonusesById,
    characters,
    displayServer,
    isEnabled,
    locale,
    preferredServer,
    profileCards,
    skills,
    unknownSkillLabel,
  ]);

  return state;
}
