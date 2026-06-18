# HHWX Medley Low-Memory Roadmap

Last updated: 2026-06-18

This roadmap tracks the medley team-builder low-memory work after PR #43. It is intentionally compact: detailed run artifacts stay under ignored `temp/`, while this file records the current decision state, retained evidence, and next acceptance gates.

## North Star

Reduce medley optimizer memory usage while preserving HHWX exactness semantics.

Non-negotiable behavior:

- HHWX primary objective remains average score.
- `maxScore` remains a diagnostic/comparison field, not the primary objective.
- `isExhaustive`, `timedOut`, `memoryLimited`, `observedScoreUpperBound`, `observedScoreUpperBoundGap`, and bounded reasons must stay truthful.
- Exact rows require a closed HHWX proof. Calc-like caps, random buckets, or unproved threshold skips cannot report exact.

## Current State

PR #43 merged the first safe consolidation:

- compact exact candidate key storage;
- fixed candidate card id fields and exact candidate card stripping;
- compact global complement cache;
- compact score-only exact candidate storage;
- pressure fallback and automatic seeding pressure skip controls.

PR #43 intentionally did not merge:

- prefix hard-upper pruning / replay experiments;
- raw final-join solve or release paths;
- generated-pool oracle/export experiments.

Current working branch:

- `dev/low-memory-early-pruning`
- base: `origin/main` at `8dbd6c7d`
- old research branch kept: `dev/low-memory-polish`
- WIP stash kept unapplied: `stash@{0}: On dev/low-memory-polish: wip-prefix-replay-summary-research`

Early-pruning diagnostic slice started on `dev/low-memory-early-pruning`:

- added an opt-in slot-prefix upper replay summary;
- default hot path is kept on a separate non-instrumented `expandNode` function;
- prefix diagnostics are no-op: they do not skip candidates, change cutoffs, or alter proof status;
- `HHWX_LOW_MEMORY_PREFIX_HARD_UPPER_REPLAY` remains research-only and is not part of the accepted smoke gate.

## Retained Artifacts

Temp cleanup status is documented in:

- `temp/bandori-team-builder/low-memory-polish/RETENTION_MANIFEST_2026-06-17.md`

Always retain:

- `temp/bandori-team-builder/hard-case-profiles-2026-06-02.json`
- `temp/bandori-team-builder/benchmark-real-profiles-medley.cjs`
- `temp/bandori-team-builder/run-medley-40case-isolated.cjs`
- `temp/bandori-team-builder/low-memory-polish/calc-research-2026-06-16/`

Baseline and gate artifacts retained:

