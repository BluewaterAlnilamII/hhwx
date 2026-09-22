//! Single-song order policies over the shared integer window scorer.
use std::sync::OnceLock;

use bandori_medley_model::{ResolvedScoreSkillV1, SkillBehaviorV1};
use serde::{Deserialize, Serialize};

use crate::exact_score::{ExactScoreFailure, PreparedSong, visit_skill_orders};

pub(crate) const SKILL_WAIT_SECONDS: f64 = 0.75;

fn permutations() -> &'static Vec<[usize; 5]> {
    static ALL: OnceLock<Vec<[usize; 5]>> = OnceLock::new();
    ALL.get_or_init(|| {
        let mut all = Vec::with_capacity(120);
        visit_skill_orders(0, &mut [0; 5], &mut [false; 5], &mut |o| all.push(o));
        all
    })
}

fn order_index(order: [usize; 5]) -> usize {
    (0..5)
        .map(|i| order[i + 1..].iter().filter(|&&j| j < order[i]).count() * [24, 6, 2, 1, 1][i])
        .sum()
}

fn formation_orders() -> &'static Vec<Vec<usize>> {
    static MAP: OnceLock<Vec<Vec<usize>>> = OnceLock::new();
    MAP.get_or_init(|| {
        permutations()
            .iter()
            .map(|formation| {
                orders()
                    .iter()
                    .map(|(order, _)| order_index(order.map(|i| formation[i])))
                    .collect()
            })
            .collect()
    })
}

pub(crate) const ORDER_WEIGHTS: [[i128; 5]; 5] = [
    [192, 291, 144, 141, 256],
    [192, 243, 176, 157, 256],
    [192, 198, 200, 178, 256],
    [192, 156, 216, 204, 256],
    [256, 136, 288, 344, 0],
];

pub(crate) fn orders() -> &'static Vec<([usize; 5], u16)> {
    static ORDERS: OnceLock<Vec<([usize; 5], u16)>> = OnceLock::new();
    ORDERS.get_or_init(|| {
        let mut counts = std::collections::BTreeMap::new();
        for path in 0..1024 {
            let mut list = vec![0, 1, 2, 3, 4];
            for i in 0..5 {
                let value = list.remove(i);
                list.insert((path >> (2 * i)) & 3, value);
            }
            *counts
                .entry(list.try_into().expect("five positions"))
                .or_insert(0) += 1;
        }
        counts.into_iter().collect()
    })
}

pub(crate) fn max_skill_percent(skill: ResolvedScoreSkillV1) -> f64 {
    match skill.behavior {
        SkillBehaviorV1::Neutral => 0.0,
        SkillBehaviorV1::Score { score_up_percent } => {
            score_up_percent
                + if skill.is_rate_up_with_perfect {
                    50.0
                } else {
                    0.0
                }
        }
        SkillBehaviorV1::ScoreOnPerfect { score_up_percent }
        | SkillBehaviorV1::PerfectOnly { score_up_percent }
        | SkillBehaviorV1::GreatOrWorseHalf { score_up_percent } => score_up_percent,
        SkillBehaviorV1::ContinuedPerfect {
            active_score_up_percent,
            fallback_score_up_percent,
        } => active_score_up_percent.max(fallback_score_up_percent),
    }
}

pub(crate) fn assignment(
    matrix: [[i128; 5]; 5],
    eligible: [bool; 5],
) -> Option<([usize; 5], i128)> {
    let mut dp = [None; 32];
    dp[0] = Some(([0; 5], 0_i128));
    for mask in 0_usize..31 {
        let Some((order, score)) = dp[mask] else {
            continue;
        };
        let position = mask.count_ones() as usize;
        for card in 0..5 {
            if mask & (1 << card) != 0 || (position == 2 && !eligible[card]) {
                continue;
            }
            let mut next_order = order;
            next_order[position] = card;
            let next_score = score + matrix[position][card];
            let next = &mut dp[mask | (1 << card)];
            if next.is_none_or(|(current, value)| {
                next_score > value || (next_score == value && next_order < current)
            }) {
                *next = Some((next_order, next_score));
            }
        }
    }
    dp[31]
}

