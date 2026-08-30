//! Greenfield Bandori medley search.
//!
//! The crate owns its normalized contract and an independent implementation
//! of the approved Bestdori-compatible scoring and search design.

#![forbid(unsafe_code)]

mod control;
mod error;
#[allow(
    dead_code,
    reason = "the exact scorer is wired into candidate evaluation in the next checkpoint"
)]
mod exact_score;
mod input;
mod output;
#[allow(
    dead_code,
    reason = "team parameter derivation is wired into candidate scoring in the next checkpoint"
)]
mod parameters;
#[allow(
    dead_code,
    reason = "proved bounds are wired into traversal and join pruning in the next checkpoint"
)]
mod upper_bound;
mod validation;

pub use control::{SearchControl, SearchStopReason};
pub use error::{SearchError, SearchErrorCode};
pub use input::{
    AreaItemConfigurationV1, CardAttributeV1, MedleySearchInputV1, SearchAreaItemV1,
    SearchCardSkillContextsV1, SearchCardV1,
};
pub use output::{
    MedleySearchOutcomeV1, MedleySearchSolutionV1, MedleySearchTeamV1, SearchIncompleteReasonV1,
};

/// Schema identifier for the first normalized medley search input.
pub const SEARCH_INPUT_SCHEMA_VERSION: &str = "hhwx-medley-search-input-v1";

/// Decode strict JSON and validate the complete normalized search input.
pub fn decode_medley_search_input_json(json: &str) -> Result<MedleySearchInputV1, SearchError> {
    let input: MedleySearchInputV1 = serde_json::from_str(json)
        .map_err(|error| SearchError::decode_failed(error.to_string()))?;
    input.validate()?;
    Ok(input)
}
