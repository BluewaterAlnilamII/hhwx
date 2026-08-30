use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::mem::size_of;

use crate::candidate::{
    CandidateFailure, CompactCandidate, candidates_overlap, evaluate_candidate,
    member_order_for_leader,
};
use crate::upper_bound::{UpperBoundEngine, add_song_uppers};
use crate::{
    AreaItemConfigurationV1, MedleySearchDiagnosticsV1, MedleySearchInputV1, MedleySearchOutcomeV1,
    MedleySearchSolutionV1, MedleySearchTeamV1, SearchControl, SearchIncompleteReasonV1,
    SearchStopReason,
};

const DIAGNOSTIC_SOLUTION_LIMIT: usize = 10;
const TEAM_SIZE: usize = 5;
const MEDLEY_TEAM_COUNT: usize = 3;

#[derive(Debug)]
struct CharacterGroup {
    instance_ids: Vec<u32>,
}

#[derive(Clone, Copy, Debug)]
struct ConfigurationPlan {
    configuration_index: usize,
    root_song_uppers: [f64; 3],
    whole_medley_upper: f64,
}

#[derive(Clone, Copy, Debug)]
struct SearchAbort {
    reason: SearchIncompleteReasonV1,
}

struct RunState<'control, 'callback> {
    control: &'control mut SearchControl<'callback>,
    diagnostics: MedleySearchDiagnosticsV1,
    best: Option<MedleySearchSolutionV1>,
    discovered: Vec<MedleySearchSolutionV1>,
}

fn abort(reason: SearchIncompleteReasonV1) -> SearchAbort {
    SearchAbort { reason }
}

fn add_counter(counter: &mut u64, amount: u64) -> Result<(), SearchAbort> {
    *counter = counter
        .checked_add(amount)
        .ok_or_else(|| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))?;
    Ok(())
}

impl RunState<'_, '_> {
    fn poll_stop(&mut self) -> Result<(), SearchAbort> {
        match self.control.poll_stop() {
            None => Ok(()),
            Some(SearchStopReason::Cancelled) => Err(abort(SearchIncompleteReasonV1::Cancelled)),
            Some(SearchStopReason::TimedOut) => Err(abort(SearchIncompleteReasonV1::TimedOut)),
        }
    }

    fn incumbent_score(&self) -> Option<f64> {
        self.best
            .as_ref()
            .map(|solution| solution.total_average_score)
    }

    fn record_solution(&mut self, solution: MedleySearchSolutionV1) -> Result<(), SearchAbort> {
        add_counter(&mut self.diagnostics.feasible_medleys, 1)?;
        let becomes_best = self
            .best
            .as_ref()
            .is_none_or(|best| solution_is_better(&solution, best));
        if becomes_best {
            self.best = Some(solution.clone());
            add_counter(&mut self.diagnostics.incumbent_changes, 1)?;
        }

        if let Some(existing) = self
            .discovered
            .iter_mut()
            .find(|existing| solution_identity_cmp(existing, &solution) == Ordering::Equal)
        {
            if solution_is_better(&solution, existing) {
                *existing = solution;
            }
        } else {
            self.discovered.push(solution);
        }
        self.discovered.sort_by(solution_rank_cmp);
        self.discovered.truncate(DIAGNOSTIC_SOLUTION_LIMIT);
        Ok(())
    }
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

fn solution_rank_cmp(left: &MedleySearchSolutionV1, right: &MedleySearchSolutionV1) -> Ordering {
    right
        .total_average_score
        .total_cmp(&left.total_average_score)
        .then_with(|| solution_identity_cmp(left, right))
}

fn solution_is_better(
    candidate: &MedleySearchSolutionV1,
    incumbent: &MedleySearchSolutionV1,
) -> bool {
    candidate.total_average_score > incumbent.total_average_score
        || (candidate.total_average_score == incumbent.total_average_score
            && solution_identity_cmp(candidate, incumbent) == Ordering::Less)
}

fn start_combos(input: &MedleySearchInputV1) -> Result<[u32; 3], SearchAbort> {
    let first = u32::try_from(input.songs[0].notes.len())
        .map_err(|_| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))?;
    let second = u32::try_from(input.songs[1].notes.len())
        .map_err(|_| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))?;
    Ok([
        0,
        first,
        first
            .checked_add(second)
            .ok_or_else(|| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))?,
    ])
}

