/*
 * Append-only raw candidate rows for medley exact-join experiments.
 *
 * This is the shadow-builder shape we want to grow into resident candidate storage:
 * scores and card ids live in typed arrays, while rich MedleyTeamCandidate objects
 * remain authoritative until parity/proof gates are ready.
 */

import { getMedleyTeamCandidateCardIdAt } from "../candidates";
import { MEDLEY_TEAM_SIZE } from "../constants";
import type { MedleyTeamCandidate } from "../types";

const BYTES_PER_MIB = 1024 * 1024;

export const MEDLEY_EXACT_RAW_CANDIDATE_MIRROR_MAX_CANDIDATE_TOTAL = 60_000;
export const MEDLEY_EXACT_RAW_CANDIDATE_MIRROR_MAX_SLOT_CARD_COUNT = 1_200;

export type MedleyExactRawCandidateSlotView = {
  scores: Int32Array;
  averageScores: Int32Array;
  maxScores: Int32Array;
  minScores: Int32Array;
  sourceIndices: Int32Array;
  cardIds: Int32Array;
  cardSearchIndices: Int32Array;
  length: number;
};

export type MedleyExactRawCandidateMirrorSlot = MedleyExactRawCandidateSlotView & {
  mismatchCount: number;
  capacity: number;
};

export type MedleyExactRawCandidateMirror = {
  slots: MedleyExactRawCandidateMirrorSlot[];
  rebuildCount: number;
  appendCount: number;
  skippedAppendCount: number;
  maxCandidateTotal: number;
  disabledReason: string | null;
};

function roundMiB(bytes: number): number {
  return Math.round((bytes / BYTES_PER_MIB) * 100) / 100;
}

function createMedleyExactRawCandidateMirrorSlot(capacity = 16): MedleyExactRawCandidateMirrorSlot {
  return {
    scores: new Int32Array(capacity),
    averageScores: new Int32Array(capacity),
    maxScores: new Int32Array(capacity),
    minScores: new Int32Array(capacity),
    sourceIndices: new Int32Array(capacity),
    cardIds: new Int32Array(capacity * MEDLEY_TEAM_SIZE),
    cardSearchIndices: new Int32Array(capacity * MEDLEY_TEAM_SIZE),
    length: 0,
    mismatchCount: 0,
    capacity,
  };
}

export function createMedleyExactRawCandidateMirror(
  slotCount: number,
  maxCandidateTotal = MEDLEY_EXACT_RAW_CANDIDATE_MIRROR_MAX_CANDIDATE_TOTAL,
): MedleyExactRawCandidateMirror {
  return {
    slots: Array.from({ length: slotCount }, () => createMedleyExactRawCandidateMirrorSlot()),
    rebuildCount: 0,
    appendCount: 0,
    skippedAppendCount: 0,
    maxCandidateTotal,
    disabledReason: null,
  };
}

function ensureMedleyExactRawCandidateMirrorSlotCapacity(
  slot: MedleyExactRawCandidateMirrorSlot,
  requiredCapacity: number,
): void {
  if (requiredCapacity <= slot.capacity) {
    return;
  }
  let nextCapacity = slot.capacity;
  while (nextCapacity < requiredCapacity) {
    nextCapacity *= 2;
  }

  const nextScore = new Int32Array(nextCapacity);
  nextScore.set(slot.scores.subarray(0, slot.length));
  slot.scores = nextScore;

  const nextAverageScore = new Int32Array(nextCapacity);
  nextAverageScore.set(slot.averageScores.subarray(0, slot.length));
  slot.averageScores = nextAverageScore;

  const nextMaxScore = new Int32Array(nextCapacity);
  nextMaxScore.set(slot.maxScores.subarray(0, slot.length));
  slot.maxScores = nextMaxScore;

  const nextMinScore = new Int32Array(nextCapacity);
  nextMinScore.set(slot.minScores.subarray(0, slot.length));
  slot.minScores = nextMinScore;

  const nextSourceIndex = new Int32Array(nextCapacity);
  nextSourceIndex.set(slot.sourceIndices.subarray(0, slot.length));
  slot.sourceIndices = nextSourceIndex;

  const nextCardIds = new Int32Array(nextCapacity * MEDLEY_TEAM_SIZE);
  nextCardIds.set(slot.cardIds.subarray(0, slot.length * MEDLEY_TEAM_SIZE));
  slot.cardIds = nextCardIds;

  const nextCardSearchIndices = new Int32Array(nextCapacity * MEDLEY_TEAM_SIZE);
  nextCardSearchIndices.set(slot.cardSearchIndices.subarray(0, slot.length * MEDLEY_TEAM_SIZE));
  slot.cardSearchIndices = nextCardSearchIndices;

  slot.capacity = nextCapacity;
}

