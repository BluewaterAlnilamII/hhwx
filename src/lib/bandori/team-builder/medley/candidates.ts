/*
 * Medley candidate utilities.
 *
 * Candidate records are intentionally smaller than public results so DFS, exact joins,
 * and seed passes can compare and cache teams without repeatedly expanding output DTOs.
 */

import { evaluateMedleyScoreOnlyTeam, evaluateTeam } from "@/lib/bandori/team-builder/core";
import { getCardInstanceKeys } from "@/lib/bandori/team-builder/core/card-identity";
import type {
  BandoriMedleyTeamSearchProfilingStats,
  BandoriMedleyTeamSearchResult,
  BandoriMedleyTeamSearchStats,
  MedleySlotSearch,
  MedleyTeamCandidate,
} from "./types";
import type { BandoriTeamSearchResult, SearchCard } from "@/lib/bandori/team-builder/core";

const scoreOnlyTeamEvaluationCacheBySlot = new WeakMap<MedleySlotSearch, Map<string, BandoriTeamSearchResult | null>>();

export function releaseMedleyScoreOnlyTeamEvaluationCache(slot: MedleySlotSearch): void {
  scoreOnlyTeamEvaluationCacheBySlot.get(slot)?.clear();
  scoreOnlyTeamEvaluationCacheBySlot.delete(slot);
}

export function getMedleyTeamEvaluationCacheKey(cards: SearchCard[]): string {
  const keys = getCardInstanceKeys(cards);
  switch (cards.length) {
    case 0:
      return "";
    case 1:
      return keys[0];
    case 2:
      return `${keys[0]},${keys[1]}`;
    case 3:
      return `${keys[0]},${keys[1]},${keys[2]}`;
    case 4:
      return `${keys[0]},${keys[1]},${keys[2]},${keys[3]}`;
    case 5:
      return `${keys[0]},${keys[1]},${keys[2]},${keys[3]},${keys[4]}`;
    default:
      return keys.join(",");
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
  const leftKeys = left.cardInstanceKeys ?? [];
  const rightKeys = right.cardInstanceKeys ?? [];
  if (leftKeys.length > 0 || rightKeys.length > 0) {
    return leftKeys.join(",").localeCompare(rightKeys.join(","));
  }
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
  includeCardInstanceKeys = true,
  useScoreOnlyCache = true,
): MedleyTeamCandidate | null {
  stats.enumeratedTeamCount += 1;
  const shouldUseCache = !scoreOnly || useScoreOnlyCache;
  const cacheKey = shouldUseCache ? getMedleyTeamEvaluationCacheKey(selectedCards) : "";
  const cache = shouldUseCache
    ? scoreOnly
      ? (scoreOnlyTeamEvaluationCacheBySlot.get(slot) ?? new Map<string, BandoriTeamSearchResult | null>())
      : slot.teamEvaluationCache
    : null;
  if (scoreOnly && shouldUseCache && cache && !scoreOnlyTeamEvaluationCacheBySlot.has(slot)) {
    scoreOnlyTeamEvaluationCacheBySlot.set(slot, cache);
  }
  let result = cache?.get(cacheKey);
  if (!cache || !cache.has(cacheKey)) {
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
    if (cache && (scoreOnly || !pruningThresholdResult || result)) {
      cache.set(cacheKey, result);
    }
    stats.evaluatedTeamCount += 1;
  } else {
    profiling.teamEvaluationCacheHitCount += 1;
  }

  if (!result) {
    return null;
  }
  const candidate: MedleyTeamCandidate = {
    result,
    cards: selectedCards,
    cardIds: getMedleyCandidateCardIds(selectedCards),
  };
  if (includeCardInstanceKeys) {
    candidate.cardInstanceKeys = getCardInstanceKeys(selectedCards);
  }
  return candidate;
}
