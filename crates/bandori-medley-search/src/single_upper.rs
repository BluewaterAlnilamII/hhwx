//! Directed-upward one-team bounds. Position maxima relax the weighted
//! assignment; character DP retains exactly one leader and the P/K tradeoff.
use crate::exact_score::{exact_probability_to_f64, single_combo_rate};
use crate::fast_upper::{add_up, div_up, mul_up, rounding_factor};
use crate::single::{SingleSearchInputV1, SingleTargetV1};
use crate::single_event::SingleEventRuleV1;
use crate::single_score::{ORDER_WEIGHTS, SKILL_WAIT_SECONDS, max_skill_percent};
use crate::upper_bound::{
    UpperBoundFailure, checked_finite, continued_power_range, skill_delta, trigger_indexes,
};
use bandori_medley_model::ResolvedScoreSkillV1;
use std::collections::BTreeMap;

type Suffix = Vec<[[f64; 2]; 6]>;

fn position_upper(rates: [f64; 6]) -> Result<f64, UpperBoundFailure> {
    let mut best = 0.0_f64;
    for (position, _) in ORDER_WEIGHTS[0].iter().enumerate() {
        let rate = (0..5).try_fold(0.0, |sum, w| {
            add_up(
                sum,
                mul_up(rates[w], ORDER_WEIGHTS[w][position] as f64 / 1024.0)?,
            )
        })?;
        best = best.max(rate);
    }
    Ok(best)
}

fn suffix(groups: &[Vec<u32>], values: &[[f64; 2]]) -> Result<Suffix, UpperBoundFailure> {
    let mut table = vec![[[f64::NEG_INFINITY; 2]; 6]; groups.len() + 1];
    table[groups.len()][0][0] = 0.0;
    for group in (0..groups.len()).rev() {
        table[group] = table[group + 1];
        for &id in &groups[group] {
            for count in 1..=5 {
                for leader in 0..=1 {
                    for take_leader in 0..=leader {
                        let tail = table[group + 1][count - 1][leader - take_leader];
                        if !tail.is_finite() || !values[id as usize][take_leader].is_finite() {
                            continue;
                        }
                        table[group][count][leader] = table[group][count][leader]
                            .max(add_up(tail, values[id as usize][take_leader])?);
                    }
                }
            }
        }
    }
    Ok(table)
}

fn prefix(values: &[[f64; 2]], fixed: &[u32]) -> Result<[f64; 2], UpperBoundFailure> {
    let mut prefix = [0.0, f64::NEG_INFINITY];
    for &id in fixed {
        let v = values[id as usize];
        let leader = if v[1].is_finite() {
            add_up(prefix[0], v[1])?
        } else {
            f64::NEG_INFINITY
        };
        let inherited = if prefix[1].is_finite() {
            add_up(prefix[1], v[0])?
        } else {
            f64::NEG_INFINITY
        };
        prefix = [add_up(prefix[0], v[0])?, leader.max(inherited)];
    }
    Ok(prefix)
}

fn complete(
    table: &Suffix,
    values: &[[f64; 2]],
    group: usize,
    fixed: &[u32],
    require_leader: bool,
) -> Result<f64, UpperBoundFailure> {
    let prefix = prefix(values, fixed)?;
    let count = 5 - fixed.len();
    let mut result = f64::NEG_INFINITY;
    for (leader, value) in prefix
        .into_iter()
        .enumerate()
        .take(if require_leader { 2 } else { 1 })
    {
        let tail = table[group][count][usize::from(require_leader) - leader];
        if value.is_finite() && tail.is_finite() {
            result = result.max(add_up(value, tail)?);
        }
    }
    Ok(result)
}

struct Metric {
    values: Vec<[f64; 2]>,
    suffix: Suffix,
}
impl Metric {
    fn new(groups: &[Vec<u32>], values: Vec<[f64; 2]>) -> Result<Self, UpperBoundFailure> {
        Ok(Self {
            suffix: suffix(groups, &values)?,
            values,
        })
    }
    fn complete(
        &self,
        group: usize,
        fixed: &[u32],
        leader: bool,
    ) -> Result<f64, UpperBoundFailure> {
        complete(&self.suffix, &self.values, group, fixed, leader)
    }
}

