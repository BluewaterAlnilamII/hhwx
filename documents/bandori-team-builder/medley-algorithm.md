# HHWX Bandori Medley Team Builder Algorithm

This document describes the HHWX Bandori medley team builder: the medley
optimization problem, scoring model, exact search contract, proof strategy,
validation gates, and implementation ownership.

Single-song search is a separate problem and is documented in
`single-song-algorithm.md`. Historical medley experiments and benchmark notes
live in `medley-algorithm-notes.md` and dated benchmark reports.

The Chinese version of this canonical document is
`medley-algorithm.zh-CN.md`; update both files together when the medley
algorithm contract changes.

## Problem Definition

Given:

- a player's owned cards;
- card level, training state, episode unlocks, Master Rank, and skill level;
- area items, character potentials, and character mission bonuses;
- exactly three song charts and difficulties;
- optional event bonus data;
- one accuracy model and one shared area-item search scope;

the goal is to find the best legal three-team medley assignment.

A legal medley result must satisfy:

- exactly three teams;
- each team has exactly five cards;
- no duplicate character inside one team;
- no duplicate `cardId` across the three teams;
- one shared global area-item configuration for all three teams;
- one song slot is assigned to each of the three teams.

Different cards of the same character may appear in different medley teams.
Because each individual team disallows duplicate characters, a character can
appear at most once per song slot and at most three times across the whole
medley.

The current medley search only optimizes score. It does not solve score-control
routes, real multi-live teammate team search, or event-point objectives.

## Input Data

The search depends on:

- user profile data: owned cards, levels, skill levels, Master Rank, training
  state, episode unlocks, exclusion flags, area items, character potentials, and
  character mission bonuses;
- master data: cards, characters, bands, attributes, skills, area items, songs,
  and charts;
- three song inputs, each containing a song master, chart, difficulty, and cache
  key;
- optional event bonus data, merged through the same shared scoring primitives
  used by single-song search;
- request parameters: result limit, perfect rate, server, max search duration,
  and area-item coarse filter.

New code should import the medley search entrypoint from:

```ts
import { searchBandoriBestMedleyTeams } from "@/lib/bandori/team-builder/medley";
```

Legacy compatibility facades remain at:

- `@/lib/bandori-medley-team-search`
- `@/lib/bandori-team-search`

## Scoring Model

### Shared Area Items

Area items are a global medley decision. The search enumerates one shared
configuration:

```text
(optional band item configuration, optional attribute item configuration, optional parameter item configuration)
```

Every card in all three teams is evaluated under that same configuration. This
is the main difference from running three independent single-song searches: an
item choice that is best for one song/team can be suboptimal globally once all
three disjoint teams are considered together.

### Slot Construction

The medley creates three song slots. Each slot reuses the single-song scoring
model with medley-specific live settings:

- `target = "score"`;
- `eventType = "medley"`;
- `liveType = "free"`;
- `useFever = false`;
- `useSpecialRoomBonus = false`;
- `comboOptions.useMedleyCombo = true`.

Combo is carried sequentially:

```text
slot 1 startCombo = 0
slot 2 startCombo = slot 1 note count
slot 3 startCombo = slot 1 note count + slot 2 note count
```

The note score formula is the same as the single-song formula:

```text
inner = floor(base * judge * combo * fever)
noteScore = floor(inner * skill)
```

Medley disables fever but still uses the medley combo carry-over. The medley
score is the sum of the three slot scores.

### Team Evaluation

Complete five-card team evaluation is delegated to the shared core evaluator.
Medley code must not reimplement note scoring, skill context resolution, leader
enumeration, or skill-window assignment.

For each candidate team, the core evaluator:

1. resolves same-band and same-attribute skill context after the full team is
   known;
2. evaluates possible leaders;
3. computes average score, max score, min score, representative skill order, and
   display fields.

### Inherited Single-Song Rules

Medley score mode inherits these single-song rules without changing their
formula:

