# Greenfield Bandori Medley Search

Chinese version: [bandori-medley-search.zh-CN.md](bandori-medley-search.zh-CN.md)

## Authority and exact problem

This records the approved, reviewable search design, not additional game rules. [The foundation specification](bandori-medley-foundation.md) controls scoring and product semantics. The implementation is independent of the existing team-builder and experiment branches. Calc informs early pruning and short-lived compact storage, not HHWX scoring or proof rules.

For each owned legal area configuration shared by all three teams, choose five distinct characters per team from non-excluded physical cards. Physical cards cannot repeat across teams. Songs retain their three input slots, including repeats; each team chooses its own leader.

The formal objective is the proven top-1 sum of three Bestdori-compatible average scores. Equal scores keep a deterministic representative. Up to ten discovered solutions remain diagnostic, not proven global top-10.

## Scoring order stays unchanged

Dense card instance IDs follow decoded HHWX profile order. A complete five-card set is sorted by instance ID; remove the chosen leader and reinsert it at member index two, preserving the other members' order. Evaluate all five leaders for all three songs; an equal song score retains the first leader. Keep area-item operation order and the final `(song0 + song1) + song2` sum. Traversal and bound ordering never enter exact scoring.

Exact leaves retain the two floors, P/G expectation, continued/rate-up state, all 120 equiprobable skill orders, and additive overlaps. The new bound and heuristic estimates do not replace that scorer.

## Shared, chart-free partial-team upper

The input-local model precomputes chart/combo coefficients, exact skill-window coverage by duration, and a reference-rounding operation envelope. Each area configuration supplies additive per-card parameter uppers; partial nodes do not rescan charts.

For any reachable whole-team skill context, the ideal average is at most `P * K`: `P` sums five per-card parameter uppers, and `K` contains the base coefficient, five first-five activation contributions, and exactly one sixth-trigger leader contribution. The proof replaces P/G by full-P inner scores and each active delta by a nonnegative maximum. Each card occupies each of the first five triggers in 24/120 orders, so its coefficient is the five-window sum divided by five.

For any positive weight `t`:

```text
P * K <= (t * P + K / t)^2 / 4
```

For that weight, a small dynamic program maximizes the additive quantity using one card per remaining character and exactly one leader. Parameter and skill contributions stay attached to the same card. Fixed cards remain fixed. A maximum over reachable band/attribute contexts covers every completion; a minimum over several valid weights tightens each context's upper. This is still a relaxation, not a promise that the maximizing parameter and skill combination is attainable.

Binary64 safety is part of the implementation:

- Already-rounded card/event sums and area products are atoms; an upward envelope covers the remaining nonnegative parameter additions in every leader order.
- Upward chart coefficients cover the five base-note operations and the six overlap additions plus final product. A subnormal base intermediate cannot reach an integer note score of one, so this step needs no arbitrary epsilon.
- An independent whole-family parameter maximum proves note `u32` range safety; checking only the weighted maximizing team would be insufficient.
- The integer reference envelope covers P/G state accumulation and the stable 120-order mean, including its rounding slack.

An unavailable or failed proof is positive infinity, never an infeasible family. Only a strict whole-medley upper below the exactly scored incumbent may prune; equality remains searchable.

## Early solutions and complete three-team search

1. Find a legal fifteen-card assignment. A failed heuristic is not a no-solution proof.
2. Order configurations by feasible full-team estimates. In at most eight configurations, try up to six deterministic constructions with different card-allocation orders and contribution weights. Exactly score every proposed complete medley before updating the incumbent. These effort limits never restrict the formal search.
3. Search one configuration at a time with a depth-first state containing all three partial teams. Each team has an increasing character-group prefix. Its remaining domain excludes previously skipped groups and every physical card already fixed in any team, but not other cards of the same character in another team.
4. Sum the three current family uppers in song order. This replaces the former single-team test that left the other two teams at unconstrained root maxima. Periodic complete-solution probes and completed blocks can keep improving the incumbent.
5. When the three families contain at most 256 total candidate rows, or a smaller budget-derived limit, exhaustively generate their local rows and join the entire local three-way product. Otherwise split one family into every legal next-group/card child. Each complete medley belongs to exactly one child, so different blocks cannot lose cross-block combinations.
6. Sort each local list by its assigned song score, reject physical overlap, and use monotone sum cutoffs. After the first compatible third team, retain every row with the same rounded total before stopping; a slightly smaller third score can still tie the total and improve its deterministic representative.
7. Drop local rows and views after each block. A bounded configuration-local cache reuses a complete five-card row across all song slots and blocks. Hash collisions or eviction cause re-scoring only, never omission. No global candidate pool, pair table, roster bitset per row, or best-first frontier is retained.

The 256-row switch, cache capacity, and heuristic effort are implementation controls, not candidate caps. Smaller memory produces more complete blocks and possibly more repeated exact scoring. This trade-off must be measured; short-lived storage alone does not solve the search's combinatorial scale.

## Completion, resources, and evidence

Exact means every configuration and family was exhausted or safely pruned. Cancellation, timeout, memory exhaustion, invalid data, arithmetic overflow, scorer disagreement, count/index overflow, or internal failure returns incomplete with optional diagnostic `bestSoFar`. No score uplift can turn an incomplete run into a pass.

The supplied storage budget covers local compact rows, their sorting indexes, and the bounded score cache. `peakCandidateBytes` covers rows/indexes; `peakCacheBytes` and `peakSearchStorageBytes` report cache and combined peaks. These exclude input/model/configuration data and bounded-depth traversal scratch; they are not total native or browser/WASM memory. Stop polling occurs between nodes/candidates, not inside one exact five-leader/three-song evaluation or model construction, so the caller's deadline is not a hard real-time guarantee.

Diagnostics include bound calls, family/row cuts, completed blocks, cache hits, actual exact-team evaluations, joins, heuristic probes/improvements, first and post-warm-start scores, root song uppers, and storage peaks. Compact rows count cumulative materializations; exact-team evaluations count cache misses, including heuristic work.

Required checks are bitwise reference-score parity; independent tiny exhaustive score and identity comparison across large/small budgets, conflicting cards, contexts and configurations; partial-bound replay against every tiny completion; tie handling; explicit incomplete outcomes; and the six approved retained real cases with unchanged inputs and budgets. Historical scores and teams are never search seeds or routinely replayed. The [fixture procedure](bandori-medley-fixtures.md) retains private evidence.

## Stop line

This checkpoint adds no dominance replacement, score quantization, SIMD/FMA, approximate candidate retention, external storage, new dependency, frontend/API connection, or post-search maximum-score hydration. Any further optimization follows review of the completed evidence, not automatic changes after acceptance.
