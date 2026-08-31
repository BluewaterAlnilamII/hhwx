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

/// Auditable score trace for one song and one already selected team.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SongScoreTraceV1 {
    pub slot: u8,
    pub start_combo: u32,
    pub note_count: u32,
    pub deck_total_parameter_bits: F64BitsV1,
    pub score_coefficient_bits: F64BitsV1,
    pub base_score_per_note_bits: F64BitsV1,
    pub base_note_scores: Vec<u32>,
    pub base_expected_score_bits: F64BitsV1,
    pub permutation_expected_score_bits: Vec<F64BitsV1>,
    pub average_score_bits: F64BitsV1,
    pub score_order_count: u16,
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
    start_note_index: usize,
    end_time_seconds: f64,
    skill: &'a ResolvedScoreSkillV1,
}

fn exact_probability_to_f64(probability: ExactProbabilityV1) -> f64 {
    let denominator = 10_u64.pow(u32::from(probability.decimal_scale));
    probability.numerator as f64 / denominator as f64
}

fn score_coefficient(play_level: u16, note_count: u32) -> f64 {
    (3.0 + 0.03 * (f64::from(play_level) - 5.0)) / f64::from(note_count)
}

fn base_score_per_note(deck_total_parameter: f64, play_level: u16, note_count: u32) -> f64 {
    deck_total_parameter * score_coefficient(play_level, note_count)
}

/// The locked HHWX medley combo formula. Native-client table differences are
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

// Format per-note paths only on failure.
fn floor_number_to_u32(value: f64, path: impl FnOnce() -> String) -> Result<u32, ScoreError> {
    if !value.is_finite() || value < 0.0 {
        return Err(ScoreError::new(
            ScoreErrorCode::ArithmeticNonFinite,
            path(),
            "score intermediate must be finite and non-negative",
        ));
    }
    let floored = value.floor();
    if floored > f64::from(u32::MAX) {
        return Err(ScoreError::new(
            ScoreErrorCode::ArithmeticOverflow,
            path(),
            "per-note score exceeds the client uint32 boundary",
        ));
    }
    Ok(floored as u32)
}

fn percent_multiplier(percent: f64) -> f64 {
    1.0 + percent / 100.0
}

fn judgment_multiplier(perfect_rate: f64) -> f64 {
    PERFECT_RATE * perfect_rate + GREAT_RATE * (1.0 - perfect_rate)
}

fn weighted_skill_multiplier(perfect: f64, great: f64, perfect_rate: f64) -> f64 {
    if perfect == great {
        perfect
    } else {
        (PERFECT_RATE * perfect * perfect_rate + GREAT_RATE * great * (1.0 - perfect_rate))
            / judgment_multiplier(perfect_rate)
    }
}

/// Bestdori's deterministic PERFECT-rate formulas, not a distribution of note
/// judgments. The covered-note count includes the current note and starts at one.
fn skill_multiplier(
    skill: &ResolvedScoreSkillV1,
    covered_note_count: u32,
    perfect_rate: f64,
) -> f64 {
    match skill.behavior {
        SkillBehaviorV1::Neutral => 1.0,
        SkillBehaviorV1::Score {
            mut score_up_percent,
        } => {
            if skill.is_rate_up_with_perfect {
                score_up_percent += 0.5 * f64::from(covered_note_count.min(100)) * perfect_rate;
            }
            percent_multiplier(score_up_percent)
        }
        SkillBehaviorV1::ScoreOnPerfect { score_up_percent } => {
            weighted_skill_multiplier(percent_multiplier(score_up_percent), 1.0, perfect_rate)
        }
        SkillBehaviorV1::PerfectOnly { score_up_percent } => {
            weighted_skill_multiplier(percent_multiplier(score_up_percent), 0.0, perfect_rate)
        }
        SkillBehaviorV1::ContinuedPerfect {
            active_score_up_percent,
            fallback_score_up_percent,
        } => {
            let active = percent_multiplier(active_score_up_percent);
            let fallback = percent_multiplier(fallback_score_up_percent);
            fallback + perfect_rate.powf(f64::from(covered_note_count)) * (active - fallback)
        }
        SkillBehaviorV1::GreatOrWorseHalf { score_up_percent } => {
            weighted_skill_multiplier(percent_multiplier(score_up_percent), 0.5, perfect_rate)
        }
    }
}

