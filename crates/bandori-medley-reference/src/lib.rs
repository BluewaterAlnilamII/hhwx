//! Transparent reference evaluation for explicit five-card teams.
//!
//! This crate deliberately contains no candidate generation or search algorithms.

#![forbid(unsafe_code)]

/// Return the only normalized input schema accepted by this reference boundary.
#[must_use]
pub const fn supported_input_schema() -> &'static str {
    bandori_medley_model::SCORING_INPUT_SCHEMA_VERSION
}
