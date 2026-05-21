# HHWX Bandori Single-Song Team Builder Algorithm

This report describes the HHWX Bandori single-song team builder from four angles:

1. the game model used for power, score, event points, and support bands;
2. the exact search strategy;
3. the performance design that makes the exact search practical on large card pools;
4. the correctness and validation evidence.

## Problem Definition

Given:

- a player's owned cards;
- card level, training state, episode unlocks, Master Rank, and skill level;
- area items, character potentials, and character mission bonuses;
- a song chart and difficulty;
- event bonus conditions;
- live type and optimization target;

the goal is to find the best legal team.

A legal main team must satisfy:

- exactly five cards;
- no duplicate character;
- no excluded card;
- one shared global area-item configuration for the whole team.

The current single-song search supports three targets:

- `score`: maximize song score.
- `eventPoint`: maximize event points.
- `mission_live + eventPoint`: maximize mission-live event points, including the support band.

## Scoring and Event Model

### Card Power

Each candidate card is converted into a static card state before search:

1. Compute current-level three-parameter base values using the rarity growth curve.
2. Add training, episode, and Master Rank bonuses.
3. Add character potentials and character mission bonuses.
4. Add event parameter bonuses when the event type affects song score.
5. Compute effective power under each global area-item configuration.

Area items are not maximized independently per item group. The algorithm enumerates one global configuration:

```text
(optional band item configuration, optional attribute item configuration, optional parameter item configuration)
```

Each layer may be empty, meaning the global configuration chooses no area item from that category. In the implementation, empty band and attribute configurations are omitted when the player owns usable band or attribute items, because area-item bonuses are non-negative and the empty configuration is then dominated. The parameter layer is explicitly enumerated with an empty option and then passed through the same dominance pruning. Every card in a candidate team is evaluated under the same configuration.

### Chart and Note Score

The chart is preprocessed into a reusable note timeline:

- count all scoring notes;
- compute note time, combo multiplier, and fever multiplier;
- compute the six skill windows from skill notes and skill duration.

The per-note score formula is:

```text
inner = floor(base * judge * combo * fever)
noteScore = floor(inner * skill)
```

The song score is the sum of all `noteScore` values.

For multi live, room score uses the unrounded own average score and applies flooring only after adding the other players' score:

```text
roomScore = floor(rawAverageScore + otherTeamScore)
```

This avoids the stable one-point error caused by flooring the own average score too early.

## Skill Resolution

Skills must be resolved after the full five-card team is known, because some skills depend on team context, such as:

- all members belonging to the same band;
- all members having the same attribute;
- score-up only on PERFECT notes;
- score-up rate increasing on each PERFECT note.

Therefore, a skill cache key cannot be only `skillId + skillLevel`. HHWX includes at least:

```text
skillId, skillLevel, server, sameBandId, sameAttribute
```

When `perfectRate < 1`, the current model treats every non-PERFECT note as GREAT. GOOD, BAD, and MISS are not simulated. As a result, "until GREAT or below" interruption effects do not trigger in the current model, while "PERFECT only" effects still distinguish PERFECT from GREAT.

## Event Point Model

Events are split into two broad groups.

### Parameter-Bonus Events

Some events add bonuses directly to card power. In these cases, event point maximization is equivalent to score maximization, because the event bonus affects the score-producing power.

### Point-Bonus Events

Other events first compute song score or room score, then compute base points and main-team bonus:

```text
eventPointBase = floor(basePt(score, roomScore) * (1 + mainPointBonusRate))
```

`basePt(score, roomScore)` is an abstraction over event-type-specific formulas. The concrete formula is selected by event type and event data in the implementation. This report keeps it abstract because the team-search algorithm only needs the monotonic relationship between score, room score, and the resulting base points.

Live Boosts, challenge CP, placement, win/loss, and similar display parameters do not change team ordering. They can be switched in the result view without running search again.

### Mission-Live Support Band

For `mission_live + eventPoint`, the support band is added after the main-team point bonus:

```text
eventPoint =
  floor(basePt(score, roomScore) * (1 + mainPointBonusRate))
  + floor(supportBandPower / 3000)
```

Support-band rules:

