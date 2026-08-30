use std::cmp::Ordering;
use std::collections::HashSet;

use bandori_medley_model::{
    CardScoringInputV1, DifficultyV1, ExactProbabilityV1, FixedMedleyEvaluationInputV1,
    FixedTeamV1, MedleySongV1, ResolvedScoreSkillV1, SCORING_INPUT_SCHEMA_VERSION,
    SCORING_RULES_VERSION, ScoringNoteV1, SkillBehaviorV1,
};
use bandori_medley_reference::evaluate_fixed_medley;
use bandori_medley_search::{
    AreaItemConfigurationV1, CardAttributeV1, MedleySearchInputV1, MedleySearchOutcomeV1,
    MedleySearchSolutionV1, MedleySearchTeamV1, SEARCH_INPUT_SCHEMA_VERSION, SearchAreaItemV1,
    SearchCardSkillContextsV1, SearchCardV1, SearchControl, SearchIncompleteReasonV1,
    search_medley,
};

const CHARACTER_COUNT: usize = 5;
const CARD_VARIANTS_PER_CHARACTER: usize = 3;
const TEAM_COUNT: usize = 3_usize.pow(CHARACTER_COUNT as u32);

type TeamScoreTable = Vec<[[f64; 3]; 5]>;

fn score_skill(master_skill_id: u32, score_up_percent: f64) -> ResolvedScoreSkillV1 {
    ResolvedScoreSkillV1 {
        master_skill_id,
        skill_level: 1,
        duration_seconds: 1.5,
        behavior: SkillBehaviorV1::Score { score_up_percent },
        rate_up_with_perfect: None,
    }
}

fn fixture() -> MedleySearchInputV1 {
    let cards = (0_u32..15)
        .map(|instance_id| {
            let character_index = instance_id / 3;
            let variant = instance_id % 3;
            let base_percent = 20.0 + f64::from(character_index * 3 + variant * 7);
            SearchCardV1 {
                instance_id,
                master_card_id: instance_id + 1,
                character_id: character_index + 1,
                band_id: 1,
                attribute: CardAttributeV1::Powerful,
                is_excluded: false,
                character_parameter: [
                    1000.0 + f64::from(character_index * 37 + variant * 73),
                    800.0 + f64::from(character_index * 11 + variant * 29),
                    600.0 + f64::from(character_index * 7 + variant * 17),
                ],
                event_parameter: [
                    f64::from(character_index + variant * 3),
                    f64::from(character_index * 2 + variant),
                    f64::from(variant),
                ],
                skill_contexts: SearchCardSkillContextsV1 {
                    mixed: score_skill(instance_id + 1, base_percent),
                    same_band: score_skill(instance_id + 1, base_percent + 2.0),
                    same_attribute: score_skill(instance_id + 1, base_percent + 3.0),
                    same_band_and_attribute: score_skill(instance_id + 1, base_percent + 8.0),
                },
            }
        })
        .collect();
    let songs = std::array::from_fn(|slot| MedleySongV1 {
        slot: u8::try_from(slot).expect("three song slots fit u8"),
        song_id: u32::try_from(slot + 1).expect("three song IDs fit u32"),
        difficulty: DifficultyV1::Expert,
        play_level: 20 + u16::try_from(slot * 3).expect("tiny play level fits u16"),
        notes: (0_u32..7)
            .map(|note_id| ScoringNoteV1 {
                note_id,
                time_seconds: f64::from(note_id),
                is_skill_trigger: note_id < 6,
            })
            .collect(),
    });

    MedleySearchInputV1 {
        schema_version: SEARCH_INPUT_SCHEMA_VERSION.to_owned(),
        scoring_rules_version: SCORING_RULES_VERSION.to_owned(),
        perfect_rate: ExactProbabilityV1 {
            numerator: 1,
            decimal_scale: 0,
        },
        cards,
        area_items: vec![SearchAreaItemV1 {
            area_item_id: 1,
            target_band_ids: vec![1],
            target_attributes: vec![CardAttributeV1::Powerful],
            parameter_rates: [0.125, 0.0625, 0.03125],
        }],
        area_configurations: vec![AreaItemConfigurationV1 {
            selected_area_item_ids: vec![1],
        }],
        songs,
    }
}

fn choices_from_index(mut index: usize) -> [u32; CHARACTER_COUNT] {
    std::array::from_fn(|_| {
        let choice = index % CARD_VARIANTS_PER_CHARACTER;
        index /= CARD_VARIANTS_PER_CHARACTER;
        u32::try_from(choice).expect("three variants fit u32")
    })
}

