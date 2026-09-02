//! A chart-free partial-team bound, separate from exact leaf scoring.
//!
//! Every real team has score <= P*K before the final mean-rounding
//! envelope. P is an additive per-card parameter upper; K is the average-judgment base
//! coefficient plus five real card contributions and exactly one leader bonus.
//! For any positive t, P*K <= (t*P + K/t)^2/4. Maximizing that additive quantity
//! over distinct characters retains the parameter/skill trade-off on each card.
//! All arithmetic on the proof path is directed upward; failure is never a cut.

use std::collections::{BTreeMap, BTreeSet};

use bandori_medley_model::ResolvedScoreSkillV1;

use crate::candidate::member_order_for_leader;
use crate::exact_score::exact_probability_to_f64;
use crate::parameters::calculate_team_parameters;
use crate::upper_bound::{
    UpperBoundFailure, checked_finite, combo_rate, continued_power_range, reference_ceiling,
    skill_delta, trigger_indexes,
};
use crate::{AreaItemConfigurationV1, CardAttributeV1, MedleySearchInputV1, SearchCardV1};

const ERROR_DENOMINATOR: u128 = 1_u128 << 52;
const WEIGHT_FACTORS: [f64; 3] = [0.8, 1.0, 1.25];

pub(crate) fn add_up(left: f64, right: f64) -> Result<f64, UpperBoundFailure> {
    if left == 0.0 {
        return checked_finite(right);
    }
    if right == 0.0 {
        return checked_finite(left);
    }
    checked_finite(checked_finite(left + right)?.next_up())
}

pub(crate) fn mul_up(left: f64, right: f64) -> Result<f64, UpperBoundFailure> {
    if left == 0.0 || right == 0.0 {
        return Ok(0.0);
    }
    checked_finite(checked_finite(left * right)?.next_up())
}

pub(crate) fn div_up(numerator: f64, denominator: f64) -> Result<f64, UpperBoundFailure> {
    if !denominator.is_finite() || denominator <= 0.0 {
        return Err(UpperBoundFailure::Unknown);
    }
    if numerator == 0.0 {
        return Ok(0.0);
    }
    checked_finite(checked_finite(numerator / denominator)?.next_up())
}

fn add_down(left: f64, right: f64) -> Result<f64, UpperBoundFailure> {
    if left == 0.0 {
        return checked_finite(right);
    }
    if right == 0.0 {
        return checked_finite(left);
    }
    Ok(checked_finite(left + right)?.next_down().max(0.0))
}

fn mul_down(left: f64, right: f64) -> Result<f64, UpperBoundFailure> {
    if left == 0.0 || right == 0.0 {
        return Ok(0.0);
    }
    Ok(checked_finite(left * right)?.next_down().max(0.0))
}

pub(crate) fn sub_up(left: f64, right: f64) -> Result<f64, UpperBoundFailure> {
    if right == 0.0 {
        return checked_finite(left);
    }
    if !left.is_finite() || !right.is_finite() || left < right {
        return Err(UpperBoundFailure::Unknown);
    }
    if left == right {
        return Ok(0.0);
    }
    checked_finite((left - right).next_up())
}

pub(crate) fn rounding_factor(operations: u128) -> Result<f64, UpperBoundFailure> {
    if operations >= ERROR_DENOMINATOR {
        return Err(UpperBoundFailure::Unknown);
    }
    div_up(
        ERROR_DENOMINATOR as f64,
        (ERROR_DENOMINATOR - operations) as f64,
    )
}

#[derive(Clone, Copy, Debug)]
struct TeamContext {
    band_id: Option<u32>,
    attribute: Option<CardAttributeV1>,
}

impl TeamContext {
    fn accepts(self, card: &SearchCardV1) -> bool {
        self.band_id.is_none_or(|band| band == card.band_id)
            && self
                .attribute
                .is_none_or(|attribute| attribute == card.attribute)
    }

    fn skill_index(self) -> usize {
        usize::from(self.band_id.is_some()) + 2 * usize::from(self.attribute.is_some())
    }
}

fn contexts(card: &SearchCardV1) -> [ResolvedScoreSkillV1; 4] {
    [
        card.skill_contexts.mixed,
        card.skill_contexts.same_band,
        card.skill_contexts.same_attribute,
        card.skill_contexts.same_band_and_attribute,
    ]
}

#[derive(Clone, Copy, Debug, Default)]
struct SkillContribution {
    first_five: f64,
    leader: f64,
}

struct SongModel {
    base: f64,
    maximum_alpha: f64,
    coefficient: f64,
}

/// One input-local copy of chart work, shared by every area configuration.
pub(crate) struct FastScoreModel<'a> {
    input: &'a MedleySearchInputV1,
    songs: [SongModel; 3],
    contributions: Vec<[[SkillContribution; 3]; 4]>,
    character_indexes: Vec<usize>,
    character_count: usize,
    contexts: Vec<TeamContext>,
    maximum_multiplier: f64,
}

impl<'a> FastScoreModel<'a> {
    pub(crate) fn new(input: &'a MedleySearchInputV1) -> Result<Self, UpperBoundFailure> {
        let perfect_rate = exact_probability_to_f64(input.perfect_rate);
        let judgment_multiplier = checked_finite(1.1 * perfect_rate + 0.8 * (1.0 - perfect_rate))?;
        let maximum_notes = input
            .songs
            .iter()
            .map(|song| song.notes.len())
            .max()
            .unwrap_or(0);
        let power_range = continued_power_range(
            perfect_rate,
            u32::try_from(maximum_notes).map_err(|_| UpperBoundFailure::Unknown)?,
        )?;
        let character_ids = input
            .cards
            .iter()
            .map(|card| card.character_id)
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();
        let character_indexes = input
            .cards
            .iter()
            .map(|card| character_ids.binary_search(&card.character_id).unwrap())
            .collect();
        let mut bands = BTreeSet::new();
        let mut attributes = Vec::new();
        let mut pairs = Vec::new();
        for card in input.cards.iter().filter(|card| !card.is_excluded) {
            bands.insert(card.band_id);
            if !attributes.contains(&card.attribute) {
                attributes.push(card.attribute);
            }
            if !pairs.contains(&(card.band_id, card.attribute)) {
                pairs.push((card.band_id, card.attribute));
            }
        }
        let mut team_contexts = vec![TeamContext {
            band_id: None,
            attribute: None,
        }];
        team_contexts.extend(bands.into_iter().map(|band_id| TeamContext {
            band_id: Some(band_id),
            attribute: None,
        }));
        team_contexts.extend(attributes.into_iter().map(|attribute| TeamContext {
            band_id: None,
            attribute: Some(attribute),
        }));
        team_contexts.extend(pairs.into_iter().map(|(band_id, attribute)| TeamContext {
            band_id: Some(band_id),
            attribute: Some(attribute),
        }));

        let mut song_models = Vec::with_capacity(3);
        let mut alphas: [Vec<f64>; 3] = std::array::from_fn(|_| Vec::new());
        let mut triggers = [[0; 6]; 3];
        let mut start_combo = 0_u32;
        let note_factor = rounding_factor(3)?;
        for (slot, song) in input.songs.iter().enumerate() {
            let note_count =
                u32::try_from(song.notes.len()).map_err(|_| UpperBoundFailure::Unknown)?;
            let coefficient =
                (3.0 + 0.03 * (f64::from(song.play_level) - 5.0)) / f64::from(note_count);
            let fixed_rate = mul_up(coefficient, judgment_multiplier)?;
            let mut base = 0.0_f64;
            let mut maximum_alpha = 0.0_f64;
            for note_index in 0..note_count {
                let combo = start_combo
                    .checked_add(note_index + 1)
                    .ok_or(UpperBoundFailure::Unknown)?;
                let alpha = mul_up(mul_up(fixed_rate, combo_rate(combo))?, note_factor)?;
                alphas[slot].push(alpha);
                base = add_up(base, alpha)?;
                maximum_alpha = maximum_alpha.max(alpha);
            }
            triggers[slot] = trigger_indexes(song)?;
            song_models.push(SongModel {
                base,
                maximum_alpha,
                coefficient,
            });
            start_combo = start_combo
                .checked_add(note_count)
                .ok_or(UpperBoundFailure::Unknown)?;
        }

        // A duration's exact windows are traversed once, never once per node or
        // area configuration. Direct upward sums avoid unsafe prefix subtraction.
        let mut windows = BTreeMap::<u64, [[f64; 6]; 3]>::new();
        let mut contributions = vec![[[SkillContribution::default(); 3]; 4]; input.cards.len()];
        let mut maximum_delta = 0.0_f64;
        for card in input.cards.iter().filter(|card| !card.is_excluded) {
            for (context_index, skill) in contexts(card).into_iter().enumerate() {
                let duration_key = skill.duration_seconds.to_bits();
                if let std::collections::btree_map::Entry::Vacant(entry) =
                    windows.entry(duration_key)
                {
                    let mut coverage = [[0.0; 6]; 3];
                    for slot in 0..3 {
                        for activation_index in 0..6 {
                            let trigger = triggers[slot][activation_index];
                            let song = &input.songs[slot];
                            let end = checked_finite(
                                song.notes[trigger].time_seconds + skill.duration_seconds,
                            )?;
                            for (note, alpha) in
                                song.notes.iter().zip(&alphas[slot]).skip(trigger + 1)
                            {
                                if note.time_seconds <= end {
                                    coverage[slot][activation_index] =
                                        add_up(coverage[slot][activation_index], *alpha)?;
                                }
                            }
                        }
                    }
                    entry.insert(coverage);
                }
                let coverage = &windows[&duration_key];
                let delta = skill_delta(skill, perfect_rate, judgment_multiplier, power_range)?;
                maximum_delta = maximum_delta.max(delta);
                for slot in 0..3 {
                    let first_sum = coverage[slot][..5]
                        .iter()
                        .try_fold(0.0, |sum, alpha| add_up(sum, *alpha))?;
                    contributions[card.instance_id as usize][context_index][slot] =
                        SkillContribution {
                            // Every card occupies each of the first five positions
                            // in 24 of the 120 orders: the coefficient is sum/5.
                            first_five: mul_up(div_up(first_sum, 5.0)?, delta)?,
                            leader: mul_up(coverage[slot][5], delta)?,
                        };
                }
            }
        }
        let maximum_multiplier = add_up(1.0, maximum_delta)?;
        Ok(Self {
            input,
            songs: song_models
                .try_into()
                .map_err(|_| UpperBoundFailure::Unknown)?,
            contributions,
            character_indexes,
            character_count: character_ids.len(),
            contexts: team_contexts,
            maximum_multiplier,
        })
    }
}

