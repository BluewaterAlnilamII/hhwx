# Greenfield Bandori Medley Foundation

中文说明见 [bandori-medley-foundation.zh-CN.md](bandori-medley-foundation.zh-CN.md).

## Authority and scope

This is the shared input and scoring contract for the new calculator on `dev/medley-v2-greenfield`. The implementation is written independently: it does not import, wrap or refactor the existing team-builder scorer or search. Existing HHWX input and product rules remain authoritative; old solver and experiment architectures do not. The source guard enforces the TypeScript import boundary.

The scoring method uses Bestdori's average judgment and skill multipliers, together with the explicitly agreed HHWX medley rules below. It is not a simulation of native gameplay, nor a byte-for-byte copy of Bestdori's single-song calculator. Native findings remain documentation-only unless the product rules are explicitly reconsidered.

Keep each completed, reviewable module in a traceable commit. Rewrite obsolete documentation in place; implementation history belongs in Git, not accumulating correction sections. Reviewers must read this contract and the current greenfield code, and the primary agent must independently verify their conclusions.

## Inputs and ownership

The caller supplies the existing HHWX profile, raw masters, three ordered songs/charts, event settings and PERFECT percentage text. It does not calculate card parameters, bonuses or team totals.

- The HHWX profile's field named `bestdoriProfile` stores compression-v2 card ownership/levels, master and skill levels, episodes, training/art/exclusion flags, and area-item levels. This is a field of HHWX's own profile, not an alternative Bestdori import/export input.
- Character potential and mission bonuses come from the HHWX profile's top-level `characterPotentials` and `characterMissionBonuses`.
- Raw card, character, skill, area-item, song and event records remain the sources of parameters. Cards server extensions are resolved for the profile server, with the existing JP-presence fallback.
- Song IDs are parsed as positive u32 values. PERFECT percentage text becomes a canonical decimal probability before scoring.

`hhwx-medley-search-source-v1` prepares the whole owned roster and legal owned-item configurations. A temporary card is keyed by master card ID: selecting the same ID edits that temporary record, and the temporary record replaces any profile-owned card with the same ID for the calculation. Exclusion controls apply only to profile-owned cards and do not exclude the temporary replacement. Teams, leaders and the final shared area selection are search outputs, never required frontend inputs.

`hhwx-medley-foundation-source-v1` is the small fixed-team verification entry: it additionally takes 15 selected owned cards, three explicit teams and one area configuration. Its normalized Rust input, `hhwx-medley-scoring-input-v1`, contains dense instance IDs, resolved skills, final team parameters and charts. It is a reference-scoring tool, not the search request.

Malformed profile compression, missing selected master rows, invalid references, unsupported envelope fields or versions fail with an error code and field path. Unused raw-master fields are tolerated. Input errors are not “no solution.” A fixed team can be scored regardless of its exclusion flags; search hard-excludes flagged cards before candidate construction.

## Locked product rules

- Exactly three ordered song slots; repeats are allowed, reordering is not.
- Five distinct characters per team; no physical card repeats across the three teams. The leader occupies member index two in output.
- All teams share one algorithm-selected owned-item configuration: one band group, one attribute group and one owned parameter item. A category is empty only when no item in it is owned; do not add an unequipped parameter choice alongside owned ones. Full ownership gives 9 band groups × 4 attributes × 3 parameter items = 108 configurations. CN metadata-only IDs 59, 68 and 72 remain outside the calculator.
- The formal objective is a proven top-1 total average score, with a deterministic representative on ties. Maximum possible score is not a second objective.
- Medley event points are display-only and do not affect search. All three songs use the same selected live boost: the UI shows 0/3/6/9 total boosts with multipliers 3/15/30/45, defaulting to 9. The displayed value is `(floor(totalAverageScore / 18500) + 100) * multiplier`.
- Search passively retains at most the ten highest-total-average solutions, including the winner, among complete solutions it already scored and confirmed feasible. Retention does not enter pruned branches or turn this set into a proven global top-10.
- After search terminates, only those retained solutions receive result hydration: minimum, average and maximum score for each song and for the medley total, plus each song's best order and occurrence count. The highest hydrated total maximum score selects the maximum-score candidate. Search elapsed time ends before this hydration.
- Best-result progress is first eligible after ten seconds and is published at most once per five seconds thereafter. Improvements inside that interval are coalesced; the pending newest best result must be published at the next eligible update even if no later improvement occurs. A graceful incomplete outcome returns any retained candidates with the same hydration, but they remain diagnostic rather than exact.
- Official success requires exhausting or safely pruning the whole space. Cancellation, timeout, memory, data or runtime failure is incomplete; `bestSoFar` is diagnostic only. There is no gap-based success.
- Preserve member, area-item and floating-point operation order when calculating scores.

