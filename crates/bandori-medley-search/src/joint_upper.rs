//! Joint allocation bound and cost-based removal of card destinations.
//!
//! Each character supplies at most one distinct physical card to each team.
//! Forward/backward tables join a local choice to every compatible outside
//! allocation, so all four destinations are bounded without re-running the DP.

use std::mem::size_of;
use std::rc::Rc;

use crate::fast_upper::{FastUpperBoundEngine, add_up, mul_up, rounding_factor, sub_up};
use crate::{SearchControl, SearchIncompleteReasonV1, SearchStopReason};

pub(crate) const UNUSED: u8 = 8;
pub(crate) const ALL_OWNERS: u8 = 15;
const PATTERNS: usize = 27;
const NO_CARD: u32 = u32::MAX;

#[derive(Clone)]
pub(crate) struct JointWeights {
    pub(crate) cards: Vec<[[f64; 2]; 3]>,
    pub(crate) constant: f64,
    pub(crate) offset: f64,
    pub(crate) fixed_members: [Vec<u32>; 3],
    pub(crate) fixed_leaders: [Option<f64>; 3],
    pub(crate) fixed_scores: [Option<f64>; 3],
}

pub(crate) struct JointUpper {
    pub(crate) score: f64,
    pub(crate) destinations: Vec<[f64; 4]>,
    pub(crate) mode_uppers: Vec<[f64; 8]>,
    pub(crate) proposal: Option<[[u32; 5]; 3]>,
    working: Option<JointWorking>,
}

impl JointUpper {
    pub(crate) fn bytes(&self) -> usize {
        size_of::<Self>()
            + self.destinations.capacity() * size_of::<[f64; 4]>()
            + self.mode_uppers.capacity() * size_of::<[f64; 8]>()
            + self.working.as_ref().map_or(0, JointWorking::heap_bytes)
    }

    pub(crate) fn can_update(&self, owners: &[u8], fixed_scores: [Option<f64>; 3]) -> bool {
        self.working.as_ref().is_some_and(|working| {
            working.weights.fixed_scores == fixed_scores
                && owners
                    .iter()
                    .zip(&working.owners)
                    .all(|(&now, &before)| now & !before == 0)
                && (0..3).all(|slot| {
                    owners
                        .iter()
                        .enumerate()
                        .filter_map(|(id, &mask)| (mask == 1 << slot).then_some(id as u32))
                        .eq(working.weights.fixed_members[slot].iter().copied())
                })
        })
    }

    fn infeasible() -> Self {
        Self {
            score: f64::NEG_INFINITY,
            destinations: Vec::new(),
            mode_uppers: Vec::new(),
            proposal: None,
            working: None,
        }
    }
}

#[derive(Clone, Copy, PartialEq)]
struct LocalChoice {
    score: f64,
    cards: [u32; 3],
}

impl Default for LocalChoice {
    fn default() -> Self {
        Self {
            score: f64::NEG_INFINITY,
            cards: [NO_CARD; 3],
        }
    }
}

fn roles(mut pattern: usize) -> [usize; 3] {
    std::array::from_fn(|_| {
        let role = pattern % 3;
        pattern /= 3;
        role
    })
}

/// A fresh team uses the original ten ordinary/leader count states. Once it
/// has fixed members, count only its remaining cards; a fixed member can supply
/// the leader without consuming another card. A completed team has one state.
#[derive(Clone)]
struct CountLayout {
    remaining: [usize; 3],
    radices: [usize; 3],
    states: usize,
    transitions: [Vec<(u16, u16)>; PATTERNS],
}

impl CountLayout {
    fn radix(remaining: usize) -> usize {
        match remaining {
            0 => 1,
            5 => 10,
            _ => 2 * (remaining + 1),
        }
    }

    fn new(remaining: [usize; 3]) -> Self {
        let radices = remaining.map(Self::radix);
        let mut layout = Self {
            remaining,
            radices,
            states: radices.into_iter().product(),
            transitions: std::array::from_fn(|_| Vec::new()),
        };
        assert!(layout.states <= usize::from(u16::MAX));
        layout.transitions = std::array::from_fn(|pattern| {
            let mut edges = Vec::with_capacity(layout.states);
            for from in 0..layout.states {
                if let Some(to) = layout.destination(from, roles(pattern)) {
                    edges.push((from as u16, to as u16));
                }
            }
            edges
        });
        layout
    }

    fn heap_bytes(&self) -> usize {
        size_of::<Self>()
            + 2 * size_of::<usize>()
            + self
                .transitions
                .iter()
                .map(|edges| edges.capacity() * size_of::<(u16, u16)>())
                .sum::<usize>()
    }

    fn destination(&self, mut state: usize, roles: [usize; 3]) -> Option<usize> {
        let mut result = 0;
        let mut place = 1;
        for (slot, role) in roles.into_iter().enumerate() {
            let radix = self.radices[slot];
            let digit = state % radix;
            state /= radix;
            let remaining = self.remaining[slot];
            let delta = match role {
                0 => 0,
                _ if remaining == 0 => return None,
                1 if remaining == 5 && digit % 5 < 4 => 1,
                2 if remaining == 5 && digit < 5 => 5,
                1 if remaining < 5 && digit % (remaining + 1) < remaining => 1,
                2 if remaining < 5 && digit < remaining => remaining + 2,
                _ => return None,
            };
            result += (digit + delta) * place;
            place *= radix;
        }
        Some(result)
    }

    fn initialize(&self, first: &mut [f64], leaders: [Option<f64>; 3]) {
        for flags in 0..8 {
            let mut index = 0;
            let mut value = 0.0;
            let mut place = 1;
            for (slot, leader) in leaders.iter().enumerate() {
                if flags & (1 << slot) != 0 {
                    let Some(leader) = *leader else {
                        value = f64::NEG_INFINITY;
                        break;
                    };
                    index += (self.remaining[slot] + 1) * place;
                    value = sum_up(value, leader);
                }
                place *= self.radices[slot];
            }
            if value != f64::NEG_INFINITY {
                first[index] = value;
            }
        }
    }
}

