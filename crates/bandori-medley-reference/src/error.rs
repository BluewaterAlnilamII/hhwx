use std::error::Error;
use std::fmt::{Display, Formatter};

use serde::Serialize;

/// Stable reference-scorer failure category.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ScoreErrorCode {
    InputInvalid,
    ArithmeticNonFinite,
    ArithmeticOverflow,
}

/// Fail-closed scoring failure with an attributable input/result path.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreError {
    pub code: ScoreErrorCode,
    pub path: String,
    pub message: String,
}

impl ScoreError {
    pub(crate) fn new(
        code: ScoreErrorCode,
        path: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            code,
            path: path.into(),
            message: message.into(),
        }
    }
}

impl Display for ScoreError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "{:?} at {}: {}",
            self.code, self.path, self.message
        )
    }
}

impl Error for ScoreError {}