Around 2,000 cards is a difficult future acceptance case, not the early/default test size. Its targets remain 300 seconds, competitive incremental memory of 200–300 MiB, and a hard incremental peak below 1 GiB. Tiny inputs establish correctness first; timeout never counts as success.

The provisional search direction is joint three-team allocation bounds, forward/backward reuse to prune card destinations including non-use, bounded complete-solution construction and one-sweep improvements, and short-lived exhaustive blocks with budgeted caches. Useful memory reuse takes priority over minimum RSS. These are revisable engineering decisions, not game rules. Details belong in [the search design](bandori-medley-search.md).

## Parameters, skills and charts

The source adapter derives parameters in this order:

1. Reconstruct the selected card level from the Cards minimum/maximum P/T/V rows using Bestdori's rarity curve and JavaScript `Math.round`.
2. Add `50 * rarity * masterRank` to each parameter, then training and completed episode bonuses.
3. Convert compact mission units from tenths of a percentage point. Combine collection and training mission rates, add the potential rate, then calculate each P/T/V bonus as `floor(baseParameter * (potentialRate + missionRate))`. This is the chosen HHWX calculator rule, not an independently verified native-game rounding claim. Equal P/T/V values do not select a different rule.
4. Apply owned area items using profile levels, regional P/T/V rates, target band and attribute.
5. Apply event attribute, character, canonical member `situationId`, master-rank, matching-parameter and room percentages.
6. Add card, area and event power as JavaScript-number-compatible values to obtain `deckTotalParameter`; area/event contributions are not independently rounded here.

Skill values use the profile region and fall back to JP only for a missing slot; explicit zero stays zero. Area-item rates stay on the exact region and use the nearest available level not above the owned level.

Skill normalization takes the first recognized score row, including zero, resolves whole-team same-band/same-attribute conditions, and retains the later ordinary score as the continued skill's fallback. Behaviors are `neutral`, `score`, `score_on_perfect`, `perfect_only`, `continued_perfect` and `great_or_worse_half`. The boolean `isRateUpWithPerfect` is allowed on ordinary score; its fixed constants belong to the scorer, not caller-supplied stack/cap fields.

There is no life input or state. Raw `score_over_life` and `score_under_life` rows are ordinary score rows in source order, without threshold checks or assumed life.

Chart normalization keeps Single/Directional notes, Long endpoints, and Slide endpoints plus middle connections without a `hidden` property. Each note's time is `bpmTime + (beat - bpmBeat) * timePerBeat`, anchored at the latest BPM change, with `timePerBeat = 60 / bpm` as in Bestdori. Do not accumulate time between notes: rounding drift can exclude a note exactly at a skill endpoint. Other entities, including System, do not score. Presence of `skill` marks a trigger even if its value is false. Notes sort by beat with triggers first on ties. Every song has exactly six triggers, finite nonnegative seconds and a master-supplied play level (including level 5).

## Scoring formulas

The rule identifier is `hhwx-medley-bestdori-v3`. Let `p` be PERFECT probability and `n` the covered-note count within one activation, including the current note and starting at one:

```text
judge = 1.1 * p + 0.8 * (1 - p)
coefficient = (3 + 0.03 * (playLevel - 5)) / noteCount
base = deckTotalParameter * coefficient
innerScore = floor((base * comboRate) * judge)
windowExtra = floor(innerScore * skillMultiplier) - innerScore
songScore = sum(innerScore) + sum(windowExtra)
```

Probabilities enter the multipliers before the two floors. There is no P/G branch tree, history distribution or per-branch flooring.

For a score-up percentage `C`, the ordinary multiplier is `1 + C / 100`. Rate-up first changes `C` to `C + 0.5 * min(n, 100) * p`. Continued uses `fallback + p^n * (active - fallback)`, where active/fallback are multipliers. Conditional skills use:

```text
(1.1 * perfectMultiplier * p + 0.8 * greatMultiplier * (1 - p)) / judge
```

Equal PERFECT/GREAT multipliers are returned directly. GREAT's multiplier is 1 for `score_on_perfect`, 0 for `perfect_only`, and 0.5 for `great_or_worse_half`; their PERFECT multiplier is `1 + C / 100`.

