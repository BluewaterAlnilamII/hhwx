/*
 * Core team-builder import surface.
 *
 * This folder contains only code shared by single-song and medley search: card/chart
 * preparation, scoring, event handling, five-card team evaluation, and safe bounds.
 */
export * from "./calculator";
export * from "./types";
export { clamp, buildPermutations } from "./utils";
export { prepareBandoriChart, getCachedPreparedChart } from "./chart";
export { calculateBaseScoreRatePerPower } from "./scoring";
export {
  createAreaItemConfigurations,
  buildSearchCardSkillRateProfiles,
  pruneDominatedAreaItemConfigurations,
  buildCalculatedCards,
  buildSearchCardsForConfiguration,
  sortSearchCardsForTraversal,
} from "./cards";
export {
  buildCharacterUpperBoundIndex,
  insertTopValue,
  estimateAverageSkillRateUpper,
  CHARACTER_MASK_SEGMENT_BITS,
  hasCharacterIndexInMask,
  estimateSearchScopeScoreUpperBound,
} from "./character-bounds";
export { resolveBandoriTeamSearchEventMode, resolveBandoriTeamSearchUseFever } from "./events";
export {
  evaluateTeam,
  evaluateMedleyScoreOnlyTeam,
  evaluateMedleyScoreOnlyTeamScore,
  evaluateBandoriTeamByCardIds,
  createScoreCalculationCache,
} from "./team-evaluation";
