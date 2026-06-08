# Medley 40/40 Exact Roadmap

Last updated: 2026-06-09 04:20 CST

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
- Opt-in bounded high-pair prefix upper was also tested on `P07:244` with the
  default `500000` retained-record limit. It was faster than pure scan
  (`115272ms`) but still bounded, gap `395539`, `memoryLimited=true`, peak
  `4220 MiB`, and only `3/4` configurations completed. This means high-pair
  record materialization is not the only live memory source in this case; do
  not promote the prefix implementation without a broader memory-source audit.

Rejected/diagnostic 2026-06-08 evidence:

- Full-matrix single-process runs, including proof-ledger variants, are not
  acceptance evidence. They carried heap pressure across cases; after
  `P03:260`, later rows became invalid empty/timed-out results.
- Full proof ledger should be collected only on bounded cases in isolated
  processes, or after memory-safe trace sampling exists.

Current acceptance standard:

- Minimum stage pass: `>=38/40` exact.
- Final target: `40/40` exact.
- Bounded-gap total must not regress against the latest clean pinned-fixture
  baseline.
- Failed runs and OOM are always failures.
- Peak working set must not exceed the latest clean pinned-fixture baseline by
  more than the active memory gate.

2026-06-09 diagnostic checkpoint:

- The branch checkpoint `ee8546a` added opt-in exact-join memory attribution,
  and `f292989` narrowed it to terminal-only snapshots after the first
  attribution run proved intrusive.
- Do not use `debugExactCandidateJoinMemoryAttribution=true` as proof-quality
  evidence yet. On `P07:244`, the clean current-branch baseline reproduced the
  pinned shape: `bounded`, elapsed `149709ms`, gap `55265`, peak `4210 MiB`,
  `candidate-fill-pair-refine`, `16/17` exact-join configurations completed,
  and pair count `8778953`.
- The same case with attribution enabled changed the frontier to an earlier
  bounded result even after terminal-only sampling: elapsed `128282ms`, gap
  `395539`, peak `4202 MiB`, `memory-soft-limit`, `3/4` exact-join
  configurations completed, and pair count `3776496`. Because the only snapshot
  was recorded after the abort, the likely issue is hard-case sensitivity to the
  debug option/input shape or runtime memory sampling, not the snapshot payload
  itself.
- Until attribution has its own no-op equivalence gate, rely on clean isolated
  baseline fields for acceptance analysis. If memory-source instrumentation is
  needed again, first prove `P07:244` equivalence against the no-debug baseline
  on status, score, gap, completed configurations, abort reason, and pair count.
- A local exact-join working-set release patch was tested and reverted. It
  cleared per-configuration generator heaps/caches and candidate key sets after
  each exact-join configuration. On `P07:244` it lowered peak heap only
  modestly (`4210 -> 4146 MiB`) but worsened the proof frontier from gap
  `55265` to `300781`, changed the abort reason to `candidate-fill-soft-limit`,
  and reduced completed exact-join configurations from `16/17` to `3/4`.
  Treat local release/clear-only patches as rejected unless they also preserve
  the same proof-trigger behavior.
- A lossless compact candidate-key patch was also tested and reverted. It
  reduced `P07:244` peak heap more strongly (`4210 -> 3308 MiB`), but produced
  the same controller failure shape: gap `300781`, `candidate-fill-soft-limit`,
  `3/4` completed exact-join configurations, and `85` root-pruned
  configurations. This proves the next blocker is not only representation
  memory; lowering memory can flip the controller into a worse low-incumbent /
  high-root-prune route.
- Two existing controller-disable switches were checked on `P07:244` and are
  not default candidates. `disableSkipDfsAfterUnprovedExactCandidateJoin=true`
  preserved the best score but widened the gap from `55265` to `307404`, raised
  peak memory from `4210` to `4552 MiB`, and changed the route to the known
  bad `candidate-fill-soft-limit` / `3/4` completion shape.
  `disableSameCoarseTightRootSkip=true` narrowly improved the gap
  (`55265 -> 52777`) and completed `17/18` exact-join configurations, but it
  increased elapsed time from about `144s` to `239s` and still remained
  bounded. This suggests the same-coarse tight-root skip is not the root cause;
  the reusable direction is a cheaper frontier-proof refinement, not broad
  skip removal.
