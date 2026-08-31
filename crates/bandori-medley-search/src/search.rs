use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::mem::size_of;

use crate::candidate::{
    CandidateFailure, CompactCandidate, candidates_overlap, evaluate_candidate,
    member_order_for_leader,
};
use crate::fast_upper::{FastScoreModel, FastUpperBoundEngine};
use crate::upper_bound::add_song_uppers;
use crate::{
    AreaItemConfigurationV1, MedleySearchDiagnosticsV1, MedleySearchInputV1, MedleySearchOutcomeV1,
    MedleySearchSolutionV1, MedleySearchTeamV1, SearchControl, SearchIncompleteReasonV1,
    SearchStopReason,
};

const DIAGNOSTIC_SOLUTION_LIMIT: usize = 10;
const TEAM_SIZE: usize = 5;
const MEDLEY_TEAM_COUNT: usize = 3;
// These limits control temporary work, never which families are searched.
const LOCAL_ROW_TARGET: usize = 256;
const SCORE_CACHE_SLOTS: usize = 4096;
const WARM_CONFIGURATION_COUNT: usize = 8;
const COMPLETION_PROBE_INTERVAL: u64 = 512;

#[derive(Debug)]
struct CharacterGroup {
    instance_ids: Vec<u32>,
}

#[derive(Clone, Copy, Debug)]
struct ConfigurationPlan {
    configuration_index: usize,
    root_song_uppers: [f64; 3],
    whole_medley_upper: f64,
    proposed_assignment: Option<[[u32; 5]; 3]>,
    estimated_score: f64,
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