| Artifact | Purpose | Result |
| --- | --- | --- |
| `low-memory-polish-hhwx-finalized-2026-06-16T06-03-03-210Z.json` | original 30/40 baseline alias | `30 exact / 9 bounded / 1 failed`, bounded gap `2692264` |
| `low-memory-polish-hhwx-2026-06-16T23-04-55-868Z.json` | first complete 38/40 full gate | `38 exact / 2 bounded / 0 failed / 0 timedOut / 0 memoryLimited`, gap `582812`, peak `4015 MiB` |
| `low-memory-polish-hhwx-2026-06-17T00-30-30-967Z.json` | later 38/40 full gate after storage work | `38 exact / 2 bounded`, gap `582812`, peak `3929 MiB` |
| `low-memory-polish-hhwx-2026-06-17T09-29-27-703Z.json` | research PR-candidate full gate with prefix hard-upper pruning enabled | `38 exact / 2 bounded`, gap `582812`, peak `3587 MiB`; research evidence only |
| `low-memory-polish-hhwx-2026-06-17T10-36-12-622Z.json` | six-row A/B without prefix hard-upper pruning | `4 exact / 2 bounded`, gap `582812`, peak `3027 MiB` |
| `low-memory-polish-hhwx-2026-06-17T11-02-24-155Z.json` | clean PR #43 branch validation | `4 exact / 2 bounded`, gap `582812`, peak `2943 MiB` |
| `low-memory-polish-hhwx-2026-06-17T12-23-45-243Z.json` | two-row pressure + prefix replay smoke | `P01:244 exact`, `P02:260 bounded`, gap `382812`, peak `2979 MiB`; prefix summaries present |
| `low-memory-polish-hhwx-2026-06-17T12-30-37-247Z.json` | six-row pressure + prefix replay gate | `4 exact / 2 bounded`, gap `582812`, peak `3308 MiB`; scores, max scores, candidate counts, and proof states match the clean PR #43 gate |
| `low-memory-polish-hhwx-2026-06-17T15-03-45-774Z.json` | two-row pressure + prefix margin replay smoke | `P01:244 exact`, `P02:260 bounded`, gap `382812`, peak `3024 MiB`; average/max scores and candidate counts match `2026-06-17T12-23-45` |
| `low-memory-polish-hhwx-2026-06-17T15-15-51-889Z.json` | six-row pressure + leaf proof ledger gate | `4 exact / 2 bounded`, gap `582812`, peak `3023 MiB`; scores, max scores, candidate counts, abort reasons, and proof states match `2026-06-17T12-30-37` |
| `low-memory-polish-hhwx-2026-06-17T15-43-27-095Z.json` | `P02:260` other-slot upper source replay | bounded gap `382812`, peak `3024 MiB`; source replay shows capacity upper can tighten the pair-unseen bound on near-cutoff leaves with `0` replay violations |
| `low-memory-polish-hhwx-2026-06-17T16-19-09-536Z.json` | stable `P02:260` other-slot upper source replay after discarding direct pruning attempt | bounded gap `382812`, peak `2991 MiB`; source replay unchanged and no OOM |
| `low-memory-polish-hhwx-2026-06-17T16-25-37-898Z.json` | `P02:260` narrow capacity-source leaf pruning, default budget `2048` | bounded gap `382812`, peak `2989 MiB`; pruned `1994`, materialized `970635` (`1832` fewer than source baseline), `0` replay violations |
| `low-memory-polish-hhwx-2026-06-17T16-32-01-295Z.json` | `P02:260` narrow capacity-source leaf pruning, budget `32768` | bounded gap `382812`, peak `3045 MiB`; pruned `16217`, materialized `958142`, `0` replay violations |
| `low-memory-polish-hhwx-2026-06-17T16-35-26-587Z.json` | `P02:260` narrow capacity-source leaf pruning, budget `131072` | bounded gap `382812`, peak `3014 MiB`; pruned `43894`, materialized `935844`, `0` replay violations, elapsed `282848ms` |
| `low-memory-polish-hhwx-2026-06-17T16-56-28-800Z.json` | `P02:260` level-4 capacity batch replay, budget `2048`, margin `500000` | bounded gap `382812`, score `9376984`, max `9412868`, peak `3078 MiB`; `15449` level-4 checks, `2048` eligible, `286` would-skip prefixes representing `58464` leaf completions, `0` replay violations |
| `low-memory-polish-hhwx-2026-06-17T17-03-25-049Z.json` | `P02:260` full level-4 capacity batch replay, budget `20000`, margin `500000` | bounded gap `382812`, score `9376984`, max `9412868`, peak `3067 MiB`; all `15449` level-4 prefixes eligible, `613` would-skip prefixes representing `128698` leaf completions (`13.2%` of materialized candidate count), `0` replay violations |
| `low-memory-polish-hhwx-2026-06-17T18-07-57-270Z.json` | `P02:260` level-3 capacity replay, budget `2048`, margin `500000` | bounded gap `382812`, score `9376984`, max `9412868`, peak `2593 MiB`; all `1047` level-3 prefixes eligible, `0` would-skip prefixes, `0` replay violations |
| `low-memory-polish-hhwx-2026-06-17T18-16-52-533Z.json` | `P02:260` tight level-3 lookahead replay attempt | failed with exit `134` / JS heap OOM after `175591ms`; do not run tight child capacity proof inside level-3 lookahead |
| `low-memory-polish-hhwx-2026-06-17T18-23-39-797Z.json` | `P02:260` tight level-3 lookahead replay after moving hook to prefix birth | failed with exit `134` / JS heap OOM after `152200ms`; confirms the lookahead must be basic-capacity-only and globally child-budgeted |
| `low-memory-polish-hhwx-2026-06-17T18-26-44-147Z.json` | `P02:260` basic level-3 lookahead replay, child budget `2048`, margin `500000` | bounded gap `382812`, score `9376984`, max `9412868`, peak `2609 MiB`; `0` would-skip prefixes |
| `low-memory-polish-hhwx-2026-06-17T18-29-14-907Z.json` | `P02:260` basic level-3 lookahead replay, child budget `8192`, margin `500000` | bounded gap `382812`, score `9376984`, max `9412868`, peak `2960 MiB`; `8` would-skip prefixes representing `196970` relaxed completions |
| `low-memory-polish-hhwx-2026-06-17T18-31-41-943Z.json` | `P02:260` basic level-3 lookahead replay, child budget `16384`, margin `500000` | bounded gap `382812`, score `9376984`, max `9412868`, peak `2985 MiB`; `54` would-skip prefixes representing `1035490` relaxed completions |
| `low-memory-polish-hhwx-2026-06-17T18-38-51-150Z.json` | `P02:260` basic level-3 lookahead replay with capped proof samples, child budget `8192`, margin `500000` | bounded gap `382812`, score `9376984`, max `9412868`, peak `2980 MiB`; `8` would-skip prefixes representing `196970` relaxed completions, `8` capped proof samples |
| `low-memory-polish-hhwx-2026-06-17T18-44-11-394Z.json` | `P02:260` basic level-3 lookahead replay with child-decision violation accounting, child budget `8192`, margin `500000` | bounded gap `382812`, score `9376984`, max `9412868`, peak `2960 MiB`; `1662` child decisions, `0` replay violations |
| `low-memory-polish-hhwx-2026-06-17T18-46-51-730Z.json` | `P02:260` basic level-3 lookahead replay with child-decision violation accounting, child budget `16384`, margin `500000` | bounded gap `382812`, score `9376984`, max `9412868`, peak `3005 MiB`; `54` would-skip prefixes, `9997` child decisions, `0` replay violations |
| `low-memory-polish-hhwx-2026-06-17T18-52-28-541Z.json` | `P02:260` opt-in level-3 lookahead branch pruning, child budget `8192`, margin `500000` | bounded gap `382812`, score `9376984`, max `9412868`, peak `2933 MiB`; pruned `8` prefixes, but candidate counts and materialized count stayed unchanged |
| `low-memory-polish-hhwx-2026-06-17T18-55-16-495Z.json` | `P02:260` opt-in level-3 lookahead branch pruning, child budget `16384`, margin `500000` | bounded gap `382812`, score `9376984`, max `9412868`, peak `2924 MiB`; pruned `54` prefixes, but generated/materialized/popped counts stayed unchanged |
| `low-memory-polish-hhwx-2026-06-17T18-59-48-207Z.json` | `P02:260` anchor-frontier precheck skip-reason smoke | bounded gap `382812`, score `9376984`, max `9412868`, peak `2922 MiB`; first blocker was `card-count` |
| `low-memory-polish-hhwx-2026-06-17T19-03-07-417Z.json` | `P02:260` combined anchor-frontier precheck skip-reason smoke | bounded gap `382812`, score `9376984`, max `9412868`, peak `2912 MiB`; combined blocker `card-count+other-slot-count+other-slot-total` with abort frontier gap only `17139` |
| `low-memory-polish-hhwx-2026-06-17T19-11-42-977Z.json` | `P02:260` anchor-frontier precheck numeric diagnostic smoke | bounded gap `382812`, score `9376984`, max `9412868`, peak `2913 MiB`; precheck records card count `1747/1600`, other-slot counts `[212825, 134977]` vs per-slot guard `80000`, total `347802/120000`, frontier gap `17139/25000`, remaining `159676/90000ms` |
| `low-memory-polish-hhwx-2026-06-17T19-16-21-494Z.json` | `P02:260` opt-in no-op anchor cheap-upper probe despite precheck blockers | bounded gap `382812`, score `9376984`, max `9412868`, peak `2953 MiB`; cheap upper ran over other-slot pools `[212825, 134977]`, processed `2906` anchors, timeboxed at `8003ms`, residual gap `205488` |
| `low-memory-polish-hhwx-2026-06-17T19-21-11-794Z.json` | `P02:260` raw solver input census with heavy memory attribution still enabled | failed with exit `134` / JS heap OOM after `181616ms`; raw census must stay decoupled from memory attribution |
| `low-memory-polish-hhwx-2026-06-17T19-29-52-358Z.json` | `P02:260` lightweight raw solver input census | bounded gap `382812`, score `9376984`, max `9412868`, peak `2962 MiB`; `747802` candidates estimate to `28.53 MiB` raw rows, `48.01 MiB` final join input, `52.27 MiB` all-slot conflict index |

Use the pressure validation environment for early-pruning gates:

- `HHWX_LOW_MEMORY_AUTO_SEEDING_PRESSURE_SKIP=1`
- `HHWX_LOW_MEMORY_SCORE_CALC_CACHE_PRESSURE_FALLBACK=1`
- `HHWX_LOW_MEMORY_INITIAL_SCORE_CALC_CACHE_PRESSURE_FALLBACK=1`
- `HHWX_LOW_MEMORY_SCORE_ONLY_CACHE_PRESSURE_FALLBACK=1`

