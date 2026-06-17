# HHWX Medley Low-Memory Roadmap

Last updated: 2026-06-17

This file is the persistent roadmap for the medley team-builder low-memory
work. Keep it current whenever a benchmark, reverse-engineering note, or
implementation checkpoint changes. The goal is to make future continuation
possible from repository artifacts instead of chat context.

## North Star

Reduce medley optimizer memory usage while preserving HHWX's exactness proof
semantics.

The calc.krkrdkdk.cn implementation is useful as a research reference because
it appears to run with much lower memory, but it is not a correctness oracle for
HHWX. HHWX must continue to optimize average score and must retain explicit
proof status, bounded gap, and bounded-reason reporting. Max score should be
recorded for comparison and diagnostics, but it must not replace the primary
average-score objective.

## Long-Term Goal

Build an HHWX-native low-memory medley exact-join path that materially reduces
memory on the retained hard-case matrix without weakening exact/bounded proof
semantics.

The long-term success target is not merely "runs faster" or "uses less memory".
It is:

- The same public result contract as current HHWX:
  - primary objective remains average score
  - `maxScore` is recorded for diagnostics
  - `searchMode`, `isExhaustive`, `timedOut`, `memoryLimited`,
    `observedScoreUpperBound`, and `observedScoreUpperBoundGap` remain truthful
- Same retained hard-case fixture:
  `temp/bandori-team-builder/hard-case-profiles-2026-06-02.json`
- Same 40-case matrix: `P01` through `P10` times `none`, `244`, `260`, `323`
- Same default validation budget: `300000ms` per case
- Same Node heap ceiling for acceptance: `--max-old-space-size=8192`
- No reliance on calc as an exactness oracle

Quantified target outcomes:

| Metric | Current Hard-Case Baseline | Long-Term Target |
| --- | ---: | ---: |
| Exact cases | `30/40` | at least `30/40`, target `35/40+` |
| Failed cases | `1/40` | `0/40` |
| `P02:260` | Node 8GB heap OOM in full baseline; memory-limited bounded in trace | no process OOM; bounded is acceptable only with recorded gap |
| Bounded gap total | `2692264` | no increase; target reduction |
| Peak memory | practical pressure around `4488-4495 MiB` sampled/guarded | first milestone at least 20 percent lower; mid-term hard cases below `1 GiB`; common cases ideally `300-500 MiB` |
| Score reporting | average and max score recorded in current low-memory reports | preserve for every non-failed row |
| Proof safety | exact/bounded fields present | no false exact, no hidden bounded gap |

The first merge-worthy milestone is allowed to be narrower than the long-term
target, but it must demonstrate a real memory reduction on at least one
high-pressure case without exactness regression.

Memory budget tiers:

- Near-term acceptance: at least 20 percent lower peak memory on focused
  high-pressure cases, with no exact/bounded regression.
- Mid-term hard-case target: below `1 GiB` in the 40-case matrix under the same
  proof contract.
- Runtime safety line: around `700-800 MiB`, stop aggressive proof expansion or
  return bounded instead of risking process termination.
- Stretch target: common cases around `300-500 MiB`; calc-like stable
  hundreds-of-MB hard cases are desirable but not required for the first HHWX
  milestone.

Implementation language decision:

- Prefer TypeScript first, using typed-array / raw-index candidate pools and
  delayed hydration.
- Keep Rust/WASM as a second-stage fallback if the JS/TS raw representation
  still cannot reach the `1 GiB` hard-case target, or if the product target
  changes to calc-like stable hundreds-of-MB behavior.
- Do not adopt calc's `maxCandidates` or `randomBucket` behavior as exact unless
  HHWX can produce its own unseen-frontier proof.

## Implementation Path

The implementation path is ordered by two pieces of evidence:

- The `P02:260` trace shows candidate fill hits the memory guard before final
  solve starts, so candidate-fill working set must come before a production raw
  disjoint solver.
- The latest calc research report shows calc's low memory likely starts before
  final solve: signature/prefix enumeration, upper replay, dominance filtering,
  and raw solver-input filtering appear to reduce candidate birth and candidate
  residency together.

Therefore memory work and algorithm diagnostics should move together, but not
with the same risk level. No-op diagnostics can be added immediately. Any
proof-changing calc-like pruning must wait until HHWX can replay the upper or
dominance certificate and record violation counters.

### Stage 0: Measurement Harness

Status: mostly done.

Purpose:

- Make low-memory experiments repeatable and attributable.

Implementation:

- Track the low-memory benchmark wrapper once reviewed:
  `scripts/bandori-medley-low-memory-polish-benchmark.cjs`
- Keep `HHWX_LOW_MEMORY_TRACE=1` as the opt-in diagnostic switch.
- Continue archiving raw JSON under
  `temp/bandori-team-builder/low-memory-polish/`.

Acceptance:

- Trace mode does not change default search behavior.
- Trace reports include:
  - `memoryLimited`
  - `peakUsedHeapMiB`
  - Node heap/RSS fields
  - `exactCandidateJoinMemorySnapshots`
  - average and max score fields
- `P02:260` trace artifact remains reproducible enough to compare later runs.

### Stage 1: Compact Candidate And Cache Keys

Status: first pass implemented; memory target not met.

Purpose:

- Reduce candidate-fill memory before changing solver semantics.

Observed trigger:

- `P02:260` aborts during candidate fill.
- At abort it holds about `384506` candidates and the same number of candidate
  keys.
- Slot 0 generator holds about `286345` heap nodes and `273085` global
  complement upper cache entries.
- Bitset payload is only about `4.25 MiB`, so bitsets are not the first target.

Implementation:

- Replace comma-joined candidate card key strings with compact numeric keys in
  exact candidate fill. First pass uses a packed `bigint` card-id key with a
  string fallback for out-of-range ids.
- Keep exact collision checks against the five sorted card ids or
  card-instance ids.
- Replace global complement cache string keys with compact numeric tuple keys
  or a two-level numeric map. First pass uses prefix buckets plus packed card
  keys.
- Add debug assertions comparing old string key semantics and new numeric key
  semantics on focused runs.
- Keep the current `MedleyTeamCandidate` object path alive while changing only
  key/cache representation.

Acceptance:

- Focused cases `P02:260`, `P08:260`, `P08:323`, and `P10:260` produce the same
  best `averageScore` and same or better `maxScore` diagnostics as the baseline
  unless a difference is explained by a found correctness issue.
- Exact/bounded status must not become more optimistic.
- `P02:260` peak memory decreases measurably versus the trace artifact:
  target at least 10 percent lower for this stage.
- If memory decreases but gap increases, the gap increase must be explained and
  accepted before proceeding.

### Stage 2: Raw Candidate Mirror

Purpose:

- Introduce compact typed-array candidate storage without yet replacing proof
  logic.

Implementation:

- Build a raw candidate pool in parallel with `MedleyTeamCandidate[][]`.
- Store at minimum:
  - score / average score
  - max score / min score
  - five sorted card ids
  - slot index
  - source candidate index
  - compact conflict mask or mask pointer
- Hydrate rich `MedleyTeamCandidate` objects only through an adapter in debug
  comparison code.
- Add assertions that raw pool ordering and card ids match object candidates.
- Keep this in TypeScript first; this is the planned bridge toward calc-style
  raw storage without changing the implementation language.

Acceptance:

- Default behavior remains object-backed unless the feature flag is enabled.
- Raw mirror mode reports no mismatch on small deterministic fixtures and the
  focused hard cases.
- Exact/bounded status and observed upper gaps match the object path when raw
  mirror is passive.
- Memory overhead of the passive mirror is measured and documented, so it does
  not mask the savings expected in later stages.

### Stage 2.5: Calc-Inspired No-Op Algorithm Diagnostics

Status: signature census, materialized upper replay, materialized dominance
replay, and raw solver-input census implemented.

Purpose:

- Learn whether HHWX can safely reduce candidate birth before a large storage
  rewrite.
- Convert calc's strongest visible ideas into HHWX-native proof diagnostics
  without using calc as an oracle.

Calc evidence to carry forward:

- WASM name-section inventory indicates real compiled functions around
  `enumerate_signature_pool`, `enumerate_signature_teams`,
  `contribution_dominance_graph_for_signature`,
  `MedleyPruneUpperBounds::signature_can_beat_incumbent`,
  `best_any_team_score_upper_bound`,
  `build_raw_team_candidates_with_current_best`, and
  `raw_candidate_solver_input_for_indices`.
- The likely memory mechanism is not just Rust/WASM. It is earlier pruning plus
  compact raw candidate representation and late hydration.
- Calc still lacks public HHWX-equivalent proof output, so its cap, random
  bucket, and hidden route choices cannot enter HHWX exact semantics.
- The latest pasted pruning explanation is a reasonable working model:
  calc likely prunes item/mode, signature, prefix, and dominance branches before
  full candidate birth, then stores only raw numeric survivor records for the
  disjoint solver. Treat this as an implementation-shape hypothesis, not as a
  source-level reconstruction or an exactness proof.

Diagnostics:

- Signature census:
  - Count signature/prefix buckets before exact candidate materialization.
  - Record per-slot candidate counts, score upper ranges, retained/rejected
    bucket counts, and whether each bucket contains the incumbent path.
  - First implementation is post-materialization, not pre-materialization:
    `debugExactCandidateSignatureCensus` records coarse band/attribute/skill
    context buckets in exact-candidate-join memory snapshots. This is enough to
    choose upper/dominance replay targets, but it is not yet a candidate-birth
    reducer.
  - The bucket key is a bounded `fnv1a32` diagnostic hash with a
    `20000` bucket cap per slot. Overflow is reported explicitly so the
    diagnostic does not keep expanding near the memory guard.
- Upper replay:
  - Recompute conservative HHWX upper bounds for candidate groups without
    removing anything.
  - Record skipable-by-upper counts and hard violation counters.
  - Treat any violation as a blocker for proof-backed pruning.
  - First implementation is also post-materialization:
    `debugExactCandidateUpperReplay` records whether materialized candidates or
    coarse signature buckets are already below the current
    `proofCutoffScore - otherUpper` threshold. It explicitly reports
    `materializedOnly: true` and `coversUnseenFrontier: false`.
  - This is a replay/census tool, not a pruning rule. A future
    pre-materialization signature upper still needs a separate unseen-frontier
    certificate.
- Dominance replay:
  - Start with Level 0/1 dominance only:
    equal signature, equal card-conflict footprint, no worse average score, no
    worse max score, and no weaker proof-relevant upper metadata.
  - Record dominated counts and top examples, but do not remove candidates.
  - First implementation is materialized-only:
    `debugExactCandidateDominanceReplay` records Level 0 duplicate card-key
    counts and Level 1 same-coarse-signature conflict-footprint-subset
    dominance. Level 1 uses exact materialized conflict bitsets only when the
    candidate total is at most `60000`; larger snapshots are marked
    `candidate-total-limit`.
  - It reports `candidateRemoval: false`, `materializedOnly: true`, and
    `coversUnseenFrontier: false`.
- Raw solver-input census:
  - Compare object candidate count, raw mirror count, and hypothetical raw
    solver-input count after safe filters.
  - Report memory estimate before any production replacement.
  - First implementation is estimate-only:
    `debugExactCandidateRawSolverInputCensus` records typed-array raw row bytes,
    final-join card-bitset bytes, slot order, and all-slot conflict-index bytes
    without allocating solver input arrays. Card-id bitset cardinality is an
    upper estimate from `slot.searchCards`.

Sequencing decision:

- Stage 2 raw mirror and raw-index parity are already useful and should stay as
  debug-only no-op diagnostics.
- Stage 2.5 should happen before a broad Stage 3 primary-storage rewrite or any
  proof-backed pruning. If signature/upper/dominance diagnostics show a large
  safe reduction, implement that first. If they do not, continue to Stage 3 raw
  primary storage as the main memory lever.