- a support card cannot reuse the exact same card as the main team;
- support cards cannot duplicate characters within the support band;
- a different card of the same character as a main-team card is allowed;
- support power does not receive area-item bonuses;
- support affects event points only. It does not change song score, main-team power, or skill context.

Once the main team is fixed, the support band is solved exactly by greedy selection: scan cards by descending support power, skip main-team card IDs and duplicate support characters, and take the first five legal cards.

## Search Algorithm

HHWX uses exact branch-and-bound search rather than fixed Top-K heuristic pruning.

High-level flow:

1. Enumerate global area-item configurations.
2. Precompute effective card power for each configuration.
3. Remove dominated area-item configurations.
4. Apply safe candidate compression.
5. Evaluate high-potential seed teams to raise the top-N threshold early.
6. Recursively enumerate five cards with distinct characters.
7. Resolve real skill context and score every complete team that survives bounds.
8. Return results sorted by target value.

The DFS state is maintained incrementally:

- selected cards;
- used character bitset;
- current power;
- current event point bonus;
- current support opportunity cost;
- current proven upper bound.

A branch is pruned only when its upper bound is already lower than the current top-N threshold.

## Performance Design

The main speed improvement does not come from a faster implementation of the score formula. It comes from making the search tree much smaller before expensive full-team scoring is needed.

In short, HHWX tries to answer this question as early and as cheaply as possible:

```text
Even under the most optimistic completion of this branch,
can it still enter the current top-N results?
```

If the answer is no, the branch is discarded without resolving final skills, support bands, detailed score ranges, or result-display fields.

### Early Pruning Layers

HHWX applies pruning and reduction at several depths:

1. area-item configuration level;
2. candidate-card compression before DFS;
3. search-scope level for same-band, same-attribute, both, and mixed contexts;
4. partial-team DFS branches;
5. complete-team candidates before expensive hydration;
6. mission-live teams before real support-band selection.

This matters because most of the cost is not a single arithmetic operation. The expensive path includes full team-context resolution, leader enumeration, skill-window scoring, event point calculation, support-band selection, and result hydration. Avoiding that path for weak branches is the largest performance win.

### Cheap Suffix Upper-Bound Indexes

The upper bounds are intentionally designed to be cheap enough to call frequently. For each search scope, HHWX precomputes suffix arrays indexed by the traversal position:

```text
best effectivePower still available per character
best skillAverageRate upper still available per character
best skillLeaderRate upper still available per character
best pointBonusRate still available per character
```

During DFS, a branch-bound check mostly becomes:

```text
look up suffix arrays
skip already-used character masks
take the best remaining character-level values
combine them with the current partial-team state
```

This avoids repeatedly scanning rich card objects, recomputing skill estimates, or sorting the remaining candidate list inside the hot recursive path. A bound that is slightly less tight but extremely cheap can be more valuable than an expensive bound that cannot be used often.

### Multiplicative Effect of Candidate Compression

Candidate compression reduces DFS width before the five-card search begins. Even a moderate reduction in per-character candidates can have a large effect because the team has five slots.

For example, if compression keeps only 70% of otherwise searchable choices in each slot, a rough five-slot estimate is:

```text
0.7^5 = 0.16807
```

That is about one sixth of the original five-card combinations before other pruning layers are considered. The real reduction depends on character distribution, area-item configurations, and event objective, but the important point is that candidate compression compounds across team slots.

HHWX keeps this compression exact-safe by requiring replacement equivalence rather than broad strength estimates. A card can remove another card only when it is interchangeable in legality and skill-search behavior, and no worse in the dimensions relevant to the current objective.

### Target-Aware Bounds

The bound is not a single "high power is good" proxy. It is adapted to the selected objective:

```text
score:
  score upper bound

eventPoint:
  score upper bound
  point bonus upper bound

mission_live + eventPoint:
  score upper bound
  point bonus upper bound
  global support point upper bound
  support opportunity cost in candidate compression
```

This is especially important for mission-live search. A card with strong main-team value may also be a strong support candidate. If putting it in the main team removes too much support-band power, it may not be a good event-point choice. HHWX models that effect explicitly instead of treating support as display-only postprocessing.

