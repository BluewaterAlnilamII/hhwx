use std::collections::HashSet;

use bandori_medley_model::{
    ExactProbabilityV1, MedleySongV1, ResolvedScoreSkillV1, SCORING_RULES_VERSION, SkillBehaviorV1,
};

use crate::{
    MedleySearchInputV1, SEARCH_INPUT_SCHEMA_VERSION, SearchCardSkillContextsV1, SearchError,
    SearchErrorCode,
};

fn invalid(
    code: SearchErrorCode,
    path: impl Into<String>,
    message: impl Into<String>,
) -> Result<(), SearchError> {
    Err(SearchError::new(code, path, message))
}

fn validate_probability(probability: ExactProbabilityV1) -> bool {
    if probability.decimal_scale > 9 {
        return false;
    }
    let denominator = 10_u64.pow(u32::from(probability.decimal_scale));
    if probability.numerator > denominator {
        return false;
    }
    if probability.numerator == 0 {
        return probability.decimal_scale == 0;
    }
    probability.decimal_scale == 0 || !probability.numerator.is_multiple_of(10)
}

fn is_non_negative_number(value: f64) -> bool {
    value.is_finite() && value >= 0.0 && !value.is_sign_negative()
}

fn validate_skill(skill: ResolvedScoreSkillV1, path: &str) -> Result<(), SearchError> {
    if skill.master_skill_id == 0
        || !(1..=5).contains(&skill.skill_level)
        || !skill.duration_seconds.is_finite()
        || skill.duration_seconds <= 0.0
    {
        return invalid(
            SearchErrorCode::InvalidSkill,
            path,
            "masterSkillId/durationSeconds must be positive and skillLevel must be within 1..=5",
        );
    }

    let skill_rates = match skill.behavior {
        SkillBehaviorV1::Neutral => [None, None],
        SkillBehaviorV1::Score { score_up_percent }
        | SkillBehaviorV1::ScoreOnPerfect { score_up_percent }
        | SkillBehaviorV1::PerfectOnly { score_up_percent }
        | SkillBehaviorV1::GreatOrWorseHalf { score_up_percent } => [Some(score_up_percent), None],
        SkillBehaviorV1::ContinuedPerfect {
            active_score_up_percent,
            fallback_score_up_percent,
        } => [
            Some(active_score_up_percent),
            Some(fallback_score_up_percent),
        ],
    };
    if skill_rates
        .into_iter()
        .flatten()
        .any(|rate| !is_non_negative_number(rate))
    {
        return invalid(
            SearchErrorCode::InvalidSkill,
            format!("{path}.behavior"),
            "skill percentages must be finite, non-negative JavaScript numbers",
        );
    }
    if skill.rate_up_with_perfect.is_some()
        && !matches!(skill.behavior, SkillBehaviorV1::Score { .. })
    {
        return invalid(
            SearchErrorCode::InvalidSkill,
            format!("{path}.rateUpWithPerfect"),
            "rate-up is only audited with an unconditional score behavior",
        );
    }
    if let Some(rate_up) = skill.rate_up_with_perfect
        && (!is_non_negative_number(rate_up.stack_percent)
            || !is_non_negative_number(rate_up.max_score_up_percent)
            || rate_up.stack_percent == 0.0
            || skill_rates
                .into_iter()
                .flatten()
                .any(|base_rate| base_rate > rate_up.max_score_up_percent))
    {
        return invalid(
            SearchErrorCode::InvalidSkill,
            format!("{path}.rateUpWithPerfect"),
            "rate-up stack must be positive and its maximum must cover every base score-up rate",
        );
    }
    Ok(())
}

fn validate_skill_contexts(
    contexts: SearchCardSkillContextsV1,
    path: &str,
) -> Result<(), SearchError> {
    let named_contexts = [
        ("mixed", contexts.mixed),
        ("sameBand", contexts.same_band),
        ("sameAttribute", contexts.same_attribute),
        ("sameBandAndAttribute", contexts.same_band_and_attribute),
    ];
    for (name, skill) in named_contexts {
        validate_skill(skill, &format!("{path}.{name}"))?;
    }

    let identity = (
        contexts.mixed.master_skill_id,
        contexts.mixed.skill_level,
        contexts.mixed.duration_seconds,
    );
    if named_contexts.into_iter().any(|(_, skill)| {
        (
            skill.master_skill_id,
            skill.skill_level,
            skill.duration_seconds,
        ) != identity
    }) {
        return invalid(
            SearchErrorCode::InvalidSkill,
            path,
            "all team contexts must describe the same master skill row and duration",
        );
    }
    Ok(())
}

