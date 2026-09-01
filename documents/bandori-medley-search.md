# Greenfield Bandori Medley Search

Chinese version: [bandori-medley-search.zh-CN.md](bandori-medley-search.zh-CN.md)

## Authority and objective

This is the approved, revisable search design, not additional game rules. [The foundation contract](bandori-medley-foundation.md) controls inputs and scoring. The implementation is independent of old team-builder and experiment code. Calc informs early pruning and short-lived compact storage, not HHWX scoring or proof rules.

For each legal owned area configuration shared by all teams, choose three five-card teams with distinct characters within each team and no repeated physical card across teams. Exclusions are hard. Songs keep their input slots, including repeats. The objective is the proven top-1 total average score; ties retain a deterministic representative. Up to ten discovered solutions are diagnostic, not proven global top-10.

## Exact complete-team scoring

Dense instance IDs follow HHWX profile order. A five-card set is sorted by instance ID; the selected leader is moved to member index two without changing other members' relative order. Equal song scores retain the first leader. Area-item order and the final `(song0 + song1) + song2` sum stay fixed.

The scorer follows `hhwx-medley-bestdori-v3`: Bestdori BPM-anchored timestamps, base operation order and average judgment/skill multipliers, with independently rounded window extras and a final floor per song. The 120 first-five orders remain equiprobable; the sixth repeats the leader. There is no P/G history state or joint-overlap path.

- Prepare combo segments and trigger indexes once per input; the existing note order is unchanged.
- Resolve full-team skills once per five-card set. Per song, find each skill's six endpoints once. Constant multipliers are evaluated once; rate-up varies only before covered note 100; continued PERFECT may vary for the whole window. Reuse the varying prefix across all six windows and leaders.
- Floor each combo segment's base score once. For a constant multiplier, calculate one integer extra per intersecting combo segment and multiply by its note count. Only genuinely varying multipliers retain individual note floors.
- Sum the 30 member/window integer extras, including overlaps. For leader `l`, convert `5*(baseTotal + extra[5][l]) + sum(firstFiveExtras)` once to binary64, divide by five, then floor. Candidate comparisons and the medley sum use these settled song scores; no 120-order materialization is needed.
- Reuse base-score work only when the final parameter has identical binary64 bits. Member reordering can affect parameter addition; do not normalize away that difference.

Signed i128 accumulation covers every permitted u32 note count and note score, including negative skill extras. It avoids a second chronological-scoring fallback. The independent 120-order reference cancels its common factor of 24 before the same final conversion/division/floor and checks production results bitwise.

## Partial-team upper bound

An input-local model prepares chart/combo coefficients and duration coverage. Each area configuration supplies additive per-card parameter uppers. Partial nodes do not rescan charts.

For any reachable whole-team skill context, the ideal average is at most `P * K`. `P` sums five per-card parameter uppers; `K` includes a base coefficient, the first-five contributions and exactly one sixth-trigger leader contribution. The bound uses the input's average judgment coefficient and a nonnegative upper for each skill's actual average-rate formula. Dropping negative deltas only raises the result. Each card appears in each first-five position in 24/120 orders, so its coefficient is the five-window sum divided by five.

For any positive weight `t`:

```text
P * K <= (t * P + K / t)^2 / 4
```

A small dynamic program maximizes the additive quantity: one card per remaining character, exactly one leader, fixed cards kept, and parameter/skill contributions still attached to their card. Maximize across reachable band/attribute contexts; minimize across valid weights within each context. This is an upper bound, not a claim that its favorable choices can all be attained together. Once all five cards are fixed, use their actual whole-team context and the direct upward `P * K` bound; weighted maximization is no longer needed. The same note-range and final mean-rounding checks apply.

For the current area configuration only, prepare the three weights per song and complete ordered regular/leader card lists per character and context. A card belongs to at most four contexts. Removing a card advances only affected available heads; a change trail restores them on return. Bounds and temporary proposals share that availability. The parameter-range check has its own ordered heads. No list is truncated, and no remaining-roster scan is needed per support calculation. Reuse the bound's five-card selection as an ordering hint; it is not an exact optimum.

