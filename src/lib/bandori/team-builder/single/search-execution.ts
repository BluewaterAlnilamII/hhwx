/*
 * Single-search execution helpers.
 *
 * search.ts owns the high-level workflow. This file owns the mutable search state, seed/root
 * configuration pass, and exact DFS. Any branch skipped here must be justified by an optimistic
 * upper bound or by a duplicate/team-context ownership check.
 */
import type { CalculatedBandoriCard } from "@/lib/bandori-team-calculator";
import {
  buildSearchCardGroups,
  buildSearchCardsForConfiguration,
  groupSearchCardsByCharacter,
  sortSearchCardsForTraversal,
} from "../core/cards";
import {
  buildCharacterUpperBoundIndex,
  CHARACTER_MASK_SEGMENT_BITS,
  compareUpperBoundDesc,
  estimateCorrelatedSearchScopeTargetUpperBound,
  estimateSearchScopeLeaderScoreUpPercentUpperBound,
  estimateSearchScopePowerUpperBound,
  estimateSearchScopeScoreRateUpperBound,
  estimateSearchScopeSingleSelfSkillScoreRateUpperBound,
  estimateSearchScopeSingleSelfSkillScoreUpperBound,
  estimateSearchScopeScoreUpperBoundWithLeaderConstraint,
  estimateSearchScopeScoreUpperBound,
  estimateSearchScopeTargetUpperBoundFromScore,
  getCardSkillAverageRateForUpperMode,
  getCardSkillLeaderRateForUpperMode,
  getCardLeaderScoreUpPercentForUpperMode,
  hasCharacterIndexInMask,
  isSearchUpperBoundBelowResultThreshold,
  pruneCardsByInclusionTargetUpperBound,
  shouldEstimateSearchScopeScoreRateUpperBound,
  shouldUseSingleSelfSkillScoreUpperBound,
  shouldUseCorrelatedUpperBound,
} from "../core/character-bounds";
import { evaluateTeam } from "../core/team-evaluation";
import type { NormalizedBandoriTeamSearchConstraints } from "../core/constraints";
import { getTeamEvaluationKey, markTeamSearchTimedOut, pushResult } from "./results";
import { buildSeedTeams } from "./seeds";
import { createSearchScopes, scopeOwnsCompleteTeam } from "./scopes";
import { compressSearchCards } from "./search-prep";
import type {
  BandoriAreaItemConfiguration,
  BandoriTeamSearchEventMode,
  BandoriTeamSearchInput,
  BandoriTeamSearchResult,
  BandoriTeamSearchStats,
  BandoriTeamSearchTarget,
  PreparedChart,
  ScoreCalculationCache,
  SearchCard,
  SearchCardSkillRateProfile,
  SearchConfiguration,
  SearchObjectiveAdapter,
  SearchPrecomputedData,
  SupportBandContext,
} from "../core/types";

export type SingleSearchExecutionState = {
  input: BandoriTeamSearchInput;
  chart: PreparedChart;
  server: number;
  perfectRate: number;
  resultLimit: number;
  target: BandoriTeamSearchTarget;
  eventMode: BandoriTeamSearchEventMode;
  supportBandContext: SupportBandContext;
  objective: SearchObjectiveAdapter;
  stats: BandoriTeamSearchStats;
  results: BandoriTeamSearchResult[];
  evaluatedTeamKeys: Set<string> | null;
  scoreCache: ScoreCalculationCache;
  baseScoreRatePerPower: number;
  scoreRateBaseUpper: number;
  deadlineAt: number;
  observedScoreUpperBound: number;
  visitedBranchCount: number;
  constraints: NormalizedBandoriTeamSearchConstraints;
};

function getPruningThresholdResult(state: SingleSearchExecutionState): BandoriTeamSearchResult | undefined {
  return state.results[state.resultLimit - 1];
}

function isPastDeadline(state: SingleSearchExecutionState): boolean {
  // performance.now() has its own cost; checking once per 2048 DFS branches keeps the hot path cheaper.
  state.visitedBranchCount += 1;
  return state.visitedBranchCount % 2048 === 0 && performance.now() >= state.deadlineAt;
}

function shouldPruneByUpperBound(
  state: SingleSearchExecutionState,
  targetUpperBound: number,
  scoreUpperBound: number,
  totalPowerUpperBound?: number,
): boolean {
  return state.results.length >= state.resultLimit && isSearchUpperBoundBelowResultThreshold(
    targetUpperBound,
    scoreUpperBound,
    getPruningThresholdResult(state),
    totalPowerUpperBound,
  );
}

function shouldEstimateTotalPowerUpperBoundForTargetTie(
  state: SingleSearchExecutionState,
  targetUpperBound: number,
): boolean {
  const thresholdResult = getPruningThresholdResult(state);
  return state.target === "eventPoint"
    && thresholdResult?.target === "eventPoint"
    && targetUpperBound === thresholdResult.targetValue;
}

function estimateTotalPowerUpperBoundForTargetTie(options: {
  state: SingleSearchExecutionState;
  targetUpperBound: number;
  selectedCards: SearchCard[];
  upperBoundIndex: SearchConfiguration["upperBoundIndex"];
  searchCards: SearchCard[];
  startIndex: number;
  usedCharacterMaskLow: number;
  usedCharacterMaskHigh: number;
  selectedPower?: number;
}): number | undefined {
  if (!shouldEstimateTotalPowerUpperBoundForTargetTie(options.state, options.targetUpperBound)) {
    return undefined;
  }

  return estimateSearchScopePowerUpperBound(
    options.selectedCards,
    options.upperBoundIndex,
    options.searchCards,
    options.startIndex,
    options.usedCharacterMaskLow,
    options.usedCharacterMaskHigh,
    options.selectedPower,
  );
}

