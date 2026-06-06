/*
 * Local fixed-card and card-pool improvement passes for medley search.
 *
 * These routines refine already discovered medley teams under the same shared area config.
 * They are incumbent improvers, not global proof mechanisms.
 */

import { getMedleyTeamEvaluationCacheKey } from "./candidates";
import { MEDLEY_TEAM_COUNT, MEDLEY_TEAM_SIZE } from "./constants";
import { buildMedleyResult } from "./results";
import { evaluateTeam } from "@/lib/bandori/team-builder/core";
import { getCardInstanceKeys } from "@/lib/bandori/team-builder/core/card-identity";
import type {
  BandoriMedleyTeamSearchProfilingStats,
  BandoriMedleyTeamSearchResult,
  BandoriMedleyTeamSearchStats,
  FixedMedleyCardSetMaskEntry,
  MedleyFixedCardSetOptimizationCacheEntry,
  MedleySlotSearch,
  MedleyTeamCandidate,
} from "./types";
import type { BandoriAreaItemConfiguration, SearchCard } from "@/lib/bandori/team-builder/core";

export const fixedMedleyCardSetMaskCache = new Map<number, number[]>();

export const fixedMedleyCardSetMaskEntryCache = new Map<number, FixedMedleyCardSetMaskEntry[]>();

export function getFixedMedleyCardSetMasks(cardCount: number): number[] {
  const cached = fixedMedleyCardSetMaskCache.get(cardCount);
  if (cached) {
    return cached;
  }

  const masks: number[] = [];
  const visit = (startIndex: number, remaining: number, mask: number): void => {
    if (remaining === 0) {
      masks.push(mask);
      return;
    }
    for (let index = startIndex; index <= cardCount - remaining; index += 1) {
      visit(index + 1, remaining - 1, mask | (1 << index));
    }
  };
  visit(0, MEDLEY_TEAM_SIZE, 0);
  fixedMedleyCardSetMaskCache.set(cardCount, masks);
  return masks;
}

export function getFixedMedleyCardSetMaskEntries(cardCount: number): FixedMedleyCardSetMaskEntry[] {
  const cached = fixedMedleyCardSetMaskEntryCache.get(cardCount);
  if (cached) {
    return cached;
  }
  const entries = getFixedMedleyCardSetMasks(cardCount).map((mask) => {
    const indices: number[] = [];
    for (let index = 0; index < cardCount; index += 1) {
      if ((mask & (1 << index)) !== 0) {
        indices.push(index);
      }
    }
    return {
      mask,
      indices: indices as [number, number, number, number, number],
    };
  });
  fixedMedleyCardSetMaskEntryCache.set(cardCount, entries);
  return entries;
}

export function getFixedMedleyCardSetCacheKey(cardIds: number[]): string {
  return [...cardIds].sort((left, right) => left - right).join(",");
}

export function getCardsForFixedMedleyMaskIndices(
  cards: SearchCard[],
  indices: readonly [number, number, number, number, number],
): SearchCard[] {
  return [
    cards[indices[0]],
    cards[indices[1]],
    cards[indices[2]],
    cards[indices[3]],
    cards[indices[4]],
  ];
}

export function hasUniqueFixedMedleyCharacters(
  characterIds: readonly number[],
  indices: readonly [number, number, number, number, number],
): boolean {
  const first = characterIds[indices[0]];
  const second = characterIds[indices[1]];
  const third = characterIds[indices[2]];
  const fourth = characterIds[indices[3]];
  const fifth = characterIds[indices[4]];
  return first !== second
    && first !== third
    && first !== fourth
    && first !== fifth
    && second !== third
    && second !== fourth
    && second !== fifth
    && third !== fourth
    && third !== fifth
    && fourth !== fifth;
}

export function evaluateFixedMedleyMaskCandidate(
  slot: MedleySlotSearch,
  selectedCards: SearchCard[],
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): MedleyTeamCandidate | null {
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

  return result
    ? {
      result,
      cards: selectedCards,
      cardIds: selectedCards.map((card) => card.cardId),
      cardInstanceKeys: getCardInstanceKeys(selectedCards),
    }
    : null;
}

export function compareMedleyTeamCandidates(
  left: MedleyTeamCandidate | null,
  right: MedleyTeamCandidate | null,
): MedleyTeamCandidate | null {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return right.result.score > left.result.score
    || (right.result.score === left.result.score && right.result.maxScore > left.result.maxScore)
    ? right
    : left;
}

