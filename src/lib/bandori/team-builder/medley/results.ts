/*
 * Result assembly for medley search.
 *
 * Search modules work with compact candidate records; this file is the only place that
 * expands winning teams into the public per-song result shape.
 */

import type {
  BandoriMedleyTeamSearchResult,
  MedleyEvaluatedResultObserver,
  MedleySlotSearch,
  MedleyTeamCandidate,
} from "./types";
import type { BandoriAreaItemConfiguration } from "@/lib/bandori/team-builder/core";

const EVALUATED_AVERAGE_TOP_CANDIDATE_LIMIT = 10;

export function buildMedleyResult(
  slots: MedleySlotSearch[],
  selectedBySong: Array<MedleyTeamCandidate | undefined>,
  configuration: BandoriAreaItemConfiguration,
): BandoriMedleyTeamSearchResult | null {
  const slotsBySong = [...slots].sort((left, right) => left.songIndex - right.songIndex);
  const songResults: BandoriMedleyTeamSearchResult["songResults"] = [];

  for (const slot of slotsBySong) {
    const candidate = selectedBySong[slot.songIndex];
    if (!candidate) {
      return null;
    }
    songResults.push({
      ...candidate.result,
      songIndex: slot.songIndex,
      startCombo: slot.startCombo,
      notesCount: slot.chart.notesCount,
    });
  }

  const cardIds = songResults.flatMap((result) => result.cards.map((card) => card.cardId));
  if (new Set(cardIds).size !== cardIds.length) {
    return null;
  }

  const score = songResults.reduce((sum, result) => sum + result.score, 0);
  return {
    rank: 0,
    score,
    averageScore: songResults.reduce((sum, result) => sum + result.averageScore, 0),
    maxScore: songResults.reduce((sum, result) => sum + result.maxScore, 0),
    minScore: songResults.reduce((sum, result) => sum + result.minScore, 0),
    areaItemConfiguration: configuration,
    songResults,
    cardIds,
  };
}

export function sortMedleyResults(results: BandoriMedleyTeamSearchResult[]): void {
  results.sort((left, right) => (
    right.score - left.score
    || right.maxScore - left.maxScore
    || left.cardIds.join(",").localeCompare(right.cardIds.join(","))
  ));
  results.forEach((result, index) => {
    result.rank = index + 1;
  });
}

function getMedleyAreaItemConfigurationIdentityKey(configuration: BandoriAreaItemConfiguration): string {
  return [
    configuration.bandKey ?? "",
    configuration.attribute ?? "",
    configuration.parameter ?? "",
    [...configuration.selectedAreaItemIds].sort((left, right) => left - right).join(","),
  ].join(":");
}

function getMedleyResultCardIdentityKey(card: { cardId: number; cardInstanceKey?: string }): string {
  return card.cardInstanceKey ?? `profile:${card.cardId}`;
}

export function getMedleyResultIdentityKey(result: BandoriMedleyTeamSearchResult): string {
  return [
    getMedleyAreaItemConfigurationIdentityKey(result.areaItemConfiguration),
    ...result.songResults
      .map((songResult) => [
        songResult.songIndex,
        songResult.cards
          .map(getMedleyResultCardIdentityKey)
          .sort()
          .join(","),
      ].join(":"))
      .sort(),
  ].join("|");
}

function isDisplayableMedleyResult(result: BandoriMedleyTeamSearchResult): boolean {
  return result.songResults.length === 3
    && result.songResults.every((songResult) => songResult.cards.length === 5);
}

function compareMedleyResultsByMaxScore(
  left: BandoriMedleyTeamSearchResult,
  right: BandoriMedleyTeamSearchResult,
): number {
  return right.maxScore - left.maxScore
    || right.averageScore - left.averageScore
    || getMedleyResultIdentityKey(left).localeCompare(getMedleyResultIdentityKey(right));
}

function compareMedleyResultsByAverageScore(
  left: BandoriMedleyTeamSearchResult,
  right: BandoriMedleyTeamSearchResult,
): number {
  return right.averageScore - left.averageScore
    || right.maxScore - left.maxScore
    || getMedleyResultIdentityKey(left).localeCompare(getMedleyResultIdentityKey(right));
}

export function createMedleyEvaluatedCandidateTracker(): {
  observe: MedleyEvaluatedResultObserver;
  getMaxScoreCandidate: (primaryResult: BandoriMedleyTeamSearchResult | null) => BandoriMedleyTeamSearchResult | null;
  getEvaluatedAverageTopCandidates: (
    displayedResults: BandoriMedleyTeamSearchResult[],
    limit?: number,
  ) => BandoriMedleyTeamSearchResult[];
} {
  const maxScoreCandidatesByKey = new Map<string, BandoriMedleyTeamSearchResult>();
  const averageCandidatesByKey = new Map<string, BandoriMedleyTeamSearchResult>();

  const observe: MedleyEvaluatedResultObserver = (result) => {
    if (!isDisplayableMedleyResult(result)) {
      return;
    }
    const key = getMedleyResultIdentityKey(result);
    const currentMaxCandidate = maxScoreCandidatesByKey.get(key);
    if (!currentMaxCandidate || compareMedleyResultsByMaxScore(currentMaxCandidate, result) > 0) {
      maxScoreCandidatesByKey.set(key, result);
    }
    const currentAverageCandidate = averageCandidatesByKey.get(key);
    if (!currentAverageCandidate || compareMedleyResultsByAverageScore(currentAverageCandidate, result) > 0) {
      averageCandidatesByKey.set(key, result);
    }
  };

  const getMaxScoreCandidate = (primaryResult: BandoriMedleyTeamSearchResult | null): BandoriMedleyTeamSearchResult | null => {
    if (!primaryResult) {
      return null;
    }
    const primaryKey = getMedleyResultIdentityKey(primaryResult);
    const candidate = [...maxScoreCandidatesByKey.entries()]
      .filter(([key, result]) => key !== primaryKey && result.maxScore > primaryResult.maxScore)
      .map(([, result]) => result)
      .sort(compareMedleyResultsByMaxScore)[0] ?? null;
    return candidate;
  };

  const getEvaluatedAverageTopCandidates = (
    displayedResults: BandoriMedleyTeamSearchResult[],
    limit = EVALUATED_AVERAGE_TOP_CANDIDATE_LIMIT,
  ): BandoriMedleyTeamSearchResult[] => {
    const displayedKeys = new Set(displayedResults.map(getMedleyResultIdentityKey));
    return [...averageCandidatesByKey.entries()]
      .filter(([key]) => !displayedKeys.has(key))
      .map(([, result]) => result)
      .sort(compareMedleyResultsByAverageScore)
      .slice(0, limit);
  };

  return {
    observe,
    getMaxScoreCandidate,
    getEvaluatedAverageTopCandidates,
  };
}

export function pushMedleyResult(
  results: BandoriMedleyTeamSearchResult[],
  result: BandoriMedleyTeamSearchResult,
  resultLimit: number,
  observeEvaluatedResult?: MedleyEvaluatedResultObserver,
): void {
  observeEvaluatedResult?.(result);
  results.push(result);
  sortMedleyResults(results);
  if (results.length > resultLimit) {
    results.pop();
  }
}
