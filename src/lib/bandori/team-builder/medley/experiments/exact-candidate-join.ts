/*
 * Exact candidate-join proof path for hard medley configurations.
 *
 * This module generates score-ordered slot candidate prefixes, proves unseen frontiers, and
 * searches card-disjoint triples. It may be auto-enabled for large locked/all scopes, but an
 * abort, timeout, or unclosed frontier must leave the configuration bounded.
 */

import { compareMedleyResultLike, evaluateMedleySlotCandidateWithCache, sortMedleyCandidates } from "../candidates";
import { getMedleyPruningThreshold } from "../configurations";
import { MEDLEY_TEAM_COUNT, MEDLEY_TEAM_SIZE } from "../constants";
import { buildMedleyResult } from "../results";
import {
  buildMedleyExactContainingCandidateBitsByCardId,
  buildMedleyExactForbiddenCandidateBits,
  findBestAvailableMedleyExactCandidateByBits,
  findBestDisjointMedleyExactCandidateByCardIds,
  medleyExactCandidatesOverlap,
  writeMedleyExactForbiddenCandidateBits,
} from "./exact-candidate-join-bitsets";
import {
  MEDLEY_EXACT_CANDIDATE_JOIN_CAPACITY_COMPLEMENT_MARGIN,
  MEDLEY_EXACT_CANDIDATE_JOIN_DEEP_PAIR_UNSEEN_MARGIN,
  MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_BUDGET_DEEP_PAIR_UNSEEN_MARGIN,
  MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_PAIR_COARSE_CACHE_BUCKET,
  MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_PAIR_FINE_CACHE_BUCKET,
  MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_PAIR_FINE_MIN_RECORD_COUNT,
  MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_PAIR_FINE_RECORD_THRESHOLD,
  MEDLEY_EXACT_CANDIDATE_JOIN_MIDDLE_FIRST_THIRD_SHORTLIST_SIZE,
  MEDLEY_EXACT_CANDIDATE_JOIN_PARETO_REMAINING_MAX_SLOT_CARDS,
  MEDLEY_EXACT_CANDIDATE_JOIN_THIRD_SHORTLIST_SIZE,
} from "./exact-candidate-join-constants";
import {
  popMedleyExactSlotNode,
  popMedleyExactSlotUpperNode,
  pushMedleyExactSlotNode,
  pushMedleyExactSlotUpperNode,
  type MedleyExactSlotUpperHeapNode,
} from "./exact-candidate-join-heap";
import {
  estimateMedleyCapacityAssignmentScoreUpperBound,
  estimateMedleyRemainingScoreUpperBound,
} from "../upper/capacity";
import {
  estimateMedleySlotBranchScoreUpperBound,
} from "../upper/skill-context";
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
  MedleyExactSlotCandidateGlobalPruning,
  MedleyExactSlotCandidateGenerator,
  MedleyExactSlotCandidateSearchNode,
  MedleySlotSearch,
  MedleyTeamCandidate,
} from "../types";
import type { BandoriAreaItemConfiguration, BandoriTeamSearchResult, SearchCard } from "@/lib/bandori/team-builder/core";

