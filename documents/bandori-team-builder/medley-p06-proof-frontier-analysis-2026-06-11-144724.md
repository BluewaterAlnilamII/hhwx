# Medley Proof Frontier Analysis - P06:323

Generated: 2026-06-11 14:47 CST

Branch/worktree:

- Branch: `dev/medley-39-exact-frontier`
- Worktree: `C:\Users\bluew\.codex\worktrees\medley-prefix-seed\hhwx`
- Main checkout `D:\Workspace\hhwx` was kept clean on `main`.

## Goal

The active target remains stable no-GC, non-debug 40/40 exact for P01-P10 across
`none/244/260/323`. P11 is excluded from the acceptance target and remains a
separate stress profile.

This report focuses on the current blocking case observed in the hard fixture:
`P06:323`.

## Executive Summary

The current P06 failure is not seed-limited and not primarily caused by the 300s
global timeout. It is a proof frontier problem.

The strongest current path lowers the PastelPalettes/cool same-coarse frontier
to about `9,629,060`, but this remains about `140,888` above the incumbent
`9,488,172`. At 600s, the run stops bounded with about 234s remaining because
the current policy intentionally skips after an unproved exact-candidate join.
Forcing DFS instead consumes the remaining 600s budget and times out.

The near-term rejected paths are:

- pre-proof seed warmup;
- exact-join prefix seed;
- targeted pair BnB;
- wider low-root-first ordering;
- deeper unseen refine;
- full same-coarse retry;
- plain DFS after unproved exact join;
- end-of-pass rewind split recomputation.

The next viable direction should be a proof artifact or decomposition change,
not more seed work.

## Current Best Evidence

### Baseline P06 Diagnostic

Raw:
`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T05-06-53-506Z.json`

Options:

- 300s budget
- event root frontier probe enabled
- anchor cheap upper timebox `230000ms`
- suffix generated-pair join enabled
- suffix unseen full join enabled
- processed-unseen join enabled
- same-coarse retry min remaining `60000ms`
- dominated-root tight upper enabled

Result:

- exact: `false`
- timedOut: `false`
- elapsed: `296353ms`
- score: `9488172`
- upper: `9935586`
- gap: `447414`
- rootPruned: `102`
- peak heap: `3778 MiB`

PastelPalettes/cool:

- performance: `208070ms`, upper `9635008`, abort `candidate-fill-soft-limit`
- technique: `73172ms`, upper `9635008`, abort `solve-dominated-same-coarse-frontier`
- visual: skipped near deadline, upper `9935585`

Key observation:

- The `9635008` frontier came from `processed-unseen-join`.
- Its max source was `both-unseen-fallback`.
- Max contribution: anchor `2804735` + pair upper `6830273`.

### Max Anchors 13000 Diagnostic

Raw:
`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T05-48-39-310Z.json`

Result:

- exact: `false`
- timedOut: `false`
- elapsed: `288317ms`
- score: `9488172`
- upper: `9935586`
- gap: `447414`
- rootPruned: `102`
- peak heap: `4052 MiB`

Effect:

- performance frontier improved from `9635008` to `9629060`;
- max processed-unseen source remained `both-unseen-fallback`;
- max entry moved to `5005`;
- elapsed improved by about 8s versus the baseline diagnostic.

Interpretation:

The processed-prefix cheap upper is non-monotonic. Processing more anchors can
expose a looser processed `both-unseen-fallback` than leaving that tail under
suffix cover.

### Max Anchors 6000 Diagnostic

Raw:
`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T05-54-19-936Z.json`

Result:

- exact: `false`
- timedOut: `true`
- elapsed: `307507ms`
- upper: `10082483`
- gap: `594311`

Interpretation:

The prefix was too short. The processed-unseen join did not produce a usable
upper, and the performance residual rose to `9835740`.

### 600s Confirmation

Raw:
`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T06-13-53-153Z.json`

Result:

- exact: `false`
- timedOut: `false`
- elapsed: `368225ms`
- score: `9488172`
- upper: `9629060`
- gap: `140888`
- rootPruned: `102`
- peak heap: `5380 MiB`

PastelPalettes/cool:

