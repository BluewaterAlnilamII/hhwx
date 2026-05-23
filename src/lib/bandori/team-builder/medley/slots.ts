/*
 * Slot-level preparation and exact single-slot helpers for medley search.
 *
 * A slot is one song in the three-song medley. This module builds the shared-card search
 * view for each slot, prunes dominated slot cards, and solves constrained single-slot teams.
 */

import { getMedleyTeamEvaluationCacheKey } from "./candidates";
import { MEDLEY_TEAM_COUNT } from "./constants";
import { estimateMedleyRemainingScoreUpperBound } from "./upper/capacity";
import { estimateMedleySlotBranchScoreUpperBound } from "./upper/skill-context";
import {
  CHARACTER_MASK_SEGMENT_BITS,
  buildCharacterUpperBoundIndex,
  buildSearchCardSkillRateProfiles,
  buildSearchCardsForConfiguration,
  calculateBaseScoreRatePerPower,
  estimateSearchScopeScoreUpperBound,
  evaluateTeam,
  getCachedPreparedChart,
  hasCharacterIndexInMask,
  sortSearchCardsForTraversal,
} from "@/lib/bandori/team-builder/core";
import type {
  BandoriMedleySongSearchInput,
  BandoriMedleyTeamSearchInput,
  BandoriMedleyTeamSearchProfilingStats,
  BandoriMedleyTeamSearchStats,
  MedleyBestSlotTeamCacheEntry,
  MedleySlotAvailability,
  MedleySlotSearch,
  MedleyTeamCandidate,
} from "./types";
import type { CalculatedBandoriCard } from "@/lib/bandori-team-calculator";
import type {
  BandoriAreaItemConfiguration,
  BandoriTeamSearchInput,
  SearchCard,
} from "@/lib/bandori/team-builder/core";

export function createMedleySlotInput(
  input: BandoriMedleyTeamSearchInput,
  songInput: BandoriMedleySongSearchInput,
): BandoriTeamSearchInput {
  const { songs, target, ...commonInput } = input;
  void songs;
  void target;
  return {
    ...commonInput,
    chart: songInput.chart,
    chartCacheKey: songInput.chartCacheKey,
    song: songInput.song,
    difficulty: songInput.difficulty,
    // Medley lives do not have fever sections, regardless of caller-provided song flags.
    eventType: "medley",
    useFever: false,
    liveType: "free",
    target: "score",
    useSpecialRoomBonus: false,
  };
}

export function estimateMedleySlotAvailability(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
  useContextualSkillUpper = false,
): MedleySlotAvailability {
  const availableCharacterIds = new Set<number>();
  let availableCardCount = 0;
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId)) {
      continue;
    }
    availableCardCount += 1;
    availableCharacterIds.add(card.characterId);
  }

  return {
    availableCardCount,
    availableCharacterCount: availableCharacterIds.size,
    scoreUpperBound: estimateMedleySlotBranchScoreUpperBound(
      slot,
      [],
      0,
      bannedCardIds,
      0,
      0,
      0,
      profiling,
      useContextualSkillUpper,
    ),
  };
}

export function chooseNextMedleySlotIndex(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  getMinimumScore?: (slotIndex: number) => number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
  useContextualSkillUpper = false,
): number {
  let selectedSlotIndex = remainingSlotIndices[0] ?? 0;
  let selectedAvailability: MedleySlotAvailability | null = null;
  let selectedSlack = Number.POSITIVE_INFINITY;

  for (const slotIndex of remainingSlotIndices) {
    const availability = estimateMedleySlotAvailability(slots[slotIndex], bannedCardIds, profiling, useContextualSkillUpper);
    const minimumScore = getMinimumScore?.(slotIndex) ?? Number.NEGATIVE_INFINITY;
    const slack = availability.scoreUpperBound - minimumScore;
    if (
      !selectedAvailability
      || availability.availableCharacterCount < selectedAvailability.availableCharacterCount
      || (
        getMinimumScore
        && availability.availableCharacterCount === selectedAvailability.availableCharacterCount
        && slack < selectedSlack
      )
      || (
        availability.availableCharacterCount === selectedAvailability.availableCharacterCount
        && (!getMinimumScore || slack === selectedSlack)
        && availability.availableCardCount < selectedAvailability.availableCardCount
      )
      || (
        availability.availableCharacterCount === selectedAvailability.availableCharacterCount
        && (!getMinimumScore || slack === selectedSlack)
        && availability.availableCardCount === selectedAvailability.availableCardCount
        && availability.scoreUpperBound > selectedAvailability.scoreUpperBound
      )
    ) {
      selectedSlotIndex = slotIndex;
      selectedAvailability = availability;
      selectedSlack = slack;
    }
  }

  return selectedSlotIndex;
}