- card power preparation, including level growth, training, episode, Master
  Rank, character potentials, character mission bonuses, and score-affecting
  event parameter bonuses;
- area-item effective power calculation under one selected global
  configuration;
- note timeline preprocessing and the per-note floor order;
- same-band and same-attribute skill context resolution after the full five-card
  team is known;
- leader enumeration and skill-window assignment;
- average, max, min, and display score hydration.

Medley overrides only the slot live context: score target, medley event type,
free-live scoring, no fever, no special-room bonus, and sequential combo
carry-over. Because the current medley target is score only, point-bonus event
point conversion, mission-live support band selection, score-control routing,
and multi-live teammate modeling are out of scope for this algorithm contract.

## Area-Item Search Scopes

The medley request accepts `coarseAreaItemFilter`:

- `mode = "all"`: search the full area-item configuration space. This is the
  exact proof mode for all configurations, and it can take minutes on large real
  profiles.
- `mode = "locked"`: search only the requested band/attribute and optional
  parameter subspace. Exact results prove only that locked subspace.
- `mode = "auto"`: allow the engine to pick a small set of promising coarse
  groups for responsiveness. Auto mode narrows the requested space and therefore
  must be reported as bounded unless the returned stats explicitly prove the
  requested scope.

If no coarse filter is provided for a large card pool, the search may apply auto
coarse behavior to avoid spending the entire budget on many area-item
configurations. Product UI must not label auto-coarse results as global exact
proofs for the full area-item space.

## Search Algorithm

At a high level, medley search does this:

1. Prepare calculated cards and shared area-item configurations.
2. Prune dominated area-item configurations.
3. Build three medley slots for the current shared configuration.
4. Generate incumbent results with slot candidate seeding, greedy orders,
   reverse song order, fixed-card-set optimization, and local neighborhood
   improvement.
5. Use root upper bounds to skip configurations whose optimistic score cannot
   beat the incumbent.
6. For hard exact-proof scopes, run exact candidate join before or after
   seeding.
7. Fall back to cross-slot DFS with safe remaining-slot upper bounds.
8. Return either an exact result or a bounded result with an observed upper
   bound gap.

Seeding is used only to improve the incumbent. It is never proof by itself.

### Where The Speedup Comes From

The expensive operation is not a single note-score calculation. The hard part is
proving that no compatible triple of five-card teams under any still-requested
area-item configuration can beat the incumbent.

The current speedup comes from:

- building a strong incumbent before proof work, so upper bounds have a useful
  threshold;
- pruning whole area-item configurations at the root when their optimistic score
  cannot beat the incumbent;
- generating high-value slot candidates in score order and proving unseen
  candidate frontiers instead of enumerating every legal team triple blindly;
- representing cross-slot card conflicts with bitsets so candidate-join checks
  stay cheap;
- using remaining-slot upper bounds in DFS only when exact candidate join does
  not close a configuration;
- exposing bounded gaps when proof work times out, instead of hiding the
  remaining uncertainty behind a heuristic "best effort" label.

This is why the main current bottleneck is the largest unproved locked
band/attribute/parameter subspace, not the initial discovery of a strong medley
team.

### Candidate Compression

Medley slot search uses the same safety principle as single-song compression:
cards and candidates may be removed only when a retained alternative dominates
them for every relevant slot and proof context.

The current large-card-pool proof path relies more on candidate generation and
upper-bound proof than on aggressive lossy compression. Any compression used in
an exact path must be justified as exact-safe.

### Upper Bounds And Pruning

Every pruning decision must use an optimistic upper bound. A bound may be loose,
but it must not underestimate any feasible completion.

The main upper-bound families live under `src/lib/bandori/team-builder/medley/upper/`:

- `capacity-assignment.ts`: dispatcher for remaining-slot upper bounds;
- `capacity-core.ts`: shared capacity DP and Pareto/bucketed state utilities;
- `card-bound.ts`: card-bound, card-specific coefficient, and Lagrangian models;
- `context-bound.ts`: band/attribute context grouping and context-bound models;
- `skill-context.ts`: slot branch score upper bounds with skill context;
- `witness.ts`: diagnostic explanation of proof gaps.

