use std::sync::OnceLock;

use bandori_medley_model::{
    ExactProbabilityV1, MedleySongV1, ResolvedScoreSkillV1, SkillBehaviorV1,
};

const SKILL_ORDER_COUNT: usize = 120;
const PERFECT_RATE: f64 = 1.1;
const GREAT_RATE: f64 = 0.8;
// Member indexes in the established scoring order, with the leader at index two.
const LEADER_MEMBER_ORDERS: [[usize; 5]; 5] = [
    [1, 2, 0, 3, 4],
    [0, 2, 1, 3, 4],
    [0, 1, 2, 3, 4],
    [0, 1, 3, 2, 4],
    [0, 1, 4, 2, 3],
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum ExactScoreFailure {
    InvalidSong,
    ArithmeticNonFinite,
    ArithmeticOverflow,
}

/// Chart-only work is shared by every candidate and area configuration in a run.
pub(crate) struct PreparedSong<'input> {
    song: &'input MedleySongV1,
    combo_rates: Vec<f64>,
    trigger_times: [f64; 6],
    window_starts: [usize; 6],
    perfect_rate: f64,
    judgment_multiplier: f64,
}

struct SkillWindow {
    start: usize,
    // One row per covered note; expired members contribute zero. The same
    // multipliers serve all leaders, orders and parameter rounding variants.
    deltas: Vec<[f64; 5]>,
}

impl SkillWindow {
    fn at(&self, note_index: usize) -> Option<&[f64; 5]> {
        note_index
            .checked_sub(self.start)
            .and_then(|offset| self.deltas.get(offset))
    }
}

struct SkillWindows {
    windows: [SkillWindow; 6],
    note_masks: Vec<u8>,
}

pub(crate) fn skill_orders() -> &'static [[usize; 5]] {
    static ORDERS: OnceLock<Vec<[usize; 5]>> = OnceLock::new();
    ORDERS
        .get_or_init(|| {
            fn visit(
                depth: usize,
                current: &mut [usize; 5],
                used: &mut [bool; 5],
                output: &mut Vec<[usize; 5]>,
            ) {
                if depth == current.len() {
                    output.push(*current);
                    return;
                }
                for member_index in 0..5 {
                    if used[member_index] {
                        continue;
                    }
                    used[member_index] = true;
                    current[depth] = member_index;
                    visit(depth + 1, current, used, output);
                    used[member_index] = false;
                }
            }
            let mut output = Vec::with_capacity(SKILL_ORDER_COUNT);
            visit(0, &mut [0; 5], &mut [false; 5], &mut output);
            output
        })
        .as_slice()
}

fn leader_order_indexes() -> &'static [[usize; SKILL_ORDER_COUNT]; 5] {
    static INDEXES: OnceLock<[[usize; SKILL_ORDER_COUNT]; 5]> = OnceLock::new();
    INDEXES.get_or_init(|| {
        LEADER_MEMBER_ORDERS.map(|members| {
            std::array::from_fn(|index| {
                let order = skill_orders()[index].map(|member| members[member]);
                skill_orders()
                    .iter()
                    .position(|candidate| *candidate == order)
                    .expect("permuting member indexes preserves a complete order")
            })
        })
    })
}

pub(crate) fn exact_probability_to_f64(probability: ExactProbabilityV1) -> f64 {
    let denominator = 10_u64.pow(u32::from(probability.decimal_scale));
    probability.numerator as f64 / denominator as f64
}

fn combo_rate(combo: u32) -> f64 {
    match combo {
        0..=20 => 1.0,
        21..=50 => 1.01,
        51..=100 => 1.02,
        101..=300 => 1.01 + f64::from((combo - 1) / 50) * 0.01,
        301..=3_000 => 1.04 + f64::from((combo - 1) / 100) * 0.01,
        _ => 1.34,
    }
}

fn floor_to_u32(value: f64) -> Result<u32, ExactScoreFailure> {
    if !value.is_finite() || value < 0.0 {
        return Err(ExactScoreFailure::ArithmeticNonFinite);
    }
    let floored = value.floor();
    if floored > f64::from(u32::MAX) {
        return Err(ExactScoreFailure::ArithmeticOverflow);
    }
    Ok(floored as u32)
}

