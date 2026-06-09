# Medley 40-Case Exact Report - 2026-06-10 01:45 CST

## Run Metadata

- Branch: `dev/medley-39-exact-frontier`
- Commit: `3335d69`
- Raw result: `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T17-06-33-445Z.json`
- Logs: `temp/bandori-team-builder/logs/medley-40-exact-isolated-2026-06-09T17-06-33-445Z`
- Previous pinned 39/40 report: `documents/bandori-team-builder/medley-40-exact-report-2026-06-09-141817.md`
- Previous pinned 39/40 raw: `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T05-44-21-186Z.json`
- Fixture: `temp/bandori-team-builder/real-profile-medley-p01-p10-40exact-fixture.json`
- Runner variant: `baselineCleanIsolatedProcessPerCase`
- Run id: `medley-40exact-headroom1600-20260609`
- Duration per case: `300000ms`
- Node.js: `v24.14.0`
- Node options: `--max-old-space-size=8192`
- Node args: `--expose-gc`
- Profiles: `P01` through `P10`; `P11` excluded
- Events: `none`, `244`, `260`, `323`
- Songs: `385`, `193`, `619`
- Optimization JSON: `{"memorySoftLimitMiB":4488,"exactNodeSoftLimit":5000000,"skipConfigurationSeedingWhenMemoryHeadroomBelowMiB":1600,"lowMemoryInitialCandidateSyncMaxSameCoarseProofElapsedMs":60000,"lowMemoryInitialCandidateSyncMinMemoryHeadroomMiB":0,"lowMemoryInitialCandidateSyncLocalAbortOnly":true,"lowMemoryInitialCandidateSyncLightUpper":true,"lowMemoryInitialCandidateSyncTimeboxMs":60000,"enableLowMemoryInitialCandidateSyncGcProbe":true,"debugConfigurationTrace":true,"debugExactCandidateJoinMemoryAttribution":true,"enableEventRootFrontierProbe":true,"eventRootFrontierProbeTimeboxMs":240000,"eventRootFrontierProbeCandidateSoftLimit":200000,"eventRootFrontierProbeMinMemoryHeadroomMiB":0}`

## Summary

| metric | current headroom-1600 run | previous pinned 39/40 |
| --- | ---: | ---: |
| exact cases | 40 | 39 |
| bounded cases | 0 | 1 |
| failed subprocesses | 0 | 0 |
| timed out cases | 0 | 0 |
| memory-limited cases | 0 | 0 |
| bounded gap total | 0 | 370472 |
| median elapsed ms | 42464 | 43046 |
| p95 elapsed ms | 145234 | 83783 |
| max elapsed ms | 156986 | 195577 |
| peak MiB | 3272 | 4170 |

Result: this run reaches the current final target, `40/40` exact for the retained `P01`-`P10` matrix under the `300000ms` per-case budget. There were no bounded rows, no failed subprocesses, no timeouts, no memory-limited rows, and no process OOM.

## Bounded Cases

None. Bounded gap total is `0`.

## Full Case Table

| case | exact | elapsed ms | wall ms | peak MiB | score | gap | reason | completed configs | root pruned | exact join |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |
| P01:none | yes | 31905 | 32046 | 898 | 7742856 | 0 | exact | 5 | 67 | 5/5 |
| P01:244 | yes | 27462 | 27631 | 855 | 8554506 | 0 | exact | 6 | 66 | 6/6 |
| P01:260 | yes | 47661 | 48218 | 1479 | 8475074 | 0 | exact | 4 | 68 | 4/4 |
| P01:323 | yes | 37074 | 37271 | 890 | 8436221 | 0 | exact | 6 | 66 | 6/6 |
| P02:none | yes | 63449 | 63759 | 1156 | 8051829 | 0 | exact | 12 | 96 | 12/12 |
| P02:244 | yes | 35706 | 35908 | 1067 | 8970468 | 0 | exact | 3 | 105 | 3/3 |
| P02:260 | yes | 39790 | 39997 | 1143 | 8970468 | 0 | exact | 3 | 105 | 3/3 |
| P02:323 | yes | 59670 | 59942 | 1152 | 8615212 | 0 | exact | 12 | 96 | 12/12 |
| P03:none | yes | 72125 | 72379 | 1301 | 8062642 | 0 | exact | 15 | 93 | 15/15 |
| P03:244 | yes | 47399 | 47620 | 1261 | 9070884 | 0 | exact | 9 | 99 | 9/9 |
| P03:260 | yes | 145234 | 146933 | 3025 | 9213846 | 0 | exact | 6 | 102 | 6/6 |
| P03:323 | yes | 43242 | 43418 | 1100 | 10229319 | 0 | exact | 3 | 105 | 3/3 |
| P04:none | yes | 36394 | 36598 | 1072 | 8086596 | 0 | exact | 3 | 93 | 3/3 |
| P04:244 | yes | 35975 | 36284 | 1042 | 8960938 | 0 | exact | 3 | 93 | 3/3 |
| P04:260 | yes | 36176 | 36466 | 1093 | 9024557 | 0 | exact | 3 | 93 | 3/3 |
| P04:323 | yes | 21862 | 21952 | 1094 | 8658785 | 0 | exact | 6 | 90 | 6/6 |
| P05:none | yes | 52835 | 53440 | 1690 | 7834406 | 0 | exact | 5 | 67 | 5/5 |
| P05:244 | yes | 42192 | 42569 | 1300 | 8598474 | 0 | exact | 4 | 68 | 4/4 |
| P05:260 | yes | 37936 | 38259 | 1147 | 8597270 | 0 | exact | 4 | 68 | 4/4 |
| P05:323 | yes | 43339 | 43671 | 1230 | 8392101 | 0 | exact | 6 | 66 | 6/6 |
| P06:none | yes | 59670 | 60003 | 1195 | 8392231 | 0 | exact | 12 | 96 | 12/12 |
| P06:244 | yes | 76380 | 76718 | 1134 | 9066914 | 0 | exact | 15 | 93 | 15/15 |
| P06:260 | yes | 70933 | 71368 | 1097 | 9620924 | 0 | exact | 12 | 96 | 12/12 |
| P06:323 | yes | 150703 | 153593 | 3272 | 9488172 | 0 | exact | 9 | 99 | 9/9 |
| P07:none | yes | 71760 | 72239 | 1358 | 7954668 | 0 | exact | 4 | 104 | 4/4 |
| P07:244 | yes | 57821 | 58141 | 1187 | 8551590 | 0 | exact | 21 | 87 | 21/21 |
| P07:260 | yes | 156986 | 160108 | 2991 | 8568618 | 0 | exact | 21 | 87 | 21/21 |
| P07:323 | yes | 32421 | 32609 | 902 | 9776671 | 0 | exact | 6 | 102 | 6/6 |
| P08:none | yes | 22468 | 22498 | 1080 | 7990800 | 0 | exact | 18 | 90 | 18/18 |
| P08:244 | yes | 47078 | 47263 | 947 | 9754093 | 0 | exact | 3 | 105 | 3/3 |
| P08:260 | yes | 21716 | 21738 | 1017 | 8912225 | 0 | exact | 20 | 88 | 20/20 |
| P08:323 | yes | 18191 | 18219 | 1066 | 9249509 | 0 | exact | 3 | 105 | 3/3 |
| P09:none | yes | 55318 | 55565 | 1210 | 8183525 | 0 | exact | 12 | 96 | 12/12 |
| P09:244 | yes | 29167 | 29222 | 1029 | 9172542 | 0 | exact | 3 | 105 | 3/3 |
| P09:260 | yes | 40192 | 40325 | 966 | 9160727 | 0 | exact | 3 | 105 | 3/3 |
| P09:323 | yes | 63579 | 63958 | 1123 | 9136184 | 0 | exact | 10 | 98 | 10/10 |
| P10:none | yes | 42464 | 42624 | 1137 | 7817586 | 0 | exact | 6 | 102 | 6/6 |
| P10:244 | yes | 125169 | 125966 | 1822 | 8676823 | 0 | exact | 12 | 96 | 12/12 |
| P10:260 | yes | 41861 | 42135 | 1040 | 8617963 | 0 | exact | 6 | 102 | 6/6 |
| P10:323 | yes | 34225 | 34476 | 1289 | 10105963 | 0 | exact | 3 | 105 | 3/3 |