function canUseSingleSelfSkillScoreUpperBound(state: SingleSearchExecutionState): boolean {
  return state.constraints.minLeaderScoreUpPercent === null
    && shouldUseSingleSelfSkillScoreUpperBound(state.input);
}

function shouldIncludeSelfLeaderRateInMultiLiveUpperBound(state: SingleSearchExecutionState): boolean {
  return !state.input.encoreSkillSource?.startsWith("other");
}

function estimateTargetScoreUpperBound(options: {
  state: SingleSearchExecutionState;
  selectedCards: SearchCard[];
  upperBoundIndex: SearchConfiguration["upperBoundIndex"];
  searchCards: SearchCard[];
  startIndex: number;
  usedCharacterMaskLow: number;
  usedCharacterMaskHigh: number;
  skillContextUpperMode: SearchConfiguration["skillContextUpperMode"];
  selectedPower?: number;
  selectedSkillAverageRate?: number;
  selectedSkillLeaderRate?: number;
}): number {
  if (canUseSingleSelfSkillScoreUpperBound(options.state)) {
    const singleSelfSkillScoreUpperBound = estimateSearchScopeSingleSelfSkillScoreUpperBound(
      options.selectedCards,
      options.upperBoundIndex,
      options.searchCards,
      options.startIndex,
      options.usedCharacterMaskLow,
      options.usedCharacterMaskHigh,
      options.state.scoreRateBaseUpper,
      options.skillContextUpperMode,
      shouldIncludeSelfLeaderRateInMultiLiveUpperBound(options.state),
      options.selectedPower,
    );
    if (singleSelfSkillScoreUpperBound !== null) {
      return singleSelfSkillScoreUpperBound;
    }
  }

  return estimateSearchScopeScoreUpperBound(
    options.selectedCards,
    options.upperBoundIndex,
    options.searchCards,
    options.startIndex,
    options.usedCharacterMaskLow,
    options.usedCharacterMaskHigh,
    options.state.scoreRateBaseUpper,
    options.skillContextUpperMode,
    options.selectedPower,
    options.selectedSkillAverageRate,
    options.selectedSkillLeaderRate,
  );
}

function estimateTargetScoreRateUpperBound(options: {
  state: SingleSearchExecutionState;
  selectedCards: SearchCard[];
  upperBoundIndex: SearchConfiguration["upperBoundIndex"];
  searchCards: SearchCard[];
  startIndex: number;
  usedCharacterMaskLow: number;
  usedCharacterMaskHigh: number;
  skillContextUpperMode: SearchConfiguration["skillContextUpperMode"];
  selectedSkillAverageRate?: number;
  selectedSkillLeaderRate?: number;
}): number | undefined {
  if (!shouldEstimateSearchScopeScoreRateUpperBound(
    options.state.input,
    options.state.target,
    options.state.eventMode,
    options.state.objective,
  )) {
    return undefined;
  }

  if (canUseSingleSelfSkillScoreUpperBound(options.state)) {
    const singleSelfSkillScoreRateUpperBound = estimateSearchScopeSingleSelfSkillScoreRateUpperBound(
      options.selectedCards,
      options.upperBoundIndex,
      options.searchCards,
      options.startIndex,
      options.usedCharacterMaskLow,
      options.usedCharacterMaskHigh,
      options.state.scoreRateBaseUpper,
      options.skillContextUpperMode,
      shouldIncludeSelfLeaderRateInMultiLiveUpperBound(options.state),
    );
    if (singleSelfSkillScoreRateUpperBound !== null) {
      return singleSelfSkillScoreRateUpperBound;
    }
  }

  return estimateSearchScopeScoreRateUpperBound(
    options.selectedCards,
    options.upperBoundIndex,
    options.searchCards,
    options.startIndex,
    options.usedCharacterMaskLow,
    options.usedCharacterMaskHigh,
    options.state.scoreRateBaseUpper,
    options.skillContextUpperMode,
    options.selectedSkillAverageRate,
    options.selectedSkillLeaderRate,
  );
}

function shouldPruneByPowerConstraint(options: {
  state: SingleSearchExecutionState;
  selectedCards: SearchCard[];
  upperBoundIndex: SearchConfiguration["upperBoundIndex"];
  searchCards: SearchCard[];
  startIndex: number;
  usedCharacterMaskLow: number;
  usedCharacterMaskHigh: number;
  selectedPower?: number;
}): boolean {
  const minTotalPower = options.state.constraints.minTotalPower;
  if (minTotalPower === null) {
    return false;
  }

  const powerUpperBound = estimateSearchScopePowerUpperBound(
    options.selectedCards,
    options.upperBoundIndex,
    options.searchCards,
    options.startIndex,
    options.usedCharacterMaskLow,
    options.usedCharacterMaskHigh,
    options.selectedPower,
  );
  return powerUpperBound < minTotalPower;
}

