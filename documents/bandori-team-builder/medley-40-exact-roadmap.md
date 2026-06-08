# Medley 40/40 Exact Roadmap

Last updated: 2026-06-08 23:30 CST

This file is the persistent working note for the current medley optimizer goal.
Keep it current before and after benchmark runs or proof-path changes, so future
analysis can resume from this file without relying on chat context.

## Current Goal

Primary target:

- Scope: the 10 normal retained real-profile samples, `P01` through `P10`.
- Events: `none`, `244`, `260`, and `323`.
- Matrix size: `10 profiles * 4 events = 40 all-scope cases`.
- Search budget: `300000ms` per case.
- Active stage gate: at least `38/40` exact, with no failed run and no OOM.
- Final success condition: `40/40` exact, with no failed run and no OOM.

Out of scope for the primary target:

- `P11` / `7627fd2f-8a29-4462-99ee-7085789d7561`.
- The 2112-card full-pool stress profile remains useful as a separate memory
  and scalability sample, but it must not be mixed into the default 40-case
  acceptance target.

## Current Status

Known retained historical baselines:

- 2026-06-02 full matrix: `36/40` exact, `4` bounded, `0` timeouts, bounded-gap
  total `1534986`, P95 `231981ms`, max `295714ms`.
- 2026-06-05 post-recovery focus/full evidence: `38/40` exact, bounded-gap total
  `582812`, max elapsed `262539ms`, P95 `208250ms`, peak working set about
  `3821.7 MiB`. The remaining bounded rows were `P02:260` and `P10:244`.

Current clean pinned 2026-06-08 baseline:

- Report:
  `documents/bandori-team-builder/medley-40-exact-report-2026-06-08-204728.md`
