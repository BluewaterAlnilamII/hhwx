//! Bestdori skill envelopes and the independent-window mean rounding proof.

use bandori_medley_model::{MedleySongV1, ResolvedScoreSkillV1, SkillBehaviorV1};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum UpperBoundFailure {
    Unknown,
}

pub(crate) fn checked_finite(value: f64) -> Result<f64, UpperBoundFailure> {
    if value.is_finite() && value >= 0.0 {
        Ok(value)
    } else {
        Err(UpperBoundFailure::Unknown)
    }
}

/// Bound the actual powf results, not an assumed libm error or ideal real power.
/// The zero-note endpoint is an upward relaxation; actual active counts start at one.
pub(crate) fn continued_power_range(
    perfect_rate: f64,
    maximum_notes: u32,
) -> Result<[f64; 2], UpperBoundFailure> {
    let mut range = [1.0_f64; 2];
    for count in 1..=maximum_notes {
        let power = checked_finite(perfect_rate.powf(f64::from(count)))?;
        range[0] = range[0].min(power);
        range[1] = range[1].max(power);
    }
    Ok(range)
}

fn conditional_multiplier(
    perfect: f64,
    great: f64,
    perfect_rate: f64,
    judgment_multiplier: f64,
) -> f64 {
    if perfect == great {
        return perfect;
    }
    (1.1 * perfect * perfect_rate + 0.8 * great * (1.0 - perfect_rate)) / judgment_multiplier
}

/// Materialize each formal scalar operation before taking a nonnegative upper.
/// Conditional multipliers are constant for this input. Rate-up is monotone in
/// min(n,100); continued is monotone in the materialized power for either sign
/// of active-fallback, so evaluating both power-range endpoints covers every n.
pub(crate) fn skill_delta(
    skill: ResolvedScoreSkillV1,
    perfect_rate: f64,
    judgment_multiplier: f64,
    power_range: [f64; 2],
) -> Result<f64, UpperBoundFailure> {
    let multiplier = |percent: f64| 1.0 + percent / 100.0;
    let maximum_multiplier = match skill.behavior {
        SkillBehaviorV1::Neutral => 1.0,
        SkillBehaviorV1::Score { score_up_percent } => {
            let mut percent = score_up_percent;
            if skill.is_rate_up_with_perfect {
                // Bestdori adds the fixed increase to the raw percent first.
                // Moving it after /100 + 1 can change the last binary64 bit.
                percent += 0.5 * 100.0 * perfect_rate;
            }
            multiplier(percent)
        }
        SkillBehaviorV1::ScoreOnPerfect { score_up_percent } => conditional_multiplier(
            multiplier(score_up_percent),
            1.0,
            perfect_rate,
            judgment_multiplier,
        ),
        SkillBehaviorV1::PerfectOnly { score_up_percent } => conditional_multiplier(
            multiplier(score_up_percent),
            0.0,
            perfect_rate,
            judgment_multiplier,
        ),
        SkillBehaviorV1::GreatOrWorseHalf { score_up_percent } => conditional_multiplier(
            multiplier(score_up_percent),
            0.5,
            perfect_rate,
            judgment_multiplier,
        ),
        SkillBehaviorV1::ContinuedPerfect {
            active_score_up_percent,
            fallback_score_up_percent,
        } => {
            let active = multiplier(active_score_up_percent);
            let fallback = multiplier(fallback_score_up_percent);
            let difference = active - fallback;
            let first = checked_finite(fallback + power_range[0] * difference)?;
            let last = checked_finite(fallback + power_range[1] * difference)?;
            first.max(last)
        }
    };
    checked_finite(maximum_multiplier)?;
    if maximum_multiplier <= 1.0 {
        return Ok(0.0);
    }
    // B is an exact u32 integer. One upward step of m covers rounding in
    // B*m; the second covers subtraction of 1, so floor(B*m)-B <= B*delta.
    checked_finite((maximum_multiplier.next_up() - 1.0).next_up())
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

pub(crate) fn trigger_indexes(song: &MedleySongV1) -> Result<[usize; 6], UpperBoundFailure> {
    let indexes = song
        .notes
        .iter()
        .enumerate()
        .filter(|(_, note)| note.is_skill_trigger)
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    indexes.try_into().map_err(|_| UpperBoundFailure::Unknown)
}

pub(crate) fn reference_ceiling(path_ceiling: u128) -> Result<f64, UpperBoundFailure> {
    // The exact mean numerator is <= 5*path_ceiling. Integer-to-f64 conversion
    // and division by positive five are monotone, including at large values.
    let numerator = path_ceiling
        .checked_mul(5)
        .ok_or(UpperBoundFailure::Unknown)?;
    checked_finite(numerator as f64 / 5.0)
}

pub(crate) fn add_song_uppers(values: [f64; 3]) -> Result<f64, UpperBoundFailure> {
    checked_finite((values[0] + values[1]) + values[2])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reference_ceiling_covers_integer_numerator_rounding() {
        for ceiling in [0_u128, 1_234_567, (1_u128 << 53) + 1, 1_u128 << 65] {
            let upper = reference_ceiling(ceiling).unwrap();
            for offset in 0..=4 {
                let numerator = (5 * ceiling).saturating_sub(offset);
                assert!(numerator as f64 / 5.0 <= upper);
            }
        }
    }

    #[test]
    fn skill_envelopes_keep_bestdori_float_order_and_negative_deltas() {
        let rate_up = ResolvedScoreSkillV1 {
            master_skill_id: 1,
            skill_level: 1,
            duration_seconds: 1.0,
            behavior: SkillBehaviorV1::Score {
                score_up_percent: 0.022,
            },
            is_rate_up_with_perfect: true,
        };
        let delta = skill_delta(rate_up, 1.0, 1.1, [1.0; 2]).unwrap();
        assert!(delta >= 0.500_220_000_000_000_1_f64);

        let perfect_only = ResolvedScoreSkillV1 {
            behavior: SkillBehaviorV1::PerfectOnly {
                score_up_percent: 100.0,
            },
            is_rate_up_with_perfect: false,
            ..rate_up
        };
        assert_eq!(skill_delta(perfect_only, 0.0, 0.8, [0.0, 1.0]), Ok(0.0));

        let perfect_rate = 0.37_f64;
        let powers = continued_power_range(perfect_rate, 100).unwrap();
        for (active, fallback) in [(1.25, 1.75), (2.25, 1.5)] {
            let continued = ResolvedScoreSkillV1 {
                behavior: SkillBehaviorV1::ContinuedPerfect {
                    active_score_up_percent: (active - 1.0) * 100.0,
                    fallback_score_up_percent: (fallback - 1.0) * 100.0,
                },
                ..perfect_only
            };
            let upper = skill_delta(continued, perfect_rate, 0.911, powers).unwrap();
            for count in 1..=100 {
                let actual = fallback + perfect_rate.powf(f64::from(count)) * (active - fallback);
                assert!((actual - 1.0).max(0.0) <= upper);
            }
        }
    }
}
