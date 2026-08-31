//! Shared skill envelopes and the reference expectation-rounding proof.

use bandori_medley_model::{MedleySongV1, ResolvedScoreSkillV1, SkillBehaviorV1};

use crate::SearchCardV1;

const REFERENCE_ERROR_DENOMINATOR: u128 = 1_u128 << 52;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum UpperBoundFailure {
    Unknown,
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct SkillUpper {
    pub(crate) duration_seconds: f64,
    pub(crate) positive_delta: f64,
    pub(crate) may_continue: bool,
    pub(crate) may_rate_up: bool,
}

pub(crate) fn checked_finite(value: f64) -> Result<f64, UpperBoundFailure> {
    if value.is_finite() && value >= 0.0 {
        Ok(value)
    } else {
        Err(UpperBoundFailure::Unknown)
    }
}

fn max_assign(target: &mut f64, value: f64) {
    if value > *target {
        *target = value;
    }
}

pub(crate) fn skill_delta(skill: ResolvedScoreSkillV1) -> Result<f64, UpperBoundFailure> {
    let maximum_percent = match skill.behavior {
        SkillBehaviorV1::Neutral => 0.0,
        SkillBehaviorV1::Score { score_up_percent }
        | SkillBehaviorV1::ScoreOnPerfect { score_up_percent }
        | SkillBehaviorV1::PerfectOnly { score_up_percent }
        | SkillBehaviorV1::GreatOrWorseHalf { score_up_percent } => score_up_percent,
        SkillBehaviorV1::ContinuedPerfect {
            active_score_up_percent,
            fallback_score_up_percent,
        } => active_score_up_percent.max(fallback_score_up_percent),
    };
    let base_multiplier = 1.0 + maximum_percent / 100.0;
    let mut maximum_delta = base_multiplier - 1.0;

    if let Some(rate_up) = skill.rate_up_with_perfect {
        // This is the same saturation path used by the exact scorer. Taking the
        // cap directly is an upward relaxation of every reachable accumulator.
        let base_bonus_percent = maximum_delta * 100.0;
        let accumulator_cap = rate_up.max_score_up_percent - base_bonus_percent;
        let saturated_multiplier = base_multiplier + accumulator_cap.max(0.0) / 100.0;
        maximum_delta = maximum_delta.max(saturated_multiplier - 1.0);
    }

    checked_finite(maximum_delta)
}

pub(crate) fn skill_upper(card: &SearchCardV1) -> Result<SkillUpper, UpperBoundFailure> {
    let contexts = [
        card.skill_contexts.mixed,
        card.skill_contexts.same_band,
        card.skill_contexts.same_attribute,
        card.skill_contexts.same_band_and_attribute,
    ];
    let mut result = SkillUpper {
        duration_seconds: 0.0,
        positive_delta: 0.0,
        may_continue: false,
        may_rate_up: false,
    };
    for skill in contexts {
        max_assign(&mut result.duration_seconds, skill.duration_seconds);
        max_assign(&mut result.positive_delta, skill_delta(skill)?);
        result.may_continue |= matches!(skill.behavior, SkillBehaviorV1::ContinuedPerfect { .. });
        result.may_rate_up |= skill.rate_up_with_perfect.is_some();
    }
    checked_finite(result.duration_seconds)?;
    Ok(result)
}

pub(crate) fn combo_rate(combo: u32) -> f64 {
    match combo {
        0..=20 => 1.0,
        21..=50 => 1.01,
        51..=100 => 1.02,
        101..=300 => 1.01 + f64::from((combo - 1) / 50) * 0.01,
        301..=3_000 => 1.04 + f64::from((combo - 1) / 100) * 0.01,
        _ => 1.34,
    }
}

pub(crate) fn trigger_times(song: &MedleySongV1) -> Result<[f64; 6], UpperBoundFailure> {
    let times = song
        .notes
        .iter()
        .filter(|note| note.is_skill_trigger)
        .map(|note| note.time_seconds)
        .collect::<Vec<_>>();
    times.try_into().map_err(|_| UpperBoundFailure::Unknown)
}

fn activation_end(trigger_time: f64, skill: SkillUpper) -> Result<f64, UpperBoundFailure> {
    checked_finite((trigger_time + skill.duration_seconds) + 0.00001)
}

fn state_factor(
    skill: SkillUpper,
    processed_active_notes: u128,
) -> Result<u128, UpperBoundFailure> {
    let rate_factor = if skill.may_rate_up {
        processed_active_notes
            .checked_add(1)
            .ok_or(UpperBoundFailure::Unknown)?
    } else {
        1
    };
    let continued_factor = if skill.may_continue { 2 } else { 1 };
    Ok(rate_factor.max(continued_factor))
}

fn permanent(matrix: [[u128; 5]; 5]) -> Result<u128, UpperBoundFailure> {
    let mut totals = [0_u128; 32];
    totals[0] = 1;
    for (member_index, row) in matrix.into_iter().enumerate() {
        let mut next = [0_u128; 32];
        for (mask, subtotal) in totals.into_iter().enumerate() {
            if mask.count_ones() as usize != member_index || subtotal == 0 {
                continue;
            }
            for (trigger_index, factor) in row.into_iter().enumerate() {
                let trigger_bit = 1_usize << trigger_index;
                if mask & trigger_bit != 0 {
                    continue;
                }
                let next_mask = mask | trigger_bit;
                let term = subtotal
                    .checked_mul(factor)
                    .ok_or(UpperBoundFailure::Unknown)?;
                next[next_mask] = next[next_mask]
                    .checked_add(term)
                    .ok_or(UpperBoundFailure::Unknown)?;
            }
        }
        totals = next;
    }
    Ok(totals[31])
}

pub(crate) fn all_order_operation_ceilings(
    song: &MedleySongV1,
    times: [f64; 6],
    skills: [SkillUpper; 5],
) -> Result<[u128; 5], UpperBoundFailure> {
    let mut first_end_times = [[0.0_f64; 5]; 5];
    let mut leader_end_times = [0.0_f64; 5];
    for member_index in 0..5 {
        for trigger_index in 0..5 {
            first_end_times[member_index][trigger_index] =
                activation_end(times[trigger_index], skills[member_index])?;
        }
        leader_end_times[member_index] = activation_end(times[5], skills[member_index])?;
    }
    let mut first_counts = [[0_u128; 5]; 5];
    let mut first_factors = [[1_u128; 5]; 5];
    let mut leader_counts = [0_u128; 5];
    let mut leader_factors = [1_u128; 5];
    let mut operations = [0_u128; 5];

    for note in &song.notes {
        let first_order_state_sum = permanent(first_factors)?;
        for leader_index in 0..5 {
            let states_before = first_order_state_sum
                .checked_mul(leader_factors[leader_index])
                .ok_or(UpperBoundFailure::Unknown)?;
            operations[leader_index] = operations[leader_index]
                .checked_add(
                    states_before
                        .checked_mul(16)
                        .ok_or(UpperBoundFailure::Unknown)?,
                )
                .ok_or(UpperBoundFailure::Unknown)?;
        }

        for member_index in 0..5 {
            for trigger_index in 0..5 {
                first_factors[member_index][trigger_index] = if note.time_seconds
                    > times[trigger_index]
                    && note.time_seconds <= first_end_times[member_index][trigger_index]
                {
                    first_counts[member_index][trigger_index] = first_counts[member_index]
                        [trigger_index]
                        .checked_add(1)
                        .ok_or(UpperBoundFailure::Unknown)?;
                    state_factor(
                        skills[member_index],
                        first_counts[member_index][trigger_index],
                    )?
                } else {
                    1
                };
            }
            leader_factors[member_index] = if note.time_seconds > times[5]
                && note.time_seconds <= leader_end_times[member_index]
            {
                leader_counts[member_index] = leader_counts[member_index]
                    .checked_add(1)
                    .ok_or(UpperBoundFailure::Unknown)?;
                state_factor(skills[member_index], leader_counts[member_index])?
            } else {
                1
            };
        }
        // Expired states are traversed at this note and collapse only in the
        // factors retained for the following note.
    }

    let final_first_order_state_sum = permanent(first_factors)?;
    for leader_index in 0..5 {
        operations[leader_index] = operations[leader_index]
            .checked_add(
                final_first_order_state_sum
                    .checked_mul(leader_factors[leader_index])
                    .ok_or(UpperBoundFailure::Unknown)?,
            )
            .ok_or(UpperBoundFailure::Unknown)?;
    }
    Ok(operations)
}

fn ceil_div(numerator: u128, denominator: u128) -> Result<u128, UpperBoundFailure> {
    numerator
        .checked_add(denominator - 1)
        .map(|value| value / denominator)
        .ok_or(UpperBoundFailure::Unknown)
}

pub(crate) fn reference_ceiling(
    path_ceiling: u128,
    rounding_operations: u128,
) -> Result<(u64, u128, f64), UpperBoundFailure> {
    // `path_ceiling` covers the ideal mean of the 120 path ceilings. The common
    // nonnegative error factor can be pulled outside that mean; it need not be
    // the largest individual order. Starting with the
    // caller's materialized perfect-rate f64, one reference state transition
    // performs at most 13 relevant f64 operations (including the Great-rate
    // subtraction and both branch merges); the operation counter reserves 16.
    // It separately counts the final state folds, the 120 order additions, and
    // the division. For R < Q=2^52, non-negative normal arithmetic is bounded
    // by S*Q/(Q-R). Fewer than Q subnormal roundings contribute less than one
    // absolute score unit in total, covered by the final `+ 1`.
    if rounding_operations >= REFERENCE_ERROR_DENOMINATOR {
        return Err(UpperBoundFailure::Unknown);
    }
    let numerator = path_ceiling
        .checked_mul(REFERENCE_ERROR_DENOMINATOR)
        .ok_or(UpperBoundFailure::Unknown)?;
    let denominator = REFERENCE_ERROR_DENOMINATOR - rounding_operations;
    let integer_ceiling = ceil_div(numerator, denominator)?
        .checked_add(1)
        .ok_or(UpperBoundFailure::Unknown)?;
    let mut value = integer_ceiling as f64;
    if !value.is_finite() {
        return Err(UpperBoundFailure::Unknown);
    }
    if (value as u128) < integer_ceiling {
        value = value.next_up();
    }
    let operation_ceiling =
        u64::try_from(rounding_operations).map_err(|_| UpperBoundFailure::Unknown)?;
    Ok((operation_ceiling, integer_ceiling, value))
}

pub(crate) fn add_song_uppers(values: [f64; 3]) -> Result<f64, UpperBoundFailure> {
    checked_finite((values[0] + values[1]) + values[2])
}

#[cfg(test)]
mod tests {
    use bandori_medley_model::{DifficultyV1, ScoringNoteV1};

    use super::*;

    #[test]
    fn reference_ceiling_covers_stable_order_sum_rounding() {
        let base = 2_f64.powi(60);
        let last = base + 45.0 * 256.0;
        let mut stable_sum = 0.0_f64;
        for _ in 0..119 {
            stable_sum += base;
        }
        stable_sum += last;
        let stable_average = stable_sum / 120.0;

        let exact_sum = 120_u128
            .checked_mul(1_u128 << 60)
            .and_then(|value| value.checked_add(45 * 256))
            .expect("regression sum fits u128");
        let ideal_average_ceiling = ceil_div(exact_sum, 120).expect("division is defined");
        let (_, _, upper) = reference_ceiling(ideal_average_ceiling, 121)
            .expect("the regression operation count has a proof ceiling");

        assert!(stable_average > ideal_average_ceiling as f64);
        assert!(stable_average <= upper);
    }

    #[test]
    fn operation_count_keeps_states_until_the_first_note_after_expiry() {
        let song = MedleySongV1 {
            slot: 0,
            song_id: 1,
            difficulty: DifficultyV1::Expert,
            play_level: 20,
            notes: [0.0, 0.25, 1.0]
                .into_iter()
                .enumerate()
                .map(|(note_id, time_seconds)| ScoringNoteV1 {
                    note_id: note_id as u32,
                    time_seconds,
                    is_skill_trigger: note_id == 0,
                })
                .collect(),
        };
        let stateful = SkillUpper {
            duration_seconds: 0.5,
            positive_delta: 0.0,
            may_continue: false,
            may_rate_up: true,
        };
        let operations =
            all_order_operation_ceilings(&song, [0.0, 10.0, 20.0, 30.0, 40.0, 50.0], [stateful; 5])
                .expect("small state count is provable");

        // 120 states at the trigger, 120 at the active note, 240 old states
        // traversed at the first expired note, then 120 states in the fold.
        assert_eq!(operations, [((120 + 120 + 240) * 16) + 120; 5]);
    }
}
