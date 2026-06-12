# Medley 40-Case Consolidation Report - 2026-06-12 10:15 CST

## Summary

- Raw result: `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-12T02-15-33-738Z.json`
- Partial result: `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-12T02-15-33-738Z-partial.json`
- Output log: `temp/bandori-team-builder/logs/full40-consolidated-20260612-101533.out.log`
- Error log: `temp/bandori-team-builder/logs/full40-consolidated-20260612-101533.err.log`
- Per-case log directory: `temp/bandori-team-builder/logs/medley-40-exact-isolated-2026-06-12T02-15-33-738Z`
- Runner command: `node temp\bandori-team-builder\benchmark-real-profiles-medley.cjs`
- Fixture: `temp/bandori-team-builder/real-profile-medley-p01-p10-40exact-fixture.json`
- Variant: `baselineCleanIsolatedProcessPerCase`
- Scope: retained real-profile samples `P01` through `P10`; events `none`, `244`, `260`, `323`; all-scope maximize; `P11` excluded.
- Runtime: process-per-case isolated, `NODE_OPTIONS=--max-old-space-size=8192`, no `--expose-gc`, no `global.gc`, `debugConfigurationTrace=false`.
- Result: `34/40` exact, `6` bounded, failed subprocesses `0`, timed out rows `5`, memory-limited rows `1`, bounded-gap total `2247931`.
- Timing: median `68250ms`, p95 `300082ms`, max `300304ms`.
- Peak working set: `4490 MiB`.
- Verdict: rejected for the `37/40` and `40/40` exact gates; accepted only as a reproducible consolidation baseline for the current conservative no-GC parameter set.

## Optimization Parameters

```json
{
  "memorySoftLimitMiB": 4488,
  "exactNodeSoftLimit": 5000000,
  "skipConfigurationSeedingWhenMemoryHeadroomBelowMiB": 1600,
  "enableEventRootFrontierProbe": true,
  "enableSameCoarseFrontierEventProbeBeforeExactJoin": true,
  "sameCoarseFrontierRetryMinRemainingMs": 30000,
  "eventRootFrontierProbeTimeboxMs": 240000,
  "eventRootFrontierProbeCandidateSoftLimit": 200000,
  "eventRootFrontierProbeMinMemoryHeadroomMiB": 0,
  "eventRootFrontierProbeAnchorProofMaxOtherSlotCandidates": 90000,
  "eventRootFrontierProbeAnchorProofMaxOtherSlotCandidateTotal": 140000,
  "eventRootFrontierProbeAnchorProofMaxFrontierGap": 120000,
  "eventRootFrontierProbeAnchorProofTimeboxMs": 90000,
  "eventRootFrontierProbeAnchorProofMaxHighPairRecords": 2500000,
  "eventRootFrontierProbeAnchorCheapUpperTimeboxMs": 120000,
  "eventRootFrontierProbeAnchorCheapUpperMaxAnchors": 13000,
  "eventRootFrontierProbeAnchorCheapUpperPairCapacityCap": true,
  "eventRootFrontierProbeAnchorCheapUpperPairCapacitySharedPowerDualCap": true,
  "eventRootFrontierProbeAnchorCheapUpperPairCapacitySharedPowerDualCapMaxCalls": 4,
  "eventRootFrontierProbeAnchorCheapUpperPairCapacitySharedPowerDualLateMaxRepair": false,
  "eventRootFrontierProbeAnchorCheapUpperSuffixGeneratedPairJoin": true,
  "eventRootFrontierProbeAnchorCheapUpperSuffixUnseenFullJoin": true,
  "debugConfigurationTrace": false
}
```

## Case Details