- performance: upper `9629060`, `candidate-fill-soft-limit`
- technique: upper `9629060`, `solve-dominated-same-coarse-frontier`
- visual: upper `9629060`, `solve-dominated-same-coarse-frontier`

Top remaining frontier:

- `Morfonica/cool/performance`: upper `9631450`, gap `143278`
- `PastelPalettes/cool/*`: upper `9629060`, gap around `140888`

Interpretation:

The case is still bounded even with 600s available and no global timeout. The
current policy stops at an unclosed proof frontier.

### DFS Fallback Confirmation

Raw:
`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T06-21-01-395Z.json`

Options:

- Same as 600s confirmation
- `disableSkipDfsAfterUnprovedExactCandidateJoin=true`

Result:

- exact: `false`
- timedOut: `true`
- elapsed: `600003ms`
- upper: `10076137`
- gap: `587965`

Interpretation:

Plain DFS after an unproved exact-candidate join is not viable. It spends the
remaining budget on PastelPalettes/cool/technique and times out.

### Rewind Split Diagnostic

Raw:
`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-11T06-40-35-526Z.json`

Options:

- Baseline P06 options
- `eventRootFrontierProbeAnchorCheapUpperRewindBothUnseen=true`

Result:

- exact: `false`
- timedOut: `true`
- elapsed: `302668ms`
- upper: `10082483`
- gap: `594311`

Rewind details:

- attempt: `1`
- split anchor index: `14420`
- processed entry count: `12720`
- elapsed: `56268ms`
- abort: `timebox`
- improvement: `0`

Interpretation:

The split idea is sound, but this implementation is too expensive because it
recomputes suffix cover/join after the main cheap-upper pass. It should remain
research-only.

## Why The Tested Changes Did Not Reach 40/40

1. Seed routes improve incumbents but do not convert the proof frontier.

The remaining gaps are upper-bound/proof gaps, not missing best teams.

2. Processed-unseen join is blocked by both-unseen fallback.

The largest residual is not generated-pair or generated+unseen. It is a
conservative two-unseen-slot upper.

3. Same-coarse retry only moves the frontier sideways.

It can make technique and visual inherit the same `9629060`/`9635008` frontier,
but it does not close that frontier against the incumbent.

4. More time alone does not solve the current policy path.

At 600s, the algorithm stops bounded with substantial time remaining. Forcing
DFS uses the extra time badly and still times out.

5. Suffix/rewind recomputation is too expensive as implemented.

The one-shot rewind probe spent 56s and timed out.

## Recommended Next Plan

Priority 1: same-coarse pair/frontier certificate.

Build a low-memory certificate for the shared two-slot frontier that can be
reused across performance/technique/visual in the same coarse group. The goal is
not to reuse exact proof conclusions across parameters; it is to reuse proof
materials or upper certificates for the same card-conflict structure.

Acceptance target for P06:

- lower PastelPalettes/cool frontier below `9488172`, or
- prove it cannot beat the incumbent without falling back to DFS.

Priority 2: incremental best-prefix cheap upper.

Do not recompute suffix cover after the fact. Instead, add cheap checkpoints or
incremental suffix summaries so the algorithm can stop near the best processed
prefix before processed `both-unseen-fallback` starts making the residual worse.

Evidence target:

- match or improve the `maxAnchors=13000` frontier `9629060`;
- reduce performance elapsed below `180s`;
- no extra timeout or memory spike.

Priority 3: dominated-root closure for Morfonica/cool.

After PastelPalettes is lowered, Morfonica/cool/performance at about `9631450`
becomes the top unclosed frontier. Dominated-root tight upper helped but did not
close it. A stronger dominated-root proof path is needed, but it should not run
before the PastelPalettes shared frontier is addressed.

## Guardrails

- Keep all new proof paths opt-in until P06 improves without regressing P03/P08/P10.
- Do not default seed, prefix seed, targeted BnB, rewind split, or DFS fallback.
- Run P06 first, then 4 hard cases, then the full P01-P10 40-case matrix.
- Every full 40-case run must produce a timestamped report with time, memory,
  exact/bounded status, bounded reasons, and next recommendations.

