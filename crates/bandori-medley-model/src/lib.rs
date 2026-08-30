//! Versioned, search-independent inputs for the greenfield Bandori medley scorer.
//!
//! The model uses explicit integer or IEEE-754 bit representations at its JSON
//! boundary. It does not accept UI state, network responses, search controls, or
//! values inherited from the legacy team builder.

#![forbid(unsafe_code)]

mod input;
mod validation;

pub use input::{
    CardScoringInputV1, DifficultyV1, ExactProbabilityV1, F32Bits, FixedMedleyEvaluationInputV1,
    FixedTeamV1, MedleySongV1, RateUpWithPerfectV1, ResolvedScoreSkillV1, ScoringNoteV1,
    SkillBehaviorV1,
};
pub use validation::{ValidationCode, ValidationError};

/// Schema identifier reserved for the first normalized scoring input contract.
pub const SCORING_INPUT_SCHEMA_VERSION: &str = "hhwx-medley-scoring-input-v1";

/// Rules identifier for the PERFECT/GREAT-only HHWX expected-score model.
pub const SCORING_RULES_VERSION: &str = "hhwx-medley-pg-expected-v1";

/// Decode strict JSON and validate the complete fixed-input contract.
pub fn decode_fixed_medley_evaluation_json(
    json: &str,
) -> Result<FixedMedleyEvaluationInputV1, ValidationError> {
    let input: FixedMedleyEvaluationInputV1 = serde_json::from_str(json)
        .map_err(|error| ValidationError::decode_failed(error.to_string()))?;
    input.validate()?;
    Ok(input)
}