Bare default one-off runs are not comparable to the retained PR #43 gates; they can enter a memory-limited path on `P01:244` and OOM on `P02:260`.

Six-row prefix replay aggregate from `2026-06-17T12-30-37`:

- level 4 checked `5,038,851` prefixes and represented `526,159,658` relaxed completions;
- leaf level checked `41,455,905` prefixes and materialized `5,649,468` candidates;
- slot-local upper replay alone preserves proof state but raises diagnostic peak memory, especially `P08:323` (`1921 -> 3308 MiB`);
- next pruning work should target proof-backed level-4 or leaf-birth skips, not broad threshold fallbacks.

P02 pressure + hard replay sample:

- artifact: `low-memory-polish-hhwx-2026-06-17T12-44-57-512Z.json`;
- result stayed bounded with gap `382812`, peak `3024 MiB`;
- current hard replay checked `582,084` prefixes but found only `11` skipable leaf prefixes and `0` skipable level-4 prefixes;
- conclusion: simply converting the existing pair/global hard replay into pruning is not a breakthrough path for `P02:260`.

Two-row prefix margin replay sample:

- artifact: `low-memory-polish-hhwx-2026-06-17T15-03-45-774Z.json`;
- compared with `low-memory-polish-hhwx-2026-06-17T12-23-45-243Z.json`, `P01:244` and `P02:260` kept exact/bounded state, gap, average score, max score, candidate counts, and materialized candidate counts;
- `P02:260` remained bounded at `candidate-fill-soft-limit`, with candidate counts `[400000, 212825, 134977]` and `972467` materialized candidates;
- local slot margin buckets show surviving `P02:260` level-4 and leaf prefixes are still above the local cutoff; local cutoff alone cannot produce proof-backed candidate-birth pruning;
- implementation rule: keep margin bucket arrays only in aggregate summary levels. Serializing them inside every `latestGenerators` entry can turn a constant-size diagnostic into a large per-generator report and OOM hard rows.

Six-row leaf proof ledger sample:

- artifact: `low-memory-polish-hhwx-2026-06-17T15-15-51-889Z.json`;
- the ledger records existing cross-slot leaf skips without changing behavior: `prefixUpper`, `otherSlotUpper`, `totalUpper`, `incumbent`, `margin`, `slot/level`, and `impliedCompletionCount` are present in capped skip samples;
- focused proof state stayed stable: `4 exact / 2 bounded`, gap `582812`, `0 failed / 0 timedOut / 0 memoryLimited`;
- across the six focused rows, the ledger checked `5,164,007` finite leaf proofs and observed `1,098,070` existing proof-backed leaf skips (`21.3%` of checked leaves);
- `P02:260` is the important exception: `566,635` leaf proofs checked, only `11` skips, all with tiny negative margins (`min -0.85`), so current leaf proof cannot deliver the `25%` P02 candidate-birth target;
- next algorithmic work should diagnose and tighten the `otherSlotUpper` source for `P02:260` instead of simply promoting the existing leaf skip to an opt-in pruning feature.

P02 other-slot upper source replay:

- artifacts: `low-memory-polish-hhwx-2026-06-17T15-43-27-095Z.json` and stable rerun `low-memory-polish-hhwx-2026-06-17T16-19-09-536Z.json`;
- source replay is opt-in via `HHWX_LOW_MEMORY_PREFIX_OTHER_UPPER_SOURCE_REPLAY=1` and remains no-op;
- `P02:260` result stayed bounded with gap `382812`, score `9376984`, max score `9412868`, candidate counts `[400000, 212825, 134977]`, and materialized candidates `972467`;
- near-cutoff replay checked `566,635` leaves, sampled `2048` eligible leaves within margin `10000`, and all `2048` used current `pairUnseenUpper` as the effective other-slot upper;
- generated-pair-only would skip all `2048`, but that is not a safe proof while unseen pair frontier remains;
- HHWX capacity upper improved `2029 / 2048` eligible samples and would make `1994 / 2048` safely skipable;
- replay violation count was `0`, so capacity-based leaf pruning is now a plausible opt-in next slice;
- a direct opt-in attempt that simply enabled capacity complement in the leaf hot path was not retained: `P02:260` OOMed even with very small per-fill budgets, because enabling the capacity path changed generated-pair/cache behavior too broadly;
- a narrow opt-in gate using only the stable source replay decision is retained as `HHWX_LOW_MEMORY_CAPACITY_SOURCE_LEAF_PRUNING=1`;
- the narrow gate is proof-safe in the sampled runs (`0` replay violations, score and gap unchanged), but leaf-by-leaf budget scaling is not enough for the `25%` target: `131072` checks reduce materialized candidates by only `36623` (`3.77%`) and already take `282848ms`;
- next breakthrough target should be level-4 or batched capacity proof, not further increasing per-leaf budget.

P02 level-4 capacity batch replay:

- artifacts: `low-memory-polish-hhwx-2026-06-17T16-56-28-800Z.json`, `low-memory-polish-hhwx-2026-06-17T17-00-25-212Z.json`, and full replay `low-memory-polish-hhwx-2026-06-17T17-03-25-049Z.json`;
- replay is opt-in via `HHWX_LOW_MEMORY_PREFIX_CAPACITY_BATCH_REPLAY=1` and remains no-op;
- result stayed bounded with gap `382812`, score `9376984`, max score `9412868`, candidate counts `[400000, 212825, 134977]`, and `972467` materialized candidates;
- with budget `2048` and margin `500000`, replay checked `15449` level-4 prefixes, sampled `2048`, improved the other-slot upper on `1291`, and found `286` would-skip prefixes representing `58464` relaxed leaf completions;
- with budget `8192`, replay found `510` would-skip prefixes representing `106392` relaxed leaf completions, still with `0` violations;
- with budget `20000`, replay covered all `15449` level-4 prefixes and found `613` would-skip prefixes representing `128698` relaxed leaf completions, about `13.2%` of the current `972467` materialized candidate count;
- replay violation count was `0`, so the proof shape is plausible;
- a wider budget/margin probe (`32768` / `500000`) OOMed at the Node heap limit after about `240s`; do not broaden this replay naively;
- opt-in real level-4 branch pruning is now available behind `HHWX_LOW_MEMORY_PREFIX_CAPACITY_BATCH_PRUNING=1`. Small smoke `low-memory-polish-hhwx-2026-06-18T01-39-47-189Z.json` kept `P01:none` exact with average `7927236`, max `7982835`, pruned `1478` level-4 prefixes representing `309099` relaxed completions, and `0` replay violations. The first `P02:260` pruning smoke `low-memory-polish-hhwx-2026-06-18T01-41-09-087Z.json` still OOMed at the Node heap limit, matching the current hard-row runner instability; this flag is not accepted for P02 or focused gates yet;
- pruning proof ledger coverage was tightened in `low-memory-polish-hhwx-2026-06-18T01-52-24-676Z.json`: the same `P01:none` opt-in smoke stayed exact with average `7927236`, max `7982835`, `prunedProofLedgerCount = prunedCount = 1478`, `prunedProofLedgerImpliedCompletionCount = 309099`, retained `8` proof samples, recorded dropped sample count `1470`, and still had `0` replay violations. This improves auditability but does not change the P02 acceptance status;
- the P02 OOM was isolated to tight capacity proof inside the hot pruning path, not to the default search: control `low-memory-polish-hhwx-2026-06-18T01-55-08-576Z.json` stayed bounded with gap `382812`, average `9376984`, max `9412868`, and peak `2937 MiB`. The benchmark wrapper now lets `HHWX_LOW_MEMORY_PREFIX_CAPACITY_BATCH_PRUNING=1` honor `HHWX_LOW_MEMORY_PREFIX_OTHER_UPPER_SOURCE_MAX_CHECKS/MAX_MARGIN`, and real pruning now uses the cheaper optimistic basic-capacity upper while full tight comparison remains available for no-op replay;
- with basic-only real pruning, P02 no longer OOMs: `low-memory-polish-hhwx-2026-06-18T02-13-37-998Z.json` (`256/500000`) pruned `55` prefixes, materialized `971323`, gap `382812`, peak `2924 MiB`; `low-memory-polish-hhwx-2026-06-18T02-16-24-869Z.json` (`512/500000`) pruned `99`, materialized `971207`, peak `2926 MiB`; `low-memory-polish-hhwx-2026-06-18T02-18-50-835Z.json` (`2048/500000`) pruned `286`, materialized `966224`, peak `2999 MiB`; default `2048/10000` in `low-memory-polish-hhwx-2026-06-18T02-21-20-178Z.json` pruned `204` but still materialized `972467` because candidate fill backfilled to the same cap. All retained average/max/gap and had `0` replay violations;
- focused pressure gate `low-memory-polish-hhwx-2026-06-18T02-25-30-236Z.json` ran `P01:244,P01:323,P02:260,P08:323,P10:244,P10:260` with `HHWX_LOW_MEMORY_PREFIX_CAPACITY_BATCH_PRUNING=1` and the four pressure flags. It matched the clean focused baseline on proof shape and score fields: `4 exact / 2 bounded`, gap `582812`, `0 failed / 0 timedOut / 0 memoryLimited`, all six rows retained average and max score, and per-row exact/score/average/max/abort status matched `low-memory-polish-hhwx-2026-06-17T12-30-37-247Z.json`. Peak was `2995 MiB` versus baseline `3308 MiB`; total generated candidates fell on P01/P08/P10 rows while P02 still filled the same `[400000, 212825, 134977]` caps;
- current conclusion: level-4 capacity proof has stronger leverage than leaf-by-leaf pruning, but alone does not meet the `25%` P02 target; next work should either move the proof to level-3, improve the slot/prefix upper source, or combine level-4 proof with raw storage before any real pruning gate.

P02 level-3 capacity replay:

- artifact: `low-memory-polish-hhwx-2026-06-17T18-07-57-270Z.json`;
- replay is opt-in via `HHWX_LOW_MEMORY_PREFIX_CAPACITY_LEVEL3_REPLAY=1` and remains no-op;
- result stayed bounded with gap `382812`, score `9376984`, max score `9412868`, candidate counts `[400000, 212825, 134977]`, and `972467` materialized candidates;
- replay checked all `1047` eligible level-3 prefixes under margin `500000`, improved the other-slot upper on only `2`, and found `0` would-skip prefixes;
- best safe margin stayed positive (`min 510.668`), so current HHWX slot prefix upper is too loose at level 3 to prove any branch skip;
- current conclusion: moving the same capacity proof from level 4 to level 3 does not create a breakthrough. The next pruning line should tighten slot/prefix upper sources or combine the existing level-4 proof with storage changes, not keep moving the same loose proof earlier.

P02 basic level-3 lookahead replay:

- artifacts: failed tight attempts `low-memory-polish-hhwx-2026-06-17T18-16-52-533Z.json` and `low-memory-polish-hhwx-2026-06-17T18-23-39-797Z.json`; stable basic-only runs `low-memory-polish-hhwx-2026-06-17T18-26-44-147Z.json`, `low-memory-polish-hhwx-2026-06-17T18-29-14-907Z.json`, and `low-memory-polish-hhwx-2026-06-17T18-31-41-943Z.json`;
- replay is opt-in via `HHWX_LOW_MEMORY_PREFIX_CAPACITY_LEVEL3_LOOKAHEAD_REPLAY=1` and remains no-op;
- the tight child proof that calls the heavier capacity upper inside the level-3 child loop OOMed twice at the 8 GiB heap limit, so it is not a viable hot-path design;
- the retained diagnostic uses only the basic capacity assignment upper for each 4-card child prefix and spends `HHWX_LOW_MEMORY_PREFIX_OTHER_UPPER_SOURCE_MAX_CHECKS` as a global child-prefix budget;
- result fields stayed stable on every basic replay run: `P02:260` remained bounded with gap `382812`, score `9376984`, max score `9412868`, candidate counts `[400000, 212825, 134977]`, and `972467` materialized candidates;
- with child budget `8192`, replay found `8` would-skip level-3 prefixes representing `196970` relaxed completions;
- with child budget `16384`, replay found `54` would-skip level-3 prefixes representing `1035490` relaxed completions and a best margin of `-214757.669`;
- this crosses the near-term `25%` implied-completion target as a diagnostic signal, but it is not yet real candidate reduction because overlap and branch-local accounting are still relaxed;
- capped proof samples are now recorded in `level3LookaheadSamples`; the `2026-06-17T18-38-51` smoke kept result fields unchanged and recorded `8` samples containing level-3 card ids, max-child card ids, `pairUnseenUpper`, `maxChildBasicCapacityUpper`, `maxChildOtherUpperSource`, `maxChildTotalUpper`, `incumbent`, and `margin`;
- branch-decision replay/violation accounting is now in place: the `8192` child-budget smoke registered `1662` child decisions with `0` violations, and the `16384` child-budget smoke registered `9997` child decisions with `0` violations;
- opt-in real branch pruning is proof-safe in the retained P02 smokes, but not impactful enough: the `16384` run pruned `54` level-3 prefixes representing `1035490` relaxed completions, yet `candidateCounts`, `generated`, `materialized`, and `popped` counts stayed unchanged because the fill still reaches the same candidate cap from other branches;
- current conclusion: this exact-safe lookahead is a useful proof building block, but it does not meet the `25%` materialized candidate target. Do not spend the next slice merely increasing its budget; the next breakthrough needs to affect candidate admission/frontier closure or pair with raw-index storage.

