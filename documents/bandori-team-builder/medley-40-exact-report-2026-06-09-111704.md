# Medley 40-Case Exact Report - 2026-06-09 11:17 CST

## Run Metadata

- Branch: `dev/medley-greedy-seed-acceptance`
- Commit: `6d72c48`
- Raw result: `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T03-17-04-125Z.json`
- Previous checkpoint raw: `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T00-10-29-221Z.json`
- Clean baseline raw: `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-08T11-42-34-917Z.json`
- Fixture: `temp\bandori-team-builder\real-profile-medley-p01-p10-40exact-fixture.json`
- Runner variant: `baselineCleanIsolatedProcessPerCase`
- Run id: `2026-06-09-p01-p10-40exact-38-target-soft4488-skipseed400`
- Duration per case: `300000ms`
- Node options: `--max-old-space-size=8192`
- Node args: `--expose-gc`
- Profiles: `P01` through `P10`
- Events: `none`, `244`, `260`, `323`
- Songs: `385`, `193`, `619`
- Optimization JSON: `{"memorySoftLimitMiB":4488,"exactNodeSoftLimit":5000000,"skipConfigurationSeedingWhenMemoryHeadroomBelowMiB":400,"lowMemoryInitialCandidateSyncMaxSameCoarseProofElapsedMs":60000,"lowMemoryInitialCandidateSyncMinMemoryHeadroomMiB":0,"lowMemoryInitialCandidateSyncLocalAbortOnly":true,"lowMemoryInitialCandidateSyncLightUpper":true,"lowMemoryInitialCandidateSyncTimeboxMs":60000,"enableLowMemoryInitialCandidateSyncGcProbe":true,"debugConfigurationTrace":true}`

## Summary

| metric | current | previous 37/40 checkpoint | clean 35/40 baseline |
| --- | ---: | ---: | ---: |
| exact cases | 38 | 37 | 35 |
| bounded cases | 2 | 3 | 5 |
| failed subprocesses | 0 | 0 | 0 |
| timed out cases | 0 | 1 | 5 |
| memory-limited cases | 0 | 1 | 5 |
| bounded gap total | 977673 | 1274272 | 1819282 |
| median elapsed ms | 40626 | 18406 | 61192 |
| p95 elapsed ms | 67744 | 37598 | 194283 |
| max elapsed ms | 198562 | 39932 | 276080 |
| peak MiB | 4169 | 4203 | 4488 |

Result: this run reaches the active `38/40` stage target. It converts `P07:260` from the previous checkpoint, keeps all previously exact rows exact, removes the only timeout/memory-limited row, and stays below the clean baseline memory gate.

## Bounded Cases

| case | score | gap | elapsed ms | peak MiB | timed out | memory limited | reason | completed configs | root pruned |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | ---: | ---: |
| P03:260 | 9213846 | 370472 | 51620 | 1980 | no | no | full-width-event-skip-seeding | 0 | 102 |
| P06:323 | 9486961 | 607201 | 22295 | 1295 | no | no | large-gap-event-skip-seeding | 0 | 99 |

Bounded-case notes:

- `P03:260`: first unclosed configuration is `RaiseASuilen/happy/performance`, effective upper `9584318`, gap `370472`. Trace status distribution: `1` full-width event skip, `5` dominated root skips, `102` fast root prunes. No exact-join proof ran.
- `P06:323`: first unclosed configuration is `PastelPalettes/cool/performance`, effective upper `10094162`, gap `607201`. Trace status distribution: `1` large-gap event skip, `8` dominated root skips, `99` fast root prunes. No exact-join proof ran.
- Both remaining bounded rows are now controlled proof-frontier upper-bound gaps, not memory failures.

## Full Case Table