## Slowest And Highest Memory

| slowest case | elapsed ms | peak MiB | exact |
| --- | ---: | ---: | --- |
| P07:260 | 156986 | 2991 | yes |
| P06:323 | 150703 | 3272 | yes |
| P03:260 | 145234 | 3025 | yes |
| P10:244 | 125169 | 1822 | yes |
| P06:244 | 76380 | 1134 | yes |
| P03:none | 72125 | 1301 | yes |
| P07:none | 71760 | 1358 | yes |
| P06:260 | 70933 | 1097 | yes |
| P09:323 | 63579 | 1123 | yes |
| P02:none | 63449 | 1156 | yes |

| highest-memory case | peak MiB | elapsed ms | exact |
| --- | ---: | ---: | --- |
| P06:323 | 3272 | 150703 | yes |
| P03:260 | 3025 | 145234 | yes |
| P07:260 | 2991 | 156986 | yes |
| P10:244 | 1822 | 125169 | yes |
| P05:none | 1690 | 52835 | yes |
| P01:260 | 1479 | 47661 | yes |
| P07:none | 1358 | 71760 | yes |
| P05:244 | 1300 | 42192 | yes |
| P03:none | 1301 | 72125 | yes |
| P10:323 | 1289 | 34225 | yes |

## Failure And Conversion Analysis

- The remaining previous bounded row, `P03:260`, is now exact. The root cause was not incumbent quality or exact-join generator initialization. Diagnostics showed the third same-coarse sibling, `RaiseASuilen/happy/visual`, rose from about `3007 MiB` after slot build to about `4769 MiB` before exact join because no-gain configuration seeding ran before proof.
- Raising the existing seeding memory guard from `400` to `1600` skipped that no-gain seeding only when the current configuration had limited headroom. For `P03:260`, this let exact join start below the memory wall and close all six needed configurations.
- This route does not use seed results as proof. It only avoids spending memory on incumbent seeding when enough incumbent already exists and headroom is low; exactness still comes from exact candidate join and root pruning.
- The hard guard set passed before the full run: `P03:260`, `P06:323`, `P07:260`, `P08:323`, `P10:244`, `P10:260`, `P07:244`, and `P08:244` were all exact with no timeout or memory limit.
- The full 40-case run lowered peak memory from the previous pinned `4170 MiB` to `3272 MiB`. The p95 elapsed time increased because `P03:260` now spends time proving instead of stopping bounded, but the max elapsed time decreased and every row remains within the 300s budget.

## Recommendations

1. Pin this run as the current `40/40` acceptance checkpoint for P01-P10, excluding P11.
2. Keep `P11` as a separate stress profile; do not mix it into this 40-case acceptance target.
3. Before defaulting broader production behavior, run one non-debug confirmation with the same `1600` seeding headroom guard to ensure debug trace and memory attribution are not required for exactness.
4. If this option is promoted, document it as a memory-preserving seeding guard, not as a proof shortcut. Exact/bounded semantics remain unchanged.
5. Future optimization should reduce the p95 proof cost of `P03:260`, `P06:323`, and `P07:260` without weakening the current `40/40` exact checkpoint.
