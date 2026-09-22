/*
 * Shared teambuilder data contracts.
 *
 * These types describe Worker settings and display results. Search state and normalized
 * input contracts belong to medley-foundation and the Rust search crate.
 */
import type {
  BandoriCardAttribute,
} from "@/lib/bandori-team-calculator";
export const BANDORI_TEAM_SEARCH_DIFFICULTIES = ["easy", "normal", "hard", "expert", "special"] as const;

export type BandoriTeamSearchDifficulty = typeof BANDORI_TEAM_SEARCH_DIFFICULTIES[number];

export type BestdoriSongMaster = {
  difficulty?: Record<string, {
    playLevel?: unknown;
  }>;
};

export type BestdoriChartEntity = Record<string, unknown>;

export type BandoriAreaItemConfiguration = {
  bandKey: string | null;
  attribute: BandoriCardAttribute | null;
  parameter: "performance" | "technique" | "visual" | null;
  selectedAreaItemIds: number[];
};

export type BandoriTeamSearchResultCard = {
  cardId: number;
  cardInstanceKey?: string;
  characterId: number;
  bandId: number | null;
  attribute: BandoriCardAttribute;
  rarity: number;
  skillId: number;
  skillLevel: number;
  level: number;
  masterRank: number;
  isTrained: boolean;
  totalPower: number;
};

export type BandoriTeamSearchSupportCard = BandoriTeamSearchResultCard & {
  supportPower: number;
};

export type BandoriTeamSearchEventPointOption = {
  key: string;
  eventPoint: number;
  eventPointBase: number;
  multiplier: number;
  liveBoostCount?: 0 | 1 | 2 | 3;
  challengeCpCost?: 200 | 400 | 800 | 1600;
  placement?: 1 | 2 | 3 | 4 | 5;
  festivalResult?: "win" | "lose";
};

export type BandoriTeamSearchEventPointOptions = {
  mode: "none" | "liveBoost" | "challengeCp" | "versus" | "festival";
  defaultKey: string | null;
  options: BandoriTeamSearchEventPointOption[];
};

export type BandoriTeamSearchSkillOrderActor = "self" | "other1" | "other2" | "other3" | "other4";

export type BandoriTeamSearchResult = {
  orderModel?: "weighted_self" | "weighted_room";
  // Display identities: self = 1, external players = 2..5, in room-seat order.
  playerFormation?: number[];
  peakPlayerFormation?: number[];
  peakFormationCardIds?: number[];
  peakFormationCardInstanceKeys?: string[];
  peakLeaderCardId?: number;
  peakAverageScore?: number;
  rank: number;
  // targetValue is the actual ranking key: averageScore for score searches, sortable event-point base for PT searches.
  score: number;
  targetValue: number;
  // averageScore drives search ranking; max/min describe the theoretical spread from skill order.
  averageScore: number;
  maxScore: number;
  minScore: number;
  maxScoreOrderCount: number;
  maxScoreOrderTotal: number;
  currentMaxScoreOrderCount?: number;
  totalPower: number;
  rawCardPower: number;
  areaItemPower: number;
  eventPower: number;
  eventPowerWithRoom: number;
  pointBonusRate: number;
  eventPointBase: number | null;
  eventPointMultiplier: number;
  eventPoint: number | null;
  eventPointOptions: BandoriTeamSearchEventPointOptions;
  eventMode: BandoriTeamSearchEventMode;
  roomScore: number | null;
  supportBandPower: number | null;
  supportCards: BandoriTeamSearchSupportCard[];
  liveType: BandoriTeamSearchLiveType;
  eventType: BandoriTeamSearchEventType;
  target: BandoriTeamSearchTarget;
  leaderCardId: number;
  leaderCardInstanceKey?: string;
  skillOrderCardIds: number[];
  skillOrderCardInstanceKeys?: string[];
  skillOrderActors?: BandoriTeamSearchSkillOrderActor[];
  areaItemConfiguration: BandoriAreaItemConfiguration;
  context: {
    sameBandId: number | null;
    sameAttribute: BandoriCardAttribute | null;
  };
  cards: BandoriTeamSearchResultCard[];
};

export type BandoriTeamSearchStats = {
  candidateCardCount: number;
  areaItemConfigurationCount: number;
  evaluatedTeamCount: number;
  hydratedResultCount: number;
  prunedBranchCount: number;
  elapsedMs: number;
  supportBandEnabled: boolean;
  supportCandidateCount: number;
  supportEvaluationCount: number;
  isExhaustive: boolean;
  timedOut: boolean;
  searchMode: "exact" | "bounded";
};

export type BandoriTeamSearchResponse = {
  kind: "single";
  status: "exact" | "incomplete";
  incompleteReason?: string | null;
  results: BandoriTeamSearchResult[];
  stats: BandoriTeamSearchStats;
};

export type BandoriTeamSearchEventType =
  | "none"
  | "story"
  | "challenge"
  | "versus"
  | "live_try"
  | "mission_live"
  | "festival"
  | "medley";

export type BandoriTeamSearchLiveType = "free" | "multi" | "challenge" | "versus";

export type BandoriTeamSearchTarget = "score" | "eventPoint";

export type BandoriTeamSearchEventMode = "none" | "parameterPower" | "pointBonus";

export type BandoriTeamSearchConstraints = {
  minLeaderScoreUpPercent?: number;
  minTotalPower?: number;
};

export type BandoriTeamSearchExternalSkill = {
  conditionSatisfied?: boolean;
  skillId: number;
  skillLevel: number;
};

export type BandoriTeamSearchSettings = {
  resultLimit?: number;
  useFever?: boolean;
  eventType?: BandoriTeamSearchEventType;
  eventFormula?: 0 | 1 | 2;
  liveType?: BandoriTeamSearchLiveType;
  target?: BandoriTeamSearchTarget;
  roomPower?: number;
  otherPlayersAveragePower?: number;
  otherPlayerSkills?: BandoriTeamSearchExternalSkill[];
  encoreSkillSource?: "self" | "other1" | "other2" | "other3" | "other4";
  liveBoostCount?: 0 | 1 | 2 | 3;
  challengeCpCost?: 200 | 400 | 800 | 1600;
  constraints?: BandoriTeamSearchConstraints;
};