### Correlated Second-Level Bounds

The cheap first-level bound is deliberately optimistic. It may combine the highest remaining power from one card, the highest remaining skill value from another card, and the highest remaining point bonus from a third card. That is safe, but sometimes too loose.

When a branch is close to the current top-N threshold, HHWX can compute a tighter correlated bound. It keeps a small Pareto frontier over states such as:

```text
power
skillAverageRate
skillLeaderRate
pointBonusRate
```

This removes "fake hope" branches where independent maxima look strong but no real set of remaining cards can provide all of those maxima together. If the correlated bound becomes too expensive, it is abandoned and the branch remains in the search; correctness never depends on completing this tighter bound.

### Early Top-N Thresholds

Branch-and-bound becomes effective only after a meaningful N-th result exists. HHWX therefore evaluates high-potential seed teams early. These seed teams do not remove candidates and do not affect correctness. They only raise the top-N threshold sooner, which makes later upper-bound checks more likely to prune.

The pruning threshold is the current N-th result in the sorted result list, where N is `resultLimit`. Before the list contains `resultLimit` entries, the search does not prune by score or target-value threshold, because there is no complete top-N boundary yet.

Once the list is full, each candidate branch computes two optimistic values:

```text
scoreUpperBound
targetUpperBound
```

`scoreUpperBound` is the best song-score upper bound the branch can still achieve. `targetUpperBound` converts that score upper bound into the active objective, such as event points or mission-live event points. The branch is pruned when:

- `targetUpperBound` is strictly lower than the current N-th result's `targetValue`; or
- for non-event-point score tie-breaking, `targetUpperBound` equals the threshold target value but `scoreUpperBound` is lower than the threshold result's score.

For event-point targets, equal `targetUpperBound` is not pruned only by score, because event-point display and tie behavior can depend on event-specific result fields. In that case, the branch remains unless its target upper bound is strictly below the threshold.

The practical result is:

```text
better early threshold
+ cheap frequent bounds
+ narrower DFS width
+ target-aware upper bounds
= far fewer full-team evaluations
```

### Delayed Expensive Work

Full-team scoring and display hydration are intentionally delayed. Most teams only need a target-only evaluation, and many branches do not even reach that point.

The delayed work includes:

- final same-band and same-attribute skill resolution;
- leader enumeration;
- skill-window max/min details;
- support-band card details;
- display card objects and resolved-skill objects.

This is why the speedup is larger on large card pools and mission-live cases: there are many more weak branches and many more support-sensitive candidates that can be rejected before the expensive path.

## Implementation Details

This section describes the implementation at a level useful for code review or reimplementation.

### Core Data Structures

The search starts by normalizing cards into internal candidate records. Each record stores both game-facing fields and search-specific fields:

```text
cardId
characterId
bandId
attribute
skillId
skillLevel
rawPower
effectivePower
pointBonusRate
supportPower
skillSignature
skill upper-bound profiles
```

`rawPower` is the card's power before area items. `effectivePower` is recomputed for each area-item configuration. `supportPower` is the value used by mission-live support selection and intentionally excludes area items.

Area-item configurations are represented as compact configuration objects:

```text
{
  bandKey,
  attribute,
  parameter,
  selectedAreaItemIds
}
```

For each configuration, the implementation precomputes a power vector indexed by candidate card. This avoids recalculating area-item effects inside the DFS hot path.

### Search Execution Pipeline

At runtime, the implementation is organized as a sequence of cheap preparation steps followed by a very small hot loop:

1. Normalize request input, song chart data, event settings, owned cards, and the optional support-band context.
2. Build all area-item configurations, then remove area-item configurations that are dominated by another configuration for every relevant candidate.
3. Precompute per-card static data: raw power, event point bonus, support power, skill signature, and skill contribution-rate profiles.
4. For each remaining area-item configuration, rewrite each candidate's `effectivePower` from the precomputed power vector.
5. Compress dominated card candidates under that configuration.
6. Sort candidates into traversal groups, usually one group per character, with stronger groups earlier.
7. Split the traversal into context scopes when context partitioning is enabled.
8. Build suffix upper-bound indexes for the scope.
9. Run DFS. The DFS only mutates small numeric state, card-id arrays, and character masks.
10. For a complete five-card team, run target-only scoring first; hydrate the detailed result object only if the team can enter top-N.
11. Deduplicate equivalent results, sort by the public comparator, and truncate to `resultLimit`.

