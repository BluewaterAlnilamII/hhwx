# Single-Song Team Builder

Chinese version: [single-song-algorithm.zh-CN.md](single-song-algorithm.zh-CN.md)

Single-song search now runs in the medley Rust/WASM package. It shares profile/master normalization, card parameters, area configurations, conditional skill resolution and the exact skill-window scorer described in [Medley Rules and Scoring](medley-foundation.md). The former TypeScript single-song search and its independent chart, scoring and bound modules are retired. The general card calculator remains available to card-detail and profile-editing callers.

## Objective and results

The score objective is **the highest expected score over legal formations**, using the position-dependent distribution below. `eventPoint` applies the existing event formula to that expectation, including bonuses and mission support where applicable. This is not the expectation of separately settled per-order Pt. Versus/festival targets remain score-linked; placement, win/loss and Live Boost affect the displayed Pt options.

A main team has five physical cards from five different characters, no excluded cards, and one owned area configuration. Minimum leader skill and team power constraints remain enforced. Leader eligibility uses the actual full-team skill context, not an unavailable conditional maximum. The own-card leader occupies card position three (index two); this does not fix the cooperative room seat.

Before normalization, the Worker applies only the calculator's explicit exclusions to owned cards, ignoring saved profile exclusion flags. Temporary cards replace the corresponding owned cards and remain unexcluded. Saved profiles and their exclusion flags are unchanged; the shared source adapter honors the effective flags supplied by the Worker.

Individual play displays the optimal card formation; cooperative play additionally reports the optimal player formation. `averageScore` contains the unrounded weighted expectation at that formation, labeled **Expected score**. A score target ranks it directly. Pt targets rank Pt base, then expectation, using room score at that same player formation. Further ties use total power, lexicographic card instance IDs, player identities in room-seat order, then configuration index. Changing the display multiplier does not rerun search.

Each retained team also reports its minimum score in the displayed formation, its reachable maximum over legal formations of the same five cards and area configuration, a formation and activation order achieving that maximum, and the probability and expectation of that formation. The maximum setup may change the leader subject to the same constraint. It maximizes score, then maximum-score probability, then expectation, then stable instance IDs. Probability sums all tied maximum orders, including equivalent skills.

Individual-play formation and activation sequences refer to the numbered cards in the main result. This post-search analysis does **not** search the roster for the team with the largest maximum score; that objective is a future enhancement. `resultLimit` remains 1–50. `exact` proves the best result or infeasibility within the supplied data/model. Other results are discovered alternatives, not a proved global top N. `incomplete` preserves its reason and any best-so-far results. Hydration recomputes the retained solution and fails on disagreement.

Hydration also retains `currentMaximumProbabilityNumerator`: the probability of the same reachable team maximum in the selected search-result formation, using the existing denominator. It is zero if that formation cannot attain the maximum, rather than the probability of its own lower peak. In individual play, when the selected and highest-probability formations differ, the UI shows both probabilities on separate lines; otherwise it shows one. Cooperative play hides the maximum-score plan and probability panels while retaining the optimal player formation and score range. The Worker still returns peak fields in both modes. This adds no search pass or scoring rule change.

## Skill order and formation optimization

The audited individual-play initialization is equivalent to:

```text
order = [0, 1, 2, 3, 4]
for i = 0 .. 4:
    member = order[i]
    remove member
    insert member at an independently uniform integer in [0, 4)
```

There are 1,024 choice paths and 96 distinct orders. Each iteration reads the already-mutated list, not the original member i. The insertion index is sampled after removal and excludes the upper endpoint. In individual play the sixth activation belongs to the leader.

The marginal weights at the first five triggers are below; divide by 1,024. Each row and column sums to 1,024.

| Trigger / original position | 1 | 2 | 3 | 4 | 5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 192 | 291 | 144 | 141 | 256 |
| 2 | 192 | 243 | 176 | 157 | 256 |
| 3 | 192 | 198 | 200 | 178 | 256 |
| 4 | 192 | 156 | 216 | 204 | 256 |
| 5 | 256 | 136 | 288 | 344 | 0 |

