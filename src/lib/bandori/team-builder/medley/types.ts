/*
 * Medley search type contracts.
 *
 * Public response types live here with the internal DTOs used by the search modules.
 * Keeping them value-free prevents circular runtime dependencies while upper-bound and DFS
 * code can still share one stable vocabulary.
 */

import type { BandoriCardAttribute } from "@/lib/bandori-team-calculator";
import type {
  BandoriAreaItemConfiguration,
  BandoriTeamSearchDifficulty,
  BandoriTeamSearchInput,
  BandoriTeamSearchResult,
  BestdoriChartEntity,
  BestdoriSongMaster,
  CharacterUpperBoundIndex,
  PreparedChart,
  ScoreCalculationCache,
  ScoreComboOptions,
  SearchCard,
} from "@/lib/bandori/team-builder/core";

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
    enableExactCandidateJoin?: boolean;
    exactCandidateSoftLimit?: number;
    exactNodeSoftLimit?: number;
    enableConflictExactBnb?: boolean;
    conflictExactNodeLimit?: number;
    conflictSlotSolveNodeLimit?: number;
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

export type MedleyObservedUpperBoundSource =
  | "configuration-root"
  | "dfs-remaining"
  | "last-slot-completion"
  | "slot-branch";

export type MedleyRemainingUpperBoundLimiter = "capacity" | "correlated";

export type MedleyCapacityUpperMode =
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
  rootUpperPrunedConfigurationCount: number;
  rootUpperBestConfigurationUpperBound: number | null;
  relativeGap: number | null;
  gapClosureFromBaseline: number | null;
  timeToBestScoreMs: number | null;
  timeToGap1PctMs: number | null;
  timeToGap05PctMs: number | null;
  timeToGap01PctMs: number | null;
  upperReplayStateCount: number;
  upperReplayPrunableStateCount: number;
  upperReplayAverageImprovement: number;
  upperReplayElapsedMs: number;
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
  exactCandidateJoinCallCount: number;
  exactCandidateJoinCompletedCount: number;
  exactCandidateJoinAbortCount: number;
  exactCandidateJoinGeneratedCandidateCount: number;
  exactCandidateJoinMaxCandidateCount: number;
  exactCandidateJoinPoppedNodeCount: number;
  exactCandidateJoinPairCount: number;
  exactCandidateJoinThirdQueryCount: number;
  exactCandidateJoinImprovementCount: number;
  bestExactCandidateJoinImprovement: number;
  conflictExactBnbCallCount: number;
  conflictExactBnbCompletedCount: number;
  conflictExactBnbAbortCount: number;
  conflictExactBnbNodeCount: number;
  conflictExactBnbPrunedNodeCount: number;
  conflictExactBnbSolvedNodeCount: number;
  conflictExactBnbMaxOpenNodeCount: number;
  conflictExactBnbSlotSolveCount: number;
  conflictExactBnbSlotCacheHitCount: number;
  conflictExactBnbSlotCacheMissCount: number;
  conflictExactBnbBestUpper: number | null;
  conflictExactBnbBestGap: number | null;
  conflictExactBnbMaxDepth: number;
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