    fn record_solution(&mut self, solution: MedleySearchSolutionV1) -> Result<bool, SearchAbort> {
        add_counter(&mut self.diagnostics.feasible_medleys, 1)?;
        let becomes_best = self
            .best
            .as_ref()
            .is_none_or(|best| solution_is_better(&solution, best));
        if self.best.is_none() {
            self.diagnostics.initial_average_score = Some(solution.total_average_score);
        }
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
        Ok(becomes_best)
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

/// A direct-mapped, configuration-local score cache. Collisions only cause
/// re-scoring: an evicted row never removes a family from the exact search.
struct ScoreCache {
    slots: Vec<Option<CompactCandidate>>,
    local_row_limit: usize,
}

impl ScoreCache {
    fn new(state: &mut RunState<'_, '_>) -> Result<Self, SearchAbort> {
        let row_bytes = size_of::<CompactCandidate>() + size_of::<usize>();
        let budget = state.control.memory_budget_bytes();
        let minimum_block = 3 * row_bytes;
        if budget < minimum_block {
            return Err(abort(SearchIncompleteReasonV1::MemoryExhausted));
        }
        let cache_budget = (budget / 2).min(budget - minimum_block);
        let slot_count =
            SCORE_CACHE_SLOTS.min(cache_budget / size_of::<Option<CompactCandidate>>());
        let mut slots = Vec::new();
        slots
            .try_reserve_exact(slot_count)
            .map_err(|_| abort(SearchIncompleteReasonV1::MemoryExhausted))?;
        slots.resize(slot_count, None);
        let bytes = slots.capacity() * size_of::<Option<CompactCandidate>>();
        if bytes > budget - minimum_block {
            return Err(abort(SearchIncompleteReasonV1::MemoryExhausted));
        }
        state.diagnostics.peak_cache_bytes = state.diagnostics.peak_cache_bytes.max(bytes as u64);
        state.diagnostics.peak_search_storage_bytes = state
            .diagnostics
            .peak_search_storage_bytes
            .max(bytes as u64);
        Ok(Self {
            slots,
            local_row_limit: LOCAL_ROW_TARGET.min((budget - bytes) / row_bytes),
        })
    }

    fn bytes(&self) -> usize {
        self.slots.capacity() * size_of::<Option<CompactCandidate>>()
    }

    fn evaluate(
        &mut self,
        input: &MedleySearchInputV1,
        configuration: &AreaItemConfigurationV1,
        mut members: [u32; 5],
        combos: [u32; 3],
        state: &mut RunState<'_, '_>,
    ) -> Result<CompactCandidate, SearchAbort> {
        state.poll_stop()?;
        members.sort_unstable();
        let index = if self.slots.is_empty() {
            None
        } else {
            let hash = members.into_iter().fold(0_usize, |value, id| {
                value.wrapping_mul(16777619) ^ id as usize
            });
            Some(hash % self.slots.len())
        };
        if let Some(index) = index
            && let Some(row) = self.slots[index]
            && row.member_instance_ids == members
        {
            add_counter(&mut state.diagnostics.cache_hits, 1)?;
            return Ok(row);
        }
        let row = evaluate_candidate(input, configuration, members, combos)
            .map_err(map_candidate_failure)?;
        add_counter(&mut state.diagnostics.complete_teams, 1)?;
        add_counter(&mut state.diagnostics.exact_song_scores, 15)?;
        if let Some(index) = index {
            self.slots[index] = Some(row);
        }
        Ok(row)
    }
}

/// Members fix the increasing character-group prefix, not the scoring order.
/// The three families together denote a Cartesian product. Physical collisions
/// among their unresolved completions are rejected at the local join.
#[derive(Clone, Copy, Default)]
struct TeamFamily {
    members: [u32; 5],
    member_count: usize,
    next_group: usize,
}

impl TeamFamily {
    fn selected(&self) -> &[u32] {
        &self.members[..self.member_count]
    }

    fn with_member(mut self, instance_id: u32, group_index: usize) -> Self {
        self.members[self.member_count] = instance_id;
        self.member_count += 1;
        self.next_group = group_index + 1;
        self
    }

    fn remaining(&self, groups: &[CharacterGroup], used: &[bool]) -> Vec<u32> {
        groups[self.next_group..]
            .iter()
            .flat_map(|group| group.instance_ids.iter().copied())
            .filter(|id| !used[*id as usize])
            .collect()
    }

    fn completion_count(&self, groups: &[CharacterGroup], used: &[bool], cap: usize) -> usize {
        let needed = TEAM_SIZE - self.member_count;
        let mut counts = [0_usize; TEAM_SIZE + 1];
        counts[0] = 1;
        for group in &groups[self.next_group..] {
            let available = group
                .instance_ids
                .iter()
                .filter(|id| !used[**id as usize])
                .count();
            for depth in (1..=needed).rev() {
                counts[depth] = counts[depth]
                    .saturating_add(counts[depth - 1].saturating_mul(available))
                    .min(cap);
            }
        }
        counts[needed]
    }
}

fn team_upper(
    engine: Option<&FastUpperBoundEngine<'_>>,
    family: TeamFamily,
    remaining: &[u32],
    song_slot: usize,
    state: &mut RunState<'_, '_>,
) -> Result<f64, SearchAbort> {
    add_counter(&mut state.diagnostics.bound_evaluations, 1)?;
    match engine.and_then(|engine| {
        engine
            .team_upper(family.selected(), remaining, song_slot)
            .ok()
    }) {
        Some(value) => Ok(value),
        None => {
            add_counter(&mut state.diagnostics.unknown_bound_evaluations, 1)?;
            Ok(f64::INFINITY)
        }
    }
}

fn propose_assignment(
    engine: &FastUpperBoundEngine<'_>,
    families: [TeamFamily; 3],
    domains: &[Vec<u32>; 3],
    order: [usize; 3],
    rank: usize,
) -> Option<[[u32; 5]; 3]> {
    let mut assignment = [[0; 5]; 3];
    let mut occupied = families
        .iter()
        .flat_map(|family| family.selected().iter().copied())
        .collect::<Vec<_>>();
    for song_slot in order {
        let remaining = domains[song_slot]
            .iter()
            .copied()
            .filter(|id| !occupied.contains(id))
            .collect::<Vec<_>>();
        let team =
            engine.propose_team(families[song_slot].selected(), &remaining, song_slot, rank)?;
        for id in team {
            if !families[song_slot].selected().contains(&id) {
                occupied.push(id);
            }
        }
        assignment[song_slot] = team;
    }
    Some(assignment)
}

struct EvaluationContext<'input, 'state, 'control, 'callback> {
    input: &'input MedleySearchInputV1,
    configuration: &'input AreaItemConfigurationV1,
    combos: [u32; 3],
    cache: &'state mut ScoreCache,
    state: &'state mut RunState<'control, 'callback>,
}

impl EvaluationContext<'_, '_, '_, '_> {
    fn evaluate(&mut self, members: [u32; 5]) -> Result<CompactCandidate, SearchAbort> {
        self.cache.evaluate(
            self.input,
            self.configuration,
            members,
            self.combos,
            self.state,
        )
    }

    fn score_assignment(&mut self, assignment: [[u32; 5]; 3]) -> Result<(), SearchAbort> {
        add_counter(&mut self.state.diagnostics.heuristic_probes, 1)?;
        let rows = [
            self.evaluate(assignment[0])?,
            self.evaluate(assignment[1])?,
            self.evaluate(assignment[2])?,
        ];
        if candidates_overlap(&rows[0], &rows[1])
            || candidates_overlap(&rows[0], &rows[2])
            || candidates_overlap(&rows[1], &rows[2])
        {
            return Err(abort(SearchIncompleteReasonV1::InternalFailure));
        }
        if self.state.record_solution(candidate_solution(
            self.configuration,
            [&rows[0], &rows[1], &rows[2]],
        )?)? {
            add_counter(&mut self.state.diagnostics.heuristic_improvements, 1)?;
        }
        Ok(())
    }

    fn probe_completions(
        &mut self,
        engine: Option<&FastUpperBoundEngine<'_>>,
        families: [TeamFamily; 3],
        domains: &[Vec<u32>; 3],
        trials: usize,
    ) -> Result<(), SearchAbort> {
        let Some(engine) = engine else {
            return Ok(());
        };
        // Construction order allocates contested cards; song slots never move.
        const ORDERS: [[usize; 3]; 6] = [
            [0, 1, 2],
            [1, 0, 2],
            [2, 0, 1],
            [0, 2, 1],
            [1, 2, 0],
            [2, 1, 0],
        ];
        let mut seen = Vec::new();
        for (trial, order) in ORDERS.into_iter().take(trials).enumerate() {
            self.state.poll_stop()?;
            if let Some(mut assignment) =
                propose_assignment(engine, families, domains, order, trial / 3)
            {
                for team in &mut assignment {
                    team.sort_unstable();
                }
                if !seen.contains(&assignment) {
                    seen.push(assignment);
                    self.score_assignment(assignment)?;
                }
            }
        }
        Ok(())
    }
}

fn plan_configurations(
    input: &MedleySearchInputV1,
    model: Option<&FastScoreModel<'_>>,
    eligible: &[u32],
    state: &mut RunState<'_, '_>,
) -> Result<Vec<ConfigurationPlan>, SearchAbort> {
    let mut plans = Vec::with_capacity(input.area_configurations.len());
    let domains = std::array::from_fn(|_| eligible.to_vec());
    let families = [TeamFamily::default(); 3];
    for (configuration_index, configuration) in input.area_configurations.iter().enumerate() {
        state.poll_stop()?;
        let engine = model.and_then(|model| FastUpperBoundEngine::new(model, configuration).ok());
        let mut root_song_uppers = [f64::INFINITY; 3];
        for song_slot in 0..3 {
            root_song_uppers[song_slot] = team_upper(
                engine.as_ref(),
                families[song_slot],
                eligible,
                song_slot,
                state,
            )?;
        }
        let proposed_assignment = engine
            .as_ref()
            .and_then(|engine| propose_assignment(engine, families, &domains, [0, 1, 2], 0));
        let estimated_score =
            engine
                .as_ref()
                .zip(proposed_assignment)
                .map_or(0.0, |(engine, assignment)| {
                    let scores =
                        std::array::from_fn(|slot| engine.estimate_team(assignment[slot], slot));
                    finite_slot_sum(scores)
                });
        plans.push(ConfigurationPlan {
            configuration_index,
            root_song_uppers,
            whole_medley_upper: finite_slot_sum(root_song_uppers),
            proposed_assignment,
            estimated_score,
        });
    }
    plans.sort_by(|left, right| {
        right
            .estimated_score
            .total_cmp(&left.estimated_score)
            .then_with(|| right.whole_medley_upper.total_cmp(&left.whole_medley_upper))
            .then_with(|| left.configuration_index.cmp(&right.configuration_index))
    });
    Ok(plans)
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
}

fn join_block(
    configuration: &AreaItemConfigurationV1,
    rows: &[Vec<CompactCandidate>; 3],
    views: &[Vec<usize>; 3],
    state: &mut RunState<'_, '_>,
) -> Result<(), SearchAbort> {
    if rows.iter().any(Vec::is_empty) {
        return Ok(());
    }
    let maximums =
        std::array::from_fn::<_, 3, _>(|slot| rows[slot][views[slot][0]].song_scores[slot]);
    let mut poll_counter = 0_u16;
    for &zero in &views[0] {
        state.poll_stop()?;
        let row_zero = &rows[0][zero];
        if state.incumbent_score().is_some_and(|incumbent| {
            (row_zero.song_scores[0] + maximums[1]) + maximums[2] < incumbent
        }) {
            break;
        }
        for &one in &views[1] {
            add_counter(&mut state.diagnostics.join_pair_checks, 1)?;
            poll_counter = poll_counter.wrapping_add(1);
            if poll_counter == 0 {
                state.poll_stop()?;
            }
            let row_one = &rows[1][one];
            if state.incumbent_score().is_some_and(|incumbent| {
                (row_zero.song_scores[0] + row_one.song_scores[1]) + maximums[2] < incumbent
            }) {
                break;
            }
            if candidates_overlap(row_zero, row_one) {
                add_counter(&mut state.diagnostics.card_conflicts, 1)?;
                continue;
            }
            let mut pair_best_score = None;
            for &two in &views[2] {
                add_counter(&mut state.diagnostics.join_third_checks, 1)?;
                poll_counter = poll_counter.wrapping_add(1);
                if poll_counter == 0 {
                    state.poll_stop()?;
                }
                let row_two = &rows[2][two];
                let total =
                    (row_zero.song_scores[0] + row_one.song_scores[1]) + row_two.song_scores[2];
                if state
                    .incumbent_score()
                    .is_some_and(|incumbent| total < incumbent)
                    || pair_best_score.is_some_and(|best| total < best)
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
                pair_best_score = Some(total);
                // A smaller third score may still round to the same total.
                // Keep that entire total-score tie, regardless of row order.
            }
        }
    }
    Ok(())
}

struct JointSearch<'input, 'engine, 'state, 'control, 'callback> {
    evaluation: EvaluationContext<'input, 'state, 'control, 'callback>,
    groups: &'input [CharacterGroup],
    engine: Option<&'engine FastUpperBoundEngine<'input>>,
}

impl JointSearch<'_, '_, '_, '_, '_> {
    fn generate_rows(
        &mut self,
        family: TeamFamily,
        used: &[bool],
        song_slot: usize,
        family_uppers: [f64; 3],
        rows: &mut Vec<CompactCandidate>,
    ) -> Result<(), SearchAbort> {
        self.evaluation.state.poll_stop()?;
        if family.member_count == TEAM_SIZE {
            let upper = team_upper(self.engine, family, &[], song_slot, self.evaluation.state)?;
            let mut uppers = family_uppers;
            uppers[song_slot] = upper;
            if self
                .evaluation
                .state
                .incumbent_score()
                .is_some_and(|incumbent| finite_slot_sum(uppers) < incumbent)
            {
                add_counter(&mut self.evaluation.state.diagnostics.rows_pruned, 1)?;
                return Ok(());
            }
            let row = self.evaluation.evaluate(family.members)?;
            uppers[song_slot] = row.song_scores[song_slot];
            if self
                .evaluation
                .state
                .incumbent_score()
                .is_some_and(|incumbent| finite_slot_sum(uppers) < incumbent)
            {
                add_counter(&mut self.evaluation.state.diagnostics.rows_pruned, 1)?;
            } else {
                // The exact capped count was reserved before entering the block.
                if rows.len() == rows.capacity() {
                    return Err(abort(SearchIncompleteReasonV1::InternalFailure));
                }
                rows.push(row);
                add_counter(&mut self.evaluation.state.diagnostics.compact_rows, 1)?;
            }
            return Ok(());
        }
        let needed = TEAM_SIZE - family.member_count;
        if self.groups.len().saturating_sub(family.next_group) < needed {
            return Ok(());
        }
        for group in family.next_group..=self.groups.len() - needed {
            for &id in &self.groups[group].instance_ids {
                if !used[id as usize] {
                    self.generate_rows(
                        family.with_member(id, group),
                        used,
                        song_slot,
                        family_uppers,
                        rows,
                    )?;
                }
            }
        }
        Ok(())
    }