- Current first-pass Stage 2.5 readout chooses Stage 3 primary storage next:
  materialized upper replay did not expose a direct hard-case skip lever,
  materialized dominance was capped on hard rows, and raw solver-input census
  showed the irreducible raw final-join input is tens of MiB rather than GiB.
  Pre-materialization signature/prefix upper remains valuable, but it needs a
  separate unseen-frontier certificate and should proceed as a parallel
  proof-design track rather than blocking object-residency work.
- Stage 4 raw-index final join remains lower priority for `P02:260` because the
  case does not reach final solve.

Acceptance:

- Diagnostics are feature-flagged and default-off.
- Returned results, exact/bounded state, and observed upper gaps are unchanged
  when diagnostics are enabled.
- Focused cases include at least `P02:260`, `P08:260`, `P08:323`, and
  `P10:260`.
- Reports include average score and max score for every non-failed row.
- Any proposed pruning rule has a replayable HHWX proof reason:
  `signature-upper`, `prefix-upper`, `hard-upper`,
  `dominance-replacement`, or `raw-solver-filter`.

Focused validation artifacts:

| Artifact | Case | Status | Average | Max | Gap | Peak | Census Candidates | Tracked Signatures | Multi Signature Buckets | Overflow |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `low-memory-polish-hhwx-2026-06-16T13-29-42-906Z.json` | `P01:none` | exact | `7927236` | `7982835` | `0` | `1307 MiB` | `1550` | `1493` | `57` | `0` |
| `low-memory-polish-hhwx-2026-06-16T13-32-58-730Z.json` | `P02:260` | bounded, memory-limited | `9376984` | `9412868` | `429693` | `4519 MiB` | `387926` | `60000` | `43223` | `228277` |
| `low-memory-polish-hhwx-2026-06-16T13-39-20-448Z.json` | `P08:260` | exact | `8912922` | `8993248` | `0` | `2320 MiB` | `32507` | `26101` | `4704` | `0` |
| `low-memory-polish-hhwx-2026-06-16T13-44-56-286Z.json` | `P08:323` | exact | `9249509` | `9368642` | `0` | `2966 MiB` | `557165` | `52815` | `22289` | `472415` |
| `low-memory-polish-hhwx-2026-06-16T13-48-48-891Z.json` | `P10:260` | exact | `8887419` | `8977612` | `0` | `2809 MiB` | `94855` | `54065` | `21055` | `17787` |

Upper replay focused artifacts:

| Artifact | Case | Status | Average | Max | Gap | Peak | Replay Candidates | Candidate-Level Skipable | Bucket-Level Skipable Candidates | Violations | Overflow |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `low-memory-polish-hhwx-2026-06-16T14-01-22-738Z.json` | `P01:none` | exact | `7927236` | `7982835` | `0` | `1323 MiB` | `1550` | `1519` | `1519` | `0` | `0` |
| `low-memory-polish-hhwx-2026-06-16T14-02-40-139Z.json` | `P02:260` | bounded, memory-limited | `9376984` | `9412868` | `429693` | `4515 MiB` | `387328` | `0` | `0` | `0` | `227812` |
| `low-memory-polish-hhwx-2026-06-16T14-04-07-581Z.json` | `P08:260` | exact | `8912922` | `8993248` | `0` | `2324 MiB` | `27140` | `26899` | `26869` | `0` | `0` |
| `low-memory-polish-hhwx-2026-06-16T14-08-56-719Z.json` | `P08:323` | exact | `9249509` | `9368642` | `0` | `2932 MiB` | `557165` | `0` | `0` | `0` | `472415` |
| `low-memory-polish-hhwx-2026-06-16T14-12-22-678Z.json` | `P10:260` | exact | `8887419` | `8977612` | `0` | `2761 MiB` | `94855` | `0` | `0` | `0` | `17787` |

Dominance replay focused artifacts:

| Artifact | Case | Status | Average | Max | Gap | Peak | Checked Snapshots | Max Checked Candidates | Max Dominated Candidates | Max Conflict-Subset Checks | Final Level 1 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `low-memory-polish-hhwx-2026-06-16T14-25-11-249Z.json` | `P01:none` | exact | `7927236` | `7982835` | `0` | `1307 MiB` | `8` | `34346` | `2269` | `19013` | checked |
| `low-memory-polish-hhwx-2026-06-16T14-26-30-077Z.json` | `P02:260` | bounded, memory-limited | `9376984` | `9412868` | `429693` | `4491 MiB` | `0` | `0` | `0` | `0` | skipped: candidate-total-limit |
| `low-memory-polish-hhwx-2026-06-16T14-27-39-116Z.json` | `P08:260` | exact | `8912922` | `8993248` | `0` | `2310 MiB` | `17` | `32703` | `2591` | `10844` | checked |
| `low-memory-polish-hhwx-2026-06-16T14-32-20-687Z.json` | `P08:323` | exact | `9249509` | `9368642` | `0` | `2930 MiB` | `0` | `0` | `0` | `0` | skipped: candidate-total-limit |
| `low-memory-polish-hhwx-2026-06-16T14-35-29-717Z.json` | `P10:260` | exact | `8887419` | `8977612` | `0` | `3943 MiB` | `0` | `0` | `0` | `0` | skipped: candidate-total-limit |

Raw solver-input census focused artifacts:

| Artifact | Case | Status | Average | Max | Gap | Peak | Candidates | Raw Rows | Final-Join Input | All-Slot Conflict Index |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `low-memory-polish-hhwx-2026-06-16T15-03-36-051Z.json` | `P01:none` | exact | `7927236` | `7982835` | `0` | `1325 MiB` | `1550` | `0.06 MiB` | `0.09 MiB` | `0.10 MiB` |
| `low-memory-polish-hhwx-2026-06-16T15-04-32-272Z.json` | `P02:260` | bounded, memory-limited | `9376984` | `9412868` | `429693` | `4495 MiB` | `386853` | `14.76 MiB` | `25.81 MiB` | `27.05 MiB` |
| `low-memory-polish-hhwx-2026-06-16T15-05-39-742Z.json` | `P08:260` | exact | `8912922` | `8993248` | `0` | `2490 MiB` | `551` | `0.02 MiB` | `0.03 MiB` | `0.04 MiB` |
| `low-memory-polish-hhwx-2026-06-16T15-10-20-930Z.json` | `P08:323` | exact | `9249509` | `9368642` | `0` | `4396 MiB` | `557165` | `21.25 MiB` | `33.47 MiB` | `37.76 MiB` |
| `low-memory-polish-hhwx-2026-06-16T14-59-38-789Z.json` | `P10:260` | exact | `8887419` | `8977612` | `0` | `3983 MiB` | `94855` | `3.62 MiB` | `5.60 MiB` | `6.11 MiB` |

Validation notes:

- All signature-census and upper-replay stderr logs were empty.
- `node --check scripts/bandori-medley-low-memory-polish-benchmark.cjs` passed.
- `git diff --check` reported only existing CRLF normalization warnings.
- `npm run typecheck` could not run in this worktree because local
  `node_modules` is absent and `tsc` is not on PATH. Running sibling
  `D:\Workspace\hhwx\node_modules\.bin\tsc.cmd` against this checkout also
  failed for dependency resolution (`react`, `next-intl`, `@types/node`, etc.),
  so it is not a meaningful code-regression signal until dependencies are
  installed or linked for this worktree.

Interpretation:

- The materialized upper replay is internally consistent on focused cases:
  violation count stayed `0`.
- It does not identify skipable materialized candidates for `P02:260`,
  `P08:323`, or `P10:260`; therefore it is not a direct memory lever for the
  hardest candidate-fill pressure.
- Materialized dominance replay found real dominated candidates on smaller
  checked snapshots (`P01:none` and `P08:260`), but `P02:260`, `P08:323`, and
  `P10:260` were too large for safe Level 1 checking under the diagnostic cap.
- Raw solver-input census shows the raw representation itself is small even on
  large materialized candidate sets: about `25.81 MiB` final-join input for
  `P02:260` and `33.47 MiB` for `P08:323`. The current multi-GiB pressure is
  therefore object residency, generator/frontier state, and proof helpers, not
  the irreducible raw solver input.
- The next implementation target should move to Stage 3 primary typed-array raw
  candidate storage and lazy hydration, while keeping pre-materialization
  signature upper as a parallel proof-design track.

### Stage 3: Candidate-Fill Working Set Compaction

Purpose:

- Make candidate fill survive hard cases before final solve begins by reducing
  rich object residency from the hot path.
- Start this as primary storage only after Stage 2.5 confirms whether earlier
  signature/upper/dominance diagnostics can safely reduce candidate birth first.

Implementation:

- First diagnostic implementation slice:
  `disableExactCandidateScoreOnlyCache` /
  `HHWX_LOW_MEMORY_DISABLE_SCORE_ONLY_CACHE=1` disables the exact-join
  score-only result Map while leaving scoring, candidate cutoffs, and proof
  status unchanged. This tests whether per-slot score-only cache residency is
  the hard-case memory bottleneck.
- Second diagnostic implementation slice:
  `disableExactCandidateScoreCalculationCache` /
  `HHWX_LOW_MEMORY_DISABLE_SCORE_CALC_CACHE=1` disables the lower-level
  `ScoreCalculationCache` only for exact-join score-only candidate generation.
  Final result hydration still uses the normal full evaluation path. This is
  exact-safe but slower, so it is a hard-case fallback candidate rather than a
  global default.
- Third diagnostic implementation slice:
  `HHWX_LOW_MEMORY_SCORE_CALC_CACHE_LIMIT` and
  `HHWX_LOW_MEMORY_DISABLE_SKILL_WINDOW_CACHE=1` test whether a simple
  bounded lower-level score cache or skill-window-only cache removal can keep
  the P02 memory benefit without the full-disable runtime cost.
- Pressure fallback implementation slice:
  `HHWX_LOW_MEMORY_SCORE_CALC_CACHE_PRESSURE_FALLBACK=1` and
  `HHWX_LOW_MEMORY_SCORE_ONLY_CACHE_PRESSURE_FALLBACK=1` disable score
  calculation cache and score-only result cache only when exact-join slot card
  count reaches a configurable high-pressure threshold. The default threshold
  is `260`, chosen from focused traces where `P02:260` has `[265,265,265]`
  slot card counts while `P08:260`, `P08:323`, and `P10:260` sit at
  `[249,249,249]`, `[251,251,251]`, and `[219,219,219]`.
- Fourth diagnostic implementation slice:
  shared immutable empty score-only result payloads remove repeated empty
  arrays/objects from score-only evaluations. This is proof-neutral and always
  safe if consumers do not mutate returned result arrays.
- Fifth diagnostic implementation slice:
  `HHWX_LOW_MEMORY_COMPACT_CANDIDATE_CARDS=1` strips retained `SearchCard[]`
  references from exact candidates after candidate creation and reconstructs
  them from slot-local search-card indices only when hydration or diagnostics
  need them.
- Sixth diagnostic implementation slice:
  `HHWX_LOW_MEMORY_COMPACT_SCORE_ONLY_CACHE=1` stores compact score-only cache
  entries instead of full `BandoriTeamSearchResult` objects and hydrates a
  score-only result object on cache hit.
- Memory snapshots now include `scoreCache` profiles:
  score-only result cache size, active-chart base-score cache count,
  active-chart skill-window contribution count, skill multiplier list count,
  and typed-array/number-array byte estimates where available.
- Use raw candidate rows as the primary resident candidate representation for
  exact candidate fill.
- Delay hydration of `BandoriTeamSearchResult` and `SearchCard[]` where proof
  logic only needs score, card ids, and masks.
- Compact generator heap nodes if trace still shows heap/slot-upper heap as a
  dominant structure:
  - prefer numeric selected-card indices over `SearchCard` object references
  - avoid duplicate selected-card arrays
  - keep slot upper and global key data in numeric arrays where practical
- Keep every branch cutoff and unseen-frontier upper proof unchanged.