fn build_groups(input: &MedleySearchInputV1) -> (Vec<CharacterGroup>, Vec<u32>) {
    let mut by_character = BTreeMap::<u32, Vec<u32>>::new();
    let mut eligible = Vec::new();
    for card in &input.cards {
        if card.is_excluded {
            continue;
        }
        by_character
            .entry(card.character_id)
            .or_default()
            .push(card.instance_id);
        eligible.push(card.instance_id);
    }
    let groups = by_character
        .into_values()
        .map(|instance_ids| CharacterGroup { instance_ids })
        .collect();
    (groups, eligible)
}

struct FeasibilityContext<'groups, 'state, 'control, 'callback> {
    groups: &'groups [CharacterGroup],
    used: &'state mut [bool],
    assignment: &'state mut [[u32; TEAM_SIZE]; MEDLEY_TEAM_COUNT],
    state: &'state mut RunState<'control, 'callback>,
}

impl FeasibilityContext<'_, '_, '_, '_> {
    fn choose_team(
        &mut self,
        team_slot: usize,
        group_start: usize,
        depth: usize,
        selected: &mut [u32; TEAM_SIZE],
    ) -> Result<bool, SearchAbort> {
        self.state.poll_stop()?;
        if depth == TEAM_SIZE {
            let mut team = *selected;
            team.sort_unstable();
            for instance_id in team {
                self.used[instance_id as usize] = true;
            }
            self.assignment[team_slot] = team;
            let found = self.find(team_slot + 1)?;
            for instance_id in team {
                self.used[instance_id as usize] = false;
            }
            return Ok(found);
        }

        let remaining_slots = TEAM_SIZE - depth;
        if self.groups.len().saturating_sub(group_start) < remaining_slots {
            return Ok(false);
        }
        let last_group = self.groups.len() - remaining_slots;
        for group_index in group_start..=last_group {
            for instance_id in self.groups[group_index].instance_ids.iter().copied() {
                if self.used[instance_id as usize] {
                    continue;
                }
                selected[depth] = instance_id;
                if self.choose_team(team_slot, group_index + 1, depth + 1, selected)? {
                    return Ok(true);
                }
            }
        }
        Ok(false)
    }

    fn find(&mut self, team_slot: usize) -> Result<bool, SearchAbort> {
        if team_slot == MEDLEY_TEAM_COUNT {
            return Ok(true);
        }
        self.choose_team(team_slot, 0, 0, &mut [0; TEAM_SIZE])
    }
}

fn finite_slot_sum(values: [f64; 3]) -> f64 {
    add_song_uppers(values).unwrap_or(f64::INFINITY)
}

fn plan_configurations(
    input: &MedleySearchInputV1,
    eligible_instance_ids: &[u32],
    state: &mut RunState<'_, '_>,
) -> Result<Vec<ConfigurationPlan>, SearchAbort> {
    let mut plans = Vec::with_capacity(input.area_configurations.len());
    for (configuration_index, configuration) in input.area_configurations.iter().enumerate() {
        state.poll_stop()?;
        let mut root_song_uppers = [f64::INFINITY; 3];
        match UpperBoundEngine::new(input, configuration, eligible_instance_ids) {
            Ok(engine) => {
                for (song_slot, upper) in root_song_uppers.iter_mut().enumerate() {
                    match engine.team_upper(&[], song_slot) {
                        Ok(proved) => *upper = proved.value,
                        Err(_) => {
                            add_counter(&mut state.diagnostics.unknown_bound_evaluations, 1)?;
                        }
                    }
                }
            }
            Err(_) => {
                add_counter(&mut state.diagnostics.unknown_bound_evaluations, 3)?;
            }
        }
        plans.push(ConfigurationPlan {
            configuration_index,
            root_song_uppers,
            whole_medley_upper: finite_slot_sum(root_song_uppers),
        });
    }
    plans.sort_by(|left, right| {
        right
            .whole_medley_upper
            .total_cmp(&left.whole_medley_upper)
            .then_with(|| left.configuration_index.cmp(&right.configuration_index))
    });
    Ok(plans)
}

