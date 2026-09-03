# Bandori Medley Team Builder: Rules and Scoring

Chinese version: [medley-foundation.zh-CN.md](medley-foundation.zh-CN.md)

## 1. Purpose

The medley team builder chooses three five-card teams for three ordered songs. All three teams share one area-item configuration, no physical card may be reused across teams, and every team must contain five different characters. The optimization target is the sum of the three teams' average song scores.

The difficult part is not only finding a high score. A successful result must prove that no legal assignment scores higher. The exact-search proof is described separately in [Medley Exact Search](medley-search.md); this document defines the legal inputs and the scorer that the proof must preserve.

The calculator intentionally follows HHWX's documented, Bestdori-compatible expectation model. It is not a frame-by-frame simulation of the native game client. Known differences are listed in Section 8 so that “compatible” is not mistaken for “identical”.

## 2. User input and result

The user chooses:

- one HHWX game profile;
- optional temporary cards;
- exactly three songs and difficulties in their intended order;
- one medley event, a PERFECT percentage and any card exclusions or owned-card parameter overrides. The current page enters medley mode only for a selected event of that type; the lower-level fixed-team contract can still represent `eventBonus = null` for isolated scoring tests;
- a search time limit. The browser integration currently accepts 1 through 3,600 seconds.

The browser adapter loads the profile's owned cards, progression, area items and character bonuses, then obtains the required Bandori card, character, skill, area-item, song, event and chart records. These source records, rather than caller-precomputed card power or team totals, enter normalization.

The frontend does **not** supply the three teams, their leaders or the final area configuration. Those are search outputs.

Each returned candidate identifies the shared area items and, for every song slot, its five cards, leader, calculated team power and score details. The candidate also carries medley totals. The formal result maximizes total average score.

While searching, the engine also retains at most ten distinct, fully scored solutions that it encountered naturally. After search stops, those retained solutions are expanded with minimum, average and maximum scores and best-order information. This supports the result page, but it does not turn the retained list into a proved global top ten.

Hydration keeps the leader already chosen by the average-score search and enumerates only the 120 orders of the first five skill windows. Among the retained candidates, the UI may separately show the one with the largest hydrated maximum score, but only when its maximum is strictly greater than the average-score winner's maximum. This is a comparison within the retained set, not a search for or proof of the global maximum-score team.

For example, suppose the engine has completely scored solutions worth 9,000,000, 9,100,000 and 9,050,000 points. All three may be retained. A later upper bound may prove that a whole unexplored branch cannot exceed 9,100,000, so that branch is not entered and cannot contribute extra members to the retained list. The winning 9,100,000 result can still be exact even though ranks two through ten were never globally proved.

### Exact and incomplete outcomes

- `exact` means every legal assignment was evaluated or eliminated by a safe upper bound. If `best` is absent in an exact result, exhaustive search proved that no legal medley exists.
- `incomplete` means search started but timeout, cancellation, search-storage exhaustion, arithmetic or counter/index failure, scorer disagreement, inconsistent data discovered inside search, or another controlled internal failure stopped the proof. `bestSoFar` and retained candidates remain diagnostic results, not certified optima. The engine supports a cancellation reason, although the current page exposes a time limit rather than a user-cancel control.
- Profile decoding, source normalization and normalized-input decoding happen before search; hydration happens after it. Failures at those boundaries are request errors rather than `incomplete` search results and do not promise retained candidates.
- If the Worker, process or page is terminated outright, no final result can be produced. Such termination can never be reported as `exact`.

The Worker reports a newly improved best result no earlier than ten seconds after search begins and at most once every five seconds afterwards. Improvements inside the interval are coalesced, and the latest pending improvement is sent at the next eligible progress check even when no newer improvement appears.

`timeToBestScoreMs` records when the last strict average-score improvement was found. Search elapsed time ends before result hydration; hydration time is reported separately. The result page displays the difference between search elapsed time and time to best as the subsequent proof time. This is how long the engine continued searching or attempting proof after finding its last best result, not the later detail-hydration work. Only an `exact` result establishes that this was the final winning score and that the remaining time completed its proof.