function createMedleyExactCandidateSlotThresholdResult(scoreCutoff: number): BandoriTeamSearchResult | undefined {
  if (!Number.isFinite(scoreCutoff)) {
    return undefined;
  }
  return {
    score: scoreCutoff,
    targetValue: scoreCutoff,
    target: "score",
  } as BandoriTeamSearchResult;
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
  scoreCutoff = Number.NEGATIVE_INFINITY,
): number {
  // Candidate generation may drop a branch when any safe optimistic upper is below the
  // cutoff. Taking the lower of two safe uppers stays safe while avoiding wasted exact
  // candidate hydration.
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
  if (!Number.isFinite(contextBranchScoreUpperBound) || contextBranchScoreUpperBound < scoreCutoff) {
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
  // The generator is ordered by optimistic slot upper bound. Exhaustion proves that no unseen
  // slot candidate remains above the active cutoff; budget/deadline aborts are reported to the
  // caller so exact status is not inferred from a truncated prefix.
  const heap: MedleyExactSlotCandidateSearchNode[] = [];
  const slotUpperHeap: MedleyExactSlotUpperHeapNode[] = [];
  const activeHeapNodes = new Set<MedleyExactSlotCandidateSearchNode>();
  const bannedCardIds = new Set<number>();
  const globalComplementUpperCache = new Map<string, number>();
  const globalPairComplementUpperCache = new Map<string, number>();
  const pairUpperQueryCache = new Map<string, MedleyExactCandidatePairUpperQuery>();
  let aborted = false;
  let poppedNodes = 0;
  let heapKeyMode: "slot" | "global" = "slot";
  let heapGlobalKeySignature: string | null = null;
  let maxPruningScoreCutoff = Number.NEGATIVE_INFINITY;
  const pushHeapNode = (node: MedleyExactSlotCandidateSearchNode): void => {
    activeHeapNodes.add(node);
    pushMedleyExactSlotNode(heap, node);
    pushMedleyExactSlotUpperNode(slotUpperHeap, { key: node.slotUpperBound, node });
  };
  const peekMaxHeapSlotUpperBound = (): number => {
    while (slotUpperHeap.length > 0 && !activeHeapNodes.has(slotUpperHeap[0].node)) {
      popMedleyExactSlotUpperNode(slotUpperHeap);
    }
    return slotUpperHeap[0]?.key ?? Number.NEGATIVE_INFINITY;
  };
  const rootUpperBound = estimateMedleyExactSlotNodeUpperBound(
    slot,
    [],
    0,
    bannedCardIds,
    0,
    0,
    0,
    profiling,
    Number.NEGATIVE_INFINITY,
  );
  if (Number.isFinite(rootUpperBound)) {
    pushHeapNode({
      key: rootUpperBound,
      slotUpperBound: rootUpperBound,
      selectedCards: [],
      startIndex: 0,
      usedCharacterMaskLow: 0,
      usedCharacterMaskHigh: 0,
      selectedPower: 0,
      candidate: null,
    });
  }

  const estimateGeneratedPairComplementUpperBound = (
    selectedCardIds: number[],
    globalPruning?: MedleyExactSlotCandidateGlobalPruning,
    minimumRelevantScore = globalPruning?.pairUnseenUpperBound ?? Number.NEGATIVE_INFINITY,
  ): number | null => {
    const pairUnseenUpperBound = globalPruning?.pairUnseenUpperBound;
    if (
      !globalPruning?.candidatesBySlot
      || pairUnseenUpperBound === undefined
      || !Number.isFinite(pairUnseenUpperBound)
    ) {
      return null;
    }
    const finitePairUnseenUpperBound = pairUnseenUpperBound;
    if (
      globalPruning.useCapacityComplementUpper === false
      && finitePairUnseenUpperBound >= minimumRelevantScore
    ) {
      return finitePairUnseenUpperBound;
    }
    const [leftSlotIndex, rightSlotIndex] = globalPruning.remainingSlotIndices;
    const leftCandidates = globalPruning.candidatesBySlot[leftSlotIndex] ?? [];
    const rightCandidates = globalPruning.candidatesBySlot[rightSlotIndex] ?? [];
    const key = [
      leftSlotIndex,
      leftCandidates.length,
      rightSlotIndex,
      rightCandidates.length,
      finitePairUnseenUpperBound,
      minimumRelevantScore,
      selectedCardIds.join(","),
    ].join(":");
    const cached = globalPairComplementUpperCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const pairUpperQueryKey = [
      leftSlotIndex,
      leftCandidates.length,
      rightSlotIndex,
      rightCandidates.length,
    ].join(":");
    let pairUpperQuery = pairUpperQueryCache.get(pairUpperQueryKey);
    if (!pairUpperQuery) {
      pairUpperQuery = buildMedleyExactCandidatePairUpperQuery(leftCandidates, rightCandidates);
      pairUpperQueryCache.set(pairUpperQueryKey, pairUpperQuery);
    }
    const generatedPairUpperBound = estimateGeneratedMedleyExactCandidatePairUpperExcludingCardIds(
      pairUpperQuery,
      selectedCardIds,
      minimumRelevantScore,
      profiling,
    );
    const complementUpperBound = Math.max(
      generatedPairUpperBound,
      finitePairUnseenUpperBound,
    );
    globalPairComplementUpperCache.set(key, complementUpperBound);
    return complementUpperBound;
  };

  const estimateGlobalPrunedUpperBound = (
    slotUpperBound: number,
    selectedCards: SearchCard[],
    globalPruning?: MedleyExactSlotCandidateGlobalPruning,
  ): number => {
    if (
      !globalPruning
      || selectedCards.length < MEDLEY_TEAM_SIZE
      || !Number.isFinite(slotUpperBound)
    ) {
      return slotUpperBound;
    }
    const selectedCardIds = selectedCards.map((card) => card.cardId).sort((left, right) => left - right);
    const [leftSlotIndex, rightSlotIndex] = globalPruning.remainingSlotIndices;
    const leftCandidateCount = globalPruning.candidatesBySlot?.[leftSlotIndex]?.length ?? 0;
    const rightCandidateCount = globalPruning.candidatesBySlot?.[rightSlotIndex]?.length ?? 0;
    const key = [
      leftSlotIndex,
      leftCandidateCount,
      rightSlotIndex,
      rightCandidateCount,
      globalPruning.pairUnseenUpperBound ?? "",
      selectedCardIds.join(","),
    ].join(":");
    let complementUpperBound = globalComplementUpperCache.get(key);
    if (complementUpperBound === undefined) {
      complementUpperBound = estimateGeneratedPairComplementUpperBound(
        selectedCardIds,
        globalPruning,
        globalPruning.scoreCutoff - slotUpperBound,
      ) ?? undefined;
      const shouldUseCapacityComplement = (
        globalPruning.useCapacityComplementUpper !== false
        && (
          complementUpperBound === undefined
          || slotUpperBound + complementUpperBound - globalPruning.scoreCutoff
            <= (globalPruning.capacityComplementMargin ?? Number.POSITIVE_INFINITY)
        )
      );
      if (
        shouldUseCapacityComplement
        && (
          complementUpperBound === undefined
          || slotUpperBound + complementUpperBound >= globalPruning.scoreCutoff
        )
      ) {
        const bannedSelectedCardIds = new Set<number>(selectedCardIds);
        const basicCapacityUpperBound = estimateMedleyCapacityAssignmentScoreUpperBound(
          globalPruning.slots,
          globalPruning.remainingSlotIndices,
          bannedSelectedCardIds,
          profiling,
          true,
          false,
          false,
          false,
          true,
        ).upperBound;
        complementUpperBound = complementUpperBound === undefined
          ? basicCapacityUpperBound
          : Math.min(complementUpperBound, basicCapacityUpperBound);
      }
      if (
        shouldUseCapacityComplement
        && Number.isFinite(complementUpperBound)
        && slotUpperBound + (complementUpperBound ?? Number.NEGATIVE_INFINITY) >= globalPruning.scoreCutoff
      ) {
        const bannedSelectedCardIds = new Set<number>(selectedCardIds);
        const tightCapacityUpperBound = estimateMedleyRemainingScoreUpperBound(
          globalPruning.slots,
          globalPruning.remainingSlotIndices,
          bannedSelectedCardIds,
          profiling,
          false,
          true,
          false,
          false,
          false,
        );
        complementUpperBound = Math.min(complementUpperBound ?? Number.POSITIVE_INFINITY, tightCapacityUpperBound);
      }
      complementUpperBound = complementUpperBound ?? Number.POSITIVE_INFINITY;
      globalComplementUpperCache.set(key, complementUpperBound);
    }
    return complementUpperBound === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : slotUpperBound + complementUpperBound;
  };

  const estimateGlobalSearchKey = (
    node: MedleyExactSlotCandidateSearchNode,
    scoreCutoff: number,
    globalPruning: MedleyExactSlotCandidateGlobalPruning,
  ): number => {
    if (!Number.isFinite(node.slotUpperBound)) {
      return Number.NEGATIVE_INFINITY;
    }
    const selectedCardIds = node.selectedCards
      .map((card) => card.cardId)
      .sort((left, right) => left - right);
    const pairComplementUpperBound = estimateGeneratedPairComplementUpperBound(
      selectedCardIds,
      globalPruning,
      globalPruning.scoreCutoff - node.slotUpperBound,
    );
    const pairGlobalUpperBound = pairComplementUpperBound === null
      ? Number.POSITIVE_INFINITY
      : node.slotUpperBound + pairComplementUpperBound;
    return Math.min(
      node.slotUpperBound - scoreCutoff,
      pairGlobalUpperBound - globalPruning.scoreCutoff,
    );
  };

  const estimateSlotSearchKey = (node: MedleyExactSlotCandidateSearchNode): number => (
    node.candidate ? node.candidate.result.score : node.slotUpperBound
  );

  const rebuildHeapKeys = (
    scoreCutoff: number,
    globalPruning?: MedleyExactSlotCandidateGlobalPruning,
  ): void => {
    const globalKeySignature = globalPruning
      ? [
        scoreCutoff,
        globalPruning.scoreCutoff,
        globalPruning.remainingSlotIndices.join(","),
        globalPruning.pairUnseenUpperBound ?? "",
        ...(globalPruning.candidatesBySlot
          ? globalPruning.remainingSlotIndices.map((slotIndex) => (
            globalPruning.candidatesBySlot?.[slotIndex]?.length ?? 0
          ))
          : []),
      ].join(":")
      : null;
    if (
      (globalPruning && heapKeyMode === "global" && heapGlobalKeySignature === globalKeySignature)
      || (!globalPruning && heapKeyMode === "slot")
    ) {
      return;
    }

    const startedAt = performance.now();
    const nodes = heap.splice(0, heap.length);
    heapKeyMode = globalPruning ? "global" : "slot";
    heapGlobalKeySignature = globalKeySignature;
    slotUpperHeap.length = 0;
    activeHeapNodes.clear();
    for (const node of nodes) {
      node.key = globalPruning
        ? estimateGlobalSearchKey(node, scoreCutoff, globalPruning)
        : estimateSlotSearchKey(node);
      if (Number.isFinite(node.key)) {
        pushHeapNode(node);
      }
    }
    profiling.exactCandidateJoinGlobalHeapRekeyCount += 1;
    profiling.exactCandidateJoinGlobalHeapRekeyElapsedMs += performance.now() - startedAt;
  };

  const pushSearchNode = (
    node: MedleyExactSlotCandidateSearchNode,
    scoreCutoff: number,
    globalPruning?: MedleyExactSlotCandidateGlobalPruning,
  ): void => {
    node.key = heapKeyMode === "global" && globalPruning
      ? estimateGlobalSearchKey(node, scoreCutoff, globalPruning)
      : estimateSlotSearchKey(node);
    if (Number.isFinite(node.key)) {
      pushHeapNode(node);
    }
  };

  const expandNode = (
    node: MedleyExactSlotCandidateSearchNode,
    scoreCutoff: number,
    globalPruning?: MedleyExactSlotCandidateGlobalPruning,
  ): void => {
    if (Number.isFinite(scoreCutoff)) {
      maxPruningScoreCutoff = Math.max(maxPruningScoreCutoff, scoreCutoff);
    }
    const remaining = MEDLEY_TEAM_SIZE - node.selectedCards.length;
    if (slot.searchCards.length - node.startIndex < remaining) {
      return;
    }

    for (let index = node.startIndex; index <= slot.searchCards.length - remaining; index += 1) {
      if ((index & 31) === 0 && performance.now() >= deadlineAt) {
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
        const leafUpperBound = estimateMedleyExactSlotNodeUpperBound(
          slot,
          nextSelectedCards,
          nextStartIndex,
          bannedCardIds,
          nextUsedCharacterMaskLow,
          nextUsedCharacterMaskHigh,
          nextSelectedPower,
          profiling,
          scoreCutoff,
        );
        if (!Number.isFinite(leafUpperBound) || leafUpperBound < scoreCutoff) {
          continue;
        }
        const globalLeafUpperBound = estimateGlobalPrunedUpperBound(
          leafUpperBound,
          nextSelectedCards,
          globalPruning,
        );
        if (globalLeafUpperBound < (globalPruning?.scoreCutoff ?? Number.NEGATIVE_INFINITY)) {
          continue;
        }
        const candidateKey = globalPruning?.excludedCandidateKeys
          ? nextSelectedCards
            .map((selectedCard) => selectedCard.cardId)
            .join(",")
          : null;
        if (candidateKey && globalPruning?.excludedCandidateKeys?.has(candidateKey)) {
          continue;
        }
        const candidate = evaluateMedleySlotCandidateWithCache(
          slot,
          nextSelectedCards,
          server,
          perfectRate,
          stats,
          profiling,
          createMedleyExactCandidateSlotThresholdResult(scoreCutoff),
          true,
        );
        if (candidate && candidate.result.score >= scoreCutoff) {
          pushSearchNode({
            key: candidate.result.score,
            slotUpperBound: candidate.result.score,
            selectedCards: nextSelectedCards,
            startIndex: nextStartIndex,
            usedCharacterMaskLow: nextUsedCharacterMaskLow,
            usedCharacterMaskHigh: nextUsedCharacterMaskHigh,
            selectedPower: nextSelectedPower,
            candidate,
          }, scoreCutoff, globalPruning);
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
        scoreCutoff,
      );
      let passesPairGlobalPruning = true;
      if (
        Number.isFinite(upperBound)
        && upperBound >= scoreCutoff
        && nextSelectedCards.length >= MEDLEY_TEAM_SIZE - 1
      ) {
        const selectedCardIds = nextSelectedCards
          .map((selectedCard) => selectedCard.cardId)
          .sort((left, right) => left - right);
        const pairGlobalUpperBound = estimateGeneratedPairComplementUpperBound(
          selectedCardIds,
          globalPruning,
          (globalPruning?.scoreCutoff ?? Number.NEGATIVE_INFINITY) - upperBound,
        );
        passesPairGlobalPruning = pairGlobalUpperBound === null
          || upperBound + pairGlobalUpperBound >= (globalPruning?.scoreCutoff ?? Number.NEGATIVE_INFINITY);
      }
      if (
        Number.isFinite(upperBound)
        && upperBound >= scoreCutoff
        && passesPairGlobalPruning
      ) {
        pushSearchNode({
          key: upperBound,
          slotUpperBound: upperBound,
          selectedCards: nextSelectedCards,
          startIndex: nextStartIndex,
          usedCharacterMaskLow: nextUsedCharacterMaskLow,
          usedCharacterMaskHigh: nextUsedCharacterMaskHigh,
          selectedPower: nextSelectedPower,
          candidate: null,
        }, scoreCutoff, globalPruning);
      }
    }
  };

  const next = (
    scoreCutoff = Number.NEGATIVE_INFINITY,
    globalPruning?: MedleyExactSlotCandidateGlobalPruning,
  ): MedleyTeamCandidate | null => {
    rebuildHeapKeys(scoreCutoff, globalPruning);
    const exhaustedKeyCutoff = globalPruning ? 0 : scoreCutoff;
    while (heap.length > 0) {
      if ((heap[0]?.key ?? Number.NEGATIVE_INFINITY) < exhaustedKeyCutoff) {
        return null;
      }
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
      activeHeapNodes.delete(node);
      if (node.candidate) {
        return node.candidate;
      }
      expandNode(node, scoreCutoff, globalPruning);
    }
    return null;
  };

  return {
    next,
    peekUpperBound: () => (
      heapKeyMode === "slot"
        ? heap[0]?.key ?? Number.NEGATIVE_INFINITY
        : peekMaxHeapSlotUpperBound()
    ),
    canReuseForScoreCutoff: (scoreCutoff: number) => (
      !Number.isFinite(scoreCutoff) || scoreCutoff >= maxPruningScoreCutoff
    ),
    hasAborted: () => aborted,
    poppedNodeCount: () => poppedNodes,
  };
}

type MedleyExactCandidatePairUpperResult = {
  proved: boolean;
  upperBound: number;
  unseenUpperBound: number;
};

type MedleyExactCandidatePairSearchResult = {
  proved: boolean;
  timedOut: boolean;
  leftCandidate: MedleyTeamCandidate | null;
  rightCandidate: MedleyTeamCandidate | null;
};

type MedleyExactCandidatePairRecord = {
  score: number;
  leftCardIds: number[];
  rightCardIds: number[];
};

type MedleyExactCandidatePairRecordCache = {
  records: MedleyExactCandidatePairRecord[];
  scores: number[];
  wordCount: number;
  containingRecordBitsByCardId: Map<number, Uint32Array>;
};

type MedleyExactCandidatePairUpperQuery = {
  leftCandidates: MedleyTeamCandidate[];
  rightCandidates: MedleyTeamCandidate[];
  rightCandidateBitsetWordCount: number;
  containingRightCandidateBitsByCardId: Map<number, Uint32Array>;
  forbiddenRightCandidateBitsByLeftCandidate: WeakMap<MedleyTeamCandidate, Uint32Array>;
  highPairAdaptiveCacheThresholdByCoarseThreshold?: Map<number, number>;
  highPairRecordCache?: Map<number, MedleyExactCandidatePairRecordCache>;
  highPairRecords?: MedleyExactCandidatePairRecord[];
  highPairRecordScores?: number[];
  highPairRecordThreshold?: number;
  highPairRecordBitsetWordCount?: number;
  containingHighPairRecordBitsByCardId?: Map<number, Uint32Array>;
};

type MedleyExactCandidateAnchoredJoinResult = {
  proved: boolean;
  timedOut: boolean;
  result: BandoriMedleyTeamSearchResult | null;
};

function estimateGeneratedMedleyExactCandidatePairUpper(
  leftCandidates: MedleyTeamCandidate[],
  rightCandidates: MedleyTeamCandidate[],
): number {
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const leftCandidate of leftCandidates) {
    bestScore = updateGeneratedMedleyExactCandidatePairUpper(
      leftCandidate,
      rightCandidates,
      bestScore,
    );
  }
  return bestScore;
}

function updateGeneratedMedleyExactCandidatePairUpper(
  candidate: MedleyTeamCandidate,
  otherCandidates: MedleyTeamCandidate[],
  currentBestScore: number,
): number {
  let bestScore = currentBestScore;
  for (const otherCandidate of otherCandidates) {
    if (candidate.result.score + otherCandidate.result.score < bestScore) {
      break;
    }
    if (medleyExactCandidatesOverlap(candidate, otherCandidate)) {
      continue;
    }
    bestScore = Math.max(bestScore, candidate.result.score + otherCandidate.result.score);
    break;
  }
  return bestScore;
}

function buildMedleyExactCandidatePairUpperQuery(
  leftCandidates: MedleyTeamCandidate[],
  rightCandidates: MedleyTeamCandidate[],
): MedleyExactCandidatePairUpperQuery {
  const rightCandidateBitsetWordCount = Math.ceil(rightCandidates.length / 32);
  return {
    leftCandidates,
    rightCandidates,
    rightCandidateBitsetWordCount,
    containingRightCandidateBitsByCardId: buildMedleyExactContainingCandidateBitsByCardId(
      rightCandidates,
      rightCandidateBitsetWordCount,
    ),
    forbiddenRightCandidateBitsByLeftCandidate: new WeakMap<MedleyTeamCandidate, Uint32Array>(),
  };
}

function getForbiddenMedleyExactRightCandidateBits(
  query: MedleyExactCandidatePairUpperQuery,
  leftCandidate: MedleyTeamCandidate,
): Uint32Array {
  const cached = query.forbiddenRightCandidateBitsByLeftCandidate.get(leftCandidate);
  if (cached) {
    return cached;
  }
  const forbiddenBits = buildMedleyExactForbiddenCandidateBits(
    leftCandidate,
    query.containingRightCandidateBitsByCardId,
    query.rightCandidateBitsetWordCount,
  );
  query.forbiddenRightCandidateBitsByLeftCandidate.set(leftCandidate, forbiddenBits);
  return forbiddenBits;
}

function buildBannedMedleyExactRightCandidateBits(
  query: MedleyExactCandidatePairUpperQuery,
  bannedCardIds: Set<number>,
): Uint32Array {
  const forbiddenBits = new Uint32Array(query.rightCandidateBitsetWordCount);
  for (const cardId of bannedCardIds) {
    const containingBits = query.containingRightCandidateBitsByCardId.get(cardId);
    if (!containingBits) {
      continue;
    }
    for (let wordIndex = 0; wordIndex < query.rightCandidateBitsetWordCount; wordIndex += 1) {
      forbiddenBits[wordIndex] |= containingBits[wordIndex];
    }
  }
  return forbiddenBits;
}

function estimateHighMedleyExactCandidatePairRecordUpperCount(
  leftCandidates: MedleyTeamCandidate[],
  rightCandidates: MedleyTeamCandidate[],
  threshold: number,
  stopAfter: number,
): number {
  let upperCount = 0;
  let rightCount = rightCandidates.length;
  for (const leftCandidate of leftCandidates) {
    while (
      rightCount > 0
      && leftCandidate.result.score + rightCandidates[rightCount - 1].result.score <= threshold
    ) {
      rightCount -= 1;
    }
    if (rightCount <= 0) {
      break;
    }
    upperCount += rightCount;
    if (upperCount > stopAfter) {
      break;
    }
  }
  return upperCount;
}

function getHighMedleyExactCandidatePairRecords(
  query: MedleyExactCandidatePairUpperQuery,
  threshold: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyExactCandidatePairRecord[] {
  const coarseCacheThreshold = Number.isFinite(threshold)
    ? Math.floor(threshold / MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_PAIR_COARSE_CACHE_BUCKET)
      * MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_PAIR_COARSE_CACHE_BUCKET
    : threshold;
  query.highPairAdaptiveCacheThresholdByCoarseThreshold ??= new Map();
  let cacheThreshold = query.highPairAdaptiveCacheThresholdByCoarseThreshold.get(coarseCacheThreshold);
  if (cacheThreshold === undefined) {
    const shouldUseFineBucket = Number.isFinite(coarseCacheThreshold)
      && estimateHighMedleyExactCandidatePairRecordUpperCount(
        query.leftCandidates,
        query.rightCandidates,
        coarseCacheThreshold,
        MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_PAIR_FINE_RECORD_THRESHOLD,
      ) > MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_PAIR_FINE_RECORD_THRESHOLD;
    cacheThreshold = shouldUseFineBucket && Number.isFinite(threshold)
      ? Math.floor(threshold / MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_PAIR_FINE_CACHE_BUCKET)
        * MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_PAIR_FINE_CACHE_BUCKET
      : coarseCacheThreshold;
    query.highPairAdaptiveCacheThresholdByCoarseThreshold.set(coarseCacheThreshold, cacheThreshold);
  }
  const cachedRecordSet = query.highPairRecordCache?.get(cacheThreshold);
  if (cachedRecordSet) {
    query.highPairRecords = cachedRecordSet.records;
    query.highPairRecordScores = cachedRecordSet.scores;
    query.highPairRecordThreshold = cacheThreshold;
    query.highPairRecordBitsetWordCount = cachedRecordSet.wordCount;
    query.containingHighPairRecordBitsByCardId = cachedRecordSet.containingRecordBitsByCardId;
    return cachedRecordSet.records;
  }

  const startedAt = performance.now();
  const records: MedleyExactCandidatePairRecord[] = [];
  const bestRightScore = query.rightCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY;
  for (const leftCandidate of query.leftCandidates) {
    if (leftCandidate.result.score + bestRightScore <= cacheThreshold) {
      break;
    }
    for (const rightCandidate of query.rightCandidates) {
      const score = leftCandidate.result.score + rightCandidate.result.score;
      if (score <= cacheThreshold) {
        break;
      }
      if (medleyExactCandidatesOverlap(leftCandidate, rightCandidate)) {
        continue;
      }
      records.push({
        score,
        leftCardIds: leftCandidate.cardIds,
        rightCardIds: rightCandidate.cardIds,
      });
    }
  }
  if (
    cacheThreshold !== coarseCacheThreshold
    && records.length < MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_PAIR_FINE_MIN_RECORD_COUNT
  ) {
    if (profiling) {
      profiling.exactCandidateJoinPairComplementHighPairBuildCount += 1;
      profiling.exactCandidateJoinPairComplementHighPairBuildElapsedMs += performance.now() - startedAt;
      profiling.exactCandidateJoinPairComplementHighPairRecordCount = Math.max(
        profiling.exactCandidateJoinPairComplementHighPairRecordCount,
        records.length,
      );
    }
    query.highPairAdaptiveCacheThresholdByCoarseThreshold?.set(coarseCacheThreshold, coarseCacheThreshold);
    return getHighMedleyExactCandidatePairRecords(query, threshold, profiling);
  }
  records.sort((left, right) => right.score - left.score);
  const scores = records.map((record) => record.score);
  const wordCount = Math.ceil(records.length / 32);
  const containingRecordBitsByCardId = new Map<number, Uint32Array>();
  records.forEach((record, recordIndex) => {
    const wordIndex = recordIndex >> 5;
    const bit = 1 << (recordIndex & 31);
    for (const cardId of record.leftCardIds) {
      let bits = containingRecordBitsByCardId.get(cardId);
      if (!bits) {
        bits = new Uint32Array(wordCount);
        containingRecordBitsByCardId.set(cardId, bits);
      }
      bits[wordIndex] |= bit;
    }
    for (const cardId of record.rightCardIds) {
      let bits = containingRecordBitsByCardId.get(cardId);
      if (!bits) {
        bits = new Uint32Array(wordCount);
        containingRecordBitsByCardId.set(cardId, bits);
      }
      bits[wordIndex] |= bit;
    }
  });
  if (profiling) {
    profiling.exactCandidateJoinPairComplementHighPairBuildCount += 1;
    profiling.exactCandidateJoinPairComplementHighPairBuildElapsedMs += performance.now() - startedAt;
    profiling.exactCandidateJoinPairComplementHighPairRecordCount = Math.max(
      profiling.exactCandidateJoinPairComplementHighPairRecordCount,
      records.length,
    );
  }
  const recordCache = {
    records,
    scores,
    wordCount,
    containingRecordBitsByCardId,
  };
  query.highPairRecordCache ??= new Map();
  query.highPairRecordCache.set(cacheThreshold, recordCache);
  query.highPairRecords = records;
  query.highPairRecordScores = scores;
  query.highPairRecordThreshold = cacheThreshold;
  query.highPairRecordBitsetWordCount = wordCount;
  query.containingHighPairRecordBitsByCardId = containingRecordBitsByCardId;
  return records;
}

function estimateGeneratedMedleyExactCandidatePairUpperExcludingCardIds(
  query: MedleyExactCandidatePairUpperQuery,
  bannedCardIds: Iterable<number>,
  minimumRelevantScore = Number.NEGATIVE_INFINITY,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number {
  if (profiling) {
    profiling.exactCandidateJoinPairComplementQueryCount += 1;
  }
  if (Number.isFinite(minimumRelevantScore)) {
    const highPairRecords = getHighMedleyExactCandidatePairRecords(query, minimumRelevantScore, profiling);
    const highPairRecordScores = query.highPairRecordScores;
    const recordCount = highPairRecords.length;
    const wordCount = query.highPairRecordBitsetWordCount ?? Math.ceil(recordCount / 32);
    const containingBitsByCardId = query.containingHighPairRecordBitsByCardId;
    if (!containingBitsByCardId || !highPairRecordScores || wordCount === 0) {
      return Number.NEGATIVE_INFINITY;
    }
    const bannedPairRecordBits: Uint32Array[] = [];
    for (const cardId of bannedCardIds) {
      const containingBits = containingBitsByCardId.get(cardId);
      if (!containingBits) {
        continue;
      }
      bannedPairRecordBits.push(containingBits);
    }
    const lastWordIndex = wordCount - 1;
    const lastWordRemainder = recordCount & 31;
    const lastWordMask = lastWordRemainder === 0
      ? 0xffffffff
      : 0xffffffff >>> (32 - lastWordRemainder);
    const finishAvailableWord = (availableBits: number, wordIndex: number, scannedWordCount: number): number => {
      const lowestAvailableBit = availableBits & -availableBits;
      const bitIndex = 31 - Math.clz32(lowestAvailableBit);
      if (profiling) {
        profiling.exactCandidateJoinPairComplementScanCount += scannedWordCount;
      }
      return highPairRecordScores[wordIndex * 32 + bitIndex] ?? Number.NEGATIVE_INFINITY;
    };
    if (bannedPairRecordBits.length === 0) {
      if (profiling) {
        profiling.exactCandidateJoinPairComplementScanCount += 1;
      }
      return highPairRecordScores[0] ?? Number.NEGATIVE_INFINITY;
    }
    let scannedWordCount = 0;
    if (bannedPairRecordBits.length === 1) {
      const bits0 = bannedPairRecordBits[0];
      for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
        scannedWordCount += 1;
        let availableBits = (~bits0[wordIndex]) >>> 0;
        if (wordIndex === lastWordIndex) {
          availableBits &= lastWordMask;
        }
        if (availableBits !== 0) {
          return finishAvailableWord(availableBits, wordIndex, scannedWordCount);
        }
      }
    } else if (bannedPairRecordBits.length === 2) {
      const bits0 = bannedPairRecordBits[0];
      const bits1 = bannedPairRecordBits[1];
      for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
        scannedWordCount += 1;
        let availableBits = (~(bits0[wordIndex] | bits1[wordIndex])) >>> 0;
        if (wordIndex === lastWordIndex) {
          availableBits &= lastWordMask;
        }
        if (availableBits !== 0) {
          return finishAvailableWord(availableBits, wordIndex, scannedWordCount);
        }
      }
    } else if (bannedPairRecordBits.length === 3) {
      const bits0 = bannedPairRecordBits[0];
      const bits1 = bannedPairRecordBits[1];
      const bits2 = bannedPairRecordBits[2];
      for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
        scannedWordCount += 1;
        let availableBits = (~(bits0[wordIndex] | bits1[wordIndex] | bits2[wordIndex])) >>> 0;
        if (wordIndex === lastWordIndex) {
          availableBits &= lastWordMask;
        }
        if (availableBits !== 0) {
          return finishAvailableWord(availableBits, wordIndex, scannedWordCount);
        }
      }
    } else if (bannedPairRecordBits.length === 4) {
      const bits0 = bannedPairRecordBits[0];
      const bits1 = bannedPairRecordBits[1];
      const bits2 = bannedPairRecordBits[2];
      const bits3 = bannedPairRecordBits[3];
      for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
        scannedWordCount += 1;
        let availableBits = (~(
          bits0[wordIndex]
          | bits1[wordIndex]
          | bits2[wordIndex]
          | bits3[wordIndex]
        )) >>> 0;
        if (wordIndex === lastWordIndex) {
          availableBits &= lastWordMask;
        }
        if (availableBits !== 0) {
          return finishAvailableWord(availableBits, wordIndex, scannedWordCount);
        }
      }
    } else if (bannedPairRecordBits.length === 5) {
      const bits0 = bannedPairRecordBits[0];
      const bits1 = bannedPairRecordBits[1];
      const bits2 = bannedPairRecordBits[2];
      const bits3 = bannedPairRecordBits[3];
      const bits4 = bannedPairRecordBits[4];
      for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
        scannedWordCount += 1;
        let availableBits = (~(
          bits0[wordIndex]
          | bits1[wordIndex]
          | bits2[wordIndex]
          | bits3[wordIndex]
          | bits4[wordIndex]
        )) >>> 0;
        if (wordIndex === lastWordIndex) {
          availableBits &= lastWordMask;
        }
        if (availableBits !== 0) {
          return finishAvailableWord(availableBits, wordIndex, scannedWordCount);
        }
      }
    } else {
      for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
        scannedWordCount += 1;
        let forbiddenBits = 0;
        for (const pairRecordBits of bannedPairRecordBits) {
          forbiddenBits |= pairRecordBits[wordIndex];
        }
        let availableBits = (~forbiddenBits) >>> 0;
        if (wordIndex === lastWordIndex) {
          availableBits &= lastWordMask;
        }
        if (availableBits !== 0) {
          return finishAvailableWord(availableBits, wordIndex, scannedWordCount);
        }
      }
    }
    if (profiling) {
      profiling.exactCandidateJoinPairComplementScanCount += scannedWordCount;
    }
    return Number.NEGATIVE_INFINITY;
  }

  let bestScore = Number.NEGATIVE_INFINITY;
  const bannedCardIdSet = bannedCardIds instanceof Set ? bannedCardIds : new Set<number>(bannedCardIds);
  const bannedRightCandidateBits = buildBannedMedleyExactRightCandidateBits(query, bannedCardIdSet);
  const bestRightScore = query.rightCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY;
  for (const leftCandidate of query.leftCandidates) {
    if (leftCandidate.cardIds.some((cardId) => bannedCardIdSet.has(cardId))) {
      continue;
    }
    if (leftCandidate.result.score + bestRightScore < bestScore) {
      break;
    }
    const rightCandidate = findBestAvailableMedleyExactCandidateByBits(
      query.rightCandidates,
      query.rightCandidateBitsetWordCount,
      bannedRightCandidateBits,
      getForbiddenMedleyExactRightCandidateBits(query, leftCandidate),
    );
    if (rightCandidate) {
      bestScore = Math.max(bestScore, leftCandidate.result.score + rightCandidate.result.score);
    }
  }
  return bestScore;
}

