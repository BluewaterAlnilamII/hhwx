//! Native diagnostic-test timers. This module is absent from production builds.
//! Switching phases charges nested work once, rather than adding inclusive times.

use std::cell::RefCell;
use std::collections::BTreeMap;
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
    JointBookkeeping,
    EffectiveOwners,
    ApplyJointCuts,
    JointBranching,
    LocalBlocks,
    Proposals,
    Improvements,
    Scoring,
    Join,
    Other,
}

const PHASE_NAMES: [&str; 15] = [
    "setup",
    "domains",
    "partialBounds",
    "completeBounds",
    "jointBounds",
    "jointBookkeeping",
    "effectiveOwners",
    "applyJointCuts",
    "jointBranching",
    "localBlocks",
    "proposals",
    "improvements",
    "scoring",
    "join",
    "other",
];

const JOINT_TIMING_NAMES: [&str; 9] = [
    "fresh",
    "incremental",
    "weights",
    "clone",
    "localChoices",
    "forward",
    "backward",
    "proposal",
    "destinations",
];
const COMPLETION_LIMITS: [u128; 7] = [256, 1_024, 4_096, 16_384, 65_536, 262_144, 1_048_576];

#[derive(Clone, Copy)]
pub(crate) enum JointTiming {
    Fresh,
    Incremental,
    Weights,
    Clone,
    LocalChoices,
    Forward,
    Backward,
    Proposal,
    Destinations,
}

#[derive(Clone, Copy)]
pub(crate) enum JointMode {
    Fresh,
    Incremental,
    Reused,
}

#[derive(Clone, Copy)]
pub(crate) enum NodeOutcome {
    Pruned,
    LocalBlock,
    Branched,
    Finished,
}

#[derive(Default)]
struct TraversalProfile {
    nodes: u64,
    pruned: u64,
    local_blocks: u64,
    branched: u64,
    finished: u64,
    branch_children: u64,
    joint_calls: u64,
    joint_modes: [u64; 3],
    joint_gap_counts: [u64; 7],
    owner_width_counts: [u64; 4],
    joint_whole_cutoffs: u64,
    completion_observations: u64,
    sorted_row_count_buckets: [[u64; 8]; 3],
    row_sum_buckets: [u64; 8],
    smallest_pair_product_buckets: [u64; 8],
    required_count_buckets: [u64; 16],
    local_input_rows: [u64; 3],
    local_surviving_rows: [u64; 3],
    local_pair_checks: u64,
    local_third_checks: u64,
    local_conflicts: u64,
}

struct ConfigurationProfile {
    rank: usize,
    source_index: usize,
    selected_area_item_ids: Vec<u32>,
    started: Duration,
    elapsed: Option<Duration>,
    status: &'static str,
    traversal: TraversalProfile,
}

struct Profile {
    started: Instant,
    last: Instant,
    phase: Phase,
    elapsed: [Duration; 15],
    calls: [u64; 15],
    support_passes: [u64; 15],
    support_heads: [u64; 15],
    improvements: Vec<Value>,
    warm_start_ms: Option<f64>,
    peak_bound_index_bytes: usize,
    peak_domain_bytes: usize,
    peak_stack_bytes: usize,
    joint_destinations_pruned: u64,
    joint_cards_fixed: u64,
    joint_reuses: u64,
    joint_model_builds: u64,
    joint_table_updates: u64,
    joint_state_count_sum: u64,
    joint_layers_recomputed: u64,
    peak_joint_bytes: usize,
    first_joint_upper: Option<f64>,
    joint_timing_elapsed: [Duration; 9],
    joint_timing_calls: [u64; 9],
    joint_clone_bytes: u64,
    joint_whole_cutoffs: u64,
    joint_competitive_patterns: u64,
    joint_losing_patterns: u64,
    configurations: Vec<ConfigurationProfile>,
    active_configuration: Option<usize>,
    active_depth: Option<(usize, [u8; 3])>,
    depths: BTreeMap<(usize, [u8; 3]), TraversalProfile>,
}

impl Profile {
    fn switch(&mut self, phase: Phase) {
        let now = Instant::now();
        self.elapsed[self.phase as usize] += now - self.last;
        self.last = now;
        self.phase = phase;
    }
}

fn record_traversal(profile: &mut Profile, mut record: impl FnMut(&mut TraversalProfile)) {
    if let Some(index) = profile.active_configuration {
        record(&mut profile.configurations[index].traversal);
    }
    if let Some(key) = profile.active_depth {
        record(profile.depths.entry(key).or_default());
    }
}

