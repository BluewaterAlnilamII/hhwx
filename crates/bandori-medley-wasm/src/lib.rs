//! Browser binding for Bandori medley exact search and result hydration.

#![forbid(unsafe_code)]

use bandori_medley_search::{
    MedleySearchOutcomeV1, SearchControl, SearchStopReason, decode_medley_search_input_json,
    hydrate_medley_search_solutions, search_medley,
};
use js_sys::Function;
use serde::Serialize;
use wasm_bindgen::{JsValue, UnwrapThrowExt, prelude::wasm_bindgen};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MedleySearchRunResult<'a> {
    outcome: &'a MedleySearchOutcomeV1,
    hydration: &'a bandori_medley_search::MedleySearchHydrationV1,
}

fn stop_reason(callback: &Function) -> Option<SearchStopReason> {
    let value = callback.call0(&JsValue::UNDEFINED).unwrap_throw();
    if value.is_null() || value.is_undefined() {
        return None;
    }
    match value.as_string().as_deref() {
        Some("cancelled") => Some(SearchStopReason::Cancelled),
        Some("timed_out") => Some(SearchStopReason::TimedOut),
        _ => wasm_bindgen::throw_str(
            "stopReason callback must return undefined, null, 'cancelled', or 'timed_out'",
        ),
    }
}

fn json_error(value: &impl Serialize) -> JsValue {
    JsValue::from_str(&serde_json::to_string(value).unwrap_throw())
}

fn discovered(outcome: &MedleySearchOutcomeV1) -> &[bandori_medley_search::MedleySearchSolutionV1] {
    match outcome {
        MedleySearchOutcomeV1::Exact { discovered, .. }
        | MedleySearchOutcomeV1::Incomplete { discovered, .. } => discovered,
    }
}

/// Run one normalized medley search. The caller owns stop timing, progress
/// throttling, and the instant at which search (before hydration) finishes.
#[wasm_bindgen(js_name = runMedleySearchJson)]
pub fn run_medley_search_json(
    input_json: &str,
    memory_budget_bytes: u32,
    stop_reason_callback: &Function,
    incumbent_json_callback: &Function,
    search_finished_callback: &Function,
) -> Result<String, JsValue> {
    let input = decode_medley_search_input_json(input_json).map_err(|error| json_error(&error))?;
    let mut poll_stop = || stop_reason(stop_reason_callback);
    let mut report_incumbent = |solution: &bandori_medley_search::MedleySearchSolutionV1| {
        let json = serde_json::to_string(solution).unwrap_throw();
        incumbent_json_callback
            .call1(&JsValue::UNDEFINED, &JsValue::from_str(&json))
            .unwrap_throw();
    };
    let mut control = SearchControl::new(memory_budget_bytes as usize, &mut poll_stop)
        .with_strict_improvement(&mut report_incumbent);
    let outcome = search_medley(&input, &mut control);
    search_finished_callback
        .call0(&JsValue::UNDEFINED)
        .unwrap_throw();
    let hydration = hydrate_medley_search_solutions(&input, discovered(&outcome))
        .map_err(|reason| json_error(&reason))?;

    serde_json::to_string(&MedleySearchRunResult {
        outcome: &outcome,
        hydration: &hydration,
    })
    .map_err(|error| JsValue::from_str(&error.to_string()))
}

/// One-team entry using the same resource-control and hydration boundary.
#[wasm_bindgen(js_name = runSingleSearchJson)]
pub fn run_single_search_json(
    input_json: &str,
    memory_budget_bytes: u32,
    stop_reason_callback: &Function,
    incumbent_json_callback: &Function,
    search_finished_callback: &Function,
) -> Result<String, JsValue> {
    use bandori_medley_search::{
        SingleSearchSolutionV1, decode_single_search_input_json, hydrate_single_search_solutions,
        search_single,
    };
    let input = decode_single_search_input_json(input_json).map_err(|e| json_error(&e))?;
    let mut poll = || stop_reason(stop_reason_callback);
    let mut improvement = |solution: &SingleSearchSolutionV1| {
        let json = serde_json::to_string(solution).unwrap_throw();
        incumbent_json_callback
            .call1(&JsValue::UNDEFINED, &JsValue::from_str(&json))
            .unwrap_throw();
    };
    let mut control = SearchControl::new(memory_budget_bytes as usize, &mut poll)
        .with_strict_improvement(&mut improvement);
    let outcome = search_single(&input, &mut control);
    search_finished_callback
        .call0(&JsValue::UNDEFINED)
        .unwrap_throw();
    let details =
        hydrate_single_search_solutions(&input, outcome.solutions()).map_err(|e| json_error(&e))?;
    serde_json::to_string(&serde_json::json!({ "outcome": outcome, "details": details }))
        .map_err(|e| JsValue::from_str(&e.to_string()))
}
