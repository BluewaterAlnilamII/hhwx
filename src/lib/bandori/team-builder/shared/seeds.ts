/*
 * Legacy shared seed facade.
 *
 * New code should import single-search scope/seed/result helpers from ../single.
 */
export { createSearchScopes, scopeOwnsCompleteTeam } from "../single/scopes";
export { buildSeedTeams } from "../single/seeds";
export {
  compareResults,
  sortResults,
  toResultCards,
  toSupportResultCards,
  getBaseCardPower,
  getTeamEvaluationKey,
  getTeamCardSetKey,
} from "../single/results";