Binary64 proof obligations are explicit:

- Treat already-rounded card/event sums and area products as atoms; cover the remaining parameter additions upward for every leader order.
- Calculate skill multiplier limits in the same scalar operation order as scoring. Rate-up uses the capped endpoint. Continued uses the extrema of actual `powf` results over chart note counts, computed once, without an invented library epsilon.
- Treat the materialized Bestdori base coefficient as an atom. Upward chart coefficients cover the three following multiplications; a subnormal intermediate cannot reach an integer note score of one.
- For an upper skill multiplier above one, one upward floating step covers `innerScore * multiplier` rounding and a second covers subtracting one. This bounds each independent integer extra without assuming exact multiplication.
- Independently bound the whole family's parameter to prove each base/skill-scored note fits u32. The weighted maximizing team alone is not sufficient.
- Totals use exact signed integers. If `C` bounds the ideal mean, monotone conversion and division give the actual-mean bound `f64(5*C) / 5`. The final song floor can only reduce the score, so this bound remains valid; the old 120-addition rounding envelope is unnecessary.

Unavailable proof means positive infinity, not an infeasible family. Only a strict whole-medley upper below the exactly scored incumbent prunes; equality remains searchable.

## Joint allocation and batch pruning

The large-family bound allocates physical cards across all three teams together. It reuses the same parameter/skill coefficients; unknown whole-team contexts are conservatively maximized per card, not multiplied into a three-context search. Separate fixed parameters `P0` and the base/fixed first-five coefficient `K0` from remaining parameters `Pr` and skill contributions `Kr` (including the still-unselected leader):

```text
P*K = P0*K0 + P0*Kr + K0*Pr + Pr*Kr
Pr*Kr <= A²/4 <= M*A/4,  A = t*Pr + Kr/t,  0 <= A <= M
```

Only the remaining product needs an envelope; the other terms are constant or linear. A small single-team program bounds `M`; choose among the existing three positive weights by the final bound including all terms, not by `M` alone. All coefficients are nonnegative and rounded upward. Zero remaining parameter/skill contribution needs only the linear terms. A completed team's settled score becomes a constant; before exact scoring, its direct `P*K` upper is sufficient.

The joint program processes one character at a time, with 27 absent/ordinary/leader patterns. A fresh team uses ten count states; a partially fixed team with `r` cards left uses `2*(r+1)`; a complete team uses one. Thus 1,000 states is the maximum, not the size of every pass. Fixed members are removed from the allocation, their characters cannot be selected again for that team, and their best leader contribution is an optional initial state consuming no remaining card. Local matching forbids physical-card reuse and honors every required card. The four highest-weight cards per local role suffice when at most two other roles and one excluded card can block alternatives; required/forced cards are inserted explicitly. Every roster card still receives all permitted destination checks.

Forward and backward tables join each local pattern to compatible outside counts. This gives an upper for every card going to team 0/1/2 or remaining unused, without four new global solves per card. Directed sums and a four-operation rounding envelope cover the unchanged integer-to-float mean and final song sum. If the forward whole bound already strictly loses to the incumbent, stop before building the backward table and destination bounds; equality must continue so deterministic ties remain searchable. Remove a destination only when its upper strictly loses, or no allocation exists; force single remaining destinations. All cuts apply together to the same parent superset. The maximizing allocation is scored by the existing exact scorer, never accepted as an exact optimum.

Keep the numeric weights, local choices, forward/backward tables and conditional uppers together. New fixed members or a newly settled team score require a fresh, smaller model. Otherwise, if the maximizing allocation still fits, compare the retained uppers without rebuilding. If it is excluded, copy the parent's working snapshot, rebuild changed character choices, and propagate scores only until unchanged table rows are reached. Recompute destination uppers only where local masks or outside rows changed. A parent bound remains safe but possibly loose in every descendant; sharing ends with the last DFS user. This budgeted reuse is not a candidate limit, and updates can still reach every character.

