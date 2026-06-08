/*
 * Bitset helpers for exact candidate-join card-conflict checks.
 *
 * These utilities only make disjointness queries cheap. They encode exact cardId membership,
 * so bitset availability checks are equivalent to cardId disjointness checks.
 */

import type { BandoriMedleyTeamSearchProfilingStats, MedleyTeamCandidate } from "../types";

export function buildMedleyExactContainingCandidateBitsByCardId(
  candidates: MedleyTeamCandidate[],
  wordCount: number,
): Map<number, Uint32Array> {
  const containingCandidateBitsByCardId = new Map<number, Uint32Array>();
  candidates.forEach((candidate, candidateIndex) => {
    const wordIndex = candidateIndex >> 5;
    const bit = 1 << (candidateIndex & 31);
    for (const cardId of candidate.cardIds) {
      let containingCandidateBits = containingCandidateBitsByCardId.get(cardId);
      if (!containingCandidateBits) {
        containingCandidateBits = new Uint32Array(wordCount);
        containingCandidateBitsByCardId.set(cardId, containingCandidateBits);
      }
      containingCandidateBits[wordIndex] |= bit;
    }
  });
  return containingCandidateBitsByCardId;
}

export function writeMedleyExactForbiddenCandidateBits(
  candidate: MedleyTeamCandidate,
  containingCandidateBitsByCardId: Map<number, Uint32Array>,
  wordCount: number,
  forbiddenBits: Uint32Array,
): Uint32Array {
  let containingBits0: Uint32Array | undefined;
  let containingBits1: Uint32Array | undefined;
  let containingBits2: Uint32Array | undefined;
  let containingBits3: Uint32Array | undefined;
  let containingBits4: Uint32Array | undefined;
  let containingBitsCount = 0;
  for (const cardId of candidate.cardIds) {
    const containingCandidateBits = containingCandidateBitsByCardId.get(cardId);
    if (!containingCandidateBits) {
      continue;
    }
    switch (containingBitsCount) {
      case 0:
        containingBits0 = containingCandidateBits;
        break;
      case 1:
        containingBits1 = containingCandidateBits;
        break;
      case 2:
        containingBits2 = containingCandidateBits;
        break;
      case 3:
        containingBits3 = containingCandidateBits;
        break;
      default:
        containingBits4 = containingCandidateBits;
        break;
    }
    containingBitsCount += 1;
  }
  switch (containingBitsCount) {
    case 0:
      forbiddenBits.fill(0);
      break;
    case 1:
      forbiddenBits.set(containingBits0!);
      break;
    case 2: {
      const firstBits = containingBits0!;
      const secondBits = containingBits1!;
      for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
        forbiddenBits[wordIndex] = firstBits[wordIndex] | secondBits[wordIndex];
      }
      break;
    }
    case 3: {
      const firstBits = containingBits0!;
      const secondBits = containingBits1!;
      const thirdBits = containingBits2!;
      for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
        forbiddenBits[wordIndex] = firstBits[wordIndex] | secondBits[wordIndex] | thirdBits[wordIndex];
      }
      break;
    }
    case 4: {
      const firstBits = containingBits0!;
      const secondBits = containingBits1!;
      const thirdBits = containingBits2!;
      const fourthBits = containingBits3!;
      for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
        forbiddenBits[wordIndex] = (
          firstBits[wordIndex]
          | secondBits[wordIndex]
          | thirdBits[wordIndex]
          | fourthBits[wordIndex]
        );
      }
      break;
    }
    default: {
      const firstBits = containingBits0!;
      const secondBits = containingBits1!;
      const thirdBits = containingBits2!;
      const fourthBits = containingBits3!;
      const fifthBits = containingBits4!;
      for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
        forbiddenBits[wordIndex] = (
          firstBits[wordIndex]
          | secondBits[wordIndex]
          | thirdBits[wordIndex]
          | fourthBits[wordIndex]
          | fifthBits[wordIndex]
        );
      }
      break;
    }
  }
  return forbiddenBits;
}

export function buildMedleyExactForbiddenCandidateBits(
  candidate: MedleyTeamCandidate,
  containingCandidateBitsByCardId: Map<number, Uint32Array>,
  wordCount: number,
): Uint32Array {
  return writeMedleyExactForbiddenCandidateBits(
    candidate,
    containingCandidateBitsByCardId,
    wordCount,
    new Uint32Array(wordCount),
  );
}