function shouldPruneByLeaderConstraint(options: {
  state: SingleSearchExecutionState;
  selectedCards: SearchCard[];
  upperBoundIndex: SearchConfiguration["upperBoundIndex"];
  searchCards: SearchCard[];
  startIndex: number;
  usedCharacterMaskLow: number;
  usedCharacterMaskHigh: number;
  skillContextUpperMode?: SearchConfiguration["skillContextUpperMode"];
}): boolean {
  const minLeaderScoreUpPercent = options.state.constraints.minLeaderScoreUpPercent;
  if (minLeaderScoreUpPercent === null) {
    return false;
  }

  const leaderScoreUpPercentUpperBound = estimateSearchScopeLeaderScoreUpPercentUpperBound(
    options.selectedCards,
    options.upperBoundIndex,
    options.searchCards,
    options.startIndex,
    options.usedCharacterMaskLow,
    options.usedCharacterMaskHigh,
    options.skillContextUpperMode,
  );
  return leaderScoreUpPercentUpperBound < minLeaderScoreUpPercent;
}

function evaluateUniqueTeam(
  state: SingleSearchExecutionState,
  cards: SearchCard[],
  configuration: BandoriAreaItemConfiguration,
): BandoriTeamSearchResult | null {
  if (state.evaluatedTeamKeys) {
    // Area configuration is part of the evaluation key: same cards under different configs must be evaluated separately.
    const key = getTeamEvaluationKey(cards, configuration);
    if (state.evaluatedTeamKeys.has(key)) {
      state.stats.duplicateTeamCount += 1;
      return null;
    }
    state.evaluatedTeamKeys.add(key);
  }
  state.stats.evaluatedTeamCount += 1;
  state.stats.targetOnlyEvaluationCount += 1;
  const result = evaluateTeam({
    cards,
    input: state.input,
    chart: state.chart,
    configuration,
    server: state.server,
    perfectRate: state.perfectRate,
    scoreCache: state.scoreCache,
    supportBandContext: state.supportBandContext,
    pruningThresholdResult: getPruningThresholdResult(state),
  });
  if (result) {
    state.stats.hydratedResultCount += 1;
  } else {
    state.stats.skippedHydrationCount += 1;
  }
  return result;
}

function tryCorrelatedUpperBoundPrune(options: {
  state: SingleSearchExecutionState;
  selectedCards: SearchCard[];
  upperBoundIndex: SearchConfiguration["upperBoundIndex"];
  searchCards: SearchCard[];
  startIndex: number;
  usedCharacterMaskLow: number;
  usedCharacterMaskHigh: number;
  skillContextUpperMode: SearchConfiguration["skillContextUpperMode"];
  selectedPower: number;
  selectedSkillAverageRate: number | undefined;
  selectedSkillLeaderRate: number | undefined;
  selectedPointBonusRate: number;
  looseTargetUpperBound: number;
  scoreUpperBound: number;
  totalPowerUpperBound?: number;
}): boolean {
  const { state } = options;
  if (!shouldUseCorrelatedUpperBound(options.looseTargetUpperBound, getPruningThresholdResult(state), state.objective)) {
    return false;
  }

  state.stats.tightUpperBoundCount += 1;
  const tightTargetUpperBound = estimateCorrelatedSearchScopeTargetUpperBound(
    options.selectedCards,
    options.upperBoundIndex,
    options.searchCards,
    options.startIndex,
    options.usedCharacterMaskLow,
    options.usedCharacterMaskHigh,
    state.scoreRateBaseUpper,
    state.input,
    state.objective,
    options.skillContextUpperMode,
    options.selectedPower,
    options.selectedSkillAverageRate,
    options.selectedSkillLeaderRate,
    options.selectedPointBonusRate,
    state.constraints.minLeaderScoreUpPercent,
  );
  if (
    tightTargetUpperBound !== null
    && isSearchUpperBoundBelowResultThreshold(
      tightTargetUpperBound,
      options.scoreUpperBound,
      getPruningThresholdResult(state),
      options.totalPowerUpperBound,
    )
  ) {
    state.stats.prunedBranchCount += 1;
    state.stats.tightUpperBoundPrunedBranchCount += 1;
    return true;
  }
  return false;
}

function getSelectedEligibleLeaderSkillRate(options: {
  state: SingleSearchExecutionState;
  selectedCards: SearchCard[];
  skillContextUpperMode: SearchConfiguration["skillContextUpperMode"];
}): number | undefined {
  const minLeaderScoreUpPercent = options.state.constraints.minLeaderScoreUpPercent;
  const skillContextUpperMode = options.skillContextUpperMode;
  if (minLeaderScoreUpPercent === null || !skillContextUpperMode) {
    return undefined;
  }

  let leaderSkillRate = 0;
  for (const card of options.selectedCards) {
    if (getCardLeaderScoreUpPercentForUpperMode(card, skillContextUpperMode) < minLeaderScoreUpPercent) {
      continue;
    }
    leaderSkillRate = Math.max(
      leaderSkillRate,
      getCardSkillLeaderRateForUpperMode(card, skillContextUpperMode),
    );
  }
  return leaderSkillRate;
}

function estimateLeaderConstrainedScoreUpperBound(options: {
  state: SingleSearchExecutionState;
  selectedCards: SearchCard[];
  upperBoundIndex: SearchConfiguration["upperBoundIndex"];
  searchCards: SearchCard[];
  startIndex: number;
  usedCharacterMaskLow: number;
  usedCharacterMaskHigh: number;
  skillContextUpperMode: SearchConfiguration["skillContextUpperMode"];
  selectedPower: number;
  selectedSkillAverageRate: number;
}): number | null {
  return estimateSearchScopeScoreUpperBoundWithLeaderConstraint(
    options.selectedCards,
    options.upperBoundIndex,
    options.searchCards,
    options.startIndex,
    options.usedCharacterMaskLow,
    options.usedCharacterMaskHigh,
    options.state.scoreRateBaseUpper,
    options.skillContextUpperMode,
    options.state.constraints.minLeaderScoreUpPercent,
    options.selectedPower,
    options.skillContextUpperMode ? options.selectedSkillAverageRate : undefined,
  );
}

