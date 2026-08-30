//! Native test entry point; resource limits do not change search semantics.

use std::{
    env,
    error::Error,
    fs,
    time::{Duration, Instant},
};

use bandori_medley_search::{
    SearchControl, SearchStopReason, decode_medley_search_input_json, search_medley,
};

fn main() -> Result<(), Box<dyn Error>> {
    let arguments: Vec<String> = env::args().collect();
    if arguments.len() != 4 {
        return Err("usage: run_search <input.json> <duration-ms> <candidate-budget-bytes>".into());
    }
    let input = decode_medley_search_input_json(&fs::read_to_string(&arguments[1])?)?;
    let duration = Duration::from_millis(arguments[2].parse()?);
    let memory_budget = arguments[3].parse()?;
    let started = Instant::now();
    let mut stop_check = || (started.elapsed() >= duration).then_some(SearchStopReason::TimedOut);
    let mut control = SearchControl::new(memory_budget, &mut stop_check);
    let outcome = search_medley(&input, &mut control);
    println!(
        "{}",
        serde_json::json!({
            "elapsedMs": started.elapsed().as_secs_f64() * 1000.0,
            "outcome": outcome,
        })
    );
    Ok(())
}