fn candidate_solution(
    configuration: &AreaItemConfigurationV1,
    rows: [&CompactCandidate; 3],
) -> Result<MedleySearchSolutionV1, SearchAbort> {
    let mut teams = Vec::with_capacity(3);
    for (song_slot, row) in rows.iter().enumerate() {
        let members =
            member_order_for_leader(row.member_instance_ids, row.leader_instance_ids[song_slot])
                .map_err(map_candidate_failure)?;
        teams.push(MedleySearchTeamV1 {
            slot: song_slot as u8,
            member_instance_ids: members,
            average_score: row.song_scores[song_slot],
        });
    }
    let teams: [MedleySearchTeamV1; 3] = teams
        .try_into()
        .map_err(|_| abort(SearchIncompleteReasonV1::InternalFailure))?;
    let total_average_score =
        (teams[0].average_score + teams[1].average_score) + teams[2].average_score;
    if !total_average_score.is_finite() || total_average_score < 0.0 {
        return Err(abort(SearchIncompleteReasonV1::ArithmeticOverflow));
    }
    Ok(MedleySearchSolutionV1 {
        selected_area_item_ids: configuration.selected_area_item_ids.clone(),
        teams,
        total_average_score,
    })
}

fn map_candidate_failure(failure: CandidateFailure) -> SearchAbort {
    match failure {
        CandidateFailure::InvalidInternalReference => {
            abort(SearchIncompleteReasonV1::InternalFailure)
        }
        CandidateFailure::ArithmeticFailure => abort(SearchIncompleteReasonV1::ArithmeticOverflow),
    }
}

fn seed_incumbent(
    input: &MedleySearchInputV1,
    configuration: &AreaItemConfigurationV1,
    assignment: [[u32; 5]; 3],
    combos: [u32; 3],
    state: &mut RunState<'_, '_>,
) -> Result<(), SearchAbort> {
    let rows = assignment
        .map(|team| evaluate_candidate(input, configuration, team, combos))
        .into_iter()
        .collect::<Result<Vec<_>, _>>()
        .map_err(map_candidate_failure)?;
    add_counter(&mut state.diagnostics.complete_teams, 3)?;
    add_counter(&mut state.diagnostics.exact_song_scores, 45)?;
    state.record_solution(candidate_solution(
        configuration,
        [&rows[0], &rows[1], &rows[2]],
    )?)
}

fn whole_relevance_upper(team_scores: [f64; 3], root: [f64; 3]) -> f64 {
    let assignments = [
        (team_scores[0] + root[1]) + root[2],
        (root[0] + team_scores[1]) + root[2],
        (root[0] + root[1]) + team_scores[2],
    ];
    assignments
        .into_iter()
        .fold(0.0_f64, |maximum, value| maximum.max(value))
}

fn partial_relevance_upper(
    engine: Option<&UpperBoundEngine<'_>>,
    selected_instance_ids: &[u32],
    root: [f64; 3],
    state: &mut RunState<'_, '_>,
) -> Result<f64, SearchAbort> {
    let Some(engine) = engine else {
        add_counter(&mut state.diagnostics.unknown_bound_evaluations, 1)?;
        return Ok(f64::INFINITY);
    };
    let mut team_scores = [f64::INFINITY; 3];
    for (song_slot, score) in team_scores.iter_mut().enumerate() {
        match engine.team_upper(selected_instance_ids, song_slot) {
            Ok(proved) => *score = proved.value,
            Err(_) => {
                add_counter(&mut state.diagnostics.unknown_bound_evaluations, 1)?;
                return Ok(f64::INFINITY);
            }
        }
    }
    let upper = whole_relevance_upper(team_scores, root);
    Ok(if upper.is_finite() {
        upper
    } else {
        f64::INFINITY
    })
}