// Binary bins round each card's bonus upward exactly. They constrain an upper
// bound, never the candidate pool or the actual event-point calculation.
fn bonus_bins(input: &SingleSearchInputV1) -> Option<usize> {
    if input.target != SingleTargetV1::EventPoint
        || !matches!(input.event_rule, SingleEventRuleV1::Normal { .. })
    {
        return None;
    }
    let largest = input.point_bonus_rates.iter().copied().fold(0.0, f64::max);
    let bins = (largest * 32.0).ceil() * 5.0;
    (bins > 0.0 && bins <= 128.0).then_some(bins as usize)
}

struct BonusUpper {
    bins: usize,
    // Each suffix/count/bin keeps independent maxima for power and skill
    // coefficients with zero/one leader, conditioned on the same bonus bin.
    suffix: Vec<[f64; 3]>,
}

impl BonusUpper {
    fn new(
        input: &SingleSearchInputV1,
        groups: &[Vec<u32>],
        power: &Metric,
        coefficient: &Metric,
        bins: usize,
    ) -> Result<Self, UpperBoundFailure> {
        let width = bins + 1;
        let stride = 6 * width;
        let mut table = vec![[f64::NEG_INFINITY; 3]; (groups.len() + 1) * stride];
        table[groups.len() * stride] = [0.0, 0.0, f64::NEG_INFINITY];
        for group in (0..groups.len()).rev() {
            table.copy_within((group + 1) * stride..(group + 2) * stride, group * stride);
            for &id in &groups[group] {
                let id = id as usize;
                let weight = (input.point_bonus_rates[id] * 32.0).ceil() as usize;
                for count in 1..=5 {
                    for bin in weight..=bins {
                        let tail = table[(group + 1) * stride + (count - 1) * width + bin - weight];
                        if !tail[0].is_finite() {
                            continue;
                        }
                        let value = &mut table[group * stride + count * width + bin];
                        value[0] = value[0].max(add_up(tail[0], power.values[id][0])?);
                        let k = coefficient.values[id];
                        value[1] = value[1].max(add_up(tail[1], k[0])?);
                        if k[1].is_finite() {
                            value[2] = value[2].max(add_up(tail[1], k[1])?);
                        }
                        if tail[2].is_finite() {
                            value[2] = value[2].max(add_up(tail[2], k[0])?);
                        }
                    }
                }
            }
        }
        Ok(Self {
            bins,
            suffix: table,
        })
    }
}

/// Request-invariant bounds; character groups retain their order across
/// configurations, and reordering cards inside a group does not change a max.
pub(crate) struct SingleUpperShared {
    coefficient: Metric,
    bonus: Metric,
    constant: f64,
    support: f64,
    maximum_alpha: f64,
    maximum_multiplier: f64,
}

