# Medley 40-Case Exact Report - 2026-06-09 14:18 CST

## Run Metadata

- Branch: `dev/medley-39-exact-frontier`
- Commit: `4bf5a28`
- Raw result: `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T05-44-21-186Z.json`
- Guard-set raw: `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T05-32-38-569Z.json`
- Previous pinned 38/40 raw: `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T03-17-04-125Z.json`
- Fixture: `temp\bandori-team-builder\real-profile-medley-p01-p10-40exact-fixture.json`
- Runner variant: `baselineCleanIsolatedProcessPerCase`
- Run id: `2026-06-09-event-root-probe-full-40`
- Duration per case: `300000ms`
- Node options: `--max-old-space-size=8192`
- Node args: `--expose-gc`
- Profiles: `P01` through `P10`; P11 excluded
- Events: `none`, `244`, `260`, `323`
- Songs: `385`, `193`, `619`
- Optimization JSON: `{"memorySoftLimitMiB":4488,"exactNodeSoftLimit":5000000,"skipConfigurationSeedingWhenMemoryHeadroomBelowMiB":400,"lowMemoryInitialCandidateSyncMaxSameCoarseProofElapsedMs":60000,"lowMemoryInitialCandidateSyncMinMemoryHeadroomMiB":0,"lowMemoryInitialCandidateSyncLocalAbortOnly":true,"lowMemoryInitialCandidateSyncLightUpper":true,"lowMemoryInitialCandidateSyncTimeboxMs":60000,"enableLowMemoryInitialCandidateSyncGcProbe":true,"debugConfigurationTrace":true,"enableEventRootFrontierProbe":true,"eventRootFrontierProbeTimeboxMs":30000,"eventRootFrontierProbeCandidateSoftLimit":20000,"eventRootFrontierProbeMinRemainingMs":60000,"eventRootFrontierProbeMinMemoryHeadroomMiB":512}`

## Summary

| metric | current event-root probe | previous pinned 38/40 |
| --- | ---: | ---: |
| exact cases | 39 | 38 |
| bounded cases | 1 | 2 |
| failed subprocesses | 0 | 0 |
| timed out cases | 0 | 0 |
| memory-limited cases | 0 | 0 |
| bounded gap total | 370472 | 977673 |
| median elapsed ms | 43046 | 40626 |
| p95 elapsed ms | 83783 | 67744 |
| max elapsed ms | 195577 | 198562 |
| peak MiB | 4170 | 4169 |

Result: this run reaches the intermediate `39/40` stage target. It converts `P06:323` to exact, keeps the guard set exact rows exact, has no failed subprocesses, no timeouts, no memory-limited rows, and lowers bounded-gap total from `977673` to `370472`. The final `40/40` target is not complete because `P03:260` remains bounded.

## Bounded Cases

| case | score | upper | gap | elapsed ms | peak MiB | timed out | memory limited | reason | event probe | probe upper after |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | ---: |
| P03:260 | 9213846 | 9584318 | 370472 | 53636 | 1982 | no | no | full-width-event-skip-seeding | unproved / calls 1 | 9566338.5 |

- `P03:260`: first unclosed configuration is `RaiseASuilen/happy/performance`, status `full-width-event-skip-seeding`, remembered upper `9584317.729644679`, score `9213846`, gap `370472`.
- `P03:260` event-root probe ran `1` time(s), status `unproved`, observed upper `9566338.5`, residual gap `352492.5`, elapsed `7363ms`, peak `1982 MiB`.
- The probe upper for `P03:260` was diagnostic-only because it did not prove the configuration and did not fall below the incumbent. Applying that unproved upper changed same-coarse scheduling in a rejected smoke and caused later initial-candidate memory pressure, so the accepted implementation records it without changing proof state.

## Converted Cases

| case | previous gap | current elapsed ms | current peak MiB | event probe status | event probe elapsed ms |
| --- | ---: | ---: | ---: | --- | ---: |
| P06:323 | 607201 | 129716 | 3183 | proved | 239 |

