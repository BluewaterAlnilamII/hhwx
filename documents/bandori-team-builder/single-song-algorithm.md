# HHWX Bandori Single-Song Team Builder Algorithm

This document describes the HHWX Bandori single-song team builder: the game
model, scoring model, exact search contract, performance design, correctness
argument, validation gates, and implementation ownership.

Medley search is a separate optimization problem and is documented in
`medley-algorithm.md`.

## Problem Definition

Given:

- a player's owned cards;
- card level, training state, episode unlocks, Master Rank, and skill level;
- area items, character potentials, and character mission bonuses;
- a song chart and difficulty;
- optional event bonus data;
- live type, accuracy model, and optimization target;

the goal is to find the best legal five-card team.

A legal main team must satisfy:

- exactly five cards;
- no duplicate character;
- no excluded card;
- one shared global area-item configuration for the whole team.

Optional request constraints can further narrow the legal result set:

- `minLeaderScoreUpPercent` requires the selected leader's resolved score-up
  value to meet or exceed the threshold. Conditional skills are checked after
  the full five-card team context is known, so an untriggered conditional
  high-value skill does not qualify by its displayed maximum. When this
  constraint is active, search uses team-context partitions even for smaller
  pools so same-band and same-attribute leader bounds are evaluated in the
  context where they would actually trigger.
- `minTotalPower` requires the final five-card team power after the active
  area-item configuration and event parameter bonuses to meet or exceed the
  threshold. Support band power, room power, and other-player power are not part
  of this value.

The current single-song search supports three targets:

- `score`: maximize song score.
- `eventPoint`: maximize event points.
- `mission_live + eventPoint`: maximize mission-live event points, including the
  support band contribution.

The current model does not solve score-control routes, real multi-live teammate
team search, or medley three-team coupling. When `perfectRate < 1`, the model
simulates PERFECT and GREAT outcomes only; non-PERFECT notes are treated as
GREAT. GOOD, BAD, MISS, and combo-break probabilities are not modeled.

## Input Data

The search depends on:

- user profile data: owned cards, levels, skill levels, Master Rank, training
  state, episode unlocks, exclusion flags, area items, character potentials, and
  character mission bonuses;
- master data: cards, characters, bands, attributes, skills, area items, songs,
  and charts;
- event bonus data from `bandori_event_bonuses`, optionally merged with a manual
  `bonusOverride`;
- request parameters: song, difficulty, event, live type, target, perfect rate,
  room power, external multi-live skills, and default display values for Live
  Boost or CP.

## Scoring And Event Model

### Card Power

Each candidate card is converted into a static card state before search:

1. Compute current-level three-parameter base values using the rarity growth
   curve. Non-max levels do not use linear interpolation.
2. Add training, episode, and Master Rank bonuses.
3. Add character potentials and character mission bonuses.
4. Filter excluded cards.
5. Add event parameter bonuses when the event type affects song score.
6. Compute effective power under each global area-item configuration.

Area items are not maximized independently per item group. The algorithm
enumerates one global configuration:

```text
(optional band item configuration, optional attribute item configuration, optional parameter item configuration)
```

Each layer may be empty, meaning this global configuration chooses no item from
that category. In practice, empty band and attribute configurations are omitted
when the player owns usable band or attribute items, because area-item bonuses
are non-negative and the empty configuration is then dominated. The parameter
layer explicitly includes an empty option and then passes all configurations
through the same dominance pruning. Every card in a candidate team is evaluated
under the same configuration.

### Chart And Note Score

The chart is preprocessed into a reusable note timeline:

- parse scoring notes from Single, Directional, Long, and Slide notes;
- compute note time, combo multiplier, and fever multiplier;
- compute the six skill windows from skill notes and skill duration.

Game design keeps the six skill windows non-overlapping, so window
contributions are additive.

The per-note score formula is:

```text
inner = floor(base * judge * combo * fever)
noteScore = floor(inner * skill)
```

The song score is the sum of all `noteScore` values.

For multi live, HHWX follows the saved Bestdori-compatible scoring convention:
room score uses the unrounded own average score and floors only after adding
the other-player score estimate:

```text
roomScore = floor(rawAverageScore + otherTeamScore)
```

In the Bestdori-compatible wrapper this corresponds to
`Math.floor(entry.score + entry.teamScore)`, while the displayed own score may
still be `Math.floor(entry.score)`.

