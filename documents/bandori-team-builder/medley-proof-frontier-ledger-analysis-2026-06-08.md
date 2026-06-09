# Medley Proof Frontier Ledger Analysis

Date: 2026-06-08
Branch/worktree: `dev/medley-greedy-seed-acceptance` in `C:\Users\bluew\.codex\worktrees\medley-prefix-seed\hhwx`

## Executive Summary

This round implemented the `Ledger+Gate` plan. The proof ledger path is useful and should be kept: with `debugConfigurationTrace=true`, the search now emits a structured `proofLedger` plus `proofLedgerSummary` derived from the existing configuration trace. It is diagnostic only and does not affect exact/bounded semantics.

The guarded `enableExactJoinPrefixSeed` experiment still failed the 4-case hard gate. It should remain `research-only`, default off, and should not proceed to the full focus/live/40-case matrix.

The important conclusion is narrower than a direct bug claim: `P08:323` is close to the 300s proof boundary, so a single A/B regression can include scheduling and memory-sampling noise. But the observed `exactJoinPrefixSeedCallCount=0`, `rootPruned 105 -> 0`, and `exact -> bounded` regression is large enough that no proof-only patch should start until a no-op equivalence gate is in place.

## Implemented Scope

- Kept `enablePreProofSeedWarmup=false` and `enableExactJoinPrefixSeed=false` by default.
- Added proof ledger diagnostics behind `optimization.debugConfigurationTrace=true`.
- Preserved raw `configurationTrace`.
- Added `proofLedger` entries with configuration/coarse key, status, incumbent before/after, root/active/remembered/effective upper, gap, exact-join abort details, candidate counts/cutoffs, pair upper, phase elapsed, phase memory, and optional-probe deltas.
- Added `proofLedgerSummary` with top unclosed frontier entries, top elapsed entries, top memory entries, abort reason counts, guard skip reason counts, and coarse group summaries.
- Added guarded prefix-seed skip reasons for experimental probes:
  - `candidate-count`
  - `large-gap`
  - `low-remaining-budget`
  - `low-memory-headroom`
  - `previous-local-timeout`
- Added the `baselineProofLedger` benchmark variant.
- Extended acceptance reports with proof ledger diagnostics and prefix guard counters.
- Added no-op diagnostic variants for the next acceptance pass:
  - `prefixForceNoop`: accepts the prefix flag at the top level but exact join returns before reading candidates, stats, memory, upper bounds, or writing prefix counters.
  - `prefixGuardOnly`: runs guard reads and records skip counters, but cannot call the seed-only solver.
  - `currentGuardedPrefix`: keeps the current guarded prefix behavior as diagnostic reference only.

## Static Validation

Passed:

- `node --check temp\bandori-team-builder\run-medley-preproof-warmup-acceptance.cjs`
- `node --check temp\bandori-team-builder\benchmark-real-profiles-medley.cjs`
- `git diff --check`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run build`

`npm.cmd run lint` still reports the existing warning set only: 33 warnings, 0 errors. `npm.cmd run build` used non-sensitive placeholder Supabase env because local real build env is not required for this code path.

Additional smoke checks passed:

- Default options on `P10:244` produced no `configurationTrace`, no `proofLedger`, and all prefix seed counters stayed `0`.
- `debugConfigurationTrace=true` produced `configurationTrace`, `proofLedger`, and `proofLedgerSummary`.
- A 10s smoke verified `proofLedger.length === configurationTrace.length === proofLedgerSummary.entryCount`.
- Ledger summary validation on the 4-case JSON passed: entry counts match, top-gap ordering is descending, abort reason counts are recomputable, phase elapsed values are non-negative, and phase memory values are finite or `null`.

## 4-Case Acceptance Run

Run output:

- JSON: `temp/bandori-team-builder/medley-prefix-seed-acceptance-2026-06-08-proof-ledger-4case.json`
- Markdown: `temp/bandori-team-builder/medley-prefix-seed-acceptance-2026-06-08-proof-ledger-4case.md`
- Console stdout: `temp/bandori-team-builder/medley-prefix-seed-acceptance-2026-06-08-proof-ledger-4case.console.out.log`
- Console stderr: `temp/bandori-team-builder/medley-prefix-seed-acceptance-2026-06-08-proof-ledger-4case.console.err.log`

Parameters:

- Fixture: `temp/bandori-team-builder/hard-case-profiles-2026-06-02.json`
- Cases: `P10:244`, `P10:260`, `P04:260`, `P08:323`
- Songs: `385,193,619`
- Duration: `300000ms`
- Variants: `baseline`, `baselineProofLedger`, `exactJoinPrefixSeed`
- Memory ratio limit: `1.02`
- Live-auto fixture: unavailable in this worktree, so this round used the planned 4 hard fixture cases only.

Gate summary:

| metric | baseline | guarded exactJoinPrefixSeed | pass |
| --- | ---: | ---: | --- |
| exact count | 2/4 | 1/4 | no |
| bounded gap total | 582102 | 1005031 | no |
| peak working set MiB | 4288.1 | 4334.2 | yes |
| OOM count | 0 | 0 | yes |

Case rows:

| case | baseline exact | prefix exact | baseline gap | prefix gap | baseline peak MiB | prefix peak MiB | prefix guard skips | guard reasons |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| P10:244 | no | no | 409985 | 409985 | 4288.1 | 4334.2 | 2 | `candidate-count:2` |
| P10:260 | yes | yes | 0 | 0 | 3544.1 | 3492.3 | 9 | `large-gap:9` |
| P04:260 | no | no | 172117 | 172117 | 4181.2 | 4260.0 | 14 | `candidate-count:5`, `large-gap:9` |
| P08:323 | yes | no | 0 | 422929 | 3389.4 | 4085.1 | 1 | `large-gap:1` |

No prefix seed solve actually ran in the guarded variant:

- `exactJoinPrefixSeedCallCount=0`
- `exactJoinPrefixSeedHitCount=0`
- `exactJoinPrefixSeedTimedOutCount=0`
- `exactJoinPrefixSeedNoHitLocalTimeoutCount=0`

The guarded variant therefore failed even without seed hits. This is enough to stop defaulting or enlarging the prefix-seed route, but not enough by itself to identify the exact interference source. The next diagnostic separates top-level variant overhead, guard-only reads/counters, and the current guarded branch before any proof-only patch is attempted.

## No-op Gate Follow-up

The acceptance runner now emits five variants:

| variant | purpose |
| --- | --- |
| `baseline` | default maximize path |
| `baselineProofLedger` | baseline plus `debugConfigurationTrace=true` |
| `prefixForceNoop` | prefix flag received, exact join returns before any prefix-specific reads or writes |
| `prefixGuardOnly` | prefix guards run and skip counters may be written, but seed solve is disabled |
| `currentGuardedPrefix` | current guarded prefix path, retained as research-only diagnostic |

No-op equivalence rules:

- When `exactJoinPrefixSeedCallCount=0`, `prefixForceNoop` must match baseline on score, search mode, gap, completed configurations, root-pruned configurations, and configuration status sequence.
- When no seed solve runs, `prefixGuardOnly` must not change exact/bounded status or proof progress. Allowed differences are elapsed time, memory sampling, and guard skip counters.
- If `prefixForceNoop` regresses, inspect runner/variant/env/scheduling first. If only `prefixGuardOnly` or `currentGuardedPrefix` regresses, inspect guard reads, counter writes, and exact-join state interaction.
- Proof-only patches remain blocked until the no-op gate is stable.

10s shape smoke:

- JSON: `temp/bandori-team-builder/medley-prefix-seed-acceptance-2026-06-08-prefix-noop-smoke.json`
- Markdown: `temp/bandori-team-builder/medley-prefix-seed-acceptance-2026-06-08-prefix-noop-smoke.md`
- Case: `focus-6-300:P08:323`
- Duration: `10000ms`
- Variants: `baseline`, `baselineProofLedger`, `prefixForceNoop`, `prefixGuardOnly`, `currentGuardedPrefix`
- Result: `prefixForceNoopEquivalent=true`, `prefixGuardOnlyEquivalentWhenNoCall=true`, `currentGuardedNoCallEquivalent=true`, no OOM, no first divergence.
- Caveat: this only validates runner shape and no-op comparison mechanics. It is not a substitute for the planned 300s repeated hard-case gate.

## Proof Ledger Diagnostics

Ledger entry counts:

| case | baselineProofLedger exact | ledger entries | top unclosed gap | top abort reason |
| --- | --- | ---: | ---: | --- |
| P10:244 | no | 3 | 409984.3037651442 | `initial-candidate` |
| P10:260 | yes | 108 | none after filtering closed/proved entries | none |
| P04:260 | no | 15 | 324783.5 | `high-budget-pair-upper` |
| P08:323 | yes | 108 | none after filtering closed/proved entries | none |

Abort reason distribution from the baseline proof ledger:

```json
{
  "solve-dominated-same-coarse-frontier": 2,
  "initial-candidate": 1,
  "high-budget-pair-upper": 1
}
```

Most expensive closed frontiers, useful for future proof-cost work:

| case | coarse | configuration | elapsed ms | status |
| --- | --- | ---: | ---: | --- |
| P08:323 | `PastelPalettes/cool` | 39 | 87450 | `exact-before-seeding-proved` |
| P08:323 | `PastelPalettes/cool` | 40 | 65250 | `exact-before-seeding-proved` |
| P08:323 | `PastelPalettes/cool` | 41 | 62558 | `exact-before-seeding-proved` |
| P04:260 | `PastelPalettes/powerful` | 37 | 60984 | `exact-after-seeding-proved` |
| P10:260 | `Morfonica/happy` | 66 | 38430 | `exact-after-seeding-proved` |

Largest memory spikes:

| case | coarse | configuration | peak MiB | status | abort |
| --- | --- | ---: | ---: | --- | --- |
| P10:244 | `HelloHappyWorld/happy` | 32 | 4294 | `exact-after-seeding-timeout` | `initial-candidate` |
| P04:260 | `Everyone/happy` | 104 | 4201 | `exact-before-seeding-timeout` | `high-budget-pair-upper` |
| P04:260 | `Roselia/pure` | 58 | 4073 | `exact-before-seeding-proved` | none |
| P04:260 | `Morfonica/pure` | 69 | 4073 | `exact-before-seeding-proved` | none |
| P04:260 | `PastelPalettes/powerful` | 38 | 3969 | `exact-before-seeding-proved` | none |

## Diagnosis

1. The guarded prefix seed did not improve incumbent quality.

   Every seed probe was skipped by guard. This is expected for the configured gates: many candidate sets were too large or the observed root gap was too large for a plausible small seed improvement to close.

2. The guarded prefix seed still failed acceptance.

   The primary failure is `P08:323`: baseline was exact in `206753ms`, while guarded prefix returned bounded in `124400ms` with gap `422929`. The prefix variant completed only one configuration and root-pruned zero configurations, while baseline completed three configurations and root-pruned 105.

3. The failure mode is proof-frontier closure, not final score.

   `P08:323` had the same final score `9249509` in baseline and prefix. The regression is entirely in proof status and observed upper gap. Higher seed score would not solve this class of problem unless it directly closes the relevant upper frontier.

4. The proof ledger points at a small number of expensive frontier families.

   Expensive proof work clusters around `PastelPalettes/cool`, `PastelPalettes/powerful`, `Morfonica/happy`, and some high-memory abort paths such as `HelloHappyWorld/happy` and `Everyone/happy`.

5. Current root/upper summaries still need careful interpretation.

   Closed/proved configurations can still have large raw root gaps in the ledger because the root upper is an optimistic pre-proof bound. The report now treats `topUnclosedByGap` as only timeout/unproved/bounded/abort/remembered-unclosed entries, and keeps expensive proved entries in `topByElapsedMs` / `topByMemorySpike`.

## Recommendation

Freeze `enableExactJoinPrefixSeed` as diagnostic only:

- keep default `false`;
- do not increase timebox;
- do not increase K or candidate limits;
- do not add fixed-card/neighborhood repair on top of it;
- do not run full focus/live/40-case acceptance for this route.

Next implementation should be proof-first:

1. Add a ledger-driven proof patch for `candidate-fill-generator-aborted` and `high-budget-pair-upper` cases.
2. Target same-coarse frontier closure only when ledger shows a remembered unclosed upper above incumbent.
3. Split future summaries into:
   - unclosed frontier gap;
   - expensive closed proof work;
   - memory-heavy closed proof work.
4. Only revisit a seed-like probe if the ledger shows incumbent quality is the specific blocker for an unclosed frontier.

For another model reviewing this: the failure was not caused by a small seed timebox. The failure is architectural. Score-oriented probes do not produce a proof certificate or reliably tighten an upper bound, so they can reduce exact completion even when final score is unchanged.