`P06:323` is the meaningful conversion. Its event-root frontier probe proved `PastelPalettes/cool/performance` before the previous `large-gap-event-skip-seeding` exit, after which the same-coarse siblings closed normally.

## Full Case Table

| case | exact | elapsed ms | peak MiB | gap | reason | completed configs | root pruned | event probe |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | --- |
| P01:none | yes | 36272 | 1154 | 0 | exact | 5 | 67 | none (0) |
| P01:244 | yes | 24009 | 920 | 0 | exact | 6 | 66 | none (0) |
| P01:260 | yes | 39019 | 1482 | 0 | exact | 4 | 68 | none (0) |
| P01:323 | yes | 32026 | 1030 | 0 | exact | 6 | 66 | none (0) |
| P02:none | yes | 53432 | 1248 | 0 | exact | 12 | 96 | none (0) |
| P02:244 | yes | 35753 | 1209 | 0 | exact | 3 | 105 | none (0) |
| P02:260 | yes | 35547 | 1214 | 0 | exact | 3 | 105 | none (0) |
| P02:323 | yes | 55047 | 1297 | 0 | exact | 12 | 96 | none (0) |
| P03:none | yes | 63034 | 1301 | 0 | exact | 15 | 93 | none (0) |
| P03:244 | yes | 43046 | 1179 | 0 | exact | 9 | 99 | none (0) |
| P03:260 | no | 53636 | 1982 | 370472 | full-width-event-skip-seeding | 0 | 102 | unproved (1) |
| P03:323 | yes | 53546 | 1576 | 0 | exact | 3 | 105 | none (0) |
| P04:none | yes | 32132 | 1151 | 0 | exact | 3 | 93 | none (0) |
| P04:244 | yes | 33203 | 1110 | 0 | exact | 3 | 93 | none (0) |
| P04:260 | yes | 40191 | 1274 | 0 | exact | 3 | 93 | none (0) |
| P04:323 | yes | 20755 | 1095 | 0 | exact | 6 | 90 | none (0) |
| P05:none | yes | 46563 | 1696 | 0 | exact | 5 | 67 | none (0) |
| P05:244 | yes | 47088 | 1637 | 0 | exact | 4 | 68 | none (0) |
| P05:260 | yes | 35435 | 1151 | 0 | exact | 4 | 68 | none (0) |
| P05:323 | yes | 38923 | 1237 | 0 | exact | 6 | 66 | none (0) |
| P06:none | yes | 54566 | 1269 | 0 | exact | 12 | 96 | none (0) |
| P06:244 | yes | 65765 | 1184 | 0 | exact | 15 | 93 | none (0) |
| P06:260 | yes | 52730 | 1173 | 0 | exact | 12 | 96 | none (0) |
| P06:323 | yes | 129716 | 3183 | 0 | exact | 9 | 99 | proved (1) |
| P07:none | yes | 56459 | 1402 | 0 | exact | 4 | 104 | none (0) |
| P07:244 | yes | 52374 | 1176 | 0 | exact | 21 | 87 | none (0) |
| P07:260 | yes | 195577 | 4170 | 0 | exact | 21 | 87 | none (0) |
| P07:323 | yes | 63886 | 1433 | 0 | exact | 6 | 102 | none (0) |
| P08:none | yes | 20910 | 1254 | 0 | exact | 18 | 90 | none (0) |
| P08:244 | yes | 15550 | 1102 | 0 | exact | 3 | 105 | none (0) |
| P08:260 | yes | 19915 | 1174 | 0 | exact | 20 | 88 | none (0) |
| P08:323 | yes | 59168 | 2213 | 0 | exact | 3 | 105 | none (0) |
| P09:none | yes | 47021 | 1299 | 0 | exact | 12 | 96 | none (0) |
| P09:244 | yes | 25047 | 1154 | 0 | exact | 3 | 105 | none (0) |
| P09:260 | yes | 26776 | 1167 | 0 | exact | 3 | 105 | none (0) |
| P09:323 | yes | 49666 | 1369 | 0 | exact | 10 | 98 | none (0) |
| P10:none | yes | 32805 | 1271 | 0 | exact | 6 | 102 | none (0) |
| P10:244 | yes | 83783 | 1979 | 0 | exact | 12 | 96 | none (0) |
| P10:260 | yes | 46619 | 1349 | 0 | exact | 6 | 102 | none (0) |
| P10:323 | yes | 30059 | 1338 | 0 | exact | 3 | 105 | none (0) |

