# Bandori Medley Exact Search

Chinese version: [medley-search.zh-CN.md](medley-search.zh-CN.md)

## Abstract

This document specifies the exact search, states the invariants on which pruning depends, and proves why a completed run cannot omit a better legal medley. Read [the scoring and product contract](medley-foundation.md) first; it defines the cards, songs, area configurations, score function and terminal result states used here.

The search considers every legal shared area-item configuration and every legal assignment of fifteen physical cards to three fixed song slots. Its practical core is a branch-and-bound search with two safe score relaxations: an individual-team bound and a joint three-team allocation bound that additionally models competition for physical cards. The engine keeps the smaller valid whole-range bound. Small residual products are closed by exact enumeration. Heuristics affect only traversal order and the quality of the incumbent. They never remove a candidate.

The input and exact scoring contract is defined by [the foundation document](medley-foundation.md). Every finite pruning value must be an upper bound on that scorer. A mismatch between a claimed bound and exact scoring is an error: the optimization must fail open or be corrected rather than changing score semantics to fit it.

The corresponding implementation is intentionally split by responsibility: `exact_score.rs` and `candidate.rs` settle complete teams; `fast_upper.rs` and `upper_bound.rs` construct single-team numeric bounds; `joint_upper.rs` solves the relaxed three-team allocation; `search.rs` owns the exhaustive partition, reversible state, local joins, and terminal status. These files are under `crates/bandori-medley-search/src/`.

## How the search works

The search is branch and bound. When a legal medley exists and the run reaches its warm start, it scores one as the **incumbent**, then divides the remaining legal assignments into smaller ranges. If complete feasibility enumeration finds no assignment, the run can instead prove that no legal medley exists. For each searchable range the engine calculates an optimistic score that is guaranteed not to be lower than the best real completion in that range.

If the incumbent is 9,100,000 and a range has a proved upper bound of 9,099,999, that whole range can be discarded. If the bound is 9,100,000, the range remains searchable because an equal score might contain the deterministic tie winner. An unknown or numerically unsafe bound also remains searchable.

A single-team bound asks how strong one unfinished team could become while temporarily ignoring some competition from the other teams. The joint bound additionally allocates the remaining character groups across all three teams at once, so one physical card cannot optimistically supply several teams. Because the two relaxations differ in other ways, neither is assumed to be numerically tighter in every node; the engine combines them with inherited whole-range bounds by taking the minimum. When only a small residual combination remains, the engine stops estimating and enumerates that block exactly. Heuristics choose which branch to visit first and can improve the incumbent earlier, but they never delete a candidate.

The rest of this document defines the represented search space, derives both bounds, describes exact residual enumeration, and then combines those facts into the final correctness proof.

## 1. Problem definition

Let `C` be the normalized set of non-excluded physical card instances, partitioned into character groups. Let `Q` be the finite list of legal owned area-item configurations constructed by the source adapter. For song slot `s in {0,1,2}`, a team consists of five physical cards and one of those cards as leader.

A legal medley `(q, T0, T1, T2)` satisfies all of the following:

1. `q` is in `Q` and is shared by all three teams.
2. Each `Ts` contains exactly five cards with five distinct character IDs.
3. No physical card instance occurs in two teams.
4. Each song remains in its input slot; repeated songs are allowed and slots are never reordered.

For the exact integer-valued binary64 score `score(q, Ts, s)` defined by `hhwx-medley-bestdori-v3` and its fixed operation order, the objective is

```text
S(q, T0, T1, T2) = (score(q, T0, 0) + score(q, T1, 1))
                    + score(q, T2, 2).
```

The result is the legal medley with maximum `S`. For one five-card set and song, equal best song scores retain the smallest leader instance ID. Complete medleys with equal total scores then use a stable lexicographic identity: selected area-item IDs first, followed by the three resulting canonical member arrays. The diagnostic list retains at most ten distinct solutions encountered during the search; it is not a proof of the global top ten.

## 2. Exact leaf scoring

Bounds never become result scores. Every complete candidate that may enter the result is evaluated by the exact scorer described in the foundation contract.

For one unordered five-card set, the scorer evaluates all five possible leaders in increasing instance-ID order and keeps the first on an equal song score. Members are first sorted by dense instance ID; the chosen leader is moved to output index two while the other members keep their relative order. The scorer prepares chart and combo work once, groups constant skill multipliers by combo segment, and evaluates only genuinely varying skill multipliers per note. This is algebraically checked against the independent 120-order reference.

