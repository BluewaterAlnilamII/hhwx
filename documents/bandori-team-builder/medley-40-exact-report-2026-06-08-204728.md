# Medley 40-case Exact Benchmark Report

Generated: 2026-06-08T12:47:28.359Z (2026-06-08-204728 Asia/Shanghai)
Run artifact: `temp/bandori-team-builder/medley-40-exact-isolated-2026-06-08T11-42-34-917Z.json`
Fixture: `temp/bandori-team-builder/real-profile-medley-p01-p10-40exact-fixture.json`
Log directory: `temp/bandori-team-builder/logs/medley-40-exact-isolated-2026-06-08T11-42-34-917Z`

## Verdict

- Result: **35/40 exact**; stage gate **failed** because target is at least 37/40 exact.
- Bounded rows: **5**, all with `memoryLimited=true`; no failed subprocess, no stderr, no process OOM.
- Bounded gap total: **1819282**.
- Elapsed median/P95/max: **61.2s / 194.3s / 276.1s**.
- Peak sampled heap: **4488 MiB**.

This is the clean pinned-fixture baseline for this worktree because each case ran in a fresh Node process. Earlier full-matrix single-process attempts are diagnostic-only: they carried heap pressure across cases and produced invalid empty/timed-out later rows.

## Run Parameters

| Parameter | Value |
| --- | --- |
| Variant | baselineCleanIsolatedProcessPerCase |
| Branch/worktree | dev/medley-greedy-seed-acceptance / `C:\Users\bluew\.codex\worktrees\medley-prefix-seed\hhwx` |
| Case scope | P01-P10, events none, 244, 260, 323 |
| Duration | 300000 ms per case |
| Songs | 385, 193, 619; expert/expert/expert |
| Node options | --max-old-space-size=8192 |
| Node.js / npm | v24.14.0 / captured npm 11.9.0 |
| OS | Windows_NT 10.0.26200 x64 |
| Physical memory | approx 31.8 GiB |
| Supabase | fixture-only run; no live Supabase env required |
| Optimization options | default maximize path; `enablePreProofSeedWarmup=false`; `enableExactJoinPrefixSeed=false`; `debugConfigurationTrace=false` |
| Runner command | `node temp\bandori-team-builder\benchmark-real-profiles-medley.cjs` via `temp/bandori-team-builder/run-medley-40case-isolated.cjs` |

## Fixture Metadata

| Label | Source profile ID | Kind | Server | Cards | Payload size | Payload SHA-256 | Codec |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| P01 | c9a8fe39-4474-46d0-bfa4-17cef2e64fa8 | auto | 3 | 1026 | 5171 | 0d0f75c9d0c486f7764d4b3f96c949fcaba438da2d056203cb908b026b31ed31 | hhwx-profile+gzip+base64-v1 |
| P02 | 17777cc6-56e8-4d38-ae59-8373a3a71496 | auto | 3 | 1215 | 5651 | e75c27dea1dac12c453ae5c21ca8b69f2528e27949c9bfdf717933de5c60b5e0 | hhwx-profile+gzip+base64-v1 |
| P03 | 7f0ef3bc-d9a8-45fb-beb4-29369b9780f6 | auto | 3 | 1404 | 6165 | 37d646e7e4ed9bdc43d5b51d2b5766987add9bc98d7c9a650e6735291077572c | hhwx-profile+gzip+base64-v1 |
| P04 | e0090a97-254b-4e65-9855-3e845c0e379c | auto | 3 | 1102 | 5472 | 70ff51f3e2caadda83c532595e164698f066306e6e02578a66d8a7736706005f | hhwx-profile+gzip+base64-v1 |
| P05 | ac91dbd1-fb25-4a8b-b2f9-9f9429e1d1d2 | auto | 3 | 981 | 4939 | 8499b50decc8dd92427f02d8ef9aa07170dbe8c69aa6fbf6a65bdf9b25b6b4eb | hhwx-profile+gzip+base64-v1 |
| P06 | 8741fa1f-a5d9-4d0a-80e7-bfac2d683e3e | auto | 3 | 1234 | 5284 | eb23747f9e7551b5f4351a2d1327380406699e828affd572e4446d4b87f1233e | hhwx-profile+gzip+base64-v1 |
| P07 | 61fde1e7-9201-4dd8-83ae-9cb332a0a3e5 | auto | 3 | 1252 | 5784 | 759eddb4f283ca2e5b5756c0c2af57c47fe3f698876088b63c6392a7b6e9f84d | hhwx-profile+gzip+base64-v1 |
| P08 | b73b2742-48f9-4680-be88-6cce1c944ac9 | auto | 3 | 1513 | 6640 | 23bf870ea357990256f0c86990daba854ccf8ad2e3197e1f8d68b1f9ddc0c99f | hhwx-profile+gzip+base64-v1 |
| P09 | 075a0d78-6304-4fe3-a2ab-475fcd5bf30d | auto | 3 | 1367 | 6047 | afbdca62e49c4127d91c908428a0e619faea2dc23678f8b04f66f618344a6903 | hhwx-profile+gzip+base64-v1 |
| P10 | 0a116a65-7f1f-46a0-86b6-3dc8a5318602 | auto | 3 | 995 | 4796 | d630f8db209ccad20e1cdd1b584c35a97fd068e87bad5076933d1b0ee0cc0028 | hhwx-profile+gzip+base64-v1 |