## Slowest And Highest Memory

| slowest case | elapsed ms | peak MiB | exact |
| --- | ---: | ---: | --- |
| P07:260 | 195577 | 4170 | yes |
| P06:323 | 129716 | 3183 | yes |
| P10:244 | 83783 | 1979 | yes |
| P06:244 | 65765 | 1184 | yes |
| P07:323 | 63886 | 1433 | yes |
| P03:none | 63034 | 1301 | yes |
| P08:323 | 59168 | 2213 | yes |
| P07:none | 56459 | 1402 | yes |
| P02:323 | 55047 | 1297 | yes |
| P06:none | 54566 | 1269 | yes |

| highest-memory case | peak MiB | elapsed ms | exact | gap |
| --- | ---: | ---: | --- | ---: |
| P07:260 | 4170 | 195577 | yes | 0 |
| P06:323 | 3183 | 129716 | yes | 0 |
| P08:323 | 2213 | 59168 | yes | 0 |
| P03:260 | 1982 | 53636 | no | 370472 |
| P10:244 | 1979 | 83783 | yes | 0 |
| P05:none | 1696 | 46563 | yes | 0 |
| P05:244 | 1637 | 47088 | yes | 0 |
| P03:323 | 1576 | 53546 | yes | 0 |
| P01:260 | 1482 | 39019 | yes | 0 |
| P07:323 | 1433 | 63886 | yes | 0 |

## Failure Analysis

- `P06:323` was bounded in the pinned `38/40` run because the first `PastelPalettes/cool/performance` configuration exited via `large-gap-event-skip-seeding` before any exact join. The new opt-in event-root probe safely reuses exact-candidate-join proof work at that exit and proves the configuration quickly enough to let the rest of the same-coarse frontier close.
- `P03:260` remains bounded at `RaiseASuilen/happy/performance`. Its probe can reduce the observed root upper from `9584317.729644679` to `9566338.5`, but that still leaves a residual gap of `352492.5` above the incumbent. Because that upper is not a proof closure, the accepted path does not apply it to active proof state.
- A rejected smoke showed why diagnostic-only matters: applying the unproved `P03:260` upper perturbed same-coarse scheduling and led to an `initial-candidate` memory spike. The current accepted run avoids that regression and keeps `P03:260` at the original bounded gap with no timeout or memory limit.
- The full run preserves the prior hard exact rows: `P07:260` remains exact with peak `4170 MiB`, `P08:323` remains exact with peak `2213 MiB`, and `P10:244` remains exact with peak `1979 MiB`.

## Next Recommendations

1. Pin this run as the current `39/40` checkpoint for the branch.
2. Keep `enableEventRootFrontierProbe` opt-in until the remaining `P03:260` path has a proof-safe closure strategy or the full acceptance matrix is repeated under the proposed default enablement conditions.
3. Do not broaden seed, greedy, prefix-seed, candidate limit, or generic memory compaction routes for the next step. The only remaining blocker is an unclosed event-root proof upper for `P03:260`.
4. Target `P03:260` with a proof-only upper closure that cannot perturb same-coarse scheduling unless it proves or directly prunes: likely a residual pair/frontier proof for the `RaiseASuilen/happy/performance` full-width event root, with strict local memory accounting and no application of unproved tightening.
5. Preserve the guard set `P03:260`, `P06:323`, `P07:260`, `P08:323`, `P10:244`, `P10:260`, `P07:244`, and `P08:244`; every accepted patch still requires a full 40-case report.
