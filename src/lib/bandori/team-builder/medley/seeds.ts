/*
 * Seed generation for medley search.
 *
 * These helpers improve the incumbent score before exact DFS starts. They may change
 * runtime, but they do not prove optimality and must not decide exact vs bounded status.
 */

import {
  createMedleyTeamCandidate,
  getMedleyCandidateCards,
  getMedleyCandidateCardIds,
  getMedleyTeamEvaluationCacheKey,
  medleyCandidatesOverlap,
  pushMedleyCandidate,
} from "./candidates";
import { getMedleyPruningThreshold } from "./configurations";
import { MEDLEY_TEAM_COUNT, MEDLEY_TEAM_SIZE } from "./constants";
import { optimizeFixedMedleyCardSetWithCache, optimizeMedleyCardPool } from "./optimization";
import { buildMedleyResult, pushMedleyResult } from "./results";
import { enumerateMedleySlotTeams, findBestMedleySlotTeamWithCache } from "./slots";
import { evaluateTeam } from "@/lib/bandori/team-builder/core";
import type {
  BandoriMedleyTeamSearchProfilingStats,
  BandoriMedleyTeamSearchResult,
  BandoriMedleyTeamSearchStats,
  MedleyBestSlotTeamCacheEntry,
  MedleyEvaluatedResultObserver,
  MedleyFixedCardSetOptimizationCacheEntry,
  MedleySlotSearch,
  MedleyTeamCandidate,
} from "./types";
import type { BandoriAreaItemConfiguration, SearchCard } from "@/lib/bandori/team-builder/core";

