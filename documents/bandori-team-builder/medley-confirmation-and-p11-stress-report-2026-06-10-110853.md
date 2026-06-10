# Medley Confirmation And P11 Stress Report - 2026-06-10 11:08 CST

## Run Metadata

- Branch: `dev/medley-39-exact-frontier`
- Commit before report: `916913d`
- Pinned 40/40 report:
  `documents/bandori-team-builder/medley-40-exact-report-2026-06-10-014527.md`
- Pinned 40/40 raw result:
  `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-09T17-06-33-445Z.json`
- P11 fixture:
  `temp/bandori-team-builder/real-profile-medley-p11-stress-fixture.json`
- P11 profile id: `7627fd2f-8a29-4462-99ee-7085789d7561`
- P11 profile kind/card count: `manual` / `2112`
- Songs: `385`, `193`, `619`

## Non-Debug Confirmation

Goal: confirm whether the `40/40` checkpoint still holds after removing debug
trace and memory-attribution instrumentation.

Result: not confirmed. The fully non-debug path is rejected for promotion.

| variant | raw result | scope | result |
| --- | --- | --- | --- |
| no debug, no GC probe | `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-10T02-02-20-838Z-partial.json` | killed after `14` rows | `P03:260` bounded, gap `370472`, `58282ms`, peak `3204 MiB`, timed out and memory-limited |
| no debug, GC probe, single case | `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-10T02-11-07-420Z.json` | `P03:260` only | exact, `150527ms`, peak `3029 MiB` |
| no debug, GC probe, matrix prefix | `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-10T02-14-34-205Z-partial.json` | killed after `14` rows | `P03:260` bounded, gap `356069`, `103647ms`, peak `3216 MiB`, timed out and memory-limited |

Interpretation:

- `enableLowMemoryInitialCandidateSyncGcProbe` is not pure observation in this
  path. Removing it can change whether `P03:260` proves exact.
- Adding the GC probe back is not sufficient to make the non-debug full matrix
  stable. The single-case pass and matrix-prefix failure mean `P03:260` remains
  close to a runtime/heap frontier.
- The pinned `40/40` checkpoint remains valid, but it should not be promoted as
  a non-debug default until the GC/probe behavior is converted into an explicit,
  production-named memory recovery path and revalidated.

## P11 Smoke

Run id: `p11-stress-smoke-90s-20260610-v2`

Raw result:
`temp/bandori-team-builder/medley-40-exact-isolated-2026-06-10T02-37-37-697Z.json`

| case | exact | elapsed ms | peak MiB | gap | timed out | memory-limited |
| --- | --- | ---: | ---: | ---: | --- | --- |
| P11:none | no | 90048 | 1257 | 215893 | yes | no |
| P11:244 | no | 90081 | 1225 | 369450 | yes | no |
| P11:260 | no | 90028 | 1234 | 191057 | yes | no |
| P11:323 | no | 90046 | 1173 | 265076 | yes | no |

Summary: `0/4` exact, bounded-gap total `1041476`, peak `1257 MiB`, no failed
subprocess, no OOM, no memory-limited row.

## P11 Full 300s

Run id: `p11-stress-full-300s-20260610`

Raw result:
`temp/bandori-team-builder/medley-40-exact-isolated-2026-06-10T02-45-04-510Z.json`

| case | exact | elapsed ms | peak MiB | gap | timed out | memory-limited |
| --- | --- | ---: | ---: | ---: | --- | --- |
| P11:none | no | 300077 | 1282 | 215893 | yes | no |
| P11:244 | no | 300049 | 1199 | 369450 | yes | no |
| P11:260 | no | 300040 | 1217 | 191057 | yes | no |
| P11:323 | no | 300052 | 1216 | 265076 | yes | no |

Summary: `0/4` exact, bounded-gap total `1041476`, peak `1282 MiB`, no failed
subprocess, no OOM, no memory-limited row.

## Analysis

- P11 did not improve from 90s to 300s: every gap is identical between the
  smoke and full runs. The additional 210s per case did not close any observed
  proof frontier.
- P11 is not currently blocked by the memory wall. Peak sampled heap stayed near
  `1.3 GiB`, far below the `4488 MiB` soft limit.
- The `skipConfigurationSeedingWhenMemoryHeadroomBelowMiB=1600` fix that
  converted `P03:260` does not materially help P11, because P11 is not suffering
  from low-headroom no-gain seeding.
- P11 should remain outside the P01-P10 `40/40` acceptance target. It is useful
  as a separate proof-frontier stress case.

## Recommendations

1. Keep the `40/40` P01-P10 checkpoint pinned, but do not treat the current
   debug/probe-heavy parameter set as production-promotable.
2. Convert the GC probe dependency into an explicit opt-in memory recovery
   option before another non-debug full confirmation.
3. For P11, prioritize proof frontier diagnostics over memory work: identify the
   unclosed coarse configurations and their root/effective upper sources.
4. Do not spend more time increasing P11 timeout without changing proof order or
   upper-bound tightening; the unchanged 90s and 300s gaps show the current
   search is not making closing progress on those frontiers.
