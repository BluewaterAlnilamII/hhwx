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
| Sampled process peak | 34.32 MiB |
| Budget-accounted search-storage peak | 23.39 MiB |

The five higher exact results were 972/event244 `+2,976`, 1211/no-event `+193`, 1211/event260 `+155`, 1252/event323 `+154`, and 1747/event260 `+7,343`. The eight 1329/1889 scenes have no reference matching all recorded inputs; all eight nevertheless completed `exact`. No scene timed out, hit the process or search-storage limit, failed, or returned a lower comparable score.

An independent artifact audit checked the 80 winner fields and 800 diagnostic-list entries. The winner is also present in its scene's list, so these are 880 serialized objects rather than 880 distinct solutions. Every area selection exists in its input, every song slot has five distinct characters, all fifteen physical cards are distinct, song scores are integers, and medley totals equal the three song-score sum. All 80 outputs report every input area configuration completed. This is a structural/output check, not a second scorer.

The audit deliberately included two earlier complete runs with the same profile, normalized-input, and source-file hashes. Clean commit `7801470` returned `exact` for all scenes but fell below a matching retained reference in five cases: 1127/event260, 1127/event323, 1161/event323, 1433/event323, and 1522/event323. The gate rejected it. Investigation found that an effective single-destination physical card could be counted both as fixed and as an unresolved required character in the joint bound. Commit `6b1e2afa` materialized those forced cards before rebuilding the joint model and independently recovered all five counterexamples; its complete run then passed 80/80. The final run above adds the release fail-closed consistency guard, regenerated WASM, path-level regression test, and reviewed proof documentation. Relative to the `6b1e2afa` run, all 80 inputs, scores, winning solutions, and diagnostic lists are identical.

The prior accepted run took 750.783 seconds against 675.553 seconds here. This is an uncontrolled wall-clock observation, not an attributed speedup: the intervening production change is a consistency guard rather than a search optimization, and the runs were not interleaved or repeated as a performance experiment.

This result accepts the current native search checkpoint for the retained suite. It is not a universal complexity guarantee, a browser-memory measurement, or proof about future profiles and game data.