#[derive(Clone, Debug)]
pub(crate) struct SingleScore {
    pub(crate) formation: [usize; 5],
    pub(crate) player_formation: Option<[usize; 5]>,
    pub(crate) average: f64,
    pub(crate) room_rate: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SingleScoreDetailsV1 {
    pub minimum_score: f64,
    pub maximum_score: f64,
    pub peak_member_instance_ids: [u32; 5],
    /// Room positions contain actor identities: self=0, external players=1..4.
    pub peak_player_formation: Option<[usize; 5]>,
    /// Member instance IDs in solo; room actor indexes (self=0) in cooperative mode.
    pub peak_activation_order: [u32; 5],
    pub peak_average_score: f64,
    pub maximum_probability_numerator: u16,
    pub maximum_probability_denominator: u16,
    /// Probability of this same maximum in the selected search-result formation.
    pub current_maximum_probability_numerator: u16,
}

impl SingleScoreDetailsV1 {
    pub(crate) fn merge(&mut self, candidate: Self) {
        let minimum = self.minimum_score.min(candidate.minimum_score);
        // Only one formation/leader-power partition contains the selected formation.
        let current_probability = if candidate.maximum_score > self.maximum_score {
            candidate.current_maximum_probability_numerator
        } else if candidate.maximum_score == self.maximum_score {
            self.current_maximum_probability_numerator
                + candidate.current_maximum_probability_numerator
        } else {
            self.current_maximum_probability_numerator
        };
        if candidate
            .maximum_score
            .total_cmp(&self.maximum_score)
            .then(
                candidate
                    .maximum_probability_numerator
                    .cmp(&self.maximum_probability_numerator),
            )
            .then_with(|| {
                candidate
                    .peak_average_score
                    .total_cmp(&self.peak_average_score)
            })
            .then_with(|| {
                self.peak_member_instance_ids
                    .cmp(&candidate.peak_member_instance_ids)
            })
            .then_with(|| {
                self.peak_player_formation
                    .cmp(&candidate.peak_player_formation)
            })
            .is_gt()
        {
            *self = candidate;
        }
        self.minimum_score = minimum;
        self.current_maximum_probability_numerator = current_probability;
    }
}

type RoomRates = (f64, [[f64; 5]; 6], [[f64; 5]; 6]);

enum ScheduledScores {
    Encore {
        extras: Box<[[i128; 5]; 5]>,
        rates: [[f64; 5]; 5],
    },
    Orders {
        totals: Box<[[i128; 120]; 5]>,
        room_rates: Box<[[f64; 120]; 5]>,
    },
}

pub(crate) struct SingleWindows {
    base: i128,
    own: [[i128; 5]; 6],
    other: Option<[[i128; 5]; 6]>,
    no_floor: Option<RoomRates>,
    eligible: [bool; 5],
    encore_actor: usize,
    scheduled: Option<ScheduledScores>,
}

impl SingleWindows {
    pub(crate) fn restrict_leaders(&mut self, allowed: [bool; 5]) -> bool {
        for (eligible, allowed) in self.eligible.iter_mut().zip(allowed) {
            *eligible &= allowed;
        }
        self.eligible.into_iter().any(|e| e)
    }
    pub(crate) fn new(
        song: &PreparedSong<'_>,
        skills: [ResolvedScoreSkillV1; 5],
        parameter: f64,
        other: Option<[ResolvedScoreSkillV1; 4]>,
        encore_actor: usize,
        minimum_skill: f64,
    ) -> Result<Self, ExactScoreFailure> {
        let times = song.trigger_times();
        let durations: Vec<_> = skills
            .iter()
            .chain(other.iter().flatten())
            .map(|s| s.duration_seconds)
            .collect();
        let longest = durations.iter().copied().fold(0.0, f64::max);
        let mut latest = times;
        for w in 1..6 {
            latest[w] = times[w].max((latest[w - 1] + longest) + SKILL_WAIT_SECONDS);
            if !latest[w].is_finite() {
                return Err(ExactScoreFailure::ArithmeticNonFinite);
            }
        }
        if latest == times {
            return Self::fixed(song, skills, parameter, other, encore_actor, minimum_skill);
        }
        if durations.iter().all(|&d| d == longest) {
            return Self::fixed(
                &song.with_activation_times(latest)?,
                skills,
                parameter,
                other,
                encore_actor,
                minimum_skill,
            );
        }
        let mut result = Self::fixed(song, skills, parameter, other, encore_actor, minimum_skill)?;
        let bases = song.base_scores(parameter)?;
        let all_skills: Vec<_> = skills
            .iter()
            .chain(other.iter().flatten())
            .copied()
            .collect();
        let mut cache = std::collections::HashMap::new();
        let mut extra = |actor: usize, slot: usize, start: f64| {
            let key = (actor, slot, start.to_bits());
            if let Some(value) = cache.get(&key) {
                return Ok(*value);
            }
            let value = song.single_window_extra(&bases, all_skills[actor], slot, start)?;
            cache.insert(key, value);
            Ok::<_, ExactScoreFailure>(value)
        };
        if latest[..5] == times[..5] {
            let mut extras = Box::new([[0; 5]; 5]);
            let mut rates = [[0.0; 5]; 5];
            for leader in 0..5 {
                let actors = if other.is_some() {
                    [leader, 5, 6, 7, 8]
                } else {
                    [0, 1, 2, 3, 4]
                };
                let encore = if other.is_some() {
                    actors[encore_actor]
                } else {
                    leader
                };
                for last in 0..5 {
                    let start = times[5].max(
                        (times[4] + all_skills[actors[last]].duration_seconds) + SKILL_WAIT_SECONDS,
                    );
                    (extras[leader][last], rates[leader][last]) = extra(encore, 5, start)?;
                }
            }
            result.scheduled = Some(ScheduledScores::Encore { extras, rates });
        } else {
            // Only genuinely order-dependent first-five timings need joint enumeration.
            let mut totals = Box::new([[0; 120]; 5]);
            let mut room_rates = Box::new([[0.0; 120]; 5]);
            for leader in 0..5 {
                if !result.eligible[leader] {
                    continue;
                }
                let actors = if other.is_some() {
                    [leader, 5, 6, 7, 8]
                } else {
                    [0, 1, 2, 3, 4]
                };
                let encore = if other.is_some() {
                    actors[encore_actor]
                } else {
                    leader
                };
                for (index, order) in permutations().iter().enumerate() {
                    let sequence = [
                        actors[order[0]],
                        actors[order[1]],
                        actors[order[2]],
                        actors[order[3]],
                        actors[order[4]],
                        encore,
                    ];
                    let mut start = times[0];
                    let mut score = result.base;
                    let mut rate = result.no_floor.as_ref().map_or(0.0, |r| r.0);
                    for w in 0..6 {
                        if w > 0 {
                            start = times[w].max(
                                (start + all_skills[sequence[w - 1]].duration_seconds)
                                    + SKILL_WAIT_SECONDS,
                            );
                        }
                        let value = extra(sequence[w], w, start)?;
                        score += value.0;
                        rate += value.1;
                    }
                    totals[leader][index] = score;
                    if !rate.is_finite() {
                        return Err(ExactScoreFailure::ArithmeticNonFinite);
                    }
                    room_rates[leader][index] = rate;
                }
            }
            result.scheduled = Some(ScheduledScores::Orders { totals, room_rates });
        }
        Ok(result)
    }

