/*
 * Exact candidate-join proof path for hard medley configurations.
 *
 * This module generates score-ordered slot candidate prefixes, proves unseen frontiers, and
 * searches card-disjoint triples. It may be auto-enabled for large locked/all scopes, but an
 * abort, timeout, or unclosed frontier must leave the configuration bounded.
 */

import {
  compareMedleyResultLike,
  copyMedleyTeamCandidateCardIds,
  evaluateMedleySlotCandidateWithCache,
  forEachMedleyTeamCandidateCardId,
  getFirstMedleyTeamCandidateOverlapCardId,
  getMedleyTeamCandidateCardIdAt,
  getMedleyTeamCandidateCardIdCount,
  getMedleyTeamCandidateCardIds,
  getMedleyScoreOnlyTeamEvaluationCacheSize,
  medleyTeamCandidateHasCardIdInSet,
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
  popMedleyExactSlotUpperSearchNode,
  pushMedleyExactSlotNode,
  pushMedleyExactSlotUpperSearchNode,
} from "./exact-candidate-join-heap";
import {
  estimateMedleyCapacityAssignmentScoreUpperBound,
  estimateMedleyRemainingScoreUpperBound,
} from "../upper/capacity";
import {
  estimateMedleySlotBranchScoreUpperBound,
} from "../upper/skill-context";
import {
  buildCharacterUpperBoundIndex,
  CHARACTER_MASK_SEGMENT_BITS,
  createScoreCalculationCache,
  evaluateMedleyScoreOnlyTeam,
  evaluateMedleyScoreOnlyTeamScore,
  estimateSearchScopeScoreUpperBound,
  hasCharacterIndexInMask,
} from "@/lib/bandori/team-builder/core";
import { groupSearchCardsByCharacter } from "@/lib/bandori/team-builder/core/cards";
import type {
  BandoriMedleyTeamSearchProfilingStats,
  BandoriMedleyTeamSearchResult,
  BandoriMedleyTeamSearchStats,
  MedleyEvaluatedResultObserver,
  MedleyExactCandidateCardKey,
  MedleyExactCandidateCardKeySet,
  MedleyExactCandidateJoinAbortReason,
  MedleyExactCandidateJoinResult,
  MedleyExactCandidateJoinSolveResult,
  MedleyExactSlotCandidateGlobalPruning,
  MedleyExactSlotCandidateGenerator,
  MedleyExactSlotCandidateSearchNode,
  MedleySlotSearch,
  MedleyTeamCandidate,
} from "../types";
import type {
  BandoriAreaItemConfiguration,
  BandoriTeamSearchResult,
  ScoreCalculationCache,
  SearchCard,
} from "@/lib/bandori/team-builder/core";

const MEDLEY_EXACT_JOIN_PREFIX_SEED_MIN_REMAINING_MS = 500;
const MEDLEY_EXACT_JOIN_PREFIX_SEED_MIN_PROOF_BUDGET_MS = 30_000;
const MEDLEY_EXACT_JOIN_PREFIX_SEED_MIN_MEMORY_HEADROOM_MIB = 256;
const MEDLEY_EXACT_JOIN_PREFIX_SEED_MAX_OBSERVED_GAP = 100_000;
const MEDLEY_EXACT_CANDIDATE_SCORE_CALC_CACHE_PRESSURE_SLOT_CARD_COUNT = 260;
const MEDLEY_EXACT_INITIAL_CANDIDATE_SCORE_CALC_CACHE_PRESSURE_SLOT_CARD_COUNT = 200;
const BYTES_PER_MIB = 1024 * 1024;
const MEDLEY_EXACT_CARD_KEY_BITS = BigInt(14);
const MEDLEY_EXACT_CARD_KEY_LIMIT = 1 << 14;
const MEDLEY_EXACT_RAW_JOIN_PARITY_MAX_CANDIDATE_TOTAL = 50_000;
const MEDLEY_EXACT_RAW_JOIN_PARITY_MIN_REMAINING_MS = 2_000;
const MEDLEY_EXACT_SIGNATURE_CENSUS_BUCKET_LIMIT = 20_000;
const MEDLEY_EXACT_SIGNATURE_CENSUS_TOP_BUCKETS = 8;
const MEDLEY_EXACT_DOMINANCE_REPLAY_MAX_CANDIDATE_TOTAL = 60_000;
const MEDLEY_EXACT_DOMINANCE_REPLAY_MAX_GROUP_SIZE = 128;
const MEDLEY_EXACT_PREFIX_UPPER_REPLAY_LEVEL_COUNT = MEDLEY_TEAM_SIZE + 1;
const MEDLEY_EXACT_PREFIX_PROOF_LEDGER_SAMPLE_LIMIT = 8;
const MEDLEY_EXACT_PREFIX_OTHER_UPPER_SOURCE_REPLAY_SAMPLE_LIMIT = 8;
const MEDLEY_EXACT_PREFIX_OTHER_UPPER_SOURCE_REPLAY_DEFAULT_MAX_CHECKS = 2048;
const MEDLEY_EXACT_PREFIX_OTHER_UPPER_SOURCE_REPLAY_DEFAULT_MAX_MARGIN = 10_000;
const MEDLEY_EXACT_PREFIX_UPPER_MARGIN_BUCKET_UPPER_BOUNDS = [
  -500_000,
  -100_000,
  -50_000,
  -10_000,
  -1,
  0,
  1_000,
  10_000,
  50_000,
  100_000,
  500_000,
] as const;
const EMPTY_MEDLEY_EXACT_CANDIDATE_CARD_IDS: number[] = [];

type MedleyExactPrefixProofLedgerSample = {
  songIndex: number;
  level: number;
  impliedCompletionCount: number;
  incumbent: number;
  prefixUpper: number;
  otherSlotUpper: number | null;
  totalUpper: number;
  margin: number;
};

type MedleyExactPrefixOtherUpperSourceReplaySample = {
  songIndex: number;
  level: number;
  impliedCompletionCount: number;
  incumbent: number;
  prefixUpper: number;
  currentOtherUpper: number;
  currentTotalUpper: number;
  currentMargin: number;
  pairUnseenUpper: number | null;
  generatedPairUpper: number | null;
  basicCapacityUpper: number | null;
  tightCapacityUpper: number | null;
  bestSafeOtherUpper: number;
  bestSafeTotalUpper: number;
  bestSafeMargin: number;
  generatedPairOnlyMargin: number | null;
};

type MedleyExactPrefixOtherUpperSourceReplayDecision = {
  wouldSkip: boolean;
  level: number;
  prefixUpper: number;
  bestSafeOtherUpper: number;
  proofCutoffScore: number;
};

type MedleyExactPrefixOtherUpperSourceReplayProfile = {
  enabled: boolean;
  maxChecks: number;
  maxMargin: number;
  checkedCount: number;
  eligibleCount: number;
  overMarginSkippedCount: number;
  budgetSkippedCount: number;
  currentPairUnseenSourceCount: number;
  generatedPairFiniteCount: number;
  generatedPairImprovedCount: number;
  generatedPairOnlyWouldSkipCount: number;
  basicCapacityFiniteCount: number;
  basicCapacityImprovedCount: number;
  basicCapacityWouldSkipCount: number;
  tightCapacityFiniteCount: number;
  tightCapacityImprovedCount: number;
  tightCapacityWouldSkipCount: number;
  bestSafeImprovedCount: number;
  bestSafeWouldSkipCount: number;
  bestSafeReplayViolationCount: number;
  level3CheckedCount: number;
  level3EligibleCount: number;
  level3OverMarginSkippedCount: number;
  level3BudgetSkippedCount: number;
  level3BestSafeWouldSkipCount: number;
  level3BestSafeWouldSkipImpliedCompletionCount: number;
  level3BestSafeReplayViolationCount: number;
  level4CheckedCount: number;
  level4EligibleCount: number;
  level4OverMarginSkippedCount: number;
  level4BudgetSkippedCount: number;
  level4BestSafeWouldSkipCount: number;
  level4BestSafeWouldSkipImpliedCompletionCount: number;
  level4BestSafeReplayViolationCount: number;
  prunedCount: number;
  prunedImpliedCompletionCount: number;
  currentMarginMin: number | null;
  currentMarginMax: number | null;
  bestSafeMarginMin: number | null;
  bestSafeMarginMax: number | null;
  currentMarginBuckets: number[];
  bestSafeMarginBuckets: number[];
  samples: MedleyExactPrefixOtherUpperSourceReplaySample[];
};

type MedleyExactPrefixUpperReplayLevelProfile = {
  level: number;
  checkedPrefixCount: number;
  relaxedImpliedCompletionCount: number;
  finiteSlotUpperCount: number;
  slotUpperPassCount: number;
  slotUpperRejectedCount: number;
  hardUpperCheckedCount: number;
  hardUpperFiniteCount: number;
  hardUpperSkipablePrefixCount: number;
  hardUpperSkipableImpliedCompletionCount: number;
  hardUpperRetainedPrefixCount: number;
  hardUpperUnknownCount: number;
  candidateEvaluationCount: number;
  materializedCandidateCount: number;
  slotUpperMarginMin: number | null;
  slotUpperMarginMax: number | null;
  slotUpperMarginPrefixBuckets: number[];
  slotUpperMarginImpliedCompletionBuckets: number[];
  hardUpperMarginMin: number | null;
  hardUpperMarginMax: number | null;
  hardUpperMarginPrefixBuckets: number[];
  hardUpperMarginImpliedCompletionBuckets: number[];
  leafProofLedgerCheckedCount: number;
  leafProofLedgerFiniteCount: number;
  leafProofLedgerSkipCount: number;
  leafProofLedgerSkipImpliedCompletionCount: number;
  leafProofLedgerRetainedCount: number;
  leafProofLedgerUnknownCount: number;
  leafProofLedgerMarginMin: number | null;
  leafProofLedgerMarginMax: number | null;
  leafProofLedgerMarginPrefixBuckets: number[];
  leafProofLedgerMarginImpliedCompletionBuckets: number[];
  leafProofLedgerSkipSamples: MedleyExactPrefixProofLedgerSample[];
};

type MedleyExactPrefixUpperReplayProfile = {
  algorithm: "hhwx-prefix-upper-replay-v1";
  songIndex: number;
  hardUpperReplayEnabled: boolean;
  otherUpperSourceReplay: MedleyExactPrefixOtherUpperSourceReplayProfile | null;
  levels: MedleyExactPrefixUpperReplayLevelProfile[];
};

type MedleyExactPrefixUpperReplaySummary = {
  algorithm: "hhwx-prefix-upper-replay-v1";
  configurationSummaryCount: number;
  generatorCount: number;
  hardUpperReplayEnabled: boolean;
  checkedPrefixCountTotal: number;
  relaxedImpliedCompletionCountTotal: number;
  finiteSlotUpperCountTotal: number;
  slotUpperPassCountTotal: number;
  slotUpperRejectedCountTotal: number;
  hardUpperCheckedCountTotal: number;
  hardUpperFiniteCountTotal: number;
  hardUpperSkipablePrefixCountTotal: number;
  hardUpperSkipableImpliedCompletionCountTotal: number;
  hardUpperRetainedPrefixCountTotal: number;
  hardUpperUnknownCountTotal: number;
  candidateEvaluationCountTotal: number;
  materializedCandidateCountTotal: number;
  leafProofLedgerCheckedCountTotal: number;
  leafProofLedgerFiniteCountTotal: number;
  leafProofLedgerSkipCountTotal: number;
  leafProofLedgerSkipImpliedCompletionCountTotal: number;
  leafProofLedgerRetainedCountTotal: number;
  leafProofLedgerUnknownCountTotal: number;
  marginBucketUpperBounds: number[];
  otherUpperSourceReplay: MedleyExactPrefixOtherUpperSourceReplayProfile | null;
  levels: MedleyExactPrefixUpperReplayLevelProfile[];
  latestGenerators: Array<Record<string, unknown>>;
};

function roundMiB(bytes: number): number {
  return Math.round((bytes / BYTES_PER_MIB) * 100) / 100;
}

function addCappedCount(left: number, right: number): number {
  const sum = left + right;
  return Number.isSafeInteger(sum) ? sum : Number.MAX_SAFE_INTEGER;
}

function createMedleyExactPrefixMarginBuckets(): number[] {
  return Array.from(
    { length: MEDLEY_EXACT_PREFIX_UPPER_MARGIN_BUCKET_UPPER_BOUNDS.length + 1 },
    () => 0,
  );
}

function getMedleyExactPrefixMarginBucketIndex(margin: number): number {
  for (
    let index = 0;
    index < MEDLEY_EXACT_PREFIX_UPPER_MARGIN_BUCKET_UPPER_BOUNDS.length;
    index += 1
  ) {
    if (margin <= MEDLEY_EXACT_PREFIX_UPPER_MARGIN_BUCKET_UPPER_BOUNDS[index]!) {
      return index;
    }
  }
  return MEDLEY_EXACT_PREFIX_UPPER_MARGIN_BUCKET_UPPER_BOUNDS.length;
}

function addMedleyExactPrefixMarginBucketCounts(
  target: number[],
  source: number[] | undefined,
): void {
  if (!Array.isArray(source)) {
    return;
  }
  const bucketCount = Math.min(target.length, source.length);
  for (let index = 0; index < bucketCount; index += 1) {
    target[index] = addCappedCount(target[index] ?? 0, source[index] ?? 0);
  }
}

function addMedleyExactPrefixProofLedgerSamples(
  target: MedleyExactPrefixProofLedgerSample[],
  source: MedleyExactPrefixProofLedgerSample[] | undefined,
): void {
  if (!Array.isArray(source) || target.length >= MEDLEY_EXACT_PREFIX_PROOF_LEDGER_SAMPLE_LIMIT) {
    return;
  }
  for (const sample of source) {
    if (target.length >= MEDLEY_EXACT_PREFIX_PROOF_LEDGER_SAMPLE_LIMIT) {
      return;
    }
    target.push(sample);
  }
}

function addMedleyExactPrefixOtherUpperSourceReplaySamples(
  target: MedleyExactPrefixOtherUpperSourceReplaySample[],
  source: MedleyExactPrefixOtherUpperSourceReplaySample[] | undefined,
): void {
  if (
    !Array.isArray(source)
    || target.length >= MEDLEY_EXACT_PREFIX_OTHER_UPPER_SOURCE_REPLAY_SAMPLE_LIMIT
  ) {
    return;
  }
  for (const sample of source) {
    if (target.length >= MEDLEY_EXACT_PREFIX_OTHER_UPPER_SOURCE_REPLAY_SAMPLE_LIMIT) {
      return;
    }
    target.push(sample);
  }
}

function recordMedleyExactPrefixMargin(
  prefixBuckets: number[],
  impliedCompletionBuckets: number[],
  margin: number,
  impliedCompletionCount: number,
): void {
  if (!Number.isFinite(margin)) {
    return;
  }
  const bucketIndex = getMedleyExactPrefixMarginBucketIndex(margin);
  prefixBuckets[bucketIndex] = addCappedCount(prefixBuckets[bucketIndex] ?? 0, 1);
  impliedCompletionBuckets[bucketIndex] = addCappedCount(
    impliedCompletionBuckets[bucketIndex] ?? 0,
    impliedCompletionCount,
  );
}

function recordMedleyExactPrefixMarginCount(
  prefixBuckets: number[],
  margin: number,
): void {
  if (!Number.isFinite(margin)) {
    return;
  }
  const bucketIndex = getMedleyExactPrefixMarginBucketIndex(margin);
  prefixBuckets[bucketIndex] = addCappedCount(prefixBuckets[bucketIndex] ?? 0, 1);
}

function minNullableNumber(left: number | null | undefined, right: number | null | undefined): number | null {
  if (left === null || left === undefined || !Number.isFinite(left)) {
    return right === null || right === undefined || !Number.isFinite(right) ? null : right;
  }
  if (right === null || right === undefined || !Number.isFinite(right)) {
    return left;
  }
  return Math.min(left, right);
}

function maxNullableNumber(left: number | null | undefined, right: number | null | undefined): number | null {
  if (left === null || left === undefined || !Number.isFinite(left)) {
    return right === null || right === undefined || !Number.isFinite(right) ? null : right;
  }
  if (right === null || right === undefined || !Number.isFinite(right)) {
    return left;
  }
  return Math.max(left, right);
}

function createMedleyExactPrefixOtherUpperSourceReplayProfile(
  maxChecks: number,
  maxMargin: number,
): MedleyExactPrefixOtherUpperSourceReplayProfile {
  return {
    enabled: true,
    maxChecks,
    maxMargin,
    checkedCount: 0,
    eligibleCount: 0,
    overMarginSkippedCount: 0,
    budgetSkippedCount: 0,
    currentPairUnseenSourceCount: 0,
    generatedPairFiniteCount: 0,
    generatedPairImprovedCount: 0,
    generatedPairOnlyWouldSkipCount: 0,
    basicCapacityFiniteCount: 0,
    basicCapacityImprovedCount: 0,
    basicCapacityWouldSkipCount: 0,
    tightCapacityFiniteCount: 0,
    tightCapacityImprovedCount: 0,
    tightCapacityWouldSkipCount: 0,
    bestSafeImprovedCount: 0,
    bestSafeWouldSkipCount: 0,
    bestSafeReplayViolationCount: 0,
    level3CheckedCount: 0,
    level3EligibleCount: 0,
    level3OverMarginSkippedCount: 0,
    level3BudgetSkippedCount: 0,
    level3BestSafeWouldSkipCount: 0,
    level3BestSafeWouldSkipImpliedCompletionCount: 0,
    level3BestSafeReplayViolationCount: 0,
    level4CheckedCount: 0,
    level4EligibleCount: 0,
    level4OverMarginSkippedCount: 0,
    level4BudgetSkippedCount: 0,
    level4BestSafeWouldSkipCount: 0,
    level4BestSafeWouldSkipImpliedCompletionCount: 0,
    level4BestSafeReplayViolationCount: 0,
    prunedCount: 0,
    prunedImpliedCompletionCount: 0,
    currentMarginMin: null,
    currentMarginMax: null,
    bestSafeMarginMin: null,
    bestSafeMarginMax: null,
    currentMarginBuckets: createMedleyExactPrefixMarginBuckets(),
    bestSafeMarginBuckets: createMedleyExactPrefixMarginBuckets(),
    samples: [],
  };
}

function addMedleyExactPrefixOtherUpperSourceReplayProfile(
  target: MedleyExactPrefixOtherUpperSourceReplayProfile,
  source: MedleyExactPrefixOtherUpperSourceReplayProfile | null | undefined,
): void {
  if (!source) {
    return;
  }
  target.maxChecks = Math.max(target.maxChecks, source.maxChecks);
  target.maxMargin = Math.max(target.maxMargin, source.maxMargin);
  target.checkedCount = addCappedCount(target.checkedCount, source.checkedCount);
  target.eligibleCount = addCappedCount(target.eligibleCount, source.eligibleCount);
  target.overMarginSkippedCount = addCappedCount(target.overMarginSkippedCount, source.overMarginSkippedCount);
  target.budgetSkippedCount = addCappedCount(target.budgetSkippedCount, source.budgetSkippedCount);
  target.currentPairUnseenSourceCount = addCappedCount(
    target.currentPairUnseenSourceCount,
    source.currentPairUnseenSourceCount,
  );
  target.generatedPairFiniteCount = addCappedCount(
    target.generatedPairFiniteCount,
    source.generatedPairFiniteCount,
  );
  target.generatedPairImprovedCount = addCappedCount(
    target.generatedPairImprovedCount,
    source.generatedPairImprovedCount,
  );
  target.generatedPairOnlyWouldSkipCount = addCappedCount(
    target.generatedPairOnlyWouldSkipCount,
    source.generatedPairOnlyWouldSkipCount,
  );
  target.basicCapacityFiniteCount = addCappedCount(target.basicCapacityFiniteCount, source.basicCapacityFiniteCount);
  target.basicCapacityImprovedCount = addCappedCount(
    target.basicCapacityImprovedCount,
    source.basicCapacityImprovedCount,
  );
  target.basicCapacityWouldSkipCount = addCappedCount(
    target.basicCapacityWouldSkipCount,
    source.basicCapacityWouldSkipCount,
  );
  target.tightCapacityFiniteCount = addCappedCount(target.tightCapacityFiniteCount, source.tightCapacityFiniteCount);
  target.tightCapacityImprovedCount = addCappedCount(
    target.tightCapacityImprovedCount,
    source.tightCapacityImprovedCount,
  );
  target.tightCapacityWouldSkipCount = addCappedCount(
    target.tightCapacityWouldSkipCount,
    source.tightCapacityWouldSkipCount,
  );
  target.bestSafeImprovedCount = addCappedCount(target.bestSafeImprovedCount, source.bestSafeImprovedCount);
  target.bestSafeWouldSkipCount = addCappedCount(target.bestSafeWouldSkipCount, source.bestSafeWouldSkipCount);
  target.bestSafeReplayViolationCount = addCappedCount(
    target.bestSafeReplayViolationCount,
    source.bestSafeReplayViolationCount,
  );
  target.level3CheckedCount = addCappedCount(target.level3CheckedCount, source.level3CheckedCount ?? 0);
  target.level3EligibleCount = addCappedCount(target.level3EligibleCount, source.level3EligibleCount ?? 0);
  target.level3OverMarginSkippedCount = addCappedCount(
    target.level3OverMarginSkippedCount,
    source.level3OverMarginSkippedCount ?? 0,
  );
  target.level3BudgetSkippedCount = addCappedCount(
    target.level3BudgetSkippedCount,
    source.level3BudgetSkippedCount ?? 0,
  );
  target.level3BestSafeWouldSkipCount = addCappedCount(
    target.level3BestSafeWouldSkipCount,
    source.level3BestSafeWouldSkipCount ?? 0,
  );
  target.level3BestSafeWouldSkipImpliedCompletionCount = addCappedCount(
    target.level3BestSafeWouldSkipImpliedCompletionCount,
    source.level3BestSafeWouldSkipImpliedCompletionCount ?? 0,
  );
  target.level3BestSafeReplayViolationCount = addCappedCount(
    target.level3BestSafeReplayViolationCount,
    source.level3BestSafeReplayViolationCount ?? 0,
  );
  target.level4CheckedCount = addCappedCount(target.level4CheckedCount, source.level4CheckedCount ?? 0);
  target.level4EligibleCount = addCappedCount(target.level4EligibleCount, source.level4EligibleCount ?? 0);
  target.level4OverMarginSkippedCount = addCappedCount(
    target.level4OverMarginSkippedCount,
    source.level4OverMarginSkippedCount ?? 0,
  );
  target.level4BudgetSkippedCount = addCappedCount(
    target.level4BudgetSkippedCount,
    source.level4BudgetSkippedCount ?? 0,
  );
  target.level4BestSafeWouldSkipCount = addCappedCount(
    target.level4BestSafeWouldSkipCount,
    source.level4BestSafeWouldSkipCount ?? 0,
  );
  target.level4BestSafeWouldSkipImpliedCompletionCount = addCappedCount(
    target.level4BestSafeWouldSkipImpliedCompletionCount,
    source.level4BestSafeWouldSkipImpliedCompletionCount ?? 0,
  );
  target.level4BestSafeReplayViolationCount = addCappedCount(
    target.level4BestSafeReplayViolationCount,
    source.level4BestSafeReplayViolationCount ?? 0,
  );
  target.prunedCount = addCappedCount(target.prunedCount, source.prunedCount);
  target.prunedImpliedCompletionCount = addCappedCount(
    target.prunedImpliedCompletionCount,
    source.prunedImpliedCompletionCount,
  );
  target.currentMarginMin = minNullableNumber(target.currentMarginMin, source.currentMarginMin);
  target.currentMarginMax = maxNullableNumber(target.currentMarginMax, source.currentMarginMax);
  target.bestSafeMarginMin = minNullableNumber(target.bestSafeMarginMin, source.bestSafeMarginMin);
  target.bestSafeMarginMax = maxNullableNumber(target.bestSafeMarginMax, source.bestSafeMarginMax);
  addMedleyExactPrefixMarginBucketCounts(target.currentMarginBuckets, source.currentMarginBuckets);
  addMedleyExactPrefixMarginBucketCounts(target.bestSafeMarginBuckets, source.bestSafeMarginBuckets);
  addMedleyExactPrefixOtherUpperSourceReplaySamples(target.samples, source.samples);
}

function summarizeMedleyExactPrefixOtherUpperSourceReplayProfiles(
  profiles: MedleyExactPrefixUpperReplayProfile[],
): MedleyExactPrefixOtherUpperSourceReplayProfile | null {
  const sourceProfiles = profiles
    .map((profile) => profile.otherUpperSourceReplay)
    .filter((profile): profile is MedleyExactPrefixOtherUpperSourceReplayProfile => profile !== null);
  if (sourceProfiles.length === 0) {
    return null;
  }
  const summary = createMedleyExactPrefixOtherUpperSourceReplayProfile(0, 0);
  for (const sourceProfile of sourceProfiles) {
    addMedleyExactPrefixOtherUpperSourceReplayProfile(summary, sourceProfile);
  }
  return summary;
}

function serializeMedleyExactPrefixOtherUpperSourceReplayProfile(
  profile: MedleyExactPrefixOtherUpperSourceReplayProfile | null | undefined,
  options: { includeBuckets: boolean; includeSamples: boolean },
): Record<string, unknown> | null {
  if (!profile) {
    return null;
  }
  const result: Record<string, unknown> = {
    enabled: profile.enabled,
    maxChecks: profile.maxChecks,
    maxMargin: profile.maxMargin,
    checkedCount: profile.checkedCount,
    eligibleCount: profile.eligibleCount,
    overMarginSkippedCount: profile.overMarginSkippedCount,
    budgetSkippedCount: profile.budgetSkippedCount,
    currentPairUnseenSourceCount: profile.currentPairUnseenSourceCount,
    generatedPairFiniteCount: profile.generatedPairFiniteCount,
    generatedPairImprovedCount: profile.generatedPairImprovedCount,
    generatedPairOnlyWouldSkipCount: profile.generatedPairOnlyWouldSkipCount,
    basicCapacityFiniteCount: profile.basicCapacityFiniteCount,
    basicCapacityImprovedCount: profile.basicCapacityImprovedCount,
    basicCapacityWouldSkipCount: profile.basicCapacityWouldSkipCount,
    tightCapacityFiniteCount: profile.tightCapacityFiniteCount,
    tightCapacityImprovedCount: profile.tightCapacityImprovedCount,
    tightCapacityWouldSkipCount: profile.tightCapacityWouldSkipCount,
    bestSafeImprovedCount: profile.bestSafeImprovedCount,
    bestSafeWouldSkipCount: profile.bestSafeWouldSkipCount,
    bestSafeReplayViolationCount: profile.bestSafeReplayViolationCount,
    level3CheckedCount: profile.level3CheckedCount,
    level3EligibleCount: profile.level3EligibleCount,
    level3OverMarginSkippedCount: profile.level3OverMarginSkippedCount,
    level3BudgetSkippedCount: profile.level3BudgetSkippedCount,
    level3BestSafeWouldSkipCount: profile.level3BestSafeWouldSkipCount,
    level3BestSafeWouldSkipImpliedCompletionCount: profile.level3BestSafeWouldSkipImpliedCompletionCount,
    level3BestSafeReplayViolationCount: profile.level3BestSafeReplayViolationCount,
    level4CheckedCount: profile.level4CheckedCount,
    level4EligibleCount: profile.level4EligibleCount,
    level4OverMarginSkippedCount: profile.level4OverMarginSkippedCount,
    level4BudgetSkippedCount: profile.level4BudgetSkippedCount,
    level4BestSafeWouldSkipCount: profile.level4BestSafeWouldSkipCount,
    level4BestSafeWouldSkipImpliedCompletionCount: profile.level4BestSafeWouldSkipImpliedCompletionCount,
    level4BestSafeReplayViolationCount: profile.level4BestSafeReplayViolationCount,
    prunedCount: profile.prunedCount,
    prunedImpliedCompletionCount: profile.prunedImpliedCompletionCount,
    currentMarginMin: profile.currentMarginMin,
    currentMarginMax: profile.currentMarginMax,
    bestSafeMarginMin: profile.bestSafeMarginMin,
    bestSafeMarginMax: profile.bestSafeMarginMax,
  };
  if (options.includeBuckets) {
    result.currentMarginBuckets = profile.currentMarginBuckets.slice();
    result.bestSafeMarginBuckets = profile.bestSafeMarginBuckets.slice();
  }
  if (options.includeSamples) {
    result.samples = profile.samples.slice();
  }
  return result;
}

