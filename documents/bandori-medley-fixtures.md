# Local Medley Regression Evidence

Chinese version: [bandori-medley-fixtures.zh-CN.md](bandori-medley-fixtures.zh-CN.md)

## Purpose and boundary

The private fixture archive checks the independent medley calculator against previously recorded real HHWX inputs and scores. It is evidence against search regressions, not architectural authority: the runner does not execute the old solver, replay an old winning team, or seed the new search from historical results.

Profiles, source containers, cached masters and charts, historical reports, generated inputs, outputs, and indexes remain under the Git-ignored `temp/medley-regression-fixtures/`. They may contain private account data and must not be committed or published. Only the collection/comparison utilities and these procedural notes belong in Git.

The archive currently contains 21 distinct CN profiles. The full acceptance set deliberately excludes the early 119-card profile and uses the other 20 complete rosters, from 961 through 1,889 cards. Even the 119-card profile is not treated as a trivial exhaustive input.

## Evidence model

`manifest.json` is the local index. It records file hashes, profile payload hashes, dated aliases, data snapshots, historical report locations, saved settings, scores, and whether teams, area items, and leaders were retained. Account identity and a displayed card count are labels, not proof that two payloads are identical.

For each source/profile/song/settings combination, collection retains the highest primary reported score and the strongest available supporting object. Byte-identical evidence is stored once. Verification checks archive hashes, profile decoding, and index references.

Historical evidence has explicit limits:

- old reports generally omit the exact source commit and per-run data hashes;
- the early 119-card reports omit their configurable PERFECT rate;
- a later version of the same account is a different input when its payload hash differs;
- a report using different event parameters, songs, order, difficulty, PERFECT rate, or data is not a same-input comparison; and
- a directory name such as `main` or `dev` identifies where evidence was found, not necessarily the commit that produced it.

The runner records its own source commit and dirty diff, runtime, limits, profile and normalized-input hashes, used-file hashes, complete output, elapsed time, sampled working set, and budget-accounted search storage. These fields make the new run reproducible without upgrading incomplete historical provenance into certainty.

## Collection and verification

Use the existing private package as the seed and list each retained report directory independently:

```sh
node --import tsx scripts/archive-bandori-medley-fixtures.mjs --seed <private-fixture-package> --source main=<report-directory> --source dev=<report-directory>
node --import tsx scripts/archive-bandori-medley-fixtures.mjs --verify
```

Collection preserves existing raw files and scans only known HHWX report formats. It does not collect binaries, logs, or solver source. Repeating the command updates the index without deleting previously retained evidence.

## Comparison contract

A historical comparison is admitted only when the archived profile and every setting recorded by the old report agree: song IDs and order, difficulties, PERFECT rate, and event settings. Old reports generally did not retain a per-run data hash or source commit, so matching the historical master-data snapshot cannot be proved after the fact. Such a reference is a regression target adopted under the explicit assumption that the retained `main` snapshot represents the data used by the old report; by itself it proves neither feasibility under the current input nor byte-identical source data. The new search itself is always run on a normalized input rebuilt from the archived profile and retained raw data.

Two separate gates apply:

1. **Score regression:** for a reference matching all recorded inputs, the new result must be at least as high as the recorded primary average score.
2. **Proof completion:** the new outcome must be `exact`. Reaching a reference and timing out is not an exactness pass.

A higher score does not by itself prove the scorer correct because overcounting could also raise a result. Scoring correctness is covered by the focused Bestdori/reference checks in [the foundation document](bandori-medley-foundation.md); real-profile acceptance chiefly checks the retained regression targets under the stated snapshot assumption and whether the search can finish its proof.

Keep historical `score`, `averageScore`, and completion flags under their original names. An auxiliary candidate is not substituted for a report's primary result. A fifteen-card projection and its full source roster are different search inputs.

## Runner

The full 80-scene acceptance command is:

```sh
node --import tsx scripts/compare-bandori-medley-search.mjs --all-profiles
```

