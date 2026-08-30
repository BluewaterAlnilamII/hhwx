# Greenfield Bandori Medley Foundation

中文说明见 [bandori-medley-foundation.zh-CN.md](bandori-medley-foundation.zh-CN.md).

## Checkpoint and authority

This document defines the first independent checkpoint of the new medley team calculator. The implementation was written on `dev/medley-v2-greenfield` from an `origin/main` starting point, but it does not import, wrap, refactor, or otherwise reuse the existing team-builder scorer or search implementation. A recursive source guard enforces that boundary for `src/lib/bandori/medley-foundation/`.

The checkpoint is deliberately fixed and small:

- exactly 15 already selected, owned cards;
- exactly three explicit five-card teams;
- exactly three explicit songs and charts;
- one shared, explicitly selected area-item configuration;
- a transparent reference score, not a team search.

There is no candidate generation, roster enumeration, area-item search, ranking, pruning, proof protocol, time or memory budget, cancellation, or partial-result behavior. A roster near 2,000 cards is a future hard acceptance case, not an early test, default input, or implied memory target. Search architecture starts only after a separate design review.

Every completed foundation module has its own traceable commit. Future implementation should continue to commit after each reviewable module so audits and rollback do not depend on reconstructing a large mixed patch.

The executable calculator contract follows Bestdori semantics. Native-client findings are retained below only as a difference log; they must not change code unless the product semantics are explicitly reconsidered.

## Source input boundary

`hhwx-medley-foundation-source-v1` accepts the real fixed-input ingredients rather than caller-computed card or team totals:

- the decompressed HHWX user profile payload: its `bestdoriProfile` subobject uses Bestdori compression v2 for card levels, master ranks, skill levels, episodes, training/art/exclusion flags, and area-item levels, while `characterPotentials` and `characterMissionBonuses` are read only from the HHWX payload's top level;
- raw card, character, skill, area-item, song, and event-bonus records; Cards `serverExtensions` are resolved for the profile server with the established JP-presence fallback before parameters or skills are read;
- one explicit list of selected area-item IDs shared by all three teams;
- three ordered lists of five selected card IDs, where member index two is the leader;
- three song IDs kept as text until strict positive-u32 parsing, difficulties, and Bestdori-shaped charts;
- a PERFECT percentage kept as decimal text until conversion to a canonical exact probability.

The boundary requires all 15 selected cards to be owned by the profile, a physical card to appear only once across the medley, and each fixed team to contain five distinct characters as required by the normalized Rust contract. The decoded exclusion flag remains available as profile data but is a search preference and does not change an explicitly fixed score input. Missing selected master rows, malformed profile compression, invalid references, non-canonical decimal input, unsupported foundation-envelope fields, and unsupported schema versions fail with a stable code and field path. Unused fields inside raw master rows remain tolerated. They are input failures, never “no solution.” Temporary cards and search candidates are intentionally absent from this checkpoint.

The normalized Rust contract is `hhwx-medley-scoring-input-v1`. It contains dense instance IDs `0..14`, three final deck parameters, resolved score skills, three normalized charts, and the exact PERFECT probability. It contains no UI, network, profile-compression, or search state.

## Parameter derivation

The source adapter derives the complete fixed-team parameter from raw records:

1. It reads the level-one and overall-maximum P/T/V rows from the Cards aggregate, then reconstructs an intermediate selected level with Bestdori's rarity curve and JavaScript `Math.round`.
2. It adds `50 * rarity * masterRank` to each parameter.
3. It adds training and the selected number of episode bonuses.
4. It converts compact mission units from tenths of a percentage point, then applies character potential, collection-mission, and training-mission bonuses, flooring each supported bonus contribution before addition.
5. It evaluates every explicitly selected, owned area item from its profile level, regional per-level P/T/V rates, target attribute, and target band.
6. It evaluates raw event attribute, character, canonical member `situationId`, master-rank, matching-parameter, and room-parameter percentages. Their JavaScript-number contributions remain unrounded at this boundary, matching the current Bestdori calculator.
7. It adds card power, selected area-item power, and event power as JavaScript `Number` values to obtain `deckTotalParameter`.

The level curves and current calculator behavior were independently checked against Bestdori's `app.d390adb1.js` bundle, module `c0f0`, fetched on 2026-08-30 with SHA-256 `ac84605d7889e53c0144ab7c41e379c174b94b8dc31edae07f3483b8a0610778`. This is also consistent with the [Bestdori Cards API contract](https://github.com/windowssov8forus/bestdori-api/blob/main/docs/api/cards.md): the compact Cards response exposes minimum and maximum parameters rather than every selected-level row.

Skill scalar lookup uses the profile server and falls back to JP only when the selected regional slot is missing. An explicit regional zero remains zero. Area-item rates instead stay on the exact profile server and walk down to the nearest available owned level; they do not borrow another server's rate. The adapter does not accept precomputed card P/T/V, area-item totals, event totals, or deck totals from its caller.

## Skill normalization without life state

The scorer accepts only these team-context-resolved behaviors:

- `neutral`;
- `score`;
- `score_on_perfect`;
- `perfect_only`;
- `continued_perfect`, with separate active and ordinary fallback values;
- `great_or_worse_half`;
- optional `rate_up_with_perfect` on an unconditional `score` behavior.