fn index_from_choices(choices: [u32; CHARACTER_COUNT]) -> usize {
    choices.into_iter().rev().fold(0_usize, |index, choice| {
        index * CARD_VARIANTS_PER_CHARACTER + choice as usize
    })
}

fn team_from_choices(choices: [u32; CHARACTER_COUNT]) -> [u32; 5] {
    std::array::from_fn(|character_index| {
        u32::try_from(character_index * CARD_VARIANTS_PER_CHARACTER)
            .expect("tiny instance base fits u32")
            + choices[character_index]
    })
}

fn team_from_index(index: usize) -> [u32; 5] {
    team_from_choices(choices_from_index(index))
}

fn members_with_leader(team: [u32; 5], leader_position: usize) -> [u32; 5] {
    let leader = team[leader_position];
    let others = team
        .into_iter()
        .filter(|instance_id| *instance_id != leader)
        .collect::<Vec<_>>();
    [others[0], others[1], leader, others[2], others[3]]
}

fn parameter_sum(parameter: [f64; 3]) -> f64 {
    (parameter[0] + parameter[1]) + parameter[2]
}

fn team_deck_parameter(
    input: &MedleySearchInputV1,
    configuration: &AreaItemConfigurationV1,
    members: [u32; 5],
) -> f64 {
    let cards = members.map(|instance_id| &input.cards[instance_id as usize]);

    let mut card_power = 0.0_f64;
    for card in cards {
        card_power += parameter_sum(card.character_parameter);
    }

    let mut area_item_power = 0.0_f64;
    for selected_id in &configuration.selected_area_item_ids {
        let item = input
            .area_items
            .iter()
            .find(|item| item.area_item_id == *selected_id)
            .expect("fixture configuration references an owned item");
        let mut item_power = 0.0_f64;
        for card in cards {
            if item.target_band_ids.contains(&card.band_id)
                && item.target_attributes.contains(&card.attribute)
            {
                item_power += card.character_parameter[0] * item.parameter_rates[0];
                item_power += card.character_parameter[1] * item.parameter_rates[1];
                item_power += card.character_parameter[2] * item.parameter_rates[2];
            }
        }
        area_item_power += item_power;
    }

    let mut event_power = 0.0_f64;
    for card in cards {
        event_power += parameter_sum(card.event_parameter);
    }
    (card_power + area_item_power) + event_power
}

fn resolved_team_skill(
    input: &MedleySearchInputV1,
    team: [u32; 5],
    instance_id: u32,
) -> ResolvedScoreSkillV1 {
    let cards = team.map(|member| &input.cards[member as usize]);
    let is_same_band = cards.iter().all(|card| card.band_id == cards[0].band_id);
    let is_same_attribute = cards
        .iter()
        .all(|card| card.attribute == cards[0].attribute);
    let contexts = input.cards[instance_id as usize].skill_contexts;
    match (is_same_band, is_same_attribute) {
        (false, false) => contexts.mixed,
        (true, false) => contexts.same_band,
        (false, true) => contexts.same_attribute,
        (true, true) => contexts.same_band_and_attribute,
    }
}

fn fixed_input(
    input: &MedleySearchInputV1,
    configuration: &AreaItemConfigurationV1,
    teams: [[u32; 5]; 3],
    leader_position: usize,
) -> FixedMedleyEvaluationInputV1 {
    let ordered_teams = teams.map(|team| members_with_leader(team, leader_position));
    let mut cards = input
        .cards
        .iter()
        .map(|card| CardScoringInputV1 {
            instance_id: card.instance_id,
            master_card_id: card.master_card_id,
            character_id: card.character_id,
            skill: card.skill_contexts.mixed,
        })
        .collect::<Vec<_>>();
    for team in teams {
        for instance_id in team {
            cards[instance_id as usize].skill = resolved_team_skill(input, team, instance_id);
        }
    }
    let fixed_teams = std::array::from_fn(|slot| FixedTeamV1 {
        slot: u8::try_from(slot).expect("three team slots fit u8"),
        member_instance_ids: ordered_teams[slot],
        deck_total_parameter: team_deck_parameter(input, configuration, ordered_teams[slot]),
    });
    FixedMedleyEvaluationInputV1 {
        schema_version: SCORING_INPUT_SCHEMA_VERSION.to_owned(),
        scoring_rules_version: SCORING_RULES_VERSION.to_owned(),
        perfect_rate: input.perfect_rate,
        cards,
        teams: fixed_teams,
        songs: input.songs.clone(),
    }
}

