use bandori_medley_model::ResolvedScoreSkillV1;

use crate::exact_score::{
    ExactScoreFailure, ExactTeamScoreInput, exact_probability_to_f64, score_song,
};
use crate::parameters::{TeamParameterFailure, calculate_team_parameters};
use crate::{AreaItemConfigurationV1, MedleySearchInputV1, SearchCardV1};

#[derive(Clone, Copy, Debug)]
pub(crate) struct CompactCandidate {
    /// Stable source indexes in ascending order; this is not scoring order.
    pub(crate) member_instance_ids: [u32; 5],
    pub(crate) song_scores: [f64; 3],
    pub(crate) leader_instance_ids: [u32; 3],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum CandidateFailure {
    InvalidInternalReference,
    ArithmeticFailure,
}

pub(crate) fn member_order_for_leader(
    member_instance_ids: [u32; 5],
    leader_instance_id: u32,
) -> Result<[u32; 5], CandidateFailure> {
    let mut others = [0_u32; 4];
    let mut other_count = 0_usize;
    for instance_id in member_instance_ids {
        if instance_id == leader_instance_id {
            continue;
        }
        let Some(slot) = others.get_mut(other_count) else {
            return Err(CandidateFailure::InvalidInternalReference);
        };
        *slot = instance_id;
        other_count += 1;
    }
    if other_count != 4 || !member_instance_ids.contains(&leader_instance_id) {
        return Err(CandidateFailure::InvalidInternalReference);
    }
    Ok([
        others[0],
        others[1],
        leader_instance_id,
        others[2],
        others[3],
    ])
}

fn resolved_skill(
    card: &SearchCardV1,
    is_same_band: bool,
    is_same_attribute: bool,
) -> ResolvedScoreSkillV1 {
    match (is_same_band, is_same_attribute) {
        (false, false) => card.skill_contexts.mixed,
        (true, false) => card.skill_contexts.same_band,
        (false, true) => card.skill_contexts.same_attribute,
        (true, true) => card.skill_contexts.same_band_and_attribute,
    }
}

fn map_parameter_failure(failure: TeamParameterFailure) -> CandidateFailure {
    match failure {
        TeamParameterFailure::CardReferenceMissing { .. }
        | TeamParameterFailure::AreaItemReferenceMissing { .. } => {
            CandidateFailure::InvalidInternalReference
        }
        TeamParameterFailure::ArithmeticNonFinite => CandidateFailure::ArithmeticFailure,
    }
}

fn map_score_failure(failure: ExactScoreFailure) -> CandidateFailure {
    match failure {
        ExactScoreFailure::InvalidSong => CandidateFailure::InvalidInternalReference,
        ExactScoreFailure::ArithmeticNonFinite | ExactScoreFailure::ArithmeticOverflow => {
            CandidateFailure::ArithmeticFailure
        }
    }
}

pub(crate) fn evaluate_candidate(
    input: &MedleySearchInputV1,
    configuration: &AreaItemConfigurationV1,
    mut member_instance_ids: [u32; 5],
    start_combos: [u32; 3],
) -> Result<CompactCandidate, CandidateFailure> {
    member_instance_ids.sort_unstable();
    if member_instance_ids
        .windows(2)
        .any(|window| window[0] == window[1])
    {
        return Err(CandidateFailure::InvalidInternalReference);
    }
    let cards = member_instance_ids
        .map(|instance_id| input.cards.get(instance_id as usize))
        .into_iter()
        .collect::<Option<Vec<_>>>()
        .ok_or(CandidateFailure::InvalidInternalReference)?;
    let first_band = cards[0].band_id;
    let first_attribute = cards[0].attribute;
    let is_same_band = cards.iter().all(|card| card.band_id == first_band);
    let is_same_attribute = cards.iter().all(|card| card.attribute == first_attribute);
    let perfect_rate = exact_probability_to_f64(input.perfect_rate);
    let mut best_scores = [None::<f64>; 3];
    let mut best_leaders = [0_u32; 3];

    // Leaders are considered in source order. Equal scores therefore keep the
    // lowest stable source index without making score a second objective.
    for leader_instance_id in member_instance_ids {
        let ordered_members = member_order_for_leader(member_instance_ids, leader_instance_id)?;
        let parameters = calculate_team_parameters(
            &input.cards,
            &input.area_items,
            configuration,
            ordered_members,
        )
        .map_err(map_parameter_failure)?;
        let skills = ordered_members.map(|instance_id| {
            resolved_skill(
                &input.cards[instance_id as usize],
                is_same_band,
                is_same_attribute,
            )
        });
        for song_slot in 0..3 {
            let score = score_song(
                &input.songs[song_slot],
                ExactTeamScoreInput {
                    deck_total_parameter: parameters.deck_total_parameter,
                    skills,
                },
                start_combos[song_slot],
                perfect_rate,
            )
            .map_err(map_score_failure)?
            .average_score;
            if best_scores[song_slot].is_none_or(|best| score > best) {
                best_scores[song_slot] = Some(score);
                best_leaders[song_slot] = leader_instance_id;
            }
        }
    }

    Ok(CompactCandidate {
        member_instance_ids,
        song_scores: best_scores.map(|score| score.expect("five leaders were evaluated")),
        leader_instance_ids: best_leaders,
    })
}

pub(crate) fn candidates_overlap(left: &CompactCandidate, right: &CompactCandidate) -> bool {
    left.member_instance_ids
        .iter()
        .any(|instance_id| right.member_instance_ids.contains(instance_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn leader_is_inserted_at_index_two_without_reordering_the_other_members() {
        assert_eq!(
            member_order_for_leader([2, 5, 7, 11, 13], 11).expect("leader belongs to set"),
            [2, 5, 11, 7, 13]
        );
    }
}
