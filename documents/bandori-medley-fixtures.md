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

## First direct comparison

Run `node --import tsx scripts/compare-bandori-medley-search.mjs` against the local archive. It builds the native release test entry point and runs the full 119-card profile, expert songs `295 → 300 → 703`, full PERFECT, no fever, and both owned legal area configurations. The no-event reference average is 1,693,959; event 323 is 1,781,877. These references omit historical PERFECT rates and per-run data hashes; the run explicitly records full PERFECT and the retained main-directory cache, without claiming those historical gaps have been verified.

Each case has 300 seconds and a 256 MiB candidate-storage budget. On Windows, the runner samples native peak working set every second and stops at 1 GiB; this is not a hard OS allocation limit or browser/WASM memory measurement. An external deadline allows 15 seconds for the normal timeout result to return. Run cases sequentially and stop at the first incomplete result or score regression, without raising budgets or changing the algorithm.

With explicit approval to finish the remaining under-1,000-card matrix, run `node --import tsx scripts/compare-bandori-medley-search.mjs --remaining`. This skips the already-tested 119-card no-event case and runs all other 13 cases: 119 cards with event 323, plus the 961/962/972-card profiles on expert songs `385 → 193 → 619` with no event or event 244/260/323. This mode continues after individual failures under the same per-case limits; it does not rerun the first case or change the algorithm.

The larger-profile references use the main-directory full-scope reports. Their known scope-matrix formatter stored the primary medley average as `rows[n].all.score`; the runner records this exact source field rather than inventing a missing `averageScore` field or using a generic fallback. The 962-card main references also equal the retained dev primary scores in all four cases. All inputs still use the retained main-directory data snapshot.

Inputs, hashes, source commit, historical settings, scores/differences, native outcomes, counters, timing, and sampled memory stay under the private archive's `runs/` directory. No old team is rescored. This changes none of the [foundation rules](bandori-medley-foundation.md); larger-roster acceptance and algorithm changes remain separate decisions.