It runs four settings—no event, event 244, event 260, and event 323—for each of these complete profiles:

```text
961, 962, 972, 1036, 1039, 1051, 1127, 1161, 1211, 1229,
1252, 1318, 1329, 1425, 1433, 1513, 1522, 1703, 1747, 1889
```

All use expert songs `385 -> 193 -> 619`, full PERFECT, no fever, and every generated owned-area configuration; the retained full-ownership inputs have 108 configurations. The run is sequential. Each scene has 300 seconds, 256 MiB of budgeted search storage, a 1 GiB sampled native-process stop, and a 315-second outer deadline. Windows samples working set once per second, so a short final peak may be missed; this is neither an OS allocation cap nor browser/WASM incremental memory.

The runner continues after a failed scene so the final report remains complete and exits nonzero if any selected scene fails. Useful smaller selections remain:

```sh
node --import tsx scripts/compare-bandori-medley-search.mjs --case 119-no-event
node --import tsx scripts/compare-bandori-medley-search.mjs --remaining
node --import tsx scripts/compare-bandori-medley-search.mjs --completed-profiles
node --import tsx scripts/compare-bandori-medley-search.mjs --high-pressure
```

`--diagnose` enables time-limited profiling and the explicit threshold overrides accepted by the script. Those controls are for A/B measurement only; they are rejected in normal acceptance mode and do not alter production constants.

## Current 80-scene checkpoint

The accepted run was generated on 2026-09-03 from clean source commit `01a6b09b7f5de11c27fb76bbb18ca983ca154aa9`. Its private evidence is in `runs/2026-09-03T02-56-28.267Z/`.

| Result | Measurement |
| --- | ---: |
| Selected scenes | 80 |
| `exact` outcomes | 80 |
| References matching all recorded inputs | 72 |
| Equal to reference | 67 |
| Higher than reference | 5 |
| Lower than reference | 0 |
| Total native search time | 675.553 s |
| Median native scene time | 2.182 s |
| Longest scene | 1889/event244, 192.377 s |
| Scenes with a process working-set sample | 69/80 |
| Process peak among sampled scenes | 34.32 MiB |
| Budget-accounted search-storage peak | 23.39 MiB |

The five higher exact results were 972/event244 `+2,976`, 1211/no-event `+193`, 1211/event260 `+155`, 1252/event323 `+154`, and 1747/event260 `+7,343`. The eight 1329/1889 scenes have no reference matching all recorded inputs; all eight nevertheless completed `exact`. No scene timed out, hit the process or search-storage limit, failed, or returned a lower comparable score.

### Per-scene scores, time, and memory

Time is the native search duration recorded by the solver; it excludes input preparation and process startup. The outer runner samples process working set once per second. `Not sampled` means that no sample was captured before the child exited, not that memory use was zero. Search-storage peak is the solver's internal budget accounting, not measured browser/WASM memory.