P02 candidate-fill frontier closure:

- artifacts: `low-memory-polish-hhwx-2026-06-17T18-59-48-207Z.json` and `low-memory-polish-hhwx-2026-06-17T19-03-07-417Z.json`;
- anchor-frontier proof did not trigger before the `candidate-fill-soft-limit` abort;
- after combined precheck diagnostics, the blocker is `card-count+other-slot-count+other-slot-total`;
- the actual abort frontier gap is small: `peekUpperBound 2712797 + otherUpper 6681326 - incumbent 9376984 = 17139`, which is below the existing `25000` frontier-gap threshold;
- numeric precheck fields now confirm the guard sizes directly in retained artifacts: card count `1747/1600`, anchor candidates `400000/600000`, other-slot counts `[212825, 134977]` vs per-slot guard `80000`, other-slot total `347802/120000`, frontier gap `17139/25000`, remaining time `159676/90000ms`;
- therefore the main blocker is not the frontier gap itself. It is that P02 exceeds the anchor proof card-count guard slightly and the other two slot candidate pools exceed the current proof implementation much more substantially;
- an opt-in no-op cheap-upper probe confirms that simply bypassing the precheck is not enough: it can run without OOM, but over `[212825, 134977]` other-slot pools it processed only `2906` anchors before the `8000ms` timebox and left residual gap `205488`;
- next retained direction: either reduce/compact the other-slot candidate resident set before anchor proof, or design a different anchor/frontier proof variant that works over raw-index candidates and large other-slot pools. Prefix lookahead alone cannot solve this because it does not reduce the filled candidate caps, and current cheap-upper scaling is too weak.
- opt-in raw anchor/frontier probe now has an explicit candidate budget via `HHWX_LOW_MEMORY_RAW_ANCHOR_FRONTIER_PROBE_MAX_CANDIDATES`, keeping the default guard-only behavior unchanged. With budget `800000`, P02 run `low-memory-polish-hhwx-2026-06-18T02-51-24-313Z.json` completed without OOM (`0 failed / 0 timedOut / 0 memoryLimited`, peak `2926 MiB`) and preserved score fields/gap (`9376984` average, `9412868` max, gap `382812`);
- that raw probe processed `2841` anchors in `349ms`, built `28.53 MiB` raw rows plus `10.97 MiB` containing-bit indexes, and finished by dominated tail rather than timebox. The raw split check on the worst generated-pair anchor tightened generated-pair upper from `6681914` to `6443328` in `33ms` / `345` states; the remaining worst-anchor gap became `24519`, now driven by `right-unseen` upper (`6499497`). This shifts the next proof problem from generated-pair overlap to closing/refining the unseen frontier of the remaining slot.
- follow-up `low-memory-polish-hhwx-2026-06-18T03-00-39-923Z.json` added split-adjusted residual and tail-closure diagnostics. The single-anchor split does not close the raw frontier because the split-adjusted residual is immediately dominated by the unprocessed anchor tail: `splitAdjustedResidualGap = 206299`, `splitAdjustedResidualSource = unprocessed-tail`. Under the current loose pair upper, no materialized anchor reaches the close threshold (`materializedLooseTailCloseIndex = null`, all `400000` anchor candidates remain above `2695658`), and even the generator tail still has gap `17139`. The next useful prototype should therefore process/refine the raw anchor frontier as a whole, or reduce the pair/unseen upper by at least `17139`; continuing to split only the current worst anchor is not enough.
- raw whole-frontier refinement probe `low-memory-polish-hhwx-2026-06-18T03-07-42-670Z.json` shows that naive per-anchor recursive split is also not the answer: it stayed result-safe (`0 failed / 0 timedOut / 0 memoryLimited`, average `9376984`, max `9412868`, gap `382812`) but used the full `8000ms` raw probe timebox after only `298` anchors, `284` split attempts, and `207` completed splits; residual was still dominated by unprocessed tail (`refinedResidualGap = 273239`, `refinedResidualSource = unprocessed-tail`). This rejects "split every anchor" as the next implementation path. The next viable raw frontier work should either use a global/top-pair frontier structure, reduce the right/left unseen peek directly, or move to raw-resident candidate generation so that extending/refining the tail is cheap.
- raw pair-frontier census `low-memory-polish-hhwx-2026-06-18T03-25-27-764Z.json` keeps P02 result fields stable (`bounded`, gap `382812`, average `9376984`, max `9412868`, `0 failed / 0 timedOut / 0 memoryLimited`) and adds a no-op `pairFrontierCensus` inside the raw anchor probe. The key finding is that score-only high-pair materialization is the wrong structure: above the current pair upper `6681326` there are `25442235` score-only pairs and the first `5000000` scanned pairs contain `0` disjoint pairs; above the generator-tail close threshold `6664187` there are `41280302` score-only pairs, but the first `5000000` contain only `25` disjoint pairs, first at rank `1506981`, with sample max disjoint score `6666769`. This means the useful frontier is sparse in conflict-aware disjoint-pair space but buried inside a huge overlapping score-only frontier. Next implementation should avoid ordinary high-pair record lists and instead prototype a conflict-aware disjoint-pair frontier / pricing proof over raw candidates, with fallback upper accounting for unscanned score-only pairs.
- raw conflict-split witness probe `low-memory-polish-hhwx-2026-06-18T03-43-11-483Z.json` keeps P02 result fields stable (`bounded`, gap `382812`, average `9376984`, max `9412868`, `0 failed / 0 timedOut / 0 memoryLimited`) but shows why pair-only tightening cannot close P02: the raw pair conflict split proves the generated pair upper is exactly `6681326` in `503` states / `38ms`, and the witness pair's `10` card ids overlap all `400000` materialized anchors whose score could still beat the incumbent with that pair (`nonOverlappingAnchorCount = 0`). A naive raw three-slot conflict split is not yet viable: it built a `12.64 MiB` anchor bitset, visited `33266` states, and hit the `8000ms` timebox without a generated-pool upper. Next work should specialize the three-slot proof around pair-witness/anchor-overlap structure, or move this into raw-resident candidate generation/pricing; a generic recursive three-slot split is too broad for P02.
- budgeted pair-witness mask-cover probe `low-memory-polish-hhwx-2026-06-18T03-58-13-662Z.json` keeps P02 stable (`bounded`, gap `382812`, average `9376984`, max `9412868`, `0 failed / 0 timedOut / 0 memoryLimited`) after an unbudgeted cover attempt OOMed at `low-memory-polish-hhwx-2026-06-18T03-48-14-791Z.json`. The budgeted probe confirms single witness-card groups are too weak (`safeGroupCount = 0`), while exact intersection masks are a real but partial proof shape: `622` masks exist; the top `32` masks all split within budget (`2072` total states, no timeout), `32` masks are safe, and they cover `1176 / 400000` relevant anchors. This is not enough to close P02, but it identifies the next exact-safe direction: a mask-lattice / grouped-anchor proof that works over many masks cheaply, ideally before or during candidate generation. Do not broaden generic three-slot recursion; specialize around witness masks and raw resident storage.
- multi-strategy mask-cover probe `low-memory-polish-hhwx-2026-06-18T04-10-58-439Z.json` strengthens that signal. P02 stays stable (`bounded`, gap `382812`, average `9376984`, max `9412868`, `0 failed / 0 timedOut / 0 memoryLimited`); max-score masks remain poor (`32` safe masks cover only `1176 / 400000` anchors), but count-sorted masks are strong: `128` evaluated masks, `123` safe, `51522` split states, `0` timeouts, covering `366719 / 400000` relevant anchors. The union of count-sorted and max-score masks covers `367434 / 400000` anchors with `153` safe masks. This is the first high-leverage proof shape in the raw frontier line: a real grouped-mask proof could plausibly cut most of the anchor tail, but it must be moved out of the diagnostic path and tied to raw-resident candidate generation/proof ledger before it can reduce materialization or exact gaps.

