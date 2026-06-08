/*
 * Witness capture for medley upper-bound diagnostics.
 *
 * Witness data explains why the current upper bound remains above the incumbent score. It is
 * diagnostic output only and must not feed back into pruning decisions.
 */

import { MEDLEY_TEAM_COUNT } from "../constants";
import {
  buildMedleyCapacityCardsByCharacter,
  buildMedleyCardSpecificCoefficientUpperBySlot,
  estimateMedleyCapacityCardSpecificCoefficientAssignmentWitness,
} from "./capacity";
import {
  getMedleyCandidateCards,
  getMedleyCandidateCardIds,
  medleyCandidateHasAnyCardId,
} from "../candidates";
import { evaluateTeam } from "@/lib/bandori/team-builder/core";
import type {
  BandoriMedleyTeamSearchProfilingStats,
  BandoriMedleyUpperWitnessSlot,
  MedleySlotSearch,
  MedleyTeamCandidate,
} from "../types";
import type { BandoriTeamSearchResult, SearchCard } from "@/lib/bandori/team-builder/core";

export function toMedleyUpperWitnessSlot(
  slot: MedleySlotSearch,
  slotIndex: number,
  candidate: MedleyTeamCandidate,
): BandoriMedleyUpperWitnessSlot {
  return {
    slotIndex,
    songIndex: slot.songIndex,
    startCombo: slot.startCombo,
    notesCount: slot.chart.notes.length,
    score: candidate.result.score,
    totalPower: candidate.result.totalPower,
    eventPower: candidate.result.eventPower,
    eventMode: candidate.result.eventMode,
    leaderCardId: candidate.result.leaderCardId,
    cardIds: getMedleyCandidateCardIds(candidate),
    characterIds: getMedleyCandidateCards(candidate).map((card) => card.characterId),
  };
}

export function captureMedleyRootUpperWitness(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  slotCandidates: MedleyTeamCandidate[][],
  upperBound: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): void {
  if (!Number.isFinite(upperBound) || remainingSlotIndices.length !== MEDLEY_TEAM_COUNT) {
    return;
  }
  if (profiling.upperWitnessUpperBound !== null && profiling.upperWitnessUpperBound >= upperBound) {
    return;
  }

  const witnessSlots: BandoriMedleyUpperWitnessSlot[] = [];
  const cardUseCounts = new Map<number, number>();
  let evaluatedScore = 0;
  for (const slotIndex of remainingSlotIndices) {
    const candidate = slotCandidates[slotIndex]?.[0];
    if (!candidate) {
      return;
    }
    const slot = slots[slotIndex];
    evaluatedScore += candidate.result.score;
    for (const cardId of getMedleyCandidateCardIds(candidate)) {
      cardUseCounts.set(cardId, (cardUseCounts.get(cardId) ?? 0) + 1);
    }
    witnessSlots.push(toMedleyUpperWitnessSlot(slot, slotIndex, candidate));
  }

  let bestDisjointScore = Number.NEGATIVE_INFINITY;
  let bestDisjointSelection: Array<{ slotIndex: number; candidate: MedleyTeamCandidate }> | null = null;
  const selectedDisjoint: Array<{ slotIndex: number; candidate: MedleyTeamCandidate }> = [];
  const usedDisjointCardIds = new Set<number>();
  const visitDisjointCandidates = (slotPosition: number, score: number): void => {
    if (slotPosition >= remainingSlotIndices.length) {
      if (score > bestDisjointScore) {
        bestDisjointScore = score;
        bestDisjointSelection = selectedDisjoint.map((selection) => ({ ...selection }));
      }
      return;
    }
    const slotIndex = remainingSlotIndices[slotPosition];
    for (const candidate of slotCandidates[slotIndex] ?? []) {
      if (medleyCandidateHasAnyCardId(candidate, usedDisjointCardIds)) {
        continue;
      }
      getMedleyCandidateCardIds(candidate).forEach((cardId) => usedDisjointCardIds.add(cardId));
      selectedDisjoint.push({ slotIndex, candidate });
      visitDisjointCandidates(slotPosition + 1, score + candidate.result.score);
      selectedDisjoint.pop();
      getMedleyCandidateCardIds(candidate).forEach((cardId) => usedDisjointCardIds.delete(cardId));
    }
  };
  visitDisjointCandidates(0, 0);
  const disjointEvaluatedScore = Number.isFinite(bestDisjointScore) ? bestDisjointScore : null;
  const disjointGap = disjointEvaluatedScore === null ? null : upperBound - disjointEvaluatedScore;
  let disjointSlots: BandoriMedleyUpperWitnessSlot[] | null = null;
  if (bestDisjointSelection !== null) {
    const selection = bestDisjointSelection as Array<{ slotIndex: number; candidate: MedleyTeamCandidate }>;
    disjointSlots = selection.map(({ slotIndex, candidate }) => (
      toMedleyUpperWitnessSlot(slots[slotIndex], slotIndex, candidate)
    ));
  }
  const overlapCardIds = [...cardUseCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([cardId]) => cardId)
    .sort((left, right) => left - right);
  const gap = upperBound - evaluatedScore;
  profiling.upperWitnessCaptureCount += 1;
  profiling.upperWitnessUpperBound = upperBound;
  profiling.upperWitnessEvaluatedScore = evaluatedScore;
  profiling.upperWitnessGap = gap;
  profiling.upperWitness = {
    source: "relaxed-best-slots",
    upperBound,
    evaluatedScore,
    gap,
    disjointEvaluatedScore,
    disjointGap,
    capacityMode: profiling.remainingUpperBoundMaxCapacityMode,
    overlapCardIds,
    gapCategory: overlapCardIds.length > 0 ? "relaxed-slot-overlap" : "upper-model-gap",
    slots: witnessSlots,
    disjointSlots,
  };
}