Each song is settled independently:

```text
song(l) = floor((5 * (base + sixthWindowExtra[l])
                 + sum(firstFiveWindowExtras[all five members])) / 5).
```

The numerator is accumulated exactly in signed `i128`; it is converted to binary64 once, divided by five, and floored. The three resulting integer-valued scores are then added in the fixed order shown above. A fixed-size cache may reuse the complete five-card result. Cache eviction or collision causes recomputation and cannot change the candidate set.

## 3. Search state and invariants

Cards are stored under dense instance IDs and character groups are ordered deterministically. A search node contains three `TeamFamily` values and one reversible shared domain.

A team family records:

- physical cards already selected for that song;
- character groups required for that song but not yet tied to a physical card;
- the next ordinary character-group index; and
- an exact song score once all five physical cards are fixed.

Ordinary characters are selected in strictly increasing group order. Required groups are resolved before the ordinary prefix advances and therefore do not advance it themselves. When a new requirement is inferred, `can_include` has already rejected every not-yet-required group before that team's `next_group`, and the effective owner masks omit that team destination; while any requirement remains, fallback branching resolves one before advancing the prefix. By induction, every unresolved required group is unique within its team, is not already selected there, and is at or after `next_group`. Consequently an individual-team bound may omit reservations and maximize over the ordinary suffix; that suffix is a superset of every real completion. This representation gives one ordinary order for each unordered team without eliminating another team's use of a different physical card of the same character.

For every currently available physical card, the domain stores four possible destinations: song 0, song 1, song 2, and unused. Every restriction is intersected with the existing mask and recorded on an undo trail. `counts[g][s]` equals the number of available physical cards in character group `g` whose stored mask still contains song `s`. A selected card is removed from availability; a card assigned to `unused` is also removed. Restoring a DFS checkpoint restores availability, masks, and counts together. Completion counts multiply the alternatives for distinct required groups and use a combination dynamic program for the ordinary suffix; saturated counts can only keep a node out of an exact local block, not delete a completion.

The following invariants are required before constructing a joint bound:

1. A selected physical card appears in exactly one team and is not residual input.
2. A team has at most five selected-plus-required character slots.
3. Selected and required characters are unique within a team, and every unresolved required group is at or after its ordinary prefix.
4. If a physical card cannot be unused and has only one feasible team destination, it is materialized into that team; any reservation for its character is simultaneously fulfilled.
5. Consequently, no unresolved required character duplicates a residual physical card that the joint model already regards as fixed.

The fourth invariant must be established from the *effective* destination masks, not only the stored masks. Team capacity, character uniqueness, and prefix position can remove a destination without modifying the stored card mask. The implementation therefore writes every effective non-unused singleton back to the trailed domain, materializes it, and restarts node analysis until no such singleton remains. A conflict during this closure proves that the node has no legal completion.

This closure is set-preserving. Every completion of the node must send a non-unused singleton to its sole remaining team. Materializing all singletons merely records those forced choices. Earlier materializations can only remove destinations from later cards; they cannot create a completion that was absent or remove a completion that chose a different destination.

## 4. Individual-team upper bound

### 4.1 Ideal product

For a fixed song and a reachable whole-team skill context, let:

- `P` be an upward-rounded sum of the five card parameters under the current area configuration;
- `K` be the song's base coefficient plus the five cards' average first-five-window contributions and exactly one leader contribution.

The exact settled song score is no greater than the ideal nonnegative product `P*K` after the documented final-rounding envelope. Negative skill deltas may be replaced by zero because doing so can only raise the score. Each card contributes one fifth of the sum of its first five windows because it occupies every one of those positions in exactly 24 of the 120 orders.

The bridge from the integer scorer to this product is explicit. Let `R(n) = 2^52 / (2^52 - n)`, evaluated upward; for nonnegative binary64 additions this is a conservative `n`-operation rounding factor. For `m` selected area items, the parameter model starts from the scorer's already-rounded card/event sums and area products, then multiplies by `R(12 + 16m)` to cover the remaining addition tree. Thus its additive `P` is not smaller than the scorer's deck parameter. For a note, `R(3)` covers the scorer's ordered base products `(parameter * chartCoefficient) * combo * judgment`. Let their exact floored `u32` result be `B`, let `fl` denote the implemented binary64 operation order, and let `muMax >= mu` cover every materialized skill multiplier reachable by that card and window. The implementation takes `delta = nextUp(fl(nextUp(muMax) - 1))`. The first upward step covers rounding in `B*mu`; the second covers the subtraction from one, giving

