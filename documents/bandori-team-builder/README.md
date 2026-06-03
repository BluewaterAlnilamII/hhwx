# Bandori Team Builder Documentation Index

This directory keeps the durable design notes for the HHWX Bandori team builder.
Temporary runners, fixtures, raw benchmark output, and Bestdori caches live under
`temp/bandori-team-builder/` and are not treated as product documentation.
The tracked wrapper `scripts/bandori-medley-hard-case-benchmark.cjs` pins the
current hard-case medley benchmark scenarios while keeping real profile payloads
in ignored local fixtures.

## Code Structure

The team-builder code is split into three internal layers:

- `src/lib/bandori/team-builder/core/`: shared game-rule and scoring primitives used by both single-song and medley search. This layer owns card preparation, chart preparation, event handling, score calculation, five-card team evaluation, common upper bounds, and shared data contracts. It must not import `single` or `medley`.
- `src/lib/bandori/team-builder/single/`: single-song search orchestration and helpers. This layer owns single-only scopes, seed teams, result ordering, stats finalization, objective policy, and exact DFS.
- `src/lib/bandori/team-builder/medley/`: medley search orchestration and helpers. This layer owns three-song slot preparation, shared area-item configuration search, cross-slot card-disjoint DFS, medley upper bounds, witness diagnostics, and opt-in experimental solvers. The exact candidate-join solver keeps proof-critical logic in `experiments/exact-candidate-join.ts`, with constants, heap helpers, and candidate bitset helpers split into adjacent internal modules.

Public compatibility entrypoints remain:

- `src/lib/bandori-team-search.ts`
- `src/lib/bandori-medley-team-search.ts`

## Documents

- `single-song-algorithm.md`: canonical single-song algorithm specification, including formulas, event point behavior, support band handling, exact search contract, performance design, correctness notes, validation gates, and benchmark boundaries.
- `single-song-algorithm.zh-CN.md`: Chinese version of the canonical single-song algorithm specification.
- `medley-algorithm.md`: canonical medley algorithm specification, including problem definition, scoring model, exact/bounded contract, proof strategy, validation gates, and implementation ownership.
- `medley-algorithm.zh-CN.md`: Chinese version of the canonical medley algorithm specification.
- `medley-algorithm-notes.md`: historical medley optimization notes, dated experiment context, proof-gap investigations, and maintenance context that should not be treated as the frontend or algorithm contract.
- `medley-frontend-contract.md`: stable medley request/response fields, preview UI binding, proof-status display semantics, memory/debug reporting, and frontend readiness checklist.
- `medley-real-profile-benchmark-2026-05-31.md`: live `user_game_profiles` sample benchmark for all-configuration medley exact-proof performance, including 60s/120s completion counts, the 2026-06-02 four-event matrix, bounded-case causes, and the current per-configuration bottleneck.
- `medley-optimization-review-2026-05-22.md`: 30s/120s medley optimization review matrix and conclusion report.

## Hard-Case Benchmark Wrapper

The fixed real-profile medley benchmark uses the local ignored fixture
`temp/bandori-team-builder/hard-case-profiles-2026-05-31.json` and fixed songs
`385,193,619`. Run scenarios through:

```powershell
node .\scripts\bandori-medley-hard-case-benchmark.cjs <scenario>
```

Core scenarios are `focus-6-300`, `all-300`, `gate-120`, `p01-locked`,
`p01-visual`, `p01-performance`, `p01-technique`, `p05-visual`, and
`p09-visual`. Additional trace-only scenarios exist for bounded-case
investigation. The wrapper delegates to the ignored local
runner under `temp/bandori-team-builder/` so benchmark payloads stay out of Git.
It also asserts the expected exactness, elapsed-time, bounded-gap, and memory
reporting gates after each run where the scenario defines them.

For current all-scope optimizer work, run `focus-6-300` before the full matrix.
It covers the six retained focus cases `P02:260`, `P04:260`, `P08:323`,
`P10:244`, `P04:244`, and `P08:260`, writes JSON/Markdown focus reports, and
records peak working set in MiB. If the focus set is acceptable, run `all-300`
for the full P01-P10 x `none`/`244`/`260`/`323` matrix at 300s per case. The
latest retained 2026-06-02 baseline records `36/40` exact with no timeouts, P95
`231981ms`, max `295714ms`, and bounded-gap total `1534986`.

`gate-120` remains the composite regression gate: it runs `all-300` plus the
known locked/single hard cases. During UI wiring, use `p05-visual` and
`p01-locked` as shorter spot checks.

## Maintenance Rules

- Update `single-song-algorithm.md` and `single-song-algorithm.zh-CN.md` together when single-song score formulas, event point behavior, support band handling, exact/bounded semantics, upper bounds, compression, caches, seed logic, validation gates, or benchmark interpretation changes.
- Update `medley-algorithm.md` and `medley-algorithm.zh-CN.md` together when medley slot construction, shared area-item decisions, exact/bounded semantics, cross-slot DFS, medley upper bounds, validation gates, or implementation ownership changes.
- Update `medley-algorithm-notes.md` when preserving historical experiment context or proof-gap investigation details that are too dated or verbose for the canonical medley document.
- Update dated medley review reports only when their benchmark methodology, result matrix, or compatibility baseline changes.
- Keep module header comments short and explicit: state ownership, correctness boundaries, and whether a helper is heuristic, diagnostic, or proof-critical.