function estimateRelaxedCombinationCount(itemCount: number, chooseCount: number): number {
  if (chooseCount < 0 || itemCount < chooseCount) {
    return 0;
  }
  if (chooseCount === 0) {
    return 1;
  }
  const effectiveChoose = Math.min(chooseCount, itemCount - chooseCount);
  let result = 1;
  for (let index = 1; index <= effectiveChoose; index += 1) {
    result = (result * (itemCount - effectiveChoose + index)) / index;
    if (!Number.isSafeInteger(Math.floor(result))) {
      return Number.MAX_SAFE_INTEGER;
    }
  }
  return Math.floor(result);
}

function createMedleyExactPrefixUpperReplayLevelProfile(
  level: number,
): MedleyExactPrefixUpperReplayLevelProfile {
  return {
    level,
    checkedPrefixCount: 0,
    relaxedImpliedCompletionCount: 0,
    finiteSlotUpperCount: 0,
    slotUpperPassCount: 0,
    slotUpperRejectedCount: 0,
    hardUpperCheckedCount: 0,
    hardUpperFiniteCount: 0,
    hardUpperSkipablePrefixCount: 0,
    hardUpperSkipableImpliedCompletionCount: 0,
    hardUpperRetainedPrefixCount: 0,
    hardUpperUnknownCount: 0,
    candidateEvaluationCount: 0,
    materializedCandidateCount: 0,
    slotUpperMarginMin: null,
    slotUpperMarginMax: null,
    slotUpperMarginPrefixBuckets: createMedleyExactPrefixMarginBuckets(),
    slotUpperMarginImpliedCompletionBuckets: createMedleyExactPrefixMarginBuckets(),
    hardUpperMarginMin: null,
    hardUpperMarginMax: null,
    hardUpperMarginPrefixBuckets: createMedleyExactPrefixMarginBuckets(),
    hardUpperMarginImpliedCompletionBuckets: createMedleyExactPrefixMarginBuckets(),
    leafProofLedgerCheckedCount: 0,
    leafProofLedgerFiniteCount: 0,
    leafProofLedgerSkipCount: 0,
    leafProofLedgerSkipImpliedCompletionCount: 0,
    leafProofLedgerRetainedCount: 0,
    leafProofLedgerUnknownCount: 0,
    leafProofLedgerMarginMin: null,
    leafProofLedgerMarginMax: null,
    leafProofLedgerMarginPrefixBuckets: createMedleyExactPrefixMarginBuckets(),
    leafProofLedgerMarginImpliedCompletionBuckets: createMedleyExactPrefixMarginBuckets(),
    leafProofLedgerSkipSamples: [],
  };
}

function createMedleyExactPrefixUpperReplayProfile(
  slot: MedleySlotSearch,
  hardUpperReplayEnabled: boolean,
  otherUpperSourceReplayEnabled: boolean,
  otherUpperSourceReplayMaxChecks: number,
  otherUpperSourceReplayMaxMargin: number,
): MedleyExactPrefixUpperReplayProfile {
  return {
    algorithm: "hhwx-prefix-upper-replay-v1",
    songIndex: slot.songIndex,
    hardUpperReplayEnabled,
    otherUpperSourceReplay: otherUpperSourceReplayEnabled
      ? createMedleyExactPrefixOtherUpperSourceReplayProfile(
        otherUpperSourceReplayMaxChecks,
        otherUpperSourceReplayMaxMargin,
      )
      : null,
    levels: Array.from(
      { length: MEDLEY_EXACT_PREFIX_UPPER_REPLAY_LEVEL_COUNT },
      (_, level) => createMedleyExactPrefixUpperReplayLevelProfile(level),
    ),
  };
}

function getMedleyExactPrefixReplayLevel(
  profile: MedleyExactPrefixUpperReplayProfile,
  level: number,
): MedleyExactPrefixUpperReplayLevelProfile | null {
  return profile.levels[level] ?? null;
}

function addMedleyExactPrefixUpperReplayLevel(
  target: MedleyExactPrefixUpperReplayLevelProfile,
  source: MedleyExactPrefixUpperReplayLevelProfile,
): void {
  target.checkedPrefixCount = addCappedCount(target.checkedPrefixCount, source.checkedPrefixCount);
  target.relaxedImpliedCompletionCount = addCappedCount(
    target.relaxedImpliedCompletionCount,
    source.relaxedImpliedCompletionCount,
  );
  target.finiteSlotUpperCount = addCappedCount(target.finiteSlotUpperCount, source.finiteSlotUpperCount);
  target.slotUpperPassCount = addCappedCount(target.slotUpperPassCount, source.slotUpperPassCount);
  target.slotUpperRejectedCount = addCappedCount(target.slotUpperRejectedCount, source.slotUpperRejectedCount);
  target.hardUpperCheckedCount = addCappedCount(target.hardUpperCheckedCount, source.hardUpperCheckedCount);
  target.hardUpperFiniteCount = addCappedCount(target.hardUpperFiniteCount, source.hardUpperFiniteCount);
  target.hardUpperSkipablePrefixCount = addCappedCount(
    target.hardUpperSkipablePrefixCount,
    source.hardUpperSkipablePrefixCount,
  );
  target.hardUpperSkipableImpliedCompletionCount = addCappedCount(
    target.hardUpperSkipableImpliedCompletionCount,
    source.hardUpperSkipableImpliedCompletionCount,
  );
  target.hardUpperRetainedPrefixCount = addCappedCount(
    target.hardUpperRetainedPrefixCount,
    source.hardUpperRetainedPrefixCount,
  );
  target.hardUpperUnknownCount = addCappedCount(target.hardUpperUnknownCount, source.hardUpperUnknownCount);
  target.candidateEvaluationCount = addCappedCount(
    target.candidateEvaluationCount,
    source.candidateEvaluationCount,
  );
  target.materializedCandidateCount = addCappedCount(
    target.materializedCandidateCount,
    source.materializedCandidateCount,
  );
  target.slotUpperMarginMin = minNullableNumber(target.slotUpperMarginMin, source.slotUpperMarginMin);
  target.slotUpperMarginMax = maxNullableNumber(target.slotUpperMarginMax, source.slotUpperMarginMax);
  addMedleyExactPrefixMarginBucketCounts(
    target.slotUpperMarginPrefixBuckets,
    source.slotUpperMarginPrefixBuckets,
  );
  addMedleyExactPrefixMarginBucketCounts(
    target.slotUpperMarginImpliedCompletionBuckets,
    source.slotUpperMarginImpliedCompletionBuckets,
  );
  target.hardUpperMarginMin = minNullableNumber(target.hardUpperMarginMin, source.hardUpperMarginMin);
  target.hardUpperMarginMax = maxNullableNumber(target.hardUpperMarginMax, source.hardUpperMarginMax);
  addMedleyExactPrefixMarginBucketCounts(
    target.hardUpperMarginPrefixBuckets,
    source.hardUpperMarginPrefixBuckets,
  );
  addMedleyExactPrefixMarginBucketCounts(
    target.hardUpperMarginImpliedCompletionBuckets,
    source.hardUpperMarginImpliedCompletionBuckets,
  );
  target.leafProofLedgerCheckedCount = addCappedCount(
    target.leafProofLedgerCheckedCount,
    source.leafProofLedgerCheckedCount ?? 0,
  );
  target.leafProofLedgerFiniteCount = addCappedCount(
    target.leafProofLedgerFiniteCount,
    source.leafProofLedgerFiniteCount ?? 0,
  );
  target.leafProofLedgerSkipCount = addCappedCount(
    target.leafProofLedgerSkipCount,
    source.leafProofLedgerSkipCount ?? 0,
  );
  target.leafProofLedgerSkipImpliedCompletionCount = addCappedCount(
    target.leafProofLedgerSkipImpliedCompletionCount,
    source.leafProofLedgerSkipImpliedCompletionCount ?? 0,
  );
  target.leafProofLedgerRetainedCount = addCappedCount(
    target.leafProofLedgerRetainedCount,
    source.leafProofLedgerRetainedCount ?? 0,
  );
  target.leafProofLedgerUnknownCount = addCappedCount(
    target.leafProofLedgerUnknownCount,
    source.leafProofLedgerUnknownCount ?? 0,
  );
  target.leafProofLedgerMarginMin = minNullableNumber(
    target.leafProofLedgerMarginMin,
    source.leafProofLedgerMarginMin,
  );
  target.leafProofLedgerMarginMax = maxNullableNumber(
    target.leafProofLedgerMarginMax,
    source.leafProofLedgerMarginMax,
  );
  addMedleyExactPrefixMarginBucketCounts(
    target.leafProofLedgerMarginPrefixBuckets,
    source.leafProofLedgerMarginPrefixBuckets,
  );
  addMedleyExactPrefixMarginBucketCounts(
    target.leafProofLedgerMarginImpliedCompletionBuckets,
    source.leafProofLedgerMarginImpliedCompletionBuckets,
  );
  addMedleyExactPrefixProofLedgerSamples(
    target.leafProofLedgerSkipSamples,
    source.leafProofLedgerSkipSamples,
  );
}

function buildMedleyExactCardIdKey(cardIds: readonly number[]): MedleyExactCandidateCardKey {
  let key = BigInt(cardIds.length);
  for (const cardId of cardIds) {
    if (
      !Number.isInteger(cardId)
      || cardId < 0
      || cardId >= MEDLEY_EXACT_CARD_KEY_LIMIT
    ) {
      return `s:${cardIds.join(",")}`;
    }
    key = (key << MEDLEY_EXACT_CARD_KEY_BITS) | BigInt(cardId);
  }
  return key;
}

function buildMedleyExactCandidateCardIdKey(candidate: MedleyTeamCandidate): MedleyExactCandidateCardKey {
  const cardIdCount = getMedleyTeamCandidateCardIdCount(candidate);
  let key = BigInt(cardIdCount);
  for (let cardIndex = 0; cardIndex < cardIdCount; cardIndex += 1) {
    const cardId = getMedleyTeamCandidateCardIdAt(candidate, cardIndex);
    if (
      cardId === undefined
      || !Number.isInteger(cardId)
      || cardId < 0
      || cardId >= MEDLEY_EXACT_CARD_KEY_LIMIT
    ) {
      return `s:${getMedleyTeamCandidateCardIds(candidate).join(",")}`;
    }
    key = (key << MEDLEY_EXACT_CARD_KEY_BITS) | BigInt(cardId);
  }
  return key;
}

function buildMedleyExactSelectedCardKey(cards: readonly SearchCard[]): MedleyExactCandidateCardKey {
  let key = BigInt(cards.length);
  for (const card of cards) {
    const cardId = card.cardId;
    if (
      !Number.isInteger(cardId)
      || cardId < 0
      || cardId >= MEDLEY_EXACT_CARD_KEY_LIMIT
    ) {
      return `s:${cards.map((selectedCard) => selectedCard.cardId).join(",")}`;
    }
    key = (key << MEDLEY_EXACT_CARD_KEY_BITS) | BigInt(cardId);
  }
  return key;
}

type MedleyExactNestedNumberCache = Map<string, Map<MedleyExactCandidateCardKey, number>>;

type MedleyExactCompactNumberCacheKey = {
  low: number;
  high: number;
};

type MedleyExactCompactNumberCacheBucket = {
  size: number;
  occupied: Uint8Array;
  keyLow: Uint32Array;
  keyHigh: Float64Array;
  values: Float64Array;
  overflow: Map<MedleyExactCandidateCardKey, number> | null;
};

type MedleyExactCompactNestedNumberCache = Map<string, MedleyExactCompactNumberCacheBucket>;

type MedleyExactRawCandidateMirrorSlot = {
  score: Int32Array;
  averageScore: Int32Array;
  maxScore: Int32Array;
  minScore: Int32Array;
  cardIds: Int32Array;
  length: number;
  mismatchCount: number;
  capacity: number;
};

type MedleyExactRawCandidateMirror = {
  slots: MedleyExactRawCandidateMirrorSlot[];
  rebuildCount: number;
};

type MedleyExactRawJoinParitySlot = {
  scores: Int32Array;
  cardIds: Int32Array;
  length: number;
};

type MedleyExactCandidateJoinSlotOrder = {
  slotOrder: number[];
  shouldUseMiddleFirstJoinOrder: boolean;
};

type MedleyExactSignatureCensusBucket = {
  signatureHash: number;
  count: number;
  minScore: number;
  maxScore: number;
  minAverageScore: number;
  maxAverageScore: number;
  minMaxScore: number;
  maxMaxScore: number;
  exampleCardIds: number[];
  exampleLeaderCardId: number | null;
};

type MedleyExactSignatureCensusSlot = {
  slotIndex: number;
  songIndex: number;
  candidateCount: number;
  trackedSignatureCount: number;
  multiCandidateSignatureCount: number;
  singletonSignatureCount: number;
  largestSignatureCount: number;
  overflowCandidateCount: number;
  bucketLimit: number;
  topBucketLimit: number;
  minScore: number | null;
  maxScore: number | null;
  minAverageScore: number | null;
  maxAverageScore: number | null;
  maxMaxScore: number | null;
  duplicateCardKeyCount: number;
  topSignatures: Array<{
    signatureHash: string;
    count: number;
    minScore: number;
    maxScore: number;
    minAverageScore: number;
    maxAverageScore: number;
    minMaxScore: number;
    maxMaxScore: number;
    exampleCardIds: number[];
    exampleLeaderCardId: number | null;
  }>;
};

type MedleyExactUpperReplayBucket = {
  signatureHash: number;
  count: number;
  candidateLevelSkipableCount: number;
  minScore: number;
  maxScore: number;
  minUpperBound: number;
  maxUpperBound: number;
  exampleCardIds: number[];
};

type MedleyExactDominanceReplayCandidateRef = {
  candidate: MedleyTeamCandidate;
  candidateIndex: number;
};

type MedleyExactDominanceReplayContainingBits = {
  wordCount: number;
  containingBitsByCardId: Map<number, Uint32Array>;
};

function getMedleyExactNestedNumberCache(
  cache: MedleyExactNestedNumberCache,
  prefixKey: string,
  cardKey: MedleyExactCandidateCardKey,
): number | undefined {
  return cache.get(prefixKey)?.get(cardKey);
}

function setMedleyExactNestedNumberCache(
  cache: MedleyExactNestedNumberCache,
  prefixKey: string,
  cardKey: MedleyExactCandidateCardKey,
  value: number,
): void {
  let bucket = cache.get(prefixKey);
  if (!bucket) {
    bucket = new Map<MedleyExactCandidateCardKey, number>();
    cache.set(prefixKey, bucket);
  }
  bucket.set(cardKey, value);
}

function countMedleyExactNestedNumberCacheEntries(cache: MedleyExactNestedNumberCache): number {
  let count = 0;
  for (const bucket of cache.values()) {
    count += bucket.size;
  }
  return count;
}

const MEDLEY_EXACT_COMPACT_CACHE_UINT32_MASK = BigInt(0xffffffff);

function splitMedleyExactCompactNumberCacheKey(
  cardKey: MedleyExactCandidateCardKey,
): MedleyExactCompactNumberCacheKey | null {
  if (typeof cardKey !== "bigint") {
    return null;
  }
  return {
    low: Number(cardKey & MEDLEY_EXACT_COMPACT_CACHE_UINT32_MASK) >>> 0,
    high: Number(cardKey >> BigInt(32)),
  };
}

function hashMedleyExactCompactNumberCacheKey(key: MedleyExactCompactNumberCacheKey): number {
  const highLow = key.high >>> 0;
  const highHigh = Math.floor(key.high / 0x100000000) >>> 0;
  let hash = Math.imul(key.low ^ highLow, 0x9e3779b1);
  hash ^= Math.imul(highHigh ^ (hash >>> 16), 0x85ebca6b);
  return hash >>> 0;
}

function createMedleyExactCompactNumberCacheBucket(capacity = 16): MedleyExactCompactNumberCacheBucket {
  const normalizedCapacity = 1 << Math.ceil(Math.log2(Math.max(16, capacity)));
  return {
    size: 0,
    occupied: new Uint8Array(normalizedCapacity),
    keyLow: new Uint32Array(normalizedCapacity),
    keyHigh: new Float64Array(normalizedCapacity),
    values: new Float64Array(normalizedCapacity),
    overflow: null,
  };
}

function findMedleyExactCompactNumberCacheSlot(
  bucket: MedleyExactCompactNumberCacheBucket,
  key: MedleyExactCompactNumberCacheKey,
): { index: number; found: boolean } {
  const mask = bucket.occupied.length - 1;
  let index = hashMedleyExactCompactNumberCacheKey(key) & mask;
  while (bucket.occupied[index] !== 0) {
    if (bucket.keyLow[index] === key.low && bucket.keyHigh[index] === key.high) {
      return { index, found: true };
    }
    index = (index + 1) & mask;
  }
  return { index, found: false };
}

function growMedleyExactCompactNumberCacheBucket(
  bucket: MedleyExactCompactNumberCacheBucket,
): MedleyExactCompactNumberCacheBucket {
  const nextBucket = createMedleyExactCompactNumberCacheBucket(bucket.occupied.length * 2);
  for (let index = 0; index < bucket.occupied.length; index += 1) {
    if (bucket.occupied[index] === 0) {
      continue;
    }
    const key = { low: bucket.keyLow[index], high: bucket.keyHigh[index] };
    const slot = findMedleyExactCompactNumberCacheSlot(nextBucket, key);
    nextBucket.occupied[slot.index] = 1;
    nextBucket.keyLow[slot.index] = key.low;
    nextBucket.keyHigh[slot.index] = key.high;
    nextBucket.values[slot.index] = bucket.values[index];
    nextBucket.size += 1;
  }
  nextBucket.overflow = bucket.overflow;
  return nextBucket;
}

function getMedleyExactCompactNestedNumberCache(
  cache: MedleyExactCompactNestedNumberCache,
  prefixKey: string,
  cardKey: MedleyExactCandidateCardKey,
): number | undefined {
  const bucket = cache.get(prefixKey);
  if (!bucket) {
    return undefined;
  }
  const key = splitMedleyExactCompactNumberCacheKey(cardKey);
  if (!key) {
    return bucket.overflow?.get(cardKey);
  }
  const slot = findMedleyExactCompactNumberCacheSlot(bucket, key);
  return slot.found ? bucket.values[slot.index] : undefined;
}

function setMedleyExactCompactNestedNumberCache(
  cache: MedleyExactCompactNestedNumberCache,
  prefixKey: string,
  cardKey: MedleyExactCandidateCardKey,
  value: number,
): void {
  const key = splitMedleyExactCompactNumberCacheKey(cardKey);
  let bucket = cache.get(prefixKey);
  if (!bucket) {
    bucket = createMedleyExactCompactNumberCacheBucket();
    cache.set(prefixKey, bucket);
  }
  if (!key) {
    if (!bucket.overflow) {
      bucket.overflow = new Map<MedleyExactCandidateCardKey, number>();
    }
    bucket.overflow.set(cardKey, value);
    return;
  }
  if ((bucket.size + 1) / bucket.occupied.length > 0.7) {
    bucket = growMedleyExactCompactNumberCacheBucket(bucket);
    cache.set(prefixKey, bucket);
  }
  const slot = findMedleyExactCompactNumberCacheSlot(bucket, key);
  if (!slot.found) {
    bucket.occupied[slot.index] = 1;
    bucket.keyLow[slot.index] = key.low;
    bucket.keyHigh[slot.index] = key.high;
    bucket.size += 1;
  }
  bucket.values[slot.index] = value;
}

function countMedleyExactCompactNestedNumberCacheEntries(cache: MedleyExactCompactNestedNumberCache): number {
  let count = 0;
  for (const bucket of cache.values()) {
    count += bucket.size + (bucket.overflow?.size ?? 0);
  }
  return count;
}

function estimateMedleyExactCompactNestedNumberCacheBytes(cache: MedleyExactCompactNestedNumberCache): number {
  let bytes = 0;
  for (const bucket of cache.values()) {
    bytes += bucket.occupied.byteLength;
    bytes += bucket.keyLow.byteLength;
    bytes += bucket.keyHigh.byteLength;
    bytes += bucket.values.byteLength;
  }
  return bytes;
}

class MedleyExactCompactCandidateCardKeySet implements MedleyExactCandidateCardKeySet {
  private numericSize = 0;
  private occupied: Uint8Array;
  private keyLow: Uint32Array;
  private keyHigh: Float64Array;
  private overflow: Set<MedleyExactCandidateCardKey> | null = null;

  constructor(capacity = 16) {
    const normalizedCapacity = 1 << Math.ceil(Math.log2(Math.max(16, capacity)));
    this.occupied = new Uint8Array(normalizedCapacity);
    this.keyLow = new Uint32Array(normalizedCapacity);
    this.keyHigh = new Float64Array(normalizedCapacity);
  }

  get size(): number {
    return this.numericSize + (this.overflow?.size ?? 0);
  }

  has(cardKey: MedleyExactCandidateCardKey): boolean {
    const key = splitMedleyExactCompactNumberCacheKey(cardKey);
    if (!key) {
      return this.overflow?.has(cardKey) === true;
    }
    return this.findSlot(key).found;
  }

  add(cardKey: MedleyExactCandidateCardKey): this {
    const key = splitMedleyExactCompactNumberCacheKey(cardKey);
    if (!key) {
      if (!this.overflow) {
        this.overflow = new Set<MedleyExactCandidateCardKey>();
      }
      this.overflow.add(cardKey);
      return this;
    }
    if ((this.numericSize + 1) / this.occupied.length > 0.7) {
      this.grow();
    }
    const slot = this.findSlot(key);
    if (!slot.found) {
      this.occupied[slot.index] = 1;
      this.keyLow[slot.index] = key.low;
      this.keyHigh[slot.index] = key.high;
      this.numericSize += 1;
    }
    return this;
  }

  estimateBytes(): number {
    return this.occupied.byteLength + this.keyLow.byteLength + this.keyHigh.byteLength;
  }

  private findSlot(key: MedleyExactCompactNumberCacheKey): { index: number; found: boolean } {
    const mask = this.occupied.length - 1;
    let index = hashMedleyExactCompactNumberCacheKey(key) & mask;
    while (this.occupied[index] !== 0) {
      if (this.keyLow[index] === key.low && this.keyHigh[index] === key.high) {
        return { index, found: true };
      }
      index = (index + 1) & mask;
    }
    return { index, found: false };
  }

  private grow(): void {
    const previousOccupied = this.occupied;
    const previousKeyLow = this.keyLow;
    const previousKeyHigh = this.keyHigh;
    this.occupied = new Uint8Array(previousOccupied.length * 2);
    this.keyLow = new Uint32Array(previousKeyLow.length * 2);
    this.keyHigh = new Float64Array(previousKeyHigh.length * 2);
    this.numericSize = 0;
    for (let index = 0; index < previousOccupied.length; index += 1) {
      if (previousOccupied[index] === 0) {
        continue;
      }
      this.addSplitKey({
        low: previousKeyLow[index],
        high: previousKeyHigh[index],
      });
    }
  }

  private addSplitKey(key: MedleyExactCompactNumberCacheKey): void {
    const slot = this.findSlot(key);
    if (!slot.found) {
      this.occupied[slot.index] = 1;
      this.keyLow[slot.index] = key.low;
      this.keyHigh[slot.index] = key.high;
      this.numericSize += 1;
    }
  }
}

function createMedleyExactCandidateCardKeySet(
  candidates: MedleyTeamCandidate[],
  compact: boolean,
): MedleyExactCandidateCardKeySet {
  const keySet: MedleyExactCandidateCardKeySet = compact
    ? new MedleyExactCompactCandidateCardKeySet(Math.max(16, candidates.length * 2))
    : new Set<MedleyExactCandidateCardKey>();
  for (const candidate of candidates) {
    keySet.add(getMedleyExactCandidateCardKey(candidate));
  }
  return keySet;
}

function getMedleyExactCandidateCardKeySetRepresentation(keySet: MedleyExactCandidateCardKeySet): string {
  return keySet instanceof MedleyExactCompactCandidateCardKeySet
    ? "compact-packed-card-id"
    : "packed-card-id";
}

function estimateMedleyExactCandidateCardKeySetBytes(keySet: MedleyExactCandidateCardKeySet): number | null {
  return keySet instanceof MedleyExactCompactCandidateCardKeySet
    ? keySet.estimateBytes()
    : null;
}
const medleyExactSignatureCardContextHashCache = new WeakMap<SearchCard, number>();

function updateMedleyExactSignatureHashInt(hash: number, value: number): number {
  let nextHash = hash >>> 0;
  const intValue = value | 0;
  for (let offset = 0; offset < 32; offset += 8) {
    nextHash ^= (intValue >>> offset) & 0xff;
    nextHash = Math.imul(nextHash, 0x01000193) >>> 0;
  }
  return nextHash;
}

function updateMedleyExactSignatureHashString(hash: number, value: string): number {
  let nextHash = hash >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    nextHash ^= value.charCodeAt(index) & 0xff;
    nextHash = Math.imul(nextHash, 0x01000193) >>> 0;
  }
  return nextHash;
}