fn projected_candidate_bytes(
    row_capacity: usize,
    view_capacity_per_song: usize,
) -> Result<usize, SearchAbort> {
    let row_bytes = row_capacity
        .checked_mul(size_of::<CompactCandidate>())
        .ok_or_else(|| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))?;
    let view_bytes = view_capacity_per_song
        .checked_mul(size_of::<usize>())
        .and_then(|one_view| one_view.checked_mul(3))
        .ok_or_else(|| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))?;
    row_bytes
        .checked_add(view_bytes)
        .ok_or_else(|| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))
}

fn update_peak_candidate_bytes(
    rows: &Vec<CompactCandidate>,
    view_capacity_per_song: usize,
    state: &mut RunState<'_, '_>,
) -> Result<(), SearchAbort> {
    let bytes = projected_candidate_bytes(rows.capacity(), view_capacity_per_song)?;
    let bytes_u64 =
        u64::try_from(bytes).map_err(|_| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))?;
    state.diagnostics.peak_candidate_bytes = state.diagnostics.peak_candidate_bytes.max(bytes_u64);
    if bytes > state.control.memory_budget_bytes() {
        return Err(abort(SearchIncompleteReasonV1::MemoryExhausted));
    }
    Ok(())
}

fn push_candidate(
    rows: &mut Vec<CompactCandidate>,
    row: CompactCandidate,
    state: &mut RunState<'_, '_>,
) -> Result<(), SearchAbort> {
    if rows.len() == rows.capacity() {
        let required_capacity = rows
            .len()
            .checked_add(1)
            .ok_or_else(|| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))?;
        if projected_candidate_bytes(required_capacity, required_capacity)?
            > state.control.memory_budget_bytes()
        {
            return Err(abort(SearchIncompleteReasonV1::MemoryExhausted));
        }
        rows.try_reserve_exact(1)
            .map_err(|_| abort(SearchIncompleteReasonV1::MemoryExhausted))?;
    }
    rows.push(row);
    update_peak_candidate_bytes(rows, rows.len(), state)?;
    add_counter(&mut state.diagnostics.compact_rows, 1)
}

struct GenerationContext<'input, 'engine, 'state, 'control, 'callback> {
    input: &'input MedleySearchInputV1,
    configuration: &'input AreaItemConfigurationV1,
    groups: &'input [CharacterGroup],
    engine: Option<&'engine UpperBoundEngine<'input>>,
    root_song_uppers: [f64; 3],
    combos: [u32; 3],
    rows: &'state mut Vec<CompactCandidate>,
    state: &'state mut RunState<'control, 'callback>,
}

fn generate_candidate_rows(
    context: &mut GenerationContext<'_, '_, '_, '_, '_>,
    group_start: usize,
    selected: &mut Vec<u32>,
) -> Result<(), SearchAbort> {
    context.state.poll_stop()?;
    add_counter(&mut context.state.diagnostics.partial_nodes, 1)?;
    if !selected.is_empty()
        && let Some(incumbent) = context.state.incumbent_score()
    {
        let upper = partial_relevance_upper(
            context.engine,
            selected,
            context.root_song_uppers,
            context.state,
        )?;
        if upper < incumbent {
            add_counter(&mut context.state.diagnostics.partial_nodes_pruned, 1)?;
            return Ok(());
        }
    }

    if selected.len() == TEAM_SIZE {
        add_counter(&mut context.state.diagnostics.complete_teams, 1)?;
        let team: [u32; TEAM_SIZE] = selected
            .as_slice()
            .try_into()
            .map_err(|_| abort(SearchIncompleteReasonV1::InternalFailure))?;
        let row = evaluate_candidate(context.input, context.configuration, team, context.combos)
            .map_err(map_candidate_failure)?;
        add_counter(&mut context.state.diagnostics.exact_song_scores, 15)?;
        if context.state.incumbent_score().is_some_and(|incumbent| {
            whole_relevance_upper(row.song_scores, context.root_song_uppers) < incumbent
        }) {
            add_counter(&mut context.state.diagnostics.rows_pruned, 1)?;
            return Ok(());
        }
        return push_candidate(context.rows, row, context.state);
    }

    let remaining_slots = TEAM_SIZE - selected.len();
    if context.groups.len().saturating_sub(group_start) < remaining_slots {
        return Ok(());
    }
    let last_group = context.groups.len() - remaining_slots;
    for group_index in group_start..=last_group {
        for instance_id in context.groups[group_index].instance_ids.iter().copied() {
            selected.push(instance_id);
            generate_candidate_rows(context, group_index + 1, selected)?;
            selected.pop();
        }
    }
    Ok(())
}

