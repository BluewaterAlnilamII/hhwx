use std::collections::BTreeMap;

use bandori_medley_model::{
    ExactProbabilityV1, FixedMedleyEvaluationInputV1, FixedTeamV1, MedleySongV1,
    ResolvedScoreSkillV1, SCORING_RULES_VERSION, SkillBehaviorV1,
};
use serde::Serialize;

use crate::error::{ScoreError, ScoreErrorCode};
use crate::permutations::skill_orders;

const SKILL_ORDER_COUNT: u16 = 120;
const PERFECT_RATE: f32 = 1.1_f32;
const GREAT_RATE: f32 = 0.8_f32;

/// JSON-safe IEEE-754 double-precision payload split into two exact u32 words.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct F64BitsV1 {
    pub high: u32,
    pub low: u32,
}

impl F64BitsV1 {
    #[must_use]
    pub const fn from_f64(value: f64) -> Self {
        let bits = value.to_bits();
        Self {
            high: (bits >> 32) as u32,
            low: bits as u32,
        }
    }

    #[must_use]
    pub fn to_f64(self) -> f64 {
        f64::from_bits((u64::from(self.high) << 32) | u64::from(self.low))
    }
}

/// First-round note scores after judgment and medley combo correction.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JudgmentScoreTraceV1 {
    pub perfect: u32,
    pub great: u32,
}

/// Auditable score trace for one song and one already selected team.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongScoreTraceV1 {
    pub slot: u8,
    pub start_combo: u32,
    pub note_count: u32,
    pub deck_total_parameter_bits: u32,
    pub play_level_rate_bits: u32,
    pub base_score_per_note_bits: u32,
    pub base_note_scores: Vec<JudgmentScoreTraceV1>,
    pub base_expected_score_bits: F64BitsV1,
    pub permutation_expected_score_bits: Vec<F64BitsV1>,
    pub average_score_bits: F64BitsV1,
    pub score_order_count: u16,
    pub peak_judgment_state_count: u32,
}

impl SongScoreTraceV1 {
    /// Decode the stable IEEE-754 representation of the average score.
    #[must_use]
    pub fn average_score(&self) -> f64 {
        self.average_score_bits.to_f64()
    }
}

/// Expected score for all three fixed song/team slots.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MedleyScoreTraceV1 {
    pub scoring_rules_version: String,
    pub songs: [SongScoreTraceV1; 3],
    pub total_average_score_bits: F64BitsV1,
}

impl MedleyScoreTraceV1 {
    /// Decode the stable IEEE-754 representation of the medley objective.
    #[must_use]
    pub fn total_average_score(&self) -> f64 {
        self.total_average_score_bits.to_f64()
    }
}

#[derive(Clone, Copy)]
struct Activation<'a> {
    trigger_time_micros: u64,
    end_time_micros: u64,
    skill: &'a ResolvedScoreSkillV1,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct ActivationState {
    continued_active: bool,
    rate_up_accumulator_bits: u32,
}