function proveMedleyExactCandidatePairUpper(
  pairSlotIndices: [number, number],
  candidatesBySlot: MedleyTeamCandidate[][],
  generators: MedleyExactSlotCandidateGenerator[],
  candidateSoftLimit: number,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  deadlineAt: number,
  targetUnseenUpperBound = Number.POSITIVE_INFINITY,
  stopWhenGeneratedPairExceedsTarget = false,
): MedleyExactCandidatePairUpperResult {
  // Pair proof closes the unseen frontier for two slots. Until generated pairs dominate the
  // peeked slot uppers, omitted candidates could still combine into a winning triple.
  let bestPairScore = estimateGeneratedMedleyExactCandidatePairUpper(
    candidatesBySlot[pairSlotIndices[0]],
    candidatesBySlot[pairSlotIndices[1]],
  );

  while (true) {
    if (stats.timedOut || performance.now() >= deadlineAt || isPastDeadline()) {
      stats.isExhaustive = false;
      stats.timedOut = true;
      stats.searchMode = "bounded";
      return { proved: false, upperBound: bestPairScore, unseenUpperBound: Number.POSITIVE_INFINITY };
    }

    const leftSlotIndex = pairSlotIndices[0];
    const rightSlotIndex = pairSlotIndices[1];
    const leftPeekUpperBound = generators[leftSlotIndex].peekUpperBound();
    const rightPeekUpperBound = generators[rightSlotIndex].peekUpperBound();
    const leftBestPossible = Math.max(
      candidatesBySlot[leftSlotIndex][0]?.result.score ?? Number.NEGATIVE_INFINITY,
      leftPeekUpperBound,
    );
    const rightBestPossible = Math.max(
      candidatesBySlot[rightSlotIndex][0]?.result.score ?? Number.NEGATIVE_INFINITY,
      rightPeekUpperBound,
    );
    const leftUnseenUpperBound = leftPeekUpperBound + rightBestPossible;
    const rightUnseenUpperBound = rightPeekUpperBound + leftBestPossible;
    const unseenUpperBound = Math.max(leftUnseenUpperBound, rightUnseenUpperBound);
    if (
      stopWhenGeneratedPairExceedsTarget
      && Number.isFinite(targetUnseenUpperBound)
      && bestPairScore > targetUnseenUpperBound
    ) {
      return { proved: false, upperBound: Math.max(bestPairScore, unseenUpperBound), unseenUpperBound };
    }
    if (
      Number.isFinite(targetUnseenUpperBound)
      && Math.max(bestPairScore, unseenUpperBound) <= targetUnseenUpperBound
    ) {
      return {
        proved: true,
        upperBound: Math.max(bestPairScore, unseenUpperBound),
        unseenUpperBound,
      };
    }
    if (bestPairScore >= unseenUpperBound && unseenUpperBound <= targetUnseenUpperBound) {
      return { proved: true, upperBound: bestPairScore, unseenUpperBound };
    }

    const slotIndexToGenerate = leftUnseenUpperBound >= rightUnseenUpperBound
      ? leftSlotIndex
      : rightSlotIndex;
    const otherBestPossible = slotIndexToGenerate === leftSlotIndex
      ? rightBestPossible
      : leftBestPossible;
    const cutoffBase = Number.isFinite(targetUnseenUpperBound)
      ? Math.min(bestPairScore, targetUnseenUpperBound)
      : bestPairScore;
    const scoreCutoff = Number.isFinite(cutoffBase) && Number.isFinite(otherBestPossible)
      ? cutoffBase - otherBestPossible
      : Number.NEGATIVE_INFINITY;
    if (candidatesBySlot[slotIndexToGenerate].length >= candidateSoftLimit) {
      return { proved: false, upperBound: Math.max(bestPairScore, unseenUpperBound), unseenUpperBound };
    }

    const candidate = generators[slotIndexToGenerate].next(scoreCutoff);
    if (stats.timedOut) {
      stats.isExhaustive = false;
      stats.timedOut = true;
      stats.searchMode = "bounded";
      return { proved: false, upperBound: bestPairScore, unseenUpperBound: Number.POSITIVE_INFINITY };
    }
    if (generators[slotIndexToGenerate].hasAborted()) {
      return { proved: false, upperBound: bestPairScore, unseenUpperBound };
    }
    if (!candidate) {
      continue;
    }
    candidatesBySlot[slotIndexToGenerate].push(candidate);
    bestPairScore = updateGeneratedMedleyExactCandidatePairUpper(
      candidate,
      candidatesBySlot[slotIndexToGenerate === leftSlotIndex ? rightSlotIndex : leftSlotIndex],
      bestPairScore,
    );
  }
}