    fn fixed(
        song: &PreparedSong<'_>,
        skills: [ResolvedScoreSkillV1; 5],
        parameter: f64,
        other: Option<[ResolvedScoreSkillV1; 4]>,
        encore_actor: usize,
        minimum_skill: f64,
    ) -> Result<Self, ExactScoreFailure> {
        let (base, own) = song.contributions(skills, parameter)?;
        let (other, no_floor) = if let Some(other) = other {
            let actors = [skills[0], other[0], other[1], other[2], other[3]];
            let (_, extras) = song.contributions(actors, parameter)?;
            let (rate, self_rates) = song.no_floor_contributions(skills)?;
            let (_, other_rates) = song.no_floor_contributions(actors)?;
            (Some(extras), Some((rate, self_rates, other_rates)))
        } else {
            (None, None)
        };
        Ok(Self {
            base,
            own,
            other,
            no_floor,
            eligible: skills.map(|s| max_skill_percent(s) >= minimum_skill),
            encore_actor,
            scheduled: None,
        })
    }

    fn matrix(&self, leader: usize) -> [[i128; 5]; 5] {
        let windows = self.actor_windows(leader);
        std::array::from_fn(|p| {
            std::array::from_fn(|c| {
                (0..5)
                    .map(|w| ORDER_WEIGHTS[w][p] * windows[w][c])
                    .sum::<i128>()
                    + match &self.scheduled {
                        Some(ScheduledScores::Encore { extras, .. }) => {
                            ORDER_WEIGHTS[4][p] * extras[leader][c]
                        }
                        _ => {
                            if p == 2 {
                                1024 * windows[5][if self.other.is_some() {
                                    self.encore_actor
                                } else {
                                    c
                                }]
                            } else {
                                0
                            }
                        }
                    }
            })
        })
    }

