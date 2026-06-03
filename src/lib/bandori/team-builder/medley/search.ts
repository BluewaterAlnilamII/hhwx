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
import { searchMedleyConfigurationByExactCandidateJoin } from "./experiments/exact-candidate-join";
import { createInitialMedleyProfilingStats } from "./profiling";
import { buildMedleyResult, pushMedleyResult, sortMedleyResults } from "./results";
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
  MedleyTeamCandidate,
} from "./types";

const MEDLEY_UPPER_REPLAY_SAMPLE_LIMIT = 256;
const MEDLEY_EXACT_JOIN_AUTO_MAX_SLOT_CARDS = 300;
const MEDLEY_EXACT_JOIN_AUTO_HIGH_CANDIDATE_SOFT_LIMIT = 400_000;
const MEDLEY_WIDE_ROOT_GAP_INCLUSION_PRUNE_SKIP = 0;
const MEDLEY_DOMINATED_BOUNDED_SKIP_MIN_GAP = 50_000;
const MEDLEY_NEAR_DEADLINE_BOUNDED_SKIP_REMAINING_MS = 15_000;
const MEDLEY_NEAR_DEADLINE_BOUNDED_SKIP_MIN_PROOF_RESERVE_MS = 5_000;
const MEDLEY_NEAR_DEADLINE_BOUNDED_SKIP_MAX_PROOF_RESERVE_MS = 20_000;
const MEDLEY_NEAR_DEADLINE_BOUNDED_SKIP_PROOF_RESERVE_RATIO = 0.35;
const MEDLEY_NEAR_DEADLINE_BOUNDED_SKIP_MIN_GAP = 50_000;