- The opt-in `enableExactJoinSlotProofCutoff` path was implemented for
  diagnosis in `b05b32f`, then instrumented in `24ee519`. The first hard-case
  check on `P06:323` did not improve proof status: clean baseline was
  `bounded`, elapsed `41878ms`, gap `607201`, peak `4488 MiB`,
  `initial-candidate`; slot-proof-cutoff was still `bounded`, elapsed
  `51785ms`, gap `607201`, peak `4485 MiB`, `initial-candidate`. The computed
  per-slot minimum score cutoffs were only `[1332603, 1747729, 1978233]`,
  while the aborting slot-0 frontier peek upper stayed
  `3383411.5265578935`. This cutoff is too loose to reduce the initial
  candidate frontier, so do not continue this route by tuning the same cutoff
  formula or promoting it as a default.
- `exactNodeSoftLimit=1800000` was checked on `P06:323` and did not change the
  outcome: still `bounded`, gap `607201`, peak `4515 MiB`, and abort
  `initial-candidate`. The initial slot `next()` took only about `0.38ms`,
  showing that the immediate blocker was the memory guard, not the 900k node
  soft limit.
- Raising `memorySoftLimitMiB` on `P06:323` was diagnostic only, not an
  acceptance route. At `4560 MiB`, the case progressed past initial candidates
  but still stayed bounded at gap `607201`, peak `4564 MiB`, abort
  `candidate-fill-generator-aborted`, with candidate counts
  `[2251, 80879, 50858]`. At `6000 MiB`, it still stayed bounded at the same
  score/gap, peak `6010 MiB`, abort `candidate-fill-generator-aborted`, with
  candidate counts `[262522, 80879, 50858]`. This proves `P06:323` needs a
  lower-residency proof/generator strategy, not a simple memory or node limit
  increase.
- The opt-in `enableExactCandidateAnchorJoinBeforeHighBudgetPairUpper` path was
  added in `d4d828e` and rejected by first diagnostics. On `P06:323` with
  `memorySoftLimitMiB=4560`, it still failed before useful anchor proof work,
  aborting in `pair-upper`. On `P07:244` with default memory, it regressed the
  route badly: elapsed `248341ms`, score `8476866`, gap `520997`, peak
  `4201 MiB`, only `0/1` configurations completed, and abort
  `anchored-join-timeout`. Do not promote pre-high-budget anchored join as a
  default path.

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

This report is a sequencing requirement: after any full 40-case run finishes,
write the timestamped report and update this roadmap before starting the next
exploration run, optimization patch, or benchmark round.

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
- `enableExactCandidateAnchorJoinBeforeHighBudgetPairUpper`
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
- Avoid release/clear-only local working-set patches as well. The 2026-06-09
  release experiment showed that reducing memory after a configuration closes
  can still change later memory/proof gates and produce a worse frontier.
- Avoid memory compaction patches without a controller gate. The 2026-06-09
  lossless compact-key experiment reduced memory substantially but still
  worsened proof because controller behavior changed.
- Avoid simply relaxing guarded/staged candidate extension thresholds. The
  diagnostic `P07:244` run showed that generating more candidates can increase
  memory pressure and widen the final bounded gap if pair/frontier proof remains
  unclosed.
- Avoid seed-first all-scope proof ordering as a default route. The direct
  restored-cache diagnostic worsened `P07:244` bounded gap from `55265` to
  `307404` by moving into a worse memory-limited frontier.
- Avoid reducing the exact candidate soft limit to escape memory pressure. The
  direct 20k run confirmed a large memory reduction but a much weaker upper
  and incumbent.
- Keep `enableLowMemoryHighPairScan` research-only. It is useful as a
  memory-pressure diagnostic, but not fast enough to improve exact count. A
  viable follow-up must answer repeated pair-complement queries from a bounded
  memory structure instead of recomputing them from scratch.
- Keep `enableLowMemoryHighPairPrefixUpper` research-only as well. The first
  bounded-prefix implementation did not reduce `P07:244` peak memory enough,
  so the next patch should instrument candidate arrays, generator heaps,
  score-only caches, pair query caches, and solve bitsets separately before
  adding more high-pair variants.
- Keep `enableExactJoinSlotProofCutoff` research-only. On `P06:323`, the
  safe per-slot proof cutoff was far below the high-score frontier that causes
  the `initial-candidate` abort, so it gives neither proof conversion nor a
  useful memory win.