| Scene ID | Total average score | Native search time (s) | Process working-set peak (MiB) | Search-storage peak (MiB) |
| --- | ---: | ---: | ---: | ---: |
| 961-no-event | 7,808,588 | 1.420 | 16.11 | 8.68 |
| 961-event-244 | 8,623,392 | 1.268 | Not sampled | 8.69 |
| 961-event-260 | 8,639,969 | 1.275 | Not sampled | 9.10 |
| 961-event-323 | 8,520,848 | 1.169 | Not sampled | 8.33 |
| 962-no-event | 7,988,973 | 1.643 | 15.39 | 8.52 |
| 962-event-244 | 8,660,531 | 1.207 | Not sampled | 6.92 |
| 962-event-260 | 8,660,531 | 1.063 | Not sampled | 6.19 |
| 962-event-323 | 8,692,675 | 1.567 | 19.11 | 11.34 |
| 972-no-event | 7,826,923 | 1.465 | 16.38 | 9.22 |
| 972-event-244 | 8,594,227 | 2.197 | 18.79 | 11.51 |
| 972-event-260 | 8,577,170 | 1.757 | 17.54 | 10.33 |
| 972-event-323 | 8,384,953 | 1.633 | 18.72 | 11.04 |
| 1036-no-event | 7,933,313 | 1.166 | Not sampled | 7.81 |
| 1036-event-244 | 8,647,266 | 1.121 | Not sampled | 6.29 |
| 1036-event-260 | 8,879,109 | 1.098 | Not sampled | 6.23 |
| 1036-event-323 | 8,788,460 | 1.233 | Not sampled | 7.65 |
| 1039-no-event | 7,764,093 | 1.438 | 14.84 | 7.21 |
| 1039-event-244 | 8,406,101 | 1.444 | 19.63 | 12.04 |
| 1039-event-260 | 8,406,101 | 1.386 | 17.30 | 9.76 |
| 1039-event-323 | 9,872,019 | 1.276 | Not sampled | 6.24 |
| 1051-no-event | 7,508,965 | 1.404 | 17.05 | 9.63 |
| 1051-event-244 | 8,121,379 | 1.517 | 16.65 | 8.91 |
| 1051-event-260 | 8,107,386 | 1.446 | 16.90 | 8.95 |
| 1051-event-323 | 8,167,121 | 1.405 | 17.00 | 9.07 |
| 1127-no-event | 7,420,798 | 3.366 | 19.87 | 11.37 |
| 1127-event-244 | 8,729,634 | 4.907 | 22.91 | 14.25 |
| 1127-event-260 | 8,887,419 | 4.332 | 20.52 | 11.70 |
| 1127-event-323 | 8,418,897 | 3.864 | 19.88 | 11.91 |
| 1161-no-event | 7,927,236 | 1.679 | 17.95 | 10.21 |
| 1161-event-244 | 8,858,388 | 1.979 | 19.11 | 11.24 |
| 1161-event-260 | 8,947,118 | 1.285 | Not sampled | 6.80 |
| 1161-event-323 | 8,856,193 | 2.385 | 19.37 | 10.85 |
| 1211-no-event | 7,947,770 | 2.295 | 11.61 | 8.72 |
| 1211-event-244 | 9,265,413 | 14.649 | 25.01 | 15.73 |
| 1211-event-260 | 8,724,026 | 1.588 | 15.01 | 6.91 |
| 1211-event-323 | 8,678,383 | 2.166 | 15.16 | 8.14 |
| 1229-no-event | 7,863,437 | 2.326 | 19.49 | 11.42 |
| 1229-event-244 | 8,475,133 | 36.023 | 24.92 | 15.55 |
| 1229-event-260 | 8,432,514 | 2.667 | 18.15 | 9.91 |
| 1229-event-323 | 9,370,589 | 1.682 | 15.21 | 8.36 |
| 1252-no-event | 8,377,327 | 2.026 | 15.53 | 8.29 |
| 1252-event-244 | 9,472,358 | 17.204 | 26.62 | 16.36 |
| 1252-event-260 | 9,184,373 | 1.683 | 16.09 | 10.48 |
| 1252-event-323 | 9,259,232 | 1.700 | 17.86 | 10.09 |
| 1318-no-event | 8,251,882 | 1.841 | 18.18 | 11.18 |
| 1318-event-244 | 8,939,243 | 2.319 | 19.38 | 11.38 |
| 1318-event-260 | 8,939,243 | 1.888 | 15.76 | 9.12 |
| 1318-event-323 | 8,992,845 | 1.934 | 15.84 | 14.62 |
| 1329-no-event | 7,942,781 | 4.464 | 21.88 | 13.56 |
| 1329-event-244 | 10,368,825 | 4.578 | 21.24 | 12.98 |
| 1329-event-260 | 9,376,023 | 2.275 | 16.25 | 10.80 |
| 1329-event-323 | 9,134,555 | 5.418 | 28.24 | 19.84 |
| 1425-no-event | 8,182,058 | 3.831 | 19.94 | 11.70 |
| 1425-event-244 | 9,103,992 | 9.767 | 26.01 | 16.99 |
| 1425-event-260 | 9,104,409 | 6.676 | 24.11 | 15.16 |
| 1425-event-323 | 9,067,869 | 6.841 | 23.41 | 14.40 |
| 1433-no-event | 8,095,681 | 2.017 | 16.34 | 11.94 |
| 1433-event-244 | 8,724,633 | 3.255 | 20.24 | 13.06 |
| 1433-event-260 | 9,133,280 | 2.351 | 17.09 | 8.72 |
| 1433-event-323 | 8,692,405 | 2.643 | 21.81 | 13.56 |
| 1513-no-event | 7,990,800 | 2.019 | 15.11 | 8.03 |
| 1513-event-244 | 9,758,172 | 52.832 | 34.32 | 23.39 |
| 1513-event-260 | 8,912,922 | 17.971 | 23.91 | 14.94 |
| 1513-event-323 | 9,249,509 | 3.571 | 20.89 | 12.01 |
| 1522-no-event | 8,435,220 | 4.298 | 18.64 | 10.10 |
| 1522-event-244 | 9,449,862 | 3.495 | 19.31 | 10.56 |
| 1522-event-260 | 9,449,862 | 2.800 | 17.65 | 9.34 |
| 1522-event-323 | 9,250,944 | 4.456 | 23.81 | 14.40 |
| 1703-no-event | 8,430,933 | 9.078 | 18.99 | 9.79 |
| 1703-event-244 | 11,159,629 | 14.366 | 20.60 | 11.33 |
| 1703-event-260 | 10,106,861 | 128.659 | 31.81 | 20.74 |
| 1703-event-323 | 9,388,444 | 3.050 | 20.58 | 11.36 |
| 1747-no-event | 8,491,284 | 2.634 | 17.27 | 8.96 |
| 1747-event-244 | 9,891,757 | 16.854 | 25.71 | 15.65 |
| 1747-event-260 | 9,484,242 | 3.858 | 21.83 | 12.54 |
| 1747-event-323 | 10,897,956 | 1.736 | 12.29 | 7.77 |
| 1889-no-event | 8,507,013 | 2.091 | 12.41 | 8.22 |
| 1889-event-244 | 10,122,138 | 192.377 | 34.25 | 23.18 |
| 1889-event-260 | 9,622,182 | 2.430 | 20.65 | 11.94 |
| 1889-event-323 | 11,182,982 | 1.475 | 12.41 | 5.48 |

