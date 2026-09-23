//! One-team search using the medley roster, parameter, and window foundations.
use std::collections::BTreeMap;

use bandori_medley_model::{ExactProbabilityV1, MedleySongV1, ResolvedScoreSkillV1};
use serde::{Deserialize, Serialize};

use crate::candidate::{member_order_for_leader, resolved_skill};
use crate::exact_score::{PreparedSong, exact_probability_to_f64};
use crate::parameters::{TeamParameterTrace, calculate_team_parameters};
use crate::single_event::SingleEventRuleV1;
use crate::single_score::{SingleScoreDetailsV1, SingleWindows};
use crate::single_upper::{SingleUpper, SingleUpperShared};
use crate::{
    AreaItemConfigurationV1, SearchAreaItemV1, SearchCardV1, SearchControl, SearchError,
    SearchErrorCode, SearchIncompleteReasonV1, SearchStopReason,
};

pub const SINGLE_INPUT_VERSION: &str = "hhwx-single-search-input-v1";
pub const SINGLE_RULES_VERSION: &str = "hhwx-single-medley-foundation-v5";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SingleTargetV1 {
    Score,
    EventPoint,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SingleSearchInputV1 {
    pub schema_version: String,
    pub scoring_rules_version: String,
    pub perfect_rate: ExactProbabilityV1,
    pub cards: Vec<SearchCardV1>,
    pub area_items: Vec<SearchAreaItemV1>,
    pub area_configurations: Vec<AreaItemConfigurationV1>,
    pub song: MedleySongV1,
    pub fever: Vec<bool>,
    pub point_bonus_rates: Vec<f64>,
    pub support_powers: Vec<f64>,
    pub mission_support: bool,
    pub event_rule: SingleEventRuleV1,
    pub target: SingleTargetV1,
    pub other_skills: Option<[ResolvedScoreSkillV1; 4]>,
    pub encore_actor: usize,
    pub other_players_power: f64,
    pub min_leader_score_up_percent: f64,
    pub min_total_power: f64,
    pub result_limit: usize,
}

impl SingleSearchInputV1 {
    pub fn validate(&self) -> Result<(), SearchError> {
        let invalid = |path: &str, message: &str| {
            SearchError::new(SearchErrorCode::InvalidCard, path, message)
        };
        if self.schema_version != SINGLE_INPUT_VERSION
            || self.scoring_rules_version != SINGLE_RULES_VERSION
        {
            return Err(SearchError::new(
                SearchErrorCode::UnsupportedSchema,
                "schemaVersion",
                "unsupported single-song input or scoring version",
            ));
        }
        if !crate::validation::validate_probability(self.perfect_rate) {
            return Err(invalid(
                "perfectRate",
                "expected canonical probability within 0..1",
            ));
        }
        crate::validation::validate_roster(
            &self.cards,
            &self.area_items,
            &self.area_configurations,
        )?;
        crate::validation::validate_song(&self.song, 0)?;
        if self.fever.len() != self.song.notes.len()
            || self.point_bonus_rates.len() != self.cards.len()
            || self.support_powers.len() != self.cards.len()
        {
            return Err(invalid(
                "cards",
                "parallel arrays must match their source lengths",
            ));
        }
        if self
            .point_bonus_rates
            .iter()
            .chain(&self.support_powers)
            .chain([
                &self.other_players_power,
                &self.min_total_power,
                &self.min_leader_score_up_percent,
            ])
            .any(|x| !x.is_finite() || *x < 0.0)
            || !self.event_rule.valid()
        {
            return Err(invalid(
                "parameters",
                "values must be finite and non-negative; event divisor must be positive",
            ));
        }
        if !(1..=50).contains(&self.result_limit)
            || self.encore_actor > 4
            || (self.other_skills.is_none()
                && (self.encore_actor != 0 || self.other_players_power != 0.0))
        {
            return Err(invalid(
                "resultLimit",
                "invalid result limit or cooperative settings",
            ));
        }
        if let Some(skills) = self.other_skills {
            for (i, skill) in skills.into_iter().enumerate() {
                crate::validation::validate_skill(skill, &format!("otherSkills[{i}]"))?;
            }
        }
        Ok(())
    }
}

pub fn decode_single_search_input_json(json: &str) -> Result<SingleSearchInputV1, SearchError> {
    let input: SingleSearchInputV1 =
        serde_json::from_str(json).map_err(|e| SearchError::decode_failed(e.to_string()))?;
    input.validate()?;
    Ok(input)
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SingleSearchSolutionV1 {
    pub configuration_index: usize,
    pub member_instance_ids: [u32; 5],
    pub player_formation: Option<[usize; 5]>,
    pub average_score: f64,
    pub target_value: f64,
    pub room_score: Option<f64>,
    pub event_point_base: Option<f64>,
    pub card_power: f64,
    pub area_item_power: f64,
    pub event_power: f64,
    pub total_power: f64,
    pub point_bonus_rate: f64,
    pub support_power: f64,
    pub support_instance_ids: Vec<u32>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SingleSearchDiagnosticsV1 {
    pub partial_nodes: u64,
    pub pruned_nodes: u64,
    pub evaluated_teams: u64,
    pub configurations_completed: usize,
    pub unknown_bounds: u64,
    pub estimated_search_storage_bytes: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(
    tag = "status",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum SingleSearchOutcomeV1 {
    Exact {
        best: Option<SingleSearchSolutionV1>,
        discovered: Vec<SingleSearchSolutionV1>,
        diagnostics: SingleSearchDiagnosticsV1,
    },
    Incomplete {
        reason: SearchIncompleteReasonV1,
        best_so_far: Option<SingleSearchSolutionV1>,
        discovered: Vec<SingleSearchSolutionV1>,
        diagnostics: SingleSearchDiagnosticsV1,
    },
}

impl SingleSearchOutcomeV1 {
    pub fn solutions(&self) -> &[SingleSearchSolutionV1] {
        match self {
            Self::Exact { discovered, .. } | Self::Incomplete { discovered, .. } => discovered,
        }
    }
}

fn compare(left: &SingleSearchSolutionV1, right: &SingleSearchSolutionV1) -> std::cmp::Ordering {
    right
        .target_value
        .total_cmp(&left.target_value)
        .then_with(|| right.average_score.total_cmp(&left.average_score))
        .then_with(|| right.total_power.total_cmp(&left.total_power))
        .then_with(|| left.member_instance_ids.cmp(&right.member_instance_ids))
        .then_with(|| left.player_formation.cmp(&right.player_formation))
        .then_with(|| left.configuration_index.cmp(&right.configuration_index))
}

fn support_selection(input: &SingleSearchInputV1, members: [u32; 5]) -> (f64, Vec<u32>) {
    if !input.mission_support {
        return (0.0, Vec::new());
    }
    let mut by_character = BTreeMap::new();
    for card in &input.cards {
        if card.is_excluded || members.contains(&card.instance_id) {
            continue;
        }
        let entry = by_character
            .entry(card.character_id)
            .or_insert(card.instance_id);
        let power = input.support_powers[card.instance_id as usize];
        if power > input.support_powers[*entry as usize]
            || (power == input.support_powers[*entry as usize] && card.instance_id < *entry)
        {
            *entry = card.instance_id;
        }
    }
    let mut candidates: Vec<u32> = by_character.into_values().collect();
    candidates.sort_unstable_by(|a, b| {
        input.support_powers[*b as usize]
            .total_cmp(&input.support_powers[*a as usize])
            .then_with(|| a.cmp(b))
    });
    candidates.truncate(5);
    (
        candidates
            .iter()
            .map(|&id| input.support_powers[id as usize])
            .sum(),
        candidates,
    )
}

fn team_windows<'a>(
    input: &SingleSearchInputV1,
    song: &PreparedSong<'a>,
    ids: [u32; 5],
    power: f64,
) -> Result<SingleWindows, SearchIncompleteReasonV1> {
    let cards = ids.map(|i| &input.cards[i as usize]);
    let same_band = cards.iter().all(|c| c.band_id == cards[0].band_id);
    let same_attribute = cards.iter().all(|c| c.attribute == cards[0].attribute);
    let skills = cards.map(|c| resolved_skill(c, same_band, same_attribute));
    SingleWindows::new(
        song,
        skills,
        power,
        input.other_skills,
        input.encore_actor,
        input.min_leader_score_up_percent,
    )
    .map_err(|_| SearchIncompleteReasonV1::ArithmeticOverflow)
}

fn leader_parameters(
    input: &SingleSearchInputV1,
    configuration: usize,
    ids: [u32; 5],
) -> Result<Vec<TeamParameterTrace>, SearchIncompleteReasonV1> {
    ids.into_iter()
        .map(|leader| {
            let order = member_order_for_leader(ids, leader)
                .map_err(|_| SearchIncompleteReasonV1::InvalidData)?;
            calculate_team_parameters(
                &input.cards,
                &input.area_items,
                &input.area_configurations[configuration],
                order,
            )
            .map_err(|_| SearchIncompleteReasonV1::ArithmeticOverflow)
        })
        .collect()
}

fn evaluate(
    input: &SingleSearchInputV1,
    song: &PreparedSong<'_>,
    configuration_index: usize,
    mut ids: [u32; 5],
) -> Result<Option<SingleSearchSolutionV1>, SearchIncompleteReasonV1> {
    ids.sort_unstable();
    let parameters = leader_parameters(input, configuration_index, ids)?;
    let bonus = (ids
        .iter()
        .map(|&id| input.point_bonus_rates[id as usize])
        .sum::<f64>()
        * 100.0)
        .round()
        / 100.0;
    let (support_power, support_instance_ids) = support_selection(input, ids);
    let mut best = None;
    for (group, parameter) in parameters.iter().enumerate() {
        let power = parameter.deck_total_parameter;
        if power < input.min_total_power
            || parameters[..group]
                .iter()
                .any(|p| p.deck_total_parameter == power)
        {
            continue;
        }
        let mut windows = team_windows(input, song, ids, power)?;
        windows.restrict_leaders(std::array::from_fn(|i| {
            parameters[i].deck_total_parameter == power
        }));
        for score in windows.scores() {
            let params = parameters[score.formation[2]];
            let room = score
                .room_rate
                .map(|rate| (score.average + rate * input.other_players_power + 1e-5).floor());
            let points = input
                .event_rule
                .points(score.average, room, bonus, support_power);
            let target = if input.target == SingleTargetV1::EventPoint {
                points.unwrap_or(score.average)
            } else {
                score.average
            };
            if !target.is_finite()
                || !score.average.is_finite()
                || points.is_some_and(|v| !v.is_finite())
                || room.is_some_and(|v| !v.is_finite())
                || !bonus.is_finite()
                || !support_power.is_finite()
            {
                return Err(SearchIncompleteReasonV1::ArithmeticOverflow);
            }
            let value = SingleSearchSolutionV1 {
                configuration_index,
                member_instance_ids: score.formation.map(|i| ids[i]),
                player_formation: score.player_formation,
                average_score: score.average,
                target_value: target,
                room_score: room,
                event_point_base: points,
                card_power: params.card_power,
                area_item_power: params.area_item_power,
                event_power: params.event_power,
                total_power: params.deck_total_parameter,
                point_bonus_rate: bonus,
                support_power,
                support_instance_ids: support_instance_ids.clone(),
            };
            if best.as_ref().is_none_or(|old| compare(&value, old).is_lt()) {
                best = Some(value);
            }
        }
    }
    Ok(best)
}

/// Recompute retained teams before exposing detailed order/probability results.
pub fn hydrate_single_search_solutions(
    input: &SingleSearchInputV1,
    solutions: &[SingleSearchSolutionV1],
) -> Result<Vec<SingleScoreDetailsV1>, SearchIncompleteReasonV1> {
    let song = PreparedSong::single(
        &input.song,
        exact_probability_to_f64(input.perfect_rate),
        &input.fever,
    )
    .map_err(|_| SearchIncompleteReasonV1::InvalidData)?;
    solutions
        .iter()
        .map(|solution| {
            if solution.configuration_index >= input.area_configurations.len()
                || solution
                    .member_instance_ids
                    .iter()
                    .any(|&id| id as usize >= input.cards.len())
            {
                return Err(SearchIncompleteReasonV1::InvalidData);
            }
            let actual = evaluate(
                input,
                &song,
                solution.configuration_index,
                solution.member_instance_ids,
            )?;
            if actual.as_ref() != Some(solution) {
                return Err(SearchIncompleteReasonV1::ScorerDisagreement);
            }
            let mut ids = solution.member_instance_ids;
            ids.sort_unstable();
            let expected = solution.member_instance_ids.map(|id| {
                ids.iter()
                    .position(|&i| i == id)
                    .expect("member belongs to team")
            });
            let parameters = leader_parameters(input, solution.configuration_index, ids)?;
            let mut details: Option<SingleScoreDetailsV1> = None;
            for (group, parameter) in parameters.iter().enumerate() {
                let power = parameter.deck_total_parameter;
                if power < input.min_total_power
                    || parameters[..group]
                        .iter()
                        .any(|p| p.deck_total_parameter == power)
                {
                    continue;
                }
                let mut windows = team_windows(input, &song, ids, power)?;
                if !windows.restrict_leaders(std::array::from_fn(|i| {
                    parameters[i].deck_total_parameter == power
                })) {
                    continue;
                }
                let candidate = windows.details(ids, expected, solution.player_formation);
                if let Some(current) = &mut details {
                    current.merge(candidate);
                } else {
                    details = Some(candidate);
                }
            }
            details.ok_or(SearchIncompleteReasonV1::ScorerDisagreement)
        })
        .collect()
}

struct Search<'a, 'control> {
    input: &'a SingleSearchInputV1,
    song: PreparedSong<'a>,
    control: &'a mut SearchControl<'control, SingleSearchSolutionV1>,
    groups: Vec<Vec<u32>>,
    discovered: Vec<SingleSearchSolutionV1>,
    diagnostics: SingleSearchDiagnosticsV1,
}

impl Search<'_, '_> {
    fn visit(
        &mut self,
        config: usize,
        upper: Option<&SingleUpper>,
        group: usize,
        members: &mut Vec<u32>,
    ) -> Result<(), SearchIncompleteReasonV1> {
        self.diagnostics.partial_nodes += 1;
        if self.diagnostics.partial_nodes.is_multiple_of(256) {
            self.poll()?;
        }
        let needed = 5 - members.len();
        if self.groups.len() - group < needed {
            return Ok(());
        }
        // ponytail: prove the best result; global top N would require a kth-result threshold.
        if let Some(upper) = upper {
            let bound = upper.bound(self.input, group, members);
            if bound == f64::NEG_INFINITY
                || (bound.is_finite()
                    && self
                        .discovered
                        .first()
                        .is_some_and(|best| bound < best.target_value))
            {
                self.diagnostics.pruned_nodes += 1;
                return Ok(());
            } else if !bound.is_finite() {
                self.diagnostics.unknown_bounds += 1;
            } else if self.discovered.first().is_some_and(|best| {
                upper.bonus_bound(self.input, group, members) < best.target_value
            }) {
                self.diagnostics.pruned_nodes += 1;
                return Ok(());
            }
        }
        if needed == 0 {
            self.poll()?;
            self.diagnostics.evaluated_teams += 1;
            let ids: [u32; 5] = members
                .as_slice()
                .try_into()
                .expect("complete five-card team");
            if let Some(value) = evaluate(self.input, &self.song, config, ids)? {
                let improved = self
                    .discovered
                    .first()
                    .is_none_or(|old| value.target_value > old.target_value);
                let mut key = value.member_instance_ids;
                key.sort_unstable();
                if let Some(index) = self.discovered.iter().position(|r| {
                    let mut k = r.member_instance_ids;
                    k.sort_unstable();
                    k == key
                }) {
                    if !compare(&value, &self.discovered[index]).is_lt() {
                        return Ok(());
                    }
                    self.discovered.remove(index);
                }
                self.discovered.push(value.clone());
                self.discovered.sort_by(compare);
                self.discovered.truncate(self.input.result_limit);
                if improved {
                    self.control.report_strict_improvement(&value);
                }
            }
            return Ok(());
        }
        for g in group..=self.groups.len() - needed {
            for c in 0..self.groups[g].len() {
                members.push(self.groups[g][c]);
                self.visit(config, upper, g + 1, members)?;
                members.pop();
            }
        }
        Ok(())
    }

    fn poll(&mut self) -> Result<(), SearchIncompleteReasonV1> {
        match self.control.poll_stop() {
            Some(SearchStopReason::Cancelled) => Err(SearchIncompleteReasonV1::Cancelled),
            Some(SearchStopReason::TimedOut) => Err(SearchIncompleteReasonV1::TimedOut),
            None => Ok(()),
        }
    }
}

pub fn search_single(
    input: &SingleSearchInputV1,
    control: &mut SearchControl<'_, SingleSearchSolutionV1>,
) -> SingleSearchOutcomeV1 {
    let early = |reason| SingleSearchOutcomeV1::Incomplete {
        reason,
        best_so_far: None,
        discovered: Vec::new(),
        diagnostics: SingleSearchDiagnosticsV1::default(),
    };
    if input.validate().is_err() {
        return early(SearchIncompleteReasonV1::InvalidData);
    }
    let mut groups = BTreeMap::<u32, Vec<u32>>::new();
    for card in &input.cards {
        if !card.is_excluded {
            groups
                .entry(card.character_id)
                .or_default()
                .push(card.instance_id);
        }
    }
    let groups: Vec<_> = groups.into_values().collect();
    let estimate = input
        .cards
        .len()
        .saturating_mul(2048)
        .saturating_add(input.song.notes.len().saturating_mul(256))
        .saturating_add(input.result_limit * 8192)
        // Includes the shared formation map and per-team queued-window cache
        // (at most 5 leaders * 120 orders * 6 windows).
        .saturating_add(1024 * 1024)
        .saturating_add(SingleUpper::extra_storage(input, groups.len()));
    if estimate > control.memory_budget_bytes() {
        return early(SearchIncompleteReasonV1::MemoryExhausted);
    }
    let Ok(song) = PreparedSong::single(
        &input.song,
        exact_probability_to_f64(input.perfect_rate),
        &input.fever,
    ) else {
        return early(SearchIncompleteReasonV1::InvalidData);
    };
    let mut search = Search {
        input,
        song,
        control,
        groups,
        discovered: Vec::new(),
        diagnostics: SingleSearchDiagnosticsV1 {
            estimated_search_storage_bytes: estimate,
            ..Default::default()
        },
    };
    let mut reason = None;
    let mut shared_upper = None;
    for config in 0..input.area_configurations.len() {
        if let Err(stop) = search.poll() {
            reason = Some(stop);
            break;
        }
        if config == 0 {
            shared_upper = SingleUpperShared::new(input, &search.groups).ok();
        }
        let upper = shared_upper
            .as_ref()
            .and_then(|shared| SingleUpper::new(input, config, &search.groups, shared).ok());
        if let Some(bound) = &upper {
            for group in &mut search.groups {
                group.sort_by(|a, b| {
                    bound
                        .traversal(*b)
                        .total_cmp(&bound.traversal(*a))
                        .then_with(|| a.cmp(b))
                });
            }
        }
        if let Err(stop) = search.visit(config, upper.as_ref(), 0, &mut Vec::with_capacity(5)) {
            reason = Some(stop);
            break;
        }
        search.diagnostics.configurations_completed += 1;
    }
    let best = search.discovered.first().cloned();
    if let Some(reason) = reason {
        SingleSearchOutcomeV1::Incomplete {
            reason,
            best_so_far: best,
            discovered: search.discovered,
            diagnostics: search.diagnostics,
        }
    } else {
        SingleSearchOutcomeV1::Exact {
            best,
            discovered: search.discovered,
            diagnostics: search.diagnostics,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{CardAttributeV1, SearchCardSkillContextsV1};
    use bandori_medley_model::{DifficultyV1, ScoringNoteV1, SkillBehaviorV1};

    fn input(seed: u32, multi: bool, points: bool) -> SingleSearchInputV1 {
        let skill = |id, boosted| ResolvedScoreSkillV1 {
            master_skill_id: id + 1,
            skill_level: 1,
            duration_seconds: 2.0 + f64::from(id % 4) * 0.5,
            behavior: match id % 6 {
                0 => SkillBehaviorV1::PerfectOnly {
                    score_up_percent: 120.0,
                },
                1 => SkillBehaviorV1::ContinuedPerfect {
                    active_score_up_percent: 160.0,
                    fallback_score_up_percent: 80.0,
                },
                2 => SkillBehaviorV1::GreatOrWorseHalf {
                    score_up_percent: 100.0,
                },
                3 => SkillBehaviorV1::ScoreOnPerfect {
                    score_up_percent: 120.0,
                },
                _ => SkillBehaviorV1::Score {
                    score_up_percent: if boosted {
                        170.0
                    } else {
                        70.0 + f64::from(id % 4) * 10.0
                    },
                },
            },
            is_rate_up_with_perfect: id % 6 == 5,
        };
        SingleSearchInputV1 {
            schema_version: SINGLE_INPUT_VERSION.into(),
            scoring_rules_version: SINGLE_RULES_VERSION.into(),
            perfect_rate: ExactProbabilityV1 {
                numerator: 73,
                decimal_scale: 2,
            },
            cards: (0..8)
                .map(|id| SearchCardV1 {
                    instance_id: id,
                    master_card_id: id + 1,
                    character_id: if id == 7 { 1 } else { id + 1 },
                    band_id: 1 + id % 2,
                    attribute: if id % 2 == 0 {
                        CardAttributeV1::Pure
                    } else {
                        CardAttributeV1::Happy
                    },
                    is_excluded: false,
                    character_parameter: [
                        1234.5 + f64::from((id * 113 + seed * 137) % 1700),
                        512.7,
                        300.2,
                    ],
                    event_parameter: [f64::from(id * 3), 0.5, 0.7],
                    skill_contexts: SearchCardSkillContextsV1 {
                        mixed: skill(id, false),
                        same_band: skill(id, true),
                        same_attribute: skill(id, true),
                        same_band_and_attribute: skill(id, true),
                    },
                })
                .collect(),
            area_items: vec![SearchAreaItemV1 {
                area_item_id: 1,
                target_band_ids: vec![1],
                target_attributes: vec![CardAttributeV1::Pure],
                parameter_rates: [0.2, 0.1, 0.3],
            }],
            area_configurations: vec![
                AreaItemConfigurationV1 {
                    selected_area_item_ids: vec![],
                },
                AreaItemConfigurationV1 {
                    selected_area_item_ids: vec![1],
                },
            ],
            song: MedleySongV1 {
                slot: 0,
                song_id: 1,
                difficulty: DifficultyV1::Expert,
                play_level: 27,
                notes: (0..48)
                    .map(|n| ScoringNoteV1 {
                        note_id: n,
                        time_seconds: f64::from(n) * 0.3,
                        is_skill_trigger: n % 8 == 0,
                    })
                    .collect(),
            },
            fever: (0..48).map(|n| (20..35).contains(&n)).collect(),
            point_bonus_rates: (0..8)
                .map(|n| {
                    if points {
                        f64::from((n + seed) % 5) / 10.0
                    } else {
                        0.0
                    }
                })
                .collect(),
            support_powers: (0..8)
                .map(|n| f64::from((n * 73 + seed * 115) % 9) * 25000.0)
                .collect(),
            mission_support: points,
            event_rule: if points {
                SingleEventRuleV1::Normal {
                    base: 40.0,
                    divisor: 10000.0,
                    formula: (seed % 3) as u8,
                }
            } else {
                SingleEventRuleV1::None
            },
            target: if points {
                SingleTargetV1::EventPoint
            } else {
                SingleTargetV1::Score
            },
            other_skills: multi.then_some([
                skill(1, false),
                skill(3, false),
                skill(4, true),
                skill(5, false),
            ]),
            encore_actor: if multi { (seed % 5) as usize } else { 0 },
            other_players_power: if multi { 152_000.0 } else { 0.0 },
            min_leader_score_up_percent: 100.0,
            min_total_power: 0.0,
            result_limit: 5,
        }
    }

    #[test]
    fn parameter_accumulation_matches_medley_for_each_leader_and_hydrates() {
        let mut input = input(0, false, false);
        input.cards.truncate(5);
        input.point_bonus_rates.truncate(5);
        input.support_powers.truncate(5);
        input.area_configurations = vec![AreaItemConfigurationV1 {
            selected_area_item_ids: vec![],
        }];
        for (i, power) in [
            67793.21999999999,
            75863.68,
            83934.13999999998,
            12904.599999999999,
            20975.059999999998,
        ]
        .into_iter()
        .enumerate()
        {
            input.cards[i].character_parameter = [power, 0.0, 0.0];
            input.cards[i].event_parameter = [0.0; 3];
        }
        let ids = [0, 1, 2, 3, 4];
        let parameters = leader_parameters(&input, 0, ids).unwrap();
        assert_ne!(
            parameters[0].deck_total_parameter,
            parameters[2].deck_total_parameter
        );
        let song = PreparedSong::single(&input.song, 0.73, &input.fever).unwrap();
        for (leader, parameter) in parameters.iter().enumerate() {
            for (i, card) in input.cards.iter_mut().enumerate() {
                let mut skill = card.skill_contexts.mixed;
                skill.behavior = SkillBehaviorV1::Score {
                    score_up_percent: if i == leader { 150.0 } else { 0.0 },
                };
                skill.is_rate_up_with_perfect = false;
                card.skill_contexts = SearchCardSkillContextsV1 {
                    mixed: skill,
                    same_band: skill,
                    same_attribute: skill,
                    same_band_and_attribute: skill,
                };
            }
            let solution = evaluate(&input, &song, 0, ids).unwrap().unwrap();
            assert_eq!(solution.member_instance_ids[2], leader as u32);
            assert_eq!(
                solution.total_power.to_bits(),
                parameter.deck_total_parameter.to_bits()
            );
            assert!(hydrate_single_search_solutions(&input, &[solution]).is_ok());
        }
    }

    #[test]
    fn shared_upper_preserves_bits_across_configurations_and_card_orders() {
        for multi in [false, true] {
            for points in [false, true] {
                let input = input(5, multi, points);
                let mut groups = vec![
                    vec![0, 7],
                    vec![1],
                    vec![2],
                    vec![3],
                    vec![4],
                    vec![5],
                    vec![6],
                ];
                let shared = SingleUpperShared::new(&input, &groups).unwrap();
                for config in 0..input.area_configurations.len() {
                    groups[0].reverse();
                    let fresh = SingleUpperShared::new(&input, &groups).unwrap();
                    let reused = SingleUpper::new(&input, config, &groups, &shared).unwrap();
                    let rebuilt = SingleUpper::new(&input, config, &groups, &fresh).unwrap();
                    for id in 0..input.cards.len() as u32 {
                        assert_eq!(
                            reused.traversal(id).to_bits(),
                            rebuilt.traversal(id).to_bits()
                        );
                    }
                    for count in 0..=5 {
                        let fixed: Vec<_> = (0..count as u32).collect();
                        assert_eq!(
                            reused.bound(&input, count, &fixed).to_bits(),
                            rebuilt.bound(&input, count, &fixed).to_bits()
                        );
                        assert_eq!(
                            reused.bonus_bound(&input, count, &fixed).to_bits(),
                            rebuilt.bonus_bound(&input, count, &fixed).to_bits()
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn weighted_search_and_every_partial_bound_agree_with_complete_enumeration() {
        for seed in 0..6 {
            for multi in [false, true] {
                for points in [false, true] {
                    let input = input(seed, multi, points);
                    let mut poll = || None;
                    let outcome =
                        search_single(&input, &mut SearchControl::new(64 * 1024 * 1024, &mut poll));
                    let SingleSearchOutcomeV1::Exact { best, .. } = &outcome else {
                        panic!("{outcome:?}")
                    };
                    let song = PreparedSong::single(&input.song, 0.73, &input.fever).unwrap();
                    let groups = vec![
                        vec![0, 7],
                        vec![1],
                        vec![2],
                        vec![3],
                        vec![4],
                        vec![5],
                        vec![6],
                    ];
                    let mut all = Vec::new();
                    let shared = SingleUpperShared::new(&input, &groups).unwrap();
                    for config in 0..input.area_configurations.len() {
                        let upper = SingleUpper::new(&input, config, &groups, &shared).unwrap();
                        for a in 0..8 {
                            for b in a + 1..8 {
                                for c in b + 1..8 {
                                    for d in c + 1..8 {
                                        for e in d + 1..8 {
                                            let ids = [a, b, c, d, e];
                                            if ids.contains(&0) && ids.contains(&7) {
                                                continue;
                                            }
                                            let Some(value) =
                                                evaluate(&input, &song, config, ids).unwrap()
                                            else {
                                                continue;
                                            };
                                            let mut ordered = ids.to_vec();
                                            ordered.sort_by_key(|&id| if id == 7 { 0 } else { id });
                                            for depth in 0..=5 {
                                                let fixed = &ordered[..depth];
                                                let group = fixed.last().map_or(0, |&id| {
                                                    if id == 7 { 1 } else { id as usize + 1 }
                                                });
                                                assert!(
                                                    upper.bound(&input, group, fixed)
                                                        >= value.target_value,
                                                    "seed {seed} multi {multi} points {points} depth {depth}"
                                                );
                                                assert!(
                                                    upper.bonus_bound(&input, group, fixed)
                                                        >= value.target_value,
                                                    "bonus: seed {seed} multi {multi} points {points} depth {depth}"
                                                );
                                            }
                                            all.push(value);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    all.sort_by(compare);
                    assert_eq!(best.as_ref(), all.first());
                    let details =
                        hydrate_single_search_solutions(&input, outcome.solutions()).unwrap();
                    for (solution, detail) in outcome.solutions().iter().zip(details) {
                        assert!(detail.minimum_score <= solution.average_score);
                        assert!(detail.maximum_score >= solution.average_score);
                        assert!(detail.maximum_probability_numerator > 0);
                        assert!(
                            detail.maximum_probability_numerator
                                <= detail.maximum_probability_denominator
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn bonus_conditioned_bounds_cover_rounding_bins_and_fallbacks() {
        let groups = vec![
            vec![0, 7],
            vec![1],
            vec![2],
            vec![3],
            vec![4],
            vec![5],
            vec![6],
        ];
        for edge in [0.005_f64, 1.0 / 32.0, 0.5] {
            for bonus in [edge.next_down(), edge, edge.next_up()] {
                let mut input = input(5, true, true);
                input.point_bonus_rates = (0..8)
                    .map(|id| if id % 2 == 0 { bonus } else { 0.0 })
                    .collect();
                let shared = SingleUpperShared::new(&input, &groups).unwrap();
                let upper = SingleUpper::new(&input, 1, &groups, &shared).unwrap();
                let song = PreparedSong::single(&input.song, 0.73, &input.fever).unwrap();
                for mask in 0..256_u32 {
                    if mask.count_ones() != 5 || mask & 129 == 129 {
                        continue;
                    }
                    let ids: [u32; 5] = (0..8)
                        .filter(|id| mask & (1 << id) != 0)
                        .collect::<Vec<_>>()
                        .try_into()
                        .unwrap();
                    let Some(team) = evaluate(&input, &song, 1, ids).unwrap() else {
                        continue;
                    };
                    let mut ordered = ids.to_vec();
                    ordered.sort_by_key(|&id| if id == 7 { 0 } else { id });
                    for depth in 0..=5 {
                        let fixed = &ordered[..depth];
                        let group = fixed
                            .last()
                            .map_or(0, |&id| if id == 7 { 1 } else { id as usize + 1 });
                        assert!(upper.bonus_bound(&input, group, fixed) >= team.target_value);
                    }
                }
            }
        }
        for bonus in [0.0, 1.0, f64::MAX] {
            let mut input = input(5, true, true);
            input.point_bonus_rates.fill(bonus);
            assert_eq!(SingleUpper::extra_storage(&input, groups.len()), 0);
            if bonus != f64::MAX {
                let shared = SingleUpperShared::new(&input, &groups).unwrap();
                let upper = SingleUpper::new(&input, 0, &groups, &shared).unwrap();
                assert_eq!(upper.bonus_bound(&input, 0, &[]), f64::INFINITY);
            }
        }
        let input = input(5, true, true);
        let mut poll = || None;
        let SingleSearchOutcomeV1::Exact { diagnostics, .. } =
            search_single(&input, &mut SearchControl::new(64 * 1024 * 1024, &mut poll))
        else {
            panic!("expected a complete tiny search");
        };
        let estimated = diagnostics.estimated_search_storage_bytes;
        assert!(matches!(
            search_single(&input, &mut SearchControl::new(estimated - 1, &mut poll)),
            SingleSearchOutcomeV1::Incomplete {
                reason: SearchIncompleteReasonV1::MemoryExhausted,
                ..
            }
        ));
    }

    #[test]
    fn stops_and_recomputation_mismatch_never_report_exact() {
        let input = input(1, false, false);
        for (budget, stop, reason) in [
            (0, None, SearchIncompleteReasonV1::MemoryExhausted),
            (
                1 << 25,
                Some(SearchStopReason::TimedOut),
                SearchIncompleteReasonV1::TimedOut,
            ),
            (
                1 << 25,
                Some(SearchStopReason::Cancelled),
                SearchIncompleteReasonV1::Cancelled,
            ),
        ] {
            let mut poll = || stop;
            assert!(
                matches!(search_single(&input,&mut SearchControl::new(budget,&mut poll)),SingleSearchOutcomeV1::Incomplete {reason:r,..} if r==reason)
            );
        }
        let mut poll = || None;
        let out = search_single(&input, &mut SearchControl::new(1 << 25, &mut poll));
        let mut forged = out.solutions()[0].clone();
        forged.average_score += 1.0;
        assert_eq!(
            hydrate_single_search_solutions(&input, &[forged]),
            Err(SearchIncompleteReasonV1::ScorerDisagreement)
        );
    }

    fn assert_exhaustive_bounds(input: &SingleSearchInputV1, label: &str) -> (usize, usize) {
        input.validate().unwrap();
        assert!(input.cards.len() < 16);
        let mut by_character = BTreeMap::<u32, Vec<u32>>::new();
        for card in &input.cards {
            if !card.is_excluded {
                by_character
                    .entry(card.character_id)
                    .or_default()
                    .push(card.instance_id);
            }
        }
        let groups: Vec<_> = by_character.into_values().collect();
        let group_of = |id| groups.iter().position(|group| group.contains(&id)).unwrap();
        let shared = SingleUpperShared::new(input, &groups).ok();
        let song = PreparedSong::single(
            &input.song,
            exact_probability_to_f64(input.perfect_rate),
            &input.fever,
        )
        .unwrap();
        let mut all = Vec::new();
        let mut prefixes = 0;
        for config in 0..input.area_configurations.len() {
            let upper = shared
                .as_ref()
                .and_then(|shared| SingleUpper::new(input, config, &groups, shared).ok());
            for mask in 0_u32..1 << input.cards.len() {
                if mask.count_ones() != 5 {
                    continue;
                }
                let ids: [u32; 5] = (0..input.cards.len() as u32)
                    .filter(|id| mask & (1 << id) != 0)
                    .collect::<Vec<_>>()
                    .try_into()
                    .unwrap();
                if ids.iter().any(|&id| input.cards[id as usize].is_excluded)
                    || ids.iter().enumerate().any(|(i, &id)| {
                        ids[..i].iter().any(|&other| {
                            input.cards[id as usize].character_id
                                == input.cards[other as usize].character_id
                        })
                    })
                {
                    continue;
                }
                let Some(value) = evaluate(input, &song, config, ids).unwrap() else {
                    continue;
                };
                if let Some(upper) = &upper {
                    let mut ordered = ids;
                    ordered.sort_by_key(|&id| group_of(id));
                    for depth in 0..=5 {
                        let fixed = &ordered[..depth];
                        let group = fixed.last().map_or(0, |&id| group_of(id) + 1);
                        for (name, bound) in [
                            ("plain", upper.bound(input, group, fixed)),
                            ("bonus", upper.bonus_bound(input, group, fixed)),
                        ] {
                            assert!(
                                bound >= value.target_value,
                                "{label} {name} config={config} ids={ids:?} depth={depth}: {bound} < {}",
                                value.target_value
                            );
                        }
                        prefixes += 1;
                    }
                }
                all.push(value);
            }
        }
        all.sort_by(compare);
        let mut poll = || None;
        let outcome = search_single(input, &mut SearchControl::new(64 << 20, &mut poll));
        let SingleSearchOutcomeV1::Exact { best, .. } = outcome else {
            panic!("{label}: {outcome:?}");
        };
        assert_eq!(best.as_ref(), all.first(), "{label}");
        (all.len(), prefixes)
    }

    #[test]
    fn adversarial_endpoints_constraints_and_event_scales_preserve_every_completion() {
        let probabilities = [(0, 0), (1, 9), (999_999_999, 9), (1, 0)];
        let mut counts = (0, 0);
        for (numerator, decimal_scale) in probabilities {
            for multi in [false, true] {
                for variant in 0..6 {
                    let mut input = input(variant, multi, true);
                    input.perfect_rate = ExactProbabilityV1 {
                        numerator,
                        decimal_scale,
                    };
                    input.cards.truncate(7);
                    input.point_bonus_rates.truncate(7);
                    input.support_powers.truncate(7);
                    input.result_limit = 1;
                    input.cards[6].character_id = input.cards[0].character_id;
                    input.area_items.push(SearchAreaItemV1 {
                        area_item_id: 2,
                        target_band_ids: vec![1, 2],
                        target_attributes: vec![CardAttributeV1::Pure, CardAttributeV1::Happy],
                        parameter_rates: [0.17_f64.next_up(), 0.29_f64.next_down(), 0.03125],
                    });
                    input.area_configurations[1].selected_area_item_ids = vec![2, 1];
                    let scale = [0.0001, 1.0, 50.0, 500.0, 1.0, 1.0][variant as usize];
                    for card in &mut input.cards {
                        card.character_parameter = card.character_parameter.map(|p| p * scale);
                        card.event_parameter = card.event_parameter.map(|p| p * scale);
                    }
                    if variant == 0 {
                        input.target = SingleTargetV1::Score;
                        input.min_leader_score_up_percent = 0.0;
                        for card in &mut input.cards {
                            for skill in [
                                &mut card.skill_contexts.mixed,
                                &mut card.skill_contexts.same_band,
                                &mut card.skill_contexts.same_attribute,
                                &mut card.skill_contexts.same_band_and_attribute,
                            ] {
                                skill.duration_seconds = 0.125;
                            }
                        }
                    } else if variant == 1 {
                        input.event_rule = SingleEventRuleV1::Challenge { modern: false };
                        input.cards[5].is_excluded = true;
                    } else if variant == 2 {
                        input.event_rule = SingleEventRuleV1::Challenge { modern: true };
                        input.min_leader_score_up_percent = 150.0;
                        for (id, card) in input.cards.iter_mut().enumerate() {
                            card.band_id = if id < 5 { 1 } else { 2 };
                            card.attribute = CardAttributeV1::Pure;
                            card.skill_contexts.mixed.behavior = SkillBehaviorV1::Score {
                                score_up_percent: 0.0,
                            };
                            card.skill_contexts.mixed.is_rate_up_with_perfect = false;
                            card.skill_contexts.same_attribute = card.skill_contexts.mixed;
                            card.skill_contexts.same_band.behavior = SkillBehaviorV1::Score {
                                score_up_percent: 170.0,
                            };
                            card.skill_contexts.same_band.is_rate_up_with_perfect = false;
                            card.skill_contexts.same_band_and_attribute =
                                card.skill_contexts.same_band;
                        }
                    } else if variant == 3 {
                        input.min_total_power = leader_parameters(&input, 1, [0, 1, 2, 3, 4])
                            .unwrap()[0]
                            .deck_total_parameter
                            .next_up();
                        input.point_bonus_rates = vec![
                            0.005_f64.next_down(),
                            0.005,
                            0.005_f64.next_up(),
                            0.03125,
                            0.0625,
                            0.5,
                            0.125,
                        ];
                    } else if variant == 4 {
                        input.min_leader_score_up_percent = 0.0;
                        for card in &mut input.cards {
                            let mut skill = card.skill_contexts.mixed;
                            skill.behavior = SkillBehaviorV1::ContinuedPerfect {
                                active_score_up_percent: 0.0,
                                fallback_score_up_percent: 170.0,
                            };
                            skill.is_rate_up_with_perfect = false;
                            card.skill_contexts = SearchCardSkillContextsV1 {
                                mixed: skill,
                                same_band: skill,
                                same_attribute: skill,
                                same_band_and_attribute: skill,
                            };
                        }
                    } else {
                        input.min_leader_score_up_percent = 1_000_000.0;
                    }
                    let label = format!(
                        "P={numerator}/10^{decimal_scale}, multi={multi}, variant={variant}"
                    );
                    let case_counts = assert_exhaustive_bounds(&input, &label);
                    counts.0 += case_counts.0;
                    counts.1 += case_counts.1;
                }
            }
        }
        eprintln!(
            "48 adversarial searches: {} feasible team/config completions, {} partial prefixes (both bounds)",
            counts.0, counts.1
        );
        assert!(counts.0 > 100 && counts.1 > 600);
    }

    #[test]
    fn unsafe_arithmetic_fails_open_and_cannot_become_exact() {
        for variant in 0..3 {
            let mut input = input(0, false, true);
            input.cards.truncate(5);
            input.point_bonus_rates.truncate(5);
            input.support_powers.truncate(5);
            match variant {
                0 => input.cards[0].character_parameter = [f64::MAX; 3],
                1 => {
                    input.event_rule = SingleEventRuleV1::Normal {
                        base: 40.0,
                        divisor: f64::from_bits(1),
                        formula: 2,
                    }
                }
                _ => input.point_bonus_rates.fill(f64::MAX),
            }
            input.validate().unwrap();
            let mut poll = || None;
            assert!(
                matches!(
                    search_single(&input, &mut SearchControl::new(64 << 20, &mut poll)),
                    SingleSearchOutcomeV1::Incomplete {
                        reason: SearchIncompleteReasonV1::ArithmeticOverflow,
                        ..
                    }
                ),
                "variant {variant}"
            );
        }
    }
}