    fn average(&self, formation: [usize; 5], player_formation: Option<[usize; 5]>) -> f64 {
        let actors = player_formation.unwrap_or(formation);
        if let Some(ScheduledScores::Orders { totals, .. }) = &self.scheduled {
            let scores = &totals[formation[2]];
            return formation_orders()[order_index(actors)]
                .iter()
                .zip(orders())
                .map(|(&index, &(_, weight))| scores[index] * i128::from(weight))
                .sum::<i128>() as f64
                / 1024.0;
        }
        let matrix = self.matrix(formation[2]);
        (1024 * self.base + (0..5).map(|p| matrix[p][actors[p]]).sum::<i128>()) as f64 / 1024.0
    }

    fn room_rate(&self, leader: usize, players: [usize; 5]) -> f64 {
        if let Some(ScheduledScores::Orders { room_rates, .. }) = &self.scheduled {
            return formation_orders()[order_index(players)]
                .iter()
                .zip(orders())
                .map(|(&index, &(_, weight))| room_rates[leader][index] * f64::from(weight))
                .sum::<f64>()
                / 1024.0;
        }
        let (base, own, other) = self.no_floor.as_ref().expect("cooperative rates");
        let mut rate = *base;
        for (w, weights) in ORDER_WEIGHTS.iter().enumerate() {
            for (position, &actor) in players.iter().enumerate() {
                let contribution = if actor == 0 {
                    own[w][leader]
                } else {
                    other[w][actor]
                };
                rate += contribution * weights[position] as f64 / 1024.0;
            }
        }
        rate += match &self.scheduled {
            Some(ScheduledScores::Encore { rates, .. }) => players
                .iter()
                .enumerate()
                .map(|(position, &actor)| {
                    rates[leader][actor] * ORDER_WEIGHTS[4][position] as f64 / 1024.0
                })
                .sum(),
            _ => {
                if self.encore_actor == 0 {
                    own[5][leader]
                } else {
                    other[5][self.encore_actor]
                }
            }
        };
        rate
    }

    fn actor_windows(&self, leader: usize) -> [[i128; 5]; 6] {
        self.other.map_or(self.own, |mut other| {
            for (w, row) in other.iter_mut().enumerate() {
                row[0] = self.own[w][leader];
            }
            other
        })
    }

    pub(crate) fn scores(&self) -> Vec<SingleScore> {
        if self.other.is_none() {
            let selected = match &self.scheduled {
                None => assignment(self.matrix(0), self.eligible).map(|(f, _)| f),
                Some(ScheduledScores::Encore { .. }) => (0..5)
                    .filter(|&l| self.eligible[l])
                    .filter_map(|l| {
                        assignment(self.matrix(l), std::array::from_fn(|c| c == l)).map(|(f, _)| f)
                    })
                    .min_by(|&a, &b| {
                        self.average(b, None)
                            .total_cmp(&self.average(a, None))
                            .then(a.cmp(&b))
                    }),
                Some(ScheduledScores::Orders { .. }) => permutations()
                    .iter()
                    .copied()
                    .filter(|f| self.eligible[f[2]])
                    .min_by(|&a, &b| {
                        self.average(b, None)
                            .total_cmp(&self.average(a, None))
                            .then(a.cmp(&b))
                    }),
            };
            return selected
                .map(|formation| SingleScore {
                    formation,
                    player_formation: None,
                    average: self.average(formation, None),
                    room_rate: None,
                })
                .into_iter()
                .collect();
        }
        (0..5)
            .filter(|&leader| self.eligible[leader])
            .flat_map(|leader| {
                let formation = centered(leader);
                permutations().iter().map(move |&players| SingleScore {
                    formation,
                    player_formation: Some(players),
                    average: self.average(formation, Some(players)),
                    room_rate: Some(self.room_rate(leader, players)),
                })
            })
            .collect()
    }

