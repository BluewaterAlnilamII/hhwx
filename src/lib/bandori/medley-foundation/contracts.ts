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

export type CalculatedProfileCardV1 = DecodedProfileCardV1 & {
  characterId: number;
  bandId: number | null;
  attribute: BandoriCardAttribute;
  rarity: number;
  skillId: number;
  baseParameter: Triple<number>;
  characterParameter: Triple<number>;
  totalPower: number;
};

export type FixedTeamParameterTraceV1 = {
  cardPower: number;
  areaItemPower: number;
  eventPower: number;
  deckTotalParameter: number;
  selectedAreaItemIds: number[];
  cards: Five<{
    cardId: number;
    baseParameter: Triple<number>;
    characterParameter: Triple<number>;
  }>;
};

export type FixedTeamSkillContextV1 = {
  sameBandId: number | null;
  sameAttribute: BandoriCardAttribute | null;
};

export type FixedTeamSourceSelectionV1 = {
  memberCardIds: Five<number>;
};

export type FixedSongSourceSelectionV1 = {
  songIdText: string;
  difficulty: MedleyDifficulty;
  chart: unknown;
};

export type FixedMedleySourceInputV1 = {
  schemaVersion: typeof MEDLEY_FOUNDATION_SOURCE_SCHEMA_VERSION;
  profilePayload: unknown;
  cardsById: Record<string, unknown>;
  charactersById: Record<string, unknown>;
  skillsById: Record<string, unknown>;
  areaItemsById: Record<string, unknown>;
  songsById: Record<string, unknown>;
  eventBonus: unknown;
  selectedAreaItemIds: number[];
  perfectRatePercentText: string;
  teams: Triple<FixedTeamSourceSelectionV1>;
  songs: Triple<FixedSongSourceSelectionV1>;
};

export type FixedMedleyFoundationAuditV1 = {
  sourceSchemaVersion: typeof MEDLEY_FOUNDATION_SOURCE_SCHEMA_VERSION;
  profileName: string;
  server: BandoriServer;
  selectedCardIds: number[];
  selectedAreaItemIds: number[];
  teamMemberCardIds: Triple<Five<number>>;
  teamParameters: Triple<FixedTeamParameterTraceV1>;
};

export type FixedMedleyFoundationResultV1 = {
  scoringInput: FixedMedleyEvaluationInputV1;
  audit: FixedMedleyFoundationAuditV1;
};
