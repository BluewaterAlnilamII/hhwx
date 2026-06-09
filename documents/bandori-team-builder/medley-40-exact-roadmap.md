# Medley 40/40 Exact Roadmap

Last updated: 2026-06-09 23:07 CST

This file is the persistent working note for the current medley optimizer goal.
Keep it current before and after benchmark runs or proof-path changes, so future
analysis can resume from this file without relying on chat context.

## Current Goal

Primary target:

- Scope: the 10 normal retained real-profile samples, `P01` through `P10`.
- Events: `none`, `244`, `260`, and `323`.
- Matrix size: `10 profiles * 4 events = 40 all-scope cases`.
- Search budget: `300000ms` per case.
- Current pinned checkpoint: `39/40` exact, with no failed subprocess, no
  timeout, no memory-limited case, and no OOM.
- Current only bounded row: `P03:260`.
- Next and final working target: `40/40` exact while preserving the pinned
  `39/40` checkpoint.
- Final success condition: `40/40` exact, no failed subprocess, no timeout, no
  OOM, and no memory-limit regression under the active `4488 MiB` memory gate.

Goal tool note:

- The active Codex goal object was created earlier in this thread and cannot be
  edited in place except to mark it complete or blocked. Treat this section as
  the authoritative detailed goal contract for the current execution phase.

Current pinned acceptance baseline:

- Raw result:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T05-44-21-186Z.json`.
- Report:
  `documents/bandori-team-builder/medley-40-exact-report-2026-06-09-141817.md`.
- Branch/commit at acceptance: `dev/medley-39-exact-frontier` / `4bf5a28`.
- Result: `39/40` exact, bounded-gap total `370472`, peak working set
  `4170 MiB`, bounded row `P03:260` only.

Core plan:

- Keep seed, greedy, prefix-seed, broad candidate-limit increases, and broad
  memory-compaction paths frozen for the final `40/40` objective.
- Focus on proof conversion for `P03:260`, specifically the
  `RaiseASuilen/happy` same-coarse event-root frontier.
- Prefer lossless lower-residency exact-join/proof representations and
  proof-only frontier closure over score-oriented incumbent work.
- Allow opt-in diagnostic probes to record tighter uppers, elapsed time, and
  memory, but do not feed unproved diagnostic uppers into active proof
  scheduling.
- Preserve `P06:323` and all other currently exact hard cases; any P03 win that
  regresses a guard case is rejected.

Important workflow:

- Work only in the independent worktree/branch
  `dev/medley-39-exact-frontier`; keep `D:\Workspace\hhwx` on clean `main`.
- Before algorithm edits, record the hypothesis and acceptance gate in this
  file. After benchmark runs, record the raw result path and accept/reject
  reason here before starting another long run.
- Commit and push after stable static validation or durable benchmark evidence,
  so current work is not lost in an unstable local environment.
- Run targeted single-case diagnostics first, then the hard guard set. Run the
  full isolated 40-case matrix only after the guard set passes.
- After every completed full 40-case run, generate a timestamped report with
  timing, memory, exact/bounded status, bounded reasons, failure analysis,
  replay parameters, and next recommendations.

Acceptance gates:

- Stage gate: never regress below the pinned `39/40` exact checkpoint.
- Final gate: full isolated matrix reaches `40/40` exact.
- Bounded-gap total must not exceed `370472` before final conversion; after
  final conversion it must be `0`.
- No currently exact hard guard case may become bounded. Guard set:
  `P03:260`, `P06:323`, `P07:260`, `P08:323`, `P10:244`, `P10:260`,
  `P07:244`, and `P08:244`.
- Peak working set must stay within the active memory gate, with no process
  OOM or failed subprocess.
- Static validation for a promotable patch: `npm.cmd run typecheck`,
  `npm.cmd run lint` when practical before PR, `npm.cmd run build` with safe
  placeholder env when practical before PR, and `git diff --check`.
- Benchmark evidence must use the fixed P01-P10 fixture and process-per-case
  isolation; same-process full-matrix runs are diagnostic-only.

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

Current 2026-06-09 checkpoint:

- Report:
  `documents/bandori-team-builder/medley-40-exact-report-2026-06-09-001029.md`
- Raw result:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T00-10-29-221Z.json`
- Branch/commit: `dev/medley-greedy-seed-acceptance` / `edf3879`.
- Result: `37/40` exact, `3` bounded, `0` failed subprocesses, no process OOM.
- Bounded-gap total: `1274272`.
- Elapsed median/P95/max: `18406ms` / `37598ms` / `39932ms`.
- Peak sampled heap: `4203 MiB`.
- Converted from the clean pinned baseline: `P07:244` and `P08:244`.
- Remaining bounded rows:
  - `P03:260`: gap `370472`, controlled root slot-boundary event skip,
    peak `1979 MiB`, no timeout and no memory limit.
  - `P06:323`: gap `607201`, controlled large-gap event skip, peak
    `1273 MiB`, no timeout and no memory limit.
  - `P07:260`: gap `296599`, `candidate-fill-generator-aborted`, peak
    `4203 MiB`, `memoryLimited=true`.