    pub(crate) fn details(
        &self,
        ids: [u32; 5],
        expected: [usize; 5],
        expected_players: Option<[usize; 5]>,
    ) -> SingleScoreDetailsV1 {
        let multi = self.other.is_some();
        let mut details = SingleScoreDetailsV1 {
            minimum_score: f64::INFINITY,
            maximum_score: f64::NEG_INFINITY,
            peak_member_instance_ids: [0; 5],
            peak_player_formation: None,
            peak_activation_order: [0; 5],
            peak_average_score: 0.0,
            maximum_probability_numerator: 0,
            maximum_probability_denominator: 1024,
            current_maximum_probability_numerator: 0,
        };
        for &formation in permutations() {
            if !self.eligible[formation[2]] || (multi && formation != centered(formation[2])) {
                continue;
            }
            let actor_formations = if multi {
                permutations().as_slice()
            } else {
                std::slice::from_ref(&formation)
            };
            for &actors in actor_formations {
                let player_formation = multi.then_some(actors);
                let windows = self.actor_windows(formation[2]);
                let mut maximum = i128::MIN;
                let mut minimum = i128::MAX;
                let mut count = 0;
                let mut best = [0; 5];
                let mut visit = |order: [usize; 5], weight: u16| {
                    let actual = order.map(|p| actors[p]);
                    let encore = if multi {
                        self.encore_actor
                    } else {
                        formation[2]
                    };
                    let score = match &self.scheduled {
                        Some(ScheduledScores::Orders { totals, .. }) => {
                            totals[formation[2]][order_index(actual)]
                        }
                        _ => {
                            self.base
                                + (0..5).map(|w| windows[w][actual[w]]).sum::<i128>()
                                + match &self.scheduled {
                                    Some(ScheduledScores::Encore { extras, .. }) => {
                                        extras[formation[2]][actual[4]]
                                    }
                                    _ => windows[5][encore],
                                }
                        }
                    };
                    minimum = minimum.min(score);
                    if score > maximum {
                        maximum = score;
                        count = weight;
                        best = actual;
                    } else if score == maximum {
                        count += weight;
                    }
                };
                for &(order, weight) in orders() {
                    visit(order, weight);
                }
                let is_current = formation == expected && player_formation == expected_players;
                details.merge(SingleScoreDetailsV1 {
                    minimum_score: if is_current {
                        minimum as f64
                    } else {
                        f64::INFINITY
                    },
                    maximum_score: maximum as f64,
                    peak_member_instance_ids: formation.map(|i| ids[i]),
                    peak_player_formation: player_formation,
                    peak_activation_order: if multi {
                        best.map(|i| i as u32)
                    } else {
                        best.map(|i| ids[i])
                    },
                    peak_average_score: self.average(formation, player_formation),
                    maximum_probability_numerator: count,
                    maximum_probability_denominator: 1024,
                    current_maximum_probability_numerator: if is_current { count } else { 0 },
                });
            }
        }
        details
    }
}

fn centered(leader: usize) -> [usize; 5] {
    let others: Vec<_> = (0..5).filter(|&i| i != leader).collect();
    [others[0], others[1], leader, others[2], others[3]]
}

#[cfg(test)]
mod tests {
    use super::*;
    use bandori_medley_model::{DifficultyV1, MedleySongV1, ScoringNoteV1};

    // Direct client choices and lexicographic permutation generation, independent
    // of the production order index, marginal table and assignment DP.
    fn reference_paths() -> Vec<[usize; 5]> {
        let mut lists = vec![vec![0, 1, 2, 3, 4]];
        for step in 0..5 {
            lists = lists
                .into_iter()
                .flat_map(|mut list| {
                    let actor = list.remove(step);
                    (0..4).map(move |position| {
                        let mut next = list.clone();
                        next.insert(position, actor);
                        next
                    })
                })
                .collect();
        }
        lists.into_iter().map(|v| v.try_into().unwrap()).collect()
    }

