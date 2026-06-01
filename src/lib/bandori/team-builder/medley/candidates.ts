/*
 * Medley candidate utilities.
 *
 * Candidate records are intentionally smaller than public results so DFS, exact joins,
 * and seed passes can compare and cache teams without repeatedly expanding output DTOs.
 */

import { evaluateMedleyScoreOnlyTeam, evaluateTeam } from "@/lib/bandori/team-builder/core";
import type {
  BandoriMedleyTeamSearchProfilingStats,
  BandoriMedleyTeamSearchResult,
  BandoriMedleyTeamSearchStats,
  MedleySlotSearch,
  MedleyTeamCandidate,
} from "./types";
import type { BandoriTeamSearchResult, SearchCard } from "@/lib/bandori/team-builder/core";

const scoreOnlyTeamEvaluationCacheBySlot = new WeakMap<MedleySlotSearch, Map<string, BandoriTeamSearchResult | null>>();

export function getMedleyTeamEvaluationCacheKey(cards: SearchCard[]): string {
  switch (cards.length) {
    case 0:
      return "";
    case 1:
      return String(cards[0].cardId);
    case 2:
      return `${cards[0].cardId},${cards[1].cardId}`;
    case 3:
      return `${cards[0].cardId},${cards[1].cardId},${cards[2].cardId}`;
    case 4:
      return `${cards[0].cardId},${cards[1].cardId},${cards[2].cardId},${cards[3].cardId}`;
    case 5:
      return `${cards[0].cardId},${cards[1].cardId},${cards[2].cardId},${cards[3].cardId},${cards[4].cardId}`;
    default:
      return cards.map((card) => card.cardId).join(",");
  }
}

function getMedleyCandidateCardIds(cards: SearchCard[]): number[] {
  switch (cards.length) {
    case 0:
      return [];
    case 1:
      return [cards[0].cardId];
    case 2:
      return [cards[0].cardId, cards[1].cardId];
    case 3:
      return [cards[0].cardId, cards[1].cardId, cards[2].cardId];
    case 4:
      return [cards[0].cardId, cards[1].cardId, cards[2].cardId, cards[3].cardId];
    case 5:
      return [cards[0].cardId, cards[1].cardId, cards[2].cardId, cards[3].cardId, cards[4].cardId];
    default:
      return cards.map((card) => card.cardId);
  }
}

function compareMedleyCandidateCardIds(left: MedleyTeamCandidate, right: MedleyTeamCandidate): number {
  const length = Math.min(left.cardIds.length, right.cardIds.length);
  for (let index = 0; index < length; index += 1) {
    const delta = left.cardIds[index] - right.cardIds[index];
    if (delta !== 0) {
      return delta;
    }
  }
  return left.cardIds.length - right.cardIds.length;
}

export function sortMedleyCandidates(candidates: MedleyTeamCandidate[]): void {
  candidates.sort((left, right) => (
    right.result.score - left.result.score
    || right.result.maxScore - left.result.maxScore
    || compareMedleyCandidateCardIds(left, right)
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
  pruningThresholdResult?: BandoriTeamSearchResult,
  scoreOnly = false,
): MedleyTeamCandidate | null {
  stats.enumeratedTeamCount += 1;
  const cacheKey = getMedleyTeamEvaluationCacheKey(selectedCards);
  const cache = scoreOnly
    ? (scoreOnlyTeamEvaluationCacheBySlot.get(slot) ?? new Map<string, BandoriTeamSearchResult | null>())
    : slot.teamEvaluationCache;
  if (scoreOnly && !scoreOnlyTeamEvaluationCacheBySlot.has(slot)) {
    scoreOnlyTeamEvaluationCacheBySlot.set(slot, cache);
  }
  let result = cache.get(cacheKey);
  if (!cache.has(cacheKey)) {
    profiling.teamEvaluationCacheMissCount += 1;
    result = scoreOnly
      ? evaluateMedleyScoreOnlyTeam({
        cards: selectedCards,
        input: slot.input,
        chart: slot.chart,
        configuration: slot.configuration,
        server,
        perfectRate,
        scoreCache: slot.scoreCache,
        comboOptions: slot.comboOptions,
        pruningThresholdResult,
      })
      : evaluateTeam({
        cards: selectedCards,
        input: slot.input,
        chart: slot.chart,
        configuration: slot.configuration,
        server,
        perfectRate,
        scoreCache: slot.scoreCache,
        comboOptions: slot.comboOptions,
        pruningThresholdResult,
        scoreOnly,
      });
    if (scoreOnly || !pruningThresholdResult || result) {
      cache.set(cacheKey, result);
    }
    stats.evaluatedTeamCount += 1;
  } else {
    profiling.teamEvaluationCacheHitCount += 1;
  }

  return result
    ? {
      result,
      cards: selectedCards,
      cardIds: getMedleyCandidateCardIds(selectedCards),
    }
    : null;
}