Acceptance:

- `P02:260` no longer process-OOMs in the full 40-case run.
- `P02:260` still reports bounded if candidate fill or proof is incomplete.
- Peak memory on `P02:260` is at least 20 percent lower than `4495 MiB`.
- The next major target after the 20 percent milestone is `1 GiB`-class
  hard-case memory; if proof expansion approaches `700-800 MiB`, bounded return
  is preferred over process termination.
- No focused hard case loses exact status due to a representation mismatch.
- Any new abort reason is explicit and included in the report.

Score-only result-cache diagnostic artifacts:

| Artifact | Case | Cache | Status | Average | Max | Gap | Peak | Elapsed | Notes |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `low-memory-polish-hhwx-2026-06-16T15-25-36-749Z.json` | `P01:none` | disabled | exact | `7927236` | `7982835` | `0` | `1246 MiB` | `51721 ms` | score matched baseline; slower; no memory snapshot because the case completed without an abort/snapshot trigger |
| `low-memory-polish-hhwx-2026-06-16T15-26-45-402Z.json` | `P02:260` | disabled | bounded, memory-limited | `9376984` | `9412868` | `429693` | `4489 MiB` | `66853 ms` | score/gap matched baseline; peak barely changed from `4495 MiB`; candidate total rose to `516129` |

Interpretation:

- Disabling the score-only result cache is exact-safe as an opt-in diagnostic,
  but it is not the main low-memory lever. It reduces `P01:none` modestly and
  makes `P02:260` slower without materially lowering peak memory.
- Keep the switch for future attribution runs, but do not use it as the primary
  low-memory strategy.

Score-calculation-cache diagnostic artifacts:

| Artifact | Case | Score calc cache | Score-only result cache | Status | Average | Max | Gap | Peak | Elapsed | Notes |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `low-memory-polish-hhwx-2026-06-16T15-42-26-063Z.json` | `P02:260` | enabled | enabled | bounded, memory-limited | `9376984` | `9412868` | `429693` | `4492 MiB` | `47269 ms` | baseline profile with scoreCache attribution; `skillWindowContributionCountForChartTotal=1211066`, `baseScoreCountForChartTotal=119468`, `scoreOnlyTeamEvaluationCacheSizeTotal=753387` |
| `low-memory-polish-hhwx-2026-06-16T15-38-02-489Z.json` | `P01:none` | disabled | enabled | exact | `7927236` | `7982835` | `0` | `1176 MiB` | `71763 ms` | exact and scores preserved; slower |
| `low-memory-polish-hhwx-2026-06-16T15-39-30-916Z.json` | `P02:260` | disabled | enabled | bounded | `9376984` | `9412868` | `382812` | `3864 MiB` | `138045 ms` | no longer memory-limited; peak is `14.0%` below `4495 MiB`; candidate fill reaches soft limit |
| `low-memory-polish-hhwx-2026-06-16T15-43-51-957Z.json` | `P02:260` | disabled | disabled | bounded | `9376984` | `9412868` | `382812` | `4252 MiB` | `118931 ms` | worse than disabling score calculation cache alone; keep score-only result cache enabled |

Focused score-calculation-cache matrix:

| Artifact | Case | Status | Average | Max | Gap | Peak | Elapsed | Baseline Comparison |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `low-memory-polish-hhwx-2026-06-16T15-46-27-887Z.json` | `P08:260` | bounded, solve-timeout | `8912922` | `8993248` | `308488` | `2533 MiB` | `300018 ms` | score/max preserved, but exact regressed versus the enabled-cache exact artifact |
| `low-memory-polish-hhwx-2026-06-16T15-46-27-887Z.json` | `P08:323` | bounded | `9249509` | `9368642` | `211222` | `4372 MiB` | `261324 ms` | score/max preserved, but exact regressed versus the enabled-cache exact artifact |
| `low-memory-polish-hhwx-2026-06-16T15-46-27-887Z.json` | `P10:260` | exact | `8887419` | `8977612` | `0` | `3377 MiB` | `297288 ms` | exact and scores preserved; peak improved from `3983 MiB` |

Interpretation:

- The lower-level score calculation cache is a real P02 memory lever:
  disabling it converts `P02:260` from memory-limited to bounded-by-soft-limit
  and lowers peak from about `4495 MiB` to `3864 MiB`.
- It is not acceptable as a global default because it makes `P08:260` and
  `P08:323` miss exact within the same budget. It should be treated as a
  memory-pressure fallback or replaced by bounded/LRU score-cache policies.
- The next Stage 3 step should be primary raw candidate/result storage plus
  compact generator/global-cache state. A cache-only design remains possible,
  but it needs a better policy than full disablement or simple bounded `Map`
  eviction.

Pressure cache fallback artifacts:

| Artifact | Case | Trigger | Status | Average | Max | Gap | Peak | Elapsed | Notes |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `low-memory-polish-hhwx-2026-06-16T17-26-21-463Z.json` | `P02:260` | score-calc pressure only | bounded, memory-limited | `9376984` | `9412868` | `416575` | `4494 MiB` | `125208 ms` | triggered at max slot card count `265`; not enough alone after later code changes |
| `low-memory-polish-hhwx-2026-06-16T17-29-29-711Z.json` | `P02:260` | score-calc pressure + manual score-only cache disabled | bounded | `9376984` | `9412868` | `382812` | `4021 MiB` | `114866 ms` | proves the combination is useful and exact-safe for P02 |
| `low-memory-polish-hhwx-2026-06-16T17-33-09-935Z.json` | `P02:260` | score-calc pressure + score-only pressure | bounded | `9376984` | `9412868` | `382812` | `3706 MiB` | `119623 ms` | first opt-in P02 run with `memoryLimited=false`; `17.6%` below `4495 MiB`, still short of the `20%` Stage 3 target |
| `low-memory-polish-hhwx-2026-06-16T17-35-27-982Z.json` | `P08:260` | not triggered | exact | `8912922` | `8993248` | `0` | `2391 MiB` | `253809 ms` | focused exact case preserved |
| `low-memory-polish-hhwx-2026-06-16T17-35-27-982Z.json` | `P08:323` | not triggered | exact | `9249509` | `9368642` | `0` | `4273 MiB` | `166070 ms` | focused exact case preserved |
| `low-memory-polish-hhwx-2026-06-16T17-35-27-982Z.json` | `P10:260` | not triggered | exact | `8887419` | `8977612` | `0` | `3957 MiB` | `207454 ms` | focused exact case preserved |

Interpretation:

- The pressure fallback is proof-neutral because it only disables memoization;
  it does not change candidate cutoffs, upper-bound contracts, or final
  exact/bounded reporting.
- The combined fallback is the first current-branch P02 slice that avoids the
  memory-limited abort and materially lowers peak memory while preserving
  average/max scores. It is still an opt-in fallback, not a default route,
  because it is slower and remains below the Stage 3 `20%` memory target.
- The focused exact gate confirms the threshold did not trigger on
  `P08:260`, `P08:323`, or `P10:260`, preserving their exact status in the
  current focused run.

Bounded and skill-window-only score-cache experiments:

| Artifact | Case | Cache Policy | Status | Average | Max | Gap | Peak | Elapsed | Notes |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `low-memory-polish-hhwx-2026-06-16T16-09-38-162Z.json` | `P01:none` | bounded score-calc cache, limit `200000` | exact | `7927236` | `7982835` | `0` | `1775 MiB` | `45157 ms` | scores preserved, but peak is worse than nearby P01 diagnostic baselines |
| `low-memory-polish-hhwx-2026-06-16T16-10-34-221Z.json` | `P02:260` | bounded score-calc cache, limit `200000` | bounded, memory-limited | `9376984` | `9412868` | `429693` | `4493 MiB` | `118783 ms` | no material peak improvement; each active generator still held up to `200000` skill-window entries |
| `low-memory-polish-hhwx-2026-06-16T16-13-09-961Z.json` | `P02:260` | bounded score-calc cache, limit `50000` | bounded, memory-limited | `9376984` | `9412868` | `429693` | `4494 MiB` | `127507 ms` | lower limit increased churn and did not reduce peak |
| `low-memory-polish-hhwx-2026-06-16T16-18-23-863Z.json` | `P01:none` | skill-window contribution cache disabled | exact | `7927236` | `7982835` | `0` | `1291 MiB` | `42893 ms` | acceptable on the small smoke case |
| `low-memory-polish-hhwx-2026-06-16T16-19-21-408Z.json` | `P02:260` | skill-window contribution cache disabled | bounded, memory-limited | `9376984` | `9412868` | `429693` | `4507 MiB` | `51923 ms` | worse than baseline; abort changed to `memory-soft-limit`; score/gap still matched the memory-limited baseline |

Interpretation:

- Simple bounded `Map` eviction is not a useful P02 memory lever. It preserves
  average/max score and proof status, but peak stays in the same
  `4493-4494 MiB` range and elapsed time increases.
- Removing only skill-window contribution caching is also not enough. P02 still
  reaches the soft memory guard, and the global complement/frontier structures
  continue to dominate the resident set.
- Keep these switches as diagnostic-only while the branch is experimental.
  They should not be promoted to product defaults, and future cache work should
  be driven by a new design rather than another fixed-size `Map` cap.

Generator heap-node index compaction:

Implementation:

- `MedleyExactSlotCandidateSearchNode` now stores selected cards as slot-local
  numeric search-card indices instead of retaining `SearchCard` object
  references in `selectedCard0..4`.
- `activeInSlotUpperHeap` is initialized on every node to keep the node shape
  stable while the global slot-upper heap toggles the flag.
- Search semantics are unchanged: selected `SearchCard[]` values are rebuilt
  on demand from `slot.searchCards` before upper-bound checks and score
  evaluation.

Focused artifacts:

| Artifact | Case | Status | Average | Max | Gap | Peak | Elapsed | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `low-memory-polish-hhwx-2026-06-16T16-27-57-180Z.json` | `P01:none` | exact | `7927236` | `7982835` | `0` | `1396 MiB` | `48397 ms` | smoke case preserved exact result and score fields |
| `low-memory-polish-hhwx-2026-06-16T16-28-56-012Z.json` | `P02:260` | bounded, memory-limited | `9376984` | `9412868` | `429693` | `4493 MiB` | `52122 ms` | score/gap preserved; candidate total `390848`; slot 0 still held `304632` heap nodes and `298285` global-complement entries |
| `low-memory-polish-hhwx-2026-06-16T16-31-13-691Z.json` | `P08:260` | exact | `8912922` | `8993248` | `0` | `2493 MiB` | `272158 ms` | exact result preserved |
| `low-memory-polish-hhwx-2026-06-16T16-31-13-691Z.json` | `P08:323` | exact | `9249509` | `9368642` | `0` | `4387 MiB` | `172092 ms` | exact result preserved |
| `low-memory-polish-hhwx-2026-06-16T16-31-13-691Z.json` | `P10:260` | exact | `8887419` | `8977612` | `0` | `3982 MiB` | `219782 ms` | exact result preserved |

Interpretation:

- The node-index change is proof-neutral on the focused gate and does not make
  exact/bounded status more optimistic.
- It does not materially lower `P02:260` memory: peak remains in the same
  `4493 MiB` class as the previous hard-case baseline. Search-card references
  inside heap nodes are therefore not the dominant resident structure.
- Keep it only as a stepping stone toward compact generator/frontier storage.
  The next meaningful Stage 3 implementation must remove rich
  `MedleyTeamCandidate` / score-result object residency or move pair/frontier
  helpers to raw indices; further node-field micro-optimizations should not be
  prioritized.

Shared score-only empty payloads:

Implementation:

- Score-only medley evaluations now reuse immutable empty arrays/objects for
  fields that are intentionally absent in score-only mode:
  `eventPointOptions`, `supportCards`, `cards`, `skills`, and
  `skillOrderCardIds`.
- This reduces repeated tiny allocations without changing score calculation,
  candidate cutoffs, or proof bookkeeping.