The `37/40` checkpoint is retained as historical evidence. It is superseded by
the `38/40` checkpoint below; compare new patches against the newer checkpoint
unless specifically investigating the `P07:260` conversion.

Current pinned 2026-06-09 `38/40` checkpoint:

- Report:
  `documents/bandori-team-builder/medley-40-exact-report-2026-06-09-111704.md`
- Raw result:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T03-17-04-125Z.json`
- Rejected same-process report:
  `documents/bandori-team-builder/medley-40-exact-report-2026-06-09-104805-rejected.md`
- Branch/commit: `dev/medley-greedy-seed-acceptance` / `6d72c48`.
- Runner: process-per-case isolated runner, `--expose-gc`, all-scope only.
- Optimization: `memorySoftLimitMiB=4488`, `exactNodeSoftLimit=5000000`,
  `skipConfigurationSeedingWhenMemoryHeadroomBelowMiB=400`,
  `lowMemoryInitialCandidateSyncMaxSameCoarseProofElapsedMs=60000`,
  `lowMemoryInitialCandidateSyncMinMemoryHeadroomMiB=0`,
  `lowMemoryInitialCandidateSyncLocalAbortOnly=true`,
  `lowMemoryInitialCandidateSyncLightUpper=true`,
  `lowMemoryInitialCandidateSyncTimeboxMs=60000`,
  `enableLowMemoryInitialCandidateSyncGcProbe=true`, and
  `debugConfigurationTrace=true`.
- Result: `38/40` exact, `2` bounded, `0` failed subprocesses, no process OOM.
- Bounded-gap total: `977673`.
- Elapsed median/P95/max: `40626ms` / `67744ms` / `198562ms`.
- Peak sampled heap: `4169 MiB`.
- Converted from the `37/40` checkpoint: `P07:260`.
- Remaining bounded rows:
  - `P03:260`: gap `370472`, `full-width-event-skip-seeding`, first
    unclosed configuration `RaiseASuilen/happy/performance`, effective upper
    `9584318`, no timeout and no memory limit.
  - `P06:323`: gap `607201`, `large-gap-event-skip-seeding`, first unclosed
    configuration `PastelPalettes/cool/performance`, effective upper
    `10094162`, no timeout and no memory limit.

The active `38/40` stage target is achieved. The next working target is
`39/40` exact, with `P03:260` and `P06:323` as the only remaining exact
blockers.

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
- The same-process 2026-06-09 run with the `P07:260` conversion options is
  explicitly rejected:
  `documents/bandori-team-builder/medley-40-exact-report-2026-06-09-104805-rejected.md`.
  It used the correct `P01`-`P10` fixture, but heap carryover pushed later rows
  into immediate memory-limited bounded states. Do not treat its `24/40` exact
  result as algorithm-quality evidence.

Current acceptance standard:

- Current pinned checkpoint: `39/40` exact.
- Final target and next stage pass: `40/40` exact.
- Bounded-gap total must not regress against the latest clean pinned-fixture
  baseline.
- New patches must not regress below the pinned `39/40` checkpoint.
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

2026-06-09 P07:260 low-memory proof checkpoint:

- This section is retained as the historical path that produced the current
  `38/40` checkpoint. `P07:260` is no longer the active conversion target.
- High-memory diagnostic with `memorySoftLimitMiB=7900`,
  same-coarse threshold `60000`, and min headroom `100` proved `P07:260`
  exact in `82533ms`, peak `7446 MiB`, `completedConfigurations=21`,
  `rootPrunedConfigurations=87`, generated candidates `63`, and pair count
  `0`. This proves the proof route is logically sufficient; the blocker is
  memory residency / allocation pressure inside repeated low-memory initial
  slot-top proof, not seed quality and not exact-join pair solving.
- Under the normal memory gate, the same target stays bounded around gap
  `296599`, peak about `4203-4204 MiB`, and completes only the first
  configuration. With same-coarse threshold `60000` and min headroom `100`, it
  completes two configurations but then peaks around `5050-5073 MiB` and still
  remains bounded around gap `290597`.
- Existing switches are not useful here. `disableSkipDfsAfterUnprovedExactCandidateJoin=true`
  did not improve the case. `enableConflictExactBnb=true` with exact join did
  not run a useful conflict path; with exact join disabled it used the full
  300s, completed `0` configurations, and widened the gap.
- Opt-in high-pair/prefix experiments are irrelevant for this row because the
  successful high-memory proof used `pairCount=0`. Do not spend the next patch
  on pair-record layout, high-pair prefix solve, or exact-join seed for
  `P07:260`.
- Commit `9183b20` reduced low-memory initial slot proof result materialization
  by keeping only the best score during the score-only proof pass, then asking
  the normal generator for the official candidate. Typecheck and diff checks
  passed, but diagnostics showed no meaningful memory improvement. It remains a
  useful staging point for lower-allocation proof work, not a completed
  optimization.
- Commit `a467839` grouped the low-memory slot-proof traversal by character.
  It improved per-configuration elapsed time slightly, but did not reduce peak
  memory enough to convert `P07:260`.
- Commit `3388fa3` tried average-only medley scoring for the score-only proof
  pass. It was slower and gave no memory improvement, so it was reverted in
  `32f9eaa`. Do not continue by simplifying score math alone unless profiling
  first proves the new path reduces allocation residency rather than just CPU.
- Next generic direction: implement a lower-allocation single-slot exact top
  proof path. The target is not a new seed or case-specific skip; it is to make
  the 21 repeated slot-top proofs from the high-memory route fit under the
  normal memory gate by reducing per-leaf allocation, reusable context objects,
  retained card/team arrays, and GC pressure while preserving exact upper-bound
  semantics.
- Commit `0dfba16` tried compacting candidate instance-key arrays into one
  signature string, then `e89e22b` reverted it. The P06/P07 smoke had a small
  positive signal on `P07:244` (`55265 -> 52777` gap, peak about
  `4202 MiB`), but the 5-bounded verification failed the memory gate:
  `P03:260` peaked at `4724 MiB` and `P07:260` peaked at `5430 MiB`, with
  both cases moving into `initial-candidate` memory pressure. Do not continue
  candidate instance-key compaction as a default route.
- Commit `a01dc32` tried minimizing `evaluateMedleyScoreOnlyTeam` result
  payloads, then `14b372c` reverted it. The P06/P07 smoke again had a small
  `P07:244` gap improvement, but the 5-bounded run failed the memory gate:
  `P07:260` peaked at `5603 MiB` and moved into `initial-candidate` memory
  pressure. This confirms score-only/candidate payload compaction can perturb
  GC and controller timing enough to create worse hard-case memory spikes.
  Do not default score-only payload minimization without a stronger no-op /
  memory-equivalence gate.
- Commit `d70a675` tried a deeper compact score-only `MedleyTeamCandidate`
  representation by removing retained `cards[]` and `cardIds[]` arrays from
  exact score-only candidates, then `6f2cce6` reverted it. The P06/P07 smoke
  did not improve proof status (`P06:323` gap `607201`, `P07:244` gap
  `55265`). The 5-bounded run failed the memory gate again: `P03:260` peaked
  at `4731 MiB`, `P07:260` peaked at `5438 MiB`, and bounded-gap total stayed
  effectively baseline-level at `1813280`. This rules out broad candidate
  object shape compaction as the next default route.

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

2026-06-09 `38/40` bounded-root analysis:

- `P03:260` and `P06:323` are no longer memory, timeout, or seed-quality
  failures in the current pinned run. Both completed quickly, stayed far below
  the memory soft limit, and made zero exact-candidate-join calls.
- `P03:260` ended `bounded` with score `9213846`, observed upper `9584318`,
  gap `370472`, elapsed `51620ms`, peak `1980 MiB`, `timedOut=false`, and
  `memoryLimited=false`. The ledger shape was `1`
  `full-width-event-skip-seeding`, `5` `bounded-dominated-root-skip`, and
  `102` `fast-basic-root-pruned`. The top unclosed row was
  `RaiseASuilen/happy/performance`, sourced from `configuration-root`, with
  effective upper `9584317.729644679`.
- `P06:323` ended `bounded` with score `9486961`, observed upper `10094162`,
  gap `607201`, elapsed `22295ms`, peak `1295 MiB`, `timedOut=false`, and
  `memoryLimited=false`. The ledger shape was `1`
  `large-gap-event-skip-seeding`, `8` `bounded-dominated-root-skip`, and
  `99` `fast-basic-root-pruned`. The top unclosed row was
  `PastelPalettes/cool/performance`, sourced from `configuration-root`, with
  effective upper `10094161.91213159`.
- The current gap is therefore a deliberately retained proof upper, not a
  found-score problem. In both cases, the incumbent was already available; the
  search stopped because the event/root frontier guard remembered a loose root
  upper instead of spending memory and time on proof work that earlier
  diagnostics showed to be risky.
- The `bounded-dominated-root-skip` siblings are consequences of the same
  unclosed coarse frontier. For `P03:260`, the three leading rows are all
  `RaiseASuilen/happy`; for `P06:323`, the three leading rows are all
  `PastelPalettes/cool`. Closing or tightening the first sibling should also
  collapse most of the remaining same-coarse ledger entries.
- This is a different problem from the earlier `P07:260` conversion. The
  successful `P07:260` work made an existing proof route fit the memory gate.
  The remaining two rows currently do not enter exact join or candidate fill at
  all, so further cache compaction, candidate K tuning, warmup, or seed work is
  unlikely to move the exact count.

40/40 path from the current checkpoint:

- Stage A: add an opt-in event-root frontier probe before the
  `full-width-event-skip-seeding` and `large-gap-event-skip-seeding` exits.
  The probe should only run for the leading remembered configuration, only
  when the remaining budget and memory headroom are healthy, and only under a
  benchmark/debug flag until it proves no regression.
- Stage B: the probe should first attempt upper tightening, not score
  improvement. Its success criterion is lowering the effective upper below the
  incumbent, or at least lowering it enough that the sibling
  `bounded-dominated-root-skip` entries become root-prunable. It must report
  residual upper, residual gap, processed frontier count, elapsed time, peak
  memory, and skip/timebox reason.
- Stage C: make the proof shape memory-safe by reusing existing slot/root
  upper machinery and bounded prefixes, not by materializing the full
  exact-candidate frontier. The intended implementation is a cheap
  branch-upper / anchor-frontier upper pass over the top event-root slot,
  escalating to exact join only if the cheap pass narrows the gap and the
  candidate counts remain under a strict local cap.
- Stage D: `P06:323` is already exact. Test `P03:260` first, then the hard
  guard set. The `40/40` gate passes only when `P03:260` becomes exact without
  regressing score/gap/memory on the guard set.
- Stage E: guard set for every patch remains `P03:260`, `P06:323`,
  `P07:260`, `P08:323`, `P10:244`, `P10:260`, `P07:244`, and `P08:244`.
  Full isolated 40-case acceptance is required after any guard-set pass.
- Acceptance thresholds: exact count must not drop below `39/40`, bounded-gap
  total must not exceed `370472`, no currently exact guard case may become
  bounded, peak working set must stay within the active memory gate, and there
  must be no OOM or failed subprocess.
- Do not continue with broader seed, greedy, prefix-seed, candidate-limit, or
  memory-compaction experiments until the event-root frontier probe has a
  clean opt-in diagnostic result. The remaining upper gap is proof-conversion
  work, not incumbent discovery.

The next actionable step is not another seed experiment. It is:

1. Treat the `39/40` run from `2026-06-09T05-44-21-186Z` as the current pinned
   checkpoint for the branch. New patches must not regress below it.
2. Target `40/40` next. The only remaining blocker is `P03:260`.
3. Do not solve the remaining row with broader seeding or warmup. It is now a
   controlled remembered-root upper gap with no timeout, no memory limit, and
   no accepted proof closure.
4. The next generic implementation candidate is a bounded, memory-safe
   event/root frontier proof probe. It should attempt to close or tighten the
   first remembered unclosed configuration:
   `RaiseASuilen/happy/performance` for `P03:260`.
5. The probe must be opt-in first, must not materialize the full exact-candidate
   frontier, and must report proof-ledger deltas for upper reduction, elapsed
   time, and memory.
6. Re-run at least this guard set after the next patch:
   `P03:260`, `P06:323`, `P07:260`, `P08:323`, `P10:244`, `P10:260`,
   `P07:244`, and `P08:244`.
7. If `P03:260` converts and the guard set does not regress, re-run the full
   isolated 40-case matrix and generate another timestamped report.

Current execution workflow for the `40/40` goal:

1. Keep all work on `dev/medley-39-exact-frontier`; keep the main checkout out
   of this experiment.
2. Commit and push after every stable checkpoint that passes static validation
   or produces durable benchmark evidence.
3. Before a proof-path patch, document the hypothesis, the acceptance gate, and
   the expected diagnostic fields in this file.
4. After each single-case or guard-set run, record the raw result path, exact
   status, bounded reason, elapsed time, peak working set, residual upper/gap,
   and why the result is accepted or rejected.
5. After every full 40-case run, create a timestamped report containing timing,
   memory, exact/bounded status, bounded reasons, failure analysis, relevant
   optimization parameters, and next recommendations.
6. Do not promote any opt-in proof experiment unless it first passes
   `P03:260`, then the hard guard set, then the full isolated 40-case matrix.

## Current Checkpoint - 2026-06-09 39/40

Accepted branch checkpoint:

- Branch: `dev/medley-39-exact-frontier`
- Code commit: `4bf5a28` (`Add opt-in medley event-root frontier probe`)
- Full 40-case report:
  `documents/bandori-team-builder/medley-40-exact-report-2026-06-09-141817.md`
- Full raw result:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T05-44-21-186Z.json`
- Guard-set raw result:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T05-32-38-569Z.json`

Result:

- Exact count improved from `38/40` to `39/40`.
- `P06:323` converted from bounded to exact.
- The only remaining bounded case is `P03:260`.
- Bounded gap total improved from `977673` to `370472`.
- There were `0` failed subprocesses, `0` timed out cases, and `0`
  memory-limited cases.
- Full-run peak working set was `4170 MiB`, below the active `4488 MiB`
  memory gate.

Implemented path:

- `enableEventRootFrontierProbe` is an opt-in internal optimization.
- The probe runs before `full-width-event-skip-seeding` and
  `large-gap-event-skip-seeding`.
- It is only allowed to affect proof state when it proves the configuration or
  directly lowers the upper below the incumbent. Otherwise the observed upper
  is recorded as diagnostic evidence only.
- This restriction is required. A rejected smoke showed that applying the
  unproved `P03:260` upper changed same-coarse scheduling and caused later
  initial-candidate memory pressure.

Evidence by remaining/converted blocker:

- `P06:323` now exact: the probe proved
  `PastelPalettes/cool/performance` before the former
  `large-gap-event-skip-seeding` exit. Full-run elapsed was `129716ms`, peak
  was `3183 MiB`, and gap was `0`.
- `P03:260` remains bounded: the probe ran on
  `RaiseASuilen/happy/performance` and reduced the diagnostic upper from
  `9584317.729644679` to `9566338.5`, but that still leaves a residual
  diagnostic gap of `352492.5`; because it is not a proof closure, it is not
  applied. Full-run elapsed was `53636ms`, peak was `1982 MiB`, and reported
  bounded gap remained `370472`.

Current target:

- Intermediate target `>=37/40` is passed.
- Intermediate target `>=38/40` is passed.
- Intermediate target `>=39/40` is passed.
- Final target remains `40/40 exact` for P01-P10 / four events, excluding P11.

2026-06-09 P03 post-39/40 diagnostics:

- Clean diagnostic row:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T07-29-04-900Z.json`.
- Options matched the `39/40` event-root probe path, with additional opt-in
  diagnostic controls:
  `eventRootFrontierProbeAnchorProofMaxFrontierGap=120000`,
  `eventRootFrontierProbeAnchorProofMinRemainingMs=15000`,
  `eventRootFrontierProbeAnchorCheapUpperTimeboxMs=60000`, and
  `eventRootFrontierProbeAnchorCheapUpperMaxAnchors=20000`.