pub(crate) struct JointLayoutCache {
    layouts: [Option<Rc<CountLayout>>; 216],
    bytes: usize,
}

impl JointLayoutCache {
    pub(crate) fn new() -> Self {
        Self {
            layouts: std::array::from_fn(|_| None),
            bytes: 0,
        }
    }

    pub(crate) fn bytes(&self) -> usize {
        self.bytes
    }

    /// Conservative allocation peak for a new model or copied child snapshot.
    /// A transition layout already retained by this search is not reserved twice.
    pub(crate) fn workspace_bytes(&self, owners: &[u8], groups: usize) -> Option<usize> {
        let remaining = std::array::from_fn::<_, 3, _>(|slot| {
            5_usize.checked_sub(owners.iter().filter(|&&mask| mask == 1 << slot).count())
        });
        let remaining = [remaining[0]?, remaining[1]?, remaining[2]?];
        let states = remaining
            .into_iter()
            .map(CountLayout::radix)
            .try_fold(1_usize, usize::checked_mul)?;
        let index = (remaining[0] * 6 + remaining[1]) * 6 + remaining[2];
        let transition_bytes = if self.layouts[index].is_none() {
            states.checked_mul(PATTERNS * size_of::<(u16, u16)>())?
        } else {
            0
        };
        (groups.checked_add(1)?.checked_mul(states)?)
            .checked_mul(17)?
            .checked_add(owners.len().checked_mul(256)?)?
            .checked_add(groups.checked_mul(
                2 * PATTERNS * size_of::<LocalChoice>() + 2 * size_of::<LocalGroup>(),
            )?)?
            .checked_add(transition_bytes)?
            .checked_add(2 * size_of::<JointUpper>() + 4096)
    }

    fn get(&mut self, remaining: [usize; 3]) -> Rc<CountLayout> {
        debug_assert!(remaining.iter().all(|&count| count <= 5));
        let index = (remaining[0] * 6 + remaining[1]) * 6 + remaining[2];
        if self.layouts[index].is_none() {
            let layout = Rc::new(CountLayout::new(remaining));
            self.bytes += layout.heap_bytes();
            self.layouts[index] = Some(layout);
        }
        Rc::clone(self.layouts[index].as_ref().unwrap())
    }
}

fn sum_up(left: f64, right: f64) -> f64 {
    if left == f64::NEG_INFINITY || right == f64::NEG_INFINITY {
        f64::NEG_INFINITY
    } else {
        add_up(left, right).unwrap_or(f64::INFINITY)
    }
}

fn score_upper(value: f64, constant: f64, offset: f64) -> f64 {
    if value == f64::NEG_INFINITY {
        return value;
    }
    // At most four rounded operations per positive contribution: integer->f64,
    // division by five, and the two canonical song additions. Negative actual
    // song scores can be replaced by zero by monotonicity before this envelope.
    add_up(value, constant)
        .and_then(|sum| sub_up(sum, offset))
        .and_then(|sum| mul_up(sum, rounding_factor(4)?))
        .unwrap_or(f64::INFINITY)
}

/// Only three roles can consume cards of one character. Their four best cards
/// suffice even when one card is forbidden: at most two other roles and that
/// exclusion can occupy better alternatives. Required/forced cards are added
/// explicitly; this is a local matching proof, not a roster candidate cap.
#[derive(Clone)]
struct LocalGroup {
    best: [[[u32; 4]; 2]; 3],
    required: Vec<u32>,
}

struct LocalCandidates {
    ids: [[[u32; 8]; 2]; 3],
    lengths: [[u8; 2]; 3],
}

impl LocalCandidates {
    fn contains(&self, id: u32) -> bool {
        (0..3).any(|slot| {
            (0..2).any(|role| {
                self.ids[slot][role][..usize::from(self.lengths[slot][role])].contains(&id)
            })
        })
    }
}

impl LocalGroup {
    fn new(ids: &[u32], owners: &[u8], weights: &JointWeights) -> Self {
        let mut best = [[[NO_CARD; 4]; 2]; 3];
        for &id in ids {
            for (slot, by_role) in best.iter_mut().enumerate() {
                if owners[id as usize] & (1 << slot) == 0 {
                    continue;
                }
                for (role, list) in by_role.iter_mut().enumerate() {
                    let mut candidate = id;
                    for entry in list {
                        if *entry == NO_CARD
                            || weights.cards[candidate as usize][slot][role]
                                > weights.cards[*entry as usize][slot][role]
                        {
                            std::mem::swap(entry, &mut candidate);
                        }
                        if candidate == NO_CARD {
                            break;
                        }
                    }
                }
            }
        }
        Self {
            best,
            required: ids
                .iter()
                .copied()
                .filter(|&id| owners[id as usize] & UNUSED == 0)
                .collect(),
        }
    }

    fn candidates(&self, owners: &[u8]) -> LocalCandidates {
        let mut result = LocalCandidates {
            ids: [[[NO_CARD; 8]; 2]; 3],
            lengths: [[0; 2]; 3],
        };
        for slot in 0..3 {
            for role in 0..2 {
                for &id in self.best[slot][role].iter().chain(&self.required) {
                    let length = usize::from(result.lengths[slot][role]);
                    if id == NO_CARD
                        || owners[id as usize] & (1 << slot) == 0
                        || result.ids[slot][role][..length].contains(&id)
                    {
                        continue;
                    }
                    result.ids[slot][role][length] = id;
                    result.lengths[slot][role] += 1;
                }
            }
        }
        result
    }