- Raw result:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-08T11-42-34-917Z.json`
- Fixture:
  `temp/bandori-team-builder/real-profile-medley-p01-p10-40exact-fixture.json`
- Runner: process-per-case isolated baseline, all-scope only, default maximize
  optimization, `debugConfigurationTrace=false`.
- Result: `35/40` exact, `5` bounded, `0` failed subprocesses, no stderr, no
  process OOM.
- Bounded-gap total: `1819282`.
- Elapsed median/P95/max: `61192ms` / `194283ms` / `276080ms`.
- Peak sampled heap: `4488 MiB`.
- Bounded rows:
  - `P03:260`: gap `370472`, `candidate-fill-generator-aborted`, peak `4205 MiB`.
  - `P06:323`: gap `607201`, `initial-candidate`, peak `4488 MiB`.
  - `P07:244`: gap `55265`, `candidate-fill-pair-refine`, peak `4210 MiB`.
  - `P07:260`: gap `296599`, `memory-soft-limit`, peak `4206 MiB`.
  - `P08:244`: gap `489745`, `candidate-fill-generator-aborted`, peak `4207 MiB`.

The `37/40` stage gate failed. The next practical stage target is to convert at
least two of these five bounded rows without regressing any near-boundary exact
row, especially `P08:260`, `P10:260`, `P08:323`, and `P10:244`.

2026-06-08 checkpoint toward the `38/40` stage:

- Stage target was raised to `38/40` exact, with the explicit anti-regression
  gate that at least three of the current five bounded rows must convert, the
  current 35 exact rows must not regress, bounded-gap total must stay at or
  below `1819282`, and peak memory must stay within the clean baseline plus
  2%.
- A simple dynamic candidate-fill slot order was rejected. It moved work across
  slots but did not improve exact count, and `P03:260` peak memory rose above
  the allowed gate.
- A high-pair cache compaction that stopped retaining full pair record objects
  was rejected. `P07:244` stayed exact only under high-memory diagnostic limits,
  and peak memory did not decrease.
- Score-only candidate key compaction was rejected. It briefly converted
  `P08:244`, but it regressed the guardrail `P08:323` from exact to bounded and
  pushed the 9-case peak memory to `5549 MiB`.
- Large-pool conflict-BnB fallback was rejected as a default candidate. With
  exact-join disabled, `P07:244` still timed out at 300s; with exact-join
  enabled, it changed the memory trajectory without closing proof.
- A high-memory diagnostic remains useful: `P07:244` can prove exact around
  `5609 MiB` peak, so the proof path is logically capable of closing; the
  remaining problem is reducing candidate/frontier residency by roughly 1 GiB
  without changing tie order or proof semantics.
- A lightweight score-only result object experiment was rejected. It lowered
  retained result payloads, but `P07:244` stayed bounded and the high-memory
  diagnostic degraded to gap `300781`, aborting at `candidate-fill-soft-limit`
  instead of proving exact.
- Explicitly clearing the score-only WeakMap cache at configuration release was
  also rejected. It reduced `P07:244` peak heap from roughly `4210 MiB` to
  `3544 MiB`, but worsened the bounded gap from `55265` to `300781` and changed
  the failure shape to `candidate-fill-soft-limit`. This is diagnostic evidence
  that memory reduction alone can remove useful frontier work; acceptable
  patches must preserve or replace the proof strength that the retained cache
  currently enables.
- The existing opt-in staged/guarded candidate extension was rechecked on
  `P07:244`. Guarded extension did trigger from `400000` to `600000`
  candidates with about `180052ms` remaining, but the case still ended bounded,
  gap `395539`, peak `4201 MiB`, and `memoryLimited=true`; staged extension did
  not trigger. Do not loosen extension thresholds as the next default strategy.
- Opt-in low-memory high-pair direct scan was added as a research path and
  tested on `P07:244`. It confirmed the memory hypothesis, dropping peak heap
  to about `2038-2095 MiB`, but it timed out at `300s`, completed no
  configurations, and ended with gap `505642`. The direct scan is not an
  acceptance candidate; it is evidence that the next memory-safe proof path
  needs a bounded prefix/high-pair upper cache or chunked proof, not pure
  per-query scanning.

Rejected/diagnostic 2026-06-08 evidence:

- Full-matrix single-process runs, including proof-ledger variants, are not
  acceptance evidence. They carried heap pressure across cases; after
  `P03:260`, later rows became invalid empty/timed-out results.
- Full proof ledger should be collected only on bounded cases in isolated
  processes, or after memory-safe trace sampling exists.

Current acceptance standard:

- Minimum stage pass: `>=37/40` exact.
- Final target: `40/40` exact.
- Bounded-gap total must not regress against the latest clean pinned-fixture
  baseline.
- Failed runs and OOM are always failures.
- Peak working set must not exceed the latest clean pinned-fixture baseline by
  more than the active memory gate.

## Evidence Hygiene Rules

Do not use rolling `last-*` files as acceptance evidence. They are convenient
checkpoints and can be overwritten by smoke runs.

Every acceptance run must record:

- fixture path;
- profile labels, source IDs, card counts, and payload hashes;
- event list;
- song IDs;
- duration;
- optimizer variant;
- git branch and commit;
- exact count, bounded count, bounded-gap total, elapsed percentiles, max
  elapsed, and peak working set;
- per-bounded-case proof information. Prefer
  `proofLedgerSummary.topUnclosedByGap` when collected safely; otherwise record
  the flattened exact-join abort reason, candidate counts/cutoffs, pair upper
  counters, phase elapsed, and memory fields from the clean isolated result.

Every completed 40-case run must also generate a timestamped human-readable
report. Raw JSON is not enough. The report must include:

- run timestamp, branch/commit, fixture path, song IDs, event list, duration,
  and optimizer variant;
- per-case exact/bounded status, elapsed time, wall elapsed time if available,
  peak working set / memory sample, score, observed upper bound, and bounded
  gap;
- aggregate exact count, bounded count, bounded-gap total, elapsed median/P95,
  max elapsed, peak working set, failed count, and OOM count;
- bounded-case reason analysis, including proof ledger top unclosed entries
  when safely collected, exact-join abort reason, candidate counts/cutoffs,
  pair upper information, and phase elapsed/memory where available;
- failure analysis that separates score quality, proof frontier closure,
  timeout, memory pressure, and runner/sample hygiene issues;
- concrete improvement recommendations, ordered by expected proof impact and
  risk;
- a clear statement of whether the run is an acceptance baseline, diagnostic
  variant, or rejected experiment.

The report must include the analysis parameters needed for replay and causal
review:

- runtime environment: OS, Node.js version, process architecture, available
  memory if known, and whether the run used placeholder or real Supabase env;
- command line and environment variables used by the runner, including fixture
  path, run ID, case filters, variant filters, repeat count, and duration;
- optimizer options JSON, including proof/debug flags, exact candidate join
  options, no-op/prefix flags, warmup flags, candidate limits, timeboxes, memory
  soft limits, and any experimental toggles;
- scoring input parameters: objective, server/region, event ID or `none`,
  event bonus data version/source, temporary-card handling state, song IDs,
  difficulties, chart note counts, perfect-rate/combo assumptions, and medley
  combo carry-over settings;
- fixture metadata: profile label, source profile ID, profile kind, card count,
  payload SHA-256, payload size, storage codec, and generation seed/source;
- per-case search-shape counters: raw/pruned area-item configuration counts,
  started/completed/root-pruned configurations, exact-join call/completion/abort
  counts, DFS timeout state, and remembered frontier counts where available;
- proof-frontier parameters and counters: root/effective upper bounds, active
  observed upper source, exact-join abort reason/slot, candidate counts/cutoffs,
  pair upper/unseen upper, pair/candidate-fill/solve elapsed, and proof ledger
  top unclosed entries;
- memory diagnostics: peak working set, sampled heap/working-set fields,
  memory-limit flags, memory-heavy phase entries, and OOM/error text if any;
- comparison context: previous baseline report path, expected bounded rows,
  exact-count/gap/memory deltas, and whether results are comparable or
  diagnostic-only because sample, variant, or runner inputs changed.

Recommended report path:

```text
documents/bandori-team-builder/medley-40-exact-report-YYYY-MM-DD-HHMMSS.md
```

Recommended fixed fixture path for the primary goal:

```text
temp/bandori-team-builder/real-profile-medley-p01-p10-40exact-fixture.json
```

Recommended fixed baseline output prefix:

```text
temp/bandori-team-builder/medley-40-exact-baseline-YYYY-MM-DD-*.json
```

The benchmark runner should be invoked with an explicit fixture path and output
run ID. If the runner cannot pin fixture and run ID explicitly, fix the runner
before running long benchmarks.

## Frozen Routes

These routes are diagnostic or research-only for now:

- `enablePreProofSeedWarmup`
- `enableExactJoinPrefixSeed`
- larger seed timeboxes
- larger top-K / candidate limits as a default strategy
- fixed-card repair and neighborhood repair as proof strategy
- greedy comparison paths as proof evidence

Reason: the latest guarded prefix-seed hard-case gate regressed proof status.
Baseline was `2/4` exact with gap `582102`; guarded prefix seed was `1/4` exact
with gap `1005031`. No seed-only solve actually ran in that failed path
(`exactJoinPrefixSeedCallCount=0`), so the next work must prove no-op
equivalence before any new proof patch.

## Active Diagnostic Assets

Keep these assets and update this section when they change:

- Proof ledger: enabled by `optimization.debugConfigurationTrace=true`.
- Proof ledger output fields: `profiling.proofLedger` and
  `profiling.proofLedgerSummary`.
- No-op variants:
  - `prefixForceNoop`
  - `prefixGuardOnly`
  - `currentGuardedPrefix`
- Latest shape smoke:
  - `temp/bandori-team-builder/medley-prefix-seed-acceptance-2026-06-08-prefix-noop-smoke.json`
  - `prefixForceNoopEquivalent=true`
  - `prefixGuardOnlyEquivalentWhenNoCall=true`
  - `currentGuardedNoCallEquivalent=true`

The 10s smoke only validates runner shape. It is not proof-quality evidence.

## Optimization Path

Phase 0: restore the clean target baseline. Completed for the current worktree
by the 2026-06-08 isolated baseline.

- Rebuild or recover the fixed `P01`-`P10` fixture.
- Confirm each label maps to the intended profile ID, card count, and payload
  hash.
- Run the 40-case baseline with process-per-case isolation.
- Update this file with the exact bounded rows and their exact-join diagnostics.

Phase 1: memory-capped exact-join proof patch.

- Primary target: convert `P07:244`. It has the smallest bounded gap
  (`55265`, `0.65%`) and fails in `candidate-fill-pair-refine` after 16
  completed configurations and 8.78M pair records.
- Secondary targets: `P03:260` and `P08:244`, both
  `candidate-fill-generator-aborted`, and `P06:323`, which fails before
  candidate fill at `initial-candidate`.
- Required patch shape: chunked or streamed proof/upper-bound work that reduces
  pair/candidate materialization memory; do not increase default candidate
  limits and do not add seed stages.
- Guardrail exact cases: `P08:260`, `P10:260`, `P08:323`, and `P10:244` must
  remain exact.
- Avoid cache-only or result-only memory reductions as default paths. The
  rejected 2026-06-08 experiments showed lower heap but worse proof closure.
  The preferred implementation shape is an exact-join internal compact or
  streamed representation that keeps deterministic candidate order and upper
  proof semantics while reducing duplicate object/string/record residency.
- Avoid simply relaxing guarded/staged candidate extension thresholds. The
  diagnostic `P07:244` run showed that generating more candidates can increase
  memory pressure and widen the final bounded gap if pair/frontier proof remains
  unclosed.
- Keep `enableLowMemoryHighPairScan` research-only. It is useful as a
  memory-pressure diagnostic, but not fast enough to improve exact count. A
  viable follow-up must answer repeated pair-complement queries from a bounded
  memory structure instead of recomputing them from scratch.

Phase 2: no-op equivalence gate, required only when touching prefix/seed
diagnostic paths again.

- Run `baseline`, `baselineProofLedger`, `prefixForceNoop`, `prefixGuardOnly`,
  and `currentGuardedPrefix` on the hard cases that are close to proof
  boundaries.
- Required: when seed solve does not run, result status, score, gap, completed
  configurations, root-pruned configurations, and configuration status sequence
  must stay equivalent. Allowed differences are elapsed time, memory sampling,
  and diagnostic counters.
- Do not start proof-only algorithm patches until this gate is stable.

Phase 3: proof-frontier patches, one class at a time.

Prioritize by the clean 40-case proof ledger, not by seed score:

1. memory-capped candidate fill / pair upper work for `P07:244`, `P03:260`,
   `P08:244`, and `P07:260`.
2. `initial-candidate` low-memory fallback for `P06:323`.
3. same-coarse proof-cost scheduling for expensive closed or near-closed groups
   after memory pressure is reduced.

Each patch must pass:

- no-op gate unchanged;
- hard-case acceptance no worse than baseline;
- 40-case bounded count not higher;
- 40-case bounded-gap total not higher;
- no new OOM;
- peak working set not above baseline by more than the selected memory gate.

## Current Next Step

The next actionable step is not another seed experiment. It is:

1. Implement a low-memory exact-join proof path focused on `P07:244`:
   chunk/stream pair upper, a bounded high-pair prefix upper cache, or an
   internal compact candidate representation, so the final small-gap frontier
   can close without retaining all pair records and duplicate
   candidate/result/key objects.
2. Re-run the 5 bounded rows plus the 4 guardrail exact rows.
3. If at least two bounded rows convert and guardrails stay exact, re-run the
   full isolated 40-case matrix and generate another timestamped report.