The important performance property is that expensive objects are created late. Most rejected branches never construct resolved skill objects, support-card result objects, or max/min skill-order display data.

### Skill Contribution Rate Profiles

The search does not estimate a card's skill as a standalone score. Instead, it converts each skill into per-power contribution rates that can be combined with team power in upper-bound formulas.

For each note, the implementation first computes the score rate contributed by one point of team power:

```text
baseScorePerPower = 3 * (1 + (playLevel - 5) / 100) / notesCount

noteRate =
  baseScorePerPower
  * judgeRate
  * comboMultiplier
  * feverMultiplier
```

For a skill window, the contribution rate is the sum of covered note rates multiplied by the skill's extra score multiplier:

```text
windowRate =
  sum(noteRate * max(0, skillMultiplier(note) - 1))
  for each note covered by the skill duration
```

For simple constant score-up skills, this reduces to:

```text
windowRate =
  sum(noteRate for covered notes)
  * valuePercent / 100
```

The implementation evaluates all six skill windows:

```text
slots 0..4  regular trigger windows
slot 5      leader / encore-related window
```

The profile stores three rates:

```text
maxRate:
  best single-window contribution

averageRate:
  average contribution across the five regular trigger windows

leaderRate:
  contribution of the leader / encore-related window
```

These rates are used for branch ordering and optimistic upper bounds. They are not used as final scores.

Two kinds of profiles are precomputed:

1. **Generic upper profile.** Uses the skill's maximum possible score-up value and a PERFECT-based note rate. This is deliberately optimistic and is useful before final team context is known.
2. **Resolved context profiles.** Resolve the skill under `mixed`, `same-band`, `same-attribute`, and `both` contexts, then compute the same `averageRate` and `leaderRate` fields for each context.

This is why a candidate record carries fields such as:

```text
skillAverageRate
skillLeaderRate
skillSameBandAverageRate
skillSameBandLeaderRate
skillSameAttributeAverageRate
skillSameAttributeLeaderRate
skillBothAverageRate
skillBothLeaderRate
skillMixedAverageRate
skillMixedLeaderRate
```

During DFS, the active search scope chooses the matching context-specific rates. When a complete team is actually scored, HHWX does not rely on these approximations: it resolves the real five-card context and runs the integer scoring path with note-level floors.

### Team Context Partitioning

Many skill effects depend on whether the final team is all one band or all one attribute. The implementation classifies complete teams into exact context scopes:

```text
both           all same band and all same attribute
same-band      all same band, mixed attributes
same-attribute all same attribute, mixed bands
mixed          neither all same band nor all same attribute
```

For large card pools, the search can process these scopes separately. This reduces repeated exact scoring and allows tighter suffix upper bounds without changing the set of legal teams.

### Candidate Compression

Candidate compression is performed per character and per area-item configuration. The implementation compares only cards that are interchangeable with respect to legality:

```text
same character
same band
same attribute
same skill signature
same context-relevant skill behavior
```

The skill signature is intentionally more specific than `skillId`. It includes the skill duration, unification condition type, unification condition band, unification effect value, and the relevant score-effect types, values, conditions, and life thresholds. This prevents compression from treating two cards as interchangeable when their skills only look similar by ID or level but behave differently during scoring.

The dominance dimensions depend on the objective:

```text
score:
  effectivePower

eventPoint:
  effectivePower
  pointBonusRate

mission_live + eventPoint:
  effectivePower
  pointBonusRate
  -supportPower
```

The negative `supportPower` dimension means that a card is better as a main-team replacement only if it does not consume a stronger support candidate than the card it removes.

### DFS State

The recursive search does not repeatedly allocate sets or recompute sums. It carries a compact incremental state:

```text
selectedCardIds[0..depth)
usedCharacterMaskLow
usedCharacterMaskHigh
currentPower
currentPointBonusRate
currentSupportOpportunityCost
currentBandState
currentAttributeState
```