```text
floor(fl(B * mu)) - B <= B * delta.
```

Multipliers no greater than one use `delta = 0`, which is an upper relaxation. Summing the base and window contributions, then applying the exact `24/120 = 1/5` positional frequency, gives `P*K` above the unrounded 120-order mean. If `U` is that calculated upper and `N` is the scorer's exact signed-`i128` mean numerator, then `N <= 5*ceil(U)`. Integer-to-binary64 conversion and division by positive five are monotone; `reference_ceiling(ceil(U))` therefore also covers the final conversion and floor. All following inequalities use `P >= 0`, `K >= 0`, and `t > 0`.

For every `t > 0`, arithmetic-geometric mean gives

```text
4 * P * K <= (t * P + K / t)^2.
```

For fixed `t`, the expression inside the square is additive over cards once ordinary and leader roles are separated. A small dynamic program therefore maximizes it while enforcing five distinct characters, fixed members, and exactly one leader. It is evaluated for three positive scales near the parameter/coefficient balance point. Each scale is independently safe, so the minimum of their completed upper bounds remains safe.

Skill context is not guessed. The bound enumerates every still-reachable mixed, same-band, same-attribute, and same-band-and-attribute context and takes the maximum. A context may relax compatibility per remaining card, which can make the value unattainably high but never too low. Once all five cards are fixed, the implementation uses their actual context and a direct upward `P*K` calculation.

### 4.2 Reversible ranked support

Each area configuration prepares complete ranked lists by character, context, song, scale, and ordinary/leader role. Lists contain the entire eligible roster; their heads merely skip cards removed from global availability and an undo log restores changed heads during DFS. Per-team owner masks and required reservations are intentionally omitted here, so the maximization is over a superset. Thus ranking avoids repeated roster scans but is not a candidate cap. A team proposed by a maximizing bound is used only as a search hint and is scored exactly before it can become an incumbent.

If construction, range checking, or directed arithmetic cannot prove a finite upper, the individual bound is positive infinity. Unknown means “cannot prune,” not “infeasible.”

## 5. Joint three-team upper bound

The individual bounds ignore competition for physical cards. The joint relaxation assigns all remaining character groups to the three teams simultaneously.

### 5.1 Linearizing the remaining product

The joint bound uses the same nonnegative relaxed upper model as the individual bound. For each card, its parameter atom is an upper value and its ordinary/leader coefficient is the largest compatible contribution over every still-reachable whole-team context. Different cards may therefore receive maxima from mutually incompatible contexts; this only enlarges the represented space. Every real completion maps to the same cards and roles in this model with a `P*K` value no smaller than its unrounded ideal mean; settlement and medley-level rounding are covered below.

For one model team, separate fixed and residual terms. `P0` and `K0` are the upward-represented parameter and coefficient terms already fixed at the node. `Pr` and `Kr` are the model terms assigned by the residual allocation; `Kr` includes exactly one leader contribution, whether the leader is already fixed or remains residual:

```text
P = P0 + Pr
K = K0 + Kr
P*K = P0*K0 + P0*Kr + K0*Pr + Pr*Kr.
```

This is an algebraic decomposition of the relaxed model, not a claim that the four symbols are exact scorer values. The first term is constant and the next two are linear in residual card choices. Only `Pr*Kr` is nonlinear. For any chosen `t > 0`, define

```text
A = t*Pr + Kr/t.
```

Then `Pr*Kr <= A^2/4`. Suppose directed calculations establish `L <= A <= M` for every completion in a relaxed legal residual space. Convexity of `x^2` places the graph below the chord joining `(L,L^2)` and `(M,M^2)`:

```text
A^2 <= (L + M)*A - L*M,
Pr*Kr <= ((L + M)/4)*A - L*M/4.
```