fn skill_multiplier(
    skill: ResolvedScoreSkillV1,
    covered_note_count: usize,
    perfect_rate: f64,
    judge: f64,
) -> f64 {
    let percent_multiplier = |percent: f64| 1.0 + percent / 100.0;
    let weighted = |perfect: f64, great: f64| {
        if perfect == great {
            perfect
        } else {
            (PERFECT_RATE * perfect * perfect_rate + GREAT_RATE * great * (1.0 - perfect_rate))
                / judge
        }
    };
    match skill.behavior {
        SkillBehaviorV1::Neutral => 1.0,
        SkillBehaviorV1::Score {
            mut score_up_percent,
        } => {
            if skill.is_rate_up_with_perfect {
                score_up_percent += 0.5 * covered_note_count.min(100) as f64 * perfect_rate;
            }
            percent_multiplier(score_up_percent)
        }
        SkillBehaviorV1::ScoreOnPerfect { score_up_percent } => {
            weighted(percent_multiplier(score_up_percent), 1.0)
        }
        SkillBehaviorV1::PerfectOnly { score_up_percent } => {
            weighted(percent_multiplier(score_up_percent), 0.0)
        }
        SkillBehaviorV1::ContinuedPerfect {
            active_score_up_percent,
            fallback_score_up_percent,
        } => {
            let active = percent_multiplier(active_score_up_percent);
            let fallback = percent_multiplier(fallback_score_up_percent);
            fallback + perfect_rate.powf(covered_note_count as f64) * (active - fallback)
        }
        SkillBehaviorV1::GreatOrWorseHalf { score_up_percent } => {
            weighted(percent_multiplier(score_up_percent), 0.5)
        }
    }
}

impl<'input> PreparedSong<'input> {
    pub(crate) fn new(
        song: &'input MedleySongV1,
        start_combo: u32,
        perfect_rate: f64,
    ) -> Result<Self, ExactScoreFailure> {
        let mut trigger_times = [0.0; 6];
        let mut count = 0;
        for note in song.notes.iter().filter(|note| note.is_skill_trigger) {
            let Some(time) = trigger_times.get_mut(count) else {
                return Err(ExactScoreFailure::InvalidSong);
            };
            *time = note.time_seconds;
            count += 1;
        }
        if count != 6 || song.notes.is_empty() {
            return Err(ExactScoreFailure::InvalidSong);
        }
        let note_count =
            u32::try_from(song.notes.len()).map_err(|_| ExactScoreFailure::ArithmeticOverflow)?;
        let end_combo = start_combo
            .checked_add(note_count)
            .ok_or(ExactScoreFailure::ArithmeticOverflow)?;
        Ok(Self {
            song,
            combo_rates: (start_combo + 1..=end_combo).map(combo_rate).collect(),
            trigger_times,
            window_starts: trigger_times
                .map(|time| song.notes.partition_point(|note| note.time_seconds <= time)),
            perfect_rate,
            judgment_multiplier: PERFECT_RATE * perfect_rate + GREAT_RATE * (1.0 - perfect_rate),
        })
    }

    fn base_scores(&self, parameter: f64) -> Result<Vec<u32>, ExactScoreFailure> {
        let level_rate = 1.0 + (f64::from(self.song.play_level) - 5.0) / 100.0;
        let base = parameter * level_rate / self.song.notes.len() as f64 * 3.0;
        self.combo_rates
            .iter()
            .map(|combo| floor_to_u32(base * self.judgment_multiplier * combo))
            .collect()
    }

