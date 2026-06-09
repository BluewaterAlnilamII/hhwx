# Medley 40-Case Exact Report - 2026-06-09 00:10 CST

## Run Metadata

- Branch: `dev/medley-greedy-seed-acceptance`
- Commit: `edf3879`
- Raw result: `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T00-10-29-221Z.json`
- Baseline raw result: `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-08T11-42-34-917Z.json`
- Fixture: `temp/bandori-team-builder/real-profile-medley-p01-p10-40exact-fixture.json`
- Runner variant: `baselineCleanIsolatedProcessPerCase`
- Duration per case: `300000ms`
- Node options: `--max-old-space-size=8192`
- Profiles: `P01` through `P10`
- Events: `none`, `244`, `260`, `323`
- Songs: `385`, `193`, `619`

## Summary

| metric | current | clean 2026-06-08 baseline | delta |
| --- | ---: | ---: | ---: |
| exact cases | 37 | 35 | 2 |
| bounded cases | 3 | 5 | -2 |
| failed subprocesses | 0 | 0 | 0 |
| timed out cases | 1 | 5 | -4 |
| memory-limited cases | 1 | 5 | -4 |
| bounded gap total | 1274272 | 1819282 | -545010 |
| median elapsed ms | 18406 | 61192 | -42786 |
| p95 elapsed ms | 37598 | 194283 | -156685 |
| max elapsed ms | 39932 | 276080 | -236148 |
| peak MiB | 4203 | 4488 | -285 |

Result: this run reaches `37/40` exact. It improves the clean pinned baseline by converting `P07:244` and `P08:244` to exact, while keeping bounded-gap total and peak memory below baseline. It does not meet the active `38/40` stage target yet.

## Bounded Cases

| case | score | gap | elapsed ms | peak MiB | timed out | memory limited | reason | completed configs | root pruned |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | ---: | ---: |
| P03:260 | 9213846 | 370472 | 16539 | 1979 | no | no | bounded-skip | 0 | 102 |
| P06:323 | 9486961 | 607201 | 12218 | 1273 | no | no | bounded-skip | 0 | 99 |
| P07:260 | 8568618 | 296599 | 39932 | 4203 | yes | yes | candidate-fill-generator-aborted | 1 | 0 |

Bounded-case notes:

- `P03:260` is now a controlled bounded skip instead of a memory-heavy exact-join path. The root slot-boundary guard keeps the same gap as the baseline (`370472`) while reducing elapsed and peak memory substantially.
- `P06:323` is now a controlled large-gap event skip. The gap remains baseline-equivalent (`607201`), but the run no longer needs the previous initial-candidate memory path.
- `P07:260` is the only remaining memory-limited bounded row. It still aborts at `candidate-fill-generator-aborted`, gap `296599`, peak `4203 MiB`. This is the best next target for a true 38/40 improvement.

## Full Case Table