P02 raw storage census:

- artifacts: failed heavy run `low-memory-polish-hhwx-2026-06-17T19-21-11-794Z.json` and retained lightweight run `low-memory-polish-hhwx-2026-06-17T19-29-52-358Z.json`;
- the original raw solver census flag was coupled to heavy memory attribution and OOMed on P02; the benchmark wrapper now leaves raw census lightweight by default, and `HHWX_LOW_MEMORY_TRACE=1` can still be layered on explicitly when wanted;
- lightweight P02 census completed with unchanged result fields: bounded gap `382812`, score `9376984`, max score `9412868`;
- current rich candidate resident path holds `747802` candidates across slots `[400000, 212825, 134977]`;
- estimated typed-array footprint is much smaller than the observed multi-GiB process peak: raw rows `28.53 MiB`, final join input `48.01 MiB`, all-slot conflict index `52.27 MiB`;
- the first actual raw candidate pool profile is retained in `low-memory-polish-hhwx-2026-06-17T19-40-22-557Z.json`;
- with `HHWX_LOW_MEMORY_RAW_CANDIDATE_POOL_PROFILE=1`, P02 completed with unchanged result fields: bounded gap `382812`, score `9376984`, average score `9376984`, max score `9412868`;
- the profile materialized exact-sized typed arrays for the same `747802` candidates in `28.53 MiB` total, `40` bytes per candidate, with slot footprints `[15.26, 8.12, 5.15] MiB`;
- raw pool consistency checks passed: `mismatchCountTotal = 0`, `scoreOrderViolationCountTotal = 0`; build time was about `1980ms`;
- because this profile still duplicates the current rich object pool, its smoke peak was higher (`3768 MiB`) than the lightweight census; that is expected for an opt-in probe and is not a default memory win yet;
- the raw pool was then refactored into a reusable current-pool cache for sorted candidate reads; an intermediate run `low-memory-polish-hhwx-2026-06-17T19-45-28-861Z.json` OOMed because the cache was retained across working-set release, so the implementation now invalidates the raw pool immediately after profile emission and again when releasing exact-join working sets;
- the retained fixed run `low-memory-polish-hhwx-2026-06-17T19-49-24-127Z.json` completed P02 with unchanged result fields: bounded gap `382812`, score/average `9376984`, max score `9412868`, raw source `shared-current-pool`, `28.53 MiB`, `0` mismatch, `0` score-order violations, build time about `1413ms`, peak `3668 MiB`;
- the retained parity smoke `low-memory-polish-hhwx-2026-06-17T19-50-58-743Z.json` completed `P01:none` exact with raw parity reading from `shared-raw-candidate-pool`; parity reported `matched = true` over a `30821`-candidate join, while the top-level raw profile stayed `0` mismatch / `0` score-order violations;
- raw pair-upper scan parity is now available behind `HHWX_LOW_MEMORY_RAW_PAIR_UPPER_SCAN_PARITY=1`; retained smoke `low-memory-polish-hhwx-2026-06-17T20-03-14-565Z.json` completed `P01:none` exact with `matched = true`, `mismatchCount = 0`, and pair uppers `5492451`, `5223081`, `5060568` matching object scan exactly;
- an initial P02 raw-pair run `low-memory-polish-hhwx-2026-06-17T19-56-52-626Z.json` OOMed because the raw pool was requested before the candidate-total guard; this was fixed by checking candidate counts before calling `getRawCandidatePool()`;
- the retained fixed hard-row smoke `low-memory-polish-hhwx-2026-06-17T20-01-16-397Z.json` completed P02 with unchanged result fields and raw pair parity skipped safely: `candidateCountTotal = 747802`, limit `60000`, `rawPoolBuilt = false`;
- raw pair-complement / banned-card parity is now available behind `HHWX_LOW_MEMORY_RAW_PAIR_COMPLEMENT_PARITY=1`; retained smoke `low-memory-polish-hhwx-2026-06-17T20-07-37-160Z.json` completed `P01:none` exact with `matched = true`, `mismatchCount = 0` across `12` sampled banned-card queries, and unchanged score/gap fields;
- retained hard-row smoke `low-memory-polish-hhwx-2026-06-17T20-08-47-601Z.json` completed P02 with unchanged result fields and raw complement parity skipped before raw pool construction: `candidateCountTotal = 747802`, limit `60000`, `rawPoolBuilt = false`;
- raw anchor cheap-upper replay is now available behind `HHWX_LOW_MEMORY_RAW_ANCHOR_CHEAP_UPPER_REPLAY=1`; retained smoke `low-memory-polish-hhwx-2026-06-17T20-14-15-636Z.json` completed `P01:none` exact with `matched = true`, `mismatchCount = 0` across `16` sampled anchor cheap-upper estimates, using a `0.06 MiB` local sorted raw pool;
- retained hard-row smoke `low-memory-polish-hhwx-2026-06-17T20-15-25-709Z.json` completed P02 with unchanged result fields and raw anchor replay skipped before raw pool construction: `candidateCountTotal = 747802`, limit `60000`, `rawPoolBuilt = false`;
- non-pressure six-row raw-helper run `low-memory-polish-hhwx-2026-06-17T20-18-13-901Z.json` is retained only as a configuration warning: it reproduced the known bare-default memory-limited path (`2 exact / 4 bounded`, `2 timedOut`, `2 memoryLimited`, peak `6782 MiB`) and must not be compared with PR #43 pressure gates;
- retained pressure six-row raw-helper gate `low-memory-polish-hhwx-2026-06-17T20-34-23-145Z.json` ran the four pressure flags plus raw anchor cheap-upper replay, raw pair-complement parity, raw pair-upper scan parity, and raw solver input census; it preserved the clean PR #43 proof shape: `4 exact / 2 bounded`, bounded gap `582812`, `0 failed / 0 timedOut / 0 memoryLimited`, peak `2949 MiB`, and all six rows kept both `averageScore` and `maxScore`;
- in that pressure gate, `P01:244` and `P01:323` were under the raw-helper guard and all three raw helper checks matched object behavior with `mismatchCount = 0`; larger rows skipped helper replay before raw pool construction via `candidate-total-limit` (`P02:260 = 747802`, `P08:323 = 557165`, `P10:244 = 94840`, `P10:260 = 94855`);
- the same pressure gate reinforces the raw-storage opportunity: P02's `747802` candidates estimate to `28.53 MiB` raw rows, `48.01 MiB` final-join input, and `52.27 MiB` all-slot conflict index while the process peak is `2949 MiB`; P08 is `21.25 / 33.47 / 37.76 MiB`, and each P10 row is about `3.62 / 5.43-5.60 / 6.11 MiB`;
- raw anchor/frontier probe was tested behind `HHWX_LOW_MEMORY_RAW_ANCHOR_FRONTIER_PROBE=1`, but it is no longer retained as hard-row gate evidence;
- earlier artifacts `low-memory-polish-hhwx-2026-06-17T20-55-33-203Z.json` and `low-memory-polish-hhwx-2026-06-17T20-58-54-247Z.json` showed a promising P02 raw scan (`747802` candidates, `28.53 MiB` raw rows, residual gap `206936`), but follow-up reruns reproduced P02 Node OOM and P01:244 exact regression when the flag was used in focused gates;
- failed rerun artifacts include `low-memory-polish-hhwx-2026-06-17T21-20-14-786Z.json`, `2026-06-17T21-24-51-676Z.json`, `2026-06-17T21-37-22-563Z.json`, `2026-06-17T21-47-54-880Z.json`, and `2026-06-17T22-22-52-150Z.json`; a no-raw six-row control `2026-06-17T22-36-18-758Z.json` also showed current focused-gate variance, so these failed gates are diagnostic warnings, not acceptance baselines;
- the raw anchor/frontier probe is now guard-only for non-empty candidate pools (`candidate-total-limit`, `rawPoolBuilt = false`) until it is redesigned outside the current exact-join hot path; retained P02 guard smoke `low-memory-polish-hhwx-2026-06-17T22-20-06-516Z.json` preserved bounded gap `382812`, score/average `9376984`, max score `9412868`, and `0 failed / 0 timedOut / 0 memoryLimited`;
- conclusion from the rerun audit: conflict-aware raw split / pricing remains the right proof idea, but it should be developed as an offline single-configuration raw prototype or after raw-resident storage, not as another opt-in probe that constructs large transient raw pools inside the current exact-join lifecycle;
- incremental raw candidate mirror diagnostics were narrowed to explicit small-sample opt-in only. `HHWX_LOW_MEMORY_RAW_MIRROR=1` now requires `HHWX_LOW_MEMORY_RAW_MIRROR_MAX_CARD_COUNT` before it enters the candidate-generation hot path; otherwise it only records a disabled profile. P01 small smoke `low-memory-polish-hhwx-2026-06-18T01-35-24-134Z.json` stayed exact with average `7927236`, max `7982835`, and `0` raw mismatches. Current P02 reruns around `2026-06-18T01-28` / `01-32` OOMed even in guard-only/no-raw controls, so they are runner-variance warnings, not accepted raw-mirror evidence;
- current conclusion: raw-index/typed-array resident storage is now the highest-confidence route to material memory reduction. Early pruning remains valuable for proof closure, but the P02 memory class cannot be solved by prefix skip counts alone while candidate fill still reaches the same caps.