export function solveMedleyExactCandidateJoin(
  slots: MedleySlotSearch[],
  candidatesBySlot: MedleyTeamCandidate[][],
  configuration: BandoriAreaItemConfiguration,
  incumbentScore: number,
  server: number,
  perfectRate: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  deadlineAt: number,
): MedleyExactCandidateJoinSolveResult {
  // The final join is exact only over candidate lists whose unseen frontier was already
  // bounded. Bitsets accelerate card-disjoint checks but never approximate the conflict rule.
  if (slots.length !== MEDLEY_TEAM_COUNT || candidatesBySlot.some((candidates) => candidates.length === 0)) {
    return { timedOut: false, result: null };
  }
  type ThirdCandidateShortlist = { candidateIndices: Uint32Array; count: number; exhaustive: boolean };

  const candidateCountSlotOrder = slots
    .map((_, index) => index)
    .sort((left, right) => (
      candidatesBySlot[left].length - candidatesBySlot[right].length
      || (candidatesBySlot[right][0]?.result.score ?? Number.NEGATIVE_INFINITY)
        - (candidatesBySlot[left][0]?.result.score ?? Number.NEGATIVE_INFINITY)
      || left - right
  ));
  const smallestCandidateCount = candidatesBySlot[candidateCountSlotOrder[0]]?.length ?? 0;
  const middleCandidateCount = candidatesBySlot[candidateCountSlotOrder[1]]?.length ?? 0;
  const largestCandidateCount = candidatesBySlot[candidateCountSlotOrder[2]]?.length ?? 0;
  // Extremely imbalanced lists can spend too much time joining the smallest
  // list first because the second-list frontier stays wide. Trying the middle
  // list first is still exact; it only changes enumeration order and the
  // bounded shortlist used for third-slot acceleration.
  const shouldUseMiddleFirstJoinOrder = (
    smallestCandidateCount >= 5_000
    && middleCandidateCount >= smallestCandidateCount * 2
    && largestCandidateCount >= middleCandidateCount * 2
  );
  const slotOrder = shouldUseMiddleFirstJoinOrder
    ? [candidateCountSlotOrder[1], candidateCountSlotOrder[0], candidateCountSlotOrder[2]]
    : candidateCountSlotOrder;
  const thirdShortlistSize = shouldUseMiddleFirstJoinOrder
    ? MEDLEY_EXACT_CANDIDATE_JOIN_MIDDLE_FIRST_THIRD_SHORTLIST_SIZE
    : MEDLEY_EXACT_CANDIDATE_JOIN_THIRD_SHORTLIST_SIZE;
  const firstSlotIndex = slotOrder[0];
  const secondSlotIndex = slotOrder[1];
  const thirdSlotIndex = slotOrder[2];
  const firstCandidates = candidatesBySlot[firstSlotIndex];
  const secondCandidates = candidatesBySlot[secondSlotIndex];
  const thirdCandidates = candidatesBySlot[thirdSlotIndex];
  const secondCandidateScores = secondCandidates.map((candidate) => candidate.result.score);
  const secondCandidateBitsetWordCount = Math.ceil(secondCandidates.length / 32);
  const containingSecondCandidateBitsByCardId = buildMedleyExactContainingCandidateBitsByCardId(
    secondCandidates,
    secondCandidateBitsetWordCount,
  );
  const thirdCandidateBitsetWordCount = Math.ceil(thirdCandidates.length / 32);
  const containingThirdCandidateBitsByCardId = buildMedleyExactContainingCandidateBitsByCardId(
    thirdCandidates,
    thirdCandidateBitsetWordCount,
  );
  const thirdCandidateLastWordIndex = thirdCandidateBitsetWordCount - 1;
  const thirdCandidateLastWordRemainder = thirdCandidates.length & 31;
  const thirdCandidateLastWordMask = thirdCandidateLastWordRemainder === 0
    ? 0xffffffff
    : 0xffffffff >>> (32 - thirdCandidateLastWordRemainder);
  const forbiddenThirdCandidateBitsCache = new WeakMap<MedleyTeamCandidate, Uint32Array>();
  const getForbiddenThirdCandidateBits = (candidate: MedleyTeamCandidate): Uint32Array => {
    const cached = forbiddenThirdCandidateBitsCache.get(candidate);
    if (cached) {
      return cached;
    }
    const forbiddenBits = buildMedleyExactForbiddenCandidateBits(
      candidate,
      containingThirdCandidateBitsByCardId,
      thirdCandidateBitsetWordCount,
    );
    forbiddenThirdCandidateBitsCache.set(candidate, forbiddenBits);
    return forbiddenBits;
  };
  const findBestDisjointThirdCandidateByForbiddenBits = (
    primaryForbiddenBits: Uint32Array,
    secondaryForbiddenBits?: Uint32Array,
  ): MedleyTeamCandidate | null => {
    localThirdQueryCount += 1;
    if (secondaryForbiddenBits) {
      for (let wordIndex = 0; wordIndex < thirdCandidateLastWordIndex; wordIndex += 1) {
        const availableBits = (~(
          primaryForbiddenBits[wordIndex]
          | secondaryForbiddenBits[wordIndex]
        )) >>> 0;
        if (availableBits !== 0) {
          const lowestAvailableBit = availableBits & -availableBits;
          const bitIndex = 31 - Math.clz32(lowestAvailableBit);
          return thirdCandidates[wordIndex * 32 + bitIndex] ?? null;
        }
      }
      if (thirdCandidateLastWordIndex >= 0) {
        const availableBits = (~(
          primaryForbiddenBits[thirdCandidateLastWordIndex]
          | secondaryForbiddenBits[thirdCandidateLastWordIndex]
        )) >>> 0 & thirdCandidateLastWordMask;
        if (availableBits !== 0) {
          const lowestAvailableBit = availableBits & -availableBits;
          const bitIndex = 31 - Math.clz32(lowestAvailableBit);
          return thirdCandidates[thirdCandidateLastWordIndex * 32 + bitIndex] ?? null;
        }
      }
      return null;
    }
    for (let wordIndex = 0; wordIndex < thirdCandidateLastWordIndex; wordIndex += 1) {
      const availableBits = (~primaryForbiddenBits[wordIndex]) >>> 0;
      if (availableBits !== 0) {
        const lowestAvailableBit = availableBits & -availableBits;
        const bitIndex = 31 - Math.clz32(lowestAvailableBit);
        return thirdCandidates[wordIndex * 32 + bitIndex] ?? null;
      }
    }
    if (thirdCandidateLastWordIndex >= 0) {
      const availableBits = ((~primaryForbiddenBits[thirdCandidateLastWordIndex]) >>> 0) & thirdCandidateLastWordMask;
      if (availableBits !== 0) {
        const lowestAvailableBit = availableBits & -availableBits;
        const bitIndex = 31 - Math.clz32(lowestAvailableBit);
        return thirdCandidates[thirdCandidateLastWordIndex * 32 + bitIndex] ?? null;
      }
    }
    return null;
  };
  const buildThirdShortlistForCandidate = (candidate: MedleyTeamCandidate): ThirdCandidateShortlist => {
    const candidateIndices = new Uint32Array(thirdShortlistSize);
    let candidateIndexCount = 0;
    let exhaustive = true;
    const forbiddenThirdCandidateBits = getForbiddenThirdCandidateBits(candidate);
    const lastWordIndex = thirdCandidateBitsetWordCount - 1;
    const lastWordRemainder = thirdCandidates.length & 31;
    const lastWordMask = lastWordRemainder === 0
      ? 0xffffffff
      : 0xffffffff >>> (32 - lastWordRemainder);
    for (let wordIndex = 0; wordIndex < thirdCandidateBitsetWordCount; wordIndex += 1) {
      let availableThirdBits = (~forbiddenThirdCandidateBits[wordIndex]) >>> 0;
      if (wordIndex === lastWordIndex) {
        availableThirdBits &= lastWordMask;
      }
      while (availableThirdBits !== 0) {
        const lowestAvailableBit = availableThirdBits & -availableThirdBits;
        availableThirdBits ^= lowestAvailableBit;
        const thirdCandidateIndex = (wordIndex * 32) + (31 - Math.clz32(lowestAvailableBit));
        const thirdCandidate = thirdCandidates[thirdCandidateIndex];
        if (!thirdCandidate) {
          continue;
        }
        candidateIndices[candidateIndexCount] = thirdCandidateIndex;
        candidateIndexCount += 1;
        if (candidateIndexCount >= thirdShortlistSize) {
          exhaustive = false;
          break;
        }
      }
      if (!exhaustive) {
        break;
      }
    }
    return { candidateIndices, count: candidateIndexCount, exhaustive };
  };
  const thirdShortlistCache = new WeakMap<MedleyTeamCandidate, ThirdCandidateShortlist>();
  const getThirdShortlistForCandidate = (
    candidate: MedleyTeamCandidate,
  ): ThirdCandidateShortlist => {
    const cached = thirdShortlistCache.get(candidate);
    if (cached) {
      return cached;
    }
    const shortlist = buildThirdShortlistForCandidate(candidate);
    thirdShortlistCache.set(candidate, shortlist);
    return shortlist;
  };
  const bestThirdByCardIdsCache = new WeakMap<MedleyTeamCandidate, MedleyTeamCandidate | null>();
  const getBestThirdByCardIds = (candidate: MedleyTeamCandidate): MedleyTeamCandidate | null => {
    if (bestThirdByCardIdsCache.has(candidate)) {
      return bestThirdByCardIdsCache.get(candidate) ?? null;
    }
    const bestThirdCandidate = findBestDisjointMedleyExactCandidateByCardIds(thirdCandidates, candidate.cardIds);
    bestThirdByCardIdsCache.set(candidate, bestThirdCandidate);
    return bestThirdCandidate;
  };
  let bestResult: BandoriMedleyTeamSearchResult | null = null;
  let currentScoreCutoff = incumbentScore + 1;
  let localPairCount = 0;
  let localThirdQueryCount = 0;
  let nextDeadlineCheckPairCount = 4096;
  const firstForbiddenSecondCandidateBitsScratch = new Uint32Array(secondCandidateBitsetWordCount);
  const firstForbiddenThirdCandidateBitsScratch = new Uint32Array(thirdCandidateBitsetWordCount);
  const bestSecondScore = secondCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY;
  const bestThirdScore = thirdCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY;
  const secondCandidateLastWordIndex = secondCandidateBitsetWordCount - 1;
  const secondCandidateLastWordRemainder = secondCandidates.length & 31;
  const secondCandidateLastWordMask = secondCandidateLastWordRemainder === 0
    ? 0xffffffff
    : 0xffffffff >>> (32 - secondCandidateLastWordRemainder);
  for (const firstCandidate of firstCandidates) {
    const firstScore = firstCandidate.result.score;
    if (firstScore + bestSecondScore + bestThirdScore < currentScoreCutoff) {
      break;
    }
    const firstForbiddenSecondCandidateBits = writeMedleyExactForbiddenCandidateBits(
      firstCandidate,
      containingSecondCandidateBitsByCardId,
      secondCandidateBitsetWordCount,
      firstForbiddenSecondCandidateBitsScratch,
    );
    const bestSecondForFirst = findBestAvailableMedleyExactCandidateByBits(
      secondCandidates,
      secondCandidateBitsetWordCount,
      firstForbiddenSecondCandidateBits,
    );
    if (!bestSecondForFirst) {
      continue;
    }
    const firstForbiddenThirdCandidateBits = writeMedleyExactForbiddenCandidateBits(
      firstCandidate,
      containingThirdCandidateBitsByCardId,
      thirdCandidateBitsetWordCount,
      firstForbiddenThirdCandidateBitsScratch,
    );
    const bestThirdForFirst = findBestAvailableMedleyExactCandidateByBits(
      thirdCandidates,
      thirdCandidateBitsetWordCount,
      firstForbiddenThirdCandidateBits,
    );
    if (!bestThirdForFirst) {
      continue;
    }
    const bestThirdForFirstScore = bestThirdForFirst.result.score;
    if (firstScore + bestSecondForFirst.result.score + bestThirdForFirstScore < currentScoreCutoff) {
      continue;
    }
    if (firstScore + bestSecondScore + bestThirdForFirstScore < currentScoreCutoff) {
      continue;
    }
    let shouldStopSecondLoop = false;
    for (let wordIndex = 0; wordIndex < secondCandidateBitsetWordCount; wordIndex += 1) {
      const wordTopSecondScore = secondCandidateScores[wordIndex * 32] ?? Number.NEGATIVE_INFINITY;
      if (firstScore + wordTopSecondScore + bestThirdForFirstScore < currentScoreCutoff) {
        break;
      }
      let availableSecondBits = (~firstForbiddenSecondCandidateBits[wordIndex]) >>> 0;
      if (wordIndex === secondCandidateLastWordIndex) {
        availableSecondBits &= secondCandidateLastWordMask;
      }
      while (availableSecondBits !== 0) {
        const lowestAvailableBit = availableSecondBits & -availableSecondBits;
        availableSecondBits ^= lowestAvailableBit;
        const secondCandidateIndex = (wordIndex * 32) + (31 - Math.clz32(lowestAvailableBit));
        const secondCandidate = secondCandidates[secondCandidateIndex] as MedleyTeamCandidate;
        const secondScore = secondCandidateScores[secondCandidateIndex];
        const firstSecondScore = firstScore + secondScore;
        localPairCount += 1;
        if (localPairCount >= nextDeadlineCheckPairCount) {
          if (stats.timedOut || performance.now() >= deadlineAt || isPastDeadline()) {
            stats.isExhaustive = false;
            stats.timedOut = true;
            stats.searchMode = "bounded";
            profiling.exactCandidateJoinPairCount += localPairCount;
            profiling.exactCandidateJoinThirdQueryCount += localThirdQueryCount;
            return { timedOut: true, result: bestResult };
          }
          nextDeadlineCheckPairCount += 4096;
        }
        if (firstSecondScore + bestThirdScore < currentScoreCutoff) {
          shouldStopSecondLoop = true;
          break;
        }
        if (firstSecondScore + bestThirdForFirstScore < currentScoreCutoff) {
          shouldStopSecondLoop = true;
          break;
        }

        const bestThirdForSecond = getBestThirdByCardIds(secondCandidate);
        if (!bestThirdForSecond) {
          continue;
        }
        const bestThirdForSecondScore = bestThirdForSecond.result.score;
        if (
          firstSecondScore
          + Math.min(bestThirdForFirstScore, bestThirdForSecondScore)
          < currentScoreCutoff
        ) {
          continue;
        }

        const secondThirdShortlist = getThirdShortlistForCandidate(secondCandidate);
        let thirdCandidate: MedleyTeamCandidate | null = null;
        for (let shortlistIndex = 0; shortlistIndex < secondThirdShortlist.count; shortlistIndex += 1) {
          const currentThirdCandidateIndex = secondThirdShortlist.candidateIndices[shortlistIndex];
          if (
            (firstForbiddenThirdCandidateBits[currentThirdCandidateIndex >> 5]
              & (1 << (currentThirdCandidateIndex & 31))) === 0
          ) {
            thirdCandidate = thirdCandidates[currentThirdCandidateIndex] ?? null;
            break;
          }
        }
        if (!thirdCandidate && !secondThirdShortlist.exhaustive) {
          const secondForbiddenThirdCandidateBits = getForbiddenThirdCandidateBits(secondCandidate);
          thirdCandidate = findBestDisjointThirdCandidateByForbiddenBits(
            firstForbiddenThirdCandidateBits,
            secondForbiddenThirdCandidateBits,
          );
        }
        if (!thirdCandidate) {
          continue;
        }
        if (firstSecondScore + thirdCandidate.result.score < currentScoreCutoff) {
          continue;
        }

        const firstResultCandidate = hydrateMedleyExactCandidateForResult(
          slots[firstSlotIndex],
          firstCandidate,
          server,
          perfectRate,
          stats,
          profiling,
        );
        const secondResultCandidate = hydrateMedleyExactCandidateForResult(
          slots[secondSlotIndex],
          secondCandidate,
          server,
          perfectRate,
          stats,
          profiling,
        );
        const thirdResultCandidate = hydrateMedleyExactCandidateForResult(
          slots[thirdSlotIndex],
          thirdCandidate,
          server,
          perfectRate,
          stats,
          profiling,
        );
        if (!firstResultCandidate || !secondResultCandidate || !thirdResultCandidate) {
          continue;
        }
        const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
        selectedBySong[slots[firstSlotIndex].songIndex] = firstResultCandidate;
        selectedBySong[slots[secondSlotIndex].songIndex] = secondResultCandidate;
        selectedBySong[slots[thirdSlotIndex].songIndex] = thirdResultCandidate;
        bestResult = compareMedleyResultLike(bestResult, buildMedleyResult(slots, selectedBySong, configuration));
        currentScoreCutoff = Math.max(currentScoreCutoff, (bestResult?.score ?? Number.NEGATIVE_INFINITY) + 1);
      }
      if (shouldStopSecondLoop) {
        break;
      }
    }
  }
  profiling.exactCandidateJoinPairCount += localPairCount;
  profiling.exactCandidateJoinThirdQueryCount += localThirdQueryCount;
  return { timedOut: false, result: bestResult };
}