    fn skill_windows(
        &self,
        skills: [ResolvedScoreSkillV1; 5],
    ) -> Result<SkillWindows, ExactScoreFailure> {
        let mut note_masks = vec![0_u8; self.song.notes.len()];
        let mut windows = std::array::from_fn(|slot| SkillWindow {
            start: self.window_starts[slot],
            deltas: Vec::new(),
        });
        for (slot, window) in windows.iter_mut().enumerate() {
            let mut ends = [0; 5];
            for (member, skill) in skills.iter().enumerate() {
                let end = self.trigger_times[slot] + skill.duration_seconds + 0.00001;
                if !end.is_finite() {
                    return Err(ExactScoreFailure::ArithmeticNonFinite);
                }
                ends[member] = self
                    .song
                    .notes
                    .partition_point(|note| note.time_seconds <= end);
            }
            let last_end = *ends.iter().max().expect("five skills");
            window.deltas.reserve(last_end - window.start);
            for (note_index, mask) in note_masks
                .iter_mut()
                .enumerate()
                .take(last_end)
                .skip(window.start)
            {
                *mask |= 1 << slot;
                window.deltas.push(std::array::from_fn(|member| {
                    if note_index < ends[member] {
                        skill_multiplier(
                            skills[member],
                            note_index - window.start + 1,
                            self.perfect_rate,
                            self.judgment_multiplier,
                        ) - 1.0
                    } else {
                        0.0
                    }
                }));
            }
        }
        Ok(SkillWindows {
            windows,
            note_masks,
        })
    }

    /// The first five windows use each skill with probability 1/5. Accumulate
    /// already-floored contributions once; only overlapping notes need joint
    /// evaluation. The sixth window is shared work for all possible leaders.
    fn score_orders(
        &self,
        base_scores: &[u32],
        skills: &SkillWindows,
        leaders: [bool; 5],
    ) -> Result<[[f64; SKILL_ORDER_COUNT]; 5], ExactScoreFailure> {
        let mut scores = [[0.0; SKILL_ORDER_COUNT]; 5];
        // Regroup integer contributions only where every possible note sum is
        // exactly representable as f64. Otherwise keep chronological addition
        // using the same prepared multipliers, without changing accepted input.
        let can_group = base_scores.len() as u64 * u64::from(u32::MAX) <= (1_u64 << 53);
        let mut single_totals = [[0_i64; 5]; 6];
        let mut base_total = 0_i64;
        if can_group {
            base_total = base_scores.iter().map(|score| i64::from(*score)).sum();
            for (slot, window) in skills.windows.iter().enumerate() {
                for (offset, deltas) in window.deltas.iter().enumerate() {
                    let note_index = window.start + offset;
                    if skills.note_masks[note_index].count_ones() != 1 {
                        continue;
                    }
                    let base = base_scores[note_index];
                    for (member, delta) in deltas.iter().enumerate() {
                        if slot == 5 && !leaders[member] {
                            continue;
                        }
                        let score = floor_to_u32(f64::from(base) * (1.0 + delta).max(0.0))?;
                        single_totals[slot][member] += i64::from(score) - i64::from(base);
                    }
                }
            }
        }
        let joint_notes: Vec<usize> = skills
            .note_masks
            .iter()
            .enumerate()
            .filter_map(|(index, mask)| (!can_group || mask.count_ones() > 1).then_some(index))
            .collect();
        for (order_index, order) in skill_orders().iter().enumerate() {
            let first_five = base_total
                + (0..5)
                    .map(|slot| single_totals[slot][order[slot]])
                    .sum::<i64>();
            for (leader, row) in scores
                .iter_mut()
                .enumerate()
                .filter(|(leader, _)| leaders[*leader])
            {
                row[order_index] = (first_five + single_totals[5][leader]) as f64;
            }
            for &note_index in &joint_notes {
                let mut combined = 1.0;
                for (slot, window) in skills.windows[..5].iter().enumerate() {
                    if let Some(deltas) = window.at(note_index) {
                        combined += deltas[order[slot]];
                    }
                }
                let last = skills.windows[5].at(note_index);
                let base = f64::from(base_scores[note_index]);
                for (leader, row) in scores
                    .iter_mut()
                    .enumerate()
                    .filter(|(leader, _)| leaders[*leader])
                {
                    let multiplier = last.map_or(combined, |deltas| combined + deltas[leader]);
                    let note_score = f64::from(floor_to_u32(base * multiplier.max(0.0))?);
                    row[order_index] += if can_group {
                        note_score - base
                    } else {
                        note_score
                    };
                }
            }
        }
        Ok(scores)
    }