| profile | cards | event | mode | exact | elapsed ms | peak MiB | score | maxScore | upper | gap | timedOut | memoryLimited | abort reason |
| --- | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| P01 | 1026 | none | exact | yes | 46159 | 1293 | 7742856 | 7792781 |  | 0 | no | no |  |
| P01 | 1026 | 244 | exact | yes | 42500 | 1742 | 8560306 | 8611453 |  | 0 | no | no |  |
| P01 | 1026 | 260 | exact | yes | 37285 | 1466 | 8475074 | 8530870 |  | 0 | no | no |  |
| P01 | 1026 | 323 | exact | yes | 34271 | 1624 | 8436221 | 8491398 |  | 0 | no | no |  |
| P02 | 1215 | none | exact | yes | 66878 | 1985 | 8051829 | 8120764 |  | 0 | no | no |  |
| P02 | 1215 | 244 | exact | yes | 56889 | 1518 | 8970468 | 9047356 |  | 0 | no | no |  |
| P02 | 1215 | 260 | exact | yes | 45552 | 1531 | 8970468 | 9047356 |  | 0 | no | no |  |
| P02 | 1215 | 323 | exact | yes | 65712 | 1798 | 8615212 | 8690156 |  | 0 | no | no |  |
| P03 | 1404 | none | exact | yes | 155681 | 2324 | 8062642 | 8110435 |  | 0 | no | no |  |
| P03 | 1404 | 244 | exact | yes | 87644 | 2234 | 9070884 | 9166542 |  | 0 | no | no |  |
| P03 | 1404 | 260 | exact | yes | 130807 | 3726 | 9213846 | 9256445 |  | 0 | no | no |  |
| P03 | 1404 | 323 | exact | yes | 142878 | 3362 | 10229319 | 10300696 |  | 0 | no | no |  |
| P04 | 1102 | none | exact | yes | 27666 | 1477 | 8086596 | 8113638 |  | 0 | no | no |  |
| P04 | 1102 | 244 | exact | yes | 35345 | 1372 | 8960938 | 8990142 |  | 0 | no | no |  |
| P04 | 1102 | 260 | exact | yes | 42393 | 1641 | 9024557 | 9053951 |  | 0 | no | no |  |
| P04 | 1102 | 323 | exact | yes | 27870 | 1083 | 8660394 | 8691796 |  | 0 | no | no |  |
| P05 | 981 | none | exact | yes | 34330 | 2096 | 7834406 | 7874979 |  | 0 | no | no |  |
| P05 | 981 | 244 | exact | yes | 69755 | 1999 | 8611080 | 8651124 |  | 0 | no | no |  |
| P05 | 981 | 260 | exact | yes | 68614 | 1733 | 8597270 | 8641488 |  | 0 | no | no |  |
| P05 | 981 | 323 | exact | yes | 40206 | 1856 | 8392101 | 8430799 |  | 0 | no | no |  |
| P06 | 1234 | none | exact | yes | 76366 | 1880 | 8392231 | 8424034 |  | 0 | no | no |  |
| P06 | 1234 | 244 | exact | yes | 104118 | 2270 | 9066914 | 9098744 |  | 0 | no | no |  |
| P06 | 1234 | 260 | exact | yes | 107507 | 1835 | 9620924 | 9644052 |  | 0 | no | no |  |
| P06 | 1234 | 323 | bounded | no | 220391 | 3678 | 9488172 | 9567356 | 9935586 | 447414 | no | no | candidate-fill-soft-limit |
| P07 | 1252 | none | exact | yes | 55302 | 2012 | 7954668 | 7997507 |  | 0 | no | no |  |
| P07 | 1252 | 244 | exact | yes | 191630 | 2949 | 8551590 | 8589321 |  | 0 | no | no |  |
| P07 | 1252 | 260 | bounded | no | 136515 | 4490 | 8568618 | 8606492 | 8631547 | 62929 | yes | yes | candidate-fill-pair-refine |
| P07 | 1252 | 323 | exact | yes | 68250 | 1948 | 9776671 | 9871510 |  | 0 | no | no |  |
| P08 | 1513 | none | exact | yes | 113393 | 1975 | 7990800 | 8035068 |  | 0 | no | no |  |
| P08 | 1513 | 244 | exact | yes | 204600 | 2012 | 9758172 | 9863887 |  | 0 | no | no |  |
| P08 | 1513 | 260 | bounded | no | 300304 | 2182 | 8912225 | 8998562 | 9343762 | 431537 | yes | no | solve-timeout |
| P08 | 1513 | 323 | bounded | no | 300082 | 2219 | 9249509 | 9368642 | 9672438 | 422929 | yes | no | solve-timeout |
| P09 | 1367 | none | exact | yes | 128325 | 1402 | 8183525 | 8235444 |  | 0 | no | no |  |
| P09 | 1367 | 244 | exact | yes | 45461 | 1195 | 9172542 | 9231686 |  | 0 | no | no |  |
| P09 | 1367 | 260 | exact | yes | 42628 | 1413 | 9160727 | 9216449 |  | 0 | no | no |  |
| P09 | 1367 | 323 | bounded | no | 300117 | 2446 | 9136184 | 9204091 | 9674403 | 538219 | yes | no | solve-timeout |
| P10 | 995 | none | exact | yes | 41240 | 1815 | 7817586 | 7858837 |  | 0 | no | no |  |
| P10 | 995 | 244 | exact | yes | 231811 | 2931 | 8676823 | 8768139 |  | 0 | no | no |  |
| P10 | 995 | 260 | bounded | no | 300023 | 2496 | 8617963 | 8681365 | 8962866 | 344903 | yes | no | solve-timeout |
| P10 | 995 | 323 | exact | yes | 36571 | 1493 | 10105963 | 10159027 |  | 0 | no | no |  |

