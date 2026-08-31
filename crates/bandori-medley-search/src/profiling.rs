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
    JointBounds,
    Proposals,
    Improvements,
    Scoring,
    Join,
    Other,
}

const PHASE_NAMES: [&str; 10] = [
    "setup",
    "domains",
    "partialBounds",
    "completeBounds",
    "jointBounds",
    "proposals",
    "improvements",
    "scoring",
    "join",
    "other",
];

struct Profile {
    started: Instant,
    last: Instant,
    phase: Phase,
    elapsed: [Duration; 10],
    calls: [u64; 10],
    support_passes: [u64; 10],
    support_heads: [u64; 10],
    improvements: Vec<Value>,
    warm_start_ms: Option<f64>,
    peak_bound_index_bytes: usize,
    peak_domain_bytes: usize,
    peak_stack_bytes: usize,
    joint_destinations_pruned: u64,
    joint_cards_fixed: u64,
    joint_reuses: u64,
    peak_joint_bytes: usize,
    first_joint_upper: Option<f64>,
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

pub(crate) fn support_pass(head_count: usize) {
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile {
            profile.support_passes[profile.phase as usize] += 1;
            profile.support_heads[profile.phase as usize] += head_count as u64;
        }
    });
}

pub(crate) fn bound_storage(bytes: usize) {
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile {
            profile.peak_bound_index_bytes = profile.peak_bound_index_bytes.max(bytes);
        }
    });
}

pub(crate) fn domain_storage(bytes: usize) {
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile {
            profile.peak_domain_bytes = profile.peak_domain_bytes.max(bytes);
        }
    });
}

pub(crate) fn stack_storage(bytes: usize) {
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile {
            profile.peak_stack_bytes = profile.peak_stack_bytes.max(bytes);
        }
    });
}

pub(crate) fn joint_bound(score: f64, bytes: usize, reused: bool) {
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile {
            profile.peak_joint_bytes = profile.peak_joint_bytes.max(bytes);
            profile.joint_reuses += u64::from(reused);
            if profile.first_joint_upper.is_none() && score.is_finite() {
                profile.first_joint_upper = Some(score);
            }
        }
    });
}

pub(crate) fn joint_cuts(destinations: u32, fixed: bool) {
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile {
            profile.joint_destinations_pruned += u64::from(destinations);
            profile.joint_cards_fixed += u64::from(fixed);
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
            elapsed: [Duration::ZERO; 10],
            calls: [0; 10],
            support_passes: [0; 10],
            support_heads: [0; 10],
            improvements: Vec::new(),
            warm_start_ms: None,
            peak_bound_index_bytes: 0,
            peak_domain_bytes: 0,
            peak_stack_bytes: 0,
            joint_destinations_pruned: 0,
            joint_cards_fixed: 0,
            joint_reuses: 0,
            peak_joint_bytes: 0,
            first_joint_upper: None,
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
                "supportHeads": profile.support_heads[index],
            })).collect::<Vec<_>>(),
            "warmStartMs": profile.warm_start_ms,
            "peakBoundIndexBytes": profile.peak_bound_index_bytes,
            "peakDomainBytes": profile.peak_domain_bytes,
            "peakStackBytes": profile.peak_stack_bytes,
            "jointDestinationsPruned": profile.joint_destinations_pruned,
            "jointCardsFixed": profile.joint_cards_fixed,
            "jointReuses": profile.joint_reuses,
            "peakJointReservedBytes": profile.peak_joint_bytes,
            "firstJointUpper": profile.first_joint_upper,
            "improvements": profile.improvements,
        })
    })
}