export function getMedleyDominanceVector(card: SearchCard): number[] {
  return [
    card.effectivePower,
    card.skillUpperRate,
    card.skillAverageRate,
    card.skillLeaderRate,
    card.skillSameBandAverageRate,
    card.skillSameBandLeaderRate,
    card.skillSameAttributeAverageRate,
    card.skillSameAttributeLeaderRate,
    card.skillBothAverageRate,
    card.skillBothLeaderRate,
    card.skillMixedAverageRate,
    card.skillMixedLeaderRate,
  ];
}

export function medleyCardDominatesInSlot(
  leftCardId: number,
  leftCard: SearchCard,
  rightCardId: number,
  rightCard: SearchCard,
): boolean {
  let strictlyGreater = false;
  const leftVector = getMedleyDominanceVector(leftCard);
  const rightVector = getMedleyDominanceVector(rightCard);
  for (let valueIndex = 0; valueIndex < leftVector.length; valueIndex += 1) {
    const delta = leftVector[valueIndex] - rightVector[valueIndex];
    if (delta < -0.000001) {
      return false;
    }
    if (delta > 0.000001) {
      strictlyGreater = true;
    }
  }
  return strictlyGreater || leftCardId < rightCardId;
}

export function pruneDominatedMedleySlotCards(slots: MedleySlotSearch[]): MedleySlotSearch[] {
  if (slots.length !== MEDLEY_TEAM_COUNT) {
    return slots;
  }

  const cardsById = new Map<number, SearchCard[]>();
  for (const slot of slots) {
    for (const card of slot.searchCards) {
      const records = cardsById.get(card.cardId) ?? [];
      records[slot.songIndex] = card;
      cardsById.set(card.cardId, records);
    }
  }

  const completeCardsById = [...cardsById.entries()]
    .filter((entry): entry is [number, SearchCard[]] => entry[1].filter(Boolean).length === MEDLEY_TEAM_COUNT);
  const entriesByCharacter = new Map<number, Array<[number, SearchCard[]]>>();
  for (const entry of completeCardsById) {
    const characterId = entry[1][0].characterId;
    const entries = entriesByCharacter.get(characterId) ?? [];
    entries.push(entry);
    entriesByCharacter.set(characterId, entries);
  }

  const removedCardIds = new Set<number>();
  for (const entries of entriesByCharacter.values()) {
    if (entries.length <= MEDLEY_TEAM_COUNT) {
      continue;
    }
    for (const [cardId, cards] of entries) {
      let isDominatedInEverySlot = true;
      for (let slotIndex = 0; slotIndex < MEDLEY_TEAM_COUNT; slotIndex += 1) {
        let dominatorCount = 0;
        for (const [otherCardId, otherCards] of entries) {
          if (otherCardId === cardId) {
            continue;
          }
          if (medleyCardDominatesInSlot(otherCardId, otherCards[slotIndex], cardId, cards[slotIndex])) {
            dominatorCount += 1;
            if (dominatorCount >= MEDLEY_TEAM_COUNT) {
              break;
            }
          }
        }
        if (dominatorCount < MEDLEY_TEAM_COUNT) {
          isDominatedInEverySlot = false;
          break;
        }
      }
      if (isDominatedInEverySlot) {
        removedCardIds.add(cardId);
      }
    }
  }

  if (removedCardIds.size === 0) {
    return slots;
  }

  return slots.map((slot) => {
    const searchCards = slot.searchCards.filter((card) => !removedCardIds.has(card.cardId));
    return rebuildMedleySlotWithSearchCards(slot, searchCards);
  });
}

export function getMedleyCharacterMask(
  slot: MedleySlotSearch,
  card: SearchCard,
): { low: number; high: number } | null {
  const characterIndex = slot.upperBoundIndex.characterIndexById.get(card.characterId);
  if (characterIndex === undefined) {
    return null;
  }
  if (characterIndex < CHARACTER_MASK_SEGMENT_BITS) {
    return {
      low: 1 << characterIndex,
      high: 0,
    };
  }
  return {
    low: 0,
    high: 1 << (characterIndex - CHARACTER_MASK_SEGMENT_BITS),
  };
}

