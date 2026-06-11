# Medley 40/40 Exact Roadmap

Last updated: 2026-06-12 00:51 CST

This file is the persistent working note for the current medley optimizer goal.
Keep it current before and after benchmark runs or proof-path changes, so future
analysis can resume from this file without relying on chat context.

## Current Goal

Primary target:

- Scope: the 10 normal retained real-profile samples, `P01` through `P10`.
- Events: `none`, `244`, `260`, and `323`.
- Matrix size: `10 profiles * 4 events = 40 all-scope cases`.
- Search budget: `300000ms` per case.
- Current pinned checkpoint: the earlier `40/40` count is no longer accepted
  for the active no-GC stability goal because repeat runs found score
  instability while still reporting `searchMode=exact`.
- Current bounded rows: none in the latest full runs, but exact correctness is
  under investigation.
- Final working target: stable no-GC, non-debug `40/40` exact for the retained
  `P01`-`P10` 40-case matrix, with identical accepted final scores across
  repeated full runs.
- Final success condition: not yet re-achieved after the false-exact finding.

2026-06-10 no-GC stability update:

- The active target is tightened from "can reach 40/40 with diagnostic GC" to
  "stable 40/40 exact without `--expose-gc`, without `global.gc`, and with
  `debugConfigurationTrace=false`".
- `enableLowMemoryInitialCandidateSyncGcProbe` is diagnostic-only. It may be
  used to confirm memory-lifecycle sensitivity, but it is not an acceptance
  condition and must not be required for production exactness.
- `P11` remains out of scope for the primary 40-case gate.
- Current no-GC blocker evidence: `P03:260` can abort during exact candidate
  fill as `candidate-fill-generator-aborted`, with only about `9599/5508/3679`
  candidates by slot and more than `240s` remaining. The failure is tied to the
  first full-width event root memory-risk path, where the local
  `3200 MiB` active configuration cap can be tripped by Node RSS even though
  V8 heap remains below the local cap.
- Current implementation hypothesis: keep the global/base memory guard using
  RSS for process-level safety, but evaluate the full-width-event active
  configuration cap against V8 heap usage only. This avoids relying on forced
  GC while preserving the outer `4488 MiB` RSS-backed safety gate.

No-GC acceptance contract:

- `P03:260` non-debug no-GC single-case repeated at least 5 times, all exact,
  with `timedOut=false`, `memoryLimited=false`, and stable score/gap.
- Hard guard set repeated at least twice, all exact: `P03:260`, `P06:323`,
  `P07:260`, `P08:323`, `P10:244`, `P10:260`, `P07:244`, and `P08:244`.
- Full process-per-case isolated 40-case matrix repeated at least 3 times under
  no-GC non-debug settings, each with `40/40` exact, zero bounded rows, zero
  failed subprocesses, zero timeouts, zero memory-limited rows, and bounded-gap
  total `0`.
- Every full 40-case run must generate a timestamped report and update this
  roadmap with raw path, replay parameters, accept/reject reason, and failure
  analysis if any row is bounded.

2026-06-12 00:51 CST P06 same-coarse frontier confirmation:

- Proof-ledger diagnostic raw:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T16-29-17-444Z.json`.
  Scope: `P06:323`, no GC, `debugConfigurationTrace=true`, same event-root
  and same-coarse options as the current accepted diagnostic setup plus
  `eventRootFrontierProbeAnchorCheapUpperMinRemainingMs=30000`.
- Result: bounded, score `9488172`, global upper `9650685`, gap `162513`,
  elapsed `198825ms`, peak `3198 MiB`, no timeout and no memory limit.
- Ledger finding: the global upper is the max of the same
  `PastelPalettes/cool` frontier, not a later unrelated configuration:
  - `performance`, configuration `39`: status `large-gap-event-skip-seeding`,
    active tight upper `9650684.461824788`, gap `163723.46182478778`, abort
    `candidate-fill-soft-limit`, counts `[200000,80879,50858]`, slot0 cutoff
    `2518348`, pair upper by excluded slot `[6968613,7011517,6804525]`.
  - `technique`, configuration `40`: status `same-coarse-frontier-skip-seeding`,
    active tight upper `9641833.691749828`, gap `153661.69174982794`, counts
    `[200000,79609,50185]`, slot0 cutoff `2524162`.
  - `visual`, configuration `41`: status `same-coarse-frontier-skip-seeding`,
    active tight upper `9636798.939337965`, gap `148626.9393379651`, counts
    `[200000,81424,51220]`, slot0 cutoff `2530540`.
- Rejected existing two-slot capacity variants:
  - Pareto-only raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T16-18-06-511Z.json`.
    Result: bounded, score `9488172`, upper `9935586`, gap `447414`,
    elapsed `244124ms`, peak `2848 MiB`. Pareto made `52004` capacity calls
    and `1200001` states, but local residual stayed `9641834` and the third
    event-root probe skipped on low remaining budget.
  - Bucketed-only raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T16-22-55-454Z.json`.
    Result: bounded, score `9488172`, upper `9775277`, gap `287105`,
    elapsed `295016ms`, peak `3927 MiB`. Bucketed completed `0` calls,
    aborted `10`, reached `3000002` states, and left residual source as
    `unprocessed-anchor`.
- Rejected suffix-aware best-prefix experiment and reverted local code:
  - Raw with temporary code:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T16-39-18-927Z.json`.
    Result: bounded, score `9488172`, upper `9650685`, gap `162513`,
    elapsed `265980ms`, peak `3756 MiB`. Best-prefix made `4` attempts,
    spent `21682ms`, and recorded `0` improvements.
  - No-op check with the same temporary suffix-query rewrite but
    `bestPrefixSplit=false`:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T16-44-28-124Z.json`.
    Result: same gap `162513`, but elapsed rose to `213983ms` and peak rose to
    `3901 MiB`. The full-anchor availability query rewrite is therefore not
    low-risk even when the split path is disabled.
- Decision:
  - No code from this experiment is retained.
  - Do not continue with Pareto/Bucketed pair-cap variants, suffix-aware
    best-prefix split, or full-anchor suffix availability rewrites.
  - The remaining credible route must reduce the shared
    `PastelPalettes/cool` frontier itself: either a lower-memory two-slot
    capacity certificate that beats the fast `pair-capacity` residual across
    all three parameters, or a same-coarse reusable proof artifact that avoids
    separately rebuilding the large slot0 candidate frontier for
    performance/technique/visual.

2026-06-11 22:35 CST rejected two-slot shared-power experiment:

- Hypothesis: the remaining `P06:323` event-root residual gap is dominated by
  two-slot capacity upper slack after an anchor team is fixed. The existing
  two-slot fast upper uses per-card band-power bounds independently, while the
  already implemented shared-power upper tracks a shared per-slot power bucket
  but is currently restricted to three remaining slots with no banned cards.
- Planned patch: keep default behavior unchanged, generalize the existing
  shared-power upper so it can run for two remaining slots and banned anchor
  cards, then route it through the existing internal
  `enableSharedPowerSkillUpper` option inside exact-join global pruning and
  event-root anchor cheap upper. If the model aborts by state budget it must
  fall back to the existing upper and must not affect proof semantics.
- Acceptance for this experiment: first validate static checks, then run
  `P06:323` no-GC non-debug with `enableSharedPowerSkillUpper=true` and the
  current event-root probe setup. Accept only if it reduces the residual upper
  without introducing timeout/memory regression; otherwise document and revert
  or keep diagnostic-only.
- Result, shared-power route rejected and local code reverted:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T14-38-51-450Z.json`.
  - `P06:323` stayed bounded at score `9488172`, upper `9650685`, gap
    `162513`, elapsed `231516ms`, peak `3527 MiB`, no timeout and no memory
    limit. This matches the accepted same-coarse event-before gap but is
    slower than the `199925ms` baseline and uses more memory than the
    `3182 MiB` baseline.
  - Shared-power upper was called `2` times, completed `0` times, aborted `2`
    times at `120001` states, and recorded zero best improvement. It therefore
    does not convert the remaining `pair-capacity` residual into proof benefit.
- Related suffix-cover/multicard diagnostic also rejected:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T14-44-45-593Z.json`.
  - `P06:323` stayed bounded at score `9488172`, upper `9935586`, gap
    `447414`, elapsed `296112ms`, peak `3201 MiB`, no timeout and no memory
    limit. Cheap upper ran only `2` times, hit local timebox `2` times, and the
    last residual stayed at `285981`.
- Decision: do not extend this line by raising shared-power state budget,
  suffix-cover timebox, or candidate K. The next useful direction remains a
  cheaper proof of the processed `pair-capacity` residual or a fused
  processed/suffix frontier certificate, not another independent upper pass.

2026-06-11 23:07 CST rejected generated-pair exact refinement:

- Experiment: temporarily added a default-off
  `eventRootFrontierProbeAnchorCheapUpperGeneratedPairExact` path that reused
  the existing generated-pair bitset query when the top left/right generated
  candidates overlapped. The target was to replace the overlapping
  `generated-pair` component with a true disjoint generated-pair upper while
  keeping the existing unseen and capacity-cap terms.
- Raw:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T15-07-27-598Z.json`.
- Result: rejected and local code reverted. `P06:323` regressed to bounded
  timeout, score `9488172`, upper `10076137`, gap `587965`, elapsed
  `300509ms`, peak `1942 MiB`, `timedOut=true`, `memoryLimited=false`.
- Profiling signal: cheap upper ran only `2` times and both hit local timebox.
  Pair-complement query count was `7863`, scan count was about `7.61B`, and
  high-pair record build count was `123`. The max residual moved from
  `pair-capacity` to `right-unseen`: anchor `[1976,625,1721,1785,1850]`,
  left/right generated cards both `[1999,1975,1952,1736,1719]`,
  generated-pair upper `6541307`, right-unseen upper `6669938`.
- Decision: generated/generated conflict is a real source of slack, but it is
  not the closing blocker by itself. Once that component is tightened, the
  one-sided unseen term dominates, and the exact-pair query cost starves the
  anchor sweep. Do not promote this opt-in. The next viable proof direction
  must amortize one-sided unseen proof across the same coarse frontier instead
  of running per-anchor generated-pair scans.

2026-06-11 23:45 CST rejected two-slot card-specific pair-cap probe:

- Experiment: temporarily added a default-off
  `eventRootFrontierProbeAnchorCheapUpperPairCapacityCapCardSpecific` path that
  made the event-root cheap-upper pair-cap call compute the existing fast
  two-slot card-bound upper and, only when opted in, also compute the
  two-slot card-specific coefficient upper, then use the tighter safe value.
  The intent was to test a reusable upper-model tightening, not another
  generated-pair or unseen scan.
- First run exposed a wiring mistake: the new boolean was initially passed into
  the existing `useBasicSkillAwareOnly` parameter. Raw:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T15-32-51-443Z.json`.
  This reproduced the already-rejected basic two-slot route: `P06:323` stayed
  bounded with score `9488172`, upper `9694898`, gap `206726`, elapsed
  `200480ms`, peak `3205 MiB`, no timeout and no memory limit.
- Corrected rerun raw:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T15-37-29-507Z.json`.
  Result: `P06:323` still bounded at score `9488172`, upper `9650685`, gap
  `162513`, elapsed `289509ms`, peak `3476 MiB`, no timeout and no memory
  limit.
- Profiling signal after the corrected rerun:
  - The final cheap upper was unchanged: residual upper `9636799`, residual gap
    `148627`, source `unprocessed-anchor-suffix-cover`.
  - The dominating local max stayed `pair-capacity`, anchor score `2865962`,
    pair upper `6770836.939337965`.
  - Cheap-upper elapsed rose from the accepted `44378ms` baseline to `69269ms`,
    and event-root probe elapsed rose from `186572ms` to `274954ms`.
- Decision: rejected and local code reverted. Two-slot card-specific
  coefficient cap does not tighten the relevant P06 pair-capacity certificate
  and adds substantial high-frequency pair-cap overhead. Do not retry this as a
  default or acceptance candidate. The next viable experiment still needs
  reusable proof material for the same-coarse frontier or a genuinely stronger
  low-memory two-slot capacity certificate.

Next implementation constraint:

- Do not add more per-anchor generated-pair scans, unseen-refine scans, or
  higher local timeboxes for `P06:323`. Those routes have repeatedly improved
  one local term while starving the anchor sweep or exposing a different
  one-sided unseen residual.
- The next code experiment should build reusable proof material once per
  processed frontier, then answer many anchor/generated/unseen upper queries
  from that material. Acceptable shapes include compact generated-candidate
  card-set certificates, chunked high-risk pair records with a safe fallback
  upper, or a same-coarse frontier certificate that reuses structural candidate
  material without reusing unsafe cross-parameter proof conclusions.
- Acceptance for that next experiment starts with `P06:323` only:
  same accepted no-GC non-debug options, score must remain `9488172`, local
  residual upper must improve below the current `9636799`/`9650685` band,
  `timedOut=false`, `memoryLimited=false`, and peak heap must not exceed the
  accepted baseline by more than `2%`. Only then rerun hard cases.

2026-06-10 13:00 CST correctness gate reset:

- The first two no-GC full 40-case runs both reported `40/40` exact, but their
  final scores were not stable. Examples:
  - `P06:244`: run 1 `9055411`, run 2 `9063959`.
  - `P07:244`: run 1 `8476866`, run 2 `8551590`.
  - `P08:323`: run 1 `9229933`, run 2 `9249509`.
- Direct `P06:244` repeats reproduced the issue under identical fixture input:
  two non-debug runs returned `9055411`, a later non-debug run returned
  `9063959`, and debug-trace runs returned `9066914`. All reported exact.
- `P06` has no duplicate `cardId` or duplicate `cardInstanceKey`, so this is
  not caused by temporary-card instance identity collision.
- A/B evidence points to `lowMemoryInitialCandidateSync`: with it enabled, the
  exact join can prove a configuration after generating only one candidate per
  slot (`45` total generated candidates across 15 joins). With
  `disableLowMemoryInitialCandidateSync=true`, `P06:244` returns the higher
  `9066914` score and still proves exact, but generates the full exact-join
  frontier (`376344` candidates) and takes `110600ms`.
- Action taken: `lowMemoryInitialCandidateSync` is demoted from automatic proof
  path to explicit opt-in (`enableLowMemoryInitialCandidateSync=true`). It is
  research/diagnostic-only until it has a proof-safe invariant. The active
  no-GC acceptance path must not depend on it or on `--expose-gc`.
- Previous no-GC full run 1 is reclassified as rejected for final acceptance:
  the exact count was `40/40`, but score stability failed when compared with
  the follow-up run. Do not run the third full 40-case confirmation until P06
  direct-repeat and hard-guard stability pass with the demoted low-memory path.

2026-06-10 13:57 CST low-memory demotion follow-up:

- Patch `bae28ad` changed `lowMemoryInitialCandidateSync` from automatic to
  explicit opt-in (`enableLowMemoryInitialCandidateSync=true`). Default and
  acceptance paths therefore no longer use the destructive
  `generator.next(lowMemoryScore)` proof shortcut.
- P06:244 direct-repeat after the change is score-stable at the higher known
  score:
  - `04-55-59-012Z`: exact, `9066914`, `110600ms`, peak `2144 MiB`
    (`disableLowMemoryInitialCandidateSync=true` diagnostic).
  - `05-01-32-188Z`: exact, `9066914`, `118688ms`, peak `1973 MiB`.
  - `05-03-49-474Z`: exact, `9066914`, `111512ms`, peak `2176 MiB`.
- Hard guard without automatic low-memory sync regressed to `6/8` exact:
  raw result
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-10T05-07-33-193Z.json`.
  Summary: exact `6/8`, bounded `2`, bounded-gap total `699536`, peak
  `4491 MiB`, no failed subprocesses.
- Bounded rows:
  - `P06:323`: score `9486961`, gap `607201`, abort
    `candidate-fill-soft-limit`, candidate counts `[200000,80879,50858]`,
    peak `2498 MiB`.
  - `P07:260`: score `8568618`, gap `92335`, abort `pair-upper`,
    `timedOut=true`, `memoryLimited=true`, peak `4491 MiB`.
- Interpretation: low-memory sync was not proof-safe, but it was masking real
  frontier cost. The next accepted route must replace that unsafe pruning with
  a safe proof/solve optimization; do not restore automatic low-memory sync.

2026-06-10 14:00 CST P06 event-root probe diagnostics:

- `P06:323` proof ledger with low-memory sync disabled:
  `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T05-34-40-951Z.json`.
  The single open configuration is `PastelPalettes/cool/performance`; event-root
  probe aborts at slot0 soft limit `200000`, cutoff `2518348`, peek `2616168`,
  candidate counts `[200000,80879,50858]`, gap `607201`.
- Raising only `eventRootFrontierProbeCandidateSoftLimit`:
  - `300000`: still bounded, peek `2584700`, peak `3193 MiB`.
  - `600000`: still bounded, peek `2528742`, peak `3140 MiB`.
- Diagnostic patch: event-root probe may now use existing staged candidate
  extension only when the caller explicitly sets
  `eventRootFrontierProbeCandidateSoftLimit > 600000`; the normal default path
  is unchanged.
- With staged 800k and `240s` probe timebox:
  `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T05-43-31-942Z.json`.
  The run progressed from soft-limit to `solve-timeout`, counts
  `[679552,189394,50858]`, peak `3534 MiB`, elapsed `251879ms`, still bounded.
- With staged 800k and `280s` probe timebox:
  `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T05-48-22-447Z.json`.
  Still `solve-timeout`, same counts `[679552,189394,50858]`, peak `3509 MiB`,
  elapsed `292118ms`, still bounded.
- Conclusion: wider event-root candidate prefixes are not enough; they move
  `P06:323` from candidate-fill failure to exact-join solve failure. The next
  useful target is solving/proving the large imbalanced candidate join more
  cheaply, not further raising K/timebox.

2026-06-11 20:50 CST event-probe incumbent preservation update:

- Patch under validation: same-coarse sibling reevaluation is now reused before
  `full-width-event-skip-seeding` and `large-gap-event-skip-seeding` event-root
  probes when `enableEventRootFrontierProbe=true`. This preserves the best
  already-known sibling team before an opt-in probe path can skip normal
  seeding/exact work. It does not change default behavior when the event probe
  is disabled.
- Validation raw:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T12-34-06-351Z.json`.
- Scope: `P06:323`, no `--expose-gc`, `debugConfigurationTrace=false`,
  process-per-case isolated, `300000ms`, event-root probe enabled with the
  current 200k candidate soft limit and same-coarse probe before exact join.
- Result: still bounded, score `9488172`, observed upper `9650685`, gap
  `162513`, elapsed `199925ms`, `timedOut=false`, `memoryLimited=false`, peak
  working set `3182 MiB`.
- Profiling: same-coarse sibling reevaluation ran `3` times, hit `1` time, and
  preserved a best improvement of `1211`; event-root probes ran `3` times and
  spent `186572ms`. The final probe remained `unproved` with residual gap about
  `148627`.
- Interpretation: this is a safe incumbent-preservation cleanup and improves
  the event-probe diagnostic path, but it is not enough to close `P06:323`.
  The remaining blocker is proof closure after an unproved small-gap event-root
  probe. Next experiment should be opt-in only: allow normal seeding/exact work
  to continue after an unproved event-root probe when the residual gap is below
  a configured small-gap threshold and enough time remains.

2026-06-11 21:05 CST rejected small-gap continuation experiment:

- Experiment: a local uncommitted opt-in option allowed event-root probe callers
  to continue normal seeding/exact work after an `unproved` probe when residual
  gap was below `200000`. The intent was to test whether the `~162k` residual
  gap in `P06:323` could be closed by the ordinary proof path once the event
  probe had already tightened the active upper.
- Raw result, uncapped continuation:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T12-52-33-674Z.json`.
  Result: bounded, score `9486961`, gap `595522`, elapsed `118900ms`,
  `timedOut=true`, `memoryLimited=true`, peak `4877 MiB`. The follow-up
  ordinary exact join used the `400000` auto candidate soft limit and aborted
  at `initial-candidate`.
- Raw result, continuation with follow-up exact join capped back to the
  event-root `200000` soft limit:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T12-57-02-753Z.json`.
  Result: bounded, score `9486961`, gap `595522`, elapsed `114582ms`,
  `timedOut=true`, `memoryLimited=true`, peak `4489 MiB`. The follow-up exact
  join aborted at `pair-upper`.
- Interpretation: simply continuing after a small-gap event-root probe is not
  a viable path for `P06:323`. It converts a bounded-but-controlled proof gap
  (`score 9488172`, gap `162513`, no timeout/memory, peak `3182 MiB`) into a
  lower incumbent and a memory-limited run. The local code was reverted and
  should not be promoted. The next useful direction is a proof-only upper
  tightening inside the event-root frontier itself, not falling through to the
  full ordinary exact/DFS path.

2026-06-11 21:17 CST rejected existing proof-only toggles:

- Pair-capacity pareto/bucketed diagnostic:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T13-04-37-953Z.json`.
  Added `eventRootFrontierProbeAnchorCheapUpperPairCapacityCapPareto=true` and
  `eventRootFrontierProbeAnchorCheapUpperPairCapacityCapBucketed=true` to the
  current `P06:323` event-root probe setup. Result: bounded, score `9488172`,
  gap `447414`, elapsed `255530ms`, peak `2760 MiB`, no timeout/memory limit.
  The cheap upper residual gap was `153662`, slightly worse than the baseline
  `148627`, and the higher proof cost left too little budget for the later
  event-root probe (`low-remaining-budget`). Do not enable these toggles for
  the current target.
- Targeted pair BnB diagnostic:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T13-11-23-573Z.json`.
  Added a small targeted-pair proof budget
  (`targetedPairProofTimeboxMs=5000`, `targetedPairProofMaxEntries=12`,
  `targetedPairBnbNodeLimit=100000`,
  `targetedPairBnbSlotSolveNodeLimit=100000`). Result: bounded, score
  `9488172`, gap `447414`, elapsed `204692ms`, peak `4528 MiB`, no reported
  timeout/memory-limited row. Cheap upper residual gap worsened to `207604`,
  and the final event-root status was `memory-soft-limit`. Do not promote this
  toggle set.
- Interpretation: the existing pair-capacity refinements are either too coarse
  or too expensive for the current hard case. The useful next patch needs to be
  more selective than whole-mode pareto/bucketed capacity and more deterministic
  than targeted BnB: likely a small, proof-only refinement of the high residual
  `pair-capacity` entry and the unprocessed-anchor suffix join, with strict
  time/memory accounting.

2026-06-10 14:48 CST P06 score-only frontier finding:

- New diagnostics used the unsafe low-memory active-generator advance only as a
  reproduction tool. It remains rejected for acceptance because it advances the
  active generator with `next(score)` and can falsely close frontier proof.
- The unsafe reproduction exported the high-scoring `P06:323` team:
  `PastelPalettes/cool/technique`, score `9488172`, card groups by song:
  `[1720,2189,1724,415,1753]`,
  `[1719,1721,1785,1736,1952]`,
  `[1850,1999,1975,1976,625]`.
- Safe known-card diagnostics show:
  - At `200000` event-root candidate limit: target slot1/slot2 candidates are
    present, target slot0 is missing.
  - At `600000`: target slot0 is still missing; slot0 peek is only `2528742`
    versus cutoff `2518348`.
  - At staged `800000`: all three target candidates are present, with slot
    score-only values `[2519132, 3123534, 3844295]`.
- The score-only sum of the exported target is exactly `9486961`, equal to the
  current safe incumbent, while the hydrated full medley result is `9488172`.
  This proves the active blocker is not just seed quality or candidate K: the
  exact-join solve/proof path can order and prune by score-only values that
  understate the final medley score after full song evaluation.
- A first exact-safe slack patch changed solve pruning from
  `scoreOnlySum < cutoff` to `scoreOnlySum + slotMaxScoreSlackUpper < cutoff`,
  but `P06:323` staged `800000/280s` still timed out without finding the high
  team. This means the next patch must also change solve ordering/enumeration,
  not only scalar pruning thresholds.
- Current promising general direction:
  - Treat score-only slot candidate score as a lower ordering signal, not as
    the sole proof upper.
  - Use `maxScore`/hydrated-score slack in candidate ordering and generated
    triple solve, especially for near-cutoff candidates.
  - Add an exact generated-candidate solve path that anchors on the slot with
    the narrowest frontier and queries/scans pair candidates by safe full-score
    upper, so lower score-only candidates that can hydrate above incumbent are
    evaluated before timeout.
  - Only after generated-candidate solve is full-score-safe should event-root
    staged `800000` be considered for a guarded default path.
- Current code experiments in this branch are diagnostic and not accepted yet:
  isolated low-memory seed generation, explicit unsafe reproduction flag,
  known-card presence diagnostics, smallest-third join ordering, and the
  score-only slack pruning patch. The acceptance gate remains unchanged:
  no-GC, non-debug, stable `40/40` exact with stable final scores.

2026-06-11 16:02 CST P06 third-candidate solve diagnostics:

- Current accepted base path still excludes `--expose-gc`, keeps
  `debugConfigurationTrace=false`, and uses ordinary Node with
  `--max-old-space-size=8192`.
- Current `P06:323` 200k event-root raw:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T07-02-13-407Z.json`.
  Result: bounded, elapsed `37929ms`, score `9488172`, gap `605990`,
  `timedOut=false`, `memoryLimited=false`, peak `1970 MiB`. The blocker is
  candidate fill on `PastelPalettes/cool/performance`; slot0 reaches soft limit
  `200000`, cutoff `2518348`, peek `2616168`, counts `[200000,80879,50858]`.
- Current `P03:260` confirmation raw:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T07-03-11-779Z.json`.
  Result: exact, elapsed `157761ms`, gap `0`, peak `3690 MiB`.
- Debug ledger after the proof-ledger array fix:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T07-12-56-341Z.json`.
  The ledger confirms the same `P06:323` bounded row and shows pair upper
  `[6968613,7011517,6804525]`; the 200k path never enters exact-join solve.
- Current branch 800k staged event-root, default solve order:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T07-23-05-034Z.json`.
  Result: bounded, elapsed `300001ms`, `timedOut=true`, peak `3021 MiB`,
  score `9486961`, gap `595522`. It moves to solve timeout, with candidate fill
  `70754ms`, solve `202965ms`, pair count `3125248`, third fallback word scan
  `549391399`, extended-third queries `200000`, extended hits `0`.
- Forced `largest-middle-smallest` solve order:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T07-29-57-675Z.json`.
  Result still bounded at `300001ms`, but third fallback word scan drops to
  `140557548`; pair count rises to `4390912`. This suggests solve order changes
  can reduce scan depth but do not close proof alone.
- Larger extended third shortlist, array-backed, `size=8192`,
  `queryLimit=1000000`, `cacheEntryLimit=4096`:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T07-36-00-150Z.json`.
  Result still bounded, peak `3062 MiB`. Pair count drops to `303104` and
  fallback word scan to `1899837`, but solve time remains about `203s`,
  indicating uncached shortlist construction/checking becomes the new cost.
- Same array-backed shortlist with `cacheEntryLimit=20000`:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T07-42-00-635Z.json`.
  Result still bounded, peak rises to `3542 MiB`; solve time does not improve.
- Patch in progress: extended third shortlist can now use a bitset-backed
  representation when `thirdCandidateBitsetWordCount <= extendedThirdShortlistSize`.
  This keeps exact semantics and only changes how the same shortlist is stored
  and queried.
- Bitset-backed `size=8192`, `queryLimit=1000000`, `cacheEntryLimit=20000`:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T07-50-11-165Z.json`.
  Result still bounded, peak `3125 MiB`; compared with the array-backed 20k
  cache run, peak drops by about `417 MiB`, pair count rises from `479232` to
  `2813952`, but the `1000000` extended query limit is exhausted.
- Bitset-backed `size=8192`, `queryLimit=10000000`, `cacheEntryLimit=50000`:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T07-56-04-041Z.json`.
  Result still bounded, elapsed `301427ms`, peak `3326 MiB`, third fallback
  word scan `1918296`, extended queries `1846595`, extended hits `159242`,
  exhaustive misses `1196626`. It no longer exhausts the extended query limit,
  but still hits the event-root probe timebox.
- Interpretation: bitset-backed extended shortlist is a real storage/query
  improvement and is safer on memory than large arrays, but it is not sufficient
  to close `P06:323` within the current `300s` gate. The remaining issue is
  broader proof conversion inside the large imbalanced candidate join, not seed
  quality and not just third-candidate fallback word scanning.
- Next decision point: run a longer single-case diagnostic only to determine
  whether this path eventually proves exact, then either derive a bounded
  scheduling/proof patch from the finished solve profile or stop the 800k
  solve route and return to tighter event-root upper closure.

2026-06-10 11:33 CST first no-GC validation:

- Raw result:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-10T03-31-45-295Z.json`.
- Case: `P03:260`, process-per-case isolated, no `--expose-gc`,
  `debugConfigurationTrace=false`, no GC probe.
- Optimization: `memorySoftLimitMiB=4488`, `exactNodeSoftLimit=5000000`,
  `skipConfigurationSeedingWhenMemoryHeadroomBelowMiB=1600`,
  low-memory initial candidate sync local abort/light upper/timebox settings,
  and event-root frontier probe enabled.
- Result: exact, elapsed `82082ms`, bounded gap `0`, `timedOut=false`,
  `memoryLimited=false`, peak working set `3050 MiB`.
- Interpretation: the active-configuration heap-only cap hypothesis converted
  the known P03 no-GC failure shape without requiring forced GC. This is not
  yet accepted; repeat P03 and hard-guard validation are still required.

2026-06-10 11:42 CST P03 repeat gate:

- Scope: `P03:260`, no `--expose-gc`, `debugConfigurationTrace=false`, no GC
  probe, same optimization as above.
- Runs:
  - `2026-06-10T03-31-45-295Z`: exact, `82082ms`, peak `3050 MiB`.
  - `2026-06-10T03-34-21-636Z`: exact, `77337ms`, peak `3072 MiB`.
  - `2026-06-10T03-35-43-500Z`: exact, `84065ms`, peak `3075 MiB`.
  - `2026-06-10T03-37-12-780Z`: exact, `114805ms`, peak `3491 MiB`.
  - `2026-06-10T03-39-13-363Z`: exact, `74321ms`, peak `3062 MiB`.
- Gate result: passed `5/5` exact, no bounded gap, no timeout, no
  memory-limited row. Proceed to hard guard set.

2026-06-10 11:54 CST hard guard gate:

- Scope: `P03:260`, `P06:323`, `P07:260`, `P08:323`, `P10:244`,
  `P10:260`, `P07:244`, and `P08:244`, no `--expose-gc`,
  `debugConfigurationTrace=false`, no GC probe.
- Round 1 raw result:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-10T03-41-13-719Z.json`.
  Result: `8/8` exact, bounded-gap total `0`, no timeout, no memory-limited
  row, peak `3220 MiB`, max elapsed `71750ms`.
- Round 2 raw result:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-10T03-46-59-014Z.json`.
  Result: `8/8` exact, bounded-gap total `0`, no timeout, no memory-limited
  row, peak `4095 MiB`, max elapsed `88053ms`.
- Gate result: passed. Proceed to full 40-case no-GC confirmation runs.

2026-06-10 12:18 CST full 40-case no-GC confirmation run 1:

- Raw result:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-10T03-53-54-972Z.json`.
- Report:
  `documents/bandori-team-builder/medley-40-exact-report-2026-06-10-115354-nogc-r1.md`.
- Result: `40/40` exact, bounded-gap total `0`, no failed subprocess, no
  timeout, no memory-limited row.
- Timing: median `27148ms`, p95 `54564ms`, max `140346ms`.
- Peak working set: `3520 MiB`.
- Gate result: rejected after follow-up score-stability comparison. It remains
  useful as a timing/memory sample, but it does not count toward final no-GC
  acceptance.

Goal tool note:

- The active Codex goal object was created earlier in this thread and cannot be
  edited in place except to mark it complete or blocked. Treat this section as
  the authoritative detailed goal contract for the current execution phase.
- The execution target for the active goal is still the full stable `40/40`
  exact milestone. The 2026-06-10 no-GC runs reached the count target, but are
  not accepted until score stability and false-exact safety are restored.

Current execution contract:

- Objective: restore a stable no-GC `40/40` exact checkpoint after the
  false-exact finding.
- Current blocker: `lowMemoryInitialCandidateSync` can let exact candidate join
  report proof from one-candidate slot frontiers when the incumbent is not yet
  the true best result.
- Current working direction: keep low-memory initial candidate sync opt-in only,
  re-run P06 direct repeats, then hard guard, then full 40-case confirmation.
- Still rejected for this phase: seed quality work, greedy/prefix seed, wider
  top-K/candidate limits, larger default memory gates, and any patch that only
  shifts the memory wall to another hard case.

Current pinned acceptance baseline:

- Raw result:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T17-06-33-445Z.json`.
- Report:
  `documents/bandori-team-builder/medley-40-exact-report-2026-06-10-014527.md`.
- Branch/commit at acceptance: `dev/medley-39-exact-frontier` / `3335d69`.
- Result: `40/40` exact, bounded-gap total `0`, peak working set
  `3272 MiB`, no bounded rows.

Core plan:

- Keep seed, greedy, prefix-seed, broad candidate-limit increases, and broad
  memory-compaction paths frozen unless a future change first proves no
  regression against the `40/40` checkpoint.
- Preserve the `1600` seeding-headroom path that converted `P03:260`.
- Prefer proof-cost reduction and non-debug confirmation over new proof
  strategy experiments.
