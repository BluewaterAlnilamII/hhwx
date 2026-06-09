/*
 * Medley exact team search orchestration.
 *
 * Core modules own card, chart, scoring, and single-team evaluation math. This file owns
 * the top-level medley workflow: prepare slots, seed incumbents, run cross-slot DFS, and
 * report whether the run actually proved the global optimum.
 */

import {
  estimateMedleyStaticCoarsePotential,
  estimateMedleyLockedConfigurationPotential,
  filterMedleyConfigurationsByCoarseKeys,
  getMedleyAreaItemCoarseKey,
  getMedleyPruningThreshold,
  getMedleySlotCandidateLimits,
  medleyConfigurationMatchesCoarseFilter,
  orderMedleyCoarseSeedConfigurationIndices,
} from "./configurations";
import {
  MEDLEY_CONFLICT_EXACT_BNB_DEFAULT_NODE_LIMIT,
  MEDLEY_CONFLICT_SLOT_SOLVE_DEFAULT_NODE_LIMIT,
  MEDLEY_DEFAULT_ANCHOR_CANDIDATE_LIMIT,
  MEDLEY_DEFAULT_OPPORTUNITY_ANCHOR_LIMIT,
  MEDLEY_ENABLE_BUCKETED_CAPACITY_UPPER,
  MEDLEY_EXACT_CANDIDATE_JOIN_DEFAULT_CANDIDATE_SOFT_LIMIT,
  MEDLEY_EXACT_CANDIDATE_JOIN_DEFAULT_NODE_SOFT_LIMIT,
  MEDLEY_MAX_OPPORTUNITY_ANCHOR_LIMIT,
  MEDLEY_TEAM_COUNT,
} from "./constants";
import { searchMedleyConfigurationByConflictExactBnb } from "./experiments/conflict-bnb";
import { releaseMedleyScoreOnlyTeamEvaluationCache } from "./candidates";
import {
  MEDLEY_EXACT_CANDIDATE_JOIN_LOW_MEMORY_HIGH_PAIR_PREFIX_RECORD_LIMIT,
  MEDLEY_EXACT_CANDIDATE_JOIN_LOW_MEMORY_HIGH_PAIR_SCAN_MIN_RECORD_COUNT,
  MEDLEY_EXACT_CANDIDATE_JOIN_SMALL_GAP_SOLVE_RETRY_MAX_PER_RUN,
} from "./experiments/exact-candidate-join-constants";
import { searchMedleyConfigurationByExactCandidateJoin } from "./experiments/exact-candidate-join";
import { createInitialMedleyProfilingStats } from "./profiling";
import { buildMedleyResult, createMedleyEvaluatedCandidateTracker, pushMedleyResult, sortMedleyResults } from "./results";
import {
  collectTopMedleySlotTeams,
  getMedleyGreedySeedSlotIndices,
  optimizeCurrentMedleySeedResults,
  optimizeMedleySeedNeighborhood,
  seedMedleyResultsFromFastGreedyOrders,
  seedMedleyResultsFromGreedyOrders,
  seedMedleyResultsFromSlotCandidates,
} from "./seeds";
import {
  buildMedleySlotBuildContexts,
  buildMedleySlotSearches,
  chooseNextMedleySlotIndex,
  createMedleySlotInput,
  enumerateMedleySlotTeams,
  estimateMedleyConfigurationBasicSkillAwareRootUpperBound,
  estimateRelaxedMedleyRemainingBestScoreUpperBound,
  findBestMedleySlotTeamWithCache,
  pruneDominatedMedleySlotCards,
  pruneMedleyCardsByInclusionUpper,
} from "./slots";
import {
  estimateMedleyAnchorSlotDecompositionUpperBound,
  estimateMedleyOpportunityCostUpperBound,
} from "./upper/anchor-opportunity";
import {
  estimateMedleyRemainingScoreUpperBound,
} from "./upper/capacity";
import { captureMedleyCapacityUpperWitness, captureMedleyRootUpperWitness } from "./upper/witness";
import {
  buildCalculatedCards,
  buildPermutations,
  clamp,
  createAreaItemConfigurations,
  pruneDominatedAreaItemConfigurations,
} from "@/lib/bandori/team-builder/core";
import type { BandoriAreaItemConfiguration } from "@/lib/bandori/team-builder/core";
import type {
  BandoriMedleyTeamSearchInput,
  BandoriMedleyTeamSearchResponse,
  BandoriMedleyTeamSearchResult,
  BandoriMedleyTeamSearchStats,
  MedleyBestSlotTeamCacheEntry,
  MedleyConfigurationWarmupCache,
  MedleyFixedCardSetOptimizationCacheEntry,
  MedleyObservedUpperBoundSource,
  MedleySlotSearch,
  MedleyTeamCandidate,
} from "./types";

const MEDLEY_UPPER_REPLAY_SAMPLE_LIMIT = 256;
const MEDLEY_EXACT_JOIN_AUTO_MAX_SLOT_CARDS = 300;
const MEDLEY_EXACT_JOIN_AUTO_HIGH_CANDIDATE_SOFT_LIMIT = 400_000;
const MEDLEY_EXACT_JOIN_ALL_SCOPE_SAFE_MAX_CARD_COUNT = 1_699;
const MEDLEY_EXACT_JOIN_ALL_SCOPE_EVERYONE_SAFE_MAX_CARD_COUNT = 900;
const MEDLEY_WIDE_ROOT_GAP_INCLUSION_PRUNE_SKIP = 0;
const MEDLEY_DOMINATED_BOUNDED_SKIP_MIN_GAP = 50_000;
const MEDLEY_NEAR_DEADLINE_TIGHT_ROOT_PRUNE_REMAINING_MS = 30_000;
const MEDLEY_NEAR_DEADLINE_BOUNDED_SKIP_REMAINING_MS = 15_000;
const MEDLEY_NEAR_DEADLINE_BOUNDED_SKIP_MIN_GAP = 50_000;
const MEDLEY_SMALL_GAP_DFS_FALLBACK_MAX_CARD_COUNT = 1_600;
const MEDLEY_SMALL_GAP_DFS_FALLBACK_MAX_UPPER_GAP = 100_000;
const MEDLEY_SMALL_GAP_DFS_FALLBACK_MIN_REMAINING_MS = 45_000;
const MEDLEY_TRAILING_SAME_COARSE_DFS_ONLY_MIN_REMAINING_MS = 30_000;
const MEDLEY_TRAILING_SAME_COARSE_DFS_ONLY_MIN_PROOF_COUNT = 1;
const MEDLEY_EXACT_JOIN_PREFIX_SEED_DEFAULT_TIMEBOX_MS = 300;
const MEDLEY_EXACT_JOIN_PREFIX_SEED_DEFAULT_MAX_SMALLEST_CANDIDATE_COUNT = 20_000;
const MEDLEY_EXACT_JOIN_PREFIX_SEED_DEFAULT_MIN_CANDIDATE_COUNTS: [number, number, number] = [1, 1, 1];
const MEDLEY_LOW_MEMORY_INITIAL_CANDIDATE_SYNC_TIMEBOX_MS = 2_000;
const MEDLEY_LOW_MEMORY_INITIAL_CANDIDATE_SYNC_MAX_SAME_COARSE_PROOF_ELAPSED_MS = 8_000;
const MEDLEY_LOW_MEMORY_INITIAL_CANDIDATE_SYNC_MIN_MEMORY_HEADROOM_MIB = 800;
const MEDLEY_LOW_MEMORY_INITIAL_CANDIDATE_SYNC_MAX_SLOT_CARD_COUNT = 249;
const MEDLEY_LOW_MEMORY_INITIAL_CANDIDATE_SYNC_EVENT_ROOT_RISK_SLOT_CARD_COUNT = 250;
const MEDLEY_LOW_MEMORY_INITIAL_CANDIDATE_SYNC_SAME_COARSE_GUARD_MAX_SLOT_CARD_COUNT = 249;
const MEDLEY_FULL_WIDTH_EVENT_EXACT_JOIN_MEMORY_SOFT_LIMIT_MIB = 3_200;
const MEDLEY_LARGE_GAP_EVENT_SKIP_PROOF_MIN_GAP = 600_000;
const MEDLEY_POST_EXACT_JOIN_TIGHT_ROOT_MAX_CARD_COUNT = 1_300;
const MEDLEY_POST_EXACT_JOIN_TIGHT_ROOT_MIN_REMAINING_MS = 30_000;
const MEDLEY_SAME_COARSE_FRONTIER_RETRY_MAX_CARD_COUNT = 1_300;
const MEDLEY_SAME_COARSE_FRONTIER_RETRY_MIN_REMAINING_MS = 90_000;
const MEDLEY_SAME_COARSE_FRONTIER_RETRY_MIN_ROOT_DELTA = 100_000;
const MEDLEY_SAME_COARSE_FRONTIER_PROOF_TARGET_GAP = 200_000;
const MEDLEY_SAME_COARSE_FRONTIER_PROOF_TARGET_MAX_SLOT_CARDS = 225;
const MEDLEY_SAME_COARSE_FRONTIER_PROOF_TARGET_MIN_REMAINING_MS = 120_000;
const MEDLEY_SAME_COARSE_FRONTIER_PROOF_TARGET_MIN_ROOT_DELTA = 350_000;
const MEDLEY_EVENT_ROOT_FRONTIER_PROBE_TIMEBOX_MS = 30_000;
const MEDLEY_EVENT_ROOT_FRONTIER_PROBE_CANDIDATE_SOFT_LIMIT = 100_000;
const MEDLEY_EVENT_ROOT_FRONTIER_PROBE_MIN_REMAINING_MS = 60_000;
const MEDLEY_EVENT_ROOT_FRONTIER_PROBE_MIN_MEMORY_HEADROOM_MIB = 1_024;
const BYTES_PER_MIB = 1024 * 1024;
const MEMORY_SOFT_LIMIT_CHECK_INTERVAL_MS = 50;
const MEDLEY_PROGRESS_CHECK_INTERVAL_MS = 250;
const RUNTIME_HEAP_LIMIT_RATIO = 0.65;
const MEDLEY_NODE_AUTO_MEMORY_SOFT_LIMIT_MIB = 4_200;
const MEDLEY_SAME_COARSE_MEMORY_SKIP_SOFT_LIMIT_MARGIN_MIB = 1_200;

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asFiniteNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const numbers = value.map(asFiniteNumber);
  return numbers.every((number) => number !== null) ? numbers as number[] : null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    return null;
  }
  return value;
}

function asRecordNumberMap(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const result: Record<string, number> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    const number = asFiniteNumber(entryValue);
    if (number !== null) {
      result[key] = number;
    }
  }
  return result;
}

function subtractNumberMaps(
  current: Record<string, number>,
  previous: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const key of new Set([...Object.keys(current), ...Object.keys(previous)])) {
    const delta = (current[key] ?? 0) - (previous[key] ?? 0);
    if (delta !== 0) {
      result[key] = delta;
    }
  }
  return result;
}

function getMedleyTraceCoarseKey(entry: Record<string, unknown>): string | null {
  const bandKey = typeof entry.bandKey === "string" ? entry.bandKey : null;
  const attribute = typeof entry.attribute === "string" ? entry.attribute : null;
  return bandKey && attribute ? `${bandKey}/${attribute}` : null;
}

function getMedleyTraceRootUpperBound(entry: Record<string, unknown>): number | null {
  return asFiniteNumber(entry.basicSkillAwareRootUpperBound)
    ?? asFiniteNumber(entry.observedRootUpperBound)
    ?? asFiniteNumber(entry.rootScoreUpperBound);
}

function getMedleyTraceEffectiveUpperBound(entry: Record<string, unknown>): number | null {
  return asFiniteNumber(entry.rememberedUnclosedUpperBound)
    ?? asFiniteNumber(entry.activeTightUpperBound)
    ?? asFiniteNumber(entry.activeObservedUpperBound)
    ?? getMedleyTraceRootUpperBound(entry);
}

function getMedleyTraceGap(entry: Record<string, unknown>): number | null {
  const bestScore = asFiniteNumber(entry.bestScore) ?? asFiniteNumber(entry.initialBestScore);
  const effectiveUpperBound = getMedleyTraceEffectiveUpperBound(entry);
  return bestScore !== null && effectiveUpperBound !== null
    ? Math.max(0, effectiveUpperBound - bestScore)
    : null;
}

function buildProofLedger(
  configurationTrace: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return configurationTrace.map((entry) => {
    const rootUpperBound = getMedleyTraceRootUpperBound(entry);
    const activeObservedUpperBound = asFiniteNumber(entry.activeObservedUpperBound);
    const activeTightUpperBound = asFiniteNumber(entry.activeTightUpperBound);
    const rememberedUnclosedUpperBound = asFiniteNumber(entry.rememberedUnclosedUpperBound);
    const effectiveUpperBound = getMedleyTraceEffectiveUpperBound(entry);
    const gap = getMedleyTraceGap(entry);
    return {
      order: asFiniteNumber(entry.order),
      configurationIndex: asFiniteNumber(entry.configurationIndex),
      coarseKey: getMedleyTraceCoarseKey(entry),
      bandKey: typeof entry.bandKey === "string" ? entry.bandKey : null,
      attribute: typeof entry.attribute === "string" ? entry.attribute : null,
      parameter: typeof entry.parameter === "string" ? entry.parameter : null,
      status: typeof entry.status === "string" ? entry.status : null,
      elapsedMs: asFiniteNumber(entry.elapsedMs),
      remainingBudgetMs: asFiniteNumber(entry.remainingBudgetMs),
      initialIncumbent: asFiniteNumber(entry.initialBestScore),
      finalIncumbent: asFiniteNumber(entry.bestScore),
      rootUpperBound,
      activeObservedUpperBound,
      activeObservedUpperSource: entry.activeObservedUpperSource ?? null,
      activeTightUpperBound,
      activeTightUpperSource: entry.activeTightUpperSource ?? null,
      rememberedUnclosedUpperBound,
      rememberedUnclosedUpperSource: entry.rememberedUnclosedUpperSource ?? null,
      effectiveUpperBound,
      gap,
      exactJoinAbortReason: entry.exactCandidateJoinAbortReason ?? null,
      exactJoinAbortSlotIndex: entry.exactCandidateJoinAbortSlotIndex ?? null,
      exactJoinAbortRemainingMs: entry.exactCandidateJoinAbortRemainingMs ?? null,
      candidateCountsBySlot: asFiniteNumberArray(entry.exactCandidateJoinLastCandidateCountsBySlot),
      candidateCutoffsBySlot: asFiniteNumberArray(entry.exactCandidateJoinCandidateCutoffsBySlot),
      pairUpperByExcludedSlot: asFiniteNumberArray(entry.exactCandidateJoinPairUpperByExcludedSlot),
      pairUnseenUpperByExcludedSlot: asFiniteNumberArray(entry.exactCandidateJoinPairUnseenUpperByExcludedSlot),
      pairRootUpperBound: asFiniteNumber(entry.exactCandidateJoinPairRootUpperBound),
      phaseElapsedMs: {
        initialCandidate: asFiniteNumber(entry.exactCandidateJoinInitialCandidateElapsedMsDelta),
        pairUpper: asFiniteNumber(entry.exactCandidateJoinPairUpperElapsedMsDelta),
        candidateFill: asFiniteNumber(entry.exactCandidateJoinCandidateFillElapsedMsDelta),
        solve: asFiniteNumber(entry.exactCandidateJoinSolveElapsedMsDelta),
        globalHeapRekey: asFiniteNumber(entry.exactCandidateJoinGlobalHeapRekeyElapsedMsDelta),
        anchorFrontierCheapUpper: asFiniteNumber(entry.exactCandidateJoinLastAnchorFrontierCheapUpperElapsedMs),
        anchorFrontierProof: asFiniteNumber(entry.exactCandidateJoinLastAnchorFrontierProofElapsedMs),
        smallGapSolveRetry: asFiniteNumber(entry.exactCandidateJoinLastSmallGapSolveRetryTimeboxMs),
        prefixSeed: asFiniteNumber(entry.exactJoinPrefixSeedElapsedMsDelta),
      },
      phaseMemoryMiB: {
        peak: asFiniteNumber(entry.peakUsedHeapMiB),
        anchorFrontierCheapUpper: asFiniteNumber(entry.exactCandidateJoinLastAnchorFrontierCheapUpperPeakHeapMiB),
        anchorFrontierProof: asFiniteNumber(entry.exactCandidateJoinLastAnchorFrontierProofPeakHeapMiB),
        guardedExtension: asFiniteNumber(entry.exactCandidateJoinLastGuardedExtensionPeakHeapMiB),
        stagedExtension: asFiniteNumber(entry.exactCandidateJoinLastStagedExtensionPeakHeapMiB),
        smallGapSolveRetry: asFiniteNumber(entry.exactCandidateJoinLastSmallGapSolveRetryPeakHeapMiB),
        prefixSeed: asFiniteNumber(entry.exactJoinPrefixSeedPeakHeapMiB),
      },
      optionalProbeDeltas: {
        exactJoinPrefixSeedCallCount: asFiniteNumber(entry.exactJoinPrefixSeedCallCountDelta),
        exactJoinPrefixSeedHitCount: asFiniteNumber(entry.exactJoinPrefixSeedHitCountDelta),
        exactJoinPrefixSeedElapsedMs: asFiniteNumber(entry.exactJoinPrefixSeedElapsedMsDelta),
        exactJoinPrefixSeedTimedOutCount: asFiniteNumber(entry.exactJoinPrefixSeedTimedOutCountDelta),
        exactJoinPrefixSeedNoHitLocalTimeoutCount: asFiniteNumber(
          entry.exactJoinPrefixSeedNoHitLocalTimeoutCountDelta,
        ),
        exactJoinPrefixSeedGuardSkipCount: asFiniteNumber(entry.exactJoinPrefixSeedGuardSkipCountDelta),
        exactJoinPrefixSeedGuardSkipReasonCounts: asRecordNumberMap(
          entry.exactJoinPrefixSeedGuardSkipReasonCountsDelta,
        ),
        exactJoinPrefixSeedLastGuardSkipReason: entry.exactJoinPrefixSeedLastGuardSkipReason ?? null,
        anchorFrontierCheapUpperCount: asFiniteNumber(entry.exactCandidateJoinAnchorFrontierCheapUpperCountDelta),
        anchorFrontierCheapUpperImprovementCount: (
          asFiniteNumber(entry.exactCandidateJoinAnchorFrontierCheapUpperImprovementCountDelta)
        ),
        anchorFrontierCheapUpperUnseenRefineAttemptCount: (
          asFiniteNumber(entry.exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineAttemptCount)
        ),
        anchorFrontierCheapUpperUnseenRefineCandidateCount: (
          asFiniteNumber(entry.exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineCandidateCount)
        ),
        anchorFrontierCheapUpperUnseenRefineImprovementCount: (
          asFiniteNumber(entry.exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineImprovementCount)
        ),
        anchorFrontierCheapUpperUnseenRefineAbortReason: (
          entry.exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineAbortReason ?? null
        ),
        lowMemoryInitialCandidateScoreCacheClearCount: (
          asFiniteNumber(entry.exactCandidateJoinLowMemoryInitialCandidateScoreCacheClearCountDelta)
        ),
        lowMemoryInitialCandidateScoreCacheClearInterval: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateScoreCacheClearInterval)
        ),
        lowMemoryInitialCandidateVisitedNodeCount: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateVisitedNodeCount)
        ),
        lowMemoryInitialCandidateEvaluatedTeamCount: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateEvaluatedTeamCount)
        ),
        lowMemoryInitialCandidateBestScore: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateBestScore)
        ),
        lowMemoryInitialCandidateBestCardIds: (
          asFiniteNumberArray(entry.exactCandidateJoinLastLowMemoryInitialCandidateBestCardIds)
        ),
        lowMemoryInitialCandidateBestCardInstanceKeys: (
          asStringArray(entry.exactCandidateJoinLastLowMemoryInitialCandidateBestCardInstanceKeys)
        ),
        lowMemoryInitialCandidateBestSkillIds: (
          asFiniteNumberArray(entry.exactCandidateJoinLastLowMemoryInitialCandidateBestSkillIds)
        ),
        lowMemoryInitialCandidateBestPowers: (
          asFiniteNumberArray(entry.exactCandidateJoinLastLowMemoryInitialCandidateBestPowers)
        ),
        lowMemoryInitialCandidateStartUsedMiB: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateStartUsedMiB)
        ),
        lowMemoryInitialCandidateStartNodeHeapMiB: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateStartNodeHeapMiB)
        ),
        lowMemoryInitialCandidateStartRssMiB: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateStartRssMiB)
        ),
        lowMemoryInitialCandidateBeforeVisitUsedMiB: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitUsedMiB)
        ),
        lowMemoryInitialCandidateBeforeVisitNodeHeapMiB: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitNodeHeapMiB)
        ),
        lowMemoryInitialCandidateBeforeVisitRssMiB: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitRssMiB)
        ),
        lowMemoryInitialCandidateEvaluationBeforeUsedMiB: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeUsedMiB)
        ),
        lowMemoryInitialCandidateEvaluationAfterUsedMiB: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterUsedMiB)
        ),
        lowMemoryInitialCandidateEvaluationBeforeNodeHeapMiB: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeNodeHeapMiB)
        ),
        lowMemoryInitialCandidateEvaluationAfterNodeHeapMiB: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterNodeHeapMiB)
        ),
        lowMemoryInitialCandidateEvaluationBeforeRssMiB: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeRssMiB)
        ),
        lowMemoryInitialCandidateEvaluationAfterRssMiB: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterRssMiB)
        ),
        lowMemoryInitialCandidateAbortUsedMiB: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateAbortUsedMiB)
        ),
        lowMemoryInitialCandidateAbortLimitMiB: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateAbortLimitMiB)
        ),
        lowMemoryInitialCandidateAbortHeadroomMiB: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateAbortHeadroomMiB)
        ),
        lowMemoryInitialCandidateAbortNodeHeapMiB: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateAbortNodeHeapMiB)
        ),
        lowMemoryInitialCandidateAbortRssMiB: (
          asFiniteNumber(entry.exactCandidateJoinLastLowMemoryInitialCandidateAbortRssMiB)
        ),
        anchorFrontierProofTriggerCount: asFiniteNumber(entry.exactCandidateJoinAnchorFrontierProofTriggerCountDelta),
        anchorFrontierProofCompletedCount: (
          asFiniteNumber(entry.exactCandidateJoinAnchorFrontierProofCompletedCountDelta)
        ),
        smallGapSolveRetryCount: asFiniteNumber(entry.exactCandidateJoinSmallGapSolveRetryCountDelta),
        smallGapSolveRetryTimeboxCount: asFiniteNumber(entry.exactCandidateJoinSmallGapSolveRetryTimeboxCountDelta),
        eventRootFrontierProbeCallCount: asFiniteNumber(entry.eventRootFrontierProbeCallCountDelta),
        eventRootFrontierProbeProvedCount: asFiniteNumber(entry.eventRootFrontierProbeProvedCountDelta),
        eventRootFrontierProbePrunedCount: asFiniteNumber(entry.eventRootFrontierProbePrunedCountDelta),
        eventRootFrontierProbeUpperImprovementCount: (
          asFiniteNumber(entry.eventRootFrontierProbeUpperImprovementCountDelta)
        ),
        eventRootFrontierProbeTimeboxCount: asFiniteNumber(entry.eventRootFrontierProbeTimeboxCountDelta),
        eventRootFrontierProbeSkipCount: asFiniteNumber(entry.eventRootFrontierProbeSkipCountDelta),
        eventRootFrontierProbeElapsedMs: asFiniteNumber(entry.eventRootFrontierProbeElapsedMsDelta),
        eventRootFrontierProbeLastReason: entry.eventRootFrontierProbeLastReason ?? null,
        eventRootFrontierProbeLastStatus: entry.eventRootFrontierProbeLastStatus ?? null,
        eventRootFrontierProbeLastUpperBefore: asFiniteNumber(entry.eventRootFrontierProbeLastUpperBefore),
        eventRootFrontierProbeLastUpperAfter: asFiniteNumber(entry.eventRootFrontierProbeLastUpperAfter),
        eventRootFrontierProbeLastResidualGap: asFiniteNumber(entry.eventRootFrontierProbeLastResidualGap),
        eventRootFrontierProbeLastPeakHeapMiB: asFiniteNumber(entry.eventRootFrontierProbeLastPeakHeapMiB),
      },
      sameCoarse: {
        siblingBlocked: entry.sameCoarseSiblingBlocked ?? null,
        siblingBlockedStagedExtension: entry.sameCoarseSiblingBlockedStagedExtension ?? null,
        frontierRetryCandidate: entry.sameCoarseFrontierRetryCandidate ?? null,
        frontierRetryTargetUpperBound: entry.sameCoarseFrontierRetryTargetUpperBound ?? null,
        frontierRetryRootUpperBound: entry.sameCoarseFrontierRetryRootUpperBound ?? null,
        frontierRetryRootDelta: entry.sameCoarseFrontierRetryRootDelta ?? null,
        frontierProofTargetUpperBound: entry.sameCoarseFrontierProofTargetUpperBound ?? null,
        frontierProofTargetRootDelta: entry.sameCoarseFrontierProofTargetRootDelta ?? null,
      },
    };
  });
}

function buildProofLedgerSummary(
  proofLedger: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const readNumber = (entry: Record<string, unknown>, key: string): number | null => asFiniteNumber(entry[key]);
  const isUnclosedEntry = (entry: Record<string, unknown>): boolean => {
    const status = typeof entry.status === "string" ? entry.status : "";
    return (
      status.includes("bounded")
      || status.includes("timeout")
      || status.includes("unproved")
      || entry.exactJoinAbortReason !== null && entry.exactJoinAbortReason !== undefined
      || entry.rememberedUnclosedUpperBound !== null && entry.rememberedUnclosedUpperBound !== undefined
    );
  };
  const topBy = (
    key: string,
    entries: Array<Record<string, unknown>> = proofLedger,
  ): Array<Record<string, unknown>> => (
    entries
      .filter((entry) => {
        const value = readNumber(entry, key);
        return value !== null && value > 0;
      })
      .sort((left, right) => (readNumber(right, key) ?? 0) - (readNumber(left, key) ?? 0))
      .slice(0, 10)
  );
  const topByNestedNumber = (
    containerKey: string,
    valueKey: string,
  ): Array<Record<string, unknown>> => (
    proofLedger
      .filter((entry) => {
        const container = entry[containerKey];
        if (!container || typeof container !== "object" || Array.isArray(container)) {
          return false;
        }
        const value = asFiniteNumber((container as Record<string, unknown>)[valueKey]);
        return value !== null && value > 0;
      })
      .sort((left, right) => {
        const leftContainer = left[containerKey] as Record<string, unknown>;
        const rightContainer = right[containerKey] as Record<string, unknown>;
        return (asFiniteNumber(rightContainer[valueKey]) ?? 0) - (asFiniteNumber(leftContainer[valueKey]) ?? 0);
      })
      .slice(0, 10)
  );
  const countByString = (key: string): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const entry of proofLedger) {
      const value = entry[key];
      if (typeof value === "string" && value.length > 0) {
        counts[value] = (counts[value] ?? 0) + 1;
      }
    }
    return counts;
  };
  const guardSkipReasonCounts: Record<string, number> = {};
  let prefixSeedNoHitLocalTimeoutCount = 0;
  for (const entry of proofLedger) {
    const optionalProbeDeltas = entry.optionalProbeDeltas;
    if (!optionalProbeDeltas || typeof optionalProbeDeltas !== "object" || Array.isArray(optionalProbeDeltas)) {
      continue;
    }
    prefixSeedNoHitLocalTimeoutCount += (
      asFiniteNumber((optionalProbeDeltas as Record<string, unknown>).exactJoinPrefixSeedNoHitLocalTimeoutCount)
      ?? 0
    );
    const reasonCounts = asRecordNumberMap(
      (optionalProbeDeltas as Record<string, unknown>).exactJoinPrefixSeedGuardSkipReasonCounts,
    );
    if (!reasonCounts) {
      continue;
    }
    for (const [reason, count] of Object.entries(reasonCounts)) {
      guardSkipReasonCounts[reason] = (guardSkipReasonCounts[reason] ?? 0) + count;
    }
  }
  const coarseGroups = new Map<string, Record<string, unknown>>();
  for (const entry of proofLedger) {
    const coarseKey = typeof entry.coarseKey === "string" ? entry.coarseKey : "unknown";
    let group = coarseGroups.get(coarseKey);
    if (!group) {
      group = {
        coarseKey,
        count: 0,
        maxGap: null,
        maxElapsedMs: null,
        maxPeakUsedHeapMiB: null,
        abortReasonCounts: {},
      };
      coarseGroups.set(coarseKey, group);
    }
    group.count = (asFiniteNumber(group.count) ?? 0) + 1;
    const gap = asFiniteNumber(entry.gap);
    if (gap !== null) {
      group.maxGap = Math.max(asFiniteNumber(group.maxGap) ?? Number.NEGATIVE_INFINITY, gap);
    }
    const elapsedMs = asFiniteNumber(entry.elapsedMs);
    if (elapsedMs !== null) {
      group.maxElapsedMs = Math.max(asFiniteNumber(group.maxElapsedMs) ?? Number.NEGATIVE_INFINITY, elapsedMs);
    }
    const phaseMemoryMiB = entry.phaseMemoryMiB;
    const peakUsedHeapMiB = phaseMemoryMiB && typeof phaseMemoryMiB === "object" && !Array.isArray(phaseMemoryMiB)
      ? asFiniteNumber((phaseMemoryMiB as Record<string, unknown>).peak)
      : null;
    if (peakUsedHeapMiB !== null) {
      group.maxPeakUsedHeapMiB = Math.max(
        asFiniteNumber(group.maxPeakUsedHeapMiB) ?? Number.NEGATIVE_INFINITY,
        peakUsedHeapMiB,
      );
    }
    if (typeof entry.exactJoinAbortReason === "string") {
      const abortReasonCounts = group.abortReasonCounts as Record<string, number>;
      abortReasonCounts[entry.exactJoinAbortReason] = (abortReasonCounts[entry.exactJoinAbortReason] ?? 0) + 1;
    }
  }
  return {
    entryCount: proofLedger.length,
    topUnclosedByGap: topBy("gap", proofLedger.filter(isUnclosedEntry)),
    topByElapsedMs: topBy("elapsedMs"),
    topByMemorySpike: topByNestedNumber("phaseMemoryMiB", "peak"),
    abortReasonCounts: countByString("exactJoinAbortReason"),
    prefixSeedNoHitLocalTimeoutCount,
    prefixSeedGuardSkipReasonCounts: guardSkipReasonCounts,
    coarseGroups: [...coarseGroups.values()]
      .sort((left, right) => (asFiniteNumber(right.maxGap) ?? 0) - (asFiniteNumber(left.maxGap) ?? 0)),
  };
}