Two integer masks are used for character membership so that duplicate-character checks are constant-time and allocation-free. The recursion depth is at most five.

The loop is structurally close to the following pseudocode:

```text
visit(groupIndex):
  remainingSlots = 5 - selectedCount
  remainingGroups = groups.length - groupIndex

  if remainingSlots == 0:
    evaluateCompleteTeam()
    return

  if remainingGroups < remainingSlots:
    return

  if topNIsFull:
    upper = bound(selectedState, groupIndex, remainingSlots)
    if upper cannot beat threshold:
      return

  if remainingGroups > remainingSlots:
    visit(groupIndex + 1)          // skip this character group

  for card in groups[groupIndex]:
    if card.character already used:
      continue
    push card
    update power, bonus, skill-rate, band/attribute state, masks
    visit(groupIndex + 1)
    pop card
```

Grouping by character is the reason the duplicate-character rule is cheap: once a group is skipped or one card from it is chosen, the recursion moves to the next group.

### Branch Ordering

Branch ordering is heuristic but not correctness-critical. Candidate groups are ordered to find strong teams early:

- high effective power;
- high skill upper bound;
- high event point bonus for point targets;
- lower support opportunity cost for mission-live point targets.

This improves speed by raising the top-N threshold early. It does not remove any candidate by itself.

### Upper Bounds

The implementation uses multiple upper bounds, all deliberately optimistic.

The first-level bound is cheap and used frequently:

```text
current contribution
+ best possible remaining character powers
+ best possible remaining skill contribution
+ best possible remaining point bonus
+ global support point upper bound, if applicable
```

The second-level bound is used when a branch is close to the current threshold. It estimates remaining choices jointly instead of multiplying independent maxima from different cards. Conceptually, it builds a small Pareto frontier over:

```text
remainingPower
remainingSkillPotential
remainingPointBonus
remainingSupportOpportunityCost
```

The second-level bound is still optimistic. If it cannot prove a branch impossible, the branch remains in the search.

### Upper-Bound Index Construction

The frequent first-level bound is backed by suffix indexes. For each traversal position, HHWX stores the best remaining value per character for dimensions such as:

```text
effectivePower
pointBonusRate
skillAverageRate
skillLeaderRate
context-specific average skill rate
context-specific leader skill rate
supportOpportunityCost
```

The index is suffix-based: the row for position `i` only contains cards that can still be selected from groups `i..end`. When DFS is at position `i`, it can ask "what are the best remaining values among characters not already used?" without rescanning all future cards.

The bound then selects the best `remainingSlots` character representatives for each dimension. The first-level version is intentionally allowed to take the best power from one set of cards and the best skill rate from another set of cards. This can overestimate the real team, but it is cheap and safe. The correlated second-level bound is the optional tighter pass that tries to keep those dimensions attached to the same hypothetical cards.

For mission-live point targets, `supportOpportunityCost` is included because putting a high-support card into the main team can remove it from the support band. The optimistic branch value is therefore not just "main team power plus global best support"; it also tracks how much support potential the selected main cards may consume.

### Threshold Application Points

Threshold checks are applied at three levels:

1. **Root configuration / search scope.** Before entering DFS for a specific area-item configuration and context scope, HHWX estimates the best possible result under that entire scope. If that upper bound cannot enter the current top-N list, the whole scope is skipped.
2. **Partial DFS branch.** During recursion, the selected partial team plus the best possible remaining cards is bounded. If the branch cannot enter top-N, all completions under that partial team are skipped.
3. **Complete five-card team before expensive work.** Even after five cards are selected, HHWX can still avoid real scoring or support-band hydration if the team's optimistic target bound cannot reach the threshold.

The correlated second-level bound is not used on every branch. It is triggered only when the first-level bound is close enough to the current threshold to make a tighter check worth the cost:

- for point-bonus objectives, when the first-level target upper bound is within roughly `120` points above the current threshold, or is not finite;
- for score objectives, when the first-level upper bound is within about `8%` above the current threshold.

