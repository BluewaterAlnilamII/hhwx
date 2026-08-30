//! Public contract for the greenfield Bandori medley search.
//!
//! This checkpoint defines normalized inputs, exact/incomplete outputs,
//! resource controls, and strict validation. It deliberately contains no
//! scoring, candidate generation, upper bound, enumeration, or join.

#![forbid(unsafe_code)]

mod control;
mod error;
mod input;
mod output;
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