    fn finish_block(
        &mut self,
        families: [TeamFamily; 3],
        counts: [usize; 3],
        used: &[bool],
        uppers: [f64; 3],
    ) -> Result<(), SearchAbort> {
        let mut rows: [Vec<CompactCandidate>; 3] = std::array::from_fn(|_| Vec::new());
        let mut views: [Vec<usize>; 3] = std::array::from_fn(|_| Vec::new());
        for slot in 0..3 {
            rows[slot]
                .try_reserve_exact(counts[slot])
                .map_err(|_| abort(SearchIncompleteReasonV1::MemoryExhausted))?;
            views[slot]
                .try_reserve_exact(counts[slot])
                .map_err(|_| abort(SearchIncompleteReasonV1::MemoryExhausted))?;
        }
        let row_bytes = rows
            .iter()
            .map(|rows| rows.capacity() * size_of::<CompactCandidate>())
            .sum::<usize>();
        let view_bytes = views
            .iter()
            .map(|view| view.capacity() * size_of::<usize>())
            .sum::<usize>();
        let candidate_bytes = row_bytes + view_bytes;
        let bytes = candidate_bytes + self.evaluation.cache.bytes();
        let state = &mut self.evaluation.state;
        state.diagnostics.peak_candidate_bytes = state
            .diagnostics
            .peak_candidate_bytes
            .max(candidate_bytes as u64);
        state.diagnostics.peak_search_storage_bytes = state
            .diagnostics
            .peak_search_storage_bytes
            .max(bytes as u64);
        if bytes > state.control.memory_budget_bytes() {
            return Err(abort(SearchIncompleteReasonV1::MemoryExhausted));
        }
        for slot in 0..3 {
            self.generate_rows(families[slot], used, slot, uppers, &mut rows[slot])?;
            if rows[slot].is_empty() {
                add_counter(&mut self.evaluation.state.diagnostics.local_blocks, 1)?;
                return Ok(());
            }
            views[slot].extend(0..rows[slot].len());
            views[slot].sort_unstable_by(|left, right| {
                candidate_rank_cmp(&rows[slot], slot, *left, *right)
            });
        }
        join_block(
            self.evaluation.configuration,
            &rows,
            &views,
            self.evaluation.state,
        )?;
        add_counter(&mut self.evaluation.state.diagnostics.local_blocks, 1)
    }