export function estimateMedleyForcedCardScoreUpperBound(
  slots: MedleySlotSearch[],
  slotIndex: number,
  cardId: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): number {
  const slot = slots[slotIndex];
  const card = slot.searchCards.find((searchCard) => searchCard.cardId === cardId);
  if (!card) {
    return Number.NEGATIVE_INFINITY;
  }
  const characterMask = getMedleyCharacterMask(slot, card);
  if (!characterMask) {
    return Number.NEGATIVE_INFINITY;
  }
  const bannedCardIds = new Set<number>([cardId]);
  const forcedSlotUpperBound = estimateMedleySlotBranchScoreUpperBound(
    slot,
    [card],
    0,
    bannedCardIds,
    characterMask.low,
    characterMask.high,
    card.effectivePower,
    profiling,
    true,
  );
  if (!Number.isFinite(forcedSlotUpperBound)) {
    return Number.NEGATIVE_INFINITY;
  }
  const remainingSlotIndices = slots
    .map((_, index) => index)
    .filter((index) => index !== slotIndex);
  const remainingUpperBound = estimateMedleyRemainingScoreUpperBound(
    slots,
    remainingSlotIndices,
    bannedCardIds,
    profiling,
    true,
    true,
    false,
    false,
    false,
  );
  return Number.isFinite(remainingUpperBound)
    ? forcedSlotUpperBound + remainingUpperBound
    : Number.NEGATIVE_INFINITY;
}

export function pruneMedleyCardsByInclusionUpper(
  slots: MedleySlotSearch[],
  threshold: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): MedleySlotSearch[] {
  if (slots.length !== MEDLEY_TEAM_COUNT || !Number.isFinite(threshold)) {
    return slots;
  }

  const cardIds = [...new Set(slots.flatMap((slot) => slot.searchCards.map((card) => card.cardId)))];
  profiling.inclusionUpperAnalysisCount += cardIds.length;
  const removedCardIds = new Set<number>();
  for (const cardId of cardIds) {
    let forcedUpperBound = Number.NEGATIVE_INFINITY;
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      forcedUpperBound = Math.max(
        forcedUpperBound,
        estimateMedleyForcedCardScoreUpperBound(slots, slotIndex, cardId, profiling),
      );
    }
    if (forcedUpperBound < threshold) {
      removedCardIds.add(cardId);
    }
  }

  if (removedCardIds.size === 0) {
    return slots;
  }
  profiling.inclusionUpperPrunedCardCount += removedCardIds.size;
  return slots.map((slot) => {
    const searchCards = slot.searchCards.filter((card) => !removedCardIds.has(card.cardId));
    return rebuildMedleySlotWithSearchCards(slot, searchCards);
  });
}

export function rebuildMedleySlotWithSearchCards(slot: MedleySlotSearch, searchCards: SearchCard[]): MedleySlotSearch {
  const upperBoundIndex = buildCharacterUpperBoundIndex(searchCards);
  return {
    ...slot,
    searchCards,
    upperBoundIndex,
    rootScoreUpperBound: estimateSearchScopeScoreUpperBound(
      [],
      upperBoundIndex,
      searchCards,
      0,
      0,
      0,
      slot.baseScoreRatePerPower,
    ),
    teamEvaluationCache: new Map(),
  };
}