The right side is linear in the residual ordinary/leader card weights. For each model card, the upper endpoint atom is `add_up(mul_up(t,p), div_up(c,t))`; the lower atom uses the corresponding three downward operations. `M` is the upward-added maximum support over distinct characters and exactly one leader. `Lchoice` is the downward-added minimum support over the same relaxed choices, and `L = max(Lchoice, mul_down(t,minResidualParameter))`. Both operands of this maximum are no greater than every allowed model `A`, so `L` remains a lower endpoint. Omitting required-character conditions enlarges the common endpoint domain: its maximum cannot decrease and its minimum cannot increase. Hence `M` remains an upper endpoint and `Lchoice` a lower endpoint, while the prefix invariant above ensures every real completion remains in the domain.

The slope `s = (L+M)/4` is rounded upward. The offset `o = L*M/4`, which is subtracted only after the maximizing allocation has been found, is rounded downward. Each card receives `add_up(linearUpper, mul_up(s,upperEndpointAtom))`; the three offsets are combined downward before `sub_up` subtracts them from the upward allocation maximum. All resulting weights therefore dominate the intended model expression. Three `t` values are tried, and the completed single-team upper—not merely `M`—selects the tightest safe envelope. The special cases of zero residual parameter/coefficient and one remaining card use direct linear or complete-product bounds.

For a team whose exact song score is already known, that score contributes directly as a nonnegative constant. Replacing a negative settled score by zero is again only a relaxation. The remaining model terms bound unrounded song means. Each nonnegative song-contribution path has at most four binary64 rounding points: conversion of the `i128` numerator, division by five, and the two fixed-order medley additions. The intervening `floor` is handled by monotonicity rather than counted as another rounding step. The exact medley score therefore cannot exceed the nonnegative joint ideal-sum upper multiplied upward by `R(4)`. This is the final joint score envelope applied after constants and offsets.

### 5.2 Character-local choices

For each character group and each team, the character has three roles: absent, ordinary member, or leader. Across three teams there are `3^3 = 27` role patterns. For each pattern, a local exact matching chooses distinct physical cards for the occupied roles, respects destination masks, and contains every physical card that cannot be unused.

Only four ranked non-required cards per team/role are needed inside this local matching. At most three role positions consume physical cards from one character, and a conditional query may additionally forbid or force one card. If a candidate lies below the first four for a role, at least one of those four remains available whenever that lower candidate could be used. Required and forced cards are added explicitly, so this lemma is not a global roster truncation.

### 5.3 Count-state dynamic program

The joint program scans character groups. Its state stores, independently for each team, the number of consumed *optional* residual positions and whether a leader has been supplied. A required character reserves its position before the program starts; consuming that character does not also consume an optional position. The Cartesian state count is at most `10^3 = 1,000` and usually shrinks as teams fill.

For character `g`, state transition `x -> y` exists for every locally feasible role pattern whose occupancy and leader effects match the three count axes. If `w(g,r)` is the upward-rounded local weight for pattern `r`, the forward recurrence is

```text
F[g+1,y] = max(F[g,x] + w(g,r))
             over every valid transition (x,r) -> y.
```

The terminal state requires every optional position to be consumed and every team to have exactly one leader. Hence the terminal maximum covers every residual three-team allocation admitted by the relaxation while enforcing physical-card non-reuse within every character group and character uniqueness within every team. Adding constants, subtracting downward offsets, and applying the final upward rounding envelope yields the whole-medley upper.

Backward tables compute the corresponding best suffix. Joining a local choice between a forward prefix and backward suffix gives, without rerunning the whole program:

- an upper for assigning each physical card to each of its four destinations; and
- an upper for each character's eight residual three-team occupancy masks; fixed members and full-team destinations have already left the residual domain.

A destination or occupancy mode is removed only when its conditional upper is strictly below the exact incumbent, or when no conditional completion exists. If all competitive occupancy modes include a team, that character becomes required there; if none include a team, that destination is removed. All deductions in one pass are consequences of the same parent relaxation and may be applied together. Equality always remains searchable.

An incremental joint update is allowed only when fixed members and fixed scores are unchanged, required masks are identical, and every owner mask only shrinks. Changed character choices are rebuilt, and a forward prefix or backward suffix is reused only where its boundary table is element-for-element identical. Otherwise the implementation attempts a fresh model. If a new proof bound is unavailable or does not fit the configured search budget, an already valid ancestor whole/destination bound may still constrain its smaller descendant space, but occupancy deductions are consumed only while the incremental-update predicate holds; otherwise the optimization is skipped. Reuse changes work, not the represented completion set.