Witnesses and replay counters explain gaps. They do not participate in pruning
unless the corresponding upper-bound function is explicitly used by the search.

### Exact Candidate Join

The exact candidate-join path is the current hard-case proof engine for large
locked/all scopes. It lives in `experiments/exact-candidate-join.ts`, with
supporting helpers split into:

- `exact-candidate-join-constants.ts`;
- `exact-candidate-join-heap.ts`;
- `exact-candidate-join-bitsets.ts`.

The path works in three phases:

1. Generate score-ordered candidates for each medley slot under the current
   area-item configuration.
2. Prove pair/frontier upper bounds so unseen candidates cannot hide a better
   triple.
3. Search disjoint triples using card-conflict bitsets and score-ordered
   candidate lists.

The solver proves one area-item configuration at a time. A locked
band/attribute scope may still require proving multiple parameter configurations
under the same band/attribute pair.

For exact status, the candidate-join path must preserve these invariants:

- each slot candidate list is sorted by exact evaluated score for the active
  slot and area-item configuration;
- generated candidates either cover all teams that can still participate in a
  winning triple, or the slot/pair frontier upper proves that every omitted
  candidate is below the incumbent threshold;
- pair/frontier upper bounds must include the best possible compatible
  completion, even when the bound is loose;
- final triple search must check card-disjointness exactly, not by score or
  character proxy;
- a configuration is proven only when every candidate frontier that could beat
  the incumbent has been exhausted or safely bounded.

Failure to generate enough candidates is not a correctness failure; it is a
proof failure. The configuration then remains bounded and must be completed by
DFS or reported through the final observed upper-bound gap.

In large all-scope runs, the caller may intentionally skip DFS after an
unproved exact join when the candidate frontier has already produced a safe
observed upper bound. This is a runtime policy, not a proof shortcut: the
configuration remains unclosed, contributes to the final bounded gap, and keeps
the overall result from reporting exact unless its upper bound is later below
the incumbent.

All-scope exact-join pre-skip is deliberately opt-in. It must not be enabled by
default merely because a profile has many cards or an `Everyone` configuration.
The 2026-06-04 regression audit showed that default pre-skip made `P02` and
`P07` return fast bounded results by never entering exact join for configurations
that the 2026-06-02 matrix had proved exact. The recovery was to keep
`enableAllScopeExactJoinPreSkip` false unless a benchmark experiment explicitly
enables it, then validate the default path with `p02-p07-default-300` before any
full 40-case matrix run.

### Candidate And Memory Soft Limits

Candidate and workload soft limits are proof-budget controls, not correctness
shortcuts. If a limit fires before a configuration is closed, the configuration
remains unproved and the final response must stay bounded unless another proof
path closes it.

The default exact candidate-join candidate soft limit is `20000` and is
intentionally modest for small searches. For locked/all scopes with at least a
60s budget and 900+ calculated cards, the solver auto-raises the candidate soft
limit to `400000`. Frontend preview code should not lower this limit by default;
doing so can create early bounded results that diagnose the override rather than
the real proof frontier.

`optimization.memorySoftLimitMiB` is a best-effort runtime guard. In browser
workers the solver samples `performance.memory.usedJSHeapSize` every 50ms and
uses the lower of the configured MiB limit and 65% of the browser-reported JS
heap limit. When the guard fires, the response sets `memoryLimited = true`,
marks the run non-exhaustive, and reports bounded instead of claiming proof.

Browser memory APIs are incomplete. The JS heap counter may be lower than the
Chrome task-manager working set for a tab or dedicated worker. The guard reduces
OOM risk, but it is not a hard process-memory cap.

### Bounded DFS

When exact candidate join does not prove a configuration, DFS searches the
remaining cross-slot assignment space. DFS state includes:

- selected slot candidates;
- current score;
- banned card IDs;
- remaining slot indices.

At each node, the search computes a safe remaining upper. If:

