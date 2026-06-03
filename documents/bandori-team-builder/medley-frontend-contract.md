# Bandori Medley Frontend Contract

This document is the frontend-facing contract for the medley team builder. It is intentionally shorter than the benchmark report: product code should depend on the stable request/response fields here, not on experiment counters.

## Current Preview Binding

The current UI is a test-preview integration for tour/medley events:

- There is no standalone medley mode switch. When the selected event type is tour/medley, the Live step is bound to medley LIVE; non-medley events keep the single-song flow.
- The Song step has exactly three medley slots. The same song may appear in multiple slots, and each slot has its own difficulty.
- Event-song quick buttons, such as `活动曲目 JP` or `活动曲目 CN`, populate the three slots in event order when data is available. They are shortcuts, not locks; later manual song edits may clear the selected event-song state.
- Perfect rate is still one shared assumption across the three slots.
- The preview maximize path defaults to a 300s budget and exposes a running timer, cancellation, a result report, and a user-copyable debug payload.
- The warning copy must keep the preview status clear: the medley calculator is under active development, maximize tries to prove a global optimum, and the temporary greedy comparison is not an optimality proof.

## Search Entrypoint

Use:

```ts
import {
  searchBandoriBestMedleyTeams,
  type BandoriMedleyAreaItemCoarseFilter,
  type BandoriMedleyTeamSearchInput,
  type BandoriMedleyTeamSearchResponse,
} from "@/lib/bandori/team-builder/medley";
```

The legacy facades still re-export the same contract:

- `@/lib/bandori-medley-team-search`
- `@/lib/bandori-team-search`

## Stable Input Fields

Frontend code should treat these as the stable user-facing controls:

- `songs`: exactly three song/chart inputs for the medley. Repeated songs are allowed, and difficulty belongs to each slot.
- `resultLimit`: normally `1` for exact proof work.
- `maxSearchDurationMs`: user-visible search budget. The current preview maximize default is `300000`.
- `perfectRate`: shared perfect-rate assumption.
- `coarseAreaItemFilter`: area-item search scope.

`coarseAreaItemFilter` has three product-relevant modes:

- `all`: prove the full area-item search space. This can take minutes on large real profiles.
- `locked`: prove only the requested `bandKey` / `attribute` / optional `parameter` subspace.
- `auto`: allow the engine to narrow coarse groups for responsiveness. This must be displayed as bounded unless the engine reports otherwise.

The `optimization` object is reserved for benchmark and development controls. Product UI should not expose individual fields such as `debugConfigurationTrace`, `exactCandidateSoftLimit`, or experimental upper-bound toggles as user-facing settings.

The current preview may pass:

- `debugConfigurationTrace: true`, so the copied debug payload can explain which area-item configuration was not closed.
- `memorySoftLimitMiB`, so the browser/worker search can try to stop before a tab-level OOM.

The preview must not lower `exactCandidateSoftLimit` by default. The solver's default limit is `20000`, and locked/all scopes with at least a 60s budget and 900+ calculated cards auto-raise to `400000`. A too-low frontend override can create early bounded results that do not reflect the real proof frontier.

## Stable Response Fields

Use `response.results[0]` for the displayed best medley:

- `score`, `averageScore`, `maxScore`, `minScore`
- `areaItemConfiguration`
- `songResults[]`, including each song's team result, `songIndex`, `startCombo`, and `notesCount`
- `cardIds`, the union of all selected cards

Use `response.stats` for status:

- `searchMode === "exact"` and `isExhaustive === true`: the result is proven optimal for the requested scope.
- `searchMode === "bounded"`: show the best result plus the proof gap and early-stop reason.
- `searchMode === null`: comparison-only path. Do not show proof status or proof gap.
- `timedOut === true`: the time budget stopped the proof.
- `memoryLimited === true`: a memory guard stopped the proof.
- `memorySoftLimitMiB`: the effective memory guard when available.
- `peakUsedHeapMiB`: best-effort JS heap peak recorded by the solver when available.
- `observedScoreUpperBoundGap`: primary user-facing gap number for bounded runs.
- `elapsedMs`: search time to display in progress/results UI.

