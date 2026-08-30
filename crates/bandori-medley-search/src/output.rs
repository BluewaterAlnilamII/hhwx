use serde::{Deserialize, Serialize};

/// One selected team for its fixed song slot. Member index two is the leader.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MedleySearchTeamV1 {
    pub slot: u8,
    pub member_instance_ids: [u32; 5],
    pub average_score: f64,
}

/// One complete three-team assignment under one shared area configuration.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MedleySearchSolutionV1 {
    /// IDs remain in the exact operation order used for scoring.
    pub selected_area_item_ids: Vec<u32>,
    pub teams: [MedleySearchTeamV1; 3],
    pub total_average_score: f64,
}

/// Aggregate evidence from one run. These counters diagnose scale and pruning;
/// they are not an alternative completion proof.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MedleySearchDiagnosticsV1 {
    pub configurations_total: u64,
    pub configurations_completed: u64,
    pub configurations_pruned: u64,
    pub partial_nodes: u64,
    pub partial_nodes_pruned: u64,
    pub complete_teams: u64,
    pub exact_song_scores: u64,
    pub compact_rows: u64,
    pub rows_pruned: u64,
    pub join_pair_checks: u64,
    pub join_third_checks: u64,
    pub card_conflicts: u64,
    pub feasible_medleys: u64,
    pub incumbent_changes: u64,
    pub unknown_bound_evaluations: u64,
    pub peak_candidate_bytes: u64,
}

/// Why a run ended without an exact result.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchIncompleteReasonV1 {
    Cancelled,
    TimedOut,
    MemoryExhausted,
    InvalidData,
    ArithmeticOverflow,
    ScorerDisagreement,
    CountOrIndexOverflow,
    InternalFailure,
}

/// Terminal search state.
///
/// `best` is `None` only when exhaustive proof establishes that no solution
/// exists. `best_so_far` is diagnostic and never represents an exact result.
/// The discovered list contains at most ten diagnostic solutions and is not a
/// proven global top-N result.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "status",
    rename_all = "snake_case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum MedleySearchOutcomeV1 {
    Exact {
        best: Option<MedleySearchSolutionV1>,
        discovered: Vec<MedleySearchSolutionV1>,
        diagnostics: MedleySearchDiagnosticsV1,
    },
    Incomplete {
        reason: SearchIncompleteReasonV1,
        best_so_far: Option<MedleySearchSolutionV1>,
        discovered: Vec<MedleySearchSolutionV1>,
        diagnostics: MedleySearchDiagnosticsV1,
    },
}