fn candidate_rank_cmp(
    rows: &[CompactCandidate],
    song_slot: usize,
    left: usize,
    right: usize,
) -> Ordering {
    rows[right].song_scores[song_slot]
        .total_cmp(&rows[left].song_scores[song_slot])
        .then_with(|| {
            rows[left]
                .member_instance_ids
                .cmp(&rows[right].member_instance_ids)
        })
        .then_with(|| {
            rows[left].leader_instance_ids[song_slot]
                .cmp(&rows[right].leader_instance_ids[song_slot])
        })
}

fn build_rank_views(
    rows: &Vec<CompactCandidate>,
    state: &mut RunState<'_, '_>,
) -> Result<[Vec<usize>; 3], SearchAbort> {
    if projected_candidate_bytes(rows.capacity(), rows.len())? > state.control.memory_budget_bytes()
    {
        return Err(abort(SearchIncompleteReasonV1::MemoryExhausted));
    }
    let mut views = std::array::from_fn(|_| Vec::new());
    for (song_slot, view) in views.iter_mut().enumerate() {
        view.try_reserve_exact(rows.len())
            .map_err(|_| abort(SearchIncompleteReasonV1::MemoryExhausted))?;
        view.extend(0..rows.len());
        view.sort_unstable_by(|left, right| candidate_rank_cmp(rows, song_slot, *left, *right));
    }
    let view_capacity = views.iter().map(Vec::capacity).max().unwrap_or(0);
    update_peak_candidate_bytes(rows, view_capacity, state)?;
    Ok(views)
}

fn join_configuration(
    configuration: &AreaItemConfigurationV1,
    rows: &Vec<CompactCandidate>,
    root_song_uppers: [f64; 3],
    state: &mut RunState<'_, '_>,
) -> Result<(), SearchAbort> {
    let views = build_rank_views(rows, state)?;
    let mut poll_counter = 0_u16;
    for row_zero_index in views[0].iter().copied() {
        state.poll_stop()?;
        let row_zero = &rows[row_zero_index];
        if state.incumbent_score().is_some_and(|incumbent| {
            (row_zero.song_scores[0] + root_song_uppers[1]) + root_song_uppers[2] < incumbent
        }) {
            break;
        }
        for row_one_index in views[1].iter().copied() {
            add_counter(&mut state.diagnostics.join_pair_checks, 1)?;
            let row_one = &rows[row_one_index];
            if state.incumbent_score().is_some_and(|incumbent| {
                (row_zero.song_scores[0] + row_one.song_scores[1]) + root_song_uppers[2] < incumbent
            }) {
                break;
            }
            if candidates_overlap(row_zero, row_one) {
                add_counter(&mut state.diagnostics.card_conflicts, 1)?;
                continue;
            }
            for row_two_index in views[2].iter().copied() {
                add_counter(&mut state.diagnostics.join_third_checks, 1)?;
                poll_counter = poll_counter.wrapping_add(1);
                if poll_counter == 0 {
                    state.poll_stop()?;
                }
                let row_two = &rows[row_two_index];
                let total =
                    (row_zero.song_scores[0] + row_one.song_scores[1]) + row_two.song_scores[2];
                if state
                    .incumbent_score()
                    .is_some_and(|incumbent| total < incumbent)
                {
                    break;
                }
                if candidates_overlap(row_zero, row_two) || candidates_overlap(row_one, row_two) {
                    add_counter(&mut state.diagnostics.card_conflicts, 1)?;
                    continue;
                }
                state.record_solution(candidate_solution(
                    configuration,
                    [row_zero, row_one, row_two],
                )?)?;
                // The third view is descending and f64 addition is monotone;
                // the first compatible row is optimal for this fixed pair.
                break;
            }
        }
    }
    Ok(())
}