Focused artifacts:

| Artifact | Case | Status | Average | Max | Gap | Peak | Elapsed | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `low-memory-polish-hhwx-2026-06-16T16-47-09-338Z.json` | `P01:none` | exact | `7927236` | `7982835` | `0` | `1322 MiB` | `49122 ms` | exact result preserved |
| `low-memory-polish-hhwx-2026-06-16T16-48-11-051Z.json` | `P02:260` | bounded, memory-limited | `9376984` | `9412868` | `429693` | `4491 MiB` | `52679 ms` | no material hard-case improvement |

Candidate card-retention compaction:

Implementation:

- `HHWX_LOW_MEMORY_COMPACT_CANDIDATE_CARDS=1` stores slot-local
  `cardSearchIndices` on `MedleyTeamCandidate` and clears retained
  `SearchCard[]` references after candidate creation.
- Hydration and signature diagnostics call `getMedleyExactCandidateCards()`,
  which reconstructs the selected `SearchCard[]` from `slot.searchCards`.

Focused artifacts:

| Artifact | Case | Status | Average | Max | Gap | Peak | Elapsed | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `low-memory-polish-hhwx-2026-06-16T16-52-28-698Z.json` | `P01:none` | exact | `7927236` | `7982835` | `0` | `1169 MiB` | `48972 ms` | small-case improvement |
| `low-memory-polish-hhwx-2026-06-16T16-53-28-052Z.json` | `P02:260` | bounded, memory-limited | `9376984` | `9412868` | `429693` | `4493 MiB` | `49819 ms` | flag active; P02 memory class unchanged |
| `low-memory-polish-hhwx-2026-06-16T16-54-58-440Z.json` | `P08:260` | exact | `8912922` | `8993248` | `0` | `2507 MiB` | `273087 ms` | exact result preserved |
| `low-memory-polish-hhwx-2026-06-16T16-54-58-440Z.json` | `P08:323` | exact | `9249509` | `9368642` | `0` | `4218 MiB` | `172865 ms` | exact result preserved; peak improved versus nearby `4387 MiB` focused gate |
| `low-memory-polish-hhwx-2026-06-16T16-54-58-440Z.json` | `P10:260` | exact | `8887419` | `8977612` | `0` | `3894 MiB` | `212382 ms` | exact result preserved |

Compact score-only cache:

Implementation:

- `HHWX_LOW_MEMORY_COMPACT_SCORE_ONLY_CACHE=1` stores score-only cache entries
  as compact numeric records and hydrates a score-only
  `BandoriTeamSearchResult` on cache hit.
- The compact cache stores score, average/max/min score, max-score order
  counters, total power, leader identity, and score-relevant same-band /
  same-attribute context. It intentionally does not preserve display payloads
  that score-only candidate fill does not consume.

Focused artifacts:

| Artifact | Case | Status | Average | Max | Gap | Peak | Elapsed | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `low-memory-polish-hhwx-2026-06-16T17-09-29-506Z.json` | `P01:none` | exact | `7927236` | `7982835` | `0` | `1699 MiB` | `47022 ms` | result preserved; peak worse on small case |
| `low-memory-polish-hhwx-2026-06-16T17-10-30-117Z.json` | `P02:260` | bounded, memory-limited | `9376984` | `9412868` | `429693` | `4491 MiB` | `47942 ms` | compact cache active; no material hard-case improvement |
| `low-memory-polish-hhwx-2026-06-16T17-14-03-743Z.json` | `P02:260` | bounded, memory-limited | `9376984` | `9412868` | `429693` | `4494 MiB` | `50732 ms` | combined compact score-only cache + compact candidate cards |
| `low-memory-polish-hhwx-2026-06-16T17-19-36-894Z.json` | `P01:none` | exact | `7927236` | `7982835` | `0` | `1391 MiB` | `44258 ms` | post-type-cleanup smoke with both compact flags |

Combined trace interpretation:

- The combination snapshot recorded `candidateCardsRetention: "disabled"` and
  `scoreOnlyCacheRepresentation: "compact"`, so both opt-in compactions were
  active.
- P02 still aborted at `candidate-fill-generator-aborted`, with
  `404867` generated candidates, candidate counts `[57065, 212825, 134977]`,
  and `814841` score-only evaluations.
- The same snapshot still reported `797434` score-only cache entries, `327009`
  active slot-0 heap nodes, and `336336` slot-0 global-complement cache
  entries.
- Therefore these object-shape compactions are useful diagnostics and may help
  smaller cases, but they do not solve the hard-case bottleneck. The next
  significant memory attempt must either reduce candidate birth before these
  structures are populated, or move the generator/frontier/complement state
  itself to a compact raw-index representation.

Configuration seeding headroom checkpoint:

Implementation:

- `HHWX_LOW_MEMORY_SKIP_SEEDING_HEADROOM_MIB` now exposes the existing
  `skipConfigurationSeedingWhenMemoryHeadroomBelowMiB` optimization option in
  the local low-memory benchmark harness.
- This is proof-neutral: configuration seeding is only an incumbent-improvement
  pass. Skipping it cannot make an unproved search exact; it only preserves the
  incumbent from earlier seed passes and lets the proof path spend memory on
  exact candidate join instead.
- A separate diagnostic switch,
  `HHWX_LOW_MEMORY_INITIAL_SCORE_CALC_CACHE_PRESSURE_FALLBACK=1`, disables the
  low-memory initial-candidate score calculation cache under slot-card pressure.
  It is kept as an attribution knob, but it was not the `P01:244` bottleneck
  because that case was using the normal initial-candidate generator path.
- `HHWX_LOW_MEMORY_AUTO_SEEDING_PRESSURE_SKIP=1` now enables a narrower
  automatic policy. It skips configuration seeding only when all of these are
  true:
  - a current incumbent already exists
  - the active configuration has a finite observed or tight upper bound
  - the case has event-bonus pressure and the max slot card count is at least
    the configured threshold, default `200`
  - current memory headroom is below the configured pressure threshold,
    default `4000 MiB`
- The automatic policy records its proof-neutral reason in
  `configurationTrace` as `skipConfigurationSeedingReason:
  "low-memory-pressure"` and does not alter exact candidate join proof logic.

Key finding:

- `P01:244` had only about `1084 MiB` used before configuration seeding, but
  seeding raised the process peak to about `6771 MiB` while leaving the best
  score unchanged. The later exact candidate join then aborted immediately at
  `initial-candidate`.
- Raising the seeding-skip headroom threshold to `4000 MiB` skipped that
  no-gain seeding pass, allowed exact candidate join to complete, and improved
  the result.

Focused artifacts:

| Artifact | Cases | Seeding Headroom | Status | Average / Max | Gap | Peak | Notes |
| --- | --- | ---: | --- | ---: | ---: | ---: | --- |
| `low-memory-polish-hhwx-2026-06-16T21-12-29-398Z.json` | `P01:244` | `1600 MiB` | bounded, memory-limited | `8850142 / 8904740` | `468574` | `6771 MiB` | trace showed `lowMemoryInitialCandidateSync=false`, seeding consumed the memory |
| `low-memory-polish-hhwx-2026-06-16T21-15-10-434Z.json` | `P01:244` | `4000 MiB` | exact | `8858388 / 8913195` | `0` | `1478 MiB` | seeding skipped; exact candidate join completed |
| `low-memory-polish-hhwx-2026-06-16T21-16-49-783Z.json` | `P01:244`, `P01:323`, `P04:244`, `P04:260` | `4000 MiB` | `4/4` exact | all preserved or improved | `0` | `3397 MiB` | all prior memory-limited 40-case rows became exact |
| `low-memory-polish-hhwx-2026-06-16T21-26-20-253Z.json` | `P02:260`, `P08:260`, `P08:323`, `P10:244`, `P10:260` | `4000 MiB` | `3/5` exact | all average/max fields present | `582812` | `3628 MiB` | `P02:260` and `P10:244` remained bounded as expected; no memory-limited rows |
| `low-memory-polish-hhwx-2026-06-16T22-40-04-069Z.json` | `P01:244` | auto pressure skip | exact | `8858388 / 8913195` | `0` | `1460 MiB` | trace proved old `1600 MiB` memory skip was false and auto `low-memory-pressure` triggered |
| `low-memory-polish-hhwx-2026-06-16T22-41-49-935Z.json` | 9 focused pressure rows | auto pressure skip | `7/9` exact | all average/max fields present | `582812` | `3399 MiB` | only `P02:260` and `P10:244` bounded; no memory-limited rows |

Matrix checkpoint:

| Artifact | Scope | Exact | Bounded | Failed | Timed Out | Memory Limited | Gap Total | Peak | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `low-memory-polish-hhwx-2026-06-16T20-08-10-567Z.json` | prior recommended 40-case run | `34` | `6` | `0` | `4` | `4` | `1594898` | `6790 MiB` | before seeding-skip headroom change |
| `medley-40-exact-isolated-2026-06-16T21-39-20-861Z-partial.json` | first `38/40` rows, `4000 MiB` seeding headroom | `36` | `2` | `0` | `0` | `0` | `582812` | `3626 MiB` | external shell timed out after 50 minutes, not a case timeout |
| `low-memory-polish-hhwx-2026-06-16T22-30-39-667Z.json` | final two rows, `P10:260/P10:323` | `2` | `0` | `0` | `0` | `0` | `0` | `2452 MiB` | supplemental run for rows not reached before shell timeout |
| `low-memory-polish-hhwx-2026-06-16T23-04-55-868Z.json` | full 40-case, auto pressure skip | `38` | `2` | `0` | `0` | `0` | `582812` | `4015 MiB` | single artifact gate; all 40 rows include average/max score |

Combined interpretation:

- The split matrix evidence is effectively `38/40` exact, `2/40` bounded,
  `0` failed, `0` timed out, `0` memory-limited, bounded gap total `582812`,
  and peak `3626 MiB`.
- This exceeds the near-term target of `35/40+` exact and cuts the observed
  peak from `6790 MiB` to `3626 MiB` versus the prior 40-case run on this
  branch.
- The full single-artifact auto-pressure gate is stronger proof of integration:
  `38/40` exact, `2/40` bounded, `0` failed, `0` timed out, `0`
  memory-limited, bounded gap total `582812`, and peak `4015 MiB`.
- The full-run peak is higher than the split run. `P02:260` was `3334 MiB` in
  the 9-case auto slice but `3674 MiB` in the full run with identical candidate
  counts `[400000, 212825, 134977]`, so the Stage 3 target of stable
  `P02:260 < 3596 MiB` should remain open.
- The next memory step should reduce the remaining candidate-fill resident set:
  `P02:260` still aborts at `candidate-fill-soft-limit` with `747802`
  generated candidates and compact candidate keys taking only about `26 MiB`.
  The remaining pressure is therefore in rich candidate/frontier/complement
  residency, not candidate-key storage.

Candidate instance-key retention checkpoint:

Implementation:

- `evaluateMedleySlotCandidateWithCache()` now omits per-candidate
  `cardInstanceKeys` arrays when the slot search pool has no duplicate
  `cardId`.
- Duplicate-card pools still retain instance keys, so profile-copy identity
  behavior is preserved where numeric `cardId` is not sufficient.
- This is an object-residency reduction only. Candidate scores, upper bounds,
  conflict checks, exact/bounded proof state, and final result hydration are
  unchanged.

Focused artifacts:

| Artifact | Scope | Status | Gap | Peak | Notes |
| --- | --- | --- | ---: | ---: | --- |
| `low-memory-polish-hhwx-2026-06-17T00-03-05-366Z.json` | `P02:260` before instance-key change | bounded | `382812` | `3278 MiB` | same auto pressure skip and pressure cache fallback flags |
| `low-memory-polish-hhwx-2026-06-17T00-13-01-067Z.json` | `P02:260` after instance-key change | bounded | `382812` | `3079 MiB` | average `9376984`, max `9412868`, generated `747802` |
| `low-memory-polish-hhwx-2026-06-17T00-15-36-221Z.json` | `P02:260`, `P08:260`, `P08:323`, `P10:260`, `P10:none` | `4/5` exact | `382812` | `3935 MiB` | focused exact rows preserved; only `P02:260` bounded |

