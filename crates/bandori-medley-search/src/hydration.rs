use std::collections::BTreeSet;

use bandori_medley_model::ResolvedScoreSkillV1;
use serde::{Deserialize, Serialize};

use crate::exact_score::{ExactScoreFailure, PreparedSong, exact_probability_to_f64};
use crate::parameters::{TeamParameterFailure, calculate_team_parameters};
use crate::{
    AreaItemConfigurationV1, MedleySearchInputV1, MedleySearchSolutionV1, SearchIncompleteReasonV1,
};

const SCORE_ORDER_COUNT: u16 = 120;
const RETAINED_SOLUTION_LIMIT: usize = 10;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MedleySearchTeamParameterBreakdownV1 {
    pub card_power: f64,
    pub area_item_power: f64,
    pub event_power: f64,
    pub deck_total_parameter: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HydratedMedleySearchTeamV1 {
    pub slot: u8,
    /// Member index two is the leader.
    pub member_instance_ids: [u32; 5],
    pub parameters: MedleySearchTeamParameterBreakdownV1,
    pub minimum_score: f64,
    pub average_score: f64,
    pub maximum_score: f64,
    /// The first five triggers followed by the leader at the sixth trigger.
    pub best_skill_order_member_instance_ids: [u32; 6],
    pub maximum_score_order_count: u16,
    pub score_order_count: u16,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HydratedMedleySearchSolutionV1 {
    pub selected_area_item_ids: Vec<u32>,
    pub teams: [HydratedMedleySearchTeamV1; 3],
    pub total_minimum_score: f64,
    pub total_average_score: f64,
    pub total_maximum_score: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MedleySearchHydrationV1 {
    pub candidates: Vec<HydratedMedleySearchSolutionV1>,
    /// Zero-based index into `candidates`; absent when the average champion also
    /// has the highest maximum score or no other candidate is strictly higher.
    pub maximum_score_candidate_index: Option<u8>,
}

fn map_score_failure(failure: ExactScoreFailure) -> SearchIncompleteReasonV1 {
    match failure {
        ExactScoreFailure::InvalidSong => SearchIncompleteReasonV1::InvalidData,
        ExactScoreFailure::ArithmeticNonFinite | ExactScoreFailure::ArithmeticOverflow => {
            SearchIncompleteReasonV1::ArithmeticOverflow
        }
    }
}

fn map_parameter_failure(failure: TeamParameterFailure) -> SearchIncompleteReasonV1 {
    match failure {
        TeamParameterFailure::CardReferenceMissing { .. }
        | TeamParameterFailure::AreaItemReferenceMissing { .. } => {
            SearchIncompleteReasonV1::InvalidData
        }
        TeamParameterFailure::ArithmeticNonFinite => SearchIncompleteReasonV1::ArithmeticOverflow,
    }
}

fn prepare_songs(
    input: &MedleySearchInputV1,
) -> Result<[PreparedSong<'_>; 3], SearchIncompleteReasonV1> {
    let first_note_count = u32::try_from(input.songs[0].notes.len())
        .map_err(|_| SearchIncompleteReasonV1::CountOrIndexOverflow)?;
    let second_note_count = u32::try_from(input.songs[1].notes.len())
        .map_err(|_| SearchIncompleteReasonV1::CountOrIndexOverflow)?;
    let third_start_combo = first_note_count
        .checked_add(second_note_count)
        .ok_or(SearchIncompleteReasonV1::CountOrIndexOverflow)?;
    let start_combos = [0, first_note_count, third_start_combo];
    let perfect_rate = exact_probability_to_f64(input.perfect_rate);
    Ok([
        PreparedSong::new(&input.songs[0], start_combos[0], perfect_rate)
            .map_err(map_score_failure)?,
        PreparedSong::new(&input.songs[1], start_combos[1], perfect_rate)
            .map_err(map_score_failure)?,
        PreparedSong::new(&input.songs[2], start_combos[2], perfect_rate)
            .map_err(map_score_failure)?,
    ])
}

fn resolve_skills(
    input: &MedleySearchInputV1,
    member_instance_ids: [u32; 5],
) -> Result<[ResolvedScoreSkillV1; 5], SearchIncompleteReasonV1> {
    let mut cards = Vec::with_capacity(5);
    let mut instance_ids = BTreeSet::new();
    let mut character_ids = BTreeSet::new();
    for instance_id in member_instance_ids {
        let card = input
            .cards
            .get(instance_id as usize)
            .filter(|card| card.instance_id == instance_id)
            .ok_or(SearchIncompleteReasonV1::InvalidData)?;
        if !instance_ids.insert(instance_id) || !character_ids.insert(card.character_id) {
            return Err(SearchIncompleteReasonV1::InvalidData);
        }
        cards.push(card);
    }
    let cards: [&crate::SearchCardV1; 5] = cards
        .try_into()
        .map_err(|_| SearchIncompleteReasonV1::InternalFailure)?;
    let is_same_band = cards.iter().all(|card| card.band_id == cards[0].band_id);
    let is_same_attribute = cards
        .iter()
        .all(|card| card.attribute == cards[0].attribute);
    Ok(cards.map(|card| match (is_same_band, is_same_attribute) {
        (false, false) => card.skill_contexts.mixed,
        (true, false) => card.skill_contexts.same_band,
        (false, true) => card.skill_contexts.same_attribute,
        (true, true) => card.skill_contexts.same_band_and_attribute,
    }))
}

fn find_configuration<'input>(
    input: &'input MedleySearchInputV1,
    solution: &MedleySearchSolutionV1,
) -> Result<&'input AreaItemConfigurationV1, SearchIncompleteReasonV1> {
    input
        .area_configurations
        .iter()
        .find(|configuration| {
            configuration.selected_area_item_ids == solution.selected_area_item_ids
        })
        .ok_or(SearchIncompleteReasonV1::InvalidData)
}

fn hydrate_solution(
    input: &MedleySearchInputV1,
    prepared_songs: &[PreparedSong<'_>; 3],
    solution: &MedleySearchSolutionV1,
) -> Result<HydratedMedleySearchSolutionV1, SearchIncompleteReasonV1> {
    let configuration = find_configuration(input, solution)?;
    let mut used_instance_ids = BTreeSet::new();
    let mut teams = Vec::with_capacity(3);
    for (slot, team) in solution.teams.iter().enumerate() {
        if usize::from(team.slot) != slot {
            return Err(SearchIncompleteReasonV1::InvalidData);
        }
        if team
            .member_instance_ids
            .iter()
            .any(|instance_id| !used_instance_ids.insert(*instance_id))
        {
            return Err(SearchIncompleteReasonV1::InvalidData);
        }
        let skills = resolve_skills(input, team.member_instance_ids)?;
        let parameter_trace = calculate_team_parameters(
            &input.cards,
            &input.area_items,
            configuration,
            team.member_instance_ids,
        )
        .map_err(map_parameter_failure)?;
        let range = prepared_songs[slot]
            .score_range(skills, parameter_trace.deck_total_parameter, 2)
            .map_err(map_score_failure)?;
        if range.average_score.to_bits() != team.average_score.to_bits() {
            return Err(SearchIncompleteReasonV1::ScorerDisagreement);
        }
        let members = team.member_instance_ids;
        teams.push(HydratedMedleySearchTeamV1 {
            slot: team.slot,
            member_instance_ids: members,
            parameters: MedleySearchTeamParameterBreakdownV1 {
                card_power: parameter_trace.card_power,
                area_item_power: parameter_trace.area_item_power,
                event_power: parameter_trace.event_power,
                deck_total_parameter: parameter_trace.deck_total_parameter,
            },
            minimum_score: range.minimum_score as f64,
            average_score: range.average_score,
            maximum_score: range.maximum_score as f64,
            best_skill_order_member_instance_ids: [
                members[range.best_order[0]],
                members[range.best_order[1]],
                members[range.best_order[2]],
                members[range.best_order[3]],
                members[range.best_order[4]],
                members[2],
            ],
            maximum_score_order_count: range.maximum_score_order_count,
            score_order_count: SCORE_ORDER_COUNT,
        });
    }
    let teams: [HydratedMedleySearchTeamV1; 3] = teams
        .try_into()
        .map_err(|_| SearchIncompleteReasonV1::InternalFailure)?;
    let total_average_score =
        (teams[0].average_score + teams[1].average_score) + teams[2].average_score;
    if total_average_score.to_bits() != solution.total_average_score.to_bits() {
        return Err(SearchIncompleteReasonV1::ScorerDisagreement);
    }

    Ok(HydratedMedleySearchSolutionV1 {
        selected_area_item_ids: solution.selected_area_item_ids.clone(),
        total_minimum_score: (teams[0].minimum_score + teams[1].minimum_score)
            + teams[2].minimum_score,
        total_average_score,
        total_maximum_score: (teams[0].maximum_score + teams[1].maximum_score)
            + teams[2].maximum_score,
        teams,
    })
}

fn maximum_score_candidate_index(candidates: &[HydratedMedleySearchSolutionV1]) -> Option<u8> {
    let average_champion = candidates.first()?;
    let mut maximum_index = 0_usize;
    for index in 1..candidates.len() {
        let candidate = &candidates[index];
        let current = &candidates[maximum_index];
        if candidate.total_maximum_score > current.total_maximum_score
            || (candidate.total_maximum_score == current.total_maximum_score
                && candidate.total_average_score > current.total_average_score)
        {
            maximum_index = index;
        }
    }
    if maximum_index == 0
        || candidates[maximum_index].total_maximum_score <= average_champion.total_maximum_score
    {
        return None;
    }
    u8::try_from(maximum_index).ok()
}

/// Hydrate the search's retained, average-ranked solutions after search stops.
/// This function never expands search branches or calls the reference scorer.
pub fn hydrate_medley_search_solutions(
    input: &MedleySearchInputV1,
    solutions: &[MedleySearchSolutionV1],
) -> Result<MedleySearchHydrationV1, SearchIncompleteReasonV1> {
    if solutions.len() > RETAINED_SOLUTION_LIMIT || input.validate().is_err() {
        return Err(SearchIncompleteReasonV1::InvalidData);
    }
    let prepared_songs = prepare_songs(input)?;
    let candidates = solutions
        .iter()
        .map(|solution| hydrate_solution(input, &prepared_songs, solution))
        .collect::<Result<Vec<_>, _>>()?;
    let maximum_score_candidate_index = maximum_score_candidate_index(&candidates);
    Ok(MedleySearchHydrationV1 {
        candidates,
        maximum_score_candidate_index,
    })
}

#[cfg(test)]
mod tests {
    use bandori_medley_model::FixedMedleyEvaluationInputV1;
    use bandori_medley_reference::evaluate_fixed_medley;

    use super::*;
    use crate::{
        AreaItemConfigurationV1, CardAttributeV1, MedleySearchTeamV1, SearchCardSkillContextsV1,
        SearchCardV1,
    };

    const FIXTURE: &str =
        include_str!("../../bandori-medley-model/tests/fixtures/valid-fixed-medley-v1.json");

    fn search_input_and_solution() -> (MedleySearchInputV1, MedleySearchSolutionV1) {
        let fixed: FixedMedleyEvaluationInputV1 = serde_json::from_str(FIXTURE).unwrap();
        let reference = evaluate_fixed_medley(&fixed).unwrap();
        let cards = fixed
            .cards
            .iter()
            .map(|card| {
                let skill = card.skill;
                SearchCardV1 {
                    instance_id: card.instance_id,
                    master_card_id: card.master_card_id,
                    character_id: card.character_id,
                    band_id: 1,
                    attribute: CardAttributeV1::Powerful,
                    is_excluded: false,
                    character_parameter: [3_450.0, 0.0, 0.0],
                    event_parameter: [0.0, 0.0, 0.0],
                    skill_contexts: SearchCardSkillContextsV1 {
                        mixed: skill,
                        same_band: skill,
                        same_attribute: skill,
                        same_band_and_attribute: skill,
                    },
                }
            })
            .collect();
        let input = MedleySearchInputV1 {
            schema_version: crate::SEARCH_INPUT_SCHEMA_VERSION.to_owned(),
            scoring_rules_version: bandori_medley_model::SCORING_RULES_VERSION.to_owned(),
            perfect_rate: fixed.perfect_rate,
            cards,
            area_items: Vec::new(),
            area_configurations: vec![AreaItemConfigurationV1 {
                selected_area_item_ids: Vec::new(),
            }],
            songs: fixed.songs,
        };
        let teams = std::array::from_fn(|slot| MedleySearchTeamV1 {
            slot: slot as u8,
            member_instance_ids: fixed.teams[slot].member_instance_ids,
            average_score: reference.songs[slot].average_score(),
        });
        let solution = MedleySearchSolutionV1 {
            selected_area_item_ids: Vec::new(),
            teams,
            total_average_score: reference.total_average_score(),
        };
        (input, solution)
    }

    #[test]
    fn hydrates_one_retained_solution_and_fails_closed_on_average_mismatch() {
        let (input, solution) = search_input_and_solution();
        let hydration = hydrate_medley_search_solutions(&input, std::slice::from_ref(&solution))
            .expect("retained search solution hydrates");
        assert_eq!(hydration.candidates.len(), 1);
        assert_eq!(hydration.maximum_score_candidate_index, None);
        let candidate = &hydration.candidates[0];
        assert_eq!(
            candidate.total_average_score.to_bits(),
            solution.total_average_score.to_bits()
        );
        for (team, expected) in candidate.teams.iter().zip(solution.teams) {
            assert_eq!(team.member_instance_ids, expected.member_instance_ids);
            assert_eq!(team.parameters.card_power.to_bits(), 17_250.0_f64.to_bits());
            assert_eq!(
                team.parameters.deck_total_parameter.to_bits(),
                17_250.0_f64.to_bits()
            );
            assert_eq!(
                team.average_score.to_bits(),
                expected.average_score.to_bits()
            );
            assert!(team.minimum_score <= team.average_score);
            assert!(team.average_score <= team.maximum_score);
            assert_eq!(
                team.best_skill_order_member_instance_ids[5],
                team.member_instance_ids[2]
            );
            assert_eq!(team.score_order_count, 120);
            assert!((1..=120).contains(&team.maximum_score_order_count));
        }

        let mut mismatched = solution;
        mismatched.teams[0].average_score += 1.0;
        assert_eq!(
            hydrate_medley_search_solutions(&input, &[mismatched]),
            Err(SearchIncompleteReasonV1::ScorerDisagreement)
        );
    }

    fn hydrated_candidate(
        total_average_score: f64,
        total_maximum_score: f64,
    ) -> HydratedMedleySearchSolutionV1 {
        let team = HydratedMedleySearchTeamV1 {
            slot: 0,
            member_instance_ids: [0, 1, 2, 3, 4],
            parameters: MedleySearchTeamParameterBreakdownV1 {
                card_power: 0.0,
                area_item_power: 0.0,
                event_power: 0.0,
                deck_total_parameter: 0.0,
            },
            minimum_score: 0.0,
            average_score: 0.0,
            maximum_score: 0.0,
            best_skill_order_member_instance_ids: [0, 1, 2, 3, 4, 2],
            maximum_score_order_count: 120,
            score_order_count: 120,
        };
        HydratedMedleySearchSolutionV1 {
            selected_area_item_ids: Vec::new(),
            teams: [team; 3],
            total_minimum_score: 0.0,
            total_average_score,
            total_maximum_score,
        }
    }

    #[test]
    fn reports_only_a_distinct_strictly_higher_maximum_candidate() {
        let champion = hydrated_candidate(100.0, 120.0);
        let lower_average_higher_maximum = hydrated_candidate(90.0, 130.0);
        assert_eq!(
            maximum_score_candidate_index(&[champion.clone(), lower_average_higher_maximum]),
            Some(1)
        );
        assert_eq!(
            maximum_score_candidate_index(&[champion.clone(), hydrated_candidate(90.0, 120.0)]),
            None
        );
        assert_eq!(maximum_score_candidate_index(&[champion]), None);
    }
}