fn reference_team_scores(
    input: &MedleySearchInputV1,
    configuration: &AreaItemConfigurationV1,
) -> TeamScoreTable {
    let mut scores = vec![[[f64::NAN; 3]; 5]; TEAM_COUNT];

    // Fix the first character's choice at zero, then add 0/1/2 modulo three.
    // Each orbit contains three disjoint teams and the 81 orbits cover all 243 teams.
    for suffix_index in 0..3_usize.pow((CHARACTER_COUNT - 1) as u32) {
        let mut base_choices = [0_u32; CHARACTER_COUNT];
        let suffix_choices = choices_from_index(suffix_index);
        base_choices[1..].copy_from_slice(&suffix_choices[..CHARACTER_COUNT - 1]);
        let orbit_choices = std::array::from_fn::<_, 3, _>(|shift| {
            base_choices.map(|choice| {
                (choice + u32::try_from(shift).expect("three shifts fit u32"))
                    % CARD_VARIANTS_PER_CHARACTER as u32
            })
        });
        let orbit_indices = orbit_choices.map(index_from_choices);
        let orbit_teams = orbit_choices.map(team_from_choices);

        for rotation in 0..3 {
            let slot_indices: [usize; 3] =
                std::array::from_fn(|slot| orbit_indices[(slot + rotation) % 3]);
            let slot_teams = std::array::from_fn(|slot| orbit_teams[(slot + rotation) % 3]);
            for (leader_position, _) in [(); 5].iter().enumerate() {
                let trace = evaluate_fixed_medley(&fixed_input(
                    input,
                    configuration,
                    slot_teams,
                    leader_position,
                ))
                .expect("tiny fixed medley must score in the reference oracle");
                for slot in 0..3 {
                    let entry = &mut scores[slot_indices[slot]][leader_position][slot];
                    assert!(entry.is_nan(), "each cached score is filled exactly once");
                    *entry = trace.songs[slot].average_score();
                }
            }
        }
    }

    assert!(
        scores
            .iter()
            .flatten()
            .flatten()
            .all(|score| score.is_finite())
    );
    scores
}

#[derive(Clone, Copy)]
struct OracleTeam {
    member_set: [u32; 5],
    song_scores: [f64; 3],
    leaders: [u32; 3],
}

fn oracle_teams(scores: &TeamScoreTable) -> Vec<OracleTeam> {
    scores
        .iter()
        .enumerate()
        .map(|(team_index, leader_scores)| {
            let member_set = team_from_index(team_index);
            let mut song_scores = [0.0_f64; 3];
            let mut leaders = [0_u32; 3];
            for song_slot in 0..3 {
                let mut best_score = leader_scores[0][song_slot];
                let mut best_leader = member_set[0];
                for leader_position in 1..5 {
                    let score = leader_scores[leader_position][song_slot];
                    if score > best_score {
                        best_score = score;
                        best_leader = member_set[leader_position];
                    }
                }
                song_scores[song_slot] = best_score;
                leaders[song_slot] = best_leader;
            }
            OracleTeam {
                member_set,
                song_scores,
                leaders,
            }
        })
        .collect()
}

fn solution_identity_cmp(
    left: &MedleySearchSolutionV1,
    right: &MedleySearchSolutionV1,
) -> Ordering {
    left.selected_area_item_ids
        .cmp(&right.selected_area_item_ids)
        .then_with(|| {
            left.teams
                .iter()
                .map(|team| team.member_instance_ids)
                .cmp(right.teams.iter().map(|team| team.member_instance_ids))
        })
}

fn is_better(candidate: &MedleySearchSolutionV1, incumbent: &MedleySearchSolutionV1) -> bool {
    candidate.total_average_score > incumbent.total_average_score
        || (candidate.total_average_score == incumbent.total_average_score
            && solution_identity_cmp(candidate, incumbent) == Ordering::Less)
}

