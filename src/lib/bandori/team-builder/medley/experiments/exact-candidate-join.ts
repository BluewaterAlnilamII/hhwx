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
  MEDLEY_EXACT_RAW_CANDIDATE_MIRROR_MAX_CANDIDATE_TOTAL,
  MEDLEY_EXACT_RAW_CANDIDATE_MIRROR_MAX_SLOT_CARD_COUNT,
  appendMedleyExactRawCandidateMirror,
  createMedleyExactRawCandidateMirror,
  copyMedleyExactRawCandidateCardIds,
  copyMedleyExactRawCandidateCardSearchIndices,
  getMedleyExactRawCandidateCardIdAt,
  getMedleyExactRawCandidateCardSearchIndexAt,
  getMedleyExactRawCandidateMirrorProfile,
  getMedleyExactRawCandidateScore,
  getMedleyExactRawCandidateSlotBytes,
  getMedleyExactRawCandidateSourceIndex,
  rebuildMedleyExactRawCandidateMirrorFromCandidates,
} from "./exact-candidate-raw-builder";
import type { MedleyExactRawCandidateSlotView } from "./exact-candidate-raw-builder";
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
import { getCardInstanceKeys } from "@/lib/bandori/team-builder/core/card-identity";
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
  MedleyExactRawCandidateSlotLike,
  MedleyExactConstrainedSlotPeekUpperResult,
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
const MEDLEY_EXACT_RAW_RESULT_PARITY_MAX_CANDIDATE_TOTAL = 20_000;
const MEDLEY_EXACT_RAW_RESULT_PARITY_MIN_REMAINING_MS = 5_000;
const MEDLEY_EXACT_RAW_RESULT_PARITY_TIMEBOX_MS = 8_000;
const MEDLEY_EXACT_RAW_DIRECT_RESULT_HARNESS_MAX_CANDIDATE_TOTAL = 8_000;
const MEDLEY_EXACT_RAW_DIRECT_RESULT_HARNESS_MIN_REMAINING_MS = 10_000;
const MEDLEY_EXACT_RAW_DIRECT_RESULT_HARNESS_TIMEBOX_MS = 8_000;
const MEDLEY_EXACT_RAW_TIE_FRONTIER_TIMEBOX_MS = 3_000;
const MEDLEY_EXACT_RAW_TIE_FRONTIER_HYDRATE_LIMIT = 32;
const MEDLEY_EXACT_RAW_TIE_FRONTIER_SAMPLE_LIMIT = 8;
const MEDLEY_EXACT_RAW_ANCHOR_CHEAP_UPPER_REPLAY_MAX_CANDIDATE_TOTAL = 60_000;
const MEDLEY_EXACT_RAW_ANCHOR_CHEAP_UPPER_REPLAY_SAMPLE_LIMIT = 16;
const MEDLEY_EXACT_RAW_ANCHOR_FRONTIER_PROBE_MAX_CANDIDATE_TOTAL = 0;
const MEDLEY_EXACT_RAW_ANCHOR_FRONTIER_PROBE_MAX_ANCHORS = 50_000;
const MEDLEY_EXACT_RAW_ANCHOR_FRONTIER_PROBE_TIMEBOX_MS = 8_000;
const MEDLEY_EXACT_RAW_PAIR_FRONTIER_CENSUS_COUNT_STOP_AFTER = 5_000_000;
const MEDLEY_EXACT_RAW_PAIR_FRONTIER_CENSUS_EXACT_SCAN_LIMIT = 1_000_000;
const MEDLEY_EXACT_RAW_PAIR_FRONTIER_CENSUS_SAMPLE_SCAN_LIMIT = 100_000;
const MEDLEY_EXACT_RAW_PAIR_FRONTIER_CENSUS_DEEP_SCAN_LIMIT = 5_000_000;
const MEDLEY_EXACT_RAW_PAIR_FRONTIER_CENSUS_MAX_THRESHOLDS = 12;
const MEDLEY_EXACT_RAW_PAIR_PRICING_FRONTIER_POP_LIMIT = 5_000_000;
const MEDLEY_EXACT_RAW_PAIR_PRICING_FRONTIER_TIMEBOX_MS = 2_000;
const MEDLEY_EXACT_CANDIDATE_ADMISSION_PAIR_PROBE_POP_LIMIT = 2_000_000;
const MEDLEY_EXACT_CANDIDATE_ADMISSION_PAIR_PROBE_TIMEBOX_MS = 1_500;
const MEDLEY_EXACT_RAW_TRIPLE_CONFLICT_SPLIT_TIMEBOX_MS = 8_000;
const MEDLEY_EXACT_RAW_PAIR_WITNESS_COVER_TIMEBOX_MS = 3_000;
const MEDLEY_EXACT_RAW_PAIR_WITNESS_COVER_PAIR_SPLIT_STATE_BUDGET = 2_048;
const MEDLEY_EXACT_RAW_PAIR_WITNESS_COVER_MASK_SPLIT_LIMIT = 32;
const MEDLEY_EXACT_RAW_PAIR_WITNESS_COVER_COUNT_MASK_SPLIT_LIMIT = 128;
const MEDLEY_EXACT_RAW_PAIR_WITNESS_CONSTRAINED_PEEK_SAMPLE_LIMIT = 1;
const MEDLEY_EXACT_RAW_PAIR_WITNESS_CONSTRAINED_PEEK_TIMEBOX_MS = 1_000;
const MEDLEY_EXACT_RAW_PAIR_COMPLEMENT_PARITY_MAX_CANDIDATE_TOTAL = 60_000;
const MEDLEY_EXACT_RAW_PAIR_COMPLEMENT_PARITY_BANNED_SAMPLE_LIMIT = 4;
const MEDLEY_EXACT_RAW_PAIR_UPPER_SCAN_PARITY_MAX_CANDIDATE_TOTAL = 60_000;
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

type MedleyExactPrefixLevel3LookaheadReplaySample = {
  songIndex: number;
  level: number;
  selectedCardIds: number[];
  impliedCompletionCount: number;
  incumbent: number;
  prefixUpper: number;
  pairUnseenUpper: number | null;
  roughOtherUpper: number | null;
  childPrefixCount: number;
  finiteChildPrefixCount: number;
  maxChildCardIds: number[];
  maxChildSlotUpper: number;
  maxChildOtherUpper: number;
  maxChildBasicCapacityUpper: number | null;
  maxChildOtherUpperSource: "pair-unseen" | "basic-capacity" | "tie";
  maxChildTotalUpper: number;
  margin: number;
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
  level3LookaheadCheckedCount: number;
  level3LookaheadEligibleCount: number;
  level3LookaheadBudgetSkippedCount: number;
  level3LookaheadUnknownCount: number;
  level3LookaheadChildPrefixCount: number;
  level3LookaheadFiniteChildPrefixCount: number;
  level3LookaheadWouldSkipCount: number;
  level3LookaheadWouldSkipImpliedCompletionCount: number;
  level3LookaheadChildDecisionCount: number;
  level3LookaheadReplayViolationCount: number;
  level3LookaheadPrunedCount: number;
  level3LookaheadPrunedImpliedCompletionCount: number;
  level3LookaheadMarginMin: number | null;
  level3LookaheadMarginMax: number | null;
  level3LookaheadSamples: MedleyExactPrefixLevel3LookaheadReplaySample[];
  level4CheckedCount: number;
  level4EligibleCount: number;
  level4OverMarginSkippedCount: number;
  level4BudgetSkippedCount: number;
  level4BestSafeWouldSkipCount: number;
  level4BestSafeWouldSkipImpliedCompletionCount: number;
  level4BestSafeReplayViolationCount: number;
  prunedCount: number;
  prunedImpliedCompletionCount: number;
  prunedProofLedgerCount: number;
  prunedProofLedgerImpliedCompletionCount: number;
  prunedProofLedgerDroppedSampleCount: number;
  prunedProofLedgerMarginMin: number | null;
  prunedProofLedgerMarginMax: number | null;
  prunedProofLedgerPrefixUpperMin: number | null;
  prunedProofLedgerPrefixUpperMax: number | null;
  prunedProofLedgerOtherUpperMin: number | null;
  prunedProofLedgerOtherUpperMax: number | null;
  prunedProofLedgerTotalUpperMin: number | null;
  prunedProofLedgerTotalUpperMax: number | null;
  prunedProofLedgerSamples: MedleyExactPrefixOtherUpperSourceReplaySample[];
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

type MedleyExactPreMaterializationCensusLevelProfile = {
  level: number;
  branchVisitCount: number;
  duplicateCharacterRejectCount: number;
  leafBranchCount: number;
  prefixBranchCount: number;
  slotUpperCheckedCount: number;
  slotUpperFiniteCount: number;
  slotUpperRejectedCount: number;
  slotUpperRejectedImpliedCompletionCount: number;
  slotUpperPassedCount: number;
  globalUpperRejectedCount: number;
  candidateKeyRejectedCount: number;
  candidateEvaluationCount: number;
  candidateNullCount: number;
  candidateScoreRejectedCount: number;
  materializedCandidateCount: number;
  pushedPrefixNodeCount: number;
  pushedCandidateNodeCount: number;
};

type MedleyExactPreMaterializationCensusProfile = {
  algorithm: "hhwx-pre-materialization-census-v1";
  songIndex: number;
  searchCardCount: number;
  rootScoreUpperBound: number | null;
  baseScoreRatePerPower: number | null;
  expandedNodeCount: number;
  insufficientRemainingNodeRejectCount: number;
  sameCharacterDominanceReplayRejectCount: number;
  contributionDominanceReplayRejectCount: number;
  levels: MedleyExactPreMaterializationCensusLevelProfile[];
};

type MedleyExactPreMaterializationCensusSummary = {
  algorithm: "hhwx-pre-materialization-census-v1";
  configurationSummaryCount: number;
  generatorCount: number;
  expandedNodeCountTotal: number;
  insufficientRemainingNodeRejectCountTotal: number;
  sameCharacterDominanceReplayRejectCountTotal: number;
  contributionDominanceReplayRejectCountTotal: number;
  branchVisitCountTotal: number;
  duplicateCharacterRejectCountTotal: number;
  slotUpperCheckedCountTotal: number;
  slotUpperRejectedCountTotal: number;
  slotUpperRejectedImpliedCompletionCountTotal: number;
  globalUpperRejectedCountTotal: number;
  candidateKeyRejectedCountTotal: number;
  candidateEvaluationCountTotal: number;
  candidateNullCountTotal: number;
  candidateScoreRejectedCountTotal: number;
  materializedCandidateCountTotal: number;
  pushedPrefixNodeCountTotal: number;
  pushedCandidateNodeCountTotal: number;
  levels: MedleyExactPreMaterializationCensusLevelProfile[];
  latestGenerators: Array<Record<string, unknown>>;
};

function roundMiB(bytes: number): number {
  return Math.round((bytes / BYTES_PER_MIB) * 100) / 100;
}

function addCappedCount(left: number, right: number): number {
  const sum = left + right;
  return Number.isSafeInteger(sum) ? sum : Number.MAX_SAFE_INTEGER;
}

function createMedleyExactPreMaterializationCensusLevel(
  level: number,
): MedleyExactPreMaterializationCensusLevelProfile {
  return {
    level,
    branchVisitCount: 0,
    duplicateCharacterRejectCount: 0,
    leafBranchCount: 0,
    prefixBranchCount: 0,
    slotUpperCheckedCount: 0,
    slotUpperFiniteCount: 0,
    slotUpperRejectedCount: 0,
    slotUpperRejectedImpliedCompletionCount: 0,
    slotUpperPassedCount: 0,
    globalUpperRejectedCount: 0,
    candidateKeyRejectedCount: 0,
    candidateEvaluationCount: 0,
    candidateNullCount: 0,
    candidateScoreRejectedCount: 0,
    materializedCandidateCount: 0,
    pushedPrefixNodeCount: 0,
    pushedCandidateNodeCount: 0,
  };
}

function createMedleyExactPreMaterializationCensusProfile(
  slot: MedleySlotSearch,
): MedleyExactPreMaterializationCensusProfile {
  return {
    algorithm: "hhwx-pre-materialization-census-v1",
    songIndex: slot.songIndex,
    searchCardCount: slot.searchCards.length,
    rootScoreUpperBound: Number.isFinite(slot.rootScoreUpperBound) ? slot.rootScoreUpperBound : null,
    baseScoreRatePerPower: Number.isFinite(slot.baseScoreRatePerPower) ? slot.baseScoreRatePerPower : null,
    expandedNodeCount: 0,
    insufficientRemainingNodeRejectCount: 0,
    sameCharacterDominanceReplayRejectCount: 0,
    contributionDominanceReplayRejectCount: 0,
    levels: Array.from(
      { length: MEDLEY_TEAM_SIZE + 1 },
      (_, level) => createMedleyExactPreMaterializationCensusLevel(level),
    ),
  };
}

function getMedleyExactPreMaterializationCensusLevel(
  profile: MedleyExactPreMaterializationCensusProfile,
  level: number,
): MedleyExactPreMaterializationCensusLevelProfile {
  return profile.levels[Math.max(0, Math.min(MEDLEY_TEAM_SIZE, level))]
    ?? profile.levels[MEDLEY_TEAM_SIZE]!;
}

const MEDLEY_EXACT_PRE_MATERIALIZATION_CENSUS_LEVEL_SUM_FIELDS: Array<
  keyof Omit<MedleyExactPreMaterializationCensusLevelProfile, "level">
> = [
  "branchVisitCount",
  "duplicateCharacterRejectCount",
  "leafBranchCount",
  "prefixBranchCount",
  "slotUpperCheckedCount",
  "slotUpperFiniteCount",
  "slotUpperRejectedCount",
  "slotUpperRejectedImpliedCompletionCount",
  "slotUpperPassedCount",
  "globalUpperRejectedCount",
  "candidateKeyRejectedCount",
  "candidateEvaluationCount",
  "candidateNullCount",
  "candidateScoreRejectedCount",
  "materializedCandidateCount",
  "pushedPrefixNodeCount",
  "pushedCandidateNodeCount",
];

function addMedleyExactPreMaterializationCensusLevel(
  target: MedleyExactPreMaterializationCensusLevelProfile,
  source: MedleyExactPreMaterializationCensusLevelProfile,
): void {
  for (const field of MEDLEY_EXACT_PRE_MATERIALIZATION_CENSUS_LEVEL_SUM_FIELDS) {
    target[field] = addCappedCount(target[field], source[field]);
  }
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

function addMedleyExactPrefixLevel3LookaheadReplaySamples(
  target: MedleyExactPrefixLevel3LookaheadReplaySample[],
  source: MedleyExactPrefixLevel3LookaheadReplaySample[] | undefined,
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
    level3LookaheadCheckedCount: 0,
    level3LookaheadEligibleCount: 0,
    level3LookaheadBudgetSkippedCount: 0,
    level3LookaheadUnknownCount: 0,
    level3LookaheadChildPrefixCount: 0,
    level3LookaheadFiniteChildPrefixCount: 0,
    level3LookaheadWouldSkipCount: 0,
    level3LookaheadWouldSkipImpliedCompletionCount: 0,
    level3LookaheadChildDecisionCount: 0,
    level3LookaheadReplayViolationCount: 0,
    level3LookaheadPrunedCount: 0,
    level3LookaheadPrunedImpliedCompletionCount: 0,
    level3LookaheadMarginMin: null,
    level3LookaheadMarginMax: null,
    level3LookaheadSamples: [],
    level4CheckedCount: 0,
    level4EligibleCount: 0,
    level4OverMarginSkippedCount: 0,
    level4BudgetSkippedCount: 0,
    level4BestSafeWouldSkipCount: 0,
    level4BestSafeWouldSkipImpliedCompletionCount: 0,
    level4BestSafeReplayViolationCount: 0,
    prunedCount: 0,
    prunedImpliedCompletionCount: 0,
    prunedProofLedgerCount: 0,
    prunedProofLedgerImpliedCompletionCount: 0,
    prunedProofLedgerDroppedSampleCount: 0,
    prunedProofLedgerMarginMin: null,
    prunedProofLedgerMarginMax: null,
    prunedProofLedgerPrefixUpperMin: null,
    prunedProofLedgerPrefixUpperMax: null,
    prunedProofLedgerOtherUpperMin: null,
    prunedProofLedgerOtherUpperMax: null,
    prunedProofLedgerTotalUpperMin: null,
    prunedProofLedgerTotalUpperMax: null,
    prunedProofLedgerSamples: [],
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
  target.level3LookaheadCheckedCount = addCappedCount(
    target.level3LookaheadCheckedCount,
    source.level3LookaheadCheckedCount ?? 0,
  );
  target.level3LookaheadEligibleCount = addCappedCount(
    target.level3LookaheadEligibleCount,
    source.level3LookaheadEligibleCount ?? 0,
  );
  target.level3LookaheadBudgetSkippedCount = addCappedCount(
    target.level3LookaheadBudgetSkippedCount,
    source.level3LookaheadBudgetSkippedCount ?? 0,
  );
  target.level3LookaheadUnknownCount = addCappedCount(
    target.level3LookaheadUnknownCount,
    source.level3LookaheadUnknownCount ?? 0,
  );
  target.level3LookaheadChildPrefixCount = addCappedCount(
    target.level3LookaheadChildPrefixCount,
    source.level3LookaheadChildPrefixCount ?? 0,
  );
  target.level3LookaheadFiniteChildPrefixCount = addCappedCount(
    target.level3LookaheadFiniteChildPrefixCount,
    source.level3LookaheadFiniteChildPrefixCount ?? 0,
  );
  target.level3LookaheadWouldSkipCount = addCappedCount(
    target.level3LookaheadWouldSkipCount,
    source.level3LookaheadWouldSkipCount ?? 0,
  );
  target.level3LookaheadWouldSkipImpliedCompletionCount = addCappedCount(
    target.level3LookaheadWouldSkipImpliedCompletionCount,
    source.level3LookaheadWouldSkipImpliedCompletionCount ?? 0,
  );
  target.level3LookaheadChildDecisionCount = addCappedCount(
    target.level3LookaheadChildDecisionCount,
    source.level3LookaheadChildDecisionCount ?? 0,
  );
  target.level3LookaheadReplayViolationCount = addCappedCount(
    target.level3LookaheadReplayViolationCount,
    source.level3LookaheadReplayViolationCount ?? 0,
  );
  target.level3LookaheadPrunedCount = addCappedCount(
    target.level3LookaheadPrunedCount,
    source.level3LookaheadPrunedCount ?? 0,
  );
  target.level3LookaheadPrunedImpliedCompletionCount = addCappedCount(
    target.level3LookaheadPrunedImpliedCompletionCount,
    source.level3LookaheadPrunedImpliedCompletionCount ?? 0,
  );
  target.level3LookaheadMarginMin = minNullableNumber(
    target.level3LookaheadMarginMin,
    source.level3LookaheadMarginMin,
  );
  target.level3LookaheadMarginMax = maxNullableNumber(
    target.level3LookaheadMarginMax,
    source.level3LookaheadMarginMax,
  );
  addMedleyExactPrefixLevel3LookaheadReplaySamples(
    target.level3LookaheadSamples,
    source.level3LookaheadSamples,
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
  target.prunedProofLedgerCount = addCappedCount(
    target.prunedProofLedgerCount,
    source.prunedProofLedgerCount ?? 0,
  );
  target.prunedProofLedgerImpliedCompletionCount = addCappedCount(
    target.prunedProofLedgerImpliedCompletionCount,
    source.prunedProofLedgerImpliedCompletionCount ?? 0,
  );
  target.prunedProofLedgerDroppedSampleCount = addCappedCount(
    target.prunedProofLedgerDroppedSampleCount,
    source.prunedProofLedgerDroppedSampleCount ?? 0,
  );
  target.prunedProofLedgerMarginMin = minNullableNumber(
    target.prunedProofLedgerMarginMin,
    source.prunedProofLedgerMarginMin,
  );
  target.prunedProofLedgerMarginMax = maxNullableNumber(
    target.prunedProofLedgerMarginMax,
    source.prunedProofLedgerMarginMax,
  );
  target.prunedProofLedgerPrefixUpperMin = minNullableNumber(
    target.prunedProofLedgerPrefixUpperMin,
    source.prunedProofLedgerPrefixUpperMin,
  );
  target.prunedProofLedgerPrefixUpperMax = maxNullableNumber(
    target.prunedProofLedgerPrefixUpperMax,
    source.prunedProofLedgerPrefixUpperMax,
  );
  target.prunedProofLedgerOtherUpperMin = minNullableNumber(
    target.prunedProofLedgerOtherUpperMin,
    source.prunedProofLedgerOtherUpperMin,
  );
  target.prunedProofLedgerOtherUpperMax = maxNullableNumber(
    target.prunedProofLedgerOtherUpperMax,
    source.prunedProofLedgerOtherUpperMax,
  );
  target.prunedProofLedgerTotalUpperMin = minNullableNumber(
    target.prunedProofLedgerTotalUpperMin,
    source.prunedProofLedgerTotalUpperMin,
  );
  target.prunedProofLedgerTotalUpperMax = maxNullableNumber(
    target.prunedProofLedgerTotalUpperMax,
    source.prunedProofLedgerTotalUpperMax,
  );
  target.currentMarginMin = minNullableNumber(target.currentMarginMin, source.currentMarginMin);
  target.currentMarginMax = maxNullableNumber(target.currentMarginMax, source.currentMarginMax);
  target.bestSafeMarginMin = minNullableNumber(target.bestSafeMarginMin, source.bestSafeMarginMin);
  target.bestSafeMarginMax = maxNullableNumber(target.bestSafeMarginMax, source.bestSafeMarginMax);
  addMedleyExactPrefixMarginBucketCounts(target.currentMarginBuckets, source.currentMarginBuckets);
  addMedleyExactPrefixMarginBucketCounts(target.bestSafeMarginBuckets, source.bestSafeMarginBuckets);
  addMedleyExactPrefixOtherUpperSourceReplaySamples(target.samples, source.samples);
  addMedleyExactPrefixOtherUpperSourceReplaySamples(
    target.prunedProofLedgerSamples,
    source.prunedProofLedgerSamples,
  );
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
  summary.prunedProofLedgerDroppedSampleCount = Math.max(
    0,
    summary.prunedProofLedgerCount - summary.prunedProofLedgerSamples.length,
  );
  return summary;
}

function serializeMedleyExactPrefixOtherUpperSourceReplayProfile(
  profile: MedleyExactPrefixOtherUpperSourceReplayProfile | null | undefined,
  options: { includeBuckets: boolean; includeSamples: boolean },
): Record<string, unknown> | null {
  if (!profile) {
    return null;
  }
  const prunedProofLedgerRetainedSampleCount = profile.prunedProofLedgerSamples.length;
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
    level3LookaheadCheckedCount: profile.level3LookaheadCheckedCount,
    level3LookaheadEligibleCount: profile.level3LookaheadEligibleCount,
    level3LookaheadBudgetSkippedCount: profile.level3LookaheadBudgetSkippedCount,
    level3LookaheadUnknownCount: profile.level3LookaheadUnknownCount,
    level3LookaheadChildPrefixCount: profile.level3LookaheadChildPrefixCount,
    level3LookaheadFiniteChildPrefixCount: profile.level3LookaheadFiniteChildPrefixCount,
    level3LookaheadWouldSkipCount: profile.level3LookaheadWouldSkipCount,
    level3LookaheadWouldSkipImpliedCompletionCount: profile.level3LookaheadWouldSkipImpliedCompletionCount,
    level3LookaheadChildDecisionCount: profile.level3LookaheadChildDecisionCount,
    level3LookaheadReplayViolationCount: profile.level3LookaheadReplayViolationCount,
    level3LookaheadPrunedCount: profile.level3LookaheadPrunedCount,
    level3LookaheadPrunedImpliedCompletionCount: profile.level3LookaheadPrunedImpliedCompletionCount,
    level3LookaheadMarginMin: profile.level3LookaheadMarginMin,
    level3LookaheadMarginMax: profile.level3LookaheadMarginMax,
    level4CheckedCount: profile.level4CheckedCount,
    level4EligibleCount: profile.level4EligibleCount,
    level4OverMarginSkippedCount: profile.level4OverMarginSkippedCount,
    level4BudgetSkippedCount: profile.level4BudgetSkippedCount,
    level4BestSafeWouldSkipCount: profile.level4BestSafeWouldSkipCount,
    level4BestSafeWouldSkipImpliedCompletionCount: profile.level4BestSafeWouldSkipImpliedCompletionCount,
    level4BestSafeReplayViolationCount: profile.level4BestSafeReplayViolationCount,
    prunedCount: profile.prunedCount,
    prunedImpliedCompletionCount: profile.prunedImpliedCompletionCount,
    prunedProofLedgerCount: profile.prunedProofLedgerCount,
    prunedProofLedgerImpliedCompletionCount: profile.prunedProofLedgerImpliedCompletionCount,
    prunedProofLedgerDroppedSampleCount: Math.max(
      0,
      profile.prunedProofLedgerCount - prunedProofLedgerRetainedSampleCount,
    ),
    prunedProofLedgerSourceDroppedSampleCount: profile.prunedProofLedgerDroppedSampleCount,
    prunedProofLedgerRetainedSampleCount,
    prunedProofLedgerMarginMin: profile.prunedProofLedgerMarginMin,
    prunedProofLedgerMarginMax: profile.prunedProofLedgerMarginMax,
    prunedProofLedgerPrefixUpperMin: profile.prunedProofLedgerPrefixUpperMin,
    prunedProofLedgerPrefixUpperMax: profile.prunedProofLedgerPrefixUpperMax,
    prunedProofLedgerOtherUpperMin: profile.prunedProofLedgerOtherUpperMin,
    prunedProofLedgerOtherUpperMax: profile.prunedProofLedgerOtherUpperMax,
    prunedProofLedgerTotalUpperMin: profile.prunedProofLedgerTotalUpperMin,
    prunedProofLedgerTotalUpperMax: profile.prunedProofLedgerTotalUpperMax,
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
    result.level3LookaheadSamples = profile.level3LookaheadSamples.slice();
    result.prunedProofLedgerSamples = profile.prunedProofLedgerSamples.slice();
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

type MedleyExactRawCandidatePoolSlot = MedleyExactRawCandidateSlotView & {
  mismatchCount: number;
  scoreOrderViolationCount: number;
};

type MedleyExactRawCandidatePool = {
  slots: MedleyExactRawCandidatePoolSlot[];
  buildElapsedMs: number;
};

type MedleyExactRawCandidateSlotReadSource = {
  slots: MedleyExactRawCandidateSlotView[];
  source: string;
  retainedMiB: number | null;
  rawPoolRetainedMiB: number | null;
  lengthMismatchCount: number | null;
  mismatchCountTotal: number | null;
};

type MedleyExactRawPairFrontierThreshold = {
  name: string;
  threshold: number;
  reductionFromPairUpper: number | null;
  anchorIndex: number | null;
  anchorScore: number | null;
};

type MedleyExactRawJoinParitySlot = MedleyExactRawCandidateSlotView;

type MedleyExactCandidateJoinSlotOrder = {
  slotOrder: number[];
  shouldUseMiddleFirstJoinOrder: boolean;
};

type MedleyExactRawCandidateJoinSlotOrder = {
  slotOrder: number[];
};

type MedleyExactRawIndexFinalJoinSolveProfile = {
  enabled: true;
  skipped: boolean;
  skipReason?: string;
  candidateCountTotal: number;
  candidateCountsBySlot: number[];
  limit?: number;
  minRemainingMs?: number;
  slotOrder?: number[];
  rawInputSource?: string;
  rawBestScore?: number | null;
  rawBestAverageScore?: number | null;
  rawBestMaxScore?: number | null;
  rawBestMinScore?: number | null;
  bestIndices?: number[];
  bestSourceIndices?: number[];
  bestCardIdsBySlot?: number[][];
  pairCount?: number;
  thirdQueryCount?: number;
  elapsedMs?: number;
  retainedMiB?: number;
  rawSourceRetainedMiB?: number | null;
  rawPoolRetainedMiB?: number | null;
  rawSourceLengthMismatchCount?: number | null;
  rawSourceMismatchCountTotal?: number | null;
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
  const cardSearchIndexBytes = candidateCount * MEDLEY_TEAM_SIZE * Int32Array.BYTES_PER_ELEMENT;
  const sourceIndexBytes = candidateCount * Int32Array.BYTES_PER_ELEMENT;
  const rawRowBytes = scoreFieldBytes + cardIdBytes + cardSearchIndexBytes + sourceIndexBytes;
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
    cardSearchIndexBytes,
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
    fields: [
      "score",
      "averageScore",
      "maxScore",
      "minScore",
      "cardId0..4",
      "cardSearchIndex0..4",
      "sourceIndex",
    ],
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

function buildMedleyExactRawCandidatePoolSlot(
  candidates: readonly MedleyTeamCandidate[],
): MedleyExactRawCandidatePoolSlot {
  const length = candidates.length;
  const scores = new Int32Array(length);
  const averageScores = new Int32Array(length);
  const maxScores = new Int32Array(length);
  const minScores = new Int32Array(length);
  const sourceIndices = new Int32Array(length);
  const cardIds = new Int32Array(length * MEDLEY_TEAM_SIZE);
  const cardSearchIndices = new Int32Array(length * MEDLEY_TEAM_SIZE);
  let mismatchCount = 0;
  let scoreOrderViolationCount = 0;
  let previousScore = Number.POSITIVE_INFINITY;

  candidates.forEach((candidate, candidateIndex) => {
    const score = candidate.result.score;
    const averageScore = candidate.result.averageScore;
    const maxScore = candidate.result.maxScore;
    const minScore = candidate.result.minScore;
    scores[candidateIndex] = score;
    averageScores[candidateIndex] = averageScore;
    maxScores[candidateIndex] = maxScore;
    minScores[candidateIndex] = minScore;
    sourceIndices[candidateIndex] = candidateIndex;

    if (
      scores[candidateIndex] !== score
      || averageScores[candidateIndex] !== averageScore
      || maxScores[candidateIndex] !== maxScore
      || minScores[candidateIndex] !== minScore
      || sourceIndices[candidateIndex] !== candidateIndex
    ) {
      mismatchCount += 1;
    }
    if (score > previousScore) {
      scoreOrderViolationCount += 1;
    }
    previousScore = score;

    const baseCardIndex = candidateIndex * MEDLEY_TEAM_SIZE;
    for (let cardIndex = 0; cardIndex < MEDLEY_TEAM_SIZE; cardIndex += 1) {
      const cardId = getMedleyTeamCandidateCardIdAt(candidate, cardIndex) ?? -1;
      const cardSearchIndex = getMedleyExactCandidateCardSearchIndexAt(candidate, cardIndex);
      cardIds[baseCardIndex + cardIndex] = cardId;
      cardSearchIndices[baseCardIndex + cardIndex] = cardSearchIndex;
      if (
        cardIds[baseCardIndex + cardIndex] !== cardId
        || cardSearchIndices[baseCardIndex + cardIndex] !== cardSearchIndex
      ) {
        mismatchCount += 1;
      }
    }
  });

  return {
    scores,
    averageScores,
    maxScores,
    minScores,
    sourceIndices,
    cardIds,
    cardSearchIndices,
    length,
    mismatchCount,
    scoreOrderViolationCount,
  };
}

function getMedleyExactRawCandidatePoolSlotBytes(slot: MedleyExactRawCandidatePoolSlot): number {
  return getMedleyExactRawCandidateSlotBytes(slot);
}

function getMedleyExactRawCandidatePoolSlotProfile(
  slot: MedleyExactRawCandidatePoolSlot,
  slotIndex: number,
  songIndex: number,
): Record<string, unknown> {
  const retainedBytes = getMedleyExactRawCandidatePoolSlotBytes(slot);
  return {
    slotIndex,
    songIndex,
    candidateCount: slot.length,
    retainedBytes,
    retainedMiB: roundMiB(retainedBytes),
    scoreFieldBytes: slot.scores.byteLength,
    cardIdBytes: slot.cardIds.byteLength,
    cardSearchIndexBytes: slot.cardSearchIndices.byteLength,
    sourceIndexBytes: slot.sourceIndices.byteLength,
    firstScore: slot.length > 0 ? slot.scores[0] : null,
    lastScore: slot.length > 0 ? slot.scores[slot.length - 1] : null,
    firstAverageScore: slot.length > 0 ? slot.averageScores[0] : null,
    firstMaxScore: slot.length > 0 ? slot.maxScores[0] : null,
    mismatchCount: slot.mismatchCount,
    scoreOrderViolationCount: slot.scoreOrderViolationCount,
    bytesPerCandidate: slot.length > 0
      ? Math.round((retainedBytes / slot.length) * 100) / 100
      : 0,
  };
}

function buildMedleyExactRawCandidatePool(
  candidatesBySlot: readonly MedleyTeamCandidate[][],
): MedleyExactRawCandidatePool {
  const startedAt = performance.now();
  return {
    slots: candidatesBySlot.map(buildMedleyExactRawCandidatePoolSlot),
    buildElapsedMs: Math.round(performance.now() - startedAt),
  };
}

function getMedleyExactRawCandidatePoolProfile(
  slots: readonly MedleySlotSearch[],
  rawPool: MedleyExactRawCandidatePool,
  source: string,
): Record<string, unknown> {
  const slotProfiles = rawPool.slots.map((slot, slotIndex) => (
    getMedleyExactRawCandidatePoolSlotProfile(slot, slotIndex, slots[slotIndex]?.songIndex ?? slotIndex)
  ));
  const retainedBytesTotal = rawPool.slots.reduce(
    (sum, slot) => sum + getMedleyExactRawCandidatePoolSlotBytes(slot),
    0,
  );
  return {
    algorithm: "hhwx-raw-candidate-pool-profile-v1",
    enabled: true,
    behaviorChange: false,
    candidateRemoval: false,
    materializedOnly: true,
    source,
    representation: "typed-array-struct-of-arrays-plus-source-index",
    fields: [
      "score",
      "averageScore",
      "maxScore",
      "minScore",
      "sourceIndex",
      "cardId0..4",
      "cardSearchIndex0..4",
    ],
    candidateCountTotal: rawPool.slots.reduce((sum, slot) => sum + slot.length, 0),
    retainedBytesTotal,
    retainedMiBTotal: roundMiB(retainedBytesTotal),
    mismatchCountTotal: rawPool.slots.reduce((sum, slot) => sum + slot.mismatchCount, 0),
    scoreOrderViolationCountTotal: rawPool.slots.reduce((sum, slot) => sum + slot.scoreOrderViolationCount, 0),
    buildElapsedMs: rawPool.buildElapsedMs,
    slots: slotProfiles,
  };
}

function buildMedleyExactRawCandidatePoolProfile(
  slots: readonly MedleySlotSearch[],
  candidatesBySlot: readonly MedleyTeamCandidate[][],
  source = "profile-local-build",
): Record<string, unknown> {
  return getMedleyExactRawCandidatePoolProfile(
    slots,
    buildMedleyExactRawCandidatePool(candidatesBySlot),
    source,
  );
}

function medleyExactRawCandidatesOverlap(
  leftSlot: MedleyExactRawCandidatePoolSlot,
  leftIndex: number,
  rightSlot: MedleyExactRawCandidatePoolSlot,
  rightIndex: number,
): boolean {
  const leftBaseCardIndex = leftIndex * MEDLEY_TEAM_SIZE;
  const rightBaseCardIndex = rightIndex * MEDLEY_TEAM_SIZE;
  for (let leftCardIndex = 0; leftCardIndex < MEDLEY_TEAM_SIZE; leftCardIndex += 1) {
    const leftCardId = leftSlot.cardIds[leftBaseCardIndex + leftCardIndex];
    if (leftCardId < 0) {
      continue;
    }
    for (let rightCardIndex = 0; rightCardIndex < MEDLEY_TEAM_SIZE; rightCardIndex += 1) {
      if (leftCardId === rightSlot.cardIds[rightBaseCardIndex + rightCardIndex]) {
        return true;
      }
    }
  }
  return false;
}

function estimateGeneratedMedleyExactRawCandidatePairUpper(
  leftSlot: MedleyExactRawCandidatePoolSlot,
  rightSlot: MedleyExactRawCandidatePoolSlot,
): {
  upperBound: number;
  scannedLeftCandidateCount: number;
  scannedRightCandidateCount: number;
} {
  let bestScore = Number.NEGATIVE_INFINITY;
  let scannedLeftCandidateCount = 0;
  let scannedRightCandidateCount = 0;
  for (let leftIndex = 0; leftIndex < leftSlot.length; leftIndex += 1) {
    scannedLeftCandidateCount += 1;
    const leftScore = leftSlot.scores[leftIndex];
    for (let rightIndex = 0; rightIndex < rightSlot.length; rightIndex += 1) {
      scannedRightCandidateCount += 1;
      const score = leftScore + rightSlot.scores[rightIndex];
      if (score < bestScore) {
        break;
      }
      if (medleyExactRawCandidatesOverlap(leftSlot, leftIndex, rightSlot, rightIndex)) {
        continue;
      }
      bestScore = Math.max(bestScore, score);
      break;
    }
  }
  return { upperBound: bestScore, scannedLeftCandidateCount, scannedRightCandidateCount };
}

function estimateHighMedleyExactRawCandidatePairScoreUpperCount(
  leftSlot: MedleyExactRawCandidatePoolSlot,
  rightSlot: MedleyExactRawCandidatePoolSlot,
  threshold: number,
  stopAfter: number,
): {
  count: number;
  capped: boolean;
  scannedLeftCandidateCount: number;
} {
  if (!Number.isFinite(threshold) || leftSlot.length === 0 || rightSlot.length === 0) {
    return { count: 0, capped: false, scannedLeftCandidateCount: 0 };
  }
  let count = 0;
  let rightCount = rightSlot.length;
  let scannedLeftCandidateCount = 0;
  for (let leftIndex = 0; leftIndex < leftSlot.length; leftIndex += 1) {
    scannedLeftCandidateCount += 1;
    const leftScore = leftSlot.scores[leftIndex];
    while (
      rightCount > 0
      && leftScore + rightSlot.scores[rightCount - 1] <= threshold
    ) {
      rightCount -= 1;
    }
    if (rightCount <= 0) {
      break;
    }
    count += rightCount;
    if (count > stopAfter) {
      return { count, capped: true, scannedLeftCandidateCount };
    }
  }
  return { count, capped: false, scannedLeftCandidateCount };
}

function scanHighMedleyExactRawCandidatePairFrontier(
  leftSlot: MedleyExactRawCandidatePoolSlot,
  rightSlot: MedleyExactRawCandidatePoolSlot,
  threshold: number,
  scanLimit: number,
  deadlineAt: number,
): {
  scannedPairCount: number;
  disjointPairCount: number;
  overlapPairCount: number;
  maxScorePairScore: number | null;
  maxDisjointPairScore: number | null;
  firstDisjointPairRank: number | null;
  firstDisjointPairScore: number | null;
  firstDisjointLeftIndex: number | null;
  firstDisjointRightIndex: number | null;
  capped: boolean;
  timedOut: boolean;
} {
  let scannedPairCount = 0;
  let disjointPairCount = 0;
  let overlapPairCount = 0;
  let maxScorePairScore = Number.NEGATIVE_INFINITY;
  let maxDisjointPairScore = Number.NEGATIVE_INFINITY;
  let firstDisjointPairRank: number | null = null;
  let firstDisjointPairScore: number | null = null;
  let firstDisjointLeftIndex: number | null = null;
  let firstDisjointRightIndex: number | null = null;
  const finish = (capped: boolean, timedOut: boolean) => ({
    scannedPairCount,
    disjointPairCount,
    overlapPairCount,
    maxScorePairScore: Number.isFinite(maxScorePairScore) ? maxScorePairScore : null,
    maxDisjointPairScore: Number.isFinite(maxDisjointPairScore) ? maxDisjointPairScore : null,
    firstDisjointPairRank,
    firstDisjointPairScore,
    firstDisjointLeftIndex,
    firstDisjointRightIndex,
    capped,
    timedOut,
  });
  for (let leftIndex = 0; leftIndex < leftSlot.length; leftIndex += 1) {
    const leftScore = leftSlot.scores[leftIndex];
    if (leftScore + (rightSlot.scores[0] ?? Number.NEGATIVE_INFINITY) <= threshold) {
      break;
    }
    for (let rightIndex = 0; rightIndex < rightSlot.length; rightIndex += 1) {
      if (performance.now() >= deadlineAt) {
        return finish(false, true);
      }
      const score = leftScore + rightSlot.scores[rightIndex];
      if (score <= threshold) {
        break;
      }
      scannedPairCount += 1;
      maxScorePairScore = Math.max(maxScorePairScore, score);
      if (medleyExactRawCandidatesOverlap(leftSlot, leftIndex, rightSlot, rightIndex)) {
        overlapPairCount += 1;
      } else {
        disjointPairCount += 1;
        maxDisjointPairScore = Math.max(maxDisjointPairScore, score);
        if (firstDisjointPairRank === null) {
          firstDisjointPairRank = scannedPairCount;
          firstDisjointPairScore = score;
          firstDisjointLeftIndex = leftIndex;
          firstDisjointRightIndex = rightIndex;
        }
      }
      if (scannedPairCount >= scanLimit) {
        return finish(true, false);
      }
    }
  }
  return finish(false, false);
}

function buildMedleyExactRawPairPricingFrontierProfile(
  leftSlot: MedleyExactRawCandidatePoolSlot,
  rightSlot: MedleyExactRawCandidatePoolSlot,
  targetUpperBound: number,
  deadlineAt: number,
): Record<string, unknown> {
  const startedAt = performance.now();
  const localDeadlineAt = Math.min(
    deadlineAt,
    startedAt + MEDLEY_EXACT_RAW_PAIR_PRICING_FRONTIER_TIMEBOX_MS,
  );
  const rightIndexByLeft = new Int32Array(leftSlot.length);
  const heapLeftIndices = new Int32Array(leftSlot.length);
  let heapSize = 0;
  const pairScoreForLeft = (leftIndex: number): number => (
    leftSlot.scores[leftIndex] + rightSlot.scores[rightIndexByLeft[leftIndex]]
  );
  const isHigherScoreLeft = (leftIndex: number, rightLeftIndex: number): boolean => (
    pairScoreForLeft(leftIndex) > pairScoreForLeft(rightLeftIndex)
  );
  const pushLeft = (leftIndex: number): void => {
    let index = heapSize;
    heapSize += 1;
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parentLeftIndex = heapLeftIndices[parentIndex];
      if (!isHigherScoreLeft(leftIndex, parentLeftIndex)) {
        break;
      }
      heapLeftIndices[index] = parentLeftIndex;
      index = parentIndex;
    }
    heapLeftIndices[index] = leftIndex;
  };
  const popLeft = (): number | null => {
    if (heapSize <= 0) {
      return null;
    }
    const rootLeftIndex = heapLeftIndices[0];
    heapSize -= 1;
    if (heapSize > 0) {
      const tailLeftIndex = heapLeftIndices[heapSize];
      let index = 0;
      while (true) {
        const leftChildIndex = index * 2 + 1;
        const rightChildIndex = leftChildIndex + 1;
        if (leftChildIndex >= heapSize) {
          break;
        }
        const childIndex = rightChildIndex < heapSize
          && isHigherScoreLeft(heapLeftIndices[rightChildIndex], heapLeftIndices[leftChildIndex])
          ? rightChildIndex
          : leftChildIndex;
        if (!isHigherScoreLeft(heapLeftIndices[childIndex], tailLeftIndex)) {
          break;
        }
        heapLeftIndices[index] = heapLeftIndices[childIndex];
        index = childIndex;
      }
      heapLeftIndices[index] = tailLeftIndex;
    }
    return rootLeftIndex;
  };
  if (rightSlot.length > 0) {
    for (let leftIndex = 0; leftIndex < leftSlot.length; leftIndex += 1) {
      pushLeft(leftIndex);
    }
  }
  let poppedPairCount = 0;
  let overlapPairCount = 0;
  let disjointPairCount = 0;
  let maxDisjointPairScore = Number.NEGATIVE_INFINITY;
  let maxPoppedPairScore = Number.NEGATIVE_INFINITY;
  let firstDisjointPairRank: number | null = null;
  let firstDisjointPairScore: number | null = null;
  let firstDisjointLeftIndex: number | null = null;
  let firstDisjointRightIndex: number | null = null;
  let provedGeneratedUpper = false;
  let timedOut = false;
  let capped = false;
  let stoppedByTargetUpper = false;
  while (heapSize > 0) {
    if (poppedPairCount >= MEDLEY_EXACT_RAW_PAIR_PRICING_FRONTIER_POP_LIMIT) {
      capped = true;
      break;
    }
    if (performance.now() >= localDeadlineAt) {
      timedOut = true;
      break;
    }
    const leftIndex = popLeft();
    if (leftIndex === null) {
      break;
    }
    const rightIndex = rightIndexByLeft[leftIndex];
    const score = leftSlot.scores[leftIndex] + rightSlot.scores[rightIndex];
    poppedPairCount += 1;
    maxPoppedPairScore = Math.max(maxPoppedPairScore, score);
    if (medleyExactRawCandidatesOverlap(leftSlot, leftIndex, rightSlot, rightIndex)) {
      overlapPairCount += 1;
    } else {
      disjointPairCount += 1;
      if (score > maxDisjointPairScore) {
        maxDisjointPairScore = score;
      }
      if (firstDisjointPairRank === null) {
        firstDisjointPairRank = poppedPairCount;
        firstDisjointPairScore = score;
        firstDisjointLeftIndex = leftIndex;
        firstDisjointRightIndex = rightIndex;
      }
    }
    const nextRightIndex = rightIndex + 1;
    if (nextRightIndex < rightSlot.length) {
      rightIndexByLeft[leftIndex] = nextRightIndex;
      pushLeft(leftIndex);
    }
    const frontierTopScore = heapSize > 0 ? pairScoreForLeft(heapLeftIndices[0]) : Number.NEGATIVE_INFINITY;
    if (Number.isFinite(maxDisjointPairScore) && maxDisjointPairScore >= frontierTopScore) {
      provedGeneratedUpper = true;
      break;
    }
    const bestDisjointScore = Number.isFinite(maxDisjointPairScore)
      ? maxDisjointPairScore
      : Number.NEGATIVE_INFINITY;
    if (
      Number.isFinite(targetUpperBound)
      && Math.max(bestDisjointScore, frontierTopScore) <= targetUpperBound
    ) {
      stoppedByTargetUpper = true;
      break;
    }
  }
  const frontierTopScore = heapSize > 0 ? pairScoreForLeft(heapLeftIndices[0]) : Number.NEGATIVE_INFINITY;
  const bestDisjointScore = Number.isFinite(maxDisjointPairScore)
    ? maxDisjointPairScore
    : Number.NEGATIVE_INFINITY;
  const generatedUpperBound = Math.max(bestDisjointScore, frontierTopScore);
  const provedTargetUpper = (
    Number.isFinite(targetUpperBound)
    && Number.isFinite(generatedUpperBound)
    && generatedUpperBound <= targetUpperBound
  );
  return {
    algorithm: "hhwx-raw-pair-pricing-row-frontier-v1",
    behaviorChange: false,
    storage: "typed-row-frontier",
    popLimit: MEDLEY_EXACT_RAW_PAIR_PRICING_FRONTIER_POP_LIMIT,
    timeboxMs: MEDLEY_EXACT_RAW_PAIR_PRICING_FRONTIER_TIMEBOX_MS,
    targetUpperBound: Number.isFinite(targetUpperBound) ? targetUpperBound : null,
    leftCandidateCount: leftSlot.length,
    rightCandidateCount: rightSlot.length,
    poppedPairCount,
    overlapPairCount,
    disjointPairCount,
    emittedPairCount: poppedPairCount,
    heapSize,
    rowStateMiB: roundMiB((rightIndexByLeft.byteLength + heapLeftIndices.byteLength)),
    maxPoppedPairScore: Number.isFinite(maxPoppedPairScore) ? maxPoppedPairScore : null,
    maxDisjointPairScore: Number.isFinite(maxDisjointPairScore) ? maxDisjointPairScore : null,
    frontierTopScore: Number.isFinite(frontierTopScore) ? frontierTopScore : null,
    generatedUpperBound: Number.isFinite(generatedUpperBound) ? generatedUpperBound : null,
    provedGeneratedUpper,
    provedTargetUpper,
    stoppedByTargetUpper,
    remainingTargetGap: Number.isFinite(targetUpperBound) && Number.isFinite(generatedUpperBound)
      ? Math.max(0, generatedUpperBound - targetUpperBound)
      : null,
    firstDisjointPairRank,
    firstDisjointPairScore,
    firstDisjointLeftIndex,
    firstDisjointRightIndex,
    capped,
    timedOut,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}

function buildMedleyExactRawPairFrontierCensusProfile(
  leftSlot: MedleyExactRawCandidatePoolSlot,
  rightSlot: MedleyExactRawCandidatePoolSlot,
  thresholds: MedleyExactRawPairFrontierThreshold[],
  deadlineAt: number,
): Record<string, unknown> {
  const startedAt = performance.now();
  const seenThresholdKeys = new Set<string>();
  const results: Array<Record<string, unknown>> = [];
  for (const thresholdEntry of thresholds) {
    if (results.length >= MEDLEY_EXACT_RAW_PAIR_FRONTIER_CENSUS_MAX_THRESHOLDS) {
      break;
    }
    const threshold = thresholdEntry.threshold;
    if (typeof threshold !== "number" || !Number.isFinite(threshold)) {
      continue;
    }
    const thresholdName = typeof thresholdEntry.name === "string" ? thresholdEntry.name : "";
    const thresholdKey = `${Math.round(threshold * 1000)}`;
    if (seenThresholdKeys.has(thresholdKey)) {
      continue;
    }
    seenThresholdKeys.add(thresholdKey);
    if (performance.now() >= deadlineAt) {
      results.push({
        ...thresholdEntry,
        skipped: true,
        skipReason: "timebox",
      });
      break;
    }
    const countStartedAt = performance.now();
    const scorePairUpperCount = estimateHighMedleyExactRawCandidatePairScoreUpperCount(
      leftSlot,
      rightSlot,
      threshold,
      MEDLEY_EXACT_RAW_PAIR_FRONTIER_CENSUS_COUNT_STOP_AFTER,
    );
    const shouldRunDeepScan = (
      thresholdName === "current-pair-upper" || thresholdName === "generator-tail-close"
    );
    const fullScorePairUpperCount = shouldRunDeepScan
      ? estimateHighMedleyExactRawCandidatePairScoreUpperCount(
        leftSlot,
        rightSlot,
        threshold,
        Number.MAX_SAFE_INTEGER,
      )
      : null;
    const shouldScanExact = (
      !scorePairUpperCount.capped
      && scorePairUpperCount.count <= MEDLEY_EXACT_RAW_PAIR_FRONTIER_CENSUS_EXACT_SCAN_LIMIT
    );
    const exactScan = shouldScanExact
      ? scanHighMedleyExactRawCandidatePairFrontier(
        leftSlot,
        rightSlot,
        threshold,
        MEDLEY_EXACT_RAW_PAIR_FRONTIER_CENSUS_EXACT_SCAN_LIMIT,
        deadlineAt,
      )
      : null;
    const sampleScan = exactScan === null
      ? scanHighMedleyExactRawCandidatePairFrontier(
        leftSlot,
        rightSlot,
        threshold,
        MEDLEY_EXACT_RAW_PAIR_FRONTIER_CENSUS_SAMPLE_SCAN_LIMIT,
        deadlineAt,
      )
      : null;
    const shouldRunDeepSample = (
      sampleScan !== null
      && sampleScan.firstDisjointPairRank === null
      && shouldRunDeepScan
      && performance.now() < deadlineAt
    );
    const deepScan = shouldRunDeepSample
      ? scanHighMedleyExactRawCandidatePairFrontier(
        leftSlot,
        rightSlot,
        threshold,
        MEDLEY_EXACT_RAW_PAIR_FRONTIER_CENSUS_DEEP_SCAN_LIMIT,
        deadlineAt,
      )
      : null;
    results.push({
      ...thresholdEntry,
      threshold: Math.floor(threshold),
      scorePairUpperCount: scorePairUpperCount.count,
      scorePairUpperCountCapped: scorePairUpperCount.capped,
      scorePairUpperScannedLeftCandidateCount: scorePairUpperCount.scannedLeftCandidateCount,
      fullScorePairUpperCount: fullScorePairUpperCount?.count ?? null,
      fullScorePairUpperScannedLeftCandidateCount: fullScorePairUpperCount?.scannedLeftCandidateCount ?? null,
      exactScanSkipped: exactScan === null,
      exactScanSkipReason: exactScan === null
        ? scorePairUpperCount.capped ? "score-pair-upper-count-capped" : "score-pair-upper-count-limit"
        : null,
      exactScannedPairCount: exactScan?.scannedPairCount ?? null,
      exactDisjointPairCount: exactScan?.disjointPairCount ?? null,
      exactOverlapPairCount: exactScan?.overlapPairCount ?? null,
      exactMaxScorePairScore: exactScan?.maxScorePairScore ?? null,
      exactMaxDisjointPairScore: exactScan?.maxDisjointPairScore ?? null,
      exactFirstDisjointPairRank: exactScan?.firstDisjointPairRank ?? null,
      exactFirstDisjointPairScore: exactScan?.firstDisjointPairScore ?? null,
      exactFirstDisjointLeftIndex: exactScan?.firstDisjointLeftIndex ?? null,
      exactFirstDisjointRightIndex: exactScan?.firstDisjointRightIndex ?? null,
      exactScanCapped: exactScan?.capped ?? null,
      exactScanTimedOut: exactScan?.timedOut ?? null,
      sampleScanLimit: sampleScan === null ? null : MEDLEY_EXACT_RAW_PAIR_FRONTIER_CENSUS_SAMPLE_SCAN_LIMIT,
      sampleScannedPairCount: sampleScan?.scannedPairCount ?? null,
      sampleDisjointPairCount: sampleScan?.disjointPairCount ?? null,
      sampleOverlapPairCount: sampleScan?.overlapPairCount ?? null,
      sampleMaxScorePairScore: sampleScan?.maxScorePairScore ?? null,
      sampleMaxDisjointPairScore: sampleScan?.maxDisjointPairScore ?? null,
      sampleFirstDisjointPairRank: sampleScan?.firstDisjointPairRank ?? null,
      sampleFirstDisjointPairScore: sampleScan?.firstDisjointPairScore ?? null,
      sampleFirstDisjointLeftIndex: sampleScan?.firstDisjointLeftIndex ?? null,
      sampleFirstDisjointRightIndex: sampleScan?.firstDisjointRightIndex ?? null,
      sampleScanCapped: sampleScan?.capped ?? null,
      sampleScanTimedOut: sampleScan?.timedOut ?? null,
      deepScanLimit: deepScan === null ? null : MEDLEY_EXACT_RAW_PAIR_FRONTIER_CENSUS_DEEP_SCAN_LIMIT,
      deepScannedPairCount: deepScan?.scannedPairCount ?? null,
      deepDisjointPairCount: deepScan?.disjointPairCount ?? null,
      deepOverlapPairCount: deepScan?.overlapPairCount ?? null,
      deepMaxScorePairScore: deepScan?.maxScorePairScore ?? null,
      deepMaxDisjointPairScore: deepScan?.maxDisjointPairScore ?? null,
      deepFirstDisjointPairRank: deepScan?.firstDisjointPairRank ?? null,
      deepFirstDisjointPairScore: deepScan?.firstDisjointPairScore ?? null,
      deepFirstDisjointLeftIndex: deepScan?.firstDisjointLeftIndex ?? null,
      deepFirstDisjointRightIndex: deepScan?.firstDisjointRightIndex ?? null,
      deepScanCapped: deepScan?.capped ?? null,
      deepScanTimedOut: deepScan?.timedOut ?? null,
      elapsedMs: Math.round(performance.now() - countStartedAt),
    });
    if (exactScan?.timedOut || sampleScan?.timedOut || deepScan?.timedOut) {
      break;
    }
  }
  return {
    algorithm: "hhwx-raw-pair-frontier-census-v1",
    behaviorChange: false,
    countStopAfter: MEDLEY_EXACT_RAW_PAIR_FRONTIER_CENSUS_COUNT_STOP_AFTER,
    exactScanLimit: MEDLEY_EXACT_RAW_PAIR_FRONTIER_CENSUS_EXACT_SCAN_LIMIT,
    sampleScanLimit: MEDLEY_EXACT_RAW_PAIR_FRONTIER_CENSUS_SAMPLE_SCAN_LIMIT,
    deepScanLimit: MEDLEY_EXACT_RAW_PAIR_FRONTIER_CENSUS_DEEP_SCAN_LIMIT,
    thresholdCount: results.length,
    elapsedMs: Math.round(performance.now() - startedAt),
    thresholds: results,
  };
}

function getMedleyExactRawCandidateCardIds(
  slot: MedleyExactRawCandidateSlotLike,
  candidateIndex: number,
): number[] {
  const baseCardIndex = candidateIndex * MEDLEY_TEAM_SIZE;
  const cardIds: number[] = [];
  for (let cardIndex = 0; cardIndex < MEDLEY_TEAM_SIZE; cardIndex += 1) {
    const cardId = slot.cardIds[baseCardIndex + cardIndex];
    if (cardId >= 0) {
      cardIds.push(cardId);
    }
  }
  return cardIds;
}

function buildMedleyExactRawAnchorPairCompatibilityProfile(
  anchorSlot: MedleyExactRawCandidatePoolSlot,
  pairCardIds: readonly number[],
  anchorScoreThreshold: number,
  pairScore: number,
  incumbentScore: number,
): Record<string, unknown> {
  const pairCardIdSet = new Set(pairCardIds);
  let relevantAnchorCount = 0;
  let overlappingAnchorCount = 0;
  let nonOverlappingAnchorCount = 0;
  let firstNonOverlappingAnchorIndex: number | null = null;
  let firstNonOverlappingAnchorScore: number | null = null;
  let firstNonOverlappingAnchorCardIds: number[] | null = null;
  for (let anchorIndex = 0; anchorIndex < anchorSlot.length; anchorIndex += 1) {
    const anchorScore = anchorSlot.scores[anchorIndex];
    if (anchorScore + pairScore <= incumbentScore) {
      break;
    }
    if (anchorScore <= anchorScoreThreshold) {
      break;
    }
    relevantAnchorCount += 1;
    if (medleyExactRawCandidateHasCardIdInSet(anchorSlot, anchorIndex, pairCardIdSet)) {
      overlappingAnchorCount += 1;
      continue;
    }
    nonOverlappingAnchorCount += 1;
    if (firstNonOverlappingAnchorIndex === null) {
      firstNonOverlappingAnchorIndex = anchorIndex;
      firstNonOverlappingAnchorScore = anchorScore;
      firstNonOverlappingAnchorCardIds = getMedleyExactRawCandidateCardIds(anchorSlot, anchorIndex);
    }
  }
  const firstNonOverlappingTotalScore = firstNonOverlappingAnchorScore !== null
    ? firstNonOverlappingAnchorScore + pairScore
    : null;
  return {
    pairScore,
    anchorScoreThreshold,
    relevantAnchorCount,
    overlappingAnchorCount,
    nonOverlappingAnchorCount,
    allRelevantAnchorsOverlap: relevantAnchorCount > 0 && nonOverlappingAnchorCount === 0,
    firstNonOverlappingAnchorIndex,
    firstNonOverlappingAnchorScore,
    firstNonOverlappingAnchorCardIds,
    firstNonOverlappingTotalScore,
    firstNonOverlappingGap: firstNonOverlappingTotalScore !== null
      ? Math.max(0, firstNonOverlappingTotalScore - incumbentScore)
      : null,
  };
}

function buildMedleyExactRawPairWitnessAnchorCoverProfile(
  anchorSlot: MedleyExactRawCandidatePoolSlot,
  leftSlot: MedleyExactRawCandidatePoolSlot,
  rightSlot: MedleyExactRawCandidatePoolSlot,
  containingLeftBitsByCardId: Map<number, Uint32Array>,
  containingRightBitsByCardId: Map<number, Uint32Array>,
  pairCardIds: readonly number[],
  pairScore: number,
  leftPeekUpperBound: number,
  rightPeekUpperBound: number,
  leftPeekUpperBoundExcludingCardIds: ((
    excludedCardIds: readonly number[],
    deadlineAt?: number,
  ) => MedleyExactConstrainedSlotPeekUpperResult) | undefined,
  rightPeekUpperBoundExcludingCardIds: ((
    excludedCardIds: readonly number[],
    deadlineAt?: number,
  ) => MedleyExactConstrainedSlotPeekUpperResult) | undefined,
  incumbentScore: number,
  deadlineAt: number,
): Record<string, unknown> {
  const startedAt = performance.now();
  const localDeadlineAt = Math.min(
    deadlineAt,
    startedAt + MEDLEY_EXACT_RAW_PAIR_WITNESS_COVER_TIMEBOX_MS,
  );
  const leftWordCount = Math.ceil(leftSlot.length / 32);
  const rightWordCount = Math.ceil(rightSlot.length / 32);
  const finiteScore = (score: number): number => (
    Number.isFinite(score) ? score : Number.NEGATIVE_INFINITY
  );
  const combineScores = (leftScore: number, rightScore: number): number => (
    Number.isFinite(leftScore) && Number.isFinite(rightScore)
      ? leftScore + rightScore
      : Number.NEGATIVE_INFINITY
  );
  const pairCardIndexById = new Map(pairCardIds.map((cardId, index) => [cardId, index]));
  const groupCounts = new Int32Array(pairCardIds.length);
  const groupMaxAnchorScores = new Int32Array(pairCardIds.length);
  const groupFirstAnchorIndices = new Int32Array(pairCardIds.length);
  groupMaxAnchorScores.fill(Number.MIN_SAFE_INTEGER);
  groupFirstAnchorIndices.fill(-1);
  const maskGroupsByMask = new Map<number, {
    mask: number;
    anchorCount: number;
    maxAnchorScore: number;
    firstAnchorIndex: number;
  }>();
  let relevantAnchorCount = 0;

  for (let anchorIndex = 0; anchorIndex < anchorSlot.length; anchorIndex += 1) {
    const anchorScore = anchorSlot.scores[anchorIndex];
    if (anchorScore + pairScore <= incumbentScore) {
      break;
    }
    relevantAnchorCount += 1;
    const anchorCardIds = getMedleyExactRawCandidateCardIds(anchorSlot, anchorIndex);
    let mask = 0;
    for (const cardId of anchorCardIds) {
      const groupIndex = pairCardIndexById.get(cardId);
      if (groupIndex === undefined) {
        continue;
      }
      mask |= 1 << groupIndex;
      groupCounts[groupIndex] += 1;
      if (anchorScore > groupMaxAnchorScores[groupIndex]) {
        groupMaxAnchorScores[groupIndex] = anchorScore;
        groupFirstAnchorIndices[groupIndex] = anchorIndex;
      }
    }
    if (mask !== 0) {
      const maskGroup = maskGroupsByMask.get(mask);
      if (!maskGroup) {
        maskGroupsByMask.set(mask, {
          mask,
          anchorCount: 1,
          maxAnchorScore: anchorScore,
          firstAnchorIndex: anchorIndex,
        });
      } else {
        maskGroup.anchorCount += 1;
        if (anchorScore > maskGroup.maxAnchorScore) {
          maskGroup.maxAnchorScore = anchorScore;
          maskGroup.firstAnchorIndex = anchorIndex;
        }
      }
    }
  }

  const safeCardIds = new Set<number>();
  let pairSplitStateCountTotal = 0;
  let pairSplitCompletedCount = 0;
  let pairSplitTimedOutCount = 0;
  let timedOut = false;
  let stoppedByBudget = false;
  const groups = pairCardIds.map((cardId, groupIndex) => {
    if (groupCounts[groupIndex] <= 0) {
      return {
        cardId,
        anchorCount: 0,
        maxAnchorScore: null,
        firstAnchorIndex: null,
        pairUpperExcludingCard: null,
        pairSplitTimedOut: null,
        pairSplitAbortReason: null,
        pairSplitStateCount: null,
        totalUpper: null,
        gap: null,
        safe: true,
      };
    }
    if (timedOut || stoppedByBudget || performance.now() >= localDeadlineAt) {
      timedOut = true;
      return {
        cardId,
        anchorCount: groupCounts[groupIndex],
        maxAnchorScore: groupMaxAnchorScores[groupIndex],
        firstAnchorIndex: groupFirstAnchorIndices[groupIndex],
        pairUpperExcludingCard: null,
        pairSplitTimedOut: true,
        pairSplitAbortReason: stoppedByBudget ? "previous-budget-stop" : "timebox",
        pairSplitStateCount: null,
        totalUpper: null,
        gap: null,
        safe: false,
      };
    }
    const pairSplit = estimateGeneratedMedleyExactRawCandidatePairConflictSplitUpper(
      leftSlot,
      rightSlot,
      containingLeftBitsByCardId,
      containingRightBitsByCardId,
      [cardId],
      localDeadlineAt,
      MEDLEY_EXACT_RAW_PAIR_WITNESS_COVER_PAIR_SPLIT_STATE_BUDGET,
    );
    pairSplitStateCountTotal = addCappedCount(pairSplitStateCountTotal, pairSplit.stateCount);
    if (pairSplit.timedOut) {
      pairSplitTimedOutCount += 1;
      timedOut = true;
      if (pairSplit.abortReason === "state-budget") {
        stoppedByBudget = true;
      }
    } else {
      pairSplitCompletedCount += 1;
    }
    const pairUpperExcludingCard = !pairSplit.timedOut
      && (Number.isFinite(pairSplit.upperBound) || pairSplit.upperBound === Number.NEGATIVE_INFINITY)
      ? pairSplit.upperBound
      : null;
    const totalUpper = pairUpperExcludingCard !== null
      ? groupMaxAnchorScores[groupIndex] + pairUpperExcludingCard
      : null;
    const safe = totalUpper !== null && totalUpper <= incumbentScore;
    if (safe) {
      safeCardIds.add(cardId);
    }
    return {
      cardId,
      anchorCount: groupCounts[groupIndex],
      maxAnchorScore: groupMaxAnchorScores[groupIndex],
      firstAnchorIndex: groupFirstAnchorIndices[groupIndex],
      pairUpperExcludingCard,
      pairSplitTimedOut: pairSplit.timedOut,
      pairSplitAbortReason: pairSplit.abortReason,
      pairSplitStateCount: pairSplit.stateCount,
      totalUpper,
      gap: totalUpper !== null ? Math.max(0, totalUpper - incumbentScore) : null,
      safe,
    };
  });

  const safeMasks = new Set<number>();
  let maskPairSplitCompletedCount = 0;
  let maskPairSplitTimedOutCount = 0;
  let maskPairSplitStateCountTotal = 0;
  let maskStoppedByBudget = false;
  let constrainedPeekProbeCount = 0;
  const evaluateWitnessMaskGroup = (
    maskGroup: {
      mask: number;
      anchorCount: number;
      maxAnchorScore: number;
      firstAnchorIndex: number;
    },
    stopState: { stoppedByBudget: boolean; timedOut: boolean },
    probeConstrainedPeek: boolean,
  ) => {
    const excludedCardIds = pairCardIds.filter((_, groupIndex) => (maskGroup.mask & (1 << groupIndex)) !== 0);
    if (timedOut || stoppedByBudget || stopState.stoppedByBudget || performance.now() >= localDeadlineAt) {
      timedOut = true;
      stopState.timedOut = true;
      return {
        ...maskGroup,
        excludedCardIds,
        pairUpperExcludingMask: null,
        pairSplitTimedOut: true,
        pairSplitAbortReason: stopState.stoppedByBudget ? "previous-budget-stop" : "timebox",
        pairSplitStateCount: null,
        totalUpper: null,
        gap: null,
        safe: false,
      };
    }
    const pairSplit = estimateGeneratedMedleyExactRawCandidatePairConflictSplitUpper(
      leftSlot,
      rightSlot,
      containingLeftBitsByCardId,
      containingRightBitsByCardId,
      excludedCardIds,
      localDeadlineAt,
      MEDLEY_EXACT_RAW_PAIR_WITNESS_COVER_PAIR_SPLIT_STATE_BUDGET,
    );
    if (pairSplit.timedOut) {
      stopState.timedOut = true;
      timedOut = true;
      if (pairSplit.abortReason === "state-budget") {
        stopState.stoppedByBudget = true;
      }
    }
    const pairUpperExcludingMask = !pairSplit.timedOut
      && (Number.isFinite(pairSplit.upperBound) || pairSplit.upperBound === Number.NEGATIVE_INFINITY)
      ? pairSplit.upperBound
      : null;
    const shouldProbeConstrainedPeek = (
      probeConstrainedPeek
      && (
        leftPeekUpperBoundExcludingCardIds !== undefined
        || rightPeekUpperBoundExcludingCardIds !== undefined
      )
      && constrainedPeekProbeCount < MEDLEY_EXACT_RAW_PAIR_WITNESS_CONSTRAINED_PEEK_SAMPLE_LIMIT
      && performance.now() < localDeadlineAt
    );
    const leftConstrainedPeek = shouldProbeConstrainedPeek
      ? leftPeekUpperBoundExcludingCardIds?.(
        excludedCardIds,
        Math.min(
          localDeadlineAt,
          performance.now() + MEDLEY_EXACT_RAW_PAIR_WITNESS_CONSTRAINED_PEEK_TIMEBOX_MS,
        ),
      ) ?? null
      : null;
    const rightConstrainedPeek = shouldProbeConstrainedPeek
      ? rightPeekUpperBoundExcludingCardIds?.(
        excludedCardIds,
        Math.min(
          localDeadlineAt,
          performance.now() + MEDLEY_EXACT_RAW_PAIR_WITNESS_CONSTRAINED_PEEK_TIMEBOX_MS,
        ),
      ) ?? null
      : null;
    if (shouldProbeConstrainedPeek) {
      constrainedPeekProbeCount += 1;
    }
    const leftEffectivePeekUpperBound = (
      leftConstrainedPeek?.completed
        ? Math.min(finiteScore(leftPeekUpperBound), finiteScore(leftConstrainedPeek.upperBound))
        : finiteScore(leftPeekUpperBound)
    );
    const rightEffectivePeekUpperBound = (
      rightConstrainedPeek?.completed
        ? Math.min(finiteScore(rightPeekUpperBound), finiteScore(rightConstrainedPeek.upperBound))
        : finiteScore(rightPeekUpperBound)
    );
    const leftGeneratedCandidate = findBestAvailableMedleyExactRawRightCandidateByForbiddenCardIds(
      leftSlot,
      containingLeftBitsByCardId,
      leftWordCount,
      [],
      excludedCardIds,
    );
    const rightGeneratedCandidate = findBestAvailableMedleyExactRawRightCandidateByForbiddenCardIds(
      rightSlot,
      containingRightBitsByCardId,
      rightWordCount,
      [],
      excludedCardIds,
    );
    const leftGeneratedScore = finiteScore(
      leftGeneratedCandidate.candidateIndex >= 0
        ? leftSlot.scores[leftGeneratedCandidate.candidateIndex]
        : Number.NEGATIVE_INFINITY,
    );
    const rightGeneratedScore = finiteScore(
      rightGeneratedCandidate.candidateIndex >= 0
        ? rightSlot.scores[rightGeneratedCandidate.candidateIndex]
        : Number.NEGATIVE_INFINITY,
    );
    const leftBestPossible = Math.max(leftGeneratedScore, leftEffectivePeekUpperBound);
    const rightBestPossible = Math.max(rightGeneratedScore, rightEffectivePeekUpperBound);
    const leftUnseenUpper = combineScores(leftEffectivePeekUpperBound, rightBestPossible);
    const rightUnseenUpper = combineScores(rightEffectivePeekUpperBound, leftBestPossible);
    const strictPairUpper = pairUpperExcludingMask !== null
      ? Math.max(pairUpperExcludingMask, leftUnseenUpper, rightUnseenUpper)
      : null;
    const strictPairUpperSource = strictPairUpper === null
      ? null
      : strictPairUpper === pairUpperExcludingMask
        ? "generated-pair"
        : strictPairUpper === leftUnseenUpper
          ? "left-unseen"
          : "right-unseen";
    const pairUpperToClose = incumbentScore - maskGroup.maxAnchorScore;
    const generatedPairGapToClose = pairUpperExcludingMask !== null
      ? Math.max(0, pairUpperExcludingMask - pairUpperToClose)
      : null;
    const leftUnseenGapToClose = Number.isFinite(leftUnseenUpper)
      ? Math.max(0, leftUnseenUpper - pairUpperToClose)
      : null;
    const rightUnseenGapToClose = Number.isFinite(rightUnseenUpper)
      ? Math.max(0, rightUnseenUpper - pairUpperToClose)
      : null;
    const strictPairGapToClose = strictPairUpper !== null
      ? Math.max(0, strictPairUpper - pairUpperToClose)
      : null;
    const totalUpper = strictPairUpper !== null
      ? maskGroup.maxAnchorScore + strictPairUpper
      : null;
    const safe = totalUpper !== null && totalUpper <= incumbentScore;
    return {
      ...maskGroup,
      excludedCardIds,
      pairUpperExcludingMask,
      strictPairUpper,
      strictPairUpperSource,
      leftGeneratedScore: Number.isFinite(leftGeneratedScore) ? leftGeneratedScore : null,
      rightGeneratedScore: Number.isFinite(rightGeneratedScore) ? rightGeneratedScore : null,
      leftEffectivePeekUpperBound: Number.isFinite(leftEffectivePeekUpperBound) ? leftEffectivePeekUpperBound : null,
      rightEffectivePeekUpperBound: Number.isFinite(rightEffectivePeekUpperBound) ? rightEffectivePeekUpperBound : null,
      leftConstrainedPeekUpperBound: leftConstrainedPeek && Number.isFinite(leftConstrainedPeek.upperBound)
        ? leftConstrainedPeek.upperBound
        : null,
      rightConstrainedPeekUpperBound: rightConstrainedPeek && Number.isFinite(rightConstrainedPeek.upperBound)
        ? rightConstrainedPeek.upperBound
        : null,
      leftConstrainedPeekCompleted: leftConstrainedPeek?.completed ?? null,
      rightConstrainedPeekCompleted: rightConstrainedPeek?.completed ?? null,
      leftConstrainedPeekTimedOut: leftConstrainedPeek?.timedOut ?? null,
      rightConstrainedPeekTimedOut: rightConstrainedPeek?.timedOut ?? null,
      leftConstrainedPeekHeapNodeCount: leftConstrainedPeek?.heapNodeCount ?? null,
      rightConstrainedPeekHeapNodeCount: rightConstrainedPeek?.heapNodeCount ?? null,
      leftConstrainedPeekScannedNodeCount: leftConstrainedPeek?.scannedNodeCount ?? null,
      rightConstrainedPeekScannedNodeCount: rightConstrainedPeek?.scannedNodeCount ?? null,
      leftConstrainedPeekElapsedMs: leftConstrainedPeek?.elapsedMs ?? null,
      rightConstrainedPeekElapsedMs: rightConstrainedPeek?.elapsedMs ?? null,
      leftConstrainedPeekReduction: leftConstrainedPeek?.completed
        && Number.isFinite(leftPeekUpperBound)
        && Number.isFinite(leftConstrainedPeek.upperBound)
        ? Math.max(0, leftPeekUpperBound - leftConstrainedPeek.upperBound)
        : null,
      rightConstrainedPeekReduction: rightConstrainedPeek?.completed
        && Number.isFinite(rightPeekUpperBound)
        && Number.isFinite(rightConstrainedPeek.upperBound)
        ? Math.max(0, rightPeekUpperBound - rightConstrainedPeek.upperBound)
        : null,
      leftUnseenUpper: Number.isFinite(leftUnseenUpper) ? leftUnseenUpper : null,
      rightUnseenUpper: Number.isFinite(rightUnseenUpper) ? rightUnseenUpper : null,
      pairUpperToClose,
      generatedPairGapToClose,
      leftUnseenGapToClose,
      rightUnseenGapToClose,
      strictPairGapToClose,
      pairSplitTimedOut: pairSplit.timedOut,
      pairSplitAbortReason: pairSplit.abortReason,
      pairSplitStateCount: pairSplit.stateCount,
      totalUpper,
      gap: totalUpper !== null ? Math.max(0, totalUpper - incumbentScore) : null,
      safe,
    };
  };
  const maskGroups = [...maskGroupsByMask.values()]
    .sort((left, right) => (
      right.maxAnchorScore - left.maxAnchorScore
      || right.anchorCount - left.anchorCount
      || left.mask - right.mask
    ))
    .slice(0, MEDLEY_EXACT_RAW_PAIR_WITNESS_COVER_MASK_SPLIT_LIMIT)
    .map((maskGroup) => {
      const maskState = { stoppedByBudget: maskStoppedByBudget, timedOut: false };
      const result = evaluateWitnessMaskGroup(maskGroup, maskState, false);
      maskStoppedByBudget = maskState.stoppedByBudget;
      if (result.pairSplitStateCount !== null) {
        maskPairSplitStateCountTotal = addCappedCount(maskPairSplitStateCountTotal, result.pairSplitStateCount);
      }
      if (result.pairSplitTimedOut) {
        maskPairSplitTimedOutCount += 1;
      } else {
        maskPairSplitCompletedCount += 1;
      }
      if (result.safe) {
        safeMasks.add(maskGroup.mask);
      }
      return result;
    });

  const safeCountMasks = new Set<number>();
  let countMaskPairSplitCompletedCount = 0;
  let countMaskPairSplitTimedOutCount = 0;
  let countMaskPairSplitStateCountTotal = 0;
  let countMaskStoppedByBudget = false;
  const countMaskGroups = [...maskGroupsByMask.values()]
    .sort((left, right) => (
      right.anchorCount - left.anchorCount
      || right.maxAnchorScore - left.maxAnchorScore
      || left.mask - right.mask
    ))
    .slice(0, MEDLEY_EXACT_RAW_PAIR_WITNESS_COVER_COUNT_MASK_SPLIT_LIMIT)
    .map((maskGroup) => {
      const maskState = { stoppedByBudget: countMaskStoppedByBudget, timedOut: false };
      const result = evaluateWitnessMaskGroup(maskGroup, maskState, true);
      countMaskStoppedByBudget = maskState.stoppedByBudget;
      if (result.pairSplitStateCount !== null) {
        countMaskPairSplitStateCountTotal = addCappedCount(
          countMaskPairSplitStateCountTotal,
          result.pairSplitStateCount,
        );
      }
      if (result.pairSplitTimedOut) {
        countMaskPairSplitTimedOutCount += 1;
      } else {
        countMaskPairSplitCompletedCount += 1;
      }
      if (result.safe) {
        safeCountMasks.add(maskGroup.mask);
      }
      return result;
    });

  let coveredAnchorCount = 0;
  let uncoveredAnchorCount = 0;
  let firstUncoveredAnchorIndex: number | null = null;
  let firstUncoveredAnchorScore: number | null = null;
  let firstUncoveredAnchorCardIds: number[] | null = null;
  let maskCoveredAnchorCount = 0;
  let maskUncoveredAnchorCount = 0;
  let firstMaskUncoveredAnchorIndex: number | null = null;
  let firstMaskUncoveredAnchorScore: number | null = null;
  let firstMaskUncoveredAnchorCardIds: number[] | null = null;
  let firstMaskUncoveredMask: number | null = null;
  let countMaskCoveredAnchorCount = 0;
  let countMaskUncoveredAnchorCount = 0;
  let firstCountMaskUncoveredAnchorIndex: number | null = null;
  let firstCountMaskUncoveredAnchorScore: number | null = null;
  let firstCountMaskUncoveredAnchorCardIds: number[] | null = null;
  let firstCountMaskUncoveredMask: number | null = null;
  let unionMaskCoveredAnchorCount = 0;
  let unionMaskUncoveredAnchorCount = 0;
  let firstUnionMaskUncoveredAnchorIndex: number | null = null;
  let firstUnionMaskUncoveredAnchorScore: number | null = null;
  let firstUnionMaskUncoveredAnchorCardIds: number[] | null = null;
  let firstUnionMaskUncoveredMask: number | null = null;
  for (let anchorIndex = 0; anchorIndex < anchorSlot.length; anchorIndex += 1) {
    const anchorScore = anchorSlot.scores[anchorIndex];
    if (anchorScore + pairScore <= incumbentScore) {
      break;
    }
    const anchorCardIds = getMedleyExactRawCandidateCardIds(anchorSlot, anchorIndex);
    let mask = 0;
    for (const cardId of anchorCardIds) {
      const groupIndex = pairCardIndexById.get(cardId);
      if (groupIndex !== undefined) {
        mask |= 1 << groupIndex;
      }
    }
    const covered = anchorCardIds.some((cardId) => safeCardIds.has(cardId));
    if (covered) {
      coveredAnchorCount += 1;
    } else {
      uncoveredAnchorCount += 1;
      if (firstUncoveredAnchorIndex === null) {
        firstUncoveredAnchorIndex = anchorIndex;
        firstUncoveredAnchorScore = anchorScore;
        firstUncoveredAnchorCardIds = anchorCardIds;
      }
    }
    if (safeMasks.has(mask)) {
      maskCoveredAnchorCount += 1;
    } else {
      maskUncoveredAnchorCount += 1;
      if (firstMaskUncoveredAnchorIndex === null) {
        firstMaskUncoveredAnchorIndex = anchorIndex;
        firstMaskUncoveredAnchorScore = anchorScore;
        firstMaskUncoveredAnchorCardIds = anchorCardIds;
        firstMaskUncoveredMask = mask;
      }
    }
    if (safeCountMasks.has(mask)) {
      countMaskCoveredAnchorCount += 1;
    } else {
      countMaskUncoveredAnchorCount += 1;
      if (firstCountMaskUncoveredAnchorIndex === null) {
        firstCountMaskUncoveredAnchorIndex = anchorIndex;
        firstCountMaskUncoveredAnchorScore = anchorScore;
        firstCountMaskUncoveredAnchorCardIds = anchorCardIds;
        firstCountMaskUncoveredMask = mask;
      }
    }
    if (safeMasks.has(mask) || safeCountMasks.has(mask)) {
      unionMaskCoveredAnchorCount += 1;
    } else {
      unionMaskUncoveredAnchorCount += 1;
      if (firstUnionMaskUncoveredAnchorIndex === null) {
        firstUnionMaskUncoveredAnchorIndex = anchorIndex;
        firstUnionMaskUncoveredAnchorScore = anchorScore;
        firstUnionMaskUncoveredAnchorCardIds = anchorCardIds;
        firstUnionMaskUncoveredMask = mask;
      }
    }
  }

  const proofLedgerByMask = new Map<number, Record<string, unknown>>();
  const appendMaskProofLedger = (
    strategy: string,
    maskGroup: (typeof maskGroups)[number],
  ): void => {
    if (!maskGroup.safe || maskGroup.pairUpperExcludingMask === null || maskGroup.totalUpper === null) {
      return;
    }
    const existing = proofLedgerByMask.get(maskGroup.mask);
    const entry = {
      strategy: existing ? `${existing.strategy}+${strategy}` : strategy,
      mask: maskGroup.mask,
      excludedCardIds: maskGroup.excludedCardIds,
      anchorCount: maskGroup.anchorCount,
      firstAnchorIndex: maskGroup.firstAnchorIndex,
      maxAnchorScore: maskGroup.maxAnchorScore,
      generatedPairUpper: maskGroup.pairUpperExcludingMask,
      strictPairUpper: maskGroup.strictPairUpper,
      strictPairUpperSource: maskGroup.strictPairUpperSource,
      leftUnseenUpper: maskGroup.leftUnseenUpper,
      rightUnseenUpper: maskGroup.rightUnseenUpper,
      leftEffectivePeekUpperBound: maskGroup.leftEffectivePeekUpperBound,
      rightEffectivePeekUpperBound: maskGroup.rightEffectivePeekUpperBound,
      leftConstrainedPeekUpperBound: maskGroup.leftConstrainedPeekUpperBound,
      rightConstrainedPeekUpperBound: maskGroup.rightConstrainedPeekUpperBound,
      leftConstrainedPeekCompleted: maskGroup.leftConstrainedPeekCompleted,
      rightConstrainedPeekCompleted: maskGroup.rightConstrainedPeekCompleted,
      leftConstrainedPeekTimedOut: maskGroup.leftConstrainedPeekTimedOut,
      rightConstrainedPeekTimedOut: maskGroup.rightConstrainedPeekTimedOut,
      leftConstrainedPeekHeapNodeCount: maskGroup.leftConstrainedPeekHeapNodeCount,
      rightConstrainedPeekHeapNodeCount: maskGroup.rightConstrainedPeekHeapNodeCount,
      leftConstrainedPeekScannedNodeCount: maskGroup.leftConstrainedPeekScannedNodeCount,
      rightConstrainedPeekScannedNodeCount: maskGroup.rightConstrainedPeekScannedNodeCount,
      leftConstrainedPeekElapsedMs: maskGroup.leftConstrainedPeekElapsedMs,
      rightConstrainedPeekElapsedMs: maskGroup.rightConstrainedPeekElapsedMs,
      leftConstrainedPeekReduction: maskGroup.leftConstrainedPeekReduction,
      rightConstrainedPeekReduction: maskGroup.rightConstrainedPeekReduction,
      totalUpper: maskGroup.totalUpper,
      incumbentScore,
      margin: incumbentScore - maskGroup.totalUpper,
      pairSplitStateCount: maskGroup.pairSplitStateCount,
      pairSplitAbortReason: maskGroup.pairSplitAbortReason,
    };
    proofLedgerByMask.set(maskGroup.mask, entry);
  };
  for (const maskGroup of maskGroups) {
    appendMaskProofLedger("max-score", maskGroup);
  }
  for (const maskGroup of countMaskGroups) {
    appendMaskProofLedger("count", maskGroup);
  }
  const maskProofLedger = [...proofLedgerByMask.values()].sort((left, right) => (
    Number(right.anchorCount ?? 0) - Number(left.anchorCount ?? 0)
    || Number(right.margin ?? 0) - Number(left.margin ?? 0)
    || Number(left.mask ?? 0) - Number(right.mask ?? 0)
  ));

  return {
    algorithm: "hhwx-raw-pair-witness-anchor-cover-v1",
    behaviorChange: false,
    timeboxMs: MEDLEY_EXACT_RAW_PAIR_WITNESS_COVER_TIMEBOX_MS,
    pairScore,
    pairCardIds: [...pairCardIds],
    relevantAnchorCount,
    safeCardIds: [...safeCardIds],
    safeGroupCount: groups.filter((group) => group.safe).length,
    coveredAnchorCount,
    uncoveredAnchorCount,
    firstUncoveredAnchorIndex,
    firstUncoveredAnchorScore,
    firstUncoveredAnchorCardIds,
    allRelevantAnchorsCovered: relevantAnchorCount > 0 && uncoveredAnchorCount === 0,
    pairSplitCompletedCount,
    pairSplitTimedOutCount,
    pairSplitStateCountTotal,
    pairSplitStateBudget: MEDLEY_EXACT_RAW_PAIR_WITNESS_COVER_PAIR_SPLIT_STATE_BUDGET,
    stoppedByBudget,
    maskGroupCount: maskGroupsByMask.size,
    maskSplitLimit: MEDLEY_EXACT_RAW_PAIR_WITNESS_COVER_MASK_SPLIT_LIMIT,
    safeMaskCount: safeMasks.size,
    maskCoveredAnchorCount,
    maskUncoveredAnchorCount,
    firstMaskUncoveredAnchorIndex,
    firstMaskUncoveredAnchorScore,
    firstMaskUncoveredAnchorCardIds,
    firstMaskUncoveredMask,
    allRelevantAnchorsMaskCovered: relevantAnchorCount > 0 && maskUncoveredAnchorCount === 0,
    maskPairSplitCompletedCount,
    maskPairSplitTimedOutCount,
    maskPairSplitStateCountTotal,
    maskStoppedByBudget,
    constrainedPeekSampleLimit: MEDLEY_EXACT_RAW_PAIR_WITNESS_CONSTRAINED_PEEK_SAMPLE_LIMIT,
    constrainedPeekTimeboxMs: MEDLEY_EXACT_RAW_PAIR_WITNESS_CONSTRAINED_PEEK_TIMEBOX_MS,
    constrainedPeekProbeCount,
    countMaskStrategy: {
      maskSplitLimit: MEDLEY_EXACT_RAW_PAIR_WITNESS_COVER_COUNT_MASK_SPLIT_LIMIT,
      safeMaskCount: safeCountMasks.size,
      coveredAnchorCount: countMaskCoveredAnchorCount,
      uncoveredAnchorCount: countMaskUncoveredAnchorCount,
      firstUncoveredAnchorIndex: firstCountMaskUncoveredAnchorIndex,
      firstUncoveredAnchorScore: firstCountMaskUncoveredAnchorScore,
      firstUncoveredAnchorCardIds: firstCountMaskUncoveredAnchorCardIds,
      firstUncoveredMask: firstCountMaskUncoveredMask,
      allRelevantAnchorsCovered: relevantAnchorCount > 0 && countMaskUncoveredAnchorCount === 0,
      pairSplitCompletedCount: countMaskPairSplitCompletedCount,
      pairSplitTimedOutCount: countMaskPairSplitTimedOutCount,
      pairSplitStateCountTotal: countMaskPairSplitStateCountTotal,
      stoppedByBudget: countMaskStoppedByBudget,
      maskGroups: countMaskGroups,
    },
    unionMaskStrategy: {
      safeMaskCount: new Set([...safeMasks, ...safeCountMasks]).size,
      coveredAnchorCount: unionMaskCoveredAnchorCount,
      uncoveredAnchorCount: unionMaskUncoveredAnchorCount,
      firstUncoveredAnchorIndex: firstUnionMaskUncoveredAnchorIndex,
      firstUncoveredAnchorScore: firstUnionMaskUncoveredAnchorScore,
      firstUncoveredAnchorCardIds: firstUnionMaskUncoveredAnchorCardIds,
      firstUncoveredMask: firstUnionMaskUncoveredMask,
      allRelevantAnchorsCovered: relevantAnchorCount > 0 && unionMaskUncoveredAnchorCount === 0,
    },
    maskProofLedgerCount: maskProofLedger.length,
    maskProofLedgerImpliedAnchorCount: unionMaskCoveredAnchorCount,
    maskProofLedgerDroppedAnchorCount: unionMaskUncoveredAnchorCount,
    maskProofLedger,
    maskGroups,
    timedOut,
    elapsedMs: Math.round(performance.now() - startedAt),
    groups,
  };
}

function medleyExactRawCandidateHasCardIdInSet(
  slot: MedleyExactRawCandidateSlotLike,
  candidateIndex: number,
  cardIds: Set<number>,
): boolean {
  const baseCardIndex = candidateIndex * MEDLEY_TEAM_SIZE;
  for (let cardIndex = 0; cardIndex < MEDLEY_TEAM_SIZE; cardIndex += 1) {
    const cardId = slot.cardIds[baseCardIndex + cardIndex];
    if (cardId >= 0 && cardIds.has(cardId)) {
      return true;
    }
  }
  return false;
}

function getFirstMedleyExactRawCandidateOverlapCardId(
  leftSlot: MedleyExactRawCandidateSlotLike,
  leftIndex: number,
  rightSlot: MedleyExactRawCandidateSlotLike,
  rightIndex: number,
): number | null {
  const leftBaseCardIndex = leftIndex * MEDLEY_TEAM_SIZE;
  const rightBaseCardIndex = rightIndex * MEDLEY_TEAM_SIZE;
  for (let leftCardIndex = 0; leftCardIndex < MEDLEY_TEAM_SIZE; leftCardIndex += 1) {
    const leftCardId = leftSlot.cardIds[leftBaseCardIndex + leftCardIndex];
    if (leftCardId < 0) {
      continue;
    }
    for (let rightCardIndex = 0; rightCardIndex < MEDLEY_TEAM_SIZE; rightCardIndex += 1) {
      if (leftCardId === rightSlot.cardIds[rightBaseCardIndex + rightCardIndex]) {
        return leftCardId;
      }
    }
  }
  return null;
}

function findBestAvailableMedleyExactRawRightCandidateByForbiddenCardIds(
  rightSlot: MedleyExactRawCandidateSlotLike,
  containingRightCandidateBitsByCardId: Map<number, Uint32Array>,
  wordCount: number,
  primaryForbiddenCardIds: readonly number[],
  secondaryForbiddenCardIds: readonly number[],
): { candidateIndex: number; scannedWordCount: number } {
  if (rightSlot.length === 0) {
    return { candidateIndex: -1, scannedWordCount: 0 };
  }
  const containingBits: Uint32Array[] = [];
  const appendContainingBits = (cardIds: readonly number[]): void => {
    for (const cardId of cardIds) {
      const bits = containingRightCandidateBitsByCardId.get(cardId);
      if (bits) {
        containingBits.push(bits);
      }
    }
  };
  appendContainingBits(primaryForbiddenCardIds);
  appendContainingBits(secondaryForbiddenCardIds);
  const lastWordIndex = wordCount - 1;
  const lastWordRemainder = rightSlot.length & 31;
  const lastWordMask = lastWordRemainder === 0
    ? 0xffffffff
    : 0xffffffff >>> (32 - lastWordRemainder);
  const finishAvailableWord = (availableBits: number, wordIndex: number, scannedWordCount: number) => {
    const lowestAvailableBit = availableBits & -availableBits;
    const bitIndex = 31 - Math.clz32(lowestAvailableBit);
    return { candidateIndex: wordIndex * 32 + bitIndex, scannedWordCount };
  };
  if (containingBits.length === 0) {
    return { candidateIndex: 0, scannedWordCount: 1 };
  }
  let scannedWordCount = 0;
  for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
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
  return { candidateIndex: -1, scannedWordCount };
}

function estimateGeneratedMedleyExactRawCandidatePairUpperExcludingCardIdsByScan(
  leftSlot: MedleyExactRawCandidateSlotLike,
  rightSlot: MedleyExactRawCandidateSlotLike,
  containingRightCandidateBitsByCardId: Map<number, Uint32Array>,
  bannedCardIds: Iterable<number>,
  minimumRelevantScore = Number.NEGATIVE_INFINITY,
): {
  upperBound: number;
  scannedLeftCandidateCount: number;
  scannedRightWordCount: number;
} {
  let bestScore = Number.NEGATIVE_INFINITY;
  const bannedCardIdSet = bannedCardIds instanceof Set ? bannedCardIds : new Set<number>(bannedCardIds);
  const bannedCardIdList = [...bannedCardIdSet];
  const bestRightScore = rightSlot.scores[0] ?? Number.NEGATIVE_INFINITY;
  const rightWordCount = Math.ceil(rightSlot.length / 32);
  let scannedLeftCandidateCount = 0;
  let scannedRightWordCount = 0;
  for (let leftIndex = 0; leftIndex < leftSlot.length; leftIndex += 1) {
    scannedLeftCandidateCount += 1;
    if (medleyExactRawCandidateHasCardIdInSet(leftSlot, leftIndex, bannedCardIdSet)) {
      continue;
    }
    const cutoff = Math.max(bestScore, minimumRelevantScore);
    if (leftSlot.scores[leftIndex] + bestRightScore <= cutoff) {
      break;
    }
    const rightQueryResult = findBestAvailableMedleyExactRawRightCandidateByForbiddenCardIds(
      rightSlot,
      containingRightCandidateBitsByCardId,
      rightWordCount,
      bannedCardIdList,
      getMedleyExactRawCandidateCardIds(leftSlot, leftIndex),
    );
    scannedRightWordCount += rightQueryResult.scannedWordCount;
    if (rightQueryResult.candidateIndex < 0) {
      continue;
    }
    const score = leftSlot.scores[leftIndex] + rightSlot.scores[rightQueryResult.candidateIndex];
    if (score > minimumRelevantScore) {
      bestScore = Math.max(bestScore, score);
    }
  }
  return { upperBound: bestScore, scannedLeftCandidateCount, scannedRightWordCount };
}

function estimateGeneratedMedleyExactRawCandidatePairConflictSplitUpper(
  leftSlot: MedleyExactRawCandidateSlotLike,
  rightSlot: MedleyExactRawCandidateSlotLike,
  containingLeftBitsByCardId: Map<number, Uint32Array>,
  containingRightBitsByCardId: Map<number, Uint32Array>,
  anchorCardIds: readonly number[],
  localDeadlineAt: number,
  stateBudget = MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_CHEAP_UPPER_SPLIT_STATE_BUDGET,
): {
  upperBound: number;
  timedOut: boolean;
  abortReason: string | null;
  stateCount: number;
  leftCandidateIndex: number | null;
  rightCandidateIndex: number | null;
} {
  type SplitResult = {
    upperBound: number;
    leftCandidateIndex: number | null;
    rightCandidateIndex: number | null;
  };
  const initialBannedCardIds = [...anchorCardIds].sort((left, right) => left - right);
  const leftWordCount = Math.ceil(leftSlot.length / 32);
  const rightWordCount = Math.ceil(rightSlot.length / 32);
  const cache = new Map<string, SplitResult>();
  let stateCount = 0;
  let timedOut = false;
  let abortReason: string | null = null;
  const finishResult = (
    upperBound: number,
    leftCandidateIndex: number | null = null,
    rightCandidateIndex: number | null = null,
  ): SplitResult => ({ upperBound, leftCandidateIndex, rightCandidateIndex });

  const visit = (leftBannedCardIds: readonly number[], rightBannedCardIds: readonly number[]): SplitResult => {
    if (timedOut) {
      return finishResult(Number.POSITIVE_INFINITY);
    }
    if (stateCount >= stateBudget) {
      timedOut = true;
      abortReason = "state-budget";
      return finishResult(Number.POSITIVE_INFINITY);
    }
    if (performance.now() >= localDeadlineAt) {
      timedOut = true;
      abortReason = "timebox";
      return finishResult(Number.POSITIVE_INFINITY);
    }
    const key = `${leftBannedCardIds.join(",")}|${rightBannedCardIds.join(",")}`;
    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    stateCount += 1;
    const leftCandidate = findBestAvailableMedleyExactRawRightCandidateByForbiddenCardIds(
      leftSlot,
      containingLeftBitsByCardId,
      leftWordCount,
      [],
      leftBannedCardIds,
    );
    const rightCandidate = findBestAvailableMedleyExactRawRightCandidateByForbiddenCardIds(
      rightSlot,
      containingRightBitsByCardId,
      rightWordCount,
      [],
      rightBannedCardIds,
    );
    if (leftCandidate.candidateIndex < 0 || rightCandidate.candidateIndex < 0) {
      const result = finishResult(Number.NEGATIVE_INFINITY);
      cache.set(key, result);
      return result;
    }
    const overlapCardId = getFirstMedleyExactRawCandidateOverlapCardId(
      leftSlot,
      leftCandidate.candidateIndex,
      rightSlot,
      rightCandidate.candidateIndex,
    );
    if (overlapCardId === null) {
      const upperBound = (
        leftSlot.scores[leftCandidate.candidateIndex]
        + rightSlot.scores[rightCandidate.candidateIndex]
      );
      const result = finishResult(upperBound, leftCandidate.candidateIndex, rightCandidate.candidateIndex);
      cache.set(key, result);
      return result;
    }
    const leftBranch = visit(
      addSortedUniqueCardId(leftBannedCardIds, overlapCardId),
      rightBannedCardIds,
    );
    const rightBranch = visit(
      leftBannedCardIds,
      addSortedUniqueCardId(rightBannedCardIds, overlapCardId),
    );
    const result = leftBranch.upperBound >= rightBranch.upperBound ? leftBranch : rightBranch;
    cache.set(key, result);
    return result;
  };

  const result = visit(initialBannedCardIds, initialBannedCardIds);
  return {
    upperBound: result.upperBound,
    timedOut,
    abortReason,
    stateCount,
    leftCandidateIndex: result.leftCandidateIndex,
    rightCandidateIndex: result.rightCandidateIndex,
  };
}

function getFirstMedleyExactRawCandidateTripleOverlap(
  slots: readonly MedleyExactRawCandidatePoolSlot[],
  candidateIndices: readonly number[],
): { cardId: number; firstSlotIndex: number; secondSlotIndex: number } | null {
  for (let firstSlotIndex = 0; firstSlotIndex < slots.length; firstSlotIndex += 1) {
    for (let secondSlotIndex = firstSlotIndex + 1; secondSlotIndex < slots.length; secondSlotIndex += 1) {
      const cardId = getFirstMedleyExactRawCandidateOverlapCardId(
        slots[firstSlotIndex],
        candidateIndices[firstSlotIndex],
        slots[secondSlotIndex],
        candidateIndices[secondSlotIndex],
      );
      if (cardId !== null) {
        return { cardId, firstSlotIndex, secondSlotIndex };
      }
    }
  }
  return null;
}

function estimateGeneratedMedleyExactRawCandidateTripleConflictSplitUpper(
  slots: readonly MedleyExactRawCandidatePoolSlot[],
  containingBitsBySlotByCardId: ReadonlyArray<Map<number, Uint32Array>>,
  localDeadlineAt: number,
): {
  upperBound: number;
  timedOut: boolean;
  abortReason: string | null;
  stateCount: number;
  candidateIndices: Array<number | null>;
} {
  type SplitResult = {
    upperBound: number;
    candidateIndices: Array<number | null>;
  };
  const wordCounts = slots.map((slot) => Math.ceil(slot.length / 32));
  const cache = new Map<string, SplitResult>();
  let stateCount = 0;
  let timedOut = false;
  let abortReason: string | null = null;
  const finishResult = (
    upperBound: number,
    candidateIndices: Array<number | null> = slots.map(() => null),
  ): SplitResult => ({ upperBound, candidateIndices });

  const visit = (bannedCardIdsBySlot: readonly (readonly number[])[]): SplitResult => {
    if (timedOut) {
      return finishResult(Number.POSITIVE_INFINITY);
    }
    if (stateCount >= MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_CHEAP_UPPER_SPLIT_STATE_BUDGET) {
      timedOut = true;
      abortReason = "state-budget";
      return finishResult(Number.POSITIVE_INFINITY);
    }
    if (performance.now() >= localDeadlineAt) {
      timedOut = true;
      abortReason = "timebox";
      return finishResult(Number.POSITIVE_INFINITY);
    }
    const key = bannedCardIdsBySlot.map((cardIds) => cardIds.join(",")).join("|");
    const cached = cache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    stateCount += 1;
    const candidateIndices: number[] = [];
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const candidate = findBestAvailableMedleyExactRawRightCandidateByForbiddenCardIds(
        slots[slotIndex],
        containingBitsBySlotByCardId[slotIndex],
        wordCounts[slotIndex],
        [],
        bannedCardIdsBySlot[slotIndex],
      );
      if (candidate.candidateIndex < 0) {
        const result = finishResult(Number.NEGATIVE_INFINITY);
        cache.set(key, result);
        return result;
      }
      candidateIndices.push(candidate.candidateIndex);
    }
    const overlap = getFirstMedleyExactRawCandidateTripleOverlap(slots, candidateIndices);
    if (overlap === null) {
      const upperBound = candidateIndices.reduce((sum, candidateIndex, slotIndex) => (
        sum + slots[slotIndex].scores[candidateIndex]
      ), 0);
      const result = finishResult(upperBound, [...candidateIndices]);
      cache.set(key, result);
      return result;
    }
    const branchResults = [overlap.firstSlotIndex, overlap.secondSlotIndex].map((slotIndexToBan) => {
      const nextBannedCardIdsBySlot = bannedCardIdsBySlot.map((cardIds, slotIndex) => (
        slotIndex === slotIndexToBan ? addSortedUniqueCardId(cardIds, overlap.cardId) : cardIds
      ));
      return visit(nextBannedCardIdsBySlot);
    });
    const result = branchResults[0].upperBound >= branchResults[1].upperBound
      ? branchResults[0]
      : branchResults[1];
    cache.set(key, result);
    return result;
  };

  const result = visit(slots.map(() => []));
  return {
    upperBound: result.upperBound,
    timedOut,
    abortReason,
    stateCount,
    candidateIndices: result.candidateIndices,
  };
}

function buildMedleyExactRawAnchorCheapUpperReplayProfile(
  candidatesBySlot: readonly MedleyTeamCandidate[][],
  generators: readonly MedleyExactSlotCandidateGenerator[],
  exactPairUpperByExcludedSlot: ReadonlyArray<number | null>,
): Record<string, unknown> {
  const startedAt = performance.now();
  const candidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
  const candidateCountTotal = candidateCountsBySlot.reduce((sum, count) => sum + count, 0);
  if (candidateCountTotal > MEDLEY_EXACT_RAW_ANCHOR_CHEAP_UPPER_REPLAY_MAX_CANDIDATE_TOTAL) {
    return {
      algorithm: "hhwx-raw-anchor-cheap-upper-replay-v1",
      enabled: true,
      skipped: true,
      skipReason: "candidate-total-limit",
      candidateCountTotal,
      candidateCountsBySlot,
      limit: MEDLEY_EXACT_RAW_ANCHOR_CHEAP_UPPER_REPLAY_MAX_CANDIDATE_TOTAL,
      rawPoolBuilt: false,
    };
  }
  const anchorSlotIndex = exactPairUpperByExcludedSlot
    .map((pairUpperBound, slotIndex) => ({ slotIndex, pairUpperBound }))
    .filter((entry): entry is { slotIndex: number; pairUpperBound: number } => (
      entry.pairUpperBound !== null && Number.isFinite(entry.pairUpperBound)
    ))
    .sort((left, right) => right.pairUpperBound - left.pairUpperBound)[0]?.slotIndex;
  if (anchorSlotIndex === undefined) {
    return {
      algorithm: "hhwx-raw-anchor-cheap-upper-replay-v1",
      enabled: true,
      skipped: true,
      skipReason: "no-finite-pair-upper",
      candidateCountTotal,
      candidateCountsBySlot,
      rawPoolBuilt: false,
    };
  }

  const pairSlotIndices = candidatesBySlot
    .map((_, slotIndex) => slotIndex)
    .filter((slotIndex) => slotIndex !== anchorSlotIndex) as [number, number];
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
  const rawAnchorSlot = buildMedleyExactRawCandidatePoolSlot(anchorCandidates);
  const rawLeftSlot = buildMedleyExactRawCandidatePoolSlot(leftCandidates);
  const rawRightSlot = buildMedleyExactRawCandidatePoolSlot(rightCandidates);
  const rawLeftWordCount = Math.ceil(rawLeftSlot.length / 32);
  const rawRightWordCount = Math.ceil(rawRightSlot.length / 32);
  const containingRawLeftBitsByCardId = buildMedleyExactRawJoinContainingBitsByCardId(
    rawLeftSlot,
    rawLeftWordCount,
  );
  const containingRawRightBitsByCardId = buildMedleyExactRawJoinContainingBitsByCardId(
    rawRightSlot,
    rawRightWordCount,
  );
  const leftPeekUpperBound = generators[leftSlotIndex]?.peekUpperBound() ?? Number.NEGATIVE_INFINITY;
  const rightPeekUpperBound = generators[rightSlotIndex]?.peekUpperBound() ?? Number.NEGATIVE_INFINITY;
  const finiteScore = (score: number): number => (
    Number.isFinite(score) ? score : Number.NEGATIVE_INFINITY
  );
  const combineScores = (leftScore: number, rightScore: number): number => (
    Number.isFinite(leftScore) && Number.isFinite(rightScore)
      ? leftScore + rightScore
      : Number.NEGATIVE_INFINITY
  );
  const sourceForUpper = (
    upperBound: number,
    generatedPairUpper: number,
    leftUnseenUpper: number,
  ): string => (
    upperBound === generatedPairUpper
      ? "generated-pair"
      : upperBound === leftUnseenUpper
        ? "left-unseen"
        : "right-unseen"
  );

  const sampleCount = Math.min(
    anchorCandidates.length,
    MEDLEY_EXACT_RAW_ANCHOR_CHEAP_UPPER_REPLAY_SAMPLE_LIMIT,
  );
  const samples = Array.from({ length: sampleCount }, (_, anchorIndex) => {
    const anchorCandidate = anchorCandidates[anchorIndex];
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
    const objectLeftBestPossible = Math.max(leftGeneratedScore, finiteScore(leftPeekUpperBound));
    const objectRightBestPossible = Math.max(rightGeneratedScore, finiteScore(rightPeekUpperBound));
    const objectGeneratedPairUpper = combineScores(leftGeneratedScore, rightGeneratedScore);
    const objectLeftUnseenUpper = combineScores(finiteScore(leftPeekUpperBound), objectRightBestPossible);
    const objectRightUnseenUpper = combineScores(finiteScore(rightPeekUpperBound), objectLeftBestPossible);
    const objectUpperBound = Math.max(
      objectGeneratedPairUpper,
      objectLeftUnseenUpper,
      objectRightUnseenUpper,
    );

    const rawAnchorCardIds = getMedleyExactRawCandidateCardIds(rawAnchorSlot, anchorIndex);
    const rawLeftResult = findBestAvailableMedleyExactRawRightCandidateByForbiddenCardIds(
      rawLeftSlot,
      containingRawLeftBitsByCardId,
      rawLeftWordCount,
      [],
      rawAnchorCardIds,
    );
    const rawRightResult = findBestAvailableMedleyExactRawRightCandidateByForbiddenCardIds(
      rawRightSlot,
      containingRawRightBitsByCardId,
      rawRightWordCount,
      [],
      rawAnchorCardIds,
    );
    const rawLeftGeneratedScore = finiteScore(
      rawLeftResult.candidateIndex >= 0
        ? rawLeftSlot.scores[rawLeftResult.candidateIndex]
        : Number.NEGATIVE_INFINITY,
    );
    const rawRightGeneratedScore = finiteScore(
      rawRightResult.candidateIndex >= 0
        ? rawRightSlot.scores[rawRightResult.candidateIndex]
        : Number.NEGATIVE_INFINITY,
    );
    const rawLeftBestPossible = Math.max(rawLeftGeneratedScore, finiteScore(leftPeekUpperBound));
    const rawRightBestPossible = Math.max(rawRightGeneratedScore, finiteScore(rightPeekUpperBound));
    const rawGeneratedPairUpper = combineScores(rawLeftGeneratedScore, rawRightGeneratedScore);
    const rawLeftUnseenUpper = combineScores(finiteScore(leftPeekUpperBound), rawRightBestPossible);
    const rawRightUnseenUpper = combineScores(finiteScore(rightPeekUpperBound), rawLeftBestPossible);
    const rawUpperBound = Math.max(rawGeneratedPairUpper, rawLeftUnseenUpper, rawRightUnseenUpper);
    return {
      anchorIndex,
      anchorScore: anchorCandidate.result.score,
      objectUpperBound: Number.isFinite(objectUpperBound) ? objectUpperBound : null,
      rawUpperBound: Number.isFinite(rawUpperBound) ? rawUpperBound : null,
      objectSource: sourceForUpper(objectUpperBound, objectGeneratedPairUpper, objectLeftUnseenUpper),
      rawSource: sourceForUpper(rawUpperBound, rawGeneratedPairUpper, rawLeftUnseenUpper),
      objectGeneratedPairUpper: Number.isFinite(objectGeneratedPairUpper) ? objectGeneratedPairUpper : null,
      rawGeneratedPairUpper: Number.isFinite(rawGeneratedPairUpper) ? rawGeneratedPairUpper : null,
      objectLeftUnseenUpper: Number.isFinite(objectLeftUnseenUpper) ? objectLeftUnseenUpper : null,
      rawLeftUnseenUpper: Number.isFinite(rawLeftUnseenUpper) ? rawLeftUnseenUpper : null,
      objectRightUnseenUpper: Number.isFinite(objectRightUnseenUpper) ? objectRightUnseenUpper : null,
      rawRightUnseenUpper: Number.isFinite(rawRightUnseenUpper) ? rawRightUnseenUpper : null,
      matched: (
        objectUpperBound === rawUpperBound
        && objectGeneratedPairUpper === rawGeneratedPairUpper
        && objectLeftUnseenUpper === rawLeftUnseenUpper
        && objectRightUnseenUpper === rawRightUnseenUpper
      ),
      rawLeftScannedWordCount: rawLeftResult.scannedWordCount,
      rawRightScannedWordCount: rawRightResult.scannedWordCount,
    };
  });

  return {
    algorithm: "hhwx-raw-anchor-cheap-upper-replay-v1",
    enabled: true,
    skipped: false,
    source: "local-sorted-raw-candidate-pool",
    candidateCountTotal,
    candidateCountsBySlot,
    anchorSlotIndex,
    pairSlotIndices,
    pairUpperBound: exactPairUpperByExcludedSlot[anchorSlotIndex],
    leftPeekUpperBound: Number.isFinite(leftPeekUpperBound) ? leftPeekUpperBound : null,
    rightPeekUpperBound: Number.isFinite(rightPeekUpperBound) ? rightPeekUpperBound : null,
    sampleLimit: MEDLEY_EXACT_RAW_ANCHOR_CHEAP_UPPER_REPLAY_SAMPLE_LIMIT,
    sampleCount,
    matched: samples.every((sample) => sample.matched),
    mismatchCount: samples.filter((sample) => !sample.matched).length,
    elapsedMs: Math.round(performance.now() - startedAt),
    rawRetainedMiB: roundMiB(
      getMedleyExactRawCandidatePoolSlotBytes(rawAnchorSlot)
      + getMedleyExactRawCandidatePoolSlotBytes(rawLeftSlot)
      + getMedleyExactRawCandidatePoolSlotBytes(rawRightSlot),
    ),
    samples,
  };
}

function buildMedleyExactRawAnchorFrontierProbeProfile(
  candidatesBySlot: readonly MedleyTeamCandidate[][],
  rawCandidatePoolProvider: () => MedleyExactRawCandidatePool,
  generators: readonly MedleyExactSlotCandidateGenerator[],
  anchorSlotIndex: number,
  pairUpperBound: number,
  incumbentScore: number,
  deadlineAt: number,
  maxCandidateTotal: number | null = null,
  enableConstrainedPeekProbe = false,
  enablePairPricingFrontierProbe = false,
): Record<string, unknown> {
  const startedAt = performance.now();
  const candidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
  const candidateCountTotal = candidateCountsBySlot.reduce((sum, count) => sum + count, 0);
  const effectiveMaxCandidateTotal = (
    maxCandidateTotal !== null
    && Number.isFinite(maxCandidateTotal)
    && maxCandidateTotal >= 0
      ? Math.trunc(maxCandidateTotal)
      : MEDLEY_EXACT_RAW_ANCHOR_FRONTIER_PROBE_MAX_CANDIDATE_TOTAL
  );
  const finishSkipped = (
    skipReason: string,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    algorithm: "hhwx-raw-anchor-frontier-probe-v1",
    enabled: true,
    skipped: true,
    skipReason,
    candidateCountTotal,
    candidateCountsBySlot,
    anchorSlotIndex,
    pairUpperBound: Number.isFinite(pairUpperBound) ? pairUpperBound : null,
    incumbentScore: Number.isFinite(incumbentScore) ? incumbentScore : null,
    elapsedMs: Math.round(performance.now() - startedAt),
    ...extra,
  });
  if (
    anchorSlotIndex < 0
    || anchorSlotIndex >= candidatesBySlot.length
  ) {
    return finishSkipped("anchor-slot-index");
  }
  if (candidateCountTotal > effectiveMaxCandidateTotal) {
    return finishSkipped("candidate-total-limit", {
      limit: effectiveMaxCandidateTotal,
      rawPoolBuilt: false,
    });
  }
  if (!Number.isFinite(pairUpperBound)) {
    return finishSkipped("pair-upper");
  }

  const pairSlotIndices = candidatesBySlot
    .map((_, slotIndex) => slotIndex)
    .filter((slotIndex) => slotIndex !== anchorSlotIndex) as [number, number];
  if (pairSlotIndices.length !== 2) {
    return finishSkipped("pair-slot-indices");
  }
  if (candidateCountsBySlot[anchorSlotIndex] <= 0) {
    return finishSkipped("empty-anchor-slot");
  }
  if (candidateCountsBySlot[pairSlotIndices[0]] <= 0 || candidateCountsBySlot[pairSlotIndices[1]] <= 0) {
    return finishSkipped("empty-pair-slot");
  }

  const rawPool = rawCandidatePoolProvider();
  const scoreOrderViolationCountTotal = rawPool.slots.reduce(
    (sum, slot) => sum + slot.scoreOrderViolationCount,
    0,
  );
  const mismatchCountTotal = rawPool.slots.reduce((sum, slot) => sum + slot.mismatchCount, 0);
  if (scoreOrderViolationCountTotal > 0 || mismatchCountTotal > 0) {
    return finishSkipped("raw-pool-consistency", {
      rawPoolBuilt: true,
      scoreOrderViolationCountTotal,
      mismatchCountTotal,
      rawPoolBuildElapsedMs: rawPool.buildElapsedMs,
    });
  }

  const buildBitsStartedAt = performance.now();
  const anchorSlot = rawPool.slots[anchorSlotIndex];
  const leftSlotIndex = pairSlotIndices[0];
  const rightSlotIndex = pairSlotIndices[1];
  const leftSlot = rawPool.slots[leftSlotIndex];
  const rightSlot = rawPool.slots[rightSlotIndex];
  const leftWordCount = Math.ceil(leftSlot.length / 32);
  const rightWordCount = Math.ceil(rightSlot.length / 32);
  const containingLeftBitsByCardId = buildMedleyExactRawJoinContainingBitsByCardId(leftSlot, leftWordCount);
  const containingRightBitsByCardId = buildMedleyExactRawJoinContainingBitsByCardId(rightSlot, rightWordCount);
  const buildBitsElapsedMs = performance.now() - buildBitsStartedAt;
  const localDeadlineAt = Math.min(
    deadlineAt,
    startedAt + MEDLEY_EXACT_RAW_ANCHOR_FRONTIER_PROBE_TIMEBOX_MS,
  );
  const maxAnchorCount = Math.min(
    anchorSlot.length,
    MEDLEY_EXACT_RAW_ANCHOR_FRONTIER_PROBE_MAX_ANCHORS,
  );
  const leftPeekUpperBound = generators[leftSlotIndex]?.peekUpperBound() ?? Number.NEGATIVE_INFINITY;
  const rightPeekUpperBound = generators[rightSlotIndex]?.peekUpperBound() ?? Number.NEGATIVE_INFINITY;
  const anchorPeekUpperBound = generators[anchorSlotIndex]?.peekUpperBound() ?? Number.NEGATIVE_INFINITY;
  const finiteScore = (score: number): number => (
    Number.isFinite(score) ? score : Number.NEGATIVE_INFINITY
  );
  const combineScores = (leftScore: number, rightScore: number): number => (
    Number.isFinite(leftScore) && Number.isFinite(rightScore)
      ? leftScore + rightScore
      : Number.NEGATIVE_INFINITY
  );
  const sourceForUpper = (
    upperBound: number,
    generatedPairUpper: number,
    leftUnseenUpper: number,
  ): string => (
    upperBound === generatedPairUpper
      ? "generated-pair"
      : upperBound === leftUnseenUpper
        ? "left-unseen"
        : "right-unseen"
  );

  const globalPairConflictSplitStartedAt = performance.now();
  const globalPairConflictSplitGeneratedUpper = performance.now() < localDeadlineAt
    ? estimateGeneratedMedleyExactRawCandidatePairConflictSplitUpper(
      leftSlot,
      rightSlot,
      containingLeftBitsByCardId,
      containingRightBitsByCardId,
      [],
      localDeadlineAt,
    )
    : null;
  const globalPairConflictSplitLeftBestGeneratedScore = finiteScore(
    leftSlot.scores[0] ?? Number.NEGATIVE_INFINITY,
  );
  const globalPairConflictSplitRightBestGeneratedScore = finiteScore(
    rightSlot.scores[0] ?? Number.NEGATIVE_INFINITY,
  );
  const globalPairConflictSplitLeftBestPossible = Math.max(
    globalPairConflictSplitLeftBestGeneratedScore,
    finiteScore(leftPeekUpperBound),
  );
  const globalPairConflictSplitRightBestPossible = Math.max(
    globalPairConflictSplitRightBestGeneratedScore,
    finiteScore(rightPeekUpperBound),
  );
  const globalPairConflictSplitLeftUnseenUpper = combineScores(
    finiteScore(leftPeekUpperBound),
    globalPairConflictSplitRightBestPossible,
  );
  const globalPairConflictSplitRightUnseenUpper = combineScores(
    finiteScore(rightPeekUpperBound),
    globalPairConflictSplitLeftBestPossible,
  );
  const globalPairConflictSplitPairUpper = (
    globalPairConflictSplitGeneratedUpper !== null
    && !globalPairConflictSplitGeneratedUpper.timedOut
    && Number.isFinite(globalPairConflictSplitGeneratedUpper.upperBound)
      ? Math.max(
        globalPairConflictSplitGeneratedUpper.upperBound,
        globalPairConflictSplitLeftUnseenUpper,
        globalPairConflictSplitRightUnseenUpper,
      )
      : null
  );
  const globalPairConflictSplitPairUpperSource = globalPairConflictSplitPairUpper === null
    ? null
    : globalPairConflictSplitPairUpper === globalPairConflictSplitGeneratedUpper?.upperBound
      ? "generated-pair-split"
      : globalPairConflictSplitPairUpper === globalPairConflictSplitLeftUnseenUpper
        ? "left-unseen"
        : globalPairConflictSplitPairUpper === globalPairConflictSplitRightUnseenUpper
          ? "right-unseen"
          : "unknown";
  const globalPairConflictSplitLeftCardIds = (
    globalPairConflictSplitGeneratedUpper?.leftCandidateIndex !== null
    && globalPairConflictSplitGeneratedUpper?.leftCandidateIndex !== undefined
      ? getMedleyExactRawCandidateCardIds(leftSlot, globalPairConflictSplitGeneratedUpper.leftCandidateIndex)
      : []
  );
  const globalPairConflictSplitRightCardIds = (
    globalPairConflictSplitGeneratedUpper?.rightCandidateIndex !== null
    && globalPairConflictSplitGeneratedUpper?.rightCandidateIndex !== undefined
      ? getMedleyExactRawCandidateCardIds(rightSlot, globalPairConflictSplitGeneratedUpper.rightCandidateIndex)
      : []
  );
  const globalPairConflictSplitCardIds = [
    ...new Set([...globalPairConflictSplitLeftCardIds, ...globalPairConflictSplitRightCardIds]),
  ].sort((left, right) => left - right);
  const globalPairConflictSplitAnchorCompatibility = (
    globalPairConflictSplitGeneratedUpper !== null
    && !globalPairConflictSplitGeneratedUpper.timedOut
    && Number.isFinite(globalPairConflictSplitGeneratedUpper.upperBound)
    && globalPairConflictSplitGeneratedUpper.leftCandidateIndex !== null
    && globalPairConflictSplitGeneratedUpper.rightCandidateIndex !== null
      ? buildMedleyExactRawAnchorPairCompatibilityProfile(
        anchorSlot,
        globalPairConflictSplitCardIds,
        incumbentScore - globalPairConflictSplitGeneratedUpper.upperBound,
        globalPairConflictSplitGeneratedUpper.upperBound,
        incumbentScore,
      )
      : null
  );
  const globalPairWitnessCover = (
    globalPairConflictSplitGeneratedUpper !== null
    && !globalPairConflictSplitGeneratedUpper.timedOut
    && Number.isFinite(globalPairConflictSplitGeneratedUpper.upperBound)
    && globalPairConflictSplitCardIds.length > 0
      ? buildMedleyExactRawPairWitnessAnchorCoverProfile(
        anchorSlot,
        leftSlot,
        rightSlot,
        containingLeftBitsByCardId,
        containingRightBitsByCardId,
        globalPairConflictSplitCardIds,
        globalPairConflictSplitGeneratedUpper.upperBound,
        leftPeekUpperBound,
        rightPeekUpperBound,
        enableConstrainedPeekProbe ? generators[leftSlotIndex]?.peekUpperBoundExcludingCardIds : undefined,
        enableConstrainedPeekProbe ? generators[rightSlotIndex]?.peekUpperBoundExcludingCardIds : undefined,
        incumbentScore,
        deadlineAt,
      )
      : null
  );
  const globalPairConflictSplitElapsedMs = performance.now() - globalPairConflictSplitStartedAt;

  let processedAnchorCount = 0;
  let timeboxed = false;
  let processedUpperMax = Number.NEGATIVE_INFINITY;
  let processedUpperMaxSource: string | null = null;
  let processedUpperMaxAnchorIndex: number | null = null;
  let processedUpperMaxAnchorScore: number | null = null;
  let processedUpperMaxPairUpper: number | null = null;
  let processedUpperMaxGeneratedPairUpper: number | null = null;
  let processedUpperMaxLeftUnseenUpper: number | null = null;
  let processedUpperMaxRightUnseenUpper: number | null = null;
  let scannedLeftWordCount = 0;
  let scannedRightWordCount = 0;
  let finishedByDominatedTail = false;
  let nextAnchorScore: number | null = null;

  const recordProcessedUpperMax = (
    anchorIndex: number,
    anchorScore: number,
    pairUpper: number,
    source: string,
    generatedPairUpper: number,
    leftUnseenUpper: number,
    rightUnseenUpper: number,
  ): void => {
    const totalUpper = anchorScore + pairUpper;
    if (totalUpper > processedUpperMax) {
      processedUpperMax = totalUpper;
      processedUpperMaxSource = source;
      processedUpperMaxAnchorIndex = anchorIndex;
      processedUpperMaxAnchorScore = anchorScore;
      processedUpperMaxPairUpper = pairUpper;
      processedUpperMaxGeneratedPairUpper = Number.isFinite(generatedPairUpper) ? generatedPairUpper : null;
      processedUpperMaxLeftUnseenUpper = Number.isFinite(leftUnseenUpper) ? leftUnseenUpper : null;
      processedUpperMaxRightUnseenUpper = Number.isFinite(rightUnseenUpper) ? rightUnseenUpper : null;
    }
  };

  for (let anchorIndex = 0; anchorIndex < maxAnchorCount; anchorIndex += 1) {
    const anchorScore = anchorSlot.scores[anchorIndex];
    if (performance.now() >= localDeadlineAt) {
      timeboxed = true;
      nextAnchorScore = anchorScore;
      break;
    }
    if (
      Number.isFinite(processedUpperMax)
      && anchorScore + pairUpperBound <= processedUpperMax
    ) {
      finishedByDominatedTail = true;
      nextAnchorScore = anchorScore;
      break;
    }
    const anchorCardIds = getMedleyExactRawCandidateCardIds(anchorSlot, anchorIndex);
    const leftGeneratedCandidate = findBestAvailableMedleyExactRawRightCandidateByForbiddenCardIds(
      leftSlot,
      containingLeftBitsByCardId,
      leftWordCount,
      [],
      anchorCardIds,
    );
    const rightGeneratedCandidate = findBestAvailableMedleyExactRawRightCandidateByForbiddenCardIds(
      rightSlot,
      containingRightBitsByCardId,
      rightWordCount,
      [],
      anchorCardIds,
    );
    scannedLeftWordCount += leftGeneratedCandidate.scannedWordCount;
    scannedRightWordCount += rightGeneratedCandidate.scannedWordCount;
    processedAnchorCount += 1;

    const leftGeneratedScore = finiteScore(
      leftGeneratedCandidate.candidateIndex >= 0
        ? leftSlot.scores[leftGeneratedCandidate.candidateIndex]
        : Number.NEGATIVE_INFINITY,
    );
    const rightGeneratedScore = finiteScore(
      rightGeneratedCandidate.candidateIndex >= 0
        ? rightSlot.scores[rightGeneratedCandidate.candidateIndex]
        : Number.NEGATIVE_INFINITY,
    );
    const leftBestPossible = Math.max(leftGeneratedScore, finiteScore(leftPeekUpperBound));
    const rightBestPossible = Math.max(rightGeneratedScore, finiteScore(rightPeekUpperBound));
    const generatedPairUpper = combineScores(leftGeneratedScore, rightGeneratedScore);
    const leftUnseenUpper = combineScores(finiteScore(leftPeekUpperBound), rightBestPossible);
    const rightUnseenUpper = combineScores(finiteScore(rightPeekUpperBound), leftBestPossible);
    const pairUpper = Math.max(generatedPairUpper, leftUnseenUpper, rightUnseenUpper);
    if (Number.isFinite(pairUpper)) {
      recordProcessedUpperMax(
        anchorIndex,
        anchorScore,
        pairUpper,
        sourceForUpper(pairUpper, generatedPairUpper, leftUnseenUpper),
        generatedPairUpper,
        leftUnseenUpper,
        rightUnseenUpper,
      );
    }
  }

  if (nextAnchorScore === null && processedAnchorCount < anchorSlot.length) {
    nextAnchorScore = anchorSlot.scores[processedAnchorCount];
  }
  const unprocessedAnchorUpperBound = Math.max(
    nextAnchorScore ?? Number.NEGATIVE_INFINITY,
    finiteScore(anchorPeekUpperBound),
  );
  const unprocessedUpperBound = (
    Number.isFinite(unprocessedAnchorUpperBound) && Number.isFinite(pairUpperBound)
      ? unprocessedAnchorUpperBound + pairUpperBound
      : Number.NEGATIVE_INFINITY
  );
  const looseTailCloseAnchorScoreThreshold = Number.isFinite(pairUpperBound)
    ? incumbentScore - pairUpperBound
    : Number.NEGATIVE_INFINITY;
  let materializedLooseTailCloseIndex: number | null = null;
  for (let anchorIndex = 0; anchorIndex < anchorSlot.length; anchorIndex += 1) {
    if (anchorSlot.scores[anchorIndex] + pairUpperBound <= incumbentScore) {
      materializedLooseTailCloseIndex = anchorIndex;
      break;
    }
  }
  const generatorLooseTailUpperBound = (
    Number.isFinite(anchorPeekUpperBound) && Number.isFinite(pairUpperBound)
      ? anchorPeekUpperBound + pairUpperBound
      : Number.NEGATIVE_INFINITY
  );
  const residualUpperBound = Math.max(processedUpperMax, unprocessedUpperBound);
  const processedUpperMaxAnchorCardIds = processedUpperMaxAnchorIndex !== null
    ? getMedleyExactRawCandidateCardIds(anchorSlot, processedUpperMaxAnchorIndex)
    : [];
  const splitStartedAt = performance.now();
  const processedUpperMaxGeneratedPairSplit = (
    processedUpperMaxAnchorIndex !== null
    && processedUpperMaxSource === "generated-pair"
    && processedUpperMaxAnchorCardIds.length > 0
    && performance.now() < localDeadlineAt
      ? estimateGeneratedMedleyExactRawCandidatePairConflictSplitUpper(
        leftSlot,
        rightSlot,
        containingLeftBitsByCardId,
        containingRightBitsByCardId,
        processedUpperMaxAnchorCardIds,
        localDeadlineAt,
      )
      : null
  );
  const processedUpperMaxSplitPairUpper = processedUpperMaxGeneratedPairSplit
    ? Math.max(
      processedUpperMaxGeneratedPairSplit.upperBound,
      processedUpperMaxLeftUnseenUpper ?? Number.NEGATIVE_INFINITY,
      processedUpperMaxRightUnseenUpper ?? Number.NEGATIVE_INFINITY,
    )
    : null;
  const processedUpperMaxSplitTotalUpper = (
    processedUpperMaxSplitPairUpper !== null
    && processedUpperMaxAnchorScore !== null
    && Number.isFinite(processedUpperMaxSplitPairUpper)
      ? processedUpperMaxAnchorScore + processedUpperMaxSplitPairUpper
      : null
  );
  const processedUpperMaxSplitPairUpperSource = processedUpperMaxSplitPairUpper === null
    ? null
    : processedUpperMaxSplitPairUpper === processedUpperMaxGeneratedPairSplit?.upperBound
      ? "generated-pair-split"
      : processedUpperMaxSplitPairUpper === processedUpperMaxLeftUnseenUpper
        ? "left-unseen"
        : processedUpperMaxSplitPairUpper === processedUpperMaxRightUnseenUpper
          ? "right-unseen"
          : "unknown";
  const splitAdjustedResidualUpperBound = Math.max(
    processedUpperMaxSplitTotalUpper ?? processedUpperMax,
    unprocessedUpperBound,
  );
  const splitAdjustedResidualSource = (
    processedUpperMaxSplitTotalUpper !== null
    && Number.isFinite(processedUpperMaxSplitTotalUpper)
    && processedUpperMaxSplitTotalUpper >= unprocessedUpperBound
      ? "processed-anchor"
      : "unprocessed-tail"
  );
  const processedUpperMaxLeftBestPossible = (
    processedUpperMaxRightUnseenUpper !== null
    && Number.isFinite(rightPeekUpperBound)
      ? processedUpperMaxRightUnseenUpper - rightPeekUpperBound
      : null
  );
  const processedUpperMaxRightBestPossible = (
    processedUpperMaxLeftUnseenUpper !== null
    && Number.isFinite(leftPeekUpperBound)
      ? processedUpperMaxLeftUnseenUpper - leftPeekUpperBound
      : null
  );
  const processedUpperMaxPairUpperToClose = processedUpperMaxAnchorScore !== null
    ? incumbentScore - processedUpperMaxAnchorScore
    : null;
  const processedUpperMaxRightPeekUpperToClose = (
    processedUpperMaxPairUpperToClose !== null
    && processedUpperMaxLeftBestPossible !== null
      ? processedUpperMaxPairUpperToClose - processedUpperMaxLeftBestPossible
      : null
  );
  const processedUpperMaxLeftPeekUpperToClose = (
    processedUpperMaxPairUpperToClose !== null
    && processedUpperMaxRightBestPossible !== null
      ? processedUpperMaxPairUpperToClose - processedUpperMaxRightBestPossible
      : null
  );
  const pairFrontierThresholds: MedleyExactRawPairFrontierThreshold[] = [];
  const addPairFrontierThreshold = (
    name: string,
    threshold: number,
    anchorIndex: number | null = null,
    anchorScore: number | null = null,
  ): void => {
    if (!Number.isFinite(threshold)) {
      return;
    }
    pairFrontierThresholds.push({
      name,
      threshold,
      reductionFromPairUpper: Number.isFinite(pairUpperBound) ? pairUpperBound - threshold : null,
      anchorIndex,
      anchorScore,
    });
  };
  addPairFrontierThreshold("current-pair-upper", pairUpperBound);
  addPairFrontierThreshold(
    "generator-tail-close",
    Number.isFinite(anchorPeekUpperBound) ? incumbentScore - anchorPeekUpperBound : Number.NEGATIVE_INFINITY,
  );
  if (processedUpperMaxAnchorScore !== null) {
    addPairFrontierThreshold(
      "processed-max-anchor-close",
      incumbentScore - processedUpperMaxAnchorScore,
      processedUpperMaxAnchorIndex,
      processedUpperMaxAnchorScore,
    );
  }
  const sampleAnchorIndices = [
    0,
    1,
    8,
    64,
    512,
    4096,
    32768,
    anchorSlot.length - 1,
  ];
  for (const sampleAnchorIndex of sampleAnchorIndices) {
    if (sampleAnchorIndex < 0 || sampleAnchorIndex >= anchorSlot.length) {
      continue;
    }
    const anchorScore = anchorSlot.scores[sampleAnchorIndex];
    addPairFrontierThreshold(
      `anchor-${sampleAnchorIndex}-close`,
      incumbentScore - anchorScore,
      sampleAnchorIndex,
      anchorScore,
    );
  }
  const pairFrontierCensus = buildMedleyExactRawPairFrontierCensusProfile(
    leftSlot,
    rightSlot,
    pairFrontierThresholds,
    localDeadlineAt,
  );
  const pairPricingFrontier = enablePairPricingFrontierProbe
    ? buildMedleyExactRawPairPricingFrontierProfile(
      leftSlot,
      rightSlot,
      Number.isFinite(anchorPeekUpperBound) ? incumbentScore - anchorPeekUpperBound : Number.NEGATIVE_INFINITY,
      localDeadlineAt,
    )
    : null;

  const refinementStartedAt = performance.now();
  let refinedProcessedAnchorCount = 0;
  let refinedTimeboxed = false;
  let refinedFinishedByDominatedTail = false;
  let refinedNextAnchorScore: number | null = null;
  let refinedProcessedUpperMax = Number.NEGATIVE_INFINITY;
  let refinedProcessedUpperMaxSource: string | null = null;
  let refinedProcessedUpperMaxAnchorIndex: number | null = null;
  let refinedProcessedUpperMaxAnchorScore: number | null = null;
  let refinedProcessedUpperMaxPairUpper: number | null = null;
  let refinedProcessedUpperMaxGeneratedPairUpper: number | null = null;
  let refinedProcessedUpperMaxGeneratedPairSplitUpper: number | null = null;
  let refinedProcessedUpperMaxLeftUnseenUpper: number | null = null;
  let refinedProcessedUpperMaxRightUnseenUpper: number | null = null;
  let refinedSplitAttemptCount = 0;
  let refinedSplitCompletedCount = 0;
  let refinedSplitTimedOutCount = 0;
  let refinedSplitStateCount = 0;
  let refinedScannedLeftWordCount = 0;
  let refinedScannedRightWordCount = 0;

  const recordRefinedProcessedUpperMax = (
    anchorIndex: number,
    anchorScore: number,
    pairUpper: number,
    source: string,
    generatedPairUpper: number,
    generatedPairSplitUpper: number | null,
    leftUnseenUpper: number,
    rightUnseenUpper: number,
  ): void => {
    const totalUpper = anchorScore + pairUpper;
    if (totalUpper > refinedProcessedUpperMax) {
      refinedProcessedUpperMax = totalUpper;
      refinedProcessedUpperMaxSource = source;
      refinedProcessedUpperMaxAnchorIndex = anchorIndex;
      refinedProcessedUpperMaxAnchorScore = anchorScore;
      refinedProcessedUpperMaxPairUpper = pairUpper;
      refinedProcessedUpperMaxGeneratedPairUpper = Number.isFinite(generatedPairUpper)
        ? generatedPairUpper
        : null;
      refinedProcessedUpperMaxGeneratedPairSplitUpper = generatedPairSplitUpper !== null
        && Number.isFinite(generatedPairSplitUpper)
        ? generatedPairSplitUpper
        : null;
      refinedProcessedUpperMaxLeftUnseenUpper = Number.isFinite(leftUnseenUpper) ? leftUnseenUpper : null;
      refinedProcessedUpperMaxRightUnseenUpper = Number.isFinite(rightUnseenUpper) ? rightUnseenUpper : null;
    }
  };

  for (let anchorIndex = 0; anchorIndex < maxAnchorCount; anchorIndex += 1) {
    const anchorScore = anchorSlot.scores[anchorIndex];
    if (performance.now() >= localDeadlineAt) {
      refinedTimeboxed = true;
      refinedNextAnchorScore = anchorScore;
      break;
    }
    if (
      Number.isFinite(refinedProcessedUpperMax)
      && anchorScore + pairUpperBound <= refinedProcessedUpperMax
    ) {
      refinedFinishedByDominatedTail = true;
      refinedNextAnchorScore = anchorScore;
      break;
    }

    const anchorCardIds = getMedleyExactRawCandidateCardIds(anchorSlot, anchorIndex);
    const leftGeneratedCandidate = findBestAvailableMedleyExactRawRightCandidateByForbiddenCardIds(
      leftSlot,
      containingLeftBitsByCardId,
      leftWordCount,
      [],
      anchorCardIds,
    );
    const rightGeneratedCandidate = findBestAvailableMedleyExactRawRightCandidateByForbiddenCardIds(
      rightSlot,
      containingRightBitsByCardId,
      rightWordCount,
      [],
      anchorCardIds,
    );
    refinedScannedLeftWordCount += leftGeneratedCandidate.scannedWordCount;
    refinedScannedRightWordCount += rightGeneratedCandidate.scannedWordCount;
    refinedProcessedAnchorCount += 1;

    const leftGeneratedScore = finiteScore(
      leftGeneratedCandidate.candidateIndex >= 0
        ? leftSlot.scores[leftGeneratedCandidate.candidateIndex]
        : Number.NEGATIVE_INFINITY,
    );
    const rightGeneratedScore = finiteScore(
      rightGeneratedCandidate.candidateIndex >= 0
        ? rightSlot.scores[rightGeneratedCandidate.candidateIndex]
        : Number.NEGATIVE_INFINITY,
    );
    const leftBestPossible = Math.max(leftGeneratedScore, finiteScore(leftPeekUpperBound));
    const rightBestPossible = Math.max(rightGeneratedScore, finiteScore(rightPeekUpperBound));
    const generatedPairUpper = combineScores(leftGeneratedScore, rightGeneratedScore);
    const leftUnseenUpper = combineScores(finiteScore(leftPeekUpperBound), rightBestPossible);
    const rightUnseenUpper = combineScores(finiteScore(rightPeekUpperBound), leftBestPossible);
    const loosePairUpper = Math.max(generatedPairUpper, leftUnseenUpper, rightUnseenUpper);
    const looseSource = sourceForUpper(loosePairUpper, generatedPairUpper, leftUnseenUpper);
    let refinedGeneratedPairUpper = generatedPairUpper;
    let generatedPairSplitUpper: number | null = null;
    if (
      looseSource === "generated-pair"
      && Number.isFinite(generatedPairUpper)
      && anchorScore + generatedPairUpper > incumbentScore
      && performance.now() < localDeadlineAt
    ) {
      refinedSplitAttemptCount += 1;
      const splitResult = estimateGeneratedMedleyExactRawCandidatePairConflictSplitUpper(
        leftSlot,
        rightSlot,
        containingLeftBitsByCardId,
        containingRightBitsByCardId,
        anchorCardIds,
        localDeadlineAt,
      );
      refinedSplitStateCount = addCappedCount(refinedSplitStateCount, splitResult.stateCount);
      if (splitResult.timedOut) {
        refinedSplitTimedOutCount += 1;
      } else if (Number.isFinite(splitResult.upperBound)) {
        refinedSplitCompletedCount += 1;
        refinedGeneratedPairUpper = splitResult.upperBound;
        generatedPairSplitUpper = splitResult.upperBound;
      }
    }
    const refinedPairUpper = Math.max(refinedGeneratedPairUpper, leftUnseenUpper, rightUnseenUpper);
    if (Number.isFinite(refinedPairUpper)) {
      recordRefinedProcessedUpperMax(
        anchorIndex,
        anchorScore,
        refinedPairUpper,
        refinedPairUpper === refinedGeneratedPairUpper
          ? generatedPairSplitUpper === null ? "generated-pair" : "generated-pair-split"
          : refinedPairUpper === leftUnseenUpper
            ? "left-unseen"
            : "right-unseen",
        generatedPairUpper,
        generatedPairSplitUpper,
        leftUnseenUpper,
        rightUnseenUpper,
      );
    }
    if (refinedSplitTimedOutCount > 0 && performance.now() >= localDeadlineAt) {
      refinedTimeboxed = true;
      refinedNextAnchorScore = anchorSlot.scores[anchorIndex + 1] ?? null;
      break;
    }
  }

  if (refinedNextAnchorScore === null && refinedProcessedAnchorCount < anchorSlot.length) {
    refinedNextAnchorScore = anchorSlot.scores[refinedProcessedAnchorCount];
  }
  const refinedUnprocessedAnchorUpperBound = Math.max(
    refinedNextAnchorScore ?? Number.NEGATIVE_INFINITY,
    finiteScore(anchorPeekUpperBound),
  );
  const refinedUnprocessedUpperBound = (
    Number.isFinite(refinedUnprocessedAnchorUpperBound) && Number.isFinite(pairUpperBound)
      ? refinedUnprocessedAnchorUpperBound + pairUpperBound
      : Number.NEGATIVE_INFINITY
  );
  const refinedResidualUpperBound = Math.max(refinedProcessedUpperMax, refinedUnprocessedUpperBound);
  const refinedResidualSource = (
    Number.isFinite(refinedProcessedUpperMax)
    && refinedProcessedUpperMax >= refinedUnprocessedUpperBound
      ? "processed-anchor"
      : "unprocessed-tail"
  );
  const globalTripleConflictSplitStartedAt = performance.now();
  const globalTripleConflictSplitAnchorBitsStartedAt = performance.now();
  const anchorWordCount = Math.ceil(anchorSlot.length / 32);
  const containingAnchorBitsByCardId = performance.now() < deadlineAt
    ? buildMedleyExactRawJoinContainingBitsByCardId(anchorSlot, anchorWordCount)
    : null;
  const globalTripleConflictSplitAnchorBitsElapsedMs = performance.now() - globalTripleConflictSplitAnchorBitsStartedAt;
  const globalTripleConflictSplitDeadlineAt = Math.min(
    deadlineAt,
    performance.now() + MEDLEY_EXACT_RAW_TRIPLE_CONFLICT_SPLIT_TIMEBOX_MS,
  );
  const globalTripleConflictSplit = containingAnchorBitsByCardId !== null && performance.now() < deadlineAt
    ? estimateGeneratedMedleyExactRawCandidateTripleConflictSplitUpper(
      [anchorSlot, leftSlot, rightSlot],
      [containingAnchorBitsByCardId, containingLeftBitsByCardId, containingRightBitsByCardId],
      globalTripleConflictSplitDeadlineAt,
    )
    : null;
  const globalTripleConflictSplitCandidateScores = globalTripleConflictSplit?.candidateIndices.map(
    (candidateIndex, slotIndex) => (
      candidateIndex !== null && candidateIndex >= 0
        ? [anchorSlot, leftSlot, rightSlot][slotIndex].scores[candidateIndex]
        : null
    ),
  ) ?? null;
  const globalTripleConflictSplitCandidateCardIds = globalTripleConflictSplit?.candidateIndices.map(
    (candidateIndex, slotIndex) => (
      candidateIndex !== null && candidateIndex >= 0
        ? getMedleyExactRawCandidateCardIds([anchorSlot, leftSlot, rightSlot][slotIndex], candidateIndex)
        : null
    ),
  ) ?? null;
  const globalTripleConflictSplitAnchorBitsBytes = containingAnchorBitsByCardId !== null
    ? sumMedleyExactArrayViewBytes(containingAnchorBitsByCardId.values())
    : 0;
  const containingBitsBytes = sumMedleyExactArrayViewBytes(containingLeftBitsByCardId.values())
    + sumMedleyExactArrayViewBytes(containingRightBitsByCardId.values());
  const rawRetainedBytes = rawPool.slots.reduce(
    (sum, slot) => sum + getMedleyExactRawCandidatePoolSlotBytes(slot),
    0,
  );
  return {
    algorithm: "hhwx-raw-anchor-frontier-probe-v1",
    enabled: true,
    skipped: false,
    source: "shared-current-pool",
    candidateCountTotal,
    candidateCountsBySlot,
    anchorSlotIndex,
    pairSlotIndices,
    pairUpperBound,
    incumbentScore,
    leftPeekUpperBound: Number.isFinite(leftPeekUpperBound) ? leftPeekUpperBound : null,
    rightPeekUpperBound: Number.isFinite(rightPeekUpperBound) ? rightPeekUpperBound : null,
    anchorPeekUpperBound: Number.isFinite(anchorPeekUpperBound) ? anchorPeekUpperBound : null,
    maxAnchorCount,
    processedAnchorCount,
    timeboxed,
    finishedByDominatedTail,
    residualUpperBound: Number.isFinite(residualUpperBound) ? Math.ceil(residualUpperBound) : null,
    residualGap: Number.isFinite(residualUpperBound) ? Math.max(0, Math.ceil(residualUpperBound) - incumbentScore) : null,
    wouldClose: Number.isFinite(residualUpperBound) && residualUpperBound <= incumbentScore,
    unprocessedAnchorUpperBound: Number.isFinite(unprocessedAnchorUpperBound)
      ? unprocessedAnchorUpperBound
      : null,
    unprocessedUpperBound: Number.isFinite(unprocessedUpperBound) ? Math.ceil(unprocessedUpperBound) : null,
    unprocessedGap: Number.isFinite(unprocessedUpperBound)
      ? Math.max(0, Math.ceil(unprocessedUpperBound) - incumbentScore)
      : null,
    looseTailCloseAnchorScoreThreshold: Number.isFinite(looseTailCloseAnchorScoreThreshold)
      ? looseTailCloseAnchorScoreThreshold
      : null,
    materializedLooseTailCloseIndex,
    materializedLooseTailCloseScore: materializedLooseTailCloseIndex !== null
      ? anchorSlot.scores[materializedLooseTailCloseIndex] ?? null
      : null,
    materializedLooseTailCloseProcessedFraction: materializedLooseTailCloseIndex !== null && anchorSlot.length > 0
      ? materializedLooseTailCloseIndex / anchorSlot.length
      : null,
    materializedLooseTailCloseRequiresAllCandidates: materializedLooseTailCloseIndex === null,
    generatorLooseTailUpperBound: Number.isFinite(generatorLooseTailUpperBound)
      ? Math.ceil(generatorLooseTailUpperBound)
      : null,
    generatorLooseTailGap: Number.isFinite(generatorLooseTailUpperBound)
      ? Math.max(0, Math.ceil(generatorLooseTailUpperBound) - incumbentScore)
      : null,
    processedUpperMax: Number.isFinite(processedUpperMax) ? Math.ceil(processedUpperMax) : null,
    processedUpperMaxSource,
    processedUpperMaxAnchorIndex,
    processedUpperMaxAnchorScore,
    processedUpperMaxAnchorCardIds,
    processedUpperMaxPairUpper,
    processedUpperMaxGeneratedPairUpper,
    processedUpperMaxLeftUnseenUpper,
    processedUpperMaxRightUnseenUpper,
    processedUpperMaxGeneratedPairSplitUpper: processedUpperMaxGeneratedPairSplit
      && Number.isFinite(processedUpperMaxGeneratedPairSplit.upperBound)
      ? processedUpperMaxGeneratedPairSplit.upperBound
      : null,
    processedUpperMaxGeneratedPairSplitTimedOut: processedUpperMaxGeneratedPairSplit?.timedOut ?? null,
    processedUpperMaxGeneratedPairSplitAbortReason: processedUpperMaxGeneratedPairSplit?.abortReason ?? null,
    processedUpperMaxGeneratedPairSplitStateCount: processedUpperMaxGeneratedPairSplit?.stateCount ?? null,
    processedUpperMaxGeneratedPairSplitElapsedMs: processedUpperMaxGeneratedPairSplit
      ? Math.round(performance.now() - splitStartedAt)
      : null,
    processedUpperMaxSplitPairUpper: processedUpperMaxSplitPairUpper !== null
      && Number.isFinite(processedUpperMaxSplitPairUpper)
      ? processedUpperMaxSplitPairUpper
      : null,
    processedUpperMaxSplitPairUpperSource,
    processedUpperMaxSplitTotalUpper: processedUpperMaxSplitTotalUpper !== null
      && Number.isFinite(processedUpperMaxSplitTotalUpper)
      ? Math.ceil(processedUpperMaxSplitTotalUpper)
      : null,
    processedUpperMaxSplitGap: processedUpperMaxSplitTotalUpper !== null
      && Number.isFinite(processedUpperMaxSplitTotalUpper)
      ? Math.max(0, Math.ceil(processedUpperMaxSplitTotalUpper) - incumbentScore)
      : null,
    splitAdjustedResidualUpperBound: Number.isFinite(splitAdjustedResidualUpperBound)
      ? Math.ceil(splitAdjustedResidualUpperBound)
      : null,
    splitAdjustedResidualGap: Number.isFinite(splitAdjustedResidualUpperBound)
      ? Math.max(0, Math.ceil(splitAdjustedResidualUpperBound) - incumbentScore)
      : null,
    splitAdjustedResidualSource,
    processedUpperMaxLeftBestPossible: processedUpperMaxLeftBestPossible !== null
      && Number.isFinite(processedUpperMaxLeftBestPossible)
      ? processedUpperMaxLeftBestPossible
      : null,
    processedUpperMaxRightBestPossible: processedUpperMaxRightBestPossible !== null
      && Number.isFinite(processedUpperMaxRightBestPossible)
      ? processedUpperMaxRightBestPossible
      : null,
    processedUpperMaxPairUpperToClose: processedUpperMaxPairUpperToClose !== null
      && Number.isFinite(processedUpperMaxPairUpperToClose)
      ? processedUpperMaxPairUpperToClose
      : null,
    processedUpperMaxRightPeekUpperToClose: processedUpperMaxRightPeekUpperToClose !== null
      && Number.isFinite(processedUpperMaxRightPeekUpperToClose)
      ? processedUpperMaxRightPeekUpperToClose
      : null,
    processedUpperMaxRightPeekReductionToClose: processedUpperMaxRightPeekUpperToClose !== null
      && Number.isFinite(processedUpperMaxRightPeekUpperToClose)
      && Number.isFinite(rightPeekUpperBound)
      ? Math.max(0, rightPeekUpperBound - processedUpperMaxRightPeekUpperToClose)
      : null,
    processedUpperMaxLeftPeekUpperToClose: processedUpperMaxLeftPeekUpperToClose !== null
      && Number.isFinite(processedUpperMaxLeftPeekUpperToClose)
      ? processedUpperMaxLeftPeekUpperToClose
      : null,
    processedUpperMaxLeftPeekReductionToClose: processedUpperMaxLeftPeekUpperToClose !== null
      && Number.isFinite(processedUpperMaxLeftPeekUpperToClose)
      && Number.isFinite(leftPeekUpperBound)
      ? Math.max(0, leftPeekUpperBound - processedUpperMaxLeftPeekUpperToClose)
      : null,
    globalPairConflictSplit: {
      algorithm: "hhwx-raw-generated-pair-conflict-split-v1",
      behaviorChange: false,
      generatedPairUpper: globalPairConflictSplitGeneratedUpper !== null
        && Number.isFinite(globalPairConflictSplitGeneratedUpper.upperBound)
        ? globalPairConflictSplitGeneratedUpper.upperBound
        : null,
      timedOut: globalPairConflictSplitGeneratedUpper?.timedOut ?? null,
      abortReason: globalPairConflictSplitGeneratedUpper?.abortReason ?? null,
      stateCount: globalPairConflictSplitGeneratedUpper?.stateCount ?? null,
      elapsedMs: Math.round(globalPairConflictSplitElapsedMs),
      leftCandidateIndex: globalPairConflictSplitGeneratedUpper?.leftCandidateIndex ?? null,
      rightCandidateIndex: globalPairConflictSplitGeneratedUpper?.rightCandidateIndex ?? null,
      leftCardIds: globalPairConflictSplitLeftCardIds,
      rightCardIds: globalPairConflictSplitRightCardIds,
      pairCardIds: globalPairConflictSplitCardIds,
      leftBestGeneratedScore: Number.isFinite(globalPairConflictSplitLeftBestGeneratedScore)
        ? globalPairConflictSplitLeftBestGeneratedScore
        : null,
      rightBestGeneratedScore: Number.isFinite(globalPairConflictSplitRightBestGeneratedScore)
        ? globalPairConflictSplitRightBestGeneratedScore
        : null,
      leftPeekUpperBound: Number.isFinite(leftPeekUpperBound) ? leftPeekUpperBound : null,
      rightPeekUpperBound: Number.isFinite(rightPeekUpperBound) ? rightPeekUpperBound : null,
      leftUnseenUpper: Number.isFinite(globalPairConflictSplitLeftUnseenUpper)
        ? globalPairConflictSplitLeftUnseenUpper
        : null,
      rightUnseenUpper: Number.isFinite(globalPairConflictSplitRightUnseenUpper)
        ? globalPairConflictSplitRightUnseenUpper
        : null,
      pairUpper: globalPairConflictSplitPairUpper !== null
        && Number.isFinite(globalPairConflictSplitPairUpper)
        ? globalPairConflictSplitPairUpper
        : null,
      pairUpperSource: globalPairConflictSplitPairUpperSource,
      reductionFromInputPairUpper: globalPairConflictSplitPairUpper !== null
        && Number.isFinite(globalPairConflictSplitPairUpper)
        && Number.isFinite(pairUpperBound)
        ? pairUpperBound - globalPairConflictSplitPairUpper
        : null,
      generatorTailCloseThreshold: Number.isFinite(anchorPeekUpperBound)
        ? incumbentScore - anchorPeekUpperBound
        : null,
      generatorTailGap: globalPairConflictSplitPairUpper !== null
        && Number.isFinite(globalPairConflictSplitPairUpper)
        && Number.isFinite(anchorPeekUpperBound)
        ? Math.max(0, Math.ceil(anchorPeekUpperBound + globalPairConflictSplitPairUpper) - incumbentScore)
        : null,
      wouldCloseGeneratorTail: globalPairConflictSplitPairUpper !== null
        && Number.isFinite(globalPairConflictSplitPairUpper)
        && Number.isFinite(anchorPeekUpperBound)
        && anchorPeekUpperBound + globalPairConflictSplitPairUpper <= incumbentScore,
      anchorCompatibility: globalPairConflictSplitAnchorCompatibility,
      witnessCover: globalPairWitnessCover,
    },
    globalTripleConflictSplit: {
      algorithm: "hhwx-raw-generated-triple-conflict-split-v1",
      behaviorChange: false,
      timeboxMs: MEDLEY_EXACT_RAW_TRIPLE_CONFLICT_SPLIT_TIMEBOX_MS,
      upperBound: globalTripleConflictSplit !== null
        && Number.isFinite(globalTripleConflictSplit.upperBound)
        ? globalTripleConflictSplit.upperBound
        : null,
      gap: globalTripleConflictSplit !== null
        && Number.isFinite(globalTripleConflictSplit.upperBound)
        ? Math.max(0, globalTripleConflictSplit.upperBound - incumbentScore)
        : null,
      wouldCloseGeneratedPool: globalTripleConflictSplit !== null
        && Number.isFinite(globalTripleConflictSplit.upperBound)
        && globalTripleConflictSplit.upperBound <= incumbentScore,
      timedOut: globalTripleConflictSplit?.timedOut ?? null,
      abortReason: globalTripleConflictSplit?.abortReason ?? null,
      stateCount: globalTripleConflictSplit?.stateCount ?? null,
      elapsedMs: Math.round(performance.now() - globalTripleConflictSplitStartedAt),
      anchorBitsElapsedMs: Math.round(globalTripleConflictSplitAnchorBitsElapsedMs),
      anchorBitsMiB: roundMiB(globalTripleConflictSplitAnchorBitsBytes),
      candidateIndices: globalTripleConflictSplit?.candidateIndices ?? null,
      candidateScores: globalTripleConflictSplitCandidateScores,
      candidateCardIds: globalTripleConflictSplitCandidateCardIds,
    },
    pairFrontierCensus,
    pairPricingFrontier,
    refinedProcessedAnchorCount,
    refinedTimeboxed,
    refinedFinishedByDominatedTail,
    refinedSplitAttemptCount,
    refinedSplitCompletedCount,
    refinedSplitTimedOutCount,
    refinedSplitStateCount,
    refinedUnprocessedAnchorUpperBound: Number.isFinite(refinedUnprocessedAnchorUpperBound)
      ? refinedUnprocessedAnchorUpperBound
      : null,
    refinedUnprocessedUpperBound: Number.isFinite(refinedUnprocessedUpperBound)
      ? Math.ceil(refinedUnprocessedUpperBound)
      : null,
    refinedUnprocessedGap: Number.isFinite(refinedUnprocessedUpperBound)
      ? Math.max(0, Math.ceil(refinedUnprocessedUpperBound) - incumbentScore)
      : null,
    refinedProcessedUpperMax: Number.isFinite(refinedProcessedUpperMax)
      ? Math.ceil(refinedProcessedUpperMax)
      : null,
    refinedProcessedUpperMaxSource,
    refinedProcessedUpperMaxAnchorIndex,
    refinedProcessedUpperMaxAnchorScore,
    refinedProcessedUpperMaxPairUpper,
    refinedProcessedUpperMaxGeneratedPairUpper,
    refinedProcessedUpperMaxGeneratedPairSplitUpper,
    refinedProcessedUpperMaxLeftUnseenUpper,
    refinedProcessedUpperMaxRightUnseenUpper,
    refinedResidualUpperBound: Number.isFinite(refinedResidualUpperBound)
      ? Math.ceil(refinedResidualUpperBound)
      : null,
    refinedResidualGap: Number.isFinite(refinedResidualUpperBound)
      ? Math.max(0, Math.ceil(refinedResidualUpperBound) - incumbentScore)
      : null,
    refinedResidualSource,
    refinedWouldClose: Number.isFinite(refinedResidualUpperBound) && refinedResidualUpperBound <= incumbentScore,
    refinedScannedLeftWordCount,
    refinedScannedRightWordCount,
    refinedElapsedMs: Math.round(performance.now() - refinementStartedAt),
    scannedLeftWordCount,
    scannedRightWordCount,
    rawPoolBuildElapsedMs: rawPool.buildElapsedMs,
    buildBitsElapsedMs: Math.round(buildBitsElapsedMs),
    elapsedMs: Math.round(performance.now() - startedAt),
    timeboxMs: MEDLEY_EXACT_RAW_ANCHOR_FRONTIER_PROBE_TIMEBOX_MS,
    rawRetainedMiB: roundMiB(rawRetainedBytes),
    containingBitsMiB: roundMiB(containingBitsBytes),
    scoreOrderViolationCountTotal,
    mismatchCountTotal,
  };
}

function buildMedleyExactRawPairUpperScanParityProfile(
  candidatesBySlot: readonly MedleyTeamCandidate[][],
  rawPool: MedleyExactRawCandidatePool,
): Record<string, unknown> {
  const startedAt = performance.now();
  const candidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
  const candidateCountTotal = candidateCountsBySlot.reduce((sum, count) => sum + count, 0);
  if (candidateCountTotal > MEDLEY_EXACT_RAW_PAIR_UPPER_SCAN_PARITY_MAX_CANDIDATE_TOTAL) {
    return {
      algorithm: "hhwx-raw-pair-upper-scan-parity-v1",
      enabled: true,
      skipped: true,
      skipReason: "candidate-total-limit",
      candidateCountTotal,
      candidateCountsBySlot,
      limit: MEDLEY_EXACT_RAW_PAIR_UPPER_SCAN_PARITY_MAX_CANDIDATE_TOTAL,
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  }

  const pairs = candidatesBySlot.map((_, excludedSlotIndex) => {
    const pairSlotIndices = candidatesBySlot
      .map((__, slotIndex) => slotIndex)
      .filter((slotIndex) => slotIndex !== excludedSlotIndex) as [number, number];
    const objectUpperBound = estimateGeneratedMedleyExactCandidatePairUpper(
      candidatesBySlot[pairSlotIndices[0]],
      candidatesBySlot[pairSlotIndices[1]],
    );
    const rawResult = estimateGeneratedMedleyExactRawCandidatePairUpper(
      rawPool.slots[pairSlotIndices[0]],
      rawPool.slots[pairSlotIndices[1]],
    );
    return {
      excludedSlotIndex,
      pairSlotIndices,
      objectUpperBound: Number.isFinite(objectUpperBound) ? objectUpperBound : null,
      rawUpperBound: Number.isFinite(rawResult.upperBound) ? rawResult.upperBound : null,
      matched: objectUpperBound === rawResult.upperBound,
      scannedLeftCandidateCount: rawResult.scannedLeftCandidateCount,
      scannedRightCandidateCount: rawResult.scannedRightCandidateCount,
    };
  });
  return {
    algorithm: "hhwx-raw-pair-upper-scan-parity-v1",
    enabled: true,
    skipped: false,
    source: "shared-current-pool",
    candidateCountTotal,
    candidateCountsBySlot,
    matched: pairs.every((pair) => pair.matched),
    mismatchCount: pairs.filter((pair) => !pair.matched).length,
    elapsedMs: Math.round(performance.now() - startedAt),
    pairs,
  };
}

function buildMedleyExactRawPairComplementParityProfile(
  candidatesBySlot: readonly MedleyTeamCandidate[][],
  rawPool: MedleyExactRawCandidatePool,
): Record<string, unknown> {
  const startedAt = performance.now();
  const candidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
  const candidateCountTotal = candidateCountsBySlot.reduce((sum, count) => sum + count, 0);
  if (candidateCountTotal > MEDLEY_EXACT_RAW_PAIR_COMPLEMENT_PARITY_MAX_CANDIDATE_TOTAL) {
    return {
      algorithm: "hhwx-raw-pair-complement-parity-v1",
      enabled: true,
      skipped: true,
      skipReason: "candidate-total-limit",
      candidateCountTotal,
      candidateCountsBySlot,
      limit: MEDLEY_EXACT_RAW_PAIR_COMPLEMENT_PARITY_MAX_CANDIDATE_TOTAL,
      rawPoolBuilt: true,
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  }

  const pairs = candidatesBySlot.map((_, excludedSlotIndex) => {
    const pairSlotIndices = candidatesBySlot
      .map((__, slotIndex) => slotIndex)
      .filter((slotIndex) => slotIndex !== excludedSlotIndex) as [number, number];
    const objectQuery = buildMedleyExactCandidatePairUpperQuery(
      candidatesBySlot[pairSlotIndices[0]],
      candidatesBySlot[pairSlotIndices[1]],
    );
    const rawLeftSlot = rawPool.slots[pairSlotIndices[0]];
    const rawRightSlot = rawPool.slots[pairSlotIndices[1]];
    const rawRightWordCount = Math.ceil(rawRightSlot.length / 32);
    const containingRawRightBitsByCardId = buildMedleyExactRawJoinContainingBitsByCardId(
      rawRightSlot,
      rawRightWordCount,
    );
    const bannedSamples: number[][] = [[]];
    const excludedCandidates = candidatesBySlot[excludedSlotIndex] ?? [];
    for (
      let candidateIndex = 0;
      candidateIndex < excludedCandidates.length
        && bannedSamples.length < MEDLEY_EXACT_RAW_PAIR_COMPLEMENT_PARITY_BANNED_SAMPLE_LIMIT;
      candidateIndex += 1
    ) {
      bannedSamples.push(copyMedleyTeamCandidateCardIds(excludedCandidates[candidateIndex]));
    }
    const samples = bannedSamples.map((bannedCardIds, sampleIndex) => {
      const objectUpperBound = estimateGeneratedMedleyExactCandidatePairUpperExcludingCardIdsByScan(
        objectQuery,
        bannedCardIds,
      );
      const rawResult = estimateGeneratedMedleyExactRawCandidatePairUpperExcludingCardIdsByScan(
        rawLeftSlot,
        rawRightSlot,
        containingRawRightBitsByCardId,
        bannedCardIds,
      );
      return {
        sampleIndex,
        bannedCardIds,
        objectUpperBound: Number.isFinite(objectUpperBound) ? objectUpperBound : null,
        rawUpperBound: Number.isFinite(rawResult.upperBound) ? rawResult.upperBound : null,
        matched: objectUpperBound === rawResult.upperBound,
        scannedLeftCandidateCount: rawResult.scannedLeftCandidateCount,
        scannedRightWordCount: rawResult.scannedRightWordCount,
      };
    });
    return {
      excludedSlotIndex,
      pairSlotIndices,
      sampleCount: samples.length,
      matched: samples.every((sample) => sample.matched),
      mismatchCount: samples.filter((sample) => !sample.matched).length,
      samples,
    };
  });

  return {
    algorithm: "hhwx-raw-pair-complement-parity-v1",
    enabled: true,
    skipped: false,
    source: "shared-current-pool",
    candidateCountTotal,
    candidateCountsBySlot,
    sampleLimit: MEDLEY_EXACT_RAW_PAIR_COMPLEMENT_PARITY_BANNED_SAMPLE_LIMIT,
    matched: pairs.every((pair) => pair.matched),
    mismatchCount: pairs.reduce((sum, pair) => sum + pair.mismatchCount, 0),
    elapsedMs: Math.round(performance.now() - startedAt),
    pairs,
  };
}

function buildSkippedMedleyExactRawPairComplementParityProfile(
  candidatesBySlot: readonly MedleyTeamCandidate[][],
): Record<string, unknown> | null {
  const candidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
  const candidateCountTotal = candidateCountsBySlot.reduce((sum, count) => sum + count, 0);
  if (candidateCountTotal <= MEDLEY_EXACT_RAW_PAIR_COMPLEMENT_PARITY_MAX_CANDIDATE_TOTAL) {
    return null;
  }
  return {
    algorithm: "hhwx-raw-pair-complement-parity-v1",
    enabled: true,
    skipped: true,
    skipReason: "candidate-total-limit",
    candidateCountTotal,
    candidateCountsBySlot,
    limit: MEDLEY_EXACT_RAW_PAIR_COMPLEMENT_PARITY_MAX_CANDIDATE_TOTAL,
    rawPoolBuilt: false,
  };
}

function buildSkippedMedleyExactRawPairUpperScanParityProfile(
  candidatesBySlot: readonly MedleyTeamCandidate[][],
): Record<string, unknown> | null {
  const candidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
  const candidateCountTotal = candidateCountsBySlot.reduce((sum, count) => sum + count, 0);
  if (candidateCountTotal <= MEDLEY_EXACT_RAW_PAIR_UPPER_SCAN_PARITY_MAX_CANDIDATE_TOTAL) {
    return null;
  }
  return {
    algorithm: "hhwx-raw-pair-upper-scan-parity-v1",
    enabled: true,
    skipped: true,
    skipReason: "candidate-total-limit",
    candidateCountTotal,
    candidateCountsBySlot,
    limit: MEDLEY_EXACT_RAW_PAIR_UPPER_SCAN_PARITY_MAX_CANDIDATE_TOTAL,
    rawPoolBuilt: false,
  };
}

function sumMedleyExactFloat64ArrayBytes(values: Iterable<Float64Array>): number {
  let bytes = 0;
  for (const value of values) {
    bytes += value.byteLength;
  }
  return bytes;
}

function sumMedleyExactArrayViewBytes(values: Iterable<{ byteLength: number }>): number {
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

function buildMedleyExactRawJoinParitySlot(
  candidates: readonly MedleyTeamCandidate[],
): MedleyExactRawJoinParitySlot {
  return buildMedleyExactRawCandidatePoolSlot(candidates);
}

function getMedleyExactCandidateCardSearchIndexAt(
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

function buildMedleyExactRawJoinContainingBitsByCardId(
  slot: MedleyExactRawJoinParitySlot,
  wordCount: number,
): Map<number, Uint32Array> {
  const containingBitsByCardId = new Map<number, Uint32Array>();
  for (let candidateIndex = 0; candidateIndex < slot.length; candidateIndex += 1) {
    const wordIndex = candidateIndex >> 5;
    const bit = 1 << (candidateIndex & 31);
    for (let cardIndex = 0; cardIndex < MEDLEY_TEAM_SIZE; cardIndex += 1) {
      const cardId = getMedleyExactRawCandidateCardIdAt(slot, candidateIndex, cardIndex);
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
  for (let cardIndex = 0; cardIndex < MEDLEY_TEAM_SIZE; cardIndex += 1) {
    const cardId = getMedleyExactRawCandidateCardIdAt(slot, candidateIndex, cardIndex);
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

function findBestAvailableMedleyExactRawJoinIndexByScoreAndMax(
  slot: MedleyExactRawJoinParitySlot,
  wordCount: number,
  targetScore: number,
  primaryForbiddenBits: Uint32Array,
  secondaryForbiddenBits?: Uint32Array,
): number {
  if (slot.length === 0 || wordCount === 0 || !Number.isFinite(targetScore)) {
    return -1;
  }
  const lastWordIndex = wordCount - 1;
  const lastWordRemainder = slot.length & 31;
  const lastWordMask = lastWordRemainder === 0
    ? 0xffffffff
    : 0xffffffff >>> (32 - lastWordRemainder);
  let bestIndex = -1;
  let bestMaxScore = Number.NEGATIVE_INFINITY;
  for (let wordIndex = 0; wordIndex < wordCount; wordIndex += 1) {
    if (getMedleyExactRawCandidateScore(slot, wordIndex * 32) < targetScore) {
      break;
    }
    let availableBits = secondaryForbiddenBits
      ? (~(primaryForbiddenBits[wordIndex] | secondaryForbiddenBits[wordIndex])) >>> 0
      : (~primaryForbiddenBits[wordIndex]) >>> 0;
    if (wordIndex === lastWordIndex) {
      availableBits &= lastWordMask;
    }
    while (availableBits !== 0) {
      const lowestAvailableBit = availableBits & -availableBits;
      availableBits ^= lowestAvailableBit;
      const candidateIndex = wordIndex * 32 + (31 - Math.clz32(lowestAvailableBit));
      const candidateScore = getMedleyExactRawCandidateScore(slot, candidateIndex);
      if (candidateScore !== targetScore) {
        continue;
      }
      const candidateMaxScore = slot.maxScores[candidateIndex] ?? candidateScore;
      if (candidateMaxScore > bestMaxScore) {
        bestIndex = candidateIndex;
        bestMaxScore = candidateMaxScore;
      }
    }
  }
  return bestIndex;
}

function solveMedleyExactRawIndexFinalJoin(
  rawSlots: readonly MedleyExactRawJoinParitySlot[],
  rawInputSource: string,
  incumbentScore: number,
  deadlineAt: number,
  isPastDeadline: () => boolean,
  rawSourceProfile?: {
    retainedMiB: number | null;
    rawPoolRetainedMiB: number | null;
    lengthMismatchCount: number | null;
    mismatchCountTotal: number | null;
  },
): MedleyExactRawIndexFinalJoinSolveProfile {
  const startedAt = performance.now();
  const candidateCountsBySlot = rawSlots.map((slot) => slot.length);
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

  const { slotOrder } = getMedleyExactRawCandidateJoinSlotOrder(rawSlots);
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
  const bestSecondScore = getMedleyExactRawCandidateScore(secondSlot, 0);
  const bestThirdScore = getMedleyExactRawCandidateScore(thirdSlot, 0);
  let rawBestScore = Number.NEGATIVE_INFINITY;
  let rawBestAverageScore = Number.NEGATIVE_INFINITY;
  let rawBestMaxScore = Number.NEGATIVE_INFINITY;
  let rawBestMinScore = Number.POSITIVE_INFINITY;
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
    const firstScore = getMedleyExactRawCandidateScore(firstSlot, firstIndex);
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
    const bestThirdForFirstScore = getMedleyExactRawCandidateScore(thirdSlot, bestThirdForFirstIndex);
    if (
      firstScore
      + getMedleyExactRawCandidateScore(secondSlot, bestSecondForFirstIndex)
      + bestThirdForFirstScore
      < currentScoreCutoff
    ) {
      continue;
    }
    if (firstScore + bestSecondScore + bestThirdForFirstScore < currentScoreCutoff) {
      continue;
    }

    let shouldStopSecondLoop = false;
    for (let wordIndex = 0; wordIndex < secondWordCount; wordIndex += 1) {
      const wordTopSecondScore = getMedleyExactRawCandidateScore(secondSlot, wordIndex * 32);
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
        const secondScore = getMedleyExactRawCandidateScore(secondSlot, secondIndex);
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
        const thirdScore = getMedleyExactRawCandidateScore(thirdSlot, thirdIndex);
        const bestMaxThirdIndex = findBestAvailableMedleyExactRawJoinIndexByScoreAndMax(
          thirdSlot,
          thirdWordCount,
          thirdScore,
          firstForbiddenThirdBits,
          secondForbiddenThirdBits,
        );
        const selectedThirdIndex = bestMaxThirdIndex >= 0 ? bestMaxThirdIndex : thirdIndex;
        const selectedThirdScore = getMedleyExactRawCandidateScore(thirdSlot, selectedThirdIndex);
        const score = firstSecondScore + selectedThirdScore;
        if (score < currentScoreCutoff) {
          continue;
        }
        const averageScore = (
          (firstSlot.averageScores[firstIndex] ?? firstScore)
          + (secondSlot.averageScores[secondIndex] ?? secondScore)
          + (thirdSlot.averageScores[selectedThirdIndex] ?? selectedThirdScore)
        );
        const maxScore = (
          (firstSlot.maxScores[firstIndex] ?? firstScore)
          + (secondSlot.maxScores[secondIndex] ?? secondScore)
          + (thirdSlot.maxScores[selectedThirdIndex] ?? selectedThirdScore)
        );
        const minScore = (
          (firstSlot.minScores[firstIndex] ?? firstScore)
          + (secondSlot.minScores[secondIndex] ?? secondScore)
          + (thirdSlot.minScores[selectedThirdIndex] ?? selectedThirdScore)
        );
        if (
          score < rawBestScore
          || (score === rawBestScore && maxScore <= rawBestMaxScore)
        ) {
          continue;
        }
        rawBestScore = score;
        rawBestAverageScore = averageScore;
        rawBestMaxScore = maxScore;
        rawBestMinScore = minScore;
        currentScoreCutoff = score;
        bestIndices[0] = firstIndex;
        bestIndices[1] = secondIndex;
        bestIndices[2] = selectedThirdIndex;
      }
      if (shouldStopSecondLoop) {
        break;
      }
    }
  }

  const normalizedRawBestScore = Number.isFinite(rawBestScore) ? rawBestScore : null;
  const normalizedRawBestAverageScore = Number.isFinite(rawBestAverageScore) ? rawBestAverageScore : null;
  const normalizedRawBestMaxScore = Number.isFinite(rawBestMaxScore) ? rawBestMaxScore : null;
  const normalizedRawBestMinScore = Number.isFinite(rawBestMinScore) ? rawBestMinScore : null;
  return {
    enabled: true,
    skipped: false,
    candidateCountTotal,
    candidateCountsBySlot,
    slotOrder: [...slotOrder],
    rawInputSource,
    rawBestScore: normalizedRawBestScore,
    rawBestAverageScore: normalizedRawBestAverageScore,
    rawBestMaxScore: normalizedRawBestMaxScore,
    rawBestMinScore: normalizedRawBestMinScore,
    bestIndices,
    bestSourceIndices: bestIndices.map((candidateIndex, orderIndex) => {
      const slot = rawSlots[slotOrder[orderIndex]];
      return slot && candidateIndex >= 0
        ? getMedleyExactRawCandidateSourceIndex(slot, candidateIndex)
        : -1;
    }),
    bestCardIdsBySlot: bestIndices.map((candidateIndex, orderIndex) => {
      const slot = rawSlots[slotOrder[orderIndex]];
      return slot && candidateIndex >= 0
        ? copyMedleyExactRawCandidateCardIds(slot, candidateIndex)
        : [];
    }),
    pairCount,
    thirdQueryCount,
    elapsedMs: Math.round(performance.now() - startedAt),
    retainedMiB: roundMiB(
      rawSlots.reduce((sum, slot) => sum + getMedleyExactRawCandidateSlotBytes(slot), 0),
    ),
    rawSourceRetainedMiB: rawSourceProfile?.retainedMiB ?? null,
    rawPoolRetainedMiB: rawSourceProfile?.rawPoolRetainedMiB ?? null,
    rawSourceLengthMismatchCount: rawSourceProfile?.lengthMismatchCount ?? null,
    rawSourceMismatchCountTotal: rawSourceProfile?.mismatchCountTotal ?? null,
  };
}

function runMedleyExactRawIndexFinalJoinParity(
  slots: readonly MedleySlotSearch[],
  candidatesBySlot: readonly MedleyTeamCandidate[][],
  configuration: BandoriAreaItemConfiguration,
  objectSlotOrder: readonly number[],
  objectBestResult: BandoriMedleyTeamSearchResult | null,
  incumbentScore: number,
  deadlineAt: number,
  isPastDeadline: () => boolean,
  rawCandidateSlotReadSourceProvider?: () => MedleyExactRawCandidateSlotReadSource,
): Record<string, unknown> {
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
  const rawCandidateSlotReadSource = rawCandidateSlotReadSourceProvider?.() ?? null;
  const rawSlots: MedleyExactRawJoinParitySlot[] = rawCandidateSlotReadSource
    ? rawCandidateSlotReadSource.slots
    : candidatesBySlot.map(buildMedleyExactRawJoinParitySlot);
  const rawInputSource = rawCandidateSlotReadSource?.source ?? "parity-local-build";
  const solveProfile = solveMedleyExactRawIndexFinalJoin(
    rawSlots,
    rawInputSource,
    incumbentScore,
    deadlineAt,
    isPastDeadline,
    rawCandidateSlotReadSource
      ? {
        retainedMiB: rawCandidateSlotReadSource.retainedMiB,
        rawPoolRetainedMiB: rawCandidateSlotReadSource.rawPoolRetainedMiB,
        lengthMismatchCount: rawCandidateSlotReadSource.lengthMismatchCount,
        mismatchCountTotal: rawCandidateSlotReadSource.mismatchCountTotal,
      }
      : undefined,
  );
  const slotOrder = solveProfile.slotOrder ?? [];
  const rawBestScore = solveProfile.rawBestScore ?? null;
  const hydratedResultProfile = hydrateMedleyExactRawIndexFinalJoinProfile(
    slots,
    candidatesBySlot,
    configuration,
    solveProfile,
  );
  const objectBestScore = objectBestResult?.score ?? null;
  return {
    ...solveProfile,
    objectSlotOrder: [...objectSlotOrder],
    rawSlotOrderMatchesObject: (
      slotOrder.length === objectSlotOrder.length
      && slotOrder.every((slotIndex, index) => slotIndex === objectSlotOrder[index])
    ),
    objectBestScore,
    objectBestAverageScore: objectBestResult?.averageScore ?? null,
    objectBestMaxScore: objectBestResult?.maxScore ?? null,
    matched: rawBestScore === objectBestScore,
    hydratedResult: hydratedResultProfile,
  };
}

function hydrateMedleyExactRawIndexFinalJoinProfile(
  slots: readonly MedleySlotSearch[],
  candidatesBySlot: readonly MedleyTeamCandidate[][],
  configuration: BandoriAreaItemConfiguration,
  solveProfile: MedleyExactRawIndexFinalJoinSolveProfile,
  exactHydration?: {
    server: number;
    perfectRate: number;
    stats: BandoriMedleyTeamSearchStats;
    profiling: BandoriMedleyTeamSearchProfilingStats;
  },
): Record<string, unknown> {
  if (solveProfile.skipped) {
    return {
      attempted: false,
      skipReason: solveProfile.skipReason ?? "raw-solver-skipped",
    };
  }
  const rawBestScore = solveProfile.rawBestScore ?? null;
  const slotOrder = solveProfile.slotOrder ?? [];
  const bestSourceIndices = solveProfile.bestSourceIndices ?? [];
  if (rawBestScore === null || slotOrder.length === 0 || bestSourceIndices.some((index) => index < 0)) {
    return {
      attempted: false,
      skipReason: "no-raw-winner",
      rawBestScore,
      slotOrder,
      bestSourceIndices,
    };
  }

  const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
  for (let orderIndex = 0; orderIndex < slotOrder.length; orderIndex += 1) {
    const slotIndex = slotOrder[orderIndex];
    const sourceIndex = bestSourceIndices[orderIndex];
    const slot = slots[slotIndex];
    const candidate = candidatesBySlot[slotIndex]?.[sourceIndex];
    if (!slot || !candidate) {
      return {
        attempted: true,
        hydrated: false,
        failureReason: "missing-source-candidate",
        rawBestScore,
        slotOrder,
        bestSourceIndices,
        failedOrderIndex: orderIndex,
        failedSlotIndex: slotIndex,
        failedSourceIndex: sourceIndex,
      };
    }
    if (exactHydration) {
      const resultCandidate = hydrateMedleyExactCandidateForResult(
        slot,
        candidate,
        exactHydration.server,
        exactHydration.perfectRate,
        exactHydration.stats,
        exactHydration.profiling,
      );
      if (!resultCandidate) {
        return {
          attempted: true,
          hydrated: false,
          failureReason: "unable-to-hydrate-result-candidate",
          rawBestScore,
          slotOrder,
          bestSourceIndices,
          failedOrderIndex: orderIndex,
          failedSlotIndex: slotIndex,
          failedSourceIndex: sourceIndex,
        };
      }
      selectedBySong[slot.songIndex] = resultCandidate;
      continue;
    }

    const retainedResultCards = (candidate.result as BandoriTeamSearchResult & { cards?: SearchCard[] }).cards;
    const resultCards = Array.isArray(retainedResultCards) && retainedResultCards.length === MEDLEY_TEAM_SIZE
      ? retainedResultCards
      : getMedleyExactCandidateCards(slot, candidate);
    if (resultCards.length !== MEDLEY_TEAM_SIZE) {
      return {
        attempted: true,
        hydrated: false,
        failureReason: "unable-to-hydrate-candidate-cards",
        rawBestScore,
        slotOrder,
        bestSourceIndices,
        failedOrderIndex: orderIndex,
        failedSlotIndex: slotIndex,
        failedSourceIndex: sourceIndex,
        hydratedCardCount: resultCards.length,
      };
    }
    selectedBySong[slot.songIndex] = resultCards === retainedResultCards
      ? candidate
      : {
        ...candidate,
        cards: candidate.cards.length === MEDLEY_TEAM_SIZE ? candidate.cards : resultCards,
        result: {
          ...candidate.result,
          cards: resultCards,
        } as BandoriTeamSearchResult,
      };
  }

  const result = buildMedleyResult([...slots], selectedBySong, configuration);
  if (!result) {
    return {
      attempted: true,
      hydrated: false,
      failureReason: "build-result-returned-null",
      rawBestScore,
      slotOrder,
      bestSourceIndices,
    };
  }
  return {
    attempted: true,
    hydrated: true,
    hydrationMode: exactHydration ? "exact-result" : "candidate-cards",
    score: result.score,
    averageScore: result.averageScore,
    maxScore: result.maxScore,
    minScore: result.minScore,
    scoreMatchesRaw: result.score === rawBestScore,
    averageScoreMatchesRaw: solveProfile.rawBestAverageScore === null
      || solveProfile.rawBestAverageScore === undefined
      || result.averageScore === solveProfile.rawBestAverageScore,
    maxScoreMatchesRaw: solveProfile.rawBestMaxScore === null
      || solveProfile.rawBestMaxScore === undefined
      || result.maxScore === solveProfile.rawBestMaxScore,
    minScoreMatchesRaw: solveProfile.rawBestMinScore === null
      || solveProfile.rawBestMinScore === undefined
      || result.minScore === solveProfile.rawBestMinScore,
    rawBestScore,
    rawBestAverageScore: solveProfile.rawBestAverageScore ?? null,
    rawBestMaxScore: solveProfile.rawBestMaxScore ?? null,
    rawBestMinScore: solveProfile.rawBestMinScore ?? null,
    cardIds: result.cardIds,
    slotOrder,
    bestSourceIndices,
    bestCardIdsBySlot: solveProfile.bestCardIdsBySlot ?? [],
  };
}

function getMedleyExactRawCandidateCards(
  slot: MedleySlotSearch,
  rawSlot: MedleyExactRawJoinParitySlot,
  candidateIndex: number,
): {
  cards: SearchCard[];
  cardSearchIndices: number[];
  cardIds: number[];
  cardIdMismatchCount: number;
} | null {
  const cards: SearchCard[] = [];
  const cardSearchIndices: number[] = [];
  const cardIds: number[] = [];
  let cardIdMismatchCount = 0;
  for (let cardIndex = 0; cardIndex < MEDLEY_TEAM_SIZE; cardIndex += 1) {
    const cardSearchIndex = getMedleyExactRawCandidateCardSearchIndexAt(rawSlot, candidateIndex, cardIndex);
    if (cardSearchIndex < 0 || cardSearchIndex >= slot.searchCards.length) {
      return null;
    }
    const card = slot.searchCards[cardSearchIndex];
    if (!card) {
      return null;
    }
    const rawCardId = getMedleyExactRawCandidateCardIdAt(rawSlot, candidateIndex, cardIndex);
    if (rawCardId !== card.cardId) {
      cardIdMismatchCount += 1;
    }
    cards.push(card);
    cardSearchIndices.push(cardSearchIndex);
    cardIds.push(rawCardId);
  }
  return {
    cards,
    cardSearchIndices,
    cardIds,
    cardIdMismatchCount,
  };
}

function hydrateMedleyExactRawIndexFinalJoinProfileFromRawRows(
  slots: readonly MedleySlotSearch[],
  rawSlots: readonly MedleyExactRawJoinParitySlot[],
  configuration: BandoriAreaItemConfiguration,
  solveProfile: MedleyExactRawIndexFinalJoinSolveProfile,
  exactHydration: {
    server: number;
    perfectRate: number;
    stats: BandoriMedleyTeamSearchStats;
    profiling: BandoriMedleyTeamSearchProfilingStats;
  },
  observeHydratedResult?: (result: BandoriMedleyTeamSearchResult) => void,
): Record<string, unknown> {
  if (solveProfile.skipped) {
    return {
      attempted: false,
      skipReason: solveProfile.skipReason ?? "raw-solver-skipped",
    };
  }
  const rawBestScore = solveProfile.rawBestScore ?? null;
  const slotOrder = solveProfile.slotOrder ?? [];
  const bestIndices = solveProfile.bestIndices ?? [];
  if (rawBestScore === null || slotOrder.length === 0 || bestIndices.some((index) => index < 0)) {
    return {
      attempted: false,
      skipReason: "no-raw-winner",
      rawBestScore,
      slotOrder,
      bestIndices,
    };
  }

  const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
  const cardSearchIndicesByOrder: number[][] = [];
  const cardIdsByOrder: number[][] = [];
  let cardIdMismatchCount = 0;
  for (let orderIndex = 0; orderIndex < slotOrder.length; orderIndex += 1) {
    const slotIndex = slotOrder[orderIndex];
    const candidateIndex = bestIndices[orderIndex];
    const slot = slots[slotIndex];
    const rawSlot = rawSlots[slotIndex];
    if (!slot || !rawSlot || candidateIndex < 0 || candidateIndex >= rawSlot.length) {
      return {
        attempted: true,
        hydrated: false,
        failureReason: "missing-raw-candidate",
        rawBestScore,
        slotOrder,
        bestIndices,
        failedOrderIndex: orderIndex,
        failedSlotIndex: slotIndex,
        failedCandidateIndex: candidateIndex,
      };
    }
    const rawCandidateCards = getMedleyExactRawCandidateCards(slot, rawSlot, candidateIndex);
    if (!rawCandidateCards || rawCandidateCards.cards.length !== MEDLEY_TEAM_SIZE) {
      return {
        attempted: true,
        hydrated: false,
        failureReason: "unable-to-hydrate-raw-row-cards",
        rawBestScore,
        slotOrder,
        bestIndices,
        failedOrderIndex: orderIndex,
        failedSlotIndex: slotIndex,
        failedCandidateIndex: candidateIndex,
      };
    }
    cardSearchIndicesByOrder.push(rawCandidateCards.cardSearchIndices);
    cardIdsByOrder.push(rawCandidateCards.cardIds);
    cardIdMismatchCount += rawCandidateCards.cardIdMismatchCount;

    const resultCandidate = evaluateMedleySlotCandidateWithCache(
      slot,
      rawCandidateCards.cards,
      exactHydration.server,
      exactHydration.perfectRate,
      exactHydration.stats,
      exactHydration.profiling,
    );
    if (!resultCandidate) {
      return {
        attempted: true,
        hydrated: false,
        failureReason: "unable-to-hydrate-raw-row-result-candidate",
        rawBestScore,
        slotOrder,
        bestIndices,
        failedOrderIndex: orderIndex,
        failedSlotIndex: slotIndex,
        failedCandidateIndex: candidateIndex,
      };
    }
    selectedBySong[slot.songIndex] = resultCandidate;
  }

  const result = buildMedleyResult([...slots], selectedBySong, configuration);
  if (!result) {
    return {
      attempted: true,
      hydrated: false,
      failureReason: "build-result-returned-null",
      rawBestScore,
      slotOrder,
      bestIndices,
      cardSearchIndicesByOrder,
      cardIdsByOrder,
      cardIdMismatchCount,
    };
  }
  observeHydratedResult?.(result);
  return {
    attempted: true,
    hydrated: true,
    hydrationMode: "raw-row-exact-result",
    score: result.score,
    averageScore: result.averageScore,
    maxScore: result.maxScore,
    minScore: result.minScore,
    scoreMatchesRaw: result.score === rawBestScore,
    averageScoreMatchesRaw: solveProfile.rawBestAverageScore === null
      || solveProfile.rawBestAverageScore === undefined
      || result.averageScore === solveProfile.rawBestAverageScore,
    maxScoreMatchesRaw: solveProfile.rawBestMaxScore === null
      || solveProfile.rawBestMaxScore === undefined
      || result.maxScore === solveProfile.rawBestMaxScore,
    minScoreMatchesRaw: solveProfile.rawBestMinScore === null
      || solveProfile.rawBestMinScore === undefined
      || result.minScore === solveProfile.rawBestMinScore,
    rawBestScore,
    rawBestAverageScore: solveProfile.rawBestAverageScore ?? null,
    rawBestMaxScore: solveProfile.rawBestMaxScore ?? null,
    rawBestMinScore: solveProfile.rawBestMinScore ?? null,
    cardIds: result.cardIds,
    slotOrder,
    bestIndices,
    bestSourceIndices: solveProfile.bestSourceIndices ?? [],
    bestCardIdsBySlot: solveProfile.bestCardIdsBySlot ?? [],
    cardSearchIndicesByOrder,
    cardIdsByOrder,
    cardIdMismatchCount,
  };
}

function getMedleyExactOrderedCardIdsForCandidate(
  slot: MedleySlotSearch,
  candidate: MedleyTeamCandidate,
): number[] {
  return getMedleyExactCandidateCards(slot, candidate).map((card) => card.cardId);
}

function getMedleyExactOrderedCardInstanceKeysForCandidate(
  slot: MedleySlotSearch,
  candidate: MedleyTeamCandidate,
): string[] {
  return getCardInstanceKeys(getMedleyExactCandidateCards(slot, candidate));
}

function getMedleyExactSortedCardIds(cardIds: readonly number[]): number[] {
  return [...cardIds].sort((left, right) => left - right);
}

function areMedleyExactCardIdListsEqual(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return left.length === right.length && left.every((cardId, index) => cardId === right[index]);
}

function buildMedleyExactCandidateSourceSummary(
  slot: MedleySlotSearch,
  candidate: MedleyTeamCandidate,
  sourceIndex: number,
): Record<string, unknown> {
  const orderedCardIds = getMedleyExactOrderedCardIdsForCandidate(slot, candidate);
  const orderedCardInstanceKeys = getMedleyExactOrderedCardInstanceKeysForCandidate(slot, candidate);
  const retainedResultCards = (candidate.result as BandoriTeamSearchResult & { cards?: SearchCard[] }).cards;
  const retainedResultCardIds = Array.isArray(retainedResultCards)
    ? retainedResultCards.map((card) => card.cardId)
    : [];
  return {
    sourceIndex,
    score: candidate.result.score,
    averageScore: candidate.result.averageScore,
    maxScore: candidate.result.maxScore,
    minScore: candidate.result.minScore,
    leaderCardId: candidate.result.leaderCardId,
    orderedCardIds,
    sortedCardIds: getMedleyExactSortedCardIds(orderedCardIds),
    orderedCardInstanceKeys,
    sortedCardInstanceKeys: [...orderedCardInstanceKeys].sort(),
    retainedCandidateCardsLength: candidate.cards.length,
    retainedResultCardsLength: Array.isArray(retainedResultCards) ? retainedResultCards.length : null,
    retainedResultCardIds,
    retainedResultCardInstanceKeys: Array.isArray(retainedResultCards)
      ? getCardInstanceKeys(retainedResultCards)
      : [],
    cardSearchIndices: [
      candidate.cardSearchIndex0,
      candidate.cardSearchIndex1,
      candidate.cardSearchIndex2,
      candidate.cardSearchIndex3,
      candidate.cardSearchIndex4,
    ].filter((index): index is number => typeof index === "number" && index >= 0),
  };
}

function buildMedleyExactRawObjectWinnerSourceDiagnostics(
  slots: readonly MedleySlotSearch[],
  rawSlots: readonly MedleyExactRawJoinParitySlot[],
  candidatesBySlot: readonly MedleyTeamCandidate[][],
  objectResult: BandoriMedleyTeamSearchResult | null,
  solveProfile: MedleyExactRawIndexFinalJoinSolveProfile,
): Array<Record<string, unknown>> {
  const slotOrder = solveProfile.slotOrder ?? [];
  const bestIndices = solveProfile.bestIndices ?? [];
  const bestSourceIndices = solveProfile.bestSourceIndices ?? [];
  return slotOrder.map((slotIndex, orderIndex) => {
    const slot = slots[slotIndex];
    const rawSlot = rawSlots[slotIndex];
    const rawIndex = bestIndices[orderIndex] ?? -1;
    const sourceIndex = bestSourceIndices[orderIndex] ?? -1;
    const rawCandidate = sourceIndex >= 0 ? candidatesBySlot[slotIndex]?.[sourceIndex] ?? null : null;
    const objectSongResult = objectResult?.songResults.find((songResult) => (
      songResult.songIndex === slot?.songIndex
    )) ?? null;
    const objectOrderedCardIds = objectSongResult?.cards.map((card) => card.cardId) ?? [];
    const objectOrderedCardInstanceKeys = objectSongResult ? getCardInstanceKeys(objectSongResult.cards) : [];
    const objectSortedCardIds = getMedleyExactSortedCardIds(objectOrderedCardIds);
    const objectSortedCardInstanceKeys = [...objectOrderedCardInstanceKeys].sort();
    const sameOrderedObjectCandidates: Array<Record<string, unknown>> = [];
    const sameSortedObjectCandidates: Array<Record<string, unknown>> = [];

    if (slot) {
      for (let candidateIndex = 0; candidateIndex < (candidatesBySlot[slotIndex]?.length ?? 0); candidateIndex += 1) {
        const candidate = candidatesBySlot[slotIndex]?.[candidateIndex];
        if (!candidate) {
          continue;
        }
        const orderedCardIds = getMedleyExactOrderedCardIdsForCandidate(slot, candidate);
        if (
          sameOrderedObjectCandidates.length < 6
          && areMedleyExactCardIdListsEqual(orderedCardIds, objectOrderedCardIds)
        ) {
          sameOrderedObjectCandidates.push(buildMedleyExactCandidateSourceSummary(slot, candidate, candidateIndex));
        }
        if (
          sameSortedObjectCandidates.length < 6
          && areMedleyExactCardIdListsEqual(getMedleyExactSortedCardIds(orderedCardIds), objectSortedCardIds)
        ) {
          sameSortedObjectCandidates.push(buildMedleyExactCandidateSourceSummary(slot, candidate, candidateIndex));
        }
        if (sameOrderedObjectCandidates.length >= 6 && sameSortedObjectCandidates.length >= 6) {
          break;
        }
      }
    }

    return {
      slotIndex,
      orderIndex,
      songIndex: slot?.songIndex ?? null,
      rawIndex,
      sourceIndex,
      rawRow: rawSlot && rawIndex >= 0
        ? {
          score: rawSlot.scores[rawIndex] ?? null,
          averageScore: rawSlot.averageScores[rawIndex] ?? null,
          maxScore: rawSlot.maxScores[rawIndex] ?? null,
          minScore: rawSlot.minScores[rawIndex] ?? null,
          sourceIndex: rawSlot.sourceIndices[rawIndex] ?? null,
          orderedCardIds: copyMedleyExactRawCandidateCardIds(rawSlot, rawIndex),
          cardSearchIndices: copyMedleyExactRawCandidateCardSearchIndices(rawSlot, rawIndex),
        }
        : null,
      rawSourceCandidate: slot && rawCandidate
        ? buildMedleyExactCandidateSourceSummary(slot, rawCandidate, sourceIndex)
        : null,
      objectSongResult: objectSongResult
        ? {
          score: objectSongResult.score,
          averageScore: objectSongResult.averageScore,
          maxScore: objectSongResult.maxScore,
          minScore: objectSongResult.minScore,
          leaderCardId: objectSongResult.leaderCardId,
          orderedCardIds: objectOrderedCardIds,
          sortedCardIds: objectSortedCardIds,
          orderedCardInstanceKeys: objectOrderedCardInstanceKeys,
          sortedCardInstanceKeys: objectSortedCardInstanceKeys,
        }
        : null,
      sameOrderedObjectCandidates,
      sameSortedObjectCandidates,
    };
  });
}

function medleyExactRawJoinCandidatesOverlap(
  leftSlot: MedleyExactRawJoinParitySlot,
  leftIndex: number,
  rightSlot: MedleyExactRawJoinParitySlot,
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

function hydrateMedleyExactRawTieFrontierResult(
  slots: readonly MedleySlotSearch[],
  candidatesBySlot: readonly MedleyTeamCandidate[][],
  slotOrder: readonly number[],
  sourceIndicesByOrder: readonly number[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): BandoriMedleyTeamSearchResult | null {
  const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
  for (let orderIndex = 0; orderIndex < slotOrder.length; orderIndex += 1) {
    const slotIndex = slotOrder[orderIndex];
    const sourceIndex = sourceIndicesByOrder[orderIndex] ?? -1;
    const slot = slots[slotIndex];
    const candidate = candidatesBySlot[slotIndex]?.[sourceIndex];
    if (!slot || !candidate) {
      return null;
    }
    const hydratedCandidate = hydrateMedleyExactCandidateForResult(
      slot,
      candidate,
      server,
      perfectRate,
      stats,
      profiling,
    );
    if (!hydratedCandidate) {
      return null;
    }
    selectedBySong[slot.songIndex] = hydratedCandidate;
  }
  return buildMedleyResult([...slots], selectedBySong, configuration);
}

function buildMedleyExactRawTieFrontierSample(
  rawSlots: readonly MedleyExactRawJoinParitySlot[],
  slotOrder: readonly number[],
  indicesByOrder: readonly number[],
): Record<string, unknown> {
  return {
    indicesByOrder: [...indicesByOrder],
    sourceIndicesByOrder: indicesByOrder.map((candidateIndex, orderIndex) => {
      const slot = rawSlots[slotOrder[orderIndex]];
      return slot ? getMedleyExactRawCandidateSourceIndex(slot, candidateIndex) : -1;
    }),
    scoreByOrder: indicesByOrder.map((candidateIndex, orderIndex) => {
      const slot = rawSlots[slotOrder[orderIndex]];
      return slot ? getMedleyExactRawCandidateScore(slot, candidateIndex) : null;
    }),
    cardIdsByOrder: indicesByOrder.map((candidateIndex, orderIndex) => {
      const slot = rawSlots[slotOrder[orderIndex]];
      return slot ? copyMedleyExactRawCandidateCardIds(slot, candidateIndex) : [];
    }),
    cardSearchIndicesByOrder: indicesByOrder.map((candidateIndex, orderIndex) => {
      const slot = rawSlots[slotOrder[orderIndex]];
      return slot ? copyMedleyExactRawCandidateCardSearchIndices(slot, candidateIndex) : [];
    }),
  };
}

function buildMedleyExactRawResidentFillProfile(
  slots: readonly MedleySlotSearch[],
  rawSlots: readonly MedleyExactRawJoinParitySlot[],
  configuration: BandoriAreaItemConfiguration,
  solveProfile: MedleyExactRawIndexFinalJoinSolveProfile,
  sourceHydratedProfile: Record<string, unknown>,
  candidateCountTotal: number,
  candidateCountsBySlot: readonly number[],
  exactHydration: {
    server: number;
    perfectRate: number;
    stats: BandoriMedleyTeamSearchStats;
    profiling: BandoriMedleyTeamSearchProfilingStats;
  },
): Record<string, unknown> {
  if (candidateCountTotal > MEDLEY_EXACT_RAW_RESULT_PARITY_MAX_CANDIDATE_TOTAL) {
    return {
      enabled: true,
      skipped: true,
      skipReason: "candidate-total-limit",
      candidateCountTotal,
      candidateCountsBySlot,
      limit: MEDLEY_EXACT_RAW_RESULT_PARITY_MAX_CANDIDATE_TOTAL,
      behaviorChange: false,
      candidateRemoval: false,
    };
  }
  if (solveProfile.skipped) {
    return {
      enabled: true,
      skipped: true,
      skipReason: solveProfile.skipReason ?? "raw-solver-skipped",
      candidateCountTotal,
      candidateCountsBySlot,
      behaviorChange: false,
      candidateRemoval: false,
    };
  }
  const rawRowHydratedProfile = hydrateMedleyExactRawIndexFinalJoinProfileFromRawRows(
    slots,
    rawSlots,
    configuration,
    solveProfile,
    exactHydration,
  );
  const rawRowHydrated = rawRowHydratedProfile.hydrated === true;
  const rawRowCardIds = Array.isArray(rawRowHydratedProfile.cardIds) ? rawRowHydratedProfile.cardIds : [];
  const sourceCardIds = Array.isArray(sourceHydratedProfile.cardIds) ? sourceHydratedProfile.cardIds : [];
  return {
    enabled: true,
    skipped: false,
    behaviorChange: false,
    candidateRemoval: false,
    resultAuthoritative: false,
    sourceIndexRequiredForWinnerHydration: rawRowHydrated ? false : null,
    richCandidateRequiredForWinnerHydration: rawRowHydrated ? false : null,
    candidateCountTotal,
    candidateCountsBySlot,
    rawRowHydration: rawRowHydratedProfile,
    sourceHydration: {
      hydrated: sourceHydratedProfile.hydrated ?? false,
      hydrationMode: sourceHydratedProfile.hydrationMode ?? null,
      score: sourceHydratedProfile.score ?? null,
      averageScore: sourceHydratedProfile.averageScore ?? null,
      maxScore: sourceHydratedProfile.maxScore ?? null,
      minScore: sourceHydratedProfile.minScore ?? null,
      cardIds: sourceCardIds,
    },
    matchesSourceHydration: rawRowHydrated
      && sourceHydratedProfile.hydrated === true
      && rawRowHydratedProfile.score === sourceHydratedProfile.score
      && rawRowHydratedProfile.averageScore === sourceHydratedProfile.averageScore
      && rawRowHydratedProfile.maxScore === sourceHydratedProfile.maxScore
      && rawRowHydratedProfile.minScore === sourceHydratedProfile.minScore
      && rawRowCardIds.join(",") === sourceCardIds.join(","),
  };
}

function medleyResultOutputFieldsMatch(
  left: BandoriMedleyTeamSearchResult | null,
  right: BandoriMedleyTeamSearchResult | null,
): boolean {
  if (!left || !right) {
    return false;
  }
  return left.score === right.score
    && left.averageScore === right.averageScore
    && left.maxScore === right.maxScore
    && left.minScore === right.minScore
    && left.cardIds.join(",") === right.cardIds.join(",");
}

function buildMedleyExactRawResidentResultRelease(
  slots: readonly MedleySlotSearch[],
  rawCandidateSlotReadSource: MedleyExactRawCandidateSlotReadSource,
  configuration: BandoriAreaItemConfiguration,
  objectResult: BandoriMedleyTeamSearchResult | null,
  exactHydration: {
    server: number;
    perfectRate: number;
    stats: BandoriMedleyTeamSearchStats;
    profiling: BandoriMedleyTeamSearchProfilingStats;
  },
  deadlineAt: number,
  isPastDeadline: () => boolean,
): { result: BandoriMedleyTeamSearchResult | null; profile: Record<string, unknown> } {
  const rawSlots = rawCandidateSlotReadSource.slots;
  const candidateCountsBySlot = rawSlots.map((slot) => slot.length);
  const candidateCountTotal = candidateCountsBySlot.reduce((sum, count) => sum + count, 0);
  const baseProfile = {
    enabled: true,
    behaviorChange: false,
    candidateRemoval: false,
    rawInputSource: rawCandidateSlotReadSource.source,
    candidateCountTotal,
    candidateCountsBySlot,
    returnedRawResult: false,
  };
  if (!objectResult) {
    return {
      result: null,
      profile: {
        ...baseProfile,
        skipped: true,
        skipReason: "no-object-result",
      },
    };
  }
  if (rawCandidateSlotReadSource.source !== "shadow-raw-candidate-builder") {
    return {
      result: null,
      profile: {
        ...baseProfile,
        skipped: true,
        skipReason: "not-resident-raw-source",
      },
    };
  }
  if (
    rawCandidateSlotReadSource.lengthMismatchCount !== 0
    || rawCandidateSlotReadSource.mismatchCountTotal !== 0
  ) {
    return {
      result: null,
      profile: {
        ...baseProfile,
        skipped: true,
        skipReason: "raw-source-mismatch",
        rawSourceLengthMismatchCount: rawCandidateSlotReadSource.lengthMismatchCount,
        rawSourceMismatchCountTotal: rawCandidateSlotReadSource.mismatchCountTotal,
      },
    };
  }
  if (candidateCountTotal > MEDLEY_EXACT_RAW_RESULT_PARITY_MAX_CANDIDATE_TOTAL) {
    return {
      result: null,
      profile: {
        ...baseProfile,
        skipped: true,
        skipReason: "candidate-total-limit",
        limit: MEDLEY_EXACT_RAW_RESULT_PARITY_MAX_CANDIDATE_TOTAL,
      },
    };
  }
  if (Number.isFinite(deadlineAt) && deadlineAt - performance.now() < MEDLEY_EXACT_RAW_RESULT_PARITY_MIN_REMAINING_MS) {
    return {
      result: null,
      profile: {
        ...baseProfile,
        skipped: true,
        skipReason: "remaining-time",
        minRemainingMs: MEDLEY_EXACT_RAW_RESULT_PARITY_MIN_REMAINING_MS,
      },
    };
  }

  const solveProfile = solveMedleyExactRawIndexFinalJoin(
    rawSlots,
    rawCandidateSlotReadSource.source,
    Number.NEGATIVE_INFINITY,
    deadlineAt,
    isPastDeadline,
    {
      retainedMiB: rawCandidateSlotReadSource.retainedMiB,
      rawPoolRetainedMiB: rawCandidateSlotReadSource.rawPoolRetainedMiB,
      lengthMismatchCount: rawCandidateSlotReadSource.lengthMismatchCount,
      mismatchCountTotal: rawCandidateSlotReadSource.mismatchCountTotal,
    },
  );
  let rawResult: BandoriMedleyTeamSearchResult | null = null;
  const rawRowHydration = hydrateMedleyExactRawIndexFinalJoinProfileFromRawRows(
    slots,
    rawSlots,
    configuration,
    solveProfile,
    exactHydration,
    (result) => {
      rawResult = result;
    },
  );
  const matchesObject = medleyResultOutputFieldsMatch(rawResult, objectResult);
  return {
    result: matchesObject ? rawResult : null,
    profile: {
      ...baseProfile,
      skipped: false,
      behaviorChange: matchesObject,
      resultAuthoritative: matchesObject,
      returnedRawResult: matchesObject,
      solve: solveProfile,
      rawRowHydration,
      objectResult: {
        score: objectResult.score,
        averageScore: objectResult.averageScore,
        maxScore: objectResult.maxScore,
        minScore: objectResult.minScore,
        cardIds: objectResult.cardIds,
      },
      matchesObject,
    },
  };
}

function buildMedleyExactRawResidentDirectResultHarness(
  slots: MedleySlotSearch[],
  candidatesBySlot: MedleyTeamCandidate[][],
  rawCandidateSlotReadSource: MedleyExactRawCandidateSlotReadSource,
  configuration: BandoriAreaItemConfiguration,
  exactHydration: {
    server: number;
    perfectRate: number;
    stats: BandoriMedleyTeamSearchStats;
    profiling: BandoriMedleyTeamSearchProfilingStats;
  },
  deadlineAt: number,
  isPastDeadline: () => boolean,
  useWinnerOnlyOracle = false,
): { result: BandoriMedleyTeamSearchResult | null; profile: Record<string, unknown> } {
  const rawSlots = rawCandidateSlotReadSource.slots;
  const candidateCountsBySlot = rawSlots.map((slot) => slot.length);
  const candidateCountTotal = candidateCountsBySlot.reduce((sum, count) => sum + count, 0);
  const baseProfile = {
    enabled: true,
    behaviorChange: false,
    candidateRemoval: false,
    rawInputSource: rawCandidateSlotReadSource.source,
    candidateCountTotal,
    candidateCountsBySlot,
    returnedRawResult: false,
  };
  if (rawCandidateSlotReadSource.source !== "shadow-raw-candidate-builder") {
    return {
      result: null,
      profile: {
        ...baseProfile,
        skipped: true,
        skipReason: "not-resident-raw-source",
      },
    };
  }
  if (
    rawCandidateSlotReadSource.lengthMismatchCount !== 0
    || rawCandidateSlotReadSource.mismatchCountTotal !== 0
  ) {
    return {
      result: null,
      profile: {
        ...baseProfile,
        skipped: true,
        skipReason: "raw-source-mismatch",
        rawSourceLengthMismatchCount: rawCandidateSlotReadSource.lengthMismatchCount,
        rawSourceMismatchCountTotal: rawCandidateSlotReadSource.mismatchCountTotal,
      },
    };
  }
  if (candidateCountsBySlot.some((count) => count <= 0)) {
    return {
      result: null,
      profile: {
        ...baseProfile,
        skipped: true,
        skipReason: "empty-slot",
      },
    };
  }
  if (candidateCountTotal > MEDLEY_EXACT_RAW_DIRECT_RESULT_HARNESS_MAX_CANDIDATE_TOTAL) {
    return {
      result: null,
      profile: {
        ...baseProfile,
        skipped: true,
        skipReason: "candidate-total-limit",
        limit: MEDLEY_EXACT_RAW_DIRECT_RESULT_HARNESS_MAX_CANDIDATE_TOTAL,
      },
    };
  }
  if (
    Number.isFinite(deadlineAt)
    && deadlineAt - performance.now() < MEDLEY_EXACT_RAW_DIRECT_RESULT_HARNESS_MIN_REMAINING_MS
  ) {
    return {
      result: null,
      profile: {
        ...baseProfile,
        skipped: true,
        skipReason: "remaining-time",
        minRemainingMs: MEDLEY_EXACT_RAW_DIRECT_RESULT_HARNESS_MIN_REMAINING_MS,
      },
    };
  }

  const startedAt = performance.now();
  const localDeadlineAt = Math.min(deadlineAt, startedAt + MEDLEY_EXACT_RAW_DIRECT_RESULT_HARNESS_TIMEBOX_MS);
  const rawSolveProfile = solveMedleyExactRawIndexFinalJoin(
    rawSlots,
    rawCandidateSlotReadSource.source,
    Number.NEGATIVE_INFINITY,
    localDeadlineAt,
    isPastDeadline,
    {
      retainedMiB: rawCandidateSlotReadSource.retainedMiB,
      rawPoolRetainedMiB: rawCandidateSlotReadSource.rawPoolRetainedMiB,
      lengthMismatchCount: rawCandidateSlotReadSource.lengthMismatchCount,
      mismatchCountTotal: rawCandidateSlotReadSource.mismatchCountTotal,
    },
  );
  let rawResult: BandoriMedleyTeamSearchResult | null = null;
  const rawRowHydration = hydrateMedleyExactRawIndexFinalJoinProfileFromRawRows(
    slots,
    rawSlots,
    configuration,
    rawSolveProfile,
    exactHydration,
    (result) => {
      rawResult = result;
    },
  );
  if (rawSolveProfile.skipped || rawRowHydration.hydrated !== true || !rawResult) {
    return {
      result: null,
      profile: {
        ...baseProfile,
        skipped: false,
        returnedRawResult: false,
        resultAuthoritative: false,
        elapsedMs: Math.round(performance.now() - startedAt),
        rawSolve: rawSolveProfile,
        rawRowHydration,
        matchesObjectOracle: false,
      },
    };
  }
  if (useWinnerOnlyOracle) {
    return {
      result: rawResult,
      profile: {
        ...baseProfile,
        skipped: false,
        returnedRawResult: true,
        resultAuthoritative: true,
        richCandidateRole: "winner-hydration-only",
        richCandidatePrimaryRetainedCount: 0,
        richCandidateOracleCount: 0,
        winnerHydrationCount: MEDLEY_TEAM_COUNT,
        objectOracleMode: "winner-only-raw-row",
        objectOracleSkipped: true,
        elapsedMs: Math.round(performance.now() - startedAt),
        timeboxMs: MEDLEY_EXACT_RAW_DIRECT_RESULT_HARNESS_TIMEBOX_MS,
        rawSolve: rawSolveProfile,
        rawRowHydration,
        matchesObjectOracle: null,
        exactnessBasis: "raw-solver-over-resident-rows",
      },
    };
  }

  const objectOracle = solveMedleyExactCandidateJoin(
    slots,
    candidatesBySlot,
    configuration,
    Number.NEGATIVE_INFINITY,
    exactHydration.server,
    exactHydration.perfectRate,
    exactHydration.profiling,
    exactHydration.stats,
    isPastDeadline,
    deadlineAt,
    localDeadlineAt,
    null,
    undefined,
    false,
  );
  const matchesObjectOracle = !objectOracle.timedOut && medleyResultOutputFieldsMatch(rawResult, objectOracle.result);
  return {
    result: matchesObjectOracle ? rawResult : null,
    profile: {
      ...baseProfile,
      skipped: false,
      returnedRawResult: matchesObjectOracle,
      resultAuthoritative: matchesObjectOracle,
      richCandidateRole: matchesObjectOracle ? "oracle-only" : "authoritative-fallback",
      richCandidatePrimaryRetainedCount: matchesObjectOracle ? 0 : candidateCountTotal,
      richCandidateOracleCount: candidateCountTotal,
      elapsedMs: Math.round(performance.now() - startedAt),
      timeboxMs: MEDLEY_EXACT_RAW_DIRECT_RESULT_HARNESS_TIMEBOX_MS,
      rawSolve: rawSolveProfile,
      rawRowHydration,
      objectOracle: {
        timedOut: objectOracle.timedOut,
        localTimedOut: objectOracle.localTimedOut ?? false,
        score: objectOracle.result?.score ?? null,
        averageScore: objectOracle.result?.averageScore ?? null,
        maxScore: objectOracle.result?.maxScore ?? null,
        minScore: objectOracle.result?.minScore ?? null,
        cardIds: objectOracle.result?.cardIds ?? [],
      },
      matchesObjectOracle,
    },
  };
}

function buildMedleyExactRawBestScoreTieFrontierProfile(
  slots: readonly MedleySlotSearch[],
  rawSlots: readonly MedleyExactRawJoinParitySlot[],
  candidatesBySlot: readonly MedleyTeamCandidate[][],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  stats: BandoriMedleyTeamSearchStats,
  deadlineAt: number,
  solveProfile: MedleyExactRawIndexFinalJoinSolveProfile,
  objectResult: BandoriMedleyTeamSearchResult | null,
): Record<string, unknown> {
  const rawBestScore = solveProfile.rawBestScore ?? null;
  const slotOrder = solveProfile.slotOrder ?? [];
  if (rawBestScore === null || slotOrder.length !== MEDLEY_TEAM_COUNT || solveProfile.skipped) {
    return {
      enabled: true,
      skipped: true,
      skipReason: "raw-best-unavailable",
      rawBestScore,
      slotOrder,
    };
  }
  const firstSlot = rawSlots[slotOrder[0]];
  const secondSlot = rawSlots[slotOrder[1]];
  const thirdSlot = rawSlots[slotOrder[2]];
  if (!firstSlot || !secondSlot || !thirdSlot) {
    return {
      enabled: true,
      skipped: true,
      skipReason: "invalid-slot-order",
      rawBestScore,
      slotOrder,
    };
  }

  const startedAt = performance.now();
  const localDeadlineAt = Math.min(deadlineAt, startedAt + MEDLEY_EXACT_RAW_TIE_FRONTIER_TIMEBOX_MS);
  const bestSecondScore = getMedleyExactRawCandidateScore(secondSlot, 0);
  const bestThirdScore = getMedleyExactRawCandidateScore(thirdSlot, 0);
  let checkedPairCount = 0;
  let tieCombinationCount = 0;
  let overlapRejectedTieCount = 0;
  let hydratedTieCount = 0;
  let hydrationFailureCount = 0;
  let timedOut = false;
  let bestHydratedResult: BandoriMedleyTeamSearchResult | null = null;
  const samples: Array<Record<string, unknown>> = [];

  for (let firstIndex = 0; firstIndex < firstSlot.length; firstIndex += 1) {
    const firstScore = getMedleyExactRawCandidateScore(firstSlot, firstIndex);
    if (firstScore + bestSecondScore + bestThirdScore < rawBestScore) {
      break;
    }
    for (let secondIndex = 0; secondIndex < secondSlot.length; secondIndex += 1) {
      checkedPairCount += 1;
      if ((checkedPairCount & 4095) === 0 && performance.now() >= localDeadlineAt) {
        timedOut = true;
        break;
      }
      const secondScore = getMedleyExactRawCandidateScore(secondSlot, secondIndex);
      if (firstScore + secondScore + bestThirdScore < rawBestScore) {
        break;
      }
      if (medleyExactRawJoinCandidatesOverlap(firstSlot, firstIndex, secondSlot, secondIndex)) {
        continue;
      }
      const targetThirdScore = rawBestScore - firstScore - secondScore;
      if (targetThirdScore > bestThirdScore) {
        continue;
      }
      for (let thirdIndex = 0; thirdIndex < thirdSlot.length; thirdIndex += 1) {
        const thirdScore = getMedleyExactRawCandidateScore(thirdSlot, thirdIndex);
        if (thirdScore < targetThirdScore) {
          break;
        }
        if (thirdScore !== targetThirdScore) {
          continue;
        }
        if (
          medleyExactRawJoinCandidatesOverlap(firstSlot, firstIndex, thirdSlot, thirdIndex)
          || medleyExactRawJoinCandidatesOverlap(secondSlot, secondIndex, thirdSlot, thirdIndex)
        ) {
          overlapRejectedTieCount += 1;
          continue;
        }
        const indicesByOrder = [firstIndex, secondIndex, thirdIndex];
        tieCombinationCount += 1;
        if (samples.length < MEDLEY_EXACT_RAW_TIE_FRONTIER_SAMPLE_LIMIT) {
          samples.push(buildMedleyExactRawTieFrontierSample(rawSlots, slotOrder, indicesByOrder));
        }
        if (hydratedTieCount < MEDLEY_EXACT_RAW_TIE_FRONTIER_HYDRATE_LIMIT) {
          const sourceIndicesByOrder = indicesByOrder.map((candidateIndex, orderIndex) => (
            getMedleyExactRawCandidateSourceIndex(rawSlots[slotOrder[orderIndex]]!, candidateIndex)
          ));
          const hydratedResult = hydrateMedleyExactRawTieFrontierResult(
            slots,
            candidatesBySlot,
            slotOrder,
            sourceIndicesByOrder,
            configuration,
            server,
            perfectRate,
            stats,
            profiling,
          );
          hydratedTieCount += 1;
          if (hydratedResult) {
            bestHydratedResult = compareMedleyResultLike(bestHydratedResult, hydratedResult);
          } else {
            hydrationFailureCount += 1;
          }
        }
      }
    }
    if (timedOut) {
      break;
    }
  }

  return {
    enabled: true,
    skipped: false,
    rawBestScore,
    slotOrder,
    elapsedMs: Math.round(performance.now() - startedAt),
    timedOut,
    timeboxMs: MEDLEY_EXACT_RAW_TIE_FRONTIER_TIMEBOX_MS,
    checkedPairCount,
    tieCombinationCount,
    overlapRejectedTieCount,
    hydratedTieCount,
    hydrationLimit: MEDLEY_EXACT_RAW_TIE_FRONTIER_HYDRATE_LIMIT,
    hydrationFailureCount,
    sampleLimit: MEDLEY_EXACT_RAW_TIE_FRONTIER_SAMPLE_LIMIT,
    samples,
    bestHydratedScore: bestHydratedResult?.score ?? null,
    bestHydratedMaxScore: bestHydratedResult?.maxScore ?? null,
    bestHydratedMinScore: bestHydratedResult?.minScore ?? null,
    bestHydratedCardIds: bestHydratedResult?.cardIds ?? [],
    objectScore: objectResult?.score ?? null,
    objectMaxScore: objectResult?.maxScore ?? null,
    objectMinScore: objectResult?.minScore ?? null,
    objectCardIds: objectResult?.cardIds ?? [],
    bestHydratedMatchesObject: !!bestHydratedResult && !!objectResult
      && bestHydratedResult.score === objectResult.score
      && bestHydratedResult.maxScore === objectResult.maxScore
      && bestHydratedResult.cardIds.join(",") === objectResult.cardIds.join(","),
  };
}

function buildMedleyExactRawSolverHandoffProfile(
  slots: readonly MedleySlotSearch[],
  rawCandidateSlotReadSource: MedleyExactRawCandidateSlotReadSource,
  candidatesBySlot: readonly MedleyTeamCandidate[][],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  stats: BandoriMedleyTeamSearchStats,
  deadlineAt: number,
  isPastDeadline: () => boolean,
  enableRawResidentFill = false,
): Record<string, unknown> {
  const rawSlots = rawCandidateSlotReadSource.slots;
  const candidateCountsBySlot = rawSlots.map((slot) => slot.length);
  const candidateCountTotal = candidateCountsBySlot.reduce((sum, count) => sum + count, 0);
  const { slotOrder } = getMedleyExactRawCandidateJoinSlotOrder(rawSlots);
  let sourceIndexRangeViolationCount = 0;
  let missingCardIdRowCount = 0;
  let duplicateCardIdRowCount = 0;
  let scoreOrderViolationCount = 0;

  for (let slotIndex = 0; slotIndex < rawSlots.length; slotIndex += 1) {
    const rawSlot = rawSlots[slotIndex];
    const richCandidates = candidatesBySlot[slotIndex] ?? [];
    let previousScore = Number.POSITIVE_INFINITY;
    for (let candidateIndex = 0; candidateIndex < rawSlot.length; candidateIndex += 1) {
      const score = getMedleyExactRawCandidateScore(rawSlot, candidateIndex);
      if (score > previousScore) {
        scoreOrderViolationCount += 1;
      }
      previousScore = score;

      const sourceIndex = getMedleyExactRawCandidateSourceIndex(rawSlot, candidateIndex);
      if (sourceIndex < 0 || sourceIndex >= richCandidates.length) {
        sourceIndexRangeViolationCount += 1;
      }

      const cardIds = new Set<number>();
      let hasMissingCardId = false;
      let hasDuplicateCardId = false;
      for (let cardIndex = 0; cardIndex < MEDLEY_TEAM_SIZE; cardIndex += 1) {
        const cardId = getMedleyExactRawCandidateCardIdAt(rawSlot, candidateIndex, cardIndex);
        if (cardId < 0) {
          hasMissingCardId = true;
          continue;
        }
        if (cardIds.has(cardId)) {
          hasDuplicateCardId = true;
        }
        cardIds.add(cardId);
      }
      if (hasMissingCardId) {
        missingCardIdRowCount += 1;
      }
      if (hasDuplicateCardId) {
        duplicateCardIdRowCount += 1;
      }
    }
  }

  const canReadAsResidentRawSource = (
    rawCandidateSlotReadSource.lengthMismatchCount === 0
    && rawCandidateSlotReadSource.mismatchCountTotal === 0
    && scoreOrderViolationCount === 0
    && missingCardIdRowCount === 0
    && duplicateCardIdRowCount === 0
  );
  const canHydrateWinnerFromSourceIndex = (
    canReadAsResidentRawSource
    && sourceIndexRangeViolationCount === 0
  );
  const canRunExactWinnerHydration = (
    candidateCountTotal <= MEDLEY_EXACT_RAW_RESULT_PARITY_MAX_CANDIDATE_TOTAL
  );
  const hydrationReplaySolveProfile = solveMedleyExactRawIndexFinalJoin(
    rawSlots,
    rawCandidateSlotReadSource.source,
    Number.NEGATIVE_INFINITY,
    deadlineAt,
    isPastDeadline,
    {
      retainedMiB: rawCandidateSlotReadSource.retainedMiB,
      rawPoolRetainedMiB: rawCandidateSlotReadSource.rawPoolRetainedMiB,
      lengthMismatchCount: rawCandidateSlotReadSource.lengthMismatchCount,
      mismatchCountTotal: rawCandidateSlotReadSource.mismatchCountTotal,
    },
  );
  const hydrationReplay = {
    solve: hydrationReplaySolveProfile,
    hydratedResult: hydrateMedleyExactRawIndexFinalJoinProfile(
      slots,
      candidatesBySlot,
      configuration,
      hydrationReplaySolveProfile,
      canRunExactWinnerHydration ? {
        server,
        perfectRate,
        stats,
        profiling,
      } : undefined,
    ),
  };
  const rawResidentFill = enableRawResidentFill
    ? buildMedleyExactRawResidentFillProfile(
      slots,
      rawSlots,
      configuration,
      hydrationReplaySolveProfile,
      hydrationReplay.hydratedResult,
      candidateCountTotal,
      candidateCountsBySlot,
      {
        server,
        perfectRate,
        stats,
        profiling,
      },
    )
    : null;
  const resultParity = buildMedleyExactRawResultParityProfile(
    slots,
    rawSlots,
    candidatesBySlot,
    configuration,
    server,
    perfectRate,
    profiling,
    stats,
    deadlineAt,
    isPastDeadline,
    hydrationReplay.hydratedResult,
    hydrationReplaySolveProfile,
  );
  return {
    enabled: true,
    kind: "raw-solver-handoff-readiness",
    rawInputSource: rawCandidateSlotReadSource.source,
    candidateCountsBySlot,
    candidateCountTotal,
    slotOrder,
    retainedMiB: rawCandidateSlotReadSource.retainedMiB,
    rawPoolRetainedMiB: rawCandidateSlotReadSource.rawPoolRetainedMiB,
    rawSourceLengthMismatchCount: rawCandidateSlotReadSource.lengthMismatchCount,
    rawSourceMismatchCountTotal: rawCandidateSlotReadSource.mismatchCountTotal,
    scoreOrderViolationCount,
    sourceIndexRangeViolationCount,
    missingCardIdRowCount,
    duplicateCardIdRowCount,
    canReadAsResidentRawSource,
    canHydrateWinnerFromSourceIndex,
    canHydrateWinnerFromCardIds: canReadAsResidentRawSource,
    exactWinnerHydrationEnabled: canRunExactWinnerHydration,
    exactWinnerHydrationCandidateTotalLimit: MEDLEY_EXACT_RAW_RESULT_PARITY_MAX_CANDIDATE_TOTAL,
    hydrationReplay,
    rawResidentFill,
    resultParity,
    nextRequiredStep: canReadAsResidentRawSource
      ? "prototype raw-resident fill that uses raw rows as winner storage"
      : "fix raw source ordering or row completeness before handoff",
  };
}

function buildMedleyExactRawResultParityProfile(
  slots: readonly MedleySlotSearch[],
  rawSlots: readonly MedleyExactRawJoinParitySlot[],
  candidatesBySlot: readonly MedleyTeamCandidate[][],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  stats: BandoriMedleyTeamSearchStats,
  deadlineAt: number,
  isPastDeadline: () => boolean,
  rawHydratedProfile: Record<string, unknown>,
  rawSolveProfile: MedleyExactRawIndexFinalJoinSolveProfile,
): Record<string, unknown> {
  const candidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
  const candidateCountTotal = candidateCountsBySlot.reduce((sum, count) => sum + count, 0);
  if (candidateCountTotal > MEDLEY_EXACT_RAW_RESULT_PARITY_MAX_CANDIDATE_TOTAL) {
    return {
      enabled: true,
      skipped: true,
      skipReason: "candidate-total-limit",
      candidateCountTotal,
      candidateCountsBySlot,
      limit: MEDLEY_EXACT_RAW_RESULT_PARITY_MAX_CANDIDATE_TOTAL,
    };
  }
  const remainingMs = deadlineAt - performance.now();
  if (Number.isFinite(deadlineAt) && remainingMs < MEDLEY_EXACT_RAW_RESULT_PARITY_MIN_REMAINING_MS) {
    return {
      enabled: true,
      skipped: true,
      skipReason: "remaining-time",
      candidateCountTotal,
      candidateCountsBySlot,
      remainingMs: Math.max(0, Math.round(remainingMs)),
      minRemainingMs: MEDLEY_EXACT_RAW_RESULT_PARITY_MIN_REMAINING_MS,
    };
  }
  if (rawSolveProfile.skipped || rawHydratedProfile.hydrated !== true) {
    return {
      enabled: true,
      skipped: true,
      skipReason: "raw-hydration-unavailable",
      candidateCountTotal,
      candidateCountsBySlot,
      rawSolveSkipped: rawSolveProfile.skipped,
      rawHydrated: rawHydratedProfile.hydrated ?? false,
      rawHydrationSkipReason: rawHydratedProfile.skipReason ?? rawHydratedProfile.failureReason ?? null,
    };
  }

  const startedAt = performance.now();
  const objectSolve = solveMedleyExactCandidateJoin(
    [...slots],
    candidatesBySlot.map((candidates) => [...candidates]),
    configuration,
    Number.NEGATIVE_INFINITY,
    server,
    perfectRate,
    profiling,
    stats,
    isPastDeadline,
    deadlineAt,
    Math.min(deadlineAt, startedAt + MEDLEY_EXACT_RAW_RESULT_PARITY_TIMEBOX_MS),
    null,
    undefined,
    false,
  );
  const objectResult = objectSolve.result;
  const rawScore = rawSolveProfile.rawBestScore ?? null;
  const rawAverageScore = rawSolveProfile.rawBestAverageScore ?? null;
  const rawMaxScore = rawSolveProfile.rawBestMaxScore ?? null;
  const rawMinScore = rawSolveProfile.rawBestMinScore ?? null;
  const hydratedScore = typeof rawHydratedProfile.score === "number" ? rawHydratedProfile.score : null;
  const hydratedAverageScore = typeof rawHydratedProfile.averageScore === "number"
    ? rawHydratedProfile.averageScore
    : null;
  const hydratedMaxScore = typeof rawHydratedProfile.maxScore === "number" ? rawHydratedProfile.maxScore : null;
  const hydratedMinScore = typeof rawHydratedProfile.minScore === "number" ? rawHydratedProfile.minScore : null;
  const rawCardIds = Array.isArray(rawHydratedProfile.cardIds) ? rawHydratedProfile.cardIds : [];
  const objectCardIds = objectResult?.cardIds ?? [];
  const rawRowHydratedProfile = hydrateMedleyExactRawIndexFinalJoinProfileFromRawRows(
    slots,
    rawSlots,
    configuration,
    rawSolveProfile,
    {
      server,
      perfectRate,
      stats,
      profiling,
    },
  );
  const rawRowHydratedScore = typeof rawRowHydratedProfile.score === "number"
    ? rawRowHydratedProfile.score
    : null;
  const rawRowHydratedAverageScore = typeof rawRowHydratedProfile.averageScore === "number"
    ? rawRowHydratedProfile.averageScore
    : null;
  const rawRowHydratedMaxScore = typeof rawRowHydratedProfile.maxScore === "number"
    ? rawRowHydratedProfile.maxScore
    : null;
  const rawRowHydratedMinScore = typeof rawRowHydratedProfile.minScore === "number"
    ? rawRowHydratedProfile.minScore
    : null;
  const rawRowHydratedCardIds = Array.isArray(rawRowHydratedProfile.cardIds)
    ? rawRowHydratedProfile.cardIds
    : [];
  const winnerSourceDiagnostics = buildMedleyExactRawObjectWinnerSourceDiagnostics(
    slots,
    rawSlots,
    candidatesBySlot,
    objectResult,
    rawSolveProfile,
  );
  const tieFrontier = buildMedleyExactRawBestScoreTieFrontierProfile(
    slots,
    rawSlots,
    candidatesBySlot,
    configuration,
    server,
    perfectRate,
    profiling,
    stats,
    deadlineAt,
    rawSolveProfile,
    objectResult,
  );
  return {
    enabled: true,
    skipped: false,
    candidateCountTotal,
    candidateCountsBySlot,
    objectTimedOut: objectSolve.timedOut,
    objectLocalTimedOut: objectSolve.localTimedOut,
    elapsedMs: Math.round(performance.now() - startedAt),
    rawScore,
    objectScore: objectResult?.score ?? null,
    hydratedScore,
    rawAverageScore,
    objectAverageScore: objectResult?.averageScore ?? null,
    hydratedAverageScore,
    rawMaxScore,
    objectMaxScore: objectResult?.maxScore ?? null,
    hydratedMaxScore,
    rawMinScore,
    objectMinScore: objectResult?.minScore ?? null,
    hydratedMinScore,
    rawRowHydratedScore,
    rawRowHydratedAverageScore,
    rawRowHydratedMaxScore,
    rawRowHydratedMinScore,
    scoreMatches: rawScore !== null && rawScore === (objectResult?.score ?? null),
    averageScoreMatches: rawAverageScore !== null && rawAverageScore === (objectResult?.averageScore ?? null),
    maxScoreMatches: rawMaxScore !== null && rawMaxScore === (objectResult?.maxScore ?? null),
    minScoreMatches: rawMinScore !== null && rawMinScore === (objectResult?.minScore ?? null),
    hydratedScoreMatchesRaw: hydratedScore !== null && hydratedScore === rawScore,
    hydratedAverageScoreMatchesRaw: hydratedAverageScore !== null && hydratedAverageScore === rawAverageScore,
    hydratedMaxScoreMatchesRaw: hydratedMaxScore !== null && hydratedMaxScore === rawMaxScore,
    hydratedMinScoreMatchesRaw: hydratedMinScore !== null && hydratedMinScore === rawMinScore,
    hydratedScoreMatchesObject: hydratedScore !== null && hydratedScore === (objectResult?.score ?? null),
    hydratedAverageScoreMatchesObject: hydratedAverageScore !== null
      && hydratedAverageScore === (objectResult?.averageScore ?? null),
    hydratedMaxScoreMatchesObject: hydratedMaxScore !== null && hydratedMaxScore === (objectResult?.maxScore ?? null),
    hydratedMinScoreMatchesObject: hydratedMinScore !== null && hydratedMinScore === (objectResult?.minScore ?? null),
    rawRowHydratedScoreMatchesObject: rawRowHydratedScore !== null
      && rawRowHydratedScore === (objectResult?.score ?? null),
    rawRowHydratedAverageScoreMatchesObject: rawRowHydratedAverageScore !== null
      && rawRowHydratedAverageScore === (objectResult?.averageScore ?? null),
    rawRowHydratedMaxScoreMatchesObject: rawRowHydratedMaxScore !== null
      && rawRowHydratedMaxScore === (objectResult?.maxScore ?? null),
    rawRowHydratedMinScoreMatchesObject: rawRowHydratedMinScore !== null
      && rawRowHydratedMinScore === (objectResult?.minScore ?? null),
    rawRowHydratedCardIdsMatchObject: rawRowHydratedCardIds.join(",") === objectCardIds.join(","),
    cardIdsMatch: rawCardIds.join(",") === objectCardIds.join(","),
    rawCardIds,
    objectCardIds,
    rawRowHydration: rawRowHydratedProfile,
    winnerSourceDiagnostics,
    tieFrontier,
  };
}

function getMedleyExactRawCandidateJoinSlotOrder(
  rawSlots: readonly MedleyExactRawCandidateSlotView[],
): MedleyExactRawCandidateJoinSlotOrder {
  return {
    slotOrder: rawSlots
      .map((_, index) => index)
      .sort((left, right) => (
        rawSlots[left].length - rawSlots[right].length
        || getMedleyExactRawCandidateScore(rawSlots[right], 0) - getMedleyExactRawCandidateScore(rawSlots[left], 0)
      )),
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
  enableCapacityBatchPruning = false,
  enablePrefixCapacityLevel3Replay = false,
  enablePrefixCapacityLevel3LookaheadReplay = false,
  enableCapacitySourceLeafPruning = false,
  enableCapacityLevel3LookaheadPruning = false,
  enablePreMaterializationCensus = false,
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
  const rawPairUpperQueryCache = new Map<string, MedleyExactRawCandidatePairUpperQuery>();
  let rawPairComplementUpperQueryCount = 0;
  let rawPairComplementUpperFallbackCount = 0;
  let rawPairComplementUpperBuildCount = 0;
  let rawPairComplementUpperScannedLeftCandidateCount = 0;
  let rawPairComplementUpperScannedRightWordCount = 0;
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
    || enableCapacityBatchPruning
    || enablePrefixCapacityLevel3Replay
    || enablePrefixCapacityLevel3LookaheadReplay
    || enableCapacitySourceLeafPruning
    || enableCapacityLevel3LookaheadPruning
  )
    ? createMedleyExactPrefixUpperReplayProfile(
      slot,
      enablePrefixHardUpperReplay,
      (
        enablePrefixOtherUpperSourceReplay
        || enablePrefixCapacityBatchReplay
        || enableCapacityBatchPruning
        || enablePrefixCapacityLevel3Replay
        || enablePrefixCapacityLevel3LookaheadReplay
        || enableCapacitySourceLeafPruning
        || enableCapacityLevel3LookaheadPruning
      ),
      finitePrefixOtherUpperSourceReplayMaxChecks,
      finitePrefixOtherUpperSourceReplayMaxMargin,
    )
    : null;
  const preMaterializationCensusProfile = enablePreMaterializationCensus
    ? createMedleyExactPreMaterializationCensusProfile(slot)
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
    prefixLevel3LookaheadReplayDecision?: MedleyExactPrefixOtherUpperSourceReplayDecision | null;
  };
  const level3LookaheadReplayDecisionByChildPrefixKey = (
    enablePrefixCapacityLevel3LookaheadReplay || enableCapacityLevel3LookaheadPruning
      ? new Map<string, MedleyExactPrefixOtherUpperSourceReplayDecision>()
      : null
  );
  const buildSelectedCardIndexPrefixKey = (selectedCardIndices: number[]): string => selectedCardIndices.join(",");
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
    if (input.prefixLevel3LookaheadReplayDecision?.wouldSkip === true) {
      node.prefixLevel3LookaheadReplayWouldSkip = true;
      node.prefixLevel3LookaheadReplayPrefixUpper = input.prefixLevel3LookaheadReplayDecision.prefixUpper;
      node.prefixLevel3LookaheadReplayBestSafeOtherUpper = (
        input.prefixLevel3LookaheadReplayDecision.bestSafeOtherUpper
      );
      node.prefixLevel3LookaheadReplayProofCutoffScore = (
        input.prefixLevel3LookaheadReplayDecision.proofCutoffScore
      );
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
  const peekUpperBoundExcludingCardIds = (
    excludedCardIds: readonly number[],
    diagnosticDeadlineAt = Number.POSITIVE_INFINITY,
  ): MedleyExactConstrainedSlotPeekUpperResult => {
    const startedAt = performance.now();
    const fallbackUpperBound = (
      heapKeyMode === "slot"
        ? heap[0]?.key ?? Number.NEGATIVE_INFINITY
        : peekMaxHeapSlotUpperBound()
    );
    if (excludedCardIds.length === 0 || heap.length === 0) {
      return {
        upperBound: fallbackUpperBound,
        fallbackUpperBound,
        completed: true,
        timedOut: false,
        heapNodeCount: heap.length,
        scannedNodeCount: 0,
        finiteNodeCount: Number.isFinite(fallbackUpperBound) ? 1 : 0,
        skippedSelectedCardNodeCount: 0,
        candidateNodeCount: 0,
        recomputedPrefixNodeCount: 0,
        elapsedMs: Math.round(performance.now() - startedAt),
      };
    }
    const excludedCardIdSet = new Set(excludedCardIds);
    let upperBound = Number.NEGATIVE_INFINITY;
    let scannedNodeCount = 0;
    let finiteNodeCount = 0;
    let skippedSelectedCardNodeCount = 0;
    let candidateNodeCount = 0;
    let recomputedPrefixNodeCount = 0;
    let timedOut = false;
    for (const node of heap) {
      if ((scannedNodeCount & 1023) === 0 && performance.now() >= diagnosticDeadlineAt) {
        timedOut = true;
        break;
      }
      scannedNodeCount += 1;
      const selectedCards = getSelectedCardsForNode(node);
      if (selectedCards.some((card) => excludedCardIdSet.has(card.cardId))) {
        skippedSelectedCardNodeCount += 1;
        continue;
      }
      const nodeUpperBound = node.candidate
        ? node.slotUpperBound
        : estimateMedleyExactSlotNodeUpperBound(
          slot,
          selectedCards,
          node.startIndex,
          excludedCardIdSet,
          node.usedCharacterMaskLow,
          node.usedCharacterMaskHigh,
          node.selectedPower,
          profiling,
          Number.NEGATIVE_INFINITY,
        );
      if (node.candidate) {
        candidateNodeCount += 1;
      } else {
        recomputedPrefixNodeCount += 1;
      }
      if (Number.isFinite(nodeUpperBound)) {
        finiteNodeCount += 1;
      }
      if (nodeUpperBound > upperBound) {
        upperBound = nodeUpperBound;
      }
    }
    if (performance.now() >= diagnosticDeadlineAt && scannedNodeCount < heap.length) {
      timedOut = true;
    }
    return {
      upperBound: timedOut ? fallbackUpperBound : upperBound,
      fallbackUpperBound,
      completed: !timedOut,
      timedOut,
      heapNodeCount: heap.length,
      scannedNodeCount,
      finiteNodeCount,
      skippedSelectedCardNodeCount,
      candidateNodeCount,
      recomputedPrefixNodeCount,
      elapsedMs: Math.round(performance.now() - startedAt),
    };
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
  const getPrefixLevel3LookaheadReplayDecisionForNode = (
    node: MedleyExactSlotCandidateSearchNode,
  ): MedleyExactPrefixOtherUpperSourceReplayDecision | null => {
    if (
      node.prefixLevel3LookaheadReplayWouldSkip !== true
      || node.prefixLevel3LookaheadReplayPrefixUpper === undefined
      || node.prefixLevel3LookaheadReplayBestSafeOtherUpper === undefined
      || node.prefixLevel3LookaheadReplayProofCutoffScore === undefined
    ) {
      return null;
    }
    return {
      wouldSkip: true,
      level: MEDLEY_TEAM_SIZE - 1,
      prefixUpper: node.prefixLevel3LookaheadReplayPrefixUpper,
      bestSafeOtherUpper: node.prefixLevel3LookaheadReplayBestSafeOtherUpper,
      proofCutoffScore: node.prefixLevel3LookaheadReplayProofCutoffScore,
    };
  };
  const getRelaxedImpliedCompletionCount = (
    selectedCardCount: number,
    nextStartIndex: number,
  ): number => estimateRelaxedCombinationCount(
    slot.searchCards.length - nextStartIndex,
    MEDLEY_TEAM_SIZE - selectedCardCount,
  );
  const getPreMaterializationCensusLevel = (
    selectedCardCount: number,
  ): MedleyExactPreMaterializationCensusLevelProfile | null => (
    preMaterializationCensusProfile
      ? getMedleyExactPreMaterializationCensusLevel(preMaterializationCensusProfile, selectedCardCount)
      : null
  );
  const recordPreMaterializationExpandedNode = (): void => {
    if (preMaterializationCensusProfile) {
      preMaterializationCensusProfile.expandedNodeCount += 1;
    }
  };
  const recordPreMaterializationInsufficientRemainingNodeReject = (): void => {
    if (preMaterializationCensusProfile) {
      preMaterializationCensusProfile.insufficientRemainingNodeRejectCount += 1;
    }
  };
  const recordPreMaterializationBranchVisit = (selectedCardCount: number): void => {
    const level = getPreMaterializationCensusLevel(selectedCardCount);
    if (level) {
      level.branchVisitCount += 1;
    }
  };
  const recordPreMaterializationDuplicateCharacterReject = (selectedCardCount: number): void => {
    const level = getPreMaterializationCensusLevel(selectedCardCount);
    if (level) {
      level.duplicateCharacterRejectCount += 1;
    }
  };
  const recordPreMaterializationSlotUpperResult = (
    selectedCardCount: number,
    nextStartIndex: number,
    upperBound: number,
    scoreCutoff: number,
  ): void => {
    const level = getPreMaterializationCensusLevel(selectedCardCount);
    if (!level) {
      return;
    }
    level.slotUpperCheckedCount += 1;
    if (Number.isFinite(upperBound)) {
      level.slotUpperFiniteCount += 1;
    }
    if (!Number.isFinite(upperBound) || upperBound < scoreCutoff) {
      level.slotUpperRejectedCount += 1;
      level.slotUpperRejectedImpliedCompletionCount = addCappedCount(
        level.slotUpperRejectedImpliedCompletionCount,
        getRelaxedImpliedCompletionCount(selectedCardCount, nextStartIndex),
      );
    } else {
      level.slotUpperPassedCount += 1;
    }
  };
  const recordPreMaterializationGlobalUpperReject = (selectedCardCount: number): void => {
    const level = getPreMaterializationCensusLevel(selectedCardCount);
    if (level) {
      level.globalUpperRejectedCount += 1;
    }
  };
  const recordPreMaterializationCandidateKeyReject = (selectedCardCount: number): void => {
    const level = getPreMaterializationCensusLevel(selectedCardCount);
    if (level) {
      level.candidateKeyRejectedCount += 1;
    }
  };
  const recordPreMaterializationCandidateEvaluation = (selectedCardCount: number): void => {
    const level = getPreMaterializationCensusLevel(selectedCardCount);
    if (level) {
      level.candidateEvaluationCount += 1;
    }
  };
  const recordPreMaterializationCandidateResult = (
    selectedCardCount: number,
    candidate: MedleyTeamCandidate | null,
    scoreCutoff: number,
  ): void => {
    const level = getPreMaterializationCensusLevel(selectedCardCount);
    if (!level) {
      return;
    }
    if (!candidate) {
      level.candidateNullCount += 1;
      return;
    }
    if (candidate.result.score < scoreCutoff) {
      level.candidateScoreRejectedCount += 1;
    }
  };
  const recordPreMaterializationMaterializedCandidate = (selectedCardCount: number): void => {
    const level = getPreMaterializationCensusLevel(selectedCardCount);
    if (level) {
      level.materializedCandidateCount += 1;
      level.pushedCandidateNodeCount += 1;
    }
  };
  const recordPreMaterializationPushedPrefixNode = (selectedCardCount: number): void => {
    const level = getPreMaterializationCensusLevel(selectedCardCount);
    if (level) {
      level.pushedPrefixNodeCount += 1;
    }
  };
  const recordPreMaterializationBranchKind = (selectedCardCount: number): void => {
    const level = getPreMaterializationCensusLevel(selectedCardCount);
    if (!level) {
      return;
    }
    if (selectedCardCount === MEDLEY_TEAM_SIZE) {
      level.leafBranchCount += 1;
    } else {
      level.prefixBranchCount += 1;
    }
  };
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
  const peekMaxHeapSlotUpperNode = (): MedleyExactSlotCandidateSearchNode | null => {
    while (slotUpperHeap.length > 0 && slotUpperHeap[0].activeInSlotUpperHeap !== true) {
      popMedleyExactSlotUpperSearchNode(slotUpperHeap);
    }
    return slotUpperHeap[0] ?? null;
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
    if (globalPruning.useRawPairComplementUpper === true && globalPruning.rawCandidatesBySlot) {
      const rawLeftSlot = globalPruning.rawCandidatesBySlot[leftSlotIndex];
      const rawRightSlot = globalPruning.rawCandidatesBySlot[rightSlotIndex];
      if (
        rawLeftSlot
        && rawRightSlot
        && rawLeftSlot.length === leftCandidates.length
        && rawRightSlot.length === rightCandidates.length
      ) {
        let rawPairUpperQuery = rawPairUpperQueryCache.get(pairUpperQueryKey);
        if (!rawPairUpperQuery) {
          rawPairUpperQuery = buildMedleyExactRawCandidatePairUpperQuery(rawLeftSlot, rawRightSlot);
          rawPairUpperQueryCache.set(pairUpperQueryKey, rawPairUpperQuery);
          rawPairComplementUpperBuildCount += 1;
        }
        const rawResult = estimateGeneratedMedleyExactRawCandidatePairUpperExcludingCardIds(
          rawPairUpperQuery,
          selectedCardIds,
          minimumRelevantScore,
          profiling,
        );
        rawPairComplementUpperQueryCount += 1;
        rawPairComplementUpperScannedLeftCandidateCount += rawResult.scannedLeftCandidateCount;
        rawPairComplementUpperScannedRightWordCount += rawResult.scannedRightWordCount;
        const complementUpperBound = Math.max(
          rawResult.upperBound,
          finitePairUnseenUpperBound,
        );
        setMedleyExactNestedNumberCache(globalPairComplementUpperCache, cachePrefixKey, cardKey, complementUpperBound);
        return complementUpperBound;
      }
      rawPairComplementUpperFallbackCount += 1;
    }
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
    // Real pruning runs inside the candidate-birth hot path. The tighter capacity
    // proof is useful for replay, but P02 hard rows need the cheaper optimistic
    // basic capacity bound to avoid turning proof work into the memory bottleneck.
    const tightCapacityUpper = enablePruning
      ? Number.POSITIVE_INFINITY
      : estimateMedleyRemainingScoreUpperBound(
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
    const proofLedgerSample: MedleyExactPrefixOtherUpperSourceReplaySample = {
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
    };
    if (
      sourceProfile.samples.length < MEDLEY_EXACT_PREFIX_OTHER_UPPER_SOURCE_REPLAY_SAMPLE_LIMIT
      && (bestSafeImproved || bestSafeWouldSkip || (generatedPairUpperOrNull !== null && generatedPairOnlyMargin < 0))
    ) {
      sourceProfile.samples.push(proofLedgerSample);
    }
    if (enablePruning && bestSafeWouldSkip) {
      sourceProfile.prunedCount += 1;
      sourceProfile.prunedImpliedCompletionCount = addCappedCount(
        sourceProfile.prunedImpliedCompletionCount,
        impliedCompletionCount,
      );
      sourceProfile.prunedProofLedgerCount += 1;
      sourceProfile.prunedProofLedgerImpliedCompletionCount = addCappedCount(
        sourceProfile.prunedProofLedgerImpliedCompletionCount,
        impliedCompletionCount,
      );
      sourceProfile.prunedProofLedgerMarginMin = minNullableNumber(
        sourceProfile.prunedProofLedgerMarginMin,
        bestSafeMargin,
      );
      sourceProfile.prunedProofLedgerMarginMax = maxNullableNumber(
        sourceProfile.prunedProofLedgerMarginMax,
        bestSafeMargin,
      );
      sourceProfile.prunedProofLedgerPrefixUpperMin = minNullableNumber(
        sourceProfile.prunedProofLedgerPrefixUpperMin,
        prefixUpperBound,
      );
      sourceProfile.prunedProofLedgerPrefixUpperMax = maxNullableNumber(
        sourceProfile.prunedProofLedgerPrefixUpperMax,
        prefixUpperBound,
      );
      sourceProfile.prunedProofLedgerOtherUpperMin = minNullableNumber(
        sourceProfile.prunedProofLedgerOtherUpperMin,
        bestSafeOtherUpper,
      );
      sourceProfile.prunedProofLedgerOtherUpperMax = maxNullableNumber(
        sourceProfile.prunedProofLedgerOtherUpperMax,
        bestSafeOtherUpper,
      );
      sourceProfile.prunedProofLedgerTotalUpperMin = minNullableNumber(
        sourceProfile.prunedProofLedgerTotalUpperMin,
        bestSafeTotalUpper,
      );
      sourceProfile.prunedProofLedgerTotalUpperMax = maxNullableNumber(
        sourceProfile.prunedProofLedgerTotalUpperMax,
        bestSafeTotalUpper,
      );
      if (sourceProfile.prunedProofLedgerSamples.length < MEDLEY_EXACT_PREFIX_PROOF_LEDGER_SAMPLE_LIMIT) {
        sourceProfile.prunedProofLedgerSamples.push(proofLedgerSample);
      } else {
        sourceProfile.prunedProofLedgerDroppedSampleCount += 1;
      }
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
  const recordPrefixLevel3LookaheadReplayViolation = (
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
    sourceProfile.level3LookaheadReplayViolationCount += 1;
  };
  const recordPrefixCapacityLevel3LookaheadReplay = (
    node: MedleyExactSlotCandidateSearchNode,
    globalPruning?: MedleyExactSlotCandidateGlobalPruning,
  ): boolean => {
    const sourceProfile = prefixUpperReplayProfile?.otherUpperSourceReplay;
    if (
      (!enablePrefixCapacityLevel3LookaheadReplay && !enableCapacityLevel3LookaheadPruning)
      || !sourceProfile
      || !globalPruning
      || node.selectedCardCount !== MEDLEY_TEAM_SIZE - 2
      || !Number.isFinite(globalPruning.scoreCutoff)
    ) {
      return false;
    }
    sourceProfile.level3LookaheadCheckedCount += 1;
    if (sourceProfile.level3LookaheadChildPrefixCount >= sourceProfile.maxChecks) {
      sourceProfile.level3LookaheadBudgetSkippedCount += 1;
      return false;
    }

    const selectedCards = getSelectedCardsForNode(node);
    const selectedCardIndices = getSelectedCardIndicesForNode(node);
    const pairUnseenUpperBound = globalPruning.pairUnseenUpperBound;
    const roughOtherUpper = pairUnseenUpperBound !== undefined && Number.isFinite(pairUnseenUpperBound)
      ? pairUnseenUpperBound
      : Number.POSITIVE_INFINITY;
    const roughMargin = Number.isFinite(roughOtherUpper)
      ? node.slotUpperBound + roughOtherUpper - globalPruning.scoreCutoff
      : 0;
    if (Number.isFinite(roughMargin) && roughMargin > sourceProfile.maxMargin) {
      return false;
    }

    sourceProfile.level3LookaheadEligibleCount += 1;
    let childPrefixCount = 0;
    let finiteChildPrefixCount = 0;
    let maxTotalUpper = Number.NEGATIVE_INFINITY;
    let maxChildCardIds: number[] = [];
    let maxChildSlotUpper = Number.NEGATIVE_INFINITY;
    let maxChildOtherUpper = Number.NEGATIVE_INFINITY;
    let maxChildBasicCapacityUpper: number | null = null;
    let maxChildOtherUpperSource: MedleyExactPrefixLevel3LookaheadReplaySample["maxChildOtherUpperSource"] = (
      "basic-capacity"
    );
    const childReplayDecisions: Array<{
      key: string;
      decision: MedleyExactPrefixOtherUpperSourceReplayDecision;
    }> = [];
    let exhaustedChildBudget = false;
    let hasUnknownChildUpper = false;
    const remainingAfterChild = MEDLEY_TEAM_SIZE - (node.selectedCardCount + 1);
    const remainingChildBudget = Math.max(0, sourceProfile.maxChecks - sourceProfile.level3LookaheadChildPrefixCount);
    for (let index = node.startIndex; index <= slot.searchCards.length - remainingAfterChild; index += 1) {
      if (childPrefixCount >= remainingChildBudget) {
        exhaustedChildBudget = true;
        break;
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
      const childUsedCharacterMaskLow = isLowCharacterMask
        ? node.usedCharacterMaskLow | characterBit
        : node.usedCharacterMaskLow;
      const childUsedCharacterMaskHigh = isLowCharacterMask
        ? node.usedCharacterMaskHigh
        : node.usedCharacterMaskHigh | characterBit;
      const childSelectedCards = [...selectedCards, card];
      const childSelectedCardIndices = [...selectedCardIndices, index];
      const childSelectedPower = node.selectedPower + card.effectivePower;
      const childNextStartIndex = index + 1;
      childPrefixCount += 1;
      const childSlotUpper = estimateMedleyExactSlotNodeUpperBound(
        slot,
        childSelectedCards,
        childNextStartIndex,
        bannedCardIds,
        childUsedCharacterMaskLow,
        childUsedCharacterMaskHigh,
        childSelectedPower,
        profiling,
        Number.NEGATIVE_INFINITY,
      );
      if (!Number.isFinite(childSlotUpper)) {
        if (childSlotUpper !== Number.NEGATIVE_INFINITY) {
          hasUnknownChildUpper = true;
        }
        continue;
      }
      const childSelectedCardIds = childSelectedCards
        .map((selectedCard) => selectedCard.cardId)
        .sort((left, right) => left - right);
      const bannedSelectedCardIds = new Set<number>(childSelectedCardIds);
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
      const bestSafeOtherUpper = Math.min(
        roughOtherUpper,
        basicCapacityUpperOrNull ?? Number.POSITIVE_INFINITY,
      );
      if (!Number.isFinite(bestSafeOtherUpper)) {
        hasUnknownChildUpper = true;
        continue;
      }
      finiteChildPrefixCount += 1;
      const childTotalUpper = childSlotUpper + bestSafeOtherUpper;
      childReplayDecisions.push({
        key: buildSelectedCardIndexPrefixKey(childSelectedCardIndices),
        decision: {
          wouldSkip: true,
          level: MEDLEY_TEAM_SIZE - 1,
          prefixUpper: childSlotUpper,
          bestSafeOtherUpper,
          proofCutoffScore: globalPruning.scoreCutoff,
        },
      });
      if (childTotalUpper > maxTotalUpper) {
        maxTotalUpper = childTotalUpper;
        maxChildCardIds = childSelectedCardIds;
        maxChildSlotUpper = childSlotUpper;
        maxChildOtherUpper = bestSafeOtherUpper;
        maxChildBasicCapacityUpper = basicCapacityUpperOrNull;
        if (
          basicCapacityUpperOrNull !== null
          && Number.isFinite(roughOtherUpper)
          && Math.abs(basicCapacityUpperOrNull - roughOtherUpper) < 1e-6
        ) {
          maxChildOtherUpperSource = "tie";
        } else if (basicCapacityUpperOrNull !== null && basicCapacityUpperOrNull < roughOtherUpper) {
          maxChildOtherUpperSource = "basic-capacity";
        } else {
          maxChildOtherUpperSource = "pair-unseen";
        }
      }
    }

    sourceProfile.level3LookaheadChildPrefixCount = addCappedCount(
      sourceProfile.level3LookaheadChildPrefixCount,
      childPrefixCount,
    );
    sourceProfile.level3LookaheadFiniteChildPrefixCount = addCappedCount(
      sourceProfile.level3LookaheadFiniteChildPrefixCount,
      finiteChildPrefixCount,
    );
    if (exhaustedChildBudget) {
      sourceProfile.level3LookaheadBudgetSkippedCount += 1;
      sourceProfile.level3LookaheadUnknownCount += 1;
      return false;
    }
    if (!Number.isFinite(maxTotalUpper)) {
      sourceProfile.level3LookaheadUnknownCount += 1;
      return false;
    }
    if (hasUnknownChildUpper) {
      sourceProfile.level3LookaheadUnknownCount += 1;
      return false;
    }
    const margin = maxTotalUpper - globalPruning.scoreCutoff;
    sourceProfile.level3LookaheadMarginMin = minNullableNumber(sourceProfile.level3LookaheadMarginMin, margin);
    sourceProfile.level3LookaheadMarginMax = maxNullableNumber(sourceProfile.level3LookaheadMarginMax, margin);
    if (margin < 0) {
      const impliedCompletionCount = getRelaxedImpliedCompletionCount(node.selectedCardCount, node.startIndex);
      sourceProfile.level3LookaheadWouldSkipCount += 1;
      sourceProfile.level3LookaheadWouldSkipImpliedCompletionCount = addCappedCount(
        sourceProfile.level3LookaheadWouldSkipImpliedCompletionCount,
        impliedCompletionCount,
      );
      if (level3LookaheadReplayDecisionByChildPrefixKey) {
        for (const childReplayDecision of childReplayDecisions) {
          level3LookaheadReplayDecisionByChildPrefixKey.set(
            childReplayDecision.key,
            childReplayDecision.decision,
          );
        }
        sourceProfile.level3LookaheadChildDecisionCount = addCappedCount(
          sourceProfile.level3LookaheadChildDecisionCount,
          childReplayDecisions.length,
        );
      }
      if (
        sourceProfile.level3LookaheadSamples.length < MEDLEY_EXACT_PREFIX_OTHER_UPPER_SOURCE_REPLAY_SAMPLE_LIMIT
      ) {
        sourceProfile.level3LookaheadSamples.push({
          songIndex: slot.songIndex,
          level: node.selectedCardCount,
          selectedCardIds: selectedCards
            .map((selectedCard) => selectedCard.cardId)
            .sort((left, right) => left - right),
          impliedCompletionCount,
          incumbent: globalPruning.scoreCutoff,
          prefixUpper: node.slotUpperBound,
          pairUnseenUpper: pairUnseenUpperBound !== undefined && Number.isFinite(pairUnseenUpperBound)
            ? pairUnseenUpperBound
            : null,
          roughOtherUpper: Number.isFinite(roughOtherUpper) ? roughOtherUpper : null,
          childPrefixCount,
          finiteChildPrefixCount,
          maxChildCardIds,
          maxChildSlotUpper,
          maxChildOtherUpper,
          maxChildBasicCapacityUpper,
          maxChildOtherUpperSource,
          maxChildTotalUpper: maxTotalUpper,
          margin,
        });
      }
      if (enableCapacityLevel3LookaheadPruning) {
        sourceProfile.level3LookaheadPrunedCount += 1;
        sourceProfile.level3LookaheadPrunedImpliedCompletionCount = addCappedCount(
          sourceProfile.level3LookaheadPrunedImpliedCompletionCount,
          impliedCompletionCount,
        );
        return true;
      }
    }
    return false;
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
    recordPreMaterializationExpandedNode();
    if (slot.searchCards.length - node.startIndex < remaining) {
      recordPreMaterializationInsufficientRemainingNodeReject();
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
      const nextSelectedCardCount = node.selectedCardCount + 1;
      recordPreMaterializationBranchVisit(nextSelectedCardCount);
      if (
        characterIndex === undefined
        || hasCharacterIndexInMask(node.usedCharacterMaskLow, node.usedCharacterMaskHigh, characterIndex)
      ) {
        recordPreMaterializationDuplicateCharacterReject(nextSelectedCardCount);
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
      recordPreMaterializationBranchKind(nextSelectedCards.length);

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
        recordPreMaterializationSlotUpperResult(
          nextSelectedCards.length,
          nextStartIndex,
          leafUpperBound,
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
          recordPreMaterializationGlobalUpperReject(nextSelectedCards.length);
          continue;
        }
        const candidateKey = globalPruning?.excludedCandidateKeys
          ? buildMedleyExactSelectedCardKey(nextSelectedCards)
          : null;
        if (candidateKey && globalPruning?.excludedCandidateKeys?.has(candidateKey)) {
          recordPreMaterializationCandidateKeyReject(nextSelectedCards.length);
          continue;
        }
        recordPreMaterializationCandidateEvaluation(nextSelectedCards.length);
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
        recordPreMaterializationCandidateResult(nextSelectedCards.length, candidate, scoreCutoff);
        if (candidate && candidate.result.score >= scoreCutoff) {
          recordPreMaterializationMaterializedCandidate(nextSelectedCards.length);
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
      recordPreMaterializationSlotUpperResult(
        nextSelectedCards.length,
        nextStartIndex,
        upperBound,
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
        && !passesPairGlobalPruning
      ) {
        recordPreMaterializationGlobalUpperReject(nextSelectedCards.length);
      }
      if (
        Number.isFinite(upperBound)
        && upperBound >= scoreCutoff
        && passesPairGlobalPruning
      ) {
        recordPreMaterializationPushedPrefixNode(nextSelectedCards.length);
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
    recordPreMaterializationExpandedNode();
    if (slot.searchCards.length - node.startIndex < remaining) {
      recordPreMaterializationInsufficientRemainingNodeReject();
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
      const nextSelectedCardCount = node.selectedCardCount + 1;
      recordPreMaterializationBranchVisit(nextSelectedCardCount);
      if (
        characterIndex === undefined
        || hasCharacterIndexInMask(node.usedCharacterMaskLow, node.usedCharacterMaskHigh, characterIndex)
      ) {
        recordPreMaterializationDuplicateCharacterReject(nextSelectedCardCount);
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
      recordPreMaterializationBranchKind(nextSelectedCards.length);

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
        recordPreMaterializationSlotUpperResult(
          nextSelectedCards.length,
          nextStartIndex,
          leafUpperBound,
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
          recordPreMaterializationGlobalUpperReject(nextSelectedCards.length);
          continue;
        }
        if (enableCapacitySourceLeafPruning && prefixOtherUpperSourceDecision?.wouldSkip === true) {
          recordPreMaterializationGlobalUpperReject(nextSelectedCards.length);
          continue;
        }
        const candidateKey = globalPruning?.excludedCandidateKeys
          ? buildMedleyExactSelectedCardKey(nextSelectedCards)
          : null;
        if (candidateKey && globalPruning?.excludedCandidateKeys?.has(candidateKey)) {
          recordPreMaterializationCandidateKeyReject(nextSelectedCards.length);
          continue;
        }
        if (prefixUpperReplayProfile) {
          recordPrefixCandidateEvaluation();
        }
        recordPreMaterializationCandidateEvaluation(nextSelectedCards.length);
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
        recordPreMaterializationCandidateResult(nextSelectedCards.length, candidate, scoreCutoff);
        const prefixCapacityBatchReplayDecision = getPrefixCapacityBatchReplayDecisionForNode(node);
        if (prefixCapacityBatchReplayDecision && candidate) {
          recordPrefixOtherUpperSourceReplayViolation(prefixCapacityBatchReplayDecision, candidate);
        }
        const prefixLevel3LookaheadReplayDecision = getPrefixLevel3LookaheadReplayDecisionForNode(node);
        if (prefixLevel3LookaheadReplayDecision && candidate) {
          recordPrefixLevel3LookaheadReplayViolation(prefixLevel3LookaheadReplayDecision, candidate);
        }
        if (candidate && candidate.result.score >= scoreCutoff) {
          if (prefixUpperReplayProfile) {
            recordPrefixMaterializedCandidate();
          }
          recordPreMaterializationMaterializedCandidate(nextSelectedCards.length);
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
      recordPreMaterializationSlotUpperResult(
        nextSelectedCards.length,
        nextStartIndex,
        upperBound,
        scoreCutoff,
      );
      if (
        (enablePrefixCapacityLevel3LookaheadReplay || enableCapacityLevel3LookaheadPruning)
        && prefixUpperReplayProfile
        && nextSelectedCards.length === MEDLEY_TEAM_SIZE - 2
      ) {
        const shouldPruneLevel3LookaheadBranch = recordPrefixCapacityLevel3LookaheadReplay(
          createSearchNode({
            key: upperBound,
            slotUpperBound: upperBound,
            selectedCardIndices: nextSelectedCardIndices,
            startIndex: nextStartIndex,
            usedCharacterMaskLow: nextUsedCharacterMaskLow,
            usedCharacterMaskHigh: nextUsedCharacterMaskHigh,
            selectedPower: nextSelectedPower,
            candidate: null,
          }),
          globalPruning,
        );
        if (shouldPruneLevel3LookaheadBranch) {
          recordPreMaterializationGlobalUpperReject(nextSelectedCards.length);
          continue;
        }
      }
      let passesPairGlobalPruning = true;
      let prefixCapacityBatchReplayDecision = getPrefixCapacityBatchReplayDecisionForNode(node);
      let prefixLevel3LookaheadReplayDecision: MedleyExactPrefixOtherUpperSourceReplayDecision | null = null;
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
          (enablePrefixCapacityBatchReplay || enableCapacityBatchPruning)
          && prefixUpperReplayProfile
          && globalPruning
          && nextSelectedCards.length === MEDLEY_TEAM_SIZE - 1
          && pairGlobalUpperBound !== null
          && Number.isFinite(pairGlobalUpperBound)
        ) {
          const nextDecision = recordPrefixOtherUpperSourceReplay(
            nextSelectedCards,
            nextStartIndex,
            upperBound,
            upperBound + pairGlobalUpperBound,
            globalPruning,
            enableCapacityBatchPruning,
          );
          if (nextDecision?.wouldSkip === true) {
            prefixCapacityBatchReplayDecision = nextDecision;
            if (enableCapacityBatchPruning) {
              recordPreMaterializationGlobalUpperReject(nextSelectedCards.length);
              continue;
            }
          }
        }
        passesPairGlobalPruning = pairGlobalUpperBound === null
          || upperBound + pairGlobalUpperBound >= (globalPruning?.scoreCutoff ?? Number.NEGATIVE_INFINITY);
      }
      if (
        Number.isFinite(upperBound)
        && upperBound >= scoreCutoff
        && !passesPairGlobalPruning
      ) {
        recordPreMaterializationGlobalUpperReject(nextSelectedCards.length);
      }
      if (
        Number.isFinite(upperBound)
        && upperBound >= scoreCutoff
        && passesPairGlobalPruning
      ) {
        if (nextSelectedCards.length === MEDLEY_TEAM_SIZE - 1 && level3LookaheadReplayDecisionByChildPrefixKey) {
          prefixLevel3LookaheadReplayDecision = (
            level3LookaheadReplayDecisionByChildPrefixKey.get(
              buildSelectedCardIndexPrefixKey(nextSelectedCardIndices),
            ) ?? null
          );
        }
        recordPreMaterializationPushedPrefixNode(nextSelectedCards.length);
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
          prefixLevel3LookaheadReplayDecision,
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
    rawPairUpperQueryCache.clear();
  };
  const peekFrontierNodeProfile = (): Record<string, unknown> | null => {
    const node = heapKeyMode === "slot"
      ? heap[0] ?? null
      : peekMaxHeapSlotUpperNode();
    if (!node) {
      return null;
    }
    const selectedCardIndices = getSelectedCardIndicesForNode(node);
    const selectedCards = getSelectedCardsForNode(node);
    return {
      key: Number.isFinite(node.key) ? node.key : null,
      slotUpperBound: Number.isFinite(node.slotUpperBound) ? node.slotUpperBound : null,
      selectedCardCount: node.selectedCardCount,
      selectedCardIds: selectedCards.map((card) => card.cardId),
      selectedCardIndices,
      startIndex: node.startIndex,
      selectedPower: node.selectedPower,
      isCandidateNode: node.candidate !== null,
      impliedCompletionCount: getRelaxedImpliedCompletionCount(node.selectedCardCount, node.startIndex),
      heapKeyMode,
    };
  };

  return {
    next,
    peekUpperBound: () => (
      heapKeyMode === "slot"
        ? heap[0]?.key ?? Number.NEGATIVE_INFINITY
        : peekMaxHeapSlotUpperBound()
    ),
    peekFrontierNodeProfile,
    peekUpperBoundExcludingCardIds,
    canReuseForScoreCutoff: (scoreCutoff: number) => (
      !Number.isFinite(scoreCutoff) || scoreCutoff >= maxPruningScoreCutoff
    ),
    hasAborted: () => aborted,
    poppedNodeCount: () => poppedNodes,
    release,
    prefixUpperReplayProfile: () => prefixUpperReplayProfile,
    preMaterializationCensusProfile: () => preMaterializationCensusProfile,
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
      let rawRightCandidateBitsetBytes = 0;
      for (const query of rawPairUpperQueryCache.values()) {
        rawRightCandidateBitsetBytes += (
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
        rawPairUpperQueryCacheSize: rawPairUpperQueryCache.size,
        rawPairComplementUpperQueryCount,
        rawPairComplementUpperFallbackCount,
        rawPairComplementUpperBuildCount,
        rawPairComplementUpperScannedLeftCandidateCount,
        rawPairComplementUpperScannedRightWordCount,
        highPairRecordCount,
        highPairRecordBitsetMiB: roundMiB(highPairRecordBitsetBytes),
        rightCandidateBitsetMiB: roundMiB(rightCandidateBitsetBytes),
        rawRightCandidateBitsetMiB: roundMiB(rawRightCandidateBitsetBytes),
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
      sourceSummary.prunedProofLedgerDroppedSampleCount = Math.max(
        0,
        sourceSummary.prunedProofLedgerCount - sourceSummary.prunedProofLedgerSamples.length,
      );
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

function summarizeMedleyExactPreMaterializationCensusProfiles(
  profiles: MedleyExactPreMaterializationCensusProfile[],
): MedleyExactPreMaterializationCensusSummary | null {
  if (profiles.length === 0) {
    return null;
  }
  const levels = Array.from(
    { length: MEDLEY_TEAM_SIZE + 1 },
    (_, level) => createMedleyExactPreMaterializationCensusLevel(level),
  );
  for (const profile of profiles) {
    for (const level of profile.levels) {
      const targetLevel = levels[level.level];
      if (targetLevel) {
        addMedleyExactPreMaterializationCensusLevel(targetLevel, level);
      }
    }
  }
  const sumLevelField = (
    field: keyof Omit<MedleyExactPreMaterializationCensusLevelProfile, "level">,
  ): number => levels.reduce((sum, level) => addCappedCount(sum, level[field]), 0);
  return {
    algorithm: "hhwx-pre-materialization-census-v1",
    configurationSummaryCount: 1,
    generatorCount: profiles.length,
    expandedNodeCountTotal: profiles.reduce((sum, profile) => (
      addCappedCount(sum, profile.expandedNodeCount)
    ), 0),
    insufficientRemainingNodeRejectCountTotal: profiles.reduce((sum, profile) => (
      addCappedCount(sum, profile.insufficientRemainingNodeRejectCount)
    ), 0),
    sameCharacterDominanceReplayRejectCountTotal: profiles.reduce((sum, profile) => (
      addCappedCount(sum, profile.sameCharacterDominanceReplayRejectCount)
    ), 0),
    contributionDominanceReplayRejectCountTotal: profiles.reduce((sum, profile) => (
      addCappedCount(sum, profile.contributionDominanceReplayRejectCount)
    ), 0),
    branchVisitCountTotal: sumLevelField("branchVisitCount"),
    duplicateCharacterRejectCountTotal: sumLevelField("duplicateCharacterRejectCount"),
    slotUpperCheckedCountTotal: sumLevelField("slotUpperCheckedCount"),
    slotUpperRejectedCountTotal: sumLevelField("slotUpperRejectedCount"),
    slotUpperRejectedImpliedCompletionCountTotal: sumLevelField("slotUpperRejectedImpliedCompletionCount"),
    globalUpperRejectedCountTotal: sumLevelField("globalUpperRejectedCount"),
    candidateKeyRejectedCountTotal: sumLevelField("candidateKeyRejectedCount"),
    candidateEvaluationCountTotal: sumLevelField("candidateEvaluationCount"),
    candidateNullCountTotal: sumLevelField("candidateNullCount"),
    candidateScoreRejectedCountTotal: sumLevelField("candidateScoreRejectedCount"),
    materializedCandidateCountTotal: sumLevelField("materializedCandidateCount"),
    pushedPrefixNodeCountTotal: sumLevelField("pushedPrefixNodeCount"),
    pushedCandidateNodeCountTotal: sumLevelField("pushedCandidateNodeCount"),
    levels,
    latestGenerators: profiles.map((profile) => ({
      ...profile,
      levels: profile.levels.map((level) => ({ ...level })),
    })),
  };
}

function asMedleyExactPreMaterializationCensusSummary(
  value: Record<string, unknown> | null | undefined,
): MedleyExactPreMaterializationCensusSummary | null {
  if (
    !value
    || value.algorithm !== "hhwx-pre-materialization-census-v1"
    || !Array.isArray(value.levels)
  ) {
    return null;
  }
  return value as MedleyExactPreMaterializationCensusSummary;
}

function mergeMedleyExactPreMaterializationCensusSummaries(
  previous: Record<string, unknown> | null | undefined,
  next: MedleyExactPreMaterializationCensusSummary | null,
): MedleyExactPreMaterializationCensusSummary | null {
  if (!next) {
    return asMedleyExactPreMaterializationCensusSummary(previous);
  }
  const existing = asMedleyExactPreMaterializationCensusSummary(previous);
  if (!existing) {
    return next;
  }
  const levels = Array.from(
    { length: MEDLEY_TEAM_SIZE + 1 },
    (_, level) => createMedleyExactPreMaterializationCensusLevel(level),
  );
  for (const source of [existing, next]) {
    for (const level of source.levels) {
      const targetLevel = levels[level.level];
      if (targetLevel) {
        addMedleyExactPreMaterializationCensusLevel(targetLevel, level);
      }
    }
  }
  const sumLevelField = (
    field: keyof Omit<MedleyExactPreMaterializationCensusLevelProfile, "level">,
  ): number => levels.reduce((sum, level) => addCappedCount(sum, level[field]), 0);
  return {
    algorithm: "hhwx-pre-materialization-census-v1",
    configurationSummaryCount: existing.configurationSummaryCount + next.configurationSummaryCount,
    generatorCount: existing.generatorCount + next.generatorCount,
    expandedNodeCountTotal: addCappedCount(existing.expandedNodeCountTotal, next.expandedNodeCountTotal),
    insufficientRemainingNodeRejectCountTotal: addCappedCount(
      existing.insufficientRemainingNodeRejectCountTotal,
      next.insufficientRemainingNodeRejectCountTotal,
    ),
    sameCharacterDominanceReplayRejectCountTotal: addCappedCount(
      existing.sameCharacterDominanceReplayRejectCountTotal,
      next.sameCharacterDominanceReplayRejectCountTotal,
    ),
    contributionDominanceReplayRejectCountTotal: addCappedCount(
      existing.contributionDominanceReplayRejectCountTotal,
      next.contributionDominanceReplayRejectCountTotal,
    ),
    branchVisitCountTotal: sumLevelField("branchVisitCount"),
    duplicateCharacterRejectCountTotal: sumLevelField("duplicateCharacterRejectCount"),
    slotUpperCheckedCountTotal: sumLevelField("slotUpperCheckedCount"),
    slotUpperRejectedCountTotal: sumLevelField("slotUpperRejectedCount"),
    slotUpperRejectedImpliedCompletionCountTotal: sumLevelField("slotUpperRejectedImpliedCompletionCount"),
    globalUpperRejectedCountTotal: sumLevelField("globalUpperRejectedCount"),
    candidateKeyRejectedCountTotal: sumLevelField("candidateKeyRejectedCount"),
    candidateEvaluationCountTotal: sumLevelField("candidateEvaluationCount"),
    candidateNullCountTotal: sumLevelField("candidateNullCount"),
    candidateScoreRejectedCountTotal: sumLevelField("candidateScoreRejectedCount"),
    materializedCandidateCountTotal: sumLevelField("materializedCandidateCount"),
    pushedPrefixNodeCountTotal: sumLevelField("pushedPrefixNodeCount"),
    pushedCandidateNodeCountTotal: sumLevelField("pushedCandidateNodeCount"),
    levels,
    latestGenerators: next.latestGenerators,
  };
}

function summarizeMedleyExactPreMaterializationCensusGenerators(
  generators: MedleyExactSlotCandidateGenerator[],
): MedleyExactPreMaterializationCensusSummary | null {
  const profiles = generators
    .map((generator) => generator.preMaterializationCensusProfile?.() ?? null)
    .filter((profile): profile is MedleyExactPreMaterializationCensusProfile => profile !== null);
  return summarizeMedleyExactPreMaterializationCensusProfiles(profiles);
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

type MedleyExactRawCandidatePairUpperQuery = {
  leftSlot: MedleyExactRawCandidateSlotLike;
  rightSlot: MedleyExactRawCandidateSlotLike;
  rightCandidateBitsetWordCount: number;
  containingRightCandidateBitsByCardId: Map<number, Uint32Array>;
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

function buildMedleyExactRawContainingCandidateBitsByCardId(
  slot: MedleyExactRawCandidateSlotLike,
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

function buildMedleyExactRawCandidatePairUpperQuery(
  leftSlot: MedleyExactRawCandidateSlotLike,
  rightSlot: MedleyExactRawCandidateSlotLike,
): MedleyExactRawCandidatePairUpperQuery {
  const rightCandidateBitsetWordCount = Math.ceil(rightSlot.length / 32);
  return {
    leftSlot,
    rightSlot,
    rightCandidateBitsetWordCount,
    containingRightCandidateBitsByCardId: buildMedleyExactRawContainingCandidateBitsByCardId(
      rightSlot,
      rightCandidateBitsetWordCount,
    ),
  };
}

function estimateGeneratedMedleyExactRawCandidatePairUpperExcludingCardIds(
  query: MedleyExactRawCandidatePairUpperQuery,
  bannedCardIds: Iterable<number>,
  minimumRelevantScore = Number.NEGATIVE_INFINITY,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): {
  upperBound: number;
  scannedLeftCandidateCount: number;
  scannedRightWordCount: number;
} {
  if (profiling) {
    profiling.exactCandidateJoinPairComplementQueryCount += 1;
  }
  const result = estimateGeneratedMedleyExactRawCandidatePairUpperExcludingCardIdsByScan(
    query.leftSlot,
    query.rightSlot,
    query.containingRightCandidateBitsByCardId,
    bannedCardIds,
    minimumRelevantScore,
  );
  if (profiling) {
    profiling.exactCandidateJoinPairComplementScanCount += (
      result.scannedLeftCandidateCount + result.scannedRightWordCount
    );
  }
  return result;
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
  retainCandidateForSlot?: (slotIndex: number, candidate: MedleyTeamCandidate) => void,
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
    if (retainCandidateForSlot) {
      retainCandidateForSlot(slotIndexToGenerate, candidate);
    } else {
      candidatesBySlot[slotIndexToGenerate].push(candidate);
    }
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
  retainCandidateForSlot?: (slotIndex: number, candidate: MedleyTeamCandidate) => void,
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
    if (retainCandidateForSlot) {
      retainCandidateForSlot(slotIndexToGenerate, candidate);
    } else {
      candidatesBySlot[slotIndexToGenerate].push(candidate);
    }
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
  retainCandidateForSlot?: (slotIndex: number, candidate: MedleyTeamCandidate) => void,
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
      retainCandidateForSlot,
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
  retainCandidateForSlot?: (slotIndex: number, candidate: MedleyTeamCandidate) => void,
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
      if (retainCandidateForSlot) {
        retainCandidateForSlot(anchorSlotIndex, anchorCandidate);
      } else {
        candidatesBySlot[anchorSlotIndex].push(anchorCandidate);
      }
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
      null,
      undefined,
      retainCandidateForSlot,
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
    debugExactCandidateRawMirrorMaxCardCount?: number | null;
    debugExactCandidateRawMirrorMaxCandidateTotal?: number | null;
    debugExactCandidateRawJoinParity?: boolean;
    debugExactCandidateRawSolverHandoff?: boolean;
    debugExactCandidateRawResidentFill?: boolean;
    enableExactCandidateRawResidentResult?: boolean;
    enableExactCandidateRawResidentWinnerOracle?: boolean;
    enableExactCandidateRawPairComplementUpper?: boolean;
    debugExactCandidateSignatureCensus?: boolean;
    debugExactCandidateUpperReplay?: boolean;
    debugExactCandidateAnchorFrontierCheapUpperProbe?: boolean;
    debugExactCandidatePrefixUpperReplay?: boolean;
    debugExactCandidatePrefixHardUpperReplay?: boolean;
    debugExactCandidatePrefixOtherUpperSourceReplay?: boolean;
    debugExactCandidatePrefixOtherUpperSourceReplayMaxChecks?: number;
    debugExactCandidatePrefixOtherUpperSourceReplayMaxMargin?: number;
    debugExactCandidatePrefixCapacityBatchReplay?: boolean;
    enableExactCandidateCapacityBatchPruning?: boolean;
    debugExactCandidatePrefixCapacityLevel3Replay?: boolean;
    debugExactCandidatePrefixCapacityLevel3LookaheadReplay?: boolean;
    enableExactCandidateCapacitySourceLeafPruning?: boolean;
    enableExactCandidateCapacityLevel3LookaheadPruning?: boolean;
    debugExactCandidateAdmissionPairProbe?: boolean;
    debugExactCandidateDominanceReplay?: boolean;
    debugExactCandidateRawAnchorCheapUpperReplay?: boolean;
    debugExactCandidateRawAnchorFrontierProbe?: boolean;
    debugExactCandidateRawAnchorFrontierConstrainedPeekProbe?: boolean;
    debugExactCandidateRawPairPricingFrontierProbe?: boolean;
    debugExactCandidateRawAnchorFrontierProbeMaxCandidateTotal?: number | null;
    debugExactCandidateRawCandidatePoolProfile?: boolean;
    debugExactCandidateRawPairComplementParity?: boolean;
    debugExactCandidateRawPairUpperScanParity?: boolean;
    debugExactCandidateRawSolverInputCensus?: boolean;
    debugExactCandidatePreMaterializationCensus?: boolean;
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
    profiling.exactCandidateJoinRawMirrorProfile = null;
    profiling.exactCandidateJoinRawAnchorCheapUpperReplay = null;
    profiling.exactCandidateJoinRawAnchorFrontierProbe = null;
    profiling.exactCandidateJoinRawCandidatePoolProfile = null;
    profiling.exactCandidateJoinRawPairComplementParity = null;
    profiling.exactCandidateJoinRawPairComplementUpper = null;
    profiling.exactCandidateJoinRawPairUpperScanParity = null;
    profiling.exactCandidateJoinRawSolverInputCensus = null;
    profiling.exactCandidateJoinRawSolverHandoff = null;
    profiling.exactCandidateJoinCandidateAdmissionFrontier = null;
    profiling.exactCandidateJoinLastGuardedExtensionSlotIndex = null;
    profiling.exactCandidateJoinLastGuardedExtensionLimit = null;
    profiling.exactCandidateJoinLastGuardedExtensionRemainingMs = null;
    profiling.exactCandidateJoinLastGuardedExtensionPeakHeapMiB = null;
    profiling.exactCandidateJoinLastGuardedExtensionObservedUpperBound = null;
    profiling.exactCandidateJoinLastAnchorFrontierProofSkipReason = null;
    profiling.exactCandidateJoinLastAnchorFrontierProofHighPairRecordUpperCount = null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckSlotIndex = null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckCalculatedCardCount = null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckMaxCardCount = null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckAnchorCandidateCount = null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckMaxAnchorCandidateCount = null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckOtherSlotCandidateCounts = [];
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckOtherSlotCandidateTotal = null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckMaxOtherSlotCandidateCount = null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckMaxOtherSlotCandidateTotal = null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckFrontierGap = null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckMaxFrontierGap = null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckPeekUpperBound = null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckOtherUpper = null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckIncumbentScore = null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckRemainingMs = null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckMinRemainingMs = null;
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
  const rawCandidateMirrorCardCount = Math.max(
    maxSlotSearchCardCount,
    context.calculatedCardCount ?? 0,
  );
  const rawCandidateMirrorMaxCardCount = (
    context.debugExactCandidateRawMirrorMaxCardCount !== null
    && context.debugExactCandidateRawMirrorMaxCardCount !== undefined
    && Number.isFinite(context.debugExactCandidateRawMirrorMaxCardCount)
    && context.debugExactCandidateRawMirrorMaxCardCount > 0
      ? Math.trunc(context.debugExactCandidateRawMirrorMaxCardCount)
      : null
  );
  const rawCandidateMirrorMaxCandidateTotal = (
    context.debugExactCandidateRawMirrorMaxCandidateTotal !== null
    && context.debugExactCandidateRawMirrorMaxCandidateTotal !== undefined
    && Number.isFinite(context.debugExactCandidateRawMirrorMaxCandidateTotal)
    && context.debugExactCandidateRawMirrorMaxCandidateTotal > 0
      ? Math.trunc(context.debugExactCandidateRawMirrorMaxCandidateTotal)
      : MEDLEY_EXACT_RAW_CANDIDATE_MIRROR_MAX_CANDIDATE_TOTAL
  );
  const shouldUseRawCandidateMirror = (
    context.debugExactCandidateRawMirror === true
    || context.enableExactCandidateRawPairComplementUpper === true
  );
  const shouldSkipRawCandidateMirrorByCardCount = (
    shouldUseRawCandidateMirror
    && (
      rawCandidateMirrorMaxCardCount === null
      || rawCandidateMirrorCardCount > rawCandidateMirrorMaxCardCount
    )
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
    context.enableExactCandidateCapacityBatchPruning === true,
    context.debugExactCandidatePrefixCapacityLevel3Replay === true,
    context.debugExactCandidatePrefixCapacityLevel3LookaheadReplay === true,
    context.enableExactCandidateCapacitySourceLeafPruning === true,
    context.enableExactCandidateCapacityLevel3LookaheadPruning === true,
    context.debugExactCandidatePreMaterializationCensus === true,
    context.debugExactCandidatePrefixOtherUpperSourceReplayMaxChecks,
    context.debugExactCandidatePrefixOtherUpperSourceReplayMaxMargin,
  ));
  const candidatesBySlot: MedleyTeamCandidate[][] = Array.from({ length: slots.length }, () => []);
  const rawCandidateMirror = shouldUseRawCandidateMirror
    && !shouldSkipRawCandidateMirrorByCardCount
    ? createMedleyExactRawCandidateMirror(slots.length, rawCandidateMirrorMaxCandidateTotal)
    : null;
  if (shouldSkipRawCandidateMirrorByCardCount) {
    profiling.exactCandidateJoinRawMirrorProfile = {
      enabled: false,
      disabled: true,
      disabledReason: "slot-card-count-limit",
      calculatedCardCount: context.calculatedCardCount ?? null,
      maxSlotSearchCardCount,
      cardCountForLimit: rawCandidateMirrorCardCount,
      maxCardCountLimit: rawCandidateMirrorMaxCardCount,
      defaultMaxCardCountLimit: MEDLEY_EXACT_RAW_CANDIDATE_MIRROR_MAX_SLOT_CARD_COUNT,
      maxCandidateTotal: rawCandidateMirrorMaxCandidateTotal,
      defaultMaxCandidateTotal: MEDLEY_EXACT_RAW_CANDIDATE_MIRROR_MAX_CANDIDATE_TOTAL,
    };
  }
  let rawCandidatePool: MedleyExactRawCandidatePool | null = null;
  const invalidateRawCandidatePool = (): void => {
    rawCandidatePool = null;
  };
  const getRawCandidatePool = (): MedleyExactRawCandidatePool => {
    if (!rawCandidatePool) {
      rawCandidatePool = buildMedleyExactRawCandidatePool(candidatesBySlot);
    }
    return rawCandidatePool;
  };
  const getRawCandidateSlotReadSource = (): MedleyExactRawCandidateSlotReadSource => {
    if (rawCandidateMirror && rawCandidateMirror.disabledReason === null) {
      const lengths = rawCandidateMirror.slots.map((slot) => slot.length);
      const lengthMismatchCount = lengths.filter((length, index) => (
        length !== (candidatesBySlot[index]?.length ?? 0)
      )).length;
      if (lengthMismatchCount === 0) {
        const mismatchCountTotal = rawCandidateMirror.slots.reduce((sum, slot) => (
          sum + slot.mismatchCount
        ), 0);
        return {
          slots: rawCandidateMirror.slots,
          source: "shadow-raw-candidate-builder",
          retainedMiB: roundMiB(rawCandidateMirror.slots.reduce((sum, slot) => (
            sum + getMedleyExactRawCandidateSlotBytes(slot)
          ), 0)),
          rawPoolRetainedMiB: null,
          lengthMismatchCount,
          mismatchCountTotal,
        };
      }
    }

    const rawPool = getRawCandidatePool();
    return {
      slots: rawPool.slots,
      source: "shared-raw-candidate-pool",
      retainedMiB: roundMiB(rawPool.slots.reduce((sum, slot) => (
        sum + getMedleyExactRawCandidateSlotBytes(slot)
      ), 0)),
      rawPoolRetainedMiB: roundMiB(rawPool.slots.reduce((sum, slot) => (
        sum + getMedleyExactRawCandidatePoolSlotBytes(slot)
      ), 0)),
      lengthMismatchCount: 0,
      mismatchCountTotal: rawPool.slots.reduce((sum, slot) => sum + slot.mismatchCount, 0),
    };
  };
  const recordRawSolverHandoffProfile = (): void => {
    recordRawPairComplementUpperProfile();
    if (context.debugExactCandidateRawSolverHandoff !== true) {
      return;
    }
    profiling.exactCandidateJoinRawSolverHandoff = buildMedleyExactRawSolverHandoffProfile(
      slots,
      getRawCandidateSlotReadSource(),
      candidatesBySlot,
      configuration,
      server,
      perfectRate,
      profiling,
      stats,
      deadlineAt,
      isPastDeadline,
      context.debugExactCandidateRawResidentFill === true,
    );
  };
  const retainCandidateForSlot = rawCandidateMirror
    ? (slotIndex: number, candidate: MedleyTeamCandidate): void => {
      const sourceIndex = candidatesBySlot[slotIndex].length;
      candidatesBySlot[slotIndex].push(candidate);
      appendMedleyExactRawCandidateMirror(rawCandidateMirror, slotIndex, candidate, sourceIndex);
    }
    : null;
  let didFinalizeCandidateStorageForRead = false;
  const finalizeCandidateStorageForRead = (): void => {
    if (didFinalizeCandidateStorageForRead) {
      return;
    }
    candidatesBySlot.forEach(sortMedleyCandidates);
    rebuildMedleyExactRawCandidateMirrorFromCandidates(rawCandidateMirror, candidatesBySlot);
    invalidateRawCandidatePool();
    didFinalizeCandidateStorageForRead = true;
  };
  const finalizeRawCandidateMirrorForDiagnostics = (): void => {
    if (rawCandidateMirror) {
      finalizeCandidateStorageForRead();
    }
  };
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
    invalidateRawCandidatePool();
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
  const recordPreMaterializationCensus = (): void => {
    if (context.debugExactCandidatePreMaterializationCensus !== true) {
      return;
    }
    const uniqueGenerators = [...new Set([...generators, ...candidateFillGenerators])];
    const summary = summarizeMedleyExactPreMaterializationCensusGenerators(uniqueGenerators);
    profiling.exactCandidateJoinPreMaterializationCensus = mergeMedleyExactPreMaterializationCensusSummaries(
      profiling.exactCandidateJoinPreMaterializationCensus,
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
  const classifyCandidateFillOtherUpperSource = (
    slotIndex: number | null,
    otherUpper: number | null,
  ): string | null => {
    if (slotIndex === null || otherUpper === null || !Number.isFinite(otherUpper)) {
      return null;
    }
    const closeTo = (value: number | null | undefined): boolean => (
      value !== null
      && value !== undefined
      && Number.isFinite(value)
      && Math.abs(value - otherUpper) < 1e-6
    );
    const sources: string[] = [];
    if (closeTo(candidateRelaxedOtherUpperBySlot[slotIndex])) {
      sources.push("relaxed");
    }
    if (closeTo(candidateRemainingOtherUpperBySlot[slotIndex])) {
      sources.push("remaining");
    }
    if (closeTo(exactPairUpperByExcludedSlot[slotIndex])) {
      sources.push("pair-upper");
    }
    return sources.length > 0 ? sources.join("+") : "min-mixed";
  };
  const getFrontierNodeNumberArray = (
    frontierNodeProfile: Record<string, unknown> | null | undefined,
    key: string,
  ): number[] | null => {
    const value = frontierNodeProfile?.[key];
    return Array.isArray(value) && value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
      ? value
      : null;
  };
  const getCandidateAdmissionPairScore = (
    rowCandidates: MedleyTeamCandidate[],
    columnCandidates: MedleyTeamCandidate[],
    rightIndexByLeft: Int32Array,
    leftIndex: number,
  ): number => {
    const rightIndex = rightIndexByLeft[leftIndex];
    return rowCandidates[leftIndex].result.score + columnCandidates[rightIndex].result.score;
  };
  const pushCandidateAdmissionPairHeap = (
    rowCandidates: MedleyTeamCandidate[],
    columnCandidates: MedleyTeamCandidate[],
    rightIndexByLeft: Int32Array,
    heapLeftIndices: Int32Array,
    heapSize: number,
    leftIndex: number,
  ): number => {
    let nextHeapSize = heapSize;
    heapLeftIndices[nextHeapSize] = leftIndex;
    nextHeapSize += 1;
    let child = nextHeapSize - 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (
        getCandidateAdmissionPairScore(rowCandidates, columnCandidates, rightIndexByLeft, heapLeftIndices[parent])
        >= getCandidateAdmissionPairScore(rowCandidates, columnCandidates, rightIndexByLeft, heapLeftIndices[child])
      ) {
        break;
      }
      const swap = heapLeftIndices[parent];
      heapLeftIndices[parent] = heapLeftIndices[child];
      heapLeftIndices[child] = swap;
      child = parent;
    }
    return nextHeapSize;
  };
  const popCandidateAdmissionPairHeap = (
    rowCandidates: MedleyTeamCandidate[],
    columnCandidates: MedleyTeamCandidate[],
    rightIndexByLeft: Int32Array,
    heapLeftIndices: Int32Array,
    heapSize: number,
  ): { leftIndex: number; heapSize: number } | null => {
    if (heapSize <= 0) {
      return null;
    }
    const leftIndex = heapLeftIndices[0];
    let nextHeapSize = heapSize - 1;
    if (nextHeapSize > 0) {
      heapLeftIndices[0] = heapLeftIndices[nextHeapSize];
      let parent = 0;
      while (true) {
        const leftChild = parent * 2 + 1;
        const rightChild = leftChild + 1;
        if (leftChild >= nextHeapSize) {
          break;
        }
        let bestChild = leftChild;
        if (
          rightChild < nextHeapSize
          && getCandidateAdmissionPairScore(
            rowCandidates,
            columnCandidates,
            rightIndexByLeft,
            heapLeftIndices[rightChild],
          ) > getCandidateAdmissionPairScore(
            rowCandidates,
            columnCandidates,
            rightIndexByLeft,
            heapLeftIndices[leftChild],
          )
        ) {
          bestChild = rightChild;
        }
        if (
          getCandidateAdmissionPairScore(rowCandidates, columnCandidates, rightIndexByLeft, heapLeftIndices[parent])
          >= getCandidateAdmissionPairScore(rowCandidates, columnCandidates, rightIndexByLeft, heapLeftIndices[bestChild])
        ) {
          break;
        }
        const swap = heapLeftIndices[parent];
        heapLeftIndices[parent] = heapLeftIndices[bestChild];
        heapLeftIndices[bestChild] = swap;
        parent = bestChild;
      }
    }
    return { leftIndex, heapSize: nextHeapSize };
  };
  const buildCandidateAdmissionFrontierPairBoundaryProfile = (
    slotIndex: number | null,
    proofCutoffScore: number | null,
    frontierNodeProfile: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> | null => {
    if (context.debugExactCandidateAdmissionPairProbe !== true) {
      return null;
    }
    const startedAt = performance.now();
    const skip = (reason: string): Record<string, unknown> => ({
      enabled: true,
      completed: false,
      skipReason: reason,
      elapsedMs: Math.round(performance.now() - startedAt),
    });
    if (slotIndex === null || slotIndex < 0 || slotIndex >= slots.length) {
      return skip("invalid-slot");
    }
    if (proofCutoffScore === null || !Number.isFinite(proofCutoffScore)) {
      return skip("invalid-proof-cutoff");
    }
    const frontierSelectedCardCount = frontierNodeProfile?.selectedCardCount;
    if (frontierSelectedCardCount !== MEDLEY_TEAM_SIZE) {
      return skip("frontier-not-leaf");
    }
    const selectedCardIds = getFrontierNodeNumberArray(frontierNodeProfile, "selectedCardIds");
    if (!selectedCardIds || selectedCardIds.length === 0) {
      return skip("missing-frontier-card-ids");
    }
    const frontierSlotScore = normalizeDiagnosticNumber(
      typeof frontierNodeProfile?.slotUpperBound === "number" ? frontierNodeProfile.slotUpperBound : null,
    );
    if (frontierSlotScore === null) {
      return skip("missing-frontier-score");
    }
    const remainingSlotIndices = slots.map((_, index) => index).filter((index) => index !== slotIndex);
    if (remainingSlotIndices.length !== 2) {
      return skip("invalid-remaining-slots");
    }
    const [leftSlotIndex, rightSlotIndex] = remainingSlotIndices;
    const leftCandidates = candidatesBySlot[leftSlotIndex] ?? [];
    const rightCandidates = candidatesBySlot[rightSlotIndex] ?? [];
    if (leftCandidates.length === 0 || rightCandidates.length === 0) {
      return skip("empty-pair-pool");
    }
    const sortedSelectedCardIds = [...selectedCardIds].sort((left, right) => left - right);
    const bannedSelectedCardIds = new Set(sortedSelectedCardIds);
    const minimumRelevantPairScore = proofCutoffScore - frontierSlotScore;
    const rowSlotIndex = leftCandidates.length <= rightCandidates.length ? leftSlotIndex : rightSlotIndex;
    const columnSlotIndex = rowSlotIndex === leftSlotIndex ? rightSlotIndex : leftSlotIndex;
    const rowCandidates = rowSlotIndex === leftSlotIndex ? leftCandidates : rightCandidates;
    const columnCandidates = rowSlotIndex === leftSlotIndex ? rightCandidates : leftCandidates;
    const rightIndexByLeft = new Int32Array(rowCandidates.length);
    const heapLeftIndices = new Int32Array(rowCandidates.length);
    let heapSize = 0;
    let skippedBannedRowCandidateCount = 0;
    for (let leftIndex = 0; leftIndex < rowCandidates.length; leftIndex += 1) {
      if (medleyTeamCandidateHasCardIdInSet(rowCandidates[leftIndex], bannedSelectedCardIds)) {
        skippedBannedRowCandidateCount += 1;
        continue;
      }
      heapSize = pushCandidateAdmissionPairHeap(
        rowCandidates,
        columnCandidates,
        rightIndexByLeft,
        heapLeftIndices,
        heapSize,
        leftIndex,
      );
    }
    const probeDeadlineAt = performance.now() + MEDLEY_EXACT_CANDIDATE_ADMISSION_PAIR_PROBE_TIMEBOX_MS;
    let poppedPairCount = 0;
    let bannedPairCount = 0;
    let overlapPairCount = 0;
    let bestGeneratedPairScore: number | null = null;
    let bestGeneratedPairRank: number | null = null;
    while (
      heapSize > 0
      && poppedPairCount < MEDLEY_EXACT_CANDIDATE_ADMISSION_PAIR_PROBE_POP_LIMIT
      && performance.now() < probeDeadlineAt
    ) {
      const popped = popCandidateAdmissionPairHeap(
        rowCandidates,
        columnCandidates,
        rightIndexByLeft,
        heapLeftIndices,
        heapSize,
      );
      if (!popped) {
        break;
      }
      const leftIndex = popped.leftIndex;
      heapSize = popped.heapSize;
      const rightIndex = rightIndexByLeft[leftIndex];
      const rowCandidate = rowCandidates[leftIndex];
      const columnCandidate = columnCandidates[rightIndex];
      poppedPairCount += 1;
      if (medleyTeamCandidateHasCardIdInSet(columnCandidate, bannedSelectedCardIds)) {
        bannedPairCount += 1;
      } else if (medleyExactCandidatesOverlap(rowCandidate, columnCandidate)) {
        overlapPairCount += 1;
      } else {
        bestGeneratedPairScore = rowCandidate.result.score + columnCandidate.result.score;
        bestGeneratedPairRank = poppedPairCount;
        break;
      }
      const nextRightIndex = rightIndex + 1;
      if (nextRightIndex < columnCandidates.length) {
        rightIndexByLeft[leftIndex] = nextRightIndex;
        heapSize = pushCandidateAdmissionPairHeap(
          rowCandidates,
          columnCandidates,
          rightIndexByLeft,
          heapLeftIndices,
          heapSize,
          leftIndex,
        );
      }
    }
    const timedOut = heapSize > 0 && performance.now() >= probeDeadlineAt && bestGeneratedPairScore === null;
    const popLimited = (
      heapSize > 0
      && poppedPairCount >= MEDLEY_EXACT_CANDIDATE_ADMISSION_PAIR_PROBE_POP_LIMIT
      && bestGeneratedPairScore === null
    );
    const frontierPairUpper = heapSize > 0
      ? getCandidateAdmissionPairScore(rowCandidates, columnCandidates, rightIndexByLeft, heapLeftIndices[0])
      : Number.NEGATIVE_INFINITY;
    const generatedPairUpperOrNull = bestGeneratedPairScore !== null
      ? bestGeneratedPairScore
      : normalizeDiagnosticNumber(frontierPairUpper);
    const pairUnseenUpper = normalizeDiagnosticNumber(exactPairUnseenUpperByExcludedSlot[slotIndex]);
    const unconditionedPairUpper = normalizeDiagnosticNumber(exactPairUpperByExcludedSlot[slotIndex]);
    const conditionedPairUpper = Math.max(
      generatedPairUpperOrNull ?? Number.NEGATIVE_INFINITY,
      pairUnseenUpper ?? Number.NEGATIVE_INFINITY,
    );
    const conditionedPairUpperOrNull = Number.isFinite(conditionedPairUpper) ? conditionedPairUpper : null;
    const generatedTotalUpper = generatedPairUpperOrNull !== null
      ? frontierSlotScore + generatedPairUpperOrNull
      : null;
    const pairUnseenTotalUpper = pairUnseenUpper !== null
      ? frontierSlotScore + pairUnseenUpper
      : null;
    const conditionedTotalUpper = conditionedPairUpperOrNull !== null
      ? frontierSlotScore + conditionedPairUpperOrNull
      : null;
    const generatedGap = generatedTotalUpper !== null ? generatedTotalUpper - proofCutoffScore : null;
    const pairUnseenGap = pairUnseenTotalUpper !== null ? pairUnseenTotalUpper - proofCutoffScore : null;
    const conditionedGap = conditionedTotalUpper !== null ? conditionedTotalUpper - proofCutoffScore : null;
    const conditionedBlocker = conditionedGap === null
      ? "unknown"
      : conditionedGap <= 0
        ? "closed"
        : generatedGap !== null && generatedGap > 0
          ? "generated-pair"
          : pairUnseenGap !== null && pairUnseenGap > 0
            ? "pair-unseen"
            : "other";
    return {
      enabled: true,
      completed: true,
      behaviorChange: false,
      remainingSlotIndices,
      rowSlotIndex,
      columnSlotIndex,
      pairCandidateCounts: [leftCandidates.length, rightCandidates.length],
      frontierSlotScore,
      frontierSelectedCardIds: sortedSelectedCardIds,
      minimumRelevantPairScore,
      rowStateMiB: roundMiB(rightIndexByLeft.byteLength + heapLeftIndices.byteLength),
      popLimit: MEDLEY_EXACT_CANDIDATE_ADMISSION_PAIR_PROBE_POP_LIMIT,
      timeboxMs: MEDLEY_EXACT_CANDIDATE_ADMISSION_PAIR_PROBE_TIMEBOX_MS,
      timedOut,
      popLimited,
      poppedPairCount,
      skippedBannedRowCandidateCount,
      bannedPairCount,
      overlapPairCount,
      bestGeneratedPairRank,
      frontierPairUpper: normalizeDiagnosticNumber(frontierPairUpper),
      generatedPairUpper: generatedPairUpperOrNull,
      generatedPairUpperSource: bestGeneratedPairScore !== null ? "disjoint-pair" : "frontier-upper",
      generatedGap,
      pairUnseenUpper,
      pairUnseenGap,
      unconditionedPairUpper,
      conditionedPairUpper: conditionedPairUpperOrNull,
      conditionedGap,
      conditionedBlocker,
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  };
  const recordCandidateAdmissionFrontier = (
    reason: Exclude<MedleyExactCandidateJoinAbortReason, null>,
    diagnostics: {
      slotIndex?: number | null;
      candidateCount?: number | null;
      cutoff?: number | null;
      peekUpperBound?: number | null;
      otherUpper?: number | null;
      observedUpperBound?: number | null;
      candidateSoftLimit?: number | null;
      frontierNodeProfile?: Record<string, unknown> | null;
    },
  ): void => {
    const slotIndex = diagnostics.slotIndex ?? null;
    const cutoff = normalizeDiagnosticNumber(diagnostics.cutoff);
    const peekUpperBound = normalizeDiagnosticNumber(diagnostics.peekUpperBound);
    const otherUpper = normalizeDiagnosticNumber(diagnostics.otherUpper);
    const observedUpperBound = normalizeDiagnosticNumber(diagnostics.observedUpperBound);
    const proofCutoffScore = Number.isFinite(exactJoinProofCutoffScore) ? exactJoinProofCutoffScore : null;
    const candidateCountsBySlot = candidatesBySlot.map((candidates) => candidates.length);
    const currentSlotTailGap = peekUpperBound !== null && cutoff !== null
      ? peekUpperBound - cutoff
      : null;
    const currentSlotTailTotalUpper = peekUpperBound !== null && otherUpper !== null
      ? peekUpperBound + otherUpper
      : null;
    const currentSlotTailTotalGap = currentSlotTailTotalUpper !== null && proofCutoffScore !== null
      ? currentSlotTailTotalUpper - proofCutoffScore
      : null;
    const observedGap = observedUpperBound !== null && proofCutoffScore !== null
      ? observedUpperBound - proofCutoffScore
      : null;
    const pairUnseenUpper = slotIndex !== null
      ? normalizeDiagnosticNumber(exactPairUnseenUpperByExcludedSlot[slotIndex])
      : null;
    const pairUpper = slotIndex !== null
      ? normalizeDiagnosticNumber(exactPairUpperByExcludedSlot[slotIndex])
      : null;
    const frontierPairBoundary = buildCandidateAdmissionFrontierPairBoundaryProfile(
      slotIndex,
      proofCutoffScore,
      diagnostics.frontierNodeProfile,
    );
    const frontierBlocker = observedGap === null
      ? "unknown-observed-upper"
      : observedGap <= 0
        ? "closed"
        : currentSlotTailGap !== null && currentSlotTailGap > 0
          ? "current-slot-tail"
          : pairUnseenUpper !== null
            ? "other-slot-unseen"
            : "other-slot-upper";
    profiling.exactCandidateJoinCandidateAdmissionFrontier = {
      behaviorChange: false,
      reason,
      frontierBlocker,
      slotIndex,
      candidateCount: diagnostics.candidateCount ?? null,
      candidateSoftLimit: diagnostics.candidateSoftLimit ?? candidateSoftLimit,
      candidateCountsBySlot,
      proofCutoffScore,
      cutoff,
      peekUpperBound,
      currentSlotTailGap,
      otherUpper,
      otherUpperSource: classifyCandidateFillOtherUpperSource(slotIndex, otherUpper),
      relaxedOtherUpper: slotIndex !== null
        ? normalizeDiagnosticNumber(candidateRelaxedOtherUpperBySlot[slotIndex])
        : null,
      remainingOtherUpper: slotIndex !== null
        ? normalizeDiagnosticNumber(candidateRemainingOtherUpperBySlot[slotIndex])
        : null,
      pairUpper,
      pairUnseenUpper,
      currentSlotTailTotalUpper,
      currentSlotTailTotalGap,
      observedUpperBound,
      observedGap,
      remainingMs: Number.isFinite(deadlineAt) ? Math.max(0, Math.round(deadlineAt - performance.now())) : null,
      frontierNode: diagnostics.frontierNodeProfile ?? null,
      frontierPairBoundary,
    };
  };
  const recordRawSolverInputCensus = (): void => {
    if (context.debugExactCandidateRawSolverInputCensus !== true) {
      return;
    }
    profiling.exactCandidateJoinRawSolverInputCensus = buildMedleyExactRawSolverInputCensusProfile(
      slots,
      candidatesBySlot,
    );
  };
  const recordRawCandidateMirrorProfile = (): void => {
    if (!rawCandidateMirror) {
      return;
    }
    profiling.exactCandidateJoinRawMirrorProfile = getMedleyExactRawCandidateMirrorProfile(
      rawCandidateMirror,
      candidatesBySlot,
    );
  };
  const recordRawAnchorCheapUpperReplay = (): void => {
    if (context.debugExactCandidateRawAnchorCheapUpperReplay !== true) {
      return;
    }
    profiling.exactCandidateJoinRawAnchorCheapUpperReplay = buildMedleyExactRawAnchorCheapUpperReplayProfile(
      candidatesBySlot,
      generators,
      exactPairUpperByExcludedSlot,
    );
  };
  const recordRawPairUpperScanParity = (): void => {
    if (context.debugExactCandidateRawPairUpperScanParity !== true) {
      return;
    }
    const skippedProfile = buildSkippedMedleyExactRawPairUpperScanParityProfile(candidatesBySlot);
    if (skippedProfile) {
      profiling.exactCandidateJoinRawPairUpperScanParity = skippedProfile;
      return;
    }
    profiling.exactCandidateJoinRawPairUpperScanParity = buildMedleyExactRawPairUpperScanParityProfile(
      candidatesBySlot,
      getRawCandidatePool(),
    );
  };
  const recordRawPairComplementParity = (): void => {
    if (context.debugExactCandidateRawPairComplementParity !== true) {
      return;
    }
    const skippedProfile = buildSkippedMedleyExactRawPairComplementParityProfile(candidatesBySlot);
    if (skippedProfile) {
      profiling.exactCandidateJoinRawPairComplementParity = skippedProfile;
      return;
    }
    profiling.exactCandidateJoinRawPairComplementParity = buildMedleyExactRawPairComplementParityProfile(
      candidatesBySlot,
      getRawCandidatePool(),
    );
  };
  const recordRawCandidatePoolProfile = (): void => {
    if (context.debugExactCandidateRawCandidatePoolProfile !== true) {
      return;
    }
    profiling.exactCandidateJoinRawCandidatePoolProfile = getMedleyExactRawCandidatePoolProfile(
      slots,
      getRawCandidatePool(),
      "shared-current-pool",
    );
    invalidateRawCandidatePool();
  };
  const recordRawSolverHandoffSubProfile = (key: string, profile: Record<string, unknown>): void => {
    const currentProfile = profiling.exactCandidateJoinRawSolverHandoff;
    if (currentProfile && typeof currentProfile === "object" && !Array.isArray(currentProfile)) {
      profiling.exactCandidateJoinRawSolverHandoff = {
        ...currentProfile,
        [key]: profile,
      };
      return;
    }
    profiling.exactCandidateJoinRawSolverHandoff = {
      enabled: true,
      kind: key,
      [key]: profile,
    };
  };
  const recordRawResidentResultReleaseProfile = (profile: Record<string, unknown>): void => {
    recordRawSolverHandoffSubProfile("rawResidentResultRelease", profile);
  };
  let rawResidentDirectResultHarnessCache: {
    result: BandoriMedleyTeamSearchResult | null;
    profile: Record<string, unknown>;
  } | null = null;
  const getRawResidentDirectResultHarness = (): {
    result: BandoriMedleyTeamSearchResult | null;
    profile: Record<string, unknown>;
  } | null => {
    if (context.enableExactCandidateRawResidentResult !== true) {
      return null;
    }
    if (!didFinalizeCandidateStorageForRead) {
      rawResidentDirectResultHarnessCache = {
        result: null,
        profile: {
          enabled: true,
          skipped: true,
          skipReason: "candidate-storage-not-finalized",
          returnedRawResult: false,
          behaviorChange: false,
          candidateRemoval: false,
        },
      };
      recordRawSolverHandoffSubProfile(
        "rawResidentDirectResultHarness",
        rawResidentDirectResultHarnessCache.profile,
      );
      return rawResidentDirectResultHarnessCache;
    }
    if (!rawResidentDirectResultHarnessCache) {
      rawResidentDirectResultHarnessCache = buildMedleyExactRawResidentDirectResultHarness(
        slots,
        candidatesBySlot,
        getRawCandidateSlotReadSource(),
        configuration,
        {
          server,
          perfectRate,
          stats,
          profiling,
        },
        deadlineAt,
        isPastDeadline,
        context.enableExactCandidateRawResidentWinnerOracle === true,
      );
    }
    recordRawSolverHandoffSubProfile(
      "rawResidentDirectResultHarness",
      rawResidentDirectResultHarnessCache.profile,
    );
    return rawResidentDirectResultHarnessCache;
  };
  const recordRawResidentDirectResultHarnessProfile = (): void => {
    getRawResidentDirectResultHarness();
  };
  let didUseRawResidentPrimarySolve = false;
  const maybeSolveWithRawResidentPrimary = (): BandoriMedleyTeamSearchResult | null => {
    const directHarness = getRawResidentDirectResultHarness();
    const rawResult = directHarness?.result ?? null;
    if (!rawResult || directHarness?.profile.returnedRawResult !== true) {
      recordRawSolverHandoffSubProfile("rawResidentPrimarySolve", {
        enabled: context.enableExactCandidateRawResidentResult === true,
        skipped: true,
        skipReason: directHarness ? "direct-harness-not-authoritative" : "disabled",
        returnedRawResult: false,
        behaviorChange: false,
        candidateRemoval: false,
      });
      return null;
    }
    didUseRawResidentPrimarySolve = true;
    recordRawSolverHandoffSubProfile("rawResidentPrimarySolve", {
      enabled: true,
      skipped: false,
      returnedRawResult: true,
      behaviorChange: true,
      candidateRemoval: false,
      richCandidateRole: directHarness.profile.richCandidateRole ?? "oracle-only",
      richCandidatePrimaryRetainedCount: directHarness.profile.richCandidatePrimaryRetainedCount ?? 0,
      richCandidateOracleCount: directHarness.profile.richCandidateOracleCount ?? directHarness.profile.candidateCountTotal ?? null,
      winnerHydrationCount: directHarness.profile.winnerHydrationCount ?? null,
      objectOracleMode: directHarness.profile.objectOracleMode ?? "full-object-oracle",
      rawScore: rawResult.score,
      rawAverageScore: rawResult.averageScore,
      rawMaxScore: rawResult.maxScore,
      rawMinScore: rawResult.minScore,
      rawCardIds: rawResult.cardIds,
    });
    return rawResult;
  };
  const maybeUseRawResidentResult = (
    objectResult: BandoriMedleyTeamSearchResult | null,
  ): BandoriMedleyTeamSearchResult | null => {
    if (context.enableExactCandidateRawResidentResult !== true) {
      return objectResult;
    }
    if (!didFinalizeCandidateStorageForRead) {
      recordRawResidentResultReleaseProfile({
        enabled: true,
        skipped: true,
        skipReason: "candidate-storage-not-finalized",
        returnedRawResult: false,
        behaviorChange: false,
        candidateRemoval: false,
      });
      return objectResult;
    }
    const release = buildMedleyExactRawResidentResultRelease(
      slots,
      getRawCandidateSlotReadSource(),
      configuration,
      objectResult,
      {
        server,
        perfectRate,
        stats,
        profiling,
      },
      deadlineAt,
      isPastDeadline,
    );
    recordRawResidentResultReleaseProfile(release.profile);
    return release.result ?? objectResult;
  };
  const buildUnprovedExactCandidateJoinResult = (
    result: BandoriMedleyTeamSearchResult | null = null,
    observedUpperBound: number | null = getObservedExactCandidateJoinUpperBound(),
  ): MedleyExactCandidateJoinResult => {
    recordRawCandidateMirrorProfile();
    recordRawSolverInputCensus();
    recordRawAnchorCheapUpperReplay();
    recordRawPairComplementParity();
    recordRawPairUpperScanParity();
    recordRawCandidatePoolProfile();
    recordPrefixUpperReplaySummary();
    recordPreMaterializationCensus();
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
    const resultWithPrefixSeed = applyPrefixSeedResult(result);
    const returnedResult = maybeUseRawResidentResult(resultWithPrefixSeed);
    recordRawCandidateMirrorProfile();
    recordRawSolverInputCensus();
    recordRawAnchorCheapUpperReplay();
    recordRawPairComplementParity();
    recordRawPairUpperScanParity();
    recordRawCandidatePoolProfile();
    recordPrefixUpperReplaySummary();
    recordPreMaterializationCensus();
    releaseExactJoinWorkingSet();
    if (didUseRawResidentPrimarySolve) {
      recordRawSolverHandoffSubProfile("rawResidentPrimarySolveRelease", {
        enabled: true,
        richCandidateCountAfterRelease: candidatesBySlot.reduce((sum, candidates) => sum + candidates.length, 0),
      });
    }
    return { proved: true, result: returnedResult };
  };
  let effectiveCandidateSoftLimit = candidateSoftLimit;
  let didGuardedCandidateExtension = false;
  let didAnchorFrontierProof = false;
  let didAnchorFrontierCheapUpper = false;
  let didRawAnchorFrontierProbe = false;
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
    const skipAnchorFrontierProof = (reason: string): null => {
      profiling.exactCandidateJoinAnchorFrontierProofSkipCount += 1;
      profiling.exactCandidateJoinLastAnchorFrontierProofSkipReason = reason;
      return null;
    };
    const skipReasons: string[] = [];
    if (didAnchorFrontierProof) {
      skipReasons.push("already-proved");
    }
    if (stats.memoryLimited) {
      skipReasons.push("memory-limited");
    }
    if (calculatedCardCount > MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_CARD_COUNT) {
      skipReasons.push("card-count");
    }
    const anchorCandidateCount = candidatesBySlot[slotIndex]?.length ?? 0;
    if (anchorCandidateCount <= 0) {
      skipReasons.push("empty-anchor");
    }
    if (anchorCandidateCount > MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_ANCHOR_CANDIDATES) {
      skipReasons.push("anchor-count");
    }
    if (!Number.isFinite(peekUpperBound)) {
      skipReasons.push("peek-upper");
    }
    if (!Number.isFinite(otherUpper)) {
      skipReasons.push("other-upper");
    }
    const otherSlotCandidateCounts = candidatesBySlot
      .map((candidates, index) => (index === slotIndex ? 0 : candidates.length))
      .filter((count) => count > 0);
    if (
      otherSlotCandidateCounts.length !== slots.length - 1
    ) {
      skipReasons.push("other-slot-missing");
    }
    if (otherSlotCandidateCounts.some(
      (count) => count > MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_OTHER_SLOT_CANDIDATES,
    )) {
      skipReasons.push("other-slot-count");
    }
    if (
      otherSlotCandidateCounts.reduce((sum, count) => sum + count, 0)
        > MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_OTHER_SLOT_CANDIDATE_TOTAL
    ) {
      skipReasons.push("other-slot-total");
    }
    const frontierGap = peekUpperBound + otherUpper - incumbentScore;
    if (
      !Number.isFinite(frontierGap)
    ) {
      skipReasons.push("frontier-gap");
    } else if (frontierGap < 0) {
      skipReasons.push("frontier-closed");
    } else if (frontierGap > MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_FRONTIER_GAP) {
      skipReasons.push("frontier-gap-over");
    }
    const remainingMs = getGuardedExtensionRemainingMs();
    if (remainingMs < MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MIN_REMAINING_MS) {
      skipReasons.push("remaining-ms");
    }
    const otherSlotCandidateTotal = otherSlotCandidateCounts.reduce((sum, count) => sum + count, 0);
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckSlotIndex = slotIndex;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckCalculatedCardCount = Number.isFinite(calculatedCardCount)
      ? calculatedCardCount
      : null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckMaxCardCount = (
      MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_CARD_COUNT
    );
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckAnchorCandidateCount = anchorCandidateCount;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckMaxAnchorCandidateCount = (
      MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_ANCHOR_CANDIDATES
    );
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckOtherSlotCandidateCounts = [
      ...otherSlotCandidateCounts,
    ];
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckOtherSlotCandidateTotal = otherSlotCandidateTotal;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckMaxOtherSlotCandidateCount = (
      MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_OTHER_SLOT_CANDIDATES
    );
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckMaxOtherSlotCandidateTotal = (
      MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_OTHER_SLOT_CANDIDATE_TOTAL
    );
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckFrontierGap = Number.isFinite(frontierGap)
      ? frontierGap
      : null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckMaxFrontierGap = (
      MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_FRONTIER_GAP
    );
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckPeekUpperBound = Number.isFinite(peekUpperBound)
      ? peekUpperBound
      : null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckOtherUpper = Number.isFinite(otherUpper)
      ? otherUpper
      : null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckIncumbentScore = Number.isFinite(incumbentScore)
      ? incumbentScore
      : null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckRemainingMs = Number.isFinite(remainingMs)
      ? Math.max(0, Math.round(remainingMs))
      : null;
    profiling.exactCandidateJoinLastAnchorFrontierPrecheckMinRemainingMs = (
      MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MIN_REMAINING_MS
    );
    if (skipReasons.length > 0) {
      if (
        context.debugExactCandidateRawAnchorFrontierProbe === true
        && !didRawAnchorFrontierProbe
        && !stats.memoryLimited
        && anchorCandidateCount > 0
        && otherSlotCandidateCounts.length === slots.length - 1
        && Number.isFinite(peekUpperBound)
        && Number.isFinite(otherUpper)
        && Number.isFinite(frontierGap)
        && frontierGap >= 0
        && frontierGap <= MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_FRONTIER_GAP
        && remainingMs >= MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MIN_REMAINING_MS
      ) {
        didRawAnchorFrontierProbe = true;
        profiling.exactCandidateJoinRawAnchorFrontierProbe = buildMedleyExactRawAnchorFrontierProbeProfile(
          candidatesBySlot,
          getRawCandidatePool,
          activeGeneratorsBySlot,
          slotIndex,
          otherUpper,
          incumbentScore,
          deadlineAt,
          context.debugExactCandidateRawAnchorFrontierProbeMaxCandidateTotal ?? null,
          context.debugExactCandidateRawAnchorFrontierConstrainedPeekProbe === true,
          context.debugExactCandidateRawPairPricingFrontierProbe === true,
        );
        invalidateRawCandidatePool();
      }
      if (
        context.debugExactCandidateAnchorFrontierCheapUpperProbe === true
        && !didAnchorFrontierCheapUpper
        && !stats.memoryLimited
        && anchorCandidateCount > 0
        && otherSlotCandidateCounts.length === slots.length - 1
        && Number.isFinite(peekUpperBound)
        && Number.isFinite(otherUpper)
        && Number.isFinite(frontierGap)
        && frontierGap >= 0
        && frontierGap <= MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_FRONTIER_GAP
        && remainingMs >= MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MIN_REMAINING_MS
      ) {
        didAnchorFrontierCheapUpper = true;
        estimateMedleyExactCandidateAnchorFrontierCheapUpper(
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
      }
      return skipAnchorFrontierProof(skipReasons.join("+"));
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
      observeEvaluatedResult,
      retainCandidateForSlot ?? undefined,
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
    if (retainCandidateForSlot) {
      retainCandidateForSlot(slotIndex, topCandidate);
    } else {
      candidatesBySlot[slotIndex].push(topCandidate);
    }
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
      retainCandidateForSlot ?? undefined,
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
        false,
        retainCandidateForSlot ?? undefined,
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
      Number.POSITIVE_INFINITY,
      false,
      retainCandidateForSlot ?? undefined,
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
      retainCandidateForSlot ?? undefined,
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
    context.enableExactCandidateCapacityBatchPruning === true,
    context.debugExactCandidatePrefixCapacityLevel3Replay === true,
    context.debugExactCandidatePrefixCapacityLevel3LookaheadReplay === true,
    context.enableExactCandidateCapacitySourceLeafPruning === true,
    context.enableExactCandidateCapacityLevel3LookaheadPruning === true,
    context.debugExactCandidatePreMaterializationCensus === true,
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
  const recordRawPairComplementUpperProfile = (): void => {
    if (context.enableExactCandidateRawPairComplementUpper !== true) {
      return;
    }
    const generatorProfiles = getCandidateFillProfilingGenerators().map((generator) => (
      generator.memoryProfile ? generator.memoryProfile() : {}
    ));
    const sumProfileNumber = (key: string): number => generatorProfiles.reduce((sum, profile) => {
      const value = profile[key];
      return sum + (typeof value === "number" && Number.isFinite(value) ? value : 0);
    }, 0);
    profiling.exactCandidateJoinRawPairComplementUpper = {
      enabled: true,
      behaviorChange: true,
      representation: "raw-slot-scan-upper-v1",
      rawMirrorEnabled: rawCandidateMirror !== null,
      rawMirrorDisabled: rawCandidateMirror?.disabledReason !== null,
      rawMirrorDisabledReason: rawCandidateMirror?.disabledReason ?? null,
      generatorCount: generatorProfiles.length,
      queryCount: sumProfileNumber("rawPairComplementUpperQueryCount"),
      fallbackCount: sumProfileNumber("rawPairComplementUpperFallbackCount"),
      buildCount: sumProfileNumber("rawPairComplementUpperBuildCount"),
      cacheSize: sumProfileNumber("rawPairUpperQueryCacheSize"),
      scannedLeftCandidateCount: sumProfileNumber("rawPairComplementUpperScannedLeftCandidateCount"),
      scannedRightWordCount: sumProfileNumber("rawPairComplementUpperScannedRightWordCount"),
      rawRightCandidateBitsetMiB: roundMiB(
        sumProfileNumber("rawRightCandidateBitsetMiB") * BYTES_PER_MIB,
      ),
    };
  };
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
      ? getMedleyExactRawCandidateMirrorProfile(rawCandidateMirror, candidatesBySlot)
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
    const rawCandidatePoolProfile = context.debugExactCandidateRawCandidatePoolProfile === true
      ? buildMedleyExactRawCandidatePoolProfile(slots, candidatesBySlot)
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
      rawCandidatePool: rawCandidatePoolProfile,
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
      Number.POSITIVE_INFINITY,
      false,
      retainCandidateForSlot ?? undefined,
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
      finalizeRawCandidateMirrorForDiagnostics();
      recordRawSolverHandoffProfile();
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
      rawCandidatesBySlot: context.enableExactCandidateRawPairComplementUpper === true
        && rawCandidateMirror
        && rawCandidateMirror.disabledReason === null
        ? rawCandidateMirror.slots
        : undefined,
      useRawPairComplementUpper: context.enableExactCandidateRawPairComplementUpper === true,
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
        recordCandidateAdmissionFrontier(stats.memoryLimited ? "memory-soft-limit" : "candidate-fill-deadline", {
          slotIndex,
          candidateCount: candidatesBySlot[slotIndex].length,
          cutoff,
          peekUpperBound: generator.peekUpperBound(),
          otherUpper,
          observedUpperBound: getObservedExactCandidateJoinUpperBound(),
          candidateSoftLimit: effectiveCandidateSoftLimit,
          frontierNodeProfile: generator.peekFrontierNodeProfile(),
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
        finalizeRawCandidateMirrorForDiagnostics();
        recordRawSolverHandoffProfile();
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
        recordCandidateAdmissionFrontier(stats.timedOut
          ? stats.memoryLimited ? "memory-soft-limit" : "candidate-fill-deadline"
          : "candidate-fill-soft-limit", {
          slotIndex,
          candidateCount: candidatesBySlot[slotIndex].length,
          cutoff,
          peekUpperBound: generator.peekUpperBound(),
          otherUpper,
          observedUpperBound: anchorFrontierObservedUpperBound ?? getObservedExactCandidateJoinUpperBound(),
          candidateSoftLimit: effectiveCandidateSoftLimit,
          frontierNodeProfile: generator.peekFrontierNodeProfile(),
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
        finalizeRawCandidateMirrorForDiagnostics();
        recordRawSolverHandoffProfile();
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
        recordCandidateAdmissionFrontier("candidate-fill-generator-aborted", {
          slotIndex,
          candidateCount: candidatesBySlot[slotIndex].length,
          cutoff,
          peekUpperBound: generator.peekUpperBound(),
          otherUpper,
          observedUpperBound: getObservedExactCandidateJoinUpperBound(),
          candidateSoftLimit: effectiveCandidateSoftLimit,
          frontierNodeProfile: generator.peekFrontierNodeProfile(),
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
        finalizeRawCandidateMirrorForDiagnostics();
        recordRawSolverHandoffProfile();
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
        if (retainCandidateForSlot) {
          retainCandidateForSlot(slotIndex, candidate);
        } else {
          candidatesBySlot[slotIndex].push(candidate);
        }
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
    || context.debugExactCandidateRawCandidatePoolProfile === true
    || context.debugExactCandidateRawSolverInputCensus === true
  ) {
    recordExactJoinMemorySnapshot("after-candidate-fill");
  }
  finalizeCandidateStorageForRead();
  recordRawSolverHandoffProfile();
  recordRawResidentDirectResultHarnessProfile();
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
  const rawResidentPrimaryResult = maybeSolveWithRawResidentPrimary();
  if (rawResidentPrimaryResult) {
    if (rawResidentPrimaryResult.score > incumbentScore) {
      profiling.exactCandidateJoinImprovementCount += 1;
      profiling.bestExactCandidateJoinImprovement = Math.max(
        profiling.bestExactCandidateJoinImprovement,
        rawResidentPrimaryResult.score - incumbentScore,
      );
    }
    profiling.exactCandidateJoinCompletedCount += 1;
    return buildProvedExactCandidateJoinResult(rawResidentPrimaryResult);
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
      slots,
      candidatesBySlot,
      configuration,
      slotOrder,
      joinResult.result,
      exactJoinProofCutoffScore,
      deadlineAt,
      isPastDeadline,
      getRawCandidateSlotReadSource,
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
