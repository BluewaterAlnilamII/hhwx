# Medley 40/40 Exact Report - 2026-06-10 11:53 CST - No GC R1

## Summary

- Raw result:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-10T03-53-54-972Z.json`
- Runner: `temp/bandori-team-builder/run-medley-40case-isolated.cjs`
- Fixture:
  `temp/bandori-team-builder/real-profile-medley-p01-p10-40exact-fixture.json`
- Scope: `P01` through `P10`, events `none`, `244`, `260`, `323`, all-scope
  maximize.
- Runtime: process-per-case isolated, `NODE_OPTIONS=--max-old-space-size=8192`,
  no `--expose-gc`, `debugConfigurationTrace=false`, no GC probe.
- Result: `40/40` exact, bounded-gap total `0`, failed subprocesses `0`,
  timed out rows `0`, memory-limited rows `0`.
- Timing: median `27148ms`, p95 `54564ms`, max `140346ms`.
- Peak working set: `3520 MiB`.

## Optimization Parameters

```json
{
  "memorySoftLimitMiB": 4488,
  "exactNodeSoftLimit": 5000000,
  "skipConfigurationSeedingWhenMemoryHeadroomBelowMiB": 1600,
  "lowMemoryInitialCandidateSyncMaxSameCoarseProofElapsedMs": 60000,
  "lowMemoryInitialCandidateSyncMinMemoryHeadroomMiB": 0,
  "lowMemoryInitialCandidateSyncLocalAbortOnly": true,
  "lowMemoryInitialCandidateSyncLightUpper": true,
  "lowMemoryInitialCandidateSyncTimeboxMs": 60000,
  "enableEventRootFrontierProbe": true,
  "eventRootFrontierProbeTimeboxMs": 240000,
  "eventRootFrontierProbeCandidateSoftLimit": 200000,
  "eventRootFrontierProbeMinMemoryHeadroomMiB": 0
}
```

## Case Details

| profile | event | exact | elapsed ms | peak MiB | score | gap | timedOut | memoryLimited | abort reason |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| P01 | none | yes | 23845 | 1782 | 7742856 | 0 | false | false |  |
| P01 | 244 | yes | 15477 | 1334 | 8554506 | 0 | false | false |  |
| P01 | 260 | yes | 20546 | 1650 | 8475074 | 0 | false | false |  |
| P01 | 323 | yes | 14992 | 1015 | 8436221 | 0 | false | false |  |
| P02 | none | yes | 50505 | 2471 | 8051829 | 0 | false | false |  |
| P02 | 244 | yes | 27502 | 1050 | 8970468 | 0 | false | false |  |
| P02 | 260 | yes | 31310 | 1009 | 8970468 | 0 | false | false |  |
| P02 | 323 | yes | 47677 | 2000 | 8615212 | 0 | false | false |  |
| P03 | none | yes | 61766 | 2308 | 8062642 | 0 | false | false |  |
| P03 | 244 | yes | 37164 | 1440 | 9070884 | 0 | false | false |  |
| P03 | 260 | yes | 140346 | 3520 | 9213846 | 0 | false | false |  |
| P03 | 323 | yes | 27148 | 1336 | 10229319 | 0 | false | false |  |
| P04 | none | yes | 37029 | 1853 | 8086596 | 0 | false | false |  |
| P04 | 244 | yes | 30367 | 1087 | 8960938 | 0 | false | false |  |
| P04 | 260 | yes | 25482 | 1668 | 9024557 | 0 | false | false |  |
| P04 | 323 | yes | 15924 | 1099 | 8658785 | 0 | false | false |  |
| P05 | none | yes | 26859 | 2647 | 7834406 | 0 | false | false |  |
| P05 | 244 | yes | 23544 | 1537 | 8598474 | 0 | false | false |  |
| P05 | 260 | yes | 22008 | 1740 | 8597270 | 0 | false | false |  |
| P05 | 323 | yes | 25165 | 2039 | 8392101 | 0 | false | false |  |
| P06 | none | yes | 44270 | 2298 | 8392231 | 0 | false | false |  |
| P06 | 244 | yes | 25225 | 1957 | 9055411 | 0 | false | false |  |
| P06 | 260 | yes | 34377 | 1400 | 9620924 | 0 | false | false |  |
| P06 | 323 | yes | 45969 | 3251 | 9488172 | 0 | false | false |  |
| P07 | none | yes | 33876 | 2068 | 7954668 | 0 | false | false |  |
| P07 | 244 | yes | 24605 | 1350 | 8476866 | 0 | false | false |  |
| P07 | 260 | yes | 47902 | 3237 | 8568618 | 0 | false | false |  |
| P07 | 323 | yes | 36418 | 1959 | 9776671 | 0 | false | false |  |
| P08 | none | yes | 17760 | 1221 | 7990800 | 0 | false | false |  |
| P08 | 244 | yes | 31489 | 1633 | 9754093 | 0 | false | false |  |
| P08 | 260 | yes | 40132 | 1339 | 8912922 | 0 | false | false |  |
| P08 | 323 | yes | 46007 | 1886 | 9229933 | 0 | false | false |  |
| P09 | none | yes | 22433 | 1398 | 8174732 | 0 | false | false |  |
| P09 | 244 | yes | 24636 | 1362 | 9172542 | 0 | false | false |  |
| P09 | 260 | yes | 24434 | 1452 | 9160727 | 0 | false | false |  |
| P09 | 323 | yes | 29194 | 1482 | 9136184 | 0 | false | false |  |
| P10 | none | yes | 25580 | 1943 | 7817586 | 0 | false | false |  |
| P10 | 244 | yes | 54564 | 2296 | 8676823 | 0 | false | false |  |
| P10 | 260 | yes | 22979 | 1793 | 8617963 | 0 | false | false |  |
| P10 | 323 | yes | 22572 | 1470 | 10105963 | 0 | false | false |  |

## Failure Analysis

No bounded rows were observed in this run, so there is no active failure row to
analyze. The previous no-GC failure shape was `P03:260` aborting during exact
candidate fill under the first full-width event root local memory cap. The
current run closed `P03:260` exactly in `140346ms` with peak `3520 MiB`.

## Recommendation

This run is accepted as no-GC confirmation run 1, but not as final stability
proof. Continue with at least two additional full 40-case no-GC non-debug runs.
If either run regresses, compare the failing row against the P03 repeat gate and
hard guard results before introducing broader proof-frontier changes.
