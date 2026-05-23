/*
 * Public medley team-search entrypoint.
 *
 * Import medley search through this folder for new code. The legacy
 * src/lib/bandori-medley-team-search.ts facade remains for existing callers.
 */
export { searchBandoriBestMedleyTeams } from "./search";
export type {
  BandoriMedleySongSearchInput,
  BandoriMedleyTeamSearchInput,
  BandoriMedleyTeamSearchResult,
  BandoriMedleyTeamSearchProfilingStats,
  BandoriMedleyTeamSearchStats,
  BandoriMedleyTeamSearchResponse,
} from "./types";
