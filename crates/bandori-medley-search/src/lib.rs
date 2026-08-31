//! Greenfield Bandori medley search.
//!
//! The crate owns its normalized contract and an independent implementation
//! of the approved Bestdori-compatible scoring and search design.

#![forbid(unsafe_code)]

mod candidate;
mod control;
mod error;
mod exact_score;
mod fast_upper;
mod input;
mod output;
mod parameters;
mod search;
mod upper_bound;
mod validation;

pub use control::{SearchControl, SearchStopReason};
pub use error::{SearchError, SearchErrorCode};
pub use input::{
    AreaItemConfigurationV1, CardAttributeV1, MedleySearchInputV1, SearchAreaItemV1,
    SearchCardSkillContextsV1, SearchCardV1,
};
pub use output::{
    MedleySearchDiagnosticsV1, MedleySearchOutcomeV1, MedleySearchSolutionV1, MedleySearchTeamV1,
    SearchIncompleteReasonV1,
};
pub use search::search_medley;

/// Schema identifier for the first normalized medley search input.
pub const SEARCH_INPUT_SCHEMA_VERSION: &str = "hhwx-medley-search-input-v1";

/// Decode strict JSON and validate the complete normalized search input.
pub fn decode_medley_search_input_json(json: &str) -> Result<MedleySearchInputV1, SearchError> {
    let input: MedleySearchInputV1 = serde_json::from_str(json)
        .map_err(|error| SearchError::decode_failed(error.to_string()))?;
    input.validate()?;
    Ok(input)
}