function getMedleyExactCardContextSignatureHash(card: SearchCard): number {
  const cached = medleyExactSignatureCardContextHashCache.get(card);
  if (cached !== undefined) {
    return cached;
  }
  let hash = 0x811c9dc5;
  hash = updateMedleyExactSignatureHashInt(hash, card.bandId ?? -1);
  hash = updateMedleyExactSignatureHashString(hash, card.attribute);
  hash = updateMedleyExactSignatureHashString(hash, card.skillSearchSignature);
  medleyExactSignatureCardContextHashCache.set(card, hash);
  return hash;
}

function getMedleyExactCandidateCards(slot: MedleySlotSearch, candidate: MedleyTeamCandidate): SearchCard[] {
  if (candidate.cards.length === MEDLEY_TEAM_SIZE) {
    return candidate.cards;
  }
  if (
    candidate.cardSearchIndex0 !== undefined
    && candidate.cardSearchIndex1 !== undefined
    && candidate.cardSearchIndex2 !== undefined
    && candidate.cardSearchIndex3 !== undefined
    && candidate.cardSearchIndex4 !== undefined
    && candidate.cardSearchIndex0 >= 0
    && candidate.cardSearchIndex1 >= 0
    && candidate.cardSearchIndex2 >= 0
    && candidate.cardSearchIndex3 >= 0
    && candidate.cardSearchIndex4 >= 0
  ) {
    return [
      slot.searchCards[candidate.cardSearchIndex0]!,
      slot.searchCards[candidate.cardSearchIndex1]!,
      slot.searchCards[candidate.cardSearchIndex2]!,
      slot.searchCards[candidate.cardSearchIndex3]!,
      slot.searchCards[candidate.cardSearchIndex4]!,
    ];
  }
  if (candidate.cardSearchIndices?.length === MEDLEY_TEAM_SIZE) {
    return candidate.cardSearchIndices.map((cardIndex) => slot.searchCards[cardIndex]!);
  }
  const cardsById = new Map(slot.searchCards.map((card) => [card.cardId, card]));
  return getMedleyTeamCandidateCardIds(candidate)
    .map((cardId) => cardsById.get(cardId))
    .filter((card): card is SearchCard => card !== undefined);
}

function getMedleyExactCandidateSignatureHash(slot: MedleySlotSearch, candidate: MedleyTeamCandidate): number {
  let hash = 0x811c9dc5;
  const candidateCards = getMedleyExactCandidateCards(slot, candidate);
  const leaderCard = candidateCards.find((card) => card.cardId === candidate.result.leaderCardId)
    ?? candidateCards[0]
    ?? null;
  hash = updateMedleyExactSignatureHashInt(hash, candidateCards.length);
  hash = updateMedleyExactSignatureHashInt(
    hash,
    leaderCard ? getMedleyExactCardContextSignatureHash(leaderCard) : 0,
  );
  const cardContextHashes = candidateCards
    .map(getMedleyExactCardContextSignatureHash)
    .sort((left, right) => left - right);
  for (const cardContextHash of cardContextHashes) {
    hash = updateMedleyExactSignatureHashInt(hash, cardContextHash);
  }
  return hash >>> 0;
}

function stripMedleyExactCandidateCardRetention(
  candidate: MedleyTeamCandidate,
  cardSearchIndices: number[],
): MedleyTeamCandidate {
  candidate.cardId0 = candidate.cardIds[0] ?? -1;
  candidate.cardId1 = candidate.cardIds[1] ?? -1;
  candidate.cardId2 = candidate.cardIds[2] ?? -1;
  candidate.cardId3 = candidate.cardIds[3] ?? -1;
  candidate.cardId4 = candidate.cardIds[4] ?? -1;
  candidate.cardIds = EMPTY_MEDLEY_EXACT_CANDIDATE_CARD_IDS;
  candidate.cardSearchIndices = undefined;
  candidate.cardSearchIndex0 = cardSearchIndices[0] ?? -1;
  candidate.cardSearchIndex1 = cardSearchIndices[1] ?? -1;
  candidate.cardSearchIndex2 = cardSearchIndices[2] ?? -1;
  candidate.cardSearchIndex3 = cardSearchIndices[3] ?? -1;
  candidate.cardSearchIndex4 = cardSearchIndices[4] ?? -1;
  candidate.cards = [];
  return candidate;
}

function stripMedleyExactCandidateResultRetention(candidate: MedleyTeamCandidate): MedleyTeamCandidate {
  const result = candidate.result;
  candidate.result = {
    score: result.score,
    targetValue: result.targetValue,
    averageScore: result.averageScore,
    maxScore: result.maxScore,
    minScore: result.minScore,
    leaderCardId: result.leaderCardId,
  } as BandoriTeamSearchResult;
  candidate.cardInstanceKeys = undefined;
  return candidate;
}

function formatMedleyExactSignatureHash(hash: number): string {
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createMedleyExactSignatureCensusBucket(
  candidate: MedleyTeamCandidate,
  signatureHash: number,
): MedleyExactSignatureCensusBucket {
  return {
    signatureHash,
    count: 0,
    minScore: Number.POSITIVE_INFINITY,
    maxScore: Number.NEGATIVE_INFINITY,
    minAverageScore: Number.POSITIVE_INFINITY,
    maxAverageScore: Number.NEGATIVE_INFINITY,
    minMaxScore: Number.POSITIVE_INFINITY,
    maxMaxScore: Number.NEGATIVE_INFINITY,
    exampleCardIds: copyMedleyTeamCandidateCardIds(candidate),
    exampleLeaderCardId: Number.isFinite(candidate.result.leaderCardId)
      ? candidate.result.leaderCardId
      : null,
  };
}

function updateMedleyExactSignatureCensusBucket(
  bucket: MedleyExactSignatureCensusBucket,
  candidate: MedleyTeamCandidate,
): void {
  bucket.count += 1;
  bucket.minScore = Math.min(bucket.minScore, candidate.result.score);
  bucket.maxScore = Math.max(bucket.maxScore, candidate.result.score);
  bucket.minAverageScore = Math.min(bucket.minAverageScore, candidate.result.averageScore);
  bucket.maxAverageScore = Math.max(bucket.maxAverageScore, candidate.result.averageScore);
  bucket.minMaxScore = Math.min(bucket.minMaxScore, candidate.result.maxScore);
  bucket.maxMaxScore = Math.max(bucket.maxMaxScore, candidate.result.maxScore);
}

function buildMedleyExactSignatureCensusSlot(
  slot: MedleySlotSearch,
  slotIndex: number,
  candidates: MedleyTeamCandidate[],
  candidateKeyCount: number,
): MedleyExactSignatureCensusSlot {
  const buckets = new Map<number, MedleyExactSignatureCensusBucket>();
  let overflowCandidateCount = 0;
  let minScore = Number.POSITIVE_INFINITY;
  let maxScore = Number.NEGATIVE_INFINITY;
  let minAverageScore = Number.POSITIVE_INFINITY;
  let maxAverageScore = Number.NEGATIVE_INFINITY;
  let maxMaxScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    minScore = Math.min(minScore, candidate.result.score);
    maxScore = Math.max(maxScore, candidate.result.score);
    minAverageScore = Math.min(minAverageScore, candidate.result.averageScore);
    maxAverageScore = Math.max(maxAverageScore, candidate.result.averageScore);
    maxMaxScore = Math.max(maxMaxScore, candidate.result.maxScore);

    const signatureHash = getMedleyExactCandidateSignatureHash(slot, candidate);
    let bucket = buckets.get(signatureHash);
    if (!bucket) {
      if (buckets.size >= MEDLEY_EXACT_SIGNATURE_CENSUS_BUCKET_LIMIT) {
        overflowCandidateCount += 1;
        continue;
      }
      bucket = createMedleyExactSignatureCensusBucket(candidate, signatureHash);
      buckets.set(signatureHash, bucket);
    }
    updateMedleyExactSignatureCensusBucket(bucket, candidate);
  }

  const bucketValues = [...buckets.values()];
  const multiCandidateSignatureCount = bucketValues.reduce((count, bucket) => (
    count + (bucket.count > 1 ? 1 : 0)
  ), 0);
  const topSignatures = bucketValues
    .sort((left, right) => (
      right.count - left.count
      || right.maxScore - left.maxScore
      || right.maxAverageScore - left.maxAverageScore
      || left.signatureHash - right.signatureHash
    ))
    .slice(0, MEDLEY_EXACT_SIGNATURE_CENSUS_TOP_BUCKETS)
    .map((bucket) => ({
      signatureHash: formatMedleyExactSignatureHash(bucket.signatureHash),
      count: bucket.count,
      minScore: bucket.minScore,
      maxScore: bucket.maxScore,
      minAverageScore: bucket.minAverageScore,
      maxAverageScore: bucket.maxAverageScore,
      minMaxScore: bucket.minMaxScore,
      maxMaxScore: bucket.maxMaxScore,
      exampleCardIds: bucket.exampleCardIds,
      exampleLeaderCardId: bucket.exampleLeaderCardId,
    }));

  return {
    slotIndex,
    songIndex: slot.songIndex,
    candidateCount: candidates.length,
    trackedSignatureCount: buckets.size,
    multiCandidateSignatureCount,
    singletonSignatureCount: buckets.size - multiCandidateSignatureCount,
    largestSignatureCount: bucketValues[0]?.count ?? 0,
    overflowCandidateCount,
    bucketLimit: MEDLEY_EXACT_SIGNATURE_CENSUS_BUCKET_LIMIT,
    topBucketLimit: MEDLEY_EXACT_SIGNATURE_CENSUS_TOP_BUCKETS,
    minScore: Number.isFinite(minScore) ? minScore : null,
    maxScore: Number.isFinite(maxScore) ? maxScore : null,
    minAverageScore: Number.isFinite(minAverageScore) ? minAverageScore : null,
    maxAverageScore: Number.isFinite(maxAverageScore) ? maxAverageScore : null,
    maxMaxScore: Number.isFinite(maxMaxScore) ? maxMaxScore : null,
    duplicateCardKeyCount: Math.max(0, candidates.length - candidateKeyCount),
    topSignatures,
  };
}

function buildMedleyExactSignatureCensusProfile(
  slots: MedleySlotSearch[],
  candidatesBySlot: MedleyTeamCandidate[][],
  candidateKeyCountsBySlot: number[],
): Record<string, unknown> {
  const slotProfiles = candidatesBySlot.map((candidates, slotIndex) => (
    buildMedleyExactSignatureCensusSlot(
      slots[slotIndex],
      slotIndex,
      candidates,
      candidateKeyCountsBySlot[slotIndex] ?? candidates.length,
    )
  ));
  return {
    algorithm: "hhwx-coarse-skill-context-signature-v1",
    lossyHash: "fnv1a32",
    bucketLimit: MEDLEY_EXACT_SIGNATURE_CENSUS_BUCKET_LIMIT,
    topBucketLimit: MEDLEY_EXACT_SIGNATURE_CENSUS_TOP_BUCKETS,
    candidateCountTotal: slotProfiles.reduce((sum, slot) => sum + slot.candidateCount, 0),
    trackedSignatureCountTotal: slotProfiles.reduce((sum, slot) => sum + slot.trackedSignatureCount, 0),
    multiCandidateSignatureCountTotal: slotProfiles.reduce((sum, slot) => (
      sum + slot.multiCandidateSignatureCount
    ), 0),
    overflowCandidateCountTotal: slotProfiles.reduce((sum, slot) => sum + slot.overflowCandidateCount, 0),
    duplicateCardKeyCountTotal: slotProfiles.reduce((sum, slot) => sum + slot.duplicateCardKeyCount, 0),
    slots: slotProfiles,
  };
}

function createMedleyExactUpperReplayBucket(
  candidate: MedleyTeamCandidate,
  signatureHash: number,
): MedleyExactUpperReplayBucket {
  return {
    signatureHash,
    count: 0,
    candidateLevelSkipableCount: 0,
    minScore: Number.POSITIVE_INFINITY,
    maxScore: Number.NEGATIVE_INFINITY,
    minUpperBound: Number.POSITIVE_INFINITY,
    maxUpperBound: Number.NEGATIVE_INFINITY,
    exampleCardIds: copyMedleyTeamCandidateCardIds(candidate),
  };
}

function updateMedleyExactUpperReplayBucket(
  bucket: MedleyExactUpperReplayBucket,
  candidate: MedleyTeamCandidate,
  candidateUpperBound: number,
  candidateLevelSkipable: boolean,
): void {
  bucket.count += 1;
  if (candidateLevelSkipable) {
    bucket.candidateLevelSkipableCount += 1;
  }
  bucket.minScore = Math.min(bucket.minScore, candidate.result.score);
  bucket.maxScore = Math.max(bucket.maxScore, candidate.result.score);
  bucket.minUpperBound = Math.min(bucket.minUpperBound, candidateUpperBound);
  bucket.maxUpperBound = Math.max(bucket.maxUpperBound, candidateUpperBound);
}

function buildMedleyExactUpperReplaySlotProfile(
  slot: MedleySlotSearch,
  slotIndex: number,
  candidates: MedleyTeamCandidate[],
  candidateCutoff: number,
  otherUpper: number,
  proofCutoffScore: number,
): Record<string, unknown> {
  const hasReplayUpper = (
    Number.isFinite(otherUpper)
    && Number.isFinite(proofCutoffScore)
  );
  const buckets = new Map<number, MedleyExactUpperReplayBucket>();
  let overflowCandidateCount = 0;
  let candidateLevelSkipableCount = 0;
  let candidateLevelRetainedCount = 0;
  let belowCandidateCutoffCount = 0;
  let minUpperBound = Number.POSITIVE_INFINITY;
  let maxUpperBound = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const candidateUpperBound = hasReplayUpper
      ? candidate.result.score + otherUpper
      : Number.POSITIVE_INFINITY;
    minUpperBound = Math.min(minUpperBound, candidateUpperBound);
    maxUpperBound = Math.max(maxUpperBound, candidateUpperBound);
    const candidateLevelSkipable = hasReplayUpper && candidateUpperBound <= proofCutoffScore;
    if (candidateLevelSkipable) {
      candidateLevelSkipableCount += 1;
    } else {
      candidateLevelRetainedCount += 1;
    }
    if (
      Number.isFinite(candidateCutoff)
      && candidate.result.score < candidateCutoff
    ) {
      belowCandidateCutoffCount += 1;
    }

    const signatureHash = getMedleyExactCandidateSignatureHash(slot, candidate);
    let bucket = buckets.get(signatureHash);
    if (!bucket) {
      if (buckets.size >= MEDLEY_EXACT_SIGNATURE_CENSUS_BUCKET_LIMIT) {
        overflowCandidateCount += 1;
        continue;
      }
      bucket = createMedleyExactUpperReplayBucket(candidate, signatureHash);
      buckets.set(signatureHash, bucket);
    }
    updateMedleyExactUpperReplayBucket(
      bucket,
      candidate,
      candidateUpperBound,
      candidateLevelSkipable,
    );
  }

  let bucketLevelSkipableCount = 0;
  let bucketLevelSkipableCandidateCount = 0;
  let bucketLevelViolationCount = 0;
  const bucketValues = [...buckets.values()];
  for (const bucket of bucketValues) {
    const bucketUpperBound = hasReplayUpper
      ? bucket.maxScore + otherUpper
      : Number.POSITIVE_INFINITY;
    if (hasReplayUpper && bucketUpperBound <= proofCutoffScore) {
      bucketLevelSkipableCount += 1;
      bucketLevelSkipableCandidateCount += bucket.count;
      if (bucket.candidateLevelSkipableCount !== bucket.count) {
        bucketLevelViolationCount += 1;
      }
    }
  }

  const topBuckets = bucketValues
    .sort((left, right) => (
      right.count - left.count
      || (right.maxUpperBound - proofCutoffScore) - (left.maxUpperBound - proofCutoffScore)
      || left.signatureHash - right.signatureHash
    ))
    .slice(0, MEDLEY_EXACT_SIGNATURE_CENSUS_TOP_BUCKETS)
    .map((bucket) => ({
      signatureHash: formatMedleyExactSignatureHash(bucket.signatureHash),
      count: bucket.count,
      candidateLevelSkipableCount: bucket.candidateLevelSkipableCount,
      bucketLevelSkipable: hasReplayUpper && bucket.maxUpperBound <= proofCutoffScore,
      minScore: bucket.minScore,
      maxScore: bucket.maxScore,
      minUpperBound: Number.isFinite(bucket.minUpperBound) ? bucket.minUpperBound : null,
      maxUpperBound: Number.isFinite(bucket.maxUpperBound) ? bucket.maxUpperBound : null,
      upperGap: Number.isFinite(bucket.maxUpperBound) ? bucket.maxUpperBound - proofCutoffScore : null,
      exampleCardIds: bucket.exampleCardIds,
    }));

  return {
    slotIndex,
    songIndex: slot.songIndex,
    candidateCount: candidates.length,
    hasReplayUpper,
    proofCutoffScore: Number.isFinite(proofCutoffScore) ? proofCutoffScore : null,
    candidateCutoff: Number.isFinite(candidateCutoff) ? candidateCutoff : null,
    otherUpper: Number.isFinite(otherUpper) ? otherUpper : null,
    candidateLevelSkipableCount,
    candidateLevelRetainedCount,
    bucketLevelSkipableCount,
    bucketLevelSkipableCandidateCount,
    bucketLevelViolationCount,
    belowCandidateCutoffCount,
    trackedSignatureCount: buckets.size,
    overflowCandidateCount,
    bucketLimit: MEDLEY_EXACT_SIGNATURE_CENSUS_BUCKET_LIMIT,
    minUpperBound: Number.isFinite(minUpperBound) ? minUpperBound : null,
    maxUpperBound: Number.isFinite(maxUpperBound) ? maxUpperBound : null,
    topBuckets,
  };
}

function buildMedleyExactUpperReplayProfile(
  slots: MedleySlotSearch[],
  candidatesBySlot: MedleyTeamCandidate[][],
  candidateCutoffsBySlot: number[],
  candidateOtherUpperBySlot: number[],
  proofCutoffScore: number,
): Record<string, unknown> {
  const slotProfiles = candidatesBySlot.map((candidates, slotIndex) => (
    buildMedleyExactUpperReplaySlotProfile(
      slots[slotIndex],
      slotIndex,
      candidates,
      candidateCutoffsBySlot[slotIndex] ?? Number.NaN,
      candidateOtherUpperBySlot[slotIndex] ?? Number.NaN,
      proofCutoffScore,
    )
  ));
  return {
    algorithm: "hhwx-materialized-signature-upper-replay-v1",
    materializedOnly: true,
    coversUnseenFrontier: false,
    scoreField: "result.score",
    proofCutoffScore: Number.isFinite(proofCutoffScore) ? proofCutoffScore : null,
    bucketLimit: MEDLEY_EXACT_SIGNATURE_CENSUS_BUCKET_LIMIT,
    topBucketLimit: MEDLEY_EXACT_SIGNATURE_CENSUS_TOP_BUCKETS,
    candidateCountTotal: slotProfiles.reduce((sum, slot) => (
      sum + (typeof slot.candidateCount === "number" ? slot.candidateCount : 0)
    ), 0),
    candidateLevelSkipableCountTotal: slotProfiles.reduce((sum, slot) => (
      sum + (typeof slot.candidateLevelSkipableCount === "number" ? slot.candidateLevelSkipableCount : 0)
    ), 0),
    bucketLevelSkipableCountTotal: slotProfiles.reduce((sum, slot) => (
      sum + (typeof slot.bucketLevelSkipableCount === "number" ? slot.bucketLevelSkipableCount : 0)
    ), 0),
    bucketLevelSkipableCandidateCountTotal: slotProfiles.reduce((sum, slot) => (
      sum + (typeof slot.bucketLevelSkipableCandidateCount === "number"
        ? slot.bucketLevelSkipableCandidateCount
        : 0)
    ), 0),
    violationCountTotal: slotProfiles.reduce((sum, slot) => (
      sum
      + (typeof slot.bucketLevelViolationCount === "number" ? slot.bucketLevelViolationCount : 0)
    ), 0),
    overflowCandidateCountTotal: slotProfiles.reduce((sum, slot) => (
      sum + (typeof slot.overflowCandidateCount === "number" ? slot.overflowCandidateCount : 0)
    ), 0),
    slots: slotProfiles,
  };
}

function canMedleyExactCandidateDominateByScore(
  dominant: MedleyTeamCandidate,
  dominated: MedleyTeamCandidate,
  dominantIndex: number,
  dominatedIndex: number,
): boolean {
  if (
    dominant.result.score < dominated.result.score
    || dominant.result.averageScore < dominated.result.averageScore
    || dominant.result.maxScore < dominated.result.maxScore
    || dominant.result.minScore < dominated.result.minScore
    || dominant.result.targetValue < dominated.result.targetValue
  ) {
    return false;
  }
  return (
    dominant.result.score > dominated.result.score
    || dominant.result.averageScore > dominated.result.averageScore
    || dominant.result.maxScore > dominated.result.maxScore
    || dominant.result.minScore > dominated.result.minScore
    || dominant.result.targetValue > dominated.result.targetValue
    || dominantIndex < dominatedIndex
  );
}

function medleyExactForbiddenBitsAreSubset(
  subsetBits: Uint32Array,
  supersetBits: Uint32Array,
): boolean {
  for (let wordIndex = 0; wordIndex < subsetBits.length; wordIndex += 1) {
    if ((subsetBits[wordIndex] & ~supersetBits[wordIndex]) !== 0) {
      return false;
    }
  }
  return true;
}

function medleyExactCandidateMaterializedConflictFootprintSubset(
  dominant: MedleyTeamCandidate,
  dominated: MedleyTeamCandidate,
  otherSlotQueries: MedleyExactDominanceReplayContainingBits[],
): boolean {
  for (const query of otherSlotQueries) {
    if (query.wordCount === 0) {
      continue;
    }
    const dominantBits = writeMedleyExactForbiddenCandidateBits(
      dominant,
      query.containingBitsByCardId,
      query.wordCount,
      new Uint32Array(query.wordCount),
    );
    const dominatedBits = writeMedleyExactForbiddenCandidateBits(
      dominated,
      query.containingBitsByCardId,
      query.wordCount,
      new Uint32Array(query.wordCount),
    );
    if (!medleyExactForbiddenBitsAreSubset(dominantBits, dominatedBits)) {
      return false;
    }
  }
  return true;
}

function buildMedleyExactDominanceReplaySkippedSlotProfile(
  slot: MedleySlotSearch,
  slotIndex: number,
  candidateCount: number,
  candidateKeyCount: number,
  skippedReason: string,
): Record<string, unknown> {
  return {
    slotIndex,
    songIndex: slot.songIndex,
    candidateCount,
    level0DuplicateCardKeyCount: Math.max(0, candidateCount - candidateKeyCount),
    level1Checked: false,
    skippedReason,
    signatureGroupCount: null,
    checkedGroupCount: 0,
    skippedGroupCount: 0,
    skippedCandidateCount: candidateCount,
    dominatedCandidateCount: 0,
    dominancePairCount: 0,
    scoreDominanceCandidatePairCount: 0,
    conflictSubsetCheckCount: 0,
    largestGroupSize: null,
    examples: [],
  };
}

function buildMedleyExactDominanceReplaySlotProfile(
  slot: MedleySlotSearch,
  slotIndex: number,
  candidates: MedleyTeamCandidate[],
  candidateKeyCount: number,
  containingBitsBySlot: MedleyExactDominanceReplayContainingBits[],
): Record<string, unknown> {
  const groups = new Map<number, MedleyExactDominanceReplayCandidateRef[]>();
  candidates.forEach((candidate, candidateIndex) => {
    const signatureHash = getMedleyExactCandidateSignatureHash(slot, candidate);
    const group = groups.get(signatureHash);
    if (group) {
      group.push({ candidate, candidateIndex });
    } else {
      groups.set(signatureHash, [{ candidate, candidateIndex }]);
    }
  });

  let checkedGroupCount = 0;
  let skippedGroupCount = 0;
  let skippedCandidateCount = 0;
  let dominatedCandidateCount = 0;
  let dominancePairCount = 0;
  let scoreDominanceCandidatePairCount = 0;
  let conflictSubsetCheckCount = 0;
  let largestGroupSize = 0;
  const examples: Array<Record<string, unknown>> = [];
  const topGroups = [...groups.entries()]
    .map(([signatureHash, group]) => ({ signatureHash, count: group.length }))
    .sort((left, right) => right.count - left.count || left.signatureHash - right.signatureHash)
    .slice(0, MEDLEY_EXACT_SIGNATURE_CENSUS_TOP_BUCKETS)
    .map((group) => ({
      signatureHash: formatMedleyExactSignatureHash(group.signatureHash),
      count: group.count,
    }));
  const otherSlotQueries = containingBitsBySlot.filter((_, index) => index !== slotIndex);

  for (const [signatureHash, group] of groups.entries()) {
    largestGroupSize = Math.max(largestGroupSize, group.length);
    if (group.length <= 1) {
      checkedGroupCount += 1;
      continue;
    }
    if (group.length > MEDLEY_EXACT_DOMINANCE_REPLAY_MAX_GROUP_SIZE) {
      skippedGroupCount += 1;
      skippedCandidateCount += group.length;
      continue;
    }
    checkedGroupCount += 1;
    const orderedGroup = [...group].sort((left, right) => (
      right.candidate.result.score - left.candidate.result.score
      || right.candidate.result.maxScore - left.candidate.result.maxScore
      || right.candidate.result.minScore - left.candidate.result.minScore
      || left.candidateIndex - right.candidateIndex
    ));
    const dominatedIndices = new Set<number>();
    for (const dominatedRef of orderedGroup) {
      if (dominatedIndices.has(dominatedRef.candidateIndex)) {
        continue;
      }
      for (const dominantRef of orderedGroup) {
        if (dominantRef.candidateIndex === dominatedRef.candidateIndex) {
          continue;
        }
        if (!canMedleyExactCandidateDominateByScore(
          dominantRef.candidate,
          dominatedRef.candidate,
          dominantRef.candidateIndex,
          dominatedRef.candidateIndex,
        )) {
          continue;
        }
        scoreDominanceCandidatePairCount += 1;
        conflictSubsetCheckCount += 1;
        if (!medleyExactCandidateMaterializedConflictFootprintSubset(
          dominantRef.candidate,
          dominatedRef.candidate,
          otherSlotQueries,
        )) {
          continue;
        }
        dominancePairCount += 1;
        if (!dominatedIndices.has(dominatedRef.candidateIndex)) {
          dominatedIndices.add(dominatedRef.candidateIndex);
          dominatedCandidateCount += 1;
          if (examples.length < MEDLEY_EXACT_SIGNATURE_CENSUS_TOP_BUCKETS) {
            examples.push({
              signatureHash: formatMedleyExactSignatureHash(signatureHash),
              dominatedCandidateIndex: dominatedRef.candidateIndex,
              dominantCandidateIndex: dominantRef.candidateIndex,
              dominatedScore: dominatedRef.candidate.result.score,
              dominantScore: dominantRef.candidate.result.score,
              dominatedMaxScore: dominatedRef.candidate.result.maxScore,
              dominantMaxScore: dominantRef.candidate.result.maxScore,
              dominatedCardIds: copyMedleyTeamCandidateCardIds(dominatedRef.candidate),
              dominantCardIds: copyMedleyTeamCandidateCardIds(dominantRef.candidate),
            });
          }
        }
        break;
      }
    }
  }

  return {
    slotIndex,
    songIndex: slot.songIndex,
    candidateCount: candidates.length,
    level0DuplicateCardKeyCount: Math.max(0, candidates.length - candidateKeyCount),
    level1Checked: true,
    skippedReason: null,
    signatureGroupCount: groups.size,
    checkedGroupCount,
    skippedGroupCount,
    skippedCandidateCount,
    dominatedCandidateCount,
    dominancePairCount,
    scoreDominanceCandidatePairCount,
    conflictSubsetCheckCount,
    largestGroupSize,
    maxGroupSize: MEDLEY_EXACT_DOMINANCE_REPLAY_MAX_GROUP_SIZE,
    topGroups,
    examples,
  };
}

