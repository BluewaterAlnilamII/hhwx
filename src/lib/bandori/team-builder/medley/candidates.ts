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
import type {
  BandoriCardAttribute,
  BandoriTeamSearchResult,
  ScoreCalculationCache,
  SearchCard,
} from "@/lib/bandori/team-builder/core";

type MedleyScoreOnlyTeamEvaluationCacheEntry = {
  score: number;
  averageScore: number;
  maxScore: number;
  minScore: number;
  maxScoreOrderCount: number;
  maxScoreOrderTotal: number;
  totalPower: number;
  leaderCardId: number;
  leaderCardInstanceKey?: string;
  sameBandId: number | null;
  sameAttribute: BandoriCardAttribute | null;
};

type MedleyScoreOnlyTeamEvaluationCacheValue = (
  BandoriTeamSearchResult
  | MedleyScoreOnlyTeamEvaluationCacheEntry
  | null
);

const scoreOnlyTeamEvaluationCacheBySlot = new WeakMap<
  MedleySlotSearch,
  Map<string, MedleyScoreOnlyTeamEvaluationCacheValue>
>();
const hasDuplicateCardIdsBySlot = new WeakMap<MedleySlotSearch, boolean>();

const MEDLEY_SCORE_ONLY_EVENT_POINT_OPTIONS: BandoriTeamSearchResult["eventPointOptions"] = {
  mode: "none",
  defaultKey: null,
  options: [],
};
const MEDLEY_SCORE_ONLY_SUPPORT_CARDS: BandoriTeamSearchResult["supportCards"] = [];
const MEDLEY_SCORE_ONLY_RESULT_CARDS: BandoriTeamSearchResult["cards"] = [];
const MEDLEY_SCORE_ONLY_SKILLS: BandoriTeamSearchResult["skills"] = [];
const MEDLEY_SCORE_ONLY_SKILL_ORDER_CARD_IDS: number[] = [];

export function releaseMedleyScoreOnlyTeamEvaluationCache(slot: MedleySlotSearch): void {
  scoreOnlyTeamEvaluationCacheBySlot.get(slot)?.clear();
  scoreOnlyTeamEvaluationCacheBySlot.delete(slot);
}