    fn reference_formations() -> Vec<[usize; 5]> {
        let mut all = Vec::new();
        for a in 0..5 {
            for b in 0..5 {
                for c in 0..5 {
                    for d in 0..5 {
                        for e in 0..5 {
                            let row = [a, b, c, d, e];
                            if (0..5).all(|i| !row[..i].contains(&row[i])) {
                                all.push(row);
                            }
                        }
                    }
                }
            }
        }
        all
    }

    #[test]
    fn independent_paths_and_signed_assignment_match_exhaustive_enumeration() {
        let paths = reference_paths();
        let mut counts = std::collections::BTreeMap::new();
        let mut marginals = [[0_i128; 5]; 5];
        for path in paths {
            *counts.entry(path).or_insert(0_u16) += 1;
            for (slot, actor) in path.into_iter().enumerate() {
                marginals[slot][actor] += 1;
            }
        }
        assert_eq!(counts.len(), 96);
        assert_eq!(counts.into_iter().collect::<Vec<_>>(), *orders());
        assert_eq!(marginals, ORDER_WEIGHTS);
        let formations = reference_formations();
        assert_eq!(&formations, permutations());
        for seed in 0..31 {
            let matrix = std::array::from_fn(|p| {
                std::array::from_fn(|c| ((p * 101 + c * 61 + seed * 97) % 139) as i128 - 70)
            });
            for mask in 0..32 {
                let eligible = std::array::from_fn(|c| mask & (1 << c) != 0);
                let mut expected: Vec<_> = formations
                    .iter()
                    .filter(|f| eligible[f[2]])
                    .map(|&f| (f, (0..5).map(|p| matrix[p][f[p]]).sum::<i128>()))
                    .collect();
                expected.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
                assert_eq!(assignment(matrix, eligible), expected.first().copied());
            }
        }
    }

    fn note_multiplier(skill: ResolvedScoreSkillV1, count: usize, p: f64) -> f64 {
        let boosted = |percent: f64| 1.0 + percent / 100.0;
        let weighted = |perfect, great| {
            (1.1 * perfect * p + 0.8 * great * (1.0 - p)) / (1.1 * p + 0.8 * (1.0 - p))
        };
        match skill.behavior {
            SkillBehaviorV1::Neutral => 1.0,
            SkillBehaviorV1::Score { score_up_percent } => boosted(
                score_up_percent
                    + if skill.is_rate_up_with_perfect {
                        0.5 * count.min(100) as f64 * p
                    } else {
                        0.0
                    },
            ),
            SkillBehaviorV1::ScoreOnPerfect { score_up_percent } => {
                weighted(boosted(score_up_percent), 1.0)
            }
            SkillBehaviorV1::PerfectOnly { score_up_percent } => {
                weighted(boosted(score_up_percent), 0.0)
            }
            SkillBehaviorV1::GreatOrWorseHalf { score_up_percent } => {
                weighted(boosted(score_up_percent), 0.5)
            }
            SkillBehaviorV1::ContinuedPerfect {
                active_score_up_percent,
                fallback_score_up_percent,
            } => {
                boosted(fallback_score_up_percent)
                    + p.powf(count as f64)
                        * (boosted(active_score_up_percent) - boosted(fallback_score_up_percent))
            }
        }
    }