function buildMedleyExactDominanceReplayProfile(
  slots: MedleySlotSearch[],
  candidatesBySlot: MedleyTeamCandidate[][],
  candidateKeyCountsBySlot: number[],
): Record<string, unknown> {
  const candidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
  const candidateCountTotal = candidateCountsBySlot.reduce((sum, count) => sum + count, 0);
  const level0DuplicateCardKeyCountTotal = candidatesBySlot.reduce((sum, candidates, slotIndex) => (
    sum + Math.max(0, candidates.length - (candidateKeyCountsBySlot[slotIndex] ?? candidates.length))
  ), 0);
  if (candidateCountTotal > MEDLEY_EXACT_DOMINANCE_REPLAY_MAX_CANDIDATE_TOTAL) {
    const slotProfiles = candidatesBySlot.map((candidates, slotIndex) => (
      buildMedleyExactDominanceReplaySkippedSlotProfile(
        slots[slotIndex],
        slotIndex,
        candidates.length,
        candidateKeyCountsBySlot[slotIndex] ?? candidates.length,
        "candidate-total-limit",
      )
    ));
    return {
      algorithm: "hhwx-materialized-dominance-replay-v1",
      materializedOnly: true,
      coversUnseenFrontier: false,
      candidateRemoval: false,
      levels: ["level0-duplicate-card-key", "level1-same-signature-conflict-subset"],
      level1Checked: false,
      skippedReason: "candidate-total-limit",
      candidateCountTotal,
      candidateLimit: MEDLEY_EXACT_DOMINANCE_REPLAY_MAX_CANDIDATE_TOTAL,
      maxGroupSize: MEDLEY_EXACT_DOMINANCE_REPLAY_MAX_GROUP_SIZE,
      level0DuplicateCardKeyCountTotal,
      dominatedCandidateCountTotal: 0,
      dominancePairCountTotal: 0,
      scoreDominanceCandidatePairCountTotal: 0,
      conflictSubsetCheckCountTotal: 0,
      skippedCandidateCountTotal: candidateCountTotal,
      skippedGroupCountTotal: 0,
      slots: slotProfiles,
    };
  }

  const containingBitsBySlot = candidatesBySlot.map((candidates) => {
    const wordCount = Math.ceil(candidates.length / 32);
    return {
      wordCount,
      containingBitsByCardId: buildMedleyExactContainingCandidateBitsByCardId(candidates, wordCount),
    };
  });
  const slotProfiles = candidatesBySlot.map((candidates, slotIndex) => (
    buildMedleyExactDominanceReplaySlotProfile(
      slots[slotIndex],
      slotIndex,
      candidates,
      candidateKeyCountsBySlot[slotIndex] ?? candidates.length,
      containingBitsBySlot,
    )
  ));
  return {
    algorithm: "hhwx-materialized-dominance-replay-v1",
    materializedOnly: true,
    coversUnseenFrontier: false,
    candidateRemoval: false,
    levels: ["level0-duplicate-card-key", "level1-same-signature-conflict-subset"],
    level1Checked: true,
    skippedReason: null,
    candidateCountTotal,
    candidateLimit: MEDLEY_EXACT_DOMINANCE_REPLAY_MAX_CANDIDATE_TOTAL,
    maxGroupSize: MEDLEY_EXACT_DOMINANCE_REPLAY_MAX_GROUP_SIZE,
    level0DuplicateCardKeyCountTotal,
    dominatedCandidateCountTotal: slotProfiles.reduce((sum, slot) => (
      sum + (typeof slot.dominatedCandidateCount === "number" ? slot.dominatedCandidateCount : 0)
    ), 0),
    dominancePairCountTotal: slotProfiles.reduce((sum, slot) => (
      sum + (typeof slot.dominancePairCount === "number" ? slot.dominancePairCount : 0)
    ), 0),
    scoreDominanceCandidatePairCountTotal: slotProfiles.reduce((sum, slot) => (
      sum + (typeof slot.scoreDominanceCandidatePairCount === "number"
        ? slot.scoreDominanceCandidatePairCount
        : 0)
    ), 0),
    conflictSubsetCheckCountTotal: slotProfiles.reduce((sum, slot) => (
      sum + (typeof slot.conflictSubsetCheckCount === "number" ? slot.conflictSubsetCheckCount : 0)
    ), 0),
    skippedCandidateCountTotal: slotProfiles.reduce((sum, slot) => (
      sum + (typeof slot.skippedCandidateCount === "number" ? slot.skippedCandidateCount : 0)
    ), 0),
    skippedGroupCountTotal: slotProfiles.reduce((sum, slot) => (
      sum + (typeof slot.skippedGroupCount === "number" ? slot.skippedGroupCount : 0)
    ), 0),
    slots: slotProfiles,
  };
}

function buildMedleyExactRawSolverInputCensusSlotProfile(
  slot: MedleySlotSearch,
  slotIndex: number,
  candidates: MedleyTeamCandidate[],
): Record<string, unknown> {
  const candidateCount = candidates.length;
  const wordCount = Math.ceil(candidateCount / 32);
  const uniqueCardIdCountUpper = new Set(slot.searchCards.map((card) => card.cardId)).size;
  let minScore = Number.POSITIVE_INFINITY;
  let maxScore = Number.NEGATIVE_INFINITY;
  let minAverageScore = Number.POSITIVE_INFINITY;
  let maxAverageScore = Number.NEGATIVE_INFINITY;
  let maxMaxScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    minScore = Math.min(minScore, candidate.result.score);
    maxScore = Math.max(maxScore, candidate.result.score);
    minAverageScore = Math.min(minAverageScore, candidate.result.averageScore);
    maxAverageScore = Math.max(maxAverageScore, candidate.result.averageScore);
    maxMaxScore = Math.max(maxMaxScore, candidate.result.maxScore);
  }

  const scoreFieldBytes = candidateCount * 4 * Int32Array.BYTES_PER_ELEMENT;
  const cardIdBytes = candidateCount * MEDLEY_TEAM_SIZE * Int32Array.BYTES_PER_ELEMENT;
  const sourceIndexBytes = candidateCount * Int32Array.BYTES_PER_ELEMENT;
  const rawRowBytes = scoreFieldBytes + cardIdBytes + sourceIndexBytes;
  const containingBitsetBytes = uniqueCardIdCountUpper * wordCount * Uint32Array.BYTES_PER_ELEMENT;
  return {
    slotIndex,
    songIndex: slot.songIndex,
    candidateCount,
    wordCount,
    uniqueCardIdCountUpper,
    uniqueCardIdSource: "slot-search-cards-upper",
    minScore: Number.isFinite(minScore) ? minScore : null,
    maxScore: Number.isFinite(maxScore) ? maxScore : null,
    minAverageScore: Number.isFinite(minAverageScore) ? minAverageScore : null,
    maxAverageScore: Number.isFinite(maxAverageScore) ? maxAverageScore : null,
    maxMaxScore: Number.isFinite(maxMaxScore) ? maxMaxScore : null,
    rawRowBytes,
    rawRowMiB: roundMiB(rawRowBytes),
    scoreFieldBytes,
    cardIdBytes,
    sourceIndexBytes,
    containingBitsetBytes,
    containingBitsetMiB: roundMiB(containingBitsetBytes),
    estimatedBytesPerCandidate: candidateCount > 0
      ? Math.round((rawRowBytes / candidateCount) * 100) / 100
      : 0,
  };
}

function asMedleyExactRawSolverInputNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function buildMedleyExactRawSolverInputCensusProfile(
  slots: MedleySlotSearch[],
  candidatesBySlot: MedleyTeamCandidate[][],
): Record<string, unknown> {
  const slotProfiles = candidatesBySlot.map((candidates, slotIndex) => (
    buildMedleyExactRawSolverInputCensusSlotProfile(slots[slotIndex], slotIndex, candidates)
  ));
  const { slotOrder, shouldUseMiddleFirstJoinOrder } = getMedleyExactCandidateJoinSlotOrder(slots, candidatesBySlot);
  const secondSlotProfile = slotProfiles[slotOrder[1]];
  const thirdSlotProfile = slotProfiles[slotOrder[2]];
  const secondWordCount = asMedleyExactRawSolverInputNumber(secondSlotProfile?.wordCount);
  const thirdWordCount = asMedleyExactRawSolverInputNumber(thirdSlotProfile?.wordCount);
  const finalJoinScratchBytes = (
    secondWordCount
    + thirdWordCount
    + thirdWordCount
  ) * Uint32Array.BYTES_PER_ELEMENT;
  const rawRowBytesTotal = slotProfiles.reduce((sum, slot) => (
    sum + asMedleyExactRawSolverInputNumber(slot.rawRowBytes)
  ), 0);
  const containingBitsetBytesAllSlots = slotProfiles.reduce((sum, slot) => (
    sum + asMedleyExactRawSolverInputNumber(slot.containingBitsetBytes)
  ), 0);
  const finalJoinContainingBitsetBytes = (
    asMedleyExactRawSolverInputNumber(secondSlotProfile?.containingBitsetBytes)
    + asMedleyExactRawSolverInputNumber(thirdSlotProfile?.containingBitsetBytes)
  );
  const finalJoinInputBytes = rawRowBytesTotal + finalJoinContainingBitsetBytes + finalJoinScratchBytes;
  const allSlotsConflictIndexBytes = rawRowBytesTotal + containingBitsetBytesAllSlots + finalJoinScratchBytes;
  return {
    algorithm: "hhwx-raw-solver-input-census-v1",
    materializedOnly: true,
    candidateRemoval: false,
    representation: "typed-array-struct-of-arrays-plus-card-bitsets",
    fields: ["score", "averageScore", "maxScore", "minScore", "cardId0..4", "sourceIndex"],
    slotOrder,
    shouldUseMiddleFirstJoinOrder,
    candidateCountTotal: slotProfiles.reduce((sum, slot) => (
      sum + asMedleyExactRawSolverInputNumber(slot.candidateCount)
    ), 0),
    uniqueCardIdCountUpperTotal: slotProfiles.reduce((sum, slot) => (
      sum + asMedleyExactRawSolverInputNumber(slot.uniqueCardIdCountUpper)
    ), 0),
    rawRowBytesTotal,
    rawRowMiBTotal: roundMiB(rawRowBytesTotal),
    containingBitsetBytesAllSlots,
    containingBitsetMiBAllSlots: roundMiB(containingBitsetBytesAllSlots),
    finalJoinContainingBitsetBytes,
    finalJoinContainingBitsetMiB: roundMiB(finalJoinContainingBitsetBytes),
    finalJoinScratchBytes,
    finalJoinScratchMiB: roundMiB(finalJoinScratchBytes),
    finalJoinInputBytes,
    finalJoinInputMiB: roundMiB(finalJoinInputBytes),
    allSlotsConflictIndexBytes,
    allSlotsConflictIndexMiB: roundMiB(allSlotsConflictIndexBytes),
    slots: slotProfiles,
  };
}

function sumMedleyExactFloat64ArrayBytes(values: Iterable<Float64Array>): number {
  let bytes = 0;
  for (const value of values) {
    bytes += value.byteLength;
  }
  return bytes;
}

function sumMedleyExactNumberArrayEstimateBytes(values: Iterable<readonly number[]>): number {
  let bytes = 0;
  for (const value of values) {
    bytes += value.length * Float64Array.BYTES_PER_ELEMENT;
  }
  return bytes;
}

class MedleyExactBoundedMap<K, V> extends Map<K, V> {
  constructor(private readonly maxEntries: number) {
    super();
  }

  override set(key: K, value: V): this {
    if (this.maxEntries <= 0) {
      return this;
    }
    if (this.has(key)) {
      super.set(key, value);
      return this;
    }
    super.set(key, value);
    while (this.size > this.maxEntries) {
      const oldestKey = this.keys().next().value as K | undefined;
      if (oldestKey === undefined) {
        break;
      }
      this.delete(oldestKey);
    }
    return this;
  }
}

function createMedleyExactBoundedScoreCalculationCache(
  slot: MedleySlotSearch,
  entryLimit: number,
): ScoreCalculationCache {
  const boundedEntryLimit = Math.max(1, Math.trunc(entryLimit));
  const cache = createScoreCalculationCache();
  cache.baseScoresByChart = new WeakMap();
  cache.baseScoresByChart.set(slot.chart, new MedleyExactBoundedMap<string, number>(boundedEntryLimit));
  cache.skillWindowContributionsByChart = new WeakMap();
  cache.skillWindowContributionsByChart.set(
    slot.chart,
    new MedleyExactBoundedMap<string, number[]>(boundedEntryLimit),
  );
  return cache;
}

function createMedleyExactScoreCalculationCacheWithoutSkillWindowContributions(): ScoreCalculationCache {
  const cache = createScoreCalculationCache();
  cache.skillWindowContributionsByChart = undefined;
  return cache;
}

function buildMedleyExactScoreCalculationCacheProfile(
  slot: MedleySlotSearch,
  slotIndex: number,
  scoreCache: ScoreCalculationCache,
  scoreOnlyTeamEvaluationCacheSize: number | null,
): Record<string, unknown> {
  const baseScoresForChart = scoreCache.baseScoresByChart?.get(slot.chart);
  const skillWindowContributionsForChart = scoreCache.skillWindowContributionsByChart?.get(slot.chart);
  const skillMultiplierListBytes = sumMedleyExactFloat64ArrayBytes(scoreCache.skillMultiplierLists.values());
  const innerScoreRateBytes = scoreCache.innerScoreRates
    ? sumMedleyExactFloat64ArrayBytes(scoreCache.innerScoreRates.values())
    : 0;
  const skillWindowContributionEstimateBytes = skillWindowContributionsForChart
    ? sumMedleyExactNumberArrayEstimateBytes(skillWindowContributionsForChart.values())
    : 0;
  return {
    slotIndex,
    songIndex: slot.songIndex,
    scoreOnlyTeamEvaluationCacheSize,
    judgeListCount: scoreCache.judgeLists?.size ?? 0,
    innerScoreRateCount: scoreCache.innerScoreRates?.size ?? 0,
    innerScoreRateMiB: roundMiB(innerScoreRateBytes),
    baseScoreCountForChart: baseScoresForChart?.size ?? 0,
    noFloorBaseScoreRateCount: scoreCache.noFloorBaseScoreRates?.size ?? 0,
    skillMultiplierListCount: scoreCache.skillMultiplierLists.size,
    skillMultiplierListMiB: roundMiB(skillMultiplierListBytes),
    noFloorSkillRateCount: scoreCache.noFloorSkillRates.size,
    skillWindowContributionCountForChart: skillWindowContributionsForChart?.size ?? 0,
    skillWindowContributionEstimateMiB: roundMiB(skillWindowContributionEstimateBytes),
    resolvedSkillCount: scoreCache.resolvedSkills?.size ?? 0,
  };
}

function buildMedleyExactScoreCacheProfile(
  slots: readonly MedleySlotSearch[],
): Record<string, unknown> {
  const slotProfiles = slots.map((slot, slotIndex) => {
    return buildMedleyExactScoreCalculationCacheProfile(
      slot,
      slotIndex,
      slot.scoreCache,
      getMedleyScoreOnlyTeamEvaluationCacheSize(slot),
    );
  });
  return {
    algorithm: "hhwx-score-cache-profile-v1",
    note: "WeakMap-backed chart caches are reported for the active slot chart only.",
    scoreOnlyTeamEvaluationCacheSizeTotal: slotProfiles.reduce((sum, slot) => (
      sum + (typeof slot.scoreOnlyTeamEvaluationCacheSize === "number" ? slot.scoreOnlyTeamEvaluationCacheSize : 0)
    ), 0),
    baseScoreCountForChartTotal: slotProfiles.reduce((sum, slot) => (
      sum + (typeof slot.baseScoreCountForChart === "number" ? slot.baseScoreCountForChart : 0)
    ), 0),
    skillWindowContributionCountForChartTotal: slotProfiles.reduce((sum, slot) => (
      sum + (typeof slot.skillWindowContributionCountForChart === "number"
        ? slot.skillWindowContributionCountForChart
        : 0)
    ), 0),
    skillMultiplierListCountTotal: slotProfiles.reduce((sum, slot) => (
      sum + (typeof slot.skillMultiplierListCount === "number" ? slot.skillMultiplierListCount : 0)
    ), 0),
    innerScoreRateMiBTotal: roundMiB(slotProfiles.reduce((sum, slot) => (
      sum + (typeof slot.innerScoreRateMiB === "number" ? slot.innerScoreRateMiB * BYTES_PER_MIB : 0)
    ), 0)),
    skillMultiplierListMiBTotal: roundMiB(slotProfiles.reduce((sum, slot) => (
      sum + (typeof slot.skillMultiplierListMiB === "number" ? slot.skillMultiplierListMiB * BYTES_PER_MIB : 0)
    ), 0)),
    skillWindowContributionEstimateMiBTotal: roundMiB(slotProfiles.reduce((sum, slot) => (
      sum + (typeof slot.skillWindowContributionEstimateMiB === "number"
        ? slot.skillWindowContributionEstimateMiB * BYTES_PER_MIB
        : 0)
    ), 0)),
    slots: slotProfiles,
  };
}

function createMedleyExactRawCandidateMirrorSlot(capacity = 16): MedleyExactRawCandidateMirrorSlot {
  return {
    score: new Int32Array(capacity),
    averageScore: new Int32Array(capacity),
    maxScore: new Int32Array(capacity),
    minScore: new Int32Array(capacity),
    cardIds: new Int32Array(capacity * MEDLEY_TEAM_SIZE),
    length: 0,
    mismatchCount: 0,
    capacity,
  };
}