`otherTeamScore` is derived from the room score rate and the other players'
power, so it can be fractional. Flooring the own average score first changes
the result when
`frac(rawAverageScore) + frac(otherTeamScore) >= 1`; those teams end up one
point lower than the Bestdori-compatible raw-average formula.

This rule matters for validation because the displayed own score and the room
score intentionally use different rounding points: display may show a floored
own score, while room score and event-point calculation use the raw average
before the final room-score floor.

### Skill Resolution

Skills must be resolved after the full five-card team is known, because some
skills depend on team context:

- all members belonging to the same band;
- all members having the same attribute;
- PERFECT-only score-up;
- score-up rate increasing on each PERFECT note.

A skill cache key cannot be only `skillId + skillLevel`. HHWX includes at least:

- `skillId`;
- `skillLevel`;
- `server`;
- `sameBandId`;
- `sameAttribute`.

Current support includes regular score-up skills, same-band and same-attribute
conditional score-up skills, PERFECT-only skills, below-GREAT reduction,
below-GREAT interruption, and per-PERFECT increasing rates. In the current
PERFECT/GREAT-only model, below-GREAT interruption does not occur and below-
GREAT reduction only matters for outcomes the model does not currently
simulate.

### Full-Team Score Evaluation

For each complete five-card team, HHWX:

1. recomputes same-band and same-attribute context;
2. resolves each card's real skill behavior;
3. enumerates the five possible leaders;
4. scores free live by assigning the six trigger windows to the five team
   skills, with the sixth activation handled by the leader skill;
5. scores multi live with four fixed external player skills plus the selected
   leader skill, then handles the sixth activation according to the encore
   source;
6. computes average score, max score, min score, representative max-score skill
   order, and display fields.

Because skill windows are non-overlapping, max/min assignment can be solved
exactly with bitmask DP. The reachable DP states are the used-skill masks
(`2^5` masks), and the transition count is roughly `5 * 2^5`. This is
equivalent to enumerating all `5!` full permutations for this model, but it
reuses partial assignments and is easier to extend to min/max scores and plan
counts.

For example, mask `00101` means skills 1 and 3 have already been assigned; the
next transition only tries skills not present in that mask.

### Event Points

Parameter-bonus events add bonuses directly to card power. For those events,
event point maximization is equivalent to score maximization because the event
bonus affects score-producing power.

Point-bonus events first compute song score or room score, then compute base
points and main-team point bonus:

```text
eventPointBase = floor(basePt(score, roomScore) * (1 + mainPointBonusRate))
eventPoint = floor(eventPointBase * liveBoostMultiplier)
```

`basePt(score, roomScore)` is selected by event type and event data. The search
algorithm only requires the monotonic relationship between score, room score,
and resulting base points.

Challenge Live, Versus Live, Team Festival, Live Boost, CP, ranking, and win/loss
flags can affect result display, but they do not change the relative team order
unless they change the score or point formula used by the active target. Results
carry `eventPointOptions` so the UI can switch display values without rerunning
the search.

### Mission-Live Support Band

`mission_live + eventPoint` enables support-band scoring.

Rules:

- support candidates come from owned, non-excluded cards;
- a support card cannot reuse a main-team `cardId`;
- support band members cannot repeat characters;
- a different card of the same character as a main-team card may be used in
  support;
- support power is computed from the card itself plus mission-live event bonus;
- support does not use area items;
- support affects event points only. It does not affect song score, main-team
  power, skill context, or area-item configuration.

Mission-live search must model support opportunity cost. A strong card can be
valuable in the main team and also be one of the best support candidates; using
that card in the main team may remove support power from the remaining support
pool. HHWX therefore includes support power in candidate compression and upper
bounds instead of treating support as a display-only post-processing step.

Once the main team is fixed, the support problem is:

```text
choose up to five support cards with distinct characters, excluding main-team cardIds, maximizing supportPower sum
```

For each character, only the available card with the highest `supportPower` can
matter. Taking the top five remaining character representatives is optimal.

Mission-live event point order is:

```text
eventPoint =
  floor(basePt(score, roomScore) * (1 + mainPointBonusRate))
  + floor(supportBandPower / 3000)
```

Point-bonus targets usually cost more than pure score targets. A score target
can rank candidates mostly by score-producing power and skill contribution. An
event-point target must additionally track main-team point bonus, convert score
or room score through the event formula, and keep objective-specific upper
bounds. The heaviest current path is `mission_live + multi + eventPoint`,
because it also includes room score, support opportunity cost, support upper
bounds, and real support selection.

## Search Algorithm

Each area-item configuration is searched independently:

1. Compute effective power for every card under that configuration.
2. Drop globally dominated configurations.
3. Compress dominated candidate cards safely.
4. Evaluate high-potential seed teams to establish a top-N threshold early.
5. Run branch-and-bound DFS over five distinct characters.
6. Apply request constraints by safe power bounds or by exact full-team
   evaluation.
7. Resolve real skill context and exactly score each complete team that survives
   bounds.
8. Sort results by target value, then by score or power tie-breakers, leader
   skill strength, and stable card IDs.

The DFS state tracks selected cards, used-character bitset, current power,
current point bonus, support opportunity cost, team context state, and active
upper-bound data.

HHWX does not use fixed Top-K candidate clipping in exact mode. Heuristics may
order branches, build stronger thresholds, or produce bounded fallback results,
but they must not remove a candidate from the exact search space unless the
removal has a safety proof.

### Where The Speedup Comes From

The main performance gain does not come from making a single score formula
evaluation substantially less costly. It comes from preventing weak branches from
reaching the high-cost part of the pipeline: real skill-context resolution,
leader comparison, skill-window scoring, event-point conversion, support-band
selection, and result object construction.

The important mechanisms are:

- candidate compression reduces DFS width before five-card enumeration starts;
  because a team has five card slots, even moderate per-character reduction can
  compound into a much smaller team space;
- seed teams fill the top-N list early, so branch-and-bound has a useful
  threshold sooner;
- suffix upper-bound indexes make the frequent "can this branch still enter
  top-N?" check low-cost enough to run throughout DFS;
- objective-specific bounds use score, point bonus, and support-band dimensions
  according to the selected target instead of using one generic power proxy;
- the optional correlated bound removes near-threshold optimistic combinations
  that cannot be realized by any remaining card set;
- mission-live support opportunity cost is included before real support
  selection, so branches affected by support opportunity cost can be rejected
  before scanning and constructing the actual support band;
- target-only evaluation delays detailed max/min skill order, support card
  details, and display metadata until a team can enter the current top-N list.

In short, HHWX uses low-cost checks to prove many branches cannot affect the
result list, and reserves high-cost exact scoring for teams that still can.

### Objective Adapters

The three single-song targets share one branch-and-bound kernel. Target-specific
adapters define which dimensions matter:

```text
score:
  score upper bound

eventPoint:
  score upper bound
  main-team point bonus upper bound

mission_live + eventPoint:
  score upper bound
  main-team point bonus upper bound
  support-band point upper bound
```

This keeps scoring, area-item enumeration, card preparation, chart preparation,
and bound infrastructure shared while preserving target-specific pruning rules.

### Candidate Compression

Candidate compression may delete only cards that are provably dominated.

Base dominance requires:

- same character;
- same skill signature;
- same band;
- same attribute;
- effective power no lower than the deleted card under the active configuration.

`eventPoint` also requires point bonus no lower than the deleted card.

To let card A dominate card B for `mission_live + eventPoint`, A must also have
`supportPower` no higher than B. This means replacing B with A in the main team
does not damage the remaining support pool more than B would have. Without this
condition mission-live support optimization could be changed by compression.

This condition is intentionally opposite to the usual "higher is better" rule:
for a main-team replacement, high support power can be a cost. If card A is a
stronger main card but also the best support card for its character, replacing B
with A may remove more support power from the support pool.

The skill signature is intentionally more specific than `skillId`. It includes
duration, unification condition type, unification band, unification effect
value, and relevant score-effect types, values, conditions, and life thresholds.

### Upper Bounds And Pruning

An upper bound is an optimistic estimate of the best result still reachable from
a partial branch. If even the optimistic estimate cannot reach the current
top-N threshold, the branch can be discarded without losing an exact result.

Pruning may use only non-underestimating upper bounds. Current upper bounds
include:

- remaining character maximum power;
- remaining character skill contribution;
- remaining point bonus;
- context-specific bounds for `both`, `same-band`, `same-attribute`, and
  `mixed`;
- area-configuration root bound;
- global support-band point bound for mission live;
- final optimistic target value before full result hydration.

The branch threshold is the current N-th result in the sorted result list, where
N is `resultLimit`. Before the list has `resultLimit` entries, score and target
threshold pruning is disabled because there is no complete top-N boundary.

The first-level bound is low-cost and called frequently. The second-level bound is
attempted only near the current threshold. It uses a small Pareto/DP estimate to
bind remaining power, skill contribution, and point bonus together instead of
combining unrelated maxima from different cards. If the tighter bound cannot be
proven safe or is too expensive, the search falls back to the first-level bound.