When activation times do not depend on the order, already-rounded card/window contributions C[w,c] give five position/card weights plus `1024*C[5,c]` for the center card and a constant base score. A 32-mask assignment DP finds the best formation in 80 transitions. Queued timing uses the additional exact paths below; the marginal matrix alone is insufficient when earlier actors change later windows.

This distribution was independently reproduced from retained arm64 binaries labeled JP 10.1.3 and CN 9.4.3. Their SHA-256 hashes are respectively `66c9c666c50962b662df8d894e851c7d18f07142dca145cfac3d30d063d1d9fa` and `1d798715a62f804cfa6696b02a8fc3e060abbb2e04877a50c26fc7ad6c7f2a02`. `InGameSkillNoteController.SetupSkillCharaList` was located at RVA `0x3307b58` and `0x335969c`. The version labels come from retained audit metadata; the binaries are the directly verified objects. This does not certify every current client version or regional release.

Cooperative play uses the player's leader and four external skills. It optimizes all 120 player formations using the same 1,024-path/96-order distribution, initialized in room-seat order. Player identity 1 is self, not a fixed room seat; external inputs are players 2–5. Rearranging own submembers does not rearrange players. Each eligible own leader and player formation is evaluated under the selected score/Pt objective; own and other-player expectations use that same formation. Encore follows the selected player identity regardless of seat. External players independently specify “condition satisfied” and never inherit the user's team context; unchecked uses the base skill. `orderModel: "weighted_room"` replaces the uniform assumption; probability denominator is 1,024. This reuses the same timing tables and one-team search, without a separate cooperative searcher.

Cooperative player formation and activation sequences refer to player identities, while own card formations remain separate. Results retain both optimal and peak player formations; the minimum uses the selected formation, and peak probability uses the peak formation. Peak ties additionally use stable player identities. WASM `playerFormation` and `peakPlayerFormation` use zero-based identities (null in solo); the Worker converts these to 1–5 for display. Persisted `self`/`other1`–`other4` keys retain their identities; only labels change.

## Queued activation timing

Single-song rules include the 0.75-second wait **after the previous skill ends**, in individual and cooperative play, including encore. For the six actual actors:

```text
start[0] = triggerTime[0]
end[w] = start[w] + duration[actor[w]]
start[w+1] = max(triggerTime[w+1], end[w] + 0.75)
```

An activation is not dropped when it queues behind another; delays propagate recursively. Its duration and analytical covered-note counter begin at its actual start. A skill queued beyond the chart scores no notes. All skills consume their resolved duration, including score-neutral skills. There is no timing toggle, and the sixth activation is not exempt.

The retained JP/CN binaries above set the finishing-state countdown to float bits `0x3f400000` (0.75), then start queued skills only after returning to idle. Relevant JP playing/finishing/queue RVAs are `0x33228c4`, `0x3322924`, `0x3322bc4`/`0x33236b0`; CN uses `0x3378af8`, `0x3378bb0`, `0x3379650`. The implementation uses the continuous-time recurrence above, not frame-by-frame `deltaTime` simulation. This is an explicit normal-play scoring model; the native evidence establishes the wait and queue, not exact frame-boundary note ordering.

Four paths keep the cost bounded without approximating the expectation:

| Timing case | Exact evaluation |
| --- | --- |
| Even the longest possible actor leaves enough space | Original fixed-window assignment. |
| All actor durations are equal | Shift the six windows once, then use the same assignment. |
| Only encore can move | For each eligible leader, add `weight[4,position] * encoreExtra[leader,lastActor]` to the assignment matrix. At most five assignments. |
| Earlier windows depend on order | Cache contributions by actor, activation slot and actual start; score at most 120 orders for each of five leaders, then apply the 96 order weights to each formation. |

Tables are reused for expectation and retained-result maximum/probability calculations. Equal-power leaders share a calculation; distinct binary64 powers require separate groups. The general case costs more than fixed windows; this change is not a claim that score/Pt search optimization is complete.