These numbers are cost-control heuristics, not correctness assumptions. The correlated bound is more expensive than the first-level bound, so running it on branches that are far above the current threshold usually wastes time: even a tighter estimate is unlikely to prove the branch impossible. For point-bonus objectives, the target value is an integer event-point value and useful pruning usually happens near the current cut line, so a small absolute window is used. For score objectives, values are much larger and vary by song and card pool, so a relative window is used instead. Changing these windows affects how often the tighter bound is attempted and therefore affects speed, but it does not change the exactness guarantee.

If the correlated bound exceeds its internal work budget, it returns no result and the branch is kept. This preserves correctness: tighter bounds may improve speed, but failure to compute a tighter bound never removes a branch.

### Full-Team Scoring

For a complete team, the implementation performs exact scoring:

1. Resolve the final team context.
2. Resolve all five skills under that context.
3. Evaluate each possible leader.
4. Compute the six skill windows.
5. Compute average score, max score, min score, and a representative max-score skill order.

Because the six skill windows do not overlap, the contribution of assigning a skill to a window is additive. In free live, all five team skills are candidate-dependent. In multi live, the four external player skills are fixed by the request; the candidate-dependent part is the chosen leader skill and, depending on the encore setting, the encore source.

When detailed max/min output is needed, the five trigger skills are still assigned to five trigger windows exactly. Instead of enumerating all `5! = 120` assignments, the implementation uses bitmask dynamic programming:

```text
dp[mask] = best contribution after filling popcount(mask) windows
transition: add one unused skill to the next window
```

The DP has only `2^5` masks and preserves:

- maximum contribution;
- minimum contribution;
- number of maximum-achieving orders;
- one representative maximum order.

It is mathematically equivalent to enumerating all 120 assignments because every permutation corresponds to exactly one path through the DP.

### Target-Only Evaluation and Hydration

Most complete teams never enter the result list. To reduce allocation cost, scoring is split into two phases:

```text
target-only evaluation:
  target value
  average score
  room score
  event point base
  best leader

hydration:
  card details
  resolved skills
  support cards
  max/min score display fields
  skill order display fields
```

Hydration is performed only when a team can enter the current top-N list. This does not change scores; it only delays result-object construction.

### Support-Band Evaluation

Support candidates are sorted once by `supportPower`. For each complete main team, support selection is a linear scan:

```text
for card in sortedSupportCandidates:
  skip if cardId is in main team
  skip if support character already used
  take card
  stop after five cards
```

Before doing this real support scan, the search first checks whether the team can enter top-N even under the global maximum possible support points. If not, real support selection is skipped.

### Result Ordering

Results are sorted by:

1. target value;
2. average score or total power, depending on target;
3. leader skill strength;
4. stable card-id ordering.

The stable tie-breaker makes repeated runs deterministic.

Result insertion has two deduplication layers. During evaluation, `areaItemConfigurationKey + sortedCardIds` prevents evaluating the same card set under the same item configuration more than once. At result insertion time, `sortedCardIds` is used again so that if the same visible five-card team is found through multiple scopes or configurations, only the better scored result is kept.

After every insertion, the list is sorted and trimmed to `resultLimit`. Once the list is full, the last result becomes the pruning threshold used by later root-scope, partial-branch, and complete-team checks.

### Cache Layers

Several caches keep repeated exact scoring cheap:

- prepared chart and note-rate data are reused across teams;
- judge-rate lists are cached by accuracy setting;
- base score-rate lists and no-floor score-rate lists are cached by chart and play condition;
- skill multiplier lists are cached for resolved skill windows;
- resolved skill profiles are cached where the same skill/context pair appears repeatedly;
- support-band selection is cached by sorted main-team card ids.

These caches are deliberately below the public result layer. They do not change ranking semantics; they only avoid recomputing deterministic intermediate values.

## Correctness Argument

### Search-Space Coverage

Every legal result can be represented as:

```text
area-item configuration
+ five distinct-character main-team cards
+ leader choice
+ skill-window assignment
+ support band
```

The algorithm enumerates every area-item configuration and every legal five-card team under that configuration. For a complete team, it evaluates every leader choice and computes the exact skill-window contribution. For mission live, once the main team is fixed, the support band is solved optimally. Therefore, every unpruned legal team is scored exactly.

### Candidate Compression Safety

