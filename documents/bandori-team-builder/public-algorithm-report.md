# HHWX Bandori Single-Song Team Builder Algorithm

This report describes the implementation, correctness argument, and performance characteristics of the HHWX Bandori single-song team builder.

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

## Power and Scoring Model

### Card Power

Each candidate card is converted into a static card state before search:

1. Compute current-level three-parameter base values using the rarity growth curve.
2. Add training, episode, and Master Rank bonuses.
3. Add character potentials and character mission bonuses.
4. Add event parameter bonuses when the event type affects song score.
5. Compute effective power under each global area-item configuration.

Area items are not maximized independently per item group. The algorithm enumerates one global configuration:

```text
(band item set, attribute item set, parameter item set or none)
```

Every card in a candidate team is evaluated under the same configuration.

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

Flames, challenge CP, placement, win/loss, and similar display parameters do not change team ordering. They can be switched in the result view without running search again.

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

### Support-Band Greedy Optimality

With the main team fixed, support selection is:

```text
choose up to five cards with distinct support characters
to maximize total supportPower
```

For each character, only the highest available support-power card can matter. Taking the best five remaining character representatives is optimal. Sorting all support candidates by support power and skipping duplicate characters is equivalent to that optimum.

### Exact Result Condition

The result is marked:

```text
searchMode = "exact"
```

only when the search completes and every skipped branch is justified by a safe upper bound. If a time budget interrupts the search, the result must be marked bounded and must not be presented as proven optimal.

## Difference from Bestdori Team Builder

Bestdori Team Builder is an important reference, but its team search is heuristic and does not provide an exact optimality proof. Its historical implementation also relies on context-insensitive skill estimates keyed around `skillId + skillLevel`, which cannot fully represent same-band and same-attribute conditions during optimization.

HHWX differs in several ways:

- It enumerates the full legal search space and prunes only with safe upper bounds.
- It resolves skills after the complete five-card team is known.
- It correctly handles same-band, same-attribute, PERFECT-only, and increasing-rate skills under the real team context.
- It enumerates area items as one global team configuration.
- It includes mission-live support bands in both exact scoring and upper bounds.
- It explicitly reports whether a result is exact or bounded.

HHWX is therefore not a reimplementation of Bestdori's heuristic search. It is an exact search engine using compatible scoring formulas where possible.

## Aggregated Performance Comparison

The following benchmark figures compare HHWX against a local Bestdori-compatible baseline on the same machine and comparable inputs.

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

## Validation Summary

The current main validation matrix satisfies:

- fixed-team integer scoring matches the compatible baseline;
- HHWX exact search is not worse than the compatible baseline under the comparable objective;
- no bounded result is returned in the main matrix;
- event point display options are consistent;
- mission-live support band handling is validated;
- common large-card-pool paths remain below 10 seconds.

Release validation should continue to include automated formula checks, exact-search checks, and periodic 2000+ card-pool stress tests.