impl SingleUpperShared {
    pub(crate) fn new(
        input: &SingleSearchInputV1,
        groups: &[Vec<u32>],
    ) -> Result<Self, UpperBoundFailure> {
        let p = exact_probability_to_f64(input.perfect_rate);
        let judge = 1.1 * p + 0.8 * (1.0 - p);
        let n = input.song.notes.len();
        let coefficient = (3.0 + 0.03 * (f64::from(input.song.play_level) - 5.0)) / n as f64;
        let note_factor = rounding_factor(4)?;
        let alphas = (0..n)
            .map(|i| {
                mul_up(
                    mul_up(
                        mul_up(
                            mul_up(coefficient, judge)?,
                            single_combo_rate((i + 1) as u32),
                        )?,
                        if input.fever[i] { 2.0 } else { 1.0 },
                    )?,
                    note_factor,
                )
            })
            .collect::<Result<Vec<_>, _>>()?;
        let mut constant = alphas.iter().try_fold(0.0, |sum, &a| add_up(sum, a))?;
        let triggers = trigger_indexes(&input.song)?;
        let longest = input
            .cards
            .iter()
            .flat_map(|card| {
                let c = card.skill_contexts;
                [
                    c.mixed,
                    c.same_band,
                    c.same_attribute,
                    c.same_band_and_attribute,
                ]
            })
            .chain(input.other_skills.iter().flatten().copied())
            .map(|skill| skill.duration_seconds)
            .fold(0.0, f64::max);
        let mut latest = triggers.map(|i| input.song.notes[i].time_seconds);
        for w in 1..6 {
            latest[w] = latest[w].max(add_up(add_up(latest[w - 1], longest)?, SKILL_WAIT_SECONDS)?);
        }
        let power_range = continued_power_range(p, n as u32)?;
        let mut windows = BTreeMap::new();
        let mut maximum_delta = 0.0_f64;
        let mut skill_rates = |skill: ResolvedScoreSkillV1| -> Result<[f64; 6], UpperBoundFailure> {
            let delta = skill_delta(skill, p, judge, power_range)?;
            maximum_delta = maximum_delta.max(delta);
            // Only these two scalars vary in the window sum. Keep their exact
            // bits and run skill_delta before lookup, including its failures.
            let key = (skill.duration_seconds.to_bits(), delta.to_bits());
            if let Some(&rates) = windows.get(&key) {
                return Ok(rates);
            }
            let mut rates = [0.0; 6];
            for w in 0..6 {
                // Union of every possible queued window. Overlap is deliberately
                // overcounted here; exact scoring uses one scheduled activation.
                let end = add_up(latest[w], skill.duration_seconds)?;
                for (i, &alpha) in alphas.iter().enumerate().skip(triggers[w] + 1) {
                    if input.song.notes[i].time_seconds > end {
                        break;
                    }
                    rates[w] = add_up(rates[w], mul_up(alpha, delta)?)?;
                }
            }
            windows.insert(key, rates);
            Ok(rates)
        };
        if let Some(others) = input.other_skills {
            for (i, skill) in others.into_iter().enumerate() {
                let rates = skill_rates(skill)?;
                // Relax room assignment: each actor may independently take its
                // best position. Equal 1/5 weights would underestimate some rooms.
                constant = add_up(constant, position_upper(rates)?)?;
                if input.encore_actor == i + 1 {
                    constant = add_up(constant, rates[5])?;
                }
            }
        }
        let mut values = Vec::with_capacity(input.cards.len());
        for card in &input.cards {
            let ctx = card.skill_contexts;
            let mut regular = 0.0_f64;
            let mut leader = f64::NEG_INFINITY;
            for skill in [
                ctx.mixed,
                ctx.same_band,
                ctx.same_attribute,
                ctx.same_band_and_attribute,
            ] {
                let rates = skill_rates(skill)?;
                if input.other_skills.is_some() {
                    if max_skill_percent(skill) >= input.min_leader_score_up_percent {
                        let average = position_upper(rates)?;
                        leader = leader.max(add_up(
                            average,
                            if input.encore_actor == 0 {
                                rates[5]
                            } else {
                                0.0
                            },
                        )?);
                    }
                } else {
                    regular = regular.max(position_upper(rates)?);
                    if max_skill_percent(skill) >= input.min_leader_score_up_percent {
                        leader = leader.max(rates[5]);
                    }
                }
            }
            values.push([
                regular,
                if leader.is_finite() {
                    add_up(regular, leader)?
                } else {
                    leader
                },
            ]);
        }
        let maximum_multiplier = add_up(1.0, maximum_delta)?;
        let maximum_alpha = alphas.into_iter().fold(0.0, f64::max);
        let coefficient = Metric::new(groups, values)?;
        let bonus = Metric::new(
            groups,
            input.point_bonus_rates.iter().map(|&b| [b, 0.0]).collect(),
        )?;
        let support_values: Vec<_> = input.support_powers.iter().map(|&v| [v, 0.0]).collect();
        let support = if input.mission_support {
            // Fewer than five remaining support characters is legal; using the
            // five largest card powers (even duplicate characters) is an upper.
            let mut powers: Vec<_> = groups
                .iter()
                .flatten()
                .map(|&i| support_values[i as usize][0])
                .collect();
            powers.sort_by(|a, b| b.total_cmp(a));
            powers.into_iter().take(5).try_fold(0.0, add_up)?
        } else {
            0.0
        };
        Ok(Self {
            coefficient,
            bonus,
            constant,
            support,
            maximum_alpha,
            maximum_multiplier,
        })
    }
}

