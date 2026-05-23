/*
 * Legacy compatibility facade for medley team search.
 *
 * New internal code should import from @/lib/bandori/team-builder/medley.
 */
export { searchBandoriBestMedleyTeams } from "@/lib/bandori/team-builder/medley/search";
export type {
  BandoriMedleySongSearchInput,
  BandoriMedleyTeamSearchInput,
  BandoriMedleyTeamSearchResult,
  BandoriMedleyTeamSearchProfilingStats,
  BandoriMedleyTeamSearchStats,
  BandoriMedleyTeamSearchResponse,
} from "@/lib/bandori/team-builder/medley/types";