struct ContextWeights {
    context: TeamContext,
    scales: [f64; 3],
    groups: Vec<(usize, usize)>,
}

struct RankedCards {
    ids: Vec<u32>,
    head: usize,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct TeamUpper {
    pub(crate) score: f64,
    pub(crate) members: Option<[u32; 5]>,
}

impl Default for TeamUpper {
    fn default() -> Self {
        Self {
            score: f64::INFINITY,
            members: None,
        }
    }
}

/// One configuration's full ordered card lists. Removing a card advances only
/// affected heads; undo restores them. No candidate is discarded by its rank.
pub(crate) struct FastUpperBoundEngine<'a> {
    model: &'a FastScoreModel<'a>,
    configuration: &'a AreaItemConfigurationV1,
    parameters: Vec<f64>,
    contexts: Vec<ContextWeights>,
    weights: Vec<[[[[f64; 2]; 3]; 3]; 4]>,
    lists: Vec<RankedCards>,
    card_list_starts: Vec<[usize; 4]>,
    undo: Vec<(usize, usize)>,
}

#[derive(Clone, Copy)]
struct Choice {
    value: f64,
    instance_id: u32,
}

#[derive(Clone, Copy)]
struct Support {
    value: f64,
    members: [u32; 5],
}

fn retain_support(target: &mut Option<Support>, candidate: Support) {
    if target.is_none_or(|previous| {
        candidate.value > previous.value
            || (candidate.value == previous.value && candidate.members < previous.members)
    }) {
        *target = Some(candidate);
    }
}

