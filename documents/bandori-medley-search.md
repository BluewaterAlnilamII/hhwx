# Greenfield Bandori Medley Search

Chinese version: [bandori-medley-search.zh-CN.md](bandori-medley-search.zh-CN.md)

## Status and authority

This document records the approved and now executable first checkpoint of the greenfield medley search. The scoring and product semantics remain authoritative in [the foundation specification](bandori-medley-foundation.md). Search choices here are reviewable engineering decisions, not game rules; changing them requires another integrated review rather than an isolated optimization.

The implementation remains independent of the existing team-builder and experiment branches. Existing Bestdori/current-main code may be inspected only to verify an already adopted compatibility contract. Calc reverse engineering informs where pruning and compact storage belong, not HHWX scoring, proof, dominance, or record layout.

## Exact problem

For each legal area-item configuration shared by all three teams, search owned and non-excluded physical cards for three teams assigned to the three fixed ordered song slots. Each team contains five different characters, physical cards cannot repeat across the medley, each song may select its own leader, and duplicate songs remain allowed without reordering.

The only formal objective is the proven top-1 sum of the three Bestdori-compatible average scores. Equal scores use one deterministic representative. Up to ten discovered high-average solutions may be retained diagnostically, but they are not proven global top-10 results.

## Search unit and lifetime

- Process one shared area-item configuration at a time; candidates from different configurations are never joined.
- Group the roster by character and enumerate a five-card physical set once. A leaf evaluates all five leaders against all three song slots, then retains the best deterministic leader per song.
- A compact leaf row contains five stable physical-card indexes, three exact binary64 song scores, and three leader indexes. Rich card and output objects are reconstructed only for the few retained medleys.
- Configuration-local candidates and indexes are released as soon as that configuration is proved complete or safely pruned.

Dense instance IDs follow decoded HHWX profile-card order. For each physical five-card set, search keeps ascending instance-ID order, removes the selected leader, and reinserts it at member index two; the other four members retain their relative order. Bound ordering and traversal order never enter scoring order.

## Proof-safe upper bound

For a non-negative integer inner note score `x` and active-skill deltas `d_i`, direct-add overlap gives the real-number inequality:

```text
floor(x * max(0, 1 + sum(d_i)))
    <= x + sum(ceil(x * max(d_i, 0)))
```

The bound may therefore discard negative deltas and upper-bound each activation independently while exact leaves retain every negative delta, state transition, overlap, and floor. The proof path also replaces each P/G inner note by its full-PERFECT inner score; this is an upward relaxation, not a change to exact leaf scoring. Per-card contributions remain contextual: they use the actual ordered chart, medley combo offset, trigger and inclusive-end timing, continued/rate-up behavior, area configuration, deck-power upper bound, and each still-reachable mixed/same-band/same-attribute team context. They are not permanent scalar card scores.

Across the fixed 120 first-five orders, every card occupies every trigger position exactly 24 times. After the note inequality is established, the first-five upper is therefore the sum of each member's five-position average; the selected leader contributes the sixth activation separately.

For a partial team, selected cards remain fixed and unresolved slots may independently take favorable remaining distinct-character parameter and skill contributions. Allowing parameter and skill maxima to come from different cards is a deliberate upward relaxation. The maximum over every still-reachable team context is used.

For one configuration, let `R[s]` be the root team upper for song slot `s`, temporarily allowing card reuse. If a partial team has slot upper `U[s]`, its whole-medley relevance upper is:

```text
max(U[0] + R[1] + R[2],
    R[0] + U[1] + R[2],
    R[0] + R[1] + U[2])
```

Only a strict upper below the incumbent may prune. Equality is retained, no epsilon is allowed, and a failed or unavailable proof becomes positive infinity and cannot prune.

The real-number inequality alone is insufficient for the reference binary64 result. A pruning bound must also use directed intervals or a proved error envelope covering the reference operation order: note arithmetic, P/G state accumulation, the stable 120-order sum and division, and the ordered three-song sum. Until that envelope is executable and replay-tested, the same bound may order traversal but must not prune.

## Search and exact join

1. Validate the normalized search input, hard-exclude marked cards, and preflight score/count/index ranges.
2. Find one deterministic legal fifteen-card assignment and score it exactly to seed the incumbent. Failure to find one is not a no-solution proof unless the feasibility search is complete.
3. Order area configurations by their whole-medley root upper.
4. Within one configuration, use depth-first character-group traversal. Recompute the contextual upper as choices become fixed; do not retain a global best-first frontier.
5. At a complete five-card set, run the production scorer for all leaders and songs. Store the compact row only if it can still participate in an incumbent-improving or tie-relevant medley.
6. Build three score-sorted index views over the same rows. Enumerate song-zero and song-one rows with monotone score cutoffs, reject physical-card overlap by their five indexes, and scan song-two rows in descending score until the first compatible row. Always calculate the final objective in song-slot order.
7. Release configuration-local storage after its exhaustive generation and exact join complete; retain only the global winner, the small diagnostic set, completion state, and aggregate counters.

The initial join has no full pair table, per-candidate roster bitset, or mandatory inverted index. A sparse card-to-candidate-rank index may be reviewed later only if measurements show the exact third-row scan dominates and its memory is justified.

## Completion and evidence

An exact result exists only after every legal area configuration and candidate family was exhausted or safely pruned. Cancellation, timeout, memory exhaustion, invalid data, arithmetic overflow, scorer disagreement, count/index overflow, or an internal failure returns incomplete with an optional diagnostic `bestSoFar`. Capacity estimates may reserve or fail explicitly; they never truncate candidates.

The minimal evidence suite is deliberately proof-oriented:

- bit-for-bit production/reference scorer parity;
- independent exhaustive whole-search comparison on tiny rosters and one or two configurations;
- pruning replay proving every pruned tiny family cannot exceed its recorded upper;
- one existing small real HHWX profile acceptance run after synthetic correctness is established.

Aggregate counters cover configurations, partial nodes, pruning, complete teams, exact scores, compact rows, join checks, conflicts, feasible medleys, incumbent changes, unavailable bounds, and peak candidate bytes. The memory budget and peak counter in this core cover compact candidate rows plus their three index views; whole browser/WASM incremental peak remains a later integration acceptance measurement. Counters diagnose the hard-input boundary but do not themselves prove exactness.

## Implemented checkpoint and stop line

The first implementation is single-threaded and includes the strict normalized contract, exact scorer, proved upper bound, character-group traversal, compact three-view join, explicit incomplete outcomes, an independent tiny exhaustive oracle, and an opt-in small real-profile acceptance run. It adds no dominance relation, same-character replacement, cross-character coverage, SIMD/FMA, score quantization, random retention, candidate cap, external storage, frontend/API connection, or speculative partitioning. If real hard inputs still approach exhaustive growth, the core upper bound is reviewed before any local optimization is proposed.

This checkpoint stops before frontend/API wiring and before post-search maximum-score hydration for the small diagnostic result set. Those are separate reviewed stages, not hidden work in the search core.
