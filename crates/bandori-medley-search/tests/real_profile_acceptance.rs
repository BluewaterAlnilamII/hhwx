use std::collections::{HashMap, HashSet};
use std::fs;

use bandori_medley_search::{
    MedleySearchOutcomeV1, SearchControl, decode_medley_search_input_json, search_medley,
};

#[test]
fn small_real_hhwx_profile_completes_exactly() {
    let Ok(input_path) = std::env::var("HHWX_MEDLEY_ACCEPTANCE_INPUT") else {
        eprintln!("real-profile medley acceptance skipped; use the opt-in runner");
        return;
    };
    let json = fs::read_to_string(input_path).expect("acceptance input must be readable");
    let input = decode_medley_search_input_json(&json)
        .expect("HHWX source normalization must satisfy the strict Rust contract");

    assert_eq!(input.cards.len(), 15);
    assert_eq!(input.area_configurations.len(), 2);
    assert_eq!(
        input.songs.each_ref().map(|song| song.notes.len()),
        [483, 500, 521]
    );
    let mut cards_per_character = HashMap::<u32, usize>::new();
    for card in &input.cards {
        *cards_per_character.entry(card.character_id).or_default() += 1;
    }
    assert_eq!(cards_per_character.len(), 5);
    assert!(cards_per_character.values().all(|count| *count == 3));

    let mut never_stop = || None;
    let mut control = SearchControl::new(64 * 1024 * 1024, &mut never_stop);
    let MedleySearchOutcomeV1::Exact {
        best: Some(best),
        diagnostics,
        ..
    } = search_medley(&input, &mut control)
    else {
        panic!("small real-profile acceptance must return a proven exact solution");
    };

    let physical_cards = best
        .teams
        .iter()
        .flat_map(|team| team.member_instance_ids)
        .collect::<HashSet<_>>();
    assert_eq!(physical_cards.len(), 15);
    for team in &best.teams {
        let nonleaders = [
            team.member_instance_ids[0],
            team.member_instance_ids[1],
            team.member_instance_ids[3],
            team.member_instance_ids[4],
        ];
        assert!(nonleaders.windows(2).all(|pair| pair[0] < pair[1]));
        let characters = team
            .member_instance_ids
            .map(|instance_id| input.cards[instance_id as usize].character_id)
            .into_iter()
            .collect::<HashSet<_>>();
        assert_eq!(characters.len(), 5);
    }
    assert_eq!(diagnostics.configurations_total, 2);
    assert_eq!(diagnostics.configurations_completed, 2);
    assert!(diagnostics.complete_teams > 0);
    assert!(diagnostics.feasible_medleys > 0);
    eprintln!(
        "real-profile medley acceptance exact: rows={}, feasible={}, peakCandidateBytes={}",
        diagnostics.compact_rows, diagnostics.feasible_medleys, diagnostics.peak_candidate_bytes
    );
}
