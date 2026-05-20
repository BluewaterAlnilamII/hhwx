/*
 * Bandori 组曲队伍搜索实验路径。
 *
 * 当前发布主路径是单曲 team builder；组曲搜索保留为独立优化对象。
 * 本文件包含多队联动和容量上界估计，后续应单独拆分，不和单曲发布清理混在一起。
 */
import {
  calculateBandoriCardEventBonus,
  type CalculatedBandoriCard,
  type BandoriCardAttribute,
} from "@/lib/bandori-team-calculator";
import {
  CHARACTER_MASK_SEGMENT_BITS,
  buildCharacterUpperBoundIndex,
  buildPermutations,
  buildCalculatedCards,
  buildSearchCardSkillRateProfiles,
  buildSearchCardsForConfiguration,
  calculateBaseScoreRatePerPower,
  clamp,
  createAreaItemConfigurations,
  evaluateTeam,
  estimateSearchScopeScoreUpperBound,
  getCachedPreparedChart,
  hasCharacterIndexInMask,
  insertTopValue,
  pruneDominatedAreaItemConfigurations,
  sortSearchCardsForTraversal,
  type BandoriAreaItemConfiguration,
  type BandoriTeamSearchDifficulty,
  type BandoriTeamSearchInput,
  type BandoriTeamSearchResult,
  type BestdoriChartEntity,
  type BestdoriSongMaster,
  type CharacterUpperBoundIndex,
  type PreparedChart,
  type ScoreCalculationCache,
  type ScoreComboOptions,
  type SearchCard,
} from "@/lib/bandori-team-search";

export type BandoriMedleySongSearchInput = {
  chart: BestdoriChartEntity[];
  chartCacheKey?: string;
  song: BestdoriSongMaster;
  difficulty: BandoriTeamSearchDifficulty;
  /** Ignored for medley scoring; medley lives are always no-fever. */
  useFever?: boolean;
};

export type BandoriMedleyTeamSearchInput = Omit<
  BandoriTeamSearchInput,
  | "chart"
  | "chartCacheKey"
  | "song"
  | "difficulty"
  | "useFever"
  | "liveType"
  | "target"
  | "roomPower"
  | "otherPlayersAveragePower"
  | "otherPlayerSkills"
  | "encoreSkillSource"
> & {
  songs: BandoriMedleySongSearchInput[];
  target?: "score";
  coarseAreaItemFilter?: {
    mode?: "auto" | "locked";
    bandKey?: string | null;
    attribute?: BandoriCardAttribute | null;
    candidateLimit?: number;
  };
  optimization?: {
    captureUpperWitness?: boolean;
    captureCapacityUpperWitness?: boolean;
    enableAnchorSlotUpper?: boolean;
    enableAnchorPairUpper?: boolean;
    anchorCandidateLimit?: number;
    enableOpportunityCostUpper?: boolean;
    opportunityAnchorLimit?: number;
    enableTeamSharedCoefficientUpper?: boolean;
  };
};

export type BandoriMedleyTeamSearchResult = {
  rank: number;
  score: number;
  averageScore: number;
  maxScore: number;
  minScore: number;
  areaItemConfiguration: BandoriAreaItemConfiguration;
  songResults: Array<BandoriTeamSearchResult & {
    songIndex: number;
    startCombo: number;
    notesCount: number;
  }>;
  cardIds: number[];
};

type MedleyObservedUpperBoundSource =
  | "configuration-root"
  | "dfs-remaining"
  | "last-slot-completion"
  | "slot-branch";

type MedleyRemainingUpperBoundLimiter = "capacity" | "correlated";

type MedleyCapacityUpperMode =
  | "coefficient"
  | "skill-aware"
  | "card-bound-skill-aware"
  | "bucketed-capacity"
  | "dual-objective"
  | "card-bound-dual-objective"
  | "card-bound-lagrangian"
  | "card-bound-bucketed-joint"
  | "card-specific-coefficient"
  | "leader-fixed-card-specific-coefficient"
  | "leader-group-card-specific-coefficient"
  | "context-fixed-card-specific-coefficient"
  | "context-group-card-specific-coefficient"
  | "context-bound-lagrangian"
  | "context-bound-bucketed-joint"
  | "context-bound-mccormick"
  | "opportunity-cost"
  | "team-shared-coefficient"
  | "card-specific-lagrangian"
  | "card-min-coefficient"
  | "anchor-slot-decomposition"
  | "pareto"
  | "pareto-relaxed-pair";

export type BandoriMedleyUpperWitnessSlot = {
  slotIndex: number;
  songIndex: number;
  startCombo: number;
  notesCount: number;
  score: number;
  upperContribution?: number;
  totalPower: number;
  eventPower: number;
  eventMode: string | null;
  leaderCardId: number | null;
  cardIds: number[];
  characterIds: number[];
};

export type BandoriMedleyUpperWitness = {
  source: "relaxed-best-slots" | "capacity-assignment";
  upperBound: number;
  assignmentUpperBound?: number;
  evaluatedScore: number;
  gap: number;
  teamSharedGap?: number;
  crossSlotDuplicateCardCount?: number;
  contextOrProductGap?: number;
  disjointEvaluatedScore: number | null;
  disjointGap: number | null;
  capacityMode: string | null;
  overlapCardIds: number[];
  gapCategory: "relaxed-slot-overlap" | "upper-model-gap" | "capacity-model-gap";
  slots: BandoriMedleyUpperWitnessSlot[];
  disjointSlots: BandoriMedleyUpperWitnessSlot[] | null;
};

export type BandoriMedleyTeamSearchProfilingStats = {
  startedAreaItemConfigurationCount: number;
  completedAreaItemConfigurationCount: number;
  bestGreedySeedScore: number | null;
  reverseSongOrderGreedySeedScore: number | null;
  visitedBranchCount: number;
  slotBranchUpperBoundCallCount: number;
  slotBranchUpperBoundStateCount: number;
  remainingUpperBoundCallCount: number;
  remainingUpperBoundCacheHitCount: number;
  remainingUpperBoundCacheMissCount: number;
  bestSlotTeamCacheHitCount: number;
  bestSlotTeamCacheMissCount: number;
  teamEvaluationCacheHitCount: number;
  teamEvaluationCacheMissCount: number;
  proofFriendlySlotChoiceCount: number;
  fixedCardSetOptimizationCount: number;
  fixedCardSetOptimizationCacheHitCount: number;
  fixedCardSetOptimizationCacheMissCount: number;
  fixedCardSetImprovementCount: number;
  bestFixedCardSetImprovement: number;
  cardPoolOptimizationCount: number;
  cardPoolOptimizationImprovementCount: number;
  bestCardPoolOptimizationImprovement: number;
  configurationSeedPassCount: number;
  configurationSeedPassImprovementCount: number;
  bestConfigurationSeedPassScore: number | null;
  coarseLockedConfigurationCount: number;
  coarseAutoSelectedConfigurationCount: number;
  coarseAutoSelectedGroupCount: number;
  inclusionUpperAnalysisCount: number;
  inclusionUpperPrunedCardCount: number;
  observedUpperBoundSource: MedleyObservedUpperBoundSource | null;
  observedUpperBoundRemainingSlotCount: number | null;
  remainingUpperBoundMax: number | null;
  remainingUpperBoundMaxCorrelated: number | null;
  remainingUpperBoundMaxCapacity: number | null;
  remainingUpperBoundMaxCapacityMode: MedleyCapacityUpperMode | null;
  remainingUpperBoundMaxSlotCount: number | null;
  remainingUpperBoundMaxLimiter: MedleyRemainingUpperBoundLimiter | null;
  capacityParetoUpperCallCount: number;
  capacityParetoUpperCompletedCount: number;
  capacityParetoUpperAbortCount: number;
  capacityParetoUpperStateCount: number;
  capacityParetoUpperMaxProcessedStateCount: number;
  bestCapacityParetoImprovement: number;
  capacityBucketedUpperCallCount: number;
  capacityBucketedUpperCompletedCount: number;
  capacityBucketedUpperAbortCount: number;
  capacityBucketedUpperStateCount: number;
  capacityBucketedUpperMaxProcessedStateCount: number;
  capacityBucketedUpperBucketSize: number | null;
  capacityBucketedUpperImprovementCount: number;
  capacityBucketedUpperImprovementTotal: number;
  bestCapacityBucketedImprovement: number;
  capacityCoefficientTighteningCallCount: number;
  capacityCoefficientTighteningSlotImprovementCount: number;
  capacityCoefficientTighteningSlotImprovementTotal: number;
  bestCapacityCoefficientTighteningSlotImprovement: number;
  capacityCoefficientTighteningScoreImprovementCount: number;
  capacityCoefficientTighteningScoreImprovementTotal: number;
  bestCapacityCoefficientTighteningScoreImprovement: number;
  capacityCardSpecificCoefficientUpperCallCount: number;
  capacityCardSpecificCoefficientUpperCompletedCount: number;
  capacityCardSpecificCoefficientUpperImprovementCount: number;
  capacityCardSpecificCoefficientUpperImprovementTotal: number;
  bestCapacityCardSpecificCoefficientUpperImprovement: number;
  capacityLeaderFixedCardSpecificUpperCallCount: number;
  capacityLeaderFixedCardSpecificUpperCompletedCount: number;
  capacityLeaderFixedCardSpecificUpperImprovementCount: number;
  capacityLeaderFixedCardSpecificUpperImprovementTotal: number;
  bestCapacityLeaderFixedCardSpecificUpperImprovement: number;
  capacityLeaderGroupCardSpecificUpperCallCount: number;
  capacityLeaderGroupCardSpecificUpperCompletedCount: number;
  capacityLeaderGroupCardSpecificUpperImprovementCount: number;
  capacityLeaderGroupCardSpecificUpperImprovementTotal: number;
  bestCapacityLeaderGroupCardSpecificUpperImprovement: number;
  capacityLeaderGroupCardSpecificUpperGroupCount: number | null;
  capacityContextFixedCardSpecificUpperCallCount: number;
  capacityContextFixedCardSpecificUpperCompletedCount: number;
  capacityContextFixedCardSpecificUpperImprovementCount: number;
  capacityContextFixedCardSpecificUpperImprovementTotal: number;
  bestCapacityContextFixedCardSpecificUpperImprovement: number;
  capacityContextGroupCardSpecificUpperCallCount: number;
  capacityContextGroupCardSpecificUpperCompletedCount: number;
  capacityContextGroupCardSpecificUpperImprovementCount: number;
  capacityContextGroupCardSpecificUpperImprovementTotal: number;
  bestCapacityContextGroupCardSpecificUpperImprovement: number;
  capacityContextGroupCardSpecificUpperGroupCount: number | null;
  capacityContextBoundLagrangianUpperCallCount: number;
  capacityContextBoundLagrangianUpperCompletedCount: number;
  capacityContextBoundLagrangianUpperImprovementCount: number;
  capacityContextBoundLagrangianUpperImprovementTotal: number;
  bestCapacityContextBoundLagrangianUpperImprovement: number;
  bestCapacityContextBoundLagrangianWeight: number | null;
  capacityContextBoundLagrangianUpperGroupCount: number | null;
  capacityContextBoundBucketedJointUpperCallCount: number;
  capacityContextBoundBucketedJointUpperCompletedCount: number;
  capacityContextBoundBucketedJointUpperAbortCount: number;
  capacityContextBoundBucketedJointUpperStateCount: number;
  capacityContextBoundBucketedJointUpperMaxProcessedStateCount: number;
  capacityContextBoundBucketedJointUpperBucketSize: number | null;
  capacityContextBoundBucketedJointUpperTargetBucketCount: number | null;
  capacityContextBoundBucketedJointUpperProcessedCombinationCount: number;
  capacityContextBoundBucketedJointUpperCombinationCount: number | null;
  capacityContextBoundBucketedJointUpperProcessedMaxCoefficientUpper: number | null;
  capacityContextBoundBucketedJointUpperUnprocessedMaxCoefficientUpper: number | null;
  bestCapacityContextBoundBucketedJointUpperCombinationImprovement: number;
  capacityContextBoundBucketedJointUpperImprovementCount: number;
  capacityContextBoundBucketedJointUpperImprovementTotal: number;
  bestCapacityContextBoundBucketedJointUpperImprovement: number;
  capacityContextBoundMcCormickUpperCallCount: number;
  capacityContextBoundMcCormickUpperCompletedCount: number;
  capacityContextBoundMcCormickUpperProcessedCombinationCount: number;
  capacityContextBoundMcCormickUpperCombinationCount: number | null;
  capacityContextBoundMcCormickUpperProcessedMaxCoefficientUpper: number | null;
  capacityContextBoundMcCormickUpperUnprocessedMaxCoefficientUpper: number | null;
  bestCapacityContextBoundMcCormickUpperCombinationImprovement: number;
  capacityContextBoundMcCormickUpperImprovementCount: number;
  capacityContextBoundMcCormickUpperImprovementTotal: number;
  bestCapacityContextBoundMcCormickUpperImprovement: number;
  capacityContextBoundPowerSplitMcCormickUpperCallCount: number;
  capacityContextBoundPowerSplitMcCormickUpperCompletedCount: number;
  capacityContextBoundPowerSplitMcCormickUpperAbortCount: number;
  capacityContextBoundPowerSplitMcCormickUpperStateCount: number;
  capacityContextBoundPowerSplitMcCormickUpperMaxProcessedStateCount: number;
  capacityContextBoundPowerSplitMcCormickUpperProcessedCombinationCount: number;
  bestCapacityContextBoundPowerSplitMcCormickUpperCombinationImprovement: number;
  capacityContextBoundSplitSkillMcCormickUpperCallCount: number;
  capacityContextBoundSplitSkillMcCormickUpperCompletedCount: number;
  capacityContextBoundSplitSkillMcCormickUpperProcessedCombinationCount: number;
  bestCapacityContextBoundSplitSkillMcCormickUpperCombinationImprovement: number;
  capacityOpportunityCostUpperCallCount: number;
  capacityOpportunityCostUpperCompletedCount: number;
  capacityOpportunityCostUpperAbortCount: number;
  capacityOpportunityCostUpperAnchorCount: number;
  capacityOpportunityCostUpperTailUpper: number | null;
  capacityOpportunityCostUpperImprovementCount: number;
  capacityOpportunityCostUpperImprovementTotal: number;
  bestCapacityOpportunityCostUpperImprovement: number;
  capacityOpportunityCostUpperElapsedMs: number;
  capacityTeamSharedCoefficientUpperCallCount: number;
  capacityTeamSharedCoefficientUpperCompletedCount: number;
  capacityTeamSharedCoefficientUpperAbortCount: number;
  capacityTeamSharedCoefficientUpperStateCount: number;
  bestCapacityTeamSharedCoefficientUpperImprovement: number;
  capacityContextBoundCardBoundUpperCallCount: number;
  capacityContextBoundCardBoundUpperCompletedCount: number;
  capacityContextBoundCardBoundUpperProcessedCombinationCount: number;
  bestCapacityContextBoundCardBoundUpperCombinationImprovement: number;
  capacityCardSpecificLagrangianUpperCallCount: number;
  capacityCardSpecificLagrangianUpperCompletedCount: number;
  capacityCardSpecificLagrangianUpperImprovementCount: number;
  capacityCardSpecificLagrangianUpperImprovementTotal: number;
  bestCapacityCardSpecificLagrangianUpperImprovement: number;
  bestCapacityCardSpecificLagrangianWeight: number | null;
  capacityCardMinCoefficientUpperCallCount: number;
  capacityCardMinCoefficientUpperCompletedCount: number;
  capacityCardMinCoefficientUpperAbortCount: number;
  capacityCardMinCoefficientUpperStateCount: number;
  capacityCardMinCoefficientUpperMaxProcessedStateCount: number;
  capacityCardMinCoefficientUpperBucketSize: number | null;
  capacityCardMinCoefficientUpperTargetBucketCount: number | null;
  capacityCardMinCoefficientUpperImprovementCount: number;
  capacityCardMinCoefficientUpperImprovementTotal: number;
  bestCapacityCardMinCoefficientUpperImprovement: number;
  capacityCardBoundUpperCallCount: number;
  capacityCardBoundUpperCompletedCount: number;
  capacityCardBoundUpperSkippedCount: number;
  capacityCardBoundUpperImprovementCount: number;
  capacityCardBoundUpperImprovementTotal: number;
  bestCapacityCardBoundUpperImprovement: number;
  capacityCardBoundDualUpperCallCount: number;
  capacityCardBoundDualUpperCompletedCount: number;
  capacityCardBoundDualUpperAbortCount: number;
  capacityCardBoundDualUpperStateCount: number;
  capacityCardBoundDualUpperMaxProcessedStateCount: number;
  capacityCardBoundDualUpperImprovementCount: number;
  capacityCardBoundDualUpperImprovementTotal: number;
  bestCapacityCardBoundDualUpperImprovement: number;
  capacityCardBoundLagrangianUpperCallCount: number;
  capacityCardBoundLagrangianUpperCompletedCount: number;
  capacityCardBoundLagrangianUpperImprovementCount: number;
  capacityCardBoundLagrangianUpperImprovementTotal: number;
  bestCapacityCardBoundLagrangianUpperImprovement: number;
  bestCapacityCardBoundLagrangianWeight: number | null;
  capacityCardBoundBucketedJointUpperCallCount: number;
  capacityCardBoundBucketedJointUpperCompletedCount: number;
  capacityCardBoundBucketedJointUpperAbortCount: number;
  capacityCardBoundBucketedJointUpperStateCount: number;
  capacityCardBoundBucketedJointUpperMaxProcessedStateCount: number;
  capacityCardBoundBucketedJointUpperBucketSize: number | null;
  capacityCardBoundBucketedJointUpperTargetBucketCount: number | null;
  capacityCardBoundBucketedJointUpperImprovementCount: number;
  capacityCardBoundBucketedJointUpperImprovementTotal: number;
  bestCapacityCardBoundBucketedJointUpperImprovement: number;
  capacityAnchorSlotUpperCallCount: number;
  capacityAnchorSlotUpperCompletedCount: number;
  capacityAnchorSlotUpperAbortCount: number;
  capacityAnchorSlotUpperCandidateCount: number;
  capacityAnchorSlotUpperAnchorSlotIndex: number | null;
  capacityAnchorSlotUpperTailUpper: number | null;
  capacityAnchorSlotUpperImprovementCount: number;
  capacityAnchorSlotUpperImprovementTotal: number;
  bestCapacityAnchorSlotUpperImprovement: number;
  capacityAnchorSlotUpperElapsedMs: number;
  upperWitnessCaptureCount: number;
  upperWitnessUpperBound: number | null;
  upperWitnessEvaluatedScore: number | null;
  upperWitnessGap: number | null;
  capacityUpperWitnessCaptureCount: number;
  capacityUpperWitnessUpperBound: number | null;
  capacityUpperWitnessEvaluatedScore: number | null;
  capacityUpperWitnessGap: number | null;
  capacityUpperWitnessTeamSharedGap: number | null;
  capacityUpperWitnessCrossSlotDuplicateCardCount: number;
  capacityUpperWitnessContextOrProductGap: number | null;
  upperWitness: BandoriMedleyUpperWitness | null;
};

export type BandoriMedleyTeamSearchStats = {
  candidateCardCount: number;
  rawAreaItemConfigurationCount: number;
  areaItemConfigurationCount: number;
  prunedAreaItemConfigurationCount: number;
  enumeratedTeamCount: number;
  evaluatedTeamCount: number;
  prunedBranchCount: number;
  elapsedMs: number;
  isExhaustive: boolean;
  timedOut: boolean;
  searchMode: "exact" | "bounded";
  observedScoreUpperBound: number | null;
  observedScoreUpperBoundGap: number | null;
  profiling: BandoriMedleyTeamSearchProfilingStats;
};

export type BandoriMedleyTeamSearchResponse = {
  results: BandoriMedleyTeamSearchResult[];
  stats: BandoriMedleyTeamSearchStats;
};

type MedleySlotSearch = {
  songIndex: number;
  startCombo: number;
  chart: PreparedChart;
  input: BandoriTeamSearchInput;
  configuration: BandoriAreaItemConfiguration;
  searchCards: SearchCard[];
  upperBoundIndex: CharacterUpperBoundIndex;
  baseScoreRatePerPower: number;
  rootScoreUpperBound: number;
  scoreCache: ScoreCalculationCache;
  comboOptions: ScoreComboOptions;
  teamEvaluationCache: Map<string, BandoriTeamSearchResult | null>;
};

type MedleyTeamCandidate = {
  result: BandoriTeamSearchResult;
  cards: SearchCard[];
  cardIds: number[];
};

type MedleyAnchorSlotUpperEstimate = {
  upperBound: number;
  anchorSlotIndex: number;
  candidateCount: number;
  tailUpper: number | null;
};

type MedleyOpportunityCostUpperEstimate = {
  upperBound: number;
  anchorSlotIndex: number;
  anchorCount: number;
  tailUpper: number | null;
};

type MedleySlotAvailability = {
  availableCardCount: number;
  availableCharacterCount: number;
  scoreUpperBound: number;
};

type MedleyBestSlotTeamCacheEntry = {
  candidate: MedleyTeamCandidate | null;
};

type MedleyFixedCardSetOptimizationCacheEntry = {
  result: BandoriMedleyTeamSearchResult | null;
};

type MedleyConfigurationWarmupCache = {
  slots: MedleySlotSearch[];
  bestSlotTeamCache: Map<string, MedleyBestSlotTeamCacheEntry>;
  fixedCardSetOptimizationCache: Map<string, MedleyFixedCardSetOptimizationCacheEntry>;
};

type MedleySkillContextUpperMode = "optimistic" | "mixed" | "same-band" | "same-attribute" | "both";

type MedleySkillContextUpper = {
  mode: MedleySkillContextUpperMode;
  bandId?: number;
  attribute?: SearchCard["attribute"];
};

const MEDLEY_TEAM_COUNT = 3;

const MEDLEY_TEAM_SIZE = 5;

const MEDLEY_SKILL_COEFFICIENT_EPSILON = 1e-9;

const MEDLEY_CAPACITY_PARETO_TWO_SLOT_STATE_BUDGET = 300_000;

const MEDLEY_CAPACITY_PARETO_THREE_SLOT_STATE_BUDGET = 80_000;

const MEDLEY_CAPACITY_DUAL_OBJECTIVE_STATE_BUDGET = 500_000;

const MEDLEY_CAPACITY_PARETO_GLOBAL_STATE_BUDGET = 1_200_000;

const MEDLEY_CAPACITY_CARD_BOUND_DUAL_OBJECTIVE_STATE_BUDGET = 2_000_000;

const MEDLEY_CAPACITY_CARD_BOUND_DUAL_OBJECTIVE_GLOBAL_STATE_BUDGET = 4_000_000;

const MEDLEY_ENABLE_CARD_BOUND_DUAL_OBJECTIVE_UPPER = false;

const MEDLEY_ENABLE_LEADER_FIXED_CARD_SPECIFIC_UPPER = false;

const MEDLEY_ENABLE_LEADER_GROUP_CARD_SPECIFIC_UPPER = false;

const MEDLEY_ENABLE_CONTEXT_FIXED_CARD_SPECIFIC_UPPER = true;

const MEDLEY_ENABLE_CONTEXT_GROUP_CARD_SPECIFIC_UPPER = true;

const MEDLEY_ENABLE_CONTEXT_BOUND_LAGRANGIAN_UPPER = false;

const MEDLEY_CONTEXT_GROUP_CARD_SPECIFIC_TOP_COUNT = 8;

const MEDLEY_CONTEXT_GROUP_CARD_SPECIFIC_TAIL_GROUP_SIZE = 4;

const MEDLEY_ENABLE_CONTEXT_BOUND_BUCKETED_JOINT_UPPER = false;

const MEDLEY_ENABLE_CONTEXT_BOUND_MCCORMICK_UPPER = true;

const MEDLEY_CONTEXT_BOUND_MCCORMICK_MAX_PROCESSED_COMBINATIONS = 48;

const MEDLEY_CONTEXT_BOUND_MCCORMICK_SCORE_WINDOW = 80_000;

const MEDLEY_ENABLE_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_UPPER = false;

const MEDLEY_ENABLE_CONTEXT_BOUND_SPLIT_SKILL_MCCORMICK_UPPER = true;

const MEDLEY_CONTEXT_BOUND_SPLIT_SKILL_MCCORMICK_MAX_PROCESSED_COMBINATIONS = 48;

const MEDLEY_ENABLE_CONTEXT_BOUND_CARD_BOUND_UPPER = true;

const MEDLEY_CONTEXT_BOUND_CARD_BOUND_MAX_PROCESSED_COMBINATIONS = 48;

const MEDLEY_ENABLE_TEAM_SHARED_COEFFICIENT_UPPER = true;

const MEDLEY_TEAM_SHARED_COEFFICIENT_MAX_PROCESSED_COMBINATIONS = 2;

const MEDLEY_TEAM_SHARED_COEFFICIENT_INTERVAL_COUNT = 2;

const MEDLEY_TEAM_SHARED_COEFFICIENT_STATE_BUDGET = 2_500_000;

const MEDLEY_TEAM_SHARED_COEFFICIENT_GLOBAL_STATE_BUDGET = 5_500_000;

const MEDLEY_DEFAULT_OPPORTUNITY_ANCHOR_LIMIT = 16;

const MEDLEY_MAX_OPPORTUNITY_ANCHOR_LIMIT = 48;

const MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_MAX_PROCESSED_COMBINATIONS = 4;

const MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_BUCKET_COUNT = 4;

const MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_STATE_BUDGET = 220_000;

const MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_GLOBAL_STATE_BUDGET = 1_200_000;

const MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_TARGET_BUCKET_COUNTS = [64, 32, 16, 8] as const;

const MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_MIN_BUCKET_SIZE = 500;

const MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_MAX_PROCESSED_COMBINATIONS = 8;

const MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_SCORE_WINDOW = 35_000;

const MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_STATE_BUDGET = 1_500_000;

const MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_GLOBAL_STATE_BUDGET = 6_000_000;

const MEDLEY_LEADER_GROUP_CARD_SPECIFIC_TOP_COUNT = 6;

const MEDLEY_LEADER_GROUP_CARD_SPECIFIC_TAIL_GROUP_SIZE = 4;

const MEDLEY_ENABLE_CARD_SPECIFIC_LAGRANGIAN_UPPER = false;

const MEDLEY_CARD_BOUND_LAGRANGIAN_WEIGHTS = [
  0.05,
  0.1,
  0.15,
  0.2,
  0.25,
  0.3,
  0.35,
  0.4,
  0.45,
  0.5,
  0.55,
  0.6,
  0.65,
  0.7,
  0.75,
  0.8,
  0.85,
  0.9,
  0.925,
  0.95,
  0.975,
  0.99,
] as const;

const MEDLEY_CONTEXT_BOUND_LAGRANGIAN_WEIGHTS = [0, 0.85, 0.9, 0.95, 0.975, 0.99, 1] as const;

const MEDLEY_CONTEXT_BOUND_LAGRANGIAN_MAX_GROUP_COMBINATIONS = 1_000;

const MEDLEY_CARD_BOUND_BUCKETED_JOINT_TARGET_BUCKET_COUNTS = [1024, 512, 256, 128, 64] as const;

const MEDLEY_CARD_BOUND_BUCKETED_JOINT_MIN_BUCKET_SIZE = 500;

const MEDLEY_CARD_BOUND_BUCKETED_JOINT_STATE_BUDGET = 1_200_000;

const MEDLEY_CARD_BOUND_BUCKETED_JOINT_GLOBAL_STATE_BUDGET = 3_000_000;

const MEDLEY_CARD_MIN_COEFFICIENT_TARGET_BUCKET_COUNTS = [256, 128, 64, 32, 16] as const;

const MEDLEY_ENABLE_CARD_MIN_COEFFICIENT_UPPER = false;

const MEDLEY_CARD_MIN_COEFFICIENT_STATE_BUDGET = 1_200_000;

const MEDLEY_CARD_MIN_COEFFICIENT_GLOBAL_STATE_BUDGET = 3_000_000;

const MEDLEY_CARD_MIN_COEFFICIENT_DOMINANCE_PRUNE_THRESHOLD = 96;

const MEDLEY_CAPACITY_BUCKETED_STATE_BUDGET = 2_000_000;

const MEDLEY_CAPACITY_BUCKETED_GLOBAL_STATE_BUDGET = 6_000_000;

const MEDLEY_CAPACITY_BUCKETED_TARGET_BUCKET_COUNT = 64;

const MEDLEY_CAPACITY_BUCKETED_MIN_BUCKET_SIZE = 1_000;

const MEDLEY_CAPACITY_BUCKETED_BUCKET_SIZE_STEP = 250;

const MEDLEY_CAPACITY_PARETO_TWO_SLOT_CARD_RECORD_BUDGET = 700;

const MEDLEY_CAPACITY_PARETO_THREE_SLOT_CARD_RECORD_BUDGET = 450;

const MEDLEY_ENABLE_BUCKETED_CAPACITY_UPPER = false;

const MEDLEY_DEFAULT_ANCHOR_CANDIDATE_LIMIT = 32;

const MEDLEY_BAND_ID_BY_AREA_ITEM_KEY: Record<string, number | null> = {
  PoppinParty: 1,
  Afterglow: 2,
  HelloHappyWorld: 3,
  PastelPalettes: 4,
  Roselia: 5,
  Morfonica: 21,
  RaiseASuilen: 18,
  MyGO: 45,
  Everyone: null,
};

const MEDLEY_PARAMETER_KEYS = ["performance", "technique", "visual"] as const;

function createMedleySlotInput(
  input: BandoriMedleyTeamSearchInput,
  songInput: BandoriMedleySongSearchInput,
): BandoriTeamSearchInput {
  const { songs, target, ...commonInput } = input;
  void songs;
  void target;
  return {
    ...commonInput,
    chart: songInput.chart,
    chartCacheKey: songInput.chartCacheKey,
    song: songInput.song,
    difficulty: songInput.difficulty,
    // Medley lives do not have fever sections, regardless of caller-provided song flags.
    eventType: "medley",
    useFever: false,
    liveType: "free",
    target: "score",
    useSpecialRoomBonus: false,
  };
}

function getMedleyTeamEvaluationCacheKey(cards: SearchCard[]): string {
  return cards.map((card) => card.cardId).join(",");
}

function buildMedleyResult(
  slots: MedleySlotSearch[],
  selectedBySong: Array<MedleyTeamCandidate | undefined>,
  configuration: BandoriAreaItemConfiguration,
): BandoriMedleyTeamSearchResult | null {
  const slotsBySong = [...slots].sort((left, right) => left.songIndex - right.songIndex);
  const songResults: BandoriMedleyTeamSearchResult["songResults"] = [];

  for (const slot of slotsBySong) {
    const candidate = selectedBySong[slot.songIndex];
    if (!candidate) {
      return null;
    }
    songResults.push({
      ...candidate.result,
      songIndex: slot.songIndex,
      startCombo: slot.startCombo,
      notesCount: slot.chart.notesCount,
    });
  }

  const score = songResults.reduce((sum, result) => sum + result.score, 0);
  return {
    rank: 0,
    score,
    averageScore: songResults.reduce((sum, result) => sum + result.averageScore, 0),
    maxScore: songResults.reduce((sum, result) => sum + result.maxScore, 0),
    minScore: songResults.reduce((sum, result) => sum + result.minScore, 0),
    areaItemConfiguration: configuration,
    songResults,
    cardIds: songResults.flatMap((result) => result.cards.map((card) => card.cardId)),
  };
}

function sortMedleyResults(results: BandoriMedleyTeamSearchResult[]): void {
  results.sort((left, right) => (
    right.score - left.score
    || right.maxScore - left.maxScore
    || left.cardIds.join(",").localeCompare(right.cardIds.join(","))
  ));
  results.forEach((result, index) => {
    result.rank = index + 1;
  });
}

function pushMedleyResult(
  results: BandoriMedleyTeamSearchResult[],
  result: BandoriMedleyTeamSearchResult,
  resultLimit: number,
): void {
  results.push(result);
  sortMedleyResults(results);
  if (results.length > resultLimit) {
    results.pop();
  }
}

function getMedleyCardSkillAverageRateForContext(card: SearchCard, mode: MedleySkillContextUpperMode): number {
  if (mode === "optimistic") {
    return card.skillAverageRate;
  }
  if (mode === "mixed") {
    return card.skillMixedAverageRate;
  }
  if (mode === "same-band") {
    return card.skillSameBandAverageRate;
  }
  if (mode === "same-attribute") {
    return card.skillSameAttributeAverageRate;
  }
  return card.skillBothAverageRate;
}

function getMedleyCardSkillLeaderRateForContext(card: SearchCard, mode: MedleySkillContextUpperMode): number {
  if (mode === "optimistic") {
    return card.skillLeaderRate;
  }
  if (mode === "mixed") {
    return card.skillMixedLeaderRate;
  }
  if (mode === "same-band") {
    return card.skillSameBandLeaderRate;
  }
  if (mode === "same-attribute") {
    return card.skillSameAttributeLeaderRate;
  }
  return card.skillBothLeaderRate;
}

function getMedleyCardSkillAverageRateUpper(card: SearchCard): number {
  return Math.max(
    card.skillAverageRate,
    card.skillSameBandAverageRate,
    card.skillSameAttributeAverageRate,
    card.skillBothAverageRate,
    card.skillMixedAverageRate,
  );
}

function getMedleyCardSkillLeaderRateUpper(card: SearchCard): number {
  return Math.max(
    card.skillLeaderRate,
    card.skillSameBandLeaderRate,
    card.skillSameAttributeLeaderRate,
    card.skillBothLeaderRate,
    card.skillMixedLeaderRate,
  );
}

function medleyCardMatchesSkillContext(card: SearchCard, context: MedleySkillContextUpper): boolean {
  if ((context.mode === "same-band" || context.mode === "both") && card.bandId !== context.bandId) {
    return false;
  }
  if ((context.mode === "same-attribute" || context.mode === "both") && card.attribute !== context.attribute) {
    return false;
  }
  return true;
}

function getMedleyPossibleSameBandIds(slot: MedleySlotSearch, selectedCards: SearchCard[]): number[] {
  if (selectedCards.length === 0) {
    return slot.upperBoundIndex.bandIds;
  }

  const bandId = selectedCards[0]?.bandId ?? null;
  if (bandId === null || selectedCards.some((card) => card.bandId !== bandId)) {
    return [];
  }
  return [bandId];
}

function getMedleyPossibleSameAttributes(slot: MedleySlotSearch, selectedCards: SearchCard[]): Array<SearchCard["attribute"]> {
  if (selectedCards.length === 0) {
    return [...new Set(slot.searchCards.map((card) => card.attribute))];
  }

  const attribute = selectedCards[0]?.attribute ?? null;
  if (attribute === null || selectedCards.some((card) => card.attribute !== attribute)) {
    return [];
  }
  return [attribute];
}

function buildMedleySkillContextUppers(
  slot: MedleySlotSearch,
  selectedCards: SearchCard[],
): MedleySkillContextUpper[] {
  const contexts: MedleySkillContextUpper[] = [{ mode: "mixed" }];
  const possibleSameBandIds = getMedleyPossibleSameBandIds(slot, selectedCards);
  const possibleSameAttributes = getMedleyPossibleSameAttributes(slot, selectedCards);

  for (const bandId of possibleSameBandIds) {
    contexts.push({ mode: "same-band", bandId });
  }
  for (const attribute of possibleSameAttributes) {
    contexts.push({ mode: "same-attribute", attribute });
  }
  for (const bandId of possibleSameBandIds) {
    for (const attribute of possibleSameAttributes) {
      contexts.push({ mode: "both", bandId, attribute });
    }
  }

  return contexts;
}

function estimateMedleySlotBranchScoreUpperBoundForContext(
  slot: MedleySlotSearch,
  selectedCards: SearchCard[],
  startIndex: number,
  bannedCardIds: Set<number>,
  usedCharacterMaskLow: number,
  usedCharacterMaskHigh: number,
  selectedPower: number,
  context: MedleySkillContextUpper,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number {
  type UpperState = {
    power: number;
    averageRate: number;
    leaderRate: number;
  };
  const addState = (states: UpperState[], nextState: UpperState): void => {
    for (const state of states) {
      if (
        state.power >= nextState.power
        && state.averageRate >= nextState.averageRate
        && state.leaderRate >= nextState.leaderRate
      ) {
        return;
      }
    }
    for (let index = states.length - 1; index >= 0; index -= 1) {
      const state = states[index];
      if (
        nextState.power >= state.power
        && nextState.averageRate >= state.averageRate
        && nextState.leaderRate >= state.leaderRate
      ) {
        states.splice(index, 1);
      }
    }
    states.push(nextState);
  };

  const remaining = 5 - selectedCards.length;
  if (selectedCards.some((card) => !medleyCardMatchesSkillContext(card, context))) {
    return Number.NEGATIVE_INFINITY;
  }
  const selectedAverageRate = selectedCards.reduce(
    (sum, card) => sum + getMedleyCardSkillAverageRateForContext(card, context.mode),
    0,
  );
  const selectedLeaderRate = selectedCards.reduce(
    (max, card) => Math.max(max, getMedleyCardSkillLeaderRateForContext(card, context.mode)),
    0,
  );
  if (remaining === 0) {
    return Math.floor(selectedPower) * (slot.baseScoreRatePerPower + selectedAverageRate + selectedLeaderRate);
  }

  const cardsByCharacterIndex = new Map<number, SearchCard[]>();
  for (let index = startIndex; index < slot.searchCards.length; index += 1) {
    const card = slot.searchCards[index];
    if (bannedCardIds.has(card.cardId)) {
      continue;
    }
    if (!medleyCardMatchesSkillContext(card, context)) {
      continue;
    }
    const characterIndex = slot.upperBoundIndex.characterIndexById.get(card.characterId);
    if (characterIndex === undefined || hasCharacterIndexInMask(usedCharacterMaskLow, usedCharacterMaskHigh, characterIndex)) {
      continue;
    }
    const cards = cardsByCharacterIndex.get(characterIndex) ?? [];
    cards.push(card);
    cardsByCharacterIndex.set(characterIndex, cards);
  }

  if (cardsByCharacterIndex.size < remaining) {
    return Number.NEGATIVE_INFINITY;
  }

  let statesByCount: UpperState[][] = Array.from({ length: remaining + 1 }, () => []);
  statesByCount[0].push({
    power: selectedPower,
    averageRate: selectedAverageRate,
    leaderRate: selectedLeaderRate,
  });

  for (const cards of cardsByCharacterIndex.values()) {
    const nextStatesByCount = statesByCount.map((states) => [...states]);
    for (let count = 0; count < remaining; count += 1) {
      for (const state of statesByCount[count]) {
        for (const card of cards) {
          addState(nextStatesByCount[count + 1], {
            power: state.power + card.effectivePower,
            averageRate: state.averageRate + getMedleyCardSkillAverageRateForContext(card, context.mode),
            leaderRate: Math.max(state.leaderRate, getMedleyCardSkillLeaderRateForContext(card, context.mode)),
          });
        }
      }
    }
    statesByCount = nextStatesByCount;
  }

  if (profiling) {
    profiling.slotBranchUpperBoundStateCount += statesByCount.reduce((sum, states) => sum + states.length, 0);
  }
  return statesByCount[remaining].reduce((best, state) => Math.max(
    best,
    Math.floor(state.power) * (slot.baseScoreRatePerPower + state.averageRate + state.leaderRate),
  ), Number.NEGATIVE_INFINITY);
}

function estimateMedleySlotBranchScoreUpperBound(
  slot: MedleySlotSearch,
  selectedCards: SearchCard[],
  startIndex: number,
  bannedCardIds: Set<number>,
  usedCharacterMaskLow: number,
  usedCharacterMaskHigh: number,
  selectedPower: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
  useContextualSkillUpper = false,
): number {
  if (profiling) {
    profiling.slotBranchUpperBoundCallCount += 1;
  }

  const contexts = useContextualSkillUpper
    ? buildMedleySkillContextUppers(slot, selectedCards)
    : [{ mode: "optimistic" } satisfies MedleySkillContextUpper];
  return contexts.reduce((best, context) => Math.max(
    best,
    estimateMedleySlotBranchScoreUpperBoundForContext(
      slot,
      selectedCards,
      startIndex,
      bannedCardIds,
      usedCharacterMaskLow,
      usedCharacterMaskHigh,
      selectedPower,
      context,
      profiling,
    ),
  ), Number.NEGATIVE_INFINITY);
}

type MedleyCapacityTransition = {
  nextIndexByMask: Int16Array;
  targetIndex: number;
  stateCount: number;
};

type MedleyCapacityAssignmentScoreUpperBound = {
  upperBound: number;
  coefficientUpperBound: number;
  skillAwareUpperBound: number | null;
  paretoUpperBound: number | null;
  mode: MedleyCapacityUpperMode;
};

type MedleyCapacityCardsByCharacter = Map<number, Map<number, Array<SearchCard | undefined>>>;

type MedleyCardBoundPowerUpperBySlot = Array<Map<number, number>>;

type MedleyCardSpecificCoefficientUpperBySlot = Array<Map<number, number>>;

type MedleyContextBoundUpperGroup = {
  coefficientUpperByCardId: Map<number, number>;
  averageRateUpperByCardId: Map<number, number>;
  leaderRateUpperByCardId: Map<number, number>;
  averageScoreUpperByCardId: Map<number, number>;
  leaderScoreUpperByCardId: Map<number, number>;
};

type MedleyContextBoundMcCormickSlotBounds = {
  powerLowerBound: number;
  powerUpperBound: number;
  averageRateLowerBound: number;
  averageRateUpperBound: number;
  leaderRateLowerBound: number;
  leaderRateUpperBound: number;
  skillRateLowerBound: number;
  skillRateUpperBound: number;
};

type MedleyContextBoundSkillRateBounds = {
  averageLowerBound: number;
  averageUpperBound: number;
  leaderLowerBound: number;
  leaderUpperBound: number;
  skillLowerBound: number;
  skillUpperBound: number;
};

type MedleySlotSkillCoefficientEstimate = {
  coefficient: number;
  legacyCoefficient: number;
  improvement: number;
};

type MedleyCapacityWeightedUpperEstimate = {
  upperBound: number;
  weight: number;
};

type MedleyCapacityBucketedJointUpperEstimate = {
  upperBound: number;
  bucketSize: number;
  targetBucketCount: number;
};

type MedleyCapacityCardMinCoefficientUpperEstimate = {
  upperBound: number;
  bucketSize: number;
  targetBucketCount: number;
};

type MedleyCapacityDualObjectiveState = {
  coefficientScore: number;
  skillAwareScore: number;
};

type MedleyCapacityCardMinCoefficientState = {
  bucket0: number;
  power0: number;
  bucket1: number;
  power1: number;
  bucket2: number;
  power2: number;
};

type MedleyCapacityAssignmentWitnessSlot = {
  slotIndex: number;
  cards: SearchCard[];
  upperContribution: number;
};

type MedleyCapacityAssignmentWitness = {
  upperBound: number;
  slots: MedleyCapacityAssignmentWitnessSlot[];
};

type MedleyCapacityBucketedState = {
  bucket0: number;
  power0: number;
  averageRate0: number;
  leaderRate0: number;
  bucket1: number;
  power1: number;
  averageRate1: number;
  leaderRate1: number;
  bucket2: number;
  power2: number;
  averageRate2: number;
  leaderRate2: number;
};

type MedleyCapacityParetoState = {
  power0: number;
  averageRate0: number;
  leaderRate0: number;
  power1: number;
  averageRate1: number;
  leaderRate1: number;
  power2: number;
  averageRate2: number;
  leaderRate2: number;
};

const medleyCapacityTransitionCache = new Map<number, MedleyCapacityTransition>();

function getMedleyCapacityTransition(slotCount: number): MedleyCapacityTransition {
  const cached = medleyCapacityTransitionCache.get(slotCount);
  if (cached) {
    return cached;
  }

  const stateCount = (MEDLEY_TEAM_SIZE + 1) ** slotCount;
  const maskCount = 1 << slotCount;
  const nextIndexByMask = new Int16Array(stateCount * maskCount);
  nextIndexByMask.fill(-1);

  for (let stateIndex = 0; stateIndex < stateCount; stateIndex += 1) {
    const counts: number[] = [];
    let value = stateIndex;
    for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
      counts.push(value % (MEDLEY_TEAM_SIZE + 1));
      value = Math.floor(value / (MEDLEY_TEAM_SIZE + 1));
    }

    for (let mask = 0; mask < maskCount; mask += 1) {
      let nextIndex = 0;
      let multiplier = 1;
      let isValid = true;
      for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
        const nextCount = counts[slotPosition] + ((mask & (1 << slotPosition)) === 0 ? 0 : 1);
        if (nextCount > MEDLEY_TEAM_SIZE) {
          isValid = false;
          break;
        }
        nextIndex += nextCount * multiplier;
        multiplier *= MEDLEY_TEAM_SIZE + 1;
      }
      if (isValid) {
        nextIndexByMask[stateIndex * maskCount + mask] = nextIndex;
      }
    }
  }

  let targetIndex = 0;
  let multiplier = 1;
  for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
    targetIndex += MEDLEY_TEAM_SIZE * multiplier;
    multiplier *= MEDLEY_TEAM_SIZE + 1;
  }

  const transition = {
    nextIndexByMask,
    targetIndex,
    stateCount,
  };
  medleyCapacityTransitionCache.set(slotCount, transition);
  return transition;
}

function createEmptyMedleyCapacityParetoState(): MedleyCapacityParetoState {
  return {
    power0: 0,
    averageRate0: 0,
    leaderRate0: 0,
    power1: 0,
    averageRate1: 0,
    leaderRate1: 0,
    power2: 0,
    averageRate2: 0,
    leaderRate2: 0,
  };
}

function medleyCapacityParetoStateDominates(
  left: MedleyCapacityParetoState,
  right: MedleyCapacityParetoState,
  slotCount: number,
): boolean {
  if (
    left.power0 + 0.000001 < right.power0
    || left.averageRate0 + 0.000001 < right.averageRate0
    || left.leaderRate0 + 0.000001 < right.leaderRate0
  ) {
    return false;
  }
  if (
    slotCount >= 2
    && (
      left.power1 + 0.000001 < right.power1
      || left.averageRate1 + 0.000001 < right.averageRate1
      || left.leaderRate1 + 0.000001 < right.leaderRate1
    )
  ) {
    return false;
  }
  if (
    slotCount >= 3
    && (
      left.power2 + 0.000001 < right.power2
      || left.averageRate2 + 0.000001 < right.averageRate2
      || left.leaderRate2 + 0.000001 < right.leaderRate2
    )
  ) {
    return false;
  }
  return true;
}

function addMedleyCapacityParetoState(
  states: MedleyCapacityParetoState[],
  nextState: MedleyCapacityParetoState,
  slotCount: number,
): boolean {
  for (const state of states) {
    if (medleyCapacityParetoStateDominates(state, nextState, slotCount)) {
      return false;
    }
  }

  for (let index = states.length - 1; index >= 0; index -= 1) {
    if (medleyCapacityParetoStateDominates(nextState, states[index], slotCount)) {
      states.splice(index, 1);
    }
  }
  states.push(nextState);
  return true;
}

function addCardToMedleyCapacityParetoState(
  state: MedleyCapacityParetoState,
  card: SearchCard,
  slotPosition: number,
): MedleyCapacityParetoState {
  const averageRate = getMedleyCardSkillAverageRateUpper(card);
  const leaderRate = getMedleyCardSkillLeaderRateUpper(card);
  if (slotPosition === 0) {
    return {
      ...state,
      power0: state.power0 + card.effectivePower,
      averageRate0: state.averageRate0 + averageRate,
      leaderRate0: Math.max(state.leaderRate0, leaderRate),
    };
  }
  if (slotPosition === 1) {
    return {
      ...state,
      power1: state.power1 + card.effectivePower,
      averageRate1: state.averageRate1 + averageRate,
      leaderRate1: Math.max(state.leaderRate1, leaderRate),
    };
  }
  return {
    ...state,
    power2: state.power2 + card.effectivePower,
    averageRate2: state.averageRate2 + averageRate,
    leaderRate2: Math.max(state.leaderRate2, leaderRate),
  };
}

function combineMedleyCapacityParetoStates(
  left: MedleyCapacityParetoState,
  right: MedleyCapacityParetoState,
): MedleyCapacityParetoState {
  return {
    power0: left.power0 + right.power0,
    averageRate0: left.averageRate0 + right.averageRate0,
    leaderRate0: Math.max(left.leaderRate0, right.leaderRate0),
    power1: left.power1 + right.power1,
    averageRate1: left.averageRate1 + right.averageRate1,
    leaderRate1: Math.max(left.leaderRate1, right.leaderRate1),
    power2: left.power2 + right.power2,
    averageRate2: left.averageRate2 + right.averageRate2,
    leaderRate2: Math.max(left.leaderRate2, right.leaderRate2),
  };
}

function scoreMedleyCapacityParetoState(
  state: MedleyCapacityParetoState,
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
): number {
  let score = Math.floor(state.power0) * (
    slots[remainingSlotIndices[0]].baseScoreRatePerPower
    + state.averageRate0
    + state.leaderRate0
  );
  if (remainingSlotIndices.length >= 2) {
    score += Math.floor(state.power1) * (
      slots[remainingSlotIndices[1]].baseScoreRatePerPower
      + state.averageRate1
      + state.leaderRate1
    );
  }
  if (remainingSlotIndices.length >= 3) {
    score += Math.floor(state.power2) * (
      slots[remainingSlotIndices[2]].baseScoreRatePerPower
      + state.averageRate2
      + state.leaderRate2
    );
  }
  return score;
}

function getMedleyCapacityBucketIndex(power: number, bucketSize: number): number {
  return Math.max(0, Math.ceil(Math.max(0, power) / bucketSize));
}

function getMedleyCapacityBucketSize(slotPowerUpperBounds: number[]): number {
  const maxPower = Math.max(...slotPowerUpperBounds.filter(Number.isFinite), 0);
  const rawBucketSize = maxPower / MEDLEY_CAPACITY_BUCKETED_TARGET_BUCKET_COUNT;
  return Math.max(
    MEDLEY_CAPACITY_BUCKETED_MIN_BUCKET_SIZE,
    Math.ceil(rawBucketSize / MEDLEY_CAPACITY_BUCKETED_BUCKET_SIZE_STEP)
      * MEDLEY_CAPACITY_BUCKETED_BUCKET_SIZE_STEP,
  );
}

function createEmptyMedleyCapacityBucketedState(): MedleyCapacityBucketedState {
  return {
    bucket0: 0,
    power0: 0,
    averageRate0: 0,
    leaderRate0: 0,
    bucket1: 0,
    power1: 0,
    averageRate1: 0,
    leaderRate1: 0,
    bucket2: 0,
    power2: 0,
    averageRate2: 0,
    leaderRate2: 0,
  };
}

function getMedleyCapacityBucketedKey(
  state: MedleyCapacityBucketedState,
  bucketBase: number,
  slotCount: number,
): number {
  return state.bucket0
    + (slotCount >= 2 ? state.bucket1 * bucketBase : 0)
    + (slotCount >= 3 ? state.bucket2 * bucketBase * bucketBase : 0);
}

function cloneMedleyCapacityBucketedState(
  state: MedleyCapacityBucketedState,
): MedleyCapacityBucketedState {
  return { ...state };
}

function cloneMedleyCapacityBucketedStateMap(
  states: Map<number, MedleyCapacityBucketedState>,
): Map<number, MedleyCapacityBucketedState> {
  const nextStates = new Map<number, MedleyCapacityBucketedState>();
  for (const [key, state] of states.entries()) {
    nextStates.set(key, cloneMedleyCapacityBucketedState(state));
  }
  return nextStates;
}

function addMedleyCapacityBucketedState(
  states: Map<number, MedleyCapacityBucketedState>,
  nextState: MedleyCapacityBucketedState,
  slotCount: number,
  bucketBase: number,
): void {
  const key = getMedleyCapacityBucketedKey(nextState, bucketBase, slotCount);
  const state = states.get(key);
  if (!state) {
    states.set(key, nextState);
    return;
  }

  state.power0 = Math.max(state.power0, nextState.power0);
  state.averageRate0 = Math.max(state.averageRate0, nextState.averageRate0);
  state.leaderRate0 = Math.max(state.leaderRate0, nextState.leaderRate0);
  if (slotCount >= 2) {
    state.power1 = Math.max(state.power1, nextState.power1);
    state.averageRate1 = Math.max(state.averageRate1, nextState.averageRate1);
    state.leaderRate1 = Math.max(state.leaderRate1, nextState.leaderRate1);
  }
  if (slotCount >= 3) {
    state.power2 = Math.max(state.power2, nextState.power2);
    state.averageRate2 = Math.max(state.averageRate2, nextState.averageRate2);
    state.leaderRate2 = Math.max(state.leaderRate2, nextState.leaderRate2);
  }
}

function addCardToMedleyCapacityBucketedState(
  state: MedleyCapacityBucketedState,
  card: SearchCard,
  slotPosition: number,
  bucketSize: number,
): MedleyCapacityBucketedState {
  const averageRate = getMedleyCardSkillAverageRateUpper(card);
  const leaderRate = getMedleyCardSkillLeaderRateUpper(card);
  if (slotPosition === 0) {
    const power = state.power0 + card.effectivePower;
    return {
      ...state,
      bucket0: getMedleyCapacityBucketIndex(power, bucketSize),
      power0: power,
      averageRate0: state.averageRate0 + averageRate,
      leaderRate0: Math.max(state.leaderRate0, leaderRate),
    };
  }
  if (slotPosition === 1) {
    const power = state.power1 + card.effectivePower;
    return {
      ...state,
      bucket1: getMedleyCapacityBucketIndex(power, bucketSize),
      power1: power,
      averageRate1: state.averageRate1 + averageRate,
      leaderRate1: Math.max(state.leaderRate1, leaderRate),
    };
  }
  const power = state.power2 + card.effectivePower;
  return {
    ...state,
    bucket2: getMedleyCapacityBucketIndex(power, bucketSize),
    power2: power,
    averageRate2: state.averageRate2 + averageRate,
    leaderRate2: Math.max(state.leaderRate2, leaderRate),
  };
}

function combineMedleyCapacityBucketedStates(
  left: MedleyCapacityBucketedState,
  right: MedleyCapacityBucketedState,
  bucketSize: number,
): MedleyCapacityBucketedState {
  const power0 = left.power0 + right.power0;
  const power1 = left.power1 + right.power1;
  const power2 = left.power2 + right.power2;
  return {
    bucket0: getMedleyCapacityBucketIndex(power0, bucketSize),
    power0,
    averageRate0: left.averageRate0 + right.averageRate0,
    leaderRate0: Math.max(left.leaderRate0, right.leaderRate0),
    bucket1: getMedleyCapacityBucketIndex(power1, bucketSize),
    power1,
    averageRate1: left.averageRate1 + right.averageRate1,
    leaderRate1: Math.max(left.leaderRate1, right.leaderRate1),
    bucket2: getMedleyCapacityBucketIndex(power2, bucketSize),
    power2,
    averageRate2: left.averageRate2 + right.averageRate2,
    leaderRate2: Math.max(left.leaderRate2, right.leaderRate2),
  };
}

function scoreMedleyCapacityBucketedState(
  state: MedleyCapacityBucketedState,
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
): number {
  let score = Math.floor(state.power0) * (
    slots[remainingSlotIndices[0]].baseScoreRatePerPower
    + state.averageRate0
    + state.leaderRate0
  );
  if (remainingSlotIndices.length >= 2) {
    score += Math.floor(state.power1) * (
      slots[remainingSlotIndices[1]].baseScoreRatePerPower
      + state.averageRate1
      + state.leaderRate1
    );
  }
  if (remainingSlotIndices.length >= 3) {
    score += Math.floor(state.power2) * (
      slots[remainingSlotIndices[2]].baseScoreRatePerPower
      + state.averageRate2
      + state.leaderRate2
    );
  }
  return score;
}

function estimateMedleyCapacityBucketedScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  slotPowerUpperBounds: number[],
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  const slotCount = remainingSlotIndices.length;
  if (slotCount < 2 || slotCount > MEDLEY_TEAM_COUNT || slotPowerUpperBounds.some((power) => !Number.isFinite(power))) {
    return null;
  }
  if (profiling) {
    profiling.capacityBucketedUpperCallCount += 1;
    if (profiling.capacityBucketedUpperStateCount >= MEDLEY_CAPACITY_BUCKETED_GLOBAL_STATE_BUDGET) {
      profiling.capacityBucketedUpperAbortCount += 1;
      return null;
    }
  }

  const bucketSize = getMedleyCapacityBucketSize(slotPowerUpperBounds);
  const maxBucket = Math.max(
    ...slotPowerUpperBounds.map((power) => getMedleyCapacityBucketIndex(power, bucketSize)),
    0,
  );
  const bucketBase = maxBucket + MEDLEY_TEAM_SIZE + 2;
  const maskCount = 1 << slotCount;
  const transition = getMedleyCapacityTransition(slotCount);
  const emptyState = createEmptyMedleyCapacityBucketedState();
  let processedStateCount = 0;

  const abort = (): null => {
    if (profiling) {
      profiling.capacityBucketedUpperAbortCount += 1;
      profiling.capacityBucketedUpperStateCount += processedStateCount;
      profiling.capacityBucketedUpperMaxProcessedStateCount = Math.max(
        profiling.capacityBucketedUpperMaxProcessedStateCount,
        processedStateCount,
      );
      profiling.capacityBucketedUpperBucketSize = bucketSize;
    }
    return null;
  };
  const accountState = (): boolean => {
    processedStateCount += 1;
    const totalStateCount = processedStateCount + (profiling?.capacityBucketedUpperStateCount ?? 0);
    return (
      processedStateCount <= MEDLEY_CAPACITY_BUCKETED_STATE_BUDGET
      && totalStateCount <= MEDLEY_CAPACITY_BUCKETED_GLOBAL_STATE_BUDGET
    );
  };

  let statesByIndex: Array<Map<number, MedleyCapacityBucketedState>> = Array.from(
    { length: transition.stateCount },
    () => new Map<number, MedleyCapacityBucketedState>(),
  );
  addMedleyCapacityBucketedState(statesByIndex[0], emptyState, slotCount, bucketBase);

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptionsByMask: Array<Map<number, MedleyCapacityBucketedState>> = Array.from(
      { length: maskCount },
      () => new Map<number, MedleyCapacityBucketedState>(),
    );
    addMedleyCapacityBucketedState(
      characterOptionsByMask[0],
      createEmptyMedleyCapacityBucketedState(),
      slotCount,
      bucketBase,
    );

    for (const slotCards of cardsById.values()) {
      const nextOptionsByMask = characterOptionsByMask.map(cloneMedleyCapacityBucketedStateMap);
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (const state of characterOptionsByMask[mask].values()) {
          for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
            const card = slotCards[slotPosition];
            if (!card || (mask & (1 << slotPosition)) !== 0) {
              continue;
            }
            if (!accountState()) {
              return abort();
            }
            addMedleyCapacityBucketedState(
              nextOptionsByMask[mask | (1 << slotPosition)],
              addCardToMedleyCapacityBucketedState(state, card, slotPosition, bucketSize),
              slotCount,
              bucketBase,
            );
          }
        }
      }
      characterOptionsByMask = nextOptionsByMask;
    }

    const nextStatesByIndex = statesByIndex.map(cloneMedleyCapacityBucketedStateMap);
    for (let stateIndex = 0; stateIndex < statesByIndex.length; stateIndex += 1) {
      const states = statesByIndex[stateIndex];
      if (states.size === 0) {
        continue;
      }
      for (let mask = 1; mask < maskCount; mask += 1) {
        const options = characterOptionsByMask[mask];
        if (options.size === 0) {
          continue;
        }
        const nextIndex = transition.nextIndexByMask[stateIndex * maskCount + mask];
        if (nextIndex < 0) {
          continue;
        }
        const nextStates = nextStatesByIndex[nextIndex];
        for (const state of states.values()) {
          for (const option of options.values()) {
            if (!accountState()) {
              return abort();
            }
            addMedleyCapacityBucketedState(
              nextStates,
              combineMedleyCapacityBucketedStates(state, option, bucketSize),
              slotCount,
              bucketBase,
            );
          }
        }
      }
    }
    statesByIndex = nextStatesByIndex;
  }

  if (profiling) {
    profiling.capacityBucketedUpperCompletedCount += 1;
    profiling.capacityBucketedUpperStateCount += processedStateCount;
    profiling.capacityBucketedUpperMaxProcessedStateCount = Math.max(
      profiling.capacityBucketedUpperMaxProcessedStateCount,
      processedStateCount,
    );
    profiling.capacityBucketedUpperBucketSize = bucketSize;
  }
  return [...statesByIndex[transition.targetIndex].values()].reduce(
    (best, state) => Math.max(best, scoreMedleyCapacityBucketedState(state, slots, remainingSlotIndices)),
    Number.NEGATIVE_INFINITY,
  );
}

function medleyCapacityDualObjectiveStateDominates(
  left: MedleyCapacityDualObjectiveState,
  right: MedleyCapacityDualObjectiveState,
): boolean {
  return (
    left.coefficientScore + 0.000001 >= right.coefficientScore
    && left.skillAwareScore + 0.000001 >= right.skillAwareScore
  );
}

function addMedleyCapacityDualObjectiveState(
  states: MedleyCapacityDualObjectiveState[],
  nextState: MedleyCapacityDualObjectiveState,
): boolean {
  for (const state of states) {
    if (medleyCapacityDualObjectiveStateDominates(state, nextState)) {
      return false;
    }
  }

  for (let index = states.length - 1; index >= 0; index -= 1) {
    if (medleyCapacityDualObjectiveStateDominates(nextState, states[index])) {
      states.splice(index, 1);
    }
  }
  states.push(nextState);
  return true;
}

function getMedleyCapacityBucketedJointBucket(score: number, bucketSize: number): number {
  return Math.max(0, Math.ceil(Math.max(0, score) / bucketSize));
}

function getMedleyCapacityBucketedJointStateBudget(targetBucketCount: number): number {
  if (targetBucketCount >= 1024) {
    return 75_000;
  }
  if (targetBucketCount >= 512) {
    return 150_000;
  }
  if (targetBucketCount >= 256) {
    return 300_000;
  }
  if (targetBucketCount >= 128) {
    return 600_000;
  }
  return MEDLEY_CARD_BOUND_BUCKETED_JOINT_STATE_BUDGET;
}

function cloneMedleyCapacityBucketedJointStateMap(states: Map<number, number>): Map<number, number> {
  return new Map(states);
}

function addMedleyCapacityBucketedJointState(
  states: Map<number, number>,
  coefficientBucket: number,
  cardBoundScore: number,
): void {
  const currentScore = states.get(coefficientBucket);
  if (currentScore === undefined || cardBoundScore > currentScore) {
    states.set(coefficientBucket, cardBoundScore);
  }
}

function pruneMedleyCapacityBucketedJointStateMap(states: Map<number, number>): Map<number, number> {
  if (states.size <= 1) {
    return states;
  }

  const entries = [...states.entries()]
    .sort((left, right) => right[0] - left[0] || right[1] - left[1]);
  const pruned = new Map<number, number>();
  let bestCardBoundScore = Number.NEGATIVE_INFINITY;
  for (const [bucket, cardBoundScore] of entries) {
    if (cardBoundScore > bestCardBoundScore + 0.000001) {
      pruned.set(bucket, cardBoundScore);
      bestCardBoundScore = cardBoundScore;
    }
  }
  return pruned;
}

function pruneMedleyCapacityBucketedJointStateMaps(statesByIndex: Array<Map<number, number>>): void {
  for (let index = 0; index < statesByIndex.length; index += 1) {
    statesByIndex[index] = pruneMedleyCapacityBucketedJointStateMap(statesByIndex[index]);
  }
}

function estimateMedleyCapacityDualObjectiveScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  slotCoefficients: number[],
  slotPowerUpperBounds: number[],
  slotLeaderConstantSum: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  const slotCount = remainingSlotIndices.length;
  if (slotCount < 2 || slotCount > MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityParetoUpperCallCount += 1;
    if (profiling.capacityParetoUpperStateCount >= MEDLEY_CAPACITY_PARETO_GLOBAL_STATE_BUDGET) {
      profiling.capacityParetoUpperAbortCount += 1;
      return null;
    }
  }

  const maskCount = 1 << slotCount;
  const transition = getMedleyCapacityTransition(slotCount);
  const emptyState = {
    coefficientScore: 0,
    skillAwareScore: 0,
  };
  let processedStateCount = 0;
  const abort = (): null => {
    if (profiling) {
      profiling.capacityParetoUpperAbortCount += 1;
      profiling.capacityParetoUpperStateCount += processedStateCount;
      profiling.capacityParetoUpperMaxProcessedStateCount = Math.max(
        profiling.capacityParetoUpperMaxProcessedStateCount,
        processedStateCount,
      );
    }
    return null;
  };
  const accountState = (): boolean => {
    processedStateCount += 1;
    const totalStateCount = processedStateCount + (profiling?.capacityParetoUpperStateCount ?? 0);
    return (
      processedStateCount <= MEDLEY_CAPACITY_DUAL_OBJECTIVE_STATE_BUDGET
      && totalStateCount <= MEDLEY_CAPACITY_PARETO_GLOBAL_STATE_BUDGET
    );
  };

  let statesByIndex: MedleyCapacityDualObjectiveState[][] = Array.from(
    { length: transition.stateCount },
    () => [],
  );
  statesByIndex[0].push(emptyState);

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptionsByMask: MedleyCapacityDualObjectiveState[][] = Array.from({ length: maskCount }, () => []);
    characterOptionsByMask[0].push(emptyState);

    for (const slotCards of cardsById.values()) {
      const nextOptionsByMask = characterOptionsByMask.map((states) => [...states]);
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (const state of characterOptionsByMask[mask]) {
          for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
            const card = slotCards[slotPosition];
            if (!card || (mask & (1 << slotPosition)) !== 0) {
              continue;
            }
            if (!accountState()) {
              return abort();
            }
            addMedleyCapacityDualObjectiveState(
              nextOptionsByMask[mask | (1 << slotPosition)],
              {
                coefficientScore: state.coefficientScore + card.effectivePower * slotCoefficients[slotPosition],
                skillAwareScore: state.skillAwareScore
                  + card.effectivePower * slots[remainingSlotIndices[slotPosition]].baseScoreRatePerPower
                  + slotPowerUpperBounds[slotPosition] * getMedleyCardSkillAverageRateUpper(card),
              },
            );
          }
        }
      }
      characterOptionsByMask = nextOptionsByMask;
    }

    const nextStatesByIndex = statesByIndex.map((states) => [...states]);
    for (let stateIndex = 0; stateIndex < statesByIndex.length; stateIndex += 1) {
      const states = statesByIndex[stateIndex];
      if (states.length === 0) {
        continue;
      }
      for (let mask = 1; mask < maskCount; mask += 1) {
        const options = characterOptionsByMask[mask];
        if (options.length === 0) {
          continue;
        }
        const nextIndex = transition.nextIndexByMask[stateIndex * maskCount + mask];
        if (nextIndex < 0) {
          continue;
        }
        const nextStates = nextStatesByIndex[nextIndex];
        for (const state of states) {
          for (const option of options) {
            if (!accountState()) {
              return abort();
            }
            addMedleyCapacityDualObjectiveState(
              nextStates,
              {
                coefficientScore: state.coefficientScore + option.coefficientScore,
                skillAwareScore: state.skillAwareScore + option.skillAwareScore,
              },
            );
          }
        }
      }
    }
    statesByIndex = nextStatesByIndex;
  }

  if (profiling) {
    profiling.capacityParetoUpperCompletedCount += 1;
    profiling.capacityParetoUpperStateCount += processedStateCount;
    profiling.capacityParetoUpperMaxProcessedStateCount = Math.max(
      profiling.capacityParetoUpperMaxProcessedStateCount,
      processedStateCount,
    );
  }
  return statesByIndex[transition.targetIndex].reduce(
    (best, state) => Math.max(
      best,
      Math.min(state.coefficientScore, state.skillAwareScore + slotLeaderConstantSum),
    ),
    Number.NEGATIVE_INFINITY,
  );
}

function estimateMedleyCapacityParetoScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  const slotCount = remainingSlotIndices.length;
  if (slotCount < 2 || slotCount > MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityParetoUpperCallCount += 1;
    if (profiling.capacityParetoUpperStateCount >= MEDLEY_CAPACITY_PARETO_GLOBAL_STATE_BUDGET) {
      profiling.capacityParetoUpperAbortCount += 1;
      return null;
    }
  }

  const maskCount = 1 << slotCount;
  const transition = getMedleyCapacityTransition(slotCount);
  const emptyState = createEmptyMedleyCapacityParetoState();
  const perCallStateBudget = slotCount >= MEDLEY_TEAM_COUNT
    ? MEDLEY_CAPACITY_PARETO_THREE_SLOT_STATE_BUDGET
    : MEDLEY_CAPACITY_PARETO_TWO_SLOT_STATE_BUDGET;
  const cardRecordBudget = slotCount >= MEDLEY_TEAM_COUNT
    ? MEDLEY_CAPACITY_PARETO_THREE_SLOT_CARD_RECORD_BUDGET
    : MEDLEY_CAPACITY_PARETO_TWO_SLOT_CARD_RECORD_BUDGET;
  const cardsByCharacter: MedleyCapacityCardsByCharacter = new Map();
  let cardRecordCount = 0;
  for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
    const slotIndex = remainingSlotIndices[slotPosition];
    for (const card of slots[slotIndex].searchCards) {
      if (bannedCardIds.has(card.cardId)) {
        continue;
      }
      cardRecordCount += 1;
      if (cardRecordCount > cardRecordBudget) {
        if (profiling) {
          profiling.capacityParetoUpperAbortCount += 1;
        }
        return null;
      }
      const cardsById = cardsByCharacter.get(card.characterId) ?? new Map<number, Array<SearchCard | undefined>>();
      const slotCards = cardsById.get(card.cardId) ?? new Array<SearchCard | undefined>(slotCount);
      slotCards[slotPosition] = card;
      cardsById.set(card.cardId, slotCards);
      cardsByCharacter.set(card.characterId, cardsById);
    }
  }

  let processedStateCount = 0;
  const abort = (): null => {
    if (profiling) {
      profiling.capacityParetoUpperAbortCount += 1;
      profiling.capacityParetoUpperStateCount += processedStateCount;
      profiling.capacityParetoUpperMaxProcessedStateCount = Math.max(
        profiling.capacityParetoUpperMaxProcessedStateCount,
        processedStateCount,
      );
    }
    return null;
  };
  const accountState = (): boolean => {
    processedStateCount += 1;
    const totalStateCount = processedStateCount + (profiling?.capacityParetoUpperStateCount ?? 0);
    return (
      processedStateCount <= perCallStateBudget
      && totalStateCount <= MEDLEY_CAPACITY_PARETO_GLOBAL_STATE_BUDGET
    );
  };

  let statesByIndex: MedleyCapacityParetoState[][] = Array.from(
    { length: transition.stateCount },
    () => [],
  );
  statesByIndex[0].push(emptyState);

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptionsByMask: MedleyCapacityParetoState[][] = Array.from({ length: maskCount }, () => []);
    characterOptionsByMask[0].push(emptyState);

    for (const slotCards of cardsById.values()) {
      const nextOptionsByMask = characterOptionsByMask.map((states) => [...states]);
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (const state of characterOptionsByMask[mask]) {
          for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
            const card = slotCards[slotPosition];
            if (!card || (mask & (1 << slotPosition)) !== 0) {
              continue;
            }
            if (!accountState()) {
              return abort();
            }
            addMedleyCapacityParetoState(
              nextOptionsByMask[mask | (1 << slotPosition)],
              addCardToMedleyCapacityParetoState(state, card, slotPosition),
              slotCount,
            );
          }
        }
      }
      characterOptionsByMask = nextOptionsByMask;
    }

    const nextStatesByIndex = statesByIndex.map((states) => [...states]);
    for (let stateIndex = 0; stateIndex < statesByIndex.length; stateIndex += 1) {
      const states = statesByIndex[stateIndex];
      if (states.length === 0) {
        continue;
      }
      for (let mask = 1; mask < maskCount; mask += 1) {
        const options = characterOptionsByMask[mask];
        if (options.length === 0) {
          continue;
        }
        const nextIndex = transition.nextIndexByMask[stateIndex * maskCount + mask];
        if (nextIndex < 0) {
          continue;
        }
        const nextStates = nextStatesByIndex[nextIndex];
        for (const state of states) {
          for (const option of options) {
            if (!accountState()) {
              return abort();
            }
            addMedleyCapacityParetoState(
              nextStates,
              combineMedleyCapacityParetoStates(state, option),
              slotCount,
            );
          }
        }
      }
    }
    statesByIndex = nextStatesByIndex;
  }

  if (profiling) {
    profiling.capacityParetoUpperCompletedCount += 1;
    profiling.capacityParetoUpperStateCount += processedStateCount;
    profiling.capacityParetoUpperMaxProcessedStateCount = Math.max(
      profiling.capacityParetoUpperMaxProcessedStateCount,
      processedStateCount,
    );
  }
  return statesByIndex[transition.targetIndex].reduce(
    (best, state) => Math.max(best, scoreMedleyCapacityParetoState(state, slots, remainingSlotIndices)),
    Number.NEGATIVE_INFINITY,
  );
}

function buildMedleyCardBoundPowerUpperBySlot(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
): MedleyCardBoundPowerUpperBySlot {
  return remainingSlotIndices.map((slotIndex) => {
    const slot = slots[slotIndex];
    const bestPowerByCharacter = new Map<number, number>();
    for (const card of slot.searchCards) {
      if (bannedCardIds.has(card.cardId)) {
        continue;
      }
      bestPowerByCharacter.set(
        card.characterId,
        Math.max(bestPowerByCharacter.get(card.characterId) ?? Number.NEGATIVE_INFINITY, card.effectivePower),
      );
    }

    const sortedCharacterPowers = [...bestPowerByCharacter.entries()]
      .sort((left, right) => right[1] - left[1]);
    const powerUpperByCardId = new Map<number, number>();
    for (const card of slot.searchCards) {
      if (bannedCardIds.has(card.cardId)) {
        continue;
      }
      let otherPower = 0;
      let otherCharacterCount = 0;
      for (const [characterId, power] of sortedCharacterPowers) {
        if (characterId === card.characterId) {
          continue;
        }
        otherPower += power;
        otherCharacterCount += 1;
        if (otherCharacterCount === MEDLEY_TEAM_SIZE - 1) {
          break;
        }
      }
      if (otherCharacterCount === MEDLEY_TEAM_SIZE - 1) {
        powerUpperByCardId.set(card.cardId, card.effectivePower + otherPower);
      }
    }
    return powerUpperByCardId;
  });
}

function estimateMedleyCapacityCardBoundSkillAwareScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  cardBoundPowerUpperBySlot: MedleyCardBoundPowerUpperBySlot,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  const slotCount = remainingSlotIndices.length;
  if (profiling) {
    profiling.capacityCardBoundUpperCallCount += 1;
  }
  if (slotCount < 2 || slotCount > MEDLEY_TEAM_COUNT) {
    if (profiling) {
      profiling.capacityCardBoundUpperSkippedCount += 1;
    }
    return null;
  }

  const maskCount = 1 << slotCount;
  const leaderMaskCount = 1 << slotCount;
  const targetLeaderMask = leaderMaskCount - 1;
  const transition = getMedleyCapacityTransition(slotCount);
  let states = new Float64Array(transition.stateCount * leaderMaskCount);
  states.fill(Number.NEGATIVE_INFINITY);
  states[0] = 0;

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptions = new Float64Array(maskCount * leaderMaskCount);
    characterOptions.fill(Number.NEGATIVE_INFINITY);
    characterOptions[0] = 0;

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptions = characterOptions.slice();
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
          const currentValue = characterOptions[mask * leaderMaskCount + leaderMask];
          if (!Number.isFinite(currentValue)) {
            continue;
          }
          for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
            if ((mask & (1 << slotPosition)) !== 0) {
              continue;
            }
            const card = slotCards[slotPosition];
            if (!card) {
              continue;
            }
            const cardBoundPowerUpper = cardBoundPowerUpperBySlot[slotPosition].get(card.cardId);
            if (cardBoundPowerUpper === undefined || !Number.isFinite(cardBoundPowerUpper)) {
              continue;
            }

            const nextMask = mask | (1 << slotPosition);
            const averageContribution = card.effectivePower
              * slots[remainingSlotIndices[slotPosition]].baseScoreRatePerPower
              + cardBoundPowerUpper * getMedleyCardSkillAverageRateUpper(card);
            const nextIndex = nextMask * leaderMaskCount + leaderMask;
            nextCharacterOptions[nextIndex] = Math.max(
              nextCharacterOptions[nextIndex],
              currentValue + averageContribution,
            );

            const leaderBit = 1 << slotPosition;
            if ((leaderMask & leaderBit) === 0) {
              const nextLeaderMask = leaderMask | leaderBit;
              const leaderIndex = nextMask * leaderMaskCount + nextLeaderMask;
              nextCharacterOptions[leaderIndex] = Math.max(
                nextCharacterOptions[leaderIndex],
                currentValue
                  + averageContribution
                  + cardBoundPowerUpper * getMedleyCardSkillLeaderRateUpper(card),
              );
            }
          }
        }
      }
      characterOptions = nextCharacterOptions;
    }

    const nextStates = states.slice();
    for (let stateIndex = 0; stateIndex < transition.stateCount; stateIndex += 1) {
      for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
        const currentValue = states[stateIndex * leaderMaskCount + leaderMask];
        if (!Number.isFinite(currentValue)) {
          continue;
        }
        for (let characterMask = 1; characterMask < maskCount; characterMask += 1) {
          const nextStateIndex = transition.nextIndexByMask[stateIndex * maskCount + characterMask];
          if (nextStateIndex < 0) {
            continue;
          }
          for (let characterLeaderMask = 0; characterLeaderMask < leaderMaskCount; characterLeaderMask += 1) {
            if (
              (characterLeaderMask & ~characterMask) !== 0
              || (leaderMask & characterLeaderMask) !== 0
            ) {
              continue;
            }
            const characterValue = characterOptions[characterMask * leaderMaskCount + characterLeaderMask];
            if (!Number.isFinite(characterValue)) {
              continue;
            }
            const nextLeaderMask = leaderMask | characterLeaderMask;
            const nextIndex = nextStateIndex * leaderMaskCount + nextLeaderMask;
            nextStates[nextIndex] = Math.max(nextStates[nextIndex], currentValue + characterValue);
          }
        }
      }
    }
    states = nextStates;
  }

  if (profiling) {
    profiling.capacityCardBoundUpperCompletedCount += 1;
  }
  return states[transition.targetIndex * leaderMaskCount + targetLeaderMask];
}

function estimateMedleyCapacityCardBoundWeightedScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  slotCoefficients: number[],
  cardBoundPowerUpperBySlot: MedleyCardBoundPowerUpperBySlot,
  coefficientWeight: number,
  cardSpecificCoefficientUpperBySlot?: MedleyCardSpecificCoefficientUpperBySlot,
): number {
  const slotCount = remainingSlotIndices.length;
  const cardBoundWeight = 1 - coefficientWeight;
  const maskCount = 1 << slotCount;
  const leaderMaskCount = 1 << slotCount;
  const targetLeaderMask = leaderMaskCount - 1;
  const transition = getMedleyCapacityTransition(slotCount);
  let states = new Float64Array(transition.stateCount * leaderMaskCount);
  states.fill(Number.NEGATIVE_INFINITY);
  states[0] = 0;

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptions = new Float64Array(maskCount * leaderMaskCount);
    characterOptions.fill(Number.NEGATIVE_INFINITY);
    characterOptions[0] = 0;

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptions = characterOptions.slice();
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
          const currentValue = characterOptions[mask * leaderMaskCount + leaderMask];
          if (!Number.isFinite(currentValue)) {
            continue;
          }
          for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
            if ((mask & (1 << slotPosition)) !== 0) {
              continue;
            }
            const card = slotCards[slotPosition];
            if (!card) {
              continue;
            }
            const cardBoundPowerUpper = cardBoundPowerUpperBySlot[slotPosition].get(card.cardId);
            if (cardBoundPowerUpper === undefined || !Number.isFinite(cardBoundPowerUpper)) {
              continue;
            }

            const coefficient = cardSpecificCoefficientUpperBySlot
              ? cardSpecificCoefficientUpperBySlot[slotPosition].get(card.cardId)
              : slotCoefficients[slotPosition];
            if (coefficient === undefined || !Number.isFinite(coefficient)) {
              continue;
            }

            const nextMask = mask | (1 << slotPosition);
            const coefficientContribution = card.effectivePower * coefficient;
            const cardBoundBaseContribution = card.effectivePower
              * slots[remainingSlotIndices[slotPosition]].baseScoreRatePerPower
              + cardBoundPowerUpper * getMedleyCardSkillAverageRateUpper(card);
            const weightedBaseContribution = coefficientWeight * coefficientContribution
              + cardBoundWeight * cardBoundBaseContribution;
            const nextIndex = nextMask * leaderMaskCount + leaderMask;
            nextCharacterOptions[nextIndex] = Math.max(
              nextCharacterOptions[nextIndex],
              currentValue + weightedBaseContribution,
            );

            const leaderBit = 1 << slotPosition;
            if ((leaderMask & leaderBit) === 0) {
              const nextLeaderMask = leaderMask | leaderBit;
              const leaderIndex = nextMask * leaderMaskCount + nextLeaderMask;
              nextCharacterOptions[leaderIndex] = Math.max(
                nextCharacterOptions[leaderIndex],
                currentValue
                  + weightedBaseContribution
                  + cardBoundWeight * cardBoundPowerUpper * getMedleyCardSkillLeaderRateUpper(card),
              );
            }
          }
        }
      }
      characterOptions = nextCharacterOptions;
    }

    const nextStates = states.slice();
    for (let stateIndex = 0; stateIndex < transition.stateCount; stateIndex += 1) {
      for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
        const currentValue = states[stateIndex * leaderMaskCount + leaderMask];
        if (!Number.isFinite(currentValue)) {
          continue;
        }
        for (let characterMask = 1; characterMask < maskCount; characterMask += 1) {
          const nextStateIndex = transition.nextIndexByMask[stateIndex * maskCount + characterMask];
          if (nextStateIndex < 0) {
            continue;
          }
          for (let characterLeaderMask = 0; characterLeaderMask < leaderMaskCount; characterLeaderMask += 1) {
            if (
              (characterLeaderMask & ~characterMask) !== 0
              || (leaderMask & characterLeaderMask) !== 0
            ) {
              continue;
            }
            const characterValue = characterOptions[characterMask * leaderMaskCount + characterLeaderMask];
            if (!Number.isFinite(characterValue)) {
              continue;
            }
            const nextLeaderMask = leaderMask | characterLeaderMask;
            const nextIndex = nextStateIndex * leaderMaskCount + nextLeaderMask;
            nextStates[nextIndex] = Math.max(nextStates[nextIndex], currentValue + characterValue);
          }
        }
      }
    }
    states = nextStates;
  }

  return states[transition.targetIndex * leaderMaskCount + targetLeaderMask];
}

function estimateMedleyCapacityContextBoundWeightedScoreUpperBound(
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  coefficientWeight: number,
): number {
  const slotCount = remainingSlotIndices.length;
  const cardBoundWeight = 1 - coefficientWeight;
  const maskCount = 1 << slotCount;
  const leaderMaskCount = 1 << slotCount;
  const targetLeaderMask = leaderMaskCount - 1;
  const transition = getMedleyCapacityTransition(slotCount);
  let states = new Float64Array(transition.stateCount * leaderMaskCount);
  states.fill(Number.NEGATIVE_INFINITY);
  states[0] = 0;

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptions = new Float64Array(maskCount * leaderMaskCount);
    characterOptions.fill(Number.NEGATIVE_INFINITY);
    characterOptions[0] = 0;

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptions = characterOptions.slice();
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
          const currentValue = characterOptions[mask * leaderMaskCount + leaderMask];
          if (!Number.isFinite(currentValue)) {
            continue;
          }
          for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
            if ((mask & (1 << slotPosition)) !== 0) {
              continue;
            }
            const card = slotCards[slotPosition];
            if (!card) {
              continue;
            }

            const contextBoundUpper = contextBoundUpperBySlot[slotPosition];
            const coefficient = contextBoundUpper.coefficientUpperByCardId.get(card.cardId);
            const averageScore = contextBoundUpper.averageScoreUpperByCardId.get(card.cardId);
            if (
              coefficient === undefined
              || averageScore === undefined
              || !Number.isFinite(coefficient)
              || !Number.isFinite(averageScore)
            ) {
              continue;
            }

            const nextMask = mask | (1 << slotPosition);
            const weightedBaseContribution = coefficientWeight * card.effectivePower * coefficient
              + cardBoundWeight * averageScore;
            const nextIndex = nextMask * leaderMaskCount + leaderMask;
            nextCharacterOptions[nextIndex] = Math.max(
              nextCharacterOptions[nextIndex],
              currentValue + weightedBaseContribution,
            );

            const leaderBit = 1 << slotPosition;
            if ((leaderMask & leaderBit) === 0) {
              const leaderScore = contextBoundUpper.leaderScoreUpperByCardId.get(card.cardId);
              if (leaderScore === undefined || !Number.isFinite(leaderScore)) {
                continue;
              }
              const nextLeaderMask = leaderMask | leaderBit;
              const leaderIndex = nextMask * leaderMaskCount + nextLeaderMask;
              nextCharacterOptions[leaderIndex] = Math.max(
                nextCharacterOptions[leaderIndex],
                currentValue + weightedBaseContribution + cardBoundWeight * leaderScore,
              );
            }
          }
        }
      }
      characterOptions = nextCharacterOptions;
    }

    const nextStates = states.slice();
    for (let stateIndex = 0; stateIndex < transition.stateCount; stateIndex += 1) {
      for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
        const currentValue = states[stateIndex * leaderMaskCount + leaderMask];
        if (!Number.isFinite(currentValue)) {
          continue;
        }
        for (let characterMask = 1; characterMask < maskCount; characterMask += 1) {
          const nextStateIndex = transition.nextIndexByMask[stateIndex * maskCount + characterMask];
          if (nextStateIndex < 0) {
            continue;
          }
          for (let characterLeaderMask = 0; characterLeaderMask < leaderMaskCount; characterLeaderMask += 1) {
            if (
              (characterLeaderMask & ~characterMask) !== 0
              || (leaderMask & characterLeaderMask) !== 0
            ) {
              continue;
            }
            const characterValue = characterOptions[characterMask * leaderMaskCount + characterLeaderMask];
            if (!Number.isFinite(characterValue)) {
              continue;
            }
            const nextLeaderMask = leaderMask | characterLeaderMask;
            const nextIndex = nextStateIndex * leaderMaskCount + nextLeaderMask;
            nextStates[nextIndex] = Math.max(nextStates[nextIndex], currentValue + characterValue);
          }
        }
      }
    }
    states = nextStates;
  }

  return states[transition.targetIndex * leaderMaskCount + targetLeaderMask];
}

function estimateMedleyCapacityCardBoundLagrangianScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  slotCoefficients: number[],
  cardBoundPowerUpperBySlot: MedleyCardBoundPowerUpperBySlot,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityWeightedUpperEstimate | null {
  const slotCount = remainingSlotIndices.length;
  if (slotCount < 2 || slotCount > MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityCardBoundLagrangianUpperCallCount += 1;
  }

  let bestUpperBound = Number.POSITIVE_INFINITY;
  let bestWeight = 0;
  for (const coefficientWeight of MEDLEY_CARD_BOUND_LAGRANGIAN_WEIGHTS) {
    const upperBound = estimateMedleyCapacityCardBoundWeightedScoreUpperBound(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      slotCoefficients,
      cardBoundPowerUpperBySlot,
      coefficientWeight,
    );
    if (Number.isFinite(upperBound) && upperBound < bestUpperBound) {
      bestUpperBound = upperBound;
      bestWeight = coefficientWeight;
    }
  }

  if (!Number.isFinite(bestUpperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityCardBoundLagrangianUpperCompletedCount += 1;
  }
  return {
    upperBound: bestUpperBound,
    weight: bestWeight,
  };
}

function estimateMedleyCapacityCardSpecificLagrangianScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  slotCoefficients: number[],
  cardSpecificCoefficientUpperBySlot: MedleyCardSpecificCoefficientUpperBySlot,
  cardBoundPowerUpperBySlot: MedleyCardBoundPowerUpperBySlot,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityWeightedUpperEstimate | null {
  const slotCount = remainingSlotIndices.length;
  if (slotCount < 2 || slotCount > MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityCardSpecificLagrangianUpperCallCount += 1;
  }

  let bestUpperBound = Number.POSITIVE_INFINITY;
  let bestWeight = 0;
  for (const coefficientWeight of MEDLEY_CARD_BOUND_LAGRANGIAN_WEIGHTS) {
    const upperBound = estimateMedleyCapacityCardBoundWeightedScoreUpperBound(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      slotCoefficients,
      cardBoundPowerUpperBySlot,
      coefficientWeight,
      cardSpecificCoefficientUpperBySlot,
    );
    if (Number.isFinite(upperBound) && upperBound < bestUpperBound) {
      bestUpperBound = upperBound;
      bestWeight = coefficientWeight;
    }
  }

  if (!Number.isFinite(bestUpperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityCardSpecificLagrangianUpperCompletedCount += 1;
  }
  return {
    upperBound: bestUpperBound,
    weight: bestWeight,
  };
}

function estimateMedleyCapacityCardBoundBucketedJointScoreUpperBoundForBucket(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  slotCoefficients: number[],
  cardBoundPowerUpperBySlot: MedleyCardBoundPowerUpperBySlot,
  bucketSize: number,
  targetBucketCount: number,
  stateBudget: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityBucketedJointUpperEstimate | null {
  const slotCount = remainingSlotIndices.length;
  const maskCount = 1 << slotCount;
  const leaderMaskCount = 1 << slotCount;
  const targetLeaderMask = leaderMaskCount - 1;
  const transition = getMedleyCapacityTransition(slotCount);
  let processedStateCount = 0;

  const abort = (): null => {
    if (profiling) {
      profiling.capacityCardBoundBucketedJointUpperAbortCount += 1;
      profiling.capacityCardBoundBucketedJointUpperStateCount += processedStateCount;
      profiling.capacityCardBoundBucketedJointUpperMaxProcessedStateCount = Math.max(
        profiling.capacityCardBoundBucketedJointUpperMaxProcessedStateCount,
        processedStateCount,
      );
      profiling.capacityCardBoundBucketedJointUpperBucketSize = bucketSize;
      profiling.capacityCardBoundBucketedJointUpperTargetBucketCount = targetBucketCount;
    }
    return null;
  };
  const accountState = (): boolean => {
    processedStateCount += 1;
    const totalStateCount = processedStateCount
      + (profiling?.capacityCardBoundBucketedJointUpperStateCount ?? 0);
    return (
      processedStateCount <= stateBudget
      && totalStateCount <= MEDLEY_CARD_BOUND_BUCKETED_JOINT_GLOBAL_STATE_BUDGET
    );
  };

  let statesByIndexAndLeaderMask: Array<Map<number, number>> = Array.from(
    { length: transition.stateCount * leaderMaskCount },
    () => new Map<number, number>(),
  );
  statesByIndexAndLeaderMask[0].set(0, 0);

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptions: Array<Map<number, number>> = Array.from(
      { length: maskCount * leaderMaskCount },
      () => new Map<number, number>(),
    );
    characterOptions[0].set(0, 0);

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptions = characterOptions.map(cloneMedleyCapacityBucketedJointStateMap);
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
          const states = characterOptions[mask * leaderMaskCount + leaderMask];
          if (states.size === 0) {
            continue;
          }
          for (const [coefficientBucket, cardBoundScore] of states.entries()) {
            for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
              if ((mask & (1 << slotPosition)) !== 0) {
                continue;
              }
              const card = slotCards[slotPosition];
              if (!card) {
                continue;
              }
              const cardBoundPowerUpper = cardBoundPowerUpperBySlot[slotPosition].get(card.cardId);
              if (cardBoundPowerUpper === undefined || !Number.isFinite(cardBoundPowerUpper)) {
                continue;
              }

              const nextMask = mask | (1 << slotPosition);
              const coefficientContribution = card.effectivePower * slotCoefficients[slotPosition];
              const nextCoefficientBucket = getMedleyCapacityBucketedJointBucket(
                coefficientBucket * bucketSize + coefficientContribution,
                bucketSize,
              );
              const cardBoundBaseContribution = card.effectivePower
                * slots[remainingSlotIndices[slotPosition]].baseScoreRatePerPower
                + cardBoundPowerUpper * getMedleyCardSkillAverageRateUpper(card);
              if (!accountState()) {
                return abort();
              }
              addMedleyCapacityBucketedJointState(
                nextCharacterOptions[nextMask * leaderMaskCount + leaderMask],
                nextCoefficientBucket,
                cardBoundScore + cardBoundBaseContribution,
              );

              const leaderBit = 1 << slotPosition;
              if ((leaderMask & leaderBit) === 0) {
                const nextLeaderMask = leaderMask | leaderBit;
                if (!accountState()) {
                  return abort();
                }
                addMedleyCapacityBucketedJointState(
                  nextCharacterOptions[nextMask * leaderMaskCount + nextLeaderMask],
                  nextCoefficientBucket,
                  cardBoundScore
                    + cardBoundBaseContribution
                    + cardBoundPowerUpper * getMedleyCardSkillLeaderRateUpper(card),
                );
              }
            }
          }
        }
      }
      pruneMedleyCapacityBucketedJointStateMaps(nextCharacterOptions);
      characterOptions = nextCharacterOptions;
    }

    const nextStatesByIndexAndLeaderMask = statesByIndexAndLeaderMask
      .map(cloneMedleyCapacityBucketedJointStateMap);
    for (let stateIndex = 0; stateIndex < transition.stateCount; stateIndex += 1) {
      for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
        const states = statesByIndexAndLeaderMask[stateIndex * leaderMaskCount + leaderMask];
        if (states.size === 0) {
          continue;
        }
        for (let characterMask = 1; characterMask < maskCount; characterMask += 1) {
          const nextStateIndex = transition.nextIndexByMask[stateIndex * maskCount + characterMask];
          if (nextStateIndex < 0) {
            continue;
          }
          for (let characterLeaderMask = 0; characterLeaderMask < leaderMaskCount; characterLeaderMask += 1) {
            if (
              (characterLeaderMask & ~characterMask) !== 0
              || (leaderMask & characterLeaderMask) !== 0
            ) {
              continue;
            }
            const options = characterOptions[characterMask * leaderMaskCount + characterLeaderMask];
            if (options.size === 0) {
              continue;
            }
            const nextLeaderMask = leaderMask | characterLeaderMask;
            const nextStates = nextStatesByIndexAndLeaderMask[
              nextStateIndex * leaderMaskCount + nextLeaderMask
            ];
            for (const [coefficientBucket, cardBoundScore] of states.entries()) {
              for (const [optionCoefficientBucket, optionCardBoundScore] of options.entries()) {
                if (!accountState()) {
                  return abort();
                }
                addMedleyCapacityBucketedJointState(
                  nextStates,
                  coefficientBucket + optionCoefficientBucket,
                  cardBoundScore + optionCardBoundScore,
                );
              }
            }
          }
        }
      }
    }
    pruneMedleyCapacityBucketedJointStateMaps(nextStatesByIndexAndLeaderMask);
    statesByIndexAndLeaderMask = nextStatesByIndexAndLeaderMask;
  }

  const targetStates = statesByIndexAndLeaderMask[transition.targetIndex * leaderMaskCount + targetLeaderMask];
  let upperBound = Number.NEGATIVE_INFINITY;
  for (const [coefficientBucket, cardBoundScore] of targetStates.entries()) {
    upperBound = Math.max(upperBound, Math.min(coefficientBucket * bucketSize, cardBoundScore));
  }
  if (!Number.isFinite(upperBound)) {
    return null;
  }

  if (profiling) {
    profiling.capacityCardBoundBucketedJointUpperCompletedCount += 1;
    profiling.capacityCardBoundBucketedJointUpperStateCount += processedStateCount;
    profiling.capacityCardBoundBucketedJointUpperMaxProcessedStateCount = Math.max(
      profiling.capacityCardBoundBucketedJointUpperMaxProcessedStateCount,
      processedStateCount,
    );
    profiling.capacityCardBoundBucketedJointUpperBucketSize = bucketSize;
    profiling.capacityCardBoundBucketedJointUpperTargetBucketCount = targetBucketCount;
  }
  return {
    upperBound,
    bucketSize,
    targetBucketCount,
  };
}

function estimateMedleyCapacityCardBoundBucketedJointScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  slotCoefficients: number[],
  cardBoundPowerUpperBySlot: MedleyCardBoundPowerUpperBySlot,
  coefficientUpperBound: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityBucketedJointUpperEstimate | null {
  const slotCount = remainingSlotIndices.length;
  if (slotCount < 2 || slotCount > MEDLEY_TEAM_COUNT || !Number.isFinite(coefficientUpperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityCardBoundBucketedJointUpperCallCount += 1;
    if (
      profiling.capacityCardBoundBucketedJointUpperStateCount
        >= MEDLEY_CARD_BOUND_BUCKETED_JOINT_GLOBAL_STATE_BUDGET
    ) {
      profiling.capacityCardBoundBucketedJointUpperAbortCount += 1;
      return null;
    }
  }

  for (const targetBucketCount of MEDLEY_CARD_BOUND_BUCKETED_JOINT_TARGET_BUCKET_COUNTS) {
    const bucketSize = Math.max(
      MEDLEY_CARD_BOUND_BUCKETED_JOINT_MIN_BUCKET_SIZE,
      Math.ceil(coefficientUpperBound / targetBucketCount),
    );
    const stateBudget = getMedleyCapacityBucketedJointStateBudget(targetBucketCount);
    const estimate = estimateMedleyCapacityCardBoundBucketedJointScoreUpperBoundForBucket(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      slotCoefficients,
      cardBoundPowerUpperBySlot,
      bucketSize,
      targetBucketCount,
      stateBudget,
      profiling,
    );
    if (estimate !== null) {
      return estimate;
    }
  }

  return null;
}

function estimateMedleyCapacityCardBoundDualObjectiveScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  slotCoefficients: number[],
  cardBoundPowerUpperBySlot: MedleyCardBoundPowerUpperBySlot,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  const slotCount = remainingSlotIndices.length;
  if (slotCount < 2 || slotCount > MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityCardBoundDualUpperCallCount += 1;
    if (profiling.capacityCardBoundDualUpperStateCount >= MEDLEY_CAPACITY_CARD_BOUND_DUAL_OBJECTIVE_GLOBAL_STATE_BUDGET) {
      profiling.capacityCardBoundDualUpperAbortCount += 1;
      return null;
    }
  }

  const maskCount = 1 << slotCount;
  const leaderMaskCount = 1 << slotCount;
  const targetLeaderMask = leaderMaskCount - 1;
  const transition = getMedleyCapacityTransition(slotCount);
  const emptyState = {
    coefficientScore: 0,
    skillAwareScore: 0,
  };
  let processedStateCount = 0;
  const abort = (): null => {
    if (profiling) {
      profiling.capacityCardBoundDualUpperAbortCount += 1;
      profiling.capacityCardBoundDualUpperStateCount += processedStateCount;
      profiling.capacityCardBoundDualUpperMaxProcessedStateCount = Math.max(
        profiling.capacityCardBoundDualUpperMaxProcessedStateCount,
        processedStateCount,
      );
    }
    return null;
  };
  const accountState = (): boolean => {
    processedStateCount += 1;
    const totalStateCount = processedStateCount + (profiling?.capacityCardBoundDualUpperStateCount ?? 0);
    return (
      processedStateCount <= MEDLEY_CAPACITY_CARD_BOUND_DUAL_OBJECTIVE_STATE_BUDGET
      && totalStateCount <= MEDLEY_CAPACITY_CARD_BOUND_DUAL_OBJECTIVE_GLOBAL_STATE_BUDGET
    );
  };

  let statesByIndexAndLeaderMask: MedleyCapacityDualObjectiveState[][] = Array.from(
    { length: transition.stateCount * leaderMaskCount },
    () => [],
  );
  statesByIndexAndLeaderMask[0].push(emptyState);

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptions: MedleyCapacityDualObjectiveState[][] = Array.from(
      { length: maskCount * leaderMaskCount },
      () => [],
    );
    characterOptions[0].push(emptyState);

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptions = characterOptions.map((states) => [...states]);
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
          const states = characterOptions[mask * leaderMaskCount + leaderMask];
          if (states.length === 0) {
            continue;
          }
          for (const state of states) {
            for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
              if ((mask & (1 << slotPosition)) !== 0) {
                continue;
              }
              const card = slotCards[slotPosition];
              if (!card) {
                continue;
              }
              const cardBoundPowerUpper = cardBoundPowerUpperBySlot[slotPosition].get(card.cardId);
              if (cardBoundPowerUpper === undefined || !Number.isFinite(cardBoundPowerUpper)) {
                continue;
              }
              if (!accountState()) {
                return abort();
              }

              const nextMask = mask | (1 << slotPosition);
              const coefficientContribution = card.effectivePower * slotCoefficients[slotPosition];
              const cardBoundBaseContribution = card.effectivePower
                * slots[remainingSlotIndices[slotPosition]].baseScoreRatePerPower
                + cardBoundPowerUpper * getMedleyCardSkillAverageRateUpper(card);
              addMedleyCapacityDualObjectiveState(
                nextCharacterOptions[nextMask * leaderMaskCount + leaderMask],
                {
                  coefficientScore: state.coefficientScore + coefficientContribution,
                  skillAwareScore: state.skillAwareScore + cardBoundBaseContribution,
                },
              );

              const leaderBit = 1 << slotPosition;
              if ((leaderMask & leaderBit) === 0) {
                const nextLeaderMask = leaderMask | leaderBit;
                if (!accountState()) {
                  return abort();
                }
                addMedleyCapacityDualObjectiveState(
                  nextCharacterOptions[nextMask * leaderMaskCount + nextLeaderMask],
                  {
                    coefficientScore: state.coefficientScore + coefficientContribution,
                    skillAwareScore: state.skillAwareScore
                      + cardBoundBaseContribution
                      + cardBoundPowerUpper * getMedleyCardSkillLeaderRateUpper(card),
                  },
                );
              }
            }
          }
        }
      }
      characterOptions = nextCharacterOptions;
    }

    const nextStatesByIndexAndLeaderMask = statesByIndexAndLeaderMask.map((states) => [...states]);
    for (let stateIndex = 0; stateIndex < transition.stateCount; stateIndex += 1) {
      for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
        const states = statesByIndexAndLeaderMask[stateIndex * leaderMaskCount + leaderMask];
        if (states.length === 0) {
          continue;
        }
        for (let characterMask = 1; characterMask < maskCount; characterMask += 1) {
          const nextStateIndex = transition.nextIndexByMask[stateIndex * maskCount + characterMask];
          if (nextStateIndex < 0) {
            continue;
          }
          for (let characterLeaderMask = 0; characterLeaderMask < leaderMaskCount; characterLeaderMask += 1) {
            if (
              (characterLeaderMask & ~characterMask) !== 0
              || (leaderMask & characterLeaderMask) !== 0
            ) {
              continue;
            }
            const options = characterOptions[characterMask * leaderMaskCount + characterLeaderMask];
            if (options.length === 0) {
              continue;
            }
            const nextLeaderMask = leaderMask | characterLeaderMask;
            const nextStates = nextStatesByIndexAndLeaderMask[nextStateIndex * leaderMaskCount + nextLeaderMask];
            for (const state of states) {
              for (const option of options) {
                if (!accountState()) {
                  return abort();
                }
                addMedleyCapacityDualObjectiveState(
                  nextStates,
                  {
                    coefficientScore: state.coefficientScore + option.coefficientScore,
                    skillAwareScore: state.skillAwareScore + option.skillAwareScore,
                  },
                );
              }
            }
          }
        }
      }
    }
    statesByIndexAndLeaderMask = nextStatesByIndexAndLeaderMask;
  }

  if (profiling) {
    profiling.capacityCardBoundDualUpperCompletedCount += 1;
    profiling.capacityCardBoundDualUpperStateCount += processedStateCount;
    profiling.capacityCardBoundDualUpperMaxProcessedStateCount = Math.max(
      profiling.capacityCardBoundDualUpperMaxProcessedStateCount,
      processedStateCount,
    );
  }

  return statesByIndexAndLeaderMask[transition.targetIndex * leaderMaskCount + targetLeaderMask].reduce(
    (best, state) => Math.max(best, Math.min(state.coefficientScore, state.skillAwareScore)),
    Number.NEGATIVE_INFINITY,
  );
}

function estimateMedleySlotEffectivePowerUpperBound(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
): number {
  const bestPowerByCharacter = new Map<number, number>();
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId)) {
      continue;
    }
    bestPowerByCharacter.set(
      card.characterId,
      Math.max(bestPowerByCharacter.get(card.characterId) ?? Number.NEGATIVE_INFINITY, card.effectivePower),
    );
  }
  if (bestPowerByCharacter.size < MEDLEY_TEAM_SIZE) {
    return Number.NEGATIVE_INFINITY;
  }

  const topPowers = new Array<number>(MEDLEY_TEAM_SIZE).fill(Number.NEGATIVE_INFINITY);
  for (const power of bestPowerByCharacter.values()) {
    insertTopValue(topPowers, power);
  }
  return topPowers.reduce((sum, power) => sum + power, 0);
}

function estimateMedleySlotSkillCoefficient(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
): MedleySlotSkillCoefficientEstimate {
  const legacyTopAverageRates = [0, 0, 0, 0, 0];
  let legacyLeaderRate = 0;
  const averageRateByCharacter = new Map<number, number>();
  const leaderRateByCharacter = new Map<number, number>();

  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId)) {
      continue;
    }
    const averageRate = getMedleyCardSkillAverageRateUpper(card);
    const leaderRate = getMedleyCardSkillLeaderRateUpper(card);
    insertTopValue(legacyTopAverageRates, averageRate);
    legacyLeaderRate = Math.max(legacyLeaderRate, leaderRate);
    averageRateByCharacter.set(
      card.characterId,
      Math.max(averageRateByCharacter.get(card.characterId) ?? 0, averageRate),
    );
    leaderRateByCharacter.set(
      card.characterId,
      Math.max(leaderRateByCharacter.get(card.characterId) ?? 0, leaderRate),
    );
  }

  if (averageRateByCharacter.size < MEDLEY_TEAM_SIZE) {
    return {
      coefficient: Number.NEGATIVE_INFINITY,
      legacyCoefficient: Number.NEGATIVE_INFINITY,
      improvement: 0,
    };
  }

  const ratesByCharacter = [...averageRateByCharacter.entries()];
  let bestCharacterDistinctSkillRate = Number.NEGATIVE_INFINITY;
  for (const [leaderCharacterId, leaderAverageRate] of ratesByCharacter) {
    const topOtherAverageRates = [0, 0, 0, 0];
    for (const [characterId, averageRate] of ratesByCharacter) {
      if (characterId !== leaderCharacterId) {
        insertTopValue(topOtherAverageRates, averageRate);
      }
    }
    const leaderRate = leaderRateByCharacter.get(leaderCharacterId) ?? 0;
    const skillRate = leaderRate
      + leaderAverageRate
      + topOtherAverageRates.reduce((sum, averageRate) => sum + averageRate, 0);
    bestCharacterDistinctSkillRate = Math.max(bestCharacterDistinctSkillRate, skillRate);
  }

  const legacySkillRate = legacyTopAverageRates.reduce((sum, averageRate) => sum + averageRate, legacyLeaderRate);
  return {
    coefficient: slot.baseScoreRatePerPower + bestCharacterDistinctSkillRate,
    legacyCoefficient: slot.baseScoreRatePerPower + legacySkillRate,
    improvement: Math.max(0, legacySkillRate - bestCharacterDistinctSkillRate),
  };
}

function sumTopMedleyAverageRatesExcluding(
  sortedAverageRatesByCharacter: Array<[number, number]>,
  excludedCharacterId: number,
  secondExcludedCharacterId: number | null,
  count: number,
): number | null {
  let sum = 0;
  let selectedCount = 0;
  for (const [characterId, averageRate] of sortedAverageRatesByCharacter) {
    if (characterId === excludedCharacterId || characterId === secondExcludedCharacterId) {
      continue;
    }
    sum += averageRate;
    selectedCount += 1;
    if (selectedCount === count) {
      return sum;
    }
  }
  return null;
}

function estimateMedleyCardSpecificSkillCoefficient(
  slot: MedleySlotSearch,
  card: SearchCard,
  sortedAverageRatesByCharacter: Array<[number, number]>,
  leaderComboRateByCharacter: Map<number, number>,
): number | null {
  const selfAverageRate = getMedleyCardSkillAverageRateUpper(card);
  const selfLeaderRate = getMedleyCardSkillLeaderRateUpper(card);
  const selfLeaderOtherAverageRateSum = sumTopMedleyAverageRatesExcluding(
    sortedAverageRatesByCharacter,
    card.characterId,
    null,
    MEDLEY_TEAM_SIZE - 1,
  );
  let bestSkillRate = selfLeaderOtherAverageRateSum === null
    ? Number.NEGATIVE_INFINITY
    : selfAverageRate + selfLeaderRate + selfLeaderOtherAverageRateSum;

  for (const [leaderCharacterId, leaderComboRate] of leaderComboRateByCharacter) {
    if (leaderCharacterId === card.characterId) {
      continue;
    }
    const otherAverageRateSum = sumTopMedleyAverageRatesExcluding(
      sortedAverageRatesByCharacter,
      card.characterId,
      leaderCharacterId,
      MEDLEY_TEAM_SIZE - 2,
    );
    if (otherAverageRateSum === null) {
      continue;
    }
    bestSkillRate = Math.max(bestSkillRate, selfAverageRate + leaderComboRate + otherAverageRateSum);
  }

  return Number.isFinite(bestSkillRate)
    ? slot.baseScoreRatePerPower + bestSkillRate
    : null;
}

function estimateMedleyLeaderFixedCardSpecificSkillCoefficient(
  slot: MedleySlotSearch,
  card: SearchCard,
  sortedAverageRatesByCharacter: Array<[number, number]>,
  leaderCharacterId: number,
  leaderComboRate: number,
): number | null {
  const selfAverageRate = getMedleyCardSkillAverageRateUpper(card);
  if (leaderCharacterId === card.characterId) {
    const selfLeaderOtherAverageRateSum = sumTopMedleyAverageRatesExcluding(
      sortedAverageRatesByCharacter,
      card.characterId,
      null,
      MEDLEY_TEAM_SIZE - 1,
    );
    if (selfLeaderOtherAverageRateSum === null) {
      return null;
    }
    return slot.baseScoreRatePerPower
      + selfAverageRate
      + getMedleyCardSkillLeaderRateUpper(card)
      + selfLeaderOtherAverageRateSum;
  }

  const otherAverageRateSum = sumTopMedleyAverageRatesExcluding(
    sortedAverageRatesByCharacter,
    card.characterId,
    leaderCharacterId,
    MEDLEY_TEAM_SIZE - 2,
  );
  return otherAverageRateSum === null
    ? null
    : slot.baseScoreRatePerPower + selfAverageRate + leaderComboRate + otherAverageRateSum;
}

function estimateMedleyContextFixedCardSpecificSkillCoefficient(
  slot: MedleySlotSearch,
  card: SearchCard,
  context: MedleySkillContextUpper,
  sortedAverageRatesByCharacter: Array<[number, number]>,
  leaderComboRateByCharacter: Map<number, number>,
): number | null {
  if (!medleyCardMatchesSkillContext(card, context)) {
    return null;
  }
  const selfAverageRate = getMedleyCardSkillAverageRateForContext(card, context.mode);
  const selfLeaderRate = getMedleyCardSkillLeaderRateForContext(card, context.mode);
  const selfLeaderOtherAverageRateSum = sumTopMedleyAverageRatesExcluding(
    sortedAverageRatesByCharacter,
    card.characterId,
    null,
    MEDLEY_TEAM_SIZE - 1,
  );
  let bestSkillRate = selfLeaderOtherAverageRateSum === null
    ? Number.NEGATIVE_INFINITY
    : selfAverageRate + selfLeaderRate + selfLeaderOtherAverageRateSum;

  for (const [leaderCharacterId, leaderComboRate] of leaderComboRateByCharacter) {
    if (leaderCharacterId === card.characterId) {
      continue;
    }
    const otherAverageRateSum = sumTopMedleyAverageRatesExcluding(
      sortedAverageRatesByCharacter,
      card.characterId,
      leaderCharacterId,
      MEDLEY_TEAM_SIZE - 2,
    );
    if (otherAverageRateSum === null) {
      continue;
    }
    bestSkillRate = Math.max(bestSkillRate, selfAverageRate + leaderComboRate + otherAverageRateSum);
  }

  return Number.isFinite(bestSkillRate)
    ? slot.baseScoreRatePerPower + bestSkillRate
    : null;
}

function buildMedleyCardSpecificCoefficientUpperBySlot(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
): MedleyCardSpecificCoefficientUpperBySlot {
  return remainingSlotIndices.map((slotIndex) => {
    const slot = slots[slotIndex];
    const averageRateByCharacter = new Map<number, number>();
    const leaderComboRateByCharacter = new Map<number, number>();
    for (const card of slot.searchCards) {
      if (bannedCardIds.has(card.cardId)) {
        continue;
      }
      const averageRate = getMedleyCardSkillAverageRateUpper(card);
      const leaderComboRate = averageRate + getMedleyCardSkillLeaderRateUpper(card);
      averageRateByCharacter.set(
        card.characterId,
        Math.max(averageRateByCharacter.get(card.characterId) ?? Number.NEGATIVE_INFINITY, averageRate),
      );
      leaderComboRateByCharacter.set(
        card.characterId,
        Math.max(leaderComboRateByCharacter.get(card.characterId) ?? Number.NEGATIVE_INFINITY, leaderComboRate),
      );
    }

    const sortedAverageRatesByCharacter = [...averageRateByCharacter.entries()]
      .sort((left, right) => right[1] - left[1]);
    const coefficientUpperByCardId = new Map<number, number>();
    for (const card of slot.searchCards) {
      if (bannedCardIds.has(card.cardId)) {
        continue;
      }
      const coefficient = estimateMedleyCardSpecificSkillCoefficient(
        slot,
        card,
        sortedAverageRatesByCharacter,
        leaderComboRateByCharacter,
      );
      if (coefficient !== null && Number.isFinite(coefficient)) {
        coefficientUpperByCardId.set(card.cardId, coefficient);
      }
    }
    return coefficientUpperByCardId;
  });
}

function estimateMedleyCapacityCardSpecificCoefficientScoreUpperBound(
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  cardSpecificCoefficientUpperBySlot: MedleyCardSpecificCoefficientUpperBySlot,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  const slotCount = remainingSlotIndices.length;
  if (slotCount < 2 || slotCount > MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityCardSpecificCoefficientUpperCallCount += 1;
  }

  const maskCount = 1 << slotCount;
  const transition = getMedleyCapacityTransition(slotCount);
  let states = new Float64Array(transition.stateCount);
  states.fill(Number.NEGATIVE_INFINITY);
  states[0] = 0;

  for (const cardsById of cardsByCharacter.values()) {
    let characterValues = new Float64Array(maskCount);
    characterValues.fill(Number.NEGATIVE_INFINITY);
    characterValues[0] = 0;
    for (const slotCards of cardsById.values()) {
      const nextCharacterValues = characterValues.slice();
      for (let mask = 0; mask < maskCount; mask += 1) {
        const currentValue = characterValues[mask];
        if (!Number.isFinite(currentValue)) {
          continue;
        }
        for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
          const card = slotCards[slotPosition];
          if ((mask & (1 << slotPosition)) !== 0 || !card) {
            continue;
          }
          const coefficient = cardSpecificCoefficientUpperBySlot[slotPosition].get(card.cardId);
          if (coefficient === undefined || !Number.isFinite(coefficient)) {
            continue;
          }
          const nextMask = mask | (1 << slotPosition);
          nextCharacterValues[nextMask] = Math.max(
            nextCharacterValues[nextMask],
            currentValue + card.effectivePower * coefficient,
          );
        }
      }
      characterValues = nextCharacterValues;
    }

    const nextStates = states.slice();
    for (let stateIndex = 0; stateIndex < states.length; stateIndex += 1) {
      const currentValue = states[stateIndex];
      if (!Number.isFinite(currentValue)) {
        continue;
      }
      for (let mask = 1; mask < maskCount; mask += 1) {
        const nextIndex = transition.nextIndexByMask[stateIndex * maskCount + mask];
        if (nextIndex < 0) {
          continue;
        }
        const characterValue = characterValues[mask];
        if (Number.isFinite(characterValue)) {
          nextStates[nextIndex] = Math.max(nextStates[nextIndex], currentValue + characterValue);
        }
      }
    }
    states = nextStates;
  }

  if (profiling) {
    profiling.capacityCardSpecificCoefficientUpperCompletedCount += 1;
  }
  const upperBound = states[transition.targetIndex];
  return Number.isFinite(upperBound) ? upperBound : null;
}

function cloneMedleyCapacityAssignmentWitnessSlots(slots: SearchCard[][]): SearchCard[][] {
  return slots.map((cards) => [...cards]);
}

function createEmptyMedleyCapacityAssignmentWitnessState(slotCount: number): {
  value: number;
  slots: SearchCard[][];
  contributions: number[];
} {
  return {
    value: 0,
    slots: Array.from({ length: slotCount }, () => []),
    contributions: new Array<number>(slotCount).fill(0),
  };
}

function addCardToMedleyCapacityAssignmentWitnessState(
  state: {
    value: number;
    slots: SearchCard[][];
    contributions: number[];
  },
  slotPosition: number,
  card: SearchCard,
  contribution: number,
): {
  value: number;
  slots: SearchCard[][];
  contributions: number[];
} {
  const slots = cloneMedleyCapacityAssignmentWitnessSlots(state.slots);
  const contributions = [...state.contributions];
  slots[slotPosition].push(card);
  contributions[slotPosition] += contribution;
  return {
    value: state.value + contribution,
    slots,
    contributions,
  };
}

function mergeMedleyCapacityAssignmentWitnessStates(
  left: {
    value: number;
    slots: SearchCard[][];
    contributions: number[];
  },
  right: {
    value: number;
    slots: SearchCard[][];
    contributions: number[];
  },
): {
  value: number;
  slots: SearchCard[][];
  contributions: number[];
} {
  return {
    value: left.value + right.value,
    slots: left.slots.map((cards, slotPosition) => [...cards, ...right.slots[slotPosition]]),
    contributions: left.contributions.map((value, slotPosition) => value + right.contributions[slotPosition]),
  };
}

function replaceMedleyCapacityAssignmentWitnessStateIfBetter(
  states: Array<ReturnType<typeof createEmptyMedleyCapacityAssignmentWitnessState> | null>,
  index: number,
  candidate: ReturnType<typeof createEmptyMedleyCapacityAssignmentWitnessState>,
): void {
  const current = states[index];
  if (!current || candidate.value > current.value) {
    states[index] = candidate;
  }
}

function estimateMedleyCapacityCardSpecificCoefficientAssignmentWitness(
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  cardSpecificCoefficientUpperBySlot: MedleyCardSpecificCoefficientUpperBySlot,
): MedleyCapacityAssignmentWitness | null {
  const slotCount = remainingSlotIndices.length;
  if (slotCount !== MEDLEY_TEAM_COUNT) {
    return null;
  }

  const maskCount = 1 << slotCount;
  const transition = getMedleyCapacityTransition(slotCount);
  let states: Array<ReturnType<typeof createEmptyMedleyCapacityAssignmentWitnessState> | null> = Array.from(
    { length: transition.stateCount },
    () => null,
  );
  states[0] = createEmptyMedleyCapacityAssignmentWitnessState(slotCount);

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptions: Array<ReturnType<typeof createEmptyMedleyCapacityAssignmentWitnessState> | null> = Array.from(
      { length: maskCount },
      () => null,
    );
    characterOptions[0] = createEmptyMedleyCapacityAssignmentWitnessState(slotCount);

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptions = [...characterOptions];
      for (let mask = 0; mask < maskCount; mask += 1) {
        const current = characterOptions[mask];
        if (!current) {
          continue;
        }
        for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
          const card = slotCards[slotPosition];
          if ((mask & (1 << slotPosition)) !== 0 || !card) {
            continue;
          }
          const coefficient = cardSpecificCoefficientUpperBySlot[slotPosition].get(card.cardId);
          if (coefficient === undefined || !Number.isFinite(coefficient)) {
            continue;
          }
          const contribution = card.effectivePower * coefficient;
          const nextMask = mask | (1 << slotPosition);
          replaceMedleyCapacityAssignmentWitnessStateIfBetter(
            nextCharacterOptions,
            nextMask,
            addCardToMedleyCapacityAssignmentWitnessState(current, slotPosition, card, contribution),
          );
        }
      }
      characterOptions = nextCharacterOptions;
    }

    const nextStates = [...states];
    for (let stateIndex = 0; stateIndex < states.length; stateIndex += 1) {
      const current = states[stateIndex];
      if (!current) {
        continue;
      }
      for (let mask = 1; mask < maskCount; mask += 1) {
        const characterOption = characterOptions[mask];
        if (!characterOption) {
          continue;
        }
        const nextIndex = transition.nextIndexByMask[stateIndex * maskCount + mask];
        if (nextIndex < 0) {
          continue;
        }
        replaceMedleyCapacityAssignmentWitnessStateIfBetter(
          nextStates,
          nextIndex,
          mergeMedleyCapacityAssignmentWitnessStates(current, characterOption),
        );
      }
    }
    states = nextStates;
  }

  const target = states[transition.targetIndex];
  if (!target || !Number.isFinite(target.value) || target.slots.some((cards) => cards.length !== MEDLEY_TEAM_SIZE)) {
    return null;
  }
  return {
    upperBound: target.value,
    slots: target.slots.map((cards, slotPosition) => ({
      slotIndex: remainingSlotIndices[slotPosition],
      cards,
      upperContribution: target.contributions[slotPosition],
    })),
  };
}

function buildMedleyLeaderFixedCardSpecificCoefficientUpper(
  slot: MedleySlotSearch,
  leaderCharacterId: number,
  leaderComboRate: number,
  sortedAverageRatesByCharacter: Array<[number, number]>,
  bannedCardIds: Set<number>,
): Map<number, number> {
  const coefficientUpperByCardId = new Map<number, number>();
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId)) {
      continue;
    }
    const coefficient = estimateMedleyLeaderFixedCardSpecificSkillCoefficient(
      slot,
      card,
      sortedAverageRatesByCharacter,
      leaderCharacterId,
      leaderComboRate,
    );
    if (coefficient !== null && Number.isFinite(coefficient)) {
      coefficientUpperByCardId.set(card.cardId, coefficient);
    }
  }
  return coefficientUpperByCardId;
}

function buildMedleyLeaderFixedSkillContext(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
): {
  leaderComboRateByCharacter: Map<number, number>;
  sortedAverageRatesByCharacter: Array<[number, number]>;
} {
  const averageRateByCharacter = new Map<number, number>();
  const leaderComboRateByCharacter = new Map<number, number>();
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId)) {
      continue;
    }
    const averageRate = getMedleyCardSkillAverageRateUpper(card);
    const leaderComboRate = averageRate + getMedleyCardSkillLeaderRateUpper(card);
    averageRateByCharacter.set(
      card.characterId,
      Math.max(averageRateByCharacter.get(card.characterId) ?? Number.NEGATIVE_INFINITY, averageRate),
    );
    leaderComboRateByCharacter.set(
      card.characterId,
      Math.max(leaderComboRateByCharacter.get(card.characterId) ?? Number.NEGATIVE_INFINITY, leaderComboRate),
    );
  }

  return {
    leaderComboRateByCharacter,
    sortedAverageRatesByCharacter: [...averageRateByCharacter.entries()]
      .sort((left, right) => right[1] - left[1]),
  };
}

function estimateMedleyCapacityLeaderFixedCardSpecificCoefficientScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  cardSpecificCoefficientUpperBySlot: MedleyCardSpecificCoefficientUpperBySlot,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  if (remainingSlotIndices.length !== MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityLeaderFixedCardSpecificUpperCallCount += 1;
  }

  let bestFixedSlotUpperBound = Number.POSITIVE_INFINITY;
  for (let fixedSlotPosition = 0; fixedSlotPosition < remainingSlotIndices.length; fixedSlotPosition += 1) {
    const slot = slots[remainingSlotIndices[fixedSlotPosition]];
    const { leaderComboRateByCharacter, sortedAverageRatesByCharacter } = buildMedleyLeaderFixedSkillContext(
      slot,
      bannedCardIds,
    );
    let fixedSlotUpperBound = Number.NEGATIVE_INFINITY;

    for (const [leaderCharacterId, leaderComboRate] of leaderComboRateByCharacter) {
      const coefficientUpperBySlot = cardSpecificCoefficientUpperBySlot.slice();
      coefficientUpperBySlot[fixedSlotPosition] = buildMedleyLeaderFixedCardSpecificCoefficientUpper(
        slot,
        leaderCharacterId,
        leaderComboRate,
        sortedAverageRatesByCharacter,
        bannedCardIds,
      );
      const upperBound = estimateMedleyCapacityCardSpecificCoefficientScoreUpperBound(
        remainingSlotIndices,
        cardsByCharacter,
        coefficientUpperBySlot,
      );
      if (upperBound !== null && Number.isFinite(upperBound)) {
        fixedSlotUpperBound = Math.max(fixedSlotUpperBound, upperBound);
      }
    }

    if (!Number.isFinite(fixedSlotUpperBound)) {
      return null;
    }
    bestFixedSlotUpperBound = Math.min(bestFixedSlotUpperBound, fixedSlotUpperBound);
  }

  if (!Number.isFinite(bestFixedSlotUpperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityLeaderFixedCardSpecificUpperCompletedCount += 1;
  }
  return bestFixedSlotUpperBound;
}

function buildMedleyLeaderGroupCardSpecificCoefficientUppers(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
  topLeaderCount: number,
): Array<Map<number, number>> {
  const { leaderComboRateByCharacter, sortedAverageRatesByCharacter } = buildMedleyLeaderFixedSkillContext(
    slot,
    bannedCardIds,
  );
  const leaderEntries = [...leaderComboRateByCharacter.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0]);
  const leaderGroups: Array<Array<[number, number]>> = leaderEntries
    .slice(0, Math.max(0, topLeaderCount))
    .map((entry) => [entry]);
  const remainingLeaderEntries = leaderEntries.slice(Math.max(0, topLeaderCount));
  for (let index = 0; index < remainingLeaderEntries.length; index += MEDLEY_LEADER_GROUP_CARD_SPECIFIC_TAIL_GROUP_SIZE) {
    leaderGroups.push(remainingLeaderEntries.slice(index, index + MEDLEY_LEADER_GROUP_CARD_SPECIFIC_TAIL_GROUP_SIZE));
  }

  return leaderGroups.map((leaderGroup) => {
    const coefficientUpperByCardId = new Map<number, number>();
    for (const card of slot.searchCards) {
      if (bannedCardIds.has(card.cardId)) {
        continue;
      }
      let bestCoefficient = Number.NEGATIVE_INFINITY;
      for (const [leaderCharacterId, leaderComboRate] of leaderGroup) {
        const coefficient = estimateMedleyLeaderFixedCardSpecificSkillCoefficient(
          slot,
          card,
          sortedAverageRatesByCharacter,
          leaderCharacterId,
          leaderComboRate,
        );
        if (coefficient !== null && Number.isFinite(coefficient)) {
          bestCoefficient = Math.max(bestCoefficient, coefficient);
        }
      }
      if (Number.isFinite(bestCoefficient)) {
        coefficientUpperByCardId.set(card.cardId, bestCoefficient);
      }
    }
    return coefficientUpperByCardId;
  });
}

function estimateMedleyCapacityLeaderGroupCardSpecificCoefficientScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  if (remainingSlotIndices.length !== MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityLeaderGroupCardSpecificUpperCallCount += 1;
  }

  const coefficientGroupsBySlot = remainingSlotIndices.map((slotIndex) => (
    buildMedleyLeaderGroupCardSpecificCoefficientUppers(
      slots[slotIndex],
      bannedCardIds,
      MEDLEY_LEADER_GROUP_CARD_SPECIFIC_TOP_COUNT,
    )
  ));
  if (coefficientGroupsBySlot.some((groups) => groups.length === 0)) {
    return null;
  }

  let combinationCount = 1;
  for (const groups of coefficientGroupsBySlot) {
    combinationCount *= groups.length;
  }
  if (profiling) {
    profiling.capacityLeaderGroupCardSpecificUpperGroupCount = combinationCount;
  }

  let upperBound = Number.NEGATIVE_INFINITY;
  for (const firstSlotCoefficients of coefficientGroupsBySlot[0]) {
    for (const secondSlotCoefficients of coefficientGroupsBySlot[1]) {
      for (const thirdSlotCoefficients of coefficientGroupsBySlot[2]) {
        const estimate = estimateMedleyCapacityCardSpecificCoefficientScoreUpperBound(
          remainingSlotIndices,
          cardsByCharacter,
          [firstSlotCoefficients, secondSlotCoefficients, thirdSlotCoefficients],
        );
        if (estimate !== null && Number.isFinite(estimate)) {
          upperBound = Math.max(upperBound, estimate);
        }
      }
    }
  }

  if (!Number.isFinite(upperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityLeaderGroupCardSpecificUpperCompletedCount += 1;
  }
  return upperBound;
}

function buildMedleyContextFixedSkillContext(
  slot: MedleySlotSearch,
  context: MedleySkillContextUpper,
  bannedCardIds: Set<number>,
): {
  leaderComboRateByCharacter: Map<number, number>;
  sortedAverageRatesByCharacter: Array<[number, number]>;
} {
  const averageRateByCharacter = new Map<number, number>();
  const leaderComboRateByCharacter = new Map<number, number>();
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId) || !medleyCardMatchesSkillContext(card, context)) {
      continue;
    }
    const averageRate = getMedleyCardSkillAverageRateForContext(card, context.mode);
    const leaderComboRate = averageRate + getMedleyCardSkillLeaderRateForContext(card, context.mode);
    averageRateByCharacter.set(
      card.characterId,
      Math.max(averageRateByCharacter.get(card.characterId) ?? Number.NEGATIVE_INFINITY, averageRate),
    );
    leaderComboRateByCharacter.set(
      card.characterId,
      Math.max(leaderComboRateByCharacter.get(card.characterId) ?? Number.NEGATIVE_INFINITY, leaderComboRate),
    );
  }

  return {
    leaderComboRateByCharacter,
    sortedAverageRatesByCharacter: [...averageRateByCharacter.entries()]
      .sort((left, right) => right[1] - left[1]),
  };
}

function buildMedleyContextFixedCardSpecificCoefficientUpper(
  slot: MedleySlotSearch,
  context: MedleySkillContextUpper,
  sortedAverageRatesByCharacter: Array<[number, number]>,
  leaderComboRateByCharacter: Map<number, number>,
  bannedCardIds: Set<number>,
): Map<number, number> {
  const coefficientUpperByCardId = new Map<number, number>();
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId)) {
      continue;
    }
    const coefficient = estimateMedleyContextFixedCardSpecificSkillCoefficient(
      slot,
      card,
      context,
      sortedAverageRatesByCharacter,
      leaderComboRateByCharacter,
    );
    if (coefficient !== null && Number.isFinite(coefficient)) {
      coefficientUpperByCardId.set(card.cardId, coefficient);
    }
  }
  return coefficientUpperByCardId;
}

function estimateMedleyCapacityContextFixedCardSpecificCoefficientScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  cardSpecificCoefficientUpperBySlot: MedleyCardSpecificCoefficientUpperBySlot,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  if (remainingSlotIndices.length !== MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextFixedCardSpecificUpperCallCount += 1;
  }

  let bestFixedSlotUpperBound = Number.POSITIVE_INFINITY;
  for (let fixedSlotPosition = 0; fixedSlotPosition < remainingSlotIndices.length; fixedSlotPosition += 1) {
    const slot = slots[remainingSlotIndices[fixedSlotPosition]];
    const contexts = buildMedleySkillContextUppers(slot, []);
    let fixedSlotUpperBound = Number.NEGATIVE_INFINITY;

    for (const context of contexts) {
      const { leaderComboRateByCharacter, sortedAverageRatesByCharacter } = buildMedleyContextFixedSkillContext(
        slot,
        context,
        bannedCardIds,
      );
      if (sortedAverageRatesByCharacter.length < MEDLEY_TEAM_SIZE) {
        continue;
      }
      const coefficientUpperBySlot = cardSpecificCoefficientUpperBySlot.slice();
      coefficientUpperBySlot[fixedSlotPosition] = buildMedleyContextFixedCardSpecificCoefficientUpper(
        slot,
        context,
        sortedAverageRatesByCharacter,
        leaderComboRateByCharacter,
        bannedCardIds,
      );
      const upperBound = estimateMedleyCapacityCardSpecificCoefficientScoreUpperBound(
        remainingSlotIndices,
        cardsByCharacter,
        coefficientUpperBySlot,
      );
      if (upperBound !== null && Number.isFinite(upperBound)) {
        fixedSlotUpperBound = Math.max(fixedSlotUpperBound, upperBound);
      }
    }

    if (!Number.isFinite(fixedSlotUpperBound)) {
      return null;
    }
    bestFixedSlotUpperBound = Math.min(bestFixedSlotUpperBound, fixedSlotUpperBound);
  }

  if (!Number.isFinite(bestFixedSlotUpperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextFixedCardSpecificUpperCompletedCount += 1;
  }
  return bestFixedSlotUpperBound;
}

function getMedleyContextCoefficientPotential(coefficientUpperByCardId: Map<number, number>): number {
  let bestCoefficient = Number.NEGATIVE_INFINITY;
  for (const coefficient of coefficientUpperByCardId.values()) {
    bestCoefficient = Math.max(bestCoefficient, coefficient);
  }
  return bestCoefficient;
}

function setMedleyMaxMapValue(map: Map<number, number>, key: number, value: number): void {
  if (!Number.isFinite(value)) {
    return;
  }
  map.set(key, Math.max(map.get(key) ?? Number.NEGATIVE_INFINITY, value));
}

function buildMedleyContextCardBoundPowerUpper(
  slot: MedleySlotSearch,
  context: MedleySkillContextUpper,
  bannedCardIds: Set<number>,
): Map<number, number> {
  const bestPowerByCharacter = new Map<number, number>();
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId) || !medleyCardMatchesSkillContext(card, context)) {
      continue;
    }
    bestPowerByCharacter.set(
      card.characterId,
      Math.max(bestPowerByCharacter.get(card.characterId) ?? Number.NEGATIVE_INFINITY, card.effectivePower),
    );
  }

  const sortedCharacterPowers = [...bestPowerByCharacter.entries()]
    .sort((left, right) => right[1] - left[1]);
  const powerUpperByCardId = new Map<number, number>();
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId) || !medleyCardMatchesSkillContext(card, context)) {
      continue;
    }
    let otherPower = 0;
    let otherCharacterCount = 0;
    for (const [characterId, power] of sortedCharacterPowers) {
      if (characterId === card.characterId) {
        continue;
      }
      otherPower += power;
      otherCharacterCount += 1;
      if (otherCharacterCount === MEDLEY_TEAM_SIZE - 1) {
        break;
      }
    }
    if (otherCharacterCount === MEDLEY_TEAM_SIZE - 1) {
      powerUpperByCardId.set(card.cardId, card.effectivePower + otherPower);
    }
  }
  return powerUpperByCardId;
}

function buildMedleyContextBoundUpperGroup(
  slot: MedleySlotSearch,
  context: MedleySkillContextUpper,
  coefficientUpperByCardId: Map<number, number>,
  bannedCardIds: Set<number>,
): MedleyContextBoundUpperGroup {
  const averageRateUpperByCardId = new Map<number, number>();
  const leaderRateUpperByCardId = new Map<number, number>();
  const averageScoreUpperByCardId = new Map<number, number>();
  const leaderScoreUpperByCardId = new Map<number, number>();
  const powerUpperByCardId = buildMedleyContextCardBoundPowerUpper(slot, context, bannedCardIds);

  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId) || !medleyCardMatchesSkillContext(card, context)) {
      continue;
    }
    const cardBoundPowerUpper = powerUpperByCardId.get(card.cardId);
    if (cardBoundPowerUpper === undefined || !Number.isFinite(cardBoundPowerUpper)) {
      continue;
    }
    const averageRate = getMedleyCardSkillAverageRateForContext(card, context.mode);
    const leaderRate = getMedleyCardSkillLeaderRateForContext(card, context.mode);
    averageRateUpperByCardId.set(card.cardId, averageRate);
    leaderRateUpperByCardId.set(card.cardId, leaderRate);
    averageScoreUpperByCardId.set(
      card.cardId,
      card.effectivePower * slot.baseScoreRatePerPower
        + cardBoundPowerUpper * averageRate,
    );
    leaderScoreUpperByCardId.set(
      card.cardId,
      cardBoundPowerUpper * leaderRate,
    );
  }

  return {
    coefficientUpperByCardId,
    averageRateUpperByCardId,
    leaderRateUpperByCardId,
    averageScoreUpperByCardId,
    leaderScoreUpperByCardId,
  };
}

function mergeMedleyContextBoundUpperGroups(
  groups: MedleyContextBoundUpperGroup[],
): MedleyContextBoundUpperGroup {
  const merged: MedleyContextBoundUpperGroup = {
    coefficientUpperByCardId: new Map<number, number>(),
    averageRateUpperByCardId: new Map<number, number>(),
    leaderRateUpperByCardId: new Map<number, number>(),
    averageScoreUpperByCardId: new Map<number, number>(),
    leaderScoreUpperByCardId: new Map<number, number>(),
  };

  for (const group of groups) {
    for (const [cardId, coefficient] of group.coefficientUpperByCardId) {
      setMedleyMaxMapValue(merged.coefficientUpperByCardId, cardId, coefficient);
    }
    for (const [cardId, averageRate] of group.averageRateUpperByCardId) {
      setMedleyMaxMapValue(merged.averageRateUpperByCardId, cardId, averageRate);
    }
    for (const [cardId, leaderRate] of group.leaderRateUpperByCardId) {
      setMedleyMaxMapValue(merged.leaderRateUpperByCardId, cardId, leaderRate);
    }
    for (const [cardId, averageScore] of group.averageScoreUpperByCardId) {
      setMedleyMaxMapValue(merged.averageScoreUpperByCardId, cardId, averageScore);
    }
    for (const [cardId, leaderScore] of group.leaderScoreUpperByCardId) {
      setMedleyMaxMapValue(merged.leaderScoreUpperByCardId, cardId, leaderScore);
    }
  }

  return merged;
}

function buildMedleyContextGroupCardSpecificCoefficientUppers(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
): Array<Map<number, number>> {
  return buildMedleyContextBoundUpperGroups(slot, bannedCardIds)
    .map((group) => group.coefficientUpperByCardId);
}

function buildMedleyContextBoundUpperGroups(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
): MedleyContextBoundUpperGroup[] {
  const contextEntries = buildMedleySkillContextUppers(slot, [])
    .map((context) => {
      const { leaderComboRateByCharacter, sortedAverageRatesByCharacter } = buildMedleyContextFixedSkillContext(
        slot,
        context,
        bannedCardIds,
      );
      if (sortedAverageRatesByCharacter.length < MEDLEY_TEAM_SIZE) {
        return null;
      }
      const coefficientUpperByCardId = buildMedleyContextFixedCardSpecificCoefficientUpper(
        slot,
        context,
        sortedAverageRatesByCharacter,
        leaderComboRateByCharacter,
        bannedCardIds,
      );
      const potential = getMedleyContextCoefficientPotential(coefficientUpperByCardId);
      const group = buildMedleyContextBoundUpperGroup(slot, context, coefficientUpperByCardId, bannedCardIds);
      return Number.isFinite(potential)
        ? { group, potential }
        : null;
    })
    .filter((entry): entry is { group: MedleyContextBoundUpperGroup; potential: number } => entry !== null)
    .sort((left, right) => right.potential - left.potential);

  const groups: MedleyContextBoundUpperGroup[][] = contextEntries
    .slice(0, MEDLEY_CONTEXT_GROUP_CARD_SPECIFIC_TOP_COUNT)
    .map((entry) => [entry.group]);
  const remainingContexts = contextEntries.slice(MEDLEY_CONTEXT_GROUP_CARD_SPECIFIC_TOP_COUNT);
  for (let index = 0; index < remainingContexts.length; index += MEDLEY_CONTEXT_GROUP_CARD_SPECIFIC_TAIL_GROUP_SIZE) {
    groups.push(
      remainingContexts
        .slice(index, index + MEDLEY_CONTEXT_GROUP_CARD_SPECIFIC_TAIL_GROUP_SIZE)
        .map((entry) => entry.group),
    );
  }

  return groups.map(mergeMedleyContextBoundUpperGroups);
}

function estimateMedleyCapacityContextGroupCardSpecificCoefficientScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  if (remainingSlotIndices.length !== MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextGroupCardSpecificUpperCallCount += 1;
  }

  const coefficientGroupsBySlot = remainingSlotIndices.map((slotIndex) => (
    buildMedleyContextGroupCardSpecificCoefficientUppers(slots[slotIndex], bannedCardIds)
  ));
  if (coefficientGroupsBySlot.some((groups) => groups.length === 0)) {
    return null;
  }

  let combinationCount = 1;
  for (const groups of coefficientGroupsBySlot) {
    combinationCount *= groups.length;
  }
  if (profiling) {
    profiling.capacityContextGroupCardSpecificUpperGroupCount = combinationCount;
  }

  let upperBound = Number.NEGATIVE_INFINITY;
  for (const firstSlotCoefficients of coefficientGroupsBySlot[0]) {
    for (const secondSlotCoefficients of coefficientGroupsBySlot[1]) {
      for (const thirdSlotCoefficients of coefficientGroupsBySlot[2]) {
        const estimate = estimateMedleyCapacityCardSpecificCoefficientScoreUpperBound(
          remainingSlotIndices,
          cardsByCharacter,
          [firstSlotCoefficients, secondSlotCoefficients, thirdSlotCoefficients],
        );
        if (estimate !== null && Number.isFinite(estimate)) {
          upperBound = Math.max(upperBound, estimate);
        }
      }
    }
  }

  if (!Number.isFinite(upperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextGroupCardSpecificUpperCompletedCount += 1;
  }
  return upperBound;
}

function estimateMedleyCapacityContextBoundLagrangianScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityWeightedUpperEstimate | null {
  if (remainingSlotIndices.length !== MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextBoundLagrangianUpperCallCount += 1;
  }

  const groupsBySlot = remainingSlotIndices.map((slotIndex) => (
    buildMedleyContextBoundUpperGroups(slots[slotIndex], bannedCardIds)
  ));
  if (groupsBySlot.some((groups) => groups.length === 0)) {
    return null;
  }

  let combinationCount = 1;
  for (const groups of groupsBySlot) {
    combinationCount *= groups.length;
  }
  if (profiling) {
    profiling.capacityContextBoundLagrangianUpperGroupCount = combinationCount;
  }
  if (combinationCount > MEDLEY_CONTEXT_BOUND_LAGRANGIAN_MAX_GROUP_COMBINATIONS) {
    return null;
  }

  let upperBound = Number.NEGATIVE_INFINITY;
  let bestWeight = 0;
  for (const firstSlotUpper of groupsBySlot[0]) {
    for (const secondSlotUpper of groupsBySlot[1]) {
      for (const thirdSlotUpper of groupsBySlot[2]) {
        const contextBoundUpperBySlot = [firstSlotUpper, secondSlotUpper, thirdSlotUpper];
        let combinationUpperBound = Number.POSITIVE_INFINITY;
        let combinationBestWeight = 0;
        for (const coefficientWeight of MEDLEY_CONTEXT_BOUND_LAGRANGIAN_WEIGHTS) {
          const estimate = estimateMedleyCapacityContextBoundWeightedScoreUpperBound(
            remainingSlotIndices,
            cardsByCharacter,
            contextBoundUpperBySlot,
            coefficientWeight,
          );
          if (Number.isFinite(estimate) && estimate < combinationUpperBound) {
            combinationUpperBound = estimate;
            combinationBestWeight = coefficientWeight;
          }
        }
        if (Number.isFinite(combinationUpperBound) && combinationUpperBound > upperBound) {
          upperBound = combinationUpperBound;
          bestWeight = combinationBestWeight;
        }
      }
    }
  }

  if (!Number.isFinite(upperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextBoundLagrangianUpperCompletedCount += 1;
  }
  return {
    upperBound,
    weight: bestWeight,
  };
}

function estimateMedleyContextBoundMcCormickSlotBounds(
  slot: MedleySlotSearch,
  contextBoundUpper: MedleyContextBoundUpperGroup,
): MedleyContextBoundMcCormickSlotBounds | null {
  const minimumPowerByCharacter = new Map<number, number>();
  const maximumPowerByCharacter = new Map<number, number>();
  const skillRateOptionsByCharacter = new Map<number, {
    minimumAverageRate: number;
    maximumAverageRate: number;
    minimumLeaderRate: number;
    maximumLeaderRate: number;
    maximumLeaderComboRate: number;
  }>();

  for (const card of slot.searchCards) {
    if (!contextBoundUpper.averageRateUpperByCardId.has(card.cardId)) {
      continue;
    }
    minimumPowerByCharacter.set(
      card.characterId,
      Math.min(minimumPowerByCharacter.get(card.characterId) ?? Number.POSITIVE_INFINITY, card.effectivePower),
    );
    maximumPowerByCharacter.set(
      card.characterId,
      Math.max(maximumPowerByCharacter.get(card.characterId) ?? Number.NEGATIVE_INFINITY, card.effectivePower),
    );
    const averageRate = contextBoundUpper.averageRateUpperByCardId.get(card.cardId) ?? 0;
    const leaderRate = contextBoundUpper.leaderRateUpperByCardId.get(card.cardId) ?? 0;
    const option = skillRateOptionsByCharacter.get(card.characterId) ?? {
      minimumAverageRate: Number.POSITIVE_INFINITY,
      maximumAverageRate: Number.NEGATIVE_INFINITY,
      minimumLeaderRate: Number.POSITIVE_INFINITY,
      maximumLeaderRate: Number.NEGATIVE_INFINITY,
      maximumLeaderComboRate: Number.NEGATIVE_INFINITY,
    };
    option.minimumAverageRate = Math.min(option.minimumAverageRate, averageRate);
    option.maximumAverageRate = Math.max(option.maximumAverageRate, averageRate);
    option.minimumLeaderRate = Math.min(option.minimumLeaderRate, leaderRate);
    option.maximumLeaderRate = Math.max(option.maximumLeaderRate, leaderRate);
    option.maximumLeaderComboRate = Math.max(option.maximumLeaderComboRate, averageRate + leaderRate);
    skillRateOptionsByCharacter.set(card.characterId, option);
  }

  if (
    minimumPowerByCharacter.size < MEDLEY_TEAM_SIZE
    || maximumPowerByCharacter.size < MEDLEY_TEAM_SIZE
    || skillRateOptionsByCharacter.size < MEDLEY_TEAM_SIZE
  ) {
    return null;
  }

  const powerLowerBound = [...minimumPowerByCharacter.values()]
    .sort((left, right) => left - right)
    .slice(0, MEDLEY_TEAM_SIZE)
    .reduce((sum, value) => sum + value, 0);
  const powerUpperBound = [...maximumPowerByCharacter.values()]
    .sort((left, right) => right - left)
    .slice(0, MEDLEY_TEAM_SIZE)
    .reduce((sum, value) => sum + value, 0);
  const skillRateBounds = estimateMedleyContextBoundSkillRateBounds(skillRateOptionsByCharacter);
  if (skillRateBounds === null) {
    return null;
  }

  if (
    !Number.isFinite(powerLowerBound)
    || !Number.isFinite(powerUpperBound)
    || !Number.isFinite(skillRateBounds.skillLowerBound)
    || !Number.isFinite(skillRateBounds.skillUpperBound)
  ) {
    return null;
  }

  return {
    powerLowerBound,
    powerUpperBound,
    averageRateLowerBound: skillRateBounds.averageLowerBound,
    averageRateUpperBound: skillRateBounds.averageUpperBound,
    leaderRateLowerBound: skillRateBounds.leaderLowerBound,
    leaderRateUpperBound: skillRateBounds.leaderUpperBound,
    skillRateLowerBound: skillRateBounds.skillLowerBound,
    skillRateUpperBound: skillRateBounds.skillUpperBound,
  };
}

function estimateMedleyContextBoundSkillRateBounds(
  optionsByCharacter: Map<number, {
    minimumAverageRate: number;
    maximumAverageRate: number;
    minimumLeaderRate: number;
    maximumLeaderRate: number;
    maximumLeaderComboRate: number;
  }>,
): MedleyContextBoundSkillRateBounds | null {
  const minAverageStates = new Float64Array(MEDLEY_TEAM_SIZE + 1);
  minAverageStates.fill(Number.POSITIVE_INFINITY);
  minAverageStates[0] = 0;
  const maxAverageStates = new Float64Array(MEDLEY_TEAM_SIZE + 1);
  maxAverageStates.fill(Number.NEGATIVE_INFINITY);
  maxAverageStates[0] = 0;

  const maxSkillStates = new Float64Array((MEDLEY_TEAM_SIZE + 1) * 2);
  maxSkillStates.fill(Number.NEGATIVE_INFINITY);
  maxSkillStates[0] = 0;
  let leaderUpperBound = 0;
  const minimumLeaderRatesByCharacter: number[] = [];

  for (const option of optionsByCharacter.values()) {
    const nextMinAverageStates = minAverageStates.slice();
    const nextMaxAverageStates = maxAverageStates.slice();
    const nextMaxSkillStates = maxSkillStates.slice();
    if (Number.isFinite(option.minimumLeaderRate)) {
      minimumLeaderRatesByCharacter.push(option.minimumLeaderRate);
    }
    leaderUpperBound = Math.max(leaderUpperBound, option.maximumLeaderRate);

    for (let count = 0; count < MEDLEY_TEAM_SIZE; count += 1) {
      const currentMinAverage = minAverageStates[count];
      if (Number.isFinite(currentMinAverage) && Number.isFinite(option.minimumAverageRate)) {
        nextMinAverageStates[count + 1] = Math.min(
          nextMinAverageStates[count + 1],
          currentMinAverage + option.minimumAverageRate,
        );
      }
      const currentMaxAverage = maxAverageStates[count];
      if (Number.isFinite(currentMaxAverage) && Number.isFinite(option.maximumAverageRate)) {
        nextMaxAverageStates[count + 1] = Math.max(
          nextMaxAverageStates[count + 1],
          currentMaxAverage + option.maximumAverageRate,
        );
      }

      for (let leaderUsed = 0; leaderUsed <= 1; leaderUsed += 1) {
        const currentMaxSkill = maxSkillStates[count * 2 + leaderUsed];
        if (!Number.isFinite(currentMaxSkill)) {
          continue;
        }
        if (Number.isFinite(option.maximumAverageRate)) {
          const nonLeaderIndex = (count + 1) * 2 + leaderUsed;
          nextMaxSkillStates[nonLeaderIndex] = Math.max(
            nextMaxSkillStates[nonLeaderIndex],
            currentMaxSkill + option.maximumAverageRate,
          );
        }
        if (leaderUsed === 0 && Number.isFinite(option.maximumLeaderComboRate)) {
          const leaderIndex = (count + 1) * 2 + 1;
          nextMaxSkillStates[leaderIndex] = Math.max(
            nextMaxSkillStates[leaderIndex],
            currentMaxSkill + option.maximumLeaderComboRate,
          );
        }
      }
    }

    minAverageStates.set(nextMinAverageStates);
    maxAverageStates.set(nextMaxAverageStates);
    maxSkillStates.set(nextMaxSkillStates);
  }

  const averageLowerBound = minAverageStates[MEDLEY_TEAM_SIZE];
  const averageUpperBound = maxAverageStates[MEDLEY_TEAM_SIZE];
  const skillUpperBound = maxSkillStates[MEDLEY_TEAM_SIZE * 2 + 1];
  minimumLeaderRatesByCharacter.sort((left, right) => left - right);
  const leaderLowerBound = minimumLeaderRatesByCharacter.length >= MEDLEY_TEAM_SIZE
    ? minimumLeaderRatesByCharacter[MEDLEY_TEAM_SIZE - 1]
    : Number.POSITIVE_INFINITY;
  const skillLowerBound = averageLowerBound + leaderLowerBound;
  return (
    Number.isFinite(averageLowerBound)
    && Number.isFinite(averageUpperBound)
    && Number.isFinite(leaderUpperBound)
    && Number.isFinite(skillLowerBound)
    && Number.isFinite(skillUpperBound)
  )
    ? {
      averageLowerBound,
      averageUpperBound,
      leaderLowerBound,
      leaderUpperBound,
      skillLowerBound,
      skillUpperBound,
    }
    : null;
}

function estimateMedleyCapacityContextBoundMcCormickScoreUpperBoundForCombination(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  slotBounds: MedleyContextBoundMcCormickSlotBounds[],
  constraintMask: number,
): number | null {
  const slotCount = remainingSlotIndices.length;
  const maskCount = 1 << slotCount;
  const leaderMaskCount = 1 << slotCount;
  const targetLeaderMask = leaderMaskCount - 1;
  const transition = getMedleyCapacityTransition(slotCount);
  const powerCoefficientBySlot: number[] = [];
  const skillMultiplierBySlot: number[] = [];
  let constantTerm = 0;

  for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
    const slot = slots[remainingSlotIndices[slotPosition]];
    const bounds = slotBounds[slotPosition];
    if ((constraintMask & (1 << slotPosition)) !== 0) {
      powerCoefficientBySlot.push(slot.baseScoreRatePerPower + bounds.skillRateUpperBound);
      skillMultiplierBySlot.push(bounds.powerLowerBound);
      constantTerm -= bounds.powerLowerBound * bounds.skillRateUpperBound;
    } else {
      powerCoefficientBySlot.push(slot.baseScoreRatePerPower + bounds.skillRateLowerBound);
      skillMultiplierBySlot.push(bounds.powerUpperBound);
      constantTerm -= bounds.powerUpperBound * bounds.skillRateLowerBound;
    }
  }

  let states = new Float64Array(transition.stateCount * leaderMaskCount);
  states.fill(Number.NEGATIVE_INFINITY);
  states[0] = 0;

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptions = new Float64Array(maskCount * leaderMaskCount);
    characterOptions.fill(Number.NEGATIVE_INFINITY);
    characterOptions[0] = 0;

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptions = characterOptions.slice();
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
          const currentValue = characterOptions[mask * leaderMaskCount + leaderMask];
          if (!Number.isFinite(currentValue)) {
            continue;
          }
          for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
            if ((mask & (1 << slotPosition)) !== 0) {
              continue;
            }
            const card = slotCards[slotPosition];
            if (!card) {
              continue;
            }
            const contextBoundUpper = contextBoundUpperBySlot[slotPosition];
            const averageRate = contextBoundUpper.averageRateUpperByCardId.get(card.cardId);
            if (averageRate === undefined || !Number.isFinite(averageRate)) {
              continue;
            }

            const nextMask = mask | (1 << slotPosition);
            const baseContribution = card.effectivePower * powerCoefficientBySlot[slotPosition]
              + skillMultiplierBySlot[slotPosition] * averageRate;
            const nextIndex = nextMask * leaderMaskCount + leaderMask;
            nextCharacterOptions[nextIndex] = Math.max(
              nextCharacterOptions[nextIndex],
              currentValue + baseContribution,
            );

            const leaderBit = 1 << slotPosition;
            if ((leaderMask & leaderBit) === 0) {
              const leaderRate = contextBoundUpper.leaderRateUpperByCardId.get(card.cardId);
              if (leaderRate === undefined || !Number.isFinite(leaderRate)) {
                continue;
              }
              const nextLeaderMask = leaderMask | leaderBit;
              const leaderIndex = nextMask * leaderMaskCount + nextLeaderMask;
              nextCharacterOptions[leaderIndex] = Math.max(
                nextCharacterOptions[leaderIndex],
                currentValue + baseContribution + skillMultiplierBySlot[slotPosition] * leaderRate,
              );
            }
          }
        }
      }
      characterOptions = nextCharacterOptions;
    }

    const nextStates = states.slice();
    for (let stateIndex = 0; stateIndex < transition.stateCount; stateIndex += 1) {
      for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
        const currentValue = states[stateIndex * leaderMaskCount + leaderMask];
        if (!Number.isFinite(currentValue)) {
          continue;
        }
        for (let characterMask = 1; characterMask < maskCount; characterMask += 1) {
          const nextStateIndex = transition.nextIndexByMask[stateIndex * maskCount + characterMask];
          if (nextStateIndex < 0) {
            continue;
          }
          for (let characterLeaderMask = 0; characterLeaderMask < leaderMaskCount; characterLeaderMask += 1) {
            if (
              (characterLeaderMask & ~characterMask) !== 0
              || (leaderMask & characterLeaderMask) !== 0
            ) {
              continue;
            }
            const characterValue = characterOptions[characterMask * leaderMaskCount + characterLeaderMask];
            if (!Number.isFinite(characterValue)) {
              continue;
            }
            const nextLeaderMask = leaderMask | characterLeaderMask;
            const nextIndex = nextStateIndex * leaderMaskCount + nextLeaderMask;
            nextStates[nextIndex] = Math.max(nextStates[nextIndex], currentValue + characterValue);
          }
        }
      }
    }
    states = nextStates;
  }

  const upperBound = states[transition.targetIndex * leaderMaskCount + targetLeaderMask] + constantTerm;
  return Number.isFinite(upperBound) ? upperBound : null;
}

function estimateMedleyCapacityContextBoundLinearScoreUpperBound(
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  powerCoefficientBySlot: number[],
  averageRateMultiplierBySlot: number[],
  leaderRateMultiplierBySlot: number[],
  constantTerm: number,
): number | null {
  const slotCount = remainingSlotIndices.length;
  const maskCount = 1 << slotCount;
  const leaderMaskCount = 1 << slotCount;
  const targetLeaderMask = leaderMaskCount - 1;
  const transition = getMedleyCapacityTransition(slotCount);
  let states = new Float64Array(transition.stateCount * leaderMaskCount);
  states.fill(Number.NEGATIVE_INFINITY);
  states[0] = 0;

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptions = new Float64Array(maskCount * leaderMaskCount);
    characterOptions.fill(Number.NEGATIVE_INFINITY);
    characterOptions[0] = 0;

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptions = characterOptions.slice();
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
          const currentValue = characterOptions[mask * leaderMaskCount + leaderMask];
          if (!Number.isFinite(currentValue)) {
            continue;
          }
          for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
            if ((mask & (1 << slotPosition)) !== 0) {
              continue;
            }
            const card = slotCards[slotPosition];
            if (!card) {
              continue;
            }
            const contextBoundUpper = contextBoundUpperBySlot[slotPosition];
            const averageRate = contextBoundUpper.averageRateUpperByCardId.get(card.cardId);
            if (averageRate === undefined || !Number.isFinite(averageRate)) {
              continue;
            }

            const nextMask = mask | (1 << slotPosition);
            const baseContribution = card.effectivePower * powerCoefficientBySlot[slotPosition]
              + averageRateMultiplierBySlot[slotPosition] * averageRate;
            const nextIndex = nextMask * leaderMaskCount + leaderMask;
            nextCharacterOptions[nextIndex] = Math.max(
              nextCharacterOptions[nextIndex],
              currentValue + baseContribution,
            );

            const leaderBit = 1 << slotPosition;
            if ((leaderMask & leaderBit) === 0) {
              const leaderRate = contextBoundUpper.leaderRateUpperByCardId.get(card.cardId);
              if (leaderRate === undefined || !Number.isFinite(leaderRate)) {
                continue;
              }
              const nextLeaderMask = leaderMask | leaderBit;
              const leaderIndex = nextMask * leaderMaskCount + nextLeaderMask;
              nextCharacterOptions[leaderIndex] = Math.max(
                nextCharacterOptions[leaderIndex],
                currentValue + baseContribution + leaderRateMultiplierBySlot[slotPosition] * leaderRate,
              );
            }
          }
        }
      }
      characterOptions = nextCharacterOptions;
    }

    const nextStates = states.slice();
    for (let stateIndex = 0; stateIndex < transition.stateCount; stateIndex += 1) {
      for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
        const currentValue = states[stateIndex * leaderMaskCount + leaderMask];
        if (!Number.isFinite(currentValue)) {
          continue;
        }
        for (let characterMask = 1; characterMask < maskCount; characterMask += 1) {
          const nextStateIndex = transition.nextIndexByMask[stateIndex * maskCount + characterMask];
          if (nextStateIndex < 0) {
            continue;
          }
          for (let characterLeaderMask = 0; characterLeaderMask < leaderMaskCount; characterLeaderMask += 1) {
            if (
              (characterLeaderMask & ~characterMask) !== 0
              || (leaderMask & characterLeaderMask) !== 0
            ) {
              continue;
            }
            const characterValue = characterOptions[characterMask * leaderMaskCount + characterLeaderMask];
            if (!Number.isFinite(characterValue)) {
              continue;
            }
            const nextLeaderMask = leaderMask | characterLeaderMask;
            const nextIndex = nextStateIndex * leaderMaskCount + nextLeaderMask;
            nextStates[nextIndex] = Math.max(nextStates[nextIndex], currentValue + characterValue);
          }
        }
      }
    }
    states = nextStates;
  }

  const upperBound = states[transition.targetIndex * leaderMaskCount + targetLeaderMask] + constantTerm;
  return Number.isFinite(upperBound) ? upperBound : null;
}

function estimateMedleyCapacityContextBoundSplitSkillMcCormickScoreUpperBoundForCombination(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  slotBounds: MedleyContextBoundMcCormickSlotBounds[],
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  if (profiling) {
    profiling.capacityContextBoundSplitSkillMcCormickUpperCallCount += 1;
  }
  const slotCount = remainingSlotIndices.length;
  const maskCount = 1 << slotCount;
  let upperBound = Number.POSITIVE_INFINITY;

  for (let averageConstraintMask = 0; averageConstraintMask < maskCount; averageConstraintMask += 1) {
    for (let leaderConstraintMask = 0; leaderConstraintMask < maskCount; leaderConstraintMask += 1) {
      const powerCoefficientBySlot: number[] = [];
      const averageRateMultiplierBySlot: number[] = [];
      const leaderRateMultiplierBySlot: number[] = [];
      let constantTerm = 0;
      for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
        const slot = slots[remainingSlotIndices[slotPosition]];
        const bounds = slotBounds[slotPosition];
        let powerCoefficient = slot.baseScoreRatePerPower;
        let averageRateMultiplier = 0;
        let leaderRateMultiplier = 0;

        if ((averageConstraintMask & (1 << slotPosition)) !== 0) {
          powerCoefficient += bounds.averageRateUpperBound;
          averageRateMultiplier += bounds.powerLowerBound;
          constantTerm -= bounds.powerLowerBound * bounds.averageRateUpperBound;
        } else {
          powerCoefficient += bounds.averageRateLowerBound;
          averageRateMultiplier += bounds.powerUpperBound;
          constantTerm -= bounds.powerUpperBound * bounds.averageRateLowerBound;
        }

        if ((leaderConstraintMask & (1 << slotPosition)) !== 0) {
          powerCoefficient += bounds.leaderRateUpperBound;
          leaderRateMultiplier += bounds.powerLowerBound;
          constantTerm -= bounds.powerLowerBound * bounds.leaderRateUpperBound;
        } else {
          powerCoefficient += bounds.leaderRateLowerBound;
          leaderRateMultiplier += bounds.powerUpperBound;
          constantTerm -= bounds.powerUpperBound * bounds.leaderRateLowerBound;
        }

        powerCoefficientBySlot.push(powerCoefficient);
        averageRateMultiplierBySlot.push(averageRateMultiplier);
        leaderRateMultiplierBySlot.push(leaderRateMultiplier);
      }

      const estimate = estimateMedleyCapacityContextBoundLinearScoreUpperBound(
        remainingSlotIndices,
        cardsByCharacter,
        contextBoundUpperBySlot,
        powerCoefficientBySlot,
        averageRateMultiplierBySlot,
        leaderRateMultiplierBySlot,
        constantTerm,
      );
      if (estimate !== null && Number.isFinite(estimate)) {
        upperBound = Math.min(upperBound, estimate);
      }
    }
  }

  if (!Number.isFinite(upperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextBoundSplitSkillMcCormickUpperCompletedCount += 1;
  }
  return upperBound;
}

function addMedleyCapacitySkillSplitState(
  states: Map<number, number>,
  splitSkillRate: number,
  score: number,
): void {
  const currentScore = states.get(splitSkillRate);
  if (currentScore === undefined || score > currentScore) {
    states.set(splitSkillRate, score);
  }
}

function cloneMedleyCapacitySkillSplitStateMap(states: Map<number, number>): Map<number, number> {
  return new Map(states);
}

function estimateMedleyCapacityContextBoundTeamSharedCoefficientUpperBoundForInterval(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  slotBounds: MedleyContextBoundMcCormickSlotBounds[],
  splitSlotPosition: number,
  splitSkillLowerBound: number,
  splitSkillUpperBound: number,
  constraintMask: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  const slotCount = remainingSlotIndices.length;
  const maskCount = 1 << slotCount;
  const leaderMaskCount = 1 << slotCount;
  const targetLeaderMask = leaderMaskCount - 1;
  const transition = getMedleyCapacityTransition(slotCount);
  const powerCoefficientBySlot: number[] = [];
  const skillMultiplierBySlot: number[] = [];
  let constantTerm = 0;
  let processedStateCount = 0;

  const abort = (): null => {
    if (profiling) {
      profiling.capacityTeamSharedCoefficientUpperAbortCount += 1;
      profiling.capacityTeamSharedCoefficientUpperStateCount += processedStateCount;
    }
    return null;
  };
  const accountState = (): boolean => {
    processedStateCount += 1;
    const totalStateCount = processedStateCount
      + (profiling?.capacityTeamSharedCoefficientUpperStateCount ?? 0);
    return (
      processedStateCount <= MEDLEY_TEAM_SHARED_COEFFICIENT_STATE_BUDGET
      && totalStateCount <= MEDLEY_TEAM_SHARED_COEFFICIENT_GLOBAL_STATE_BUDGET
    );
  };

  for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
    const slot = slots[remainingSlotIndices[slotPosition]];
    const bounds = slotBounds[slotPosition];
    const skillLowerBound = slotPosition === splitSlotPosition
      ? splitSkillLowerBound
      : bounds.skillRateLowerBound;
    const skillUpperBound = slotPosition === splitSlotPosition
      ? splitSkillUpperBound
      : bounds.skillRateUpperBound;

    if ((constraintMask & (1 << slotPosition)) !== 0) {
      powerCoefficientBySlot.push(slot.baseScoreRatePerPower + skillUpperBound);
      skillMultiplierBySlot.push(bounds.powerLowerBound);
      constantTerm -= bounds.powerLowerBound * skillUpperBound;
    } else {
      powerCoefficientBySlot.push(slot.baseScoreRatePerPower + skillLowerBound);
      skillMultiplierBySlot.push(bounds.powerUpperBound);
      constantTerm -= bounds.powerUpperBound * skillLowerBound;
    }
  }

  let statesByIndexAndLeaderMask: Array<Map<number, number>> = Array.from(
    { length: transition.stateCount * leaderMaskCount },
    () => new Map<number, number>(),
  );
  statesByIndexAndLeaderMask[0].set(0, 0);

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptions: Array<Map<number, number>> = Array.from(
      { length: maskCount * leaderMaskCount },
      () => new Map<number, number>(),
    );
    characterOptions[0].set(0, 0);

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptions = characterOptions.map(cloneMedleyCapacitySkillSplitStateMap);
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
          const currentStates = characterOptions[mask * leaderMaskCount + leaderMask];
          if (currentStates.size === 0) {
            continue;
          }
          for (const [splitSkillRate, currentValue] of currentStates.entries()) {
            for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
              if ((mask & (1 << slotPosition)) !== 0) {
                continue;
              }
              const card = slotCards[slotPosition];
              if (!card) {
                continue;
              }
              const contextBoundUpper = contextBoundUpperBySlot[slotPosition];
              const averageRate = contextBoundUpper.averageRateUpperByCardId.get(card.cardId);
              if (averageRate === undefined || !Number.isFinite(averageRate)) {
                continue;
              }

              const nextMask = mask | (1 << slotPosition);
              const averageSplitSkillRate = slotPosition === splitSlotPosition
                ? splitSkillRate + averageRate
                : splitSkillRate;
              const baseContribution = card.effectivePower * powerCoefficientBySlot[slotPosition]
                + skillMultiplierBySlot[slotPosition] * averageRate;
              if (!accountState()) {
                return abort();
              }
              addMedleyCapacitySkillSplitState(
                nextCharacterOptions[nextMask * leaderMaskCount + leaderMask],
                averageSplitSkillRate,
                currentValue + baseContribution,
              );

              const leaderBit = 1 << slotPosition;
              if ((leaderMask & leaderBit) === 0) {
                const leaderRate = contextBoundUpper.leaderRateUpperByCardId.get(card.cardId);
                if (leaderRate === undefined || !Number.isFinite(leaderRate)) {
                  continue;
                }
                const nextLeaderMask = leaderMask | leaderBit;
                const leaderSplitSkillRate = slotPosition === splitSlotPosition
                  ? splitSkillRate + averageRate + leaderRate
                  : splitSkillRate;
                if (!accountState()) {
                  return abort();
                }
                addMedleyCapacitySkillSplitState(
                  nextCharacterOptions[nextMask * leaderMaskCount + nextLeaderMask],
                  leaderSplitSkillRate,
                  currentValue + baseContribution + skillMultiplierBySlot[slotPosition] * leaderRate,
                );
              }
            }
          }
        }
      }
      characterOptions = nextCharacterOptions;
    }

    const nextStatesByIndexAndLeaderMask = statesByIndexAndLeaderMask
      .map(cloneMedleyCapacitySkillSplitStateMap);
    for (let stateIndex = 0; stateIndex < transition.stateCount; stateIndex += 1) {
      for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
        const states = statesByIndexAndLeaderMask[stateIndex * leaderMaskCount + leaderMask];
        if (states.size === 0) {
          continue;
        }
        for (let characterMask = 1; characterMask < maskCount; characterMask += 1) {
          const nextStateIndex = transition.nextIndexByMask[stateIndex * maskCount + characterMask];
          if (nextStateIndex < 0) {
            continue;
          }
          for (let characterLeaderMask = 0; characterLeaderMask < leaderMaskCount; characterLeaderMask += 1) {
            if (
              (characterLeaderMask & ~characterMask) !== 0
              || (leaderMask & characterLeaderMask) !== 0
            ) {
              continue;
            }
            const options = characterOptions[characterMask * leaderMaskCount + characterLeaderMask];
            if (options.size === 0) {
              continue;
            }
            const nextLeaderMask = leaderMask | characterLeaderMask;
            const nextStates = nextStatesByIndexAndLeaderMask[nextStateIndex * leaderMaskCount + nextLeaderMask];
            for (const [splitSkillRate, currentValue] of states.entries()) {
              for (const [optionSplitSkillRate, optionValue] of options.entries()) {
                if (!accountState()) {
                  return abort();
                }
                addMedleyCapacitySkillSplitState(
                  nextStates,
                  splitSkillRate + optionSplitSkillRate,
                  currentValue + optionValue,
                );
              }
            }
          }
        }
      }
    }
    statesByIndexAndLeaderMask = nextStatesByIndexAndLeaderMask;
  }

  const targetStates = statesByIndexAndLeaderMask[transition.targetIndex * leaderMaskCount + targetLeaderMask];
  let upperBound = Number.NEGATIVE_INFINITY;
  const epsilon = 1e-9;
  for (const [splitSkillRate, score] of targetStates.entries()) {
    if (splitSkillRate + epsilon < splitSkillLowerBound || splitSkillRate - epsilon > splitSkillUpperBound) {
      continue;
    }
    upperBound = Math.max(upperBound, score + constantTerm);
  }
  if (profiling) {
    profiling.capacityTeamSharedCoefficientUpperStateCount += processedStateCount;
  }
  return Number.isFinite(upperBound) ? upperBound : Number.NEGATIVE_INFINITY;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function estimateMedleyCapacityContextBoundTeamSharedCoefficientUpperBoundForCombination(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  slotBounds: MedleyContextBoundMcCormickSlotBounds[],
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  if (profiling) {
    profiling.capacityTeamSharedCoefficientUpperCallCount += 1;
    if (
      profiling.capacityTeamSharedCoefficientUpperStateCount
        >= MEDLEY_TEAM_SHARED_COEFFICIENT_GLOBAL_STATE_BUDGET
    ) {
      profiling.capacityTeamSharedCoefficientUpperAbortCount += 1;
      return null;
    }
  }

  const splitSlotPosition = slotBounds
    .map((bounds, slotPosition) => ({
      slotPosition,
      potential: (bounds.skillRateUpperBound - bounds.skillRateLowerBound) * bounds.powerUpperBound,
    }))
    .sort((left, right) => right.potential - left.potential)[0]?.slotPosition;
  if (splitSlotPosition === undefined) {
    return null;
  }

  const splitBounds = slotBounds[splitSlotPosition];
  if (splitBounds.skillRateUpperBound <= splitBounds.skillRateLowerBound) {
    return null;
  }

  const intervalWidth = (splitBounds.skillRateUpperBound - splitBounds.skillRateLowerBound)
    / MEDLEY_TEAM_SHARED_COEFFICIENT_INTERVAL_COUNT;
  let upperBound = Number.NEGATIVE_INFINITY;
  for (let intervalIndex = 0; intervalIndex < MEDLEY_TEAM_SHARED_COEFFICIENT_INTERVAL_COUNT; intervalIndex += 1) {
    const intervalLowerBound = intervalIndex === 0
      ? splitBounds.skillRateLowerBound
      : splitBounds.skillRateLowerBound + intervalWidth * intervalIndex;
    const intervalUpperBound = intervalIndex === MEDLEY_TEAM_SHARED_COEFFICIENT_INTERVAL_COUNT - 1
      ? splitBounds.skillRateUpperBound
      : splitBounds.skillRateLowerBound + intervalWidth * (intervalIndex + 1);
    let intervalUpper = Number.POSITIVE_INFINITY;
    for (let constraintMask = 0; constraintMask < (1 << remainingSlotIndices.length); constraintMask += 1) {
      const estimate = estimateMedleyCapacityContextBoundTeamSharedCoefficientUpperBoundForInterval(
        slots,
        remainingSlotIndices,
        cardsByCharacter,
        contextBoundUpperBySlot,
        slotBounds,
        splitSlotPosition,
        intervalLowerBound,
        intervalUpperBound,
        constraintMask,
        profiling,
      );
      if (estimate === null) {
        return null;
      }
      if (Number.isFinite(estimate)) {
        intervalUpper = Math.min(intervalUpper, estimate);
      }
    }
    if (Number.isFinite(intervalUpper)) {
      upperBound = Math.max(upperBound, intervalUpper);
    }
  }

  if (!Number.isFinite(upperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityTeamSharedCoefficientUpperCompletedCount += 1;
  }
  return upperBound;
}

function estimateMedleyContextBoundSingleSlotScoreUpperBound(
  slot: MedleySlotSearch,
  contextBoundUpper: MedleyContextBoundUpperGroup,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  type SlotState = {
    power: number;
    averageRate: number;
    leaderRate: number;
  };
  const addState = (states: SlotState[], nextState: SlotState): void => {
    for (const state of states) {
      if (
        state.power >= nextState.power
        && state.averageRate >= nextState.averageRate
        && state.leaderRate >= nextState.leaderRate
      ) {
        return;
      }
    }
    for (let index = states.length - 1; index >= 0; index -= 1) {
      const state = states[index];
      if (
        nextState.power >= state.power
        && nextState.averageRate >= state.averageRate
        && nextState.leaderRate >= state.leaderRate
      ) {
        states.splice(index, 1);
      }
    }
    states.push(nextState);
  };

  const cardsByCharacter = new Map<number, SearchCard[]>();
  for (const card of slot.searchCards) {
    if (!contextBoundUpper.averageRateUpperByCardId.has(card.cardId)) {
      continue;
    }
    const cards = cardsByCharacter.get(card.characterId) ?? [];
    cards.push(card);
    cardsByCharacter.set(card.characterId, cards);
  }
  if (cardsByCharacter.size < MEDLEY_TEAM_SIZE) {
    return null;
  }

  let statesByCount: SlotState[][] = Array.from({ length: MEDLEY_TEAM_SIZE + 1 }, () => []);
  statesByCount[0].push({ power: 0, averageRate: 0, leaderRate: 0 });
  for (const cards of cardsByCharacter.values()) {
    const nextStatesByCount = statesByCount.map((states) => [...states]);
    for (let count = 0; count < MEDLEY_TEAM_SIZE; count += 1) {
      for (const state of statesByCount[count]) {
        for (const card of cards) {
          const averageRate = contextBoundUpper.averageRateUpperByCardId.get(card.cardId);
          const leaderRate = contextBoundUpper.leaderRateUpperByCardId.get(card.cardId);
          if (
            averageRate === undefined
            || leaderRate === undefined
            || !Number.isFinite(averageRate)
            || !Number.isFinite(leaderRate)
          ) {
            continue;
          }
          addState(nextStatesByCount[count + 1], {
            power: state.power + card.effectivePower,
            averageRate: state.averageRate + averageRate,
            leaderRate: Math.max(state.leaderRate, leaderRate),
          });
        }
      }
    }
    statesByCount = nextStatesByCount;
  }

  const finalStates = statesByCount[MEDLEY_TEAM_SIZE];
  if (profiling) {
    profiling.capacityTeamSharedCoefficientUpperStateCount += statesByCount.reduce(
      (sum, states) => sum + states.length,
      0,
    );
  }
  const upperBound = finalStates.reduce((best, state) => Math.max(
    best,
    Math.floor(state.power) * (slot.baseScoreRatePerPower + state.averageRate + state.leaderRate),
  ), Number.NEGATIVE_INFINITY);
  return Number.isFinite(upperBound) ? upperBound : null;
}

function estimateMedleyCapacityContextBoundSingleSlotExactScoreUpperBoundForCombination(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  if (remainingSlotIndices.length !== MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityTeamSharedCoefficientUpperCallCount += 1;
  }

  let upperBound = Number.POSITIVE_INFINITY;
  for (let exactSlotPosition = 0; exactSlotPosition < remainingSlotIndices.length; exactSlotPosition += 1) {
    const exactSlotUpper = estimateMedleyContextBoundSingleSlotScoreUpperBound(
      slots[remainingSlotIndices[exactSlotPosition]],
      contextBoundUpperBySlot[exactSlotPosition],
      profiling,
    );
    if (exactSlotUpper === null || !Number.isFinite(exactSlotUpper)) {
      continue;
    }

    const pairSlotIndices = remainingSlotIndices.filter((_, slotPosition) => slotPosition !== exactSlotPosition);
    const pairContextBoundUpperBySlot = contextBoundUpperBySlot.filter((_, slotPosition) => slotPosition !== exactSlotPosition);
    const pairCardsByCharacter = buildMedleyCapacityCardsByCharacter(slots, pairSlotIndices, bannedCardIds);
    const pairSlotBounds = pairContextBoundUpperBySlot.map((contextBoundUpper, slotPosition) => (
      estimateMedleyContextBoundMcCormickSlotBounds(
        slots[pairSlotIndices[slotPosition]],
        contextBoundUpper,
      )
    ));
    if (!pairSlotBounds.every((bounds): bounds is MedleyContextBoundMcCormickSlotBounds => bounds !== null)) {
      continue;
    }

    let pairUpper = Number.POSITIVE_INFINITY;
    for (let constraintMask = 0; constraintMask < (1 << pairSlotIndices.length); constraintMask += 1) {
      const estimate = estimateMedleyCapacityContextBoundMcCormickScoreUpperBoundForCombination(
        slots,
        pairSlotIndices,
        pairCardsByCharacter,
        pairContextBoundUpperBySlot,
        pairSlotBounds,
        constraintMask,
      );
      if (estimate !== null && Number.isFinite(estimate)) {
        pairUpper = Math.min(pairUpper, estimate);
      }
    }
    if (Number.isFinite(pairUpper)) {
      upperBound = Math.min(upperBound, exactSlotUpper + pairUpper);
    }
  }

  if (!Number.isFinite(upperBound)) {
    if (profiling) {
      profiling.capacityTeamSharedCoefficientUpperAbortCount += 1;
    }
    return null;
  }
  if (profiling) {
    profiling.capacityTeamSharedCoefficientUpperCompletedCount += 1;
  }
  return upperBound;
}

function buildMedleyContextBoundCardBoundPowerUpperBySlot(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
): MedleyCardBoundPowerUpperBySlot {
  return remainingSlotIndices.map((slotIndex, slotPosition) => {
    const slot = slots[slotIndex];
    const contextBoundUpper = contextBoundUpperBySlot[slotPosition];
    const bestPowerByCharacter = new Map<number, number>();
    for (const card of slot.searchCards) {
      if (!contextBoundUpper.averageRateUpperByCardId.has(card.cardId)) {
        continue;
      }
      bestPowerByCharacter.set(
        card.characterId,
        Math.max(bestPowerByCharacter.get(card.characterId) ?? Number.NEGATIVE_INFINITY, card.effectivePower),
      );
    }

    const sortedCharacterPowers = [...bestPowerByCharacter.entries()]
      .sort((left, right) => right[1] - left[1]);
    const powerUpperByCardId = new Map<number, number>();
    for (const card of slot.searchCards) {
      if (!contextBoundUpper.averageRateUpperByCardId.has(card.cardId)) {
        continue;
      }
      let otherPower = 0;
      let otherCharacterCount = 0;
      for (const [characterId, power] of sortedCharacterPowers) {
        if (characterId === card.characterId) {
          continue;
        }
        otherPower += power;
        otherCharacterCount += 1;
        if (otherCharacterCount === MEDLEY_TEAM_SIZE - 1) {
          break;
        }
      }
      if (otherCharacterCount === MEDLEY_TEAM_SIZE - 1) {
        powerUpperByCardId.set(card.cardId, card.effectivePower + otherPower);
      }
    }
    return powerUpperByCardId;
  });
}

function estimateMedleyCapacityContextBoundCardBoundScoreUpperBoundForCombination(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  if (profiling) {
    profiling.capacityContextBoundCardBoundUpperCallCount += 1;
  }
  const slotCount = remainingSlotIndices.length;
  const maskCount = 1 << slotCount;
  const leaderMaskCount = 1 << slotCount;
  const targetLeaderMask = leaderMaskCount - 1;
  const transition = getMedleyCapacityTransition(slotCount);
  const cardBoundPowerUpperBySlot = buildMedleyContextBoundCardBoundPowerUpperBySlot(
    slots,
    remainingSlotIndices,
    contextBoundUpperBySlot,
  );
  let states = new Float64Array(transition.stateCount * leaderMaskCount);
  states.fill(Number.NEGATIVE_INFINITY);
  states[0] = 0;

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptions = new Float64Array(maskCount * leaderMaskCount);
    characterOptions.fill(Number.NEGATIVE_INFINITY);
    characterOptions[0] = 0;

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptions = characterOptions.slice();
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
          const currentValue = characterOptions[mask * leaderMaskCount + leaderMask];
          if (!Number.isFinite(currentValue)) {
            continue;
          }
          for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
            if ((mask & (1 << slotPosition)) !== 0) {
              continue;
            }
            const card = slotCards[slotPosition];
            if (!card) {
              continue;
            }
            const contextBoundUpper = contextBoundUpperBySlot[slotPosition];
            const averageRate = contextBoundUpper.averageRateUpperByCardId.get(card.cardId);
            if (averageRate === undefined || !Number.isFinite(averageRate)) {
              continue;
            }
            const cardBoundPowerUpper = cardBoundPowerUpperBySlot[slotPosition].get(card.cardId);
            if (cardBoundPowerUpper === undefined || !Number.isFinite(cardBoundPowerUpper)) {
              continue;
            }

            const nextMask = mask | (1 << slotPosition);
            const slot = slots[remainingSlotIndices[slotPosition]];
            const averageContribution = card.effectivePower * slot.baseScoreRatePerPower
              + cardBoundPowerUpper * averageRate;
            const nextIndex = nextMask * leaderMaskCount + leaderMask;
            nextCharacterOptions[nextIndex] = Math.max(
              nextCharacterOptions[nextIndex],
              currentValue + averageContribution,
            );

            const leaderBit = 1 << slotPosition;
            if ((leaderMask & leaderBit) === 0) {
              const leaderRate = contextBoundUpper.leaderRateUpperByCardId.get(card.cardId);
              if (leaderRate === undefined || !Number.isFinite(leaderRate)) {
                continue;
              }
              const nextLeaderMask = leaderMask | leaderBit;
              const leaderIndex = nextMask * leaderMaskCount + nextLeaderMask;
              nextCharacterOptions[leaderIndex] = Math.max(
                nextCharacterOptions[leaderIndex],
                currentValue + averageContribution + cardBoundPowerUpper * leaderRate,
              );
            }
          }
        }
      }
      characterOptions = nextCharacterOptions;
    }

    const nextStates = states.slice();
    for (let stateIndex = 0; stateIndex < transition.stateCount; stateIndex += 1) {
      for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
        const currentValue = states[stateIndex * leaderMaskCount + leaderMask];
        if (!Number.isFinite(currentValue)) {
          continue;
        }
        for (let characterMask = 1; characterMask < maskCount; characterMask += 1) {
          const nextStateIndex = transition.nextIndexByMask[stateIndex * maskCount + characterMask];
          if (nextStateIndex < 0) {
            continue;
          }
          for (let characterLeaderMask = 0; characterLeaderMask < leaderMaskCount; characterLeaderMask += 1) {
            if (
              (characterLeaderMask & ~characterMask) !== 0
              || (leaderMask & characterLeaderMask) !== 0
            ) {
              continue;
            }
            const characterValue = characterOptions[characterMask * leaderMaskCount + characterLeaderMask];
            if (!Number.isFinite(characterValue)) {
              continue;
            }
            const nextLeaderMask = leaderMask | characterLeaderMask;
            const nextIndex = nextStateIndex * leaderMaskCount + nextLeaderMask;
            nextStates[nextIndex] = Math.max(nextStates[nextIndex], currentValue + characterValue);
          }
        }
      }
    }
    states = nextStates;
  }

  const upperBound = states[transition.targetIndex * leaderMaskCount + targetLeaderMask];
  if (!Number.isFinite(upperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextBoundCardBoundUpperCompletedCount += 1;
  }
  return upperBound;
}

function addMedleyCapacityPowerSplitState(
  states: Map<number, number>,
  splitPower: number,
  score: number,
): void {
  const currentScore = states.get(splitPower);
  if (currentScore === undefined || score > currentScore) {
    states.set(splitPower, score);
  }
}

function estimateMedleyCapacityContextBoundPowerSplitMcCormickScoreUpperBoundForInterval(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  slotBounds: MedleyContextBoundMcCormickSlotBounds[],
  splitSlotPosition: number,
  splitPowerLowerBound: number,
  splitPowerUpperBound: number,
  constraintMask: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  const slotCount = remainingSlotIndices.length;
  const maskCount = 1 << slotCount;
  const leaderMaskCount = 1 << slotCount;
  const targetLeaderMask = leaderMaskCount - 1;
  const transition = getMedleyCapacityTransition(slotCount);
  const powerCoefficientBySlot: number[] = [];
  const skillMultiplierBySlot: number[] = [];
  let constantTerm = 0;
  let processedStateCount = 0;

  const abort = (): null => {
    if (profiling) {
      profiling.capacityContextBoundPowerSplitMcCormickUpperAbortCount += 1;
      profiling.capacityContextBoundPowerSplitMcCormickUpperStateCount += processedStateCount;
      profiling.capacityContextBoundPowerSplitMcCormickUpperMaxProcessedStateCount = Math.max(
        profiling.capacityContextBoundPowerSplitMcCormickUpperMaxProcessedStateCount,
        processedStateCount,
      );
    }
    return null;
  };
  const accountState = (): boolean => {
    processedStateCount += 1;
    const totalStateCount = processedStateCount
      + (profiling?.capacityContextBoundPowerSplitMcCormickUpperStateCount ?? 0);
    return (
      processedStateCount <= MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_STATE_BUDGET
      && totalStateCount <= MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_GLOBAL_STATE_BUDGET
    );
  };

  for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
    const slot = slots[remainingSlotIndices[slotPosition]];
    const bounds = slotBounds[slotPosition];
    const powerLowerBound = slotPosition === splitSlotPosition ? splitPowerLowerBound : bounds.powerLowerBound;
    const powerUpperBound = slotPosition === splitSlotPosition ? splitPowerUpperBound : bounds.powerUpperBound;
    if ((constraintMask & (1 << slotPosition)) !== 0) {
      powerCoefficientBySlot.push(slot.baseScoreRatePerPower + bounds.skillRateUpperBound);
      skillMultiplierBySlot.push(powerLowerBound);
      constantTerm -= powerLowerBound * bounds.skillRateUpperBound;
    } else {
      powerCoefficientBySlot.push(slot.baseScoreRatePerPower + bounds.skillRateLowerBound);
      skillMultiplierBySlot.push(powerUpperBound);
      constantTerm -= powerUpperBound * bounds.skillRateLowerBound;
    }
  }

  let statesByIndexAndLeaderMask: Array<Map<number, number>> = Array.from(
    { length: transition.stateCount * leaderMaskCount },
    () => new Map<number, number>(),
  );
  statesByIndexAndLeaderMask[0].set(0, 0);

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptions: Array<Map<number, number>> = Array.from(
      { length: maskCount * leaderMaskCount },
      () => new Map<number, number>(),
    );
    characterOptions[0].set(0, 0);

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptions = characterOptions.map(cloneMedleyCapacityBucketedJointStateMap);
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
          const states = characterOptions[mask * leaderMaskCount + leaderMask];
          if (states.size === 0) {
            continue;
          }
          for (const [splitPower, currentValue] of states.entries()) {
            for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
              if ((mask & (1 << slotPosition)) !== 0) {
                continue;
              }
              const card = slotCards[slotPosition];
              if (!card) {
                continue;
              }
              const contextBoundUpper = contextBoundUpperBySlot[slotPosition];
              const averageRate = contextBoundUpper.averageRateUpperByCardId.get(card.cardId);
              if (averageRate === undefined || !Number.isFinite(averageRate)) {
                continue;
              }

              const nextMask = mask | (1 << slotPosition);
              const nextSplitPower = slotPosition === splitSlotPosition
                ? splitPower + card.effectivePower
                : splitPower;
              const baseContribution = card.effectivePower * powerCoefficientBySlot[slotPosition]
                + skillMultiplierBySlot[slotPosition] * averageRate;
              if (!accountState()) {
                return abort();
              }
              addMedleyCapacityPowerSplitState(
                nextCharacterOptions[nextMask * leaderMaskCount + leaderMask],
                nextSplitPower,
                currentValue + baseContribution,
              );

              const leaderBit = 1 << slotPosition;
              if ((leaderMask & leaderBit) === 0) {
                const leaderRate = contextBoundUpper.leaderRateUpperByCardId.get(card.cardId);
                if (leaderRate === undefined || !Number.isFinite(leaderRate)) {
                  continue;
                }
                const nextLeaderMask = leaderMask | leaderBit;
                if (!accountState()) {
                  return abort();
                }
                addMedleyCapacityPowerSplitState(
                  nextCharacterOptions[nextMask * leaderMaskCount + nextLeaderMask],
                  nextSplitPower,
                  currentValue + baseContribution + skillMultiplierBySlot[slotPosition] * leaderRate,
                );
              }
            }
          }
        }
      }
      characterOptions = nextCharacterOptions;
    }

    const nextStatesByIndexAndLeaderMask = statesByIndexAndLeaderMask
      .map(cloneMedleyCapacityBucketedJointStateMap);
    for (let stateIndex = 0; stateIndex < transition.stateCount; stateIndex += 1) {
      for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
        const states = statesByIndexAndLeaderMask[stateIndex * leaderMaskCount + leaderMask];
        if (states.size === 0) {
          continue;
        }
        for (let characterMask = 1; characterMask < maskCount; characterMask += 1) {
          const nextStateIndex = transition.nextIndexByMask[stateIndex * maskCount + characterMask];
          if (nextStateIndex < 0) {
            continue;
          }
          for (let characterLeaderMask = 0; characterLeaderMask < leaderMaskCount; characterLeaderMask += 1) {
            if (
              (characterLeaderMask & ~characterMask) !== 0
              || (leaderMask & characterLeaderMask) !== 0
            ) {
              continue;
            }
            const options = characterOptions[characterMask * leaderMaskCount + characterLeaderMask];
            if (options.size === 0) {
              continue;
            }
            const nextLeaderMask = leaderMask | characterLeaderMask;
            const nextStates = nextStatesByIndexAndLeaderMask[
              nextStateIndex * leaderMaskCount + nextLeaderMask
            ];
            for (const [splitPower, currentValue] of states.entries()) {
              for (const [optionSplitPower, optionValue] of options.entries()) {
                if (!accountState()) {
                  return abort();
                }
                addMedleyCapacityPowerSplitState(
                  nextStates,
                  splitPower + optionSplitPower,
                  currentValue + optionValue,
                );
              }
            }
          }
        }
      }
    }
    statesByIndexAndLeaderMask = nextStatesByIndexAndLeaderMask;
  }

  const targetStates = statesByIndexAndLeaderMask[transition.targetIndex * leaderMaskCount + targetLeaderMask];
  let upperBound = Number.NEGATIVE_INFINITY;
  const epsilon = 1e-6;
  for (const [splitPower, score] of targetStates.entries()) {
    if (splitPower + epsilon < splitPowerLowerBound || splitPower - epsilon > splitPowerUpperBound) {
      continue;
    }
    upperBound = Math.max(upperBound, score + constantTerm);
  }
  if (!Number.isFinite(upperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextBoundPowerSplitMcCormickUpperCompletedCount += 1;
    profiling.capacityContextBoundPowerSplitMcCormickUpperStateCount += processedStateCount;
    profiling.capacityContextBoundPowerSplitMcCormickUpperMaxProcessedStateCount = Math.max(
      profiling.capacityContextBoundPowerSplitMcCormickUpperMaxProcessedStateCount,
      processedStateCount,
    );
  }
  return upperBound;
}

function estimateMedleyCapacityContextBoundPowerSplitMcCormickScoreUpperBoundForCombination(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  slotBounds: MedleyContextBoundMcCormickSlotBounds[],
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  if (profiling) {
    profiling.capacityContextBoundPowerSplitMcCormickUpperCallCount += 1;
    if (
      profiling.capacityContextBoundPowerSplitMcCormickUpperStateCount
        >= MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_GLOBAL_STATE_BUDGET
    ) {
      profiling.capacityContextBoundPowerSplitMcCormickUpperAbortCount += 1;
      return null;
    }
  }

  const splitSlotPosition = slotBounds
    .map((bounds, slotPosition) => ({
      slotPosition,
      potential: (bounds.powerUpperBound - bounds.powerLowerBound) * bounds.skillRateUpperBound,
    }))
    .sort((left, right) => right.potential - left.potential)[0]?.slotPosition;
  if (splitSlotPosition === undefined) {
    return null;
  }

  const splitBounds = slotBounds[splitSlotPosition];
  if (splitBounds.powerUpperBound <= splitBounds.powerLowerBound) {
    return null;
  }

  const intervalWidth = (splitBounds.powerUpperBound - splitBounds.powerLowerBound)
    / MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_BUCKET_COUNT;
  let upperBound = Number.NEGATIVE_INFINITY;
  for (
    let intervalIndex = 0;
    intervalIndex < MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_BUCKET_COUNT;
    intervalIndex += 1
  ) {
    const intervalLowerBound = intervalIndex === 0
      ? splitBounds.powerLowerBound
      : splitBounds.powerLowerBound + intervalWidth * intervalIndex;
    const intervalUpperBound = intervalIndex === MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_BUCKET_COUNT - 1
      ? splitBounds.powerUpperBound
      : splitBounds.powerLowerBound + intervalWidth * (intervalIndex + 1);
    let intervalUpper = Number.POSITIVE_INFINITY;
    for (let constraintMask = 0; constraintMask < (1 << remainingSlotIndices.length); constraintMask += 1) {
      const estimate = estimateMedleyCapacityContextBoundPowerSplitMcCormickScoreUpperBoundForInterval(
        slots,
        remainingSlotIndices,
        cardsByCharacter,
        contextBoundUpperBySlot,
        slotBounds,
        splitSlotPosition,
        intervalLowerBound,
        intervalUpperBound,
        constraintMask,
        profiling,
      );
      if (estimate === null) {
        return null;
      }
      intervalUpper = Math.min(intervalUpper, estimate);
    }
    if (Number.isFinite(intervalUpper)) {
      upperBound = Math.max(upperBound, intervalUpper);
    }
  }

  return Number.isFinite(upperBound) ? upperBound : null;
}

function estimateMedleyCapacityContextBoundMcCormickScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
  enableTeamSharedCoefficientUpper = false,
): number | null {
  if (remainingSlotIndices.length !== MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextBoundMcCormickUpperCallCount += 1;
  }

  const groupsBySlot = remainingSlotIndices.map((slotIndex) => (
    buildMedleyContextBoundUpperGroups(slots[slotIndex], bannedCardIds)
  ));
  if (groupsBySlot.some((groups) => groups.length === 0)) {
    return null;
  }

  let combinationCount = 1;
  for (const groups of groupsBySlot) {
    combinationCount *= groups.length;
  }
  if (profiling) {
    profiling.capacityContextBoundMcCormickUpperCombinationCount = combinationCount;
  }

  const combinations: Array<{
    coefficientUpperBound: number;
    contextBoundUpperBySlot: MedleyContextBoundUpperGroup[];
  }> = [];
  for (const firstSlotUpper of groupsBySlot[0]) {
    for (const secondSlotUpper of groupsBySlot[1]) {
      for (const thirdSlotUpper of groupsBySlot[2]) {
        const contextBoundUpperBySlot = [firstSlotUpper, secondSlotUpper, thirdSlotUpper];
        const coefficientUpperBound = estimateMedleyCapacityCardSpecificCoefficientScoreUpperBound(
          remainingSlotIndices,
          cardsByCharacter,
          contextBoundUpperBySlot.map((group) => group.coefficientUpperByCardId),
        );
        if (coefficientUpperBound !== null && Number.isFinite(coefficientUpperBound)) {
          combinations.push({ coefficientUpperBound, contextBoundUpperBySlot });
        }
      }
    }
  }
  if (combinations.length === 0) {
    return null;
  }

  combinations.sort((left, right) => right.coefficientUpperBound - left.coefficientUpperBound);
  const baselineUpperBound = combinations[0].coefficientUpperBound;
  let processedUpperBound = Number.NEGATIVE_INFINITY;
  let processedCombinationCount = 0;
  const maxProcessedCombinationCount = Math.min(
    MEDLEY_CONTEXT_BOUND_MCCORMICK_MAX_PROCESSED_COMBINATIONS,
    combinations.length,
  );

  while (processedCombinationCount < maxProcessedCombinationCount) {
    const combination = combinations[processedCombinationCount];
    if (
      processedCombinationCount > 0
      && combination.coefficientUpperBound < baselineUpperBound - MEDLEY_CONTEXT_BOUND_MCCORMICK_SCORE_WINDOW
    ) {
      break;
    }

    const slotBounds = combination.contextBoundUpperBySlot.map((contextBoundUpper, slotPosition) => (
      estimateMedleyContextBoundMcCormickSlotBounds(
        slots[remainingSlotIndices[slotPosition]],
        contextBoundUpper,
      )
    ));
    let combinationUpperBound = combination.coefficientUpperBound;
    if (slotBounds.every((bounds): bounds is MedleyContextBoundMcCormickSlotBounds => bounds !== null)) {
      for (let constraintMask = 0; constraintMask < (1 << remainingSlotIndices.length); constraintMask += 1) {
        const estimate = estimateMedleyCapacityContextBoundMcCormickScoreUpperBoundForCombination(
          slots,
          remainingSlotIndices,
          cardsByCharacter,
          combination.contextBoundUpperBySlot,
          slotBounds,
          constraintMask,
        );
        if (estimate !== null && Number.isFinite(estimate)) {
          combinationUpperBound = Math.min(combinationUpperBound, estimate);
        }
      }
      if (
        MEDLEY_ENABLE_CONTEXT_BOUND_SPLIT_SKILL_MCCORMICK_UPPER
        && processedCombinationCount < MEDLEY_CONTEXT_BOUND_SPLIT_SKILL_MCCORMICK_MAX_PROCESSED_COMBINATIONS
      ) {
        const splitSkillEstimate = estimateMedleyCapacityContextBoundSplitSkillMcCormickScoreUpperBoundForCombination(
          slots,
          remainingSlotIndices,
          cardsByCharacter,
          combination.contextBoundUpperBySlot,
          slotBounds,
          profiling,
        );
        if (splitSkillEstimate !== null && Number.isFinite(splitSkillEstimate)) {
          if (profiling) {
            profiling.capacityContextBoundSplitSkillMcCormickUpperProcessedCombinationCount += 1;
          }
          if (profiling && splitSkillEstimate < combinationUpperBound) {
            profiling.bestCapacityContextBoundSplitSkillMcCormickUpperCombinationImprovement = Math.max(
              profiling.bestCapacityContextBoundSplitSkillMcCormickUpperCombinationImprovement,
              combinationUpperBound - splitSkillEstimate,
            );
          }
          combinationUpperBound = Math.min(combinationUpperBound, splitSkillEstimate);
        }
      }
      if (
        MEDLEY_ENABLE_TEAM_SHARED_COEFFICIENT_UPPER
        && enableTeamSharedCoefficientUpper
        && processedCombinationCount < MEDLEY_TEAM_SHARED_COEFFICIENT_MAX_PROCESSED_COMBINATIONS
      ) {
        const teamSharedEstimate = estimateMedleyCapacityContextBoundSingleSlotExactScoreUpperBoundForCombination(
          slots,
          remainingSlotIndices,
          bannedCardIds,
          combination.contextBoundUpperBySlot,
          profiling,
        );
        if (teamSharedEstimate !== null && Number.isFinite(teamSharedEstimate)) {
          if (profiling && teamSharedEstimate < combinationUpperBound) {
            profiling.bestCapacityTeamSharedCoefficientUpperImprovement = Math.max(
              profiling.bestCapacityTeamSharedCoefficientUpperImprovement,
              combinationUpperBound - teamSharedEstimate,
            );
          }
          combinationUpperBound = Math.min(combinationUpperBound, teamSharedEstimate);
        }
      }
      if (
        MEDLEY_ENABLE_CONTEXT_BOUND_CARD_BOUND_UPPER
        && processedCombinationCount < MEDLEY_CONTEXT_BOUND_CARD_BOUND_MAX_PROCESSED_COMBINATIONS
      ) {
        const contextCardBoundEstimate = estimateMedleyCapacityContextBoundCardBoundScoreUpperBoundForCombination(
          slots,
          remainingSlotIndices,
          cardsByCharacter,
          combination.contextBoundUpperBySlot,
          profiling,
        );
        if (contextCardBoundEstimate !== null && Number.isFinite(contextCardBoundEstimate)) {
          if (profiling) {
            profiling.capacityContextBoundCardBoundUpperProcessedCombinationCount += 1;
          }
          if (profiling && contextCardBoundEstimate < combinationUpperBound) {
            profiling.bestCapacityContextBoundCardBoundUpperCombinationImprovement = Math.max(
              profiling.bestCapacityContextBoundCardBoundUpperCombinationImprovement,
              combinationUpperBound - contextCardBoundEstimate,
            );
          }
          combinationUpperBound = Math.min(combinationUpperBound, contextCardBoundEstimate);
        }
      }
      if (
        MEDLEY_ENABLE_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_UPPER
        && processedCombinationCount < MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_MAX_PROCESSED_COMBINATIONS
      ) {
        const powerSplitEstimate = estimateMedleyCapacityContextBoundPowerSplitMcCormickScoreUpperBoundForCombination(
          slots,
          remainingSlotIndices,
          cardsByCharacter,
          combination.contextBoundUpperBySlot,
          slotBounds,
          profiling,
        );
        if (powerSplitEstimate !== null && Number.isFinite(powerSplitEstimate)) {
          if (profiling) {
            profiling.capacityContextBoundPowerSplitMcCormickUpperProcessedCombinationCount += 1;
          }
          if (profiling && powerSplitEstimate < combinationUpperBound) {
            profiling.bestCapacityContextBoundPowerSplitMcCormickUpperCombinationImprovement = Math.max(
              profiling.bestCapacityContextBoundPowerSplitMcCormickUpperCombinationImprovement,
              combinationUpperBound - powerSplitEstimate,
            );
          }
          combinationUpperBound = Math.min(combinationUpperBound, powerSplitEstimate);
        }
      }
    }

    if (profiling && combinationUpperBound < combination.coefficientUpperBound) {
      profiling.bestCapacityContextBoundMcCormickUpperCombinationImprovement = Math.max(
        profiling.bestCapacityContextBoundMcCormickUpperCombinationImprovement,
        combination.coefficientUpperBound - combinationUpperBound,
      );
    }
    processedUpperBound = Math.max(processedUpperBound, combinationUpperBound);
    processedCombinationCount += 1;
  }

  const unprocessedUpperBound = combinations[processedCombinationCount]?.coefficientUpperBound
    ?? Number.NEGATIVE_INFINITY;
  const upperBound = Math.max(processedUpperBound, unprocessedUpperBound);
  if (!Number.isFinite(upperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextBoundMcCormickUpperCompletedCount += 1;
    profiling.capacityContextBoundMcCormickUpperProcessedCombinationCount += processedCombinationCount;
    profiling.capacityContextBoundMcCormickUpperProcessedMaxCoefficientUpper = Math.max(
      profiling.capacityContextBoundMcCormickUpperProcessedMaxCoefficientUpper ?? Number.NEGATIVE_INFINITY,
      combinations[0].coefficientUpperBound,
    );
    profiling.capacityContextBoundMcCormickUpperUnprocessedMaxCoefficientUpper = Math.max(
      profiling.capacityContextBoundMcCormickUpperUnprocessedMaxCoefficientUpper ?? Number.NEGATIVE_INFINITY,
      Number.isFinite(unprocessedUpperBound) ? unprocessedUpperBound : Number.NEGATIVE_INFINITY,
    );
  }
  return upperBound;
}

function getMedleyCapacityContextBoundBucketedJointStateBudget(targetBucketCount: number): number {
  if (targetBucketCount >= 64) {
    return 350_000;
  }
  if (targetBucketCount >= 32) {
    return 850_000;
  }
  return MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_STATE_BUDGET;
}

function estimateMedleyCapacityContextBoundBucketedJointScoreUpperBoundForBucket(
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  bucketSize: number,
  targetBucketCount: number,
  stateBudget: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityBucketedJointUpperEstimate | null {
  const slotCount = remainingSlotIndices.length;
  const maskCount = 1 << slotCount;
  const leaderMaskCount = 1 << slotCount;
  const targetLeaderMask = leaderMaskCount - 1;
  const transition = getMedleyCapacityTransition(slotCount);
  let processedStateCount = 0;

  const abort = (): null => {
    if (profiling) {
      profiling.capacityContextBoundBucketedJointUpperAbortCount += 1;
      profiling.capacityContextBoundBucketedJointUpperStateCount += processedStateCount;
      profiling.capacityContextBoundBucketedJointUpperMaxProcessedStateCount = Math.max(
        profiling.capacityContextBoundBucketedJointUpperMaxProcessedStateCount,
        processedStateCount,
      );
      profiling.capacityContextBoundBucketedJointUpperBucketSize = bucketSize;
      profiling.capacityContextBoundBucketedJointUpperTargetBucketCount = targetBucketCount;
    }
    return null;
  };
  const accountState = (): boolean => {
    processedStateCount += 1;
    const totalStateCount = processedStateCount
      + (profiling?.capacityContextBoundBucketedJointUpperStateCount ?? 0);
    return (
      processedStateCount <= stateBudget
      && totalStateCount <= MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_GLOBAL_STATE_BUDGET
    );
  };

  let statesByIndexAndLeaderMask: Array<Map<number, number>> = Array.from(
    { length: transition.stateCount * leaderMaskCount },
    () => new Map<number, number>(),
  );
  statesByIndexAndLeaderMask[0].set(0, 0);

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptions: Array<Map<number, number>> = Array.from(
      { length: maskCount * leaderMaskCount },
      () => new Map<number, number>(),
    );
    characterOptions[0].set(0, 0);

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptions = characterOptions.map(cloneMedleyCapacityBucketedJointStateMap);
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
          const states = characterOptions[mask * leaderMaskCount + leaderMask];
          if (states.size === 0) {
            continue;
          }
          for (const [coefficientBucket, contextBoundScore] of states.entries()) {
            for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
              if ((mask & (1 << slotPosition)) !== 0) {
                continue;
              }
              const card = slotCards[slotPosition];
              if (!card) {
                continue;
              }
              const contextBoundUpper = contextBoundUpperBySlot[slotPosition];
              const coefficient = contextBoundUpper.coefficientUpperByCardId.get(card.cardId);
              const averageScore = contextBoundUpper.averageScoreUpperByCardId.get(card.cardId);
              if (
                coefficient === undefined
                || averageScore === undefined
                || !Number.isFinite(coefficient)
                || !Number.isFinite(averageScore)
              ) {
                continue;
              }

              const nextMask = mask | (1 << slotPosition);
              const coefficientContribution = card.effectivePower * coefficient;
              const nextCoefficientBucket = getMedleyCapacityBucketedJointBucket(
                coefficientBucket * bucketSize + coefficientContribution,
                bucketSize,
              );
              if (!accountState()) {
                return abort();
              }
              addMedleyCapacityBucketedJointState(
                nextCharacterOptions[nextMask * leaderMaskCount + leaderMask],
                nextCoefficientBucket,
                contextBoundScore + averageScore,
              );

              const leaderBit = 1 << slotPosition;
              if ((leaderMask & leaderBit) === 0) {
                const leaderScore = contextBoundUpper.leaderScoreUpperByCardId.get(card.cardId);
                if (leaderScore === undefined || !Number.isFinite(leaderScore)) {
                  continue;
                }
                const nextLeaderMask = leaderMask | leaderBit;
                if (!accountState()) {
                  return abort();
                }
                addMedleyCapacityBucketedJointState(
                  nextCharacterOptions[nextMask * leaderMaskCount + nextLeaderMask],
                  nextCoefficientBucket,
                  contextBoundScore + averageScore + leaderScore,
                );
              }
            }
          }
        }
      }
      pruneMedleyCapacityBucketedJointStateMaps(nextCharacterOptions);
      characterOptions = nextCharacterOptions;
    }

    const nextStatesByIndexAndLeaderMask = statesByIndexAndLeaderMask
      .map(cloneMedleyCapacityBucketedJointStateMap);
    for (let stateIndex = 0; stateIndex < transition.stateCount; stateIndex += 1) {
      for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
        const states = statesByIndexAndLeaderMask[stateIndex * leaderMaskCount + leaderMask];
        if (states.size === 0) {
          continue;
        }
        for (let characterMask = 1; characterMask < maskCount; characterMask += 1) {
          const nextStateIndex = transition.nextIndexByMask[stateIndex * maskCount + characterMask];
          if (nextStateIndex < 0) {
            continue;
          }
          for (let characterLeaderMask = 0; characterLeaderMask < leaderMaskCount; characterLeaderMask += 1) {
            if (
              (characterLeaderMask & ~characterMask) !== 0
              || (leaderMask & characterLeaderMask) !== 0
            ) {
              continue;
            }
            const options = characterOptions[characterMask * leaderMaskCount + characterLeaderMask];
            if (options.size === 0) {
              continue;
            }
            const nextLeaderMask = leaderMask | characterLeaderMask;
            const nextStates = nextStatesByIndexAndLeaderMask[
              nextStateIndex * leaderMaskCount + nextLeaderMask
            ];
            for (const [coefficientBucket, contextBoundScore] of states.entries()) {
              for (const [optionCoefficientBucket, optionContextBoundScore] of options.entries()) {
                if (!accountState()) {
                  return abort();
                }
                addMedleyCapacityBucketedJointState(
                  nextStates,
                  coefficientBucket + optionCoefficientBucket,
                  contextBoundScore + optionContextBoundScore,
                );
              }
            }
          }
        }
      }
    }
    pruneMedleyCapacityBucketedJointStateMaps(nextStatesByIndexAndLeaderMask);
    statesByIndexAndLeaderMask = nextStatesByIndexAndLeaderMask;
  }

  const targetStates = statesByIndexAndLeaderMask[transition.targetIndex * leaderMaskCount + targetLeaderMask];
  let upperBound = Number.NEGATIVE_INFINITY;
  for (const [coefficientBucket, contextBoundScore] of targetStates.entries()) {
    upperBound = Math.max(upperBound, Math.min(coefficientBucket * bucketSize, contextBoundScore));
  }
  if (!Number.isFinite(upperBound)) {
    return null;
  }

  if (profiling) {
    profiling.capacityContextBoundBucketedJointUpperCompletedCount += 1;
    profiling.capacityContextBoundBucketedJointUpperStateCount += processedStateCount;
    profiling.capacityContextBoundBucketedJointUpperMaxProcessedStateCount = Math.max(
      profiling.capacityContextBoundBucketedJointUpperMaxProcessedStateCount,
      processedStateCount,
    );
    profiling.capacityContextBoundBucketedJointUpperBucketSize = bucketSize;
    profiling.capacityContextBoundBucketedJointUpperTargetBucketCount = targetBucketCount;
  }
  return {
    upperBound,
    bucketSize,
    targetBucketCount,
  };
}

function estimateMedleyCapacityContextBoundBucketedJointScoreUpperBoundForCombination(
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  coefficientUpperBound: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityBucketedJointUpperEstimate | null {
  if (!Number.isFinite(coefficientUpperBound)) {
    return null;
  }

  for (const targetBucketCount of MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_TARGET_BUCKET_COUNTS) {
    const bucketSize = Math.max(
      MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_MIN_BUCKET_SIZE,
      Math.ceil(coefficientUpperBound / targetBucketCount),
    );
    const stateBudget = getMedleyCapacityContextBoundBucketedJointStateBudget(targetBucketCount);
    const estimate = estimateMedleyCapacityContextBoundBucketedJointScoreUpperBoundForBucket(
      remainingSlotIndices,
      cardsByCharacter,
      contextBoundUpperBySlot,
      bucketSize,
      targetBucketCount,
      stateBudget,
      profiling,
    );
    if (estimate !== null) {
      return estimate;
    }
  }

  return null;
}

function estimateMedleyCapacityContextBoundBucketedJointScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityBucketedJointUpperEstimate | null {
  if (remainingSlotIndices.length !== MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextBoundBucketedJointUpperCallCount += 1;
    if (
      profiling.capacityContextBoundBucketedJointUpperStateCount
        >= MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_GLOBAL_STATE_BUDGET
    ) {
      profiling.capacityContextBoundBucketedJointUpperAbortCount += 1;
      return null;
    }
  }

  const groupsBySlot = remainingSlotIndices.map((slotIndex) => (
    buildMedleyContextBoundUpperGroups(slots[slotIndex], bannedCardIds)
  ));
  if (groupsBySlot.some((groups) => groups.length === 0)) {
    return null;
  }

  let combinationCount = 1;
  for (const groups of groupsBySlot) {
    combinationCount *= groups.length;
  }
  if (profiling) {
    profiling.capacityContextBoundBucketedJointUpperCombinationCount = combinationCount;
  }

  const combinations: Array<{
    coefficientUpperBound: number;
    contextBoundUpperBySlot: MedleyContextBoundUpperGroup[];
  }> = [];
  for (const firstSlotUpper of groupsBySlot[0]) {
    for (const secondSlotUpper of groupsBySlot[1]) {
      for (const thirdSlotUpper of groupsBySlot[2]) {
        const contextBoundUpperBySlot = [firstSlotUpper, secondSlotUpper, thirdSlotUpper];
        const coefficientUpperBound = estimateMedleyCapacityCardSpecificCoefficientScoreUpperBound(
          remainingSlotIndices,
          cardsByCharacter,
          contextBoundUpperBySlot.map((group) => group.coefficientUpperByCardId),
        );
        if (coefficientUpperBound !== null && Number.isFinite(coefficientUpperBound)) {
          combinations.push({ coefficientUpperBound, contextBoundUpperBySlot });
        }
      }
    }
  }
  if (combinations.length === 0) {
    return null;
  }

  combinations.sort((left, right) => right.coefficientUpperBound - left.coefficientUpperBound);
  const baselineUpperBound = combinations[0].coefficientUpperBound;
  let processedUpperBound = Number.NEGATIVE_INFINITY;
  let processedCombinationCount = 0;
  let bestEstimate: MedleyCapacityBucketedJointUpperEstimate | null = null;
  const maxProcessedCombinationCount = Math.min(
    MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_MAX_PROCESSED_COMBINATIONS,
    combinations.length,
  );

  while (processedCombinationCount < maxProcessedCombinationCount) {
    const combination = combinations[processedCombinationCount];
    if (
      processedCombinationCount > 0
      && combination.coefficientUpperBound
        < baselineUpperBound - MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_SCORE_WINDOW
    ) {
      break;
    }

    const estimate = estimateMedleyCapacityContextBoundBucketedJointScoreUpperBoundForCombination(
      remainingSlotIndices,
      cardsByCharacter,
      combination.contextBoundUpperBySlot,
      combination.coefficientUpperBound,
      profiling,
    );
    const combinationUpperBound = estimate === null
      ? combination.coefficientUpperBound
      : Math.min(combination.coefficientUpperBound, estimate.upperBound);
    if (profiling && estimate !== null && combinationUpperBound < combination.coefficientUpperBound) {
      profiling.bestCapacityContextBoundBucketedJointUpperCombinationImprovement = Math.max(
        profiling.bestCapacityContextBoundBucketedJointUpperCombinationImprovement,
        combination.coefficientUpperBound - combinationUpperBound,
      );
    }
    processedUpperBound = Math.max(processedUpperBound, combinationUpperBound);
    if (estimate !== null && (bestEstimate === null || estimate.upperBound < bestEstimate.upperBound)) {
      bestEstimate = estimate;
    }
    processedCombinationCount += 1;
  }

  const unprocessedUpperBound = combinations[processedCombinationCount]?.coefficientUpperBound
    ?? Number.NEGATIVE_INFINITY;
  const upperBound = Math.max(processedUpperBound, unprocessedUpperBound);
  if (!Number.isFinite(upperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextBoundBucketedJointUpperProcessedCombinationCount += processedCombinationCount;
    profiling.capacityContextBoundBucketedJointUpperProcessedMaxCoefficientUpper = Math.max(
      profiling.capacityContextBoundBucketedJointUpperProcessedMaxCoefficientUpper ?? Number.NEGATIVE_INFINITY,
      combinations[0].coefficientUpperBound,
    );
    profiling.capacityContextBoundBucketedJointUpperUnprocessedMaxCoefficientUpper = Math.max(
      profiling.capacityContextBoundBucketedJointUpperUnprocessedMaxCoefficientUpper ?? Number.NEGATIVE_INFINITY,
      Number.isFinite(unprocessedUpperBound) ? unprocessedUpperBound : Number.NEGATIVE_INFINITY,
    );
  }
  return {
    upperBound,
    bucketSize: bestEstimate?.bucketSize ?? MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_MIN_BUCKET_SIZE,
    targetBucketCount: bestEstimate?.targetBucketCount ?? 0,
  };
}

function getMedleyCapacityCardMinCoefficientBucket(coefficient: number, bucketSize: number): number {
  return Math.max(0, Math.ceil(Math.max(0, coefficient) / bucketSize));
}

function getMedleyCapacityCardMinCoefficientStateBudget(targetBucketCount: number): number {
  if (targetBucketCount >= 256) {
    return 100_000;
  }
  if (targetBucketCount >= 128) {
    return 200_000;
  }
  if (targetBucketCount >= 64) {
    return 400_000;
  }
  if (targetBucketCount >= 32) {
    return 800_000;
  }
  return MEDLEY_CARD_MIN_COEFFICIENT_STATE_BUDGET;
}

function createEmptyMedleyCapacityCardMinCoefficientState(initialBucket: number): MedleyCapacityCardMinCoefficientState {
  return {
    bucket0: initialBucket,
    power0: 0,
    bucket1: initialBucket,
    power1: 0,
    bucket2: initialBucket,
    power2: 0,
  };
}

function getMedleyCapacityCardMinCoefficientKey(
  state: MedleyCapacityCardMinCoefficientState,
  bucketBase: number,
  slotCount: number,
): number {
  return state.bucket0
    + (slotCount >= 2 ? state.bucket1 * bucketBase : 0)
    + (slotCount >= 3 ? state.bucket2 * bucketBase * bucketBase : 0);
}

function cloneMedleyCapacityCardMinCoefficientState(
  state: MedleyCapacityCardMinCoefficientState,
): MedleyCapacityCardMinCoefficientState {
  return { ...state };
}

function cloneMedleyCapacityCardMinCoefficientStateMap(
  states: Map<number, MedleyCapacityCardMinCoefficientState>,
): Map<number, MedleyCapacityCardMinCoefficientState> {
  const nextStates = new Map<number, MedleyCapacityCardMinCoefficientState>();
  for (const [key, state] of states.entries()) {
    nextStates.set(key, cloneMedleyCapacityCardMinCoefficientState(state));
  }
  return nextStates;
}

function addMedleyCapacityCardMinCoefficientState(
  states: Map<number, MedleyCapacityCardMinCoefficientState>,
  nextState: MedleyCapacityCardMinCoefficientState,
  slotCount: number,
  bucketBase: number,
): void {
  const key = getMedleyCapacityCardMinCoefficientKey(nextState, bucketBase, slotCount);
  const state = states.get(key);
  if (!state) {
    states.set(key, nextState);
    return;
  }

  state.power0 = Math.max(state.power0, nextState.power0);
  if (slotCount >= 2) {
    state.power1 = Math.max(state.power1, nextState.power1);
  }
  if (slotCount >= 3) {
    state.power2 = Math.max(state.power2, nextState.power2);
  }
}

function medleyCapacityCardMinCoefficientStateDominates(
  left: MedleyCapacityCardMinCoefficientState,
  right: MedleyCapacityCardMinCoefficientState,
  slotCount: number,
): boolean {
  return left.bucket0 >= right.bucket0
    && left.power0 >= right.power0
    && (
      slotCount < 2
      || (left.bucket1 >= right.bucket1 && left.power1 >= right.power1)
    )
    && (
      slotCount < 3
      || (left.bucket2 >= right.bucket2 && left.power2 >= right.power2)
    );
}

function pruneMedleyCapacityCardMinCoefficientDominatedStates(
  states: Map<number, MedleyCapacityCardMinCoefficientState>,
  slotCount: number,
): Map<number, MedleyCapacityCardMinCoefficientState> {
  if (states.size < MEDLEY_CARD_MIN_COEFFICIENT_DOMINANCE_PRUNE_THRESHOLD) {
    return states;
  }

  const entries = [...states.entries()];
  const isKept = new Array<boolean>(entries.length).fill(true);
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    if (!isKept[leftIndex]) {
      continue;
    }
    const left = entries[leftIndex][1];
    for (let rightIndex = 0; rightIndex < entries.length; rightIndex += 1) {
      if (leftIndex === rightIndex || !isKept[rightIndex]) {
        continue;
      }
      const right = entries[rightIndex][1];
      if (medleyCapacityCardMinCoefficientStateDominates(left, right, slotCount)) {
        isKept[rightIndex] = false;
      } else if (medleyCapacityCardMinCoefficientStateDominates(right, left, slotCount)) {
        isKept[leftIndex] = false;
        break;
      }
    }
  }

  if (isKept.every(Boolean)) {
    return states;
  }

  const prunedStates = new Map<number, MedleyCapacityCardMinCoefficientState>();
  entries.forEach(([key, state], index) => {
    if (isKept[index]) {
      prunedStates.set(key, state);
    }
  });
  return prunedStates;
}

function addCardToMedleyCapacityCardMinCoefficientState(
  state: MedleyCapacityCardMinCoefficientState,
  card: SearchCard,
  slotPosition: number,
  cardCoefficientBucket: number,
): MedleyCapacityCardMinCoefficientState {
  if (slotPosition === 0) {
    return {
      ...state,
      bucket0: Math.min(state.bucket0, cardCoefficientBucket),
      power0: state.power0 + card.effectivePower,
    };
  }
  if (slotPosition === 1) {
    return {
      ...state,
      bucket1: Math.min(state.bucket1, cardCoefficientBucket),
      power1: state.power1 + card.effectivePower,
    };
  }
  return {
    ...state,
    bucket2: Math.min(state.bucket2, cardCoefficientBucket),
    power2: state.power2 + card.effectivePower,
  };
}

function combineMedleyCapacityCardMinCoefficientStates(
  left: MedleyCapacityCardMinCoefficientState,
  right: MedleyCapacityCardMinCoefficientState,
): MedleyCapacityCardMinCoefficientState {
  return {
    bucket0: Math.min(left.bucket0, right.bucket0),
    power0: left.power0 + right.power0,
    bucket1: Math.min(left.bucket1, right.bucket1),
    power1: left.power1 + right.power1,
    bucket2: Math.min(left.bucket2, right.bucket2),
    power2: left.power2 + right.power2,
  };
}

function scoreMedleyCapacityCardMinCoefficientState(
  state: MedleyCapacityCardMinCoefficientState,
  bucketSize: number,
  slotCount: number,
): number {
  let score = state.power0 * state.bucket0 * bucketSize;
  if (slotCount >= 2) {
    score += state.power1 * state.bucket1 * bucketSize;
  }
  if (slotCount >= 3) {
    score += state.power2 * state.bucket2 * bucketSize;
  }
  return score;
}

function estimateMedleyCapacityCardMinCoefficientScoreUpperBoundForBucket(
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  cardSpecificCoefficientUpperBySlot: MedleyCardSpecificCoefficientUpperBySlot,
  bucketSize: number,
  targetBucketCount: number,
  stateBudget: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityCardMinCoefficientUpperEstimate | null {
  const slotCount = remainingSlotIndices.length;
  const maskCount = 1 << slotCount;
  const transition = getMedleyCapacityTransition(slotCount);
  let maxBucket = 0;
  for (const coefficientUpperByCardId of cardSpecificCoefficientUpperBySlot) {
    for (const coefficient of coefficientUpperByCardId.values()) {
      maxBucket = Math.max(maxBucket, getMedleyCapacityCardMinCoefficientBucket(coefficient, bucketSize));
    }
  }
  if (maxBucket <= 0) {
    return null;
  }
  const initialBucket = maxBucket;
  const bucketBase = maxBucket + 2;
  let processedStateCount = 0;

  const abort = (): null => {
    if (profiling) {
      profiling.capacityCardMinCoefficientUpperAbortCount += 1;
      profiling.capacityCardMinCoefficientUpperStateCount += processedStateCount;
      profiling.capacityCardMinCoefficientUpperMaxProcessedStateCount = Math.max(
        profiling.capacityCardMinCoefficientUpperMaxProcessedStateCount,
        processedStateCount,
      );
      profiling.capacityCardMinCoefficientUpperBucketSize = bucketSize;
      profiling.capacityCardMinCoefficientUpperTargetBucketCount = targetBucketCount;
    }
    return null;
  };
  const accountState = (): boolean => {
    processedStateCount += 1;
    const totalStateCount = processedStateCount + (profiling?.capacityCardMinCoefficientUpperStateCount ?? 0);
    return (
      processedStateCount <= stateBudget
      && totalStateCount <= MEDLEY_CARD_MIN_COEFFICIENT_GLOBAL_STATE_BUDGET
    );
  };

  let statesByIndex: Array<Map<number, MedleyCapacityCardMinCoefficientState>> = Array.from(
    { length: transition.stateCount },
    () => new Map<number, MedleyCapacityCardMinCoefficientState>(),
  );
  addMedleyCapacityCardMinCoefficientState(
    statesByIndex[0],
    createEmptyMedleyCapacityCardMinCoefficientState(initialBucket),
    slotCount,
    bucketBase,
  );

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptionsByMask: Array<Map<number, MedleyCapacityCardMinCoefficientState>> = Array.from(
      { length: maskCount },
      () => new Map<number, MedleyCapacityCardMinCoefficientState>(),
    );
    addMedleyCapacityCardMinCoefficientState(
      characterOptionsByMask[0],
      createEmptyMedleyCapacityCardMinCoefficientState(initialBucket),
      slotCount,
      bucketBase,
    );

    for (const slotCards of cardsById.values()) {
      const nextOptionsByMask = characterOptionsByMask.map(cloneMedleyCapacityCardMinCoefficientStateMap);
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (const state of characterOptionsByMask[mask].values()) {
          for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
            const card = slotCards[slotPosition];
            if (!card || (mask & (1 << slotPosition)) !== 0) {
              continue;
            }
            const coefficient = cardSpecificCoefficientUpperBySlot[slotPosition].get(card.cardId);
            if (coefficient === undefined || !Number.isFinite(coefficient)) {
              continue;
            }
            if (!accountState()) {
              return abort();
            }
            addMedleyCapacityCardMinCoefficientState(
              nextOptionsByMask[mask | (1 << slotPosition)],
              addCardToMedleyCapacityCardMinCoefficientState(
                state,
                card,
                slotPosition,
                getMedleyCapacityCardMinCoefficientBucket(coefficient, bucketSize),
              ),
              slotCount,
              bucketBase,
            );
          }
        }
      }
      characterOptionsByMask = nextOptionsByMask.map((states) => (
        pruneMedleyCapacityCardMinCoefficientDominatedStates(states, slotCount)
      ));
    }

    const nextStatesByIndex = statesByIndex.map(cloneMedleyCapacityCardMinCoefficientStateMap);
    for (let stateIndex = 0; stateIndex < statesByIndex.length; stateIndex += 1) {
      const states = statesByIndex[stateIndex];
      if (states.size === 0) {
        continue;
      }
      for (let mask = 1; mask < maskCount; mask += 1) {
        const options = characterOptionsByMask[mask];
        if (options.size === 0) {
          continue;
        }
        const nextIndex = transition.nextIndexByMask[stateIndex * maskCount + mask];
        if (nextIndex < 0) {
          continue;
        }
        const nextStates = nextStatesByIndex[nextIndex];
        for (const state of states.values()) {
          for (const option of options.values()) {
            if (!accountState()) {
              return abort();
            }
            addMedleyCapacityCardMinCoefficientState(
              nextStates,
              combineMedleyCapacityCardMinCoefficientStates(state, option),
              slotCount,
              bucketBase,
            );
          }
        }
      }
    }
    statesByIndex = nextStatesByIndex.map((states) => (
      pruneMedleyCapacityCardMinCoefficientDominatedStates(states, slotCount)
    ));
  }

  let upperBound = Number.NEGATIVE_INFINITY;
  for (const state of statesByIndex[transition.targetIndex].values()) {
    upperBound = Math.max(upperBound, scoreMedleyCapacityCardMinCoefficientState(state, bucketSize, slotCount));
  }
  if (!Number.isFinite(upperBound)) {
    return null;
  }

  if (profiling) {
    profiling.capacityCardMinCoefficientUpperCompletedCount += 1;
    profiling.capacityCardMinCoefficientUpperStateCount += processedStateCount;
    profiling.capacityCardMinCoefficientUpperMaxProcessedStateCount = Math.max(
      profiling.capacityCardMinCoefficientUpperMaxProcessedStateCount,
      processedStateCount,
    );
    profiling.capacityCardMinCoefficientUpperBucketSize = bucketSize;
    profiling.capacityCardMinCoefficientUpperTargetBucketCount = targetBucketCount;
  }
  return {
    upperBound,
    bucketSize,
    targetBucketCount,
  };
}

function estimateMedleyCapacityCardMinCoefficientScoreUpperBound(
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  cardSpecificCoefficientUpperBySlot: MedleyCardSpecificCoefficientUpperBySlot,
  coefficientUpperBound: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityCardMinCoefficientUpperEstimate | null {
  const slotCount = remainingSlotIndices.length;
  if (slotCount < 2 || slotCount > MEDLEY_TEAM_COUNT || !Number.isFinite(coefficientUpperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityCardMinCoefficientUpperCallCount += 1;
    if (profiling.capacityCardMinCoefficientUpperStateCount >= MEDLEY_CARD_MIN_COEFFICIENT_GLOBAL_STATE_BUDGET) {
      profiling.capacityCardMinCoefficientUpperAbortCount += 1;
      return null;
    }
  }

  for (const targetBucketCount of MEDLEY_CARD_MIN_COEFFICIENT_TARGET_BUCKET_COUNTS) {
    const bucketSize = Math.max(0.001, coefficientUpperBound / targetBucketCount / 250_000);
    const stateBudget = getMedleyCapacityCardMinCoefficientStateBudget(targetBucketCount);
    const estimate = estimateMedleyCapacityCardMinCoefficientScoreUpperBoundForBucket(
      remainingSlotIndices,
      cardsByCharacter,
      cardSpecificCoefficientUpperBySlot,
      bucketSize,
      targetBucketCount,
      stateBudget,
      profiling,
    );
    if (estimate !== null) {
      return estimate;
    }
  }

  return null;
}

function buildMedleyCapacityCardsByCharacter(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
): MedleyCapacityCardsByCharacter {
  const cardsByCharacter: MedleyCapacityCardsByCharacter = new Map();
  remainingSlotIndices.forEach((slotIndex, slotPosition) => {
    for (const card of slots[slotIndex].searchCards) {
      if (bannedCardIds.has(card.cardId)) {
        continue;
      }
      const cardsById = cardsByCharacter.get(card.characterId) ?? new Map<number, Array<SearchCard | undefined>>();
      const slotCards = cardsById.get(card.cardId) ?? new Array<SearchCard | undefined>(remainingSlotIndices.length);
      slotCards[slotPosition] = card;
      cardsById.set(card.cardId, slotCards);
      cardsByCharacter.set(card.characterId, cardsById);
    }
  });
  return cardsByCharacter;
}

function estimateMedleyCapacityAssignmentScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
  useSkillAwareUpper = false,
  useParetoUpper = false,
  useBucketedUpper = false,
  enableTeamSharedCoefficientUpper = false,
): MedleyCapacityAssignmentScoreUpperBound {
  if (remainingSlotIndices.length === 0) {
    return {
      upperBound: 0,
      coefficientUpperBound: 0,
      skillAwareUpperBound: null,
      paretoUpperBound: null,
      mode: "coefficient",
    };
  }

  const usesPowerUpperBounds = useSkillAwareUpper || useBucketedUpper;
  const slotPowerUpperBounds = usesPowerUpperBounds
    ? remainingSlotIndices.map((slotIndex) => estimateMedleySlotEffectivePowerUpperBound(slots[slotIndex], bannedCardIds))
    : [];
  if (usesPowerUpperBounds && slotPowerUpperBounds.some((powerUpperBound) => !Number.isFinite(powerUpperBound))) {
    return {
      upperBound: Number.NEGATIVE_INFINITY,
      coefficientUpperBound: Number.NEGATIVE_INFINITY,
      skillAwareUpperBound: Number.NEGATIVE_INFINITY,
      paretoUpperBound: null,
      mode: "skill-aware",
    };
  }

  const slotLeaderConstants = useSkillAwareUpper
    ? remainingSlotIndices.map((slotIndex, slotPosition) => {
      const slot = slots[slotIndex];
      let leaderRate = 0;
      for (const card of slot.searchCards) {
        if (!bannedCardIds.has(card.cardId)) {
          leaderRate = Math.max(leaderRate, getMedleyCardSkillLeaderRateUpper(card));
        }
      }
      return slotPowerUpperBounds[slotPosition] * leaderRate;
    })
    : [];

  const slotCoefficientEstimates = remainingSlotIndices.map((slotIndex) => (
    estimateMedleySlotSkillCoefficient(slots[slotIndex], bannedCardIds)
  ));
  const slotCoefficients = slotCoefficientEstimates.map((estimate) => estimate.coefficient);
  const legacySlotCoefficients = slotCoefficientEstimates.map((estimate) => estimate.legacyCoefficient);
  if (profiling) {
    profiling.capacityCoefficientTighteningCallCount += 1;
    for (const estimate of slotCoefficientEstimates) {
      if (Number.isFinite(estimate.improvement) && estimate.improvement > MEDLEY_SKILL_COEFFICIENT_EPSILON) {
        profiling.capacityCoefficientTighteningSlotImprovementCount += 1;
        profiling.capacityCoefficientTighteningSlotImprovementTotal += estimate.improvement;
        profiling.bestCapacityCoefficientTighteningSlotImprovement = Math.max(
          profiling.bestCapacityCoefficientTighteningSlotImprovement,
          estimate.improvement,
        );
      }
    }
  }

  if (slotCoefficients.some((coefficient) => !Number.isFinite(coefficient))) {
    return {
      upperBound: Number.NEGATIVE_INFINITY,
      coefficientUpperBound: Number.NEGATIVE_INFINITY,
      skillAwareUpperBound: useSkillAwareUpper ? Number.NEGATIVE_INFINITY : null,
      paretoUpperBound: null,
      mode: useSkillAwareUpper ? "skill-aware" : "coefficient",
    };
  }

  const cardsByCharacter = buildMedleyCapacityCardsByCharacter(slots, remainingSlotIndices, bannedCardIds);

  const slotCount = remainingSlotIndices.length;
  const maskCount = 1 << slotCount;
  const transition = getMedleyCapacityTransition(slotCount);
  let states = new Float64Array(transition.stateCount);
  states.fill(Number.NEGATIVE_INFINITY);
  states[0] = 0;
  const shouldTrackLegacyCoefficientUpperBound = Boolean(
    profiling
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    && slotCoefficientEstimates.some((estimate) => estimate.improvement > MEDLEY_SKILL_COEFFICIENT_EPSILON),
  );
  let legacyCoefficientStates = shouldTrackLegacyCoefficientUpperBound ? new Float64Array(transition.stateCount) : null;
  if (legacyCoefficientStates) {
    legacyCoefficientStates.fill(Number.NEGATIVE_INFINITY);
    legacyCoefficientStates[0] = 0;
  }
  let skillAwareStates = useSkillAwareUpper ? new Float64Array(transition.stateCount) : null;
  if (skillAwareStates) {
    skillAwareStates.fill(Number.NEGATIVE_INFINITY);
    skillAwareStates[0] = 0;
  }

  for (const cardsById of cardsByCharacter.values()) {
    let characterValues = new Float64Array(maskCount);
    characterValues.fill(Number.NEGATIVE_INFINITY);
    characterValues[0] = 0;
    let legacyCoefficientCharacterValues = legacyCoefficientStates ? new Float64Array(maskCount) : null;
    if (legacyCoefficientCharacterValues) {
      legacyCoefficientCharacterValues.fill(Number.NEGATIVE_INFINITY);
      legacyCoefficientCharacterValues[0] = 0;
    }
    let skillAwareCharacterValues = useSkillAwareUpper ? new Float64Array(maskCount) : null;
    if (skillAwareCharacterValues) {
      skillAwareCharacterValues.fill(Number.NEGATIVE_INFINITY);
      skillAwareCharacterValues[0] = 0;
    }
    for (const slotCards of cardsById.values()) {
      const nextCharacterValues = characterValues.slice();
      const nextLegacyCoefficientCharacterValues = legacyCoefficientCharacterValues?.slice() ?? null;
      const nextSkillAwareCharacterValues = skillAwareCharacterValues?.slice() ?? null;
      for (let mask = 0; mask < maskCount; mask += 1) {
        const currentValue = characterValues[mask];
        const currentLegacyCoefficientValue = legacyCoefficientCharacterValues?.[mask] ?? Number.NEGATIVE_INFINITY;
        const currentSkillAwareValue = skillAwareCharacterValues?.[mask] ?? Number.NEGATIVE_INFINITY;
        for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
          const card = slotCards[slotPosition];
          if ((mask & (1 << slotPosition)) !== 0 || !card) {
            continue;
          }
          const nextMask = mask | (1 << slotPosition);
          if (Number.isFinite(currentValue)) {
            nextCharacterValues[nextMask] = Math.max(
              nextCharacterValues[nextMask],
              currentValue + card.effectivePower * slotCoefficients[slotPosition],
            );
          }
          if (nextLegacyCoefficientCharacterValues && Number.isFinite(currentLegacyCoefficientValue)) {
            nextLegacyCoefficientCharacterValues[nextMask] = Math.max(
              nextLegacyCoefficientCharacterValues[nextMask],
              currentLegacyCoefficientValue + card.effectivePower * legacySlotCoefficients[slotPosition],
            );
          }
          if (nextSkillAwareCharacterValues && Number.isFinite(currentSkillAwareValue)) {
            nextSkillAwareCharacterValues[nextMask] = Math.max(
              nextSkillAwareCharacterValues[nextMask],
              currentSkillAwareValue
                + card.effectivePower * slots[remainingSlotIndices[slotPosition]].baseScoreRatePerPower
                + slotPowerUpperBounds[slotPosition] * getMedleyCardSkillAverageRateUpper(card),
            );
          }
        }
      }
      characterValues = nextCharacterValues;
      legacyCoefficientCharacterValues = nextLegacyCoefficientCharacterValues;
      skillAwareCharacterValues = nextSkillAwareCharacterValues;
    }

    const nextStates = states.slice();
    const nextLegacyCoefficientStates = legacyCoefficientStates?.slice() ?? null;
    const nextSkillAwareStates = skillAwareStates?.slice() ?? null;
    for (let stateIndex = 0; stateIndex < states.length; stateIndex += 1) {
      const currentValue = states[stateIndex];
      const currentLegacyCoefficientValue = legacyCoefficientStates?.[stateIndex] ?? Number.NEGATIVE_INFINITY;
      const currentSkillAwareValue = skillAwareStates?.[stateIndex] ?? Number.NEGATIVE_INFINITY;
      for (let mask = 1; mask < maskCount; mask += 1) {
        const nextIndex = transition.nextIndexByMask[stateIndex * maskCount + mask];
        if (nextIndex < 0) {
          continue;
        }
        const characterValue = characterValues[mask];
        if (Number.isFinite(currentValue) && Number.isFinite(characterValue)) {
          nextStates[nextIndex] = Math.max(nextStates[nextIndex], currentValue + characterValue);
        }
        const legacyCoefficientCharacterValue = legacyCoefficientCharacterValues?.[mask] ?? Number.NEGATIVE_INFINITY;
        if (
          nextLegacyCoefficientStates
          && Number.isFinite(currentLegacyCoefficientValue)
          && Number.isFinite(legacyCoefficientCharacterValue)
        ) {
          nextLegacyCoefficientStates[nextIndex] = Math.max(
            nextLegacyCoefficientStates[nextIndex],
            currentLegacyCoefficientValue + legacyCoefficientCharacterValue,
          );
        }
        const skillAwareCharacterValue = skillAwareCharacterValues?.[mask] ?? Number.NEGATIVE_INFINITY;
        if (nextSkillAwareStates && Number.isFinite(currentSkillAwareValue) && Number.isFinite(skillAwareCharacterValue)) {
          nextSkillAwareStates[nextIndex] = Math.max(
            nextSkillAwareStates[nextIndex],
            currentSkillAwareValue + skillAwareCharacterValue,
          );
        }
      }
    }
    states = nextStates;
    legacyCoefficientStates = nextLegacyCoefficientStates;
    skillAwareStates = nextSkillAwareStates;
  }

  const coefficientUpperBound = states[transition.targetIndex];
  const legacyCoefficientUpperBound = legacyCoefficientStates?.[transition.targetIndex] ?? null;
  if (
    profiling
    && legacyCoefficientUpperBound !== null
    && Number.isFinite(legacyCoefficientUpperBound)
    && Number.isFinite(coefficientUpperBound)
    && legacyCoefficientUpperBound > coefficientUpperBound + MEDLEY_SKILL_COEFFICIENT_EPSILON
  ) {
    const improvement = legacyCoefficientUpperBound - coefficientUpperBound;
    profiling.capacityCoefficientTighteningScoreImprovementCount += 1;
    profiling.capacityCoefficientTighteningScoreImprovementTotal += improvement;
    profiling.bestCapacityCoefficientTighteningScoreImprovement = Math.max(
      profiling.bestCapacityCoefficientTighteningScoreImprovement,
      improvement,
    );
  }
  if (!skillAwareStates) {
    return {
      upperBound: coefficientUpperBound,
      coefficientUpperBound,
      skillAwareUpperBound: null,
      paretoUpperBound: null,
      mode: "coefficient",
    };
  }
  const skillAwareUpperBound = skillAwareStates[transition.targetIndex]
    + slotLeaderConstants.reduce((sum, value) => sum + value, 0);
  let upperBound = coefficientUpperBound;
  let mode: MedleyCapacityUpperMode = "coefficient";
  if (skillAwareUpperBound < upperBound) {
    upperBound = skillAwareUpperBound;
    mode = "skill-aware";
  }

  const cardSpecificCoefficientUpperBySlot = useSkillAwareUpper
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? buildMedleyCardSpecificCoefficientUpperBySlot(slots, remainingSlotIndices, bannedCardIds)
    : null;
  const cardSpecificCoefficientUpperBound = cardSpecificCoefficientUpperBySlot
    ? estimateMedleyCapacityCardSpecificCoefficientScoreUpperBound(
      remainingSlotIndices,
      cardsByCharacter,
      cardSpecificCoefficientUpperBySlot,
      profiling,
    )
    : null;
  if (
    cardSpecificCoefficientUpperBound !== null
    && Number.isFinite(cardSpecificCoefficientUpperBound)
    && cardSpecificCoefficientUpperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - cardSpecificCoefficientUpperBound;
      profiling.capacityCardSpecificCoefficientUpperImprovementCount += 1;
      profiling.capacityCardSpecificCoefficientUpperImprovementTotal += improvement;
      profiling.bestCapacityCardSpecificCoefficientUpperImprovement = Math.max(
        profiling.bestCapacityCardSpecificCoefficientUpperImprovement,
        improvement,
      );
    }
    upperBound = cardSpecificCoefficientUpperBound;
    mode = "card-specific-coefficient";
  }

  const leaderFixedCardSpecificCoefficientUpperBound = MEDLEY_ENABLE_LEADER_FIXED_CARD_SPECIFIC_UPPER
    && useParetoUpper
    && cardSpecificCoefficientUpperBySlot
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityLeaderFixedCardSpecificCoefficientScoreUpperBound(
      slots,
      remainingSlotIndices,
      bannedCardIds,
      cardsByCharacter,
      cardSpecificCoefficientUpperBySlot,
      profiling,
    )
    : null;
  if (
    leaderFixedCardSpecificCoefficientUpperBound !== null
    && Number.isFinite(leaderFixedCardSpecificCoefficientUpperBound)
    && leaderFixedCardSpecificCoefficientUpperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - leaderFixedCardSpecificCoefficientUpperBound;
      profiling.capacityLeaderFixedCardSpecificUpperImprovementCount += 1;
      profiling.capacityLeaderFixedCardSpecificUpperImprovementTotal += improvement;
      profiling.bestCapacityLeaderFixedCardSpecificUpperImprovement = Math.max(
        profiling.bestCapacityLeaderFixedCardSpecificUpperImprovement,
        improvement,
      );
    }
    upperBound = leaderFixedCardSpecificCoefficientUpperBound;
    mode = "leader-fixed-card-specific-coefficient";
  }

  const leaderGroupCardSpecificCoefficientUpperBound = MEDLEY_ENABLE_LEADER_GROUP_CARD_SPECIFIC_UPPER
    && useParetoUpper
    && cardSpecificCoefficientUpperBySlot
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityLeaderGroupCardSpecificCoefficientScoreUpperBound(
      slots,
      remainingSlotIndices,
      bannedCardIds,
      cardsByCharacter,
      profiling,
    )
    : null;
  if (
    leaderGroupCardSpecificCoefficientUpperBound !== null
    && Number.isFinite(leaderGroupCardSpecificCoefficientUpperBound)
    && leaderGroupCardSpecificCoefficientUpperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - leaderGroupCardSpecificCoefficientUpperBound;
      profiling.capacityLeaderGroupCardSpecificUpperImprovementCount += 1;
      profiling.capacityLeaderGroupCardSpecificUpperImprovementTotal += improvement;
      profiling.bestCapacityLeaderGroupCardSpecificUpperImprovement = Math.max(
        profiling.bestCapacityLeaderGroupCardSpecificUpperImprovement,
        improvement,
      );
    }
    upperBound = leaderGroupCardSpecificCoefficientUpperBound;
    mode = "leader-group-card-specific-coefficient";
  }

  const contextFixedCardSpecificCoefficientUpperBound = MEDLEY_ENABLE_CONTEXT_FIXED_CARD_SPECIFIC_UPPER
    && useParetoUpper
    && cardSpecificCoefficientUpperBySlot
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityContextFixedCardSpecificCoefficientScoreUpperBound(
      slots,
      remainingSlotIndices,
      bannedCardIds,
      cardsByCharacter,
      cardSpecificCoefficientUpperBySlot,
      profiling,
    )
    : null;
  if (
    contextFixedCardSpecificCoefficientUpperBound !== null
    && Number.isFinite(contextFixedCardSpecificCoefficientUpperBound)
    && contextFixedCardSpecificCoefficientUpperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - contextFixedCardSpecificCoefficientUpperBound;
      profiling.capacityContextFixedCardSpecificUpperImprovementCount += 1;
      profiling.capacityContextFixedCardSpecificUpperImprovementTotal += improvement;
      profiling.bestCapacityContextFixedCardSpecificUpperImprovement = Math.max(
        profiling.bestCapacityContextFixedCardSpecificUpperImprovement,
        improvement,
      );
    }
    upperBound = contextFixedCardSpecificCoefficientUpperBound;
    mode = "context-fixed-card-specific-coefficient";
  }

  const contextGroupCardSpecificCoefficientUpperBound = MEDLEY_ENABLE_CONTEXT_GROUP_CARD_SPECIFIC_UPPER
    && useParetoUpper
    && cardSpecificCoefficientUpperBySlot
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityContextGroupCardSpecificCoefficientScoreUpperBound(
      slots,
      remainingSlotIndices,
      bannedCardIds,
      cardsByCharacter,
      profiling,
    )
    : null;
  if (
    contextGroupCardSpecificCoefficientUpperBound !== null
    && Number.isFinite(contextGroupCardSpecificCoefficientUpperBound)
    && contextGroupCardSpecificCoefficientUpperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - contextGroupCardSpecificCoefficientUpperBound;
      profiling.capacityContextGroupCardSpecificUpperImprovementCount += 1;
      profiling.capacityContextGroupCardSpecificUpperImprovementTotal += improvement;
      profiling.bestCapacityContextGroupCardSpecificUpperImprovement = Math.max(
        profiling.bestCapacityContextGroupCardSpecificUpperImprovement,
        improvement,
      );
    }
    upperBound = contextGroupCardSpecificCoefficientUpperBound;
    mode = "context-group-card-specific-coefficient";
  }

  const contextBoundLagrangianUpperBound = MEDLEY_ENABLE_CONTEXT_BOUND_LAGRANGIAN_UPPER
    && useParetoUpper
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityContextBoundLagrangianScoreUpperBound(
      slots,
      remainingSlotIndices,
      bannedCardIds,
      cardsByCharacter,
      profiling,
    )
    : null;
  if (
    contextBoundLagrangianUpperBound !== null
    && contextBoundLagrangianUpperBound.upperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - contextBoundLagrangianUpperBound.upperBound;
      profiling.capacityContextBoundLagrangianUpperImprovementCount += 1;
      profiling.capacityContextBoundLagrangianUpperImprovementTotal += improvement;
      profiling.bestCapacityContextBoundLagrangianUpperImprovement = Math.max(
        profiling.bestCapacityContextBoundLagrangianUpperImprovement,
        improvement,
      );
      profiling.bestCapacityContextBoundLagrangianWeight = contextBoundLagrangianUpperBound.weight;
    }
    upperBound = contextBoundLagrangianUpperBound.upperBound;
    mode = "context-bound-lagrangian";
  }

  const contextBoundBucketedJointUpperBound = MEDLEY_ENABLE_CONTEXT_BOUND_BUCKETED_JOINT_UPPER
    && useParetoUpper
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityContextBoundBucketedJointScoreUpperBound(
      slots,
      remainingSlotIndices,
      bannedCardIds,
      cardsByCharacter,
      profiling,
    )
    : null;
  if (
    contextBoundBucketedJointUpperBound !== null
    && contextBoundBucketedJointUpperBound.upperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - contextBoundBucketedJointUpperBound.upperBound;
      profiling.capacityContextBoundBucketedJointUpperImprovementCount += 1;
      profiling.capacityContextBoundBucketedJointUpperImprovementTotal += improvement;
      profiling.bestCapacityContextBoundBucketedJointUpperImprovement = Math.max(
        profiling.bestCapacityContextBoundBucketedJointUpperImprovement,
        improvement,
      );
      profiling.capacityContextBoundBucketedJointUpperBucketSize = contextBoundBucketedJointUpperBound.bucketSize;
      profiling.capacityContextBoundBucketedJointUpperTargetBucketCount = (
        contextBoundBucketedJointUpperBound.targetBucketCount
      );
    }
    upperBound = contextBoundBucketedJointUpperBound.upperBound;
    mode = "context-bound-bucketed-joint";
  }

  const contextBoundMcCormickUpperBound = MEDLEY_ENABLE_CONTEXT_BOUND_MCCORMICK_UPPER
    && useParetoUpper
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityContextBoundMcCormickScoreUpperBound(
      slots,
      remainingSlotIndices,
      bannedCardIds,
      cardsByCharacter,
      profiling,
      enableTeamSharedCoefficientUpper,
    )
    : null;
  if (
    contextBoundMcCormickUpperBound !== null
    && Number.isFinite(contextBoundMcCormickUpperBound)
    && contextBoundMcCormickUpperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - contextBoundMcCormickUpperBound;
      profiling.capacityContextBoundMcCormickUpperImprovementCount += 1;
      profiling.capacityContextBoundMcCormickUpperImprovementTotal += improvement;
      profiling.bestCapacityContextBoundMcCormickUpperImprovement = Math.max(
        profiling.bestCapacityContextBoundMcCormickUpperImprovement,
        improvement,
      );
    }
    upperBound = contextBoundMcCormickUpperBound;
    mode = "context-bound-mccormick";
  }

  const cardMinCoefficientUpperBound = MEDLEY_ENABLE_CARD_MIN_COEFFICIENT_UPPER
    && useParetoUpper
    && cardSpecificCoefficientUpperBySlot
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityCardMinCoefficientScoreUpperBound(
      remainingSlotIndices,
      cardsByCharacter,
      cardSpecificCoefficientUpperBySlot,
      coefficientUpperBound,
      profiling,
    )
    : null;
  if (
    cardMinCoefficientUpperBound !== null
    && cardMinCoefficientUpperBound.upperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - cardMinCoefficientUpperBound.upperBound;
      profiling.capacityCardMinCoefficientUpperImprovementCount += 1;
      profiling.capacityCardMinCoefficientUpperImprovementTotal += improvement;
      profiling.bestCapacityCardMinCoefficientUpperImprovement = Math.max(
        profiling.bestCapacityCardMinCoefficientUpperImprovement,
        improvement,
      );
      profiling.capacityCardMinCoefficientUpperBucketSize = cardMinCoefficientUpperBound.bucketSize;
      profiling.capacityCardMinCoefficientUpperTargetBucketCount = cardMinCoefficientUpperBound.targetBucketCount;
    }
    upperBound = cardMinCoefficientUpperBound.upperBound;
    mode = "card-min-coefficient";
  }

  const cardBoundPowerUpperBySlot = useSkillAwareUpper
    ? buildMedleyCardBoundPowerUpperBySlot(slots, remainingSlotIndices, bannedCardIds)
    : null;
  const cardBoundSkillAwareUpperBound = cardBoundPowerUpperBySlot
    ? estimateMedleyCapacityCardBoundSkillAwareScoreUpperBound(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      cardBoundPowerUpperBySlot,
      profiling,
    )
    : null;
  if (
    cardBoundSkillAwareUpperBound !== null
    && Number.isFinite(cardBoundSkillAwareUpperBound)
    && cardBoundSkillAwareUpperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - cardBoundSkillAwareUpperBound;
      profiling.capacityCardBoundUpperImprovementCount += 1;
      profiling.capacityCardBoundUpperImprovementTotal += improvement;
      profiling.bestCapacityCardBoundUpperImprovement = Math.max(
        profiling.bestCapacityCardBoundUpperImprovement,
        improvement,
      );
    }
    upperBound = cardBoundSkillAwareUpperBound;
    mode = "card-bound-skill-aware";
  }

  const cardBoundLagrangianUpperBound = cardBoundPowerUpperBySlot
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityCardBoundLagrangianScoreUpperBound(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      slotCoefficients,
      cardBoundPowerUpperBySlot,
      profiling,
    )
    : null;
  if (
    cardBoundLagrangianUpperBound !== null
    && cardBoundLagrangianUpperBound.upperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - cardBoundLagrangianUpperBound.upperBound;
      profiling.capacityCardBoundLagrangianUpperImprovementCount += 1;
      profiling.capacityCardBoundLagrangianUpperImprovementTotal += improvement;
      profiling.bestCapacityCardBoundLagrangianUpperImprovement = Math.max(
        profiling.bestCapacityCardBoundLagrangianUpperImprovement,
        improvement,
      );
      profiling.bestCapacityCardBoundLagrangianWeight = cardBoundLagrangianUpperBound.weight;
    }
    upperBound = cardBoundLagrangianUpperBound.upperBound;
    mode = "card-bound-lagrangian";
  }

  const cardSpecificLagrangianUpperBound = MEDLEY_ENABLE_CARD_SPECIFIC_LAGRANGIAN_UPPER
    && cardBoundPowerUpperBySlot
    && cardSpecificCoefficientUpperBySlot
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityCardSpecificLagrangianScoreUpperBound(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      slotCoefficients,
      cardSpecificCoefficientUpperBySlot,
      cardBoundPowerUpperBySlot,
      profiling,
    )
    : null;
  if (
    cardSpecificLagrangianUpperBound !== null
    && cardSpecificLagrangianUpperBound.upperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - cardSpecificLagrangianUpperBound.upperBound;
      profiling.capacityCardSpecificLagrangianUpperImprovementCount += 1;
      profiling.capacityCardSpecificLagrangianUpperImprovementTotal += improvement;
      profiling.bestCapacityCardSpecificLagrangianUpperImprovement = Math.max(
        profiling.bestCapacityCardSpecificLagrangianUpperImprovement,
        improvement,
      );
      profiling.bestCapacityCardSpecificLagrangianWeight = cardSpecificLagrangianUpperBound.weight;
    }
    upperBound = cardSpecificLagrangianUpperBound.upperBound;
    mode = "card-specific-lagrangian";
  }

  const cardBoundBucketedJointUpperBound = cardBoundPowerUpperBySlot
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityCardBoundBucketedJointScoreUpperBound(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      slotCoefficients,
      cardBoundPowerUpperBySlot,
      coefficientUpperBound,
      profiling,
    )
    : null;
  if (
    cardBoundBucketedJointUpperBound !== null
    && cardBoundBucketedJointUpperBound.upperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - cardBoundBucketedJointUpperBound.upperBound;
      profiling.capacityCardBoundBucketedJointUpperImprovementCount += 1;
      profiling.capacityCardBoundBucketedJointUpperImprovementTotal += improvement;
      profiling.bestCapacityCardBoundBucketedJointUpperImprovement = Math.max(
        profiling.bestCapacityCardBoundBucketedJointUpperImprovement,
        improvement,
      );
      profiling.capacityCardBoundBucketedJointUpperBucketSize = cardBoundBucketedJointUpperBound.bucketSize;
      profiling.capacityCardBoundBucketedJointUpperTargetBucketCount = (
        cardBoundBucketedJointUpperBound.targetBucketCount
      );
    }
    upperBound = cardBoundBucketedJointUpperBound.upperBound;
    mode = "card-bound-bucketed-joint";
  }

  const cardBoundDualObjectiveUpperBound = MEDLEY_ENABLE_CARD_BOUND_DUAL_OBJECTIVE_UPPER
    && useParetoUpper
    && cardBoundPowerUpperBySlot
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityCardBoundDualObjectiveScoreUpperBound(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      slotCoefficients,
      cardBoundPowerUpperBySlot,
      profiling,
    )
    : null;
  if (
    cardBoundDualObjectiveUpperBound !== null
    && Number.isFinite(cardBoundDualObjectiveUpperBound)
    && cardBoundDualObjectiveUpperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - cardBoundDualObjectiveUpperBound;
      profiling.capacityCardBoundDualUpperImprovementCount += 1;
      profiling.capacityCardBoundDualUpperImprovementTotal += improvement;
      profiling.bestCapacityCardBoundDualUpperImprovement = Math.max(
        profiling.bestCapacityCardBoundDualUpperImprovement,
        improvement,
      );
    }
    upperBound = cardBoundDualObjectiveUpperBound;
    mode = "card-bound-dual-objective";
  }

  const bucketedUpperBound = useBucketedUpper
    ? estimateMedleyCapacityBucketedScoreUpperBound(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      slotPowerUpperBounds,
      profiling,
    )
    : null;
  if (bucketedUpperBound !== null && bucketedUpperBound < upperBound) {
    if (profiling && Number.isFinite(upperBound) && Number.isFinite(bucketedUpperBound)) {
      const improvement = upperBound - bucketedUpperBound;
      profiling.bestCapacityBucketedImprovement = Math.max(
        profiling.bestCapacityBucketedImprovement,
        improvement,
      );
      profiling.capacityBucketedUpperImprovementCount += 1;
      profiling.capacityBucketedUpperImprovementTotal += improvement;
    }
    upperBound = bucketedUpperBound;
    mode = "bucketed-capacity";
  }

  const dualObjectiveUpperBound = useParetoUpper
    ? estimateMedleyCapacityDualObjectiveScoreUpperBound(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      slotCoefficients,
      slotPowerUpperBounds,
      slotLeaderConstants.reduce((sum, value) => sum + value, 0),
      profiling,
    )
    : null;
  if (dualObjectiveUpperBound !== null && dualObjectiveUpperBound < upperBound) {
    if (profiling && Number.isFinite(upperBound) && Number.isFinite(dualObjectiveUpperBound)) {
      profiling.bestCapacityParetoImprovement = Math.max(
        profiling.bestCapacityParetoImprovement,
        upperBound - dualObjectiveUpperBound,
      );
    }
    upperBound = dualObjectiveUpperBound;
    mode = "dual-objective";
  }

  const fullParetoUpperBound = useParetoUpper && remainingSlotIndices.length === 2
    ? estimateMedleyCapacityParetoScoreUpperBound(
      slots,
      remainingSlotIndices,
      bannedCardIds,
      profiling,
    )
    : null;
  if (fullParetoUpperBound !== null && fullParetoUpperBound < upperBound) {
    if (profiling && Number.isFinite(upperBound) && Number.isFinite(fullParetoUpperBound)) {
      profiling.bestCapacityParetoImprovement = Math.max(
        profiling.bestCapacityParetoImprovement,
        upperBound - fullParetoUpperBound,
      );
    }
    upperBound = fullParetoUpperBound;
    mode = "pareto";
  }

  return {
    upperBound,
    coefficientUpperBound,
    skillAwareUpperBound,
    paretoUpperBound: fullParetoUpperBound
      ?? dualObjectiveUpperBound
      ?? cardBoundDualObjectiveUpperBound
      ?? cardBoundBucketedJointUpperBound?.upperBound
      ?? cardBoundLagrangianUpperBound?.upperBound
      ?? cardMinCoefficientUpperBound?.upperBound
      ?? contextBoundBucketedJointUpperBound?.upperBound
      ?? contextBoundMcCormickUpperBound
      ?? cardSpecificCoefficientUpperBound
      ?? bucketedUpperBound,
    mode,
  };
}

function estimateMedleyRemainingScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
  useContextualSkillUpper = false,
  useSkillAwareCapacityUpper = false,
  useParetoCapacityUpper = false,
  useBucketedCapacityUpper = false,
  enableTeamSharedCoefficientUpper = false,
): number {
  if (remainingSlotIndices.length === 0) {
    return 0;
  }

  const correlatedSlotUpperBounds: number[] = [];
  let correlatedSlotUpperBound = 0;
  for (const slotIndex of remainingSlotIndices) {
    const slotUpperBound = estimateMedleySlotBranchScoreUpperBound(
      slots[slotIndex],
      [],
      0,
      bannedCardIds,
      0,
      0,
      0,
      profiling,
      useContextualSkillUpper,
    );
    if (!Number.isFinite(slotUpperBound)) {
      return Number.NEGATIVE_INFINITY;
    }
    correlatedSlotUpperBounds.push(slotUpperBound);
    correlatedSlotUpperBound += slotUpperBound;
  }

  const capacityAssignmentUpperBound = estimateMedleyCapacityAssignmentScoreUpperBound(
    slots,
    remainingSlotIndices,
    bannedCardIds,
    profiling,
    useSkillAwareCapacityUpper && remainingSlotIndices.length > 1,
    useParetoCapacityUpper && remainingSlotIndices.length > 1,
    useBucketedCapacityUpper && remainingSlotIndices.length > 1,
    enableTeamSharedCoefficientUpper && remainingSlotIndices.length === MEDLEY_TEAM_COUNT,
  );

  let capacityUpperBound = capacityAssignmentUpperBound.upperBound;
  let capacityUpperBoundMode = capacityAssignmentUpperBound.mode;
  if (useParetoCapacityUpper && remainingSlotIndices.length === MEDLEY_TEAM_COUNT) {
    let relaxedPairParetoUpperBound = Number.POSITIVE_INFINITY;
    for (let omittedSlotPosition = 0; omittedSlotPosition < remainingSlotIndices.length; omittedSlotPosition += 1) {
      const pairSlotIndices = remainingSlotIndices.filter((_, slotPosition) => slotPosition !== omittedSlotPosition);
      const pairParetoUpperBound = estimateMedleyCapacityParetoScoreUpperBound(
        slots,
        pairSlotIndices,
        bannedCardIds,
        profiling,
      );
      if (pairParetoUpperBound === null || !Number.isFinite(pairParetoUpperBound)) {
        continue;
      }
      relaxedPairParetoUpperBound = Math.min(
        relaxedPairParetoUpperBound,
        pairParetoUpperBound + correlatedSlotUpperBounds[omittedSlotPosition],
      );
    }
    if (relaxedPairParetoUpperBound < capacityUpperBound) {
      if (profiling && Number.isFinite(capacityUpperBound)) {
        profiling.bestCapacityParetoImprovement = Math.max(
          profiling.bestCapacityParetoImprovement,
          capacityUpperBound - relaxedPairParetoUpperBound,
        );
      }
      capacityUpperBound = relaxedPairParetoUpperBound;
      capacityUpperBoundMode = "pareto-relaxed-pair";
    }
  }

  const upperBound = Math.min(capacityUpperBound, correlatedSlotUpperBound);
  if (
    profiling
    && Number.isFinite(upperBound)
    && upperBound > (profiling.remainingUpperBoundMax ?? Number.NEGATIVE_INFINITY)
  ) {
    profiling.remainingUpperBoundMax = upperBound;
    profiling.remainingUpperBoundMaxCorrelated = correlatedSlotUpperBound;
    profiling.remainingUpperBoundMaxCapacity = capacityUpperBound;
    profiling.remainingUpperBoundMaxCapacityMode = capacityUpperBoundMode;
    profiling.remainingUpperBoundMaxSlotCount = remainingSlotIndices.length;
    profiling.remainingUpperBoundMaxLimiter = capacityUpperBound <= correlatedSlotUpperBound
      ? "capacity"
      : "correlated";
  }

  return upperBound;
}

function estimateMedleySlotAvailability(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
  useContextualSkillUpper = false,
): MedleySlotAvailability {
  const availableCharacterIds = new Set<number>();
  let availableCardCount = 0;
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId)) {
      continue;
    }
    availableCardCount += 1;
    availableCharacterIds.add(card.characterId);
  }

  return {
    availableCardCount,
    availableCharacterCount: availableCharacterIds.size,
    scoreUpperBound: estimateMedleySlotBranchScoreUpperBound(
      slot,
      [],
      0,
      bannedCardIds,
      0,
      0,
      0,
      profiling,
      useContextualSkillUpper,
    ),
  };
}

function chooseNextMedleySlotIndex(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  getMinimumScore?: (slotIndex: number) => number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
  useContextualSkillUpper = false,
): number {
  let selectedSlotIndex = remainingSlotIndices[0] ?? 0;
  let selectedAvailability: MedleySlotAvailability | null = null;
  let selectedSlack = Number.POSITIVE_INFINITY;

  for (const slotIndex of remainingSlotIndices) {
    const availability = estimateMedleySlotAvailability(slots[slotIndex], bannedCardIds, profiling, useContextualSkillUpper);
    const minimumScore = getMinimumScore?.(slotIndex) ?? Number.NEGATIVE_INFINITY;
    const slack = availability.scoreUpperBound - minimumScore;
    if (
      !selectedAvailability
      || availability.availableCharacterCount < selectedAvailability.availableCharacterCount
      || (
        getMinimumScore
        && availability.availableCharacterCount === selectedAvailability.availableCharacterCount
        && slack < selectedSlack
      )
      || (
        availability.availableCharacterCount === selectedAvailability.availableCharacterCount
        && (!getMinimumScore || slack === selectedSlack)
        && availability.availableCardCount < selectedAvailability.availableCardCount
      )
      || (
        availability.availableCharacterCount === selectedAvailability.availableCharacterCount
        && (!getMinimumScore || slack === selectedSlack)
        && availability.availableCardCount === selectedAvailability.availableCardCount
        && availability.scoreUpperBound > selectedAvailability.scoreUpperBound
      )
    ) {
      selectedSlotIndex = slotIndex;
      selectedAvailability = availability;
      selectedSlack = slack;
    }
  }

  return selectedSlotIndex;
}

function getMedleyDominanceVector(card: SearchCard): number[] {
  return [
    card.effectivePower,
    card.skillUpperRate,
    card.skillAverageRate,
    card.skillLeaderRate,
    card.skillSameBandAverageRate,
    card.skillSameBandLeaderRate,
    card.skillSameAttributeAverageRate,
    card.skillSameAttributeLeaderRate,
    card.skillBothAverageRate,
    card.skillBothLeaderRate,
    card.skillMixedAverageRate,
    card.skillMixedLeaderRate,
  ];
}

function medleyCardDominatesInSlot(
  leftCardId: number,
  leftCard: SearchCard,
  rightCardId: number,
  rightCard: SearchCard,
): boolean {
  let strictlyGreater = false;
  const leftVector = getMedleyDominanceVector(leftCard);
  const rightVector = getMedleyDominanceVector(rightCard);
  for (let valueIndex = 0; valueIndex < leftVector.length; valueIndex += 1) {
    const delta = leftVector[valueIndex] - rightVector[valueIndex];
    if (delta < -0.000001) {
      return false;
    }
    if (delta > 0.000001) {
      strictlyGreater = true;
    }
  }
  return strictlyGreater || leftCardId < rightCardId;
}

function pruneDominatedMedleySlotCards(slots: MedleySlotSearch[]): MedleySlotSearch[] {
  if (slots.length !== MEDLEY_TEAM_COUNT) {
    return slots;
  }

  const cardsById = new Map<number, SearchCard[]>();
  for (const slot of slots) {
    for (const card of slot.searchCards) {
      const records = cardsById.get(card.cardId) ?? [];
      records[slot.songIndex] = card;
      cardsById.set(card.cardId, records);
    }
  }

  const completeCardsById = [...cardsById.entries()]
    .filter((entry): entry is [number, SearchCard[]] => entry[1].filter(Boolean).length === MEDLEY_TEAM_COUNT);
  const entriesByCharacter = new Map<number, Array<[number, SearchCard[]]>>();
  for (const entry of completeCardsById) {
    const characterId = entry[1][0].characterId;
    const entries = entriesByCharacter.get(characterId) ?? [];
    entries.push(entry);
    entriesByCharacter.set(characterId, entries);
  }

  const removedCardIds = new Set<number>();
  for (const entries of entriesByCharacter.values()) {
    if (entries.length <= MEDLEY_TEAM_COUNT) {
      continue;
    }
    for (const [cardId, cards] of entries) {
      let isDominatedInEverySlot = true;
      for (let slotIndex = 0; slotIndex < MEDLEY_TEAM_COUNT; slotIndex += 1) {
        let dominatorCount = 0;
        for (const [otherCardId, otherCards] of entries) {
          if (otherCardId === cardId) {
            continue;
          }
          if (medleyCardDominatesInSlot(otherCardId, otherCards[slotIndex], cardId, cards[slotIndex])) {
            dominatorCount += 1;
            if (dominatorCount >= MEDLEY_TEAM_COUNT) {
              break;
            }
          }
        }
        if (dominatorCount < MEDLEY_TEAM_COUNT) {
          isDominatedInEverySlot = false;
          break;
        }
      }
      if (isDominatedInEverySlot) {
        removedCardIds.add(cardId);
      }
    }
  }

  if (removedCardIds.size === 0) {
    return slots;
  }

  return slots.map((slot) => {
    const searchCards = slot.searchCards.filter((card) => !removedCardIds.has(card.cardId));
    return rebuildMedleySlotWithSearchCards(slot, searchCards);
  });
}

function getMedleyCharacterMask(
  slot: MedleySlotSearch,
  card: SearchCard,
): { low: number; high: number } | null {
  const characterIndex = slot.upperBoundIndex.characterIndexById.get(card.characterId);
  if (characterIndex === undefined) {
    return null;
  }
  if (characterIndex < CHARACTER_MASK_SEGMENT_BITS) {
    return {
      low: 1 << characterIndex,
      high: 0,
    };
  }
  return {
    low: 0,
    high: 1 << (characterIndex - CHARACTER_MASK_SEGMENT_BITS),
  };
}

function estimateMedleyForcedCardScoreUpperBound(
  slots: MedleySlotSearch[],
  slotIndex: number,
  cardId: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): number {
  const slot = slots[slotIndex];
  const card = slot.searchCards.find((searchCard) => searchCard.cardId === cardId);
  if (!card) {
    return Number.NEGATIVE_INFINITY;
  }
  const characterMask = getMedleyCharacterMask(slot, card);
  if (!characterMask) {
    return Number.NEGATIVE_INFINITY;
  }
  const bannedCardIds = new Set<number>([cardId]);
  const forcedSlotUpperBound = estimateMedleySlotBranchScoreUpperBound(
    slot,
    [card],
    0,
    bannedCardIds,
    characterMask.low,
    characterMask.high,
    card.effectivePower,
    profiling,
    true,
  );
  if (!Number.isFinite(forcedSlotUpperBound)) {
    return Number.NEGATIVE_INFINITY;
  }
  const remainingSlotIndices = slots
    .map((_, index) => index)
    .filter((index) => index !== slotIndex);
  const remainingUpperBound = estimateMedleyRemainingScoreUpperBound(
    slots,
    remainingSlotIndices,
    bannedCardIds,
    profiling,
    true,
    true,
    false,
    false,
    false,
  );
  return Number.isFinite(remainingUpperBound)
    ? forcedSlotUpperBound + remainingUpperBound
    : Number.NEGATIVE_INFINITY;
}

function pruneMedleyCardsByInclusionUpper(
  slots: MedleySlotSearch[],
  threshold: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): MedleySlotSearch[] {
  if (slots.length !== MEDLEY_TEAM_COUNT || !Number.isFinite(threshold)) {
    return slots;
  }

  const cardIds = [...new Set(slots.flatMap((slot) => slot.searchCards.map((card) => card.cardId)))];
  profiling.inclusionUpperAnalysisCount += cardIds.length;
  const removedCardIds = new Set<number>();
  for (const cardId of cardIds) {
    let forcedUpperBound = Number.NEGATIVE_INFINITY;
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      forcedUpperBound = Math.max(
        forcedUpperBound,
        estimateMedleyForcedCardScoreUpperBound(slots, slotIndex, cardId, profiling),
      );
    }
    if (forcedUpperBound < threshold) {
      removedCardIds.add(cardId);
    }
  }

  if (removedCardIds.size === 0) {
    return slots;
  }
  profiling.inclusionUpperPrunedCardCount += removedCardIds.size;
  return slots.map((slot) => {
    const searchCards = slot.searchCards.filter((card) => !removedCardIds.has(card.cardId));
    return rebuildMedleySlotWithSearchCards(slot, searchCards);
  });
}

function rebuildMedleySlotWithSearchCards(slot: MedleySlotSearch, searchCards: SearchCard[]): MedleySlotSearch {
  const upperBoundIndex = buildCharacterUpperBoundIndex(searchCards);
  return {
    ...slot,
    searchCards,
    upperBoundIndex,
    rootScoreUpperBound: estimateSearchScopeScoreUpperBound(
      [],
      upperBoundIndex,
      searchCards,
      0,
      0,
      0,
      slot.baseScoreRatePerPower,
    ),
    teamEvaluationCache: new Map(),
  };
}

function enumerateMedleySlotTeams(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  getMinimumScore: (selectedCards: SearchCard[]) => number,
  observeUpperBound: (upperBound: number) => void,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  onTeam: (candidate: MedleyTeamCandidate) => void,
  useContextualSkillUpper = false,
): void {
  const selectedCards: SearchCard[] = [];
  let selectedPower = 0;
  let usedCharacterMaskLow = 0;
  let usedCharacterMaskHigh = 0;

  const visit = (startIndex: number): void => {
    if (stats.timedOut || isPastDeadline()) {
      stats.isExhaustive = false;
      stats.timedOut = true;
      stats.searchMode = "bounded";
      return;
    }

    const remaining = 5 - selectedCards.length;
    if (remaining === 0) {
      stats.enumeratedTeamCount += 1;
      const cacheKey = getMedleyTeamEvaluationCacheKey(selectedCards);
      let result = slot.teamEvaluationCache.get(cacheKey);
      if (!slot.teamEvaluationCache.has(cacheKey)) {
        profiling.teamEvaluationCacheMissCount += 1;
        result = evaluateTeam(
          selectedCards,
          slot.input,
          slot.chart,
          slot.configuration,
          server,
          perfectRate,
          slot.scoreCache,
          slot.comboOptions,
        );
        slot.teamEvaluationCache.set(cacheKey, result);
        stats.evaluatedTeamCount += 1;
      } else {
        profiling.teamEvaluationCacheHitCount += 1;
      }
      if (result && result.score >= getMinimumScore(selectedCards)) {
        onTeam({
          result,
          cards: [...selectedCards],
          cardIds: selectedCards.map((card) => card.cardId),
        });
      }
      return;
    }

    if (slot.searchCards.length - startIndex < remaining) {
      return;
    }

    const minimumScore = getMinimumScore(selectedCards);
    const contextBranchScoreUpperBound = estimateSearchScopeScoreUpperBound(
      selectedCards,
      slot.upperBoundIndex,
      slot.searchCards,
      startIndex,
      usedCharacterMaskLow,
      usedCharacterMaskHigh,
      slot.baseScoreRatePerPower,
      undefined,
      selectedPower,
    );
    if (!Number.isFinite(contextBranchScoreUpperBound) || contextBranchScoreUpperBound < minimumScore) {
      stats.prunedBranchCount += 1;
      return;
    }
    const bannedAwareBranchScoreUpperBound = estimateMedleySlotBranchScoreUpperBound(
      slot,
      selectedCards,
      startIndex,
      bannedCardIds,
      usedCharacterMaskLow,
      usedCharacterMaskHigh,
      selectedPower,
      profiling,
      useContextualSkillUpper,
    );
    const branchScoreUpperBound = Math.min(contextBranchScoreUpperBound, bannedAwareBranchScoreUpperBound);
    if (!Number.isFinite(branchScoreUpperBound) || branchScoreUpperBound < minimumScore) {
      stats.prunedBranchCount += 1;
      return;
    }
    observeUpperBound(branchScoreUpperBound);

    for (let index = startIndex; index < slot.searchCards.length; index += 1) {
      const card = slot.searchCards[index];
      if (bannedCardIds.has(card.cardId)) {
        continue;
      }
      const characterIndex = slot.upperBoundIndex.characterIndexById.get(card.characterId);
      if (characterIndex === undefined || hasCharacterIndexInMask(usedCharacterMaskLow, usedCharacterMaskHigh, characterIndex)) {
        continue;
      }
      const isLowCharacterMask = characterIndex < CHARACTER_MASK_SEGMENT_BITS;
      const characterBit = isLowCharacterMask
        ? 1 << characterIndex
        : 1 << (characterIndex - CHARACTER_MASK_SEGMENT_BITS);

      selectedCards.push(card);
      selectedPower += card.effectivePower;
      if (isLowCharacterMask) {
        usedCharacterMaskLow |= characterBit;
      } else {
        usedCharacterMaskHigh |= characterBit;
      }
      visit(index + 1);
      if (isLowCharacterMask) {
        usedCharacterMaskLow &= ~characterBit;
      } else {
        usedCharacterMaskHigh &= ~characterBit;
      }
      selectedPower -= card.effectivePower;
      selectedCards.pop();
      if (stats.timedOut) {
        return;
      }
    }
  };

  visit(0);
}

function findBestMedleySlotTeam(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  observeUpperBound: (upperBound: number) => void,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  minimumScore = Number.NEGATIVE_INFINITY,
  useContextualSkillUpper = false,
): MedleyTeamCandidate | null {
  let best: MedleyTeamCandidate | null = null;
  enumerateMedleySlotTeams(
    slot,
    bannedCardIds,
    server,
    perfectRate,
    stats,
    isPastDeadline,
    () => Math.max(best?.result.score ?? Number.NEGATIVE_INFINITY, minimumScore),
    observeUpperBound,
    profiling,
    (candidate) => {
      if (!best || candidate.result.score > best.result.score) {
        best = candidate;
      }
    },
    useContextualSkillUpper,
  );
  return best;
}

function getMedleyBestSlotTeamCacheKey(slotIndex: number, bannedCardIds: Set<number>): string {
  return `${slotIndex}:${[...bannedCardIds].sort((left, right) => left - right).join(",")}`;
}

function findBestMedleySlotTeamWithCache(
  cache: Map<string, MedleyBestSlotTeamCacheEntry>,
  slotIndex: number,
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  observeUpperBound: (upperBound: number) => void,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  minimumScore = Number.NEGATIVE_INFINITY,
  useContextualSkillUpper = false,
): MedleyTeamCandidate | null {
  const key = getMedleyBestSlotTeamCacheKey(slotIndex, bannedCardIds);
  const cached = cache.get(key);
  if (cached) {
    profiling.bestSlotTeamCacheHitCount += 1;
    return (cached.candidate?.result.score ?? Number.NEGATIVE_INFINITY) >= minimumScore
      ? cached.candidate
      : null;
  }
  profiling.bestSlotTeamCacheMissCount += 1;

  const shouldCache = !Number.isFinite(minimumScore);
  const candidate = findBestMedleySlotTeam(
    slot,
    bannedCardIds,
    server,
    perfectRate,
    stats,
    isPastDeadline,
    observeUpperBound,
    profiling,
    minimumScore,
    useContextualSkillUpper,
  );
  if (shouldCache && !stats.timedOut) {
    cache.set(key, { candidate });
  }
  return candidate;
}

function estimateRelaxedMedleyRemainingBestScoreUpperBound(
  cache: Map<string, MedleyBestSlotTeamCacheEntry>,
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  useContextualSkillUpper = false,
): number {
  let upperBound = 0;
  for (const slotIndex of remainingSlotIndices) {
    const candidate = findBestMedleySlotTeamWithCache(
      cache,
      slotIndex,
      slots[slotIndex],
      bannedCardIds,
      server,
      perfectRate,
      stats,
      isPastDeadline,
      () => undefined,
      profiling,
      Number.NEGATIVE_INFINITY,
      useContextualSkillUpper,
    );
    if (stats.timedOut) {
      return Number.NEGATIVE_INFINITY;
    }
    if (!candidate) {
      return Number.NEGATIVE_INFINITY;
    }
    upperBound += candidate.result.score;
  }
  return upperBound;
}

function sortMedleyCandidates(candidates: MedleyTeamCandidate[]): void {
  candidates.sort((left, right) => (
    right.result.score - left.result.score
    || right.result.maxScore - left.result.maxScore
    || left.cardIds.join(",").localeCompare(right.cardIds.join(","))
  ));
}

function pushMedleyCandidate(candidates: MedleyTeamCandidate[], candidate: MedleyTeamCandidate, limit: number): void {
  candidates.push(candidate);
  sortMedleyCandidates(candidates);
  if (candidates.length > limit) {
    candidates.pop();
  }
}

const fixedMedleyCardSetMaskCache = new Map<number, number[]>();

type FixedMedleyCardSetMaskEntry = {
  mask: number;
  indices: readonly [number, number, number, number, number];
};

const fixedMedleyCardSetMaskEntryCache = new Map<number, FixedMedleyCardSetMaskEntry[]>();

function getFixedMedleyCardSetMasks(cardCount: number): number[] {
  const cached = fixedMedleyCardSetMaskCache.get(cardCount);
  if (cached) {
    return cached;
  }

  const masks: number[] = [];
  const visit = (startIndex: number, remaining: number, mask: number): void => {
    if (remaining === 0) {
      masks.push(mask);
      return;
    }
    for (let index = startIndex; index <= cardCount - remaining; index += 1) {
      visit(index + 1, remaining - 1, mask | (1 << index));
    }
  };
  visit(0, MEDLEY_TEAM_SIZE, 0);
  fixedMedleyCardSetMaskCache.set(cardCount, masks);
  return masks;
}

function getFixedMedleyCardSetMaskEntries(cardCount: number): FixedMedleyCardSetMaskEntry[] {
  const cached = fixedMedleyCardSetMaskEntryCache.get(cardCount);
  if (cached) {
    return cached;
  }
  const entries = getFixedMedleyCardSetMasks(cardCount).map((mask) => {
    const indices: number[] = [];
    for (let index = 0; index < cardCount; index += 1) {
      if ((mask & (1 << index)) !== 0) {
        indices.push(index);
      }
    }
    return {
      mask,
      indices: indices as [number, number, number, number, number],
    };
  });
  fixedMedleyCardSetMaskEntryCache.set(cardCount, entries);
  return entries;
}

function getFixedMedleyCardSetCacheKey(cardIds: number[]): string {
  return [...cardIds].sort((left, right) => left - right).join(",");
}

function getCardsForFixedMedleyMaskIndices(
  cards: SearchCard[],
  indices: readonly [number, number, number, number, number],
): SearchCard[] {
  return [
    cards[indices[0]],
    cards[indices[1]],
    cards[indices[2]],
    cards[indices[3]],
    cards[indices[4]],
  ];
}

function hasUniqueFixedMedleyCharacters(
  characterIds: readonly number[],
  indices: readonly [number, number, number, number, number],
): boolean {
  const first = characterIds[indices[0]];
  const second = characterIds[indices[1]];
  const third = characterIds[indices[2]];
  const fourth = characterIds[indices[3]];
  const fifth = characterIds[indices[4]];
  return first !== second
    && first !== third
    && first !== fourth
    && first !== fifth
    && second !== third
    && second !== fourth
    && second !== fifth
    && third !== fourth
    && third !== fifth
    && fourth !== fifth;
}

function evaluateFixedMedleyMaskCandidate(
  slot: MedleySlotSearch,
  selectedCards: SearchCard[],
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): MedleyTeamCandidate | null {
  stats.enumeratedTeamCount += 1;
  const cacheKey = getMedleyTeamEvaluationCacheKey(selectedCards);
  let result = slot.teamEvaluationCache.get(cacheKey);
  if (!slot.teamEvaluationCache.has(cacheKey)) {
    profiling.teamEvaluationCacheMissCount += 1;
    result = evaluateTeam(
      selectedCards,
      slot.input,
      slot.chart,
      slot.configuration,
      server,
      perfectRate,
      slot.scoreCache,
      slot.comboOptions,
    );
    slot.teamEvaluationCache.set(cacheKey, result);
    stats.evaluatedTeamCount += 1;
  } else {
    profiling.teamEvaluationCacheHitCount += 1;
  }

  return result
    ? {
      result,
      cards: selectedCards,
      cardIds: selectedCards.map((card) => card.cardId),
    }
    : null;
}

function compareMedleyTeamCandidates(
  left: MedleyTeamCandidate | null,
  right: MedleyTeamCandidate | null,
): MedleyTeamCandidate | null {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return right.result.score > left.result.score
    || (right.result.score === left.result.score && right.result.maxScore > left.result.maxScore)
    ? right
    : left;
}

function optimizeMedleyCardPool(
  cardIds: number[],
  slots: MedleySlotSearch[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): BandoriMedleyTeamSearchResult | null {
  if (
    slots.length !== MEDLEY_TEAM_COUNT
    || cardIds.length < MEDLEY_TEAM_COUNT * MEDLEY_TEAM_SIZE
    || cardIds.length > 18
  ) {
    return null;
  }
  if (new Set(cardIds).size !== cardIds.length) {
    return null;
  }

  const slotCards = slots.map((slot) => {
    const cardsById = new Map(slot.searchCards.map((card) => [card.cardId, card]));
    return cardIds.map((cardId) => cardsById.get(cardId) ?? null);
  });
  if (slotCards.some((cards) => cards.some((card) => card === null))) {
    return null;
  }

  const maskEntries = getFixedMedleyCardSetMaskEntries(cardIds.length);
  const characterIds = (slotCards[0] as SearchCard[]).map((card) => card.characterId);
  const validMaskEntries = maskEntries.filter(({ indices }) => hasUniqueFixedMedleyCharacters(characterIds, indices));
  const candidatesBySlot = slotCards.map((cards, slotIndex) => {
    const typedCards = cards as SearchCard[];
    const candidates: Array<{ mask: number; candidate: MedleyTeamCandidate }> = [];
    for (const { mask, indices } of validMaskEntries) {
      const candidate = evaluateFixedMedleyMaskCandidate(
        slots[slotIndex],
        getCardsForFixedMedleyMaskIndices(typedCards, indices),
        server,
        perfectRate,
        stats,
        profiling,
      );
      if (candidate) {
        candidates.push({ mask, candidate });
      }
    }
    return candidates.sort((left, right) => right.candidate.result.score - left.candidate.result.score);
  });

  const fullMask = (1 << cardIds.length) - 1;
  const bestThirdByAvailableMask: Array<MedleyTeamCandidate | null> = Array.from(
    { length: fullMask + 1 },
    () => null,
  );
  for (const { mask, candidate } of candidatesBySlot[2]) {
    bestThirdByAvailableMask[mask] = compareMedleyTeamCandidates(bestThirdByAvailableMask[mask], candidate);
  }
  for (let bitIndex = 0; bitIndex < cardIds.length; bitIndex += 1) {
    const bit = 1 << bitIndex;
    for (let mask = 0; mask <= fullMask; mask += 1) {
      if ((mask & bit) !== 0) {
        bestThirdByAvailableMask[mask] = compareMedleyTeamCandidates(
          bestThirdByAvailableMask[mask],
          bestThirdByAvailableMask[mask ^ bit],
        );
      }
    }
  }

  let bestResult: BandoriMedleyTeamSearchResult | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  const bestSecondScore = candidatesBySlot[1][0]?.candidate.result.score ?? Number.NEGATIVE_INFINITY;
  const bestThirdScore = candidatesBySlot[2][0]?.candidate.result.score ?? Number.NEGATIVE_INFINITY;
  for (const { mask: firstMask, candidate: firstCandidate } of candidatesBySlot[0]) {
    if (firstCandidate.result.score + bestSecondScore + bestThirdScore < bestScore) {
      break;
    }
    for (const { mask: secondMask, candidate: secondCandidate } of candidatesBySlot[1]) {
      if (firstCandidate.result.score + secondCandidate.result.score + bestThirdScore < bestScore) {
        break;
      }
      if ((firstMask & secondMask) !== 0) {
        continue;
      }
      const thirdCandidate = bestThirdByAvailableMask[fullMask ^ firstMask ^ secondMask];
      if (!thirdCandidate) {
        continue;
      }
      const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
      selectedBySong[slots[0].songIndex] = firstCandidate;
      selectedBySong[slots[1].songIndex] = secondCandidate;
      selectedBySong[slots[2].songIndex] = thirdCandidate;
      const result = buildMedleyResult(slots, selectedBySong, configuration);
      if (
        result
        && (
          !bestResult
          || result.score > bestResult.score
          || (result.score === bestResult.score && result.maxScore > bestResult.maxScore)
        )
      ) {
        bestResult = result;
        bestScore = result.score;
      }
    }
  }

  return bestResult;
}

function optimizeFixedMedleyCardSet(
  cardIds: number[],
  slots: MedleySlotSearch[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): BandoriMedleyTeamSearchResult | null {
  profiling.fixedCardSetOptimizationCount += 1;
  if (cardIds.length !== MEDLEY_TEAM_COUNT * MEDLEY_TEAM_SIZE) {
    return null;
  }
  return optimizeMedleyCardPool(
    cardIds,
    slots,
    configuration,
    server,
    perfectRate,
    stats,
    profiling,
  );
}

function optimizeFixedMedleyCardSetWithCache(
  cache: Map<string, MedleyFixedCardSetOptimizationCacheEntry>,
  cardIds: number[],
  slots: MedleySlotSearch[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): BandoriMedleyTeamSearchResult | null {
  const key = getFixedMedleyCardSetCacheKey(cardIds);
  const cached = cache.get(key);
  if (cached) {
    profiling.fixedCardSetOptimizationCacheHitCount += 1;
    return cached.result;
  }
  profiling.fixedCardSetOptimizationCacheMissCount += 1;
  const result = optimizeFixedMedleyCardSet(
    cardIds,
    slots,
    configuration,
    server,
    perfectRate,
    stats,
    profiling,
  );
  cache.set(key, { result });
  return result;
}

function pushMedleySeedResult(
  results: BandoriMedleyTeamSearchResult[],
  result: BandoriMedleyTeamSearchResult,
  resultLimit: number,
  slots: MedleySlotSearch[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  fixedCardSetOptimizationCache: Map<string, MedleyFixedCardSetOptimizationCacheEntry>,
): BandoriMedleyTeamSearchResult {
  let bestResult = result;
  const optimized = optimizeFixedMedleyCardSetWithCache(
    fixedCardSetOptimizationCache,
    result.cardIds,
    slots,
    configuration,
    server,
    perfectRate,
    stats,
    profiling,
  );
  if (optimized && optimized.score > result.score) {
    const improvement = optimized.score - result.score;
    profiling.fixedCardSetImprovementCount += 1;
    profiling.bestFixedCardSetImprovement = Math.max(profiling.bestFixedCardSetImprovement, improvement);
    bestResult = optimized;
  }
  pushMedleyResult(results, bestResult, resultLimit);
  return bestResult;
}

function collectTopMedleySlotTeams(
  slot: MedleySlotSearch,
  limit: number,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  observeUpperBound: (upperBound: number) => void,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  bannedCardIds: Set<number> = new Set<number>(),
  useContextualSkillUpper = false,
): MedleyTeamCandidate[] {
  const candidates: MedleyTeamCandidate[] = [];
  enumerateMedleySlotTeams(
    slot,
    bannedCardIds,
    server,
    perfectRate,
    stats,
    isPastDeadline,
    () => candidates.length >= limit ? candidates[limit - 1]?.result.score ?? Number.NEGATIVE_INFINITY : Number.NEGATIVE_INFINITY,
    observeUpperBound,
    profiling,
    (candidate) => pushMedleyCandidate(candidates, candidate, limit),
    useContextualSkillUpper,
  );
  return candidates;
}

function estimateMedleyAnchorSlotDecompositionUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  slotCandidates: MedleyTeamCandidate[][],
  slotCandidateLimits: number[],
  getRemainingUpperBound: (
    remainingSlotIndices: number[],
    bannedCards: Set<number>,
    useContextualSkillUpper?: boolean,
    useSkillAwareCapacityUpper?: boolean,
    useParetoCapacityUpper?: boolean,
    useBucketedCapacityUpper?: boolean,
  ) => number,
  useContextualSkillUpper: boolean,
  useSkillAwareCapacityUpper: boolean,
  useParetoCapacityUpper: boolean,
  useBucketedCapacityUpper: boolean,
  requestedCandidateLimit: number | null,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): MedleyAnchorSlotUpperEstimate | null {
  profiling.capacityAnchorSlotUpperCallCount += 1;
  const startedAt = performance.now();
  if (remainingSlotIndices.length !== MEDLEY_TEAM_COUNT || bannedCardIds.size > 0) {
    profiling.capacityAnchorSlotUpperAbortCount += 1;
    return null;
  }

  const candidateLimit = Math.max(
    1,
    Math.trunc(requestedCandidateLimit ?? MEDLEY_DEFAULT_ANCHOR_CANDIDATE_LIMIT),
  );
  let bestEstimate: MedleyAnchorSlotUpperEstimate | null = null;
  let totalSelectedCount = 0;
  const anchorSlotIndices = [...remainingSlotIndices].sort((left, right) => (
    slots[right].rootScoreUpperBound - slots[left].rootScoreUpperBound
    || slots[right].startCombo - slots[left].startCombo
    || right - left
  ));
  for (const anchorSlotIndex of anchorSlotIndices) {
    const candidates = slotCandidates[anchorSlotIndex] ?? [];
    const selectedCount = Math.min(candidates.length, candidateLimit);
    if (selectedCount <= 0) {
      continue;
    }

    const futureSlotIndices = remainingSlotIndices.filter((slotIndex) => slotIndex !== anchorSlotIndex);
    let upperBound = Number.NEGATIVE_INFINITY;
    for (let candidateIndex = 0; candidateIndex < selectedCount; candidateIndex += 1) {
      const candidate = candidates[candidateIndex];
      const candidateBannedCardIds = new Set(bannedCardIds);
      candidate.cardIds.forEach((cardId) => candidateBannedCardIds.add(cardId));
      const futureUpperBound = getRemainingUpperBound(
        futureSlotIndices,
        candidateBannedCardIds,
        useContextualSkillUpper,
        useSkillAwareCapacityUpper,
        useParetoCapacityUpper,
        useBucketedCapacityUpper,
      );
      if (Number.isFinite(futureUpperBound)) {
        upperBound = Math.max(upperBound, candidate.result.score + futureUpperBound);
      }
    }

    const originalCandidateLimit = slotCandidateLimits[anchorSlotIndex] ?? candidates.length;
    const mayHaveUnenumeratedOrUnselectedAnchorTeams = selectedCount < candidates.length
      || candidates.length >= originalCandidateLimit;
    const tailUpper = mayHaveUnenumeratedOrUnselectedAnchorTeams
      ? candidates[selectedCount - 1]?.result.score ?? null
      : null;
    if (tailUpper !== null) {
      const futureUpperBoundWithoutAnchorBans = getRemainingUpperBound(
        futureSlotIndices,
        bannedCardIds,
        useContextualSkillUpper,
        useSkillAwareCapacityUpper,
        useParetoCapacityUpper,
        useBucketedCapacityUpper,
      );
      if (Number.isFinite(futureUpperBoundWithoutAnchorBans)) {
        upperBound = Math.max(upperBound, tailUpper + futureUpperBoundWithoutAnchorBans);
      }
    }

    if (!Number.isFinite(upperBound)) {
      continue;
    }

    totalSelectedCount += selectedCount;
    if (!bestEstimate || upperBound < bestEstimate.upperBound) {
      bestEstimate = {
        upperBound,
        anchorSlotIndex,
        candidateCount: selectedCount,
        tailUpper,
      };
    }
  }

  if (!bestEstimate) {
    profiling.capacityAnchorSlotUpperAbortCount += 1;
    return null;
  }

  profiling.capacityAnchorSlotUpperCompletedCount += 1;
  profiling.capacityAnchorSlotUpperCandidateCount += totalSelectedCount;
  profiling.capacityAnchorSlotUpperAnchorSlotIndex = bestEstimate.anchorSlotIndex;
  profiling.capacityAnchorSlotUpperTailUpper = bestEstimate.tailUpper;
  profiling.capacityAnchorSlotUpperElapsedMs += performance.now() - startedAt;
  return bestEstimate;
}

function collectMedleyOpportunityAnchorCards(
  slot: MedleySlotSearch,
  slotCandidates: MedleyTeamCandidate[],
  limit: number,
): SearchCard[] {
  const scoredCardIds = new Map<number, { score: number; firstSeen: number }>();
  const cardById = new Map<number, SearchCard>();
  let firstSeen = 0;
  const addCard = (card: SearchCard, score: number): void => {
    cardById.set(card.cardId, card);
    const current = scoredCardIds.get(card.cardId);
    if (!current) {
      scoredCardIds.set(card.cardId, { score, firstSeen });
      firstSeen += 1;
    } else {
      current.score += score;
    }
  };

  for (const [candidateRank, candidate] of slotCandidates.entries()) {
    const candidateWeight = Math.max(1, slotCandidates.length - candidateRank);
    for (const card of candidate.cards) {
      addCard(card, candidate.result.score * candidateWeight);
    }
  }

  for (const card of slot.searchCards) {
    addCard(
      card,
      card.effectivePower * (
        slot.baseScoreRatePerPower
        + getMedleyCardSkillAverageRateUpper(card)
        + getMedleyCardSkillLeaderRateUpper(card)
      ),
    );
  }

  return [...scoredCardIds.entries()]
    .sort((left, right) => right[1].score - left[1].score || left[1].firstSeen - right[1].firstSeen || left[0] - right[0])
    .slice(0, limit)
    .map(([cardId]) => cardById.get(cardId))
    .filter((card): card is SearchCard => card !== undefined);
}

function estimateMedleySlotUpperBoundIncludingCard(
  slot: MedleySlotSearch,
  card: SearchCard,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): number {
  const characterMask = getMedleyCharacterMask(slot, card);
  if (!characterMask) {
    return Number.NEGATIVE_INFINITY;
  }
  return estimateMedleySlotBranchScoreUpperBound(
    slot,
    [card],
    0,
    new Set<number>([card.cardId]),
    characterMask.low,
    characterMask.high,
    card.effectivePower,
    profiling,
    true,
  );
}

function estimateMedleySlotUpperBoundExcludingCards(
  slot: MedleySlotSearch,
  excludedCardIds: Set<number>,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): number {
  return estimateMedleySlotBranchScoreUpperBound(
    slot,
    [],
    0,
    excludedCardIds,
    0,
    0,
    0,
    profiling,
    true,
  );
}

function estimateMedleyOpportunityCostUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  slotCandidates: MedleyTeamCandidate[][],
  getRemainingUpperBound: (
    remainingSlotIndices: number[],
    bannedCards: Set<number>,
    useContextualSkillUpper?: boolean,
    useSkillAwareCapacityUpper?: boolean,
    useParetoCapacityUpper?: boolean,
    useBucketedCapacityUpper?: boolean,
  ) => number,
  useContextualSkillUpper: boolean,
  useSkillAwareCapacityUpper: boolean,
  useParetoCapacityUpper: boolean,
  useBucketedCapacityUpper: boolean,
  requestedAnchorLimit: number | null,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): MedleyOpportunityCostUpperEstimate | null {
  profiling.capacityOpportunityCostUpperCallCount += 1;
  const startedAt = performance.now();
  if (remainingSlotIndices.length !== MEDLEY_TEAM_COUNT || bannedCardIds.size > 0) {
    profiling.capacityOpportunityCostUpperAbortCount += 1;
    return null;
  }

  const anchorLimit = clamp(
    Math.trunc(requestedAnchorLimit ?? MEDLEY_DEFAULT_OPPORTUNITY_ANCHOR_LIMIT),
    1,
    MEDLEY_MAX_OPPORTUNITY_ANCHOR_LIMIT,
  );
  const anchorSlotIndices = [...remainingSlotIndices].sort((left, right) => (
    slots[right].startCombo - slots[left].startCombo
    || slots[right].rootScoreUpperBound - slots[left].rootScoreUpperBound
    || right - left
  ));
  let totalAnchorCount = 0;
  let bestEstimate: MedleyOpportunityCostUpperEstimate | null = null;

  for (const anchorSlotIndex of anchorSlotIndices) {
    const slot = slots[anchorSlotIndex];
    const anchors = collectMedleyOpportunityAnchorCards(
      slot,
      slotCandidates[anchorSlotIndex] ?? [],
      anchorLimit,
    );
    if (anchors.length === 0) {
      continue;
    }

    const futureSlotIndices = remainingSlotIndices.filter((slotIndex) => slotIndex !== anchorSlotIndex);
    const excludedAnchorCardIds = new Set(bannedCardIds);
    anchors.forEach((card) => excludedAnchorCardIds.add(card.cardId));
    const tailSlotUpper = estimateMedleySlotUpperBoundExcludingCards(slot, excludedAnchorCardIds, profiling);
    let slotUpperBound = Number.NEGATIVE_INFINITY;
    if (Number.isFinite(tailSlotUpper)) {
      const tailFutureUpper = getRemainingUpperBound(
        futureSlotIndices,
        bannedCardIds,
        useContextualSkillUpper,
        useSkillAwareCapacityUpper,
        useParetoCapacityUpper,
        useBucketedCapacityUpper,
      );
      if (!Number.isFinite(tailFutureUpper)) {
        profiling.capacityOpportunityCostUpperAbortCount += 1;
        return null;
      }
      slotUpperBound = Math.max(slotUpperBound, tailSlotUpper + tailFutureUpper);
    }

    for (const anchor of anchors) {
      const forcedSlotUpper = estimateMedleySlotUpperBoundIncludingCard(slot, anchor, profiling);
      if (!Number.isFinite(forcedSlotUpper)) {
        continue;
      }
      const anchorBannedCardIds = new Set(bannedCardIds);
      anchorBannedCardIds.add(anchor.cardId);
      const futureUpper = getRemainingUpperBound(
        futureSlotIndices,
        anchorBannedCardIds,
        useContextualSkillUpper,
        useSkillAwareCapacityUpper,
        useParetoCapacityUpper,
        useBucketedCapacityUpper,
      );
      if (!Number.isFinite(futureUpper)) {
        continue;
      }
      slotUpperBound = Math.max(slotUpperBound, forcedSlotUpper + futureUpper);
    }

    if (!Number.isFinite(slotUpperBound)) {
      continue;
    }
    totalAnchorCount += anchors.length;
    if (!bestEstimate || slotUpperBound < bestEstimate.upperBound) {
      bestEstimate = {
        upperBound: slotUpperBound,
        anchorSlotIndex,
        anchorCount: anchors.length,
        tailUpper: Number.isFinite(tailSlotUpper) ? tailSlotUpper : null,
      };
    }
  }

  profiling.capacityOpportunityCostUpperElapsedMs += performance.now() - startedAt;
  if (!bestEstimate) {
    profiling.capacityOpportunityCostUpperAbortCount += 1;
    return null;
  }
  profiling.capacityOpportunityCostUpperCompletedCount += 1;
  profiling.capacityOpportunityCostUpperAnchorCount += totalAnchorCount;
  profiling.capacityOpportunityCostUpperTailUpper = bestEstimate.tailUpper;
  return bestEstimate;
}

function toMedleyUpperWitnessSlot(
  slot: MedleySlotSearch,
  slotIndex: number,
  candidate: MedleyTeamCandidate,
): BandoriMedleyUpperWitnessSlot {
  return {
    slotIndex,
    songIndex: slot.songIndex,
    startCombo: slot.startCombo,
    notesCount: slot.chart.notes.length,
    score: candidate.result.score,
    totalPower: candidate.result.totalPower,
    eventPower: candidate.result.eventPower,
    eventMode: candidate.result.eventMode,
    leaderCardId: candidate.result.leaderCardId,
    cardIds: candidate.cardIds,
    characterIds: candidate.cards.map((card) => card.characterId),
  };
}

function captureMedleyRootUpperWitness(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  slotCandidates: MedleyTeamCandidate[][],
  upperBound: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): void {
  if (!Number.isFinite(upperBound) || remainingSlotIndices.length !== MEDLEY_TEAM_COUNT) {
    return;
  }
  if (profiling.upperWitnessUpperBound !== null && profiling.upperWitnessUpperBound >= upperBound) {
    return;
  }

  const witnessSlots: BandoriMedleyUpperWitnessSlot[] = [];
  const cardUseCounts = new Map<number, number>();
  let evaluatedScore = 0;
  for (const slotIndex of remainingSlotIndices) {
    const candidate = slotCandidates[slotIndex]?.[0];
    if (!candidate) {
      return;
    }
    const slot = slots[slotIndex];
    evaluatedScore += candidate.result.score;
    for (const cardId of candidate.cardIds) {
      cardUseCounts.set(cardId, (cardUseCounts.get(cardId) ?? 0) + 1);
    }
    witnessSlots.push(toMedleyUpperWitnessSlot(slot, slotIndex, candidate));
  }

  let bestDisjointScore = Number.NEGATIVE_INFINITY;
  let bestDisjointSelection: Array<{ slotIndex: number; candidate: MedleyTeamCandidate }> | null = null;
  const selectedDisjoint: Array<{ slotIndex: number; candidate: MedleyTeamCandidate }> = [];
  const usedDisjointCardIds = new Set<number>();
  const visitDisjointCandidates = (slotPosition: number, score: number): void => {
    if (slotPosition >= remainingSlotIndices.length) {
      if (score > bestDisjointScore) {
        bestDisjointScore = score;
        bestDisjointSelection = selectedDisjoint.map((selection) => ({ ...selection }));
      }
      return;
    }
    const slotIndex = remainingSlotIndices[slotPosition];
    for (const candidate of slotCandidates[slotIndex] ?? []) {
      if (candidate.cardIds.some((cardId) => usedDisjointCardIds.has(cardId))) {
        continue;
      }
      candidate.cardIds.forEach((cardId) => usedDisjointCardIds.add(cardId));
      selectedDisjoint.push({ slotIndex, candidate });
      visitDisjointCandidates(slotPosition + 1, score + candidate.result.score);
      selectedDisjoint.pop();
      candidate.cardIds.forEach((cardId) => usedDisjointCardIds.delete(cardId));
    }
  };
  visitDisjointCandidates(0, 0);
  const disjointEvaluatedScore = Number.isFinite(bestDisjointScore) ? bestDisjointScore : null;
  const disjointGap = disjointEvaluatedScore === null ? null : upperBound - disjointEvaluatedScore;
  let disjointSlots: BandoriMedleyUpperWitnessSlot[] | null = null;
  if (bestDisjointSelection !== null) {
    const selection = bestDisjointSelection as Array<{ slotIndex: number; candidate: MedleyTeamCandidate }>;
    disjointSlots = selection.map(({ slotIndex, candidate }) => (
      toMedleyUpperWitnessSlot(slots[slotIndex], slotIndex, candidate)
    ));
  }
  const overlapCardIds = [...cardUseCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([cardId]) => cardId)
    .sort((left, right) => left - right);
  const gap = upperBound - evaluatedScore;
  profiling.upperWitnessCaptureCount += 1;
  profiling.upperWitnessUpperBound = upperBound;
  profiling.upperWitnessEvaluatedScore = evaluatedScore;
  profiling.upperWitnessGap = gap;
  profiling.upperWitness = {
    source: "relaxed-best-slots",
    upperBound,
    evaluatedScore,
    gap,
    disjointEvaluatedScore,
    disjointGap,
    capacityMode: profiling.remainingUpperBoundMaxCapacityMode,
    overlapCardIds,
    gapCategory: overlapCardIds.length > 0 ? "relaxed-slot-overlap" : "upper-model-gap",
    slots: witnessSlots,
    disjointSlots,
  };
}

function toMedleyCapacityUpperWitnessSlot(
  slot: MedleySlotSearch,
  slotIndex: number,
  cards: SearchCard[],
  upperContribution: number,
  result: BandoriTeamSearchResult,
): BandoriMedleyUpperWitnessSlot {
  return {
    slotIndex,
    songIndex: slot.songIndex,
    startCombo: slot.startCombo,
    notesCount: slot.chart.notes.length,
    score: result.score,
    upperContribution,
    totalPower: result.totalPower,
    eventPower: result.eventPower,
    eventMode: result.eventMode,
    leaderCardId: result.leaderCardId,
    cardIds: cards.map((card) => card.cardId),
    characterIds: cards.map((card) => card.characterId),
  };
}

function captureMedleyCapacityUpperWitness(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  upperBound: number,
  server: number,
  perfectRate: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): void {
  if (
    !Number.isFinite(upperBound)
    || remainingSlotIndices.length !== MEDLEY_TEAM_COUNT
    || bannedCardIds.size > 0
  ) {
    return;
  }
  if (
    profiling.capacityUpperWitnessUpperBound !== null
    && profiling.capacityUpperWitnessUpperBound >= upperBound
  ) {
    return;
  }

  const cardsByCharacter = buildMedleyCapacityCardsByCharacter(slots, remainingSlotIndices, bannedCardIds);
  const coefficientUpperBySlot = buildMedleyCardSpecificCoefficientUpperBySlot(
    slots,
    remainingSlotIndices,
    bannedCardIds,
  );
  const assignment = estimateMedleyCapacityCardSpecificCoefficientAssignmentWitness(
    remainingSlotIndices,
    cardsByCharacter,
    coefficientUpperBySlot,
  );
  if (!assignment) {
    return;
  }

  const witnessSlots: BandoriMedleyUpperWitnessSlot[] = [];
  const cardUseCounts = new Map<number, number>();
  let evaluatedScore = 0;
  for (const assignmentSlot of assignment.slots) {
    const slot = slots[assignmentSlot.slotIndex];
    const result = evaluateTeam(
      assignmentSlot.cards,
      slot.input,
      slot.chart,
      slot.configuration,
      server,
      perfectRate,
      slot.scoreCache,
      slot.comboOptions,
    );
    if (!result) {
      return;
    }
    evaluatedScore += result.score;
    for (const card of assignmentSlot.cards) {
      cardUseCounts.set(card.cardId, (cardUseCounts.get(card.cardId) ?? 0) + 1);
    }
    witnessSlots.push(toMedleyCapacityUpperWitnessSlot(
      slot,
      assignmentSlot.slotIndex,
      assignmentSlot.cards,
      assignmentSlot.upperContribution,
      result,
    ));
  }

  const overlapCardIds = [...cardUseCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([cardId]) => cardId)
    .sort((left, right) => left - right);
  const gap = upperBound - evaluatedScore;
  const teamSharedGap = assignment.upperBound - evaluatedScore;
  const contextOrProductGap = upperBound - assignment.upperBound;

  profiling.capacityUpperWitnessCaptureCount += 1;
  profiling.capacityUpperWitnessUpperBound = upperBound;
  profiling.capacityUpperWitnessEvaluatedScore = evaluatedScore;
  profiling.capacityUpperWitnessGap = gap;
  profiling.capacityUpperWitnessTeamSharedGap = teamSharedGap;
  profiling.capacityUpperWitnessCrossSlotDuplicateCardCount = overlapCardIds.length;
  profiling.capacityUpperWitnessContextOrProductGap = contextOrProductGap;
  profiling.upperWitness = {
    source: "capacity-assignment",
    upperBound,
    assignmentUpperBound: assignment.upperBound,
    evaluatedScore,
    gap,
    teamSharedGap,
    crossSlotDuplicateCardCount: overlapCardIds.length,
    contextOrProductGap,
    disjointEvaluatedScore: null,
    disjointGap: null,
    capacityMode: profiling.remainingUpperBoundMaxCapacityMode,
    overlapCardIds,
    gapCategory: "capacity-model-gap",
    slots: witnessSlots.sort((left, right) => left.slotIndex - right.slotIndex),
    disjointSlots: null,
  };
}

function medleyCandidatesOverlap(left: MedleyTeamCandidate, right: MedleyTeamCandidate): boolean {
  const leftIds = new Set(left.cardIds);
  return right.cardIds.some((cardId) => leftIds.has(cardId));
}

function seedMedleyResultsFromSlotCandidates(
  results: BandoriMedleyTeamSearchResult[],
  resultLimit: number,
  slots: MedleySlotSearch[],
  slotCandidates: MedleyTeamCandidate[][],
  configuration: BandoriAreaItemConfiguration,
): void {
  const [firstCandidates, secondCandidates, thirdCandidates] = slotCandidates;
  const bestSecondScore = secondCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY;
  const bestThirdScore = thirdCandidates[0]?.result.score ?? Number.NEGATIVE_INFINITY;

  for (const first of firstCandidates) {
    if (results.length >= resultLimit && first.result.score + bestSecondScore + bestThirdScore < getMedleyPruningThreshold(results, resultLimit)) {
      break;
    }
    for (const second of secondCandidates) {
      if (medleyCandidatesOverlap(first, second)) {
        continue;
      }
      if (results.length >= resultLimit && first.result.score + second.result.score + bestThirdScore < getMedleyPruningThreshold(results, resultLimit)) {
        break;
      }
      for (const third of thirdCandidates) {
        if (medleyCandidatesOverlap(first, third) || medleyCandidatesOverlap(second, third)) {
          continue;
        }
        const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
        selectedBySong[slots[0].songIndex] = first;
        selectedBySong[slots[1].songIndex] = second;
        selectedBySong[slots[2].songIndex] = third;
        const result = buildMedleyResult(slots, selectedBySong, configuration);
        if (result) {
          pushMedleyResult(results, result, resultLimit);
        }
        break;
      }
    }
  }
}

function optimizeCurrentMedleySeedResults(
  results: BandoriMedleyTeamSearchResult[],
  resultLimit: number,
  slots: MedleySlotSearch[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  fixedCardSetOptimizationCache: Map<string, MedleyFixedCardSetOptimizationCacheEntry>,
): void {
  const seedResults = [...results].slice(0, Math.min(results.length, Math.max(3, resultLimit * 3)));
  for (const result of seedResults) {
    pushMedleySeedResult(
      results,
      result,
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
}

function collectMedleyNeighborhoodAlternateCardIds(
  slots: MedleySlotSearch[],
  slotCandidates: MedleyTeamCandidate[][],
  selectedCardIds: Set<number>,
  limit: number,
): number[] {
  const scoredAlternates = new Map<number, { score: number; firstSeen: number }>();
  let seenOrder = 0;
  const rankedSlotIndices = slots
    .map((_, index) => index)
    .sort((left, right) => (
      slots[right].rootScoreUpperBound - slots[left].rootScoreUpperBound
      || slots[right].baseScoreRatePerPower - slots[left].baseScoreRatePerPower
      || right - left
    ));
  for (const [slotRank, slotIndex] of rankedSlotIndices.entries()) {
    const candidates = slotCandidates[slotIndex] ?? [];
    const slotWeight = rankedSlotIndices.length - slotRank;
    for (const [candidateRank, candidate] of candidates.entries()) {
      const candidateWeight = slotWeight * (candidates.length - candidateRank);
      for (const cardId of candidate.cardIds) {
        if (selectedCardIds.has(cardId)) {
          continue;
        }
        const current = scoredAlternates.get(cardId);
        if (!current) {
          scoredAlternates.set(cardId, {
            score: candidate.result.score * candidateWeight,
            firstSeen: seenOrder,
          });
          seenOrder += 1;
        } else {
          current.score += candidate.result.score * candidateWeight;
        }
      }
    }
  }
  return [...scoredAlternates.entries()]
    .sort((left, right) => right[1].score - left[1].score || left[1].firstSeen - right[1].firstSeen || left[0] - right[0])
    .slice(0, limit)
    .map(([cardId]) => cardId);
}

function optimizeMedleySeedNeighborhood(
  results: BandoriMedleyTeamSearchResult[],
  resultLimit: number,
  slots: MedleySlotSearch[],
  slotCandidates: MedleyTeamCandidate[][],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  alternateCardLimit: number,
): void {
  const seed = results[0];
  if (!seed || seed.cardIds.length !== MEDLEY_TEAM_COUNT * MEDLEY_TEAM_SIZE) {
    return;
  }
  const selectedCardIds = new Set(seed.cardIds);
  const alternateCardIds = collectMedleyNeighborhoodAlternateCardIds(
    slots,
    slotCandidates,
    selectedCardIds,
    alternateCardLimit,
  );
  if (alternateCardIds.length === 0) {
    return;
  }

  profiling.cardPoolOptimizationCount += 1;
  let bestOptimized: BandoriMedleyTeamSearchResult | null = null;
  for (let alternateCount = 1; alternateCount <= alternateCardIds.length; alternateCount += 1) {
    const optimized = optimizeMedleyCardPool(
      [...seed.cardIds, ...alternateCardIds.slice(0, alternateCount)],
      slots,
      configuration,
      server,
      perfectRate,
      stats,
      profiling,
    );
    if (optimized && (!bestOptimized || optimized.score > bestOptimized.score)) {
      bestOptimized = optimized;
    }
    if (bestOptimized && bestOptimized.score > seed.score && alternateCount >= 2) {
      break;
    }
  }
  if (bestOptimized && bestOptimized.score > seed.score) {
    const improvement = bestOptimized.score - seed.score;
    profiling.cardPoolOptimizationImprovementCount += 1;
    profiling.bestCardPoolOptimizationImprovement = Math.max(profiling.bestCardPoolOptimizationImprovement, improvement);
    pushMedleyResult(results, bestOptimized, resultLimit);
  }
}

function buildMedleySlotSearches(
  input: BandoriMedleyTeamSearchInput,
  songInputs: BandoriMedleySongSearchInput[],
  calculatedCards: CalculatedBandoriCard[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
): MedleySlotSearch[] {
  let startCombo = 0;
  return songInputs.map((songInput, songIndex) => {
    const slotInput = createMedleySlotInput(input, songInput);
    const chart = getCachedPreparedChart(slotInput);
    const comboOptions = {
      startCombo,
      useMedleyCombo: true,
    };
    const baseScoreRatePerPower = calculateBaseScoreRatePerPower(chart, comboOptions);
    const skillRateProfiles = buildSearchCardSkillRateProfiles(
      calculatedCards,
      slotInput,
      chart,
      server,
      comboOptions,
    );
    const searchCards = sortSearchCardsForTraversal(
      buildSearchCardsForConfiguration(calculatedCards, slotInput, configuration, server, skillRateProfiles),
      baseScoreRatePerPower,
    );
    const upperBoundIndex = buildCharacterUpperBoundIndex(searchCards);
    const rootScoreUpperBound = estimateSearchScopeScoreUpperBound(
      [],
      upperBoundIndex,
      searchCards,
      0,
      0,
      0,
      baseScoreRatePerPower,
    );
    const slot: MedleySlotSearch = {
      songIndex,
      startCombo,
      chart,
      input: slotInput,
      configuration,
      searchCards,
      upperBoundIndex,
      baseScoreRatePerPower,
      rootScoreUpperBound,
      scoreCache: {
        skillMultiplierLists: new Map(),
        noFloorSkillRates: new Map(),
      },
      comboOptions,
      teamEvaluationCache: new Map(),
    };
    startCombo += chart.notesCount;
    return slot;
  });
}

function getMedleyPruningThreshold(results: BandoriMedleyTeamSearchResult[], resultLimit: number): number {
  return results.length >= resultLimit ? results[resultLimit - 1]?.score ?? Number.NEGATIVE_INFINITY : Number.NEGATIVE_INFINITY;
}

function getMedleySlotCandidateLimits(slots: MedleySlotSearch[], candidateCardCount: number): number[] {
  const rankedSlotIndices = slots
    .map((_, index) => index)
    .sort((left, right) => (
      slots[right].rootScoreUpperBound - slots[left].rootScoreUpperBound
      || slots[right].baseScoreRatePerPower - slots[left].baseScoreRatePerPower
      || right - left
    ));
  const limitsByRank = candidateCardCount <= 200
    ? [120, 80, 50]
    : [32, 20, 12];
  const limits = new Array<number>(slots.length).fill(limitsByRank[limitsByRank.length - 1]);
  rankedSlotIndices.forEach((slotIndex, rank) => {
    limits[slotIndex] = limitsByRank[Math.min(rank, limitsByRank.length - 1)];
  });
  return limits;
}

function getMedleyAreaItemCoarseKey(configuration: BandoriAreaItemConfiguration): string {
  return `${configuration.bandKey ?? "none"}:${configuration.attribute ?? "none"}`;
}

function toMedleyFiniteNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function getMedleyRegionalNumber(value: unknown, server: number): number {
  if (Array.isArray(value)) {
    return toMedleyFiniteNumber(value[server]) ?? toMedleyFiniteNumber(value[0]) ?? 0;
  }
  return toMedleyFiniteNumber(value) ?? 0;
}

function getMedleyCardEventParameterPower(
  input: Pick<BandoriMedleyTeamSearchInput, "eventBonus">,
  card: CalculatedBandoriCard,
): number {
  const eventBonus = calculateBandoriCardEventBonus(card, input.eventBonus);
  return MEDLEY_PARAMETER_KEYS.reduce((sum, _, index) => sum + eventBonus.parameterBonus[index], 0);
}

function estimateMedleyConfigurationCardPower(
  input: BandoriMedleyTeamSearchInput,
  card: CalculatedBandoriCard,
  configuration: BandoriAreaItemConfiguration,
  server: number,
  userAreaItemsById: Map<number, { level: number }>,
): number {
  const eventPower = getMedleyCardEventParameterPower(input, card);
  return configuration.selectedAreaItemIds.reduce((power, areaItemId) => {
    const areaItem = input.areaItemsById[String(areaItemId)];
    const level = userAreaItemsById.get(areaItemId)?.level ?? 0;
    if (!areaItem || level <= 0) {
      return power;
    }

    const targetAttributes = Array.isArray(areaItem.targetAttributes) ? areaItem.targetAttributes : [];
    const targetBandIds = Array.isArray(areaItem.targetBandIds)
      ? areaItem.targetBandIds.map((item) => Math.trunc(toMedleyFiniteNumber(item) ?? Number.NaN))
      : [];
    if (!targetAttributes.includes(card.attribute) || card.bandId === null || !targetBandIds.includes(card.bandId)) {
      return power;
    }

    return power + MEDLEY_PARAMETER_KEYS.reduce((sum, key, index) => {
      const rate = getMedleyRegionalNumber(areaItem[key]?.[String(level)], server) / 100;
      return sum + card.characterParam[index] * rate;
    }, 0);
  }, card.totalPower + eventPower);
}

function estimateMedleyLockedConfigurationPotential(
  input: BandoriMedleyTeamSearchInput,
  calculatedCards: CalculatedBandoriCard[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
): number {
  const selectedByCharacterCount = new Map<number, number>();
  const userAreaItemsById = new Map(input.userAreaItems.map((areaItem) => [areaItem.areaItemId, areaItem]));
  let selectedCount = 0;
  let potential = 0;
  const rankedCards = [...calculatedCards]
    .map((card) => ({
      card,
      power: estimateMedleyConfigurationCardPower(input, card, configuration, server, userAreaItemsById),
    }))
    .sort((left, right) => right.power - left.power || left.card.cardId - right.card.cardId);

  for (const { card, power } of rankedCards) {
    const usedCount = selectedByCharacterCount.get(card.characterId) ?? 0;
    if (usedCount >= MEDLEY_TEAM_COUNT) {
      continue;
    }
    selectedByCharacterCount.set(card.characterId, usedCount + 1);
    potential += power;
    selectedCount += 1;
    if (selectedCount >= MEDLEY_TEAM_COUNT * MEDLEY_TEAM_SIZE) {
      break;
    }
  }

  return potential;
}

function medleyConfigurationMatchesCoarseFilter(
  configuration: BandoriAreaItemConfiguration,
  filter: NonNullable<BandoriMedleyTeamSearchInput["coarseAreaItemFilter"]>,
): boolean {
  if (filter.bandKey !== undefined && configuration.bandKey !== filter.bandKey) {
    return false;
  }
  if (filter.attribute !== undefined && configuration.attribute !== filter.attribute) {
    return false;
  }
  return true;
}

function filterMedleyConfigurationsByCoarseKeys(
  configurations: BandoriAreaItemConfiguration[],
  coarseKeys: Set<string>,
): BandoriAreaItemConfiguration[] {
  if (coarseKeys.size === 0) {
    return configurations;
  }
  return configurations.filter((configuration) => coarseKeys.has(getMedleyAreaItemCoarseKey(configuration)));
}

function getMedleyCoarseRepresentativeConfigurationIndices(
  configurations: BandoriAreaItemConfiguration[],
): number[] {
  const representativeByKey = new Map<string, number>();
  configurations.forEach((configuration, index) => {
    const key = getMedleyAreaItemCoarseKey(configuration);
    const currentIndex = representativeByKey.get(key);
    if (currentIndex === undefined || configurations[currentIndex]?.parameter !== null && configuration.parameter === null) {
      representativeByKey.set(key, index);
    }
  });
  return [...representativeByKey.values()];
}

function estimateMedleyStaticCoarsePotential(
  input: BandoriMedleyTeamSearchInput,
  calculatedCards: CalculatedBandoriCard[],
  configuration: BandoriAreaItemConfiguration,
): number {
  const bandId = configuration.bandKey ? MEDLEY_BAND_ID_BY_AREA_ITEM_KEY[configuration.bandKey] : null;
  const scoredCards = calculatedCards
    .map((card) => {
      const bandMultiplier = bandId === null || bandId === undefined
        ? 1
        : card.bandId === bandId
          ? 1.28
          : 1;
      const attributeMultiplier = configuration.attribute && card.attribute === configuration.attribute ? 1.12 : 1;
      const eventPower = getMedleyCardEventParameterPower(input, card);
      return {
        card,
        score: card.totalPower * bandMultiplier * attributeMultiplier + eventPower,
      };
    })
    .sort((left, right) => right.score - left.score);
  const selectedCharacterCounts = new Map<number, number>();
  let score = 0;
  let selectedCount = 0;
  for (const entry of scoredCards) {
    const selectedCharacterCount = selectedCharacterCounts.get(entry.card.characterId) ?? 0;
    if (selectedCharacterCount >= MEDLEY_TEAM_COUNT) {
      continue;
    }
    selectedCharacterCounts.set(entry.card.characterId, selectedCharacterCount + 1);
    score += entry.score;
    selectedCount += 1;
    if (selectedCount >= MEDLEY_TEAM_COUNT * MEDLEY_TEAM_SIZE) {
      break;
    }
  }
  return selectedCount >= MEDLEY_TEAM_COUNT * MEDLEY_TEAM_SIZE ? score : Number.NEGATIVE_INFINITY;
}

function orderMedleyCoarseSeedConfigurationIndices(
  configurations: BandoriAreaItemConfiguration[],
  calculatedCards: CalculatedBandoriCard[],
  input: BandoriMedleyTeamSearchInput,
): number[] {
  const originalIndices = getMedleyCoarseRepresentativeConfigurationIndices(configurations);
  const staticRankedIndices = [...originalIndices]
    .sort((left, right) => (
      estimateMedleyStaticCoarsePotential(input, calculatedCards, configurations[right])
      - estimateMedleyStaticCoarsePotential(input, calculatedCards, configurations[left])
      || left - right
    ));
  const orderedIndices: number[] = [];
  const pushIndex = (index: number): void => {
    if (!orderedIndices.includes(index)) {
      orderedIndices.push(index);
    }
  };
  staticRankedIndices.slice(0, 3).forEach(pushIndex);
  originalIndices.forEach(pushIndex);
  staticRankedIndices.forEach(pushIndex);
  return orderedIndices;
}

function getMedleyGreedySeedSlotIndices(slots: MedleySlotSearch[]): number[] {
  return slots
    .map((_, index) => index)
    .sort((left, right) => (
      slots[right].rootScoreUpperBound - slots[left].rootScoreUpperBound
      || slots[right].baseScoreRatePerPower - slots[left].baseScoreRatePerPower
      || right - left
    ));
}

function seedMedleyResultsFromGreedyOrders(
  results: BandoriMedleyTeamSearchResult[],
  resultLimit: number,
  slots: MedleySlotSearch[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  bestSlotTeamCache: Map<string, MedleyBestSlotTeamCacheEntry>,
  fixedCardSetOptimizationCache: Map<string, MedleyFixedCardSetOptimizationCacheEntry>,
  seedOrders: number[][],
  recordGreedyStats: boolean,
): number | null {
  let bestSeedScore: number | null = null;
  for (const seedOrder of seedOrders) {
    if (stats.timedOut) {
      break;
    }
    const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
    const bannedCardIds = new Set<number>();
    let completeSeed = true;
    for (const slotIndex of seedOrder) {
      const slot = slots[slotIndex];
      const best = findBestMedleySlotTeamWithCache(
        bestSlotTeamCache,
        slotIndex,
        slot,
        bannedCardIds,
        server,
        perfectRate,
        stats,
        isPastDeadline,
        () => undefined,
        profiling,
      );
      if (!best) {
        completeSeed = false;
        break;
      }
      selectedBySong[slot.songIndex] = best;
      best.cards.forEach((card) => bannedCardIds.add(card.cardId));
    }
    if (!completeSeed || stats.timedOut) {
      continue;
    }

    const result = buildMedleyResult(slots, selectedBySong, configuration);
    if (!result) {
      continue;
    }
    const pushedResult = pushMedleySeedResult(
      results,
      result,
      resultLimit,
      slots,
      configuration,
      server,
      perfectRate,
      stats,
      profiling,
      fixedCardSetOptimizationCache,
    );
    bestSeedScore = Math.max(bestSeedScore ?? Number.NEGATIVE_INFINITY, pushedResult.score);
    if (recordGreedyStats) {
      profiling.bestGreedySeedScore = Math.max(profiling.bestGreedySeedScore ?? Number.NEGATIVE_INFINITY, result.score);
      if (seedOrder.map((slotIndex) => slots[slotIndex].songIndex).join(",") === "2,1,0") {
        profiling.reverseSongOrderGreedySeedScore = Math.max(
          profiling.reverseSongOrderGreedySeedScore ?? Number.NEGATIVE_INFINITY,
          result.score,
        );
      }
    }
  }
  return bestSeedScore;
}

function buildFastGreedyMedleySlotCandidate(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): MedleyTeamCandidate | null {
  const selectedCards: SearchCard[] = [];
  const selectedCharacterIds = new Set<number>();
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId) || selectedCharacterIds.has(card.characterId)) {
      continue;
    }
    selectedCards.push(card);
    selectedCharacterIds.add(card.characterId);
    if (selectedCards.length >= MEDLEY_TEAM_SIZE) {
      break;
    }
  }
  if (selectedCards.length !== MEDLEY_TEAM_SIZE) {
    return null;
  }

  stats.enumeratedTeamCount += 1;
  const cacheKey = getMedleyTeamEvaluationCacheKey(selectedCards);
  let result = slot.teamEvaluationCache.get(cacheKey);
  if (!slot.teamEvaluationCache.has(cacheKey)) {
    profiling.teamEvaluationCacheMissCount += 1;
    result = evaluateTeam(
      selectedCards,
      slot.input,
      slot.chart,
      slot.configuration,
      server,
      perfectRate,
      slot.scoreCache,
      slot.comboOptions,
    );
    slot.teamEvaluationCache.set(cacheKey, result);
    stats.evaluatedTeamCount += 1;
  } else {
    profiling.teamEvaluationCacheHitCount += 1;
  }

  return result
    ? {
      result,
      cards: selectedCards,
      cardIds: selectedCards.map((card) => card.cardId),
    }
    : null;
}

function seedMedleyResultsFromFastGreedyOrders(
  results: BandoriMedleyTeamSearchResult[],
  resultLimit: number,
  slots: MedleySlotSearch[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  fixedCardSetOptimizationCache: Map<string, MedleyFixedCardSetOptimizationCacheEntry>,
  seedOrders: number[][],
): number | null {
  let bestSeedScore: number | null = null;
  for (const seedOrder of seedOrders) {
    const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
    const bannedCardIds = new Set<number>();
    let completeSeed = true;
    for (const slotIndex of seedOrder) {
      const slot = slots[slotIndex];
      const candidate = buildFastGreedyMedleySlotCandidate(
        slot,
        bannedCardIds,
        server,
        perfectRate,
        stats,
        profiling,
      );
      if (!candidate) {
        completeSeed = false;
        break;
      }
      selectedBySong[slot.songIndex] = candidate;
      candidate.cards.forEach((card) => bannedCardIds.add(card.cardId));
    }
    if (!completeSeed) {
      continue;
    }

    const result = buildMedleyResult(slots, selectedBySong, configuration);
    if (!result) {
      continue;
    }
    const pushedResult = pushMedleySeedResult(
      results,
      result,
      resultLimit,
      slots,
      configuration,
      server,
      perfectRate,
      stats,
      profiling,
      fixedCardSetOptimizationCache,
    );
    bestSeedScore = Math.max(bestSeedScore ?? Number.NEGATIVE_INFINITY, pushedResult.score);
  }
  return bestSeedScore;
}

export function searchBandoriBestMedleyTeams(input: BandoriMedleyTeamSearchInput): BandoriMedleyTeamSearchResponse {
  const startedAt = performance.now();
  const server = input.server ?? 3;
  const resultLimit = clamp(Math.trunc(input.resultLimit ?? 1), 1, 20);
  const perfectRate = clamp(input.perfectRate ?? 1, 0, 1);
  const maxSearchDurationMs = Math.max(1000, Math.trunc(input.maxSearchDurationMs ?? 9500));
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
  const deadlineAt = startedAt + maxSearchDurationMs;
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
  const configurations = isLockedCoarseFilter
    ? prunedConfigurations.filter((configuration) => medleyConfigurationMatchesCoarseFilter(configuration, coarseFilter))
    : prunedConfigurations;
  const results: BandoriMedleyTeamSearchResult[] = [];
  const profiling: BandoriMedleyTeamSearchProfilingStats = {
    startedAreaItemConfigurationCount: 0,
    completedAreaItemConfigurationCount: 0,
    bestGreedySeedScore: null,
    reverseSongOrderGreedySeedScore: null,
    visitedBranchCount: 0,
    slotBranchUpperBoundCallCount: 0,
    slotBranchUpperBoundStateCount: 0,
    remainingUpperBoundCallCount: 0,
    remainingUpperBoundCacheHitCount: 0,
    remainingUpperBoundCacheMissCount: 0,
    bestSlotTeamCacheHitCount: 0,
    bestSlotTeamCacheMissCount: 0,
    teamEvaluationCacheHitCount: 0,
    teamEvaluationCacheMissCount: 0,
    proofFriendlySlotChoiceCount: 0,
    fixedCardSetOptimizationCount: 0,
    fixedCardSetOptimizationCacheHitCount: 0,
    fixedCardSetOptimizationCacheMissCount: 0,
    fixedCardSetImprovementCount: 0,
    bestFixedCardSetImprovement: 0,
    cardPoolOptimizationCount: 0,
    cardPoolOptimizationImprovementCount: 0,
    bestCardPoolOptimizationImprovement: 0,
    configurationSeedPassCount: 0,
    configurationSeedPassImprovementCount: 0,
    bestConfigurationSeedPassScore: null,
    coarseLockedConfigurationCount: isLockedCoarseFilter ? configurations.length : 0,
    coarseAutoSelectedConfigurationCount: 0,
    coarseAutoSelectedGroupCount: 0,
    inclusionUpperAnalysisCount: 0,
    inclusionUpperPrunedCardCount: 0,
    observedUpperBoundSource: null,
    observedUpperBoundRemainingSlotCount: null,
    remainingUpperBoundMax: null,
    remainingUpperBoundMaxCorrelated: null,
    remainingUpperBoundMaxCapacity: null,
    remainingUpperBoundMaxCapacityMode: null,
    remainingUpperBoundMaxSlotCount: null,
    remainingUpperBoundMaxLimiter: null,
    capacityParetoUpperCallCount: 0,
    capacityParetoUpperCompletedCount: 0,
    capacityParetoUpperAbortCount: 0,
    capacityParetoUpperStateCount: 0,
    capacityParetoUpperMaxProcessedStateCount: 0,
    bestCapacityParetoImprovement: 0,
    capacityBucketedUpperCallCount: 0,
    capacityBucketedUpperCompletedCount: 0,
    capacityBucketedUpperAbortCount: 0,
    capacityBucketedUpperStateCount: 0,
    capacityBucketedUpperMaxProcessedStateCount: 0,
    capacityBucketedUpperBucketSize: null,
    capacityBucketedUpperImprovementCount: 0,
    capacityBucketedUpperImprovementTotal: 0,
    bestCapacityBucketedImprovement: 0,
    capacityCoefficientTighteningCallCount: 0,
    capacityCoefficientTighteningSlotImprovementCount: 0,
    capacityCoefficientTighteningSlotImprovementTotal: 0,
    bestCapacityCoefficientTighteningSlotImprovement: 0,
    capacityCoefficientTighteningScoreImprovementCount: 0,
    capacityCoefficientTighteningScoreImprovementTotal: 0,
    bestCapacityCoefficientTighteningScoreImprovement: 0,
    capacityCardSpecificCoefficientUpperCallCount: 0,
    capacityCardSpecificCoefficientUpperCompletedCount: 0,
    capacityCardSpecificCoefficientUpperImprovementCount: 0,
    capacityCardSpecificCoefficientUpperImprovementTotal: 0,
    bestCapacityCardSpecificCoefficientUpperImprovement: 0,
    capacityLeaderFixedCardSpecificUpperCallCount: 0,
    capacityLeaderFixedCardSpecificUpperCompletedCount: 0,
    capacityLeaderFixedCardSpecificUpperImprovementCount: 0,
    capacityLeaderFixedCardSpecificUpperImprovementTotal: 0,
    bestCapacityLeaderFixedCardSpecificUpperImprovement: 0,
    capacityLeaderGroupCardSpecificUpperCallCount: 0,
    capacityLeaderGroupCardSpecificUpperCompletedCount: 0,
    capacityLeaderGroupCardSpecificUpperImprovementCount: 0,
    capacityLeaderGroupCardSpecificUpperImprovementTotal: 0,
    bestCapacityLeaderGroupCardSpecificUpperImprovement: 0,
    capacityLeaderGroupCardSpecificUpperGroupCount: null,
    capacityContextFixedCardSpecificUpperCallCount: 0,
    capacityContextFixedCardSpecificUpperCompletedCount: 0,
    capacityContextFixedCardSpecificUpperImprovementCount: 0,
    capacityContextFixedCardSpecificUpperImprovementTotal: 0,
    bestCapacityContextFixedCardSpecificUpperImprovement: 0,
    capacityContextGroupCardSpecificUpperCallCount: 0,
    capacityContextGroupCardSpecificUpperCompletedCount: 0,
    capacityContextGroupCardSpecificUpperImprovementCount: 0,
    capacityContextGroupCardSpecificUpperImprovementTotal: 0,
    bestCapacityContextGroupCardSpecificUpperImprovement: 0,
    capacityContextGroupCardSpecificUpperGroupCount: null,
    capacityContextBoundLagrangianUpperCallCount: 0,
    capacityContextBoundLagrangianUpperCompletedCount: 0,
    capacityContextBoundLagrangianUpperImprovementCount: 0,
    capacityContextBoundLagrangianUpperImprovementTotal: 0,
    bestCapacityContextBoundLagrangianUpperImprovement: 0,
    bestCapacityContextBoundLagrangianWeight: null,
    capacityContextBoundLagrangianUpperGroupCount: null,
    capacityContextBoundBucketedJointUpperCallCount: 0,
    capacityContextBoundBucketedJointUpperCompletedCount: 0,
    capacityContextBoundBucketedJointUpperAbortCount: 0,
    capacityContextBoundBucketedJointUpperStateCount: 0,
    capacityContextBoundBucketedJointUpperMaxProcessedStateCount: 0,
    capacityContextBoundBucketedJointUpperBucketSize: null,
    capacityContextBoundBucketedJointUpperTargetBucketCount: null,
    capacityContextBoundBucketedJointUpperProcessedCombinationCount: 0,
    capacityContextBoundBucketedJointUpperCombinationCount: null,
    capacityContextBoundBucketedJointUpperProcessedMaxCoefficientUpper: null,
    capacityContextBoundBucketedJointUpperUnprocessedMaxCoefficientUpper: null,
    bestCapacityContextBoundBucketedJointUpperCombinationImprovement: 0,
    capacityContextBoundBucketedJointUpperImprovementCount: 0,
    capacityContextBoundBucketedJointUpperImprovementTotal: 0,
    bestCapacityContextBoundBucketedJointUpperImprovement: 0,
    capacityContextBoundMcCormickUpperCallCount: 0,
    capacityContextBoundMcCormickUpperCompletedCount: 0,
    capacityContextBoundMcCormickUpperProcessedCombinationCount: 0,
    capacityContextBoundMcCormickUpperCombinationCount: null,
    capacityContextBoundMcCormickUpperProcessedMaxCoefficientUpper: null,
    capacityContextBoundMcCormickUpperUnprocessedMaxCoefficientUpper: null,
    bestCapacityContextBoundMcCormickUpperCombinationImprovement: 0,
    capacityContextBoundMcCormickUpperImprovementCount: 0,
    capacityContextBoundMcCormickUpperImprovementTotal: 0,
    bestCapacityContextBoundMcCormickUpperImprovement: 0,
    capacityContextBoundPowerSplitMcCormickUpperCallCount: 0,
    capacityContextBoundPowerSplitMcCormickUpperCompletedCount: 0,
    capacityContextBoundPowerSplitMcCormickUpperAbortCount: 0,
    capacityContextBoundPowerSplitMcCormickUpperStateCount: 0,
    capacityContextBoundPowerSplitMcCormickUpperMaxProcessedStateCount: 0,
    capacityContextBoundPowerSplitMcCormickUpperProcessedCombinationCount: 0,
    bestCapacityContextBoundPowerSplitMcCormickUpperCombinationImprovement: 0,
    capacityContextBoundSplitSkillMcCormickUpperCallCount: 0,
    capacityContextBoundSplitSkillMcCormickUpperCompletedCount: 0,
    capacityContextBoundSplitSkillMcCormickUpperProcessedCombinationCount: 0,
    bestCapacityContextBoundSplitSkillMcCormickUpperCombinationImprovement: 0,
    capacityOpportunityCostUpperCallCount: 0,
    capacityOpportunityCostUpperCompletedCount: 0,
    capacityOpportunityCostUpperAbortCount: 0,
    capacityOpportunityCostUpperAnchorCount: 0,
    capacityOpportunityCostUpperTailUpper: null,
    capacityOpportunityCostUpperImprovementCount: 0,
    capacityOpportunityCostUpperImprovementTotal: 0,
    bestCapacityOpportunityCostUpperImprovement: 0,
    capacityOpportunityCostUpperElapsedMs: 0,
    capacityTeamSharedCoefficientUpperCallCount: 0,
    capacityTeamSharedCoefficientUpperCompletedCount: 0,
    capacityTeamSharedCoefficientUpperAbortCount: 0,
    capacityTeamSharedCoefficientUpperStateCount: 0,
    bestCapacityTeamSharedCoefficientUpperImprovement: 0,
    capacityContextBoundCardBoundUpperCallCount: 0,
    capacityContextBoundCardBoundUpperCompletedCount: 0,
    capacityContextBoundCardBoundUpperProcessedCombinationCount: 0,
    bestCapacityContextBoundCardBoundUpperCombinationImprovement: 0,
    capacityCardSpecificLagrangianUpperCallCount: 0,
    capacityCardSpecificLagrangianUpperCompletedCount: 0,
    capacityCardSpecificLagrangianUpperImprovementCount: 0,
    capacityCardSpecificLagrangianUpperImprovementTotal: 0,
    bestCapacityCardSpecificLagrangianUpperImprovement: 0,
    bestCapacityCardSpecificLagrangianWeight: null,
    capacityCardMinCoefficientUpperCallCount: 0,
    capacityCardMinCoefficientUpperCompletedCount: 0,
    capacityCardMinCoefficientUpperAbortCount: 0,
    capacityCardMinCoefficientUpperStateCount: 0,
    capacityCardMinCoefficientUpperMaxProcessedStateCount: 0,
    capacityCardMinCoefficientUpperBucketSize: null,
    capacityCardMinCoefficientUpperTargetBucketCount: null,
    capacityCardMinCoefficientUpperImprovementCount: 0,
    capacityCardMinCoefficientUpperImprovementTotal: 0,
    bestCapacityCardMinCoefficientUpperImprovement: 0,
    capacityCardBoundUpperCallCount: 0,
    capacityCardBoundUpperCompletedCount: 0,
    capacityCardBoundUpperSkippedCount: 0,
    capacityCardBoundUpperImprovementCount: 0,
    capacityCardBoundUpperImprovementTotal: 0,
    bestCapacityCardBoundUpperImprovement: 0,
    capacityCardBoundDualUpperCallCount: 0,
    capacityCardBoundDualUpperCompletedCount: 0,
    capacityCardBoundDualUpperAbortCount: 0,
    capacityCardBoundDualUpperStateCount: 0,
    capacityCardBoundDualUpperMaxProcessedStateCount: 0,
    capacityCardBoundDualUpperImprovementCount: 0,
    capacityCardBoundDualUpperImprovementTotal: 0,
    bestCapacityCardBoundDualUpperImprovement: 0,
    capacityCardBoundLagrangianUpperCallCount: 0,
    capacityCardBoundLagrangianUpperCompletedCount: 0,
    capacityCardBoundLagrangianUpperImprovementCount: 0,
    capacityCardBoundLagrangianUpperImprovementTotal: 0,
    bestCapacityCardBoundLagrangianUpperImprovement: 0,
    bestCapacityCardBoundLagrangianWeight: null,
    capacityCardBoundBucketedJointUpperCallCount: 0,
    capacityCardBoundBucketedJointUpperCompletedCount: 0,
    capacityCardBoundBucketedJointUpperAbortCount: 0,
    capacityCardBoundBucketedJointUpperStateCount: 0,
    capacityCardBoundBucketedJointUpperMaxProcessedStateCount: 0,
    capacityCardBoundBucketedJointUpperBucketSize: null,
    capacityCardBoundBucketedJointUpperTargetBucketCount: null,
    capacityCardBoundBucketedJointUpperImprovementCount: 0,
    capacityCardBoundBucketedJointUpperImprovementTotal: 0,
    bestCapacityCardBoundBucketedJointUpperImprovement: 0,
    capacityAnchorSlotUpperCallCount: 0,
    capacityAnchorSlotUpperCompletedCount: 0,
    capacityAnchorSlotUpperAbortCount: 0,
    capacityAnchorSlotUpperCandidateCount: 0,
    capacityAnchorSlotUpperAnchorSlotIndex: null,
    capacityAnchorSlotUpperTailUpper: null,
    capacityAnchorSlotUpperImprovementCount: 0,
    capacityAnchorSlotUpperImprovementTotal: 0,
    bestCapacityAnchorSlotUpperImprovement: 0,
    capacityAnchorSlotUpperElapsedMs: 0,
    upperWitnessCaptureCount: 0,
    upperWitnessUpperBound: null,
    upperWitnessEvaluatedScore: null,
    upperWitnessGap: null,
    capacityUpperWitnessCaptureCount: 0,
    capacityUpperWitnessUpperBound: null,
    capacityUpperWitnessEvaluatedScore: null,
    capacityUpperWitnessGap: null,
    capacityUpperWitnessTeamSharedGap: null,
    capacityUpperWitnessCrossSlotDuplicateCardCount: 0,
    capacityUpperWitnessContextOrProductGap: null,
    upperWitness: null,
  };
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
    return visitedBranchCount % deadlineCheckInterval === 0 && performance.now() >= deadlineAt;
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

    const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
    const bannedCardIds = new Set<number>();

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