## 3. Profile and source-data rules

The HHWX profile is the only profile format accepted by this pipeline. Its historical field named `bestdoriProfile` contains compression-v2 card and area-item state; it is not a second Bestdori import format. Character bonuses come from the profile's top-level `characterPotentials` and `characterMissionBonuses` fields.

A temporary card is identified by master card ID. Selecting the same ID again edits the existing temporary card instead of adding another copy. A newly selected card starts with its maximum legal progression values, which the editor may then change. During calculation, the temporary card replaces a profile-owned card with the same master ID. Profile exclusion flags apply only to the profile card and therefore do not exclude its temporary replacement. Temporary cards are session input: they are written neither into the saved game profile nor into local card preferences, and reloading the page or switching profiles clears them.

Card records are resolved for the profile's gameplay server. When that server has no card slot but the JP slot exists, the existing JP-presence fallback is used. Score-effect and unification percentages prefer the profile server and fall back to JP only when that exact server slot is absent; an explicit zero remains zero. Skill duration uses the same regional fallback but must resolve to a positive number. Area-item rates use only the profile server and search downward for the nearest defined level not above the owned level.

Malformed profile compression, missing required master rows, broken references, unsupported envelope fields or unsupported schema/rules versions fail with a stable error code and field path. Input errors are not treated as “no legal team”. Unused fields may remain in raw master records because the adapter reads only the fields required by the scoring contract.

### Versioned boundaries

The pipeline uses four versioned shapes defined in [`contracts.ts`](../../src/lib/bandori/medley-foundation/contracts.ts). The two `source` shapes are TypeScript adapter inputs; the corresponding normalized `input` shapes cross into Rust:

- `hhwx-medley-search-source-v1` accepts the whole roster and raw source records used by the product search;
- `hhwx-medley-search-input-v1` contains normalized cards, resolved skill contexts, legal owned area configurations and normalized songs for Rust search;
- `hhwx-medley-foundation-source-v1` accepts three explicitly selected teams and one area configuration for small fixed-team verification;
- `hhwx-medley-scoring-input-v1` is the normalized fixed-team Rust scoring input produced by that verification adapter.

The fixed-team verification entry point is not a second product search API. It exists so the scorer can be checked without also exercising roster enumeration and pruning. Because its teams are explicitly selected, a profile exclusion flag does not change their score; exclusion is enforced only when product search constructs candidates.

## 4. Legal medleys and area items

A legal result obeys all of the following:

1. Song slots 0, 1 and 2 remain in the order supplied by the user. A song may appear more than once.
2. Each team contains exactly five physical card instances and five distinct character IDs.
3. A profile card marked as excluded is not a legal search candidate. As described above, that flag does not exclude a temporary replacement.
4. One physical card instance appears in at most one team. Different card instances of the same character may be used in different teams.
5. Member index two is the leader. The engine chooses the leader; it is not a frontend input.
6. All three teams use the same engine-selected area configuration.

The source adapter enumerates legal configurations from owned items: one band-item group, one attribute-item group and one parameter item. A category is empty only if the profile owns no usable item in that category. When a usable parameter item exists, an additional “equip nothing” choice is not enumerated. With all supported groups owned, this produces `9 band groups * 4 attributes * 3 parameter items = 108` configurations. CN metadata-only area-item IDs 59, 68 and 72 are outside this calculator contract.

## 5. Card and team parameters

Every card has three parameters: performance (`P`), technique (`T`) and visual (`V`). The source adapter calculates them in this order:

1. Reconstruct the selected level from the level-one and maximum master rows with the Bestdori rarity growth curve and JavaScript `Math.round`.
2. Add `50 * rarity * masterRank` to each parameter.
3. Add training values when trained, then add each completed episode row.
4. For each parameter separately, combine the character potential rate with the collection-plus-training mission rate, multiply that sum by the parameter obtained above, and floor once.
5. Add the resulting character bonus to obtain the card's `characterParameter`.
6. Calculate matching area-item and event contributions from that value.

For one parameter value of 10,000, a 2% potential and combined 1.5% mission bonus produce:

```text
character bonus = floor(10,000 * (0.02 + 0.015)) = 350
character parameter = 10,000 + 350 = 10,350
```

Potential and mission rates are deliberately added before this single floor. Equal P/T/V values do not select another rule.

Event contribution is calculated independently for each card and parameter. The adapter takes the first matching percentage, in source order, from each of the event's attribute, character, member-card (`situationId`, the master card ID) and rarity-plus-master-rank lists, then adds those four rates. The event-wide `parameterPercent` and its separate performance, technique and visual room rates are added only when both the matched attribute percentage and matched character percentage are greater than zero. The resulting rate multiplies the card's `characterParameter`; this contribution is not separately floored.

For a complete team:

```text
deckTotalParameter = sum(card character parameters)
                   + matching area-item contributions
                   + matching event contributions
```

Area-item and event contributions preserve JavaScript number operation order and are not separately floored before this sum.

## 6. Skills and chart normalization

Skills are resolved only after the five team members are known because a team-wide unification value may depend on them. The primary effect is the first recognized score row, in source order, whose regional value can be resolved; an explicit zero remains valid. When the source defines a unification value, it replaces that primary percentage if either its configured band condition or its configured attribute condition matches the complete team. For a continued-PERFECT primary effect, the fallback is the first later recognized, non-continued score row. Supported normalized behaviors are:

- `neutral`;
- ordinary `score`;
- `score_on_perfect`;
- `perfect_only`;
- `continued_perfect`, with active and fallback rates;
- `great_or_worse_half`.

An ordinary score skill may also use `isRateUpWithPerfect`; its increase and cap are fixed by the scoring rule rather than supplied by the caller. There is no life input or life state. Source rows named `score_over_life` or `score_under_life` are read in source order as ordinary score rows without checking a life threshold.

The chart normalizer keeps:

- Single and Directional notes;
- both endpoints of Long notes;
- both endpoints and every Slide middle node that has no `hidden` property. A middle node carrying that property is omitted even when its value is `false`.

Other entities, including System entries, do not score. A `skill` property marks a trigger whenever the property exists, even if its value is `false`. Each song must contain exactly six triggers.

Notes are ordered by beat, with a trigger note before another note on the same beat. Time is calculated from the nearest preceding BPM change:

```text
note time = BPM-point time + (note beat - BPM-point beat) * (60 / BPM)
```

This anchored conversion avoids cumulative drift at skill-window endpoints.

## 7. Score calculation

Let `p` be the PERFECT probability from 0 through 1. HHWX models every non-PERFECT result as GREAT; it does not model GOOD, BAD, MISS or combo breaks.

### Base note score

For a chart with `noteCount` scoring notes and master play level `level`:

```text
judgment = 1.1 * p + 0.8 * (1 - p)
chart coefficient = (3 + 0.03 * (level - 5)) / noteCount
base = deckTotalParameter * chart coefficient
base note score = floor((base * combo multiplier) * judgment)
```

Combo continues across the three songs:

```text
combo <= 20    : 1.00
combo <= 50    : 1.01
combo <= 100   : 1.02
combo <= 300   : 1.01 + floor((combo - 1) / 50)  * 0.01
combo <= 3000  : 1.04 + floor((combo - 1) / 100) * 0.01
otherwise      : 1.34
```

### Skill multiplier

An ordinary `C` percent score-up uses multiplier `1 + C / 100`. For `isRateUpWithPerfect`, covered note number `n` starts at one and includes the current note:

```text
C(n) = C + 0.5 * min(n, 100) * p
```

A continued-PERFECT skill with normal multiplier `active` and fallback multiplier `fallback` uses:

```text
fallback + p^n * (active - fallback)
```

For skills that distinguish PERFECT and GREAT, the multiplier is:

```text
(1.1 * perfectMultiplier * p + 0.8 * greatMultiplier * (1 - p)) / judgment
```

`score_on_perfect` uses GREAT multiplier 1, `perfect_only` uses 0, and `great_or_worse_half` uses 0.5. When both multipliers are equal, that common multiplier is used directly.

The skill contribution for one covered note is calculated with a second floor:

