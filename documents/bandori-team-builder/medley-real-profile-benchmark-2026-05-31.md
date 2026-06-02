# 2026-05-31 Real Profile Medley Benchmark

This report records the first live `user_game_profiles` sample run for medley exact-proof performance. It is a benchmark report, not a raw data dump: profile identifiers are anonymized and no compressed profile payload is stored here.

## Scope

- Source table: `public.user_game_profiles`.
- Live count at sampling time: 181 total profiles, 180 profiles with usable card counts.
- Sample size: 5 real profiles.
- Sampling seed: `2026-05-31-real-profile-medley-v1`.
- Sample card counts: `1308`, `1229`, `1218`, `1469`, `1167`.
- Search scope: all area item configurations, using `coarseAreaItemFilter.mode = "all"`.
- Result limit: `1`.
- Perfect rate: `1`.
- Songs, all expert:
  - `625` 花咲く未来に, Lv25, 712 notes.
  - `225` ブルーバード, Lv25, 605 notes.
  - `76` Determination Symphony, Lv27, 1054 notes.
- Event scenarios:
  - no event
  - event `294`
  - event `305`
  - event `323`

The runner first executes every case with a 60s limit. Cases that do not prove exact global optimality at 60s are re-run independently with a 120s limit. The 120s result is therefore not an extension of the same search process; it is a separate run with a larger budget.

## Artifacts

- Runner: `temp/bandori-team-builder/benchmark-real-profiles-medley.cjs`
- Raw JSON: `temp/bandori-team-builder/real-profile-medley-benchmark-2026-05-31T01-41-06-126Z.json`
- Markdown output: `temp/bandori-team-builder/real-profile-medley-benchmark-2026-05-31T01-41-06-126Z.md`
- Rolling checkpoint: `temp/bandori-team-builder/last-real-profile-medley-benchmark.json`

The `temp/` outputs are intentionally ignored by Git. This document is the durable summary.

## Completion Summary

| scenario | cases | exact <=60s | exact <=120s | bounded after 120s |
| --- | ---: | ---: | ---: | ---: |
| no event | 5 | 0 | 1 | 4 |
| event 294 | 5 | 0 | 1 | 4 |
| event 305 | 5 | 1 | 1 | 4 |
| event 323 | 5 | 0 | 2 | 3 |
| total | 20 | 1 | 5 | 15 |

Only `1/20` cases proved exact within 60s. Even with the relaxed 120s limit, only `5/20` cases proved exact. This is current evidence against treating 60s exact proof as stable for real 1100-1500 card all-configuration pools.

## Case Results

| profile | cards | scenario | 60s exact | 60s gap | 120s exact | 120s gap | final score | final area |
| --- | ---: | --- | --- | ---: | --- | ---: | ---: | --- |
| P01 | 1308 | no event | no | 337936 | no | 296189 | 7712778 | MyGO/happy/technique |
| P01 | 1308 | event 294 | no | 355789 | no | 344490 | 8541631 | Afterglow/happy/technique |
| P01 | 1308 | event 305 | no | 378419 | no | 375062 | 8926216 | Morfonica/pure/visual |
| P01 | 1308 | event 323 | no | 347946 | yes | 0 | 9144199 | PastelPalettes/cool/visual |
| P02 | 1229 | no event | no | 233128 | no | 233128 | 7767673 | PastelPalettes/powerful/performance |
| P02 | 1229 | event 294 | no | 284524 | yes | 0 | 9244053 | Afterglow/happy/performance |
| P02 | 1229 | event 305 | no | 480449 | no | 482185 | 9487721 | Morfonica/pure/visual |
| P02 | 1229 | event 323 | no | 392506 | no | 366388 | 9254978 | PastelPalettes/powerful/performance |
| P03 | 1218 | no event | no | 264613 | no | 264613 | 7806702 | MyGO/pure/visual |
| P03 | 1218 | event 294 | no | 278247 | no | 405941 | 8605026 | MyGO/happy/performance |
| P03 | 1218 | event 305 | no | 358925 | no | 354407 | 7993302 | Morfonica/pure/visual |
| P03 | 1218 | event 323 | no | 226973 | no | 243537 | 8539249 | MyGO/pure/visual |
| P04 | 1469 | no event | no | 258691 | no | 258691 | 8074976 | Roselia/happy/performance |
| P04 | 1469 | event 294 | no | 415532 | no | 414420 | 8930374 | Afterglow/happy/technique |
| P04 | 1469 | event 305 | no | 633404 | no | 633404 | 8987914 | Morfonica/pure/performance |
| P04 | 1469 | event 323 | no | 309980 | no | 309980 | 10089146 | PastelPalettes/cool/performance |
| P05 | 1167 | no event | no | 215919 | yes | 0 | 7983575 | Roselia/pure/technique |
| P05 | 1167 | event 294 | no | 317043 | no | 1238266 | 7867574 | Afterglow/happy/technique |
| P05 | 1167 | event 305 | yes | 0 | yes | 0 | 8873441 | Roselia/pure/technique |
| P05 | 1167 | event 323 | no | 222605 | yes | 0 | 8627472 | Roselia/pure/technique |

