/*
 * Single-song exact team search orchestration.
 *
 * The core modules do all card, chart, scoring, and bound math. This file owns the
 * top-level workflow: prepare inputs, build candidate searches, run exact DFS, and finish
 * the response. Lower-level pruning details live in search-execution.ts.
 */
import { calculateBaseScoreRatePerPower, calculateSkillUpperRatesPerPower } from "../core/scoring";
import { getCachedPreparedChart } from "../core/chart";
import {
  buildCalculatedCards,
  createAreaItemConfigurations,
  createSupportBandContext,
  getCachedSearchCardSkillRateProfile,
  pruneDominatedAreaItemConfigurations,
} from "../core/cards";
import { normalizeTeamSearchConstraints } from "../core/constraints";
import { createScoreCalculationCache } from "../core/team-evaluation";
import { getCardInstanceKey } from "../core/card-identity";
import { createInitialTeamSearchStats, finishTeamSearchResponse, sortResults } from "./results";
import { normalizeSearchLiveType, normalizeSearchTarget, resolveBandoriTeamSearchEventMode, resolveBandoriTeamSearchUseFever } from "../core/events";
import { clamp } from "../core/utils";
import { BANDORI_TEAM_SEARCH_DIFFICULTIES } from "../core/types";
import { createSearchObjectiveAdapter } from "./objective";
import { buildSearchPrecomputedData, sortAreaItemConfigurationsForSearch } from "./search-prep";
import { buildConfigurationSearches, runExactDfsSearch, type SingleSearchExecutionState } from "./search-execution";
import type { BandoriTeamSearchDifficulty, BandoriTeamSearchInput, BandoriTeamSearchResponse, BandoriTeamSearchResult, PreparedChart } from "../core/types";

function calculateExternalSkillRateUpper(input: BandoriTeamSearchInput, chart: PreparedChart, server: number): number {
  if (normalizeSearchLiveType(input.liveType) !== "multi") {
    return 0;
  }

  const externalSkillRates = (input.otherPlayerSkills ?? []).slice(0, 4).map((externalSkill) => {
    const skill = input.skillsById[String(externalSkill.skillId)];
    return calculateSkillUpperRatesPerPower(chart, skill, externalSkill.skillLevel, server);
  });
  const triggerRateUpper = externalSkillRates.reduce((sum, rates) => sum + rates.averageRate, 0);
  if (!input.encoreSkillSource?.startsWith("other")) {
    return triggerRateUpper;
  }

  const externalIndex = Number(input.encoreSkillSource.replace("other", "")) - 1;
  return triggerRateUpper + Math.max(0, externalSkillRates[externalIndex]?.leaderRate ?? 0);
}

// Legacy compatibility exports for callers that still import helpers from bandori-team-search.ts.
export * from "../core/types";
export { clamp, buildPermutations } from "../core/utils";
export { prepareBandoriChart, getCachedPreparedChart } from "../core/chart";
export { calculateBaseScoreRatePerPower } from "../core/scoring";
export {
  createAreaItemConfigurations,
  buildSearchCardSkillRateProfiles,
  pruneDominatedAreaItemConfigurations,
  buildCalculatedCards,
  buildSearchCardsForConfiguration,
  sortSearchCardsForTraversal,
} from "../core/cards";
export {
  buildCharacterUpperBoundIndex,
  insertTopValue,
  estimateAverageSkillRateUpper,
  CHARACTER_MASK_SEGMENT_BITS,
  hasCharacterIndexInMask,
  estimateSearchScopeScoreUpperBound,
} from "../core/character-bounds";
export { resolveBandoriTeamSearchEventMode, resolveBandoriTeamSearchUseFever } from "../core/events";
export { evaluateTeam, evaluateBandoriTeamByCardIds } from "../core/team-evaluation";