- Keep pre-high-budget anchored join research-only. Its first `P07:244`
  diagnostic consumed the proof budget before the normal multi-configuration
  route could improve the incumbent, causing a much worse bounded gap.

2026-06-09 cache-state checkpoint:

- A temporary `bestdori-cache` replacement with an older origin-main cache
  produced an invalid bad `P07:244` route: `bounded`, gap about `300781`, score
  `8476866`, abort `candidate-fill-soft-limit`, roughly `3/4` exact-join
  configurations completed, and `rootPrunedConfigurations` around `85`.
- That bad route is not sample contamination. The fixture row still matched the
  pinned baseline: profile id `61fde1e7-9201-4dd8-83ae-9cb332a0a3e5`, card count
  `1252`, payload hash
  `759eddb4f283ca2e5b5756c0c2af57c47fe3f698876088b63c6392a7b6e9f84d`.
- The cache replacement was the relevant environment drift. After restoring
  `temp/bandori-team-builder/bestdori-cache-backup-20260609-0209-current` to
  `bestdori-cache`, current HEAD default `P07:244` again reproduced the pinned
  clean route: `bounded`, gap `55265`, elapsed `136089ms`, peak `4209 MiB`,
  `memoryLimited=true`.
- Treat any diagnostic run made while `bestdori-cache-oldcache-used-*` was the
  active cache as invalid for acceptance or proof-quality comparison. Future
  benchmark reports must record the active cache source/checkpoint alongside
  fixture hash, profile hash, event key, optimization JSON, Node version, and
  `NODE_OPTIONS`.

2026-06-09 proof-order and K diagnostics:

- `temp/bandori-team-builder/run-medley-40case-isolated.cjs` deliberately
  deletes `HHWX_REAL_PROFILE_OPTIMIZATION_JSON` for baseline isolation. Opt-in
  optimization diagnostics must use the direct
  `benchmark-real-profiles-medley.cjs` runner or a future explicit passthrough
  variable; otherwise the run is just baseline and the conclusion is invalid.
- An opt-in seed-first all-scope proof ordering was implemented and rejected.
  With direct runner on restored-cache `P07:244`, it preserved the score
  `8551590` but worsened the gap from `55265` to `307404`, completed only
  `4/5` exact-join configurations, and still hit memory limit around
  `4201 MiB`. Revert this path; do not default seed-first proof ordering.
- Direct `exactCandidateSoftLimit=20000` was also rejected. It lowered peak
  memory to about `2314 MiB`, but widened `P07:244` gap to `375585`, found only
  score `8476866`, and aborted at the 20k candidate soft limit. High-budget
  candidate proof is necessary for this case; the problem is the memory shape
  of high-budget pair/candidate proof, not simply K being too large.

2026-06-09 runtime memory telemetry and generic-frontier diagnostics:

- Commit `b13c39e` added default runtime memory telemetry fields under
  `stats.profiling`: Node heap, RSS, external, arrayBuffers, and the actual
  memory-guard value. This is diagnostic-only and keeps the historical
  `peakUsedHeapMiB` field unchanged for compatibility.