function createMedleyExactRawCandidateMirror(slotCount: number): MedleyExactRawCandidateMirror {
  return {
    slots: Array.from({ length: slotCount }, () => createMedleyExactRawCandidateMirrorSlot()),
    rebuildCount: 0,
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

  const nextCardIds = new Int32Array(nextCapacity * MEDLEY_TEAM_SIZE);
  nextCardIds.set(slot.cardIds.subarray(0, slot.length * MEDLEY_TEAM_SIZE));
  slot.cardIds = nextCardIds;

  slot.capacity = nextCapacity;
}

function appendMedleyExactRawCandidateMirrorSlot(
  slot: MedleyExactRawCandidateMirrorSlot,
  candidate: MedleyTeamCandidate,
): void {
  const index = slot.length;
  ensureMedleyExactRawCandidateMirrorSlotCapacity(slot, index + 1);
  slot.score[index] = candidate.result.score;
  slot.averageScore[index] = candidate.result.averageScore;
  slot.maxScore[index] = candidate.result.maxScore;
  slot.minScore[index] = candidate.result.minScore;

  const baseCardIndex = index * MEDLEY_TEAM_SIZE;
  for (let cardIndex = 0; cardIndex < MEDLEY_TEAM_SIZE; cardIndex += 1) {
    slot.cardIds[baseCardIndex + cardIndex] = getMedleyTeamCandidateCardIdAt(candidate, cardIndex) ?? -1;
  }

  if (
    slot.score[index] !== candidate.result.score
    || slot.averageScore[index] !== candidate.result.averageScore
    || slot.maxScore[index] !== candidate.result.maxScore
    || slot.minScore[index] !== candidate.result.minScore
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

function rebuildMedleyExactRawCandidateMirror(
  mirror: MedleyExactRawCandidateMirror,
  candidatesBySlot: readonly MedleyTeamCandidate[][],
): void {
  mirror.rebuildCount += 1;
  candidatesBySlot.forEach((candidates, slotIndex) => {
    const slot = mirror.slots[slotIndex];
    if (!slot) {
      return;
    }
    slot.length = 0;
    slot.mismatchCount = 0;
    ensureMedleyExactRawCandidateMirrorSlotCapacity(slot, candidates.length);
    for (const candidate of candidates) {
      appendMedleyExactRawCandidateMirrorSlot(slot, candidate);
    }
  });
}

function getMedleyExactRawCandidateMirrorProfile(mirror: MedleyExactRawCandidateMirror): Record<string, unknown> {
  const lengths = mirror.slots.map((slot) => slot.length);
  const capacities = mirror.slots.map((slot) => slot.capacity);
  const mismatchCounts = mirror.slots.map((slot) => slot.mismatchCount);
  const retainedBytes = mirror.slots.reduce((sum, slot) => (
    sum
    + slot.score.byteLength
    + slot.averageScore.byteLength
    + slot.maxScore.byteLength
    + slot.minScore.byteLength
    + slot.cardIds.byteLength
  ), 0);
  return {
    enabled: true,
    representation: "typed-array-struct-of-arrays",
    fields: ["score", "averageScore", "maxScore", "minScore", "cardId0..4"],
    rebuildCount: mirror.rebuildCount,
    lengths,
    capacities,
    countTotal: lengths.reduce((sum, count) => sum + count, 0),
    capacityTotal: capacities.reduce((sum, count) => sum + count, 0),
    mismatchCounts,
    mismatchCountTotal: mismatchCounts.reduce((sum, count) => sum + count, 0),
    retainedMiB: roundMiB(retainedBytes),
  };
}

function buildMedleyExactRawJoinParitySlot(
  candidates: readonly MedleyTeamCandidate[],
): MedleyExactRawJoinParitySlot {
  const scores = new Int32Array(candidates.length);
  const cardIds = new Int32Array(candidates.length * MEDLEY_TEAM_SIZE);
  candidates.forEach((candidate, candidateIndex) => {
    scores[candidateIndex] = candidate.result.score;
    const baseCardIndex = candidateIndex * MEDLEY_TEAM_SIZE;
    for (let cardIndex = 0; cardIndex < MEDLEY_TEAM_SIZE; cardIndex += 1) {
      cardIds[baseCardIndex + cardIndex] = getMedleyTeamCandidateCardIdAt(candidate, cardIndex) ?? -1;
    }
  });
  return { scores, cardIds, length: candidates.length };
}

function buildMedleyExactRawJoinContainingBitsByCardId(
  slot: MedleyExactRawJoinParitySlot,
  wordCount: number,
): Map<number, Uint32Array> {
  const containingBitsByCardId = new Map<number, Uint32Array>();
  for (let candidateIndex = 0; candidateIndex < slot.length; candidateIndex += 1) {
    const wordIndex = candidateIndex >> 5;
    const bit = 1 << (candidateIndex & 31);
    const baseCardIndex = candidateIndex * MEDLEY_TEAM_SIZE;
    for (let cardIndex = 0; cardIndex < MEDLEY_TEAM_SIZE; cardIndex += 1) {
      const cardId = slot.cardIds[baseCardIndex + cardIndex];
      if (cardId < 0) {
        continue;
      }
      let containingBits = containingBitsByCardId.get(cardId);
      if (!containingBits) {
        containingBits = new Uint32Array(wordCount);
        containingBitsByCardId.set(cardId, containingBits);
      }
      containingBits[wordIndex] |= bit;
    }
  }
  return containingBitsByCardId;
}

function writeMedleyExactRawJoinForbiddenBits(
  slot: MedleyExactRawJoinParitySlot,
  candidateIndex: number,
  containingBitsByCardId: Map<number, Uint32Array>,
  wordCount: number,
  forbiddenBits: Uint32Array,
): Uint32Array {
  forbiddenBits.fill(0);
  const baseCardIndex = candidateIndex * MEDLEY_TEAM_SIZE;
  for (let cardIndex = 0; cardIndex < MEDLEY_TEAM_SIZE; cardIndex += 1) {
    const cardId = slot.cardIds[baseCardIndex + cardIndex];
    if (cardId < 0) {
      continue;
    }
    const containingBits = containingBitsByCardId.get(cardId);
    if (!containingBits) {
      continue;
    }
    for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
      forbiddenBits[wordIndex] |= containingBits[wordIndex];
    }
  }
  return forbiddenBits;
}

function findBestAvailableMedleyExactRawJoinIndexByBits(
  slot: MedleyExactRawJoinParitySlot,
  wordCount: number,
  primaryForbiddenBits: Uint32Array,
  secondaryForbiddenBits?: Uint32Array,
): number {
  if (slot.length === 0 || wordCount === 0) {
    return -1;
  }
  const lastWordIndex = wordCount - 1;
  const lastWordRemainder = slot.length & 31;
  const lastWordMask = lastWordRemainder === 0
    ? 0xffffffff
    : 0xffffffff >>> (32 - lastWordRemainder);
  for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
    let availableBits = secondaryForbiddenBits
      ? (~(primaryForbiddenBits[wordIndex] | secondaryForbiddenBits[wordIndex])) >>> 0
      : (~primaryForbiddenBits[wordIndex]) >>> 0;
    if (wordIndex === lastWordIndex) {
      availableBits &= lastWordMask;
    }
    if (availableBits !== 0) {
      const lowestAvailableBit = availableBits & -availableBits;
      return wordIndex * 32 + (31 - Math.clz32(lowestAvailableBit));
    }
  }
  return -1;
}

function runMedleyExactRawIndexFinalJoinParity(
  candidatesBySlot: readonly MedleyTeamCandidate[][],
  slotOrder: readonly number[],
  objectBestScore: number | null,
  incumbentScore: number,
  deadlineAt: number,
  isPastDeadline: () => boolean,
): Record<string, unknown> {
  const startedAt = performance.now();
  const candidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
  const candidateCountTotal = candidateCountsBySlot.reduce((sum, count) => sum + count, 0);
  if (candidateCountTotal > MEDLEY_EXACT_RAW_JOIN_PARITY_MAX_CANDIDATE_TOTAL) {
    return {
      enabled: true,
      skipped: true,
      skipReason: "candidate-total-limit",
      candidateCountTotal,
      candidateCountsBySlot,
      limit: MEDLEY_EXACT_RAW_JOIN_PARITY_MAX_CANDIDATE_TOTAL,
    };
  }
  if (Number.isFinite(deadlineAt) && deadlineAt - performance.now() < MEDLEY_EXACT_RAW_JOIN_PARITY_MIN_REMAINING_MS) {
    return {
      enabled: true,
      skipped: true,
      skipReason: "remaining-time",
      candidateCountTotal,
      candidateCountsBySlot,
      minRemainingMs: MEDLEY_EXACT_RAW_JOIN_PARITY_MIN_REMAINING_MS,
    };
  }

  const rawSlots = candidatesBySlot.map(buildMedleyExactRawJoinParitySlot);
  const firstSlot = rawSlots[slotOrder[0]];
  const secondSlot = rawSlots[slotOrder[1]];
  const thirdSlot = rawSlots[slotOrder[2]];
  if (!firstSlot || !secondSlot || !thirdSlot) {
    return {
      enabled: true,
      skipped: true,
      skipReason: "invalid-slot-order",
      candidateCountTotal,
      candidateCountsBySlot,
      slotOrder: [...slotOrder],
    };
  }

  const secondWordCount = Math.ceil(secondSlot.length / 32);
  const thirdWordCount = Math.ceil(thirdSlot.length / 32);
  const containingSecondBitsByCardId = buildMedleyExactRawJoinContainingBitsByCardId(secondSlot, secondWordCount);
  const containingThirdBitsByCardId = buildMedleyExactRawJoinContainingBitsByCardId(thirdSlot, thirdWordCount);
  const firstForbiddenSecondBits = new Uint32Array(secondWordCount);
  const firstForbiddenThirdBits = new Uint32Array(thirdWordCount);
  const secondForbiddenThirdBits = new Uint32Array(thirdWordCount);
  const bestSecondScore = secondSlot.scores[0] ?? Number.NEGATIVE_INFINITY;
  const bestThirdScore = thirdSlot.scores[0] ?? Number.NEGATIVE_INFINITY;
  let rawBestScore = Number.NEGATIVE_INFINITY;
  let currentScoreCutoff = incumbentScore + 1;
  let pairCount = 0;
  let thirdQueryCount = 0;
  let nextDeadlineCheckPairCount = 4096;
  const bestIndices = [-1, -1, -1];
  const secondLastWordIndex = secondWordCount - 1;
  const secondLastWordRemainder = secondSlot.length & 31;
  const secondLastWordMask = secondLastWordRemainder === 0
    ? 0xffffffff
    : 0xffffffff >>> (32 - secondLastWordRemainder);

  for (let firstIndex = 0; firstIndex < firstSlot.length; firstIndex += 1) {
    const firstScore = firstSlot.scores[firstIndex];
    if (firstScore + bestSecondScore + bestThirdScore < currentScoreCutoff) {
      break;
    }
    writeMedleyExactRawJoinForbiddenBits(
      firstSlot,
      firstIndex,
      containingSecondBitsByCardId,
      secondWordCount,
      firstForbiddenSecondBits,
    );
    const bestSecondForFirstIndex = findBestAvailableMedleyExactRawJoinIndexByBits(
      secondSlot,
      secondWordCount,
      firstForbiddenSecondBits,
    );
    if (bestSecondForFirstIndex < 0) {
      continue;
    }
    writeMedleyExactRawJoinForbiddenBits(
      firstSlot,
      firstIndex,
      containingThirdBitsByCardId,
      thirdWordCount,
      firstForbiddenThirdBits,
    );
    const bestThirdForFirstIndex = findBestAvailableMedleyExactRawJoinIndexByBits(
      thirdSlot,
      thirdWordCount,
      firstForbiddenThirdBits,
    );
    if (bestThirdForFirstIndex < 0) {
      continue;
    }
    const bestThirdForFirstScore = thirdSlot.scores[bestThirdForFirstIndex];
    if (firstScore + secondSlot.scores[bestSecondForFirstIndex] + bestThirdForFirstScore < currentScoreCutoff) {
      continue;
    }
    if (firstScore + bestSecondScore + bestThirdForFirstScore < currentScoreCutoff) {
      continue;
    }

    let shouldStopSecondLoop = false;
    for (let wordIndex = 0; wordIndex < secondWordCount; wordIndex += 1) {
      const wordTopSecondScore = secondSlot.scores[wordIndex * 32] ?? Number.NEGATIVE_INFINITY;
      if (firstScore + wordTopSecondScore + bestThirdForFirstScore < currentScoreCutoff) {
        break;
      }
      let availableSecondBits = (~firstForbiddenSecondBits[wordIndex]) >>> 0;
      if (wordIndex === secondLastWordIndex) {
        availableSecondBits &= secondLastWordMask;
      }
      while (availableSecondBits !== 0) {
        const lowestAvailableBit = availableSecondBits & -availableSecondBits;
        availableSecondBits ^= lowestAvailableBit;
        const secondIndex = wordIndex * 32 + (31 - Math.clz32(lowestAvailableBit));
        const secondScore = secondSlot.scores[secondIndex];
        const firstSecondScore = firstScore + secondScore;
        pairCount += 1;
        if (pairCount >= nextDeadlineCheckPairCount) {
          if (performance.now() >= deadlineAt || isPastDeadline()) {
            return {
              enabled: true,
              skipped: true,
              skipReason: "deadline",
              candidateCountTotal,
              candidateCountsBySlot,
              slotOrder: [...slotOrder],
              pairCount,
              thirdQueryCount,
              elapsedMs: Math.round(performance.now() - startedAt),
            };
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
        writeMedleyExactRawJoinForbiddenBits(
          secondSlot,
          secondIndex,
          containingThirdBitsByCardId,
          thirdWordCount,
          secondForbiddenThirdBits,
        );
        thirdQueryCount += 1;
        const thirdIndex = findBestAvailableMedleyExactRawJoinIndexByBits(
          thirdSlot,
          thirdWordCount,
          firstForbiddenThirdBits,
          secondForbiddenThirdBits,
        );
        if (thirdIndex < 0) {
          continue;
        }
        const score = firstSecondScore + thirdSlot.scores[thirdIndex];
        if (score < currentScoreCutoff) {
          continue;
        }
        rawBestScore = score;
        currentScoreCutoff = score + 1;
        bestIndices[0] = firstIndex;
        bestIndices[1] = secondIndex;
        bestIndices[2] = thirdIndex;
      }
      if (shouldStopSecondLoop) {
        break;
      }
    }
  }

  const normalizedRawBestScore = Number.isFinite(rawBestScore) ? rawBestScore : null;
  return {
    enabled: true,
    skipped: false,
    candidateCountTotal,
    candidateCountsBySlot,
    slotOrder: [...slotOrder],
    rawBestScore: normalizedRawBestScore,
    objectBestScore,
    matched: normalizedRawBestScore === objectBestScore,
    bestIndices,
    pairCount,
    thirdQueryCount,
    elapsedMs: Math.round(performance.now() - startedAt),
    retainedMiB: roundMiB(
      rawSlots.reduce((sum, slot) => sum + slot.scores.byteLength + slot.cardIds.byteLength, 0),
    ),
  };
}

function getMedleyExactCandidateJoinSlotOrder(
  slots: readonly MedleySlotSearch[],
  candidatesBySlot: readonly MedleyTeamCandidate[][],
): MedleyExactCandidateJoinSlotOrder {
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
  const shouldUseMiddleFirstJoinOrder = (
    smallestCandidateCount >= 5_000
    && middleCandidateCount >= smallestCandidateCount * 2
    && largestCandidateCount >= middleCandidateCount * 2
  );
  return {
    shouldUseMiddleFirstJoinOrder,
    slotOrder: shouldUseMiddleFirstJoinOrder
      ? [candidateCountSlotOrder[1], candidateCountSlotOrder[0], candidateCountSlotOrder[2]]
      : candidateCountSlotOrder,
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
  useSkillContextUpper = true,
  disableScoreCalculationCache = false,
): { aborted: boolean; score: number | null } {
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
  let bestScore = Number.NEGATIVE_INFINITY;
  let visitedNodeCount = 0;
  let aborted = false;

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
      return;
    }
    if ((visitedNodeCount & 511) === 0) {
      const now = performance.now();
      if (localDeadlineAt !== null && now >= localDeadlineAt) {
        aborted = true;
        return;
      }
      if (shouldAbortLocalSearch?.()) {
        aborted = true;
        return;
      }
      if (now >= deadlineAt || isPastDeadline()) {
        stats.isExhaustive = false;
        stats.timedOut = true;
        stats.searchMode = "bounded";
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
      const score = evaluateMedleyScoreOnlyTeamScore({
        cards: selectedCards,
        input: searchSlot.input,
        chart: searchSlot.chart,
        configuration: searchSlot.configuration,
        server,
        perfectRate,
        scoreCache: disableScoreCalculationCache ? undefined : searchSlot.scoreCache,
        comboOptions: searchSlot.comboOptions,
        pruningThresholdResult: createMedleyExactCandidateSlotThresholdResult(scoreCutoff),
      });
      stats.evaluatedTeamCount += 1;
      if (score === null || score < scoreCutoff) {
        return;
      }
      bestScore = score;
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
  return { aborted, score: Number.isFinite(bestScore) ? bestScore : null };
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
  scoreOnlyCalculationCacheEntryLimit: number | null = null,
  disableSkillWindowContributionCache = false,
  disableScoreOnlyCalculationCache = false,
  disableScoreOnlyCache = false,
  disableCandidateCardsRetention = true,
  enableCompactScoreOnlyCache = false,
  disableGlobalComplementUpperCache = false,
  enableCompactGlobalComplementUpperCache = true,
  enableThinCandidateResultRetention = false,
  enablePrefixUpperReplay = false,
  enablePrefixHardUpperReplay = false,
  enablePrefixOtherUpperSourceReplay = false,
  enablePrefixCapacityBatchReplay = false,
  enablePrefixCapacityLevel3Replay = false,
  enableCapacitySourceLeafPruning = false,
  prefixOtherUpperSourceReplayMaxChecks = MEDLEY_EXACT_PREFIX_OTHER_UPPER_SOURCE_REPLAY_DEFAULT_MAX_CHECKS,
  prefixOtherUpperSourceReplayMaxMargin = MEDLEY_EXACT_PREFIX_OTHER_UPPER_SOURCE_REPLAY_DEFAULT_MAX_MARGIN,
): MedleyExactSlotCandidateGenerator {
  // The generator is ordered by optimistic slot upper bound. Exhaustion proves that no unseen
  // slot candidate remains above the active cutoff; budget/deadline aborts are reported to the
  // caller so exact status is not inferred from a truncated prefix.
  const heap: MedleyExactSlotCandidateSearchNode[] = [];
  const slotUpperHeap: MedleyExactSlotCandidateSearchNode[] = [];
  const bannedCardIds = new Set<number>();
  const globalComplementUpperCache: MedleyExactNestedNumberCache = new Map();
  const compactGlobalComplementUpperCache: MedleyExactCompactNestedNumberCache | null = (
    enableCompactGlobalComplementUpperCache ? new Map() : null
  );
  const globalPairComplementUpperCache: MedleyExactNestedNumberCache = new Map();
  const pairUpperQueryCache = new Map<string, MedleyExactCandidatePairUpperQuery>();
  const scoreOnlyCalculationCache = (
    disableScoreOnlyCalculationCache
      ? undefined
      : disableSkillWindowContributionCache
        ? createMedleyExactScoreCalculationCacheWithoutSkillWindowContributions()
        : scoreOnlyCalculationCacheEntryLimit !== null
          && Number.isFinite(scoreOnlyCalculationCacheEntryLimit)
          && scoreOnlyCalculationCacheEntryLimit > 0
          ? createMedleyExactBoundedScoreCalculationCache(slot, scoreOnlyCalculationCacheEntryLimit)
          : undefined
  );
  let aborted = false;
  let poppedNodes = 0;
  let heapKeyMode: "slot" | "global" = "slot";
  let heapGlobalKeySignature: string | null = null;
  let maxPruningScoreCutoff = Number.NEGATIVE_INFINITY;
  const finitePrefixOtherUpperSourceReplayMaxChecks = (
    Number.isFinite(prefixOtherUpperSourceReplayMaxChecks)
    && prefixOtherUpperSourceReplayMaxChecks > 0
      ? Math.trunc(prefixOtherUpperSourceReplayMaxChecks)
      : MEDLEY_EXACT_PREFIX_OTHER_UPPER_SOURCE_REPLAY_DEFAULT_MAX_CHECKS
  );
  const finitePrefixOtherUpperSourceReplayMaxMargin = (
    Number.isFinite(prefixOtherUpperSourceReplayMaxMargin)
    && prefixOtherUpperSourceReplayMaxMargin >= 0
      ? prefixOtherUpperSourceReplayMaxMargin
      : MEDLEY_EXACT_PREFIX_OTHER_UPPER_SOURCE_REPLAY_DEFAULT_MAX_MARGIN
  );
  const prefixUpperReplayProfile = (
    enablePrefixUpperReplay
    || enablePrefixHardUpperReplay
    || enablePrefixOtherUpperSourceReplay
    || enablePrefixCapacityBatchReplay
    || enablePrefixCapacityLevel3Replay
    || enableCapacitySourceLeafPruning
  )
    ? createMedleyExactPrefixUpperReplayProfile(
      slot,
      enablePrefixHardUpperReplay,
      (
        enablePrefixOtherUpperSourceReplay
        || enablePrefixCapacityBatchReplay
        || enablePrefixCapacityLevel3Replay
        || enableCapacitySourceLeafPruning
      ),
      finitePrefixOtherUpperSourceReplayMaxChecks,
      finitePrefixOtherUpperSourceReplayMaxMargin,
    )
    : null;
  type CreateSearchNodeInput = {
    key: number;
    slotUpperBound: number;
    selectedCardIndices: number[];
    startIndex: number;
    usedCharacterMaskLow: number;
    usedCharacterMaskHigh: number;
    selectedPower: number;
    candidate: MedleyTeamCandidate | null;
    prefixCapacityBatchReplayDecision?: MedleyExactPrefixOtherUpperSourceReplayDecision | null;
  };
  const createSearchNode = (input: CreateSearchNodeInput): MedleyExactSlotCandidateSearchNode => {
    const node: MedleyExactSlotCandidateSearchNode = {
      key: input.key,
      slotUpperBound: input.slotUpperBound,
      activeInSlotUpperHeap: false,
      selectedCardCount: input.selectedCardIndices.length,
      selectedCardIndex0: input.selectedCardIndices[0] ?? -1,
      selectedCardIndex1: input.selectedCardIndices[1] ?? -1,
      selectedCardIndex2: input.selectedCardIndices[2] ?? -1,
      selectedCardIndex3: input.selectedCardIndices[3] ?? -1,
      selectedCardIndex4: input.selectedCardIndices[4] ?? -1,
      startIndex: input.startIndex,
      usedCharacterMaskLow: input.usedCharacterMaskLow,
      usedCharacterMaskHigh: input.usedCharacterMaskHigh,
      selectedPower: input.selectedPower,
      candidate: input.candidate,
    };
    if (input.prefixCapacityBatchReplayDecision?.wouldSkip === true) {
      node.prefixCapacityBatchReplayWouldSkip = true;
      node.prefixCapacityBatchReplayLevel = input.prefixCapacityBatchReplayDecision.level;
      node.prefixCapacityBatchReplayPrefixUpper = input.prefixCapacityBatchReplayDecision.prefixUpper;
      node.prefixCapacityBatchReplayBestSafeOtherUpper = (
        input.prefixCapacityBatchReplayDecision.bestSafeOtherUpper
      );
      node.prefixCapacityBatchReplayProofCutoffScore = input.prefixCapacityBatchReplayDecision.proofCutoffScore;
    }
    return node;
  };
  const getSelectedCardIndicesForNode = (node: MedleyExactSlotCandidateSearchNode): number[] => {
    switch (node.selectedCardCount) {
      case 0:
        return [];
      case 1:
        return [node.selectedCardIndex0];
      case 2:
        return [node.selectedCardIndex0, node.selectedCardIndex1];
      case 3:
        return [node.selectedCardIndex0, node.selectedCardIndex1, node.selectedCardIndex2];
      case 4:
        return [node.selectedCardIndex0, node.selectedCardIndex1, node.selectedCardIndex2, node.selectedCardIndex3];
      default:
        return [
          node.selectedCardIndex0,
          node.selectedCardIndex1,
          node.selectedCardIndex2,
          node.selectedCardIndex3,
          node.selectedCardIndex4,
        ];
    }
  };
  const getSelectedCardsForNode = (node: MedleyExactSlotCandidateSearchNode): SearchCard[] => {
    const selectedCardIndices = getSelectedCardIndicesForNode(node);
    return selectedCardIndices.map((cardIndex) => slot.searchCards[cardIndex]!);
  };
  const getPrefixCapacityBatchReplayDecisionForNode = (
    node: MedleyExactSlotCandidateSearchNode,
  ): MedleyExactPrefixOtherUpperSourceReplayDecision | null => {
    if (
      node.prefixCapacityBatchReplayWouldSkip !== true
      || node.prefixCapacityBatchReplayPrefixUpper === undefined
      || node.prefixCapacityBatchReplayBestSafeOtherUpper === undefined
      || node.prefixCapacityBatchReplayProofCutoffScore === undefined
    ) {
      return null;
    }
    return {
      wouldSkip: true,
      level: node.prefixCapacityBatchReplayLevel ?? MEDLEY_TEAM_SIZE - 1,
      prefixUpper: node.prefixCapacityBatchReplayPrefixUpper,
      bestSafeOtherUpper: node.prefixCapacityBatchReplayBestSafeOtherUpper,
      proofCutoffScore: node.prefixCapacityBatchReplayProofCutoffScore,
    };
  };
  const getRelaxedImpliedCompletionCount = (
    selectedCardCount: number,
    nextStartIndex: number,
  ): number => estimateRelaxedCombinationCount(
    slot.searchCards.length - nextStartIndex,
    MEDLEY_TEAM_SIZE - selectedCardCount,
  );
  const recordPrefixSlotUpperReplay = (
    selectedCardCount: number,
    nextStartIndex: number,
    slotUpperBound: number,
    scoreCutoff: number,
  ): void => {
    if (!prefixUpperReplayProfile) {
      return;
    }
    const levelProfile = getMedleyExactPrefixReplayLevel(prefixUpperReplayProfile, selectedCardCount);
    if (!levelProfile) {
      return;
    }
    const impliedCompletionCount = getRelaxedImpliedCompletionCount(selectedCardCount, nextStartIndex);
    levelProfile.checkedPrefixCount += 1;
    levelProfile.relaxedImpliedCompletionCount = addCappedCount(
      levelProfile.relaxedImpliedCompletionCount,
      impliedCompletionCount,
    );
    if (Number.isFinite(slotUpperBound)) {
      levelProfile.finiteSlotUpperCount += 1;
      const margin = slotUpperBound - scoreCutoff;
      levelProfile.slotUpperMarginMin = minNullableNumber(levelProfile.slotUpperMarginMin, margin);
      levelProfile.slotUpperMarginMax = maxNullableNumber(levelProfile.slotUpperMarginMax, margin);
      recordMedleyExactPrefixMargin(
        levelProfile.slotUpperMarginPrefixBuckets,
        levelProfile.slotUpperMarginImpliedCompletionBuckets,
        margin,
        impliedCompletionCount,
      );
    }
    if (Number.isFinite(slotUpperBound) && slotUpperBound >= scoreCutoff) {
      levelProfile.slotUpperPassCount += 1;
    } else {
      levelProfile.slotUpperRejectedCount += 1;
    }
  };
  const recordPrefixHardUpperReplay = (
    selectedCardCount: number,
    nextStartIndex: number,
    hardUpperBound: number | null,
    proofCutoffScore: number,
  ): void => {
    if (!prefixUpperReplayProfile || !enablePrefixHardUpperReplay) {
      return;
    }
    const levelProfile = getMedleyExactPrefixReplayLevel(prefixUpperReplayProfile, selectedCardCount);
    if (!levelProfile) {
      return;
    }
    levelProfile.hardUpperCheckedCount += 1;
    const impliedCompletionCount = getRelaxedImpliedCompletionCount(selectedCardCount, nextStartIndex);
    if (hardUpperBound === null || !Number.isFinite(hardUpperBound) || !Number.isFinite(proofCutoffScore)) {
      levelProfile.hardUpperUnknownCount += 1;
      return;
    }
    levelProfile.hardUpperFiniteCount += 1;
    const margin = hardUpperBound - proofCutoffScore;
    levelProfile.hardUpperMarginMin = minNullableNumber(levelProfile.hardUpperMarginMin, margin);
    levelProfile.hardUpperMarginMax = maxNullableNumber(levelProfile.hardUpperMarginMax, margin);
    recordMedleyExactPrefixMargin(
      levelProfile.hardUpperMarginPrefixBuckets,
      levelProfile.hardUpperMarginImpliedCompletionBuckets,
      margin,
      impliedCompletionCount,
    );
    if (hardUpperBound < proofCutoffScore) {
      levelProfile.hardUpperSkipablePrefixCount += 1;
      levelProfile.hardUpperSkipableImpliedCompletionCount = addCappedCount(
        levelProfile.hardUpperSkipableImpliedCompletionCount,
        impliedCompletionCount,
      );
    } else {
      levelProfile.hardUpperRetainedPrefixCount += 1;
    }
  };
  const recordPrefixLeafProofLedger = (
    selectedCardCount: number,
    nextStartIndex: number,
    prefixUpperBound: number,
    totalUpperBound: number,
    proofCutoffScore: number,
  ): void => {
    if (!prefixUpperReplayProfile || selectedCardCount !== MEDLEY_TEAM_SIZE) {
      return;
    }
    const levelProfile = getMedleyExactPrefixReplayLevel(prefixUpperReplayProfile, selectedCardCount);
    if (!levelProfile) {
      return;
    }
    levelProfile.leafProofLedgerCheckedCount += 1;
    const impliedCompletionCount = getRelaxedImpliedCompletionCount(selectedCardCount, nextStartIndex);
    if (
      !Number.isFinite(prefixUpperBound)
      || !Number.isFinite(totalUpperBound)
      || !Number.isFinite(proofCutoffScore)
    ) {
      levelProfile.leafProofLedgerUnknownCount += 1;
      return;
    }
    levelProfile.leafProofLedgerFiniteCount += 1;
    const margin = totalUpperBound - proofCutoffScore;
    levelProfile.leafProofLedgerMarginMin = minNullableNumber(levelProfile.leafProofLedgerMarginMin, margin);
    levelProfile.leafProofLedgerMarginMax = maxNullableNumber(levelProfile.leafProofLedgerMarginMax, margin);
    recordMedleyExactPrefixMargin(
      levelProfile.leafProofLedgerMarginPrefixBuckets,
      levelProfile.leafProofLedgerMarginImpliedCompletionBuckets,
      margin,
      impliedCompletionCount,
    );
    if (totalUpperBound < proofCutoffScore) {
      levelProfile.leafProofLedgerSkipCount += 1;
      levelProfile.leafProofLedgerSkipImpliedCompletionCount = addCappedCount(
        levelProfile.leafProofLedgerSkipImpliedCompletionCount,
        impliedCompletionCount,
      );
      if (levelProfile.leafProofLedgerSkipSamples.length < MEDLEY_EXACT_PREFIX_PROOF_LEDGER_SAMPLE_LIMIT) {
        levelProfile.leafProofLedgerSkipSamples.push({
          songIndex: slot.songIndex,
          level: selectedCardCount,
          impliedCompletionCount,
          incumbent: proofCutoffScore,
          prefixUpper: prefixUpperBound,
          otherSlotUpper: totalUpperBound - prefixUpperBound,
          totalUpper: totalUpperBound,
          margin,
        });
      }
    } else {
      levelProfile.leafProofLedgerRetainedCount += 1;
    }
  };
  const recordPrefixCandidateEvaluation = (): void => {
    if (!prefixUpperReplayProfile) {
      return;
    }
    const levelProfile = getMedleyExactPrefixReplayLevel(prefixUpperReplayProfile, MEDLEY_TEAM_SIZE);
    if (levelProfile) {
      levelProfile.candidateEvaluationCount += 1;
    }
  };
  const recordPrefixMaterializedCandidate = (): void => {
    if (!prefixUpperReplayProfile) {
      return;
    }
    const levelProfile = getMedleyExactPrefixReplayLevel(prefixUpperReplayProfile, MEDLEY_TEAM_SIZE);
    if (levelProfile) {
      levelProfile.materializedCandidateCount += 1;
    }
  };
  const pushHeapNode = (node: MedleyExactSlotCandidateSearchNode): void => {
    pushMedleyExactSlotNode(heap, node);
    if (heapKeyMode === "global") {
      node.activeInSlotUpperHeap = true;
      pushMedleyExactSlotUpperSearchNode(slotUpperHeap, node);
    }
  };
  const peekMaxHeapSlotUpperBound = (): number => {
    while (slotUpperHeap.length > 0 && slotUpperHeap[0].activeInSlotUpperHeap !== true) {
      popMedleyExactSlotUpperSearchNode(slotUpperHeap);
    }
    return slotUpperHeap[0]?.slotUpperBound ?? Number.NEGATIVE_INFINITY;
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
      selectedCardIndices: [],
      startIndex: 0,
      usedCharacterMaskLow: 0,
      usedCharacterMaskHigh: 0,
      selectedPower: 0,
      candidate: null,
    }));
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
    const cardKey = buildMedleyExactCardIdKey(selectedCardIds);
    const cachePrefixKey = [
      leftSlotIndex,
      leftCandidates.length,
      rightSlotIndex,
      rightCandidates.length,
      finitePairUnseenUpperBound,
      minimumRelevantScore,
    ].join(":");
    const cached = getMedleyExactNestedNumberCache(globalPairComplementUpperCache, cachePrefixKey, cardKey);
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
    setMedleyExactNestedNumberCache(globalPairComplementUpperCache, cachePrefixKey, cardKey, complementUpperBound);
    return complementUpperBound;
  };
  const estimateGeneratedPairOnlyComplementUpperBound = (
    selectedCardIds: number[],
    globalPruning: MedleyExactSlotCandidateGlobalPruning,
    minimumRelevantScore: number,
  ): number => {
    if (!globalPruning.candidatesBySlot) {
      return Number.NEGATIVE_INFINITY;
    }
    const [leftSlotIndex, rightSlotIndex] = globalPruning.remainingSlotIndices;
    const leftCandidates = globalPruning.candidatesBySlot[leftSlotIndex] ?? [];
    const rightCandidates = globalPruning.candidatesBySlot[rightSlotIndex] ?? [];
    const pairUpperQueryKey = [
      "generated-only",
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
      );
      pairUpperQueryCache.set(pairUpperQueryKey, pairUpperQuery);
    }
    return estimateGeneratedMedleyExactCandidatePairUpperExcludingCardIds(
      pairUpperQuery,
      selectedCardIds,
      minimumRelevantScore,
      profiling,
    );
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
    const cardKey = buildMedleyExactCardIdKey(selectedCardIds);
    const cachePrefixKey = [
      leftSlotIndex,
      leftCandidateCount,
      rightSlotIndex,
      rightCandidateCount,
      globalPruning.pairUnseenUpperBound ?? "",
    ].join(":");
    let complementUpperBound = disableGlobalComplementUpperCache
      ? undefined
      : compactGlobalComplementUpperCache
        ? getMedleyExactCompactNestedNumberCache(compactGlobalComplementUpperCache, cachePrefixKey, cardKey)
        : getMedleyExactNestedNumberCache(globalComplementUpperCache, cachePrefixKey, cardKey);
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
      if (!disableGlobalComplementUpperCache) {
        if (compactGlobalComplementUpperCache) {
          setMedleyExactCompactNestedNumberCache(
            compactGlobalComplementUpperCache,
            cachePrefixKey,
            cardKey,
            complementUpperBound,
          );
        } else {
          setMedleyExactNestedNumberCache(globalComplementUpperCache, cachePrefixKey, cardKey, complementUpperBound);
        }
      }
    }
    return complementUpperBound === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : slotUpperBound + complementUpperBound;
  };
  const recordPrefixOtherUpperSourceReplay = (
    selectedCards: SearchCard[],
    nextStartIndex: number,
    prefixUpperBound: number,
    totalUpperBound: number,
    globalPruning: MedleyExactSlotCandidateGlobalPruning,
    enablePruning: boolean,
  ): MedleyExactPrefixOtherUpperSourceReplayDecision | null => {
    const sourceProfile = prefixUpperReplayProfile?.otherUpperSourceReplay;
    const selectedCardCount = selectedCards.length;
    const isLevel3Replay = selectedCardCount === MEDLEY_TEAM_SIZE - 2;
    const isLevel4Replay = selectedCardCount === MEDLEY_TEAM_SIZE - 1;
    if (!sourceProfile || (selectedCardCount !== MEDLEY_TEAM_SIZE && !isLevel3Replay && !isLevel4Replay)) {
      return null;
    }
    sourceProfile.checkedCount += 1;
    if (isLevel3Replay) {
      sourceProfile.level3CheckedCount += 1;
    }
    if (isLevel4Replay) {
      sourceProfile.level4CheckedCount += 1;
    }
    if (
      !Number.isFinite(prefixUpperBound)
      || !Number.isFinite(totalUpperBound)
      || !Number.isFinite(globalPruning.scoreCutoff)
    ) {
      return null;
    }
    const currentMargin = totalUpperBound - globalPruning.scoreCutoff;
    const impliedCompletionCount = getRelaxedImpliedCompletionCount(selectedCardCount, nextStartIndex);
    if (currentMargin < 0) {
      return null;
    }
    if (currentMargin > sourceProfile.maxMargin) {
      sourceProfile.overMarginSkippedCount += 1;
      if (isLevel3Replay) {
        sourceProfile.level3OverMarginSkippedCount += 1;
      }
      if (isLevel4Replay) {
        sourceProfile.level4OverMarginSkippedCount += 1;
      }
      return null;
    }
    if (sourceProfile.eligibleCount >= sourceProfile.maxChecks) {
      sourceProfile.budgetSkippedCount += 1;
      if (isLevel3Replay) {
        sourceProfile.level3BudgetSkippedCount += 1;
      }
      if (isLevel4Replay) {
        sourceProfile.level4BudgetSkippedCount += 1;
      }
      return null;
    }
    sourceProfile.eligibleCount += 1;
    if (isLevel3Replay) {
      sourceProfile.level3EligibleCount += 1;
    }
    if (isLevel4Replay) {
      sourceProfile.level4EligibleCount += 1;
    }
    sourceProfile.currentMarginMin = minNullableNumber(sourceProfile.currentMarginMin, currentMargin);
    sourceProfile.currentMarginMax = maxNullableNumber(sourceProfile.currentMarginMax, currentMargin);
    recordMedleyExactPrefixMarginCount(sourceProfile.currentMarginBuckets, currentMargin);
    const selectedCardIds = selectedCards.map((card) => card.cardId).sort((left, right) => left - right);
    const currentOtherUpper = totalUpperBound - prefixUpperBound;
    const pairUnseenUpper = globalPruning.pairUnseenUpperBound;
    if (
      pairUnseenUpper !== undefined
      && Number.isFinite(pairUnseenUpper)
      && Math.abs(currentOtherUpper - pairUnseenUpper) < 1e-6
    ) {
      sourceProfile.currentPairUnseenSourceCount += 1;
    }
    const minimumRelevantOtherScore = globalPruning.scoreCutoff - prefixUpperBound;
    const generatedPairUpper = isLevel3Replay || isLevel4Replay
      ? Number.NEGATIVE_INFINITY
      : estimateGeneratedPairOnlyComplementUpperBound(
        selectedCardIds,
        globalPruning,
        minimumRelevantOtherScore,
      );
    const generatedPairUpperOrNull = Number.isFinite(generatedPairUpper) ? generatedPairUpper : null;
    const generatedPairOnlyMargin = generatedPairUpperOrNull !== null
      ? prefixUpperBound + generatedPairUpperOrNull - globalPruning.scoreCutoff
      : Number.NEGATIVE_INFINITY;
    if (generatedPairUpperOrNull !== null) {
      sourceProfile.generatedPairFiniteCount += 1;
      if (generatedPairUpperOrNull < currentOtherUpper) {
        sourceProfile.generatedPairImprovedCount += 1;
      }
    }
    if (generatedPairUpperOrNull !== null && generatedPairOnlyMargin < 0) {
      sourceProfile.generatedPairOnlyWouldSkipCount += 1;
    }
    const bannedSelectedCardIds = new Set<number>(selectedCardIds);
    const basicCapacityUpper = estimateMedleyCapacityAssignmentScoreUpperBound(
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
    const basicCapacityUpperOrNull = Number.isFinite(basicCapacityUpper) ? basicCapacityUpper : null;
    if (basicCapacityUpperOrNull !== null) {
      sourceProfile.basicCapacityFiniteCount += 1;
      if (basicCapacityUpperOrNull < currentOtherUpper) {
        sourceProfile.basicCapacityImprovedCount += 1;
      }
      if (prefixUpperBound + basicCapacityUpperOrNull < globalPruning.scoreCutoff) {
        sourceProfile.basicCapacityWouldSkipCount += 1;
      }
    }
    const tightCapacityUpper = estimateMedleyRemainingScoreUpperBound(
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
    const tightCapacityUpperOrNull = Number.isFinite(tightCapacityUpper) ? tightCapacityUpper : null;
    if (tightCapacityUpperOrNull !== null) {
      sourceProfile.tightCapacityFiniteCount += 1;
      if (tightCapacityUpperOrNull < currentOtherUpper) {
        sourceProfile.tightCapacityImprovedCount += 1;
      }
      if (prefixUpperBound + tightCapacityUpperOrNull < globalPruning.scoreCutoff) {
        sourceProfile.tightCapacityWouldSkipCount += 1;
      }
    }
    const safeOtherUppers = [
      currentOtherUpper,
      basicCapacityUpperOrNull ?? Number.POSITIVE_INFINITY,
      tightCapacityUpperOrNull ?? Number.POSITIVE_INFINITY,
    ];
    const bestSafeOtherUpper = Math.min(...safeOtherUppers);
    const bestSafeTotalUpper = prefixUpperBound + bestSafeOtherUpper;
    const bestSafeMargin = bestSafeTotalUpper - globalPruning.scoreCutoff;
    sourceProfile.bestSafeMarginMin = minNullableNumber(sourceProfile.bestSafeMarginMin, bestSafeMargin);
    sourceProfile.bestSafeMarginMax = maxNullableNumber(sourceProfile.bestSafeMarginMax, bestSafeMargin);
    recordMedleyExactPrefixMarginCount(sourceProfile.bestSafeMarginBuckets, bestSafeMargin);
    const bestSafeImproved = bestSafeOtherUpper < currentOtherUpper;
    const bestSafeWouldSkip = bestSafeMargin < 0;
    if (bestSafeImproved) {
      sourceProfile.bestSafeImprovedCount += 1;
    }
    if (bestSafeWouldSkip) {
      sourceProfile.bestSafeWouldSkipCount += 1;
      if (isLevel3Replay) {
        sourceProfile.level3BestSafeWouldSkipCount += 1;
        sourceProfile.level3BestSafeWouldSkipImpliedCompletionCount = addCappedCount(
          sourceProfile.level3BestSafeWouldSkipImpliedCompletionCount,
          impliedCompletionCount,
        );
      }
      if (isLevel4Replay) {
        sourceProfile.level4BestSafeWouldSkipCount += 1;
        sourceProfile.level4BestSafeWouldSkipImpliedCompletionCount = addCappedCount(
          sourceProfile.level4BestSafeWouldSkipImpliedCompletionCount,
          impliedCompletionCount,
        );
      }
    }
    if (
      sourceProfile.samples.length < MEDLEY_EXACT_PREFIX_OTHER_UPPER_SOURCE_REPLAY_SAMPLE_LIMIT
      && (bestSafeImproved || bestSafeWouldSkip || (generatedPairUpperOrNull !== null && generatedPairOnlyMargin < 0))
    ) {
      sourceProfile.samples.push({
        songIndex: slot.songIndex,
        level: selectedCardCount,
        impliedCompletionCount,
        incumbent: globalPruning.scoreCutoff,
        prefixUpper: prefixUpperBound,
        currentOtherUpper,
        currentTotalUpper: totalUpperBound,
        currentMargin,
        pairUnseenUpper: pairUnseenUpper !== undefined && Number.isFinite(pairUnseenUpper)
          ? pairUnseenUpper
          : null,
        generatedPairUpper: generatedPairUpperOrNull,
        basicCapacityUpper: basicCapacityUpperOrNull,
        tightCapacityUpper: tightCapacityUpperOrNull,
        bestSafeOtherUpper,
        bestSafeTotalUpper,
        bestSafeMargin,
        generatedPairOnlyMargin: Number.isFinite(generatedPairOnlyMargin) ? generatedPairOnlyMargin : null,
      });
    }
    if (enablePruning && bestSafeWouldSkip) {
      sourceProfile.prunedCount += 1;
      sourceProfile.prunedImpliedCompletionCount = addCappedCount(
        sourceProfile.prunedImpliedCompletionCount,
        impliedCompletionCount,
      );
    }
    return {
      wouldSkip: bestSafeWouldSkip,
      level: selectedCardCount,
      prefixUpper: prefixUpperBound,
      bestSafeOtherUpper,
      proofCutoffScore: globalPruning.scoreCutoff,
    };
  };
  const recordPrefixOtherUpperSourceReplayViolation = (
    decision: MedleyExactPrefixOtherUpperSourceReplayDecision,
    candidate: MedleyTeamCandidate,
  ): void => {
    const sourceProfile = prefixUpperReplayProfile?.otherUpperSourceReplay;
    const violatesLocalUpper = candidate.result.score > decision.prefixUpper + 1e-6;
    const violatesGlobalUpper = candidate.result.score + decision.bestSafeOtherUpper >= decision.proofCutoffScore;
    if (
      !sourceProfile
      || !decision.wouldSkip
      || (!violatesLocalUpper && !violatesGlobalUpper)
    ) {
      return;
    }
    sourceProfile.bestSafeReplayViolationCount += 1;
    if (decision.level === MEDLEY_TEAM_SIZE - 2) {
      sourceProfile.level3BestSafeReplayViolationCount += 1;
    }
    if (decision.level === MEDLEY_TEAM_SIZE - 1) {
      sourceProfile.level4BestSafeReplayViolationCount += 1;
    }
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

  const expandNodeWithoutPrefixReplay = (
    node: MedleyExactSlotCandidateSearchNode,
    scoreCutoff: number,
    globalPruning?: MedleyExactSlotCandidateGlobalPruning,
  ): void => {
    if (Number.isFinite(scoreCutoff)) {
      maxPruningScoreCutoff = Math.max(maxPruningScoreCutoff, scoreCutoff);
    }
    const nodeSelectedCards = getSelectedCardsForNode(node);
    const nodeSelectedCardIndices = getSelectedCardIndicesForNode(node);
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
      const nextSelectedCardIndices = [...nodeSelectedCardIndices, index];
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
          ? buildMedleyExactSelectedCardKey(nextSelectedCards)
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
          {
            disableScoreOnlyCache,
            disableScoreOnlyCalculationCache,
            scoreOnlyCalculationCache,
            compactScoreOnlyCache: enableCompactScoreOnlyCache,
          },
        );
        if (candidate && candidate.result.score >= scoreCutoff) {
          let retainedCandidate = candidate;
          if (disableCandidateCardsRetention) {
            retainedCandidate = stripMedleyExactCandidateCardRetention(retainedCandidate, nextSelectedCardIndices);
          }
          if (enableThinCandidateResultRetention) {
            retainedCandidate = stripMedleyExactCandidateResultRetention(retainedCandidate);
          }
          pushSearchNode(createSearchNode({
            key: retainedCandidate.result.score,
            slotUpperBound: retainedCandidate.result.score,
            selectedCardIndices: nextSelectedCardIndices,
            startIndex: nextStartIndex,
            usedCharacterMaskLow: nextUsedCharacterMaskLow,
            usedCharacterMaskHigh: nextUsedCharacterMaskHigh,
            selectedPower: nextSelectedPower,
            candidate: retainedCandidate,
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
          selectedCardIndices: nextSelectedCardIndices,
          startIndex: nextStartIndex,
          usedCharacterMaskLow: nextUsedCharacterMaskLow,
          usedCharacterMaskHigh: nextUsedCharacterMaskHigh,
          selectedPower: nextSelectedPower,
          candidate: null,
        }), scoreCutoff, globalPruning);
      }
    }
  };

  const expandNodeWithPrefixReplay = (
    node: MedleyExactSlotCandidateSearchNode,
    scoreCutoff: number,
    globalPruning?: MedleyExactSlotCandidateGlobalPruning,
  ): void => {
    if (Number.isFinite(scoreCutoff)) {
      maxPruningScoreCutoff = Math.max(maxPruningScoreCutoff, scoreCutoff);
    }
    const nodeSelectedCards = getSelectedCardsForNode(node);
    const nodeSelectedCardIndices = getSelectedCardIndicesForNode(node);
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
      const nextSelectedCardIndices = [...nodeSelectedCardIndices, index];
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
        if (prefixUpperReplayProfile) {
          recordPrefixSlotUpperReplay(
            nextSelectedCards.length,
            nextStartIndex,
            leafUpperBound,
            scoreCutoff,
          );
        }
        if (!Number.isFinite(leafUpperBound) || leafUpperBound < scoreCutoff) {
          continue;
        }
        const globalLeafUpperBound = estimateGlobalPrunedUpperBound(
          leafUpperBound,
          nextSelectedCards,
          globalPruning,
        );
        let prefixOtherUpperSourceDecision: MedleyExactPrefixOtherUpperSourceReplayDecision | null = null;
        if (prefixUpperReplayProfile && globalPruning) {
          recordPrefixLeafProofLedger(
            nextSelectedCards.length,
            nextStartIndex,
            leafUpperBound,
            globalLeafUpperBound,
            globalPruning.scoreCutoff,
          );
        }
        if (
          prefixUpperReplayProfile
          && globalPruning
          && (enablePrefixOtherUpperSourceReplay || enableCapacitySourceLeafPruning)
        ) {
          prefixOtherUpperSourceDecision = recordPrefixOtherUpperSourceReplay(
            nextSelectedCards,
            nextStartIndex,
            leafUpperBound,
            globalLeafUpperBound,
            globalPruning,
            enableCapacitySourceLeafPruning,
          );
        }
        if (prefixUpperReplayProfile && globalPruning) {
          recordPrefixHardUpperReplay(
            nextSelectedCards.length,
            nextStartIndex,
            Number.isFinite(globalLeafUpperBound) ? globalLeafUpperBound : null,
            globalPruning.scoreCutoff,
          );
        }
        if (globalLeafUpperBound < (globalPruning?.scoreCutoff ?? Number.NEGATIVE_INFINITY)) {
          continue;
        }
        if (enableCapacitySourceLeafPruning && prefixOtherUpperSourceDecision?.wouldSkip === true) {
          continue;
        }
        const candidateKey = globalPruning?.excludedCandidateKeys
          ? buildMedleyExactSelectedCardKey(nextSelectedCards)
          : null;
        if (candidateKey && globalPruning?.excludedCandidateKeys?.has(candidateKey)) {
          continue;
        }
        if (prefixUpperReplayProfile) {
          recordPrefixCandidateEvaluation();
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
          {
            disableScoreOnlyCache,
            disableScoreOnlyCalculationCache,
            scoreOnlyCalculationCache,
            compactScoreOnlyCache: enableCompactScoreOnlyCache,
          },
        );
        if (prefixOtherUpperSourceDecision && candidate) {
          recordPrefixOtherUpperSourceReplayViolation(prefixOtherUpperSourceDecision, candidate);
        }
        const prefixCapacityBatchReplayDecision = getPrefixCapacityBatchReplayDecisionForNode(node);
        if (prefixCapacityBatchReplayDecision && candidate) {
          recordPrefixOtherUpperSourceReplayViolation(prefixCapacityBatchReplayDecision, candidate);
        }
        if (candidate && candidate.result.score >= scoreCutoff) {
          if (prefixUpperReplayProfile) {
            recordPrefixMaterializedCandidate();
          }
          let retainedCandidate = candidate;
          if (disableCandidateCardsRetention) {
            retainedCandidate = stripMedleyExactCandidateCardRetention(retainedCandidate, nextSelectedCardIndices);
          }
          if (enableThinCandidateResultRetention) {
            retainedCandidate = stripMedleyExactCandidateResultRetention(retainedCandidate);
          }
          pushSearchNode(createSearchNode({
            key: retainedCandidate.result.score,
            slotUpperBound: retainedCandidate.result.score,
            selectedCardIndices: nextSelectedCardIndices,
            startIndex: nextStartIndex,
            usedCharacterMaskLow: nextUsedCharacterMaskLow,
            usedCharacterMaskHigh: nextUsedCharacterMaskHigh,
            selectedPower: nextSelectedPower,
            candidate: retainedCandidate,
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
      if (prefixUpperReplayProfile) {
        recordPrefixSlotUpperReplay(
          nextSelectedCards.length,
          nextStartIndex,
          upperBound,
          scoreCutoff,
        );
      }
      let passesPairGlobalPruning = true;
      let prefixCapacityBatchReplayDecision = getPrefixCapacityBatchReplayDecisionForNode(node);
      const pairUnseenUpperBound = globalPruning?.pairUnseenUpperBound;
      if (
        enablePrefixCapacityLevel3Replay
        && prefixUpperReplayProfile
        && globalPruning
        && Number.isFinite(upperBound)
        && upperBound >= scoreCutoff
        && nextSelectedCards.length === MEDLEY_TEAM_SIZE - 2
        && pairUnseenUpperBound !== undefined
        && Number.isFinite(pairUnseenUpperBound)
      ) {
        const nextDecision = recordPrefixOtherUpperSourceReplay(
          nextSelectedCards,
          nextStartIndex,
          upperBound,
          upperBound + pairUnseenUpperBound,
          globalPruning,
          false,
        );
        if (nextDecision?.wouldSkip === true) {
          prefixCapacityBatchReplayDecision = nextDecision;
        }
      }
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
        if (prefixUpperReplayProfile && globalPruning) {
          recordPrefixHardUpperReplay(
            nextSelectedCards.length,
            nextStartIndex,
            pairGlobalUpperBound === null ? null : upperBound + pairGlobalUpperBound,
            globalPruning.scoreCutoff,
          );
        }
        if (
          enablePrefixCapacityBatchReplay
          && prefixUpperReplayProfile
          && globalPruning
          && pairGlobalUpperBound !== null
          && Number.isFinite(pairGlobalUpperBound)
        ) {
          const nextDecision = recordPrefixOtherUpperSourceReplay(
            nextSelectedCards,
            nextStartIndex,
            upperBound,
            upperBound + pairGlobalUpperBound,
            globalPruning,
            false,
          );
          if (nextDecision?.wouldSkip === true) {
            prefixCapacityBatchReplayDecision = nextDecision;
          }
        }
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
          selectedCardIndices: nextSelectedCardIndices,
          startIndex: nextStartIndex,
          usedCharacterMaskLow: nextUsedCharacterMaskLow,
          usedCharacterMaskHigh: nextUsedCharacterMaskHigh,
          selectedPower: nextSelectedPower,
          candidate: null,
          prefixCapacityBatchReplayDecision,
        }), scoreCutoff, globalPruning);
      }
    }
  };
  const expandNode = prefixUpperReplayProfile ? expandNodeWithPrefixReplay : expandNodeWithoutPrefixReplay;

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
    compactGlobalComplementUpperCache?.clear();
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
    canReuseForScoreCutoff: (scoreCutoff: number) => (
      !Number.isFinite(scoreCutoff) || scoreCutoff >= maxPruningScoreCutoff
    ),
    hasAborted: () => aborted,
    poppedNodeCount: () => poppedNodes,
    release,
    prefixUpperReplayProfile: () => prefixUpperReplayProfile,
    memoryProfile: () => {
      let highPairRecordCount = 0;
      let highPairRecordBitsetBytes = 0;
      let rightCandidateBitsetBytes = 0;
      for (const query of pairUpperQueryCache.values()) {
        highPairRecordCount += query.highPairRecords?.length ?? 0;
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
        globalComplementUpperCacheSize: compactGlobalComplementUpperCache
          ? countMedleyExactCompactNestedNumberCacheEntries(compactGlobalComplementUpperCache)
          : countMedleyExactNestedNumberCacheEntries(globalComplementUpperCache),
        globalComplementUpperCacheBucketCount: compactGlobalComplementUpperCache
          ? compactGlobalComplementUpperCache.size
          : globalComplementUpperCache.size,
        globalComplementUpperCacheCompactMiB: compactGlobalComplementUpperCache
          ? roundMiB(estimateMedleyExactCompactNestedNumberCacheBytes(compactGlobalComplementUpperCache))
          : null,
        globalPairComplementUpperCacheSize: countMedleyExactNestedNumberCacheEntries(globalPairComplementUpperCache),
        globalPairComplementUpperCacheBucketCount: globalPairComplementUpperCache.size,
        pairUpperQueryCacheSize: pairUpperQueryCache.size,
        highPairRecordCount,
        highPairRecordBitsetMiB: roundMiB(highPairRecordBitsetBytes),
        rightCandidateBitsetMiB: roundMiB(rightCandidateBitsetBytes),
        scoreOnlyCalculationCache: scoreOnlyCalculationCache
          ? buildMedleyExactScoreCalculationCacheProfile(
            slot,
            -1,
            scoreOnlyCalculationCache,
            null,
          )
          : null,
      };
    },
  };
}

