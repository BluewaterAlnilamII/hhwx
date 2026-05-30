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

- `single-song-algorithm.md`: canonical single-song algorithm specification, including formulas, event point behavior, support band handling, exact search contract, performance design, correctness notes, validation gates, and benchmark boundaries.
- `single-song-algorithm.zh-CN.md`: Chinese version of the canonical single-song algorithm specification.
- `medley-algorithm-notes.md`: medley-specific problem model, scoring consistency, upper-bound strategy, and benchmark commands.
- `medley-optimization-review-2026-05-22.md`: 30s/120s medley optimization review matrix and conclusion report.

## Maintenance Rules

- Update `single-song-algorithm.md` and `single-song-algorithm.zh-CN.md` together when single-song score formulas, event point behavior, support band handling, exact/bounded semantics, upper bounds, compression, caches, seed logic, validation gates, or benchmark interpretation changes.
- Update `medley-algorithm-notes.md` when medley slot construction, shared area-item decisions, cross-slot DFS, medley upper bounds, or experimental solvers change.
- Update dated medley review reports only when their benchmark methodology, result matrix, or compatibility baseline changes.
- Keep module header comments short and explicit: state ownership, correctness boundaries, and whether a helper is heuristic, diagnostic, or proof-critical.