- Result stayed bounded: score `9213846`, reported gap `370472`, elapsed
  `70161ms`, peak `1982 MiB`, `timedOut=false`, `memoryLimited=false`.
- The diagnostic event-root cheap upper improved the local upper to `9334022`
  and local residual gap to `120176`, but it remains above incumbent and is not
  a proof closure. It processed `10502` anchors in `11507ms`.
- The max residual source is `right-unseen`: max anchor score `2760598`, max
  pair upper `6573424`, generated-pair upper `6387732`, left-unseen upper
  `6572389`, right-unseen upper `6573424`.
- Full anchor-frontier proof is still blocked by
  `high-pair-record-upper=2001600`, just over the current `2,000,000` guard.
  Raising this guard to `3,000,000` and `5,000,000` was tested earlier and
  still skipped (`3002400` and `5004000` upper counts), so this is not a
  small-threshold miss.
- Rejected: applying the unproved `9334022` upper back into active same-coarse
  scheduling. It lowered the reported gap but exposed
  `RaiseASuilen/happy/visual`, which then hit initial-candidate memory pressure
  (`memoryLimited=true`, peak `4710 MiB`). This confirms the current
  39/40 restriction is necessary: unproved diagnostic upper may be recorded,
  but must not drive same-coarse scheduling.
