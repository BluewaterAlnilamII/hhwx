# Bandori medley normalized model

This crate defines the first executable boundary of the greenfield medley foundation. It accepts only a fully resolved, fixed evaluation:

- exactly three ordered songs;
- exactly three explicitly supplied five-card teams;
- one unique physical card instance per medley position;
- one unique character per team;
- exact decimal PERFECT probability;
- one finite Bestdori-compatible deck-total parameter per already selected team;
- finite Bestdori master skill-rate values;
- Bestdori-compatible second timestamps with exactly six skill triggers per song.

`isRateUpWithPerfect` enables Bestdori's fixed note-count formula. Callers do not supply stack amounts or maximum percentages. The scoring rule identifier is `hhwx-medley-bestdori-v1`.

It is not a search request. There are no candidate limits, result counts, time budgets, memory budgets, pruning switches, or solver modes in the schema. Unknown JSON fields and unsupported schema/rules versions fail closed.

## Input ownership boundary

The input pipeline decodes the existing HHWX profile and constructs this model from raw card, character, skill, area-item, event, song and chart records. The profile's `bestdoriProfile` field contains compressed card/item data; HHWX's top-level `characterPotentials` and `characterMissionBonuses` supply character bonuses. The pipeline resolves parameters, the selected area configuration, full-team skill conditions and charts before this boundary.

The fixed-evaluation boundary carries the final JavaScript-number deck parameter produced by the Bestdori-compatible input pipeline. Native-client floating-point and random-order differences are documentation-only and do not alter this calculator contract.

The model intentionally does not accept raw UI state or upstream API payloads. Keeping those concerns outside the scorer prevents network timing and profile encoding details from changing score semantics.

The retained JSON fixture under `tests/fixtures/` is deliberately tiny: fifteen already selected cards and seven normalized notes per song. It proves the complete fixed-input boundary without exercising any search space.
