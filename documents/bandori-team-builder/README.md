# Bandori Team Builder Documentation

## Current Contracts

- `single-song-algorithm.md` and `single-song-algorithm.zh-CN.md` define the existing single-song calculator.
- `medley-foundation.md` and `medley-foundation.zh-CN.md` define the independent medley input and scoring contract.
- `medley-search.md` and `medley-search.zh-CN.md` define the exact-search and browser result contract.
- `medley-testing.md` and `medley-testing.zh-CN.md` define the private-fixture regression procedure and evidence limits.

The TypeScript `core/` and `single/` modules serve the single-song calculator. Medley search runs independently in the Rust workspace and is exposed to the page through its WebAssembly worker package.

Dated experiment reports are not current documentation; Git history retains them. Private fixtures, raw benchmark output, run reports, and caches remain under ignored `temp/` paths.
