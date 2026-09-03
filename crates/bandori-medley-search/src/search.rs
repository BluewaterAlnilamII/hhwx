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
use crate::joint_upper::{ALL_OWNERS, JointLayoutCache, JointUpper, UNUSED};
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
const INDEXED_JOIN_ROW_TARGET: usize = 1_024;
const INDEXED_JOIN_PAIR_TARGET: u64 = 65_536;
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

fn indexed_join_row_target() -> usize {
    #[cfg(test)]
    return std::env::var("HHWX_MEDLEY_DIAGNOSTIC_INDEXED_JOIN_ROW_TARGET")
        .map_or(INDEXED_JOIN_ROW_TARGET, |value| value.parse().unwrap());

    #[cfg(not(test))]
    INDEXED_JOIN_ROW_TARGET
}

fn indexed_join_pair_target() -> u64 {
    #[cfg(test)]
    return std::env::var("HHWX_MEDLEY_DIAGNOSTIC_INDEXED_JOIN_PAIR_TARGET")
        .map_or(INDEXED_JOIN_PAIR_TARGET, |value| value.parse().unwrap());

    #[cfg(not(test))]
    INDEXED_JOIN_PAIR_TARGET
}

fn score_cache_slots() -> usize {
    #[cfg(test)]
    return std::env::var("HHWX_MEDLEY_DIAGNOSTIC_SCORE_CACHE_SLOTS")
        .map_or(SCORE_CACHE_SLOTS, |value| value.parse().unwrap());

    #[cfg(not(test))]
    SCORE_CACHE_SLOTS
}

fn mode_consensus_enabled() -> bool {
    #[cfg(test)]
    return std::env::var("HHWX_MEDLEY_DIAGNOSTIC_MODE_CONSENSUS")
        .map_or(true, |value| value != "0");
    #[cfg(not(test))]
    true
}