- Rejected: banned-card-aware slot upper inside the cheap upper. It increased
  cheap-upper elapsed to about `40331ms` while leaving residual gap unchanged
  at `120176`.
- Rejected: `lowMemoryInitialCandidateSyncLightUpper=false` after applying the
  unproved upper. It worsened the same visual initial-candidate pressure, peak
  `5489 MiB`, with no exact improvement.

Next optimization direction:

1. Keep seed, greedy, prefix-seed, broad candidate-limit changes, and broad
   memory-compaction routes frozen for this objective.
2. Focus exclusively on `P03:260` and its
   `RaiseASuilen/happy/performance` full-width event root.
3. The next patch must be proof-only: it may record diagnostic upper
   improvements freely, but it may not feed an unproved upper back into active
   same-coarse scheduling.
4. The next generic route should target the residual `right-unseen` pair
   frontier, not incumbent quality and not a wider high-pair guard. The desired
   proof is a card-conflict-aware pair-unseen upper that can reduce the
   `6573424` right-unseen pair upper below the required threshold without
   materializing the full high-pair record frontier.
5. A secondary route, only after the performance frontier is truly closed, is
   the same-coarse `visual` initial-candidate memory path. The failed
   scheduling diagnostic shows it will become the next blocker if performance
   is closed or tightened enough to expose siblings; it needs a lower-allocation
   single-slot top proof rather than tighter skill-context upper.