## Bounded Rows

| case | family | gap | elapsed ms | peak MiB | abort reason | abort candidates | completed configs | root pruned |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: |
| P06:323 | unclosed event-root frontier | 447414 | 220391 | 3678 | candidate-fill-soft-limit | 200000 | 0 | 99 |
| P07:260 | memory guard | 62929 | 136515 | 4490 | candidate-fill-pair-refine | 236383 | 12 | 0 |
| P08:260 | deadline proof frontier | 431537 | 300304 | 2182 | solve-timeout | 333675 | 0 | 0 |
| P08:323 | deadline proof frontier | 422929 | 300082 | 2219 | solve-timeout | 400634 | 0 | 0 |
| P09:323 | deadline proof frontier | 538219 | 300117 | 2446 | solve-timeout | 235017 | 0 | 0 |
| P10:260 | deadline proof frontier | 344903 | 300023 | 2496 | solve-timeout | 370885 | 0 | 0 |

### P06:323

- Result: bounded, score `9488172`, maxScore `9567356`, observed upper `9935586`, gap `447414`.
- Runtime: elapsed `220391ms`, wall `220470ms`, peak `3678 MiB`, timedOut `false`, memoryLimited `false`.
- Configurations: raw `144`, active `108`, started `108`, completed `0`, root-pruned `99`.
- Exact join: calls `3`, completed `0`, aborts `3`, reason `candidate-fill-soft-limit`, abort candidate count `200000`, remainingMs `79610`.
- Phase elapsed: candidate fill `186855ms`, pair upper `15608ms`, solve `0ms`.
- Event-root cheap upper: calls `2`, improvements `2`, processed anchors `13000`, residual upper `9579223`, residual gap `91051`, max source `pair-capacity`.

### P07:260

- Result: bounded, score `8568618`, maxScore `8606492`, observed upper `8631547`, gap `62929`.
- Runtime: elapsed `136515ms`, wall `138323ms`, peak `4490 MiB`, timedOut `true`, memoryLimited `true`.
- Configurations: raw `144`, active `108`, started `13`, completed `12`, root-pruned `0`.
- Exact join: calls `13`, completed `12`, aborts `1`, reason `candidate-fill-pair-refine`, abort candidate count `236383`, remainingMs `163486`.
- Phase elapsed: candidate fill `32293ms`, pair upper `43544ms`, solve `13368ms`.

### P08:260

- Result: bounded, score `8912225`, maxScore `8998562`, observed upper `9343762`, gap `431537`.
- Runtime: elapsed `300304ms`, wall `300336ms`, peak `2182 MiB`, timedOut `true`, memoryLimited `false`.
- Configurations: raw `144`, active `108`, started `1`, completed `0`, root-pruned `0`.
- Exact join: calls `1`, completed `0`, aborts `1`, reason `solve-timeout`, abort candidate count `333675`, remainingMs `0`.
- Phase elapsed: candidate fill `136986ms`, pair upper `8447ms`, solve `137818ms`.