```text
skill note score = floor(base note score * skill multiplier)
window extra = skill note score - base note score
```

The window starts at the note after its trigger in normalized order. A later note at the same timestamp is therefore covered. The endpoint is inclusive:

```text
note time <= trigger time + skill duration
```

No epsilon is added. When windows overlap, each window computes and floors its own extra independently; the extras are then added. Multipliers are not merged before flooring.

### Expected skill order and leader

The first five triggers use the five team skills in every one of the `5! = 120` orders with equal probability. The sixth trigger repeats the leader skill. Each member therefore occupies each of the first five windows in exactly `4! = 24` orders.

Let:

- `B` be the song's integer base score with no skill extras;
- `E[w][m]` be the integer extra produced when member `m` occupies window `w`;
- `leader` be the chosen member used again in window 5.

The 120-order average simplifies exactly to:

```text
song score = floor(
  (5 * (B + E[5][leader]) + sum(E[w][m] for w=0..4, m=0..4)) / 5
)
```

This is why production scoring does not need to enumerate 120 orders for every candidate. The numerator is accumulated exactly in signed `i128`, converted to binary64 once, divided by five and immediately floored. Each song is settled independently; the medley total is then calculated as `(song0 + song1) + song2`.

The scorer evaluates all five leaders for a complete five-card set. Equal best song scores retain the leader with the smallest physical instance ID.

### Display-only medley event points

Event points do not affect search order. Because the product always calculates all three songs, the medley completion bonus is fixed at 100:

```text
event points = (floor(total average score / 18,500) + 100) * boost multiplier
```

The UI displays total boost choices 0/3/6/9, corresponding to multipliers 3/15/30/45, and defaults to 9. For example, a total average score of 9,250,000 gives `floor(9,250,000 / 18,500) = 500`; at 9 boost the display is `(500 + 100) * 45 = 27,000` event points.

## 8. Compatibility and deliberate differences

The score formulas and chart-time conversion were checked against the pinned [Bestdori application bundle](https://bestdori.com/js/app.d390adb1.js), module `c0f0`, SHA-256 `ac84605d7889e53c0144ab7c41e379c174b94b8dc31edae07f3483b8a0610778`, and [ToolTeamBuilder bundle](https://bestdori.com/js/ToolTeamBuilder.6367a448.js), SHA-256 `060930307c802accbd754ac2a6b87eb6294e66cb44646e4cfdff9784670e659b`, verified on 2026-08-31. That path establishes the average judgment multiplier, two note-score floors, continued-skill formula, rate-up formula and BPM-anchored note times.

HHWX differs from that single-song path where the medley product requires different behavior:

- combo continues across three songs;
- member index two is the leader;
- overlapping skill windows add their independently rounded extras;
- each song average is floored before the three song scores are added;
- the first recognized score row and an explicit zero are preserved;
- `score_only_perfect` is represented as `perfect_only`, with zero GREAT multiplier, even though the pinned upstream function does not recognize it.

An audit of native JP client 10.1.3 using master version `20260805110509` and skill-effect SHA-256 `d98e76c0198a6a714be1d38e4696a044242c8384b905426a311c8c2b0961aebc` found behavior outside this calculator model: biased random skill-order sampling, single-precision scoring, a combo master table, life-conditioned triggers, and frame/runtime handling of skill-window conflicts. HHWX does not model those behaviors. Changing that boundary would require a new scoring rule version and corresponding reference cases.

## 9. Implementation and verification

The TypeScript source adapter lives under `src/lib/bandori/medley-foundation/`. The fixed-team model and reference scorer live in `crates/bandori-medley-model/` and `crates/bandori-medley-reference/`; production scoring and exact search live in `crates/bandori-medley-search/`; the browser binding lives in `crates/bandori-medley-wasm/`.

The reference scorer deliberately evaluates all 120 orders note by note and returns detailed numeric traces. Production scoring uses the algebraic reduction above and groups reusable note/window work. Tiny fixtures compare both paths, while separate search tests compare exact search with exhaustive enumeration. See [Medley Testing and Verification](medley-testing.md) for runnable commands and evidence limits.