    pub(crate) fn score_leaders(
        &self,
        skills: [ResolvedScoreSkillV1; 5],
        parameters: [f64; 5],
    ) -> Result<[f64; 5], ExactScoreFailure> {
        let windows = self.skill_windows(skills)?;
        let mut averages = [0.0; 5];
        for leader in 0..5 {
            if parameters[..leader]
                .iter()
                .any(|value| value.to_bits() == parameters[leader].to_bits())
            {
                continue;
            }
            // Changing the leader preserves the members, but the established
            // parameter summation order can differ in its last bit. Reuse only
            // genuinely identical values, never normalize their arithmetic.
            let leaders = parameters.map(|value| value.to_bits() == parameters[leader].to_bits());
            let base_scores = self.base_scores(parameters[leader])?;
            let scores = self.score_orders(&base_scores, &windows, leaders)?;
            for index in (0..5).filter(|index| leaders[*index]) {
                averages[index] = leader_order_indexes()[index]
                    .iter()
                    .fold(0.0, |sum, order| sum + scores[index][*order])
                    / SKILL_ORDER_COUNT as f64;
            }
        }
        Ok(averages)
    }
}

#[cfg(test)]
#[derive(Clone, Copy)]
pub(crate) struct ExactTeamScoreInput {
    pub(crate) deck_total_parameter: f64,
    pub(crate) skills: [ResolvedScoreSkillV1; 5],
}

#[cfg(test)]
pub(crate) struct ExactSongScore {
    pub(crate) average_score: f64,
    pub(crate) order_scores: Vec<f64>,
}

#[cfg(test)]
pub(crate) fn score_song(
    song: &MedleySongV1,
    team: ExactTeamScoreInput,
    start_combo: u32,
    perfect_rate: f64,
) -> Result<ExactSongScore, ExactScoreFailure> {
    let prepared = PreparedSong::new(song, start_combo, perfect_rate)?;
    let windows = prepared.skill_windows(team.skills)?;
    let base_scores = prepared.base_scores(team.deck_total_parameter)?;
    let scores =
        prepared.score_orders(&base_scores, &windows, [false, false, true, false, false])?;
    Ok(ExactSongScore {
        average_score: scores[2].iter().sum::<f64>() / SKILL_ORDER_COUNT as f64,
        order_scores: scores[2].to_vec(),
    })
}

#[cfg(test)]
mod tests {
    use bandori_medley_model::{FixedMedleyEvaluationInputV1, ScoringNoteV1, SkillBehaviorV1};
    use bandori_medley_reference::evaluate_fixed_medley;

    use super::*;

    const FIXTURE: &str =
        include_str!("../../bandori-medley-model/tests/fixtures/valid-fixed-medley-v1.json");

    fn assert_leader_parity(
        input: &FixedMedleyEvaluationInputV1,
        slot: usize,
        start_combo: u32,
        parameters: [f64; 5],
    ) {
        let team = &input.teams[slot];
        let skills = team
            .member_instance_ids
            .map(|instance_id| input.cards[instance_id as usize].skill);
        let prepared = PreparedSong::new(
            &input.songs[slot],
            start_combo,
            exact_probability_to_f64(input.perfect_rate),
        )
        .unwrap();
        let averages = prepared.score_leaders(skills, parameters).unwrap();
        for leader in 0..5 {
            let mut reordered = input.clone();
            reordered.teams[slot].member_instance_ids =
                LEADER_MEMBER_ORDERS[leader].map(|position| team.member_instance_ids[position]);
            reordered.teams[slot].deck_total_parameter = parameters[leader];
            let expected = evaluate_fixed_medley(&reordered).unwrap();
            assert_eq!(
                averages[leader].to_bits(),
                expected.songs[slot].average_score().to_bits()
            );
        }
    }