export function enumerateMedleySlotTeams(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  getMinimumScore: (selectedCards: SearchCard[]) => number,
  observeUpperBound: (upperBound: number) => void,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  onTeam: (candidate: MedleyTeamCandidate) => void,
  useContextualSkillUpper = false,
): void {
  const selectedCards: SearchCard[] = [];
  let selectedPower = 0;
  let usedCharacterMaskLow = 0;
  let usedCharacterMaskHigh = 0;

  const visit = (startIndex: number): void => {
    if (stats.timedOut || isPastDeadline()) {
      stats.isExhaustive = false;
      stats.timedOut = true;
      stats.searchMode = "bounded";
      return;
    }

    const remaining = 5 - selectedCards.length;
    if (remaining === 0) {
      stats.enumeratedTeamCount += 1;
      const cacheKey = getMedleyTeamEvaluationCacheKey(selectedCards);
      let result = slot.teamEvaluationCache.get(cacheKey);
      if (!slot.teamEvaluationCache.has(cacheKey)) {
        profiling.teamEvaluationCacheMissCount += 1;
        result = evaluateTeam({
          cards: selectedCards,
          input: slot.input,
          chart: slot.chart,
          configuration: slot.configuration,
          server,
          perfectRate,
          scoreCache: slot.scoreCache,
          comboOptions: slot.comboOptions,
        });
        slot.teamEvaluationCache.set(cacheKey, result);
        stats.evaluatedTeamCount += 1;
      } else {
        profiling.teamEvaluationCacheHitCount += 1;
      }
      if (result && result.score >= getMinimumScore(selectedCards)) {
        onTeam({
          result,
          cards: [...selectedCards],
          cardIds: selectedCards.map((card) => card.cardId),
        });
      }
      return;
    }

    if (slot.searchCards.length - startIndex < remaining) {
      return;
    }

    const minimumScore = getMinimumScore(selectedCards);
    const contextBranchScoreUpperBound = estimateSearchScopeScoreUpperBound(
      selectedCards,
      slot.upperBoundIndex,
      slot.searchCards,
      startIndex,
      usedCharacterMaskLow,
      usedCharacterMaskHigh,
      slot.baseScoreRatePerPower,
      undefined,
      selectedPower,
    );
    if (!Number.isFinite(contextBranchScoreUpperBound) || contextBranchScoreUpperBound < minimumScore) {
      stats.prunedBranchCount += 1;
      return;
    }
    const bannedAwareBranchScoreUpperBound = estimateMedleySlotBranchScoreUpperBound(
      slot,
      selectedCards,
      startIndex,
      bannedCardIds,
      usedCharacterMaskLow,
      usedCharacterMaskHigh,
      selectedPower,
      profiling,
      useContextualSkillUpper,
    );
    const branchScoreUpperBound = Math.min(contextBranchScoreUpperBound, bannedAwareBranchScoreUpperBound);
    if (!Number.isFinite(branchScoreUpperBound) || branchScoreUpperBound < minimumScore) {
      stats.prunedBranchCount += 1;
      return;
    }
    observeUpperBound(branchScoreUpperBound);

    for (let index = startIndex; index < slot.searchCards.length; index += 1) {
      const card = slot.searchCards[index];
      if (bannedCardIds.has(card.cardId)) {
        continue;
      }
      const characterIndex = slot.upperBoundIndex.characterIndexById.get(card.characterId);
      if (characterIndex === undefined || hasCharacterIndexInMask(usedCharacterMaskLow, usedCharacterMaskHigh, characterIndex)) {
        continue;
      }
      const isLowCharacterMask = characterIndex < CHARACTER_MASK_SEGMENT_BITS;
      const characterBit = isLowCharacterMask
        ? 1 << characterIndex
        : 1 << (characterIndex - CHARACTER_MASK_SEGMENT_BITS);

      selectedCards.push(card);
      selectedPower += card.effectivePower;
      if (isLowCharacterMask) {
        usedCharacterMaskLow |= characterBit;
      } else {
        usedCharacterMaskHigh |= characterBit;
      }
      visit(index + 1);
      if (isLowCharacterMask) {
        usedCharacterMaskLow &= ~characterBit;
      } else {
        usedCharacterMaskHigh &= ~characterBit;
      }
      selectedPower -= card.effectivePower;
      selectedCards.pop();
      if (stats.timedOut) {
        return;
      }
    }
  };

  visit(0);
}

export function findBestMedleySlotTeam(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  observeUpperBound: (upperBound: number) => void,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  minimumScore = Number.NEGATIVE_INFINITY,
  useContextualSkillUpper = false,
): MedleyTeamCandidate | null {
  let best: MedleyTeamCandidate | null = null;
  enumerateMedleySlotTeams(
    slot,
    bannedCardIds,
    server,
    perfectRate,
    stats,
    isPastDeadline,
    () => Math.max(best?.result.score ?? Number.NEGATIVE_INFINITY, minimumScore),
    observeUpperBound,
    profiling,
    (candidate) => {
      if (!best || candidate.result.score > best.result.score) {
        best = candidate;
      }
    },
    useContextualSkillUpper,
  );
  return best;
}