fn competitive_mode_consensus(mode_uppers: &[f64; 8], incumbent: f64) -> Option<(u8, u8, f64)> {
    let mut required = 0b111;
    let mut possible = 0;
    let mut upper = f64::NEG_INFINITY;
    let mut found = false;
    for (mode, &score) in mode_uppers.iter().enumerate() {
        if score >= incumbent {
            let mode = mode as u8;
            required &= mode;
            possible |= mode;
            upper = upper.max(score);
            found = true;
        }
    }
    found.then_some((required, possible, upper))
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

    fn could_enter_discovered(&self, total_average_score: f64) -> bool {
        self.discovered.len() < DIAGNOSTIC_SOLUTION_LIMIT
            || self.discovered.last().is_some_and(|worst| {
                total_average_score.total_cmp(&worst.total_average_score) != Ordering::Less
            })
    }

    fn record_solution(&mut self, solution: MedleySearchSolutionV1) -> Result<bool, SearchAbort> {
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
        if score_improved {
            self.control.report_strict_improvement(&solution);
            #[cfg(test)]
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
        #[cfg(test)]
        let previous_capacity = self.removed.capacity();
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
        if previous_capacity != self.removed.capacity() {
            self.record_storage();
        }
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

fn candidate_solution_from_assigned(
    configuration: &AreaItemConfigurationV1,
    member_instance_ids: [[u32; 5]; 3],
    leader_instance_ids: [u32; 3],
    song_scores: [f64; 3],
) -> Result<MedleySearchSolutionV1, SearchAbort> {
    let mut teams = Vec::with_capacity(3);
    for song_slot in 0..MEDLEY_TEAM_COUNT {
        let members = member_order_for_leader(
            member_instance_ids[song_slot],
            leader_instance_ids[song_slot],
        )
        .map_err(map_candidate_failure)?;
        teams.push(MedleySearchTeamV1 {
            slot: song_slot as u8,
            member_instance_ids: members,
            average_score: song_scores[song_slot],
        });
    }
    let teams: [MedleySearchTeamV1; 3] = teams
        .try_into()
        .map_err(|_| abort(SearchIncompleteReasonV1::InternalFailure))?;
    let total_average_score = (song_scores[0] + song_scores[1]) + song_scores[2];
    if !total_average_score.is_finite() {
        return Err(abort(SearchIncompleteReasonV1::ArithmeticOverflow));
    }
    Ok(MedleySearchSolutionV1 {
        selected_area_item_ids: configuration.selected_area_item_ids.clone(),
        teams,
        total_average_score,
    })
}

fn candidate_solution(
    configuration: &AreaItemConfigurationV1,
    rows: [&CompactCandidate; 3],
) -> Result<MedleySearchSolutionV1, SearchAbort> {
    candidate_solution_from_assigned(
        configuration,
        rows.map(|row| row.member_instance_ids),
        std::array::from_fn(|slot| rows[slot].leader_instance_ids[slot]),
        std::array::from_fn(|slot| rows[slot].song_scores[slot]),
    )
}

fn map_candidate_failure(failure: CandidateFailure) -> SearchAbort {
    match failure {
        CandidateFailure::InvalidInternalReference => {
            abort(SearchIncompleteReasonV1::InternalFailure)
        }
        CandidateFailure::ArithmeticFailure => abort(SearchIncompleteReasonV1::ArithmeticOverflow),
    }
}

/// A local product row starts with only a proof-safe assigned-song upper.
/// Exact score work is deferred until the join establishes that the row can
/// still reach the incumbent.
#[derive(Clone, Copy, Debug)]
struct LocalCandidate {
    member_instance_ids: [u32; 5],
    upper_score: f64,
    exact_score: f64,
    exact_leader_instance_id: Option<u32>,
}

impl LocalCandidate {
    fn from_upper(mut member_instance_ids: [u32; 5], upper_score: f64) -> Self {
        member_instance_ids.sort_unstable();
        Self {
            member_instance_ids,
            upper_score,
            exact_score: 0.0,
            exact_leader_instance_id: None,
        }
    }

    fn from_exact(row: CompactCandidate, song_slot: usize) -> Self {
        Self {
            member_instance_ids: row.member_instance_ids,
            upper_score: row.song_scores[song_slot],
            exact_score: row.song_scores[song_slot],
            exact_leader_instance_id: Some(row.leader_instance_ids[song_slot]),
        }
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
        let row_bytes = size_of::<LocalCandidate>() + size_of::<usize>();
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

    fn slot_index(&self, members: [u32; 5]) -> Option<usize> {
        if self.slots.is_empty() {
            return None;
        }
        let hash = members.into_iter().fold(0_usize, |value, id| {
            value.wrapping_mul(16777619) ^ id as usize
        });
        Some(hash % self.slots.len())
    }

    fn cached(
        &self,
        members: [u32; 5],
        state: &mut RunState<'_, '_>,
    ) -> Result<Option<CompactCandidate>, SearchAbort> {
        let Some(index) = self.slot_index(members) else {
            return Ok(None);
        };
        let Some(row) = self.slots[index].filter(|row| row.member_instance_ids == members) else {
            return Ok(None);
        };
        add_counter(&mut state.diagnostics.cache_hits, 1)?;
        Ok(Some(row))
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
        let index = self.slot_index(members);
        if let Some(row) = self.cached(members, state)? {
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
    required_groups: [usize; 5],
    required_group_count: usize,
    next_group: usize,
    fixed_score: Option<f64>,
}

impl TeamFamily {
    fn selected(&self) -> &[u32] {
        &self.members[..self.member_count]
    }

    fn reserved_count(&self) -> usize {
        self.member_count + self.required_group_count
    }

    fn has_required_group(&self, group: usize) -> bool {
        self.required_groups[..self.required_group_count].contains(&group)
    }

    fn with_required_group(mut self, group: usize) -> Option<Self> {
        if self.has_required_group(group) {
            return Some(self);
        }
        if self.reserved_count() == TEAM_SIZE {
            return None;
        }
        self.required_groups[self.required_group_count] = group;
        self.required_group_count += 1;
        self.fixed_score = None;
        Some(self)
    }

    fn with_required(mut self, instance_id: u32, group: usize) -> Self {
        if let Some(position) = self.required_groups[..self.required_group_count]
            .iter()
            .position(|required| *required == group)
        {
            self.required_group_count -= 1;
            self.required_groups[position] = self.required_groups[self.required_group_count];
        }
        self.members[self.member_count] = instance_id;
        self.member_count += 1;
        self.fixed_score = None;
        self
    }

    fn with_member(self, instance_id: u32, group_index: usize) -> Self {
        debug_assert_eq!(self.required_group_count, 0);
        Self {
            next_group: group_index + 1,
            ..self.with_required(instance_id, group_index)
        }
    }

    fn has_selected_character(&self, domain: &SearchDomain<'_>, character: usize) -> bool {
        self.selected()
            .iter()
            .any(|id| domain.character_indexes[*id as usize] == character)
    }

    fn has_character(&self, domain: &SearchDomain<'_>, character: usize) -> bool {
        self.has_selected_character(domain, character) || self.has_required_group(character)
    }

    fn can_include(&self, domain: &SearchDomain<'_>, id: u32, slot: usize) -> bool {
        let character = domain.character_indexes[id as usize];
        let is_required = self.has_required_group(character);
        (is_required || self.reserved_count() < TEAM_SIZE)
            && domain.available[id as usize]
            && domain.owners[id as usize] & (1 << slot) != 0
            && (is_required
                || (character >= self.next_group && !self.has_character(domain, character)))
    }

    fn completion_count(&self, domain: &SearchDomain<'_>, slot: usize) -> u64 {
        #[cfg(test)]
        let _timing = crate::profiling::enter(crate::profiling::Phase::Domains);
        let required_ways = self.required_groups[..self.required_group_count]
            .iter()
            .fold(1_u64, |ways, &group| {
                ways.saturating_mul(domain.counts[group][slot])
            });
        if required_ways == 0 {
            return 0;
        }
        let needed = TEAM_SIZE - self.reserved_count();
        if needed == 0 {
            return required_ways;
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
        counts[needed].saturating_mul(required_ways)
    }
}

/// Remove an ownership decision from the residual domain. A non-unused
/// singleton is a fixed physical member, so it also fulfils any reservation
/// for that character before another joint model is built.
fn materialize_singleton(
    domain: &mut SearchDomain<'_>,
    families: &mut [TeamFamily; 3],
    id: u32,
) -> Option<bool> {
    let mask = domain.owners[id as usize];
    debug_assert_eq!(mask.count_ones(), 1);
    let fixed_member = mask != UNUSED;
    if fixed_member {
        let slot = mask.trailing_zeros() as usize;
        if !families[slot].can_include(domain, id, slot) {
            return None;
        }
        families[slot] = families[slot].with_required(id, domain.character_indexes[id as usize]);
    }
    domain.remove(id);
    Some(fixed_member)
}

fn materialize_forced_owners(
    domain: &mut SearchDomain<'_>,
    families: &mut [TeamFamily; 3],
    owners: &[u8],
) -> Option<bool> {
    let mut materialized = false;
    for (id, &mask) in owners.iter().enumerate() {
        if !domain.available[id] || mask == UNUSED || mask.count_ones() != 1 {
            continue;
        }
        // The family projection can force a physical card before the stored
        // owner mask does. Resolve it before a required group is counted too.
        domain.restrict_owners(id as u32, mask);
        materialize_singleton(domain, families, id as u32)?;
        materialized = true;
    }
    Some(materialized)
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
    if families
        .iter()
        .any(|family| family.required_group_count != 0)
    {
        return None;
    }
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
    fn cached(&mut self, mut members: [u32; 5]) -> Result<Option<CompactCandidate>, SearchAbort> {
        self.state.poll_stop()?;
        members.sort_unstable();
        self.cache.cached(members, self.state)
    }

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
            if !self.state.could_enter_discovered(total) {
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

fn exact_local_score<'control, 'callback, F>(
    row: &mut LocalCandidate,
    song_slot: usize,
    state: &mut RunState<'control, 'callback>,
    score_candidate: &mut F,
) -> Result<(f64, u32), SearchAbort>
where
    F: FnMut([u32; 5], &mut RunState<'control, 'callback>) -> Result<CompactCandidate, SearchAbort>,
{
    if let Some(leader) = row.exact_leader_instance_id {
        return Ok((row.exact_score, leader));
    }
    let exact = score_candidate(row.member_instance_ids, state)?;
    let score = exact.song_scores[song_slot];
    if score > row.upper_score {
        return Err(abort(SearchIncompleteReasonV1::ScorerDisagreement));
    }
    let leader = exact.leader_instance_ids[song_slot];
    row.exact_score = score;
    row.exact_leader_instance_id = Some(leader);
    Ok((score, leader))
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

fn local_candidate_rank_cmp(rows: &[LocalCandidate], left: usize, right: usize) -> Ordering {
    rows[right]
        .upper_score
        .total_cmp(&rows[left].upper_score)
        .then_with(|| {
            rows[left]
                .member_instance_ids
                .cmp(&rows[right].member_instance_ids)
        })
}

fn join_block<'control, 'callback, F>(
    configuration: &AreaItemConfigurationV1,
    rows: &mut [Vec<LocalCandidate>; 3],
    views: &[Vec<usize>; 3],
    required: &[u32],
    state: &mut RunState<'control, 'callback>,
    score_candidate: &mut F,
) -> Result<(), SearchAbort>
where
    F: FnMut([u32; 5], &mut RunState<'control, 'callback>) -> Result<CompactCandidate, SearchAbort>,
{
    #[cfg(test)]
    let _timing = crate::profiling::enter(crate::profiling::Phase::Join);
    if rows.iter().any(Vec::is_empty) {
        return Ok(());
    }
    let maximums = std::array::from_fn::<_, 3, _>(|slot| rows[slot][views[slot][0]].upper_score);
    let mut poll_counter = 0_u16;
    for &zero in &views[0] {
        state.poll_stop()?;
        if state.incumbent_score().is_some_and(|incumbent| {
            finite_slot_sum([rows[0][zero].upper_score, maximums[1], maximums[2]]) < incumbent
        }) {
            break;
        }
        let (zero_score, zero_leader) =
            exact_local_score(&mut rows[0][zero], 0, state, score_candidate)?;
        let zero_members = rows[0][zero].member_instance_ids;
        if state.incumbent_score().is_some_and(|incumbent| {
            finite_slot_sum([zero_score, maximums[1], maximums[2]]) < incumbent
        }) {
            continue;
        }
        for &one in &views[1] {
            add_counter(&mut state.diagnostics.join_pair_checks, 1)?;
            poll_counter = poll_counter.wrapping_add(1);
            if poll_counter == 0 {
                state.poll_stop()?;
            }
            if state.incumbent_score().is_some_and(|incumbent| {
                finite_slot_sum([zero_score, rows[1][one].upper_score, maximums[2]]) < incumbent
            }) {
                break;
            }
            if zero_members
                .iter()
                .any(|id| rows[1][one].member_instance_ids.contains(id))
            {
                add_counter(&mut state.diagnostics.card_conflicts, 1)?;
                continue;
            }
            let (one_score, one_leader) =
                exact_local_score(&mut rows[1][one], 1, state, score_candidate)?;
            let one_members = rows[1][one].member_instance_ids;
            if state.incumbent_score().is_some_and(|incumbent| {
                finite_slot_sum([zero_score, one_score, maximums[2]]) < incumbent
            }) {
                continue;
            }
            let mut pair_best_score = None;
            for &two in &views[2] {
                add_counter(&mut state.diagnostics.join_third_checks, 1)?;
                poll_counter = poll_counter.wrapping_add(1);
                if poll_counter == 0 {
                    state.poll_stop()?;
                }
                let cutoff = match (state.incumbent_score(), pair_best_score) {
                    (Some(incumbent), Some(best)) => Some(incumbent.max(best)),
                    (incumbent, best) => incumbent.or(best),
                };
                if cutoff.is_some_and(|cutoff| {
                    finite_slot_sum([zero_score, one_score, rows[2][two].upper_score]) < cutoff
                }) {
                    break;
                }
                let two_members = rows[2][two].member_instance_ids;
                if zero_members.iter().any(|id| two_members.contains(id))
                    || one_members.iter().any(|id| two_members.contains(id))
                {
                    add_counter(&mut state.diagnostics.card_conflicts, 1)?;
                    continue;
                }
                if required.iter().any(|id| {
                    !zero_members.contains(id)
                        && !one_members.contains(id)
                        && !two_members.contains(id)
                }) {
                    continue;
                }
                let (two_score, two_leader) =
                    exact_local_score(&mut rows[2][two], 2, state, score_candidate)?;
                let song_scores = [zero_score, one_score, two_score];
                let total = (song_scores[0] + song_scores[1]) + song_scores[2];
                if cutoff.is_some_and(|cutoff| total < cutoff) {
                    continue;
                }
                let solution = candidate_solution_from_assigned(
                    configuration,
                    [zero_members, one_members, two_members],
                    [zero_leader, one_leader, two_leader],
                    song_scores,
                )?;
                state.record_solution(solution)?;
                pair_best_score = Some(pair_best_score.map_or(total, |best: f64| best.max(total)));
                // Strict upper cuts retain the complete floating-point tie.
            }
        }
    }
    Ok(())
}

fn indexed_join_storage_bytes(card_count: usize, indexed_rows: usize) -> Option<usize> {
    card_count
        .checked_mul(indexed_rows.div_ceil(u64::BITS as usize))?
        .checked_mul(size_of::<u64>())
}

struct IndexedJoinContext {
    indexed_slot: usize,
    card_count: usize,
    candidate_base_bytes: usize,
    search_base_bytes: usize,
}

/// Exact three-way join with one candidate table indexed by physical card.
/// Ranked bit positions preserve the indexed table's safe-upper order. Strict
/// upper cuts keep the complete floating-point tie and match join_block.
fn join_indexed_block<'control, 'callback, F>(
    configuration: &AreaItemConfigurationV1,
    rows: &mut [Vec<LocalCandidate>; 3],
    views: &[Vec<usize>; 3],
    required: &[u32],
    context: IndexedJoinContext,
    state: &mut RunState<'control, 'callback>,
    score_candidate: &mut F,
) -> Result<(), SearchAbort>
where
    F: FnMut([u32; 5], &mut RunState<'control, 'callback>) -> Result<CompactCandidate, SearchAbort>,
{
    #[cfg(test)]
    let _timing = crate::profiling::enter(crate::profiling::Phase::Join);
    if rows.iter().any(Vec::is_empty) || required.len() > TEAM_SIZE * MEDLEY_TEAM_COUNT {
        return Ok(());
    }
    let IndexedJoinContext {
        indexed_slot,
        card_count,
        candidate_base_bytes,
        search_base_bytes,
    } = context;
    if indexed_slot >= MEDLEY_TEAM_COUNT || required.iter().any(|&id| id as usize >= card_count) {
        return Err(abort(SearchIncompleteReasonV1::InternalFailure));
    }
    let pair_slots = match indexed_slot {
        0 => [1, 2],
        1 => [0, 2],
        2 => [0, 1],
        _ => unreachable!(),
    };
    let indexed_count = views[indexed_slot].len();
    let word_count = indexed_count.div_ceil(u64::BITS as usize);
    let membership_len = card_count
        .checked_mul(word_count)
        .ok_or_else(|| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))?;
    let mut membership = Vec::new();
    membership
        .try_reserve_exact(membership_len)
        .map_err(|_| abort(SearchIncompleteReasonV1::MemoryExhausted))?;
    membership.resize(membership_len, 0_u64);
    let index_bytes = membership
        .capacity()
        .checked_mul(size_of::<u64>())
        .ok_or_else(|| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))?;
    let candidate_bytes = candidate_base_bytes
        .checked_add(index_bytes)
        .ok_or_else(|| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))?;
    let search_bytes = search_base_bytes
        .checked_add(index_bytes)
        .ok_or_else(|| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))?;
    state.diagnostics.peak_candidate_bytes = state
        .diagnostics
        .peak_candidate_bytes
        .max(candidate_bytes as u64);
    state.diagnostics.peak_search_storage_bytes = state
        .diagnostics
        .peak_search_storage_bytes
        .max(search_bytes as u64);
    if search_bytes > state.control.memory_budget_bytes() {
        return Err(abort(SearchIncompleteReasonV1::MemoryExhausted));
    }
    for (rank, &row_index) in views[indexed_slot].iter().enumerate() {
        let word = rank / u64::BITS as usize;
        let bit = 1_u64 << (rank % u64::BITS as usize);
        for &id in &rows[indexed_slot][row_index].member_instance_ids {
            let Some(entry) = membership.get_mut(id as usize * word_count + word) else {
                return Err(abort(SearchIncompleteReasonV1::InternalFailure));
            };
            *entry |= bit;
        }
    }

    let maximums = std::array::from_fn::<_, 3, _>(|slot| rows[slot][views[slot][0]].upper_score);
    let tail_bits = indexed_count % u64::BITS as usize;
    let final_word_mask = if tail_bits == 0 {
        u64::MAX
    } else {
        (1_u64 << tail_bits) - 1
    };
    let mut poll_counter = 0_u16;
    for &outer_index in &views[pair_slots[0]] {
        state.poll_stop()?;
        let mut upper = maximums;
        upper[pair_slots[0]] = rows[pair_slots[0]][outer_index].upper_score;
        if state
            .incumbent_score()
            .is_some_and(|incumbent| finite_slot_sum(upper) < incumbent)
        {
            break;
        }
        let (outer_score, outer_leader) = exact_local_score(
            &mut rows[pair_slots[0]][outer_index],
            pair_slots[0],
            state,
            score_candidate,
        )?;
        let outer_members = rows[pair_slots[0]][outer_index].member_instance_ids;
        upper[pair_slots[0]] = outer_score;
        if state
            .incumbent_score()
            .is_some_and(|incumbent| finite_slot_sum(upper) < incumbent)
        {
            continue;
        }
        'inner: for &inner_index in &views[pair_slots[1]] {
            add_counter(&mut state.diagnostics.join_pair_checks, 1)?;
            poll_counter = poll_counter.wrapping_add(1);
            if poll_counter == 0 {
                state.poll_stop()?;
            }
            upper[indexed_slot] = maximums[indexed_slot];
            upper[pair_slots[1]] = rows[pair_slots[1]][inner_index].upper_score;
            if state
                .incumbent_score()
                .is_some_and(|incumbent| finite_slot_sum(upper) < incumbent)
            {
                break;
            }
            if outer_members.iter().any(|id| {
                rows[pair_slots[1]][inner_index]
                    .member_instance_ids
                    .contains(id)
            }) {
                add_counter(&mut state.diagnostics.card_conflicts, 1)?;
                continue;
            }
            let (inner_score, inner_leader) = exact_local_score(
                &mut rows[pair_slots[1]][inner_index],
                pair_slots[1],
                state,
                score_candidate,
            )?;
            let inner_members = rows[pair_slots[1]][inner_index].member_instance_ids;
            upper[pair_slots[1]] = inner_score;
            if state
                .incumbent_score()
                .is_some_and(|incumbent| finite_slot_sum(upper) < incumbent)
            {
                continue;
            }

            let mut missing = [0_u32; TEAM_SIZE];
            let mut missing_count = 0;
            for &id in required {
                if !outer_members.contains(&id) && !inner_members.contains(&id) {
                    if missing_count == TEAM_SIZE {
                        continue 'inner;
                    }
                    missing[missing_count] = id;
                    missing_count += 1;
                }
            }

            let mut pair_best_score = None;
            'indexed: for word in 0..word_count {
                let mut allowed = if word + 1 == word_count {
                    final_word_mask
                } else {
                    u64::MAX
                };
                for &id in outer_members.iter().chain(&inner_members) {
                    allowed &= !membership[id as usize * word_count + word];
                }
                for &id in &missing[..missing_count] {
                    allowed &= membership[id as usize * word_count + word];
                }
                while allowed != 0 {
                    let bit = allowed.trailing_zeros() as usize;
                    allowed &= allowed - 1;
                    let indexed_rank = word * u64::BITS as usize + bit;
                    let indexed_index = views[indexed_slot][indexed_rank];
                    add_counter(&mut state.diagnostics.join_third_checks, 1)?;
                    poll_counter = poll_counter.wrapping_add(1);
                    if poll_counter == 0 {
                        state.poll_stop()?;
                    }
                    let cutoff = match (state.incumbent_score(), pair_best_score) {
                        (Some(incumbent), Some(best)) => Some(incumbent.max(best)),
                        (incumbent, best) => incumbent.or(best),
                    };
                    upper[indexed_slot] = rows[indexed_slot][indexed_index].upper_score;
                    if cutoff.is_some_and(|cutoff| finite_slot_sum(upper) < cutoff) {
                        break 'indexed;
                    }
                    let (indexed_score, indexed_leader) = exact_local_score(
                        &mut rows[indexed_slot][indexed_index],
                        indexed_slot,
                        state,
                        score_candidate,
                    )?;
                    let indexed_members = rows[indexed_slot][indexed_index].member_instance_ids;
                    let mut song_scores = [0.0; 3];
                    song_scores[pair_slots[0]] = outer_score;
                    song_scores[pair_slots[1]] = inner_score;
                    song_scores[indexed_slot] = indexed_score;
                    let total = (song_scores[0] + song_scores[1]) + song_scores[2];
                    if cutoff.is_some_and(|cutoff| total < cutoff) {
                        continue;
                    }
                    let mut member_instance_ids = [[0; 5]; 3];
                    member_instance_ids[pair_slots[0]] = outer_members;
                    member_instance_ids[pair_slots[1]] = inner_members;
                    member_instance_ids[indexed_slot] = indexed_members;
                    let mut leader_instance_ids = [0; 3];
                    leader_instance_ids[pair_slots[0]] = outer_leader;
                    leader_instance_ids[pair_slots[1]] = inner_leader;
                    leader_instance_ids[indexed_slot] = indexed_leader;
                    let solution = candidate_solution_from_assigned(
                        configuration,
                        member_instance_ids,
                        leader_instance_ids,
                        song_scores,
                    )?;
                    state.record_solution(solution)?;
                    pair_best_score =
                        Some(pair_best_score.map_or(total, |best: f64| best.max(total)));
                }
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
    character: usize,
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
            child.families[owner] = parent.families[owner].with_required(self.card, self.character);
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
                child.families[*slot] = if child.families[*slot].has_required_group(group) {
                    child.families[*slot].with_required(id, group)
                } else {
                    child.families[*slot].with_member(id, group)
                };
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
    layouts: &'state mut JointLayoutCache,
}

// Returned on the stack, not a separately allocated object per expansion.
#[allow(clippy::large_enum_variant)]
enum JointStep {
    Unavailable,
    Finished,
    Restart,
    Split(OwnershipSplit),
    CharacterModes(Vec<(usize, u8, u8, f64)>),
}

impl JointSearch<'_, '_, '_, '_> {
    fn local_row_limit(&self) -> usize {
        self.evaluation.cache.local_row_limit.min(
            self.evaluation
                .state
                .control
                .memory_budget_bytes()
                .saturating_sub(
                    self.evaluation.cache.bytes() + self.joint_storage.get() + self.layouts.bytes(),
                )
                / (size_of::<LocalCandidate>() + size_of::<usize>()),
        )
    }

    fn indexed_join_slot(&self, counts: [u64; 3]) -> Option<usize> {
        let row_target = indexed_join_row_target();
        let pair_target = indexed_join_pair_target();
        if row_target == 0 || pair_target == 0 {
            return None;
        }
        let counts = [
            usize::try_from(counts[0]).ok()?,
            usize::try_from(counts[1]).ok()?,
            usize::try_from(counts[2]).ok()?,
        ];
        let total_rows = counts.into_iter().try_fold(0_usize, usize::checked_add)?;
        if total_rows > row_target {
            return None;
        }
        let mut indexed_slot = 0;
        for slot in 1..MEDLEY_TEAM_COUNT {
            if counts[slot] > counts[indexed_slot] {
                indexed_slot = slot;
            }
        }
        let pair_slots = match indexed_slot {
            0 => [1, 2],
            1 => [0, 2],
            2 => [0, 1],
            _ => unreachable!(),
        };
        let pair_count = u64::try_from(counts[pair_slots[0]])
            .ok()?
            .checked_mul(u64::try_from(counts[pair_slots[1]]).ok()?)?;
        if pair_count > pair_target {
            return None;
        }
        let candidate_bytes = total_rows
            .checked_mul(size_of::<LocalCandidate>() + size_of::<usize>())?
            .checked_add(indexed_join_storage_bytes(
                self.domain.owners.len(),
                counts[indexed_slot],
            )?)?;
        let total_bytes = candidate_bytes
            .checked_add(self.evaluation.cache.bytes())?
            .checked_add(self.joint_storage.get())?
            .checked_add(self.layouts.bytes())?;
        (total_bytes <= self.evaluation.state.control.memory_budget_bytes()).then_some(indexed_slot)
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

    fn required_teams(&self, node: &SearchNode) -> Vec<u8> {
        let mut required = vec![0; self.groups.len()];
        for (slot, family) in node.families.iter().enumerate() {
            for &group in &family.required_groups[..family.required_group_count] {
                required[group] |= 1 << slot;
            }
        }
        required
    }

    fn joint_step(&mut self, node: &mut SearchNode) -> Result<JointStep, SearchAbort> {
        #[cfg(test)]
        let _timing = crate::profiling::enter(crate::profiling::Phase::JointBookkeeping);
        let mut owners = {
            #[cfg(test)]
            let _timing = crate::profiling::enter(crate::profiling::Phase::EffectiveOwners);
            self.effective_owners(node)
        };
        if owners.contains(&0) {
            return Ok(JointStep::Finished);
        }
        match materialize_forced_owners(&mut self.domain, &mut node.families, &owners) {
            None => return Ok(JointStep::Finished),
            Some(true) => {
                node.refresh_bounds = [true; 3];
                return Ok(JointStep::Restart);
            }
            Some(false) => {}
        }
        let required_teams = self.required_teams(node);
        debug_assert!(required_teams.iter().enumerate().all(|(group, &required)| {
            (0..3).all(|slot| {
                required & (1 << slot) == 0
                    || self.groups[group]
                        .iter()
                        .all(|&id| owners[id as usize] != 1 << slot)
            })
        }));
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
                }) && required_teams.iter().enumerate().all(|(group, &required)| {
                    (0..3).all(|slot| {
                        required & (1 << slot) == 0
                            || proposal[slot]
                                .iter()
                                .any(|&id| self.domain.character_indexes[id as usize] == group)
                    })
                })
            });
        let fixed_scores = node.families.map(|family| family.fixed_score);
        let same_model = node.joint.as_ref().is_some_and(|cached| {
            cached
                .bound
                .can_update(&owners, &required_teams, fixed_scores)
        });
        // Fixed members change the remaining product and count dimensions.
        // Otherwise keep the numeric model: reuse its optimum if still allowed,
        // or update only affected working-table layers when it is excluded.
        if !proposal_fits || !same_model {
            let workspace =
                self.layouts
                    .workspace_bytes(&owners, &required_teams, self.groups.len());
            let resident =
                self.evaluation.cache.bytes() + self.joint_storage.get() + self.layouts.bytes();
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
                if let Some(bound) = self
                    .layouts
                    .calculate(
                        engine,
                        self.groups,
                        (&owners, &required_teams, fixed_scores),
                        node.joint.as_ref().map(|cached| &cached.bound),
                        self.evaluation.state.incumbent_score(),
                        self.evaluation.state.control,
                    )
                    .map_err(abort)?
                {
                    #[cfg(test)]
                    crate::profiling::joint_bound(
                        bound.score,
                        self.joint_storage.get() + self.layouts.bytes() + bytes,
                        if same_model {
                            crate::profiling::JointMode::Incremental
                        } else {
                            crate::profiling::JointMode::Fresh
                        },
                        self.evaluation.state.incumbent_score(),
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
                self.joint_storage.get() + self.layouts.bytes(),
                crate::profiling::JointMode::Reused,
                self.evaluation.state.incumbent_score(),
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
        {
            #[cfg(test)]
            let _timing = crate::profiling::enter(crate::profiling::Phase::ApplyJointCuts);
            #[cfg(test)]
            let mut owner_width_counts = [0_u64; 4];
            let mut fixed_member = false;
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
                #[cfg(test)]
                {
                    owner_width_counts[mask.count_ones() as usize - 1] += 1;
                }
                self.domain.restrict_owners(id as u32, *mask);
                let fixed = mask.count_ones() == 1;
                #[cfg(test)]
                crate::profiling::joint_cuts((previous & !*mask).count_ones(), fixed);
                if fixed {
                    let Some(member) =
                        materialize_singleton(&mut self.domain, &mut node.families, id as u32)
                    else {
                        return Ok(JointStep::Finished);
                    };
                    fixed_member |= member;
                    node.refresh_bounds = [true; 3];
                }
            }
            #[cfg(test)]
            crate::profiling::joint_owner_widths(owner_width_counts);
            // This table describes residual occupancy before this pass. A newly
            // fixed physical member changes that meaning; descendants rebuild it.
            if !fixed_member && bound.can_update(&owners, &required_teams, fixed_scores) {
                let propagate_consensus = mode_consensus_enabled();
                let mut forced_modes = Vec::new();
                let mut best_unique = None;
                for (group, mode_uppers) in bound.mode_uppers.iter().enumerate() {
                    let Some((required, possible, upper)) =
                        competitive_mode_consensus(mode_uppers, incumbent)
                    else {
                        return Ok(JointStep::Finished);
                    };
                    if !propagate_consensus && required != possible {
                        continue;
                    }
                    let mut changes = 0_u32;
                    for slot in 0..3 {
                        if required & (1 << slot) != 0 {
                            if node.families[slot].has_selected_character(&self.domain, group) {
                                return Ok(JointStep::Finished);
                            }
                            changes += u32::from(!node.families[slot].has_required_group(group));
                        } else if possible & (1 << slot) == 0
                            && node.families[slot].has_required_group(group)
                        {
                            return Ok(JointStep::Finished);
                        }
                    }
                    let allowed = UNUSED | possible;
                    changes += self.groups[group]
                        .iter()
                        .filter(|id| self.domain.available[**id as usize])
                        .map(|id| (self.domain.owners[*id as usize] & !allowed).count_ones())
                        .sum::<u32>();
                    if changes == 0 {
                        continue;
                    }
                    if propagate_consensus {
                        forced_modes.push((group, required, possible, upper));
                    } else if best_unique
                        .is_none_or(|(_, _, _, _, best_changes)| changes > best_changes)
                    {
                        best_unique = Some((group, required, possible, upper, changes));
                    }
                }
                if !propagate_consensus
                    && let Some((group, required, possible, upper, _)) = best_unique
                {
                    forced_modes.push((group, required, possible, upper));
                }
                if !forced_modes.is_empty() {
                    #[cfg(test)]
                    crate::profiling::joint_mode_consensus(&forced_modes);
                    return Ok(JointStep::CharacterModes(forced_modes));
                }
            }
        }
        let counts = std::array::from_fn::<_, 3, _>(|slot| {
            node.families[slot].completion_count(&self.domain, slot)
        });
        if counts.contains(&0) {
            return Ok(JointStep::Finished);
        }
        #[cfg(test)]
        crate::profiling::completion_counts(
            counts,
            self.domain
                .available
                .iter()
                .zip(&self.domain.owners)
                .filter(|(available, owners)| **available && **owners & UNUSED == 0)
                .count(),
        );
        if counts.into_iter().fold(0_u64, u64::saturating_add) <= self.local_row_limit() as u64 {
            self.finish_block(
                node.families,
                counts.map(|count| count as usize),
                node.bounds.map(|bound| bound.score),
                None,
            )?;
            return Ok(JointStep::Finished);
        }
        if let Some(indexed_slot) = self.indexed_join_slot(counts) {
            self.finish_block(
                node.families,
                counts.map(|count| count as usize),
                node.bounds.map(|bound| bound.score),
                Some(indexed_slot),
            )?;
            return Ok(JointStep::Finished);
        }
        // Prefer a still-unassigned card from the maximizing allocation. This
        // narrows the remaining allocation early. Conditional gaps order all
        // retained destinations only; no destination is dropped by rank.
        #[cfg(test)]
        let _branch_timing = crate::profiling::enter(crate::profiling::Phase::JointBranching);
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
            character: self.domain.character_indexes[card],
            included: node.bounds,
            excluded: node.bounds,
            eligible,
            order,
            whole_uppers,
            refresh_bounds: [true; 3],
        }))
    }

    fn apply_character_modes(
        &mut self,
        node: &mut SearchNode,
        modes: &[(usize, u8, u8, f64)],
    ) -> bool {
        for &(group, required, possible, upper) in modes {
            node.whole_upper = node.whole_upper.min(upper);
            for slot in 0..3 {
                if required & (1 << slot) != 0 {
                    let Some(family) = node.families[slot].with_required_group(group) else {
                        return false;
                    };
                    node.families[slot] = family;
                }
            }
            let allowed = UNUSED | possible;
            for &id in &self.groups[group] {
                if !self.domain.available[id as usize] {
                    continue;
                }
                self.domain.restrict_owners(id, allowed);
                let mask = self.domain.owners[id as usize];
                if mask == 0 {
                    return false;
                }
                if mask.count_ones() == 1 {
                    if materialize_singleton(&mut self.domain, &mut node.families, id).is_none() {
                        return false;
                    }
                    node.refresh_bounds = [true; 3];
                }
            }
        }
        true
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
            character: self.domain.character_indexes[card as usize],
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
                let included = node.families[slot]
                    .with_required(card, self.domain.character_indexes[card as usize]);
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
        rows: &mut Vec<LocalCandidate>,
    ) -> Result<(), SearchAbort> {
        self.evaluation.state.poll_stop()?;
        if family.required_group_count != 0 {
            let group = family.required_groups[family.required_group_count - 1];
            for &id in &self.groups[group] {
                if family.can_include(&self.domain, id, song_slot) {
                    self.generate_rows(
                        family.with_required(id, group),
                        song_slot,
                        family_uppers,
                        rows,
                    )?;
                }
            }
            return Ok(());
        }
        if family.member_count == TEAM_SIZE {
            let mut members = family.members;
            members.sort_unstable();
            let row = if let Some(exact) = self.evaluation.cached(members)? {
                LocalCandidate::from_exact(exact, song_slot)
            } else {
                // Transient leaf sets retain only their proof-safe upper. A
                // persistent complete team already carries its exact score.
                let upper = if let Some(score) = family.fixed_score {
                    score
                } else {
                    team_upper(&self.domain, family, song_slot, self.evaluation.state)?.score
                };
                LocalCandidate::from_upper(members, upper)
            };
            let mut uppers = family_uppers;
            uppers[song_slot] = row.upper_score;
            if self
                .evaluation
                .state
                .incumbent_score()
                .is_some_and(|incumbent| finite_slot_sum(uppers) < incumbent)
            {
                add_counter(&mut self.evaluation.state.diagnostics.rows_pruned, 1)?;
                return Ok(());
            }
            // The exact capped count was reserved before entering the block.
            if rows.len() == rows.capacity() {
                return Err(abort(SearchIncompleteReasonV1::InternalFailure));
            }
            rows.push(row);
            add_counter(&mut self.evaluation.state.diagnostics.compact_rows, 1)?;
            return Ok(());
        }
        let needed = TEAM_SIZE - family.reserved_count();
        if self.groups.len().saturating_sub(family.next_group) < needed {
            return Ok(());
        }
        for group in family.next_group..=self.groups.len() - needed {
            if family.has_character(&self.domain, group) {
                continue;
            }
            // The group check already covers prefix and character uniqueness.
            for &id in &self.groups[group] {
                if self.domain.available[id as usize]
                    && self.domain.owners[id as usize] & (1 << song_slot) != 0
                {
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
        indexed_slot: Option<usize>,
    ) -> Result<(), SearchAbort> {
        #[cfg(test)]
        let _timing = crate::profiling::enter(crate::profiling::Phase::LocalBlocks);
        #[cfg(test)]
        let join_counters_before = (
            self.evaluation.state.diagnostics.join_pair_checks,
            self.evaluation.state.diagnostics.join_third_checks,
            self.evaluation.state.diagnostics.card_conflicts,
        );
        let mut rows: [Vec<LocalCandidate>; 3] = std::array::from_fn(|_| Vec::new());
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
            .map(|rows| rows.capacity() * size_of::<LocalCandidate>())
            .sum::<usize>();
        let view_bytes = views
            .iter()
            .map(|view| view.capacity() * size_of::<usize>())
            .sum::<usize>();
        let index_bytes = match indexed_slot {
            Some(slot) => indexed_join_storage_bytes(self.domain.owners.len(), counts[slot])
                .ok_or_else(|| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))?,
            None => 0,
        };
        let candidate_base_bytes = row_bytes
            .checked_add(view_bytes)
            .ok_or_else(|| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))?;
        let candidate_bytes = candidate_base_bytes
            .checked_add(index_bytes)
            .ok_or_else(|| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))?;
        let search_base_bytes = candidate_base_bytes
            .checked_add(self.evaluation.cache.bytes())
            .and_then(|bytes| bytes.checked_add(self.joint_storage.get()))
            .and_then(|bytes| bytes.checked_add(self.layouts.bytes()))
            .ok_or_else(|| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))?;
        let bytes = search_base_bytes
            .checked_add(index_bytes)
            .ok_or_else(|| abort(SearchIncompleteReasonV1::CountOrIndexOverflow))?;
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
        let mut generation_uppers = uppers;
        let mut generation_order = [0, 1, 2];
        generation_order.sort_by_key(|slot| (counts[*slot], *slot));
        for slot in generation_order {
            self.generate_rows(families[slot], slot, generation_uppers, &mut rows[slot])?;
            if rows[slot].is_empty() {
                #[cfg(test)]
                crate::profiling::local_block(
                    counts,
                    rows.each_ref().map(|rows| rows.len()),
                    0,
                    0,
                    0,
                );
                add_counter(&mut self.evaluation.state.diagnostics.local_blocks, 1)?;
                return Ok(());
            }
            generation_uppers[slot] = rows[slot]
                .iter()
                .map(|row| row.upper_score)
                .max_by(f64::total_cmp)
                .ok_or_else(|| abort(SearchIncompleteReasonV1::InternalFailure))?;
            views[slot].extend(0..rows[slot].len());
            views[slot].sort_unstable_by(|left, right| {
                local_candidate_rank_cmp(&rows[slot], *left, *right)
            });
        }
        let required = self
            .domain
            .owners
            .iter()
            .enumerate()
            .filter_map(|(id, &mask)| (mask & UNUSED == 0).then_some(id as u32))
            .collect::<Vec<_>>();
        let input = self.evaluation.input;
        let configuration = self.evaluation.configuration;
        let songs = self.evaluation.songs;
        let cache = &mut *self.evaluation.cache;
        let state = &mut *self.evaluation.state;
        let mut score_candidate = |members, state: &mut RunState<'_, '_>| {
            cache.evaluate(input, configuration, members, songs, state)
        };
        if let Some(indexed_slot) = indexed_slot {
            let indexed_slot = (0..MEDLEY_TEAM_COUNT)
                .max_by_key(|&slot| rows[slot].len())
                .unwrap_or(indexed_slot);
            join_indexed_block(
                configuration,
                &mut rows,
                &views,
                &required,
                IndexedJoinContext {
                    indexed_slot,
                    card_count: self.domain.owners.len(),
                    candidate_base_bytes,
                    search_base_bytes,
                },
                state,
                &mut score_candidate,
            )?;
        } else {
            join_block(
                configuration,
                &mut rows,
                &views,
                &required,
                state,
                &mut score_candidate,
            )?;
        }
        #[cfg(test)]
        crate::profiling::local_block(
            counts,
            rows.each_ref().map(|rows| rows.len()),
            self.evaluation
                .state
                .diagnostics
                .join_pair_checks
                .saturating_sub(join_counters_before.0),
            self.evaluation
                .state
                .diagnostics
                .join_third_checks
                .saturating_sub(join_counters_before.1),
            self.evaluation
                .state
                .diagnostics
                .card_conflicts
                .saturating_sub(join_counters_before.2),
        );
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
        loop {
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
                self.evaluation.probe_completions(
                    &mut self.domain,
                    node.families,
                    node.bounds,
                    3,
                )?;
            }
            if counts.into_iter().fold(0_u64, u64::saturating_add) <= limit as u64 {
                #[cfg(test)]
                crate::profiling::completion_counts(
                    counts,
                    self.domain
                        .available
                        .iter()
                        .zip(&self.domain.owners)
                        .filter(|(available, owners)| **available && **owners & UNUSED == 0)
                        .count(),
                );
                self.finish_block(
                    node.families,
                    counts.map(|count| count as usize),
                    uppers,
                    None,
                )?;
                return Ok(None);
            }
            if let Some(indexed_slot) = self.indexed_join_slot(counts) {
                #[cfg(test)]
                crate::profiling::completion_counts(
                    counts,
                    self.domain
                        .available
                        .iter()
                        .zip(&self.domain.owners)
                        .filter(|(available, owners)| **available && **owners & UNUSED == 0)
                        .count(),
                );
                self.finish_block(
                    node.families,
                    counts.map(|count| count as usize),
                    uppers,
                    Some(indexed_slot),
                )?;
                return Ok(None);
            }
            match self.joint_step(&mut node)? {
                JointStep::Finished => return Ok(None),
                JointStep::Restart => continue,
                JointStep::CharacterModes(modes) => {
                    if !self.apply_character_modes(&mut node, &modes) {
                        return Ok(None);
                    }
                    continue;
                }
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
                .filter(|slot| {
                    node.families[*slot].required_group_count != 0
                        || node.families[*slot].reserved_count() < TEAM_SIZE
                })
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
            let mut choices = Vec::new();
            if family.required_group_count != 0 {
                let group = family.required_groups[family.required_group_count - 1];
                for &id in &self.groups[group] {
                    if family.can_include(&self.domain, id, slot) {
                        choices.push((group, id));
                    }
                }
            } else {
                let needed = TEAM_SIZE - family.reserved_count();
                for group in family.next_group..=self.groups.len() - needed {
                    if family.has_character(&self.domain, group) {
                        continue;
                    }
                    // The group check already covers prefix and character uniqueness.
                    for &id in &self.groups[group] {
                        if self.domain.available[id as usize]
                            && self.domain.owners[id as usize] & (1 << slot) != 0
                        {
                            choices.push((group, id));
                        }
                    }
                }
            }
            choices.sort_by_key(|(group, id)| {
                (!hint.is_some_and(|team| team.contains(id)), *group, *id)
            });
            return Ok(Some(SearchFrame {
                node,
                branches: Branches::Prefix { slot, choices },
                next: 0,
                checkpoint: self.domain.checkpoint(),
            }));
        }
    }

    fn visit(&mut self, root: SearchNode) -> Result<(), SearchAbort> {
        let checkpoint = self.domain.checkpoint();
        let mut stack = Vec::<SearchFrame>::new();
        let mut next = Some(root);
        #[cfg(test)]
        let mut choice_bytes = 0;
        loop {
            if let Some(node) = next.take() {
                #[cfg(test)]
                let profile_pruned_before = self.evaluation.state.diagnostics.partial_nodes_pruned;
                #[cfg(test)]
                let profile_blocks_before = self.evaluation.state.diagnostics.local_blocks;
                #[cfg(test)]
                crate::profiling::node_started(
                    stack.len(),
                    node.families.map(|family| family.reserved_count() as u8),
                );
                let expanded = self.expand(node)?;
                #[cfg(test)]
                {
                    let (outcome, branch_children) = match expanded.as_ref() {
                        Some(frame) => {
                            let children = match &frame.branches {
                                Branches::Ownership(split) => {
                                    split.eligible.iter().filter(|eligible| **eligible).count()
                                }
                                Branches::Prefix { choices, .. } => choices.len(),
                            };
                            (crate::profiling::NodeOutcome::Branched, children)
                        }
                        None if self.evaluation.state.diagnostics.partial_nodes_pruned
                            > profile_pruned_before =>
                        {
                            (crate::profiling::NodeOutcome::Pruned, 0)
                        }
                        None if self.evaluation.state.diagnostics.local_blocks
                            > profile_blocks_before =>
                        {
                            (crate::profiling::NodeOutcome::LocalBlock, 0)
                        }
                        None => (crate::profiling::NodeOutcome::Finished, 0),
                    };
                    crate::profiling::node_finished(outcome, branch_children);
                }
                if let Some(frame) = expanded {
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

    let mut layouts = JointLayoutCache::new();
    for (index, plan) in plans.into_iter().enumerate() {
        state.poll_stop()?;
        #[cfg(test)]
        crate::profiling::configuration_started(
            index,
            plan.configuration_index,
            &input.area_configurations[plan.configuration_index].selected_area_item_ids,
        );
        if state
            .incumbent_score()
            .is_some_and(|incumbent| plan.whole_medley_upper < incumbent)
        {
            add_counter(&mut state.diagnostics.configurations_pruned, 1)?;
            add_counter(&mut state.diagnostics.configurations_completed, 1)?;
            #[cfg(test)]
            crate::profiling::configuration_finished("rootPruned");
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
            layouts: &mut layouts,
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
        #[cfg(test)]
        crate::profiling::configuration_finished("searched");
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

    fn unexpected_local_score(
        _members: [u32; 5],
        _state: &mut RunState<'_, '_>,
    ) -> Result<CompactCandidate, SearchAbort> {
        Err(abort(SearchIncompleteReasonV1::InternalFailure))
    }

    #[test]
    fn competitive_modes_propagate_only_shared_occupancy() {
        let mut uppers = [f64::NEG_INFINITY; 8];
        uppers[0b001] = 10.0;
        uppers[0b011] = 12.0;
        uppers[0b101] = 9.0;

        assert_eq!(
            competitive_mode_consensus(&uppers, 9.0),
            Some((0b001, 0b111, 12.0))
        );
        assert_eq!(
            competitive_mode_consensus(&uppers, 10.0),
            Some((0b001, 0b011, 12.0))
        );
        assert_eq!(
            competitive_mode_consensus(&uppers, 12.0),
            Some((0b011, 0b011, 12.0))
        );
        assert_eq!(competitive_mode_consensus(&uppers, 12.1), None);
    }

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
        let required_group = parent.families[0].with_required_group(5).unwrap();
        assert_eq!(required_group.completion_count(&domain, 0), 1_215);
        let resolved_group = required_group.with_required(15, 5);
        assert_eq!(resolved_group.next_group, 0);
        assert_eq!(resolved_group.completion_count(&domain, 0), 405);

        let mut singleton_families = [TeamFamily::default(); 3];
        singleton_families[0] = singleton_families[0].with_required_group(5).unwrap();
        domain.restrict_owners(15, 1);
        assert_eq!(
            materialize_singleton(&mut domain, &mut singleton_families, 15),
            Some(true)
        );
        assert_eq!(singleton_families[0].selected(), &[15]);
        assert_eq!(singleton_families[0].required_group_count, 0);
        assert!(!domain.available[15]);
        domain.restore(0);

        let mut projected_families = [TeamFamily::default(); 3];
        projected_families[0] = projected_families[0].with_required_group(5).unwrap();
        projected_families[1] = projected_families[1].with_required(16, 5);
        domain.remove(16);
        domain.restrict_owners(15, 0b011);
        let mut projected_owners = domain.owners.clone();
        projected_owners[15] = projected_families
            .iter()
            .enumerate()
            .fold(domain.owners[15] & UNUSED, |mask, (slot, family)| {
                mask | (u8::from(family.can_include(&domain, 15, slot)) << slot)
            });
        assert_eq!(domain.owners[15], 0b011);
        assert_eq!(projected_owners[15], 0b001);
        assert_eq!(
            materialize_forced_owners(&mut domain, &mut projected_families, &projected_owners,),
            Some(true)
        );
        assert_eq!(projected_families[0].selected(), &[15]);
        assert_eq!(projected_families[0].required_group_count, 0);
        assert!(!domain.available[15]);
        domain.restore(0);

        let card = 15;
        let eligible = std::array::from_fn(|slot| {
            slot == 3 || parent.families[slot].can_include(&domain, card, slot)
        });
        let checkpoint = domain.checkpoint();
        domain.remove(card);
        let split = OwnershipSplit {
            card,
            character: domain.character_indexes[card as usize],
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
                    "indexedJoinRowTarget": indexed_join_row_target(),
                    "indexedJoinPairTarget": indexed_join_pair_target(),
                    "scoreCacheSlots": score_cache_slots(),
                },
            })
        );
    }

    #[test]
    fn discovered_admission_uses_its_own_tenth_place_cutoff() {
        let mut never_stop = || None;
        let mut control = SearchControl::new(1024, &mut never_stop);
        let mut state = RunState {
            control: &mut control,
            diagnostics: MedleySearchDiagnosticsV1::default(),
            best: None,
            discovered: Vec::new(),
        };
        let solution = |identity: u32, total_average_score: f64| MedleySearchSolutionV1 {
            selected_area_item_ids: vec![identity],
            teams: [MedleySearchTeamV1 {
                slot: 0,
                member_instance_ids: [0; 5],
                average_score: 0.0,
            }; 3],
            total_average_score,
        };

        state.record_solution(solution(0, 100.0)).unwrap();
        assert!(
            state.could_enter_discovered(50.0),
            "a lower score still belongs while fewer than ten solutions exist"
        );
        state.record_solution(solution(1, 50.0)).unwrap();
        for identity in 2..=10 {
            state
                .record_solution(solution(identity, 101.0 - f64::from(identity)))
                .unwrap();
        }

        assert_eq!(state.discovered.len(), DIAGNOSTIC_SOLUTION_LIMIT);
        assert_eq!(
            state
                .discovered
                .iter()
                .map(|candidate| candidate.total_average_score)
                .collect::<Vec<_>>(),
            vec![100.0, 99.0, 98.0, 97.0, 96.0, 95.0, 94.0, 93.0, 92.0, 91.0]
        );
        assert!(!state.could_enter_discovered(90.0));
        assert!(state.could_enter_discovered(91.0));
    }

    #[test]
    fn strict_improvement_callback_ignores_tie_representative_changes() {
        let mut reported_scores = Vec::new();
        {
            let mut never_stop = || None;
            let mut report = |solution: &MedleySearchSolutionV1| {
                reported_scores.push(solution.total_average_score);
            };
            let mut control =
                SearchControl::new(1024, &mut never_stop).with_strict_improvement(&mut report);
            let mut state = RunState {
                control: &mut control,
                diagnostics: MedleySearchDiagnosticsV1::default(),
                best: None,
                discovered: Vec::new(),
            };
            let solution = |identity, score| MedleySearchSolutionV1 {
                selected_area_item_ids: vec![identity],
                teams: [MedleySearchTeamV1 {
                    slot: 0,
                    member_instance_ids: [0; 5],
                    average_score: 0.0,
                }; 3],
                total_average_score: score,
            };

            state.record_solution(solution(2, 100.0)).unwrap();
            state.record_solution(solution(1, 100.0)).unwrap();
            assert_eq!(state.best.as_ref().unwrap().selected_area_item_ids, [1]);
            state.record_solution(solution(0, 101.0)).unwrap();
        }

        assert_eq!(reported_scores, [100.0, 101.0]);
    }

    #[test]
    fn join_keeps_signed_scores_and_smallest_output_identity_across_ties() {
        // Independently additive negative extras can also produce negative totals.
        for (base_score, alternative_score) in [100.0, -100.0].into_iter().flat_map(|base| {
            [10.0_f64, 10.0_f64.next_down()].map(|alternative| (base, alternative))
        }) {
            let row = |member_instance_ids, leader, score| LocalCandidate {
                member_instance_ids,
                upper_score: score,
                exact_score: score,
                exact_leader_instance_id: Some(leader),
            };
            let rows = [
                vec![row([0, 1, 2, 3, 4], 0, base_score)],
                vec![row([5, 6, 7, 8, 9], 5, base_score)],
                vec![
                    row([10, 12, 13, 14, 15], 10, 10.0),
                    row([11, 12, 13, 14, 15], 14, alternative_score),
                ],
            ];
            let views = [vec![0], vec![0], vec![0, 1]];
            let run = |indexed_slot, required: &[u32]| {
                let mut rows = rows.clone();
                let mut never_stop = || None;
                let mut control = SearchControl::new(1024, &mut never_stop);
                let mut state = RunState {
                    control: &mut control,
                    diagnostics: MedleySearchDiagnosticsV1::default(),
                    best: None,
                    discovered: Vec::new(),
                };
                let configuration = AreaItemConfigurationV1 {
                    selected_area_item_ids: vec![],
                };
                let mut unexpected_score = unexpected_local_score;
                if let Some(indexed_slot) = indexed_slot {
                    join_indexed_block(
                        &configuration,
                        &mut rows,
                        &views,
                        required,
                        IndexedJoinContext {
                            indexed_slot,
                            card_count: 16,
                            candidate_base_bytes: 0,
                            search_base_bytes: 0,
                        },
                        &mut state,
                        &mut unexpected_score,
                    )
                    .unwrap();
                } else {
                    join_block(
                        &configuration,
                        &mut rows,
                        &views,
                        required,
                        &mut state,
                        &mut unexpected_score,
                    )
                    .unwrap();
                }
                (state.best, state.discovered)
            };
            let baseline = run(None, &[]);
            let best = baseline.0.as_ref().unwrap();
            assert_eq!(best.total_average_score, 2.0 * base_score + 10.0);
            assert_eq!(best.teams[2].member_instance_ids, [11, 12, 14, 13, 15]);
            assert_eq!(
                best.teams[2].average_score.to_bits(),
                alternative_score.to_bits()
            );
            for indexed_slot in 0..3 {
                assert_eq!(run(Some(indexed_slot), &[]), baseline);
            }
            // Batch pruning may forbid leaving a still-unassigned card unused.
            // The local join must then reject an otherwise tied alternative.
            let required_baseline = run(None, &[10]);
            assert_eq!(
                required_baseline.0.as_ref().unwrap().teams[2].member_instance_ids,
                [12, 13, 10, 14, 15]
            );
            for indexed_slot in 0..3 {
                assert_eq!(run(Some(indexed_slot), &[10]), required_baseline);
            }
        }
    }

    #[test]
    fn indexed_join_matches_scan_across_bitset_words_and_float_order() {
        const ROW_COUNT: usize = 70;
        const REQUIRED: [u32; 2] = [1_200, 1_201];
        let rows: [Vec<LocalCandidate>; 3] = std::array::from_fn(|slot| {
            (0..ROW_COUNT)
                .map(|rank| {
                    let base = slot as u32 * 400 + rank as u32 * 5;
                    let mut members = [base, base + 1, base + 2, base + 3, base + 4];
                    if rank == 65 {
                        members[3..].copy_from_slice(&REQUIRED);
                        members.sort_unstable();
                    }
                    let score = match slot {
                        0 => 1.0e16,
                        1 => -1.0e16,
                        2 => 1.0 - rank as f64 / 1_000.0,
                        _ => unreachable!(),
                    };
                    LocalCandidate {
                        member_instance_ids: members,
                        // Deliberately scramble upper order relative to exact
                        // order; only the upper may stop the deferred join.
                        upper_score: score.max(0.0) + (rank % 7) as f64,
                        exact_score: score,
                        exact_leader_instance_id: Some(members[0]),
                    }
                })
                .collect()
        });
        let mut views: [Vec<usize>; 3] = std::array::from_fn(|_| (0..ROW_COUNT).collect());
        for slot in 0..3 {
            views[slot].sort_unstable_by(|left, right| {
                local_candidate_rank_cmp(&rows[slot], *left, *right)
            });
        }
        let run = |indexed_slot| {
            let mut rows = rows.clone();
            let mut never_stop = || None;
            let mut control = SearchControl::new(1024 * 1024, &mut never_stop);
            let mut state = RunState {
                control: &mut control,
                diagnostics: MedleySearchDiagnosticsV1::default(),
                best: None,
                discovered: Vec::new(),
            };
            let configuration = AreaItemConfigurationV1 {
                selected_area_item_ids: vec![],
            };
            let mut unexpected_score = unexpected_local_score;
            if let Some(indexed_slot) = indexed_slot {
                join_indexed_block(
                    &configuration,
                    &mut rows,
                    &views,
                    &REQUIRED,
                    IndexedJoinContext {
                        indexed_slot,
                        card_count: 1_202,
                        candidate_base_bytes: 0,
                        search_base_bytes: 0,
                    },
                    &mut state,
                    &mut unexpected_score,
                )
                .unwrap();
            } else {
                join_block(
                    &configuration,
                    &mut rows,
                    &views,
                    &REQUIRED,
                    &mut state,
                    &mut unexpected_score,
                )
                .unwrap();
            }
            state.best.unwrap()
        };
        let baseline = run(None);
        assert_eq!(baseline.total_average_score.to_bits(), 1.0_f64.to_bits());
        assert_ne!((1.0e16 + -1.0e16) + 1.0, 1.0e16 + (-1.0e16 + 1.0));
        for indexed_slot in 0..3 {
            assert_eq!(run(Some(indexed_slot)), baseline);
        }
    }
}