function getMedleyExactTeamCandidateCardSearchIndexAt(
  candidate: MedleyTeamCandidate,
  cardIndex: number,
): number {
  switch (cardIndex) {
    case 0:
      return candidate.cardSearchIndex0 ?? candidate.cardSearchIndices?.[0] ?? -1;
    case 1:
      return candidate.cardSearchIndex1 ?? candidate.cardSearchIndices?.[1] ?? -1;
    case 2:
      return candidate.cardSearchIndex2 ?? candidate.cardSearchIndices?.[2] ?? -1;
    case 3:
      return candidate.cardSearchIndex3 ?? candidate.cardSearchIndices?.[3] ?? -1;
    case 4:
      return candidate.cardSearchIndex4 ?? candidate.cardSearchIndices?.[4] ?? -1;
    default:
      return candidate.cardSearchIndices?.[cardIndex] ?? -1;
  }
}

function appendMedleyExactRawCandidateMirrorSlot(
  slot: MedleyExactRawCandidateMirrorSlot,
  candidate: MedleyTeamCandidate,
  sourceIndex: number,
): void {
  const index = slot.length;
  ensureMedleyExactRawCandidateMirrorSlotCapacity(slot, index + 1);
  slot.scores[index] = candidate.result.score;
  slot.averageScores[index] = candidate.result.averageScore;
  slot.maxScores[index] = candidate.result.maxScore;
  slot.minScores[index] = candidate.result.minScore;
  slot.sourceIndices[index] = sourceIndex;

  const baseCardIndex = index * MEDLEY_TEAM_SIZE;
  for (let cardIndex = 0; cardIndex < MEDLEY_TEAM_SIZE; cardIndex += 1) {
    slot.cardIds[baseCardIndex + cardIndex] = getMedleyTeamCandidateCardIdAt(candidate, cardIndex) ?? -1;
    slot.cardSearchIndices[baseCardIndex + cardIndex] = getMedleyExactTeamCandidateCardSearchIndexAt(
      candidate,
      cardIndex,
    );
  }

  if (
    slot.scores[index] !== candidate.result.score
    || slot.averageScores[index] !== candidate.result.averageScore
    || slot.maxScores[index] !== candidate.result.maxScore
    || slot.minScores[index] !== candidate.result.minScore
    || slot.sourceIndices[index] !== sourceIndex
  ) {
    slot.mismatchCount += 1;
  }
  for (let cardIndex = 0; cardIndex < MEDLEY_TEAM_SIZE; cardIndex += 1) {
    if (
      slot.cardIds[baseCardIndex + cardIndex] !== (getMedleyTeamCandidateCardIdAt(candidate, cardIndex) ?? -1)
      || slot.cardSearchIndices[baseCardIndex + cardIndex] !== getMedleyExactTeamCandidateCardSearchIndexAt(
        candidate,
        cardIndex,
      )
    ) {
      slot.mismatchCount += 1;
      break;
    }
  }

  slot.length = index + 1;
}

export function appendMedleyExactRawCandidateMirror(
  mirror: MedleyExactRawCandidateMirror | null,
  slotIndex: number,
  candidate: MedleyTeamCandidate,
  sourceIndex: number,
): void {
  if (!mirror) {
    return;
  }
  if (mirror.disabledReason) {
    mirror.skippedAppendCount += 1;
    return;
  }
  if (mirror.appendCount >= mirror.maxCandidateTotal) {
    mirror.disabledReason = "candidate-total-limit";
    mirror.skippedAppendCount += 1;
    return;
  }
  const slot = mirror.slots[slotIndex];
  if (!slot) {
    return;
  }
  appendMedleyExactRawCandidateMirrorSlot(slot, candidate, sourceIndex);
  mirror.appendCount += 1;
}

export function rebuildMedleyExactRawCandidateMirrorFromCandidates(
  mirror: MedleyExactRawCandidateMirror | null,
  candidatesBySlot: readonly MedleyTeamCandidate[][],
): void {
  if (!mirror || mirror.disabledReason) {
    return;
  }
  const totalCandidateCount = candidatesBySlot.reduce((sum, candidates) => sum + candidates.length, 0);
  if (totalCandidateCount > mirror.maxCandidateTotal) {
    mirror.disabledReason = "candidate-total-limit";
    mirror.skippedAppendCount += Math.max(0, totalCandidateCount - mirror.appendCount);
    return;
  }

  for (let slotIndex = 0; slotIndex < mirror.slots.length; slotIndex += 1) {
    const slot = mirror.slots[slotIndex];
    const candidates = candidatesBySlot[slotIndex] ?? [];
    slot.length = 0;
    slot.mismatchCount = 0;
    ensureMedleyExactRawCandidateMirrorSlotCapacity(slot, candidates.length);
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      appendMedleyExactRawCandidateMirrorSlot(slot, candidates[candidateIndex], candidateIndex);
    }
  }
  mirror.appendCount = totalCandidateCount;
  mirror.rebuildCount += 1;
}

export function getMedleyExactRawCandidateSlotBytes(
  slot: MedleyExactRawCandidateSlotView,
): number {
  return (
    slot.scores.byteLength
    + slot.averageScores.byteLength
    + slot.maxScores.byteLength
    + slot.minScores.byteLength
    + slot.sourceIndices.byteLength
    + slot.cardIds.byteLength
    + slot.cardSearchIndices.byteLength
  );
}