Matrix checkpoint:

| Artifact | Scope | Exact | Bounded | Failed | Timed Out | Memory Limited | Gap Total | Peak | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `low-memory-polish-hhwx-2026-06-17T00-30-30-967Z.json` | full 40-case, auto pressure skip, no duplicate-free candidate instance keys | `38` | `2` | `0` | `0` | `0` | `582812` | `3929 MiB` | all 40 rows include average/max score |

Interpretation:

- `P02:260` improved from `3674 MiB` in the previous full gate to `3144 MiB`
  in the full gate after this change, with the same bounded gap, same average
  and max score, and the same candidate counts `[400000, 212825, 134977]`.
- This satisfies the current Stage 3 P02 target of `P02:260 < 3596 MiB` in a
  full 40-case run.
- The full-run peak is now `3929 MiB`, coming from `P10:none`; that row is
  exact and has much smaller candidate/key counts, so the remaining overall
  peak appears to include runtime/GC and non-P02 residency effects. The
  long-term hard-case target remains below `1 GiB`, so Stage 3/4 are not done.

### Stage 4: Raw-Index Final Join

Purpose:

- Reduce memory and CPU in the final three-slot disjoint selection once
  candidate fill can reach solve reliably.
- This can be prototyped before Stage 3 as a parity harness on cases that
  already reach solve, but it is not expected to fix `P02:260` by itself
  because that case aborts during candidate fill.

Implementation:

- Implement a raw-index final join for already-generated candidates.
- Use raw card masks or five-card numeric comparisons for conflict checks.
- Keep the old object join available behind a feature flag for A/B comparison.
- Return the same `BandoriMedleyTeamSearchResult` through lazy hydration.

Acceptance:

- On fixtures where current exact join proves exact, raw-index join returns the
  same exact/bounded status and same best average score.
- On bounded cases, raw-index join must not claim exact unless the same proof
  conditions are satisfied.
- `P08:323` must be repeated in both full-run and isolated modes if its status
  changes.
- Peak memory should improve further on cases that reach solve.

### Stage 5: Raw Pair-Upper And High-Pair Records

Purpose:

- Remove object and string-key residency from pair-upper proof helpers.

Implementation:

- Move pair-upper queries to raw candidate indices and compact masks.
- Store high-pair records as typed tuples rather than object records.
- Expire or compact records when incumbent and upper-bound state make them
  irrelevant.
- Preserve observed upper-bound reporting.

Acceptance:

- Pair-upper counters and abort diagnostics remain populated.
- Bounded gaps do not widen unexpectedly.
- `exactCandidateJoinPairComplementQueryCount` and high-pair record behavior
  remain explainable in trace snapshots.
- No exact/bounded regression on focused hard cases.

### Stage 6: Full Matrix Gate And Merge Readiness

Purpose:

- Decide whether the low-memory path is merge-worthy.

Implementation:

- Run the full 40-case matrix with the same fixture, 8GB heap, and 300000ms
  budget.
- Archive raw JSON and write a tracked report under
  `documents/bandori-team-builder/`.
- Compare against:
  - current hard-case baseline
  - historical accepted mainline reference
  - previous focused traces

Acceptance:

- `failedCount` is `0`.
- `exactCount` is at least `30/40`; target is `35/40+`.
- `boundedGapTotal` does not exceed `2692264` unless there is a documented
  proof-safety reason.
- Every non-failed row records both `averageScore` and `maxScore`.
- `P02:260` does not process-OOM.
- `P08:323` has a repeated focused check if its proof status changes.
- Peak memory is at least 20 percent lower on the original hard pressure cases,
  measured from trace/report fields.
- The feature flag and rollback path are documented.

## Long-Term Non-Goals

- Do not port calc wholesale.
- Do not use calc output as an HHWX correctness oracle.
- Do not mark candidate-capped, randomized, timed-out, memory-limited, or
  generator-aborted paths as exact.
- Do not merge a broad rewrite before a narrow feature-flagged path has passed
  focused hard-case validation.

## Active Goal: Phase 2 Raw Mirror, Calc Diagnostics, And Candidate-Fill Prep

Owner: main agent

Started: 2026-06-16

Goal:

- Continue the TypeScript typed-array / raw-index route while preserving HHWX
  exact/bounded proof semantics.
- Treat passive raw mirror validation as the completed bridge into raw data
  structures.
- Add calc-inspired no-op diagnostics before proof-changing pruning or a broad
  primary-storage rewrite.
- Use focused artifacts to choose between proof-backed early pruning and raw
  primary candidate storage.
- Keep Rust/WASM as a second-stage fallback only if TypeScript raw structures
  cannot approach the `1 GiB` hard-case target or the future product target
  requires calc-like stable hundreds-of-MB behavior.

Detailed plan:

1. Keep calc research and HHWX optimizer implementation separated. Calc remains
   a read-only side reference under ignored `temp/` assets.
2. Keep the benchmark runner as the canonical artifact writer for this branch,
   including average score, max score, proof status, and memory snapshots.
3. Preserve the Stage 2 raw mirror and raw-index final-join parity as
   debug-only no-op diagnostics.
4. Preserve the Stage 2.5 signature census artifacts as the first calc-inspired
   no-op diagnostic checkpoint.
5. Add upper replay and Level 0/1 dominance replay with violation counters.
6. Decide the next implementation lever from evidence:
   proof-backed early pruning if replay counters show safe large reductions;
   otherwise raw primary candidate storage and lazy hydration.
7. Re-run focused hard cases before attempting another 40-case matrix.

Mid-term task targets:

| Target | Desired Output | Acceptance |
| --- | --- | --- |
| Raw mirror | Typed-array raw candidate mirror behind `HHWX_LOW_MEMORY_RAW_MIRROR=1` | Focused cases report zero mirror mismatches |
| Raw join parity | Debug raw-index final join behind `HHWX_LOW_MEMORY_RAW_JOIN_PARITY=1` | Solve-reaching sample matches object best score |
| Signature census | Per-slot signature/prefix counts and upper ranges | Default-off and no returned result changes |
| Upper replay | Conservative skipable counts plus violation counters | Any violation blocks proof-backed pruning |
| Dominance replay | Level 0/1 dominated-candidate counts and examples | No candidate removal until replay is clean |
| Next code target | Pruning rule or primary raw storage selected from artifacts | Selection is backed by focused traces, not guesswork |
| Full validation | 40-case hard fixture rerun | Exact count does not regress; reports keep both average and max score |

Acceptance standards for this active goal:

- `documents/bandori-team-builder/roadmap.md` records the calc report
  conclusion, sequencing decision, `1 GiB` hard-case target, and `700-800 MiB`
  safety line.
- Raw mirror and raw parity diagnostics are opt-in and do not change default
  search behavior.
- Signature census, upper replay, and dominance replay are also opt-in no-op
  diagnostics until a HHWX proof reason is implemented.
- Exact/bounded status never becomes more optimistic due to diagnostics.
- Every non-failed focused row continues to record average score and max score.
- Focused validation covers at least `P02:260`, `P08:260`, `P08:323`, and
  `P10:260`.
- Any memory-changing candidate-fill implementation has a reproducible artifact
  before it is compared against the `4495 MiB` baseline.

## Non-Negotiable Constraints

- Exactness and proof safety are the primary gates. A memory reduction is not
  acceptable if it turns an unproved result into `exact`, weakens upper-bound
  contracts, or hides bounded gaps.
- Calc output is a black-box comparison target only. It can suggest data layout,
  pruning, and solver organization, but it cannot be used as proof that a HHWX
  result is exact.
- Any heuristic path, candidate cap, randomized bucket, or early stop must be
  isolated from exact proof paths unless the unseen frontier is still proven not
  to beat the incumbent.
- Benchmark comparisons must record both `averageScore` and `maxScore`.
- Fixed-card and fixed-skill-order simulations are diagnostic only. They are
  not substitutes for global team-builder proof runs.
- Temporary calc assets must remain under ignored `temp/` paths and be easy to
  delete as one bundle.

## Artifact Map

Tracked HHWX artifacts:

- Current roadmap: `documents/bandori-team-builder/roadmap.md`
- Current HHWX baseline report:
  `documents/bandori-team-builder/low-memory-polish-hhwx-results-2026-06-16.md`
- Historical exact roadmap:
  `documents/bandori-team-builder/medley-40-exact-roadmap.md`
- Historical accepted mainline report:
  `documents/bandori-team-builder/medley-40-exact-report-2026-06-12-185854-main-safe-backport.md`
- Benchmark driver under review:
  `scripts/bandori-medley-low-memory-polish-benchmark.cjs`

Ignored local artifacts:

- Current finalized HHWX run:
  `temp/bandori-team-builder/low-memory-polish/low-memory-polish-hhwx-finalized-2026-06-16T06-03-03-210Z.json`
- Latest HHWX pointer:
  `temp/bandori-team-builder/low-memory-polish/last-low-memory-polish-hhwx.json`
- Calc research bundle:
  `temp/bandori-team-builder/low-memory-polish/calc-research-2026-06-16/`
- Calc bundle README:
  `temp/bandori-team-builder/low-memory-polish/calc-research-2026-06-16/README.md`

## Current Baselines

### Current Hard-Case HHWX Baseline

Source:
`temp/bandori-team-builder/low-memory-polish/low-memory-polish-hhwx-finalized-2026-06-16T06-03-03-210Z.json`

Scope:

- Branch: `dev/low-memory-polish`
- Fixture: `temp/bandori-team-builder/hard-case-profiles-2026-06-02.json`
- Fixture SHA256:
  `af691fd983e7f18790492fa49bdec0ce95639a2833f04b5e35cadc575f0413ec`
- Profiles: `P01` through `P10`
- Events: `none`, `244`, `260`, `323`
- Matrix: `10 * 4 = 40` cases
- Per-case budget: `300000ms`
- Node heap: `--max-old-space-size=8192`

Result:

- `30/40` exact
- `9/40` bounded
- `1/40` failed
- Failed case: `P02:260`, Node 8GB heap OOM, exit code `134`
- Bounded gap total: `2692264`
- Timed out: `5` cases
- Median elapsed: `83734ms`
- P95 elapsed: `295630ms`
- Max elapsed: `300685ms`
- Highest `averageScore`: `11159629`, case `P07:244`
- Highest `maxScore`: `11210146`, case `P07:244`

Non-exact rows to prioritize:

| Case | Status | Primary Issue | Gap |
| --- | --- | --- | ---: |
| `P02:260` | failed | Node 8GB heap OOM | |
| `P01:244` | bounded | loose root upper bound | `606362` |
| `P03:323` | bounded | high-budget pair-upper timeout | `416612` |
| `P04:244` | bounded | initial-candidate timeout | `153982` |
| `P04:260` | bounded | high-budget pair-upper timeout | `176118` |
| `P08:260` | bounded | solve timeout | `308488` |
| `P08:323` | bounded | proof gap remains | `240363` |
| `P10:none` | bounded | candidate-fill-generator timeout | `430125` |
| `P10:244` | bounded | dominated same-coarse frontier | `200000` |
| `P10:260` | bounded | proof gap remains | `160214` |

### Historical Accepted Mainline Reference

Source:
`documents/bandori-team-builder/medley-40-exact-report-2026-06-12-185854-main-safe-backport.md`

Use this as a historical safety and memory reference, not as the current
hard-case fixture result.

- Accepted checkpoint: `35/40` exact
- Historical sampled peak heap: about `4489 MiB`
- Known lesson: full-run proof behavior can differ from isolated single-case
  behavior, especially around `P08:323`.

## Working Hypotheses

