use bandori_medley_model::{
    ExactProbabilityV1, MedleySongV1, ResolvedScoreSkillV1, SkillBehaviorV1,
};

const PERFECT_RATE: f64 = 1.1;
const GREAT_RATE: f64 = 0.8;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum ExactScoreFailure {
    InvalidSong,
    ArithmeticNonFinite,
    ArithmeticOverflow,
}

struct ComboGroup {
    start: usize,
    end: usize,
    rate: f64,
}

/// Chart-only work is shared by every candidate and area configuration in a run.
pub(crate) struct PreparedSong<'input> {
    song: &'input MedleySongV1,
    combo_groups: Vec<ComboGroup>,
    coefficient: f64,
    trigger_times: [f64; 6],
    window_starts: [usize; 6],
    perfect_rate: f64,
    judgment_multiplier: f64,
}

struct PreparedSkill {
    ends: [usize; 6],
    // Only the note-count-dependent prefix varies. Rate-up is constant from
    // covered note 100; continued PERFECT may vary for the entire window.
    varying_multipliers: Vec<f64>,
    constant_multiplier: f64,
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
        let mut window_starts = [0; 6];
        let mut count = 0;
        for (index, note) in song
            .notes
            .iter()
            .enumerate()
            .filter(|(_, note)| note.is_skill_trigger)
        {
            let Some(time) = trigger_times.get_mut(count) else {
                return Err(ExactScoreFailure::InvalidSong);
            };
            *time = note.time_seconds;
            window_starts[count] = index + 1;
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
        let mut combo_groups: Vec<ComboGroup> = Vec::new();
        for (index, combo) in (start_combo + 1..=end_combo).enumerate() {
            let rate = combo_rate(combo);
            if let Some(group) = combo_groups.last_mut().filter(|group| group.rate == rate) {
                group.end = index + 1;
            } else {
                combo_groups.push(ComboGroup {
                    start: index,
                    end: index + 1,
                    rate,
                });
            }
        }
        Ok(Self {
            song,
            combo_groups,
            coefficient: (3.0 + 0.03 * (f64::from(song.play_level) - 5.0)) / f64::from(note_count),
            trigger_times,
            window_starts,
            perfect_rate,
            judgment_multiplier: PERFECT_RATE * perfect_rate + GREAT_RATE * (1.0 - perfect_rate),
        })
    }

    fn base_scores(&self, parameter: f64) -> Result<Vec<u32>, ExactScoreFailure> {
        let base = parameter * self.coefficient;
        self.combo_groups
            .iter()
            .map(|group| floor_to_u32((base * group.rate) * self.judgment_multiplier))
            .collect()
    }

    fn prepare_skills(
        &self,
        skills: [ResolvedScoreSkillV1; 5],
    ) -> Result<[PreparedSkill; 5], ExactScoreFailure> {
        let mut prepared = std::array::from_fn(|_| PreparedSkill {
            ends: [0; 6],
            varying_multipliers: Vec::new(),
            constant_multiplier: 1.0,
        });
        for (member, skill) in skills.into_iter().enumerate() {
            let result = &mut prepared[member];
            for (slot, end_index) in result.ends.iter_mut().enumerate() {
                let end = self.trigger_times[slot] + skill.duration_seconds;
                if !end.is_finite() {
                    return Err(ExactScoreFailure::ArithmeticNonFinite);
                }
                *end_index = self
                    .song
                    .notes
                    .partition_point(|note| note.time_seconds <= end);
            }
            let maximum_count = (0..6)
                .map(|slot| result.ends[slot] - self.window_starts[slot])
                .max()
                .unwrap_or(0);
            let varying_count = match skill.behavior {
                SkillBehaviorV1::Score { .. }
                    if skill.is_rate_up_with_perfect && self.perfect_rate > 0.0 =>
                {
                    maximum_count.min(99)
                }
                SkillBehaviorV1::ContinuedPerfect {
                    active_score_up_percent,
                    fallback_score_up_percent,
                } if self.perfect_rate > 0.0
                    && self.perfect_rate < 1.0
                    && active_score_up_percent != fallback_score_up_percent =>
                {
                    maximum_count
                }
                _ => 0,
            };
            result.varying_multipliers = (1..=varying_count)
                .map(|count| {
                    skill_multiplier(skill, count, self.perfect_rate, self.judgment_multiplier)
                })
                .collect();
            result.constant_multiplier = skill_multiplier(
                skill,
                varying_count + 1,
                self.perfect_rate,
                self.judgment_multiplier,
            );
        }
        Ok(prepared)
    }

    fn window_contributions(
        &self,
        base_scores: &[u32],
        skills: &[PreparedSkill; 5],
        leaders: [bool; 5],
    ) -> Result<[[i128; 5]; 6], ExactScoreFailure> {
        let mut totals = [[0_i128; 5]; 6];
        for (member, skill) in skills.iter().enumerate() {
            for (slot, total) in totals.iter_mut().enumerate() {
                if slot == 5 && !leaders[member] {
                    continue;
                }
                let start = self.window_starts[slot];
                let end = skill.ends[slot];
                for (group, base) in self.combo_groups.iter().zip(base_scores) {
                    let first = start.max(group.start);
                    let last = end.min(group.end);
                    if first >= last {
                        continue;
                    }
                    let extra = |multiplier| {
                        floor_to_u32(f64::from(*base) * multiplier)
                            .map(|score| i128::from(score) - i128::from(*base))
                    };
                    let varying_end = (start + skill.varying_multipliers.len()).min(last);
                    if first < varying_end {
                        for multiplier in
                            &skill.varying_multipliers[first - start..varying_end - start]
                        {
                            total[member] += extra(*multiplier)?;
                        }
                    }
                    let constant_start = first.max(varying_end);
                    if constant_start < last {
                        total[member] +=
                            extra(skill.constant_multiplier)? * (last - constant_start) as i128;
                    }
                }
            }
        }
        Ok(totals)
    }

