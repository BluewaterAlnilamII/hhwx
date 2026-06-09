/*
 * Shared teambuilder data contracts.
 *
 * These types describe the public single-search API plus internal hot-path shapes reused by
 * medley. Keep algorithm-specific state out unless both search modes need the same contract.
 */
import type {
  BandoriCardAttribute,
  BandoriCharacterBonusState,
  BandoriEventBonus,
  BandoriJudge,
  BandoriUserAreaItemState,
  BandoriUserCardState,
  BestdoriAreaItemMaster,
  BestdoriCardMaster,
  BestdoriSkillMaster,
  CalculatedBandoriCard,
  ResolvedBandoriSkill,
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
  skills: Array<{
    cardId: number;
    cardInstanceKey?: string;
    skillId: number;
    skillLevel: number;
    resolvedSkill: ResolvedBandoriSkill | null;
  }>;
};

export type BandoriTeamSearchStats = {
  candidateCardCount: number;
  rawAreaItemConfigurationCount: number;
  compressedCandidateCount: number;
  areaItemConfigurationCount: number;
  prunedAreaItemConfigurationCount: number;
  enumeratedTeamCount: number;
  evaluatedTeamCount: number;
  targetOnlyEvaluationCount: number;
  hydratedResultCount: number;
  skippedHydrationCount: number;
  duplicateTeamCount: number;
  prunedBranchCount: number;
  elapsedMs: number;
  usedEventBonus: boolean;
  eventMode: BandoriTeamSearchEventMode;
  useFever: boolean;
  supportBandEnabled: boolean;
  supportCandidateCount: number;
  supportEvaluationCount: number;
  skippedSupportByUpperBoundCount: number;
  supportBandPowerUpperBound: number | null;
  supportAwareCompressionPrunedCount: number;
  tightUpperBoundCount: number;
  tightUpperBoundPrunedBranchCount: number;
  // Backward-compatible UI names; currently filled from correlated/tight upper-bound stats.
  secondLevelBoundCount: number;
  secondLevelPrunedCount: number;
  rootConfigSkippedCount: number;
  isExhaustive: boolean;
  timedOut: boolean;
  searchMode: "exact" | "bounded";
  observedScoreUpperBound: number | null;
  observedScoreUpperBoundGap: number | null;
};

export type BandoriTeamSearchResponse = {
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
  skillId: number;
  skillLevel: number;
};

export type BandoriTeamSearchInput = {
  userCards: BandoriUserCardState[];
  userAreaItems: BandoriUserAreaItemState[];
  characterBonuses: BandoriCharacterBonusState[];
  cardsById: Record<string, BestdoriCardMaster | undefined>;
  charactersById: Record<string, { bandId?: number | null } | undefined>;
  skillsById: Record<string, BestdoriSkillMaster | undefined>;
  areaItemsById: Record<string, BestdoriAreaItemMaster | undefined>;
  chart: BestdoriChartEntity[];
  chartCacheKey?: string;
  song: BestdoriSongMaster;
  difficulty: BandoriTeamSearchDifficulty;
  eventBonus?: BandoriEventBonus | null;
  resultLimit?: number;
  perfectRate?: number;
  useFever?: boolean;
  useSpecialRoomBonus?: boolean;
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
  server?: number;
  maxSearchDurationMs?: number;
  constraints?: BandoriTeamSearchConstraints;
};

export type SearchCard = CalculatedBandoriCard & {
  // Team power after the current area-item and event parameter bonuses; DFS bounds use this value only.
  effectivePower: number;
  pointBonusRate: number;
  // skillUpperRate is the coarse context-free bound; the following fields cover mixed / same-band / same-attribute contexts.
  skillUpperRate: number;
  skillAverageRate: number;
  skillLeaderRate: number;
  skillSameBandAverageRate: number;
  skillSameBandLeaderRate: number;
  skillSameAttributeAverageRate: number;
  skillSameAttributeLeaderRate: number;
  skillBothAverageRate: number;
  skillBothLeaderRate: number;
  skillMixedAverageRate: number;
  skillMixedLeaderRate: number;
  leaderScoreUpPercent: number;
  leaderSameBandScoreUpPercent: number;
  leaderSameAttributeScoreUpPercent: number;
  leaderBothScoreUpPercent: number;
  leaderMixedScoreUpPercent: number;
  supportPower: number;
  skillSearchSignature: string;
};

export type SearchCardSkillRateProfile = Pick<
  SearchCard,
  | "skillUpperRate"
  | "skillAverageRate"
  | "skillLeaderRate"
  | "skillSameBandAverageRate"
  | "skillSameBandLeaderRate"
  | "skillSameAttributeAverageRate"
  | "skillSameAttributeLeaderRate"
  | "skillBothAverageRate"
  | "skillBothLeaderRate"
  | "skillMixedAverageRate"
  | "skillMixedLeaderRate"
  | "leaderScoreUpPercent"
  | "leaderSameBandScoreUpPercent"
  | "leaderSameAttributeScoreUpPercent"
  | "leaderBothScoreUpPercent"
  | "leaderMixedScoreUpPercent"
>;