fn exhaustive_oracle(input: &MedleySearchInputV1) -> MedleySearchSolutionV1 {
    let mut best = None::<MedleySearchSolutionV1>;
    for configuration in &input.area_configurations {
        let teams = oracle_teams(&reference_team_scores(input, configuration));
        for first in &teams {
            for second in &teams {
                if first
                    .member_set
                    .iter()
                    .any(|instance_id| second.member_set.contains(instance_id))
                {
                    continue;
                }
                let third_choices = std::array::from_fn(|character_index| {
                    let first_choice = first.member_set[character_index] % 3;
                    let second_choice = second.member_set[character_index] % 3;
                    (0_u32..3)
                        .find(|choice| *choice != first_choice && *choice != second_choice)
                        .expect("two distinct choices leave one third choice")
                });
                let third = &teams[index_from_choices(third_choices)];
                let selected = [first, second, third];
                let output_teams = std::array::from_fn(|slot| MedleySearchTeamV1 {
                    slot: u8::try_from(slot).expect("three team slots fit u8"),
                    member_instance_ids: members_with_leader(
                        selected[slot].member_set,
                        selected[slot]
                            .member_set
                            .iter()
                            .position(|instance_id| *instance_id == selected[slot].leaders[slot])
                            .expect("oracle leader belongs to its team"),
                    ),
                    average_score: selected[slot].song_scores[slot],
                });
                let solution = MedleySearchSolutionV1 {
                    selected_area_item_ids: configuration.selected_area_item_ids.clone(),
                    teams: output_teams,
                    total_average_score: (output_teams[0].average_score
                        + output_teams[1].average_score)
                        + output_teams[2].average_score,
                };
                if best
                    .as_ref()
                    .is_none_or(|incumbent| is_better(&solution, incumbent))
                {
                    best = Some(solution);
                }
            }
        }
    }
    best.expect("15 cards across five characters have a complete assignment")
}

fn assert_solution_bits_and_identity(
    actual: &MedleySearchSolutionV1,
    expected: &MedleySearchSolutionV1,
) {
    assert_eq!(
        actual.selected_area_item_ids,
        expected.selected_area_item_ids
    );
    assert_eq!(
        actual.total_average_score.to_bits(),
        expected.total_average_score.to_bits()
    );
    for slot in 0..3 {
        assert_eq!(actual.teams[slot].slot, expected.teams[slot].slot);
        assert_eq!(
            actual.teams[slot].member_instance_ids,
            expected.teams[slot].member_instance_ids
        );
        assert_eq!(
            actual.teams[slot].average_score.to_bits(),
            expected.teams[slot].average_score.to_bits()
        );
        assert_eq!(
            actual.teams[slot].member_instance_ids[2], expected.teams[slot].member_instance_ids[2],
            "the independently selected leader must occupy member index two"
        );
    }
}

#[test]
fn tiny_search_matches_the_complete_reference_oracle() {
    let input = fixture();
    input.validate().expect("tiny search fixture must validate");
    let expected = exhaustive_oracle(&input);
    let mut never_stop = || None;
    let mut control = SearchControl::new(1024 * 1024, &mut never_stop);

    let MedleySearchOutcomeV1::Exact {
        best: Some(actual),
        diagnostics,
        ..
    } = search_medley(&input, &mut control)
    else {
        panic!("complete tiny input must return a proven exact solution");
    };

    assert_solution_bits_and_identity(&actual, &expected);
    assert_eq!(diagnostics.configurations_total, 1);
    assert_eq!(diagnostics.configurations_completed, 1);

    let physical_cards = actual
        .teams
        .iter()
        .flat_map(|team| team.member_instance_ids)
        .collect::<HashSet<_>>();
    assert_eq!(
        physical_cards.len(),
        15,
        "physical cards cannot cross teams"
    );
    for team in &actual.teams {
        let characters = team
            .member_instance_ids
            .map(|instance_id| input.cards[instance_id as usize].character_id)
            .into_iter()
            .collect::<HashSet<_>>();
        assert_eq!(characters.len(), 5, "one team must use five characters");
    }
}

#[test]
fn tiny_memory_budget_is_incomplete_instead_of_exact() {
    let input = fixture();
    let mut never_stop = || None;
    let mut control = SearchControl::new(0, &mut never_stop);

    match search_medley(&input, &mut control) {
        MedleySearchOutcomeV1::Incomplete {
            reason: SearchIncompleteReasonV1::MemoryExhausted,
            ..
        } => {}
        MedleySearchOutcomeV1::Incomplete { reason, .. } => {
            panic!("tiny memory budget ended for unexpected reason: {reason:?}")
        }
        MedleySearchOutcomeV1::Exact { .. } => {
            panic!("memory exhaustion must never be reported as exact")
        }
    }
}
