/*
 * Exact candidate-join experiment for medley search.
 *
 * The join path enumerates slot candidate prefixes and then searches for disjoint triples. It
 * is kept opt-in because candidate prefixes can explode before proving anything useful.
 */

import { compareMedleyResultLike, evaluateMedleySlotCandidateWithCache, sortMedleyCandidates } from "../candidates";
import { getMedleyPruningThreshold } from "../configurations";
import { MEDLEY_TEAM_COUNT, MEDLEY_TEAM_SIZE } from "../constants";
import { buildMedleyResult } from "../results";
import { medleyCandidatesOverlap } from "../seeds";
import { estimateMedleyRemainingScoreUpperBound } from "../upper/capacity";
import { estimateMedleySlotBranchScoreUpperBound } from "../upper/skill-context";
import {
  CHARACTER_MASK_SEGMENT_BITS,
  estimateSearchScopeScoreUpperBound,
  hasCharacterIndexInMask,
} from "@/lib/bandori/team-builder/core";
import type {
  BandoriMedleyTeamSearchProfilingStats,
  BandoriMedleyTeamSearchResult,
  BandoriMedleyTeamSearchStats,
  MedleyExactCandidateJoinResult,
  MedleyExactCandidateJoinSolveResult,
  MedleyExactSlotCandidateGenerator,
  MedleyExactSlotCandidateSearchNode,
  MedleySlotSearch,
  MedleyTeamCandidate,
} from "../types";
import type { BandoriAreaItemConfiguration, SearchCard } from "@/lib/bandori/team-builder/core";

export function pushMedleyExactSlotNode(
  heap: MedleyExactSlotCandidateSearchNode[],
  node: MedleyExactSlotCandidateSearchNode,
): void {
  heap.push(node);
  let index = heap.length - 1;
  while (index > 0) {
    const parentIndex = Math.floor((index - 1) / 2);
    if (heap[parentIndex].key >= node.key) {
      break;
    }
    heap[index] = heap[parentIndex];
    index = parentIndex;
  }
  heap[index] = node;
}

export function popMedleyExactSlotNode(
  heap: MedleyExactSlotCandidateSearchNode[],
): MedleyExactSlotCandidateSearchNode | null {
  const root = heap[0];
  if (!root) {
    return null;
  }
  const tail = heap.pop();
  if (tail && heap.length > 0) {
    let index = 0;
    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      if (leftIndex >= heap.length) {
        break;
      }
      const childIndex = rightIndex < heap.length && heap[rightIndex].key > heap[leftIndex].key
        ? rightIndex
        : leftIndex;
      if (heap[childIndex].key <= tail.key) {
        break;
      }
      heap[index] = heap[childIndex];
      index = childIndex;
    }
    heap[index] = tail;
  }
  return root;
}

export function estimateMedleyExactSlotNodeUpperBound(
  slot: MedleySlotSearch,
  selectedCards: SearchCard[],
  startIndex: number,
  bannedCardIds: Set<number>,
  usedCharacterMaskLow: number,
  usedCharacterMaskHigh: number,
  selectedPower: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): number {
  const contextBranchScoreUpperBound = estimateSearchScopeScoreUpperBound(
    selectedCards,
    slot.upperBoundIndex,
    slot.searchCards,
    startIndex,
    usedCharacterMaskLow,
    usedCharacterMaskHigh,
    slot.baseScoreRatePerPower,
    undefined,
    selectedPower,
  );
  if (!Number.isFinite(contextBranchScoreUpperBound)) {
    return Number.NEGATIVE_INFINITY;
  }

  const bannedAwareBranchScoreUpperBound = estimateMedleySlotBranchScoreUpperBound(
    slot,
    selectedCards,
    startIndex,
    bannedCardIds,
    usedCharacterMaskLow,
    usedCharacterMaskHigh,
    selectedPower,
    profiling,
    true,
  );
  return Math.min(contextBranchScoreUpperBound, bannedAwareBranchScoreUpperBound);
}

