use serde::{Deserialize, Serialize};

use crate::ValidationError;

/// Exact decimal probability represented as `numerator / 10^decimal_scale`.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExactProbabilityV1 {
    pub numerator: u64,
    pub decimal_scale: u8,
}

/// A team-context-resolved score skill behavior.
///
/// Team unification branches are resolved before this contract is built. The
/// Bestdori-compatible P/G model does not carry or evaluate life state.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum SkillBehaviorV1 {
    /// The source skill has no score effect in the P/G-only model.
    Neutral,
    /// The same score-up percent applies to PERFECT and GREAT.
    Score { score_up_percent: f64 },
    /// The score-up percent applies to PERFECT; GREAT keeps its normal score.
    ScoreOnPerfect { score_up_percent: f64 },
    /// PERFECT receives the score-up multiplier and GREAT scores zero.
    PerfectOnly { score_up_percent: f64 },
    /// Bestdori blends the values using PERFECT rate raised to the covered-note count.
    ContinuedPerfect {
        active_score_up_percent: f64,
        fallback_score_up_percent: f64,
    },
    /// PERFECT receives the score-up multiplier and GREAT receives a 0.5 multiplier.
    GreatOrWorseHalf { score_up_percent: f64 },
}

/// A resolved skill attached to one card in one fixed team context.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolvedScoreSkillV1 {
    pub master_skill_id: u32,
    /// Exact source master row selected by the physical card state.
    pub skill_level: u8,
    pub duration_seconds: f64,
    pub behavior: SkillBehaviorV1,
    /// Enables Bestdori's fixed `0.5 * min(covered_notes, 100) * perfect_rate` increase.
    pub is_rate_up_with_perfect: bool,
}

/// One physical card instance after profile, master, area-item, and event resolution.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CardScoringInputV1 {
    pub instance_id: u32,
    pub master_card_id: u32,
    pub character_id: u32,
    pub skill: ResolvedScoreSkillV1,
}

/// One explicitly supplied five-card team. Index two is always the leader.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FixedTeamV1 {
    pub slot: u8,
    pub member_instance_ids: [u32; 5],
    /// Final deck parameter produced by the Bestdori-compatible power pipeline.
    pub deck_total_parameter: f64,
}

/// Supported live difficulties at the normalized boundary.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DifficultyV1 {
    Easy,
    Normal,
    Hard,
    Expert,
    Special,
}

/// One normalized scoring note. The ID is dense in the sorted note sequence.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoringNoteV1 {
    pub note_id: u32,
    pub time_seconds: f64,
    pub is_skill_trigger: bool,
}

/// One song slot in a fixed three-song medley.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MedleySongV1 {
    pub slot: u8,
    pub song_id: u32,
    pub difficulty: DifficultyV1,
    pub play_level: u16,
    pub notes: Vec<ScoringNoteV1>,
}

/// A fully normalized fixed evaluation. It is intentionally not a search request.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FixedMedleyEvaluationInputV1 {
    pub schema_version: String,
    pub scoring_rules_version: String,
    pub perfect_rate: ExactProbabilityV1,
    pub cards: Vec<CardScoringInputV1>,
    pub teams: [FixedTeamV1; 3],
    pub songs: [MedleySongV1; 3],
}

impl FixedMedleyEvaluationInputV1 {
    /// Validate the complete normalized contract without repairing any value.
    pub fn validate(&self) -> Result<(), ValidationError> {
        crate::validation::validate_input(self)
    }
}