```text
currentScore + remainingUpper < incumbentThreshold
```

the branch can be pruned. Otherwise the branch remains feasible and must be
searched or reported as part of the bounded gap if time expires.

## Exact And Bounded Results

A medley response contains:

- `results`: ordered medley results;
- `stats`: proof and timing status.

The result is proven optimal for the requested search scope only when:

```text
stats.searchMode === "exact"
stats.isExhaustive === true
stats.timedOut === false
stats.observedScoreUpperBoundGap === 0
```

If the run times out, applies auto coarse narrowing, or leaves any requested
space unproved, the result must be treated as bounded. Bounded results should
display the best observed score and `observedScoreUpperBoundGap` when available.

The current large all-scope path can produce bounded results without timing out.
That happens when it records an unresolved configuration upper and then skips
additional work that cannot recover exact status within the current run. Common
trace statuses are:

- `exact-unproved-skip-dfs`: exact candidate join aborted or remained unproved,
  and the all-scope high-card path preserved the observed exact-join upper
  instead of entering DFS fallback;
- `bounded-dominated-root-skip`: a previous unresolved configuration already
  has an upper bound at least as high as the current root upper, so proving the
  current configuration would not close the global bounded gap;
- `bounded-near-deadline-root-skip`: a same-coarse proof-time forecast shows
  that another exact join would likely consume the remaining budget, so the root
  upper is recorded and the response stays bounded rather than timing out.

Exact in a locked scope is not exact for the full area-item space. It proves
only the requested locked subspace.

## Correctness Argument

### Search-Space Coverage

For a requested `all` or `locked` scope, the search enumerates the relevant
area-item configurations after exact-safe dominance pruning. Each configuration
constructs the three medley slots under the same shared area-item choice.

Within a configuration, exact candidate join and DFS both enforce:

- five cards per team;
- no duplicate character inside a team;
- no duplicate card across slots;
- the shared area-item configuration;
- the medley combo carry-over for each slot.

### Pruning Safety

A branch or configuration may be pruned only when an optimistic upper bound is
below the incumbent threshold. Upper-bound code must document why the bound
cannot underestimate any feasible completion.

If a bound is diagnostic, heuristic, or used only for ordering, it must not
contribute to exact proof status.

### Exact Candidate Join Safety

Exact candidate join is safe when both conditions hold:

1. generated candidates cover every candidate that could still participate in a
   better triple, or the unseen frontier upper proves that omitted candidates
   cannot beat the incumbent;
2. final triple search checks card disjointness exactly.

If candidate generation aborts, a deadline fires, or an unseen upper remains
above the incumbent threshold, the configuration is not proven and the overall
run remains bounded unless another proof path completes it.

### Exact Result Condition

The final response reports exact only when all requested configurations are
exhausted or safely pruned and no timeout occurred. Auto-coarse narrowing blocks
full-scope exact reporting because it changes the requested search space.

## Difference From Baselines

Three independent single-song searches are useful as a performance and formula
reference, but they are not a medley optimality oracle. They do not jointly
choose one shared area-item configuration, and they do not solve the global
cross-slot `cardId` disjointness constraint.

Strict 3x greedy baselines are also reference material only. A greedy assignment
can find a strong incumbent quickly, but it cannot prove that a weaker-looking
slot-local team is not required for a better global triple after shared items
and card conflicts are considered.

The frontend preview contains a temporary `legacy-greedy-single` comparison
mode. It still enumerates shared area-item configurations, orders them by a
cheap static potential estimate, and skips a configuration only when safe upper
bounds cannot beat the current greedy result. The skip checks include summed
per-slot root upper bounds and, during the fixed `3/2/1` strict greedy seed,
banned-card-aware remaining-slot upper bounds. The seed finds the best available
team for slot 3, removes those card IDs, then repeats for slots 2 and 1. It
enforces cross-slot card disjointness and medley combo carry-over. It is useful
for user-facing comparison only; it is not a proof path, does not report
bounded/exact status, and should remain removable without changing the public
medley search API.

