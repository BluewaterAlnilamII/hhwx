use bandori_medley_model::{MedleySongV1, ResolvedScoreSkillV1, SkillBehaviorV1};

use crate::exact_score::skill_orders;
use crate::{AreaItemConfigurationV1, MedleySearchInputV1, SearchCardV1};

const REFERENCE_ERROR_DENOMINATOR: u128 = 1_u128 << 52;
const SKILL_ORDER_COUNT: u128 = 120;
const PERFECT_RATE: f64 = 1.1;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum UpperBoundFailure {
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct ProvenSongUpper {
    pub(crate) value: f64,
    pub(crate) path_ceiling: u128,
    pub(crate) rounding_operation_ceiling: u64,
    pub(crate) reference_ceiling: u128,
}

#[derive(Clone, Copy, Debug)]
struct SkillUpper {
    duration_seconds: f64,
    positive_delta: f64,
    may_continue: bool,
    may_rate_up: bool,
}

#[derive(Clone, Debug)]
struct ParameterMemberUpper {
    card_power: f64,
    area_terms: Vec<[f64; 3]>,
    event_power: f64,
}

#[derive(Clone, Debug)]
struct CardUpper {
    parameter: ParameterMemberUpper,
    skill: SkillUpper,
}

/// Configuration-local proof data. It does not retain candidate rows.
pub(crate) struct UpperBoundEngine<'a> {
    input: &'a MedleySearchInputV1,
    configuration: &'a AreaItemConfigurationV1,
    eligible_instance_ids: &'a [u32],
    cards: Vec<Option<CardUpper>>,
    start_combos: [u32; 3],
}

fn checked_finite(value: f64) -> Result<f64, UpperBoundFailure> {
    if value.is_finite() && value >= 0.0 {
        Ok(value)
    } else {
        Err(UpperBoundFailure::Unknown)
    }
}

fn parameter_sum(parameter: [f64; 3]) -> Result<f64, UpperBoundFailure> {
    checked_finite((parameter[0] + parameter[1]) + parameter[2])
}

fn max_assign(target: &mut f64, value: f64) {
    if value > *target {
        *target = value;
    }
}