Card A may remove card B only when:

- A and B have the same character;
- A and B are skill-equivalent under all relevant contexts;
- A has no lower effective power;
- for event-point targets, A has no lower point bonus;
- for mission-live event-point targets, A has no higher support opportunity cost.

Any legal team containing B can replace B with A without changing character legality, without weakening skill context, and without lowering the objective. Therefore, removing B cannot remove the unique optimum.

### Upper-Bound Pruning Safety

Each branch upper bound is the current exact partial value plus optimistic remaining contributions. It may overestimate what the branch can actually achieve, but it must never underestimate it. If even that optimistic value is below the current N-th best result, no completion of the branch can enter the top-N set, so pruning is safe.

For example, a cheap first-level bound may combine the best remaining power from one card, the best remaining skill contribution from another card, and the best remaining point bonus from a third card. That combined branch may not be achievable by any real team. This is still safe because the value is an overestimate. The correlated second-level bound exists to remove some of these impossible combinations when a branch is close to the top-N threshold, but correctness does not depend on that tighter bound being available.

### Support-Band Greedy Optimality

With the main team fixed, support selection asks for up to five support cards with distinct support characters, maximizing total `supportPower`.

For each character, only the highest available support-power card can matter. Taking the best five remaining character representatives is optimal. Sorting all support candidates by support power and skipping duplicate characters is equivalent to that optimum.

### Exact Result Condition

The result is marked:

```text
searchMode = "exact"
```

only when the search completes and every skipped branch is justified by a safe upper bound.

User-facing meaning:

- `exact`: the returned top-N results are proven optimal under the stated input model.
- `bounded`: the returned results are the best teams found before the time budget ended. They must not be presented as proven optimal. Any reported upper-bound gap should be interpreted as remaining uncertainty, not as an additional score achieved by the listed teams.

## Difference from Bestdori Team Builder

Bestdori Team Builder is an important reference, but its team search is heuristic and does not provide an exact optimality proof. It also optimizes around compact skill tags and skill matrices, historically keyed around `skillId + skillLevel`, which cannot fully represent same-band and same-attribute conditions during partial-team optimization.

The benchmark comparison below is against a local Bestdori-compatible baseline, not a claim about every current or future production deployment of Bestdori. The local baseline is built from the saved Bestdori Team Builder asset bundle used during validation, currently represented by `ToolTeamBuilder.6367a448.js`, and wrapped so it can run against the same local fixtures and master data as HHWX. The raw fixtures, local wrapper, and validation scripts are not distributed with this repository, so the figures are design evidence rather than a public reproducibility suite.

Bestdori also uses important performance techniques:

- precomputed skill contribution matrices;
- candidate ordering;
- recursive pruning after a top-N threshold exists;
- rough remaining-power and score estimates;
- early rejection when a fixed center skill is requested.

The HHWX speedup is therefore not explained by "HHWX has pruning and Bestdori does not." The difference is that HHWX makes the branch-bound checks cheaper, applies them earlier, and adapts them more closely to the exact target value.

HHWX differs in several ways:

- It enumerates the full legal search space and prunes only with safe upper bounds.
- It resolves skills after the complete five-card team is known.
- It correctly handles same-band, same-attribute, PERFECT-only, and increasing-rate skills under the real team context.
- It enumerates area items as one global team configuration.
- It includes mission-live support bands in both exact scoring and upper bounds.
- It explicitly reports whether a result is exact or bounded.

HHWX is therefore not a reimplementation of Bestdori's heuristic search. It is an exact search engine using compatible scoring formulas where possible.

### Where the Speedup Comes From

Compared with the Bestdori-compatible baseline, HHWX gains speed from these implementation choices:

1. **Pre-DFS candidate compression.** Exact-safe replacement rules reduce the number of cards entering DFS. Since teams contain five cards, this reduction compounds across slots.
2. **Suffix upper-bound indexes.** HHWX precomputes the best remaining values by traversal position and character, so frequent branch checks avoid expensive rescans or resorting.
3. **Objective-specific bounds.** Score, event point, and mission-live event point use different upper-bound dimensions instead of one generic power proxy.
4. **Support-aware modeling.** Mission-live support power is represented in compression and bounds, so many support-sensitive branches can be rejected before real support selection.
5. **Correlated second-level bounds.** Near the top-N threshold, HHWX can bind power, skill potential, and point bonus together instead of combining unrelated single-dimension maxima.
6. **Delayed hydration.** HHWX only constructs detailed result objects for teams that can enter the top-N list.
7. **Bitmask skill-window DP.** Detailed max/min skill-order output uses a 32-state assignment DP instead of repeatedly enumerating all `5!` skill orders.

The most important pattern is that the Bestdori-compatible baseline tends to evaluate deeper partial teams and many complete teams with fast heuristics, while HHWX rejects more branches before full-team evaluation by using cheap target-aware bounds.

That is why HHWX can be faster even while also preserving an exact-search contract when the search finishes within the time budget.

## Aggregated Performance Comparison

The following benchmark figures compare HHWX against a local Bestdori-compatible baseline on the same machine and comparable inputs.

### Benchmark Methodology

The benchmark matrix uses:

- the same local machine for HHWX and the compatible baseline;
- the same cached Bestdori master data and chart data;
- the same player-card fixtures and event settings;
- comparable objectives, so the baseline is used as a formula and performance reference rather than as an exact-search oracle.

The `HHWX max` and `Baseline max` columns report the slowest recorded case within each scenario group in the validation matrix. The sampled-card-pool average table reports average elapsed time over the sampled pool set used in that matrix.

Because the baseline is a local compatibility wrapper around a saved Bestdori asset bundle, the timings should be read as an engineering comparison under controlled inputs, not as a general statement about live Bestdori service performance.

| Scenario | HHWX max | Baseline max | Approx. speedup |
| --- | ---: | ---: | ---: |
| 1329-card pool, no event | 1.6s | 9.6s | 6.0x |
| 1889-card pool, no event | 2.1s | 11.8s | 5.7x |
| 1889-card pool, challenge event | 1.9s | 8.2s | 4.4x |
| 1889-card pool, mission multi | 7.9s | 89.4s | 11.3x |
| 1889-card pool, versus display | 1.9s | 12.3s | 6.4x |
| 1889-card pool, Team Festival display | 2.4s | 12.9s | 5.5x |
| Sampled card pools, no event | 2.4s | 24.6s | 10.1x |
| Sampled card pools, 95% perfect rate | 2.3s | 19.7s | 8.6x |
| Sampled card pools, challenge event | 1.9s | 10.9s | 5.7x |
| Sampled card pools, mission multi | 8.1s | 90.4s | 11.1x |

Average timings on sampled card pools:

| Scenario | HHWX average | Baseline average |
| --- | ---: | ---: |
| No event, full PERFECT | 1.4s | 8.6s |
| No event, 95% perfect rate | 1.3s | 7.9s |
| Challenge event | 1.2s | 6.0s |
| Mission multi | 4.6s | 45.4s |

## Known Limitations

The current public report describes the single-song team builder. It does not cover medley or other multi-team optimization as part of the same search problem.

The `perfectRate` model simulates only PERFECT and GREAT outcomes. GOOD, BAD, MISS, combo breaks, and deliberate score-control routes are not modeled. As a result, skills whose real behavior depends on those outcomes may not be represented as a full live-play probability model.

For point-bonus events, the report abstracts event formulas as `basePt(score, roomScore)`. The concrete formula is implementation- and event-data-specific.

Performance numbers compare HHWX with the local Bestdori-compatible baseline described above. They should not be interpreted as a universal benchmark against every Bestdori version or runtime environment.

If search exceeds its time budget, HHWX returns `bounded` rather than `exact`; such results are useful candidate lists but are not a proof of global top-N optimality.

## Validation Summary

The current main validation matrix satisfies:

- fixed-team integer scoring matches the compatible baseline;
- HHWX exact search is not worse than the compatible baseline under the comparable objective;
- no bounded result is returned in the main matrix;
- event point display options are consistent;
- mission-live support band handling is validated;
- common large-card-pool paths remain below 10 seconds.

Release validation should continue to include automated formula checks, exact-search checks, and periodic 2000+ card-pool stress tests.