function canPruneCardsByInclusion(
  state: SingleSearchExecutionState,
  useContextPartitioning: boolean,
): boolean {
  return state.results.length >= state.resultLimit && (
    ((state.target === "score" || (state.target === "eventPoint" && state.eventMode === "parameterPower")) && useContextPartitioning)
    || (state.target === "eventPoint" && state.eventMode === "pointBonus")
  );
}

export function buildConfigurationSearches(options: {
  state: SingleSearchExecutionState;
  configurations: BandoriAreaItemConfiguration[];
  calculatedCards: CalculatedBandoriCard[];
  skillRateProfiles: Map<string, SearchCardSkillRateProfile>;
  searchPrecomputed: SearchPrecomputedData;
  useContextPartitioning: boolean;
}): SearchConfiguration[] {
  const {
    state,
    configurations,
    calculatedCards,
    skillRateProfiles,
    searchPrecomputed,
    useContextPartitioning,
  } = options;
  const configurationSearches: SearchConfiguration[] = [];
  const includeLeaderScoreUpBounds = state.constraints.minLeaderScoreUpPercent !== null;

  // Build seeds and root bounds for each area configuration, raising the top-N threshold before deciding whether to enter DFS.
  for (const configuration of configurations) {
    if (performance.now() >= state.deadlineAt) {
      markTeamSearchTimedOut(state.stats);
      break;
    }

    const compressionResult = compressSearchCards(
      buildSearchCardsForConfiguration(
        calculatedCards,
        state.input,
        configuration,
        state.server,
        skillRateProfiles,
        state.supportBandContext,
        searchPrecomputed,
      ),
      state.objective,
    );
    const searchCards = compressionResult.cards;
    state.stats.supportAwareCompressionPrunedCount += compressionResult.prunedCount;
    const traversalCards = sortSearchCardsForTraversal(
      searchCards,
      state.scoreRateBaseUpper,
      state.target,
      state.eventMode,
      state.objective,
    );
    state.stats.compressedCandidateCount += searchCards.length;
    const scopes = createSearchScopes(traversalCards, useContextPartitioning);

    for (const scope of scopes) {
      if (performance.now() >= state.deadlineAt) {
        markTeamSearchTimedOut(state.stats);
        break;
      }

      let scopeCards = groupSearchCardsByCharacter(scope.searchCards);
      let upperBoundIndex = buildCharacterUpperBoundIndex(
        scopeCards,
        scope.skillContextUpperMode,
        includeLeaderScoreUpBounds,
        true,
      );
      if (shouldPruneByPowerConstraint({
        state,
        selectedCards: [],
        upperBoundIndex,
        searchCards: scopeCards,
        startIndex: 0,
        usedCharacterMaskLow: 0,
        usedCharacterMaskHigh: 0,
        selectedPower: 0,
      })) {
        state.stats.prunedBranchCount += 1;
        state.stats.rootConfigSkippedCount += 1;
        continue;
      }
      if (shouldPruneByLeaderConstraint({
        state,
        selectedCards: [],
        upperBoundIndex,
        searchCards: scopeCards,
        startIndex: 0,
        usedCharacterMaskLow: 0,
        usedCharacterMaskHigh: 0,
        skillContextUpperMode: scope.skillContextUpperMode,
      })) {
        state.stats.prunedBranchCount += 1;
        state.stats.rootConfigSkippedCount += 1;
        continue;
      }

      let rootScoreUpperBound = estimateTargetScoreUpperBound({
        state,
        selectedCards: [],
        upperBoundIndex,
        searchCards: scopeCards,
        startIndex: 0,
        usedCharacterMaskLow: 0,
        usedCharacterMaskHigh: 0,
        skillContextUpperMode: scope.skillContextUpperMode,
        selectedPower: 0,
      });
      let rootScoreRateUpperBound = estimateTargetScoreRateUpperBound({
        state,
        selectedCards: [],
        upperBoundIndex,
        searchCards: scopeCards,
        startIndex: 0,
        usedCharacterMaskLow: 0,
        usedCharacterMaskHigh: 0,
        skillContextUpperMode: scope.skillContextUpperMode,
      });
      let rootTargetUpperBound = estimateSearchScopeTargetUpperBoundFromScore(
        rootScoreUpperBound,
        [],
        upperBoundIndex,
        scopeCards,
        0,
        0,
        0,
        state.input,
        state.target,
        state.eventMode,
        scope.skillContextUpperMode,
        undefined,
        state.supportBandContext.supportBandPointUpperBound,
        state.objective,
        rootScoreRateUpperBound,
      );
      state.observedScoreUpperBound = Math.max(state.observedScoreUpperBound, rootScoreUpperBound);
      let rootTotalPowerUpperBound = estimateTotalPowerUpperBoundForTargetTie({
        state,
        targetUpperBound: rootTargetUpperBound,
        selectedCards: [],
        upperBoundIndex,
        searchCards: scopeCards,
        startIndex: 0,
        usedCharacterMaskLow: 0,
        usedCharacterMaskHigh: 0,
        selectedPower: 0,
      });
      if (shouldPruneByUpperBound(state, rootTargetUpperBound, rootScoreUpperBound, rootTotalPowerUpperBound)) {
        state.stats.prunedBranchCount += 1;
        state.stats.rootConfigSkippedCount += 1;
        continue;
      }

      let seedScore = Number.NEGATIVE_INFINITY;
      let seedTargetValue = Number.NEGATIVE_INFINITY;

      // Run a few heuristic seeds first. They do not carry correctness; they only improve the later DFS pruning threshold.
      for (const seedTeam of buildSeedTeams(scopeCards, state.target, state.eventMode, state.objective)) {
        if (performance.now() >= state.deadlineAt) {
          markTeamSearchTimedOut(state.stats);
          break;
        }
        if (!scopeOwnsCompleteTeam(seedTeam, scope.skillContextUpperMode)) {
          continue;
        }
        state.stats.enumeratedTeamCount += 1;
        const result = evaluateUniqueTeam(state, seedTeam, configuration);
        if (result) {
          seedScore = Math.max(seedScore, result.score);
          seedTargetValue = Math.max(seedTargetValue, result.targetValue);
          pushResult(state.results, result, state.resultLimit);
        }
      }
      if (state.stats.timedOut) {
        break;
      }

      const shouldPruneScopeCardsByInclusion = canPruneCardsByInclusion(state, useContextPartitioning);
      if (shouldPruneScopeCardsByInclusion) {
        const prunedScopeCards = pruneCardsByInclusionTargetUpperBound(
          scopeCards,
          upperBoundIndex,
          state.scoreRateBaseUpper,
          getPruningThresholdResult(state),
          state.input,
          state.target,
          state.eventMode,
          scope.skillContextUpperMode,
          state.supportBandContext.supportBandPointUpperBound,
          state.objective,
        );
        if (prunedScopeCards.length < scopeCards.length) {
          scopeCards = prunedScopeCards;
          upperBoundIndex = buildCharacterUpperBoundIndex(
            scopeCards,
            scope.skillContextUpperMode,
            includeLeaderScoreUpBounds,
            true,
          );
          rootScoreUpperBound = estimateTargetScoreUpperBound({
            state,
            selectedCards: [],
            upperBoundIndex,
            searchCards: scopeCards,
            startIndex: 0,
            usedCharacterMaskLow: 0,
            usedCharacterMaskHigh: 0,
            skillContextUpperMode: scope.skillContextUpperMode,
            selectedPower: 0,
          });
          rootScoreRateUpperBound = estimateTargetScoreRateUpperBound({
            state,
            selectedCards: [],
            upperBoundIndex,
            searchCards: scopeCards,
            startIndex: 0,
            usedCharacterMaskLow: 0,
            usedCharacterMaskHigh: 0,
            skillContextUpperMode: scope.skillContextUpperMode,
          });
          rootTargetUpperBound = estimateSearchScopeTargetUpperBoundFromScore(
            rootScoreUpperBound,
            [],
            upperBoundIndex,
            scopeCards,
            0,
            0,
            0,
            state.input,
            state.target,
            state.eventMode,
            scope.skillContextUpperMode,
            undefined,
            state.supportBandContext.supportBandPointUpperBound,
            state.objective,
            rootScoreRateUpperBound,
          );
          state.observedScoreUpperBound = Math.max(state.observedScoreUpperBound, rootScoreUpperBound);
          rootTotalPowerUpperBound = estimateTotalPowerUpperBoundForTargetTie({
            state,
            targetUpperBound: rootTargetUpperBound,
            selectedCards: [],
            upperBoundIndex,
            searchCards: scopeCards,
            startIndex: 0,
            usedCharacterMaskLow: 0,
            usedCharacterMaskHigh: 0,
            selectedPower: 0,
          });
        }
      }
      if (shouldPruneByPowerConstraint({
        state,
        selectedCards: [],
        upperBoundIndex,
        searchCards: scopeCards,
        startIndex: 0,
        usedCharacterMaskLow: 0,
        usedCharacterMaskHigh: 0,
        selectedPower: 0,
      })) {
        state.stats.prunedBranchCount += 1;
        state.stats.rootConfigSkippedCount += 1;
        continue;
      }
      if (shouldPruneByLeaderConstraint({
        state,
        selectedCards: [],
        upperBoundIndex,
        searchCards: scopeCards,
        startIndex: 0,
        usedCharacterMaskLow: 0,
        usedCharacterMaskHigh: 0,
        skillContextUpperMode: scope.skillContextUpperMode,
      })) {
        state.stats.prunedBranchCount += 1;
        state.stats.rootConfigSkippedCount += 1;
        continue;
      }
      if (shouldPruneByUpperBound(state, rootTargetUpperBound, rootScoreUpperBound, rootTotalPowerUpperBound)) {
        state.stats.prunedBranchCount += 1;
        state.stats.rootConfigSkippedCount += 1;
        continue;
      }

      configurationSearches.push({
        configuration,
        searchCards: scopeCards,
        upperBoundIndex,
        seedScore,
        seedTargetValue,
        rootScoreUpperBound,
        rootTargetUpperBound,
        skillContextUpperMode: scope.skillContextUpperMode,
      });
    }
    if (state.stats.timedOut) {
      break;
    }
  }

  return configurationSearches.sort((left, right) => (
    // Search configurations with stronger seeds or root bounds first; this usually finds high thresholds earlier.
    compareUpperBoundDesc(left.seedTargetValue, right.seedTargetValue)
    || compareUpperBoundDesc(left.seedScore, right.seedScore)
    || compareUpperBoundDesc(left.rootTargetUpperBound, right.rootTargetUpperBound)
    || right.rootScoreUpperBound - left.rootScoreUpperBound
    || (right.searchCards[0]?.effectivePower ?? 0) - (left.searchCards[0]?.effectivePower ?? 0)
    || right.searchCards.length - left.searchCards.length
  ));
}

