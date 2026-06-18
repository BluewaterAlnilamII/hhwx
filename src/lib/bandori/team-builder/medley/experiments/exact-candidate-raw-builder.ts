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

export type MedleyExactRawCandidateMirrorSlot = {
  score: Int32Array;
  averageScore: Int32Array;
  maxScore: Int32Array;
  minScore: Int32Array;
  sourceIndex: Int32Array;
  cardIds: Int32Array;
  length: number;
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
    score: new Int32Array(capacity),
    averageScore: new Int32Array(capacity),
    maxScore: new Int32Array(capacity),
    minScore: new Int32Array(capacity),
    sourceIndex: new Int32Array(capacity),
    cardIds: new Int32Array(capacity * MEDLEY_TEAM_SIZE),
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
  nextScore.set(slot.score.subarray(0, slot.length));
  slot.score = nextScore;

  const nextAverageScore = new Int32Array(nextCapacity);
  nextAverageScore.set(slot.averageScore.subarray(0, slot.length));
  slot.averageScore = nextAverageScore;

  const nextMaxScore = new Int32Array(nextCapacity);
  nextMaxScore.set(slot.maxScore.subarray(0, slot.length));
  slot.maxScore = nextMaxScore;

  const nextMinScore = new Int32Array(nextCapacity);
  nextMinScore.set(slot.minScore.subarray(0, slot.length));
  slot.minScore = nextMinScore;

  const nextSourceIndex = new Int32Array(nextCapacity);
  nextSourceIndex.set(slot.sourceIndex.subarray(0, slot.length));
  slot.sourceIndex = nextSourceIndex;

  const nextCardIds = new Int32Array(nextCapacity * MEDLEY_TEAM_SIZE);
  nextCardIds.set(slot.cardIds.subarray(0, slot.length * MEDLEY_TEAM_SIZE));
  slot.cardIds = nextCardIds;

  slot.capacity = nextCapacity;
}

function appendMedleyExactRawCandidateMirrorSlot(
  slot: MedleyExactRawCandidateMirrorSlot,
  candidate: MedleyTeamCandidate,
  sourceIndex: number,
): void {
  const index = slot.length;
  ensureMedleyExactRawCandidateMirrorSlotCapacity(slot, index + 1);
  slot.score[index] = candidate.result.score;
  slot.averageScore[index] = candidate.result.averageScore;
  slot.maxScore[index] = candidate.result.maxScore;
  slot.minScore[index] = candidate.result.minScore;
  slot.sourceIndex[index] = sourceIndex;

  const baseCardIndex = index * MEDLEY_TEAM_SIZE;
  for (let cardIndex = 0; cardIndex < MEDLEY_TEAM_SIZE; cardIndex += 1) {
    slot.cardIds[baseCardIndex + cardIndex] = getMedleyTeamCandidateCardIdAt(candidate, cardIndex) ?? -1;
  }

  if (
    slot.score[index] !== candidate.result.score
    || slot.averageScore[index] !== candidate.result.averageScore
    || slot.maxScore[index] !== candidate.result.maxScore
    || slot.minScore[index] !== candidate.result.minScore
    || slot.sourceIndex[index] !== sourceIndex
  ) {
    slot.mismatchCount += 1;
  }
  for (let cardIndex = 0; cardIndex < MEDLEY_TEAM_SIZE; cardIndex += 1) {
    if (slot.cardIds[baseCardIndex + cardIndex] !== (getMedleyTeamCandidateCardIdAt(candidate, cardIndex) ?? -1)) {
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
    sum
    + slot.score.byteLength
    + slot.averageScore.byteLength
    + slot.maxScore.byteLength
    + slot.minScore.byteLength
    + slot.sourceIndex.byteLength
    + slot.cardIds.byteLength
  ), 0);
  return {
    enabled: true,
    representation: "typed-array-struct-of-arrays",
    fields: ["score", "averageScore", "maxScore", "minScore", "sourceIndex", "cardId0..4"],
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
