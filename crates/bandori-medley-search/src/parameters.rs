use crate::{AreaItemConfigurationV1, SearchAreaItemV1, SearchCardV1};

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct TeamParameterTrace {
    pub(crate) card_power: f64,
    pub(crate) area_item_power: f64,
    pub(crate) event_power: f64,
    pub(crate) deck_total_parameter: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum TeamParameterFailure {
    CardReferenceMissing {
        member_index: usize,
        instance_id: u32,
    },
    AreaItemReferenceMissing {
        area_item_id: u32,
    },
    ArithmeticNonFinite,
}

fn sum_parameter_vector(parameter: [f64; 3]) -> f64 {
    let performance_and_technique = parameter[0] + parameter[1];
    performance_and_technique + parameter[2]
}

fn resolve_members(
    cards: &[SearchCardV1],
    member_instance_ids: [u32; 5],
) -> Result<[&SearchCardV1; 5], TeamParameterFailure> {
    for (member_index, instance_id) in member_instance_ids.iter().copied().enumerate() {
        let card = cards.get(instance_id as usize);
        if card.is_none_or(|card| card.instance_id != instance_id) {
            return Err(TeamParameterFailure::CardReferenceMissing {
                member_index,
                instance_id,
            });
        }
    }

    Ok(member_instance_ids.map(|instance_id| &cards[instance_id as usize]))
}

/// Reproduce the established JavaScript parameter accumulation order for one team.
///
/// `member_instance_ids` is already in scoring order; index two is the leader.
/// This function deliberately does not reorder members or selected area items.
pub(crate) fn calculate_team_parameters(
    cards: &[SearchCardV1],
    area_items: &[SearchAreaItemV1],
    configuration: &AreaItemConfigurationV1,
    member_instance_ids: [u32; 5],
) -> Result<TeamParameterTrace, TeamParameterFailure> {
    let members = resolve_members(cards, member_instance_ids)?;

    let mut card_power = 0.0_f64;
    for card in members.iter().copied() {
        let member_power = sum_parameter_vector(card.character_parameter);
        card_power += member_power;
    }

    let mut area_item_power = 0.0_f64;
    for area_item_id in configuration.selected_area_item_ids.iter().copied() {
        let area_item = area_items
            .iter()
            .find(|area_item| area_item.area_item_id == area_item_id)
            .ok_or(TeamParameterFailure::AreaItemReferenceMissing { area_item_id })?;

        let mut item_power = 0.0_f64;
        for card in members.iter().copied() {
            if !area_item.target_band_ids.contains(&card.band_id)
                || !area_item.target_attributes.contains(&card.attribute)
            {
                continue;
            }

            let performance = card.character_parameter[0] * area_item.parameter_rates[0];
            item_power += performance;
            let technique = card.character_parameter[1] * area_item.parameter_rates[1];
            item_power += technique;
            let visual = card.character_parameter[2] * area_item.parameter_rates[2];
            item_power += visual;
        }
        area_item_power += item_power;
    }

    let mut event_power = 0.0_f64;
    for card in members.iter().copied() {
        let member_event_power = sum_parameter_vector(card.event_parameter);
        event_power += member_event_power;
    }

    let card_and_area_power = card_power + area_item_power;
    let deck_total_parameter = card_and_area_power + event_power;
    let trace = TeamParameterTrace {
        card_power,
        area_item_power,
        event_power,
        deck_total_parameter,
    };
    if [
        trace.card_power,
        trace.area_item_power,
        trace.event_power,
        trace.deck_total_parameter,
    ]
    .into_iter()
    .any(|value| !value.is_finite() || value < 0.0)
    {
        return Err(TeamParameterFailure::ArithmeticNonFinite);
    }

    Ok(trace)
}

#[cfg(test)]
mod tests {
    use bandori_medley_model::{ResolvedScoreSkillV1, SkillBehaviorV1};

    use super::*;
    use crate::{CardAttributeV1, SearchCardSkillContextsV1};

    fn neutral_skill(master_skill_id: u32) -> ResolvedScoreSkillV1 {
        ResolvedScoreSkillV1 {
            master_skill_id,
            skill_level: 1,
            duration_seconds: 1.0,
            behavior: SkillBehaviorV1::Neutral,
            rate_up_with_perfect: None,
        }
    }

    fn card(instance_id: u32) -> SearchCardV1 {
        let skill = neutral_skill(instance_id + 1);
        SearchCardV1 {
            instance_id,
            master_card_id: instance_id + 1,
            character_id: instance_id + 1,
            band_id: if instance_id == 0 { 1 } else { 2 },
            attribute: if instance_id == 0 {
                CardAttributeV1::Powerful
            } else {
                CardAttributeV1::Happy
            },
            is_excluded: false,
            character_parameter: if instance_id == 0 {
                [0.5, 0.0, 0.0]
            } else {
                [1.0, 0.0, 0.0]
            },
            event_parameter: if instance_id == 0 {
                [0.1, 0.2, 0.3]
            } else {
                [0.0, 0.0, 0.0]
            },
            skill_contexts: SearchCardSkillContextsV1 {
                mixed: skill,
                same_band: skill,
                same_attribute: skill,
                same_band_and_attribute: skill,
            },
        }
    }

    #[test]
    fn preserves_fractional_parameter_and_selected_item_operation_order() {
        let cards = (0_u32..5).map(card).collect::<Vec<_>>();
        let area_items = vec![
            SearchAreaItemV1 {
                area_item_id: 1,
                target_band_ids: vec![1],
                target_attributes: vec![CardAttributeV1::Powerful],
                parameter_rates: [18_014_398_509_481_984.0, 0.0, 0.0],
            },
            SearchAreaItemV1 {
                area_item_id: 2,
                target_band_ids: vec![1],
                target_attributes: vec![CardAttributeV1::Powerful],
                parameter_rates: [1.5, 0.0, 0.0],
            },
            SearchAreaItemV1 {
                area_item_id: 3,
                target_band_ids: vec![1],
                target_attributes: vec![CardAttributeV1::Powerful],
                parameter_rates: [1.5, 0.0, 0.0],
            },
        ];
        let members = [1, 2, 0, 3, 4];
        let large_first = calculate_team_parameters(
            &cards,
            &area_items,
            &AreaItemConfigurationV1 {
                selected_area_item_ids: vec![1, 2, 3],
            },
            members,
        )
        .expect("normalized references must resolve");
        let large_last = calculate_team_parameters(
            &cards,
            &area_items,
            &AreaItemConfigurationV1 {
                selected_area_item_ids: vec![2, 3, 1],
            },
            members,
        )
        .expect("normalized references must resolve");

        let large_contribution = 9_007_199_254_740_992.0_f64;
        assert_eq!(large_first.card_power.to_bits(), 4.5_f64.to_bits());
        assert_eq!(
            large_first.event_power.to_bits(),
            ((0.1_f64 + 0.2_f64) + 0.3_f64).to_bits()
        );
        assert_eq!(
            large_first.area_item_power.to_bits(),
            large_contribution.to_bits()
        );
        assert_eq!(
            large_last.area_item_power.to_bits(),
            (large_contribution + 2.0).to_bits()
        );
        assert_ne!(
            large_first.area_item_power.to_bits(),
            large_last.area_item_power.to_bits()
        );
        assert_eq!(
            large_first.deck_total_parameter.to_bits(),
            ((large_first.card_power + large_first.area_item_power) + large_first.event_power)
                .to_bits()
        );
    }
}
