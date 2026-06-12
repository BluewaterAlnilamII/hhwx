# Medley 40-Case Exact Report - 2026-06-12 18:58 CST - Main Safe Backport

## Run Metadata

- Branch: `perf/medley-safe-main-backport`
- Commit: `3c47e3a`
- Base hotfix branch: `fix/medley-exactness-main`
- Hotfix PR: `#31`
- Raw full result: `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-12T09-47-29-642Z.json`
- Raw hard-set result: `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-12T09-23-33-628Z.json`
- Raw P08:323 post-full confirmation: `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-12T10-54-13-083Z.json`
- Fixture: `temp/bandori-team-builder/real-profile-medley-p01-p10-40exact-fixture.json`
- Runner variant: `baselineCleanIsolatedProcessPerCase`
- Duration per case: `300000ms`
- Node options: `--max-old-space-size=8192`
- Node args: none; no `--expose-gc`, no `global.gc`
- Profiles: `P01` through `P10`
- Events: `none`, `244`, `260`, `323`
- Songs: `385`, `193`, `619`
- Optimization JSON: `{"memorySoftLimitMiB":4488,"exactNodeSoftLimit":5000000,"skipConfigurationSeedingWhenMemoryHeadroomBelowMiB":1600,"debugConfigurationTrace":false}`

## Static Validation

- `npm.cmd run typecheck`: pass
- `npm.cmd run lint`: pass with existing 30 warnings
- `npm.cmd run build`: pass with non-sensitive Supabase placeholder env
- `git diff --check`: pass
- `node --check temp\bandori-team-builder\run-medley-40case-isolated.cjs`: pass
- `node --check temp\bandori-team-builder\benchmark-real-profiles-medley.cjs`: pass

## Summary

| metric | full 40 | hard set | hotfix hard-set baseline |
| --- | ---: | ---: | ---: |
| exact cases | 35/40 | 5/9 | 4/9 |
| bounded cases | 5/40 | 4/9 | 5/9 |
| failed subprocesses | 0 | 0 | 0 |
| timed out cases | 2 | 1 | 2 |
| memory-limited cases | 2 | 1 | 2 |
| bounded gap total | 1316743 | 1099837 | 1254720 |
| median elapsed ms | 74145 | 130041 | 175901 |
| p95 elapsed ms | 223847 | 292750 | 300278 |
| max elapsed ms | 295718 | 292750 | 300278 |
| peak MiB | 4489 | 4491 | 4491 |

Result: this branch is not ready to merge as a performance PR. The hard-set result improves over the hotfix baseline, but the full 40-case acceptance has an instability: `P08:323` was exact in the hotfix hard-set, exact in the same branch single-case confirmation, and exact in the same branch hard-set, but became bounded in the full 40-case run.

Correctness hotfix status is separate: `P06:244` remains exact with score `9066914`; no old drifting exact score was observed in this run.

## Implemented Candidate Changes

- Kept: correctness hotfix requiring explicit opt-in for `enableLowMemoryInitialCandidateSync`.
- Kept in perf branch: same-coarse sibling incumbent re-evaluation before bounded dominated-root skip.
- Rejected and reverted: candidate key residency shortcut, omitted `cardInstanceKeys`, disabled score-only cache, lazy candidate key set, and delayed key rebuild after failed pair refine. These caused `P08:323` to regress from exact to bounded in hard-set testing.

## Bounded Cases

| case | score | upper | gap | elapsed ms | peak MiB | reason | configs completed/root-pruned | exact-join calls/completed/abort | notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- |
| P03:260 | 9213846 | 9584318 | 370472 | 60736 | 3205 | candidate-fill-generator-aborted | 0/0 | 1/0/1 | area RaiseASuilen/happy/performance; candidates 11585/5508/3679 |
| P06:323 | 9488172 | 10094162 | 605990 | 13120 | 1142 | unclosed root upper gap | 0/99 | 0/0/0 | area PastelPalettes/cool/technique |
| P07:260 | 8568618 | 8631547 | 62929 | 142868 | 4489 | pair-upper | 12/0 | 13/12/1 | area PastelPalettes/powerful/technique |
| P08:260 | 8912922 | 8975605 | 62683 | 295718 | 2312 | unclosed root upper gap | 3/88 | 3/3/0 | area HelloHappyWorld/happy/performance; candidates 263120/97423/39489 |
| P08:323 | 9249509 | 9464178 | 214669 | 209384 | 2398 | exact-join abort reason missing | 2/105 | 3/2/1 | area PastelPalettes/cool/performance; candidates 393475/145516/18174 |

## Full Case Table

