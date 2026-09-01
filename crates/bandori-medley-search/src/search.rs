use std::cell::Cell;
use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::mem::size_of;
use std::rc::Rc;

use crate::candidate::{
    CandidateFailure, CompactCandidate, candidates_overlap, evaluate_candidate,
    member_order_for_leader,
};
use crate::exact_score::{PreparedSong, exact_probability_to_f64};
use crate::fast_upper::{FastScoreModel, FastUpperBoundEngine, TeamUpper};
use crate::joint_upper::{self, ALL_OWNERS, JointUpper, UNUSED};
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
const SCORE_CACHE_SLOTS: usize = 65_536;
const WARM_CONFIGURATION_COUNT: usize = 8;
const COMPLETION_PROBE_INTERVAL: u64 = 512;
const TEAM_ORDERS: [[usize; 3]; 6] = [
    [0, 1, 2],
    [1, 0, 2],
    [2, 0, 1],
    [0, 2, 1],
    [1, 2, 0],
    [2, 1, 0],
];

type CharacterGroup = Vec<u32>;

fn local_row_target() -> usize {
    #[cfg(test)]
    return std::env::var("HHWX_MEDLEY_DIAGNOSTIC_LOCAL_ROW_TARGET")
        .map_or(LOCAL_ROW_TARGET, |value| value.parse().unwrap());

    #[cfg(not(test))]
    LOCAL_ROW_TARGET
}

fn score_cache_slots() -> usize {
    #[cfg(test)]
    return std::env::var("HHWX_MEDLEY_DIAGNOSTIC_SCORE_CACHE_SLOTS")
        .map_or(SCORE_CACHE_SLOTS, |value| value.parse().unwrap());

    #[cfg(not(test))]
    SCORE_CACHE_SLOTS
}

#[derive(Clone, Copy, Debug)]
struct ConfigurationPlan {
    configuration_index: usize,
    root_bounds: [TeamUpper; 3],
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
        #[cfg(test)]
        let score_improved = self
            .incumbent_score()
            .is_none_or(|previous| solution.total_average_score > previous);
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
        #[cfg(test)]
        if score_improved {
            crate::profiling::improvement(solution.total_average_score, &self.diagnostics);
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

fn build_groups(input: &MedleySearchInputV1) -> Vec<CharacterGroup> {
    let mut by_character = BTreeMap::<u32, Vec<u32>>::new();
    for card in &input.cards {
        // Match the input-local bound model's character indexes, including
        // empty groups when every owned card of a character is excluded.
        let group = by_character.entry(card.character_id).or_default();
        if card.is_excluded {
            continue;
        }
        group.push(card.instance_id);
    }
    by_character.into_values().collect()
}

/// One availability state shared by traversal, bounds and temporary proposals.
/// The trail stores changes, not a roster copy for every search node.
struct SearchDomain<'a> {
    engine: Option<FastUpperBoundEngine<'a>>,
    available: Vec<bool>,
    character_indexes: Vec<usize>,
    counts: Vec<[u64; 3]>,
    owners: Vec<u8>,
    removed: Vec<DomainChange>,
}

enum DomainChange {
    Removed(u32, usize),
    Owners(u32, u8),
}

impl<'a> SearchDomain<'a> {
    fn new(
        input: &MedleySearchInputV1,
        groups: &[CharacterGroup],
        model: Option<&'a FastScoreModel<'a>>,
        configuration: &'a AreaItemConfigurationV1,
    ) -> Self {
        let mut available = vec![false; input.cards.len()];
        let mut character_indexes = vec![0; input.cards.len()];
        for (character, group) in groups.iter().enumerate() {
            for &id in group {
                available[id as usize] = true;
                character_indexes[id as usize] = character;
            }
        }
        let domain = Self {
            engine: model.and_then(|model| FastUpperBoundEngine::new(model, configuration).ok()),
            owners: available
                .iter()
                .map(|&present| if present { ALL_OWNERS } else { UNUSED })
                .collect(),
            available,
            character_indexes,
            counts: groups.iter().map(|group| [group.len() as u64; 3]).collect(),
            removed: Vec::new(),
        };
        #[cfg(test)]
        domain.record_storage();
        domain
    }

    fn checkpoint(&self) -> usize {
        self.removed.len()
    }

    /// Return whether any ordered head read by a bound query changed.
    fn remove(&mut self, id: u32) -> bool {
        if !self.available[id as usize] {
            return false;
        }
        self.available[id as usize] = false;
        for slot in 0..3 {
            if self.owners[id as usize] & (1 << slot) != 0 {
                self.counts[self.character_indexes[id as usize]][slot] -= 1;
            }
        }
        let checkpoint = self
            .engine
            .as_ref()
            .map_or(0, FastUpperBoundEngine::checkpoint);
        let heads_changed = self.engine.as_mut().is_some_and(|engine| {
            engine.remove(id, &self.available);
            engine.checkpoint() != checkpoint
        });
        #[cfg(test)]
        let previous_capacity = self.removed.capacity();
        self.removed.push(DomainChange::Removed(id, checkpoint));
        #[cfg(test)]
        if previous_capacity != self.removed.capacity() {
            self.record_storage();
        }
        heads_changed
    }

    fn restore(&mut self, checkpoint: usize) {
        while self.removed.len() > checkpoint {
            match self.removed.pop().unwrap() {
                DomainChange::Removed(id, heads) => {
                    if let Some(engine) = &mut self.engine {
                        engine.restore(heads);
                    }
                    self.available[id as usize] = true;
                    for slot in 0..3 {
                        if self.owners[id as usize] & (1 << slot) != 0 {
                            self.counts[self.character_indexes[id as usize]][slot] += 1;
                        }
                    }
                }
                DomainChange::Owners(id, previous) => {
                    let current = self.owners[id as usize];
                    self.owners[id as usize] = previous;
                    if self.available[id as usize] {
                        for slot in 0..3 {
                            if (previous & !current) & (1 << slot) != 0 {
                                self.counts[self.character_indexes[id as usize]][slot] += 1;
                            }
                        }
                    }
                }
            }
        }
    }

    fn restrict_owners(&mut self, id: u32, mask: u8) {
        let index = id as usize;
        let previous = self.owners[index];
        let current = previous & mask;
        if current == previous {
            return;
        }
        self.removed.push(DomainChange::Owners(id, previous));
        self.owners[index] = current;
        if self.available[index] {
            for slot in 0..3 {
                if (previous & !current) & (1 << slot) != 0 {
                    self.counts[self.character_indexes[index]][slot] -= 1;
                }
            }
        }
        // Individual-team heads may retain a card removed from only one team.
        // That is a safe relaxation; the joint DP and enumeration read the mask.
        #[cfg(test)]
        self.record_storage();
    }