impl Default for ActivationState {
    fn default() -> Self {
        Self {
            continued_active: true,
            rate_up_accumulator_bits: 0.0_f32.to_bits(),
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord)]
struct JudgmentState {
    activations: [ActivationState; 6],
}

#[derive(Clone, Copy, Debug, Default)]
struct WeightedScore {
    probability: f64,
    weighted_score: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Judgment {
    Perfect,
    Great,
}

fn exact_probability_to_f64(probability: ExactProbabilityV1) -> f64 {
    let denominator = 10_u64.pow(u32::from(probability.decimal_scale));
    probability.numerator as f64 / denominator as f64
}

fn play_level_rate(play_level: u16) -> f32 {
    let level_offset = f32::from(play_level) - 5.0_f32;
    let adjustment = level_offset * 0.01_f32;
    1.0_f32 + adjustment
}

fn base_score_per_note(deck_total_parameter: f32, play_level: u16, note_count: u32) -> f32 {
    let after_level = deck_total_parameter * play_level_rate(play_level);
    let after_note_count = after_level / note_count as f32;
    after_note_count * 3.0_f32
}

// Exact f32 payloads from JP masterMedleyComboRateList artifact
// a4a77ff9daee4d0373612044e14d4844343bceed4b32a34843300e81e2d331ab.
// Reconstructing these values with f32 arithmetic is not equivalent: 1.04 +
// 3 * 0.01 is one ULP below the stored 1.07 value.
const MEDLEY_COMBO_RATE_BITS: [u32; 35] = [
    0x3f80_0000,
    0x3f81_47ae,
    0x3f82_8f5c,
    0x3f83_d70a,
    0x3f85_1eb8,
    0x3f86_6666,
    0x3f87_ae14,
    0x3f88_f5c3,
    0x3f8a_3d71,
    0x3f8b_851f,
    0x3f8c_cccd,
    0x3f8e_147b,
    0x3f8f_5c29,
    0x3f90_a3d7,
    0x3f91_eb85,
    0x3f93_3333,
    0x3f94_7ae1,
    0x3f95_c28f,
    0x3f97_0a3d,
    0x3f98_51ec,
    0x3f99_999a,
    0x3f9a_e148,
    0x3f9c_28f6,
    0x3f9d_70a4,
    0x3f9e_b852,
    0x3fa0_0000,
    0x3fa1_47ae,
    0x3fa2_8f5c,
    0x3fa3_d70a,
    0x3fa5_1eb8,
    0x3fa6_6666,
    0x3fa7_ae14,
    0x3fa8_f5c3,
    0x3faa_3d71,
    0x3fab_851f,
];

fn medley_combo_rate(combo: u32) -> f32 {
    let table_index = match combo {
        0..=20 => 0,
        21..=50 => 1,
        51..=100 => 2,
        101..=300 => 3 + (combo - 101) / 50,
        301..=3_000 => 7 + (combo - 301) / 100,
        3_001..=9_999 => 34,
        _ => 0,
    };
    f32::from_bits(MEDLEY_COMBO_RATE_BITS[table_index as usize])
}

fn floor_f32_to_u32(value: f32, path: &str) -> Result<u32, ScoreError> {
    if !value.is_finite() || value < 0.0 {
        return Err(ScoreError::new(
            ScoreErrorCode::ArithmeticNonFinite,
            path,
            "score intermediate must be finite and non-negative",
        ));
    }
    let floored = value.floor();
    if f64::from(floored) > f64::from(u32::MAX) {
        return Err(ScoreError::new(
            ScoreErrorCode::ArithmeticOverflow,
            path,
            "per-note score exceeds the client uint32 boundary",
        ));
    }
    Ok(floored as u32)
}

fn percent_multiplier(percent: f32) -> f32 {
    let normalized = percent / 100.0_f32;
    1.0_f32 + normalized
}

fn base_skill_multiplier(
    skill: &ResolvedScoreSkillV1,
    state: &mut ActivationState,
    judgment: Judgment,
) -> f32 {
    match skill.behavior {
        SkillBehaviorV1::Neutral => 1.0_f32,
        SkillBehaviorV1::Score {
            score_up_percent_bits,
        } => percent_multiplier(score_up_percent_bits.to_f32()),
        SkillBehaviorV1::ScoreOnPerfect {
            score_up_percent_bits,
        } => match judgment {
            Judgment::Perfect => percent_multiplier(score_up_percent_bits.to_f32()),
            Judgment::Great => 1.0_f32,
        },
        SkillBehaviorV1::PerfectOnly {
            score_up_percent_bits,
        } => match judgment {
            Judgment::Perfect => percent_multiplier(score_up_percent_bits.to_f32()),
            Judgment::Great => 0.0_f32,
        },
        SkillBehaviorV1::ContinuedPerfect {
            active_score_up_percent_bits,
            fallback_score_up_percent_bits,
        } => {
            if judgment == Judgment::Great {
                state.continued_active = false;
            }
            if state.continued_active {
                percent_multiplier(active_score_up_percent_bits.to_f32())
            } else {
                percent_multiplier(fallback_score_up_percent_bits.to_f32())
            }
        }
        SkillBehaviorV1::GreatOrWorseHalf {
            score_up_percent_bits,
        } => match judgment {
            Judgment::Perfect => percent_multiplier(score_up_percent_bits.to_f32()),
            Judgment::Great => 0.5_f32,
        },
    }
}

fn skill_multiplier(
    skill: &ResolvedScoreSkillV1,
    state: &mut ActivationState,
    judgment: Judgment,
) -> f32 {
    let mut multiplier = base_skill_multiplier(skill, state, judgment);
    let Some(rate_up) = skill.rate_up_with_perfect else {
        return multiplier;
    };

    let base_bonus_percent = (multiplier - 1.0_f32) * 100.0_f32;
    let accumulator_cap = rate_up.max_score_up_percent_bits.to_f32() - base_bonus_percent;
    let mut accumulator = f32::from_bits(state.rate_up_accumulator_bits);
    if judgment == Judgment::Perfect {
        let incremented = accumulator + rate_up.stack_percent_bits.to_f32();
        accumulator = incremented.min(accumulator_cap);
        state.rate_up_accumulator_bits = accumulator.to_bits();
    }
    let accumulator_rate = accumulator / 100.0_f32;
    multiplier += accumulator_rate;
    multiplier
}

fn build_base_note_scores(
    song: &MedleySongV1,
    team: &FixedTeamV1,
    start_combo: u32,
) -> Result<(f32, f32, Vec<JudgmentScoreTraceV1>), ScoreError> {
    let note_count = u32::try_from(song.notes.len()).map_err(|_| {
        ScoreError::new(
            ScoreErrorCode::ArithmeticOverflow,
            format!("songs[{}].notes", song.slot),
            "note count exceeds u32",
        )
    })?;
    let deck_total_parameter = team.deck_total_parameter_bits.to_f32();
    let level_rate = play_level_rate(song.play_level);
    let base = base_score_per_note(deck_total_parameter, song.play_level, note_count);
    if !level_rate.is_finite() || !base.is_finite() || base < 0.0 {
        return Err(ScoreError::new(
            ScoreErrorCode::ArithmeticNonFinite,
            format!("songs[{}].baseScorePerNote", song.slot),
            "client-order f32 base score must remain finite and non-negative",
        ));
    }

    let mut scores = Vec::with_capacity(song.notes.len());
    for note_index in 0..note_count {
        let combo = start_combo.checked_add(note_index + 1).ok_or_else(|| {
            ScoreError::new(
                ScoreErrorCode::ArithmeticOverflow,
                format!("songs[{}].notes[{note_index}].combo", song.slot),
                "medley combo exceeds u32",
            )
        })?;
        let combo_rate = medley_combo_rate(combo);
        let perfect_corrected = base * PERFECT_RATE;
        let great_corrected = base * GREAT_RATE;
        let perfect_with_combo = perfect_corrected * combo_rate;
        let great_with_combo = great_corrected * combo_rate;
        scores.push(JudgmentScoreTraceV1 {
            perfect: floor_f32_to_u32(
                perfect_with_combo,
                &format!("songs[{}].notes[{note_index}].perfectBaseScore", song.slot),
            )?,
            great: floor_f32_to_u32(
                great_with_combo,
                &format!("songs[{}].notes[{note_index}].greatBaseScore", song.slot),
            )?,
        });
    }
    Ok((level_rate, base, scores))
}

fn build_activations<'a>(
    input: &'a FixedMedleyEvaluationInputV1,
    song: &MedleySongV1,
    team: &FixedTeamV1,
    order: [usize; 5],
) -> Result<[Activation<'a>; 6], ScoreError> {
    let trigger_notes: Vec<_> = song
        .notes
        .iter()
        .filter(|note| note.is_skill_trigger)
        .collect();
    let mut activations = Vec::with_capacity(6);
    for (trigger_index, trigger_note) in trigger_notes.into_iter().enumerate() {
        let instance_id = if trigger_index < 5 {
            team.member_instance_ids[order[trigger_index]]
        } else {
            team.leader_instance_id
        };
        let skill = &input.cards[instance_id as usize].skill;
        let end_time_micros = trigger_note
            .time_micros
            .checked_add(skill.duration_micros)
            .ok_or_else(|| {
                ScoreError::new(
                    ScoreErrorCode::ArithmeticOverflow,
                    format!("songs[{}].skillTriggers[{trigger_index}]", song.slot),
                    "skill end time exceeds u64",
                )
            })?;
        activations.push(Activation {
            trigger_time_micros: trigger_note.time_micros,
            end_time_micros,
            skill,
        });
    }
    activations.try_into().map_err(|_| {
        ScoreError::new(
            ScoreErrorCode::InputInvalid,
            format!("songs[{}].skillTriggers", song.slot),
            "validated song did not contain six skill triggers",
        )
    })
}

fn judgment_probability(judgment: Judgment, perfect_rate: f64) -> f64 {
    match judgment {
        Judgment::Perfect => perfect_rate,
        Judgment::Great => 1.0_f64 - perfect_rate,
    }
}

fn canonicalize_expired_states(
    state: &mut JudgmentState,
    activations: &[Activation<'_>; 6],
    note_time_micros: u64,
) {
    for (activation_index, activation) in activations.iter().enumerate() {
        if note_time_micros > activation.end_time_micros {
            state.activations[activation_index] = ActivationState::default();
        }
    }
}

fn note_score_for_judgment(
    song: &MedleySongV1,
    note_index: usize,
    judgment: Judgment,
    base_score: JudgmentScoreTraceV1,
    activations: &[Activation<'_>; 6],
    state: &mut JudgmentState,
) -> Result<u32, ScoreError> {
    let note = &song.notes[note_index];
    let inner_score = match judgment {
        Judgment::Perfect => base_score.perfect,
        Judgment::Great => base_score.great,
    };
    let mut combined_multiplier = 1.0_f32;
    for (activation_index, activation) in activations.iter().enumerate() {
        if note.time_micros <= activation.trigger_time_micros
            || note.time_micros > activation.end_time_micros
        {
            continue;
        }
        let multiplier = skill_multiplier(
            activation.skill,
            &mut state.activations[activation_index],
            judgment,
        );
        let additive_delta = multiplier - 1.0_f32;
        combined_multiplier += additive_delta;
    }
    combined_multiplier = combined_multiplier.max(0.0_f32);
    let score_up_rate = 1.0_f32 * combined_multiplier;
    let with_skill = inner_score as f32 * score_up_rate;
    floor_f32_to_u32(
        with_skill,
        &format!("songs[{}].notes[{note_index}].finalScore", song.slot),
    )
}

fn merge_branch(
    next: &mut BTreeMap<JudgmentState, WeightedScore>,
    state: JudgmentState,
    previous: WeightedScore,
    branch_probability: f64,
    note_score: u32,
) {
    if branch_probability == 0.0 {
        return;
    }
    let weighted_probability = previous.probability * branch_probability;
    let carried_score = previous.weighted_score * branch_probability;
    let branch_score = weighted_probability * f64::from(note_score);
    let entry = next.entry(state).or_default();
    entry.probability += weighted_probability;
    entry.weighted_score += carried_score + branch_score;
}

fn score_one_order(
    input: &FixedMedleyEvaluationInputV1,
    song: &MedleySongV1,
    team: &FixedTeamV1,
    order: [usize; 5],
    base_note_scores: &[JudgmentScoreTraceV1],
    perfect_rate: f64,
) -> Result<(f64, usize), ScoreError> {
    let activations = build_activations(input, song, team, order)?;
    let mut states = BTreeMap::from([(
        JudgmentState::default(),
        WeightedScore {
            probability: 1.0,
            weighted_score: 0.0,
        },
    )]);
    let mut peak_state_count = states.len();

    for (note_index, base_score) in base_note_scores.iter().copied().enumerate() {
        let mut next = BTreeMap::new();
        for (mut state, weighted) in states {
            canonicalize_expired_states(
                &mut state,
                &activations,
                song.notes[note_index].time_micros,
            );
            for judgment in [Judgment::Perfect, Judgment::Great] {
                let probability = judgment_probability(judgment, perfect_rate);
                if probability == 0.0 {
                    continue;
                }
                let mut branch_state = state;
                let note_score = note_score_for_judgment(
                    song,
                    note_index,
                    judgment,
                    base_score,
                    &activations,
                    &mut branch_state,
                )?;
                merge_branch(&mut next, branch_state, weighted, probability, note_score);
            }
        }
        peak_state_count = peak_state_count.max(next.len());
        states = next;
    }

    let expected_score = states
        .values()
        .fold(0.0_f64, |sum, state| sum + state.weighted_score);
    if !expected_score.is_finite() || expected_score < 0.0 {
        return Err(ScoreError::new(
            ScoreErrorCode::ArithmeticNonFinite,
            format!("songs[{}].expectedScore", song.slot),
            "expected score must remain finite and non-negative",
        ));
    }
    Ok((expected_score, peak_state_count))
}

fn base_expected_score(base_scores: &[JudgmentScoreTraceV1], perfect_rate: f64) -> f64 {
    base_scores.iter().fold(0.0_f64, |sum, score| {
        let perfect = perfect_rate * f64::from(score.perfect);
        let great = (1.0_f64 - perfect_rate) * f64::from(score.great);
        sum + perfect + great
    })
}

fn score_song(
    input: &FixedMedleyEvaluationInputV1,
    song: &MedleySongV1,
    team: &FixedTeamV1,
    start_combo: u32,
    perfect_rate: f64,
) -> Result<SongScoreTraceV1, ScoreError> {
    let note_count = u32::try_from(song.notes.len()).map_err(|_| {
        ScoreError::new(
            ScoreErrorCode::ArithmeticOverflow,
            format!("songs[{}].notes", song.slot),
            "note count exceeds u32",
        )
    })?;
    let (level_rate, base, base_note_scores) = build_base_note_scores(song, team, start_combo)?;
    let base_expected = base_expected_score(&base_note_scores, perfect_rate);
    let orders = skill_orders();
    let mut permutation_expected_score_bits = Vec::with_capacity(orders.len());
    let mut average_accumulator = 0.0_f64;
    let mut peak_judgment_state_count = 0_usize;
    for order in orders {
        let (score, peak_states) =
            score_one_order(input, song, team, order, &base_note_scores, perfect_rate)?;
        average_accumulator += score;
        peak_judgment_state_count = peak_judgment_state_count.max(peak_states);
        permutation_expected_score_bits.push(F64BitsV1::from_f64(score));
    }
    let average_score = average_accumulator / f64::from(SKILL_ORDER_COUNT);
    let peak_judgment_state_count = u32::try_from(peak_judgment_state_count).map_err(|_| {
        ScoreError::new(
            ScoreErrorCode::ArithmeticOverflow,
            format!("songs[{}].peakJudgmentStateCount", song.slot),
            "reference state count exceeds u32",
        )
    })?;

    Ok(SongScoreTraceV1 {
        slot: song.slot,
        start_combo,
        note_count,
        deck_total_parameter_bits: team.deck_total_parameter_bits.0,
        play_level_rate_bits: level_rate.to_bits(),
        base_score_per_note_bits: base.to_bits(),
        base_note_scores,
        base_expected_score_bits: F64BitsV1::from_f64(base_expected),
        permutation_expected_score_bits,
        average_score_bits: F64BitsV1::from_f64(average_score),
        score_order_count: SKILL_ORDER_COUNT,
        peak_judgment_state_count,
    })
}

/// Evaluate three explicit teams without creating, ranking, or pruning candidates.
pub fn evaluate_fixed_medley(
    input: &FixedMedleyEvaluationInputV1,
) -> Result<MedleyScoreTraceV1, ScoreError> {
    input.validate().map_err(ScoreError::from_validation)?;

    let perfect_rate = exact_probability_to_f64(input.perfect_rate);
    let mut start_combo = 0_u32;
    let mut traces = Vec::with_capacity(3);
    let mut total_average_score = 0.0_f64;
    for slot in 0..3 {
        let trace = score_song(
            input,
            &input.songs[slot],
            &input.teams[slot],
            start_combo,
            perfect_rate,
        )?;
        start_combo = start_combo.checked_add(trace.note_count).ok_or_else(|| {
            ScoreError::new(
                ScoreErrorCode::ArithmeticOverflow,
                format!("songs[{slot}].endCombo"),
                "medley combo exceeds u32",
            )
        })?;
        total_average_score += trace.average_score();
        traces.push(trace);
    }
    let songs: [SongScoreTraceV1; 3] = traces.try_into().map_err(|_| {
        ScoreError::new(
            ScoreErrorCode::ArithmeticOverflow,
            "songs",
            "internal fixed-song trace count changed",
        )
    })?;

    Ok(MedleyScoreTraceV1 {
        scoring_rules_version: SCORING_RULES_VERSION.to_owned(),
        songs,
        total_average_score_bits: F64BitsV1::from_f64(total_average_score),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use bandori_medley_model::{F32Bits, RateUpWithPerfectV1, ScoringNoteV1, ValidationCode};

    const VALID_FIXED_MEDLEY: &str =
        include_str!("../../bandori-medley-model/tests/fixtures/valid-fixed-medley-v1.json");

    fn fixture() -> FixedMedleyEvaluationInputV1 {
        serde_json::from_str(VALID_FIXED_MEDLEY).expect("retained fixture decodes")
    }

    #[test]
    fn fixed_medley_is_repeatably_deterministic() {
        let input = fixture();
        let first = evaluate_fixed_medley(&input).expect("fixture scores");
        let second = evaluate_fixed_medley(&input).expect("fixture scores again");
        let checksums: Vec<u64> = first
            .songs
            .iter()
            .map(|song| {
                song.permutation_expected_score_bits.iter().fold(
                    0xcbf2_9ce4_8422_2325_u64,
                    |mut hash, words| {
                        for byte in words
                            .high
                            .to_be_bytes()
                            .into_iter()
                            .chain(words.low.to_be_bytes())
                        {
                            hash ^= u64::from(byte);
                            hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
                        }
                        hash
                    },
                )
            })
            .collect();
        let average_bits = std::array::from_fn(|slot| first.songs[slot].average_score_bits);
        assert_eq!(
            average_bits,
            [
                F64BitsV1 {
                    high: 1_090_873_700,
                    low: 343_597_390,
                },
                F64BitsV1 {
                    high: 1_090_873_700,
                    low: 343_597_390,
                },
                F64BitsV1 {
                    high: 1_090_876_048,
                    low: 3_607_772_541,
                },
            ]
        );
        assert_eq!(
            first.total_average_score_bits,
            F64BitsV1 {
                high: 1_092_620_630,
                low: 1_073_741_830,
            }
        );
        assert_eq!(
            checksums,
            [
                678_935_814_051_912_837,
                678_935_814_051_912_837,
                7_532_500_273_563_612_261,
            ]
        );
        assert_eq!(first, second);
        assert_eq!(first.songs[0].permutation_expected_score_bits.len(), 120);
        assert_eq!(first.songs[1].start_combo, 7);
        assert_eq!(first.songs[2].start_combo, 14);
    }

    #[test]
    fn scorer_preserves_structured_input_validation_failures() {
        let mut input = fixture();
        input.schema_version = "unsupported".to_owned();
        let error = evaluate_fixed_medley(&input).expect_err("invalid input must not score");
        assert_eq!(error.code, ScoreErrorCode::InputInvalid);
        let validation = error
            .input_validation
            .expect("input failure must retain the validation payload");
        assert_eq!(validation.code, ValidationCode::UnsupportedSchema);
        assert_eq!(validation.path, "schemaVersion");
    }

    #[test]
    fn f64_trace_words_are_json_safe_and_round_trip_exactly() {
        let value = 12_345_678.901_234_5_f64;
        let words = F64BitsV1::from_f64(value);
        assert_eq!(words.to_f64().to_bits(), value.to_bits());

        let trace = evaluate_fixed_medley(&fixture()).expect("fixture scores");
        let json = serde_json::to_value(trace).expect("trace serializes");
        let average = &json["songs"][0]["averageScoreBits"];
        assert!(
            average["high"]
                .as_u64()
                .is_some_and(|word| word <= u64::from(u32::MAX))
        );
        assert!(
            average["low"]
                .as_u64()
                .is_some_and(|word| word <= u64::from(u32::MAX))
        );
        assert!(
            average.as_u64().is_none(),
            "f64 bits must not become one JSON number"
        );
    }

    #[test]
    fn client_f32_and_two_rounding_boundaries_are_frozen() {
        let first_base = base_score_per_note(3_143.0_f32, 26, 5);
        let first_corrected = first_base * PERFECT_RATE;
        let first_inner =
            floor_f32_to_u32(first_corrected * 1.0_f32, "test").expect("rounding fixture fits");
        assert_eq!(first_inner, 2_510);
        let naive_first = (3_143.0_f64 * 1.21_f64 / 5.0_f64 * 3.0_f64 * 1.1_f64).floor();
        assert_eq!(naive_first, 2_509.0);

        let second_base = base_score_per_note(126.0_f32, 26, 5);
        let second_corrected = second_base * PERFECT_RATE;
        let second_inner =
            floor_f32_to_u32(second_corrected, "test").expect("first rounding fixture fits");
        assert_eq!(second_inner, 100);
        let client_second =
            floor_f32_to_u32(second_inner as f32 * percent_multiplier(15.0_f32), "test")
                .expect("second rounding fixture fits");
        assert_eq!(client_second, 115);
        assert_eq!((100.0_f64 * 1.15_f64).floor(), 114.0);
    }

    #[test]
    fn medley_combo_carries_across_the_20_to_21_boundary() {
        assert_eq!(medley_combo_rate(20).to_bits(), 1.0_f32.to_bits());
        assert_eq!(medley_combo_rate(21).to_bits(), 1.01_f32.to_bits());
        assert!(medley_combo_rate(21) > medley_combo_rate(20));
    }

    #[test]
    fn medley_combo_rates_use_exact_master_f32_payloads() {
        assert_eq!(medley_combo_rate(300).to_bits(), 0x3f87_ae14);
        assert_eq!(medley_combo_rate(301).to_bits(), 0x3f88_f5c3);
        assert_eq!(medley_combo_rate(400).to_bits(), 0x3f88_f5c3);
        assert_eq!(medley_combo_rate(401).to_bits(), 0x3f8a_3d71);
        assert_eq!(medley_combo_rate(700).to_bits(), 0x3f8c_cccd);
        assert_eq!(medley_combo_rate(701).to_bits(), 0x3f8e_147b);
        assert_eq!(medley_combo_rate(3_000).to_bits(), 0x3faa_3d71);
        assert_eq!(medley_combo_rate(3_001).to_bits(), 0x3fab_851f);
        assert_eq!(medley_combo_rate(9_999).to_bits(), 0x3fab_851f);
        assert_eq!(medley_combo_rate(10_000).to_bits(), 0x3f80_0000);

        let reconstructed = 1.04_f32 + 3.0_f32 * 0.01_f32;
        assert_eq!(reconstructed.to_bits(), 0x3f88_f5c2);
        assert_ne!(medley_combo_rate(301).to_bits(), reconstructed.to_bits());
    }

    #[test]
    fn same_time_chord_does_not_receive_new_skill() {
        let mut input = fixture();
        let song = &mut input.songs[0];
        for (index, note) in song.notes.iter_mut().enumerate() {
            note.time_micros = u64::try_from(index).expect("fixture index fits") * 10_000_000;
        }
        song.notes.insert(
            6,
            ScoringNoteV1 {
                note_id: 6,
                time_micros: 50_000_000,
                is_skill_trigger: false,
            },
        );
        song.notes[7].note_id = 7;
        let without_chord_skills = evaluate_fixed_medley(&input)
            .expect("same-time chord fixture scores")
            .songs[0]
            .average_score();

        input.songs[0].notes[6].time_micros = 50_000_001;
        let with_chord_skills = evaluate_fixed_medley(&input)
            .expect("later chord fixture scores")
            .songs[0]
            .average_score();
        assert!(with_chord_skills > without_chord_skills);
    }

    #[test]
    fn overlapping_windows_add_percent_deltas_before_one_rounding() {
        let mut input = fixture();
        input.perfect_rate = ExactProbabilityV1 {
            numerator: 1,
            decimal_scale: 0,
        };
        for card in &mut input.cards {
            card.skill.duration_micros = 10_000_000;
            card.skill.behavior = SkillBehaviorV1::Score {
                score_up_percent_bits: F32Bits::from_f32(100.0),
            };
        }
        for note in &mut input.songs[0].notes[..6] {
            note.time_micros = 0;
        }
        input.songs[0].notes[6].time_micros = 1_000_000;
        let trace = evaluate_fixed_medley(&input).expect("overlap fixture scores");
        let song = &trace.songs[0];
        let final_inner = song.base_note_scores[6].perfect;
        let expected_final =
            floor_f32_to_u32(final_inner as f32 * 7.0_f32, "test").expect("test score fits");
        let expected_total: u32 = song.base_note_scores[..6]
            .iter()
            .map(|score| score.perfect)
            .sum::<u32>()
            + expected_final;
        assert_eq!(
            song.permutation_expected_score_bits[0].to_f64(),
            f64::from(expected_total),
        );
    }

    #[test]
    fn sixth_trigger_uses_the_center_leader() {
        let mut input = fixture();
        input.perfect_rate = ExactProbabilityV1 {
            numerator: 1,
            decimal_scale: 0,
        };
        for card in &mut input.cards {
            card.skill.duration_micros = 1_000_000;
            card.skill.behavior = SkillBehaviorV1::Score {
                score_up_percent_bits: F32Bits::from_f32(0.0),
            };
        }
        let leader_instance_id = input.teams[0].leader_instance_id;
        input.cards[leader_instance_id as usize].skill.behavior = SkillBehaviorV1::Score {
            score_up_percent_bits: F32Bits::from_f32(100.0),
        };
        for (index, note) in input.songs[0].notes.iter_mut().enumerate() {
            note.time_micros = if index < 6 {
                u64::try_from(index).expect("fixture index fits") * 10_000_000
            } else {
                50_500_000
            };
        }

        let with_leader = evaluate_fixed_medley(&input).expect("leader fixture scores");
        let final_inner = with_leader.songs[0].base_note_scores[6].perfect;
        input.cards[leader_instance_id as usize].skill.behavior = SkillBehaviorV1::Score {
            score_up_percent_bits: F32Bits::from_f32(0.0),
        };
        let without_leader = evaluate_fixed_medley(&input).expect("zero leader fixture scores");
        assert_eq!(
            with_leader.songs[0].average_score() - without_leader.songs[0].average_score(),
            f64::from(final_inner),
        );
    }

    #[test]
    fn half_and_positive_overlap_use_the_user_additive_policy() {
        let mut input = fixture();
        input.perfect_rate = ExactProbabilityV1 {
            numerator: 0,
            decimal_scale: 0,
        };
        for card in &mut input.cards {
            card.skill.duration_micros = 10_000_000;
            card.skill.behavior = SkillBehaviorV1::Score {
                score_up_percent_bits: F32Bits::from_f32(0.0),
            };
        }
        let first = input.teams[0].member_instance_ids[0] as usize;
        let second = input.teams[0].member_instance_ids[1] as usize;
        input.cards[first].skill.behavior = SkillBehaviorV1::Score {
            score_up_percent_bits: F32Bits::from_f32(100.0),
        };
        input.cards[second].skill.behavior = SkillBehaviorV1::GreatOrWorseHalf {
            score_up_percent_bits: F32Bits::from_f32(125.0),
        };
        for note in &mut input.songs[0].notes[..6] {
            note.time_micros = 0;
        }
        input.songs[0].notes[6].time_micros = 1_000_000;

        let trace = evaluate_fixed_medley(&input).expect("mixed overlap fixture scores");
        let song = &trace.songs[0];
        let trigger_total = song.base_note_scores[..6]
            .iter()
            .map(|score| score.great)
            .sum::<u32>();
        let final_inner = song.base_note_scores[6].great;
        let final_score =
            floor_f32_to_u32(final_inner as f32 * 1.5_f32, "test").expect("test score fits");
        assert_eq!(
            song.permutation_expected_score_bits[0].to_f64(),
            f64::from(trigger_total + final_score),
        );
    }

    #[test]
    fn continued_skill_drops_on_the_current_great() {
        let skill = ResolvedScoreSkillV1 {
            master_skill_id: 1,
            skill_level: 1,
            duration_micros: 1,
            behavior: SkillBehaviorV1::ContinuedPerfect {
                active_score_up_percent_bits: F32Bits::from_f32(115.0),
                fallback_score_up_percent_bits: F32Bits::from_f32(80.0),
            },
            rate_up_with_perfect: None,
        };
        let mut state = ActivationState::default();
        let multiplier = skill_multiplier(&skill, &mut state, Judgment::Great);
        assert_eq!(multiplier.to_bits(), 1.8_f32.to_bits());
        assert!(!state.continued_active);
    }

    #[test]
    fn conditional_score_keeps_the_unboosted_great_score() {
        let skill = ResolvedScoreSkillV1 {
            master_skill_id: 1,
            skill_level: 1,
            duration_micros: 1,
            behavior: SkillBehaviorV1::ScoreOnPerfect {
                score_up_percent_bits: F32Bits::from_f32(100.0),
            },
            rate_up_with_perfect: None,
        };
        let mut perfect_state = ActivationState::default();
        let mut great_state = ActivationState::default();
        assert_eq!(
            skill_multiplier(&skill, &mut perfect_state, Judgment::Perfect).to_bits(),
            2.0_f32.to_bits(),
        );
        assert_eq!(
            skill_multiplier(&skill, &mut great_state, Judgment::Great).to_bits(),
            1.0_f32.to_bits(),
        );
    }

    #[test]
    fn explicit_neutral_skill_does_not_change_either_judgment() {
        let skill = ResolvedScoreSkillV1 {
            master_skill_id: 15,
            skill_level: 5,
            duration_micros: 1,
            behavior: SkillBehaviorV1::Neutral,
            rate_up_with_perfect: None,
        };
        let mut perfect_state = ActivationState::default();
        let mut great_state = ActivationState::default();
        assert_eq!(
            skill_multiplier(&skill, &mut perfect_state, Judgment::Perfect).to_bits(),
            1.0_f32.to_bits(),
        );
        assert_eq!(
            skill_multiplier(&skill, &mut great_state, Judgment::Great).to_bits(),
            1.0_f32.to_bits(),
        );
    }

    #[test]
    fn rate_up_matches_the_real_perfect_great_perfect_sequence_and_cap() {
        let skill = ResolvedScoreSkillV1 {
            master_skill_id: 1,
            skill_level: 1,
            duration_micros: 1,
            behavior: SkillBehaviorV1::Score {
                score_up_percent_bits: F32Bits::from_f32(100.0),
            },
            rate_up_with_perfect: Some(RateUpWithPerfectV1 {
                stack_percent_bits: F32Bits::from_f32(0.5),
                max_score_up_percent_bits: F32Bits::from_f32(150.0),
            }),
        };
        let mut state = ActivationState::default();
        assert_eq!(
            skill_multiplier(&skill, &mut state, Judgment::Perfect).to_bits(),
            2.005_f32.to_bits(),
        );
        assert_eq!(
            skill_multiplier(&skill, &mut state, Judgment::Great).to_bits(),
            2.005_f32.to_bits(),
        );
        assert_eq!(
            skill_multiplier(&skill, &mut state, Judgment::Perfect).to_bits(),
            2.01_f32.to_bits(),
        );
        for _ in 0..98 {
            let _ = skill_multiplier(&skill, &mut state, Judgment::Perfect);
        }
        assert_eq!(
            skill_multiplier(&skill, &mut state, Judgment::Perfect).to_bits(),
            2.5_f32.to_bits(),
        );
    }
}