## 6. Exact closure of small residual products

When the sum of the three family row counts is at most the local limit—at most 256 and reduced further when the remaining memory budget requires it—the search materializes every team completion in the three families. A larger block may also close directly when total rows are at most 1,024, the product of the two smaller row sets is at most 65,536, and its temporary storage fits the budget. These thresholds select an exact method; they never discard rows.

Every row initially carries a proof-safe song upper. Exact five-card scoring is deferred until a row participates in a conflict-free, incumbent-competitive triple. The direct join scans all eligible triples. The indexed join instead builds temporary bitsets mapping physical cards and required cards to rows of the largest table, then enumerates all pairs from the other two tables and every compatible indexed row. Both joins:

1. reject repeated physical cards across teams;
2. require every card whose `unused` destination has been removed;
3. use strict upper cuts, retaining equal-score candidates; and
4. compute the final total as `(song0 + song1) + song2`.

Sorting and bitsets alter enumeration order only. After the block completes, rows, indexes, and bitsets are released.

## 7. Complete traversal

The search proceeds as follows:

1. Validate that at least one legal fifteen-card assignment exists.
2. Build chart-local score data and safe root bounds for every area configuration.
3. Score a bounded set of deterministic proposals and one-sweep card swaps/replacements to obtain an early incumbent. A failed proposal proves nothing.
4. Visit every area configuration in descending estimated quality, unless its root upper is strictly below the incumbent.
5. At each DFS node, repeatedly apply inherited bounds, refresh changed individual bounds, and settle completed teams. If the node is not first closed by an exact local block, enforce projected singleton closure before calculating or updating the joint bound and applying proved conditional deductions.
6. Close a sufficiently small residual product exactly. Otherwise branch on one contested physical card into every feasible destination, including `unused`; if no joint choice is available, use the complete increasing-character prefix partition.
7. Restore the reversible domain and continue until every child and every configuration is exhausted or safely pruned.

The explicit stack avoids call-stack depth proportional to the roster. Branch order favors maximizing proposals and large conditional gaps, but all feasible children remain present. Completion probes run periodically and can improve the incumbent; they cannot certify or remove a branch.

## 8. Exactness argument

### Lemma 1: leaf scores are exact

Every reported solution is produced by enumeration that maintains the team and physical-card constraints, then evaluated by the canonical scorer. Legality of the area configuration is a validated input premise supplied by the source adapter. Bounds and heuristic estimates cannot enter the result directly.

### Lemma 2: the unpruned traversal is complete

The source adapter lists every legal `q` in `Q`. Within one configuration, increasing character prefixes enumerate every unordered five-character team once. Ownership splits partition a card's remaining completions by its three team destinations and `unused`. Required-character resolution enumerates every eligible physical card of that character. Local closure enumerates every row and every conflict-free triple. The exact scorer evaluates every leader for each reached five-card set and retains its best deterministic representative. Therefore, with pruning disabled, every legal triple of card sets—and the best score obtainable from every leader choice for that triple—is represented.

### Lemma 3: each pruning value is an upper bound

The scorer-to-product bridge in Section 4 makes `reference_ceiling(ceil(P*K))` an individual settled-song upper, and AM-GM safely bounds its `P*K` input. The joint bound retains the relaxed model's constant and linear algebraic terms through directed upper representations and replaces only `Pr*Kr` by a valid interval-secant upper; its final `R(4)` factor covers settlement and medley addition. It then maximizes over a relaxation containing every legal residual allocation. A forward/backward conditional maximizes the corresponding conditioned relaxation; a local pattern is recorded as unavailable only if no conditioned completion exists or its safe upper is strictly below an exact feasible cutoff. Upward operations enlarge positive terms and downward operations reduce subtracted offsets. If a finite proof value cannot be established, the individual bound becomes infinity or the joint optimization is disabled. Thus no bound is below the best exact completion it represents.

### Lemma 4: every structural deduction preserves completions

An owner or occupancy option is removed only if infeasible or strictly unable to tie the incumbent under a safe conditional upper. Required-character consensus records a property shared by every competitive occupancy mode. Projected singleton closure records the only destination present in every completion. None of these operations removes a completion that could equal or beat the incumbent.

### Theorem: an `exact` outcome contains the global optimum

