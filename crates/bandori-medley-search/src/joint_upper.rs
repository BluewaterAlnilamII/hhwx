//! Joint allocation bound and cost-based removal of card destinations.
//!
//! Each character supplies at most one distinct physical card to each team.
//! Forward/backward tables join a local choice to every compatible outside
//! allocation, so all four destinations are bounded without re-running the DP.

use std::mem::size_of;

use crate::fast_upper::{FastUpperBoundEngine, add_up, mul_up, rounding_factor};
use crate::{SearchControl, SearchIncompleteReasonV1, SearchStopReason};

pub(crate) const UNUSED: u8 = 8;
pub(crate) const ALL_OWNERS: u8 = 15;
const STATES: usize = 1000;
const GOAL: usize = STATES - 1;
const PATTERNS: usize = 27;
const NO_CARD: u32 = u32::MAX;

pub(crate) struct JointWeights {
    pub(crate) cards: Vec<[[f64; 2]; 3]>,
    pub(crate) constant: f64,
}

pub(crate) struct JointUpper {
    pub(crate) score: f64,
    pub(crate) destinations: Vec<[f64; 4]>,
    pub(crate) proposal: Option<[[u32; 5]; 3]>,
}

impl JointUpper {
    pub(crate) fn bytes(&self) -> usize {
        size_of::<Self>() + self.destinations.capacity() * size_of::<[f64; 4]>()
    }

    fn infeasible() -> Self {
        Self {
            score: f64::NEG_INFINITY,
            destinations: Vec::new(),
            proposal: None,
        }
    }
}

#[derive(Clone, Copy)]
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

// A team digit is regular_count + 5*leader_count (0..4 and 0..1).
// This removes unreachable states from the loose 6³*2³ formulation.
fn destination(mut state: usize, roles: [usize; 3]) -> Option<usize> {
    let mut result = 0;
    let mut place = 1;
    for role in roles {
        let digit = state % 10;
        state /= 10;
        let delta = match role {
            0 => 0,
            1 if digit % 5 < 4 => 1,
            2 if digit < 5 => 5,
            _ => return None,
        };
        result += (digit + delta) * place;
        place *= 10;
    }
    Some(result)
}

fn sum_up(left: f64, right: f64) -> f64 {
    if left == f64::NEG_INFINITY || right == f64::NEG_INFINITY {
        f64::NEG_INFINITY
    } else {
        add_up(left, right).unwrap_or(f64::INFINITY)
    }
}

fn score_upper(value: f64, constant: f64) -> f64 {
    if value == f64::NEG_INFINITY {
        return value;
    }
    // At most four rounded operations per positive contribution: integer->f64,
    // division by five, and the two canonical song additions. Negative actual
    // song scores can be replaced by zero by monotonicity before this envelope.
    add_up(value, constant)
        .and_then(|sum| mul_up(sum, rounding_factor(4)?))
        .unwrap_or(f64::INFINITY)
}

/// Only three roles can consume cards of one character. Their four best cards
/// suffice even when one card is forbidden: at most two other roles and that
/// exclusion can occupy better alternatives. Required/forced cards are added
/// explicitly; this is a local matching proof, not a roster candidate cap.
struct LocalGroup {
    best: [[[u32; 4]; 2]; 3],
    required: Vec<u32>,
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

