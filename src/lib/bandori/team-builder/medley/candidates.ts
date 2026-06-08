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

function buildMedleyCandidateCardIds(cards: SearchCard[]): number[] {
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

export function getMedleyCandidateCards(candidate: MedleyTeamCandidate): SearchCard[] {
  if (candidate.cards) {
    return candidate.cards;
  }
  switch (candidate.cardCount) {
    case 0:
      return [];
    case 1:
      return [candidate.card0!];
    case 2:
      return [candidate.card0!, candidate.card1!];
    case 3:
      return [candidate.card0!, candidate.card1!, candidate.card2!];
    case 4:
      return [candidate.card0!, candidate.card1!, candidate.card2!, candidate.card3!];
    default:
      return [candidate.card0!, candidate.card1!, candidate.card2!, candidate.card3!, candidate.card4!];
  }
}

export function getMedleyCandidateCardIds(candidate: MedleyTeamCandidate): number[] {
  if (candidate.cardIds) {
    return candidate.cardIds;
  }
  switch (candidate.cardCount) {
    case 0:
      return [];
    case 1:
      return [candidate.cardId0!];
    case 2:
      return [candidate.cardId0!, candidate.cardId1!];
    case 3:
      return [candidate.cardId0!, candidate.cardId1!, candidate.cardId2!];
    case 4:
      return [candidate.cardId0!, candidate.cardId1!, candidate.cardId2!, candidate.cardId3!];
    default:
      return [candidate.cardId0!, candidate.cardId1!, candidate.cardId2!, candidate.cardId3!, candidate.cardId4!];
  }
}

export function forEachMedleyCandidateCardId(
  candidate: MedleyTeamCandidate,
  callback: (cardId: number) => void,
): void {
  if (candidate.cardIds) {
    for (const cardId of candidate.cardIds) {
      callback(cardId);
    }
    return;
  }
  if (candidate.cardCount >= 1) callback(candidate.cardId0!);
  if (candidate.cardCount >= 2) callback(candidate.cardId1!);
  if (candidate.cardCount >= 3) callback(candidate.cardId2!);
  if (candidate.cardCount >= 4) callback(candidate.cardId3!);
  if (candidate.cardCount >= 5) callback(candidate.cardId4!);
}

export function medleyCandidateHasCardId(candidate: MedleyTeamCandidate, cardId: number): boolean {
  if (candidate.cardIds) {
    return candidate.cardIds.includes(cardId);
  }
  return (
    candidate.cardId0 === cardId
    || candidate.cardId1 === cardId
    || candidate.cardId2 === cardId
    || candidate.cardId3 === cardId
    || candidate.cardId4 === cardId
  );
}

export function medleyCandidateHasAnyCardId(
  candidate: MedleyTeamCandidate,
  cardIds: Set<number>,
): boolean {
  if (candidate.cardIds) {
    return candidate.cardIds.some((cardId) => cardIds.has(cardId));
  }
  return (
    candidate.cardId0 !== undefined && cardIds.has(candidate.cardId0)
    || candidate.cardId1 !== undefined && cardIds.has(candidate.cardId1)
    || candidate.cardId2 !== undefined && cardIds.has(candidate.cardId2)
    || candidate.cardId3 !== undefined && cardIds.has(candidate.cardId3)
    || candidate.cardId4 !== undefined && cardIds.has(candidate.cardId4)
  );
}

export function medleyCandidatesOverlap(left: MedleyTeamCandidate, right: MedleyTeamCandidate): boolean {
  if (left.cardIds && right.cardIds) {
    for (const leftCardId of left.cardIds) {
      if (right.cardIds.includes(leftCardId)) {
        return true;
      }
    }
    return false;
  }
  let overlaps = false;
  forEachMedleyCandidateCardId(left, (cardId) => {
    if (!overlaps && medleyCandidateHasCardId(right, cardId)) {
      overlaps = true;
    }
  });
  return overlaps;
}

export function createMedleyTeamCandidate(
  result: BandoriTeamSearchResult,
  selectedCards: SearchCard[],
  retainArrays = true,
): MedleyTeamCandidate {
  const cardIds = buildMedleyCandidateCardIds(selectedCards);
  return {
    result,
    ...(retainArrays ? { cards: selectedCards, cardIds } : {}),
    cardCount: selectedCards.length,
    card0: selectedCards[0],
    card1: selectedCards[1],
    card2: selectedCards[2],
    card3: selectedCards[3],
    card4: selectedCards[4],
    cardId0: cardIds[0],
    cardId1: cardIds[1],
    cardId2: cardIds[2],
    cardId3: cardIds[3],
    cardId4: cardIds[4],
    cardInstanceKeys: getCardInstanceKeys(selectedCards),
  };
}

function compareMedleyCandidateCardIds(left: MedleyTeamCandidate, right: MedleyTeamCandidate): number {
  const leftKeys = left.cardInstanceKeys ?? [];
  const rightKeys = right.cardInstanceKeys ?? [];
  if (leftKeys.length > 0 || rightKeys.length > 0) {
    return leftKeys.join(",").localeCompare(rightKeys.join(","));
  }
  const leftCardIds = getMedleyCandidateCardIds(left);
  const rightCardIds = getMedleyCandidateCardIds(right);
  const length = Math.min(leftCardIds.length, rightCardIds.length);
  for (let index = 0; index < length; index += 1) {
    const delta = leftCardIds[index] - rightCardIds[index];
    if (delta !== 0) {
      return delta;
    }
  }
  return leftCardIds.length - rightCardIds.length;
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
    ? createMedleyTeamCandidate(result, selectedCards, !scoreOnly)
    : null;
}