- Preserve all hard guard cases; any change that regresses a current exact row
  is rejected.

Important workflow:

- Work only in the independent worktree/branch
  `dev/medley-39-exact-frontier`; keep `D:\Workspace\hhwx` on clean `main`.
- Before algorithm edits, record the hypothesis and acceptance gate in this
  file. After benchmark runs, record the raw result path and accept/reject
  reason here before starting another long run.
- Commit and push after stable static validation or durable benchmark evidence,
  so current work is not lost in an unstable local environment.
- Run targeted single-case diagnostics first, then the hard guard set. Run the
  full isolated 40-case matrix only after the guard set passes.
- After every completed full 40-case run, generate a timestamped report with
  timing, memory, exact/bounded status, bounded reasons, failure analysis,
  replay parameters, and next recommendations.

Acceptance gates:

- Stage gate: never regress below the pinned `40/40` exact checkpoint.
- Final gate: full isolated matrix reaches `40/40` exact.
- Bounded-gap total must remain `0`.
- No currently exact hard guard case may become bounded. Guard set:
  `P03:260`, `P06:323`, `P07:260`, `P08:323`, `P10:244`, `P10:260`,
  `P07:244`, and `P08:244`.
- Peak working set must stay within the active memory gate, with no process
  OOM or failed subprocess.
- Static validation for a promotable patch: `npm.cmd run typecheck`,
  `npm.cmd run lint` when practical before PR, `npm.cmd run build` with safe
  placeholder env when practical before PR, and `git diff --check`.
- Benchmark evidence must use the fixed P01-P10 fixture and process-per-case
  isolation; same-process full-matrix runs are diagnostic-only.

Out of scope for the primary target:

- `P11` / `7627fd2f-8a29-4462-99ee-7085789d7561`.
- The 2112-card full-pool stress profile remains useful as a separate memory
  and scalability sample, but it must not be mixed into the default 40-case
  acceptance target.

## Current Status

Known retained historical baselines:

- 2026-06-02 full matrix: `36/40` exact, `4` bounded, `0` timeouts, bounded-gap
  total `1534986`, P95 `231981ms`, max `295714ms`.
- 2026-06-05 post-recovery focus/full evidence: `38/40` exact, bounded-gap total
  `582812`, max elapsed `262539ms`, P95 `208250ms`, peak working set about
  `3821.7 MiB`. The remaining bounded rows were `P02:260` and `P10:244`.

Current clean pinned 2026-06-08 baseline:

- Report:
  `documents/bandori-team-builder/medley-40-exact-report-2026-06-08-204728.md`
- Raw result:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-08T11-42-34-917Z.json`
- Fixture:
  `temp/bandori-team-builder/real-profile-medley-p01-p10-40exact-fixture.json`
- Runner: process-per-case isolated baseline, all-scope only, default maximize
  optimization, `debugConfigurationTrace=false`.
- Result: `35/40` exact, `5` bounded, `0` failed subprocesses, no stderr, no
  process OOM.
- Bounded-gap total: `1819282`.
- Elapsed median/P95/max: `61192ms` / `194283ms` / `276080ms`.
- Peak sampled heap: `4488 MiB`.
- Bounded rows:
  - `P03:260`: gap `370472`, `candidate-fill-generator-aborted`, peak `4205 MiB`.
  - `P06:323`: gap `607201`, `initial-candidate`, peak `4488 MiB`.
  - `P07:244`: gap `55265`, `candidate-fill-pair-refine`, peak `4210 MiB`.
  - `P07:260`: gap `296599`, `memory-soft-limit`, peak `4206 MiB`.
  - `P08:244`: gap `489745`, `candidate-fill-generator-aborted`, peak `4207 MiB`.

Current 2026-06-09 checkpoint:

- Report:
  `documents/bandori-team-builder/medley-40-exact-report-2026-06-09-001029.md`
- Raw result:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T00-10-29-221Z.json`
- Branch/commit: `dev/medley-greedy-seed-acceptance` / `edf3879`.
- Result: `37/40` exact, `3` bounded, `0` failed subprocesses, no process OOM.
- Bounded-gap total: `1274272`.
- Elapsed median/P95/max: `18406ms` / `37598ms` / `39932ms`.
- Peak sampled heap: `4203 MiB`.
- Converted from the clean pinned baseline: `P07:244` and `P08:244`.
- Remaining bounded rows:
  - `P03:260`: gap `370472`, controlled root slot-boundary event skip,
    peak `1979 MiB`, no timeout and no memory limit.
  - `P06:323`: gap `607201`, controlled large-gap event skip, peak
    `1273 MiB`, no timeout and no memory limit.
  - `P07:260`: gap `296599`, `candidate-fill-generator-aborted`, peak
    `4203 MiB`, `memoryLimited=true`.

The `37/40` checkpoint is retained as historical evidence. It is superseded by
the `38/40` checkpoint below; compare new patches against the newer checkpoint
unless specifically investigating the `P07:260` conversion.

Current pinned 2026-06-09 `38/40` checkpoint:

- Report:
  `documents/bandori-team-builder/medley-40-exact-report-2026-06-09-111704.md`
- Raw result:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T03-17-04-125Z.json`
- Rejected same-process report:
  `documents/bandori-team-builder/medley-40-exact-report-2026-06-09-104805-rejected.md`
- Branch/commit: `dev/medley-greedy-seed-acceptance` / `6d72c48`.
- Runner: process-per-case isolated runner, `--expose-gc`, all-scope only.
- Optimization: `memorySoftLimitMiB=4488`, `exactNodeSoftLimit=5000000`,
  `skipConfigurationSeedingWhenMemoryHeadroomBelowMiB=400`,
  `lowMemoryInitialCandidateSyncMaxSameCoarseProofElapsedMs=60000`,
  `lowMemoryInitialCandidateSyncMinMemoryHeadroomMiB=0`,
  `lowMemoryInitialCandidateSyncLocalAbortOnly=true`,
  `lowMemoryInitialCandidateSyncLightUpper=true`,
  `lowMemoryInitialCandidateSyncTimeboxMs=60000`,
  `enableLowMemoryInitialCandidateSyncGcProbe=true`, and
  `debugConfigurationTrace=true`.
- Result: `38/40` exact, `2` bounded, `0` failed subprocesses, no process OOM.
- Bounded-gap total: `977673`.
- Elapsed median/P95/max: `40626ms` / `67744ms` / `198562ms`.
- Peak sampled heap: `4169 MiB`.
- Converted from the `37/40` checkpoint: `P07:260`.
- Remaining bounded rows:
  - `P03:260`: gap `370472`, `full-width-event-skip-seeding`, first
    unclosed configuration `RaiseASuilen/happy/performance`, effective upper
    `9584318`, no timeout and no memory limit.
  - `P06:323`: gap `607201`, `large-gap-event-skip-seeding`, first unclosed
    configuration `PastelPalettes/cool/performance`, effective upper
    `10094162`, no timeout and no memory limit.

The historical `38/40` stage target is achieved and superseded by the current
`39/40` checkpoint. The only remaining exact blocker is `P03:260`.

2026-06-08 checkpoint toward the `38/40` stage:

- Stage target was raised to `38/40` exact, with the explicit anti-regression
  gate that at least three of the current five bounded rows must convert, the
  current 35 exact rows must not regress, bounded-gap total must stay at or
  below `1819282`, and peak memory must stay within the clean baseline plus
  2%.
- A simple dynamic candidate-fill slot order was rejected. It moved work across
  slots but did not improve exact count, and `P03:260` peak memory rose above
  the allowed gate.
- A high-pair cache compaction that stopped retaining full pair record objects
  was rejected. `P07:244` stayed exact only under high-memory diagnostic limits,
  and peak memory did not decrease.
- Score-only candidate key compaction was rejected. It briefly converted
  `P08:244`, but it regressed the guardrail `P08:323` from exact to bounded and
  pushed the 9-case peak memory to `5549 MiB`.
- Large-pool conflict-BnB fallback was rejected as a default candidate. With
  exact-join disabled, `P07:244` still timed out at 300s; with exact-join
  enabled, it changed the memory trajectory without closing proof.
- A high-memory diagnostic remains useful: `P07:244` can prove exact around
  `5609 MiB` peak, so the proof path is logically capable of closing; the
  remaining problem is reducing candidate/frontier residency by roughly 1 GiB
  without changing tie order or proof semantics.
- A lightweight score-only result object experiment was rejected. It lowered
  retained result payloads, but `P07:244` stayed bounded and the high-memory
  diagnostic degraded to gap `300781`, aborting at `candidate-fill-soft-limit`
  instead of proving exact.
- Explicitly clearing the score-only WeakMap cache at configuration release was
  also rejected. It reduced `P07:244` peak heap from roughly `4210 MiB` to
  `3544 MiB`, but worsened the bounded gap from `55265` to `300781` and changed
  the failure shape to `candidate-fill-soft-limit`. This is diagnostic evidence
  that memory reduction alone can remove useful frontier work; acceptable
  patches must preserve or replace the proof strength that the retained cache
  currently enables.
- The existing opt-in staged/guarded candidate extension was rechecked on
  `P07:244`. Guarded extension did trigger from `400000` to `600000`
  candidates with about `180052ms` remaining, but the case still ended bounded,
  gap `395539`, peak `4201 MiB`, and `memoryLimited=true`; staged extension did
  not trigger. Do not loosen extension thresholds as the next default strategy.
- Opt-in low-memory high-pair direct scan was added as a research path and
  tested on `P07:244`. It confirmed the memory hypothesis, dropping peak heap
  to about `2038-2095 MiB`, but it timed out at `300s`, completed no
  configurations, and ended with gap `505642`. The direct scan is not an
  acceptance candidate; it is evidence that the next memory-safe proof path
  needs a bounded prefix/high-pair upper cache or chunked proof, not pure
  per-query scanning.
- Opt-in bounded high-pair prefix upper was also tested on `P07:244` with the
  default `500000` retained-record limit. It was faster than pure scan
  (`115272ms`) but still bounded, gap `395539`, `memoryLimited=true`, peak
  `4220 MiB`, and only `3/4` configurations completed. This means high-pair
  record materialization is not the only live memory source in this case; do
  not promote the prefix implementation without a broader memory-source audit.

Rejected/diagnostic 2026-06-08 evidence:

- Full-matrix single-process runs, including proof-ledger variants, are not
  acceptance evidence. They carried heap pressure across cases; after
  `P03:260`, later rows became invalid empty/timed-out results.
- Full proof ledger should be collected only on bounded cases in isolated
  processes, or after memory-safe trace sampling exists.
- The same-process 2026-06-09 run with the `P07:260` conversion options is
  explicitly rejected:
  `documents/bandori-team-builder/medley-40-exact-report-2026-06-09-104805-rejected.md`.
  It used the correct `P01`-`P10` fixture, but heap carryover pushed later rows
  into immediate memory-limited bounded states. Do not treat its `24/40` exact
  result as algorithm-quality evidence.

Current acceptance standard:

- Current pinned checkpoint: `40/40` exact.
- Final target and next stage pass: achieved.
- Bounded-gap total must remain `0` against the latest clean pinned-fixture
  baseline.
- New patches must not regress below the pinned `40/40` checkpoint.
- Failed runs and OOM are always failures.
- Peak working set must not exceed the latest clean pinned-fixture baseline by
  more than the active memory gate.

2026-06-09 diagnostic checkpoint:

- The branch checkpoint `ee8546a` added opt-in exact-join memory attribution,
  and `f292989` narrowed it to terminal-only snapshots after the first
  attribution run proved intrusive.
- Do not use `debugExactCandidateJoinMemoryAttribution=true` as proof-quality
  evidence yet. On `P07:244`, the clean current-branch baseline reproduced the
  pinned shape: `bounded`, elapsed `149709ms`, gap `55265`, peak `4210 MiB`,
  `candidate-fill-pair-refine`, `16/17` exact-join configurations completed,
  and pair count `8778953`.
- The same case with attribution enabled changed the frontier to an earlier
  bounded result even after terminal-only sampling: elapsed `128282ms`, gap
  `395539`, peak `4202 MiB`, `memory-soft-limit`, `3/4` exact-join
  configurations completed, and pair count `3776496`. Because the only snapshot
  was recorded after the abort, the likely issue is hard-case sensitivity to the
  debug option/input shape or runtime memory sampling, not the snapshot payload
  itself.
- Until attribution has its own no-op equivalence gate, rely on clean isolated
  baseline fields for acceptance analysis. If memory-source instrumentation is
  needed again, first prove `P07:244` equivalence against the no-debug baseline
  on status, score, gap, completed configurations, abort reason, and pair count.
- A local exact-join working-set release patch was tested and reverted. It
  cleared per-configuration generator heaps/caches and candidate key sets after
  each exact-join configuration. On `P07:244` it lowered peak heap only
  modestly (`4210 -> 4146 MiB`) but worsened the proof frontier from gap
  `55265` to `300781`, changed the abort reason to `candidate-fill-soft-limit`,
  and reduced completed exact-join configurations from `16/17` to `3/4`.
  Treat local release/clear-only patches as rejected unless they also preserve
  the same proof-trigger behavior.
- A lossless compact candidate-key patch was also tested and reverted. It
  reduced `P07:244` peak heap more strongly (`4210 -> 3308 MiB`), but produced
  the same controller failure shape: gap `300781`, `candidate-fill-soft-limit`,
  `3/4` completed exact-join configurations, and `85` root-pruned
  configurations. This proves the next blocker is not only representation
  memory; lowering memory can flip the controller into a worse low-incumbent /
  high-root-prune route.
- Two existing controller-disable switches were checked on `P07:244` and are
  not default candidates. `disableSkipDfsAfterUnprovedExactCandidateJoin=true`
  preserved the best score but widened the gap from `55265` to `307404`, raised
  peak memory from `4210` to `4552 MiB`, and changed the route to the known
  bad `candidate-fill-soft-limit` / `3/4` completion shape.
  `disableSameCoarseTightRootSkip=true` narrowly improved the gap
  (`55265 -> 52777`) and completed `17/18` exact-join configurations, but it
  increased elapsed time from about `144s` to `239s` and still remained
  bounded. This suggests the same-coarse tight-root skip is not the root cause;
  the reusable direction is a cheaper frontier-proof refinement, not broad
  skip removal.
- The opt-in `enableExactJoinSlotProofCutoff` path was implemented for
  diagnosis in `b05b32f`, then instrumented in `24ee519`. The first hard-case
  check on `P06:323` did not improve proof status: clean baseline was
  `bounded`, elapsed `41878ms`, gap `607201`, peak `4488 MiB`,
  `initial-candidate`; slot-proof-cutoff was still `bounded`, elapsed
  `51785ms`, gap `607201`, peak `4485 MiB`, `initial-candidate`. The computed
  per-slot minimum score cutoffs were only `[1332603, 1747729, 1978233]`,
  while the aborting slot-0 frontier peek upper stayed
  `3383411.5265578935`. This cutoff is too loose to reduce the initial
  candidate frontier, so do not continue this route by tuning the same cutoff
  formula or promoting it as a default.
- `exactNodeSoftLimit=1800000` was checked on `P06:323` and did not change the
  outcome: still `bounded`, gap `607201`, peak `4515 MiB`, and abort
  `initial-candidate`. The initial slot `next()` took only about `0.38ms`,
  showing that the immediate blocker was the memory guard, not the 900k node
  soft limit.
- Raising `memorySoftLimitMiB` on `P06:323` was diagnostic only, not an
  acceptance route. At `4560 MiB`, the case progressed past initial candidates
  but still stayed bounded at gap `607201`, peak `4564 MiB`, abort
  `candidate-fill-generator-aborted`, with candidate counts
  `[2251, 80879, 50858]`. At `6000 MiB`, it still stayed bounded at the same
  score/gap, peak `6010 MiB`, abort `candidate-fill-generator-aborted`, with
  candidate counts `[262522, 80879, 50858]`. This proves `P06:323` needs a
  lower-residency proof/generator strategy, not a simple memory or node limit
  increase.
- The opt-in `enableExactCandidateAnchorJoinBeforeHighBudgetPairUpper` path was
  added in `d4d828e` and rejected by first diagnostics. On `P06:323` with
  `memorySoftLimitMiB=4560`, it still failed before useful anchor proof work,
  aborting in `pair-upper`. On `P07:244` with default memory, it regressed the
  route badly: elapsed `248341ms`, score `8476866`, gap `520997`, peak
  `4201 MiB`, only `0/1` configurations completed, and abort
  `anchored-join-timeout`. Do not promote pre-high-budget anchored join as a
  default path.

## Evidence Hygiene Rules

Do not use rolling `last-*` files as acceptance evidence. They are convenient
checkpoints and can be overwritten by smoke runs.

Every acceptance run must record:

- fixture path;
- profile labels, source IDs, card counts, and payload hashes;
- event list;
- song IDs;
- duration;
- optimizer variant;
- git branch and commit;
- exact count, bounded count, bounded-gap total, elapsed percentiles, max
  elapsed, and peak working set;
- per-bounded-case proof information. Prefer
  `proofLedgerSummary.topUnclosedByGap` when collected safely; otherwise record
  the flattened exact-join abort reason, candidate counts/cutoffs, pair upper
  counters, phase elapsed, and memory fields from the clean isolated result.

Every completed 40-case run must also generate a timestamped human-readable
report. Raw JSON is not enough. The report must include:

- run timestamp, branch/commit, fixture path, song IDs, event list, duration,
  and optimizer variant;
- per-case exact/bounded status, elapsed time, wall elapsed time if available,
  peak working set / memory sample, score, observed upper bound, and bounded
  gap;
- aggregate exact count, bounded count, bounded-gap total, elapsed median/P95,
  max elapsed, peak working set, failed count, and OOM count;
- bounded-case reason analysis, including proof ledger top unclosed entries
  when safely collected, exact-join abort reason, candidate counts/cutoffs,
  pair upper information, and phase elapsed/memory where available;
- failure analysis that separates score quality, proof frontier closure,
  timeout, memory pressure, and runner/sample hygiene issues;
- concrete improvement recommendations, ordered by expected proof impact and
  risk;
- a clear statement of whether the run is an acceptance baseline, diagnostic
  variant, or rejected experiment.

This report is a sequencing requirement: after any full 40-case run finishes,
write the timestamped report and update this roadmap before starting the next
exploration run, optimization patch, or benchmark round.

The report must include the analysis parameters needed for replay and causal
review:

- runtime environment: OS, Node.js version, process architecture, available
  memory if known, and whether the run used placeholder or real Supabase env;
- command line and environment variables used by the runner, including fixture
  path, run ID, case filters, variant filters, repeat count, and duration;
- optimizer options JSON, including proof/debug flags, exact candidate join
  options, no-op/prefix flags, warmup flags, candidate limits, timeboxes, memory
  soft limits, and any experimental toggles;
- scoring input parameters: objective, server/region, event ID or `none`,
  event bonus data version/source, temporary-card handling state, song IDs,
  difficulties, chart note counts, perfect-rate/combo assumptions, and medley
  combo carry-over settings;
- fixture metadata: profile label, source profile ID, profile kind, card count,
  payload SHA-256, payload size, storage codec, and generation seed/source;
- per-case search-shape counters: raw/pruned area-item configuration counts,
  started/completed/root-pruned configurations, exact-join call/completion/abort
  counts, DFS timeout state, and remembered frontier counts where available;
- proof-frontier parameters and counters: root/effective upper bounds, active
  observed upper source, exact-join abort reason/slot, candidate counts/cutoffs,
  pair upper/unseen upper, pair/candidate-fill/solve elapsed, and proof ledger
  top unclosed entries;
- memory diagnostics: peak working set, sampled heap/working-set fields,
  memory-limit flags, memory-heavy phase entries, and OOM/error text if any;
- comparison context: previous baseline report path, expected bounded rows,
  exact-count/gap/memory deltas, and whether results are comparable or
  diagnostic-only because sample, variant, or runner inputs changed.

Recommended report path:

```text
documents/bandori-team-builder/medley-40-exact-report-YYYY-MM-DD-HHMMSS.md
```

Recommended fixed fixture path for the primary goal:

```text
temp/bandori-team-builder/real-profile-medley-p01-p10-40exact-fixture.json
```

Recommended fixed baseline output prefix:

```text
temp/bandori-team-builder/medley-40-exact-baseline-YYYY-MM-DD-*.json
```

The benchmark runner should be invoked with an explicit fixture path and output
run ID. If the runner cannot pin fixture and run ID explicitly, fix the runner
before running long benchmarks.

## Frozen Routes

These routes are diagnostic or research-only for now:

- `enablePreProofSeedWarmup`
- `enableExactJoinPrefixSeed`
- `enableExactCandidateAnchorJoinBeforeHighBudgetPairUpper`
- larger seed timeboxes
- larger top-K / candidate limits as a default strategy
- fixed-card repair and neighborhood repair as proof strategy
- greedy comparison paths as proof evidence

Reason: the latest guarded prefix-seed hard-case gate regressed proof status.
Baseline was `2/4` exact with gap `582102`; guarded prefix seed was `1/4` exact
with gap `1005031`. No seed-only solve actually ran in that failed path
(`exactJoinPrefixSeedCallCount=0`), so the next work must prove no-op
equivalence before any new proof patch.

## Active Diagnostic Assets

Keep these assets and update this section when they change:

- Proof ledger: enabled by `optimization.debugConfigurationTrace=true`.
- Proof ledger output fields: `profiling.proofLedger` and
  `profiling.proofLedgerSummary`.
- No-op variants:
  - `prefixForceNoop`
  - `prefixGuardOnly`
  - `currentGuardedPrefix`
- Latest shape smoke:
  - `temp/bandori-team-builder/medley-prefix-seed-acceptance-2026-06-08-prefix-noop-smoke.json`
  - `prefixForceNoopEquivalent=true`
  - `prefixGuardOnlyEquivalentWhenNoCall=true`
  - `currentGuardedNoCallEquivalent=true`

The 10s smoke only validates runner shape. It is not proof-quality evidence.

## Optimization Path

Phase 0: restore the clean target baseline. Completed for the current worktree
by the 2026-06-08 isolated baseline.

- Rebuild or recover the fixed `P01`-`P10` fixture.
- Confirm each label maps to the intended profile ID, card count, and payload
  hash.
- Run the 40-case baseline with process-per-case isolation.
- Update this file with the exact bounded rows and their exact-join diagnostics.

Phase 1: memory-capped exact-join proof patch.

- Primary target: convert `P07:244`. It has the smallest bounded gap
  (`55265`, `0.65%`) and fails in `candidate-fill-pair-refine` after 16
  completed configurations and 8.78M pair records.
- Secondary targets: `P03:260` and `P08:244`, both
  `candidate-fill-generator-aborted`, and `P06:323`, which fails before
  candidate fill at `initial-candidate`.
- Required patch shape: chunked or streamed proof/upper-bound work that reduces
  pair/candidate materialization memory; do not increase default candidate
  limits and do not add seed stages.
- Guardrail exact cases: `P08:260`, `P10:260`, `P08:323`, and `P10:244` must
  remain exact.
- Avoid cache-only or result-only memory reductions as default paths. The
  rejected 2026-06-08 experiments showed lower heap but worse proof closure.
  The preferred implementation shape is an exact-join internal compact or
  streamed representation that keeps deterministic candidate order and upper
  proof semantics while reducing duplicate object/string/record residency.
- Avoid release/clear-only local working-set patches as well. The 2026-06-09
  release experiment showed that reducing memory after a configuration closes
  can still change later memory/proof gates and produce a worse frontier.
- Avoid memory compaction patches without a controller gate. The 2026-06-09
  lossless compact-key experiment reduced memory substantially but still
  worsened proof because controller behavior changed.
- Avoid simply relaxing guarded/staged candidate extension thresholds. The
  diagnostic `P07:244` run showed that generating more candidates can increase
  memory pressure and widen the final bounded gap if pair/frontier proof remains
  unclosed.
- Avoid seed-first all-scope proof ordering as a default route. The direct
  restored-cache diagnostic worsened `P07:244` bounded gap from `55265` to
  `307404` by moving into a worse memory-limited frontier.
- Avoid reducing the exact candidate soft limit to escape memory pressure. The
  direct 20k run confirmed a large memory reduction but a much weaker upper
  and incumbent.
- Keep `enableLowMemoryHighPairScan` research-only. It is useful as a
  memory-pressure diagnostic, but not fast enough to improve exact count. A
  viable follow-up must answer repeated pair-complement queries from a bounded
  memory structure instead of recomputing them from scratch.
- Keep `enableLowMemoryHighPairPrefixUpper` research-only as well. The first
  bounded-prefix implementation did not reduce `P07:244` peak memory enough,
  so the next patch should instrument candidate arrays, generator heaps,
  score-only caches, pair query caches, and solve bitsets separately before
  adding more high-pair variants.
- Keep `enableExactJoinSlotProofCutoff` research-only. On `P06:323`, the
  safe per-slot proof cutoff was far below the high-score frontier that causes
  the `initial-candidate` abort, so it gives neither proof conversion nor a
  useful memory win.
- Keep pre-high-budget anchored join research-only. Its first `P07:244`
  diagnostic consumed the proof budget before the normal multi-configuration
  route could improve the incumbent, causing a much worse bounded gap.

2026-06-09 cache-state checkpoint:

- A temporary `bestdori-cache` replacement with an older origin-main cache
  produced an invalid bad `P07:244` route: `bounded`, gap about `300781`, score
  `8476866`, abort `candidate-fill-soft-limit`, roughly `3/4` exact-join
  configurations completed, and `rootPrunedConfigurations` around `85`.
- That bad route is not sample contamination. The fixture row still matched the
  pinned baseline: profile id `61fde1e7-9201-4dd8-83ae-9cb332a0a3e5`, card count
  `1252`, payload hash
  `759eddb4f283ca2e5b5756c0c2af57c47fe3f698876088b63c6392a7b6e9f84d`.
- The cache replacement was the relevant environment drift. After restoring
  `temp/bandori-team-builder/bestdori-cache-backup-20260609-0209-current` to
  `bestdori-cache`, current HEAD default `P07:244` again reproduced the pinned
  clean route: `bounded`, gap `55265`, elapsed `136089ms`, peak `4209 MiB`,
  `memoryLimited=true`.
- Treat any diagnostic run made while `bestdori-cache-oldcache-used-*` was the
  active cache as invalid for acceptance or proof-quality comparison. Future
  benchmark reports must record the active cache source/checkpoint alongside
  fixture hash, profile hash, event key, optimization JSON, Node version, and
  `NODE_OPTIONS`.

2026-06-09 proof-order and K diagnostics:

- `temp/bandori-team-builder/run-medley-40case-isolated.cjs` deliberately
  deletes `HHWX_REAL_PROFILE_OPTIMIZATION_JSON` for baseline isolation. Opt-in
  optimization diagnostics must use the direct
  `benchmark-real-profiles-medley.cjs` runner or a future explicit passthrough
  variable; otherwise the run is just baseline and the conclusion is invalid.
- An opt-in seed-first all-scope proof ordering was implemented and rejected.
  With direct runner on restored-cache `P07:244`, it preserved the score
  `8551590` but worsened the gap from `55265` to `307404`, completed only
  `4/5` exact-join configurations, and still hit memory limit around
  `4201 MiB`. Revert this path; do not default seed-first proof ordering.
- Direct `exactCandidateSoftLimit=20000` was also rejected. It lowered peak
  memory to about `2314 MiB`, but widened `P07:244` gap to `375585`, found only
  score `8476866`, and aborted at the 20k candidate soft limit. High-budget
  candidate proof is necessary for this case; the problem is the memory shape
  of high-budget pair/candidate proof, not simply K being too large.

2026-06-09 runtime memory telemetry and generic-frontier diagnostics:

- Commit `b13c39e` added default runtime memory telemetry fields under
  `stats.profiling`: Node heap, RSS, external, arrayBuffers, and the actual
  memory-guard value. This is diagnostic-only and keeps the historical
  `peakUsedHeapMiB` field unchanged for compatibility.
- Current default 5-bounded diagnostic:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-08T19-43-01-660Z.json`.
  It reproduced the clean bounded total exactly: `0/5` exact, bounded-gap total
  `1819282`, no failed subprocess, all five rows `memoryLimited=true`.
- The five bounded rows all hit RSS/working-set pressure, not pure V8 heap:
  RSS minus heap was about `679-718 MiB` on `P03:260`, `P07:244`, `P07:260`,
  and `P08:244`; `P06:323` was similar at about `692 MiB` but reached
  `4472 MiB` before the initial-candidate abort.
- Per-case telemetry from the current default 5-bounded run:
  - `P03:260`: gap `370472`, abort `candidate-fill-generator-aborted`, peak
    RSS/heap `4201/3522 MiB`, generated candidates `168316`, max candidate
    count `152377`.
  - `P06:323`: gap `607201`, abort `initial-candidate`, peak RSS/heap
    `4472/3780 MiB`, no candidate/pair work reached. This is a slot candidate
    generator residency problem before exact-join candidate fill.
  - `P07:244`: gap `55265`, abort `candidate-fill-pair-refine`, peak RSS/heap
    `4208/3504 MiB`, generated candidates `1063396`, pair count `8778953`.
  - `P07:260`: gap `296599`, abort `candidate-fill-generator-aborted`, peak
    RSS/heap `4201/3508 MiB`, generated candidates `373136`, pair count
    `5437641`.
  - `P08:244`: gap `489745`, abort `candidate-fill-generator-aborted`, peak
    RSS/heap `4201/3483 MiB`, generated candidates `742274`, pair count
    `16365204`, high-pair records `60030`.
- Raising `memorySoftLimitMiB` only to `4290` on `P07:244` was rejected. It
  stayed bounded, widened gap to `307404`, hit peak `4291 MiB`, and changed the
  abort to `candidate-fill-generator-aborted`. Do not use a simple +2% memory
  budget bump as an optimization route.
- Opt-in targeted candidate-fill pair-refine was implemented in `41a0e85`,
  tested on `P07:244`, then reverted in `7fe6d05`. It stayed bounded, widened
  gap to `307404`, and aborted earlier at `high-budget-pair-upper`.
- Opt-in near-frontier proof sweep was implemented in `e9e6318`, tested on
  `P07:244`, then reverted in `0cb61d7`. Default sweep widened gap to
  `176105`; conservative `rootPrefix=16` stayed bounded at gap `56994`.
  Do not continue proof-order tuning without a stronger proof-cost model.
- Commit `3c5ac7b` removed one lossless generator residency source by avoiding
  slotUpperHeap/active Set maintenance while the exact slot generator is in
  slot-key mode and replacing the active Set with a node flag in global-key
  mode. P06/P07 smoke showed no exact or peak-memory improvement:
  `P06:323` remained bounded at gap `607201`, peak `4469 MiB`; `P07:244`
  remained bounded at gap `55265`, peak `4209 MiB`. Keep the patch only as a
  small lossless cleanup; it is not sufficient for the 38/40 gate.
- Commit `a49a73f` compacted exact slot generator nodes by replacing retained
  per-node `selectedCards` arrays with fixed card fields. Typecheck and
  `git diff --check` passed. The P06/P07 hard smoke still showed no proof or
  memory improvement: `P06:323` remained bounded at gap `607201`, peak
  `4475 MiB`; `P07:244` remained bounded at gap `55265`, peak `4208 MiB`.
  This indicates slot-generator node array copies are not a primary memory
  source. The next generic route should target exact candidate/result payloads,
  pair query caches, or streamed/chunked frontier proof rather than further
  node-shape tweaks.

2026-06-09 P07:260 low-memory proof checkpoint:

- This section is retained as the historical path that produced the current
  `38/40` checkpoint. `P07:260` is no longer the active conversion target.
- High-memory diagnostic with `memorySoftLimitMiB=7900`,
  same-coarse threshold `60000`, and min headroom `100` proved `P07:260`
  exact in `82533ms`, peak `7446 MiB`, `completedConfigurations=21`,
  `rootPrunedConfigurations=87`, generated candidates `63`, and pair count
  `0`. This proves the proof route is logically sufficient; the blocker is
  memory residency / allocation pressure inside repeated low-memory initial
  slot-top proof, not seed quality and not exact-join pair solving.
- Under the normal memory gate, the same target stays bounded around gap
  `296599`, peak about `4203-4204 MiB`, and completes only the first
  configuration. With same-coarse threshold `60000` and min headroom `100`, it
  completes two configurations but then peaks around `5050-5073 MiB` and still
  remains bounded around gap `290597`.
- Existing switches are not useful here. `disableSkipDfsAfterUnprovedExactCandidateJoin=true`
  did not improve the case. `enableConflictExactBnb=true` with exact join did
  not run a useful conflict path; with exact join disabled it used the full
  300s, completed `0` configurations, and widened the gap.
- Opt-in high-pair/prefix experiments are irrelevant for this row because the
  successful high-memory proof used `pairCount=0`. Do not spend the next patch
  on pair-record layout, high-pair prefix solve, or exact-join seed for
  `P07:260`.
- Commit `9183b20` reduced low-memory initial slot proof result materialization
  by keeping only the best score during the score-only proof pass, then asking
  the normal generator for the official candidate. Typecheck and diff checks
  passed, but diagnostics showed no meaningful memory improvement. It remains a
  useful staging point for lower-allocation proof work, not a completed
  optimization.
- Commit `a467839` grouped the low-memory slot-proof traversal by character.
  It improved per-configuration elapsed time slightly, but did not reduce peak
  memory enough to convert `P07:260`.
- Commit `3388fa3` tried average-only medley scoring for the score-only proof
  pass. It was slower and gave no memory improvement, so it was reverted in
  `32f9eaa`. Do not continue by simplifying score math alone unless profiling
  first proves the new path reduces allocation residency rather than just CPU.