impl<'a> FastUpperBoundEngine<'a> {
    /// Linear score uppers for a joint allocation. Unknown whole-team contexts
    /// are relaxed per card, never enumerated as a three-context product.
    pub(crate) fn joint_weights(
        &self,
        owners: &[u8],
        groups: &[Vec<u32>],
        fixed_scores: [Option<f64>; 3],
    ) -> Result<Option<crate::joint_upper::JointWeights>, UpperBoundFailure> {
        let mut result = crate::joint_upper::JointWeights {
            cards: vec![[[0.0; 2]; 3]; owners.len()],
            constant: 0.0,
            offset: 0.0,
            fixed_members: std::array::from_fn(|slot| {
                owners
                    .iter()
                    .enumerate()
                    .filter_map(|(id, &mask)| (mask == (1 << slot)).then_some(id as u32))
                    .collect()
            }),
            fixed_leaders: [None; 3],
            fixed_scores,
        };
        for (slot, fixed_score) in fixed_scores.into_iter().enumerate() {
            let bit = 1 << slot;
            let fixed = &result.fixed_members[slot];
            if fixed.len() > 5 {
                return Ok(None);
            }
            let needed = 5 - fixed.len();
            let mut remaining_groups = Vec::with_capacity(groups.len());
            for group in groups {
                match group
                    .iter()
                    .filter(|&&id| owners[id as usize] == bit)
                    .count()
                {
                    0 => remaining_groups.push(group),
                    1 => {}
                    _ => return Ok(None),
                }
            }
            if needed == 0
                && let Some(score) = fixed_score
            {
                // The joint envelope uses nonnegative contributions. Replacing
                // a settled negative song by zero only enlarges the total.
                result.constant = add_up(result.constant, score.max(0.0))?;
                continue;
            }
            let reachable = self
                .contexts
                .iter()
                .filter(|weighted| {
                    fixed.iter().all(|&id| {
                        weighted
                            .context
                            .accepts(&self.model.input.cards[id as usize])
                    }) && remaining_groups
                        .iter()
                        .filter(|group| {
                            group.iter().any(|&id| {
                                owners[id as usize] & bit != 0
                                    && weighted
                                        .context
                                        .accepts(&self.model.input.cards[id as usize])
                            })
                        })
                        .count()
                        >= needed
                })
                .collect::<Vec<_>>();
            if reachable.is_empty() {
                return Ok(None);
            }
            let mut coefficients = vec![[0.0_f64; 2]; owners.len()];
            for (id, &mask) in owners.iter().enumerate() {
                if mask & bit == 0 {
                    continue;
                }
                for weighted in &reachable {
                    if weighted.context.accepts(&self.model.input.cards[id]) {
                        let contribution =
                            self.model.contributions[id][weighted.context.skill_index()][slot];
                        coefficients[id][0] = coefficients[id][0].max(contribution.first_five);
                        coefficients[id][1] = coefficients[id][1].max(contribution.leader);
                    }
                }
            }
            let fixed_parameter = fixed
                .iter()
                .try_fold(0.0, |sum, &id| add_up(sum, self.parameters[id as usize]))?;
            let fixed_coefficient = fixed
                .iter()
                .try_fold(self.model.songs[slot].base, |sum, &id| {
                    add_up(sum, coefficients[id as usize][0])
                })?;
            let fixed_leader = fixed
                .iter()
                .map(|&id| coefficients[id as usize][1])
                .max_by(f64::total_cmp);
            let mut parameter_maxima = remaining_groups
                .iter()
                .filter_map(|group| {
                    group
                        .iter()
                        .filter(|&&id| owners[id as usize] & bit != 0)
                        .map(|&id| self.parameters[id as usize])
                        .max_by(f64::total_cmp)
                })
                .collect::<Vec<_>>();
            parameter_maxima.sort_unstable_by(|left, right| right.total_cmp(left));
            if parameter_maxima.len() < needed {
                return Ok(None);
            }
            let remaining_parameter = parameter_maxima[..needed]
                .iter()
                .try_fold(0.0, |sum, &p| add_up(sum, p))?;
            let mut parameter_minima = remaining_groups
                .iter()
                .filter_map(|group| {
                    group
                        .iter()
                        .filter(|&&id| owners[id as usize] & bit != 0)
                        .map(|&id| self.parameters[id as usize])
                        .min_by(f64::total_cmp)
                })
                .collect::<Vec<_>>();
            parameter_minima.sort_unstable_by(f64::total_cmp);
            let minimum_remaining_parameter = parameter_minima[..needed]
                .iter()
                .try_fold(0.0, |sum, &p| add_down(sum, p))?;
            self.check_parameter_range(add_up(fixed_parameter, remaining_parameter)?, slot)?;
            if needed == 0 {
                result.constant = add_up(
                    result.constant,
                    mul_up(
                        fixed_parameter,
                        add_up(fixed_coefficient, fixed_leader.unwrap())?,
                    )?,
                )?;
                continue;
            }
            let constant = mul_up(fixed_parameter, fixed_coefficient)?;
            let remaining_ids = remaining_groups
                .iter()
                .flat_map(|group| group.iter().copied())
                .filter(|&id| owners[id as usize] & bit != 0)
                .collect::<Vec<_>>();
            if needed == 1 {
                // Carry the complete P*K on the last card. A zero fixed-leader
                // option keeps both fixed-member and last-card leaders legal.
                let fixed_leader = fixed_leader.ok_or(UpperBoundFailure::Unknown)?;
                result.fixed_leaders[slot] = Some(0.0);
                for &id in &remaining_ids {
                    let id = id as usize;
                    let parameter = add_up(fixed_parameter, self.parameters[id])?;
                    let coefficient = add_up(fixed_coefficient, coefficients[id][0])?;
                    result.cards[id][slot] = [
                        mul_up(parameter, add_up(coefficient, fixed_leader)?)?,
                        mul_up(parameter, add_up(coefficient, coefficients[id][1])?)?,
                    ];
                }
                continue;
            }
            result.constant = add_up(result.constant, constant)?;
            let max_first = remaining_ids
                .iter()
                .map(|&id| coefficients[id as usize][0])
                .fold(0.0_f64, f64::max);
            let max_leader = remaining_ids
                .iter()
                .map(|&id| coefficients[id as usize][1])
                .fold(fixed_leader.unwrap_or(0.0), f64::max);
            let remaining_coefficient = add_up(mul_up(needed as f64, max_first)?, max_leader)?;
            // P0*K0 is constant. P0*Kr and K0*Pr stay linear; only Pr*Kr
            // needs a quadratic envelope. Already selected members contribute
            // neither another parameter nor another first-five term in the DP.
            for &id in &remaining_ids {
                let id = id as usize;
                let regular = add_up(
                    mul_up(fixed_parameter, coefficients[id][0])?,
                    mul_up(fixed_coefficient, self.parameters[id])?,
                )?;
                result.cards[id][slot] = [
                    regular,
                    add_up(regular, mul_up(fixed_parameter, coefficients[id][1])?)?,
                ];
            }
            let fixed_leader_linear = fixed_leader
                .map(|leader| mul_up(fixed_parameter, leader))
                .transpose()?;
            if remaining_parameter == 0.0 || remaining_coefficient == 0.0 {
                result.fixed_leaders[slot] = fixed_leader_linear;
                continue;
            }
            // A fixed member may supply the leader without consuming a remaining
            // member slot. Otherwise exactly one of the remaining cards does.
            let maximum_support = |weights: &[[f64; 2]], fixed_leader: Option<f64>| {
                let mut states = [[f64::NEG_INFINITY; 2]; 6];
                states[0][0] = 0.0;
                if let Some(leader) = fixed_leader {
                    states[0][1] = leader;
                }
                for group in &remaining_groups {
                    let mut choices = [f64::NEG_INFINITY; 2];
                    for &id in *group {
                        if owners[id as usize] & bit != 0 {
                            for role in 0..2 {
                                choices[role] = choices[role].max(weights[id as usize][role]);
                            }
                        }
                    }
                    let previous = states;
                    for count in 0..needed {
                        for used_leader in 0..2 {
                            if previous[count][used_leader] == f64::NEG_INFINITY {
                                continue;
                            }
                            for role in 0..(2 - used_leader) {
                                if choices[role] != f64::NEG_INFINITY {
                                    states[count + 1][used_leader + role] = states[count + 1]
                                        [used_leader + role]
                                        .max(add_up(previous[count][used_leader], choices[role])?);
                                }
                            }
                        }
                    }
                }
                Ok::<_, UpperBoundFailure>(
                    (states[needed][1] != f64::NEG_INFINITY).then_some(states[needed][1]),
                )
            };
            let minimum_support = |weights: &[[f64; 2]], fixed_leader: Option<f64>| {
                let mut states = [[f64::INFINITY; 2]; 6];
                states[0][0] = 0.0;
                if let Some(leader) = fixed_leader {
                    states[0][1] = leader;
                }
                for group in &remaining_groups {
                    let mut choices = [f64::INFINITY; 2];
                    for &id in *group {
                        if owners[id as usize] & bit != 0 {
                            for role in 0..2 {
                                choices[role] = choices[role].min(weights[id as usize][role]);
                            }
                        }
                    }
                    let previous = states;
                    for count in 0..needed {
                        for used_leader in 0..2 {
                            if previous[count][used_leader] == f64::INFINITY {
                                continue;
                            }
                            for role in 0..(2 - used_leader) {
                                if choices[role] != f64::INFINITY {
                                    states[count + 1][used_leader + role] =
                                        states[count + 1][used_leader + role].min(add_down(
                                            previous[count][used_leader],
                                            choices[role],
                                        )?);
                                }
                            }
                        }
                    }
                }
                Ok::<_, UpperBoundFailure>(
                    (states[needed][1] != f64::INFINITY).then_some(states[needed][1]),
                )
            };
            let scale = (remaining_coefficient / remaining_parameter).sqrt();
            let scale = if scale.is_finite() && scale > 0.0 {
                scale
            } else {
                1.0
            };
            let mut best = None::<(f64, f64, Option<f64>, Vec<[f64; 2]>)>;
            for factor in WEIGHT_FACTORS {
                let t = scale * factor;
                let mut weights = vec![[0.0; 2]; owners.len()];
                for &id in &remaining_ids {
                    let id = id as usize;
                    let regular = add_up(
                        mul_up(t, self.parameters[id])?,
                        div_up(coefficients[id][0], t)?,
                    )?;
                    weights[id] = [regular, add_up(regular, div_up(coefficients[id][1], t)?)?];
                }
                let fixed_leader_weight =
                    fixed_leader.map(|leader| div_up(leader, t)).transpose()?;
                let Some(maximum) = maximum_support(&weights, fixed_leader_weight)? else {
                    return Ok(None);
                };
                let Some(minimum) = minimum_support(&weights, fixed_leader_weight)? else {
                    return Ok(None);
                };
                let minimum = mul_down(t, minimum_remaining_parameter)?.max(minimum);
                // For L<=A=t*Pr+Kr/t<=M, the interval secant gives
                // Pr*Kr<=A²/4<=((L+M)A-LM)/4. Directed endpoints keep the
                // joint weights nonnegative; the constant offset is subtracted
                // only after the maximizing allocation has been found.
                let slope = div_up(add_up(maximum, minimum)?, 4.0)?;
                let offset = mul_down(mul_down(maximum, minimum)?, 0.25)?;
                for &id in &remaining_ids {
                    let id = id as usize;
                    for (weight, &linear) in weights[id].iter_mut().zip(&result.cards[id][slot]) {
                        *weight = add_up(linear, mul_up(slope, *weight)?)?;
                    }
                }
                let leader = fixed_leader_linear
                    .zip(fixed_leader_weight)
                    .map(|(linear, weight)| add_up(linear, mul_up(slope, weight)?))
                    .transpose()?;
                let Some(linear_maximum) = maximum_support(&weights, leader)? else {
                    return Ok(None);
                };
                let upper = sub_up(add_up(constant, linear_maximum)?, offset)?;
                // M alone omits the known/linear terms and cannot rank these
                // different envelopes. Compare their final single-team bounds.
                if best.as_ref().is_none_or(|previous| upper < previous.0) {
                    best = Some((upper, offset, leader, weights));
                }
            }
            let (_, offset, leader, weights) = best.unwrap();
            result.offset = add_down(result.offset, offset)?;
            result.fixed_leaders[slot] = leader;
            for &id in &remaining_ids {
                result.cards[id as usize][slot] = weights[id as usize];
            }
        }
        Ok(Some(result))
    }