The JSON files above contain `isolated.*Path` fields for detailed per-row diagnostics. Those referenced files are part of the retained baseline set.

## Calc Research Conclusion

`calc.krkrdkdk.cn` remains useful as an algorithm reference, not as an exactness oracle.

Useful lessons:

- move pruning earlier than HHWX currently does;
- use compact/raw candidate representation;
- reason at signature/prefix level before materializing many rich candidate objects;
- separate solver result quality from proof status.

Limits:

- public calc output does not expose HHWX-style proof ledger fields;
- observed calc scoring differs in some fixed-card traces and appears max-score-oriented;
- `maxCandidates`, `randomBucket`, and similar behavior cannot enter HHWX exact semantics without an HHWX-native upper-bound proof.

## Next Main Goal

Start a proof-backed early-pruning line on `dev/low-memory-early-pruning`.

Target: reduce candidate birth before final join, especially for hard rows like `P02:260`, without relying on unstable threshold-triggered behavior.

The five-stage path is:

1. No-op prefix margin diagnostics.
   - Keep pruning disabled.
   - Record how far each prefix/leaf is from a safe skip line:
     `prefixUpper + otherSlotsUpper - incumbent`.
   - Bucket margins by slot and prefix level so the next pruning target is evidence-led, not threshold-led.
2. Hypothetical proof ledger.
   - Still do not delete candidates.
   - For every hypothetical skip, record `slot`, `level`, `impliedCompletions`, `incumbent`, `prefixUpper`, `otherSlotsUpper`, `totalUpper`, and `margin`.
   - Report replay violations explicitly if any skipped branch later contains a materialized candidate that could beat the recorded bound.
3. Opt-in leaf-birth pruning.
   - Enable only behind an experiment flag.
   - Skip rich candidate materialization only when the replay ledger proves `totalUpper < incumbent`.
   - This is the first real pruning cut because a complete 5-card leaf has the smallest proof surface.
4. Opt-in level-4 branch pruning.
   - Move the same proof rule one level earlier only after leaf pruning is stable.
   - The fifth-card completion upper must be a true optimistic HHWX upper, not an empirical cap.
5. Full gate and possible promotion.
   - Promote nothing to default until a full 40-case gate has no exact regression, no gap regression, no false-exact evidence, and material memory/candidate-birth improvement.

## Acceptance Gates

Focused gate before any full run:

- `P01:244`
- `P01:323`
- `P02:260`
- `P08:323`
- `P10:244`
- `P10:260`