## Aggregate By Event

| Event | Exact | Bounded | Gap total | Max elapsed | Max heap MiB |
| --- | ---: | ---: | ---: | ---: | ---: |
| none | 10/10 | 0 | 0 | 177.9s | 3866 |
| 244 | 8/10 | 2 | 545010 | 168.8s | 4210 |
| 260 | 8/10 | 2 | 667071 | 276.1s | 4206 |
| 323 | 9/10 | 1 | 607201 | 194.3s | 4488 |

## Aggregate By Profile

| Profile | Cards | Exact | Bounded | Gap total | Max elapsed | Max heap MiB |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| P01 | 1026 | 4/4 | 0 | 0 | 47.5s | 2374 |
| P02 | 1215 | 4/4 | 0 | 0 | 83.3s | 3302 |
| P03 | 1404 | 3/4 | 1 | 370472 | 177.9s | 4205 |
| P04 | 1102 | 4/4 | 0 | 0 | 50.5s | 2158 |
| P05 | 981 | 4/4 | 0 | 0 | 71.3s | 2586 |
| P06 | 1234 | 3/4 | 1 | 607201 | 102.4s | 4488 |
| P07 | 1252 | 2/4 | 2 | 351864 | 144.0s | 4210 |
| P08 | 1513 | 3/4 | 1 | 489745 | 276.1s | 4207 |
| P09 | 1367 | 4/4 | 0 | 0 | 139.2s | 3755 |
| P10 | 995 | 4/4 | 0 | 0 | 215.1s | 3885 |

## Per-case Results