function buildBoundedFrontierGroups(
  configurationTrace: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const groups = new Map<string, {
    bandKey: unknown;
    attribute: unknown;
    entries: Array<Record<string, unknown>>;
    maxRootUpperBound: number | null;
    maxActiveTightUpperBound: number | null;
    maxRememberedUnclosedUpperBound: number | null;
    maxGap: number | null;
    maxElapsedMs: number | null;
    maxPeakUsedHeapMiB: number | null;
  }>();
  const updateMax = (current: number | null, value: number | null): number | null => (
    value === null ? current : Math.max(current ?? Number.NEGATIVE_INFINITY, value)
  );

  for (const entry of configurationTrace) {
    const status = String(entry.status ?? "");
    const isBoundedEntry = (
      status.includes("bounded")
      || status.includes("unproved")
      || entry.exactCandidateJoinAbortReason !== null && entry.exactCandidateJoinAbortReason !== undefined
    );
    if (!isBoundedEntry) {
      continue;
    }
    const bandKey = entry.bandKey;
    const attribute = entry.attribute;
    if (typeof bandKey !== "string" || typeof attribute !== "string") {
      continue;
    }
    const key = `${bandKey}/${attribute}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        bandKey,
        attribute,
        entries: [],
        maxRootUpperBound: null,
        maxActiveTightUpperBound: null,
        maxRememberedUnclosedUpperBound: null,
        maxGap: null,
        maxElapsedMs: null,
        maxPeakUsedHeapMiB: null,
      };
      groups.set(key, group);
    }

    const rootUpperBound = asFiniteNumber(entry.basicSkillAwareRootUpperBound)
      ?? asFiniteNumber(entry.observedRootUpperBound)
      ?? asFiniteNumber(entry.rootScoreUpperBound);
    const activeTightUpperBound = asFiniteNumber(entry.activeTightUpperBound);
    const rememberedUnclosedUpperBound = asFiniteNumber(entry.rememberedUnclosedUpperBound);
    const bestScore = asFiniteNumber(entry.bestScore) ?? asFiniteNumber(entry.initialBestScore);
    const effectiveFrontierUpperBound = rememberedUnclosedUpperBound
      ?? activeTightUpperBound
      ?? rootUpperBound;
    const gap = bestScore !== null && effectiveFrontierUpperBound !== null
      ? Math.max(0, effectiveFrontierUpperBound - bestScore)
      : null;
    const elapsedMs = asFiniteNumber(entry.elapsedMs);
    const peakUsedHeapMiB = asFiniteNumber(entry.peakUsedHeapMiB);
    group.maxRootUpperBound = updateMax(group.maxRootUpperBound, rootUpperBound);
    group.maxActiveTightUpperBound = updateMax(group.maxActiveTightUpperBound, activeTightUpperBound);
    group.maxRememberedUnclosedUpperBound = updateMax(
      group.maxRememberedUnclosedUpperBound,
      rememberedUnclosedUpperBound,
    );
    group.maxGap = updateMax(group.maxGap, gap);
    group.maxElapsedMs = updateMax(group.maxElapsedMs, elapsedMs);
    group.maxPeakUsedHeapMiB = updateMax(group.maxPeakUsedHeapMiB, peakUsedHeapMiB);
    group.entries.push({
      configurationIndex: entry.configurationIndex,
      parameter: entry.parameter,
      status,
      rootUpperBound,
      activeTightUpperBound,
      rememberedUnclosedUpperBound,
      effectiveFrontierUpperBound,
      gap,
      abortReason: entry.exactCandidateJoinAbortReason ?? null,
      abortSlotIndex: entry.exactCandidateJoinAbortSlotIndex ?? null,
      abortCandidateSoftLimit: entry.exactCandidateJoinAbortCandidateSoftLimit ?? null,
      candidateCountsBySlot: entry.exactCandidateJoinLastCandidateCountsBySlot ?? null,
      anchorFrontierProofSkipReason: entry.exactCandidateJoinLastAnchorFrontierProofSkipReason ?? null,
      anchorFrontierProofHighPairRecordUpperCount: (
        entry.exactCandidateJoinLastAnchorFrontierProofHighPairRecordUpperCount ?? null
      ),
      anchorFrontierCheapUpperProcessedAnchorCount: (
        entry.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedAnchorCount ?? null
      ),
      anchorFrontierCheapUpperResidualGap: (
        entry.exactCandidateJoinLastAnchorFrontierCheapUpperResidualGap ?? null
      ),
      anchorFrontierCheapUpperElapsedMs: (
        entry.exactCandidateJoinLastAnchorFrontierCheapUpperElapsedMs ?? null
      ),
      anchorFrontierCheapUpperSplitAttemptCount: (
        entry.exactCandidateJoinLastAnchorFrontierCheapUpperSplitAttemptCount ?? null
      ),
      anchorFrontierCheapUpperSplitStateCount: (
        entry.exactCandidateJoinLastAnchorFrontierCheapUpperSplitStateCount ?? null
      ),
      anchorFrontierCheapUpperSplitAbortReason: (
        entry.exactCandidateJoinLastAnchorFrontierCheapUpperSplitAbortReason ?? null
      ),
      anchorFrontierCheapUpperUnseenRefineAttemptCount: (
        entry.exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineAttemptCount ?? null
      ),
      anchorFrontierCheapUpperUnseenRefineCandidateCount: (
        entry.exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineCandidateCount ?? null
      ),
      anchorFrontierCheapUpperUnseenRefineImprovementCount: (
        entry.exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineImprovementCount ?? null
      ),
      anchorFrontierCheapUpperUnseenRefineAbortReason: (
        entry.exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineAbortReason ?? null
      ),
      lowMemoryInitialCandidateScoreCacheClearCount: (
        entry.exactCandidateJoinLowMemoryInitialCandidateScoreCacheClearCountDelta ?? null
      ),
      lowMemoryInitialCandidateScoreCacheClearInterval: (
        entry.exactCandidateJoinLastLowMemoryInitialCandidateScoreCacheClearInterval ?? null
      ),
      lowMemoryInitialCandidateVisitedNodeCount: (
        entry.exactCandidateJoinLastLowMemoryInitialCandidateVisitedNodeCount ?? null
      ),
      lowMemoryInitialCandidateEvaluatedTeamCount: (
        entry.exactCandidateJoinLastLowMemoryInitialCandidateEvaluatedTeamCount ?? null
      ),
      lowMemoryInitialCandidateBestScore: (
        entry.exactCandidateJoinLastLowMemoryInitialCandidateBestScore ?? null
      ),
      lowMemoryInitialCandidateAbortUsedMiB: (
        entry.exactCandidateJoinLastLowMemoryInitialCandidateAbortUsedMiB ?? null
      ),
      lowMemoryInitialCandidateAbortLimitMiB: (
        entry.exactCandidateJoinLastLowMemoryInitialCandidateAbortLimitMiB ?? null
      ),
      lowMemoryInitialCandidateAbortHeadroomMiB: (
        entry.exactCandidateJoinLastLowMemoryInitialCandidateAbortHeadroomMiB ?? null
      ),
      lowMemoryInitialCandidateAbortNodeHeapMiB: (
        entry.exactCandidateJoinLastLowMemoryInitialCandidateAbortNodeHeapMiB ?? null
      ),
      lowMemoryInitialCandidateAbortRssMiB: (
        entry.exactCandidateJoinLastLowMemoryInitialCandidateAbortRssMiB ?? null
      ),
      anchorFrontierImprovementProbeProcessedAnchorCount: (
        entry.exactCandidateJoinLastAnchorFrontierImprovementProbeProcessedAnchorCount ?? null
      ),
      anchorFrontierImprovementProbeElapsedMs: (
        entry.exactCandidateJoinLastAnchorFrontierImprovementProbeElapsedMs ?? null
      ),
      anchorFrontierImprovementProbeScore: (
        entry.exactCandidateJoinLastAnchorFrontierImprovementProbeScore ?? null
      ),
      anchorFrontierProofProcessedAnchorCount: (
        entry.exactCandidateJoinLastAnchorFrontierProofProcessedAnchorCount ?? null
      ),
      anchorFrontierProofResidualGap: entry.exactCandidateJoinLastAnchorFrontierProofResidualGap ?? null,
      anchorFrontierProofElapsedMs: entry.exactCandidateJoinLastAnchorFrontierProofElapsedMs ?? null,
      elapsedMs,
      peakUsedHeapMiB,
      sameCoarseSiblingBlocked: entry.sameCoarseSiblingBlocked ?? null,
      sameCoarseSiblingBlockedStagedExtension: entry.sameCoarseSiblingBlockedStagedExtension ?? null,
      sameCoarseFrontierRetryCandidate: entry.sameCoarseFrontierRetryCandidate ?? null,
      sameCoarseFrontierRetryTargetUpperBound: entry.sameCoarseFrontierRetryTargetUpperBound ?? null,
      sameCoarseFrontierRetryRootUpperBound: entry.sameCoarseFrontierRetryRootUpperBound ?? null,
      sameCoarseFrontierRetryRootDelta: entry.sameCoarseFrontierRetryRootDelta ?? null,
      sameCoarseFrontierProofTargetUpperBound: entry.sameCoarseFrontierProofTargetUpperBound ?? null,
      sameCoarseFrontierProofTargetRootDelta: entry.sameCoarseFrontierProofTargetRootDelta ?? null,
    });
  }

  return [...groups.entries()]
    .map(([coarseKey, group]) => ({
      coarseKey,
      bandKey: group.bandKey,
      attribute: group.attribute,
      maxRootUpperBound: group.maxRootUpperBound,
      maxActiveTightUpperBound: group.maxActiveTightUpperBound,
      maxRememberedUnclosedUpperBound: group.maxRememberedUnclosedUpperBound,
      maxGap: group.maxGap,
      maxElapsedMs: group.maxElapsedMs,
      maxPeakUsedHeapMiB: group.maxPeakUsedHeapMiB,
      entries: group.entries.sort((left, right) => (
        (asFiniteNumber(right.gap) ?? -1) - (asFiniteNumber(left.gap) ?? -1)
      )),
    }))
    .sort((left, right) => (
      (asFiniteNumber(right.maxGap) ?? -1) - (asFiniteNumber(left.maxGap) ?? -1)
    ));
}

type RuntimeMemoryPerformance = Performance & {
  memory?: {
    usedJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  };
};

type RuntimeNodeProcess = {
  memoryUsage?: () => {
    heapUsed?: number;
    rss?: number;
    external?: number;
    arrayBuffers?: number;
  };
};

type RuntimeMemoryProfilingKey =
  | "lastNodeHeapUsedMiB"
  | "peakNodeHeapUsedMiB"
  | "lastNodeRssMiB"
  | "peakNodeRssMiB"
  | "lastNodeExternalMiB"
  | "peakNodeExternalMiB"
  | "lastNodeArrayBuffersMiB"
  | "peakNodeArrayBuffersMiB"
  | "lastMemoryGuardUsedMiB"
  | "peakMemoryGuardUsedMiB";

export function searchBandoriBestMedleyTeams(input: BandoriMedleyTeamSearchInput): BandoriMedleyTeamSearchResponse {
  const startedAt = performance.now();
  const server = input.server ?? 3;
  const resultLimit = clamp(Math.trunc(input.resultLimit ?? 1), 1, 20);
  const perfectRate = clamp(input.perfectRate ?? 1, 0, 1);
  const maxSearchDurationMs = Math.max(1000, Math.trunc(input.maxSearchDurationMs ?? 9500));
  const hasEventBonus = Boolean(input.eventBonus);

  // Runtime options only select already-defined search paths. Exact proof status is decided
  // later from actual exhaustion, timeout, and whether auto coarse filtering narrowed the space.
  const optimization = input.optimization ?? {};
  const requestedEnableAnchorSlotUpper = optimization.enableAnchorSlotUpper === true;
  const captureUpperWitness = optimization.captureUpperWitness === true;
  const captureCapacityUpperWitness = optimization.captureCapacityUpperWitness === true;
  const requestedEnableOpportunityCostUpper = optimization.enableOpportunityCostUpper === true;
  const requestedEnableTeamSharedCoefficientUpper = optimization.enableTeamSharedCoefficientUpper === true;
  const enableSharedPowerSkillUpper = optimization.enableSharedPowerSkillUpper === true;
  const debugConfigurationTrace = optimization.debugConfigurationTrace === true;
  const debugExactCandidateJoinMemoryAttribution = (
    optimization.debugExactCandidateJoinMemoryAttribution === true
  );
  const enableExperimentalStagedCandidateExtension = (
    optimization.enableExperimentalStagedCandidateExtension === true
  );
  const requestedEnableTrailingSameCoarseDfsOnly = optimization.enableTrailingSameCoarseDfsOnly === true;
  const disableDominatedRootSkip = optimization.disableDominatedRootSkip === true;
  const disableSameCoarseTightRootSkip = optimization.disableSameCoarseTightRootSkip === true;
  const enableSameCoarseLowRootFirstProofOrder = optimization.enableSameCoarseLowRootFirstProofOrder === true;
  const disableAllScopeExactJoinPreSkip = optimization.disableAllScopeExactJoinPreSkip === true;
  const enableAllScopeExactJoinPreSkip = (
    optimization.enableAllScopeExactJoinPreSkip === true
    && !disableAllScopeExactJoinPreSkip
  );
  const disableExactCandidateJoin = optimization.disableExactCandidateJoin === true;
  const disableNearDeadlineRootSkip = optimization.disableNearDeadlineRootSkip === true;
  const disableSkipDfsAfterUnprovedExactCandidateJoin =
    optimization.disableSkipDfsAfterUnprovedExactCandidateJoin === true;
  const enableEventRootFrontierProbe = optimization.enableEventRootFrontierProbe === true;
  const parsedEventRootFrontierProbeTimeboxMs = optimization.eventRootFrontierProbeTimeboxMs !== undefined
    ? Math.trunc(optimization.eventRootFrontierProbeTimeboxMs)
    : Number.NaN;
  const eventRootFrontierProbeTimeboxMs = Number.isFinite(parsedEventRootFrontierProbeTimeboxMs)
    ? Math.max(0, parsedEventRootFrontierProbeTimeboxMs)
    : MEDLEY_EVENT_ROOT_FRONTIER_PROBE_TIMEBOX_MS;
  const parsedEventRootFrontierProbeCandidateSoftLimit =
    optimization.eventRootFrontierProbeCandidateSoftLimit !== undefined
      ? Math.trunc(optimization.eventRootFrontierProbeCandidateSoftLimit)
      : Number.NaN;
  const eventRootFrontierProbeCandidateSoftLimit = Number.isFinite(
    parsedEventRootFrontierProbeCandidateSoftLimit,
  )
    ? Math.max(1, parsedEventRootFrontierProbeCandidateSoftLimit)
    : MEDLEY_EVENT_ROOT_FRONTIER_PROBE_CANDIDATE_SOFT_LIMIT;
  const parsedEventRootFrontierProbeMinRemainingMs =
    optimization.eventRootFrontierProbeMinRemainingMs !== undefined
      ? Math.trunc(optimization.eventRootFrontierProbeMinRemainingMs)
      : Number.NaN;
  const eventRootFrontierProbeMinRemainingMs = Number.isFinite(parsedEventRootFrontierProbeMinRemainingMs)
    ? Math.max(0, parsedEventRootFrontierProbeMinRemainingMs)
    : MEDLEY_EVENT_ROOT_FRONTIER_PROBE_MIN_REMAINING_MS;
  const parsedEventRootFrontierProbeMinMemoryHeadroomMiB =
    optimization.eventRootFrontierProbeMinMemoryHeadroomMiB !== undefined
      ? Math.trunc(optimization.eventRootFrontierProbeMinMemoryHeadroomMiB)
      : Number.NaN;
  const eventRootFrontierProbeMinMemoryHeadroomMiB = Number.isFinite(
    parsedEventRootFrontierProbeMinMemoryHeadroomMiB,
  )
    ? Math.max(0, parsedEventRootFrontierProbeMinMemoryHeadroomMiB)
    : MEDLEY_EVENT_ROOT_FRONTIER_PROBE_MIN_MEMORY_HEADROOM_MIB;
  const parsedEventRootFrontierProbeAnchorProofMaxFrontierGap =
    optimization.eventRootFrontierProbeAnchorProofMaxFrontierGap !== undefined
      ? Math.trunc(optimization.eventRootFrontierProbeAnchorProofMaxFrontierGap)
      : Number.NaN;
  const eventRootFrontierProbeAnchorProofMaxFrontierGap = Number.isFinite(
    parsedEventRootFrontierProbeAnchorProofMaxFrontierGap,
  )
    ? Math.max(0, parsedEventRootFrontierProbeAnchorProofMaxFrontierGap)
    : null;
  const parsedEventRootFrontierProbeAnchorProofMinRemainingMs =
    optimization.eventRootFrontierProbeAnchorProofMinRemainingMs !== undefined
      ? Math.trunc(optimization.eventRootFrontierProbeAnchorProofMinRemainingMs)
      : Number.NaN;
  const eventRootFrontierProbeAnchorProofMinRemainingMs = Number.isFinite(
    parsedEventRootFrontierProbeAnchorProofMinRemainingMs,
  )
    ? Math.max(0, parsedEventRootFrontierProbeAnchorProofMinRemainingMs)
    : null;
  const parsedEventRootFrontierProbeAnchorCheapUpperTimeboxMs =
    optimization.eventRootFrontierProbeAnchorCheapUpperTimeboxMs !== undefined
      ? Math.trunc(optimization.eventRootFrontierProbeAnchorCheapUpperTimeboxMs)
      : Number.NaN;
  const eventRootFrontierProbeAnchorCheapUpperTimeboxMs = Number.isFinite(
    parsedEventRootFrontierProbeAnchorCheapUpperTimeboxMs,
  )
    ? Math.max(0, parsedEventRootFrontierProbeAnchorCheapUpperTimeboxMs)
    : null;
  const parsedEventRootFrontierProbeAnchorCheapUpperMaxAnchors =
    optimization.eventRootFrontierProbeAnchorCheapUpperMaxAnchors !== undefined
      ? Math.trunc(optimization.eventRootFrontierProbeAnchorCheapUpperMaxAnchors)
      : Number.NaN;
  const eventRootFrontierProbeAnchorCheapUpperMaxAnchors = Number.isFinite(
    parsedEventRootFrontierProbeAnchorCheapUpperMaxAnchors,
  )
    ? Math.max(1, parsedEventRootFrontierProbeAnchorCheapUpperMaxAnchors)
    : null;
  const eventRootFrontierProbeAnchorCheapUpperRefineUnseen =
    optimization.eventRootFrontierProbeAnchorCheapUpperRefineUnseen === true;
  const parsedEventRootFrontierProbeAnchorCheapUpperUnseenRefineMaxGeneratedCandidates =
    optimization.eventRootFrontierProbeAnchorCheapUpperUnseenRefineMaxGeneratedCandidates !== undefined
      ? Math.trunc(optimization.eventRootFrontierProbeAnchorCheapUpperUnseenRefineMaxGeneratedCandidates)
      : Number.NaN;
  const eventRootFrontierProbeAnchorCheapUpperUnseenRefineMaxGeneratedCandidates = Number.isFinite(
    parsedEventRootFrontierProbeAnchorCheapUpperUnseenRefineMaxGeneratedCandidates,
  )
    ? Math.max(1, parsedEventRootFrontierProbeAnchorCheapUpperUnseenRefineMaxGeneratedCandidates)
    : null;
  const parsedAnchorCandidateLimit = optimization.anchorCandidateLimit !== undefined
    ? Math.trunc(optimization.anchorCandidateLimit)
    : Number.NaN;
  const anchorCandidateLimit = Number.isFinite(parsedAnchorCandidateLimit)
    ? Math.max(1, parsedAnchorCandidateLimit)
    : MEDLEY_DEFAULT_ANCHOR_CANDIDATE_LIMIT;
  const parsedOpportunityAnchorLimit = optimization.opportunityAnchorLimit !== undefined
    ? Math.trunc(optimization.opportunityAnchorLimit)
    : Number.NaN;
  const opportunityAnchorLimit = Number.isFinite(parsedOpportunityAnchorLimit)
    ? clamp(parsedOpportunityAnchorLimit, 1, MEDLEY_MAX_OPPORTUNITY_ANCHOR_LIMIT)
    : MEDLEY_DEFAULT_OPPORTUNITY_ANCHOR_LIMIT;
  const parsedExactCandidateSoftLimit = optimization.exactCandidateSoftLimit !== undefined
    ? Math.trunc(optimization.exactCandidateSoftLimit)
    : Number.NaN;
  let exactCandidateSoftLimit = Number.isFinite(parsedExactCandidateSoftLimit)
    ? Math.max(1, parsedExactCandidateSoftLimit)
    : MEDLEY_EXACT_CANDIDATE_JOIN_DEFAULT_CANDIDATE_SOFT_LIMIT;
  const parsedExactNodeSoftLimit = optimization.exactNodeSoftLimit !== undefined
    ? Math.trunc(optimization.exactNodeSoftLimit)
    : Number.NaN;
  const exactNodeSoftLimit = Number.isFinite(parsedExactNodeSoftLimit)
    ? Math.max(1, parsedExactNodeSoftLimit)
    : MEDLEY_EXACT_CANDIDATE_JOIN_DEFAULT_NODE_SOFT_LIMIT;
  const parsedConflictExactNodeLimit = optimization.conflictExactNodeLimit !== undefined
    ? Math.trunc(optimization.conflictExactNodeLimit)
    : Number.NaN;
  const parsedConflictSlotSolveNodeLimit = optimization.conflictSlotSolveNodeLimit !== undefined
    ? Math.trunc(optimization.conflictSlotSolveNodeLimit)
    : Number.NaN;
  const conflictSlotSolveNodeLimit = Number.isFinite(parsedConflictSlotSolveNodeLimit)
    ? Math.max(1, parsedConflictSlotSolveNodeLimit)
    : MEDLEY_CONFLICT_SLOT_SOLVE_DEFAULT_NODE_LIMIT;
  const enableExactJoinPrefixSeed = optimization.enableExactJoinPrefixSeed === true;
  const enableLowMemoryHighPairScan = optimization.enableLowMemoryHighPairScan === true;
  const parsedLowMemoryHighPairScanMinRecordCount = (
    optimization.lowMemoryHighPairScanMinRecordCount !== undefined
      ? Math.trunc(optimization.lowMemoryHighPairScanMinRecordCount)
      : Number.NaN
  );
  const lowMemoryHighPairScanMinRecordCount = enableLowMemoryHighPairScan
    ? Number.isFinite(parsedLowMemoryHighPairScanMinRecordCount)
      ? Math.max(1, parsedLowMemoryHighPairScanMinRecordCount)
      : MEDLEY_EXACT_CANDIDATE_JOIN_LOW_MEMORY_HIGH_PAIR_SCAN_MIN_RECORD_COUNT
    : null;
  const enableLowMemoryHighPairPrefixUpper = optimization.enableLowMemoryHighPairPrefixUpper === true;
  const parsedLowMemoryHighPairPrefixRecordLimit = (
    optimization.lowMemoryHighPairPrefixRecordLimit !== undefined
      ? Math.trunc(optimization.lowMemoryHighPairPrefixRecordLimit)
      : Number.NaN
  );
  const lowMemoryHighPairPrefixRecordLimit = enableLowMemoryHighPairPrefixUpper
    ? Number.isFinite(parsedLowMemoryHighPairPrefixRecordLimit)
      ? Math.max(1, parsedLowMemoryHighPairPrefixRecordLimit)
      : MEDLEY_EXACT_CANDIDATE_JOIN_LOW_MEMORY_HIGH_PAIR_PREFIX_RECORD_LIMIT
    : null;
  const disableLowMemoryInitialCandidateSync = optimization.disableLowMemoryInitialCandidateSync === true;
  const lowMemoryInitialCandidateSyncLocalAbortOnly = (
    optimization.lowMemoryInitialCandidateSyncLocalAbortOnly === true
  );
  const lowMemoryInitialCandidateSyncLightUpper = optimization.lowMemoryInitialCandidateSyncLightUpper === true;
  const parsedLowMemoryInitialCandidateSyncTimeboxMs = (
    optimization.lowMemoryInitialCandidateSyncTimeboxMs !== undefined
      ? Math.trunc(optimization.lowMemoryInitialCandidateSyncTimeboxMs)
      : Number.NaN
  );
  const lowMemoryInitialCandidateSyncTimeboxMs = Number.isFinite(parsedLowMemoryInitialCandidateSyncTimeboxMs)
    ? Math.max(0, parsedLowMemoryInitialCandidateSyncTimeboxMs)
    : MEDLEY_LOW_MEMORY_INITIAL_CANDIDATE_SYNC_TIMEBOX_MS;
  const parsedLowMemoryInitialCandidateSyncMaxSameCoarseProofElapsedMs = (
    optimization.lowMemoryInitialCandidateSyncMaxSameCoarseProofElapsedMs !== undefined
      ? Math.trunc(optimization.lowMemoryInitialCandidateSyncMaxSameCoarseProofElapsedMs)
      : Number.NaN
  );
  const lowMemoryInitialCandidateSyncMaxSameCoarseProofElapsedMs = Number.isFinite(
    parsedLowMemoryInitialCandidateSyncMaxSameCoarseProofElapsedMs,
  )
    ? Math.max(0, parsedLowMemoryInitialCandidateSyncMaxSameCoarseProofElapsedMs)
    : MEDLEY_LOW_MEMORY_INITIAL_CANDIDATE_SYNC_MAX_SAME_COARSE_PROOF_ELAPSED_MS;
  const parsedLowMemoryInitialCandidateSyncMinMemoryHeadroomMiB = (
    optimization.lowMemoryInitialCandidateSyncMinMemoryHeadroomMiB !== undefined
      ? Math.trunc(optimization.lowMemoryInitialCandidateSyncMinMemoryHeadroomMiB)
      : Number.NaN
  );
  const lowMemoryInitialCandidateSyncMinMemoryHeadroomMiB = Number.isFinite(
    parsedLowMemoryInitialCandidateSyncMinMemoryHeadroomMiB,
  )
    ? Math.max(0, parsedLowMemoryInitialCandidateSyncMinMemoryHeadroomMiB)
    : MEDLEY_LOW_MEMORY_INITIAL_CANDIDATE_SYNC_MIN_MEMORY_HEADROOM_MIB;
  const parsedLowMemoryInitialCandidateSyncMaxSlotCardCount = (
    optimization.lowMemoryInitialCandidateSyncMaxSlotCardCount !== undefined
      ? Math.trunc(optimization.lowMemoryInitialCandidateSyncMaxSlotCardCount)
      : Number.NaN
  );
  const lowMemoryInitialCandidateSyncMaxSlotCardCount = Number.isFinite(
    parsedLowMemoryInitialCandidateSyncMaxSlotCardCount,
  )
    ? Math.max(0, parsedLowMemoryInitialCandidateSyncMaxSlotCardCount)
    : MEDLEY_LOW_MEMORY_INITIAL_CANDIDATE_SYNC_MAX_SLOT_CARD_COUNT;
  const parsedLowMemoryInitialCandidateSyncScoreCacheClearInterval = (
    optimization.lowMemoryInitialCandidateSyncScoreCacheClearInterval !== undefined
      ? Math.trunc(optimization.lowMemoryInitialCandidateSyncScoreCacheClearInterval)
      : Number.NaN
  );
  const lowMemoryInitialCandidateSyncScoreCacheClearInterval = Number.isFinite(
    parsedLowMemoryInitialCandidateSyncScoreCacheClearInterval,
  )
    ? Math.max(1, parsedLowMemoryInitialCandidateSyncScoreCacheClearInterval)
    : null;
  const lowMemoryInitialCandidateSyncDirectCandidate = (
    optimization.lowMemoryInitialCandidateSyncDirectCandidate === true
  );
  const enableLowMemoryInitialCandidateSyncGcProbe = (
    optimization.enableLowMemoryInitialCandidateSyncGcProbe === true
  );
  const exactJoinPrefixSeedForceNoop = optimization.exactJoinPrefixSeedForceNoop === true;
  const exactJoinPrefixSeedGuardOnly = optimization.exactJoinPrefixSeedGuardOnly === true;
  const parsedExactJoinPrefixSeedTimeboxMs = optimization.exactJoinPrefixSeedTimeboxMs !== undefined
    ? Math.trunc(optimization.exactJoinPrefixSeedTimeboxMs)
    : Number.NaN;
  const exactJoinPrefixSeedTimeboxMs = Number.isFinite(parsedExactJoinPrefixSeedTimeboxMs)
    ? Math.max(0, parsedExactJoinPrefixSeedTimeboxMs)
    : MEDLEY_EXACT_JOIN_PREFIX_SEED_DEFAULT_TIMEBOX_MS;
  const parsedExactJoinPrefixSeedMaxSmallestCandidateCount = (
    optimization.exactJoinPrefixSeedMaxSmallestCandidateCount !== undefined
      ? Math.trunc(optimization.exactJoinPrefixSeedMaxSmallestCandidateCount)
      : Number.NaN
  );
  const exactJoinPrefixSeedMaxSmallestCandidateCount = (
    Number.isFinite(parsedExactJoinPrefixSeedMaxSmallestCandidateCount)
      ? Math.max(1, parsedExactJoinPrefixSeedMaxSmallestCandidateCount)
      : MEDLEY_EXACT_JOIN_PREFIX_SEED_DEFAULT_MAX_SMALLEST_CANDIDATE_COUNT
  );
  const exactJoinPrefixSeedMinCandidateCounts: [number, number, number] = (() => {
    const value = optimization.exactJoinPrefixSeedMinCandidateCounts;
    if (!Array.isArray(value) || value.length !== MEDLEY_TEAM_COUNT) {
      return MEDLEY_EXACT_JOIN_PREFIX_SEED_DEFAULT_MIN_CANDIDATE_COUNTS;
    }
    const parsed = value.map((count) => Math.trunc(count));
    if (parsed.some((count) => !Number.isFinite(count))) {
      return MEDLEY_EXACT_JOIN_PREFIX_SEED_DEFAULT_MIN_CANDIDATE_COUNTS;
    }
    return [
      Math.max(0, parsed[0]),
      Math.max(0, parsed[1]),
      Math.max(0, parsed[2]),
    ];
  })();
  const parsedConfigurationSeedPassDurationMs = optimization.configurationSeedPassDurationMs !== undefined
    ? Math.trunc(optimization.configurationSeedPassDurationMs)
    : Number.NaN;
  const parsedSkipConfigurationSeedingWhenMemoryHeadroomBelowMiB = (
    optimization.skipConfigurationSeedingWhenMemoryHeadroomBelowMiB !== undefined
      ? Math.trunc(optimization.skipConfigurationSeedingWhenMemoryHeadroomBelowMiB)
      : Number.NaN
  );
  const skipConfigurationSeedingWhenMemoryHeadroomBelowMiB = Number.isFinite(
    parsedSkipConfigurationSeedingWhenMemoryHeadroomBelowMiB,
  )
    ? Math.max(0, parsedSkipConfigurationSeedingWhenMemoryHeadroomBelowMiB)
    : null;
  const parsedMemorySoftLimitMiB = optimization.memorySoftLimitMiB !== undefined
    ? Math.trunc(optimization.memorySoftLimitMiB)
    : Number.NaN;
  const memorySoftLimitMiB = Number.isFinite(parsedMemorySoftLimitMiB)
    ? Math.max(256, parsedMemorySoftLimitMiB)
    : null;
  const memorySoftLimitBytes = memorySoftLimitMiB !== null ? memorySoftLimitMiB * BYTES_PER_MIB : null;
  const deadlineAt = startedAt + maxSearchDurationMs;

  // Shared preprocessing mirrors single search: cards, area items, and event math are built by
  // shared helpers, while medley-specific code adds the three-slot combo carryover later.
  const songInputs = input.songs.slice(0, 3);
  const firstSlotInput = songInputs[0] ? createMedleySlotInput(input, songInputs[0]) : null;
  const calculatedCards = firstSlotInput ? buildCalculatedCards(firstSlotInput) : [];
  const hasDuplicateCardIds = new Set(calculatedCards.map((card) => card.cardId)).size !== calculatedCards.length;
  const toUpperBannedCardIds = (bannedCardIds: Set<number>): Set<number> => (
    hasDuplicateCardIds ? new Set<number>() : bannedCardIds
  );
  let slotBuildContexts: ReturnType<typeof buildMedleySlotBuildContexts> | null = null;
  const getSlotBuildContexts = (): ReturnType<typeof buildMedleySlotBuildContexts> => {
    if (!firstSlotInput) {
      return [];
    }
    if (!slotBuildContexts) {
      slotBuildContexts = buildMedleySlotBuildContexts(input, songInputs, calculatedCards, server);
    }
    return slotBuildContexts;
  };
  const rawConfigurations = firstSlotInput ? createAreaItemConfigurations(input.userAreaItems) : [];
  const prunedConfigurations = firstSlotInput
    ? pruneDominatedAreaItemConfigurations(rawConfigurations, calculatedCards, firstSlotInput, server)
    : [];
  const coarseFilter = input.coarseAreaItemFilter;
  const isLockedCoarseFilter = coarseFilter?.mode === "locked";
  const isAllCoarseFilter = coarseFilter?.mode === "all";
  const shouldAutoEnableExactCandidateJoin = (
    resultLimit === 1
    && maxSearchDurationMs >= 30000
    && calculatedCards.length > 250
    && (isLockedCoarseFilter || isAllCoarseFilter)
  );
  const shouldAutoEnableConflictExactBnb = (
    resultLimit === 1
    && maxSearchDurationMs >= 30000
    && calculatedCards.length <= 250
    && (isLockedCoarseFilter || isAllCoarseFilter)
  );
  const shouldAutoEnableSmallGapDfsFallback = (
    shouldAutoEnableExactCandidateJoin
    && isAllCoarseFilter
    && calculatedCards.length <= MEDLEY_SMALL_GAP_DFS_FALLBACK_MAX_CARD_COUNT
  );
  const enableAnchorSlotUpper = requestedEnableAnchorSlotUpper || shouldAutoEnableSmallGapDfsFallback;
  const enableOpportunityCostUpper = requestedEnableOpportunityCostUpper || shouldAutoEnableSmallGapDfsFallback;
  const enableTeamSharedCoefficientUpper = (
    requestedEnableTeamSharedCoefficientUpper || shouldAutoEnableSmallGapDfsFallback
  );
  const enableTrailingSameCoarseDfsOnly = (
    requestedEnableTrailingSameCoarseDfsOnly || shouldAutoEnableSmallGapDfsFallback
  );
  const shouldEnableOpportunityCostUpper = enableOpportunityCostUpper;
  const enableExactCandidateJoin = resultLimit === 1
    && !disableExactCandidateJoin
    && !hasDuplicateCardIds
    && (optimization.enableExactCandidateJoin === true || shouldAutoEnableExactCandidateJoin)
    && (
      calculatedCards.length <= 250
      || isLockedCoarseFilter
      || isAllCoarseFilter
    );
  if (
    !Number.isFinite(parsedExactCandidateSoftLimit)
    && shouldAutoEnableExactCandidateJoin
    && maxSearchDurationMs >= 60000
    && calculatedCards.length >= 900
  ) {
    exactCandidateSoftLimit = MEDLEY_EXACT_JOIN_AUTO_HIGH_CANDIDATE_SOFT_LIMIT;
  }
  const nodeAutoMemorySoftLimitBytes = (
    memorySoftLimitBytes === null
    && shouldAutoEnableExactCandidateJoin
    && maxSearchDurationMs >= 60000
    && calculatedCards.length >= 900
  )
    ? MEDLEY_NODE_AUTO_MEMORY_SOFT_LIMIT_MIB * BYTES_PER_MIB
    : null;
  const enableConflictExactBnb = !hasDuplicateCardIds
    && (optimization.enableConflictExactBnb === true || shouldAutoEnableConflictExactBnb)
    && resultLimit === 1
    && (
      calculatedCards.length <= 250
      || isLockedCoarseFilter
    );
  const conflictExactNodeLimit = Number.isFinite(parsedConflictExactNodeLimit)
    ? Math.max(1, parsedConflictExactNodeLimit)
    : shouldAutoEnableConflictExactBnb
      ? 200_000
      : MEDLEY_CONFLICT_EXACT_BNB_DEFAULT_NODE_LIMIT;
  const configurations = isLockedCoarseFilter
    ? prunedConfigurations.filter((configuration) => medleyConfigurationMatchesCoarseFilter(configuration, coarseFilter))
    : prunedConfigurations;

  // Profiling is intentionally verbose because medley proof failures are usually caused by a
  // specific upper-bound family staying loose, not by the final score calculation.
  const results: BandoriMedleyTeamSearchResult[] = [];
  const evaluatedCandidateTracker = createMedleyEvaluatedCandidateTracker();
  const observeEvaluatedMedleyResult = evaluatedCandidateTracker.observe;
  const profiling = createInitialMedleyProfilingStats(isLockedCoarseFilter ? configurations.length : 0);
  const configurationTrace: Array<Record<string, unknown>> | null = debugConfigurationTrace ? [] : null;
  if (configurationTrace) {
    profiling.configurationTrace = configurationTrace;
  }
  const exactJoinPrefixSeedDisabledCoarseKeys = new Set<string>();
  if (optimization.exactCandidateJoinDebugAnchorSlotIndex !== undefined) {
    profiling.exactCandidateJoinDebugAnchorSlotIndex = Math.trunc(optimization.exactCandidateJoinDebugAnchorSlotIndex);
  }
  const stats: BandoriMedleyTeamSearchStats = {
    candidateCardCount: calculatedCards.length,
    rawAreaItemConfigurationCount: rawConfigurations.length,
    areaItemConfigurationCount: configurations.length,
    prunedAreaItemConfigurationCount: rawConfigurations.length - configurations.length,
    enumeratedTeamCount: 0,
    evaluatedTeamCount: 0,
    prunedBranchCount: 0,
    elapsedMs: 0,
    isExhaustive: true,
    timedOut: false,
    memoryLimited: false,
    memorySoftLimitMiB,
    peakUsedHeapMiB: null,
    searchMode: "exact",
    observedScoreUpperBound: null,
    observedScoreUpperBoundGap: null,
    profiling,
  };
  const buildResponse = (responseStats: BandoriMedleyTeamSearchStats): BandoriMedleyTeamSearchResponse => {
    const maxScoreCandidate = evaluatedCandidateTracker.getMaxScoreCandidate(results[0] ?? null);
    return {
      results,
      maxScoreCandidate,
      evaluatedAverageTopCandidates: evaluatedCandidateTracker.getEvaluatedAverageTopCandidates(
        maxScoreCandidate ? [...results, maxScoreCandidate] : results,
      ),
      stats: responseStats,
    };
  };

  if (songInputs.length !== 3 || calculatedCards.length < 15) {
    return buildResponse({
        ...stats,
        elapsedMs: Math.round(performance.now() - startedAt),
    });
  }

  let visitedBranchCount = 0;
  let observedScoreUpperBound = Number.NEGATIVE_INFINITY;
  let activeConfigurationIndex: number | null = null;
  let activeConfigurationObservedScoreUpperBound = Number.NEGATIVE_INFINITY;
  let activeConfigurationObservedUpperBoundSource: MedleyObservedUpperBoundSource | null = null;
  let activeConfigurationObservedUpperBoundRemainingSlotCount: number | null = null;
  let activeConfigurationTightScoreUpperBound = Number.POSITIVE_INFINITY;
  let activeConfigurationTightUpperBoundSource: MedleyObservedUpperBoundSource | null = null;
  let activeConfigurationTightUpperBoundRemainingSlotCount: number | null = null;
  const closedConfigurationIndices = new Set<number>();
  const unclosedConfigurationUpperBounds = new Map<number, {
    upperBound: number;
    source: MedleyObservedUpperBoundSource;
    remainingSlotCount: number;
  }>();
  const exactCandidateJoinProofElapsedMsByCoarseKey = new Map<string, number>();
  let didLeaveUnclosedAreaItemConfiguration = false;
  let unclosedConfigurationUpperBoundMax = Number.NEGATIVE_INFINITY;
  let hasUnclosedConfigurationWithoutFiniteUpperBound = false;
  let peakUsedHeapBytes: number | null = null;
  let lastMemoryCheckAt = Number.NEGATIVE_INFINITY;
  let runtimeHeapLimitBytes: number | null = null;
  let activeConfigurationMemorySoftLimitBytes: number | null = null;
  const recordRuntimeMemoryMiB = (
    lastKey: RuntimeMemoryProfilingKey,
    peakKey: RuntimeMemoryProfilingKey,
    bytes: number | undefined,
  ): void => {
    if (typeof bytes !== "number" || !Number.isFinite(bytes)) {
      return;
    }
    const valueMiB = Math.ceil(bytes / BYTES_PER_MIB);
    const previousPeak = profiling[peakKey];
    profiling[lastKey] = valueMiB;
    profiling[peakKey] = typeof previousPeak === "number"
      ? Math.max(previousPeak, valueMiB)
      : valueMiB;
  };
  const getBaseEffectiveMemorySoftLimitBytes = (): number | null => {
    if (memorySoftLimitBytes === null && runtimeHeapLimitBytes === null && nodeAutoMemorySoftLimitBytes === null) {
      return null;
    }
    return Math.min(
      memorySoftLimitBytes ?? Number.POSITIVE_INFINITY,
      runtimeHeapLimitBytes !== null ? runtimeHeapLimitBytes * RUNTIME_HEAP_LIMIT_RATIO : Number.POSITIVE_INFINITY,
      nodeAutoMemorySoftLimitBytes ?? Number.POSITIVE_INFINITY,
    );
  };
  const getEffectiveMemorySoftLimitBytes = (): number | null => {
    const baseLimitBytes = getBaseEffectiveMemorySoftLimitBytes();
    if (baseLimitBytes === null) {
      return activeConfigurationMemorySoftLimitBytes;
    }
    return Math.min(
      baseLimitBytes,
      activeConfigurationMemorySoftLimitBytes ?? Number.POSITIVE_INFINITY,
    );
  };
  const getEffectiveMemorySoftLimitMiB = (): number | null => {
    const effectiveLimitBytes = getEffectiveMemorySoftLimitBytes();
    return effectiveLimitBytes !== null
      ? Math.floor(effectiveLimitBytes / BYTES_PER_MIB)
      : null;
  };
  const bytesToMiB = (bytes: number | null | undefined): number | null => (
    typeof bytes === "number" && Number.isFinite(bytes)
      ? Math.ceil(bytes / BYTES_PER_MIB)
      : null
  );
  const sampleRawRuntimeMemoryBytes = (): {
    performanceUsedBytes: number | null;
    nodeHeapBytes: number | null;
    nodeRssBytes: number | null;
  } => {
    const memory = (performance as RuntimeMemoryPerformance).memory;
    const performanceUsedBytes = typeof memory?.usedJSHeapSize === "number"
      && Number.isFinite(memory.usedJSHeapSize)
      ? memory.usedJSHeapSize
      : null;
    const nodeProcess = (globalThis as { process?: RuntimeNodeProcess }).process;
    const nodeMemoryUsage = nodeProcess?.memoryUsage?.();
    const nodeHeapBytes = typeof nodeMemoryUsage?.heapUsed === "number"
      && Number.isFinite(nodeMemoryUsage.heapUsed)
      ? nodeMemoryUsage.heapUsed
      : null;
    const nodeRssBytes = typeof nodeMemoryUsage?.rss === "number"
      && Number.isFinite(nodeMemoryUsage.rss)
      ? nodeMemoryUsage.rss
      : null;
    return { performanceUsedBytes, nodeHeapBytes, nodeRssBytes };
  };
  const readUsedHeapBytes = (): number | null => {
    const memory = (performance as RuntimeMemoryPerformance).memory;
    if (typeof memory?.jsHeapSizeLimit === "number" && Number.isFinite(memory.jsHeapSizeLimit) && memory.jsHeapSizeLimit > 0) {
      runtimeHeapLimitBytes = memory.jsHeapSizeLimit;
    }
    let usedHeapBytes = typeof memory?.usedJSHeapSize === "number" && Number.isFinite(memory.usedJSHeapSize)
      ? memory.usedJSHeapSize
      : null;
    if (usedHeapBytes === null) {
      const nodeProcess = (globalThis as { process?: RuntimeNodeProcess }).process;
      const nodeMemoryUsage = nodeProcess?.memoryUsage?.();
      const nodeHeapUsed = nodeMemoryUsage?.heapUsed;
      const nodeRss = nodeMemoryUsage?.rss;
      recordRuntimeMemoryMiB("lastNodeHeapUsedMiB", "peakNodeHeapUsedMiB", nodeHeapUsed);
      recordRuntimeMemoryMiB("lastNodeRssMiB", "peakNodeRssMiB", nodeRss);
      recordRuntimeMemoryMiB("lastNodeExternalMiB", "peakNodeExternalMiB", nodeMemoryUsage?.external);
      recordRuntimeMemoryMiB(
        "lastNodeArrayBuffersMiB",
        "peakNodeArrayBuffersMiB",
        nodeMemoryUsage?.arrayBuffers,
      );
      if (typeof nodeHeapUsed === "number" && Number.isFinite(nodeHeapUsed)) {
        usedHeapBytes = nodeHeapUsed;
      }
      if (
        typeof nodeRss === "number"
        && Number.isFinite(nodeRss)
        && (
          nodeAutoMemorySoftLimitBytes !== null
          || memorySoftLimitBytes !== null
        )
      ) {
        usedHeapBytes = Math.max(usedHeapBytes ?? 0, nodeRss);
      }
    }
    if (usedHeapBytes !== null) {
      const effectiveLimitMiB = getEffectiveMemorySoftLimitMiB();
      if (effectiveLimitMiB !== null) {
        stats.memorySoftLimitMiB = effectiveLimitMiB;
      }
      recordRuntimeMemoryMiB("lastMemoryGuardUsedMiB", "peakMemoryGuardUsedMiB", usedHeapBytes);
      peakUsedHeapBytes = Math.max(peakUsedHeapBytes ?? 0, usedHeapBytes);
      stats.peakUsedHeapMiB = Math.ceil((peakUsedHeapBytes ?? usedHeapBytes) / BYTES_PER_MIB);
    }
    return usedHeapBytes;
  };
  const markMemoryLimited = (): boolean => {
    stats.isExhaustive = false;
    stats.timedOut = true;
    stats.memoryLimited = true;
    stats.searchMode = "bounded";
    return true;
  };
  const runLowMemoryInitialCandidateSyncGcProbe = (): Record<string, number | boolean | null> => {
    const gc = (globalThis as { gc?: () => void }).gc;
    if (typeof gc !== "function") {
      return { unavailable: true };
    }
    const beforeRawMemory = sampleRawRuntimeMemoryBytes();
    const beforeGcBytes = readUsedHeapBytes();
    const gcStartedAt = performance.now();
    gc();
    const afterRawMemory = sampleRawRuntimeMemoryBytes();
    const afterGcBytes = readUsedHeapBytes();
    return {
      ran: true,
      elapsedMs: Math.round(performance.now() - gcStartedAt),
      beforeMiB: bytesToMiB(beforeGcBytes),
      afterMiB: bytesToMiB(afterGcBytes),
      beforePerformanceMiB: bytesToMiB(beforeRawMemory.performanceUsedBytes),
      afterPerformanceMiB: bytesToMiB(afterRawMemory.performanceUsedBytes),
      beforeNodeHeapMiB: bytesToMiB(beforeRawMemory.nodeHeapBytes),
      afterNodeHeapMiB: bytesToMiB(afterRawMemory.nodeHeapBytes),
      beforeNodeRssMiB: bytesToMiB(beforeRawMemory.nodeRssBytes),
      afterNodeRssMiB: bytesToMiB(afterRawMemory.nodeRssBytes),
      beforeNodeUsedMiB: bytesToMiB(
        beforeRawMemory.nodeHeapBytes !== null || beforeRawMemory.nodeRssBytes !== null
          ? Math.max(beforeRawMemory.nodeHeapBytes ?? 0, beforeRawMemory.nodeRssBytes ?? 0)
          : null,
      ),
      afterNodeUsedMiB: bytesToMiB(
        afterRawMemory.nodeHeapBytes !== null || afterRawMemory.nodeRssBytes !== null
          ? Math.max(afterRawMemory.nodeHeapBytes ?? 0, afterRawMemory.nodeRssBytes ?? 0)
          : null,
      ),
    };
  };
  const isPastMemorySoftLimit = (): boolean => {
    if (stats.memoryLimited) {
      return true;
    }
    const now = performance.now();
    if (now - lastMemoryCheckAt < MEMORY_SOFT_LIMIT_CHECK_INTERVAL_MS) {
      return false;
    }
    lastMemoryCheckAt = now;
    const effectiveMemorySoftLimitBytes = getEffectiveMemorySoftLimitBytes();
    if (effectiveMemorySoftLimitBytes === null) {
      return false;
    }
    const usedHeapBytes = readUsedHeapBytes();
    return usedHeapBytes !== null && effectiveMemorySoftLimitBytes !== null && usedHeapBytes >= effectiveMemorySoftLimitBytes
      ? markMemoryLimited()
      : false;
  };
  const progressOptions = input.progress;
  const progressInitialDelayMs = Math.max(0, Math.trunc(progressOptions?.initialDelayMs ?? 10_000));
  const progressMinIntervalMs = Math.max(0, Math.trunc(progressOptions?.scoreUpdateMinIntervalMs ?? 5_000));
  let didEmitInitialProgress = false;
  let lastProgressCheckAt = Number.NEGATIVE_INFINITY;
  let lastProgressEmittedAt = Number.NEGATIVE_INFINITY;
  let lastProgressScore = Number.NEGATIVE_INFINITY;
  const maybeEmitMedleyProgress = (force = false): void => {
    if (!progressOptions || results.length === 0) {
      return;
    }
    const now = performance.now();
    if (!force && now - lastProgressCheckAt < MEDLEY_PROGRESS_CHECK_INTERVAL_MS) {
      return;
    }
    lastProgressCheckAt = now;
    const elapsedSinceStartMs = now - startedAt;
    if (!didEmitInitialProgress && elapsedSinceStartMs < progressInitialDelayMs) {
      return;
    }
    const currentScore = results[0]?.score;
    if (currentScore === undefined) {
      return;
    }
    const hasScoreImprovedSinceLastProgress = currentScore > lastProgressScore;
    if (
      didEmitInitialProgress
      && (
        !hasScoreImprovedSinceLastProgress
        || now - lastProgressEmittedAt < progressMinIntervalMs
      )
    ) {
      return;
    }

    readUsedHeapBytes();
    const elapsedMs = Math.round(elapsedSinceStartMs);
    stats.elapsedMs = elapsedMs;
    try {
      progressOptions.onProgress(buildResponse({
        ...stats,
        elapsedMs,
        isExhaustive: false,
        searchMode: null,
        observedScoreUpperBound: null,
        observedScoreUpperBoundGap: null,
      }));
    } catch {
      // Progress is a UI convenience and must not affect the proof search.
    }
    didEmitInitialProgress = true;
    lastProgressEmittedAt = now;
    lastProgressScore = currentScore;
  };
  let bestObservedScore = Number.NEGATIVE_INFINITY;
  const deadlineCheckInterval = isLockedCoarseFilter && calculatedCards.length > 250 ? 256 : 2048;
  const recordBestScoreMilestone = (): void => {
    const score = results[0]?.score;
    if (score !== undefined && score > bestObservedScore) {
      bestObservedScore = score;
      profiling.timeToBestScoreMs = Math.round(performance.now() - startedAt);
    }
    maybeEmitMedleyProgress();
  };
  const recordUpperReplay = (
    baselineUpperBound: number,
    replayUpperBound: number,
    pruningCutoff: number | null,
  ): void => {
    if (!Number.isFinite(baselineUpperBound) || !Number.isFinite(replayUpperBound)) {
      return;
    }
    const nextStateCount = profiling.upperReplayStateCount + 1;
    const improvement = Math.max(0, baselineUpperBound - replayUpperBound);
    profiling.upperReplayAverageImprovement = (
      (profiling.upperReplayAverageImprovement * profiling.upperReplayStateCount) + improvement
    ) / nextStateCount;
    profiling.upperReplayStateCount = nextStateCount;
    if (
      pruningCutoff !== null
      && Number.isFinite(pruningCutoff)
      && baselineUpperBound >= pruningCutoff
      && replayUpperBound < pruningCutoff
    ) {
      profiling.upperReplayPrunableStateCount += 1;
    }
  };
  const recordUnresolvedObservedUpperBound = (
    upperBound: number,
    source: MedleyObservedUpperBoundSource,
    remainingSlotCount: number,
  ): void => {
    const threshold = getMedleyPruningThreshold(results, resultLimit);
    if (results.length >= resultLimit && Number.isFinite(upperBound) && upperBound >= threshold) {
      if (upperBound > observedScoreUpperBound) {
        observedScoreUpperBound = upperBound;
        profiling.observedUpperBoundSource = source;
        profiling.observedUpperBoundRemainingSlotCount = remainingSlotCount;
      }
    }
  };
  const observeUpperBound = (
    upperBound: number,
    source: MedleyObservedUpperBoundSource,
    remainingSlotCount: number,
  ): void => {
    const threshold = getMedleyPruningThreshold(results, resultLimit);
    if (!(results.length >= resultLimit && Number.isFinite(upperBound) && upperBound >= threshold)) {
      return;
    }
    if (activeConfigurationIndex === null) {
      recordUnresolvedObservedUpperBound(upperBound, source, remainingSlotCount);
      return;
    }
    if (upperBound > activeConfigurationObservedScoreUpperBound) {
      activeConfigurationObservedScoreUpperBound = upperBound;
      activeConfigurationObservedUpperBoundSource = source;
      activeConfigurationObservedUpperBoundRemainingSlotCount = remainingSlotCount;
    }
  };
  const tightenActiveConfigurationUpperBound = (
    upperBound: number | null | undefined,
    source: MedleyObservedUpperBoundSource,
    remainingSlotCount: number,
  ): void => {
    const threshold = getMedleyPruningThreshold(results, resultLimit);
    if (
      results.length < resultLimit
      || upperBound === null
      || upperBound === undefined
      || !Number.isFinite(upperBound)
      || upperBound < threshold
    ) {
      return;
    }
    if (activeConfigurationIndex === null) {
      recordUnresolvedObservedUpperBound(upperBound, source, remainingSlotCount);
      return;
    }
    if (upperBound < activeConfigurationTightScoreUpperBound) {
      activeConfigurationTightScoreUpperBound = upperBound;
      activeConfigurationTightUpperBoundSource = source;
      activeConfigurationTightUpperBoundRemainingSlotCount = remainingSlotCount;
    }
  };
  const isPastDeadline = (): boolean => {
    visitedBranchCount += 1;
    profiling.visitedBranchCount = visitedBranchCount;
    const shouldCheck = (
      enableExactCandidateJoin
      || enableConflictExactBnb
      || visitedBranchCount % deadlineCheckInterval === 0
    );
    if (!shouldCheck) {
      return false;
    }
    maybeEmitMedleyProgress();
    return performance.now() >= deadlineAt || isPastMemorySoftLimit();
  };
  const getRemainingSearchMs = (): number => Math.max(0, deadlineAt - performance.now());

  let orderedConfigurations = configurations;
  const configurationCoarseSeedScores = new Map<string, number>();
  const configurationSeedScores = new Map<number, number>();
  const configurationWarmupCache = new Map<number, MedleyConfigurationWarmupCache>();
  const configurationRootUpperBounds = new Map<number, number>();
  const configurationBasicSkillAwareRootUpperBounds = new Map<number, number>();
  const releaseSlotScoreCalculationCache = (slot: MedleySlotSearch): void => {
    slot.scoreCache.judgeLists?.clear();
    slot.scoreCache.innerScoreRates?.clear();
    slot.scoreCache.baseScoresByChart = new WeakMap();
    slot.scoreCache.noFloorBaseScoreRates?.clear();
    slot.scoreCache.skillMultiplierLists.clear();
    slot.scoreCache.noFloorSkillRates.clear();
    slot.scoreCache.skillWindowContributionsByChart = new WeakMap();
    slot.scoreCache.resolvedSkills?.clear();
  };
  const releaseSlotSearchCaches = (slots: MedleySlotSearch[]): void => {
    for (const slot of slots) {
      slot.teamEvaluationCache.clear();
      releaseMedleyScoreOnlyTeamEvaluationCache(slot);
      releaseSlotScoreCalculationCache(slot);
    }
  };
  const getConfigurationWarmupCache = (configurationIndex: number): MedleyConfigurationWarmupCache => {
    const cached = configurationWarmupCache.get(configurationIndex);
    if (cached) {
      return cached;
    }
    const warmupCache = {
      slots: pruneDominatedMedleySlotCards(buildMedleySlotSearches(
        input,
        songInputs,
        calculatedCards,
        configurations[configurationIndex],
        server,
      )),
      bestSlotTeamCache: new Map<string, MedleyBestSlotTeamCacheEntry>(),
      fixedCardSetOptimizationCache: new Map<string, MedleyFixedCardSetOptimizationCacheEntry>(),
    };
    configurationWarmupCache.set(configurationIndex, warmupCache);
    return warmupCache;
  };
  const releaseConfigurationWarmupCache = (configurationIndex: number): void => {
    const warmupCache = configurationWarmupCache.get(configurationIndex);
    if (!warmupCache) {
      return;
    }
    releaseSlotSearchCaches(warmupCache.slots);
    warmupCache.bestSlotTeamCache.clear();
    warmupCache.fixedCardSetOptimizationCache.clear();
    configurationWarmupCache.delete(configurationIndex);
  };
  const releaseAllConfigurationWarmupCaches = (): void => {
    for (const configurationIndex of [...configurationWarmupCache.keys()]) {
      releaseConfigurationWarmupCache(configurationIndex);
    }
  };
  const getConfigurationRootUpperBound = (configurationIndex: number): number => {
    const cached = configurationRootUpperBounds.get(configurationIndex);
    if (cached !== undefined) {
      return cached;
    }
    const warmupCache = getConfigurationWarmupCache(configurationIndex);
    const rootUpperBound = warmupCache.slots.reduce((sum, slot) => sum + slot.rootScoreUpperBound, 0);
    configurationRootUpperBounds.set(configurationIndex, rootUpperBound);
    profiling.rootUpperBestConfigurationUpperBound = Math.max(
      profiling.rootUpperBestConfigurationUpperBound ?? Number.NEGATIVE_INFINITY,
      rootUpperBound,
    );
    return rootUpperBound;
  };
  const getConfigurationBasicSkillAwareRootUpperBound = (configurationIndex: number): number => {
    const cached = configurationBasicSkillAwareRootUpperBounds.get(configurationIndex);
    if (cached !== undefined) {
      return cached;
    }
    const upperBound = estimateMedleyConfigurationBasicSkillAwareRootUpperBound(
      calculatedCards,
      configurations[configurationIndex],
      server,
      getSlotBuildContexts(),
    );
    configurationBasicSkillAwareRootUpperBounds.set(configurationIndex, upperBound);
    return upperBound;
  };
  const getConfigurationObservedRootUpperBound = (configurationIndex: number): number => {
    const rootUpperBound = getConfigurationRootUpperBound(configurationIndex);
    if (!shouldUseBasicSkillAwareRootCapacityPrefilter) {
      return rootUpperBound;
    }
    return Math.min(rootUpperBound, getConfigurationBasicSkillAwareRootUpperBound(configurationIndex));
  };
  const getSameCoarseSiblingFrontier = (
    configurationIndex: number,
    threshold: number,
  ): Array<Record<string, unknown>> => {
    const configuration = configurations[configurationIndex];
    if (!configuration) {
      return [];
    }
    return configurations
      .map((siblingConfiguration, siblingIndex) => ({ siblingConfiguration, siblingIndex }))
      .filter(({ siblingConfiguration, siblingIndex }) => (
        siblingIndex !== configurationIndex
        && siblingConfiguration.bandKey === configuration.bandKey
        && siblingConfiguration.attribute === configuration.attribute
      ))
      .map(({ siblingConfiguration, siblingIndex }) => {
        const rootUpperBound = getConfigurationObservedRootUpperBound(siblingIndex);
        const rememberedUpperBound = unclosedConfigurationUpperBounds.get(siblingIndex);
        return {
          configurationIndex: siblingIndex,
          parameter: siblingConfiguration.parameter,
          rootUpperBound,
          rootGap: Number.isFinite(rootUpperBound) && Number.isFinite(threshold)
            ? rootUpperBound - threshold
            : null,
          closed: closedConfigurationIndices.has(siblingIndex),
          rememberedUnclosedUpperBound: rememberedUpperBound?.upperBound ?? null,
          unresolvedAboveIncumbent: (
            !closedConfigurationIndices.has(siblingIndex)
            && Number.isFinite(rootUpperBound)
            && rootUpperBound > threshold
          ),
        };
      });
  };
  const hasBlockingSameCoarseSibling = (configurationIndex: number, threshold: number): boolean => (
    getSameCoarseSiblingFrontier(configurationIndex, threshold).some((entry) => (
      entry.unresolvedAboveIncumbent === true
    ))
  );
  const rememberUnclosedConfigurationUpperBound = (
    configurationIndex: number,
    upperBound: number | null | undefined,
    source: MedleyObservedUpperBoundSource,
    remainingSlotCount: number,
  ): void => {
    if (configurationIndex < 0 || upperBound === null || upperBound === undefined || !Number.isFinite(upperBound)) {
      return;
    }
    const current = unclosedConfigurationUpperBounds.get(configurationIndex);
    if (!current || upperBound < current.upperBound) {
      unclosedConfigurationUpperBounds.set(configurationIndex, {
        upperBound,
        source,
        remainingSlotCount,
      });
    }
    unclosedConfigurationUpperBoundMax = Math.max(unclosedConfigurationUpperBoundMax, upperBound);
  };
  const beginActiveConfiguration = (configurationIndex: number): void => {
    activeConfigurationIndex = configurationIndex;
    activeConfigurationObservedScoreUpperBound = Number.NEGATIVE_INFINITY;
    activeConfigurationObservedUpperBoundSource = null;
    activeConfigurationObservedUpperBoundRemainingSlotCount = null;
    activeConfigurationTightScoreUpperBound = Number.POSITIVE_INFINITY;
    activeConfigurationTightUpperBoundSource = null;
    activeConfigurationTightUpperBoundRemainingSlotCount = null;
  };
  const rememberActiveConfigurationUpperBound = (): void => {
    if (activeConfigurationIndex === null || activeConfigurationIndex < 0) {
      return;
    }
    const useTightUpperBound = (
      Number.isFinite(activeConfigurationTightScoreUpperBound)
      && (
        !Number.isFinite(activeConfigurationObservedScoreUpperBound)
        || activeConfigurationTightScoreUpperBound < activeConfigurationObservedScoreUpperBound
      )
    );
    if (useTightUpperBound) {
      rememberUnclosedConfigurationUpperBound(
        activeConfigurationIndex,
        activeConfigurationTightScoreUpperBound,
        activeConfigurationTightUpperBoundSource ?? "configuration-root",
        activeConfigurationTightUpperBoundRemainingSlotCount ?? MEDLEY_TEAM_COUNT,
      );
      return;
    }
    rememberUnclosedConfigurationUpperBound(
      activeConfigurationIndex,
      activeConfigurationObservedScoreUpperBound,
      activeConfigurationObservedUpperBoundSource ?? "configuration-root",
      activeConfigurationObservedUpperBoundRemainingSlotCount ?? MEDLEY_TEAM_COUNT,
    );
  };
  const closeActiveConfiguration = (): void => {
    if (activeConfigurationIndex !== null && activeConfigurationIndex >= 0) {
      closedConfigurationIndices.add(activeConfigurationIndex);
    }
    activeConfigurationIndex = null;
    activeConfigurationObservedScoreUpperBound = Number.NEGATIVE_INFINITY;
    activeConfigurationObservedUpperBoundSource = null;
    activeConfigurationObservedUpperBoundRemainingSlotCount = null;
    activeConfigurationTightScoreUpperBound = Number.POSITIVE_INFINITY;
    activeConfigurationTightUpperBoundSource = null;
    activeConfigurationTightUpperBoundRemainingSlotCount = null;
  };
  const rememberExactCandidateJoinProofElapsed = (
    configuration: BandoriAreaItemConfiguration,
    elapsedMs: number,
  ): void => {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
      return;
    }
    const coarseKey = getMedleyAreaItemCoarseKey(configuration);
    exactCandidateJoinProofElapsedMsByCoarseKey.set(
      coarseKey,
      Math.max(exactCandidateJoinProofElapsedMsByCoarseKey.get(coarseKey) ?? 0, elapsedMs),
    );
  };
  const lockedConfigurationPotentialScores = new Map<number, number>();
  const getLockedConfigurationPotentialScore = (configurationIndex: number): number => {
    const cached = lockedConfigurationPotentialScores.get(configurationIndex);
    if (cached !== undefined) {
      return cached;
    }
    const score = estimateMedleyLockedConfigurationPotential(
      input,
      calculatedCards,
      configurations[configurationIndex],
      server,
    );
    lockedConfigurationPotentialScores.set(configurationIndex, score);
    return score;
  };
  const staticConfigurationPotentialScores = new Map<number, number>();
  const getStaticConfigurationPotentialScore = (configurationIndex: number): number => {
    const cached = staticConfigurationPotentialScores.get(configurationIndex);
    if (cached !== undefined) {
      return cached;
    }
    const score = estimateMedleyStaticCoarsePotential(input, calculatedCards, configurations[configurationIndex]);
    staticConfigurationPotentialScores.set(configurationIndex, score);
    return score;
  };
  const getStaticAutoCoarseKeys = (limit: number): string[] => {
    const rankedKeys: string[] = [];
    const seenKeys = new Set<string>();
    configurations
      .map((configuration, index) => ({
        configuration,
        index,
        coarseKey: getMedleyAreaItemCoarseKey(configuration),
        potential: estimateMedleyStaticCoarsePotential(input, calculatedCards, configuration),
      }))
      .sort((left, right) => right.potential - left.potential || left.index - right.index)
      .forEach((entry) => {
        if (rankedKeys.length >= limit || seenKeys.has(entry.coarseKey)) {
          return;
        }
        seenKeys.add(entry.coarseKey);
        rankedKeys.push(entry.coarseKey);
      });
    return rankedKeys;
  };
  let didApplyAutoCoarseRestriction = false;

  // This seed pass is an ordering and incumbent-improvement pass. When it auto-selects only a
  // subset of coarse item groups, the final response must remain bounded even if DFS exhausts
  // that reduced subset.
  const isAutoCoarseFilter = coarseFilter?.mode === "auto"
    || (!coarseFilter && calculatedCards.length > 250);
  const shouldUseBasicSkillAwareRootCapacityPrefilter = (
    shouldAutoEnableExactCandidateJoin
    && !hasDuplicateCardIds
    && (isLockedCoarseFilter || isAllCoarseFilter)
    && maxSearchDurationMs >= 30000
  );
  if (
    (isAutoCoarseFilter || isLockedCoarseFilter || maxSearchDurationMs >= 30000)
    && calculatedCards.length > 250
    && configurations.length > 1
  ) {
    const seedPassStartedAt = performance.now();
    const requestedSeedPassDurationMs = Number.isFinite(parsedConfigurationSeedPassDurationMs)
      ? Math.max(0, parsedConfigurationSeedPassDurationMs)
      : shouldAutoEnableExactCandidateJoin && isLockedCoarseFilter
        ? Math.max(2500, Math.trunc(maxSearchDurationMs * 0.04))
        : shouldAutoEnableExactCandidateJoin && isAllCoarseFilter
          ? Math.max(1000, Math.trunc(maxSearchDurationMs * 0.02))
          : maxSearchDurationMs >= 30000
          ? Math.max(9000, Math.trunc(maxSearchDurationMs * 0.2))
          : Math.max(1500, Math.trunc(maxSearchDurationMs * 0.25));
    const seedPassDurationMs = Math.min(
      requestedSeedPassDurationMs,
      Math.max(0, deadlineAt - seedPassStartedAt - 2000),
    );
    const seedPassDeadlineAt = seedPassStartedAt + seedPassDurationMs;
    let seedPassConfigurationIndices = orderMedleyCoarseSeedConfigurationIndices(configurations, calculatedCards, input);
    if (shouldUseBasicSkillAwareRootCapacityPrefilter && isAllCoarseFilter) {
      seedPassConfigurationIndices = seedPassConfigurationIndices
        .map((configurationIndex) => ({
          configurationIndex,
          rootUpperBound: getConfigurationObservedRootUpperBound(configurationIndex),
        }))
        .sort((left, right) => (
          right.rootUpperBound - left.rootUpperBound
          || left.configurationIndex - right.configurationIndex
        ))
        .map(({ configurationIndex }) => configurationIndex);
    }
    for (const configurationIndex of seedPassConfigurationIndices) {
      if (performance.now() >= seedPassDeadlineAt || performance.now() >= deadlineAt || isPastMemorySoftLimit()) {
        break;
      }
      const coarseKey = getMedleyAreaItemCoarseKey(configurations[configurationIndex]);
      const parameterConfigurationIndices = configurations
        .map((configuration, index) => ({ configuration, index }))
        .filter(({ configuration }) => getMedleyAreaItemCoarseKey(configuration) === coarseKey)
        .sort((left, right) => {
          const potentialDelta = isLockedCoarseFilter
            ? getLockedConfigurationPotentialScore(right.index) - getLockedConfigurationPotentialScore(left.index)
            : 0;
          return potentialDelta
            || (left.configuration.parameter ?? "").localeCompare(right.configuration.parameter ?? "")
            || left.index - right.index;
        })
        .map(({ index }) => index);

      for (const parameterConfigurationIndex of parameterConfigurationIndices) {
        if (performance.now() >= seedPassDeadlineAt || performance.now() >= deadlineAt || isPastMemorySoftLimit()) {
          break;
        }
        const configuration = configurations[parameterConfigurationIndex];
        const warmupCache = getConfigurationWarmupCache(parameterConfigurationIndex);
        const { slots, bestSlotTeamCache, fixedCardSetOptimizationCache } = warmupCache;
        const primarySeedOrder = getMedleyGreedySeedSlotIndices(slots);
        const reverseSongOrder = slots
          .map((_, index) => index)
          .sort((left, right) => slots[right].songIndex - slots[left].songIndex);
        const seedOrders = [primarySeedOrder];
        if (reverseSongOrder.join(",") !== primarySeedOrder.join(",")) {
          seedOrders.push(reverseSongOrder);
        }
        const scoreBefore = results[0]?.score ?? Number.NEGATIVE_INFINITY;
        const wasTimedOut = stats.timedOut;
        const wasExhaustive = stats.isExhaustive;
        const previousSearchMode = stats.searchMode;
        const isPastSeedPassDeadline = (): boolean => {
          visitedBranchCount += 1;
          profiling.visitedBranchCount = visitedBranchCount;
          return visitedBranchCount % deadlineCheckInterval === 0 && performance.now() >= seedPassDeadlineAt;
        };
        const useFastLockedSeedPass = isLockedCoarseFilter && shouldAutoEnableExactCandidateJoin;
        const configurationSeedScore = useFastLockedSeedPass
          ? seedMedleyResultsFromFastGreedyOrders(
            results,
            resultLimit,
            slots,
            configuration,
            server,
            perfectRate,
            stats,
            profiling,
            fixedCardSetOptimizationCache,
            seedOrders,
            observeEvaluatedMedleyResult,
          )
          : seedMedleyResultsFromGreedyOrders(
            results,
            resultLimit,
            slots,
            configuration,
            server,
            perfectRate,
            stats,
            isPastSeedPassDeadline,
            profiling,
            bestSlotTeamCache,
            fixedCardSetOptimizationCache,
            seedOrders,
            false,
            observeEvaluatedMedleyResult,
          );
        if (stats.timedOut && performance.now() < deadlineAt) {
          stats.timedOut = wasTimedOut;
          stats.isExhaustive = wasExhaustive;
          stats.searchMode = previousSearchMode;
        }
        if (stats.timedOut) {
          break;
        }
        profiling.configurationSeedPassCount += 1;
        const scoreAfter = results[0]?.score ?? Number.NEGATIVE_INFINITY;
        if (configurationSeedScore !== null && Number.isFinite(configurationSeedScore)) {
          configurationSeedScores.set(
            parameterConfigurationIndex,
            Math.max(configurationSeedScores.get(parameterConfigurationIndex) ?? Number.NEGATIVE_INFINITY, configurationSeedScore),
          );
          configurationCoarseSeedScores.set(
            coarseKey,
            Math.max(configurationCoarseSeedScores.get(coarseKey) ?? Number.NEGATIVE_INFINITY, configurationSeedScore),
          );
        }
        if (scoreAfter > scoreBefore) {
          recordBestScoreMilestone();
          profiling.configurationSeedPassImprovementCount += 1;
          profiling.bestConfigurationSeedPassScore = Math.max(
            profiling.bestConfigurationSeedPassScore ?? Number.NEGATIVE_INFINITY,
            scoreAfter,
          );
        }
      }
    }
    if (configurationCoarseSeedScores.size > 0) {
      orderedConfigurations = configurations
        .map((configuration, index) => ({ configuration, index }))
        .sort((left, right) => {
          const leftSeedScore = configurationSeedScores.get(left.index)
            ?? configurationCoarseSeedScores.get(getMedleyAreaItemCoarseKey(left.configuration))
            ?? getStaticConfigurationPotentialScore(left.index);
          const rightSeedScore = configurationSeedScores.get(right.index)
            ?? configurationCoarseSeedScores.get(getMedleyAreaItemCoarseKey(right.configuration))
            ?? getStaticConfigurationPotentialScore(right.index);
          return rightSeedScore - leftSeedScore || left.index - right.index;
        })
        .map(({ configuration }) => configuration);
    }
    if (isAutoCoarseFilter) {
      const candidateLimit = clamp(Math.trunc(coarseFilter?.candidateLimit ?? 3), 1, configurations.length);
      const selectedCoarseKeys = new Set<string>();
      [...configurationCoarseSeedScores.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, candidateLimit)
        .forEach(([coarseKey]) => selectedCoarseKeys.add(coarseKey));
      getStaticAutoCoarseKeys(candidateLimit).forEach((coarseKey) => {
        if (selectedCoarseKeys.size < candidateLimit) {
          selectedCoarseKeys.add(coarseKey);
        }
      });
      const filteredConfigurations = filterMedleyConfigurationsByCoarseKeys(orderedConfigurations, selectedCoarseKeys);
      if (filteredConfigurations.length > 0 && filteredConfigurations.length < configurations.length) {
        orderedConfigurations = filteredConfigurations;
        didApplyAutoCoarseRestriction = true;
        profiling.coarseAutoSelectedConfigurationCount = filteredConfigurations.length;
        profiling.coarseAutoSelectedGroupCount = selectedCoarseKeys.size;
      }
    }
  }

  const shouldSortByRootUpper = (
    orderedConfigurations.length > 1
    && performance.now() < deadlineAt
    && (
      calculatedCards.length <= 250
      || ((isLockedCoarseFilter || isAllCoarseFilter) && maxSearchDurationMs >= 30000)
      || orderedConfigurations.length <= 24
      || configurationCoarseSeedScores.size > 0
    )
  );
  const shouldPrioritizeRootUpperForProof = (
    (isLockedCoarseFilter || isAllCoarseFilter)
    && maxSearchDurationMs >= 30000
  );
  if (shouldSortByRootUpper) {
    const shouldUseAllScopeObservedRootSort = shouldAutoEnableExactCandidateJoin && isAllCoarseFilter;
    const configurationEntries = orderedConfigurations.map((configuration) => {
      const index = configurations.indexOf(configuration);
      const seedScore = index >= 0
        ? (
          configurationSeedScores.get(index)
          ?? configurationCoarseSeedScores.get(getMedleyAreaItemCoarseKey(configuration))
          ?? Number.NEGATIVE_INFINITY
        )
        : Number.NEGATIVE_INFINITY;
      const rootUpperBound = index >= 0
        ? getConfigurationRootUpperBound(index)
        : Number.NEGATIVE_INFINITY;
      const observedRootUpperBound = index >= 0 && shouldUseAllScopeObservedRootSort
        ? getConfigurationObservedRootUpperBound(index)
        : Number.NEGATIVE_INFINITY;
      const lockedPotentialScore = index >= 0 && isLockedCoarseFilter
        ? getLockedConfigurationPotentialScore(index)
        : Number.NEGATIVE_INFINITY;
      return {
        configuration,
        index,
        seedScore,
        rootUpperBound,
        observedRootUpperBound,
        lockedPotentialScore,
      };
    });
    const compareObservedRootUpper = (
      left: typeof configurationEntries[number],
      right: typeof configurationEntries[number],
    ): number => (
      right.observedRootUpperBound - left.observedRootUpperBound
      || right.seedScore - left.seedScore
      || right.rootUpperBound - left.rootUpperBound
      || left.index - right.index
    );
    if (shouldUseAllScopeObservedRootSort) {
      if (enableSameCoarseLowRootFirstProofOrder) {
        const groupStats = new Map<string, {
          maxObservedRootUpperBound: number;
          maxRootUpperBound: number;
          maxSeedScore: number;
          minIndex: number;
        }>();
        for (const entry of configurationEntries) {
          const key = getMedleyAreaItemCoarseKey(entry.configuration);
          const current = groupStats.get(key);
          if (!current) {
            groupStats.set(key, {
              maxObservedRootUpperBound: entry.observedRootUpperBound,
              maxRootUpperBound: entry.rootUpperBound,
              maxSeedScore: entry.seedScore,
              minIndex: entry.index,
            });
            continue;
          }
          current.maxObservedRootUpperBound = Math.max(
            current.maxObservedRootUpperBound,
            entry.observedRootUpperBound,
          );
          current.maxRootUpperBound = Math.max(current.maxRootUpperBound, entry.rootUpperBound);
          current.maxSeedScore = Math.max(current.maxSeedScore, entry.seedScore);
          current.minIndex = Math.min(current.minIndex, entry.index);
        }
        orderedConfigurations = configurationEntries
          .sort((left, right) => {
            const leftGroup = groupStats.get(getMedleyAreaItemCoarseKey(left.configuration));
            const rightGroup = groupStats.get(getMedleyAreaItemCoarseKey(right.configuration));
            if (leftGroup && rightGroup && leftGroup !== rightGroup) {
              return (
                rightGroup.maxObservedRootUpperBound - leftGroup.maxObservedRootUpperBound
                || rightGroup.maxSeedScore - leftGroup.maxSeedScore
                || rightGroup.maxRootUpperBound - leftGroup.maxRootUpperBound
                || leftGroup.minIndex - rightGroup.minIndex
              );
            }
            return (
              left.observedRootUpperBound - right.observedRootUpperBound
              || right.seedScore - left.seedScore
              || right.rootUpperBound - left.rootUpperBound
              || left.index - right.index
            );
          })
          .map(({ configuration }) => configuration);
      } else {
        orderedConfigurations = configurationEntries
          .sort(compareObservedRootUpper)
          .map(({ configuration }) => configuration);
      }
    } else {
      orderedConfigurations = configurationEntries
        .sort((left, right) => (
          shouldPrioritizeRootUpperForProof && !(isLockedCoarseFilter && shouldAutoEnableExactCandidateJoin)
            ? right.rootUpperBound - left.rootUpperBound || right.seedScore - left.seedScore || left.index - right.index
            : right.seedScore - left.seedScore
              || right.lockedPotentialScore - left.lockedPotentialScore
              || right.rootUpperBound - left.rootUpperBound
              || left.index - right.index
        ))
        .map(({ configuration }) => configuration);
    }
  }
  releaseAllConfigurationWarmupCaches();

  // Each area-item configuration is a separate global decision shared by all three teams.
  // Exhaustiveness is only true after every searched configuration and every cross-slot card
  // assignment has been covered without timeout.
  const sameCoarseDfsAfterUnprovedProofCounts = new Map<string, number>();
  for (const configuration of orderedConfigurations) {
    const preConfigurationGcProbe = enableLowMemoryInitialCandidateSyncGcProbe
      ? runLowMemoryInitialCandidateSyncGcProbe()
      : null;
    profiling.startedAreaItemConfigurationCount += 1;
    if (performance.now() >= deadlineAt || isPastMemorySoftLimit()) {
      stats.isExhaustive = false;
      stats.timedOut = true;
      stats.searchMode = "bounded";
      break;
    }

    const configurationIndex = configurations.indexOf(configuration);
    beginActiveConfiguration(configurationIndex);
    if (
      results.length >= resultLimit
      && shouldUseBasicSkillAwareRootCapacityPrefilter
      && configurationIndex >= 0
    ) {
      const fastRootPruneStartedAt = performance.now();
      const threshold = getMedleyPruningThreshold(results, resultLimit);
      const basicSkillAwareRootUpperBound = getConfigurationBasicSkillAwareRootUpperBound(configurationIndex);
      observeUpperBound(basicSkillAwareRootUpperBound, "configuration-root", MEDLEY_TEAM_COUNT);
      if (basicSkillAwareRootUpperBound < threshold) {
        stats.prunedBranchCount += 1;
        profiling.rootUpperPrunedConfigurationCount += 1;
        if (configurationTrace) {
          configurationTrace.push({
            order: profiling.startedAreaItemConfigurationCount,
            configurationIndex,
            bandKey: configuration.bandKey,
            attribute: configuration.attribute,
            parameter: configuration.parameter,
            status: "fast-basic-root-pruned",
            startedAtMs: Math.round(fastRootPruneStartedAt - startedAt),
            elapsedMs: Math.round(performance.now() - fastRootPruneStartedAt),
            initialBestScore: results[0]?.score ?? null,
            basicSkillAwareRootUpperBound,
          });
        }
        closeActiveConfiguration();
        releaseConfigurationWarmupCache(configurationIndex);
        continue;
      }
    }
    // Once one requested configuration remains unproved, later configurations
    // whose root upper is no higher cannot restore exact status. Skipping them
    // preserves the bounded upper while avoiding repeated exact joins near the
    // same proof frontier.
    if (
      results.length >= resultLimit
      && !disableDominatedRootSkip
      && shouldAutoEnableExactCandidateJoin
      && isAllCoarseFilter
      && resultLimit === 1
      && maxSearchDurationMs >= 30000
      && calculatedCards.length >= 900
      && didLeaveUnclosedAreaItemConfiguration
      && configurationIndex >= 0
      && Number.isFinite(unclosedConfigurationUpperBoundMax)
    ) {
      const threshold = getMedleyPruningThreshold(results, resultLimit);
      const observedRootUpperBound = getConfigurationObservedRootUpperBound(configurationIndex);
      if (
        unclosedConfigurationUpperBoundMax - threshold >= MEDLEY_DOMINATED_BOUNDED_SKIP_MIN_GAP
        && Number.isFinite(observedRootUpperBound)
        && observedRootUpperBound <= unclosedConfigurationUpperBoundMax
      ) {
        didLeaveUnclosedAreaItemConfiguration = true;
        rememberUnclosedConfigurationUpperBound(
          configurationIndex,
          observedRootUpperBound,
          "configuration-root",
          MEDLEY_TEAM_COUNT,
        );
        if (configurationTrace) {
          const dominatedSkipStartedAt = performance.now();
          configurationTrace.push({
            order: profiling.startedAreaItemConfigurationCount,
            configurationIndex,
            bandKey: configuration.bandKey,
            attribute: configuration.attribute,
            parameter: configuration.parameter,
            status: "bounded-dominated-root-skip",
            startedAtMs: Math.round(dominatedSkipStartedAt - startedAt),
            elapsedMs: 0,
            initialBestScore: results[0]?.score ?? null,
            basicSkillAwareRootUpperBound: observedRootUpperBound,
            dominatingUnclosedUpperBound: unclosedConfigurationUpperBoundMax,
          });
        }
        releaseConfigurationWarmupCache(configurationIndex);
        continue;
      }
    }
    const warmupCache = configurationIndex >= 0 ? getConfigurationWarmupCache(configurationIndex) : undefined;
    let slots = warmupCache?.slots
      ?? pruneDominatedMedleySlotCards(buildMedleySlotSearches(
        input,
        songInputs,
        calculatedCards,
        configuration,
        server,
      ));
    const bestSlotTeamCache = warmupCache?.bestSlotTeamCache ?? new Map<string, MedleyBestSlotTeamCacheEntry>();
    const remainingUpperBoundCache = new Map<string, number>();
    const fixedCardSetOptimizationCache = warmupCache?.fixedCardSetOptimizationCache ?? new Map<string, MedleyFixedCardSetOptimizationCacheEntry>();
    let slotCandidateLimits: number[] = [];
    let slotCandidates: MedleyTeamCandidate[][] = [];
    const traceStartedAt = performance.now();
    const traceStartCounters = {
      evaluatedTeamCount: stats.evaluatedTeamCount,
      enumeratedTeamCount: stats.enumeratedTeamCount,
      visitedBranchCount,
      exactCandidateJoinCallCount: profiling.exactCandidateJoinCallCount,
      exactCandidateJoinCompletedCount: profiling.exactCandidateJoinCompletedCount,
      exactCandidateJoinAbortCount: profiling.exactCandidateJoinAbortCount,
      exactCandidateJoinGeneratedCandidateCount: profiling.exactCandidateJoinGeneratedCandidateCount,
      exactCandidateJoinPairCount: profiling.exactCandidateJoinPairCount,
      exactCandidateJoinThirdQueryCount: profiling.exactCandidateJoinThirdQueryCount,
      exactCandidateJoinThirdShortlistQueryCount: profiling.exactCandidateJoinThirdShortlistQueryCount,
      exactCandidateJoinThirdShortlistHitCount: profiling.exactCandidateJoinThirdShortlistHitCount,
      exactCandidateJoinThirdShortlistFallbackCount: profiling.exactCandidateJoinThirdShortlistFallbackCount,
      exactCandidateJoinThirdShortlistExhaustiveMissCount: (
        profiling.exactCandidateJoinThirdShortlistExhaustiveMissCount
      ),
      exactCandidateJoinThirdFallbackWordScanCount: profiling.exactCandidateJoinThirdFallbackWordScanCount,
      exactCandidateJoinExtendedThirdShortlistQueryCount: (
        profiling.exactCandidateJoinExtendedThirdShortlistQueryCount
      ),
      exactCandidateJoinExtendedThirdShortlistHitCount: (
        profiling.exactCandidateJoinExtendedThirdShortlistHitCount
      ),
      exactCandidateJoinExtendedThirdShortlistFallbackCount: (
        profiling.exactCandidateJoinExtendedThirdShortlistFallbackCount
      ),
      exactCandidateJoinExtendedThirdShortlistExhaustiveMissCount: (
        profiling.exactCandidateJoinExtendedThirdShortlistExhaustiveMissCount
      ),
      exactCandidateJoinExtendedThirdShortlistCacheEntryCount: (
        profiling.exactCandidateJoinExtendedThirdShortlistCacheEntryCount
      ),
      exactCandidateJoinGuardedCandidateExtensionCount: (
        profiling.exactCandidateJoinGuardedCandidateExtensionCount
      ),
      exactCandidateJoinAnchorFrontierProofTriggerCount: (
        profiling.exactCandidateJoinAnchorFrontierProofTriggerCount
      ),
      exactCandidateJoinAnchorFrontierProofCompletedCount: (
        profiling.exactCandidateJoinAnchorFrontierProofCompletedCount
      ),
      exactCandidateJoinAnchorFrontierProofTimeboxCount: (
        profiling.exactCandidateJoinAnchorFrontierProofTimeboxCount
      ),
      exactCandidateJoinAnchorFrontierProofSkipCount: (
        profiling.exactCandidateJoinAnchorFrontierProofSkipCount
      ),
      exactCandidateJoinAnchorFrontierCheapUpperCount: (
        profiling.exactCandidateJoinAnchorFrontierCheapUpperCount
      ),
      exactCandidateJoinAnchorFrontierCheapUpperImprovementCount: (
        profiling.exactCandidateJoinAnchorFrontierCheapUpperImprovementCount
      ),
      exactCandidateJoinAnchorFrontierCheapUpperTimeboxCount: (
        profiling.exactCandidateJoinAnchorFrontierCheapUpperTimeboxCount
      ),
      exactCandidateJoinLowMemoryInitialCandidateScoreCacheClearCount: (
        profiling.exactCandidateJoinLowMemoryInitialCandidateScoreCacheClearCount
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateSlotIndex: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateSlotIndex
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateAbortReason: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortReason
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateVisitedNodeCount: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateVisitedNodeCount
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateEvaluatedTeamCount: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluatedTeamCount
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateBestScore: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestScore
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateBestCardIds: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestCardIds
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateBestCardInstanceKeys: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestCardInstanceKeys
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateBestSkillIds: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestSkillIds
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateBestPowers: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestPowers
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateStartUsedMiB: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateStartUsedMiB
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateStartNodeHeapMiB: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateStartNodeHeapMiB
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateStartRssMiB: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateStartRssMiB
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitUsedMiB: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitUsedMiB
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitNodeHeapMiB: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitNodeHeapMiB
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitRssMiB: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitRssMiB
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeUsedMiB: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeUsedMiB
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterUsedMiB: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterUsedMiB
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeNodeHeapMiB: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeNodeHeapMiB
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterNodeHeapMiB: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterNodeHeapMiB
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeRssMiB: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeRssMiB
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterRssMiB: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterRssMiB
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateAbortUsedMiB: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortUsedMiB
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateAbortLimitMiB: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortLimitMiB
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateAbortHeadroomMiB: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortHeadroomMiB
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateAbortNodeHeapMiB: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortNodeHeapMiB
      ),
      exactCandidateJoinLastLowMemoryInitialCandidateAbortRssMiB: (
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortRssMiB
      ),
      exactCandidateJoinAnchorFrontierImprovementProbeCount: (
        profiling.exactCandidateJoinAnchorFrontierImprovementProbeCount
      ),
      exactCandidateJoinAnchorFrontierImprovementProbeHitCount: (
        profiling.exactCandidateJoinAnchorFrontierImprovementProbeHitCount
      ),
      exactCandidateJoinAnchorFrontierImprovementProbeTimeboxCount: (
        profiling.exactCandidateJoinAnchorFrontierImprovementProbeTimeboxCount
      ),
      exactCandidateJoinStagedCandidateExtensionCount: (
        profiling.exactCandidateJoinStagedCandidateExtensionCount
      ),
      exactCandidateJoinSmallGapSolveRetryCount: profiling.exactCandidateJoinSmallGapSolveRetryCount,
      exactCandidateJoinSmallGapSolveRetryTimeboxCount: (
        profiling.exactCandidateJoinSmallGapSolveRetryTimeboxCount
      ),
      exactJoinPrefixSeedCallCount: profiling.exactJoinPrefixSeedCallCount,
      exactJoinPrefixSeedHitCount: profiling.exactJoinPrefixSeedHitCount,
      exactJoinPrefixSeedElapsedMs: profiling.exactJoinPrefixSeedElapsedMs,
      exactJoinPrefixSeedTimedOutCount: profiling.exactJoinPrefixSeedTimedOutCount,
      exactJoinPrefixSeedNoHitLocalTimeoutCount: profiling.exactJoinPrefixSeedNoHitLocalTimeoutCount,
      exactJoinPrefixSeedSkippedByCandidateCount: profiling.exactJoinPrefixSeedSkippedByCandidateCount,
      exactJoinPrefixSeedGuardSkipCount: profiling.exactJoinPrefixSeedGuardSkipCount,
      exactJoinPrefixSeedGuardSkipReasonCounts: {
        ...profiling.exactJoinPrefixSeedGuardSkipReasonCounts,
      },
      sameCoarseMemoryRootSkipCount: profiling.sameCoarseMemoryRootSkipCount,
      eventRootFrontierProbeCallCount: profiling.eventRootFrontierProbeCallCount,
      eventRootFrontierProbeProvedCount: profiling.eventRootFrontierProbeProvedCount,
      eventRootFrontierProbePrunedCount: profiling.eventRootFrontierProbePrunedCount,
      eventRootFrontierProbeUpperImprovementCount: profiling.eventRootFrontierProbeUpperImprovementCount,
      eventRootFrontierProbeTimeboxCount: profiling.eventRootFrontierProbeTimeboxCount,
      eventRootFrontierProbeSkipCount: profiling.eventRootFrontierProbeSkipCount,
      eventRootFrontierProbeElapsedMs: profiling.eventRootFrontierProbeElapsedMs,
      exactCandidateJoinInitialCandidateElapsedMs: profiling.exactCandidateJoinInitialCandidateElapsedMs,
      exactCandidateJoinPairUpperElapsedMs: profiling.exactCandidateJoinPairUpperElapsedMs,
      exactCandidateJoinCandidateFillElapsedMs: profiling.exactCandidateJoinCandidateFillElapsedMs,
      exactCandidateJoinSolveElapsedMs: profiling.exactCandidateJoinSolveElapsedMs,
      exactCandidateJoinGlobalHeapRekeyElapsedMs: profiling.exactCandidateJoinGlobalHeapRekeyElapsedMs,
      exactCandidateJoinPairComplementQueryCount: profiling.exactCandidateJoinPairComplementQueryCount,
      exactCandidateJoinPairComplementScanCount: profiling.exactCandidateJoinPairComplementScanCount,
      exactCandidateJoinPairComplementHighPairBuildCount: profiling.exactCandidateJoinPairComplementHighPairBuildCount,
      exactCandidateJoinPairComplementHighPairBuildElapsedMs: profiling.exactCandidateJoinPairComplementHighPairBuildElapsedMs,
      inclusionUpperAnalysisCount: profiling.inclusionUpperAnalysisCount,
      inclusionUpperPrunedCardCount: profiling.inclusionUpperPrunedCardCount,
      capacityParetoUpperCallCount: profiling.capacityParetoUpperCallCount,
      capacityCardBoundUpperCallCount: profiling.capacityCardBoundUpperCallCount,
    };
    const traceEntry: Record<string, unknown> | null = configurationTrace
      ? {
        order: profiling.startedAreaItemConfigurationCount,
        configurationIndex,
        bandKey: configuration.bandKey,
        attribute: configuration.attribute,
        parameter: configuration.parameter,
        startedAtMs: Math.round(traceStartedAt - startedAt),
        initialBestScore: results[0]?.score ?? null,
        initialBestSeedPassScore: profiling.bestConfigurationSeedPassScore,
        slotCardCounts: slots.map((slot) => slot.searchCards.length),
        preConfigurationGcProbe,
      }
      : null;
    activeConfigurationMemorySoftLimitBytes = null;
    let didReleaseConfigurationSearchCaches = false;
    const releaseConfigurationSearchCaches = (): void => {
      if (didReleaseConfigurationSearchCaches) {
        return;
      }
      didReleaseConfigurationSearchCaches = true;
      releaseSlotSearchCaches(slots);
      bestSlotTeamCache.clear();
      remainingUpperBoundCache.clear();
      fixedCardSetOptimizationCache.clear();
      for (const candidates of slotCandidates) {
        candidates.length = 0;
      }
      slotCandidates = [];
      if (configurationIndex >= 0) {
        releaseConfigurationWarmupCache(configurationIndex);
      }
      activeConfigurationMemorySoftLimitBytes = null;
    };
    const finishConfigurationTrace = (status: string): void => {
      if (!configurationTrace || !traceEntry || traceEntry.status !== undefined) {
        releaseConfigurationSearchCaches();
        return;
      }
      const rememberedUnclosedUpperBound = configurationIndex >= 0
        ? unclosedConfigurationUpperBounds.get(configurationIndex)
        : undefined;
      Object.assign(traceEntry, {
        status,
        elapsedMs: Math.round(performance.now() - traceStartedAt),
        remainingBudgetMs: Math.round(getRemainingSearchMs()),
        peakUsedHeapMiB: stats.peakUsedHeapMiB,
        bestScore: results[0]?.score ?? null,
        observedRootUpperBound: configurationIndex >= 0
          ? getConfigurationObservedRootUpperBound(configurationIndex)
          : null,
        activeObservedUpperBound: Number.isFinite(activeConfigurationObservedScoreUpperBound)
          ? activeConfigurationObservedScoreUpperBound
          : null,
        activeObservedUpperSource: activeConfigurationObservedUpperBoundSource,
        activeTightUpperBound: Number.isFinite(activeConfigurationTightScoreUpperBound)
          ? activeConfigurationTightScoreUpperBound
          : null,
        activeTightUpperSource: activeConfigurationTightUpperBoundSource,
        rememberedUnclosedUpperBound: rememberedUnclosedUpperBound?.upperBound ?? null,
        rememberedUnclosedUpperSource: rememberedUnclosedUpperBound?.source ?? null,
        rememberedUnclosedUpperRemainingSlotCount: rememberedUnclosedUpperBound?.remainingSlotCount ?? null,
        evaluatedTeamCountDelta: stats.evaluatedTeamCount - traceStartCounters.evaluatedTeamCount,
        enumeratedTeamCountDelta: stats.enumeratedTeamCount - traceStartCounters.enumeratedTeamCount,
        visitedBranchCountDelta: visitedBranchCount - traceStartCounters.visitedBranchCount,
        exactCandidateJoinCallCountDelta: profiling.exactCandidateJoinCallCount - traceStartCounters.exactCandidateJoinCallCount,
        exactCandidateJoinCompletedCountDelta: (
          profiling.exactCandidateJoinCompletedCount - traceStartCounters.exactCandidateJoinCompletedCount
        ),
        exactCandidateJoinAbortCountDelta: profiling.exactCandidateJoinAbortCount - traceStartCounters.exactCandidateJoinAbortCount,
        exactCandidateJoinGeneratedCandidateCountDelta: (
          profiling.exactCandidateJoinGeneratedCandidateCount
          - traceStartCounters.exactCandidateJoinGeneratedCandidateCount
        ),
      exactCandidateJoinPairCountDelta: profiling.exactCandidateJoinPairCount - traceStartCounters.exactCandidateJoinPairCount,
      exactCandidateJoinThirdQueryCountDelta: (
        profiling.exactCandidateJoinThirdQueryCount - traceStartCounters.exactCandidateJoinThirdQueryCount
      ),
      exactCandidateJoinThirdShortlistQueryCountDelta: (
        profiling.exactCandidateJoinThirdShortlistQueryCount
        - traceStartCounters.exactCandidateJoinThirdShortlistQueryCount
      ),
      exactCandidateJoinThirdShortlistHitCountDelta: (
        profiling.exactCandidateJoinThirdShortlistHitCount
        - traceStartCounters.exactCandidateJoinThirdShortlistHitCount
      ),
      exactCandidateJoinThirdShortlistFallbackCountDelta: (
        profiling.exactCandidateJoinThirdShortlistFallbackCount
        - traceStartCounters.exactCandidateJoinThirdShortlistFallbackCount
      ),
      exactCandidateJoinThirdShortlistExhaustiveMissCountDelta: (
        profiling.exactCandidateJoinThirdShortlistExhaustiveMissCount
        - traceStartCounters.exactCandidateJoinThirdShortlistExhaustiveMissCount
      ),
      exactCandidateJoinThirdFallbackWordScanCountDelta: (
        profiling.exactCandidateJoinThirdFallbackWordScanCount
        - traceStartCounters.exactCandidateJoinThirdFallbackWordScanCount
      ),
      exactCandidateJoinExtendedThirdShortlistQueryCountDelta: (
        profiling.exactCandidateJoinExtendedThirdShortlistQueryCount
        - traceStartCounters.exactCandidateJoinExtendedThirdShortlistQueryCount
      ),
      exactCandidateJoinExtendedThirdShortlistHitCountDelta: (
        profiling.exactCandidateJoinExtendedThirdShortlistHitCount
        - traceStartCounters.exactCandidateJoinExtendedThirdShortlistHitCount
      ),
      exactCandidateJoinExtendedThirdShortlistFallbackCountDelta: (
        profiling.exactCandidateJoinExtendedThirdShortlistFallbackCount
        - traceStartCounters.exactCandidateJoinExtendedThirdShortlistFallbackCount
      ),
      exactCandidateJoinExtendedThirdShortlistExhaustiveMissCountDelta: (
        profiling.exactCandidateJoinExtendedThirdShortlistExhaustiveMissCount
        - traceStartCounters.exactCandidateJoinExtendedThirdShortlistExhaustiveMissCount
      ),
      exactCandidateJoinExtendedThirdShortlistCacheEntryCountDelta: (
        profiling.exactCandidateJoinExtendedThirdShortlistCacheEntryCount
        - traceStartCounters.exactCandidateJoinExtendedThirdShortlistCacheEntryCount
      ),
      exactCandidateJoinGuardedCandidateExtensionCountDelta: (
        profiling.exactCandidateJoinGuardedCandidateExtensionCount
        - traceStartCounters.exactCandidateJoinGuardedCandidateExtensionCount
      ),
      exactCandidateJoinAnchorFrontierProofTriggerCountDelta: (
        profiling.exactCandidateJoinAnchorFrontierProofTriggerCount
        - traceStartCounters.exactCandidateJoinAnchorFrontierProofTriggerCount
      ),
      exactCandidateJoinAnchorFrontierProofCompletedCountDelta: (
        profiling.exactCandidateJoinAnchorFrontierProofCompletedCount
        - traceStartCounters.exactCandidateJoinAnchorFrontierProofCompletedCount
      ),
      exactCandidateJoinAnchorFrontierProofTimeboxCountDelta: (
        profiling.exactCandidateJoinAnchorFrontierProofTimeboxCount
        - traceStartCounters.exactCandidateJoinAnchorFrontierProofTimeboxCount
      ),
      exactCandidateJoinAnchorFrontierProofSkipCountDelta: (
        profiling.exactCandidateJoinAnchorFrontierProofSkipCount
        - traceStartCounters.exactCandidateJoinAnchorFrontierProofSkipCount
      ),
      exactCandidateJoinAnchorFrontierCheapUpperCountDelta: (
        profiling.exactCandidateJoinAnchorFrontierCheapUpperCount
        - traceStartCounters.exactCandidateJoinAnchorFrontierCheapUpperCount
      ),
      exactCandidateJoinAnchorFrontierCheapUpperImprovementCountDelta: (
        profiling.exactCandidateJoinAnchorFrontierCheapUpperImprovementCount
        - traceStartCounters.exactCandidateJoinAnchorFrontierCheapUpperImprovementCount
      ),
      exactCandidateJoinAnchorFrontierCheapUpperTimeboxCountDelta: (
        profiling.exactCandidateJoinAnchorFrontierCheapUpperTimeboxCount
        - traceStartCounters.exactCandidateJoinAnchorFrontierCheapUpperTimeboxCount
      ),
      exactCandidateJoinLowMemoryInitialCandidateScoreCacheClearCountDelta: (
        profiling.exactCandidateJoinLowMemoryInitialCandidateScoreCacheClearCount
        - traceStartCounters.exactCandidateJoinLowMemoryInitialCandidateScoreCacheClearCount
      ),
      exactCandidateJoinAnchorFrontierImprovementProbeCountDelta: (
        profiling.exactCandidateJoinAnchorFrontierImprovementProbeCount
        - traceStartCounters.exactCandidateJoinAnchorFrontierImprovementProbeCount
      ),
      exactCandidateJoinAnchorFrontierImprovementProbeHitCountDelta: (
        profiling.exactCandidateJoinAnchorFrontierImprovementProbeHitCount
        - traceStartCounters.exactCandidateJoinAnchorFrontierImprovementProbeHitCount
      ),
      exactCandidateJoinAnchorFrontierImprovementProbeTimeboxCountDelta: (
        profiling.exactCandidateJoinAnchorFrontierImprovementProbeTimeboxCount
        - traceStartCounters.exactCandidateJoinAnchorFrontierImprovementProbeTimeboxCount
      ),
      exactCandidateJoinStagedCandidateExtensionCountDelta: (
        profiling.exactCandidateJoinStagedCandidateExtensionCount
        - traceStartCounters.exactCandidateJoinStagedCandidateExtensionCount
      ),
      exactCandidateJoinSmallGapSolveRetryCountDelta: (
        profiling.exactCandidateJoinSmallGapSolveRetryCount
        - traceStartCounters.exactCandidateJoinSmallGapSolveRetryCount
      ),
      exactCandidateJoinSmallGapSolveRetryTimeboxCountDelta: (
        profiling.exactCandidateJoinSmallGapSolveRetryTimeboxCount
        - traceStartCounters.exactCandidateJoinSmallGapSolveRetryTimeboxCount
      ),
      exactJoinPrefixSeedCallCountDelta: (
        profiling.exactJoinPrefixSeedCallCount - traceStartCounters.exactJoinPrefixSeedCallCount
      ),
      exactJoinPrefixSeedHitCountDelta: (
        profiling.exactJoinPrefixSeedHitCount - traceStartCounters.exactJoinPrefixSeedHitCount
      ),
      exactJoinPrefixSeedElapsedMsDelta: Math.round(
        profiling.exactJoinPrefixSeedElapsedMs - traceStartCounters.exactJoinPrefixSeedElapsedMs,
      ),
      exactJoinPrefixSeedTimedOutCountDelta: (
        profiling.exactJoinPrefixSeedTimedOutCount - traceStartCounters.exactJoinPrefixSeedTimedOutCount
      ),
      exactJoinPrefixSeedNoHitLocalTimeoutCountDelta: (
        profiling.exactJoinPrefixSeedNoHitLocalTimeoutCount
        - traceStartCounters.exactJoinPrefixSeedNoHitLocalTimeoutCount
      ),
      exactJoinPrefixSeedSkippedByCandidateCountDelta: (
        profiling.exactJoinPrefixSeedSkippedByCandidateCount
        - traceStartCounters.exactJoinPrefixSeedSkippedByCandidateCount
      ),
      exactJoinPrefixSeedGuardSkipCountDelta: (
        profiling.exactJoinPrefixSeedGuardSkipCount - traceStartCounters.exactJoinPrefixSeedGuardSkipCount
      ),
      exactJoinPrefixSeedGuardSkipReasonCountsDelta: subtractNumberMaps(
        profiling.exactJoinPrefixSeedGuardSkipReasonCounts,
        traceStartCounters.exactJoinPrefixSeedGuardSkipReasonCounts,
      ),
      eventRootFrontierProbeCallCountDelta: (
        profiling.eventRootFrontierProbeCallCount - traceStartCounters.eventRootFrontierProbeCallCount
      ),
      eventRootFrontierProbeProvedCountDelta: (
        profiling.eventRootFrontierProbeProvedCount - traceStartCounters.eventRootFrontierProbeProvedCount
      ),
      eventRootFrontierProbePrunedCountDelta: (
        profiling.eventRootFrontierProbePrunedCount - traceStartCounters.eventRootFrontierProbePrunedCount
      ),
      eventRootFrontierProbeUpperImprovementCountDelta: (
        profiling.eventRootFrontierProbeUpperImprovementCount
        - traceStartCounters.eventRootFrontierProbeUpperImprovementCount
      ),
      eventRootFrontierProbeTimeboxCountDelta: (
        profiling.eventRootFrontierProbeTimeboxCount - traceStartCounters.eventRootFrontierProbeTimeboxCount
      ),
      eventRootFrontierProbeSkipCountDelta: (
        profiling.eventRootFrontierProbeSkipCount - traceStartCounters.eventRootFrontierProbeSkipCount
      ),
      eventRootFrontierProbeElapsedMsDelta: Math.round(
        profiling.eventRootFrontierProbeElapsedMs - traceStartCounters.eventRootFrontierProbeElapsedMs,
      ),
      eventRootFrontierProbeLastReason: profiling.eventRootFrontierProbeLastReason,
      eventRootFrontierProbeLastStatus: profiling.eventRootFrontierProbeLastStatus,
      eventRootFrontierProbeLastUpperBefore: profiling.eventRootFrontierProbeLastUpperBefore,
      eventRootFrontierProbeLastUpperAfter: profiling.eventRootFrontierProbeLastUpperAfter,
      eventRootFrontierProbeLastResidualGap: profiling.eventRootFrontierProbeLastResidualGap,
      eventRootFrontierProbeLastPeakHeapMiB: profiling.eventRootFrontierProbeLastPeakHeapMiB,
      exactCandidateJoinInitialCandidateElapsedMsDelta: Math.round(
          profiling.exactCandidateJoinInitialCandidateElapsedMs
          - traceStartCounters.exactCandidateJoinInitialCandidateElapsedMs,
        ),
        exactCandidateJoinPairUpperElapsedMsDelta: Math.round(
          profiling.exactCandidateJoinPairUpperElapsedMs - traceStartCounters.exactCandidateJoinPairUpperElapsedMs,
        ),
        exactCandidateJoinCandidateFillElapsedMsDelta: Math.round(
          profiling.exactCandidateJoinCandidateFillElapsedMs
          - traceStartCounters.exactCandidateJoinCandidateFillElapsedMs,
        ),
        exactCandidateJoinSolveElapsedMsDelta: Math.round(
          profiling.exactCandidateJoinSolveElapsedMs - traceStartCounters.exactCandidateJoinSolveElapsedMs,
        ),
        exactCandidateJoinGlobalHeapRekeyElapsedMsDelta: Math.round(
          profiling.exactCandidateJoinGlobalHeapRekeyElapsedMs
          - traceStartCounters.exactCandidateJoinGlobalHeapRekeyElapsedMs,
        ),
        exactCandidateJoinPairComplementQueryCountDelta: (
          profiling.exactCandidateJoinPairComplementQueryCount
          - traceStartCounters.exactCandidateJoinPairComplementQueryCount
        ),
        exactCandidateJoinPairComplementScanCountDelta: (
          profiling.exactCandidateJoinPairComplementScanCount
          - traceStartCounters.exactCandidateJoinPairComplementScanCount
        ),
        exactCandidateJoinPairComplementHighPairBuildCountDelta: (
          profiling.exactCandidateJoinPairComplementHighPairBuildCount
          - traceStartCounters.exactCandidateJoinPairComplementHighPairBuildCount
        ),
        exactCandidateJoinPairComplementHighPairBuildElapsedMsDelta: Math.round(
          profiling.exactCandidateJoinPairComplementHighPairBuildElapsedMs
          - traceStartCounters.exactCandidateJoinPairComplementHighPairBuildElapsedMs,
        ),
        inclusionUpperAnalysisCountDelta: profiling.inclusionUpperAnalysisCount - traceStartCounters.inclusionUpperAnalysisCount,
        inclusionUpperPrunedCardCountDelta: profiling.inclusionUpperPrunedCardCount - traceStartCounters.inclusionUpperPrunedCardCount,
        capacityParetoUpperCallCountDelta: profiling.capacityParetoUpperCallCount - traceStartCounters.capacityParetoUpperCallCount,
        capacityCardBoundUpperCallCountDelta: profiling.capacityCardBoundUpperCallCount - traceStartCounters.capacityCardBoundUpperCallCount,
      });
      if (profiling.exactCandidateJoinCallCount > traceStartCounters.exactCandidateJoinCallCount) {
        Object.assign(traceEntry, {
          exactCandidateJoinBestSlotScores: [...profiling.exactCandidateJoinLastBestSlotScores],
          exactCandidateJoinPairUpperByExcludedSlot: [...profiling.exactCandidateJoinLastPairUpperByExcludedSlot],
          exactCandidateJoinPairUnseenUpperByExcludedSlot: [
            ...profiling.exactCandidateJoinLastPairUnseenUpperByExcludedSlot,
          ],
          exactCandidateJoinPairRootUpperBound: profiling.exactCandidateJoinLastPairRootUpperBound,
          exactCandidateJoinCandidateCutoffsBySlot: [
            ...profiling.exactCandidateJoinLastCandidateCutoffsBySlot,
          ],
          exactCandidateJoinOtherUpperBySlot: [...profiling.exactCandidateJoinLastOtherUpperBySlot],
          exactCandidateJoinRelaxedOtherUpperBySlot: [
            ...profiling.exactCandidateJoinLastRelaxedOtherUpperBySlot,
          ],
          exactCandidateJoinRemainingOtherUpperBySlot: [
            ...profiling.exactCandidateJoinLastRemainingOtherUpperBySlot,
          ],
          exactCandidateJoinLastCandidateCountsBySlot: [
            ...profiling.exactCandidateJoinLastCandidateCountsBySlot,
          ],
          exactCandidateJoinLastCandidateFillElapsedMsBySlot: [
            ...profiling.exactCandidateJoinLastCandidateFillElapsedMsBySlot.map((elapsedMs) => Math.round(elapsedMs)),
          ],
          exactCandidateJoinAbortReason: profiling.exactCandidateJoinLastAbortReason,
          exactCandidateJoinAbortSlotIndex: profiling.exactCandidateJoinLastAbortSlotIndex,
          exactCandidateJoinAbortCandidateSoftLimit: profiling.exactCandidateJoinLastAbortCandidateSoftLimit,
          exactCandidateJoinAbortNodeSoftLimit: profiling.exactCandidateJoinLastAbortNodeSoftLimit,
          exactCandidateJoinAbortCandidateCount: profiling.exactCandidateJoinLastAbortCandidateCount,
          exactCandidateJoinAbortCutoff: profiling.exactCandidateJoinLastAbortCutoff,
          exactCandidateJoinAbortPeekUpperBound: profiling.exactCandidateJoinLastAbortPeekUpperBound,
          exactCandidateJoinAbortOtherUpper: profiling.exactCandidateJoinLastAbortOtherUpper,
          exactCandidateJoinAbortObservedUpperBound: profiling.exactCandidateJoinLastAbortObservedUpperBound,
          exactCandidateJoinAbortRemainingMs: profiling.exactCandidateJoinLastAbortRemainingMs,
          exactCandidateJoinLastGuardedExtensionSlotIndex: (
            profiling.exactCandidateJoinLastGuardedExtensionSlotIndex
          ),
          exactCandidateJoinLastGuardedExtensionLimit: profiling.exactCandidateJoinLastGuardedExtensionLimit,
          exactCandidateJoinLastGuardedExtensionRemainingMs: (
            profiling.exactCandidateJoinLastGuardedExtensionRemainingMs
          ),
          exactCandidateJoinLastGuardedExtensionPeakHeapMiB: (
            profiling.exactCandidateJoinLastGuardedExtensionPeakHeapMiB
          ),
          exactCandidateJoinLastGuardedExtensionObservedUpperBound: (
            profiling.exactCandidateJoinLastGuardedExtensionObservedUpperBound
          ),
          exactCandidateJoinLastAnchorFrontierProofSkipReason: (
            profiling.exactCandidateJoinLastAnchorFrontierProofSkipReason
          ),
          exactCandidateJoinLastAnchorFrontierProofHighPairRecordUpperCount: (
            profiling.exactCandidateJoinLastAnchorFrontierProofHighPairRecordUpperCount
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperSlotIndex: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSlotIndex
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperProcessedAnchorCount: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperProcessedAnchorCount
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperResidualUpperBound: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperResidualUpperBound
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperResidualGap: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperResidualGap
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperElapsedMs: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperElapsedMs
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperTimeboxMs: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperTimeboxMs
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperOtherSlotCandidateCounts: [
            ...profiling.exactCandidateJoinLastAnchorFrontierCheapUpperOtherSlotCandidateCounts,
          ],
          exactCandidateJoinLastAnchorFrontierCheapUpperPeakHeapMiB: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperPeakHeapMiB
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperMaxSource: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxSource
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperMaxAnchorScore: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxAnchorScore
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperMaxPairUpper: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxPairUpper
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairUpper: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairUpper
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperMaxLeftUnseenUpper: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxLeftUnseenUpper
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperMaxRightUnseenUpper: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxRightUnseenUpper
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairOverlaps: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairOverlaps
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairScoreOnly: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairScoreOnly
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairFullScore: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairFullScore
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairScoreSlack: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperMaxGeneratedPairScoreSlack
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperSplitAttemptCount: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSplitAttemptCount
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperSplitStateCount: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSplitStateCount
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperSplitAbortReason: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperSplitAbortReason
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineAttemptCount: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineAttemptCount
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineCandidateCount: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineCandidateCount
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineImprovementCount: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineImprovementCount
          ),
          exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineAbortReason: (
            profiling.exactCandidateJoinLastAnchorFrontierCheapUpperUnseenRefineAbortReason
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateScoreCacheClearInterval: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateScoreCacheClearInterval
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateSlotIndex: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateSlotIndex
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateAbortReason: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortReason
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateVisitedNodeCount: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateVisitedNodeCount
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateEvaluatedTeamCount: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluatedTeamCount
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateBestScore: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestScore
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateBestCardIds: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestCardIds
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateBestCardInstanceKeys: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestCardInstanceKeys
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateBestSkillIds: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestSkillIds
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateBestPowers: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateBestPowers
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateStartUsedMiB: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateStartUsedMiB
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateStartNodeHeapMiB: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateStartNodeHeapMiB
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateStartRssMiB: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateStartRssMiB
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitUsedMiB: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitUsedMiB
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitNodeHeapMiB: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitNodeHeapMiB
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitRssMiB: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateBeforeVisitRssMiB
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeUsedMiB: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeUsedMiB
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterUsedMiB: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterUsedMiB
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeNodeHeapMiB: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeNodeHeapMiB
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterNodeHeapMiB: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterNodeHeapMiB
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeRssMiB: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationBeforeRssMiB
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterRssMiB: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateEvaluationAfterRssMiB
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateAbortUsedMiB: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortUsedMiB
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateAbortLimitMiB: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortLimitMiB
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateAbortHeadroomMiB: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortHeadroomMiB
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateAbortNodeHeapMiB: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortNodeHeapMiB
          ),
          exactCandidateJoinLastLowMemoryInitialCandidateAbortRssMiB: (
            profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortRssMiB
          ),
          exactCandidateJoinLastAnchorFrontierImprovementProbeProcessedAnchorCount: (
            profiling.exactCandidateJoinLastAnchorFrontierImprovementProbeProcessedAnchorCount
          ),
          exactCandidateJoinLastAnchorFrontierImprovementProbeElapsedMs: (
            profiling.exactCandidateJoinLastAnchorFrontierImprovementProbeElapsedMs
          ),
          exactCandidateJoinLastAnchorFrontierImprovementProbeScore: (
            profiling.exactCandidateJoinLastAnchorFrontierImprovementProbeScore
          ),
          exactCandidateJoinLastAnchorFrontierProofSlotIndex: (
            profiling.exactCandidateJoinLastAnchorFrontierProofSlotIndex
          ),
          exactCandidateJoinLastAnchorFrontierProofProcessedAnchorCount: (
            profiling.exactCandidateJoinLastAnchorFrontierProofProcessedAnchorCount
          ),
          exactCandidateJoinLastAnchorFrontierProofResidualUpperBound: (
            profiling.exactCandidateJoinLastAnchorFrontierProofResidualUpperBound
          ),
          exactCandidateJoinLastAnchorFrontierProofResidualGap: (
            profiling.exactCandidateJoinLastAnchorFrontierProofResidualGap
          ),
          exactCandidateJoinLastAnchorFrontierProofElapsedMs: (
            profiling.exactCandidateJoinLastAnchorFrontierProofElapsedMs
          ),
          exactCandidateJoinLastAnchorFrontierProofTimeboxMs: (
            profiling.exactCandidateJoinLastAnchorFrontierProofTimeboxMs
          ),
          exactCandidateJoinLastAnchorFrontierProofOtherSlotCandidateCounts: [
            ...profiling.exactCandidateJoinLastAnchorFrontierProofOtherSlotCandidateCounts,
          ],
          exactCandidateJoinLastAnchorFrontierProofPeakHeapMiB: (
            profiling.exactCandidateJoinLastAnchorFrontierProofPeakHeapMiB
          ),
          exactCandidateJoinLastStagedExtensionSlotIndex: (
            profiling.exactCandidateJoinLastStagedExtensionSlotIndex
          ),
          exactCandidateJoinLastStagedExtensionLimit: profiling.exactCandidateJoinLastStagedExtensionLimit,
          exactCandidateJoinLastStagedExtensionPeekCutoffGap: (
            profiling.exactCandidateJoinLastStagedExtensionPeekCutoffGap
          ),
          exactCandidateJoinLastStagedExtensionCandidateCountsBySlot: [
            ...profiling.exactCandidateJoinLastStagedExtensionCandidateCountsBySlot,
          ],
          exactCandidateJoinLastStagedExtensionOtherSlotCandidateCounts: [
            ...profiling.exactCandidateJoinLastStagedExtensionOtherSlotCandidateCounts,
          ],
          exactCandidateJoinLastStagedExtensionRemainingMs: (
            profiling.exactCandidateJoinLastStagedExtensionRemainingMs
          ),
          exactCandidateJoinLastStagedExtensionPeakHeapMiB: (
            profiling.exactCandidateJoinLastStagedExtensionPeakHeapMiB
          ),
          exactCandidateJoinLastSmallGapSolveRetryCandidateLimit: (
            profiling.exactCandidateJoinLastSmallGapSolveRetryCandidateLimit
          ),
          exactCandidateJoinLastSmallGapSolveRetryCandidateCountsBySlot: [
            ...profiling.exactCandidateJoinLastSmallGapSolveRetryCandidateCountsBySlot,
          ],
          exactCandidateJoinLastSmallGapSolveRetryUpperGap: (
            profiling.exactCandidateJoinLastSmallGapSolveRetryUpperGap
          ),
          exactCandidateJoinLastSmallGapSolveRetryRemainingMs: (
            profiling.exactCandidateJoinLastSmallGapSolveRetryRemainingMs
          ),
          exactCandidateJoinLastSmallGapSolveRetryTimeboxMs: (
            profiling.exactCandidateJoinLastSmallGapSolveRetryTimeboxMs
          ),
          exactCandidateJoinLastSmallGapSolveRetryPeakHeapMiB: (
            profiling.exactCandidateJoinLastSmallGapSolveRetryPeakHeapMiB
          ),
          exactJoinPrefixSeedCandidateCountsBySlot: [
            ...profiling.exactJoinPrefixSeedCandidateCountsBySlot,
          ],
          exactJoinPrefixSeedPeakHeapMiB: profiling.exactJoinPrefixSeedPeakHeapMiB,
          exactJoinPrefixSeedLastGuardSkipReason: profiling.exactJoinPrefixSeedLastGuardSkipReason,
          exactJoinPrefixSeedGuardSkipReasonCounts: {
            ...profiling.exactJoinPrefixSeedGuardSkipReasonCounts,
          },
        });
      }
      configurationTrace.push(traceEntry);
      releaseConfigurationSearchCaches();
      if (
        enableLowMemoryInitialCandidateSyncGcProbe
        && traceEntry.lowMemoryInitialCandidateSync === true
      ) {
        const gcProbe = runLowMemoryInitialCandidateSyncGcProbe();
        if (gcProbe.ran === true) {
          Object.assign(traceEntry, {
            lowMemoryInitialCandidateSyncGcProbe: true,
            lowMemoryInitialCandidateSyncGcProbeElapsedMs: gcProbe.elapsedMs,
            lowMemoryInitialCandidateSyncGcProbeBeforeMiB: gcProbe.beforeMiB,
            lowMemoryInitialCandidateSyncGcProbeAfterMiB: gcProbe.afterMiB,
            lowMemoryInitialCandidateSyncGcProbeBeforePerformanceMiB: gcProbe.beforePerformanceMiB,
            lowMemoryInitialCandidateSyncGcProbeAfterPerformanceMiB: gcProbe.afterPerformanceMiB,
            lowMemoryInitialCandidateSyncGcProbeBeforeNodeHeapMiB: gcProbe.beforeNodeHeapMiB,
            lowMemoryInitialCandidateSyncGcProbeAfterNodeHeapMiB: gcProbe.afterNodeHeapMiB,
            lowMemoryInitialCandidateSyncGcProbeBeforeNodeRssMiB: gcProbe.beforeNodeRssMiB,
            lowMemoryInitialCandidateSyncGcProbeAfterNodeRssMiB: gcProbe.afterNodeRssMiB,
            lowMemoryInitialCandidateSyncGcProbeBeforeNodeUsedMiB: gcProbe.beforeNodeUsedMiB,
            lowMemoryInitialCandidateSyncGcProbeAfterNodeUsedMiB: gcProbe.afterNodeUsedMiB,
          });
        } else {
          traceEntry.lowMemoryInitialCandidateSyncGcProbeUnavailable = true;
        }
      }
    };

    // This is the central proof boundary for DFS. Callers may ask for tighter model families,
    // but every returned value must remain an optimistic upper bound for all feasible remaining
    // slot assignments under the current banned-card set.
    const getRemainingUpperBound = (
      remainingSlotIndices: number[],
      bannedCardIds: Set<number>,
      useContextualSkillUpper = false,
      useSkillAwareCapacityUpper = false,
      useParetoCapacityUpper = false,
      useBucketedCapacityUpper = false,
      upperReplayPruningCutoff: number | null = null,
    ): number => {
      profiling.remainingUpperBoundCallCount += 1;
      if (remainingSlotIndices.length === 0) {
        return 0;
      }
      const key = `${slotCandidates.length === slots.length ? "candidates-ready" : "candidates-pending"}:${enableAnchorSlotUpper ? `anchor-${anchorCandidateLimit}` : "no-anchor"}:${shouldEnableOpportunityCostUpper ? `opportunity-${opportunityAnchorLimit}` : "no-opportunity"}:${enableTeamSharedCoefficientUpper ? "team-shared" : "no-team-shared"}:${enableSharedPowerSkillUpper ? "shared-power" : "no-shared-power"}:${useContextualSkillUpper ? "contextual" : "optimistic"}:${useSkillAwareCapacityUpper ? "tight-capacity" : "coefficient"}:${useParetoCapacityUpper ? "pareto" : "scalar"}:${useBucketedCapacityUpper ? "bucketed" : "unbucketed"}:${remainingSlotIndices.join(",")}:${[...bannedCardIds].sort((left, right) => left - right).join(",")}`;
      const cached = remainingUpperBoundCache.get(key);
      if (cached !== undefined) {
        profiling.remainingUpperBoundCacheHitCount += 1;
        return cached;
      }
      profiling.remainingUpperBoundCacheMissCount += 1;
      const previousRemainingUpperBoundMax = {
        remainingUpperBoundMax: profiling.remainingUpperBoundMax,
        remainingUpperBoundMaxCorrelated: profiling.remainingUpperBoundMaxCorrelated,
        remainingUpperBoundMaxCapacity: profiling.remainingUpperBoundMaxCapacity,
        remainingUpperBoundMaxCapacityMode: profiling.remainingUpperBoundMaxCapacityMode,
        remainingUpperBoundMaxSlotCount: profiling.remainingUpperBoundMaxSlotCount,
        remainingUpperBoundMaxLimiter: profiling.remainingUpperBoundMaxLimiter,
      };
      const upperBannedCardIds = toUpperBannedCardIds(bannedCardIds);
      const getRemainingUpperBoundFromCardIds = (
        nextRemainingSlotIndices: number[],
        nextBannedCardIds: Set<number>,
        nextUseContextualSkillUpper = false,
        nextUseSkillAwareCapacityUpper = false,
        nextUseParetoCapacityUpper = false,
        nextUseBucketedCapacityUpper = false,
      ): number => getRemainingUpperBound(
        nextRemainingSlotIndices,
        nextBannedCardIds,
        nextUseContextualSkillUpper,
        nextUseSkillAwareCapacityUpper,
        nextUseParetoCapacityUpper,
        nextUseBucketedCapacityUpper,
      );
      let upperBound = estimateMedleyRemainingScoreUpperBound(
        slots,
        remainingSlotIndices,
        upperBannedCardIds,
        profiling,
        useContextualSkillUpper,
        useSkillAwareCapacityUpper,
        useParetoCapacityUpper,
        useBucketedCapacityUpper,
        enableTeamSharedCoefficientUpper,
        enableSharedPowerSkillUpper,
      );
      if (
        enableAnchorSlotUpper
        && useSkillAwareCapacityUpper
        && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
        && bannedCardIds.size === 0
        && !hasDuplicateCardIds
        && slotCandidates.length === slots.length
      ) {
        const anchorUpperEstimate = estimateMedleyAnchorSlotDecompositionUpperBound(
          slots,
          remainingSlotIndices,
          upperBannedCardIds,
          slotCandidates,
          slotCandidateLimits,
          getRemainingUpperBoundFromCardIds,
          useContextualSkillUpper,
          useSkillAwareCapacityUpper,
          useParetoCapacityUpper,
          useBucketedCapacityUpper,
          anchorCandidateLimit,
          profiling,
        );
        if (anchorUpperEstimate && anchorUpperEstimate.upperBound < upperBound) {
          const improvement = upperBound - anchorUpperEstimate.upperBound;
          profiling.capacityAnchorSlotUpperImprovementCount += 1;
          profiling.capacityAnchorSlotUpperImprovementTotal += improvement;
          profiling.bestCapacityAnchorSlotUpperImprovement = Math.max(
            profiling.bestCapacityAnchorSlotUpperImprovement,
            improvement,
          );
          if (profiling.remainingUpperBoundMax === upperBound) {
            Object.assign(profiling, previousRemainingUpperBoundMax);
          }
          upperBound = anchorUpperEstimate.upperBound;
          if (
            Number.isFinite(upperBound)
            && upperBound > (profiling.remainingUpperBoundMax ?? Number.NEGATIVE_INFINITY)
          ) {
            profiling.remainingUpperBoundMax = upperBound;
            profiling.remainingUpperBoundMaxCorrelated = previousRemainingUpperBoundMax.remainingUpperBoundMaxCorrelated;
            profiling.remainingUpperBoundMaxCapacity = upperBound;
            profiling.remainingUpperBoundMaxCapacityMode = "anchor-slot-decomposition";
            profiling.remainingUpperBoundMaxSlotCount = remainingSlotIndices.length;
            profiling.remainingUpperBoundMaxLimiter = "capacity";
          }
        }
      }
      if (
        shouldEnableOpportunityCostUpper
        && useSkillAwareCapacityUpper
        && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
        && bannedCardIds.size === 0
        && !hasDuplicateCardIds
        && slotCandidates.length === slots.length
      ) {
        const opportunityUpperEstimate = estimateMedleyOpportunityCostUpperBound(
          slots,
          remainingSlotIndices,
          upperBannedCardIds,
          slotCandidates,
          getRemainingUpperBoundFromCardIds,
          useContextualSkillUpper,
          useSkillAwareCapacityUpper,
          useParetoCapacityUpper,
          useBucketedCapacityUpper,
          opportunityAnchorLimit,
          profiling,
        );
        if (opportunityUpperEstimate && opportunityUpperEstimate.upperBound < upperBound) {
          const improvement = upperBound - opportunityUpperEstimate.upperBound;
          profiling.capacityOpportunityCostUpperImprovementCount += 1;
          profiling.capacityOpportunityCostUpperImprovementTotal += improvement;
          profiling.bestCapacityOpportunityCostUpperImprovement = Math.max(
            profiling.bestCapacityOpportunityCostUpperImprovement,
            improvement,
          );
          if (profiling.remainingUpperBoundMax === upperBound) {
            Object.assign(profiling, previousRemainingUpperBoundMax);
          }
          upperBound = opportunityUpperEstimate.upperBound;
          if (
            Number.isFinite(upperBound)
            && upperBound > (profiling.remainingUpperBoundMax ?? Number.NEGATIVE_INFINITY)
          ) {
            profiling.remainingUpperBoundMax = upperBound;
            profiling.remainingUpperBoundMaxCorrelated = previousRemainingUpperBoundMax.remainingUpperBoundMaxCorrelated;
            profiling.remainingUpperBoundMaxCapacity = upperBound;
            profiling.remainingUpperBoundMaxCapacityMode = "opportunity-cost";
            profiling.remainingUpperBoundMaxSlotCount = remainingSlotIndices.length;
            profiling.remainingUpperBoundMaxLimiter = "capacity";
          }
        }
      }
      if (captureUpperWitness && remainingSlotIndices.length === MEDLEY_TEAM_COUNT && bannedCardIds.size === 0) {
        captureMedleyRootUpperWitness(slots, remainingSlotIndices, slotCandidates, upperBound, profiling);
      }
      if (
        captureCapacityUpperWitness
        && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
        && bannedCardIds.size === 0
        && !hasDuplicateCardIds
      ) {
        captureMedleyCapacityUpperWitness(
          slots,
          remainingSlotIndices,
          upperBannedCardIds,
          upperBound,
          server,
          perfectRate,
          profiling,
        );
      }
      const shouldSampleReplay = (
        results.length >= resultLimit
        && profiling.upperReplayStateCount < MEDLEY_UPPER_REPLAY_SAMPLE_LIMIT
        && Number.isFinite(upperBound)
        && (
          useContextualSkillUpper
          || useSkillAwareCapacityUpper
          || useParetoCapacityUpper
          || useBucketedCapacityUpper
          || enableTeamSharedCoefficientUpper
          || enableAnchorSlotUpper
          || shouldEnableOpportunityCostUpper
        )
      );
      if (shouldSampleReplay) {
        const replayStartedAt = performance.now();
        const baselineUpperBound = estimateMedleyRemainingScoreUpperBound(
          slots,
          remainingSlotIndices,
          upperBannedCardIds,
          undefined,
          false,
          false,
          false,
          false,
          false,
        );
        profiling.upperReplayElapsedMs += performance.now() - replayStartedAt;
        recordUpperReplay(baselineUpperBound, upperBound, upperReplayPruningCutoff);
      }
      remainingUpperBoundCache.set(key, upperBound);
      return upperBound;
    };
    const rootScoreUpperBound = configurationIndex >= 0
      ? getConfigurationRootUpperBound(configurationIndex)
      : slots.reduce((sum, slot) => sum + slot.rootScoreUpperBound, 0);
    if (traceEntry) {
      traceEntry.rootScoreUpperBound = rootScoreUpperBound;
    }
    profiling.rootUpperBestConfigurationUpperBound = Math.max(
      profiling.rootUpperBestConfigurationUpperBound ?? Number.NEGATIVE_INFINITY,
      rootScoreUpperBound,
    );
    const threshold = getMedleyPruningThreshold(results, resultLimit);
    if (results.length >= resultLimit && rootScoreUpperBound < threshold) {
      stats.prunedBranchCount += 1;
      profiling.rootUpperPrunedConfigurationCount += 1;
      finishConfigurationTrace("root-pruned");
      closeActiveConfiguration();
      continue;
    }
    let basicSkillAwareRootUpperBoundForConfiguration: number | null = null;
    const getBasicSkillAwareRootUpperBoundForConfiguration = (): number | null => {
      if (
        !shouldUseBasicSkillAwareRootCapacityPrefilter
        || configurationIndex < 0
      ) {
        return null;
      }
      if (basicSkillAwareRootUpperBoundForConfiguration === null) {
        basicSkillAwareRootUpperBoundForConfiguration = Math.min(
          rootScoreUpperBound,
          getConfigurationBasicSkillAwareRootUpperBound(configurationIndex),
        );
        if (traceEntry) {
          traceEntry.basicSkillAwareRootUpperBound = basicSkillAwareRootUpperBoundForConfiguration;
        }
      }
      return basicSkillAwareRootUpperBoundForConfiguration;
    };
    if (
      results.length >= resultLimit
      && shouldUseBasicSkillAwareRootCapacityPrefilter
      && configurationIndex >= 0
    ) {
      const basicSkillAwareRootUpperBound = getBasicSkillAwareRootUpperBoundForConfiguration();
      if (basicSkillAwareRootUpperBound !== null) {
        observeUpperBound(basicSkillAwareRootUpperBound, "configuration-root", MEDLEY_TEAM_COUNT);
        if (basicSkillAwareRootUpperBound < threshold) {
          stats.prunedBranchCount += 1;
          profiling.rootUpperPrunedConfigurationCount += 1;
          finishConfigurationTrace("basic-root-pruned");
          closeActiveConfiguration();
          continue;
        }
      }
    }
    const canRunExactCandidateJoinForCurrentSlots = (): boolean => (
      enableExactCandidateJoin
      && (
        optimization.enableExactCandidateJoin === true
        || slots.every((slot) => slot.searchCards.length <= MEDLEY_EXACT_JOIN_AUTO_MAX_SLOT_CARDS)
      )
    );
    let shouldRunExactCandidateJoinForConfiguration = canRunExactCandidateJoinForCurrentSlots();
    const incumbentScore = results[0]?.score ?? Number.NEGATIVE_INFINITY;
    const bestSeedPassScore = profiling.bestConfigurationSeedPassScore ?? Number.NEGATIVE_INFINITY;
    const currentCoarseKey = getMedleyAreaItemCoarseKey(configuration);
    const sameCoarseMaxExactJoinProofElapsedMs = exactCandidateJoinProofElapsedMsByCoarseKey.get(
      currentCoarseKey,
    ) ?? 0;
    const maxLowMemoryInitialCandidateSyncSlotCardCount = Math.max(
      0,
      ...slots.map((slot) => slot.searchCards.length),
    );
    const isFirstStartedAreaItemConfiguration = profiling.startedAreaItemConfigurationCount === 1;
    const hasFullWidthEventExactJoinMemoryRisk = (
      hasEventBonus
      && isFirstStartedAreaItemConfiguration
      && maxLowMemoryInitialCandidateSyncSlotCardCount
        === MEDLEY_LOW_MEMORY_INITIAL_CANDIDATE_SYNC_EVENT_ROOT_RISK_SLOT_CARD_COUNT
    );
    const hasLowMemoryInitialCandidateSyncSlotWidth = (
      !hasFullWidthEventExactJoinMemoryRisk
    );
    if (hasFullWidthEventExactJoinMemoryRisk) {
      activeConfigurationMemorySoftLimitBytes = (
        MEDLEY_FULL_WIDTH_EVENT_EXACT_JOIN_MEMORY_SOFT_LIMIT_MIB * BYTES_PER_MIB
      );
    }
    const shouldApplyLowMemoryInitialCandidateSyncSameCoarseProofElapsedGuard = (
      maxLowMemoryInitialCandidateSyncSlotCardCount
        <= MEDLEY_LOW_MEMORY_INITIAL_CANDIDATE_SYNC_SAME_COARSE_GUARD_MAX_SLOT_CARD_COUNT
    );
    const lowMemoryInitialCandidateSyncUsedHeapBytes = readUsedHeapBytes();
    const lowMemoryInitialCandidateSyncUsedMiB = lowMemoryInitialCandidateSyncUsedHeapBytes !== null
      ? Math.ceil(lowMemoryInitialCandidateSyncUsedHeapBytes / BYTES_PER_MIB)
      : null;
    const lowMemoryInitialCandidateSyncSoftLimitMiB = getEffectiveMemorySoftLimitMiB();
    const lowMemoryInitialCandidateSyncMemoryHeadroomMiB = (
      lowMemoryInitialCandidateSyncSoftLimitMiB !== null
      && lowMemoryInitialCandidateSyncUsedMiB !== null
    )
      ? lowMemoryInitialCandidateSyncSoftLimitMiB - lowMemoryInitialCandidateSyncUsedMiB
      : null;
    const hasLowMemoryInitialCandidateSyncMemoryHeadroom = (
      lowMemoryInitialCandidateSyncMemoryHeadroomMiB === null
      || lowMemoryInitialCandidateSyncMemoryHeadroomMiB >= lowMemoryInitialCandidateSyncMinMemoryHeadroomMiB
    );
    const shouldAbortLowMemoryInitialCandidateSync = (): boolean => {
      const usedHeapBytes = readUsedHeapBytes();
      const effectiveLimitBytes = getEffectiveMemorySoftLimitBytes();
      if (usedHeapBytes === null || effectiveLimitBytes === null) {
        return false;
      }
      const shouldAbort = (
        effectiveLimitBytes - usedHeapBytes
        < lowMemoryInitialCandidateSyncMinMemoryHeadroomMiB * BYTES_PER_MIB
      );
      if (shouldAbort) {
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortUsedMiB = (
          Math.ceil(usedHeapBytes / BYTES_PER_MIB)
        );
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortLimitMiB = (
          Math.floor(effectiveLimitBytes / BYTES_PER_MIB)
        );
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortHeadroomMiB = (
          Math.floor((effectiveLimitBytes - usedHeapBytes) / BYTES_PER_MIB)
        );
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortNodeHeapMiB = (
          profiling.lastNodeHeapUsedMiB
        );
        profiling.exactCandidateJoinLastLowMemoryInitialCandidateAbortRssMiB = (
          profiling.lastNodeRssMiB
        );
      }
      return shouldAbort;
    };
    const shouldUseLowMemoryInitialCandidateSync = (
      !disableLowMemoryInitialCandidateSync
      && hasLowMemoryInitialCandidateSyncSlotWidth
      && (
        !shouldApplyLowMemoryInitialCandidateSyncSameCoarseProofElapsedGuard
        || sameCoarseMaxExactJoinProofElapsedMs < lowMemoryInitialCandidateSyncMaxSameCoarseProofElapsedMs
      )
      && hasLowMemoryInitialCandidateSyncMemoryHeadroom
    );
    const sameCoarseSiblingFrontier = configurationIndex >= 0
      ? getSameCoarseSiblingFrontier(configurationIndex, threshold)
      : [];
    const sameCoarseDfsAfterUnprovedProofCount = sameCoarseDfsAfterUnprovedProofCounts.get(
      currentCoarseKey,
    ) ?? 0;
    const sameCoarseSiblingBlockedStagedExtension = (
      enableExperimentalStagedCandidateExtension
      && configurationIndex >= 0
      && sameCoarseSiblingFrontier.some((entry) => (
        entry.unresolvedAboveIncumbent === true
        && asFiniteNumber(entry.rememberedUnclosedUpperBound) !== null
      ))
    );
    const sameCoarseSiblingBlockedSmallGapSolveRetry = sameCoarseSiblingFrontier.some((entry) => (
      entry.unresolvedAboveIncumbent === true
    ));
    if (traceEntry && sameCoarseSiblingFrontier.length > 0) {
      traceEntry.sameCoarseSiblingFrontier = sameCoarseSiblingFrontier;
      traceEntry.sameCoarseSiblingBlocked = sameCoarseSiblingBlockedSmallGapSolveRetry;
      traceEntry.sameCoarseSiblingBlockedStagedExtension = sameCoarseSiblingBlockedStagedExtension;
      traceEntry.sameCoarseSiblingBlockedSmallGapSolveRetry = sameCoarseSiblingBlockedSmallGapSolveRetry;
    }
    if (traceEntry) {
      traceEntry.lowMemoryInitialCandidateSync = shouldUseLowMemoryInitialCandidateSync;
      traceEntry.lowMemoryInitialCandidateSyncLocalAbortOnly = lowMemoryInitialCandidateSyncLocalAbortOnly;
      traceEntry.lowMemoryInitialCandidateSyncLightUpper = lowMemoryInitialCandidateSyncLightUpper;
      traceEntry.lowMemoryInitialCandidateSyncSameCoarseProofElapsedMs = Math.round(
        sameCoarseMaxExactJoinProofElapsedMs,
      );
      traceEntry.lowMemoryInitialCandidateSyncTimeboxMs = lowMemoryInitialCandidateSyncTimeboxMs;
      traceEntry.lowMemoryInitialCandidateSyncMaxSameCoarseProofElapsedMs = (
        lowMemoryInitialCandidateSyncMaxSameCoarseProofElapsedMs
      );
      traceEntry.lowMemoryInitialCandidateSyncUsedMiB = lowMemoryInitialCandidateSyncUsedMiB;
      traceEntry.lowMemoryInitialCandidateSyncSoftLimitMiB = lowMemoryInitialCandidateSyncSoftLimitMiB;
      traceEntry.lowMemoryInitialCandidateSyncMemoryHeadroomMiB = lowMemoryInitialCandidateSyncMemoryHeadroomMiB;
      traceEntry.lowMemoryInitialCandidateSyncMinMemoryHeadroomMiB = (
        lowMemoryInitialCandidateSyncMinMemoryHeadroomMiB
      );
      traceEntry.lowMemoryInitialCandidateSyncMaxSlotCardCount = (
        lowMemoryInitialCandidateSyncMaxSlotCardCount
      );
      traceEntry.lowMemoryInitialCandidateSyncScoreCacheClearInterval = (
        lowMemoryInitialCandidateSyncScoreCacheClearInterval
      );
      traceEntry.lowMemoryInitialCandidateSyncDirectCandidate = lowMemoryInitialCandidateSyncDirectCandidate;
      traceEntry.lowMemoryInitialCandidateSyncObservedMaxSlotCardCount = (
        maxLowMemoryInitialCandidateSyncSlotCardCount
      );
      traceEntry.lowMemoryInitialCandidateSyncHasEventBonus = hasEventBonus;
      traceEntry.lowMemoryInitialCandidateSyncFirstStartedConfiguration = isFirstStartedAreaItemConfiguration;
      traceEntry.fullWidthEventExactJoinMemoryRisk = hasFullWidthEventExactJoinMemoryRisk;
      traceEntry.fullWidthEventExactJoinMemoryRiskSlotCardCount = (
        MEDLEY_LOW_MEMORY_INITIAL_CANDIDATE_SYNC_EVENT_ROOT_RISK_SLOT_CARD_COUNT
      );
      traceEntry.fullWidthEventExactJoinMemorySoftLimitMiB = hasFullWidthEventExactJoinMemoryRisk
        ? MEDLEY_FULL_WIDTH_EVENT_EXACT_JOIN_MEMORY_SOFT_LIMIT_MIB
        : null;
      traceEntry.lowMemoryInitialCandidateSyncSameCoarseProofElapsedGuardMaxSlotCardCount = (
        MEDLEY_LOW_MEMORY_INITIAL_CANDIDATE_SYNC_SAME_COARSE_GUARD_MAX_SLOT_CARD_COUNT
      );
      traceEntry.lowMemoryInitialCandidateSyncSameCoarseProofElapsedGuard = (
        shouldApplyLowMemoryInitialCandidateSyncSameCoarseProofElapsedGuard
      );
    }
    const sameCoarseClosedSiblingCount = sameCoarseSiblingFrontier.filter((entry) => entry.closed === true).length;
    const shouldUseTrailingSameCoarseDfsOnly = (
      enableTrailingSameCoarseDfsOnly
      && shouldAutoEnableExactCandidateJoin
      && isAllCoarseFilter
      && resultLimit === 1
      && maxSearchDurationMs >= 30000
      && calculatedCards.length >= 900
      && sameCoarseDfsAfterUnprovedProofCount >= MEDLEY_TRAILING_SAME_COARSE_DFS_ONLY_MIN_PROOF_COUNT
      && getRemainingSearchMs() >= MEDLEY_TRAILING_SAME_COARSE_DFS_ONLY_MIN_REMAINING_MS
    );
    if (shouldUseTrailingSameCoarseDfsOnly) {
      shouldRunExactCandidateJoinForConfiguration = false;
      if (traceEntry) {
        traceEntry.trailingSameCoarseDfsOnly = true;
        traceEntry.sameCoarseClosedSiblingCount = sameCoarseClosedSiblingCount;
        traceEntry.sameCoarseDfsAfterUnprovedProofCount = sameCoarseDfsAfterUnprovedProofCount;
      }
    }
    const hasStrictIncumbentOverSeedPass = incumbentScore > bestSeedPassScore;
    const canUseEqualSeedPassForPreSeedingExactJoin = (
      shouldUseBasicSkillAwareRootCapacityPrefilter
      && calculatedCards.length >= 1500
      && incumbentScore >= bestSeedPassScore
    );
    const shouldDeferTightRootUpperForExactJoin = (
      shouldRunExactCandidateJoinForConfiguration
    && results.length >= resultLimit
    && (isLockedCoarseFilter || isAllCoarseFilter)
    && maxSearchDurationMs >= 30000
  );
    if (results.length >= resultLimit && !shouldDeferTightRootUpperForExactJoin) {
      const rootSlotIndices = slots.map((_, index) => index);
      const useTightRootUpper = isLockedCoarseFilter || calculatedCards.length > 250 || maxSearchDurationMs >= 30000;
      const useParetoRootUpper = useTightRootUpper && calculatedCards.length <= 250;
      const useBucketedRootUpper = MEDLEY_ENABLE_BUCKETED_CAPACITY_UPPER
        && useTightRootUpper
        && calculatedCards.length <= 250;
      const proofRootUpperBound = Math.min(
        rootScoreUpperBound,
        getRemainingUpperBound(
          rootSlotIndices,
          new Set<number>(),
          false,
          useTightRootUpper && !hasDuplicateCardIds,
          useParetoRootUpper && !hasDuplicateCardIds,
          useBucketedRootUpper && !hasDuplicateCardIds,
          threshold,
        ),
      );
      if (traceEntry) {
        traceEntry.proofRootUpperBound = proofRootUpperBound;
      }
      observeUpperBound(proofRootUpperBound, "configuration-root", MEDLEY_TEAM_COUNT);
      if (proofRootUpperBound < threshold) {
        stats.prunedBranchCount += 1;
        profiling.rootUpperPrunedConfigurationCount += 1;
        finishConfigurationTrace("proof-root-pruned");
        closeActiveConfiguration();
        continue;
      }
    }

    const canTryExactCandidateJoinBeforeSeeding = (
      enableExactCandidateJoin
      && (hasStrictIncumbentOverSeedPass || canUseEqualSeedPassForPreSeedingExactJoin)
      && results.length >= resultLimit
      && resultLimit === 1
      && (
        calculatedCards.length <= 250
        || ((isLockedCoarseFilter || isAllCoarseFilter) && maxSearchDurationMs >= 30000)
      )
    );
    const observedRootUpperBoundForSameCoarseMemorySkip = configurationIndex >= 0
      ? getConfigurationObservedRootUpperBound(configurationIndex)
      : rootScoreUpperBound;
    const sameCoarseDominatingSiblingForMemorySkip = sameCoarseSiblingFrontier.find((entry) => {
      const siblingRootUpperBound = asFiniteNumber(entry.rootUpperBound);
      return (
        entry.unresolvedAboveIncumbent === true
        && siblingRootUpperBound !== null
        && Number.isFinite(observedRootUpperBoundForSameCoarseMemorySkip)
        && siblingRootUpperBound >= observedRootUpperBoundForSameCoarseMemorySkip
      );
    }) ?? null;
    const memorySoftLimitMiBForSameCoarseSkip = stats.memorySoftLimitMiB ?? MEDLEY_NODE_AUTO_MEMORY_SOFT_LIMIT_MIB;
    const isNearSameCoarseMemorySkipLimit = (
      stats.peakUsedHeapMiB !== null
      && stats.peakUsedHeapMiB >= (
        memorySoftLimitMiBForSameCoarseSkip - MEDLEY_SAME_COARSE_MEMORY_SKIP_SOFT_LIMIT_MARGIN_MIB
      )
    );
    const rememberedSameCoarseSiblingUpperBound = sameCoarseSiblingFrontier
      .map((entry) => asFiniteNumber(entry.rememberedUnclosedUpperBound))
      .filter((upperBound): upperBound is number => upperBound !== null && upperBound >= threshold)
      .sort((left, right) => right - left)[0] ?? null;
    let sameCoarseFrontierRetryTargetUpperBound: number | null = null;
    let sameCoarseFrontierProofTargetUpperBound: number | null = null;
    const leadingSameCoarseFrontierProofTargetUpperBound = incumbentScore
      + MEDLEY_SAME_COARSE_FRONTIER_PROOF_TARGET_GAP;
    const shouldUseLeadingSameCoarseFrontierProofTarget = (
      shouldRunExactCandidateJoinForConfiguration
      && shouldAutoEnableExactCandidateJoin
      && isAllCoarseFilter
      && resultLimit === 1
      && maxSearchDurationMs >= 30000
      && calculatedCards.length <= MEDLEY_SAME_COARSE_FRONTIER_RETRY_MAX_CARD_COUNT
      && slots.every((slot) => (
        slot.searchCards.length <= MEDLEY_SAME_COARSE_FRONTIER_PROOF_TARGET_MAX_SLOT_CARDS
      ))
      && configurationIndex >= 0
      && rememberedSameCoarseSiblingUpperBound === null
      && sameCoarseSiblingFrontier.some((entry) => entry.unresolvedAboveIncumbent === true)
      && Number.isFinite(observedRootUpperBoundForSameCoarseMemorySkip)
      && observedRootUpperBoundForSameCoarseMemorySkip - leadingSameCoarseFrontierProofTargetUpperBound
        >= MEDLEY_SAME_COARSE_FRONTIER_PROOF_TARGET_MIN_ROOT_DELTA
      && getRemainingSearchMs() >= MEDLEY_SAME_COARSE_FRONTIER_PROOF_TARGET_MIN_REMAINING_MS
      && !stats.memoryLimited
    );
    if (shouldUseLeadingSameCoarseFrontierProofTarget) {
      sameCoarseFrontierProofTargetUpperBound = leadingSameCoarseFrontierProofTargetUpperBound;
    }
    if (traceEntry && sameCoarseFrontierProofTargetUpperBound !== null) {
      traceEntry.sameCoarseFrontierProofTargetUpperBound = sameCoarseFrontierProofTargetUpperBound;
      traceEntry.sameCoarseFrontierProofTargetGap = MEDLEY_SAME_COARSE_FRONTIER_PROOF_TARGET_GAP;
      traceEntry.sameCoarseFrontierProofTargetRootDelta = (
        observedRootUpperBoundForSameCoarseMemorySkip - sameCoarseFrontierProofTargetUpperBound
      );
    }
    if (
      shouldRunExactCandidateJoinForConfiguration
      && canTryExactCandidateJoinBeforeSeeding
      && shouldAutoEnableExactCandidateJoin
      && isAllCoarseFilter
      && resultLimit === 1
      && maxSearchDurationMs >= 30000
      && calculatedCards.length >= 1600
      && configurationIndex >= 0
      && (isNearSameCoarseMemorySkipLimit || rememberedSameCoarseSiblingUpperBound !== null)
      && sameCoarseDominatingSiblingForMemorySkip !== null
      && Number.isFinite(observedRootUpperBoundForSameCoarseMemorySkip)
    ) {
      const rootSlotIndices = slots.map((_, index) => index);
      const tightSameCoarseMemoryRootUpperBound = Math.min(
        observedRootUpperBoundForSameCoarseMemorySkip,
        getRemainingUpperBound(
          rootSlotIndices,
          new Set<number>(),
          false,
          !hasDuplicateCardIds,
          false,
          false,
          threshold,
        ),
      );
      const sameCoarseMemorySkipUpperBound = Number.isFinite(tightSameCoarseMemoryRootUpperBound)
        ? tightSameCoarseMemoryRootUpperBound
        : observedRootUpperBoundForSameCoarseMemorySkip;
      const sameCoarseMemorySkipUpperSource: MedleyObservedUpperBoundSource = (
        Number.isFinite(tightSameCoarseMemoryRootUpperBound)
        && tightSameCoarseMemoryRootUpperBound <= observedRootUpperBoundForSameCoarseMemorySkip
      )
        ? "dfs-remaining"
        : "configuration-root";
      if (traceEntry) {
        traceEntry.sameCoarseMemorySkipTightRootUpperBound = Number.isFinite(tightSameCoarseMemoryRootUpperBound)
          ? tightSameCoarseMemoryRootUpperBound
          : null;
      }
      if (sameCoarseMemorySkipUpperBound < threshold) {
        stats.prunedBranchCount += 1;
        profiling.rootUpperPrunedConfigurationCount += 1;
        profiling.sameCoarseMemoryRootSkipCount += 1;
        if (traceEntry) {
          traceEntry.sameCoarseMemorySkipPeakMiB = stats.peakUsedHeapMiB;
          traceEntry.sameCoarseMemorySkipSoftLimitMiB = memorySoftLimitMiBForSameCoarseSkip;
          traceEntry.sameCoarseMemorySkipDominatingSibling = sameCoarseDominatingSiblingForMemorySkip;
        }
        finishConfigurationTrace("same-coarse-memory-tight-root-pruned");
        closeActiveConfiguration();
        continue;
      }
      observeUpperBound(
        sameCoarseMemorySkipUpperBound,
        sameCoarseMemorySkipUpperSource,
        MEDLEY_TEAM_COUNT,
      );
      didLeaveUnclosedAreaItemConfiguration = true;
      rememberUnclosedConfigurationUpperBound(
        configurationIndex,
        sameCoarseMemorySkipUpperBound,
        sameCoarseMemorySkipUpperSource,
        MEDLEY_TEAM_COUNT,
      );
      profiling.sameCoarseMemoryRootSkipCount += 1;
      if (traceEntry) {
        traceEntry.sameCoarseMemorySkipPeakMiB = stats.peakUsedHeapMiB;
        traceEntry.sameCoarseMemorySkipSoftLimitMiB = memorySoftLimitMiBForSameCoarseSkip;
        traceEntry.sameCoarseMemorySkipDominatingSibling = sameCoarseDominatingSiblingForMemorySkip;
      }
      finishConfigurationTrace("bounded-same-coarse-memory-root-skip");
      continue;
    }
    if (
      shouldRunExactCandidateJoinForConfiguration
      && !disableSameCoarseTightRootSkip
      && shouldAutoEnableExactCandidateJoin
      && isAllCoarseFilter
      && resultLimit === 1
      && maxSearchDurationMs >= 30000
      && calculatedCards.length <= MEDLEY_POST_EXACT_JOIN_TIGHT_ROOT_MAX_CARD_COUNT
      && configurationIndex >= 0
      && rememberedSameCoarseSiblingUpperBound !== null
      && getRemainingSearchMs() >= MEDLEY_POST_EXACT_JOIN_TIGHT_ROOT_MIN_REMAINING_MS
      && Number.isFinite(observedRootUpperBoundForSameCoarseMemorySkip)
      && observedRootUpperBoundForSameCoarseMemorySkip > rememberedSameCoarseSiblingUpperBound
    ) {
      const rootSlotIndices = slots.map((_, index) => index);
      const sameCoarseTightRootStartedAt = performance.now();
      const tightSameCoarseRootUpperBound = Math.min(
        observedRootUpperBoundForSameCoarseMemorySkip,
        getRemainingUpperBound(
          rootSlotIndices,
          new Set<number>(),
          false,
          !hasDuplicateCardIds,
          false,
          false,
          threshold,
        ),
      );
      const sameCoarseRootSkipUpperBound = Number.isFinite(tightSameCoarseRootUpperBound)
        ? tightSameCoarseRootUpperBound
        : observedRootUpperBoundForSameCoarseMemorySkip;
      if (traceEntry) {
        traceEntry.sameCoarseTightRootSkipSiblingUpperBound = rememberedSameCoarseSiblingUpperBound;
        traceEntry.sameCoarseTightRootSkipUpperBound = Number.isFinite(tightSameCoarseRootUpperBound)
          ? tightSameCoarseRootUpperBound
          : null;
        traceEntry.sameCoarseTightRootSkipElapsedMs = Math.round(performance.now() - sameCoarseTightRootStartedAt);
      }
      if (sameCoarseRootSkipUpperBound < threshold) {
        stats.prunedBranchCount += 1;
        profiling.rootUpperPrunedConfigurationCount += 1;
        finishConfigurationTrace("same-coarse-tight-root-pruned");
        closeActiveConfiguration();
        continue;
      }
      const remainingBeforeSameCoarseFrontierRetryMs = getRemainingSearchMs();
      const sameCoarseFrontierRetryRootDelta = sameCoarseRootSkipUpperBound
        - rememberedSameCoarseSiblingUpperBound;
      const hasRememberedSameCoarseFrontierSibling = sameCoarseSiblingFrontier.some((entry) => (
        entry.unresolvedAboveIncumbent === true
        && asFiniteNumber(entry.rememberedUnclosedUpperBound) === rememberedSameCoarseSiblingUpperBound
      ));
      const shouldRetrySameCoarseFrontier = (
        Number.isFinite(sameCoarseRootSkipUpperBound)
        && sameCoarseRootSkipUpperBound >= threshold
        && hasRememberedSameCoarseFrontierSibling
        && calculatedCards.length <= MEDLEY_SAME_COARSE_FRONTIER_RETRY_MAX_CARD_COUNT
        && remainingBeforeSameCoarseFrontierRetryMs >= MEDLEY_SAME_COARSE_FRONTIER_RETRY_MIN_REMAINING_MS
        && sameCoarseFrontierRetryRootDelta >= MEDLEY_SAME_COARSE_FRONTIER_RETRY_MIN_ROOT_DELTA
        && !stats.memoryLimited
      );
      if (traceEntry) {
        traceEntry.sameCoarseFrontierRetryCandidate = shouldRetrySameCoarseFrontier;
        traceEntry.sameCoarseFrontierRetryTargetUpperBound = rememberedSameCoarseSiblingUpperBound;
        traceEntry.sameCoarseFrontierRetryRootUpperBound = sameCoarseRootSkipUpperBound;
        traceEntry.sameCoarseFrontierRetryRootDelta = sameCoarseFrontierRetryRootDelta;
        traceEntry.sameCoarseFrontierRetryHasRememberedSibling = hasRememberedSameCoarseFrontierSibling;
        traceEntry.sameCoarseFrontierRetryRemainingMs = Math.round(remainingBeforeSameCoarseFrontierRetryMs);
      }
      if (shouldRetrySameCoarseFrontier) {
        sameCoarseFrontierRetryTargetUpperBound = rememberedSameCoarseSiblingUpperBound;
        observeUpperBound(sameCoarseRootSkipUpperBound, "dfs-remaining", MEDLEY_TEAM_COUNT);
        rememberUnclosedConfigurationUpperBound(
          configurationIndex,
          sameCoarseRootSkipUpperBound,
          "dfs-remaining",
          MEDLEY_TEAM_COUNT,
        );
      } else {
        observeUpperBound(sameCoarseRootSkipUpperBound, "dfs-remaining", MEDLEY_TEAM_COUNT);
        didLeaveUnclosedAreaItemConfiguration = true;
        rememberUnclosedConfigurationUpperBound(
          configurationIndex,
          sameCoarseRootSkipUpperBound,
          "dfs-remaining",
          MEDLEY_TEAM_COUNT,
        );
        finishConfigurationTrace("bounded-same-coarse-tight-root-skip");
        continue;
      }
    }
    const shouldPreSkipAllScopeExactJoin = (
      enableAllScopeExactJoinPreSkip
      && shouldRunExactCandidateJoinForConfiguration
      && canTryExactCandidateJoinBeforeSeeding
      && shouldAutoEnableExactCandidateJoin
      && isAllCoarseFilter
      && resultLimit === 1
      && maxSearchDurationMs >= 30000
      && configurationIndex >= 0
      && (
        calculatedCards.length > MEDLEY_EXACT_JOIN_ALL_SCOPE_SAFE_MAX_CARD_COUNT
        || (
          configuration.bandKey === "Everyone"
          && calculatedCards.length > MEDLEY_EXACT_JOIN_ALL_SCOPE_EVERYONE_SAFE_MAX_CARD_COUNT
        )
      )
    );
    if (shouldPreSkipAllScopeExactJoin) {
      const basicSkillAwareRootUpperBound = getBasicSkillAwareRootUpperBoundForConfiguration()
        ?? rootScoreUpperBound;
      const rootSlotIndices = slots.map((_, index) => index);
      const thresholdBeforeSkip = getMedleyPruningThreshold(results, resultLimit);
      const tightRootUpperBound = getRemainingUpperBound(
        rootSlotIndices,
        new Set<number>(),
        false,
        !hasDuplicateCardIds,
        false,
        false,
        thresholdBeforeSkip,
      );
      const boundedSkipUpperBound = Math.min(
        basicSkillAwareRootUpperBound,
        Number.isFinite(tightRootUpperBound) ? tightRootUpperBound : Number.POSITIVE_INFINITY,
      );
      const boundedSkipUpperSource: MedleyObservedUpperBoundSource = (
        Number.isFinite(tightRootUpperBound)
        && tightRootUpperBound <= basicSkillAwareRootUpperBound
      )
        ? "dfs-remaining"
        : "configuration-root";
      if (traceEntry) {
        traceEntry.preSkipBasicRootUpperBound = basicSkillAwareRootUpperBound;
        traceEntry.preSkipTightRootUpperBound = Number.isFinite(tightRootUpperBound)
          ? tightRootUpperBound
          : null;
      }
      observeUpperBound(boundedSkipUpperBound, boundedSkipUpperSource, MEDLEY_TEAM_COUNT);
      tightenActiveConfigurationUpperBound(
        boundedSkipUpperBound,
        boundedSkipUpperSource,
        MEDLEY_TEAM_COUNT,
      );
      if (boundedSkipUpperBound < thresholdBeforeSkip) {
        stats.prunedBranchCount += 1;
        profiling.rootUpperPrunedConfigurationCount += 1;
        finishConfigurationTrace(
          configuration.bandKey === "Everyone"
            ? "everyone-tight-root-pruned"
            : "large-scope-tight-root-pruned",
        );
        closeActiveConfiguration();
        continue;
      }
      didLeaveUnclosedAreaItemConfiguration = true;
      rememberActiveConfigurationUpperBound();
      finishConfigurationTrace(
        configuration.bandKey === "Everyone"
          ? "bounded-everyone-exact-join-skip"
          : "bounded-large-scope-exact-join-skip",
      );
      continue;
    }
    const exactJoinFrontierProofTargetUpperBound = sameCoarseFrontierRetryTargetUpperBound
      ?? sameCoarseFrontierProofTargetUpperBound;
    if (
      shouldRunExactCandidateJoinForConfiguration
      && !disableNearDeadlineRootSkip
      && canTryExactCandidateJoinBeforeSeeding
      && shouldAutoEnableExactCandidateJoin
      && isAllCoarseFilter
      && resultLimit === 1
      && calculatedCards.length >= 900
      && configurationIndex >= 0
    ) {
      // Near the deadline, starting another large exact join can turn a useful
      // bounded result into a timeout. The skip is allowed only when the root
      // upper is still above the incumbent, so the final response remains
      // bounded with that unresolved configuration recorded.
      const remainingBeforeNearDeadlineSkip = deadlineAt - performance.now();
      const nearDeadlinePruneRemainingMs = MEDLEY_NEAR_DEADLINE_TIGHT_ROOT_PRUNE_REMAINING_MS;
      const nearDeadlineSkipRemainingMs = MEDLEY_NEAR_DEADLINE_BOUNDED_SKIP_REMAINING_MS;
      const thresholdBeforeNearDeadlineSkip = getMedleyPruningThreshold(results, resultLimit);
      const basicSkillAwareRootUpperBound = getBasicSkillAwareRootUpperBoundForConfiguration();
      const basicSkillAwareRootGap = basicSkillAwareRootUpperBound === null
        ? Number.NEGATIVE_INFINITY
        : basicSkillAwareRootUpperBound - thresholdBeforeNearDeadlineSkip;
      if (
        remainingBeforeNearDeadlineSkip <= nearDeadlinePruneRemainingMs
        &&
        basicSkillAwareRootUpperBound !== null
        && Number.isFinite(basicSkillAwareRootUpperBound)
        && basicSkillAwareRootGap > 0
      ) {
        const rootSlotIndices = slots.map((_, index) => index);
        const tightNearDeadlineRootUpperBound = Math.min(
          basicSkillAwareRootUpperBound,
          getRemainingUpperBound(
            rootSlotIndices,
            new Set<number>(),
            false,
            !hasDuplicateCardIds,
            false,
            false,
            thresholdBeforeNearDeadlineSkip,
          ),
        );
        if (Number.isFinite(tightNearDeadlineRootUpperBound)) {
          if (traceEntry) {
            traceEntry.nearDeadlineTightRootUpperBound = tightNearDeadlineRootUpperBound;
          }
          if (tightNearDeadlineRootUpperBound < thresholdBeforeNearDeadlineSkip) {
            stats.prunedBranchCount += 1;
            profiling.rootUpperPrunedConfigurationCount += 1;
            finishConfigurationTrace("near-deadline-tight-root-pruned");
            closeActiveConfiguration();
            continue;
          }
        }
        if (traceEntry) {
          traceEntry.nearDeadlineRemainingMs = Math.max(0, Math.round(remainingBeforeNearDeadlineSkip));
          traceEntry.nearDeadlineRootPruneThresholdMs = Math.round(nearDeadlinePruneRemainingMs);
          traceEntry.nearDeadlineSkipThresholdMs = Math.round(nearDeadlineSkipRemainingMs);
        }
        if (remainingBeforeNearDeadlineSkip > nearDeadlineSkipRemainingMs) {
          // In the wider 30s window this is only a proactive root-prune probe. If the
          // tight root cannot close the configuration, continue with normal proof work.
        } else if (basicSkillAwareRootGap >= MEDLEY_NEAR_DEADLINE_BOUNDED_SKIP_MIN_GAP) {
          const rememberedNearDeadlineUpperBound = Number.isFinite(tightNearDeadlineRootUpperBound)
            ? tightNearDeadlineRootUpperBound
            : basicSkillAwareRootUpperBound;
          didLeaveUnclosedAreaItemConfiguration = true;
          rememberUnclosedConfigurationUpperBound(
            configurationIndex,
            rememberedNearDeadlineUpperBound,
            Number.isFinite(tightNearDeadlineRootUpperBound) ? "dfs-remaining" : "configuration-root",
            MEDLEY_TEAM_COUNT,
          );
          finishConfigurationTrace("bounded-near-deadline-root-skip");
          continue;
        }
      }
    }
    const shouldSkipInclusionPruneForWideRootGap = (pruningThreshold: number): boolean => {
      const basicSkillAwareRootUpperBound = getBasicSkillAwareRootUpperBoundForConfiguration();
      return (
        basicSkillAwareRootUpperBound !== null
        && basicSkillAwareRootUpperBound - pruningThreshold >= MEDLEY_WIDE_ROOT_GAP_INCLUSION_PRUNE_SKIP
      );
    };
    let didRunPreSeedingInclusionPrune = false;
    if (!hasDuplicateCardIds && canTryExactCandidateJoinBeforeSeeding && !shouldRunExactCandidateJoinForConfiguration) {
      const thresholdBeforeInclusionPrune = getMedleyPruningThreshold(results, resultLimit);
      if (!shouldSkipInclusionPruneForWideRootGap(thresholdBeforeInclusionPrune)) {
        didRunPreSeedingInclusionPrune = true;
        const prunedSlots = pruneMedleyCardsByInclusionUpper(
          slots,
          thresholdBeforeInclusionPrune,
          profiling,
          () => performance.now() >= deadlineAt - 250 || isPastMemorySoftLimit(),
        );
        if (prunedSlots !== slots) {
          slots = prunedSlots;
          shouldRunExactCandidateJoinForConfiguration = canRunExactCandidateJoinForCurrentSlots();
          bestSlotTeamCache.clear();
          remainingUpperBoundCache.clear();
        }
      } else if (traceEntry) {
        traceEntry.skippedInclusionPrune = "wide-root-gap";
      }
    }
    const shouldPreferExactCandidateJoinBeforeSeeding = (
      shouldRunExactCandidateJoinForConfiguration
      && canTryExactCandidateJoinBeforeSeeding
    );
    let didAttemptExactCandidateJoin = false;
    let didUnprovedExactCandidateJoin = false;
    let didPostExactJoinTightRootPrune = false;
    let shouldSkipDfsAfterUnprovedExactCandidateJoin = false;
    const canSkipDfsAfterUnprovedExactCandidateJoin = (
      !disableSkipDfsAfterUnprovedExactCandidateJoin
      && shouldAutoEnableExactCandidateJoin
      && isAllCoarseFilter
      && resultLimit === 1
      && maxSearchDurationMs >= 30000
      && calculatedCards.length >= 900
    );
    const shouldUseSmallGapDfsFallbackAfterUnprovedExactJoin = (
      observedUpperBound: number | null | undefined,
    ): boolean => {
      if (
        !shouldAutoEnableSmallGapDfsFallback
        || sameCoarseDfsAfterUnprovedProofCount >= 2
        || observedUpperBound === null
        || observedUpperBound === undefined
        || !Number.isFinite(observedUpperBound)
      ) {
        return false;
      }
      const observedUpperGap = observedUpperBound - incumbentScore;
      return (
        observedUpperGap >= 0
        && observedUpperGap <= MEDLEY_SMALL_GAP_DFS_FALLBACK_MAX_UPPER_GAP
        && getRemainingSearchMs() >= MEDLEY_SMALL_GAP_DFS_FALLBACK_MIN_REMAINING_MS
      );
    };
    const maybeTightenRootAfterUnprovedExactJoin = (): number | null => {
      if (
        !shouldAutoEnableExactCandidateJoin
        || !isAllCoarseFilter
        || resultLimit !== 1
        || maxSearchDurationMs < 30000
        || calculatedCards.length > MEDLEY_POST_EXACT_JOIN_TIGHT_ROOT_MAX_CARD_COUNT
        || getRemainingSearchMs() < MEDLEY_POST_EXACT_JOIN_TIGHT_ROOT_MIN_REMAINING_MS
        || profiling.exactCandidateJoinLastAbortReason !== "candidate-fill-soft-limit"
      ) {
        return null;
      }
      const rootSlotIndices = slots.map((_, index) => index);
      const rootTightenStartedAt = performance.now();
      const basicSkillAwareRootUpperBound = getBasicSkillAwareRootUpperBoundForConfiguration()
        ?? rootScoreUpperBound;
      const tightRootUpperBound = Math.min(
        basicSkillAwareRootUpperBound,
        getRemainingUpperBound(
          rootSlotIndices,
          new Set<number>(),
          false,
          !hasDuplicateCardIds,
          false,
          false,
          threshold,
        ),
      );
      if (traceEntry) {
        traceEntry.postExactJoinTightRootUpperBound = Number.isFinite(tightRootUpperBound)
          ? tightRootUpperBound
          : null;
        traceEntry.postExactJoinTightRootElapsedMs = Math.round(performance.now() - rootTightenStartedAt);
        traceEntry.postExactJoinTightRootRemainingMs = Math.round(getRemainingSearchMs());
      }
      if (!Number.isFinite(tightRootUpperBound)) {
        return null;
      }
      if (tightRootUpperBound < threshold) {
        stats.prunedBranchCount += 1;
        profiling.rootUpperPrunedConfigurationCount += 1;
        didPostExactJoinTightRootPrune = true;
        return tightRootUpperBound;
      }
      tightenActiveConfigurationUpperBound(tightRootUpperBound, "dfs-remaining", MEDLEY_TEAM_COUNT);
      return tightRootUpperBound;
    };
    if (shouldPreferExactCandidateJoinBeforeSeeding) {
      if (traceEntry) {
        traceEntry.exactBeforeSeeding = true;
      }
      if (
        !didRunPreSeedingInclusionPrune
        && !hasDuplicateCardIds
        && resultLimit === 1
        && (
          calculatedCards.length <= 250
          || ((isLockedCoarseFilter || isAllCoarseFilter) && maxSearchDurationMs >= 30000)
        )
      ) {
        const thresholdBeforeInclusionPrune = getMedleyPruningThreshold(results, resultLimit);
        if (!shouldSkipInclusionPruneForWideRootGap(thresholdBeforeInclusionPrune)) {
          const prunedSlots = pruneMedleyCardsByInclusionUpper(
            slots,
            thresholdBeforeInclusionPrune,
            profiling,
            () => performance.now() >= deadlineAt - 250 || isPastMemorySoftLimit(),
          );
          if (prunedSlots !== slots) {
            slots = prunedSlots;
            shouldRunExactCandidateJoinForConfiguration = canRunExactCandidateJoinForCurrentSlots();
            bestSlotTeamCache.clear();
            remainingUpperBoundCache.clear();
          }
        } else if (traceEntry) {
          traceEntry.skippedInclusionPrune = "wide-root-gap";
        }
      }
      didAttemptExactCandidateJoin = true;
      const prefixSeedGuardStart = {
        hitCount: profiling.exactJoinPrefixSeedHitCount,
        timedOutCount: profiling.exactJoinPrefixSeedTimedOutCount,
        noHitLocalTimeoutCount: profiling.exactJoinPrefixSeedNoHitLocalTimeoutCount,
      };
      const exactJoinResult = searchMedleyConfigurationByExactCandidateJoin(
        results,
        resultLimit,
        slots,
        configuration,
        server,
        perfectRate,
        stats,
        profiling,
        isPastDeadline,
        deadlineAt,
        exactCandidateSoftLimit,
        exactNodeSoftLimit,
        {
          calculatedCardCount: calculatedCards.length,
          enableExperimentalStagedCandidateExtension: (
            enableExperimentalStagedCandidateExtension && !sameCoarseSiblingBlockedStagedExtension
          ),
          enableSmallGapSolveRetry: (
            !sameCoarseSiblingBlockedSmallGapSolveRetry
            && profiling.exactCandidateJoinSmallGapSolveRetryCount
              < MEDLEY_EXACT_CANDIDATE_JOIN_SMALL_GAP_SOLVE_RETRY_MAX_PER_RUN
          ),
          skipSolveWhenObservedUpperAtOrBelow: exactJoinFrontierProofTargetUpperBound ?? undefined,
          solveOnlyAboveUpperTarget: exactJoinFrontierProofTargetUpperBound ?? undefined,
          enableExactJoinPrefixSeed,
          exactJoinPrefixSeedForceNoop,
          exactJoinPrefixSeedGuardOnly,
          exactJoinPrefixSeedTimeboxMs,
          exactJoinPrefixSeedMaxSmallestCandidateCount,
          exactJoinPrefixSeedMinCandidateCounts,
          exactJoinPrefixSeedPreviousLocalTimeout: exactJoinPrefixSeedDisabledCoarseKeys.has(currentCoarseKey),
          exactJoinPrefixSeedMemorySoftLimitMiB: stats.memorySoftLimitMiB,
          enableLowMemoryInitialCandidateSync: shouldUseLowMemoryInitialCandidateSync,
          lowMemoryInitialCandidateSyncLocalAbortOnly,
          lowMemoryInitialCandidateSyncLightUpper,
          lowMemoryInitialCandidateSyncTimeboxMs,
          lowMemoryInitialCandidateSyncScoreCacheClearInterval,
          lowMemoryInitialCandidateSyncDirectCandidate,
          shouldAbortLowMemoryInitialCandidateSync,
          lowMemoryHighPairScanMinRecordCount,
          lowMemoryHighPairPrefixRecordLimit,
          debugExactCandidateJoinMemoryAttribution,
        },
        observeEvaluatedMedleyResult,
      );
      if (
        profiling.exactJoinPrefixSeedNoHitLocalTimeoutCount > prefixSeedGuardStart.noHitLocalTimeoutCount
      ) {
        exactJoinPrefixSeedDisabledCoarseKeys.add(currentCoarseKey);
      }
      if (exactJoinResult.result) {
        pushMedleyResult(results, exactJoinResult.result, resultLimit, observeEvaluatedMedleyResult);
        recordBestScoreMilestone();
      }
      if (!exactJoinResult.proved) {
        didUnprovedExactCandidateJoin = true;
        tightenActiveConfigurationUpperBound(
          exactJoinResult.observedUpperBound,
          "exact-candidate-join",
          MEDLEY_TEAM_COUNT,
        );
        const postExactJoinTightRootUpperBound = maybeTightenRootAfterUnprovedExactJoin();
        const fallbackObservedUpperBound = Math.min(
          exactJoinResult.observedUpperBound ?? Number.POSITIVE_INFINITY,
          postExactJoinTightRootUpperBound ?? Number.POSITIVE_INFINITY,
        );
        const normalizedFallbackObservedUpperBound = Number.isFinite(fallbackObservedUpperBound)
          ? fallbackObservedUpperBound
          : exactJoinResult.observedUpperBound;
        const shouldUseSmallGapDfsFallback = shouldUseSmallGapDfsFallbackAfterUnprovedExactJoin(
          normalizedFallbackObservedUpperBound,
        );
        shouldSkipDfsAfterUnprovedExactCandidateJoin = (
          canSkipDfsAfterUnprovedExactCandidateJoin
          && !shouldUseSmallGapDfsFallback
          && !didPostExactJoinTightRootPrune
        );
        if (traceEntry && shouldUseSmallGapDfsFallback) {
          traceEntry.smallGapDfsFallbackAfterUnprovedExactJoin = true;
          traceEntry.smallGapDfsFallbackObservedUpperGap = normalizedFallbackObservedUpperBound !== null
            && normalizedFallbackObservedUpperBound !== undefined
            ? normalizedFallbackObservedUpperBound - incumbentScore
            : null;
          traceEntry.smallGapDfsFallbackRemainingMs = Math.round(getRemainingSearchMs());
        }
      }
      if (stats.timedOut) {
        finishConfigurationTrace("exact-before-seeding-timeout");
        break;
      }
      if (didPostExactJoinTightRootPrune) {
        profiling.completedAreaItemConfigurationCount += 1;
        rememberExactCandidateJoinProofElapsed(configuration, performance.now() - traceStartedAt);
        finishConfigurationTrace("post-exact-tight-root-pruned");
        closeActiveConfiguration();
        continue;
      }
      if (shouldSkipDfsAfterUnprovedExactCandidateJoin) {
        didLeaveUnclosedAreaItemConfiguration = true;
        rememberActiveConfigurationUpperBound();
        finishConfigurationTrace("exact-unproved-skip-dfs");
        continue;
      }
      if (exactJoinResult.proved) {
        profiling.completedAreaItemConfigurationCount += 1;
        rememberExactCandidateJoinProofElapsed(configuration, performance.now() - traceStartedAt);
        finishConfigurationTrace("exact-before-seeding-proved");
        closeActiveConfiguration();
        continue;
      }
    }

    type EventRootFrontierProbeOutcome = "not-run" | "continue-search" | "break-search";
    const getActiveConfigurationEffectiveUpperBound = (): number | null => {
      if (
        Number.isFinite(activeConfigurationTightScoreUpperBound)
        && (
          !Number.isFinite(activeConfigurationObservedScoreUpperBound)
          || activeConfigurationTightScoreUpperBound < activeConfigurationObservedScoreUpperBound
        )
      ) {
        return activeConfigurationTightScoreUpperBound;
      }
      return Number.isFinite(activeConfigurationObservedScoreUpperBound)
        ? activeConfigurationObservedScoreUpperBound
        : null;
    };
    const recordEventRootFrontierProbeSkip = (
      reason: string,
      upperBefore: number | null,
    ): void => {
      profiling.eventRootFrontierProbeSkipCount += 1;
      profiling.eventRootFrontierProbeLastReason = reason;
      profiling.eventRootFrontierProbeLastStatus = "skipped";
      profiling.eventRootFrontierProbeLastUpperBefore = upperBefore;
      profiling.eventRootFrontierProbeLastUpperAfter = upperBefore;
      profiling.eventRootFrontierProbeLastResidualGap = (
        upperBefore !== null && Number.isFinite(incumbentScore)
          ? upperBefore - incumbentScore
          : null
      );
      profiling.eventRootFrontierProbeLastPeakHeapMiB = stats.peakUsedHeapMiB;
      if (traceEntry) {
        traceEntry.eventRootFrontierProbe = false;
        traceEntry.eventRootFrontierProbeSkipReason = reason;
      }
    };
    const maybeRunEventRootFrontierProbe = (
      triggerStatus: "full-width-event-skip-seeding" | "large-gap-event-skip-seeding",
    ): EventRootFrontierProbeOutcome => {
      const upperBefore = getActiveConfigurationEffectiveUpperBound();
      if (!enableEventRootFrontierProbe) {
        return "not-run";
      }
      if (!shouldRunExactCandidateJoinForConfiguration) {
        recordEventRootFrontierProbeSkip("exact-join-disabled", upperBefore);
        return "not-run";
      }
      if (didAttemptExactCandidateJoin) {
        recordEventRootFrontierProbeSkip("already-attempted", upperBefore);
        return "not-run";
      }
      if (
        !shouldAutoEnableExactCandidateJoin
        || !isAllCoarseFilter
        || resultLimit !== 1
        || results.length < resultLimit
      ) {
        recordEventRootFrontierProbeSkip("unsupported-scope", upperBefore);
        return "not-run";
      }
      if (stats.timedOut || stats.memoryLimited || isPastMemorySoftLimit()) {
        recordEventRootFrontierProbeSkip("global-guard", upperBefore);
        return "not-run";
      }
      if (
        upperBefore === null
        || !Number.isFinite(upperBefore)
        || !Number.isFinite(incumbentScore)
        || upperBefore <= incumbentScore
      ) {
        recordEventRootFrontierProbeSkip("no-positive-gap", upperBefore);
        return "not-run";
      }
      if (activeConfigurationObservedUpperBoundSource !== "configuration-root") {
        recordEventRootFrontierProbeSkip("non-root-upper", upperBefore);
        return "not-run";
      }
      const remainingBeforeProbeMs = getRemainingSearchMs();
      if (remainingBeforeProbeMs < eventRootFrontierProbeMinRemainingMs) {
        recordEventRootFrontierProbeSkip("low-remaining-budget", upperBefore);
        return "not-run";
      }
      const usedHeapBytesBeforeProbe = readUsedHeapBytes();
      const usedHeapMiBBeforeProbe = usedHeapBytesBeforeProbe !== null
        ? Math.ceil(usedHeapBytesBeforeProbe / BYTES_PER_MIB)
        : null;
      const memorySoftLimitMiBBeforeProbe = getEffectiveMemorySoftLimitMiB();
      const memoryHeadroomMiBBeforeProbe = (
        memorySoftLimitMiBBeforeProbe !== null
        && usedHeapMiBBeforeProbe !== null
      )
        ? memorySoftLimitMiBBeforeProbe - usedHeapMiBBeforeProbe
        : null;
      if (
        memoryHeadroomMiBBeforeProbe === null
        || memoryHeadroomMiBBeforeProbe < eventRootFrontierProbeMinMemoryHeadroomMiB
      ) {
        recordEventRootFrontierProbeSkip("low-memory-headroom", upperBefore);
        if (traceEntry) {
          traceEntry.eventRootFrontierProbeMemoryHeadroomMiB = memoryHeadroomMiBBeforeProbe;
          traceEntry.eventRootFrontierProbeMinMemoryHeadroomMiB = eventRootFrontierProbeMinMemoryHeadroomMiB;
        }
        return "not-run";
      }
      const probeCandidateSoftLimit = Math.min(
        exactCandidateSoftLimit,
        eventRootFrontierProbeCandidateSoftLimit,
      );
      if (!Number.isFinite(probeCandidateSoftLimit) || probeCandidateSoftLimit <= 0) {
        recordEventRootFrontierProbeSkip("candidate-count", upperBefore);
        return "not-run";
      }
      const probeStartedAt = performance.now();
      const probeDeadlineAt = Math.min(
        deadlineAt,
        probeStartedAt + eventRootFrontierProbeTimeboxMs,
      );
      const previousTimedOut = stats.timedOut;
      const previousIsExhaustive = stats.isExhaustive;
      const previousMemoryLimited = stats.memoryLimited;
      const previousSearchMode = stats.searchMode;
      profiling.eventRootFrontierProbeCallCount += 1;
      profiling.eventRootFrontierProbeLastReason = triggerStatus;
      profiling.eventRootFrontierProbeLastStatus = "running";
      profiling.eventRootFrontierProbeLastUpperBefore = upperBefore;
      profiling.eventRootFrontierProbeLastUpperAfter = upperBefore;
      profiling.eventRootFrontierProbeLastResidualGap = upperBefore - incumbentScore;
      profiling.eventRootFrontierProbeLastPeakHeapMiB = stats.peakUsedHeapMiB;
      if (traceEntry) {
        traceEntry.eventRootFrontierProbe = true;
        traceEntry.eventRootFrontierProbeTriggerStatus = triggerStatus;
        traceEntry.eventRootFrontierProbeUpperBefore = upperBefore;
        traceEntry.eventRootFrontierProbeTimeboxMs = eventRootFrontierProbeTimeboxMs;
        traceEntry.eventRootFrontierProbeCandidateSoftLimit = probeCandidateSoftLimit;
        traceEntry.eventRootFrontierProbeRemainingMs = Math.round(remainingBeforeProbeMs);
        traceEntry.eventRootFrontierProbeMemoryHeadroomMiB = memoryHeadroomMiBBeforeProbe;
        traceEntry.eventRootFrontierProbeMinMemoryHeadroomMiB = eventRootFrontierProbeMinMemoryHeadroomMiB;
        traceEntry.eventRootFrontierProbeAnchorProofMaxFrontierGap = (
          eventRootFrontierProbeAnchorProofMaxFrontierGap
        );
        traceEntry.eventRootFrontierProbeAnchorProofMinRemainingMs = (
          eventRootFrontierProbeAnchorProofMinRemainingMs
        );
        traceEntry.eventRootFrontierProbeAnchorCheapUpperTimeboxMs = (
          eventRootFrontierProbeAnchorCheapUpperTimeboxMs
        );
        traceEntry.eventRootFrontierProbeAnchorCheapUpperMaxAnchors = (
          eventRootFrontierProbeAnchorCheapUpperMaxAnchors
        );
        traceEntry.eventRootFrontierProbeAnchorCheapUpperRefineUnseen = (
          eventRootFrontierProbeAnchorCheapUpperRefineUnseen
        );
        traceEntry.eventRootFrontierProbeAnchorCheapUpperUnseenRefineMaxGeneratedCandidates = (
          eventRootFrontierProbeAnchorCheapUpperUnseenRefineMaxGeneratedCandidates
        );
      }
      const exactJoinResult = searchMedleyConfigurationByExactCandidateJoin(
        results,
        resultLimit,
        slots,
        configuration,
        server,
        perfectRate,
        stats,
        profiling,
        isPastDeadline,
        probeDeadlineAt,
        probeCandidateSoftLimit,
        exactNodeSoftLimit,
        {
          calculatedCardCount: calculatedCards.length,
          enableExperimentalStagedCandidateExtension: false,
          enableSmallGapSolveRetry: false,
          skipSolveWhenObservedUpperAtOrBelow: incumbentScore,
          solveOnlyAboveUpperTarget: incumbentScore,
          enableExactJoinPrefixSeed: false,
          exactJoinPrefixSeedForceNoop: true,
          exactJoinPrefixSeedGuardOnly: true,
          enableLowMemoryInitialCandidateSync: shouldUseLowMemoryInitialCandidateSync,
          lowMemoryInitialCandidateSyncLocalAbortOnly,
          lowMemoryInitialCandidateSyncLightUpper,
          lowMemoryInitialCandidateSyncTimeboxMs,
          lowMemoryInitialCandidateSyncScoreCacheClearInterval,
          lowMemoryInitialCandidateSyncDirectCandidate,
          shouldAbortLowMemoryInitialCandidateSync,
          lowMemoryHighPairScanMinRecordCount,
          lowMemoryHighPairPrefixRecordLimit,
          debugExactCandidateJoinMemoryAttribution,
          anchorFrontierProofMaxFrontierGap: eventRootFrontierProbeAnchorProofMaxFrontierGap,
          anchorFrontierProofMinRemainingMs: eventRootFrontierProbeAnchorProofMinRemainingMs,
          anchorFrontierCheapUpperTimeboxMs: eventRootFrontierProbeAnchorCheapUpperTimeboxMs,
          anchorFrontierCheapUpperMaxAnchors: eventRootFrontierProbeAnchorCheapUpperMaxAnchors,
          anchorFrontierCheapUpperRefineUnseen: eventRootFrontierProbeAnchorCheapUpperRefineUnseen,
          anchorFrontierCheapUpperUnseenRefineMaxGeneratedCandidates: (
            eventRootFrontierProbeAnchorCheapUpperUnseenRefineMaxGeneratedCandidates
          ),
        },
        observeEvaluatedMedleyResult,
      );
      const elapsedMs = performance.now() - probeStartedAt;
      profiling.eventRootFrontierProbeElapsedMs += elapsedMs;
      const didLocalTimebox = (
        stats.timedOut
        && !stats.memoryLimited
        && performance.now() < deadlineAt
      );
      const didLocalMemoryLimit = (
        stats.memoryLimited
        && !previousMemoryLimited
        && performance.now() < deadlineAt
      );
      if (didLocalTimebox || didLocalMemoryLimit) {
        stats.timedOut = previousTimedOut;
        stats.isExhaustive = previousIsExhaustive;
        stats.memoryLimited = previousMemoryLimited;
        stats.searchMode = previousSearchMode;
        if (didLocalTimebox) {
          profiling.eventRootFrontierProbeTimeboxCount += 1;
        }
      }
      if (exactJoinResult.result) {
        pushMedleyResult(results, exactJoinResult.result, resultLimit, observeEvaluatedMedleyResult);
        recordBestScoreMilestone();
      }
      const probeObservedUpper = (
        exactJoinResult.observedUpperBound !== null
        && exactJoinResult.observedUpperBound !== undefined
        && Number.isFinite(exactJoinResult.observedUpperBound)
      )
        ? exactJoinResult.observedUpperBound
        : null;
      const currentThresholdAfterProbeResult = getMedleyPruningThreshold(results, resultLimit);
      const canApplyProbeUpperAsProof = (
        probeObservedUpper !== null
        && Number.isFinite(currentThresholdAfterProbeResult)
        && probeObservedUpper < currentThresholdAfterProbeResult
      );
      if (
        probeObservedUpper !== null
        && (exactJoinResult.proved || canApplyProbeUpperAsProof)
      ) {
        tightenActiveConfigurationUpperBound(
          probeObservedUpper,
          "exact-candidate-join",
          MEDLEY_TEAM_COUNT,
        );
      }
      const activeUpperAfter = getActiveConfigurationEffectiveUpperBound();
      const upperAfter = (
        probeObservedUpper !== null
        && probeObservedUpper < upperBefore
      )
        ? probeObservedUpper
        : activeUpperAfter;
      if (
        upperAfter !== null
        && Number.isFinite(upperAfter)
        && upperAfter < upperBefore
      ) {
        profiling.eventRootFrontierProbeUpperImprovementCount += 1;
      }
      profiling.eventRootFrontierProbeLastStatus = exactJoinResult.proved
        ? "proved"
        : didLocalTimebox
          ? "timebox"
          : didLocalMemoryLimit
            ? "memory-soft-limit"
            : "unproved";
      profiling.eventRootFrontierProbeLastUpperAfter = upperAfter;
      profiling.eventRootFrontierProbeLastResidualGap = (
        upperAfter !== null && Number.isFinite(incumbentScore)
          ? upperAfter - incumbentScore
          : null
      );
      profiling.eventRootFrontierProbeLastPeakHeapMiB = stats.peakUsedHeapMiB;
      if (traceEntry) {
        traceEntry.eventRootFrontierProbeElapsedMs = Math.round(elapsedMs);
        traceEntry.eventRootFrontierProbeStatus = profiling.eventRootFrontierProbeLastStatus;
        traceEntry.eventRootFrontierProbeUpperAfter = upperAfter;
        traceEntry.eventRootFrontierProbeAppliedUpper = exactJoinResult.proved || canApplyProbeUpperAsProof;
        traceEntry.eventRootFrontierProbeResidualGap = profiling.eventRootFrontierProbeLastResidualGap;
        traceEntry.eventRootFrontierProbeObservedUpper = probeObservedUpper;
        traceEntry.eventRootFrontierProbePeakHeapMiB = stats.peakUsedHeapMiB;
      }
      if (stats.timedOut) {
        finishConfigurationTrace("event-root-frontier-probe-timeout");
        return "break-search";
      }
      if (exactJoinResult.proved) {
        profiling.eventRootFrontierProbeProvedCount += 1;
        profiling.completedAreaItemConfigurationCount += 1;
        rememberExactCandidateJoinProofElapsed(configuration, performance.now() - traceStartedAt);
        finishConfigurationTrace("event-root-frontier-probe-proved");
        closeActiveConfiguration();
        return "continue-search";
      }
      if (
        activeUpperAfter !== null
        && Number.isFinite(activeUpperAfter)
        && Number.isFinite(currentThresholdAfterProbeResult)
        && activeUpperAfter < currentThresholdAfterProbeResult
      ) {
        profiling.eventRootFrontierProbePrunedCount += 1;
        stats.prunedBranchCount += 1;
        profiling.rootUpperPrunedConfigurationCount += 1;
        finishConfigurationTrace("event-root-frontier-probe-pruned");
        closeActiveConfiguration();
        return "continue-search";
      }
      return "not-run";
    };

    const hasFiniteActiveConfigurationUpperBoundBeforeSeeding = (
      Number.isFinite(activeConfigurationTightScoreUpperBound)
      || Number.isFinite(activeConfigurationObservedScoreUpperBound)
    );
    if (
      hasFullWidthEventExactJoinMemoryRisk
      && results.length >= resultLimit
      && hasFiniteActiveConfigurationUpperBoundBeforeSeeding
    ) {
      const eventRootProbe = maybeRunEventRootFrontierProbe("full-width-event-skip-seeding");
      if (eventRootProbe === "continue-search") {
        continue;
      }
      if (eventRootProbe === "break-search") {
        break;
      }
      if (traceEntry) {
        traceEntry.fullWidthEventSkipSeeding = true;
        traceEntry.bestScoreAfterSeeding = results[0]?.score ?? null;
      }
      didLeaveUnclosedAreaItemConfiguration = true;
      rememberActiveConfigurationUpperBound();
      finishConfigurationTrace("full-width-event-skip-seeding");
      continue;
    }
    const bestScoreBeforeSeeding = results[0]?.score ?? Number.NEGATIVE_INFINITY;
    const largeGapEventObservedGapBeforeSeeding = (
      Number.isFinite(activeConfigurationObservedScoreUpperBound)
      && Number.isFinite(bestScoreBeforeSeeding)
        ? activeConfigurationObservedScoreUpperBound - bestScoreBeforeSeeding
        : null
    );
    if (
      hasEventBonus
      && activeConfigurationObservedUpperBoundSource === "configuration-root"
      && largeGapEventObservedGapBeforeSeeding !== null
      && largeGapEventObservedGapBeforeSeeding >= MEDLEY_LARGE_GAP_EVENT_SKIP_PROOF_MIN_GAP
    ) {
      const eventRootProbe = maybeRunEventRootFrontierProbe("large-gap-event-skip-seeding");
      if (eventRootProbe === "continue-search") {
        continue;
      }
      if (eventRootProbe === "break-search") {
        break;
      }
      if (traceEntry) {
        traceEntry.largeGapEventSkipSeeding = true;
        traceEntry.bestScoreAfterSeeding = results[0]?.score ?? null;
        traceEntry.largeGapEventSkipProofGap = Math.ceil(largeGapEventObservedGapBeforeSeeding);
      }
      didLeaveUnclosedAreaItemConfiguration = true;
      rememberActiveConfigurationUpperBound();
      finishConfigurationTrace("large-gap-event-skip-seeding");
      continue;
    }

    const configurationSeedingUsedHeapBytes = readUsedHeapBytes();
    const configurationSeedingUsedMiB = configurationSeedingUsedHeapBytes !== null
      ? Math.ceil(configurationSeedingUsedHeapBytes / BYTES_PER_MIB)
      : null;
    const configurationSeedingSoftLimitMiB = getEffectiveMemorySoftLimitMiB();
    const configurationSeedingMemoryHeadroomMiB = (
      configurationSeedingSoftLimitMiB !== null
      && configurationSeedingUsedMiB !== null
    )
      ? configurationSeedingSoftLimitMiB - configurationSeedingUsedMiB
      : null;
    const shouldSkipConfigurationSeedingForMemory = (
      skipConfigurationSeedingWhenMemoryHeadroomBelowMiB !== null
      && configurationSeedingMemoryHeadroomMiB !== null
      && configurationSeedingMemoryHeadroomMiB < skipConfigurationSeedingWhenMemoryHeadroomBelowMiB
    );
    if (traceEntry) {
      traceEntry.configurationSeedingUsedMiB = configurationSeedingUsedMiB;
      traceEntry.configurationSeedingSoftLimitMiB = configurationSeedingSoftLimitMiB;
      traceEntry.configurationSeedingMemoryHeadroomMiB = configurationSeedingMemoryHeadroomMiB;
      traceEntry.skipConfigurationSeedingWhenMemoryHeadroomBelowMiB = (
        skipConfigurationSeedingWhenMemoryHeadroomBelowMiB
      );
      traceEntry.skipConfigurationSeedingForMemory = shouldSkipConfigurationSeedingForMemory;
    }
    if (!shouldSkipConfigurationSeedingForMemory) {
      // Incumbent seeding happens before DFS so that upper-bound pruning has a real threshold.
      // These passes may improve runtime, but they are never treated as proof by themselves.
      slotCandidateLimits = getMedleySlotCandidateLimits(slots, calculatedCards.length);
      if (enableAnchorSlotUpper) {
        slotCandidateLimits = slotCandidateLimits.map((limit) => Math.max(limit, anchorCandidateLimit));
      }
      slotCandidates = slots.map((slot, slotIndex) => collectTopMedleySlotTeams(
        slot,
        slotCandidateLimits[slotIndex],
        server,
        perfectRate,
        stats,
        isPastDeadline,
        () => undefined,
        profiling,
      ));
      if (!stats.timedOut && slotCandidates.every((candidates) => candidates.length > 0)) {
        seedMedleyResultsFromSlotCandidates(
          results,
          resultLimit,
          slots,
          slotCandidates,
          configuration,
          observeEvaluatedMedleyResult,
        );
        optimizeCurrentMedleySeedResults(
          results,
          resultLimit,
          slots,
          configuration,
          server,
          perfectRate,
          stats,
          profiling,
          fixedCardSetOptimizationCache,
          observeEvaluatedMedleyResult,
        );
        recordBestScoreMilestone();
      }
      if (traceEntry) {
        traceEntry.afterSlotCandidateSeedingMs = Math.round(performance.now() - traceStartedAt);
        traceEntry.bestScoreAfterSlotCandidateSeeding = results[0]?.score ?? null;
      }
      if (stats.timedOut) {
        finishConfigurationTrace("slot-candidate-seeding-timeout");
        break;
      }

      const seedSlotIndices = getMedleyGreedySeedSlotIndices(slots);
      seedMedleyResultsFromGreedyOrders(
        results,
        resultLimit,
        slots,
        configuration,
        server,
        perfectRate,
        stats,
        isPastDeadline,
        profiling,
        bestSlotTeamCache,
        fixedCardSetOptimizationCache,
        buildPermutations(seedSlotIndices),
        true,
        observeEvaluatedMedleyResult,
      );
      recordBestScoreMilestone();
      if (traceEntry) {
        traceEntry.afterGreedySeedingMs = Math.round(performance.now() - traceStartedAt);
        traceEntry.bestScoreAfterGreedySeeding = results[0]?.score ?? null;
      }
      if (stats.timedOut) {
        finishConfigurationTrace("greedy-seeding-timeout");
        break;
      }

      if (
        (calculatedCards.length <= 250 || maxSearchDurationMs >= 30000 || isLockedCoarseFilter)
        && results.length > 0
      ) {
        optimizeMedleySeedNeighborhood(
          results,
          resultLimit,
          slots,
          slotCandidates,
          configuration,
          server,
          perfectRate,
          stats,
          profiling,
          maxSearchDurationMs >= 30000 ? 3 : 2,
          observeEvaluatedMedleyResult,
        );
        recordBestScoreMilestone();
      }
    }
    if (traceEntry) {
      traceEntry.afterSeedingMs = Math.round(performance.now() - traceStartedAt);
      traceEntry.bestScoreAfterSeeding = results[0]?.score ?? null;
    }

    const hasFiniteActiveConfigurationUpperBound = (
      Number.isFinite(activeConfigurationTightScoreUpperBound)
      || Number.isFinite(activeConfigurationObservedScoreUpperBound)
    );
    if (
      hasFullWidthEventExactJoinMemoryRisk
      && results.length >= resultLimit
      && hasFiniteActiveConfigurationUpperBound
    ) {
      if (traceEntry) {
        traceEntry.fullWidthEventSkipDfs = true;
      }
      didLeaveUnclosedAreaItemConfiguration = true;
      rememberActiveConfigurationUpperBound();
      finishConfigurationTrace("full-width-event-skip-dfs");
      continue;
    }
    const bestScoreAfterSeeding = results[0]?.score ?? Number.NEGATIVE_INFINITY;
    const largeGapEventObservedGapAfterSeeding = (
      Number.isFinite(activeConfigurationObservedScoreUpperBound)
      && Number.isFinite(bestScoreAfterSeeding)
        ? activeConfigurationObservedScoreUpperBound - bestScoreAfterSeeding
        : null
    );
    if (
      hasEventBonus
      && activeConfigurationObservedUpperBoundSource === "configuration-root"
      && largeGapEventObservedGapAfterSeeding !== null
      && largeGapEventObservedGapAfterSeeding >= MEDLEY_LARGE_GAP_EVENT_SKIP_PROOF_MIN_GAP
    ) {
      if (traceEntry) {
        traceEntry.largeGapEventSkipProof = true;
        traceEntry.largeGapEventSkipProofGap = Math.ceil(largeGapEventObservedGapAfterSeeding);
      }
      didLeaveUnclosedAreaItemConfiguration = true;
      rememberActiveConfigurationUpperBound();
      finishConfigurationTrace("large-gap-event-skip-proof");
      continue;
    }

    if (
      !didAttemptExactCandidateJoin
      && !hasDuplicateCardIds
      && resultLimit === 1
      && results.length >= resultLimit
      && (
        calculatedCards.length <= 250
        || ((isLockedCoarseFilter || isAllCoarseFilter) && maxSearchDurationMs >= 30000)
      )
    ) {
      const thresholdBeforeInclusionPrune = getMedleyPruningThreshold(results, resultLimit);
      if (!shouldSkipInclusionPruneForWideRootGap(thresholdBeforeInclusionPrune)) {
        const prunedSlots = pruneMedleyCardsByInclusionUpper(
          slots,
          thresholdBeforeInclusionPrune,
          profiling,
          () => performance.now() >= deadlineAt - 250 || isPastMemorySoftLimit(),
        );
        if (prunedSlots !== slots) {
          slots = prunedSlots;
          shouldRunExactCandidateJoinForConfiguration = canRunExactCandidateJoinForCurrentSlots();
          bestSlotTeamCache.clear();
          remainingUpperBoundCache.clear();
        }
      } else if (traceEntry) {
        traceEntry.skippedInclusionPrune = "wide-root-gap";
      }
    }

    if (enableConflictExactBnb && results.length >= resultLimit) {
      const conflictBnbResult = searchMedleyConfigurationByConflictExactBnb(
        results,
        resultLimit,
        slots,
        configuration,
        server,
        perfectRate,
        stats,
        profiling,
        isPastDeadline,
        deadlineAt,
        conflictExactNodeLimit,
        conflictSlotSolveNodeLimit,
        observeEvaluatedMedleyResult,
      );
      if (conflictBnbResult.result) {
        pushMedleyResult(results, conflictBnbResult.result, resultLimit, observeEvaluatedMedleyResult);
        recordBestScoreMilestone();
      }
      if (stats.timedOut && conflictBnbResult.observedUpperBound !== null && results.length >= resultLimit) {
        observeUpperBound(conflictBnbResult.observedUpperBound, "dfs-remaining", MEDLEY_TEAM_COUNT);
      }
      if (stats.timedOut) {
        finishConfigurationTrace("conflict-bnb-timeout");
        break;
      }
      if (conflictBnbResult.proved) {
        profiling.completedAreaItemConfigurationCount += 1;
        finishConfigurationTrace("conflict-bnb-proved");
        closeActiveConfiguration();
        continue;
      }
    }

    // Exact sub-solvers can prove the current configuration before DFS. They may be auto-enabled
    // for large locked/all scopes, but failure to close their frontier only means this
    // configuration remains bounded and must continue through the fallback proof path.
    if (!didAttemptExactCandidateJoin && shouldRunExactCandidateJoinForConfiguration && results.length >= resultLimit) {
      const prefixSeedGuardStart = {
        hitCount: profiling.exactJoinPrefixSeedHitCount,
        timedOutCount: profiling.exactJoinPrefixSeedTimedOutCount,
        noHitLocalTimeoutCount: profiling.exactJoinPrefixSeedNoHitLocalTimeoutCount,
      };
      const exactJoinResult = searchMedleyConfigurationByExactCandidateJoin(
        results,
        resultLimit,
        slots,
        configuration,
        server,
        perfectRate,
        stats,
        profiling,
        isPastDeadline,
        deadlineAt,
        exactCandidateSoftLimit,
        exactNodeSoftLimit,
        {
          calculatedCardCount: calculatedCards.length,
          enableExperimentalStagedCandidateExtension: (
            enableExperimentalStagedCandidateExtension && !sameCoarseSiblingBlockedStagedExtension
          ),
          enableSmallGapSolveRetry: (
            !sameCoarseSiblingBlockedSmallGapSolveRetry
            && profiling.exactCandidateJoinSmallGapSolveRetryCount
              < MEDLEY_EXACT_CANDIDATE_JOIN_SMALL_GAP_SOLVE_RETRY_MAX_PER_RUN
          ),
          skipSolveWhenObservedUpperAtOrBelow: exactJoinFrontierProofTargetUpperBound ?? undefined,
          solveOnlyAboveUpperTarget: exactJoinFrontierProofTargetUpperBound ?? undefined,
          enableExactJoinPrefixSeed,
          exactJoinPrefixSeedForceNoop,
          exactJoinPrefixSeedGuardOnly,
          exactJoinPrefixSeedTimeboxMs,
          exactJoinPrefixSeedMaxSmallestCandidateCount,
          exactJoinPrefixSeedMinCandidateCounts,
          exactJoinPrefixSeedPreviousLocalTimeout: exactJoinPrefixSeedDisabledCoarseKeys.has(currentCoarseKey),
          exactJoinPrefixSeedMemorySoftLimitMiB: stats.memorySoftLimitMiB,
          enableLowMemoryInitialCandidateSync: shouldUseLowMemoryInitialCandidateSync,
          lowMemoryInitialCandidateSyncLocalAbortOnly,
          lowMemoryInitialCandidateSyncLightUpper,
          lowMemoryInitialCandidateSyncTimeboxMs,
          lowMemoryInitialCandidateSyncScoreCacheClearInterval,
          lowMemoryInitialCandidateSyncDirectCandidate,
          shouldAbortLowMemoryInitialCandidateSync,
          lowMemoryHighPairScanMinRecordCount,
          lowMemoryHighPairPrefixRecordLimit,
          debugExactCandidateJoinMemoryAttribution,
        },
        observeEvaluatedMedleyResult,
      );
      if (
        profiling.exactJoinPrefixSeedNoHitLocalTimeoutCount > prefixSeedGuardStart.noHitLocalTimeoutCount
      ) {
        exactJoinPrefixSeedDisabledCoarseKeys.add(currentCoarseKey);
      }
      if (exactJoinResult.result) {
        pushMedleyResult(results, exactJoinResult.result, resultLimit, observeEvaluatedMedleyResult);
        recordBestScoreMilestone();
      }
      if (!exactJoinResult.proved) {
        didUnprovedExactCandidateJoin = true;
        tightenActiveConfigurationUpperBound(
          exactJoinResult.observedUpperBound,
          "exact-candidate-join",
          MEDLEY_TEAM_COUNT,
        );
        const postExactJoinTightRootUpperBound = maybeTightenRootAfterUnprovedExactJoin();
        const fallbackObservedUpperBound = Math.min(
          exactJoinResult.observedUpperBound ?? Number.POSITIVE_INFINITY,
          postExactJoinTightRootUpperBound ?? Number.POSITIVE_INFINITY,
        );
        const normalizedFallbackObservedUpperBound = Number.isFinite(fallbackObservedUpperBound)
          ? fallbackObservedUpperBound
          : exactJoinResult.observedUpperBound;
        const shouldUseSmallGapDfsFallback = shouldUseSmallGapDfsFallbackAfterUnprovedExactJoin(
          normalizedFallbackObservedUpperBound,
        );
        shouldSkipDfsAfterUnprovedExactCandidateJoin = (
          canSkipDfsAfterUnprovedExactCandidateJoin
          && !shouldUseSmallGapDfsFallback
          && !didPostExactJoinTightRootPrune
        );
        if (traceEntry && shouldUseSmallGapDfsFallback) {
          traceEntry.smallGapDfsFallbackAfterUnprovedExactJoin = true;
          traceEntry.smallGapDfsFallbackObservedUpperGap = normalizedFallbackObservedUpperBound !== null
            && normalizedFallbackObservedUpperBound !== undefined
            ? normalizedFallbackObservedUpperBound - incumbentScore
            : null;
          traceEntry.smallGapDfsFallbackRemainingMs = Math.round(getRemainingSearchMs());
        }
      }
      if (stats.timedOut) {
        finishConfigurationTrace("exact-after-seeding-timeout");
        break;
      }
      if (didPostExactJoinTightRootPrune) {
        profiling.completedAreaItemConfigurationCount += 1;
        rememberExactCandidateJoinProofElapsed(configuration, performance.now() - traceStartedAt);
        finishConfigurationTrace("post-exact-tight-root-pruned");
        closeActiveConfiguration();
        continue;
      }
      if (exactJoinResult.proved) {
        profiling.completedAreaItemConfigurationCount += 1;
        rememberExactCandidateJoinProofElapsed(configuration, performance.now() - traceStartedAt);
        finishConfigurationTrace("exact-after-seeding-proved");
        closeActiveConfiguration();
        continue;
      }
    }

    if (shouldSkipDfsAfterUnprovedExactCandidateJoin) {
      didLeaveUnclosedAreaItemConfiguration = true;
      rememberActiveConfigurationUpperBound();
      finishConfigurationTrace("exact-unproved-skip-dfs");
      continue;
    }

    const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
    const bannedCardIds = new Set<number>();

    // Main cross-slot DFS. It chooses one unresolved song slot, enumerates valid five-card teams
    // for that slot, and carries card bans forward so the three teams remain disjoint.
    const visit = (remainingSlotIndices: number[], currentScore: number): void => {
      if (stats.timedOut || isPastDeadline()) {
        stats.isExhaustive = false;
        stats.timedOut = true;
        stats.searchMode = "bounded";
        return;
      }

      const hasIncumbent = results.length >= resultLimit;
      const useTightRemainingUpper = hasIncumbent
        && (isLockedCoarseFilter || calculatedCards.length > 250 || maxSearchDurationMs >= 30000);
      const useParetoRemainingUpper = useTightRemainingUpper && calculatedCards.length <= 250;
      const useBucketedRemainingUpper = MEDLEY_ENABLE_BUCKETED_CAPACITY_UPPER
        && useTightRemainingUpper
        && calculatedCards.length <= 250;
      const useProofPass = hasIncumbent && performance.now() - startedAt >= Math.min(1500, maxSearchDurationMs / 4);
      const thresholdNow = getMedleyPruningThreshold(results, resultLimit);
      const remainingUpperBound = getRemainingUpperBound(
        remainingSlotIndices,
        bannedCardIds,
        false,
        useTightRemainingUpper && !hasDuplicateCardIds,
        useParetoRemainingUpper && !hasDuplicateCardIds,
        useBucketedRemainingUpper && !hasDuplicateCardIds,
        thresholdNow - currentScore,
      );
      const branchUpperBound = currentScore + remainingUpperBound;
      observeUpperBound(branchUpperBound, "dfs-remaining", remainingSlotIndices.length);
      if (results.length >= resultLimit && branchUpperBound < thresholdNow) {
        stats.prunedBranchCount += 1;
        return;
      }

      if (remainingSlotIndices.length === 0) {
        const result = buildMedleyResult(slots, selectedBySong, configuration);
        if (result) {
          pushMedleyResult(results, result, resultLimit, observeEvaluatedMedleyResult);
          recordBestScoreMilestone();
        }
        return;
      }

      const useProofFriendlySlotOrder = useProofPass;
      if (useProofFriendlySlotOrder) {
        profiling.proofFriendlySlotChoiceCount += 1;
      }
      const slotIndex = chooseNextMedleySlotIndex(
        slots,
        remainingSlotIndices,
        bannedCardIds,
        toUpperBannedCardIds(bannedCardIds),
        useProofFriendlySlotOrder
          ? (candidateSlotIndex) => {
            const candidateNextRemainingSlotIndices = remainingSlotIndices.filter((index) => index !== candidateSlotIndex);
            return thresholdNow - currentScore - getRemainingUpperBound(
              candidateNextRemainingSlotIndices,
              bannedCardIds,
              false,
              useTightRemainingUpper && !hasDuplicateCardIds,
              useParetoRemainingUpper && !hasDuplicateCardIds,
              useBucketedRemainingUpper && !hasDuplicateCardIds,
            );
          }
          : undefined,
        profiling,
      );
      const slot = slots[slotIndex];
      const nextRemainingSlotIndices = remainingSlotIndices.filter((index) => index !== slotIndex);
      const observeDescendantUpperBound = (
        upperBound: number,
        source: MedleyObservedUpperBoundSource,
        remainingSlotCount: number,
      ): void => {
        const cappedUpperBound = Math.min(upperBound, branchUpperBound);
        observeUpperBound(
          cappedUpperBound,
          cappedUpperBound < upperBound ? "dfs-remaining" : source,
          cappedUpperBound < upperBound ? remainingSlotIndices.length : remainingSlotCount,
        );
      };
      if (resultLimit === 1 && nextRemainingSlotIndices.length === 0) {
        const bestCompletion = findBestMedleySlotTeamWithCache(
          bestSlotTeamCache,
          slotIndex,
          slot,
          bannedCardIds,
          toUpperBannedCardIds(bannedCardIds),
          server,
          perfectRate,
          stats,
          isPastDeadline,
          (slotUpperBound) => observeDescendantUpperBound(currentScore + slotUpperBound, "last-slot-completion", 1),
          profiling,
          getMedleyPruningThreshold(results, resultLimit) - currentScore,
        );
        if (bestCompletion) {
          selectedBySong[slot.songIndex] = bestCompletion;
          const result = buildMedleyResult(slots, selectedBySong, configuration);
          if (result) {
            pushMedleyResult(results, result, resultLimit, observeEvaluatedMedleyResult);
            recordBestScoreMilestone();
          }
          selectedBySong[slot.songIndex] = undefined;
        }
        return;
      }

      let futureUpperBound = getRemainingUpperBound(
        nextRemainingSlotIndices,
        bannedCardIds,
        false,
        useTightRemainingUpper && !hasDuplicateCardIds,
        useParetoRemainingUpper && !hasDuplicateCardIds,
        useBucketedRemainingUpper && !hasDuplicateCardIds,
      );
      if (results.length >= resultLimit && nextRemainingSlotIndices.length > 0) {
        const relaxedFutureUpperBound = estimateRelaxedMedleyRemainingBestScoreUpperBound(
          bestSlotTeamCache,
          slots,
          nextRemainingSlotIndices,
          bannedCardIds,
          toUpperBannedCardIds(bannedCardIds),
          server,
          perfectRate,
          stats,
          isPastDeadline,
          profiling,
        );
        if (stats.timedOut) {
          return;
        }
        futureUpperBound = Math.min(futureUpperBound, relaxedFutureUpperBound);
      }
      enumerateMedleySlotTeams(
        slot,
        bannedCardIds,
        toUpperBannedCardIds(bannedCardIds),
        server,
        perfectRate,
        stats,
        isPastDeadline,
        (currentSlotCards) => {
          let dynamicFutureUpperBound = futureUpperBound;
          if (currentSlotCards.length >= 3 && nextRemainingSlotIndices.length > 0) {
            const dynamicBannedCardIds = new Set(bannedCardIds);
            currentSlotCards.forEach((card) => dynamicBannedCardIds.add(card.cardId));
            dynamicFutureUpperBound = Math.min(
              dynamicFutureUpperBound,
              getRemainingUpperBound(
                nextRemainingSlotIndices,
                dynamicBannedCardIds,
                false,
                useTightRemainingUpper && !hasDuplicateCardIds,
                useParetoRemainingUpper && !hasDuplicateCardIds,
                useBucketedRemainingUpper && !hasDuplicateCardIds,
              ),
            );
          }
          return getMedleyPruningThreshold(results, resultLimit)
            - currentScore
            - dynamicFutureUpperBound;
        },
        (slotUpperBound) => observeDescendantUpperBound(
          currentScore + futureUpperBound + slotUpperBound,
          "slot-branch",
          nextRemainingSlotIndices.length + 1,
        ),
        profiling,
        (candidate) => {
          selectedBySong[slot.songIndex] = candidate;
          candidate.cards.forEach((card) => bannedCardIds.add(card.cardId));
          visit(nextRemainingSlotIndices, currentScore + candidate.result.score);
          candidate.cards.forEach((card) => bannedCardIds.delete(card.cardId));
          selectedBySong[slot.songIndex] = undefined;
        },
      );
    };

    visit(slots.map((_, index) => index), 0);
    if (stats.timedOut) {
      finishConfigurationTrace("dfs-timeout");
      break;
    }
    profiling.completedAreaItemConfigurationCount += 1;
    if (didUnprovedExactCandidateJoin) {
      const sameCoarseKey = getMedleyAreaItemCoarseKey(configuration);
      sameCoarseDfsAfterUnprovedProofCounts.set(
        sameCoarseKey,
        (sameCoarseDfsAfterUnprovedProofCounts.get(sameCoarseKey) ?? 0) + 1,
      );
    }
    finishConfigurationTrace("dfs-proved");
    closeActiveConfiguration();
  }

  if (stats.timedOut || didApplyAutoCoarseRestriction || didLeaveUnclosedAreaItemConfiguration) {
    rememberActiveConfigurationUpperBound();
    unclosedConfigurationUpperBoundMax = Number.NEGATIVE_INFINITY;
    hasUnclosedConfigurationWithoutFiniteUpperBound = false;
    const observedConfigurations = didApplyAutoCoarseRestriction ? configurations : orderedConfigurations;
    for (const configuration of observedConfigurations) {
      const configurationIndex = configurations.indexOf(configuration);
      if (configurationIndex < 0 || closedConfigurationIndices.has(configurationIndex)) {
        continue;
      }
      const rootUpperBound = getConfigurationObservedRootUpperBound(configurationIndex);
      rememberUnclosedConfigurationUpperBound(
        configurationIndex,
        rootUpperBound,
        "configuration-root",
        MEDLEY_TEAM_COUNT,
      );
      const rememberedUpperBound = unclosedConfigurationUpperBounds.get(configurationIndex);
      if (!rememberedUpperBound || !Number.isFinite(rememberedUpperBound.upperBound)) {
        hasUnclosedConfigurationWithoutFiniteUpperBound = true;
        continue;
      }
      unclosedConfigurationUpperBoundMax = Math.max(
        unclosedConfigurationUpperBoundMax,
        rememberedUpperBound.upperBound,
      );
      recordUnresolvedObservedUpperBound(
        rememberedUpperBound.upperBound,
        rememberedUpperBound.source,
        rememberedUpperBound.remainingSlotCount,
      );
    }
  }
  releaseAllConfigurationWarmupCaches();

  sortMedleyResults(results);
  const observedUpperBound = Number.isFinite(observedScoreUpperBound)
    ? Math.ceil(observedScoreUpperBound)
    : null;
  const comparisonScore = results[Math.min(resultLimit, results.length) - 1]?.score ?? null;
  const hasCompleteBoundedProofForSkippedConfigurations = (
    didLeaveUnclosedAreaItemConfiguration
    && !hasUnclosedConfigurationWithoutFiniteUpperBound
    && comparisonScore !== null
    && Number.isFinite(unclosedConfigurationUpperBoundMax)
    && unclosedConfigurationUpperBoundMax <= comparisonScore
  );
  const isSearchExhaustive = (
    stats.isExhaustive
    && !didApplyAutoCoarseRestriction
    && (
      !didLeaveUnclosedAreaItemConfiguration
      || hasCompleteBoundedProofForSkippedConfigurations
    )
  );

  // A run is reported as exact only when the full requested search space was exhausted. Timed
  // runs, auto-coarse runs, and partial DFS runs expose the best observed optimistic gap instead.
  const observedUpperBoundGap = isSearchExhaustive
    ? 0
    : observedUpperBound !== null && comparisonScore !== null
      ? Math.max(0, observedUpperBound - comparisonScore)
      : null;
  readUsedHeapBytes();
  const elapsedMs = Math.round(performance.now() - startedAt);
  const relativeGap = comparisonScore !== null && comparisonScore > 0 && observedUpperBoundGap !== null
    ? observedUpperBoundGap / comparisonScore
    : null;
  profiling.relativeGap = isSearchExhaustive ? 0 : relativeGap;
  if (profiling.relativeGap !== null) {
    if (profiling.relativeGap <= 0.01) {
      profiling.timeToGap1PctMs = elapsedMs;
    }
    if (profiling.relativeGap <= 0.005) {
      profiling.timeToGap05PctMs = elapsedMs;
    }
    if (profiling.relativeGap <= 0.001) {
      profiling.timeToGap01PctMs = elapsedMs;
    }
  }
  if (configurationTrace) {
    profiling.boundedFrontierGroups = buildBoundedFrontierGroups(configurationTrace);
    profiling.proofLedger = buildProofLedger(configurationTrace);
    profiling.proofLedgerSummary = buildProofLedgerSummary(profiling.proofLedger);
  }
  profiling.upperReplayElapsedMs = Math.round(profiling.upperReplayElapsedMs);
  return buildResponse({
      ...stats,
      isExhaustive: isSearchExhaustive,
      searchMode: isSearchExhaustive ? stats.searchMode : "bounded",
      elapsedMs,
      observedScoreUpperBound: isSearchExhaustive ? null : observedUpperBound,
      observedScoreUpperBoundGap: observedUpperBoundGap,
  });
}
