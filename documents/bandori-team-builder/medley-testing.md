# Medley Regression Testing

Chinese version: [medley-testing.zh-CN.md](medley-testing.zh-CN.md)

## Purpose and boundary

The private fixture archive checks the independent medley calculator against previously recorded real HHWX inputs and scores. It is evidence against search regressions, not architectural authority: the runner does not execute the old solver, replay an old winning team, or seed the new search from historical results.

Profiles, source containers, cached masters and charts, historical reports, generated inputs, outputs, and indexes remain under the Git-ignored `temp/medley-regression-fixtures/`. They may contain private account data and must not be committed or published. Git stores only the collection/comparison utilities and this stable testing procedure; run-specific reports remain with their private artifacts.

The retained suite includes one early 119-card profile and 20 complete rosters from 961 through 1,889 cards. Even the 119-card profile is not treated as a trivial exhaustive input.

## Evidence model

The local `manifest.json` is the index. It records file hashes, profile payload hashes, dated aliases, data snapshots, historical report locations, saved settings, scores, and whether teams, area items, and leaders were retained. Account identity and a displayed card count are labels, not proof that two payloads are identical.

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

A higher score does not by itself prove the scorer correct because overcounting could also raise a result. Scoring correctness is covered by the focused Bestdori/reference checks in [the foundation document](medley-foundation.md); real-profile acceptance chiefly checks the retained regression targets under the stated snapshot assumption and whether the search can finish its proof.

Keep historical `score`, `averageScore`, and completion flags under their original names. An auxiliary candidate is not substituted for a report's primary result. A fifteen-card projection and its full source roster are different search inputs.

## Runner

The full 80-scene acceptance command is:

```sh
node --import tsx scripts/compare-bandori-medley-search.mjs --all-profiles
```

It runs no event, event 244, event 260, and event 323 for each complete roster:

```text
961, 962, 972, 1036, 1039, 1051, 1127, 1161, 1211, 1229,
1252, 1318, 1329, 1425, 1433, 1513, 1522, 1703, 1747, 1889
```

All use expert songs `385 -> 193 -> 619`, full PERFECT, no fever, and every generated owned-area configuration; retained full-ownership inputs have 108 configurations. The run is sequential. Each scene has 300 seconds, 256 MiB of budgeted search storage, a 1 GiB sampled native-process stop, and a 315-second outer deadline. Windows samples working set once per second, so a short final peak may be missed; this is neither an OS allocation cap nor browser/WASM incremental memory.

The runner continues after a failed scene so the final report remains complete and exits nonzero if any selected scene fails. Useful smaller selections remain:

```sh
node --import tsx scripts/compare-bandori-medley-search.mjs --case 119-no-event
node --import tsx scripts/compare-bandori-medley-search.mjs --remaining
node --import tsx scripts/compare-bandori-medley-search.mjs --completed-profiles
node --import tsx scripts/compare-bandori-medley-search.mjs --high-pressure
```

`--diagnose` enables time-limited profiling and the explicit threshold overrides accepted by the script. Those controls are for A/B measurement only; they are rejected in normal acceptance mode and do not alter production constants.

## Run artifacts

Each run writes `run.json`, `summary.json`, and per-scene inputs, outputs, and results under `temp/medley-regression-fixtures/runs/<timestamp>/`. Human-readable tables and notes, when retained, belong in that same ignored run directory. They are measurements tied to private inputs, one source commit, and one machine—not stable project documentation.