6. Any accepted P03 patch must first pass the hard guard set:
   `P03:260`, `P06:323`, `P07:260`, `P08:323`, `P10:244`, `P10:260`,
   `P07:244`, and `P08:244`.
7. After any guard-set pass, rerun the full isolated 40-case matrix and create
   a new timestamped report with timing, memory, exact/bounded status, bounded
   reasons, failure analysis, and next recommendations.

2026-06-09 follow-up diagnostics after the `39/40` checkpoint:

- `lowMemoryInitialCandidateSyncDirectCandidate=true` was fixed to use the same
  `score -> maxScore -> cardInstanceKeys/cardIds` candidate ordering as the
  normal generator. This keeps it suitable as an opt-in diagnostic path, but it
  is not accepted as a default optimization.
- P03 diagnostic with direct candidate, default order, event-root soft limit
  `200000`, and memory soft limit `4488`:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T09-14-15-542Z.json`.
  Result stayed bounded: gap `354570`, elapsed `74201ms`, peak `4489 MiB`,
  `memoryLimited=true`. It proved the first sibling and then hit memory at
  `RaiseASuilen/happy/technique` candidate fill.
- P03 diagnostic with the same options but memory soft limit `4608`:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T09-16-31-421Z.json`.
  Result became exact: elapsed `215881ms`, peak `4553 MiB`, no timeout and no
  memory limit. This proves the remaining P03 proof path is reachable, but only
  with a higher transient working-set budget.
