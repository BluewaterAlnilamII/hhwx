use std::collections::{HashMap, HashSet};
use std::error::Error;
use std::fmt::{Display, Formatter};

use serde::{Deserialize, Serialize};

use crate::{
    ExactProbabilityV1, F32Bits, FixedMedleyEvaluationInputV1, SCORING_INPUT_SCHEMA_VERSION,
    SCORING_RULES_VERSION, SkillBehaviorV1,
};

/// Stable failure category for the normalized boundary.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ValidationCode {
    DecodeFailed,
    UnsupportedSchema,
    UnsupportedRules,
    InvalidPerfectRate,
    InvalidCardCount,
    InvalidCard,
    InvalidSkill,
    InvalidTeam,
    InvalidSong,
    InvalidChart,
    ReferenceMissing,
}

/// One fail-closed validation error with a stable machine code and field path.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ValidationError {
    pub code: ValidationCode,
    pub path: String,
    pub message: String,
}

impl ValidationError {
    fn new(code: ValidationCode, path: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code,
            path: path.into(),
            message: message.into(),
        }
    }
}

impl Display for ValidationError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "{:?} at {}: {}",
            self.code, self.path, self.message
        )
    }
}

impl Error for ValidationError {}

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

fn validate_non_negative_f32(bits: F32Bits) -> bool {
    let value = bits.to_f32();
    value.is_finite() && value >= 0.0 && bits.0 != (-0.0_f32).to_bits()
}

fn invalid(
    code: ValidationCode,
    path: impl Into<String>,
    message: impl Into<String>,
) -> Result<(), ValidationError> {
    Err(ValidationError::new(code, path, message))
}