1. HHWX's dominant memory pressure is likely in candidate residency rather than
   arithmetic itself: candidate object arrays, candidate key sets, pair-upper
   query structures, conflict masks, and cached hydrated objects.
2. Calc's low-memory behavior likely comes from compact raw candidate
   representation plus a solver that works on indices and masks instead of
   keeping fully hydrated candidate objects through every phase.
3. The best HHWX path is not to port calc wholesale, but to preserve HHWX's
   proof framework while replacing hot-path candidate storage and join
   operations with compact raw representations.
4. The hardest validation risk is not reproducing a high score. It is proving
   that the new compact representation preserves every upper-bound and
   candidate-frontier contract.

## Workstreams

### A. Calc Research Track

Purpose: learn implementation ideas without depending on calc as an oracle.

Deliverables:

- Keep all calc raw assets under
  `temp/bandori-team-builder/low-memory-polish/calc-research-2026-06-16/`.
- Add or update an ignored research note inside that bundle when findings
  change.
- Produce a source-boundary map:
  - browser runtime entry
  - worker entry
  - WASM glue
  - solver-facing payload shape
  - metrics emitted by the public build
- Characterize visible solver behavior:
  - candidate count fields
  - solver candidate count fields
  - candidate caps
  - random bucket or heuristic paths
  - exact/proof status fields, or absence of such fields
- Run only small black-box samples unless the user explicitly reopens full calc
  testing. The P01:323 calc run already showed that full web testing can be
  too slow for the current phase.

Agent handoff:

- A second agent is useful for this track if it is constrained to read-only
  reverse engineering and ignored temp docs.
- The side agent must not edit HHWX optimizer code.
- The side agent must not claim exact equivalence unless it can identify an
  explicit proof contract in calc's implementation.

### B. HHWX Memory Attribution Track

Purpose: identify where HHWX holds memory before changing algorithm structure.

Tasks:

- Add instrumentation behind an opt-in flag, for example
  `HHWX_MEDLEY_MEMORY_TRACE=1`.
- Measure candidate counts and retained structure sizes at phase boundaries:
  - candidate pool generation
  - candidate key construction
  - root/slot frontier filtering
  - pair upper preparation
  - final exact join
  - result hydration
- For each non-exact or high-memory row, record:
  - peak heap
  - RSS or working set if available
  - candidate counts per song and slot
  - raw score range
  - pair-upper query count
  - proof status and bounded reason
- Prioritize these cases:
  - `P02:260` for OOM
  - `P08:260` for timeout under high pressure
  - `P08:323` for full-run versus isolated stability
  - `P10:260` for remaining bounded proof gap
  - `P01:244` because the gap is large despite short elapsed time

Acceptance for this track:

- We can explain the largest resident structures for at least `P02:260`,
  `P08:260`, and `P08:323`.
- We can point to specific code paths and data shapes before implementing the
  compact store.

### C. Compact Candidate Store Track

Purpose: replace expensive hot-path candidate residency with exact-preserving
raw storage.

Candidate design:

- Store raw candidates in struct-of-arrays form:
  - average score
  - max score
  - song index
  - slot index
  - area item/mode index
  - five card ids
  - five skill-order card ids
  - leader index
  - card conflict mask or compact disjoint key
  - hydration pointer or source candidate index
- Use typed arrays where possible:
  - `Int32Array` or `Float64Array` for scores, depending on existing score
    precision requirements
  - `Uint16Array` or `Uint32Array` for card ids, depending on max card id
  - `BigUint64Array` or packed `Uint32Array` words for conflict masks
  - `Uint32Array` for source indices and offsets
- Keep a small adapter that hydrates `MedleyTeamCandidate` only for:
  - final result output
  - debug traces
  - compatibility paths not yet migrated
- Avoid string candidate keys in hot loops. Use stable integer ids and packed
  mask/index tuples.

Proof-safety requirements:

- Candidate ordering must be deterministic.
- Every skipped candidate must still be covered by an explicit upper bound.
- Any deduplication must preserve the best candidate for the exact same
  semantic state.
- Raw-store joins must return the same exact/bounded status and bounded gap as
  the object-store path on synthetic fixtures before being used in the 40-case
  matrix.

### D. Raw Pair-Upper And Join Track

Purpose: reduce memory in proof-heavy exact join phases.

Tasks:

- Move pair-upper logic to raw candidate indices and card masks.
- Stream pair combinations where possible instead of materializing large arrays.
- Cache upper-bound answers by compact integer key, not hydrated candidate
  object identity.
- Keep existing proof-status output unchanged:
  - `isExhaustive`
  - bounded reason
  - upper gap
  - candidate/proof progress metrics

Acceptance:

- Synthetic exact fixtures match old and new paths exactly.
- 40-case benchmark has no false exact regression.
- Bounded rows still expose comparable or better gap diagnostics.

### E. Benchmark And Validation Track

Purpose: make progress measurable and repeatable.

Every benchmark report must include:

- branch and commit
- fixture path and SHA256
- command used
- Node version
- Node heap limit
- per-case budget
- exact/bounded/failed counts
- average score and max score for every non-failed case
- bounded gap per bounded case
- timeout and OOM markers
- peak heap/RSS when instrumentation is available
- raw JSON artifact path

Required benchmark matrix:

- `P01` through `P10`
- `none`, `244`, `260`, `323`
- all-scope mode
- per-case budget `300000ms` unless deliberately running a focused short smoke

Regression gates:

- Never reduce exact count without an explained and accepted proof-safety
  reason.
- Never report exact for a case whose old and new proof contracts disagree.
- Never drop `maxScore` from reports.
- Any `averageScore` decrease in an exact row requires investigation.
- Any `maxScore` decrease is diagnostic and must be explained, but the primary
  objective remains average score.

Memory target:

- First target: eliminate `P02:260` OOM under the same 8GB Node heap.
- Second target: reduce peak memory below the historical sampled peak of about
  `4489 MiB` without exactness regression.
- Stretch target: make the full hard-case 40-case matrix more exact than the
  current `30/40` hard-case baseline while also reducing memory.

## Phase Plan

### Phase 0: Stabilize Artifacts

Status: in progress.

Done:

- Current HHWX hard-case baseline is saved as a JSON artifact.
- Current HHWX report is saved under `documents/bandori-team-builder/`.
- Calc temp assets are consolidated under one ignored temp bundle.

Remaining:

- Decide whether `scripts/bandori-medley-low-memory-polish-benchmark.cjs`
  should be tracked as the canonical runner for this branch.
- Fix or replace the mojibake in
  `documents/bandori-team-builder/low-memory-polish-hhwx-results-2026-06-16.md`
  if the document will be reviewed directly.
- Add a short README pointer from `documents/bandori-team-builder/README.md`
  only after this roadmap stabilizes.

### Phase 1: Calc Read-Only Reverse Engineering

Goal: learn what to copy conceptually and what not to trust.

Tasks:

- Summarize the public JS/worker/WASM boundary.
- Identify candidate and solver metrics visible from exported diagnostics.
- Confirm whether public calc exposes any proof status equivalent to HHWX.
- Document score-objective differences:
  - calc visible result appears max-score oriented
  - HHWX primary result is average-score oriented
- Preserve P01:323 calc exported JSON as a black-box comparison artifact only.

Exit criteria:

- We have a concise calc algorithm note in the ignored calc bundle.
- We have a list of concrete implementation ideas suitable for HHWX.
- We have a list of calc behaviors that must not be copied into exact paths.

### Phase 2: HHWX Memory Attribution

Goal: identify the largest resident structures and the proof stages that cause
memory spikes.

Tasks:

- Add opt-in trace instrumentation.
- Run focused traces for `P02:260`, `P08:260`, `P08:323`, and `P10:260`.
- Produce a tracked attribution note or update this roadmap with hard numbers.

Exit criteria:

- The OOM path has a concrete memory attribution.
- At least one large structure is selected for compact-store replacement.
- We know whether pair-upper, candidate generation, or hydration is the first
  implementation target.

### Phase 3: Compact Store Prototype

Goal: prove the data-layout change can preserve semantics on small fixtures.

Tasks:

- Introduce raw candidate store types behind a feature flag.
- Add conversion from existing `MedleyTeamCandidate` generation output to raw
  store as the first step, before rewriting generation itself.
- Implement lazy hydration for final output.
- Add synthetic tests for disjointness, dedupe, ordering, and score retention.

Exit criteria:

- Feature-flagged raw store matches old path on small deterministic fixtures.
- No production path uses the raw store by default.

### Phase 4: Raw Join Integration

Goal: move the memory-heavy exact join stages to raw indices and masks.

Tasks:

- Port pair-upper preparation to raw candidate indices.
- Port final join conflict checks to compact masks.
- Keep old object path available for A/B comparison.
- Run focused non-exact cases in both modes.

Exit criteria:

- No exactness regression on focused cases.
- At least one previous high-memory case shows lower peak memory.
- Bounded diagnostics remain intact.

### Phase 5: Full Matrix Acceptance

Goal: validate the branch against the retained 40-case hard-case matrix.

Tasks:

- Run the full `10 * 4` matrix with the same 8GB heap and 300000ms budget.
- Archive raw JSON and write a tracked report.
- Compare against:
  - current hard-case baseline
  - historical accepted mainline memory reference
- Repeat `P08:323` in full-run and isolated modes if it changes status.

Exit criteria:

- Exact count does not regress.
- Proof status is stable and explainable.
- Memory improves on at least the targeted high-pressure cases.
- `P02:260` no longer fails, or the remaining blocker is documented with
  measured attribution.

## Side-Agent Brief

Use a second agent only for calc reverse engineering or isolated measurement
tasks. Do not hand it the optimizer implementation unless its output is a
reviewable note or small, bounded patch.

Suggested prompt:

```text
You are a read-only research agent for HHWX medley low-memory work.
Use only files under temp/bandori-team-builder/low-memory-polish/calc-research-2026-06-16
and tracked documents under documents/bandori-team-builder for context.
Do not edit HHWX optimizer code.
Document calc.krkrdkdk.cn's public JS/worker/WASM boundary, solver-facing
payload shape, visible metrics, candidate limits, and any evidence for or
against exact proof semantics. Treat calc as a design reference, not as a
correctness oracle. Write findings into the ignored calc research bundle.
```

## Immediate Next Actions

1. Treat Stage 1 key/cache compaction as diagnostic-complete: it preserved
   semantics but did not materially lower memory.
2. Track `scripts/bandori-medley-low-memory-polish-benchmark.cjs` as the
   canonical runner for this branch, after reviewing the local patcher behavior.
3. Keep calc side-agent work stopped for now. The current calc notes are
   detailed enough to guide HHWX diagnostics. Further source digging is useful
   only if a specific HHWX replay counter cannot be designed from the existing
   report.
4. Treat the passive raw candidate mirror and P01 raw-index final-join parity as
   Stage 2 complete enough for the next diagnostic step.
5. Treat Stage 2.5 no-op diagnostics as implemented enough for the next
   implementation decision: signature census, materialized upper replay,
   materialized Level 0/1 dominance replay, and raw solver-input census are
   feature-flagged, artifact-backed, and validated on `P02:260`, `P08:260`,
   `P08:323`, and `P10:260`, plus `P01:none` as a small smoke case.
6. Use the first Stage 2.5 readout to choose Stage 3 primary typed-array raw
   candidate storage next. The hard rows still need lower object residency:
   materialized upper replay did not find a direct skip lever, dominance replay
   was capped before hard-row proof value, and raw solver-input estimates are
   small enough that final solver input is not the main GiB-scale pressure.
7. Keep pre-materialization signature/prefix upper and dominance certificates as
   a parallel proof-design track. They are likely the route toward calc-like
   candidate-birth reduction, but they must not gate the first object-residency
   compaction pass.
8. Treat the Stage 3 score-only-cache-disable, shared empty score-only payload,
   compact candidate-card retention, and compact score-only cache slices as
   implemented but not primary levers. They preserved scores/proof state on the
   focused runs, but `P02:260` stayed in the `4491-4494 MiB` memory class.