Some 120s bounded runs report a larger gap than the corresponding 60s run. This is expected under the current benchmark method because the 120s run is independent: it may find a higher incumbent and also expose a different unresolved configuration upper bound. Treat exact completion as the primary success metric; treat gap as the upper-bound state observed in that specific run.

## Bottleneck Findings

The main bottleneck is still single area-item configuration proof, not just the number of configurations.

60s evidence:

- `19/20` cases finished with an incomplete or aborted configuration.
- `5/20` cases had `startedConfigurations=1`, `completedConfigurations=0`, `rootUpperPrunedConfigurationCount=0`, and an exact-candidate-join abort. In these cases, the first area-item configuration alone consumed the 60s budget.
- `17/20` cases had `exactCandidateJoinAbortCount > 0`.

120s evidence:

- `15/19` rerun cases still finished with an incomplete or aborted configuration.
- `4/19` rerun cases had the first area-item configuration consume the 120s budget without proof.
- All `15` bounded-after-120s cases had `exactCandidateJoinAbortCount=1`.
- Among bounded-after-120s cases, `exactCandidateJoinCandidateFillElapsedMs` reached `110324ms`.
- Among bounded-after-120s cases, `evaluatedTeamCount` reached `767013`.

Interpretation:

- Successful 120s exact cases usually rely on heavy root pruning, commonly `102/108` or `105/108` configurations pruned at root, leaving only a few exact joins to finish.
- Failed cases often enter one hard configuration and spend most of the time in exact-candidate-join candidate fill. Several have `exactCandidateJoinSolveElapsedMs=0`, meaning final join solving never starts.
- The proof blocker is a high-density slot-candidate frontier inside a single configuration. Configuration ordering and root pruning help only when they avoid that frontier entirely.

## Current Engineering Implication

For real 1100-1500 card pools, the current 60s exact-proof target is not stable for all-configuration medley search. The next useful work should target the per-configuration exact proof path:

1. Reduce explicit slot-candidate generation above the cutoff.
2. Add diagnostics that explain candidate-fill thresholds and candidate density per slot.
3. Explore a proof structure that can certify a dense slot frontier without materializing all high-scoring teams.
4. Keep root pruning and inclusion pruning, but do not expect them alone to solve hard all-configuration samples.

Until then, report 60s/120s exact counts separately and keep bounded results clearly labeled with observed upper-bound gaps.

## Hard-Case Benchmark Update

Later on 2026-05-31, the benchmark target was tightened around a fixed hard-case set:

- Fixed local profile fixture: `temp/bandori-team-builder/hard-case-profiles-2026-05-31.json`.
- Fixed songs: `385`, `193`, `619`, all expert.
- Event scenario: no event.
- Search duration: `300000ms`.
- Fixture note: the fixture contains compressed profile payloads and is under ignored `temp/`; this document intentionally keeps only anonymized labels and counts.

Reproduction command shape:

```powershell
$env:HHWX_REAL_PROFILE_SCOPE_MATRIX='1'
$env:HHWX_REAL_PROFILE_FIXTURE_PATH='temp/bandori-team-builder/hard-case-profiles-2026-05-31.json'
$env:HHWX_REAL_PROFILE_SONG_IDS='385,193,619'
$env:HHWX_REAL_PROFILE_EVENT_KEYS='none'
$env:HHWX_REAL_PROFILE_DURATION_MS='300000'
$env:HHWX_REAL_PROFILE_MATRIX_LOCKED_SCOPES='0'
node .\temp\bandori-team-builder\benchmark-real-profiles-medley.cjs
```

Latest all-mode fixed-profile results after the exact-join scan optimizations:

| profile | cards | exact | elapsed ms | gap |
| --- | ---: | --- | ---: | ---: |
| P01 | 1318 | yes | 33524 | 0 |
| P02 | 1252 | yes | 52211 | 0 |
| P03 | 962 | yes | 31189 | 0 |
| P04 | 1522 | yes | 37343 | 0 |
| P05 | 1051 | yes | 174179 | 0 |
| P06 | 961 | yes | 43319 | 0 |
| P07 | 1425 | yes | 103943 | 0 |
| P08 | 972 | yes | 22141 | 0 |
| P09 | 1127 | yes | 163342 | 0 |
| P10 | 1039 | yes | 45423 | 0 |

All-mode completion remains `10/10` exact within 300s. The latest all-mode artifact is `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-05-31T23-40-37-062Z.json`; summary values were `median=43319ms`, `p95=174179ms`, and `max=174179ms`.

Locked-scope evidence for the known P01 hard scope:

| scope | exact | elapsed ms | gap | started configs | completed configs |
| --- | --- | ---: | ---: | ---: | ---: |
| PoppinParty/cool | yes | 115286 | 0 | 3 | 3 |