    #[cfg(test)]
    fn choice(
        &self,
        pattern: [usize; 3],
        owners: &[u8],
        weights: &JointWeights,
        forced: Option<(u32, usize)>,
    ) -> LocalChoice {
        self.choice_with(pattern, owners, weights, &self.candidates(owners), forced)
    }

    fn choice_with(
        &self,
        pattern: [usize; 3],
        owners: &[u8],
        weights: &JointWeights,
        candidates: &LocalCandidates,
        forced: Option<(u32, usize)>,
    ) -> LocalChoice {
        if self.required.len() > pattern.iter().filter(|&&role| role != 0).count() {
            return LocalChoice::default();
        }
        let mut choices = [[NO_CARD; 8]; 3];
        let mut lengths = [1; 3];
        for slot in 0..3 {
            if let Some((id, owner)) = forced
                && owner == slot
            {
                if pattern[slot] == 0 || owners[id as usize] & (1 << slot) == 0 {
                    return LocalChoice::default();
                }
                choices[slot][0] = id;
                continue;
            }
            if pattern[slot] == 0 {
                continue;
            }
            lengths[slot] = 0;
            let role = pattern[slot] - 1;
            for &id in &candidates.ids[slot][role][..usize::from(candidates.lengths[slot][role])] {
                if forced.is_some_and(|(fixed, _)| fixed == id) {
                    continue;
                }
                choices[slot][lengths[slot]] = id;
                lengths[slot] += 1;
            }
        }
        let mut best = LocalChoice::default();
        for &zero in &choices[0][..lengths[0]] {
            for &one in &choices[1][..lengths[1]] {
                if zero != NO_CARD && zero == one {
                    continue;
                }
                for &two in &choices[2][..lengths[2]] {
                    if two != NO_CARD && (two == zero || two == one) {
                        continue;
                    }
                    let cards = [zero, one, two];
                    if self.required.iter().any(|id| !cards.contains(id)) {
                        continue;
                    }
                    let mut score = 0.0;
                    for slot in 0..3 {
                        if cards[slot] != NO_CARD {
                            score = sum_up(
                                score,
                                weights.cards[cards[slot] as usize][slot][pattern[slot] - 1],
                            );
                        }
                    }
                    if score > best.score || (score == best.score && cards < best.cards) {
                        best = LocalChoice { score, cards };
                    }
                }
            }
        }
        best
    }
}

fn poll(control: &mut SearchControl<'_>) -> Result<(), SearchIncompleteReasonV1> {
    match control.poll_stop() {
        None => Ok(()),
        Some(SearchStopReason::Cancelled) => Err(SearchIncompleteReasonV1::Cancelled),
        Some(SearchStopReason::TimedOut) => Err(SearchIncompleteReasonV1::TimedOut),
    }
}

/// Keep the numeric model and its working tables together. A child with the
/// same fixed members can restrict this model without changing its weights.
/// DFS ancestors keep their own snapshots; their capacity is budgeted too.
#[derive(Clone)]
struct JointWorking {
    weights: JointWeights,
    layout: Rc<CountLayout>,
    owners: Vec<u8>,
    residual_owners: Vec<u8>,
    local: Vec<LocalGroup>,
    choices: Vec<[LocalChoice; PATTERNS]>,
    tables: Vec<f64>,
    paths: Vec<u8>,
}

impl JointWorking {
    fn heap_bytes(&self) -> usize {
        self.weights.cards.capacity() * size_of::<[[f64; 2]; 3]>()
            + self
                .weights
                .fixed_members
                .iter()
                .map(|ids| ids.capacity() * size_of::<u32>())
                .sum::<usize>()
            + self.owners.capacity()
            + self.residual_owners.capacity()
            + self.local.capacity() * size_of::<LocalGroup>()
            + self
                .local
                .iter()
                .map(|group| group.required.capacity() * size_of::<u32>())
                .sum::<usize>()
            + self.choices.capacity() * size_of::<[LocalChoice; PATTERNS]>()
            + self.tables.capacity() * size_of::<f64>()
            + self.paths.capacity()
    }

    fn new(
        weights: JointWeights,
        groups: &[Vec<u32>],
        owners: &[u8],
        layout: Rc<CountLayout>,
    ) -> Result<Self, SearchIncompleteReasonV1> {
        let length = (groups.len() + 1) * layout.states;
        let mut tables = Vec::new();
        tables
            .try_reserve_exact(2 * length)
            .map_err(|_| SearchIncompleteReasonV1::MemoryExhausted)?;
        tables.resize(2 * length, f64::NEG_INFINITY);
        let mut paths = Vec::new();
        paths
            .try_reserve_exact(length)
            .map_err(|_| SearchIncompleteReasonV1::MemoryExhausted)?;
        paths.resize(length, u8::MAX);
        layout.initialize(&mut tables[..layout.states], weights.fixed_leaders);
        tables[length + groups.len() * layout.states] = 0.0;
        Ok(Self {
            weights,
            layout,
            tables,
            paths,
            owners: owners.to_vec(),
            residual_owners: owners.to_vec(),
            local: groups
                .iter()
                .map(|_| LocalGroup {
                    best: [[[NO_CARD; 4]; 2]; 3],
                    required: Vec::new(),
                })
                .collect(),
            choices: vec![[LocalChoice::default(); PATTERNS]; groups.len()],
        })
    }

    fn restrict(&mut self, groups: &[Vec<u32>], owners: &[u8]) {
        self.owners.copy_from_slice(owners);
        self.residual_owners.copy_from_slice(owners);
        let complete = (0..3)
            .filter(|&slot| self.weights.fixed_members[slot].len() == 5)
            .fold(0_u8, |mask, slot| mask | (1 << slot));
        for ids in groups {
            let occupied = (0..3)
                .filter(|&slot| {
                    self.weights.fixed_members[slot]
                        .iter()
                        .any(|id| ids.contains(id))
                })
                .fold(complete, |mask, slot| mask | (1 << slot));
            for &id in ids {
                self.residual_owners[id as usize] &= !occupied;
            }
        }
        for &id in self.weights.fixed_members.iter().flatten() {
            self.residual_owners[id as usize] = UNUSED;
        }
    }
}

