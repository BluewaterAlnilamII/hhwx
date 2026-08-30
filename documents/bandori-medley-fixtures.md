# Local Medley Regression Evidence

Chinese version: [bandori-medley-fixtures.zh-CN.md](bandori-medley-fixtures.zh-CN.md)

## Purpose and boundaries

Historical main/dev results are retained to check the independent calculator, not to import old search architecture. The archive contains original HHWX profiles, cached master/chart/event data, selected original reports, and an index. It runs neither the old solver nor the new search.

All real profiles, original containers, reports, local paths, and generated indexes stay in the Git-ignored `temp/medley-regression-fixtures/` directory. Do not commit or publish them. Only this documentation and the archive utility are versioned. There are no new dependencies or application changes.

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

1. Replay a saved legal team/leader/area assignment using identical profile, song order, difficulty, PERFECT rate, event settings, and data. Check scoring before using its result as a lower bound for search.
2. With identical complete inputs, a completed new search must reach at least the validated old assignment's score. A higher score alone does not prove correctness; overcounting could also raise it.
3. Keep `score`, `averageScore`, and old exact/completion claims as originally recorded. Do not silently equate score fields or promote an old claim to a new proof. Auxiliary saved candidates are not necessarily the reported winner.
4. Retained caches are the files found in each source directory, not proof of the exact data used by every historical run. Reports lacking per-run data hashes or commit IDs remain explicitly unverified in those respects. Directory labels do not identify the generating branch.
5. Real-profile runners fixed expert/full-P/no-fever; generic benchmark reports omitted their configurable PERFECT rate, which remains unknown in the index. Missing leaders are not inferred from old card order. Resolve missing inputs before replay.
6. A fifteen-card projection and the original full roster are different search inputs. Do not compare their optimal scores as if they covered the same search space.

This checkpoint only preserves and validates the archive. Fixed-team score replay, new-search comparison, and large-roster performance acceptance are separate work; it changes none of the [foundation rules](bandori-medley-foundation.md).