export function runExactDfsSearch(
  state: SingleSearchExecutionState,
  configurationSearches: SearchConfiguration[],
  useContextPartitioning: boolean,
): void {
  // Exact DFS. Every prune must come from an optimistic upper bound, never from fixed Top-K truncation.
  const includeLeaderScoreUpBounds = state.constraints.minLeaderScoreUpPercent !== null;
  for (const search of configurationSearches) {
    if (performance.now() >= state.deadlineAt) {
      markTeamSearchTimedOut(state.stats);
      break;
    }

    const { configuration, skillContextUpperMode } = search;
    let searchCards = search.searchCards;
    let upperBoundIndex = search.upperBoundIndex;
    const shouldPruneSearchCardsByInclusion = canPruneCardsByInclusion(state, useContextPartitioning);
    if (shouldPruneSearchCardsByInclusion) {
      const prunedSearchCards = pruneCardsByInclusionTargetUpperBound(
        searchCards,
        upperBoundIndex,
        state.scoreRateBaseUpper,
        getPruningThresholdResult(state),
        state.input,
        state.target,
        state.eventMode,
        skillContextUpperMode,
        state.supportBandContext.supportBandPointUpperBound,
        state.objective,
      );
      if (prunedSearchCards.length < searchCards.length) {
        searchCards = prunedSearchCards;
        upperBoundIndex = buildCharacterUpperBoundIndex(
          searchCards,
          skillContextUpperMode,
          includeLeaderScoreUpBounds,
          true,
        );
      }
      const rootScoreUpperBound = estimateTargetScoreUpperBound({
        state,
        selectedCards: [],
        upperBoundIndex,
        searchCards,
        startIndex: 0,
        usedCharacterMaskLow: 0,
        usedCharacterMaskHigh: 0,
        skillContextUpperMode,
        selectedPower: 0,
      });
      const rootScoreRateUpperBound = estimateTargetScoreRateUpperBound({
        state,
        selectedCards: [],
        upperBoundIndex,
        searchCards,
        startIndex: 0,
        usedCharacterMaskLow: 0,
        usedCharacterMaskHigh: 0,
        skillContextUpperMode,
      });
      state.observedScoreUpperBound = Math.max(state.observedScoreUpperBound, rootScoreUpperBound);
      const rootTargetUpperBound = estimateSearchScopeTargetUpperBoundFromScore(
        rootScoreUpperBound,
        [],
        upperBoundIndex,
        searchCards,
        0,
        0,
        0,
        state.input,
        state.target,
        state.eventMode,
        skillContextUpperMode,
        undefined,
        state.supportBandContext.supportBandPointUpperBound,
        state.objective,
        rootScoreRateUpperBound,
      );
      const rootTotalPowerUpperBound = estimateTotalPowerUpperBoundForTargetTie({
        state,
        targetUpperBound: rootTargetUpperBound,
        selectedCards: [],
        upperBoundIndex,
        searchCards,
        startIndex: 0,
        usedCharacterMaskLow: 0,
        usedCharacterMaskHigh: 0,
        selectedPower: 0,
      });
      if (shouldPruneByUpperBound(state, rootTargetUpperBound, rootScoreUpperBound, rootTotalPowerUpperBound)) {
        state.stats.prunedBranchCount += 1;
        state.stats.rootConfigSkippedCount += 1;
        continue;
      }
    }
    if (shouldPruneByPowerConstraint({
      state,
      selectedCards: [],
      upperBoundIndex,
      searchCards,
      startIndex: 0,
      usedCharacterMaskLow: 0,
      usedCharacterMaskHigh: 0,
      selectedPower: 0,
    })) {
      state.stats.prunedBranchCount += 1;
      state.stats.rootConfigSkippedCount += 1;
      continue;
    }
    if (shouldPruneByLeaderConstraint({
      state,
      selectedCards: [],
      upperBoundIndex,
      searchCards,
      startIndex: 0,
      usedCharacterMaskLow: 0,
      usedCharacterMaskHigh: 0,
      skillContextUpperMode,
    })) {
      state.stats.prunedBranchCount += 1;
      state.stats.rootConfigSkippedCount += 1;
      continue;
    }

    const selectedCards: SearchCard[] = [];
    const searchCardGroups = buildSearchCardGroups(searchCards, upperBoundIndex);
    let selectedPower = 0;
    let selectedPointBonusRate = 0;
    let selectedSkillAverageRate = 0;
    let selectedSkillLeaderRate = 0;
    let usedCharacterMaskLow = 0;
    let usedCharacterMaskHigh = 0;

    // DFS walks character groups instead of raw cards, so the recursion naturally enforces the
    // "five distinct characters" constraint while still trying every card choice for a character.
    const visit = (groupIndex: number): void => {
      if (state.stats.timedOut || isPastDeadline(state)) {
        markTeamSearchTimedOut(state.stats);
        return;
      }

      const remaining = 5 - selectedCards.length;
      const startIndex = searchCardGroups[groupIndex]?.startIndex ?? searchCards.length;
      if (remaining === 0) {
        if (!scopeOwnsCompleteTeam(selectedCards, skillContextUpperMode)) {
          return;
        }
        if (shouldPruneByLeaderConstraint({
          state,
          selectedCards,
          upperBoundIndex,
          searchCards,
          startIndex,
          usedCharacterMaskLow,
          usedCharacterMaskHigh,
          skillContextUpperMode,
        })) {
          state.stats.prunedBranchCount += 1;
          return;
        }
        if (shouldPruneByPowerConstraint({
          state,
          selectedCards,
          upperBoundIndex,
          searchCards,
          startIndex,
          usedCharacterMaskLow,
          usedCharacterMaskHigh,
          selectedPower,
        })) {
          state.stats.prunedBranchCount += 1;
          return;
        }
        if (state.results.length >= state.resultLimit) {
          const selectedLeaderSkillRateForUpperBound = getSelectedEligibleLeaderSkillRate({
            state,
            selectedCards,
            skillContextUpperMode,
          }) ?? selectedSkillLeaderRate;
          const completeTeamScoreUpperBound = estimateLeaderConstrainedScoreUpperBound({
            state,
            selectedCards,
            upperBoundIndex,
            searchCards,
            startIndex,
            usedCharacterMaskLow,
            usedCharacterMaskHigh,
            skillContextUpperMode,
            selectedPower,
            selectedSkillAverageRate,
          }) ?? estimateTargetScoreUpperBound({
            state,
            selectedCards,
            upperBoundIndex,
            searchCards,
            startIndex,
            usedCharacterMaskLow,
            usedCharacterMaskHigh,
            skillContextUpperMode,
            selectedPower,
            selectedSkillAverageRate: skillContextUpperMode ? selectedSkillAverageRate : undefined,
            selectedSkillLeaderRate: skillContextUpperMode ? selectedLeaderSkillRateForUpperBound : undefined,
          });
          const completeTeamScoreRateUpperBound = estimateTargetScoreRateUpperBound({
            state,
            selectedCards,
            upperBoundIndex,
            searchCards,
            startIndex,
            usedCharacterMaskLow,
            usedCharacterMaskHigh,
            skillContextUpperMode,
            selectedSkillAverageRate: skillContextUpperMode ? selectedSkillAverageRate : undefined,
            selectedSkillLeaderRate: skillContextUpperMode ? selectedLeaderSkillRateForUpperBound : undefined,
          });
          const completeTeamTargetUpperBound = estimateSearchScopeTargetUpperBoundFromScore(
            completeTeamScoreUpperBound,
            selectedCards,
            upperBoundIndex,
            searchCards,
            startIndex,
            usedCharacterMaskLow,
            usedCharacterMaskHigh,
            state.input,
            state.target,
            state.eventMode,
            skillContextUpperMode,
            selectedPointBonusRate,
            state.supportBandContext.supportBandPointUpperBound,
            state.objective,
            completeTeamScoreRateUpperBound,
          );
          state.observedScoreUpperBound = Math.max(state.observedScoreUpperBound, completeTeamScoreUpperBound);
          const completeTeamTotalPowerUpperBound = estimateTotalPowerUpperBoundForTargetTie({
            state,
            targetUpperBound: completeTeamTargetUpperBound,
            selectedCards,
            upperBoundIndex,
            searchCards,
            startIndex,
            usedCharacterMaskLow,
            usedCharacterMaskHigh,
            selectedPower,
          });
          if (shouldPruneByUpperBound(
            state,
            completeTeamTargetUpperBound,
            completeTeamScoreUpperBound,
            completeTeamTotalPowerUpperBound,
          )) {
            state.stats.prunedBranchCount += 1;
            return;
          }
          if (tryCorrelatedUpperBoundPrune({
            state,
            selectedCards,
            upperBoundIndex,
            searchCards,
            startIndex,
            usedCharacterMaskLow,
            usedCharacterMaskHigh,
            skillContextUpperMode,
            selectedPower,
            selectedSkillAverageRate: skillContextUpperMode ? selectedSkillAverageRate : undefined,
            selectedSkillLeaderRate: skillContextUpperMode ? selectedLeaderSkillRateForUpperBound : undefined,
            selectedPointBonusRate,
            looseTargetUpperBound: completeTeamTargetUpperBound,
            scoreUpperBound: completeTeamScoreUpperBound,
            totalPowerUpperBound: completeTeamTotalPowerUpperBound,
          })) {
            return;
          }
        }
        state.stats.enumeratedTeamCount += 1;
        const result = evaluateUniqueTeam(state, selectedCards, configuration);
        if (result) {
          pushResult(state.results, result, state.resultLimit);
        }
        return;
      }

      if (searchCardGroups.length - groupIndex < remaining) {
        return;
      }

      if (shouldPruneByPowerConstraint({
        state,
        selectedCards,
        upperBoundIndex,
        searchCards,
        startIndex,
        usedCharacterMaskLow,
        usedCharacterMaskHigh,
        selectedPower,
      })) {
        state.stats.prunedBranchCount += 1;
        return;
      }
      if (shouldPruneByLeaderConstraint({
        state,
        selectedCards,
        upperBoundIndex,
        searchCards,
        startIndex,
        usedCharacterMaskLow,
        usedCharacterMaskHigh,
        skillContextUpperMode,
      })) {
        state.stats.prunedBranchCount += 1;
        return;
      }

      if (state.results.length >= state.resultLimit) {
        const branchScoreUpperBound = estimateLeaderConstrainedScoreUpperBound({
          state,
          selectedCards,
          upperBoundIndex,
          searchCards,
          startIndex,
          usedCharacterMaskLow,
          usedCharacterMaskHigh,
          skillContextUpperMode,
          selectedPower,
          selectedSkillAverageRate,
        }) ?? estimateTargetScoreUpperBound({
          state,
          selectedCards,
          upperBoundIndex,
          searchCards,
          startIndex,
          usedCharacterMaskLow,
          usedCharacterMaskHigh,
          skillContextUpperMode,
          selectedPower,
          selectedSkillAverageRate: skillContextUpperMode ? selectedSkillAverageRate : undefined,
          selectedSkillLeaderRate: skillContextUpperMode ? selectedSkillLeaderRate : undefined,
        });
        const branchScoreRateUpperBound = estimateTargetScoreRateUpperBound({
          state,
          selectedCards,
          upperBoundIndex,
          searchCards,
          startIndex,
          usedCharacterMaskLow,
          usedCharacterMaskHigh,
          skillContextUpperMode,
          selectedSkillAverageRate: skillContextUpperMode ? selectedSkillAverageRate : undefined,
          selectedSkillLeaderRate: skillContextUpperMode ? selectedSkillLeaderRate : undefined,
        });
        const branchTargetUpperBound = estimateSearchScopeTargetUpperBoundFromScore(
          branchScoreUpperBound,
          selectedCards,
          upperBoundIndex,
          searchCards,
          startIndex,
          usedCharacterMaskLow,
          usedCharacterMaskHigh,
          state.input,
          state.target,
          state.eventMode,
          skillContextUpperMode,
          selectedPointBonusRate,
          state.supportBandContext.supportBandPointUpperBound,
          state.objective,
          branchScoreRateUpperBound,
        );
        state.observedScoreUpperBound = Math.max(state.observedScoreUpperBound, branchScoreUpperBound);
        const branchTotalPowerUpperBound = estimateTotalPowerUpperBoundForTargetTie({
          state,
          targetUpperBound: branchTargetUpperBound,
          selectedCards,
          upperBoundIndex,
          searchCards,
          startIndex,
          usedCharacterMaskLow,
          usedCharacterMaskHigh,
          selectedPower,
        });
        if (shouldPruneByUpperBound(
          state,
          branchTargetUpperBound,
          branchScoreUpperBound,
          branchTotalPowerUpperBound,
        )) {
          state.stats.prunedBranchCount += 1;
          return;
        }
        if (tryCorrelatedUpperBoundPrune({
          state,
          selectedCards,
          upperBoundIndex,
          searchCards,
          startIndex,
          usedCharacterMaskLow,
          usedCharacterMaskHigh,
          skillContextUpperMode,
          selectedPower,
          selectedSkillAverageRate: skillContextUpperMode ? selectedSkillAverageRate : undefined,
          selectedSkillLeaderRate: skillContextUpperMode ? selectedSkillLeaderRate : undefined,
          selectedPointBonusRate,
          looseTargetUpperBound: branchTargetUpperBound,
          scoreUpperBound: branchScoreUpperBound,
          totalPowerUpperBound: branchTotalPowerUpperBound,
        })) {
          return;
        }
      }

      if (searchCardGroups.length - groupIndex > remaining) {
        // Try skipping the current character group first to validate the "do not pick this character" branch bound early.
        visit(groupIndex + 1);
        if (state.stats.timedOut) {
          return;
        }
      }

      const group = searchCardGroups[groupIndex];
      if (!group || hasCharacterIndexInMask(usedCharacterMaskLow, usedCharacterMaskHigh, group.characterIndex)) {
        return;
      }
      for (const card of group.cards) {
        // Then pick one card from the current character; the character mask guarantees no duplicate characters.
        const characterIndex = group.characterIndex;
        const isLowCharacterMask = characterIndex < CHARACTER_MASK_SEGMENT_BITS;
        const characterBit = isLowCharacterMask
          ? 1 << characterIndex
          : 1 << (characterIndex - CHARACTER_MASK_SEGMENT_BITS);

        selectedCards.push(card);
        selectedPower += card.effectivePower;
        selectedPointBonusRate += card.pointBonusRate;
        const previousSkillLeaderRate = selectedSkillLeaderRate;
        const cardSkillAverageRate = skillContextUpperMode
          ? getCardSkillAverageRateForUpperMode(card, skillContextUpperMode)
          : 0;
        if (skillContextUpperMode) {
          selectedSkillAverageRate += cardSkillAverageRate;
          selectedSkillLeaderRate = Math.max(
            selectedSkillLeaderRate,
            getCardSkillLeaderRateForUpperMode(card, skillContextUpperMode),
          );
        }
        if (isLowCharacterMask) {
          usedCharacterMaskLow |= characterBit;
        } else {
          usedCharacterMaskHigh |= characterBit;
        }
        visit(groupIndex + 1);
        if (isLowCharacterMask) {
          usedCharacterMaskLow &= ~characterBit;
        } else {
          usedCharacterMaskHigh &= ~characterBit;
        }
        if (skillContextUpperMode) {
          selectedSkillLeaderRate = previousSkillLeaderRate;
          selectedSkillAverageRate -= cardSkillAverageRate;
        }
        selectedPointBonusRate -= card.pointBonusRate;
        selectedPower -= card.effectivePower;
        selectedCards.pop();
        if (state.stats.timedOut) {
          return;
        }
      }
    };

    visit(0);
  }
}
