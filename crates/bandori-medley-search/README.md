# Bandori medley search

This crate is the greenfield boundary for the exact three-team medley search. Its runtime depends on `bandori-medley-model`, not on the existing TypeScript team-builder. The transparent `bandori-medley-reference` scorer is a development-only oracle.

The public boundary defines:

- a strict, versioned normalized search input;
- exact versus incomplete result semantics;
- stable input errors with field paths;
- a platform-independent memory budget and cancellation/timeout poll.

The normalized input contains owned physical cards, hard-exclusion flags, card and event parameters, four resolved team-context skill rows, owned area-item rows, every legal shared area configuration, and exactly three ordered normalized songs. It does not accept teams, leaders, or one caller-selected final area configuration. Those are search outputs; member index two is the leader.

Area-item IDs inside each configuration and output member IDs preserve their supplied operation order. Validation does not sort or repair the input. An empty selected-item list is valid when it is supplied as one legal configuration.

The exact scorer prepares chart boundaries once and adds independently rounded window contributions, including overlaps. It calculates the 120-order expectation directly without enumerating those orders in production. It uses the average-multiplier rules in [the foundation contract](../../documents/bandori-medley-foundation.md), with no P/G history state, and is bit-for-bit checked against the transparent reference.

The search combines a contextual upper bound, three partial character-group teams, short-lived exhaustive blocks and a bounded score cache. Tiny searches are checked against an independent exhaustive oracle. The storage budget covers rows, sorting indexes and the score cache, not input/model data or chart-sized scoring scratch. See [the search design](../../documents/bandori-medley-search.md) for proof and resource semantics.

For current-search diagnosis, `node --import tsx scripts/compare-bandori-medley-search.mjs --diagnose` runs the retained 119/961-card no-event inputs for 60 seconds each. Phase timers compile only into the native diagnostic test; production search and public result fields are unchanged. Results are not compared with historical solvers or scores.

Worker/API adapters, frontend integration, rich-result hydration and command-line interfaces remain outside this checkpoint.