| case | exact | elapsed ms | peak MiB | gap | reason | completed configs | root pruned |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: |
| P01:none | yes | 18406 | 1685 | 0 | exact | 5 | 67 |
| P01:244 | yes | 12190 | 1427 | 0 | exact | 6 | 66 |
| P01:260 | yes | 18203 | 2145 | 0 | exact | 4 | 68 |
| P01:323 | yes | 17252 | 1883 | 0 | exact | 6 | 66 |
| P02:none | yes | 31571 | 2772 | 0 | exact | 12 | 96 |
| P02:244 | yes | 19232 | 1877 | 0 | exact | 3 | 105 |
| P02:260 | yes | 19612 | 1993 | 0 | exact | 3 | 105 |
| P02:323 | yes | 28153 | 2649 | 0 | exact | 12 | 96 |
| P03:none | yes | 37843 | 2877 | 0 | exact | 15 | 93 |
| P03:244 | yes | 30542 | 2471 | 0 | exact | 9 | 99 |
| P03:260 | no | 16539 | 1979 | 370472 | bounded-skip | 0 | 102 |
| P03:323 | yes | 20761 | 1994 | 0 | exact | 3 | 105 |
| P04:none | yes | 17235 | 1932 | 0 | exact | 3 | 93 |
| P04:244 | yes | 19494 | 1896 | 0 | exact | 3 | 93 |
| P04:260 | yes | 17400 | 1970 | 0 | exact | 3 | 93 |
| P04:323 | yes | 12281 | 1307 | 0 | exact | 6 | 90 |
| P05:none | yes | 20074 | 2495 | 0 | exact | 5 | 67 |
| P05:244 | yes | 18532 | 2476 | 0 | exact | 4 | 68 |
| P05:260 | yes | 15997 | 1954 | 0 | exact | 4 | 68 |
| P05:323 | yes | 18260 | 2186 | 0 | exact | 6 | 66 |
| P06:none | yes | 30199 | 2893 | 0 | exact | 12 | 96 |
| P06:244 | yes | 18481 | 1686 | 0 | exact | 15 | 93 |
| P06:260 | yes | 29470 | 2819 | 0 | exact | 12 | 96 |
| P06:323 | no | 12218 | 1273 | 607201 | bounded-skip | 0 | 99 |
| P07:none | yes | 21113 | 2534 | 0 | exact | 4 | 104 |
| P07:244 | yes | 26516 | 2333 | 0 | exact | 21 | 87 |
| P07:260 | no | 39932 | 4203 | 296599 | candidate-fill-generator-aborted | 1 | 0 |
| P07:323 | yes | 25963 | 2695 | 0 | exact | 6 | 102 |
| P08:none | yes | 12526 | 1251 | 0 | exact | 18 | 90 |
| P08:244 | yes | 12930 | 1163 | 0 | exact | 3 | 105 |
| P08:260 | yes | 13346 | 1204 | 0 | exact | 20 | 88 |
| P08:323 | yes | 13358 | 1101 | 0 | exact | 3 | 105 |
| P09:none | yes | 27174 | 2487 | 0 | exact | 12 | 96 |
| P09:244 | yes | 15181 | 1465 | 0 | exact | 3 | 105 |
| P09:260 | yes | 17730 | 1570 | 0 | exact | 3 | 105 |
| P09:323 | yes | 18686 | 2038 | 0 | exact | 10 | 98 |
| P10:none | yes | 17343 | 2020 | 0 | exact | 6 | 102 |
| P10:244 | yes | 37598 | 2866 | 0 | exact | 12 | 96 |
| P10:260 | yes | 15851 | 2032 | 0 | exact | 6 | 102 |
| P10:323 | yes | 14987 | 1724 | 0 | exact | 3 | 105 |

## Slowest Exact Cases

| case | elapsed ms | peak MiB |
| --- | ---: | ---: |
| P03:none | 37843 | 2877 |
| P10:244 | 37598 | 2866 |
| P02:none | 31571 | 2772 |
| P03:244 | 30542 | 2471 |
| P06:none | 30199 | 2893 |
| P06:260 | 29470 | 2819 |
| P02:323 | 28153 | 2649 |
| P09:none | 27174 | 2487 |
| P07:244 | 26516 | 2333 |
| P07:323 | 25963 | 2695 |

## Highest Memory Cases

| case | exact | peak MiB | elapsed ms | gap |
| --- | --- | ---: | ---: | ---: |
| P07:260 | no | 4203 | 39932 | 296599 |
| P06:none | yes | 2893 | 30199 | 0 |
| P03:none | yes | 2877 | 37843 | 0 |
| P10:244 | yes | 2866 | 37598 | 0 |
| P06:260 | yes | 2819 | 29470 | 0 |
| P02:none | yes | 2772 | 31571 | 0 |
| P07:323 | yes | 2695 | 25963 | 0 |
| P02:323 | yes | 2649 | 28153 | 0 |
| P07:none | yes | 2534 | 21113 | 0 |
| P05:none | yes | 2495 | 20074 | 0 |

## Failure Analysis

- The latest changes are not proof-strength improvements; they are controller guards that avoid spending memory on event frontiers whose incumbent and root upper already define a stable bounded gap.
- The two newly exact cases versus the clean baseline are `P07:244` and `P08:244`, both closed by the low-memory initial sync path without exceeding the memory gate.
- `P03:260` and `P06:323` remain bounded by design in this run. Their previous heavy proof attempts did not reduce the final gap, so skipping them improves runtime and peak memory but does not move exact count.
- `P07:260` is the remaining blocker for a 38/40 stage pass. It still needs a proof-strength change rather than another skip: candidate fill reaches a memory-limited frontier after one completed configuration.

## Next Recommendations

1. Treat `37/40` as a stabilized checkpoint, not the final algorithm target.
2. Focus the next 38/40 attempt on `P07:260` first, because it is now the only remaining memory-limited case and converting it would reach 38/40 without relying on skip semantics.
3. Keep `P03:260` and `P06:323` as bounded-control guardrails: future proof improvements must not widen their gaps or reintroduce high memory.
4. The next generic proof path should reduce exact candidate/frontier residency for candidate-fill generator aborts, especially pair/candidate materialization in `P07:260`, before revisiting broader exact proof scheduling.