- Hard guard with direct candidate, event-root soft limit `200000`, and memory
  soft limit `4608`:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T09-22-41-861Z.json`.
  Rejected: `5/8` exact, bounded rows `P03:260`, `P06:323`, and `P07:260`,
  bounded-gap total `1253867`, peak `4614 MiB`. `P06:323` regressed to
  `candidate-fill-soft-limit` without timeout or memory limit, so this cannot
  be a broad guard-set option.
- Rejected diagnostic: same-coarse low-root-first proof order. It can move the
  first heavy sibling from performance/technique to visual, but the next sibling
  still hits memory. It changes where the wall appears rather than removing it.
- Rejected diagnostic: score-cache clear during low-memory initial-candidate
  sync. In the tested path the clear counter stayed `0`; memory pressure
  happens before that lever can matter.
- Rejected diagnostic: memory-soft-limit GC retry. It recovered one near-limit
  read but allowed later RSS to grow to more than `5500 MiB` while still
  ending bounded. Do not reintroduce this as a proof path.
- Rejected diagnostic: omitting persistent `cardInstanceKeys` for ordinary
  profile cards. It looked like a possible candidate-memory reduction, but it
  changed sort/allocation behavior and worsened P03/P06 memory profiles. The
  implementation was reverted.
- Pinned-option smoke after reverting the failed memory optimizations:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T10-19-37-132Z.json`.
  Result preserved expected semantics for the two checked rows:
  `P03:260` bounded with gap `370472`, and `P06:323` exact. The smoke peak
  was `4081 MiB`, still below the `4488 MiB` gate but higher than the pinned
  full-run P06 sample; treat memory sampling on this row as noisy until the next
  full 40-case run.