export type SearchConfiguration = {
  configuration: BandoriAreaItemConfiguration;
  searchCards: SearchCard[];
  upperBoundIndex: CharacterUpperBoundIndex;
  seedScore: number;
  seedTargetValue: number;
  rootScoreUpperBound: number;
  rootTargetUpperBound: number;
  // Large-pool searches partition by skill context so conditional skills can use tighter bounds.
  skillContextUpperMode?: SkillContextUpperMode;
};

export type SearchScope = {
  searchCards: SearchCard[];
  skillContextUpperMode?: SkillContextUpperMode;
};

export type SearchCardGroup = {
  characterId: number;
  characterIndex: number;
  startIndex: number;
  cards: SearchCard[];
};

export type SupportBandCandidate = {
  card: CalculatedBandoriCard;
  supportPower: number;
};

export type SupportBandSelection = {
  supportBandPower: number;
  supportCards: SupportBandCandidate[];
};

export type SupportBandContext = {
  enabled: boolean;
  candidates: SupportBandCandidate[];
  // Mission live support excludes main-team cards and duplicate characters; this keeps each card's opportunity cost.
  supportPowerByCardKey: Map<string, number>;
  supportBandPowerUpperBound: number;
  supportBandPointUpperBound: number;
  evaluationCount: number;
  skippedByUpperBoundCount: number;
  selectionCache: Map<string, SupportBandSelection>;
};

export type SearchCardStaticProfile = SearchCardSkillRateProfile & {
  skillSignature: string;
  pointBonusRate: number;
  supportPower: number;
  eventPower: number;
};

export type SearchPrecomputedData = {
  cardStaticProfilesByKey: Map<string, SearchCardStaticProfile>;
  areaItemPowerByConfigurationKey: Map<string, Float64Array>;
};

export type SearchObjectiveMode = "score" | "event-point" | "mission-event-point";

export type SearchObjectiveAdapter = {
  mode: SearchObjectiveMode;
  target: BandoriTeamSearchTarget;
  eventMode: BandoriTeamSearchEventMode;
  usesPointBonus: boolean;
  usesMissionSupport: boolean;
  supportBandPointUpperBound: number;
  maxSeedTeams: number;
  compressionDominates: (left: SearchCard, right: SearchCard) => boolean;
  getTraversalValue: (card: SearchCard, baseScoreRatePerPower: number) => number;
  getSeedTeamSortValue: (cards: SearchCard[]) => number;
  estimateTargetUpperBound: (
    scoreUpperBound: number,
    pointBonusRateUpper: number,
    input: BandoriTeamSearchInput,
    scoreRateUpper?: number,
  ) => number;
};

export type CharacterUpperBoundIndex = {
  characterIds: number[];
  characterIndexById: Map<number, number>;
  characterBandIds: Array<number | null>;
  bandIds: number[];
  // Each startIndex stores suffix bounds for the best contribution each character can still provide.
  // DFS excludes already selected characters with a mask, then takes the top remaining characters.
  powerByStartIndex: Float64Array[];
  pointBonusRateByStartIndex: Float64Array[];
  skillAverageRateByStartIndex: Float64Array[];
  skillLeaderRateByStartIndex: Float64Array[];
  skillSameBandAverageRateByStartIndex: Float64Array[];
  skillSameBandLeaderRateByStartIndex: Float64Array[];
  skillSameAttributeAverageRateByStartIndex: Float64Array[];
  skillSameAttributeLeaderRateByStartIndex: Float64Array[];
  skillBothAverageRateByStartIndex: Float64Array[];
  skillBothLeaderRateByStartIndex: Float64Array[];
  skillMixedAverageRateByStartIndex: Float64Array[];
  skillMixedLeaderRateByStartIndex: Float64Array[];
  leaderScoreUpPercentByStartIndex: Float64Array[];
  leaderSameBandScoreUpPercentByStartIndex: Float64Array[];
  leaderSameAttributeScoreUpPercentByStartIndex: Float64Array[];
  leaderBothScoreUpPercentByStartIndex: Float64Array[];
  leaderMixedScoreUpPercentByStartIndex: Float64Array[];
};

export type SkillContextUpperMode = "optimistic" | "same-band" | "same-attribute" | "both" | "mixed";

export type SkillUpperRates = {
  maxRate: number;
  averageRate: number;
  leaderRate: number;
};

export type ScoreCalculationCache = {
  judgeLists?: Map<string, BandoriJudge[]>;
  innerScoreRates?: Map<string, Float64Array>;
  baseScoresByChart?: WeakMap<PreparedChart, Map<string, number>>;
  noFloorBaseScoreRates?: Map<string, number>;
  skillMultiplierLists: Map<string, Float64Array>;
  noFloorSkillRates: Map<string, SkillUpperRates>;
  skillWindowContributionsByChart?: WeakMap<PreparedChart, Map<string, number[]>>;
  resolvedSkills?: Map<string, ResolvedBandoriSkill | null>;
};

export type PreparedNote = {
  beat: number;
  time: number;
  skill: boolean;
  fever: boolean;
};

export type PreparedChart = {
  // Notes are sorted in judgment order; long and slide notes are expanded into scoring endpoints.
  notes: PreparedNote[];
  playLevel: number;
  notesCount: number;
  // The first 5 entries are normal trigger windows; the 6th is the leader/encore window.
  skillStartNotes: number[];
  skillTriggerTimes: number[];
};

export type ScoreComboOptions = {
  startCombo?: number;
  useMedleyCombo?: boolean;
};