| Profile | Cards | Event | Status | Elapsed | Peak heap MiB | Score | Observed upper | Gap | Abort reason | Completed/started configs |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| P01 | 1026 | none | exact | 43.1s | 2122 | 7742856 |  | 0 |  | 5/72 |
| P01 | 1026 | 244 | exact | 47.5s | 1790 | 8560306 |  | 0 |  | 6/72 |
| P01 | 1026 | 260 | exact | 44.8s | 2374 | 8475074 |  | 0 |  | 4/72 |
| P01 | 1026 | 323 | exact | 37.1s | 1966 | 8436221 |  | 0 |  | 6/72 |
| P02 | 1215 | none | exact | 75.0s | 2877 | 8051829 |  | 0 |  | 12/108 |
| P02 | 1215 | 244 | exact | 55.9s | 2245 | 8970468 |  | 0 |  | 3/108 |
| P02 | 1215 | 260 | exact | 53.0s | 2210 | 8970468 |  | 0 |  | 3/108 |
| P02 | 1215 | 323 | exact | 83.3s | 3302 | 8615212 |  | 0 |  | 12/108 |
| P03 | 1404 | none | exact | 177.9s | 3866 | 8062642 |  | 0 |  | 15/108 |
| P03 | 1404 | 244 | exact | 96.8s | 3544 | 9070884 |  | 0 |  | 9/108 |
| P03 | 1404 | 260 | bounded | 61.2s | 4205 | 9213846 | 9584318 | 370472 | candidate-fill-generator-aborted | 0/1 |
| P03 | 1404 | 323 | exact | 155.2s | 3366 | 10229319 |  | 0 |  | 3/108 |
| P04 | 1102 | none | exact | 32.4s | 2158 | 8086596 |  | 0 |  | 3/96 |
| P04 | 1102 | 244 | exact | 42.7s | 1919 | 8960938 |  | 0 |  | 3/96 |
| P04 | 1102 | 260 | exact | 50.5s | 1718 | 9024557 |  | 0 |  | 3/96 |
| P04 | 1102 | 323 | exact | 32.8s | 1535 | 8660394 |  | 0 |  | 6/96 |
| P05 | 981 | none | exact | 43.0s | 2586 | 7834406 |  | 0 |  | 5/72 |
| P05 | 981 | 244 | exact | 70.3s | 2182 | 8608237 |  | 0 |  | 4/72 |
| P05 | 981 | 260 | exact | 71.3s | 2107 | 8597270 |  | 0 |  | 4/72 |
| P05 | 981 | 323 | exact | 46.2s | 1957 | 8392101 |  | 0 |  | 6/72 |
| P06 | 1234 | none | exact | 76.8s | 3225 | 8392231 |  | 0 |  | 12/108 |
| P06 | 1234 | 244 | exact | 90.4s | 2457 | 9066914 |  | 0 |  | 15/108 |
| P06 | 1234 | 260 | exact | 102.4s | 3159 | 9620924 |  | 0 |  | 12/108 |
| P06 | 1234 | 323 | bounded | 41.9s | 4488 | 9486961 | 10094162 | 607201 | initial-candidate | 0/1 |
| P07 | 1252 | none | exact | 49.5s | 2710 | 7954668 |  | 0 |  | 4/108 |
| P07 | 1252 | 244 | bounded | 144.0s | 4210 | 8551590 | 8606855 | 55265 | candidate-fill-pair-refine | 16/17 |
| P07 | 1252 | 260 | bounded | 61.2s | 4206 | 8568618 | 8865217 | 296599 | memory-soft-limit | 1/2 |
| P07 | 1252 | 323 | exact | 70.8s | 2611 | 9776671 |  | 0 |  | 6/108 |
| P08 | 1513 | none | exact | 115.8s | 3141 | 7990800 |  | 0 |  | 18/108 |
| P08 | 1513 | 244 | bounded | 83.6s | 4207 | 9758172 | 10247917 | 489745 | candidate-fill-generator-aborted | 2/3 |
| P08 | 1513 | 260 | exact | 276.1s | 3288 | 8912922 |  | 0 |  | 11/108 |
| P08 | 1513 | 323 | exact | 194.3s | 4030 | 9249509 |  | 0 |  | 3/108 |
| P09 | 1367 | none | exact | 83.0s | 2921 | 8183525 |  | 0 |  | 12/108 |
| P09 | 1367 | 244 | exact | 31.6s | 1608 | 9172542 |  | 0 |  | 3/108 |
| P09 | 1367 | 260 | exact | 33.1s | 1632 | 9160727 |  | 0 |  | 3/108 |
| P09 | 1367 | 323 | exact | 139.2s | 3755 | 9136184 |  | 0 |  | 10/108 |
| P10 | 995 | none | exact | 43.9s | 2050 | 7817586 |  | 0 |  | 6/108 |
| P10 | 995 | 244 | exact | 168.8s | 3885 | 8676823 |  | 0 |  | 12/108 |
| P10 | 995 | 260 | exact | 215.1s | 3772 | 8620323 |  | 0 |  | 6/108 |
| P10 | 995 | 323 | exact | 35.5s | 1975 | 10105963 |  | 0 |  | 3/108 |

## Bounded Case Diagnostics

| Profile | Event | Cards | Elapsed | Peak heap MiB | Score | Upper | Gap | Relative gap | Completed/started configs | Abort reason | Slot | Candidate counts by slot | Candidate cutoffs by slot | Pair count | Candidate fill / pair upper / solve |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- | --- | ---: | --- |
| P03 | 260 | 1404 | 61.2s | 4205 | 9213846 | 9584318 | 370472 | 4.02% | 0/1 | candidate-fill-generator-aborted | 1 | [152377,5508,3679] | [2566335,2872521,null] | 0 | 11.6s / 2.8s / 0.0s |
| P06 | 323 | 1234 | 41.9s | 4488 | 9486961 | 10094162 | 607201 | 6.40% | 0/1 | initial-candidate | 0 | [] | [] | 0 | 0.0s / 0.0s / 0.0s |
| P07 | 244 | 1252 | 144.0s | 4210 | 8551590 | 8606855 | 55265 | 0.65% | 16/17 | candidate-fill-pair-refine | 1 | [14730,59554,35090] | [2594144,null,null] | 8778953 | 41.0s / 55.9s / 11.0s |
| P07 | 260 | 1252 | 61.2s | 4206 | 8568618 | 8865217 | 296599 | 3.46% | 1/2 | memory-soft-limit | 2 | [120238,38717,6761] | [2374910,2660182,2849224] | 5437641 | 16.1s / 4.0s / 5.0s |
| P08 | 244 | 1513 | 83.6s | 4207 | 9758172 | 10247917 | 489745 | 5.02% | 2/3 | candidate-fill-generator-aborted | 0 | [3573,10195,7140] | [2669350,null,null] | 16365204 | 44.2s / 7.4s / 13.5s |

