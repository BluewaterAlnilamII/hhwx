//! Transparent reference evaluation for explicit five-card teams.
//!
//! This crate deliberately contains no candidate generation, pruning, or team
//! search algorithms. The only bounded enumeration is the game's fixed set of
//! 5! first-five skill orders.

#![forbid(unsafe_code)]

mod error;
mod permutations;
mod scoring;

pub use error::{ScoreError, ScoreErrorCode};
pub use scoring::{MedleyScoreTraceV1, SongScoreTraceV1, evaluate_fixed_medley};

/// Return the only normalized input schema accepted by this reference boundary.
#[must_use]
pub const fn supported_input_schema() -> &'static str {
    bandori_medley_model::SCORING_INPUT_SCHEMA_VERSION
}