export function pushMedleySeedResult(
  results: BandoriMedleyTeamSearchResult[],
  result: BandoriMedleyTeamSearchResult,
  resultLimit: number,
  slots: MedleySlotSearch[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  fixedCardSetOptimizationCache: Map<string, MedleyFixedCardSetOptimizationCacheEntry>,
  observeEvaluatedResult?: MedleyEvaluatedResultObserver,
): BandoriMedleyTeamSearchResult {
  let bestResult = result;
  observeEvaluatedResult?.(result);
  const optimized = optimizeFixedMedleyCardSetWithCache(
    fixedCardSetOptimizationCache,
    result.cardIds,
    slots,
    configuration,
    server,
    perfectRate,
    stats,
    profiling,
    observeEvaluatedResult,
  );
  if (optimized && optimized.score > result.score) {
    const improvement = optimized.score - result.score;
    profiling.fixedCardSetImprovementCount += 1;
    profiling.bestFixedCardSetImprovement = Math.max(profiling.bestFixedCardSetImprovement, improvement);
    bestResult = optimized;
  }
  pushMedleyResult(results, bestResult, resultLimit, observeEvaluatedResult);
  return bestResult;
}

export function collectTopMedleySlotTeams(
  slot: MedleySlotSearch,
  limit: number,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  observeUpperBound: (upperBound: number) => void,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  bannedCardIds: Set<number> = new Set<number>(),
  upperBannedCardIds: Set<number> = bannedCardIds,
  useContextualSkillUpper = false,
): MedleyTeamCandidate[] {
  const candidates: MedleyTeamCandidate[] = [];
  enumerateMedleySlotTeams(
    slot,
    bannedCardIds,
    upperBannedCardIds,
    server,
    perfectRate,
    stats,
    isPastDeadline,
    () => candidates.length >= limit ? candidates[limit - 1]?.result.score ?? Number.NEGATIVE_INFINITY : Number.NEGATIVE_INFINITY,
    observeUpperBound,
    profiling,
    (candidate) => pushMedleyCandidate(candidates, candidate, limit),
    useContextualSkillUpper,
  );
  return candidates;
}

export function seedMedleyResultsFromSlotCandidates(
  results: BandoriMedleyTeamSearchResult[],
  resultLimit: number,
  slots: MedleySlotSearch[],
  slotCandidates: MedleyTeamCandidate[][],
  configuration: BandoriAreaItemConfiguration,
  observeEvaluatedResult?: MedleyEvaluatedResultObserver,
): void {
  const [firstCandidates, secondCandidates, thirdCandidates] = slotCandidates;
  const bestSecondScore = secondCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY;
  const bestThirdScore = thirdCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY;

  for (const first of firstCandidates) {
    if (results.length >= resultLimit && first.result.score + bestSecondScore + bestThirdScore < getMedleyPruningThreshold(results, resultLimit)) {
      break;
    }
    for (const second of secondCandidates) {
      if (medleyCandidatesOverlap(first, second)) {
        continue;
      }
      if (results.length >= resultLimit && first.result.score + second.result.score + bestThirdScore < getMedleyPruningThreshold(results, resultLimit)) {
        break;
      }
      for (const third of thirdCandidates) {
        if (medleyCandidatesOverlap(first, third) || medleyCandidatesOverlap(second, third)) {
          continue;
        }
        const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
        selectedBySong[slots[0].songIndex] = first;
        selectedBySong[slots[1].songIndex] = second;
        selectedBySong[slots[2].songIndex] = third;
        const result = buildMedleyResult(slots, selectedBySong, configuration);
        if (result) {
          pushMedleyResult(results, result, resultLimit, observeEvaluatedResult);
        }
        break;
      }
    }
  }
}

export function optimizeCurrentMedleySeedResults(
  results: BandoriMedleyTeamSearchResult[],
  resultLimit: number,
  slots: MedleySlotSearch[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  fixedCardSetOptimizationCache: Map<string, MedleyFixedCardSetOptimizationCacheEntry>,
  observeEvaluatedResult?: MedleyEvaluatedResultObserver,
): void {
  const seedResults = [...results].slice(0, Math.min(results.length, Math.max(3, resultLimit * 3)));
  for (const result of seedResults) {
    pushMedleySeedResult(
      results,
      result,
      resultLimit,
      slots,
      configuration,
      server,
      perfectRate,
      stats,
      profiling,
      fixedCardSetOptimizationCache,
      observeEvaluatedResult,
    );
  }
}

export function collectMedleyNeighborhoodAlternateCardIds(
  slots: MedleySlotSearch[],
  slotCandidates: MedleyTeamCandidate[][],
  selectedCardIds: Set<number>,
  limit: number,
): number[] {
  const scoredAlternates = new Map<number, { score: number; firstSeen: number }>();
  let seenOrder = 0;
  const rankedSlotIndices = slots
    .map((_, index) => index)
    .sort((left, right) => (
      slots[right].rootScoreUpperBound - slots[left].rootScoreUpperBound
      || slots[right].baseScoreRatePerPower - slots[left].baseScoreRatePerPower
      || right - left
    ));
  for (const [slotRank, slotIndex] of rankedSlotIndices.entries()) {
    const candidates = slotCandidates[slotIndex] ?? [];
    const slotWeight = rankedSlotIndices.length - slotRank;
    for (const [candidateRank, candidate] of candidates.entries()) {
      const candidateWeight = slotWeight * (candidates.length - candidateRank);
      for (const cardId of getMedleyCandidateCardIds(candidate)) {
        if (selectedCardIds.has(cardId)) {
          continue;
        }
        const current = scoredAlternates.get(cardId);
        if (!current) {
          scoredAlternates.set(cardId, {
            score: candidate.result.score * candidateWeight,
            firstSeen: seenOrder,
          });
          seenOrder += 1;
        } else {
          current.score += candidate.result.score * candidateWeight;
        }
      }
    }
  }
  return [...scoredAlternates.entries()]
    .sort((left, right) => right[1].score - left[1].score || left[1].firstSeen - right[1].firstSeen || left[0] - right[0])
    .slice(0, limit)
    .map(([cardId]) => cardId);
}

export function optimizeMedleySeedNeighborhood(
  results: BandoriMedleyTeamSearchResult[],
  resultLimit: number,
  slots: MedleySlotSearch[],
  slotCandidates: MedleyTeamCandidate[][],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  alternateCardLimit: number,
  observeEvaluatedResult?: MedleyEvaluatedResultObserver,
): void {
  const seed = results[0];
  if (!seed || seed.cardIds.length !== MEDLEY_TEAM_COUNT * MEDLEY_TEAM_SIZE) {
    return;
  }
  const selectedCardIds = new Set(seed.cardIds);
  const alternateCardIds = collectMedleyNeighborhoodAlternateCardIds(
    slots,
    slotCandidates,
    selectedCardIds,
    alternateCardLimit,
  );
  if (alternateCardIds.length === 0) {
    return;
  }

  profiling.cardPoolOptimizationCount += 1;
  let bestOptimized: BandoriMedleyTeamSearchResult | null = null;
  for (let alternateCount = 1; alternateCount <= alternateCardIds.length; alternateCount += 1) {
    const optimized = optimizeMedleyCardPool(
      [...seed.cardIds, ...alternateCardIds.slice(0, alternateCount)],
      slots,
      configuration,
      server,
      perfectRate,
      stats,
      profiling,
      observeEvaluatedResult,
    );
    if (optimized && (!bestOptimized || optimized.score > bestOptimized.score)) {
      bestOptimized = optimized;
    }
    if (bestOptimized && bestOptimized.score > seed.score && alternateCount >= 2) {
      break;
    }
  }
  if (bestOptimized && bestOptimized.score > seed.score) {
    const improvement = bestOptimized.score - seed.score;
    profiling.cardPoolOptimizationImprovementCount += 1;
    profiling.bestCardPoolOptimizationImprovement = Math.max(profiling.bestCardPoolOptimizationImprovement, improvement);
    pushMedleyResult(results, bestOptimized, resultLimit, observeEvaluatedResult);
  }
}

export function getMedleyGreedySeedSlotIndices(slots: MedleySlotSearch[]): number[] {
  return slots
    .map((_, index) => index)
    .sort((left, right) => (
      slots[right].rootScoreUpperBound - slots[left].rootScoreUpperBound
      || slots[right].baseScoreRatePerPower - slots[left].baseScoreRatePerPower
      || right - left
    ));
}

export function seedMedleyResultsFromGreedyOrders(
  results: BandoriMedleyTeamSearchResult[],
  resultLimit: number,
  slots: MedleySlotSearch[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  bestSlotTeamCache: Map<string, MedleyBestSlotTeamCacheEntry>,
  fixedCardSetOptimizationCache: Map<string, MedleyFixedCardSetOptimizationCacheEntry>,
  seedOrders: number[][],
  recordGreedyStats: boolean,
  observeEvaluatedResult?: MedleyEvaluatedResultObserver,
): number | null {
  let bestSeedScore: number | null = null;
  for (const seedOrder of seedOrders) {
    if (stats.timedOut) {
      break;
    }
    const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
    const bannedCardIds = new Set<number>();
    let completeSeed = true;
    for (const slotIndex of seedOrder) {
      const slot = slots[slotIndex];
      const best = findBestMedleySlotTeamWithCache(
        bestSlotTeamCache,
        slotIndex,
        slot,
        bannedCardIds,
        bannedCardIds,
        server,
        perfectRate,
        stats,
        isPastDeadline,
        () => undefined,
        profiling,
      );
      if (!best) {
        completeSeed = false;
        break;
      }
      selectedBySong[slot.songIndex] = best;
      getMedleyCandidateCards(best).forEach((card) => bannedCardIds.add(card.cardId));
    }
    if (!completeSeed || stats.timedOut) {
      continue;
    }

    const result = buildMedleyResult(slots, selectedBySong, configuration);
    if (!result) {
      continue;
    }
    const pushedResult = pushMedleySeedResult(
      results,
      result,
      resultLimit,
      slots,
      configuration,
      server,
      perfectRate,
      stats,
      profiling,
      fixedCardSetOptimizationCache,
      observeEvaluatedResult,
    );
    bestSeedScore = Math.max(bestSeedScore ?? Number.NEGATIVE_INFINITY, pushedResult.score);
    if (recordGreedyStats) {
      profiling.bestGreedySeedScore = Math.max(profiling.bestGreedySeedScore ?? Number.NEGATIVE_INFINITY, result.score);
      if (seedOrder.map((slotIndex) => slots[slotIndex].songIndex).join(",") === "2,1,0") {
        profiling.reverseSongOrderGreedySeedScore = Math.max(
          profiling.reverseSongOrderGreedySeedScore ?? Number.NEGATIVE_INFINITY,
          result.score,
        );
      }
    }
  }
  return bestSeedScore;
}

export function buildFastGreedyMedleySlotCandidate(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): MedleyTeamCandidate | null {
  const selectedCards: SearchCard[] = [];
  const selectedCharacterIds = new Set<number>();
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId) || selectedCharacterIds.has(card.characterId)) {
      continue;
    }
    selectedCards.push(card);
    selectedCharacterIds.add(card.characterId);
    if (selectedCards.length >= MEDLEY_TEAM_SIZE) {
      break;
    }
  }
  if (selectedCards.length !== MEDLEY_TEAM_SIZE) {
    return null;
  }

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
    ? createMedleyTeamCandidate(result, selectedCards)
    : null;
}

