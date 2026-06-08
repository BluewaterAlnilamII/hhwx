/*
 * Fixed-team song optimizer contracts.
 *
 * Exact results are scoped to the configured discrete offset grid and non-overlapping skill
 * windows. Unsupported or incomplete domains must not be reported as exact.
 */
import type { BandoriJudge, BestdoriChartEntity, ResolvedBandoriSkill } from "../core";

export type BandoriSongOptimizerSearchMode = "exact" | "bounded" | "unsupported";

export type BandoriSongOptimizerSearchScope = "fixedOrder" | "globalSkillAssignment";

export type BandoriSongOptimizerUnsupportedReason =
  | "emptyChart"
  | "invalidInput"
  | "notEnoughSkillTriggers"
  | "overlappingSkillWindow";

export type BandoriSongOptimizerProofJudgement = Exclude<BandoriJudge, "miss">;

export type BandoriSongOptimizerOffset = {
  noteIndex: number;
  sourceIndex: number;
  noteType: string;
  originalFrame: number;
  hitFrame: number;
  offsetFrames: number;
  judgement: BandoriSongOptimizerProofJudgement;
};

export type BandoriSongOptimizerSkillWindow = {
  slotIndex: number;
  cardIndex: number;
  triggerNoteIndex: number;
  triggerSourceIndex: number;
  startFrame: number;
  endFrame: number;
  offsetFrames: number;
  judgement: BandoriSongOptimizerProofJudgement;
};

export type BandoriSongOptimizerProofStats = {
  noteCount: number;
  skillTriggerCount: number;
  searchScope: BandoriSongOptimizerSearchScope;
  leaderCount: number;
  skillOrderCount: number;
  assignmentStateCount: number;
  skillAssignmentTransitionCount: number;
  leaderChoiceTransitionCount: number;
  assignmentUpperBoundPrunedCount: number;
  attemptedWindowLayoutCount: number;
  exactWindowLayoutCount: number;
  boundedWindowLayoutCount: number;
  overlapPrunedWindowCount: number;
  rawWindowCandidateCount: number;
  compressedWindowCandidateCount: number;
  pgSearchProofMode: "notRun" | "noSkillCandidateDp" | "integratedTriggerDp" | "integratedAllJudgementDp";
  integratedDpPassCount: number;
  exactIntegratedDpPassCount: number;
  boundedIntegratedDpPassCount: number;
  layoutUpperBoundPrunedCount: number;
  prunedDpStateCount: number;
  maxDpStateCount: number;
  maxCandidateEventCount: number;
  pgSearchUpperBound: number;
  lowJudgementUpperBound: number;
  lowJudgementProofMode:
    | "notRun"
    | "exactNoSkill"
    | "integratedAllJudgement"
    | "integratedAllJudgementBounded"
    | "monotonicDominatedByPgUpperBound"
    | "optimisticComplex";
  lowJudgementDomainClosed: boolean;
  lowJudgementDomainNotClosed: boolean;
  timedOut: boolean;
  boundedReasons: string[];
  elapsedMs: number;
};

export type OptimizeBandoriSongScoreForFixedTeamOptions = {
  chart: BestdoriChartEntity[];
  playLevel: number;
  skills: Array<ResolvedBandoriSkill | null>;
  totalPower: number;
  leaderIndex?: number | "auto";
  fixedSkillOrder?: readonly number[];
  searchScope?: BandoriSongOptimizerSearchScope;
  stepFrames?: number;
  maxSearchDurationMs?: number;
  useFever?: boolean;
  maxExactCandidateEvents?: number;
  maxExactDpStates?: number;
  maxExactLayouts?: number;
};

export type BandoriSongOptimizerResult = {
  score: number;
  searchMode: BandoriSongOptimizerSearchMode;
  searchScope: BandoriSongOptimizerSearchScope;
  scoreUpperBound: number;
  pgSearchUpperBound: number;
  lowJudgementUpperBound: number;
  unsupportedReason?: BandoriSongOptimizerUnsupportedReason;
  leaderIndex: number | null;
  skillOrder: number[];
  skillWindows: BandoriSongOptimizerSkillWindow[];
  movedNotes: BandoriSongOptimizerOffset[];
  proofStats: BandoriSongOptimizerProofStats;
};