fn joint_gap_bucket(score: f64, incumbent: Option<f64>) -> Option<usize> {
    let incumbent = incumbent.filter(|value| value.is_finite() && *value > 0.0)?;
    if !score.is_finite() {
        return None;
    }
    let percent = (score - incumbent) / incumbent * 100.0;
    Some(if percent < 0.0 {
        0
    } else if percent <= 0.1 {
        1
    } else if percent <= 0.5 {
        2
    } else if percent <= 1.0 {
        3
    } else if percent <= 2.0 {
        4
    } else if percent <= 5.0 {
        5
    } else {
        6
    })
}

fn traversal_json(profile: &TraversalProfile) -> Value {
    json!({
        "nodes": profile.nodes,
        "pruned": profile.pruned,
        "localBlocks": profile.local_blocks,
        "branched": profile.branched,
        "finished": profile.finished,
        "branchChildren": profile.branch_children,
        "jointCalls": profile.joint_calls,
        "jointModes": {
            "fresh": profile.joint_modes[JointMode::Fresh as usize],
            "incremental": profile.joint_modes[JointMode::Incremental as usize],
            "reused": profile.joint_modes[JointMode::Reused as usize],
        },
        "jointGapCounts": profile.joint_gap_counts,
        "ownerWidthCounts": profile.owner_width_counts,
        "jointWholeCutoffs": profile.joint_whole_cutoffs,
        "completionObservations": profile.completion_observations,
        "sortedRowCountBuckets": profile.sorted_row_count_buckets,
        "rowSumBuckets": profile.row_sum_buckets,
        "smallestPairProductBuckets": profile.smallest_pair_product_buckets,
        "requiredCountBuckets": profile.required_count_buckets,
        "localInputRows": profile.local_input_rows,
        "localSurvivingRows": profile.local_surviving_rows,
        "localPairChecks": profile.local_pair_checks,
        "localThirdChecks": profile.local_third_checks,
        "localConflicts": profile.local_conflicts,
    })
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

pub(crate) struct JointTimingScope {
    timing: JointTiming,
    started: Instant,
    bytes: usize,
}

impl Drop for JointTimingScope {
    fn drop(&mut self) {
        PROFILE.with_borrow_mut(|profile| {
            if let Some(profile) = profile {
                let index = self.timing as usize;
                profile.joint_timing_elapsed[index] += self.started.elapsed();
                profile.joint_timing_calls[index] += 1;
                if matches!(self.timing, JointTiming::Clone) {
                    profile.joint_clone_bytes += self.bytes as u64;
                }
            }
        });
    }
}

pub(crate) fn joint_timing(timing: JointTiming, bytes: usize) -> JointTimingScope {
    JointTimingScope {
        timing,
        started: Instant::now(),
        bytes,
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

pub(crate) fn joint_bound(score: f64, bytes: usize, mode: JointMode, incumbent: Option<f64>) {
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile {
            profile.peak_joint_bytes = profile.peak_joint_bytes.max(bytes);
            profile.joint_reuses += u64::from(matches!(mode, JointMode::Reused));
            if profile.first_joint_upper.is_none() && score.is_finite() {
                profile.first_joint_upper = Some(score);
            }
            let gap = joint_gap_bucket(score, incumbent);
            record_traversal(profile, |traversal| {
                traversal.joint_calls += 1;
                traversal.joint_modes[mode as usize] += 1;
                if let Some(bucket) = gap {
                    traversal.joint_gap_counts[bucket] += 1;
                }
            });
        }
    });
}

pub(crate) fn joint_owner_widths(counts: [u64; 4]) {
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile {
            record_traversal(profile, |traversal| {
                for (target, count) in traversal.owner_width_counts.iter_mut().zip(counts) {
                    *target += count;
                }
            });
        }
    });
}

pub(crate) fn completion_counts(mut counts: [u64; 3], required_count: usize) {
    counts.sort_unstable();
    let row_sum = counts.into_iter().map(u128::from).sum::<u128>();
    let smallest_pair_product = u128::from(counts[0]) * u128::from(counts[1]);
    let bucket = |value| {
        COMPLETION_LIMITS
            .iter()
            .position(|limit| value <= *limit)
            .unwrap_or(COMPLETION_LIMITS.len())
    };
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile {
            record_traversal(profile, |traversal| {
                traversal.completion_observations += 1;
                for (position, count) in counts.into_iter().enumerate() {
                    traversal.sorted_row_count_buckets[position][bucket(u128::from(count))] += 1;
                }
                traversal.row_sum_buckets[bucket(row_sum)] += 1;
                traversal.smallest_pair_product_buckets[bucket(smallest_pair_product)] += 1;
                traversal.required_count_buckets[required_count.min(15)] += 1;
            });
        }
    });
}