fn skill_delta(skill: ResolvedScoreSkillV1) -> Result<f64, UpperBoundFailure> {
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

fn skill_upper(card: &SearchCardV1) -> Result<SkillUpper, UpperBoundFailure> {
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

fn parameter_upper(
    input: &MedleySearchInputV1,
    configuration: &AreaItemConfigurationV1,
    card: &SearchCardV1,
) -> Result<ParameterMemberUpper, UpperBoundFailure> {
    let card_power = parameter_sum(card.character_parameter)?;
    let event_power = parameter_sum(card.event_parameter)?;
    let mut area_terms = Vec::with_capacity(configuration.selected_area_item_ids.len());
    for area_item_id in configuration.selected_area_item_ids.iter().copied() {
        let item = input
            .area_items
            .iter()
            .find(|item| item.area_item_id == area_item_id)
            .ok_or(UpperBoundFailure::Unknown)?;
        if !item.target_band_ids.contains(&card.band_id)
            || !item.target_attributes.contains(&card.attribute)
        {
            area_terms.push([0.0; 3]);
            continue;
        }
        let terms = std::array::from_fn(|index| {
            card.character_parameter[index] * item.parameter_rates[index]
        });
        for term in terms {
            checked_finite(term)?;
        }
        area_terms.push(terms);
    }
    Ok(ParameterMemberUpper {
        card_power,
        area_terms,
        event_power,
    })
}

fn merge_virtual_parameter(target: &mut ParameterMemberUpper, source: &ParameterMemberUpper) {
    max_assign(&mut target.card_power, source.card_power);
    max_assign(&mut target.event_power, source.event_power);
    for (target_terms, source_terms) in target.area_terms.iter_mut().zip(&source.area_terms) {
        for index in 0..3 {
            max_assign(&mut target_terms[index], source_terms[index]);
        }
    }
}

fn merge_virtual_skill(target: &mut SkillUpper, source: SkillUpper) {
    max_assign(&mut target.duration_seconds, source.duration_seconds);
    max_assign(&mut target.positive_delta, source.positive_delta);
    target.may_continue |= source.may_continue;
    target.may_rate_up |= source.may_rate_up;
}

fn deck_parameter_for_order(
    members: &[ParameterMemberUpper; 5],
    order: [usize; 5],
) -> Result<f64, UpperBoundFailure> {
    let mut card_power = 0.0_f64;
    for member_index in order {
        card_power += members[member_index].card_power;
    }

    let mut area_power = 0.0_f64;
    for item_index in 0..members[0].area_terms.len() {
        let mut item_power = 0.0_f64;
        for member_index in order {
            for term in members[member_index].area_terms[item_index] {
                item_power += term;
            }
        }
        area_power += item_power;
    }

    let mut event_power = 0.0_f64;
    for member_index in order {
        event_power += members[member_index].event_power;
    }
    checked_finite((card_power + area_power) + event_power)
}

fn maximum_deck_parameter(members: &[ParameterMemberUpper; 5]) -> Result<f64, UpperBoundFailure> {
    let mut maximum = 0.0_f64;
    for order in skill_orders() {
        max_assign(&mut maximum, deck_parameter_for_order(members, *order)?);
    }
    Ok(maximum)
}

fn combo_rate(combo: u32) -> f64 {
    match combo {
        0..=20 => 1.0,
        21..=50 => 1.01,
        51..=100 => 1.02,
        101..=300 => 1.01 + f64::from((combo - 1) / 50) * 0.01,
        301..=3_000 => 1.04 + f64::from((combo - 1) / 100) * 0.01,
        _ => 1.34,
    }
}

fn base_note_ceilings(
    song: &MedleySongV1,
    deck_parameter: f64,
    start_combo: u32,
) -> Result<Vec<u32>, UpperBoundFailure> {
    let note_count = u32::try_from(song.notes.len()).map_err(|_| UpperBoundFailure::Unknown)?;
    let play_level_rate = 1.0 + (f64::from(song.play_level) - 5.0) / 100.0;
    let base_score_per_note = (deck_parameter * play_level_rate) / f64::from(note_count) * 3.0;
    checked_finite(base_score_per_note)?;

    let mut result = Vec::with_capacity(song.notes.len());
    for note_index in 0..note_count {
        let combo = start_combo
            .checked_add(note_index + 1)
            .ok_or(UpperBoundFailure::Unknown)?;
        let with_judgment = base_score_per_note * PERFECT_RATE;
        let with_combo = with_judgment * combo_rate(combo);
        checked_finite(with_combo)?;
        let floored = with_combo.floor();
        if floored > f64::from(u32::MAX) {
            return Err(UpperBoundFailure::Unknown);
        }
        result.push(floored as u32);
    }
    Ok(result)
}

fn trigger_times(song: &MedleySongV1) -> Result<[f64; 6], UpperBoundFailure> {
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

fn ceil_non_negative_to_u128(value: f64) -> Result<u128, UpperBoundFailure> {
    checked_finite(value)?;
    let ceiling = value.ceil();
    if ceiling >= u128::MAX as f64 {
        return Err(UpperBoundFailure::Unknown);
    }
    Ok(ceiling as u128)
}

fn positive_product_ceiling(
    inner_score: u32,
    positive_delta: f64,
) -> Result<u128, UpperBoundFailure> {
    if inner_score == 0 || positive_delta == 0.0 {
        return Ok(0);
    }
    let product = checked_finite(f64::from(inner_score) * positive_delta)?;
    let directed_upper = product.next_up();
    ceil_non_negative_to_u128(directed_upper)
}

fn activation_additive_ceiling(
    song: &MedleySongV1,
    inner_scores: &[u32],
    trigger_time: f64,
    skill: SkillUpper,
) -> Result<u128, UpperBoundFailure> {
    let end_time = activation_end(trigger_time, skill)?;
    let mut total = 0_u128;
    for (note, inner_score) in song.notes.iter().zip(inner_scores) {
        if note.time_seconds <= trigger_time || note.time_seconds > end_time {
            continue;
        }
        total = total
            .checked_add(positive_product_ceiling(
                *inner_score,
                skill.positive_delta,
            )?)
            .ok_or(UpperBoundFailure::Unknown)?;
    }
    Ok(total)
}

fn prove_note_ranges(
    song: &MedleySongV1,
    inner_scores: &[u32],
    times: [f64; 6],
    skill: SkillUpper,
) -> Result<(), UpperBoundFailure> {
    let end_times = times
        .map(|trigger_time| activation_end(trigger_time, skill))
        .into_iter()
        .collect::<Result<Vec<_>, _>>()?;
    for (note, inner_score) in song.notes.iter().zip(inner_scores) {
        let mut ceiling = u128::from(*inner_score);
        for activation_index in 0..6 {
            if note.time_seconds <= times[activation_index]
                || note.time_seconds > end_times[activation_index]
            {
                continue;
            }
            ceiling = ceiling
                .checked_add(positive_product_ceiling(
                    *inner_score,
                    skill.positive_delta,
                )?)
                .ok_or(UpperBoundFailure::Unknown)?;
        }
        // The exact scorer makes at most six non-negative multiplier additions
        // and one final multiplication. If B is the integer ceiling assembled
        // above, B <= u32::MAX and Q=2^52 give a rounding excess below
        // B*7/(Q-7) < 0.000007 < 1 score unit. The directed products therefore
        // cover the final floor as well.
        if ceiling > u128::from(u32::MAX) {
            return Err(UpperBoundFailure::Unknown);
        }
    }
    Ok(())
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

fn all_order_operation_ceilings(
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

fn reference_ceiling(
    path_ceiling: u128,
    rounding_operations: u128,
) -> Result<(u64, u128, f64), UpperBoundFailure> {
    // `path_ceiling` already covers every integer note score. Starting with the
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

impl<'a> UpperBoundEngine<'a> {
    pub(crate) fn new(
        input: &'a MedleySearchInputV1,
        configuration: &'a AreaItemConfigurationV1,
        eligible_instance_ids: &'a [u32],
    ) -> Result<Self, UpperBoundFailure> {
        let mut cards = vec![None; input.cards.len()];
        for card in &input.cards {
            let upper = parameter_upper(input, configuration, card)
                .and_then(|parameter| {
                    Ok(CardUpper {
                        parameter,
                        skill: skill_upper(card)?,
                    })
                })
                .ok();
            cards[card.instance_id as usize] = upper;
        }
        let song_zero_notes =
            u32::try_from(input.songs[0].notes.len()).map_err(|_| UpperBoundFailure::Unknown)?;
        let song_one_notes =
            u32::try_from(input.songs[1].notes.len()).map_err(|_| UpperBoundFailure::Unknown)?;
        let second_start = song_zero_notes;
        let third_start = song_zero_notes
            .checked_add(song_one_notes)
            .ok_or(UpperBoundFailure::Unknown)?;
        Ok(Self {
            input,
            configuration,
            eligible_instance_ids,
            cards,
            start_combos: [0, second_start, third_start],
        })
    }

    fn card_upper(&self, instance_id: u32) -> Result<&CardUpper, UpperBoundFailure> {
        self.cards
            .get(instance_id as usize)
            .and_then(Option::as_ref)
            .ok_or(UpperBoundFailure::Unknown)
    }

    fn unresolved_upper(
        &self,
        selected_instance_ids: &[u32],
    ) -> Result<CardUpper, UpperBoundFailure> {
        let selected_characters = selected_instance_ids
            .iter()
            .map(|instance_id| self.input.cards[*instance_id as usize].character_id)
            .collect::<Vec<_>>();
        let mut parameter = ParameterMemberUpper {
            card_power: 0.0,
            area_terms: vec![[0.0; 3]; self.configuration.selected_area_item_ids.len()],
            event_power: 0.0,
        };
        let mut skill = SkillUpper {
            duration_seconds: 0.0,
            positive_delta: 0.0,
            may_continue: false,
            may_rate_up: false,
        };
        let mut found = false;
        for instance_id in self.eligible_instance_ids.iter().copied() {
            let card = &self.input.cards[instance_id as usize];
            if selected_characters.contains(&card.character_id) {
                continue;
            }
            let upper = self.card_upper(instance_id)?;
            merge_virtual_parameter(&mut parameter, &upper.parameter);
            merge_virtual_skill(&mut skill, upper.skill);
            found = true;
        }
        found
            .then_some(CardUpper { parameter, skill })
            .ok_or(UpperBoundFailure::Unknown)
    }

    pub(crate) fn team_upper(
        &self,
        selected_instance_ids: &[u32],
        song_slot: usize,
    ) -> Result<ProvenSongUpper, UpperBoundFailure> {
        if selected_instance_ids.len() > 5 || song_slot >= 3 {
            return Err(UpperBoundFailure::Unknown);
        }
        let unresolved_count = 5 - selected_instance_ids.len();
        let virtual_upper = if unresolved_count > 0 {
            Some(self.unresolved_upper(selected_instance_ids)?)
        } else {
            None
        };
        let mut parameters = Vec::with_capacity(5);
        let mut skills = Vec::with_capacity(5);
        for instance_id in selected_instance_ids.iter().copied() {
            let upper = self.card_upper(instance_id)?;
            parameters.push(upper.parameter.clone());
            skills.push(upper.skill);
        }
        for _ in 0..unresolved_count {
            let upper = virtual_upper.as_ref().ok_or(UpperBoundFailure::Unknown)?;
            parameters.push(upper.parameter.clone());
            skills.push(upper.skill);
        }
        let parameter_members: [ParameterMemberUpper; 5] = parameters
            .try_into()
            .map_err(|_| UpperBoundFailure::Unknown)?;
        let skill_members: [SkillUpper; 5] =
            skills.try_into().map_err(|_| UpperBoundFailure::Unknown)?;
        let deck_parameter = maximum_deck_parameter(&parameter_members)?;
        let song = &self.input.songs[song_slot];
        let inner_scores = base_note_ceilings(song, deck_parameter, self.start_combos[song_slot])?;
        let times = trigger_times(song)?;

        let base_path_ceiling = inner_scores.iter().try_fold(0_u128, |total, score| {
            total
                .checked_add(u128::from(*score))
                .ok_or(UpperBoundFailure::Unknown)
        })?;
        let mut all_member_relaxation = SkillUpper {
            duration_seconds: 0.0,
            positive_delta: 0.0,
            may_continue: false,
            may_rate_up: false,
        };
        for skill in skill_members {
            merge_virtual_skill(&mut all_member_relaxation, skill);
        }
        prove_note_ranges(song, &inner_scores, times, all_member_relaxation)?;
        let mut first_five_contribution_sum = 0_u128;
        for skill in skill_members {
            for trigger_time in times.iter().take(5).copied() {
                first_five_contribution_sum = first_five_contribution_sum
                    .checked_add(activation_additive_ceiling(
                        song,
                        &inner_scores,
                        trigger_time,
                        skill,
                    )?)
                    .ok_or(UpperBoundFailure::Unknown)?;
            }
        }

        let mut maximum_path_average = 0_u128;
        let mut maximum_operations = 0_u128;
        let operation_ceilings = all_order_operation_ceilings(song, times, skill_members)?;
        for (leader_index, leader_skill) in skill_members.into_iter().enumerate() {
            let leader_contribution =
                activation_additive_ceiling(song, &inner_scores, times[5], leader_skill)?;
            // Every member occupies every first-five trigger exactly 24 times
            // across the 120 equiprobable orders.
            let additive_numerator = base_path_ceiling
                .checked_mul(SKILL_ORDER_COUNT)
                .and_then(|value| {
                    first_five_contribution_sum
                        .checked_mul(24)
                        .and_then(|first| value.checked_add(first))
                })
                .and_then(|value| {
                    leader_contribution
                        .checked_mul(SKILL_ORDER_COUNT)
                        .and_then(|leader| value.checked_add(leader))
                })
                .ok_or(UpperBoundFailure::Unknown)?;
            let additive_average = ceil_div(additive_numerator, SKILL_ORDER_COUNT)?;
            max_assign_u128(&mut maximum_path_average, additive_average);
            max_assign_u128(&mut maximum_operations, operation_ceilings[leader_index]);
        }
        maximum_operations = maximum_operations
            .checked_add(SKILL_ORDER_COUNT + 1)
            .ok_or(UpperBoundFailure::Unknown)?;
        let (rounding_operation_ceiling, reference_ceiling, value) =
            reference_ceiling(maximum_path_average, maximum_operations)?;
        Ok(ProvenSongUpper {
            value,
            path_ceiling: maximum_path_average,
            rounding_operation_ceiling,
            reference_ceiling,
        })
    }
}

fn max_assign_u128(target: &mut u128, value: u128) {
    if value > *target {
        *target = value;
    }
}

pub(crate) fn add_song_uppers(values: [f64; 3]) -> Result<f64, UpperBoundFailure> {
    checked_finite((values[0] + values[1]) + values[2])
}

#[cfg(test)]
mod tests {
    use bandori_medley_model::{
        DifficultyV1, ExactProbabilityV1, MedleySongV1, RateUpWithPerfectV1, ResolvedScoreSkillV1,
        ScoringNoteV1, SkillBehaviorV1,
    };

    use super::*;
    use crate::exact_score::{ExactTeamScoreInput, exact_probability_to_f64, score_song};
    use crate::parameters::calculate_team_parameters;
    use crate::{
        AreaItemConfigurationV1, CardAttributeV1, SEARCH_INPUT_SCHEMA_VERSION,
        SearchCardSkillContextsV1, SearchCardV1,
    };

    fn skill(id: u32, behavior: SkillBehaviorV1) -> ResolvedScoreSkillV1 {
        ResolvedScoreSkillV1 {
            master_skill_id: id,
            skill_level: 1,
            duration_seconds: 4.0,
            behavior,
            rate_up_with_perfect: (id == 1).then_some(RateUpWithPerfectV1 {
                stack_percent: 0.5,
                max_score_up_percent: 130.0,
            }),
        }
    }

    fn fixture() -> MedleySearchInputV1 {
        let behaviors = [
            SkillBehaviorV1::Score {
                score_up_percent: 80.0,
            },
            SkillBehaviorV1::ContinuedPerfect {
                active_score_up_percent: 110.0,
                fallback_score_up_percent: 40.0,
            },
            SkillBehaviorV1::PerfectOnly {
                score_up_percent: 100.0,
            },
            SkillBehaviorV1::GreatOrWorseHalf {
                score_up_percent: 90.0,
            },
            SkillBehaviorV1::ScoreOnPerfect {
                score_up_percent: 100.0,
            },
        ];
        let cards = (0_u32..10)
            .map(|instance_id| {
                let resolved = skill(instance_id + 1, behaviors[instance_id as usize % 5]);
                SearchCardV1 {
                    instance_id,
                    master_card_id: instance_id + 1,
                    character_id: instance_id % 5 + 1,
                    band_id: if instance_id % 2 == 0 { 1 } else { 2 },
                    attribute: if instance_id % 2 == 0 {
                        CardAttributeV1::Powerful
                    } else {
                        CardAttributeV1::Happy
                    },
                    is_excluded: false,
                    character_parameter: [1000.25 + f64::from(instance_id), 900.5, 800.75],
                    event_parameter: [10.25, 5.5, 1.125],
                    skill_contexts: SearchCardSkillContextsV1 {
                        mixed: resolved,
                        same_band: resolved,
                        same_attribute: resolved,
                        same_band_and_attribute: resolved,
                    },
                }
            })
            .collect();
        let songs = std::array::from_fn(|slot| MedleySongV1 {
            slot: slot as u8,
            song_id: slot as u32 + 1,
            difficulty: DifficultyV1::Expert,
            play_level: 25,
            notes: (0_u32..12)
                .map(|note_id| ScoringNoteV1 {
                    note_id,
                    time_seconds: f64::from(note_id),
                    is_skill_trigger: note_id < 6,
                })
                .collect(),
        });
        MedleySearchInputV1 {
            schema_version: SEARCH_INPUT_SCHEMA_VERSION.to_owned(),
            scoring_rules_version: bandori_medley_model::SCORING_RULES_VERSION.to_owned(),
            perfect_rate: ExactProbabilityV1 {
                numerator: 995,
                decimal_scale: 3,
            },
            cards,
            area_items: vec![crate::SearchAreaItemV1 {
                area_item_id: 1,
                target_band_ids: vec![1],
                target_attributes: vec![CardAttributeV1::Powerful],
                parameter_rates: [0.1, 0.2, 0.3],
            }],
            area_configurations: vec![AreaItemConfigurationV1 {
                selected_area_item_ids: vec![1],
            }],
            songs,
        }
    }

    fn ordered_members(set: [u32; 5], leader: u32) -> [u32; 5] {
        let others = set
            .into_iter()
            .filter(|instance_id| *instance_id != leader)
            .collect::<Vec<_>>();
        [others[0], others[1], leader, others[2], others[3]]
    }

    #[test]
    fn complete_and_partial_bounds_cover_every_replayed_exact_team() {
        let input = fixture();
        input.validate().expect("bound fixture must validate");
        let eligible = (0_u32..10).collect::<Vec<_>>();
        let engine = UpperBoundEngine::new(&input, &input.area_configurations[0], &eligible)
            .expect("fixture creates bound engine");
        let perfect_rate = exact_probability_to_f64(input.perfect_rate);
        let partial = [0_u32, 1_u32];

        for first in [0_u32, 5] {
            for second in [1_u32, 6] {
                for third in [2_u32, 7] {
                    for fourth in [3_u32, 8] {
                        for fifth in [4_u32, 9] {
                            let set = [first, second, third, fourth, fifth];
                            let contains_partial = partial.iter().all(|id| set.contains(id));
                            for song_slot in 0..3 {
                                let complete_upper = engine
                                    .team_upper(&set, song_slot)
                                    .expect("complete bound is proved");
                                let partial_upper = engine
                                    .team_upper(&partial, song_slot)
                                    .expect("partial bound is proved");
                                for leader in set {
                                    let members = ordered_members(set, leader);
                                    let parameter = calculate_team_parameters(
                                        &input.cards,
                                        &input.area_items,
                                        &input.area_configurations[0],
                                        members,
                                    )
                                    .expect("fixture parameters score");
                                    let exact = score_song(
                                        &input.songs[song_slot],
                                        ExactTeamScoreInput {
                                            deck_total_parameter: parameter.deck_total_parameter,
                                            skills: members.map(|instance_id| {
                                                input.cards[instance_id as usize]
                                                    .skill_contexts
                                                    .mixed
                                            }),
                                        },
                                        engine.start_combos[song_slot],
                                        perfect_rate,
                                    )
                                    .expect("fixture exact score succeeds")
                                    .average_score;
                                    assert!(exact <= complete_upper.value);
                                    if contains_partial {
                                        assert!(exact <= partial_upper.value);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

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

    #[test]
    fn relaxed_note_range_rejects_only_values_above_u32() {
        let song = MedleySongV1 {
            slot: 0,
            song_id: 1,
            difficulty: DifficultyV1::Expert,
            play_level: 20,
            notes: vec![ScoringNoteV1 {
                note_id: 0,
                time_seconds: 1.0,
                is_skill_trigger: false,
            }],
        };
        let neutral = SkillUpper {
            duration_seconds: 2.0,
            positive_delta: 0.0,
            may_continue: false,
            may_rate_up: false,
        };
        prove_note_ranges(&song, &[u32::MAX], [0.0; 6], neutral)
            .expect("the exact u32 boundary is representable");

        let positive = SkillUpper {
            positive_delta: 0.01,
            ..neutral
        };
        assert_eq!(
            prove_note_ranges(&song, &[u32::MAX], [0.0; 6], positive),
            Err(UpperBoundFailure::Unknown)
        );
    }
}