Updated conclusion:

- P03 is no longer primarily a seed-quality problem. It is a proof
  materialization / transient working-set problem.
- Raising memory can make P03 exact in isolation, but the guard set shows that a
  broad direct-candidate/high-limit path regresses other hard cases.
- The next viable generic direction is to reduce candidate materialization
  during exact join, or to prove the residual pair-unseen frontier without
  building the full three-slot candidate arrays.
- The next patch should target one of these low-allocation proof conversions:
  a compact candidate-key representation, a pair-unseen proof that streams
  candidates instead of storing them, or a same-coarse sibling proof pass that
  runs one heavy sibling at a time with a bounded retained frontier.

2026-06-09 current execution checkpoint:

- The active Codex goal object still points at the same 40/40 objective, but
  this roadmap now carries the detailed current goal contract because the goal
  tool cannot edit an active objective in place.
- Implemented and checked locally: a lossless compact exact-candidate key
  representation that packs 5-card candidate keys into fixed UTF-16 strings
  instead of comma-joined decimal strings. `npm.cmd run typecheck` and
  `git diff --check` passed before the latest diagnostics. This patch is still
  a candidate building block, not yet a full 40/40 acceptance patch.
- Rejected: compact-key plus global direct/high-limit event-root proof as a
  broad strategy. It produced one isolated `P03:260` exact diagnostic under the
  active `4488 MiB` gate
  (`temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T10-34-44-695Z.json`:
  exact, elapsed `209643ms`, peak `4249 MiB`, 6/6 exact-join completions), but
  the hard guard regressed to `5/8` exact and bounded `P03:260`, `P06:323`, and
  `P07:260`
  (`temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T10-38-58-648Z.json`).
- Rejected: full-width-only high-limit event-root escalation with same-coarse
  direct-candidate inheritance. `P06:323` stayed exact in the first smoke, but
  `P03:260` remained bounded and hit the memory edge; the repeat run
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T11-22-29-580Z.json`
  ended `bounded`, gap `354570`, `timedOut=true`, `memoryLimited=true`, peak
  `4809 MiB`, with 2/3 exact-join completions and final abort
  `initial-candidate`.
- Rejected: global direct candidate combined with full-width-only high K and
  the normal `20k/30s` large-gap probe. The run
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T11-30-43-757Z.json`
  regressed both checked rows: `P03:260` stayed bounded with peak `4703 MiB`,
  and `P06:323` reverted to bounded with abort `candidate-fill-soft-limit`.
- Current interpretation: `P03:260` is reachable in principle, but the accepted
  path cannot depend on broad direct-candidate flags, larger K, or same-coarse
  sibling inheritance. Those routes move the memory wall and can regress
  already exact hard cases.
- Accepted as a narrow no-regression smoke, not as final progress: after
  removing the failed full-width escalation code, compact-key baseline smoke
  preserved the current key shape on `P03:260` and `P06:323`:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T11-41-36-790Z.json`.
  Result: `P03:260` stayed bounded at gap `370472`, `P06:323` stayed exact,
  no timeout, no memory-limited row, peak `3211 MiB`.
- Rejected and reverted: opt-in two-slot capacity upper for the cheap-upper
  `bothUnseenUpper` term. The 60s cheap-upper diagnostic
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T11-54-30-647Z.json`
  stayed bounded and worsened diagnostic residual gap to `187702` after
  processing only `2840` anchors. A 120s diagnostic
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T11-56-14-837Z.json`
  still stayed bounded with residual gap `123718` after `80007ms`, slightly
  worse than the earlier `120176` cheap-upper diagnostic. This route is too
  slow and not tighter enough; do not continue by only raising cheap-upper
  timebox.
- Accepted as a no-regression implementation baseline, not as final progress:
  compact-key hard guard
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T12-02-54-520Z.json`
  passed the active guard set at `7/8` exact, one bounded row `P03:260`, bounded
  gap total `370472`, `0` failed subprocesses, `0` timed out rows, `0`
  memory-limited rows, median elapsed `47761ms`, max elapsed `283078ms`, and
  peak sampled heap `4185 MiB`. The exact guard rows stayed exact:
  `P06:323`, `P07:260`, `P08:323`, `P10:244`, `P10:260`, `P07:244`, and
  `P08:244`.
