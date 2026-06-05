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
  MEDLEY_EXACT_CANDIDATE_JOIN_DIRECT_THIRD_SCAN_MAX_CANDIDATES,
  MEDLEY_EXACT_CANDIDATE_JOIN_EXTENDED_THIRD_SHORTLIST_CACHE_ENTRY_LIMIT,
  MEDLEY_EXACT_CANDIDATE_JOIN_EXTENDED_THIRD_SHORTLIST_MAX_THIRD_CANDIDATES,
  MEDLEY_EXACT_CANDIDATE_JOIN_EXTENDED_THIRD_SHORTLIST_QUERY_LIMIT,
  MEDLEY_EXACT_CANDIDATE_JOIN_EXTENDED_THIRD_SHORTLIST_SIZE,
  MEDLEY_EXACT_CANDIDATE_JOIN_GUARDED_CANDIDATE_SOFT_LIMIT,
  MEDLEY_EXACT_CANDIDATE_JOIN_GUARDED_EXTENSION_BASE_SOFT_LIMIT,
  MEDLEY_EXACT_CANDIDATE_JOIN_GUARDED_EXTENSION_MAX_CARD_COUNT,
  MEDLEY_EXACT_CANDIDATE_JOIN_GUARDED_EXTENSION_MIN_REMAINING_MS,
  MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_BUDGET_DEEP_PAIR_UNSEEN_MARGIN,
  MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_PAIR_COARSE_CACHE_BUCKET,
  MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_PAIR_FINE_CACHE_BUCKET,
  MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_PAIR_FINE_MIN_RECORD_COUNT,
  MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_PAIR_FINE_RECORD_THRESHOLD,
  MEDLEY_EXACT_CANDIDATE_JOIN_MIDDLE_FIRST_THIRD_SHORTLIST_SIZE,
  MEDLEY_EXACT_CANDIDATE_JOIN_PARETO_REMAINING_MAX_SLOT_CARDS,
  MEDLEY_EXACT_CANDIDATE_JOIN_SOLVE_CACHE_ENTRY_LIMIT,
  MEDLEY_EXACT_CANDIDATE_JOIN_SOLVE_MAX_SMALLEST_CANDIDATES,
  MEDLEY_EXACT_CANDIDATE_JOIN_SMALL_GAP_SOLVE_RETRY_MAX_CARD_COUNT,
  MEDLEY_EXACT_CANDIDATE_JOIN_SMALL_GAP_SOLVE_RETRY_MAX_SMALLEST_CANDIDATES,
  MEDLEY_EXACT_CANDIDATE_JOIN_SMALL_GAP_SOLVE_RETRY_MAX_UPPER_GAP,
  MEDLEY_EXACT_CANDIDATE_JOIN_SMALL_GAP_SOLVE_RETRY_MIN_REMAINING_MS,
  MEDLEY_EXACT_CANDIDATE_JOIN_SMALL_GAP_SOLVE_RETRY_TIMEBOX_MS,
  MEDLEY_EXACT_CANDIDATE_JOIN_STAGED_CANDIDATE_SOFT_LIMITS,
  MEDLEY_EXACT_CANDIDATE_JOIN_STAGED_EXTENSION_MIN_REMAINING_MS,
  MEDLEY_EXACT_CANDIDATE_JOIN_STAGED_EXTENSION_MAX_OTHER_SLOT_CANDIDATES,
  MEDLEY_EXACT_CANDIDATE_JOIN_STAGED_EXTENSION_MAX_PEEK_CUTOFF_GAP,
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
  MedleyExactCandidateJoinAbortReason,
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
      if ((index & 31) === 0 && (performance.now() >= deadlineAt || isPastDeadline())) {
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
  localDeadlineAt: number | null = null,
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
  const shouldUseDirectThirdBitsetScan = (
    thirdCandidates.length <= MEDLEY_EXACT_CANDIDATE_JOIN_DIRECT_THIRD_SCAN_MAX_CANDIDATES
  );
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
  const containingThirdBitsByCandidate = new WeakMap<MedleyTeamCandidate, Uint32Array[]>();
  let containingThirdBitsCacheEntryCount = 0;
  const getContainingThirdBitsForCandidate = (candidate: MedleyTeamCandidate): Uint32Array[] => {
    const cached = containingThirdBitsByCandidate.get(candidate);
    if (cached) {
      return cached;
    }
    const containingBits: Uint32Array[] = [];
    for (const cardId of candidate.cardIds) {
      const currentContainingBits = containingThirdCandidateBitsByCardId.get(cardId);
      if (currentContainingBits) {
        containingBits.push(currentContainingBits);
      }
    }
    if (containingThirdBitsCacheEntryCount < MEDLEY_EXACT_CANDIDATE_JOIN_SOLVE_CACHE_ENTRY_LIMIT) {
      containingThirdBitsByCandidate.set(candidate, containingBits);
      containingThirdBitsCacheEntryCount += 1;
    }
    return containingBits;
  };
  const readCombinedContainingBitsWord = (containingBits: Uint32Array[], wordIndex: number): number => {
    switch (containingBits.length) {
      case 0:
        return 0;
      case 1:
        return containingBits[0][wordIndex];
      case 2:
        return containingBits[0][wordIndex] | containingBits[1][wordIndex];
      case 3:
        return containingBits[0][wordIndex] | containingBits[1][wordIndex] | containingBits[2][wordIndex];
      case 4:
        return (
          containingBits[0][wordIndex]
          | containingBits[1][wordIndex]
          | containingBits[2][wordIndex]
          | containingBits[3][wordIndex]
        );
      default:
        return (
          containingBits[0][wordIndex]
          | containingBits[1][wordIndex]
          | containingBits[2][wordIndex]
          | containingBits[3][wordIndex]
          | containingBits[4][wordIndex]
        );
    }
  };
  const findBestDisjointThirdCandidateByForbiddenBits = (
    primaryForbiddenBits: Uint32Array,
    secondaryContainingBits?: Uint32Array[],
    startCandidateIndex = 0,
  ): MedleyTeamCandidate | null => {
    localThirdQueryCount += 1;
    const boundedStartCandidateIndex = Math.max(0, Math.trunc(startCandidateIndex));
    if (boundedStartCandidateIndex >= thirdCandidates.length) {
      return null;
    }
    const startWordIndex = boundedStartCandidateIndex >> 5;
    const startBitIndex = boundedStartCandidateIndex & 31;
    const startWordMask = startBitIndex === 0 ? 0xffffffff : (0xffffffff << startBitIndex) >>> 0;
    let scannedWordCount = 0;
    const finishAvailableWord = (availableBits: number, wordIndex: number): MedleyTeamCandidate | null => {
      const lowestAvailableBit = availableBits & -availableBits;
      const bitIndex = 31 - Math.clz32(lowestAvailableBit);
      localThirdFallbackWordScanCount += scannedWordCount;
      return thirdCandidates[wordIndex * 32 + bitIndex] ?? null;
    };
    const applyWordBounds = (availableBits: number, wordIndex: number): number => {
      let maskedAvailableBits = availableBits;
      if (wordIndex === startWordIndex) {
        maskedAvailableBits &= startWordMask;
      }
      if (wordIndex === thirdCandidateLastWordIndex) {
        maskedAvailableBits &= thirdCandidateLastWordMask;
      }
      return maskedAvailableBits >>> 0;
    };
    const scanLastWord = (availableBits: number): MedleyTeamCandidate | null => {
      const maskedAvailableBits = applyWordBounds(availableBits, thirdCandidateLastWordIndex);
      return maskedAvailableBits !== 0 ? finishAvailableWord(maskedAvailableBits, thirdCandidateLastWordIndex) : null;
    };
    if (!secondaryContainingBits || secondaryContainingBits.length === 0) {
      for (let wordIndex = startWordIndex; wordIndex < thirdCandidateLastWordIndex; wordIndex += 1) {
        scannedWordCount += 1;
        const availableBits = applyWordBounds((~primaryForbiddenBits[wordIndex]) >>> 0, wordIndex);
        if (availableBits !== 0) {
          return finishAvailableWord(availableBits, wordIndex);
        }
      }
      if (thirdCandidateLastWordIndex >= startWordIndex) {
        scannedWordCount += 1;
        const candidate = scanLastWord((~primaryForbiddenBits[thirdCandidateLastWordIndex]) >>> 0);
        if (candidate) {
          return candidate;
        }
      }
      localThirdFallbackWordScanCount += scannedWordCount;
      return null;
    }
    if (secondaryContainingBits.length === 1) {
      const bits0 = secondaryContainingBits[0];
      for (let wordIndex = startWordIndex; wordIndex < thirdCandidateLastWordIndex; wordIndex += 1) {
        scannedWordCount += 1;
        const availableBits = applyWordBounds((~(primaryForbiddenBits[wordIndex] | bits0[wordIndex])) >>> 0, wordIndex);
        if (availableBits !== 0) {
          return finishAvailableWord(availableBits, wordIndex);
        }
      }
      if (thirdCandidateLastWordIndex >= startWordIndex) {
        scannedWordCount += 1;
        const candidate = scanLastWord((~(
          primaryForbiddenBits[thirdCandidateLastWordIndex] | bits0[thirdCandidateLastWordIndex]
        )) >>> 0);
        if (candidate) {
          return candidate;
        }
      }
    } else if (secondaryContainingBits.length === 2) {
      const bits0 = secondaryContainingBits[0];
      const bits1 = secondaryContainingBits[1];
      for (let wordIndex = startWordIndex; wordIndex < thirdCandidateLastWordIndex; wordIndex += 1) {
        scannedWordCount += 1;
        const availableBits = applyWordBounds(
          (~(primaryForbiddenBits[wordIndex] | bits0[wordIndex] | bits1[wordIndex])) >>> 0,
          wordIndex,
        );
        if (availableBits !== 0) {
          return finishAvailableWord(availableBits, wordIndex);
        }
      }
      if (thirdCandidateLastWordIndex >= startWordIndex) {
        scannedWordCount += 1;
        const candidate = scanLastWord((~(
          primaryForbiddenBits[thirdCandidateLastWordIndex]
          | bits0[thirdCandidateLastWordIndex]
          | bits1[thirdCandidateLastWordIndex]
        )) >>> 0);
        if (candidate) {
          return candidate;
        }
      }
    } else if (secondaryContainingBits.length === 3) {
      const bits0 = secondaryContainingBits[0];
      const bits1 = secondaryContainingBits[1];
      const bits2 = secondaryContainingBits[2];
      for (let wordIndex = startWordIndex; wordIndex < thirdCandidateLastWordIndex; wordIndex += 1) {
        scannedWordCount += 1;
        const availableBits = applyWordBounds(
          (~(primaryForbiddenBits[wordIndex] | bits0[wordIndex] | bits1[wordIndex] | bits2[wordIndex])) >>> 0,
          wordIndex,
        );
        if (availableBits !== 0) {
          return finishAvailableWord(availableBits, wordIndex);
        }
      }
      if (thirdCandidateLastWordIndex >= startWordIndex) {
        scannedWordCount += 1;
        const candidate = scanLastWord((~(
          primaryForbiddenBits[thirdCandidateLastWordIndex]
          | bits0[thirdCandidateLastWordIndex]
          | bits1[thirdCandidateLastWordIndex]
          | bits2[thirdCandidateLastWordIndex]
        )) >>> 0);
        if (candidate) {
          return candidate;
        }
      }
    } else if (secondaryContainingBits.length === 4) {
      const bits0 = secondaryContainingBits[0];
      const bits1 = secondaryContainingBits[1];
      const bits2 = secondaryContainingBits[2];
      const bits3 = secondaryContainingBits[3];
      for (let wordIndex = startWordIndex; wordIndex < thirdCandidateLastWordIndex; wordIndex += 1) {
        scannedWordCount += 1;
        const availableBits = applyWordBounds(
          (~(
            primaryForbiddenBits[wordIndex]
            | bits0[wordIndex]
            | bits1[wordIndex]
            | bits2[wordIndex]
            | bits3[wordIndex]
          )) >>> 0,
          wordIndex,
        );
        if (availableBits !== 0) {
          return finishAvailableWord(availableBits, wordIndex);
        }
      }
      if (thirdCandidateLastWordIndex >= startWordIndex) {
        scannedWordCount += 1;
        const candidate = scanLastWord((~(
          primaryForbiddenBits[thirdCandidateLastWordIndex]
          | bits0[thirdCandidateLastWordIndex]
          | bits1[thirdCandidateLastWordIndex]
          | bits2[thirdCandidateLastWordIndex]
          | bits3[thirdCandidateLastWordIndex]
        )) >>> 0);
        if (candidate) {
          return candidate;
        }
      }
    } else if (secondaryContainingBits.length === 5) {
      const bits0 = secondaryContainingBits[0];
      const bits1 = secondaryContainingBits[1];
      const bits2 = secondaryContainingBits[2];
      const bits3 = secondaryContainingBits[3];
      const bits4 = secondaryContainingBits[4];
      for (let wordIndex = startWordIndex; wordIndex < thirdCandidateLastWordIndex; wordIndex += 1) {
        scannedWordCount += 1;
        const availableBits = applyWordBounds(
          (~(
            primaryForbiddenBits[wordIndex]
            | bits0[wordIndex]
            | bits1[wordIndex]
            | bits2[wordIndex]
            | bits3[wordIndex]
            | bits4[wordIndex]
          )) >>> 0,
          wordIndex,
        );
        if (availableBits !== 0) {
          return finishAvailableWord(availableBits, wordIndex);
        }
      }
      if (thirdCandidateLastWordIndex >= startWordIndex) {
        scannedWordCount += 1;
        const candidate = scanLastWord((~(
          primaryForbiddenBits[thirdCandidateLastWordIndex]
          | bits0[thirdCandidateLastWordIndex]
          | bits1[thirdCandidateLastWordIndex]
          | bits2[thirdCandidateLastWordIndex]
          | bits3[thirdCandidateLastWordIndex]
          | bits4[thirdCandidateLastWordIndex]
        )) >>> 0);
        if (candidate) {
          return candidate;
        }
      }
    } else {
      for (let wordIndex = startWordIndex; wordIndex < thirdCandidateLastWordIndex; wordIndex += 1) {
        scannedWordCount += 1;
        const availableBits = applyWordBounds(
          (~(
            primaryForbiddenBits[wordIndex] | readCombinedContainingBitsWord(secondaryContainingBits, wordIndex)
          )) >>> 0,
          wordIndex,
        );
        if (availableBits !== 0) {
          return finishAvailableWord(availableBits, wordIndex);
        }
      }
      if (thirdCandidateLastWordIndex >= startWordIndex) {
        scannedWordCount += 1;
        const candidate = scanLastWord((~(
          primaryForbiddenBits[thirdCandidateLastWordIndex]
          | readCombinedContainingBitsWord(secondaryContainingBits, thirdCandidateLastWordIndex)
        )) >>> 0);
        if (candidate) {
          return candidate;
        }
      }
    }
    localThirdFallbackWordScanCount += scannedWordCount;
    return null;
  };
  const buildThirdShortlistForCandidate = (
    candidate: MedleyTeamCandidate,
    shortlistSize: number,
  ): ThirdCandidateShortlist => {
    const candidateIndices = new Uint32Array(shortlistSize);
    let candidateIndexCount = 0;
    let exhaustive = true;
    const forbiddenThirdCandidateContainingBits = getContainingThirdBitsForCandidate(candidate);
    const lastWordIndex = thirdCandidateBitsetWordCount - 1;
    const lastWordRemainder = thirdCandidates.length & 31;
    const lastWordMask = lastWordRemainder === 0
      ? 0xffffffff
      : 0xffffffff >>> (32 - lastWordRemainder);
    for (let wordIndex = 0; wordIndex < thirdCandidateBitsetWordCount; wordIndex += 1) {
      let availableThirdBits = (~readCombinedContainingBitsWord(
        forbiddenThirdCandidateContainingBits,
        wordIndex,
      )) >>> 0;
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
        if (candidateIndexCount >= shortlistSize) {
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
  let thirdShortlistCacheEntryCount = 0;
  const getThirdShortlistForCandidate = (
    candidate: MedleyTeamCandidate,
  ): ThirdCandidateShortlist => {
    const cached = thirdShortlistCache.get(candidate);
    if (cached) {
      return cached;
    }
    const shortlist = buildThirdShortlistForCandidate(candidate, thirdShortlistSize);
    if (thirdShortlistCacheEntryCount < MEDLEY_EXACT_CANDIDATE_JOIN_SOLVE_CACHE_ENTRY_LIMIT) {
      thirdShortlistCache.set(candidate, shortlist);
      thirdShortlistCacheEntryCount += 1;
    }
    return shortlist;
  };
  const extendedThirdShortlistCache = new WeakMap<MedleyTeamCandidate, ThirdCandidateShortlist>();
  let extendedThirdShortlistCacheEntryCount = 0;
  const getExtendedThirdShortlistForCandidate = (
    candidate: MedleyTeamCandidate,
  ): ThirdCandidateShortlist => {
    const cached = extendedThirdShortlistCache.get(candidate);
    if (cached) {
      return cached;
    }
    const shortlist = buildThirdShortlistForCandidate(
      candidate,
      MEDLEY_EXACT_CANDIDATE_JOIN_EXTENDED_THIRD_SHORTLIST_SIZE,
    );
    if (extendedThirdShortlistCacheEntryCount < MEDLEY_EXACT_CANDIDATE_JOIN_EXTENDED_THIRD_SHORTLIST_CACHE_ENTRY_LIMIT) {
      extendedThirdShortlistCache.set(candidate, shortlist);
      extendedThirdShortlistCacheEntryCount += 1;
    }
    return shortlist;
  };
  const bestThirdByCardIdsCache = new WeakMap<MedleyTeamCandidate, MedleyTeamCandidate | null>();
  let bestThirdByCardIdsCacheEntryCount = 0;
  const getBestThirdByCardIds = (candidate: MedleyTeamCandidate): MedleyTeamCandidate | null => {
    if (bestThirdByCardIdsCache.has(candidate)) {
      return bestThirdByCardIdsCache.get(candidate) ?? null;
    }
    const bestThirdCandidate = findBestDisjointMedleyExactCandidateByCardIds(thirdCandidates, candidate.cardIds);
    if (bestThirdByCardIdsCacheEntryCount < MEDLEY_EXACT_CANDIDATE_JOIN_SOLVE_CACHE_ENTRY_LIMIT) {
      bestThirdByCardIdsCache.set(candidate, bestThirdCandidate);
      bestThirdByCardIdsCacheEntryCount += 1;
    }
    return bestThirdCandidate;
  };
  let bestResult: BandoriMedleyTeamSearchResult | null = null;
  let currentScoreCutoff = incumbentScore + 1;
  let localPairCount = 0;
  let localThirdQueryCount = 0;
  let localThirdShortlistQueryCount = 0;
  let localThirdShortlistHitCount = 0;
  let localThirdShortlistFallbackCount = 0;
  let localThirdShortlistExhaustiveMissCount = 0;
  let localThirdFallbackWordScanCount = 0;
  let localExtendedThirdShortlistQueryCount = 0;
  let localExtendedThirdShortlistHitCount = 0;
  let localExtendedThirdShortlistFallbackCount = 0;
  let localExtendedThirdShortlistExhaustiveMissCount = 0;
  const flushSolveProfilingCounters = (): void => {
    profiling.exactCandidateJoinPairCount += localPairCount;
    profiling.exactCandidateJoinThirdQueryCount += localThirdQueryCount;
    profiling.exactCandidateJoinThirdShortlistQueryCount += localThirdShortlistQueryCount;
    profiling.exactCandidateJoinThirdShortlistHitCount += localThirdShortlistHitCount;
    profiling.exactCandidateJoinThirdShortlistFallbackCount += localThirdShortlistFallbackCount;
    profiling.exactCandidateJoinThirdShortlistExhaustiveMissCount += localThirdShortlistExhaustiveMissCount;
    profiling.exactCandidateJoinThirdFallbackWordScanCount += localThirdFallbackWordScanCount;
    profiling.exactCandidateJoinExtendedThirdShortlistQueryCount += localExtendedThirdShortlistQueryCount;
    profiling.exactCandidateJoinExtendedThirdShortlistHitCount += localExtendedThirdShortlistHitCount;
    profiling.exactCandidateJoinExtendedThirdShortlistFallbackCount += localExtendedThirdShortlistFallbackCount;
    profiling.exactCandidateJoinExtendedThirdShortlistExhaustiveMissCount += (
      localExtendedThirdShortlistExhaustiveMissCount
    );
    profiling.exactCandidateJoinExtendedThirdShortlistCacheEntryCount += extendedThirdShortlistCacheEntryCount;
  };
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
          const now = performance.now();
          const hitLocalDeadline = localDeadlineAt !== null && now >= localDeadlineAt;
          const hitGlobalDeadline = stats.timedOut || now >= deadlineAt || isPastDeadline();
          if (hitLocalDeadline || hitGlobalDeadline) {
            if (hitGlobalDeadline) {
              stats.isExhaustive = false;
              stats.timedOut = true;
              stats.searchMode = "bounded";
            }
            flushSolveProfilingCounters();
            return { timedOut: true, localTimedOut: hitLocalDeadline && !hitGlobalDeadline, result: bestResult };
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

        let thirdCandidate: MedleyTeamCandidate | null = null;
        if (shouldUseDirectThirdBitsetScan) {
          const secondForbiddenThirdCandidateContainingBits = getContainingThirdBitsForCandidate(secondCandidate);
          thirdCandidate = findBestDisjointThirdCandidateByForbiddenBits(
            firstForbiddenThirdCandidateBits,
            secondForbiddenThirdCandidateContainingBits,
          );
        } else {
          const secondThirdShortlist = getThirdShortlistForCandidate(secondCandidate);
          localThirdShortlistQueryCount += 1;
          for (let shortlistIndex = 0; shortlistIndex < secondThirdShortlist.count; shortlistIndex += 1) {
            const currentThirdCandidateIndex = secondThirdShortlist.candidateIndices[shortlistIndex];
            if (
              (firstForbiddenThirdCandidateBits[currentThirdCandidateIndex >> 5]
                & (1 << (currentThirdCandidateIndex & 31))) === 0
            ) {
              thirdCandidate = thirdCandidates[currentThirdCandidateIndex] ?? null;
              localThirdShortlistHitCount += 1;
              break;
            }
          }
          if (!thirdCandidate && !secondThirdShortlist.exhaustive) {
            localThirdShortlistFallbackCount += 1;
            let fallbackStartCandidateIndex = secondThirdShortlist.count > 0
              ? secondThirdShortlist.candidateIndices[secondThirdShortlist.count - 1] + 1
              : 0;
            let shouldRunBitsetFallback = true;
            const shouldUseExtendedThirdShortlist = (
              thirdCandidates.length <= MEDLEY_EXACT_CANDIDATE_JOIN_EXTENDED_THIRD_SHORTLIST_MAX_THIRD_CANDIDATES
              && localExtendedThirdShortlistQueryCount < (
                MEDLEY_EXACT_CANDIDATE_JOIN_EXTENDED_THIRD_SHORTLIST_QUERY_LIMIT
              )
            );
            if (shouldUseExtendedThirdShortlist) {
              const extendedThirdShortlist = getExtendedThirdShortlistForCandidate(secondCandidate);
              localExtendedThirdShortlistQueryCount += 1;
              for (let shortlistIndex = 0; shortlistIndex < extendedThirdShortlist.count; shortlistIndex += 1) {
                const currentThirdCandidateIndex = extendedThirdShortlist.candidateIndices[shortlistIndex];
                if (
                  (firstForbiddenThirdCandidateBits[currentThirdCandidateIndex >> 5]
                    & (1 << (currentThirdCandidateIndex & 31))) === 0
                ) {
                  thirdCandidate = thirdCandidates[currentThirdCandidateIndex] ?? null;
                  localExtendedThirdShortlistHitCount += 1;
                  break;
                }
              }
              if (extendedThirdShortlist.count > 0) {
                fallbackStartCandidateIndex = extendedThirdShortlist.candidateIndices[
                  extendedThirdShortlist.count - 1
                ] + 1;
              }
              if (!thirdCandidate && extendedThirdShortlist.exhaustive) {
                localExtendedThirdShortlistExhaustiveMissCount += 1;
                shouldRunBitsetFallback = false;
              }
            }
            if (!thirdCandidate && shouldRunBitsetFallback && fallbackStartCandidateIndex < thirdCandidates.length) {
              const fallbackThirdScoreUpper = thirdCandidates[fallbackStartCandidateIndex]?.result.score
                ?? Number.NEGATIVE_INFINITY;
              if (firstSecondScore + fallbackThirdScoreUpper < currentScoreCutoff) {
                continue;
              }
              localExtendedThirdShortlistFallbackCount += 1;
              const secondForbiddenThirdCandidateContainingBits = getContainingThirdBitsForCandidate(secondCandidate);
              thirdCandidate = findBestDisjointThirdCandidateByForbiddenBits(
                firstForbiddenThirdCandidateBits,
                secondForbiddenThirdCandidateContainingBits,
                fallbackStartCandidateIndex,
              );
            }
          } else if (!thirdCandidate) {
            localThirdShortlistExhaustiveMissCount += 1;
          }
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
  flushSolveProfilingCounters();
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
  context: {
    calculatedCardCount?: number;
    enableExperimentalStagedCandidateExtension?: boolean;
    enableSmallGapSolveRetry?: boolean;
  } = {},
): MedleyExactCandidateJoinResult {
  // This wrapper proves one area-item configuration. The caller remains responsible for
  // aggregating configuration-level proof across locked/all scopes before reporting exact.
  profiling.exactCandidateJoinCallCount += 1;
  const normalizeDiagnosticNumber = (value: number | null | undefined): number | null => (
    value !== null && value !== undefined && Number.isFinite(value) ? value : null
  );
  const resetAbortDiagnostics = (): void => {
    profiling.exactCandidateJoinLastAbortReason = null;
    profiling.exactCandidateJoinLastAbortSlotIndex = null;
    profiling.exactCandidateJoinLastAbortCandidateSoftLimit = null;
    profiling.exactCandidateJoinLastAbortNodeSoftLimit = null;
    profiling.exactCandidateJoinLastAbortCandidateCount = null;
    profiling.exactCandidateJoinLastAbortCutoff = null;
    profiling.exactCandidateJoinLastAbortPeekUpperBound = null;
    profiling.exactCandidateJoinLastAbortOtherUpper = null;
    profiling.exactCandidateJoinLastAbortObservedUpperBound = null;
    profiling.exactCandidateJoinLastAbortRemainingMs = null;
    profiling.exactCandidateJoinLastGuardedExtensionSlotIndex = null;
    profiling.exactCandidateJoinLastGuardedExtensionLimit = null;
    profiling.exactCandidateJoinLastGuardedExtensionRemainingMs = null;
    profiling.exactCandidateJoinLastGuardedExtensionPeakHeapMiB = null;
    profiling.exactCandidateJoinLastGuardedExtensionObservedUpperBound = null;
    profiling.exactCandidateJoinLastStagedExtensionSlotIndex = null;
    profiling.exactCandidateJoinLastStagedExtensionLimit = null;
    profiling.exactCandidateJoinLastStagedExtensionPeekCutoffGap = null;
    profiling.exactCandidateJoinLastStagedExtensionCandidateCountsBySlot = [];
    profiling.exactCandidateJoinLastStagedExtensionOtherSlotCandidateCounts = [];
    profiling.exactCandidateJoinLastStagedExtensionRemainingMs = null;
    profiling.exactCandidateJoinLastStagedExtensionPeakHeapMiB = null;
    profiling.exactCandidateJoinLastSmallGapSolveRetryCandidateLimit = null;
    profiling.exactCandidateJoinLastSmallGapSolveRetryCandidateCountsBySlot = [];
    profiling.exactCandidateJoinLastSmallGapSolveRetryUpperGap = null;
    profiling.exactCandidateJoinLastSmallGapSolveRetryRemainingMs = null;
    profiling.exactCandidateJoinLastSmallGapSolveRetryTimeboxMs = null;
    profiling.exactCandidateJoinLastSmallGapSolveRetryPeakHeapMiB = null;
  };
  const recordAbortDiagnostics = (
    reason: Exclude<MedleyExactCandidateJoinAbortReason, null>,
    diagnostics: {
      slotIndex?: number | null;
      candidateCount?: number | null;
      cutoff?: number | null;
      peekUpperBound?: number | null;
      otherUpper?: number | null;
      observedUpperBound?: number | null;
      candidateSoftLimit?: number | null;
    } = {},
  ): void => {
    profiling.exactCandidateJoinLastAbortReason = reason;
    profiling.exactCandidateJoinLastAbortSlotIndex = diagnostics.slotIndex ?? null;
    profiling.exactCandidateJoinLastAbortCandidateSoftLimit = diagnostics.candidateSoftLimit ?? candidateSoftLimit;
    profiling.exactCandidateJoinLastAbortNodeSoftLimit = nodeSoftLimit;
    profiling.exactCandidateJoinLastAbortCandidateCount = diagnostics.candidateCount ?? null;
    profiling.exactCandidateJoinLastAbortCutoff = normalizeDiagnosticNumber(diagnostics.cutoff);
    profiling.exactCandidateJoinLastAbortPeekUpperBound = normalizeDiagnosticNumber(diagnostics.peekUpperBound);
    profiling.exactCandidateJoinLastAbortOtherUpper = normalizeDiagnosticNumber(diagnostics.otherUpper);
    profiling.exactCandidateJoinLastAbortObservedUpperBound = normalizeDiagnosticNumber(
      diagnostics.observedUpperBound,
    );
    profiling.exactCandidateJoinLastAbortRemainingMs = Number.isFinite(deadlineAt)
      ? Math.max(0, Math.round(deadlineAt - performance.now()))
      : null;
  };
  resetAbortDiagnostics();
  const incumbentScore = getMedleyPruningThreshold(results, resultLimit);
  if (resultLimit !== 1 || slots.length !== MEDLEY_TEAM_COUNT || !Number.isFinite(incumbentScore)) {
    profiling.exactCandidateJoinAbortCount += 1;
    recordAbortDiagnostics("invalid-input");
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
  let effectiveCandidateSoftLimit = candidateSoftLimit;
  let didGuardedCandidateExtension = false;
  let stagedCandidateExtensionSlotIndex: number | null = null;
  const calculatedCardCount = context.calculatedCardCount ?? Number.POSITIVE_INFINITY;
  const enableExperimentalStagedCandidateExtension = context.enableExperimentalStagedCandidateExtension === true;
  const getGuardedExtensionRemainingMs = (): number => (
    Number.isFinite(deadlineAt) ? deadlineAt - performance.now() : Number.POSITIVE_INFINITY
  );
  const canUseCandidateSoftLimitExtension = (remainingMs: number): boolean => (
    candidateSoftLimit === MEDLEY_EXACT_CANDIDATE_JOIN_GUARDED_EXTENSION_BASE_SOFT_LIMIT
    && calculatedCardCount <= MEDLEY_EXACT_CANDIDATE_JOIN_GUARDED_EXTENSION_MAX_CARD_COUNT
    && !stats.memoryLimited
    && remainingMs >= MEDLEY_EXACT_CANDIDATE_JOIN_GUARDED_EXTENSION_MIN_REMAINING_MS
  );
  const shouldContinueUnprovedExactJoin = (): boolean => {
    const observedUpperBound = getObservedExactCandidateJoinUpperBound();
    return observedUpperBound === null || observedUpperBound > incumbentScore;
  };
  const recordStagedCandidateExtension = (
    slotIndex: number,
    limit: number,
    peekCutoffGap: number,
    remainingMs: number,
  ): void => {
    const candidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
    profiling.exactCandidateJoinStagedCandidateExtensionCount += 1;
    profiling.exactCandidateJoinLastStagedExtensionSlotIndex = slotIndex;
    profiling.exactCandidateJoinLastStagedExtensionLimit = limit;
    profiling.exactCandidateJoinLastStagedExtensionPeekCutoffGap = Number.isFinite(peekCutoffGap)
      ? Math.max(0, Math.round(peekCutoffGap))
      : null;
    profiling.exactCandidateJoinLastStagedExtensionCandidateCountsBySlot = candidateCountsBySlot;
    profiling.exactCandidateJoinLastStagedExtensionOtherSlotCandidateCounts = candidateCountsBySlot.filter(
      (_, index) => index !== slotIndex,
    );
    profiling.exactCandidateJoinLastStagedExtensionRemainingMs = Number.isFinite(remainingMs)
      ? Math.max(0, Math.round(remainingMs))
      : null;
    profiling.exactCandidateJoinLastStagedExtensionPeakHeapMiB = stats.peakUsedHeapMiB;
  };
  const maybeExtendCandidateSoftLimit = (
    slotIndex: number,
    cutoff: number,
    peekUpperBound: number,
  ): boolean => {
    const remainingMs = getGuardedExtensionRemainingMs();
    if (
      !didGuardedCandidateExtension
      && effectiveCandidateSoftLimit < MEDLEY_EXACT_CANDIDATE_JOIN_GUARDED_CANDIDATE_SOFT_LIMIT
    ) {
      if (
        candidateSoftLimit >= MEDLEY_EXACT_CANDIDATE_JOIN_GUARDED_CANDIDATE_SOFT_LIMIT
        || !canUseCandidateSoftLimitExtension(remainingMs)
        || !shouldContinueUnprovedExactJoin()
      ) {
        return false;
      }
      didGuardedCandidateExtension = true;
      effectiveCandidateSoftLimit = MEDLEY_EXACT_CANDIDATE_JOIN_GUARDED_CANDIDATE_SOFT_LIMIT;
      profiling.exactCandidateJoinGuardedCandidateExtensionCount += 1;
      profiling.exactCandidateJoinLastGuardedExtensionSlotIndex = slotIndex;
      profiling.exactCandidateJoinLastGuardedExtensionLimit = effectiveCandidateSoftLimit;
      profiling.exactCandidateJoinLastGuardedExtensionRemainingMs = Number.isFinite(remainingMs)
        ? Math.max(0, Math.round(remainingMs))
        : null;
      profiling.exactCandidateJoinLastGuardedExtensionPeakHeapMiB = stats.peakUsedHeapMiB;
      profiling.exactCandidateJoinLastGuardedExtensionObservedUpperBound = getObservedExactCandidateJoinUpperBound();
      return true;
    }

    if (!enableExperimentalStagedCandidateExtension) {
      return false;
    }
    const nextStagedLimit = MEDLEY_EXACT_CANDIDATE_JOIN_STAGED_CANDIDATE_SOFT_LIMITS.find(
      (limit) => limit > effectiveCandidateSoftLimit,
    );
    if (nextStagedLimit === undefined) {
      return false;
    }
    if (
      !didGuardedCandidateExtension
      || profiling.exactCandidateJoinLastGuardedExtensionSlotIndex !== slotIndex
      || !canUseCandidateSoftLimitExtension(remainingMs)
      || remainingMs < MEDLEY_EXACT_CANDIDATE_JOIN_STAGED_EXTENSION_MIN_REMAINING_MS
      || !shouldContinueUnprovedExactJoin()
    ) {
      return false;
    }
    if (
      stagedCandidateExtensionSlotIndex !== null
      && stagedCandidateExtensionSlotIndex !== slotIndex
    ) {
      return false;
    }
    const otherSlotCandidateCounts = candidatesBySlot
      .map((candidates, index) => (index === slotIndex ? 0 : candidates.length))
      .filter((count) => count > 0);
    if (
      otherSlotCandidateCounts.length !== slots.length - 1
      || otherSlotCandidateCounts.some(
        (count) => count > MEDLEY_EXACT_CANDIDATE_JOIN_STAGED_EXTENSION_MAX_OTHER_SLOT_CANDIDATES,
      )
    ) {
      return false;
    }
    const peekCutoffGap = peekUpperBound - cutoff;
    if (
      !Number.isFinite(peekCutoffGap)
      || peekCutoffGap < 0
      || peekCutoffGap > MEDLEY_EXACT_CANDIDATE_JOIN_STAGED_EXTENSION_MAX_PEEK_CUTOFF_GAP
    ) {
      return false;
    }

    stagedCandidateExtensionSlotIndex = slotIndex;
    effectiveCandidateSoftLimit = nextStagedLimit;
    recordStagedCandidateExtension(slotIndex, effectiveCandidateSoftLimit, peekCutoffGap, remainingMs);
    return true;
  };

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
      recordAbortDiagnostics("initial-candidate", {
        slotIndex,
        candidateCount: candidatesBySlot[slotIndex]?.length ?? 0,
        peekUpperBound: generators[slotIndex].peekUpperBound(),
      });
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
      recordAbortDiagnostics("pair-upper", {
        slotIndex: excludedSlotIndex,
        candidateCount: candidatesBySlot.reduce((max, candidates) => Math.max(max, candidates.length), 0),
        cutoff: rootPrunePairTarget,
        observedUpperBound: getObservedExactCandidateJoinUpperBound(),
      });
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
        recordAbortDiagnostics("deep-pair-upper", {
          slotIndex: deepPairExcludedSlotIndex,
          candidateCount: candidatesBySlot.reduce((max, candidates) => Math.max(max, candidates.length), 0),
          cutoff: targetUnseenUpperBound,
          observedUpperBound: getObservedExactCandidateJoinUpperBound(),
        });
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
      recordAbortDiagnostics("high-budget-pair-upper", {
        slotIndex: 0,
        candidateCount: candidatesBySlot.reduce((max, candidates) => Math.max(max, candidates.length), 0),
        observedUpperBound: getObservedExactCandidateJoinUpperBound(),
      });
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
      recordAbortDiagnostics("anchored-join-timeout", {
        candidateCount: candidatesBySlot.reduce((max, candidates) => Math.max(max, candidates.length), 0),
        observedUpperBound: getObservedExactCandidateJoinUpperBound(),
      });
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
      recordAbortDiagnostics("candidate-fill-pair-refine", {
        slotIndex,
        candidateCount: candidatesBySlot[slotIndex]?.length ?? null,
        observedUpperBound: getObservedExactCandidateJoinUpperBound(),
      });
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
      if (performance.now() >= deadlineAt || isPastDeadline()) {
        profiling.exactCandidateJoinCandidateFillElapsedMs += performance.now() - candidateFillStartedAt;
        profiling.exactCandidateJoinLastCandidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
        profiling.exactCandidateJoinLastCandidateFillElapsedMsBySlot[slotIndex] = (
          performance.now() - slotFillStartedAt
        );
        stats.isExhaustive = false;
        stats.timedOut = true;
        stats.searchMode = "bounded";
        profiling.exactCandidateJoinAbortCount += 1;
        recordAbortDiagnostics(stats.memoryLimited ? "memory-soft-limit" : "candidate-fill-deadline", {
          slotIndex,
          candidateCount: candidatesBySlot[slotIndex].length,
          cutoff,
          peekUpperBound: generator.peekUpperBound(),
          otherUpper,
          observedUpperBound: getObservedExactCandidateJoinUpperBound(),
          candidateSoftLimit: effectiveCandidateSoftLimit,
        });
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
      if (candidatesBySlot[slotIndex].length >= effectiveCandidateSoftLimit) {
        if (maybeExtendCandidateSoftLimit(slotIndex, cutoff, generator.peekUpperBound())) {
          continue;
        }
        profiling.exactCandidateJoinCandidateFillElapsedMs += performance.now() - candidateFillStartedAt;
        profiling.exactCandidateJoinLastCandidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
        profiling.exactCandidateJoinLastCandidateFillElapsedMsBySlot[slotIndex] = (
          performance.now() - slotFillStartedAt
        );
        profiling.exactCandidateJoinAbortCount += 1;
        recordAbortDiagnostics("candidate-fill-soft-limit", {
          slotIndex,
          candidateCount: candidatesBySlot[slotIndex].length,
          cutoff,
          peekUpperBound: generator.peekUpperBound(),
          otherUpper,
          observedUpperBound: getObservedExactCandidateJoinUpperBound(),
          candidateSoftLimit: effectiveCandidateSoftLimit,
        });
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

      const candidate = generator.next(cutoff, globalPruning);
      if (stats.timedOut || generator.hasAborted()) {
        profiling.exactCandidateJoinCandidateFillElapsedMs += performance.now() - candidateFillStartedAt;
        profiling.exactCandidateJoinLastCandidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
        profiling.exactCandidateJoinLastCandidateFillElapsedMsBySlot[slotIndex] = (
          performance.now() - slotFillStartedAt
        );
        profiling.exactCandidateJoinAbortCount += 1;
        recordAbortDiagnostics("candidate-fill-generator-aborted", {
          slotIndex,
          candidateCount: candidatesBySlot[slotIndex].length,
          cutoff,
          peekUpperBound: generator.peekUpperBound(),
          otherUpper,
          observedUpperBound: getObservedExactCandidateJoinUpperBound(),
          candidateSoftLimit: effectiveCandidateSoftLimit,
        });
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
  const solveCandidateCounts = candidatesBySlot.map((candidates) => candidates.length).sort((left, right) => left - right);
  const observedUpperBoundBeforeSolve = getObservedExactCandidateJoinUpperBound();
  const solveUpperGap = observedUpperBoundBeforeSolve !== null
    ? observedUpperBoundBeforeSolve - incumbentScore
    : null;
  const remainingBeforeSolveMs = Number.isFinite(deadlineAt)
    ? deadlineAt - performance.now()
    : Number.POSITIVE_INFINITY;
  const canUseSmallGapSolveRetry = (
    solveCandidateCounts[0] > MEDLEY_EXACT_CANDIDATE_JOIN_SOLVE_MAX_SMALLEST_CANDIDATES
    && context.enableSmallGapSolveRetry === true
    && calculatedCardCount <= MEDLEY_EXACT_CANDIDATE_JOIN_SMALL_GAP_SOLVE_RETRY_MAX_CARD_COUNT
    && !stats.memoryLimited
    && remainingBeforeSolveMs >= MEDLEY_EXACT_CANDIDATE_JOIN_SMALL_GAP_SOLVE_RETRY_MIN_REMAINING_MS
    && solveUpperGap !== null
    && Number.isFinite(solveUpperGap)
    && solveUpperGap >= 0
    && solveUpperGap <= MEDLEY_EXACT_CANDIDATE_JOIN_SMALL_GAP_SOLVE_RETRY_MAX_UPPER_GAP
    && solveCandidateCounts[0] <= MEDLEY_EXACT_CANDIDATE_JOIN_SMALL_GAP_SOLVE_RETRY_MAX_SMALLEST_CANDIDATES
  );
  if (
    solveCandidateCounts[0] > MEDLEY_EXACT_CANDIDATE_JOIN_SOLVE_MAX_SMALLEST_CANDIDATES
    && !canUseSmallGapSolveRetry
  ) {
    profiling.exactCandidateJoinAbortCount += 1;
    recordAbortDiagnostics("solve-workload-limit", {
      candidateCount: solveCandidateCounts[2] ?? solveCandidateCounts[0],
      observedUpperBound: observedUpperBoundBeforeSolve,
    });
    return buildUnprovedExactCandidateJoinResult();
  }
  let solveDeadlineAt = deadlineAt;
  let didUseSmallGapSolveRetry = false;
  if (canUseSmallGapSolveRetry) {
    didUseSmallGapSolveRetry = true;
    solveDeadlineAt = Math.min(
      deadlineAt,
      performance.now() + MEDLEY_EXACT_CANDIDATE_JOIN_SMALL_GAP_SOLVE_RETRY_TIMEBOX_MS,
    );
    profiling.exactCandidateJoinSmallGapSolveRetryCount += 1;
    profiling.exactCandidateJoinLastSmallGapSolveRetryCandidateLimit = (
      MEDLEY_EXACT_CANDIDATE_JOIN_SMALL_GAP_SOLVE_RETRY_MAX_SMALLEST_CANDIDATES
    );
    profiling.exactCandidateJoinLastSmallGapSolveRetryCandidateCountsBySlot = [...solveCandidateCounts];
    profiling.exactCandidateJoinLastSmallGapSolveRetryUpperGap = solveUpperGap !== null
      ? Math.max(0, Math.round(solveUpperGap))
      : null;
    profiling.exactCandidateJoinLastSmallGapSolveRetryRemainingMs = Number.isFinite(remainingBeforeSolveMs)
      ? Math.max(0, Math.round(remainingBeforeSolveMs))
      : null;
    profiling.exactCandidateJoinLastSmallGapSolveRetryTimeboxMs = (
      MEDLEY_EXACT_CANDIDATE_JOIN_SMALL_GAP_SOLVE_RETRY_TIMEBOX_MS
    );
    profiling.exactCandidateJoinLastSmallGapSolveRetryPeakHeapMiB = stats.peakUsedHeapMiB;
  }
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
    didUseSmallGapSolveRetry ? solveDeadlineAt : null,
  );
  profiling.exactCandidateJoinSolveElapsedMs += performance.now() - solveStartedAt;
  if (joinResult.timedOut) {
    profiling.exactCandidateJoinAbortCount += 1;
    if (joinResult.localTimedOut) {
      profiling.exactCandidateJoinSmallGapSolveRetryTimeboxCount += 1;
    }
    recordAbortDiagnostics(joinResult.localTimedOut ? "small-gap-solve-timebox" : "solve-timeout", {
      candidateCount: candidatesBySlot.reduce((max, candidates) => Math.max(max, candidates.length), 0),
      observedUpperBound: getObservedExactCandidateJoinUpperBound(),
    });
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