### P08:323

- Result: bounded, score `9249509`, maxScore `9368642`, observed upper `9672438`, gap `422929`.
- Runtime: elapsed `300082ms`, wall `300135ms`, peak `2219 MiB`, timedOut `true`, memoryLimited `false`.
- Configurations: raw `144`, active `108`, started `1`, completed `0`, root-pruned `0`.
- Exact join: calls `1`, completed `0`, aborts `1`, reason `solve-timeout`, abort candidate count `400634`, remainingMs `0`.
- Phase elapsed: candidate fill `71240ms`, pair upper `4453ms`, solve `208170ms`.

### P09:323

- Result: bounded, score `9136184`, maxScore `9204091`, observed upper `9674403`, gap `538219`.
- Runtime: elapsed `300117ms`, wall `300512ms`, peak `2446 MiB`, timedOut `true`, memoryLimited `false`.
- Configurations: raw `144`, active `108`, started `1`, completed `0`, root-pruned `0`.
- Exact join: calls `1`, completed `0`, aborts `1`, reason `solve-timeout`, abort candidate count `235017`, remainingMs `0`.
- Phase elapsed: candidate fill `106327ms`, pair upper `9330ms`, solve `151179ms`.

### P10:260

- Result: bounded, score `8617963`, maxScore `8681365`, observed upper `8962866`, gap `344903`.
- Runtime: elapsed `300023ms`, wall `300323ms`, peak `2496 MiB`, timedOut `true`, memoryLimited `false`.
- Configurations: raw `144`, active `108`, started `1`, completed `0`, root-pruned `0`.
- Exact join: calls `1`, completed `0`, aborts `1`, reason `solve-timeout`, abort candidate count `370885`, remainingMs `0`.
- Phase elapsed: candidate fill `71556ms`, pair upper `6689ms`, solve `195906ms`.

## Failure Analysis

This run confirms that the current conservative no-GC setup is not a stable `37/40` or `40/40` checkpoint. The bounded rows split into three failure families.

- `P06:323` is an unclosed event-root frontier. It did not hit the global deadline or memory guard, but exact candidate fill hit the `200000` soft limit three times. The cheap upper improved the local frontier to residual gap `91051`, but the global result was still dominated by a wider observed upper, leaving gap `447414`.
- `P07:260` is the only memory-guard bounded row. It reached peak `4490 MiB` against the `4488 MiB` soft limit during `candidate-fill-pair-refine`; the remaining proof gap was small at `62929`, so this is primarily a stability/headroom problem rather than the same proof-frontier shape as `P06:323`.
- `P08:260`, `P08:323`, `P09:323`, and `P10:260` are 300s deadline proof-frontier rows. They did not hit memory guard, but the first started configuration consumed the budget and aborted as `solve-timeout`. These rows need either a more efficient solve/proof order or a sharper pre-solve certificate; simply raising memory does not address them.

Historical note: the lower `P06:323` gap around `143279` came from rejected diagnostic settings such as late repair / guarded capacity-tail variants. Those settings reduced the reported upper in a single diagnostic path but did not convert the case to exact and were not accepted as a stable 40-case configuration. They should not be mixed with this consolidation baseline.

## Recommendation

Stop treating the current branch as a near-40/40 algorithm candidate. Preserve this commit as the current reproducible baseline and shift the next work from speculative seed/probe tuning to stability and proof-cost consolidation:

- Keep the no-GC, no-debug process-per-case matrix as the acceptance surface.
- Use the six bounded rows as the fixed hard set for any future change: `P06:323`, `P07:260`, `P08:260`, `P08:323`, `P09:323`, and `P10:260`.
- Treat `P07:260` separately as a memory-headroom case. A production-safe solution should reduce retained working set or local peak rather than depend on `--expose-gc`.
- Treat the four solve-timeout rows as proof-order / solve-efficiency cases. They need confirmation with proof ledger or targeted non-debug diagnostics before adding new algorithm patches.
- Treat `P06:323` as the event-root frontier case. It remains the best diagnostic for whether cheap-upper/frontier work actually lowers the global certificate, not just a local residual.