## Scoring scope

Character parameters retain the separate potential and combined collection/training mission floors introduced in medley v4. Single-song rules are now `hhwx-single-medley-foundation-v5`, correcting continued-PERFECT skill normalization for sorted master effect keys; v4 introduced cooperative weighted formation optimization. Regenerate normalized inputs with the current adapter; historical v3 uniform-room outputs and v4 continued-skill outputs are not equivalent baselines. Saved profiles are unchanged.

Team power retains its fractional part for scoring, constraints and ranking. Only the displayed total and card overlays use the shared float32-then-truncate power helper. Mission support displays `floor(rawSupportPower)` while Pt uses the original value. Score expectation remains unrounded internally; the general integer formatter is unchanged. This is presentation alignment, not native float32 scoring emulation.

The retired Bestdori-compatible single-song caller floored team power before scoring; the migrated calculator deliberately follows medley's fractional-power contract. Support scoring retains its existing Bestdori-compatible policy: unlike the [audited native CN support path](medley-foundation.md#native-cn-power-display-and-scoring-boundary-2026-09-14), which truncates each card's P/T/V support contribution before summing, HHWX preserves fractional support contributions through search and Pt calculation. Flooring only the displayed total does not emulate those native per-parameter operations.

In that CN 9.4.4 binary, `EventSupportBandUtility.calculateEventSupportBandDetail` (`0x341c77c`) multiplies each card's P/T/V by the support rate as float32, then truncates at `0x341ca84`/`0x341ca88`, `0x341caac`/`0x341cab0` and `0x341cad4`/`0x341cad8`. `EventSupportBandData.CalculatedTotalParam` (`0x35de1c0`) adds those integers; `CalculateEventSupportBandTotalParam` (`0x341d7a0`) adds the card integers for `EventSupportBandDialog.initializeTotalParam` (`0x35b89e8`).

For each leader, parameter accumulation uses the medley canonical order: ascending instance IDs with the leader moved to index two. Card, area-item and event contributions use the same helper and operation order. Rearranging the remaining formation positions changes the order distribution, not this parameter accumulation convention. Distinct leader powers are retained through constraints, ranking and peak hydration, even when they differ only by a floating-point rounding bit.

Charts follow medley normalization: Single/Directional notes, scoring Long/Slide endpoints, property-presence skill triggers, stable trigger-first sorting at equal beats, and times anchored at BPM changes. Exactly six triggers are required. System entries are metadata, not scoring notes.

A trigger excludes itself from its own window. For an undelayed activation, subsequent scoring notes at the **same time are included**. For a queued activation, notes at its actual start are also included: coverage requires `noteIndex > triggerIndex` and `start <= note.time <= start + duration`. Notes between the original trigger and delayed start receive no benefit from that activation. There is no old 10-microsecond tolerance. Single combo starts at zero and caps at 1.11. Applicable Fever metadata doubles note scores inclusively between its start and end.

The shared scorer retains binary64 arithmetic and staged floors:

```text
coefficient = (3 + 0.03*(playLevel - 5)) / scoringNoteCount
inner = floor(((teamPower * coefficient * combo) * averageJudgment) * fever)
extra = floor(inner * skillMultiplier) - inner
orderScore = sum(inner) + sum(selectedWindowExtras)
```

PERFECT/GREAT effects, continued-PERFECT and rate-up skills retain the medley analytical simplifications. There is no sampled judgment stream, separately settled P/G expectation, tracked life/skill state, combo-break simulation or native f32 emulation. Probabilities describe skill order under this model, not a human's chance of attaining a literal in-game score. The shared kernel still adds independently rounded window extras; single-song scheduling now prevents overlapping activations, while medley retains its additive overlap policy.

Cooperative room score adds the no-floor other-player power estimate to raw own expectation, then floors once, retaining the existing `1e-5` room-only tolerance. Mission support selects up to five remaining cards with distinct characters, excluding main instances and excluded cards. Another card of a main-team character may serve in support. Support contributes `floor(power/3000)` Pt. Support opportunity cost is recomputed per team and does not discard main-card candidates.

