/*
 * Medley candidate utilities.
 *
 * Candidate records are intentionally smaller than public results so DFS, exact joins,
 * and seed passes can compare and cache teams without repeatedly expanding output DTOs.
 */

import { evaluateTeam } from "@/lib/bandori/team-builder/core";
import type {
  BandoriMedleyTeamSearchProfilingStats,
  BandoriMedleyTeamSearchResult,
  BandoriMedleyTeamSearchStats,
  MedleySlotSearch,
  MedleyTeamCandidate,
} from "./types";
import type { SearchCard } from "@/lib/bandori/team-builder/core";

export function getMedleyTeamEvaluationCacheKey(cards: SearchCard[]): string {
  return cards.map((card) => card.cardId).join(",");
}

export function sortMedleyCandidates(candidates: MedleyTeamCandidate[]): void {
  candidates.sort((left, right) => (
    right.result.score - left.result.score
    || right.result.maxScore - left.result.maxScore
    || left.cardIds.join(",").localeCompare(right.cardIds.join(","))
  ));
}

export function pushMedleyCandidate(candidates: MedleyTeamCandidate[], candidate: MedleyTeamCandidate, limit: number): void {
  candidates.push(candidate);
  sortMedleyCandidates(candidates);
  if (candidates.length > limit) {
    candidates.pop();
  }
}

export function compareMedleyResultLike(
  left: BandoriMedleyTeamSearchResult | null,
  right: BandoriMedleyTeamSearchResult | null,
): BandoriMedleyTeamSearchResult | null {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return right.score > left.score
    || (right.score === left.score && right.maxScore > left.maxScore)
    || (
      right.score === left.score
      && right.maxScore === left.maxScore
      && right.cardIds.join(",").localeCompare(left.cardIds.join(",")) < 0
    )
    ? right
    : left;
}

export function evaluateMedleySlotCandidateWithCache(
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
    }
    : null;
}