- Next generic direction: implement a lower-allocation single-slot exact top
  proof path. The target is not a new seed or case-specific skip; it is to make
  the 21 repeated slot-top proofs from the high-memory route fit under the
  normal memory gate by reducing per-leaf allocation, reusable context objects,
  retained card/team arrays, and GC pressure while preserving exact upper-bound
  semantics.
- Commit `0dfba16` tried compacting candidate instance-key arrays into one
  signature string, then `e89e22b` reverted it. The P06/P07 smoke had a small
  positive signal on `P07:244` (`55265 -> 52777` gap, peak about
  `4202 MiB`), but the 5-bounded verification failed the memory gate:
  `P03:260` peaked at `4724 MiB` and `P07:260` peaked at `5430 MiB`, with
  both cases moving into `initial-candidate` memory pressure. Do not continue
  candidate instance-key compaction as a default route.
- Commit `a01dc32` tried minimizing `evaluateMedleyScoreOnlyTeam` result
  payloads, then `14b372c` reverted it. The P06/P07 smoke again had a small
  `P07:244` gap improvement, but the 5-bounded run failed the memory gate:
  `P07:260` peaked at `5603 MiB` and moved into `initial-candidate` memory
  pressure. This confirms score-only/candidate payload compaction can perturb
  GC and controller timing enough to create worse hard-case memory spikes.
  Do not default score-only payload minimization without a stronger no-op /
  memory-equivalence gate.
- Commit `d70a675` tried a deeper compact score-only `MedleyTeamCandidate`
  representation by removing retained `cards[]` and `cardIds[]` arrays from
  exact score-only candidates, then `6f2cce6` reverted it. The P06/P07 smoke
  did not improve proof status (`P06:323` gap `607201`, `P07:244` gap
  `55265`). The 5-bounded run failed the memory gate again: `P03:260` peaked
  at `4731 MiB`, `P07:260` peaked at `5438 MiB`, and bounded-gap total stayed
  effectively baseline-level at `1813280`. This rules out broad candidate
  object shape compaction as the next default route.

Phase 2: no-op equivalence gate, required only when touching prefix/seed
diagnostic paths again.

- Run `baseline`, `baselineProofLedger`, `prefixForceNoop`, `prefixGuardOnly`,
  and `currentGuardedPrefix` on the hard cases that are close to proof
  boundaries.
- Required: when seed solve does not run, result status, score, gap, completed
  configurations, root-pruned configurations, and configuration status sequence
  must stay equivalent. Allowed differences are elapsed time, memory sampling,
  and diagnostic counters.
- Do not start proof-only algorithm patches until this gate is stable.

Phase 3: proof-frontier patches, one class at a time.

Prioritize by the clean 40-case proof ledger, not by seed score:

1. memory-capped candidate fill / pair upper work for `P07:244`, `P03:260`,
   `P08:244`, and `P07:260`.
2. `initial-candidate` low-memory fallback for `P06:323`. The next generic
   direction here is a generator/proof path that can advance or bound the
   high-score frontier without materializing the full first candidate, not a
   simple per-slot minimum-score cutoff.
3. same-coarse proof-cost scheduling for expensive closed or near-closed groups
   after memory pressure is reduced.

Each patch must pass:

- no-op gate unchanged;
- hard-case acceptance no worse than baseline;
- 40-case bounded count not higher;
- 40-case bounded-gap total not higher;
- no new OOM;
- peak working set not above baseline by more than the selected memory gate.

## Current Next Step

2026-06-09 `38/40` bounded-root analysis:

- `P03:260` and `P06:323` are no longer memory, timeout, or seed-quality
  failures in the current pinned run. Both completed quickly, stayed far below
  the memory soft limit, and made zero exact-candidate-join calls.
- `P03:260` ended `bounded` with score `9213846`, observed upper `9584318`,
  gap `370472`, elapsed `51620ms`, peak `1980 MiB`, `timedOut=false`, and
  `memoryLimited=false`. The ledger shape was `1`
  `full-width-event-skip-seeding`, `5` `bounded-dominated-root-skip`, and
  `102` `fast-basic-root-pruned`. The top unclosed row was
  `RaiseASuilen/happy/performance`, sourced from `configuration-root`, with
  effective upper `9584317.729644679`.
- `P06:323` ended `bounded` with score `9486961`, observed upper `10094162`,
  gap `607201`, elapsed `22295ms`, peak `1295 MiB`, `timedOut=false`, and
  `memoryLimited=false`. The ledger shape was `1`
  `large-gap-event-skip-seeding`, `8` `bounded-dominated-root-skip`, and
  `99` `fast-basic-root-pruned`. The top unclosed row was
  `PastelPalettes/cool/performance`, sourced from `configuration-root`, with
  effective upper `10094161.91213159`.
- The current gap is therefore a deliberately retained proof upper, not a
  found-score problem. In both cases, the incumbent was already available; the
  search stopped because the event/root frontier guard remembered a loose root
  upper instead of spending memory and time on proof work that earlier
  diagnostics showed to be risky.
- The `bounded-dominated-root-skip` siblings are consequences of the same
  unclosed coarse frontier. For `P03:260`, the three leading rows are all
  `RaiseASuilen/happy`; for `P06:323`, the three leading rows are all
  `PastelPalettes/cool`. Closing or tightening the first sibling should also
  collapse most of the remaining same-coarse ledger entries.
- This is a different problem from the earlier `P07:260` conversion. The
  successful `P07:260` work made an existing proof route fit the memory gate.
  The remaining two rows currently do not enter exact join or candidate fill at
  all, so further cache compaction, candidate K tuning, warmup, or seed work is
  unlikely to move the exact count.

40/40 path from the current checkpoint:

- Stage A: add an opt-in event-root frontier probe before the
  `full-width-event-skip-seeding` and `large-gap-event-skip-seeding` exits.
  The probe should only run for the leading remembered configuration, only
  when the remaining budget and memory headroom are healthy, and only under a
  benchmark/debug flag until it proves no regression.
- Stage B: the probe should first attempt upper tightening, not score
  improvement. Its success criterion is lowering the effective upper below the
  incumbent, or at least lowering it enough that the sibling
  `bounded-dominated-root-skip` entries become root-prunable. It must report
  residual upper, residual gap, processed frontier count, elapsed time, peak
  memory, and skip/timebox reason.
- Stage C: make the proof shape memory-safe by reusing existing slot/root
  upper machinery and bounded prefixes, not by materializing the full
  exact-candidate frontier. The intended implementation is a cheap
  branch-upper / anchor-frontier upper pass over the top event-root slot,
  escalating to exact join only if the cheap pass narrows the gap and the
  candidate counts remain under a strict local cap.
- Stage D: `P06:323` is already exact. Test `P03:260` first, then the hard
  guard set. The `40/40` gate passes only when `P03:260` becomes exact without
  regressing score/gap/memory on the guard set.
- Stage E: guard set for every patch remains `P03:260`, `P06:323`,
  `P07:260`, `P08:323`, `P10:244`, `P10:260`, `P07:244`, and `P08:244`.
  Full isolated 40-case acceptance is required after any guard-set pass.
- Acceptance thresholds: exact count must not drop below `39/40`, bounded-gap
  total must not exceed `370472`, no currently exact guard case may become
  bounded, peak working set must stay within the active memory gate, and there
  must be no OOM or failed subprocess.
- Do not continue with broader seed, greedy, prefix-seed, candidate-limit, or
  memory-compaction experiments until the event-root frontier probe has a
  clean opt-in diagnostic result. The remaining upper gap is proof-conversion
  work, not incumbent discovery.

The next actionable step is not another seed experiment. It is:

1. Treat the `39/40` run from `2026-06-09T05-44-21-186Z` as the current pinned
   checkpoint for the branch. New patches must not regress below it.
2. Target `40/40` next. The only remaining blocker is `P03:260`.
3. Do not solve the remaining row with broader seeding or warmup. It is now a
   controlled remembered-root upper gap with no timeout, no memory limit, and
   no accepted proof closure.
4. The next generic implementation candidate is a bounded, memory-safe
   event/root frontier proof probe. It should attempt to close or tighten the
   first remembered unclosed configuration:
   `RaiseASuilen/happy/performance` for `P03:260`.
5. The probe must be opt-in first, must not materialize the full exact-candidate
   frontier, and must report proof-ledger deltas for upper reduction, elapsed
   time, and memory.
6. Re-run at least this guard set after the next patch:
   `P03:260`, `P06:323`, `P07:260`, `P08:323`, `P10:244`, `P10:260`,
   `P07:244`, and `P08:244`.
7. If `P03:260` converts and the guard set does not regress, re-run the full
   isolated 40-case matrix and generate another timestamped report.

Current execution workflow for the `40/40` goal:

1. Keep all work on `dev/medley-39-exact-frontier`; keep the main checkout out
   of this experiment.
2. Commit and push after every stable checkpoint that passes static validation
   or produces durable benchmark evidence.
3. Before a proof-path patch, document the hypothesis, the acceptance gate, and
   the expected diagnostic fields in this file.
4. After each single-case or guard-set run, record the raw result path, exact
   status, bounded reason, elapsed time, peak working set, residual upper/gap,
   and why the result is accepted or rejected.
5. After every full 40-case run, create a timestamped report containing timing,
   memory, exact/bounded status, bounded reasons, failure analysis, relevant
   optimization parameters, and next recommendations.
6. Do not promote any opt-in proof experiment unless it first passes
   `P03:260`, then the hard guard set, then the full isolated 40-case matrix.

## Historical Checkpoint - 2026-06-09 39/40

Accepted branch checkpoint:

- Branch: `dev/medley-39-exact-frontier`
- Code commit: `4bf5a28` (`Add opt-in medley event-root frontier probe`)
- Full 40-case report:
  `documents/bandori-team-builder/medley-40-exact-report-2026-06-09-141817.md`
- Full raw result:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T05-44-21-186Z.json`
- Guard-set raw result:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T05-32-38-569Z.json`

Result:

- Exact count improved from `38/40` to `39/40`.
- `P06:323` converted from bounded to exact.
- The only remaining bounded case is `P03:260`.
- Bounded gap total improved from `977673` to `370472`.
- There were `0` failed subprocesses, `0` timed out cases, and `0`
  memory-limited cases.
- Full-run peak working set was `4170 MiB`, below the active `4488 MiB`
  memory gate.

Implemented path:

- `enableEventRootFrontierProbe` is an opt-in internal optimization.
- The probe runs before `full-width-event-skip-seeding` and
  `large-gap-event-skip-seeding`.
- It is only allowed to affect proof state when it proves the configuration or
  directly lowers the upper below the incumbent. Otherwise the observed upper
  is recorded as diagnostic evidence only.
- This restriction is required. A rejected smoke showed that applying the
  unproved `P03:260` upper changed same-coarse scheduling and caused later
  initial-candidate memory pressure.

Evidence by remaining/converted blocker:

- `P06:323` now exact: the probe proved
  `PastelPalettes/cool/performance` before the former
  `large-gap-event-skip-seeding` exit. Full-run elapsed was `129716ms`, peak
  was `3183 MiB`, and gap was `0`.
- `P03:260` remains bounded: the probe ran on
  `RaiseASuilen/happy/performance` and reduced the diagnostic upper from
  `9584317.729644679` to `9566338.5`, but that still leaves a residual
  diagnostic gap of `352492.5`; because it is not a proof closure, it is not
  applied. Full-run elapsed was `53636ms`, peak was `1982 MiB`, and reported
  bounded gap remained `370472`.

Current target:

- Intermediate target `>=37/40` is passed.
- Intermediate target `>=38/40` is passed.
- Intermediate target `>=39/40` is passed.
- Final target remains `40/40 exact` for P01-P10 / four events, excluding P11.

2026-06-09 P03 post-39/40 diagnostics:

- Clean diagnostic row:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T07-29-04-900Z.json`.
- Options matched the `39/40` event-root probe path, with additional opt-in
  diagnostic controls:
  `eventRootFrontierProbeAnchorProofMaxFrontierGap=120000`,
  `eventRootFrontierProbeAnchorProofMinRemainingMs=15000`,
  `eventRootFrontierProbeAnchorCheapUpperTimeboxMs=60000`, and
  `eventRootFrontierProbeAnchorCheapUpperMaxAnchors=20000`.
- Result stayed bounded: score `9213846`, reported gap `370472`, elapsed
  `70161ms`, peak `1982 MiB`, `timedOut=false`, `memoryLimited=false`.
- The diagnostic event-root cheap upper improved the local upper to `9334022`
  and local residual gap to `120176`, but it remains above incumbent and is not
  a proof closure. It processed `10502` anchors in `11507ms`.
- The max residual source is `right-unseen`: max anchor score `2760598`, max
  pair upper `6573424`, generated-pair upper `6387732`, left-unseen upper
  `6572389`, right-unseen upper `6573424`.
- Full anchor-frontier proof is still blocked by
  `high-pair-record-upper=2001600`, just over the current `2,000,000` guard.
  Raising this guard to `3,000,000` and `5,000,000` was tested earlier and
  still skipped (`3002400` and `5004000` upper counts), so this is not a
  small-threshold miss.
- Rejected: applying the unproved `9334022` upper back into active same-coarse
  scheduling. It lowered the reported gap but exposed
  `RaiseASuilen/happy/visual`, which then hit initial-candidate memory pressure
  (`memoryLimited=true`, peak `4710 MiB`). This confirms the current
  39/40 restriction is necessary: unproved diagnostic upper may be recorded,
  but must not drive same-coarse scheduling.
- Rejected: banned-card-aware slot upper inside the cheap upper. It increased
  cheap-upper elapsed to about `40331ms` while leaving residual gap unchanged
  at `120176`.
- Rejected: `lowMemoryInitialCandidateSyncLightUpper=false` after applying the
  unproved upper. It worsened the same visual initial-candidate pressure, peak
  `5489 MiB`, with no exact improvement.

Next optimization direction:

1. Keep seed, greedy, prefix-seed, broad candidate-limit changes, and broad
   memory-compaction routes frozen for this objective.
2. Focus exclusively on `P03:260` and its
   `RaiseASuilen/happy/performance` full-width event root.
3. The next patch must be proof-only: it may record diagnostic upper
   improvements freely, but it may not feed an unproved upper back into active
   same-coarse scheduling.
4. The next generic route should target the residual `right-unseen` pair
   frontier, not incumbent quality and not a wider high-pair guard. The desired
   proof is a card-conflict-aware pair-unseen upper that can reduce the
   `6573424` right-unseen pair upper below the required threshold without
   materializing the full high-pair record frontier.
5. A secondary route, only after the performance frontier is truly closed, is
   the same-coarse `visual` initial-candidate memory path. The failed
   scheduling diagnostic shows it will become the next blocker if performance
   is closed or tightened enough to expose siblings; it needs a lower-allocation
   single-slot top proof rather than tighter skill-context upper.
6. Any accepted P03 patch must first pass the hard guard set:
   `P03:260`, `P06:323`, `P07:260`, `P08:323`, `P10:244`, `P10:260`,
   `P07:244`, and `P08:244`.
7. After any guard-set pass, rerun the full isolated 40-case matrix and create
   a new timestamped report with timing, memory, exact/bounded status, bounded
   reasons, failure analysis, and next recommendations.

2026-06-09 follow-up diagnostics after the `39/40` checkpoint:

- `lowMemoryInitialCandidateSyncDirectCandidate=true` was fixed to use the same
  `score -> maxScore -> cardInstanceKeys/cardIds` candidate ordering as the
  normal generator. This keeps it suitable as an opt-in diagnostic path, but it
  is not accepted as a default optimization.
- P03 diagnostic with direct candidate, default order, event-root soft limit
  `200000`, and memory soft limit `4488`:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T09-14-15-542Z.json`.
  Result stayed bounded: gap `354570`, elapsed `74201ms`, peak `4489 MiB`,
  `memoryLimited=true`. It proved the first sibling and then hit memory at
  `RaiseASuilen/happy/technique` candidate fill.
- P03 diagnostic with the same options but memory soft limit `4608`:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T09-16-31-421Z.json`.
  Result became exact: elapsed `215881ms`, peak `4553 MiB`, no timeout and no
  memory limit. This proves the remaining P03 proof path is reachable, but only
  with a higher transient working-set budget.
- Hard guard with direct candidate, event-root soft limit `200000`, and memory
  soft limit `4608`:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T09-22-41-861Z.json`.
  Rejected: `5/8` exact, bounded rows `P03:260`, `P06:323`, and `P07:260`,
  bounded-gap total `1253867`, peak `4614 MiB`. `P06:323` regressed to
  `candidate-fill-soft-limit` without timeout or memory limit, so this cannot
  be a broad guard-set option.
- Rejected diagnostic: same-coarse low-root-first proof order. It can move the
  first heavy sibling from performance/technique to visual, but the next sibling
  still hits memory. It changes where the wall appears rather than removing it.
- Rejected diagnostic: score-cache clear during low-memory initial-candidate
  sync. In the tested path the clear counter stayed `0`; memory pressure
  happens before that lever can matter.
- Rejected diagnostic: memory-soft-limit GC retry. It recovered one near-limit
  read but allowed later RSS to grow to more than `5500 MiB` while still
  ending bounded. Do not reintroduce this as a proof path.
- Rejected diagnostic: omitting persistent `cardInstanceKeys` for ordinary
  profile cards. It looked like a possible candidate-memory reduction, but it
  changed sort/allocation behavior and worsened P03/P06 memory profiles. The
  implementation was reverted.
- Pinned-option smoke after reverting the failed memory optimizations:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T10-19-37-132Z.json`.
  Result preserved expected semantics for the two checked rows:
  `P03:260` bounded with gap `370472`, and `P06:323` exact. The smoke peak
  was `4081 MiB`, still below the `4488 MiB` gate but higher than the pinned
  full-run P06 sample; treat memory sampling on this row as noisy until the next
  full 40-case run.

Updated conclusion:

- P03 is no longer primarily a seed-quality problem. It is a proof
  materialization / transient working-set problem.
- Raising memory can make P03 exact in isolation, but the guard set shows that a
  broad direct-candidate/high-limit path regresses other hard cases.
- The next viable generic direction is to reduce candidate materialization
  during exact join, or to prove the residual pair-unseen frontier without
  building the full three-slot candidate arrays.
- The next patch should target one of these low-allocation proof conversions:
  a compact candidate-key representation, a pair-unseen proof that streams
  candidates instead of storing them, or a same-coarse sibling proof pass that
  runs one heavy sibling at a time with a bounded retained frontier.

2026-06-09 current execution checkpoint:

- The active Codex goal object still points at the same 40/40 objective, but
  this roadmap now carries the detailed current goal contract because the goal
  tool cannot edit an active objective in place.
- Implemented and checked locally: a lossless compact exact-candidate key
  representation that packs 5-card candidate keys into fixed UTF-16 strings
  instead of comma-joined decimal strings. `npm.cmd run typecheck` and
  `git diff --check` passed before the latest diagnostics. This patch is still
  a candidate building block, not yet a full 40/40 acceptance patch.
- Rejected: compact-key plus global direct/high-limit event-root proof as a
  broad strategy. It produced one isolated `P03:260` exact diagnostic under the
  active `4488 MiB` gate
  (`temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T10-34-44-695Z.json`:
  exact, elapsed `209643ms`, peak `4249 MiB`, 6/6 exact-join completions), but
  the hard guard regressed to `5/8` exact and bounded `P03:260`, `P06:323`, and
  `P07:260`
  (`temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T10-38-58-648Z.json`).
- Rejected: full-width-only high-limit event-root escalation with same-coarse
  direct-candidate inheritance. `P06:323` stayed exact in the first smoke, but
  `P03:260` remained bounded and hit the memory edge; the repeat run
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T11-22-29-580Z.json`
  ended `bounded`, gap `354570`, `timedOut=true`, `memoryLimited=true`, peak
  `4809 MiB`, with 2/3 exact-join completions and final abort
  `initial-candidate`.
- Rejected: global direct candidate combined with full-width-only high K and
  the normal `20k/30s` large-gap probe. The run
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T11-30-43-757Z.json`
  regressed both checked rows: `P03:260` stayed bounded with peak `4703 MiB`,
  and `P06:323` reverted to bounded with abort `candidate-fill-soft-limit`.
- Current interpretation: `P03:260` is reachable in principle, but the accepted
  path cannot depend on broad direct-candidate flags, larger K, or same-coarse
  sibling inheritance. Those routes move the memory wall and can regress
  already exact hard cases.
- Accepted as a narrow no-regression smoke, not as final progress: after
  removing the failed full-width escalation code, compact-key baseline smoke
  preserved the current key shape on `P03:260` and `P06:323`:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T11-41-36-790Z.json`.
  Result: `P03:260` stayed bounded at gap `370472`, `P06:323` stayed exact,
  no timeout, no memory-limited row, peak `3211 MiB`.
- Rejected and reverted: opt-in two-slot capacity upper for the cheap-upper
  `bothUnseenUpper` term. The 60s cheap-upper diagnostic
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T11-54-30-647Z.json`
  stayed bounded and worsened diagnostic residual gap to `187702` after
  processing only `2840` anchors. A 120s diagnostic
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T11-56-14-837Z.json`
  still stayed bounded with residual gap `123718` after `80007ms`, slightly
  worse than the earlier `120176` cheap-upper diagnostic. This route is too
  slow and not tighter enough; do not continue by only raising cheap-upper
  timebox.
- Accepted as a no-regression implementation baseline, not as final progress:
  compact-key hard guard
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T12-02-54-520Z.json`
  passed the active guard set at `7/8` exact, one bounded row `P03:260`, bounded
  gap total `370472`, `0` failed subprocesses, `0` timed out rows, `0`
  memory-limited rows, median elapsed `47761ms`, max elapsed `283078ms`, and
  peak sampled heap `4185 MiB`. The exact guard rows stayed exact:
  `P06:323`, `P07:260`, `P08:323`, `P10:244`, `P10:260`, `P07:244`, and
  `P08:244`.
- Rejected diagnostics after the compact-key guard:
  - Existing opt-in unseen refine on `P03:260`
    (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T12-24-34-978Z.json`)
    did not improve proof. It stayed bounded, increased the event-root residual
    gap from `120176` to `220268`, and consumed the `30s` event-root probe
    budget.
  - Raising only `eventRootFrontierProbeCandidateSoftLimit` to `80000` or
    `120000`
    (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T12-27-17-090Z.json`,
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T12-31-59-393Z.json`)
    did not close `P03:260`. Both stayed bounded with residual gap `170144`,
    and slot `0` still hit `candidate-fill-soft-limit`.
  - A direct `200000` soft-limit diagnostic without the isolated runner's
    `NODE_OPTIONS=--max-old-space-size=8192` crashed at the V8 heap limit, so it
    is invalid as algorithm evidence. It reinforces that high-K probes must use
    the isolated runner environment and still require the hard guard.
  - Temporarily raising
    `MEDLEY_EXACT_CANDIDATE_JOIN_ANCHOR_FRONTIER_PROOF_MAX_HIGH_PAIR_RECORDS`
    to `2.05M` and then `2.1M` did not enter useful anchor proof. The reported
    high-pair count simply stopped just above the current threshold
    (`2051640`, then `2101680`), so this knob is a scan-budget expansion, not a
    true proof improvement. The code was reverted.
  - A trial patch that forced one cheap-upper unseen refine entry by default
    (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T12-42-19-238Z.json`)
    regressed the residual gap to `296638` and consumed the local event-root
    budget. The code was reverted.
  - Direct initial-candidate plus `200000` event-root candidate soft limit
    (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T12-47-37-560Z.json`)
    is not acceptable as a fallback. It let the event-root probe reach `proved`,
    but the overall case still ended bounded after later same-coarse work hit
    `timedOut=true`, `memoryLimited=true`, peak `4806 MiB`, and final abort
    `initial-candidate`. This confirms the remaining problem is not just
    proving the first full-width root; proof work for same-coarse siblings must
    be scheduled or released without accumulating a larger transient working
    set.
  - Direct initial-candidate plus `200000` event-root candidate soft limit and
    `enableLowMemoryHighPairPrefixUpper=true`
    (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T14-12-24-604Z.json`)
    also stayed bounded. It proved the first two `RaiseASuilen/happy` siblings
    (`performance` and `technique`), but the third sibling
    `RaiseASuilen/happy/visual` aborted in `initial-candidate` before pair
    upper, candidate fill, or solve could run. Final result: gap `354570`,
    elapsed `133963ms`, `timedOut=true`, `memoryLimited=true`, peak `4786 MiB`,
    exact-join `2/3` completed. The prefix option did not provide an independent
    useful hit in this path; treat this as same-coarse memory-frontier evidence,
    not as a viable prefix-upper candidate.
- Revised next implementation target: keep the compact-key representation as a
  safe lower-residency building block, but do not count it as proof-quality
  progress. The next proof patch must target genuinely lower-residency proof
  work for `P03:260`: streamed pair-unseen upper, compact candidate/result
  payloads with a no-op memory-equivalence gate, or a same-coarse sibling proof
  protocol that releases heavy frontier state between siblings without relying
  on runtime GC behavior.
- Rejected diagnostic: anchor-limited peek inside the event-root cheap upper
  (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T14-27-13-467Z.json`).
  It kept the same dominant `right-unseen` pair upper (`6573424`) while slowing
  the cheap pass from about `14980ms` to `21989ms`, processing only `5835`
  anchors, and worsening residual gap from `120176` to `150972`. The code was
  reverted. Do not continue this route by only raising the event-root timebox;
  the max pair term did not tighten.
- Rejected diagnostic: event-root candidate soft limit `200000` without
  `lowMemoryInitialCandidateSyncDirectCandidate`
  (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T14-34-13-427Z.json`).
  It still stayed bounded with gap `354570`, elapsed `120575ms`,
  `timedOut=true`, `memoryLimited=true`, peak `4752 MiB`, and final abort
  `initial-candidate`. It proved `RaiseASuilen/happy/performance` and
  `technique`, then failed on `visual`. This rules out direct-candidate result
  materialization as the primary cause; the remaining blocker is the third
  same-coarse low-memory slot-top proof itself.
- Rejected diagnostic: disabling score-cache writes during low-memory
  initial-candidate
  (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T14-45-24-172Z.json`).
  It improved P03 high-limit no-direct elapsed from `120575ms` to `99503ms`, but
  stayed bounded with the same gap `354570`, `timedOut=true`,
  `memoryLimited=true`, peak `4771 MiB`, and final abort `initial-candidate` on
  `RaiseASuilen/happy/visual`. The code was reverted. The cache is not the
  primary memory wall for this blocker.