## Early solutions and complete search

1. Find a legal fifteen-card assignment. A failed heuristic is not a no-solution proof.
2. Order configurations using complete-team estimates, immediately scoring each complete proposal already constructed during planning. In at most eight configurations, try up to six deterministic constructions with different allocation orders and contribution weights. At every 512th visited node that survives its bound check, repeat a bounded probe. Deduplicate each probe's triples and perform one neighborhood sweep per new triple: at most 75 cross-team one-card swaps and 225 one-card replacements from the union of the three bound suggestions. Only affected teams are re-scored (at most 375 five-card evaluations before legality/cache savings). Try all six team-to-fixed-song assignments using their existing three-song scores. Improvements never trigger another sweep, and heuristic failure never removes a family.
3. Search one configuration at a time using an explicit DFS stack, reversible availability and a four-bit destination mask per card. A required card does not advance the ordinary character prefix. Counts and enumeration honor each team's mask, prefix and selected characters; another team may still use another card of the same character.
4. Check inherited joint and individual-team uppers before fresh work. Intersect tighter bounds with their parents. Fixed five-card teams pass the cheap bound before exact scoring and carry their assigned-song score. Individual-team ordered heads may ignore a team-only mask restriction, which enlarges that bound; they cannot remove a legal completion. Joint allocation and enumeration always honor the restriction.
5. If the three families fit within 256 total local rows, or the smaller remaining-budget limit, exhaust their product. Otherwise use joint batch pruning and branch on one unresolved card, retaining every allowed owner including non-use. Conditional gaps and the maximizing allocation order work only. If a fresh pass cannot fit the budget or its proof is unavailable, reuse a safe ancestor table when present; without one, use the complete individual-bound ownership/prefix traversal. Both honor masks already established; unavailable optimization never discards an unresolved branch.
6. Sort local rows by assigned-song score, reject overlap, require every card whose non-use was eliminated, and apply monotone sum cutoffs. Retain every third row with the same rounded total before stopping; a smaller third score can still tie the total and improve the representative.
7. Release local rows and sorting indexes after each block. A bounded configuration-local cache reuses complete five-card results across blocks and song slots. Collisions and eviction only cause re-scoring.

The 256-row switch, cache capacity and heuristic effort are work controls, not candidate caps. Completion counts saturate only at u64 maximum for ordering; the local-block test remains exact below its limit. The DFS stack permits long unused-card paths without deep recursion; ordinary frames share bound snapshots rather than copying the roster. There is no global candidate pool, pair table, per-row roster bitset or best-first frontier. Worst-case search remains exponential.

## Completion and resource accounting

Exact success requires every configuration and family to be exhausted or safely pruned. Cancellation, timeout, memory exhaustion, invalid data, arithmetic overflow, scorer disagreement, count/index overflow or internal failure returns incomplete, optionally with diagnostic `bestSoFar`. A high score is not proof of completion.

The storage budget covers local rows/indexes, the score cache, joint working reservations and all live ancestor snapshots, including weights, masks, local choices, transition lists, forward/backward tables, paths and destination uppers. `peakSearchStorageBytes` includes the conservative new/copy reservation, not a sampled heap total; `peakCandidateBytes` and `peakCacheBytes` retain their narrower meanings. For 40 characters and 1,000 states, forward/backward scores plus paths require about 0.665 MiB per snapshot; fixed members reduce that size. Do not trade away useful reuse merely to minimize RSS. Input/model/configuration data, the individual-bound index/undo, scoring scratch and traversal scratch remain outside this budget. Native diagnosis reports those capacities separately and samples process memory; separate peaks are not simultaneous totals or browser/WASM incremental memory.

Stop checks occur between nodes/candidates and character-table passes, not inside model preparation or one complete-team evaluation; the deadline is not hard real time. Native diagnosis separates joint-bound time, removals, forced cards, whole-bound reuse, new models, table updates, state counts, recomputed layers and reserved bytes. These show work and pruning, not proof of useful score progress. Complete-team evaluations count cache misses; `exactSongScores` counts 15 song/leader results per set, not chart scans.

