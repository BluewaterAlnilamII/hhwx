/*
 * Medley exact team search orchestration.
 *
 * Core modules own card, chart, scoring, and single-team evaluation math. This file owns
 * the top-level medley workflow: prepare slots, seed incumbents, run cross-slot DFS, and
 * report whether the run actually proved the global optimum.
 */

import {
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
  buildMedleySlotSearches,
  chooseNextMedleySlotIndex,
  createMedleySlotInput,
  enumerateMedleySlotTeams,
  estimateRelaxedMedleyRemainingBestScoreUpperBound,
  findBestMedleySlotTeamWithCache,
  pruneDominatedMedleySlotCards,
  pruneMedleyCardsByInclusionUpper,
} from "./slots";
import {
  estimateMedleyAnchorSlotDecompositionUpperBound,
  estimateMedleyOpportunityCostUpperBound,
} from "./upper/anchor-opportunity";
import { estimateMedleyRemainingScoreUpperBound } from "./upper/capacity";
import { captureMedleyCapacityUpperWitness, captureMedleyRootUpperWitness } from "./upper/witness";
import {
  buildCalculatedCards,
  buildPermutations,
  clamp,
  createAreaItemConfigurations,
  pruneDominatedAreaItemConfigurations,
} from "@/lib/bandori/team-builder/core";
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
  const exactCandidateSoftLimit = Number.isFinite(parsedExactCandidateSoftLimit)
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
  const conflictExactNodeLimit = Number.isFinite(parsedConflictExactNodeLimit)
    ? Math.max(1, parsedConflictExactNodeLimit)
    : MEDLEY_CONFLICT_EXACT_BNB_DEFAULT_NODE_LIMIT;
  const parsedConflictSlotSolveNodeLimit = optimization.conflictSlotSolveNodeLimit !== undefined
    ? Math.trunc(optimization.conflictSlotSolveNodeLimit)
    : Number.NaN;
  const conflictSlotSolveNodeLimit = Number.isFinite(parsedConflictSlotSolveNodeLimit)
    ? Math.max(1, parsedConflictSlotSolveNodeLimit)
    : MEDLEY_CONFLICT_SLOT_SOLVE_DEFAULT_NODE_LIMIT;
  const deadlineAt = startedAt + maxSearchDurationMs;

  // Shared preprocessing mirrors single search: cards, area items, and event math are built by
  // shared helpers, while medley-specific code adds the three-slot combo carryover later.
  const songInputs = input.songs.slice(0, 3);
  const firstSlotInput = songInputs[0] ? createMedleySlotInput(input, songInputs[0]) : null;
  const calculatedCards = firstSlotInput ? buildCalculatedCards(firstSlotInput) : [];
  const shouldEnableOpportunityCostUpper = enableOpportunityCostUpper;
  const rawConfigurations = firstSlotInput ? createAreaItemConfigurations(input.userAreaItems) : [];
  const prunedConfigurations = firstSlotInput
    ? pruneDominatedAreaItemConfigurations(rawConfigurations, calculatedCards, firstSlotInput, server)
    : [];
  const coarseFilter = input.coarseAreaItemFilter;
  const isLockedCoarseFilter = coarseFilter?.mode === "locked";
  const enableExactCandidateJoin = optimization.enableExactCandidateJoin === true
    && resultLimit === 1
    && (
      calculatedCards.length <= 250
      || isLockedCoarseFilter
    );
  const enableConflictExactBnb = optimization.enableConflictExactBnb === true
    && resultLimit === 1
    && (
      calculatedCards.length <= 250
      || isLockedCoarseFilter
    );
  const configurations = isLockedCoarseFilter
    ? prunedConfigurations.filter((configuration) => medleyConfigurationMatchesCoarseFilter(configuration, coarseFilter))
    : prunedConfigurations;

  // Profiling is intentionally verbose because medley proof failures are usually caused by a
  // specific upper-bound family staying loose, not by the final score calculation.
  const results: BandoriMedleyTeamSearchResult[] = [];
  const profiling = createInitialMedleyProfilingStats(isLockedCoarseFilter ? configurations.length : 0);
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
  const deadlineCheckInterval = isLockedCoarseFilter && calculatedCards.length > 250 ? 256 : 2048;
  const observeUpperBound = (
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
  const isPastDeadline = (): boolean => {
    visitedBranchCount += 1;
    profiling.visitedBranchCount = visitedBranchCount;
    return (
      enableExactCandidateJoin
      || enableConflictExactBnb
      || visitedBranchCount % deadlineCheckInterval === 0
    ) && performance.now() >= deadlineAt;
  };

  let orderedConfigurations = configurations;
  const configurationCoarseSeedScores = new Map<string, number>();
  const configurationSeedScores = new Map<number, number>();
  const configurationWarmupCache = new Map<number, MedleyConfigurationWarmupCache>();
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
  let didApplyAutoCoarseRestriction = false;

  // This seed pass is an ordering and incumbent-improvement pass. When it auto-selects only a
  // subset of coarse item groups, the final response must remain bounded even if DFS exhausts
  // that reduced subset.
  const isAutoCoarseFilter = coarseFilter?.mode === "auto"
    || (!coarseFilter && maxSearchDurationMs >= 30000 && calculatedCards.length > 250);
  if (
    (coarseFilter?.mode === "auto" || isLockedCoarseFilter || maxSearchDurationMs >= 30000)
    && calculatedCards.length > 250
    && configurations.length > 1
  ) {
    const seedPassStartedAt = performance.now();
    const requestedSeedPassDurationMs = maxSearchDurationMs >= 30000
      ? Math.max(9000, Math.trunc(maxSearchDurationMs * 0.2))
      : Math.max(1500, Math.trunc(maxSearchDurationMs * 0.25));
    const seedPassDurationMs = Math.min(
      requestedSeedPassDurationMs,
      Math.max(0, deadlineAt - seedPassStartedAt - 2000),
    );
    const seedPassDeadlineAt = seedPassStartedAt + seedPassDurationMs;
    const seedPassConfigurationIndices = orderMedleyCoarseSeedConfigurationIndices(configurations, calculatedCards, input);
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
        let warmupCache = configurationWarmupCache.get(parameterConfigurationIndex);
        if (!warmupCache) {
          warmupCache = {
            slots: pruneDominatedMedleySlotCards(buildMedleySlotSearches(input, songInputs, calculatedCards, configuration, server)),
            bestSlotTeamCache: new Map(),
            fixedCardSetOptimizationCache: new Map(),
          };
          configurationWarmupCache.set(parameterConfigurationIndex, warmupCache);
        }
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
        const useFastLockedSeedPass = isLockedCoarseFilter && maxSearchDurationMs < 30000;
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
            ?? Number.NEGATIVE_INFINITY;
          const rightSeedScore = configurationSeedScores.get(right.index)
            ?? configurationCoarseSeedScores.get(getMedleyAreaItemCoarseKey(right.configuration))
            ?? Number.NEGATIVE_INFINITY;
          return rightSeedScore - leftSeedScore || left.index - right.index;
        })
        .map(({ configuration }) => configuration);
      if (isAutoCoarseFilter) {
        const candidateLimit = clamp(Math.trunc(coarseFilter?.candidateLimit ?? 3), 1, configurationCoarseSeedScores.size);
        const selectedCoarseKeys = new Set(
          [...configurationCoarseSeedScores.entries()]
            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
            .slice(0, candidateLimit)
            .map(([coarseKey]) => coarseKey),
        );
        const filteredConfigurations = filterMedleyConfigurationsByCoarseKeys(orderedConfigurations, selectedCoarseKeys);
        if (filteredConfigurations.length > 0 && filteredConfigurations.length < configurations.length) {
          orderedConfigurations = filteredConfigurations;
          didApplyAutoCoarseRestriction = true;
          profiling.coarseAutoSelectedConfigurationCount = filteredConfigurations.length;
          profiling.coarseAutoSelectedGroupCount = selectedCoarseKeys.size;
        }
      }
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
    const warmupCache = configurationIndex >= 0 ? configurationWarmupCache.get(configurationIndex) : undefined;
    let slots = warmupCache?.slots
      ?? pruneDominatedMedleySlotCards(buildMedleySlotSearches(input, songInputs, calculatedCards, configuration, server));
    const bestSlotTeamCache = warmupCache?.bestSlotTeamCache ?? new Map<string, MedleyBestSlotTeamCacheEntry>();
    const remainingUpperBoundCache = new Map<string, number>();
    const fixedCardSetOptimizationCache = warmupCache?.fixedCardSetOptimizationCache ?? new Map<string, MedleyFixedCardSetOptimizationCacheEntry>();
    let slotCandidateLimits: number[] = [];
    let slotCandidates: MedleyTeamCandidate[][] = [];

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
    ): number => {
      profiling.remainingUpperBoundCallCount += 1;
      if (remainingSlotIndices.length === 0) {
        return 0;
      }
      const key = `${enableAnchorSlotUpper ? `anchor-${anchorCandidateLimit}` : "no-anchor"}:${shouldEnableOpportunityCostUpper ? `opportunity-${opportunityAnchorLimit}` : "no-opportunity"}:${enableTeamSharedCoefficientUpper ? "team-shared" : "no-team-shared"}:${useContextualSkillUpper ? "contextual" : "optimistic"}:${useSkillAwareCapacityUpper ? "tight-capacity" : "coefficient"}:${useParetoCapacityUpper ? "pareto" : "scalar"}:${useBucketedCapacityUpper ? "bucketed" : "unbucketed"}:${remainingSlotIndices.join(",")}:${[...bannedCards].sort((left, right) => left - right).join(",")}`;
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
      remainingUpperBoundCache.set(key, upperBound);
      return upperBound;
    };
    const rootScoreUpperBound = slots.reduce((sum, slot) => sum + slot.rootScoreUpperBound, 0);
    const threshold = getMedleyPruningThreshold(results, resultLimit);
    if (results.length >= resultLimit && rootScoreUpperBound < threshold) {
      stats.prunedBranchCount += 1;
      continue;
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
    }
    if (stats.timedOut) {
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
    if (stats.timedOut) {
      break;
    }

    if ((calculatedCards.length <= 250 || maxSearchDurationMs >= 30000 || isLockedCoarseFilter) && results.length > 0) {
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
    }

    if (resultLimit === 1 && calculatedCards.length <= 250 && results.length >= resultLimit) {
      const thresholdBeforeInclusionPrune = getMedleyPruningThreshold(results, resultLimit);
      const prunedSlots = pruneMedleyCardsByInclusionUpper(slots, thresholdBeforeInclusionPrune, profiling);
      if (prunedSlots !== slots) {
        slots = prunedSlots;
        bestSlotTeamCache.clear();
        remainingUpperBoundCache.clear();
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
      }
      if (stats.timedOut && conflictBnbResult.observedUpperBound !== null && results.length >= resultLimit) {
        observedScoreUpperBound = Math.max(observedScoreUpperBound, conflictBnbResult.observedUpperBound);
        profiling.observedUpperBoundSource = "dfs-remaining";
        profiling.observedUpperBoundRemainingSlotCount = MEDLEY_TEAM_COUNT;
      }
      if (stats.timedOut) {
        break;
      }
      if (conflictBnbResult.proved) {
        profiling.completedAreaItemConfigurationCount += 1;
        continue;
      }
    }

    // Experimental exact sub-solvers can prove the current configuration early. They are kept
    // opt-in because their candidate and node budgets can be worse than the main DFS path.
    if (enableExactCandidateJoin && results.length >= resultLimit) {
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
      }
      if (stats.timedOut) {
        break;
      }
      if (exactJoinResult.proved) {
        profiling.completedAreaItemConfigurationCount += 1;
        continue;
      }
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
      break;
    }
    profiling.completedAreaItemConfigurationCount += 1;
  }

  sortMedleyResults(results);
  const observedUpperBound = Number.isFinite(observedScoreUpperBound)
    ? Math.ceil(observedScoreUpperBound)
    : null;
  const comparisonScore = results[Math.min(resultLimit, results.length) - 1]?.score ?? null;
  const isSearchExhaustive = stats.isExhaustive && !didApplyAutoCoarseRestriction;

  // A run is reported as exact only when the full requested search space was exhausted. Timed
  // runs, auto-coarse runs, and partial DFS runs expose the best observed optimistic gap instead.
  const observedUpperBoundGap = isSearchExhaustive
    ? 0
    : observedUpperBound !== null && comparisonScore !== null
      ? Math.max(0, observedUpperBound - comparisonScore)
      : null;
  return {
    results,
    stats: {
      ...stats,
      isExhaustive: isSearchExhaustive,
      searchMode: isSearchExhaustive ? stats.searchMode : "bounded",
      elapsedMs: Math.round(performance.now() - startedAt),
      observedScoreUpperBound: isSearchExhaustive ? null : observedUpperBound,
      observedScoreUpperBoundGap: observedUpperBoundGap,
    },
  };
}
