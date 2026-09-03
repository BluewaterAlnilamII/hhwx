# Bandori Medley Testing and Verification

Chinese version: [medley-testing.zh-CN.md](medley-testing.zh-CN.md)

## 1. What the tests establish

The medley calculator has three separate correctness questions:

1. **Input and scoring:** does an HHWX profile plus current master/chart data become the intended card parameters, skills, notes and exact team score?
2. **Search completeness:** does the optimized search return the same optimum as exhaustive enumeration, and can every pruning decision be justified by a safe upper bound?
3. **Browser delivery:** does the Web Worker run the current WebAssembly artifact and preserve progress, timeout, incomplete-result and hydration behavior?

No single benchmark answers all three. A high score does not prove scoring correctness because an overcounting bug can also raise a result. Matching a historical score does not prove optimality because the historical search may itself have been incomplete. Finishing quickly does not prove that a bound was safe.

## 2. Portable repository checks

These checks use only tracked files and are available to every contributor after installing the repository dependencies and Rust toolchain.

### TypeScript source normalization

```bash
npm run test:medley-foundation:source
```

The focused Node test suite covers profile decoding, character bonuses, card parameters, area items, event parameters, skill normalization, chart conversion, fixed-team evaluation, search-input construction and the frontend-facing source contract. Its fixtures are deliberately small so a failed rule can be isolated without running a large search.

### Rust formatting, linting and tests

```bash
npm run format:medley-foundation
npm run lint:medley-foundation
npm run test:medley-foundation
npm run check:medley-foundation:wasm
```

`test:medley-foundation` runs the locked Rust workspace tests. The important evidence includes:

- fixed-input JSON validation;
- production scorer agreement with the direct 120-order reference scorer;
- tiny exact searches compared with an independent exhaustive oracle;
- individual and joint upper bounds checked against every legal tiny completion;
- forward/backward conditional values checked against exhaustive residual assignment;
- physical-card conflicts, character uniqueness, required characters and stable ties;
- exact local-join parity across scan and indexed implementations;
- strict cuts that retain equality;
- zero search-storage budget returning `incomplete`, stop-control reason preservation, strict input validation and hydration score-disagreement handling.

The portable evidence is organized as follows:

| Claim under test | Test source | Concrete check |
| --- | --- | --- |
| Profile, parameter, skill, chart and source-request normalization | [`tests/bandori-medley-*.test.mjs`](../../tests) | Exercises the public TypeScript builders from HHWX-shaped source data through normalized fixed-team and search requests. |
| Versioned Rust input contract | [`json_contract.rs`](../../crates/bandori-medley-model/tests/json_contract.rs) | Accepts the committed valid fixture and rejects unknown scoring-rule versions. |
| Optimized scoring equals the direct 120-order calculation | [`exact_score.rs`](../../crates/bandori-medley-search/src/exact_score.rs) | `production_song_scores_match_reference_bits`, `score_range_matches_all_120_reference_orders` and the overlap/probability case compare both implementations. |
| Complete search does not omit a legal optimum | [`tiny_exact_search.rs`](../../crates/bandori-medley-search/tests/tiny_exact_search.rs) | `tiny_search_matches_the_complete_reference_oracle_across_memory_budgets` compares the optimized solver with an independent exhaustive oracle. |
| Bounds and deductions remain safe | [`fast_upper.rs`](../../crates/bandori-medley-search/src/fast_upper.rs), [`joint_upper.rs`](../../crates/bandori-medley-search/src/joint_upper.rs), [`search.rs`](../../crates/bandori-medley-search/src/search.rs) | Exhaustive tiny completions cover individual bounds, forward/backward joint bounds and occupancy modes; focused cases cover projected singleton closure and indexed/scan join parity. |
| Failure paths preserve distinct outcomes | [`control.rs`](../../crates/bandori-medley-search/src/control.rs), [`validation.rs`](../../crates/bandori-medley-search/src/validation.rs), [`hydration.rs`](../../crates/bandori-medley-search/src/hydration.rs), [`tiny_exact_search.rs`](../../crates/bandori-medley-search/tests/tiny_exact_search.rs) | A zero storage budget returns `incomplete`; control preserves `TimedOut`; invalid requests and hydration score disagreements return errors rather than a false `exact`. |

### WebAssembly artifact

After changing Rust code that ships to the browser, regenerate the committed package:

```bash
npm run build:medley-foundation:wasm
```

The command requires a `wasm-bindgen-cli` version matching the workspace's locked `wasm-bindgen` crate. Then rerun the Rust and TypeScript checks. The ordinary Next.js build consumes `src/lib/bandori/medley-wasm/pkg/` but does not regenerate or execute it, so testing only native Rust code can leave the browser on an older solver.

For a release-oriented application check, also run:

```bash
npm run typecheck
npm run lint
npm run build
```

