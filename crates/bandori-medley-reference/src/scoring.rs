use std::collections::BTreeMap;

use bandori_medley_model::{
    ExactProbabilityV1, FixedMedleyEvaluationInputV1, FixedTeamV1, MedleySongV1,
    ResolvedScoreSkillV1, SCORING_RULES_VERSION, SkillBehaviorV1,
};
use serde::Serialize;

use crate::error::{ScoreError, ScoreErrorCode};
use crate::permutations::skill_orders;

const SKILL_ORDER_COUNT: u16 = 120;
const PERFECT_RATE: f64 = 1.1;
const GREAT_RATE: f64 = 0.8;

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
    pub deck_total_parameter_bits: F64BitsV1,
    pub play_level_rate_bits: F64BitsV1,
    pub base_score_per_note_bits: F64BitsV1,
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
    trigger_time_seconds: f64,
    end_time_seconds: f64,
    skill: &'a ResolvedScoreSkillV1,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct ActivationState {
    continued_active: bool,
    rate_up_accumulator_bits: u64,
}

impl Default for ActivationState {
    fn default() -> Self {
        Self {
            continued_active: true,
            rate_up_accumulator_bits: 0.0_f64.to_bits(),
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

fn play_level_rate(play_level: u16) -> f64 {
    1.0 + (f64::from(play_level) - 5.0) / 100.0
}

fn base_score_per_note(deck_total_parameter: f64, play_level: u16, note_count: u32) -> f64 {
    deck_total_parameter * play_level_rate(play_level) / f64::from(note_count) * 3.0
}

/// Bestdori's medley combo formula. Native-client table differences are
/// documented separately and intentionally do not alter calculator semantics.
fn medley_combo_rate(combo: u32) -> f64 {
    match combo {
        0..=20 => 1.0,
        21..=50 => 1.01,
        51..=100 => 1.02,
        101..=300 => 1.01 + f64::from((combo - 1) / 50) * 0.01,
        301..=3_000 => 1.04 + f64::from((combo - 1) / 100) * 0.01,
        _ => 1.34,
    }
}

fn floor_number_to_u32(value: f64, path: &str) -> Result<u32, ScoreError> {
    if !value.is_finite() || value < 0.0 {
        return Err(ScoreError::new(
            ScoreErrorCode::ArithmeticNonFinite,
            path,
            "score intermediate must be finite and non-negative",
        ));
    }
    let floored = value.floor();
    if floored > f64::from(u32::MAX) {
        return Err(ScoreError::new(
            ScoreErrorCode::ArithmeticOverflow,
            path,
            "per-note score exceeds the client uint32 boundary",
        ));
    }
    Ok(floored as u32)
}

fn percent_multiplier(percent: f64) -> f64 {
    1.0 + percent / 100.0
}

fn base_skill_multiplier(
    skill: &ResolvedScoreSkillV1,
    state: &mut ActivationState,
    judgment: Judgment,
) -> f64 {
    match skill.behavior {
        SkillBehaviorV1::Neutral => 1.0,
        SkillBehaviorV1::Score { score_up_percent } => percent_multiplier(score_up_percent),
        SkillBehaviorV1::ScoreOnPerfect { score_up_percent } => match judgment {
            Judgment::Perfect => percent_multiplier(score_up_percent),
            Judgment::Great => 1.0,
        },
        SkillBehaviorV1::PerfectOnly { score_up_percent } => match judgment {
            Judgment::Perfect => percent_multiplier(score_up_percent),
            Judgment::Great => 0.0,
        },
        SkillBehaviorV1::ContinuedPerfect {
            active_score_up_percent,
            fallback_score_up_percent,
        } => {
            if judgment == Judgment::Great {
                state.continued_active = false;
            }
            if state.continued_active {
                percent_multiplier(active_score_up_percent)
            } else {
                percent_multiplier(fallback_score_up_percent)
            }
        }
        SkillBehaviorV1::GreatOrWorseHalf { score_up_percent } => match judgment {
            Judgment::Perfect => percent_multiplier(score_up_percent),
            Judgment::Great => 0.5,
        },
    }
}

fn skill_multiplier(
    skill: &ResolvedScoreSkillV1,
    state: &mut ActivationState,
    judgment: Judgment,
) -> f64 {
    let mut multiplier = base_skill_multiplier(skill, state, judgment);
    let Some(rate_up) = skill.rate_up_with_perfect else {
        return multiplier;
    };

    let base_bonus_percent = (multiplier - 1.0) * 100.0;
    let accumulator_cap = rate_up.max_score_up_percent - base_bonus_percent;
    let mut accumulator = f64::from_bits(state.rate_up_accumulator_bits);
    if judgment == Judgment::Perfect {
        let incremented = accumulator + rate_up.stack_percent;
        accumulator = incremented.min(accumulator_cap);
        state.rate_up_accumulator_bits = accumulator.to_bits();
    }
    let accumulator_rate = accumulator / 100.0;
    multiplier += accumulator_rate;
    multiplier
}

fn build_base_note_scores(
    song: &MedleySongV1,
    team: &FixedTeamV1,
    start_combo: u32,
) -> Result<(f64, f64, Vec<JudgmentScoreTraceV1>), ScoreError> {
    let note_count = u32::try_from(song.notes.len()).map_err(|_| {
        ScoreError::new(
            ScoreErrorCode::ArithmeticOverflow,
            format!("songs[{}].notes", song.slot),
            "note count exceeds u32",
        )
    })?;
    let deck_total_parameter = team.deck_total_parameter;
    let level_rate = play_level_rate(song.play_level);
    let base = base_score_per_note(deck_total_parameter, song.play_level, note_count);
    if !level_rate.is_finite() || !base.is_finite() || base < 0.0 {
        return Err(ScoreError::new(
            ScoreErrorCode::ArithmeticNonFinite,
            format!("songs[{}].baseScorePerNote", song.slot),
            "Bestdori-compatible base score must remain finite and non-negative",
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
            perfect: floor_number_to_u32(
                perfect_with_combo,
                &format!("songs[{}].notes[{note_index}].perfectBaseScore", song.slot),
            )?,
            great: floor_number_to_u32(
                great_with_combo,
                &format!("songs[{}].notes[{note_index}].greatBaseScore", song.slot),
            )?,
        });
    }
    Ok((level_rate, base, scores))
}

fn skill_trigger_times(song: &MedleySongV1) -> Result<[f64; 6], ScoreError> {
    let mut trigger_times = [0.0_f64; 6];
    let mut trigger_count = 0_usize;
    for note in song.notes.iter().filter(|note| note.is_skill_trigger) {
        let Some(trigger_time) = trigger_times.get_mut(trigger_count) else {
            return Err(ScoreError::new(
                ScoreErrorCode::InputInvalid,
                format!("songs[{}].skillTriggers", song.slot),
                "validated song did not contain six skill triggers",
            ));
        };
        *trigger_time = note.time_seconds;
        trigger_count += 1;
    }
    if trigger_count != trigger_times.len() {
        return Err(ScoreError::new(
            ScoreErrorCode::InputInvalid,
            format!("songs[{}].skillTriggers", song.slot),
            "validated song did not contain six skill triggers",
        ));
    }
    Ok(trigger_times)
}

fn build_activations<'a>(
    input: &'a FixedMedleyEvaluationInputV1,
    song_slot: u8,
    trigger_times: &[f64; 6],
    team: &FixedTeamV1,
    order: [usize; 5],
) -> Result<[Activation<'a>; 6], ScoreError> {
    let member_positions = [order[0], order[1], order[2], order[3], order[4], 2];
    let instance_ids = member_positions.map(|position| team.member_instance_ids[position]);
    let mut end_times = [0.0_f64; 6];
    for trigger_index in 0..6 {
        let instance_id = instance_ids[trigger_index];
        let skill = &input.cards[instance_id as usize].skill;
        let end_time_seconds = trigger_times[trigger_index] + skill.duration_seconds + 0.00001;
        if !end_time_seconds.is_finite() {
            return Err(ScoreError::new(
                ScoreErrorCode::ArithmeticNonFinite,
                format!("songs[{song_slot}].skillTriggers[{trigger_index}]"),
                "skill end time must remain finite",
            ));
        }
        end_times[trigger_index] = end_time_seconds;
    }
    Ok(std::array::from_fn(|trigger_index| Activation {
        trigger_time_seconds: trigger_times[trigger_index],
        end_time_seconds: end_times[trigger_index],
        skill: &input.cards[instance_ids[trigger_index] as usize].skill,
    }))
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
    note_time_seconds: f64,
) {
    for (activation_index, activation) in activations.iter().enumerate() {
        if note_time_seconds > activation.end_time_seconds {
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
    let mut combined_multiplier = 1.0_f64;
    for (activation_index, activation) in activations.iter().enumerate() {
        if note.time_seconds <= activation.trigger_time_seconds
            || note.time_seconds > activation.end_time_seconds
        {
            continue;
        }
        let multiplier = skill_multiplier(
            activation.skill,
            &mut state.activations[activation_index],
            judgment,
        );
        let additive_delta = multiplier - 1.0;
        combined_multiplier += additive_delta;
    }
    combined_multiplier = combined_multiplier.max(0.0);
    let with_skill = f64::from(inner_score) * combined_multiplier;
    floor_number_to_u32(
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
    trigger_times: &[f64; 6],
    order: [usize; 5],
    base_note_scores: &[JudgmentScoreTraceV1],
    perfect_rate: f64,
) -> Result<(f64, usize), ScoreError> {
    let activations = build_activations(input, song.slot, trigger_times, team, order)?;
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
                song.notes[note_index].time_seconds,
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
    let trigger_times = skill_trigger_times(song)?;
    let orders = skill_orders();
    let mut permutation_expected_score_bits = Vec::with_capacity(orders.len());
    let mut average_accumulator = 0.0_f64;
    let mut peak_judgment_state_count = 0_usize;
    for order in orders {
        let (score, peak_states) = score_one_order(
            input,
            song,
            team,
            &trigger_times,
            order,
            &base_note_scores,
            perfect_rate,
        )?;
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
        deck_total_parameter_bits: F64BitsV1::from_f64(team.deck_total_parameter),
        play_level_rate_bits: F64BitsV1::from_f64(level_rate),
        base_score_per_note_bits: F64BitsV1::from_f64(base),
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
    use bandori_medley_model::{RateUpWithPerfectV1, ScoringNoteV1, ValidationCode};

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
    fn bestdori_number_chain_keeps_both_integer_rounding_points() {
        let base = base_score_per_note(126.0, 26, 5);
        let inner =
            floor_number_to_u32(base * PERFECT_RATE, "test").expect("first rounding fixture fits");
        assert_eq!(inner, 100);
        let final_score = floor_number_to_u32(f64::from(inner) * percent_multiplier(15.0), "test")
            .expect("second rounding fixture fits");
        assert_eq!(final_score, 114);
    }

    #[test]
    fn play_level_rate_keeps_bestdori_division_rounding() {
        let rate = play_level_rate(46);
        assert_eq!(rate.to_bits(), 1.41_f64.to_bits());

        let base = base_score_per_note(37.395_228_884_590_59, 46, 6);
        let inner = floor_number_to_u32(base * PERFECT_RATE, "test")
            .expect("division-rounding fixture fits");
        assert_eq!(inner, 28);
    }

    #[test]
    fn medley_combo_carries_across_the_20_to_21_boundary() {
        assert_eq!(medley_combo_rate(20), 1.0);
        assert_eq!(medley_combo_rate(21), 1.01);
        assert!(medley_combo_rate(21) > medley_combo_rate(20));
    }

    #[test]
    fn medley_combo_rates_follow_the_bestdori_formula() {
        assert_eq!(medley_combo_rate(300), 1.06);
        assert_eq!(medley_combo_rate(301), 1.07);
        assert_eq!(medley_combo_rate(400), 1.07);
        assert_eq!(medley_combo_rate(401), 1.08);
        assert_eq!(medley_combo_rate(3_000), 1.33);
        assert_eq!(medley_combo_rate(3_001), 1.34);
        assert_eq!(medley_combo_rate(10_000), 1.34);
    }

    #[test]
    fn same_time_chord_does_not_receive_new_skill() {
        let mut input = fixture();
        let song = &mut input.songs[0];
        for (index, note) in song.notes.iter_mut().enumerate() {
            note.time_seconds = index as f64 * 10.0;
        }
        song.notes.insert(
            6,
            ScoringNoteV1 {
                note_id: 6,
                time_seconds: 50.0,
                is_skill_trigger: false,
            },
        );
        song.notes[7].note_id = 7;
        let without_chord_skills = evaluate_fixed_medley(&input)
            .expect("same-time chord fixture scores")
            .songs[0]
            .average_score();

        input.songs[0].notes[6].time_seconds = 50.000_001;
        let with_chord_skills = evaluate_fixed_medley(&input)
            .expect("later chord fixture scores")
            .songs[0]
            .average_score();
        assert!(with_chord_skills > without_chord_skills);
    }

    #[test]
    fn skill_window_includes_the_exact_end_but_not_the_next_f64() {
        let mut input = fixture();
        for card in &mut input.cards {
            card.skill.duration_seconds = 1.0;
        }
        for (index, note) in input.songs[0].notes.iter_mut().enumerate() {
            note.time_seconds = index as f64 * 10.0;
        }
        let trigger_times =
            skill_trigger_times(&input.songs[0]).expect("fixture has six skill triggers");
        let activations = build_activations(
            &input,
            input.songs[0].slot,
            &trigger_times,
            &input.teams[0],
            [0, 1, 2, 3, 4],
        )
        .expect("window-boundary fixture builds activations");
        let end_time_seconds = 0.0_f64 + 1.0 + 0.00001;
        assert_eq!(
            activations[0].end_time_seconds.to_bits(),
            end_time_seconds.to_bits()
        );

        let mut probe_song = input.songs[0].clone();
        probe_song.notes = vec![
            ScoringNoteV1 {
                note_id: 0,
                time_seconds: end_time_seconds,
                is_skill_trigger: false,
            },
            ScoringNoteV1 {
                note_id: 1,
                time_seconds: f64::from_bits(end_time_seconds.to_bits() + 1),
                is_skill_trigger: false,
            },
        ];
        let base_score = JudgmentScoreTraceV1 {
            perfect: 100,
            great: 80,
        };
        let at_end = note_score_for_judgment(
            &probe_song,
            0,
            Judgment::Perfect,
            base_score,
            &activations,
            &mut JudgmentState::default(),
        )
        .expect("exact skill-window end scores");
        let after_end = note_score_for_judgment(
            &probe_song,
            1,
            Judgment::Perfect,
            base_score,
            &activations,
            &mut JudgmentState::default(),
        )
        .expect("next f64 after skill-window end scores");
        assert_eq!(at_end, 200);
        assert_eq!(after_end, 100);
    }

    #[test]
    fn activation_order_maps_distinct_skills_to_the_six_triggers() {
        let mut input = fixture();
        for (index, card) in input.cards[..5].iter_mut().enumerate() {
            card.skill.behavior = SkillBehaviorV1::Score {
                score_up_percent: (index as f64 + 1.0) * 10.0,
            };
        }
        let trigger_times =
            skill_trigger_times(&input.songs[0]).expect("fixture has six skill triggers");
        let activations = build_activations(
            &input,
            input.songs[0].slot,
            &trigger_times,
            &input.teams[0],
            [4, 2, 0, 3, 1],
        )
        .expect("distinct skills map to activations");

        let actual_score_up: Vec<f64> = activations
            .iter()
            .map(|activation| match activation.skill.behavior {
                SkillBehaviorV1::Score { score_up_percent } => score_up_percent,
                _ => panic!("fixture skills remain unconditional score skills"),
            })
            .collect();
        assert_eq!(trigger_times, [0.0, 1.0, 2.0, 3.0, 4.0, 5.0]);
        assert_eq!(actual_score_up, [50.0, 30.0, 10.0, 40.0, 20.0, 30.0]);
    }

    #[test]
    fn overlapping_windows_add_percent_deltas_before_one_rounding() {
        let mut input = fixture();
        input.perfect_rate = ExactProbabilityV1 {
            numerator: 1,
            decimal_scale: 0,
        };
        for card in &mut input.cards {
            card.skill.duration_seconds = 10.0;
            card.skill.behavior = SkillBehaviorV1::Score {
                score_up_percent: 100.0,
            };
        }
        for note in &mut input.songs[0].notes[..6] {
            note.time_seconds = 0.0;
        }
        input.songs[0].notes[6].time_seconds = 1.0;
        let trace = evaluate_fixed_medley(&input).expect("overlap fixture scores");
        let song = &trace.songs[0];
        let final_inner = song.base_note_scores[6].perfect;
        let expected_final =
            floor_number_to_u32(f64::from(final_inner) * 7.0, "test").expect("test score fits");
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
            card.skill.duration_seconds = 1.0;
            card.skill.behavior = SkillBehaviorV1::Score {
                score_up_percent: 0.0,
            };
        }
        let leader_instance_id = input.teams[0].member_instance_ids[2];
        input.cards[leader_instance_id as usize].skill.behavior = SkillBehaviorV1::Score {
            score_up_percent: 100.0,
        };
        for (index, note) in input.songs[0].notes.iter_mut().enumerate() {
            note.time_seconds = if index < 6 { index as f64 * 10.0 } else { 50.5 };
        }

        let with_leader = evaluate_fixed_medley(&input).expect("leader fixture scores");
        let final_inner = with_leader.songs[0].base_note_scores[6].perfect;
        input.cards[leader_instance_id as usize].skill.behavior = SkillBehaviorV1::Score {
            score_up_percent: 0.0,
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
            card.skill.duration_seconds = 10.0;
            card.skill.behavior = SkillBehaviorV1::Score {
                score_up_percent: 0.0,
            };
        }
        let first = input.teams[0].member_instance_ids[0] as usize;
        let second = input.teams[0].member_instance_ids[1] as usize;
        input.cards[first].skill.behavior = SkillBehaviorV1::Score {
            score_up_percent: 100.0,
        };
        input.cards[second].skill.behavior = SkillBehaviorV1::GreatOrWorseHalf {
            score_up_percent: 125.0,
        };
        for note in &mut input.songs[0].notes[..6] {
            note.time_seconds = 0.0;
        }
        input.songs[0].notes[6].time_seconds = 1.0;

        let trace = evaluate_fixed_medley(&input).expect("mixed overlap fixture scores");
        let song = &trace.songs[0];
        let trigger_total = song.base_note_scores[..6]
            .iter()
            .map(|score| score.great)
            .sum::<u32>();
        let final_inner = song.base_note_scores[6].great;
        let final_score =
            floor_number_to_u32(f64::from(final_inner) * 1.5, "test").expect("test score fits");
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
            duration_seconds: 1.0,
            behavior: SkillBehaviorV1::ContinuedPerfect {
                active_score_up_percent: 115.0,
                fallback_score_up_percent: 80.0,
            },
            rate_up_with_perfect: None,
        };
        let mut state = ActivationState::default();
        let multiplier = skill_multiplier(&skill, &mut state, Judgment::Great);
        assert_eq!(multiplier, 1.8);
        assert!(!state.continued_active);
    }

    #[test]
    fn conditional_score_keeps_the_unboosted_great_score() {
        let skill = ResolvedScoreSkillV1 {
            master_skill_id: 1,
            skill_level: 1,
            duration_seconds: 1.0,
            behavior: SkillBehaviorV1::ScoreOnPerfect {
                score_up_percent: 100.0,
            },
            rate_up_with_perfect: None,
        };
        let mut perfect_state = ActivationState::default();
        let mut great_state = ActivationState::default();
        assert_eq!(
            skill_multiplier(&skill, &mut perfect_state, Judgment::Perfect).to_bits(),
            2.0_f64.to_bits(),
        );
        assert_eq!(
            skill_multiplier(&skill, &mut great_state, Judgment::Great).to_bits(),
            1.0_f64.to_bits(),
        );
    }

    #[test]
    fn explicit_neutral_skill_does_not_change_either_judgment() {
        let skill = ResolvedScoreSkillV1 {
            master_skill_id: 15,
            skill_level: 5,
            duration_seconds: 1.0,
            behavior: SkillBehaviorV1::Neutral,
            rate_up_with_perfect: None,
        };
        let mut perfect_state = ActivationState::default();
        let mut great_state = ActivationState::default();
        assert_eq!(
            skill_multiplier(&skill, &mut perfect_state, Judgment::Perfect).to_bits(),
            1.0_f64.to_bits(),
        );
        assert_eq!(
            skill_multiplier(&skill, &mut great_state, Judgment::Great).to_bits(),
            1.0_f64.to_bits(),
        );
    }

    #[test]
    fn rate_up_matches_the_real_perfect_great_perfect_sequence_and_cap() {
        let skill = ResolvedScoreSkillV1 {
            master_skill_id: 1,
            skill_level: 1,
            duration_seconds: 1.0,
            behavior: SkillBehaviorV1::Score {
                score_up_percent: 100.0,
            },
            rate_up_with_perfect: Some(RateUpWithPerfectV1 {
                stack_percent: 0.5,
                max_score_up_percent: 150.0,
            }),
        };
        let mut state = ActivationState::default();
        assert_eq!(
            skill_multiplier(&skill, &mut state, Judgment::Perfect).to_bits(),
            2.005_f64.to_bits(),
        );
        assert_eq!(
            skill_multiplier(&skill, &mut state, Judgment::Great).to_bits(),
            2.005_f64.to_bits(),
        );
        assert_eq!(
            skill_multiplier(&skill, &mut state, Judgment::Perfect).to_bits(),
            2.01_f64.to_bits(),
        );
        for _ in 0..98 {
            let _ = skill_multiplier(&skill, &mut state, Judgment::Perfect);
        }
        assert_eq!(
            skill_multiplier(&skill, &mut state, Judgment::Perfect).to_bits(),
            2.5_f64.to_bits(),
        );
    }

    #[test]
    fn one_order_propagates_continued_and_rate_up_pg_states() {
        let mut input = fixture();
        input.perfect_rate = ExactProbabilityV1 {
            numerator: 5,
            decimal_scale: 1,
        };
        for card in &mut input.cards {
            card.skill.duration_seconds = 10.0;
            card.skill.behavior = SkillBehaviorV1::Neutral;
            card.skill.rate_up_with_perfect = None;
        }
        let continued = input.teams[0].member_instance_ids[0] as usize;
        input.cards[continued].skill.behavior = SkillBehaviorV1::ContinuedPerfect {
            active_score_up_percent: 100.0,
            fallback_score_up_percent: 0.0,
        };
        let rate_up = input.teams[0].member_instance_ids[1] as usize;
        input.cards[rate_up].skill.behavior = SkillBehaviorV1::Score {
            score_up_percent: 0.0,
        };
        input.cards[rate_up].skill.rate_up_with_perfect = Some(RateUpWithPerfectV1 {
            stack_percent: 100.0,
            max_score_up_percent: 100.0,
        });
        input.songs[0].notes = (0_u32..6)
            .map(|note_id| ScoringNoteV1 {
                note_id,
                time_seconds: 0.0,
                is_skill_trigger: true,
            })
            .chain([
                ScoringNoteV1 {
                    note_id: 6,
                    time_seconds: 1.0,
                    is_skill_trigger: false,
                },
                ScoringNoteV1 {
                    note_id: 7,
                    time_seconds: 2.0,
                    is_skill_trigger: false,
                },
            ])
            .collect();
        input
            .validate()
            .expect("state-distribution fixture validates");

        let base_note_scores = [JudgmentScoreTraceV1 {
            perfect: 0,
            great: 0,
        }; 6]
            .into_iter()
            .chain([
                JudgmentScoreTraceV1 {
                    perfect: 100,
                    great: 100,
                },
                JudgmentScoreTraceV1 {
                    perfect: 100,
                    great: 100,
                },
            ])
            .collect::<Vec<_>>();
        let trigger_times =
            skill_trigger_times(&input.songs[0]).expect("fixture has six skill triggers");
        let (expected_score, peak_state_count) = score_one_order(
            &input,
            &input.songs[0],
            &input.teams[0],
            &trigger_times,
            [0, 1, 2, 3, 4],
            &base_note_scores,
            0.5,
        )
        .expect("stateful P/G fixture scores");
        // The probes contribute 0.5*(300+100) and
        // 0.25*(300+200+200+100); three distinct states remain after probe two.
        assert_eq!(expected_score.to_bits(), 400.0_f64.to_bits());
        assert_eq!(peak_state_count, 3);
    }
}