    #[cfg(test)]
    fn record_storage(&self) {
        crate::profiling::domain_storage(
            self.available.capacity() * size_of::<bool>()
                + self.character_indexes.capacity() * size_of::<usize>()
                + self.counts.capacity() * size_of::<[u64; 3]>()
                + self.owners.capacity() * size_of::<u8>()
                + self.removed.capacity() * size_of::<DomainChange>(),
        );
        if let Some(engine) = &self.engine {
            crate::profiling::bound_storage(engine.storage_bytes());
        }
    }
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
            for instance_id in self.groups[group_index].iter().copied() {
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
    if !total_average_score.is_finite() {
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
            score_cache_slots().min(cache_budget / size_of::<Option<CompactCandidate>>());
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
            local_row_limit: local_row_target().min((budget - bytes) / row_bytes),
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
        songs: &[PreparedSong<'_>; 3],
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
        let row = evaluate_candidate(input, configuration, members, songs)
            .map_err(map_candidate_failure)?;
        add_counter(&mut state.diagnostics.complete_teams, 1)?;
        // Count the 3 songs x 5 leader results, not full chart scans.
        add_counter(&mut state.diagnostics.exact_song_scores, 15)?;
        if let Some(index) = index {
            self.slots[index] = Some(row);
        }
        Ok(row)
    }
}

/// Required cards need not advance the increasing character-group prefix.
/// The three families together denote a Cartesian product. Physical collisions
/// among their unresolved completions are rejected at the local join.
#[derive(Clone, Copy, Default)]
struct TeamFamily {
    members: [u32; 5],
    member_count: usize,
    next_group: usize,
    fixed_score: Option<f64>,
}

impl TeamFamily {
    fn selected(&self) -> &[u32] {
        &self.members[..self.member_count]
    }

    fn with_required(mut self, instance_id: u32) -> Self {
        self.members[self.member_count] = instance_id;
        self.member_count += 1;
        self.fixed_score = None;
        self
    }

    fn with_member(self, instance_id: u32, group_index: usize) -> Self {
        Self {
            next_group: group_index + 1,
            ..self.with_required(instance_id)
        }
    }

    fn has_character(&self, domain: &SearchDomain<'_>, character: usize) -> bool {
        self.selected()
            .iter()
            .any(|id| domain.character_indexes[*id as usize] == character)
    }

    fn can_include(&self, domain: &SearchDomain<'_>, id: u32, slot: usize) -> bool {
        let character = domain.character_indexes[id as usize];
        self.member_count < TEAM_SIZE
            && domain.available[id as usize]
            && domain.owners[id as usize] & (1 << slot) != 0
            && character >= self.next_group
            && !self.has_character(domain, character)
    }

    fn completion_count(&self, domain: &SearchDomain<'_>, slot: usize) -> u64 {
        #[cfg(test)]
        let _timing = crate::profiling::enter(crate::profiling::Phase::Domains);
        let needed = TEAM_SIZE - self.member_count;
        if needed == 0 {
            return 1;
        }
        let mut counts = [0_u64; TEAM_SIZE + 1];
        counts[0] = 1;
        for (character, &available) in domain.counts.iter().enumerate().skip(self.next_group) {
            if self.has_character(domain, character) {
                continue;
            }
            for depth in (1..=needed).rev() {
                counts[depth] =
                    counts[depth].saturating_add(counts[depth - 1].saturating_mul(available[slot]));
            }
        }
        counts[needed]
    }
}

fn team_upper(
    domain: &SearchDomain<'_>,
    family: TeamFamily,
    song_slot: usize,
    state: &mut RunState<'_, '_>,
) -> Result<TeamUpper, SearchAbort> {
    #[cfg(test)]
    let _timing = crate::profiling::enter(if family.member_count == TEAM_SIZE {
        crate::profiling::Phase::CompleteBounds
    } else {
        crate::profiling::Phase::PartialBounds
    });
    add_counter(&mut state.diagnostics.bound_evaluations, 1)?;
    match domain.engine.as_ref().and_then(|engine| {
        engine
            .team_upper(family.selected(), family.next_group, song_slot)
            .ok()
    }) {
        Some(value) => Ok(value),
        None => {
            add_counter(&mut state.diagnostics.unknown_bound_evaluations, 1)?;
            Ok(TeamUpper::default())
        }
    }
}

fn propose_assignment(
    domain: &mut SearchDomain<'_>,
    families: [TeamFamily; 3],
    order: [usize; 3],
    rank: usize,
) -> Option<[[u32; 5]; 3]> {
    let checkpoint = domain.checkpoint();
    for family in families {
        for &id in family.selected() {
            domain.remove(id);
        }
    }
    let result = (|| {
        let mut assignment = [[0; 5]; 3];
        for song_slot in order {
            let family = families[song_slot];
            let team = domain.engine.as_ref()?.propose_team(
                family.selected(),
                family.next_group,
                song_slot,
                rank,
            )?;
            for id in team {
                domain.remove(id);
            }
            assignment[song_slot] = team;
        }
        Some(assignment)
    })();
    domain.restore(checkpoint);
    result
}

struct EvaluationContext<'input, 'state, 'control, 'callback> {
    input: &'input MedleySearchInputV1,
    configuration: &'input AreaItemConfigurationV1,
    songs: &'state [PreparedSong<'input>; 3],
    cache: &'state mut ScoreCache,
    state: &'state mut RunState<'control, 'callback>,
}

impl EvaluationContext<'_, '_, '_, '_> {
    fn evaluate(&mut self, members: [u32; 5]) -> Result<CompactCandidate, SearchAbort> {
        self.cache.evaluate(
            self.input,
            self.configuration,
            members,
            self.songs,
            self.state,
        )
    }

    fn score_assignment(
        &mut self,
        assignment: [[u32; 5]; 3],
    ) -> Result<[CompactCandidate; 3], SearchAbort> {
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
        self.record_assignments(rows)?;
        Ok(rows)
    }