    fn check_parameter_range(&self, parameter: f64, slot: usize) -> Result<(), UpperBoundFailure> {
        let song = &self.model.songs[slot];
        checked_finite(parameter * song.coefficient)?;
        let range_upper = mul_up(
            mul_up(parameter, song.maximum_alpha)?,
            self.model.maximum_multiplier,
        )?;
        if range_upper.floor() > f64::from(u32::MAX) {
            return Err(UpperBoundFailure::Unknown);
        }
        Ok(())
    }

    pub(crate) fn new(
        model: &'a FastScoreModel<'a>,
        configuration: &'a AreaItemConfigurationV1,
    ) -> Result<Self, UpperBoundFailure> {
        let operations = (configuration.selected_area_item_ids.len() as u128)
            .checked_mul(16)
            .and_then(|count| count.checked_add(12))
            .ok_or(UpperBoundFailure::Unknown)?;
        let parameter_factor = rounding_factor(operations)?;
        let input = model.input;
        let mut parameters = vec![0.0; input.cards.len()];
        for card in input.cards.iter().filter(|card| !card.is_excluded) {
            // The already-rounded card/event sums and area products are the
            // exact scorer's atoms. Its remaining tree has at most 12+16*m
            // nonnegative additions, regardless of member/leader ordering.
            // Subnormal additions are exact multiples of 2^-1074; otherwise
            // gamma_R covers rounding. Distribute that factor over card sums.
            let card_power = checked_finite(
                (card.character_parameter[0] + card.character_parameter[1])
                    + card.character_parameter[2],
            )?;
            let event_power = checked_finite(
                (card.event_parameter[0] + card.event_parameter[1]) + card.event_parameter[2],
            )?;
            let mut atoms = add_up(card_power, event_power)?;
            for area_item_id in &configuration.selected_area_item_ids {
                let item = input
                    .area_items
                    .iter()
                    .find(|item| item.area_item_id == *area_item_id)
                    .ok_or(UpperBoundFailure::Unknown)?;
                if item.target_band_ids.contains(&card.band_id)
                    && item.target_attributes.contains(&card.attribute)
                {
                    for index in 0..3 {
                        let atom = checked_finite(
                            card.character_parameter[index] * item.parameter_rates[index],
                        )?;
                        atoms = add_up(atoms, atom)?;
                    }
                }
            }
            parameters[card.instance_id as usize] = mul_up(atoms, parameter_factor)?;
        }

        let mut weighted_contexts = Vec::new();
        for context in model.contexts.iter().copied() {
            let mut characters = vec![false; model.character_count];
            let mut maximum_parameter = 0.0_f64;
            let mut maximum_first = [0.0_f64; 3];
            let mut maximum_leader = [0.0_f64; 3];
            for card in input
                .cards
                .iter()
                .filter(|card| !card.is_excluded && context.accepts(card))
            {
                let index = card.instance_id as usize;
                characters[model.character_indexes[index]] = true;
                maximum_parameter = maximum_parameter.max(parameters[index]);
                for slot in 0..3 {
                    let coefficient = model.contributions[index][context.skill_index()][slot];
                    maximum_first[slot] = maximum_first[slot].max(coefficient.first_five);
                    maximum_leader[slot] = maximum_leader[slot].max(coefficient.leader);
                }
            }
            if characters.iter().filter(|available| **available).count() < 5 {
                continue;
            }
            let scales = std::array::from_fn(|slot| {
                // Scales only choose among valid AM-GM inequalities. They need
                // not be upward estimates and are never pruning thresholds.
                let p = maximum_parameter * 5.0;
                let k = model.songs[slot].base + 5.0 * maximum_first[slot] + maximum_leader[slot];
                let scale = (k / p).sqrt();
                if scale.is_finite() && scale > 0.0 {
                    scale
                } else {
                    1.0
                }
            });
            weighted_contexts.push(ContextWeights {
                context,
                scales,
                groups: Vec::new(),
            });
        }
        let mut weights = vec![[[[[0.0; 2]; 3]; 3]; 4]; input.cards.len()];
        let mut lists = Vec::new();
        let mut card_list_starts = vec![[usize::MAX; 4]; input.cards.len()];
        let mut by_character = vec![Vec::new(); model.character_count];
        for card in input.cards.iter().filter(|card| !card.is_excluded) {
            by_character[model.character_indexes[card.instance_id as usize]].push(card.instance_id);
        }
        for ids in &by_character {
            let mut ids = ids.clone();
            ids.sort_unstable_by(|left, right| {
                parameters[*right as usize]
                    .total_cmp(&parameters[*left as usize])
                    .then(left.cmp(right))
            });
            lists.push(RankedCards { ids, head: 0 });
        }
        for weighted in &mut weighted_contexts {
            let context = weighted.context;
            let context_index = context.skill_index();
            for (character, ids) in by_character.iter().enumerate() {
                let ids = ids
                    .iter()
                    .copied()
                    .filter(|id| context.accepts(&input.cards[*id as usize]))
                    .collect::<Vec<_>>();
                if ids.is_empty() {
                    continue;
                }
                let start = lists.len();
                weighted.groups.push((character, start));
                for &id in &ids {
                    card_list_starts[id as usize][context_index] = start;
                    for (song, song_weights) in
                        weights[id as usize][context_index].iter_mut().enumerate()
                    {
                        let coefficient = model.contributions[id as usize][context_index][song];
                        for (weight, factor) in WEIGHT_FACTORS.into_iter().enumerate() {
                            let scale = weighted.scales[song] * factor;
                            let regular = add_up(
                                mul_up(scale, parameters[id as usize])?,
                                div_up(coefficient.first_five, scale)?,
                            )?;
                            song_weights[weight] = [
                                regular,
                                add_up(regular, div_up(coefficient.leader, scale)?)?,
                            ];
                        }
                    }
                }
                for (song, _) in model.songs.iter().enumerate() {
                    for (weight, _) in WEIGHT_FACTORS.iter().enumerate() {
                        for role in [0, 1] {
                            let mut ordered = ids.clone();
                            ordered.sort_unstable_by(|left, right| {
                                weights[*right as usize][context_index][song][weight][role]
                                    .total_cmp(
                                        &weights[*left as usize][context_index][song][weight][role],
                                    )
                                    .then(left.cmp(right))
                            });
                            lists.push(RankedCards {
                                ids: ordered,
                                head: 0,
                            });
                        }
                    }
                }
            }
        }
        Ok(Self {
            model,
            configuration,
            parameters,
            contexts: weighted_contexts,
            weights,
            lists,
            card_list_starts,
            undo: Vec::new(),
        })
    }

    pub(crate) fn checkpoint(&self) -> usize {
        self.undo.len()
    }

