# Greenfield Bandori Medley Foundation

中文说明见 [bandori-medley-foundation.zh-CN.md](bandori-medley-foundation.zh-CN.md).

## Checkpoint scope

This specification governs the first independent checkpoint of the new medley team calculator. The checkpoint contains a strict normalized input model and a transparent reference scorer for three explicitly supplied five-card teams. It contains no team generation, candidate search, pruning, ranking, proof protocol, or partial-result behavior, and it does not import any scorer or solver under `src/lib/bandori/team-builder/`.

The retained executable fixture has exactly 15 already selected cards and seven normalized notes per song. This is the minimum complete three-team flow, not a 15-card search. A future approximately 2,000-card roster is an end-state hard acceptance case; it is not a normal or early foundation input.

The audit baseline is the JP 10.1.3 arm64 client and JP master artifact `20260805110509`. The audited skill-effect artifact SHA-256 is `d98e76c0198a6a714be1d38e4696a044242c8384b905426a311c8c2b0961aebc`. The [official game FAQ](https://bang-dream.bushimo.jp/faq/) independently confirms six skill activations per song, random member order, next-note activation, continued-skill break behavior, and trigger-time life checks.

## Game-derived score chain

The score chain uses explicit IEEE-754 single-precision operations. Every line below produces an `f32`; positive integer conversion truncates toward zero:

```text
playRate = f32(1 + f32((playLevel - 5) * f32(0.01)))

baseScore = f32(
  f32(
    f32(deckTotalParameter * playRate) / f32(noteCount)
  ) * f32(3)
)

corrected = f32(baseScore * judgeRate)
innerScore = floor(f32(corrected * comboRate))
scoreUpRate = f32(feverRate * skillMultiplier)
noteScore = floor(f32(f32(innerScore) * scoreUpRate))
```

The `f32` judgment constants are `1.1` for PERFECT and `0.8` for GREAT. The two per-note truncation points are part of the contract. Tests retain cases where a Float64 rewrite is off by one at each boundary.

The fixed evaluator receives the final deck-level `f32` parameter consumed by the game score utility. The upstream normalization layer must produce it in the audited order:

```text
OriginalAll = f32(f32(originalP + originalT) + originalV)
AreaItemAll = f32(f32(areaP + areaT) + areaV)
EventBuffAll = f32(f32(eventP + eventT) + eventV)
deckTotal = f32(f32(OriginalAll + AreaItemAll) + EventBuffAll)
```

The reference scorer does not recombine per-card values in another order. The future search input needs an independently reviewed representation capable of reproducing this deck total for arbitrary candidate teams; this checkpoint intentionally does not guess that architecture.

Medley combo carries by successful-note count across all three songs. Because the model contains only PERFECT and GREAT, combo never breaks. The medley rate table is applied to `startCombo + noteIndex + 1`; the 20-to-21 boundary is retained as a test.

## PERFECT/GREAT-only expected score

`hhwx-medley-pg-expected-v1` deliberately excludes GOOD, BAD, MISS, combo breaks, life loss, and stochastic life inheritance. It is nevertheless the expectation of the two actual integer scoring outcomes, not an average multiplier inserted before truncation:

```text
E[noteScore] =
  p * integerScore(PERFECT, state)
  + (1 - p) * integerScore(GREAT, state)
```

The input probability is an exact canonical decimal with at most nine decimal places. The reference oracle propagates a deterministically ordered state distribution in `f64`; every realized P/G note score is first computed through the `f32` chain and both integer truncations. Continued and Crescendo state is part of that distribution. The returned expected averages are serialized by their `f64` bits, and no final floor is applied to the expectation.

The first five activations use every permutation of member indices `0..4` with equal probability. The sixth activation always uses member index `2`, the center leader. The song result is the stable-order mean of those 120 expected scores. The medley objective is the sum of the three song means; no maximum-score value participates as a hidden secondary objective.

## Resolved skill behaviors

The scorer accepts a deliberately small, team-context-resolved skill contract:

- `score`: the same score-up behavior for the supported P/G condition;
- `score_on_perfect`: PERFECT receives the score-up while GREAT keeps its ordinary score;
- `perfect_only`: PERFECT uses `1 + value / 100`, GREAT uses absolute multiplier `0`;
- `continued_perfect`: the current GREAT immediately switches from the active value to the regular fallback, and all later notes remain on that fallback;
- `great_or_worse_half`: PERFECT uses `1 + value / 100`, GREAT uses absolute multiplier `0.5`;
- optional `rate_up_with_perfect`: current PERFECT first adds the supplied stack value, capped by the supplied maximum total score-up, then scores the current note; GREAT retains but does not increase the accumulator.

Raw master effects are not accepted. The actual-input normalizer must resolve source order, regional scalar fallback, team unification, and life branches before constructing these behaviors. In the v1 P/G-only model, activation life is fixed at 1,000: `over_life` uses `life >= threshold`, while `under_life` uses `life < threshold`. Unified continued skills must keep their regular fallback; for example, a unified high value must not leak into the post-GREAT fallback merely because the source row also carries a unified scalar. Unknown or unsupported source shapes fail closed.

## Skill-window policy

The trigger note and every other note at exactly the same normalized time are excluded from the newly triggered skill. A skill begins only when `note.timeMicros > trigger.timeMicros`.

The initial calculator end policy is deterministic and timestamp based: a note is included when `note.timeMicros <= trigger.timeMicros + durationMicros`. This is an HHWX calculator policy, not a claim of frame-exact client reproduction. The game client decrements an `f32` timer after note processing and ends the skill on a later frame; a native boundary capture would be required to replace this policy with a proven frame model.

The client queues conflicting skill windows, but the calculator intentionally follows the confirmed HHWX override. For every active skill, the scorer advances its state independently and obtains `m_i`, then combines in stable trigger order:

```text
skillMultiplier = f32(1 + sum(f32(m_i - 1)))
skillMultiplier = max(0, skillMultiplier)
```

Fever is then multiplied once and the second per-note truncation occurs once. Skills are not separately rounded into score deltas. Retained fixtures cover ordinary positive overlap and a `0.5` GREAT multiplier overlapping a positive score-up.

## Input and result boundaries

The normalized fixed input uses:

- dense card `instanceId` values `0..14`;
- positive master card, character, and skill IDs;
- unique physical instances across all three teams;
- unique characters within each team;
- bit-exact finite non-negative `f32` deck totals and skill rates;
- exactly three ordered songs and exactly six triggers per song;
- dense, time-sorted notes using integer microseconds;
- no search controls or UI/network objects.

Unknown JSON fields, unsupported versions, non-canonical probability, invalid references, duplicate instances, malformed chart ordering, non-finite values, and arithmetic overflow fail closed. Validation failures are input failures, never “no solution.”

The trace records the deck-total, play-rate, and base-score `f32` bits; each P/G first-round integer note score; all 120 expected skill-order scores as `f64` bits; the average score bits; combo offsets; and the peak reference-state count. This trace is an oracle artifact, not a compact production result.

## Deliberately deferred decisions

Before any search algorithm is designed, a later foundation checkpoint must finish and audit the actual UI/source snapshot, regional resolution, card/stat/area/event deck-total pipeline, chart normalization, and source/semantic fingerprints. Browser WASM glue also requires a separate bundler spike and versioned Worker protocol. None of those tasks authorizes a candidate layout, pruning rule, cache, dominance relation, or search-space partition.
