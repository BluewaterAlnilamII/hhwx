# Medley 40-Case Exact Report - 2026-06-09 10:48 CST - Rejected

## Run Metadata

- Branch: `dev/medley-greedy-seed-acceptance`
- Code checkpoint: after `8b43640`, before runner tracking commit `6d72c48`
- Raw result: `temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-09T02-48-05-910Z.json`
- Fixture: `temp/bandori-team-builder/real-profile-medley-p01-p10-40exact-fixture.json`
- Runner variant: single Node process, all 40 rows in one process
- Duration per case: `300000ms`
- Node options: `--max-old-space-size=8192`
- Node args: `--expose-gc`
- Profiles: `P01` through `P10`
- Events: `none`, `244`, `260`, `323`
- Songs: `385`, `193`, `619`
- Optimization JSON: same as the accepted `2026-06-09 11:17 CST` isolated run.

## Summary

| metric | value |
| --- | ---: |
| exact cases | 24 |
| bounded cases | 16 |
| failed subprocesses | 0 |
| all median elapsed ms | 35323 |
| all p95 elapsed ms | 61865 |
| all max elapsed ms | 68165 |
| peak MiB | 4585 |

Result: rejected as acceptance evidence. The sample set was correct (`P01` through `P10` only), but the runner reused one Node process for all cases. Heap pressure carried forward after `P07:260`, and later rows became memory-limited bounded or empty bounded rows.

## Bounded Rows

| case | exact | elapsed ms | peak MiB | gap | reason |
| --- | --- | ---: | ---: | ---: | --- |
| P03:260 | no | 56515 | 1995 | 370472 | full-width-event-skip-seeding |
| P06:323 | no | 41858 | 2042 | 607201 | large-gap-event-skip-seeding |
| P07:260 | no | 48946 | 4561 | 290597 | exact-after-seeding-proved |
| P07:323 | no | 14069 | 4543 | 491552 | bounded |
| P08:none | no | 8481 | 4585 |  | bounded |
| P08:244 | no | 9660 | 4554 |  | bounded |
| P08:260 | no | 12771 | 4566 | 434056 | bounded |
| P08:323 | no | 9582 | 4546 |  | bounded |
| P09:none | no | 7672 | 4563 |  | bounded |
| P09:244 | no | 9013 | 4532 |  | bounded |
| P09:260 | no | 10510 | 4531 |  | bounded |
| P09:323 | no | 10749 | 4533 |  | bounded |
| P10:none | no | 6829 | 4530 |  | bounded |
| P10:244 | no | 7158 | 4521 |  | bounded |
| P10:260 | no | 7194 | 4519 |  | bounded |
| P10:323 | no | 7294 | 4523 |  | bounded |

## Failure Analysis

- This run did not mix in old samples; it used the same `P01` through `P10` fixture.
- The failure mode is runner/process contamination. `P07:260` raised the process heap near the soft limit, and subsequent rows started under high memory pressure.
- Rows from `P08` onward are not algorithm-quality evidence because several returned `null` score/gap or immediate bounded state before normal proof work.
- The rejected run is still useful as evidence that memory-sensitive medley acceptance must remain process-per-case isolated.

## Next Recommendations

1. Do not compare algorithm quality against this same-process run.
2. Keep all acceptance and stage-gate runs on `run-medley-40case-isolated.cjs`.
3. Preserve `HHWX_ISOLATED_NODE_ARGS=--expose-gc` and pass the optimization JSON explicitly through the isolated runner.
4. Use this rejected result only as a runner hygiene warning in future reports.