export type MedleySlotSearch = {
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

export type MedleyTeamCandidate = {
  result: BandoriTeamSearchResult;
  cards: SearchCard[];
  cardIds: number[];
};

export type MedleyExactSlotCandidateSearchNode = {
  key: number;
  selectedCards: SearchCard[];
  startIndex: number;
  usedCharacterMaskLow: number;
  usedCharacterMaskHigh: number;
  selectedPower: number;
  candidate: MedleyTeamCandidate | null;
};

export type MedleyExactSlotCandidateGenerator = {
  next: () => MedleyTeamCandidate | null;
  peekUpperBound: () => number;
  hasAborted: () => boolean;
  poppedNodeCount: () => number;
};

export type MedleyExactCandidateJoinResult = {
  proved: boolean;
  result: BandoriMedleyTeamSearchResult | null;
};

export type MedleyExactCandidateJoinSolveResult = {
  timedOut: boolean;
  result: BandoriMedleyTeamSearchResult | null;
};

export type MedleySlotTeamConstraint = {
  forcedCardIds: Set<number>;
  bannedCardIds: Set<number>;
};

export type MedleyConstrainedSlotSolveResult = {
  aborted: boolean;
  candidate: MedleyTeamCandidate | null;
};

export type MedleyConflictExactNode = {
  forcedCardIdsBySlot: Set<number>[];
  bannedCardIdsBySlot: Set<number>[];
  depth: number;
};

export type MedleyConflictExactBnbResult = {
  proved: boolean;
  result: BandoriMedleyTeamSearchResult | null;
  observedUpperBound: number | null;
};

export type MedleyAnchorSlotUpperEstimate = {
  upperBound: number;
  anchorSlotIndex: number;
  candidateCount: number;
  tailUpper: number | null;
};

export type MedleyOpportunityCostUpperEstimate = {
  upperBound: number;
  anchorSlotIndex: number;
  anchorCount: number;
  tailUpper: number | null;
};

export type MedleySlotAvailability = {
  availableCardCount: number;
  availableCharacterCount: number;
  scoreUpperBound: number;
};

export type MedleyBestSlotTeamCacheEntry = {
  candidate: MedleyTeamCandidate | null;
};

export type MedleyFixedCardSetOptimizationCacheEntry = {
  result: BandoriMedleyTeamSearchResult | null;
};

export type MedleyConfigurationWarmupCache = {
  slots: MedleySlotSearch[];
  bestSlotTeamCache: Map<string, MedleyBestSlotTeamCacheEntry>;
  fixedCardSetOptimizationCache: Map<string, MedleyFixedCardSetOptimizationCacheEntry>;
};

export type MedleySkillContextUpperMode = "optimistic" | "mixed" | "same-band" | "same-attribute" | "both";

export type MedleySkillContextUpper = {
  mode: MedleySkillContextUpperMode;
  bandId?: number;
  attribute?: SearchCard["attribute"];
};

export type MedleyCapacityTransition = {
  nextIndexByMask: Int16Array;
  targetIndex: number;
  stateCount: number;
};

export type MedleyCapacityAssignmentScoreUpperBound = {
  upperBound: number;
  coefficientUpperBound: number;
  skillAwareUpperBound: number | null;
  paretoUpperBound: number | null;
  mode: MedleyCapacityUpperMode;
};

export type MedleyCapacityCardsByCharacter = Map<number, Map<number, Array<SearchCard | undefined>>>;

export type MedleyCardBoundPowerUpperBySlot = Array<Map<number, number>>;

export type MedleyCardSpecificCoefficientUpperBySlot = Array<Map<number, number>>;

export type MedleyContextBoundUpperGroup = {
  coefficientUpperByCardId: Map<number, number>;
  averageRateUpperByCardId: Map<number, number>;
  leaderRateUpperByCardId: Map<number, number>;
  averageScoreUpperByCardId: Map<number, number>;
  leaderScoreUpperByCardId: Map<number, number>;
};

export type MedleyContextBoundMcCormickSlotBounds = {
  powerLowerBound: number;
  powerUpperBound: number;
  averageRateLowerBound: number;
  averageRateUpperBound: number;
  leaderRateLowerBound: number;
  leaderRateUpperBound: number;
  skillRateLowerBound: number;
  skillRateUpperBound: number;
};

export type MedleyContextBoundSkillRateBounds = {
  averageLowerBound: number;
  averageUpperBound: number;
  leaderLowerBound: number;
  leaderUpperBound: number;
  skillLowerBound: number;
  skillUpperBound: number;
};

export type MedleySlotSkillCoefficientEstimate = {
  coefficient: number;
  legacyCoefficient: number;
  improvement: number;
};

export type MedleyCapacityWeightedUpperEstimate = {
  upperBound: number;
  weight: number;
};

export type MedleyCapacityBucketedJointUpperEstimate = {
  upperBound: number;
  bucketSize: number;
  targetBucketCount: number;
};

export type MedleyCapacityCardMinCoefficientUpperEstimate = {
  upperBound: number;
  bucketSize: number;
  targetBucketCount: number;
};

export type MedleyCapacityDualObjectiveState = {
  coefficientScore: number;
  skillAwareScore: number;
};

export type MedleyCapacityCardMinCoefficientState = {
  bucket0: number;
  power0: number;
  bucket1: number;
  power1: number;
  bucket2: number;
  power2: number;
};

export type MedleyCapacityAssignmentWitnessSlot = {
  slotIndex: number;
  cards: SearchCard[];
  upperContribution: number;
};

export type MedleyCapacityAssignmentWitness = {
  upperBound: number;
  slots: MedleyCapacityAssignmentWitnessSlot[];
};

export type MedleyCapacityBucketedState = {
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

export type MedleyCapacityParetoState = {
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

export type FixedMedleyCardSetMaskEntry = {
  mask: number;
  indices: readonly [number, number, number, number, number];
};
