/*
 * Legacy shared team-evaluation facade.
 *
 * New core evaluation imports should use ../core/team-evaluation. Single-search result
 * helpers now live under ../single/results.
 */
export { evaluateTeam, evaluateBandoriTeamByCardIds, createScoreCalculationCache } from "../core/team-evaluation";
export { pushResult, createInitialTeamSearchStats, markTeamSearchTimedOut, finishTeamSearchResponse } from "../single/results";
export type { EvaluateTeamOptions } from "../core/team-evaluation";