export function searchBandoriBestMedleyTeams(input: BandoriMedleyTeamSearchInput): BandoriMedleyTeamSearchResponse {
  const startedAt = performance.now();
  const server = input.server ?? 3;
  const resultLimit = clamp(Math.trunc(input.resultLimit ?? 1), 1, 20);
  const perfectRate = clamp(input.perfectRate ?? 1, 0, 1);
  const maxSearchDurationMs = Math.max(1000, Math.trunc(input.maxSearchDurationMs ?? 9500));

  // Runtime options only select already-defined search paths. Exact proof status is decided
  // later from actual exhaustion, timeout, and whether auto coarse filtering narrowed the space.
  const optimization = input.optimization ?? {};
  const enableAnchorSlotUpper = optimization.enableAnchorSlotUpper === true;
  const captureUpperWitness = optimization.captureUpperWitness === true;
  const captureCapacityUpperWitness = optimization.captureCapacityUpperWitness === true;
  const enableOpportunityCostUpper = optimization.enableOpportunityCostUpper === true;
  const enableTeamSharedCoefficientUpper = optimization.enableTeamSharedCoefficientUpper === true;
  const debugConfigurationTrace = optimization.debugConfigurationTrace === true;
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
  const parsedConfigurationSeedPassDurationMs = optimization.configurationSeedPassDurationMs !== undefined
    ? Math.trunc(optimization.configurationSeedPassDurationMs)
    : Number.NaN;
  const deadlineAt = startedAt + maxSearchDurationMs;

  // Shared preprocessing mirrors single search: cards, area items, and event math are built by
  // shared helpers, while medley-specific code adds the three-slot combo carryover later.
  const songInputs = input.songs.slice(0, 3);
  const firstSlotInput = songInputs[0] ? createMedleySlotInput(input, songInputs[0]) : null;
  const calculatedCards = firstSlotInput ? buildCalculatedCards(firstSlotInput) : [];
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
  const shouldEnableOpportunityCostUpper = enableOpportunityCostUpper;
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
  const enableExactCandidateJoin = resultLimit === 1
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
  const enableConflictExactBnb = (optimization.enableConflictExactBnb === true || shouldAutoEnableConflictExactBnb)
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
  const profiling = createInitialMedleyProfilingStats(isLockedCoarseFilter ? configurations.length : 0);
  const configurationTrace: Array<Record<string, unknown>> | null = debugConfigurationTrace ? [] : null;
  if (configurationTrace) {
    profiling.configurationTrace = configurationTrace;
  }
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
    searchMode: "exact",
    observedScoreUpperBound: null,
    observedScoreUpperBoundGap: null,
    profiling,
  };

  if (songInputs.length !== 3 || calculatedCards.length < 15) {
    return {
      results: [],
      stats: {
        ...stats,
        elapsedMs: Math.round(performance.now() - startedAt),
      },
    };
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
  let bestObservedScore = Number.NEGATIVE_INFINITY;
  const deadlineCheckInterval = isLockedCoarseFilter && calculatedCards.length > 250 ? 256 : 2048;
  const recordBestScoreMilestone = (): void => {
    const score = results[0]?.score;
    if (score !== undefined && score > bestObservedScore) {
      bestObservedScore = score;
      profiling.timeToBestScoreMs = Math.round(performance.now() - startedAt);
    }
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
    return (
      enableExactCandidateJoin
      || enableConflictExactBnb
      || visitedBranchCount % deadlineCheckInterval === 0
    ) && performance.now() >= deadlineAt;
  };
  const getRemainingSearchMs = (): number => Math.max(0, deadlineAt - performance.now());

  let orderedConfigurations = configurations;
  const configurationCoarseSeedScores = new Map<string, number>();
  const configurationSeedScores = new Map<number, number>();
  const configurationWarmupCache = new Map<number, MedleyConfigurationWarmupCache>();
  const configurationRootUpperBounds = new Map<number, number>();
  const configurationBasicSkillAwareRootUpperBounds = new Map<number, number>();
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
      if (performance.now() >= seedPassDeadlineAt || performance.now() >= deadlineAt) {
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
        if (performance.now() >= seedPassDeadlineAt || performance.now() >= deadlineAt) {
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
      orderedConfigurations = configurationEntries
        .sort(compareObservedRootUpper)
        .map(({ configuration }) => configuration);
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

  // Each area-item configuration is a separate global decision shared by all three teams.
  // Exhaustiveness is only true after every searched configuration and every cross-slot card
  // assignment has been covered without timeout.
  for (const configuration of orderedConfigurations) {
    profiling.startedAreaItemConfigurationCount += 1;
    if (performance.now() >= deadlineAt) {
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
        continue;
      }
    }
    // Once one requested configuration remains unproved, later configurations
    // whose root upper is no higher cannot restore exact status. Skipping them
    // preserves the bounded upper while avoiding repeated exact joins near the
    // same proof frontier.
    if (
      results.length >= resultLimit
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
      }
      : null;
    const finishConfigurationTrace = (status: string): void => {
      if (!configurationTrace || !traceEntry || traceEntry.status !== undefined) {
        return;
      }
      const rememberedUnclosedUpperBound = configurationIndex >= 0
        ? unclosedConfigurationUpperBounds.get(configurationIndex)
        : undefined;
      Object.assign(traceEntry, {
        status,
        elapsedMs: Math.round(performance.now() - traceStartedAt),
        remainingBudgetMs: Math.round(getRemainingSearchMs()),
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
        });
      }
      configurationTrace.push(traceEntry);
    };

    // This is the central proof boundary for DFS. Callers may ask for tighter model families,
    // but every returned value must remain an optimistic upper bound for all feasible remaining
    // slot assignments under the current banned-card set.
    const getRemainingUpperBound = (
      remainingSlotIndices: number[],
      bannedCards: Set<number>,
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
      const key = `${slotCandidates.length === slots.length ? "candidates-ready" : "candidates-pending"}:${enableAnchorSlotUpper ? `anchor-${anchorCandidateLimit}` : "no-anchor"}:${shouldEnableOpportunityCostUpper ? `opportunity-${opportunityAnchorLimit}` : "no-opportunity"}:${enableTeamSharedCoefficientUpper ? "team-shared" : "no-team-shared"}:${useContextualSkillUpper ? "contextual" : "optimistic"}:${useSkillAwareCapacityUpper ? "tight-capacity" : "coefficient"}:${useParetoCapacityUpper ? "pareto" : "scalar"}:${useBucketedCapacityUpper ? "bucketed" : "unbucketed"}:${remainingSlotIndices.join(",")}:${[...bannedCards].sort((left, right) => left - right).join(",")}`;
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
      let upperBound = estimateMedleyRemainingScoreUpperBound(
        slots,
        remainingSlotIndices,
        bannedCards,
        profiling,
        useContextualSkillUpper,
        useSkillAwareCapacityUpper,
        useParetoCapacityUpper,
        useBucketedCapacityUpper,
        enableTeamSharedCoefficientUpper,
      );
      if (
        enableAnchorSlotUpper
        && useSkillAwareCapacityUpper
        && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
        && bannedCards.size === 0
        && slotCandidates.length === slots.length
      ) {
        const anchorUpperEstimate = estimateMedleyAnchorSlotDecompositionUpperBound(
          slots,
          remainingSlotIndices,
          bannedCards,
          slotCandidates,
          slotCandidateLimits,
          getRemainingUpperBound,
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
        && bannedCards.size === 0
        && slotCandidates.length === slots.length
      ) {
        const opportunityUpperEstimate = estimateMedleyOpportunityCostUpperBound(
          slots,
          remainingSlotIndices,
          bannedCards,
          slotCandidates,
          getRemainingUpperBound,
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
      if (captureUpperWitness && remainingSlotIndices.length === MEDLEY_TEAM_COUNT && bannedCards.size === 0) {
        captureMedleyRootUpperWitness(slots, remainingSlotIndices, slotCandidates, upperBound, profiling);
      }
      if (captureCapacityUpperWitness && remainingSlotIndices.length === MEDLEY_TEAM_COUNT && bannedCards.size === 0) {
        captureMedleyCapacityUpperWitness(
          slots,
          remainingSlotIndices,
          bannedCards,
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
          bannedCards,
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
          useTightRootUpper,
          useParetoRootUpper,
          useBucketedRootUpper,
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
    if (
      shouldRunExactCandidateJoinForConfiguration
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
      const sameCoarseProofElapsedMs = exactCandidateJoinProofElapsedMsByCoarseKey.get(
        getMedleyAreaItemCoarseKey(configuration),
      );
      const dynamicProofReserveMs = sameCoarseProofElapsedMs !== undefined
        ? clamp(
          Math.trunc(sameCoarseProofElapsedMs * MEDLEY_NEAR_DEADLINE_BOUNDED_SKIP_PROOF_RESERVE_RATIO),
          MEDLEY_NEAR_DEADLINE_BOUNDED_SKIP_MIN_PROOF_RESERVE_MS,
          MEDLEY_NEAR_DEADLINE_BOUNDED_SKIP_MAX_PROOF_RESERVE_MS,
        )
        : 0;
      const nearDeadlineSkipRemainingMs = sameCoarseProofElapsedMs !== undefined
        ? Math.max(
          MEDLEY_NEAR_DEADLINE_BOUNDED_SKIP_REMAINING_MS,
          sameCoarseProofElapsedMs + dynamicProofReserveMs,
        )
        : MEDLEY_NEAR_DEADLINE_BOUNDED_SKIP_REMAINING_MS;
      const thresholdBeforeNearDeadlineSkip = getMedleyPruningThreshold(results, resultLimit);
      const basicSkillAwareRootUpperBound = getBasicSkillAwareRootUpperBoundForConfiguration();
      if (
        remainingBeforeNearDeadlineSkip <= nearDeadlineSkipRemainingMs
        && (
          sameCoarseProofElapsedMs !== undefined
          || remainingBeforeNearDeadlineSkip <= MEDLEY_NEAR_DEADLINE_BOUNDED_SKIP_REMAINING_MS
        )
        &&
        basicSkillAwareRootUpperBound !== null
        && Number.isFinite(basicSkillAwareRootUpperBound)
        && basicSkillAwareRootUpperBound - thresholdBeforeNearDeadlineSkip
          >= MEDLEY_NEAR_DEADLINE_BOUNDED_SKIP_MIN_GAP
      ) {
        didLeaveUnclosedAreaItemConfiguration = true;
        rememberUnclosedConfigurationUpperBound(
          configurationIndex,
          basicSkillAwareRootUpperBound,
          "configuration-root",
          MEDLEY_TEAM_COUNT,
        );
        if (traceEntry) {
          traceEntry.nearDeadlineRemainingMs = Math.max(0, Math.round(remainingBeforeNearDeadlineSkip));
          traceEntry.nearDeadlineProofForecastMs = sameCoarseProofElapsedMs !== undefined
            ? Math.round(sameCoarseProofElapsedMs)
            : null;
          traceEntry.nearDeadlineProofReserveMs = Math.round(dynamicProofReserveMs);
          traceEntry.nearDeadlineSkipThresholdMs = Math.round(nearDeadlineSkipRemainingMs);
        }
        finishConfigurationTrace("bounded-near-deadline-root-skip");
        continue;
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
    if (canTryExactCandidateJoinBeforeSeeding && !shouldRunExactCandidateJoinForConfiguration) {
      const thresholdBeforeInclusionPrune = getMedleyPruningThreshold(results, resultLimit);
      if (!shouldSkipInclusionPruneForWideRootGap(thresholdBeforeInclusionPrune)) {
        didRunPreSeedingInclusionPrune = true;
        const prunedSlots = pruneMedleyCardsByInclusionUpper(
          slots,
          thresholdBeforeInclusionPrune,
          profiling,
          () => performance.now() >= deadlineAt - 250,
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
    let shouldSkipDfsAfterUnprovedExactCandidateJoin = false;
    const canSkipDfsAfterUnprovedExactCandidateJoin = (
      shouldAutoEnableExactCandidateJoin
      && isAllCoarseFilter
      && resultLimit === 1
      && maxSearchDurationMs >= 30000
      && calculatedCards.length >= 900
    );
    if (shouldPreferExactCandidateJoinBeforeSeeding) {
      if (traceEntry) {
        traceEntry.exactBeforeSeeding = true;
      }
      if (
        !didRunPreSeedingInclusionPrune
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
            () => performance.now() >= deadlineAt - 250,
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
      );
      if (exactJoinResult.result) {
        pushMedleyResult(results, exactJoinResult.result, resultLimit);
        recordBestScoreMilestone();
      }
      if (!exactJoinResult.proved) {
        tightenActiveConfigurationUpperBound(
          exactJoinResult.observedUpperBound,
          "exact-candidate-join",
          MEDLEY_TEAM_COUNT,
        );
        shouldSkipDfsAfterUnprovedExactCandidateJoin = canSkipDfsAfterUnprovedExactCandidateJoin;
      }
      if (stats.timedOut) {
        finishConfigurationTrace("exact-before-seeding-timeout");
        break;
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
      );
      recordBestScoreMilestone();
    }
    if (traceEntry) {
      traceEntry.afterSeedingMs = Math.round(performance.now() - traceStartedAt);
      traceEntry.bestScoreAfterSeeding = results[0]?.score ?? null;
    }

    if (
      !didAttemptExactCandidateJoin
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
          () => performance.now() >= deadlineAt - 250,
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
      );
      if (conflictBnbResult.result) {
        pushMedleyResult(results, conflictBnbResult.result, resultLimit);
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
      );
      if (exactJoinResult.result) {
        pushMedleyResult(results, exactJoinResult.result, resultLimit);
        recordBestScoreMilestone();
      }
      if (!exactJoinResult.proved) {
        tightenActiveConfigurationUpperBound(
          exactJoinResult.observedUpperBound,
          "exact-candidate-join",
          MEDLEY_TEAM_COUNT,
        );
        shouldSkipDfsAfterUnprovedExactCandidateJoin = canSkipDfsAfterUnprovedExactCandidateJoin;
      }
      if (stats.timedOut) {
        finishConfigurationTrace("exact-after-seeding-timeout");
        break;
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
        useTightRemainingUpper,
        useParetoRemainingUpper,
        useBucketedRemainingUpper,
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
          pushMedleyResult(results, result, resultLimit);
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
        useProofFriendlySlotOrder
          ? (candidateSlotIndex) => {
            const candidateNextRemainingSlotIndices = remainingSlotIndices.filter((index) => index !== candidateSlotIndex);
            return thresholdNow - currentScore - getRemainingUpperBound(
              candidateNextRemainingSlotIndices,
              bannedCardIds,
              false,
              useTightRemainingUpper,
              useParetoRemainingUpper,
              useBucketedRemainingUpper,
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
            pushMedleyResult(results, result, resultLimit);
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
        useTightRemainingUpper,
        useParetoRemainingUpper,
        useBucketedRemainingUpper,
      );
      if (results.length >= resultLimit && nextRemainingSlotIndices.length > 0) {
        const relaxedFutureUpperBound = estimateRelaxedMedleyRemainingBestScoreUpperBound(
          bestSlotTeamCache,
          slots,
          nextRemainingSlotIndices,
          bannedCardIds,
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
                useTightRemainingUpper,
                useParetoRemainingUpper,
                useBucketedRemainingUpper,
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
  profiling.upperReplayElapsedMs = Math.round(profiling.upperReplayElapsedMs);
  return {
    results,
    stats: {
      ...stats,
      isExhaustive: isSearchExhaustive,
      searchMode: isSearchExhaustive ? stats.searchMode : "bounded",
      elapsedMs,
      observedScoreUpperBound: isSearchExhaustive ? null : observedUpperBound,
      observedScoreUpperBoundGap: observedUpperBoundGap,
    },
  };
}
