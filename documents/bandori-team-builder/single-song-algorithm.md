# Single-Song Team Builder

Chinese version: [single-song-algorithm.zh-CN.md](single-song-algorithm.zh-CN.md)

Single-song search now runs in the medley Rust/WASM package. It shares profile/master normalization, card parameters, area configurations, conditional skill resolution and the exact skill-window scorer described in [Medley Rules and Scoring](medley-foundation.md). The former TypeScript single-song search and its independent chart, scoring and bound modules are retired. The general card calculator remains available to card-detail and profile-editing callers.

## Objective and results

The web form accepts nonnegative integers for minimum total power and minimum leader skill bonus, including numbers with thousands separators. An empty field or zero leaves the minimum unrestricted. Fractional entries require correction before the search starts. The normalized solver compares thresholds at their supplied precision.

The score objective is **the highest expected score over legal formations**, using the position-dependent distribution below. `eventPoint` applies the existing event formula to that expectation, including bonuses and mission support where applicable. This is not the expectation of separately settled per-order Pt. Versus/festival targets remain score-linked; placement, win/loss and Live Boost affect the displayed Pt options.

A main team has five physical cards from five different characters, no excluded cards, and one owned area configuration. Minimum leader skill and team power constraints remain enforced. Leader eligibility uses the actual full-team skill context, not an unavailable conditional maximum. The own-card leader occupies card position three (index two); this does not fix the cooperative room seat.

Before normalization, the Worker applies only the calculator's explicit exclusions to owned cards, ignoring saved profile exclusion flags. Temporary cards replace the corresponding owned cards and remain unexcluded. Saved profiles and their exclusion flags are unchanged; the shared source adapter honors the effective flags supplied by the Worker.

Individual play displays the optimal card formation; cooperative play additionally reports the optimal player formation. `averageScore` contains the unrounded weighted expectation at that formation, labeled **Expected score**. A score target ranks it directly. Pt targets rank Pt base, then expectation, using room score at that same player formation. Further ties use total power, lexicographic card instance IDs, player identities in room-seat order, then configuration index. Changing the display multiplier does not rerun search.

Each retained team also reports its minimum score in the displayed formation, its reachable maximum over legal formations of the same five cards and area configuration, a formation and activation order achieving that maximum, and the probability and expectation of that formation. The maximum setup may change the leader subject to the same constraint. It maximizes score, then maximum-score probability, then expectation, then stable instance IDs. Probability sums all tied maximum orders, including equivalent skills.

Individual-play formation and activation sequences refer to the numbered cards in the main result. This post-search analysis does **not** search the roster for the team with the largest maximum score; that objective is a future enhancement. `resultLimit` remains 1–50. The contract for `exact` is a best result or infeasibility within the supplied data/model. Other results are discovered alternatives, not a proved global top N. `incomplete` preserves its reason and any best-so-far results. Hydration recomputes the retained solution and fails on disagreement.

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

When activation times do not depend on the order, already-rounded card/window contributions C[w,c] give five position/card weights plus `1024*C[5,c]` for the center card and a constant base score. A 32-mask assignment DP maximizes the integer numerator in 80 transitions. Queued timing uses the additional exact paths below; the marginal matrix alone is insufficient when earlier actors change later windows.

The two audited ARM64 builds run the five remove-and-insert steps above in the parameterless `InGameSkillNoteController.SetupSkillCharaList`. Enumerating the possible insertions reproduces all 96 orders and every entry in the weight matrix. In normal cooperative play, the room host keeps the generated order. Other players clear their local list and consume the synchronized order. This evidence covers the usual host-generated sequence; disconnect recovery and the mapping of every external input to a room seat are separate questions.

| Client build | SHA-256 of `libil2cpp.so` | Skill order initializer RVA |
| --- | --- | --- |
| JP 10.1.3 | `66c9c666c50962b662df8d894e851c7d18f07142dca145cfac3d30d063d1d9fa` | `0x3307b58` |
| CN 10.1.3 (version code 106) | `3f9886b904fd7cba01c38880229d2f301a108edf9ca68ad9753daa6283378a33` | `0x33f7a38` |