The saved Bestdori-compatible material is still useful for formula compatibility
and historical comparison. It does not provide an exact proof for HHWX medley
search because the medley problem includes shared item coupling, sequential
combo carry-over, and global card-disjoint team assignment.

HHWX medley differs by:

- enumerating or safely pruning every requested area-item configuration;
- evaluating each complete slot team with the shared core score evaluator;
- proving cross-slot card disjointness exactly;
- returning `exact` only when every requested configuration is exhausted or
  safely bounded below the incumbent;
- returning `bounded` with an observed upper-bound gap when proof is incomplete.

## Performance Design

The current performance design is shaped by large real profiles with 1000+
owned cards:

- find a strong incumbent early;
- prune area-item configurations at the root when possible;
- use exact candidate join for hard large locked/all scopes;
- keep optional heavy upper-bound families off unless they pay for themselves;
- expose proof gaps instead of hiding bounded uncertainty.

The current 120s milestone is intentionally conservative:

- the fixed 10-profile all-mode sample must prove exact within 300s per profile;
- known single locked / single configuration hard cases must prove exact within
  120s;
- known locked band/attribute hard cases must prove exact within 120s.

Current evidence is split into two tiers:

- the tracked wrapper gate keeps the fixed none-event all-mode sample exact
  within 300s/profile and the known locked/single hard cases exact within 120s;
- the broader 2026-06-02 event matrix covers 10 real profiles across
  `none`, `323`, `244`, and `260` with a 300s limit. It completed without
  timeout and proved `36/40` all-scope cases exact. The median all-scope elapsed
  time was `51919ms`, P95 was `231981ms`, and max was `295714ms`.

The broader matrix is evidence that most sampled scenarios now finish within a
reasonable 300s budget, but it is not a guarantee of exact completion for every
event/profile combination. The four bounded cases were retained because their
unresolved upper bounds remained close enough to the incumbent that proving or
eliminating them would require more proof work.

60s is not yet a stable guarantee for all tracked hard cases.

## Implementation Ownership

Medley implementation files:

- `search.ts`: public orchestration, configuration ordering, exact/bounded
  finalization;
- `slots.ts`: medley slot construction, combo carry-over, slot candidate
  helpers;
- `candidates.ts`: candidate evaluation, score ordering, candidate cache
  behavior;
- `configurations.ts`: shared area-item configuration ordering and coarse
  filters;
- `results.ts`: medley result assembly and sorting;
- `profiling.ts`: diagnostic counter initialization;
- `upper/`: safe proof upper-bound models and witnesses;
- `experiments/exact-candidate-join.ts`: exact candidate-join proof path;
- `experiments/conflict-bnb.ts`: alternate exact subsolver experiment.

Dependency direction must remain:

```text
medley -> core
single -> core
core -> no single / medley imports
```

New medley code should import shared scoring and team-evaluation behavior from
`core`, not from `single`.

## Validation Gates

### Portable Project Checks

Run after structural or type-contract changes:

```powershell
npx.cmd tsc --noEmit --pretty false
node --check scripts\bandori-medley-hard-case-benchmark.cjs
git diff --check
```

`git diff --check` may print LF/CRLF warnings on Windows; those are not
whitespace errors.

### Hard-Case Benchmark Gate

Run the current fixed 120s gate:

```powershell
node .\scripts\bandori-medley-hard-case-benchmark.cjs gate-120
```

Important shorter spot checks:

```powershell
node .\scripts\bandori-medley-hard-case-benchmark.cjs focus-6-300
node .\scripts\bandori-medley-hard-case-benchmark.cjs p02-p07-default-300
node .\scripts\bandori-medley-hard-case-benchmark.cjs p05-visual
node .\scripts\bandori-medley-hard-case-benchmark.cjs p01-locked
```

