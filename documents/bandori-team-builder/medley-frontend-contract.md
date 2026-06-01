# Bandori Medley Frontend Contract

This document is the frontend-facing contract for the medley team builder. It is intentionally shorter than the benchmark report: product code should depend on the stable request/response fields here, not on experiment counters.

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

- `songs`: exactly three song/chart inputs for the medley.
- `resultLimit`: normally `1` for exact proof work.
- `maxSearchDurationMs`: user-visible search budget.
- `perfectRate`: shared perfect-rate assumption.
- `coarseAreaItemFilter`: area-item search scope.

`coarseAreaItemFilter` has three product-relevant modes:

- `all`: prove the full area-item search space. This can take minutes on large real profiles.
- `locked`: prove only the requested `bandKey` / `attribute` / optional `parameter` subspace.
- `auto`: allow the engine to narrow coarse groups for responsiveness. This must be displayed as bounded unless the engine reports otherwise.

The `optimization` object is reserved for benchmark and development controls. Product UI should not expose individual fields such as `debugConfigurationTrace`, `exactCandidateSoftLimit`, or experimental upper-bound toggles.

## Stable Response Fields

Use `response.results[0]` for the displayed best medley:

- `score`, `averageScore`, `maxScore`, `minScore`
- `areaItemConfiguration`
- `songResults[]`, including each song's team result, `songIndex`, `startCombo`, and `notesCount`
- `cardIds`, the union of all selected cards

Use `response.stats` for status:

- `searchMode === "exact"` and `isExhaustive === true`: the result is proven optimal for the requested scope.
- `searchMode === "bounded"`: show the best result plus the proof gap.
- `timedOut === true`: the time budget stopped the proof.
- `observedScoreUpperBoundGap`: primary user-facing gap number for bounded runs.
- `elapsedMs`: search time to display in progress/results UI.

Do not build product UI around `stats.profiling.configurationTrace` or individual profiling counters. They are diagnostic and may change as the solver is reorganized.

## Current Benchmark Gate

Run the fixed 120s milestone gate with:

```powershell
node .\scripts\bandori-medley-hard-case-benchmark.cjs gate-120
```

The gate asserts:

- `all-300`: fixed 10-profile all-mode sample proves exact within 300s per profile.
- Known locked/single hard cases prove exact within 120s.

For shorter checks while developing UI wiring:

```powershell
node .\scripts\bandori-medley-hard-case-benchmark.cjs p05-visual
node .\scripts\bandori-medley-hard-case-benchmark.cjs p01-locked
```

Latest recorded evidence is in `documents/bandori-team-builder/medley-real-profile-benchmark-2026-05-31.md`.

## Frontend Requirements Before Shipping

- Long searches need visible running state, elapsed time, and cancellation.
- Exact/bounded status must be explicit; bounded results must not be labeled as globally optimal.
- Locked area-item controls should state their scope, because locked exact only proves that subspace.
- All-mode should be treated as an advanced/proof mode because hard real profiles can take close to three minutes.