    fn record_assignments(&mut self, rows: [CompactCandidate; 3]) -> Result<(), SearchAbort> {
        add_counter(&mut self.state.diagnostics.heuristic_probes, 1)?;
        // Reassign the teams, never the input songs or their combo offsets.
        // Every row already contains all three song scores and best leaders.
        for order in TEAM_ORDERS {
            let selected = order.map(|team| &rows[team]);
            let total = (selected[0].song_scores[0] + selected[1].song_scores[1])
                + selected[2].song_scores[2];
            if self
                .state
                .incumbent_score()
                .is_some_and(|best| total < best)
            {
                continue;
            }
            if self
                .state
                .record_solution(candidate_solution(self.configuration, selected)?)?
            {
                add_counter(&mut self.state.diagnostics.heuristic_improvements, 1)?;
            }
        }
        Ok(())
    }

    fn can_replace(&self, team: [u32; 5], position: usize, id: u32) -> bool {
        let character = self.input.cards[id as usize].character_id;
        team.iter().enumerate().all(|(index, other)| {
            index == position || self.input.cards[*other as usize].character_id != character
        })
    }

    fn improve_assignment(
        &mut self,
        rows: [CompactCandidate; 3],
        replacements: &[u32],
    ) -> Result<(), SearchAbort> {
        #[cfg(test)]
        let _timing = crate::profiling::enter(crate::profiling::Phase::Improvements);
        // One sweep around this seed: at most 75 swaps plus 225 replacements,
        // or 375 affected five-card evaluations before legality/cache savings.
        // A better neighbor updates the incumbent, but does not start a new sweep.
        for left in 0..3 {
            for right in left + 1..3 {
                for a in 0..5 {
                    for b in 0..5 {
                        let mut first = rows[left].member_instance_ids;
                        let mut second = rows[right].member_instance_ids;
                        if !self.can_replace(first, a, second[b])
                            || !self.can_replace(second, b, first[a])
                        {
                            continue;
                        }
                        std::mem::swap(&mut first[a], &mut second[b]);
                        let mut neighbor = rows;
                        neighbor[left] = self.evaluate(first)?;
                        neighbor[right] = self.evaluate(second)?;
                        self.record_assignments(neighbor)?;
                    }
                }
            }
        }
        for &id in replacements {
            if rows.iter().any(|row| row.member_instance_ids.contains(&id)) {
                continue;
            }
            for slot in 0..3 {
                for position in 0..5 {
                    let mut team = rows[slot].member_instance_ids;
                    if !self.can_replace(team, position, id) {
                        continue;
                    }
                    team[position] = id;
                    let mut neighbor = rows;
                    neighbor[slot] = self.evaluate(team)?;
                    self.record_assignments(neighbor)?;
                }
            }
        }
        Ok(())
    }