export function createMedleyExactSlotCandidateGenerator(
  slot: MedleySlotSearch,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  isPastDeadline: () => boolean,
  deadlineAt: number,
  nodeSoftLimit: number,
): MedleyExactSlotCandidateGenerator {
  const heap: MedleyExactSlotCandidateSearchNode[] = [];
  const bannedCardIds = new Set<number>();
  let aborted = false;
  let poppedNodes = 0;
  const rootUpperBound = estimateMedleyExactSlotNodeUpperBound(
    slot,
    [],
    0,
    bannedCardIds,
    0,
    0,
    0,
    profiling,
  );
  if (Number.isFinite(rootUpperBound)) {
    pushMedleyExactSlotNode(heap, {
      key: rootUpperBound,
      selectedCards: [],
      startIndex: 0,
      usedCharacterMaskLow: 0,
      usedCharacterMaskHigh: 0,
      selectedPower: 0,
      candidate: null,
    });
  }

  const expandNode = (node: MedleyExactSlotCandidateSearchNode): void => {
    const remaining = MEDLEY_TEAM_SIZE - node.selectedCards.length;
    if (slot.searchCards.length - node.startIndex < remaining) {
      return;
    }

    for (let index = node.startIndex; index <= slot.searchCards.length - remaining; index += 1) {
      if (performance.now() >= deadlineAt) {
        stats.isExhaustive = false;
        stats.timedOut = true;
        stats.searchMode = "bounded";
        return;
      }
      const card = slot.searchCards[index];
      const characterIndex = slot.upperBoundIndex.characterIndexById.get(card.characterId);
      if (
        characterIndex === undefined
        || hasCharacterIndexInMask(node.usedCharacterMaskLow, node.usedCharacterMaskHigh, characterIndex)
      ) {
        continue;
      }

      const isLowCharacterMask = characterIndex < CHARACTER_MASK_SEGMENT_BITS;
      const characterBit = isLowCharacterMask
        ? 1 << characterIndex
        : 1 << (characterIndex - CHARACTER_MASK_SEGMENT_BITS);
      const nextUsedCharacterMaskLow = isLowCharacterMask
        ? node.usedCharacterMaskLow | characterBit
        : node.usedCharacterMaskLow;
      const nextUsedCharacterMaskHigh = isLowCharacterMask
        ? node.usedCharacterMaskHigh
        : node.usedCharacterMaskHigh | characterBit;
      const nextSelectedCards = [...node.selectedCards, card];
      const nextSelectedPower = node.selectedPower + card.effectivePower;
      const nextStartIndex = index + 1;

      if (nextSelectedCards.length === MEDLEY_TEAM_SIZE) {
        const candidate = evaluateMedleySlotCandidateWithCache(
          slot,
          nextSelectedCards,
          server,
          perfectRate,
          stats,
          profiling,
        );
        if (candidate) {
          pushMedleyExactSlotNode(heap, {
            key: candidate.result.score,
            selectedCards: nextSelectedCards,
            startIndex: nextStartIndex,
            usedCharacterMaskLow: nextUsedCharacterMaskLow,
            usedCharacterMaskHigh: nextUsedCharacterMaskHigh,
            selectedPower: nextSelectedPower,
            candidate,
          });
        }
        continue;
      }

      const upperBound = estimateMedleyExactSlotNodeUpperBound(
        slot,
        nextSelectedCards,
        nextStartIndex,
        bannedCardIds,
        nextUsedCharacterMaskLow,
        nextUsedCharacterMaskHigh,
        nextSelectedPower,
        profiling,
      );
      if (Number.isFinite(upperBound)) {
        pushMedleyExactSlotNode(heap, {
          key: upperBound,
          selectedCards: nextSelectedCards,
          startIndex: nextStartIndex,
          usedCharacterMaskLow: nextUsedCharacterMaskLow,
          usedCharacterMaskHigh: nextUsedCharacterMaskHigh,
          selectedPower: nextSelectedPower,
          candidate: null,
        });
      }
    }
  };

  const next = (): MedleyTeamCandidate | null => {
    while (heap.length > 0) {
      if (poppedNodes >= nodeSoftLimit) {
        aborted = true;
        return null;
      }
      if (stats.timedOut || performance.now() >= deadlineAt || isPastDeadline()) {
        stats.isExhaustive = false;
        stats.timedOut = true;
        stats.searchMode = "bounded";
        return null;
      }

      const node = popMedleyExactSlotNode(heap);
      if (!node) {
        return null;
      }
      poppedNodes += 1;
      if (node.candidate) {
        return node.candidate;
      }
      expandNode(node);
    }
    return null;
  };

  return {
    next,
    peekUpperBound: () => heap[0]?.key ?? Number.NEGATIVE_INFINITY,
    hasAborted: () => aborted,
    poppedNodeCount: () => poppedNodes,
  };
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

export function solveMedleyExactCandidateJoin(
  slots: MedleySlotSearch[],
  candidatesBySlot: MedleyTeamCandidate[][],
  configuration: BandoriAreaItemConfiguration,
  incumbentScore: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  deadlineAt: number,
): MedleyExactCandidateJoinSolveResult {
  if (slots.length !== MEDLEY_TEAM_COUNT || candidatesBySlot.some((candidates) => candidates.length === 0)) {
    return { timedOut: false, result: null };
  }

  const slotOrder = slots
    .map((_, index) => index)
    .sort((left, right) => (
      candidatesBySlot[left].length - candidatesBySlot[right].length
      || (candidatesBySlot[right][0]?.result.score ?? Number.NEGATIVE_INFINITY)
        - (candidatesBySlot[left][0]?.result.score ?? Number.NEGATIVE_INFINITY)
      || left - right
    ));
  const firstSlotIndex = slotOrder[0];
  const secondSlotIndex = slotOrder[1];
  const thirdSlotIndex = slotOrder[2];
  const firstCandidates = candidatesBySlot[firstSlotIndex];
  const secondCandidates = candidatesBySlot[secondSlotIndex];
  const thirdCandidates = candidatesBySlot[thirdSlotIndex];
  const thirdCandidateBitsetWordCount = Math.ceil(thirdCandidates.length / 32);
  const containingCandidateBitsByCardId = new Map<number, Uint32Array>();
  thirdCandidates.forEach((candidate, candidateIndex) => {
    const wordIndex = candidateIndex >> 5;
    const bit = 1 << (candidateIndex & 31);
    for (const cardId of candidate.cardIds) {
      let containingCandidateBits = containingCandidateBitsByCardId.get(cardId);
      if (!containingCandidateBits) {
        containingCandidateBits = new Uint32Array(thirdCandidateBitsetWordCount);
        containingCandidateBitsByCardId.set(cardId, containingCandidateBits);
      }
      containingCandidateBits[wordIndex] |= bit;
    }
  });

  let bestResult: BandoriMedleyTeamSearchResult | null = null;
  let localPairCount = 0;
  const bestSecondScore = secondCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY;
  const bestThirdScore = thirdCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY;
  for (const firstCandidate of firstCandidates) {
    if (firstCandidate.result.score + bestSecondScore + bestThirdScore < incumbentScore) {
      break;
    }
    for (const secondCandidate of secondCandidates) {
      profiling.exactCandidateJoinPairCount += 1;
      localPairCount += 1;
      if (
        localPairCount % 4096 === 0
        && (stats.timedOut || performance.now() >= deadlineAt || isPastDeadline())
      ) {
        stats.isExhaustive = false;
        stats.timedOut = true;
        stats.searchMode = "bounded";
        return { timedOut: true, result: bestResult };
      }
      if (firstCandidate.result.score + secondCandidate.result.score + bestThirdScore < incumbentScore) {
        break;
      }
      if (medleyCandidatesOverlap(firstCandidate, secondCandidate)) {
        continue;
      }

      const thirdCandidate = findBestDisjointMedleyExactThirdCandidate(
        thirdCandidates,
        containingCandidateBitsByCardId,
        [...firstCandidate.cardIds, ...secondCandidate.cardIds],
        profiling,
      );
      if (!thirdCandidate) {
        continue;
      }

      const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
      selectedBySong[slots[firstSlotIndex].songIndex] = firstCandidate;
      selectedBySong[slots[secondSlotIndex].songIndex] = secondCandidate;
      selectedBySong[slots[thirdSlotIndex].songIndex] = thirdCandidate;
      bestResult = compareMedleyResultLike(bestResult, buildMedleyResult(slots, selectedBySong, configuration));
    }
  }

  return { timedOut: false, result: bestResult };
}

export function searchMedleyConfigurationByExactCandidateJoin(
  results: BandoriMedleyTeamSearchResult[],
  resultLimit: number,
  slots: MedleySlotSearch[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  isPastDeadline: () => boolean,
  deadlineAt: number,
  candidateSoftLimit: number,
  nodeSoftLimit: number,
): MedleyExactCandidateJoinResult {
  profiling.exactCandidateJoinCallCount += 1;
  const incumbentScore = getMedleyPruningThreshold(results, resultLimit);
  if (resultLimit !== 1 || slots.length !== MEDLEY_TEAM_COUNT || !Number.isFinite(incumbentScore)) {
    profiling.exactCandidateJoinAbortCount += 1;
    return { proved: false, result: null };
  }

  const generators = slots.map((slot) => createMedleyExactSlotCandidateGenerator(
    slot,
    server,
    perfectRate,
    stats,
    profiling,
    isPastDeadline,
    deadlineAt,
    nodeSoftLimit,
  ));
  const candidatesBySlot: MedleyTeamCandidate[][] = Array.from({ length: slots.length }, () => []);
  const bestSlotScores: number[] = [];

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    const topCandidate = generators[slotIndex].next();
    if (stats.timedOut || generators[slotIndex].hasAborted() || !topCandidate) {
      profiling.exactCandidateJoinAbortCount += 1;
      profiling.exactCandidateJoinPoppedNodeCount += generators.reduce((sum, generator) => (
        sum + generator.poppedNodeCount()
      ), 0);
      return { proved: false, result: null };
    }
    candidatesBySlot[slotIndex].push(topCandidate);
    bestSlotScores[slotIndex] = topCandidate.result.score;
  }

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    const relaxedOtherUpper = bestSlotScores.reduce((sum, score, index) => (
      index === slotIndex ? sum : sum + score
    ), 0);
    const remainingOtherUpper = estimateMedleyRemainingScoreUpperBound(
      slots,
      slots.map((_, index) => index).filter((index) => index !== slotIndex),
      new Set<number>(),
      profiling,
      true,
      true,
      slots.length <= 250,
    );
    const otherUpper = Number.isFinite(remainingOtherUpper)
      ? Math.min(relaxedOtherUpper, remainingOtherUpper)
      : relaxedOtherUpper;
    const cutoff = incumbentScore - otherUpper;
    const generator = generators[slotIndex];
    while (generator.peekUpperBound() >= cutoff) {
      if (performance.now() >= deadlineAt) {
        stats.isExhaustive = false;
        stats.timedOut = true;
        stats.searchMode = "bounded";
        profiling.exactCandidateJoinAbortCount += 1;
        profiling.exactCandidateJoinGeneratedCandidateCount += candidatesBySlot.reduce((sum, candidates) => (
          sum + candidates.length
        ), 0);
        profiling.exactCandidateJoinMaxCandidateCount = Math.max(
          profiling.exactCandidateJoinMaxCandidateCount,
          ...candidatesBySlot.map((candidates) => candidates.length),
        );
        profiling.exactCandidateJoinPoppedNodeCount += generators.reduce((sum, currentGenerator) => (
          sum + currentGenerator.poppedNodeCount()
        ), 0);
        return { proved: false, result: null };
      }
      if (candidatesBySlot[slotIndex].length >= candidateSoftLimit) {
        profiling.exactCandidateJoinAbortCount += 1;
        profiling.exactCandidateJoinGeneratedCandidateCount += candidatesBySlot.reduce((sum, candidates) => (
          sum + candidates.length
        ), 0);
        profiling.exactCandidateJoinMaxCandidateCount = Math.max(
          profiling.exactCandidateJoinMaxCandidateCount,
          ...candidatesBySlot.map((candidates) => candidates.length),
        );
        profiling.exactCandidateJoinPoppedNodeCount += generators.reduce((sum, currentGenerator) => (
          sum + currentGenerator.poppedNodeCount()
        ), 0);
        return { proved: false, result: null };
      }

      const candidate = generator.next();
      if (stats.timedOut || generator.hasAborted()) {
        profiling.exactCandidateJoinAbortCount += 1;
        profiling.exactCandidateJoinGeneratedCandidateCount += candidatesBySlot.reduce((sum, candidates) => (
          sum + candidates.length
        ), 0);
        profiling.exactCandidateJoinMaxCandidateCount = Math.max(
          profiling.exactCandidateJoinMaxCandidateCount,
          ...candidatesBySlot.map((candidates) => candidates.length),
        );
        profiling.exactCandidateJoinPoppedNodeCount += generators.reduce((sum, currentGenerator) => (
          sum + currentGenerator.poppedNodeCount()
        ), 0);
        return { proved: false, result: null };
      }
      if (!candidate) {
        break;
      }
      if (candidate.result.score >= cutoff) {
        candidatesBySlot[slotIndex].push(candidate);
      }
    }
  }

  candidatesBySlot.forEach(sortMedleyCandidates);
  const generatedCandidateCount = candidatesBySlot.reduce((sum, candidates) => sum + candidates.length, 0);
  profiling.exactCandidateJoinGeneratedCandidateCount += generatedCandidateCount;
  profiling.exactCandidateJoinMaxCandidateCount = Math.max(
    profiling.exactCandidateJoinMaxCandidateCount,
    ...candidatesBySlot.map((candidates) => candidates.length),
  );
  profiling.exactCandidateJoinPoppedNodeCount += generators.reduce((sum, generator) => (
    sum + generator.poppedNodeCount()
  ), 0);
  const joinResult = solveMedleyExactCandidateJoin(
    slots,
    candidatesBySlot,
    configuration,
    incumbentScore,
    profiling,
    stats,
    isPastDeadline,
    deadlineAt,
  );
  if (joinResult.timedOut) {
    profiling.exactCandidateJoinAbortCount += 1;
    return { proved: false, result: joinResult.result };
  }
  const result = joinResult.result;
  if (result && result.score > incumbentScore) {
    profiling.exactCandidateJoinImprovementCount += 1;
    profiling.bestExactCandidateJoinImprovement = Math.max(
      profiling.bestExactCandidateJoinImprovement,
      result.score - incumbentScore,
    );
  }
  profiling.exactCandidateJoinCompletedCount += 1;
  return { proved: true, result };
}
