/*
 * Single-search result ordering, cache keys, and response finalization.
 *
 * These helpers are intentionally outside core because they manage single-search result
 * ranking, stats, and bounded/exact response metadata.
 */
import type { CalculatedBandoriCard } from "@/lib/bandori-team-calculator";
import { getSortedCardInstanceKey } from "../core/card-identity";
import type { BandoriAreaItemConfiguration, BandoriTeamSearchEventMode, BandoriTeamSearchResponse, BandoriTeamSearchResult, BandoriTeamSearchResultCard, BandoriTeamSearchStats, BandoriTeamSearchSupportCard, SearchCard, SupportBandCandidate, SupportBandContext } from "../core/types";

function getResultCardIdsKey(result: BandoriTeamSearchResult): string {
  return getSortedCardInstanceKey(result.cards);
}

export function compareResults(left: BandoriTeamSearchResult, right: BandoriTeamSearchResult): number {
  const targetComparison = right.targetValue - left.targetValue;
  if (targetComparison !== 0) {
    return targetComparison;
  }

  if (left.target === "eventPoint" && right.target === "eventPoint") {
    return right.totalPower - left.totalPower
      || right.score - left.score
      || right.skills[0].skillId - left.skills[0].skillId
      || getResultCardIdsKey(left).localeCompare(getResultCardIdsKey(right));
  }

  return right.score - left.score
    || right.totalPower - left.totalPower
    || right.skills[0].skillId - left.skills[0].skillId
    || getResultCardIdsKey(left).localeCompare(getResultCardIdsKey(right));
}

export function sortResults(results: BandoriTeamSearchResult[]): void {
  results.sort(compareResults);
  results.forEach((result, index) => {
    result.rank = index + 1;
  });
}

export function toResultCards(cards: CalculatedBandoriCard[]): BandoriTeamSearchResultCard[] {
  return cards.map((card) => ({
    cardId: card.cardId,
    cardInstanceKey: card.cardInstanceKey,
    characterId: card.characterId,
    bandId: card.bandId,
    attribute: card.attribute,
    rarity: card.rarity,
    skillId: card.skillId,
    skillLevel: card.skillLevel,
    level: card.level,
    masterRank: card.masterRank,
    isTrained: card.isTrained,
    totalPower: card.totalPower,
  }));
}

export function toSupportResultCards(cards: SupportBandCandidate[]): BandoriTeamSearchSupportCard[] {
  return cards.map((candidate) => ({
    cardId: candidate.card.cardId,
    cardInstanceKey: candidate.card.cardInstanceKey,
    characterId: candidate.card.characterId,
    bandId: candidate.card.bandId,
    attribute: candidate.card.attribute,
    rarity: candidate.card.rarity,
    skillId: candidate.card.skillId,
    skillLevel: candidate.card.skillLevel,
    level: candidate.card.level,
    masterRank: candidate.card.masterRank,
    isTrained: candidate.card.isTrained,
    totalPower: candidate.card.totalPower,
    supportPower: candidate.supportPower,
  }));
}

export function getBaseCardPower(card: CalculatedBandoriCard): number {
  return card.baseParam[0] + card.baseParam[1] + card.baseParam[2];
}

export function getTeamEvaluationKey(cards: SearchCard[], configuration: BandoriAreaItemConfiguration): string {
  const cardKey = getSortedCardInstanceKey(cards);
  const configurationKey = configuration.selectedAreaItemIds.slice().sort((left, right) => left - right).join(",");
  return `${configurationKey}|${cardKey}`;
}

export function getTeamCardSetKey(cards: Array<{ cardId: number; cardInstanceKey?: string }>): string {
  return getSortedCardInstanceKey(cards);
}