pub(crate) fn validate_input(input: &FixedMedleyEvaluationInputV1) -> Result<(), ValidationError> {
    if input.schema_version != SCORING_INPUT_SCHEMA_VERSION {
        return invalid(
            ValidationCode::UnsupportedSchema,
            "schemaVersion",
            format!("expected {SCORING_INPUT_SCHEMA_VERSION}"),
        );
    }
    if input.scoring_rules_version != SCORING_RULES_VERSION {
        return invalid(
            ValidationCode::UnsupportedRules,
            "scoringRulesVersion",
            format!("expected {SCORING_RULES_VERSION}"),
        );
    }
    if !validate_probability(input.perfect_rate) {
        return invalid(
            ValidationCode::InvalidPerfectRate,
            "perfectRate",
            "probability must be canonical, at most nine decimal places, and within 0..=1",
        );
    }
    if input.cards.len() != 15 {
        return invalid(
            ValidationCode::InvalidCardCount,
            "cards",
            "a fixed three-team evaluation requires exactly 15 card instances",
        );
    }

    let mut cards_by_id = HashMap::with_capacity(input.cards.len());
    for (index, card) in input.cards.iter().enumerate() {
        let path = format!("cards[{index}]");
        if card.instance_id as usize != index {
            return invalid(
                ValidationCode::InvalidCard,
                format!("{path}.instanceId"),
                "instance IDs must be dense and match card order",
            );
        }
        if card.master_card_id == 0 || card.character_id == 0 {
            return invalid(
                ValidationCode::InvalidCard,
                path,
                "masterCardId and characterId must be positive",
            );
        }
        if card.skill.master_skill_id == 0 || card.skill.duration_micros == 0 {
            return invalid(
                ValidationCode::InvalidSkill,
                format!("{path}.skill"),
                "masterSkillId and durationMicros must be positive",
            );
        }
        let skill_rates = match card.skill.behavior {
            SkillBehaviorV1::Score {
                score_up_percent_bits,
            }
            | SkillBehaviorV1::PerfectOnly {
                score_up_percent_bits,
            }
            | SkillBehaviorV1::GreatOrWorseHalf {
                score_up_percent_bits,
            } => [Some(score_up_percent_bits), None],
            SkillBehaviorV1::ContinuedPerfect {
                active_score_up_percent_bits,
                fallback_score_up_percent_bits,
            } => [
                Some(active_score_up_percent_bits),
                Some(fallback_score_up_percent_bits),
            ],
        };
        if skill_rates
            .into_iter()
            .flatten()
            .any(|rate| !validate_non_negative_f32(rate))
        {
            return invalid(
                ValidationCode::InvalidSkill,
                format!("{path}.skill.behavior"),
                "skill percentages must be finite, non-negative, canonical f32 values",
            );
        }
        if let Some(rate_up) = card.skill.rate_up_with_perfect
            && (!validate_non_negative_f32(rate_up.increment_percent_bits)
                || rate_up.max_perfect_count == 0)
        {
            return invalid(
                ValidationCode::InvalidSkill,
                format!("{path}.skill.rateUpWithPerfect"),
                "rate-up increment must be finite and non-negative and its cap must be positive",
            );
        }
        cards_by_id.insert(card.instance_id, card);
    }

    let mut used_instances = HashSet::with_capacity(15);
    for (team_index, team) in input.teams.iter().enumerate() {
        let path = format!("teams[{team_index}]");
        if usize::from(team.slot) != team_index {
            return invalid(
                ValidationCode::InvalidTeam,
                format!("{path}.slot"),
                "team slots must be ordered 0, 1, 2",
            );
        }
        if !validate_non_negative_f32(team.deck_total_parameter_bits) {
            return invalid(
                ValidationCode::InvalidTeam,
                format!("{path}.deckTotalParameterBits"),
                "deck total must be a finite, non-negative, canonical f32",
            );
        }
        let mut team_characters = HashSet::with_capacity(5);
        for (member_index, instance_id) in team.member_instance_ids.iter().enumerate() {
            let Some(card) = cards_by_id.get(instance_id) else {
                return invalid(
                    ValidationCode::ReferenceMissing,
                    format!("{path}.memberInstanceIds[{member_index}]"),
                    "card instance does not exist",
                );
            };
            if !used_instances.insert(*instance_id) {
                return invalid(
                    ValidationCode::InvalidTeam,
                    format!("{path}.memberInstanceIds[{member_index}]"),
                    "a physical card instance may appear only once across the medley",
                );
            }
            if !team_characters.insert(card.character_id) {
                return invalid(
                    ValidationCode::InvalidTeam,
                    path,
                    "characters must be unique within a team",
                );
            }
        }
    }
    if used_instances.len() != input.cards.len() {
        return invalid(
            ValidationCode::InvalidTeam,
            "teams",
            "all 15 normalized card instances must be assigned exactly once",
        );
    }

    for (song_index, song) in input.songs.iter().enumerate() {
        let path = format!("songs[{song_index}]");
        if usize::from(song.slot) != song_index || song.song_id == 0 || song.play_level == 0 {
            return invalid(
                ValidationCode::InvalidSong,
                path,
                "song slots must be ordered 0, 1, 2 and IDs/levels must be positive",
            );
        }
        if song.notes.is_empty() {
            return invalid(
                ValidationCode::InvalidChart,
                format!("{path}.notes"),
                "a normalized chart must contain scoring notes",
            );
        }
        let mut previous_time = 0_u64;
        let mut previous_was_non_trigger = false;
        let mut trigger_count = 0_u8;
        for (note_index, note) in song.notes.iter().enumerate() {
            let note_path = format!("{path}.notes[{note_index}]");
            if note.note_id as usize != note_index {
                return invalid(
                    ValidationCode::InvalidChart,
                    format!("{note_path}.noteId"),
                    "note IDs must be dense and match sorted note order",
                );
            }
            if note_index > 0 && note.time_micros < previous_time {
                return invalid(
                    ValidationCode::InvalidChart,
                    format!("{note_path}.timeMicros"),
                    "note times must be non-decreasing",
                );
            }
            if note_index > 0
                && note.time_micros == previous_time
                && note.is_skill_trigger
                && previous_was_non_trigger
            {
                return invalid(
                    ValidationCode::InvalidChart,
                    note_path,
                    "skill triggers must precede non-trigger notes at the same time",
                );
            }
            if note.is_skill_trigger {
                trigger_count = trigger_count.saturating_add(1);
            }
            previous_time = note.time_micros;
            previous_was_non_trigger = !note.is_skill_trigger;
        }
        if trigger_count != 6 {
            return invalid(
                ValidationCode::InvalidChart,
                format!("{path}.notes"),
                "each medley song must contain exactly six skill triggers",
            );
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        CardScoringInputV1, DifficultyV1, FixedTeamV1, MedleySongV1, ResolvedScoreSkillV1,
        ScoringNoteV1,
    };

    fn fixture() -> FixedMedleyEvaluationInputV1 {
        let cards = (0_u32..15)
            .map(|instance_id| CardScoringInputV1 {
                instance_id,
                master_card_id: instance_id + 1,
                character_id: instance_id + 1,
                skill: ResolvedScoreSkillV1 {
                    master_skill_id: instance_id + 1,
                    duration_micros: 2_000_000,
                    behavior: SkillBehaviorV1::Score {
                        score_up_percent_bits: F32Bits::from_f32(100.0),
                    },
                    rate_up_with_perfect: None,
                },
            })
            .collect();
        let teams = std::array::from_fn(|slot| FixedTeamV1 {
            slot: u8::try_from(slot).expect("three slots fit in u8"),
            member_instance_ids: std::array::from_fn(|member| {
                u32::try_from(slot * 5 + member).expect("15 fixture cards fit in u32")
            }),
            deck_total_parameter_bits: F32Bits::from_f32(17_250.0),
        });
        let songs = std::array::from_fn(|slot| MedleySongV1 {
            slot: u8::try_from(slot).expect("three slots fit in u8"),
            song_id: u32::try_from(slot + 1).expect("three song IDs fit in u32"),
            difficulty: DifficultyV1::Expert,
            play_level: 25,
            notes: (0_u32..7)
                .map(|note_id| ScoringNoteV1 {
                    note_id,
                    time_micros: u64::from(note_id) * 1_000_000,
                    is_skill_trigger: note_id < 6,
                })
                .collect(),
        });
        FixedMedleyEvaluationInputV1 {
            schema_version: SCORING_INPUT_SCHEMA_VERSION.to_owned(),
            scoring_rules_version: SCORING_RULES_VERSION.to_owned(),
            perfect_rate: ExactProbabilityV1 {
                numerator: 995,
                decimal_scale: 3,
            },
            cards,
            teams,
            songs,
        }
    }

    #[test]
    fn valid_fixed_input_round_trips_through_strict_json() {
        let input = fixture();
        input.validate().expect("fixture must be valid");
        let json = serde_json::to_string(&input).expect("fixture serializes");
        let decoded: FixedMedleyEvaluationInputV1 =
            serde_json::from_str(&json).expect("serialized fixture decodes");
        decoded.validate().expect("decoded fixture validates");
        assert_eq!(decoded, input);
    }

    #[test]
    fn unknown_json_fields_fail_closed() {
        let input = fixture();
        let mut value = serde_json::to_value(input).expect("fixture serializes");
        value
            .as_object_mut()
            .expect("fixture root is an object")
            .insert("searchLimit".to_owned(), serde_json::json!(1));
        let decoded = serde_json::from_value::<FixedMedleyEvaluationInputV1>(value);
        assert!(decoded.is_err(), "unknown search controls must be rejected");
    }

    #[test]
    fn duplicate_physical_instance_fails_closed() {
        let mut input = fixture();
        input.teams[1].member_instance_ids[0] = input.teams[0].member_instance_ids[0];
        let error = input
            .validate()
            .expect_err("a physical instance cannot cross teams");
        assert_eq!(error.code, ValidationCode::InvalidTeam);
    }

    #[test]
    fn noncanonical_probability_fails_closed() {
        let mut input = fixture();
        input.perfect_rate = ExactProbabilityV1 {
            numerator: 990,
            decimal_scale: 3,
        };
        let error = input
            .validate()
            .expect_err("trailing decimal zero must be normalized away");
        assert_eq!(error.code, ValidationCode::InvalidPerfectRate);
    }

    #[test]
    fn trigger_after_same_time_non_trigger_fails_closed() {
        let mut input = fixture();
        input.songs[0].notes[1].time_micros = 0;
        input.songs[0].notes[0].is_skill_trigger = false;
        input.songs[0].notes[1].is_skill_trigger = true;
        let error = input
            .validate()
            .expect_err("normalization must order simultaneous triggers first");
        assert_eq!(error.code, ValidationCode::InvalidChart);
    }
}