## Search and proof

One-team search enumerates area configurations and character groups, choosing one card per selected character. It reuses Rust parameter/scoring arithmetic without invoking three-team search on dummy songs.

Directed-upward power and window bounds relax context/position constraints. Each timing bound covers the union from the original trigger to the latest possible queued start plus duration, using the longest candidate/context/external duration and upward-rounded recurrence. It deliberately overcounts possible coverage; the old fixed-window bound would be unsafe. Character suffix DP bounds power P, base-plus-weighted-skill coefficient K, bonus and exactly one eligible leader. It also bounds `tP + K/t` for three positive values of t. Since P,K are nonnegative, both `Pmax*Kmax` and `(max(tP+K/t))²/4` are upper bounds; their minimum remains safe. Shared rounding enclosures cover reassociation, skill multipliers and weighted-integer conversion; the cooperative room estimate encloses weighted-rate products and sums with a 256-operation rounding factor. Cooperative coefficients independently maximize each player's weighted position contribution, relaxing the shared-seat constraint; the former 1/5 coefficients would be unsafe. Event bounds relax own and other-player terms separately, never subtracting an upper own score from an upper room score to manufacture an unsafe bound.

Chart coefficients, queued-window envelopes, skill/bonus suffix tables and the support ceiling are prepared once per request. Window sums reuse the exact binary64 `(duration, skill delta bound)` bits; the skill delta and its failure checks are still evaluated before lookup. This cache contains at most four contexts per card plus four external skills and is released after preparation. Configuration-specific power and correlated `tP+K/t` tables remain per configuration. Character-group order is fixed; sorting cards within a group does not change its suffix maxima. This removes repeated work without changing bound arithmetic or traversal priorities.

Normal-event Pt search adds a bonus-conditioned suffix DP for individual and cooperative play, covering formula versions 0/1/2. Each card's bonus is rounded upward to an exact binary bin of 1/32 solely for this bound. For each suffix, remaining card count and total bin, the table bounds power and skill coefficients with zero or exactly one leader. Fixed-prefix contributions and each reachable suffix bin give independent own-score and other-player bounds, passed to the unchanged event upper formula; maximizing across bins covers every completion. This preserves score/bonus correlation without assuming actual cooperative Pt is monotone in power. Actual bonuses, scoring and eligible cards are unchanged. Bonus summation/rounding is enclosed before applying the monotone round-to-cent operation. The stronger bound is checked only after the original bound fails to prune with an incumbent; equality remains searchable. Zero bonus, more than 128 total bins, unsupported event rules or unsafe arithmetic retain the original bound. Its bounded storage is included in the budget estimate before allocation.

Only a bound strictly below the incumbent target prunes; equality remains searchable for ties. Proved infeasibility can close a branch before an incumbent exists. Unknown, non-finite and overflow-unsafe bounds cannot prune. Polling preserves timeout/cancellation, and arithmetic/hydration failures cannot become `exact`.

Storage grows with cards, characters, notes and retained results; five-card candidates are not materialized. A conservative workspace estimate, including a 1 MiB allowance for the bounded timing cache and formation map, is checked against the Worker budget before search. Stop polling also occurs before every complete-team evaluation. `estimatedSearchStorageBytes` is an estimate, not browser RSS, WASM heap capacity or a process hard limit; input serialization and runtime overhead are excluded. Heavy computation stays off the main thread.

## Single/medley alignment audit

The two additional **skill-execution model** features are the weighted order/formation model and the post-skill queue. Their effects on window coverage, expectation and peak probability belong to those two features. This does not mean different live modes have identical scoring and settlement rules.