export function seedMedleyResultsFromFastGreedyOrders(
  results: BandoriMedleyTeamSearchResult[],
  resultLimit: number,
  slots: MedleySlotSearch[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  fixedCardSetOptimizationCache: Map<string, MedleyFixedCardSetOptimizationCacheEntry>,
  seedOrders: number[][],
  observeEvaluatedResult?: MedleyEvaluatedResultObserver,
): number | null {
  let bestSeedScore: number | null = null;
  for (const seedOrder of seedOrders) {
    const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
    const bannedCardIds = new Set<number>();
    let completeSeed = true;
    for (const slotIndex of seedOrder) {
      const slot = slots[slotIndex];
      const candidate = buildFastGreedyMedleySlotCandidate(
        slot,
        bannedCardIds,
        server,
        perfectRate,
        stats,
        profiling,
      );
      if (!candidate) {
        completeSeed = false;
        break;
      }
      selectedBySong[slot.songIndex] = candidate;
      getMedleyCandidateCards(candidate).forEach((card) => bannedCardIds.add(card.cardId));
    }
    if (!completeSeed) {
      continue;
    }

    const result = buildMedleyResult(slots, selectedBySong, configuration);
    if (!result) {
      continue;
    }
    const pushedResult = pushMedleySeedResult(
      results,
      result,
      resultLimit,
      slots,
      configuration,
      server,
      perfectRate,
      stats,
      profiling,
      fixedCardSetOptimizationCache,
      observeEvaluatedResult,
    );
    bestSeedScore = Math.max(bestSeedScore ?? Number.NEGATIVE_INFINITY, pushedResult.score);
  }
  return bestSeedScore;
}