pub(crate) struct SingleUpper<'a> {
    shared: &'a SingleUpperShared,
    power: Metric,
    correlated: Vec<(f64, Metric)>,
    bonus_conditioned: Option<BonusUpper>,
}

impl<'a> SingleUpper<'a> {
    pub(crate) fn extra_storage(input: &SingleSearchInputV1, groups: usize) -> usize {
        bonus_bins(input).map_or(0, |bins| {
            (groups + 1)
                .saturating_mul(6 * (bins + 1))
                .saturating_mul(std::mem::size_of::<[f64; 3]>())
        })
    }

    pub(crate) fn new(
        input: &SingleSearchInputV1,
        configuration: usize,
        groups: &[Vec<u32>],
        shared: &'a SingleUpperShared,
    ) -> Result<Self, UpperBoundFailure> {
        let config = &input.area_configurations[configuration];
        let p_factor = rounding_factor(12 + 16 * config.selected_area_item_ids.len() as u128)?;
        let mut powers = Vec::with_capacity(input.cards.len());
        for card in &input.cards {
            let card_sum = (card.character_parameter[0] + card.character_parameter[1])
                + card.character_parameter[2];
            let event_sum =
                (card.event_parameter[0] + card.event_parameter[1]) + card.event_parameter[2];
            let mut atoms = add_up(card_sum, event_sum)?;
            for &id in &config.selected_area_item_ids {
                let item = input
                    .area_items
                    .iter()
                    .find(|i| i.area_item_id == id)
                    .ok_or(UpperBoundFailure::Unknown)?;
                if item.target_band_ids.contains(&card.band_id)
                    && item.target_attributes.contains(&card.attribute)
                {
                    for axis in 0..3 {
                        atoms = add_up(
                            atoms,
                            checked_finite(
                                card.character_parameter[axis] * item.parameter_rates[axis],
                            )?,
                        )?;
                    }
                }
            }
            powers.push([mul_up(atoms, p_factor)?, 0.0]);
        }
        let power = Metric::new(groups, powers)?;
        let max_p = power.complete(0, &[], false)?;
        let max_k = shared.coefficient.complete(0, &[], true)?;
        let max_k = if max_k.is_finite() {
            add_up(shared.constant, max_k)?
        } else {
            0.0
        };
        let mut correlated = Vec::new();
        if max_p > 0.0 && max_k > 0.0 {
            let scale = (max_k / max_p).sqrt();
            for factor in [0.8, 1.0, 1.25] {
                let t = checked_finite(scale * factor)?;
                let mut values = Vec::with_capacity(input.cards.len());
                for (p, k) in power.values.iter().zip(&shared.coefficient.values) {
                    let regular = add_up(mul_up(t, p[0])?, div_up(k[0], t)?)?;
                    let leader = if k[1].is_finite() {
                        add_up(mul_up(t, p[0])?, div_up(k[1], t)?)?
                    } else {
                        f64::NEG_INFINITY
                    };
                    values.push([regular, leader]);
                }
                correlated.push((t, Metric::new(groups, values)?));
            }
        }
        let bonus_conditioned = bonus_bins(input).and_then(|bins| {
            BonusUpper::new(input, groups, &power, &shared.coefficient, bins).ok()
        });
        Ok(Self {
            shared,
            power,
            correlated,
            bonus_conditioned,
        })
    }

    pub(crate) fn traversal(&self, id: u32) -> f64 {
        self.power.values[id as usize][0]
            * (self.shared.constant
                + self.shared.coefficient.values[id as usize][1]
                    .max(self.shared.coefficient.values[id as usize][0]))
    }

    pub(crate) fn bound(&self, input: &SingleSearchInputV1, group: usize, fixed: &[u32]) -> f64 {
        self.checked_bound(input, group, fixed)
            .unwrap_or(f64::INFINITY)
    }

    pub(crate) fn bonus_bound(
        &self,
        input: &SingleSearchInputV1,
        group: usize,
        fixed: &[u32],
    ) -> f64 {
        self.checked_bonus_bound(input, group, fixed)
            .unwrap_or(f64::INFINITY)
    }