Failure interpretation:

- `P03:260`: first configuration failed during slot-1 candidate generation after slot 0 had already produced 152377 candidates; no exact solve phase ran. The abort is memory/frontier pressure during candidate fill, not a weak incumbent problem.
- `P06:323`: aborted at `initial-candidate` before candidate arrays were built; this is the earliest memory guard path and should be treated as a root-level memory admission failure.
- `P07:244`: small remaining gap (55265, 0.65%) after 16 completed configurations; the final frontier failed during pair-refine candidate fill with 8.78M accumulated pairs. This is the highest leverage bounded row for a chunked proof or memory-capped pair-upper patch.
- `P07:260`: one configuration completed, second configuration hit `memory-soft-limit`; candidate counts were [120238, 38717, 6761] and pair count reached 5.44M.
- `P08:244`: two configurations completed, third failed during candidate generation; pair count had already reached 16.37M. This is the clearest candidate/pair materialization pressure case.

## Near-boundary Exact Cases

| Case | Elapsed | Peak heap MiB | Last candidate counts by slot |
| --- | ---: | ---: | --- |
| P08:260 | 276.1s | 3288 | [11087,10684,7341] |
| P10:260 | 215.1s | 3772 | [4872,2755,107] |
| P08:323 | 194.3s | 4030 | [393475,145516,18174] |
| P03:none | 177.9s | 3866 | [25894,32002,20174] |
| P10:244 | 168.8s | 3885 | [1081,654,106] |
| P03:323 | 155.2s | 3366 | [325545,92962,9508] |
| P09:323 | 139.2s | 3755 | [1080,1165,810] |
| P08:none | 115.8s | 3141 | [58494,62548,38020] |

Important exact-but-hard rows include `P08:260` at 276.1s, `P10:260` at 215.1s, `P08:323` at 4030 MiB, and `P10:244` at 3885 MiB. These are useful guardrails: an optimization that saves memory but makes these rows bounded is a regression.

## Analysis

The current blocker is not seed score. The failed rows terminate with memory-limit aborts while substantial proof upper gaps remain, and the successful hard rows already find exact incumbents but need heavy candidate/pair frontier work to prove closure. The bounded set is concentrated in event scenarios (`244`, `260`, `323`), while all `none` cases are exact.

The clean isolated runner materially changed earlier conclusions. `P03:none`, `P03:244`, and `P04:260` are exact in this run; earlier single-process rows that became empty/timed-out after `P03:260` were runner memory pollution, not algorithmic bounded evidence. Acceptance evidence must keep process-per-case isolation or implement a proven memory reset.

The exact-join counters point to three proof-frontier classes:

1. Candidate generation memory pressure: `candidate-fill-generator-aborted` in `P03:260` and `P08:244`.
2. Pair refinement/materialization pressure: `candidate-fill-pair-refine` in `P07:244`, with the smallest gap and strongest potential for conversion.
3. Root/initial memory admission failure: `initial-candidate` in `P06:323`, which needs an early fallback path before the normal exact-join candidate arrays are allocated.

## Recommendations

1. First optimization target: memory-capped exact-join proof, not seed. Add a chunked/streamed pair-upper proof path that avoids retaining all high-pair records and can close small residual gaps. Validate first on `P07:244`.
2. Add an `initial-candidate` fallback for `P06:323`: when the normal exact join cannot enter candidate fill, fall back to a lower-memory prefix or split-by-anchor proof that can at least reduce the root upper before returning bounded.
3. Add candidate-fill budget accounting by slot and stop expanding the largest slot first when the other two slots already provide a tighter pair upper. `P03:260` slot 0 generated 152377 candidates before slot 1 aborted at 5508.
4. Keep `enablePreProofSeedWarmup` and `enableExactJoinPrefixSeed` frozen. The bottleneck here is proof materialization and memory, not the lack of an incumbent.
5. Maintain process-per-case isolation as the default 40-case acceptance runner. Full proof ledger should be collected only for bounded cases or after memory-safe trace sampling is implemented.

## Acceptance Status

- Stage target `>=37/40 exact`: **failed** (`35/40`).
- No failed subprocess / no stderr / no process OOM: **passed**.
- Next stage target should remain `37/40`; the first practical subgoal is to convert at least two of the five bounded rows without regressing the near-boundary exact rows.