Trace verification showed that P01 all-mode finishes quickly because `PoppinParty/cool` is root-pruned after a stronger Roselia incumbent is found. In locked mode, that cross-scope incumbent is not a valid reason to skip the subspace, so the exact-candidate-join path must prove the PoppinParty/cool optimum directly. When measured as an isolated locked band/attribute search, the scope currently proves exact within the 120s intermediate target, but it still exceeds the 60s final locked-scope target.

Current medium-term gate:

1. Keep the fixed `P01`-`P10` all-mode set at `10/10` exact within 300s.
2. Keep known hard single configurations exact within 120s. The 60s target is still a next-stage tightening target because the current P05 `PoppinParty/powerful/visual` fixed-duration rerun completed exact but took `64023ms`.
3. Keep the wider locked `band/attribute` scopes under 120s before tightening that target to 60s; isolated `P01/PoppinParty/cool` currently reran at `115286ms`.
4. The remaining largest locked-scope cost is proving multiple parameter configurations in the same band/attribute scope. Single-configuration exact join is now under 120s on the known hard cases, but not yet robustly under 60s.

Tracked benchmark entrypoint:

```powershell
node .\scripts\bandori-medley-hard-case-benchmark.cjs gate-120
node .\scripts\bandori-medley-hard-case-benchmark.cjs all-300
node .\scripts\bandori-medley-hard-case-benchmark.cjs p01-locked
node .\scripts\bandori-medley-hard-case-benchmark.cjs p05-visual
```

The wrapper now asserts the gate after each run. `all-300` must report `10/10`
all-mode exact with max elapsed <= `300000ms`; locked/single hard-case scenarios
must report exact completion with max elapsed <= `120000ms`.

### 2026-05-31 High-Pair Record Generation Fix

The high-pair record builder previously constructed a full forbidden-right-candidate bitset for each left candidate while enumerating high pair records. On dense pair queries this made record generation much slower than the number of emitted records suggested. For P01 `PoppinParty/cool/visual`, one `330073 x 113886` pair query at threshold `4275000` emitted only `194320` records but spent about `38.5s` in the builder.

Changing the builder to scan right candidates directly and use cheap card-overlap checks reduced the hard single-configuration timings:

| case | before | after | main improvement |
| --- | ---: | ---: | --- |
| P01 `PoppinParty/cool/visual` | 115567ms | 92444ms | fill `68418ms` to `48521ms` |
| P05 `PoppinParty/powerful/visual` | 119296ms | 83295ms | fill `56832ms` to `21780ms` |

Rejected follow-up experiment: replacing third-candidate bitset shortlists with direct scans made P05 worse because fallback scans could run too long. Keep the bitset shortlist path for solve until a more bounded pair/third proof structure is designed.

### 2026-05-31 Exact-Join 60s Update

The retained changes after the follow-up optimization pass were:

- Use direct card-id overlap checks instead of allocating a `Set` in exact-join pair scans.
- Store third shortlists as candidate indices, with shortlist size `64`.
- In the solve loop, treat the target as strict improvement over the incumbent (`incumbent + 1`) because scores are integer.
- Specialize the hot third-candidate bitset query and accumulate pair/third profiling counters locally instead of writing profiling fields inside the innermost loops.
- Build forbidden candidate bitsets by collecting the relevant inverted bitsets first and OR-ing them in one pass.
- Keep high-pair cache buckets coarse by default (`25000`), but allow a fine bucket (`10000`) only for very dense estimated high-pair spaces; cache that threshold decision so it is not recomputed for every query.

Latest retained single-configuration hard-case checks:

| case | exact <=60s | elapsed ms | fill ms | solve ms | high-pair records |
| --- | --- | ---: | ---: | ---: | ---: |
| P01 `PoppinParty/cool/visual` | yes | 58152 | 33364 | 18477 | 267252 |
| P05 `PoppinParty/powerful/visual` | yes | 58692 | 17064 | 39095 | 93362 |
| P09 `Morfonica/pure/visual` | yes | 13768 | n/a | n/a | n/a |

Rejected experiments during this pass:

- Lazy non-materialized third shortlist construction: P05 worsened to about `79854ms`.
- Starting fallback third scans after the shortlist prefix: P05 worsened to about `79015ms`.
- High-pair direct-prefix record scans: P01 worsened to about `70341ms`.
- Fixed-OR high-pair record scan branches: P01 worsened to about `68359ms`.
- Skipping pair-complement pruning for partial slot candidates: P01 worsened to about `75719ms`.
- Global `10000` high-pair cache buckets: P01 improved, but P05 regressed to about `68797ms`; the retained version uses an adaptive threshold instead.

### 2026-05-31 P06 Soft-Limit Fix

`P06` was a distinct failure mode. Its exact candidate join hit the default `20000` candidate soft limit quickly, aborted in about six seconds, then fell back to the main DFS and timed out around 300s. A trace run showed:

- `exactCandidateJoinInitialCandidateElapsedMs`: about `1045ms`.
- `exactCandidateJoinCandidateFillElapsedMs`: about `2787ms`.
- `exactCandidateJoinPairUpperElapsedMs`: about `2381ms`.
- configuration status: `dfs-timeout`, with about `293636ms` spent after exact join aborted.

Raising the automatic high soft-limit threshold to include `900-1499` card pools made `P06` exact without manual options:

| profile | cards | before | after |
| --- | ---: | --- | --- |
| P06 | 961 | 300000ms timeout, gap 327758 | 76339ms exact, gap 0 |

Regression spot checks for other 900-card profiles remained exact:

| profile | cards | elapsed ms | exact |
| --- | ---: | ---: | --- |
| P03 | 962 | 37247 | yes |
| P08 | 972 | 28183 | yes |

An experiment re-enabling capacity-complement pruning inside candidate fill was rejected: on `P05` it reached the Node heap limit after about 118s. Keep that path disabled unless it is redesigned to bound memory.

### 2026-05-31 Locked-Scope 120s Update

The retained changes in the latest pass were:

- Raise the automatic exact-join high candidate soft limit to `400000`. The previous `200000` default was not enough for P01/P05 hard configurations, whose observed max slot candidate counts can exceed `320000`.
- Keep seed-neighborhood improvement enabled before exact candidate join, so locked configurations start from a stronger incumbent.
- Use numeric `cardIds` tie-breaking in medley candidate sorting instead of constructing and comparing joined string keys.
- Use a fine high-pair cache bucket of `2500` for dense high-pair spaces.
- Store high-pair record card IDs by referencing the left/right candidate `cardIds` arrays instead of allocating a combined 10-card array for every high-pair record.
- Use indexed card-id overlap loops in the exact-join hot path.

Rejected experiments in this pass:

- Sparse array caches keyed by second-candidate index for best-third and shortlist lookups. P01 visual timed out at 60s because solve throughput dropped to about `929792` scanned pairs before deadline.
- Caching a mutable `cardKey` property on `MedleyTeamCandidate`. This changed object shapes in the hot path and made P01 visual time out at 60s.
- Larger slot-candidate seeding neighborhoods, larger per-slot candidate limits, skipping tight root upper deferral, and skipping wide-root-gap pruning. These either slowed P01 locked or weakened proof progress.

Latest retained checks:

| case | exact | elapsed ms | fill ms | solve ms | pair upper ms | generated candidates | pair scans |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| P01 `PoppinParty/cool/visual` | yes | 54218 | 30119 | 15704 | 2652 | 441562 | 2776713 |
| P01 `PoppinParty/cool` locked | yes | 117577 | 59180 | 40720 | 9550 | 968926 | 7698333 |
| P05 `PoppinParty/powerful/visual` | yes | 57187 | 16944 | 37441 | 1212 | 490625 | 8291854 |
| P09 `Morfonica/pure/visual` | yes | 14637 | 9743 | 816 | 927 | 85779 | 292147 |

The immediate 120s locked-scope gate is now met for the known P01 hard scope, with a small margin. The next target should not be declared as a 60s guarantee yet: P01 visual and P05 visual are both still close to 60s, and P01 locked remains around 116-118s because it must prove three parameter configurations in the same band/attribute scope.

### 2026-05-31 High-Pair Score Array Update

The high-pair record cache now stores a parallel numeric score array. The record list is still retained for card containment indexing, but hot pair-complement scans can return the best available score by index without reading a record object and then its `.score` property. This does not change the proof condition or record ordering.

Current retained spot checks:

| case | exact | elapsed ms | fill ms | solve ms | pair upper ms |
| --- | --- | ---: | ---: | ---: | ---: |
| P01 `PoppinParty/cool/visual` | yes | 54218 | 30119 | 15704 | 2652 |
| P01 `PoppinParty/cool` locked | yes | 117005 | 60154 | 40334 | 8818 |
| P05 `PoppinParty/powerful/visual` | yes | 57074 | 16685 | 37987 | 1085 |
| P09 `Morfonica/pure/visual` | yes | 14637 | 9743 | 816 | 927 |

Rejected in the same pass: replacing the per-query `bannedPairRecordBits` array with fixed local bitset variables. It improved P01 visual slightly (`53233ms`) but made P05 visual too close to the 60s boundary (`59158ms`), so the safer retained state keeps the array path.

Also rejected: caching third-candidate scores plus changing exact-solve shortlist loops to index-based lookup, and then broadening that to several pair/record loops. The first variant did not improve the true hard cases (`P01` visual `54807ms`, `P05` visual `57811ms`, `P09` visual `14574ms`); the broader variant worsened P05 to `59407ms`. Both were reverted.

The latest per-configuration trace for P01 `PoppinParty/cool` showed why the next phase must target cross-parameter proof, not only the single visual configuration:

| parameter | elapsed ms | fill ms | solve ms | pair upper ms | generated candidates | pair scans |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| visual | 53693 | 30010 | 16344 | 2507 | 441562 | 2776713 |
| performance | 34933 | 17297 | 13527 | 3060 | 315476 | 2333217 |
| technique | 27592 | 12847 | 10463 | 3251 | 211888 | 2588403 |

The locked 60s target requires making the post-visual `performance` and `technique` proofs much cheaper, or sharing proof work across the three parameter configurations. Optimizing the visual single configuration alone cannot close the remaining gap.

### 2026-06-01 Follow-Up Rejected Experiments

No code change was retained from this follow-up pass. The goal was to find a safe way to reduce locked band/attribute scope time without changing the exact proof condition.

Rejected experiments:

- Sharing `ScoreCalculationCache` across the three locked parameter configurations by `band:attribute:songIndex`. This was exactness-safe in principle because score cache keys include chart/combo/perfect rate and, where needed, `bandPower`; however it regressed P01 `PoppinParty/cool` locked from about `117005ms` to `130468ms`. The trace worsened on all three parameters: visual `61449ms`, performance `38615ms`, technique `29533ms`.
- Replacing the second-slot `bestThirdByCardIds` linear lookup with the existing third-candidate bitset/shortlist lookup. P05 `PoppinParty/powerful/visual` failed the 60s exact gate (`60015ms`, bounded), with solve still about `38362ms`; pair scans dropped, but third-query overhead offset the gain.
- Adding a shortcut that directly uses the second slot's best third-slot candidate when it also avoids the first slot. P05 still failed the 60s exact gate (`60217ms`, bounded), with solve about `38531ms` and third-query count increasing further.
- Enabling the existing anchored join branch with debug anchor slots `0`, `1`, and `2` on P05. All three failed the 60s exact gate; the branch avoided normal candidate fill but spent about `57s` in anchored solve and did not prove the configuration.
- Increasing the third-candidate shortlist from `64` to `128`. P05 failed the 60s exact gate (`60006ms`, bounded); fill was about `17957ms`, solve about `39229ms`. The larger shortlist reduced pair scans but added enough shortlist work to lose overall throughput.
- Rechecking pair-root proof after high-budget candidate-fill pair refinements. This was exactness-safe, but did not trigger meaningful early proof on P01 `PoppinParty/cool`: locked elapsed was `116689ms` with the same generated candidate and pair-scan counts as the retained path. P05 also stayed near the same boundary (`58165ms`), so the extra check was reverted.
- Running the fuller capacity root proof before locked exact join, including Pareto/card-specific root bounds for high-card locked scopes. This was also exactness-safe, but P01 `PoppinParty/cool` regressed to `142567ms`. The tighter proof upper bounds were still about `6.87M`, above the `6.63M` incumbent, so performance and technique could not be root-pruned and exact join still had to run.
- Reusing the candidate-fill high-pair record upper inside the final triple solve. This was exactness-safe as an upper check, but P05 `PoppinParty/powerful/visual` reached the Node heap limit after about `140s`. The solve-stage thresholds can require far larger pair-record materialization than candidate fill, so this path should stay disabled unless the record builder gains a hard memory cap or streaming representation.
- Increasing the third-candidate shortlist from `64` to `128` was retested against the current P01 locked gate. It kept P05 exact under 120s (`65197ms`) but worsened P01 `PoppinParty/cool` to `132667ms`, mainly by increasing solve time, so the retained shortlist remains `64`.
- Forcing the debug anchored exact-join path with anchor slot `0` on P01 `PoppinParty/cool` reached the Node heap limit after about `94s`. The anchored path is not suitable as an automatic locked-scope strategy without a memory cap.

The local benchmark runner now also supports a fixed-duration single-case mode: when `HHWX_REAL_PROFILE_DURATION_MS` is set outside scope-matrix mode, it runs exactly once with that limit and stores the result as `resultFixed`. This avoids misclassifying near-60s exact cases as bounded when the goal is to record complete 300s behavior. With the retained code, P05 `PoppinParty/powerful/visual` has completed exact in fixed-duration mode, but the latest rerun took `64023ms` (`fill 18656ms`, `solve 42559ms`, `pairUpper 1238ms`). Treat this as 120s-gate evidence, not as a stable 60s guarantee.

Conclusion: the retained implementation is still the stronger local optimum for the tested solve hot paths. The next useful optimization should be proof-level, not another local loop/cache tweak: either share a certificate across the locked `visual/performance/technique` configurations, or derive a tighter post-incumbent upper bound that can prove the non-winning parameters without full candidate fill and solve.

### 2026-06-01 Gate Revalidation

The tracked wrapper `scripts/bandori-medley-hard-case-benchmark.cjs` now pins the local hard-case scenarios without tracking real profile payloads and asserts the target gate after each run. A wrapper smoke run for `p09-visual` completed exact in `15553ms` and passed the `120000ms` assertion.