Focused acceptance:

- exact/bounded status must match or improve the clean PR #43 validation;
- exact rows keep `observedScoreUpperBoundGap = 0`;
- bounded gap total must not exceed `582812`;
- average score and max score must be present for every non-failed row;
- no `failed`, process OOM, or false-exact evidence.
- every real skip, when pruning is enabled, must have a replayable proof ledger entry;
- no threshold-triggered fallback may decide exactness or skip candidates.

Full 40-case acceptance:

- same fixture: `hard-case-profiles-2026-06-02.json`;
- same case matrix: `P01` through `P10` times `none`, `244`, `260`, `323`;
- same budget: `300000ms` per case;
- same Node heap ceiling: `--max-old-space-size=8192`;
- exact count must not regress from the current accepted `38/40` gate;
- bounded gap total must not exceed `582812`;
- `P02:260` remains bounded only with a recorded, non-worse gap;
- `0 failed`, `0 timedOut`, `0 memoryLimited`;
- peak memory should improve materially versus the PR #43 retained gates before any pruning is considered merge-worthy.

Long-term memory targets:

- near term: consistent sub-3 GiB focused hard rows without proof regression;
- mid term: hard rows below 1 GiB;
- safety target: 700-800 MiB hard-case ceiling;
- stretch: calc-like hundreds-of-MiB behavior while preserving HHWX proof semantics.

Early-pruning success targets:

- diagnostic stage: explain whether current prefix upper bounds are tight enough to prune `P02:260`;
- first pruning stage: reduce `P02:260` materialized candidate birth by at least `25%`, or produce clear evidence that the current upper source is too loose;
- proof stage: any reduced candidate birth must preserve average score, max score, proof state, and bounded gap fields against the clean pressure baseline;
- memory stage: hard focused rows should move below the current 3 GiB class before any PR is considered meaningful.

## Non-Goals

- Do not replace HHWX exactness with calc output.
- Do not optimize for max score as the primary objective.
- Do not keep adding threshold-triggered fallbacks that merely move memory pressure between phases.
- Do not merge raw final-join release paths until raw solver handoff has its own exact proof coverage.
- Do not keep ordinary cache/object-shape micro-tuning as the main line unless it has clear hard-case memory evidence.

## Immediate Next Actions

1. Keep `HHWX_LOW_MEMORY_CAPACITY_SOURCE_LEAF_PRUNING=1` as an opt-in experiment only; it is safe so far, but not high impact enough for default.
2. Promote the basic level-3 lookahead replay into a proof-ledger experiment before any real skip:
   - keep the child lookahead basic-capacity-only;
   - use a global child-prefix budget before constructing child proof work;
   - record the selected level-3 card ids, child count, finite child count, max child total upper, incumbent, margin, slot, and implied completion count in capped samples.
3. Implement opt-in level-3 lookahead branch pruning only after the ledger is stable:
   - branch-decision replay/violation accounting is available and has `0` violations on the retained `8192` and `16384` P02 smokes;
   - skip a level-3 branch only when the replayed max child total upper is finite and below the current cutoff;
   - report pruned prefix count, implied completions, and replay violations separately from existing leaf pruning;
   - retained P02 smokes show `0` actual materialized reduction, so this is not a default candidate.
4. Keep `HHWX_LOW_MEMORY_PREFIX_CAPACITY_BATCH_PRUNING=1` as a narrow level-4 experiment:
   - it has a passing `P01:none` small smoke and real pruned-prefix counts;
   - it has not passed `P02:260` and must not be promoted or used in focused gates until the hard-row OOM is resolved;
   - next useful work is reducing the cost of the proof or combining it with raw-resident storage, not raising budgets.
5. Move the next algorithmic slice to candidate admission/frontier closure:
   - use the level-3 lookahead proof as a component, not as a standalone budget-scaling path;
   - investigate whether a proof-backed candidate cap can reject low-ranked materialization rather than simply backfilling from other branches;
   - keep raw-index storage in scope because early pruning that still fills the same cap cannot by itself lower resident candidate memory.
6. Add a frontier proof / storage diagnostic for P02:
   - current numeric blocker measurement is retained in `2026-06-17T19-11-42`;
   - no-op cheap-upper probe is retained in `2026-06-17T19-16-21` and shows the current proof timeboxes without closing P02;
   - lightweight raw census is retained in `2026-06-17T19-29-52` and shows a `48-52 MiB` raw final-join/input footprint for the current P02 candidate pool;
   - actual raw candidate pool profile is retained in `2026-06-17T19-40-22` and proves the current P02 candidate rows can be copied into `28.53 MiB` exact-sized typed arrays with `0` mismatch and `0` score-order violations;
   - next prototype should be raw-index candidate resident storage or a fundamentally cheaper frontier proof over raw-index candidates, not raising existing proof guards;
   - do not raise guard constants as a default change without memory evidence.
7. Promote raw candidate pool from profile to opt-in resident infrastructure:
   - keep the first slice no-op with respect to search result and proof state;
   - retain `sourceIndex` so winners and debug output can be late-hydrated from the original rich candidate only when needed;
   - first target is final-join/frontier helper read paths over raw scores and card ids, not default release of rich candidates;
   - acceptance for this slice is `0` raw mismatch, unchanged score/average/max/gap/status, and no P02 OOM.
   - the raw anchor/frontier rerun audit shows large transient raw-pool probes are not stable inside the current exact-join lifecycle; prioritize offline single-configuration raw pricing or raw-resident storage before revisiting conflict-aware raw pair-upper tightening.
   - do not use raw mirror as the hard-row storage prototype; it is now a small-sample field-consistency diagnostic only.
8. Tighten the prefix proof before broader pruning:
   - avoid generated-pair-only comparison on level-4 replay unless explicitly requested;
   - level-3 replay currently has no P02 skip signal with the existing slot upper;
   - level-3 lookahead has the first strong diagnostic signal, but it must remain replay-only until ledger coverage is complete;
   - keep the hot path replay-only until violation count is `0` on focused gates.
9. Run `P02:260` pressure smoke after each resident-storage slice and compare against the current raw-profile artifact before enabling broader gates.
10. Run the six-row focused gate before considering broader testing or default promotion.
   - The current raw-helper diagnostic gate is retained in `2026-06-17T20-34-23`; future resident-storage changes must rerun the same pressure focused gate and preserve its proof/score fields.

## Maintenance Rules

- Keep detailed benchmark JSON under ignored `temp/`.
- Update this roadmap only with durable conclusions, accepted baselines, and current next steps.
- Do not paste every trial run into this file; reference the artifact and summarize the decision it supports.
- When deleting temp files, preserve every path referenced by the retained milestone JSON files.