export function getMedleyExactRawCandidateScore(
  slot: MedleyExactRawCandidateSlotView,
  candidateIndex: number,
): number {
  return slot.scores[candidateIndex] ?? Number.NEGATIVE_INFINITY;
}

export function getMedleyExactRawCandidateSourceIndex(
  slot: MedleyExactRawCandidateSlotView,
  candidateIndex: number,
): number {
  return slot.sourceIndices[candidateIndex] ?? -1;
}

export function getMedleyExactRawCandidateCardIdAt(
  slot: MedleyExactRawCandidateSlotView,
  candidateIndex: number,
  cardIndex: number,
): number {
  return slot.cardIds[candidateIndex * MEDLEY_TEAM_SIZE + cardIndex] ?? -1;
}

export function getMedleyExactRawCandidateCardSearchIndexAt(
  slot: MedleyExactRawCandidateSlotView,
  candidateIndex: number,
  cardIndex: number,
): number {
  return slot.cardSearchIndices[candidateIndex * MEDLEY_TEAM_SIZE + cardIndex] ?? -1;
}

export function copyMedleyExactRawCandidateCardIds(
  slot: MedleyExactRawCandidateSlotView,
  candidateIndex: number,
): number[] {
  const cardIds: number[] = [];
  for (let cardIndex = 0; cardIndex < MEDLEY_TEAM_SIZE; cardIndex += 1) {
    const cardId = getMedleyExactRawCandidateCardIdAt(slot, candidateIndex, cardIndex);
    if (cardId >= 0) {
      cardIds.push(cardId);
    }
  }
  return cardIds;
}

export function copyMedleyExactRawCandidateCardSearchIndices(
  slot: MedleyExactRawCandidateSlotView,
  candidateIndex: number,
): number[] {
  const cardSearchIndices: number[] = [];
  for (let cardIndex = 0; cardIndex < MEDLEY_TEAM_SIZE; cardIndex += 1) {
    const cardSearchIndex = getMedleyExactRawCandidateCardSearchIndexAt(slot, candidateIndex, cardIndex);
    if (cardSearchIndex >= 0) {
      cardSearchIndices.push(cardSearchIndex);
    }
  }
  return cardSearchIndices;
}

export function medleyExactRawCandidatesOverlap(
  leftSlot: MedleyExactRawCandidateSlotView,
  leftIndex: number,
  rightSlot: MedleyExactRawCandidateSlotView,
  rightIndex: number,
): boolean {
  for (let leftCardIndex = 0; leftCardIndex < MEDLEY_TEAM_SIZE; leftCardIndex += 1) {
    const leftCardId = getMedleyExactRawCandidateCardIdAt(leftSlot, leftIndex, leftCardIndex);
    if (leftCardId < 0) {
      continue;
    }
    for (let rightCardIndex = 0; rightCardIndex < MEDLEY_TEAM_SIZE; rightCardIndex += 1) {
      if (leftCardId === getMedleyExactRawCandidateCardIdAt(rightSlot, rightIndex, rightCardIndex)) {
        return true;
      }
    }
  }
  return false;
}

export function getMedleyExactRawCandidateMirrorProfile(
  mirror: MedleyExactRawCandidateMirror,
  candidatesBySlot?: readonly MedleyTeamCandidate[][],
): Record<string, unknown> {
  const lengths = mirror.slots.map((slot) => slot.length);
  const capacities = mirror.slots.map((slot) => slot.capacity);
  const mismatchCounts = mirror.slots.map((slot) => slot.mismatchCount);
  const candidateCountsBySlot = candidatesBySlot?.map((candidates) => candidates.length) ?? null;
  const lengthMismatchCount = candidateCountsBySlot
    ? lengths.filter((length, index) => length !== candidateCountsBySlot[index]).length
    : null;
  const retainedBytes = mirror.slots.reduce((sum, slot) => (
    sum + getMedleyExactRawCandidateSlotBytes(slot)
  ), 0);
  return {
    enabled: true,
    representation: "typed-array-struct-of-arrays",
    fields: [
      "score",
      "averageScore",
      "maxScore",
      "minScore",
      "sourceIndex",
      "cardId0..4",
      "cardSearchIndex0..4",
    ],
    rebuildCount: mirror.rebuildCount,
    appendCount: mirror.appendCount,
    skippedAppendCount: mirror.skippedAppendCount,
    maxCandidateTotal: mirror.maxCandidateTotal,
    disabled: mirror.disabledReason !== null,
    disabledReason: mirror.disabledReason,
    lengths,
    candidateCountsBySlot,
    lengthMismatchCount,
    capacities,
    countTotal: lengths.reduce((sum, count) => sum + count, 0),
    capacityTotal: capacities.reduce((sum, count) => sum + count, 0),
    mismatchCounts,
    mismatchCountTotal: mismatchCounts.reduce((sum, count) => sum + count, 0),
    retainedMiB: roundMiB(retainedBytes),
  };
}