    /// Each member occupies each of the first five slots in 24/120 orders.
    /// Independent integer extras therefore need only a denominator of five.
    /// i128 covers u32 note counts/scores, signed extras and this numerator.
    pub(crate) fn score_leaders(
        &self,
        skills: [ResolvedScoreSkillV1; 5],
        parameters: [f64; 5],
    ) -> Result<[f64; 5], ExactScoreFailure> {
        let skills = self.prepare_skills(skills)?;
        let mut averages = [0.0; 5];
        for leader in 0..5 {
            if parameters[..leader]
                .iter()
                .any(|value| value.to_bits() == parameters[leader].to_bits())
            {
                continue;
            }
            // Leader placement can change parameter summation's last bit.
            let leaders = parameters.map(|value| value.to_bits() == parameters[leader].to_bits());
            let base_scores = self.base_scores(parameters[leader])?;
            let base_total: i128 = self
                .combo_groups
                .iter()
                .zip(&base_scores)
                .map(|(group, score)| i128::from(*score) * (group.end - group.start) as i128)
                .sum();
            let windows = self.window_contributions(&base_scores, &skills, leaders)?;
            let first_five: i128 = windows[..5].iter().flatten().sum();
            for index in (0..5).filter(|index| leaders[*index]) {
                averages[index] = (5 * (base_total + windows[5][index]) + first_five) as f64 / 5.0;
            }
        }
        Ok(averages)
    }
}

#[cfg(test)]
mod tests {
    use bandori_medley_model::{FixedMedleyEvaluationInputV1, ScoringNoteV1, SkillBehaviorV1};
    use bandori_medley_reference::evaluate_fixed_medley;

    use super::*;

    const LEADER_MEMBER_ORDERS: [[usize; 5]; 5] = [
        [1, 2, 0, 3, 4],
        [0, 2, 1, 3, 4],
        [0, 1, 2, 3, 4],
        [0, 1, 3, 2, 4],
        [0, 1, 4, 2, 3],
    ];

    const FIXTURE: &str =
        include_str!("../../bandori-medley-model/tests/fixtures/valid-fixed-medley-v1.json");

    #[test]
    #[ignore = "real-chart microbenchmark; run scripts/benchmark-bandori-medley-score.mjs"]
    fn benchmark_real_song_scores() {
        use std::{hint::black_box, time::Instant};

        #[derive(serde::Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Case {
            label: String,
            song: MedleySongV1,
            skills: [ResolvedScoreSkillV1; 5],
            deck_total_parameter: f64,
            perfect_rate: f64,
            start_combo: u32,
        }
        let path = std::env::var("HHWX_MEDLEY_SCORE_BENCHMARK_INPUT").unwrap();
        let cases: Vec<Case> =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        for case in cases {
            let prepared =
                PreparedSong::new(&case.song, case.start_combo, case.perfect_rate).unwrap();
            let score = || {
                prepared
                    .score_leaders(
                        black_box(case.skills),
                        black_box([case.deck_total_parameter; 5]),
                    )
                    .unwrap()
                    .into_iter()
                    .fold(f64::NEG_INFINITY, f64::max)
            };
            for _ in 0..2_000 {
                black_box(score());
            }
            let mut samples = Vec::with_capacity(7);
            for _ in 0..7 {
                let start = Instant::now();
                for _ in 0..10_000 {
                    black_box(score());
                }
                samples.push(start.elapsed().as_secs_f64() * 1e9 / 10_000.0);
            }
            samples.sort_by(f64::total_cmp);
            let skills = prepared.prepare_skills(case.skills).unwrap();
            let mut window_floors = 0_usize;
            for skill in &skills {
                for slot in 0..6 {
                    let start = prepared.window_starts[slot];
                    for group in &prepared.combo_groups {
                        let first = start.max(group.start);
                        let last = skill.ends[slot].min(group.end);
                        if first >= last {
                            continue;
                        }
                        let varying_end = (start + skill.varying_multipliers.len()).min(last);
                        window_floors += varying_end.saturating_sub(first);
                        window_floors += usize::from(first.max(varying_end) < last);
                    }
                }
            }
            println!(
                "MEDLEY_SCORE_BENCH:{}",
                serde_json::json!({
                    "label": case.label,
                    "scores": prepared.score_leaders(case.skills, [case.deck_total_parameter; 5]).unwrap(),
                    "medianNs": samples[3], "samplesNs": samples,
                    "baseFloors": prepared.combo_groups.len(), "windowFloors": window_floors,
                    "multiplierEvaluations": skills.iter().map(|skill| skill.varying_multipliers.len() + 1).sum::<usize>(),
                })
            );
        }
    }

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
        let mut start_combo = 0_u32;
        for slot in 0..3 {
            let team = &input.teams[slot];
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