    fn checked_bonus_bound(
        &self,
        input: &SingleSearchInputV1,
        group: usize,
        fixed: &[u32],
    ) -> Result<f64, UpperBoundFailure> {
        let Some(table) = &self.bonus_conditioned else {
            return Err(UpperBoundFailure::Unknown);
        };
        let mut power = 0.0;
        let coefficients = prefix(&self.shared.coefficient.values, fixed)?;
        let mut bonus = 0.0;
        for &id in fixed {
            let id = id as usize;
            power = add_up(power, self.power.values[id][0])?;
            bonus = add_up(bonus, input.point_bonus_rates[id])?;
        }
        let count = 5 - fixed.len();
        let width = table.bins + 1;
        let offset = (group * 6 + count) * width;
        let mut best = f64::NEG_INFINITY;
        for (bin, tail) in table.suffix[offset..offset + width].iter().enumerate() {
            if !tail[0].is_finite() {
                continue;
            }
            let mut k = f64::NEG_INFINITY;
            if tail[2].is_finite() {
                k = add_up(coefficients[0], tail[2])?;
            }
            if coefficients[1].is_finite() {
                k = k.max(add_up(coefficients[1], tail[1])?);
            }
            if !k.is_finite() {
                continue;
            }
            let p = add_up(power, tail[0])?;
            if p < input.min_total_power {
                continue;
            }
            let rate = add_up(self.shared.constant, k)?;
            // Preserve the original overflow gate even when this method is
            // exercised independently by the exhaustive bound checks.
            if mul_up(
                mul_up(p, self.shared.maximum_alpha)?,
                self.shared.maximum_multiplier,
            )? > f64::from(u32::MAX)
            {
                return Err(UpperBoundFailure::Unknown);
            }
            let score = mul_up(mul_up(p, rate)?, rounding_factor(2)?)?;
            let room_rate = mul_up(rate, rounding_factor(256)?)?;
            let other = add_up(mul_up(room_rate, input.other_players_power)?, 1.0)?;
            // Five nonnegative bonus additions, multiplication by 100, and
            // canonical-order reassociation are enclosed before monotone round.
            let raw_bonus = mul_up(add_up(bonus, bin as f64 / 32.0)?, rounding_factor(8)?)?;
            let rounded_bonus = div_up(mul_up(raw_bonus, 100.0)?.round(), 100.0)?;
            let points = input
                .event_rule
                .upper(score, other, rounded_bonus, self.shared.support)
                .ok_or(UpperBoundFailure::Unknown)?;
            best = best.max(checked_finite(points)?);
        }
        Ok(best)
    }

    fn checked_bound(
        &self,
        input: &SingleSearchInputV1,
        group: usize,
        fixed: &[u32],
    ) -> Result<f64, UpperBoundFailure> {
        let power = self.power.complete(group, fixed, false)?;
        let k = self.shared.coefficient.complete(group, fixed, true)?;
        if !power.is_finite() || !k.is_finite() || power < input.min_total_power {
            return Ok(f64::NEG_INFINITY);
        }
        let rate = add_up(self.shared.constant, k)?;
        // A potentially overflowing exact scorer cannot be hidden by a cut.
        if mul_up(
            mul_up(power, self.shared.maximum_alpha)?,
            self.shared.maximum_multiplier,
        )? > f64::from(u32::MAX)
        {
            return Err(UpperBoundFailure::Unknown);
        }
        let mut score = mul_up(power, rate)?;
        for (t, metric) in &self.correlated {
            let linear = add_up(
                metric.complete(group, fixed, true)?,
                div_up(self.shared.constant, *t)?,
            )?;
            score = score.min(div_up(mul_up(linear, linear)?, 4.0)?);
        }
        // Covers conversion of the integer weighted numerator to binary64.
        score = mul_up(score, rounding_factor(2)?)?;
        if input.target == SingleTargetV1::Score {
            return Ok(score);
        }
        let bonus = self.shared.bonus.complete(group, fixed, false)?;
        let bonus = div_up(mul_up(bonus, 100.0)?.ceil(), 100.0)?;
        // Enclose weighted products and accumulation of 96 queued order rates.
        let room_rate = mul_up(rate, rounding_factor(256)?)?;
        let other = add_up(mul_up(room_rate, input.other_players_power)?, 1.0)?;
        Ok(input
            .event_rule
            .upper(score, other, bonus, self.shared.support)
            .unwrap_or(score))
    }
}