fn validate_song(song: &MedleySongV1, song_index: usize) -> Result<(), SearchError> {
    let path = format!("songs[{song_index}]");
    if usize::from(song.slot) != song_index || song.song_id == 0 || song.play_level == 0 {
        return invalid(
            SearchErrorCode::InvalidSong,
            path,
            "song slots must be ordered 0, 1, 2 and IDs/levels must be positive",
        );
    }
    if song.notes.is_empty() {
        return invalid(
            SearchErrorCode::InvalidChart,
            format!("{path}.notes"),
            "a normalized chart must contain scoring notes",
        );
    }
    if u32::try_from(song.notes.len()).is_err() {
        return invalid(
            SearchErrorCode::CountOverflow,
            format!("{path}.notes"),
            "note count must fit the normalized u32 contract",
        );
    }

    let mut previous_time = 0.0_f64;
    let mut previous_was_non_trigger = false;
    let mut trigger_count = 0_u8;
    for (note_index, note) in song.notes.iter().enumerate() {
        let note_path = format!("{path}.notes[{note_index}]");
        if note.note_id as usize != note_index {
            return invalid(
                SearchErrorCode::InvalidChart,
                format!("{note_path}.noteId"),
                "note IDs must be dense and match sorted note order",
            );
        }
        if !is_non_negative_number(note.time_seconds) {
            return invalid(
                SearchErrorCode::InvalidChart,
                format!("{note_path}.timeSeconds"),
                "timeSeconds must be a finite non-negative JavaScript number",
            );
        }
        if note_index > 0 && note.time_seconds < previous_time {
            return invalid(
                SearchErrorCode::InvalidChart,
                format!("{note_path}.timeSeconds"),
                "note times must be non-decreasing",
            );
        }
        if note_index > 0
            && note.time_seconds == previous_time
            && note.is_skill_trigger
            && previous_was_non_trigger
        {
            return invalid(
                SearchErrorCode::InvalidChart,
                note_path,
                "skill triggers must precede non-trigger notes at the same time",
            );
        }
        if note.is_skill_trigger {
            trigger_count = trigger_count.saturating_add(1);
        }
        previous_time = note.time_seconds;
        previous_was_non_trigger = !note.is_skill_trigger;
    }
    if trigger_count != 6 {
        return invalid(
            SearchErrorCode::InvalidChart,
            format!("{path}.notes"),
            "each medley song must contain exactly six skill triggers",
        );
    }
    Ok(())
}

