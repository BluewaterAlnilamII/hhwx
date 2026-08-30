use std::error::Error;
use std::fmt::{Display, Formatter};

use bandori_medley_model::ValidationError;
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
    pub input_validation: Option<ValidationError>,
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
            input_validation: None,
        }
    }

    pub(crate) fn from_validation(error: ValidationError) -> Self {
        Self {
            code: ScoreErrorCode::InputInvalid,
            path: error.path.clone(),
            message: error.message.clone(),
            input_validation: Some(error),
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
