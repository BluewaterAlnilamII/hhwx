# HHWX Medley Low-Memory Roadmap

Last updated: 2026-06-17

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

The intended order is:

1. Port only the lightweight parts of the prefix replay stash into the clean branch.
2. Add no-op signature/prefix census diagnostics:
   - checked prefix count;
   - finite upper count;
   - implied completion count;
   - candidate birth count by slot/signature;
   - skipped count if pruning were enabled.
3. Add upper replay with a proof ledger, still no deletion:
   - each hypothetical skip must record incumbent, prefix upper, other-slot upper, and gap.
4. Enable pruning only behind an opt-in flag after replay reports zero violations on focused hard cases.
5. Promote to default only after a full 40-case gate has no exact regression, no gap regression, and no false exact risk.

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

## Non-Goals

- Do not replace HHWX exactness with calc output.
- Do not optimize for max score as the primary objective.
- Do not keep adding threshold-triggered fallbacks that merely move memory pressure between phases.
- Do not merge raw final-join release paths until raw solver handoff has its own exact proof coverage.
- Do not keep ordinary cache/object-shape micro-tuning as the main line unless it has clear hard-case memory evidence.

## Immediate Next Actions

1. Run the full six-row focused gate with pressure + prefix replay and compare against `low-memory-polish-hhwx-2026-06-17T11-02-24-155Z.json`.
2. Keep heavy attribution disabled by default; prior P02 diagnostics could OOM.
3. Use prefix replay totals to choose the first proof-backed pruning target level, likely level 4 or leaf birth.
4. Add proof-ledger fields for any hypothetical skip before enabling real pruning.
5. Only after no-op diagnostics are stable, test opt-in proof-backed pruning on focused rows.

## Maintenance Rules

- Keep detailed benchmark JSON under ignored `temp/`.
- Update this roadmap only with durable conclusions, accepted baselines, and current next steps.
- Do not paste every trial run into this file; reference the artifact and summarize the decision it supports.
- When deleting temp files, preserve every path referenced by the retained milestone JSON files.