The source adapter reads raw score effects in their Bestdori source order and uses the first recognized score row, including an explicit zero value. Same-band or same-attribute unification may replace that first value after all five cards are known. A continued skill keeps the later ordinary score row as its fallback. PERFECT rate-up adds `0.5` percentage points on the current PERFECT, retains the accumulator across GREAT, and caps total score-up at the base value plus `50`.

There is no life model or life input. Raw Bestdori keys named `score_over_life` and `score_under_life` stay in source order and are normalized as ordinary score rows, exactly as in the current Bestdori calculator; no threshold, assumed life value, inherited life, or life state enters the scoring contract.

## Chart normalization

The chart adapter follows Bestdori entity and property-presence behavior:

- `Single` and `Directional` contribute one scoring note;
- `Long` contributes its first and last connections;
- `Slide` contributes both endpoints and each middle connection that does not carry the `hidden` property;
- `BPM` controls beat-to-second integration;
- other entity types, including `System`, do not score and are ignored;
- presence of the `skill` property marks a trigger, even when its value is `false`.

Notes are sorted by beat with triggers first at an equal beat. The output uses finite non-negative JavaScript-number seconds and dense note IDs. Each song must contain exactly six skill triggers. Difficulty and `playLevel` come from the raw song master; level 5 is valid.

## Bestdori-compatible score

All arithmetic before integer score conversion uses JavaScript-number-compatible IEEE-754 binary64 behavior:

```text
playLevelRate = 1 + (playLevel - 5) / 100
baseScorePerNote = deckTotalParameter * playLevelRate / noteCount * 3

innerScore(PERFECT) = floor(baseScorePerNote * 1.1 * comboRate)
innerScore(GREAT)   = floor(baseScorePerNote * 0.8 * comboRate)

finalNoteScore = floor(innerScore * combinedSkillMultiplier)
```

The two integer floors are part of the contract. Each realized integer note score must fit an unsigned 32-bit value; a non-finite, negative, or overflowing intermediate fails evaluation rather than wrapping. Combo carries across the three songs because the model contains only PERFECT and GREAT:

```text
combo <= 20    : 1.00
combo <= 50    : 1.01
combo <= 100   : 1.02
combo <= 300   : 1.01 + floor((combo - 1) / 50)  * 0.01
combo <= 3000  : 1.04 + floor((combo - 1) / 100) * 0.01
otherwise      : 1.34
```

`hhwx-medley-pg-expected-v1` is explicitly a PERFECT/GREAT-only expectation model. It excludes GOOD, BAD, MISS, combo breaks, life loss, and life inheritance. It computes integer note scores on each P/G branch before taking expectations; it does not insert an averaged judgment multiplier before flooring. Continued and PERFECT-rate-up state is propagated through a deterministic state distribution.

The first five skill triggers use all `5! = 120` member orders with equal probability. The sixth trigger always reuses member index two, the leader. One song result is the stable-order mean of all 120 P/G expectations, and the medley objective is the sum of the three song means.

A newly triggered skill excludes the trigger note and every note at exactly the same timestamp. Its end time is `triggerSeconds + durationSeconds + 0.00001`, matching the Bestdori calculator boundary. When multiple windows overlap, every active skill advances independently and their percentage deltas are added directly before one final floor:

```text
combinedSkillMultiplier = max(0, 1 + sum(skillMultiplier_i - 1))
```

There is no replacement, priority, or life-dependent overlap branch.

## Native-game difference log

The earlier native audit used JP client 10.1.3, JP master artifact `20260805110509`, and skill-effect artifact SHA-256 `d98e76c0198a6a714be1d38e4696a044242c8384b905426a311c8c2b0961aebc`. It found behaviors that are intentionally not implemented in this Bestdori-compatible calculator:

- the native skill-order path uses a biased 1,024-path process with only 96 reachable first-five permutations, while this calculator uses the confirmed 120 equiprobable orders;
- the native score chain and combo source use single precision and a master table, while this calculator uses Bestdori’s JavaScript-number formula above;
- the native game has life-conditioned trigger behavior, while this calculator has no life semantics at all;
- native skill-window timing and conflict handling are frame/runtime concerns, while this calculator uses Bestdori timestamps and direct-add overlap.

These are provenance notes, not implementation TODOs. No native difference may be copied into the scorer as a local “accuracy optimization” without a new product-level semantic decision and full architecture review.

## Executable evidence and stop line

The retained source fixture is a synthetic wiring golden with exactly 15 profile cards, raw card/character/skill/song records, three explicit teams, and seven notes per song. The TypeScript tests require its normalized result to equal the Rust JSON fixture field for field. Rust then validates that fixture and evaluates all three songs. A second tiny source-path case adds one owned area item and canonical event rows so non-zero raw area/event inputs are proven end to end without expanding into search. Additional tests cover profile RLE failures, Bestdori intermediate-level reconstruction, Cards regional override and JP fallback, raw parameter derivation, chart property-presence rules, card reuse, the leader’s sixth trigger, continued and rate-up state, combo carry, two-floor arithmetic, 120-order determinism, and direct-add overlaps.

The reference scorer returns an audit trace containing base P/G note scores, per-order expected scores, combo offsets, peak state count, and exact binary64 words for floating results. It is deliberately transparent rather than optimized.

This checkpoint stops here. Before any roster, candidate layout, pruning rule, cache, dominance relation, parallel search, proof certificate, memory budget, or production result protocol is added, the search architecture must be discussed and reviewed as a separate phase. The current foundation neither recommends nor silently constrains that future design.
