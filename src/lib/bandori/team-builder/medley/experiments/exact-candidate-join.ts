/*
 * Exact candidate-join proof path for hard medley configurations.
 *
 * This module generates score-ordered slot candidate prefixes, proves unseen frontiers, and
 * searches card-disjoint triples. It may be auto-enabled for large locked/all scopes, but an
 * abort, timeout, or unclosed frontier must leave the configuration bounded.
 */

import {
  compareMedleyResultLike,
  evaluateMedleySlotCandidateWithCache,
  releaseMedleyScoreOnlyTeamEvaluationCache,
  sortMedleyCandidates,
} from "../candidates";
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
import { proveMedleyScoreOnlyPairUpperByConflictBnb } from "./conflict-bnb";
import {
  MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_ANCHOR_CANDIDATES,
  MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_CARD_COUNT,
  MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_FRONTIER_GAP,
  MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_HIGH_PAIR_RECORDS,
  MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_OTHER_SLOT_CANDIDATES,
  MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_OTHER_SLOT_CANDIDATE_TOTAL,
  MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MIN_REMAINING_MS,
  MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_TIMEBOX_MS,
  MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_CHEAP_UPPER_MAX_ANCHORS,
  MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_CHEAP_UPPER_REFINE_TOP_ANCHORS,
  MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_CHEAP_UPPER_SPLIT_STATE_BUDGET,
  MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_CHEAP_UPPER_TIMEBOX_MS,
  MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_CHEAP_UPPER_UNSEEN_REFINE_MAX_GENERATED,
  MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_IMPROVEMENT_PROBE_MAX_ANCHORS,
  MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_IMPROVEMENT_PROBE_TIMEBOX_MS,
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
  buildMedleyCardBoundPowerUpperBySlot,
  buildMedleyCapacityCardsByCharacter,
  estimateMedleyCapacityAssignmentScoreUpperBound,
  estimateMedleyCapacityCardBoundLagrangianScoreUpperBound,
  estimateMedleyCapacityCardBoundSharedPowerSkillScoreUpperBound,
  estimateMedleyFastTwoSlotSharedPowerDualScoreUpperBound,
  estimateMedleyFastTwoSlotSharedPowerDualScoreUpperBoundForParameters,
  estimateMedleyRemainingScoreUpperBound,
  estimateMedleySlotSkillCoefficient,
} from "../upper/capacity";
import {
  estimateMedleySlotBranchScoreUpperBound,
} from "../upper/skill-context";
import {
  buildCharacterUpperBoundIndex,
  CHARACTER_MASK_SEGMENT_BITS,
  evaluateMedleyScoreOnlyTeam,
  evaluateMedleyScoreOnlyTeamScore,
  estimateSearchScopeScoreUpperBound,
  hasCharacterIndexInMask,
} from "@/lib/bandori/team-builder/core";
import { getCardInstanceKeys } from "@/lib/bandori/team-builder/core/card-identity";
import { groupSearchCardsByCharacter } from "@/lib/bandori/team-builder/core/cards";
import type {
  BandoriMedleyTeamSearchProfilingStats,
  BandoriMedleyTeamSearchResult,
  BandoriMedleyTeamSearchStats,
  MedleyEvaluatedResultObserver,
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

const MEDLEY_EXACT_JOIN_PREFIX_SEED_MIN_REMAINING_MS = 500;
const MEDLEY_EXACT_JOIN_PREFIX_SEED_MIN_PROOF_BUDGET_MS = 30_000;
const MEDLEY_EXACT_JOIN_PREFIX_SEED_MIN_MEMORY_HEADROOM_MIB = 256;
const MEDLEY_EXACT_JOIN_PREFIX_SEED_MAX_OBSERVED_GAP = 100_000;
const BYTES_PER_MIB = 1024 * 1024;

function roundMiB(bytes: number): number {
  return Math.round((bytes / BYTES_PER_MIB) * 100) / 100;
}

function sampleNodeMemoryMiB(): { usedMiB: number | null; heapMiB: number | null; rssMiB: number | null } {
  const nodeProcess = (globalThis as {
    process?: {
      memoryUsage?: () => { heapUsed?: number; rss?: number };
    };
  }).process;
  const memoryUsage = nodeProcess?.memoryUsage?.();
  const heapMiB = typeof memoryUsage?.heapUsed === "number" && Number.isFinite(memoryUsage.heapUsed)
    ? Math.ceil(memoryUsage.heapUsed / BYTES_PER_MIB)
    : null;
  const rssMiB = typeof memoryUsage?.rss === "number" && Number.isFinite(memoryUsage.rss)
    ? Math.ceil(memoryUsage.rss / BYTES_PER_MIB)
    : null;
  return {
    usedMiB: heapMiB !== null || rssMiB !== null ? Math.max(heapMiB ?? 0, rssMiB ?? 0) : null,
    heapMiB,
    rssMiB,
  };
}

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

function clearMedleyExactSlotScoreCalculationCache(slot: MedleySlotSearch): void {
  slot.scoreCache.judgeLists?.clear();
  slot.scoreCache.innerScoreRates?.clear();
  slot.scoreCache.baseScoresByChart = new WeakMap();
  slot.scoreCache.noFloorBaseScoreRates?.clear();
  slot.scoreCache.skillMultiplierLists.clear();
  slot.scoreCache.noFloorSkillRates.clear();
  slot.scoreCache.skillWindowContributionsByChart = new WeakMap();
  slot.scoreCache.resolvedSkills?.clear();
}

function canOmitDefaultMedleyCandidateInstanceKeys(cards: readonly SearchCard[]): boolean {
  const seenCardIds = new Set<number>();
  for (const card of cards) {
    if (card.cardInstanceKey !== undefined || seenCardIds.has(card.cardId)) {
      return false;
    }
    seenCardIds.add(card.cardId);
  }
  return true;
}

function createMedleyScoreOnlyCandidate(
  slot: MedleySlotSearch,
  selectedCards: SearchCard[],
  server: number,
  perfectRate: number,
  pruningThresholdResult: BandoriTeamSearchResult | undefined,
  includeCardInstanceKeys = true,
): MedleyTeamCandidate | null {
  const result = evaluateMedleyScoreOnlyTeam({
    cards: selectedCards,
    input: slot.input,
    chart: slot.chart,
    configuration: slot.configuration,
    server,
    perfectRate,
    scoreCache: slot.scoreCache,
    comboOptions: slot.comboOptions,
    pruningThresholdResult,
  });
  if (!result) {
    return null;
  }
  const candidate: MedleyTeamCandidate = {
    result,
    cards: [...selectedCards],
    cardIds: selectedCards.map((card) => card.cardId),
  };
  if (includeCardInstanceKeys) {
    candidate.cardInstanceKeys = getCardInstanceKeys(selectedCards);
  }
  return candidate;
}

function isMedleyCandidatePreferred(
  candidate: MedleyTeamCandidate,
  incumbent: MedleyTeamCandidate | null,
): boolean {
  if (!incumbent) {
    return true;
  }
  const sorted = [incumbent, candidate];
  sortMedleyCandidates(sorted);
  return sorted[0] === candidate;
}

function findBestMedleyExactSlotCandidateLowMemory(
  slot: MedleySlotSearch,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  isPastDeadline: () => boolean,
  deadlineAt: number,
  nodeSoftLimit: number,
  localDeadlineAt: number | null = null,
  shouldAbortLocalSearch: (() => boolean) | null = null,
  scoreCacheClearInterval: number | null = null,
  useSkillContextUpper = true,
  returnCandidate = false,
): {
  aborted: boolean;
  abortReason: string | null;
  visitedNodeCount: number;
  evaluatedTeamCount: number;
  score: number | null;
  candidate: MedleyTeamCandidate | null;
} {
  const startMemory = sampleNodeMemoryMiB();
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateStartUsedMiB = startMemory.usedMiB;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateStartNodeHeapMiB = startMemory.heapMiB;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateStartRssMiB = startMemory.rssMiB;
  const groupedSearchCards = groupSearchCardsByCharacter(slot.searchCards);
  const searchSlot = groupedSearchCards.every((card, index) => card === slot.searchCards[index])
    ? slot
    : (() => {
      const upperBoundIndex = buildCharacterUpperBoundIndex(groupedSearchCards);
      return {
        ...slot,
        searchCards: groupedSearchCards,
        upperBoundIndex,
        rootScoreUpperBound: estimateSearchScopeScoreUpperBound(
          [],
          upperBoundIndex,
          groupedSearchCards,
          0,
          0,
          0,
          slot.baseScoreRatePerPower,
        ),
      };
    })();
  const bannedCardIds = new Set<number>();
  const selectedCards: SearchCard[] = [];
  const includeCardInstanceKeys = !canOmitDefaultMedleyCandidateInstanceKeys(searchSlot.searchCards);
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestCandidate: MedleyTeamCandidate | null = null;
  let visitedNodeCount = 0;
  let evaluatedTeamCount = 0;
  let evaluatedSinceScoreCacheClear = 0;
  let aborted = false;
  let abortReason: string | null = null;
  const effectiveScoreCacheClearInterval = (
    scoreCacheClearInterval !== null
    && Number.isFinite(scoreCacheClearInterval)
  )
    ? Math.max(1, Math.trunc(scoreCacheClearInterval))
    : null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateScoreCacheClearInterval = (
    effectiveScoreCacheClearInterval
  );
  const maybeClearScoreCache = (): void => {
    if (effectiveScoreCacheClearInterval === null) {
      return;
    }
    if (evaluatedSinceScoreCacheClear < effectiveScoreCacheClearInterval) {
      return;
    }
    clearMedleyExactSlotScoreCalculationCache(searchSlot);
    evaluatedSinceScoreCacheClear = 0;
    profiling.exactCandidateJoinLowMemoryInitialCandidateScoreCacheClearCount += 1;
  };
  const recordBestLowMemoryTeam = (score: number): void => {
    profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestScore = score;
    profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestCardIds = selectedCards.map((card) => card.cardId);
    profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestCardInstanceKeys = getCardInstanceKeys(selectedCards);
    profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestSkillIds = selectedCards.map((card) => card.skillId);
    profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestPowers = selectedCards.map((card) => card.effectivePower);
  };
  const beforeVisitMemory = sampleNodeMemoryMiB();
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitUsedMiB = beforeVisitMemory.usedMiB;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitNodeHeapMiB = beforeVisitMemory.heapMiB;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitRssMiB = beforeVisitMemory.rssMiB;

  const visit = (
    startIndex: number,
    usedCharacterMaskLow: number,
    usedCharacterMaskHigh: number,
    selectedPower: number,
  ): void => {
    if (aborted || stats.timedOut) {
      return;
    }
    visitedNodeCount += 1;
    if (visitedNodeCount >= nodeSoftLimit) {
      aborted = true;
      abortReason = "node-soft-limit";
      return;
    }
    if ((visitedNodeCount & 511) === 0) {
      const now = performance.now();
      if (localDeadlineAt !== null && now >= localDeadlineAt) {
        aborted = true;
        abortReason = "local-deadline";
        return;
      }
      if (shouldAbortLocalSearch?.()) {
        aborted = true;
        abortReason = "local-abort";
        return;
      }
      if (now >= deadlineAt || isPastDeadline()) {
        stats.isExhaustive = false;
        stats.timedOut = true;
        stats.searchMode = "bounded";
        abortReason = "global-deadline";
        return;
      }
    }

    const remaining = MEDLEY_TEAM_SIZE - selectedCards.length;
    if (searchSlot.searchCards.length - startIndex < remaining) {
      return;
    }
    const scoreCutoff = bestScore;
    const upperBound = estimateMedleyExactSlotNodeUpperBound(
      searchSlot,
      selectedCards,
      startIndex,
      bannedCardIds,
      usedCharacterMaskLow,
      usedCharacterMaskHigh,
      selectedPower,
      profiling,
      scoreCutoff,
      useSkillContextUpper,
    );
    if (!Number.isFinite(upperBound) || upperBound < scoreCutoff) {
      return;
    }

    if (selectedCards.length === MEDLEY_TEAM_SIZE) {
      stats.enumeratedTeamCount += 1;
      profiling.teamEvaluationCacheMissCount += 1;
      evaluatedTeamCount += 1;
      const beforeEvaluationMemory = sampleNodeMemoryMiB();
      profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeUsedMiB = (
        beforeEvaluationMemory.usedMiB
      );
      profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeNodeHeapMiB = (
        beforeEvaluationMemory.heapMiB
      );
      profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeRssMiB = (
        beforeEvaluationMemory.rssMiB
      );
      const score = evaluateMedleyScoreOnlyTeamScore({
        cards: selectedCards,
        input: searchSlot.input,
        chart: searchSlot.chart,
        configuration: searchSlot.configuration,
        server,
        perfectRate,
        scoreCache: searchSlot.scoreCache,
        comboOptions: searchSlot.comboOptions,
        pruningThresholdResult: createMedleyExactCandidateSlotThresholdResult(scoreCutoff),
      });
      const afterEvaluationMemory = sampleNodeMemoryMiB();
      profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterUsedMiB = (
        afterEvaluationMemory.usedMiB
      );
      profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterNodeHeapMiB = (
        afterEvaluationMemory.heapMiB
      );
      profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterRssMiB = (
        afterEvaluationMemory.rssMiB
      );
      stats.evaluatedTeamCount += 1;
      evaluatedSinceScoreCacheClear += 1;
      maybeClearScoreCache();
      if (score === null || score < scoreCutoff) {
        return;
      }
      if (returnCandidate) {
        const candidate = createMedleyScoreOnlyCandidate(
          searchSlot,
          selectedCards,
          server,
          perfectRate,
          createMedleyExactCandidateSlotThresholdResult(scoreCutoff),
          includeCardInstanceKeys,
        );
        if (!candidate) {
          return;
        }
        if (score > bestScore || isMedleyCandidatePreferred(candidate, bestCandidate)) {
          bestScore = score;
          bestCandidate = candidate;
          recordBestLowMemoryTeam(score);
        }
        return;
      }
      bestScore = score;
      recordBestLowMemoryTeam(score);
      return;
    }

    for (let index = startIndex; index <= searchSlot.searchCards.length - remaining; index += 1) {
      const card = searchSlot.searchCards[index];
      const characterIndex = searchSlot.upperBoundIndex.characterIndexById.get(card.characterId);
      if (
        characterIndex === undefined
        || hasCharacterIndexInMask(usedCharacterMaskLow, usedCharacterMaskHigh, characterIndex)
      ) {
        continue;
      }
      const isLowCharacterMask = characterIndex < CHARACTER_MASK_SEGMENT_BITS;
      const characterBit = isLowCharacterMask
        ? 1 << characterIndex
        : 1 << (characterIndex - CHARACTER_MASK_SEGMENT_BITS);
      selectedCards.push(card);
      visit(
        index + 1,
        isLowCharacterMask ? usedCharacterMaskLow | characterBit : usedCharacterMaskLow,
        isLowCharacterMask ? usedCharacterMaskHigh : usedCharacterMaskHigh | characterBit,
        selectedPower + card.effectivePower,
      );
      selectedCards.pop();
      if (aborted || stats.timedOut) {
        return;
      }
    }
  };

  visit(0, 0, 0, 0);
  return {
    aborted,
    abortReason,
    visitedNodeCount,
    evaluatedTeamCount,
    score: Number.isFinite(bestScore) ? bestScore : null,
    candidate: !aborted && !stats.timedOut && returnCandidate ? bestCandidate : null,
  };
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
  useSkillContextUpper = true,
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
  if (!useSkillContextUpper) {
    return contextBranchScoreUpperBound;
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
  lowMemoryHighPairScanMinRecordCount: number | null = null,
  lowMemoryHighPairPrefixRecordLimit: number | null = null,
  lowMemoryHighPairRecordScan = false,
  scoreCacheClearInterval: number | null = null,
): MedleyExactSlotCandidateGenerator {
  // The generator is ordered by optimistic slot upper bound. Exhaustion proves that no unseen
  // slot candidate remains above the active cutoff; budget/deadline aborts are reported to the
  // caller so exact status is not inferred from a truncated prefix.
  const heap: MedleyExactSlotCandidateSearchNode[] = [];
  const slotUpperHeap: MedleyExactSlotUpperHeapNode[] = [];
  const bannedCardIds = new Set<number>();
  const globalComplementUpperCache = new Map<string, number>();
  const globalPairComplementUpperCache = new Map<string, number>();
  const pairUpperQueryCache = new Map<string, MedleyExactCandidatePairUpperQuery>();
  const includeCardInstanceKeys = !canOmitDefaultMedleyCandidateInstanceKeys(slot.searchCards);
  const effectiveScoreCacheClearInterval = (
    scoreCacheClearInterval !== null
    && Number.isFinite(scoreCacheClearInterval)
  )
    ? Math.max(1, Math.trunc(scoreCacheClearInterval))
    : null;
  let evaluatedSinceScoreCacheClear = 0;
  let aborted = false;
  let poppedNodes = 0;
  let heapKeyMode: "slot" | "global" = "slot";
  let heapGlobalKeySignature: string | null = null;
  let heapGlobalScoreCutoff: number | null = null;
  let maxPruningScoreCutoff = Number.NEGATIVE_INFINITY;
  type CreateSearchNodeInput = {
    key: number;
    slotUpperBound: number;
    selectedCards: SearchCard[];
    startIndex: number;
    usedCharacterMaskLow: number;
    usedCharacterMaskHigh: number;
    selectedPower: number;
    candidate: MedleyTeamCandidate | null;
  };
  const createSearchNode = (input: CreateSearchNodeInput): MedleyExactSlotCandidateSearchNode => ({
    key: input.key,
    slotUpperBound: input.slotUpperBound,
    selectedCardCount: input.selectedCards.length,
    selectedCard0: input.selectedCards[0],
    selectedCard1: input.selectedCards[1],
    selectedCard2: input.selectedCards[2],
    selectedCard3: input.selectedCards[3],
    selectedCard4: input.selectedCards[4],
    startIndex: input.startIndex,
    usedCharacterMaskLow: input.usedCharacterMaskLow,
    usedCharacterMaskHigh: input.usedCharacterMaskHigh,
    selectedPower: input.selectedPower,
    candidate: input.candidate,
  });
  const getSelectedCardsForNode = (node: MedleyExactSlotCandidateSearchNode): SearchCard[] => {
    switch (node.selectedCardCount) {
      case 0:
        return [];
      case 1:
        return [node.selectedCard0!];
      case 2:
        return [node.selectedCard0!, node.selectedCard1!];
      case 3:
        return [node.selectedCard0!, node.selectedCard1!, node.selectedCard2!];
      case 4:
        return [node.selectedCard0!, node.selectedCard1!, node.selectedCard2!, node.selectedCard3!];
      default:
        return [node.selectedCard0!, node.selectedCard1!, node.selectedCard2!, node.selectedCard3!, node.selectedCard4!];
    }
  };
  const pushHeapNode = (node: MedleyExactSlotCandidateSearchNode): void => {
    pushMedleyExactSlotNode(heap, node);
    if (heapKeyMode === "global") {
      node.activeInSlotUpperHeap = true;
      pushMedleyExactSlotUpperNode(slotUpperHeap, { key: node.slotUpperBound, node });
    }
  };
  const peekMaxHeapSlotUpperBound = (): number => {
    while (slotUpperHeap.length > 0 && slotUpperHeap[0].node.activeInSlotUpperHeap !== true) {
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
    pushHeapNode(createSearchNode({
      key: rootUpperBound,
      slotUpperBound: rootUpperBound,
      selectedCards: [],
      startIndex: 0,
      usedCharacterMaskLow: 0,
      usedCharacterMaskHigh: 0,
      selectedPower: 0,
      candidate: null,
    }));
  }
  profiling.exactCandidateJoinLastScoreCacheClearInterval = effectiveScoreCacheClearInterval;
  const maybeClearScoreCache = (): void => {
    if (effectiveScoreCacheClearInterval === null) {
      return;
    }
    if (evaluatedSinceScoreCacheClear < effectiveScoreCacheClearInterval) {
      return;
    }
    clearMedleyExactSlotScoreCalculationCache(slot);
    evaluatedSinceScoreCacheClear = 0;
    profiling.exactCandidateJoinScoreCacheClearCount += 1;
  };

  const tryBeginCapacityComplementUpper = (
    globalPruning: MedleyExactSlotCandidateGlobalPruning,
  ): boolean => {
    const budget = globalPruning.capacityComplementBudget;
    if (!budget) {
      profiling.exactCandidateJoinGlobalCapacityTailUpperCallCount += 1;
      return true;
    }
    if (budget.exhausted) {
      return false;
    }
    if (budget.maxCalls !== null && budget.callCount >= budget.maxCalls) {
      budget.exhausted = true;
      return false;
    }
    if (budget.timeboxMs !== null && performance.now() - budget.startedAt >= budget.timeboxMs) {
      budget.exhausted = true;
      budget.timeboxCount += 1;
      profiling.exactCandidateJoinGlobalCapacityTailUpperTimeboxCount += 1;
      return false;
    }
    budget.callCount += 1;
    profiling.exactCandidateJoinGlobalCapacityTailUpperCallCount += 1;
    return true;
  };

  const hasCapacityComplementUpperBudget = (
    globalPruning: MedleyExactSlotCandidateGlobalPruning,
  ): boolean => {
    const budget = globalPruning.capacityComplementBudget;
    if (!budget) {
      return true;
    }
    if (budget.exhausted) {
      budget.skipCount += 1;
      profiling.exactCandidateJoinGlobalCapacityTailUpperSkipCount += 1;
      return false;
    }
    if (budget.maxCalls !== null && budget.callCount >= budget.maxCalls) {
      budget.exhausted = true;
      budget.skipCount += 1;
      profiling.exactCandidateJoinGlobalCapacityTailUpperSkipCount += 1;
      return false;
    }
    if (budget.timeboxMs !== null && performance.now() - budget.startedAt >= budget.timeboxMs) {
      budget.exhausted = true;
      budget.timeboxCount += 1;
      budget.skipCount += 1;
      profiling.exactCandidateJoinGlobalCapacityTailUpperTimeboxCount += 1;
      profiling.exactCandidateJoinGlobalCapacityTailUpperSkipCount += 1;
      return false;
    }
    return true;
  };

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
    const capacityComplementMinSelectedCardCount = (
      globalPruning.capacityComplementMinSelectedCardCount !== undefined
      && Number.isFinite(globalPruning.capacityComplementMinSelectedCardCount)
    )
      ? Math.max(0, Math.trunc(globalPruning.capacityComplementMinSelectedCardCount))
      : MEDLEY_TEAM_SIZE;
    const canUseCapacityComplement = (
      globalPruning.useCapacityComplementUpper !== false
      && selectedCardIds.length >= capacityComplementMinSelectedCardCount
      && hasCapacityComplementUpperBudget(globalPruning)
    );
    if (!canUseCapacityComplement && finitePairUnseenUpperBound >= minimumRelevantScore) {
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
      canUseCapacityComplement ? "capacity" : "pair",
      canUseCapacityComplement ? globalPruning.capacityComplementMargin ?? "" : "",
      canUseCapacityComplement ? capacityComplementMinSelectedCardCount : "",
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
      pairUpperQuery = buildMedleyExactCandidatePairUpperQuery(
        leftCandidates,
        rightCandidates,
        lowMemoryHighPairScanMinRecordCount,
        lowMemoryHighPairPrefixRecordLimit,
        lowMemoryHighPairRecordScan,
      );
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
    let effectiveComplementUpperBound = complementUpperBound;
    if (
      canUseCapacityComplement
      && (
        !Number.isFinite(effectiveComplementUpperBound)
        || effectiveComplementUpperBound - minimumRelevantScore
          <= (globalPruning.capacityComplementMargin ?? Number.POSITIVE_INFINITY)
      )
      && tryBeginCapacityComplementUpper(globalPruning)
    ) {
      const capacityComplementStartedAt = performance.now();
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
      effectiveComplementUpperBound = Math.min(effectiveComplementUpperBound, basicCapacityUpperBound);
      if (
        Number.isFinite(effectiveComplementUpperBound)
        && effectiveComplementUpperBound >= minimumRelevantScore
      ) {
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
        effectiveComplementUpperBound = Math.min(effectiveComplementUpperBound, tightCapacityUpperBound);
      }
      profiling.exactCandidateJoinGlobalCapacityTailUpperElapsedMs += (
        performance.now() - capacityComplementStartedAt
      );
    }
    globalPairComplementUpperCache.set(key, effectiveComplementUpperBound);
    return effectiveComplementUpperBound;
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
      globalPruning.useCapacityComplementUpper === false ? "pair" : "capacity",
      globalPruning.capacityComplementMargin ?? "",
      globalPruning.capacityComplementMinSelectedCardCount ?? "",
      selectedCardIds.join(","),
    ].join(":");
    let complementUpperBound = globalComplementUpperCache.get(key);
    if (complementUpperBound === undefined) {
      complementUpperBound = estimateGeneratedPairComplementUpperBound(
        selectedCardIds,
        globalPruning,
        globalPruning.scoreCutoff - slotUpperBound,
      ) ?? undefined;
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
    const selectedCardIds = getSelectedCardsForNode(node)
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
    heapGlobalScoreCutoff = globalPruning ? globalPruning.scoreCutoff : null;
    slotUpperHeap.length = 0;
    for (const node of nodes) {
      node.activeInSlotUpperHeap = false;
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
    const nodeSelectedCards = getSelectedCardsForNode(node);
    const remaining = MEDLEY_TEAM_SIZE - node.selectedCardCount;
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
      const nextSelectedCards = [...nodeSelectedCards, card];
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
        const candidateKey = (
          globalPruning?.excludedCandidateKeys
          && globalPruning.packCandidateCardsKey
        )
          ? globalPruning.packCandidateCardsKey(nextSelectedCards)
          : null;
        if (candidateKey !== null && globalPruning?.excludedCandidateKeys?.has(candidateKey)) {
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
          includeCardInstanceKeys,
          false,
        );
        evaluatedSinceScoreCacheClear += 1;
        maybeClearScoreCache();
        if (candidate && candidate.result.score >= scoreCutoff) {
          pushSearchNode(createSearchNode({
            key: candidate.result.score,
            slotUpperBound: candidate.result.score,
            selectedCards: nextSelectedCards,
            startIndex: nextStartIndex,
            usedCharacterMaskLow: nextUsedCharacterMaskLow,
            usedCharacterMaskHigh: nextUsedCharacterMaskHigh,
            selectedPower: nextSelectedPower,
            candidate,
          }), scoreCutoff, globalPruning);
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
        pushSearchNode(createSearchNode({
          key: upperBound,
          slotUpperBound: upperBound,
          selectedCards: nextSelectedCards,
          startIndex: nextStartIndex,
          usedCharacterMaskLow: nextUsedCharacterMaskLow,
          usedCharacterMaskHigh: nextUsedCharacterMaskHigh,
          selectedPower: nextSelectedPower,
          candidate: null,
        }), scoreCutoff, globalPruning);
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
      node.activeInSlotUpperHeap = false;
      if (node.candidate) {
        return node.candidate;
      }
      expandNode(node, scoreCutoff, globalPruning);
    }
    return null;
  };
  const release = (): void => {
    heap.length = 0;
    slotUpperHeap.length = 0;
    globalComplementUpperCache.clear();
    globalPairComplementUpperCache.clear();
    pairUpperQueryCache.clear();
  };

  return {
    next,
    peekUpperBound: () => (
      heapKeyMode === "slot"
        ? heap[0]?.key ?? Number.NEGATIVE_INFINITY
        : peekMaxHeapSlotUpperBound()
    ),
    peekGlobalUpperBound: () => {
      if (
        heapKeyMode !== "global"
        || heapGlobalScoreCutoff === null
        || !Number.isFinite(heapGlobalScoreCutoff)
      ) {
        return null;
      }
      const globalSlack = heap[0]?.key ?? Number.NEGATIVE_INFINITY;
      return Number.isFinite(globalSlack)
        ? heapGlobalScoreCutoff + globalSlack
        : null;
    },
    canReuseForScoreCutoff: (scoreCutoff: number) => (
      !Number.isFinite(scoreCutoff) || scoreCutoff >= maxPruningScoreCutoff
    ),
    hasAborted: () => aborted,
    poppedNodeCount: () => poppedNodes,
    release,
    memoryProfile: () => {
      let highPairRecordCount = 0;
      let highPairRecordBitsetBytes = 0;
      let rightCandidateBitsetBytes = 0;
      for (const query of pairUpperQueryCache.values()) {
        highPairRecordCount += query.highPairRecordCount ?? 0;
        if (
          query.highPairRecordBitsetWordCount !== undefined
          && query.containingHighPairRecordBitsByCardId
        ) {
          highPairRecordBitsetBytes += (
            query.highPairRecordBitsetWordCount
            * query.containingHighPairRecordBitsByCardId.size
            * Uint32Array.BYTES_PER_ELEMENT
          );
        }
        rightCandidateBitsetBytes += (
          query.rightCandidateBitsetWordCount
          * query.containingRightCandidateBitsByCardId.size
          * Uint32Array.BYTES_PER_ELEMENT
        );
      }
      return {
        heapNodeCount: heap.length,
        slotUpperHeapNodeCount: slotUpperHeap.length,
        activeHeapNodeCount: heapKeyMode === "global" ? heap.length : 0,
        globalComplementUpperCacheSize: globalComplementUpperCache.size,
        globalPairComplementUpperCacheSize: globalPairComplementUpperCache.size,
        pairUpperQueryCacheSize: pairUpperQueryCache.size,
        highPairRecordCount,
        highPairRecordBitsetMiB: roundMiB(highPairRecordBitsetBytes),
        rightCandidateBitsetMiB: roundMiB(rightCandidateBitsetBytes),
      };
    },
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
  localTimedOut?: boolean;
  leftCandidate: MedleyTeamCandidate | null;
  rightCandidate: MedleyTeamCandidate | null;
};

type MedleyExactCandidatePairRecordCache = {
  recordCount: number;
  scores: ArrayLike<number>;
  leftIndices?: ArrayLike<number>;
  rightIndices?: ArrayLike<number>;
  wordCount: number;
  containingRecordBitsByCardId?: Map<number, Uint32Array>;
  fallbackUpperScore: number | null;
};

type MedleyExactCandidatePairUpperQuery = {
  leftCandidates: MedleyTeamCandidate[];
  rightCandidates: MedleyTeamCandidate[];
  rightCandidateBitsetWordCount: number;
  containingRightCandidateBitsByCardId: Map<number, Uint32Array>;
  forbiddenRightCandidateBitsByLeftCandidate: WeakMap<MedleyTeamCandidate, Uint32Array>;
  highPairAdaptiveCacheThresholdByCoarseThreshold?: Map<number, number>;
  highPairRecordCache?: Map<number, MedleyExactCandidatePairRecordCache>;
  highPairRecordCount?: number;
  highPairRecordScores?: ArrayLike<number>;
  highPairRecordLeftIndices?: ArrayLike<number>;
  highPairRecordRightIndices?: ArrayLike<number>;
  highPairRecordThreshold?: number;
  highPairRecordBitsetWordCount?: number;
  containingHighPairRecordBitsByCardId?: Map<number, Uint32Array>;
  highPairRecordFallbackUpperScore?: number | null;
  lowMemoryHighPairScanMinRecordCount?: number;
  lowMemoryHighPairPrefixRecordLimit?: number;
  lowMemoryHighPairRecordScan?: boolean;
};

type MedleyExactCandidateSlotAvailabilityQuery = {
  candidates: MedleyTeamCandidate[];
  wordCount: number;
  containingCandidateBitsByCardId: Map<number, Uint32Array>;
  forbiddenCandidateBits: Uint32Array;
};

type MedleyExactCandidateAnchoredJoinResult = {
  proved: boolean;
  timedOut: boolean;
  result: BandoriMedleyTeamSearchResult | null;
};

type MedleyExactCandidatePairFrontierHeapNode = {
  score: number;
  leftIndex: number;
  rightIndex: number;
};

type MedleyExactCandidateAnchorFrontierProofResult = {
  proved: boolean;
  localTimedOut: boolean;
  result: BandoriMedleyTeamSearchResult | null;
  observedUpperBound: number | null;
  processedAnchorCount: number;
  residualUpperBound: number | null;
  elapsedMs: number;
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
  lowMemoryHighPairScanMinRecordCount: number | null = null,
  lowMemoryHighPairPrefixRecordLimit: number | null = null,
  lowMemoryHighPairRecordScan = false,
): MedleyExactCandidatePairUpperQuery {
  const rightCandidateBitsetWordCount = Math.ceil(rightCandidates.length / 32);
  const query: MedleyExactCandidatePairUpperQuery = {
    leftCandidates,
    rightCandidates,
    rightCandidateBitsetWordCount,
    containingRightCandidateBitsByCardId: buildMedleyExactContainingCandidateBitsByCardId(
      rightCandidates,
      rightCandidateBitsetWordCount,
    ),
    forbiddenRightCandidateBitsByLeftCandidate: new WeakMap<MedleyTeamCandidate, Uint32Array>(),
  };
  if (lowMemoryHighPairScanMinRecordCount !== null && Number.isFinite(lowMemoryHighPairScanMinRecordCount)) {
    query.lowMemoryHighPairScanMinRecordCount = Math.max(
      1,
      Math.trunc(lowMemoryHighPairScanMinRecordCount),
    );
  }
  if (lowMemoryHighPairPrefixRecordLimit !== null && Number.isFinite(lowMemoryHighPairPrefixRecordLimit)) {
    query.lowMemoryHighPairPrefixRecordLimit = Math.max(
      1,
      Math.trunc(lowMemoryHighPairPrefixRecordLimit),
    );
  }
  if (lowMemoryHighPairRecordScan) {
    query.lowMemoryHighPairRecordScan = true;
  }
  return query;
}

function buildMedleyExactCandidateSlotAvailabilityQuery(
  candidates: MedleyTeamCandidate[],
): MedleyExactCandidateSlotAvailabilityQuery {
  const wordCount = Math.ceil(candidates.length / 32);
  return {
    candidates,
    wordCount,
    containingCandidateBitsByCardId: buildMedleyExactContainingCandidateBitsByCardId(candidates, wordCount),
    forbiddenCandidateBits: new Uint32Array(wordCount),
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

function writeBannedMedleyExactCandidateBits(
  query: MedleyExactCandidateSlotAvailabilityQuery,
  bannedCardIds: readonly number[],
): Uint32Array {
  const forbiddenBits = query.forbiddenCandidateBits;
  forbiddenBits.fill(0);
  for (const cardId of bannedCardIds) {
    const containingBits = query.containingCandidateBitsByCardId.get(cardId);
    if (!containingBits) {
      continue;
    }
    for (let wordIndex = 0; wordIndex < query.wordCount; wordIndex += 1) {
      forbiddenBits[wordIndex] |= containingBits[wordIndex];
    }
  }
  return forbiddenBits;
}

function findBestAvailableMedleyExactCandidateExcludingCardIds(
  query: MedleyExactCandidateSlotAvailabilityQuery,
  bannedCardIds: readonly number[],
): MedleyTeamCandidate | null {
  if (query.candidates.length === 0) {
    return null;
  }
  return findBestAvailableMedleyExactCandidateByBits(
    query.candidates,
    query.wordCount,
    writeBannedMedleyExactCandidateBits(query, bannedCardIds),
  );
}

function findBestAvailableMedleyExactRightCandidateByForbiddenCardIds(
  query: MedleyExactCandidatePairUpperQuery,
  primaryForbiddenCardIds: readonly number[],
  secondaryForbiddenCardIds: readonly number[],
): { candidate: MedleyTeamCandidate | null; scannedWordCount: number } {
  if (query.rightCandidates.length === 0) {
    return { candidate: null, scannedWordCount: 0 };
  }
  const containingBits: Uint32Array[] = [];
  const appendContainingBits = (cardIds: readonly number[]): void => {
    for (const cardId of cardIds) {
      const bits = query.containingRightCandidateBitsByCardId.get(cardId);
      if (bits) {
        containingBits.push(bits);
      }
    }
  };
  appendContainingBits(primaryForbiddenCardIds);
  appendContainingBits(secondaryForbiddenCardIds);
  const lastWordIndex = query.rightCandidateBitsetWordCount - 1;
  const lastWordRemainder = query.rightCandidates.length & 31;
  const lastWordMask = lastWordRemainder === 0
    ? 0xffffffff
    : 0xffffffff >>> (32 - lastWordRemainder);
  const finishAvailableWord = (availableBits: number, wordIndex: number, scannedWordCount: number) => {
    const lowestAvailableBit = availableBits & -availableBits;
    const bitIndex = 31 - Math.clz32(lowestAvailableBit);
    return {
      candidate: query.rightCandidates[wordIndex * 32 + bitIndex] ?? null,
      scannedWordCount,
    };
  };
  if (containingBits.length === 0) {
    return { candidate: query.rightCandidates[0] ?? null, scannedWordCount: 1 };
  }
  let scannedWordCount = 0;
  for (let wordIndex = 0; wordIndex < query.rightCandidateBitsetWordCount; wordIndex += 1) {
    scannedWordCount += 1;
    let forbiddenBits = 0;
    for (const bits of containingBits) {
      forbiddenBits |= bits[wordIndex];
    }
    let availableBits = (~forbiddenBits) >>> 0;
    if (wordIndex === lastWordIndex) {
      availableBits &= lastWordMask;
    }
    if (availableBits !== 0) {
      return finishAvailableWord(availableBits, wordIndex, scannedWordCount);
    }
  }
  return { candidate: null, scannedWordCount };
}

function addSortedUniqueCardId(cardIds: readonly number[], cardId: number): number[] {
  if (cardIds.includes(cardId)) {
    return [...cardIds];
  }
  const next = [...cardIds, cardId];
  next.sort((left, right) => left - right);
  return next;
}

function getFirstMedleyExactCandidateOverlapCardId(
  leftCandidate: MedleyTeamCandidate,
  rightCandidate: MedleyTeamCandidate,
): number | null {
  for (const leftCardId of leftCandidate.cardIds) {
    for (const rightCardId of rightCandidate.cardIds) {
      if (leftCardId === rightCardId) {
        return leftCardId;
      }
    }
  }
  return null;
}

function estimateGeneratedMedleyExactCandidatePairConflictSplitUpper(
  leftQuery: MedleyExactCandidateSlotAvailabilityQuery,
  rightQuery: MedleyExactCandidateSlotAvailabilityQuery,
  anchorCardIds: readonly number[],
  localDeadlineAt: number,
): {
  upperBound: number;
  timedOut: boolean;
  abortReason: string | null;
  stateCount: number;
} {
  const initialBannedCardIds = [...anchorCardIds].sort((left, right) => left - right);
  const cache = new Map<string, number>();
  let stateCount = 0;
  let timedOut = false;
  let abortReason: string | null = null;
  let bestDisjointUpperBound = Number.NEGATIVE_INFINITY;

  const visit = (leftBannedCardIds: readonly number[], rightBannedCardIds: readonly number[]): number => {
    if (timedOut) {
      return Number.POSITIVE_INFINITY;
    }
    if (stateCount >= MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_CHEAP_UPPER_SPLIT_STATE_BUDGET) {
      timedOut = true;
      abortReason = "state-budget";
      return Number.POSITIVE_INFINITY;
    }
    if (performance.now() >= localDeadlineAt) {
      timedOut = true;
      abortReason = "timebox";
      return Number.POSITIVE_INFINITY;
    }
    const key = `${leftBannedCardIds.join(",")}|${rightBannedCardIds.join(",")}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    stateCount += 1;
    const leftCandidate = findBestAvailableMedleyExactCandidateExcludingCardIds(leftQuery, leftBannedCardIds);
    const rightCandidate = findBestAvailableMedleyExactCandidateExcludingCardIds(rightQuery, rightBannedCardIds);
    if (!leftCandidate || !rightCandidate) {
      cache.set(key, Number.NEGATIVE_INFINITY);
      return Number.NEGATIVE_INFINITY;
    }
    const scoreUpperBound = leftCandidate.result.score + rightCandidate.result.score;
    // Once a valid disjoint pair reaches this independent slot upper, deeper
    // overlap splitting cannot improve the bound for this branch.
    if (
      Number.isFinite(bestDisjointUpperBound)
      && scoreUpperBound <= bestDisjointUpperBound
    ) {
      cache.set(key, scoreUpperBound);
      return scoreUpperBound;
    }
    const overlapCardId = getFirstMedleyExactCandidateOverlapCardId(leftCandidate, rightCandidate);
    if (overlapCardId === null) {
      bestDisjointUpperBound = Math.max(bestDisjointUpperBound, scoreUpperBound);
      cache.set(key, scoreUpperBound);
      return scoreUpperBound;
    }
    const upperBound = Math.max(
      visit(addSortedUniqueCardId(leftBannedCardIds, overlapCardId), rightBannedCardIds),
      visit(leftBannedCardIds, addSortedUniqueCardId(rightBannedCardIds, overlapCardId)),
    );
    cache.set(key, upperBound);
    return upperBound;
  };

  const upperBound = visit(initialBannedCardIds, initialBannedCardIds);
  return {
    upperBound,
    timedOut,
    abortReason,
    stateCount,
  };
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

function compareMedleyExactCandidatePairFrontierMaxHeap(
  left: MedleyExactCandidatePairFrontierHeapNode,
  right: MedleyExactCandidatePairFrontierHeapNode,
): number {
  return left.score - right.score;
}

function siftUpMedleyExactCandidatePairFrontierMaxHeap(
  heap: MedleyExactCandidatePairFrontierHeapNode[],
  index: number,
): void {
  let currentIndex = index;
  while (currentIndex > 0) {
    const parentIndex = (currentIndex - 1) >> 1;
    if (compareMedleyExactCandidatePairFrontierMaxHeap(heap[parentIndex], heap[currentIndex]) >= 0) {
      break;
    }
    const parent = heap[parentIndex];
    heap[parentIndex] = heap[currentIndex];
    heap[currentIndex] = parent;
    currentIndex = parentIndex;
  }
}

function siftDownMedleyExactCandidatePairFrontierMaxHeap(
  heap: MedleyExactCandidatePairFrontierHeapNode[],
  index: number,
): void {
  let currentIndex = index;
  while (true) {
    const leftIndex = currentIndex * 2 + 1;
    const rightIndex = leftIndex + 1;
    let largestIndex = currentIndex;
    if (
      leftIndex < heap.length
      && compareMedleyExactCandidatePairFrontierMaxHeap(heap[leftIndex], heap[largestIndex]) > 0
    ) {
      largestIndex = leftIndex;
    }
    if (
      rightIndex < heap.length
      && compareMedleyExactCandidatePairFrontierMaxHeap(heap[rightIndex], heap[largestIndex]) > 0
    ) {
      largestIndex = rightIndex;
    }
    if (largestIndex === currentIndex) {
      break;
    }
    const next = heap[largestIndex];
    heap[largestIndex] = heap[currentIndex];
    heap[currentIndex] = next;
    currentIndex = largestIndex;
  }
}

function pushMedleyExactCandidatePairFrontierHeapNode(
  heap: MedleyExactCandidatePairFrontierHeapNode[],
  node: MedleyExactCandidatePairFrontierHeapNode,
): void {
  heap.push(node);
  siftUpMedleyExactCandidatePairFrontierMaxHeap(heap, heap.length - 1);
}

function popMedleyExactCandidatePairFrontierHeapNode(
  heap: MedleyExactCandidatePairFrontierHeapNode[],
): MedleyExactCandidatePairFrontierHeapNode | null {
  if (heap.length === 0) {
    return null;
  }
  const top = heap[0];
  const last = heap.pop();
  if (last && heap.length > 0) {
    heap[0] = last;
    siftDownMedleyExactCandidatePairFrontierMaxHeap(heap, 0);
  }
  return top;
}

function growMedleyExactCandidatePairRecordBuffer(
  buffer: Int32Array<ArrayBufferLike>,
  minCapacity: number,
): Int32Array<ArrayBufferLike> {
  const nextCapacity = Math.max(
    minCapacity,
    buffer.length > 0 ? buffer.length * 2 : 1024,
  );
  const nextBuffer = new Int32Array(nextCapacity);
  nextBuffer.set(buffer);
  return nextBuffer;
}

function getHighMedleyExactCandidatePairRecords(
  query: MedleyExactCandidatePairUpperQuery,
  threshold: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
  useExactThreshold = false,
): number {
  const coarseCacheThreshold = Number.isFinite(threshold)
    ? useExactThreshold
      ? threshold
      : Math.floor(threshold / MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_PAIR_COARSE_CACHE_BUCKET)
      * MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_PAIR_COARSE_CACHE_BUCKET
    : threshold;
  query.highPairAdaptiveCacheThresholdByCoarseThreshold ??= new Map();
  let cacheThreshold = query.highPairAdaptiveCacheThresholdByCoarseThreshold.get(coarseCacheThreshold);
  if (cacheThreshold === undefined) {
    const shouldUseFineBucket = !useExactThreshold
      && Number.isFinite(coarseCacheThreshold)
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
    query.highPairRecordCount = cachedRecordSet.recordCount;
    query.highPairRecordScores = cachedRecordSet.scores;
    query.highPairRecordLeftIndices = cachedRecordSet.leftIndices;
    query.highPairRecordRightIndices = cachedRecordSet.rightIndices;
    query.highPairRecordThreshold = cacheThreshold;
    query.highPairRecordBitsetWordCount = cachedRecordSet.wordCount;
    query.containingHighPairRecordBitsByCardId = cachedRecordSet.containingRecordBitsByCardId;
    query.highPairRecordFallbackUpperScore = cachedRecordSet.fallbackUpperScore;
    return cachedRecordSet.recordCount;
  }

  const startedAt = performance.now();
  const prefixRecordLimit = query.lowMemoryHighPairPrefixRecordLimit;
  const shouldUseBoundedPrefix = (
    prefixRecordLimit !== undefined
    && estimateHighMedleyExactCandidatePairRecordUpperCount(
      query.leftCandidates,
      query.rightCandidates,
      cacheThreshold,
      prefixRecordLimit,
    ) > prefixRecordLimit
  );
  const initialRecordCapacity = shouldUseBoundedPrefix
    ? Math.min(prefixRecordLimit, 65_536)
    : 65_536;
  let recordScores: Int32Array<ArrayBufferLike> = new Int32Array(initialRecordCapacity);
  let recordLeftIndices: Int32Array<ArrayBufferLike> = new Int32Array(initialRecordCapacity);
  let recordRightIndices: Int32Array<ArrayBufferLike> = new Int32Array(initialRecordCapacity);
  let recordCount = 0;
  const appendRecord = (score: number, leftIndex: number, rightIndex: number): void => {
    if (recordCount >= recordScores.length) {
      const nextCapacity = shouldUseBoundedPrefix
        ? prefixRecordLimit
        : Math.max(recordCount + 1, recordScores.length * 2);
      recordScores = growMedleyExactCandidatePairRecordBuffer(recordScores, nextCapacity);
      recordLeftIndices = growMedleyExactCandidatePairRecordBuffer(recordLeftIndices, nextCapacity);
      recordRightIndices = growMedleyExactCandidatePairRecordBuffer(recordRightIndices, nextCapacity);
    }
    recordScores[recordCount] = score;
    recordLeftIndices[recordCount] = leftIndex;
    recordRightIndices[recordCount] = rightIndex;
    recordCount += 1;
  };
  const bestRightScore = query.rightCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY;
  const frontierHeap: MedleyExactCandidatePairFrontierHeapNode[] = [];
  for (let leftIndex = 0; leftIndex < query.leftCandidates.length; leftIndex += 1) {
    const score = query.leftCandidates[leftIndex].result.score + bestRightScore;
    if (score <= cacheThreshold) {
      break;
    }
    pushMedleyExactCandidatePairFrontierHeapNode(frontierHeap, { score, leftIndex, rightIndex: 0 });
  }
  while (frontierHeap.length > 0) {
    const node = popMedleyExactCandidatePairFrontierHeapNode(frontierHeap);
    if (!node) {
      break;
    }
    const leftCandidate = query.leftCandidates[node.leftIndex];
    const rightCandidate = query.rightCandidates[node.rightIndex];
    if (!medleyExactCandidatesOverlap(leftCandidate, rightCandidate)) {
      appendRecord(node.score, node.leftIndex, node.rightIndex);
      if (shouldUseBoundedPrefix && recordCount >= prefixRecordLimit) {
        break;
      }
    }
    const nextRightIndex = node.rightIndex + 1;
    const nextRightCandidate = query.rightCandidates[nextRightIndex];
    if (nextRightCandidate) {
      const nextScore = leftCandidate.result.score + nextRightCandidate.result.score;
      if (nextScore > cacheThreshold) {
        pushMedleyExactCandidatePairFrontierHeapNode(
          frontierHeap,
          { score: nextScore, leftIndex: node.leftIndex, rightIndex: nextRightIndex },
        );
      }
    }
  }
  frontierHeap.length = 0;
  const fallbackUpperScore = shouldUseBoundedPrefix && recordCount >= prefixRecordLimit
    ? recordScores[recordCount - 1] ?? null
    : null;
  if (
    cacheThreshold !== coarseCacheThreshold
    && recordCount < MEDLEY_EXACT_CANDIDATE_JOIN_HIGH_PAIR_FINE_MIN_RECORD_COUNT
  ) {
    if (profiling) {
      profiling.exactCandidateJoinPairComplementHighPairBuildCount += 1;
      profiling.exactCandidateJoinPairComplementHighPairBuildElapsedMs += performance.now() - startedAt;
      profiling.exactCandidateJoinPairComplementHighPairRecordCount = Math.max(
        profiling.exactCandidateJoinPairComplementHighPairRecordCount,
        recordCount,
      );
    }
    query.highPairAdaptiveCacheThresholdByCoarseThreshold?.set(coarseCacheThreshold, coarseCacheThreshold);
    return getHighMedleyExactCandidatePairRecords(query, threshold, profiling, useExactThreshold);
  }
  const scores = recordScores.subarray(0, recordCount);
  const leftIndices = query.lowMemoryHighPairRecordScan === true
    ? recordLeftIndices.subarray(0, recordCount)
    : undefined;
  const rightIndices = query.lowMemoryHighPairRecordScan === true
    ? recordRightIndices.subarray(0, recordCount)
    : undefined;
  const wordCount = Math.ceil(recordCount / 32);
  let containingRecordBitsByCardId: Map<number, Uint32Array> | undefined;
  if (query.lowMemoryHighPairRecordScan !== true) {
    containingRecordBitsByCardId = new Map<number, Uint32Array>();
    for (let recordIndex = 0; recordIndex < recordCount; recordIndex += 1) {
      const leftCandidate = query.leftCandidates[recordLeftIndices[recordIndex]];
      const rightCandidate = query.rightCandidates[recordRightIndices[recordIndex]];
      const wordIndex = recordIndex >> 5;
      const bit = 1 << (recordIndex & 31);
      for (const cardId of leftCandidate.cardIds) {
        let bits = containingRecordBitsByCardId.get(cardId);
        if (!bits) {
          bits = new Uint32Array(wordCount);
          containingRecordBitsByCardId.set(cardId, bits);
        }
        bits[wordIndex] |= bit;
      }
      for (const cardId of rightCandidate.cardIds) {
        let bits = containingRecordBitsByCardId.get(cardId);
        if (!bits) {
          bits = new Uint32Array(wordCount);
          containingRecordBitsByCardId.set(cardId, bits);
        }
        bits[wordIndex] |= bit;
      }
    }
  }
  if (profiling) {
    profiling.exactCandidateJoinPairComplementHighPairBuildCount += 1;
    profiling.exactCandidateJoinPairComplementHighPairBuildElapsedMs += performance.now() - startedAt;
    profiling.exactCandidateJoinPairComplementHighPairRecordCount = Math.max(
      profiling.exactCandidateJoinPairComplementHighPairRecordCount,
      recordCount,
    );
  }
  const recordCache = {
    recordCount,
    scores,
    leftIndices,
    rightIndices,
    wordCount,
    containingRecordBitsByCardId,
    fallbackUpperScore,
  };
  query.highPairRecordCache ??= new Map();
  query.highPairRecordCache.set(cacheThreshold, recordCache);
  query.highPairRecordCount = recordCount;
  query.highPairRecordScores = scores;
  query.highPairRecordLeftIndices = leftIndices;
  query.highPairRecordRightIndices = rightIndices;
  query.highPairRecordThreshold = cacheThreshold;
  query.highPairRecordBitsetWordCount = wordCount;
  query.containingHighPairRecordBitsByCardId = containingRecordBitsByCardId;
  query.highPairRecordFallbackUpperScore = fallbackUpperScore;
  return recordCount;
}

function estimateGeneratedMedleyExactCandidatePairUpperExcludingCardIdsByScan(
  query: MedleyExactCandidatePairUpperQuery,
  bannedCardIds: Iterable<number>,
  minimumRelevantScore = Number.NEGATIVE_INFINITY,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number {
  let bestScore = Number.NEGATIVE_INFINITY;
  const bannedCardIdSet = bannedCardIds instanceof Set ? bannedCardIds : new Set<number>(bannedCardIds);
  const bannedCardIdList = [...bannedCardIdSet];
  const bestRightScore = query.rightCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY;
  let scannedLeftCandidateCount = 0;
  let scannedRightWordCount = 0;
  for (const leftCandidate of query.leftCandidates) {
    scannedLeftCandidateCount += 1;
    if (leftCandidate.cardIds.some((cardId) => bannedCardIdSet.has(cardId))) {
      continue;
    }
    const cutoff = Math.max(bestScore, minimumRelevantScore);
    if (leftCandidate.result.score + bestRightScore <= cutoff) {
      break;
    }
    const rightQueryResult = findBestAvailableMedleyExactRightCandidateByForbiddenCardIds(
      query,
      bannedCardIdList,
      leftCandidate.cardIds,
    );
    scannedRightWordCount += rightQueryResult.scannedWordCount;
    const rightCandidate = rightQueryResult.candidate;
    if (!rightCandidate) {
      continue;
    }
    const score = leftCandidate.result.score + rightCandidate.result.score;
    if (score > minimumRelevantScore) {
      bestScore = Math.max(bestScore, score);
    }
  }
  if (profiling) {
    profiling.exactCandidateJoinPairComplementScanCount += scannedLeftCandidateCount + scannedRightWordCount;
  }
  return bestScore;
}

function estimateGeneratedMedleyExactCandidatePairUpperExcludingCardIdsByRecordScan(
  query: MedleyExactCandidatePairUpperQuery,
  bannedCardIds: Iterable<number>,
  minimumRelevantScore = Number.NEGATIVE_INFINITY,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number {
  const recordCount = query.highPairRecordCount ?? 0;
  const scores = query.highPairRecordScores;
  const leftIndices = query.highPairRecordLeftIndices;
  const rightIndices = query.highPairRecordRightIndices;
  if (!scores || !leftIndices || !rightIndices || recordCount <= 0) {
    return query.highPairRecordFallbackUpperScore ?? Number.NEGATIVE_INFINITY;
  }
  const bannedCardIdSet = bannedCardIds instanceof Set ? bannedCardIds : new Set<number>(bannedCardIds);
  let scannedRecordCount = 0;
  if (bannedCardIdSet.size === 0) {
    if (profiling) {
      profiling.exactCandidateJoinPairComplementScanCount += 1;
    }
    return scores[0] ?? Number.NEGATIVE_INFINITY;
  }
  for (let recordIndex = 0; recordIndex < recordCount; recordIndex += 1) {
    scannedRecordCount += 1;
    const score = scores[recordIndex] ?? Number.NEGATIVE_INFINITY;
    if (score <= minimumRelevantScore) {
      break;
    }
    const leftCandidate = query.leftCandidates[leftIndices[recordIndex]];
    const rightCandidate = query.rightCandidates[rightIndices[recordIndex]];
    if (!leftCandidate || !rightCandidate) {
      continue;
    }
    if (
      leftCandidate.cardIds.some((cardId) => bannedCardIdSet.has(cardId))
      || rightCandidate.cardIds.some((cardId) => bannedCardIdSet.has(cardId))
    ) {
      continue;
    }
    if (profiling) {
      profiling.exactCandidateJoinPairComplementScanCount += scannedRecordCount;
    }
    return score;
  }
  if (profiling) {
    profiling.exactCandidateJoinPairComplementScanCount += scannedRecordCount;
  }
  return query.highPairRecordFallbackUpperScore ?? Number.NEGATIVE_INFINITY;
}

function estimateGeneratedMedleyExactCandidatePairUpperExcludingCardIds(
  query: MedleyExactCandidatePairUpperQuery,
  bannedCardIds: Iterable<number>,
  minimumRelevantScore = Number.NEGATIVE_INFINITY,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
  useExactHighPairThreshold = false,
): number {
  if (profiling) {
    profiling.exactCandidateJoinPairComplementQueryCount += 1;
  }
  if (Number.isFinite(minimumRelevantScore)) {
    const lowMemoryHighPairScanMinRecordCount = query.lowMemoryHighPairScanMinRecordCount;
    if (
      lowMemoryHighPairScanMinRecordCount !== undefined
      && estimateHighMedleyExactCandidatePairRecordUpperCount(
        query.leftCandidates,
        query.rightCandidates,
        minimumRelevantScore,
        lowMemoryHighPairScanMinRecordCount,
      ) > lowMemoryHighPairScanMinRecordCount
    ) {
      if (query.lowMemoryHighPairRecordScan === true) {
        getHighMedleyExactCandidatePairRecords(
          query,
          minimumRelevantScore,
          profiling,
          useExactHighPairThreshold,
        );
        return estimateGeneratedMedleyExactCandidatePairUpperExcludingCardIdsByRecordScan(
          query,
          bannedCardIds,
          minimumRelevantScore,
          profiling,
        );
      }
      return estimateGeneratedMedleyExactCandidatePairUpperExcludingCardIdsByScan(
        query,
        bannedCardIds,
        minimumRelevantScore,
        profiling,
      );
    }
    if (query.lowMemoryHighPairRecordScan === true) {
      getHighMedleyExactCandidatePairRecords(
        query,
        minimumRelevantScore,
        profiling,
        useExactHighPairThreshold,
      );
      return estimateGeneratedMedleyExactCandidatePairUpperExcludingCardIdsByRecordScan(
        query,
        bannedCardIds,
        minimumRelevantScore,
        profiling,
      );
    }
    const recordCount = getHighMedleyExactCandidatePairRecords(
      query,
      minimumRelevantScore,
      profiling,
      useExactHighPairThreshold,
    );
    const highPairRecordScores = query.highPairRecordScores;
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
    return query.highPairRecordFallbackUpperScore ?? Number.NEGATIVE_INFINITY;
  }

  return estimateGeneratedMedleyExactCandidatePairUpperExcludingCardIdsByScan(
    query,
    bannedCardIds,
    Number.NEGATIVE_INFINITY,
    profiling,
  );
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
  proofUpperTarget: number | null = null,
  observeEvaluatedResult?: MedleyEvaluatedResultObserver,
  recordSolveProfiling = true,
  solveOrderVariant: string | null = null,
  extendedThirdShortlistSizeOverride: number | null = null,
  extendedThirdShortlistCacheEntryLimitOverride: number | null = null,
  extendedThirdShortlistQueryLimitOverride: number | null = null,
  zeroScoreTargetSlack = false,
): MedleyExactCandidateJoinSolveResult {
  // The final join is exact only over candidate lists whose unseen frontier was already
  // bounded. Bitsets accelerate card-disjoint checks but never approximate the conflict rule.
  if (slots.length !== MEDLEY_TEAM_COUNT || candidatesBySlot.some((candidates) => candidates.length === 0)) {
    return { timedOut: false, result: null };
  }
  type ThirdCandidateShortlist = {
    candidateIndices: Uint32Array;
    count: number;
    exhaustive: boolean;
    candidateBits?: Uint32Array;
    lastCandidateIndex?: number;
  };

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
  // list first because the second-list frontier stays wide. If the largest
  // list would become the third slot, fallback third scans can dominate solve
  // time, so keep the smallest list in the third position when it can still use
  // the bounded shortlist path. Very small "smallest" lists are cheaper as the
  // first join driver; these variants are exact and only change enumeration
  // order plus the shortlist used for third-slot acceleration.
  const shouldPreferSmallestThirdJoinOrder = (
    smallestCandidateCount >= 10_000
    && smallestCandidateCount <= MEDLEY_EXACT_CANDIDATE_JOIN_EXTENDED_THIRD_SHORTLIST_MAX_THIRD_CANDIDATES
    && largestCandidateCount > MEDLEY_EXACT_CANDIDATE_JOIN_EXTENDED_THIRD_SHORTLIST_MAX_THIRD_CANDIDATES
    && largestCandidateCount >= middleCandidateCount * 2
  );
  const shouldUseMiddleFirstJoinOrder = !shouldPreferSmallestThirdJoinOrder && (
    smallestCandidateCount >= 5_000
    && middleCandidateCount >= smallestCandidateCount * 2
    && largestCandidateCount >= middleCandidateCount * 2
  );
  const forcedSlotOrder = (() => {
    const smallest = candidateCountSlotOrder[0];
    const middle = candidateCountSlotOrder[1];
    const largest = candidateCountSlotOrder[2];
    switch (solveOrderVariant) {
      case "smallest-middle-largest":
        return [smallest, middle, largest];
      case "smallest-largest-middle":
        return [smallest, largest, middle];
      case "middle-smallest-largest":
        return [middle, smallest, largest];
      case "middle-largest-smallest":
        return [middle, largest, smallest];
      case "largest-smallest-middle":
        return [largest, smallest, middle];
      case "largest-middle-smallest":
        return [largest, middle, smallest];
      default:
        return null;
    }
  })();
  const slotOrder = forcedSlotOrder ?? (shouldPreferSmallestThirdJoinOrder
    ? [candidateCountSlotOrder[1], candidateCountSlotOrder[2], candidateCountSlotOrder[0]]
    : shouldUseMiddleFirstJoinOrder
    ? [candidateCountSlotOrder[1], candidateCountSlotOrder[0], candidateCountSlotOrder[2]]
    : candidateCountSlotOrder);
  const forcedThirdCandidateCount = forcedSlotOrder
    ? candidatesBySlot[forcedSlotOrder[2]]?.length ?? 0
    : null;
  const thirdShortlistSize = forcedSlotOrder
    ? forcedThirdCandidateCount !== null
      && forcedThirdCandidateCount <= MEDLEY_EXACT_CANDIDATE_JOIN_EXTENDED_THIRD_SHORTLIST_MAX_THIRD_CANDIDATES
      ? MEDLEY_EXACT_CANDIDATE_JOIN_MIDDLE_FIRST_THIRD_SHORTLIST_SIZE
      : MEDLEY_EXACT_CANDIDATE_JOIN_THIRD_SHORTLIST_SIZE
    : (shouldPreferSmallestThirdJoinOrder || shouldUseMiddleFirstJoinOrder)
    ? MEDLEY_EXACT_CANDIDATE_JOIN_MIDDLE_FIRST_THIRD_SHORTLIST_SIZE
    : MEDLEY_EXACT_CANDIDATE_JOIN_THIRD_SHORTLIST_SIZE;
  const extendedThirdShortlistSize = extendedThirdShortlistSizeOverride !== null
    && Number.isFinite(extendedThirdShortlistSizeOverride)
    ? Math.max(1, Math.trunc(extendedThirdShortlistSizeOverride))
    : MEDLEY_EXACT_CANDIDATE_JOIN_EXTENDED_THIRD_SHORTLIST_SIZE;
  const extendedThirdShortlistCacheEntryLimit = extendedThirdShortlistCacheEntryLimitOverride !== null
    && Number.isFinite(extendedThirdShortlistCacheEntryLimitOverride)
    ? Math.max(0, Math.trunc(extendedThirdShortlistCacheEntryLimitOverride))
    : MEDLEY_EXACT_CANDIDATE_JOIN_EXTENDED_THIRD_SHORTLIST_CACHE_ENTRY_LIMIT;
  const extendedThirdShortlistQueryLimit = extendedThirdShortlistQueryLimitOverride !== null
    && Number.isFinite(extendedThirdShortlistQueryLimitOverride)
    ? Math.max(0, Math.trunc(extendedThirdShortlistQueryLimitOverride))
    : MEDLEY_EXACT_CANDIDATE_JOIN_EXTENDED_THIRD_SHORTLIST_QUERY_LIMIT;
  if (recordSolveProfiling) {
    profiling.exactCandidateJoinLastExtendedThirdShortlistSize = extendedThirdShortlistSize;
    profiling.exactCandidateJoinLastExtendedThirdShortlistCacheEntryLimit = extendedThirdShortlistCacheEntryLimit;
    profiling.exactCandidateJoinLastExtendedThirdShortlistQueryLimit = extendedThirdShortlistQueryLimit;
  }
  const firstSlotIndex = slotOrder[0];
  const secondSlotIndex = slotOrder[1];
  const thirdSlotIndex = slotOrder[2];
  const firstCandidates = candidatesBySlot[firstSlotIndex];
  const secondCandidates = candidatesBySlot[secondSlotIndex];
  const thirdCandidates = candidatesBySlot[thirdSlotIndex];
  const scoreSlackUpperBySlot = candidatesBySlot.map((candidates) => (
    candidates.reduce((maxSlack, candidate) => {
      const slack = candidate.result.maxScore - candidate.result.score;
      return Number.isFinite(slack) ? Math.max(maxSlack, Math.max(0, slack)) : maxSlack;
    }, 0)
  ));
  const rawSolveScoreSlackUpper = slotOrder.reduce((sum, slotIndex) => (
    sum + (scoreSlackUpperBySlot[slotIndex] ?? 0)
  ), 0);
  const canUseZeroScoreTargetSlack = zeroScoreTargetSlack
    && slots.every((slot) => slot.input.target !== "eventPoint");
  const solveScoreSlackUpper = canUseZeroScoreTargetSlack ? 0 : rawSolveScoreSlackUpper;
  if (recordSolveProfiling) {
    profiling.exactCandidateJoinLastSolveScoreSlackUpper = Math.round(rawSolveScoreSlackUpper);
    profiling.exactCandidateJoinLastEffectiveSolveScoreSlackUpper = Math.round(solveScoreSlackUpper);
    if (canUseZeroScoreTargetSlack) {
      profiling.exactCandidateJoinScoreTargetZeroSlackCount += 1;
    }
  }
  const scoreOnlyUpperCannotReachCutoff = (scoreOnlyUpper: number): boolean => (
    scoreOnlyUpper + solveScoreSlackUpper < currentScoreCutoff
  );
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
  const buildBitsetThirdShortlistForCandidate = (
    candidate: MedleyTeamCandidate,
    shortlistSize: number,
  ): ThirdCandidateShortlist => {
    const candidateBits = new Uint32Array(thirdCandidateBitsetWordCount);
    let candidateIndexCount = 0;
    let exhaustive = true;
    let lastCandidateIndex = -1;
    const forbiddenThirdCandidateContainingBits = getContainingThirdBitsForCandidate(candidate);
    for (let wordIndex = 0; wordIndex < thirdCandidateBitsetWordCount; wordIndex += 1) {
      let availableThirdBits = (~readCombinedContainingBitsWord(
        forbiddenThirdCandidateContainingBits,
        wordIndex,
      )) >>> 0;
      if (wordIndex === thirdCandidateLastWordIndex) {
        availableThirdBits &= thirdCandidateLastWordMask;
      }
      while (availableThirdBits !== 0) {
        const lowestAvailableBit = availableThirdBits & -availableThirdBits;
        availableThirdBits ^= lowestAvailableBit;
        candidateBits[wordIndex] |= lowestAvailableBit;
        candidateIndexCount += 1;
        lastCandidateIndex = (wordIndex * 32) + (31 - Math.clz32(lowestAvailableBit));
        if (candidateIndexCount >= shortlistSize) {
          exhaustive = false;
          break;
        }
      }
      if (!exhaustive) {
        break;
      }
    }
    return {
      candidateIndices: new Uint32Array(0),
      count: candidateIndexCount,
      exhaustive,
      candidateBits,
      lastCandidateIndex,
    };
  };
  const shouldUseBitsetExtendedThirdShortlist = thirdCandidateBitsetWordCount <= extendedThirdShortlistSize;
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
    const shortlist = shouldUseBitsetExtendedThirdShortlist
      ? buildBitsetThirdShortlistForCandidate(candidate, extendedThirdShortlistSize)
      : buildThirdShortlistForCandidate(candidate, extendedThirdShortlistSize);
    if (extendedThirdShortlistCacheEntryCount < extendedThirdShortlistCacheEntryLimit) {
      extendedThirdShortlistCache.set(candidate, shortlist);
      extendedThirdShortlistCacheEntryCount += 1;
    }
    return shortlist;
  };
  const findBestThirdCandidateInShortlist = (
    shortlist: ThirdCandidateShortlist,
    primaryForbiddenBits: Uint32Array,
  ): MedleyTeamCandidate | null => {
    if (shortlist.candidateBits) {
      const lastWordIndex = shortlist.lastCandidateIndex !== undefined && shortlist.lastCandidateIndex >= 0
        ? shortlist.lastCandidateIndex >> 5
        : -1;
      for (let wordIndex = 0; wordIndex <= lastWordIndex; wordIndex += 1) {
        const availableBits = (shortlist.candidateBits[wordIndex] & ~primaryForbiddenBits[wordIndex]) >>> 0;
        if (availableBits !== 0) {
          const lowestAvailableBit = availableBits & -availableBits;
          const bitIndex = 31 - Math.clz32(lowestAvailableBit);
          return thirdCandidates[(wordIndex * 32) + bitIndex] ?? null;
        }
      }
      return null;
    }
    for (let shortlistIndex = 0; shortlistIndex < shortlist.count; shortlistIndex += 1) {
      const currentThirdCandidateIndex = shortlist.candidateIndices[shortlistIndex];
      if (
        (primaryForbiddenBits[currentThirdCandidateIndex >> 5]
          & (1 << (currentThirdCandidateIndex & 31))) === 0
      ) {
        return thirdCandidates[currentThirdCandidateIndex] ?? null;
      }
    }
    return null;
  };
  const getShortlistFallbackStartCandidateIndex = (shortlist: ThirdCandidateShortlist): number => {
    if (shortlist.count <= 0) {
      return 0;
    }
    if (shortlist.lastCandidateIndex !== undefined) {
      return shortlist.lastCandidateIndex + 1;
    }
    return shortlist.candidateIndices[shortlist.count - 1] + 1;
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
  const initialProofCutoff = proofUpperTarget !== null && Number.isFinite(proofUpperTarget)
    ? Math.floor(proofUpperTarget) + 1
    : incumbentScore + 1;
  let currentScoreCutoff = Math.max(incumbentScore + 1, initialProofCutoff);
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
    if (!recordSolveProfiling) {
      return;
    }
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
    if (scoreOnlyUpperCannotReachCutoff(firstScore + bestSecondScore + bestThirdScore)) {
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
    if (scoreOnlyUpperCannotReachCutoff(firstScore + bestSecondForFirst.result.score + bestThirdForFirstScore)) {
      continue;
    }
    if (scoreOnlyUpperCannotReachCutoff(firstScore + bestSecondScore + bestThirdForFirstScore)) {
      continue;
    }
    let shouldStopSecondLoop = false;
    for (let wordIndex = 0; wordIndex < secondCandidateBitsetWordCount; wordIndex += 1) {
      const wordTopSecondScore = secondCandidateScores[wordIndex * 32] ?? Number.NEGATIVE_INFINITY;
      if (scoreOnlyUpperCannotReachCutoff(firstScore + wordTopSecondScore + bestThirdForFirstScore)) {
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
        if (scoreOnlyUpperCannotReachCutoff(firstSecondScore + bestThirdScore)) {
          shouldStopSecondLoop = true;
          break;
        }
        if (scoreOnlyUpperCannotReachCutoff(firstSecondScore + bestThirdForFirstScore)) {
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
          + solveScoreSlackUpper
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
              && localExtendedThirdShortlistQueryCount < extendedThirdShortlistQueryLimit
            );
            if (shouldUseExtendedThirdShortlist) {
              const extendedThirdShortlist = getExtendedThirdShortlistForCandidate(secondCandidate);
              localExtendedThirdShortlistQueryCount += 1;
              thirdCandidate = findBestThirdCandidateInShortlist(
                extendedThirdShortlist,
                firstForbiddenThirdCandidateBits,
              );
              if (thirdCandidate) {
                localExtendedThirdShortlistHitCount += 1;
              }
              if (extendedThirdShortlist.count > 0) {
                fallbackStartCandidateIndex = getShortlistFallbackStartCandidateIndex(extendedThirdShortlist);
              }
              if (!thirdCandidate && extendedThirdShortlist.exhaustive) {
                localExtendedThirdShortlistExhaustiveMissCount += 1;
                shouldRunBitsetFallback = false;
              }
            }
            if (!thirdCandidate && shouldRunBitsetFallback && fallbackStartCandidateIndex < thirdCandidates.length) {
              const fallbackThirdScoreUpper = thirdCandidates[fallbackStartCandidateIndex]?.result.score
                ?? Number.NEGATIVE_INFINITY;
              if (scoreOnlyUpperCannotReachCutoff(firstSecondScore + fallbackThirdScoreUpper)) {
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
        if (scoreOnlyUpperCannotReachCutoff(firstSecondScore + thirdCandidate.result.score)) {
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
        const result = buildMedleyResult(slots, selectedBySong, configuration);
        if (result) {
          observeEvaluatedResult?.(result);
        }
        bestResult = compareMedleyResultLike(bestResult, result);
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

function findBestGeneratedMedleyExactCandidatePairForAnchorByBits(
  query: MedleyExactCandidatePairUpperQuery,
  anchorCandidate: MedleyTeamCandidate,
  scoreCutoff: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): {
  score: number;
  leftCandidate: MedleyTeamCandidate | null;
  rightCandidate: MedleyTeamCandidate | null;
} {
  let bestScore = scoreCutoff;
  let bestLeftCandidate: MedleyTeamCandidate | null = null;
  let bestRightCandidate: MedleyTeamCandidate | null = null;
  const bannedCardIdSet = new Set(anchorCandidate.cardIds);
  const bannedRightCandidateBits = buildBannedMedleyExactRightCandidateBits(query, bannedCardIdSet);
  const bestRightScore = query.rightCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY;
  for (const leftCandidate of query.leftCandidates) {
    if (leftCandidate.cardIds.some((cardId) => bannedCardIdSet.has(cardId))) {
      continue;
    }
    if (leftCandidate.result.score + bestRightScore <= bestScore) {
      break;
    }
    const rightCandidate = findBestAvailableMedleyExactCandidateByBits(
      query.rightCandidates,
      query.rightCandidateBitsetWordCount,
      bannedRightCandidateBits,
      getForbiddenMedleyExactRightCandidateBits(query, leftCandidate),
    );
    profiling.exactCandidateJoinPairComplementQueryCount += 1;
    if (!rightCandidate) {
      continue;
    }
    const score = leftCandidate.result.score + rightCandidate.result.score;
    if (score > bestScore) {
      bestScore = score;
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

function findBestGeneratedMedleyExactCandidatePairForAnchorByBitsExhaustive(
  query: MedleyExactCandidatePairUpperQuery,
  anchorCandidate: MedleyTeamCandidate,
  scoreCutoff: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  localDeadlineAt: number,
): {
  score: number;
  timedOut: boolean;
  leftCandidate: MedleyTeamCandidate | null;
  rightCandidate: MedleyTeamCandidate | null;
} {
  let bestScore = scoreCutoff;
  let bestLeftCandidate: MedleyTeamCandidate | null = null;
  let bestRightCandidate: MedleyTeamCandidate | null = null;
  const bannedCardIdSet = new Set(anchorCandidate.cardIds);
  const bannedRightCandidateBits = buildBannedMedleyExactRightCandidateBits(query, bannedCardIdSet);
  const rightCandidateForAnchor = findBestAvailableMedleyExactCandidateByBits(
    query.rightCandidates,
    query.rightCandidateBitsetWordCount,
    bannedRightCandidateBits,
  );
  const bestRightScoreForAnchor = rightCandidateForAnchor?.result.score ?? Number.NEGATIVE_INFINITY;
  if (!Number.isFinite(bestRightScoreForAnchor)) {
    return { score: bestScore, timedOut: false, leftCandidate: null, rightCandidate: null };
  }
  for (const leftCandidate of query.leftCandidates) {
    if (performance.now() >= localDeadlineAt) {
      return {
        score: bestScore,
        timedOut: true,
        leftCandidate: bestLeftCandidate,
        rightCandidate: bestRightCandidate,
      };
    }
    if (leftCandidate.cardIds.some((cardId) => bannedCardIdSet.has(cardId))) {
      continue;
    }
    if (leftCandidate.result.score + bestRightScoreForAnchor <= bestScore) {
      break;
    }
    const rightCandidate = findBestAvailableMedleyExactCandidateByBits(
      query.rightCandidates,
      query.rightCandidateBitsetWordCount,
      bannedRightCandidateBits,
      getForbiddenMedleyExactRightCandidateBits(query, leftCandidate),
    );
    profiling.exactCandidateJoinPairComplementQueryCount += 1;
    if (!rightCandidate) {
      continue;
    }
    const score = leftCandidate.result.score + rightCandidate.result.score;
    if (score > bestScore) {
      bestScore = score;
      bestLeftCandidate = leftCandidate;
      bestRightCandidate = rightCandidate;
    }
  }
  return {
    score: bestScore,
    timedOut: false,
    leftCandidate: bestLeftCandidate,
    rightCandidate: bestRightCandidate,
  };
}

function findBestHydratedGeneratedMedleyExactCandidatePairForAnchor(
  query: MedleyExactCandidatePairUpperQuery,
  slots: MedleySlotSearch[],
  leftSlotIndex: number,
  rightSlotIndex: number,
  anchorCandidate: MedleyTeamCandidate,
  server: number,
  perfectRate: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  stats: BandoriMedleyTeamSearchStats,
  localDeadlineAt: number,
): {
  proved: boolean;
  timedOut: boolean;
  score: number;
  leftCandidate: MedleyTeamCandidate | null;
  rightCandidate: MedleyTeamCandidate | null;
} {
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestLeftCandidate: MedleyTeamCandidate | null = null;
  let bestRightCandidate: MedleyTeamCandidate | null = null;
  const bannedCardIdSet = new Set(anchorCandidate.cardIds);
  const bannedRightCandidateBits = buildBannedMedleyExactRightCandidateBits(query, bannedCardIdSet);
  const rightCandidateForAnchor = findBestAvailableMedleyExactCandidateByBits(
    query.rightCandidates,
    query.rightCandidateBitsetWordCount,
    bannedRightCandidateBits,
  );
  const bestRightScoreForAnchor = rightCandidateForAnchor?.result.score ?? Number.NEGATIVE_INFINITY;
  if (!Number.isFinite(bestRightScoreForAnchor)) {
    return { proved: true, timedOut: false, score: bestScore, leftCandidate: null, rightCandidate: null };
  }
  for (const leftCandidate of query.leftCandidates) {
    if (performance.now() >= localDeadlineAt) {
      return {
        proved: false,
        timedOut: true,
        score: bestScore,
        leftCandidate: bestLeftCandidate,
        rightCandidate: bestRightCandidate,
      };
    }
    if (leftCandidate.cardIds.some((cardId) => bannedCardIdSet.has(cardId))) {
      continue;
    }
    if (leftCandidate.result.score + bestRightScoreForAnchor <= bestScore) {
      return {
        proved: true,
        timedOut: false,
        score: bestScore,
        leftCandidate: bestLeftCandidate,
        rightCandidate: bestRightCandidate,
      };
    }
    for (const rightCandidate of query.rightCandidates) {
      if (performance.now() >= localDeadlineAt) {
        return {
          proved: false,
          timedOut: true,
          score: bestScore,
          leftCandidate: bestLeftCandidate,
          rightCandidate: bestRightCandidate,
        };
      }
      const scoreOnlyUpper = leftCandidate.result.score + rightCandidate.result.score;
      if (scoreOnlyUpper <= bestScore) {
        break;
      }
      if (
        rightCandidate.cardIds.some((cardId) => bannedCardIdSet.has(cardId))
        || medleyExactCandidatesOverlap(leftCandidate, rightCandidate)
      ) {
        continue;
      }
      const leftResultCandidate = hydrateMedleyExactCandidateForResult(
        slots[leftSlotIndex],
        leftCandidate,
        server,
        perfectRate,
        stats,
        profiling,
      );
      const rightResultCandidate = hydrateMedleyExactCandidateForResult(
        slots[rightSlotIndex],
        rightCandidate,
        server,
        perfectRate,
        stats,
        profiling,
      );
      if (!leftResultCandidate || !rightResultCandidate) {
        continue;
      }
      const score = leftResultCandidate.result.score + rightResultCandidate.result.score;
      if (score > bestScore) {
        bestScore = score;
        bestLeftCandidate = leftResultCandidate;
        bestRightCandidate = rightResultCandidate;
      }
    }
  }
  return {
    proved: true,
    timedOut: false,
    score: bestScore,
    leftCandidate: bestLeftCandidate,
    rightCandidate: bestRightCandidate,
  };
}

function createMedleyExactCandidateCardKeyPacker(slots: MedleySlotSearch[]): {
  packCandidateCardKey: (cardIds: readonly number[]) => string;
  packCandidateCardsKey: (cards: readonly SearchCard[]) => string;
} {
  let maxCardId = 0;
  for (const slot of slots) {
    for (const card of slot.searchCards) {
      if (Number.isFinite(card.cardId)) {
        maxCardId = Math.max(maxCardId, Math.trunc(card.cardId));
      }
    }
  }
  if (maxCardId <= 0xffff) {
    const packCandidateCardKey = (cardIds: readonly number[]): string => {
      switch (cardIds.length) {
        case 0:
          return "";
        case 1:
          return String.fromCharCode(Math.trunc(cardIds[0]));
        case 2:
          return String.fromCharCode(Math.trunc(cardIds[0]), Math.trunc(cardIds[1]));
        case 3:
          return String.fromCharCode(Math.trunc(cardIds[0]), Math.trunc(cardIds[1]), Math.trunc(cardIds[2]));
        case 4:
          return String.fromCharCode(
            Math.trunc(cardIds[0]),
            Math.trunc(cardIds[1]),
            Math.trunc(cardIds[2]),
            Math.trunc(cardIds[3]),
          );
        case 5:
          return String.fromCharCode(
            Math.trunc(cardIds[0]),
            Math.trunc(cardIds[1]),
            Math.trunc(cardIds[2]),
            Math.trunc(cardIds[3]),
            Math.trunc(cardIds[4]),
          );
        default:
          return String.fromCharCode(...cardIds.map((cardId) => Math.trunc(cardId)));
      }
    };
    const packCandidateCardsKey = (cards: readonly SearchCard[]): string => {
      switch (cards.length) {
        case 0:
          return "";
        case 1:
          return String.fromCharCode(Math.trunc(cards[0].cardId));
        case 2:
          return String.fromCharCode(Math.trunc(cards[0].cardId), Math.trunc(cards[1].cardId));
        case 3:
          return String.fromCharCode(
            Math.trunc(cards[0].cardId),
            Math.trunc(cards[1].cardId),
            Math.trunc(cards[2].cardId),
          );
        case 4:
          return String.fromCharCode(
            Math.trunc(cards[0].cardId),
            Math.trunc(cards[1].cardId),
            Math.trunc(cards[2].cardId),
            Math.trunc(cards[3].cardId),
          );
        case 5:
          return String.fromCharCode(
            Math.trunc(cards[0].cardId),
            Math.trunc(cards[1].cardId),
            Math.trunc(cards[2].cardId),
            Math.trunc(cards[3].cardId),
            Math.trunc(cards[4].cardId),
          );
        default:
          return String.fromCharCode(...cards.map((card) => Math.trunc(card.cardId)));
      }
    };
    return { packCandidateCardKey, packCandidateCardsKey };
  }
  const packCandidateCardKey = (cardIds: readonly number[]): string => {
    const codeUnits: number[] = [];
    for (const cardId of cardIds) {
      const finiteCardId = Math.max(0, Math.trunc(cardId));
      codeUnits.push(
        Math.floor(finiteCardId / 0x10000),
        finiteCardId & 0xffff,
      );
    }
    return String.fromCharCode(...codeUnits);
  };
  const packCandidateCardsKey = (cards: readonly SearchCard[]): string => {
    const codeUnits: number[] = [];
    for (const card of cards) {
      const finiteCardId = Math.max(0, Math.trunc(card.cardId));
      codeUnits.push(
        Math.floor(finiteCardId / 0x10000),
        finiteCardId & 0xffff,
      );
    }
    return String.fromCharCode(...codeUnits);
  };
  return { packCandidateCardKey, packCandidateCardsKey };
}

function getMedleyExactCandidateCardKey(
  candidate: MedleyTeamCandidate,
  packCandidateCardKey: (cardIds: readonly number[]) => string,
): string {
  return packCandidateCardKey(candidate.cardIds);
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
  localDeadlineAt: number | null = null,
  findGeneratedPairForAnchor?: (
    anchorCandidate: MedleyTeamCandidate,
    minimumRelevantScore: number,
  ) => {
    score: number;
    leftCandidate: MedleyTeamCandidate | null;
    rightCandidate: MedleyTeamCandidate | null;
  },
): MedleyExactCandidatePairSearchResult {
  if (localDeadlineAt !== null && performance.now() >= localDeadlineAt) {
    return { proved: false, timedOut: false, localTimedOut: true, leftCandidate: null, rightCandidate: null };
  }
  const leftSlotIndex = pairSlotIndices[0];
  const rightSlotIndex = pairSlotIndices[1];
  let bestPair = findGeneratedPairForAnchor
    ? findGeneratedPairForAnchor(anchorCandidate, scoreCutoff)
    : findBestGeneratedMedleyExactCandidatePairForAnchor(
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
    if (localDeadlineAt !== null && performance.now() >= localDeadlineAt) {
      return {
        proved: false,
        timedOut: false,
        localTimedOut: true,
        leftCandidate: bestPair.leftCandidate,
        rightCandidate: bestPair.rightCandidate,
      };
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

function proveMedleyExactCandidateAnchorFrontier(
  slots: MedleySlotSearch[],
  candidatesBySlot: MedleyTeamCandidate[][],
  generators: MedleyExactSlotCandidateGenerator[],
  anchorSlotIndex: number,
  pairUpperBound: number,
  configuration: BandoriAreaItemConfiguration,
  incumbentScore: number,
  server: number,
  perfectRate: number,
  pairCandidateLimit: number,
  proofTimeboxMs: number | null | undefined,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  deadlineAt: number,
  options: {
    lowMemoryHighPairScanMinRecordCount?: number | null;
    lowMemoryHighPairPrefixRecordLimit?: number | null;
    lowMemoryHighPairRecordScan?: boolean;
    stopAtObservedUpperBound?: number | null;
    stopAtObservedUpperMinProcessedAnchors?: number | null;
  } = {},
  observeEvaluatedResult?: MedleyEvaluatedResultObserver,
): MedleyExactCandidateAnchorFrontierProofResult {
  const startedAt = performance.now();
  const effectiveProofTimeboxMs = proofTimeboxMs !== null
    && proofTimeboxMs !== undefined
    && Number.isFinite(proofTimeboxMs)
    ? Math.max(0, proofTimeboxMs)
    : MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_TIMEBOX_MS;
  const localDeadlineAt = Math.min(
    deadlineAt,
    startedAt + effectiveProofTimeboxMs,
  );
  const pairSlotIndices = slots
    .map((_, index) => index)
    .filter((index) => index !== anchorSlotIndex) as [number, number];
  const anchorCandidates = [...candidatesBySlot[anchorSlotIndex]];
  sortMedleyCandidates(anchorCandidates);
  const stopAtObservedUpperBound = (
    options.stopAtObservedUpperBound !== null
    && options.stopAtObservedUpperBound !== undefined
    && Number.isFinite(options.stopAtObservedUpperBound)
  )
    ? options.stopAtObservedUpperBound
    : null;
  const stopAtObservedUpperMinProcessedAnchors = (
    options.stopAtObservedUpperMinProcessedAnchors !== null
    && options.stopAtObservedUpperMinProcessedAnchors !== undefined
    && Number.isFinite(options.stopAtObservedUpperMinProcessedAnchors)
  )
    ? Math.max(0, Math.trunc(options.stopAtObservedUpperMinProcessedAnchors))
    : 1;

  profiling.exactCandidateJoinAnchorFrontierProofTriggerCount += 1;
  profiling.exactCandidateJoinLastAnchorFrontierProofSlotIndex = anchorSlotIndex;
  profiling.exactCandidateJoinLastAnchorFrontierProofProcessedAnchorCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierProofResidualUpperBound = null;
  profiling.exactCandidateJoinLastAnchorFrontierProofResidualGap = null;
  profiling.exactCandidateJoinLastAnchorFrontierProofElapsedMs = null;
  profiling.exactCandidateJoinLastAnchorFrontierProofTimeboxMs = effectiveProofTimeboxMs;
  profiling.exactCandidateJoinLastAnchorFrontierProofCheapUpperStopBound = null;
  profiling.exactCandidateJoinLastAnchorFrontierProofOtherSlotCandidateCounts = pairSlotIndices.map(
    (slotIndex) => candidatesBySlot[slotIndex].length,
  );
  profiling.exactCandidateJoinLastAnchorFrontierProofPeakHeapMiB = stats.peakUsedHeapMiB;

  const finish = (
    proved: boolean,
    localTimedOut: boolean,
    result: BandoriMedleyTeamSearchResult | null,
    processedAnchorCount: number,
    residualUpperBound: number | null,
  ): MedleyExactCandidateAnchorFrontierProofResult => {
    const elapsedMs = performance.now() - startedAt;
    const normalizedResidualUpperBound = residualUpperBound !== null && Number.isFinite(residualUpperBound)
      ? residualUpperBound
      : null;
    const observedUpperBound = normalizedResidualUpperBound !== null && result
      ? Math.max(normalizedResidualUpperBound, result.score)
      : normalizedResidualUpperBound;
    if (result) {
      observeEvaluatedResult?.(result);
    }
    if (proved) {
      profiling.exactCandidateJoinAnchorFrontierProofCompletedCount += 1;
    }
    if (localTimedOut) {
      profiling.exactCandidateJoinAnchorFrontierProofTimeboxCount += 1;
    }
    profiling.exactCandidateJoinLastAnchorFrontierProofProcessedAnchorCount = processedAnchorCount;
    profiling.exactCandidateJoinLastAnchorFrontierProofResidualUpperBound = observedUpperBound !== null
      ? Math.ceil(observedUpperBound)
      : null;
    profiling.exactCandidateJoinLastAnchorFrontierProofResidualGap = observedUpperBound !== null
      ? Math.max(0, Math.ceil(observedUpperBound) - incumbentScore)
      : null;
    profiling.exactCandidateJoinLastAnchorFrontierProofElapsedMs = Math.round(elapsedMs);
    profiling.exactCandidateJoinLastAnchorFrontierProofOtherSlotCandidateCounts = pairSlotIndices.map(
      (slotIndex) => candidatesBySlot[slotIndex].length,
    );
    profiling.exactCandidateJoinLastAnchorFrontierProofPeakHeapMiB = stats.peakUsedHeapMiB;
    return {
      proved,
      localTimedOut,
      result,
      observedUpperBound,
      processedAnchorCount,
      residualUpperBound: observedUpperBound,
      elapsedMs,
    };
  };

  const getResidualUpperBound = (nextAnchorScore: number | null): number | null => {
    const unseenAnchorUpperBound = generators[anchorSlotIndex].peekUpperBound();
    const anchorUpperBound = Math.max(
      nextAnchorScore ?? Number.NEGATIVE_INFINITY,
      Number.isFinite(unseenAnchorUpperBound) ? unseenAnchorUpperBound : Number.NEGATIVE_INFINITY,
    );
    return Number.isFinite(anchorUpperBound) && Number.isFinite(pairUpperBound)
      ? anchorUpperBound + pairUpperBound
      : null;
  };

  const maybeStopAtObservedUpperBound = (
    nextAnchorScore: number | null,
    currentProcessedAnchorCount: number,
  ): MedleyExactCandidateAnchorFrontierProofResult | null => {
    if (
      stopAtObservedUpperBound === null
      || currentProcessedAnchorCount < stopAtObservedUpperMinProcessedAnchors
    ) {
      return null;
    }
    const residualUpperBound = getResidualUpperBound(nextAnchorScore);
    if (residualUpperBound === null || residualUpperBound < stopAtObservedUpperBound) {
      return null;
    }
    profiling.exactCandidateJoinAnchorFrontierProofCheapUpperStopCount += 1;
    profiling.exactCandidateJoinLastAnchorFrontierProofCheapUpperStopBound = Math.ceil(
      stopAtObservedUpperBound,
    );
    return finish(
      false,
      false,
      null,
      currentProcessedAnchorCount,
      residualUpperBound,
    );
  };

  let generatedPairQuery: MedleyExactCandidatePairUpperQuery | null = null;
  let generatedPairQueryKey = "";
  const findGeneratedPairForAnchor = (
    anchorCandidate: MedleyTeamCandidate,
    minimumRelevantScore: number,
  ): {
    score: number;
    leftCandidate: MedleyTeamCandidate | null;
    rightCandidate: MedleyTeamCandidate | null;
  } => {
    const leftCandidates = candidatesBySlot[pairSlotIndices[0]];
    const rightCandidates = candidatesBySlot[pairSlotIndices[1]];
    const key = `${leftCandidates.length}:${rightCandidates.length}`;
    if (!generatedPairQuery || generatedPairQueryKey !== key) {
      const sortedLeftCandidates = [...leftCandidates];
      const sortedRightCandidates = [...rightCandidates];
      sortMedleyCandidates(sortedLeftCandidates);
      sortMedleyCandidates(sortedRightCandidates);
      generatedPairQuery = buildMedleyExactCandidatePairUpperQuery(
        sortedLeftCandidates,
        sortedRightCandidates,
        options.lowMemoryHighPairScanMinRecordCount ?? null,
        options.lowMemoryHighPairPrefixRecordLimit ?? null,
        options.lowMemoryHighPairRecordScan === true,
      );
      generatedPairQueryKey = key;
    }
    return findBestGeneratedMedleyExactCandidatePairForAnchorByBits(
      generatedPairQuery,
      anchorCandidate,
      minimumRelevantScore,
      profiling,
    );
  };

  let processedAnchorCount = 0;
  for (let anchorIndex = 0; anchorIndex < anchorCandidates.length; anchorIndex += 1) {
    const anchorCandidate = anchorCandidates[anchorIndex];
    const stopResult = maybeStopAtObservedUpperBound(anchorCandidate.result.score, processedAnchorCount);
    if (stopResult) {
      return stopResult;
    }
    if (stats.timedOut || performance.now() >= deadlineAt || isPastDeadline()) {
      stats.isExhaustive = false;
      stats.timedOut = true;
      stats.searchMode = "bounded";
      return finish(
        false,
        false,
        null,
        processedAnchorCount,
        getResidualUpperBound(anchorCandidate.result.score),
      );
    }
    if (performance.now() >= localDeadlineAt) {
      return finish(
        false,
        true,
        null,
        processedAnchorCount,
        getResidualUpperBound(anchorCandidate.result.score),
      );
    }
    if (anchorCandidate.result.score + pairUpperBound <= incumbentScore) {
      return finish(
        getResidualUpperBound(anchorCandidate.result.score) !== null
          && (getResidualUpperBound(anchorCandidate.result.score) ?? Number.POSITIVE_INFINITY) <= incumbentScore,
        false,
        null,
        processedAnchorCount,
        getResidualUpperBound(anchorCandidate.result.score),
      );
    }

    const pairSearchResult = findBestMedleyExactCandidatePairForAnchor(
      pairSlotIndices,
      candidatesBySlot,
      generators,
      anchorCandidate,
      incumbentScore - anchorCandidate.result.score,
      pairCandidateLimit,
      profiling,
      stats,
      isPastDeadline,
      deadlineAt,
      localDeadlineAt,
      findGeneratedPairForAnchor,
    );
    if (pairSearchResult.timedOut) {
      return finish(
        false,
        false,
        null,
        processedAnchorCount,
        getResidualUpperBound(anchorCandidate.result.score),
      );
    }
    if (pairSearchResult.localTimedOut) {
      return finish(
        false,
        true,
        null,
        processedAnchorCount,
        getResidualUpperBound(anchorCandidate.result.score),
      );
    }
    if (!pairSearchResult.proved) {
      return finish(
        false,
        false,
        null,
        processedAnchorCount,
        getResidualUpperBound(anchorCandidate.result.score),
      );
    }
    processedAnchorCount += 1;
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
        return finish(
          false,
          false,
          null,
          processedAnchorCount,
          getResidualUpperBound(anchorCandidates[anchorIndex + 1]?.result.score ?? null),
        );
      }
      const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
      selectedBySong[slots[anchorSlotIndex].songIndex] = anchorResultCandidate;
      selectedBySong[slots[pairSlotIndices[0]].songIndex] = leftResultCandidate;
      selectedBySong[slots[pairSlotIndices[1]].songIndex] = rightResultCandidate;
      const result = buildMedleyResult(slots, selectedBySong, configuration);
      return finish(
        false,
        false,
        result,
        processedAnchorCount,
        getResidualUpperBound(anchorCandidates[anchorIndex + 1]?.result.score ?? null),
      );
    }
    const stopAfterProcessedResult = maybeStopAtObservedUpperBound(
      anchorCandidates[anchorIndex + 1]?.result.score ?? null,
      processedAnchorCount,
    );
    if (stopAfterProcessedResult) {
      return stopAfterProcessedResult;
    }
  }

  const residualUpperBound = getResidualUpperBound(null);
  return finish(
    residualUpperBound !== null && residualUpperBound <= incumbentScore,
    false,
    null,
    processedAnchorCount,
    residualUpperBound,
  );
}

function findMedleyExactCandidateAnchorFrontierImprovement(
  slots: MedleySlotSearch[],
  candidatesBySlot: MedleyTeamCandidate[][],
  anchorSlotIndex: number,
  configuration: BandoriAreaItemConfiguration,
  incumbentScore: number,
  server: number,
  perfectRate: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  stats: BandoriMedleyTeamSearchStats,
  observeEvaluatedResult?: MedleyEvaluatedResultObserver,
): {
  result: BandoriMedleyTeamSearchResult | null;
  processedAnchorCount: number;
  localTimedOut: boolean;
  elapsedMs: number;
} {
  const startedAt = performance.now();
  const localDeadlineAt = startedAt + MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_IMPROVEMENT_PROBE_TIMEBOX_MS;
  const pairSlotIndices = slots
    .map((_, index) => index)
    .filter((index) => index !== anchorSlotIndex) as [number, number];
  const anchorCandidates = [...candidatesBySlot[anchorSlotIndex]];
  const leftCandidates = [...candidatesBySlot[pairSlotIndices[0]]];
  const rightCandidates = [...candidatesBySlot[pairSlotIndices[1]]];
  sortMedleyCandidates(anchorCandidates);
  sortMedleyCandidates(leftCandidates);
  sortMedleyCandidates(rightCandidates);
  const pairQuery = buildMedleyExactCandidatePairUpperQuery(leftCandidates, rightCandidates);
  const maxAnchorCount = Math.min(
    anchorCandidates.length,
    MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_IMPROVEMENT_PROBE_MAX_ANCHORS,
  );
  let processedAnchorCount = 0;
  profiling.exactCandidateJoinAnchorFrontierImprovementProbeCount += 1;
  profiling.exactCandidateJoinLastAnchorFrontierImprovementProbeProcessedAnchorCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierImprovementProbeElapsedMs = null;
  profiling.exactCandidateJoinLastAnchorFrontierImprovementProbeScore = null;

  const finish = (
    result: BandoriMedleyTeamSearchResult | null,
    localTimedOut: boolean,
  ): {
    result: BandoriMedleyTeamSearchResult | null;
    processedAnchorCount: number;
    localTimedOut: boolean;
    elapsedMs: number;
  } => {
    const elapsedMs = performance.now() - startedAt;
    if (result) {
      profiling.exactCandidateJoinAnchorFrontierImprovementProbeHitCount += 1;
    }
    if (localTimedOut) {
      profiling.exactCandidateJoinAnchorFrontierImprovementProbeTimeboxCount += 1;
    }
    profiling.exactCandidateJoinLastAnchorFrontierImprovementProbeProcessedAnchorCount = processedAnchorCount;
    profiling.exactCandidateJoinLastAnchorFrontierImprovementProbeElapsedMs = Math.round(elapsedMs);
    profiling.exactCandidateJoinLastAnchorFrontierImprovementProbeScore = result?.score ?? null;
    return { result, processedAnchorCount, localTimedOut, elapsedMs };
  };

  for (let anchorIndex = 0; anchorIndex < maxAnchorCount; anchorIndex += 1) {
    if (performance.now() >= localDeadlineAt) {
      return finish(null, true);
    }
    const anchorCandidate = anchorCandidates[anchorIndex];
    const pairCutoff = incumbentScore - anchorCandidate.result.score;
    if ((leftCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY)
      + (rightCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY) <= pairCutoff) {
      break;
    }
    const pair = findBestGeneratedMedleyExactCandidatePairForAnchorByBits(
      pairQuery,
      anchorCandidate,
      pairCutoff,
      profiling,
    );
    processedAnchorCount += 1;
    if (!pair.leftCandidate || !pair.rightCandidate || pair.score <= pairCutoff) {
      continue;
    }
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
      pair.leftCandidate,
      server,
      perfectRate,
      stats,
      profiling,
    );
    const rightResultCandidate = hydrateMedleyExactCandidateForResult(
      slots[pairSlotIndices[1]],
      pair.rightCandidate,
      server,
      perfectRate,
      stats,
      profiling,
    );
    if (!anchorResultCandidate || !leftResultCandidate || !rightResultCandidate) {
      continue;
    }
    const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
    selectedBySong[slots[anchorSlotIndex].songIndex] = anchorResultCandidate;
    selectedBySong[slots[pairSlotIndices[0]].songIndex] = leftResultCandidate;
    selectedBySong[slots[pairSlotIndices[1]].songIndex] = rightResultCandidate;
    const result = buildMedleyResult(slots, selectedBySong, configuration);
    if (result) {
      observeEvaluatedResult?.(result);
    }
    return finish(result, false);
  }

  return finish(null, false);
}

function estimateMedleyExactCandidateAnchorFrontierCheapUpper(
  slots: MedleySlotSearch[],
  candidatesBySlot: MedleyTeamCandidate[][],
  generators: MedleyExactSlotCandidateGenerator[],
  anchorSlotIndex: number,
  pairUpperBound: number,
  pairUnseenUpperBound: number | null,
  configuration: BandoriAreaItemConfiguration,
  incumbentScore: number,
  server: number,
  perfectRate: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  stats: BandoriMedleyTeamSearchStats,
  deadlineAt: number,
  options: {
    timeboxMs?: number | null;
    maxAnchors?: number | null;
    streamAnchorTail?: boolean;
    streamAnchorTailMaxCandidates?: number | null;
    streamAnchorTailTimeboxMs?: number | null;
    streamAnchorTailGlobalPruning?: boolean;
    refineUnseen?: boolean;
    refineTopAnchors?: number | null;
    unseenRefineMaxGeneratedCandidates?: number | null;
    processedUnseenJoin?: boolean;
    rewindBothUnseen?: boolean;
    bestPrefixSplit?: boolean;
    bestPrefixSplitMaxAttempts?: number | null;
    pairAnchorCover?: boolean;
    pairAnchorCoverMaxPairs?: number | null;
    localPairSlotExtension?: boolean;
    localPairSlotExtensionSlotIndex?: number | null;
    localPairSlotExtensionMaxCandidates?: number | null;
    localPairSlotExtensionTimeboxMs?: number | null;
    pairCapacityCap?: boolean;
    pairCapacityCapPareto?: boolean;
    pairCapacityCapBucketed?: boolean;
    pairCapacityBreakdown?: boolean;
    pairCapacitySharedPowerDualCap?: boolean;
    pairCapacitySharedPowerDualCapMaxCalls?: number | null;
    pairCapacitySharedPowerDualReuseMaxCalls?: number | null;
    pairCapacitySharedPowerDualLateMaxRepair?: boolean;
    pairCapacitySharedPowerDualLateMaxRepairExtraCalls?: number | null;
    pairCapacitySharedPowerBreakdown?: boolean;
    pairCapacitySharedPowerStateBudget?: number | null;
    targetedPairProofTimeboxMs?: number | null;
    targetedPairProofMaxEntries?: number | null;
    targetedPairProofCandidateLimit?: number | null;
    targetedPairBnbNodeLimit?: number | null;
    targetedPairBnbSlotSolveNodeLimit?: number | null;
    suffixCover?: boolean;
    multiCardSuffixCover?: boolean;
    suffixGeneratedPairJoin?: boolean;
    suffixUnseenSingleCardJoin?: boolean;
    suffixUnseenFullJoin?: boolean;
    unprocessedGeneratorUpperBound?: number | null;
  } = {},
  observeEvaluatedResult?: MedleyEvaluatedResultObserver,
): MedleyExactCandidateAnchorFrontierProofResult {
  const startedAt = performance.now();
  const timeboxMs = (
    options.timeboxMs !== null
    && options.timeboxMs !== undefined
    && Number.isFinite(options.timeboxMs)
  )
    ? Math.max(0, Math.trunc(options.timeboxMs))
    : MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_CHEAP_UPPER_TIMEBOX_MS;
  const localDeadlineAt = Math.min(
    deadlineAt,
    startedAt + timeboxMs,
  );
  const pairSlotIndices = candidatesBySlot
    .map((_, index) => index)
    .filter((index) => index !== anchorSlotIndex) as [number, number];
  const leftSlotIndex = pairSlotIndices[0];
  const rightSlotIndex = pairSlotIndices[1];
  const anchorCandidates = [...candidatesBySlot[anchorSlotIndex]];
  let leftCandidates = [...candidatesBySlot[leftSlotIndex]];
  let rightCandidates = [...candidatesBySlot[rightSlotIndex]];
  sortMedleyCandidates(anchorCandidates);
  sortMedleyCandidates(leftCandidates);
  sortMedleyCandidates(rightCandidates);
  const maxAnchorCount = Math.min(
    anchorCandidates.length,
    (
      options.maxAnchors !== null
      && options.maxAnchors !== undefined
      && Number.isFinite(options.maxAnchors)
    )
      ? Math.max(1, Math.trunc(options.maxAnchors))
      : MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_CHEAP_UPPER_MAX_ANCHORS,
  );
  const shouldStreamAnchorTail = options.streamAnchorTail === true;
  const shouldStreamAnchorTailGlobalPruning = (
    shouldStreamAnchorTail
    && options.streamAnchorTailGlobalPruning === true
    && pairUnseenUpperBound !== null
    && Number.isFinite(pairUnseenUpperBound)
  );
  const streamAnchorTailMaxCandidates = (
    options.streamAnchorTailMaxCandidates !== null
    && options.streamAnchorTailMaxCandidates !== undefined
    && Number.isFinite(options.streamAnchorTailMaxCandidates)
  )
    ? Math.max(1, Math.trunc(options.streamAnchorTailMaxCandidates))
    : 20_000;
  const streamAnchorTailTimeboxMs = (
    options.streamAnchorTailTimeboxMs !== null
    && options.streamAnchorTailTimeboxMs !== undefined
    && Number.isFinite(options.streamAnchorTailTimeboxMs)
  )
    ? Math.max(0, Math.trunc(options.streamAnchorTailTimeboxMs))
    : 15_000;
  const shouldRefineUnseenUpper = options.refineUnseen === true;
  const shouldUseProcessedUnseenJoin = options.processedUnseenJoin === true;
  const shouldRewindBothUnseen = options.rewindBothUnseen === true;
  const shouldUseBestPrefixSplit = options.bestPrefixSplit === true;
  const bestPrefixSplitMaxAttempts = (
    options.bestPrefixSplitMaxAttempts !== null
    && options.bestPrefixSplitMaxAttempts !== undefined
    && Number.isFinite(options.bestPrefixSplitMaxAttempts)
  )
    ? Math.max(1, Math.trunc(options.bestPrefixSplitMaxAttempts))
    : 4;
  const shouldUsePairAnchorCover = options.pairAnchorCover === true;
  const pairAnchorCoverMaxPairs = (
    options.pairAnchorCoverMaxPairs !== null
    && options.pairAnchorCoverMaxPairs !== undefined
    && Number.isFinite(options.pairAnchorCoverMaxPairs)
  )
    ? Math.max(1, Math.trunc(options.pairAnchorCoverMaxPairs))
    : 2_500_000;
  const shouldUseLocalPairSlotExtension = options.localPairSlotExtension === true;
  const localPairSlotExtensionMaxCandidates = (
    options.localPairSlotExtensionMaxCandidates !== null
    && options.localPairSlotExtensionMaxCandidates !== undefined
    && Number.isFinite(options.localPairSlotExtensionMaxCandidates)
  )
    ? Math.max(1, Math.trunc(options.localPairSlotExtensionMaxCandidates))
    : 50_000;
  const localPairSlotExtensionTimeboxMs = (
    options.localPairSlotExtensionTimeboxMs !== null
    && options.localPairSlotExtensionTimeboxMs !== undefined
    && Number.isFinite(options.localPairSlotExtensionTimeboxMs)
  )
    ? Math.max(0, Math.trunc(options.localPairSlotExtensionTimeboxMs))
    : 30_000;
  const refineTopAnchorCount = (
    options.refineTopAnchors !== null
    && options.refineTopAnchors !== undefined
    && Number.isFinite(options.refineTopAnchors)
  )
    ? Math.max(1, Math.trunc(options.refineTopAnchors))
    : MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_CHEAP_UPPER_REFINE_TOP_ANCHORS;
  const unseenRefineMaxGeneratedCandidates = (
    options.unseenRefineMaxGeneratedCandidates !== null
    && options.unseenRefineMaxGeneratedCandidates !== undefined
    && Number.isFinite(options.unseenRefineMaxGeneratedCandidates)
  )
    ? Math.max(1, Math.trunc(options.unseenRefineMaxGeneratedCandidates))
    : MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_CHEAP_UPPER_UNSEEN_REFINE_MAX_GENERATED;
  const targetedPairProofTimeboxMs = (
    options.targetedPairProofTimeboxMs !== null
    && options.targetedPairProofTimeboxMs !== undefined
    && Number.isFinite(options.targetedPairProofTimeboxMs)
  )
    ? Math.max(0, Math.trunc(options.targetedPairProofTimeboxMs))
    : 0;
  const targetedPairProofMaxEntries = (
    options.targetedPairProofMaxEntries !== null
    && options.targetedPairProofMaxEntries !== undefined
    && Number.isFinite(options.targetedPairProofMaxEntries)
  )
    ? Math.max(1, Math.trunc(options.targetedPairProofMaxEntries))
    : 0;
  const targetedPairProofCandidateLimit = (
    options.targetedPairProofCandidateLimit !== null
    && options.targetedPairProofCandidateLimit !== undefined
    && Number.isFinite(options.targetedPairProofCandidateLimit)
  )
    ? Math.max(1, Math.trunc(options.targetedPairProofCandidateLimit))
    : Math.max(candidatesBySlot[leftSlotIndex].length, candidatesBySlot[rightSlotIndex].length);
  const targetedPairBnbNodeLimit = (
    options.targetedPairBnbNodeLimit !== null
    && options.targetedPairBnbNodeLimit !== undefined
    && Number.isFinite(options.targetedPairBnbNodeLimit)
  )
    ? Math.max(1, Math.trunc(options.targetedPairBnbNodeLimit))
    : null;
  const targetedPairBnbSlotSolveNodeLimit = (
    options.targetedPairBnbSlotSolveNodeLimit !== null
    && options.targetedPairBnbSlotSolveNodeLimit !== undefined
    && Number.isFinite(options.targetedPairBnbSlotSolveNodeLimit)
  )
    ? Math.max(1, Math.trunc(options.targetedPairBnbSlotSolveNodeLimit))
    : null;
  const shouldUseSuffixCover = options.suffixCover === true;
  const shouldUseMultiCardSuffixCover = shouldUseSuffixCover && options.multiCardSuffixCover === true;
  const shouldUseSuffixGeneratedPairJoin = options.suffixGeneratedPairJoin === true;
  const shouldUseSuffixUnseenSingleCardJoin = options.suffixUnseenSingleCardJoin === true;
  const shouldUseSuffixUnseenFullJoin = options.suffixUnseenFullJoin === true;
  const shouldUseSuffixUnseenJoin = shouldUseSuffixUnseenSingleCardJoin || shouldUseSuffixUnseenFullJoin;
  const globalTailUpperBound = (
    options.unprocessedGeneratorUpperBound !== null
    && options.unprocessedGeneratorUpperBound !== undefined
    && Number.isFinite(options.unprocessedGeneratorUpperBound)
  )
    ? options.unprocessedGeneratorUpperBound
    : null;
  const shouldUsePairCapacityCap = options.pairCapacityCap === true;
  const shouldUsePairCapacityCapPareto = options.pairCapacityCapPareto === true;
  const shouldUsePairCapacityCapBucketed = options.pairCapacityCapBucketed === true;
  const shouldCapturePairCapacityBreakdown = options.pairCapacityBreakdown === true;
  const shouldUsePairCapacitySharedPowerDualCap = options.pairCapacitySharedPowerDualCap === true;
  const shouldUsePairCapacitySharedPowerDualLateMaxRepair = (
    options.pairCapacitySharedPowerDualLateMaxRepair === true
  );
  const pairCapacitySharedPowerDualCapMaxCalls = (
    options.pairCapacitySharedPowerDualCapMaxCalls !== null
    && options.pairCapacitySharedPowerDualCapMaxCalls !== undefined
    && Number.isFinite(options.pairCapacitySharedPowerDualCapMaxCalls)
  )
    ? Math.max(1, Math.trunc(options.pairCapacitySharedPowerDualCapMaxCalls))
    : 8;
  const pairCapacitySharedPowerDualLateMaxRepairExtraCalls = (
    options.pairCapacitySharedPowerDualLateMaxRepairExtraCalls !== null
    && options.pairCapacitySharedPowerDualLateMaxRepairExtraCalls !== undefined
    && Number.isFinite(options.pairCapacitySharedPowerDualLateMaxRepairExtraCalls)
  )
    ? Math.max(0, Math.trunc(options.pairCapacitySharedPowerDualLateMaxRepairExtraCalls))
    : 0;
  const shouldCapturePairCapacitySharedPowerBreakdown = options.pairCapacitySharedPowerBreakdown === true;
  const pairCapacitySharedPowerStateBudget = (
    options.pairCapacitySharedPowerStateBudget !== null
    && options.pairCapacitySharedPowerStateBudget !== undefined
    && Number.isFinite(options.pairCapacitySharedPowerStateBudget)
  )
    ? Math.max(1, Math.trunc(options.pairCapacitySharedPowerStateBudget))
    : 1_000_000;
  let leftPeekUpperBound = generators[leftSlotIndex].peekUpperBound();
  let rightPeekUpperBound = generators[rightSlotIndex].peekUpperBound();
  const rawAnchorPeekUpperBound = generators[anchorSlotIndex].peekUpperBound();
  let anchorPeekUpperBound = (
    globalTailUpperBound !== null
    && Number.isFinite(pairUpperBound)
  )
    ? Math.min(rawAnchorPeekUpperBound, globalTailUpperBound - pairUpperBound)
    : rawAnchorPeekUpperBound;
  const initialLooseUpperBound = Math.max(
    anchorCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY,
    Number.isFinite(anchorPeekUpperBound) ? anchorPeekUpperBound : Number.NEGATIVE_INFINITY,
  ) + pairUpperBound;
  let processedAnchorCount = 0;
  let processedUpperMax = Number.NEGATIVE_INFINITY;
  let processedUpperMaxSource: string | null = null;
  let processedUpperMaxAnchorScore: number | null = null;
  let processedUpperMaxPairUpper: number | null = null;
  let processedUpperMaxGeneratedPairUpper: number | null = null;
  let processedUpperMaxLeftUnseenUpper: number | null = null;
  let processedUpperMaxRightUnseenUpper: number | null = null;
  let processedUpperMaxAnchorCandidate: MedleyTeamCandidate | null = null;
  let processedUpperMaxLeftGeneratedCandidate: MedleyTeamCandidate | null = null;
  let processedUpperMaxRightGeneratedCandidate: MedleyTeamCandidate | null = null;
  const processedAnchorUpperEntries: Array<{
    anchorCandidate: MedleyTeamCandidate;
    anchorIndex: number;
    anchorScore: number;
    totalUpper: number;
    pairUpper: number;
    source: string;
    generatedPairUpper: number;
    leftUnseenUpper: number;
    rightUnseenUpper: number;
    leftGeneratedCandidate: MedleyTeamCandidate | null;
    rightGeneratedCandidate: MedleyTeamCandidate | null;
  }> = [];
  type RefinedAnchorPairUpper = {
    pairUpper: number;
    source: string;
    generatedPairUpper: number;
    leftUnseenUpper: number;
    rightUnseenUpper: number;
  };
  const refinedAnchorPairUpperByCandidate = new WeakMap<MedleyTeamCandidate, RefinedAnchorPairUpper>();
  let splitAttemptCount = 0;
  let splitStateCount = 0;
  let splitAbortReason: string | null = null;
  let unseenRefineAttemptCount = 0;
  let unseenRefineCandidateCount = 0;
  let unseenRefineImprovementCount = 0;
  let unseenRefineAbortReason: string | null = null;
  let targetedPairProofAttemptCount = 0;
  let targetedPairProofProcessedEntryCount = 0;
  let targetedPairProofImprovementCount = 0;
  let targetedPairProofTimeboxCount = 0;
  let targetedPairProofElapsedMs = 0;
  let targetedPairProofAbortReason: string | null = null;
  let targetedPairProofResult: BandoriMedleyTeamSearchResult | null = null;
  let targetedPairProofDisabled = false;
  const recordUnseenRefineProfiling = (): void => {
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineAttemptCount = unseenRefineAttemptCount;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineCandidateCount = unseenRefineCandidateCount;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineImprovementCount = (
      unseenRefineImprovementCount
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineAbortReason = unseenRefineAbortReason;
  };
  const recordTargetedPairProofProfiling = (): void => {
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperTargetedPairProofAttemptCount = (
      targetedPairProofAttemptCount
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperTargetedPairProofProcessedEntryCount = (
      targetedPairProofProcessedEntryCount
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperTargetedPairProofImprovementCount = (
      targetedPairProofImprovementCount
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperTargetedPairProofTimeboxCount = (
      targetedPairProofTimeboxCount
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperTargetedPairProofElapsedMs = Math.round(
      targetedPairProofElapsedMs,
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperTargetedPairProofAbortReason = (
      targetedPairProofAbortReason
    );
  };

  profiling.exactCandidateJoinAnchorFrontierCheapUpperCount += 1;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSlotIndex = anchorSlotIndex;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedAnchorCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperResidualUpperBound = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperResidualGap = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperElapsedMs = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperTimeboxMs = timeboxMs;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperOtherSlotCandidateCounts = pairSlotIndices.map(
    (slotIndex) => candidatesBySlot[slotIndex].length,
  );
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPeakHeapMiB = stats.peakUsedHeapMiB;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxSource = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxAnchorCardIds = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxAnchorScore = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxPairUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxLeftUnseenUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxRightUnseenUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxLeftGeneratedCardIds = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxRightGeneratedCardIds = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperResidualSource = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperUnprocessedAnchorScore = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperUnprocessedPairUpper = null;
  profiling.exactCandidateJoinLastGlobalTailUpperBound = globalTailUpperBound !== null
    ? Math.ceil(globalTailUpperBound)
    : null;
  profiling.exactCandidateJoinLastGlobalTailRawUpperBound = (
    Number.isFinite(rawAnchorPeekUpperBound)
    && Number.isFinite(pairUpperBound)
  )
    ? Math.ceil(rawAnchorPeekUpperBound + pairUpperBound)
    : null;
  profiling.exactCandidateJoinLastGlobalTailImprovement = (
    globalTailUpperBound !== null
    && profiling.exactCandidateJoinLastGlobalTailRawUpperBound !== null
  )
    ? Math.max(0, profiling.exactCandidateJoinLastGlobalTailRawUpperBound - Math.ceil(globalTailUpperBound))
    : null;
  if (
    profiling.exactCandidateJoinLastGlobalTailImprovement !== null
    && profiling.exactCandidateJoinLastGlobalTailImprovement > 0
  ) {
    profiling.exactCandidateJoinGlobalTailUpperCount += 1;
  }
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixCoverCandidateCount = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixCoverDistinctCardCount = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixCoverDistinctCardSetCount = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixCoverMode = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixCoverUpperBound = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixCoverElapsedMs = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixCoverAbortReason = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinAnchorCount = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinPairRecordCount = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinUpperBound = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinElapsedMs = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinAbortReason = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxScoreUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxAnchorScore = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxPairScoreOnly = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxPairFullScore = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxPairScoreSlack = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxAnchorCardIds = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxLeftCardIds = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxRightCardIds = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxLeftIndex = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxRightIndex = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxPairRecordIndex = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixUnseenSingleCardJoinLeftUpperBound = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixUnseenSingleCardJoinRightUpperBound = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixUnseenSingleCardJoinPairCount = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixUnseenSingleCardJoinElapsedMs = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixUnseenSingleCardJoinAbortReason = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixUnseenJoinMode = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinUpperBound = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinPairCount = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinElapsedMs = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinAbortReason = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinMaxSource = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinMaxAnchorScore = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinMaxGeneratedPairUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinMaxBothUnseenFallbackPairUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinMaxGeneratedCandidateScore = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinMaxGeneratedUnseenUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinMaxEntryIndex = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinMaxGeneratedIndex = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinMaxUnseenSlotIndex = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperRewindAttemptCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperRewindImprovementCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperRewindUpperBound = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperRewindSplitAnchorIndex = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperRewindProcessedEntryCount = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperRewindElapsedMs = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperRewindAbortReason = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixSplitAttemptCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixSplitImprovementCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixSplitUpperBound = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixSplitAnchorIndex = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixSplitProcessedEntryCount = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixSplitElapsedMs = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixSplitAbortReason = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixResidualUpperBound = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixResidualImprovement = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixResidualAnchorIndex = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixResidualProcessedEntryCount = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairAnchorCoverUpperBound = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairAnchorCoverPairCount = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairAnchorCoverDistinctCardCount = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairAnchorCoverElapsedMs = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairAnchorCoverAbortReason = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperLocalPairExtensionSlotIndex = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperLocalPairExtensionAddedCandidateCount = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperLocalPairExtensionCandidateCount = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperLocalPairExtensionPeekBefore = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperLocalPairExtensionPeekAfter = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperLocalPairExtensionElapsedMs = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperLocalPairExtensionAbortReason = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperStreamAnchorTailCandidateCount = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperStreamAnchorTailPeekBefore = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperStreamAnchorTailPeekAfter = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperStreamAnchorTailGlobalPeekBefore = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperStreamAnchorTailGlobalPeekAfter = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperStreamAnchorTailUpperBound = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperStreamAnchorTailElapsedMs = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperStreamAnchorTailAbortReason = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityCapUpperBound = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityCapCallCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityCapImprovementCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityCapBestImprovement = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityCapElapsedMs = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualCapCallCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualCapImprovementCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualCapBestImprovement = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualCapElapsedMs = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualReuseCallCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualReuseImprovementCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualReuseBestImprovement = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualReuseElapsedMs = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualReuseParameterCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualLateRepairAttemptCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualLateRepairImprovementCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualLateRepairBestImprovement = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualLateRepairExtraCallCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualLateRepairElapsedMs = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownTargetPairUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSelectedUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSelectedGap = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownCorrelatedUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownCorrelatedLeftUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownCorrelatedRightUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownFastUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownFastMode = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownBasicUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownBasicMode = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownBasicCoefficientUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownBasicSkillAwareUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownLagrangianUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownLagrangianGap = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownLagrangianWeight = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownLagrangianElapsedMs = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSharedPowerDualUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSharedPowerDualGap = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSharedPowerDualLeaderShare = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSharedPowerDualLambdaBySlot = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSharedPowerDualElapsedMs = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSharedPowerUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSharedPowerGap = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSharedPowerStateBudget = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSharedPowerElapsedMs = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownElapsedMs = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairOverlaps = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairScoreOnly = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairFullScore = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairScoreSlack = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSplitAttemptCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSplitStateCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSplitAbortReason = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineAttemptCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineCandidateCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineImprovementCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineAbortReason = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperTargetedPairProofAttemptCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperTargetedPairProofProcessedEntryCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperTargetedPairProofImprovementCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperTargetedPairProofTimeboxCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperTargetedPairProofElapsedMs = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperTargetedPairProofAbortReason = null;

  const finiteScore = (score: number): number => (
    Number.isFinite(score) ? score : Number.NEGATIVE_INFINITY
  );
  const combineScores = (leftScore: number, rightScore: number): number => (
    Number.isFinite(leftScore) && Number.isFinite(rightScore)
      ? leftScore + rightScore
      : Number.NEGATIVE_INFINITY
  );
  const pairCapacityCapByAnchorKey = new Map<string, number>();
  const estimatePairCapacityCap = (anchorCardIds: readonly number[]): number => {
    if (!shouldUsePairCapacityCap) {
      return Number.POSITIVE_INFINITY;
    }
    const key = [...anchorCardIds].sort((left, right) => left - right).join(",");
    const cached = pairCapacityCapByAnchorKey.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const startedAt = performance.now();
    const bannedCardIds = new Set<number>(anchorCardIds);
    const upperBound = estimateMedleyRemainingScoreUpperBound(
      slots,
      pairSlotIndices,
      bannedCardIds,
      profiling,
      true,
      true,
      shouldUsePairCapacityCapPareto,
      shouldUsePairCapacityCapBucketed,
      false,
      false,
    );
    const normalizedUpperBound = Number.isFinite(upperBound) ? upperBound : Number.POSITIVE_INFINITY;
    pairCapacityCapByAnchorKey.set(key, normalizedUpperBound);
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityCapCallCount = (
      (profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityCapCallCount ?? 0) + 1
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityCapElapsedMs = Math.round(
      (profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityCapElapsedMs ?? 0)
      + performance.now() - startedAt,
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityCapUpperBound = (
      Math.min(
        profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityCapUpperBound
          ?? Number.POSITIVE_INFINITY,
        normalizedUpperBound,
      )
    );
    return normalizedUpperBound;
  };
  const capPairUpper = (pairUpper: number, anchorCardIds: readonly number[]): number => {
    if (!Number.isFinite(pairUpper)) {
      return pairUpper;
    }
    const capacityUpper = estimatePairCapacityCap(anchorCardIds);
    if (!Number.isFinite(capacityUpper) || capacityUpper >= pairUpper) {
      return pairUpper;
    }
    const improvement = pairUpper - capacityUpper;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityCapImprovementCount = (
      (profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityCapImprovementCount ?? 0) + 1
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityCapBestImprovement = Math.max(
      profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityCapBestImprovement ?? 0,
      improvement,
    );
    return capacityUpper;
  };
  const applyPairCapacityCap = (
    pairUpper: number,
    source: string,
    anchorCardIds: readonly number[],
  ): {
    pairUpper: number;
    source: string;
  } => {
    const cappedPairUpper = capPairUpper(pairUpper, anchorCardIds);
    if (cappedPairUpper < pairUpper) {
      return {
        pairUpper: cappedPairUpper,
        source: "pair-capacity",
      };
    }
    return {
      pairUpper,
      source,
    };
  };
  const pairCapacitySharedPowerDualCapByAnchorKey = new Map<string, number>();
  let pairCapacitySharedPowerDualLateRepairExtraCallCount = 0;
  const pairCapacitySharedPowerDualParameterSeeds: Array<{
    leaderPowerShare: number;
    lambdaBySlot: [number, number];
  }> = [];
  const pairCapacitySharedPowerDualReuseMaxParameterSeeds = Math.min(
    2,
    pairCapacitySharedPowerDualCapMaxCalls,
  );
  const pairCapacitySharedPowerDualReuseMaxCalls = (
    options.pairCapacitySharedPowerDualReuseMaxCalls !== null
    && options.pairCapacitySharedPowerDualReuseMaxCalls !== undefined
    && Number.isFinite(options.pairCapacitySharedPowerDualReuseMaxCalls)
  )
    ? Math.max(0, Math.trunc(options.pairCapacitySharedPowerDualReuseMaxCalls))
    : pairCapacitySharedPowerDualCapMaxCalls * 256;
  const rememberPairCapacitySharedPowerDualParameterSeed = (estimate: {
    leaderPowerShare: number;
    lambdaBySlot: [number, number];
  } | null): void => {
    if (!estimate || pairCapacitySharedPowerDualParameterSeeds.length >= pairCapacitySharedPowerDualReuseMaxParameterSeeds) {
      return;
    }
    const alreadyKnown = pairCapacitySharedPowerDualParameterSeeds.some((seed) => (
      Math.abs(seed.leaderPowerShare - estimate.leaderPowerShare) < 1e-12
      && Math.abs(seed.lambdaBySlot[0] - estimate.lambdaBySlot[0]) < 1e-12
      && Math.abs(seed.lambdaBySlot[1] - estimate.lambdaBySlot[1]) < 1e-12
    ));
    if (alreadyKnown) {
      return;
    }
    pairCapacitySharedPowerDualParameterSeeds.push({
      leaderPowerShare: estimate.leaderPowerShare,
      lambdaBySlot: [estimate.lambdaBySlot[0], estimate.lambdaBySlot[1]],
    });
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualReuseParameterCount = (
      pairCapacitySharedPowerDualParameterSeeds.length
    );
  };
  const estimatePairCapacitySharedPowerDualCap = (
    anchorCardIds: readonly number[],
    allowLateRepairExtraCall = false,
  ): number => {
    if (!shouldUsePairCapacitySharedPowerDualCap && !shouldUsePairCapacitySharedPowerDualLateMaxRepair) {
      return Number.POSITIVE_INFINITY;
    }
    const key = [...anchorCardIds].sort((left, right) => left - right).join(",");
    const cached = pairCapacitySharedPowerDualCapByAnchorKey.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const callCount = (
      profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualCapCallCount ?? 0
    );
    const canUseRegularCall = callCount < pairCapacitySharedPowerDualCapMaxCalls;
    const canUseLateRepairExtraCall = (
      allowLateRepairExtraCall
      && pairCapacitySharedPowerDualLateRepairExtraCallCount
        < pairCapacitySharedPowerDualLateMaxRepairExtraCalls
    );
    if (!canUseRegularCall && !canUseLateRepairExtraCall) {
      return Number.POSITIVE_INFINITY;
    }
    // The dual estimator is synchronous; keep a small reserve so it cannot consume the outer timebox tail.
    if (performance.now() + 1_000 >= localDeadlineAt) {
      return Number.POSITIVE_INFINITY;
    }
    const startedAt = performance.now();
    const estimate = estimateMedleyFastTwoSlotSharedPowerDualScoreUpperBound(
      slots,
      pairSlotIndices,
      new Set<number>(anchorCardIds),
    );
    const normalizedUpperBound = (
      estimate && Number.isFinite(estimate.upperBound)
        ? estimate.upperBound
        : Number.POSITIVE_INFINITY
    );
    if (Number.isFinite(normalizedUpperBound)) {
      rememberPairCapacitySharedPowerDualParameterSeed(estimate);
    }
    pairCapacitySharedPowerDualCapByAnchorKey.set(key, normalizedUpperBound);
    if (!canUseRegularCall && canUseLateRepairExtraCall) {
      pairCapacitySharedPowerDualLateRepairExtraCallCount += 1;
      profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualLateRepairExtraCallCount = (
        pairCapacitySharedPowerDualLateRepairExtraCallCount
      );
    }
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualCapCallCount = callCount + 1;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualCapElapsedMs = Math.round(
      (profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualCapElapsedMs ?? 0)
      + performance.now() - startedAt,
    );
    return normalizedUpperBound;
  };
  const estimatePairCapacitySharedPowerDualReuseCap = (anchorCardIds: readonly number[]): number => {
    if (!shouldUsePairCapacitySharedPowerDualCap || pairCapacitySharedPowerDualParameterSeeds.length === 0) {
      return Number.POSITIVE_INFINITY;
    }
    const reuseCallCount = (
      profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualReuseCallCount ?? 0
    );
    if (reuseCallCount >= pairCapacitySharedPowerDualReuseMaxCalls) {
      return Number.POSITIVE_INFINITY;
    }
    if (performance.now() + 250 >= localDeadlineAt) {
      return Number.POSITIVE_INFINITY;
    }
    const startedAt = performance.now();
    const bannedCardIds = new Set<number>(anchorCardIds);
    let bestUpperBound = Number.POSITIVE_INFINITY;
    for (const parameters of pairCapacitySharedPowerDualParameterSeeds) {
      if (performance.now() + 250 >= localDeadlineAt) {
        break;
      }
      const estimate = estimateMedleyFastTwoSlotSharedPowerDualScoreUpperBoundForParameters(
        slots,
        pairSlotIndices,
        bannedCardIds,
        parameters,
      );
      if (estimate && Number.isFinite(estimate.upperBound)) {
        bestUpperBound = Math.min(bestUpperBound, estimate.upperBound);
      }
    }
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualReuseCallCount = (
      reuseCallCount + 1
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualReuseElapsedMs = Math.round(
      (profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualReuseElapsedMs ?? 0)
      + performance.now() - startedAt,
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualReuseParameterCount = (
      pairCapacitySharedPowerDualParameterSeeds.length
    );
    return bestUpperBound;
  };
  const applyPairCapacitySharedPowerDualCap = (
    pairUpper: number,
    source: string,
    anchorCardIds: readonly number[],
    allowLateRepairExtraCall = false,
  ): {
    pairUpper: number;
    source: string;
  } => {
    if (!Number.isFinite(pairUpper)) {
      return {
        pairUpper,
        source,
      };
    }
    const reuseUpper = estimatePairCapacitySharedPowerDualReuseCap(anchorCardIds);
    let capacityUpper = reuseUpper;
    let cappedSource = "pair-capacity-shared-power-dual-reuse";
    if (!Number.isFinite(capacityUpper) || capacityUpper >= pairUpper) {
      capacityUpper = estimatePairCapacitySharedPowerDualCap(anchorCardIds, allowLateRepairExtraCall);
      cappedSource = "pair-capacity-shared-power-dual";
    }
    if (!Number.isFinite(capacityUpper) || capacityUpper >= pairUpper) {
      return {
        pairUpper,
        source,
      };
    }
    const improvement = pairUpper - capacityUpper;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualCapImprovementCount = (
      (profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualCapImprovementCount ?? 0) + 1
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualCapBestImprovement = Math.max(
      profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualCapBestImprovement ?? 0,
      improvement,
    );
    if (cappedSource === "pair-capacity-shared-power-dual-reuse") {
      profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualReuseImprovementCount = (
        (profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualReuseImprovementCount ?? 0)
        + 1
      );
      profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualReuseBestImprovement = (
        Math.max(
          profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualReuseBestImprovement ?? 0,
          improvement,
        )
      );
    }
    return {
      pairUpper: capacityUpper,
      source: cappedSource,
    };
  };
  const shouldApplyPairCapacitySharedPowerDualCap = (
    entry: (typeof processedAnchorUpperEntries)[number],
    refined: RefinedAnchorPairUpper,
  ): boolean => {
    if (!shouldUsePairCapacitySharedPowerDualCap) {
      return false;
    }
    if (entry.source !== "pair-capacity" && refined.source !== "pair-capacity") {
      return false;
    }
    const targetPairUpper = incumbentScore - entry.anchorScore;
    return !Number.isFinite(targetPairUpper) || refined.pairUpper > targetPairUpper;
  };
  const applyPairCapacitySharedPowerDualCapForEntry = (
    entry: (typeof processedAnchorUpperEntries)[number],
    refined: RefinedAnchorPairUpper,
  ): RefinedAnchorPairUpper => {
    if (!shouldApplyPairCapacitySharedPowerDualCap(entry, refined)) {
      return refined;
    }
    const capped = applyPairCapacitySharedPowerDualCap(
      refined.pairUpper,
      refined.source,
      entry.anchorCandidate.cardIds,
    );
    if (capped.pairUpper >= refined.pairUpper) {
      return refined;
    }
    return {
      ...refined,
      pairUpper: capped.pairUpper,
      source: capped.source,
    };
  };
  const getLocalCandidateKey = (candidate: MedleyTeamCandidate): string => (
    candidate.cardInstanceKeys?.length
      ? candidate.cardInstanceKeys.join(",")
      : candidate.cardIds.join(",")
  );
  const extendLocalPairSlotCandidates = (slotIndex: number, targetPeekUpperBound: number): void => {
    if (!shouldUseLocalPairSlotExtension || !Number.isFinite(targetPeekUpperBound)) {
      return;
    }
    const isLeftSlot = slotIndex === leftSlotIndex;
    const candidates = isLeftSlot ? leftCandidates : rightCandidates;
    const peekBefore = isLeftSlot ? leftPeekUpperBound : rightPeekUpperBound;
    if (!Number.isFinite(peekBefore) || peekBefore <= targetPeekUpperBound) {
      return;
    }

    const extensionStartedAt = performance.now();
    const extensionDeadlineAt = Math.min(localDeadlineAt, extensionStartedAt + localPairSlotExtensionTimeboxMs);
    const candidateKeys = new Set(candidates.map(getLocalCandidateKey));
    let addedCandidateCount = 0;
    let abortReason: string | null = null;
    const extensionGenerator = createMedleyExactSlotCandidateGenerator(
      slots[slotIndex],
      server,
      perfectRate,
      stats,
      profiling,
      () => performance.now() >= deadlineAt,
      deadlineAt,
      Math.max(1, Math.trunc(options.targetedPairBnbSlotSolveNodeLimit ?? 1_000_000)),
    );
    try {
      while (extensionGenerator.peekUpperBound() > targetPeekUpperBound) {
        if (performance.now() >= extensionDeadlineAt) {
          abortReason = "timebox";
          break;
        }
        if (addedCandidateCount >= localPairSlotExtensionMaxCandidates) {
          abortReason = "candidate-limit";
          break;
        }
        const candidate = extensionGenerator.next(targetPeekUpperBound);
        if (!candidate) {
          abortReason = extensionGenerator.hasAborted() ? "generator-abort" : null;
          break;
        }
        const key = getLocalCandidateKey(candidate);
        if (candidateKeys.has(key)) {
          continue;
        }
        candidateKeys.add(key);
        candidates.push(candidate);
        addedCandidateCount += 1;
      }
      const peekAfter = extensionGenerator.peekUpperBound();
      if (isLeftSlot) {
        leftCandidates = candidates;
        leftPeekUpperBound = peekAfter;
      } else {
        rightCandidates = candidates;
        rightPeekUpperBound = peekAfter;
      }
      sortMedleyCandidates(candidates);
      profiling.exactCandidateJoinLastAnchorFrontierCheapUpperLocalPairExtensionSlotIndex = slotIndex;
      profiling.exactCandidateJoinLastAnchorFrontierCheapUpperLocalPairExtensionAddedCandidateCount = (
        addedCandidateCount
      );
      profiling.exactCandidateJoinLastAnchorFrontierCheapUpperLocalPairExtensionCandidateCount = candidates.length;
      profiling.exactCandidateJoinLastAnchorFrontierCheapUpperLocalPairExtensionPeekBefore = Math.round(peekBefore);
      profiling.exactCandidateJoinLastAnchorFrontierCheapUpperLocalPairExtensionPeekAfter = (
        Number.isFinite(peekAfter) ? Math.round(peekAfter) : null
      );
      profiling.exactCandidateJoinLastAnchorFrontierCheapUpperLocalPairExtensionElapsedMs = Math.round(
        performance.now() - extensionStartedAt,
      );
      profiling.exactCandidateJoinLastAnchorFrontierCheapUpperLocalPairExtensionAbortReason = abortReason;
    } finally {
      extensionGenerator.release();
    }
  };
  if (shouldUseLocalPairSlotExtension) {
    const anchorBestPossible = Math.max(
      finiteScore(anchorCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY),
      finiteScore(anchorPeekUpperBound),
    );
    const leftBestPossible = Math.max(
      finiteScore(leftCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY),
      finiteScore(leftPeekUpperBound),
    );
    const rightBestPossible = Math.max(
      finiteScore(rightCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY),
      finiteScore(rightPeekUpperBound),
    );
    const leftTargetPeek = incumbentScore - anchorBestPossible - rightBestPossible;
    const rightTargetPeek = incumbentScore - anchorBestPossible - leftBestPossible;
    const extensionOrder = [
      { slotIndex: leftSlotIndex, peek: finiteScore(leftPeekUpperBound), target: leftTargetPeek },
      { slotIndex: rightSlotIndex, peek: finiteScore(rightPeekUpperBound), target: rightTargetPeek },
    ].sort((left, right) => (right.peek - right.target) - (left.peek - left.target));
    const forcedSlotIndex = (
      options.localPairSlotExtensionSlotIndex !== null
      && options.localPairSlotExtensionSlotIndex !== undefined
      && Number.isFinite(options.localPairSlotExtensionSlotIndex)
    )
      ? Math.trunc(options.localPairSlotExtensionSlotIndex)
      : null;
    const entry = (
      forcedSlotIndex === leftSlotIndex || forcedSlotIndex === rightSlotIndex
        ? extensionOrder.find((current) => current.slotIndex === forcedSlotIndex)
        : undefined
    ) ?? extensionOrder.find((current) => current.peek > current.target);
    if (entry) {
      extendLocalPairSlotCandidates(entry.slotIndex, entry.target);
    }
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperOtherSlotCandidateCounts = pairSlotIndices.map(
      (slotIndex) => (slotIndex === leftSlotIndex ? leftCandidates.length : rightCandidates.length),
    );
  }
  const leftAvailabilityQuery = buildMedleyExactCandidateSlotAvailabilityQuery(leftCandidates);
  const rightAvailabilityQuery = buildMedleyExactCandidateSlotAvailabilityQuery(rightCandidates);
  const buildResultFromAnchorAndPairCandidates = (
    anchorCandidate: MedleyTeamCandidate,
    leftCandidate: MedleyTeamCandidate,
    rightCandidate: MedleyTeamCandidate,
  ): BandoriMedleyTeamSearchResult | null => {
    const anchorResultCandidate = hydrateMedleyExactCandidateForResult(
      slots[anchorSlotIndex],
      anchorCandidate,
      server,
      perfectRate,
      stats,
      profiling,
    );
    const leftResultCandidate = hydrateMedleyExactCandidateForResult(
      slots[leftSlotIndex],
      leftCandidate,
      server,
      perfectRate,
      stats,
      profiling,
    );
    const rightResultCandidate = hydrateMedleyExactCandidateForResult(
      slots[rightSlotIndex],
      rightCandidate,
      server,
      perfectRate,
      stats,
      profiling,
    );
    if (!anchorResultCandidate || !leftResultCandidate || !rightResultCandidate) {
      return null;
    }
    const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
    selectedBySong[slots[anchorSlotIndex].songIndex] = anchorResultCandidate;
    selectedBySong[slots[leftSlotIndex].songIndex] = leftResultCandidate;
    selectedBySong[slots[rightSlotIndex].songIndex] = rightResultCandidate;
    return buildMedleyResult(slots, selectedBySong, configuration);
  };
  const estimatePairUpperForAnchor = (anchorCandidate: MedleyTeamCandidate): {
    upperBound: number;
    source: string;
    generatedPairUpper: number;
    leftUnseenUpper: number;
    rightUnseenUpper: number;
    leftGeneratedCandidate: MedleyTeamCandidate | null;
    rightGeneratedCandidate: MedleyTeamCandidate | null;
  } => {
    const leftGeneratedCandidate = findBestAvailableMedleyExactCandidateExcludingCardIds(
      leftAvailabilityQuery,
      anchorCandidate.cardIds,
    );
    const rightGeneratedCandidate = findBestAvailableMedleyExactCandidateExcludingCardIds(
      rightAvailabilityQuery,
      anchorCandidate.cardIds,
    );
    const leftGeneratedScore = finiteScore(leftGeneratedCandidate?.result.score ?? Number.NEGATIVE_INFINITY);
    const rightGeneratedScore = finiteScore(rightGeneratedCandidate?.result.score ?? Number.NEGATIVE_INFINITY);
    const leftBestPossible = Math.max(leftGeneratedScore, finiteScore(leftPeekUpperBound));
    const rightBestPossible = Math.max(rightGeneratedScore, finiteScore(rightPeekUpperBound));
    const generatedPairUpper = combineScores(leftGeneratedScore, rightGeneratedScore);
    const leftUnseenUpper = combineScores(finiteScore(leftPeekUpperBound), rightBestPossible);
    const rightUnseenUpper = combineScores(finiteScore(rightPeekUpperBound), leftBestPossible);
    const rawUpperBound = Math.max(generatedPairUpper, leftUnseenUpper, rightUnseenUpper);
    const rawSource = rawUpperBound === generatedPairUpper
      ? "generated-pair"
      : rawUpperBound === leftUnseenUpper
        ? "left-unseen"
        : rawUpperBound === rightUnseenUpper
          ? "right-unseen"
          : "pair-capacity";
    const capped = applyPairCapacityCap(rawUpperBound, rawSource, anchorCandidate.cardIds);
    return {
      upperBound: capped.pairUpper,
      source: capped.source,
      generatedPairUpper,
      leftUnseenUpper,
      rightUnseenUpper,
      leftGeneratedCandidate,
      rightGeneratedCandidate,
    };
  };
  const pairUpperBySingleBannedCardId = new Map<number, number>();
  const pairUpperByBannedCardSetKey = new Map<string, number>();
  let suffixCoverPairUpperQuery: MedleyExactCandidatePairUpperQuery | null = null;
  const getSuffixCoverPairUpperQuery = (): MedleyExactCandidatePairUpperQuery => {
    suffixCoverPairUpperQuery ??= buildMedleyExactCandidatePairUpperQuery(leftCandidates, rightCandidates);
    return suffixCoverPairUpperQuery;
  };
  const getBannedCardSetKey = (cardIds: readonly number[]): string => (
    [...cardIds].sort((left, right) => left - right).join(",")
  );
  const estimatePairUpperExcludingSingleCardId = (cardId: number): number => {
    const cached = pairUpperBySingleBannedCardId.get(cardId);
    if (cached !== undefined) {
      return cached;
    }
    const bannedCardIds = [cardId];
    const leftGeneratedCandidate = findBestAvailableMedleyExactCandidateExcludingCardIds(
      leftAvailabilityQuery,
      bannedCardIds,
    );
    const rightGeneratedCandidate = findBestAvailableMedleyExactCandidateExcludingCardIds(
      rightAvailabilityQuery,
      bannedCardIds,
    );
    const leftGeneratedScore = finiteScore(leftGeneratedCandidate?.result.score ?? Number.NEGATIVE_INFINITY);
    const rightGeneratedScore = finiteScore(rightGeneratedCandidate?.result.score ?? Number.NEGATIVE_INFINITY);
    const leftLimitedPeekUpperBound = Math.min(
      finiteScore(leftPeekUpperBound),
      estimateSlotUpperExcludingCardIds(leftSlotIndex, [bannedCardIds]),
    );
    const rightLimitedPeekUpperBound = Math.min(
      finiteScore(rightPeekUpperBound),
      estimateSlotUpperExcludingCardIds(rightSlotIndex, [bannedCardIds]),
    );
    const leftBestPossible = Math.max(leftGeneratedScore, leftLimitedPeekUpperBound);
    const rightBestPossible = Math.max(rightGeneratedScore, rightLimitedPeekUpperBound);
    const upperBound = Math.max(
      combineScores(leftGeneratedScore, rightGeneratedScore),
      combineScores(leftLimitedPeekUpperBound, rightBestPossible),
      combineScores(rightLimitedPeekUpperBound, leftBestPossible),
    );
    const cappedUpperBound = capPairUpper(upperBound, bannedCardIds);
    const normalizedUpperBound = Number.isFinite(cappedUpperBound) ? cappedUpperBound : Number.NEGATIVE_INFINITY;
    pairUpperBySingleBannedCardId.set(cardId, normalizedUpperBound);
    return normalizedUpperBound;
  };
  const estimatePairUpperExcludingAnchorCardSet = (
    anchorCandidate: MedleyTeamCandidate,
    currentSuffixUpperBound: number,
  ): number => {
    const key = getBannedCardSetKey(anchorCandidate.cardIds);
    const cached = pairUpperByBannedCardSetKey.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const leftGeneratedCandidate = findBestAvailableMedleyExactCandidateExcludingCardIds(
      leftAvailabilityQuery,
      anchorCandidate.cardIds,
    );
    const rightGeneratedCandidate = findBestAvailableMedleyExactCandidateExcludingCardIds(
      rightAvailabilityQuery,
      anchorCandidate.cardIds,
    );
    const leftGeneratedScore = finiteScore(leftGeneratedCandidate?.result.score ?? Number.NEGATIVE_INFINITY);
    const rightGeneratedScore = finiteScore(rightGeneratedCandidate?.result.score ?? Number.NEGATIVE_INFINITY);
    const leftLimitedPeekUpperBound = Math.min(
      finiteScore(leftPeekUpperBound),
      estimateSlotUpperExcludingCardIds(leftSlotIndex, [anchorCandidate.cardIds]),
    );
    const rightLimitedPeekUpperBound = Math.min(
      finiteScore(rightPeekUpperBound),
      estimateSlotUpperExcludingCardIds(rightSlotIndex, [anchorCandidate.cardIds]),
    );
    const leftBestPossible = Math.max(leftGeneratedScore, leftLimitedPeekUpperBound);
    const rightBestPossible = Math.max(rightGeneratedScore, rightLimitedPeekUpperBound);
    const relevantTotalThreshold = Math.max(
      incumbentScore,
      processedUpperMax,
      currentSuffixUpperBound,
    );
    const relevantPairThreshold = Number.isFinite(relevantTotalThreshold)
      ? relevantTotalThreshold - anchorCandidate.result.score
      : Number.NEGATIVE_INFINITY;
    const generatedPairUpper = Math.max(
      finiteScore(estimateGeneratedMedleyExactCandidatePairUpperExcludingCardIds(
        getSuffixCoverPairUpperQuery(),
        anchorCandidate.cardIds,
        relevantPairThreshold,
        profiling,
      )),
      finiteScore(relevantPairThreshold),
    );
    const upperBound = Math.max(
      generatedPairUpper,
      combineScores(leftLimitedPeekUpperBound, rightBestPossible),
      combineScores(rightLimitedPeekUpperBound, leftBestPossible),
    );
    const cappedUpperBound = capPairUpper(upperBound, anchorCandidate.cardIds);
    const normalizedUpperBound = Number.isFinite(cappedUpperBound) ? cappedUpperBound : Number.NEGATIVE_INFINITY;
    pairUpperByBannedCardSetKey.set(key, normalizedUpperBound);
    return normalizedUpperBound;
  };
  const estimateGeneratedAnchorSuffixCoverUpper = (
    startAnchorIndex: number | null,
  ): {
    upperBound: number | null;
    candidateCount: number;
    distinctCardCount: number;
    distinctCardSetCount: number;
    elapsedMs: number;
    abortReason: string | null;
  } => {
    if (!shouldUseSuffixCover || startAnchorIndex === null || startAnchorIndex >= anchorCandidates.length) {
      return {
        upperBound: null,
        candidateCount: 0,
        distinctCardCount: 0,
        distinctCardSetCount: 0,
        elapsedMs: 0,
        abortReason: null,
      };
    }
    const suffixCoverStartedAt = performance.now();
    if (suffixCoverStartedAt >= localDeadlineAt) {
      return {
        upperBound: null,
        candidateCount: 0,
        distinctCardCount: pairUpperBySingleBannedCardId.size,
        distinctCardSetCount: pairUpperByBannedCardSetKey.size,
        elapsedMs: 0,
        abortReason: "timebox",
      };
    }
    let upperBound = Number.NEGATIVE_INFINITY;
    let candidateCount = 0;
    for (let index = startAnchorIndex; index < anchorCandidates.length; index += 1) {
      if (performance.now() >= localDeadlineAt) {
        return {
          upperBound: null,
          candidateCount,
          distinctCardCount: pairUpperBySingleBannedCardId.size,
          distinctCardSetCount: pairUpperByBannedCardSetKey.size,
          elapsedMs: performance.now() - suffixCoverStartedAt,
          abortReason: "timebox",
        };
      }
      const anchorCandidate = anchorCandidates[index];
      let coveredPairUpper = pairUpperBound;
      if (shouldUseMultiCardSuffixCover) {
        coveredPairUpper = Math.min(
          coveredPairUpper,
          estimatePairUpperExcludingAnchorCardSet(anchorCandidate, upperBound),
        );
      } else {
        for (const cardId of anchorCandidate.cardIds) {
          coveredPairUpper = Math.min(
            coveredPairUpper,
            estimatePairUpperExcludingSingleCardId(cardId),
          );
        }
      }
      if (Number.isFinite(coveredPairUpper)) {
        upperBound = Math.max(upperBound, anchorCandidate.result.score + coveredPairUpper);
      }
      candidateCount += 1;
    }
    return {
      upperBound: Number.isFinite(upperBound) ? upperBound : null,
      candidateCount,
      distinctCardCount: pairUpperBySingleBannedCardId.size,
      distinctCardSetCount: pairUpperByBannedCardSetKey.size,
      elapsedMs: performance.now() - suffixCoverStartedAt,
      abortReason: null,
    };
  };
  type GeneratedAnchorSuffixGeneratedPairJoinEstimate = {
    upperBound: number | null;
    anchorCount: number;
    pairRecordCount: number;
    elapsedMs: number;
    abortReason: string | null;
    result: BandoriMedleyTeamSearchResult | null;
    maxScoreUpper: number | null;
    maxAnchorScore: number | null;
    maxPairScoreOnly: number | null;
    maxPairFullScore: number | null;
    maxPairScoreSlack: number | null;
    maxAnchorCardIds: number[] | null;
    maxLeftCardIds: number[] | null;
    maxRightCardIds: number[] | null;
    maxLeftIndex: number | null;
    maxRightIndex: number | null;
    maxPairRecordIndex: number | null;
  };
  const buildGeneratedAnchorSuffixGeneratedPairJoinEstimate = (
    values: Partial<GeneratedAnchorSuffixGeneratedPairJoinEstimate>,
  ): GeneratedAnchorSuffixGeneratedPairJoinEstimate => ({
    upperBound: null,
    anchorCount: 0,
    pairRecordCount: 0,
    elapsedMs: 0,
    abortReason: null,
    result: null,
    maxScoreUpper: null,
    maxAnchorScore: null,
    maxPairScoreOnly: null,
    maxPairFullScore: null,
    maxPairScoreSlack: null,
    maxAnchorCardIds: null,
    maxLeftCardIds: null,
    maxRightCardIds: null,
    maxLeftIndex: null,
    maxRightIndex: null,
    maxPairRecordIndex: null,
    ...values,
  });
  const estimateGeneratedAnchorSuffixGeneratedPairJoinUpper = (
    startAnchorIndex: number | null,
    targetUpperBound = incumbentScore,
  ): GeneratedAnchorSuffixGeneratedPairJoinEstimate => {
    if (
      !shouldUseSuffixGeneratedPairJoin
      || startAnchorIndex === null
      || startAnchorIndex >= anchorCandidates.length
    ) {
      return buildGeneratedAnchorSuffixGeneratedPairJoinEstimate({});
    }
    const joinStartedAt = performance.now();
    if (joinStartedAt >= localDeadlineAt) {
      return buildGeneratedAnchorSuffixGeneratedPairJoinEstimate({
        abortReason: "timebox",
      });
    }
    const suffixAnchorCandidates = anchorCandidates.slice(startAnchorIndex);
    if (suffixAnchorCandidates.length === 0) {
      return buildGeneratedAnchorSuffixGeneratedPairJoinEstimate({
        anchorCount: 0,
        pairRecordCount: 0,
        elapsedMs: performance.now() - joinStartedAt,
      });
    }
    const maxAnchorScore = suffixAnchorCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY;
    if (!Number.isFinite(maxAnchorScore)) {
      return buildGeneratedAnchorSuffixGeneratedPairJoinEstimate({
        anchorCount: suffixAnchorCandidates.length,
        pairRecordCount: 0,
        elapsedMs: performance.now() - joinStartedAt,
      });
    }
    const effectiveTargetUpperBound = Math.max(incumbentScore, targetUpperBound);
    const pairRecordThreshold = effectiveTargetUpperBound - maxAnchorScore;
    const anchorAvailabilityQuery = buildMedleyExactCandidateSlotAvailabilityQuery(suffixAnchorCandidates);
    const bestRightScore = rightCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY;
    const frontierHeap: MedleyExactCandidatePairFrontierHeapNode[] = [];
    for (let leftIndex = 0; leftIndex < leftCandidates.length; leftIndex += 1) {
      const score = leftCandidates[leftIndex].result.score + bestRightScore;
      if (score <= pairRecordThreshold) {
        break;
      }
      pushMedleyExactCandidatePairFrontierHeapNode(frontierHeap, {
        score,
        leftIndex,
        rightIndex: 0,
      });
    }
    let upperBound = Number.NEGATIVE_INFINITY;
    let pairRecordCount = 0;
    let bestResult: BandoriMedleyTeamSearchResult | null = null;
    let maxScoreUpper = Number.NEGATIVE_INFINITY;
    let maxAnchorScoreValue: number | null = null;
    let maxPairScoreOnly: number | null = null;
    let maxPairFullScore: number | null = null;
    let maxPairScoreSlack: number | null = null;
    let maxAnchorCardIds: number[] | null = null;
    let maxLeftCardIds: number[] | null = null;
    let maxRightCardIds: number[] | null = null;
    let maxLeftIndex: number | null = null;
    let maxRightIndex: number | null = null;
    let maxPairRecordIndex: number | null = null;
    const pairCardIds: number[] = [];
    while (frontierHeap.length > 0) {
      if (performance.now() >= localDeadlineAt) {
        frontierHeap.length = 0;
        return buildGeneratedAnchorSuffixGeneratedPairJoinEstimate({
          anchorCount: suffixAnchorCandidates.length,
          pairRecordCount,
          elapsedMs: performance.now() - joinStartedAt,
          abortReason: "timebox",
          result: bestResult,
          maxScoreUpper: Number.isFinite(maxScoreUpper) ? maxScoreUpper : null,
          maxAnchorScore: maxAnchorScoreValue,
          maxPairScoreOnly,
          maxPairFullScore,
          maxPairScoreSlack,
          maxAnchorCardIds,
          maxLeftCardIds,
          maxRightCardIds,
          maxLeftIndex,
          maxRightIndex,
          maxPairRecordIndex,
        });
      }
      const node = popMedleyExactCandidatePairFrontierHeapNode(frontierHeap);
      if (!node || node.score <= pairRecordThreshold) {
        break;
      }
      const leftCandidate = leftCandidates[node.leftIndex];
      const rightCandidate = rightCandidates[node.rightIndex];
      if (leftCandidate && rightCandidate) {
        if (!medleyExactCandidatesOverlap(leftCandidate, rightCandidate)) {
          pairRecordCount += 1;
          const leftResultCandidate = hydrateMedleyExactCandidateForResult(
            slots[leftSlotIndex],
            leftCandidate,
            server,
            perfectRate,
            stats,
            profiling,
          );
          const rightResultCandidate = hydrateMedleyExactCandidateForResult(
            slots[rightSlotIndex],
            rightCandidate,
            server,
            perfectRate,
            stats,
            profiling,
          );
          const pairUpper = leftResultCandidate && rightResultCandidate
            ? leftResultCandidate.result.score + rightResultCandidate.result.score
            : node.score;
          const pairScoreOnly = leftCandidate.result.score + rightCandidate.result.score;
          const pairFullScore = leftResultCandidate && rightResultCandidate ? pairUpper : null;
          pairCardIds.length = 0;
          for (const cardId of leftCandidate.cardIds) {
            pairCardIds.push(cardId);
          }
          for (const cardId of rightCandidate.cardIds) {
            pairCardIds.push(cardId);
          }
          const anchorCandidate = findBestAvailableMedleyExactCandidateExcludingCardIds(
            anchorAvailabilityQuery,
            pairCardIds,
          );
          if (anchorCandidate) {
            const scoreUpper = pairUpper + anchorCandidate.result.score;
            if (scoreUpper > maxScoreUpper) {
              maxScoreUpper = scoreUpper;
              maxAnchorScoreValue = anchorCandidate.result.score;
              maxPairScoreOnly = pairScoreOnly;
              maxPairFullScore = pairFullScore;
              maxPairScoreSlack = pairFullScore !== null ? pairScoreOnly - pairFullScore : null;
              maxAnchorCardIds = [...anchorCandidate.cardIds];
              maxLeftCardIds = [...leftCandidate.cardIds];
              maxRightCardIds = [...rightCandidate.cardIds];
              maxLeftIndex = node.leftIndex;
              maxRightIndex = node.rightIndex;
              maxPairRecordIndex = pairRecordCount;
            }
            upperBound = Math.max(upperBound, scoreUpper);
            if (scoreUpper > Math.max(incumbentScore, bestResult?.score ?? Number.NEGATIVE_INFINITY)) {
              const result = buildResultFromAnchorAndPairCandidates(
                anchorCandidate,
                leftCandidate,
                rightCandidate,
              );
              if (result) {
                observeEvaluatedResult?.(result);
                bestResult = compareMedleyResultLike(bestResult, result);
              }
            }
          }
        }
        const nextRightIndex = node.rightIndex + 1;
        const nextRightCandidate = rightCandidates[nextRightIndex];
        if (nextRightCandidate) {
          const nextScore = leftCandidate.result.score + nextRightCandidate.result.score;
          if (nextScore > pairRecordThreshold) {
            pushMedleyExactCandidatePairFrontierHeapNode(frontierHeap, {
              score: nextScore,
              leftIndex: node.leftIndex,
              rightIndex: nextRightIndex,
            });
          }
        }
      }
    }
    frontierHeap.length = 0;
    return buildGeneratedAnchorSuffixGeneratedPairJoinEstimate({
      upperBound: Math.max(
        Number.isFinite(upperBound) ? upperBound : Number.NEGATIVE_INFINITY,
        effectiveTargetUpperBound,
      ),
      anchorCount: suffixAnchorCandidates.length,
      pairRecordCount,
      elapsedMs: performance.now() - joinStartedAt,
      abortReason: null,
      result: bestResult,
      maxScoreUpper: Number.isFinite(maxScoreUpper) ? maxScoreUpper : null,
      maxAnchorScore: maxAnchorScoreValue,
      maxPairScoreOnly,
      maxPairFullScore,
      maxPairScoreSlack,
      maxAnchorCardIds,
      maxLeftCardIds,
      maxRightCardIds,
      maxLeftIndex,
      maxRightIndex,
      maxPairRecordIndex,
    });
  };
  const getResidualUpperBoundForProcessedMax = (
    processedMax: number,
    nextAnchorScore: number | null,
    generatedSuffixCoveredUpperBound: number | null = null,
  ): number | null => {
    const unprocessedPairUpperBound = capPairUpper(pairUpperBound, []);
    const unprocessedGeneratedUpperBound = generatedSuffixCoveredUpperBound !== null
      ? generatedSuffixCoveredUpperBound
      : Number.isFinite(nextAnchorScore ?? Number.NEGATIVE_INFINITY) && Number.isFinite(unprocessedPairUpperBound)
        ? (nextAnchorScore ?? Number.NEGATIVE_INFINITY) + unprocessedPairUpperBound
        : Number.NEGATIVE_INFINITY;
    const unprocessedPeekUpperBound = Number.isFinite(finiteScore(anchorPeekUpperBound))
      && Number.isFinite(unprocessedPairUpperBound)
      ? finiteScore(anchorPeekUpperBound) + unprocessedPairUpperBound
      : Number.NEGATIVE_INFINITY;
    const unprocessedUpperBound = Math.max(unprocessedGeneratedUpperBound, unprocessedPeekUpperBound);
    const residualUpperBound = Math.max(processedMax, unprocessedUpperBound);
    return Number.isFinite(residualUpperBound) ? residualUpperBound : null;
  };
  const getResidualUpperBound = (
    nextAnchorScore: number | null,
    generatedSuffixCoveredUpperBound: number | null = null,
  ): number | null => getResidualUpperBoundForProcessedMax(
    processedUpperMax,
    nextAnchorScore,
    generatedSuffixCoveredUpperBound,
  );
  const getUnprocessedUpperBound = (
    nextAnchorScore: number | null,
    generatedSuffixCoveredUpperBound: number | null,
  ): {
    upperBound: number;
    anchorScore: number | null;
    pairUpper: number | null;
    source: string | null;
  } => {
    const unprocessedPairUpperBound = capPairUpper(pairUpperBound, []);
    const generatedFallbackUpperBound = Number.isFinite(nextAnchorScore ?? Number.NEGATIVE_INFINITY)
      && Number.isFinite(unprocessedPairUpperBound)
      ? (nextAnchorScore ?? Number.NEGATIVE_INFINITY) + unprocessedPairUpperBound
      : Number.NEGATIVE_INFINITY;
    const generatedUpperBound = generatedSuffixCoveredUpperBound ?? generatedFallbackUpperBound;
    const peekAnchorUpperBound = finiteScore(anchorPeekUpperBound);
    const peekUpperBound = Number.isFinite(peekAnchorUpperBound) && Number.isFinite(pairUpperBound)
      ? peekAnchorUpperBound + pairUpperBound
      : Number.NEGATIVE_INFINITY;
    if (generatedUpperBound >= peekUpperBound) {
      return {
        upperBound: generatedUpperBound,
        anchorScore: nextAnchorScore,
        pairUpper: generatedSuffixCoveredUpperBound !== null ? null : unprocessedPairUpperBound,
        source: generatedSuffixCoveredUpperBound !== null
          ? "unprocessed-anchor-suffix-cover"
          : "unprocessed-anchor",
      };
    }
    return {
      upperBound: peekUpperBound,
      anchorScore: Number.isFinite(peekAnchorUpperBound) ? peekAnchorUpperBound : null,
      pairUpper: pairUpperBound,
      source: "unprocessed-generator-peek",
    };
  };
  const recordProcessedUpperMax = (
    anchorScore: number,
    pairUpper: number,
    source: string,
    generatedPairUpper: number,
    leftUnseenUpper: number,
    rightUnseenUpper: number,
    leftGeneratedCandidate: MedleyTeamCandidate | null,
    rightGeneratedCandidate: MedleyTeamCandidate | null,
    anchorCandidate: MedleyTeamCandidate | null = null,
  ): void => {
    const totalUpper = anchorScore + pairUpper;
    if (totalUpper > processedUpperMax) {
      processedUpperMax = totalUpper;
      processedUpperMaxSource = source;
      processedUpperMaxAnchorScore = anchorScore;
      processedUpperMaxPairUpper = pairUpper;
      processedUpperMaxGeneratedPairUpper = Number.isFinite(generatedPairUpper) ? generatedPairUpper : null;
      processedUpperMaxLeftUnseenUpper = Number.isFinite(leftUnseenUpper) ? leftUnseenUpper : null;
      processedUpperMaxRightUnseenUpper = Number.isFinite(rightUnseenUpper) ? rightUnseenUpper : null;
      processedUpperMaxAnchorCandidate = anchorCandidate;
      processedUpperMaxLeftGeneratedCandidate = leftGeneratedCandidate;
      processedUpperMaxRightGeneratedCandidate = rightGeneratedCandidate;
    }
  };
  const resetProcessedUpperMax = (): void => {
    processedUpperMax = Number.NEGATIVE_INFINITY;
    processedUpperMaxSource = null;
    processedUpperMaxAnchorScore = null;
    processedUpperMaxPairUpper = null;
    processedUpperMaxGeneratedPairUpper = null;
    processedUpperMaxLeftUnseenUpper = null;
    processedUpperMaxRightUnseenUpper = null;
    processedUpperMaxAnchorCandidate = null;
    processedUpperMaxLeftGeneratedCandidate = null;
    processedUpperMaxRightGeneratedCandidate = null;
  };
  const recordProcessedEntryUpperMax = (
    entry: (typeof processedAnchorUpperEntries)[number],
  ): void => {
    const refined = refinedAnchorPairUpperByCandidate.get(entry.anchorCandidate);
    if (refined) {
      recordProcessedUpperMax(
        entry.anchorScore,
        refined.pairUpper,
        refined.source,
        refined.generatedPairUpper,
        refined.leftUnseenUpper,
        refined.rightUnseenUpper,
        null,
        null,
        entry.anchorCandidate,
      );
      return;
    }
    recordProcessedUpperMax(
      entry.anchorScore,
      entry.pairUpper,
      entry.source,
      entry.generatedPairUpper,
      entry.leftUnseenUpper,
      entry.rightUnseenUpper,
      entry.leftGeneratedCandidate,
      entry.rightGeneratedCandidate,
      entry.anchorCandidate,
    );
  };
  const rebuildProcessedUpperMaxFromEntries = (): void => {
    resetProcessedUpperMax();
    for (const entry of processedAnchorUpperEntries) {
      recordProcessedEntryUpperMax(entry);
    }
  };
  let streamAnchorTailCandidateCount = 0;
  let streamAnchorTailPeekBefore: number | null = null;
  let streamAnchorTailPeekAfter: number | null = null;
  let streamAnchorTailGlobalPeekBefore: number | null = null;
  let streamAnchorTailGlobalPeekAfter: number | null = null;
  let streamAnchorTailUpperBound = Number.NEGATIVE_INFINITY;
  let streamAnchorTailElapsedMs = 0;
  let streamAnchorTailAbortReason: string | null = null;
  const streamAnchorTailCandidates = (): void => {
    if (
      !shouldStreamAnchorTail
      || streamAnchorTailMaxCandidates <= 0
      || streamAnchorTailTimeboxMs <= 0
      || !Number.isFinite(pairUpperBound)
      || stats.memoryLimited
    ) {
      return;
    }
    const streamGenerator = generators[anchorSlotIndex];
    const streamStartedAt = performance.now();
    const streamDeadlineAt = Math.min(localDeadlineAt, streamStartedAt + streamAnchorTailTimeboxMs);
    streamAnchorTailPeekBefore = finiteScore(streamGenerator.peekUpperBound());
    streamAnchorTailGlobalPeekBefore = streamGenerator.peekGlobalUpperBound();
    while (streamAnchorTailCandidateCount < streamAnchorTailMaxCandidates) {
      if (performance.now() >= streamDeadlineAt) {
        streamAnchorTailAbortReason = "timebox";
        break;
      }
      if (stats.timedOut || stats.memoryLimited) {
        streamAnchorTailAbortReason = stats.memoryLimited ? "memory-limited" : "global-timeout";
        break;
      }
      const peekUpperBound = finiteScore(streamGenerator.peekUpperBound());
      if (!Number.isFinite(peekUpperBound)) {
        streamAnchorTailAbortReason = "exhausted";
        break;
      }
      const currentTargetUpperBound = Math.max(
        incumbentScore,
        Number.isFinite(processedUpperMax) ? processedUpperMax : Number.NEGATIVE_INFINITY,
      );
      if (peekUpperBound + pairUpperBound <= currentTargetUpperBound) {
        streamAnchorTailAbortReason = "closed";
        break;
      }
      const streamCutoff = Math.max(
        Number.NEGATIVE_INFINITY,
        currentTargetUpperBound - pairUpperBound,
      );
      const streamGlobalPruning = shouldStreamAnchorTailGlobalPruning
        ? {
          slots,
          remainingSlotIndices: pairSlotIndices,
          scoreCutoff: currentTargetUpperBound,
          candidatesBySlot,
          pairUnseenUpperBound: pairUnseenUpperBound ?? undefined,
          useCapacityComplementUpper: false,
          capacityComplementMargin: MEDLEY_EXACT_CANDIDATE_JOIN_CAPACITY_COMPLEMENT_MARGIN,
        }
        : undefined;
      const candidate = streamGenerator.next(streamCutoff, streamGlobalPruning);
      const globalPeekAfterCandidate = streamGenerator.peekGlobalUpperBound();
      if (globalPeekAfterCandidate !== null && Number.isFinite(globalPeekAfterCandidate)) {
        streamAnchorTailGlobalPeekAfter = globalPeekAfterCandidate;
      }
      if (stats.timedOut || stats.memoryLimited) {
        streamAnchorTailAbortReason = stats.memoryLimited ? "memory-limited" : "global-timeout";
        break;
      }
      if (!candidate) {
        streamAnchorTailAbortReason = (
          globalPeekAfterCandidate !== null
          && Number.isFinite(globalPeekAfterCandidate)
          && globalPeekAfterCandidate <= currentTargetUpperBound
        )
          ? "closed-global"
          : streamGenerator.hasAborted() ? "generator-aborted" : "exhausted";
        break;
      }
      const pairUpperForAnchor = estimatePairUpperForAnchor(candidate);
      streamAnchorTailCandidateCount += 1;
      if (Number.isFinite(pairUpperForAnchor.upperBound)) {
        const anchorUpper = candidate.result.score + pairUpperForAnchor.upperBound;
        streamAnchorTailUpperBound = Math.max(streamAnchorTailUpperBound, anchorUpper);
        recordProcessedUpperMax(
          candidate.result.score,
          pairUpperForAnchor.upperBound,
          pairUpperForAnchor.source,
          pairUpperForAnchor.generatedPairUpper,
          pairUpperForAnchor.leftUnseenUpper,
          pairUpperForAnchor.rightUnseenUpper,
          pairUpperForAnchor.leftGeneratedCandidate,
          pairUpperForAnchor.rightGeneratedCandidate,
          candidate,
        );
      }
    }
    if (
      streamAnchorTailAbortReason === null
      && streamAnchorTailCandidateCount >= streamAnchorTailMaxCandidates
    ) {
      streamAnchorTailAbortReason = "candidate-limit";
    }
    streamAnchorTailPeekAfter = finiteScore(streamGenerator.peekUpperBound());
    streamAnchorTailGlobalPeekAfter = streamGenerator.peekGlobalUpperBound();
    if (streamAnchorTailGlobalPeekAfter !== null && Number.isFinite(streamAnchorTailGlobalPeekAfter)) {
      streamAnchorTailUpperBound = Math.max(streamAnchorTailUpperBound, streamAnchorTailGlobalPeekAfter);
    }
    anchorPeekUpperBound = streamAnchorTailPeekAfter ?? Number.NEGATIVE_INFINITY;
    if (
      streamAnchorTailGlobalPeekAfter !== null
      && Number.isFinite(streamAnchorTailGlobalPeekAfter)
      && Number.isFinite(pairUpperBound)
    ) {
      anchorPeekUpperBound = Math.min(anchorPeekUpperBound, streamAnchorTailGlobalPeekAfter - pairUpperBound);
    }
    streamAnchorTailElapsedMs += performance.now() - streamStartedAt;
  };
  const repairProcessedPairCapacityMaxWithSharedPowerDual = (): void => {
    if (!shouldUsePairCapacitySharedPowerDualLateMaxRepair || processedAnchorUpperEntries.length === 0) {
      return;
    }
    const repairStartedAt = performance.now();
    while (
      processedUpperMaxSource === "pair-capacity"
      && processedUpperMaxAnchorCandidate !== null
      && Number.isFinite(processedUpperMaxPairUpper ?? Number.NEGATIVE_INFINITY)
      && performance.now() + 1000 < localDeadlineAt
    ) {
      const entry = processedAnchorUpperEntries.find(
        (candidateEntry) => candidateEntry.anchorCandidate === processedUpperMaxAnchorCandidate,
      );
      if (!entry) {
        break;
      }
      const refined = refinedAnchorPairUpperByCandidate.get(entry.anchorCandidate) ?? {
        pairUpper: entry.pairUpper,
        source: entry.source,
        generatedPairUpper: entry.generatedPairUpper,
        leftUnseenUpper: entry.leftUnseenUpper,
        rightUnseenUpper: entry.rightUnseenUpper,
      };
      if (refined.source !== "pair-capacity" || !Number.isFinite(refined.pairUpper)) {
        break;
      }
      const targetPairUpper = incumbentScore - entry.anchorScore;
      if (Number.isFinite(targetPairUpper) && refined.pairUpper <= targetPairUpper) {
        break;
      }
      profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualLateRepairAttemptCount = (
        (profiling
          .exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualLateRepairAttemptCount ?? 0) + 1
      );
      const capped = applyPairCapacitySharedPowerDualCap(
        refined.pairUpper,
        refined.source,
        entry.anchorCandidate.cardIds,
        true,
      );
      if (!Number.isFinite(capped.pairUpper) || capped.pairUpper >= refined.pairUpper) {
        break;
      }
      const improvement = refined.pairUpper - capped.pairUpper;
      profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualLateRepairImprovementCount = (
        (profiling
          .exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualLateRepairImprovementCount ?? 0) + 1
      );
      profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualLateRepairBestImprovement =
        Math.max(
          profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualLateRepairBestImprovement
            ?? 0,
          improvement,
        );
      refinedAnchorPairUpperByCandidate.set(entry.anchorCandidate, {
        ...refined,
        pairUpper: capped.pairUpper,
        source: capped.source,
      });
      const upperBefore = processedUpperMax;
      rebuildProcessedUpperMaxFromEntries();
      if (processedUpperMax >= upperBefore) {
        break;
      }
    }
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualLateRepairElapsedMs = Math.round(
      (profiling
        .exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacitySharedPowerDualLateRepairElapsedMs ?? 0)
      + performance.now() - repairStartedAt,
    );
  };
  const hasAnyCardId = (
    candidate: MedleyTeamCandidate,
    cardIds: readonly number[],
  ): boolean => candidate.cardIds.some((cardId) => cardIds.includes(cardId));
  const buildBannedCardIdSet = (cardIdGroups: Array<readonly number[]>): Set<number> => {
    const bannedCardIds = new Set<number>();
    for (const cardIds of cardIdGroups) {
      for (const cardId of cardIds) {
        bannedCardIds.add(cardId);
      }
    }
    return bannedCardIds;
  };
  const estimateSlotUpperExcludingCardIds = (
    slotIndex: number,
    cardIdGroups: Array<readonly number[]>,
  ): number => finiteScore(estimateMedleyExactSlotNodeUpperBound(
    slots[slotIndex],
    [],
    0,
    buildBannedCardIdSet(cardIdGroups),
    0,
    0,
    0,
    profiling,
  ));
  const singleCardSlotUpperByKey = new Map<string, number>();
  const estimateSlotUpperExcludingSingleCardId = (slotIndex: number, cardId: number): number => {
    const key = `${slotIndex}:${cardId}`;
    const cached = singleCardSlotUpperByKey.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const upper = estimateSlotUpperExcludingCardIds(slotIndex, [[cardId]]);
    singleCardSlotUpperByKey.set(key, upper);
    return upper;
  };
  const finiteDiagnostic = (value: number | null | undefined): number | null => (
    value !== null && value !== undefined && Number.isFinite(value) ? value : null
  );
  const recordPairCapacityBreakdownForProcessedMax = (): void => {
    if (!shouldCapturePairCapacityBreakdown || !processedUpperMaxAnchorCandidate) {
      return;
    }
    const breakdownStartedAt = performance.now();
    const bannedCardIds = new Set<number>(processedUpperMaxAnchorCandidate.cardIds);
    const correlatedLeftUpper = estimateMedleySlotBranchScoreUpperBound(
      slots[leftSlotIndex],
      [],
      0,
      bannedCardIds,
      0,
      0,
      0,
      profiling,
      true,
    );
    const correlatedRightUpper = estimateMedleySlotBranchScoreUpperBound(
      slots[rightSlotIndex],
      [],
      0,
      bannedCardIds,
      0,
      0,
      0,
      profiling,
      true,
    );
    const correlatedUpper = combineScores(
      finiteScore(correlatedLeftUpper),
      finiteScore(correlatedRightUpper),
    );
    const fastCapacityUpper = estimateMedleyCapacityAssignmentScoreUpperBound(
      slots,
      pairSlotIndices,
      bannedCardIds,
      profiling,
      true,
      false,
      false,
      false,
      false,
    );
    const basicCapacityUpper = estimateMedleyCapacityAssignmentScoreUpperBound(
      slots,
      pairSlotIndices,
      bannedCardIds,
      profiling,
      true,
      false,
      false,
      false,
      false,
      true,
    );
    const selectedUpper = Math.min(
      Number.isFinite(correlatedUpper) ? correlatedUpper : Number.POSITIVE_INFINITY,
      Number.isFinite(fastCapacityUpper.upperBound) ? fastCapacityUpper.upperBound : Number.POSITIVE_INFINITY,
    );
    const normalizedSelectedUpper = selectedUpper === Number.POSITIVE_INFINITY
      ? Number.NEGATIVE_INFINITY
      : selectedUpper;
    const targetPairUpper = incumbentScore - processedUpperMaxAnchorCandidate.result.score;
    let lagrangianUpper: number | null = null;
    let lagrangianWeight: number | null = null;
    let lagrangianElapsedMs: number | null = null;
    let sharedPowerDualUpper: number | null = null;
    let sharedPowerDualGap: number | null = null;
    let sharedPowerDualLeaderShare: number | null = null;
    let sharedPowerDualLambdaBySlot: [number, number] | null = null;
    let sharedPowerDualElapsedMs: number | null = null;
    let sharedPowerUpper: number | null = null;
    let sharedPowerElapsedMs: number | null = null;
    const pairCardsByCharacter = (
      shouldCapturePairCapacitySharedPowerBreakdown || shouldCapturePairCapacityBreakdown
        ? buildMedleyCapacityCardsByCharacter(
          slots,
          pairSlotIndices,
          bannedCardIds,
        )
        : null
    );
    const lagrangianStartedAt = performance.now();
    const pairSlotCoefficients = pairSlotIndices.map((slotIndex) => (
      estimateMedleySlotSkillCoefficient(slots[slotIndex], bannedCardIds).coefficient
    ));
    if (pairCardsByCharacter && pairSlotCoefficients.every(Number.isFinite)) {
      const cardBoundPowerUpperBySlot = buildMedleyCardBoundPowerUpperBySlot(
        slots,
        pairSlotIndices,
        bannedCardIds,
      );
      const lagrangianEstimate = estimateMedleyCapacityCardBoundLagrangianScoreUpperBound(
        slots,
        pairSlotIndices,
        pairCardsByCharacter,
        pairSlotCoefficients,
        cardBoundPowerUpperBySlot,
        profiling,
      );
      if (lagrangianEstimate !== null && Number.isFinite(lagrangianEstimate.upperBound)) {
        lagrangianUpper = lagrangianEstimate.upperBound;
        lagrangianWeight = lagrangianEstimate.weight;
      }
    }
    lagrangianElapsedMs = performance.now() - lagrangianStartedAt;
    const sharedPowerDualStartedAt = performance.now();
    const sharedPowerDualEstimate = estimateMedleyFastTwoSlotSharedPowerDualScoreUpperBound(
      slots,
      pairSlotIndices,
      bannedCardIds,
    );
    if (sharedPowerDualEstimate !== null && Number.isFinite(sharedPowerDualEstimate.upperBound)) {
      sharedPowerDualUpper = sharedPowerDualEstimate.upperBound;
      sharedPowerDualGap = Number.isFinite(targetPairUpper)
        ? sharedPowerDualEstimate.upperBound - targetPairUpper
        : null;
      sharedPowerDualLeaderShare = sharedPowerDualEstimate.leaderPowerShare;
      sharedPowerDualLambdaBySlot = sharedPowerDualEstimate.lambdaBySlot;
    }
    sharedPowerDualElapsedMs = performance.now() - sharedPowerDualStartedAt;
    if (shouldCapturePairCapacitySharedPowerBreakdown) {
      const sharedPowerStartedAt = performance.now();
      if (pairCardsByCharacter) {
        sharedPowerUpper = estimateMedleyCapacityCardBoundSharedPowerSkillScoreUpperBound(
          slots,
          pairSlotIndices,
          pairCardsByCharacter,
          bannedCardIds,
          profiling,
          {
            allowTwoSlot: true,
            allowBannedCards: true,
            stateBudget: pairCapacitySharedPowerStateBudget,
            deadlineAt: Math.min(deadlineAt, sharedPowerStartedAt + 1000),
          },
        );
      }
      sharedPowerElapsedMs = performance.now() - sharedPowerStartedAt;
    }

    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownTargetPairUpper = (
      finiteDiagnostic(targetPairUpper)
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSelectedUpper = (
      finiteDiagnostic(normalizedSelectedUpper)
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSelectedGap = (
      Number.isFinite(normalizedSelectedUpper) && Number.isFinite(targetPairUpper)
        ? normalizedSelectedUpper - targetPairUpper
        : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownCorrelatedUpper = (
      finiteDiagnostic(correlatedUpper)
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownCorrelatedLeftUpper = (
      finiteDiagnostic(correlatedLeftUpper)
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownCorrelatedRightUpper = (
      finiteDiagnostic(correlatedRightUpper)
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownFastUpper = (
      finiteDiagnostic(fastCapacityUpper.upperBound)
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownFastMode = (
      fastCapacityUpper.mode
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownBasicUpper = (
      finiteDiagnostic(basicCapacityUpper.upperBound)
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownBasicMode = (
      basicCapacityUpper.mode
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownBasicCoefficientUpper = (
      finiteDiagnostic(basicCapacityUpper.coefficientUpperBound)
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownBasicSkillAwareUpper = (
      finiteDiagnostic(basicCapacityUpper.skillAwareUpperBound)
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownLagrangianUpper = (
      finiteDiagnostic(lagrangianUpper)
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownLagrangianGap = (
      lagrangianUpper !== null && Number.isFinite(lagrangianUpper) && Number.isFinite(targetPairUpper)
        ? lagrangianUpper - targetPairUpper
        : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownLagrangianWeight = (
      finiteDiagnostic(lagrangianWeight)
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownLagrangianElapsedMs = (
      Math.round(lagrangianElapsedMs)
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSharedPowerDualUpper = (
      finiteDiagnostic(sharedPowerDualUpper)
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSharedPowerDualGap = (
      finiteDiagnostic(sharedPowerDualGap)
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSharedPowerDualLeaderShare = (
      finiteDiagnostic(sharedPowerDualLeaderShare)
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSharedPowerDualLambdaBySlot = (
      sharedPowerDualLambdaBySlot
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSharedPowerDualElapsedMs = (
      Math.round(sharedPowerDualElapsedMs)
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSharedPowerUpper = (
      finiteDiagnostic(sharedPowerUpper)
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSharedPowerGap = (
      sharedPowerUpper !== null && Number.isFinite(sharedPowerUpper) && Number.isFinite(targetPairUpper)
        ? sharedPowerUpper - targetPairUpper
        : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSharedPowerStateBudget = (
      shouldCapturePairCapacitySharedPowerBreakdown ? pairCapacitySharedPowerStateBudget : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownSharedPowerElapsedMs = (
      sharedPowerElapsedMs !== null ? Math.round(sharedPowerElapsedMs) : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityBreakdownElapsedMs = Math.round(
      performance.now() - breakdownStartedAt,
    );
  };
  const estimatePairAnchorCoverUpper = (
    startAnchorIndex: number | null,
  ): {
    upperBound: number | null;
    pairCount: number;
    distinctCardCount: number;
    elapsedMs: number;
    abortReason: string | null;
  } => {
    if (
      !shouldUsePairAnchorCover
      || startAnchorIndex === null
      || startAnchorIndex >= anchorCandidates.length
    ) {
      return {
        upperBound: null,
        pairCount: 0,
        distinctCardCount: 0,
        elapsedMs: 0,
        abortReason: null,
      };
    }
    const coverStartedAt = performance.now();
    if (coverStartedAt >= localDeadlineAt) {
      return {
        upperBound: null,
        pairCount: 0,
        distinctCardCount: 0,
        elapsedMs: 0,
        abortReason: "timebox",
      };
    }
    const baseAnchorUpper = Math.max(
      anchorCandidates[startAnchorIndex]?.result.score ?? Number.NEGATIVE_INFINITY,
      finiteScore(anchorPeekUpperBound),
    );
    const bestRightScore = rightCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY;
    if (!Number.isFinite(baseAnchorUpper) || !Number.isFinite(bestRightScore)) {
      return {
        upperBound: null,
        pairCount: 0,
        distinctCardCount: 0,
        elapsedMs: performance.now() - coverStartedAt,
        abortReason: null,
      };
    }
    const frontierHeap: MedleyExactCandidatePairFrontierHeapNode[] = [];
    let upperBound = incumbentScore;
    for (let leftIndex = 0; leftIndex < leftCandidates.length; leftIndex += 1) {
      const score = leftCandidates[leftIndex].result.score + bestRightScore;
      if (score + baseAnchorUpper <= upperBound) {
        break;
      }
      pushMedleyExactCandidatePairFrontierHeapNode(frontierHeap, {
        score,
        leftIndex,
        rightIndex: 0,
      });
    }
    let pairCount = 0;
    const coveredCardIds = new Set<number>();
    while (frontierHeap.length > 0) {
      if (performance.now() >= localDeadlineAt) {
        frontierHeap.length = 0;
        return {
          upperBound: null,
          pairCount,
          distinctCardCount: coveredCardIds.size,
          elapsedMs: performance.now() - coverStartedAt,
          abortReason: "timebox",
        };
      }
      if (pairCount >= pairAnchorCoverMaxPairs) {
        frontierHeap.length = 0;
        return {
          upperBound: null,
          pairCount,
          distinctCardCount: coveredCardIds.size,
          elapsedMs: performance.now() - coverStartedAt,
          abortReason: "pair-limit",
        };
      }
      const node = popMedleyExactCandidatePairFrontierHeapNode(frontierHeap);
      if (!node || node.score + baseAnchorUpper <= upperBound) {
        break;
      }
      const leftCandidate = leftCandidates[node.leftIndex];
      const rightCandidate = rightCandidates[node.rightIndex];
      if (leftCandidate && rightCandidate) {
        if (!medleyExactCandidatesOverlap(leftCandidate, rightCandidate)) {
          pairCount += 1;
          let anchorUpper = baseAnchorUpper;
          for (const cardId of leftCandidate.cardIds) {
            coveredCardIds.add(cardId);
            anchorUpper = Math.min(anchorUpper, estimateSlotUpperExcludingSingleCardId(anchorSlotIndex, cardId));
          }
          for (const cardId of rightCandidate.cardIds) {
            coveredCardIds.add(cardId);
            anchorUpper = Math.min(anchorUpper, estimateSlotUpperExcludingSingleCardId(anchorSlotIndex, cardId));
          }
          upperBound = Math.max(upperBound, node.score + anchorUpper);
        }
        const nextRightIndex = node.rightIndex + 1;
        const nextRightCandidate = rightCandidates[nextRightIndex];
        if (nextRightCandidate) {
          const nextScore = leftCandidate.result.score + nextRightCandidate.result.score;
          if (nextScore + baseAnchorUpper > upperBound) {
            pushMedleyExactCandidatePairFrontierHeapNode(frontierHeap, {
              score: nextScore,
              leftIndex: node.leftIndex,
              rightIndex: nextRightIndex,
            });
          }
        }
      }
    }
    frontierHeap.length = 0;
    return {
      upperBound,
      pairCount,
      distinctCardCount: coveredCardIds.size,
      elapsedMs: performance.now() - coverStartedAt,
      abortReason: null,
    };
  };
  const estimateSingleCardLimitedUnseenUpper = (
    unseenSlotIndex: number,
    leftCardIds: readonly number[],
    rightCardIds: readonly number[],
    baseUnseenUpper: number,
  ): number => {
    let upper = baseUnseenUpper;
    for (const cardId of leftCardIds) {
      upper = Math.min(upper, estimateSlotUpperExcludingSingleCardId(unseenSlotIndex, cardId));
    }
    for (const cardId of rightCardIds) {
      upper = Math.min(upper, estimateSlotUpperExcludingSingleCardId(unseenSlotIndex, cardId));
    }
    return upper;
  };
  const estimateSuffixGeneratedUnseenSingleCardJoinUpper = (
    startAnchorIndex: number | null,
    generatedCandidates: MedleyTeamCandidate[],
    unseenSlotIndex: number,
    baseUnseenUpper: number,
    targetUpperBound = incumbentScore,
  ): {
    upperBound: number | null;
    pairCount: number;
    elapsedMs: number;
    abortReason: string | null;
  } => {
    if (
      !shouldUseSuffixUnseenJoin
      || startAnchorIndex === null
      || startAnchorIndex >= anchorCandidates.length
      || !Number.isFinite(baseUnseenUpper)
    ) {
      return {
        upperBound: null,
        pairCount: 0,
        elapsedMs: 0,
        abortReason: null,
      };
    }
    const joinStartedAt = performance.now();
    if (joinStartedAt >= localDeadlineAt) {
      return {
        upperBound: null,
        pairCount: 0,
        elapsedMs: 0,
        abortReason: "timebox",
      };
    }
    const maxAnchorScore = anchorCandidates[startAnchorIndex]?.result.score ?? Number.NEGATIVE_INFINITY;
    const bestGeneratedScore = generatedCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY;
    if (!Number.isFinite(maxAnchorScore) || !Number.isFinite(bestGeneratedScore)) {
      return {
        upperBound: null,
        pairCount: 0,
        elapsedMs: performance.now() - joinStartedAt,
        abortReason: null,
      };
    }
    const frontierHeap: MedleyExactCandidatePairFrontierHeapNode[] = [];
    const effectiveTargetUpperBound = Math.max(incumbentScore, targetUpperBound);
    for (let anchorIndex = startAnchorIndex; anchorIndex < anchorCandidates.length; anchorIndex += 1) {
      const score = anchorCandidates[anchorIndex].result.score + bestGeneratedScore;
      if (score + baseUnseenUpper <= effectiveTargetUpperBound) {
        break;
      }
      pushMedleyExactCandidatePairFrontierHeapNode(frontierHeap, {
        score,
        leftIndex: anchorIndex,
        rightIndex: 0,
      });
    }
    let upperBound = Number.NEGATIVE_INFINITY;
    let pairCount = 0;
    while (frontierHeap.length > 0) {
      if (performance.now() >= localDeadlineAt) {
        frontierHeap.length = 0;
        return {
          upperBound: null,
          pairCount,
          elapsedMs: performance.now() - joinStartedAt,
          abortReason: "timebox",
        };
      }
      const node = popMedleyExactCandidatePairFrontierHeapNode(frontierHeap);
      if (!node || node.score + baseUnseenUpper <= effectiveTargetUpperBound) {
        break;
      }
      const anchorCandidate = anchorCandidates[node.leftIndex];
      const generatedCandidate = generatedCandidates[node.rightIndex];
      if (anchorCandidate && generatedCandidate) {
        if (!medleyExactCandidatesOverlap(anchorCandidate, generatedCandidate)) {
          pairCount += 1;
          const unseenUpper = shouldUseSuffixUnseenFullJoin
            ? Math.min(
              baseUnseenUpper,
              estimateSlotUpperExcludingCardIds(
                unseenSlotIndex,
                [anchorCandidate.cardIds, generatedCandidate.cardIds],
              ),
            )
            : estimateSingleCardLimitedUnseenUpper(
              unseenSlotIndex,
              anchorCandidate.cardIds,
              generatedCandidate.cardIds,
              baseUnseenUpper,
            );
          upperBound = Math.max(upperBound, node.score + unseenUpper);
        }
        const nextGeneratedIndex = node.rightIndex + 1;
        const nextGeneratedCandidate = generatedCandidates[nextGeneratedIndex];
        if (nextGeneratedCandidate) {
          const nextScore = anchorCandidate.result.score + nextGeneratedCandidate.result.score;
          if (nextScore + baseUnseenUpper > effectiveTargetUpperBound) {
            pushMedleyExactCandidatePairFrontierHeapNode(frontierHeap, {
              score: nextScore,
              leftIndex: node.leftIndex,
              rightIndex: nextGeneratedIndex,
            });
          }
        }
      }
    }
    frontierHeap.length = 0;
    return {
      upperBound: Math.max(
        Number.isFinite(upperBound) ? upperBound : Number.NEGATIVE_INFINITY,
        effectiveTargetUpperBound,
      ),
      pairCount,
      elapsedMs: performance.now() - joinStartedAt,
      abortReason: null,
    };
  };
  const refineGeneratedPlusUnseenUpper = (
    generatedCandidates: MedleyTeamCandidate[],
    unseenSlotIndex: number,
    anchorCandidate: MedleyTeamCandidate,
    anchorLimitedUnseenUpper: number,
  ): {
    upperBound: number;
    timedOut: boolean;
    scannedCandidateCount: number;
  } => {
    if (!Number.isFinite(anchorLimitedUnseenUpper)) {
      return {
        upperBound: Number.NEGATIVE_INFINITY,
        timedOut: false,
        scannedCandidateCount: 0,
      };
    }
    let bestUpper = Number.NEGATIVE_INFINITY;
    let scannedCandidateCount = 0;
    const maxGeneratedCandidateCount = Math.min(
      generatedCandidates.length,
      unseenRefineMaxGeneratedCandidates,
    );
    for (let index = 0; index < maxGeneratedCandidateCount; index += 1) {
      const generatedCandidate = generatedCandidates[index];
      const fallbackUpper = combineScores(generatedCandidate.result.score, anchorLimitedUnseenUpper);
      if (performance.now() >= localDeadlineAt) {
        return {
          upperBound: Math.max(bestUpper, fallbackUpper),
          timedOut: true,
          scannedCandidateCount,
        };
      }
      if (Number.isFinite(bestUpper) && fallbackUpper <= bestUpper) {
        return {
          upperBound: bestUpper,
          timedOut: false,
          scannedCandidateCount,
        };
      }
      if (hasAnyCardId(generatedCandidate, anchorCandidate.cardIds)) {
        continue;
      }
      const unseenUpper = Math.min(
        anchorLimitedUnseenUpper,
        estimateSlotUpperExcludingCardIds(
          unseenSlotIndex,
          [anchorCandidate.cardIds, generatedCandidate.cardIds],
        ),
      );
      scannedCandidateCount += 1;
      const refinedUpper = combineScores(generatedCandidate.result.score, unseenUpper);
      if (refinedUpper > bestUpper) {
        bestUpper = refinedUpper;
      }
    }
    const nextGeneratedCandidate = generatedCandidates[maxGeneratedCandidateCount];
    const remainingGeneratedUpper = nextGeneratedCandidate
      ? combineScores(nextGeneratedCandidate.result.score, anchorLimitedUnseenUpper)
      : Number.NEGATIVE_INFINITY;
    return {
      upperBound: Math.max(bestUpper, remainingGeneratedUpper),
      timedOut: false,
      scannedCandidateCount,
    };
  };
  const refineUnseenPairUpperForEntry = (
    entry: (typeof processedAnchorUpperEntries)[number],
    generatedPairUpper: number,
    leftUnseenUpper: number,
    rightUnseenUpper: number,
  ): {
    pairUpper: number;
    source: string;
    generatedPairUpper: number;
    leftUnseenUpper: number;
    rightUnseenUpper: number;
    timedOut: boolean;
  } => {
    const targetPairUpper = incumbentScore - entry.anchorScore;
    const shouldRefineLeftUnseen = (
      Number.isFinite(leftUnseenUpper)
      && (!Number.isFinite(targetPairUpper) || leftUnseenUpper > targetPairUpper)
    );
    const shouldRefineRightUnseen = (
      Number.isFinite(rightUnseenUpper)
      && (!Number.isFinite(targetPairUpper) || rightUnseenUpper > targetPairUpper)
    );
    if (!shouldRefineUnseenUpper || (!shouldRefineLeftUnseen && !shouldRefineRightUnseen)) {
      const pairUpper = Math.max(generatedPairUpper, leftUnseenUpper, rightUnseenUpper);
      const rawSource = pairUpper === generatedPairUpper
        ? "generated-pair"
        : pairUpper === leftUnseenUpper
          ? "left-unseen"
          : "right-unseen";
      const capped = applyPairCapacityCap(pairUpper, rawSource, entry.anchorCandidate.cardIds);
      return {
        pairUpper: capped.pairUpper,
        source: capped.source,
        generatedPairUpper,
        leftUnseenUpper,
        rightUnseenUpper,
        timedOut: false,
      };
    }

    unseenRefineAttemptCount += 1;
    let timedOut = false;
    const anchorLimitedLeftPeekUpperBound = Math.min(
      finiteScore(leftPeekUpperBound),
      estimateSlotUpperExcludingCardIds(leftSlotIndex, [entry.anchorCandidate.cardIds]),
    );
    const anchorLimitedRightPeekUpperBound = Math.min(
      finiteScore(rightPeekUpperBound),
      estimateSlotUpperExcludingCardIds(rightSlotIndex, [entry.anchorCandidate.cardIds]),
    );
    const bothUnseenUpper = combineScores(anchorLimitedLeftPeekUpperBound, anchorLimitedRightPeekUpperBound);

    let refinedLeftUnseenUpper = leftUnseenUpper;
    if (shouldRefineLeftUnseen) {
      const generatedRightUpper = refineGeneratedPlusUnseenUpper(
        rightCandidates,
        leftSlotIndex,
        entry.anchorCandidate,
        anchorLimitedLeftPeekUpperBound,
      );
      unseenRefineCandidateCount += generatedRightUpper.scannedCandidateCount;
      timedOut = timedOut || generatedRightUpper.timedOut;
      refinedLeftUnseenUpper = Math.min(
        leftUnseenUpper,
        Math.max(bothUnseenUpper, generatedRightUpper.upperBound),
      );
    }

    let refinedRightUnseenUpper = rightUnseenUpper;
    if (shouldRefineRightUnseen && !timedOut) {
      const generatedLeftUpper = refineGeneratedPlusUnseenUpper(
        leftCandidates,
        rightSlotIndex,
        entry.anchorCandidate,
        anchorLimitedRightPeekUpperBound,
      );
      unseenRefineCandidateCount += generatedLeftUpper.scannedCandidateCount;
      timedOut = timedOut || generatedLeftUpper.timedOut;
      refinedRightUnseenUpper = Math.min(
        rightUnseenUpper,
        Math.max(bothUnseenUpper, generatedLeftUpper.upperBound),
      );
    }

    if (timedOut) {
      unseenRefineAbortReason = "timebox";
    }
    if (
      refinedLeftUnseenUpper < leftUnseenUpper
      || refinedRightUnseenUpper < rightUnseenUpper
    ) {
      unseenRefineImprovementCount += 1;
    }
    const pairUpper = Math.max(generatedPairUpper, refinedLeftUnseenUpper, refinedRightUnseenUpper);
    const rawSource = pairUpper === generatedPairUpper
      ? "generated-pair"
      : pairUpper === refinedLeftUnseenUpper
        ? "left-unseen"
        : "right-unseen";
    const capped = applyPairCapacityCap(pairUpper, rawSource, entry.anchorCandidate.cardIds);
    return {
      pairUpper: capped.pairUpper,
      source: capped.source,
      generatedPairUpper,
      leftUnseenUpper: refinedLeftUnseenUpper,
      rightUnseenUpper: refinedRightUnseenUpper,
      timedOut,
    };
  };
  const estimateProcessedGeneratedUnseenJoinSideUpper = (
    generatedCandidates: MedleyTeamCandidate[],
    unseenSlotIndex: number,
    baseGeneratedUnseenUpper: number,
    getAnchorLimitedSlotUpper: (entryIndex: number, slotIndex: number) => number,
    entryLimit = processedAnchorUpperEntries.length,
  ): {
    upperBound: number | null;
    pairCount: number;
    elapsedMs: number;
    abortReason: string | null;
    maxSource: string | null;
    maxAnchorScore: number | null;
    maxGeneratedPairUpper: number | null;
    maxBothUnseenFallbackPairUpper: number | null;
    maxGeneratedCandidateScore: number | null;
    maxGeneratedUnseenUpper: number | null;
    maxEntryIndex: number | null;
    maxGeneratedIndex: number | null;
    maxUnseenSlotIndex: number | null;
  } => {
    const joinStartedAt = performance.now();
    if (joinStartedAt >= localDeadlineAt) {
      return {
        upperBound: null,
        pairCount: 0,
        elapsedMs: 0,
        abortReason: "timebox",
        maxSource: null,
        maxAnchorScore: null,
        maxGeneratedPairUpper: null,
        maxBothUnseenFallbackPairUpper: null,
        maxGeneratedCandidateScore: null,
        maxGeneratedUnseenUpper: null,
        maxEntryIndex: null,
        maxGeneratedIndex: null,
        maxUnseenSlotIndex: null,
      };
    }
    let upperBound = Number.NEGATIVE_INFINITY;
    let pairCount = 0;
    let maxSource: string | null = null;
    let maxAnchorScore: number | null = null;
    let maxGeneratedPairUpper: number | null = null;
    let maxBothUnseenFallbackPairUpper: number | null = null;
    let maxGeneratedCandidateScore: number | null = null;
    let maxGeneratedUnseenUpper: number | null = null;
    let maxEntryIndex: number | null = null;
    let maxGeneratedIndex: number | null = null;
    let maxUnseenSlotIndex: number | null = null;
    const recordPairUpper = (
      pairUpper: number,
      source: string,
      entryIndex: number,
      values: {
        anchorScore: number;
        generatedPairUpper?: number | null;
        bothUnseenFallbackPairUpper?: number | null;
        generatedCandidateScore?: number | null;
        generatedUnseenUpper?: number | null;
        generatedIndex?: number | null;
        unseenSlot?: number | null;
      },
    ): void => {
      if (!Number.isFinite(pairUpper)) {
        return;
      }
      const entry = processedAnchorUpperEntries[entryIndex];
      const capped = entry
        ? applyPairCapacityCap(pairUpper, source, entry.anchorCandidate.cardIds)
        : { pairUpper, source };
      const upper = values.anchorScore + capped.pairUpper;
      if (!Number.isFinite(upper)) {
        return;
      }
      if (upper > upperBound) {
        upperBound = upper;
        maxSource = capped.source;
        maxAnchorScore = values.anchorScore;
        maxGeneratedPairUpper = values.generatedPairUpper ?? null;
        maxBothUnseenFallbackPairUpper = values.bothUnseenFallbackPairUpper ?? null;
        maxGeneratedCandidateScore = values.generatedCandidateScore ?? null;
        maxGeneratedUnseenUpper = values.generatedUnseenUpper ?? null;
        maxEntryIndex = entryIndex;
        maxGeneratedIndex = values.generatedIndex ?? null;
        maxUnseenSlotIndex = values.unseenSlot ?? null;
      }
    };
    const buildResult = (abortReason: string | null): {
      upperBound: number | null;
      pairCount: number;
      elapsedMs: number;
      abortReason: string | null;
      maxSource: string | null;
      maxAnchorScore: number | null;
      maxGeneratedPairUpper: number | null;
      maxBothUnseenFallbackPairUpper: number | null;
      maxGeneratedCandidateScore: number | null;
      maxGeneratedUnseenUpper: number | null;
      maxEntryIndex: number | null;
      maxGeneratedIndex: number | null;
      maxUnseenSlotIndex: number | null;
    } => ({
      upperBound: Number.isFinite(upperBound) ? upperBound : null,
      pairCount,
      elapsedMs: performance.now() - joinStartedAt,
      abortReason,
      maxSource,
      maxAnchorScore,
      maxGeneratedPairUpper,
      maxBothUnseenFallbackPairUpper,
      maxGeneratedCandidateScore,
      maxGeneratedUnseenUpper,
      maxEntryIndex,
      maxGeneratedIndex,
      maxUnseenSlotIndex,
    });
    if (
      !shouldUseProcessedUnseenJoin
      || processedAnchorUpperEntries.length === 0
      || entryLimit <= 0
      || generatedCandidates.length === 0
      || !Number.isFinite(baseGeneratedUnseenUpper)
    ) {
      return {
        upperBound: null,
        pairCount: 0,
        elapsedMs: performance.now() - joinStartedAt,
        abortReason: null,
        maxSource: null,
        maxAnchorScore: null,
        maxGeneratedPairUpper: null,
        maxBothUnseenFallbackPairUpper: null,
        maxGeneratedCandidateScore: null,
        maxGeneratedUnseenUpper: null,
        maxEntryIndex: null,
        maxGeneratedIndex: null,
        maxUnseenSlotIndex: null,
      };
    }

    const heap: MedleyExactCandidatePairFrontierHeapNode[] = [];
    const bestGeneratedScore = generatedCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY;
    const effectiveEntryLimit = Math.min(processedAnchorUpperEntries.length, Math.trunc(entryLimit));
    for (let entryIndex = 0; entryIndex < effectiveEntryLimit; entryIndex += 1) {
      const entry = processedAnchorUpperEntries[entryIndex];
      const refined = refinedAnchorPairUpperByCandidate.get(entry.anchorCandidate);
      const generatedPairUpper = refined?.generatedPairUpper ?? entry.generatedPairUpper;
      const leftUnseenUpper = refined?.leftUnseenUpper ?? entry.leftUnseenUpper;
      const rightUnseenUpper = refined?.rightUnseenUpper ?? entry.rightUnseenUpper;
      const anchorLimitedUnseenUpper = getAnchorLimitedSlotUpper(entryIndex, unseenSlotIndex);
      const bothUnseenFallbackPairUpper = Math.min(leftUnseenUpper, rightUnseenUpper);
      recordPairUpper(
        generatedPairUpper,
        "generated-pair",
        entryIndex,
        {
          anchorScore: entry.anchorScore,
          generatedPairUpper,
        },
      );
      recordPairUpper(
        bothUnseenFallbackPairUpper,
        "both-unseen-fallback",
        entryIndex,
        {
          anchorScore: entry.anchorScore,
          bothUnseenFallbackPairUpper,
        },
      );
      if (Number.isFinite(bestGeneratedScore) && Number.isFinite(anchorLimitedUnseenUpper)) {
        pushMedleyExactCandidatePairFrontierHeapNode(heap, {
          score: entry.anchorScore + bestGeneratedScore + anchorLimitedUnseenUpper,
          leftIndex: entryIndex,
          rightIndex: 0,
        });
      }
    }

    while (heap.length > 0) {
      if (performance.now() >= localDeadlineAt) {
        heap.length = 0;
        return buildResult("timebox");
      }
      const node = popMedleyExactCandidatePairFrontierHeapNode(heap);
      if (!node) {
        break;
      }
      if (Number.isFinite(upperBound) && node.score <= upperBound) {
        break;
      }
      const entry = processedAnchorUpperEntries[node.leftIndex];
      const generatedCandidate = generatedCandidates[node.rightIndex];
      const anchorLimitedUnseenUpper = getAnchorLimitedSlotUpper(node.leftIndex, unseenSlotIndex);
      if (entry && generatedCandidate && !hasAnyCardId(generatedCandidate, entry.anchorCandidate.cardIds)) {
        pairCount += 1;
        const unseenUpper = Math.min(
          anchorLimitedUnseenUpper,
          estimateSlotUpperExcludingCardIds(
            unseenSlotIndex,
            [entry.anchorCandidate.cardIds, generatedCandidate.cardIds],
          ),
        );
        recordPairUpper(
          generatedCandidate.result.score + unseenUpper,
          unseenSlotIndex === leftSlotIndex
            ? "right-generated-left-unseen"
            : "left-generated-right-unseen",
          node.leftIndex,
          {
            anchorScore: entry.anchorScore,
            generatedCandidateScore: generatedCandidate.result.score,
            generatedUnseenUpper: unseenUpper,
            generatedIndex: node.rightIndex,
            unseenSlot: unseenSlotIndex,
          },
        );
      }
      const nextGeneratedIndex = node.rightIndex + 1;
      const nextGeneratedCandidate = generatedCandidates[nextGeneratedIndex];
      if (entry && nextGeneratedCandidate) {
        const nextScore = entry.anchorScore + nextGeneratedCandidate.result.score + anchorLimitedUnseenUpper;
        if (!Number.isFinite(upperBound) || nextScore > upperBound) {
          pushMedleyExactCandidatePairFrontierHeapNode(heap, {
            score: nextScore,
            leftIndex: node.leftIndex,
            rightIndex: nextGeneratedIndex,
          });
        }
      }
    }

    heap.length = 0;
    return buildResult(null);
  };
  const estimateProcessedGeneratedUnseenJoinUpper = (
    entryLimit = processedAnchorUpperEntries.length,
  ): {
    upperBound: number | null;
    pairCount: number;
    elapsedMs: number;
    abortReason: string | null;
    maxSource: string | null;
    maxAnchorScore: number | null;
    maxGeneratedPairUpper: number | null;
    maxBothUnseenFallbackPairUpper: number | null;
    maxGeneratedCandidateScore: number | null;
    maxGeneratedUnseenUpper: number | null;
    maxEntryIndex: number | null;
    maxGeneratedIndex: number | null;
    maxUnseenSlotIndex: number | null;
  } => {
    if (!shouldUseProcessedUnseenJoin || processedAnchorUpperEntries.length === 0 || entryLimit <= 0) {
      return {
        upperBound: null,
        pairCount: 0,
        elapsedMs: 0,
        abortReason: null,
        maxSource: null,
        maxAnchorScore: null,
        maxGeneratedPairUpper: null,
        maxBothUnseenFallbackPairUpper: null,
        maxGeneratedCandidateScore: null,
        maxGeneratedUnseenUpper: null,
        maxEntryIndex: null,
        maxGeneratedIndex: null,
        maxUnseenSlotIndex: null,
      };
    }
    const joinStartedAt = performance.now();
    if (joinStartedAt >= localDeadlineAt) {
      return {
        upperBound: null,
        pairCount: 0,
        elapsedMs: 0,
        abortReason: "timebox",
        maxSource: null,
        maxAnchorScore: null,
        maxGeneratedPairUpper: null,
        maxBothUnseenFallbackPairUpper: null,
        maxGeneratedCandidateScore: null,
        maxGeneratedUnseenUpper: null,
        maxEntryIndex: null,
        maxGeneratedIndex: null,
        maxUnseenSlotIndex: null,
      };
    }
    const anchorLimitedLeftUpperByEntry: number[] = [];
    const anchorLimitedRightUpperByEntry: number[] = [];
    const getAnchorLimitedSlotUpper = (entryIndex: number, slotIndex: number): number => {
      const cache = slotIndex === leftSlotIndex
        ? anchorLimitedLeftUpperByEntry
        : anchorLimitedRightUpperByEntry;
      const cached = cache[entryIndex];
      if (cached !== undefined) {
        return cached;
      }
      const entry = processedAnchorUpperEntries[entryIndex];
      const baseUpper = slotIndex === leftSlotIndex
        ? finiteScore(leftPeekUpperBound)
        : finiteScore(rightPeekUpperBound);
      const upperBound = entry
        ? Math.min(
          baseUpper,
          estimateSlotUpperExcludingCardIds(slotIndex, [entry.anchorCandidate.cardIds]),
        )
        : Number.NEGATIVE_INFINITY;
      cache[entryIndex] = upperBound;
      return upperBound;
    };
    const leftUnseenJoin = estimateProcessedGeneratedUnseenJoinSideUpper(
      rightCandidates,
      leftSlotIndex,
      finiteScore(leftPeekUpperBound),
      getAnchorLimitedSlotUpper,
      entryLimit,
    );
    if (leftUnseenJoin.abortReason !== null) {
      return {
        upperBound: null,
        pairCount: leftUnseenJoin.pairCount,
        elapsedMs: performance.now() - joinStartedAt,
        abortReason: leftUnseenJoin.abortReason,
        maxSource: leftUnseenJoin.maxSource,
        maxAnchorScore: leftUnseenJoin.maxAnchorScore,
        maxGeneratedPairUpper: leftUnseenJoin.maxGeneratedPairUpper,
        maxBothUnseenFallbackPairUpper: leftUnseenJoin.maxBothUnseenFallbackPairUpper,
        maxGeneratedCandidateScore: leftUnseenJoin.maxGeneratedCandidateScore,
        maxGeneratedUnseenUpper: leftUnseenJoin.maxGeneratedUnseenUpper,
        maxEntryIndex: leftUnseenJoin.maxEntryIndex,
        maxGeneratedIndex: leftUnseenJoin.maxGeneratedIndex,
        maxUnseenSlotIndex: leftUnseenJoin.maxUnseenSlotIndex,
      };
    }
    const rightUnseenJoin = estimateProcessedGeneratedUnseenJoinSideUpper(
      leftCandidates,
      rightSlotIndex,
      finiteScore(rightPeekUpperBound),
      getAnchorLimitedSlotUpper,
      entryLimit,
    );
    const pairCount = leftUnseenJoin.pairCount + rightUnseenJoin.pairCount;
    const elapsedMs = performance.now() - joinStartedAt;
    if (rightUnseenJoin.abortReason !== null) {
      const maxJoin = (
        leftUnseenJoin.upperBound !== null
        && (
          rightUnseenJoin.upperBound === null
          || leftUnseenJoin.upperBound >= rightUnseenJoin.upperBound
        )
      )
        ? leftUnseenJoin
        : rightUnseenJoin;
      return {
        upperBound: null,
        pairCount,
        elapsedMs,
        abortReason: rightUnseenJoin.abortReason,
        maxSource: maxJoin.maxSource,
        maxAnchorScore: maxJoin.maxAnchorScore,
        maxGeneratedPairUpper: maxJoin.maxGeneratedPairUpper,
        maxBothUnseenFallbackPairUpper: maxJoin.maxBothUnseenFallbackPairUpper,
        maxGeneratedCandidateScore: maxJoin.maxGeneratedCandidateScore,
        maxGeneratedUnseenUpper: maxJoin.maxGeneratedUnseenUpper,
        maxEntryIndex: maxJoin.maxEntryIndex,
        maxGeneratedIndex: maxJoin.maxGeneratedIndex,
        maxUnseenSlotIndex: maxJoin.maxUnseenSlotIndex,
      };
    }
    const maxJoin = (
      leftUnseenJoin.upperBound !== null
      && (
        rightUnseenJoin.upperBound === null
        || leftUnseenJoin.upperBound >= rightUnseenJoin.upperBound
      )
    )
      ? leftUnseenJoin
      : rightUnseenJoin;
    return {
      upperBound: maxJoin.upperBound !== null && Number.isFinite(maxJoin.upperBound)
        ? maxJoin.upperBound
        : null,
      pairCount,
      elapsedMs,
      abortReason: null,
      maxSource: maxJoin.maxSource,
      maxAnchorScore: maxJoin.maxAnchorScore,
      maxGeneratedPairUpper: maxJoin.maxGeneratedPairUpper,
      maxBothUnseenFallbackPairUpper: maxJoin.maxBothUnseenFallbackPairUpper,
      maxGeneratedCandidateScore: maxJoin.maxGeneratedCandidateScore,
      maxGeneratedUnseenUpper: maxJoin.maxGeneratedUnseenUpper,
      maxEntryIndex: maxJoin.maxEntryIndex,
      maxGeneratedIndex: maxJoin.maxGeneratedIndex,
      maxUnseenSlotIndex: maxJoin.maxUnseenSlotIndex,
    };
  };
  let targetedGeneratedPairQuery: MedleyExactCandidatePairUpperQuery | null = null;
  let targetedGeneratedPairQueryKey = "";
  const findTargetedGeneratedPairForAnchor = (
    anchorCandidate: MedleyTeamCandidate,
    minimumRelevantScore: number,
  ): {
    score: number;
    leftCandidate: MedleyTeamCandidate | null;
    rightCandidate: MedleyTeamCandidate | null;
  } => {
    const leftSlotCandidates = candidatesBySlot[leftSlotIndex];
    const rightSlotCandidates = candidatesBySlot[rightSlotIndex];
    sortMedleyCandidates(leftSlotCandidates);
    sortMedleyCandidates(rightSlotCandidates);
    const key = `${leftSlotCandidates.length}:${rightSlotCandidates.length}`;
    if (!targetedGeneratedPairQuery || targetedGeneratedPairQueryKey !== key) {
      targetedGeneratedPairQuery = buildMedleyExactCandidatePairUpperQuery(
        leftSlotCandidates,
        rightSlotCandidates,
      );
      targetedGeneratedPairQueryKey = key;
    }
    return findBestGeneratedMedleyExactCandidatePairForAnchorByBits(
      targetedGeneratedPairQuery,
      anchorCandidate,
      minimumRelevantScore,
      profiling,
    );
  };
  const maybeRefineEntryWithTargetedPairProof = (
    entry: (typeof processedAnchorUpperEntries)[number],
    refined: {
      pairUpper: number;
      source: string;
      generatedPairUpper: number;
      leftUnseenUpper: number;
      rightUnseenUpper: number;
    },
  ): {
    refined: typeof refined;
    timedOut: boolean;
  } => {
    if (
      targetedPairProofTimeboxMs <= 0
      || targetedPairProofMaxEntries <= 0
      || targetedPairProofDisabled
      || targetedPairProofAttemptCount >= targetedPairProofMaxEntries
    ) {
      return { refined, timedOut: false };
    }
    const targetPairUpper = incumbentScore - entry.anchorScore;
    if (
      !Number.isFinite(targetPairUpper)
      || !Number.isFinite(refined.pairUpper)
      || refined.pairUpper <= targetPairUpper
    ) {
      return { refined, timedOut: false };
    }
    const localPairProofDeadlineAt = Math.min(
      deadlineAt,
      localDeadlineAt,
      performance.now() + targetedPairProofTimeboxMs,
    );
    if (performance.now() >= localPairProofDeadlineAt) {
      targetedPairProofTimeboxCount += 1;
      targetedPairProofAbortReason = "timebox";
      targetedPairProofDisabled = true;
      return { refined, timedOut: false };
    }
    targetedPairProofAttemptCount += 1;
    if (targetedPairBnbNodeLimit !== null && targetedPairBnbSlotSolveNodeLimit !== null) {
      const bnbStartedAt = performance.now();
      const bnbResult = proveMedleyScoreOnlyPairUpperByConflictBnb(
        [slots[leftSlotIndex], slots[rightSlotIndex]],
        server,
        perfectRate,
        stats,
        profiling,
        () => performance.now() >= localPairProofDeadlineAt,
        localPairProofDeadlineAt,
        targetedPairBnbNodeLimit,
        targetedPairBnbSlotSolveNodeLimit,
        entry.anchorCandidate.cardIds,
        false,
      );
      targetedPairProofElapsedMs += performance.now() - bnbStartedAt;
      if (bnbResult.timedOut || stats.timedOut) {
        targetedPairProofTimeboxCount += 1;
        targetedPairProofAbortReason = "bnb-timeout";
        if (stats.timedOut || performance.now() >= deadlineAt) {
          return { refined, timedOut: true };
        }
        targetedPairProofDisabled = true;
        return { refined, timedOut: false };
      }
      targetedPairProofProcessedEntryCount += 1;
      if (bnbResult.proved && bnbResult.upperBound !== null && Number.isFinite(bnbResult.upperBound)) {
        if (bnbResult.upperBound < refined.pairUpper) {
          targetedPairProofImprovementCount += 1;
          return {
            refined: {
              ...refined,
              pairUpper: bnbResult.upperBound,
              source: "targeted-pair-bnb",
            },
            timedOut: false,
          };
        }
        targetedPairProofAbortReason = "bnb-no-improvement";
        return { refined, timedOut: false };
      }
      targetedPairProofAbortReason = "bnb-node-limit";
      return { refined, timedOut: false };
    }
    const proofStartedAt = performance.now();
    const pairSearchResult = findBestMedleyExactCandidatePairForAnchor(
      pairSlotIndices,
      candidatesBySlot,
      generators,
      entry.anchorCandidate,
      targetPairUpper,
      targetedPairProofCandidateLimit,
      profiling,
      stats,
      () => false,
      deadlineAt,
      localPairProofDeadlineAt,
      findTargetedGeneratedPairForAnchor,
    );
    targetedPairProofElapsedMs += performance.now() - proofStartedAt;
    if (pairSearchResult.timedOut) {
      targetedPairProofTimeboxCount += 1;
      targetedPairProofAbortReason = "global-timeout";
      return { refined, timedOut: true };
    }
    if (pairSearchResult.localTimedOut) {
      targetedPairProofTimeboxCount += 1;
      targetedPairProofAbortReason = "timebox";
      targetedPairProofDisabled = true;
      return { refined, timedOut: false };
    }
    targetedPairProofProcessedEntryCount += 1;
    if (pairSearchResult.leftCandidate && pairSearchResult.rightCandidate) {
      const anchorResultCandidate = hydrateMedleyExactCandidateForResult(
        slots[anchorSlotIndex],
        entry.anchorCandidate,
        server,
        perfectRate,
        stats,
        profiling,
      );
      const leftResultCandidate = hydrateMedleyExactCandidateForResult(
        slots[leftSlotIndex],
        pairSearchResult.leftCandidate,
        server,
        perfectRate,
        stats,
        profiling,
      );
      const rightResultCandidate = hydrateMedleyExactCandidateForResult(
        slots[rightSlotIndex],
        pairSearchResult.rightCandidate,
        server,
        perfectRate,
        stats,
        profiling,
      );
      if (anchorResultCandidate && leftResultCandidate && rightResultCandidate) {
        const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
        selectedBySong[slots[anchorSlotIndex].songIndex] = anchorResultCandidate;
        selectedBySong[slots[leftSlotIndex].songIndex] = leftResultCandidate;
        selectedBySong[slots[rightSlotIndex].songIndex] = rightResultCandidate;
        const result = buildMedleyResult(slots, selectedBySong, configuration);
        if (result) {
          observeEvaluatedResult?.(result);
          targetedPairProofResult = compareMedleyResultLike(targetedPairProofResult, result);
        }
      }
      return { refined, timedOut: false };
    }
    if (!pairSearchResult.proved) {
      targetedPairProofAbortReason = "candidate-limit";
      return { refined, timedOut: false };
    }
    targetedPairProofImprovementCount += 1;
    return {
      refined: {
        ...refined,
        pairUpper: Math.min(refined.pairUpper, targetPairUpper),
        source: "targeted-pair-proof",
      },
      timedOut: false,
    };
  };
  const refineProcessedAnchorUpperEntries = (): boolean => {
    if (processedAnchorUpperEntries.length === 0) {
      return false;
    }
    const sortedEntries = [...processedAnchorUpperEntries].sort((left, right) => right.totalUpper - left.totalUpper);
    let newSplitRefineCount = 0;
    let newUnseenRefineEntryCount = 0;
    processedUpperMax = Number.NEGATIVE_INFINITY;
    processedUpperMaxSource = null;
    processedUpperMaxAnchorScore = null;
    processedUpperMaxPairUpper = null;
    processedUpperMaxGeneratedPairUpper = null;
    processedUpperMaxLeftUnseenUpper = null;
    processedUpperMaxRightUnseenUpper = null;
    processedUpperMaxAnchorCandidate = null;
    processedUpperMaxLeftGeneratedCandidate = null;
    processedUpperMaxRightGeneratedCandidate = null;

    for (let index = 0; index < sortedEntries.length; index += 1) {
      const entry = sortedEntries[index];
      let refined = refinedAnchorPairUpperByCandidate.get(entry.anchorCandidate);
      const targetPairUpper = incumbentScore - entry.anchorScore;
      const canRefineGeneratedPair = (
        (entry.source === "generated-pair" || entry.source === "pair-capacity")
        && (!Number.isFinite(targetPairUpper) || entry.generatedPairUpper > targetPairUpper)
        && newSplitRefineCount < refineTopAnchorCount
      );
      const canRefineUnseenPair = (
        shouldRefineUnseenUpper
        && newUnseenRefineEntryCount < refineTopAnchorCount
        && (
          (
            Number.isFinite(entry.leftUnseenUpper)
            && (!Number.isFinite(targetPairUpper) || entry.leftUnseenUpper > targetPairUpper)
          )
          || (
            Number.isFinite(entry.rightUnseenUpper)
            && (!Number.isFinite(targetPairUpper) || entry.rightUnseenUpper > targetPairUpper)
          )
        )
      );
      const canRefinePairCapacitySharedPowerDual = (
        shouldUsePairCapacitySharedPowerDualCap
        && entry.source === "pair-capacity"
        && Number.isFinite(entry.pairUpper)
        && (!Number.isFinite(targetPairUpper) || entry.pairUpper > targetPairUpper)
      );
      const canRefineEntry = (
        canRefineGeneratedPair
        || canRefineUnseenPair
        || canRefinePairCapacitySharedPowerDual
      );
      if (
        !refined
        && !canRefineEntry
      ) {
        recordProcessedUpperMax(
          entry.anchorScore,
          entry.pairUpper,
          entry.source,
          entry.generatedPairUpper,
          entry.leftUnseenUpper,
          entry.rightUnseenUpper,
          entry.leftGeneratedCandidate,
          entry.rightGeneratedCandidate,
          entry.anchorCandidate,
        );
        continue;
      }
      if (!refined) {
        if (performance.now() >= localDeadlineAt) {
          for (let remainingIndex = index; remainingIndex < sortedEntries.length; remainingIndex += 1) {
            const remainingEntry = sortedEntries[remainingIndex];
            recordProcessedUpperMax(
              remainingEntry.anchorScore,
              remainingEntry.pairUpper,
              remainingEntry.source,
              remainingEntry.generatedPairUpper,
              remainingEntry.leftUnseenUpper,
              remainingEntry.rightUnseenUpper,
              remainingEntry.leftGeneratedCandidate,
              remainingEntry.rightGeneratedCandidate,
              remainingEntry.anchorCandidate,
            );
          }
          return true;
        }
        let generatedPairUpper = entry.generatedPairUpper;
        let generatedPairSource = "generated-pair";
        if (canRefineGeneratedPair) {
          const splitUpper = estimateGeneratedMedleyExactCandidatePairConflictSplitUpper(
            leftAvailabilityQuery,
            rightAvailabilityQuery,
            entry.anchorCandidate.cardIds,
            localDeadlineAt,
          );
          splitAttemptCount += 1;
          splitStateCount += splitUpper.stateCount;
          profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSplitAttemptCount = splitAttemptCount;
          profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSplitStateCount = splitStateCount;
          profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSplitAbortReason = splitUpper.abortReason;
          if (
            splitUpper.timedOut
            || Number.isNaN(splitUpper.upperBound)
            || splitUpper.upperBound === Number.POSITIVE_INFINITY
          ) {
            splitAbortReason = splitUpper.abortReason ?? "invalid-upper";
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSplitAbortReason = splitAbortReason;
            for (let remainingIndex = index; remainingIndex < sortedEntries.length; remainingIndex += 1) {
              const remainingEntry = sortedEntries[remainingIndex];
              recordProcessedUpperMax(
                remainingEntry.anchorScore,
                remainingEntry.pairUpper,
                remainingEntry.source,
                remainingEntry.generatedPairUpper,
                remainingEntry.leftUnseenUpper,
                remainingEntry.rightUnseenUpper,
                remainingEntry.leftGeneratedCandidate,
                remainingEntry.rightGeneratedCandidate,
                remainingEntry.anchorCandidate,
              );
            }
            return true;
          }
          generatedPairUpper = Math.min(generatedPairUpper, splitUpper.upperBound);
          generatedPairSource = "generated-pair-split";
          newSplitRefineCount += 1;
        }
        const unseenRefineAttemptCountBeforeEntry = unseenRefineAttemptCount;
        const refinedUnseen = canRefineUnseenPair
          ? refineUnseenPairUpperForEntry(
            entry,
            generatedPairUpper,
            entry.leftUnseenUpper,
            entry.rightUnseenUpper,
          )
          : (() => {
            const pairUpper = Math.max(generatedPairUpper, entry.leftUnseenUpper, entry.rightUnseenUpper);
            const rawSource = pairUpper === generatedPairUpper
              ? "generated-pair"
              : pairUpper === entry.leftUnseenUpper
                ? "left-unseen"
                : "right-unseen";
            const capped = applyPairCapacityCap(pairUpper, rawSource, entry.anchorCandidate.cardIds);
            return {
              pairUpper: capped.pairUpper,
              source: capped.source,
              generatedPairUpper,
              leftUnseenUpper: entry.leftUnseenUpper,
              rightUnseenUpper: entry.rightUnseenUpper,
              timedOut: false,
            };
          })();
        if (unseenRefineAttemptCount > unseenRefineAttemptCountBeforeEntry) {
          newUnseenRefineEntryCount += 1;
        }
        const source = refinedUnseen.source === "generated-pair"
          ? generatedPairSource
          : refinedUnseen.source;
        refined = {
          pairUpper: refinedUnseen.pairUpper,
          source,
          generatedPairUpper,
          leftUnseenUpper: refinedUnseen.leftUnseenUpper,
          rightUnseenUpper: refinedUnseen.rightUnseenUpper,
        };
        refined = applyPairCapacitySharedPowerDualCapForEntry(entry, refined);
        const targetedPairProof = maybeRefineEntryWithTargetedPairProof(entry, refined);
        refined = targetedPairProof.refined;
        refinedAnchorPairUpperByCandidate.set(entry.anchorCandidate, refined);
        if (refinedUnseen.timedOut || targetedPairProof.timedOut) {
          recordProcessedUpperMax(
            entry.anchorScore,
            refined.pairUpper,
            refined.source,
            refined.generatedPairUpper,
            refined.leftUnseenUpper,
            refined.rightUnseenUpper,
            null,
            null,
            entry.anchorCandidate,
          );
          for (let remainingIndex = index + 1; remainingIndex < sortedEntries.length; remainingIndex += 1) {
            const remainingEntry = sortedEntries[remainingIndex];
            recordProcessedUpperMax(
              remainingEntry.anchorScore,
              remainingEntry.pairUpper,
              remainingEntry.source,
              remainingEntry.generatedPairUpper,
              remainingEntry.leftUnseenUpper,
              remainingEntry.rightUnseenUpper,
              remainingEntry.leftGeneratedCandidate,
              remainingEntry.rightGeneratedCandidate,
              remainingEntry.anchorCandidate,
            );
          }
          return true;
        }
      }
      if (refined) {
        const cappedRefined = applyPairCapacitySharedPowerDualCapForEntry(entry, refined);
        if (cappedRefined !== refined) {
          refined = cappedRefined;
          refinedAnchorPairUpperByCandidate.set(entry.anchorCandidate, refined);
        }
        recordProcessedUpperMax(
          entry.anchorScore,
          refined.pairUpper,
          refined.source,
          refined.generatedPairUpper,
          refined.leftUnseenUpper,
          refined.rightUnseenUpper,
          null,
          null,
          entry.anchorCandidate,
        );
      } else {
        for (let remainingIndex = index; remainingIndex < sortedEntries.length; remainingIndex += 1) {
          const remainingEntry = sortedEntries[remainingIndex];
          recordProcessedUpperMax(
            remainingEntry.anchorScore,
            remainingEntry.pairUpper,
            remainingEntry.source,
            remainingEntry.generatedPairUpper,
            remainingEntry.leftUnseenUpper,
            remainingEntry.rightUnseenUpper,
            remainingEntry.leftGeneratedCandidate,
            remainingEntry.rightGeneratedCandidate,
            remainingEntry.anchorCandidate,
          );
        }
        return true;
      }
    }
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSplitAttemptCount = splitAttemptCount;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSplitStateCount = splitStateCount;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSplitAbortReason = splitAbortReason;
    recordUnseenRefineProfiling();
    recordTargetedPairProofProfiling();
    return false;
  };
  const estimateProcessedPrefixUpperMax = (entryLimit: number): number => {
    let prefixUpperMax = Number.NEGATIVE_INFINITY;
    const effectiveEntryLimit = Math.min(
      processedAnchorUpperEntries.length,
      Math.max(0, Math.trunc(entryLimit)),
    );
    for (let index = 0; index < effectiveEntryLimit; index += 1) {
      const entry = processedAnchorUpperEntries[index];
      if (!entry) {
        continue;
      }
      const refined = refinedAnchorPairUpperByCandidate.get(entry.anchorCandidate);
      const pairUpper = refined?.pairUpper ?? entry.pairUpper;
      if (Number.isFinite(pairUpper)) {
        prefixUpperMax = Math.max(prefixUpperMax, entry.anchorScore + pairUpper);
      }
    }
    return prefixUpperMax;
  };
  const estimateBestPrefixResidualUpper = (
    finalNextAnchorScore: number | null,
    finalNextAnchorIndex: number | null,
  ): {
    upperBound: number | null;
    anchorIndex: number | null;
    processedEntryCount: number | null;
  } => {
    if (processedAnchorUpperEntries.length === 0) {
      return {
        upperBound: null,
        anchorIndex: null,
        processedEntryCount: null,
      };
    }
    let bestUpperBound: number | null = null;
    let bestAnchorIndex: number | null = null;
    let bestProcessedEntryCount: number | null = null;
    let prefixUpperMax = Number.NEGATIVE_INFINITY;
    const considerSplit = (processedEntryCount: number, processedMax: number): void => {
      const splitAnchorIndex = processedAnchorUpperEntries[processedEntryCount]?.anchorIndex
        ?? finalNextAnchorIndex;
      const splitNextAnchorScore = splitAnchorIndex !== null
        ? anchorCandidates[splitAnchorIndex]?.result.score ?? null
        : finalNextAnchorScore;
      const splitUpperBound = getResidualUpperBoundForProcessedMax(
        processedMax,
        splitNextAnchorScore,
        null,
      );
      if (
        splitUpperBound !== null
        && Number.isFinite(splitUpperBound)
        && (bestUpperBound === null || splitUpperBound < bestUpperBound)
      ) {
        bestUpperBound = splitUpperBound;
        bestAnchorIndex = splitAnchorIndex;
        bestProcessedEntryCount = processedEntryCount;
      }
    };
    considerSplit(0, prefixUpperMax);
    for (let index = 0; index < processedAnchorUpperEntries.length; index += 1) {
      const entry = processedAnchorUpperEntries[index];
      const refined = refinedAnchorPairUpperByCandidate.get(entry.anchorCandidate);
      const pairUpper = refined?.pairUpper ?? entry.pairUpper;
      if (Number.isFinite(pairUpper)) {
        prefixUpperMax = Math.max(prefixUpperMax, entry.anchorScore + pairUpper);
      }
      considerSplit(index + 1, prefixUpperMax);
    }
    return {
      upperBound: bestUpperBound,
      anchorIndex: bestAnchorIndex,
      processedEntryCount: bestProcessedEntryCount,
    };
  };
  const finish = (
    localTimedOut: boolean,
    nextAnchorScore: number | null,
    nextAnchorIndex: number | null,
    skipRefine = false,
  ): MedleyExactCandidateAnchorFrontierProofResult => {
    const refineTimedOut = skipRefine ? false : refineProcessedAnchorUpperEntries();
    recordUnseenRefineProfiling();
    recordTargetedPairProofProfiling();
    if (!refineTimedOut) {
      repairProcessedPairCapacityMaxWithSharedPowerDual();
    }
    if (
      Number.isFinite(streamAnchorTailUpperBound)
      && (
        !Number.isFinite(processedUpperMax)
        || streamAnchorTailUpperBound > processedUpperMax
      )
    ) {
      processedUpperMax = streamAnchorTailUpperBound;
      processedUpperMaxSource = "stream-anchor-tail";
      processedUpperMaxAnchorScore = null;
      processedUpperMaxPairUpper = null;
      processedUpperMaxGeneratedPairUpper = null;
      processedUpperMaxLeftUnseenUpper = null;
      processedUpperMaxRightUnseenUpper = null;
      processedUpperMaxAnchorCandidate = null;
      processedUpperMaxLeftGeneratedCandidate = null;
      processedUpperMaxRightGeneratedCandidate = null;
    }
    const suffixProofTargetUpperBound = Number.isFinite(processedUpperMax)
      ? Math.max(incumbentScore, processedUpperMax)
      : incumbentScore;
    const suffixCover = estimateGeneratedAnchorSuffixCoverUpper(nextAnchorIndex);
    const suffixCoverTimedOut = suffixCover.abortReason !== null;
    const suffixCoverUpperBound = suffixCover.abortReason === null ? suffixCover.upperBound : null;
    const suffixGeneratedPairJoin = estimateGeneratedAnchorSuffixGeneratedPairJoinUpper(
      nextAnchorIndex,
      suffixProofTargetUpperBound,
    );
    targetedPairProofResult = compareMedleyResultLike(targetedPairProofResult, suffixGeneratedPairJoin.result);
    const suffixGeneratedPairJoinTimedOut = suffixGeneratedPairJoin.abortReason !== null;
    const suffixLeftUnseenSingleCardJoin = estimateSuffixGeneratedUnseenSingleCardJoinUpper(
      nextAnchorIndex,
      rightCandidates,
      leftSlotIndex,
      finiteScore(leftPeekUpperBound),
      suffixProofTargetUpperBound,
    );
    const suffixRightUnseenSingleCardJoin = estimateSuffixGeneratedUnseenSingleCardJoinUpper(
      nextAnchorIndex,
      leftCandidates,
      rightSlotIndex,
      finiteScore(rightPeekUpperBound),
      suffixProofTargetUpperBound,
    );
    const suffixUnseenSingleCardJoinAbortReason = (
      suffixLeftUnseenSingleCardJoin.abortReason
      ?? suffixRightUnseenSingleCardJoin.abortReason
    );
    const suffixUnseenSingleCardJoinTimedOut = suffixUnseenSingleCardJoinAbortReason !== null;
    const suffixJoinUpperBound = (
      shouldUseSuffixUnseenFullJoin
      && suffixGeneratedPairJoin.abortReason === null
      && suffixGeneratedPairJoin.upperBound !== null
      && suffixLeftUnseenSingleCardJoin.abortReason === null
      && suffixLeftUnseenSingleCardJoin.upperBound !== null
      && suffixRightUnseenSingleCardJoin.abortReason === null
      && suffixRightUnseenSingleCardJoin.upperBound !== null
    )
      ? Math.max(
        suffixGeneratedPairJoin.upperBound,
        suffixLeftUnseenSingleCardJoin.upperBound,
        suffixRightUnseenSingleCardJoin.upperBound,
      )
      : null;
    const pairAnchorCover = estimatePairAnchorCoverUpper(nextAnchorIndex);
    const pairAnchorCoverTimedOut = pairAnchorCover.abortReason !== null;
    const suffixUpperBounds = [
      suffixCoverUpperBound,
      suffixJoinUpperBound,
      pairAnchorCover.abortReason === null ? pairAnchorCover.upperBound : null,
    ].filter((upperBound): upperBound is number => (
      upperBound !== null && Number.isFinite(upperBound)
    ));
    const suffixCoveredUpperBound = suffixUpperBounds.length > 0
      ? Math.min(...suffixUpperBounds)
      : null;
    const processedUnseenJoin = estimateProcessedGeneratedUnseenJoinUpper();
    const processedUnseenJoinTimedOut = processedUnseenJoin.abortReason !== null;
    if (
      processedUnseenJoin.abortReason === null
      && processedUnseenJoin.upperBound !== null
      && Number.isFinite(processedUnseenJoin.upperBound)
      && (
        !Number.isFinite(processedUpperMax)
        || processedUnseenJoin.upperBound < processedUpperMax
      )
    ) {
      processedUpperMax = processedUnseenJoin.upperBound;
      processedUpperMaxSource = "processed-unseen-join";
      processedUpperMaxPairUpper = null;
      processedUpperMaxGeneratedPairUpper = null;
      processedUpperMaxLeftUnseenUpper = null;
      processedUpperMaxRightUnseenUpper = null;
      processedUpperMaxAnchorCandidate = null;
      processedUpperMaxLeftGeneratedCandidate = null;
      processedUpperMaxRightGeneratedCandidate = null;
    }
    if (
      Number.isFinite(streamAnchorTailUpperBound)
      && (
        !Number.isFinite(processedUpperMax)
        || streamAnchorTailUpperBound > processedUpperMax
      )
    ) {
      processedUpperMax = streamAnchorTailUpperBound;
      processedUpperMaxSource = "stream-anchor-tail";
      processedUpperMaxAnchorScore = null;
      processedUpperMaxPairUpper = null;
      processedUpperMaxGeneratedPairUpper = null;
      processedUpperMaxLeftUnseenUpper = null;
      processedUpperMaxRightUnseenUpper = null;
      processedUpperMaxAnchorCandidate = null;
      processedUpperMaxLeftGeneratedCandidate = null;
      processedUpperMaxRightGeneratedCandidate = null;
    }
    recordPairCapacityBreakdownForProcessedMax();
    const elapsedMs = performance.now() - startedAt;
    const unprocessedUpper = getUnprocessedUpperBound(nextAnchorScore, suffixCoveredUpperBound);
    let observedUpperBound = getResidualUpperBound(nextAnchorScore, suffixCoveredUpperBound);
    let residualSourceOverride: string | null = null;
    const bestPrefixResidual = estimateBestPrefixResidualUpper(nextAnchorScore, nextAnchorIndex);
    let bestPrefixResidualImprovement = 0;
    if (
      observedUpperBound !== null
      && bestPrefixResidual.upperBound !== null
      && Number.isFinite(bestPrefixResidual.upperBound)
      && bestPrefixResidual.upperBound < observedUpperBound
    ) {
      bestPrefixResidualImprovement = observedUpperBound - bestPrefixResidual.upperBound;
      observedUpperBound = bestPrefixResidual.upperBound;
      residualSourceOverride = "best-prefix-residual";
    }
    let rewindAttemptCount = 0;
    let rewindImprovementCount = 0;
    let rewindUpperBound: number | null = null;
    let rewindSplitAnchorIndex: number | null = null;
    let rewindProcessedEntryCount: number | null = null;
    let rewindElapsedMs: number | null = null;
    let rewindAbortReason: string | null = null;
    let bestPrefixSplitAttemptCount = 0;
    let bestPrefixSplitImprovementCount = 0;
    let bestPrefixSplitUpperBound: number | null = null;
    let bestPrefixSplitAnchorIndex: number | null = null;
    let bestPrefixSplitProcessedEntryCount: number | null = null;
    let bestPrefixSplitElapsedMs: number | null = null;
    let bestPrefixSplitAbortReason: string | null = null;
    if (
      shouldRewindBothUnseen
      && observedUpperBound !== null
      && processedUnseenJoin.abortReason === null
      && processedUnseenJoin.maxSource === "both-unseen-fallback"
      && processedUnseenJoin.maxEntryIndex !== null
      && processedUnseenJoin.maxEntryIndex > 0
      && performance.now() < localDeadlineAt
    ) {
      rewindAttemptCount = 1;
      const rewindStartedAt = performance.now();
      const splitEntryIndex = processedUnseenJoin.maxEntryIndex;
      const splitEntry = processedAnchorUpperEntries[splitEntryIndex];
      rewindProcessedEntryCount = splitEntryIndex;
      rewindSplitAnchorIndex = splitEntry?.anchorIndex ?? null;
      if (!splitEntry || rewindSplitAnchorIndex === null) {
        rewindAbortReason = "missing-split-entry";
      } else {
        let rewindProcessedUpperMax = estimateProcessedPrefixUpperMax(splitEntryIndex);
        const rewindProcessedUnseenJoin = estimateProcessedGeneratedUnseenJoinUpper(splitEntryIndex);
        if (rewindProcessedUnseenJoin.abortReason !== null) {
          rewindAbortReason = `processed-unseen-${rewindProcessedUnseenJoin.abortReason}`;
        } else {
          if (
            rewindProcessedUnseenJoin.upperBound !== null
            && Number.isFinite(rewindProcessedUnseenJoin.upperBound)
            && (
              !Number.isFinite(rewindProcessedUpperMax)
              || rewindProcessedUnseenJoin.upperBound < rewindProcessedUpperMax
            )
          ) {
            rewindProcessedUpperMax = rewindProcessedUnseenJoin.upperBound;
          }
          const rewindSuffixCover = estimateGeneratedAnchorSuffixCoverUpper(rewindSplitAnchorIndex);
          const rewindSuffixProofTargetUpperBound = Number.isFinite(rewindProcessedUpperMax)
            ? Math.max(incumbentScore, rewindProcessedUpperMax)
            : incumbentScore;
          const rewindSuffixGeneratedPairJoin = estimateGeneratedAnchorSuffixGeneratedPairJoinUpper(
            rewindSplitAnchorIndex,
            rewindSuffixProofTargetUpperBound,
          );
          targetedPairProofResult = compareMedleyResultLike(
            targetedPairProofResult,
            rewindSuffixGeneratedPairJoin.result,
          );
          const rewindSuffixLeftUnseenSingleCardJoin = estimateSuffixGeneratedUnseenSingleCardJoinUpper(
            rewindSplitAnchorIndex,
            rightCandidates,
            leftSlotIndex,
            finiteScore(leftPeekUpperBound),
            rewindSuffixProofTargetUpperBound,
          );
          const rewindSuffixRightUnseenSingleCardJoin = estimateSuffixGeneratedUnseenSingleCardJoinUpper(
            rewindSplitAnchorIndex,
            leftCandidates,
            rightSlotIndex,
            finiteScore(rightPeekUpperBound),
            rewindSuffixProofTargetUpperBound,
          );
          rewindAbortReason = (
            rewindSuffixCover.abortReason
            ?? rewindSuffixGeneratedPairJoin.abortReason
            ?? rewindSuffixLeftUnseenSingleCardJoin.abortReason
            ?? rewindSuffixRightUnseenSingleCardJoin.abortReason
          );
          if (rewindAbortReason === null) {
            const rewindSuffixJoinUpperBound = (
              shouldUseSuffixUnseenFullJoin
              && rewindSuffixGeneratedPairJoin.upperBound !== null
              && rewindSuffixLeftUnseenSingleCardJoin.upperBound !== null
              && rewindSuffixRightUnseenSingleCardJoin.upperBound !== null
            )
              ? Math.max(
                rewindSuffixGeneratedPairJoin.upperBound,
                rewindSuffixLeftUnseenSingleCardJoin.upperBound,
                rewindSuffixRightUnseenSingleCardJoin.upperBound,
              )
              : null;
            const rewindSuffixUpperBounds = [
              rewindSuffixCover.upperBound,
              rewindSuffixJoinUpperBound,
            ].filter((upperBound): upperBound is number => (
              upperBound !== null && Number.isFinite(upperBound)
            ));
            const rewindSuffixCoveredUpperBound = rewindSuffixUpperBounds.length > 0
              ? Math.min(...rewindSuffixUpperBounds)
              : null;
            const rewindNextAnchorScore = anchorCandidates[rewindSplitAnchorIndex]?.result.score ?? null;
            rewindUpperBound = getResidualUpperBoundForProcessedMax(
              rewindProcessedUpperMax,
              rewindNextAnchorScore,
              rewindSuffixCoveredUpperBound,
            );
            if (rewindUpperBound !== null && rewindUpperBound < observedUpperBound) {
              observedUpperBound = rewindUpperBound;
              residualSourceOverride = "rewind";
              rewindImprovementCount = 1;
            }
          }
        }
      }
      rewindElapsedMs = performance.now() - rewindStartedAt;
    }
    if (
      shouldUseBestPrefixSplit
      && observedUpperBound !== null
      && processedAnchorUpperEntries.length > 1
      && performance.now() < localDeadlineAt
    ) {
      const bestPrefixStartedAt = performance.now();
      const splitEntryLimits: number[] = [];
      const addSplitEntryLimit = (entryLimit: number | null | undefined): void => {
        if (
          entryLimit === null
          || entryLimit === undefined
          || !Number.isFinite(entryLimit)
        ) {
          return;
        }
        const normalizedEntryLimit = Math.max(
          1,
          Math.min(processedAnchorUpperEntries.length - 1, Math.trunc(entryLimit)),
        );
        if (!splitEntryLimits.includes(normalizedEntryLimit)) {
          splitEntryLimits.push(normalizedEntryLimit);
        }
      };
      addSplitEntryLimit(Math.floor(processedAnchorUpperEntries.length * 0.8));
      addSplitEntryLimit(Math.floor(processedAnchorUpperEntries.length * 0.75));
      addSplitEntryLimit(Math.floor(processedAnchorUpperEntries.length * 0.85));
      addSplitEntryLimit(processedUnseenJoin.maxEntryIndex);
      if (processedUnseenJoin.maxEntryIndex !== null) {
        addSplitEntryLimit(processedUnseenJoin.maxEntryIndex + 1);
      }
      addSplitEntryLimit(Math.floor(processedAnchorUpperEntries.length * 2 / 3));
      addSplitEntryLimit(Math.floor(processedAnchorUpperEntries.length * 0.9));

      for (const splitEntryLimit of splitEntryLimits.slice(0, bestPrefixSplitMaxAttempts)) {
        if (performance.now() >= localDeadlineAt) {
          bestPrefixSplitAbortReason = "timebox";
          break;
        }
        bestPrefixSplitAttemptCount += 1;
        let prefixProcessedUpperMax = estimateProcessedPrefixUpperMax(splitEntryLimit);
        const prefixProcessedUnseenJoin = estimateProcessedGeneratedUnseenJoinUpper(splitEntryLimit);
        if (prefixProcessedUnseenJoin.abortReason !== null) {
          bestPrefixSplitAbortReason = `processed-unseen-${prefixProcessedUnseenJoin.abortReason}`;
          break;
        }
        if (
          prefixProcessedUnseenJoin.upperBound !== null
          && Number.isFinite(prefixProcessedUnseenJoin.upperBound)
          && (
            !Number.isFinite(prefixProcessedUpperMax)
            || prefixProcessedUnseenJoin.upperBound < prefixProcessedUpperMax
          )
        ) {
          prefixProcessedUpperMax = prefixProcessedUnseenJoin.upperBound;
        }
        const splitAnchorIndex = processedAnchorUpperEntries[splitEntryLimit]?.anchorIndex ?? nextAnchorIndex;
        const splitNextAnchorScore = splitAnchorIndex !== null
          ? anchorCandidates[splitAnchorIndex]?.result.score ?? null
          : nextAnchorScore;
        const splitUpperBound = getResidualUpperBoundForProcessedMax(
          prefixProcessedUpperMax,
          splitNextAnchorScore,
          null,
        );
        if (
          splitUpperBound !== null
          && Number.isFinite(splitUpperBound)
          && splitUpperBound < observedUpperBound
        ) {
          observedUpperBound = splitUpperBound;
          residualSourceOverride = "best-prefix-split";
          bestPrefixSplitImprovementCount += 1;
          bestPrefixSplitUpperBound = splitUpperBound;
          bestPrefixSplitAnchorIndex = splitAnchorIndex;
          bestPrefixSplitProcessedEntryCount = splitEntryLimit;
        }
      }
      bestPrefixSplitElapsedMs = performance.now() - bestPrefixStartedAt;
    }
    const proofThreshold = Math.max(
      incumbentScore,
      targetedPairProofResult?.score ?? Number.NEGATIVE_INFINITY,
    );
    if (
      localTimedOut
      || refineTimedOut
      || suffixCoverTimedOut
      || suffixGeneratedPairJoinTimedOut
      || suffixUnseenSingleCardJoinTimedOut
      || pairAnchorCoverTimedOut
      || processedUnseenJoinTimedOut
    ) {
      profiling.exactCandidateJoinAnchorFrontierCheapUpperTimeboxCount += 1;
    }
    if (
      observedUpperBound !== null
      && Number.isFinite(initialLooseUpperBound)
      && observedUpperBound < initialLooseUpperBound
    ) {
      profiling.exactCandidateJoinAnchorFrontierCheapUpperImprovementCount += 1;
    }
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedAnchorCount = processedAnchorCount;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperResidualUpperBound = observedUpperBound !== null
      ? Math.ceil(observedUpperBound)
      : null;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperResidualGap = observedUpperBound !== null
      ? Math.max(0, Math.ceil(observedUpperBound) - incumbentScore)
      : null;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperElapsedMs = Math.round(elapsedMs);
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPeakHeapMiB = stats.peakUsedHeapMiB;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxSource = processedUpperMaxSource;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxAnchorCardIds = (
      processedUpperMaxAnchorCandidate ? [...processedUpperMaxAnchorCandidate.cardIds] : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxAnchorScore = processedUpperMaxAnchorScore;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxPairUpper = processedUpperMaxPairUpper;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairUpper = processedUpperMaxGeneratedPairUpper;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxLeftUnseenUpper = processedUpperMaxLeftUnseenUpper;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxRightUnseenUpper = processedUpperMaxRightUnseenUpper;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxLeftGeneratedCardIds = (
      processedUpperMaxLeftGeneratedCandidate ? [...processedUpperMaxLeftGeneratedCandidate.cardIds] : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxRightGeneratedCardIds = (
      processedUpperMaxRightGeneratedCandidate ? [...processedUpperMaxRightGeneratedCandidate.cardIds] : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperResidualSource = residualSourceOverride ?? ((
        Number.isFinite(unprocessedUpper.upperBound)
        && (!Number.isFinite(processedUpperMax) || unprocessedUpper.upperBound >= processedUpperMax)
      )
        ? unprocessedUpper.source
        : processedUpperMaxSource);
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperUnprocessedAnchorScore = (
      unprocessedUpper.anchorScore
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperUnprocessedPairUpper = unprocessedUpper.pairUpper;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixCoverCandidateCount = (
      suffixCover.candidateCount
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixCoverDistinctCardCount = (
      suffixCover.distinctCardCount
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixCoverDistinctCardSetCount = (
      suffixCover.distinctCardSetCount
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixCoverMode = shouldUseSuffixCover
      ? shouldUseMultiCardSuffixCover
        ? "multi-card"
        : "single-card"
      : null;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixCoverUpperBound = (
      suffixCover.upperBound !== null ? Math.ceil(suffixCover.upperBound) : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixCoverElapsedMs = Math.round(
      suffixCover.elapsedMs,
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixCoverAbortReason = suffixCover.abortReason;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinAnchorCount = (
      suffixGeneratedPairJoin.anchorCount
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinPairRecordCount = (
      suffixGeneratedPairJoin.pairRecordCount
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinUpperBound = (
      suffixGeneratedPairJoin.upperBound !== null ? Math.ceil(suffixGeneratedPairJoin.upperBound) : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinElapsedMs = Math.round(
      suffixGeneratedPairJoin.elapsedMs,
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinAbortReason = (
      suffixGeneratedPairJoin.abortReason
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxScoreUpper = (
      suffixGeneratedPairJoin.maxScoreUpper !== null ? Math.ceil(suffixGeneratedPairJoin.maxScoreUpper) : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxAnchorScore = (
      suffixGeneratedPairJoin.maxAnchorScore
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxPairScoreOnly = (
      suffixGeneratedPairJoin.maxPairScoreOnly
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxPairFullScore = (
      suffixGeneratedPairJoin.maxPairFullScore
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxPairScoreSlack = (
      suffixGeneratedPairJoin.maxPairScoreSlack
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxAnchorCardIds = (
      suffixGeneratedPairJoin.maxAnchorCardIds
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxLeftCardIds = (
      suffixGeneratedPairJoin.maxLeftCardIds
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxRightCardIds = (
      suffixGeneratedPairJoin.maxRightCardIds
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxLeftIndex = (
      suffixGeneratedPairJoin.maxLeftIndex
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxRightIndex = (
      suffixGeneratedPairJoin.maxRightIndex
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixGeneratedPairJoinMaxPairRecordIndex = (
      suffixGeneratedPairJoin.maxPairRecordIndex
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixUnseenSingleCardJoinLeftUpperBound = (
      suffixLeftUnseenSingleCardJoin.upperBound !== null
        ? Math.ceil(suffixLeftUnseenSingleCardJoin.upperBound)
        : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixUnseenSingleCardJoinRightUpperBound = (
      suffixRightUnseenSingleCardJoin.upperBound !== null
        ? Math.ceil(suffixRightUnseenSingleCardJoin.upperBound)
        : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixUnseenSingleCardJoinPairCount = (
      suffixLeftUnseenSingleCardJoin.pairCount + suffixRightUnseenSingleCardJoin.pairCount
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixUnseenSingleCardJoinElapsedMs = Math.round(
      suffixLeftUnseenSingleCardJoin.elapsedMs + suffixRightUnseenSingleCardJoin.elapsedMs,
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixUnseenSingleCardJoinAbortReason = (
      suffixUnseenSingleCardJoinAbortReason
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSuffixUnseenJoinMode = shouldUseSuffixUnseenJoin
      ? shouldUseSuffixUnseenFullJoin
        ? "full-card"
        : "single-card"
      : null;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinUpperBound = (
      processedUnseenJoin.upperBound !== null ? Math.ceil(processedUnseenJoin.upperBound) : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinPairCount = (
      processedUnseenJoin.pairCount
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinElapsedMs = Math.round(
      processedUnseenJoin.elapsedMs,
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinAbortReason = (
      processedUnseenJoin.abortReason
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinMaxSource = (
      processedUnseenJoin.maxSource
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinMaxAnchorScore = (
      processedUnseenJoin.maxAnchorScore
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinMaxGeneratedPairUpper = (
      processedUnseenJoin.maxGeneratedPairUpper
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinMaxBothUnseenFallbackPairUpper = (
      processedUnseenJoin.maxBothUnseenFallbackPairUpper
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinMaxGeneratedCandidateScore = (
      processedUnseenJoin.maxGeneratedCandidateScore
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinMaxGeneratedUnseenUpper = (
      processedUnseenJoin.maxGeneratedUnseenUpper
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinMaxEntryIndex = (
      processedUnseenJoin.maxEntryIndex
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinMaxGeneratedIndex = (
      processedUnseenJoin.maxGeneratedIndex
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedUnseenJoinMaxUnseenSlotIndex = (
      processedUnseenJoin.maxUnseenSlotIndex
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperRewindAttemptCount = rewindAttemptCount;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperRewindImprovementCount = rewindImprovementCount;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperRewindUpperBound = (
      rewindUpperBound !== null ? Math.ceil(rewindUpperBound) : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperRewindSplitAnchorIndex = rewindSplitAnchorIndex;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperRewindProcessedEntryCount = rewindProcessedEntryCount;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperRewindElapsedMs = (
      rewindElapsedMs !== null ? Math.round(rewindElapsedMs) : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperRewindAbortReason = rewindAbortReason;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixSplitAttemptCount = (
      bestPrefixSplitAttemptCount
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixSplitImprovementCount = (
      bestPrefixSplitImprovementCount
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixSplitUpperBound = (
      bestPrefixSplitUpperBound !== null ? Math.ceil(bestPrefixSplitUpperBound) : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixSplitAnchorIndex = (
      bestPrefixSplitAnchorIndex
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixSplitProcessedEntryCount = (
      bestPrefixSplitProcessedEntryCount
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixSplitElapsedMs = (
      bestPrefixSplitElapsedMs !== null ? Math.round(bestPrefixSplitElapsedMs) : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixSplitAbortReason = (
      bestPrefixSplitAbortReason
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixResidualUpperBound = (
      bestPrefixResidual.upperBound !== null ? Math.ceil(bestPrefixResidual.upperBound) : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixResidualImprovement = (
      bestPrefixResidualImprovement > 0 ? Math.ceil(bestPrefixResidualImprovement) : 0
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixResidualAnchorIndex = (
      bestPrefixResidual.anchorIndex
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixResidualProcessedEntryCount = (
      bestPrefixResidual.processedEntryCount
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairAnchorCoverUpperBound = (
      pairAnchorCover.upperBound !== null ? Math.ceil(pairAnchorCover.upperBound) : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairAnchorCoverPairCount = (
      pairAnchorCover.pairCount
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairAnchorCoverDistinctCardCount = (
      pairAnchorCover.distinctCardCount
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairAnchorCoverElapsedMs = Math.round(
      pairAnchorCover.elapsedMs,
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPairAnchorCoverAbortReason = (
      pairAnchorCover.abortReason
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperStreamAnchorTailCandidateCount = (
      streamAnchorTailCandidateCount
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperStreamAnchorTailPeekBefore = (
      streamAnchorTailPeekBefore !== null && Number.isFinite(streamAnchorTailPeekBefore)
        ? Math.ceil(streamAnchorTailPeekBefore)
        : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperStreamAnchorTailPeekAfter = (
      streamAnchorTailPeekAfter !== null && Number.isFinite(streamAnchorTailPeekAfter)
        ? Math.ceil(streamAnchorTailPeekAfter)
        : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperStreamAnchorTailGlobalPeekBefore = (
      streamAnchorTailGlobalPeekBefore !== null && Number.isFinite(streamAnchorTailGlobalPeekBefore)
        ? Math.ceil(streamAnchorTailGlobalPeekBefore)
        : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperStreamAnchorTailGlobalPeekAfter = (
      streamAnchorTailGlobalPeekAfter !== null && Number.isFinite(streamAnchorTailGlobalPeekAfter)
        ? Math.ceil(streamAnchorTailGlobalPeekAfter)
        : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperStreamAnchorTailUpperBound = (
      Number.isFinite(streamAnchorTailUpperBound) ? Math.ceil(streamAnchorTailUpperBound) : null
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperStreamAnchorTailElapsedMs = Math.round(
      streamAnchorTailElapsedMs,
    );
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperStreamAnchorTailAbortReason = (
      streamAnchorTailAbortReason
    );
    if (processedUpperMaxLeftGeneratedCandidate && processedUpperMaxRightGeneratedCandidate) {
      const generatedPairOverlaps = medleyExactCandidatesOverlap(
        processedUpperMaxLeftGeneratedCandidate,
        processedUpperMaxRightGeneratedCandidate,
      );
      profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairOverlaps = generatedPairOverlaps;
      profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairScoreOnly = (
        processedUpperMaxLeftGeneratedCandidate.result.score
        + processedUpperMaxRightGeneratedCandidate.result.score
      );
      if (!generatedPairOverlaps) {
        const leftResultCandidate = hydrateMedleyExactCandidateForResult(
          slots[leftSlotIndex],
          processedUpperMaxLeftGeneratedCandidate,
          server,
          perfectRate,
          stats,
          profiling,
        );
        const rightResultCandidate = hydrateMedleyExactCandidateForResult(
          slots[rightSlotIndex],
          processedUpperMaxRightGeneratedCandidate,
          server,
          perfectRate,
          stats,
          profiling,
        );
        const fullScore = leftResultCandidate && rightResultCandidate
          ? leftResultCandidate.result.score + rightResultCandidate.result.score
          : null;
        profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairFullScore = fullScore;
        profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairScoreSlack = fullScore !== null
          ? (
            processedUpperMaxLeftGeneratedCandidate.result.score
            + processedUpperMaxRightGeneratedCandidate.result.score
            - fullScore
          )
          : null;
      }
    }
    return {
      proved: observedUpperBound !== null && observedUpperBound <= proofThreshold,
      localTimedOut: (
        localTimedOut
        || refineTimedOut
        || suffixCoverTimedOut
        || suffixGeneratedPairJoinTimedOut
        || suffixUnseenSingleCardJoinTimedOut
        || pairAnchorCoverTimedOut
        || processedUnseenJoinTimedOut
      ),
      result: targetedPairProofResult,
      observedUpperBound,
      processedAnchorCount,
      residualUpperBound: observedUpperBound,
      elapsedMs,
    };
  };

  for (let anchorIndex = 0; anchorIndex < maxAnchorCount; anchorIndex += 1) {
    const anchorCandidate = anchorCandidates[anchorIndex];
    if (performance.now() >= localDeadlineAt) {
      return finish(true, anchorCandidate.result.score, anchorIndex);
    }
    if (
      Number.isFinite(processedUpperMax)
      && Number.isFinite(pairUpperBound)
      && anchorCandidate.result.score + pairUpperBound <= processedUpperMax
    ) {
      let shouldContinueAfterRefine = false;
      let refinePassCount = 0;
      while (true) {
        const processedUpperMaxBeforeRefine = processedUpperMax;
        const refineTimedOut = refineProcessedAnchorUpperEntries();
        if (refineTimedOut) {
          return finish(true, anchorCandidate.result.score, anchorIndex, true);
        }
        if (anchorCandidate.result.score + pairUpperBound > processedUpperMax) {
          shouldContinueAfterRefine = true;
          break;
        }
        refinePassCount += 1;
        if (
          !Number.isFinite(processedUpperMaxBeforeRefine)
          || processedUpperMax >= processedUpperMaxBeforeRefine
          || refinePassCount >= 16
          || performance.now() >= localDeadlineAt
        ) {
          break;
        }
      }
      if (shouldContinueAfterRefine) {
        continue;
      }
      return finish(false, anchorCandidate.result.score, anchorIndex, true);
    }
    const pairUpperForAnchor = estimatePairUpperForAnchor(anchorCandidate);
    processedAnchorCount += 1;
    if (Number.isFinite(pairUpperForAnchor.upperBound)) {
      const anchorUpper = anchorCandidate.result.score + pairUpperForAnchor.upperBound;
      processedAnchorUpperEntries.push({
        anchorCandidate,
        anchorIndex,
        anchorScore: anchorCandidate.result.score,
        totalUpper: anchorUpper,
        pairUpper: pairUpperForAnchor.upperBound,
        source: pairUpperForAnchor.source,
        generatedPairUpper: pairUpperForAnchor.generatedPairUpper,
        leftUnseenUpper: pairUpperForAnchor.leftUnseenUpper,
        rightUnseenUpper: pairUpperForAnchor.rightUnseenUpper,
        leftGeneratedCandidate: pairUpperForAnchor.leftGeneratedCandidate,
        rightGeneratedCandidate: pairUpperForAnchor.rightGeneratedCandidate,
      });
      recordProcessedUpperMax(
        anchorCandidate.result.score,
        pairUpperForAnchor.upperBound,
        pairUpperForAnchor.source,
        pairUpperForAnchor.generatedPairUpper,
        pairUpperForAnchor.leftUnseenUpper,
        pairUpperForAnchor.rightUnseenUpper,
        pairUpperForAnchor.leftGeneratedCandidate,
        pairUpperForAnchor.rightGeneratedCandidate,
        anchorCandidate,
      );
    }
  }

  streamAnchorTailCandidates();
  return finish(
    streamAnchorTailAbortReason === "timebox",
    anchorCandidates[processedAnchorCount]?.result.score ?? null,
    processedAnchorCount,
  );
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
  observeEvaluatedResult?: MedleyEvaluatedResultObserver,
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
      const result = buildMedleyResult(slots, selectedBySong, configuration);
      if (result) {
        observeEvaluatedResult?.(result);
      }
      bestResult = compareMedleyResultLike(bestResult, result);
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
    skipSolveWhenObservedUpperAtOrBelow?: number;
    solveOnlyAboveUpperTarget?: number;
    enableExactJoinPrefixSeed?: boolean;
    exactJoinPrefixSeedForceNoop?: boolean;
    exactJoinPrefixSeedGuardOnly?: boolean;
    exactJoinPrefixSeedTimeboxMs?: number;
    exactJoinPrefixSeedMaxSmallestCandidateCount?: number;
    exactJoinPrefixSeedMinCandidateCounts?: [number, number, number];
    exactJoinPrefixSeedPreviousLocalTimeout?: boolean;
    exactJoinPrefixSeedMemorySoftLimitMiB?: number | null;
    exactJoinPrefixSeedMinProofBudgetMs?: number;
    exactJoinPrefixSeedMinMemoryHeadroomMiB?: number;
    exactJoinPrefixSeedMaxObservedGap?: number;
    exactCandidateJoinSolveOrderVariant?: string | null;
    exactCandidateJoinScoreCacheClearInterval?: number | null;
    exactCandidateJoinExtendedThirdShortlistSize?: number | null;
    exactCandidateJoinExtendedThirdShortlistCacheEntryLimit?: number | null;
    exactCandidateJoinExtendedThirdShortlistQueryLimit?: number | null;
    exactCandidateJoinZeroScoreTargetSlack?: boolean;
    enableExactCandidateJoinGlobalTailUpper?: boolean;
    enableExactCandidateJoinGlobalCapacityTailUpper?: boolean;
    exactCandidateJoinGlobalCapacityTailMinSelectedCards?: number | null;
    exactCandidateJoinGlobalCapacityTailMaxCalls?: number | null;
    exactCandidateJoinGlobalCapacityTailTimeboxMs?: number | null;
    stagedCandidateExtensionMinRemainingMs?: number | null;
    enableLowMemoryInitialCandidateSync?: boolean;
    lowMemoryInitialCandidateSyncLocalAbortOnly?: boolean;
    lowMemoryInitialCandidateSyncLightUpper?: boolean;
    lowMemoryInitialCandidateSyncTimeboxMs?: number;
    lowMemoryInitialCandidateSyncScoreCacheClearInterval?: number | null;
    lowMemoryInitialCandidateSyncDirectCandidate?: boolean;
    lowMemoryInitialCandidateSyncUnsafeActiveGeneratorAdvance?: boolean;
    shouldAbortLowMemoryInitialCandidateSync?: () => boolean;
    lowMemoryHighPairScanMinRecordCount?: number | null;
    lowMemoryHighPairPrefixRecordLimit?: number | null;
    lowMemoryHighPairRecordScan?: boolean;
    debugExactCandidateJoinMemoryAttribution?: boolean;
    enableConflictPairUpperBnb?: boolean;
    conflictPairUpperBnbNodeLimit?: number | null;
    conflictPairUpperBnbSlotSolveNodeLimit?: number | null;
    conflictPairUpperBnbMaxMemoryHeadroomMiB?: number | null;
    anchorFrontierProofMaxFrontierGap?: number | null;
    anchorFrontierProofMinRemainingMs?: number | null;
    anchorFrontierProofMaxOtherSlotCandidates?: number | null;
    anchorFrontierProofMaxOtherSlotCandidateTotal?: number | null;
    anchorFrontierProofMaxHighPairRecords?: number | null;
    anchorFrontierProofTimeboxMs?: number | null;
    anchorFrontierProofStopAtCheapUpper?: boolean;
    anchorFrontierProofStopAtCheapUpperMinProcessedAnchors?: number | null;
    anchorFrontierCheapUpperOnly?: boolean;
    anchorFrontierCheapUpperTimeboxMs?: number | null;
    anchorFrontierCheapUpperMinRemainingMs?: number | null;
    anchorFrontierCheapUpperMaxAnchors?: number | null;
    anchorFrontierCheapUpperStreamAnchorTail?: boolean;
    anchorFrontierCheapUpperStreamAnchorTailMaxCandidates?: number | null;
    anchorFrontierCheapUpperStreamAnchorTailTimeboxMs?: number | null;
    anchorFrontierCheapUpperStreamAnchorTailGlobalPruning?: boolean;
    anchorFrontierCheapUpperRefineUnseen?: boolean;
    anchorFrontierCheapUpperRefineTopAnchors?: number | null;
    anchorFrontierCheapUpperUnseenRefineMaxGeneratedCandidates?: number | null;
    anchorFrontierCheapUpperProcessedUnseenJoin?: boolean;
    anchorFrontierCheapUpperRewindBothUnseen?: boolean;
    anchorFrontierCheapUpperBestPrefixSplit?: boolean;
    anchorFrontierCheapUpperBestPrefixSplitMaxAttempts?: number | null;
    anchorFrontierCheapUpperPairAnchorCover?: boolean;
    anchorFrontierCheapUpperPairAnchorCoverMaxPairs?: number | null;
    anchorFrontierCheapUpperLocalPairSlotExtension?: boolean;
    anchorFrontierCheapUpperLocalPairSlotExtensionSlotIndex?: number | null;
    anchorFrontierCheapUpperLocalPairSlotExtensionMaxCandidates?: number | null;
    anchorFrontierCheapUpperLocalPairSlotExtensionTimeboxMs?: number | null;
    anchorFrontierCheapUpperPairCapacityCap?: boolean;
    anchorFrontierCheapUpperPairCapacityCapPareto?: boolean;
    anchorFrontierCheapUpperPairCapacityCapBucketed?: boolean;
    anchorFrontierCheapUpperPairCapacityBreakdown?: boolean;
    anchorFrontierCheapUpperPairCapacitySharedPowerDualCap?: boolean;
    anchorFrontierCheapUpperPairCapacitySharedPowerDualCapMaxCalls?: number | null;
    anchorFrontierCheapUpperPairCapacitySharedPowerDualReuseMaxCalls?: number | null;
    anchorFrontierCheapUpperPairCapacitySharedPowerDualLateMaxRepair?: boolean;
    anchorFrontierCheapUpperPairCapacitySharedPowerDualLateMaxRepairExtraCalls?: number | null;
    anchorFrontierCheapUpperPairCapacitySharedPowerBreakdown?: boolean;
    anchorFrontierCheapUpperPairCapacitySharedPowerStateBudget?: number | null;
    anchorFrontierCheapUpperTargetedPairProofTimeboxMs?: number | null;
    anchorFrontierCheapUpperTargetedPairProofMaxEntries?: number | null;
    anchorFrontierCheapUpperTargetedPairProofCandidateLimit?: number | null;
    anchorFrontierCheapUpperTargetedPairBnbNodeLimit?: number | null;
    anchorFrontierCheapUpperTargetedPairBnbSlotSolveNodeLimit?: number | null;
    anchorFrontierCheapUpperSuffixCover?: boolean;
    anchorFrontierCheapUpperMultiCardSuffixCover?: boolean;
    anchorFrontierCheapUpperSuffixGeneratedPairJoin?: boolean;
    anchorFrontierCheapUpperSuffixUnseenSingleCardJoin?: boolean;
    anchorFrontierCheapUpperSuffixUnseenFullJoin?: boolean;
  } = {},
  observeEvaluatedResult?: MedleyEvaluatedResultObserver,
): MedleyExactCandidateJoinResult {
  // This wrapper proves one area-item configuration. The caller remains responsible for
  // aggregating configuration-level proof across locked/all scopes before reporting exact.
  const exactJoinStartedAt = performance.now();
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
    profiling.exactCandidateJoinLastAnchorFrontierProofSkipReason = null;
    profiling.exactCandidateJoinLastAnchorFrontierProofHighPairRecordUpperCount = null;
    profiling.exactCandidateJoinLastAnchorFrontierImprovementProbeProcessedAnchorCount = null;
    profiling.exactCandidateJoinLastAnchorFrontierImprovementProbeElapsedMs = null;
    profiling.exactCandidateJoinLastAnchorFrontierImprovementProbeScore = null;
    profiling.exactCandidateJoinLastAnchorFrontierProofSlotIndex = null;
    profiling.exactCandidateJoinLastAnchorFrontierProofProcessedAnchorCount = null;
    profiling.exactCandidateJoinLastAnchorFrontierProofResidualUpperBound = null;
    profiling.exactCandidateJoinLastAnchorFrontierProofResidualGap = null;
    profiling.exactCandidateJoinLastAnchorFrontierProofElapsedMs = null;
    profiling.exactCandidateJoinLastAnchorFrontierProofTimeboxMs = null;
    profiling.exactCandidateJoinLastAnchorFrontierProofOtherSlotCandidateCounts = [];
    profiling.exactCandidateJoinLastAnchorFrontierProofPeakHeapMiB = null;
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
  const solveOnlyAboveUpperTarget = context.solveOnlyAboveUpperTarget !== undefined
    && Number.isFinite(context.solveOnlyAboveUpperTarget)
    && context.solveOnlyAboveUpperTarget > incumbentScore
    ? context.solveOnlyAboveUpperTarget
    : null;
  let exactJoinProofCutoffScore = solveOnlyAboveUpperTarget ?? incumbentScore;
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
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateScoreCacheClearInterval = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateSlotIndex = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortReason = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateVisitedNodeCount = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluatedTeamCount = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestScore = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestCardIds = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestCardInstanceKeys = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestSkillIds = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestPowers = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateStartUsedMiB = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateStartNodeHeapMiB = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateStartRssMiB = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitUsedMiB = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitNodeHeapMiB = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitRssMiB = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeUsedMiB = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterUsedMiB = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeNodeHeapMiB = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterNodeHeapMiB = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeRssMiB = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterRssMiB = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortUsedMiB = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortLimitMiB = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortHeadroomMiB = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortNodeHeapMiB = null;
  profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortRssMiB = null;

  const generators = slots.map((slot) => createMedleyExactSlotCandidateGenerator(
    slot,
    server,
    perfectRate,
    stats,
    profiling,
    isPastDeadline,
    deadlineAt,
    nodeSoftLimit,
    context.lowMemoryHighPairScanMinRecordCount ?? null,
    context.lowMemoryHighPairPrefixRecordLimit ?? null,
    context.lowMemoryHighPairRecordScan === true,
    context.exactCandidateJoinScoreCacheClearInterval ?? null,
  ));
  const candidatesBySlot: MedleyTeamCandidate[][] = Array.from({ length: slots.length }, () => []);
  const bestSlotScores: number[] = [];
  const exactPairUpperByExcludedSlot: Array<number | null> = Array.from({ length: slots.length }, () => null);
  const exactPairUnseenUpperByExcludedSlot: Array<number | null> = Array.from({ length: slots.length }, () => null);
  let candidateFillGenerators: MedleyExactSlotCandidateGenerator[] = [];
  let prefixSeedResult: BandoriMedleyTeamSearchResult | null = null;
  const applyPrefixSeedResult = (
    result: BandoriMedleyTeamSearchResult | null,
  ): BandoriMedleyTeamSearchResult | null => compareMedleyResultLike(result, prefixSeedResult);
  let didReleaseCandidateArrays = false;
  const releaseCandidateArrays = (): void => {
    if (didReleaseCandidateArrays) {
      return;
    }
    didReleaseCandidateArrays = true;
    for (const candidates of candidatesBySlot) {
      candidates.length = 0;
    }
  };
  let didReleaseExactJoinWorkingSet = false;
  const releaseExactJoinWorkingSet = (): void => {
    releaseCandidateArrays();
    if (didReleaseExactJoinWorkingSet) {
      return;
    }
    didReleaseExactJoinWorkingSet = true;
    for (const generator of new Set([...generators, ...candidateFillGenerators])) {
      generator.release();
    }
    for (const slot of slots) {
      releaseMedleyScoreOnlyTeamEvaluationCache(slot);
    }
  };
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
  const recordGeneratorOnlyMemorySnapshot = (
    phase: string,
    extra: Record<string, unknown> = {},
  ): void => {
    if (context.debugExactCandidateJoinMemoryAttribution !== true) {
      return;
    }
    const uniqueGenerators = [...new Set([...generators, ...candidateFillGenerators])];
    const generatorProfiles = uniqueGenerators.map((generator, index) => ({
      index,
      ...(generator.memoryProfile ? generator.memoryProfile() : {}),
    }));
    const candidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
    profiling.exactCandidateJoinMemorySnapshots.push({
      phase,
      elapsedMs: Math.round(performance.now() - exactJoinStartedAt),
      peakUsedHeapMiB: stats.peakUsedHeapMiB,
      candidateCountsBySlot,
      candidateCountTotal: candidateCountsBySlot.reduce((sum, count) => sum + count, 0),
      exactCandidateJoinPairCount: profiling.exactCandidateJoinPairCount,
      exactCandidateJoinPairComplementQueryCount: profiling.exactCandidateJoinPairComplementQueryCount,
      exactCandidateJoinPairComplementHighPairRecordCount: (
        profiling.exactCandidateJoinPairComplementHighPairRecordCount
      ),
      generatorProfiles,
      ...extra,
    });
  };
  const buildUnprovedExactCandidateJoinResult = (
    result: BandoriMedleyTeamSearchResult | null = null,
    observedUpperBound: number | null = getObservedExactCandidateJoinUpperBound(),
  ): MedleyExactCandidateJoinResult => {
    releaseExactJoinWorkingSet();
    const resultWithPrefixSeed = applyPrefixSeedResult(result);
    const observedUpperBoundWithPrefixSeed = (
      observedUpperBound !== null && resultWithPrefixSeed
        ? Math.max(observedUpperBound, resultWithPrefixSeed.score)
        : observedUpperBound
    );
    return {
      proved: false,
      result: resultWithPrefixSeed,
      observedUpperBound: observedUpperBoundWithPrefixSeed,
    };
  };
  const buildProvedExactCandidateJoinResult = (
    result: BandoriMedleyTeamSearchResult | null = null,
  ): MedleyExactCandidateJoinResult => {
    releaseExactJoinWorkingSet();
    return { proved: true, result: applyPrefixSeedResult(result) };
  };
  let effectiveCandidateSoftLimit = candidateSoftLimit;
  let didGuardedCandidateExtension = false;
  let didAnchorFrontierProof = false;
  let didAnchorFrontierCheapUpper = false;
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
  const stagedCandidateExtensionMinRemainingMs = (
    context.stagedCandidateExtensionMinRemainingMs !== undefined
    && context.stagedCandidateExtensionMinRemainingMs !== null
    && Number.isFinite(context.stagedCandidateExtensionMinRemainingMs)
  )
    ? Math.max(0, context.stagedCandidateExtensionMinRemainingMs)
    : MEDLEY_EXACT_CANDIDATE_JOIN_STAGED_EXTENSION_MIN_REMAINING_MS;
  const shouldContinueUnprovedExactJoin = (): boolean => {
    const observedUpperBound = getObservedExactCandidateJoinUpperBound();
    return observedUpperBound === null || observedUpperBound > exactJoinProofCutoffScore;
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
      || remainingMs < stagedCandidateExtensionMinRemainingMs
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
  const maybeProveAnchorFrontier = (
    slotIndex: number,
    peekUpperBound: number,
    otherUpper: number,
    globalTailUpperBound: number | null = null,
  ): MedleyExactCandidateAnchorFrontierProofResult | null => {
    const recordAnchorFrontierProofSkip = (reason: string): null => {
      profiling.exactCandidateJoinAnchorFrontierProofSkipCount += 1;
      profiling.exactCandidateJoinLastAnchorFrontierProofSkipReason = reason;
      return null;
    };
    if (didAnchorFrontierProof || stats.memoryLimited || calculatedCardCount > (
      MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_CARD_COUNT
    )) {
      return recordAnchorFrontierProofSkip(
        didAnchorFrontierProof ? "already-attempted" : stats.memoryLimited ? "memory-limited" : "card-count",
      );
    }
    const anchorCandidateCount = candidatesBySlot[slotIndex]?.length ?? 0;
    if (
      anchorCandidateCount <= 0
      || anchorCandidateCount > MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_ANCHOR_CANDIDATES
      || !Number.isFinite(peekUpperBound)
      || !Number.isFinite(otherUpper)
    ) {
      return recordAnchorFrontierProofSkip("anchor-frontier-input");
    }
    const otherSlotCandidateCounts = candidatesBySlot
      .map((candidates, index) => (index === slotIndex ? 0 : candidates.length))
      .filter((count) => count > 0);
    const maxOtherSlotCandidates = (
      context.anchorFrontierProofMaxOtherSlotCandidates !== null
      && context.anchorFrontierProofMaxOtherSlotCandidates !== undefined
      && Number.isFinite(context.anchorFrontierProofMaxOtherSlotCandidates)
    )
      ? Math.max(1, Math.trunc(context.anchorFrontierProofMaxOtherSlotCandidates))
      : MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_OTHER_SLOT_CANDIDATES;
    const maxOtherSlotCandidateTotal = (
      context.anchorFrontierProofMaxOtherSlotCandidateTotal !== null
      && context.anchorFrontierProofMaxOtherSlotCandidateTotal !== undefined
      && Number.isFinite(context.anchorFrontierProofMaxOtherSlotCandidateTotal)
    )
      ? Math.max(1, Math.trunc(context.anchorFrontierProofMaxOtherSlotCandidateTotal))
      : MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_OTHER_SLOT_CANDIDATE_TOTAL;
    if (
      otherSlotCandidateCounts.length !== slots.length - 1
      || otherSlotCandidateCounts.some(
        (count) => count > maxOtherSlotCandidates,
      )
      || otherSlotCandidateCounts.reduce((sum, count) => sum + count, 0) > maxOtherSlotCandidateTotal
    ) {
      return recordAnchorFrontierProofSkip("other-slot-candidate-count");
    }
    const maxFrontierGap = (
      context.anchorFrontierProofMaxFrontierGap !== null
      && context.anchorFrontierProofMaxFrontierGap !== undefined
      && Number.isFinite(context.anchorFrontierProofMaxFrontierGap)
    )
      ? Math.max(0, context.anchorFrontierProofMaxFrontierGap)
      : MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_FRONTIER_GAP;
    const rawFrontierUpperBound = peekUpperBound + otherUpper;
    const frontierUpperBound = (
      globalTailUpperBound !== null
      && Number.isFinite(globalTailUpperBound)
    )
      ? Math.min(rawFrontierUpperBound, globalTailUpperBound)
      : rawFrontierUpperBound;
    const frontierGap = frontierUpperBound - incumbentScore;
    if (
      !Number.isFinite(frontierGap)
      || frontierGap < 0
      || frontierGap > maxFrontierGap
    ) {
      return recordAnchorFrontierProofSkip("frontier-gap");
    }
    const remainingMs = getGuardedExtensionRemainingMs();
    const minRemainingMs = (
      context.anchorFrontierProofMinRemainingMs !== null
      && context.anchorFrontierProofMinRemainingMs !== undefined
      && Number.isFinite(context.anchorFrontierProofMinRemainingMs)
    )
      ? Math.max(0, context.anchorFrontierProofMinRemainingMs)
      : MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MIN_REMAINING_MS;
    const cheapUpperMinRemainingMs = (
      context.anchorFrontierCheapUpperMinRemainingMs !== null
      && context.anchorFrontierCheapUpperMinRemainingMs !== undefined
      && Number.isFinite(context.anchorFrontierCheapUpperMinRemainingMs)
    )
      ? Math.max(0, context.anchorFrontierCheapUpperMinRemainingMs)
      : minRemainingMs;
    const canRunFullAnchorFrontierProof = remainingMs >= minRemainingMs;
    const canRunCheapUpper = remainingMs >= cheapUpperMinRemainingMs;
    if (!canRunFullAnchorFrontierProof && !canRunCheapUpper) {
      return recordAnchorFrontierProofSkip("low-remaining-budget");
    }
    let cheapUpperResult: MedleyExactCandidateAnchorFrontierProofResult | null = null;
    if (!didAnchorFrontierCheapUpper && canRunCheapUpper) {
      didAnchorFrontierCheapUpper = true;
      const cheapUpperDeadlineAt = (
        !canRunFullAnchorFrontierProof
        && Number.isFinite(deadlineAt)
      )
        ? Math.max(performance.now(), deadlineAt - 5_000)
        : deadlineAt;
      const candidateCheapUpperResult = estimateMedleyExactCandidateAnchorFrontierCheapUpper(
        slots,
        candidatesBySlot,
        activeGeneratorsBySlot,
        slotIndex,
        otherUpper,
        exactPairUnseenUpperByExcludedSlot[slotIndex],
        configuration,
        incumbentScore,
        server,
        perfectRate,
        profiling,
        stats,
        cheapUpperDeadlineAt,
        {
          timeboxMs: context.anchorFrontierCheapUpperTimeboxMs,
          maxAnchors: context.anchorFrontierCheapUpperMaxAnchors,
          streamAnchorTail: context.anchorFrontierCheapUpperStreamAnchorTail,
          streamAnchorTailMaxCandidates: context.anchorFrontierCheapUpperStreamAnchorTailMaxCandidates,
          streamAnchorTailTimeboxMs: context.anchorFrontierCheapUpperStreamAnchorTailTimeboxMs,
          streamAnchorTailGlobalPruning: context.anchorFrontierCheapUpperStreamAnchorTailGlobalPruning,
          refineUnseen: context.anchorFrontierCheapUpperRefineUnseen,
          refineTopAnchors: context.anchorFrontierCheapUpperRefineTopAnchors,
          unseenRefineMaxGeneratedCandidates: context.anchorFrontierCheapUpperUnseenRefineMaxGeneratedCandidates,
          processedUnseenJoin: context.anchorFrontierCheapUpperProcessedUnseenJoin,
          rewindBothUnseen: context.anchorFrontierCheapUpperRewindBothUnseen,
          bestPrefixSplit: context.anchorFrontierCheapUpperBestPrefixSplit,
          bestPrefixSplitMaxAttempts: context.anchorFrontierCheapUpperBestPrefixSplitMaxAttempts,
          pairAnchorCover: context.anchorFrontierCheapUpperPairAnchorCover,
          pairAnchorCoverMaxPairs: context.anchorFrontierCheapUpperPairAnchorCoverMaxPairs,
          localPairSlotExtension: context.anchorFrontierCheapUpperLocalPairSlotExtension,
          localPairSlotExtensionSlotIndex: (
            context.anchorFrontierCheapUpperLocalPairSlotExtensionSlotIndex
          ),
          localPairSlotExtensionMaxCandidates: (
            context.anchorFrontierCheapUpperLocalPairSlotExtensionMaxCandidates
          ),
          localPairSlotExtensionTimeboxMs: (
            context.anchorFrontierCheapUpperLocalPairSlotExtensionTimeboxMs
          ),
          pairCapacityCap: context.anchorFrontierCheapUpperPairCapacityCap,
          pairCapacityCapPareto: context.anchorFrontierCheapUpperPairCapacityCapPareto,
          pairCapacityCapBucketed: context.anchorFrontierCheapUpperPairCapacityCapBucketed,
          pairCapacityBreakdown: context.anchorFrontierCheapUpperPairCapacityBreakdown,
          pairCapacitySharedPowerDualCap: (
            context.anchorFrontierCheapUpperPairCapacitySharedPowerDualCap
          ),
          pairCapacitySharedPowerDualCapMaxCalls: (
            context.anchorFrontierCheapUpperPairCapacitySharedPowerDualCapMaxCalls
          ),
          pairCapacitySharedPowerDualReuseMaxCalls: (
            context.anchorFrontierCheapUpperPairCapacitySharedPowerDualReuseMaxCalls
          ),
          pairCapacitySharedPowerDualLateMaxRepair: (
            context.anchorFrontierCheapUpperPairCapacitySharedPowerDualLateMaxRepair
          ),
          pairCapacitySharedPowerDualLateMaxRepairExtraCalls: (
            context.anchorFrontierCheapUpperPairCapacitySharedPowerDualLateMaxRepairExtraCalls
          ),
          pairCapacitySharedPowerBreakdown: context.anchorFrontierCheapUpperPairCapacitySharedPowerBreakdown,
          pairCapacitySharedPowerStateBudget: context.anchorFrontierCheapUpperPairCapacitySharedPowerStateBudget,
          targetedPairProofTimeboxMs: context.anchorFrontierCheapUpperTargetedPairProofTimeboxMs,
          targetedPairProofMaxEntries: context.anchorFrontierCheapUpperTargetedPairProofMaxEntries,
          targetedPairProofCandidateLimit: context.anchorFrontierCheapUpperTargetedPairProofCandidateLimit,
          targetedPairBnbNodeLimit: context.anchorFrontierCheapUpperTargetedPairBnbNodeLimit,
          targetedPairBnbSlotSolveNodeLimit: context.anchorFrontierCheapUpperTargetedPairBnbSlotSolveNodeLimit,
          suffixCover: context.anchorFrontierCheapUpperSuffixCover,
          multiCardSuffixCover: context.anchorFrontierCheapUpperMultiCardSuffixCover,
          suffixGeneratedPairJoin: context.anchorFrontierCheapUpperSuffixGeneratedPairJoin,
          suffixUnseenSingleCardJoin: context.anchorFrontierCheapUpperSuffixUnseenSingleCardJoin,
          suffixUnseenFullJoin: context.anchorFrontierCheapUpperSuffixUnseenFullJoin,
          unprocessedGeneratorUpperBound: context.enableExactCandidateJoinGlobalTailUpper === true
            ? globalTailUpperBound
            : null,
        },
        observeEvaluatedResult,
      );
      if (candidateCheapUpperResult.proved) {
        return candidateCheapUpperResult;
      }
      if (
        candidateCheapUpperResult.result
        && candidateCheapUpperResult.result.score > incumbentScore
      ) {
        return candidateCheapUpperResult;
      }
      const currentObservedUpperBound = getObservedExactCandidateJoinUpperBound();
      if (
        candidateCheapUpperResult.observedUpperBound !== null
        && currentObservedUpperBound !== null
        && candidateCheapUpperResult.observedUpperBound < currentObservedUpperBound
      ) {
        cheapUpperResult = candidateCheapUpperResult;
      }
    }
    if (!canRunFullAnchorFrontierProof) {
      return cheapUpperResult ?? recordAnchorFrontierProofSkip("low-remaining-budget");
    }
    if (context.anchorFrontierCheapUpperOnly === true) {
      if (cheapUpperResult) {
        profiling.exactCandidateJoinLastAnchorFrontierProofSkipReason = "cheap-upper-only";
        return cheapUpperResult;
      }
      return recordAnchorFrontierProofSkip("cheap-upper-only");
    }
    const anchorMaxScore = candidatesBySlot[slotIndex].reduce((maxScore, candidate) => (
      Math.max(maxScore, candidate.result.score)
    ), Number.NEGATIVE_INFINITY);
    if (!Number.isFinite(anchorMaxScore)) {
      return null;
    }
    const pairSlotIndices = slots
      .map((_, index) => index)
      .filter((index) => index !== slotIndex) as [number, number];
    const sortedLeftCandidates = [...candidatesBySlot[pairSlotIndices[0]]];
    const sortedRightCandidates = [...candidatesBySlot[pairSlotIndices[1]]];
    sortMedleyCandidates(sortedLeftCandidates);
    sortMedleyCandidates(sortedRightCandidates);
    const maxHighPairRecords = (
      context.anchorFrontierProofMaxHighPairRecords !== null
      && context.anchorFrontierProofMaxHighPairRecords !== undefined
      && Number.isFinite(context.anchorFrontierProofMaxHighPairRecords)
    )
      ? Math.max(1, Math.trunc(context.anchorFrontierProofMaxHighPairRecords))
      : MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_HIGH_PAIR_RECORDS;
    const highPairRecordUpperCount = estimateHighMedleyExactCandidatePairRecordUpperCount(
      sortedLeftCandidates,
      sortedRightCandidates,
      incumbentScore - anchorMaxScore,
      maxHighPairRecords,
    );
    profiling.exactCandidateJoinLastAnchorFrontierProofHighPairRecordUpperCount = highPairRecordUpperCount;
    const canUseLowMemoryHighPairScanFallback = (
      context.lowMemoryHighPairScanMinRecordCount !== null
      && context.lowMemoryHighPairScanMinRecordCount !== undefined
      && Number.isFinite(context.lowMemoryHighPairScanMinRecordCount)
    );
    if (highPairRecordUpperCount > maxHighPairRecords && !canUseLowMemoryHighPairScanFallback) {
      profiling.exactCandidateJoinAnchorFrontierProofSkipCount += 1;
      profiling.exactCandidateJoinLastAnchorFrontierProofSkipReason = "high-pair-record-upper";
      return cheapUpperResult;
    }
    const improvementProbe = findMedleyExactCandidateAnchorFrontierImprovement(
      slots,
      candidatesBySlot,
      slotIndex,
      configuration,
      incumbentScore,
      server,
      perfectRate,
      profiling,
      stats,
      observeEvaluatedResult,
    );
    if (improvementProbe.result && improvementProbe.result.score > incumbentScore) {
      return {
        proved: false,
        localTimedOut: improvementProbe.localTimedOut,
        result: improvementProbe.result,
        observedUpperBound: null,
        processedAnchorCount: improvementProbe.processedAnchorCount,
        residualUpperBound: null,
        elapsedMs: improvementProbe.elapsedMs,
      };
    }
    didAnchorFrontierProof = true;
    const anchorFrontierProofResult = proveMedleyExactCandidateAnchorFrontier(
      slots,
      candidatesBySlot,
      activeGeneratorsBySlot,
      slotIndex,
      otherUpper,
      configuration,
      incumbentScore,
      server,
      perfectRate,
      maxOtherSlotCandidates,
      context.anchorFrontierProofTimeboxMs,
      profiling,
      stats,
      isPastDeadline,
      deadlineAt,
      {
        lowMemoryHighPairScanMinRecordCount: context.lowMemoryHighPairScanMinRecordCount ?? null,
        lowMemoryHighPairPrefixRecordLimit: context.lowMemoryHighPairPrefixRecordLimit ?? null,
        lowMemoryHighPairRecordScan: context.lowMemoryHighPairRecordScan === true,
        stopAtObservedUpperBound: (
          context.anchorFrontierProofStopAtCheapUpper === true
          && cheapUpperResult?.observedUpperBound !== null
          && cheapUpperResult?.observedUpperBound !== undefined
          && Number.isFinite(cheapUpperResult.observedUpperBound)
        )
          ? cheapUpperResult.observedUpperBound
          : null,
        stopAtObservedUpperMinProcessedAnchors: (
          context.anchorFrontierProofStopAtCheapUpperMinProcessedAnchors ?? null
        ),
      },
    );
    if (
      !anchorFrontierProofResult.proved
      && cheapUpperResult?.observedUpperBound !== null
      && cheapUpperResult?.observedUpperBound !== undefined
      && Number.isFinite(cheapUpperResult.observedUpperBound)
      && (
        anchorFrontierProofResult.observedUpperBound === null
        || anchorFrontierProofResult.observedUpperBound === undefined
        || cheapUpperResult.observedUpperBound < anchorFrontierProofResult.observedUpperBound
      )
    ) {
      return {
        ...anchorFrontierProofResult,
        observedUpperBound: cheapUpperResult.observedUpperBound,
        residualUpperBound: cheapUpperResult.observedUpperBound,
      };
    }
    return anchorFrontierProofResult;
  };

  const initialCandidateStartedAt = performance.now();
  const globalCapacityTailBudget = context.enableExactCandidateJoinGlobalCapacityTailUpper === true
    ? {
      startedAt: performance.now(),
      maxCalls: (
        context.exactCandidateJoinGlobalCapacityTailMaxCalls !== null
        && context.exactCandidateJoinGlobalCapacityTailMaxCalls !== undefined
        && Number.isFinite(context.exactCandidateJoinGlobalCapacityTailMaxCalls)
      )
        ? Math.max(0, Math.trunc(context.exactCandidateJoinGlobalCapacityTailMaxCalls))
        : 1024,
      timeboxMs: (
        context.exactCandidateJoinGlobalCapacityTailTimeboxMs !== null
        && context.exactCandidateJoinGlobalCapacityTailTimeboxMs !== undefined
        && Number.isFinite(context.exactCandidateJoinGlobalCapacityTailTimeboxMs)
      )
        ? Math.max(0, context.exactCandidateJoinGlobalCapacityTailTimeboxMs)
        : 3000,
      callCount: 0,
      skipCount: 0,
      timeboxCount: 0,
      exhausted: false,
    }
    : undefined;

  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    const slotInitialCandidateStartedAt = performance.now();
    let topCandidate: MedleyTeamCandidate | null = null;
    if (context.enableLowMemoryInitialCandidateSync === false) {
      topCandidate = generators[slotIndex].next();
    } else {
      const lowMemoryInitialCandidateSyncTimeboxMs = context.lowMemoryInitialCandidateSyncTimeboxMs !== undefined
        && Number.isFinite(context.lowMemoryInitialCandidateSyncTimeboxMs)
        ? Math.max(0, context.lowMemoryInitialCandidateSyncTimeboxMs)
        : Number.POSITIVE_INFINITY;
      const lowMemoryInitialCandidateSyncDeadlineAt = Number.isFinite(lowMemoryInitialCandidateSyncTimeboxMs)
        ? Math.min(deadlineAt, performance.now() + lowMemoryInitialCandidateSyncTimeboxMs)
        : null;
      const lowMemoryTopCandidate = findBestMedleyExactSlotCandidateLowMemory(
        slots[slotIndex],
        server,
        perfectRate,
        stats,
        profiling,
        isPastDeadline,
        deadlineAt,
        nodeSoftLimit,
        lowMemoryInitialCandidateSyncDeadlineAt,
        context.shouldAbortLowMemoryInitialCandidateSync ?? null,
        context.lowMemoryInitialCandidateSyncScoreCacheClearInterval ?? null,
        context.lowMemoryInitialCandidateSyncLightUpper !== true,
        context.lowMemoryInitialCandidateSyncDirectCandidate === true,
      );
      profiling.exactCandidateJoinLastLowMemoryInitialCandidateSlotIndex = slotIndex;
      profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortReason = lowMemoryTopCandidate.abortReason;
      profiling.exactCandidateJoinLastLowMemoryInitialCandidateVisitedNodeCount = (
        lowMemoryTopCandidate.visitedNodeCount
      );
      profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluatedTeamCount = (
        lowMemoryTopCandidate.evaluatedTeamCount
      );
      profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestScore = lowMemoryTopCandidate.score;
      if (lowMemoryTopCandidate.aborted) {
        if (context.lowMemoryInitialCandidateSyncLocalAbortOnly === true) {
          profiling.exactCandidateJoinInitialCandidateElapsedMsBySlot[slotIndex] = (
            performance.now() - slotInitialCandidateStartedAt
          );
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
          return buildUnprovedExactCandidateJoinResult();
        }
        topCandidate = generators[slotIndex].next();
      } else if (lowMemoryTopCandidate.candidate) {
        topCandidate = lowMemoryTopCandidate.candidate;
      } else if (lowMemoryTopCandidate.score !== null) {
        if (context.lowMemoryInitialCandidateSyncUnsafeActiveGeneratorAdvance === true) {
          topCandidate = generators[slotIndex].next(lowMemoryTopCandidate.score);
        } else {
          const seedGenerator = createMedleyExactSlotCandidateGenerator(
            slots[slotIndex],
            server,
            perfectRate,
            stats,
            profiling,
            isPastDeadline,
            deadlineAt,
            nodeSoftLimit,
            context.lowMemoryHighPairScanMinRecordCount ?? null,
            context.lowMemoryHighPairPrefixRecordLimit ?? null,
            context.lowMemoryHighPairRecordScan === true,
            context.exactCandidateJoinScoreCacheClearInterval ?? null,
          );
          try {
            topCandidate = seedGenerator.next(lowMemoryTopCandidate.score);
          } finally {
            seedGenerator.release();
          }
        }
      }
    }
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
      return buildUnprovedExactCandidateJoinResult();
    }
    candidatesBySlot[slotIndex].push(topCandidate);
    bestSlotScores[slotIndex] = topCandidate.result.score;
  }
  profiling.exactCandidateJoinLastBestSlotScores = [...bestSlotScores];
  profiling.exactCandidateJoinInitialCandidateElapsedMs += performance.now() - initialCandidateStartedAt;

  const pairUpperStartedAt = performance.now();
  const shouldUseRootPruneOnlyPairProbe = candidateSoftLimit > 20_000;
  const getConflictPairUpperBnbMemoryHeadroomMiB = (): number => {
    if (
      stats.memorySoftLimitMiB === null
      || !Number.isFinite(stats.memorySoftLimitMiB)
      || stats.peakUsedHeapMiB === null
      || !Number.isFinite(stats.peakUsedHeapMiB)
    ) {
      return Number.POSITIVE_INFINITY;
    }
    return stats.memorySoftLimitMiB - stats.peakUsedHeapMiB;
  };
  const shouldTryConflictPairUpperBnb = (): boolean => (
    context.enableConflictPairUpperBnb === true
    && getConflictPairUpperBnbMemoryHeadroomMiB() <= Math.max(
      0,
      Math.trunc(context.conflictPairUpperBnbMaxMemoryHeadroomMiB ?? 512),
    )
  );
  const tryProveConflictPairUpperByBnb = (
    pairSlotIndices: [number, number],
  ): MedleyExactCandidatePairUpperResult | null => {
    if (!shouldTryConflictPairUpperBnb()) {
      return null;
    }
    const conflictPairUpperResult = proveMedleyScoreOnlyPairUpperByConflictBnb(
      [slots[pairSlotIndices[0]], slots[pairSlotIndices[1]]],
      server,
      perfectRate,
      stats,
      profiling,
      isPastDeadline,
      deadlineAt,
      Math.max(1, Math.trunc(context.conflictPairUpperBnbNodeLimit ?? 2_048)),
      Math.max(1, Math.trunc(context.conflictPairUpperBnbSlotSolveNodeLimit ?? nodeSoftLimit)),
    );
    if (
      conflictPairUpperResult.proved
      && conflictPairUpperResult.upperBound !== null
      && Number.isFinite(conflictPairUpperResult.upperBound)
    ) {
      return {
        proved: true,
        upperBound: conflictPairUpperResult.upperBound,
        unseenUpperBound: conflictPairUpperResult.upperBound,
      };
    }
    return null;
  };
  for (let excludedSlotIndex = 0; excludedSlotIndex < slots.length; excludedSlotIndex += 1) {
    const pairSlotIndices = slots
      .map((_, index) => index)
      .filter((index) => index !== excludedSlotIndex) as [number, number];
    const rootPrunePairTarget = exactJoinProofCutoffScore - bestSlotScores[excludedSlotIndex];
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
      recordGeneratorOnlyMemorySnapshot("pair-upper-abort", { slotIndex: excludedSlotIndex });
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
      if (pairUpperResult.upperBound + bestSlotScores[excludedSlotIndex] <= exactJoinProofCutoffScore) {
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
        if (solveOnlyAboveUpperTarget !== null) {
          profiling.exactCandidateJoinAbortCount += 1;
          recordAbortDiagnostics("solve-dominated-same-coarse-frontier", {
            slotIndex: excludedSlotIndex,
            candidateCount: candidatesBySlot.reduce((max, candidates) => Math.max(max, candidates.length), 0),
            observedUpperBound: exactJoinProofCutoffScore,
          });
          return buildUnprovedExactCandidateJoinResult(null, exactJoinProofCutoffScore);
        }
        profiling.exactCandidateJoinCompletedCount += 1;
        return buildProvedExactCandidateJoinResult();
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
        recordGeneratorOnlyMemorySnapshot("deep-pair-upper-abort", { slotIndex: deepPairExcludedSlotIndex });
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
    let highBudgetDeepPairUpperResult = tryProveConflictPairUpperByBnb([1, 2]);
    const highBudgetDeepPairStartedAt = performance.now();
    highBudgetDeepPairUpperResult ??= proveMedleyExactCandidatePairUpper(
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
      recordGeneratorOnlyMemorySnapshot("high-budget-pair-upper-abort", { slotIndex: 0 });
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
    if (pairRootUpperBound <= exactJoinProofCutoffScore) {
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
      if (solveOnlyAboveUpperTarget !== null) {
        profiling.exactCandidateJoinAbortCount += 1;
        recordAbortDiagnostics("solve-dominated-same-coarse-frontier", {
          candidateCount: candidatesBySlot.reduce((max, candidates) => Math.max(max, candidates.length), 0),
          observedUpperBound: exactJoinProofCutoffScore,
        });
        return buildUnprovedExactCandidateJoinResult(null, exactJoinProofCutoffScore);
      }
      profiling.exactCandidateJoinCompletedCount += 1;
      return buildProvedExactCandidateJoinResult();
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
      return buildProvedExactCandidateJoinResult(anchoredJoinResult.result);
    }
  }

  const candidateCutoffsBySlot = new Array<number>(slots.length).fill(Number.NEGATIVE_INFINITY);
  const candidateOtherUpperBySlot = new Array<number>(slots.length).fill(Number.POSITIVE_INFINITY);
  const candidateRelaxedOtherUpperBySlot = new Array<number>(slots.length).fill(Number.POSITIVE_INFINITY);
  const candidateRemainingOtherUpperBySlot = new Array<number>(slots.length).fill(Number.POSITIVE_INFINITY);
  candidateFillGenerators = slots.map((slot) => createMedleyExactSlotCandidateGenerator(
    slot,
    server,
    perfectRate,
    stats,
    profiling,
    isPastDeadline,
    deadlineAt,
    nodeSoftLimit,
    context.lowMemoryHighPairScanMinRecordCount ?? null,
    context.lowMemoryHighPairPrefixRecordLimit ?? null,
    context.lowMemoryHighPairRecordScan === true,
    context.exactCandidateJoinScoreCacheClearInterval ?? null,
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
  const { packCandidateCardKey, packCandidateCardsKey } = createMedleyExactCandidateCardKeyPacker(slots);
  const candidateKeysBySlot: Array<Set<string> | null> = Array.from({ length: slots.length }, () => null);
  const getCandidateKeysForSlot = (slotIndex: number): Set<string> => {
    let keys = candidateKeysBySlot[slotIndex];
    if (keys) {
      return keys;
    }
    keys = new Set(
      candidatesBySlot[slotIndex].map((candidate) => (
        getMedleyExactCandidateCardKey(candidate, packCandidateCardKey)
      )),
    );
    candidateKeysBySlot[slotIndex] = keys;
    return keys;
  };
  const rebuildCandidateKeys = (...slotIndices: number[]): void => {
    for (const slotIndex of slotIndices) {
      candidateKeysBySlot[slotIndex] = new Set(
        candidatesBySlot[slotIndex].map((candidate) => (
          getMedleyExactCandidateCardKey(candidate, packCandidateCardKey)
        )),
      );
    }
  };
  const recordDebugKnownCandidatePresence = (): void => {
    if (!profiling.exactCandidateJoinDebugKnownCardIdsBySlot) {
      return;
    }
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
  };
  const recordExactJoinMemorySnapshot = (
    phase: string,
    extra: Record<string, unknown> = {},
  ): void => {
    if (context.debugExactCandidateJoinMemoryAttribution !== true) {
      return;
    }
    const uniqueGenerators = [...new Set(getCandidateFillProfilingGenerators())];
    const generatorProfiles = uniqueGenerators.map((generator, index) => ({
      index,
      ...(generator.memoryProfile ? generator.memoryProfile() : {}),
    }));
    const candidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
    const candidateKeyCountsBySlot = candidateKeysBySlot.map((keys) => keys?.size ?? 0);
    profiling.exactCandidateJoinMemorySnapshots.push({
      phase,
      elapsedMs: Math.round(performance.now() - exactJoinStartedAt),
      peakUsedHeapMiB: stats.peakUsedHeapMiB,
      candidateCountsBySlot,
      candidateCountTotal: candidateCountsBySlot.reduce((sum, count) => sum + count, 0),
      candidateKeyCountsBySlot,
      candidateKeyCountTotal: candidateKeyCountsBySlot.reduce((sum, count) => sum + count, 0),
      exactCandidateJoinPairCount: profiling.exactCandidateJoinPairCount,
      exactCandidateJoinPairComplementQueryCount: profiling.exactCandidateJoinPairComplementQueryCount,
      exactCandidateJoinPairComplementHighPairRecordCount: (
        profiling.exactCandidateJoinPairComplementHighPairRecordCount
      ),
      generatorProfiles,
      ...extra,
    });
  };
  const refineCandidateFillPairUpper = (excludedSlotIndex: number): boolean => {
    const pairSlotIndices = slots
      .map((_, index) => index)
      .filter((index) => index !== excludedSlotIndex) as [number, number];
    const refineStartedAt = performance.now();
    const conflictPairUpperResult = tryProveConflictPairUpperByBnb(pairSlotIndices);
    if (conflictPairUpperResult) {
      profiling.exactCandidateJoinPairUpperElapsedMs += performance.now() - refineStartedAt;
      exactPairUpperByExcludedSlot[excludedSlotIndex] = conflictPairUpperResult.upperBound;
      exactPairUnseenUpperByExcludedSlot[excludedSlotIndex] = conflictPairUpperResult.unseenUpperBound;
      return true;
    }
    if (stats.timedOut) {
      profiling.exactCandidateJoinPairUpperElapsedMs += performance.now() - refineStartedAt;
      return false;
    }
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
    if (stats.timedOut || activeGeneratorsBySlot.some((generator) => generator.hasAborted())) {
      return false;
    }
    rebuildCandidateKeys(...pairSlotIndices);
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
  const recordPrefixSeedPeakHeap = (): void => {
    if (stats.peakUsedHeapMiB === null || !Number.isFinite(stats.peakUsedHeapMiB)) {
      return;
    }
    profiling.exactJoinPrefixSeedPeakHeapMiB = Math.max(
      profiling.exactJoinPrefixSeedPeakHeapMiB ?? 0,
      stats.peakUsedHeapMiB,
    );
  };
  const recordPrefixSeedGuardSkip = (reason: string): void => {
    profiling.exactJoinPrefixSeedGuardSkipCount += 1;
    profiling.exactJoinPrefixSeedLastGuardSkipReason = reason;
    profiling.exactJoinPrefixSeedGuardSkipReasonCounts[reason] = (
      (profiling.exactJoinPrefixSeedGuardSkipReasonCounts[reason] ?? 0) + 1
    );
  };
  const maybeSeedFromExactJoinPrefix = (): void => {
    if (context.enableExactJoinPrefixSeed !== true) {
      return;
    }
    if (context.exactJoinPrefixSeedForceNoop === true) {
      return;
    }
    if (stats.memoryLimited || stats.timedOut) {
      return;
    }
    const candidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
    profiling.exactJoinPrefixSeedCandidateCountsBySlot = [...candidateCountsBySlot];
    if (context.exactJoinPrefixSeedPreviousLocalTimeout === true) {
      recordPrefixSeedGuardSkip("previous-local-timeout");
      return;
    }

    const minCandidateCounts = context.exactJoinPrefixSeedMinCandidateCounts ?? [1, 1, 1];
    const hasTooFewCandidates = candidateCountsBySlot.some((count, index) => {
      const minCount = Math.max(0, Math.trunc(minCandidateCounts[index] ?? 1));
      return count < minCount;
    });
    if (hasTooFewCandidates) {
      profiling.exactJoinPrefixSeedSkippedByCandidateCount += 1;
      recordPrefixSeedGuardSkip("candidate-count");
      return;
    }

    const sortedCandidateCounts = [...candidateCountsBySlot].sort((left, right) => left - right);
    const maxSmallestCandidateCount = Math.max(
      1,
      Math.trunc(context.exactJoinPrefixSeedMaxSmallestCandidateCount ?? 20_000),
    );
    if ((sortedCandidateCounts[0] ?? 0) > maxSmallestCandidateCount) {
      profiling.exactJoinPrefixSeedSkippedByCandidateCount += 1;
      recordPrefixSeedGuardSkip("candidate-count");
      return;
    }

    const remainingMs = Number.isFinite(deadlineAt)
      ? deadlineAt - performance.now()
      : Number.POSITIVE_INFINITY;
    const timeboxMs = Math.max(0, Math.trunc(context.exactJoinPrefixSeedTimeboxMs ?? 300));
    const minProofBudgetMs = Math.max(
      0,
      Math.trunc(context.exactJoinPrefixSeedMinProofBudgetMs ?? MEDLEY_EXACT_JOIN_PREFIX_SEED_MIN_PROOF_BUDGET_MS),
    );
    if (
      timeboxMs <= 0
      || remainingMs < Math.max(MEDLEY_EXACT_JOIN_PREFIX_SEED_MIN_REMAINING_MS, timeboxMs + minProofBudgetMs)
    ) {
      recordPrefixSeedGuardSkip("low-remaining-budget");
      return;
    }

    const memorySoftLimitMiB = context.exactJoinPrefixSeedMemorySoftLimitMiB ?? stats.memorySoftLimitMiB;
    const minMemoryHeadroomMiB = Math.max(
      0,
      Math.trunc(
        context.exactJoinPrefixSeedMinMemoryHeadroomMiB
        ?? MEDLEY_EXACT_JOIN_PREFIX_SEED_MIN_MEMORY_HEADROOM_MIB,
      ),
    );
    if (
      memorySoftLimitMiB !== null
      && Number.isFinite(memorySoftLimitMiB)
      && stats.peakUsedHeapMiB !== null
      && Number.isFinite(stats.peakUsedHeapMiB)
      && memorySoftLimitMiB - stats.peakUsedHeapMiB < minMemoryHeadroomMiB
    ) {
      recordPrefixSeedGuardSkip("low-memory-headroom");
      return;
    }

    const observedUpperBound = getObservedExactCandidateJoinUpperBound();
    const observedGap = observedUpperBound !== null
      ? observedUpperBound - exactJoinProofCutoffScore
      : null;
    const maxObservedGap = Math.max(
      0,
      Math.trunc(context.exactJoinPrefixSeedMaxObservedGap ?? MEDLEY_EXACT_JOIN_PREFIX_SEED_MAX_OBSERVED_GAP),
    );
    if (observedGap === null || observedGap > maxObservedGap) {
      recordPrefixSeedGuardSkip("large-gap");
      return;
    }
    if (context.exactJoinPrefixSeedGuardOnly === true) {
      recordPrefixSeedGuardSkip("guard-only");
      return;
    }

    profiling.exactJoinPrefixSeedCallCount += 1;
    recordPrefixSeedPeakHeap();
    const startedAt = performance.now();
    const localDeadlineAt = Math.min(deadlineAt, startedAt + timeboxMs);
    const wasTimedOut = stats.timedOut;
    const wasExhaustive = stats.isExhaustive;
    const previousSearchMode = stats.searchMode;
    const seedJoinResult = solveMedleyExactCandidateJoin(
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
      localDeadlineAt,
      null,
      undefined,
      false,
      null,
      null,
      null,
      null,
      context.exactCandidateJoinZeroScoreTargetSlack === true,
    );
    profiling.exactJoinPrefixSeedElapsedMs += performance.now() - startedAt;
    recordPrefixSeedPeakHeap();
    if (seedJoinResult.localTimedOut) {
      profiling.exactJoinPrefixSeedTimedOutCount += 1;
    }
    if (
      seedJoinResult.localTimedOut
      && !stats.memoryLimited
      && performance.now() < deadlineAt
      && !isPastDeadline()
    ) {
      stats.timedOut = wasTimedOut;
      stats.isExhaustive = wasExhaustive;
      stats.searchMode = previousSearchMode;
    }

    const result = seedJoinResult.result;
    if (seedJoinResult.localTimedOut && (!result || result.score <= incumbentScore)) {
      profiling.exactJoinPrefixSeedNoHitLocalTimeoutCount += 1;
    }
    if (!result || result.score <= incumbentScore) {
      return;
    }
    profiling.exactJoinPrefixSeedHitCount += 1;
    profiling.exactJoinPrefixSeedBestScore = Math.max(
      profiling.exactJoinPrefixSeedBestScore ?? Number.NEGATIVE_INFINITY,
      result.score,
    );
    profiling.exactJoinPrefixSeedBestImprovement = Math.max(
      profiling.exactJoinPrefixSeedBestImprovement,
      result.score - incumbentScore,
    );
    prefixSeedResult = compareMedleyResultLike(prefixSeedResult, result);
    exactJoinProofCutoffScore = Math.max(exactJoinProofCutoffScore, result.score);
  };
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
      recordExactJoinMemorySnapshot("candidate-fill-pair-refine-abort", { slotIndex });
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
    const cutoff = exactJoinProofCutoffScore - otherUpper;
    const globalPruning = {
      slots,
      remainingSlotIndices,
      scoreCutoff: exactJoinProofCutoffScore,
      candidatesBySlot,
      pairUnseenUpperBound: exactPairUnseenUpperByExcludedSlot[slotIndex] ?? undefined,
      useCapacityComplementUpper: context.enableExactCandidateJoinGlobalCapacityTailUpper === true,
      capacityComplementMargin: MEDLEY_EXACT_CANDIDATE_JOIN_CAPACITY_COMPLEMENT_MARGIN,
      capacityComplementMinSelectedCardCount: (
        context.exactCandidateJoinGlobalCapacityTailMinSelectedCards !== null
        && context.exactCandidateJoinGlobalCapacityTailMinSelectedCards !== undefined
        && Number.isFinite(context.exactCandidateJoinGlobalCapacityTailMinSelectedCards)
      )
        ? Math.max(0, Math.trunc(context.exactCandidateJoinGlobalCapacityTailMinSelectedCards))
        : MEDLEY_TEAM_SIZE,
      capacityComplementBudget: globalCapacityTailBudget,
      packCandidateCardKey,
      packCandidateCardsKey,
      excludedCandidateKeys: getCandidateKeysForSlot(slotIndex),
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
        recordDebugKnownCandidatePresence();
        recordExactJoinMemorySnapshot(stats.memoryLimited ? "candidate-fill-memory-limit" : "candidate-fill-deadline", {
          slotIndex,
        });
        return buildUnprovedExactCandidateJoinResult();
      }
      if (candidatesBySlot[slotIndex].length >= effectiveCandidateSoftLimit) {
        const rawPeekUpperBound = generator.peekUpperBound();
        const globalTailUpperBound = context.enableExactCandidateJoinGlobalTailUpper === true
          ? generator.peekGlobalUpperBound()
          : null;
        if (maybeExtendCandidateSoftLimit(slotIndex, cutoff, rawPeekUpperBound)) {
          continue;
        }
        const anchorFrontierProof = maybeProveAnchorFrontier(
          slotIndex,
          rawPeekUpperBound,
          otherUpper,
          globalTailUpperBound,
        );
        if (anchorFrontierProof?.proved) {
          profiling.exactCandidateJoinCandidateFillElapsedMs += performance.now() - candidateFillStartedAt;
          profiling.exactCandidateJoinLastCandidateCountsBySlot = candidatesBySlot.map((candidates) => (
            candidates.length
          ));
          profiling.exactCandidateJoinLastCandidateFillElapsedMsBySlot[slotIndex] = (
            performance.now() - slotFillStartedAt
          );
          profiling.exactCandidateJoinGeneratedCandidateCount += candidatesBySlot.reduce((sum, candidates) => (
            sum + candidates.length
          ), 0);
          profiling.exactCandidateJoinMaxCandidateCount = Math.max(
            profiling.exactCandidateJoinMaxCandidateCount,
            ...candidatesBySlot.map((candidates) => candidates.length),
          );
          profiling.exactCandidateJoinPoppedNodeCount += getCandidateFillProfilingGenerators().reduce((
            sum,
            currentGenerator,
          ) => (
            sum + currentGenerator.poppedNodeCount()
          ), 0);
          profiling.exactCandidateJoinCompletedCount += 1;
          return buildProvedExactCandidateJoinResult(anchorFrontierProof.result);
        }
        const anchorFrontierObservedUpperBound = anchorFrontierProof?.observedUpperBound ?? null;
        const anchorFrontierResult = anchorFrontierProof?.result ?? null;
        profiling.exactCandidateJoinCandidateFillElapsedMs += performance.now() - candidateFillStartedAt;
        profiling.exactCandidateJoinLastCandidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
        profiling.exactCandidateJoinLastCandidateFillElapsedMsBySlot[slotIndex] = (
          performance.now() - slotFillStartedAt
        );
        profiling.exactCandidateJoinAbortCount += 1;
        recordAbortDiagnostics(stats.timedOut
          ? stats.memoryLimited ? "memory-soft-limit" : "candidate-fill-deadline"
          : "candidate-fill-soft-limit", {
          slotIndex,
          candidateCount: candidatesBySlot[slotIndex].length,
          cutoff,
          peekUpperBound: rawPeekUpperBound,
          otherUpper,
          observedUpperBound: anchorFrontierObservedUpperBound ?? getObservedExactCandidateJoinUpperBound(),
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
        recordDebugKnownCandidatePresence();
        recordExactJoinMemorySnapshot("candidate-fill-soft-limit", { slotIndex });
        return buildUnprovedExactCandidateJoinResult(
          anchorFrontierResult,
          anchorFrontierObservedUpperBound ?? getObservedExactCandidateJoinUpperBound(),
        );
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
        recordDebugKnownCandidatePresence();
        recordExactJoinMemorySnapshot("candidate-fill-generator-aborted", { slotIndex });
        return buildUnprovedExactCandidateJoinResult();
      }
      if (!candidate) {
        break;
      }
      const candidateKey = getMedleyExactCandidateCardKey(candidate, packCandidateCardKey);
      const candidateKeys = getCandidateKeysForSlot(slotIndex);
      if (candidateKeys.has(candidateKey)) {
        continue;
      }
      candidateKeys.add(candidateKey);
      if (candidate.result.score >= cutoff) {
        candidatesBySlot[slotIndex].push(candidate);
      }
    }
    profiling.exactCandidateJoinLastCandidateFillElapsedMsBySlot[slotIndex] = (
      performance.now() - slotFillStartedAt
    );
  }
  profiling.exactCandidateJoinCandidateFillElapsedMs += performance.now() - candidateFillStartedAt;

  candidateKeysBySlot.fill(null);
  candidatesBySlot.forEach(sortMedleyCandidates);
  maybeSeedFromExactJoinPrefix();
  if (stats.timedOut) {
    recordExactJoinMemorySnapshot("after-prefix-seed-timeout");
    return buildUnprovedExactCandidateJoinResult();
  }
  recordDebugKnownCandidatePresence();
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
    ? observedUpperBoundBeforeSolve - exactJoinProofCutoffScore
    : null;
  const remainingBeforeSolveMs = Number.isFinite(deadlineAt)
    ? deadlineAt - performance.now()
    : Number.POSITIVE_INFINITY;
  if (
    solveOnlyAboveUpperTarget === null
    && observedUpperBoundBeforeSolve !== null
    && Number.isFinite(observedUpperBoundBeforeSolve)
    && observedUpperBoundBeforeSolve <= exactJoinProofCutoffScore
  ) {
    profiling.exactCandidateJoinCompletedCount += 1;
    return buildProvedExactCandidateJoinResult();
  }
  if (
    observedUpperBoundBeforeSolve !== null
    && Number.isFinite(observedUpperBoundBeforeSolve)
    && context.skipSolveWhenObservedUpperAtOrBelow !== undefined
    && Number.isFinite(context.skipSolveWhenObservedUpperAtOrBelow)
    && observedUpperBoundBeforeSolve <= context.skipSolveWhenObservedUpperAtOrBelow
  ) {
    profiling.exactCandidateJoinAbortCount += 1;
    recordAbortDiagnostics("solve-dominated-same-coarse-frontier", {
      candidateCount: solveCandidateCounts[2] ?? solveCandidateCounts[0],
      observedUpperBound: observedUpperBoundBeforeSolve,
    });
    recordExactJoinMemorySnapshot("solve-dominated-skip", { solveCandidateCounts });
    return buildUnprovedExactCandidateJoinResult(null, observedUpperBoundBeforeSolve);
  }
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
    recordExactJoinMemorySnapshot("solve-workload-limit", { solveCandidateCounts });
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
    exactJoinProofCutoffScore,
    server,
    perfectRate,
    profiling,
    stats,
    isPastDeadline,
    deadlineAt,
    didUseSmallGapSolveRetry ? solveDeadlineAt : null,
    solveOnlyAboveUpperTarget,
    observeEvaluatedResult,
    true,
    context.exactCandidateJoinSolveOrderVariant ?? null,
    context.exactCandidateJoinExtendedThirdShortlistSize ?? null,
    context.exactCandidateJoinExtendedThirdShortlistCacheEntryLimit ?? null,
    context.exactCandidateJoinExtendedThirdShortlistQueryLimit ?? null,
    context.exactCandidateJoinZeroScoreTargetSlack === true,
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
    recordExactJoinMemorySnapshot(joinResult.localTimedOut ? "small-gap-solve-timebox" : "solve-timeout", {
      solveCandidateCounts,
    });
    return buildUnprovedExactCandidateJoinResult(joinResult.result);
  }
  const result = joinResult.result;
  if (
    solveOnlyAboveUpperTarget !== null
    && exactJoinProofCutoffScore <= solveOnlyAboveUpperTarget
    && (!result || result.score <= solveOnlyAboveUpperTarget)
  ) {
    profiling.exactCandidateJoinAbortCount += 1;
    recordAbortDiagnostics("solve-dominated-same-coarse-frontier", {
      candidateCount: candidatesBySlot.reduce((max, candidates) => Math.max(max, candidates.length), 0),
      observedUpperBound: solveOnlyAboveUpperTarget,
    });
    recordExactJoinMemorySnapshot("solve-dominated-after-solve", { solveCandidateCounts });
    return buildUnprovedExactCandidateJoinResult(result, solveOnlyAboveUpperTarget);
  }
  if (result && result.score > incumbentScore) {
    profiling.exactCandidateJoinImprovementCount += 1;
    profiling.bestExactCandidateJoinImprovement = Math.max(
      profiling.bestExactCandidateJoinImprovement,
      result.score - incumbentScore,
    );
  }
  profiling.exactCandidateJoinCompletedCount += 1;
  return buildProvedExactCandidateJoinResult(result);
}