pub(crate) fn validate_input(input: &MedleySearchInputV1) -> Result<(), SearchError> {
    if input.schema_version != SEARCH_INPUT_SCHEMA_VERSION {
        return invalid(
            SearchErrorCode::UnsupportedSchema,
            "schemaVersion",
            format!("expected {SEARCH_INPUT_SCHEMA_VERSION}"),
        );
    }
    if input.scoring_rules_version != SCORING_RULES_VERSION {
        return invalid(
            SearchErrorCode::UnsupportedRules,
            "scoringRulesVersion",
            format!("expected {SCORING_RULES_VERSION}"),
        );
    }
    if !validate_probability(input.perfect_rate) {
        return invalid(
            SearchErrorCode::InvalidPerfectRate,
            "perfectRate",
            "probability must be canonical, at most nine decimal places, and within 0..=1",
        );
    }
    if u32::try_from(input.cards.len()).is_err() {
        return invalid(
            SearchErrorCode::CountOverflow,
            "cards",
            "card count must fit the normalized u32 index contract",
        );
    }

    let mut master_card_ids = HashSet::with_capacity(input.cards.len());
    for (index, card) in input.cards.iter().enumerate() {
        let path = format!("cards[{index}]");
        if card.instance_id as usize != index {
            return invalid(
                SearchErrorCode::InvalidCard,
                format!("{path}.instanceId"),
                "instance IDs must be dense and match card order",
            );
        }
        if card.master_card_id == 0 || card.character_id == 0 || card.band_id == 0 {
            return invalid(
                SearchErrorCode::InvalidCard,
                &path,
                "masterCardId, characterId, and bandId must be positive",
            );
        }
        if !master_card_ids.insert(card.master_card_id) {
            return invalid(
                SearchErrorCode::InvalidCard,
                format!("{path}.masterCardId"),
                "each owned physical card may appear only once",
            );
        }
        if card
            .character_parameter
            .into_iter()
            .chain(card.event_parameter)
            .any(|value| !is_non_negative_number(value))
        {
            return invalid(
                SearchErrorCode::InvalidCard,
                &path,
                "character and event parameters must be finite, non-negative JavaScript numbers",
            );
        }
        validate_skill_contexts(card.skill_contexts, &format!("{path}.skillContexts"))?;
    }

    if u32::try_from(input.area_items.len()).is_err()
        || u32::try_from(input.area_configurations.len()).is_err()
    {
        return invalid(
            SearchErrorCode::CountOverflow,
            "areaItems",
            "area-item and configuration counts must fit the normalized u32 index contract",
        );
    }
    let mut area_item_ids = HashSet::with_capacity(input.area_items.len());
    for (index, item) in input.area_items.iter().enumerate() {
        let path = format!("areaItems[{index}]");
        if item.area_item_id == 0 || !area_item_ids.insert(item.area_item_id) {
            return invalid(
                SearchErrorCode::InvalidAreaItem,
                format!("{path}.areaItemId"),
                "area-item IDs must be positive and unique",
            );
        }
        if item.target_band_ids.contains(&0) {
            return invalid(
                SearchErrorCode::InvalidAreaItem,
                format!("{path}.targetBandIds"),
                "target band IDs must be positive",
            );
        }
        if item
            .parameter_rates
            .into_iter()
            .any(|rate| !is_non_negative_number(rate))
        {
            return invalid(
                SearchErrorCode::InvalidAreaItem,
                format!("{path}.parameterRates"),
                "parameter rates must be finite, non-negative JavaScript numbers",
            );
        }
    }
    if input.area_configurations.is_empty() {
        return invalid(
            SearchErrorCode::InvalidAreaConfiguration,
            "areaConfigurations",
            "at least one legal shared configuration is required; it may contain no items",
        );
    }
    let mut configurations = HashSet::with_capacity(input.area_configurations.len());
    for (index, configuration) in input.area_configurations.iter().enumerate() {
        let path = format!("areaConfigurations[{index}].selectedAreaItemIds");
        let mut selected_ids = HashSet::with_capacity(configuration.selected_area_item_ids.len());
        for area_item_id in &configuration.selected_area_item_ids {
            if !selected_ids.insert(*area_item_id) {
                return invalid(
                    SearchErrorCode::InvalidAreaConfiguration,
                    &path,
                    "one configuration cannot select the same area item twice",
                );
            }
            if !area_item_ids.contains(area_item_id) {
                return invalid(
                    SearchErrorCode::ReferenceMissing,
                    &path,
                    format!("area item {area_item_id} does not exist"),
                );
            }
        }
        if !configurations.insert(configuration.selected_area_item_ids.as_slice()) {
            return invalid(
                SearchErrorCode::InvalidAreaConfiguration,
                &path,
                "legal area configurations must not be duplicated",
            );
        }
    }

    let mut total_notes = 0_u32;
    for (song_index, song) in input.songs.iter().enumerate() {
        validate_song(song, song_index)?;
        let note_count = u32::try_from(song.notes.len()).map_err(|_| {
            SearchError::new(
                SearchErrorCode::CountOverflow,
                format!("songs[{song_index}].notes"),
                "note count must fit the normalized u32 contract",
            )
        })?;
        total_notes = total_notes.checked_add(note_count).ok_or_else(|| {
            SearchError::new(
                SearchErrorCode::CountOverflow,
                "songs",
                "the three-song combo count must fit u32",
            )
        })?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use bandori_medley_model::{
        DifficultyV1, ExactProbabilityV1, MedleySongV1, ResolvedScoreSkillV1, ScoringNoteV1,
        SkillBehaviorV1,
    };

    use super::*;
    use crate::{
        AreaItemConfigurationV1, CardAttributeV1, SearchAreaItemV1, SearchCardV1,
        decode_medley_search_input_json,
    };

    fn score_skill(id: u32) -> ResolvedScoreSkillV1 {
        ResolvedScoreSkillV1 {
            master_skill_id: id,
            skill_level: 1,
            duration_seconds: 2.0,
            behavior: SkillBehaviorV1::Score {
                score_up_percent: 100.0,
            },
            rate_up_with_perfect: None,
        }
    }

    fn fixture() -> MedleySearchInputV1 {
        let cards = (0_u32..15)
            .map(|instance_id| {
                let skill = score_skill(instance_id + 1);
                SearchCardV1 {
                    instance_id,
                    master_card_id: instance_id + 1,
                    character_id: instance_id + 1,
                    band_id: 1,
                    attribute: CardAttributeV1::Powerful,
                    is_excluded: instance_id == 14,
                    character_parameter: [1000.0, 1000.0, 1000.0],
                    event_parameter: [0.0, 0.0, 0.0],
                    skill_contexts: SearchCardSkillContextsV1 {
                        mixed: skill,
                        same_band: skill,
                        same_attribute: skill,
                        same_band_and_attribute: skill,
                    },
                }
            })
            .collect();
        let songs = std::array::from_fn(|slot| MedleySongV1 {
            slot: u8::try_from(slot).expect("three slots fit in u8"),
            song_id: u32::try_from(slot + 1).expect("three song IDs fit in u32"),
            difficulty: DifficultyV1::Expert,
            play_level: 25,
            notes: (0_u32..7)
                .map(|note_id| ScoringNoteV1 {
                    note_id,
                    time_seconds: f64::from(note_id),
                    is_skill_trigger: note_id < 6,
                })
                .collect(),
        });
        MedleySearchInputV1 {
            schema_version: SEARCH_INPUT_SCHEMA_VERSION.to_owned(),
            scoring_rules_version: SCORING_RULES_VERSION.to_owned(),
            perfect_rate: ExactProbabilityV1 {
                numerator: 995,
                decimal_scale: 3,
            },
            cards,
            area_items: vec![SearchAreaItemV1 {
                area_item_id: 1,
                target_band_ids: vec![1],
                target_attributes: vec![CardAttributeV1::Powerful],
                parameter_rates: [0.1, 0.1, 0.1],
            }],
            area_configurations: vec![AreaItemConfigurationV1 {
                selected_area_item_ids: vec![1],
            }],
            songs,
        }
    }

    #[test]
    fn valid_search_input_round_trips_through_strict_json() {
        let input = fixture();
        input.validate().expect("fixture must be valid");
        let json = serde_json::to_string(&input).expect("fixture serializes");
        let decoded = decode_medley_search_input_json(&json).expect("serialized fixture decodes");
        assert_eq!(decoded, input);
    }

    #[test]
    fn selected_area_items_must_reference_owned_normalized_rows() {
        let mut input = fixture();
        input.area_configurations[0].selected_area_item_ids[0] = 2;
        let error = input
            .validate()
            .expect_err("unknown area item must fail closed");
        assert_eq!(error.code, SearchErrorCode::ReferenceMissing);
    }

    #[test]
    fn team_contexts_must_share_one_source_skill_identity() {
        let mut input = fixture();
        input.cards[0]
            .skill_contexts
            .same_band_and_attribute
            .master_skill_id = 2;
        let error = input
            .validate()
            .expect_err("context rows cannot change the physical source skill");
        assert_eq!(error.code, SearchErrorCode::InvalidSkill);
    }

    #[test]
    fn excluded_cards_are_valid_input_for_later_hard_filtering() {
        let input = fixture();
        assert!(input.cards[14].is_excluded);
        input
            .validate()
            .expect("exclusion is a search filter, not malformed card data");
    }
}
