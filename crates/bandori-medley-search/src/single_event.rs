//! Existing single-song Pt policy, evaluated using the new order expectation.
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum SingleEventRuleV1 {
    None,
    Normal {
        base: f64,
        divisor: f64,
        formula: u8,
    },
    Challenge {
        modern: bool,
    },
}

fn soft_cap(value: f64, divisor: f64, caps: &[f64]) -> f64 {
    let mut remaining = value.max(0.0);
    let mut scaled = 0.0;
    for (index, cap) in caps.iter().enumerate() {
        if remaining <= *cap {
            scaled += (remaining / divisor / (index + 1) as f64 * 100.0).floor();
            break;
        }
        remaining -= cap;
        scaled += (cap / divisor / (index + 1) as f64 * 100.0).floor();
    }
    (scaled / 100.0).floor()
}

impl SingleEventRuleV1 {
    pub(crate) fn valid(self) -> bool {
        match self {
            Self::Normal {
                base,
                divisor,
                formula,
            } => {
                base.is_finite()
                    && base >= 0.0
                    && divisor.is_finite()
                    && divisor > 0.0
                    && formula <= 2
            }
            _ => true,
        }
    }

    fn base_points(self, score: f64, other_score: f64) -> Option<f64> {
        match self {
            Self::None => None,
            Self::Challenge { modern: true } => Some(3250.0 + (score / 450.0).floor()),
            Self::Challenge { modern: false } => Some(
                1000.0
                    + soft_cap(
                        score,
                        300.0,
                        &[2_100_000.0, 150_000.0, 250_000.0, f64::INFINITY],
                    ),
            ),
            Self::Normal {
                base,
                divisor,
                formula,
            } => Some(
                base + if formula == 1 {
                    soft_cap(
                        score,
                        divisor,
                        &[1_600_000.0, 150_000.0, 250_000.0, 400_000.0, f64::INFINITY],
                    ) + soft_cap(
                        other_score,
                        divisor * 10.0,
                        &[
                            6_400_000.0,
                            600_000.0,
                            1_000_000.0,
                            1_600_000.0,
                            f64::INFINITY,
                        ],
                    )
                } else {
                    (score / divisor).floor() + (other_score / divisor / 10.0).floor()
                },
            ),
        }
    }

    pub(crate) fn points(
        self,
        score: f64,
        room: Option<f64>,
        bonus: f64,
        support: f64,
    ) -> Option<f64> {
        let total = room.unwrap_or(score);
        let (own, other) = if matches!(self, Self::Normal { formula: 0, .. }) {
            let own = score.min(1_500_000.0);
            (own, (total.min(7_500_000.0) - own).max(0.0))
        } else {
            (score, (total - score).max(0.0))
        };
        self.base_points(own, other)
            .map(|base| (base * (1.0 + bonus)).floor() + (support / 3000.0).floor())
    }