export function toMedleyCapacityUpperWitnessSlot(
  slot: MedleySlotSearch,
  slotIndex: number,
  cards: SearchCard[],
  upperContribution: number,
  result: BandoriTeamSearchResult,
): BandoriMedleyUpperWitnessSlot {
  return {
    slotIndex,
    songIndex: slot.songIndex,
    startCombo: slot.startCombo,
    notesCount: slot.chart.notes.length,
    score: result.score,
    upperContribution,
    totalPower: result.totalPower,
    eventPower: result.eventPower,
    eventMode: result.eventMode,
    leaderCardId: result.leaderCardId,
    cardIds: cards.map((card) => card.cardId),
    characterIds: cards.map((card) => card.characterId),
  };
}

export function captureMedleyCapacityUpperWitness(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  upperBound: number,
  server: number,
  perfectRate: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): void {
  if (
    !Number.isFinite(upperBound)
    || remainingSlotIndices.length !== MEDLEY_TEAM_COUNT
    || bannedCardIds.size > 0
  ) {
    return;
  }
  if (
    profiling.capacityUpperWitnessUpperBound !== null
    && profiling.capacityUpperWitnessUpperBound >= upperBound
  ) {
    return;
  }

  const cardsByCharacter = buildMedleyCapacityCardsByCharacter(slots, remainingSlotIndices, bannedCardIds);
  const coefficientUpperBySlot = buildMedleyCardSpecificCoefficientUpperBySlot(
    slots,
    remainingSlotIndices,
    bannedCardIds,
  );
  const assignment = estimateMedleyCapacityCardSpecificCoefficientAssignmentWitness(
    remainingSlotIndices,
    cardsByCharacter,
    coefficientUpperBySlot,
  );
  if (!assignment) {
    return;
  }

  const witnessSlots: BandoriMedleyUpperWitnessSlot[] = [];
  const cardUseCounts = new Map<number, number>();
  let evaluatedScore = 0;
  for (const assignmentSlot of assignment.slots) {
    const slot = slots[assignmentSlot.slotIndex];
    const result = evaluateTeam({
      cards: assignmentSlot.cards,
      input: slot.input,
      chart: slot.chart,
      configuration: slot.configuration,
      server,
      perfectRate,
      scoreCache: slot.scoreCache,
      comboOptions: slot.comboOptions,
    });
    if (!result) {
      return;
    }
    evaluatedScore += result.score;
    for (const card of assignmentSlot.cards) {
      cardUseCounts.set(card.cardId, (cardUseCounts.get(card.cardId) ?? 0) + 1);
    }
    witnessSlots.push(toMedleyCapacityUpperWitnessSlot(
      slot,
      assignmentSlot.slotIndex,
      assignmentSlot.cards,
      assignmentSlot.upperContribution,
      result,
    ));
  }

  const overlapCardIds = [...cardUseCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([cardId]) => cardId)
    .sort((left, right) => left - right);
  const gap = upperBound - evaluatedScore;
  const teamSharedGap = assignment.upperBound - evaluatedScore;
  const contextOrProductGap = upperBound - assignment.upperBound;

  profiling.capacityUpperWitnessCaptureCount += 1;
  profiling.capacityUpperWitnessUpperBound = upperBound;
  profiling.capacityUpperWitnessEvaluatedScore = evaluatedScore;
  profiling.capacityUpperWitnessGap = gap;
  profiling.capacityUpperWitnessTeamSharedGap = teamSharedGap;
  profiling.capacityUpperWitnessCrossSlotDuplicateCardCount = overlapCardIds.length;
  profiling.capacityUpperWitnessContextOrProductGap = contextOrProductGap;
  profiling.upperWitness = {
    source: "capacity-assignment",
    upperBound,
    assignmentUpperBound: assignment.upperBound,
    evaluatedScore,
    gap,
    teamSharedGap,
    crossSlotDuplicateCardCount: overlapCardIds.length,
    contextOrProductGap,
    disjointEvaluatedScore: null,
    disjointGap: null,
    capacityMode: profiling.remainingUpperBoundMaxCapacityMode,
    overlapCardIds,
    gapCategory: "capacity-model-gap",
    slots: witnessSlots.sort((left, right) => left.slotIndex - right.slotIndex),
    disjointSlots: null,
  };
}