    fn visit(&mut self, families: [TeamFamily; 3], used: &mut [bool]) -> Result<(), SearchAbort> {
        self.evaluation.state.poll_stop()?;
        add_counter(&mut self.evaluation.state.diagnostics.partial_nodes, 1)?;
        let limit = self.evaluation.cache.local_row_limit;
        let counts = families.map(|family| family.completion_count(self.groups, used, limit + 1));
        if counts.contains(&0) {
            return Ok(());
        }
        let domains = families.map(|family| family.remaining(self.groups, used));
        let mut uppers = [f64::INFINITY; 3];
        for slot in 0..3 {
            uppers[slot] = team_upper(
                self.engine,
                families[slot],
                &domains[slot],
                slot,
                self.evaluation.state,
            )?;
        }
        if self
            .evaluation
            .state
            .incumbent_score()
            .is_some_and(|incumbent| finite_slot_sum(uppers) < incumbent)
        {
            add_counter(
                &mut self.evaluation.state.diagnostics.partial_nodes_pruned,
                1,
            )?;
            return Ok(());
        }
        if self
            .evaluation
            .state
            .diagnostics
            .partial_nodes
            .is_multiple_of(COMPLETION_PROBE_INTERVAL)
        {
            self.evaluation
                .probe_completions(self.engine, families, &domains, 3)?;
        }
        if counts.iter().sum::<usize>() <= limit {
            return self.finish_block(families, counts, used, uppers);
        }

        // Split one family, then visit every disjoint child. A completed triple
        // belongs to exactly one child even when the local block sizes change.
        let slot = (0..3)
            .filter(|slot| families[*slot].member_count < TEAM_SIZE)
            .max_by(|left, right| {
                counts[*left]
                    .cmp(&counts[*right])
                    .then_with(|| {
                        families[*right]
                            .member_count
                            .cmp(&families[*left].member_count)
                    })
                    .then_with(|| right.cmp(left))
            })
            .ok_or_else(|| abort(SearchIncompleteReasonV1::InternalFailure))?;
        let family = families[slot];
        let hint = self
            .engine
            .and_then(|engine| engine.propose_team(family.selected(), &domains[slot], slot, 0));
        let needed = TEAM_SIZE - family.member_count;
        let mut choices = Vec::new();
        for group in family.next_group..=self.groups.len() - needed {
            for &id in &self.groups[group].instance_ids {
                if !used[id as usize] {
                    choices.push((group, id));
                }
            }
        }
        choices
            .sort_by_key(|(group, id)| (!hint.is_some_and(|team| team.contains(id)), *group, *id));
        // Domain vectors are not a persistent best-first frontier.
        drop(domains);
        for (group, id) in choices {
            let mut children = families;
            children[slot] = family.with_member(id, group);
            used[id as usize] = true;
            let result = self.visit(children, used);
            used[id as usize] = false;
            result?;
        }
        Ok(())
    }
}