- Rejected diagnostics after the compact-key guard:
  - Existing opt-in unseen refine on `P03:260`
    (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T12-24-34-978Z.json`)
    did not improve proof. It stayed bounded, increased the event-root residual
    gap from `120176` to `220268`, and consumed the `30s` event-root probe
    budget.
  - Raising only `eventRootFrontierProbeCandidateSoftLimit` to `80000` or
    `120000`
    (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T12-27-17-090Z.json`,
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T12-31-59-393Z.json`)
    did not close `P03:260`. Both stayed bounded with residual gap `170144`,
    and slot `0` still hit `candidate-fill-soft-limit`.
  - A direct `200000` soft-limit diagnostic without the isolated runner's
    `NODE_OPTIONS=--max-old-space-size=8192` crashed at the V8 heap limit, so it
    is invalid as algorithm evidence. It reinforces that high-K probes must use
    the isolated runner environment and still require the hard guard.
  - Temporarily raising
    `MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_HIGH_PAIR_RECORDS`
    to `2.05M` and then `2.1M` did not enter useful anchor proof. The reported
    high-pair count simply stopped just above the current threshold
    (`2051640`, then `2101680`), so this knob is a scan-budget expansion, not a
    true proof improvement. The code was reverted.
  - A trial patch that forced one cheap-upper unseen refine entry by default
    (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T12-42-19-238Z.json`)
    regressed the residual gap to `296638` and consumed the local event-root
    budget. The code was reverted.
  - Direct initial-candidate plus `200000` event-root candidate soft limit
    (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T12-47-37-560Z.json`)
    is not acceptable as a fallback. It let the event-root probe reach `proved`,
    but the overall case still ended bounded after later same-coarse work hit
    `timedOut=true`, `memoryLimited=true`, peak `4806 MiB`, and final abort
    `initial-candidate`. This confirms the remaining problem is not just
    proving the first full-width root; proof work for same-coarse siblings must
    be scheduled or released without accumulating a larger transient working
    set.
  - Direct initial-candidate plus `200000` event-root candidate soft limit and
    `enableLowMemoryHighPairPrefixUpper=true`
    (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T14-12-24-604Z.json`)
    also stayed bounded. It proved the first two `RaiseASuilen/happy` siblings
    (`performance` and `technique`), but the third sibling
    `RaiseASuilen/happy/visual` aborted in `initial-candidate` before pair
    upper, candidate fill, or solve could run. Final result: gap `354570`,
    elapsed `133963ms`, `timedOut=true`, `memoryLimited=true`, peak `4786 MiB`,
    exact-join `2/3` completed. The prefix option did not provide an independent
    useful hit in this path; treat this as same-coarse memory-frontier evidence,
    not as a viable prefix-upper candidate.
- Revised next implementation target: keep the compact-key representation as a
  safe lower-residency building block, but do not count it as proof-quality
  progress. The next proof patch must target genuinely lower-residency proof
  work for `P03:260`: streamed pair-unseen upper, compact candidate/result
  payloads with a no-op memory-equivalence gate, or a same-coarse sibling proof
  protocol that releases heavy frontier state between siblings without relying
  on runtime GC behavior.
- Rejected diagnostic: anchor-limited peek inside the event-root cheap upper
  (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T14-27-13-467Z.json`).
  It kept the same dominant `right-unseen` pair upper (`6573424`) while slowing
  the cheap pass from about `14980ms` to `21989ms`, processing only `5835`
  anchors, and worsening residual gap from `120176` to `150972`. The code was
  reverted. Do not continue this route by only raising the event-root timebox;
  the max pair term did not tighten.
- Rejected diagnostic: event-root candidate soft limit `200000` without
  `lowMemoryInitialCandidateSyncDirectCandidate`
  (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T14-34-13-427Z.json`).
  It still stayed bounded with gap `354570`, elapsed `120575ms`,
  `timedOut=true`, `memoryLimited=true`, peak `4752 MiB`, and final abort
  `initial-candidate`. It proved `RaiseASuilen/happy/performance` and
  `technique`, then failed on `visual`. This rules out direct-candidate result
  materialization as the primary cause; the remaining blocker is the third
  same-coarse low-memory slot-top proof itself.