An earlier scope-matrix run measured `P01/PoppinParty/cool` after an all-mode run in the same process and took `130446ms`. The tracked `p01-locked` scenario now measures the isolated locked band/attribute search directly, matching the goal's single locked-subspace gate. The latest isolated locked wrapper run completed exact in `115286ms`. The trace was:

| parameter | elapsed ms | fill ms | solve ms | pair upper ms | generated candidates | pair scans |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| visual | 53281 | 30003 | 15889 | 2669 | 441562 | 2776713 |
| performance | 33864 | 17067 | 12790 | 3064 | 315476 | 2333217 |
| technique | 27142 | 13308 | 9583 | 3223 | 211888 | 2588403 |

This means the current code proves the hard isolated locked scope under 120s, but with a small margin. The next tightening target remains proof-level reduction of the non-winning parameter configurations.

The tracked `gate-120` scenario now also includes the P01 single-configuration
`performance` and `technique` cases, because independent single-configuration
search can be harder than the same parameter after a stronger locked-scope
incumbent has already been found.

### 2026-06-01 Exact-Join Trace Diagnostics

The retained code now records exact-join proof diagnostics in `configurationTrace` when `debugConfigurationTrace` is enabled:

- per-slot best initial candidate scores
- pair upper and pair-unseen upper by excluded slot
- pair-root upper
- per-slot candidate cutoffs, relaxed other-slot upper, remaining-capacity upper, and final other-slot upper
- per-slot generated candidate counts and candidate-fill elapsed time

This is diagnostic only; it does not change the search path or proof condition.

Latest retained spot checks after adding the trace fields:

| case | exact | elapsed ms | note |
| --- | --- | ---: | --- |
| P01 `PoppinParty/cool` locked | yes | 115844 | under 120s, still not 60s |
| P01 `PoppinParty/cool/performance` | yes | 66191 | under 120s, still not 60s |
| P01 `PoppinParty/cool/technique` | yes | 38258 | under 60s |
| P05 `PoppinParty/powerful/visual` | yes | 56805 | under 60s in this rerun |
| P09 `Morfonica/pure/visual` | yes | 14335 | under 60s |

The latest P01 locked trace shows why the next optimization must improve proof strength rather than local scan throughput:

| parameter | elapsed ms | pair-root upper | candidate counts by slot | candidate cutoffs by slot |
| --- | ---: | ---: | --- | --- |
| visual | 54766 | 6878863 | `322867 / 111510 / 7185` | `1884438 / 2088807 / 2227553` |
| performance | 33922 | 6881531 | `229007 / 80428 / 6041` | `1894862 / 2098068 / 2237226` |
| technique | 26156 | 6869665 | `149300 / 52416 / 10172` | `1908980 / 2110892 / 2249513` |

The incumbent after visual is `6628539`, but the pair-root uppers for performance and technique remain about `240k`-`253k` above that threshold. Their basic skill-aware root uppers also remain around `6.95M`, so the current root-bound family cannot prune them before exact join.

Rejected in this diagnostic pass:

- Enabling capacity-complement pruning during candidate fill. P01 `PoppinParty/cool` timed out at `300125ms` and never finished visual proof; candidate fill alone consumed about `291150ms`.
- Replacing the second-slot best-third linear lookup with the existing third-candidate shortlist/bitset lookup. P01 locked regressed to `154233ms`, with solve time roughly doubling on all three parameters.
- Tightening the basic root leader contribution by requiring the leader card to be selected. This lowered P01 basic root uppers by only about `17k`, still far above the incumbent, and the locked run slowed to `119685ms`, too close to the 120s gate.
- Using the full normal greedy seed pass for locked high-budget searches instead of the fast locked seed pass. One run improved P01 locked to `106948ms` by proving technique first and then shortening visual, but the cleaned repeat was `117609ms`; the saved time was not stable and did not move the scope toward 60s.

Conclusion: ordinary loop/cache changes and current root-bound tightening are exhausted for this hard scope. The next candidate change should either share a proof certificate across the locked `visual/performance/technique` configurations or introduce a complement-aware upper that can lower the non-winning parameter pair-root frontier before full candidate fill.

### 2026-06-01 Candidate-Fill Capacity Skip and Solve Allocation Update

The retained follow-up changes are local exactness-preserving speedups:

- In high-budget exact candidate join, skip the optional remaining-capacity/Pareto upper during candidate fill when the excluded-slot exact pair upper is already finite. On P01 hard cases this upper was looser than the pair upper and cost several seconds without changing any cutoff.
- Keep first-candidate forbidden bitsets as local scratch buffers in final solve instead of retaining them in WeakMaps. First candidates are visited once, so caching their second/third bitsets only raised peak memory and GC pressure.
- Remove the small temporary array inside forbidden-bitset construction and use fixed local bitset variables.
- Avoid sorting exact-join duplicate candidate keys; candidates from the same slot generator are produced in stable `searchCards` order.
- Minor final-solve loop cleanup: combine deadline checks and reuse `firstScore + secondScore`.

Current retained spot checks:

