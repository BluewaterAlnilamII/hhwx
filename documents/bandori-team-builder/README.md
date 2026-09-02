# Bandori Team Builder Documentation

## Current Contracts

- `single-song-algorithm.md` and `single-song-algorithm.zh-CN.md` define the existing single-song calculator.
- `../bandori-medley-foundation.md` and `../bandori-medley-foundation.zh-CN.md` define the greenfield medley input and scoring contract.
- `../bandori-medley-search.md` and `../bandori-medley-search.zh-CN.md` define the greenfield exact-search and browser result contract.
- `../bandori-medley-fixtures.md` and `../bandori-medley-fixtures.zh-CN.md` describe the retained real-profile fixtures.

The TypeScript `core/` and `single/` modules serve the single-song calculator. Medley search runs independently in the Rust workspace and is exposed to the page through its WebAssembly worker package.

## Historical Evidence

The dated medley reports in this directory are retained as read-only evidence of the removed solver. They are not current architecture or product contracts:

- `medley-40-exact-report-*.md`
- `medley-optimization-review-2026-05-22.md`
- `medley-proof-frontier-ledger-analysis-2026-06-08.md`
- `medley-real-profile-benchmark-2026-05-31.md`

Temporary runners, raw benchmark output, profile payloads, and caches remain under ignored `temp/bandori-team-builder/` paths.
