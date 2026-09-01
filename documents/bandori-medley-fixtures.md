# Local Medley Regression Evidence

Chinese version: [bandori-medley-fixtures.zh-CN.md](bandori-medley-fixtures.zh-CN.md)

## Purpose and boundaries

Historical main/dev results are retained to check the independent calculator, not to import old search architecture. The archive contains original HHWX profiles, cached master/chart/event data, selected original reports, and an index. It runs neither the old solver nor the new search.

All real profiles, original containers, reports, local paths, and generated indexes stay in the Git-ignored `temp/medley-regression-fixtures/` directory. Do not commit or publish them. Only documentation and test utilities are versioned. There are no new dependencies or application changes.

The initial collection contains 21 distinct CN profiles: the 119/1329/1889-card benchmarks and two ten-profile batches with two shared profiles. These are full rosters; even 119 cards is not a tiny exhaustive-search fixture.

## Collect and verify

Use the existing private fixture package as `--seed`, and pass each retained report directory separately:

```sh
node --import tsx scripts/archive-bandori-medley-fixtures.mjs --seed <private-fixture-package> --source main=<report-directory> --source dev=<report-directory>
node --import tsx scripts/archive-bandori-medley-fixtures.mjs --verify
```

The seed is the existing `manifest.json` package with profiles, source containers, assets, and `reference-only/` reports. The utility preserves its raw files and scans the known medley benchmark, scope-matrix, isolated-run, and low-memory HHWX report formats. It does not collect logs, binaries, Calc-converted inputs, or solver code. Recollect using the same source arguments to update the generated index; previously copied evidence files are not deleted.

The generated `README.md` lists profiles. `manifest.json` records:

- profile payload hashes and dated aliases; account identity locates only a candidate payload, and a report with a different recorded card count remains unindexed;
- separate source-directory data snapshots, sharing identical stored files;
- original report paths, dates, settings, scores, and locations inside each retained report;
- whether cards, area-item IDs, and explicit leaders were saved;
- source directories with missing caches or unmatched profile identities.

For each source/profile/song/settings combination, retain the highest reported score, the highest score with cards and area IDs, and the highest with explicit leaders. Seed reference reports are also preserved. These categories may select the same file; byte-identical files are stored once. Verification checks file hashes, actual HHWX profile decoding, and index references.

## Score comparison rules

1. Routine regression runs the new search directly and compares its total average score with the retained historical average under matching profile, song order, difficulty, PERFECT rate, event settings, and data. Do not rerun the old solver, replay old teams, or feed old winners into the search as a prerequisite. Targeted replay is reserved for a separately needed discrepancy investigation.
2. With identical complete inputs, the score-regression check passes when the new search reaches at least the historical average. Exact completion is tracked separately: an incomplete result does not prove optimality, but it is not a score-regression failure after reaching the reference. A higher score alone does not prove scoring correctness; overcounting could also raise it.
3. Keep `score`, `averageScore`, and old exact/completion claims as originally recorded. Do not silently equate score fields or promote an old claim to a new proof. Auxiliary saved candidates are not necessarily the reported winner.
4. Retained caches are the files found in each source directory, not proof of the exact data used by every historical run. Reports lacking per-run data hashes or commit IDs remain explicitly unverified in those respects. Directory labels do not identify the generating branch.
5. Real-profile runners fixed expert/full-P/no-fever; generic benchmark reports omitted their configurable PERFECT rate, which remains unknown in the index. Record any comparison assumption rather than filling this historical gap silently. Missing leaders are not inferred from old card order and do not block direct score comparison.
6. A fifteen-card projection and the original full roster are different search inputs. Do not compare their optimal scores as if they covered the same search space.

## Direct comparison runs

The existing runner rebuilds input from the archived HHWX profile and raw data, builds the native release executable, and compares the new search directly with saved historical averages. It uses the retained main-directory snapshot, not the old search implementation. The 119-card songs are expert `295 → 300 → 703`; the 961/962/972-card songs are expert `385 → 193 → 619`. All use full PERFECT, no fever and the complete owned area scope.

To rerun the four-profile, fourteen-scene matrix without adding another runner:

```sh
node --import tsx scripts/compare-bandori-medley-search.mjs --case 119-no-event
node --import tsx scripts/compare-bandori-medley-search.mjs --remaining
```

Without flags, the runner selects both 119-card cases. `--remaining` selects the other thirteen cases and continues after individual failures; `--six` selects only 119/961 cards. The existing `--diagnose` mode is described in [the search document](bandori-medley-search.md).

Each case remains limited to 300 seconds and 256 MiB of budgeted search storage. Cases run sequentially. Windows samples native peak working set every second and stops at 1 GiB, with a 315-second outer deadline. These are sampled native-process limits, not OS allocation guarantees or browser/WASM incremental memory. Do not automatically raise budgets or change the algorithm after a failure.