fn run_search(
    input: &MedleySearchInputV1,
    state: &mut RunState<'_, '_>,
) -> Result<(), SearchAbort> {
    state.diagnostics.configurations_total = u64::try_from(input.area_configurations.len())
        .map_err(|_| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))?;
    let combos = start_combos(input)?;
    let (groups, eligible_instance_ids) = build_groups(input);
    let mut assignment = [[0_u32; TEAM_SIZE]; MEDLEY_TEAM_COUNT];
    let mut used = vec![false; input.cards.len()];
    let has_assignment = FeasibilityContext {
        groups: &groups,
        used: &mut used,
        assignment: &mut assignment,
        state,
    }
    .find(0)?;
    if !has_assignment {
        return Ok(());
    }

    let plans = plan_configurations(input, &eligible_instance_ids, state)?;
    let seed_plan = plans
        .first()
        .ok_or_else(|| abort(SearchIncompleteReasonV1::InternalFailure))?;
    seed_incumbent(
        input,
        &input.area_configurations[seed_plan.configuration_index],
        assignment,
        combos,
        state,
    )?;

    for plan in plans {
        state.poll_stop()?;
        if state
            .incumbent_score()
            .is_some_and(|incumbent| plan.whole_medley_upper < incumbent)
        {
            add_counter(&mut state.diagnostics.configurations_pruned, 1)?;
            add_counter(&mut state.diagnostics.configurations_completed, 1)?;
            continue;
        }
        let configuration = &input.area_configurations[plan.configuration_index];
        let engine = UpperBoundEngine::new(input, configuration, &eligible_instance_ids).ok();
        if engine.is_none() {
            add_counter(&mut state.diagnostics.unknown_bound_evaluations, 1)?;
        }
        let mut rows = Vec::new();
        {
            let mut context = GenerationContext {
                input,
                configuration,
                groups: &groups,
                engine: engine.as_ref(),
                root_song_uppers: plan.root_song_uppers,
                combos,
                rows: &mut rows,
                state,
            };
            generate_candidate_rows(&mut context, 0, &mut Vec::with_capacity(TEAM_SIZE))?;
        }
        join_configuration(configuration, &rows, plan.root_song_uppers, state)?;
        add_counter(&mut state.diagnostics.configurations_completed, 1)?;
    }
    Ok(())
}

/// Search the complete normalized space. An incomplete outcome is never an
/// exact result, even when it carries a diagnostic incumbent.
pub fn search_medley(
    input: &MedleySearchInputV1,
    control: &mut SearchControl<'_>,
) -> MedleySearchOutcomeV1 {
    let mut state = RunState {
        control,
        diagnostics: MedleySearchDiagnosticsV1::default(),
        best: None,
        discovered: Vec::new(),
    };
    if input.validate().is_err() {
        return MedleySearchOutcomeV1::Incomplete {
            reason: SearchIncompleteReasonV1::InvalidData,
            best_so_far: None,
            discovered: Vec::new(),
            diagnostics: state.diagnostics,
        };
    }

    match run_search(input, &mut state) {
        Ok(()) => MedleySearchOutcomeV1::Exact {
            best: state.best,
            discovered: state.discovered,
            diagnostics: state.diagnostics,
        },
        Err(error) => MedleySearchOutcomeV1::Incomplete {
            reason: error.reason,
            best_so_far: state.best,
            discovered: state.discovered,
            diagnostics: state.diagnostics,
        },
    }
}