Changing the threshold window for attempting the correlated bound affects speed
only; it must not affect exactness.

### Seed Teams

Seed teams are used only to raise the top-N threshold earlier:

- `score`: prioritize high power and high skill potential;
- `eventPoint`: mix power and point bonus;
- `mission_live + eventPoint`: also penalize high support opportunity cost for
  main-team cards.

Poor seeds can make the search slower, but they cannot change correctness
because DFS still covers the full exact search space.

### Caches

Current cache layers include:

- chart timeline by `chartCacheKey + fever`;
- inner score rate by chart, accuracy, and combo options;
- skill-window contribution by skill, skill level, context, and accuracy;
- skill rate profile by chart, server, skill, and context;
- per-request effective-power matrices for area-item configurations;
- worker-lifetime fetch promises for master data, charts, and event bonuses,
  invalidated on failure.

These caches reduce repeated work only. They must not change the search space or
the final score formula.

### Target-Only Evaluation And Hydration

Full result objects are expensive to build. The search therefore separates:

- target-only evaluation: compute only the score, room score, event points,
  leader, and fields needed to sort the team;
- hydration: build detailed skill order, max/min score fields, support cards,
  and display metadata only when the team can enter the current top-N list.

This does not change scoring. It delays result-object construction.

## Exact And Bounded Results

`searchMode = "exact"` is allowed only when DFS finishes full enumeration and
every pruned branch was rejected by a safe upper bound.

If the time budget interrupts the search, the response must be marked bounded:

- `searchMode = "bounded"`;
- `isExhaustive = false` or `timedOut = true`;
- any reported upper-bound gap is remaining uncertainty, not additional score
  achieved by the listed team.

The UI must not present bounded results as proven optimal.

## Correctness Argument

### Search-Space Coverage

Every legal solution consists of:

```text
area configuration
+ five main cards with distinct characters
+ leader choice
+ skill-window assignment
+ optional support band
```

The algorithm enumerates every area-item configuration and every legal
five-card team under that configuration. For a complete team, it evaluates every
leader choice and computes the exact skill-window assignment. For mission live,
once the main team is fixed, the support band is solved optimally. Therefore,
every unpruned legal team is scored exactly.

### Compression Safety

If card A dominates card B, both cards have the same character and cannot appear
in the same main team. For any legal team containing B, replacing B with A keeps
the character set and skill-relevant identity unchanged, does not reduce power,
does not reduce point bonus, and in mission-live mode does not increase support
opportunity cost. The replacement objective value is therefore no worse, so
deleting B cannot delete the unique optimum.

### Pruning Safety

Every branch upper bound is the exact current partial value plus optimistic
remaining contribution. It may overestimate the best completion, but it must not
underestimate it. If even that optimistic value is below the current top-N
threshold, no completion under the branch can enter the result list, so pruning
is safe.

The final-power constraint follows the same rule: a branch can be discarded only
when selected power plus the best remaining distinct-character power upper bound
is still below `minTotalPower`.

### Support-Band Greedy Optimality

With the main team fixed, support selection is a maximum-sum choice of up to
five cards with distinct characters after excluding main-team card IDs. Only the
best available card for each character can be useful. Taking the top five
character representatives is therefore optimal.

### Exact Result Condition

The result can be called exact only when all area configurations and all DFS
branches have either been fully evaluated or pruned by safe bounds. If the time
budget stops the search, the result is bounded, even if the incumbent team looks
strong.

## Difference From Bestdori-Compatible Baseline

The Bestdori-compatible baseline is local validation material, not an external
runtime dependency. HHWX uses it to check formula compatibility and compare
performance against the saved Bestdori Team Builder asset bundle used during
validation. It is not distributed as a public reproducibility suite.

Bestdori Team Builder is an important reference for both formula compatibility
and performance comparison. The saved Bestdori-compatible baseline uses
heuristic search, compact skill representations, and cached score estimates; it
is useful as a controlled comparison target, but it does not provide an exact
optimality proof. Historically, compact skill estimates keyed close to
`skillId + skillLevel` cannot fully express same-band or same-attribute
conditions in partial-team search.

HHWX differs by:

- enumerating the legal search space and pruning only with safe upper bounds;
- resolving skill context after the full five-card team is known;
- including mission-live support in the exact target and upper bounds;
- enumerating global area-item configurations rather than maximizing each group
  independently;
- using raw average score in multi-live `roomScore`;
- explicitly returning `exact` or `bounded`.