## Verification and stop line

For scoring corrections, use the small upstream formula vectors, bitwise reference parity (including overlapping windows and leader parameter groups), existing tiny exhaustive search across budgets/configurations, bound coverage, ties and incomplete outcomes. Run necessary type/compile checks. Do not routinely replay historical teams or rerun long profile benchmarks for a scoring-only change.

For a scoring-only real-chart check, run `node --import tsx scripts/benchmark-bandori-medley-score.mjs --main <clean-main-worktree>`. It uses the retained 119/961-card data and six real expert charts, tests 100%/95% PERFECT with reset/carried combo, and includes two legal real-card skill variants. Raw-chart timestamps and trigger order are checked against the original Bestdori getter before scoring. It times one fixed-power, best-leader score against main with computed-answer caches disabled; accuracy uses the unchanged pinned Bestdori functions, followed by HHWX's per-song floor. Original single-window/ordinary-combo results and the deliberately different HHWX rules are reported separately. Private inputs, source hashes, timings and results stay under `temp/medley-score-benchmark/`; this is native Rust versus Node, not browser/WASM or full-search throughput.

Approved full-search benchmarks remain separate and retain unchanged inputs and budgets; historical results are never search seeds. Private evidence follows [the fixture procedure](bandori-medley-fixtures.md).

For current-search diagnosis, run `node --import tsx scripts/compare-bandori-medley-search.mjs --diagnose`; add `--case 119-no-event` to run only that case. An exact retained case such as `--case 1229-event-244` is also accepted. `--duration-ms`, `--local-row-target`, and `--score-cache-slots` are test-only controls for bounded A/B measurements; they do not change production search settings. The default diagnosis regenerates the retained 119/961-card no-event inputs from raw profiles and masters under the current rule version, then runs each for 60 seconds with the existing 256 MiB storage and 1 GiB sampled-process limits. Results include direct differences from the archived historical averages, with their original settings and known missing data; those scores never enter the search, and no old solver or team replay is run. Test-only native timers report exclusive wall-clock phases, including joint calculation, owner reconstruction, cut application, branching and local blocks; nested work is counted once. Joint fresh/incremental totals and their nested clone/destination timers are reported separately and therefore intentionally overlap. Timings include instrumentation overhead and are not an uninstrumented throughput benchmark. Input hashes, commit, outcomes, counters and native process memory remain in the private `runs/` archive. Reaching the diagnostic deadline completes the measurement, not the exact search; `passed` still requires exact completion and a score at least as high as the historical reference.

No dominance, quantization, SIMD/FMA, approximate retention, external storage, new dependency, frontend/API integration or maximum-score output hydration is part of this search scope.

Current checkpoint (2026-09-01): the accepted fourteen-scene small-roster rerun and the later 48-scene batch both passed their same-input score-regression objectives. The 48-scene batch completed 45 exact; a later rerun completed 1229/event244 exact in 286.488 seconds, while 1513/event244 and 1703/event260 again reached 9,758,172 and 10,106,861 but timed out inside their first configuration. The provenance audit still excludes five non-comparable historical reports.

Clean commit `6b5bebb` then ran the first 28-scene high-pressure batch: whole 1051, 1127, 1329, 1513, 1703, 1747 and 1889-card profiles, four event settings each. Twenty-four completed exact. The unresolved proofs are 1513/event244, 1703/event260, 1747/event244 and 1889/event244; the first three reached strict same-input references, while the 1889 scene has no comparable reference. All 20 valid score comparisons passed (19 equal, exact 1747/event260 higher by 7,343); seven of the eight no-reference scenes completed exact.

The high-pressure batch totaled 2,660.221 native seconds, with 40.73 MiB sampled process peak and 32.42 MiB budget-accounted search-storage peak. The four timeouts consumed 45.1% of total time and completed at most two of 108 configurations, despite warm starts already being within 0.36% of best-so-far. Current evidence therefore points to concentrated proof traversal rather than initial score quality or memory exhaustion. [The fixture procedure](bandori-medley-fixtures.md) retains the complete private report. No budget increase, historical-team replay, browser/WASM acceptance or post-result algorithm change is implied.