fn build_base_note_scores(
    song: &MedleySongV1,
    team: &FixedTeamV1,
    start_combo: u32,
    perfect_rate: f64,
) -> Result<(f64, f64, Vec<u32>), ScoreError> {
    let note_count = u32::try_from(song.notes.len()).map_err(|_| {
        ScoreError::new(
            ScoreErrorCode::ArithmeticOverflow,
            format!("songs[{}].notes", song.slot),
            "note count exceeds u32",
        )
    })?;
    let deck_total_parameter = team.deck_total_parameter;
    let coefficient = score_coefficient(song.play_level, note_count);
    let base = base_score_per_note(deck_total_parameter, song.play_level, note_count);
    if !coefficient.is_finite() || !base.is_finite() || base < 0.0 {
        return Err(ScoreError::new(
            ScoreErrorCode::ArithmeticNonFinite,
            format!("songs[{}].baseScorePerNote", song.slot),
            "Bestdori-compatible base score must remain finite and non-negative",
        ));
    }

    let judge = judgment_multiplier(perfect_rate);
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
        let with_judgment = (base * combo_rate) * judge;
        scores.push(floor_number_to_u32(with_judgment, || {
            format!("songs[{}].notes[{note_index}].baseScore", song.slot)
        })?);
    }
    Ok((coefficient, base, scores))
}

fn skill_trigger_indexes(song: &MedleySongV1) -> Result<[usize; 6], ScoreError> {
    let mut trigger_indexes = [0; 6];
    let mut trigger_count = 0_usize;
    for (index, _) in song
        .notes
        .iter()
        .enumerate()
        .filter(|(_, note)| note.is_skill_trigger)
    {
        let Some(trigger_index) = trigger_indexes.get_mut(trigger_count) else {
            return Err(ScoreError::new(
                ScoreErrorCode::InputInvalid,
                format!("songs[{}].skillTriggers", song.slot),
                "validated song did not contain six skill triggers",
            ));
        };
        *trigger_index = index;
        trigger_count += 1;
    }
    if trigger_count != trigger_indexes.len() {
        return Err(ScoreError::new(
            ScoreErrorCode::InputInvalid,
            format!("songs[{}].skillTriggers", song.slot),
            "validated song did not contain six skill triggers",
        ));
    }
    Ok(trigger_indexes)
}

fn build_activations<'a>(
    input: &'a FixedMedleyEvaluationInputV1,
    song: &MedleySongV1,
    trigger_indexes: &[usize; 6],
    team: &FixedTeamV1,
    order: [usize; 5],
) -> Result<[Activation<'a>; 6], ScoreError> {
    let member_positions = [order[0], order[1], order[2], order[3], order[4], 2];
    let instance_ids = member_positions.map(|position| team.member_instance_ids[position]);
    let mut end_times = [0.0_f64; 6];
    for trigger_index in 0..6 {
        let instance_id = instance_ids[trigger_index];
        let skill = &input.cards[instance_id as usize].skill;
        let end_time_seconds =
            song.notes[trigger_indexes[trigger_index]].time_seconds + skill.duration_seconds;
        if !end_time_seconds.is_finite() {
            return Err(ScoreError::new(
                ScoreErrorCode::ArithmeticNonFinite,
                format!("songs[{}].skillTriggers[{trigger_index}]", song.slot),
                "skill end time must remain finite",
            ));
        }
        end_times[trigger_index] = end_time_seconds;
    }
    Ok(std::array::from_fn(|trigger_index| Activation {
        start_note_index: trigger_indexes[trigger_index] + 1,
        end_time_seconds: end_times[trigger_index],
        skill: &input.cards[instance_ids[trigger_index] as usize].skill,
    }))
}