export function getMedleyBestSlotTeamCacheKey(slotIndex: number, bannedCardIds: Set<number>): string {
  return `${slotIndex}:${[...bannedCardIds].sort((left, right) => left - right).join(",")}`;
}

export function findBestMedleySlotTeamWithCache(
  cache: Map<string, MedleyBestSlotTeamCacheEntry>,
  slotIndex: number,
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  observeUpperBound: (upperBound: number) => void,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  minimumScore = Number.NEGATIVE_INFINITY,
  useContextualSkillUpper = false,
): MedleyTeamCandidate | null {
  const key = getMedleyBestSlotTeamCacheKey(slotIndex, bannedCardIds);
  const cached = cache.get(key);
  if (cached) {
    profiling.bestSlotTeamCacheHitCount += 1;
    return (cached.candidate?.result.score ?? Number.NEGATIVE_INFINITY) >= minimumScore
      ? cached.candidate
      : null;
  }
  profiling.bestSlotTeamCacheMissCount += 1;

  const shouldCache = !Number.isFinite(minimumScore);
  const candidate = findBestMedleySlotTeam(
    slot,
    bannedCardIds,
    server,
    perfectRate,
    stats,
    isPastDeadline,
    observeUpperBound,
    profiling,
    minimumScore,
    useContextualSkillUpper,
  );
  if (shouldCache && !stats.timedOut) {
    cache.set(key, { candidate });
  }
  return candidate;
}

export function estimateRelaxedMedleyRemainingBestScoreUpperBound(
  cache: Map<string, MedleyBestSlotTeamCacheEntry>,
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  useContextualSkillUpper = false,
): number {
  let upperBound = 0;
  for (const slotIndex of remainingSlotIndices) {
    const candidate = findBestMedleySlotTeamWithCache(
      cache,
      slotIndex,
      slots[slotIndex],
      bannedCardIds,
      server,
      perfectRate,
      stats,
      isPastDeadline,
      () => undefined,
      profiling,
      Number.NEGATIVE_INFINITY,
      useContextualSkillUpper,
    );
    if (stats.timedOut) {
      return Number.NEGATIVE_INFINITY;
    }
    if (!candidate) {
      return Number.NEGATIVE_INFINITY;
    }
    upperBound += candidate.result.score;
  }
  return upperBound;
}

export function buildMedleySlotSearches(
  input: BandoriMedleyTeamSearchInput,
  songInputs: BandoriMedleySongSearchInput[],
  calculatedCards: CalculatedBandoriCard[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
): MedleySlotSearch[] {
  let startCombo = 0;
  // Medley combo is sequential: slot N starts from the total note count of all previous slots.
  // The per-slot card/search-card construction still comes from shared single-search helpers.
  return songInputs.map((songInput, songIndex) => {
    const slotInput = createMedleySlotInput(input, songInput);
    const chart = getCachedPreparedChart(slotInput);
    const comboOptions = {
      startCombo,
      useMedleyCombo: true,
    };
    const baseScoreRatePerPower = calculateBaseScoreRatePerPower(chart, comboOptions);
    const skillRateProfiles = buildSearchCardSkillRateProfiles(
      calculatedCards,
      slotInput,
      chart,
      server,
      comboOptions,
    );
    const searchCards = sortSearchCardsForTraversal(
      buildSearchCardsForConfiguration(calculatedCards, slotInput, configuration, server, skillRateProfiles),
      baseScoreRatePerPower,
    );
    const upperBoundIndex = buildCharacterUpperBoundIndex(searchCards);
    const rootScoreUpperBound = estimateSearchScopeScoreUpperBound(
      [],
      upperBoundIndex,
      searchCards,
      0,
      0,
      0,
      baseScoreRatePerPower,
    );
    const slot: MedleySlotSearch = {
      songIndex,
      startCombo,
      chart,
      input: slotInput,
      configuration,
      searchCards,
      upperBoundIndex,
      baseScoreRatePerPower,
      rootScoreUpperBound,
      scoreCache: {
        skillMultiplierLists: new Map(),
        noFloorSkillRates: new Map(),
      },
      comboOptions,
      teamEvaluationCache: new Map(),
    };
    startCombo += chart.notesCount;
    return slot;
  });
}