| case | exact | elapsed ms | fill ms | solve ms | note |
| --- | --- | ---: | ---: | ---: | --- |
| P01 `PoppinParty/cool/performance` | yes | 58519 / 58507 | 27271 | 20219 | consecutive reruns under 60s |
| P01 `PoppinParty/cool/visual` | yes | 47897 | n/a | n/a | under 60s |
| P01 `PoppinParty/cool/technique` | yes | 28351 | n/a | n/a | under 60s |
| P05 `PoppinParty/powerful/visual` | yes | 61389 | 17330-17619 | 40417-41491 | still not a stable 60s case |
| P09 `Morfonica/pure/visual` | yes | 9715 | n/a | n/a | under 60s |
| P01 `PoppinParty/cool` locked | yes | 112966 | 53962 total | 40937 total | under 120s, still not 60s |

The P01 locked trace after these changes was:

| parameter | elapsed ms | fill ms | solve ms | pair upper ms | generated candidates | pair scans |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| visual | 47103 | 22833 | 16035 | 2959 | 441562 | 2776713 |
| performance | 37476 | 17729 | 15490 | 3191 | 315476 | 2333217 |
| technique | 27198 | 13400 | 9412 | 3368 | 211888 | 2588403 |

Rejected during this pass:

- First-shortlist reverse lookup before full third-bitset fallback. P01 performance regressed to `79059ms`.
- Strict `incumbent + 1 - otherUpper` candidate-fill cutoff. It removed only five P01 performance candidates and did not improve runtime.
- Direct linear construction of third shortlists. P01/P05 worsened because overlap checks outweighed avoided bitset construction.
- Increasing third shortlist size from `64` to `96`. P05 remained around `61087ms`, with almost unchanged third-query count.

Conclusion: the single-configuration hard cases are close, but not yet a guaranteed 60s set because P05 visual remains just above the boundary. The wider locked band/attribute target is still much farther away: P01 `PoppinParty/cool` needs about `113s` because it proves three parameter configurations. The next useful optimization is still proof-level sharing or a tighter post-incumbent upper for non-winning parameters, not more local loop tuning.

### 2026-06-01 Typed Third-Shortlist Revalidation

The retained solve-path follow-up stores third-candidate shortlists in a fixed `Uint32Array` plus a count instead of allocating a fresh JavaScript number array for each second-candidate lookup. This keeps the exact proof condition unchanged and only reduces allocation/GC pressure in the final triple solve.

Latest fixed-duration hard-case checks:

| case | exact | elapsed ms | fill ms | solve ms | pair upper ms | generated candidates | pair scans | third queries |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| P01 `PoppinParty/cool/visual` | yes | 50339 | 25068 | 16570 | 3039 | 441562 | 2771967 | 1031840 |
| P01 `PoppinParty/cool/performance` | yes | 54817 | 24701 | 20229 | 3134 | 491650 | 2871565 | 1063013 |
| P01 `PoppinParty/cool/technique` | yes | 28618 | 12551 | 5778 | 3477 | 217170 | 2669681 | 894181 |
| P05 `PoppinParty/powerful/visual` | yes | 56971 | 15984 | 38275 | 1179 | 490625 | 8288278 | 4198769 |
| P09 `Morfonica/pure/visual` | yes | 10283 | 5061 | 909 | 1068 | 85779 | 291850 | 225164 |
| P01 `PoppinParty/cool` locked | yes | 113091 | 54551 total | 39673 total | 10503 total | 968926 | 7683949 | 2734583 |

The P01 locked band/attribute trace remains three separate parameter proofs:

| parameter | elapsed ms | fill ms | solve ms | pair upper ms | generated candidates | pair scans | third queries |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| visual | 49629 | 24966 | 16393 | 2974 | 441562 | 2771967 | 1031840 |
| performance | 35549 | 17473 | 13788 | 3276 | 315476 | 2328967 | 844043 |
| technique | 26843 | 12112 | 9493 | 4253 | 211888 | 2583015 | 858700 |

Latest all-mode 10-profile fixed sample, with locked-scope rows disabled in the matrix runner, completed `10/10` exact within the 300s duration. Artifact: `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-01T01-53-53-059Z.json`.

| profile | cards | all exact | all elapsed ms | final area |
| --- | ---: | --- | ---: | --- |
| P01 | 1318 | yes | 34172 | Roselia/pure/performance |
| P02 | 1252 | yes | 51623 | PoppinParty/pure/technique |
| P03 | 962 | yes | 19533 | PoppinParty/pure/visual |
| P04 | 1522 | yes | 39579 | Roselia/happy/visual |
| P05 | 1051 | yes | 179085 | PoppinParty/powerful/visual |
| P06 | 961 | yes | 38736 | Roselia/pure/performance |
| P07 | 1425 | yes | 101405 | PoppinParty/pure/visual |
| P08 | 972 | yes | 21301 | Roselia/happy/visual |
| P09 | 1127 | yes | 126077 | Morfonica/pure/visual |
| P10 | 1039 | yes | 43222 | PastelPalettes/powerful/performance |