export function optimizeMedleyCardPool(
  cardIds: number[],
  slots: MedleySlotSearch[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): BandoriMedleyTeamSearchResult | null {
  if (
    slots.length !== MEDLEY_TEAM_COUNT
    || cardIds.length < MEDLEY_TEAM_COUNT * MEDLEY_TEAM_SIZE
    || cardIds.length > 18
  ) {
    return null;
  }
  if (new Set(cardIds).size !== cardIds.length) {
    return null;
  }

  const slotCards = slots.map((slot) => {
    const cardsById = new Map(slot.searchCards.map((card) => [card.cardId, card]));
    return cardIds.map((cardId) => cardsById.get(cardId) ?? null);
  });
  if (slotCards.some((cards) => cards.some((card) => card === null))) {
    return null;
  }

  const maskEntries = getFixedMedleyCardSetMaskEntries(cardIds.length);
  const characterIds = (slotCards[0] as SearchCard[]).map((card) => card.characterId);
  const validMaskEntries = maskEntries.filter(({ indices }) => hasUniqueFixedMedleyCharacters(characterIds, indices));
  const candidatesBySlot = slotCards.map((cards, slotIndex) => {
    const typedCards = cards as SearchCard[];
    const candidates: Array<{ mask: number; candidate: MedleyTeamCandidate }> = [];
    for (const { mask, indices } of validMaskEntries) {
      const candidate = evaluateFixedMedleyMaskCandidate(
        slots[slotIndex],
        getCardsForFixedMedleyMaskIndices(typedCards, indices),
        server,
        perfectRate,
        stats,
        profiling,
      );
      if (candidate) {
        candidates.push({ mask, candidate });
      }
    }
    return candidates.sort((left, right) => right.candidate.result.score - left.candidate.result.score);
  });

  const fullMask = (1 << cardIds.length) - 1;
  const bestThirdByAvailableMask: Array<MedleyTeamCandidate | null> = Array.from(
    { length: fullMask + 1 },
    () => null,
  );
  for (const { mask, candidate } of candidatesBySlot[2]) {
    bestThirdByAvailableMask[mask] = compareMedleyTeamCandidates(bestThirdByAvailableMask[mask], candidate);
  }
  for (let bitIndex = 0; bitIndex < cardIds.length; bitIndex += 1) {
    const bit = 1 << bitIndex;
    for (let mask = 0; mask <= fullMask; mask += 1) {
      if ((mask & bit) !== 0) {
        bestThirdByAvailableMask[mask] = compareMedleyTeamCandidates(
          bestThirdByAvailableMask[mask],
          bestThirdByAvailableMask[mask ^ bit],
        );
      }
    }
  }

  let bestResult: BandoriMedleyTeamSearchResult | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  const bestSecondScore = candidatesBySlot[1][0]?.candidate.result.score ?? Number.NEGATIVE_INFINITY;
  const bestThirdScore = candidatesBySlot[2][0]?.candidate.result.score ?? Number.NEGATIVE_INFINITY;
  for (const { mask: firstMask, candidate: firstCandidate } of candidatesBySlot[0]) {
    if (firstCandidate.result.score + bestSecondScore + bestThirdScore < bestScore) {
      break;
    }
    for (const { mask: secondMask, candidate: secondCandidate } of candidatesBySlot[1]) {
      if (firstCandidate.result.score + secondCandidate.result.score + bestThirdScore < bestScore) {
        break;
      }
      if ((firstMask & secondMask) !== 0) {
        continue;
      }
      const thirdCandidate = bestThirdByAvailableMask[fullMask ^ firstMask ^ secondMask];
      if (!thirdCandidate) {
        continue;
      }
      const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
      selectedBySong[slots[0].songIndex] = firstCandidate;
      selectedBySong[slots[1].songIndex] = secondCandidate;
      selectedBySong[slots[2].songIndex] = thirdCandidate;
      const result = buildMedleyResult(slots, selectedBySong, configuration);
      if (
        result
        && (
          !bestResult
          || result.score > bestResult.score
          || (result.score === bestResult.score && result.maxScore > bestResult.maxScore)
        )
      ) {
        bestResult = result;
        bestScore = result.score;
      }
    }
  }

  return bestResult;
}

export function optimizeFixedMedleyCardSet(
  cardIds: number[],
  slots: MedleySlotSearch[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): BandoriMedleyTeamSearchResult | null {
  profiling.fixedCardSetOptimizationCount += 1;
  if (cardIds.length !== MEDLEY_TEAM_COUNT * MEDLEY_TEAM_SIZE) {
    return null;
  }
  return optimizeMedleyCardPool(
    cardIds,
    slots,
    configuration,
    server,
    perfectRate,
    stats,
    profiling,
  );
}

export function optimizeFixedMedleyCardSetWithCache(
  cache: Map<string, MedleyFixedCardSetOptimizationCacheEntry>,
  cardIds: number[],
  slots: MedleySlotSearch[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): BandoriMedleyTeamSearchResult | null {
  const key = getFixedMedleyCardSetCacheKey(cardIds);
  const cached = cache.get(key);
  if (cached) {
    profiling.fixedCardSetOptimizationCacheHitCount += 1;
    return cached.result;
  }
  profiling.fixedCardSetOptimizationCacheMissCount += 1;
  const result = optimizeFixedMedleyCardSet(
    cardIds,
    slots,
    configuration,
    server,
    perfectRate,
    stats,
    profiling,
  );
  cache.set(key, { result });
  return result;
}