The larger-profile references read the known scope-matrix field `rows[n].all.score`, which stores the primary medley average. Preserve that original field and the reported exact status; auxiliary saved candidates are not substitutes for the primary result. The 119-card reports still lack historical PERFECT rates; every historical run still lacks verified per-run data hashes. New runs explicitly record their own inputs, hashes, settings, code commit, outputs, timing and memory.

## Accepted small-roster checkpoint

On 2026-08-31, clean code commit `eb66f9b` completed all fourteen scenes after the combined potential/mission rounding correction: thirteen matched their historical averages, and 972/event244 reached 8,594,227, exceeding its historical 8,591,251 by 2,976. This is a complete final-version search rerun, not merely saved-team rescoring.

Native search time totaled 159.922 seconds; the longest case took 35.232 seconds. Sampled native peak working set was 29.30 MiB; maximum budgeted search storage was 20.34 MiB. Both 119-card runs finished before the first memory sample, so their process memory is unavailable, not zero. Raw profiles, masters, charts, settings and historical references matched the preceding matrix; normalized-input changes were confined to character/event parameters affected by the approved bonus rule.

Full results and checks remain in the private archive under `runs/2026-08-31-final-low-pressure/`, referring to the two raw runs `2026-08-31T14-48-26.892Z` and `2026-08-31T14-48-29.719Z`. The separate 972/event244 investigation explains its higher score; this rerun changes neither solver. Acceptance covers these fourteen scenes only.

## Completed-profile stage

Select whole profiles over 1,000 cards whose no-event, event244, event260 and event323 scenes all have retained full-area-scope exact results. The approved list is **1036, 1039, 1161, 1211, 1229, 1252, 1318, 1425, 1433, 1513, 1522 and 1703 cards**: twelve profiles, four scenes each, **48 runs**.

```sh
node --import tsx scripts/compare-bandori-medley-search.mjs --completed-profiles
```

This reuses the existing runner, input normalization and resource recording. Card counts are display labels; each run records the immutable profile payload hash used for comparison. All scenes use the retained main-directory data, expert songs 385/193/619, full PERFECT, no fever and all owned area configurations. The retained event323 input is used only for same-input search regression here; this batch does not separately validate the live HHWX event323 parameter set. Keep the existing per-case 300-second / 256-MiB search-storage / 1-GiB sampled-process limits. Finish all 48 scenes sequentially without increasing budgets or changing the algorithm.

The batch finished on 2026-09-01 at clean commit `8c758bf`: **all 48 same-input score-regression checks passed**. Forty-five searches completed exact (42 equal to their primary references, 3 higher); the higher scores were 1211/no-event (+193), 1211/event260 (+155) and 1252/event323 (+154). **1229/event244, 1513/event244 and 1703/event260 timed out** at 300 seconds after reaching their primary reference scores. These were the batch's three proof-completion failures. There were no lower primary scores, process failures or memory-limit stops.

Native search totaled 3,606.484 seconds; the across-scene median was 28.550 seconds. Sampled process peak was 40.36 MiB; budgeted search-storage peak was 32.16 MiB. All scenes had memory samples. Input/file hashes, saved-output consistency, team legality and integer song-score sums were checked without rescoring. Full per-scene scores, timing, memory, diagnostic counters and report references are retained under `runs/2026-08-31T15-20-54.142Z/`, including `report.md`, `run.json` and `summary.json`.

A provenance audit rejected five extra comparisons that had been attached after the run. The four supposed 1229-card reports actually record a later 1252-card version of the same account, with a different payload hash. The 1513/event323 report uses the same profile payload but a different event323 parameter set, including the HHWX performance bonus, and uncommitted experimental search code. None is a same-input reference for this batch. The approved search-regression objective is therefore **accepted for all 48 scenes**. A later 300-second rerun at search checkpoint `8c69a04` completed 1229/event244 exact in 286.488 seconds at 8,475,133; 1513/event244 and 1703/event260 still timed out inside their first configuration after matching 9,758,172 and 10,106,861. Two proof-completion failures now remain. Neither run increased budgets or replayed historical teams.

## Final high-pressure stage

Reserve the remaining five profiles in their entirety: **1051, 1127, 1329, 1747 and 1889 cards**. Do not pull their already-completed individual scenes into the current batch. No high-pressure run is authorized here.

The 1051, 1127 and 1747 profiles lack complete four-scene exact coverage. The generic 1329/1889 reports use different song sets and include locked-area results or missing historical PERFECT rates; settle their exact scene settings before that final stage. Neither a locked-area exact flag nor a diagnostic best-so-far result counts as full-scope acceptance.