pub(crate) fn local_block(
    input_rows: [usize; 3],
    surviving_rows: [usize; 3],
    pair_checks: u64,
    third_checks: u64,
    conflicts: u64,
) {
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile {
            record_traversal(profile, |traversal| {
                for slot in 0..3 {
                    traversal.local_input_rows[slot] += input_rows[slot] as u64;
                    traversal.local_surviving_rows[slot] += surviving_rows[slot] as u64;
                }
                traversal.local_pair_checks += pair_checks;
                traversal.local_third_checks += third_checks;
                traversal.local_conflicts += conflicts;
            });
        }
    });
}

pub(crate) fn configuration_started(
    rank: usize,
    source_index: usize,
    selected_area_item_ids: &[u32],
) {
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile {
            debug_assert!(profile.active_configuration.is_none());
            let index = profile.configurations.len();
            profile.configurations.push(ConfigurationProfile {
                rank,
                source_index,
                selected_area_item_ids: selected_area_item_ids.to_vec(),
                started: profile.started.elapsed(),
                elapsed: None,
                status: "incomplete",
                traversal: TraversalProfile::default(),
            });
            profile.active_configuration = Some(index);
        }
    });
}

pub(crate) fn configuration_finished(status: &'static str) {
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile
            && let Some(index) = profile.active_configuration.take()
        {
            let configuration = &mut profile.configurations[index];
            configuration.elapsed = Some(profile.started.elapsed() - configuration.started);
            configuration.status = status;
        }
    });
}

pub(crate) fn node_started(depth: usize, member_counts: [u8; 3]) {
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile {
            debug_assert!(profile.active_depth.is_none());
            let key = (depth, member_counts);
            profile.active_depth = Some(key);
            record_traversal(profile, |traversal| traversal.nodes += 1);
        }
    });
}

pub(crate) fn node_finished(outcome: NodeOutcome, branch_children: usize) {
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile {
            record_traversal(profile, |traversal| match outcome {
                NodeOutcome::Pruned => traversal.pruned += 1,
                NodeOutcome::LocalBlock => traversal.local_blocks += 1,
                NodeOutcome::Branched => {
                    traversal.branched += 1;
                    traversal.branch_children += branch_children as u64;
                }
                NodeOutcome::Finished => traversal.finished += 1,
            });
            profile.active_depth = None;
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

pub(crate) fn joint_model(states: usize, updated: bool) {
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile {
            profile.joint_model_builds += u64::from(!updated);
            profile.joint_table_updates += u64::from(updated);
            profile.joint_state_count_sum += states as u64;
        }
    });
}

pub(crate) fn joint_layer() {
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile {
            profile.joint_layers_recomputed += 1;
        }
    });
}

pub(crate) fn joint_whole_cutoff() {
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile {
            profile.joint_whole_cutoffs += 1;
            record_traversal(profile, |traversal| traversal.joint_whole_cutoffs += 1);
        }
    });
}

pub(crate) fn joint_pattern_filter(competitive: u64, losing: u64) {
    PROFILE.with_borrow_mut(|profile| {
        if let Some(profile) = profile {
            profile.joint_competitive_patterns += competitive;
            profile.joint_losing_patterns += losing;
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
            elapsed: [Duration::ZERO; 15],
            calls: [0; 15],
            support_passes: [0; 15],
            support_heads: [0; 15],
            improvements: Vec::new(),
            warm_start_ms: None,
            peak_bound_index_bytes: 0,
            peak_domain_bytes: 0,
            peak_stack_bytes: 0,
            joint_destinations_pruned: 0,
            joint_cards_fixed: 0,
            joint_reuses: 0,
            joint_model_builds: 0,
            joint_table_updates: 0,
            joint_state_count_sum: 0,
            joint_layers_recomputed: 0,
            peak_joint_bytes: 0,
            first_joint_upper: None,
            joint_timing_elapsed: [Duration::ZERO; 9],
            joint_timing_calls: [0; 9],
            joint_clone_bytes: 0,
            joint_whole_cutoffs: 0,
            joint_competitive_patterns: 0,
            joint_losing_patterns: 0,
            configurations: Vec::new(),
            active_configuration: None,
            active_depth: None,
            depths: BTreeMap::new(),
        });
    });
}