Current status after this revalidation:

1. The fixed 10-profile all-mode sample is exact within 300s, with latest max `179085ms`.
2. The tracked single-configuration hard cases are exact under the current 120s gate. Do not treat 60s as guaranteed: a later structure-refactor spot check reran P05 `PoppinParty/powerful/visual` at `62623ms`.
3. The wider P01 locked band/attribute scope remains a 120s case, not a 60s case, because it still has to prove all three parameter configurations. The next 60s-stage work should target cross-parameter proof sharing or a tighter post-incumbent upper for the non-winning parameters.

### 2026-06-01 Structure Refactor Recheck

After splitting exact candidate-join constants, heap helpers, and candidate-conflict bitset helpers into adjacent internal modules, the retained 120s hard-case spot checks were:

| case | exact | elapsed ms | gate |
| --- | --- | ---: | --- |
| P05 `PoppinParty/powerful/visual` | yes | 62623 | <=120s |
| P01 `PoppinParty/cool` locked | yes | 110345 | <=120s |

This refactor was intended to reduce maintenance risk before frontend integration. It did not change the exact proof condition, and it reinforces that the current committed gate is 120s, not 60s.

### 2026-06-02 Four-Event All-Scope Matrix

The latest consolidation run used the same fixed 10 real-profile sample and
songs `385,193,619`, then ran all-scope search for four event contexts:
`none`, `323`, `244`, and `260`. Duration was `300000ms` per case. Artifact:
`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-02T04-06-27-272Z.json`.

Summary:

- cases: `40`;
- exact all-scope cases: `36/40`;
- timed out cases: `0`;
- all-scope median elapsed: `51919ms`;
- all-scope P95 elapsed: `231981ms`;
- all-scope max elapsed: `295714ms`.

| profile | cards | none | 323 | 244 | 260 |
| --- | ---: | --- | --- | --- | --- |
| P01 | 1161 | 38.1s exact | 64.0s exact | 68.2s exact | 26.9s exact |
| P02 | 1747 | 37.7s exact | 22.4s exact | 55.0s exact | 122.5s bounded |
| P03 | 1211 | 73.6s exact | 68.9s exact | 92.4s exact | 74.8s exact |
| P04 | 1229 | 58.2s exact | 38.9s exact | 232.0s exact | 272.4s bounded |
| P05 | 1036 | 21.1s exact | 32.7s exact | 21.9s exact | 21.2s exact |
| P06 | 1433 | 38.1s exact | 50.2s exact | 85.6s exact | 55.5s exact |
| P07 | 1703 | 85.8s exact | 51.9s exact | 31.0s exact | 36.1s exact |
| P08 | 1513 | 104.1s exact | 31.4s bounded | 97.5s exact | 295.7s exact |
| P09 | 962 | 18.5s exact | 19.4s exact | 21.5s exact | 19.8s exact |
| P10 | 1127 | 117.6s exact | 143.3s exact | 39.3s bounded | 145.4s exact |

Bounded rows were not timeouts. They are retained bounded statuses because the
search preserved unresolved configuration upper bounds instead of spending the
remaining budget on work that could not prove the whole all-scope request in
that run.

| case | elapsed ms | score | upper | gap | primary cause |
| --- | ---: | ---: | ---: | ---: | --- |
| P02 / event `260` | 122524 | 9376984 | 9761094 | 384110 | Three `Everyone/happy/*` exact-join attempts aborted at the high-card candidate limit, then 15 later configurations were `bounded-dominated-root-skip`. |
| P04 / event `260` | 272368 | 8432514 | 8596906 | 164392 | Sixteen configurations were proved exact, then `Everyone/happy/performance` was `bounded-near-deadline-root-skip` with about `41804ms` remaining versus a same-coarse proof forecast of about `54511ms` plus reserve. |
| P08 / event `323` | 31450 | 9249509 | 9681466 | 431957 | `PastelPalettes/cool/technique` exact join remained unproved, then two later configurations were dominated by the unresolved upper. |
| P10 / event `244` | 39265 | 8729634 | 9284161 | 554527 | `HelloHappyWorld/happy/technique` exact join remained unproved, then eight later configurations were dominated by the unresolved upper. |

The P08/event `260` case is the main retained success risk: it completed exact
at `295714ms`, close to the 300s review budget. The retained improvement was to
apply observed-root sorting to all all-scope exact-candidate-join runs,
including card pools above 1500 cards. Without that ordering, this case had
previously missed exact proof near the deadline.

Current interpretation:

1. Most sampled all-scope event/profile cases now finish exact within a
   reasonable 300s budget.
2. The remaining bounded cases are proof-frontier cases, not score-formula or
   timeout failures.
3. The next proof optimization should target unresolved configuration uppers in
   high-card all-scope runs, especially when exact join hits the `400000`
   candidate cap or when several nearby root uppers survive after a strong
   incumbent.