    /// Relax the other-player term independently; never subtract an upper own
    /// score from an upper room score and mistake that difference for an upper.
    pub(crate) fn upper(self, score: f64, other: f64, bonus: f64, support: f64) -> Option<f64> {
        let (own, other) = if matches!(self, Self::Normal { formula: 0, .. }) {
            (score.min(1_500_000.0), (score + other).min(7_500_000.0))
        } else {
            (score, other)
        };
        self.base_points(own, other).map(|base| {
            (base * (1.0 + bonus).next_up()).next_up().floor()
                + (support / 3000.0).next_up().floor()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Cumulative endpoints give a separate reference for the production
    // remaining-cap loop, including its two distinct floor operations.
    fn tier_reference(value: f64, divisor: f64, ends: &[f64]) -> f64 {
        let mut start = 0.0;
        let mut hundredths = 0.0;
        for (index, &end) in ends.iter().enumerate() {
            let part = (value.min(end) - start).max(0.0);
            hundredths += (part / divisor / (index + 1) as f64 * 100.0).floor();
            start = end;
        }
        (hundredths / 100.0).floor()
    }

    fn reference(rule: SingleEventRuleV1, score: f64, room: Option<f64>) -> Option<f64> {
        match rule {
            SingleEventRuleV1::None => None,
            SingleEventRuleV1::Challenge { modern: true } => Some(3250.0 + (score / 450.0).floor()),
            SingleEventRuleV1::Challenge { modern: false } => Some(
                1000.0
                    + tier_reference(
                        score,
                        300.0,
                        &[2_100_000.0, 2_250_000.0, 2_500_000.0, f64::INFINITY],
                    ),
            ),
            SingleEventRuleV1::Normal {
                base,
                divisor,
                formula,
            } => {
                let (own, total) = if formula == 0 {
                    (
                        score.min(1_500_000.0),
                        room.unwrap_or(score).min(7_500_000.0),
                    )
                } else {
                    (score, room.unwrap_or(score))
                };
                let other = (total - own).max(0.0);
                Some(
                    base + if formula == 1 {
                        tier_reference(
                            own,
                            divisor,
                            &[
                                1_600_000.0,
                                1_750_000.0,
                                2_000_000.0,
                                2_400_000.0,
                                f64::INFINITY,
                            ],
                        ) + tier_reference(
                            other,
                            divisor * 10.0,
                            &[
                                6_400_000.0,
                                7_000_000.0,
                                8_000_000.0,
                                9_600_000.0,
                                f64::INFINITY,
                            ],
                        )
                    } else {
                        (own / divisor).floor() + (other / divisor / 10.0).floor()
                    },
                )
            }
        }
    }

    #[test]
    fn event_boundaries_match_independent_tiers_and_relaxed_upper() {
        let mut values = vec![0.0, 0.25, 14_999.75, 15_000.0, 15_000.25, 30_000_000.0];
        for end in [
            1_500_000.0_f64,
            1_600_000.0,
            1_750_000.0,
            2_000_000.0,
            2_100_000.0,
            2_250_000.0,
            2_400_000.0,
            2_500_000.0,
            6_400_000.0,
            7_000_000.0,
            7_500_000.0,
            8_000_000.0,
            9_600_000.0,
        ] {
            values.extend([end.next_down(), end, end.next_up()]);
        }
        let mut rules = vec![
            SingleEventRuleV1::None,
            SingleEventRuleV1::Challenge { modern: false },
            SingleEventRuleV1::Challenge { modern: true },
        ];
        for (base, divisor) in [
            (50.0, 10_000.0),
            (20.0, 25_000.0),
            (70.0, 50_000.0),
            (40.0, 13_000.0),
            (130.0, 26_000.0),
            (40.0, 10_000.0),
            (120.0, 15_000.0),
        ] {
            for formula in 0..=2 {
                rules.push(SingleEventRuleV1::Normal {
                    base,
                    divisor,
                    formula,
                });
            }
        }
        for rule in rules {
            for &score in &values {
                for &other in &values {
                    for multi in [false, true] {
                        let room = multi.then(|| (score + other + 1e-5).floor());
                        for (bonus, support) in [
                            (0.0, 0.0),
                            (0.29, 2999.999999),
                            (1.55, 3000.0),
                            (2.55, 6000.000001),
                        ] {
                            let expected = reference(rule, score, room).map(|base| {
                                (base * (1.0 + bonus)).floor() + (support / 3000.0_f64).floor()
                            });
                            let actual = rule.points(score, room, bonus, support);
                            assert_eq!(actual, expected, "{rule:?}, score={score}, room={room:?}");
                            // Search supplies an independent other-player ceiling,
                            // including one point for the room floor/tolerance.
                            for extra in [0.0, 1_000_000.0] {
                                let upper = rule.upper(
                                    score + extra,
                                    if multi { other + 1.0 + extra } else { 1.0 },
                                    bonus,
                                    support,
                                );
                                assert!(
                                    upper.zip(actual).is_none_or(|(u, a)| u >= a),
                                    "{rule:?}, score={score}, room={room:?}, upper={upper:?}, actual={actual:?}"
                                );
                            }
                        }
                    }
                }
            }
        }
    }
}