function sumMedleyExactPrefixUpperReplayLevel(
  level: MedleyExactPrefixUpperReplayLevelProfile,
  options: { includeMarginBuckets: boolean; includeProofSamples: boolean } = {
    includeMarginBuckets: true,
    includeProofSamples: true,
  },
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    level: level.level,
    checkedPrefixCount: level.checkedPrefixCount,
    relaxedImpliedCompletionCount: level.relaxedImpliedCompletionCount,
    finiteSlotUpperCount: level.finiteSlotUpperCount,
    slotUpperPassCount: level.slotUpperPassCount,
    slotUpperRejectedCount: level.slotUpperRejectedCount,
    hardUpperCheckedCount: level.hardUpperCheckedCount,
    hardUpperFiniteCount: level.hardUpperFiniteCount,
    hardUpperSkipablePrefixCount: level.hardUpperSkipablePrefixCount,
    hardUpperSkipableImpliedCompletionCount: level.hardUpperSkipableImpliedCompletionCount,
    hardUpperRetainedPrefixCount: level.hardUpperRetainedPrefixCount,
    hardUpperUnknownCount: level.hardUpperUnknownCount,
    candidateEvaluationCount: level.candidateEvaluationCount,
    materializedCandidateCount: level.materializedCandidateCount,
    slotUpperMarginMin: level.slotUpperMarginMin,
    slotUpperMarginMax: level.slotUpperMarginMax,
    hardUpperMarginMin: level.hardUpperMarginMin,
    hardUpperMarginMax: level.hardUpperMarginMax,
    leafProofLedgerCheckedCount: level.leafProofLedgerCheckedCount,
    leafProofLedgerFiniteCount: level.leafProofLedgerFiniteCount,
    leafProofLedgerSkipCount: level.leafProofLedgerSkipCount,
    leafProofLedgerSkipImpliedCompletionCount: level.leafProofLedgerSkipImpliedCompletionCount,
    leafProofLedgerRetainedCount: level.leafProofLedgerRetainedCount,
    leafProofLedgerUnknownCount: level.leafProofLedgerUnknownCount,
    leafProofLedgerMarginMin: level.leafProofLedgerMarginMin,
    leafProofLedgerMarginMax: level.leafProofLedgerMarginMax,
  };
  if (options.includeMarginBuckets) {
    result.slotUpperMarginPrefixBuckets = level.slotUpperMarginPrefixBuckets.slice();
    result.slotUpperMarginImpliedCompletionBuckets = level.slotUpperMarginImpliedCompletionBuckets.slice();
    result.hardUpperMarginPrefixBuckets = level.hardUpperMarginPrefixBuckets.slice();
    result.hardUpperMarginImpliedCompletionBuckets = level.hardUpperMarginImpliedCompletionBuckets.slice();
    result.leafProofLedgerMarginPrefixBuckets = level.leafProofLedgerMarginPrefixBuckets.slice();
    result.leafProofLedgerMarginImpliedCompletionBuckets = (
      level.leafProofLedgerMarginImpliedCompletionBuckets.slice()
    );
  }
  if (options.includeProofSamples) {
    result.leafProofLedgerSkipSamples = level.leafProofLedgerSkipSamples.slice();
  }
  return result;
}

function serializeMedleyExactPrefixUpperReplayProfile(
  profile: MedleyExactPrefixUpperReplayProfile,
): Record<string, unknown> {
  const levels = profile.levels.map((level) => (
    sumMedleyExactPrefixUpperReplayLevel(level, {
      includeMarginBuckets: false,
      includeProofSamples: false,
    })
  ));
  return {
    algorithm: profile.algorithm,
    songIndex: profile.songIndex,
    hardUpperReplayEnabled: profile.hardUpperReplayEnabled,
    otherUpperSourceReplay: serializeMedleyExactPrefixOtherUpperSourceReplayProfile(
      profile.otherUpperSourceReplay,
      { includeBuckets: false, includeSamples: false },
    ),
    checkedPrefixCountTotal: profile.levels.reduce((sum, level) => sum + level.checkedPrefixCount, 0),
    relaxedImpliedCompletionCountTotal: profile.levels.reduce((
      sum,
      level,
    ) => addCappedCount(sum, level.relaxedImpliedCompletionCount), 0),
    hardUpperSkipablePrefixCountTotal: profile.levels.reduce((
      sum,
      level,
    ) => sum + level.hardUpperSkipablePrefixCount, 0),
    hardUpperSkipableImpliedCompletionCountTotal: profile.levels.reduce((
      sum,
      level,
    ) => addCappedCount(sum, level.hardUpperSkipableImpliedCompletionCount), 0),
    leafProofLedgerCheckedCountTotal: profile.levels.reduce((sum, level) => (
      addCappedCount(sum, level.leafProofLedgerCheckedCount)
    ), 0),
    leafProofLedgerSkipCountTotal: profile.levels.reduce((sum, level) => (
      addCappedCount(sum, level.leafProofLedgerSkipCount)
    ), 0),
    leafProofLedgerSkipImpliedCompletionCountTotal: profile.levels.reduce((sum, level) => (
      addCappedCount(sum, level.leafProofLedgerSkipImpliedCompletionCount)
    ), 0),
    materializedCandidateCountTotal: profile.levels.reduce((sum, level) => (
      sum + level.materializedCandidateCount
    ), 0),
    levels,
  };
}