    pub(crate) fn remove(&mut self, id: u32, available: &[bool]) {
        #[cfg(test)]
        let previous_capacity = self.undo.capacity();
        let character = self.model.character_indexes[id as usize];
        self.advance_head(character, available);
        for start in self.card_list_starts[id as usize] {
            if start != usize::MAX {
                for list in start..start + 18 {
                    self.advance_head(list, available);
                }
            }
        }
        #[cfg(test)]
        if previous_capacity != self.undo.capacity() {
            crate::profiling::bound_storage(self.storage_bytes());
        }
    }

    fn advance_head(&mut self, index: usize, available: &[bool]) {
        let list = &mut self.lists[index];
        let previous = list.head;
        while list.head < list.ids.len() && !available[list.ids[list.head] as usize] {
            list.head += 1;
        }
        if previous != list.head {
            self.undo.push((index, previous));
        }
    }

    pub(crate) fn restore(&mut self, checkpoint: usize) {
        while self.undo.len() > checkpoint {
            let (index, head) = self.undo.pop().unwrap();
            self.lists[index].head = head;
        }
    }

    fn head(&self, index: usize) -> Option<u32> {
        let list = &self.lists[index];
        list.ids.get(list.head).copied()
    }

    /// A cheap replacement penalty for branch ordering only. It is not a bound:
    /// the actual team may change characters or whole-team skill context.
    pub(crate) fn replacement_loss(&self, id: u32, song: usize, available: &[bool]) -> f64 {
        let mut loss = 0.0_f64;
        for (context, start) in self.card_list_starts[id as usize].into_iter().enumerate() {
            if start == usize::MAX {
                continue;
            }
            for role in [0, 1] {
                let list = &self.lists[start + song * 6 + 2 + role];
                if list.ids.get(list.head) != Some(&id) {
                    continue;
                }
                let next = list.ids[list.head + 1..]
                    .iter()
                    .copied()
                    .find(|other| available[*other as usize]);
                let value = self.weights[id as usize][context][song][1][role];
                let alternative = next.map_or(0.0, |other| {
                    self.weights[other as usize][context][song][1][role]
                });
                loss = loss.max(value - alternative);
            }
        }
        loss
    }

    #[cfg(test)]
    pub(crate) fn storage_bytes(&self) -> usize {
        use std::mem::size_of;
        self.parameters.capacity() * size_of::<f64>()
            + self.contexts.capacity() * size_of::<ContextWeights>()
            + self
                .contexts
                .iter()
                .map(|context| context.groups.capacity() * size_of::<(usize, usize)>())
                .sum::<usize>()
            + self.weights.capacity() * size_of::<[[[[f64; 2]; 3]; 3]; 4]>()
            + self.lists.capacity() * size_of::<RankedCards>()
            + self
                .lists
                .iter()
                .map(|list| list.ids.capacity() * size_of::<u32>())
                .sum::<usize>()
            + self.card_list_starts.capacity() * size_of::<[usize; 4]>()
            + self.undo.capacity() * size_of::<(usize, usize)>()
    }

    fn selected_characters(&self, selected: &[u32]) -> Result<Vec<usize>, UpperBoundFailure> {
        if selected.len() > 5 {
            return Err(UpperBoundFailure::Unknown);
        }
        let mut characters = Vec::with_capacity(5);
        for id in selected {
            let card = self
                .model
                .input
                .cards
                .get(*id as usize)
                .ok_or(UpperBoundFailure::Unknown)?;
            let character = self.model.character_indexes[*id as usize];
            if card.is_excluded || characters.contains(&character) {
                return Err(UpperBoundFailure::Unknown);
            }
            characters.push(character);
        }
        Ok(characters)
    }

    fn maximum_parameter(
        &self,
        selected: &[u32],
        next_group: usize,
        selected_characters: &[usize],
    ) -> Result<f64, UpperBoundFailure> {
        let mut result = 0.0;
        for id in selected {
            result = add_up(result, self.parameters[*id as usize])?;
        }
        if selected.len() == 5 {
            return Ok(result);
        }
        let mut largest = (next_group..self.model.character_count)
            .filter(|character| !selected_characters.contains(character))
            .filter_map(|character| self.head(character))
            .map(|id| self.parameters[id as usize])
            .collect::<Vec<_>>();
        largest.sort_unstable_by(|left, right| right.total_cmp(left));
        if largest.len() < 5 - selected.len() {
            return Err(UpperBoundFailure::Unknown);
        }
        for value in largest.into_iter().take(5 - selected.len()) {
            result = add_up(result, value)?;
        }
        Ok(result)
    }

    fn support(
        &self,
        selected: &[u32],
        next_group: usize,
        selected_characters: &[usize],
        song_slot: usize,
        weighted: &ContextWeights,
        weight: usize,
    ) -> Result<Option<Support>, UpperBoundFailure> {
        let context = weighted.context;
        let scale = weighted.scales[song_slot] * WEIGHT_FACTORS[weight];
        let mut fixed = Support {
            value: div_up(self.model.songs[song_slot].base, scale)?,
            members: [0; 5],
        };
        let mut fixed_leader = None::<f64>;
        let coefficient_index = context.skill_index();
        for (position, id) in selected.iter().copied().enumerate() {
            if !context.accepts(&self.model.input.cards[id as usize]) {
                return Ok(None);
            }
            let coefficient = self.model.contributions[id as usize][coefficient_index][song_slot];
            let value = self.weights[id as usize][coefficient_index][song_slot][weight][0];
            fixed.value = add_up(fixed.value, value)?;
            fixed.members[position] = id;
            let leader = div_up(coefficient.leader, scale)?;
            fixed_leader = Some(fixed_leader.map_or(leader, |previous| previous.max(leader)));
        }

        // A character contributes at most one card. For a fixed positive scale,
        // only its best regular-card and best leader-card weights are needed.
        let required = 5 - selected.len();
        let mut states = [[None::<Support>; 2]; 6];
        states[0][0] = Some(fixed);
        if let Some(leader) = fixed_leader {
            states[0][1] = Some(Support {
                value: add_up(fixed.value, leader)?,
                ..fixed
            });
        }
        if required == 0 {
            #[cfg(test)]
            crate::profiling::support_pass(0);
            return Ok(states[0][1]);
        }
        #[cfg(test)]
        let mut head_count = 0;
        for &(character, start) in &weighted.groups {
            if character < next_group || selected_characters.contains(&character) {
                continue;
            }
            #[cfg(test)]
            {
                head_count += 2;
            }
            let group = std::array::from_fn::<_, 2, _>(|role| {
                self.head(start + song_slot * 6 + weight * 2 + role)
                    .map(|id| Choice {
                        value: self.weights[id as usize][coefficient_index][song_slot][weight]
                            [role],
                        instance_id: id,
                    })
            });
            let previous = states;
            for count in 0..required {
                for used_leader in 0..2 {
                    let Some(state) = previous[count][used_leader] else {
                        continue;
                    };
                    for (as_leader, choice) in group.iter().copied().enumerate() {
                        if used_leader + as_leader > 1 {
                            continue;
                        }
                        let Some(choice) = choice else {
                            continue;
                        };
                        let mut candidate = state;
                        candidate.value = add_up(candidate.value, choice.value)?;
                        candidate.members[selected.len() + count] = choice.instance_id;
                        retain_support(&mut states[count + 1][used_leader + as_leader], candidate);
                    }
                }
            }
        }
        #[cfg(test)]
        crate::profiling::support_pass(head_count);
        Ok(states[required][1])
    }

