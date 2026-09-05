---
paths:
  - "crates/bandori-medley-*/**"
  - "Cargo.toml"
  - "Cargo.lock"
  - "rust-toolchain.toml"
  - "src/lib/bandori/medley-foundation/**"
  - "src/lib/bandori/medley-wasm/**"
  - "src/app/**/teambuilder/team-search-worker.ts"
  - "tests/bandori-medley-*.test.mjs"
  - "scripts/*bandori-medley*.mjs"
  - "documents/bandori-team-builder/medley-*.md"
---

# Medley Correctness and Delivery Rules

- Preserve the versioned normalized-input and scoring contracts in [Medley Rules and Scoring](../../documents/bandori-team-builder/medley-foundation.md). Rust internals follow Rust naming conventions; serialized names follow the existing wire contract.
- `exact` requires complete search or justified safe pruning. Time/resource exhaustion must preserve `incomplete` and its reason. Unproven or numerically unsafe bounds cannot prune; finding a high score or several solutions does not prove optimality or a complete ranking. Follow [Medley Search](../../documents/bandori-team-builder/medley-search.md).
- Match verification to the affected boundary: source normalization/scoring, search completeness, or Worker/WASM delivery. Preserve independent exhaustive/reference checks and equality cases for changed scoring or bounds; performance gains do not excuse weaker proof semantics. Rust test/reference-only edits need relevant native tests and formatting/lint checks, not automatic WASM checks; prose-only edits need documentation review.
- Check WASM compilation when production Rust, dependencies, configuration, or toolchain changes affect that target. Regenerate the committed package when shipped Rust behavior or build inputs change, and verify its actual browser binding, progress, terminal status, and hydration; a native test or Next.js build does not execute that path.
- Use the focused public checks in [Medley Testing](../../documents/bandori-team-builder/medley-testing.md). Private full-profile runs are task-specific, not a default prerequisite. Keep private inputs/results out of commits, and state input/data/code provenance for comparisons.
