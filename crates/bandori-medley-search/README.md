# Bandori medley search

This crate is the greenfield boundary for the exact three-team medley search. Its runtime depends on `bandori-medley-model`, not on the existing TypeScript team-builder. The transparent `bandori-medley-reference` scorer is a development-only oracle.

The first checkpoint defines only:

- a strict, versioned normalized search input;
- exact versus incomplete result semantics;
- stable input errors with field paths;
- a platform-independent memory budget and cancellation/timeout poll.

The normalized input contains owned physical cards, hard-exclusion flags, card and event parameters, four resolved team-context skill rows, owned area-item rows, every legal shared area configuration, and exactly three ordered normalized songs. It does not accept teams, leaders, or one caller-selected final area configuration. Those are search outputs; member index two is the leader.

Area-item IDs inside each configuration and output member IDs preserve their supplied operation order. Validation does not sort or repair the input. An empty selected-item list is valid when it is supplied as one legal configuration.

This checkpoint intentionally has no production scorer, candidate representation, upper bound, enumeration, join, cache, worker/API adapter, frontend integration, or command-line interface. Those responsibilities enter only in separately reviewed checkpoints.
