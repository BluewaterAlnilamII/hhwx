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

- profile payload hashes and dated aliases, mapping historical identity hashes through the original containers rather than the reused `P01–P10` labels;
- separate source-directory data snapshots, sharing identical stored files;
- original report paths, dates, settings, scores, and locations inside each retained report;
- whether cards, area-item IDs, and explicit leaders were saved;
- source directories with missing caches or unmatched profile identities.

For each source/profile/song/settings combination, retain the highest reported score, the highest score with cards and area IDs, and the highest with explicit leaders. Seed reference reports are also preserved. These categories may select the same file; byte-identical files are stored once. Verification checks file hashes, actual HHWX profile decoding, and index references.

## Score comparison rules

1. Routine regression runs the new search directly and compares its total average score with the retained historical average under matching profile, song order, difficulty, PERFECT rate, event settings, and data. Do not rerun the old solver, replay old teams, or feed old winners into the search as a prerequisite. Targeted replay is reserved for a separately needed discrepancy investigation.
2. With identical complete inputs, a completed new search must reach at least the historical average. An incomplete result does not pass, even if its diagnostic score is higher. A higher score alone does not prove scoring correctness; overcounting could also raise it.
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

Full results, checks and the next-stage case list remain in the private archive under `runs/2026-08-31-final-low-pressure/`, referring to the two raw runs `2026-08-31T14-48-26.892Z` and `2026-08-31T14-48-29.719Z`. The separate 972/event244 investigation explains its higher score; this rerun changes neither solver. Acceptance covers these fourteen scenes only.

## Next stage: prepared, not executed

Select individual scenes with more than 1,000 owned cards and a retained **full-area-scope exact** result. An exact flag selects historically completed cases; it is not an independent proof that the old score is optimal. Do not exclude a whole profile just because another event remains difficult, or count a locked-area exact result as full-scope completion.

The retained real-profile matrix supplies 56 candidate scenes across fifteen profiles. The recommended first batch is:

| Cards | Events | Scenes |
| ---: | --- | ---: |
| 1,036 | None, 244, 260, 323 | 4 |
| 1,039 | None, 244, 260, 323 | 4 |
| 1,051 | None, 323 | 2 |
| 1,127 | None, 260, 323 | 3 |
| **Total** | | **13** |

Keep 1051/event244, 1051/event260, 1127/event244 and 1747/event260 out of this stage: no retained full-scope exact result was found. The 1329-card exact record is locked-area only. Two 1889-card event323 records are full-scope exact, for songs 295/300/703 and 595/686/703, but omit historical PERFECT rate; retain them as reserves requiring an explicit comparison assumption, not first-batch cases.

Five later candidates need input reconciliation before acceptance: all four 1229-card scenes and 1513/event323 have higher reports from a directory without a retained data snapshot. Preserve those reports alongside the main-snapshot reference rather than silently lowering the comparison target.

For the first batch, retain expert 385/193/619, full PERFECT, no fever, the current shared-area rules, and the same 300-second / 256-MiB / 1-GiB limits. Extend only the existing runner's case selection when execution is authorized; reuse normalization, result comparison and resource recording. Finish the approved batch, record every incomplete or lower-scoring case as failed, and stop before another batch, old-team replay or algorithm changes.
