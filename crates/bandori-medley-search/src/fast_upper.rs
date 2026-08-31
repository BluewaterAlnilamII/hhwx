//! A chart-free partial-team bound, separate from exact leaf scoring.
//!
//! Every real team has score <= P*K before the reference expectation-rounding
//! envelope. P is an additive per-card parameter upper; K is the full-P base
//! coefficient plus five real card contributions and exactly one leader bonus.
//! For any positive t, P*K <= (t*P + K/t)^2/4. Maximizing that additive quantity
//! over distinct characters retains the parameter/skill trade-off on each card.
//! All arithmetic on the proof path is directed upward; failure is never a cut.

use std::collections::{BTreeMap, BTreeSet};

use bandori_medley_model::ResolvedScoreSkillV1;

use crate::candidate::member_order_for_leader;
use crate::parameters::calculate_team_parameters;
use crate::upper_bound::{
    SkillUpper, UpperBoundFailure, all_order_operation_ceilings, checked_finite, combo_rate,
    reference_ceiling, skill_delta, skill_upper, trigger_times,
};
use crate::{AreaItemConfigurationV1, CardAttributeV1, MedleySearchInputV1, SearchCardV1};

const ERROR_DENOMINATOR: u128 = 1_u128 << 52;
const WEIGHT_FACTORS: [f64; 3] = [0.8, 1.0, 1.25];

fn add_up(left: f64, right: f64) -> Result<f64, UpperBoundFailure> {
    if left == 0.0 {
        return checked_finite(right);
    }
    if right == 0.0 {
        return checked_finite(left);
    }
    checked_finite(checked_finite(left + right)?.next_up())
}

fn mul_up(left: f64, right: f64) -> Result<f64, UpperBoundFailure> {
    if left == 0.0 || right == 0.0 {
        return Ok(0.0);
    }
    checked_finite(checked_finite(left * right)?.next_up())
}

fn div_up(numerator: f64, denominator: f64) -> Result<f64, UpperBoundFailure> {
    if !denominator.is_finite() || denominator <= 0.0 {
        return Err(UpperBoundFailure::Unknown);
    }
    if numerator == 0.0 {
        return Ok(0.0);
    }
    checked_finite(checked_finite(numerator / denominator)?.next_up())
}

