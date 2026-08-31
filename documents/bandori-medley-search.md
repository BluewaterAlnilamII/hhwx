# Greenfield Bandori Medley Search

Chinese version: [bandori-medley-search.zh-CN.md](bandori-medley-search.zh-CN.md)

## Authority and objective

This is the approved, revisable search design, not additional game rules. [The foundation contract](bandori-medley-foundation.md) controls inputs and scoring. The implementation is independent of old team-builder and experiment code. Calc informs early pruning and short-lived compact storage, not HHWX scoring or proof rules.

For each legal owned area configuration shared by all teams, choose three five-card teams with distinct characters within each team and no repeated physical card across teams. Exclusions are hard. Songs keep their input slots, including repeats. The objective is the proven top-1 total average score; ties retain a deterministic representative. Up to ten discovered solutions are diagnostic, not proven global top-10.

## Exact complete-team scoring

Dense instance IDs follow HHWX profile order. A five-card set is sorted by instance ID; the selected leader is moved to member index two without changing other members' relative order. Equal song scores retain the first leader. Area-item order and the final `(song0 + song1) + song2` sum stay fixed.

The scorer follows `hhwx-medley-bestdori-v1`: average judgment/skill multipliers before the two floors, 120 equiprobable first-five orders, the leader's sixth trigger and direct-add overlaps. There is no P/G history state. Reference code explicitly scans every order; production reuses the same arithmetic:

- Prepare combo multipliers and trigger boundaries once per search input.
- Resolve full-team skill conditions once per five-card set. For each song, prepare covered-note skill multipliers once and reuse them across orders and leaders.
- At notes covered by at most one possible window, calculate each member/window's integer contribution once. The first five positions average equally; the sixth uses the chosen leader. Do not average multipliers before the final floor.
- At overlapping notes, combine the active deltas in trigger order before flooring. Reuse the first-five work across leaders; only overlap with the sixth window depends on the leader.
- Reuse base-score work only when the final parameter has identical binary64 bits. Member reordering can affect parameter addition; do not normalize away that difference.
- Reconstruct the 120 order totals from those contributions and keep the established order of the 120 additions and division. These are small numeric sums, not 120 full-chart scans per leader.

Integer regrouping is used when `noteCount * u32::MAX <= 2^53`, which guarantees all intermediate note sums are exactly representable. Outside that range, the same prepared multipliers are summed chronologically. This preserves existing arithmetic and accepted inputs rather than introducing a different large-input score.

## Partial-team upper bound

An input-local model prepares chart/combo coefficients and duration coverage. Each area configuration supplies additive per-card parameter uppers. Partial nodes do not rescan charts.

For any reachable whole-team skill context, the ideal average is at most `P * K`. `P` sums five per-card parameter uppers; `K` includes a base coefficient, the first-five contributions and exactly one sixth-trigger leader contribution. The bound uses full-P inner-score coefficients and a nonnegative upper for each skill's actual average-rate formula. Dropping negative deltas only raises the result. Each card appears in each first-five position in 24/120 orders, so its coefficient is the five-window sum divided by five.

For any positive weight `t`:

```text
P * K <= (t * P + K / t)^2 / 4
```

A small dynamic program maximizes the additive quantity: one card per remaining character, exactly one leader, fixed cards kept, and parameter/skill contributions still attached to their card. Maximize across reachable band/attribute contexts; minimize across valid weights within each context. This is an upper bound, not a claim that its favorable choices can all be attained together.

Binary64 proof obligations are explicit:

- Treat already-rounded card/event sums and area products as atoms; cover the remaining parameter additions upward for every leader order.
- Calculate skill multiplier limits in the same scalar operation order as scoring. Rate-up uses the capped endpoint. Continued uses the extrema of actual `powf` results over chart note counts, computed once, without an invented library epsilon.
- Upward chart coefficients cover the five base-note operations and six overlap additions plus final multiplication. A subnormal base intermediate cannot reach an integer note score of one.
- Independently bound the whole family's parameter to prove per-note u32 safety and each order's integer total at most `2^53`. The weighted maximizing team alone is not sufficient.
- Once order totals are exact integers, only the stable 120 additions and division need the remaining rounding envelope. No probability-state count or historical-state error allowance remains.

Unavailable proof means positive infinity, not an infeasible family. Only a strict whole-medley upper below the exactly scored incumbent prunes; equality remains searchable.

## Early solutions and complete search

1. Find a legal fifteen-card assignment. A failed heuristic is not a no-solution proof.
2. Order configurations using complete-team estimates. In at most eight configurations, try up to six deterministic constructions with different allocation orders and contribution weights. Exactly score each complete medley before updating the incumbent; effort limits do not restrict formal search.
3. Search one configuration at a time, depth first, holding all three partial teams. Each team has an increasing character-group prefix. Its domain excludes skipped groups and cards already fixed anywhere, but allows another card of the same character in another team.
4. Add the three current family uppers in song order. Periodically propose complete solutions; completed blocks can also improve the incumbent.
5. If the three families fit within 256 total local candidate rows, or the smaller budget-derived limit, enumerate and join their complete local product. Otherwise partition one family into every legal next-group/card child. Every complete medley belongs to exactly one child.
6. Sort local rows by the assigned song score, reject physical overlap and apply monotone sum cutoffs. After finding a compatible third team, retain every row with the same rounded total before stopping; a smaller third score can still tie the total and improve the deterministic representative.
7. Release local rows and sorting indexes after each block. A bounded configuration-local cache reuses complete five-card results across blocks and song slots. Collisions and eviction only cause re-scoring.

The 256-row switch, cache capacity and heuristic effort are work controls, not candidate caps. There is no global candidate pool, pair table, per-row roster bitset or best-first frontier. Low storage alone does not solve the combinatorial scale; smaller blocks may increase repeated work.

## Completion and resource accounting

Exact success requires every configuration and family to be exhausted or safely pruned. Cancellation, timeout, memory exhaustion, invalid data, arithmetic overflow, scorer disagreement, count/index overflow or internal failure returns incomplete, optionally with diagnostic `bestSoFar`. A high score is not proof of completion.

The storage budget covers local compact rows, sorting indexes and the bounded score cache. `peakCandidateBytes`, `peakCacheBytes` and `peakSearchStorageBytes` report those peaks. They exclude input/model/configuration data, chart-sized scoring scratch and bounded-depth traversal scratch, so they are not total native or browser/WASM memory.

Stop checks occur between nodes/candidates, not inside model preparation or one complete-team evaluation; the deadline is not a hard real-time guarantee. Diagnostics count bounds, cuts, blocks, cache hits, joins, heuristic work, scores and storage. Complete-team evaluations count cache misses. `exactSongScores` counts the 15 song/leader results per evaluated set, not chart scans.

## Verification and stop line

For scoring corrections, use the small upstream formula vectors, bitwise reference parity (including overlapping windows and leader parameter groups), existing tiny exhaustive search across budgets/configurations, bound coverage, ties and incomplete outcomes. Run necessary type/compile checks. Do not routinely replay historical teams or rerun long profile benchmarks for a scoring-only change.

Approved real-case benchmarks are retained separately for search/throughput work with unchanged inputs and budgets; historical results are never search seeds. Private evidence follows [the fixture procedure](bandori-medley-fixtures.md).

The current scoring cleanup changes no traversal, AM-GM strategy, heuristic effort or storage capacity. It adds no dominance, quantization, SIMD/FMA, approximate retention, external storage, dependency, frontend/API integration or maximum-score output hydration. Further search optimization requires a separately reviewed scope.
