use serde::{Deserialize, Serialize};

use crate::{SCORING_INPUT_SCHEMA_VERSION, SCORING_RULES_VERSION, ValidationError};

/// A JSON-safe, bit-exact IEEE-754 single-precision value.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct F32Bits(pub u32);

impl F32Bits {
    /// Construct the wire representation from a native value.
    #[must_use]
    pub const fn from_f32(value: f32) -> Self {
        Self(value.to_bits())
    }

    /// Decode the represented native value.
    #[must_use]
    pub const fn to_f32(self) -> f32 {
        f32::from_bits(self.0)
    }
}

/// Exact decimal probability represented as `numerator / 10^decimal_scale`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExactProbabilityV1 {
    pub numerator: u64,
    pub decimal_scale: u8,
}

/// Optional dynamic increase used by skills that grow with PERFECT judgments.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RateUpWithPerfectV1 {
    /// Amount added after each PERFECT, including the current note.
    pub stack_percent_bits: F32Bits,
    /// Maximum total score-up percent after the base skill line and stacks.
    pub max_score_up_percent_bits: F32Bits,
}

/// A team-context-resolved score skill behavior.
///
/// Life and unification branches must be resolved before this contract is built.
/// This removes source object ordering and implicit fallback from score evaluation.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum SkillBehaviorV1 {
    /// The same score-up percent applies to PERFECT and GREAT.
    Score { score_up_percent_bits: F32Bits },
    /// PERFECT receives the score-up multiplier and GREAT scores zero.
    PerfectOnly { score_up_percent_bits: F32Bits },
    /// The high value remains only while all earlier active notes were PERFECT.
    ContinuedPerfect {
        active_score_up_percent_bits: F32Bits,
        fallback_score_up_percent_bits: F32Bits,
    },
    /// PERFECT receives the score-up multiplier and GREAT receives a 0.5 multiplier.
    GreatOrWorseHalf { score_up_percent_bits: F32Bits },
}

/// A resolved skill attached to one card in one fixed team context.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolvedScoreSkillV1 {
    pub master_skill_id: u32,
    pub duration_micros: u64,
    pub behavior: SkillBehaviorV1,
    pub rate_up_with_perfect: Option<RateUpWithPerfectV1>,
}

/// One physical card instance after profile, master, area-item, and event resolution.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CardScoringInputV1 {
    pub instance_id: u32,
    pub master_card_id: u32,
    pub character_id: u32,
    pub skill: ResolvedScoreSkillV1,
}

/// One explicitly supplied five-card team. Index two is always the leader.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FixedTeamV1 {
    pub slot: u8,
    pub member_instance_ids: [u32; 5],
    /// Final deck parameter produced by the audited client-compatible power pipeline.
    pub deck_total_parameter_bits: F32Bits,
}

/// Supported live difficulties at the normalized boundary.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DifficultyV1 {
    Easy,
    Normal,
    Hard,
    Expert,
    Special,
}

/// One normalized scoring note. The ID is dense in the sorted note sequence.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoringNoteV1 {
    pub note_id: u32,
    pub time_micros: u64,
    pub is_skill_trigger: bool,
}

/// One song slot in a fixed three-song medley.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MedleySongV1 {
    pub slot: u8,
    pub song_id: u32,
    pub difficulty: DifficultyV1,
    pub play_level: u16,
    pub notes: Vec<ScoringNoteV1>,
}

/// A fully normalized fixed evaluation. It is intentionally not a search request.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
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

    /// Whether this input identifies the only currently supported schema and rules.
    #[must_use]
    pub fn has_supported_versions(&self) -> bool {
        self.schema_version == SCORING_INPUT_SCHEMA_VERSION
            && self.scoring_rules_version == SCORING_RULES_VERSION
    }
}
