/*
 * Result assembly for medley search.
 *
 * Search modules work with compact candidate records; this file is the only place that
 * expands winning teams into the public per-song result shape.
 */

import type { BandoriMedleyTeamSearchResult, MedleySlotSearch, MedleyTeamCandidate } from "./types";
import type { BandoriAreaItemConfiguration } from "@/lib/bandori/team-builder/core";

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

  const score = songResults.reduce((sum, result) => sum + result.score, 0);
  return {
    rank: 0,
    score,
    averageScore: songResults.reduce((sum, result) => sum + result.averageScore, 0),
    maxScore: songResults.reduce((sum, result) => sum + result.maxScore, 0),
    minScore: songResults.reduce((sum, result) => sum + result.minScore, 0),
    areaItemConfiguration: configuration,
    songResults,
    cardIds: songResults.flatMap((result) => result.cards.map((card) => card.cardId)),
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

export function pushMedleyResult(
  results: BandoriMedleyTeamSearchResult[],
  result: BandoriMedleyTeamSearchResult,
  resultLimit: number,
): void {
  results.push(result);
  sortMedleyResults(results);
  if (results.length > resultLimit) {
    results.pop();
  }
}