| Boundary | Shared contract or intentional difference |
| --- | --- |
| Profile, regional masters, skills | Same `buildSearchRoster`, physical IDs, exclusion rules, CN null fallback versus explicit zero, skill level/duration and full-team band/attribute context. External players alone use their own condition inputs. |
| Character and team parameters | Same v4 separate bonus floors, owned area configurations, item applicability, fractional power and canonical leader accumulation. Event type determines whether event bonuses modify power or Pt; medley always uses its parameter-power policy. |
| Chart and skill boundaries | Same scoring entities, six triggers, stable equal-beat sorting, BPM-anchored time, trigger exclusion, inclusive starts/ends and no epsilon. Only single schedules actual starts. |
| Note score and analytical skills | Same binary64 coefficient, judgment/multiplier functions, covered-note counting and two staged floors. No additional life, native f32 or sampled-judgment model in either mode. The queued-window helper is checked against all shared skill behaviors and P=0/0.73/1. |
| Combo and Fever | Intentional mode rules: single resets combo and caps at 1.11; medley carries combo across songs and caps at 1.34. Single uses Fever in cooperative/festival modes; medley has no Fever. |
| Order and encore | Single individual/cooperative play uses 1024-path/96-order weights and optimizes card/player formation respectively; cooperative encore follows its selected player. Medley retains uniform-120 orders and center-leader encore. |
| Expectation and maxima | Single keeps fractional expectation and maximizes it over eligible formations; peak probability uses the peak formation and all tied orders. Medley floors each song's uniform expectation before summing and retains its existing maximum output. No global maximum-score roster objective is added. |
| Pt, room and support | Intentional event contracts: single applies its event formula to E(score), with the existing room estimate/floor and mission support; medley applies its own formula to the three-song total. Live Boost, CP, rank and result options remain presentation choices. |
| Display and serialization | Same power-display helper and integer score formatter; medley aggregate display converts each team to f32 before summing. Single support display keeps its explicit floor. Both use the same Rust JSON decoder; neither silently changes numeric parsing. |
| Search and delivery | One-team versus three-disjoint-team search and different stable tie policies are deliberate. Both retain fail-open unsafe bounds, honest incomplete status, recomputed hydration and real Worker/WASM delivery. |

The audit corrected the extra parameter-accumulation discrepancy in single only. Medley v4 normalization, parameter/scoring implementation, search and hydration remain frozen. Future medley alignment should explicitly port the two skill-execution features while retaining the mode-specific rows above; applying a single-song result formula to medley would change its contract.

## Agreed optimization direction

Optimization is staged by objective: first establish and, where measurements justify it, improve expected-score search; then optimize the additional trade-offs required by Pt. Score and Pt retain one search framework with objective-specific bounds and traversal priorities. The objective, event formulas, rounding, formation analysis and deferred maximum-score roster search remain as defined above.

The weighted-order model and full 0.75-second queue have completed their correctness and delivery baseline checks. The first expected-score optimization reuses request-invariant upper preparation. Normal-event Pt search now also uses the bonus-conditioned bound described above, retaining scoring and traversal. Equal-Pt secondary-score pruning, branch-specific support, cooperative completion DP and individual position-matching bounds remain separate, measurement-driven options. Maximum-score roster search remains deferred. Exactness refers to the continuous-time analytical model specified above.

The original optimization baseline was single v3 after mainline #216/#218 alignment, queued timing and canonical leader-parameter accumulation. Cooperative weighted positions advance this to v4. These are correctness updates, not performance experiments. Regenerate single validation inputs; compare medley against the frozen, already-verified v4 baseline with identical input bytes. Medley rules, scoring, search, stable winner tie-breaking and proof semantics must remain unchanged. Shared normalization, JSON number parsing, parameter arithmetic, scoring and medley bounds are outside the subsequent optimization scope. Rust changes still rebuild the shared WASM package, so isolation requires regression evidence rather than only a file boundary.