    pub(crate) fn team_upper(
        &self,
        selected: &[u32],
        next_group: usize,
        song_slot: usize,
    ) -> Result<TeamUpper, UpperBoundFailure> {
        let song = self
            .model
            .songs
            .get(song_slot)
            .ok_or(UpperBoundFailure::Unknown)?;
        let characters = self.selected_characters(selected)?;
        let parameter = self.maximum_parameter(selected, next_group, &characters)?;

        // The three base multiplications are covered by gamma_3. A subnormal
        // intermediate cannot reach an integer score of one. Each independent
        // skill multiplication is covered by skill_delta, not joint addition.
        // Use the whole family's parameter maximum to prove per-window u32 safety.
        self.check_parameter_range(parameter, song_slot)?;
        let (upper, members) = if let Ok(members) = <[u32; 5]>::try_from(selected) {
            // With all five cards fixed, P*K is already a bound. No weighted
            // maximization or relaxation of the actual team context is needed.
            let cards = members.map(|id| &self.model.input.cards[id as usize]);
            let same_band = cards.iter().all(|card| card.band_id == cards[0].band_id);
            let same_attribute = cards
                .iter()
                .all(|card| card.attribute == cards[0].attribute);
            let context = usize::from(same_band) + 2 * usize::from(same_attribute);
            let mut coefficient = song.base;
            let mut leader = 0.0_f64;
            for id in members {
                let contribution = self.model.contributions[id as usize][context][song_slot];
                coefficient = add_up(coefficient, contribution.first_five)?;
                leader = leader.max(contribution.leader);
            }
            (mul_up(parameter, add_up(coefficient, leader)?)?, members)
        } else {
            let mut family_upper = None::<(f64, [u32; 5])>;
            for weighted in &self.contexts {
                let mut context_upper = None::<(f64, [u32; 5])>;
                for weight in 0..3 {
                    let Some(support) = self.support(
                        selected,
                        next_group,
                        &characters,
                        song_slot,
                        weighted,
                        weight,
                    )?
                    else {
                        continue;
                    };
                    let upper = div_up(mul_up(support.value, support.value)?, 4.0)?;
                    if context_upper.is_none_or(|previous| upper < previous.0) {
                        context_upper = Some((upper, support.members));
                    }
                }
                if let Some(upper) = context_upper
                    && family_upper.is_none_or(|previous| upper.0 > previous.0)
                {
                    family_upper = Some(upper);
                }
            }
            // Each actual team occurs in its actual context. Cases without a
            // band or attribute equality can only enlarge the completion set.
            family_upper.ok_or(UpperBoundFailure::Unknown)?
        };
        let path_ceiling = upper.ceil();
        if path_ceiling >= (1_u128 << 64) as f64 {
            return Err(UpperBoundFailure::Unknown);
        }
        Ok(TeamUpper {
            score: reference_ceiling(path_ceiling as u128)?,
            members: Some(members),
        })
    }

    /// A full-team, actual-context estimate for ordering only, never a proof.
    pub(crate) fn estimate_team(&self, mut member_ids: [u32; 5], song_slot: usize) -> f64 {
        if song_slot >= 3 || self.selected_characters(&member_ids).is_err() {
            return f64::NEG_INFINITY;
        }
        member_ids.sort_unstable();
        let cards = member_ids.map(|id| &self.model.input.cards[id as usize]);
        let same_band = cards.iter().all(|card| card.band_id == cards[0].band_id);
        let same_attribute = cards
            .iter()
            .all(|card| card.attribute == cards[0].attribute);
        let index = usize::from(same_band) + 2 * usize::from(same_attribute);
        let mut coefficient = self.model.songs[song_slot].base;
        for id in member_ids {
            coefficient += self.model.contributions[id as usize][index][song_slot].first_five;
        }
        let mut best = f64::NEG_INFINITY;
        for leader in member_ids {
            let Some(parameters) =
                member_order_for_leader(member_ids, leader)
                    .ok()
                    .and_then(|order| {
                        calculate_team_parameters(
                            &self.model.input.cards,
                            &self.model.input.area_items,
                            self.configuration,
                            order,
                        )
                        .ok()
                    })
            else {
                continue;
            };
            let leader_coefficient =
                self.model.contributions[leader as usize][index][song_slot].leader;
            let estimate = parameters.deck_total_parameter * (coefficient + leader_coefficient);
            if estimate.is_finite() {
                best = best.max(estimate);
            }
        }
        best
    }

    /// Several complete legal sets suggested by the same additive supports.
    /// A missing suggestion says nothing about feasibility or optimality.
    pub(crate) fn propose_team(
        &self,
        selected: &[u32],
        next_group: usize,
        song_slot: usize,
        rank: usize,
    ) -> Option<[u32; 5]> {
        #[cfg(test)]
        let _timing = crate::profiling::enter(crate::profiling::Phase::Proposals);
        if song_slot >= 3 {
            return None;
        }
        let characters = self.selected_characters(selected).ok()?;
        let mut candidates = Vec::<([u32; 5], f64)>::new();
        for weighted in &self.contexts {
            for weight in 0..3 {
                let Some(mut support) = self
                    .support(
                        selected,
                        next_group,
                        &characters,
                        song_slot,
                        weighted,
                        weight,
                    )
                    .ok()
                    .flatten()
                else {
                    continue;
                };
                support.members.sort_unstable();
                if candidates
                    .iter()
                    .any(|candidate| candidate.0 == support.members)
                {
                    continue;
                }
                let estimate = self.estimate_team(support.members, song_slot);
                if estimate.is_finite() {
                    candidates.push((support.members, estimate));
                }
            }
        }
        candidates.sort_by(|left, right| right.1.total_cmp(&left.1).then(left.0.cmp(&right.0)));
        candidates.get(rank).map(|candidate| candidate.0)
    }
}

#[cfg(test)]
mod tests {
    use bandori_medley_model::{
        ExactProbabilityV1, FixedMedleyEvaluationInputV1, ScoringNoteV1, SkillBehaviorV1,
    };
    use bandori_medley_reference::evaluate_fixed_medley;

    use super::*;
    use crate::{SEARCH_INPUT_SCHEMA_VERSION, SearchAreaItemV1, SearchCardSkillContextsV1};

    const FIXED_FIXTURE: &str =
        include_str!("../../bandori-medley-model/tests/fixtures/valid-fixed-medley-v1.json");

    fn fixture() -> MedleySearchInputV1 {
        let fixed: FixedMedleyEvaluationInputV1 = serde_json::from_str(FIXED_FIXTURE).unwrap();
        let cards = (0_u32..8)
            .map(|id| {
                let make_skill = |context: usize| {
                    let rate = 50.0 + f64::from(8 - id) * 4.5 + context as f64 * 9.25;
                    ResolvedScoreSkillV1 {
                        master_skill_id: id + 1,
                        skill_level: 1,
                        duration_seconds: 2.0,
                        behavior: match id {
                            1 => SkillBehaviorV1::ContinuedPerfect {
                                active_score_up_percent: rate,
                                fallback_score_up_percent: rate * 0.4,
                            },
                            2 => SkillBehaviorV1::PerfectOnly {
                                score_up_percent: rate,
                            },
                            3 => SkillBehaviorV1::GreatOrWorseHalf {
                                score_up_percent: rate,
                            },
                            4 => SkillBehaviorV1::ScoreOnPerfect {
                                score_up_percent: rate,
                            },
                            _ => SkillBehaviorV1::Score {
                                score_up_percent: rate,
                            },
                        },
                        is_rate_up_with_perfect: id == 0,
                    }
                };
                SearchCardV1 {
                    instance_id: id,
                    master_card_id: id + 1,
                    character_id: id % 5 + 1,
                    band_id: if id >= 6 { 2 } else { 1 },
                    attribute: if id == 5 || id == 7 {
                        CardAttributeV1::Happy
                    } else {
                        CardAttributeV1::Powerful
                    },
                    is_excluded: false,
                    character_parameter: [1234.125 + f64::from(id) * 301.75, 875.2, 622.45],
                    event_parameter: [21.025, 7.375, 1.2],
                    skill_contexts: SearchCardSkillContextsV1 {
                        mixed: make_skill(0),
                        same_band: make_skill(1),
                        same_attribute: make_skill(2),
                        same_band_and_attribute: make_skill(3),
                    },
                }
            })
            .collect();
        let mut songs = fixed.songs;
        for song in &mut songs {
            let boundary = 2.0_f64;
            song.notes
                .extend(
                    [0.0, boundary, boundary.next_up()]
                        .into_iter()
                        .map(|time_seconds| ScoringNoteV1 {
                            note_id: 0,
                            time_seconds,
                            is_skill_trigger: false,
                        }),
                );
            song.notes.sort_by(|left, right| {
                left.time_seconds
                    .total_cmp(&right.time_seconds)
                    .then(right.is_skill_trigger.cmp(&left.is_skill_trigger))
            });
            for (id, note) in song.notes.iter_mut().enumerate() {
                note.note_id = id as u32;
            }
        }
        MedleySearchInputV1 {
            schema_version: SEARCH_INPUT_SCHEMA_VERSION.to_owned(),
            scoring_rules_version: fixed.scoring_rules_version,
            perfect_rate: ExactProbabilityV1 {
                numerator: 91,
                decimal_scale: 2,
            },
            cards,
            area_items: vec![SearchAreaItemV1 {
                area_item_id: 1,
                target_band_ids: vec![1],
                target_attributes: vec![CardAttributeV1::Powerful],
                parameter_rates: [0.15, 0.3, 0.075],
            }],
            area_configurations: vec![AreaItemConfigurationV1 {
                selected_area_item_ids: vec![1],
            }],
            songs,
        }
    }

