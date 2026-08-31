# Greenfield Bandori Medley Search

Chinese version: [bandori-medley-search.zh-CN.md](bandori-medley-search.zh-CN.md)

## Authority and objective

This is the approved, revisable search design, not additional game rules. [The foundation contract](bandori-medley-foundation.md) controls inputs and scoring. The implementation is independent of old team-builder and experiment code. Calc informs early pruning and short-lived compact storage, not HHWX scoring or proof rules.

For each legal owned area configuration shared by all teams, choose three five-card teams with distinct characters within each team and no repeated physical card across teams. Exclusions are hard. Songs keep their input slots, including repeats. The objective is the proven top-1 total average score; ties retain a deterministic representative. Up to ten discovered solutions are diagnostic, not proven global top-10.

## Exact complete-team scoring

Dense instance IDs follow HHWX profile order. A five-card set is sorted by instance ID; the selected leader is moved to member index two without changing other members' relative order. Equal song scores retain the first leader. Area-item order and the final `(song0 + song1) + song2` sum stay fixed.

The scorer follows `hhwx-medley-bestdori-v2`: Bestdori base operation order and average judgment/skill multipliers, with independently rounded window extras. The 120 first-five orders remain equiprobable; the sixth repeats the leader. There is no P/G history state or joint-overlap path.

- Prepare combo segments and trigger indexes once per input; the existing note order is unchanged.
- Resolve full-team skills once per five-card set. Per song, find each skill's six endpoints once. Constant multipliers are evaluated once; rate-up varies only before covered note 100; continued PERFECT may vary for the whole window. Reuse the varying prefix across all six windows and leaders.
- Floor each combo segment's base score once. For a constant multiplier, calculate one integer extra per intersecting combo segment and multiply by its note count. Only genuinely varying multipliers retain individual note floors.
- Sum the 30 member/window integer extras, including overlaps. For leader `l`, convert `5*(baseTotal + extra[5][l]) + sum(firstFiveExtras)` once to binary64 and divide by five. No 120-order materialization or final mean floor remains.
- Reuse base-score work only when the final parameter has identical binary64 bits. Member reordering can affect parameter addition; do not normalize away that difference.

Signed i128 accumulation covers every permitted u32 note count and note score, including negative skill extras. It avoids a second chronological-scoring fallback. The independent 120-order reference cancels its common factor of 24 before the same final conversion/division and checks production results bitwise.

## Partial-team upper bound

An input-local model prepares chart/combo coefficients and duration coverage. Each area configuration supplies additive per-card parameter uppers. Partial nodes do not rescan charts.

For any reachable whole-team skill context, the ideal average is at most `P * K`. `P` sums five per-card parameter uppers; `K` includes a base coefficient, the first-five contributions and exactly one sixth-trigger leader contribution. The bound uses the input's average judgment coefficient and a nonnegative upper for each skill's actual average-rate formula. Dropping negative deltas only raises the result. Each card appears in each first-five position in 24/120 orders, so its coefficient is the five-window sum divided by five.

For any positive weight `t`:

```text
P * K <= (t * P + K / t)^2 / 4
```

A small dynamic program maximizes the additive quantity: one card per remaining character, exactly one leader, fixed cards kept, and parameter/skill contributions still attached to their card. Maximize across reachable band/attribute contexts; minimize across valid weights within each context. This is an upper bound, not a claim that its favorable choices can all be attained together.

Binary64 proof obligations are explicit:

- Treat already-rounded card/event sums and area products as atoms; cover the remaining parameter additions upward for every leader order.
- Calculate skill multiplier limits in the same scalar operation order as scoring. Rate-up uses the capped endpoint. Continued uses the extrema of actual `powf` results over chart note counts, computed once, without an invented library epsilon.
- Treat the materialized Bestdori base coefficient as an atom. Upward chart coefficients cover the three following multiplications; a subnormal intermediate cannot reach an integer note score of one.
- For an upper skill multiplier above one, one upward floating step covers `innerScore * multiplier` rounding and a second covers subtracting one. This bounds each independent integer extra without assuming exact multiplication.
- Independently bound the whole family's parameter to prove each base/skill-scored note fits u32. The weighted maximizing team alone is not sufficient.
- Totals use exact signed integers. If `C` bounds the ideal mean, monotone conversion and division give the actual-mean bound `f64(5*C) / 5`; the old 120-addition rounding envelope is unnecessary.

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

For a scoring-only real-chart check, run `node --import tsx scripts/benchmark-bandori-medley-score.mjs --main <clean-main-worktree>`. It uses the retained 119/961-card data and six real expert charts, tests 100%/95% PERFECT with reset/carried combo, and includes two legal real-card skill variants. It times one fixed-power, best-leader score against main with computed-answer caches disabled; accuracy uses the unchanged pinned Bestdori functions. Original single-window/ordinary-combo results and the deliberately different HHWX rules are reported separately. Private inputs, source hashes, timings and results stay under `temp/medley-score-benchmark/`; this is native Rust versus Node, not browser/WASM or full-search throughput.

Approved full-search benchmarks remain separate and retain unchanged inputs and budgets; historical results are never search seeds. Private evidence follows [the fixture procedure](bandori-medley-fixtures.md).

For current-search diagnosis, run `node --import tsx scripts/compare-bandori-medley-search.mjs --diagnose`. It regenerates the retained 119/961-card no-event inputs from raw profiles and masters under the current rule version, then runs each for 60 seconds with the existing 256 MiB storage and 1 GiB sampled-process limits. It neither reads historical scores nor runs an old solver. Test-only native timers report exclusive wall-clock phases, additive-bound passes/card visits and strict score-improvement timestamps; nested work is counted once. Timings include instrumentation overhead and are not an uninstrumented throughput benchmark. Input hashes, commit, outcomes, counters and native process memory remain in the private `runs/` archive. Reaching the diagnostic deadline is a completed measurement, not exact search success.

The current scoring cleanup changes no traversal, AM-GM strategy, heuristic effort or storage capacity. It adds no dominance, quantization, SIMD/FMA, approximate retention, external storage, dependency, frontend/API integration or maximum-score output hydration. Further search optimization requires a separately reviewed scope.
