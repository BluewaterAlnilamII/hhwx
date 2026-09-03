use std::cmp::Ordering;
use std::collections::HashSet;

use bandori_medley_model::{
    CardScoringInputV1, DifficultyV1, ExactProbabilityV1, FixedMedleyEvaluationInputV1,
    FixedTeamV1, MedleySongV1, ResolvedScoreSkillV1, SCORING_INPUT_SCHEMA_VERSION,
    SCORING_RULES_VERSION, ScoringNoteV1, SkillBehaviorV1,
};
use bandori_medley_reference::evaluate_fixed_medley;
use bandori_medley_search::{
    AreaItemConfigurationV1, CardAttributeV1, MedleySearchDiagnosticsV1, MedleySearchInputV1,
    MedleySearchOutcomeV1, MedleySearchSolutionV1, MedleySearchTeamV1, SEARCH_INPUT_SCHEMA_VERSION,
    SearchAreaItemV1, SearchCardSkillContextsV1, SearchCardV1, SearchControl,
    SearchIncompleteReasonV1, search_medley,
};

const BASE_CHARACTER_COUNT: usize = 5;
const CARD_VARIANTS_PER_CHARACTER: usize = 3;
const LARGE_MEMORY_BUDGET: usize = 1024 * 1024;
const SMALL_MEMORY_BUDGET: usize = 16 * 1024;

fn score_skill(master_skill_id: u32, score_up_percent: f64) -> ResolvedScoreSkillV1 {
    ResolvedScoreSkillV1 {
        master_skill_id,
        skill_level: 1,
        duration_seconds: 1.5,
        behavior: SkillBehaviorV1::Score { score_up_percent },
        is_rate_up_with_perfect: false,
    }
}