    fn probe_completions(
        &mut self,
        domain: &mut SearchDomain<'_>,
        families: [TeamFamily; 3],
        bounds: [TeamUpper; 3],
        trials: usize,
    ) -> Result<(), SearchAbort> {
        // Construction order allocates contested cards; song slots never move.
        let mut replacements = bounds
            .into_iter()
            .filter_map(|bound| bound.members)
            .flatten()
            .collect::<Vec<_>>();
        replacements.sort_unstable();
        replacements.dedup();
        let mut seen = Vec::new();
        for (trial, order) in TEAM_ORDERS.into_iter().take(trials).enumerate() {
            self.state.poll_stop()?;
            if let Some(mut assignment) = propose_assignment(domain, families, order, trial / 3) {
                for team in &mut assignment {
                    team.sort_unstable();
                }
                let mut key = assignment;
                key.sort_unstable();
                if !seen.contains(&key) {
                    seen.push(key);
                    let rows = self.score_assignment(assignment)?;
                    self.improve_assignment(rows, &replacements)?;
                }
            }
        }
        Ok(())
    }
}

fn plan_configurations(
    input: &MedleySearchInputV1,
    model: Option<&FastScoreModel<'_>>,
    groups: &[CharacterGroup],
    songs: &[PreparedSong<'_>; 3],
    state: &mut RunState<'_, '_>,
) -> Result<Vec<ConfigurationPlan>, SearchAbort> {
    let mut plans = Vec::with_capacity(input.area_configurations.len());
    let families = [TeamFamily::default(); 3];
    for (configuration_index, configuration) in input.area_configurations.iter().enumerate() {
        state.poll_stop()?;
        let mut domain = SearchDomain::new(input, groups, model, configuration);
        let mut root_bounds = [TeamUpper::default(); 3];
        for song_slot in 0..3 {
            root_bounds[song_slot] = team_upper(&domain, families[song_slot], song_slot, state)?;
        }
        let proposed_assignment = propose_assignment(&mut domain, families, [0, 1, 2], 0);
        if let Some(assignment) = proposed_assignment {
            let mut cache = ScoreCache::new(state)?;
            EvaluationContext {
                input,
                configuration,
                songs,
                cache: &mut cache,
                state,
            }
            .score_assignment(assignment)?;
        }
        let estimated_score =
            domain
                .engine
                .as_ref()
                .zip(proposed_assignment)
                .map_or(0.0, |(engine, assignment)| {
                    let scores =
                        std::array::from_fn(|slot| engine.estimate_team(assignment[slot], slot));
                    finite_slot_sum(scores)
                });
        plans.push(ConfigurationPlan {
            configuration_index,
            root_bounds,
            whole_medley_upper: finite_slot_sum(root_bounds.map(|bound| bound.score)),
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
    required: &[u32],
    state: &mut RunState<'_, '_>,
) -> Result<(), SearchAbort> {
    #[cfg(test)]
    let _timing = crate::profiling::enter(crate::profiling::Phase::Join);
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
                if required.iter().any(|id| {
                    !row_zero.member_instance_ids.contains(id)
                        && !row_one.member_instance_ids.contains(id)
                        && !row_two.member_instance_ids.contains(id)
                }) {
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

#[derive(Clone)]
struct SearchNode {
    families: [TeamFamily; 3],
    bounds: [TeamUpper; 3],
    refresh_bounds: [bool; 3],
    whole_upper: f64,
    joint: Option<Rc<CachedJointUpper>>,
}

/// Share a conditional table down the DFS path; account each allocation once,
/// including ancestor tables still needed by unvisited siblings.
struct CachedJointUpper {
    bound: JointUpper,
    storage: Rc<Cell<usize>>,
}

impl Drop for CachedJointUpper {
    fn drop(&mut self) {
        self.storage
            .set(self.storage.get() - self.bound.bytes() - size_of::<Self>());
    }
}

struct OwnershipSplit {
    card: u32,
    included: [TeamUpper; 3],
    excluded: [TeamUpper; 3],
    eligible: [bool; 4],
    order: [usize; 4],
    whole_uppers: [f64; 4],
    refresh_bounds: [bool; 3],
}

impl OwnershipSplit {
    fn child(&self, parent: &SearchNode, owner: usize) -> Option<SearchNode> {
        if !self.eligible[owner] {
            return None;
        }
        let mut child = SearchNode {
            bounds: self.excluded,
            refresh_bounds: self.refresh_bounds,
            whole_upper: parent.whole_upper.min(self.whole_uppers[owner]),
            ..parent.clone()
        };
        if owner < 3 {
            if !self.eligible[owner] {
                return None;
            }
            child.families[owner] = parent.families[owner].with_required(self.card);
            child.bounds[owner] = self.included[owner];
        }
        Some(child)
    }
}

// Keep fixed-size ownership state in the DFS vector rather than allocating a
// second heap object for every expanded node.
#[allow(clippy::large_enum_variant)]
enum Branches {
    Ownership(OwnershipSplit),
    Prefix {
        slot: usize,
        choices: Vec<(usize, u32)>,
    },
}

struct SearchFrame {
    node: SearchNode,
    branches: Branches,
    next: usize,
    checkpoint: usize,
}

impl SearchFrame {
    fn next_child(&mut self, domain: &mut SearchDomain<'_>) -> Option<SearchNode> {
        match &self.branches {
            Branches::Ownership(split) => {
                while self.next < split.order.len() {
                    let owner = split.order[self.next];
                    self.next += 1;
                    if let Some(child) = split.child(&self.node, owner) {
                        return Some(child);
                    }
                }
                None
            }
            Branches::Prefix { slot, choices } => {
                let &(group, id) = choices.get(self.next)?;
                self.next += 1;
                let mut child = SearchNode {
                    refresh_bounds: [domain.remove(id); 3],
                    ..self.node.clone()
                };
                child.families[*slot] = child.families[*slot].with_member(id, group);
                // Unchanged heads preserve both the other teams' numeric
                // bounds and their selected hints. This team's prefix changed.
                child.refresh_bounds[*slot] = true;
                Some(child)
            }
        }
    }
}

struct JointSearch<'input, 'state, 'control, 'callback> {
    evaluation: EvaluationContext<'input, 'state, 'control, 'callback>,
    groups: &'input [CharacterGroup],
    domain: SearchDomain<'input>,
    joint_storage: Rc<Cell<usize>>,
}

// Returned on the stack, not a separately allocated object per expansion.
#[allow(clippy::large_enum_variant)]
enum JointStep {
    Unavailable,
    Finished,
    Split(OwnershipSplit),
}

impl JointSearch<'_, '_, '_, '_> {
    fn local_row_limit(&self) -> usize {
        self.evaluation.cache.local_row_limit.min(
            self.evaluation
                .state
                .control
                .memory_budget_bytes()
                .saturating_sub(self.evaluation.cache.bytes() + self.joint_storage.get())
                / (size_of::<CompactCandidate>() + size_of::<usize>()),
        )
    }

    fn effective_owners(&self, node: &SearchNode) -> Vec<u8> {
        let mut owners = self
            .domain
            .owners
            .iter()
            .enumerate()
            .map(|(id, &mask)| {
                let mut allowed = mask & UNUSED;
                for slot in 0..3 {
                    if node.families[slot].can_include(&self.domain, id as u32, slot) {
                        allowed |= 1 << slot;
                    }
                }
                allowed
            })
            .collect::<Vec<_>>();
        for slot in 0..3 {
            for &id in node.families[slot].selected() {
                owners[id as usize] = 1 << slot;
            }
        }
        owners
    }

    fn joint_step(&mut self, node: &mut SearchNode) -> Result<JointStep, SearchAbort> {
        let mut owners = self.effective_owners(node);
        if owners.contains(&0) {
            return Ok(JointStep::Finished);
        }
        let proposal_fits = node
            .joint
            .as_ref()
            .and_then(|cached| cached.bound.proposal)
            .is_some_and(|proposal| {
                proposal.iter().enumerate().all(|(slot, team)| {
                    team.iter()
                        .all(|&id| owners[id as usize] & (1 << slot) != 0)
                }) && owners.iter().enumerate().all(|(id, &mask)| {
                    mask & UNUSED != 0 || proposal.iter().any(|team| team.contains(&(id as u32)))
                })
            });
        let fixed_scores = node.families.map(|family| family.fixed_score);
        let same_model = node
            .joint
            .as_ref()
            .is_some_and(|cached| cached.bound.can_update(&owners, fixed_scores));
        // Fixed members change the remaining product and count dimensions.
        // Otherwise keep the numeric model: reuse its optimum if still allowed,
        // or update only affected working-table layers when it is excluded.
        if !proposal_fits || !same_model {
            let workspace = joint_upper::workspace_bytes(&owners, self.groups.len());
            let resident = self.evaluation.cache.bytes() + self.joint_storage.get();
            if let (Some(engine), Some(bytes)) = (&self.domain.engine, workspace)
                && bytes
                    <= self
                        .evaluation
                        .state
                        .control
                        .memory_budget_bytes()
                        .saturating_sub(resident)
            {
                let storage_peak = resident + bytes;
                self.evaluation.state.diagnostics.peak_search_storage_bytes = self
                    .evaluation
                    .state
                    .diagnostics
                    .peak_search_storage_bytes
                    .max(storage_peak as u64);
                add_counter(&mut self.evaluation.state.diagnostics.bound_evaluations, 1)?;
                if let Some(bound) = joint_upper::calculate(
                    engine,
                    self.groups,
                    &owners,
                    fixed_scores,
                    node.joint.as_ref().map(|cached| &cached.bound),
                    self.evaluation.state.incumbent_score(),
                    self.evaluation.state.control,
                )
                .map_err(abort)?
                {
                    #[cfg(test)]
                    crate::profiling::joint_bound(
                        bound.score,
                        self.joint_storage.get() + bytes,
                        false,
                    );
                    if bound.score == f64::NEG_INFINITY {
                        return Ok(JointStep::Finished);
                    }
                    if self
                        .evaluation
                        .state
                        .incumbent_score()
                        .is_some_and(|best| bound.score < best)
                    {
                        add_counter(
                            &mut self.evaluation.state.diagnostics.partial_nodes_pruned,
                            1,
                        )?;
                        return Ok(JointStep::Finished);
                    }
                    debug_assert_eq!(bound.destinations.len(), owners.len());
                    if let Some(proposal) = bound.proposal {
                        self.evaluation.score_assignment(proposal)?;
                    }
                    self.joint_storage.set(
                        self.joint_storage.get() + bound.bytes() + size_of::<CachedJointUpper>(),
                    );
                    node.joint = Some(Rc::new(CachedJointUpper {
                        bound,
                        storage: Rc::clone(&self.joint_storage),
                    }));
                } else {
                    add_counter(
                        &mut self.evaluation.state.diagnostics.unknown_bound_evaluations,
                        1,
                    )?;
                }
            }
        } else {
            #[cfg(test)]
            crate::profiling::joint_bound(
                node.joint.as_ref().unwrap().bound.score,
                self.joint_storage.get(),
                true,
            );
        }
        let Some(cached) = node.joint.as_ref() else {
            return Ok(JointStep::Unavailable);
        };
        let bound = &cached.bound;
        node.whole_upper = node.whole_upper.min(bound.score);
        if self
            .evaluation
            .state
            .incumbent_score()
            .is_some_and(|best| node.whole_upper < best)
        {
            add_counter(
                &mut self.evaluation.state.diagnostics.partial_nodes_pruned,
                1,
            )?;
            return Ok(JointStep::Finished);
        }
        let incumbent = self
            .evaluation
            .state
            .incumbent_score()
            .unwrap_or(f64::NEG_INFINITY);
        for (id, mask) in owners.iter_mut().enumerate() {
            if !self.domain.available[id] {
                continue;
            }
            #[cfg(test)]
            let previous = *mask;
            for owner in 0..4 {
                let upper = bound.destinations[id][owner];
                if upper == f64::NEG_INFINITY || upper < incumbent {
                    *mask &= !(1 << owner);
                }
            }
            if *mask == 0 {
                return Ok(JointStep::Finished);
            }
            self.domain.restrict_owners(id as u32, *mask);
            let fixed = mask.count_ones() == 1;
            #[cfg(test)]
            crate::profiling::joint_cuts((previous & !*mask).count_ones(), fixed);
            if fixed {
                if *mask != UNUSED {
                    let slot = mask.trailing_zeros() as usize;
                    // Two simultaneous forced cards may reveal an infeasible
                    // character/capacity combination. Never append past five.
                    if !node.families[slot].can_include(&self.domain, id as u32, slot) {
                        return Ok(JointStep::Finished);
                    }
                    node.families[slot] = node.families[slot].with_required(id as u32);
                }
                self.domain.remove(id as u32);
                node.refresh_bounds = [true; 3];
            }
        }
        let counts = std::array::from_fn::<_, 3, _>(|slot| {
            node.families[slot].completion_count(&self.domain, slot)
        });
        if counts.contains(&0) {
            return Ok(JointStep::Finished);
        }
        if counts.into_iter().fold(0_u64, u64::saturating_add) <= self.local_row_limit() as u64 {
            self.finish_block(
                node.families,
                counts.map(|count| count as usize),
                node.bounds.map(|bound| bound.score),
            )?;
            return Ok(JointStep::Finished);
        }
        // Prefer a still-unassigned card from the maximizing allocation. This
        // narrows the remaining allocation early. Conditional gaps order all
        // retained destinations only; no destination is dropped by rank.
        let proposal = bound.proposal;
        let card = (0..owners.len())
            .filter(|&id| self.domain.available[id] && owners[id].count_ones() > 1)
            .max_by(|&left, &right| {
                let rank = |id: usize| {
                    let in_proposal = proposal
                        .is_some_and(|teams| teams.iter().any(|team| team.contains(&(id as u32))));
                    let mut scores = bound.destinations[id];
                    for (owner, score) in scores.iter_mut().enumerate() {
                        if owners[id] & (1 << owner) == 0 {
                            *score = f64::NEG_INFINITY;
                        }
                    }
                    scores.sort_by(|a, b| b.total_cmp(a));
                    (in_proposal, scores[0] - scores[1])
                };
                let a = rank(left);
                let b = rank(right);
                a.0.cmp(&b.0)
                    .then_with(|| a.1.total_cmp(&b.1))
                    .then_with(|| right.cmp(&left))
            });
        let Some(card) = card else {
            return Ok(JointStep::Unavailable);
        };
        let eligible = std::array::from_fn(|owner| {
            if owner == 3 {
                owners[card] & UNUSED != 0
            } else {
                node.families[owner].can_include(&self.domain, card as u32, owner)
            }
        });
        let whole_uppers = bound.destinations[card];
        let mut order = [0, 1, 2, 3];
        order.sort_by(|&left, &right| {
            let suggested = |owner: usize| {
                owner < 3 && proposal.is_some_and(|teams| teams[owner].contains(&(card as u32)))
            };
            whole_uppers[right]
                .total_cmp(&whole_uppers[left])
                .then_with(|| suggested(right).cmp(&suggested(left)))
                .then_with(|| left.cmp(&right))
        });
        self.domain.remove(card as u32);
        Ok(JointStep::Split(OwnershipSplit {
            card: card as u32,
            included: node.bounds,
            excluded: node.bounds,
            eligible,
            order,
            whole_uppers,
            refresh_bounds: [true; 3],
        }))
    }

    fn family_bound(
        &mut self,
        family: TeamFamily,
        slot: usize,
        inherited: TeamUpper,
    ) -> Result<TeamUpper, SearchAbort> {
        if let Some(score) = family.fixed_score {
            return Ok(TeamUpper {
                score,
                members: Some(family.members),
            });
        }
        let mut bound = team_upper(&self.domain, family, slot, self.evaluation.state)?;
        // A child is a subset of its parent. Keep a fresh, feasible hint even
        // when the parent's numeric upper is tighter than this query's upper.
        bound.score = bound.score.min(inherited.score);
        Ok(bound)
    }

    fn contested_card(&self, node: &SearchNode) -> Option<u32> {
        let mut ids = node
            .bounds
            .iter()
            .filter_map(|bound| bound.members)
            .flatten()
            .filter(|id| self.domain.available[*id as usize])
            .collect::<Vec<_>>();
        ids.sort_unstable();
        ids.dedup();
        ids.into_iter()
            .filter_map(|id| {
                let mut count = 0;
                let mut loss = 0.0;
                for slot in 0..3 {
                    if node.bounds[slot]
                        .members
                        .is_some_and(|team| team.contains(&id))
                    {
                        count += 1;
                        if let Some(engine) = &self.domain.engine {
                            loss += engine.replacement_loss(id, slot, &self.domain.available);
                        }
                    }
                }
                (count > 1).then_some((id, count, loss))
            })
            .max_by(|left, right| {
                left.1
                    .cmp(&right.1)
                    .then_with(|| left.2.total_cmp(&right.2))
                    .then_with(|| right.0.cmp(&left.0))
            })
            .map(|entry| entry.0)
    }

    fn ownership_split(
        &mut self,
        node: &SearchNode,
        card: u32,
    ) -> Result<OwnershipSplit, SearchAbort> {
        let eligible = std::array::from_fn(|slot| {
            if slot == 3 {
                self.domain.owners[card as usize] & UNUSED != 0
            } else {
                node.families[slot].can_include(&self.domain, card, slot)
            }
        });
        let heads_changed = self.domain.remove(card);
        let mut split = OwnershipSplit {
            card,
            eligible,
            // A skipped include query leaves a valid inherited number, but no
            // hint. Its whole child is already below the incumbent.
            included: node.bounds.map(|bound| TeamUpper {
                members: None,
                ..bound
            }),
            excluded: node.bounds,
            order: [0, 1, 2, 3],
            whole_uppers: [node.whole_upper; 4],
            refresh_bounds: [false; 3],
        };
        // All four branches hide the card from unfilled slots. Compute each
        // team's include/exclude bound once and reuse it across children.
        if heads_changed {
            for slot in 0..3 {
                split.excluded[slot] =
                    self.family_bound(node.families[slot], slot, node.bounds[slot])?;
            }
        }
        for (slot, can_include) in eligible.into_iter().take(3).enumerate() {
            if can_include {
                let mut uppers = split.excluded.map(|bound| bound.score);
                uppers[slot] = node.bounds[slot].score;
                if self
                    .evaluation
                    .state
                    .incumbent_score()
                    .is_some_and(|incumbent| finite_slot_sum(uppers) < incumbent)
                {
                    continue;
                }
                let included = node.families[slot].with_required(card);
                split.included[slot] = self.family_bound(included, slot, node.bounds[slot])?;
            }
        }
        let scores: [f64; 4] = std::array::from_fn(|owner| {
            split.child(node, owner).map_or(f64::NEG_INFINITY, |child| {
                finite_slot_sum(child.bounds.map(|bound| bound.score))
            })
        });
        split.order.sort_by(|left, right| {
            scores[*right]
                .total_cmp(&scores[*left])
                .then(left.cmp(right))
        });
        Ok(split)
    }

    fn generate_rows(
        &mut self,
        family: TeamFamily,
        song_slot: usize,
        family_uppers: [f64; 3],
        rows: &mut Vec<CompactCandidate>,
    ) -> Result<(), SearchAbort> {
        self.evaluation.state.poll_stop()?;
        if family.member_count == TEAM_SIZE {
            // Transient leaf sets still get the cheap filter. A persistent
            // complete team already has an exact score carried down the path.
            let upper = if let Some(score) = family.fixed_score {
                score
            } else {
                team_upper(&self.domain, family, song_slot, self.evaluation.state)?.score
            };
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
            if family.has_character(&self.domain, group) {
                continue;
            }
            for &id in &self.groups[group] {
                if family.can_include(&self.domain, id, song_slot) {
                    self.generate_rows(
                        family.with_member(id, group),
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
        let bytes = candidate_bytes + self.evaluation.cache.bytes() + self.joint_storage.get();
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
            self.generate_rows(families[slot], slot, uppers, &mut rows[slot])?;
            if rows[slot].is_empty() {
                add_counter(&mut self.evaluation.state.diagnostics.local_blocks, 1)?;
                return Ok(());
            }
            views[slot].extend(0..rows[slot].len());
            views[slot].sort_unstable_by(|left, right| {
                candidate_rank_cmp(&rows[slot], slot, *left, *right)
            });
        }
        let required = self
            .domain
            .owners
            .iter()
            .enumerate()
            .filter_map(|(id, &mask)| (mask & UNUSED == 0).then_some(id as u32))
            .collect::<Vec<_>>();
        join_block(
            self.evaluation.configuration,
            &rows,
            &views,
            &required,
            self.evaluation.state,
        )?;
        add_counter(&mut self.evaluation.state.diagnostics.local_blocks, 1)
    }

    fn prune_node(&mut self, node: &SearchNode) -> Result<bool, SearchAbort> {
        if self
            .evaluation
            .state
            .incumbent_score()
            .is_some_and(|incumbent| {
                node.whole_upper
                    .min(finite_slot_sum(node.bounds.map(|bound| bound.score)))
                    < incumbent
            })
        {
            add_counter(
                &mut self.evaluation.state.diagnostics.partial_nodes_pruned,
                1,
            )?;
            return Ok(true);
        }
        Ok(false)
    }

    fn expand(&mut self, mut node: SearchNode) -> Result<Option<SearchFrame>, SearchAbort> {
        self.evaluation.state.poll_stop()?;
        add_counter(&mut self.evaluation.state.diagnostics.partial_nodes, 1)?;
        // Parent bounds remain valid after restricting a family. Check them
        // before doing any fresh query, and stop after the first sufficient cut.
        if self.prune_node(&node)? {
            return Ok(None);
        }
        let limit = self.local_row_limit();
        let counts = std::array::from_fn::<_, 3, _>(|slot| {
            node.families[slot].completion_count(&self.domain, slot)
        });
        if counts.contains(&0) {
            return Ok(None);
        }
        for slot in 0..3 {
            if node.refresh_bounds[slot] {
                node.bounds[slot] =
                    self.family_bound(node.families[slot], slot, node.bounds[slot])?;
                if self.prune_node(&node)? {
                    return Ok(None);
                }
            }
        }
        node.refresh_bounds = [false; 3];
        // Newly completed teams first pass the whole-medley bound filter.
        // Only survivors pay for exact scoring; descendants retain that value.
        for slot in 0..3 {
            let family = &mut node.families[slot];
            if family.member_count == TEAM_SIZE && family.fixed_score.is_none() {
                let score = self.evaluation.evaluate(family.members)?.song_scores[slot];
                family.fixed_score = Some(score);
                node.bounds[slot] = TeamUpper {
                    score,
                    members: Some(family.members),
                };
                if self.prune_node(&node)? {
                    return Ok(None);
                }
            }
        }
        let uppers = node.bounds.map(|bound| bound.score);
        if self
            .evaluation
            .state
            .diagnostics
            .partial_nodes
            .is_multiple_of(COMPLETION_PROBE_INTERVAL)
        {
            self.evaluation
                .probe_completions(&mut self.domain, node.families, node.bounds, 3)?;
        }
        if counts.into_iter().fold(0_u64, u64::saturating_add) <= limit as u64 {
            self.finish_block(node.families, counts.map(|count| count as usize), uppers)?;
            return Ok(None);
        }
        match self.joint_step(&mut node)? {
            JointStep::Finished => return Ok(None),
            JointStep::Split(split) => {
                return Ok(Some(SearchFrame {
                    node,
                    branches: Branches::Ownership(split),
                    next: 0,
                    checkpoint: self.domain.checkpoint(),
                }));
            }
            JointStep::Unavailable => {}
        }
        if let Some(card) = self.contested_card(&node) {
            let split = self.ownership_split(&node, card)?;
            return Ok(Some(SearchFrame {
                node,
                branches: Branches::Ownership(split),
                next: 0,
                checkpoint: self.domain.checkpoint(),
            }));
        }
        if let [Some(zero), Some(one), Some(two)] = node.bounds.map(|bound| bound.members) {
            self.evaluation.score_assignment([zero, one, two])?;
        }

        // With no contested suggestion, retain the complete ordinary prefix
        // partition. Required characters are skipped without skipping other groups.
        let slot = (0..3)
            .filter(|slot| node.families[*slot].member_count < TEAM_SIZE)
            .max_by(|left, right| {
                counts[*left]
                    .cmp(&counts[*right])
                    .then_with(|| {
                        node.families[*right]
                            .member_count
                            .cmp(&node.families[*left].member_count)
                    })
                    .then_with(|| right.cmp(left))
            })
            .ok_or_else(|| abort(SearchIncompleteReasonV1::InternalFailure))?;
        let family = node.families[slot];
        let hint = node.bounds[slot].members;
        let needed = TEAM_SIZE - family.member_count;
        let mut choices = Vec::new();
        for group in family.next_group..=self.groups.len() - needed {
            if family.has_character(&self.domain, group) {
                continue;
            }
            for &id in &self.groups[group] {
                if family.can_include(&self.domain, id, slot) {
                    choices.push((group, id));
                }
            }
        }
        choices
            .sort_by_key(|(group, id)| (!hint.is_some_and(|team| team.contains(id)), *group, *id));
        Ok(Some(SearchFrame {
            node,
            branches: Branches::Prefix { slot, choices },
            next: 0,
            checkpoint: self.domain.checkpoint(),
        }))
    }

    fn visit(&mut self, root: SearchNode) -> Result<(), SearchAbort> {
        let checkpoint = self.domain.checkpoint();
        let mut stack = Vec::<SearchFrame>::new();
        let mut next = Some(root);
        #[cfg(test)]
        let mut choice_bytes = 0;
        loop {
            if let Some(node) = next.take()
                && let Some(frame) = self.expand(node)?
            {
                #[cfg(test)]
                if let Branches::Prefix { choices, .. } = &frame.branches {
                    choice_bytes += choices.capacity() * size_of::<(usize, u32)>();
                }
                stack
                    .try_reserve(1)
                    .map_err(|_| abort(SearchIncompleteReasonV1::MemoryExhausted))?;
                stack.push(frame);
                #[cfg(test)]
                crate::profiling::stack_storage(
                    stack.capacity() * size_of::<SearchFrame>() + choice_bytes,
                );
            }
            let Some(frame) = stack.last_mut() else {
                break;
            };
            self.domain.restore(frame.checkpoint);
            next = frame.next_child(&mut self.domain);
            if next.is_none() {
                let _frame = stack.pop().unwrap();
                #[cfg(test)]
                if let Branches::Prefix { choices, .. } = &_frame.branches {
                    choice_bytes -= choices.capacity() * size_of::<(usize, u32)>();
                }
            }
        }
        self.domain.restore(checkpoint);
        Ok(())
    }
}

fn run_search(
    input: &MedleySearchInputV1,
    state: &mut RunState<'_, '_>,
) -> Result<(), SearchAbort> {
    #[cfg(test)]
    let setup_timing = crate::profiling::enter(crate::profiling::Phase::Setup);
    state.diagnostics.configurations_total = u64::try_from(input.area_configurations.len())
        .map_err(|_| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))?;
    let combos = start_combos(input)?;
    let groups = build_groups(input);
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

    let perfect_rate = exact_probability_to_f64(input.perfect_rate);
    let prepare_song = |slot: usize| {
        PreparedSong::new(&input.songs[slot], combos[slot], perfect_rate)
            .map_err(|_| abort(SearchIncompleteReasonV1::ArithmeticOverflow))
    };
    let songs = [prepare_song(0)?, prepare_song(1)?, prepare_song(2)?];
    let model = FastScoreModel::new(input).ok();
    let plans = plan_configurations(input, model.as_ref(), &groups, &songs, state)?;
    let families = [TeamFamily::default(); 3];
    if let Some(first) = plans.first()
        && first
            .root_bounds
            .iter()
            .all(|bound| bound.score.is_finite())
    {
        state.diagnostics.first_configuration_song_uppers =
            Some(first.root_bounds.map(|bound| bound.score));
    }
    #[cfg(test)]
    drop(setup_timing);

    // A bounded warm start can improve configuration and contested-card choices.
    // All configurations are still searched or safely pruned below.
    for plan in plans.iter().take(WARM_CONFIGURATION_COUNT) {
        state.poll_stop()?;
        let configuration = &input.area_configurations[plan.configuration_index];
        let mut domain = SearchDomain::new(input, &groups, model.as_ref(), configuration);
        let mut cache = ScoreCache::new(state)?;
        let mut evaluation = EvaluationContext {
            input,
            configuration,
            songs: &songs,
            cache: &mut cache,
            state,
        };
        if let Some(proposed) = plan.proposed_assignment {
            evaluation.score_assignment(proposed)?;
        } else if evaluation.state.best.is_none() {
            evaluation.score_assignment(assignment)?;
        }
        evaluation.probe_completions(&mut domain, families, plan.root_bounds, 6)?;
    }
    state.diagnostics.warm_start_average_score = state.incumbent_score();
    #[cfg(test)]
    crate::profiling::warm_start_finished();

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
        let domain = SearchDomain::new(input, &groups, model.as_ref(), configuration);
        let mut cache = ScoreCache::new(state)?;
        let evaluation = EvaluationContext {
            input,
            configuration,
            songs: &songs,
            cache: &mut cache,
            state,
        };
        let mut search = JointSearch {
            evaluation,
            groups: &groups,
            domain,
            joint_storage: Rc::new(Cell::new(0)),
        };
        if index >= WARM_CONFIGURATION_COUNT {
            search.evaluation.probe_completions(
                &mut search.domain,
                families,
                plan.root_bounds,
                3,
            )?;
        }
        search.visit(SearchNode {
            families,
            bounds: plan.root_bounds,
            refresh_bounds: [false; 3],
            whole_upper: plan.whole_medley_upper,
            joint: None,
        })?;
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
    fn ownership_keeps_unskipped_characters_and_the_unused_case() {
        // Exercise traversal state, not a new game/chart fixture: six character
        // groups with three physical alternatives each, and a high-group pin.
        let mut domain = SearchDomain {
            engine: None,
            available: vec![true; 18],
            character_indexes: (0..18).map(|id| id / 3).collect(),
            counts: vec![[3; 3]; 6],
            owners: vec![ALL_OWNERS; 18],
            removed: Vec::new(),
        };
        let parent = SearchNode {
            families: [TeamFamily::default(); 3],
            bounds: [TeamUpper::default(); 3],
            refresh_bounds: [false; 3],
            whole_upper: f64::INFINITY,
            joint: None,
        };
        let total = parent.families[0].completion_count(&domain, 0);
        let card = 15;
        let eligible = std::array::from_fn(|slot| {
            slot == 3 || parent.families[slot].can_include(&domain, card, slot)
        });
        let checkpoint = domain.checkpoint();
        domain.remove(card);
        let split = OwnershipSplit {
            card,
            eligible,
            included: [TeamUpper::default(); 3],
            excluded: [TeamUpper::default(); 3],
            order: [0, 1, 2, 3],
            whole_uppers: [f64::INFINITY; 4],
            refresh_bounds: [false; 3],
        };
        for owner in 0..3 {
            let child = split.child(&parent, owner).unwrap();
            for slot in 0..3 {
                assert_eq!(
                    child.families[slot].selected().contains(&card),
                    slot == owner
                );
            }
            let required = child.families[owner];
            assert_eq!(required.next_group, 0);
            assert_eq!(required.completion_count(&domain, owner), 405);
            assert_eq!(
                required.with_member(0, 0).completion_count(&domain, owner),
                108
            );
            assert!(child.families[(owner + 1) % 3].can_include(&domain, 16, (owner + 1) % 3));
            assert!(!required.can_include(&domain, 16, owner));
        }
        let unused = split.child(&parent, 3).unwrap();
        assert!(
            unused
                .families
                .iter()
                .all(|family| family.selected().is_empty())
        );
        assert!(
            unused
                .families
                .iter()
                .enumerate()
                .all(|(slot, family)| !family.can_include(&domain, card, slot))
        );
        assert_eq!(405 + unused.families[0].completion_count(&domain, 0), total);
        domain.restrict_owners(16, 3);
        assert_eq!(domain.counts[5], [2, 2, 1]);
        assert!(!parent.families[2].can_include(&domain, 16, 2));
        domain.remove(16);
        assert_eq!(domain.counts[5], [1, 1, 1]);
        domain.restore(checkpoint);
        assert!(domain.available.iter().all(|available| *available));
        assert_eq!(domain.counts, vec![[3; 3]; 6]);
        assert_eq!(domain.owners, vec![ALL_OWNERS; 18]);
        assert_eq!(parent.families[0].completion_count(&domain, 0), total);
    }

    #[test]
    #[ignore = "native full-roster diagnosis; run scripts/compare-bandori-medley-search.mjs --diagnose"]
    fn profile_real_roster_search() {
        use std::{env, fs, time::Duration, time::Instant};

        let input = crate::decode_medley_search_input_json(
            &fs::read_to_string(env::var("HHWX_MEDLEY_DIAGNOSTIC_INPUT").unwrap()).unwrap(),
        )
        .unwrap();
        let duration = Duration::from_millis(
            env::var("HHWX_MEDLEY_DIAGNOSTIC_DURATION_MS")
                .unwrap()
                .parse()
                .unwrap(),
        );
        let budget = env::var("HHWX_MEDLEY_DIAGNOSTIC_BUDGET_BYTES")
            .unwrap()
            .parse()
            .unwrap();
        let started = Instant::now();
        let mut stop_check =
            || (started.elapsed() >= duration).then_some(SearchStopReason::TimedOut);
        let mut control = SearchControl::new(budget, &mut stop_check);
        crate::profiling::start();
        let outcome = search_medley(&input, &mut control);
        let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
        let profile = crate::profiling::finish();
        println!(
            "MEDLEY_SEARCH_PROFILE:{}",
            serde_json::json!({
                "elapsedMs": elapsed_ms,
                "outcome": outcome,
                "profile": profile,
                "tuning": {
                    "localRowTarget": local_row_target(),
                    "scoreCacheSlots": score_cache_slots(),
                },
            })
        );
    }

    #[test]
    fn join_keeps_signed_scores_and_smallest_output_identity_across_ties() {
        // Independently additive negative extras can also produce negative totals.
        for (base_score, alternative_score) in [100.0, -100.0].into_iter().flat_map(|base| {
            [10.0_f64, 10.0_f64.next_down()].map(|alternative| (base, alternative))
        }) {
            let row = |member_instance_ids, leader, score| CompactCandidate {
                member_instance_ids,
                leader_instance_ids: [leader; 3],
                song_scores: [score; 3],
            };
            let rows = [
                vec![row([0, 1, 2, 3, 4], 0, base_score)],
                vec![row([5, 6, 7, 8, 9], 5, base_score)],
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
                &[],
                &mut state,
            )
            .unwrap();
            let best = state.best.take().unwrap();
            assert_eq!(best.total_average_score, 2.0 * base_score + 10.0);
            assert_eq!(best.teams[2].member_instance_ids, [11, 12, 14, 13, 15]);
            assert_eq!(
                best.teams[2].average_score.to_bits(),
                alternative_score.to_bits()
            );
            // Batch pruning may forbid leaving a still-unassigned card unused.
            // The local join must then reject an otherwise tied alternative.
            join_block(
                &AreaItemConfigurationV1 {
                    selected_area_item_ids: vec![],
                },
                &rows,
                &[vec![0], vec![0], vec![0, 1]],
                &[10],
                &mut state,
            )
            .unwrap();
            assert_eq!(
                state.best.unwrap().teams[2].member_instance_ids,
                [12, 13, 10, 14, 15]
            );
        }
    }
}
