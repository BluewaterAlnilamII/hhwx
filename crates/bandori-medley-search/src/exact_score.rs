use std::collections::BTreeMap;
use std::sync::OnceLock;

use bandori_medley_model::{
    ExactProbabilityV1, MedleySongV1, ResolvedScoreSkillV1, SkillBehaviorV1,
};

const SKILL_ORDER_COUNT: usize = 120;
const PERFECT_RATE: f64 = 1.1;
const GREAT_RATE: f64 = 0.8;

#[derive(Clone, Copy)]
pub(crate) struct ExactTeamScoreInput {
    pub(crate) deck_total_parameter: f64,
    /// Stable scoring order; index two is the leader.
    pub(crate) skills: [ResolvedScoreSkillV1; 5],
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum ExactScoreFailure {
    InvalidSong,
    ArithmeticNonFinite,
    ArithmeticOverflow,
}

#[derive(Clone, Debug)]
pub(crate) struct ExactSongScore {
    pub(crate) average_score: f64,
    #[cfg(test)]
    pub(crate) order_scores: Vec<f64>,
}

#[derive(Clone, Copy)]
struct Activation {
    trigger_time_seconds: f64,
    end_time_seconds: f64,
    skill: ResolvedScoreSkillV1,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
struct ActivationState {
    continued_active: bool,
    rate_up_accumulator_bits: u64,
}

impl Default for ActivationState {
    fn default() -> Self {
        Self {
            continued_active: true,
            rate_up_accumulator_bits: 0.0_f64.to_bits(),
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord)]
struct JudgmentState {
    activations: [ActivationState; 6],
}

#[derive(Clone, Copy, Debug, Default)]
struct WeightedScore {
    probability: f64,
    weighted_score: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Judgment {
    Perfect,
    Great,
}

fn skill_orders() -> &'static [[usize; 5]] {
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
            debug_assert_eq!(output.len(), SKILL_ORDER_COUNT);
            output
        })
        .as_slice()
}

pub(crate) fn exact_probability_to_f64(probability: ExactProbabilityV1) -> f64 {
    let denominator = 10_u64.pow(u32::from(probability.decimal_scale));
    probability.numerator as f64 / denominator as f64
}

fn play_level_rate(play_level: u16) -> f64 {
    1.0 + (f64::from(play_level) - 5.0) / 100.0
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

fn build_base_note_scores(
    song: &MedleySongV1,
    deck_total_parameter: f64,
    start_combo: u32,
) -> Result<Vec<[u32; 2]>, ExactScoreFailure> {
    let note_count =
        u32::try_from(song.notes.len()).map_err(|_| ExactScoreFailure::ArithmeticOverflow)?;
    let level_rate = play_level_rate(song.play_level);
    let multiplied_parameter = deck_total_parameter * level_rate;
    let divided_by_notes = multiplied_parameter / f64::from(note_count);
    let base_score_per_note = divided_by_notes * 3.0;
    if !level_rate.is_finite() || !base_score_per_note.is_finite() || base_score_per_note < 0.0 {
        return Err(ExactScoreFailure::ArithmeticNonFinite);
    }

    let mut scores = Vec::with_capacity(song.notes.len());
    for note_index in 0..note_count {
        let combo = start_combo
            .checked_add(note_index + 1)
            .ok_or(ExactScoreFailure::ArithmeticOverflow)?;
        let note_combo_rate = combo_rate(combo);
        let perfect_corrected = base_score_per_note * PERFECT_RATE;
        let great_corrected = base_score_per_note * GREAT_RATE;
        let perfect_with_combo = perfect_corrected * note_combo_rate;
        let great_with_combo = great_corrected * note_combo_rate;
        scores.push([
            floor_to_u32(perfect_with_combo)?,
            floor_to_u32(great_with_combo)?,
        ]);
    }
    Ok(scores)
}

fn trigger_times(song: &MedleySongV1) -> Result<[f64; 6], ExactScoreFailure> {
    let mut times = [0.0_f64; 6];
    let mut count = 0_usize;
    for note in song.notes.iter().filter(|note| note.is_skill_trigger) {
        let Some(time) = times.get_mut(count) else {
            return Err(ExactScoreFailure::InvalidSong);
        };
        *time = note.time_seconds;
        count += 1;
    }
    if count != times.len() {
        return Err(ExactScoreFailure::InvalidSong);
    }
    Ok(times)
}

fn build_activations(
    team: ExactTeamScoreInput,
    times: &[f64; 6],
    order: [usize; 5],
) -> Result<[Activation; 6], ExactScoreFailure> {
    let positions = [order[0], order[1], order[2], order[3], order[4], 2];
    let mut end_times = [0.0_f64; 6];
    for activation_index in 0..6 {
        let skill = team.skills[positions[activation_index]];
        let end_time = times[activation_index] + skill.duration_seconds + 0.00001;
        if !end_time.is_finite() {
            return Err(ExactScoreFailure::ArithmeticNonFinite);
        }
        end_times[activation_index] = end_time;
    }
    Ok(std::array::from_fn(|activation_index| Activation {
        trigger_time_seconds: times[activation_index],
        end_time_seconds: end_times[activation_index],
        skill: team.skills[positions[activation_index]],
    }))
}

fn base_skill_multiplier(
    skill: ResolvedScoreSkillV1,
    state: &mut ActivationState,
    judgment: Judgment,
) -> f64 {
    let percent_multiplier = |percent: f64| 1.0 + percent / 100.0;
    match skill.behavior {
        SkillBehaviorV1::Neutral => 1.0,
        SkillBehaviorV1::Score { score_up_percent } => percent_multiplier(score_up_percent),
        SkillBehaviorV1::ScoreOnPerfect { score_up_percent } => match judgment {
            Judgment::Perfect => percent_multiplier(score_up_percent),
            Judgment::Great => 1.0,
        },
        SkillBehaviorV1::PerfectOnly { score_up_percent } => match judgment {
            Judgment::Perfect => percent_multiplier(score_up_percent),
            Judgment::Great => 0.0,
        },
        SkillBehaviorV1::ContinuedPerfect {
            active_score_up_percent,
            fallback_score_up_percent,
        } => {
            if judgment == Judgment::Great {
                state.continued_active = false;
            }
            if state.continued_active {
                percent_multiplier(active_score_up_percent)
            } else {
                percent_multiplier(fallback_score_up_percent)
            }
        }
        SkillBehaviorV1::GreatOrWorseHalf { score_up_percent } => match judgment {
            Judgment::Perfect => percent_multiplier(score_up_percent),
            Judgment::Great => 0.5,
        },
    }
}

fn skill_multiplier(
    skill: ResolvedScoreSkillV1,
    state: &mut ActivationState,
    judgment: Judgment,
) -> f64 {
    let mut multiplier = base_skill_multiplier(skill, state, judgment);
    let Some(rate_up) = skill.rate_up_with_perfect else {
        return multiplier;
    };
    let base_bonus_percent = (multiplier - 1.0) * 100.0;
    let accumulator_cap = rate_up.max_score_up_percent - base_bonus_percent;
    let mut accumulator = f64::from_bits(state.rate_up_accumulator_bits);
    if judgment == Judgment::Perfect {
        let incremented = accumulator + rate_up.stack_percent;
        accumulator = incremented.min(accumulator_cap);
        state.rate_up_accumulator_bits = accumulator.to_bits();
    }
    let accumulator_rate = accumulator / 100.0;
    multiplier += accumulator_rate;
    multiplier
}

fn canonicalize_expired_states(
    state: &mut JudgmentState,
    activations: &[Activation; 6],
    note_time_seconds: f64,
) {
    for (activation_index, activation) in activations.iter().enumerate() {
        if note_time_seconds > activation.end_time_seconds {
            state.activations[activation_index] = ActivationState::default();
        }
    }
}

fn score_note(
    song: &MedleySongV1,
    note_index: usize,
    judgment: Judgment,
    base_score: [u32; 2],
    activations: &[Activation; 6],
    state: &mut JudgmentState,
) -> Result<u32, ExactScoreFailure> {
    let note = &song.notes[note_index];
    let inner_score = match judgment {
        Judgment::Perfect => base_score[0],
        Judgment::Great => base_score[1],
    };
    let mut combined_multiplier = 1.0_f64;
    for (activation_index, activation) in activations.iter().enumerate() {
        if note.time_seconds <= activation.trigger_time_seconds
            || note.time_seconds > activation.end_time_seconds
        {
            continue;
        }
        let multiplier = skill_multiplier(
            activation.skill,
            &mut state.activations[activation_index],
            judgment,
        );
        let additive_delta = multiplier - 1.0;
        combined_multiplier += additive_delta;
    }
    combined_multiplier = combined_multiplier.max(0.0);
    let with_skill = f64::from(inner_score) * combined_multiplier;
    floor_to_u32(with_skill)
}

fn merge_branch(
    next: &mut BTreeMap<JudgmentState, WeightedScore>,
    state: JudgmentState,
    previous: WeightedScore,
    branch_probability: f64,
    note_score: u32,
) {
    if branch_probability == 0.0 {
        return;
    }
    let weighted_probability = previous.probability * branch_probability;
    let carried_score = previous.weighted_score * branch_probability;
    let branch_score = weighted_probability * f64::from(note_score);
    let entry = next.entry(state).or_default();
    entry.probability += weighted_probability;
    entry.weighted_score += carried_score + branch_score;
}

fn score_one_order(
    song: &MedleySongV1,
    team: ExactTeamScoreInput,
    times: &[f64; 6],
    order: [usize; 5],
    base_scores: &[[u32; 2]],
    perfect_rate: f64,
) -> Result<f64, ExactScoreFailure> {
    let activations = build_activations(team, times, order)?;
    let mut states = BTreeMap::from([(
        JudgmentState::default(),
        WeightedScore {
            probability: 1.0,
            weighted_score: 0.0,
        },
    )]);

    for (note_index, base_score) in base_scores.iter().copied().enumerate() {
        let mut next = BTreeMap::new();
        for (mut state, weighted) in states {
            canonicalize_expired_states(
                &mut state,
                &activations,
                song.notes[note_index].time_seconds,
            );
            for judgment in [Judgment::Perfect, Judgment::Great] {
                let probability = match judgment {
                    Judgment::Perfect => perfect_rate,
                    Judgment::Great => 1.0_f64 - perfect_rate,
                };
                if probability == 0.0 {
                    continue;
                }
                let mut branch_state = state;
                let note_score = score_note(
                    song,
                    note_index,
                    judgment,
                    base_score,
                    &activations,
                    &mut branch_state,
                )?;
                merge_branch(&mut next, branch_state, weighted, probability, note_score);
            }
        }
        states = next;
    }

    let expected_score = states
        .values()
        .fold(0.0_f64, |sum, state| sum + state.weighted_score);
    if !expected_score.is_finite() || expected_score < 0.0 {
        return Err(ExactScoreFailure::ArithmeticNonFinite);
    }
    Ok(expected_score)
}

pub(crate) fn score_song(
    song: &MedleySongV1,
    team: ExactTeamScoreInput,
    start_combo: u32,
    perfect_rate: f64,
) -> Result<ExactSongScore, ExactScoreFailure> {
    let base_scores = build_base_note_scores(song, team.deck_total_parameter, start_combo)?;
    let times = trigger_times(song)?;
    let mut average_accumulator = 0.0_f64;
    #[cfg(test)]
    let mut order_scores = Vec::with_capacity(SKILL_ORDER_COUNT);
    for order in skill_orders() {
        let score = score_one_order(song, team, &times, *order, &base_scores, perfect_rate)?;
        average_accumulator += score;
        #[cfg(test)]
        order_scores.push(score);
    }
    let average_score = average_accumulator / SKILL_ORDER_COUNT as f64;
    Ok(ExactSongScore {
        average_score,
        #[cfg(test)]
        order_scores,
    })
}

#[cfg(test)]
mod tests {
    use bandori_medley_model::{
        FixedMedleyEvaluationInputV1, RateUpWithPerfectV1, SkillBehaviorV1,
    };
    use bandori_medley_reference::evaluate_fixed_medley;

    use super::*;

    const FIXTURE: &str =
        include_str!("../../bandori-medley-model/tests/fixtures/valid-fixed-medley-v1.json");

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
                reference.songs[slot].average_score().to_bits(),
            );
            assert_eq!(production.order_scores.len(), SKILL_ORDER_COUNT);
            for (actual, expected) in production
                .order_scores
                .iter()
                .zip(&reference.songs[slot].permutation_expected_score_bits)
            {
                assert_eq!(actual.to_bits(), expected.to_f64().to_bits());
            }
            start_combo +=
                u32::try_from(input.songs[slot].notes.len()).expect("fixture note count fits u32");
        }
    }

    #[test]
    fn production_song_scores_match_reference_bits() {
        let input: FixedMedleyEvaluationInputV1 =
            serde_json::from_str(FIXTURE).expect("fixed fixture decodes");
        assert_reference_parity(&input);
    }

    #[test]
    fn stateful_and_negative_overlap_behaviors_match_reference_bits() {
        let mut input: FixedMedleyEvaluationInputV1 =
            serde_json::from_str(FIXTURE).expect("fixed fixture decodes");
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
        for (instance_id, behavior) in team.member_instance_ids.into_iter().zip(behaviors) {
            let skill = &mut input.cards[instance_id as usize].skill;
            skill.duration_seconds = 10.0;
            skill.behavior = behavior;
            skill.rate_up_with_perfect = None;
        }
        input.cards[team.member_instance_ids[2] as usize]
            .skill
            .rate_up_with_perfect = Some(RateUpWithPerfectV1 {
            stack_percent: 0.5,
            max_score_up_percent: 110.0,
        });
        assert_reference_parity(&input);
    }
}