Do not build durable product behavior around `stats.profiling.configurationTrace` or individual profiling counters. They are diagnostic and may change as the solver is reorganized. It is acceptable for the preview debug panel to copy them back to maintainers.

## Status Display

Do not expose the raw strings `exact` or `bounded` as user-facing labels. Map them to product copy:

- exact medley result: `已完成精确的全局最优证明`
- bounded medley result: `无法完成精确的全局最优证明，提前结束：...`
- comparison-only greedy result: no proof-status label

Bounded explanations should be multiline when possible. Current reason sources include:

- `timedOut`: include the time limit, for example `限制 300 秒`.
- `memoryLimited`: include the memory limit, for example `上限 2800 MiB`, when the stat is available.
- `stats.profiling.exactCandidateJoinLastAbortReason`: explain candidate-join aborts, including candidate soft limit, node/workload limit, or time limit when available.
- configuration progress: show closed/total and started/total area-item configurations, and include the first unclosed band/attribute/parameter configuration when `configurationTrace` is present.

## Temporary Greedy Comparison

The preview contains a removable `legacy-greedy-single` comparison mode. It exists only as a fallback and sanity check while the maximize proof path is still being tested.

This mode must stay independent from the maximize path:

- It enumerates the same shared area-item configurations, because medley requires all three teams to use one area-item setup.
- It greedily picks one team per slot while enforcing cross-slot card disjointness.
- It tries all slot-order permutations for the three songs, so orders such as `3/1/2` are covered.
- It uses the same medley scoring model, including sequential combo carry-over.
- It does not prove optimality and should not return or display bounded/heuristic proof status.

When this temporary path is removed later, it should be possible to delete the UI segment, worker branch, and helper functions without touching the public medley search API.

## Browser Memory Guard

The preview uses best-effort memory protection in two places:

- The solver reads `performance.memory.usedJSHeapSize` inside the worker and stops as bounded when the effective heap limit is reached.
- The page-level watchdog samples browser memory while the worker is running and terminates the worker if the measured usage exceeds the configured limit.

This protection is intentionally conservative, but browser memory APIs are incomplete. Chrome task-manager working set can be higher than JS heap counters, especially for dedicated workers, so the guard reduces OOM risk but cannot be treated as a hard process-memory cap.

## Current Benchmark Gate

Run the focused 300s gate before the full matrix when checking medley optimizer changes:

```powershell
node .\scripts\bandori-medley-hard-case-benchmark.cjs focus-6-300
```

The focus set is:

- `P02:260`
- `P04:260`
- `P08:323`
- `P10:244`
- `P04:244`
- `P08:260`

It records one process per case, candidate-join diagnostics, and peak working set in MiB. It accepts the change only if at least one baseline bounded case converts to exact, or the bounded gap drops by at least 25%, while exact baseline cases do not regress beyond the configured allowance.

Only after the focused gate is acceptable, run the broader 40-case matrix:

```powershell
node .\scripts\bandori-medley-hard-case-benchmark.cjs all-300
```

The matrix covers P01-P10 across `none`, `244`, `260`, and `323` at 300s per case. It compares against the 2026-06-02 baseline of `36/40` exact, no timeouts, P95 `231981ms`, max `295714ms`, and bounded gap total `1534986`; the current acceptance cap remains `300000ms`.

The composite regression gate is still available:

```powershell
node .\scripts\bandori-medley-hard-case-benchmark.cjs gate-120
```

It runs `all-300` plus the known locked/single hard cases.

For shorter checks while developing UI wiring:

```powershell
node .\scripts\bandori-medley-hard-case-benchmark.cjs p05-visual
node .\scripts\bandori-medley-hard-case-benchmark.cjs p01-locked
```

Latest recorded evidence is in `documents/bandori-team-builder/medley-real-profile-benchmark-2026-05-31.md`.

## Frontend Requirements Before Shipping

- Long searches need visible running state, elapsed time, and cancellation.
- Proof status must be explicit without exposing raw `exact` / `bounded` strings; incomplete proof results must not be labeled as globally optimal.
- Locked area-item controls should state their scope, because locked exact only proves that subspace.
- All-mode should be treated as an advanced/proof mode because hard real profiles can take close to three minutes.
- The debug panel must make it easy for users to copy the result report and diagnostic payload when reporting preview issues.
