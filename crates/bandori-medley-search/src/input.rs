use bandori_medley_model::{ExactProbabilityV1, MedleySongV1, ResolvedScoreSkillV1};
use serde::{Deserialize, Serialize};

use crate::SearchError;

/// One of the four Bestdori card attributes.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CardAttributeV1 {
    Powerful,
    Cool,
    Happy,
    Pure,
}

/// The same physical card skill resolved for every reachable team context.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchCardSkillContextsV1 {
    pub mixed: ResolvedScoreSkillV1,
    pub same_band: ResolvedScoreSkillV1,
    pub same_attribute: ResolvedScoreSkillV1,
    pub same_band_and_attribute: ResolvedScoreSkillV1,
}

/// One owned physical card after profile, master, character, and event resolution.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchCardV1 {
    /// Dense stable index used throughout one search input.
    pub instance_id: u32,
    pub master_card_id: u32,
    pub character_id: u32,
    pub band_id: u32,
    pub attribute: CardAttributeV1,
    /// Hard-excluded cards remain visible at this boundary but never become candidates.
    pub is_excluded: bool,
    /// Card parameter after card-state and HHWX character-bonus resolution.
    pub character_parameter: [f64; 3],
    /// Unrounded event contribution for this card's three parameters.
    pub event_parameter: [f64; 3],
    pub skill_contexts: SearchCardSkillContextsV1,
}

/// One owned area item with its selected-level Bestdori-compatible rates.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SearchAreaItemV1 {
    pub area_item_id: u32,
    pub target_band_ids: Vec<u32>,
    pub target_attributes: Vec<CardAttributeV1>,
    /// Performance, technique, and visual multipliers after division by 100.
    pub parameter_rates: [f64; 3],
}

/// One legal shared area configuration in its scoring operation order.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AreaItemConfigurationV1 {
    pub selected_area_item_ids: Vec<u32>,
}

/// A normalized roster and every legal shared area configuration for three songs.
///
/// Teams, leaders, and the selected final configuration are outputs, not inputs.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MedleySearchInputV1 {
    pub schema_version: String,
    pub scoring_rules_version: String,
    pub perfect_rate: ExactProbabilityV1,
    pub cards: Vec<SearchCardV1>,
    pub area_items: Vec<SearchAreaItemV1>,
    pub area_configurations: Vec<AreaItemConfigurationV1>,
    pub songs: [MedleySongV1; 3],
}

impl MedleySearchInputV1 {
    /// Validate the complete normalized contract without sorting or repairing it.
    pub fn validate(&self) -> Result<(), SearchError> {
        crate::validation::validate_input(self)
    }
}