## Measured search decisions (2026-09-01)

Six implementation changes are retained. First, 6.7%–20.6% of joint passes in the original three timeout cases already lost after the forward whole bound. Stopping there raised 60-second node progress by 44.6%–55.8%; the identical 961-card exact result took 6.06 instead of 8.47 seconds. Second, the joint DP has at most 1,000 states, so transition endpoints use exact 16-bit indexes. The instrumented 961 exact run kept all non-time counters and improved from 7.80 to 7.53 seconds; three 30-second progress changes were -0.9%, +5.8% and +3.6%, while sampled process peaks fell 7.8%–11.6%. Third, forward, backward and destination passes skip impossible table entries before arithmetic. The same 961 result improved from 7.32 to 6.91 seconds; timeout progress changed by +2.0%, +6.4% and -0.9%.

Fourth, a forced card-to-team condition is rejected before local matching when that role is absent from the pattern. A 1229 trace found 12.77 million such calls in 30 seconds; after removal, the unchanged 961 exact result took 4.98 seconds and the three 30-second node counts rose by 52%, 65% and 69% over the preceding checkpoint. Fifth, when a team has four fixed members, the final card carries the complete directed `P*K` bound for fixed-member and final-card leader cases instead of the general quadratic envelope. Three exact cases kept identical answers while total bound evaluations fell by 0.03%, 4.4% and 1.5%; wall-clock variance was too large for a stronger speed claim. Sixth, local row generation and prefix enumeration now check character uniqueness once per group, not once per physical card. All exact counters stayed identical; 1703/event323 local-block time fell from 12.75 to 5.34 seconds and total time from 53.48 to 47.39 seconds. None of the six changes discards a feasible completion without a safe upper-bound proof or weakens incomplete/exact semantics.

Rejected prototypes remain deleted; Git retains their implementation history.

| Rejected direction | Decisive result |
| --- | --- |
| 27 root weight combinations | No whole or destination bound changed. |
| 42 root band/attribute contexts | Only 0.033%–0.057% root reduction for 0.48–0.62 seconds per configuration. |
| Alternative ownership ordering | Fewer-destinations-first slowed 961 from 6.06 to 18.43 seconds; making conditional gap globally primary failed to finish the current 961 case in 30 seconds instead of about 4.7 seconds. |
| Eight/sixteen parameter bins | Stronger root cuts, but 60-second node progress fell 5.3%–25.5%; whole-only made 961 take 11.04 seconds. |
| Saturated destination scans | Skipped 56.36 million pattern visits but weakened descendants so 961 completed only 4/108 configurations in 60 seconds. |
| One-level deferred joint rebuild | 961 grew from 3,412 to 7,641 nodes and from 6.06 to 9.90 seconds. |
| Cross-node forced-choice cache | Only 1.49%–8.73% of calls were reusable; estimated maximum joint-time savings were 0.4%–2.9% before cache overhead. |
| Changing local-block size or gap-triggered refinement | 128 rows made 1703/event323 8.6% slower and also regressed two medium exact cases; 512 rows was neutral there and 1.4%–6.5% slower elsewhere. Since 56%–62% of surviving bounds were already within 0.5%, gap refinement was not selective either. |
| Sparse/bitset destination traversal | Destination time did not improve, hard-case progress stayed flat, and each snapshot gained about 45 KiB. |
| Character-usage branching | At the first joint root, 1229 retained 7–8 of 8 modes for every character; 1513 and 1703 fixed no required or excluded team-character relation. Supporting unresolved required characters would therefore add state without current pruning evidence. |
| Global best-bound frontier | An independent node must copy or replay the mutable domain, a roughly 2 MiB bound index, and joint snapshots; it changes order but not the settled-incumbent proof set. A shallow cutset had no evidence strong enough to justify that replay machinery. |