function findBestGeneratedMedleyExactCandidatePairForAnchor(
  leftCandidates: MedleyTeamCandidate[],
  rightCandidates: MedleyTeamCandidate[],
  anchorCandidate: MedleyTeamCandidate,
  scoreCutoff: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): {
  score: number;
  leftCandidate: MedleyTeamCandidate | null;
  rightCandidate: MedleyTeamCandidate | null;
} {
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestLeftCandidate: MedleyTeamCandidate | null = null;
  let bestRightCandidate: MedleyTeamCandidate | null = null;
  for (const leftCandidate of leftCandidates) {
    if (leftCandidate.result.score + (rightCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY) <= scoreCutoff) {
      break;
    }
    if (medleyExactCandidatesOverlap(anchorCandidate, leftCandidate)) {
      continue;
    }
    for (const rightCandidate of rightCandidates) {
      profiling.exactCandidateJoinPairCount += 1;
      if (leftCandidate.result.score + rightCandidate.result.score <= Math.max(scoreCutoff, bestScore)) {
        break;
      }
      if (
        medleyExactCandidatesOverlap(anchorCandidate, rightCandidate)
        || medleyExactCandidatesOverlap(leftCandidate, rightCandidate)
      ) {
        continue;
      }
      bestScore = leftCandidate.result.score + rightCandidate.result.score;
      bestLeftCandidate = leftCandidate;
      bestRightCandidate = rightCandidate;
      break;
    }
  }
  return {
    score: bestScore,
    leftCandidate: bestLeftCandidate,
    rightCandidate: bestRightCandidate,
  };
}

function getMedleyExactCandidateCardKey(candidate: MedleyTeamCandidate): string {
  return candidate.cardIds.join(",");
}

function hydrateMedleyExactCandidateForResult(
  slot: MedleySlotSearch,
  candidate: MedleyTeamCandidate,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): MedleyTeamCandidate | null {
  return evaluateMedleySlotCandidateWithCache(
    slot,
    candidate.cards,
    server,
    perfectRate,
    stats,
    profiling,
  );
}