fn fixture() -> MedleySearchInputV1 {
    let cards = (0_u32
        ..u32::try_from(BASE_CHARACTER_COUNT * CARD_VARIANTS_PER_CHARACTER)
            .expect("tiny card count fits u32"))
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

fn conflicting_contexts_fixture() -> MedleySearchInputV1 {
    let mut input = fixture();
    for card in &mut input.cards {
        let character_index = card.instance_id / 3;
        let variant = card.instance_id % 3;
        // A character keeps its band, while its physical cards can have different
        // attributes. The strong variants compete across all three song slots.
        card.attribute = if variant == 0 || (variant == 2 && character_index % 2 == 0) {
            CardAttributeV1::Powerful
        } else {
            CardAttributeV1::Cool
        };
        if variant == (character_index + 1) % 3 {
            card.character_parameter[0] += 1400.0 + f64::from(character_index * 200);
        }
        let base_percent = 15.0 + f64::from(character_index * 6 + variant * 3);
        let make_skill = |percent| {
            let mut skill = score_skill(card.instance_id + 1, percent);
            skill.duration_seconds = [0.5, 1.5, 2.5][variant as usize];
            skill
        };
        card.skill_contexts = SearchCardSkillContextsV1 {
            mixed: make_skill(base_percent),
            same_band: make_skill(base_percent + 5.0),
            same_attribute: make_skill(base_percent + 70.0),
            same_band_and_attribute: make_skill(base_percent + 100.0),
        };
    }
    for note in &mut input.songs[1].notes {
        note.time_seconds *= 0.25;
    }
    input.songs[2].notes[6].time_seconds = 5.25;
    input.area_items.push(SearchAreaItemV1 {
        area_item_id: 2,
        target_band_ids: vec![1],
        target_attributes: vec![CardAttributeV1::Cool],
        parameter_rates: [0.0625, 0.125, 0.09375],
    });
    input.area_configurations.push(AreaItemConfigurationV1 {
        selected_area_item_ids: vec![2],
    });
    input
}

fn optional_character_fixture() -> MedleySearchInputV1 {
    let mut input = conflicting_contexts_fixture();
    let skill_contexts = |master_skill_id, base_percent| SearchCardSkillContextsV1 {
        mixed: score_skill(master_skill_id, base_percent),
        same_band: score_skill(master_skill_id, base_percent + 5.0),
        same_attribute: score_skill(master_skill_id, base_percent + 10.0),
        same_band_and_attribute: score_skill(master_skill_id, base_percent + 15.0),
    };
    input.cards.push(SearchCardV1 {
        instance_id: 15,
        master_card_id: 16,
        character_id: 6,
        band_id: 2,
        attribute: CardAttributeV1::Cool,
        is_excluded: false,
        character_parameter: [20_000.0, 18_000.0, 16_000.0],
        event_parameter: [500.0, 400.0, 300.0],
        skill_contexts: skill_contexts(16, 180.0),
    });
    input.cards.push(SearchCardV1 {
        instance_id: 16,
        master_card_id: 17,
        character_id: 7,
        band_id: 1,
        attribute: CardAttributeV1::Powerful,
        is_excluded: true,
        character_parameter: [500_000.0, 500_000.0, 500_000.0],
        event_parameter: [50_000.0, 50_000.0, 50_000.0],
        skill_contexts: skill_contexts(17, 500.0),
    });
    input
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
    leader_positions: [usize; 3],
) -> FixedMedleyEvaluationInputV1 {
    let ordered_source_teams: [[u32; 5]; 3] =
        std::array::from_fn(|slot| members_with_leader(teams[slot], leader_positions[slot]));
    let mut source_instance_ids = teams.into_iter().flatten().collect::<Vec<_>>();
    source_instance_ids.sort_unstable();
    source_instance_ids.dedup();
    assert_eq!(
        source_instance_ids.len(),
        15,
        "reference teams must be disjoint"
    );
    let local_id = |source_id: u32| {
        u32::try_from(
            source_instance_ids
                .binary_search(&source_id)
                .expect("selected source card has a local reference ID"),
        )
        .expect("15 local card IDs fit u32")
    };
    let mut cards = source_instance_ids
        .iter()
        .enumerate()
        .map(|(local_index, source_id)| {
            let card = &input.cards[*source_id as usize];
            CardScoringInputV1 {
                instance_id: u32::try_from(local_index).expect("15 local card IDs fit u32"),
                master_card_id: card.master_card_id,
                character_id: card.character_id,
                skill: card.skill_contexts.mixed,
            }
        })
        .collect::<Vec<_>>();
    for team in teams {
        for source_id in team {
            cards[local_id(source_id) as usize].skill = resolved_team_skill(input, team, source_id);
        }
    }
    let ordered_local_teams = ordered_source_teams.map(|team| team.map(local_id));
    let fixed_teams = std::array::from_fn(|slot| FixedTeamV1 {
        slot: u8::try_from(slot).expect("three team slots fit u8"),
        member_instance_ids: ordered_local_teams[slot],
        deck_total_parameter: team_deck_parameter(input, configuration, ordered_source_teams[slot]),
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

fn legal_team_member_sets(input: &MedleySearchInputV1) -> Vec<[u32; 5]> {
    fn visit(
        input: &MedleySearchInputV1,
        eligible: &[u32],
        start: usize,
        members: &mut [u32; 5],
        member_count: usize,
        teams: &mut Vec<[u32; 5]>,
    ) {
        if member_count == 5 {
            teams.push(*members);
            return;
        }
        let needed = 5 - member_count;
        if eligible.len().saturating_sub(start) < needed {
            return;
        }
        for index in start..=eligible.len() - needed {
            let instance_id = eligible[index];
            let character_id = input.cards[instance_id as usize].character_id;
            if members[..member_count]
                .iter()
                .any(|member| input.cards[*member as usize].character_id == character_id)
            {
                continue;
            }
            members[member_count] = instance_id;
            visit(input, eligible, index + 1, members, member_count + 1, teams);
        }
    }

    let eligible = input
        .cards
        .iter()
        .filter(|card| !card.is_excluded)
        .map(|card| card.instance_id)
        .collect::<Vec<_>>();
    let mut teams = Vec::new();
    visit(input, &eligible, 0, &mut [0; 5], 0, &mut teams);
    teams
}

#[derive(Clone, Copy)]
struct ReferenceTeam {
    member_set: [u32; 5],
    member_mask: u128,
    song_scores: [f64; 3],
    leaders: [u32; 3],
}

fn member_mask(members: [u32; 5]) -> u128 {
    members.into_iter().fold(0_u128, |mask, instance_id| {
        mask | 1_u128
            .checked_shl(instance_id)
            .expect("tiny reference fixture uses at most 128 cards")
    })
}

fn disjoint_fillers(target: [u32; 5], teams: &[[u32; 5]]) -> [[u32; 5]; 2] {
    let target_mask = member_mask(target);
    for &first in teams {
        let first_mask = member_mask(first);
        if target_mask & first_mask != 0 {
            continue;
        }
        for &second in teams {
            let second_mask = member_mask(second);
            if (target_mask | first_mask) & second_mask == 0 {
                return [first, second];
            }
        }
    }
    panic!("every team in the tiny reference fixture must extend to three disjoint teams");
}

fn reference_teams(
    input: &MedleySearchInputV1,
    configuration: &AreaItemConfigurationV1,
) -> Vec<ReferenceTeam> {
    let member_sets = legal_team_member_sets(input);
    member_sets
        .iter()
        .copied()
        .map(|member_set| {
            // The fixed reference scorer requires exactly three disjoint teams.
            // Filler-team membership cannot affect the target song's team score.
            let fillers = disjoint_fillers(member_set, &member_sets);
            let mut leader_scores = [[f64::NAN; 3]; 5];
            for song_slot in 0..3 {
                let mut teams = [fillers[0], fillers[1], member_set];
                teams.swap(song_slot, 2);
                for (leader_position, scores) in leader_scores.iter_mut().enumerate() {
                    let mut leader_positions = [0; 3];
                    leader_positions[song_slot] = leader_position;
                    let trace = evaluate_fixed_medley(&fixed_input(
                        input,
                        configuration,
                        teams,
                        leader_positions,
                    ))
                    .expect("tiny fixed medley must score in the independent reference");
                    scores[song_slot] = trace.songs[song_slot].average_score();
                }
            }

            let mut song_scores = [0.0_f64; 3];
            let mut leaders = [0_u32; 3];
            for song_slot in 0..3 {
                let mut best_leader = 0;
                for leader_position in 1..5 {
                    if leader_scores[leader_position][song_slot]
                        > leader_scores[best_leader][song_slot]
                    {
                        best_leader = leader_position;
                    }
                }
                song_scores[song_slot] = leader_scores[best_leader][song_slot];
                leaders[song_slot] = member_set[best_leader];
            }
            ReferenceTeam {
                member_set,
                member_mask: member_mask(member_set),
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

fn exhaustive_reference(input: &MedleySearchInputV1) -> MedleySearchSolutionV1 {
    let mut best = None::<MedleySearchSolutionV1>;
    let mut independent_song_maximum = 0.0_f64;
    for configuration in &input.area_configurations {
        let teams = reference_teams(input, configuration);
        let standalone: [f64; 3] = std::array::from_fn(|slot| {
            teams
                .iter()
                .map(|team| team.song_scores[slot])
                .fold(0.0_f64, f64::max)
        });
        independent_song_maximum =
            independent_song_maximum.max((standalone[0] + standalone[1]) + standalone[2]);
        for first in &teams {
            for second in &teams {
                if first.member_mask & second.member_mask != 0 {
                    continue;
                }
                let used_mask = first.member_mask | second.member_mask;
                for third in &teams {
                    if used_mask & third.member_mask != 0 {
                        continue;
                    }
                    let selected = [first, second, third];
                    let output_teams = std::array::from_fn(|slot| MedleySearchTeamV1 {
                        slot: u8::try_from(slot).expect("three team slots fit u8"),
                        member_instance_ids: members_with_leader(
                            selected[slot].member_set,
                            selected[slot]
                                .member_set
                                .iter()
                                .position(|instance_id| {
                                    *instance_id == selected[slot].leaders[slot]
                                })
                                .expect("reference leader belongs to its team"),
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
    }
    let best = best.expect("the tiny fixture has a complete assignment");
    assert!(
        best.total_average_score < independent_song_maximum,
        "the fixture must require a joint compromise over shared physical cards"
    );
    best
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

fn assert_exact_search(
    input: &MedleySearchInputV1,
    expected: &MedleySearchSolutionV1,
    memory_budget: usize,
) -> MedleySearchDiagnosticsV1 {
    let mut never_stop = || None;
    let mut control = SearchControl::new(memory_budget, &mut never_stop);

    let outcome = search_medley(input, &mut control);
    let MedleySearchOutcomeV1::Exact {
        best: Some(actual),
        diagnostics,
        ..
    } = outcome
    else {
        panic!("tiny search with {memory_budget} bytes must finish exactly: {outcome:?}");
    };

    assert_solution_bits_and_identity(&actual, expected);
    assert_eq!(
        diagnostics.configurations_total,
        input.area_configurations.len() as u64
    );
    assert_eq!(
        diagnostics.configurations_completed,
        diagnostics.configurations_total
    );
    assert!(diagnostics.peak_search_storage_bytes <= memory_budget as u64);

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
    diagnostics
}

fn assert_budget_independent_result(
    input: &MedleySearchInputV1,
    expected: &MedleySearchSolutionV1,
) {
    let large = assert_exact_search(input, expected, LARGE_MEMORY_BUDGET);
    let small = assert_exact_search(input, expected, SMALL_MEMORY_BUDGET);
    assert!(
        large.local_blocks > 0,
        "the fixture must reach an exact join"
    );
    assert!(
        small.local_blocks > 1,
        "the constrained run must preserve cross-block coverage"
    );
    assert!(
        small.partial_nodes > large.partial_nodes,
        "the smaller budget must force further splitting: large={large:?}, small={small:?}"
    );
    // Stronger early solutions can prune the additional children before they
    // become blocks. Check the split and storage directly, not block count.
    assert!(small.peak_candidate_bytes < large.peak_candidate_bytes);
    eprintln!(
        "{}-configuration fixture: {} -> {} nodes; small-budget storage {} bytes",
        input.area_configurations.len(),
        large.partial_nodes,
        small.partial_nodes,
        small.peak_search_storage_bytes
    );
}

#[test]
fn tiny_search_matches_the_independent_exhaustive_reference_across_memory_budgets() {
    let input = fixture();
    input.validate().expect("tiny search fixture must validate");
    let expected = exhaustive_reference(&input);
    assert_budget_independent_result(&input, &expected);
}

#[test]
fn tiny_search_keeps_cross_block_combinations_with_contexts_and_card_conflicts() {
    let input = conflicting_contexts_fixture();
    input.validate().expect("context fixture must validate");
    let expected = exhaustive_reference(&input);
    let same_attribute_teams = expected
        .teams
        .iter()
        .filter(|team| {
            let first = input.cards[team.member_instance_ids[0] as usize].attribute;
            team.member_instance_ids
                .iter()
                .all(|id| input.cards[*id as usize].attribute == first)
        })
        .count();
    assert!(
        (1..3).contains(&same_attribute_teams),
        "the winning fixture must use both uniform and mixed attribute contexts: {expected:?}"
    );
    assert_budget_independent_result(&input, &expected);
}

#[test]
fn tiny_search_matches_the_reference_when_characters_and_cards_can_be_unused() {
    let input = optional_character_fixture();
    input
        .validate()
        .expect("optional-character fixture must validate");
    let expected = exhaustive_reference(&input);
    let selected = expected
        .teams
        .iter()
        .flat_map(|team| team.member_instance_ids)
        .collect::<HashSet<_>>();
    let unused = input
        .cards
        .iter()
        .filter(|card| !card.is_excluded && !selected.contains(&card.instance_id))
        .map(|card| card.instance_id)
        .collect::<Vec<_>>();
    let eligible_characters = input
        .cards
        .iter()
        .filter(|card| !card.is_excluded)
        .map(|card| card.character_id)
        .collect::<HashSet<_>>();
    let omitted_characters = expected
        .teams
        .iter()
        .flat_map(|team| {
            let selected_characters = team
                .member_instance_ids
                .map(|id| input.cards[id as usize].character_id)
                .into_iter()
                .collect::<HashSet<_>>();
            eligible_characters
                .difference(&selected_characters)
                .copied()
                .collect::<Vec<_>>()
        })
        .collect::<HashSet<_>>();

    assert_eq!(input.area_configurations.len(), 2);
    assert_eq!(eligible_characters.len(), 6);
    assert_eq!(
        unused.len(),
        1,
        "one eligible physical card must remain unused"
    );
    assert!(
        selected.contains(&15),
        "the sixth character must improve one team"
    );
    assert!(
        !selected.contains(&16),
        "the excluded high-value card must stay out"
    );
    assert!(
        omitted_characters.len() >= 2,
        "different teams must omit different characters"
    );
    assert_exact_search(&input, &expected, LARGE_MEMORY_BUDGET);
    assert_exact_search(&input, &expected, SMALL_MEMORY_BUDGET);
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