    fn reference_scores(input: &MedleySearchInputV1, set: [u32; 5], leader: u32) -> [f64; 3] {
        let mut fixed: FixedMedleyEvaluationInputV1 = serde_json::from_str(FIXED_FIXTURE).unwrap();
        fixed.perfect_rate = input.perfect_rate;
        fixed.songs = input.songs.clone();
        let order = member_order_for_leader(set, leader).unwrap();
        let cards = order.map(|id| input.cards[id as usize]);
        let same_band = cards.iter().all(|card| card.band_id == cards[0].band_id);
        let same_attribute = cards
            .iter()
            .all(|card| card.attribute == cards[0].attribute);
        let context = usize::from(same_band) + 2 * usize::from(same_attribute);
        let parameter = calculate_team_parameters(
            &input.cards,
            &input.area_items,
            &input.area_configurations[0],
            order,
        )
        .unwrap();
        // Separate fixture instances let the fixed-medley reference validate all
        // three song slots without relaxing its cross-song physical-card rule.
        for slot in 0..3 {
            fixed.teams[slot].deck_total_parameter = parameter.deck_total_parameter;
            for (position, card) in cards.iter().enumerate() {
                fixed.cards[slot * 5 + position].character_id = card.character_id;
                fixed.cards[slot * 5 + position].skill = contexts(card)[context];
            }
        }
        let trace = evaluate_fixed_medley(&fixed).unwrap();
        std::array::from_fn(|slot| trace.songs[slot].average_score())
    }

    fn three_pool_fixture() -> (MedleySearchInputV1, u32) {
        let mut input = fixture();
        let cards = input.cards.clone();
        let pool_size = cards.len() as u32;
        for copy in 1..3 {
            input.cards.extend(cards.iter().map(|card| SearchCardV1 {
                instance_id: card.instance_id + copy * pool_size,
                master_card_id: card.master_card_id + copy * pool_size,
                ..*card
            }));
        }
        input.validate().unwrap();
        (input, pool_size)
    }

    #[test]
    fn every_tiny_completion_and_leader_replays_below_partial_and_complete_uppers() {
        // Three disjoint physical pools exercise fixed joint members without
        // introducing cross-team card conflicts.
        let (input, pool_size) = three_pool_fixture();
        let model = FastScoreModel::new(&input).unwrap();
        let engine = FastUpperBoundEngine::new(&model, &input.area_configurations[0]).unwrap();
        let mut groups = vec![Vec::new(); model.character_count];
        for card in &input.cards {
            groups[model.character_indexes[card.instance_id as usize]].push(card.instance_id);
        }
        let roots: [f64; 3] =
            std::array::from_fn(|slot| engine.team_upper(&[], 0, slot).unwrap().score);
        for first in [0, 5] {
            for second in [1, 6] {
                for third in [2, 7] {
                    let mut set = [first, second, third, 3, 4];
                    set.sort_unstable();
                    let complete: [f64; 3] =
                        std::array::from_fn(|slot| engine.team_upper(&set, 0, slot).unwrap().score);
                    let partial: [f64; 3] = std::array::from_fn(|slot| {
                        engine.team_upper(&[first, second], 0, slot).unwrap().score
                    });
                    let exact_by_leader = set.map(|leader| {
                        let exact = reference_scores(&input, set, leader);
                        for slot in 0..3 {
                            assert!(exact[slot] <= roots[slot]);
                            assert!(exact[slot] <= partial[slot]);
                            assert!(exact[slot] <= complete[slot]);
                        }
                        exact
                    });
                    for fixed_count in 0..=5 {
                        let mut owners = input
                            .cards
                            .iter()
                            .map(|card| {
                                crate::joint_upper::UNUSED | (1 << (card.instance_id / pool_size))
                            })
                            .collect::<Vec<_>>();
                        for slot in 0..3 {
                            for &id in &set[..fixed_count] {
                                owners[(id + slot as u32 * pool_size) as usize] = 1 << slot;
                            }
                        }
                        let joint = engine
                            .joint_weights(&owners, &groups, [None; 3])
                            .unwrap()
                            .unwrap();
                        for (leader, exact) in set.into_iter().zip(exact_by_leader) {
                            let mut upper = joint.constant;
                            for slot in 0..3 {
                                for &id in &set[fixed_count..] {
                                    let role = usize::from(id == leader);
                                    upper = add_up(
                                        upper,
                                        joint.cards[(id + slot as u32 * pool_size) as usize][slot]
                                            [role],
                                    )
                                    .unwrap();
                                }
                                if fixed_count < 5 && set[..fixed_count].contains(&leader) {
                                    upper =
                                        add_up(upper, joint.fixed_leaders[slot].unwrap()).unwrap();
                                }
                            }
                            let upper = mul_up(
                                sub_up(upper, joint.offset).unwrap(),
                                rounding_factor(4).unwrap(),
                            )
                            .unwrap();
                            assert!((exact[0] + exact[1]) + exact[2] <= upper);
                        }
                        if fixed_count == 5 {
                            let scores = std::array::from_fn(|slot| {
                                Some(
                                    exact_by_leader
                                        .iter()
                                        .map(|scores| scores[slot])
                                        .fold(f64::NEG_INFINITY, f64::max),
                                )
                            });
                            let joint = engine
                                .joint_weights(&owners, &groups, scores)
                                .unwrap()
                                .unwrap();
                            assert!(
                                joint.constant
                                    >= (scores[0].unwrap() + scores[1].unwrap())
                                        + scores[2].unwrap()
                            );
                            assert_eq!(joint.fixed_leaders, [None; 3]);
                            assert!(
                                joint
                                    .cards
                                    .iter()
                                    .flatten()
                                    .flatten()
                                    .all(|weight| *weight == 0.0)
                            );
                        }
                    }
                }
            }
        }
        let best = engine.propose_team(&[0], 0, 0, 0).unwrap();
        assert!(best.contains(&0));
        let mut rank = 1;
        while let Some(next) = engine.propose_team(&[0], 0, 0, rank) {
            assert!(next.contains(&0));
            assert!(engine.estimate_team(best, 0) >= engine.estimate_team(next, 0));
            rank += 1;
        }
    }