9. Continue Stage 3 with raw candidate rows as the primary resident
   representation for exact candidate fill and lazy hydration for final
   winners/diagnostics, but include the new score-cache evidence in the design:
   unbounded skill-window/base-score caches are a real hard-case memory source.
10. Treat `disableExactCandidateScoreCalculationCache` as an effective
   hard-case fallback, not a global default. It lowers `P02:260` peak to
   `3864 MiB`, but it makes `P08:260` and `P08:323` bounded under the same
   budget. Simple bounded score-cache residency and skill-window-only cache
   removal were tested next and did not materially lower P02 peak memory, so
   do not continue cache-only work unless the cache policy changes
   substantially.
11. Keep the combined pressure fallback as an opt-in safety valve:
   `HHWX_LOW_MEMORY_SCORE_CALC_CACHE_PRESSURE_FALLBACK=1` plus
   `HHWX_LOW_MEMORY_SCORE_ONLY_CACHE_PRESSURE_FALLBACK=1` reduced `P02:260`
   to `3706 MiB` without changing scores or making proof status more
   optimistic, while the focused exact cases stayed exact because the threshold
   did not trigger. This is not the final Stage 3 answer because it is slower
   and still misses the `20%` target.
12. Treat candidate-birth reduction as the next calc-inspired algorithm track:
   design a pre-materialization signature/prefix upper or dominance certificate
   that can prove skipped branches cannot beat the incumbent. Do not remove
   candidates based on calc-style dominance until HHWX has violation counters
   and a proof ledger reason.
13. Keep raw-index final join as a parity harness, not the primary memory fix for
   `P02:260`, until that case reaches solve.
14. Re-run `P02:260`, then `P08:260`, `P08:323`, and `P10:260` with
   `HHWX_LOW_MEMORY_TRACE=1` after each candidate-fill memory change.

## Phase 1 Trace Log

### P02:260 Memory Attribution

Run:

- Command: `HHWX_LOW_MEMORY_CASES=P02:260 HHWX_LOW_MEMORY_TRACE=1 node scripts/bandori-medley-low-memory-polish-benchmark.cjs hhwx`
- Artifact:
  `temp/bandori-team-builder/low-memory-polish/low-memory-polish-hhwx-2026-06-16T10-49-04-225Z.json`
- Wrapper stdout:
  `temp/bandori-team-builder/low-memory-polish/low-memory-polish-hhwx-2026-06-16T10-49-04-225Z.stdout.log`

Result:

- Status: bounded
- `memoryLimited`: true
- `elapsedMs`: `49081`
- `averageScore`: `9376984`
- `maxScore`: `9412868`
- `observedScoreUpperBoundGap`: `429693`
- `memorySoftLimitMiB`: `4488`
- `peakUsedHeapMiB`: `4495`
- `peakNodeHeapUsedMiB`: `3777`
- `peakNodeRssMiB`: `4495`

Exact candidate join:

- Abort reason: `candidate-fill-generator-aborted`
- Abort slot index: `0`
- Abort candidate count: `36704`
- Last candidate counts by slot: `[36704, 212825, 134977]`
- Generated candidate count: `384506`
- Max candidate count in one slot: `212825`
- Popped node count: `402595`
- Pair upper elapsed: `15094ms`
- Candidate fill elapsed: `9634ms`
- Solve elapsed: `0ms`
- Pair complement query count: `5819`
- High-pair record count: `213`

Memory snapshot at abort:

- Phase: `candidate-fill-generator-aborted`
- Candidate count total: `384506`
- Candidate key count total: `384506`
- Slot 0 generator:
  - heap nodes: `286345`
  - slot-upper heap nodes: `286345`
  - active heap nodes: `286345`
  - global complement upper cache: `273085`
  - global pair complement upper cache: `5819`
  - pair upper query cache: `1`
  - right candidate bitset: `4.25 MiB`

Interpretation:

- `P02:260` does not reach the final exact join solve; it hits the memory guard
  during candidate fill.
- The right-candidate bitset is small, so bitset storage is not the first
  memory target.
- The largest visible resident structures are object-backed candidate arrays,
  string candidate key sets, string-key complement caches, and slot 0 generator
  heap/slot-upper heap state.
- Therefore the first implementation target should be candidate-fill memory:
  compact numeric candidate keys, compact complement-cache keys, and a raw
  candidate mirror. A raw final disjoint solver is still useful, but it is not
  enough to solve this case because solve is never reached.

### Stage 1 First-Pass Implementation

Code changes:

- `src/lib/bandori/team-builder/medley/types.ts`
  - Added `MedleyExactCandidateCardKey = bigint | string`.
  - Changed `MedleyExactSlotCandidateGlobalPruning.excludedCandidateKeys` to
    use the compact key type.
- `src/lib/bandori/team-builder/medley/experiments/exact-candidate-join.ts`
  - Added packed card-id key helpers.
  - Replaced exact candidate duplicate keys with packed card-id keys.
  - Replaced global complement upper caches with prefix buckets plus packed
    card-id keys.
  - Added `candidateKeyRepresentation: "packed-card-id"` to memory snapshots.
- `src/lib/bandori/team-builder/medley/experiments/exact-candidate-join-heap.ts`
  - Added direct slot-upper heap helpers for
    `MedleyExactSlotCandidateSearchNode`, removing the extra wrapper object in
    the active code path.

Validation commands:

- `node --check scripts/bandori-medley-low-memory-polish-benchmark.cjs`
- `HHWX_LOW_MEMORY_CASES=P02:260 HHWX_LOW_MEMORY_TRACE=1 node scripts/bandori-medley-low-memory-polish-benchmark.cjs hhwx`

Focused trace results:

| Artifact | Change Under Test | Status | Average | Max | Gap | Peak |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `low-memory-polish-hhwx-2026-06-16T10-49-04-225Z.json` | pre-change baseline | bounded, memory-limited | `9376984` | `9412868` | `429693` | `4495 MiB` |
| `low-memory-polish-hhwx-2026-06-16T11-45-13-561Z.json` | packed candidate key | bounded, memory-limited | `9376984` | `9412868` | `429693` | `4494 MiB` |
| `low-memory-polish-hhwx-2026-06-16T11-48-43-123Z.json` | nested complement caches | bounded, memory-limited | `9376984` | `9412868` | `429693` | `4493 MiB` |
| `low-memory-polish-hhwx-2026-06-16T11-52-47-713Z.json` | direct slot-upper node heap | bounded, memory-limited | `9376984` | `9412868` | `429693` | `4491 MiB` |

Latest snapshot:

- Candidate count total: `388447`
- Candidate key count total: `388447`
- Slot 0 generator:
  - heap nodes: `299924`
  - slot-upper heap nodes: `299924`
  - active heap nodes: `299924`
  - global complement upper cache entries: `290957`
  - global complement upper cache buckets: `1`
  - global pair complement upper cache entries: `5819`
  - global pair complement upper cache buckets: `5665`
  - right candidate bitset: `4.25 MiB`

Conclusion:

- The first-pass key/cache compaction preserves the observed result semantics:
  same bounded status, same average score, same max score, same upper gap.
- Peak memory improved only from `4495 MiB` to `4491 MiB`, far below the Stage 1
  target of at least 10 percent.
- The small drop, plus the increased number of candidates reached before the
  guard, shows that string candidate keys and wrapper heap nodes are not the
  dominant resident memory.
- Next implementation work should move to Stage 2/3: raw candidate rows and
  generator heap-node compaction. In particular, reducing the resident
  `MedleyTeamCandidate` objects and the roughly `300k` active slot 0 search
  nodes is the next measurable target.

### Stage 2 Raw Mirror And Raw-Index Parity

Status: started; debug-only parity and mirror paths implemented.

Code changes:

- Added `debugExactCandidateRawMirror` and `HHWX_LOW_MEMORY_RAW_MIRROR=1`.
- Added `debugExactCandidateRawJoinParity` and
  `HHWX_LOW_MEMORY_RAW_JOIN_PARITY=1`.
- Added a passive typed-array raw candidate mirror in
  `exact-candidate-join.ts`.
  - Representation: struct-of-arrays typed arrays.
  - Fields: `score`, `averageScore`, `maxScore`, `minScore`, `cardId0..4`.
  - Default behavior is unchanged; mirror allocation only happens behind the
    debug flag.
- Added a debug raw-index final-join parity runner for solve-reaching cases.
  - It uses typed-array scores/card ids and raw indices.
  - It records `rawBestScore`, `objectBestScore`, and `matched`.
  - It is size-limited and writes `skipped` rather than blocking large cases.
- Added `after-candidate-fill` memory snapshots only when raw mirror/parity
  debug is enabled. Keeping this snapshot on for ordinary memory attribution
  caused P02:260 to run until Node heap OOM, so it must remain scoped.

Raw mirror focused validation:

| Artifact | Case | Status | Average | Max | Gap | Mirror Count | Mirror Mismatch | Mirror Retained |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `low-memory-polish-hhwx-2026-06-16T12-06-49-105Z.json` | `P01:none` | exact | `7927236` | `7982835` | `0` | `1550` | `0` | `0.09 MiB` |
| `low-memory-polish-hhwx-2026-06-16T12-08-37-065Z.json` | `P02:260` | bounded, memory-limited | `9376984` | `9412868` | `429693` | `386853` | `0` | `20.25 MiB` |
| `low-memory-polish-hhwx-2026-06-16T12-10-10-436Z.json` | `P08:260` | exact | `8912922` | `8993248` | `0` | `28158` | `0` | `1.41 MiB` |
| `low-memory-polish-hhwx-2026-06-16T12-15-21-901Z.json` | `P08:323` | exact | `9249509` | `9368642` | `0` | `557165` | `0` | `28.13 MiB` |
| `low-memory-polish-hhwx-2026-06-16T12-21-27-892Z.json` | `P10:260` | exact | `8887419` | `8977612` | `0` | `94855` | `0` | `4.50 MiB` |

Raw-index final-join parity validation:

- Artifact:
  `temp/bandori-team-builder/low-memory-polish/low-memory-polish-hhwx-2026-06-16T13-06-20-103Z.json`
- Case: `P01:none`
- Status: exact
- `averageScore`: `7927236`
- `maxScore`: `7982835`
- `observedScoreUpperBoundGap`: `0`
- Raw parity snapshots: `8`
- Raw parity mismatches: `0`
- Best-score parity observed: `rawBestScore=7927236`,
  `objectBestScore=7927236`, `matched=true`

Candidate-fill object compression attempt:

- Attempted a compact score-only `BandoriTeamSearchResult` object for the
  score-only exact candidate cache.
- Rejected as a default-path change after measurement:
  - Artifact:
    `low-memory-polish-hhwx-2026-06-16T13-01-13-817Z.json`
  - Result: `P02:260` process OOM, `failedCount=1`
  - Reason: ordinary-object shape reduction did not preserve the memory guard
    behavior and pushed the run to Node heap OOM.
- The compact-result code was removed. This supports the calc-derived
  conclusion that the next safe target should be typed-array primary storage,
  not smaller ad hoc JS result objects.

P02:260 recovery check:

- Artifact:
  `temp/bandori-team-builder/low-memory-polish/low-memory-polish-hhwx-2026-06-16T13-13-08-984Z.json`
- Status: bounded
- `memoryLimited`: true
- `averageScore`: `9376984`
- `maxScore`: `9412868`
- `observedScoreUpperBoundGap`: `429693`
- `peakUsedHeapMiB`: `4495`
- Snapshot count: `1`
- Final phase: `candidate-fill-generator-aborted`

Conclusion:

- Passive raw mirror parity is stable on the focused Stage 2 cases and does not
  make exact/bounded status more optimistic.
- Raw-index final join can reproduce the object join score on a solve-reaching
  sample without participating in the returned result.
- P02:260 still does not reach final solve; the blocker remains candidate-fill
  resident state.