export function pushResult(results: BandoriTeamSearchResult[], result: BandoriTeamSearchResult, resultLimit: number): void {
  // The same five-card set may come from different configurations or scopes; keep the better-ranked result.
  const cardSetKey = getTeamCardSetKey(result.cards);
  const existingIndex = results.findIndex((item) => getTeamCardSetKey(item.cards) === cardSetKey);
  if (existingIndex >= 0) {
    if (compareResults(results[existingIndex], result) <= 0) {
      return;
    }
    results.splice(existingIndex, 1);
  }
  results.push(result);
  sortResults(results);
  if (results.length > resultLimit) {
    results.pop();
  }
}

export function createInitialTeamSearchStats(options: {
  calculatedCardCount: number;
  rawConfigurationCount: number;
  configurationCount: number;
  usedEventBonus: boolean;
  eventMode: BandoriTeamSearchEventMode;
  useFever: boolean;
  supportBandContext: SupportBandContext;
}): BandoriTeamSearchStats {
  const { supportBandContext } = options;
  return {
    candidateCardCount: options.calculatedCardCount,
    rawAreaItemConfigurationCount: options.rawConfigurationCount,
    compressedCandidateCount: 0,
    areaItemConfigurationCount: options.configurationCount,
    prunedAreaItemConfigurationCount: options.rawConfigurationCount - options.configurationCount,
    enumeratedTeamCount: 0,
    evaluatedTeamCount: 0,
    targetOnlyEvaluationCount: 0,
    hydratedResultCount: 0,
    skippedHydrationCount: 0,
    duplicateTeamCount: 0,
    prunedBranchCount: 0,
    elapsedMs: 0,
    usedEventBonus: options.usedEventBonus,
    eventMode: options.eventMode,
    useFever: options.useFever,
    supportBandEnabled: supportBandContext.enabled,
    supportCandidateCount: supportBandContext.candidates.length,
    supportEvaluationCount: 0,
    skippedSupportByUpperBoundCount: 0,
    supportBandPowerUpperBound: supportBandContext.enabled ? supportBandContext.supportBandPowerUpperBound : null,
    supportAwareCompressionPrunedCount: 0,
    tightUpperBoundCount: 0,
    tightUpperBoundPrunedBranchCount: 0,
    secondLevelBoundCount: 0,
    secondLevelPrunedCount: 0,
    rootConfigSkippedCount: 0,
    isExhaustive: true,
    timedOut: false,
    searchMode: "exact",
    observedScoreUpperBound: null,
    observedScoreUpperBoundGap: null,
  };
}

export function markTeamSearchTimedOut(stats: BandoriTeamSearchStats): void {
  stats.isExhaustive = false;
  stats.timedOut = true;
  stats.searchMode = "bounded";
}

export function finishTeamSearchResponse(options: {
  results: BandoriTeamSearchResult[];
  stats: BandoriTeamSearchStats;
  supportBandContext: SupportBandContext;
  startedAt: number;
  resultLimit: number;
  observedScoreUpperBound: number;
}): BandoriTeamSearchResponse {
  const observedUpperBound = Number.isFinite(options.observedScoreUpperBound)
    ? Math.ceil(options.observedScoreUpperBound)
    : null;
  const comparisonScore = options.results[Math.min(options.resultLimit, options.results.length) - 1]?.score ?? null;
  const observedUpperBoundGap = options.stats.isExhaustive
    ? 0
    : observedUpperBound !== null && comparisonScore !== null
      ? Math.max(0, observedUpperBound - comparisonScore)
      : null;

  return {
    results: options.results,
    stats: {
      ...options.stats,
      supportEvaluationCount: options.supportBandContext.evaluationCount,
      skippedSupportByUpperBoundCount: options.supportBandContext.skippedByUpperBoundCount,
      secondLevelBoundCount: options.stats.tightUpperBoundCount,
      secondLevelPrunedCount: options.stats.tightUpperBoundPrunedBranchCount,
      elapsedMs: Math.round(performance.now() - options.startedAt),
      observedScoreUpperBound: options.stats.isExhaustive ? null : observedUpperBound,
      observedScoreUpperBoundGap: observedUpperBoundGap,
    },
  };
}