export function searchBandoriBestTeams(input: BandoriTeamSearchInput): BandoriTeamSearchResponse {
  // searchMode is exact when the time budget allows full enumeration; bounded returns current top-N plus the observed score-bound gap.
  const startedAt = performance.now();
  const server = input.server ?? 3;
  const resultLimit = clamp(Math.trunc(input.resultLimit ?? 10), 1, 50);
  const perfectRate = clamp(input.perfectRate ?? 1, 0, 1);
  const target = normalizeSearchTarget(input.target);
  const eventMode = resolveBandoriTeamSearchEventMode(input.eventType, input.liveType);
  const useFever = resolveBandoriTeamSearchUseFever(input);
  const maxSearchDurationMs = Math.max(1000, Math.trunc(input.maxSearchDurationMs ?? 9000));
  const deadlineAt = startedAt + maxSearchDurationMs;
  const constraints = normalizeTeamSearchConstraints(input.constraints);

  // Stage 1: normalize input and precompute chart, skill, and support data that do not depend on search runtime state.
  const chart = getCachedPreparedChart(input);
  const calculatedCards = buildCalculatedCards(input);
  const supportBandContext = createSupportBandContext(input, calculatedCards);
  const objective = createSearchObjectiveAdapter(input, target, eventMode, supportBandContext);
  const rawConfigurations = createAreaItemConfigurations(input.userAreaItems);
  const prunedConfigurations = pruneDominatedAreaItemConfigurations(rawConfigurations, calculatedCards, input, server);
  const searchPrecomputed = buildSearchPrecomputedData(
    calculatedCards,
    input,
    prunedConfigurations,
    chart,
    server,
    supportBandContext,
  );
  const configurations = sortAreaItemConfigurationsForSearch(
    prunedConfigurations,
    calculatedCards,
    input,
    server,
    eventMode,
    searchPrecomputed,
  );

  // Stage 2: initialize runtime state. Detailed result fields are built only after a team reaches top-N.
  const skillRateProfiles = new Map(calculatedCards.map((card) => {
    const cardKey = getCardInstanceKey(card);
    const staticProfile = searchPrecomputed.cardStaticProfilesByKey.get(cardKey);
    if (!staticProfile) {
      return [cardKey, getCachedSearchCardSkillRateProfile(card, input, chart, server)] as const;
    }
    return [cardKey, staticProfile] as const;
  }));
  const results: BandoriTeamSearchResult[] = [];
  const stats = createInitialTeamSearchStats({
    calculatedCardCount: calculatedCards.length,
    rawConfigurationCount: rawConfigurations.length,
    configurationCount: configurations.length,
    usedEventBonus: Boolean(input.eventBonus),
    eventMode,
    useFever,
    supportBandContext,
  });

  if (calculatedCards.length < 5 || chart.notesCount === 0) {
    return finishTeamSearchResponse({
      results: [],
      stats,
      supportBandContext,
      startedAt,
      resultLimit,
      observedScoreUpperBound: Number.NEGATIVE_INFINITY,
    });
  }

  const baseScoreRatePerPower = calculateBaseScoreRatePerPower(chart);
  const scoreRateBaseUpper = baseScoreRatePerPower + calculateExternalSkillRateUpper(input, chart, server);
  const state: SingleSearchExecutionState = {
    input,
    chart,
    server,
    perfectRate,
    resultLimit,
    target,
    eventMode,
    supportBandContext,
    objective,
    stats,
    results,
    evaluatedTeamKeys: new Set<string>(),
    scoreCache: createScoreCalculationCache(),
    baseScoreRatePerPower,
    scoreRateBaseUpper,
    deadlineAt,
    observedScoreUpperBound: Number.NEGATIVE_INFINITY,
    visitedBranchCount: 0,
    constraints,
  };

  // Stage 3: evaluate seeds and prepare only the area configurations whose root bounds can still matter.
  const useContextPartitioning = constraints.minLeaderScoreUpPercent !== null
    || calculatedCards.length >= 1800
    || (target === "eventPoint" && eventMode === "pointBonus");
  const configurationSearches = buildConfigurationSearches({
    state,
    configurations,
    calculatedCards,
    skillRateProfiles,
    searchPrecomputed,
    useContextPartitioning,
  });

  // Stage 4: exact DFS over the surviving configurations.
  runExactDfsSearch(state, configurationSearches, useContextPartitioning);

  sortResults(results);
  return finishTeamSearchResponse({
    results,
    stats,
    supportBandContext,
    startedAt,
    resultLimit,
    observedScoreUpperBound: state.observedScoreUpperBound,
  });
}

export function isBandoriTeamSearchDifficulty(value: string): value is BandoriTeamSearchDifficulty {
  return (BANDORI_TEAM_SEARCH_DIFFICULTIES as readonly string[]).includes(value);
}