Combo carries across all three songs:

```text
combo <= 20    : 1.00
combo <= 50    : 1.01
combo <= 100   : 1.02
combo <= 300   : 1.01 + floor((combo - 1) / 50)  * 0.01
combo <= 3000  : 1.04 + floor((combo - 1) / 100) * 0.01
otherwise      : 1.34
```

The first five triggers use all 120 member orders equally; the sixth repeats the leader. Each window starts at the note immediately after its trigger in the existing sorted array, including following notes at the same timestamp, and ends at `time <= triggerTime + duration` with no epsilon. Overlapping windows keep separate covered-note counts and add their independently rounded extras. No replacement, joint multiplier floor or additional clamp is applied.

Let `B` be the integer base-song total and `E[slot][member]` each integer window extra. Calculate a song score as `floor((5 * (B + E[5][leader]) + sum(E[0..5][all members])) / 5)`: accumulate the numerator in signed i128, convert it once to binary64, divide by five, then floor immediately. This is the 120-order expectation with the common factor 24 cancelled, followed by the required per-song settlement. Both candidate comparisons and `(song0 + song1) + song2` use these integer song scores; fractional parts never carry between songs.

Multiplier arithmetic uses binary64 without reassociating the defined operations. Each base or independently skill-scored note must fit u32; window extras may be negative. Signed i128 safely holds every total and mean numerator for u32 note counts. Invalid or overflowing scalar arithmetic fails rather than wrapping. GOOD/BAD/MISS, combo breaks and life behavior are absent.

## Source evidence and deliberate boundaries

The pinned [Bestdori app bundle](https://bestdori.com/js/app.d390adb1.js), module `c0f0`, has SHA-256 `ac84605d7889e53c0144ab7c41e379c174b94b8dc31edae07f3483b8a0610778` (verified 2026-08-31). Its `st → lt → ct` path is called for final results by [ToolTeamBuilder](https://bestdori.com/js/ToolTeamBuilder.6367a448.js), not merely a preview. It supports the average-multiplier method, two note floors and the continued/rate-up formulas. ToolTeamBuilder's `songNotes` getter supplies the BPM-anchored time conversion; its bundle SHA-256 is `060930307c802accbd754ac2a6b87eb6294e66cb44646e4cfdff9784670e659b`. Upstream `ct` returns a raw mean; HHWX floors each song before adding the medley total.

That upstream path is a single-song calculator with ordinary combo, a different leader position and one active window. HHWX keeps the medley combo, leader index two and independently rounded additive overlap defined here, and preserves first-recognized-row/explicit-zero normalization rather than upstream's truthy fallback. By explicit product decision, HHWX also retains `score_only_perfect` (`perfect_only`, GREAT multiplier zero) so future cards using that existing master definition remain supported, although upstream `st` does not recognize it. Independent window rounding deliberately gives up the tiny joint-floor difference to keep complete-team scoring cheap during search. These are deliberate compatibility boundaries; “aligned” does not mean identical implementations. The rule version distinguishes this scorer from old normalized inputs and results; input field shapes are unchanged.

The earlier native audit used JP client 10.1.3, master `20260805110509`, and skill-effect SHA-256 `d98e76c0198a6a714be1d38e4696a044242c8384b905426a311c8c2b0961aebc`. Its findings stay unimplemented: biased 1,024-path skill ordering with 96 reachable permutations, single-precision scoring and a combo master table, life-conditioned triggers, and frame/runtime window conflicts. They are provenance notes, not TODOs.

## Verification checkpoint

The retained 15-card/seven-note fixture checks raw HHWX input through TypeScript normalization into Rust. Focused existing cases cover parameters and bonus rounding, charts, skill formulas, window boundaries and direct-add overlap. Six small golden vectors from the pinned upstream function check average judgment, conditional skills, continued, capped rate-up and two-floor results.

The reference deliberately scores each of 120 orders note by note. Its trace contains one integer base score per note, per-order scores, combo offsets and binary64 result words; it has no judgment-state trace. Production groups constant multipliers by combo segment and reuses independent window contributions; it is checked against this reference on tiny inputs, including per-song flooring. The real-chart check also compares raw-chart normalization with Bestdori's original getter, not just formulas fed the same preprocessed timestamps. Older normalized rule versions must be regenerated from raw inputs. Formula changes use these focused checks and tiny exhaustive search, not automatic re-runs of long real-profile benchmarks. Frontend adaptation and result hydration are verified separately without changing scorer or proof semantics.