`focus-6-300` is the preferred pre-matrix check for current all-scope optimizer
work. It runs the six retained focus cases `P02:260`, `P04:260`, `P08:323`,
`P10:244`, `P04:244`, and `P08:260`, records exact-join diagnostics, and samples
peak process working set in MiB. Run the full 40-case `all-300` matrix only
after this focus set is acceptable.

`p02-p07-default-300` is the regression guard for the all-scope exact-join
pre-skip recovery. It must use the default optimizer path, with no optimization
JSON override. The expected diagnostic shape is that `P02:none`, `P02:244`,
`P02:323`, and all four `P07` event cases are exact; `P02:260` may remain
bounded, matching the 2026-06-02 baseline class. If these cases become fast
bounded with zero exact-join calls, inspect any newly enabled pre-skip or
unclosed-configuration shortcut before running the full matrix.

The latest detailed evidence is recorded in
`medley-real-profile-benchmark-2026-05-31.md`.

The latest broader event-matrix evidence is
`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-02T04-06-27-272Z.json`.
It is review evidence, not a wrapper gate: exact completion was `36/40` with no
timeouts under the 300s limit, and the four bounded rows are documented in the
benchmark report.

Passing this gate means:

- the tracked all-mode sample proves exact within the wrapper's 300s profile
  limit;
- the tracked locked/single hard cases prove exact within 120s;
- no scenario reports timeout or a positive observed upper-bound gap when the
  wrapper expects exact.

It does not mean every possible real profile is guaranteed within 60s.

### Frontend Contract Check

Before frontend integration, compare UI assumptions with
`medley-frontend-contract.md`. Product UI should depend on stable request and
response fields only:

- `BandoriMedleyTeamSearchInput`;
- `BandoriMedleyAreaItemCoarseFilter`;
- `BandoriMedleyTeamSearchResponse`;
- `stats.searchMode`, `stats.isExhaustive`, `stats.timedOut`,
  `stats.observedScoreUpperBoundGap`, and `stats.elapsedMs`.

Do not build product behavior around individual profiling counters or
`configurationTrace`. The current preview may copy diagnostic counters and
configuration trace into a debug report for maintainers, but those fields should
not become durable UI contracts.

Before shipping the UI, run at least:

```powershell
node .\scripts\bandori-medley-hard-case-benchmark.cjs focus-6-300
node .\scripts\bandori-medley-hard-case-benchmark.cjs p05-visual
node .\scripts\bandori-medley-hard-case-benchmark.cjs p01-locked
```

and manually verify that the UI exposes running state, elapsed time,
cancellation, proof status, early-stop reasons, memory/debug information, and
bounded gap display without exposing raw `exact` / `bounded` strings as
user-facing labels.

## Remaining Risks And Future Work

- The 120s gate is satisfied for the fixed hard-case sample set, but 60s is not
  yet guaranteed.
- Full all-mode proof can take close to the 300s review budget on hard real
  profiles, so frontend integration needs cancellation and clear status display.
- Some all-scope event/profile combinations still return bounded within the
  300s budget when multiple configuration uppers remain close to the incumbent.
- As of the 2026-06-04 `focus-6-300` audit, the current hard failures split into
  three classes:
  - `P08:260` is dominated by exact-join solve time and third-candidate fallback
    scans. It reached 300s bounded after about `224.7s` in solve, with roughly
    `27.7B` fallback word scans.
  - `P08:323` and `P10:244` are candidate-fill soft-limit cases at the automatic
    `400000` candidate limit. Raising that limit globally is not acceptable;
    any extension must be guarded by remaining budget and proof impact.
  - `P04:260` now has a small bounded gap but spends almost the full 300s budget
    in pair upper, candidate fill, and solve work. It needs tighter
    configuration-level upper closure or cheaper solve-workload pruning.
- The largest remaining proof opportunity is cross-parameter sharing inside a
  locked band/attribute scope, a tighter post-incumbent upper that can prove
  non-winning parameter configurations without full exact candidate join, and
  faster third-candidate lookup in exact-join solve.
- `medley-algorithm-notes.md` still contains historical experiments and should
  be treated as maintenance context, not the canonical contract.