function summarizeMedleyExactPrefixUpperReplayProfiles(
  profiles: MedleyExactPrefixUpperReplayProfile[],
): MedleyExactPrefixUpperReplaySummary | null {
  if (profiles.length === 0) {
    return null;
  }
  const levels = Array.from(
    { length: MEDLEY_EXACT_PREFIX_UPPER_REPLAY_LEVEL_COUNT },
    (_, level) => createMedleyExactPrefixUpperReplayLevelProfile(level),
  );
  for (const profile of profiles) {
    for (const level of profile.levels) {
      const targetLevel = levels[level.level];
      if (targetLevel) {
        addMedleyExactPrefixUpperReplayLevel(targetLevel, level);
      }
    }
  }
  const sumLevelField = (
    field: keyof Omit<MedleyExactPrefixUpperReplayLevelProfile, "level">,
  ): number => levels.reduce((sum, level) => addCappedCount(sum, level[field] as number), 0);
  return {
    algorithm: "hhwx-prefix-upper-replay-v1",
    configurationSummaryCount: 1,
    generatorCount: profiles.length,
    hardUpperReplayEnabled: profiles.some((profile) => profile.hardUpperReplayEnabled),
    marginBucketUpperBounds: [...MEDLEY_EXACT_PREFIX_UPPER_MARGIN_BUCKET_UPPER_BOUNDS],
    otherUpperSourceReplay: summarizeMedleyExactPrefixOtherUpperSourceReplayProfiles(profiles),
    checkedPrefixCountTotal: sumLevelField("checkedPrefixCount"),
    relaxedImpliedCompletionCountTotal: sumLevelField("relaxedImpliedCompletionCount"),
    finiteSlotUpperCountTotal: sumLevelField("finiteSlotUpperCount"),
    slotUpperPassCountTotal: sumLevelField("slotUpperPassCount"),
    slotUpperRejectedCountTotal: sumLevelField("slotUpperRejectedCount"),
    hardUpperCheckedCountTotal: sumLevelField("hardUpperCheckedCount"),
    hardUpperFiniteCountTotal: sumLevelField("hardUpperFiniteCount"),
    hardUpperSkipablePrefixCountTotal: sumLevelField("hardUpperSkipablePrefixCount"),
    hardUpperSkipableImpliedCompletionCountTotal: sumLevelField("hardUpperSkipableImpliedCompletionCount"),
    hardUpperRetainedPrefixCountTotal: sumLevelField("hardUpperRetainedPrefixCount"),
    hardUpperUnknownCountTotal: sumLevelField("hardUpperUnknownCount"),
    candidateEvaluationCountTotal: sumLevelField("candidateEvaluationCount"),
    materializedCandidateCountTotal: sumLevelField("materializedCandidateCount"),
    leafProofLedgerCheckedCountTotal: sumLevelField("leafProofLedgerCheckedCount"),
    leafProofLedgerFiniteCountTotal: sumLevelField("leafProofLedgerFiniteCount"),
    leafProofLedgerSkipCountTotal: sumLevelField("leafProofLedgerSkipCount"),
    leafProofLedgerSkipImpliedCompletionCountTotal: sumLevelField("leafProofLedgerSkipImpliedCompletionCount"),
    leafProofLedgerRetainedCountTotal: sumLevelField("leafProofLedgerRetainedCount"),
    leafProofLedgerUnknownCountTotal: sumLevelField("leafProofLedgerUnknownCount"),
    levels,
    latestGenerators: profiles.map(serializeMedleyExactPrefixUpperReplayProfile),
  };
}

function asMedleyExactPrefixUpperReplaySummary(
  value: Record<string, unknown> | null | undefined,
): MedleyExactPrefixUpperReplaySummary | null {
  if (
    !value
    || value.algorithm !== "hhwx-prefix-upper-replay-v1"
    || !Array.isArray(value.levels)
  ) {
    return null;
  }
  return value as MedleyExactPrefixUpperReplaySummary;
}

function mergeMedleyExactPrefixUpperReplaySummaries(
  previous: Record<string, unknown> | null | undefined,
  next: MedleyExactPrefixUpperReplaySummary | null,
): MedleyExactPrefixUpperReplaySummary | null {
  if (!next) {
    return asMedleyExactPrefixUpperReplaySummary(previous);
  }
  const existing = asMedleyExactPrefixUpperReplaySummary(previous);
  if (!existing) {
    return next;
  }
  const levels = Array.from(
    { length: MEDLEY_EXACT_PREFIX_UPPER_REPLAY_LEVEL_COUNT },
    (_, level) => createMedleyExactPrefixUpperReplayLevelProfile(level),
  );
  for (const source of [existing, next]) {
    for (const level of source.levels) {
      const targetLevel = levels[level.level];
      if (targetLevel) {
        addMedleyExactPrefixUpperReplayLevel(targetLevel, level);
      }
    }
  }
  const sumLevelField = (
    field: keyof Omit<MedleyExactPrefixUpperReplayLevelProfile, "level">,
  ): number => levels.reduce((sum, level) => addCappedCount(sum, level[field] as number), 0);
  return {
    algorithm: "hhwx-prefix-upper-replay-v1",
    configurationSummaryCount: existing.configurationSummaryCount + next.configurationSummaryCount,
    generatorCount: existing.generatorCount + next.generatorCount,
    hardUpperReplayEnabled: existing.hardUpperReplayEnabled || next.hardUpperReplayEnabled,
    marginBucketUpperBounds: [...MEDLEY_EXACT_PREFIX_UPPER_MARGIN_BUCKET_UPPER_BOUNDS],
    otherUpperSourceReplay: (() => {
      const sourceSummary = createMedleyExactPrefixOtherUpperSourceReplayProfile(0, 0);
      addMedleyExactPrefixOtherUpperSourceReplayProfile(
        sourceSummary,
        existing.otherUpperSourceReplay,
      );
      addMedleyExactPrefixOtherUpperSourceReplayProfile(sourceSummary, next.otherUpperSourceReplay);
      return sourceSummary.checkedCount > 0 || sourceSummary.eligibleCount > 0 ? sourceSummary : null;
    })(),
    checkedPrefixCountTotal: sumLevelField("checkedPrefixCount"),
    relaxedImpliedCompletionCountTotal: sumLevelField("relaxedImpliedCompletionCount"),
    finiteSlotUpperCountTotal: sumLevelField("finiteSlotUpperCount"),
    slotUpperPassCountTotal: sumLevelField("slotUpperPassCount"),
    slotUpperRejectedCountTotal: sumLevelField("slotUpperRejectedCount"),
    hardUpperCheckedCountTotal: sumLevelField("hardUpperCheckedCount"),
    hardUpperFiniteCountTotal: sumLevelField("hardUpperFiniteCount"),
    hardUpperSkipablePrefixCountTotal: sumLevelField("hardUpperSkipablePrefixCount"),
    hardUpperSkipableImpliedCompletionCountTotal: sumLevelField("hardUpperSkipableImpliedCompletionCount"),
    hardUpperRetainedPrefixCountTotal: sumLevelField("hardUpperRetainedPrefixCount"),
    hardUpperUnknownCountTotal: sumLevelField("hardUpperUnknownCount"),
    candidateEvaluationCountTotal: sumLevelField("candidateEvaluationCount"),
    materializedCandidateCountTotal: sumLevelField("materializedCandidateCount"),
    leafProofLedgerCheckedCountTotal: sumLevelField("leafProofLedgerCheckedCount"),
    leafProofLedgerFiniteCountTotal: sumLevelField("leafProofLedgerFiniteCount"),
    leafProofLedgerSkipCountTotal: sumLevelField("leafProofLedgerSkipCount"),
    leafProofLedgerSkipImpliedCompletionCountTotal: sumLevelField("leafProofLedgerSkipImpliedCompletionCount"),
    leafProofLedgerRetainedCountTotal: sumLevelField("leafProofLedgerRetainedCount"),
    leafProofLedgerUnknownCountTotal: sumLevelField("leafProofLedgerUnknownCount"),
    levels,
    latestGenerators: next.latestGenerators,
  };
}

