# Bandori medley normalized model

`bandori-medley-model` defines and validates the normalized input for scoring three already selected teams. It is the shared fixed-team data contract used by the reference and production scorers; it does not search a roster.

The input contains:

- exactly three ordered songs;
- exactly three explicitly supplied five-card teams;
- one unique physical card instance per medley position and five unique characters per team;
- an exact decimal PERFECT probability;
- one finite, already calculated `deckTotalParameter` per team;
- resolved score skills; and
- finite Bestdori-compatible note timestamps with exactly six skill triggers per song.

The scoring rule identifier is `hhwx-medley-bestdori-v3`. Older normalized inputs must be rebuilt from their raw sources when the rule version changes. Unknown JSON fields and unsupported schema or rule versions fail validation.

The model deliberately excludes raw UI state, profiles, master records, search limits, pruning settings and network behavior. The TypeScript adapter under `src/lib/bandori/medley-foundation/` owns profile/master decoding and produces this fixed contract.

See [Bandori Medley Team Builder: Rules and Scoring](../../documents/bandori-team-builder/medley-foundation.md) for the formulas and source-data rules. The tiny fixture under `tests/fixtures/` verifies the complete JSON boundary without requiring roster search.