No tracked automated command currently executes the generated JavaScript/WebAssembly binding end to end. Before release, manually start the application, run a retained medley case through the Team Builder page, and confirm that search progress, terminal status and hydrated results appear. Record this as a manual check rather than claiming it was covered by `cargo check` or `next build`.

## 3. What a scoring test should compare

The fixed-team path separates score verification from search. A useful scoring case records:

- the source profile and its gameplay server;
- the exact card, character, skill, area-item, event, song and chart records used;
- the three ordered song IDs and difficulties;
- PERFECT rate;
- selected cards, leader positions and area-item IDs;
- calculated card, area-item and event parameters;
- normalized notes and skill triggers;
- per-song and medley scores;
- scoring schema and rules versions.

The direct reference implementation evaluates all 120 first-five skill orders note by note. Production scoring uses the algebraic reduction documented in [Medley Rules and Scoring](medley-foundation.md). Their agreement checks the optimized score path without assuming that two copies of the same optimization are correct.

The two Rust scorers intentionally share one normalized note input, so their agreement cannot independently detect a TypeScript chart-normalization error. Cover that boundary with a retained raw-chart fixture whose expected scoring notes, triggers and anchored times are asserted directly; scorer parity then checks the calculation performed on that normalized input.

## 4. What an exact-search test should compare

On a tiny roster, exhaustive enumeration is the clearest oracle: enumerate every legal area configuration, every legal assignment of physical cards to three teams and every leader, then compare the complete optimum and tie representative with optimized search.

Bound-specific tests make failures easier to diagnose. For a partial state, enumerate every legal completion and verify:

```text
reported upper bound >= maximum exact completion score
```

The check must include equality cases because the production search prunes only when an upper bound is strictly below the incumbent. Conditional destination and occupancy bounds require the same comparison after applying the stated condition.

Changing memory limits, cache capacity, branch order or heuristic proposals must not change an `exact` score or its deterministic tie representative. Those settings may change runtime, diagnostics and whether a time-limited run finishes.

## 5. Optional real-profile regression

HHWX maintainers may also use an ignored archive under `temp/medley-regression-fixtures/`. It contains private profiles, cached master/chart records, historical reports, normalized inputs and run outputs. These files may contain account data and must not be committed or published.

The small opt-in acceptance entry is:

```powershell
$env:HHWX_MEDLEY_ACCEPTANCE_ROOT='<private fixture package>'
npm run accept:medley-search:real
```

Without `HHWX_MEDLEY_ACCEPTANCE_ROOT`, the script reports that the private check was skipped. A skipped private check is not a failure of the portable test suite, but it is also not evidence that the real-profile case ran.

The larger local comparison runner reads `temp/medley-regression-fixtures/manifest.json`:

```bash
node --import tsx scripts/compare-bandori-medley-search.mjs --case 119-no-event
node --import tsx scripts/compare-bandori-medley-search.mjs --remaining
node --import tsx scripts/compare-bandori-medley-search.mjs --completed-profiles
node --import tsx scripts/compare-bandori-medley-search.mjs --high-pressure
node --import tsx scripts/compare-bandori-medley-search.mjs --all-profiles
```

These commands are maintainer tools, not portable project checks. Diagnostic overrides are accepted only with `--diagnose`; they measure alternative thresholds and do not change production defaults.

## 6. Historical comparison rules

A historical score may be compared only when the archived profile and all recorded request settings agree: song IDs and order, difficulties, PERFECT rate and event settings. A profile label is not a payload version, and a directory name such as `main` or `dev` is not proof of the commit that produced a report.

Many older reports did not preserve their source commit or hashes of the master and chart data used. Such a score is a regression target under the explicitly recorded snapshot assumption; it does not prove that the old and new runs used byte-identical input. Reports must distinguish:

- **proved:** supported by retained payloads, settings, hashes and current output;
- **assumed:** required because older provenance is incomplete;
- **unrecoverable:** cannot be reconstructed from retained evidence.

For a same-input regression target, the current search passes the score check when it finds a score no lower than the retained reference. It passes the exactness check only when it returns `exact`. Those are separate statements: reaching a reference score during an incomplete run does not prove the global optimum.

## 7. Run artifacts

Private runs write `run.json`, `summary.json` and per-scene inputs, outputs and results below `temp/medley-regression-fixtures/runs/<timestamp>/`. A useful run record includes:

- source commit and dirty diff;
- runtime and search limits;
- profile payload and normalized-input hashes;
- hashes of every master/chart file actually used;
- full result and terminal status;
- elapsed time, time to best score and hydration time;
- sampled process working set when collection is enabled;
- budget-accounted peak search storage.

Run-specific tables and interpretations belong beside those ignored artifacts. Stable public documentation records the method and meaning of the fields, not the latest machine-specific measurements.
