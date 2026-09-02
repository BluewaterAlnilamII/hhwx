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
pub use scoring::{F64BitsV1, MedleyScoreTraceV1, SongScoreTraceV1, evaluate_fixed_medley};