    fn assert_reference_parity(input: &FixedMedleyEvaluationInputV1) {
        let reference = evaluate_fixed_medley(input).expect("reference fixture scores");
        let perfect_rate = exact_probability_to_f64(input.perfect_rate);
        let mut start_combo = 0_u32;
        for slot in 0..3 {
            let team = &input.teams[slot];
            let skills = team
                .member_instance_ids
                .map(|instance_id| input.cards[instance_id as usize].skill);
            let production = score_song(
                &input.songs[slot],
                ExactTeamScoreInput {
                    deck_total_parameter: team.deck_total_parameter,
                    skills,
                },
                start_combo,
                perfect_rate,
            )
            .expect("production fixture scores");
            assert_eq!(
                production.average_score.to_bits(),
                reference.songs[slot].average_score().to_bits()
            );
            for (actual, expected) in production
                .order_scores
                .iter()
                .zip(&reference.songs[slot].permutation_expected_score_bits)
            {
                assert_eq!(actual.to_bits(), expected.to_f64().to_bits());
            }
            let parameter = team.deck_total_parameter;
            assert_leader_parity(
                input,
                slot,
                start_combo,
                [
                    parameter,
                    parameter.next_up(),
                    parameter,
                    parameter + 1.0,
                    parameter,
                ],
            );
            start_combo += input.songs[slot].notes.len() as u32;
        }
    }

    #[test]
    fn production_song_scores_match_reference_bits() {
        let mut input: FixedMedleyEvaluationInputV1 =
            serde_json::from_str(FIXTURE).expect("fixed fixture decodes");
        assert_reference_parity(&input);
        // A parameter group must not evaluate a sixth-window member who is
        // leader only in another group: that hypothetical note can overflow.
        input.perfect_rate = ExactProbabilityV1 {
            numerator: 1,
            decimal_scale: 0,
        };
        input.songs[0].play_level = 5;
        for (note, time) in input.songs[0]
            .notes
            .iter_mut()
            .zip([0.0, 10.0, 20.0, 30.0, 40.0, 50.0, 51.0])
        {
            note.time_seconds = time;
        }
        for (member, instance_id) in input.teams[0].member_instance_ids.into_iter().enumerate() {
            let skill = &mut input.cards[instance_id as usize].skill;
            skill.duration_seconds = 1.0;
            skill.behavior = if member == 0 {
                SkillBehaviorV1::Score {
                    score_up_percent: 100.0,
                }
            } else {
                SkillBehaviorV1::Neutral
            };
        }
        let low = 4_555_268_344.242_423_f64;
        let high = low.next_up();
        assert_leader_parity(&input, 0, 0, [low, high, high, high, high]);
    }

    #[test]
    fn probability_formulas_and_additive_overlap_match_reference_bits() {
        let mut input: FixedMedleyEvaluationInputV1 = serde_json::from_str(FIXTURE).unwrap();
        let team = input.teams[0];
        let behaviors = [
            SkillBehaviorV1::ScoreOnPerfect {
                score_up_percent: 80.0,
            },
            SkillBehaviorV1::PerfectOnly {
                score_up_percent: 110.0,
            },
            SkillBehaviorV1::Score {
                score_up_percent: 60.0,
            },
            SkillBehaviorV1::ContinuedPerfect {
                active_score_up_percent: 100.0,
                fallback_score_up_percent: 40.0,
            },
            SkillBehaviorV1::GreatOrWorseHalf {
                score_up_percent: 90.0,
            },
        ];
        for (position, (instance_id, behavior)) in team
            .member_instance_ids
            .into_iter()
            .zip(behaviors)
            .enumerate()
        {
            let skill = &mut input.cards[instance_id as usize].skill;
            skill.duration_seconds = 2.0 + position as f64;
            skill.behavior = behavior;
            skill.is_rate_up_with_perfect = position == 2;
        }
        for (numerator, decimal_scale) in [(0, 0), (6, 1), (1, 0)] {
            input.perfect_rate = ExactProbabilityV1 {
                numerator,
                decimal_scale,
            };
            assert_reference_parity(&input);
        }
        // Separated windows exercise the common first-five contribution path.
        for song in &mut input.songs {
            song.notes = (0..12)
                .map(|note_id| ScoringNoteV1 {
                    note_id,
                    time_seconds: f64::from(note_id / 2) * 10.0 + f64::from(note_id % 2),
                    is_skill_trigger: note_id % 2 == 0,
                })
                .collect();
        }
        input.perfect_rate = ExactProbabilityV1 {
            numerator: 6,
            decimal_scale: 1,
        };
        assert_reference_parity(&input);
    }
}