function findBestMedleyExactCandidatePairForAnchor(
  pairSlotIndices: [number, number],
  candidatesBySlot: MedleyTeamCandidate[][],
  generators: MedleyExactSlotCandidateGenerator[],
  anchorCandidate: MedleyTeamCandidate,
  scoreCutoff: number,
  candidateSoftLimit: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  deadlineAt: number,
): MedleyExactCandidatePairSearchResult {
  const leftSlotIndex = pairSlotIndices[0];
  const rightSlotIndex = pairSlotIndices[1];
  let bestPair = findBestGeneratedMedleyExactCandidatePairForAnchor(
    candidatesBySlot[leftSlotIndex],
    candidatesBySlot[rightSlotIndex],
    anchorCandidate,
    scoreCutoff,
    profiling,
  );

  while (true) {
    if (bestPair.leftCandidate && bestPair.rightCandidate && bestPair.score > scoreCutoff) {
      return {
        proved: true,
        timedOut: false,
        leftCandidate: bestPair.leftCandidate,
        rightCandidate: bestPair.rightCandidate,
      };
    }
    if (stats.timedOut || performance.now() >= deadlineAt || isPastDeadline()) {
      stats.isExhaustive = false;
      stats.timedOut = true;
      stats.searchMode = "bounded";
      return { proved: false, timedOut: true, leftCandidate: bestPair.leftCandidate, rightCandidate: bestPair.rightCandidate };
    }

    const leftPeekUpperBound = generators[leftSlotIndex].peekUpperBound();
    const rightPeekUpperBound = generators[rightSlotIndex].peekUpperBound();
    const leftBestPossible = Math.max(
      candidatesBySlot[leftSlotIndex][0]?.result.score ?? Number.NEGATIVE_INFINITY,
      leftPeekUpperBound,
    );
    const rightBestPossible = Math.max(
      candidatesBySlot[rightSlotIndex][0]?.result.score ?? Number.NEGATIVE_INFINITY,
      rightPeekUpperBound,
    );
    const leftUnseenUpperBound = leftPeekUpperBound + rightBestPossible;
    const rightUnseenUpperBound = rightPeekUpperBound + leftBestPossible;
    const unseenUpperBound = Math.max(leftUnseenUpperBound, rightUnseenUpperBound);
    if (Math.max(bestPair.score, unseenUpperBound) <= scoreCutoff) {
      return {
        proved: true,
        timedOut: false,
        leftCandidate: null,
        rightCandidate: null,
      };
    }

    const slotIndexToGenerate = leftUnseenUpperBound >= rightUnseenUpperBound
      ? leftSlotIndex
      : rightSlotIndex;
    if (candidatesBySlot[slotIndexToGenerate].length >= candidateSoftLimit) {
      return {
        proved: false,
        timedOut: false,
        leftCandidate: bestPair.leftCandidate,
        rightCandidate: bestPair.rightCandidate,
      };
    }
    const otherBestPossible = slotIndexToGenerate === leftSlotIndex
      ? rightBestPossible
      : leftBestPossible;
    const candidateScoreCutoff = Number.isFinite(otherBestPossible)
      ? scoreCutoff - otherBestPossible
      : Number.NEGATIVE_INFINITY;
    const candidate = generators[slotIndexToGenerate].next(candidateScoreCutoff);
    if (stats.timedOut || generators[slotIndexToGenerate].hasAborted()) {
      stats.isExhaustive = false;
      stats.timedOut = true;
      stats.searchMode = "bounded";
      return { proved: false, timedOut: true, leftCandidate: bestPair.leftCandidate, rightCandidate: bestPair.rightCandidate };
    }
    if (!candidate) {
      if (Math.max(bestPair.score, generators[leftSlotIndex].peekUpperBound() + rightBestPossible, generators[rightSlotIndex].peekUpperBound() + leftBestPossible) <= scoreCutoff) {
        return {
          proved: true,
          timedOut: false,
          leftCandidate: null,
          rightCandidate: null,
        };
      }
      return {
        proved: false,
        timedOut: false,
        leftCandidate: bestPair.leftCandidate,
        rightCandidate: bestPair.rightCandidate,
      };
    }
    candidatesBySlot[slotIndexToGenerate].push(candidate);
    const candidatePair = findBestGeneratedMedleyExactCandidatePairForAnchor(
      slotIndexToGenerate === leftSlotIndex ? [candidate] : candidatesBySlot[leftSlotIndex],
      slotIndexToGenerate === rightSlotIndex ? [candidate] : candidatesBySlot[rightSlotIndex],
      anchorCandidate,
      Math.max(scoreCutoff, bestPair.score),
      profiling,
    );
    if (candidatePair.score > bestPair.score) {
      bestPair = candidatePair;
    }
  }
}

