# Bandori medley normalized model

This crate defines the first executable boundary of the greenfield medley foundation. It accepts only a fully resolved, fixed evaluation:

- exactly three ordered songs;
- exactly three explicitly supplied five-card teams;
- one unique physical card instance per medley position;
- one unique character per team;
- exact decimal PERFECT probability;
- one bit-exact finite `f32` deck-total parameter per already selected team;
- bit-exact finite `f32` skill-rate values;
- normalized integer-microsecond note times with exactly six skill triggers per song.

It is not a search request. There are no candidate limits, result counts, time budgets, memory budgets, pruning switches, or solver modes in the schema. Unknown JSON fields and unsupported schema/rules versions fail closed.

## Input ownership boundary

The web input pipeline will own acquisition and provenance before constructing this model. That pipeline must snapshot the selected profile server, the owned and temporary roster, card preferences, the shared area-item configuration, the current medley event, the three song selections, relevant regional master records, and chart payload fingerprints. It must then resolve regional fallbacks, card parameters, the audited client-order deck total, team-context skill branches, chart entities, and source identities into this DTO.

The fixed-evaluation boundary carries the final deck-level `f32` parameter because that is what the audited game score utility consumes. It does not recombine per-card or per-stat values in a different floating-point order. A future search input will need its own auditable card/stat representation; that architecture is intentionally not guessed here.

The model intentionally does not accept raw UI state or upstream API payloads. Keeping those concerns outside the scorer prevents network timing, source object ordering, profile identifiers, and legacy team-search types from changing score semantics.

The retained JSON fixture under `tests/fixtures/` is deliberately tiny: fifteen already selected cards and seven normalized notes per song. It proves the complete fixed-input boundary without exercising any search space.