1. **Expected-score stage:** use individual and cooperative play to assess the common score bounds, branch cost and time to find a good incumbent. Reuse the completed score and score-linked smoke cases, and add controlled counterparts to retained Pt cases by changing only the objective to score, preserving event-dependent power and all other inputs. Improve only measured common-search bottlenecks, one change per experiment, with scoring fixed. This stage establishes correctness, coverage and an adequate baseline within the existing budget; it does not require exhausting all possible score optimizations before proceeding to Pt.
2. **Pt stage:** the first change conditions power and skill coefficients on bonus bins, initially targeting the retained cooperative timeouts and then covering individual play through the same zero/one-leader DP. Traversal remains fixed. Secondary expectation bounds for equal Pt, Pt-aware traversal and branch-specific mission support are separate later experiments, justified by remaining measured bottlenecks. Pt search still considers the full eligible roster: it must not first select score-optimal teams or a score top N and optimize Pt only within that subset.

Every new pruning rule must agree with independent exhaustive small-case completions, including partial branches, rounding boundaries and ties. Preserve directed upper enclosures and fail-open behavior for unknown bounds; do not truncate the candidate pool. Validate each stage on its target cases, then rerun the full 32-case single-song smoke subset at the same 30-second search budget and run the relevant public checks. Include the controlled score counterparts when verifying common-search changes. Compare elapsed time, visited branches, full-team evaluations, incumbent timing, exact completion and memory: fewer branches alone do not prove a speedup.

For iterations confined to single-song private implementation, verify the rebuilt WASM with public binding tests; add representative medley cases only for a concrete unresolved risk. Rebuilding the shared package or reaching a phase milestone alone does not trigger the full 80-case medley comparison. Run that comparison only when medley or the shared logic/delivery boundaries it depends on actually change, evidence suggests a medley regression, or the user explicitly requests it. Use matching inputs and budgets to compare the exact best result, stable ties, proof behavior and retained-team hydration. Check WASM size and initialization when rebuilding the package; measure medley runtime when a relevant performance risk exists. Reuse successful evidence when the relevant source, artifact and environment are equivalent. Record source and artifact provenance; historical archive results alone do not validate changed behavior.

Correctness comparisons reuse frozen input bytes and verified baseline outputs, with rules versions and source/artifact hashes. Routine iterations run only the new implementation; unchanged reference code is not rerun to reproduce existing answers. Run an old implementation only for a missing new-input baseline, a specific baseline discrepancy, or necessary representative timing measurements. An incomplete baseline remains incomplete evidence. Reuse existing timing records with their environment and date; if they are not comparable, report the new runtime without claiming a precise speedup ratio. Correctness comparison and performance remeasurement are separate decisions.

## Delivery and compatibility

- [`single-source.ts`](../../src/lib/bandori/team-builder/single-source.ts) bridges UI event/settings policy to shared medley roster/chart normalization.
- [`single.rs`](../../crates/bandori-medley-search/src/single.rs), `single_score.rs`, `single_upper.rs` and `single_event.rs` own one-team search. The common scorer remains `exact_score.rs`.
- Normalized versions: `hhwx-single-search-input-v1` and `hhwx-single-medley-foundation-v5`; obsolete and unknown versions fail validation.
- `runSingleSearchJson` ships through the existing `medley-wasm/pkg/` package. Regenerate after shipped Rust changes; rebuild the Worker import graph and WASM asset together.
- Public profile/master/chart APIs and persisted card IDs are unchanged. The UI enables external skill conditions by default, including when older live preferences omit `conditionSatisfied`; an explicitly saved false remains false. The UI always sends a boolean. Low-level adapter callers that omit the field still receive the base skill effect. The old callable TypeScript search export is removed; `bandori-team-search.ts` retains display/settings types only. Historical comparisons require an explicit clean pre-retirement checkout.
- Medley uses `hhwx-medley-bestdori-v5`; its input schema, uniform-order model, three-song search and output shape remain unchanged, while affected skill scores may change.

Run `npm run test:team-builder` for the actual generated binding against independent note/formation/order enumeration, regional fallback and zero, endpoints, Fever, combo limits, Pt, support, cooperative inputs and stop/error paths. Rust tests compare search and every partial bound with complete enumeration. Run affected shared-source and medley binding regressions; see [Medley Testing](medley-testing.md). Browser verification must execute the real Worker and regenerated WASM, including progress, terminal status, cancellation and result display. Builds alone do not prove those paths.