fn run_search(
    input: &MedleySearchInputV1,
    state: &mut RunState<'_, '_>,
) -> Result<(), SearchAbort> {
    state.diagnostics.configurations_total = u64::try_from(input.area_configurations.len())
        .map_err(|_| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))?;
    let combos = start_combos(input)?;
    let (groups, eligible) = build_groups(input);
    let mut assignment = [[0; TEAM_SIZE]; MEDLEY_TEAM_COUNT];
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

    let model = FastScoreModel::new(input).ok();
    let plans = plan_configurations(input, model.as_ref(), &eligible, state)?;
    let families = [TeamFamily::default(); 3];
    let domains = std::array::from_fn(|_| eligible.clone());
    if let Some(first) = plans.first()
        && first.root_song_uppers.iter().all(|value| value.is_finite())
    {
        state.diagnostics.first_configuration_song_uppers = Some(first.root_song_uppers);
    }

    // A bounded warm start can improve configuration and contested-card choices.
    // All configurations are still searched or safely pruned below.
    for plan in plans.iter().take(WARM_CONFIGURATION_COUNT) {
        state.poll_stop()?;
        let configuration = &input.area_configurations[plan.configuration_index];
        let engine = model
            .as_ref()
            .and_then(|model| FastUpperBoundEngine::new(model, configuration).ok());
        let mut cache = ScoreCache::new(state)?;
        let mut evaluation = EvaluationContext {
            input,
            configuration,
            combos,
            cache: &mut cache,
            state,
        };
        if let Some(proposed) = plan.proposed_assignment {
            evaluation.score_assignment(proposed)?;
        } else if evaluation.state.best.is_none() {
            evaluation.score_assignment(assignment)?;
        }
        evaluation.probe_completions(engine.as_ref(), families, &domains, 6)?;
    }
    state.diagnostics.warm_start_average_score = state.incumbent_score();

    for (index, plan) in plans.into_iter().enumerate() {
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
        let engine = model
            .as_ref()
            .and_then(|model| FastUpperBoundEngine::new(model, configuration).ok());
        let mut cache = ScoreCache::new(state)?;
        let evaluation = EvaluationContext {
            input,
            configuration,
            combos,
            cache: &mut cache,
            state,
        };
        let mut search = JointSearch {
            evaluation,
            groups: &groups,
            engine: engine.as_ref(),
        };
        if index >= WARM_CONFIGURATION_COUNT {
            search
                .evaluation
                .probe_completions(engine.as_ref(), families, &domains, 3)?;
        }
        search.visit(families, &mut used)?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn join_keeps_the_smallest_output_identity_across_total_score_ties() {
        for alternative_score in [10.0_f64, 10.0_f64.next_down()] {
            let row = |member_instance_ids, leader, score| CompactCandidate {
                member_instance_ids,
                leader_instance_ids: [leader; 3],
                song_scores: [score; 3],
            };
            let rows = [
                vec![row([0, 1, 2, 3, 4], 0, 100.0)],
                vec![row([5, 6, 7, 8, 9], 5, 100.0)],
                vec![
                    row([10, 12, 13, 14, 15], 10, 10.0),
                    row([11, 12, 13, 14, 15], 14, alternative_score),
                ],
            ];
            let mut never_stop = || None;
            let mut control = SearchControl::new(1024, &mut never_stop);
            let mut state = RunState {
                control: &mut control,
                diagnostics: MedleySearchDiagnosticsV1::default(),
                best: None,
                discovered: Vec::new(),
            };
            join_block(
                &AreaItemConfigurationV1 {
                    selected_area_item_ids: vec![],
                },
                &rows,
                &[vec![0], vec![0], vec![0, 1]],
                &mut state,
            )
            .unwrap();
            let best = state.best.unwrap();
            assert_eq!(best.total_average_score, 210.0);
            assert_eq!(best.teams[2].member_instance_ids, [11, 12, 14, 13, 15]);
            assert_eq!(
                best.teams[2].average_score.to_bits(),
                alternative_score.to_bits()
            );
        }
    }
}