The earlier CN order audit at RVA `0x335969c` used the library distributed with CN 9.4.4 (version code 105). The old archive label “9.4.3” has no independently verified APK identity here. These checks identify bundled native behavior. A live client with a runtime patch can execute different code. [CN 9.4.4 manifest and binary hashes](medley-foundation.md#native-cn-power-display-and-scoring-boundary-2026-09-14)

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

In both 10.1.3 builds, the playing state writes the float bits `0x3f400000` (0.75) to the finishing timer. The finishing state decreases it by `deltaTime` each frame and checks the queue after expiry. The playing/finishing method RVAs are `0x33228c4` / `0x3322924` on JP and `0x341a658` / `0x341a710` on CN. HHWX uses the continuous-time recurrence above. When a note and a state transition share a frame, these methods alone do not determine which is processed first.

Four paths keep the cost bounded without approximating the expectation:

| Timing case | Exact evaluation |
| --- | --- |
| Even the longest possible actor leaves enough space | Original fixed-window assignment. |
| All actor durations are equal | Shift the six windows once, then use the same assignment. |
| Only encore can move | For each eligible leader, add `weight[4,position] * encoreExtra[leader,lastActor]` to the assignment matrix. At most five assignments. |
| Earlier windows depend on order | Cache contributions by actor, activation slot and actual start; score at most 120 orders for each of five leaders, then apply the 96 order weights to each formation. |

Tables are reused for expectation and retained-result maximum/probability calculations. Equal-power leaders share a calculation; distinct binary64 powers require separate groups. The general case costs more than fixed windows; this change is not a claim that score/Pt search optimization is complete.

## Sources for note scores and event Pt

| Question | Evidence and scope |
| --- | --- |
| Where do the analytical formulas come from? | The pinned Bestdori `c0f0` module provides the note-score floors and average judgment multiplier. Its team-builder bundle computes average score before converting it to Pt, with three normal-event formula versions, challenge conversions, versus/festival tables and mission support. These are the sources for the corresponding HHWX conventions. [Upstream bundles and SHA-256 hashes](medley-foundation.md#8-compatibility-and-deliberate-differences) |
| Which part of the base score is native? | In the two 10.1.3 builds above, `ScoreUtility.calculateBaseScore` uses single-precision operations in the order `((totalParameter * playLevelScoreRate) / maxNoteCount) * 3` (JP RVA `0x331f708`, CN `0x34169ac`). This establishes the base calculation for those arguments. Calculation of combo, judgment, Fever, skill effects and final rounding requires evidence from their own paths. HHWX's binary64 arithmetic and staged floors are specified below. |
| What does the client know about awarded Pt? | The ordinary-event results screen reads the response fields `point` (this play) and `eventPoint` (cumulative). In `ResultEventPointController.Setup` the reads start at JP `0x355aaf0` and CN `0x36e2eb4`. Subtracting the award from the cumulative total supplies the animation's starting value. Settlement data includes `basePoint`, `scoreBonus`, `memberBonus`, `memberBonusRate` and `liveBoostUseCount`; mission results also include `supportDeckBonus`. These fields identify the award and its components. The screen does not establish how the server calculated each component or rounded it. |

A check against a played result needs the region, event and formula version, the actual personal score (and room score when applicable), bonus, support and boost or CP, together with the awarded Pt for that same play. No such paired result is cited here. The current optimizer applies the event formula to expected score. A single observed play can check the event conversion at one input; it cannot establish how the optimizer should average hypothetical skill orders.

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

### Machine-checked Top-1 theorem

For a normalized request, `single_exact` proves that a completed search in the model returns a feasible result that ranks at least as high as every feasible result. Feasibility ranges over the supplied equipment configurations, five distinct character groups, one physical card per group, eligible leaders and legal positions. An exact empty result implies that this set is empty. The theorem takes the character groups, leader eligibility, leader power, room calculation, bonus and support as inputs. Song score uses the weighted mean. The Pt objective applies the selected formula once to that mean and the room value for the same formation. The score-linked modes use the score comparator. [Theorem and definitions](../../proofs/bandori-single/SingleSong.lean)

| Part | What the proof checks |
| --- | --- |
| Search | Group selection covers every legal five-card choice. A strictly lower primary upper bound can close a branch. An equal bound remains open for the secondary comparison. A stopped child cannot yield a completed parent. Keeping at least one result preserves the best discovered candidate through deduplication and truncation. [Traversal](../../proofs/bandori-single/Search.lean) · [Retention](../../proofs/bandori-single/Retention.lean) |
| Song and formation | Grouping the 1,024 skill paths into 96 weighted orders preserves the numerator for any order-dependent score. For fixed windows and a delayed encore, the assignment recurrence maximizes the integer numerator and selects the first legal formation in lexicographic order among equal numerators. Room enumeration covers each eligible leader and player formation. [Formation proofs](../../proofs/bandori-single/Formations.lean) |
| Notes and skills | Summing six queued windows gives the same per-order score as visiting each note and counting earlier covered notes. The skill envelope handles signed increments and both signs of the continued-PERFECT multiplier difference using the observed range of power-function values. Its final rounding inequality has explicit primitive arithmetic premises. [Order scorer](../../proofs/bandori-single/Scoring.lean) · [Skill bounds](../../proofs/bandori-single/SkillBounds.lean) |
| Pruning and support | Queue windows enclose the reachable times. Nonnegative per-note ceilings, independent position maxima, character suffix tables, correlated products and upward bonus bins bound their respective legal completions. For fixed main cards, selecting the strongest remaining card per character and taking the best five maximizes each rank in descending order. Summing them in that order therefore maximizes support under monotone rounded addition, including when fewer than five characters remain. [Bounds](../../proofs/bandori-single/Bounds.lean) · [Support selection](../../proofs/bandori-single/Support.lean) |
| Activity conversion | The five search formulas have an exact arithmetic specification for the published integer event constants. The operation-ordered specification also accepts the fractional base and divisor supported by the Rust input. Given the primitive rounding/order laws and the required component ceilings, the Pt upper covers the leaf value. For solo play with fixed bonus and support, maximizing mean score also maximizes Pt, including the oldest capped formula. [Rational formulas](../../proofs/bandori-single/EventPoints.lean) · [Rounded formulas](../../proofs/bandori-single/RoundedPoints.lean) |

The numerical boundary matters even for an ordinary solo event. In formula 2, a mean of 500,000, base 50, divisor 10,000 and a 15% bonus give 100 base points. The binary64 multiplication produces `114.99999999999999` and settles at **114 Pt**. Exact rational arithmetic gives **115 Pt**. The rounded specification includes this executable case. The top theorem takes the numeric ordering, configured per-order scorer and local pruning enclosures as inputs. Applying it to the shipped binary requires the Rust/WASM implementation to realize these inputs, including floating-point operation order, finite arithmetic, room rounding and the actual bound tables. Small exhaustive Rust and WASM comparisons exercise that correspondence; the Lean kernel checks the mathematical algorithms. The theorem concerns the first result under the HHWX rules and makes no claim about the game's server settlement. [Reference checks](medley-testing.md)

**Single-song input limits.** Before searching, Rust validates the decoded request. A single card's Pt bonus must be between 0 and 10 (up to +1,000%). Per-card support power, the normal event base, note times in seconds and skill durations in seconds must lie in `[0, 2^32 − 1]`. The event divisor must lie in `[1, 2^32 − 1]`. One external player's normalized deck power may reach `2^32 − 1`, and the four external players together may reach four times that value. JP and CN 10.1.3 use unsigned 32-bit fields for submitted scores and deck power. The calculator uses these limits as engineering allowances. [Normalizer](../../src/lib/bandori/team-builder/single-source.ts) · [Rust input checks](../../crates/bandori-medley-search/src/single.rs)

**Correspondence with the shipped search.** The Worker resolves owned and temporary cards, exclusions, character groups and full-team skill conditions. The adapter forms the Cartesian product of the owned band sets, attribute sets and parameter choices. Rust visits each supplied configuration and selects one card from each of five different characters. This defines the equipment search space. Individual pieces from unrelated sets do not enter as arbitrary equipment combinations. Within each five-card choice the scorer uses the eligible leaders, groups identical leader powers, and applies the public comparator to the resulting legal formations. With an event Pt target, the event formula uses the rounded mean and room score for the same formation. [Normalization and equipment](../../src/lib/bandori/medley-foundation/search-source.ts) · [Search, comparison and hydration](../../crates/bandori-medley-search/src/single.rs)

A single-song chart may contain up to 16,384 scoring notes. Within each skill window, the cooperative calculation sums each covered note's base contribution times `(skill multiplier − 1)`. These window totals adjust the chart's base rate according to the skill order. A multiplier above one increases the rate, and a multiplier below one reduces it. In a synthetic chart with 250 million notes, accumulating the negative contributions in a PERFECT-only skill window yielded a room score of −40 despite the first note's positive contribution. The timing limits also keep the 0.75-second skill wait distinguishable at every queued trigger. Limits apply to values after the existing JSON decoder has read them.

The combined check allows a conservative score estimate up to `2^43`. It combines the strongest card with the largest available item rate and equipment slot count, allows five such cards, and adds external player power. It multiplies this power (at least 1) by the level factor, the largest resolved skill multiplier and 32. This last factor covers base scoring and six windows, combo, judgment, Fever and rounding headroom. The per-note divisor cancels when summed over the chart. In this range a one-point margin covers room-score rounding in the other-player bound. A custom request can exceed the estimate even when a specific team would fit. [Score-range check](../../crates/bandori-medley-search/src/single.rs) · [Room-score bound](../../crates/bandori-medley-search/src/single_upper.rs)

With per-order scores in `[0, 2^43]`, the 1,024-path weighted numerator is at most `2^53`. Binary64 represents each such integer exactly, so division by 1,024 preserves formation ordering. Lean proves the range from exact-arithmetic premises on the admission budget and per-note bounds. The correspondence of Rust binary64 operations with those premises is checked separately. [Range lemmas](../../proofs/bandori-single/SingleSong.lean) · [Formation selection](../../crates/bandori-medley-search/src/single_score.rs)

The binding regressions exercise both sides of the input limits. The six-card overflowing bonus and the oversized room and formation fixtures now produce an input error before search callbacks run. A valid fixture still runs to completion, and arithmetic failure during an admitted search still produces `incomplete`. [WASM input and search regressions](../../tests/bandori-single-search.test.mjs)

Run `lake build` in the proof directory to check the theorems with the pinned Lean toolchain. When a pull request or a push to `main` changes files under `proofs/bandori-single/`, a dedicated workflow runs the same command from a clean checkout.

```sh
cd proofs/bandori-single
lake build
```

Run `npm run test:team-builder` from the repository root to exercise the WASM input checks, including the historical numerator collision.

## Single/medley alignment audit

Single-song scoring weights skill orders by formation and queues the next activation until 0.75 seconds after the preceding skill ends. The table compares the current rules for both modes.

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

The audit brought single-song parameter accumulation into the same leader-centered order used by medley.

## Agreed optimization direction

Optimization is staged by objective: first establish and, where measurements justify it, improve expected-score search; then optimize the additional trade-offs required by Pt. Score and Pt retain one search framework with objective-specific bounds and traversal priorities. The objective, event formulas, rounding, formation analysis and deferred maximum-score roster search remain as defined above.

The weighted-order model and full 0.75-second queue have completed their correctness and delivery baseline checks. The first expected-score optimization reuses request-invariant upper preparation. Normal-event Pt search now also uses the bonus-conditioned bound described above, retaining scoring and traversal. Equal-Pt secondary-score pruning, branch-specific support, cooperative completion DP and individual position-matching bounds remain separate, measurement-driven options. Maximum-score roster search remains deferred. Exactness refers to the continuous-time analytical model specified above.

The original optimization baseline was single v3 after mainline #216/#218 alignment, queued timing and canonical leader-parameter accumulation. Single v4 added weighted cooperative positions. Regenerate validation inputs with the current single-song adapter when comparing scoring versions.

1. **Expected-score stage:** use individual and cooperative play to assess the common score bounds, branch cost and time to find a good incumbent. Reuse the completed score and score-linked smoke cases, and add controlled counterparts to retained Pt cases by changing only the objective to score, preserving event-dependent power and all other inputs. Improve only measured common-search bottlenecks, one change per experiment, with scoring fixed. This stage establishes correctness, coverage and an adequate baseline within the existing budget; it does not require exhausting all possible score optimizations before proceeding to Pt.
2. **Pt stage:** the first change conditions power and skill coefficients on bonus bins, initially targeting the retained cooperative timeouts and then covering individual play through the same zero/one-leader DP. Traversal remains fixed. Secondary expectation bounds for equal Pt, Pt-aware traversal and branch-specific mission support are separate later experiments, justified by remaining measured bottlenecks. Pt search still considers the full eligible roster: it must not first select score-optimal teams or a score top N and optimize Pt only within that subset.

Every new pruning rule must agree with independent exhaustive small-case completions, including partial branches, rounding boundaries and ties. Preserve directed upper enclosures and fail-open behavior for unknown bounds; do not truncate the candidate pool. Validate each stage on its target cases, then rerun the full 32-case single-song smoke subset at the same 30-second search budget and run the relevant public checks. Include the controlled score counterparts when verifying common-search changes. Compare elapsed time, visited branches, full-team evaluations, incumbent timing, exact completion and memory: fewer branches alone do not prove a speedup.

For single-song changes, exercise the rebuilt WASM with the public binding tests and check package size and initialization. For changes affecting the shared scorer or Worker, see [Medley Testing](medley-testing.md#5-optional-real-profile-regression).

Correctness comparisons reuse frozen input bytes and verified baseline outputs, with rules versions and source/artifact hashes. Routine iterations run only the new implementation; unchanged reference code is not rerun to reproduce existing answers. Run an old implementation only for a missing new-input baseline, a specific baseline discrepancy, or necessary representative timing measurements. An incomplete baseline remains incomplete evidence. Reuse existing timing records with their environment and date; if they are not comparable, report the new runtime without claiming a precise speedup ratio. Correctness comparison and performance remeasurement are separate decisions.

## Delivery and compatibility

- [`single-source.ts`](../../src/lib/bandori/team-builder/single-source.ts) bridges UI event/settings policy to shared medley roster/chart normalization.
- [`single.rs`](../../crates/bandori-medley-search/src/single.rs), `single_score.rs`, `single_upper.rs` and `single_event.rs` own one-team search. The common scorer remains `exact_score.rs`.
- Normalized versions: `hhwx-single-search-input-v1` and `hhwx-single-medley-foundation-v5`; obsolete and unknown versions fail validation.
- `runSingleSearchJson` ships through the existing `medley-wasm/pkg/` package. Regenerate after shipped Rust changes; rebuild the Worker import graph and WASM asset together.
- Public profile/master/chart APIs and persisted card IDs are unchanged. The UI enables external skill conditions by default, including when older live preferences omit `conditionSatisfied`; an explicitly saved false remains false. The UI always sends a boolean. Low-level adapter callers that omit the field still receive the base skill effect. The old callable TypeScript search export is removed; `bandori-team-search.ts` retains display/settings types only. Historical comparisons require an explicit clean pre-retirement checkout.
- Medley uses `hhwx-medley-bestdori-v5`; its input schema, uniform-order model, three-song search and output shape remain unchanged, while affected skill scores may change.

Run `npm run test:team-builder` for the actual generated binding against independent note/formation/order enumeration, regional fallback and zero, endpoints, Fever, combo limits, Pt, support, cooperative inputs and stop/error paths. Rust tests compare search and every partial bound with complete enumeration. Run affected shared-source and medley binding regressions; see [Medley Testing](medley-testing.md). Browser verification must execute the real Worker and regenerated WASM, including progress, terminal status, cancellation and result display. Builds alone do not prove those paths.

To check the two minimum thresholds on the rendered page, start a local production build and run `node --import tsx tests/bandori-team-builder-constraints.browser.mjs` from the repository root. Set `BASE_URL` to the build's origin (default `http://localhost:3000`). Use the build's `NEXT_PUBLIC_SUPABASE_URL` so the browser can seed its synthetic session. If Playwright is installed outside the project, set `PLAYWRIGHT_MODULE` to that installation. The test supplies a public five-card fixture, runs the production Worker and WASM, and checks the displayed results for typed, pasted, restored, cleared and fractional thresholds. [Browser regression](../../tests/bandori-team-builder-constraints.browser.mjs)