fn note_score(
    song: &MedleySongV1,
    note_index: usize,
    base_score: u32,
    activations: &[Activation<'_>; 6],
    covered_note_counts: &mut [u32; 6],
    perfect_rate: f64,
) -> Result<i64, ScoreError> {
    let note = &song.notes[note_index];
    let mut score = i64::from(base_score);
    for (activation_index, activation) in activations.iter().enumerate() {
        if note_index < activation.start_note_index
            || note.time_seconds > activation.end_time_seconds
        {
            continue;
        }
        covered_note_counts[activation_index] += 1;
        let multiplier = skill_multiplier(
            activation.skill,
            covered_note_counts[activation_index],
            perfect_rate,
        );
        // ponytail: overlaps add independently rounded extras. Joint flooring
        // is deliberately not the search objective; changing it needs review.
        let with_skill = floor_number_to_u32(f64::from(base_score) * multiplier, || {
            format!("songs[{}].notes[{note_index}].skillScore", song.slot)
        })?;
        score += i64::from(with_skill) - i64::from(base_score);
    }
    Ok(score)
}

fn score_one_order(
    input: &FixedMedleyEvaluationInputV1,
    song: &MedleySongV1,
    team: &FixedTeamV1,
    trigger_indexes: &[usize; 6],
    order: [usize; 5],
    base_note_scores: &[u32],
    perfect_rate: f64,
) -> Result<i128, ScoreError> {
    let activations = build_activations(input, song, trigger_indexes, team, order)?;
    let mut covered_note_counts = [0_u32; 6];
    let mut score = 0_i128;

    for (note_index, base_score) in base_note_scores.iter().copied().enumerate() {
        score += i128::from(note_score(
            song,
            note_index,
            base_score,
            &activations,
            &mut covered_note_counts,
            perfect_rate,
        )?);
    }

    Ok(score)
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
    let (coefficient, base, base_note_scores) =
        build_base_note_scores(song, team, start_combo, perfect_rate)?;
    let base_expected: i128 = base_note_scores
        .iter()
        .map(|score| i128::from(*score))
        .sum();
    let trigger_indexes = skill_trigger_indexes(song)?;
    let orders = skill_orders();
    let mut permutation_expected_score_bits = Vec::with_capacity(orders.len());
    let mut average_accumulator = 0_i128;
    for order in orders {
        let score = score_one_order(
            input,
            song,
            team,
            &trigger_indexes,
            order,
            &base_note_scores,
            perfect_rate,
        )?;
        average_accumulator += score;
        permutation_expected_score_bits.push(F64BitsV1::from_f64(score as f64));
    }
    // Independent windows make the 120-order integer sum divisible by 24.
    // Reduce before the only integer-to-f64 conversion, as production does.
    // Settle each song before its score enters the medley sum.
    let average_score = ((average_accumulator / 24) as f64 / 5.0).floor();

    Ok(SongScoreTraceV1 {
        slot: song.slot,
        start_combo,
        note_count,
        deck_total_parameter_bits: F64BitsV1::from_f64(team.deck_total_parameter),
        score_coefficient_bits: F64BitsV1::from_f64(coefficient),
        base_score_per_note_bits: F64BitsV1::from_f64(base),
        base_note_scores,
        base_expected_score_bits: F64BitsV1::from_f64(base_expected as f64),
        permutation_expected_score_bits,
        average_score_bits: F64BitsV1::from_f64(average_score),
        score_order_count: SKILL_ORDER_COUNT,
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
    use bandori_medley_model::{ScoringNoteV1, ValidationCode};

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
        assert_eq!(first, second);

        // The wiring fixture has identical ordinary skills: base notes are 9745,
        // except the last note of song three (combo 21), which is 9842.
        for (song, expected) in first.songs.iter().zip([175_410.0, 175_410.0, 175_701.0]) {
            let expected_bits = F64BitsV1::from_f64(expected);
            assert_eq!(song.average_score_bits, expected_bits);
            assert_eq!(song.permutation_expected_score_bits.len(), 120);
            assert!(
                song.permutation_expected_score_bits
                    .iter()
                    .all(|bits| *bits == expected_bits)
            );
        }
        assert_eq!(
            first.total_average_score_bits,
            F64BitsV1::from_f64(526_521.0),
        );
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
    fn score_chain_keeps_both_integer_rounding_points() {
        let base = base_score_per_note(126.0, 26, 5);
        let inner = floor_number_to_u32(base * PERFECT_RATE, || "test".to_owned())
            .expect("first rounding fixture fits");
        assert_eq!(inner, 100);
        let final_score = floor_number_to_u32(f64::from(inner) * percent_multiplier(15.0), || {
            "test".to_owned()
        })
        .expect("second rounding fixture fits");
        assert_eq!(final_score, 114);
    }

    #[test]
    fn base_score_keeps_bestdori_operation_order() {
        let coefficient = score_coefficient(46, 6);
        assert_eq!(coefficient.to_bits(), 0.705_000_000_000_000_1_f64.to_bits());

        let base = base_score_per_note(37.395_228_884_590_59, 46, 6);
        let inner = floor_number_to_u32(base * PERFECT_RATE, || "test".to_owned())
            .expect("division-rounding fixture fits");
        assert_eq!(inner, 29);
    }

    #[test]
    fn medley_combo_carries_across_the_20_to_21_boundary() {
        assert_eq!(medley_combo_rate(20), 1.0);
        assert_eq!(medley_combo_rate(21), 1.01);
        assert!(medley_combo_rate(21) > medley_combo_rate(20));
    }

    #[test]
    fn medley_combo_rates_follow_the_locked_formula() {
        assert_eq!(medley_combo_rate(300), 1.06);
        assert_eq!(medley_combo_rate(301), 1.07);
        assert_eq!(medley_combo_rate(400), 1.07);
        assert_eq!(medley_combo_rate(401), 1.08);
        assert_eq!(medley_combo_rate(3_000), 1.33);
        assert_eq!(medley_combo_rate(3_001), 1.34);
        assert_eq!(medley_combo_rate(10_000), 1.34);
    }

    #[test]
    fn same_time_note_after_trigger_receives_new_skill() {
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
        let same_time_score = evaluate_fixed_medley(&input)
            .expect("same-time chord fixture scores")
            .songs[0]
            .average_score();

        input.songs[0].notes[6].time_seconds = 50.000_001;
        let later_score = evaluate_fixed_medley(&input)
            .expect("later chord fixture scores")
            .songs[0]
            .average_score();
        assert_eq!(same_time_score, later_score);
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
        let trigger_indexes =
            skill_trigger_indexes(&input.songs[0]).expect("fixture has six skill triggers");
        let activations = build_activations(
            &input,
            &input.songs[0],
            &trigger_indexes,
            &input.teams[0],
            [0, 1, 2, 3, 4],
        )
        .expect("window-boundary fixture builds activations");
        let end_time_seconds = 51.0_f64;
        assert_eq!(
            activations[5].end_time_seconds.to_bits(),
            end_time_seconds.to_bits()
        );

        let mut probe_song = input.songs[0].clone();
        probe_song.notes[6].time_seconds = end_time_seconds;
        let at_end = note_score(&probe_song, 6, 100, &activations, &mut [0; 6], 1.0)
            .expect("exact skill-window end scores");
        probe_song.notes[6].time_seconds = end_time_seconds.next_up();
        let after_end = note_score(&probe_song, 6, 100, &activations, &mut [0; 6], 1.0)
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
        let trigger_indexes =
            skill_trigger_indexes(&input.songs[0]).expect("fixture has six skill triggers");
        let activations = build_activations(
            &input,
            &input.songs[0],
            &trigger_indexes,
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
        assert_eq!(trigger_indexes, [0, 1, 2, 3, 4, 5]);
        assert_eq!(actual_score_up, [50.0, 30.0, 10.0, 40.0, 20.0, 30.0]);
    }

    #[test]
    fn overlapping_windows_add_independently_rounded_extras() {
        let mut input = fixture();
        input.perfect_rate = ExactProbabilityV1 {
            numerator: 1,
            decimal_scale: 0,
        };
        for card in &mut input.cards {
            card.skill.duration_seconds = 10.0;
            card.skill.behavior = SkillBehaviorV1::Score {
                score_up_percent: 33.3,
            };
        }
        for note in &mut input.songs[0].notes[..6] {
            note.time_seconds = 0.0;
        }
        input.songs[0].notes[6].time_seconds = 1.0;
        let trace = evaluate_fixed_medley(&input).expect("overlap fixture scores");
        let song = &trace.songs[0];
        let expected_total: i64 = song
            .base_note_scores
            .iter()
            .enumerate()
            .map(|(index, base)| {
                let extra =
                    (f64::from(*base) * (1.0 + 33.3 / 100.0)).floor() as i64 - i64::from(*base);
                i64::from(*base) + index.min(6) as i64 * extra
            })
            .sum();
        assert_eq!(
            song.permutation_expected_score_bits[0].to_f64(),
            expected_total as f64,
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
        let final_inner = with_leader.songs[0].base_note_scores[6];
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
        let expected_total: i64 = song
            .base_note_scores
            .iter()
            .enumerate()
            .map(|(index, base)| {
                i64::from(*base)
                    + if index > 0 { i64::from(*base) } else { 0 }
                    + if index > 1 {
                        (f64::from(*base) * 0.5).floor() as i64 - i64::from(*base)
                    } else {
                        0
                    }
            })
            .sum();
        assert_eq!(
            song.permutation_expected_score_bits[0].to_f64(),
            expected_total as f64,
        );
    }

    #[test]
    fn probability_formulas_match_recorded_official_bestdori_outputs() {
        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct GoldenCase {
            name: String,
            perfect_rate: f64,
            active_note_count: u32,
            base_before_judgment: f64,
            skill: ResolvedScoreSkillV1,
            judge_multiplier: String,
            skill_multiplier: String,
            inner_score: u32,
            note_score: u32,
        }
        #[derive(serde::Deserialize)]
        struct Golden {
            cases: Vec<GoldenCase>,
        }

        // Recorded by executing the unchanged official st and ct score callback,
        // not by generating expectations from this Rust implementation.
        let golden: Golden = serde_json::from_str(include_str!(
            "../tests/fixtures/bestdori-probability-v1.json"
        ))
        .expect("official probability golden decodes");
        for case in golden.cases {
            let expected_judge = case
                .judge_multiplier
                .parse::<f64>()
                .expect("exact decimal judge");
            let expected_multiplier = case
                .skill_multiplier
                .parse::<f64>()
                .expect("exact decimal skill multiplier");
            let judge = judgment_multiplier(case.perfect_rate);
            assert_eq!(judge.to_bits(), expected_judge.to_bits(), "{}", case.name);
            let multiplier =
                skill_multiplier(&case.skill, case.active_note_count, case.perfect_rate);
            assert_eq!(
                multiplier.to_bits(),
                expected_multiplier.to_bits(),
                "{}",
                case.name,
            );
            let inner = floor_number_to_u32(case.base_before_judgment * judge, || {
                "golden.inner".to_owned()
            })
            .expect("official base score fits u32");
            assert_eq!(inner, case.inner_score, "{}", case.name);
            let score =
                floor_number_to_u32(f64::from(inner) * multiplier, || "golden.final".to_owned())
                    .expect("official final score fits u32");
            assert_eq!(score, case.note_score, "{}", case.name);
        }
    }

    #[test]
    fn one_order_counts_each_overlapping_skill_window_independently() {
        let mut input = fixture();
        input.perfect_rate = ExactProbabilityV1 {
            numerator: 5,
            decimal_scale: 1,
        };
        for card in &mut input.cards {
            card.skill.duration_seconds = 10.0;
            card.skill.behavior = SkillBehaviorV1::Neutral;
            card.skill.is_rate_up_with_perfect = false;
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
        input.cards[rate_up].skill.is_rate_up_with_perfect = true;
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
            .expect("overlapping-window fixture validates");

        let trigger_indexes =
            skill_trigger_indexes(&input.songs[0]).expect("fixture has six skill triggers");
        let score = score_one_order(
            &input,
            &input.songs[0],
            &input.teams[0],
            &trigger_indexes,
            [0, 1, 2, 3, 4],
            &[0, 0, 0, 0, 0, 0, 100, 100],
            0.5,
        )
        .expect("overlapping-window fixture scores");
        // Later same-time trigger notes count as covered notes too: the two
        // scored notes use counts (6,5) and (7,6), giving 102 and 101.
        assert_eq!(score, 203);
    }
}