impl JointLayoutCache {
    pub(crate) fn calculate(
        &mut self,
        engine: &FastUpperBoundEngine<'_>,
        groups: &[Vec<u32>],
        restrictions: (&[u8], [Option<f64>; 3]),
        previous: Option<&JointUpper>,
        prune_below: Option<f64>,
        control: &mut SearchControl<'_>,
    ) -> Result<Option<JointUpper>, SearchIncompleteReasonV1> {
        let (owners, fixed_scores) = restrictions;
        #[cfg(test)]
        let _timing = crate::profiling::enter(crate::profiling::Phase::JointBounds);
        poll(control)?;
        if owners.contains(&0) {
            return Ok(Some(JointUpper::infeasible()));
        }
        let previous = previous.filter(|bound| bound.can_update(owners, fixed_scores));
        #[cfg(test)]
        let _calculation_timing = crate::profiling::joint_timing(
            if previous.is_some() {
                crate::profiling::JointTiming::Incremental
            } else {
                crate::profiling::JointTiming::Fresh
            },
            0,
        );
        let weights = {
            #[cfg(test)]
            let _timing = crate::profiling::joint_timing(crate::profiling::JointTiming::Weights, 0);
            if previous.is_some() {
                None
            } else {
                match engine.joint_weights(owners, groups, fixed_scores) {
                    Ok(Some(weights)) => Some(weights),
                    Ok(None) => return Ok(Some(JointUpper::infeasible())),
                    Err(_) => return Ok(None),
                }
            }
        };
        calculate_weights(
            weights,
            groups,
            owners,
            previous,
            prune_below,
            self,
            control,
        )
        .map(Some)
    }
}

