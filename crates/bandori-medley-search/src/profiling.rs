//! Native diagnostic-test timers. This module is absent from production builds.
//! Switching phases charges nested work once, rather than adding inclusive times.

use std::cell::RefCell;
use std::time::{Duration, Instant};

use serde_json::{Value, json};

use crate::MedleySearchDiagnosticsV1;

#[derive(Clone, Copy)]
pub(crate) enum Phase {
    Setup,
    Domains,
    PartialBounds,
    CompleteBounds,
    Proposals,
    Scoring,
    Join,
    Other,
}

const PHASE_NAMES: [&str; 8] = [
    "setup",
    "domains",
    "partialBounds",
    "completeBounds",
    "proposals",
    "scoring",
    "join",
    "other",
];

struct Profile {
    started: Instant,
    last: Instant,
    phase: Phase,
    elapsed: [Duration; 8],
    calls: [u64; 8],
    support_passes: [u64; 8],
    support_cards: [u64; 8],
    improvements: Vec<Value>,
    warm_start_ms: Option<f64>,
}

impl Profile {
    fn switch(&mut self, phase: Phase) {
        let now = Instant::now();
        self.elapsed[self.phase as usize] += now - self.last;
        self.last = now;
        self.phase = phase;
    }
}

thread_local! {
    static PROFILE: RefCell<Option<Profile>> = const { RefCell::new(None) };
}

pub(crate) struct Scope(Option<Phase>);

impl Drop for Scope {
    fn drop(&mut self) {
        if let Some(previous) = self.0 {
            PROFILE.with_borrow_mut(|profile| profile.as_mut().unwrap().switch(previous));
        }
    }
}

pub(crate) fn enter(phase: Phase) -> Scope {
    PROFILE.with_borrow_mut(|profile| {
        let Some(profile) = profile else {
            return Scope(None);
        };
        let previous = profile.phase;
        profile.switch(phase);
        profile.calls[phase as usize] += 1;
        Scope(Some(previous))
    })
}

pub(crate) fn support_pass(card_count: usize) {
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile {
            profile.support_passes[profile.phase as usize] += 1;
            profile.support_cards[profile.phase as usize] += card_count as u64;
        }
    });
}

pub(crate) fn improvement(score: f64, diagnostics: &MedleySearchDiagnosticsV1) {
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile {
            profile.improvements.push(json!({
                "elapsedMs": profile.started.elapsed().as_secs_f64() * 1000.0,
                "score": score,
                "partialNodes": diagnostics.partial_nodes,
                "completeTeams": diagnostics.complete_teams,
                "heuristicProbes": diagnostics.heuristic_probes,
            }));
        }
    });
}

pub(crate) fn warm_start_finished() {
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile {
            profile.warm_start_ms = Some(profile.started.elapsed().as_secs_f64() * 1000.0);
        }
    });
}

pub(crate) fn start() {
    let now = Instant::now();
    PROFILE.with_borrow_mut(|profile| {
        *profile = Some(Profile {
            started: now,
            last: now,
            phase: Phase::Other,
            elapsed: [Duration::ZERO; 8],
            calls: [0; 8],
            support_passes: [0; 8],
            support_cards: [0; 8],
            improvements: Vec::new(),
            warm_start_ms: None,
        });
    });
}

pub(crate) fn finish() -> Value {
    PROFILE.with_borrow_mut(|profile| {
        let mut profile = profile.take().unwrap();
        profile.switch(Phase::Other);
        let elapsed = profile.last - profile.started;
        assert_eq!(profile.elapsed.iter().sum::<Duration>(), elapsed);
        json!({
            "elapsedMs": elapsed.as_secs_f64() * 1000.0,
            "phases": PHASE_NAMES.iter().enumerate().map(|(index, name)| json!({
                "name": name,
                "elapsedMs": profile.elapsed[index].as_secs_f64() * 1000.0,
                "calls": profile.calls[index],
                "supportPasses": profile.support_passes[index],
                "supportCards": profile.support_cards[index],
            })).collect::<Vec<_>>(),
            "warmStartMs": profile.warm_start_ms,
            "improvements": profile.improvements,
        })
    })
}