The Bestdori-compatible baseline is therefore a formula and performance
reference, not an exact-search correctness oracle.

## Implementation Ownership

The current implementation is split into these layers:

- `src/lib/bandori/team-builder/core/`: shared game-rule and scoring primitives.
  It owns card preparation, chart preparation, event handling, score
  calculation, five-card team evaluation, common upper bounds, and shared data
  contracts.
- `src/lib/bandori/team-builder/single/`: single-song search orchestration. It
  owns single-song scopes, objective adapters, seed teams, result ordering,
  stats finalization, and exact DFS.
- `src/lib/bandori-team-search.ts`: public compatibility entrypoint that
  re-exports the single-song search API.

The core layer must not import `single` or `medley`.

## Validation Gates

### Portable Project Checks

The portable project gates are:

```powershell
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
```

### Local Historical Validation

The historical Bestdori-compatible validation runner lives under
`temp/bandori-team-builder/` in local working copies and is not part of the
tracked source tree. When that local runner and fixture data are available, run:

```powershell
node temp\bandori-team-builder\validate-bestdori-hhwx-scoring.cjs
```

### Release Validation

Before release, also run the Supabase-backed main matrix when the local runner,
credentials, and network are available:

```powershell
$env:HHWX_VALIDATE_INCLUDE_SUPABASE='1'
$env:HHWX_VALIDATE_SUPABASE_PROFILE_LIMIT='12'
node temp\bandori-team-builder\validate-bestdori-hhwx-scoring.cjs
```

Blocking conditions for the Bestdori-compatible validation report:

- `assetGate.ok !== true`;
- `strictFailureCount > 0`;
- `fixedScoringFailureCount > 0`;
- `searchWorseThanBaselineCount > 0`;
- `boundedCount > 0`;
- `eventPointOptionsFailureCount > 0`;
- `uiDisplaySwitchFailureCount > 0`;
- `performanceGateFailureCount > 0`;
- `productionReady !== true`.

The latest retained single-song validation summary is:

| Metric | Value |
| --- | ---: |
| caseCount | 46 |
| supabaseProfileCount | 10 |
| failureCount | 0 |
| strictFailureCount | 0 |
| fixedScoringFailureCount | 0 |
| searchWorseThanBaselineCount | 0 |
| boundedCount | 0 |
| eventPointOptionsFailureCount | 0 |
| uiDisplaySwitchFailureCount | 0 |
| performanceGateFailureCount | 0 |
| productionReady | true |

Recent benchmark maxima from `fix-pass2-supabase-main-report.json`:

| Scenario | HHWX max ms | Compatible baseline max ms | Approx speedup |
| --- | ---: | ---: | ---: |
| 1329-card pool, song 595 expert, no event | 1613 | 9638 | 6.0x |
| 1889-card pool, song 686 expert, no event | 2061 | 11753 | 5.7x |
| 1889-card pool, song 306 challenge | 1857 | 8238 | 4.4x |
| 1889-card pool, song 307 mission multi | 7922 | 89377 | 11.3x |
| 1889-card pool, versus display | 1915 | 12251 | 6.4x |
| 1889-card pool, festival display | 2356 | 12936 | 5.5x |
| Supabase sample free perfect | 2440 | 24640 | 10.1x |
| Supabase sample free perfect 95% | 2291 | 19707 | 8.6x |
| Supabase sample challenge 306 | 1901 | 10903 | 5.7x |
| Supabase sample mission 307 multi | 8106 | 90351 | 11.1x |

These numbers are design evidence from a local validation environment. They are
not a universal benchmark claim against every Bestdori version or runtime.

## Remaining Risks And Future Work

- Supabase long-matrix validation has previously been interrupted by network
  `fetch failed / ECONNABORTED`. That is a validation-environment stability
  issue, not an algorithm failure, but release validation should include one
  complete long run.
- 2000+ simulated pools should be stress-tested periodically to confirm exact
  search does not regress into bounded mode.
- Stronger per-character skyline compression, meaning a non-dominated set within
  each character, could compare skill-window contribution vectors rather than
  only power and scalar skill bounds.
- More specialized band/attribute suffix indexes could keep separate remaining
  best-value tables for `same-band`, `same-attribute`, `both`, and `mixed`
  branches, making branch upper bounds tighter.
- A top1-first UI path, meaning proving the first result before filling the rest
  of top-N, would need the API to mark exactness by stage so the UI does not
  imply that unfinished lower ranks are also proven.