export function getMedleyScoreOnlyTeamEvaluationCacheSize(slot: MedleySlotSearch): number {
  return scoreOnlyTeamEvaluationCacheBySlot.get(slot)?.size ?? 0;
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

function medleySlotHasDuplicateCardIds(slot: MedleySlotSearch): boolean {
  const cached = hasDuplicateCardIdsBySlot.get(slot);
  if (cached !== undefined) {
    return cached;
  }
  const seen = new Set<number>();
  for (const card of slot.searchCards) {
    if (seen.has(card.cardId)) {
      hasDuplicateCardIdsBySlot.set(slot, true);
      return true;
    }
    seen.add(card.cardId);
  }
  hasDuplicateCardIdsBySlot.set(slot, false);
  return false;
}

function getMedleyCandidateCardInstanceKeysIfNeeded(
  slot: MedleySlotSearch,
  cards: SearchCard[],
): string[] | undefined {
  return medleySlotHasDuplicateCardIds(slot) ? getCardInstanceKeys(cards) : undefined;
}

function isCompactMedleyScoreOnlyTeamEvaluationCacheEntry(
  value: MedleyScoreOnlyTeamEvaluationCacheValue,
): value is MedleyScoreOnlyTeamEvaluationCacheEntry {
  return !!value && !("targetValue" in value);
}

function compactMedleyScoreOnlyTeamEvaluationResult(
  result: BandoriTeamSearchResult,
): MedleyScoreOnlyTeamEvaluationCacheEntry {
  return {
    score: result.score,
    averageScore: result.averageScore,
    maxScore: result.maxScore,
    minScore: result.minScore,
    maxScoreOrderCount: result.maxScoreOrderCount,
    maxScoreOrderTotal: result.maxScoreOrderTotal,
    totalPower: result.totalPower,
    leaderCardId: result.leaderCardId,
    leaderCardInstanceKey: result.leaderCardInstanceKey,
    sameBandId: result.context.sameBandId,
    sameAttribute: result.context.sameAttribute,
  };
}

function hydrateCompactMedleyScoreOnlyTeamEvaluationResult(
  entry: MedleyScoreOnlyTeamEvaluationCacheEntry,
  slot: MedleySlotSearch,
): BandoriTeamSearchResult {
  return {
    rank: 0,
    score: entry.score,
    targetValue: entry.averageScore,
    averageScore: entry.averageScore,
    maxScore: entry.maxScore,
    minScore: entry.minScore,
    maxScoreOrderCount: entry.maxScoreOrderCount,
    maxScoreOrderTotal: entry.maxScoreOrderTotal,
    totalPower: entry.totalPower,
    rawCardPower: 0,
    areaItemPower: 0,
    eventPower: 0,
    eventPowerWithRoom: 0,
    pointBonusRate: 0,
    eventPointBase: null,
    eventPointMultiplier: 1,
    eventPoint: null,
    eventPointOptions: MEDLEY_SCORE_ONLY_EVENT_POINT_OPTIONS,
    eventMode: "parameterPower",
    roomScore: null,
    supportBandPower: null,
    supportCards: MEDLEY_SCORE_ONLY_SUPPORT_CARDS,
    liveType: "free",
    eventType: "medley",
    target: "score",
    leaderCardId: entry.leaderCardId,
    leaderCardInstanceKey: entry.leaderCardInstanceKey,
    skillOrderCardIds: MEDLEY_SCORE_ONLY_SKILL_ORDER_CARD_IDS,
    areaItemConfiguration: slot.configuration,
    context: {
      sameBandId: entry.sameBandId,
      sameAttribute: entry.sameAttribute,
    },
    cards: MEDLEY_SCORE_ONLY_RESULT_CARDS,
    skills: MEDLEY_SCORE_ONLY_SKILLS,
  };
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
  options: {
    disableScoreOnlyCalculationCache?: boolean;
    scoreOnlyCalculationCache?: ScoreCalculationCache;
    disableScoreOnlyCache?: boolean;
    compactScoreOnlyCache?: boolean;
  } = {},
): MedleyTeamCandidate | null {
  stats.enumeratedTeamCount += 1;
  const shouldUseCache = !scoreOnly || options.disableScoreOnlyCache !== true;
  const cacheKey = shouldUseCache ? getMedleyTeamEvaluationCacheKey(selectedCards) : "";
  const scoreOnlyCache = scoreOnly && shouldUseCache
    ? (
      scoreOnlyTeamEvaluationCacheBySlot.get(slot)
      ?? new Map<string, MedleyScoreOnlyTeamEvaluationCacheValue>()
    )
    : null;
  if (scoreOnly && shouldUseCache && scoreOnlyCache && !scoreOnlyTeamEvaluationCacheBySlot.has(slot)) {
    scoreOnlyTeamEvaluationCacheBySlot.set(slot, scoreOnlyCache);
  }
  const cachedResult = scoreOnly
    ? scoreOnlyCache?.get(cacheKey)
    : shouldUseCache
    ? slot.teamEvaluationCache.get(cacheKey)
    : undefined;
  const hasCachedResult = scoreOnly
    ? scoreOnlyCache?.has(cacheKey) === true
    : shouldUseCache && slot.teamEvaluationCache.has(cacheKey);
  let result = isCompactMedleyScoreOnlyTeamEvaluationCacheEntry(cachedResult)
    ? hydrateCompactMedleyScoreOnlyTeamEvaluationResult(cachedResult, slot)
    : cachedResult;
  if (!hasCachedResult) {
    profiling.teamEvaluationCacheMissCount += 1;
    result = scoreOnly
      ? evaluateMedleyScoreOnlyTeam({
        cards: selectedCards,
        input: slot.input,
        chart: slot.chart,
        configuration: slot.configuration,
        server,
        perfectRate,
        scoreCache: options.scoreOnlyCalculationCache
          ?? (options.disableScoreOnlyCalculationCache === true ? undefined : slot.scoreCache),
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
    if (scoreOnly && scoreOnlyCache) {
      scoreOnlyCache.set(
        cacheKey,
        options.compactScoreOnlyCache === true && result
          ? compactMedleyScoreOnlyTeamEvaluationResult(result)
          : result,
      );
    } else if (!scoreOnly && shouldUseCache && (!pruningThresholdResult || result)) {
      slot.teamEvaluationCache.set(cacheKey, result);
    }
    stats.evaluatedTeamCount += 1;
  } else {
    profiling.teamEvaluationCacheHitCount += 1;
  }

  if (!result) {
    return null;
  }
  const cardInstanceKeys = getMedleyCandidateCardInstanceKeysIfNeeded(slot, selectedCards);
  return cardInstanceKeys
    ? {
      result,
      cards: selectedCards,
      cardIds: getMedleyCandidateCardIds(selectedCards),
      cardInstanceKeys,
    }
    : {
      result,
      cards: selectedCards,
      cardIds: getMedleyCandidateCardIds(selectedCards),
    };
}
