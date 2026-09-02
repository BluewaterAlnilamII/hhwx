use std::error::Error;
use std::fmt::{Display, Formatter};

use serde::{Deserialize, Serialize};

/// Stable failure category for the normalized search boundary.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SearchErrorCode {
    DecodeFailed,
    UnsupportedSchema,
    UnsupportedRules,
    InvalidPerfectRate,
    InvalidCard,
    InvalidSkill,
    InvalidAreaItem,
    InvalidAreaConfiguration,
    InvalidSong,
    InvalidChart,
    ReferenceMissing,
    CountOverflow,
}

/// One fail-closed input error with a stable machine code and field path.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchError {
    pub code: SearchErrorCode,
    pub path: String,
    pub message: String,
}

impl SearchError {
    pub(crate) fn new(
        code: SearchErrorCode,
        path: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            code,
            path: path.into(),
            message: message.into(),
        }
    }

    pub(crate) fn decode_failed(message: impl Into<String>) -> Self {
        Self::new(SearchErrorCode::DecodeFailed, "$", message)
    }
}

impl Display for SearchError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "{:?} at {}: {}",
            self.code, self.path, self.message
        )
    }
}

impl Error for SearchError {}