function summarizeMedleyExactPrefixUpperReplayGenerators(
  generators: MedleyExactSlotCandidateGenerator[],
): MedleyExactPrefixUpperReplaySummary | null {
  const profiles = generators
    .map((generator) => generator.prefixUpperReplayProfile?.() ?? null)
    .filter((profile): profile is MedleyExactPrefixUpperReplayProfile => profile !== null);
  return summarizeMedleyExactPrefixUpperReplayProfiles(profiles);
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
  highPairRecords?: MedleyExactCandidatePairRecord[];
  highPairRecordScores?: number[];
  highPairRecordThreshold?: number;
  highPairRecordBitsetWordCount?: number;
  containingHighPairRecordBitsByCardId?: Map<number, Uint32Array>;
  highPairRecordFallbackUpperScore?: number | null;
  lowMemoryHighPairScanMinRecordCount?: number;
  lowMemoryHighPairPrefixRecordLimit?: number;
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
  return getFirstMedleyTeamCandidateOverlapCardId(leftCandidate, rightCandidate);
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
    const overlapCardId = getFirstMedleyExactCandidateOverlapCardId(leftCandidate, rightCandidate);
    if (overlapCardId === null) {
      const upperBound = leftCandidate.result.score + rightCandidate.result.score;
      cache.set(key, upperBound);
      return upperBound;
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

function compareMedleyExactCandidatePairRecordMinHeap(
  left: MedleyExactCandidatePairRecord,
  right: MedleyExactCandidatePairRecord,
): number {
  return left.score - right.score;
}

function siftUpMedleyExactCandidatePairRecordMinHeap(
  heap: MedleyExactCandidatePairRecord[],
  index: number,
): void {
  let currentIndex = index;
  while (currentIndex > 0) {
    const parentIndex = (currentIndex - 1) >> 1;
    if (compareMedleyExactCandidatePairRecordMinHeap(heap[parentIndex], heap[currentIndex]) <= 0) {
      break;
    }
    const parent = heap[parentIndex];
    heap[parentIndex] = heap[currentIndex];
    heap[currentIndex] = parent;
    currentIndex = parentIndex;
  }
}

function siftDownMedleyExactCandidatePairRecordMinHeap(
  heap: MedleyExactCandidatePairRecord[],
  index: number,
): void {
  let currentIndex = index;
  while (true) {
    const leftIndex = currentIndex * 2 + 1;
    const rightIndex = leftIndex + 1;
    let smallestIndex = currentIndex;
    if (
      leftIndex < heap.length
      && compareMedleyExactCandidatePairRecordMinHeap(heap[leftIndex], heap[smallestIndex]) < 0
    ) {
      smallestIndex = leftIndex;
    }
    if (
      rightIndex < heap.length
      && compareMedleyExactCandidatePairRecordMinHeap(heap[rightIndex], heap[smallestIndex]) < 0
    ) {
      smallestIndex = rightIndex;
    }
    if (smallestIndex === currentIndex) {
      break;
    }
    const next = heap[smallestIndex];
    heap[smallestIndex] = heap[currentIndex];
    heap[currentIndex] = next;
    currentIndex = smallestIndex;
  }
}

function pushMedleyExactCandidatePairRecordPrefix(
  heap: MedleyExactCandidatePairRecord[],
  record: MedleyExactCandidatePairRecord,
  limit: number,
): boolean {
  if (heap.length < limit) {
    heap.push(record);
    siftUpMedleyExactCandidatePairRecordMinHeap(heap, heap.length - 1);
    return true;
  }
  if (compareMedleyExactCandidatePairRecordMinHeap(record, heap[0]) <= 0) {
    return false;
  }
  heap[0] = record;
  siftDownMedleyExactCandidatePairRecordMinHeap(heap, 0);
  return true;
}

function getHighMedleyExactCandidatePairRecords(
  query: MedleyExactCandidatePairUpperQuery,
  threshold: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
  useExactThreshold = false,
): MedleyExactCandidatePairRecord[] {
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
    query.highPairRecords = cachedRecordSet.records;
    query.highPairRecordScores = cachedRecordSet.scores;
    query.highPairRecordThreshold = cacheThreshold;
    query.highPairRecordBitsetWordCount = cachedRecordSet.wordCount;
    query.containingHighPairRecordBitsByCardId = cachedRecordSet.containingRecordBitsByCardId;
    query.highPairRecordFallbackUpperScore = cachedRecordSet.fallbackUpperScore;
    return cachedRecordSet.records;
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
      const record = {
        score,
        leftCardIds: copyMedleyTeamCandidateCardIds(leftCandidate),
        rightCardIds: copyMedleyTeamCandidateCardIds(rightCandidate),
      };
      if (shouldUseBoundedPrefix) {
        pushMedleyExactCandidatePairRecordPrefix(records, record, prefixRecordLimit);
      } else {
        records.push(record);
      }
    }
  }
  const fallbackUpperScore = shouldUseBoundedPrefix && records.length >= prefixRecordLimit
    ? records[0]?.score ?? null
    : null;
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
    return getHighMedleyExactCandidatePairRecords(query, threshold, profiling, useExactThreshold);
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
    fallbackUpperScore,
  };
  query.highPairRecordCache ??= new Map();
  query.highPairRecordCache.set(cacheThreshold, recordCache);
  query.highPairRecords = records;
  query.highPairRecordScores = scores;
  query.highPairRecordThreshold = cacheThreshold;
  query.highPairRecordBitsetWordCount = wordCount;
  query.containingHighPairRecordBitsByCardId = containingRecordBitsByCardId;
  query.highPairRecordFallbackUpperScore = fallbackUpperScore;
  return records;
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
    if (medleyTeamCandidateHasCardIdInSet(leftCandidate, bannedCardIdSet)) {
      continue;
    }
    const cutoff = Math.max(bestScore, minimumRelevantScore);
    if (leftCandidate.result.score + bestRightScore <= cutoff) {
      break;
    }
    const rightQueryResult = findBestAvailableMedleyExactRightCandidateByForbiddenCardIds(
      query,
      bannedCardIdList,
      getMedleyTeamCandidateCardIds(leftCandidate),
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
      return estimateGeneratedMedleyExactCandidatePairUpperExcludingCardIdsByScan(
        query,
        bannedCardIds,
        minimumRelevantScore,
        profiling,
      );
    }
    const highPairRecords = getHighMedleyExactCandidatePairRecords(
      query,
      minimumRelevantScore,
      profiling,
      useExactHighPairThreshold,
    );
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
): MedleyExactCandidateJoinSolveResult {
  // The final join is exact only over candidate lists whose unseen frontier was already
  // bounded. Bitsets accelerate card-disjoint checks but never approximate the conflict rule.
  if (slots.length !== MEDLEY_TEAM_COUNT || candidatesBySlot.some((candidates) => candidates.length === 0)) {
    return { timedOut: false, result: null };
  }
  type ThirdCandidateShortlist = { candidateIndices: Uint32Array; count: number; exhaustive: boolean };

  // Extremely imbalanced lists can spend too much time joining the smallest
  // list first because the second-list frontier stays wide. Trying the middle
  // list first is still exact; it only changes enumeration order and the
  // bounded shortlist used for third-slot acceleration.
  const { slotOrder, shouldUseMiddleFirstJoinOrder } = getMedleyExactCandidateJoinSlotOrder(slots, candidatesBySlot);
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
    forEachMedleyTeamCandidateCardId(candidate, (cardId) => {
      const currentContainingBits = containingThirdCandidateBitsByCardId.get(cardId);
      if (currentContainingBits) {
        containingBits.push(currentContainingBits);
      }
    });
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
    const bestThirdCandidate = findBestDisjointMedleyExactCandidateByCardIds(
      thirdCandidates,
      getMedleyTeamCandidateCardIds(candidate),
    );
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
  const bannedCardIdSet = new Set(getMedleyTeamCandidateCardIds(anchorCandidate));
  const bannedRightCandidateBits = buildBannedMedleyExactRightCandidateBits(query, bannedCardIdSet);
  const bestRightScore = query.rightCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY;
  for (const leftCandidate of query.leftCandidates) {
    if (medleyTeamCandidateHasCardIdInSet(leftCandidate, bannedCardIdSet)) {
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
  const bannedCardIdSet = new Set(getMedleyTeamCandidateCardIds(anchorCandidate));
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
    if (medleyTeamCandidateHasCardIdInSet(leftCandidate, bannedCardIdSet)) {
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
  const bannedCardIdSet = new Set(getMedleyTeamCandidateCardIds(anchorCandidate));
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
    if (medleyTeamCandidateHasCardIdInSet(leftCandidate, bannedCardIdSet)) {
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
        medleyTeamCandidateHasCardIdInSet(rightCandidate, bannedCardIdSet)
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

function getMedleyExactCandidateCardKey(candidate: MedleyTeamCandidate): MedleyExactCandidateCardKey {
  return buildMedleyExactCandidateCardIdKey(candidate);
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
    getMedleyExactCandidateCards(slot, candidate),
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
  profiling: BandoriMedleyTeamSearchProfilingStats,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  deadlineAt: number,
  observeEvaluatedResult?: MedleyEvaluatedResultObserver,
): MedleyExactCandidateAnchorFrontierProofResult {
  const startedAt = performance.now();
  const localDeadlineAt = Math.min(
    deadlineAt,
    startedAt + MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_TIMEBOX_MS,
  );
  const pairSlotIndices = slots
    .map((_, index) => index)
    .filter((index) => index !== anchorSlotIndex) as [number, number];
  const anchorCandidates = [...candidatesBySlot[anchorSlotIndex]];
  sortMedleyCandidates(anchorCandidates);

  profiling.exactCandidateJoinAnchorFrontierProofTriggerCount += 1;
  profiling.exactCandidateJoinLastAnchorFrontierProofSlotIndex = anchorSlotIndex;
  profiling.exactCandidateJoinLastAnchorFrontierProofProcessedAnchorCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierProofResidualUpperBound = null;
  profiling.exactCandidateJoinLastAnchorFrontierProofResidualGap = null;
  profiling.exactCandidateJoinLastAnchorFrontierProofElapsedMs = null;
  profiling.exactCandidateJoinLastAnchorFrontierProofTimeboxMs = (
    MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_TIMEBOX_MS
  );
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
  configuration: BandoriAreaItemConfiguration,
  incumbentScore: number,
  server: number,
  perfectRate: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  stats: BandoriMedleyTeamSearchStats,
  deadlineAt: number,
): MedleyExactCandidateAnchorFrontierProofResult {
  const startedAt = performance.now();
  const localDeadlineAt = Math.min(
    deadlineAt,
    startedAt + MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_CHEAP_UPPER_TIMEBOX_MS,
  );
  const pairSlotIndices = candidatesBySlot
    .map((_, index) => index)
    .filter((index) => index !== anchorSlotIndex) as [number, number];
  const leftSlotIndex = pairSlotIndices[0];
  const rightSlotIndex = pairSlotIndices[1];
  const anchorCandidates = [...candidatesBySlot[anchorSlotIndex]];
  const leftCandidates = [...candidatesBySlot[leftSlotIndex]];
  const rightCandidates = [...candidatesBySlot[rightSlotIndex]];
  sortMedleyCandidates(anchorCandidates);
  sortMedleyCandidates(leftCandidates);
  sortMedleyCandidates(rightCandidates);
  const leftAvailabilityQuery = buildMedleyExactCandidateSlotAvailabilityQuery(leftCandidates);
  const rightAvailabilityQuery = buildMedleyExactCandidateSlotAvailabilityQuery(rightCandidates);
  const maxAnchorCount = Math.min(
    anchorCandidates.length,
    MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_CHEAP_UPPER_MAX_ANCHORS,
  );
  const leftPeekUpperBound = generators[leftSlotIndex].peekUpperBound();
  const rightPeekUpperBound = generators[rightSlotIndex].peekUpperBound();
  const anchorPeekUpperBound = generators[anchorSlotIndex].peekUpperBound();
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
  let processedUpperMaxLeftGeneratedCandidate: MedleyTeamCandidate | null = null;
  let processedUpperMaxRightGeneratedCandidate: MedleyTeamCandidate | null = null;
  const processedAnchorUpperEntries: Array<{
    anchorCandidate: MedleyTeamCandidate;
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
  const refinedAnchorPairUpperByCandidate = new WeakMap<MedleyTeamCandidate, {
    pairUpper: number;
    source: string;
    generatedPairUpper: number;
  }>();
  let splitAttemptCount = 0;
  let splitStateCount = 0;
  let splitAbortReason: string | null = null;

  profiling.exactCandidateJoinAnchorFrontierCheapUpperCount += 1;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSlotIndex = anchorSlotIndex;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedAnchorCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperResidualUpperBound = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperResidualGap = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperElapsedMs = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperTimeboxMs = (
    MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_CHEAP_UPPER_TIMEBOX_MS
  );
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperOtherSlotCandidateCounts = pairSlotIndices.map(
    (slotIndex) => candidatesBySlot[slotIndex].length,
  );
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPeakHeapMiB = stats.peakUsedHeapMiB;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxSource = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxAnchorScore = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxPairUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxLeftUnseenUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxRightUnseenUpper = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairOverlaps = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairScoreOnly = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairFullScore = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairScoreSlack = null;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSplitAttemptCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSplitStateCount = 0;
  profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSplitAbortReason = null;

  const finiteScore = (score: number): number => (
    Number.isFinite(score) ? score : Number.NEGATIVE_INFINITY
  );
  const combineScores = (leftScore: number, rightScore: number): number => (
    Number.isFinite(leftScore) && Number.isFinite(rightScore)
      ? leftScore + rightScore
      : Number.NEGATIVE_INFINITY
  );
  const estimatePairUpperForAnchor = (anchorCandidate: MedleyTeamCandidate): {
    upperBound: number;
    source: string;
    generatedPairUpper: number;
    leftUnseenUpper: number;
    rightUnseenUpper: number;
    leftGeneratedCandidate: MedleyTeamCandidate | null;
    rightGeneratedCandidate: MedleyTeamCandidate | null;
  } => {
    const anchorCardIds = getMedleyTeamCandidateCardIds(anchorCandidate);
    const leftGeneratedCandidate = findBestAvailableMedleyExactCandidateExcludingCardIds(
      leftAvailabilityQuery,
      anchorCardIds,
    );
    const rightGeneratedCandidate = findBestAvailableMedleyExactCandidateExcludingCardIds(
      rightAvailabilityQuery,
      anchorCardIds,
    );
    const leftGeneratedScore = finiteScore(leftGeneratedCandidate?.result.score ?? Number.NEGATIVE_INFINITY);
    const rightGeneratedScore = finiteScore(rightGeneratedCandidate?.result.score ?? Number.NEGATIVE_INFINITY);
    const leftBestPossible = Math.max(leftGeneratedScore, finiteScore(leftPeekUpperBound));
    const rightBestPossible = Math.max(rightGeneratedScore, finiteScore(rightPeekUpperBound));
    const generatedPairUpper = combineScores(leftGeneratedScore, rightGeneratedScore);
    const leftUnseenUpper = combineScores(finiteScore(leftPeekUpperBound), rightBestPossible);
    const rightUnseenUpper = combineScores(finiteScore(rightPeekUpperBound), leftBestPossible);
    const upperBound = Math.max(generatedPairUpper, leftUnseenUpper, rightUnseenUpper);
    const source = upperBound === generatedPairUpper
      ? "generated-pair"
      : upperBound === leftUnseenUpper
        ? "left-unseen"
        : "right-unseen";
    return {
      upperBound,
      source,
      generatedPairUpper,
      leftUnseenUpper,
      rightUnseenUpper,
      leftGeneratedCandidate,
      rightGeneratedCandidate,
    };
  };
  const getResidualUpperBound = (nextAnchorScore: number | null): number | null => {
    const unprocessedAnchorUpperBound = Math.max(
      nextAnchorScore ?? Number.NEGATIVE_INFINITY,
      finiteScore(anchorPeekUpperBound),
    );
    const unprocessedUpperBound = Number.isFinite(unprocessedAnchorUpperBound) && Number.isFinite(pairUpperBound)
      ? unprocessedAnchorUpperBound + pairUpperBound
      : Number.NEGATIVE_INFINITY;
    const residualUpperBound = Math.max(processedUpperMax, unprocessedUpperBound);
    return Number.isFinite(residualUpperBound) ? residualUpperBound : null;
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
      processedUpperMaxLeftGeneratedCandidate = leftGeneratedCandidate;
      processedUpperMaxRightGeneratedCandidate = rightGeneratedCandidate;
    }
  };
  const refineProcessedAnchorUpperEntries = (): boolean => {
    if (processedAnchorUpperEntries.length === 0) {
      return false;
    }
    const sortedEntries = [...processedAnchorUpperEntries].sort((left, right) => right.totalUpper - left.totalUpper);
    let newRefineCount = 0;
    processedUpperMax = Number.NEGATIVE_INFINITY;
    processedUpperMaxSource = null;
    processedUpperMaxAnchorScore = null;
    processedUpperMaxPairUpper = null;
    processedUpperMaxGeneratedPairUpper = null;
    processedUpperMaxLeftUnseenUpper = null;
    processedUpperMaxRightUnseenUpper = null;
    processedUpperMaxLeftGeneratedCandidate = null;
    processedUpperMaxRightGeneratedCandidate = null;

    for (let index = 0; index < sortedEntries.length; index += 1) {
      const entry = sortedEntries[index];
      if (entry.source !== "generated-pair") {
        recordProcessedUpperMax(
          entry.anchorScore,
          entry.pairUpper,
          entry.source,
          entry.generatedPairUpper,
          entry.leftUnseenUpper,
          entry.rightUnseenUpper,
          entry.leftGeneratedCandidate,
          entry.rightGeneratedCandidate,
        );
        continue;
      }

      let refined = refinedAnchorPairUpperByCandidate.get(entry.anchorCandidate);
      if (!refined && newRefineCount >= MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_CHEAP_UPPER_REFINE_TOP_ANCHORS) {
        recordProcessedUpperMax(
          entry.anchorScore,
          entry.pairUpper,
          entry.source,
          entry.generatedPairUpper,
          entry.leftUnseenUpper,
          entry.rightUnseenUpper,
          entry.leftGeneratedCandidate,
          entry.rightGeneratedCandidate,
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
            );
          }
          return true;
        }
        const splitUpper = estimateGeneratedMedleyExactCandidatePairConflictSplitUpper(
          leftAvailabilityQuery,
          rightAvailabilityQuery,
          getMedleyTeamCandidateCardIds(entry.anchorCandidate),
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
            );
          }
          return true;
        }
        const generatedPairUpper = splitUpper.upperBound;
        const pairUpper = Math.max(generatedPairUpper, entry.leftUnseenUpper, entry.rightUnseenUpper);
        const source = pairUpper === generatedPairUpper
          ? "generated-pair-split"
          : pairUpper === entry.leftUnseenUpper
            ? "left-unseen"
            : "right-unseen";
        refined = {
          pairUpper,
          source,
          generatedPairUpper,
        };
        refinedAnchorPairUpperByCandidate.set(entry.anchorCandidate, refined);
        newRefineCount += 1;
      }
      if (refined) {
        recordProcessedUpperMax(
          entry.anchorScore,
          refined.pairUpper,
          refined.source,
          refined.generatedPairUpper,
          entry.leftUnseenUpper,
          entry.rightUnseenUpper,
          null,
          null,
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
          );
        }
        return true;
      }
    }
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSplitAttemptCount = splitAttemptCount;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSplitStateCount = splitStateCount;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSplitAbortReason = splitAbortReason;
    return false;
  };
  const finish = (
    localTimedOut: boolean,
    nextAnchorScore: number | null,
  ): MedleyExactCandidateAnchorFrontierProofResult => {
    const refineTimedOut = refineProcessedAnchorUpperEntries();
    const elapsedMs = performance.now() - startedAt;
    const observedUpperBound = getResidualUpperBound(nextAnchorScore);
    if (localTimedOut || refineTimedOut) {
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
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxAnchorScore = processedUpperMaxAnchorScore;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxPairUpper = processedUpperMaxPairUpper;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairUpper = processedUpperMaxGeneratedPairUpper;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxLeftUnseenUpper = processedUpperMaxLeftUnseenUpper;
    profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxRightUnseenUpper = processedUpperMaxRightUnseenUpper;
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
      proved: observedUpperBound !== null && observedUpperBound <= incumbentScore,
      localTimedOut: localTimedOut || refineTimedOut,
      result: null,
      observedUpperBound,
      processedAnchorCount,
      residualUpperBound: observedUpperBound,
      elapsedMs,
    };
  };

  for (let anchorIndex = 0; anchorIndex < maxAnchorCount; anchorIndex += 1) {
    const anchorCandidate = anchorCandidates[anchorIndex];
    if (performance.now() >= localDeadlineAt) {
      return finish(true, anchorCandidate.result.score);
    }
    if (
      Number.isFinite(processedUpperMax)
      && Number.isFinite(pairUpperBound)
      && anchorCandidate.result.score + pairUpperBound <= processedUpperMax
    ) {
      const refineTimedOut = refineProcessedAnchorUpperEntries();
      if (refineTimedOut) {
        return finish(true, anchorCandidate.result.score);
      }
      if (anchorCandidate.result.score + pairUpperBound > processedUpperMax) {
        continue;
      }
      return finish(false, anchorCandidate.result.score);
    }
    const pairUpperForAnchor = estimatePairUpperForAnchor(anchorCandidate);
    processedAnchorCount += 1;
    if (Number.isFinite(pairUpperForAnchor.upperBound)) {
      const anchorUpper = anchorCandidate.result.score + pairUpperForAnchor.upperBound;
      processedAnchorUpperEntries.push({
        anchorCandidate,
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
      );
    }
  }

  return finish(false, anchorCandidates[processedAnchorCount]?.result.score ?? null);
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
    enableLowMemoryInitialCandidateSync?: boolean;
    lowMemoryInitialCandidateSyncLocalAbortOnly?: boolean;
    lowMemoryInitialCandidateSyncLightUpper?: boolean;
    lowMemoryInitialCandidateSyncTimeboxMs?: number;
    shouldAbortLowMemoryInitialCandidateSync?: () => boolean;
    enableLowMemoryInitialCandidateScoreCalculationCachePressureFallback?: boolean;
    lowMemoryInitialCandidateScoreCalculationCachePressureSlotCardCount?: number | null;
    lowMemoryHighPairScanMinRecordCount?: number | null;
    lowMemoryHighPairPrefixRecordLimit?: number | null;
    debugExactCandidateJoinMemoryAttribution?: boolean;
    debugExactCandidateRawMirror?: boolean;
    debugExactCandidateRawJoinParity?: boolean;
    debugExactCandidateSignatureCensus?: boolean;
    debugExactCandidateUpperReplay?: boolean;
    debugExactCandidatePrefixUpperReplay?: boolean;
    debugExactCandidatePrefixHardUpperReplay?: boolean;
    debugExactCandidatePrefixOtherUpperSourceReplay?: boolean;
    debugExactCandidatePrefixOtherUpperSourceReplayMaxChecks?: number;
    debugExactCandidatePrefixOtherUpperSourceReplayMaxMargin?: number;
    debugExactCandidatePrefixCapacityBatchReplay?: boolean;
    debugExactCandidatePrefixCapacityLevel3Replay?: boolean;
    enableExactCandidateCapacitySourceLeafPruning?: boolean;
    debugExactCandidateDominanceReplay?: boolean;
    debugExactCandidateRawSolverInputCensus?: boolean;
    exactCandidateScoreCalculationCacheEntryLimit?: number | null;
    enableExactCandidateScoreCalculationCachePressureFallback?: boolean;
    exactCandidateScoreCalculationCachePressureSlotCardCount?: number | null;
    enableExactCandidateScoreOnlyCachePressureFallback?: boolean;
    exactCandidateScoreOnlyCachePressureSlotCardCount?: number | null;
    disableExactCandidateCardsRetention?: boolean;
    enableExactCandidateCompactScoreOnlyCache?: boolean;
    disableExactCandidateGlobalComplementCache?: boolean;
    enableExactCandidateCompactGlobalComplementCache?: boolean;
    enableExactCandidateThinResultRetention?: boolean;
    enableExactCandidateCompactCandidateKeySet?: boolean;
    disableExactCandidateSkillWindowContributionCache?: boolean;
    disableExactCandidateScoreCalculationCache?: boolean;
    disableExactCandidateScoreOnlyCache?: boolean;
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
  const maxSlotSearchCardCount = Math.max(...slots.map((slot) => slot.searchCards.length));
  const scoreCalculationCachePressureSlotCardCount = (
    context.exactCandidateScoreCalculationCachePressureSlotCardCount !== null
    && context.exactCandidateScoreCalculationCachePressureSlotCardCount !== undefined
    && Number.isFinite(context.exactCandidateScoreCalculationCachePressureSlotCardCount)
    && context.exactCandidateScoreCalculationCachePressureSlotCardCount > 0
      ? Math.trunc(context.exactCandidateScoreCalculationCachePressureSlotCardCount)
      : MEDLEY_EXACT_CANDIDATE_SCORE_CALC_CACHE_PRESSURE_SLOT_CARD_COUNT
  );
  const disableScoreCalculationCacheByPressure = (
    context.enableExactCandidateScoreCalculationCachePressureFallback === true
    && maxSlotSearchCardCount >= scoreCalculationCachePressureSlotCardCount
  );
  const initialCandidateScoreCalculationCachePressureSlotCardCount = (
    context.lowMemoryInitialCandidateScoreCalculationCachePressureSlotCardCount !== null
    && context.lowMemoryInitialCandidateScoreCalculationCachePressureSlotCardCount !== undefined
    && Number.isFinite(context.lowMemoryInitialCandidateScoreCalculationCachePressureSlotCardCount)
    && context.lowMemoryInitialCandidateScoreCalculationCachePressureSlotCardCount > 0
      ? Math.trunc(context.lowMemoryInitialCandidateScoreCalculationCachePressureSlotCardCount)
      : MEDLEY_EXACT_INITIAL_CANDIDATE_SCORE_CALC_CACHE_PRESSURE_SLOT_CARD_COUNT
  );
  const disableInitialCandidateScoreCalculationCacheByPressure = (
    context.enableLowMemoryInitialCandidateScoreCalculationCachePressureFallback === true
    && maxSlotSearchCardCount >= initialCandidateScoreCalculationCachePressureSlotCardCount
  );
  const disableExactCandidateScoreCalculationCacheEffective = (
    context.disableExactCandidateScoreCalculationCache === true
    || disableScoreCalculationCacheByPressure
  );
  const scoreOnlyCachePressureSlotCardCount = (
    context.exactCandidateScoreOnlyCachePressureSlotCardCount !== null
    && context.exactCandidateScoreOnlyCachePressureSlotCardCount !== undefined
    && Number.isFinite(context.exactCandidateScoreOnlyCachePressureSlotCardCount)
    && context.exactCandidateScoreOnlyCachePressureSlotCardCount > 0
      ? Math.trunc(context.exactCandidateScoreOnlyCachePressureSlotCardCount)
      : MEDLEY_EXACT_CANDIDATE_SCORE_CALC_CACHE_PRESSURE_SLOT_CARD_COUNT
  );
  const disableScoreOnlyCacheByPressure = (
    context.enableExactCandidateScoreOnlyCachePressureFallback === true
    && maxSlotSearchCardCount >= scoreOnlyCachePressureSlotCardCount
  );
  const disableExactCandidateScoreOnlyCacheEffective = (
    context.disableExactCandidateScoreOnlyCache === true
    || disableScoreOnlyCacheByPressure
  );
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
    context.lowMemoryHighPairScanMinRecordCount ?? null,
    context.lowMemoryHighPairPrefixRecordLimit ?? null,
    context.exactCandidateScoreCalculationCacheEntryLimit ?? null,
    context.disableExactCandidateSkillWindowContributionCache === true,
    disableExactCandidateScoreCalculationCacheEffective,
    disableExactCandidateScoreOnlyCacheEffective,
    context.disableExactCandidateCardsRetention === true,
    context.enableExactCandidateCompactScoreOnlyCache === true,
    context.disableExactCandidateGlobalComplementCache === true,
    context.enableExactCandidateCompactGlobalComplementCache === true,
    context.enableExactCandidateThinResultRetention === true,
    context.debugExactCandidatePrefixUpperReplay === true,
    context.debugExactCandidatePrefixHardUpperReplay === true,
    context.debugExactCandidatePrefixOtherUpperSourceReplay === true,
    context.debugExactCandidatePrefixCapacityBatchReplay === true,
    context.debugExactCandidatePrefixCapacityLevel3Replay === true,
    context.enableExactCandidateCapacitySourceLeafPruning === true,
    context.debugExactCandidatePrefixOtherUpperSourceReplayMaxChecks,
    context.debugExactCandidatePrefixOtherUpperSourceReplayMaxMargin,
  ));
  const candidatesBySlot: MedleyTeamCandidate[][] = Array.from({ length: slots.length }, () => []);
  const rawCandidateMirror = context.debugExactCandidateRawMirror === true
    ? createMedleyExactRawCandidateMirror(slots.length)
    : null;
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
  };
  const recordPrefixUpperReplaySummary = (): void => {
    if (
      context.debugExactCandidatePrefixUpperReplay !== true
      && context.debugExactCandidatePrefixHardUpperReplay !== true
      && context.debugExactCandidatePrefixOtherUpperSourceReplay !== true
    ) {
      return;
    }
    const uniqueGenerators = [...new Set([...generators, ...candidateFillGenerators])];
    const summary = summarizeMedleyExactPrefixUpperReplayGenerators(uniqueGenerators);
    profiling.exactCandidateJoinPrefixUpperReplaySummary = mergeMedleyExactPrefixUpperReplaySummaries(
      profiling.exactCandidateJoinPrefixUpperReplaySummary,
      summary,
    );
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
  const buildUnprovedExactCandidateJoinResult = (
    result: BandoriMedleyTeamSearchResult | null = null,
    observedUpperBound: number | null = getObservedExactCandidateJoinUpperBound(),
  ): MedleyExactCandidateJoinResult => {
    recordPrefixUpperReplaySummary();
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
    recordPrefixUpperReplaySummary();
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
  const maybeProveAnchorFrontier = (
    slotIndex: number,
    peekUpperBound: number,
    otherUpper: number,
  ): MedleyExactCandidateAnchorFrontierProofResult | null => {
    if (didAnchorFrontierProof || stats.memoryLimited || calculatedCardCount > (
      MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_CARD_COUNT
    )) {
      return null;
    }
    const anchorCandidateCount = candidatesBySlot[slotIndex]?.length ?? 0;
    if (
      anchorCandidateCount <= 0
      || anchorCandidateCount > MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_ANCHOR_CANDIDATES
      || !Number.isFinite(peekUpperBound)
      || !Number.isFinite(otherUpper)
    ) {
      return null;
    }
    const otherSlotCandidateCounts = candidatesBySlot
      .map((candidates, index) => (index === slotIndex ? 0 : candidates.length))
      .filter((count) => count > 0);
    if (
      otherSlotCandidateCounts.length !== slots.length - 1
      || otherSlotCandidateCounts.some(
        (count) => count > MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_OTHER_SLOT_CANDIDATES,
      )
      || otherSlotCandidateCounts.reduce((sum, count) => sum + count, 0)
        > MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_OTHER_SLOT_CANDIDATE_TOTAL
    ) {
      return null;
    }
    const frontierGap = peekUpperBound + otherUpper - incumbentScore;
    if (
      !Number.isFinite(frontierGap)
      || frontierGap < 0
      || frontierGap > MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_FRONTIER_GAP
    ) {
      return null;
    }
    const remainingMs = getGuardedExtensionRemainingMs();
    if (remainingMs < MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MIN_REMAINING_MS) {
      return null;
    }
    let cheapUpperResult: MedleyExactCandidateAnchorFrontierProofResult | null = null;
    if (!didAnchorFrontierCheapUpper) {
      didAnchorFrontierCheapUpper = true;
      const candidateCheapUpperResult = estimateMedleyExactCandidateAnchorFrontierCheapUpper(
        slots,
        candidatesBySlot,
        activeGeneratorsBySlot,
        slotIndex,
        otherUpper,
        configuration,
        incumbentScore,
        server,
        perfectRate,
        profiling,
        stats,
        deadlineAt,
      );
      if (candidateCheapUpperResult.proved) {
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
    const highPairRecordUpperCount = estimateHighMedleyExactCandidatePairRecordUpperCount(
      sortedLeftCandidates,
      sortedRightCandidates,
      incumbentScore - anchorMaxScore,
      MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_HIGH_PAIR_RECORDS,
    );
    profiling.exactCandidateJoinLastAnchorFrontierProofHighPairRecordUpperCount = highPairRecordUpperCount;
    if (highPairRecordUpperCount > MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_HIGH_PAIR_RECORDS) {
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
    return proveMedleyExactCandidateAnchorFrontier(
      slots,
      candidatesBySlot,
      activeGeneratorsBySlot,
      slotIndex,
      otherUpper,
      configuration,
      incumbentScore,
      server,
      perfectRate,
      MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_OTHER_SLOT_CANDIDATES,
      profiling,
      stats,
      isPastDeadline,
      deadlineAt,
    );
  };

  const initialCandidateStartedAt = performance.now();
  for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
    const slotInitialCandidateStartedAt = performance.now();
    let topCandidate: MedleyTeamCandidate | null = null;
    if (context.enableLowMemoryInitialCandidateSync !== true) {
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
        context.lowMemoryInitialCandidateSyncLightUpper !== true,
        disableInitialCandidateScoreCalculationCacheByPressure,
      );
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
      } else if (lowMemoryTopCandidate.score !== null) {
        topCandidate = generators[slotIndex].next(lowMemoryTopCandidate.score);
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
    context.exactCandidateScoreCalculationCacheEntryLimit ?? null,
    context.disableExactCandidateSkillWindowContributionCache === true,
    disableExactCandidateScoreCalculationCacheEffective,
    disableExactCandidateScoreOnlyCacheEffective,
    context.disableExactCandidateCardsRetention === true,
    context.enableExactCandidateCompactScoreOnlyCache === true,
    context.disableExactCandidateGlobalComplementCache === true,
    context.enableExactCandidateCompactGlobalComplementCache === true,
    context.enableExactCandidateThinResultRetention === true,
    context.debugExactCandidatePrefixUpperReplay === true,
    context.debugExactCandidatePrefixHardUpperReplay === true,
    context.debugExactCandidatePrefixOtherUpperSourceReplay === true,
    context.debugExactCandidatePrefixCapacityBatchReplay === true,
    context.debugExactCandidatePrefixCapacityLevel3Replay === true,
    context.enableExactCandidateCapacitySourceLeafPruning === true,
    context.debugExactCandidatePrefixOtherUpperSourceReplayMaxChecks,
    context.debugExactCandidatePrefixOtherUpperSourceReplayMaxMargin,
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
  const shouldUseCompactCandidateKeySet = context.enableExactCandidateCompactCandidateKeySet === true;
  const candidateKeysBySlot = candidatesBySlot.map((candidates) => (
    createMedleyExactCandidateCardKeySet(candidates, shouldUseCompactCandidateKeySet)
  ));
  const rebuildCandidateKeys = (...slotIndices: number[]): void => {
    for (const slotIndex of slotIndices) {
      candidateKeysBySlot[slotIndex] = createMedleyExactCandidateCardKeySet(
        candidatesBySlot[slotIndex],
        shouldUseCompactCandidateKeySet,
      );
    }
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
    const candidateKeyCountsBySlot = candidateKeysBySlot.map((keys) => keys.size);
    const candidateKeySetBytesBySlot = candidateKeysBySlot.map(estimateMedleyExactCandidateCardKeySetBytes);
    const candidateKeySetMiBBySlot = candidateKeySetBytesBySlot.map((bytes) => (
      bytes === null ? null : roundMiB(bytes)
    ));
    const candidateKeySetBytesTotal = candidateKeySetBytesBySlot.reduce<number>((sum, bytes) => (
      sum + (bytes ?? 0)
    ), 0);
    const candidateKeySetMiBTotal = candidateKeySetBytesBySlot.some((bytes) => bytes !== null)
      ? roundMiB(candidateKeySetBytesTotal)
      : null;
    const rawCandidateMirrorProfile = rawCandidateMirror
      ? (() => {
        rebuildMedleyExactRawCandidateMirror(rawCandidateMirror, candidatesBySlot);
        return getMedleyExactRawCandidateMirrorProfile(rawCandidateMirror);
      })()
      : null;
    const signatureCensusProfile = context.debugExactCandidateSignatureCensus === true
      ? buildMedleyExactSignatureCensusProfile(slots, candidatesBySlot, candidateKeyCountsBySlot)
      : null;
    const upperReplayProfile = context.debugExactCandidateUpperReplay === true
      ? buildMedleyExactUpperReplayProfile(
        slots,
        candidatesBySlot,
        candidateCutoffsBySlot,
        candidateOtherUpperBySlot,
        exactJoinProofCutoffScore,
      )
      : null;
    const dominanceReplayProfile = context.debugExactCandidateDominanceReplay === true
      ? buildMedleyExactDominanceReplayProfile(slots, candidatesBySlot, candidateKeyCountsBySlot)
      : null;
    const rawSolverInputCensusProfile = context.debugExactCandidateRawSolverInputCensus === true
      ? buildMedleyExactRawSolverInputCensusProfile(slots, candidatesBySlot)
      : null;
    const scoreCacheProfile = buildMedleyExactScoreCacheProfile(slots);
    const scoreCalculationCacheMode = context.disableExactCandidateScoreCalculationCache === true
      ? "disabled"
      : disableScoreCalculationCacheByPressure
        ? "pressure-disabled"
      : context.disableExactCandidateSkillWindowContributionCache === true
        ? "skill-window-contribution-disabled"
        : context.exactCandidateScoreCalculationCacheEntryLimit !== null
          && context.exactCandidateScoreCalculationCacheEntryLimit !== undefined
          ? "bounded"
          : "enabled";
    profiling.exactCandidateJoinMemorySnapshots.push({
      phase,
      elapsedMs: Math.round(performance.now() - exactJoinStartedAt),
      peakUsedHeapMiB: stats.peakUsedHeapMiB,
      candidateCountsBySlot,
      candidateCountTotal: candidateCountsBySlot.reduce((sum, count) => sum + count, 0),
      candidateKeyCountsBySlot,
      candidateKeyCountTotal: candidateKeyCountsBySlot.reduce((sum, count) => sum + count, 0),
      candidateKeyRepresentation: candidateKeysBySlot[0]
        ? getMedleyExactCandidateCardKeySetRepresentation(candidateKeysBySlot[0])
        : shouldUseCompactCandidateKeySet ? "compact-packed-card-id" : "packed-card-id",
      candidateKeySetMiBBySlot,
      candidateKeySetMiBTotal,
      exactCandidateJoinPairCount: profiling.exactCandidateJoinPairCount,
      exactCandidateJoinPairComplementQueryCount: profiling.exactCandidateJoinPairComplementQueryCount,
      exactCandidateJoinPairComplementHighPairRecordCount: (
        profiling.exactCandidateJoinPairComplementHighPairRecordCount
      ),
      rawCandidateMirror: rawCandidateMirrorProfile,
      signatureCensus: signatureCensusProfile,
      upperReplay: upperReplayProfile,
      dominanceReplay: dominanceReplayProfile,
      rawSolverInputCensus: rawSolverInputCensusProfile,
      scoreCache: scoreCacheProfile,
      candidateCardsRetention: context.disableExactCandidateCardsRetention === true ? "disabled" : "enabled",
      candidateResultRetention: context.enableExactCandidateThinResultRetention === true ? "thin" : "full",
      scoreOnlyCacheRepresentation: context.enableExactCandidateCompactScoreOnlyCache === true ? "compact" : "result",
      scoreCalculationCache: scoreCalculationCacheMode,
      scoreCalculationCacheEntryLimit: context.exactCandidateScoreCalculationCacheEntryLimit ?? null,
      scoreCalculationCachePressureFallback: (
        context.enableExactCandidateScoreCalculationCachePressureFallback === true
      ),
      scoreCalculationCachePressureFallbackTriggered: disableScoreCalculationCacheByPressure,
      scoreCalculationCachePressureSlotCardCount: scoreCalculationCachePressureSlotCardCount,
      scoreCalculationCachePressureMaxSlotCardCount: maxSlotSearchCardCount,
      initialCandidateScoreCalculationCachePressureFallback: (
        context.enableLowMemoryInitialCandidateScoreCalculationCachePressureFallback === true
      ),
      initialCandidateScoreCalculationCachePressureFallbackTriggered: (
        disableInitialCandidateScoreCalculationCacheByPressure
      ),
      initialCandidateScoreCalculationCachePressureSlotCardCount: (
        initialCandidateScoreCalculationCachePressureSlotCardCount
      ),
      initialCandidateScoreCalculationCachePressureMaxSlotCardCount: maxSlotSearchCardCount,
      scoreOnlyEvaluationCache: context.disableExactCandidateScoreOnlyCache === true
        ? "disabled"
        : disableScoreOnlyCacheByPressure
          ? "pressure-disabled"
          : "enabled",
      scoreOnlyCachePressureFallback: context.enableExactCandidateScoreOnlyCachePressureFallback === true,
      scoreOnlyCachePressureFallbackTriggered: disableScoreOnlyCacheByPressure,
      scoreOnlyCachePressureSlotCardCount: scoreOnlyCachePressureSlotCardCount,
      scoreOnlyCachePressureMaxSlotCardCount: maxSlotSearchCardCount,
      generatorProfiles,
      ...extra,
    });
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
        recordExactJoinMemorySnapshot(stats.memoryLimited ? "candidate-fill-memory-limit" : "candidate-fill-deadline", {
          slotIndex,
        });
        return buildUnprovedExactCandidateJoinResult();
      }
      if (candidatesBySlot[slotIndex].length >= effectiveCandidateSoftLimit) {
        if (maybeExtendCandidateSoftLimit(slotIndex, cutoff, generator.peekUpperBound())) {
          continue;
        }
        const anchorFrontierProof = maybeProveAnchorFrontier(
          slotIndex,
          generator.peekUpperBound(),
          otherUpper,
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
          peekUpperBound: generator.peekUpperBound(),
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
        recordExactJoinMemorySnapshot("candidate-fill-generator-aborted", { slotIndex });
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

  if (
    rawCandidateMirror
    || context.debugExactCandidateRawJoinParity === true
    || context.debugExactCandidateSignatureCensus === true
    || context.debugExactCandidateUpperReplay === true
    || context.debugExactCandidateDominanceReplay === true
    || context.debugExactCandidateRawSolverInputCensus === true
  ) {
    recordExactJoinMemorySnapshot("after-candidate-fill");
  }
  candidatesBySlot.forEach(sortMedleyCandidates);
  maybeSeedFromExactJoinPrefix();
  if (stats.timedOut) {
    recordExactJoinMemorySnapshot("after-prefix-seed-timeout");
    return buildUnprovedExactCandidateJoinResult();
  }
  if (profiling.exactCandidateJoinDebugKnownCardIdsBySlot) {
    profiling.exactCandidateJoinDebugKnownCandidateCutoffsBySlot = candidateCutoffsBySlot;
    profiling.exactCandidateJoinDebugKnownCandidatePresentBySlot = [];
    profiling.exactCandidateJoinDebugKnownCandidateScoresBySlot = [];
    profiling.exactCandidateJoinDebugKnownCardIdsBySlot.forEach((knownCardIds, slotIndex) => {
      const knownKey = [...knownCardIds].sort((left, right) => left - right).join(",");
      const candidate = candidatesBySlot[slotIndex]?.find((currentCandidate) => (
        copyMedleyTeamCandidateCardIds(currentCandidate).sort((left, right) => left - right).join(",") === knownKey
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
    ? observedUpperBoundBeforeSolve - exactJoinProofCutoffScore
    : null;
  const remainingBeforeSolveMs = Number.isFinite(deadlineAt)
    ? deadlineAt - performance.now()
    : Number.POSITIVE_INFINITY;
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
  const { slotOrder } = getMedleyExactCandidateJoinSlotOrder(slots, candidatesBySlot);
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
  );
  profiling.exactCandidateJoinSolveElapsedMs += performance.now() - solveStartedAt;
  if (context.debugExactCandidateRawJoinParity === true && !joinResult.timedOut) {
    const rawIndexFinalJoinParity = runMedleyExactRawIndexFinalJoinParity(
      candidatesBySlot,
      slotOrder,
      joinResult.result?.score ?? null,
      exactJoinProofCutoffScore,
      deadlineAt,
      isPastDeadline,
    );
    recordExactJoinMemorySnapshot("raw-index-final-join-parity", {
      solveCandidateCounts,
      rawIndexFinalJoinParity,
    });
  }
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