pub(crate) fn finish() -> Value {
    PROFILE.with_borrow_mut(|profile| {
        let mut profile = profile.take().unwrap();
        profile.switch(Phase::Other);
        let elapsed = profile.last - profile.started;
        if let Some(index) = profile.active_configuration.take() {
            let configuration = &mut profile.configurations[index];
            configuration.elapsed = Some(elapsed - configuration.started);
        }
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
            "jointModelBuilds": profile.joint_model_builds,
            "jointTableUpdates": profile.joint_table_updates,
            "jointStateCountSum": profile.joint_state_count_sum,
            "jointLayersRecomputed": profile.joint_layers_recomputed,
            "peakJointReservedBytes": profile.peak_joint_bytes,
            "firstJointUpper": profile.first_joint_upper,
            "jointTimings": JOINT_TIMING_NAMES.iter().enumerate().map(|(index, name)| json!({
                "name": name,
                "elapsedMs": profile.joint_timing_elapsed[index].as_secs_f64() * 1000.0,
                "calls": profile.joint_timing_calls[index],
            })).collect::<Vec<_>>(),
            "jointCloneBytes": profile.joint_clone_bytes,
            "jointWholeCutoffs": profile.joint_whole_cutoffs,
            "jointCompetitivePatterns": profile.joint_competitive_patterns,
            "jointLosingPatterns": profile.joint_losing_patterns,
            "improvements": profile.improvements,
            "jointGapBands": ["below", "0%-0.1%", "0.1%-0.5%", "0.5%-1%", "1%-2%", "2%-5%", "above5%"],
            "completionBands": ["<=256", "<=1024", "<=4096", "<=16384", "<=65536", "<=262144", "<=1048576", ">1048576"],
            "configurations": profile.configurations.iter().map(|configuration| json!({
                "rank": configuration.rank,
                "sourceIndex": configuration.source_index,
                "selectedAreaItemIds": configuration.selected_area_item_ids,
                "startedMs": configuration.started.as_secs_f64() * 1000.0,
                "elapsedMs": configuration.elapsed.unwrap_or_default().as_secs_f64() * 1000.0,
                "status": configuration.status,
                "traversal": traversal_json(&configuration.traversal),
            })).collect::<Vec<_>>(),
            "depths": profile.depths.iter().map(|((depth, member_counts), traversal)| json!({
                "depth": depth,
                "memberCounts": member_counts,
                "traversal": traversal_json(traversal),
            })).collect::<Vec<_>>(),
        })
    })
}

#[test]
fn traversal_profile_groups_configuration_and_depth() {
    start();
    configuration_started(0, 3, &[5, 9]);
    node_started(2, [1, 0, 0]);
    joint_bound(101.0, 2_048, JointMode::Fresh, Some(100.0));
    joint_owner_widths([1, 2, 3, 4]);
    completion_counts([100, 200, 300], 3);
    local_block([10, 20, 30], [8, 15, 25], 40, 50, 6);
    joint_whole_cutoff();
    node_finished(NodeOutcome::Branched, 3);
    configuration_finished("searched");

    let profile = finish();
    let configuration = &profile["configurations"][0];
    assert_eq!(configuration["sourceIndex"], 3);
    assert_eq!(configuration["status"], "searched");
    assert_eq!(configuration["traversal"]["nodes"], 1);
    assert_eq!(configuration["traversal"]["branchChildren"], 3);
    assert_eq!(configuration["traversal"]["jointGapCounts"][3], 1);

    let depth = &profile["depths"][0];
    assert_eq!(depth["depth"], 2);
    assert_eq!(depth["memberCounts"], json!([1, 0, 0]));
    assert_eq!(depth["traversal"]["ownerWidthCounts"], json!([1, 2, 3, 4]));
    assert_eq!(depth["traversal"]["jointWholeCutoffs"], 1);
    assert_eq!(depth["traversal"]["rowSumBuckets"][1], 1);
    assert_eq!(depth["traversal"]["smallestPairProductBuckets"][4], 1);
    assert_eq!(depth["traversal"]["requiredCountBuckets"][3], 1);
    assert_eq!(depth["traversal"]["sortedRowCountBuckets"][0][0], 1);
    assert_eq!(depth["traversal"]["sortedRowCountBuckets"][1][0], 1);
    assert_eq!(depth["traversal"]["sortedRowCountBuckets"][2][1], 1);
    assert_eq!(depth["traversal"]["localSurvivingRows"], json!([8, 15, 25]));
    assert_eq!(depth["traversal"]["localConflicts"], 6);
}