- The next implementation step should make raw candidate rows primary for
  candidate storage, while keeping lazy hydration for the final selected
  candidates. The rejected compact-result attempt is evidence against relying
  on smaller ordinary JS result objects as the main memory strategy.

## Change Log

- 2026-06-17: Added opt-in high-pressure cache fallbacks for exact candidate
  fill. `HHWX_LOW_MEMORY_SCORE_CALC_CACHE_PRESSURE_FALLBACK=1` disables the
  lower-level score calculation cache only when exact-join slot card count
  reaches the configured threshold, and
  `HHWX_LOW_MEMORY_SCORE_ONLY_CACHE_PRESSURE_FALLBACK=1` similarly disables the
  score-only result cache. With both thresholds at `260`, `P02:260` triggered
  both fallbacks at max slot card count `265` and produced bounded
  `averageScore=9376984`, `maxScore=9412868`, `gap=382812`, `peak=3706 MiB`,
  and `memoryLimited=false`. The focused exact gate for `P08:260`, `P08:323`,
  and `P10:260` stayed exact and did not trigger the fallback. This is the
  first current-branch P02 opt-in slice close to the `20%` target, but it is
  still a fallback rather than the final low-memory architecture.
- 2026-06-17: Assessed the latest calc pruning explanation as a reasonable
  algorithm-shape hypothesis: its useful lesson is earlier item/signature/
  prefix/dominance pruning before full candidate birth plus raw numeric
  survivor records, not calc as an HHWX exact oracle. Implemented and measured
  three proof-neutral Stage 3 object-residency slices: shared score-only empty
  payloads, `HHWX_LOW_MEMORY_COMPACT_CANDIDATE_CARDS=1`, and
  `HHWX_LOW_MEMORY_COMPACT_SCORE_ONLY_CACHE=1`. Focused results preserved
  average/max scores and did not make proof status more optimistic, but
  `P02:260` stayed at `4491-4494 MiB`. The combined trace still held
  `404867` generated candidates, `797434` score-only cache entries,
  `327009` active slot-0 heap nodes, and `336336` slot-0 complement-cache
  entries. Next work should reduce candidate birth with HHWX proof certificates
  or move generator/frontier/complement state to raw-index storage.
- 2026-06-17: Implemented and measured the first generator heap-node
  compaction slice. Slot candidate nodes now retain selected card indices
  instead of `SearchCard` references, and the focused gate preserved result
  semantics: `P01:none` exact, `P08:260` exact, `P08:323` exact, `P10:260`
  exact, and `P02:260` bounded with the same average/max score and gap. The
  P02 peak stayed at `4493 MiB`, with slot 0 still holding about `304k` heap
  nodes and `298k` global-complement entries, so this is not the primary memory
  lever. Continue toward primary raw candidate storage and raw-index
  pair/frontier helpers.
- 2026-06-17: Read the calc research index plus the deep-pruning,
  memory-mechanism, and HHWX diagnostics reports. Confirmed that the current
  roadmap already follows the right ordering: no-op algorithm diagnostics and
  proof-design track run in parallel with memory residency work, but
  proof-changing signature/prefix/dominance pruning must wait for HHWX-native
  ledger certificates. Added the latest bounded score-cache and
  skill-window-only cache experiments. Both preserved average/max score but
  failed to reduce `P02:260` peak memory (`4493-4507 MiB`), so Stage 3 should
  continue with primary raw candidate storage rather than another cache-only
  cap.
- 2026-06-16: Added score-cache attribution and
  `disableExactCandidateScoreCalculationCache` /
  `HHWX_LOW_MEMORY_DISABLE_SCORE_CALC_CACHE=1`. P02:260 baseline with the new
  attribution showed `1211066` active-chart skill-window contribution cache
  entries and `119468` active-chart base-score entries before hitting
  memory-limited bounded. Disabling only the lower-level score calculation
  cache preserved P02 average/max score, reduced peak from about `4495 MiB` to
  `3864 MiB`, and avoided memory-limited abort, but it regressed P08:260 and
  P08:323 from exact to bounded under the same 300s budget. This is a useful
  hard-case fallback and points to bounded/LRU score-cache residency, not a
  global default.
- 2026-06-16: Implemented the first Stage 3 candidate-fill residency slice:
  `disableExactCandidateScoreOnlyCache` /
  `HHWX_LOW_MEMORY_DISABLE_SCORE_ONLY_CACHE=1`. P01 remained exact with the same
  average/max score and lower peak (`1246 MiB`), but P02:260 stayed
  bounded/memory-limited with the same score/gap and nearly the same peak
  (`4489 MiB` vs `4495 MiB`) while taking longer. Keep the switch for
  attribution, but continue toward primary raw candidate storage and compact
  generator/frontier/global-cache state.
- 2026-06-16: Implemented Stage 2.5 raw solver-input census diagnostics. Added
  `debugExactCandidateRawSolverInputCensus` and
  `HHWX_LOW_MEMORY_RAW_SOLVER_INPUT_CENSUS=1`; focused artifacts preserved
  proof status and average/max score fields. The census estimated final-join raw
  input at about `25.81 MiB` for `P02:260` and `33.47 MiB` for `P08:323`, so
  the next primary lever is Stage 3 typed-array raw candidate storage and lazy
  hydration. Pre-materialization signature/prefix upper remains a parallel
  proof-design track.
- 2026-06-16: Implemented Stage 2.5 materialized dominance replay diagnostics.
  Added `debugExactCandidateDominanceReplay` and
  `HHWX_LOW_MEMORY_DOMINANCE_REPLAY=1`; focused artifacts preserved proof status
  and average/max score fields. Level 1 exact materialized conflict-footprint
  checks found dominated candidates on smaller checked snapshots (`P01:none`
  and `P08:260`) but skipped `P02:260`, `P08:323`, and `P10:260` under the
  candidate-total cap, so the next target is raw solver-input census or
  pre-materialization signature upper design.
- 2026-06-16: Implemented Stage 2.5 materialized upper replay diagnostics.
  Added `debugExactCandidateUpperReplay` and `HHWX_LOW_MEMORY_UPPER_REPLAY=1`;
  focused artifacts for `P02:260`, `P08:260`, `P08:323`, and `P10:260`
  preserved proof status and average/max score fields with `violationCountTotal=0`.
  The replay did not find direct materialized skip candidates for the hardest
  pressure rows, so the next diagnostic target is Level 0/1 dominance replay
  and then a pre-materialization signature upper.
- 2026-06-16: Implemented the first Stage 2.5 no-op signature census diagnostic.
  Added `debugExactCandidateSignatureCensus` and
  `HHWX_LOW_MEMORY_SIGNATURE_CENSUS=1`; snapshots now include bounded
  coarse band/attribute/skill-context signature buckets. Focused artifacts for
  `P02:260`, `P08:260`, `P08:323`, and `P10:260` preserved exact/bounded
  semantics and average/max score fields. The next diagnostic target is upper
  replay, followed by Level 0/1 dominance replay.
- 2026-06-16: Read the updated calc research index and promoted its strongest
  actionable findings into Stage 2.5 diagnostics: signature census, upper
  replay, Level 0/1 dominance replay, and raw solver-input census. Updated the
  active goal and immediate next actions so no-op algorithm diagnostics run
  before proof-changing pruning or a broad primary-storage rewrite.
- 2026-06-16: Added Stage 2 passive raw candidate mirror and raw-index
  final-join parity instrumentation. Focused raw mirror cases all reported
  `mismatchCountTotal=0`, and P01 raw-index parity matched the object join
  score. A compact score-only result object attempt caused P02:260 Node heap
  OOM and was removed; P02:260 recovered to bounded/memory-limited with the
  original score and gap.
- 2026-06-16: Implemented the first Stage 1 key/cache compaction pass and
  recorded focused `P02:260` traces. Semantics were preserved, but peak memory
  only fell from `4495 MiB` to `4491 MiB`, so the next target is raw candidate
  and generator-node compaction.
- 2026-06-16: Added long-term goal, staged implementation path, and quantified
  acceptance criteria from measurement harness through full 40-case gate.
- 2026-06-16: Added `HHWX_LOW_MEMORY_TRACE=1` runner support and recorded the
  first `P02:260` memory attribution. Chose candidate-fill working set
  compaction as the next implementation target.
- 2026-06-16: Created roadmap for exact-preserving low-memory work, separating
  calc research from HHWX proof-safe implementation.

## 2026-06-17 Current Gate Boundary

This entry freezes the current practical merge boundary before the next phase
switches to proof-backed early pruning.

Current naked-default check:

| Artifact | Scope | Exact | Bounded | Failed | Timed Out | Memory Limited | Gap | Peak | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `medley-40-exact-isolated-2026-06-17T09-24-37-132Z-partial.json` | stopped after first 4 rows | `2` | `2` | `0` | `2` | `2` | `685987` | `6777 MiB` | Not PR-ready as a naked default: `P01:244` and `P01:323` both bounded at `initial-candidate` with timeout and memory-limit flags. |

Current PR-candidate full gate:

| Artifact | Scope | Exact | Bounded | Failed | Timed Out | Memory Limited | Gap | Peak | Median | P95 | Max | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `low-memory-polish-hhwx-2026-06-17T09-29-27-703Z.json` | full 40-case, 8GB heap, 300000ms per row | `38` | `2` | `0` | `0` | `0` | `582812` | `3587 MiB` | `65342 ms` | `204613 ms` | `274599 ms` | Uses compact score-only cache, thin result retention, compact candidate key set, prefix hard-upper pruning, low-memory seeding pressure skip, and both pressure cache fallbacks. All rows preserve average and max score fields. |
| `medley-40-exact-isolated-2026-06-17T09-29-27-759Z.json` | isolated per-row backing artifact for the same run | `38` | `2` | `0` | `0` | `0` | `582812` | `3587 MiB` | `65342 ms` | `204613 ms` | `274599 ms` | Same summary as the wrapper report. |

Bounded rows in the PR-candidate gate:

| Case | Average | Max | Gap | Peak | Abort reason |
| --- | ---: | ---: | ---: | ---: | --- |
| `P02:260` | `9376984` | `9412868` | `382812` | `2974 MiB` | `candidate-fill-soft-limit` |
| `P10:244` | `8729634` | `8819861` | `200000` | `2320 MiB` | `solve-dominated-same-coarse-frontier` |

Targeted exact-safety A/B:

| Artifact | Scope | Exact | Bounded | Failed | Timed Out | Memory Limited | Gap | Peak | Notes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `low-memory-polish-hhwx-2026-06-17T10-36-12-622Z.json` | `P01:244`, `P01:323`, `P02:260`, `P08:323`, `P10:244`, `P10:260`; same pressure/compact config but no prefix hard-upper pruning and no low-memory initial-candidate sync | `4` | `2` | `0` | `0` | `0` | `582812` | `3027 MiB` | Exact/bounded, `isExhaustive`, average score, max score, bounded gap, and abort reasons all match the PR-candidate full gate for these six rows. Risk flags absent from the artifact: `enableLowMemoryInitialCandidateSync`, `lowMemoryInitialCandidateSync`, `enableExactCandidatePrefixHardUpperPruning`, `debugExactCandidatePrefixHardUpperReplay`, raw final-join solve/release, and raw mirror result return. |

Boundary decision:

- The current storage/pressure slice is a valid consolidation candidate only
  with its explicit low-memory configuration. It should not be described as a
  clean naked-default improvement.
- The latest prefix replay summary research is intentionally kept outside this
  boundary in stash `wip-prefix-replay-summary-research`.
- Raw final-join release remains an opt-in boundary probe, not a mainline
  memory win, until raw solver takeover is complete.
- The next phase should stop spending primary effort on additional
  threshold-triggered behavior. The main implementation target should be
  proof-backed pre-materialization pruning, with lightweight streaming prefix
  and signature counters first, because `P02:260` is still bounded at candidate
  birth rather than final join.