fn calculate_weights(
    weights: Option<JointWeights>,
    groups: &[Vec<u32>],
    owners: &[u8],
    previous: Option<&JointUpper>,
    prune_below: Option<f64>,
    layouts: &mut JointLayoutCache,
    control: &mut SearchControl<'_>,
) -> Result<JointUpper, SearchIncompleteReasonV1> {
    let old = previous.and_then(|bound| bound.working.as_ref());
    let mut working = match old {
        Some(old) => {
            #[cfg(test)]
            let _clone_timing = crate::profiling::joint_timing(
                crate::profiling::JointTiming::Clone,
                old.heap_bytes(),
            );
            old.clone()
        }
        None => {
            let weights = weights.unwrap();
            let remaining = std::array::from_fn(|slot| 5 - weights.fixed_members[slot].len());
            let layout = layouts.get(remaining);
            JointWorking::new(weights, groups, owners, layout)?
        }
    };
    let states = working.layout.states;
    let goal = states - 1;
    let length = (groups.len() + 1) * states;
    #[cfg(test)]
    crate::profiling::joint_model(states, old.is_some());
    let mut changed = None::<(usize, usize)>;
    {
        #[cfg(test)]
        let _timing =
            crate::profiling::joint_timing(crate::profiling::JointTiming::LocalChoices, 0);
        working.restrict(groups, owners);
        if working.residual_owners.contains(&0) {
            return Ok(JointUpper::infeasible());
        }
        for (group, ids) in groups.iter().enumerate() {
            poll(control)?;
            if old.is_some_and(|old| {
                ids.iter().all(|&id| {
                    old.residual_owners[id as usize] == working.residual_owners[id as usize]
                })
            }) {
                continue;
            }
            let local = LocalGroup::new(ids, &working.residual_owners, &working.weights);
            if local.required.len() > 3 {
                return Ok(JointUpper::infeasible());
            }
            let candidates = local.candidates(&working.residual_owners);
            let choices: [LocalChoice; PATTERNS] = std::array::from_fn(|pattern| {
                if working.layout.transitions[pattern].is_empty() {
                    LocalChoice::default()
                } else {
                    local.choice_with(
                        roles(pattern),
                        &working.residual_owners,
                        &working.weights,
                        &candidates,
                        None,
                    )
                }
            });
            if old.is_none()
                || choices
                    .iter()
                    .zip(&working.choices[group])
                    .any(|(now, before)| now.score != before.score)
            {
                changed = Some((changed.map_or(group, |range| range.0), group));
            }
            working.local[group] = local;
            working.choices[group] = choices;
        }
    }
    let (forward, backward) = working.tables.split_at_mut(length);
    {
        #[cfg(test)]
        let _timing = crate::profiling::joint_timing(crate::profiling::JointTiming::Forward, 0);
        if let Some((first, last)) = changed {
            for group in first..groups.len() {
                poll(control)?;
                #[cfg(test)]
                crate::profiling::joint_layer();
                let (prefix, rest) = forward.split_at_mut((group + 1) * states);
                let prefix = &prefix[group * states..];
                let next = &mut rest[..states];
                next.fill(f64::NEG_INFINITY);
                working.paths[(group + 1) * states..(group + 2) * states].fill(u8::MAX);
                for (pattern, edges) in working.layout.transitions.iter().enumerate() {
                    let choice = working.choices[group][pattern];
                    if choice.score == f64::NEG_INFINITY {
                        continue;
                    }
                    for &(from, to) in edges {
                        let from = usize::from(from);
                        let to = usize::from(to);
                        let prefix = prefix[from];
                        if prefix == f64::NEG_INFINITY {
                            continue;
                        }
                        let score = sum_up(prefix, choice.score);
                        if score > next[to] {
                            next[to] = score;
                            working.paths[(group + 1) * states + to] = pattern as u8;
                        }
                    }
                }
                if group >= last
                    && old.is_some_and(|old| {
                        next == &old.tables[(group + 1) * states..(group + 2) * states]
                    })
                {
                    break;
                }
            }
        }
    }
    let value = forward[groups.len() * states + goal];
    if value == f64::NEG_INFINITY {
        return Ok(JointUpper::infeasible());
    }
    let score = score_upper(value, working.weights.constant, working.weights.offset);
    if prune_below.is_some_and(|incumbent| score < incumbent) {
        #[cfg(test)]
        crate::profiling::joint_whole_cutoff();
        return Ok(JointUpper {
            score,
            destinations: Vec::new(),
            mode_uppers: Vec::new(),
            proposal: None,
            working: None,
        });
    }
    {
        #[cfg(test)]
        let _timing = crate::profiling::joint_timing(crate::profiling::JointTiming::Backward, 0);
        if let Some((first, last)) = changed {
            for group in (0..=last).rev() {
                poll(control)?;
                #[cfg(test)]
                crate::profiling::joint_layer();
                let (prefix, suffix) = backward.split_at_mut((group + 1) * states);
                let next = &mut prefix[group * states..];
                let suffix = &suffix[..states];
                next.fill(f64::NEG_INFINITY);
                for (pattern, edges) in working.layout.transitions.iter().enumerate() {
                    let choice = working.choices[group][pattern];
                    if choice.score == f64::NEG_INFINITY {
                        continue;
                    }
                    for &(from, to) in edges {
                        let from = usize::from(from);
                        let to = usize::from(to);
                        let suffix = suffix[from];
                        if suffix == f64::NEG_INFINITY {
                            continue;
                        }
                        next[to] = next[to].max(sum_up(suffix, choice.score));
                    }
                }
                if group <= first
                    && old.is_some_and(|old| {
                        next == &old.tables[length + group * states..length + (group + 1) * states]
                    })
                {
                    break;
                }
            }
        }
    }
    let proposal = {
        #[cfg(test)]
        let _timing = crate::profiling::joint_timing(crate::profiling::JointTiming::Proposal, 0);
        let mut proposal = [[0; 5]; 3];
        let mut counts = std::array::from_fn::<_, 3, _>(|slot| {
            let fixed = &working.weights.fixed_members[slot];
            proposal[slot][..fixed.len()].copy_from_slice(fixed);
            fixed.len()
        });
        let mut current = goal;
        for group in (0..groups.len()).rev() {
            let pattern = usize::from(working.paths[(group + 1) * states + current]);
            let choice = working.choices[group][pattern];
            for slot in 0..3 {
                if choice.cards[slot] != NO_CARD {
                    proposal[slot][counts[slot]] = choice.cards[slot];
                    counts[slot] += 1;
                }
            }
            current -= working.layout.destination(0, roles(pattern)).unwrap();
        }
        debug_assert_eq!(counts, [5; 3]);
        proposal
    };
    let mut destinations = previous.map_or_else(
        || vec![[f64::NEG_INFINITY; 4]; owners.len()],
        |bound| bound.destinations.clone(),
    );
    let mut mode_uppers = previous.map_or_else(
        || vec![[f64::NEG_INFINITY; 8]; groups.len()],
        |bound| bound.mode_uppers.clone(),
    );
    #[cfg(test)]
    let destination_timing =
        crate::profiling::joint_timing(crate::profiling::JointTiming::Destinations, 0);
    for (group, ids) in groups.iter().enumerate() {
        poll(control)?;
        if old.is_some_and(|old| {
            ids.iter()
                .all(|&id| old.residual_owners[id as usize] == working.residual_owners[id as usize])
                && forward[group * states..(group + 1) * states]
                    == old.tables[group * states..(group + 1) * states]
                && backward[(group + 1) * states..(group + 2) * states]
                    == old.tables[length + (group + 1) * states..length + (group + 2) * states]
        }) {
            continue;
        }
        let mut outside = [f64::NEG_INFINITY; PATTERNS];
        for (pattern, edges) in working.layout.transitions.iter().enumerate() {
            if working.choices[group][pattern].score == f64::NEG_INFINITY {
                continue;
            }
            for &(from, to) in edges {
                let from = usize::from(from);
                let to = usize::from(to);
                if forward[group * states + from] == f64::NEG_INFINITY
                    || backward[(group + 1) * states + goal - to] == f64::NEG_INFINITY
                {
                    continue;
                }
                outside[pattern] = outside[pattern].max(sum_up(
                    forward[group * states + from],
                    backward[(group + 1) * states + goal - to],
                ));
            }
        }
        let mut modes = [f64::NEG_INFINITY; 8];
        for (pattern, &outside) in outside.iter().enumerate() {
            let choice = working.choices[group][pattern];
            if outside == f64::NEG_INFINITY || choice.score == f64::NEG_INFINITY {
                continue;
            }
            let mode = roles(pattern)
                .into_iter()
                .enumerate()
                .fold(0, |mode, (slot, role)| {
                    mode | (usize::from(role != 0) << slot)
                });
            modes[mode] = modes[mode].max(sum_up(outside, choice.score));
        }
        for upper in &mut modes {
            *upper =
                score_upper(*upper, working.weights.constant, working.weights.offset).min(score);
        }
        mode_uppers[group] = modes;
        let candidates = working.local[group].candidates(&working.residual_owners);
        for &id in ids {
            destinations[id as usize] = [f64::NEG_INFINITY; 4];
            let mask = working.residual_owners[id as usize];
            if mask == UNUSED {
                destinations[id as usize][3] = score;
                continue;
            }
            let is_local_candidate = candidates.contains(id);
            for (owner, target) in destinations[id as usize].iter_mut().enumerate() {
                if mask & (1 << owner) == 0 {
                    continue;
                }
                let mut upper = f64::NEG_INFINITY;
                for (pattern, &outside) in outside.iter().enumerate() {
                    if outside == f64::NEG_INFINITY {
                        continue;
                    }
                    let pattern_roles = roles(pattern);
                    let best = working.choices[group][pattern];
                    let already_satisfies = if owner < 3 {
                        best.cards[owner] == id
                    } else {
                        !best.cards.contains(&id)
                    };
                    let conditional = if already_satisfies {
                        best.score
                    } else if owner < 3 && pattern_roles[owner] == 0 {
                        f64::NEG_INFINITY
                    } else if owner < 3 && !is_local_candidate {
                        // This card cannot occur in another slot's prepared
                        // candidates. Reuse the already-solved choice with its
                        // target slot absent, then add the forced contribution
                        // upward; this remains a bound regardless of sum order.
                        let place = [1, 3, 9][owner];
                        let without_owner = pattern - pattern_roles[owner] * place;
                        sum_up(
                            working.choices[group][without_owner].score,
                            working.weights.cards[id as usize][owner][pattern_roles[owner] - 1],
                        )
                    } else {
                        working.local[group]
                            .choice_with(
                                pattern_roles,
                                &working.residual_owners,
                                &working.weights,
                                &candidates,
                                Some((id, owner)),
                            )
                            .score
                    };
                    upper = upper.max(sum_up(outside, conditional));
                }
                *target =
                    score_upper(upper, working.weights.constant, working.weights.offset).min(score);
            }
        }
    }
    #[cfg(test)]
    drop(destination_timing);
    for (slot, fixed) in working.weights.fixed_members.iter().enumerate() {
        for &id in fixed {
            destinations[id as usize] = [f64::NEG_INFINITY; 4];
            destinations[id as usize][slot] = score;
        }
    }
    for (id, values) in destinations.iter_mut().enumerate() {
        for (owner, value) in values.iter_mut().enumerate() {
            *value = if owners[id] & (1 << owner) == 0 {
                f64::NEG_INFINITY
            } else {
                value.min(score)
            };
        }
    }
    Ok(JointUpper {
        score,
        destinations,
        mode_uppers,
        proposal: Some(proposal),
        working: Some(working),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn count_layouts_are_shared_by_remaining_counts() {
        let mut cache = JointLayoutCache::new();
        let mut pointers = Vec::new();
        for zero in 0..=5 {
            for one in 0..=5 {
                for two in 0..=5 {
                    let remaining = [zero, one, two];
                    let layout = cache.get(remaining);
                    assert_eq!(layout.remaining, remaining);
                    pointers.push((remaining, Rc::as_ptr(&layout)));
                }
            }
        }
        let bytes = cache.bytes();
        for (remaining, pointer) in pointers {
            assert_eq!(Rc::as_ptr(&cache.get(remaining)), pointer);
        }
        assert_eq!(cache.bytes(), bytes);
    }

    #[test]
    fn local_matching_keeps_every_forced_and_unused_destination() {
        // Linear allocation weights, not another game/chart fixture. Six cards
        // force the top-four matching shortcut to be checked against all cards.
        let weights = JointWeights {
            constant: 0.0,
            offset: 0.0,
            fixed_members: std::array::from_fn(|_| Vec::new()),
            fixed_leaders: [None; 3],
            fixed_scores: [None; 3],
            cards: (0..6)
                .map(|id| {
                    std::array::from_fn(|slot| {
                        std::array::from_fn(|role| {
                            ((id * 11 + slot * 7 + role * 13) % 19 + 1) as f64
                        })
                    })
                })
                .collect(),
        };
        for owners in [vec![ALL_OWNERS; 6], vec![3, 6, 15, 15, 1, 8]] {
            let local = LocalGroup::new(&[0, 1, 2, 3, 4, 5], &owners, &weights);
            for pattern in 0..PATTERNS {
                let pattern = roles(pattern);
                for forced in std::iter::once(None)
                    .chain((0..6).flat_map(|id| (0..4).map(move |owner| Some((id, owner)))))
                {
                    let actual = local.choice(pattern, &owners, &weights, forced);
                    let mut expected = f64::NEG_INFINITY;
                    for zero in 0..=6_u32 {
                        for one in 0..=6_u32 {
                            for two in 0..=6_u32 {
                                let cards =
                                    [zero, one, two].map(|id| if id == 6 { NO_CARD } else { id });
                                if (0..3).any(|slot| {
                                    (cards[slot] == NO_CARD) != (pattern[slot] == 0)
                                        || (cards[slot] != NO_CARD
                                            && owners[cards[slot] as usize] & (1 << slot) == 0)
                                }) {
                                    continue;
                                }
                                if (cards[0] != NO_CARD && cards[0] == cards[1])
                                    || (cards[2] != NO_CARD
                                        && (cards[2] == cards[0] || cards[2] == cards[1]))
                                {
                                    continue;
                                }
                                if local.required.iter().any(|id| !cards.contains(id)) {
                                    continue;
                                }
                                if forced.is_some_and(|(id, owner)| {
                                    if owner == 3 {
                                        cards.contains(&id)
                                    } else {
                                        cards[owner] != id
                                    }
                                }) {
                                    continue;
                                }
                                let score = (0..3).filter(|&slot| cards[slot] != NO_CARD).fold(
                                    0.0,
                                    |sum, slot| {
                                        sum_up(
                                            sum,
                                            weights.cards[cards[slot] as usize][slot]
                                                [pattern[slot] - 1],
                                        )
                                    },
                                );
                                expected = expected.max(score);
                            }
                        }
                    }
                    assert_eq!(
                        actual.score, expected,
                        "pattern={pattern:?}, forced={forced:?}, owners={owners:?}"
                    );
                }
            }
        }
    }

    #[test]
    fn unlisted_forced_card_reuses_the_absent_slot_upper() {
        let weights = JointWeights {
            constant: 0.0,
            offset: 0.0,
            fixed_members: std::array::from_fn(|_| Vec::new()),
            fixed_leaders: [None; 3],
            fixed_scores: [None; 3],
            cards: (0..6)
                .map(|id| std::array::from_fn(|slot| [id as f64 + slot as f64, id as f64 + 9.0]))
                .collect(),
        };
        let owners = vec![ALL_OWNERS; 6];
        let local = LocalGroup::new(&[0, 1, 2, 3, 4, 5], &owners, &weights);
        let candidates = local.candidates(&owners);
        for id in [0, 1] {
            assert!(!candidates.contains(id));
            for pattern in 0..PATTERNS {
                let pattern_roles = roles(pattern);
                for owner in 0..3 {
                    if pattern_roles[owner] == 0 {
                        continue;
                    }
                    let without_owner = pattern - pattern_roles[owner] * [1, 3, 9][owner];
                    let upper = sum_up(
                        local
                            .choice_with(roles(without_owner), &owners, &weights, &candidates, None)
                            .score,
                        weights.cards[id as usize][owner][pattern_roles[owner] - 1],
                    );
                    let slot_cards = std::array::from_fn::<_, 3, _>(|slot| {
                        if pattern_roles[slot] == 0 {
                            vec![NO_CARD]
                        } else if slot == owner {
                            vec![id]
                        } else {
                            (0..6).collect()
                        }
                    });
                    let mut exact_sum = f64::NEG_INFINITY;
                    for &first in &slot_cards[0] {
                        for &second in &slot_cards[1] {
                            for &third in &slot_cards[2] {
                                let selected = [first, second, third];
                                if selected.iter().enumerate().any(|(slot, &card)| {
                                    card != NO_CARD && selected[..slot].contains(&card)
                                }) {
                                    continue;
                                }
                                exact_sum = exact_sum.max(
                                    selected
                                        .iter()
                                        .enumerate()
                                        .filter(|(_, card)| **card != NO_CARD)
                                        .map(|(slot, card)| {
                                            weights.cards[*card as usize][slot]
                                                [pattern_roles[slot] - 1]
                                        })
                                        .sum(),
                                );
                            }
                        }
                    }
                    assert!(
                        upper >= exact_sum,
                        "id={id} pattern={pattern_roles:?} owner={owner} upper={upper} exact={exact_sum}",
                    );
                }
            }
        }
    }

    #[test]
    fn forward_backward_bounds_cover_every_tiny_joint_assignment() {
        let groups = (0..5)
            .map(|character| (character * 3..character * 3 + 3).collect::<Vec<u32>>())
            .collect::<Vec<_>>();
        let weights = JointWeights {
            constant: 17.0,
            offset: 5.0,
            fixed_members: std::array::from_fn(|_| Vec::new()),
            fixed_leaders: [None; 3],
            fixed_scores: [None; 3],
            cards: (0..15)
                .map(|id| {
                    std::array::from_fn(|slot| {
                        let regular = (3 + (id * 17 + slot * 5) % 29) as f64;
                        [regular, regular + (1 + (id + slot * 3) % 11) as f64]
                    })
                })
                .collect(),
        };
        let orders = [
            [0, 1, 2],
            [0, 2, 1],
            [1, 0, 2],
            [1, 2, 0],
            [2, 0, 1],
            [2, 1, 0],
        ];
        let mut layouts = JointLayoutCache::new();
        for owners in [
            vec![ALL_OWNERS; 15],
            vec![1, 15, 15, 15, 6, 15, 15, 15, 13, 7, 15, 15, 15, 15, 15],
            vec![1, 2, 4, 1, 2, 4, 15, 2, 4, 15, 15, 4, 15, 15, 15],
            vec![1, 2, 15, 1, 2, 15, 1, 2, 15, 1, 2, 15, 1, 2, 15],
            vec![1, 2, 4, 1, 2, 4, 1, 2, 4, 1, 2, 4, 1, 2, 4],
        ] {
            // Fold the same original linear objective into constants and a
            // fixed-leader option. The exhaustive oracle below stays unchanged.
            let mut remaining_weights = weights.clone();
            for slot in 0..3 {
                let fixed = &mut remaining_weights.fixed_members[slot];
                *fixed = owners
                    .iter()
                    .enumerate()
                    .filter_map(|(id, &mask)| (mask == 1 << slot).then_some(id as u32))
                    .collect();
                let mut leader = 0.0_f64;
                for &id in fixed.iter() {
                    let [regular, with_leader] = weights.cards[id as usize][slot];
                    remaining_weights.constant += regular;
                    leader = leader.max(with_leader - regular);
                }
                if fixed.len() == 5 {
                    remaining_weights.constant += leader;
                } else if !fixed.is_empty() {
                    remaining_weights.fixed_leaders[slot] = Some(leader);
                }
            }
            let mut never_stop = || None;
            let mut control = SearchControl::new(1024 * 1024, &mut never_stop);
            let result = calculate_weights(
                Some(remaining_weights.clone()),
                &groups,
                &owners,
                None,
                None,
                &mut layouts,
                &mut control,
            )
            .unwrap();
            if owners.iter().all(|&mask| mask == ALL_OWNERS) {
                let equal = calculate_weights(
                    Some(remaining_weights.clone()),
                    &groups,
                    &owners,
                    None,
                    Some(result.score),
                    &mut layouts,
                    &mut control,
                )
                .unwrap();
                assert_eq!(equal.destinations.len(), owners.len());
                let cut = calculate_weights(
                    Some(remaining_weights.clone()),
                    &groups,
                    &owners,
                    None,
                    Some(f64::from_bits(result.score.to_bits() + 1)),
                    &mut layouts,
                    &mut control,
                )
                .unwrap();
                assert_eq!(cut.score, result.score);
                assert!(cut.destinations.is_empty());
                assert!(cut.proposal.is_none());
                assert!(cut.working.is_none());
            }
            let expected_states = remaining_weights
                .fixed_members
                .iter()
                .map(|ids| CountLayout::radix(5 - ids.len()))
                .product::<usize>();
            assert_eq!(
                result.working.as_ref().unwrap().layout.states,
                expected_states
            );
            if let Some(id) = owners.iter().position(|&mask| mask == ALL_OWNERS) {
                let mut restricted = owners.clone();
                restricted[id] &= !2;
                assert!(result.can_update(&restricted, [None; 3]));
                let mut newly_fixed = owners.clone();
                newly_fixed[id] = 1;
                assert!(!result.can_update(&newly_fixed, [None; 3]));
                let updated = calculate_weights(
                    None,
                    &groups,
                    &restricted,
                    Some(&result),
                    None,
                    &mut layouts,
                    &mut control,
                )
                .unwrap();
                let fresh = calculate_weights(
                    Some(remaining_weights.clone()),
                    &groups,
                    &restricted,
                    None,
                    None,
                    &mut layouts,
                    &mut control,
                )
                .unwrap();
                assert_eq!(updated.score, fresh.score);
                assert_eq!(updated.destinations, fresh.destinations);
                assert_eq!(updated.mode_uppers, fresh.mode_uppers);
                assert_eq!(updated.proposal, fresh.proposal);
            }
            let mut expected = f64::NEG_INFINITY;
            let mut conditional = [[f64::NEG_INFINITY; 4]; 15];
            let mut conditional_modes = [[f64::NEG_INFINITY; 8]; 5];
            for mut combination in 0..6_usize.pow(5) {
                let assignment = std::array::from_fn::<_, 5, _>(|character| {
                    let order = orders[combination % 6];
                    combination /= 6;
                    order.map(|variant| character * 3 + variant)
                });
                if assignment
                    .iter()
                    .any(|cards| (0..3).any(|slot| owners[cards[slot]] & (1 << slot) == 0))
                {
                    continue;
                }
                let mut score = weights.constant - weights.offset;
                for slot in 0..3 {
                    let mut leader = 0.0_f64;
                    for cards in assignment {
                        let value = weights.cards[cards[slot]][slot];
                        score += value[0];
                        leader = leader.max(value[1] - value[0]);
                    }
                    score += leader;
                }
                expected = expected.max(score);
                for cards in assignment {
                    for slot in 0..3 {
                        conditional[cards[slot]][slot] = conditional[cards[slot]][slot].max(score);
                    }
                }
                for (group, ids) in groups.iter().enumerate() {
                    let mode = (0..3).fold(0, |mode, slot| {
                        mode | (usize::from(
                            !remaining_weights.fixed_members[slot]
                                .iter()
                                .any(|id| ids.contains(id)),
                        ) << slot)
                    });
                    conditional_modes[group][mode] = conditional_modes[group][mode].max(score);
                }
            }
            assert!(result.score >= expected && result.score < expected + 1e-8);
            for (id, values) in conditional.iter().enumerate() {
                for (owner, &value) in values.iter().enumerate() {
                    let upper = result.destinations[id][owner];
                    if value == f64::NEG_INFINITY {
                        assert_eq!(upper, value);
                    } else {
                        assert!(
                            upper >= value && upper < value + 1e-8,
                            "card={id}, owner={owner}"
                        );
                    }
                }
            }
            for (group, modes) in conditional_modes.iter().enumerate() {
                for (mode, &value) in modes.iter().enumerate() {
                    if value != f64::NEG_INFINITY {
                        assert!(result.mode_uppers[group][mode] >= value);
                    }
                }
            }
        }
    }

    #[test]
    fn occupancy_mode_bounds_cover_optional_character_use() {
        let groups = (0..6)
            .map(|character| (character * 3..character * 3 + 3).collect::<Vec<u32>>())
            .collect::<Vec<_>>();
        let weights = JointWeights {
            constant: 17.0,
            offset: 5.0,
            fixed_members: [vec![0, 3, 6, 9], vec![1, 4, 7, 12], vec![2, 5, 10, 13]],
            fixed_leaders: [Some(0.0); 3],
            fixed_scores: [None; 3],
            cards: (0..18)
                .map(|id| {
                    std::array::from_fn(|slot| {
                        let regular = (3 + (id * 17 + slot * 5) % 29) as f64;
                        [regular, regular + (1 + (id + slot * 3) % 11) as f64]
                    })
                })
                .collect(),
        };
        let owners = vec![ALL_OWNERS; 18];
        let mut layouts = JointLayoutCache::new();
        let mut never_stop = || None;
        let mut control = SearchControl::new(1024 * 1024, &mut never_stop);
        let result = calculate_weights(
            Some(weights.clone()),
            &groups,
            &owners,
            None,
            None,
            &mut layouts,
            &mut control,
        )
        .unwrap();
        let residual = &result.working.as_ref().unwrap().residual_owners;
        let mut expected = [[f64::NEG_INFINITY; 8]; 6];
        for first in 0..18 {
            for second in 0..18 {
                for third in 0..18 {
                    let selected = [first, second, third];
                    if selected[0] == selected[1]
                        || selected[0] == selected[2]
                        || selected[1] == selected[2]
                        || (0..3).any(|slot| residual[selected[slot]] & (1 << slot) == 0)
                    {
                        continue;
                    }
                    let score = weights.constant - weights.offset
                        + (0..3)
                            .map(|slot| weights.cards[selected[slot]][slot][1])
                            .sum::<f64>();
                    for (group, modes) in expected.iter_mut().enumerate() {
                        let mode = (0..3).fold(0, |mode, slot| {
                            mode | (usize::from(selected[slot] / 3 == group) << slot)
                        });
                        modes[mode] = modes[mode].max(score);
                    }
                }
            }
        }
        assert!(expected[5].iter().all(|upper| upper.is_finite()));
        for (group, modes) in expected.iter().enumerate() {
            for (mode, &value) in modes.iter().enumerate() {
                if value != f64::NEG_INFINITY {
                    assert!(result.mode_uppers[group][mode] >= value);
                }
            }
        }
    }
}