| case | exact | elapsed ms | peak MiB | gap | reason | completed configs | root pruned |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: |
| P01:none | yes | 33387 | 893 | 0 | exact | 5 | 67 |
| P01:244 | yes | 25396 | 921 | 0 | exact | 6 | 66 |
| P01:260 | yes | 46533 | 1466 | 0 | exact | 4 | 68 |
| P01:323 | yes | 33217 | 937 | 0 | exact | 6 | 66 |
| P02:none | yes | 63932 | 1130 | 0 | exact | 12 | 96 |
| P02:244 | yes | 38711 | 1128 | 0 | exact | 3 | 105 |
| P02:260 | yes | 37370 | 1048 | 0 | exact | 3 | 105 |
| P02:323 | yes | 59020 | 1137 | 0 | exact | 12 | 96 |
| P03:none | yes | 67744 | 1247 | 0 | exact | 15 | 93 |
| P03:244 | yes | 45514 | 1313 | 0 | exact | 9 | 99 |
| P03:260 | no | 51620 | 1980 | 370472 | full-width-event-skip-seeding | 0 | 102 |
| P03:323 | yes | 56304 | 1572 | 0 | exact | 3 | 105 |
| P04:none | yes | 33534 | 1144 | 0 | exact | 3 | 93 |
| P04:244 | yes | 37004 | 1135 | 0 | exact | 3 | 93 |
| P04:260 | yes | 38829 | 1291 | 0 | exact | 3 | 93 |
| P04:323 | yes | 21627 | 1146 | 0 | exact | 6 | 90 |
| P05:none | yes | 48956 | 1694 | 0 | exact | 5 | 67 |
| P05:244 | yes | 39923 | 1300 | 0 | exact | 4 | 68 |
| P05:260 | yes | 36003 | 1150 | 0 | exact | 4 | 68 |
| P05:323 | yes | 40626 | 1244 | 0 | exact | 6 | 66 |
| P06:none | yes | 58560 | 1269 | 0 | exact | 12 | 96 |
| P06:244 | yes | 67545 | 1174 | 0 | exact | 15 | 93 |
| P06:260 | yes | 55296 | 1204 | 0 | exact | 12 | 96 |
| P06:323 | no | 22295 | 1295 | 607201 | large-gap-event-skip-seeding | 0 | 99 |
| P07:none | yes | 59020 | 1375 | 0 | exact | 4 | 104 |
| P07:244 | yes | 56306 | 1196 | 0 | exact | 21 | 87 |
| P07:260 | yes | 198562 | 4169 | 0 | exact | 21 | 87 |
| P07:323 | yes | 65054 | 1440 | 0 | exact | 6 | 102 |
| P08:none | yes | 19898 | 1292 | 0 | exact | 18 | 90 |
| P08:244 | yes | 15651 | 1129 | 0 | exact | 3 | 105 |
| P08:260 | yes | 20309 | 1207 | 0 | exact | 20 | 88 |
| P08:323 | yes | 55973 | 2246 | 0 | exact | 3 | 105 |
| P09:none | yes | 45939 | 1212 | 0 | exact | 12 | 96 |
| P09:244 | yes | 24221 | 1175 | 0 | exact | 3 | 105 |
| P09:260 | yes | 29761 | 1196 | 0 | exact | 3 | 105 |
| P09:323 | yes | 53487 | 1176 | 0 | exact | 10 | 98 |
| P10:none | yes | 35916 | 1307 | 0 | exact | 6 | 102 |
| P10:244 | yes | 96101 | 1756 | 0 | exact | 12 | 96 |
| P10:260 | yes | 53028 | 1343 | 0 | exact | 6 | 102 |
| P10:323 | yes | 32655 | 1250 | 0 | exact | 3 | 105 |

## Slowest And Highest Memory

| slowest case | elapsed ms | peak MiB | exact |
| --- | ---: | ---: | --- |
| P07:260 | 198562 | 4169 | yes |
| P10:244 | 96101 | 1756 | yes |
| P03:none | 67744 | 1247 | yes |
| P06:244 | 67545 | 1174 | yes |
| P07:323 | 65054 | 1440 | yes |
| P02:none | 63932 | 1130 | yes |
| P02:323 | 59020 | 1137 | yes |
| P07:none | 59020 | 1375 | yes |
| P06:none | 58560 | 1269 | yes |
| P07:244 | 56306 | 1196 | yes |

| highest-memory case | peak MiB | elapsed ms | exact | gap |
| --- | ---: | ---: | --- | ---: |
| P07:260 | 4169 | 198562 | yes | 0 |
| P08:323 | 2246 | 55973 | yes | 0 |
| P03:260 | 1980 | 51620 | no | 370472 |
| P10:244 | 1756 | 96101 | yes | 0 |
| P05:none | 1694 | 48956 | yes | 0 |

## Failure Analysis

- `P07:260` was the only previous memory-limited row and is now exact. The useful conversion came from combining low-memory initial-candidate local abort semantics, light upper mode, explicit GC probing, and skipping configuration seeding when headroom is below `400 MiB`.
- The conversion is not a seed-quality improvement. It lets the already sufficient exact proof route complete `21` configurations and root-prune `87` more without crossing the memory gate.
- `P03:260` and `P06:323` remain bounded because their event upper bounds are intentionally carried as remembered unclosed root bounds. The current controller avoids expensive proof work there because prior diagnostics showed those paths did not close the gap under memory limits.
- This run is valid acceptance evidence because each case ran in a fresh isolated Node process. A same-process 40-case run with the same optimization was rejected separately because heap carryover caused later cases to fail before meaningful proof work.

## Next Recommendations

1. Pin this as the current `38/40` branch checkpoint.
2. Move the working target to `39/40`, with `P03:260` and `P06:323` as the only remaining exact blockers.
3. Do not broaden seed or warmup work. The remaining failures are proof-frontier upper-bound closure problems, not incumbent quality problems.
4. The next generic optimization should add a bounded, memory-safe proof probe for event/root-skip frontiers: close or tighten the first remembered unclosed configuration without materializing the full exact-candidate frontier.
5. Keep `P07:260`, `P08:323`, and `P10:244` as anti-regression guards, since they are now the highest memory / longest exact rows.