An independent artifact audit checked the 80 winner fields and 800 diagnostic-list entries. The winner is also present in its scene's list, so these are 880 serialized objects rather than 880 distinct solutions. Every area selection exists in its input, every song slot has five distinct characters, all fifteen physical cards are distinct, song scores are integers, and medley totals equal the three song-score sum. All 80 outputs report every input area configuration completed. This is a structural/output check, not a second scorer.

The audit deliberately included two earlier complete runs with the same profile, normalized-input, and source-file hashes. Clean commit `7801470` returned `exact` for all scenes but fell below a matching retained reference in five cases: 1127/event260, 1127/event323, 1161/event323, 1433/event323, and 1522/event323. The gate rejected it. Investigation found that an effective single-destination physical card could be counted both as fixed and as an unresolved required character in the joint bound. Commit `6b1e2afa` materialized those forced cards before rebuilding the joint model and independently recovered all five counterexamples; its complete run then passed 80/80. The final run above adds the release fail-closed consistency guard, regenerated WASM, path-level regression test, and reviewed proof documentation. Relative to the `6b1e2afa` run, all 80 inputs, scores, winning solutions, and diagnostic lists are identical.

The prior accepted run took 750.783 seconds against 675.553 seconds here. This is an uncontrolled wall-clock observation, not an attributed speedup: the intervening production change is a consistency guard rather than a search optimization, and the runs were not interleaved or repeated as a performance experiment.

This result accepts the current native search checkpoint for the retained suite. It is not a universal complexity guarantee, a browser-memory measurement, or proof about future profiles and game data.
