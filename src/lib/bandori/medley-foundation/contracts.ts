export const MEDLEY_FOUNDATION_SOURCE_SCHEMA_VERSION = "hhwx-medley-foundation-source-v1" as const;
export const MEDLEY_SCORING_INPUT_SCHEMA_VERSION = "hhwx-medley-scoring-input-v1" as const;
export const MEDLEY_SCORING_RULES_VERSION = "hhwx-medley-pg-expected-v1" as const;

export type BandoriServer = 0 | 1 | 2 | 3;
export type BandoriCardAttribute = "powerful" | "cool" | "happy" | "pure";
export type MedleyDifficulty = "easy" | "normal" | "hard" | "expert" | "special";
export type Triple<T> = [T, T, T];
export type Five<T> = [T, T, T, T, T];

export type DecodedProfileCardV1 = {
  cardId: number;
  level: number;
  masterRank: number;
  skillLevel: number;
  episodeCount: number;
  isTrained: boolean;
  hasTrainedArt: boolean;
  isExcluded: boolean;
};

export type DecodedCharacterBonusV1 = {
  characterId: number;
  potential: Triple<number | null>;
  collection: Triple<number>;
  training: Triple<number>;
};

export type DecodedAreaItemStateV1 = {
  areaItemId: number;
  level: number;
};

export type DecodedMedleyProfileV1 = {
  name: string;
  server: BandoriServer;
  cards: DecodedProfileCardV1[];
  areaItems: DecodedAreaItemStateV1[];
  characterBonuses: DecodedCharacterBonusV1[];
};

export type ExactProbabilityV1 = {
  numerator: number;
  decimalScale: number;
};

export type RateUpWithPerfectV1 = {
  stackPercent: number;
  maxScoreUpPercent: number;
};

export type SkillBehaviorV1 =
  | { kind: "neutral" }
  | { kind: "score"; scoreUpPercent: number }
  | { kind: "score_on_perfect"; scoreUpPercent: number }
  | { kind: "perfect_only"; scoreUpPercent: number }
  | {
      kind: "continued_perfect";
      activeScoreUpPercent: number;
      fallbackScoreUpPercent: number;
    }
  | { kind: "great_or_worse_half"; scoreUpPercent: number };

export type ResolvedScoreSkillV1 = {
  masterSkillId: number;
  skillLevel: number;
  durationSeconds: number;
  behavior: SkillBehaviorV1;
  rateUpWithPerfect: RateUpWithPerfectV1 | null;
};

export type CardScoringInputV1 = {
  instanceId: number;
  masterCardId: number;
  characterId: number;
  skill: ResolvedScoreSkillV1;
};

export type FixedTeamV1 = {
  slot: number;
  memberInstanceIds: Five<number>;
  leaderInstanceId: number;
  deckTotalParameter: number;
};

export type ScoringNoteV1 = {
  noteId: number;
  timeSeconds: number;
  isSkillTrigger: boolean;
};

export type MedleySongV1 = {
  slot: number;
  songId: number;
  difficulty: MedleyDifficulty;
  playLevel: number;
  notes: ScoringNoteV1[];
};

export type FixedMedleyEvaluationInputV1 = {
  schemaVersion: typeof MEDLEY_SCORING_INPUT_SCHEMA_VERSION;
  scoringRulesVersion: typeof MEDLEY_SCORING_RULES_VERSION;
  perfectRate: ExactProbabilityV1;
  cards: CardScoringInputV1[];
  teams: Triple<FixedTeamV1>;
  songs: Triple<MedleySongV1>;
};