    fn note_score(
        song: &MedleySongV1,
        fever: &[bool],
        skills: [ResolvedScoreSkillV1; 5],
        order: [usize; 5],
        encore: usize,
        p: f64,
    ) -> i128 {
        let coefficient =
            (3.0 + 0.03 * (f64::from(song.play_level) - 5.0)) / song.notes.len() as f64;
        let judge = 1.1 * p + 0.8 * (1.0 - p);
        let bases: Vec<_> = (0..song.notes.len())
            .map(|n| {
                let limits = [
                    20,
                    50,
                    100,
                    150,
                    200,
                    250,
                    300,
                    400,
                    500,
                    600,
                    700,
                    usize::MAX,
                ];
                let rates = [
                    1.0, 1.01, 1.02, 1.03, 1.04, 1.05, 1.06, 1.07, 1.08, 1.09, 1.1, 1.11,
                ];
                let combo = rates[limits.iter().position(|&end| n < end).unwrap()];
                (((317_123.875 * coefficient * combo) * judge) * if fever[n] { 2.0 } else { 1.0 })
                    .floor()
            })
            .collect();
        let mut score = bases.iter().sum::<f64>() as i128;
        let mut end = f64::NEG_INFINITY;
        for ((trigger, note), actor) in song
            .notes
            .iter()
            .enumerate()
            .filter(|(_, n)| n.is_skill_trigger)
            .zip(order.into_iter().chain([encore]))
        {
            let start = note.time_seconds.max(end + 0.75);
            end = start + skills[actor].duration_seconds;
            let mut count = 0;
            for (index, note) in song.notes.iter().enumerate().skip(trigger + 1) {
                if note.time_seconds >= start && note.time_seconds <= end {
                    count += 1;
                    score += (bases[index] * note_multiplier(skills[actor], count, p)).floor()
                        as i128
                        - bases[index] as i128;
                }
            }
        }
        score
    }