By Lemma 2, every legal medley belongs to a visited or pruned range. By Lemmas 3 and 4, a pruned range has no solution strictly better than the incumbent; equal ranges are retained for deterministic tie selection. By Lemma 1, the incumbent is a legal exact score. When traversal exhausts all configurations and ranges, no better legal score exists; the per-team leader rule and complete-medley comparator select the specified deterministic representative among ties.

If no legal leaf exists, the same exhaustion proves `best = null`. The theorem does not apply to an `incomplete` outcome.

## 9. Numeric and failure safety

Proof arithmetic uses explicit upward/downward binary64 helpers. Positive upper terms, slopes, and rounding envelopes are directed upward; lower endpoints and subtracted offsets are directed downward. If proof-bound construction cannot produce a safe finite value, that optimization is disabled or treated as unknown instead of pruning. Controlled allocation, count, and index failures return `incomplete`. Signed-`i128` exact-score accumulations rely on statically proved bounds from the validated `u32` inputs rather than per-add checked arithmetic. An exact row exceeding its claimed local upper produces `scorer_disagreement` rather than continuing with a false proof.

Every score cut is strict against an exact feasible cutoff: normally the global incumbent, and inside a local join possibly the best candidate already scored for that fixed pair. Equality remains because the deterministic tie representative may improve. An unavailable finite proof bound becomes infinity or disables that optimization, so exhaustive search may still finish `exact`. Detectable exact-scoring/input arithmetic failures, controlled allocation failures, timeout, cancellation, counter overflow, and internal inconsistency fail closed as `incomplete`, optionally with diagnostic `bestSoFar` and discovered solutions. If the process, worker, or browser is terminated outright, no final outcome can be promised, but it cannot be reported as `exact`. There is no score-gap success state.

Stop checks occur between nodes, candidates, and character-table work, not inside every scalar scoring operation, so a deadline is cooperative rather than hard real time.

## 10. Resource model

The configured search-storage budget covers local rows and indexes, score-cache capacity, shared count layouts, joint snapshots retained by live DFS ancestors, and conservative workspace reservations. `peakSearchStorageBytes` is a budget-accounting peak, not process RSS. The input, source model, exact scorer temporaries, single-team ranked lists, and some traversal data are outside that counter; native benchmark runs separately sample process working set.

Joint snapshots are retained only while a descendant can reuse them and are released with the final reference. Shared count layouts are charged once. Local rows and bitsets live only for one closure block. The score cache has fixed capacity. Exhaustive correctness does not depend on any cache entry surviving.

The worst-case search remains exponential. The implementation deliberately does not claim a polynomial bound or a fixed practical runtime for arbitrary rosters.

## 11. Verification obligations

Every change to enumeration, bounds, or deductions must pass the narrowest applicable checks and the complete Rust suite. In particular, the retained suite covers:

- tiny exhaustive search against an independent oracle under different memory budgets and configurations;
- individual and joint upper coverage over every legal tiny completion and leader;
- forward/backward whole, destination, and occupancy-mode values against exhaustive assignment;
- required characters, physical-card conflicts, fixed teams, negative extras, and deterministic ties;
- scan/indexed-join parity with more than one bitset word and deliberately different upper/exact ordering;
- projected effective-owner singleton materialization and reservation fulfilment;
- exact scorer agreement with the independent 120-order implementation; and
- stop-control reason preservation, search-budget exhaustion as `incomplete`, strict input validation, hydration score disagreement, and the complete projected-singleton `joint_step -> Restart` order.

After Rust search code changes, rebuild the committed browser artifact with `npm run build:medley-foundation:wasm`; the ordinary Next.js build does not regenerate or execute it. The repository currently has no automated end-to-end binding check, so release verification must exercise a retained case through the Team Builder page and record that manual result.

Runnable commands, browser-artifact requirements and the separate provenance rules for optional private real-profile comparisons are documented in [Medley Testing and Verification](medley-testing.md). Historical score comparisons supplement the portable proof tests; they do not replace exhaustive tiny cases or upper-bound coverage.

## 12. Scope and non-goals

This design proves top-1 under the scoring and product rules in the foundation document. It does not prove a global top ten, model native judgment histories, use life state, choose song order, or optimize event points. It uses no score quantization, approximate candidate removal, external storage or server-side search. Any optimization that removes work must identify the represented completion set and the inequality or exact partition that preserves it before a performance result can count as safe.