    #[test]
    fn real_interval_offset_remains_safe_after_incremental_owner_removal() {
        use crate::SearchControl;
        use crate::candidate::evaluate_candidate;
        use crate::exact_score::PreparedSong;
        use crate::joint_upper::{JointLayoutCache, UNUSED};

        let (input, pool_size) = three_pool_fixture();
        let model = FastScoreModel::new(&input).unwrap();
        let engine = FastUpperBoundEngine::new(&model, &input.area_configurations[0]).unwrap();
        let mut groups = vec![Vec::new(); model.character_count];
        for card in &input.cards {
            groups[model.character_indexes[card.instance_id as usize]].push(card.instance_id);
        }
        let mut owners = input
            .cards
            .iter()
            .map(|card| UNUSED | (1 << (card.instance_id / pool_size)))
            .collect::<Vec<_>>();
        assert!(
            engine
                .joint_weights(&owners, &groups, [None; 3])
                .unwrap()
                .unwrap()
                .offset
                > 0.0
        );

        let mut never_stop = || None;
        let mut control = SearchControl::new(1024 * 1024, &mut never_stop);
        let mut layouts = JointLayoutCache::new();
        let required_teams = vec![0; groups.len()];
        let parent = layouts
            .calculate(
                &engine,
                &groups,
                (&owners, &required_teams, [None; 3]),
                None,
                None,
                &mut control,
            )
            .unwrap()
            .unwrap();
        owners[0] &= !1;
        let updated = layouts
            .calculate(
                &engine,
                &groups,
                (&owners, &required_teams, [None; 3]),
                Some(&parent),
                None,
                &mut control,
            )
            .unwrap()
            .unwrap();

        let perfect_rate = exact_probability_to_f64(input.perfect_rate);
        let starts = [
            0,
            input.songs[0].notes.len() as u32,
            (input.songs[0].notes.len() + input.songs[1].notes.len()) as u32,
        ];
        let songs = std::array::from_fn(|slot| {
            PreparedSong::new(&input.songs[slot], starts[slot], perfect_rate).unwrap()
        });
        let candidates: [Vec<_>; 3] = std::array::from_fn(|slot| {
            (0_u32..8)
                .filter_map(|choices| {
                    let base = slot as u32 * pool_size;
                    let members = [
                        base + if choices & 1 == 0 { 0 } else { 5 },
                        base + if choices & 2 == 0 { 1 } else { 6 },
                        base + if choices & 4 == 0 { 2 } else { 7 },
                        base + 3,
                        base + 4,
                    ];
                    members
                        .iter()
                        .all(|&id| owners[id as usize] & (1 << slot) != 0)
                        .then(|| {
                            evaluate_candidate(
                                &input,
                                &input.area_configurations[0],
                                members,
                                &songs,
                            )
                            .unwrap()
                        })
                })
                .collect()
        });
        let mut whole = f64::NEG_INFINITY;
        let mut conditional = vec![[f64::NEG_INFINITY; 4]; input.cards.len()];
        for zero in &candidates[0] {
            for one in &candidates[1] {
                for two in &candidates[2] {
                    let rows = [zero, one, two];
                    let total = (zero.song_scores[0] + one.song_scores[1]) + two.song_scores[2];
                    whole = whole.max(total);
                    for (id, values) in conditional.iter_mut().enumerate() {
                        let owner = rows
                            .iter()
                            .position(|row| row.member_instance_ids.contains(&(id as u32)))
                            .unwrap_or(3);
                        values[owner] = values[owner].max(total);
                    }
                }
            }
        }
        assert!(whole <= updated.score);
        for (id, values) in conditional.iter().enumerate() {
            for (owner, &exact) in values.iter().enumerate() {
                if exact.is_finite() && owners[id] & (1 << owner) != 0 {
                    assert!(
                        exact <= updated.destinations[id][owner],
                        "id={id}, owner={owner}"
                    );
                }
            }
        }
    }

    #[test]
    fn ordered_heads_match_available_cards_and_restore_the_original_bounds() {
        let input = fixture();
        let model = FastScoreModel::new(&input).unwrap();
        let mut engine = FastUpperBoundEngine::new(&model, &input.area_configurations[0]).unwrap();
        let baseline =
            std::array::from_fn::<_, 3, _>(|slot| engine.team_upper(&[], 0, slot).unwrap());
        let mut available = vec![true; input.cards.len()];
        let assert_heads = |engine: &FastUpperBoundEngine<'_>, available: &[bool]| {
            for (index, list) in engine.lists.iter().enumerate() {
                assert_eq!(
                    engine.head(index),
                    list.ids.iter().copied().find(|id| available[*id as usize])
                );
            }
        };
        for first in 0..input.cards.len() {
            available[first] = false;
            engine.remove(first as u32, &available);
            let checkpoint = engine.checkpoint();
            assert_heads(&engine, &available);
            for second in 0..input.cards.len() {
                if second == first {
                    continue;
                }
                available[second] = false;
                engine.remove(second as u32, &available);
                assert_heads(&engine, &available);
                engine.restore(checkpoint);
                available[second] = true;
                assert_heads(&engine, &available);
            }
            engine.restore(0);
            available[first] = true;
            assert_heads(&engine, &available);
            assert_eq!(
                std::array::from_fn::<_, 3, _>(|slot| engine.team_upper(&[], 0, slot).unwrap()),
                baseline
            );
        }
    }

    #[test]
    fn reference_rounding_boundaries_and_unknown_note_overflow_are_preserved() {
        // Ten notes and the third slot's 1.01 combo give a largest-note rate
        // of 5*1.2/10*3*1.1*1.01 per identical card parameter. A raw result a
        // quarter unit above u32::MAX still has a legal final floor.
        let last_valid_parameter = (f64::from(u32::MAX) + 0.25) / 1.9998;
        for parameter in [
            0.0,
            f64::from_bits(1),
            30.24,
            1_000_000_000.0,
            last_valid_parameter,
            4_000_000_000.0,
        ] {
            let mut input = fixture();
            input.area_configurations[0].selected_area_item_ids.clear();
            input.perfect_rate = ExactProbabilityV1 {
                numerator: 1,
                decimal_scale: 0,
            };
            for card in &mut input.cards {
                card.character_parameter = [parameter, 0.0, 0.0];
                card.event_parameter = [0.0; 3];
                for skill in [
                    &mut card.skill_contexts.mixed,
                    &mut card.skill_contexts.same_band,
                    &mut card.skill_contexts.same_attribute,
                    &mut card.skill_contexts.same_band_and_attribute,
                ] {
                    skill.behavior = SkillBehaviorV1::Neutral;
                    skill.is_rate_up_with_perfect = false;
                }
            }
            input.validate().unwrap();
            let model = FastScoreModel::new(&input).unwrap();
            let engine = FastUpperBoundEngine::new(&model, &input.area_configurations[0]).unwrap();
            let mut groups = vec![Vec::new(); model.character_count];
            for card in &input.cards {
                groups[model.character_indexes[card.instance_id as usize]].push(card.instance_id);
            }
            let joint = engine.joint_weights(
                &vec![crate::joint_upper::ALL_OWNERS; input.cards.len()],
                &groups,
                [None; 3],
            );
            if parameter == 4_000_000_000.0 {
                assert_eq!(
                    engine.team_upper(&[0, 1, 2, 3, 4], 0, 0),
                    Err(UpperBoundFailure::Unknown)
                );
                assert!(matches!(joint, Err(UpperBoundFailure::Unknown)));
            } else {
                let joint = joint.unwrap().unwrap();
                let exact = reference_scores(&input, [0, 1, 2, 3, 4], 2);
                for (slot, score) in exact.into_iter().enumerate() {
                    assert!(score <= engine.team_upper(&[0, 1, 2, 3, 4], 0, slot).unwrap().score);
                    let upper = (0..5)
                        .try_fold(0.0, |sum, id| {
                            add_up(sum, joint.cards[id][slot][usize::from(id == 2)])
                        })
                        .unwrap();
                    assert!(
                        score
                            <= mul_up(
                                sub_up(upper, joint.offset).unwrap(),
                                rounding_factor(4).unwrap(),
                            )
                            .unwrap()
                    );
                    if parameter == f64::from_bits(1) {
                        assert_eq!(score, 0.0);
                    }
                }
            }
        }
    }
}