fn rounding_factor(operations: u128) -> Result<f64, UpperBoundFailure> {
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
    level_rate: f64,
    rounding_operations: u128,
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
        let mut global = SkillUpper {
            duration_seconds: 0.0,
            positive_delta: 0.0,
            may_continue: false,
            may_rate_up: false,
        };
        let mut bands = BTreeSet::new();
        let mut attributes = Vec::new();
        let mut pairs = Vec::new();
        for card in input.cards.iter().filter(|card| !card.is_excluded) {
            let upper = skill_upper(card)?;
            global.duration_seconds = global.duration_seconds.max(upper.duration_seconds);
            global.positive_delta = global.positive_delta.max(upper.positive_delta);
            global.may_continue |= upper.may_continue;
            global.may_rate_up |= upper.may_rate_up;
            bands.insert(card.band_id);
            if !attributes.contains(&card.attribute) {
                attributes.push(card.attribute);
            }
            if !pairs.contains(&(card.band_id, card.attribute)) {
                pairs.push((card.band_id, card.attribute));
            }
        }
        let mut maximum_multiplier = 1.0;
        for _ in 0..6 {
            maximum_multiplier = add_up(maximum_multiplier, global.positive_delta)?;
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
        let mut times = [[0.0; 6]; 3];
        let mut start_combo = 0_u32;
        let note_factor = mul_up(rounding_factor(5)?, rounding_factor(7)?)?;
        for (slot, song) in input.songs.iter().enumerate() {
            let note_count =
                u32::try_from(song.notes.len()).map_err(|_| UpperBoundFailure::Unknown)?;
            let level_rate = 1.0 + (f64::from(song.play_level) - 5.0) / 100.0;
            let fixed_rate = mul_up(
                mul_up(div_up(level_rate, f64::from(note_count))?, 3.0)?,
                1.1,
            )?;
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
            times[slot] = trigger_times(song)?;
            // This global state envelope covers every context and leader. It
            // retains states until after the first note outside each window.
            let rounding_operations = all_order_operation_ceilings(song, times[slot], [global; 5])?
                .into_iter()
                .max()
                .ok_or(UpperBoundFailure::Unknown)?
                .checked_add(121)
                .ok_or(UpperBoundFailure::Unknown)?;
            rounding_factor(rounding_operations)?;
            song_models.push(SongModel {
                base,
                maximum_alpha,
                level_rate,
                rounding_operations,
            });
            start_combo = start_combo
                .checked_add(note_count)
                .ok_or(UpperBoundFailure::Unknown)?;
        }

        // A duration's exact windows are traversed once, never once per node or
        // area configuration. Direct upward sums avoid unsafe prefix subtraction.
        let mut windows = BTreeMap::<u64, [[f64; 6]; 3]>::new();
        let mut contributions = vec![[[SkillContribution::default(); 3]; 4]; input.cards.len()];
        for card in input.cards.iter().filter(|card| !card.is_excluded) {
            for (context_index, skill) in contexts(card).into_iter().enumerate() {
                let duration_key = skill.duration_seconds.to_bits();
                if let std::collections::btree_map::Entry::Vacant(entry) =
                    windows.entry(duration_key)
                {
                    let mut coverage = [[0.0; 6]; 3];
                    for slot in 0..3 {
                        for activation_index in 0..6 {
                            let trigger = times[slot][activation_index];
                            let end = checked_finite(trigger + skill.duration_seconds + 0.00001)?;
                            for (note, alpha) in input.songs[slot].notes.iter().zip(&alphas[slot]) {
                                if note.time_seconds > trigger && note.time_seconds <= end {
                                    coverage[slot][activation_index] =
                                        add_up(coverage[slot][activation_index], *alpha)?;
                                }
                            }
                        }
                    }
                    entry.insert(coverage);
                }
                let coverage = &windows[&duration_key];
                let delta = skill_delta(skill)?;
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
}

/// Configuration-local additive card parameters; no chart or candidate cache.
pub(crate) struct FastUpperBoundEngine<'a> {
    model: &'a FastScoreModel<'a>,
    configuration: &'a AreaItemConfigurationV1,
    parameters: Vec<f64>,
    contexts: Vec<ContextWeights>,
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

fn retain_choice(target: &mut Option<Choice>, choice: Choice) {
    if target.is_none_or(|previous| {
        choice.value > previous.value
            || (choice.value == previous.value && choice.instance_id < previous.instance_id)
    }) {
        *target = Some(choice);
    }
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
            weighted_contexts.push(ContextWeights { context, scales });
        }
        Ok(Self {
            model,
            configuration,
            parameters,
            contexts: weighted_contexts,
        })
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
        remaining: &[u32],
        selected_characters: &[usize],
    ) -> Result<f64, UpperBoundFailure> {
        let mut by_character = vec![None::<f64>; self.model.character_count];
        for id in remaining {
            let card = self
                .model
                .input
                .cards
                .get(*id as usize)
                .ok_or(UpperBoundFailure::Unknown)?;
            let character = self.model.character_indexes[*id as usize];
            if card.is_excluded || selected_characters.contains(&character) {
                continue;
            }
            let value = self.parameters[*id as usize];
            by_character[character] =
                Some(by_character[character].map_or(value, |old| old.max(value)));
        }
        let mut largest = by_character.into_iter().flatten().collect::<Vec<_>>();
        largest.sort_unstable_by(|left, right| right.total_cmp(left));
        if largest.len() < 5 - selected.len() {
            return Err(UpperBoundFailure::Unknown);
        }
        let mut result = 0.0;
        for id in selected {
            result = add_up(result, self.parameters[*id as usize])?;
        }
        for value in largest.into_iter().take(5 - selected.len()) {
            result = add_up(result, value)?;
        }
        Ok(result)
    }

    fn support(
        &self,
        selected: &[u32],
        remaining: &[u32],
        selected_characters: &[usize],
        song_slot: usize,
        context: TeamContext,
        scale: f64,
    ) -> Result<Option<Support>, UpperBoundFailure> {
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
            let value = add_up(
                mul_up(scale, self.parameters[id as usize])?,
                div_up(coefficient.first_five, scale)?,
            )?;
            fixed.value = add_up(fixed.value, value)?;
            fixed.members[position] = id;
            let leader = div_up(coefficient.leader, scale)?;
            fixed_leader = Some(fixed_leader.map_or(leader, |previous| previous.max(leader)));
        }

        // A character contributes at most one card. For a fixed positive scale,
        // only its best regular-card and best leader-card weights are needed.
        let mut choices = vec![[None::<Choice>; 2]; self.model.character_count];
        for id in remaining.iter().copied() {
            let card = self
                .model
                .input
                .cards
                .get(id as usize)
                .ok_or(UpperBoundFailure::Unknown)?;
            let character = self.model.character_indexes[id as usize];
            if card.is_excluded
                || selected_characters.contains(&character)
                || !context.accepts(card)
            {
                continue;
            }
            let coefficient = self.model.contributions[id as usize][coefficient_index][song_slot];
            let regular = add_up(
                mul_up(scale, self.parameters[id as usize])?,
                div_up(coefficient.first_five, scale)?,
            )?;
            let leader = add_up(regular, div_up(coefficient.leader, scale)?)?;
            retain_choice(
                &mut choices[character][0],
                Choice {
                    value: regular,
                    instance_id: id,
                },
            );
            retain_choice(
                &mut choices[character][1],
                Choice {
                    value: leader,
                    instance_id: id,
                },
            );
        }
        let required = 5 - selected.len();
        let mut states = [[None::<Support>; 2]; 6];
        states[0][0] = Some(fixed);
        if let Some(leader) = fixed_leader {
            states[0][1] = Some(Support {
                value: add_up(fixed.value, leader)?,
                ..fixed
            });
        }
        for group in choices {
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
        Ok(states[required][1])
    }

    pub(crate) fn team_upper(
        &self,
        selected: &[u32],
        remaining: &[u32],
        song_slot: usize,
    ) -> Result<f64, UpperBoundFailure> {
        let song = self
            .model
            .songs
            .get(song_slot)
            .ok_or(UpperBoundFailure::Unknown)?;
        let characters = self.selected_characters(selected)?;
        let parameter = self.maximum_parameter(selected, remaining, &characters)?;

        // A nonzero integer inner score implies that all five base operations
        // were normal: after any subnormal result the remaining gain is <64,
        // so the final raw base stays far below 1. Thus gamma_5 needs no absolute
        // term. After dropping negative deltas, six additions start from 1;
        // multiplying a nonzero inner is normal too, so gamma_7 suffices.
        // The alphas include both factors. This independent whole-family P
        // maximum proves u32 safety, not the AM-GM maximizing team's parameter.
        checked_finite(parameter * song.level_rate)?;
        let range_upper = mul_up(
            mul_up(parameter, song.maximum_alpha)?,
            self.model.maximum_multiplier,
        )?;
        if range_upper.floor() > f64::from(u32::MAX) {
            return Err(UpperBoundFailure::Unknown);
        }

        let mut family_upper = None::<f64>;
        for weighted in &self.contexts {
            let mut context_upper = None::<f64>;
            for factor in WEIGHT_FACTORS {
                let scale = weighted.scales[song_slot] * factor;
                let Some(support) = self.support(
                    selected,
                    remaining,
                    &characters,
                    song_slot,
                    weighted.context,
                    scale,
                )?
                else {
                    continue;
                };
                let upper = div_up(mul_up(support.value, support.value)?, 4.0)?;
                context_upper = Some(context_upper.map_or(upper, |previous| previous.min(upper)));
            }
            if let Some(upper) = context_upper {
                family_upper = Some(family_upper.map_or(upper, |previous| previous.max(upper)));
            }
        }
        // Each actual team occurs in its actual context. Cases without a band
        // or attribute equality may include additional homogeneous teams; that
        // is only an upward relaxation, never per-card context mixing.
        let upper = family_upper.ok_or(UpperBoundFailure::Unknown)?;
        let path_ceiling = upper.ceil();
        if path_ceiling >= (1_u128 << 64) as f64 {
            return Err(UpperBoundFailure::Unknown);
        }
        reference_ceiling(path_ceiling as u128, song.rounding_operations).map(|result| result.2)
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
        remaining: &[u32],
        song_slot: usize,
        rank: usize,
    ) -> Option<[u32; 5]> {
        if song_slot >= 3 {
            return None;
        }
        let characters = self.selected_characters(selected).ok()?;
        let mut candidates = Vec::<([u32; 5], f64)>::new();
        for weighted in &self.contexts {
            for factor in WEIGHT_FACTORS {
                let Some(mut support) = self
                    .support(
                        selected,
                        remaining,
                        &characters,
                        song_slot,
                        weighted.context,
                        weighted.scales[song_slot] * factor,
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
        ExactProbabilityV1, FixedMedleyEvaluationInputV1, RateUpWithPerfectV1, ScoringNoteV1,
        SkillBehaviorV1,
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
                        rate_up_with_perfect: (id == 0).then_some(RateUpWithPerfectV1 {
                            stack_percent: 0.5,
                            max_score_up_percent: rate + 50.0,
                        }),
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
            let boundary = 0.0_f64 + 2.0 + 0.00001;
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

    #[test]
    fn every_tiny_completion_and_leader_replays_below_partial_and_complete_uppers() {
        let input = fixture();
        input.validate().unwrap();
        let model = FastScoreModel::new(&input).unwrap();
        let engine = FastUpperBoundEngine::new(&model, &input.area_configurations[0]).unwrap();
        let remaining = (0_u32..8).collect::<Vec<_>>();
        let roots: [f64; 3] =
            std::array::from_fn(|slot| engine.team_upper(&[], &remaining, slot).unwrap());
        for first in [0, 5] {
            for second in [1, 6] {
                for third in [2, 7] {
                    let mut set = [first, second, third, 3, 4];
                    set.sort_unstable();
                    let complete: [f64; 3] =
                        std::array::from_fn(|slot| engine.team_upper(&set, &[], slot).unwrap());
                    let partial: [f64; 3] = std::array::from_fn(|slot| {
                        engine
                            .team_upper(&[first, second], &[2, 7, 3, 4], slot)
                            .unwrap()
                    });
                    for leader in set {
                        let exact = reference_scores(&input, set, leader);
                        for slot in 0..3 {
                            assert!(exact[slot] <= roots[slot]);
                            assert!(exact[slot] <= partial[slot]);
                            assert!(exact[slot] <= complete[slot]);
                        }
                    }
                }
            }
        }
        let best = engine.propose_team(&[0], &remaining, 0, 0).unwrap();
        assert!(best.contains(&0));
        let mut rank = 1;
        while let Some(next) = engine.propose_team(&[0], &remaining, 0, rank) {
            assert!(next.contains(&0));
            assert!(engine.estimate_team(best, 0) >= engine.estimate_team(next, 0));
            rank += 1;
        }
    }

    #[test]
    fn reference_rounding_boundaries_and_unknown_note_overflow_are_preserved() {
        // Ten notes and the third slot's 1.01 combo give a largest-note rate
        // of 5*1.2/10*3*1.1*1.01 per identical card parameter. A raw result a
        // quarter unit above u32::MAX still has a legal final floor.
        let last_valid_parameter = (f64::from(u32::MAX) + 0.25) / 1.9998;
        for parameter in [
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
                    skill.rate_up_with_perfect = None;
                }
            }
            input.validate().unwrap();
            let model = FastScoreModel::new(&input).unwrap();
            let engine = FastUpperBoundEngine::new(&model, &input.area_configurations[0]).unwrap();
            if parameter == 4_000_000_000.0 {
                assert_eq!(
                    engine.team_upper(&[0, 1, 2, 3, 4], &[], 0),
                    Err(UpperBoundFailure::Unknown)
                );
            } else {
                let exact = reference_scores(&input, [0, 1, 2, 3, 4], 2);
                for (slot, score) in exact.into_iter().enumerate() {
                    assert!(score <= engine.team_upper(&[0, 1, 2, 3, 4], &[], slot).unwrap());
                    if parameter == f64::from_bits(1) {
                        assert_eq!(score, 0.0);
                    }
                }
            }
        }
    }
}