| case | exact | score | gap | elapsed ms | peak MiB | timed out | memory limited | reason |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| P01:none | yes | 7742856 | 0 | 39960 | 1960 | no | no | exact |
| P01:244 | yes | 8560306 | 0 | 41812 | 1845 | no | no | exact |
| P01:260 | yes | 8475074 | 0 | 33854 | 2097 | no | no | exact |
| P01:323 | yes | 8436221 | 0 | 39154 | 1769 | no | no | exact |
| P02:none | yes | 8051829 | 0 | 74145 | 2080 | no | no | exact |
| P02:244 | yes | 8970468 | 0 | 53029 | 1812 | no | no | exact |
| P02:260 | yes | 8970468 | 0 | 44852 | 1800 | no | no | exact |
| P02:323 | yes | 8615212 | 0 | 66453 | 1922 | no | no | exact |
| P03:none | yes | 8062642 | 0 | 145385 | 3054 | no | no | exact |
| P03:244 | yes | 9070884 | 0 | 112587 | 1794 | no | no | exact |
| P03:260 | no | 9213846 | 370472 | 60736 | 3205 | yes | yes | candidate-fill-generator-aborted |
| P03:323 | yes | 10229319 | 0 | 157228 | 2233 | no | no | exact |
| P04:none | yes | 8086596 | 0 | 33165 | 2202 | no | no | exact |
| P04:244 | yes | 8960938 | 0 | 41567 | 1572 | no | no | exact |
| P04:260 | yes | 9024557 | 0 | 53398 | 1539 | no | no | exact |
| P04:323 | yes | 8660394 | 0 | 87456 | 1151 | no | no | exact |
| P05:none | yes | 7834406 | 0 | 66853 | 1214 | no | no | exact |
| P05:244 | yes | 8608237 | 0 | 98466 | 1601 | no | no | exact |
| P05:260 | yes | 8597270 | 0 | 77692 | 1525 | no | no | exact |
| P05:323 | yes | 8392101 | 0 | 42369 | 1739 | no | no | exact |
| P06:none | yes | 8392231 | 0 | 74785 | 2229 | no | no | exact |
| P06:244 | yes | 9066914 | 0 | 124335 | 1995 | no | no | exact |
| P06:260 | yes | 9620924 | 0 | 135461 | 1887 | no | no | exact |
| P06:323 | no | 9488172 | 605990 | 13120 | 1142 | no | no | unclosed root upper gap |
| P07:none | yes | 7954668 | 0 | 59604 | 1954 | no | no | exact |
| P07:244 | yes | 8551590 | 0 | 223847 | 3342 | no | no | exact |
| P07:260 | no | 8568618 | 62929 | 142868 | 4489 | yes | yes | pair-upper |
| P07:323 | yes | 9776671 | 0 | 82717 | 1937 | no | no | exact |
| P08:none | yes | 7990800 | 0 | 126768 | 2611 | no | no | exact |
| P08:244 | yes | 9758172 | 0 | 130489 | 3319 | no | no | exact |
| P08:260 | no | 8912922 | 62683 | 295718 | 2312 | no | no | unclosed root upper gap |
| P08:323 | no | 9249509 | 214669 | 209384 | 2398 | no | no | exact-join abort reason missing |
| P09:none | yes | 8183525 | 0 | 91216 | 1555 | no | no | exact |
| P09:244 | yes | 9172542 | 0 | 34810 | 1392 | no | no | exact |
| P09:260 | yes | 9160727 | 0 | 36416 | 1515 | no | no | exact |
| P09:323 | yes | 9136184 | 0 | 156255 | 2533 | no | no | exact |
| P10:none | yes | 7817586 | 0 | 56351 | 1782 | no | no | exact |
| P10:244 | yes | 8676823 | 0 | 193122 | 2781 | no | no | exact |
| P10:260 | yes | 8620323 | 0 | 223992 | 3414 | no | no | exact |
| P10:323 | yes | 10105963 | 0 | 36753 | 1583 | no | no | exact |

## Failure Analysis

- `P03:260` is now a memory/deadline guard failure during candidate fill. The first exact-join call aborted after only `11585/5508/3679` candidates, so this row is not proof-frontier-complete.
- `P06:323` is still a large root-upper gap case. No exact join was attempted; same-coarse re-evaluation improved the incumbent by `1211`, but the remaining gap is still `605990`.
- `P07:260` remains the primary memory-limited exact-join case. It completed `12` configurations, then aborted in pair-upper refinement with peak `4489MiB`.
- `P08:260` completed exact join on `3` configurations but left a root frontier gap of `62683`. This is worse than the hotfix hard-set baseline gap `39053`, so same-coarse re-evaluation is not monotonic on bounded gap quality.
- `P08:323` is unstable in this evidence set. Full 40 returned bounded with one exact-join abort but no flattened abort reason; immediately afterward, a single-case confirmation returned exact in `215494ms` at peak `2563MiB`. This blocks treating the perf branch as acceptance-ready.

## Recommendation

- Merge or continue the correctness hotfix independently; it fixes the false exact risk and keeps `P06:244` stable at `9066914`.
- Do not open or merge the perf PR from this evidence alone. Keep `perf/medley-safe-main-backport` as a candidate branch until `P08:323` is stable in repeated full 40 or repeated interleaved hard/full confirmation.
- Do not reintroduce the rejected candidate residency shortcut. It directly caused `P08:323` hard-set exact-to-bounded regression.
- Next low-risk step, if performance work continues: add missing exact-join abort reason plumbing for the `P08:323` full-run failure, then rerun `P08:323` interleaved with neighboring P08/P09 rows to isolate whether the instability comes from runner/process conditions, memory sampling, or nondeterministic frontier order.