    #[test]
    fn every_formation_matches_independent_notes_paths_and_peak_ties() {
        let formations = reference_formations();
        let paths = reference_paths();
        let order_ids: std::collections::BTreeMap<_, _> = formations
            .iter()
            .enumerate()
            .map(|(i, &f)| (f, i))
            .collect();
        let path_ids: Vec<Vec<_>> = formations
            .iter()
            .map(|formation| {
                paths
                    .iter()
                    .map(|order| order_ids[&order.map(|p| formation[p])])
                    .collect()
            })
            .collect();
        for scenario in 0..5 {
            let triggers = match scenario {
                0 => [0.0, 5.0, 10.0, 15.0, 20.0, 25.0],
                1 => [0.0, 5.0, 10.0, 15.0, 20.0, 20.0],
                _ => [0.0, 0.0, 2.0, 4.0, 6.0, 8.0],
            };
            let mut notes: Vec<_> = triggers
                .into_iter()
                .map(|time_seconds| ScoringNoteV1 {
                    note_id: 0,
                    time_seconds,
                    is_skill_trigger: true,
                })
                .collect();
            for n in 0..740 {
                notes.push(ScoringNoteV1 {
                    note_id: 0,
                    time_seconds: f64::from(n / 2) / 12.0,
                    is_skill_trigger: false,
                });
            }
            notes.sort_by(|a, b| {
                a.time_seconds
                    .total_cmp(&b.time_seconds)
                    .then(b.is_skill_trigger.cmp(&a.is_skill_trigger))
            });
            for (i, note) in notes.iter_mut().enumerate() {
                note.note_id = i as u32;
            }
            let song = MedleySongV1 {
                slot: 0,
                song_id: 1,
                difficulty: DifficultyV1::Expert,
                play_level: 29,
                notes,
            };
            let fever: Vec<_> = (0..song.notes.len()).map(|n| n % 73 < 21).collect();
            let skills = std::array::from_fn(|i| ResolvedScoreSkillV1 {
                master_skill_id: i as u32 + 1,
                skill_level: 1,
                duration_seconds: match scenario {
                    3 => 1.25,
                    4 => 0.0,
                    _ => [0.25, 1.25, 2.0, 3.5, 2.5][i],
                },
                behavior: match (i + scenario) % 6 {
                    0 => SkillBehaviorV1::Score {
                        score_up_percent: 40.0,
                    },
                    1 => SkillBehaviorV1::ScoreOnPerfect {
                        score_up_percent: 77.0,
                    },
                    2 => SkillBehaviorV1::PerfectOnly {
                        score_up_percent: 140.0,
                    },
                    3 => SkillBehaviorV1::ContinuedPerfect {
                        active_score_up_percent: 50.0,
                        fallback_score_up_percent: 170.0,
                    },
                    4 => SkillBehaviorV1::GreatOrWorseHalf {
                        score_up_percent: 80.0,
                    },
                    _ => SkillBehaviorV1::Neutral,
                },
                is_rate_up_with_perfect: (i + scenario) % 6 == 0,
            });
            for p in [0.0, 0.73, 1.0] {
                let prepared = PreparedSong::single(&song, p, &fever).unwrap();
                for multi in [false, true] {
                    for encore in 0..if multi { 5 } else { 1 } {
                        let mut windows = SingleWindows::new(
                            &prepared,
                            skills,
                            317_123.875,
                            multi.then_some([skills[1], skills[2], skills[3], skills[4]]),
                            encore,
                            0.0,
                        )
                        .unwrap();
                        // Check a restricted leader set as well as all leaders, without changing timing tables.
                        let eligible = if scenario % 2 == 0 {
                            [true; 5]
                        } else {
                            [true, false, true, false, true]
                        };
                        windows.restrict_leaders(eligible);
                        let mut variants = Vec::new();
                        for leader in 0..5 {
                            if !eligible[leader] {
                                continue;
                            }
                            let actors = if multi {
                                [skills[leader], skills[1], skills[2], skills[3], skills[4]]
                            } else {
                                skills
                            };
                            let totals: Vec<_> = formations
                                .iter()
                                .map(|&o| {
                                    note_score(
                                        &song,
                                        &fever,
                                        actors,
                                        o,
                                        if multi { encore } else { leader },
                                        p,
                                    )
                                })
                                .collect();
                            for (f, &formation) in formations.iter().enumerate() {
                                if !multi && formation[2] != leader {
                                    continue;
                                }
                                let selected: Vec<_> =
                                    path_ids[f].iter().map(|&i| totals[i]).collect();
                                let avg = selected.iter().sum::<i128>() as f64 / 1024.0;
                                let minimum = *selected.iter().min().unwrap();
                                let maximum = *selected.iter().max().unwrap();
                                let count =
                                    selected.iter().filter(|&&v| v == maximum).count() as u16;
                                let cards = if multi { centered(leader) } else { formation };
                                let players = multi.then_some(formation);
                                assert_eq!(
                                    windows.average(cards, players),
                                    avg,
                                    "scenario {scenario} p {p} multi {multi} encore {encore} formation {formation:?}"
                                );
                                variants.push((cards, players, avg, minimum, maximum, count));
                            }
                        }
                        variants.sort_by(|a, b| {
                            b.2.total_cmp(&a.2).then(a.0.cmp(&b.0)).then(a.1.cmp(&b.1))
                        });
                        let selected = variants[0];
                        let scores = windows.scores();
                        let best = scores
                            .iter()
                            .min_by(|a, b| {
                                b.average
                                    .total_cmp(&a.average)
                                    .then(a.formation.cmp(&b.formation))
                                    .then(a.player_formation.cmp(&b.player_formation))
                            })
                            .unwrap();
                        assert_eq!(
                            (best.formation, best.player_formation, best.average),
                            (selected.0, selected.1, selected.2)
                        );
                        variants.sort_by(|a, b| {
                            b.4.cmp(&a.4)
                                .then(b.5.cmp(&a.5))
                                .then(b.2.total_cmp(&a.2))
                                .then(a.0.cmp(&b.0))
                                .then(a.1.cmp(&b.1))
                        });
                        let peak = variants[0];
                        let detail = windows.details([0, 1, 2, 3, 4], selected.0, selected.1);
                        assert_eq!(detail.minimum_score, selected.3 as f64);
                        assert_eq!(detail.maximum_score, peak.4 as f64);
                        assert_eq!(detail.maximum_probability_numerator, peak.5);
                        assert_eq!(detail.peak_average_score, peak.2);
                        assert_eq!(detail.peak_member_instance_ids, peak.0.map(|i| i as u32));
                        assert_eq!(detail.peak_player_formation, peak.1);
                        assert_eq!(
                            detail.current_maximum_probability_numerator,
                            if selected.4 == peak.4 { selected.5 } else { 0 }
                        );
                        let peak_skills = if multi {
                            [
                                skills[peak.0[2]],
                                skills[1],
                                skills[2],
                                skills[3],
                                skills[4],
                            ]
                        } else {
                            skills
                        };
                        assert_eq!(
                            note_score(
                                &song,
                                &fever,
                                peak_skills,
                                detail.peak_activation_order.map(|i| i as usize),
                                if multi { encore } else { peak.0[2] },
                                p
                            ),
                            peak.4
                        );
                    }
                }
            }
        }
    }
}