- Current default 5-bounded diagnostic:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-08T19-43-01-660Z.json`.
  It reproduced the clean bounded total exactly: `0/5` exact, bounded-gap total
  `1819282`, no failed subprocess, all five rows `memoryLimited=true`.
- The five bounded rows all hit RSS/working-set pressure, not pure V8 heap:
  RSS minus heap was about `679-718 MiB` on `P03:260`, `P07:244`, `P07:260`,
  and `P08:244`; `P06:323` was similar at about `692 MiB` but reached
  `4472 MiB` before the initial-candidate abort.
- Per-case telemetry from the current default 5-bounded run:
  - `P03:260`: gap `370472`, abort `candidate-fill-generator-aborted`, peak
    RSS/heap `4201/3522 MiB`, generated candidates `168316`, max candidate
    count `152377`.
  - `P06:323`: gap `607201`, abort `initial-candidate`, peak RSS/heap
    `4472/3780 MiB`, no candidate/pair work reached. This is a slot candidate
    generator residency problem before exact-join candidate fill.
  - `P07:244`: gap `55265`, abort `candidate-fill-pair-refine`, peak RSS/heap
    `4208/3504 MiB`, generated candidates `1063396`, pair count `8778953`.
  - `P07:260`: gap `296599`, abort `candidate-fill-generator-aborted`, peak
    RSS/heap `4201/3508 MiB`, generated candidates `373136`, pair count
    `5437641`.
  - `P08:244`: gap `489745`, abort `candidate-fill-generator-aborted`, peak
    RSS/heap `4201/3483 MiB`, generated candidates `742274`, pair count
    `16365204`, high-pair records `60030`.
- Raising `memorySoftLimitMiB` only to `4290` on `P07:244` was rejected. It
  stayed bounded, widened gap to `307404`, hit peak `4291 MiB`, and changed the
  abort to `candidate-fill-generator-aborted`. Do not use a simple +2% memory
  budget bump as an optimization route.
- Opt-in targeted candidate-fill pair-refine was implemented in `41a0e85`,
  tested on `P07:244`, then reverted in `7fe6d05`. It stayed bounded, widened
  gap to `307404`, and aborted earlier at `high-budget-pair-upper`.
- Opt-in near-frontier proof sweep was implemented in `e9e6318`, tested on
  `P07:244`, then reverted in `0cb61d7`. Default sweep widened gap to
  `176105`; conservative `rootPrefix=16` stayed bounded at gap `56994`.
  Do not continue proof-order tuning without a stronger proof-cost model.
- Commit `3c5ac7b` removed one lossless generator residency source by avoiding
  slotUpperHeap/active Set maintenance while the exact slot generator is in
  slot-key mode and replacing the active Set with a node flag in global-key
  mode. P06/P07 smoke showed no exact or peak-memory improvement:
  `P06:323` remained bounded at gap `607201`, peak `4469 MiB`; `P07:244`
  remained bounded at gap `55265`, peak `4209 MiB`. Keep the patch only as a
  small lossless cleanup; it is not sufficient for the 38/40 gate.
- Commit `a49a73f` compacted exact slot generator nodes by replacing retained
  per-node `selectedCards` arrays with fixed card fields. Typecheck and
  `git diff --check` passed. The P06/P07 hard smoke still showed no proof or
  memory improvement: `P06:323` remained bounded at gap `607201`, peak
  `4475 MiB`; `P07:244` remained bounded at gap `55265`, peak `4208 MiB`.
  This indicates slot-generator node array copies are not a primary memory
  source. The next generic route should target exact candidate/result payloads,
  pair query caches, or streamed/chunked frontier proof rather than further
  node-shape tweaks.
- Commit `0dfba16` tried compacting candidate instance-key arrays into one
  signature string, then `e89e22b` reverted it. The P06/P07 smoke had a small
  positive signal on `P07:244` (`55265 -> 52777` gap, peak about
  `4202 MiB`), but the 5-bounded verification failed the memory gate:
  `P03:260` peaked at `4724 MiB` and `P07:260` peaked at `5430 MiB`, with
  both cases moving into `initial-candidate` memory pressure. Do not continue
  candidate instance-key compaction as a default route.

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
2. `initial-candidate` low-memory fallback for `P06:323`. The next generic
   direction here is a generator/proof path that can advance or bound the
   high-score frontier without materializing the full first candidate, not a
   simple per-slot minimum-score cutoff.
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

1. Baseline equivalence has been restored after restoring the active
   `bestdori-cache` checkpoint. Keep the restored cache in place for all
   acceptance and hard-case diagnostics unless a run explicitly records a new
   cache checkpoint.
2. Implement a controller-safe low-memory exact-join proof path focused on
   `P07:244`, `P03:260`, `P07:260`, and `P08:244`: use the clean baseline and
   telemetry counters first. The next viable patch must reduce exact slot
   candidate / pair frontier residency without lowering proof strength or
   changing controller route. Simple memory-limit bumps, proof-order tuning,
   pair-refine target changes, and cache clearing have all failed.
3. For `P06:323`, do not spend the next iteration on slot proof cutoff. If it
   is targeted, build a low-memory initial-candidate fallback that can return a
   proof-relevant upper or partial frontier when node expansion hits the soft
   limit.
4. For generator/candidate memory, compact node representation has now been
   tried and did not move the hard cases. The next generic implementation
   candidate is compact or streamed exact candidate/frontier data: reduce
   duplicate result/card-id/pair-query residency while preserving deterministic
   candidate order, incumbent score quality, and exact upper semantics.
5. Re-run the 5 bounded rows plus the 4 guardrail exact rows after the next
   candidate/frontier patch.
6. If at least two bounded rows convert and guardrails stay exact, re-run the
   full isolated 40-case matrix and generate another timestamped report.