export function findBestAvailableMedleyExactCandidateByBits(
  candidates: MedleyTeamCandidate[],
  wordCount: number,
  primaryForbiddenBits: Uint32Array,
  secondaryForbiddenBits?: Uint32Array,
): MedleyTeamCandidate | null {
  const lastWordIndex = wordCount - 1;
  const lastWordRemainder = candidates.length & 31;
  const lastWordMask = lastWordRemainder === 0
    ? 0xffffffff
    : 0xffffffff >>> (32 - lastWordRemainder);
  if (secondaryForbiddenBits) {
    for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
      let availableBits = (~(
        primaryForbiddenBits[wordIndex]
        | secondaryForbiddenBits[wordIndex]
      )) >>> 0;
      if (wordIndex === lastWordIndex) {
        availableBits &= lastWordMask;
      }
      if (availableBits !== 0) {
        const lowestAvailableBit = availableBits & -availableBits;
        const bitIndex = 31 - Math.clz32(lowestAvailableBit);
        return candidates[wordIndex * 32 + bitIndex] ?? null;
      }
    }
    return null;
  }
  for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
    let availableBits = (~primaryForbiddenBits[wordIndex]) >>> 0;
    if (wordIndex === lastWordIndex) {
      availableBits &= lastWordMask;
    }
    if (availableBits !== 0) {
      const lowestAvailableBit = availableBits & -availableBits;
      const bitIndex = 31 - Math.clz32(lowestAvailableBit);
      return candidates[wordIndex * 32 + bitIndex] ?? null;
    }
  }
  return null;
}

export function medleyCandidateCardIdsOverlap(leftCardIds: number[], rightCardIds: number[]): boolean {
  for (let leftIndex = 0; leftIndex < leftCardIds.length; leftIndex += 1) {
    const leftCardId = leftCardIds[leftIndex];
    for (let rightIndex = 0; rightIndex < rightCardIds.length; rightIndex += 1) {
      if (leftCardId === rightCardIds[rightIndex]) {
        return true;
      }
    }
  }
  return false;
}

export function medleyExactCandidatesOverlap(left: MedleyTeamCandidate, right: MedleyTeamCandidate): boolean {
  return medleyCandidateCardIdsOverlap(left.cardIds, right.cardIds);
}

export function findBestDisjointMedleyExactCandidateByCardIds(
  candidates: MedleyTeamCandidate[],
  forbiddenCardIds: number[],
): MedleyTeamCandidate | null {
  for (const candidate of candidates) {
    if (!medleyCandidateCardIdsOverlap(forbiddenCardIds, candidate.cardIds)) {
      return candidate;
    }
  }
  return null;
}

export function findBestDisjointMedleyExactThirdCandidate(
  candidates: MedleyTeamCandidate[],
  containingCandidateBitsByCardId: Map<number, Uint32Array>,
  bannedCardIds: number[],
  profiling: BandoriMedleyTeamSearchProfilingStats,
): MedleyTeamCandidate | null {
  profiling.exactCandidateJoinThirdQueryCount += 1;
  const wordCount = Math.ceil(candidates.length / 32);
  const forbiddenCandidateBits = new Uint32Array(wordCount);
  for (const cardId of bannedCardIds) {
    const containingCandidateBits = containingCandidateBitsByCardId.get(cardId);
    if (!containingCandidateBits) {
      continue;
    }
    for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
      forbiddenCandidateBits[wordIndex] |= containingCandidateBits[wordIndex];
    }
  }

  for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
    let availableBits = (~forbiddenCandidateBits[wordIndex]) >>> 0;
    if (wordIndex === wordCount - 1 && candidates.length % 32 !== 0) {
      availableBits &= 0xffffffff >>> (32 - (candidates.length % 32));
    }
    if (availableBits !== 0) {
      const lowestAvailableBit = availableBits & -availableBits;
      const bitIndex = 31 - Math.clz32(lowestAvailableBit);
      return candidates[wordIndex * 32 + bitIndex] ?? null;
    }
  }
  return null;
}