- Rejected diagnostic: disabling the light low-memory upper and using the
  stronger skill-context upper in the same high-limit no-direct path
  (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T14-39-37-293Z.json`).
  It stayed bounded with gap `354570`, elapsed `103725ms`,
  `timedOut=true`, `memoryLimited=true`, peak `5494 MiB`, and final abort
  `initial-candidate`. The first two siblings proved, but the third
  `RaiseASuilen/happy/visual` still failed. This rules out "use a stronger
  per-candidate upper inside the same proof path" as a safe fix; it increases
  live memory pressure without changing the proof frontier enough to close.

Next execution step:

- Before implementing another proof patch, run a narrow diagnostic to estimate
  whether a mathematically safe same-coarse parameter-transfer upper can close
  `P03:260` after the first two sibling proofs. If the estimated transfer gap
  is not below the remaining `354570`/`370472` gap, record the rejection and
  pivot to lower-allocation slot-top proof instrumentation instead of widening
  candidate limits.
- Parameter-transfer estimate result: diagnostic scripts over the fixed
  `P03:260` fixture showed that `visual` has many positive item-power deltas
  relative to both proved siblings. Even the optimistic two-sibling crude bound
  leaves about `83k` score of positive transfer headroom, and a looser top-15
  bound leaves about `240k`. This can reduce the reported upper but cannot
  prove exact by itself.
- Added diagnostic-only low-memory initial-candidate profiling fields:
  last slot index, abort reason, visited node count, and best score. These do
  not change search behavior.
- Diagnostic
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T15-04-06-700Z.json`
  confirmed the `P03:260` high-limit no-direct path still proves
  `RaiseASuilen/happy/performance` and `technique`, then `visual` aborts in
  low-memory initial-candidate slot `0` with `local-abort` after only `512`
  visited nodes. Best observed slot score was `3060181`; the case stayed
  bounded, gap `354570`, elapsed `98881ms`, `timedOut=true`,
  `memoryLimited=true`, peak `4770 MiB`.
- Rejected diagnostic:
  `lowMemoryInitialCandidateSyncScoreCacheClearInterval=1`
  (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T15-06-36-696Z.json`).
  It still aborted `visual` at `512` nodes with the same best slot score,
  stayed bounded at gap `354570`, and only reduced peak from `4770 MiB` to
  `4736 MiB` while slowing elapsed from `98881ms` to `114729ms`.
- Rejected diagnostic:
  no debug trace / no exact-join memory-attribution in the same high-limit
  no-direct path
  (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T15-11-13-733Z.json`).
  It still stayed bounded with score `9213846`, upper `9568416`, gap `354570`,
  elapsed `116761ms`, `timedOut=true`, `memoryLimited=true`, peak `4713 MiB`,
  and final abort `initial-candidate` on slot `0` after `2/3` exact-join
  completions. This rules out `debugConfigurationTrace` as the primary memory
  wall; trace output can perturb timing but is not the blocker.
- Diagnostic:
  low-memory abort memory sampling in the same high-limit no-direct path
  (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T15-26-25-191Z.json`)
  showed the third sibling `RaiseASuilen/happy/visual` aborting after exactly
  `1` evaluated full team. The entry started with about `3008 MiB` used, then
  the abort sample recorded `4719 MiB` used, `4444 MiB` Node heap, `4719 MiB`
  RSS, `-231 MiB` headroom against the `4488 MiB` soft gate, and `4655 MiB`
  after GC. The case stayed bounded at gap `354570`, elapsed `124227ms`,
  `timedOut=true`, `memoryLimited=true`.
- Revised blocker interpretation: the remaining P03 wall is not broad DFS
  width, candidate K, direct-candidate materialization, debug trace, or normal
  score-cache retention. The immediate spike happens inside or immediately
  around one low-memory score-only team evaluation. The next diagnostic must
  identify the exact card/skill set and scoring path for that single evaluated
  team before attempting another proof patch.
- Diagnostic:
  best-team capture for the same path
  (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T15-40-34-393Z.json`)
  kept the case bounded at gap `354570`, elapsed `109522ms`,
  `timedOut=true`, `memoryLimited=true`, peak `4782 MiB`. The third sibling
  still aborted at slot `0` after `512` visited nodes and `1` evaluated team.
  The evaluated best team was the same team that the previous `technique`
  sibling had already accepted: cardIds `[1997,1712,2114,2293,2292]`,
  skillIds `[43,69,66,66,73]`, all `RaiseASuilen/happy`. Skill `43` is the
  continued-judge Happy-unified score skill; skill `69` is PERFECT-only
  score; `66` and `73` are constant score/fail-guard score skills. Since the
  same team succeeds in the previous sibling, the remaining spike is likely
  caused by retained same-coarse state plus the next low-memory DFS/scoring
  allocation, not by a unique card combination.
- Updated next implementation target: do not continue parameter-transfer or
  score-cache-clear as standalone fixes. The next proof-quality work should
  identify why memory remains around `3.0 GiB` after the second sibling despite
  cache release and GC, or replace the current low-memory slot-top proof with a
  lower-allocation equivalent that can complete `visual` without expanding
  candidate limits.
- Diagnostic:
  low-memory stage sampling after best-team capture
  (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T15-52-08-144Z.json`)
  showed the third sibling's memory was already high before score evaluation:
  `visual` recorded about `4709 MiB` before and after evaluating the single
  team. The `technique` sibling recorded about `3004 MiB` at the equivalent
  score-evaluation point. This rules out the leaf score calculation itself as
  the allocation spike.
- Diagnostic:
  start/before-visit sampling
  (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T16-00-32-268Z.json`)
  moved the spike earlier. Search-level low-memory sampling saw about
  `3011 MiB`, but the first local sample inside the exact-join low-memory
  slot-top finder already saw about `4785 MiB`. The allocation or measurement
  mismatch therefore occurs between the search-layer probe and the low-memory
  finder start, before visiting the first DFS leaf.
- Rejected diagnostic:
  lazy exact-candidate generator initialization
  (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T16-08-07-803Z.json`)
  did not convert P03 and did not materially reduce the target peak:
  `P03:260` stayed bounded at gap `354570`, elapsed `99039ms`, peak
  `4784 MiB`. The slot-top memory wall is not caused by eagerly creating the
  normal exact candidate generators before the low-memory finder.
- Rejected diagnostic:
  clearing the local `slots` variable after `releaseSlotSearchCaches`
  (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T16-15-07-374Z.json`)
  did not convert P03. The row stayed bounded at gap `354570`, elapsed
  `108617ms`, peak `4764 MiB`. Releasing one additional local reference is not
  enough to remove the same-coarse transient residency.
- Rejected diagnostic:
  copy-on-write suffix upper-bound arrays
  (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T16-23-19-042Z.json`)
  preserved typecheck but did not convert P03 or materially lower the peak:
  the row stayed bounded at gap `354570`, elapsed `98669ms`, peak `4771 MiB`.
  Keep this only as a possible generic memory-cleanup candidate if it later
  passes the guard set; it is not a standalone 40/40 path.
- Current narrow hypothesis: either the search-layer memory probe and the
  exact-join local sampler are not measuring the same guard value in Node 24,
  or same-coarse state retained after the second sibling is only becoming
  visible to the local RSS/heap sampler when the third sibling enters exact
  join. Before another proof patch, add Node heap/RSS fields to the
  pre-configuration and low-memory GC probes so the next P03 run can separate
  measurement mismatch from real allocation growth.
- Diagnostic:
  Node/performance/RSS probe
  (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T16-39-12-417Z.json`)
  ruled out a sampler mismatch. In Node 24, `performance.memory` was `null`;
  both the search-layer probe and the exact-join local sampler used Node
  heap/RSS. The remaining `P03:260` spike was real: `visual` pre-configuration
  GC saw about `3008 MiB`, while low-memory finder start saw about `4770 MiB`.
- Diagnostic:
  configuration-window memory probes
  (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T16-46-09-122Z.json`)
  narrowed the spike to incumbent seeding before exact join. For the third
  sibling `RaiseASuilen/happy/visual`, `post-slot-build` was about `3007 MiB`,
  but `before-exact-candidate-join-after-seeding` was about `4769 MiB`.
  The best score did not improve during slot-candidate, greedy, or neighborhood
  seeding; `afterSeedingMs` was `27461`, and exact join then aborted at
  `initial-candidate` before useful proof work.
- Candidate fix using an existing guard:
  raising `skipConfigurationSeedingWhenMemoryHeadroomBelowMiB` from `400` to
  `1600` in the same diagnostic path converted `P03:260` to exact
  (`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T16-49-28-385Z.json`).
  Result: exact, elapsed `199171ms`, peak `4050 MiB`, `0` timeout,
  `0` memory limit, `6/6` exact-join completions, and `102` root-pruned
  configurations. The crucial third sibling skipped no-gain seeding, entered
  exact join around `3975 MiB`, and proved immediately through low-memory
  initial candidates.
- Guard evidence for the `1600` headroom candidate:
  all eight active hard guard rows remained exact with `0` timeout and `0`
  memory-limited rows:
  - `P03:260`: exact, `199171ms`, peak `4050 MiB`, `6/6` exact join.
  - `P06:323`: exact, `139845ms`, peak `3186 MiB`, `9/9` exact join.
  - `P07:260`: exact, `146067ms`, peak `2981 MiB`, `21/21` exact join.
  - `P08:323`: exact, `17394ms`, peak `1068 MiB`, `3/3` exact join.
  - `P10:244`: exact, `98729ms`, peak `1889 MiB`, `12/12` exact join.
  - `P10:260`: exact, `56955ms`, peak `1375 MiB`, `6/6` exact join.
  - `P07:244`: exact, `73517ms`, peak `1063 MiB`, `21/21` exact join.
  - `P08:244`: exact, `17263ms`, peak `1061 MiB`, `3/3` exact join.
- Current candidate acceptance status:
  accepted for the retained `P01`-`P10` 40-case target. The process-per-case
  isolated full matrix using the same optimization JSON reached `40/40` exact
  with bounded-gap total `0`, peak `3272 MiB`, `0` failed subprocesses,
  `0` timeouts, and `0` memory-limited rows.

## Current Checkpoint - 2026-06-10 40/40

Accepted branch checkpoint:

- Branch: `dev/medley-39-exact-frontier`
- Code commit at run start: `3335d69` (`Record medley headroom guard evidence`)
- Full 40-case report:
  `documents/bandori-team-builder/medley-40-exact-report-2026-06-10-014527.md`
- Full raw result:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T17-06-33-445Z.json`
- Run id: `medley-40exact-headroom1600-20260609`
- Optimization: same as the `39/40` event-root probe path, but
  `skipConfigurationSeedingWhenMemoryHeadroomBelowMiB=1600` and
  `eventRootFrontierProbeTimeboxMs=240000`,
  `eventRootFrontierProbeCandidateSoftLimit=200000`.

Result:

- Exact count improved from `39/40` to `40/40`.
- `P03:260` converted from bounded to exact.
- There are no bounded rows.
- Bounded-gap total improved from `370472` to `0`.
- There were `0` failed subprocesses, `0` timed out cases, and `0`
  memory-limited cases.
- Full-run peak working set was `3272 MiB`, below the active `4488 MiB`
  memory gate and below the previous `39/40` peak `4170 MiB`.
- Elapsed median/P95/max: `42464ms` / `145234ms` / `156986ms`.

Conversion mechanism:

- `P03:260` was not blocked by seed quality or exact-join generator
  initialization. Diagnostics showed no-gain configuration seeding was causing
  the third same-coarse sibling to enter exact join near the memory wall.
- Raising the existing seeding headroom guard to `1600 MiB` skipped that
  no-gain seeding when headroom was low, preserved the incumbent, and let exact
  join close the remaining proof frontier.
- This is not a proof shortcut. It only avoids memory-heavy incumbent seeding;
  exactness still comes from exact candidate join/root proof.

Next maintenance target:

- Non-debug confirmation has now been attempted and rejected. The `40/40`
  checkpoint depends on behavior that is currently exposed through
  `enableLowMemoryInitialCandidateSyncGcProbe` and/or debug-adjacent runtime
  shape, so it must not be promoted as a plain non-debug default yet.
- Before production promotion, convert the GC/probe dependency into an explicit
  memory recovery option with a production name, then rerun the full isolated
  P01-P10 40-case matrix.
- Keep this 40/40 result as the anti-regression baseline for future proof-cost
  and memory work.

## Follow-Up Confirmation And P11 Stress - 2026-06-10

Report:

- `documents/bandori-team-builder/medley-confirmation-and-p11-stress-report-2026-06-10-110853.md`

Non-debug confirmation:

- No-debug/no-GC matrix prefix:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-10T02-02-20-838Z-partial.json`.
  Rejected. `P03:260` regressed to bounded with gap `370472`, elapsed
  `58282ms`, peak `3204 MiB`, `timedOut=true`, and `memoryLimited=true`.
- No-debug/GC single-case:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-10T02-11-07-420Z.json`.
  `P03:260` proved exact in `150527ms`, peak `3029 MiB`.
- No-debug/GC matrix prefix:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-10T02-14-34-205Z-partial.json`.
  Rejected. `P03:260` again regressed to bounded with gap `356069`, elapsed
  `103647ms`, peak `3216 MiB`, `timedOut=true`, and `memoryLimited=true`.

Conclusion:

- `enableLowMemoryInitialCandidateSyncGcProbe` is behavior-affecting in the
  current hard path; it is not pure profiling.
- Reintroducing the GC probe alone is not sufficient to make the non-debug
  matrix stable, because `P03:260` still fails in the matrix-prefix run.
- The accepted `40/40` run remains the anti-regression checkpoint, but the
  promotion gate is now stricter: remove the debug/probe dependency or make the
  memory recovery behavior explicit and revalidate.

P11 stress:

- Fixture:
  `temp/bandori-team-builder/real-profile-medley-p11-stress-fixture.json`.
  Source id `7627fd2f-8a29-4462-99ee-7085789d7561`, `manual`, `2112` cards.
- 90s smoke:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-10T02-37-37-697Z.json`.
  Result `0/4` exact, bounded-gap total `1041476`, peak `1257 MiB`,
  no failed subprocess, no OOM, no memory-limited row.
- 300s full stress:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-10T02-45-04-510Z.json`.
  Result `0/4` exact, bounded-gap total `1041476`, peak `1282 MiB`,
  no failed subprocess, no OOM, no memory-limited row.

P11 rows at 300s:

- `P11:none`: bounded, gap `215893`, elapsed `300077ms`, peak `1282 MiB`.
- `P11:244`: bounded, gap `369450`, elapsed `300049ms`, peak `1199 MiB`.
- `P11:260`: bounded, gap `191057`, elapsed `300040ms`, peak `1217 MiB`.
- `P11:323`: bounded, gap `265076`, elapsed `300052ms`, peak `1216 MiB`.

P11 conclusion:

- P11 did not improve from 90s to 300s; all four gaps were identical.
- The current P11 blocker is proof frontier closure, not memory. Further timeout
  increases are unlikely to help without changing proof order or tightening
  root/effective upper bounds.
- Keep P11 outside the P01-P10 `40/40` acceptance target, but retain it as a
  separate stress case for future proof-frontier work.

## No-GC Stable 40/40 Target - 2026-06-10

Active goal:

- Scope: fixed P01-P10 fixture, events `none/244/260/323`, `40` cases total.
- Excluded from acceptance: P11 full-card stress profile.
- Runtime gate: ordinary Node execution, no `--expose-gc`, no `global.gc`
  dependency, `debugConfigurationTrace=false` for final confirmation.
- Final target: stable `40/40` exact within `300000ms` per case.

Acceptance workflow:

- First prove single hard cases without GC/debug, then repeat hard-case matrix,
  then run complete 40-case matrix.
- Every complete 40-case matrix run must produce a timestamped report recording
  optimization JSON, song ids, profile fixture, elapsed time, peak memory,
  exact/bounded/timedOut/memoryLimited state, bounded reason, failure analysis,
  and follow-up recommendations.
- Accepted code changes must pass `npm.cmd run typecheck`, runner syntax checks,
  `git diff --check`, and must be committed and pushed from the independent
  worktree branch.

Current hard blocker:

- `P06:323`, fixed songs `385,193,619`, profile `P06`, `1234` cards.
- Safe no-GC baseline with event-root probe remains bounded:
  - report `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T07-46-51-619Z.json`
  - score `9488172`, gap `605990`, elapsed `35697ms`, peak `2822 MiB`
  - abort reason `candidate-fill-soft-limit`
  - `sameCoarseSiblingReevaluationCount=2`, hit count `1`, best improvement `1211`
- The best team is `PastelPalettes/cool/technique`. Before the same-coarse
  sibling re-evaluation patch, the safe bounded path returned the same 15 card
  ids under `PastelPalettes/cool/performance` at `9486961`, missing the
  technique sibling because `bounded-dominated-root-skip` skipped lower-root
  same-coarse siblings after the performance frontier remained unclosed.

Accepted local change:

- Add incumbent-only same-coarse sibling re-evaluation before dominated bounded
  skip. It re-evaluates the current best card partition under the skipped
  same-coarse configuration, updates the incumbent if the score improves, and
  leaves all proof/upper-bound semantics unchanged.
- This improves P06 incumbent quality and user-visible best-team reporting, but
  it does not close the proof frontier by itself.

Rejected/paused experiments from this checkpoint:

- `maxScore` solve-order and first-aware third-shortlist experiments reduced
  some raw fallback counters but did not make `P06:323` exact within 300s.
  They were removed from the accepted worktree state.
- Existing `enableLowMemoryHighPairScan` and
  `enableLowMemoryHighPairPrefixUpper` did not reduce the P06 root/frontier gap
  in the 200k diagnostic run and increased elapsed time to `55114ms`.

Next proof direction:

- Focus on `PastelPalettes/cool/performance` frontier proof, not seed score.
- Prefer general proof-frontier compression: tighter generated-pair/complement
  upper, pair-record proof for `second+third` against each anchor slot, or
  tighter event-root upper that can lower the `607k` residual gap before full
  solve.
- Do not rely on manual GC or unsafe active-generator advancement. Those paths
  can change proof behavior and previously produced false exact/score
  instability.

## Proof Frontier Checkpoint - 2026-06-10 16:30 CST

Code direction kept:

- Add opt-in event-root anchor proof controls:
  - `eventRootFrontierProbeAnchorProofMaxOtherSlotCandidates`
  - `eventRootFrontierProbeAnchorProofMaxOtherSlotCandidateTotal`
  - `eventRootFrontierProbeAnchorProofMaxHighPairRecords`
  - `eventRootFrontierProbeAnchorProofTimeboxMs`
- Allow event-root exact-join probe upper bounds to tighten the active
  configuration frontier when the bound is below the previous active/root upper,
  even if the probe does not prove the configuration. This only records a tighter
  unclosed upper; it does not mark the configuration exact or closed.
- Let same-coarse frontier retry trigger on large unresolved gap as well as
  sibling root delta:
  - existing root-delta trigger: `>=100000`
  - new unresolved-gap trigger: `>=300000`

P06 diagnostic evidence:

- Baseline after same-coarse sibling re-evaluation:
  - `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T07-46-51-619Z.json`
  - score `9488172`, bounded gap `605990`, elapsed `35697ms`, peak `2822 MiB`
  - anchor proof skip reason: `other-slot-candidate-count`
- Debug ledger with gap-only relaxed:
  - `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T07-54-05-010Z.json`
  - score `9488172`, bounded gap `605990`, elapsed `50325ms`, peak `2337 MiB`
  - confirmed skip reason `other-slot-candidate-count`
  - candidate counts `[200000,80879,50858]`
- Relaxed other-slot candidate gate, default high-pair gate:
  - `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T08-02-05-101Z.json`
  - score `9488172`, bounded gap `605990`, elapsed `47361ms`, peak `2490 MiB`
  - cheap upper found residual gap `367351`, but old caller did not apply it to
    the active frontier
  - high-pair skip count was just over the old gate:
    `2034320 > 2000000`
- After writing tighter probe upper to the active frontier:
  - `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T08-06-02-689Z.json`
  - score `9488172`, bounded gap `447414`, elapsed `89949ms`, peak `3292 MiB`
  - performance frontier tightened to gap `349297`, but visual became top gap
    via `bounded-same-coarse-tight-root-skip`
- After same-coarse retry also considers unresolved gap:
  - `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T08-16-58-029Z.json`
  - score `9488172`, bounded gap `347244`, elapsed `100176ms`, peak `3759 MiB`
  - technique and visual both retried and now share the exact-join frontier
    upper with performance

Rejected/paused from this checkpoint:

- Fully relaxed anchor proof with `5M` high-pair records and `60s` proof
  timebox caused V8 OOM before report generation:
  - stderr log `temp/bandori-team-builder/p06-anchor-frontier-relaxed-20260610-155942.err.log`
- Increasing cheap-upper timebox from `8s` to `30s` worsened P06:
  - `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T08-20-00-451Z.json`
  - bounded gap `429011`, elapsed `122137ms`, peak `3787 MiB`
  - conclusion: score-only/generated-pair upper can become looser as more
    generated candidates expose high invalid overlapping pairs; do not default
    longer cheap-upper timeboxes.
- Smallly relaxing high-pair proof to `2.1M` records with `35s` proof timebox
  did not trigger a completed anchor proof and performed worse than the 8s
  cheap-upper retry path:
  - `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T08-25-12-035Z.json`
  - bounded gap `394092`, elapsed `112041ms`, peak `3751 MiB`

## Split-Pruned Cheap Upper Checkpoint - 2026-06-10 16:45 CST

Accepted local diagnostic change:

- In the generated-pair conflict split upper, keep the best valid disjoint pair
  found so far and stop recursively splitting a branch once the branch's
  independent left+right slot upper is already no higher than that valid
  disjoint upper.
- This is a safe upper-bound pruning: it reduces split DFS work but does not
  mark any configuration exact and does not lower the bound below what the
  current branch can still achieve.

P06 evidence:

- With the same 8s cheap-upper path plus split pruning:
  - `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T08-32-06-448Z.json`
  - score `9488172`, bounded gap `331225`, elapsed `99201ms`, peak `3587 MiB`
  - cheap-upper residual gap `332436`
  - split attempts `6494`, split states `155798`, split abort reason `timebox`
  - max source moved to `right-unseen`, with max generated-pair upper
    `6528470` and right-unseen upper `6765779`

Rejected/paused from this checkpoint:

- Enabling unseen-upper refinement with
  `eventRootFrontierProbeAnchorCheapUpperRefineUnseen=true` and generated
  prefix `512` was worse:
  - `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T08-35-24-162Z.json`
  - bounded gap `402942`, elapsed `93038ms`, peak `3760 MiB`
  - cheap upper processed only `2235` anchors and residual gap was `404153`
  - max source returned to `generated-pair`
- Conclusion: heavier per-entry unseen refinement can lower individual unseen
  terms but processes too few anchors inside the timebox, so it is not a good
  default proof path for P06.
- Disabling same-coarse tight-root skip/retry protection is not viable:
  - stderr log
    `temp/bandori-team-builder/p06-disable-samecoarse-tightroot-20260610-164239.err.log`
  - result: V8 OOM before report generation
  - conclusion: proving the whole same-coarse frontier directly can exceed the
    memory envelope; this protection cannot simply be removed for exactness.
- Adding per-side candidate caches and branch-order prefetch inside the split
  upper was reverted:
  - `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T08-45-41-274Z.json`
  - bounded gap `458043`, elapsed `97688ms`, peak `3756 MiB`
  - cheap upper processed more anchors (`8744`) and more split states
    (`219649`), but exposed a higher unresolved generated-pair upper
    (`7115284`) and worsened the final residual gap.
  - conclusion: this cheap-upper stage is not monotonic with respect to
    anchor-throughput; more processed anchors can expose a larger unresolved
    upper unless the new entries are also fully refined.

Current P06 state:

- Best observed safe no-GC P06 path is still bounded, but gap improved from
  `605990` to `331225` under the diagnostic relaxed other-slot gate plus
  split-pruned cheap upper.
- The remaining top unclosed configurations are all
  `PastelPalettes/cool/{performance,technique,visual}` and now share the same
  exact-join frontier upper around `9819397`.
- The remaining blocker is not incumbent quality. It is proof conversion for
  high invalid generated-pair upper, then unseen-side upper after the split
  pruning removes part of the overlapping-pair inflation.

Next proof direction:

- Do not continue increasing cheap-upper timebox or high-pair proof limits.
- Do not enable unseen refinement by default; its anchor-throughput cost
  outweighed the local upper tightening in P06.
- Do not disable same-coarse protection or add split-cache prefetch; both failed
  the current P06 diagnostic.
- Investigate a lower-memory, monotonic pair upper for anchor frontier:
  - avoid retaining millions of JS pair-record objects;
  - separate invalid overlapping generated-pair score-only upper from valid
    disjoint pair upper;
  - make any refined upper monotonic or explicitly record it as diagnostic-only
    if it can loosen across candidate-fill states.
- Re-run P06 non-debug only after the next proof patch can reduce the remaining
  `PastelPalettes/cool` residual gap below the current `347244` without higher
  peak memory.

## First-Oriented Third Shortlist Rejection - 2026-06-10 17:17 CST

Rejected experiment:

- Hypothesis: for the imbalanced `P06:323` staged `800000` exact join, try the
  current first candidate's third-slot shortlist before the existing
  second-oriented third shortlist. This should reduce
  `thirdShortlistFallbackCount` and `thirdFallbackWordScanCount` without
  changing proof semantics, because the original second-oriented shortlist and
  bitset fallback remain as backstops.
- Version 1 cached first-oriented base and extended shortlists through the
  existing WeakMap caches. It OOMed before report generation at about `72s` in a
  `120000ms` P06 diagnostic run.
- Version 2 reused scratch `Uint32Array` buffers for the first-oriented base and
  extended shortlists so no long-lived first-shortlist cache entries were kept.
  It still OOMed before report generation at about `73s` in a `90000ms` P06
  diagnostic run.
- Both failed runs used ordinary Node, no `--expose-gc`, fixture
  `temp/bandori-team-builder/real-profile-medley-p01-p10-40exact-fixture.json`,
  profile `P06`, event `323`, fixed songs `385,193,619`, staged event-root
  candidate soft limit `800000`, and `debugConfigurationTrace=true`.

Conclusion:

- First-oriented third shortlist lookup is not a viable current path for the
  no-GC acceptance target. Even after removing long-lived shortlist cache
  pressure, the added per-first/per-pair allocation and scan work pushes V8 to
  OOM before the existing 300s bounded baseline.
- Do not continue tuning this by increasing heap, relying on manual GC, or
  adding more shortlist stages. The remaining P06 blocker should stay framed as
  a low-allocation proof-frontier upper-bound problem, especially the
  `PastelPalettes/cool` high invalid pair / unseen-side residual upper, not as a
  third-candidate lookup hit-rate problem.

## Mask Split Upper Rejection - 2026-06-10 17:26 CST

Rejected experiment:

- Hypothesis: replace the split-upper DFS state representation from copied
  sorted card-id arrays plus string keys to a local numeric mask, reducing
  allocations while preserving the same branch-and-bound semantics.
- Version 1 used numeric masks plus nested `Map` cache. It typechecked, but
  `P06:323` staged `800000` OOMed before report generation at about `74s`.
- Version 2 removed the nested cache entirely, leaving only mask state,
  recursion, state budget, and best-disjoint pruning. It also OOMed before
  report generation at about `73s`.
- Both failed runs used ordinary Node, no `--expose-gc`, profile `P06`, event
  `323`, fixed songs `385,193,619`, staged event-root candidate soft limit
  `800000`, and `debugConfigurationTrace=true`.

Conclusion:

- The split-upper bottleneck is not just string/array state allocation. Making
  the split traversal cheaper or faster can increase downstream/resident
  working set enough to hit the V8 heap wall before producing a useful report.
- Do not continue by optimizing split traversal throughput alone. The next
  viable route needs to reduce resident memory and proof scope, for example by
  narrowing which same-coarse frontier is kept, releasing candidate/generator
  state earlier between proof probes, or deriving a tighter upper without
  widening staged candidate material.

## P06 Short-Budget OOM Correction - 2026-06-10 17:40 CST

Correction to the two preceding rejected diagnostics:

- After reverting both shortlist and mask-split experiments, the same `P06:323`
  staged `800000` command still OOMed with a short `90000ms` duration and
  `80000ms` event-root probe timebox. Therefore the short-budget OOMs are not
  sufficient evidence that those patches alone caused the heap failure.
- A clean 300s reproduction with ordinary Node completed without OOM:
  `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T09-29-25-764Z.json`.
  Result: bounded, score `9486961`, gap `595522`, elapsed `300517ms`, peak
  `3364 MiB`, abort `solve-timeout`.
- Going forward, P06 staged diagnostics must use 300s long-budget A/B runs, or
  they must be explicitly marked as smoke tests that are not accepted for proof
  quality or memory-causality conclusions.

Follow-up result:

- A 300s opt-in test that skipped the anchor-frontier improvement probe did not
  help:
  `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T09-36-33-402Z.json`.
- Result: bounded, score `9486961`, gap `595522`, elapsed `300891ms`, peak
  `3514 MiB`, abort `solve-timeout`.
- Anchor-frontier cheap upper/proof counters were all zero. With staged
  `800000`, the event-root probe completes candidate fill and moves directly to
  exact-join solve; it does not hit the candidate-fill soft-limit branch where
  anchor-frontier proof would run.
- Conclusion: skipping the improvement probe is not a useful route and the
  temporary opt-in code was removed. The active P06 blocker remains the staged
  exact-join solve order / proof frontier, not the anchor-frontier pre-proof
  improvement probe.

## Anchor Cheap-Upper Gate Rejection - 2026-06-10 19:55 CST

Rejected experiment:

- Hypothesis: when the staged `800000` event-root path for `P06:323` completes
  candidate fill but would spend most of the remaining budget in exact-join
  solve, run the existing anchor-frontier cheap upper after fill and abort early
  if the residual upper remains too wide. This was intended as a runtime guard,
  not as a proof improvement.
- Comparable long-budget baseline without the gate:
  `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T09-29-25-764Z.json`.
  Result: bounded, score `9486961`, gap `595522`, elapsed `300517ms`, peak
  `3364 MiB`, abort `solve-timeout`, candidate counts
  `[679552,189394,50858]`.
- Best prior safe 200k cheap-upper diagnostic:
  `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T08-32-06-448Z.json`.
  Result: bounded, score `9488172`, gap `331225`, elapsed `99201ms`, peak
  `3587 MiB`, abort `solve-dominated-same-coarse-frontier`.
- Post-fill gate diagnostic with the same fixed songs:
  `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T11-36-28-545Z.json`.
  Result: bounded, score `9488172`, gap `378833`, elapsed `131138ms`, peak
  `3510 MiB`, event-root abort `post-fill-cheap-upper-gate`.
- Renamed pre/post gate diagnostic:
  `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T11-42-15-506Z.json`.
  Result: bounded, score `9488172`, gap `406334`, elapsed `156667ms`, peak
  `3618 MiB`, abort `anchor-cheap-upper-gate`.
- Relaxed-gate plus unseen-refine diagnostic:
  `temp/bandori-team-builder/real-profile-medley-benchmark-2026-06-10T11-47-51-141Z.json`.
  Result: bounded, score `9488172`, gap `479479`, elapsed `118885ms`, peak
  `3553 MiB`, abort `solve-dominated-same-coarse-frontier`.

Conclusion:

- The gate can avoid a 300s solve timeout in the staged `800000` path, but it
  does not improve exactness and its residual gap is worse than the prior 200k
  cheap-upper diagnostic. It is therefore rejected for the current 40/40 exact
  path.
- The attempted source option `enableAnchorCheapUpperGate` was removed instead
  of kept as an opt-in switch, to avoid carrying low-value algorithm complexity
  into later proof work.
- `anchorFrontierCheapUpperRefineUnseen` remains frozen: in this P06 shape it
  processed a smaller, locally cleaner frontier but produced a looser final
  observed upper than the existing 200k diagnostic.
- The current blocker is now narrowed to proof-upper quality, not incumbent
  quality, K, seed, manual GC, or exact-join solve timebox.

Next proof direction:

- Keep the best-known P06 reference point as the 200k cheap-upper diagnostic
  (`331225` residual gap). A new proof patch must beat that gap without turning
  any current exact hard-guard case bounded.
- Focus on a general, monotonic upper-bound improvement for the
  `PastelPalettes/cool` same-coarse frontier:
  - separate generated overlapping-pair upper from valid disjoint-pair upper;
  - avoid retaining large JS pair-record frontiers;
  - make any refined upper monotonic across candidate-fill states, or keep it
    diagnostic-only;
  - prefer proof-scope reduction and memory release between probes over wider
    candidate material.
- Do not continue with larger K, larger staged candidate soft limits, longer
  full-solve budgets, seed/pre-proof warmups, or forced GC as routes to the
  primary no-GC 40/40 exact target.

## Medley Score-Only Scoring Alignment - 2026-06-10 20:09 CST

Hypothesis:

- `evaluateMedleyScoreOnlyTeam` and `evaluateMedleyScoreOnlyTeamScore` still
  use `calculateBestScoreForNonOverlappingSkillWindowsTargetOnly`, while the
  hydrated `evaluateTeam` path routes through
  `calculateBestScoreForNonOverlappingSkillWindows(..., targetOnly=true)` for
  solo/normal lives and `calculateBestMultiLiveScoreForSkillWindows(...,
  targetOnly=true)` for multilive.
- The old medley score-only helper does not pass through `resolveEncoreSkill`
  or `resolveOtherPlayerSkills`. That can make exact-join candidates use a
  different average score than the final hydrated medley result. If true, this
  is a general proof-material correctness issue, not a P06-specific heuristic.
- Aligning score-only with the normal target-only scoring path should improve
  candidate ordering, remembered upper slack, and proof-frontier quality without
  expanding candidate limits, timeboxes, or memory footprint. It may also change
  accepted scores; any score change must be treated as correctness evidence and
  validated by repeat non-debug no-GC runs.

Implementation gate:

- Replace the medley-specific target-only scoring call with a small shared
  helper that mirrors `evaluateTeam` score selection while preserving the lean
  medley result object.
- Do not restore automatic `lowMemoryInitialCandidateSync`.
- Do not enable seed or prefix-seed routes.
- Static checks required before long runs: `npm.cmd run typecheck` and
  `git diff --check`.

Targeted validation gate:

- First run no-GC non-debug direct diagnostics for `P06:323` and `P07:260`
  with the active hard-guard optimization JSON.
- Accept this stage only if `P06:323` improves over the current safe no-GC
  reference gap (`605990` direct baseline, or `331225` best safe cheap-upper
  diagnostic) without new timeout/OOM, and `P07:260` does not regress in
  exactness, peak working set, or bounded gap.
- If targeted runs pass, rerun the isolated hard set
  `P03:260,P06:323,P07:260,P08:323,P10:244,P10:260,P07:244,P08:244`.
- Only after hard-set repeat stability should the full 40-case 3-round
  acceptance restart.

Result:

- Rejected after first targeted `P06:323` no-GC non-debug diagnostic:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T12-13-57-984Z.json`.
- Result stayed bounded with score `9488172`, gap `605990`, abort
  `candidate-fill-soft-limit`, peak `2487 MiB`, and no timeout/OOM.
- This matches the prior safe direct baseline shape and did not improve proof
  quality. The source scoring alignment patch is therefore reverted for the
  active 40/40 path to avoid carrying extra per-candidate scoring overhead.

## Candidate-Fill Capacity Complement Probe - 2026-06-10 20:20 CST

Hypothesis:

- The current candidate-fill global pruning passes
  `useCapacityComplementUpper: false`, so the slot generator often relies on
  pair unseen upper alone while filling the hard anchor slot.
- P06's open frontier is dominated by already-generated high slot0 anchors:
  the unseen slot0 frontier is close to the cutoff, but generated anchors still
  combine with a loose pair upper.
- Enabling the existing capacity-complement upper inside candidate-fill may
  safely prune anchor branches earlier by considering the selected anchor cards
  against the remaining two slots. This reuses existing upper-bound code instead
  of adding seed, increasing K, or expanding candidate material.

Implementation gate:

- Add opt-in `enableCandidateFillCapacityComplementUpper?: boolean`, default
  `false`.
- Pass it through both regular exact joins and event-root frontier probes.
- When disabled, source behavior must remain unchanged.

Targeted validation gate:

- Run `P06:323` with the active hard-guard optimization JSON plus
  `enableCandidateFillCapacityComplementUpper=true`.
- Accept only if it improves the current safe no-GC gap without new timeout/OOM
  and without increasing peak memory beyond the prior `P06:323` direct baseline
  by more than 2%.
- If P06 improves, run `P07:260` with the same option to check memory/pair-upper
  regression before any hard-set run.

Result:

- Rejected after `P06:323` opt-in diagnostic:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T12-23-35-061Z.json`.
- Result was bounded, score `9486961`, gap `607201`, elapsed `368755ms`,
  `timedOut=true`, peak `7576 MiB`, abort `candidate-fill-generator-aborted`.
- The option triggered huge generated-pair complement work during candidate fill:
  `exactCandidateJoinPairComplementScanCount=419539616`,
  `exactCandidateJoinPairComplementHighPairRecordCount=14999154`, and
  `exactCandidateJoinPairComplementHighPairBuildElapsedMs=304002`.
- Capacity upper counters stayed zero; the generated-pair complement work blew
  the budget before capacity upper could provide useful pruning. The source
  option is removed instead of kept as a diagnostic switch.

Next route:

- Do not enable pair-complement exact queries inside candidate-fill ordering.
- If continuing global-pruning work, use a cheaper selected-card exclusion upper
  that avoids materializing high-pair records: for an anchor prefix/candidate,
  estimate each remaining slot's best score excluding the anchor's card ids, and
  use that relaxed per-slot sum only when it is cheaper than the current
  pair-unseen bound.

## Candidate-Fill Relaxed Exclusion Upper Probe - 2026-06-10 20:41 CST

Hypothesis:

- The failed capacity-complement probe was too expensive because it entered
  generated-pair complement materialization before any capacity upper could run.
- A cheaper safe probe can avoid pair materialization entirely: when an anchor
  prefix is close to the proof cutoff, estimate the remaining two slots'
  relaxed upper after banning the selected anchor card ids. If that safe upper
  is already below the needed complement score, prune the anchor branch.
- This can reduce P06's 200k slot0 candidate frontier without increasing K and
  without changing incumbent search.

Implementation gate:

- Add opt-in `enableCandidateFillRelaxedExclusionUpper?: boolean`, default
  `false`.
- Limit calls to near-frontier nodes by reusing
  `MEDLEY_EXACT_CANDIDATE_JOIN_CAPACITY_COMPLEMENT_MARGIN`.
- Add profiling counters for calls, improvements, best improvement, and elapsed
  time.
- Do not call generated-pair complement or capacity assignment from this probe.

Targeted validation gate:

- First run `P06:323` with active hard-guard JSON plus
  `enableCandidateFillRelaxedExclusionUpper=true`.
- Pass only if it reduces bounded gap or proves exact without exceeding the
  current safe P06 peak memory by more than 2% and without `timedOut=true`.
- If P06 passes, run `P07:260`; otherwise remove the source option and keep only
  this roadmap record.

Result:

- Rejected after `P06:323` opt-in diagnostic:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T12-39-55-770Z.json`.
- Result was bounded, score `9488172`, gap `605990`, elapsed `253188ms`,
  peak `1989 MiB`, no global timeout/OOM, but event-root frontier probe hit its
  `240s` timebox.
- It reduced slot0 generated candidates from `200000` to `15418`, but did not
  reduce the reported upper/gap because the proof frontier still aborted before
  closure. The repeated full banned-set slot upper calls are too slow for the
  acceptance path.

Next route:

- Replace full selected-set exclusion with a cheaper single-ban exclusion cache:
  for each remaining slot and each selected anchor card id, lazily compute the
  slot upper with only that one card banned; for a prefix, use the minimum
  single-ban upper across selected cards for each remaining slot.
- This is weaker than full selected-set exclusion but safe, avoids generated-pair
  materialization, and caps expensive upper computations by unique card ids
  rather than by generated prefixes.

Result:

- Rejected after `P06:323` opt-in diagnostic:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T12-50-06-028Z.json`.
- Result was bounded, score `9488172`, gap `605990`, elapsed `40012ms`,
  peak `2471 MiB`, no timeout/OOM, abort `candidate-fill-soft-limit`.
- Candidate counts and frontier shape remained effectively identical to
  baseline: `[200000,80879,50858]`, slot0 peek upper `2616168`, other upper
  `6968613`.
- Conclusion: single-ban exclusion is cheap but too weak for P06's generated
  anchor frontier. The source option is removed.

Next route:

- The only successful signal so far was full selected-set exclusion reducing
  slot0 generated candidates to `15418`, but its repeated upper recomputation
  is too slow and still did not close proof.
- A viable next proof patch must either cache/approximate multi-card exclusion
  more effectively, or attack the generated-anchor/pair frontier directly with
  a low-memory exact disjoint-pair query that does not materialize millions of
  pair records.

## Anchor-Banned Pair Frontier Proof Probe - 2026-06-10 21:10 CST

Hypothesis:

- P06:323 remains bounded because slot0 reaches the 200k candidate soft limit
  while the remaining two-slot pair upper is not conditioned on the selected
  anchor card ids. The latest direct baseline has slot counts
  `[200000,80879,50858]`, slot0 peek upper `2616168`, pair upper
  `6968613`, and final observed gap about `606k`.
- A low-memory proof path can test only the high generated anchors: for each
  anchor, rebuild the other two slots with the anchor's card ids removed, run a
  local two-slot pair-upper proof, and combine the processed anchor-specific
  upper with the unprocessed global anchor frontier.
- This is exact only when every relevant processed anchor's local pair upper is
  proved and the unprocessed anchor upper is also below incumbent. Otherwise it
  may return a tighter bounded upper or an incumbent hit, but it must not mark
  proof complete.

Implementation gate:

- Add opt-in `enableAnchorBannedPairFrontierProof?: boolean`, default `false`.
- Add optional limits: `anchorBannedPairFrontierProofTimeboxMs`,
  `anchorBannedPairFrontierProofMaxAnchors`, and
  `anchorBannedPairFrontierProofCandidateSoftLimit`.
- Reuse existing candidate generators on rebuilt filtered slots; do not extend
  global candidate limits, do not use `--expose-gc`, and do not retain pair
  record tables.
- Local timeout restores global `stats.timedOut` when the global deadline has
  not expired, and is recorded only as a local proof timebox.

Targeted validation gate:

- First run `P06:323` with the active no-GC hard-guard optimization JSON plus
  `enableAnchorBannedPairFrontierProof=true`,
  `eventRootFrontierProbeAnchorProofMaxFrontierGap=700000`,
  `eventRootFrontierProbeAnchorProofMaxOtherSlotCandidates=120000`,
  `eventRootFrontierProbeAnchorProofMaxOtherSlotCandidateTotal=160000`,
  `anchorBannedPairFrontierProofTimeboxMs=60000`,
  `anchorBannedPairFrontierProofMaxAnchors=256`, and
  `anchorBannedPairFrontierProofCandidateSoftLimit=120000`.
- Accept only if it proves exact or materially lowers bounded gap without
  `timedOut=true`, `memoryLimited=true`, or peak memory above the safe direct
  P06 baseline by more than 2%.
- If P06 passes, run `P07:260` with the same option before any hard-set or
  40-case run. If P06 fails, remove or freeze the source option and keep this
  record as rejected.

Result:

- Rejected after `P06:323` opt-in diagnostic:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T13-17-06-946Z.json`.
- Result was bounded, score `9486961`, gap `448625`, elapsed `151966ms`,
  `timedOut=true`, `memoryLimited=true`, peak `4493 MiB`, abort
  `high-budget-pair-upper`.
- The new anchor-banned pair proof triggered once and hit local timebox without
  an incumbent hit. The event-root probe upper did improve to residual gap
  `378667`, but the run failed the acceptance gate because it introduced
  timeout/memory-limit behavior and still did not close proof.
- Conclusion: per-anchor local pair proof is too expensive for the P06 frontier
  under the no-GC hard guard. The source option is removed instead of kept as an
  acceptance candidate.

Next route:

- Do not run local two-slot proof independently for each high anchor.
- The useful signal remains that conflict-aware upper can reduce the root gap,
  but it must be amortized across anchors. Next proof work should target a
  shared banned-card/pair-frontier index or a coarse conflict certificate that
  can answer many anchor exclusions without rebuilding two slot generators per
  anchor.

## P06 Existing Cheap-Upper Diagnostics - 2026-06-10 21:50 CST

Purpose:

- Before adding another proof patch, test whether existing event-root
  anchor-frontier cheap upper can close `P06:323` by tuning only opt-in
  parameters.
- Scope: single `P06:323`, no `--expose-gc`, non-debug runner, active hard-guard
  JSON, `enableEventRootFrontierProbe=true`, candidate soft limit `200000`.

Results:

- `eventRootFrontierProbeAnchorCheapUpperTimeboxMs=30000`:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T13-30-20-068Z.json`.
  Bounded, score `9488172`, gap `285646`, elapsed `133439ms`, peak
  `4329 MiB`, no timeout/memory-limit, abort
  `solve-dominated-same-coarse-frontier`. The event-root local upper improved
  from about `10094162` to `9773818`; residual gap was `286857`. Cheap upper
  processed `14321` anchors in `29547ms`, with `14320` split attempts and
  `390696` split states.
- `eventRootFrontierProbeAnchorCheapUpperTimeboxMs=60000`:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T13-34-08-696Z.json`.
  Bounded, score `9488172`, gap `587965`, elapsed `111290ms`, peak
  `4863 MiB`, `timedOut=true`, `memoryLimited=true`, abort
  `initial-candidate`. The cheap upper did not process more anchors than the
  30s run; event-root residual gap remained about `286857`, but later memory
  pressure worsened the reported outer upper.
- `eventRootFrontierProbeAnchorCheapUpperRefineUnseen=true` with default
  generated scan:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T13-39-26-601Z.json`.
  Bounded, score `9488172`, gap `316957`, elapsed `135885ms`, peak
  `4264 MiB`, no global timeout/memory-limit, abort
  `solve-dominated-same-coarse-frontier`. Cheap upper hit its local timebox,
  processed only `8122` anchors, and local residual gap worsened to `318168`.
- `eventRootFrontierProbeAnchorCheapUpperRefineUnseen=true` with
  `eventRootFrontierProbeAnchorCheapUpperUnseenRefineMaxGeneratedCandidates=1`:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T13-44-11-711Z.json`.
  Bounded, score `9488172`, gap `587965`, elapsed `123227ms`, peak
  `4869 MiB`, `timedOut=true`, `memoryLimited=true`, abort
  `initial-candidate`. Cheap upper local gap worsened to `340105`.

Interpretation:

- The 30s cheap upper is the best current safe signal for `P06:323`: it cuts
  the gap from about `606k` to about `286k` without timeout or memory-limit.
- More time does not help because the 30s run already reaches the cheap-upper
  stopping condition; the remaining gap is not a timebox artifact.
- The residual blocker is the pair-unseen upper, not incumbent quality and not
  generated-pair conflict alone. Existing `refineUnseen` is rejected because it
  spends the cheap-upper budget before completing the anchor sweep, worsens
  residual gap, and can push the outer run into memory-limit behavior.

Next route:

- Do not enable existing `eventRootFrontierProbeAnchorCheapUpperRefineUnseen`
  for the acceptance path.
- Do not raise cheap-upper timebox or candidate limits as a default strategy.
- The next implementation should be a lighter residual-unseen upper pass that
  runs after the normal anchor sweep has identified the residual max source. It
  should target only the small set of entries that determine the max upper, use
  cached slot/card exclusion bounds, and never feed an unproved upper back into
  same-coarse scheduling unless it fully proves the configuration.

## Rejected Deferred Unseen Upper Probe - 2026-06-10 22:10 CST

Hypothesis:

- The 30s cheap-upper run left `P06:323` bounded mostly on pair-unseen upper.
- A lower-risk probe could keep the normal anchor sweep and generated-pair split
  intact, then run a deferred anchor-only unseen refinement on only the residual
  max entries. This avoids the existing heavy `refineUnseen` generated-candidate
  scan.

Implementation tested:

- Added temporary opt-in
  `eventRootFrontierProbeAnchorCheapUpperDeferredUnseenRefine=true`.
- The helper did not change default behavior and only ran after
  `refineProcessedAnchorUpperEntries()`.
- It used per-anchor slot upper estimates with the anchor card ids banned, and
  did not scan generated candidates or feed unproved uppers back into
  same-coarse scheduling.

Results:

- Two acceptance-threshold `4488 MiB` attempts did not reach the probe:
  - `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T13-54-09-866Z.json`:
    bounded, score `9486961`, gap `607201`, elapsed `83103ms`, peak
    `4491 MiB`, `timedOut=true`, `memoryLimited=true`, abort
    `candidate-fill-generator-aborted`, event-root probe call count `0`.
  - `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T13-57-54-506Z.json`:
    bounded, score `9486961`, gap `607201`, elapsed `66792ms`, peak
    `4492 MiB`, `timedOut=true`, `memoryLimited=true`, abort
    `candidate-fill-generator-aborted`, event-root probe call count `0`.
- Same-code baseline without the new flag also showed current-environment memory
  instability:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T14-00-37-148Z.json`.
  It reached event-root probe but ended bounded with score `9488172`, gap
  `587965`, peak `4873 MiB`, `timedOut=true`, `memoryLimited=true`, and
  event-root residual gap `472606`.
- A non-acceptance diagnostic with `memorySoftLimitMiB=6144` did execute the
  temporary probe:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T14-03-29-442Z.json`.
  It stayed bounded, score `9488172`, gap `605990`, peak `2484 MiB`, no timeout
  or memory-limit, abort `candidate-fill-soft-limit`. The event-root upper did
  not improve; cheap-upper local residual gap worsened to `658127`, with
  `cheapUpperTimeboxCount=1`.

Conclusion:

- Rejected. The deferred anchor-only unseen refinement did not improve proof
  quality even when allowed to run under a higher diagnostic soft limit.
- The source changes were reverted. No production or acceptance path should use
  this variant.
- The remaining useful signal is still the original 30s generated-pair split
  cheap upper. The next direction should not be another per-entry unseen slot
  upper. Prefer either a shared pair-unseen certificate or a lower-allocation way
  to reduce the original candidate-fill/frontier memory wall before event-root
  proof starts.

## Candidate-Fill Pair-Refine Failure Allocation Guard - 2026-06-10 22:27 CST

Observation:

- Current `P06:323` post-revert baseline still showed memory instability around
  candidate fill:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T14-11-21-759Z.json`.
  It ran event-root cheap upper and reached local residual gap `286857`, but
  later ended bounded with score `9488172`, gap `465766`, peak `4500 MiB`,
  `timedOut=true`, `memoryLimited=true`, abort `candidate-fill-pair-refine`.
- The failure path in `refineCandidateFillPairUpper()` rebuilt candidate-key
  sets for pair slots before checking `stats.timedOut` or generator abort. Those
  sets are useless when the pair-refine probe has already failed and the caller
  will return unproved.

Patch:

- Move `rebuildCandidateKeys(...pairSlotIndices)` after the abort check inside
  `refineCandidateFillPairUpper()`.
- This is semantics-preserving: successful/non-aborted pair-refine still
  rebuilds keys before further candidate fill; aborted pair-refine skips only
  allocations that cannot affect proof or result.

Validation:

- Static: `npm.cmd run typecheck`, `git diff --check`.
- `P06:323` hard-parameter single case after the patch:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T14-17-54-186Z.json`.
  Still bounded, score `9488172`, gap `587965`, elapsed `98979ms`, peak
  `4869 MiB`, `timedOut=true`, `memoryLimited=true`, abort `initial-candidate`.
  Event-root cheap upper itself was healthy: residual gap `286857`, processed
  `14321` anchors, no cheap-upper timeout.
- `P07:260` hard-parameter single case after the patch:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T14-20-38-091Z.json`.
  Still bounded, score `8568618`, gap `62929`, elapsed `149534ms`, peak
  `4492 MiB`, `timedOut=true`, `memoryLimited=true`, abort
  `high-budget-pair-upper`.

Conclusion:

- Keep the patch as a small allocation guard on a failed path, but do not count
  it as progress toward the 40/40 exact acceptance gate.
- The active blockers remain:
  - `P06:323`: event-root proof can reduce gap to about `286k`, but subsequent
    same-coarse/initial-candidate memory pressure still prevents stable closure.
  - `P07:260`: high-budget pair upper remains memory-limited, though the latest
    gap sample is lower than the earlier `92335` hard-run gap.
- Next meaningful work should target the high-budget pair-upper / initial
  candidate memory path directly, not more seed or per-anchor unseen probes.

## Rejected Low-Memory High-Pair Existing Flags - 2026-06-10 22:40 CST

Purpose:

- Before adding new code, test whether the existing low-memory high-pair scan
  and prefix-upper options can improve the current `P07:260` high-budget
  pair-upper blocker without relying on manual GC.
- Scope: single `P07:260`, no `--expose-gc`, non-debug runner, active hard-guard
  JSON, plus `enableLowMemoryHighPairScan=true` and
  `enableLowMemoryHighPairPrefixUpper=true`.

Result:

- Diagnostic report:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T14-28-24-699Z.json`.
- The run stayed bounded after the full `300000ms` budget:
  score `8568618`, upper `8876753`, gap `308135`, elapsed `300195ms`, peak
  `2421 MiB`, `timedOut=true`, `memoryLimited=false`, abort
  `candidate-fill-generator-aborted`.
- The options did reduce memory substantially compared with the immediate prior
  `P07:260` hard run (`4492 MiB` peak), but proof throughput collapsed:
  `completedConfigurations=0`, `rootPrunedConfigurations=0`, event-root probe
  call count `0`, and candidate counts ended at `[151843,48662,6915]`.

Conclusion:

- Rejected for the acceptance path. This flag combination trades away the proof
  progress needed for `P07:260`: lower RSS is not useful when no configuration
  closes within the 300s budget and the observed gap grows from the previous
  `62929` sample to `308135`.
- Do not add these flags to the hard-guard optimization JSON. The next route
  should preserve normal candidate-fill throughput while reducing avoidable
  residency/allocation in the high-budget pair-upper path.

## P07 High-Budget Pair Upper Diagnostics - 2026-06-10 23:10 CST

Changes kept:

- Slimmed the high-pair complement cache so it no longer retains full
  `{ score, leftCardIds, rightCardIds }` record objects after building the
  score list and containing-card bitsets. The query now keeps `recordCount`,
  an `Int32Array` score list, and the bitsets needed for the same exact upper
  lookup.
- Added `debugExactCandidateJoinMemoryAttribution` snapshots for pair-upper,
  deep-pair-upper, and high-budget-pair-upper aborts. This is diagnostic-only
  and does not run on the default non-debug path.

Validation:

- Static: `npm.cmd run typecheck`, `git diff --check`.
- `P07:260` with only the cache-slim patch:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T14-40-31-312Z.json`.
  Result stayed bounded with the same score `8568618`, gap `62929`, peak
  `4491 MiB`, `timedOut=true`, `memoryLimited=true`, abort
  `high-budget-pair-upper`. Pair-upper elapsed changed from the previous
  `54415ms` sample to `40022ms`, but exactness and memory did not improve
  enough to matter.
- Pair-upper memory attribution:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T14-50-05-571Z.json`.
  Abort snapshot showed only about `56k` active generator heap nodes and no
  high-pair/query cache residency at the abort point. Candidate counts were
  `[1270,1691,1173]`, but process peak was already `4492 MiB`. This rules out
  the retained high-pair record objects as the primary P07 blocker.
- Proof ledger:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T14-55-18-838Z.json`.
  `P07:260` proved the first 12 configurations, then failed on
  `Everyone/happy/visual` at order `13` with `high-budget-pair-upper`, peak
  `4489 MiB`, gap `62929`. The first three expensive configurations were
  `PastelPalettes/powerful` siblings, including one `34967ms` proof with
  candidate counts `[151843,48662,6915]`.

Rejected diagnostics:

- Coarse round-robin proof ordering was tested as a temporary opt-in and then
  removed. It reduced elapsed to `115085ms` but regressed the result:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T15-01-05-901Z.json`
  stayed bounded with gap `296599`, only `4` completed configurations,
  `29` root-pruned configurations, and abort `candidate-fill-generator-aborted`.
- Raising the diagnostic soft limit from `4488 MiB` to `4608 MiB` did not close
  `P07:260`:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T15-04-35-088Z.json`
  stayed bounded with gap `62929`, peak `4609 MiB`, `memoryLimited=true`, abort
  `high-budget-pair-upper`.

Conclusion:

- Keep the cache-slim patch and the debug snapshot hook because they are
  semantics-preserving and useful, but do not count them as 40/40 progress.
- Do not pursue coarse proof-ordering or slightly higher memory soft limits for
  P07. The failure is not a simple ordering issue or a 4488 MiB cliff.
- The next useful route should change the high-budget pair proof itself:
  preserve the strong pair upper, but avoid treating a late high-budget
  refinement memory abort as a total configuration failure when a safe partial
  pair upper can still feed candidate-fill/solve, or add a bounded/chunked
  high-budget pair proof that releases intermediate search state between
  chunks without using manual GC.

Follow-up rejected diagnostics:

- A temporary opt-in targeted high-budget pair upper was tested and removed.
  It limited the deep pair proof to the pair0 threshold needed for root closure
  and stopped when generated pairs already exceeded that target. Diagnostic:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T15-18-03-768Z.json`.
  Result regressed: bounded, score `8568618`, gap `308135`, elapsed `77639ms`,
  peak `4493 MiB`, `memoryLimited=true`, abort
  `candidate-fill-generator-aborted`, `completedConfigurations=0`,
  candidate counts `[265548,126,89]`. This proves P07 needs the strong
  high-budget pair upper; simply skipping/target-limiting it makes
  candidate-fill explode.
- A locked single-configuration diagnostic for `P07:260` with
  `Everyone/happy/visual` was started to test whether all-scope ordering was
  the dominant issue. It was manually stopped at `8384.6 MiB` working set
  after about `299s` CPU without producing a report:
  `temp/bandori-team-builder/p07-everyone-happy-visual-locked.out.log`.
  This indicates the configuration is intrinsically memory-heavy; not merely
  a late-order victim of earlier configurations.

Updated conclusion:

- Do not pursue targeted skipping of the high-budget pair proof.
- Do not pursue coarse ordering as the primary P07 fix.
- The next P07 path should preserve high-budget pair strength while reducing
  its memory residency, most likely by chunking/releasing pair proof state or
  by replacing the full two-slot proof with an exact lower-memory pair frontier
  algorithm. Any candidate must first prove `Everyone/happy/visual` in isolation
  under the `4488 MiB` acceptance gate before being tried in full all-scope.

## Conflict Pair Upper BnB Diagnostics - 2026-06-11 00:34 CST

Purpose:

- Test whether an exact lower-residency two-slot conflict BnB can replace the
  memory-heavy generated-candidate pair upper without using manual GC.
- Implementation is opt-in only:
  `enableConflictPairUpperBnb=true`,
  `conflictPairUpperBnbNodeLimit`,
  `conflictPairUpperBnbSlotSolveNodeLimit`, and
  `conflictPairUpperBnbMaxMemoryHeadroomMiB`.
- The helper proves score-only pair upper by solving constrained slot optima
  and branching on duplicate-card conflicts. It is a certificate only when the
  BnB completes; aborts fall back to the original generated-candidate proof.

Diagnostics:

- High-budget-only BnB with runner counters missing:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T15-46-42-226Z.json`.
  Result: bounded, score `8568618`, gap `99259`, peak `4495 MiB`,
  `memoryLimited=true`, abort `pair-upper`, completed `9`. This was worse than
  the cache-slim baseline gap `62929` and completed `12`.
- All-pair BnB wrapper:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T16-00-19-670Z.json`.
  Result: bounded, score `8568618`, gap `48011`, peak `2849 MiB`,
  `timedOut=false`, `memoryLimited=false`, completed `3`, root-pruned `96`,
  BnB calls `18/18 completed`. This proves the low-residency certificate can
  reduce memory and reported gap, but it removes the original pair proof's
  useful side effect of materializing candidate prefixes, so proof throughput
  collapses and exactness still fails.
- Debug ledger for all-pair BnB:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T16-06-38-393Z.json`.
  Result regressed under debug overhead: timed out at `300052ms`, gap
  `290597`, peak `2850 MiB`, abort `candidate-fill-pair-refine`. The trace
  showed `PastelPalettes/powerful/technique` spending `145428ms` in solve and
  `PastelPalettes/powerful/visual` failing after only `18808ms` remained.
- Guarded high-budget/refine BnB, headroom `1600 MiB`:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T16-25-26-897Z.json`.
  Result: bounded, score `8568618`, gap `62165`, peak `4489 MiB`,
  `memoryLimited=true`, abort `pair-upper`, completed `13`, BnB calls
  `9/9 completed`. This is a tiny improvement over gap `62929` and completed
  `12`, but still fails exact and still hits the RSS guard.
- Guarded high-budget/refine BnB, headroom `2500 MiB`:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T16-29-04-382Z.json`.
  Result: bounded, gap `151555`, peak `2913 MiB`, `memoryLimited=false`,
  completed `3`, BnB calls `11` with `10` completed and `1` abort. This repeats
  the all-pair pattern: lower memory, worse proof throughput.

Conclusion:

- Keep conflict pair-upper BnB as a diagnostic/research-only opt-in. Do not
  enable it by default and do not include it in the current acceptance JSON.
- The core tradeoff is now clear: replacing generated pair proof with pure BnB
  can prove upper bounds with much less resident memory, but it does not retain
  the candidate material needed by candidate-fill and final solve. The exactness
  path therefore needs lower-allocation candidate materialization, not a pure
  upper-only replacement.
- Next general route: preserve generated candidate prefixes while reducing
  allocation/RSS churn. Prioritize compact candidate records, generator node
  pooling/typed storage, or chunked high-budget pair proof that carries forward
  candidate material and upper certificates without retaining the full transient
  generator working set.

## Exact Candidate Memory Residency Pass - 2026-06-11 01:41 CST

Purpose:

- Continue the no-GC route without relying on `--expose-gc` or `global.gc`.
- Test whether lower candidate/material residency can move the remaining
  `P07:260` blocker from RSS guard failure into proof/solve work.

Changes under test:

- Exact candidate records now omit `cardInstanceKeys` only when the slot card
  pool has unique `cardId`s and no custom `cardInstanceKey`s. Temporary-card and
  duplicate-instance cases keep the old instance-key behavior.
- Candidate-fill duplicate-key sets are now built lazily per slot and released
  before final solve.
- Exact-join working-set release now also clears the per-slot score-only team
  evaluation cache.
- Exact slot candidate generation can skip score-only cache storage. The exact
  generator uses this to avoid retaining per-candidate cache keys and duplicate
  score-only result references.
- After candidate fill, if the safe observed exact-join upper is already at or
  below the active proof cutoff, the configuration is marked proved without
  entering the expensive final join solve. This is disabled for
  `solveOnlyAboveUpperTarget` diagnostic/probe calls.

Validation:

- Static:
  - `npm.cmd run typecheck`: pass.
  - `git diff --check`: pass, with existing CRLF warnings only.
- `P07:260`, 300s, no-GC, non-debug, active hard-guard JSON at
  `memorySoftLimitMiB=4488`:
  - `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T17-06-56-594Z.json`
    showed real memory progress: bounded, score `8568618`, gap `62929`,
    peak `4082 MiB`, no timeout/memory-limit, completed `12`, started `108`,
    root-pruned `87`, abort `solve-workload-limit`.
  - `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T17-25-11-186Z.json`
    with the proof-conversion branch progressed to completed `13`, gap `62165`,
    but still bounded with `candidate-fill-pair-refine`, peak `4489 MiB`.
- `P07:260` with `debugExactCandidateJoinMemoryAttribution=true`:
  - `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T17-29-48-018Z.json`.
  - Abort was `high-budget-pair-upper`, peak `4491 MiB`, node heap peak
    `4175 MiB`, RSS peak `4491 MiB`.
  - Snapshot showed only `53897` candidates, no retained high-pair/query cache,
    and generator heap nodes `[22700,120621,72566]`. Current 4488 failure is
    therefore dominated by generator node churn/RSS, not by high-pair record
    cache or candidate-key sets.
- `P07:260` diagnostic at `memorySoftLimitMiB=6144`:
  - `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T17-35-50-398Z.json`.
  - Result: exact, score `8568618`, elapsed `275304ms`, peak working set
    `5433 MiB`, peak node heap `5077 MiB`, completed `17`, root-pruned `91`.

Conclusion:

- This pass is progress but not final acceptance. It proves `P07:260` can close
  exact under no-GC when allowed about `5.4 GiB` working set, but the current
  `4488 MiB` hard-guard target is still not stable.
- The remaining `4488 MiB` blocker is now generator node allocation/RSS during
  high-budget pair proof. Candidate key sets, high-pair record objects, and
  score-only cache retention are no longer the dominant explanation.

Next route:

- If the acceptance budget may be raised, run the full hard guard and then the
  40-case isolated matrix with `memorySoftLimitMiB=6144`, documenting the higher
  memory cost explicitly.
- If the `4488 MiB` gate must remain fixed, do not tune seed or pair K. The next
  implementation should target exact generator node allocation directly:
  compact/pooled generator nodes, lower-allocation selected-card handling, or a
  chunked high-budget pair proof that releases generator state between chunks
  while preserving generated candidate material.

## P06/P07 Frontier Split - 2026-06-11 02:13 CST

Purpose:

- Separate the remaining blockers after the candidate memory residency pass.
- Keep the no-GC requirement: no `--expose-gc`, no `global.gc`, non-debug path
  unless explicitly noted.

Evidence:

- `P07:260`, `memorySoftLimitMiB=6144`:
  - `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T17-35-50-398Z.json`.
  - Exact, score `8568618`, elapsed `275304ms`, peak working set `5433 MiB`,
    peak node heap `5077 MiB`, completed configurations `17`, root-pruned `91`.
  - Interpretation: P07 is primarily a memory headroom problem. With enough
    no-GC headroom it closes exact, though the 4488 MiB gate is still too low.
- `P06:323`, same hard JSON but `memorySoftLimitMiB=4488`:
  - `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T17-45-01-322Z.json`.
  - Bounded, score `9486961`, gap `607201`, elapsed `101652ms`,
    `timedOut=true`, `memoryLimited=true`, peak `4489 MiB`, completed `0`,
    started `1`, abort `candidate-fill-generator-aborted`.
- `P06:323`, `memorySoftLimitMiB=6144`:
  - `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T18-08-10-503Z.json`.
  - Bounded, score `9486961`, gap `467344`, elapsed `144379ms`,
    `timedOut=false`, `memoryLimited=false`, peak `5792 MiB`, completed `0`,
    started `108`, root-pruned `99`, abort `solve-dominated-same-coarse-frontier`.
  - `eventRootFrontierProbeCallCount=0`, so the current event-root probe does
    not fire after the main exact join fails.

Post-exact event-root probe diagnostic:

- A post-exact probe was tested under a new opt-in
  `enablePostExactEventRootFrontierProbe`.
- Test artifact:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T17-58-55-374Z.json`.
- Result: bounded, score `9486961`, final gap still `467344`, elapsed
  `295086ms`, peak `6006 MiB`.
- The probe did run: `eventRootFrontierProbeCallCount=2`,
  `eventRootFrontierProbeUpperImprovementCount=2`, elapsed `133158ms`.
  The last local residual gap improved to `283606`, but another unclosed
  configuration still preserved the global `467344` gap.

Conclusion:

- Post-exact event-root probing is useful as a diagnostic but not a default
  path. It spends most of the remaining budget, increases memory peak, and did
  not improve final exactness for P06.
- The code keeps it behind `enablePostExactEventRootFrontierProbe=false` by
  default. The existing `enableEventRootFrontierProbe` behavior is unchanged
  unless the new opt-in is explicitly set.
- The P06 blocker is not seed quality and not just memory. It is a same-coarse
  proof-frontier problem: several configurations are skipped as dominated by an
  unresolved same-coarse frontier target, but that target itself remains above
  the incumbent.

Next route:

- Do not expand post-exact probe timebox/K. The next implementation should make
  same-coarse frontier handling more proof-aware:
  - identify the highest unclosed same-coarse frontier configuration;
  - spend proof budget on closing that frontier root instead of re-probing later
    dominated configurations;
  - if a frontier remains unclosed, preserve a tighter per-configuration upper
    only when it actually reduces the global max upper.
- Before coding another proof patch, run or inspect a debug proof-ledger sample
  for `P06:323` to list the unclosed configurations by gap and confirm whether
  one unresolved same-coarse target dominates the final `467344` gap.

## P06 Wide Anchor Frontier Probe - 2026-06-11 02:34 CST

Purpose:

- Test whether the top `P06:323` blocker is the main exact join's conservative
  anchor frontier guard rather than post-exact probing.

Change under test:

- Added opt-in `enableExactJoinWideAnchorFrontierProbe`.
- When enabled, the main exact candidate join reuses the configured
  event-root anchor frontier limits for anchor proof/cheap upper:
  `eventRootFrontierProbeAnchorProofMaxFrontierGap`,
  `eventRootFrontierProbeAnchorProofMaxOtherSlotCandidates`,
  `eventRootFrontierProbeAnchorProofMaxOtherSlotCandidateTotal`,
  `eventRootFrontierProbeAnchorProofTimeboxMs`,
  `eventRootFrontierProbeAnchorCheapUpperTimeboxMs`,
  and related refine limits.
- Default remains `false`; this does not alter normal max search behavior.

Evidence:

- Baseline no-debug no-GC `P06:323`, `memorySoftLimitMiB=6144`:
  - `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T18-08-10-503Z.json`.
  - Bounded, elapsed `144379ms`, gap `467344`, peak `5792 MiB`,
    abort `solve-dominated-same-coarse-frontier`, `eventRootFrontierProbeCallCount=0`.
- Debug proof ledger for the same baseline:
  - `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T18-15-06-373Z.json`.
  - Top unclosed frontier:
    `PastelPalettes/cool/performance`, gap `467344`, status
    `exact-unproved-skip-dfs`, abort `candidate-fill-soft-limit`,
    candidate counts `[400000,80879,50858]`, elapsed `115390ms`.
  - The next two unclosed entries are the same coarse group:
    `PastelPalettes/cool/technique` gap `455469` and
    `PastelPalettes/cool/visual` gap `448624`, both
    `solve-dominated-same-coarse-frontier`.
  - Other coarse groups are far smaller: `Morfonica/cool` max gap `144489`,
    `Everyone/cool` max gap `41335`.
- Wide-anchor opt-in:
  - `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T18-27-50-483Z.json`.
  - Bounded, elapsed `172670ms`, gap reduced to `285088`, peak `5580 MiB`,
    no timeout, no memory limit.
  - `exactCandidateJoinAnchorFrontierCheapUpperCount=1`,
    `exactCandidateJoinAnchorFrontierCheapUpperImprovementCount=1`,
    `exactCandidateJoinAnchorFrontierCheapUpperTimeboxCount=1`.
  - Cheap upper processed `12999` anchors in `30009ms` and used other-slot
    counts `[80879,50858]`.

Conclusion:

- This is real proof-frontier progress: unlike post-exact probe, main wide
  anchor reduced the final global gap from `467344` to `285088`.
- It still does not reach exact. Current evidence points to anchor cheap upper
  timing out before proof, not to seed quality or same-coarse ordering alone.
- Keep the switch opt-in until it passes broader acceptance. The next experiment
  should determine whether stronger cheap-upper refinement or entering full
  anchor frontier proof can close the remaining `285088` gap without exceeding
  the memory budget.

Follow-up evidence:

- Wide-anchor plus unseen refinement was not useful:
  - `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T18-34-44-152Z.json`.
  - Bounded, elapsed `210470ms`, final gap worsened to `448625`, peak `5575 MiB`.
  - Cheap upper processed only `3607` anchors in `60009ms`; split attempts/states
    rose to `3606` / `75678`.
  - Decision: do not pursue larger cheap-upper timeboxes or unseen refinement as
    a default path.
- Wide-anchor debug ledger:
  - `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T18-40-42-728Z.json`.
  - Final gap `287176`; top unclosed `PastelPalettes/cool` entries now share the
    same tightened remembered/effective upper `9774137`.
  - The leading `performance` entry reached candidate counts
    `[600000,80879,50858]` and aborted at `candidate-fill-soft-limit`.
  - Full anchor frontier proof was skipped because
    `exactCandidateJoinLastAnchorFrontierProofHighPairRecordUpperCount=2034320`
    exceeded the current `eventRootFrontierProbeAnchorProofMaxHighPairRecords`
    cap of `2000000`.

Next experiment:

- Run the same no-GC `P06:323` case with wide-anchor enabled and only a narrow
  opt-in cap bump to `eventRootFrontierProbeAnchorProofMaxHighPairRecords=2200000`.
- Passing signal: proof trigger runs without OOM and either reaches exact or
  reduces the final frontier gap without raising peak heap above the established
  hard-case envelope.
- Failing signal: timebox or memory pressure rises without closing the gap; in
  that case this route should stop and the next patch should target the
  candidate-fill frontier itself instead of proofing a larger pair-record set.

Follow-up rejection:

- Narrow high-pair cap bump did not help:
  - `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T18-49-41-350Z.json`.
  - Bounded, elapsed `175750ms`, final gap `467344`, peak `5572 MiB`.
  - Full anchor proof still did not trigger (`anchorFrontierProofTriggerCount=0`).
  - Cheap upper processed `13411` anchors in `30012ms` but residual gap was
    `569971`, with max source `generated-pair` and overlapping generated pair.
  - Decision: do not continue by raising high-pair cap.
- Bitset pair refine experiment was implemented as an opt-in and then rejected:
  - `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T19-03-59-155Z.json`.
  - Bounded, elapsed `179039ms`, final gap `467344`, peak `5465 MiB`.
  - Cheap upper processed only `1466` anchors in `30001ms`; pair complement
    queries rose to `1339780`; split state count fell to `0` but the bitset
    pair refine itself hit the timebox.
  - Decision: remove the opt-in code. Per-anchor exact pair refinement is too
    expensive for the `P06:323` frontier.

Updated direction:

- Stop tuning high-pair caps, cheap-upper timeboxes, unseen refinement, and
  per-anchor exact pair refinement for `P06:323`.
- The remaining general route is a lower-allocation shared proof certificate:
  preserve generated candidate prefixes, but answer repeated anchor complement
  upper queries from compact shared material rather than solving each anchor
  independently.
- Candidate next implementation should focus on compact candidate/pair records
  or chunked high-pair proof that carries reusable upper certificates across the
  same `PastelPalettes/cool` frontier without widening default candidate limits
  or requiring manual GC.

Existing high-pair prefix recheck:

- Re-tested current code with no new source changes, wide-anchor enabled, and
  `enableLowMemoryHighPairScan=true`,
  `enableLowMemoryHighPairPrefixUpper=true`,
  `lowMemoryHighPairPrefixRecordLimit=500000`.
- Result:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T19-13-19-332Z.json`.
  Bounded, elapsed `210595ms`, final gap `467344`, peak `5449 MiB`.
- Cheap upper processed `12865` anchors but residual gap worsened to `800275`;
  max source remained `generated-pair`, split state count `345541`, split abort
  `timebox`.
- Decision: existing low-memory high-pair scan/prefix is still not a viable
  P06 route under the current hard JSON. Do not promote it; use it only as
  evidence that repeated pair-complement work needs a different shared
  certificate shape.

Shared pair-upper probe rejection:

- Implemented an opt-in cheap-upper variant that reused the existing high-pair
  record bitset certificate for each anchor's generated-pair upper.
- Diagnostic command:
  `P06:323`, no-GC, `memorySoftLimitMiB=6144`, wide-anchor enabled,
  `eventRootFrontierProbeAnchorCheapUpperUseSharedPairUpper=true`.
- The run was manually stopped before report generation:
  - stdout log
    `temp/bandori-team-builder/p06-wide-anchor-shared-pair-upper-2026-06-10T19-22-33-746Z.out.log`;
  - stderr log
    `temp/bandori-team-builder/p06-wide-anchor-shared-pair-upper-2026-06-10T19-22-33-746Z.err.log`;
  - process working set rose from about `5.4 GiB` to `6.6 GiB`, then
    `7.3 GiB`, with no JSON output yet.
- Decision: remove the opt-in source code. Reusing the current high-pair record
  materialization directly is not the desired shared certificate. The next
  viable version must avoid the transient JS record array/object materialization
  and build a genuinely compact/chunked certificate.

Compact high-pair record builder experiment:

- Code change: replace the previous `MedleyExactCandidatePairRecord[]` object
  array build/sort path with a score-descending frontier heap that writes pair
  scores and left/right candidate indices into `Int32Array` buffers.
- Intended invariant: produced `highPairRecordScores` and
  `containingHighPairRecordBitsByCardId` are semantically equivalent to the old
  sorted record list; exact/bounded proof semantics are unchanged.
- Reason: the previous implementation briefly held millions of JS objects
  before converting them to typed arrays. P06's wide-anchor frontier is only
  slightly above the high-pair cap, so reducing this transient allocation is a
  prerequisite before any guarded cap/proof attempt is credible.
- Smoke validation:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T19-38-16-881Z.json`.
  This was a `P06:323` 10s shape check only; it is not proof-quality evidence.
- Next validation: run full 300s `P06:323` with no manual GC, 6144 MiB soft
  limit, wide-anchor enabled, and a narrow
  `eventRootFrontierProbeAnchorProofMaxHighPairRecords=2200000` guard.

Validation results:

- Full no-GC `P06:323`, 6144 MiB, wide-anchor, high-pair cap `2200000`,
  event-root candidate soft limit `200000`:
  - `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T19-41-51-760Z.json`
  - bounded, elapsed `147882ms`, gap `281917`, peak `4581 MiB`;
    no timeout and no memory limit.
  - This is a large memory improvement versus earlier wide-anchor peaks around
    `5.5 GiB`, but it still does not close P06.
- Debug ledger for the same route:
  - `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T19-45-14-379Z.json`
  - bounded, elapsed `150819ms`, gap `292366`, peak `3894 MiB`.
  - Top unclosed remains `PastelPalettes/cool/performance`, status
    `large-gap-event-skip-seeding`, abort `candidate-fill-soft-limit`, counts
    `[200000,80879,50858]`.
  - Event-root probe tightened the upper from `10094161.912` to `9780538`, but
    residual gap remained `293577`; `anchorFrontierProofTriggerCount=0`.
  - Interpretation: after compacting high-pair records, the leading blocker is
    the event-root probe's cheap upper / candidate-fill frontier, not the JS
    object array memory spike alone.

Candidate-limit and shared-pair follow-up:

- Raising event-root candidate soft limit to `600000` did not help:
  - `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T19-49-46-761Z.json`
  - bounded, elapsed `160622ms`, gap worsened to `333869`, peak `4677 MiB`.
  - Decision: do not continue by widening the event-root candidate limit.
- Retried shared pair-upper after compacting high-pair records, then removed the
  uncommitted code again:
  - cache entries `2`, high-pair cap `2200000`:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T19-58-10-044Z.json`;
    bounded, elapsed `141915ms`, gap `278368`, peak `3874 MiB`, max source
    shifted to `right-unseen`.
  - cache entries `1`, high-pair cap `5000000`:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T20-01-30-598Z.json`;
    bounded, elapsed `159582ms`, gap worsened to `296759`, peak `5529 MiB`.
  - Decision: compact builder makes shared pair-upper runnable, but its quality
    gain is too small and higher record guards reintroduce memory pressure. Do
    not promote or keep this option.

Current conclusion:

- Keep the compact high-pair record builder: it is behavior-equivalent and
  materially reduces peak memory in hard P06 probes.
- Stop the following routes for P06: more event-root candidate limit, larger
  high-pair cap, shared pair-upper, per-anchor bitset refine, old low-memory
  high-pair prefix/scan, and longer cheap-upper timeboxes.
- Next proof work should target the remaining event-root frontier upper itself,
  especially the `right-unseen` / `left-unseen` residual after generated-pair
  conflict split. A viable patch should reduce unseen slot upper bounds without
  repeating expensive per-entry full slot-upper searches.

Anchor-limited unseen upper rejection:

- Tested an uncommitted opt-in that replaced cheap-upper's global slot
  `peekUpperBound` with a per-anchor safe upper excluding the anchor card ids.
- Result:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T20-13-48-143Z.json`.
  Bounded, elapsed `164874ms`, gap worsened to `344640`, peak `5550 MiB`.
- The cheap-upper processed only `5456` anchors before the local timebox,
  compared with roughly `14k` anchors in the compact-builder baseline. The max
  residual source remained `right-unseen`.
- Decision: remove the uncommitted code. Per-anchor full slot-upper calls are
  too expensive for this frontier; the next unseen-upper attempt needs a
  cheaper shared certificate or a coarse reusable bound, not per-anchor
  recomputation.

40-case validation caveat after compact builder:

- A single-process 40-case run was started:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T20-19-28-460Z-partial.json`.
- It was stopped at `29/40` because the process working set reached about
  `6.35 GiB`, and later rows began failing from accumulated heap pressure.
- Completed rows at stop time:
  - `25/29` exact.
  - True or suspected hard rows in that partial:
    `P03:323`, `P06:323`, `P07:260`.
  - `P08:none` was bounded only in the single-process partial, but isolated
    rerun proved exact.
- Decision: do not use one long same-process matrix as the acceptance source
  for 40-case exactness. The acceptance runner needs per-case or batched
  process isolation, or the report must clearly mark same-process heap
  pollution.

Isolated hard-case checks after compact builder:

- `P08:none` isolated:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T21-06-32-716Z.json`.
  Exact, elapsed `116217ms`; previous bounded in the partial was runner heap
  pollution.
- `P03:323` isolated:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T21-08-51-145Z.json`.
  Bounded, elapsed `300104ms`, gap `429277`, peak `2132 MiB`, abort
  `solve-timeout`; solve elapsed `238654ms`.
- `P07:260` isolated at `memorySoftLimitMiB=6144`:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T21-02-55-485Z.json`.
  Bounded, elapsed `166581ms`, gap `62165`, peak `6150 MiB`,
  `memoryLimited=true`, abort `pair-upper`.
- `P07:260` isolated at `memorySoftLimitMiB=7168`:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T21-14-41-907Z.json`.
  Bounded, elapsed `300033ms`, gap `25235`, peak `6897 MiB`, abort
  `initial-candidate`; memory no longer limited, but 300s still insufficient.

Current hard-case classification:

- `P03:323`: time/solve-order problem, not memory. The solve phase consumes
  most of the 300s budget with low heap usage.
- `P06:323`: proof-frontier upper problem around
  `PastelPalettes/cool/performance`, not memory after compact builder.
- `P07:260`: mixed memory/time problem. Raising the soft limit removes the
  memory abort and narrows the gap, but it still needs a faster proof path to
  finish under 300s at production-safe settings.

P03 solve-order fix:

- Added a benchmark-only `exactCandidateJoinSolveOrderVariant` diagnostic
  switch and used it to test exact join slot orders.
- Default before the fix effectively used `middle-largest-smallest` for
  `P03:323`; it timed out:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T21-08-51-145Z.json`,
  bounded, `300104ms`, gap `429277`, solve elapsed `238654ms`.
- Forced `smallest-largest-middle` was not enough:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T21-32-00-911Z.json`,
  bounded, `300375ms`, gap `427413`; pair count dropped but third fallback word
  scan grew sharply.
- Forced `smallest-middle-largest` succeeded:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T21-37-41-752Z.json`,
  exact, `188863ms`.
- Code fix: raise the smallest-third heuristic lower bound from `5000` to
  `10000`, so very small smallest lists drive the first join instead of being
  held for the third slot.
- Default validation after the fix:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T21-46-27-720Z.json`,
  exact, `153968ms`, peak `1946 MiB`.

Updated hard-case classification after P03 fix:

- `P03:323` is closed under the current 300s no-GC settings.
- Remaining confirmed hard cases: `P06:323` and `P07:260`.

P07 failed follow-ups after P03 fix:

- `enableLowMemoryHighPairScan=true`:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T21-50-44-264Z.json`.
  Bounded, `300009ms`, gap `296599`, peak `3185 MiB`, abort
  `candidate-fill-generator-aborted`. It solves memory but spends `253290ms`
  in candidate fill and worsens the gap.
- `enableLowMemoryHighPairPrefixUpper=true`,
  `lowMemoryHighPairPrefixRecordLimit=500000`:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T21-56-27-818Z.json`.
  Bounded, `165524ms`, gap `62165`, peak `6151 MiB`,
  `memoryLimited=true`; no improvement over default.
- `enableSameCoarseLowRootFirstProofOrder=true`:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T22-00-05-950Z.json`.
  Bounded, `168545ms`, gap `62929`, peak `6149 MiB`,
  `memoryLimited=true`; no meaningful change.
- Decision: P07 is not solved by existing low-memory high-pair scan/prefix or
  low-root-first ordering. It needs a different pair-upper memory strategy or a
  way to close the small remaining gap without holding the high-memory pair
  structures until the soft limit trips.

2026-06-11 06:17 CST P07 production-safe cache-lifecycle probe:

- Implemented an opt-in exact candidate generator cache-lifecycle switch:
  `optimization.exactCandidateJoinScoreCacheClearInterval`.
- Behavior: after the generator evaluates the configured number of complete
  score-only slot teams, it clears the deterministic per-slot score calculation
  cache (`judgeLists`, base score/rate maps, skill multiplier/rate maps,
  resolved skill cache, and skill-window maps). It does not call `global.gc`,
  does not alter candidate ordering, does not change upper-bound formulas, and
  does not advance or truncate the proof frontier.
- Default is `null`, so default production behavior remains no-op until the
  option is explicitly enabled for benchmark validation.
- New profiling fields:
  `exactCandidateJoinScoreCacheClearCount` and
  `exactCandidateJoinLastScoreCacheClearInterval`.
- Hypothesis: `P07:260` early `pair-upper` memory pressure is at least partly
  caused by score calculation cache growth during generator/global-pruning
  leaf evaluations. If correct, a moderate interval should convert the 6144 MiB
  memory abort into a lower-peak proof attempt without relying on
  `--expose-gc`.
- Validation plan:
  1. Run `P07:260` isolated at the standard no-GC 6144 MiB settings with
     intervals such as `2000`, `1000`, and `500`.
  2. Accept this route only if memory-limited abort disappears without causing
     a worse 300s bounded gap or score instability.
  3. If a single-case interval passes, rerun the hard set before considering a
     full 40-case confirmation.

2026-06-11 07:12 CST P07 closed, P06 still frontier-bounded:

- Added guarded same-coarse low-root proof scheduling:
  `sameCoarseLowRootFirstProofMaxGroupRootGap`.
  - Default remains old behavior when unset.
  - For experiments, `enableSameCoarseLowRootFirstProofOrder=true` plus
    `sameCoarseLowRootFirstProofMaxGroupRootGap=350000` lets small/medium-gap
    same-coarse groups prove their low-root siblings first, while avoiding the
    P06 failure mode where a large first frontier consumes the full 300s
    budget.
- `P07:260`, no-GC, 6144 MiB, `exactCandidateJoinScoreCacheClearInterval=2000`,
  guarded low-root max group gap `350000`:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T23-04-05-939Z.json`
  - Result: exact, `295823ms`, score `8568618`, peak `6026 MiB`,
    `timedOut=false`, `memoryLimited=false`.
  - Interpretation: P07 is now closed in isolated single-case validation, but
    the margin is only about 4s, so it still needs hard-set repeat validation
    before being counted as stable.
- Guard calibration rejected:
  - `sameCoarseLowRootFirstProofMaxGroupRootGap=200000` and the first `350000`
    attempt before threshold fallback both failed because sorting-time threshold
    could be `-Infinity`; the guard now falls back to current/seed-pass best
    score.
  - Unbounded old low-root exacted P07 but made P06 spend the full budget in
    the first large frontier, so it must not be used directly as an acceptance
    setting.
- `P06:323`, same guarded settings:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T23-09-27-925Z.json`
  - Result: bounded, `114940ms`, score improved to `9488172`, gap `285649`,
    peak `4113 MiB`, `timedOut=false`, `memoryLimited=false`.
  - Event-root probe: unproved `large-gap-event-skip-seeding`; upper tightened
    from about `10094162` to `9773821`, residual gap `286860`, max source
    `right-unseen`.
  - Interpretation: P06 is no longer an incumbent-quality or memory problem in
    this run. The remaining blocker is still the event-root frontier's unseen
    upper certificate for `PastelPalettes/cool`, especially the right-unseen
    residual after generated-pair refinement.
- Current hard-case status:
  - Closed in isolated validation: `P03:323`, `P07:260`.
  - Still open: `P06:323`.
  - Next useful P06 work should target a reusable or cheaper unseen-upper
    certificate for the event-root frontier. Do not continue by widening
    candidate limits, extending seed/warmup, or enabling unguarded low-root
    ordering.

2026-06-11 07:24 CST P06 unseen-refine parameter rejection:

- Correct option name for the cheap-upper unseen refine path is
  `eventRootFrontierProbeAnchorCheapUpperRefineUnseen`. A diagnostic using
  `anchorFrontierCheapUpperRefineUnseen` did not actually enable the path and
  should not be counted as evidence.
- Correctly enabled unseen refine with the standard `30000ms` cheap-upper
  timebox:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T23-17-09-106Z.json`
  - Result: bounded, `119660ms`, score `9488172`, gap `307999`,
    peak `4081 MiB`, `timedOut=false`, `memoryLimited=false`.
  - It lowered unseen components but shifted the max source to
    `generated-pair`; split refinement hit `timebox`, so the final upper
    worsened versus the guarded baseline.
- Correctly enabled unseen refine with `eventRootFrontierProbeAnchorCheapUpperTimeboxMs=120000`:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T23-20-21-262Z.json`
  - Result: bounded, `149108ms`, score `9488172`, gap `285649`,
    peak `4039 MiB`, `timedOut=false`, `memoryLimited=false`.
  - Max source returned to `right-unseen`; residual upper remained
    `9773821`, essentially matching the guarded baseline despite more local
    time.
- Decision: do not pursue unseen refine by only increasing its timebox or
  generated-candidate count. The remaining P06 gap needs a new proof
  certificate or a different event-root frontier decomposition, not another
 parameter increase on the current cheap-upper refine.

2026-06-11 07:50 CST P06 high-pair proof diagnostics:

- Raising only `eventRootFrontierProbeCandidateSoftLimit` to `600000` under the
  guarded/high-incumbent settings did not change the effective frontier:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T23-25-04-516Z.json`
  - Result: bounded, `121610ms`, score `9488172`, gap `285649`,
    peak `3877 MiB`.
  - Candidate counts stayed `[33502, 81424, 51220]`, cheap upper stayed
    `9773821`, and max source stayed `right-unseen`.
  - Decision: do not pursue P06 by raising the event-root probe candidate soft
    limit.
- Debug ledger with the current guarded baseline:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T23-32-31-415Z.json`
  - The only meaningful unclosed frontier remains
    `PastelPalettes/cool/performance`.
  - The event-root probe hits slot0 `candidate-fill-soft-limit` at `200000`
    candidates. Cheap upper tightens from about `10094162` to `9773821`, but
    leaves residual gap `286860`.
  - Full anchor proof is skipped by `high-pair-record-upper`; the estimated
    high-pair record count is `2237752`, just above the experimental
    `2200000` guard.
- Raising `eventRootFrontierProbeAnchorProofMaxHighPairRecords` to `2500000`
  did not start proof:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T23-36-04-518Z.json`
  - The count exceeded the new guard as well (`2542900`), so the true high-pair
    record count is larger than the current narrow guard window.
- A diagnostic patch now lets explicit `enableLowMemoryHighPairScan=true`
  bypass the high-pair bitset guard for anchor proof and use the existing scan
  fallback inside the proof query. Default behavior is unchanged.
- Scan fallback diagnostic:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T23-44-14-685Z.json`
  - Result: bounded, `198698ms`, score `9488172`, gap `605990`,
    peak `2497 MiB`.
  - Anchor proof triggered and used the 120s timebox, but processed `0`
    anchors before timing out. It is therefore too slow to be an accepted P06
    route.
  - Code follow-up: when an opt-in full anchor proof times out, keep the
    already tighter cheap-upper observed bound instead of letting the looser
    proof residual replace it.
- Current conclusion: P06 should not move forward by wider candidate limits,
  larger high-pair record guards, or scan-based full anchor proof. The next
  viable direction is a cheaper certificate for the `right-unseen` pair upper
  or a different event-root frontier decomposition that avoids spending a full
  anchor proof on the first unresolved anchor.

2026-06-11 08:07 CST P06 targeted pair-proof rejection:

- Added an opt-in cheap-upper targeted pair proof diagnostic:
  `eventRootFrontierProbeAnchorCheapUpperTargetedPairProofTimeboxMs`,
  `eventRootFrontierProbeAnchorCheapUpperTargetedPairProofMaxEntries`, and
  `eventRootFrontierProbeAnchorCheapUpperTargetedPairProofCandidateLimit`.
  It tries to refine only the currently top residual-upper anchor entries
  instead of proving the whole anchor frontier from the first anchor. Default is
  off.
- Diagnostic A, `maxEntries=16`, `candidateLimit=120000`, per-entry timebox
  `30000ms`, cheap-upper timebox `90000ms`:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-10T23-57-23-376Z.json`
  - Result: bounded, `139420ms`, score `9488172`, gap `285649`,
    peak `3630 MiB`.
  - Targeted proof attempted and processed `16` entries, no timeout, no upper
    improvement, abort reason `candidate-limit`. Pair slots grew to
    `[120000, 76811]`.
- Diagnostic B, `maxEntries=4`, `candidateLimit=200000`, per-entry timebox
  `45000ms`, cheap-upper timebox `120000ms`:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T00-00-38-377Z.json`
  - Result: bounded, `169103ms`, score `9488172`, gap `285649`,
    peak `3888 MiB`.
  - Targeted proof attempted and processed `4` entries, no timeout, no upper
    improvement, abort reason `candidate-limit`. Pair slots grew to
    `[200000, 122898]`.
- Decision: do not continue P06 by raising targeted pair-proof candidate
  limits. This route is cheaper than full anchor proof, but still fails to
  convert the `right-unseen` upper into a certificate. The next direction
  should focus on a different upper-bound decomposition for unseen pair
  frontiers, likely slot-level/card-conflict aware, rather than generating
  larger pair prefixes.

2026-06-11 08:30 CST P06 residual-source and targeted BNB rejection:

- Added cheap-upper residual-source diagnostics:
  `exactCandidateJoinLastAnchorFrontierCheapUpperResidualSource`,
  `exactCandidateJoinLastAnchorFrontierCheapUpperUnprocessedAnchorScore`, and
  `exactCandidateJoinLastAnchorFrontierCheapUpperUnprocessedPairUpper`.
- Guarded baseline with residual-source fields:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T00-21-43-357Z.json`
  - Result: bounded, `112203ms`, score `9488172`, upper `9773821`,
    gap `285649`, peak `4129 MiB`.
  - Open configuration `PastelPalettes/cool/performance`:
    cheap upper `9773821`, cheap gap `286860`, processed anchors `14319`,
    residual source `unprocessed-anchor`,
    `unprocessedAnchor=2805208`, `unprocessedPair=6968613`.
  - The processed max was only `9636601`
    (`right-unseen`, `2804735 + 6831866`), so the remaining blocker is not the
    processed entry that targeted pair proof tried to refine. It is the
    unprocessed anchor suffix plus global pair upper.
- Full-score targeted pair BNB diagnostic:
  - Raw A:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T00-11-21-733Z.json`
  - `maxEntries=4`, BNB limits `8192/500000`, all `4` calls completed and all
    `4` improved their processed-entry pair upper, but P06 stayed bounded with
    the same `9773821` upper and `285649` gap.
  - Raw B:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T00-14-26-547Z.json`
  - `maxEntries=16` also completed and improved all processed entries, but
    still left the same gap while raising elapsed time to `182220ms` and peak
    working set to `5715 MiB`.
  - Decision: per-anchor BNB is useful as a diagnostic, but not as the next
    quality route. It only improves already processed entries and does not
    touch the suffix-dominant upper.
- Control-flow diagnostic:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T00-25-43-018Z.json`
  - A patch that repeats processed-entry refine before stopping and continues
    if the stop condition becomes invalid did not change P06: bounded,
    score `9488172`, upper `9773821`, gap `285649`, processed anchors `14319`,
    residual source still `unprocessed-anchor`.
  - Decision: the stop condition was not the active bug. Do not continue by
    adding more refine passes.
- Current P06 proof math:
  - With the suffix still using global pair upper `6968613`, the unprocessed
    anchor upper must fall to about `2519559` to prove against incumbent
    `9488172`.
  - The current cheap upper stops at `2805208`, so the remaining required drop
    is roughly `285649`. That is too large for small parameter tweaks or
    pointwise processed-entry repairs.
- Next accepted direction:
  - Build a reusable, conservative certificate for the unprocessed anchor
    suffix: either lower the suffix pair upper under safe shared conditions, or
    switch to a full-score-aware generated-join proof that can close the same
    frontier without widening candidate limits.
  - Keep targeted pair proof, targeted BNB, wider K, larger high-pair guards,
    and scan fallback as diagnostic-only unless new ledger evidence shows a
    different case where they close the dominant residual.

2026-06-11 09:35 CST P06 suffix cover and solve-shortlist diagnostics:

- Added opt-in suffix-cover diagnostics for the cheap upper:
  `eventRootFrontierProbeAnchorCheapUpperSuffixCover` plus profiling fields for
  suffix candidate count, distinct banned-card count, suffix upper, elapsed
  time, and abort reason. Default is off.
- Suffix-cover diagnostic:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T00-48-00-762Z.json`
  - Result: bounded, `117964ms`, score `9488172`, upper `9773821`,
    gap `285649`, peak `4171 MiB`.
  - The suffix cover scanned `185681` generated suffix anchors and only needed
    `232` distinct single-card pair-upper lookups in `676ms`, but its upper was
    still `9773821`.
  - Decision: single-card suffix exclusion is cheap and useful as a diagnostic,
    but too loose to close P06. It should remain opt-in only.
- 800k event-root prefix without solve-shortlist changes:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T00-51-28-926Z.json`
  - Result: bounded timeout, `316900ms`, score `9488172`, upper `10082483`,
    gap `594311`, peak `3223 MiB`.
  - Dominant open config `PastelPalettes/cool/performance`: counts
    `[679552,193143,50858]`, pair upper `6054ms`, fill `73613ms`, solve
    `199639ms`.
  - Solve counters: `pairCount=3706880`, `thirdQuery=416450`,
    `extendedThirdShortlistQuery=200000`, `extendedThirdShortlistFallback=416450`,
    `thirdFallbackWordScan=561304783`.
  - Decision: wider event-root prefix is not acceptable while solve fallback is
    this expensive.
- Rejected pair-frontier solve-order diagnostic:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T01-00-23-409Z.json`
  - Result: bounded timeout, `316972ms`, same score/upper/gap, peak `3224 MiB`.
  - It reduced some fallback attempts but raised `pairCount` to `148430848`; the
    third fallback remained dominant. The experimental solve branch was removed
    before commit.
- Added opt-in solve-shortlist parameters:
  `exactCandidateJoinExtendedThirdShortlistSize`,
  `exactCandidateJoinExtendedThirdShortlistCacheEntryLimit`, and
  `exactCandidateJoinExtendedThirdShortlistQueryLimit`. Defaults preserve the
  existing constants (`2048`, `8192`, `200000`), and the effective values are
  recorded in profiling/trace.
- Extended-shortlist diagnostic A (`8192/8192/200000`):
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T01-17-58-154Z.json`
  - Result: bounded timeout, `316571ms`, score `9488172`, upper `10082483`,
    gap `594311`, peak `3344 MiB`.
  - Fallback word scan improved from `561304783` to `394492843`, but solve
    still spent `198758ms` and timed out.
- Extended-shortlist diagnostic B (`8192/32768/1000000`):
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T01-26-02-637Z.json`
  - Result: bounded timeout, `318884ms`, peak `3526 MiB`.
  - Fallback word scan collapsed to `14815644`, but solve still spent
    `200945ms`; the cost moved to building and caching many 8192-entry
    shortlists.
- Extended-shortlist diagnostic C (`4096/32768/1000000`):
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T01-33-07-837Z.json`
  - Result: bounded timeout, `316907ms`, peak `3333 MiB`.
  - Fallback word scan was `76852942`, but solve remained `199124ms`.
- Decision:
  - Do not continue by larger shortlist size/cache/query defaults. The
    parameter sweep confirms the bottleneck can be moved from bitset fallback
    scanning into shortlist construction without closing proof.
  - Keep the new parameters as research-only instrumentation for future A/B,
    not as a default quality path.
  - Next viable route should be a proof-oriented generated-join certificate for
    the unprocessed anchor suffix, or a much more selective shortlist builder
    that only expands for second candidates proven to dominate the remaining
    score frontier.

2026-06-11 09:55 CST P06 multi-card suffix-cover diagnostic:

- Added opt-in multi-card suffix-cover mode:
  `eventRootFrontierProbeAnchorCheapUpperMultiCardSuffixCover`. It only takes
  effect when `eventRootFrontierProbeAnchorCheapUpperSuffixCover=true`.
  Defaults are off.
- The diagnostic replaces the single-card pair upper min with a conservative
  whole-anchor-card-set upper:
  - exact/generated pair upper through the existing high-pair record query
    with all anchor card ids banned;
  - left/right unseen slot upper with all anchor card ids banned;
  - the final pair upper is the max of generated-pair and generated+unseen
    terms, so it remains an upper and cannot participate in exact proof
    unsafely.
- Raw:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T01-47-42-400Z.json`
- Result: bounded, `135932ms`, score `9488172`, upper `9773821`,
  gap `285649`, peak `3864 MiB`, no global timeout.
- The multi-card suffix cover processed only `1` suffix anchor before local
  cheap-upper budget ran out. It built `210` high-pair record sets in
  `10604ms`; suffix-cover elapsed for the final call was `5024ms`, abort
  reason `timebox`.
- Decision:
  - Full multi-card suffix cover is too expensive as a direct route.
  - The blocker is now clearer: a sound full-card exclusion upper exists, but
    invoking slot upper plus pair-record proof per suffix anchor cannot scale
    to the `185681` generated suffix anchors observed in P06.
  - Do not raise this timebox or default-enable the mode. The next route must
    amortize the proof, for example by grouping suffix anchors by a smaller
    shared risk signature, or by proving a global generated-pair threshold once
    and reusing it across the suffix.

2026-06-11 10:15 CST P06 generated-pair suffix join classification:

- Added opt-in generated-pair suffix join diagnostic:
  `eventRootFrontierProbeAnchorCheapUpperSuffixGeneratedPairJoin`. Default is
  off and the result is diagnostic-only; it does not change the observed proof
  upper yet.
- The diagnostic builds high left/right generated pair records once above the
  threshold needed to beat the incumbent, then queries the best compatible
  suffix anchor for each record. This proves the generated-pair part of the
  suffix frontier without per-anchor pair proof.
- Raw:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T01-56-48-111Z.json`
- Result: bounded, `201103ms`, score `9488172`, upper `9773821`,
  gap `285649`, peak `3913 MiB`, no global timeout.
- Generated-pair suffix join completed:
  - suffix anchors: `185681`
  - high generated pair records: `242120`
  - elapsed: `71289ms`
  - generated-pair suffix upper: `9486961`
  - incumbent: `9488172`
- Interpretation:
  - The generated-pair component is already below incumbent by `1211`, so it is
    not the remaining P06 blocker.
  - The cheap upper remains `9773821` because the active source is still
    `unprocessed-anchor` with pair unseen upper `6968613`; the processed max is
    also `right-unseen`.
  - `exactCandidateJoinPairUnseenUpperByExcludedSlot[0]` equals
    `6968613`, confirming the remaining proof gap is the suffix
    anchor + generated-side + unseen-slot upper, not generated pair conflicts.
- Next accepted direction:
  - Build an amortized suffix unseen proof:
    `suffix anchor + generated left -> right unseen upper` and the symmetric
    side, with shared risk grouping or threshold ordering so slot-upper calls
    are not made per suffix anchor.
  - Do not spend more work on generated-pair join itself until unseen proof can
    consume its result; the generated-pair join is useful evidence but not yet a
    standalone exactness improvement.

2026-06-11 10:25 CST P06 processed-unseen refine check:

- Existing option checked:
  `eventRootFrontierProbeAnchorCheapUpperRefineUnseen=true` with
  `eventRootFrontierProbeAnchorCheapUpperUnseenRefineMaxGeneratedCandidates=512`
  and generated-pair suffix join also enabled.
- Raw:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T02-03-38-543Z.json`
- Result: bounded, `215579ms`, score `9488172`, upper `9773821`,
  gap `285649`, peak `4086 MiB`.
- Processed-entry unseen refine did work:
  - attempts: `1082`
  - generated candidates scanned: `26082`
  - improvements: `870`
  - abort: `null`
  - processed max source stayed `right-unseen`, but dropped to
    `3054218 + 6547626 = 9601844`.
- Tradeoff:
  - generated-pair suffix join timed out in this run (`22183ms`, abort
    `timebox`) because processed-unseen refine consumed the cheap-upper budget.
  - The upper still remained dominated by the unprocessed suffix.
- Decision:
  - Per-entry unseen refine is directionally useful but too local and too
    expensive to combine naively with suffix proof.
  - The next algorithm patch should amortize unseen proof globally across the
    suffix, not simply raise `unseenRefineMaxGeneratedCandidates` or apply the
    current per-anchor refine loop to `185681` suffix anchors.

2026-06-11 10:40 CST P06 suffix unseen join breakthrough and new blocker:

- Added opt-in suffix unseen joins:
  - `eventRootFrontierProbeAnchorCheapUpperSuffixUnseenSingleCardJoin`
  - `eventRootFrontierProbeAnchorCheapUpperSuffixUnseenFullJoin`
- Single-card join diagnostic:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T02-12-56-922Z.json`
  - Result: bounded, `125647ms`, score `9488172`, upper `9773821`,
    peak `3982 MiB`.
  - The high-risk suffix generated+unseen frontier was only `6802` pairs and
    completed in `3529ms`.
  - Upper improved conceptually to about `9652070`, but this was still above
    incumbent and was not yet applied to proof.
- Full-card join diagnostic:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T02-18-42-870Z.json`
  - Result: bounded, `163527ms`, peak `4122 MiB`.
  - The same `6802` high-risk pairs completed in `28219ms`.
  - Left/right suffix unseen upper both fell to `9486961`, below incumbent
    `9488172`.
- Combined suffix generated-pair + full-card unseen join:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T02-23-21-874Z.json`
  - Result: bounded, `260835ms`, score `9488172`, global upper `9935586`,
    peak `3818 MiB`.
  - For `PastelPalettes/cool/performance`, the active tight upper fell from
    `9773821` to `9636601`; residual source became processed `right-unseen`.
  - The suffix generated-pair upper was `9486961` in `80420ms`; suffix
    full-card unseen upper was also `9486961` in `32116ms`.
- New blocker:
  - The original single-configuration suffix blocker is no longer dominant.
  - Global bounded status is now dominated by same-coarse siblings, especially
    `PastelPalettes/cool/visual`, which kept a `dfs-remaining` remembered upper
    of `9935585` after same-coarse skip.
  - `PastelPalettes/cool/technique` also remains around `9636601`.
- Decision:
  - The suffix join route is promising and should not be discarded.
  - The next patch should address same-coarse scheduling/reuse: once one
    `PastelPalettes/cool/*` parameter gets a tight event-root proof, siblings
    need either their own reduced proof pass or a safe parameter-aware reuse of
    the suffix frontier diagnostics. Without that, time shifts from the first
    parameter to same-coarse skipped siblings.

2026-06-11 10:55 CST P06 450s same-coarse confirmation:

- Raw:
  `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T02-32-08-251Z.json`
- Options:
  - same suffix generated-pair + full-card unseen join path as the 300s
    combined run.
  - `HHWX_REAL_PROFILE_DURATION_MS=450000`.
- Result:
  - bounded, score `9488172`, global upper `9636601`, gap `148429`.
  - elapsed about `262397ms`; this was not a simple full-duration timeout.
  - completed configurations stayed `0`; root-pruned configurations reached
    `99`.
- Top unclosed configurations:
  - `PastelPalettes/cool/performance`: status
    `large-gap-event-skip-seeding`, upper `9636601`, gap `149640`.
  - `PastelPalettes/cool/technique`: status `exact-unproved-skip-dfs`,
    abort `solve-dominated-same-coarse-frontier`, upper `9636601`, gap
    `148429`, `frontierRetryCandidate=true`.
  - `PastelPalettes/cool/visual`: status `exact-unproved-skip-dfs`,
    abort `solve-dominated-same-coarse-frontier`, upper `9636601`, gap
    `148429`, `frontierRetryCandidate=true`.
  - Next blockers are `Morfonica/cool/*` dominated-root entries around
    `9631450`, `9612038`, and `9606848`.
- Interpretation:
  - The 450s run rules out the narrow explanation that the 300s run failed only
    because same-coarse siblings did not have enough remaining wall time.
  - Suffix proof now closes the original unprocessed-suffix blocker, but the
    same-coarse sibling path retains or reuses a conservative `9636601` upper
    without completing a proof.
  - The next patch should first make the same-coarse dominated frontier behavior
    explainable and optionally force a sibling proof attempt for diagnosis. A
    cross-parameter proof reuse must be treated as unsafe unless a
    parameter-aware bound can be demonstrated.

2026-06-11 11:45 CST P06 same-coarse and processed-unseen diagnostics:

- Code added as opt-in diagnostics only:
  - `enableSameCoarseFrontierFullProofRetry`
  - `enableSameCoarseFrontierEventProbeBeforeExactJoin`
  - `eventRootFrontierProbeAnchorCheapUpperRefineTopAnchors`
- Full exact-join proof retry:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T02-44-01-657Z.json`
  - Result: bounded timeout, score `9488172`, upper `10076137`, gap
    `587965`, peak `4630 MiB`.
  - `PastelPalettes/cool/technique` consumed the remaining 300s window and
    aborted at `candidate-fill-soft-limit`.
  - Decision: do not use full exact-join retry for same-coarse siblings. It is
    too expensive and regresses proof progress.
- Post-exact event-root probe:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T02-51-13-964Z.json`
  - Result: bounded timeout, score `9488172`, upper `10076137`, gap
    `587965`.
  - `PastelPalettes/cool/technique` did run a post-exact event-root probe, but
    it started after exact-join had already spent about a minute; the probe had
    only about `82s`, did not improve below `9636601`, and ended at
    `candidate-fill-soft-limit`.
  - Decision: post-exact event-root is too late for P06.
- Same-coarse event-root before exact-join:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T03-08-40-038Z.json`
  - Result: bounded timeout, score regressed to `9486961`, upper `10076137`,
    gap `589176`, peak `3849 MiB`.
  - It successfully routed `PastelPalettes/cool/technique` through
    `same-coarse-frontier-skip-seeding` and lowered that sibling to `9633672`,
    but consumed about `135s`; visual then timed out at root.
  - Decision: event-first ordering confirms the proof material can lower a
    sibling, but per-parameter event-root proof is still too expensive and can
    sacrifice incumbent improvement. Do not default this route.
- Wider processed-unseen refine:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T03-22-41-140Z.json`
  - Options added:
    `eventRootFrontierProbeAnchorCheapUpperRefineUnseen=true`,
    `eventRootFrontierProbeAnchorCheapUpperRefineTopAnchors=1024`,
    `eventRootFrontierProbeAnchorCheapUpperUnseenRefineMaxGeneratedCandidates=512`.
  - Result: bounded, not timed out, score `9486961`, global upper `9942430`,
    gap `455469`, root-pruned `99`, peak `2522 MiB`.
  - The focused configuration improved from `9636601` to `9601844`, but that is
    the same effective ceiling previously seen from the narrower processed
    refine route. The residual remained processed `right-unseen`:
    `3054218 + 6547626 = 9601844`.
  - Same-coarse siblings then skipped with large root uppers because only about
    `62s` remained, below the current `90s` same-coarse retry threshold.
- Current interpretation:
  - P06 is not blocked by the unprocessed suffix anymore.
  - P06 is also not solved by spending more on exact-join retry, by moving
    event-root probe earlier, or by simply increasing the number of refined
    processed anchors.
  - The unresolved frontier is processed `generated + unseen`: for high-risk
    processed anchor/generated combinations, the remaining slot upper is still
    too loose.
- Next accepted direction:
  - Build a processed-unseen join analogous to the successful suffix unseen
    join: enumerate only high-risk `processed anchor + generated side` pairs,
    then compute the unseen slot upper excluding the full anchor/generated card
    set.
  - The join must be global over the processed frontier, not top-N per anchor,
    and must stop only when the heap frontier is below the current proof
    threshold or a safe fallback upper is recorded.
  - Keep same-coarse event-first and full-proof retry as diagnostic-only unless
    the processed-unseen join makes each sibling cheap enough to prove within
    the 300s matrix.

2026-06-11 12:05 CST P06 processed-unseen join and targeted-pair diagnostics:

- Processed-unseen join after refined-entry fix:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T03-54-04-983Z.json`
  - Options:
    suffix generated-pair join, suffix full-card unseen join, and
    `eventRootFrontierProbeAnchorCheapUpperProcessedUnseenJoin=true`.
  - Result: bounded but not timed out; elapsed `212442ms`; score `9486961`;
    global upper `9942430`; gap `455469`; root-pruned `99`; peak heap
    `1832 MiB`.
  - The processed-unseen join was active for the focused
    `PastelPalettes/cool/performance` configuration:
    - processed-unseen upper `9635008`.
    - pair count `3`.
    - elapsed `45551ms`.
    - abort reason `null`.
    - residual focused gap `148047`.
  - Interpretation:
    - The implementation now uses refined processed entries and is no longer
      blocked by the stale pre-refine upper.
    - The improvement over the prior `9636601` frontier is only `1593` score.
      The remaining gap is therefore not mainly from generated-plus-unseen
      pairs already reached by this join.
    - Same-coarse siblings still dominate the global bounded result when the
      proof pass leaves less than the current `90s` same-coarse retry budget.
- Targeted pair proof diagnostic:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T03-58-39-172Z.json`
  - Options additionally enabled:
    `eventRootFrontierProbeAnchorCheapUpperTargetedPairProofTimeboxMs=60000`,
    `eventRootFrontierProbeAnchorCheapUpperTargetedPairProofMaxEntries=16`,
    and
    `eventRootFrontierProbeAnchorCheapUpperTargetedPairProofCandidateLimit=200000`.
  - Result: bounded timeout; elapsed `300002ms`; score `9486961`; global upper
    `10082483`; gap `595522`; root-pruned `0`; peak heap `4745 MiB`.
  - Dominant unclosed configuration:
    - `PastelPalettes/cool/technique`, status `exact-after-seeding-timeout`.
    - effective upper `10576782.5`, abort `high-budget-pair-upper`.
    - `anchorFrontierCheapUpper` consumed `250207ms`.
  - The previous focused performance configuration still ended at upper
    `9636601`, but had only about `5s` remaining.
  - Interpretation:
    - The targeted pair proof route is too expensive in its current shape and
      can erase root pruning progress.
    - Do not widen targeted-pair timebox, max entries, or candidate limit as a
      path to 40/40 exact.
- Current P06 conclusion:
  - The following routes are now ruled out as first-class default paths:
    full same-coarse exact retry, post-exact event-root probe, per-parameter
    same-coarse event-root before exact join, wider processed-top-N refine,
    processed-unseen join alone, and brute targeted pair proof.
  - The remaining frontier appears to be an anchor-specific two-slot pair upper
    problem plus proof scheduling across same-coarse siblings, not a seed
    quality problem.
  - Next low-risk direction should be a cheaper certificate for the few
    high-risk anchor-specific pair uppers that remain after suffix and
    processed-unseen joins, or a batched same-coarse event-root proof that
    reuses candidate material without reusing unsafe cross-parameter proof
    conclusions.

2026-06-11 12:35 CST P06 same-coarse scheduling diagnostics:

- Code added:
  - `sameCoarseFrontierRetryMinRemainingMs` as an internal optimization option.
  - Default behavior remains unchanged: if the option is omitted, the existing
    `90000ms` retry gate is used.
  - Trace now records `sameCoarseFrontierRetryMinRemainingMs`.
- Low-root-first widened group diagnostic:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T04-12-04-465Z.json`
  - Options changed:
    `sameCoarseLowRootFirstProofMaxGroupRootGap=700000`, no
    processed-unseen join.
  - Result: bounded timeout; elapsed `300966ms`; score `9486961`; global upper
    `10094162`; gap `607201`; root-pruned `0`; peak `4739 MiB`.
  - `PastelPalettes/cool/visual` ran first and spent about `80s` in candidate
    fill plus `166s` in solve, then aborted `solve-timeout`.
  - Decision: widening low-root-first group order is not a good default path.
    It can move the hard sibling to the front but does not make the proof
    cheaper.
- Same-coarse retry gate at `80000ms`:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T04-20-35-213Z.json`
  - Result: bounded, not timed out; elapsed `229162ms`; score `9486961`;
    global upper `9942430`; gap `455469`; root-pruned `99`; peak `1939 MiB`.
  - The first hard configuration still consumed enough time that
    `PastelPalettes/cool/technique` had only about `71s` remaining, so retry
    did not trigger.
  - Decision: `80000ms` is still too conservative for this case, and the main
    bottleneck remains the first proof pass duration.
- Same-coarse retry gate at `60000ms`:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T04-25-41-255Z.json`
  - Result: bounded, not timed out; elapsed `296905ms`; score `9488172`;
    global upper `9935586`; gap `447414`; root-pruned `99`; peak `3790 MiB`.
  - `PastelPalettes/cool/technique` did trigger retry:
    - status `exact-unproved-skip-dfs`;
    - retry target `9635008`;
    - effective upper `9635008`;
    - `candidateFill` about `10.6s`;
    - `solve` about `25.7s`.
  - Only about `3s` remained afterwards, so `PastelPalettes/cool/visual`
    fell to `bounded-near-deadline-root-skip` with upper `9935585`.
  - Decision: lowering the same-coarse retry gate is useful as a diagnostic and
    can recover the incumbent score, but it is still insufficient for exact.
    It trades almost all remaining time for one sibling proof and leaves
    visual, the original performance residual, and dominated-root groups
    unclosed.
- Current conclusion:
  - Same-coarse scheduling is a secondary bottleneck, not the root solution.
  - To reach 40/40 exact, P06 needs a more general frontier reduction:
    either the first `PastelPalettes/cool/performance` proof must become much
    cheaper while also lowering its `9635008` residual below the incumbent, or
    later skipped configurations need a cheap tight-root/proof path.
  - Dominated-root skips are now a promising next inspection target. They occur
    before slot construction and preserve loose observed roots such as
    `Morfonica/cool/performance` around `9631450`, which is still above the
    incumbent. Any next patch should be opt-in and should avoid forcing full
    exact joins for all skipped configurations unless a cheap tight-root probe
    has already failed.

2026-06-11 12:45 CST P06 dominated-root tight upper diagnostic:

- Code added:
  - `enableDominatedRootSkipTightUpper` as an internal optimization option.
  - `dominatedRootSkipTightUpperMaxGap` limits the root gap range where the
    probe is allowed.
  - Default behavior remains unchanged because the option defaults to `false`.
  - `proofLedger` now includes dominated-root tight-upper diagnostics:
    `dominatedRootSkipTightUpperBound`,
    `dominatedRootSkipTightUpperElapsedMs`,
    `dominatedRootSkipUpperBound`, and `dominatedRootSkipUpperSource`.
- Diagnostic run:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T04-38-38-869Z.json`
  - Options:
    same as the `60000ms` same-coarse retry run, plus
    `enableDominatedRootSkipTightUpper=true` and
    `dominatedRootSkipTightUpperMaxGap=200000`.
  - Result: bounded, not timed out; elapsed `297216ms`; score `9488172`;
    global upper `9935586`; gap `447414`; root-pruned `102`; peak
    `3818 MiB`.
- Probe effect:
  - `Everyone/cool/*` was closed by the dominated tight-root probe:
    - performance `9528295 -> 9460783` in `383ms`;
    - technique `9512760 -> 9443822` in `1291ms`;
    - visual `9506394 -> 9437320` in `260ms`.
  - `Morfonica/cool/*` improved but did not close:
    - performance `9631450 -> 9567497` in `202ms`;
    - technique `9612038 -> 9547102` in `189ms`;
    - visual `9606848 -> 9543807` in `188ms`.
  - Top gap did not change because `PastelPalettes/cool/visual` remained at
    `9935585` after near-deadline root skip.
- Decision:
  - Dominated tight-root probing is a valid low-cost root-frontier improvement
    and should remain available as an opt-in diagnostic.
  - It is not sufficient for P06 exact because the primary gap is still the
    same-coarse PastelPalettes visual sibling, followed by the
    PastelPalettes performance/technique `9635008` residual and Morfonica/cool
    around `9.54-9.57M`.
  - Next proof work should focus on reducing the first PastelPalettes proof
    duration or producing a reusable same-coarse proof artifact that lets
    visual run before the near-deadline skip. After that, dominated tight-root
    can help remove the remaining Morfonica/Everyone tail.

2026-06-11 12:58 CST P06 targeted pair BnB diagnostic:

- Code fix:
  - The existing cheap-upper targeted BnB path computed a local pair-proof
    deadline but passed the global `deadlineAt` into
    `proveMedleyScoreOnlyPairUpperByConflictBnb`.
  - This was corrected so targeted BnB observes the local deadline.
  - The path remains opt-in only.
- Diagnostic run:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T04-50-13-139Z.json`
  - Options:
    same as the dominated tight-root diagnostic, plus
    `eventRootFrontierProbeAnchorCheapUpperTargetedPairProofTimeboxMs=2000`,
    `eventRootFrontierProbeAnchorCheapUpperTargetedPairProofMaxEntries=8`,
    `eventRootFrontierProbeAnchorCheapUpperTargetedPairBnbNodeLimit=1000`,
    and
    `eventRootFrontierProbeAnchorCheapUpperTargetedPairBnbSlotSolveNodeLimit=10000`.
  - Result: bounded timeout; elapsed `300072ms`; score `9488172`; global
    upper `10082483`; gap `594311`; root-pruned `0`; peak `3667 MiB`.
  - Performance configuration regressed to `candidate-fill-deadline` with
    effective upper `9995426`.
  - Technique then timed out at `initial-candidate`.
  - BnB counters showed only one local call:
    `conflictPairUpperBnbCallCount=1`,
    `conflictPairUpperBnbElapsedMs=2000`,
    `conflictPairUpperBnbAbortCount=1`,
    `conflictPairUpperBnbNodeCount=195`,
    `conflictPairUpperBnbBestUpper=6966473`.
- Decision:
  - The local-deadline fix is correct, but targeted pair BnB is not a useful
    default or near-term route for P06.
  - Even a conservative 2s local call can push the first hard configuration
    into a deadline-sensitive path without lowering the residual enough to
    compensate.
  - Keep targeted pair BnB as research-only. Do not combine it into the main
    40/40 acceptance path unless future diagnostics prove it can provide a
    large residual drop under a stricter global guard.

2026-06-11 13:24 CST P06 processed-unseen residual source diagnostic:

- Code added:
  - Processed-unseen cheap-upper now reports the max residual source in
    profiling, configuration trace, proof ledger, and bounded frontier groups.
  - New fields include:
    `anchorFrontierCheapUpperProcessedUnseenJoinMaxSource`,
    `...MaxAnchorScore`, `...MaxGeneratedPairUpper`,
    `...MaxBothUnseenFallbackPairUpper`, `...MaxGeneratedCandidateScore`,
    `...MaxGeneratedUnseenUpper`, `...MaxEntryIndex`,
    `...MaxGeneratedIndex`, and `...MaxUnseenSlotIndex`.
  - Default search behavior is unchanged; this is observation only.
- Baseline diagnostic run:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T05-06-53-506Z.json`
  - Options:
    same as the dominated tight-root diagnostic, without targeted pair BnB.
  - Result: bounded, not timed out; elapsed `296353ms`; score `9488172`;
    upper `9935586`; gap `447414`; root-pruned `102`; peak `3778 MiB`.
  - `PastelPalettes/cool/performance` spent `208070ms`, with
    `candidateFill=201245ms` and cheap-upper `177951ms`.
  - Its residual upper was `9635008`, from
    `processed-unseen-join` max source `both-unseen-fallback`:
    anchor score `2804735` + pair upper `6830273`.
  - `PastelPalettes/cool/technique` reused that residual upper and spent
    another `73172ms` in retry/fill/solve, improving incumbent from
    `9486961` to `9488172`.
  - `PastelPalettes/cool/visual` then had only about `5s` left and was
    skipped as `bounded-near-deadline-root-skip`; it became the top global gap
    at `9935585`.
- Refine-unseen coverage diagnostic:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T05-15-54-471Z.json`
  - Options:
    same as baseline diagnostic, plus
    `eventRootFrontierProbeAnchorCheapUpperRefineUnseen=true` and
    `eventRootFrontierProbeAnchorCheapUpperRefineTopAnchors=20000`.
  - Result: bounded timeout; elapsed `309505ms`; score `9488172`; upper
    `10082483`; gap `594311`; root-pruned `0`; peak `3151 MiB`.
  - The performance residual improved only from `9635008` to `9609395`
    despite `1082` unseen-refine attempts, `11473` scanned candidates, and
    `622` improvements.
  - The extra cheap-upper cost pushed technique to `initial-candidate`
    timeout, so this route is not viable as a default or near-term acceptance
    path.
- Current conclusion:
  - P06 is not seed-limited.
  - The remaining exactness issue is a proof frontier and scheduling problem:
    the first PastelPalettes/cool proof consumes too much of the 300s budget,
    and the current same-coarse retry then spends the remaining useful time on
    technique, leaving visual unproved.
  - Increasing `refineTopAnchors`, targeted pair BnB, or other per-entry pair
    refinement is too expensive for the observed residual drop.
  - Next implementation direction should be same-coarse proof scheduling and
    material reuse: after a first same-coarse sibling produces a residual
    upper, choose the next sibling by global gap/proof impact instead of raw
    configuration order, and avoid letting a lower-impact retry starve the
    highest-gap sibling.

2026-06-11 14:10 CST P06 same-coarse scheduling and prefix diagnostics:

- Code added:
  - `enableSameCoarseFrontierRetryTrailingReserve` and
    `sameCoarseFrontierRetryTrailingReserveMs` as default-off internal
    optimization options.
  - When enabled, a same-coarse retry is skipped if it would leave less than a
    configured reserve window for later unresolved siblings in the same coarse
    group.
  - Trace/proof-ledger fields were added:
    `sameCoarseFrontierRetryTrailingReserve`,
    `sameCoarseFrontierRetryTrailingReserveMs`,
    `sameCoarseFrontierRetryTrailingSiblingCount`,
    `sameCoarseFrontierRetryMaxTrailingSiblingRootGap`, and
    `sameCoarseFrontierRetryWouldStarveTrailingSibling`.
- Trailing reserve diagnostic:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T05-29-04-745Z.json`
  - Options:
    baseline diagnostic options plus
    `enableSameCoarseFrontierRetryTrailingReserve=true` and
    `sameCoarseFrontierRetryTrailingReserveMs=60000`.
  - Result: bounded, not timed out; elapsed `282014ms`; score regressed to
    `9486961`; upper `9942430`; gap `455469`; root-pruned `102`; peak
    `3559 MiB`.
  - Technique was correctly skipped by the guard:
    `sameCoarseFrontierRetryWouldStarveTrailingSibling=true`.
  - Visual received a retry window and spent `44419ms`, but did not improve
    the incumbent or close proof. It retried against target `9942429`, which
    was higher than visual's own root upper `9935585`; this retry had little
    proof value.
  - Decision: reserve guard works as a diagnostic, but it is not enough for
    P06 and should not be defaulted.
- Cheap-upper time allocation diagnostics:
  - `eventRootFrontierProbeAnchorCheapUpperTimeboxMs=150000`:
    raw
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T05-35-16-932Z.json`.
    Result: bounded timeout at `300003ms`; upper `10076137`; gap `587965`.
    Lowering timebox directly caused visual to time out with a much looser
    upper.
  - `enableExactJoinWideAnchorFrontierProbe=false`:
    raw
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T05-42-26-568Z.json`.
    Result: bounded timeout at `300002ms`; upper `10076137`; gap `587965`.
    The same cheap-upper path still ran through event-root frontier proof, so
    this flag does not disable the dominant work.
  - `eventRootFrontierProbeAnchorCheapUpperMaxAnchors=13000`:
    raw
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T05-48-39-310Z.json`.
    Result: bounded, not timed out; elapsed `288317ms`; score `9488172`;
    upper `9935586`; gap `447414`; root-pruned `102`; peak `4052 MiB`.
    Performance residual improved from `9635008` to `9629060`; max
    processed-unseen source remained `both-unseen-fallback`, now at entry
    `5005`.
  - `eventRootFrontierProbeAnchorCheapUpperMaxAnchors=6000`:
    raw
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T05-54-19-936Z.json`.
    Result: bounded timeout at `307507ms`; upper `10082483`; gap `594311`.
    The processed-unseen join did not produce a usable upper and performance
    residual rose to `9835740`.
  - `maxAnchors=13000` plus
    `enableSameCoarseFrontierFullProofRetry=true`:
    raw
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T06-02-22-923Z.json`.
    Result: bounded timeout at `319751ms`; technique alone consumed the
    remaining budget and visual did not start.
- Current conclusion:
  - Fixed timebox reduction and full same-coarse proof retry are not viable.
  - `maxAnchors=13000` is a useful diagnostic improvement, but it still leaves
    visual unproved and does not move P06 to exact.
  - The non-monotonic `maxAnchors` behavior suggests a real algorithmic issue:
    processing more anchor prefix can expose a looser processed
    `both-unseen-fallback` than leaving that tail under suffix cover. A future
    patch should evaluate/retain the best processed-prefix residual instead of
    assuming deeper processed prefix is always tighter.
  - Even with that improvement, P06 likely still needs a more general
    same-coarse proof material reuse or a new decomposition that avoids
    redoing large candidate-fill/proof work separately for performance,
    technique, and visual.

2026-06-11 14:31 CST P06 600s confirmation diagnostics:

- `maxAnchors=13000`, normal skip-after-unproved behavior:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T06-13-53-153Z.json`
  - Result: bounded, not timed out; elapsed `368225ms`; score `9488172`;
    upper `9629060`; gap `140888`; root-pruned `102`; peak `5380 MiB`.
  - PastelPalettes/cool:
    - performance: `214795ms`, upper `9629060`, abort
      `candidate-fill-soft-limit`;
    - technique: `79654ms`, upper `9629060`, abort
      `solve-dominated-same-coarse-frontier`;
    - visual: `50337ms`, upper `9629060`, abort
      `solve-dominated-same-coarse-frontier`.
  - The run ended with about `234s` remaining, so P06 is not merely failing
    because the global 300s deadline is too short. The current proof policy
    intentionally stops at a same-coarse dominated frontier.
  - Later inspection found this "top remaining gap" was a proof-ledger
    reporting bug: `bounded-dominated-root-skip` entries were using the raw
    root upper instead of `dominatedRootSkipUpperBound` as their effective
    frontier upper. The global observed upper for this run remained the
    PastelPalettes frontier `9629060`.
- `maxAnchors=13000` plus
  `disableSkipDfsAfterUnprovedExactCandidateJoin=true`:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T06-21-01-395Z.json`
  - Result: bounded timeout; elapsed `600003ms`; score `9488172`; upper
    `10076137`; gap `587965`; root-pruned `0`; peak `5346 MiB`.
  - DFS spent the remaining budget on PastelPalettes/cool/technique and timed
    out (`dfs-timeout`), so the plain DFS fallback is not a viable exact proof
    path.
- Current conclusion:
  - P06 needs a proof artifact that can close or reduce the shared
    same-coarse PastelPalettes/cool frontier. Morfonica/cool was a diagnostic
    ordering artifact in the ledger summary, not the global upper blocker for
    this run.
  - Increasing runtime alone, forcing DFS, or full same-coarse retry does not
    produce exact.
  - The next useful implementation should target one of:
    1. a safe same-coarse pair/frontier certificate reusable across
       performance/technique/visual;
    2. a best-prefix cheap-upper split that avoids non-monotonic processed
       both-unseen fallback and can stop earlier;
    3. a dominated-root tight-upper/proof path strong enough to close
       Morfonica/cool after PastelPalettes is lowered.

2026-06-11 14:43 CST P06 rewind split diagnostic:

- Code added:
  - `eventRootFrontierProbeAnchorCheapUpperRewindBothUnseen` as a default-off
    diagnostic option.
  - When processed-unseen max source is `both-unseen-fallback`, the diagnostic
    tries a single alternative split before that max entry:
    processed prefix upper + existing suffix cover/join for the remaining
    anchor suffix.
  - Trace fields include:
    `anchorFrontierCheapUpperRewindAttemptCount`,
    `anchorFrontierCheapUpperRewindImprovementCount`,
    `anchorFrontierCheapUpperRewindUpperBound`,
    `anchorFrontierCheapUpperRewindSplitAnchorIndex`,
    `anchorFrontierCheapUpperRewindProcessedEntryCount`,
    `anchorFrontierCheapUpperRewindElapsedMs`, and
    `anchorFrontierCheapUpperRewindAbortReason`.
- Diagnostic run:
  - Raw:
    `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T06-40-35-526Z.json`
  - Options:
    baseline P06 diagnostic options plus
    `eventRootFrontierProbeAnchorCheapUpperRewindBothUnseen=true`.
  - Result: bounded timeout; elapsed `302668ms`; score `9488172`; upper
    `10082483`; gap `594311`; root-pruned `0`; peak `2975 MiB`.
  - Rewind attempted once on performance:
    split anchor index `14420`, processed entry count `12720`, elapsed
    `56268ms`, abort `timebox`, no improvement.
- Decision:
  - The soundness direction is valid, but this implementation is too expensive
    because it recomputes suffix cover/join after the main cheap-upper pass.
  - Keep it default-off and research-only.
  - A useful best-prefix optimization would need incremental/checkpointed
    suffix information or early-stop logic, not an extra full suffix pass at
    the end.

2026-06-11 15:18 CST current no-GC P06/P03 baseline and ledger correction:

- Code committed and pushed:
  - `d800909` fixes proof-ledger effective upper calculation for
    `bounded-dominated-root-skip` by including `dominatedRootSkipUpperBound`.
  - `ea4ca11` preserves partial proof-ledger numeric arrays, so a cutoff array
    like `[2518348, -Infinity, -Infinity]` is reported as
    `[2518348, null, null]` instead of being dropped.
- Current no-GC, non-debug single-case checks with low-memory initial sync left
  default-off:
  - `P06:323` raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T07-02-13-407Z.json`.
    Result: bounded, elapsed `37929ms`, score `9488172`, gap `605990`,
    `timedOut=false`, `memoryLimited=false`, peak `1970 MiB`.
  - `P03:260` raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T07-03-11-779Z.json`.
    Result: exact, elapsed `157761ms`, gap `0`, `timedOut=false`,
    `memoryLimited=false`, peak `3690 MiB`.
- P06 debug-ledger raw after the ledger fixes:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T07-12-56-341Z.json`.
  It is diagnostic-only because `debugConfigurationTrace=true`, but it matches
  the non-debug proof status: bounded, gap `605990`, no timeout, no memory
  limit.
- P06 current blocker details:
  - First unclosed configuration:
    `PastelPalettes/cool/performance`, status `large-gap-event-skip-seeding`.
  - Event-root probe status: `unproved`; upper before/after both
    `10094161.91213159`.
  - Exact join abort: `candidate-fill-soft-limit` on slot `0`.
  - Candidate counts: `[200000, 80879, 50858]`.
  - Slot0 cutoff: `2518348`; slot0 peek at abort: `2616168`.
  - Other upper for slot0: `6968613`, sourced from the pair upper excluding
    slot0; relaxed other upper was `7758278`.
  - Pair upper by excluded slot: `[6968613, 7011517, 6804525]`.
  - Phase time: initial candidate `696ms`, pair upper `5767ms`, candidate fill
    `18169ms`, solve `0ms`, global heap rekey `1844ms`.
- Interpretation:
  - The current primary blocker is P06 only in the checked pair; P03 is exact
    under the same no-GC acceptance-style options.
  - P06 already finds the `9488172` incumbent, so the failure is proof
    conversion. The 200k event-root prefix is far from closing slot0:
    `peek - cutoff = 97820`.
  - Raising candidate K/timebox has already been shown to move the failure from
    candidate fill to solve timeout. The next implementation should not simply
    increase K.
  - The most promising general direction remains a full-score-aware generated
    candidate proof/join path or a reusable pair/frontier certificate that can
    rule out the high slot0 frontier without materializing every slot0
    candidate above the score-only cutoff.

2026-06-11 17:00 CST best-prefix split diagnostic:

- Code added, default-off:
  - `eventRootFrontierProbeAnchorCheapUpperBestPrefixSplit`.
  - `eventRootFrontierProbeAnchorCheapUpperBestPrefixSplitMaxAttempts`.
  - Profiling fields:
    `exactCandidateJoinLastAnchorFrontierCheapUpperBestPrefixSplitAttemptCount`,
    `...ImprovementCount`, `...UpperBound`, `...AnchorIndex`,
    `...ProcessedEntryCount`, `...ElapsedMs`, and `...AbortReason`.
  - Benchmark runner now exports the previously missing cheap-upper detail
    fields: residual source, suffix cover/join fields, processed-unseen max
    fields, rewind fields, and best-prefix split fields.
- Diagnostic run, `P06:323`, no GC, non-debug, 60s cheap-upper timebox:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T08-46-41-552Z.json`
  - Result: bounded, elapsed `164963ms`, score `9488172`, upper `9773821`,
    gap `285649`, no timeout, no memory limit, peak `4241 MiB`.
  - Best-prefix did not run because `processedUnseenJoin` hit the local
    timebox first. Processed-unseen elapsed `42781ms`, abort `timebox`, max
    entry index `12720`; residual source remained `unprocessed-anchor`.
- Diagnostic run, `P06:323`, no GC, non-debug, 120s cheap-upper timebox:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T08-50-40-201Z.json`
  - Result regressed: bounded, elapsed `184035ms`, score `9488172`, upper
    `10076137`, gap `587965`, `timedOut=true`, `memoryLimited=true`, peak
    `4982 MiB`.
  - `processedUnseenJoin` completed with upper `9635008`, but best-prefix split
    only completed `2` attempts, found no improvement, then aborted with
    `processed-unseen-timebox`. Event-root upper remained `9773821`; the global
    result later regressed through `initial-candidate`.
- Default-off no-op confirmation after the code change:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T08-54-48-416Z.json`
  - Result: bounded, elapsed `37950ms`, score `9488172`, gap `605990`,
    `timedOut=false`, `memoryLimited=false`, peak `2852 MiB`.
- Decision:
  - Best-prefix split is not a viable near-term route for P06. It confirms the
    right conceptual issue but still recomputes expensive processed-unseen
    joins per split, so it spends budget and memory before materially lowering
    the frontier.
  - Keep the code path default-off and research-only for now; do not include it
    in acceptance options.
  - Next useful direction should avoid repeated per-split joins. The candidate
    proof must either cache/reuse pair-frontier material across same-coarse
    siblings or use a full-score-aware generated candidate certificate that
    closes the high slot0 frontier in one pass.

2026-06-11 17:12 CST pair-anchor cover diagnostic:

- Code added, default-off:
  - `eventRootFrontierProbeAnchorCheapUpperPairAnchorCover`.
  - `eventRootFrontierProbeAnchorCheapUpperPairAnchorCoverMaxPairs`.
  - Profiling fields:
    `exactCandidateJoinLastAnchorFrontierCheapUpperPairAnchorCoverUpperBound`,
    `...PairCount`, `...DistinctCardCount`, `...ElapsedMs`, and
    `...AbortReason`.
- Purpose:
  - Test a more general one-pass frontier certificate: enumerate high
    slot1/slot2 pairs and bound the unprocessed slot0 anchor suffix after
    banning the pair cards.
  - This avoids increasing slot0 candidate K and avoids recomputing
    processed-unseen joins for multiple split points.
- Diagnostic run, `P06:323`, no GC, non-debug, pair-anchor cover only:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T09-07-27-415Z.json`
  - Result: bounded, elapsed `111981ms`, score `9488172`, upper `9773821`,
    gap `285649`, `timedOut=false`, `memoryLimited=false`, peak `4153 MiB`.
  - Pair-anchor cover completed quickly: upper `9773821`, pair count `1`,
    distinct card count `10`, elapsed `667ms`, abort `null`.
  - Residual source became `unprocessed-anchor-suffix-cover`, but the bound was
    identical to the old unprocessed-anchor upper.
- Decision:
  - Pair-card conflict cover is not the dominant blocker. The highest pair does
    not reduce slot0's anchor upper, so the remaining gap is not primarily a
    cross-slot duplicate-card proof issue.
  - Do not promote pair-anchor cover as an acceptance option.
  - The next useful implementation should be full-score-aware: the current
    upper is still driven by slot0 score-only anchor upper (`2805208`) plus the
    pair upper (`6968613`). Closing P06 needs a certificate that accounts for
    hydration/full-score slack or otherwise bounds the generated candidate
    frontier by final medley result score, not just score-only candidate order.

2026-06-11 17:35 CST score-target slack and K-limit diagnostics:

- Code added, default-off:
  - `exactCandidateJoinZeroScoreTargetSlack`.
  - Profiling fields:
    `exactCandidateJoinScoreTargetZeroSlackCount`,
    `exactCandidateJoinLastSolveScoreSlackUpper`, and
    `exactCandidateJoinLastEffectiveSolveScoreSlackUpper`.
- Rationale:
  - `scoreOnly` candidate evaluation returns the same `averageScore` ranking key
    as full hydration for medley score target. The exact solve previously added
    `maxScore - score` slack unconditionally when pruning generated triples.
  - This was a plausible proof looseness source, but it only affects the
    generated-candidate solve phase.
- Diagnostic run, `P06:323`, no GC, non-debug, zero-score-target slack enabled:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T09-24-25-925Z.json`
  - Result: bounded, elapsed `108675ms`, score `9488172`, upper `9773821`,
    gap `285649`, `timedOut=false`, `memoryLimited=false`, peak `4248 MiB`.
  - Cheap-upper details still show residual source `unprocessed-anchor`.
    Processed max source is `right-unseen`: anchor score `2804735` plus pair
    upper `6831866`; unprocessed suffix is anchor score `2805208` plus pair
    upper `6968613`.
- Diagnostic run, `P06:323`, no GC, non-debug, candidate soft limit raised to
  `300000`:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T09-30-21-832Z.json`
  - Result regressed: bounded, elapsed `82897ms`, score `9488172`, upper
    `10076137`, gap `587965`, `timedOut=true`, `memoryLimited=true`, peak
    `5107 MiB`.
  - Abort reason became `initial-candidate`; the higher K route increased memory
    pressure before closing the frontier.
- Decision:
  - Do not promote zero-score-target slack as a P06/40-exact acceptance option.
    It may remain useful as a diagnostic tightening for generated solves, but it
    does not close the current hard frontier.
  - Do not raise candidate K as the next route. The 300k test confirms the old
    failure mode: more materialized candidates trade a proof gap for memory
    instability.
  - The next viable direction is a low-memory multi-slot frontier certificate:
    stream or certify unseen candidates across the anchor slot and the pair slot
    that currently contributes `right-unseen`, without retaining a second large
    candidate array. A single-slot anchor stream is insufficient because the
    processed-anchor max remains above incumbent until the other-slot unseen
    upper is also lowered.

2026-06-11 17:55 CST local pair-slot extension and pair BnB diagnostics:

- Code added, default-off:
  - `eventRootFrontierProbeAnchorCheapUpperLocalPairSlotExtension`.
  - `eventRootFrontierProbeAnchorCheapUpperLocalPairSlotExtensionSlotIndex`.
  - `eventRootFrontierProbeAnchorCheapUpperLocalPairSlotExtensionMaxCandidates`.
  - `eventRootFrontierProbeAnchorCheapUpperLocalPairSlotExtensionTimeboxMs`.
  - Profiling fields:
    `exactCandidateJoinLastAnchorFrontierCheapUpperLocalPairExtensionSlotIndex`,
    `...AddedCandidateCount`, `...CandidateCount`, `...PeekBefore`,
    `...PeekAfter`, `...ElapsedMs`, and `...AbortReason`.
- Purpose:
  - Test whether the `right-unseen`/`left-unseen` part of the P06 frontier can
    be closed by extending only one pair slot inside cheap-upper, without
    increasing the main exact-join candidate arrays.
- Diagnostic run, `P06:323`, no GC, non-debug, local extension auto slot,
  `maxCandidates=50000`:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T09-43-15-082Z.json`
  - Result regressed: bounded, elapsed `93320ms`, score `9486961`, upper
    `10094162`, gap `607201`, `timedOut=true`, `memoryLimited=true`, peak
    `4843 MiB`.
  - Both pair slots grew by about 50k in the first implementation; the upper
    became dominated by `generated-pair`, so this version was discarded.
- Diagnostic run, `P06:323`, no GC, non-debug, local extension single auto slot,
  `maxCandidates=20000`:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T09-46-10-059Z.json`
  - Result regressed: bounded, elapsed `69702ms`, score `9486961`, upper
    `10082483`, gap `595522`, `timedOut=true`, `memoryLimited=true`, peak
    `4542 MiB`.
  - The auto choice extended the left pair slot (`80879 -> 100879`), while the
    residual source stayed `right-unseen`.
- Diagnostic run, `P06:323`, no GC, non-debug, forced right pair slot index `2`,
  `maxCandidates=20000`:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T09-50-05-966Z.json`
  - Result regressed: bounded, elapsed `69460ms`, score `9486961`, upper
    `10076137`, gap `589176`, `timedOut=true`, `memoryLimited=true`, peak
    `4490 MiB`.
  - It lowered `right-unseen` but shifted the max source to `left-unseen` and
    still exceeded memory budget.
- Diagnostic run, `P06:323`, no GC, non-debug, existing
  `enableConflictPairUpperBnb=true`, headroom gate forced open, node limit
  `200000`:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T09-52-57-620Z.json`
  - Result: bounded, elapsed `122769ms`, score `9488172`, upper `10094162`,
    gap `605990`, no timeout, no memory limit, peak `2916 MiB`.
  - Pair BnB completed cheaply (`835` nodes, `4171ms`) but produced
    `conflictPairUpperBnbBestUpper=7758278`, which is looser than the existing
    exact pair upper `6968613`, so it did not help proof.
- Decision:
  - Do not use local pair-slot extension or pair BnB in acceptance options.
    Local candidate materialization still moves memory in the wrong direction,
    and pair BnB's current upper model is too loose.
  - The remaining general path is not "generate more pair-slot candidates"; it
    must either build a conflict-aware pair/frontier certificate without
    materializing candidate arrays, or tighten the underlying two-slot upper
    model used for `left-unseen`/`right-unseen`.

2026-06-11 18:25 CST pair capacity cap diagnostics:

- Code added, default-off:
  - `eventRootFrontierProbeAnchorCheapUpperPairCapacityCap`.
  - `eventRootFrontierProbeAnchorCheapUpperPairCapacityCapPareto`.
  - `eventRootFrontierProbeAnchorCheapUpperPairCapacityCapBucketed`.
  - Profiling fields:
    `exactCandidateJoinLastAnchorFrontierCheapUpperPairCapacityCapUpperBound`,
    `...CallCount`, `...ImprovementCount`, `...BestImprovement`, and
    `...ElapsedMs`.
- Purpose:
  - Reuse existing two-slot remaining capacity upper instead of materializing
    more pair-slot candidates. For each processed anchor, cap its pair upper by
    `estimateMedleyRemainingScoreUpperBound(pairSlots, bannedAnchorCards, ...)`;
    for the unprocessed anchor suffix, cap by the no-anchor two-slot capacity
    upper.
- Diagnostic run, `P06:323`, no GC, non-debug, fast pair capacity cap, default
  `16384` anchors:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T10-02-24-015Z.json`
  - Result: bounded, elapsed `126834ms`, score `9488172`, upper `9764367`,
    gap `276195`, no timeout, no memory limit, peak `4180 MiB`.
  - Positive signal: gap improved from `285649` to `276195`; max processed
    source became `pair-capacity`.
  - Remaining residual was still `unprocessed-anchor`: next anchor score
    `2795754` plus pair upper `6968613`.
- Diagnostic run, `P06:323`, no GC, non-debug, fast pair capacity cap with
  `maxAnchors=40000`, cheap-upper timebox `120000ms`:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T10-05-37-570Z.json`
  - Result: bounded, elapsed `149404ms`, score `9486961`, upper `9732873`,
    gap `245912`, no timeout, no memory limit, peak `3836 MiB`.
  - Best result so far among safe diagnostics. The residual source became
    `pair-capacity`: anchor score `2782739` plus capped pair upper
    `6950133.095596918`.
- Diagnostic run, `P06:323`, no GC, non-debug, pair capacity cap + pareto,
  `maxAnchors=40000`, cheap-upper timebox `120000ms`:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T10-10-35-117Z.json`
  - Result: bounded, elapsed `189743ms`, score `9486961`, upper `9748585`,
    gap `261624`, no timeout, no memory limit, peak `3896 MiB`.
  - Pareto was slower and processed fewer anchors (`20579`) within the same
    timebox, so it did not beat the fast cap.
- Diagnostic run, `P06:323`, no GC, non-debug, pair capacity cap + bucketed,
  `maxAnchors=40000`, cheap-upper timebox `120000ms`:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T10-16-30-035Z.json`
  - Result: bounded, elapsed `188451ms`, score `9486961`, upper `9742277`,
    gap `255316`, no timeout, no memory limit, peak `3909 MiB`.
  - Bucketed was also slower and did not beat the fast cap.
- Decision:
  - Fast pair capacity cap is the first low-memory route with a real proof-gap
    improvement and no memory regression, but it is still far from exact.
  - Pareto/bucketed variants are diagnostic-only for now: they spend the
    timebox before processing enough anchors and do not close the gap.
  - The next useful optimization is to tighten the two-slot pair-capacity model
    itself, especially for the residual anchor around score `2782739`, or to add
    a targeted certificate that can prove the capped pair upper below about
    `6704222` for that anchor region. More anchor iteration alone cannot close
    the current residual once `pair-capacity` is the max source.

2026-06-11 18:48 CST pair-cap refine and suffix diagnostics:

- Code added, default-off:
  - `pair-capacity` entries now preserve the capacity cap after generated-pair
    split and unseen refine, instead of recomputing the refined pair upper from
    raw generated/unseen components only.
  - `pair-capacity` entries may enter generated-pair split when their generated
    pair component still exceeds the current incumbent target.
  - Suffix-cover pair upper helpers also apply the pair-capacity cap when both
    suffix cover and pair capacity cap are enabled.
- No-op confirmation:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T10-47-37-845Z.json`
  - Default no-GC non-debug `P06:323` remains bounded with score `9488172`,
    gap `605990`, no timeout, no memory limit, peak `1908 MiB`.
- Diagnostic run, `P06:323`, no GC, non-debug, pair capacity cap with
  `maxAnchors=40000`, cheap-upper timebox `120000ms`:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T10-29-36-923Z.json`
  - Result: bounded, elapsed `197621ms`, score `9486961`, upper `9703439`,
    gap `216478`, no timeout, no memory limit, peak `3872 MiB`.
  - This improved the previous best safe pair-cap gap from `245912` to
    `216478`, but still missed the accepted incumbent score `9488172`.
  - Residual source moved back to `unprocessed-anchor`: next anchor score
    `2734826` plus pair upper `6968613`; processed max was `pair-capacity`
    at anchor score `2735084` plus capped pair upper `6950133.095596918`.
- Diagnostic run, pair capacity cap plus suffix generated-pair join and
  full-card unseen join:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T10-34-34-111Z.json`
  - Result: bounded, elapsed `177020ms`, score `9486961`, upper `9703129`,
    gap `216168`, no timeout, no memory limit, peak `3943 MiB`.
  - Suffix joins timed out after the anchor/refine pass consumed the local
    cheap-upper budget, so the improvement was negligible and the residual
    stayed `unprocessed-anchor`.
- Diagnostic run, pair capacity cap plus suffix cover, multi-card suffix cover,
  `maxAnchors=13000`, cheap-upper timebox `120000ms`:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T10-39-02-504Z.json`
  - Result regressed: bounded, elapsed `174011ms`, score `9486961`, upper
    `9780501`, gap `293540`, no timeout, no memory limit, peak `3927 MiB`.
  - Suffix cover scanned `15123` suffix anchors and still hit its local
    timebox without producing an upper; the shorter processed prefix left a
    worse unprocessed-anchor residual.
- Diagnostic run, pair capacity cap plus targeted pair proof
  (`2000ms`, `8` entries):
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T10-43-42-934Z.json`
  - Result: bounded, elapsed `197556ms`, score `9488172`, upper `9704139`,
    gap `215967`, no timeout, no memory limit, peak `3822 MiB`.
  - This kept the accepted incumbent score and slightly beat the cap-preserving
    refine gap, but it still left `unprocessed-anchor` as the residual source:
    next anchor score `2735526` plus pair upper `6968613`.
- Decision:
  - Keep these routes diagnostic-only. They improve proof quality without
    memory regression, but they are still far from the 40/40 exact gate.
  - The current blocker is no longer just processed pair-cap residual. Once
    processed entries are lowered, the unprocessed anchor suffix uses the same
    two-slot pair upper `6968613`, so exact requires either a stronger suffix
    certificate or a tighter two-slot pair upper below roughly `6753k` for the
    high-risk anchor region.
  - Next useful implementation should target a low-memory suffix/pair
    certificate that does not spend the full cheap-upper timebox before suffix
    proof, or a stronger two-slot capacity upper model. Do not promote
    pair-cap/refine, suffix cover, or targeted pair proof into acceptance
    options yet.

2026-06-11 19:10 CST pair-cap suffix budget follow-up:

- Diagnostic run, pair capacity cap plus suffix generated-pair join and
  full-card unseen join, `maxAnchors=40000`, cheap-upper timebox `240000ms`:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T10-50-12-691Z.json`
  - Result regressed: bounded timeout, elapsed `311400ms`, score `9486961`,
    global upper `10076137`, gap `589176`, peak `3341 MiB`.
  - The local event-root proof did improve: suffix generated-pair and both
    suffix unseen joins completed, each at upper `9486961`, and the event-root
    upper after probe was `9652070`.
  - The run then timed out in a later configuration at `initial-candidate`, so
    simply giving suffix proof more time is not viable under the 300s case
    budget.
- Diagnostic run, pair capacity cap plus suffix generated-pair join and
  full-card unseen join, `maxAnchors=13000`, cheap-upper timebox `120000ms`:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T10-56-14-762Z.json`
  - Result regressed: bounded timeout, elapsed `300001ms`, score `9486961`,
    global upper `10076137`, gap `589176`, peak `4053 MiB`.
  - Local event-root upper was `9651238`; residual source was processed
    `pair-capacity` at anchor score `2867043` plus capped pair upper
    `6784194.327945923`.
  - This confirms the suffix certificates can close the unprocessed suffix, but
    the processed pair-capacity frontier remains about `163k` above the
    accepted incumbent.
- Diagnostic run, same `13000/120s` suffix path plus targeted pair proof
  (`3000ms`, `16` entries):
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T11-02-00-879Z.json`
  - Result: bounded, elapsed `191328ms`, score `9488172`, upper `9780501`,
    gap `292329`, no timeout, no memory limit, peak `4204 MiB`.
  - Targeted pair proof preserved the accepted incumbent score, but it starved
    the right-side suffix unseen join, which timed out; residual returned to
    `unprocessed-anchor`.
- Decision:
  - The best local proof shape observed so far is suffix generated-pair plus
    full-card unseen join closing the unprocessed suffix, then leaving a
    processed `pair-capacity` residual around `9651k`.
 - The next implementation should not just reallocate more time among these
    probes. The remaining general blocker is a stronger two-slot pair upper or
    a reusable same-coarse proof artifact that can lower the processed
    pair-capacity residual below the accepted incumbent without starving later
    configurations.

2026-06-11 19:42 CST processed-unseen pair-cap carry-over:

- Finding:
  - `processed-unseen join` did not apply the already-safe pair-capacity cap
    when recording its own `generated-pair`, `both-unseen-fallback`, or
    generated-plus-unseen pair upper candidates.
  - This let raw generated pair uppers re-enter the processed-unseen result
    after the outer processed frontier had already been capped.
- Pre-fix diagnostic, pair-capacity cap plus processed-unseen only,
  `maxAnchors=13000`, cheap-upper timebox `120000ms`:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T11-23-29-787Z.json`
  - Result: bounded, elapsed `147642ms`, score `9486961`, upper `9780501`,
    gap `293540`, no timeout, no memory limit, peak `3836 MiB`.
  - Processed-unseen completed but returned a worse upper `10202743`; max
    source was raw `generated-pair`, anchor score `2818383`, generated pair
    upper `7384360`.
- Code added, default-off in effect:
  - Processed-unseen join now records pair-level uppers through
    `applyPairCapacityCap(...)`, matching the outer processed-entry proof.
  - Optional cheap-upper sub probes now return local `timebox` immediately if
    their local deadline is already exhausted, avoiding avoidable heap/query
    setup after the proof budget is gone.
- Post-fix processed-only diagnostic:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T11-28-00-156Z.json`
  - Result: bounded, elapsed `148219ms`, score `9486961`, upper `9780501`,
    gap `293540`, no timeout, no memory limit, peak `3837 MiB`.
  - Positive signal: processed-unseen upper dropped from `10202743` to
    `9651238`, max source became `pair-capacity`, anchor score `2867043`,
    capped pair upper `6784194.327945923`.
  - Remaining residual stayed `unprocessed-anchor`, as expected without suffix
    proof: next anchor score `2811888` plus pair upper `6968613`.
- Post-fix combined processed-unseen plus suffix diagnostic:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T11-31-06-817Z.json`
  - Result: bounded, elapsed `211079ms`, score `9486961`, upper `9780501`,
    gap `293540`, no timeout, no memory limit, peak `4012 MiB`.
  - Suffix generated-pair closed at upper `9486961`; left suffix unseen also
    closed at `9486961`, but right suffix unseen hit local `timebox`.
    Processed-unseen then also hit local `timebox`, so the final residual
    stayed `unprocessed-anchor`.
- Default no-op confirmation:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T11-37-07-142Z.json`
  - Default no-GC, non-debug `P06:323` remains bounded with score `9488172`,
    gap `605990`, no timeout, no memory limit, peak `1318 MiB`.
- Decision:
  - The carry-over fix is safe and useful: it prevents a diagnostic proof path
    from undoing a tighter pair-capacity upper.
  - It is not sufficient for 40/40 exact. The combined path still needs a
    faster/right-sized suffix unseen certificate and then a stronger processed
    pair-capacity residual below roughly `9488k`.
  - Next practical target is to avoid serially spending the full cheap-upper
    budget on suffix and processed proof. A future proof path should either
    fuse processed/suffix unseen joins or checkpoint shared slot-upper work,
    instead of running them as separate full passes.

2026-06-11 20:03 CST suffix target upper diagnostic:

- Code added, default-off in effect:
  - Suffix generated-pair and suffix generated-plus-unseen joins now accept a
    target upper bound.
  - In cheap-upper finish, the suffix target is raised from `incumbentScore` to
    `max(incumbentScore, processedUpperMax)` when the processed prefix is
    already the dominating residual.
  - This is exact-safe because the combined residual is
    `max(processedUpperMax, suffixUpper)`; proving the suffix to the current
    processed upper is enough when processed is already looser.
- Diagnostic run, pair-capacity cap plus target suffix,
  `maxAnchors=13000`, cheap-upper timebox `120000ms`:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T11-41-34-519Z.json`
  - Result: bounded, elapsed `238064ms`, score `9488172`, global upper
    `9935586`, gap `447414`, no timeout, no memory limit, peak `4039 MiB`.
  - Local proof signal was positive: event-root cheap upper dropped to
    `9651238` in `41859ms`; suffix generated-pair upper `9651238` took
    `4332ms`, and both suffix unseen joins closed at `9651238` in `119ms`.
  - The remaining global gap came from another unclosed frontier, not from the
    local suffix proof cost.
- Diagnostic run, target suffix plus existing same-coarse event-before option:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T11-46-22-719Z.json`
  - Result: bounded, elapsed `203624ms`, score `9486961`, upper `9651238`,
    gap `164277`, no timeout, no memory limit, peak `2950 MiB`.
  - The proof quality improved and same-coarse event probes became affordable,
    but the incumbent regressed from accepted `9488172` to `9486961` because
    this trigger skips normal seeding/exact work before finding the high team.
- Rejected trigger experiments:
  - Target suffix plus `enablePostExactEventRootFrontierProbe=true`:
    raw
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T11-50-27-184Z.json`;
    regressed to `timedOut=true`, `memoryLimited=true`, gap `587965`, peak
    `4489 MiB`.
  - Moving same-coarse event probe after seeding was tested locally and
    reverted before commit. Raw
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T11-54-40-658Z.json`;
    it preserved score `9488172` but hit `timedOut=true`,
    `memoryLimited=true`, gap `587965`, peak `4985 MiB`.
- Decision:
  - Keep suffix target upper: it is a safe local proof-cost reduction and a
    useful building block.
  - Do not promote same-coarse event-before, post-exact event probe, or the
    reverted after-seeding trigger. The first sacrifices incumbent quality; the
    latter two trigger memory/timeout regression.
  - The remaining exact blocker is still the processed pair-capacity residual
    around `9637k`-`9651k`. To reach exact, the next proof patch must lower the
    two-slot pair upper by roughly `150k`-`165k` without relying on skipped
    seeding or manual GC.

2026-06-11 20:20 CST two-slot capacity skill-floor check:

- Code added:
  - The fast two-slot card-bound capacity upper now reuses
    `calculateSkillScoreUpperBoundsForPower(...)` for the selected card skill
    contribution, matching the floor-aware skill score cap already used by the
    general card-bound upper.
  - The cache is slot-scoped through a `WeakMap<MedleySlotSearch, Map<...>>`.
    A first per-call-context cache version was rejected because it added enough
    allocation churn to turn the target diagnostic into `memoryLimited=true`.
- Default no-GC, non-debug no-op confirmation:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T12-19-29-480Z.json`
  - `P06:323` remains bounded with score `9488172`, gap `605990`,
    `timedOut=false`, `memoryLimited=false`, peak `1317 MiB`.
- Diagnostic rerun, pair-capacity cap plus target suffix,
  `maxAnchors=13000`, cheap-upper timebox `120000ms`:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T12-09-39-123Z.json`
  - Result: bounded, elapsed `238692ms`, score `9488172`, global upper
    `9935586`, gap `447414`, no timeout, no memory limit, peak `3989 MiB`.
  - Local event-root upper improved only from about `9651238` to
    `9650685`. The capped pair upper moved from about `6784194.33` to
    `6783641.46`, only about `553` points.
  - Interpretation: skill-floor slack exists but is far too small; the useful
    target remains a much stronger two-slot pair-capacity certificate or a
    proof-order/memory-lifecycle change that avoids leaving the same residual.
- Rejected and reverted during the same check:
  - Always computing both the fast card-bound upper and the basic two-slot
    capacity upper, then taking `min`, was not viable in this high-frequency
    pair-cap path. Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T12-16-44-050Z.json`.
  - It did not further reduce the local upper (`pair-capacity` stayed around
    `6783641.46`) and regressed to `timedOut=true`, `memoryLimited=true`, peak
    `4991 MiB`.
- Decision:
  - Keep the slot-cache floor-aware skill cap as a small safe tightening.
  - Do not continue the basic-min variant.
  - Do not spend the next optimization cycle on skill-floor refinements; they
    are two orders of magnitude smaller than the remaining `150k`-`165k`
    residual.

2026-06-11 20:27 CST same-coarse event-before incumbent preservation:

- Code added, still opt-in through the existing
  `enableSameCoarseFrontierEventProbeBeforeExactJoin` path:
  - Before running the same-coarse event-root probe, the search now calls
    `reevaluateCurrentBestForSameCoarseConfiguration(...)`.
  - This is not proof and does not change default behavior; it only preserves a
    cheap incumbent that the older pre-seeding probe skipped.
- Default no-GC, non-debug no-op confirmation:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T12-27-21-934Z.json`
  - `P06:323` remains bounded with score `9488172`, gap `605990`,
    `timedOut=false`, `memoryLimited=false`, peak `1236 MiB`.
- Same-coarse event-before diagnostic rerun:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T12-23-05-503Z.json`
  - Result: bounded, elapsed `223104ms`, score `9488172`, global upper
    `9650685`, gap `162513`, no timeout, no memory limit, peak `3490 MiB`.
  - Compared with the earlier same-coarse event-before run
    (`temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T11-46-22-719Z.json`),
    the incumbent regression is fixed: score improved from `9486961` to the
    accepted `9488172`. The sibling reevaluation hit once and contributed
    `1211` points.
  - Last same-coarse event probe reached local upper `9636799`, residual gap
    `148627`, with source `unprocessed-anchor-suffix-cover`; the run remains
    globally bounded because another remembered frontier still sits at about
    `9650685`.
- Decision:
  - Keep this opt-in fix. It makes the same-coarse proof path usable for
    future proof experiments because it no longer trades away incumbent quality.
  - It is still not sufficient for 40/40 exact. The next useful diagnostic is a
    proof-ledger run on this variant to identify the remaining `9650685`
    frontier, then target that frontier instead of increasing seed/probe
    timeboxes.

2026-06-11 21:45 CST rejected P06 upper refinements:

- Processed-unseen join rerun on the current same-coarse event-before setup:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T13-16-48-262Z.json`.
  - Options: event-root probe, same-coarse event-before, pair-capacity cap,
    suffix generated-pair join, suffix full-card unseen join, and
    `eventRootFrontierProbeAnchorCheapUpperProcessedUnseenJoin=true`.
  - Result: bounded, score `9488172`, global upper `9935586`, gap `447414`,
    elapsed `245675ms`, peak `3382 MiB`, no timeout, no memory limit.
  - Local cheap upper was `9641834` with residual gap `153662`, elapsed
    `84241ms`, source `pair-capacity`. The processed-unseen join spent
    `36183ms`, produced upper `9641834`, and had `0` high-risk pairs.
  - Decision: reject for this target. It does not close the residual and costs
    enough time that another same-coarse remembered upper dominates the global
    result.
- Refine-unseen rerun on the same setup:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T13-22-16-009Z.json`.
  - Result: bounded, score `9488172`, global upper `9650685`, gap `162513`,
    elapsed `283525ms`, peak `3400 MiB`, no timeout, no memory limit.
  - Local cheap upper stayed at `9636799`, residual gap `148627`, elapsed
    `75869ms`, source `pair-capacity`. This matches the accepted local proof
    quality but is materially slower.
  - Decision: reject for default or acceptance use. It is a local diagnostic
    only and does not improve the proof frontier enough to justify the wall
    time.
- A local uncommitted processed-generated-pair join was tried and reverted:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T13-30-28-739Z.json`
    and
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T13-35-15-038Z.json`.
  - Results: both bounded with score `9486961`, gap `607201`,
    `timedOut=true`, `memoryLimited=true`, peak about `4490 MiB`, and
    `eventRootFrontierProbeCallCount=0`. Both aborted the first exact join at
    `candidate-fill-generator-aborted`.
  - A same-option baseline check in that uncommitted code state also regressed:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T13-38-22-490Z.json`
    returned score `9486961`, gap `607201`, `timedOut=true`,
    `memoryLimited=true`, peak `4492 MiB`, with the same first-configuration
    `candidate-fill-generator-aborted` abort.
  - Decision: do not treat these raws as algorithm-improvement evidence. The
    hook was reverted, and the only useful lesson is that adding another
    generated-pair proof surface can perturb the first exact join into the
    memory wall before the event-root probe even runs.
- Updated direction:
  - Do not continue increasing event-root probe timebox, processed-unseen
    joins, refine-unseen joins, targeted pair BnB, or continuation after
    unproved event-root probes.
  - The next useful change should be lower-memory and proof-oriented: identify
    which same-coarse remembered frontier keeps the global upper at `9650685`,
    then tighten or split that frontier without allocating another large
    candidate/pair surface.
  - Any further local proof experiment must first pass a no-op confirmation
    against the clean branch state; otherwise it is too easy to mistake
    runner/environment perturbation for an algorithm signal.

2026-06-11 22:50 CST P06 cheap-upper minimum remaining diagnostic:

- Code added, default-off:
  - New internal option
    `eventRootFrontierProbeAnchorCheapUpperMinRemainingMs`.
  - It separates the minimum remaining budget for cheap upper estimation from
    the heavier anchor frontier proof budget.
  - Default behavior is unchanged: when the option is absent, cheap upper uses
    the same remaining-budget gate as full anchor frontier proof.
  - When the option is set lower than
    `eventRootFrontierProbeAnchorProofMinRemainingMs`, exact join may run only
    cheap-upper and return its conservative observed upper, then skip the
    heavier pair proof if the full proof budget is unavailable.
- Clean-branch no-op confirmation without the new option:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T13-49-37-989Z.json`.
  - Same optimization JSON as the accepted `P06:323` same-coarse event-before
    setup, but without the new cheap-min option.
  - Result: bounded, score `9488172`, global upper `9935586`, gap `447414`,
    elapsed `241335ms`, peak `3815 MiB`, `timedOut=false`,
    `memoryLimited=false`.
  - Interpretation: the previous first-configuration memory-wall raws were not
    present in clean branch state. However, runtime variance left only about
    `58666ms` before the last same-coarse event probe, so cheap-upper ran only
    `2` times and the last probe did not improve upper.
- Opt-in diagnostic with
  `eventRootFrontierProbeAnchorCheapUpperMinRemainingMs=30000`:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T14-00-35-417Z.json`.
  - Result: bounded, score `9488172`, global upper `9650685`, gap `162513`,
    elapsed `290463ms`, peak `2970 MiB`, `timedOut=false`,
    `memoryLimited=false`.
  - The third cheap-upper ran: cheap-upper count `3`, improvement count `3`,
    last cheap residual upper `9636799`, residual gap `148627`, source
    `pair-capacity`, cheap elapsed `59111ms`.
  - This stabilizes the diagnostic frontier under low remaining budget, but it
    is not a 40/40 path. It spends nearly the full `300s` case budget and still
    leaves the same `PastelPalettes/cool` pair-capacity residual plus later
    tight-root work unclosed.
- Decision:
  - Keep the option as an opt-in diagnostic/proof-scheduling helper.
  - Do not count it as acceptance progress toward 40/40 exact until a following
    proof patch actually lowers the residual below incumbent and passes hard
    cases.
  - Next work should target the shared `PastelPalettes/cool` pair-capacity
    residual itself, or produce a reusable same-coarse proof artifact, instead
    of only making the third cheap-upper more likely to run.

2026-06-11 23:18 CST P06 cheap-upper witness:

- Code added:
  - Cheap-upper profiling now records the maximum processed residual witness:
    `exactCandidateJoinLastAnchorFrontierCheapUpperMaxAnchorCardIds`,
    `...MaxLeftGeneratedCardIds`, and `...MaxRightGeneratedCardIds`.
  - This is diagnostic-only and does not change pruning or proof semantics.
  - Cheap-only runs now reserve `5000ms` before the exact-join deadline when
    `eventRootFrontierProbeAnchorCheapUpperMinRemainingMs` allows cheap upper
    below the full anchor-proof budget. This is to avoid converting a local
    diagnostic into a global `timedOut=true` result.
- Witness run before adding the `5000ms` reserve:
  - Raw:
    `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-11T14-17-42-151Z.json`.
  - Result: bounded, score `9488172`, global upper `9765696`, gap `277524`,
    elapsed `300005ms`, `timedOut=true`, `memoryLimited=false`, peak
    `3343 MiB`.
  - This is rejected for acceptance and for proof-quality comparison because
    the cheap-only path consumed the global deadline.
- Useful witness extracted from that rejected run:
  - Max anchor cardIds: `[1975,1952,1720,415,1753]`.
  - Max anchor score: `2865962`.
  - Max pair-capacity upper: `6770836.939337965`.
  - Generated pair upper: `7101057`.
  - Left/right generated cardIds were both `[1999,1976,625,1721,1850]`, so
    the best generated pair overlaps exactly; this explains why generated-pair
    evidence alone cannot close the two-slot upper.
  - Left/right unseen uppers were `6629399` and `6641199`, already closer to
    the needed pair threshold, while pair-capacity stayed at `6770836.94`.
- Interpretation:
  - The remaining gap is not caused by a missing high-scoring concrete pair.
    The concrete generated pair overlaps, and the unseen alternatives are lower
    than the pair-capacity certificate.
  - The blocker is the two-slot capacity certificate for the banned anchor
    `[1975,1952,1720,415,1753]`: it still permits a relaxed pair score roughly
    `148k` above what is needed to close the frontier.
  - Next proof patch should target a low-memory two-slot capacity certificate
    for this banned-anchor case, or a reusable same-coarse certificate that
    proves the relaxed capacity witness cannot be realized as two disjoint
    full teams. Do not continue generated-pair-only joins for this residual.