    fn choice(
        &self,
        pattern: [usize; 3],
        owners: &[u8],
        weights: &JointWeights,
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
            for &id in self.best[slot][pattern[slot] - 1]
                .iter()
                .chain(&self.required)
            {
                if id == NO_CARD
                    || owners[id as usize] & (1 << slot) == 0
                    || forced.is_some_and(|(fixed, _)| fixed == id)
                    || choices[slot][..lengths[slot]].contains(&id)
                {
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

/// Required temporary capacity, including model-building scratch and the
/// retained destination table. The score cache and ancestor bounds are outside
/// this amount and must be deducted by the caller before allocation.
pub(crate) fn workspace_bytes(cards: usize, groups: usize) -> Option<usize> {
    let layers = groups.checked_add(1)?.checked_mul(STATES)?;
    // Forward/backward f64 scores and one u8 predecessor pattern per forward state.
    layers
        .checked_mul(17)?
        .checked_add(cards.checked_mul(160)?)?
        .checked_add(groups.checked_mul(
            PATTERNS * size_of::<LocalChoice>() + size_of::<LocalGroup>() + size_of::<Vec<u32>>(),
        )?)?
        .checked_add(STATES * PATTERNS * size_of::<(usize, usize)>())?
        .checked_add(2 * size_of::<JointUpper>() + 4096)
}

pub(crate) fn calculate(
    engine: &FastUpperBoundEngine<'_>,
    groups: &[Vec<u32>],
    owners: &[u8],
    control: &mut SearchControl<'_>,
) -> Result<Option<JointUpper>, SearchIncompleteReasonV1> {
    #[cfg(test)]
    let _timing = crate::profiling::enter(crate::profiling::Phase::JointBounds);
    poll(control)?;
    if owners.contains(&0) {
        return Ok(Some(JointUpper::infeasible()));
    }
    let weights = match engine.joint_weights(owners, groups) {
        Ok(Some(weights)) => weights,
        Ok(None) => return Ok(Some(JointUpper::infeasible())),
        Err(_) => return Ok(None),
    };
    calculate_weights(&weights, groups, owners, control).map(Some)
}

fn calculate_weights(
    weights: &JointWeights,
    groups: &[Vec<u32>],
    owners: &[u8],
    control: &mut SearchControl<'_>,
) -> Result<JointUpper, SearchIncompleteReasonV1> {
    let transitions: [Vec<(usize, usize)>; PATTERNS] = std::array::from_fn(|pattern| {
        let pattern = roles(pattern);
        let mut edges = Vec::with_capacity(STATES);
        for from in 0..STATES {
            if let Some(to) = destination(from, pattern) {
                edges.push((from, to));
            }
        }
        edges
    });
    let local = groups
        .iter()
        .map(|ids| LocalGroup::new(ids, owners, weights))
        .collect::<Vec<_>>();
    let mut choices = Vec::<[LocalChoice; PATTERNS]>::with_capacity(groups.len());
    for group in &local {
        poll(control)?;
        if group.required.len() > 3 {
            return Ok(JointUpper::infeasible());
        }
        choices.push(std::array::from_fn(|pattern| {
            group.choice(roles(pattern), owners, weights, None)
        }));
    }
    let length = (groups.len() + 1) * STATES;
    let mut tables = Vec::new();
    tables
        .try_reserve_exact(2 * length)
        .map_err(|_| SearchIncompleteReasonV1::MemoryExhausted)?;
    tables.resize(2 * length, f64::NEG_INFINITY);
    let (forward, backward) = tables.split_at_mut(length);
    let mut paths = Vec::new();
    paths
        .try_reserve_exact(length)
        .map_err(|_| SearchIncompleteReasonV1::MemoryExhausted)?;
    paths.resize(length, u8::MAX);
    forward[0] = 0.0;
    backward[groups.len() * STATES] = 0.0;
    for group in 0..groups.len() {
        poll(control)?;
        let (previous, rest) = forward.split_at_mut((group + 1) * STATES);
        let previous = &previous[group * STATES..];
        let next = &mut rest[..STATES];
        for (pattern, edges) in transitions.iter().enumerate() {
            let choice = choices[group][pattern];
            if choice.score == f64::NEG_INFINITY {
                continue;
            }
            for &(from, to) in edges {
                let score = sum_up(previous[from], choice.score);
                if score > next[to] {
                    next[to] = score;
                    paths[(group + 1) * STATES + to] = pattern as u8;
                }
            }
        }
    }
    let value = forward[groups.len() * STATES + GOAL];
    if value == f64::NEG_INFINITY {
        return Ok(JointUpper::infeasible());
    }
    for group in (0..groups.len()).rev() {
        poll(control)?;
        let (previous, suffix) = backward.split_at_mut((group + 1) * STATES);
        let next = &mut previous[group * STATES..];
        let suffix = &suffix[..STATES];
        for (pattern, edges) in transitions.iter().enumerate() {
            let choice = choices[group][pattern];
            if choice.score == f64::NEG_INFINITY {
                continue;
            }
            for &(from, to) in edges {
                next[to] = next[to].max(sum_up(suffix[from], choice.score));
            }
        }
    }
    let mut proposal = [[0; 5]; 3];
    let mut counts = [0; 3];
    let mut current = GOAL;
    for group in (0..groups.len()).rev() {
        let pattern = usize::from(paths[(group + 1) * STATES + current]);
        let choice = choices[group][pattern];
        for slot in 0..3 {
            if choice.cards[slot] != NO_CARD {
                proposal[slot][counts[slot]] = choice.cards[slot];
                counts[slot] += 1;
            }
        }
        current -= destination(0, roles(pattern)).unwrap();
    }
    let score = score_upper(value, weights.constant);
    let mut destinations = vec![[f64::NEG_INFINITY; 4]; owners.len()];
    for (group, ids) in groups.iter().enumerate() {
        poll(control)?;
        let mut outside = [f64::NEG_INFINITY; PATTERNS];
        for (pattern, edges) in transitions.iter().enumerate() {
            if choices[group][pattern].score == f64::NEG_INFINITY {
                continue;
            }
            for &(from, to) in edges {
                outside[pattern] = outside[pattern].max(sum_up(
                    forward[group * STATES + from],
                    backward[(group + 1) * STATES + GOAL - to],
                ));
            }
        }
        for &id in ids {
            for (owner, target) in destinations[id as usize].iter_mut().enumerate() {
                if owners[id as usize] & (1 << owner) == 0 {
                    continue;
                }
                let mut upper = f64::NEG_INFINITY;
                for pattern in 0..PATTERNS {
                    if outside[pattern] == f64::NEG_INFINITY {
                        continue;
                    }
                    let best = choices[group][pattern];
                    let already_satisfies = if owner < 3 {
                        best.cards[owner] == id
                    } else {
                        !best.cards.contains(&id)
                    };
                    let conditional = if already_satisfies {
                        best
                    } else {
                        local[group].choice(roles(pattern), owners, weights, Some((id, owner)))
                    };
                    upper = upper.max(sum_up(outside[pattern], conditional.score));
                }
                *target = score_upper(upper, weights.constant).min(score);
            }
        }
    }
    Ok(JointUpper {
        score,
        destinations,
        proposal: Some(proposal),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_matching_keeps_every_forced_and_unused_destination() {
        // Linear allocation weights, not another game/chart fixture. Six cards
        // force the top-four matching shortcut to be checked against all cards.
        let weights = JointWeights {
            constant: 0.0,
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
    fn forward_backward_bounds_cover_every_tiny_joint_assignment() {
        let groups = (0..5)
            .map(|character| (character * 3..character * 3 + 3).collect::<Vec<u32>>())
            .collect::<Vec<_>>();
        let weights = JointWeights {
            constant: 17.0,
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
        for owners in [
            vec![ALL_OWNERS; 15],
            vec![1, 15, 15, 15, 6, 15, 15, 15, 13, 7, 15, 15, 15, 15, 15],
        ] {
            let mut never_stop = || None;
            let mut control = SearchControl::new(1024 * 1024, &mut never_stop);
            let result = calculate_weights(&weights, &groups, &owners, &mut control).unwrap();
            let mut expected = f64::NEG_INFINITY;
            let mut conditional = [[f64::NEG_INFINITY; 4]; 15];
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
                let mut score = weights.constant;
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
        }
    }
}