function solveMedleyExactCandidateJoinByAnchor(
  slots: MedleySlotSearch[],
  candidatesBySlot: MedleyTeamCandidate[][],
  generators: MedleyExactSlotCandidateGenerator[],
  exactPairUpperByExcludedSlot: Array<number | null>,
  configuration: BandoriAreaItemConfiguration,
  incumbentScore: number,
  server: number,
  perfectRate: number,
  candidateSoftLimit: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  deadlineAt: number,
): MedleyExactCandidateAnchoredJoinResult {
  const debugAnchorSlotIndex = profiling.exactCandidateJoinDebugAnchorSlotIndex;
  const anchorSlotIndex = debugAnchorSlotIndex !== undefined
    && debugAnchorSlotIndex >= 0
    && debugAnchorSlotIndex < slots.length
    ? debugAnchorSlotIndex
    : exactPairUpperByExcludedSlot
    .map((pairUpperBound, slotIndex) => ({
      slotIndex,
      anchorCutoff: incumbentScore - (pairUpperBound ?? Number.POSITIVE_INFINITY),
      pairUpperBound: pairUpperBound ?? Number.POSITIVE_INFINITY,
    }))
    .filter((entry) => Number.isFinite(entry.pairUpperBound))
    .sort((left, right) => right.anchorCutoff - left.anchorCutoff || left.slotIndex - right.slotIndex)[0]?.slotIndex;
  if (anchorSlotIndex === undefined) {
    return { proved: false, timedOut: false, result: null };
  }

  const anchorPairUpperBound = exactPairUpperByExcludedSlot[anchorSlotIndex];
  if (anchorPairUpperBound === null || !Number.isFinite(anchorPairUpperBound)) {
    return { proved: false, timedOut: false, result: null };
  }
  const anchorScoreCutoff = incumbentScore - anchorPairUpperBound;
  const pairSlotIndices = slots
    .map((_, index) => index)
    .filter((index) => index !== anchorSlotIndex) as [number, number];
  let bestResult: BandoriMedleyTeamSearchResult | null = null;
  let anchorCursor = 0;

  while (true) {
    if (stats.timedOut || performance.now() >= deadlineAt || isPastDeadline()) {
      stats.isExhaustive = false;
      stats.timedOut = true;
      stats.searchMode = "bounded";
      return { proved: false, timedOut: true, result: bestResult };
    }

    let anchorCandidate: MedleyTeamCandidate | null = candidatesBySlot[anchorSlotIndex][anchorCursor] ?? null;
    if (!anchorCandidate) {
      if (generators[anchorSlotIndex].peekUpperBound() + anchorPairUpperBound <= incumbentScore) {
        return { proved: true, timedOut: false, result: bestResult };
      }
      if (candidatesBySlot[anchorSlotIndex].length >= candidateSoftLimit) {
        return { proved: false, timedOut: false, result: bestResult };
      }
      anchorCandidate = generators[anchorSlotIndex].next(anchorScoreCutoff, {
        slots,
        remainingSlotIndices: pairSlotIndices,
        scoreCutoff: incumbentScore,
      });
      if (stats.timedOut || generators[anchorSlotIndex].hasAborted()) {
        stats.isExhaustive = false;
        stats.timedOut = true;
        stats.searchMode = "bounded";
        return { proved: false, timedOut: true, result: bestResult };
      }
      if (!anchorCandidate) {
        return { proved: true, timedOut: false, result: bestResult };
      }
      candidatesBySlot[anchorSlotIndex].push(anchorCandidate);
    }
    anchorCursor += 1;

    if (anchorCandidate.result.score + anchorPairUpperBound <= incumbentScore) {
      continue;
    }
    const pairSearchResult = findBestMedleyExactCandidatePairForAnchor(
      pairSlotIndices,
      candidatesBySlot,
      generators,
      anchorCandidate,
      incumbentScore - anchorCandidate.result.score,
      candidateSoftLimit,
      profiling,
      stats,
      isPastDeadline,
      deadlineAt,
    );
    if (pairSearchResult.timedOut) {
      return { proved: false, timedOut: true, result: bestResult };
    }
    if (!pairSearchResult.proved) {
      return { proved: false, timedOut: false, result: bestResult };
    }
    if (pairSearchResult.leftCandidate && pairSearchResult.rightCandidate) {
      const anchorResultCandidate = hydrateMedleyExactCandidateForResult(
        slots[anchorSlotIndex],
        anchorCandidate,
        server,
        perfectRate,
        stats,
        profiling,
      );
      const leftResultCandidate = hydrateMedleyExactCandidateForResult(
        slots[pairSlotIndices[0]],
        pairSearchResult.leftCandidate,
        server,
        perfectRate,
        stats,
        profiling,
      );
      const rightResultCandidate = hydrateMedleyExactCandidateForResult(
        slots[pairSlotIndices[1]],
        pairSearchResult.rightCandidate,
        server,
        perfectRate,
        stats,
        profiling,
      );
      if (!anchorResultCandidate || !leftResultCandidate || !rightResultCandidate) {
        return { proved: false, timedOut: false, result: bestResult };
      }
      const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
      selectedBySong[slots[anchorSlotIndex].songIndex] = anchorResultCandidate;
      selectedBySong[slots[pairSlotIndices[0]].songIndex] = leftResultCandidate;
      selectedBySong[slots[pairSlotIndices[1]].songIndex] = rightResultCandidate;
      bestResult = compareMedleyResultLike(bestResult, buildMedleyResult(slots, selectedBySong, configuration));
      if ((bestResult?.score ?? Number.NEGATIVE_INFINITY) > incumbentScore) {
        return { proved: true, timedOut: false, result: bestResult };
      }
    }
  }
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
  // This wrapper proves one area-item configuration. The caller remains responsible for
  // aggregating configuration-level proof across locked/all scopes before reporting exact.
  profiling.exactCandidateJoinCallCount += 1;
  const incumbentScore = getMedleyPruningThreshold(results, resultLimit);
  if (resultLimit !== 1 || slots.length !== MEDLEY_TEAM_COUNT || !Number.isFinite(incumbentScore)) {
    profiling.exactCandidateJoinAbortCount += 1;
    return { proved: false, result: null };
  }
  profiling.exactCandidateJoinLastBestSlotScores = [];
  profiling.exactCandidateJoinLastPairUpperByExcludedSlot = [];
  profiling.exactCandidateJoinLastPairUnseenUpperByExcludedSlot = [];
  profiling.exactCandidateJoinLastPairRootUpperBound = null;
  profiling.exactCandidateJoinLastCandidateCutoffsBySlot = [];
  profiling.exactCandidateJoinLastOtherUpperBySlot = [];
  profiling.exactCandidateJoinLastRelaxedOtherUpperBySlot = [];
  profiling.exactCandidateJoinLastRemainingOtherUpperBySlot = [];
  profiling.exactCandidateJoinLastCandidateCountsBySlot = [];
  profiling.exactCandidateJoinLastCandidateFillElapsedMsBySlot = [];

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
  const exactPairUpperByExcludedSlot: Array<number | null> = Array.from({ length: slots.length }, () => null);
  const exactPairUnseenUpperByExcludedSlot: Array<number | null> = Array.from({ length: slots.length }, () => null);
  const getObservedExactCandidateJoinUpperBound = (): number | null => {
    // An aborted exact join may still have pair-level proof information. Return
    // the tightest safe triple upper we observed so the caller can report a
    // bounded gap instead of discarding useful proof progress.
    let observedUpperBound = Number.POSITIVE_INFINITY;
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const pairUpperBound = exactPairUpperByExcludedSlot[slotIndex];
      const slotBestScore = bestSlotScores[slotIndex];
      if (pairUpperBound !== null && Number.isFinite(pairUpperBound) && Number.isFinite(slotBestScore)) {
        observedUpperBound = Math.min(observedUpperBound, pairUpperBound + slotBestScore);
      }
    }
    let pairUpperBoundSum = 0;
    let hasAllPairUpperBounds = true;
    for (const pairUpperBound of exactPairUpperByExcludedSlot) {
      if (pairUpperBound === null || !Number.isFinite(pairUpperBound)) {
        hasAllPairUpperBounds = false;
        break;
      }
      pairUpperBoundSum += pairUpperBound;
    }
    if (hasAllPairUpperBounds) {
      observedUpperBound = Math.min(
        observedUpperBound,
        pairUpperBoundSum / 2,
      );
    }
    return Number.isFinite(observedUpperBound) ? observedUpperBound : null;
  };
  const buildUnprovedExactCandidateJoinResult = (
    result: BandoriMedleyTeamSearchResult | null = null,
  ): MedleyExactCandidateJoinResult => ({
    proved: false,
    result,
    observedUpperBound: getObservedExactCandidateJoinUpperBound(),
  });

  const initialCandidateStartedAt = performance.now();
  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    const slotInitialCandidateStartedAt = performance.now();
    const topCandidate = generators[slotIndex].next();
    profiling.exactCandidateJoinInitialCandidateElapsedMsBySlot[slotIndex] = (
      performance.now() - slotInitialCandidateStartedAt
    );
    if (stats.timedOut || generators[slotIndex].hasAborted() || !topCandidate) {
      profiling.exactCandidateJoinInitialCandidateElapsedMs += performance.now() - initialCandidateStartedAt;
      profiling.exactCandidateJoinAbortCount += 1;
      profiling.exactCandidateJoinPoppedNodeCount += generators.reduce((sum, generator) => (
        sum + generator.poppedNodeCount()
      ), 0);
      return { proved: false, result: null };
    }
    candidatesBySlot[slotIndex].push(topCandidate);
    bestSlotScores[slotIndex] = topCandidate.result.score;
  }
  profiling.exactCandidateJoinLastBestSlotScores = [...bestSlotScores];
  profiling.exactCandidateJoinInitialCandidateElapsedMs += performance.now() - initialCandidateStartedAt;

  const pairUpperStartedAt = performance.now();
  const shouldUseRootPruneOnlyPairProbe = candidateSoftLimit > 20_000;
  for (let excludedSlotIndex = 0; excludedSlotIndex < slots.length; excludedSlotIndex += 1) {
    const pairSlotIndices = slots
      .map((_, index) => index)
      .filter((index) => index !== excludedSlotIndex) as [number, number];
    const rootPrunePairTarget = incumbentScore - bestSlotScores[excludedSlotIndex];
    const pairUpperResult = proveMedleyExactCandidatePairUpper(
      pairSlotIndices,
      candidatesBySlot,
      generators,
      candidateSoftLimit,
      stats,
      isPastDeadline,
      deadlineAt,
      shouldUseRootPruneOnlyPairProbe ? rootPrunePairTarget : Number.POSITIVE_INFINITY,
      shouldUseRootPruneOnlyPairProbe,
    );
    if (stats.timedOut || generators.some((generator) => generator.hasAborted())) {
      profiling.exactCandidateJoinPairUpperElapsedMs += performance.now() - pairUpperStartedAt;
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
      return buildUnprovedExactCandidateJoinResult();
    }
    if (pairUpperResult.proved) {
      exactPairUpperByExcludedSlot[excludedSlotIndex] = pairUpperResult.upperBound;
      exactPairUnseenUpperByExcludedSlot[excludedSlotIndex] = pairUpperResult.unseenUpperBound;
      if (pairUpperResult.upperBound + bestSlotScores[excludedSlotIndex] <= incumbentScore) {
        profiling.exactCandidateJoinPairUpperElapsedMs += performance.now() - pairUpperStartedAt;
        profiling.exactCandidateJoinGeneratedCandidateCount += candidatesBySlot.reduce((sum, candidates) => (
          sum + candidates.length
        ), 0);
        profiling.exactCandidateJoinMaxCandidateCount = Math.max(
          profiling.exactCandidateJoinMaxCandidateCount,
          ...candidatesBySlot.map((candidates) => candidates.length),
        );
        profiling.exactCandidateJoinPoppedNodeCount += generators.reduce((sum, generator) => (
          sum + generator.poppedNodeCount()
        ), 0);
        profiling.exactCandidateJoinCompletedCount += 1;
        return { proved: true, result: null };
      }
    } else if (shouldUseRootPruneOnlyPairProbe) {
      if (Number.isFinite(pairUpperResult.upperBound)) {
        exactPairUpperByExcludedSlot[excludedSlotIndex] = pairUpperResult.upperBound;
        exactPairUnseenUpperByExcludedSlot[excludedSlotIndex] = pairUpperResult.unseenUpperBound;
      }
      continue;
    }
  }
  profiling.exactCandidateJoinPairUpperElapsedMs += performance.now() - pairUpperStartedAt;
  profiling.exactCandidateJoinLastPairUpperByExcludedSlot = [...exactPairUpperByExcludedSlot];
  profiling.exactCandidateJoinLastPairUnseenUpperByExcludedSlot = [...exactPairUnseenUpperByExcludedSlot];

  const deepPairExcludedSlotIndex = exactPairUpperByExcludedSlot
    .map((upperBound, slotIndex) => ({ slotIndex, upperBound }))
    .filter((entry): entry is { slotIndex: number; upperBound: number } => (
      entry.upperBound !== null && Number.isFinite(entry.upperBound)
    ))
    .sort((left, right) => right.upperBound - left.upperBound)[0]?.slotIndex;
  if (!shouldUseRootPruneOnlyPairProbe && deepPairExcludedSlotIndex !== undefined) {
    const currentUnseenUpperBound = exactPairUnseenUpperByExcludedSlot[deepPairExcludedSlotIndex];
    const currentPairUpperBound = exactPairUpperByExcludedSlot[deepPairExcludedSlotIndex];
    const deepPairUnseenMargin = candidateSoftLimit > 20_000
      ? MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_BUDGET_DEEP_PAIR_UNSEEN_MARGIN
      : MEDLEY_EXACT_CANDIDATE_JOIN_DEEP_PAIR_UNSEEN_MARGIN;
    const targetUnseenUpperBound = (currentPairUpperBound ?? Number.POSITIVE_INFINITY)
      - deepPairUnseenMargin;
    if (
      currentPairUpperBound !== null
      && currentUnseenUpperBound !== null
      && Number.isFinite(targetUnseenUpperBound)
      && currentUnseenUpperBound > targetUnseenUpperBound
    ) {
      const deepPairStartedAt = performance.now();
      const pairSlotIndices = slots
        .map((_, index) => index)
        .filter((index) => index !== deepPairExcludedSlotIndex) as [number, number];
      const deepPairUpperResult = proveMedleyExactCandidatePairUpper(
        pairSlotIndices,
        candidatesBySlot,
        generators,
        candidateSoftLimit,
        stats,
        isPastDeadline,
        deadlineAt,
        targetUnseenUpperBound,
      );
      profiling.exactCandidateJoinPairUpperElapsedMs += performance.now() - deepPairStartedAt;
      if (stats.timedOut || generators.some((generator) => generator.hasAborted())) {
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
        return buildUnprovedExactCandidateJoinResult();
      }
      if (deepPairUpperResult.proved) {
        exactPairUpperByExcludedSlot[deepPairExcludedSlotIndex] = deepPairUpperResult.upperBound;
        exactPairUnseenUpperByExcludedSlot[deepPairExcludedSlotIndex] = deepPairUpperResult.unseenUpperBound;
        profiling.exactCandidateJoinLastPairUpperByExcludedSlot = [...exactPairUpperByExcludedSlot];
        profiling.exactCandidateJoinLastPairUnseenUpperByExcludedSlot = [...exactPairUnseenUpperByExcludedSlot];
      }
    }
  }

  if (shouldUseRootPruneOnlyPairProbe && exactPairUpperByExcludedSlot[0] !== null) {
    const highBudgetDeepPairStartedAt = performance.now();
    const highBudgetDeepPairUpperResult = proveMedleyExactCandidatePairUpper(
      [1, 2],
      candidatesBySlot,
      generators,
      candidateSoftLimit,
      stats,
      isPastDeadline,
      deadlineAt,
    );
    profiling.exactCandidateJoinPairUpperElapsedMs += performance.now() - highBudgetDeepPairStartedAt;
    if (stats.timedOut || generators.some((generator) => generator.hasAborted())) {
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
      return buildUnprovedExactCandidateJoinResult();
    }
    if (highBudgetDeepPairUpperResult.proved) {
      exactPairUpperByExcludedSlot[0] = highBudgetDeepPairUpperResult.upperBound;
      exactPairUnseenUpperByExcludedSlot[0] = highBudgetDeepPairUpperResult.unseenUpperBound;
      profiling.exactCandidateJoinLastPairUpperByExcludedSlot = [...exactPairUpperByExcludedSlot];
      profiling.exactCandidateJoinLastPairUnseenUpperByExcludedSlot = [...exactPairUnseenUpperByExcludedSlot];
    }
  }

  if (exactPairUpperByExcludedSlot.every((upperBound) => upperBound !== null)) {
    const pairRootUpperBound = Math.min(
      ...exactPairUpperByExcludedSlot.map((pairUpperBound, slotIndex) => (
        (pairUpperBound ?? Number.POSITIVE_INFINITY) + bestSlotScores[slotIndex]
      )),
      exactPairUpperByExcludedSlot.reduce((sum, pairUpperBound) => (
        sum + (pairUpperBound ?? Number.POSITIVE_INFINITY)
      ), 0) / 2,
    );
    profiling.exactCandidateJoinLastPairRootUpperBound = pairRootUpperBound;
    if (pairRootUpperBound <= incumbentScore) {
      profiling.exactCandidateJoinGeneratedCandidateCount += candidatesBySlot.reduce((sum, candidates) => (
        sum + candidates.length
      ), 0);
      profiling.exactCandidateJoinMaxCandidateCount = Math.max(
        profiling.exactCandidateJoinMaxCandidateCount,
        ...candidatesBySlot.map((candidates) => candidates.length),
      );
      profiling.exactCandidateJoinPoppedNodeCount += generators.reduce((sum, generator) => (
        sum + generator.poppedNodeCount()
      ), 0);
      profiling.exactCandidateJoinCompletedCount += 1;
      return { proved: true, result: null };
    }
  }

  if (profiling.exactCandidateJoinDebugAnchorSlotIndex !== undefined) {
    const anchoredJoinStartedAt = performance.now();
    const anchoredJoinResult = solveMedleyExactCandidateJoinByAnchor(
      slots,
      candidatesBySlot,
      generators,
      exactPairUpperByExcludedSlot,
      configuration,
      incumbentScore,
      server,
      perfectRate,
      candidateSoftLimit,
      profiling,
      stats,
      isPastDeadline,
      deadlineAt,
    );
    profiling.exactCandidateJoinSolveElapsedMs += performance.now() - anchoredJoinStartedAt;
    if (anchoredJoinResult.timedOut) {
      profiling.exactCandidateJoinAbortCount += 1;
      profiling.exactCandidateJoinLastCandidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
      profiling.exactCandidateJoinGeneratedCandidateCount += candidatesBySlot.reduce((sum, candidates) => (
        sum + candidates.length
      ), 0);
      profiling.exactCandidateJoinMaxCandidateCount = Math.max(
        profiling.exactCandidateJoinMaxCandidateCount,
        ...candidatesBySlot.map((candidates) => candidates.length),
      );
      profiling.exactCandidateJoinPoppedNodeCount += generators.reduce((sum, generator) => (
        sum + generator.poppedNodeCount()
      ), 0);
      return buildUnprovedExactCandidateJoinResult(anchoredJoinResult.result);
    }
    if (anchoredJoinResult.proved) {
      profiling.exactCandidateJoinLastCandidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
      profiling.exactCandidateJoinGeneratedCandidateCount += candidatesBySlot.reduce((sum, candidates) => (
        sum + candidates.length
      ), 0);
      profiling.exactCandidateJoinMaxCandidateCount = Math.max(
        profiling.exactCandidateJoinMaxCandidateCount,
        ...candidatesBySlot.map((candidates) => candidates.length),
      );
      profiling.exactCandidateJoinPoppedNodeCount += generators.reduce((sum, generator) => (
        sum + generator.poppedNodeCount()
      ), 0);
      if (anchoredJoinResult.result && anchoredJoinResult.result.score > incumbentScore) {
        profiling.exactCandidateJoinImprovementCount += 1;
        profiling.bestExactCandidateJoinImprovement = Math.max(
          profiling.bestExactCandidateJoinImprovement,
          anchoredJoinResult.result.score - incumbentScore,
        );
      }
      profiling.exactCandidateJoinCompletedCount += 1;
      return { proved: true, result: anchoredJoinResult.result };
    }
  }

  const candidateCutoffsBySlot = new Array<number>(slots.length).fill(Number.NEGATIVE_INFINITY);
  const candidateOtherUpperBySlot = new Array<number>(slots.length).fill(Number.POSITIVE_INFINITY);
  const candidateRelaxedOtherUpperBySlot = new Array<number>(slots.length).fill(Number.POSITIVE_INFINITY);
  const candidateRemainingOtherUpperBySlot = new Array<number>(slots.length).fill(Number.POSITIVE_INFINITY);
  const candidateFillGenerators = slots.map((slot) => createMedleyExactSlotCandidateGenerator(
    slot,
    server,
    perfectRate,
    stats,
    profiling,
    isPastDeadline,
    deadlineAt,
    nodeSoftLimit,
  ));
  const getCandidateFillGenerator = (slotIndex: number, scoreCutoff: number): MedleyExactSlotCandidateGenerator => (
    generators[slotIndex].canReuseForScoreCutoff(scoreCutoff)
      ? generators[slotIndex]
      : candidateFillGenerators[slotIndex]
  );
  const activeGeneratorsBySlot = [...generators];
  const getCandidateFillProfilingGenerators = (): MedleyExactSlotCandidateGenerator[] => (
    [...new Set([...generators, ...candidateFillGenerators, ...activeGeneratorsBySlot])]
  );
  const candidateKeysBySlot = candidatesBySlot.map((candidates) => (
    new Set(candidates.map(getMedleyExactCandidateCardKey))
  ));
  const rebuildCandidateKeys = (...slotIndices: number[]): void => {
    for (const slotIndex of slotIndices) {
      candidateKeysBySlot[slotIndex] = new Set(candidatesBySlot[slotIndex].map(getMedleyExactCandidateCardKey));
    }
  };
  const refineCandidateFillPairUpper = (excludedSlotIndex: number): boolean => {
    const pairSlotIndices = slots
      .map((_, index) => index)
      .filter((index) => index !== excludedSlotIndex) as [number, number];
    const refineStartedAt = performance.now();
    const pairUpperResult = proveMedleyExactCandidatePairUpper(
      pairSlotIndices,
      candidatesBySlot,
      activeGeneratorsBySlot,
      candidateSoftLimit,
      stats,
      isPastDeadline,
      deadlineAt,
    );
    profiling.exactCandidateJoinPairUpperElapsedMs += performance.now() - refineStartedAt;
    rebuildCandidateKeys(...pairSlotIndices);
    if (stats.timedOut || activeGeneratorsBySlot.some((generator) => generator.hasAborted())) {
      return false;
    }
    if (pairUpperResult.proved) {
      exactPairUpperByExcludedSlot[excludedSlotIndex] = pairUpperResult.upperBound;
      exactPairUnseenUpperByExcludedSlot[excludedSlotIndex] = pairUpperResult.unseenUpperBound;
    }
    return true;
  };
  const candidateFillStartedAt = performance.now();
  const canUseParetoRemainingUpper = slots.every((slot) => (
    slot.searchCards.length <= MEDLEY_EXACT_CANDIDATE_JOIN_PARETO_REMAINING_MAX_SLOT_CARDS
  ));
  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    const slotFillStartedAt = performance.now();
    if (shouldUseRootPruneOnlyPairProbe && slotIndex > 0 && !refineCandidateFillPairUpper(slotIndex)) {
      profiling.exactCandidateJoinCandidateFillElapsedMs += performance.now() - candidateFillStartedAt;
      profiling.exactCandidateJoinLastCandidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
      profiling.exactCandidateJoinLastCandidateFillElapsedMsBySlot[slotIndex] = (
        performance.now() - slotFillStartedAt
      );
      profiling.exactCandidateJoinAbortCount += 1;
      profiling.exactCandidateJoinGeneratedCandidateCount += candidatesBySlot.reduce((sum, candidates) => (
        sum + candidates.length
      ), 0);
      profiling.exactCandidateJoinMaxCandidateCount = Math.max(
        profiling.exactCandidateJoinMaxCandidateCount,
        ...candidatesBySlot.map((candidates) => candidates.length),
      );
      profiling.exactCandidateJoinPoppedNodeCount += getCandidateFillProfilingGenerators().reduce((sum, currentGenerator) => (
        sum + currentGenerator.poppedNodeCount()
      ), 0);
      return buildUnprovedExactCandidateJoinResult();
    }
    const relaxedOtherUpper = bestSlotScores.reduce((sum, score, index) => (
      index === slotIndex ? sum : sum + score
    ), 0);
    const exactPairUpper = exactPairUpperByExcludedSlot[slotIndex];
    const shouldSkipRemainingOtherUpper = (
      shouldUseRootPruneOnlyPairProbe
      && exactPairUpper !== null
      && Number.isFinite(exactPairUpper)
    );
    const remainingOtherUpper = shouldSkipRemainingOtherUpper
      ? Number.POSITIVE_INFINITY
      : estimateMedleyRemainingScoreUpperBound(
        slots,
        slots.map((_, index) => index).filter((index) => index !== slotIndex),
        new Set<number>(),
        profiling,
        true,
        true,
        canUseParetoRemainingUpper,
      );
    const otherUpper = Math.min(
      relaxedOtherUpper,
      Number.isFinite(remainingOtherUpper) ? remainingOtherUpper : Number.POSITIVE_INFINITY,
      exactPairUpper !== null ? exactPairUpper : Number.POSITIVE_INFINITY,
    );
    const remainingSlotIndices = slots.map((_, index) => index).filter((index) => index !== slotIndex);
    const cutoff = incumbentScore - otherUpper;
    candidateCutoffsBySlot[slotIndex] = cutoff;
    candidateOtherUpperBySlot[slotIndex] = otherUpper;
    candidateRelaxedOtherUpperBySlot[slotIndex] = relaxedOtherUpper;
    candidateRemainingOtherUpperBySlot[slotIndex] = remainingOtherUpper;
    profiling.exactCandidateJoinLastCandidateCutoffsBySlot = [...candidateCutoffsBySlot];
    profiling.exactCandidateJoinLastOtherUpperBySlot = [...candidateOtherUpperBySlot];
    profiling.exactCandidateJoinLastRelaxedOtherUpperBySlot = [...candidateRelaxedOtherUpperBySlot];
    profiling.exactCandidateJoinLastRemainingOtherUpperBySlot = [...candidateRemainingOtherUpperBySlot];
    profiling.exactCandidateJoinDebugKnownCandidateCutoffsBySlot = [...candidateCutoffsBySlot];
    const generator = getCandidateFillGenerator(slotIndex, cutoff);
    activeGeneratorsBySlot[slotIndex] = generator;
    while (generator.peekUpperBound() >= cutoff) {
      if (performance.now() >= deadlineAt) {
        profiling.exactCandidateJoinCandidateFillElapsedMs += performance.now() - candidateFillStartedAt;
        profiling.exactCandidateJoinLastCandidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
        profiling.exactCandidateJoinLastCandidateFillElapsedMsBySlot[slotIndex] = (
          performance.now() - slotFillStartedAt
        );
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
        profiling.exactCandidateJoinPoppedNodeCount += getCandidateFillProfilingGenerators().reduce((sum, currentGenerator) => (
          sum + currentGenerator.poppedNodeCount()
        ), 0);
        return buildUnprovedExactCandidateJoinResult();
      }
      if (candidatesBySlot[slotIndex].length >= candidateSoftLimit) {
        profiling.exactCandidateJoinCandidateFillElapsedMs += performance.now() - candidateFillStartedAt;
        profiling.exactCandidateJoinLastCandidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
        profiling.exactCandidateJoinLastCandidateFillElapsedMsBySlot[slotIndex] = (
          performance.now() - slotFillStartedAt
        );
        profiling.exactCandidateJoinAbortCount += 1;
        profiling.exactCandidateJoinGeneratedCandidateCount += candidatesBySlot.reduce((sum, candidates) => (
          sum + candidates.length
        ), 0);
        profiling.exactCandidateJoinMaxCandidateCount = Math.max(
          profiling.exactCandidateJoinMaxCandidateCount,
          ...candidatesBySlot.map((candidates) => candidates.length),
        );
        profiling.exactCandidateJoinPoppedNodeCount += getCandidateFillProfilingGenerators().reduce((sum, currentGenerator) => (
          sum + currentGenerator.poppedNodeCount()
        ), 0);
        return buildUnprovedExactCandidateJoinResult();
      }

      const globalPruning = {
        slots,
        remainingSlotIndices,
        scoreCutoff: incumbentScore,
        candidatesBySlot,
        pairUnseenUpperBound: exactPairUnseenUpperByExcludedSlot[slotIndex] ?? undefined,
        useCapacityComplementUpper: false,
        capacityComplementMargin: MEDLEY_EXACT_CANDIDATE_JOIN_CAPACITY_COMPLEMENT_MARGIN,
        excludedCandidateKeys: candidateKeysBySlot[slotIndex],
      };
      const candidate = generator.next(cutoff, globalPruning);
      if (stats.timedOut || generator.hasAborted()) {
        profiling.exactCandidateJoinCandidateFillElapsedMs += performance.now() - candidateFillStartedAt;
        profiling.exactCandidateJoinLastCandidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
        profiling.exactCandidateJoinLastCandidateFillElapsedMsBySlot[slotIndex] = (
          performance.now() - slotFillStartedAt
        );
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
        return buildUnprovedExactCandidateJoinResult();
      }
      if (!candidate) {
        break;
      }
      const candidateKey = getMedleyExactCandidateCardKey(candidate);
      if (candidateKeysBySlot[slotIndex].has(candidateKey)) {
        continue;
      }
      candidateKeysBySlot[slotIndex].add(candidateKey);
      if (candidate.result.score >= cutoff) {
        candidatesBySlot[slotIndex].push(candidate);
      }
    }
    profiling.exactCandidateJoinLastCandidateFillElapsedMsBySlot[slotIndex] = (
      performance.now() - slotFillStartedAt
    );
  }
  profiling.exactCandidateJoinCandidateFillElapsedMs += performance.now() - candidateFillStartedAt;

  candidatesBySlot.forEach(sortMedleyCandidates);
  if (profiling.exactCandidateJoinDebugKnownCardIdsBySlot) {
    profiling.exactCandidateJoinDebugKnownCandidateCutoffsBySlot = candidateCutoffsBySlot;
    profiling.exactCandidateJoinDebugKnownCandidatePresentBySlot = [];
    profiling.exactCandidateJoinDebugKnownCandidateScoresBySlot = [];
    profiling.exactCandidateJoinDebugKnownCardIdsBySlot.forEach((knownCardIds, slotIndex) => {
      const knownKey = [...knownCardIds].sort((left, right) => left - right).join(",");
      const candidate = candidatesBySlot[slotIndex]?.find((currentCandidate) => (
        [...currentCandidate.cardIds].sort((left, right) => left - right).join(",") === knownKey
      )) ?? null;
      profiling.exactCandidateJoinDebugKnownCandidatePresentBySlot?.push(Boolean(candidate));
      profiling.exactCandidateJoinDebugKnownCandidateScoresBySlot?.push(candidate?.result.score ?? null);
    });
  }
  profiling.exactCandidateJoinLastCandidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
  const generatedCandidateCount = candidatesBySlot.reduce((sum, candidates) => sum + candidates.length, 0);
  profiling.exactCandidateJoinGeneratedCandidateCount += generatedCandidateCount;
  profiling.exactCandidateJoinMaxCandidateCount = Math.max(
    profiling.exactCandidateJoinMaxCandidateCount,
    ...candidatesBySlot.map((candidates) => candidates.length),
  );
  profiling.exactCandidateJoinPoppedNodeCount += getCandidateFillProfilingGenerators().reduce((sum, generator) => (
    sum + generator.poppedNodeCount()
  ), 0);
  const solveStartedAt = performance.now();
  const joinResult = solveMedleyExactCandidateJoin(
    slots,
    candidatesBySlot,
    configuration,
    incumbentScore,
    server,
    perfectRate,
    profiling,
    stats,
    isPastDeadline,
    deadlineAt,
  );
  profiling.exactCandidateJoinSolveElapsedMs += performance.now() - solveStartedAt;
  if (joinResult.timedOut) {
    profiling.exactCandidateJoinAbortCount += 1;
    return buildUnprovedExactCandidateJoinResult(joinResult.result);
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
