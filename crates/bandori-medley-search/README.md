# Bandori medley search

This crate is the greenfield boundary for the exact three-team medley search. Its runtime depends on `bandori-medley-model`, not on the existing TypeScript team-builder. The transparent `bandori-medley-reference` scorer is a development-only oracle.

The public boundary defines:

- a strict, versioned normalized search input;
- exact versus incomplete result semantics;
- stable input errors with field paths;
- a platform-independent memory budget and cancellation/timeout poll.

The normalized input contains owned physical cards, hard-exclusion flags, card and event parameters, four resolved team-context skill rows, owned area-item rows, every legal shared area configuration, and exactly three ordered normalized songs. It does not accept teams, leaders, or one caller-selected final area configuration. Those are search outputs; member index two is the leader.

Area-item IDs inside each configuration and output member IDs preserve their supplied operation order. Validation does not sort or repair the input. An empty selected-item list is valid when it is supplied as one legal configuration.

The crate contains the independent exact scorer, a proved contextual upper bound, character-group candidate traversal, and a compact three-view exact join. The scorer is bit-for-bit checked against the transparent reference scorer, while tiny whole searches are checked against an independent exhaustive oracle.

The candidate-memory budget covers compact rows and their three index views. Worker/API adapters, frontend integration, rich-result hydration, and command-line interfaces remain outside this checkpoint.
