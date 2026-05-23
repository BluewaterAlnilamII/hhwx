# Bandori Team Builder Documentation Index

This directory keeps the durable design notes for the HHWX Bandori team builder.
Temporary runners, fixtures, raw benchmark output, and Bestdori caches live under
`temp/bandori-team-builder/` and are not treated as product documentation.

## Code Structure

The team-builder code is split into four layers:

- `src/lib/bandori/team-builder/core/`: shared game-rule and scoring primitives used by both single-song and medley search. This layer owns card preparation, chart preparation, event handling, score calculation, five-card team evaluation, common upper bounds, and shared data contracts. It must not import `single`, `medley`, or `shared`.
- `src/lib/bandori/team-builder/single/`: single-song search orchestration and helpers. This layer owns single-only scopes, seed teams, result ordering, stats finalization, objective policy, and exact DFS.
- `src/lib/bandori/team-builder/medley/`: medley search orchestration and helpers. This layer owns three-song slot preparation, shared area-item configuration search, cross-slot card-disjoint DFS, medley upper bounds, witness diagnostics, and opt-in experimental solvers.
- `src/lib/bandori/team-builder/shared/`: legacy compatibility facade. New internal code should import from `core`, `single`, or `medley` directly.

Public compatibility entrypoints remain:

- `src/lib/bandori-team-search.ts`
- `src/lib/bandori-medley-team-search.ts`

## Documents

- `algorithm-notes.md`: single-song exact search formulas, event point behavior, support band handling, and correctness notes.
- `single-song-search-optimization.md`: single-song search optimization notes, cache strategy, pruning strategy, and remaining work.
- `benchmark-results-and-next-plan.md`: benchmark results, Supabase-backed sample matrix, Bestdori compatibility baseline, and release gates.
- `medley-algorithm-notes.md`: medley-specific problem model, scoring consistency, upper-bound strategy, and benchmark commands.
- `medley-optimization-review-2026-05-22.md`: 30s/120s medley optimization review matrix and conclusion report.
- `public-algorithm-report.md`: public English algorithm report.
- `public-algorithm-report.zh-CN.md`: public Chinese algorithm report matching the English report structure.

## Maintenance Rules

- Update `algorithm-notes.md` when score, event point, support band, or pruning correctness changes.
- Update `single-song-search-optimization.md` when single-search upper bounds, compression, caches, or seed logic change.
- Update `medley-algorithm-notes.md` when medley slot construction, shared area-item decisions, cross-slot DFS, medley upper bounds, or experimental solvers change.
- Update benchmark reports only when benchmark methodology, result matrix, or compatibility baseline changes.
- Keep module header comments short and explicit: state ownership, correctness boundaries, and whether a helper is heuristic, diagnostic, or proof-critical.
