# Medley Optimization Review - 2026-05-22

## Summary

- Raw JSONL: `D:\Workspace\hhwx\temp\bandori-team-builder\medley-optimization-review-runs.jsonl`
- Planned runs: 222 (6 three-single greedy runs + 6 scenarios x 5 durations x 7 variants + 6 witness runs).
- Successful runs: 99; errors: 0; missing: 123.
- Source state recorded before run: yes.
- This is a partial refresh. Use the baseline and three-single greedy tables for current spot conclusions; treat direction verdicts as provisional until the full variant matrix is rerun.
- Git status at start: `M src/lib/bandori-medley-team-search.ts`.

## Three-Single Greedy Baselines

| scenario | medley score | single score sum | wall | per-song ms | shared configs | area |
| --- | --- | --- | --- | --- | --- | --- |
| 119-event323 | 1642329 | 1565027 | 821 | 3000 | 2 | HelloHappyWorld/none/none |
| 119-no-event | 1542003 | 1474204 | 773 | 3000 | 2 | HelloHappyWorld/none/none |
| 1329-event323-locked-hhw-happy | 9181467 | 8524223 | 1415 | 3000 | 3 | HelloHappyWorld/happy/technique |
| 1329-no-event | 8448069 | 7835918 | 35785 | 3000 | 108 | HelloHappyWorld/powerful/technique |
| 1889-event323-locked-pasupare-powerful | 11083813 | 10263399 | 1642 | 3000 | 3 | PastelPalettes/powerful/visual |
| 1889-no-event | 9055290 | 8392486 | 19450 | 3000 | 108 | PastelPalettes/powerful/technique |

## Baseline

| scenario | ms | score | greedy | vsGreedy | exact | mode | upper | gap | relGap | timeToBest | limiter | capacityMode |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 119-event323 | 30000 | 1504051 | 1642329 | -138278 | false | bounded | 1606221 | 102170 |  |  | capacity | context-bound-mccormick |
| 119-event323 | 120000 | 1504051 | 1642329 | -138278 | false | bounded | 1606221 | 102170 |  |  | capacity | context-bound-mccormick |
| 119-no-event | 10000 | 1693959 | 1542003 | 151956 | false | bounded | 1861034 | 167075 | 9.86% | 815 | capacity | coefficient |
| 119-no-event | 30000 | 1693959 | 1542003 | 151956 | false | bounded | 1809587 | 115628 | 6.83% | 789 | capacity | context-bound-mccormick |
| 119-no-event | 120000 | 1407785 | 1542003 | -134218 | false | bounded | 1494225 | 86440 |  |  | capacity | context-bound-mccormick |
| 1329-event323-locked-hhw-happy | 30000 | 9299588 | 9181467 | 118121 | false | bounded | 9582667 | 283079 |  |  | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy | 120000 | 9299588 | 9181467 | 118121 | false | bounded | 9582667 | 283079 |  |  | capacity | card-bound-lagrangian |
| 1329-no-event | 10000 | 8533987 | 8448069 | 85918 | false | bounded |  |  |  | 10039 |  |  |
| 1329-no-event | 30000 | 8533987 | 8448069 | 85918 | false | bounded | 8840726 | 306739 | 3.59% | 5674 | capacity | card-bound-skill-aware |
| 1329-no-event | 120000 | 8533987 | 8448069 | 85918 | false | bounded | 8840726 | 306739 |  |  | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful | 30000 | 11146635 | 11083813 | 62822 | false | bounded | 11183342 | 36707 |  |  | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful | 120000 | 11146635 | 11083813 | 62822 | false | bounded | 11183342 | 36707 |  |  | capacity | card-bound-skill-aware |
| 1889-no-event | 10000 | 9125980 | 9055290 | 70690 | false | bounded | 9208865 | 82885 | 0.91% | 1532 | capacity | card-bound-skill-aware |
| 1889-no-event | 30000 | 9128583 | 9055290 | 73293 | false | bounded | 9208865 | 80282 | 0.88% | 11319 | capacity | card-bound-skill-aware |
| 1889-no-event | 120000 | 9128583 | 9055290 | 73293 | false | bounded | 9208865 | 80282 |  |  | capacity | card-bound-skill-aware |

## Direction Verdicts

| direction | runs | verdict counts | best score | best gap | best gap closure | best replay prune |
| --- | --- | --- | --- | --- | --- | --- |
| anchor-slot | 12 | effective: 1, neutral: 11 | 11146635 | 36707 | 25.24% |  |
| opportunity-cost | 12 | effective: 1, neutral: 11 | 11146635 | 36707 | 25.24% |  |
| team-shared | 12 | effective: 1, neutral: 3, not applicable: 8 | 11146635 | 36707 | 25.24% |  |
| exact-candidate-join | 12 | effective: 1, neutral: 4, not applicable: 4, regressive: 3 | 11146635 | 80282 | 25.24% |  |
| conflict-bnb-2048 | 12 | effective: 1, neutral: 6, not applicable: 4, regressive: 1 | 11146635 | 36707 | 25.24% |  |
| conflict-bnb-8192 | 12 | neutral: 4, not applicable: 4, regressive: 4 | 11146635 | 36707 | 0.00% |  |

### baseline/current default bundle

- Exact proofs: 0/30.
- Baseline limiter distribution: capacity / card-bound-lagrangian: 2, capacity / card-bound-skill-aware: 7, capacity / coefficient: 1, capacity / context-bound-mccormick: 4, unknown / unknown: 1.
- A bounded result remains only a bounded incumbent; the report treats exact proof as `isExhaustive=true` and `searchMode=exact` only.
- Direction verdicts use exact proof, gap closure, replay-prunable rate, incumbent score, and same-score speed deltas; final score alone is no longer sufficient.

### anchor-slot

- Verdicts: effective: 1, neutral: 11.
- Counters: calls=12, completed=12, aborts=0, improvements=0, bestImprovement=0.
- Sample classifications: 119-no-event__30000ms__anchor-slot: effective (gap closure 25%); 119-no-event__120000ms__anchor-slot: neutral (ran but did not materially improve score, proof, or gap); 119-event323__30000ms__anchor-slot: neutral (ran but did not materially improve score, proof, or gap); 119-event323__120000ms__anchor-slot: neutral (ran but did not materially improve score, proof, or gap); 1329-no-event__30000ms__anchor-slot: neutral (ran but did not materially improve score, proof, or gap).

### opportunity-cost

- Verdicts: effective: 1, neutral: 11.
- Counters: calls=12, completed=12, aborts=0, improvements=0, bestImprovement=0.
- Sample classifications: 119-no-event__30000ms__opportunity-cost: effective (gap closure 25%); 119-no-event__120000ms__opportunity-cost: neutral (ran but did not materially improve score, proof, or gap); 119-event323__30000ms__opportunity-cost: neutral (ran but did not materially improve score, proof, or gap); 119-event323__120000ms__opportunity-cost: neutral (ran but did not materially improve score, proof, or gap); 1329-no-event__30000ms__opportunity-cost: neutral (ran but did not materially improve score, proof, or gap).

### team-shared

- Verdicts: effective: 1, neutral: 3, not applicable: 8.
- Counters: calls=8, completed=8, aborts=0, states=586, bestImprovement=0.
- Sample classifications: 119-no-event__30000ms__team-shared: effective (gap closure 25%); 119-no-event__120000ms__team-shared: neutral (ran but did not materially improve score, proof, or gap); 119-event323__30000ms__team-shared: neutral (ran but did not materially improve score, proof, or gap); 119-event323__120000ms__team-shared: neutral (ran but did not materially improve score, proof, or gap); 1329-no-event__30000ms__team-shared: not applicable (optimization gate did not run).

### exact-candidate-join

- Verdicts: effective: 1, neutral: 4, not applicable: 4, regressive: 3.
- Counters: calls=9, completed=1, aborts=8, generated=128248, maxCandidateCount=20000, pairs=1253073, thirdQueries=248137.
- Sample classifications: 119-no-event__30000ms__exact-candidate-join: effective (gap closure 25%); 119-no-event__120000ms__exact-candidate-join: neutral (ran but did not materially improve score, proof, or gap); 119-event323__30000ms__exact-candidate-join: neutral (ran but did not materially improve score, proof, or gap); 119-event323__120000ms__exact-candidate-join: neutral (ran but did not materially improve score, proof, or gap); 1329-no-event__30000ms__exact-candidate-join: not applicable (optimization gate did not run).

### conflict-bnb-2048

- Verdicts: effective: 1, neutral: 6, not applicable: 4, regressive: 1.
- Counters: calls=8, completed=0, aborts=8, nodes=15595, slotSolves=12018, solvedNodes=0, bestUpper=11486406, bestGap=919337.
- Sample classifications: 119-no-event__30000ms__conflict-bnb-2048: effective (gap closure 25%); 119-no-event__120000ms__conflict-bnb-2048: neutral (ran but did not materially improve score, proof, or gap); 119-event323__30000ms__conflict-bnb-2048: neutral (ran but did not materially improve score, proof, or gap); 119-event323__120000ms__conflict-bnb-2048: neutral (ran but did not materially improve score, proof, or gap); 1329-no-event__30000ms__conflict-bnb-2048: not applicable (optimization gate did not run).
- If this remains neutral/regressive, the immediate reason is that independent per-slot best-team upper bounds did not reach solved disjoint nodes.

### conflict-bnb-8192

- Verdicts: neutral: 4, not applicable: 4, regressive: 4.
- Counters: calls=8, completed=0, aborts=8, nodes=49589, slotSolves=27696, solvedNodes=0, bestUpper=11486406, bestGap=919337.
- Sample classifications: 119-no-event__30000ms__conflict-bnb-8192: regressive (lower incumbent than baseline); 119-no-event__120000ms__conflict-bnb-8192: neutral (ran but did not materially improve score, proof, or gap); 119-event323__30000ms__conflict-bnb-8192: regressive (gap increased by 775240); 119-event323__120000ms__conflict-bnb-8192: neutral (ran but did not materially improve score, proof, or gap); 1329-no-event__30000ms__conflict-bnb-8192: not applicable (optimization gate did not run).
- If this remains neutral/regressive, the immediate reason is that independent per-slot best-team upper bounds did not reach solved disjoint nodes.

### anchor-pair

- Not benchmarked. The source currently exposes `enableAnchorPairUpper?: boolean`, but no runtime implementation reads it in `bandori-medley-team-search.ts`; it is therefore marked as not reproducible/no runtime effect in this review.

## Witness Runs

| scenario | score | upperWitness | upperEval | upperGap | capacityUpper | capacityEval | capacityGap | dupCards | context/product gap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 119-event323 | 1504051 | 1606220 | 2381461 | -775241 | 1606220 | 1473647 | 132573 | 0 | -30006 |
| 119-no-event | 1407785 | 1494224 | 2327122 | -832898 | 1494224 | 1367917 | 126307 | 0 | -30132 |
| 1329-event323-locked-hhw-happy | 9299588 | 9582666 | 10154948 | -572282 | 9582666 | 9195380 | 387286 | 0 | -84549 |
| 1329-no-event | 8533987 | 8840725 | 9364016 | -523291 | 8840725 | 8158904 | 681821 | 0 | -205278 |
| 1889-event323-locked-pasupare-powerful | 11146635 | 11183341 | 11486406 | -303065 | 11183341 | 11088770 | 94571 | 0 | -428699 |
| 1889-no-event | 9128583 | 9208864 | 9624933 | -416069 | 9208864 | 9070854 | 138010 | 0 | -476857 |

## Differences From Previous Comparable Results

| previous note | run id | expected score/gap | actual score/gap | note |
| --- | --- | --- | --- | --- |
| previous 119 no-event 30s baseline | 119-no-event__30000ms__baseline | 1407785/86440 | 1693959/115628 | score or gap changed |

## Run Completeness

| missing run id | type |
| --- | --- |
| 119-no-event__1000ms__baseline | benchmark |
| 119-no-event__1000ms__anchor-slot | benchmark |
| 119-no-event__1000ms__opportunity-cost | benchmark |
| 119-no-event__1000ms__team-shared | benchmark |
| 119-no-event__1000ms__exact-candidate-join | benchmark |
| 119-no-event__1000ms__conflict-bnb-2048 | benchmark |
| 119-no-event__1000ms__conflict-bnb-8192 | benchmark |
| 119-no-event__3000ms__baseline | benchmark |
| 119-no-event__3000ms__anchor-slot | benchmark |
| 119-no-event__3000ms__opportunity-cost | benchmark |
| 119-no-event__3000ms__team-shared | benchmark |
| 119-no-event__3000ms__exact-candidate-join | benchmark |
| 119-no-event__3000ms__conflict-bnb-2048 | benchmark |
| 119-no-event__3000ms__conflict-bnb-8192 | benchmark |
| 119-no-event__10000ms__anchor-slot | benchmark |
| 119-no-event__10000ms__opportunity-cost | benchmark |
| 119-no-event__10000ms__team-shared | benchmark |
| 119-no-event__10000ms__exact-candidate-join | benchmark |
| 119-no-event__10000ms__conflict-bnb-2048 | benchmark |
| 119-no-event__10000ms__conflict-bnb-8192 | benchmark |
| 119-event323__1000ms__baseline | benchmark |
| 119-event323__1000ms__anchor-slot | benchmark |
| 119-event323__1000ms__opportunity-cost | benchmark |
| 119-event323__1000ms__team-shared | benchmark |
| 119-event323__1000ms__exact-candidate-join | benchmark |
| 119-event323__1000ms__conflict-bnb-2048 | benchmark |
| 119-event323__1000ms__conflict-bnb-8192 | benchmark |
| 119-event323__3000ms__baseline | benchmark |
| 119-event323__3000ms__anchor-slot | benchmark |
| 119-event323__3000ms__opportunity-cost | benchmark |
| 119-event323__3000ms__team-shared | benchmark |
| 119-event323__3000ms__exact-candidate-join | benchmark |
| 119-event323__3000ms__conflict-bnb-2048 | benchmark |
| 119-event323__3000ms__conflict-bnb-8192 | benchmark |
| 119-event323__10000ms__baseline | benchmark |
| 119-event323__10000ms__anchor-slot | benchmark |
| 119-event323__10000ms__opportunity-cost | benchmark |
| 119-event323__10000ms__team-shared | benchmark |
| 119-event323__10000ms__exact-candidate-join | benchmark |
| 119-event323__10000ms__conflict-bnb-2048 | benchmark |
- 83 additional missing runs omitted from this table.

## Raw Benchmark Rows

| run id | score | exact | mode | upper | gap | relGap | gapClosure | elapsed | timeToBest | replay states | replay prunable | root pruned | wall | limiter | capacityMode |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 119-event323__120000ms__anchor-slot | 1504051 | false | bounded | 1606221 | 102170 |  | 0.00% | 120105 |  |  |  |  | 121239 | capacity | context-bound-mccormick |
| 119-event323__120000ms__baseline | 1504051 | false | bounded | 1606221 | 102170 |  |  | 120141 |  |  |  |  | 121247 | capacity | context-bound-mccormick |
| 119-event323__120000ms__conflict-bnb-2048 | 1504051 | false | bounded | 1606221 | 102170 |  | 0.00% | 120000 |  |  |  |  | 121154 | capacity | context-bound-mccormick |
| 119-event323__120000ms__conflict-bnb-8192 | 1504051 | false | bounded | 1606221 | 102170 |  | 0.00% | 120000 |  |  |  |  | 121154 | capacity | context-bound-mccormick |
| 119-event323__120000ms__exact-candidate-join | 1504051 | false | bounded | 1606221 | 102170 |  | 0.00% | 120000 |  |  |  |  | 121124 | capacity | context-bound-mccormick |
| 119-event323__120000ms__opportunity-cost | 1504051 | false | bounded | 1606221 | 102170 |  | 0.00% | 120041 |  |  |  |  | 121160 | capacity | context-bound-mccormick |
| 119-event323__120000ms__team-shared | 1504051 | false | bounded | 1606221 | 102170 |  | 0.00% | 120071 |  |  |  |  | 121099 | capacity | context-bound-mccormick |
| 119-event323__30000ms__anchor-slot | 1504051 | false | bounded | 1606221 | 102170 |  | 0.00% | 30164 |  |  |  |  | 31170 | capacity | context-bound-mccormick |
| 119-event323__30000ms__baseline | 1504051 | false | bounded | 1606221 | 102170 |  |  | 30179 |  |  |  |  | 31207 | capacity | context-bound-mccormick |
| 119-event323__30000ms__conflict-bnb-2048 | 1504051 | false | bounded | 1606221 | 102170 |  | 0.00% | 33199 |  |  |  |  | 34356 | capacity | context-bound-mccormick |
| 119-event323__30000ms__conflict-bnb-8192 | 1504051 | false | bounded | 2381461 | 877410 |  | -758.77% | 30000 |  |  |  |  | 31203 | capacity | card-bound-skill-aware |
| 119-event323__30000ms__exact-candidate-join | 1504051 | false | bounded | 1606221 | 102170 |  | 0.00% | 31010 |  |  |  |  | 32071 | capacity | context-bound-mccormick |
| 119-event323__30000ms__opportunity-cost | 1504051 | false | bounded | 1606221 | 102170 |  | 0.00% | 30058 |  |  |  |  | 31071 | capacity | context-bound-mccormick |
| 119-event323__30000ms__team-shared | 1504051 | false | bounded | 1606221 | 102170 |  | 0.00% | 30046 |  |  |  |  | 31053 | capacity | context-bound-mccormick |
| 119-no-event__10000ms__baseline | 1693959 | false | bounded | 1861034 | 167075 | 9.86% |  | 10143 | 815 | 0 | 0 | 0 | 11321 | capacity | coefficient |
| 119-no-event__120000ms__anchor-slot | 1407785 | false | bounded | 1494225 | 86440 |  | 0.00% | 120103 |  |  |  |  | 121423 | capacity | context-bound-mccormick |
| 119-no-event__120000ms__baseline | 1407785 | false | bounded | 1494225 | 86440 |  |  | 120158 |  |  |  |  | 121351 | capacity | context-bound-mccormick |
| 119-no-event__120000ms__conflict-bnb-2048 | 1407785 | false | bounded | 1494225 | 86440 |  | 0.00% | 120000 |  |  |  |  | 121137 | capacity | context-bound-mccormick |
| 119-no-event__120000ms__conflict-bnb-8192 | 1407785 | false | bounded | 1494225 | 86440 |  | 0.00% | 120001 |  |  |  |  | 121228 | capacity | context-bound-mccormick |
| 119-no-event__120000ms__exact-candidate-join | 1407785 | false | bounded | 1494225 | 86440 |  | 0.00% | 120000 |  |  |  |  | 121069 | capacity | context-bound-mccormick |
| 119-no-event__120000ms__opportunity-cost | 1407785 | false | bounded | 1494225 | 86440 |  | 0.00% | 120134 |  |  |  |  | 121284 | capacity | context-bound-mccormick |
| 119-no-event__120000ms__team-shared | 1407785 | false | bounded | 1494225 | 86440 |  | 0.00% | 120040 |  |  |  |  | 121140 | capacity | context-bound-mccormick |
| 119-no-event__30000ms__anchor-slot | 1407785 | false | bounded | 1494225 | 86440 |  | 25.24% | 30213 |  |  |  |  | 31243 | capacity | context-bound-mccormick |
| 119-no-event__30000ms__baseline | 1693959 | false | bounded | 1809587 | 115628 | 6.83% |  | 30018 | 789 | 256 | 0 | 0 | 31176 | capacity | context-bound-mccormick |
| 119-no-event__30000ms__conflict-bnb-2048 | 1407785 | false | bounded | 1494225 | 86440 |  | 25.24% | 30000 |  |  |  |  | 31061 | capacity | context-bound-mccormick |
| 119-no-event__30000ms__conflict-bnb-8192 | 1407785 | false | bounded | 2327122 | 919337 |  | -695.08% | 30000 |  |  |  |  | 31153 | capacity | card-bound-skill-aware |
| 119-no-event__30000ms__exact-candidate-join | 1407785 | false | bounded | 1494225 | 86440 |  | 25.24% | 30001 |  |  |  |  | 31226 | capacity | context-bound-mccormick |
| 119-no-event__30000ms__opportunity-cost | 1407785 | false | bounded | 1494225 | 86440 |  | 25.24% | 30076 |  |  |  |  | 31202 | capacity | context-bound-mccormick |
| 119-no-event__30000ms__team-shared | 1407785 | false | bounded | 1494225 | 86440 |  | 25.24% | 30168 |  |  |  |  | 31267 | capacity | context-bound-mccormick |
| 1329-event323-locked-hhw-happy__120000ms__anchor-slot | 9299588 | false | bounded | 9582667 | 283079 |  | 0.00% | 120077 |  |  |  |  | 121160 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy__120000ms__baseline | 9299588 | false | bounded | 9582667 | 283079 |  |  | 120092 |  |  |  |  | 121199 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy__120000ms__conflict-bnb-2048 | 9299588 | false | bounded | 9582667 | 283079 |  | 0.00% | 120000 |  |  |  |  | 121293 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy__120000ms__conflict-bnb-8192 | 9299588 | false | bounded | 9582667 | 283079 |  | 0.00% | 120000 |  |  |  |  | 121387 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy__120000ms__exact-candidate-join | 9299588 | false | bounded | 9582667 | 283079 |  | 0.00% | 120000 |  |  |  |  | 121218 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy__120000ms__opportunity-cost | 9299588 | false | bounded | 9582667 | 283079 |  | 0.00% | 120050 |  |  |  |  | 121136 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy__120000ms__team-shared | 9299588 | false | bounded | 9582667 | 283079 |  | 0.00% | 120035 |  |  |  |  | 121177 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy__30000ms__anchor-slot | 9299588 | false | bounded | 9582667 | 283079 |  | 0.00% | 30057 |  |  |  |  | 31197 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy__30000ms__baseline | 9299588 | false | bounded | 9582667 | 283079 |  |  | 30098 |  |  |  |  | 31122 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy__30000ms__conflict-bnb-2048 | 9299588 | false | bounded | 10154948 | 855360 |  | -202.16% | 30000 |  |  |  |  | 31216 |  |  |
| 1329-event323-locked-hhw-happy__30000ms__conflict-bnb-8192 | 9299588 | false | bounded | 10154948 | 855360 |  | -202.16% | 30000 |  |  |  |  | 31315 |  |  |
| 1329-event323-locked-hhw-happy__30000ms__exact-candidate-join | 9299588 | false | bounded |  |  |  |  | 30000 |  |  |  |  | 31229 | capacity | card-bound-skill-aware |
| 1329-event323-locked-hhw-happy__30000ms__opportunity-cost | 9299588 | false | bounded | 9582667 | 283079 |  | 0.00% | 30032 |  |  |  |  | 31134 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy__30000ms__team-shared | 9299588 | false | bounded | 9582667 | 283079 |  | 0.00% | 30031 |  |  |  |  | 31058 | capacity | card-bound-lagrangian |
| 1329-no-event__10000ms__baseline | 8533987 | false | bounded |  |  |  |  | 10039 | 10039 | 0 | 0 | 0 | 11331 |  |  |
| 1329-no-event__120000ms__anchor-slot | 8533987 | false | bounded | 8840726 | 306739 |  | 0.00% | 120796 |  |  |  |  | 122048 | capacity | card-bound-skill-aware |
| 1329-no-event__120000ms__baseline | 8533987 | false | bounded | 8840726 | 306739 |  |  | 120631 |  |  |  |  | 121856 | capacity | card-bound-skill-aware |
| 1329-no-event__120000ms__conflict-bnb-2048 | 8533987 | false | bounded | 8840726 | 306739 |  | 0.00% | 120140 |  |  |  |  | 121509 | capacity | card-bound-skill-aware |
| 1329-no-event__120000ms__conflict-bnb-8192 | 8533987 | false | bounded | 8840726 | 306739 |  | 0.00% | 120433 |  |  |  |  | 121808 | capacity | card-bound-skill-aware |
| 1329-no-event__120000ms__exact-candidate-join | 8533987 | false | bounded | 8840726 | 306739 |  | 0.00% | 120112 |  |  |  |  | 121469 | capacity | card-bound-skill-aware |
| 1329-no-event__120000ms__opportunity-cost | 8533987 | false | bounded | 8840726 | 306739 |  | 0.00% | 120242 |  |  |  |  | 121648 | capacity | card-bound-skill-aware |
| 1329-no-event__120000ms__team-shared | 8533987 | false | bounded | 8840726 | 306739 |  | 0.00% | 120211 |  |  |  |  | 121582 | capacity | card-bound-skill-aware |
| 1329-no-event__30000ms__anchor-slot | 8533987 | false | bounded | 8840726 | 306739 |  | 0.00% | 32040 |  |  |  |  | 33168 | capacity | card-bound-skill-aware |
| 1329-no-event__30000ms__baseline | 8533987 | false | bounded | 8840726 | 306739 | 3.59% |  | 30403 | 5674 | 256 | 0 | 0 | 31736 | capacity | card-bound-skill-aware |
| 1329-no-event__30000ms__conflict-bnb-2048 | 8533987 | false | bounded | 8840726 | 306739 |  | 0.00% | 30148 |  |  |  |  | 31211 | capacity | card-bound-skill-aware |
| 1329-no-event__30000ms__conflict-bnb-8192 | 8533987 | false | bounded | 8840726 | 306739 |  | 0.00% | 31102 |  |  |  |  | 32307 | capacity | card-bound-skill-aware |
| 1329-no-event__30000ms__exact-candidate-join | 8533987 | false | bounded | 8840726 | 306739 |  | 0.00% | 30999 |  |  |  |  | 32048 | capacity | card-bound-skill-aware |
| 1329-no-event__30000ms__opportunity-cost | 8533987 | false | bounded | 8840726 | 306739 |  | 0.00% | 30522 |  |  |  |  | 31644 | capacity | card-bound-skill-aware |
| 1329-no-event__30000ms__team-shared | 8533987 | false | bounded | 8840726 | 306739 |  | 0.00% | 31720 |  |  |  |  | 32875 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__120000ms__anchor-slot | 11146635 | false | bounded | 11183342 | 36707 |  | 0.00% | 120001 |  |  |  |  | 121142 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__120000ms__baseline | 11146635 | false | bounded | 11183342 | 36707 |  |  | 120494 |  |  |  |  | 121586 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__120000ms__conflict-bnb-2048 | 11146635 | false | bounded | 11183342 | 36707 |  | 0.00% | 120002 |  |  |  |  | 121201 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__120000ms__conflict-bnb-8192 | 11146635 | false | bounded | 11183342 | 36707 |  | 0.00% | 120003 |  |  |  |  | 121390 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__120000ms__exact-candidate-join | 11146635 | false | bounded |  |  |  |  | 120000 |  |  |  |  | 121675 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__120000ms__opportunity-cost | 11146635 | false | bounded | 11183342 | 36707 |  | 0.00% | 120169 |  |  |  |  | 121326 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__120000ms__team-shared | 11146635 | false | bounded | 11183342 | 36707 |  | 0.00% | 120012 |  |  |  |  | 121142 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__30000ms__anchor-slot | 11146635 | false | bounded | 11183342 | 36707 |  | 0.00% | 30236 |  |  |  |  | 31341 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__30000ms__baseline | 11146635 | false | bounded | 11183342 | 36707 |  |  | 30212 |  |  |  |  | 31317 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__30000ms__conflict-bnb-2048 | 11146635 | false | bounded | 11183342 | 36707 |  | 0.00% | 30002 |  |  |  |  | 31153 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__30000ms__conflict-bnb-8192 | 11146635 | false | bounded | 11486406 | 339771 |  | -825.63% | 30001 |  |  |  |  | 31193 |  |  |
| 1889-event323-locked-pasupare-powerful__30000ms__exact-candidate-join | 11146635 | false | bounded |  |  |  |  | 30000 |  |  |  |  | 31193 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__30000ms__opportunity-cost | 11146635 | false | bounded | 11183342 | 36707 |  | 0.00% | 30140 |  |  |  |  | 31146 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__30000ms__team-shared | 11146635 | false | bounded | 11183342 | 36707 |  | 0.00% | 30227 |  |  |  |  | 31342 | capacity | card-bound-skill-aware |
| 1889-no-event__10000ms__baseline | 9125980 | false | bounded | 9208865 | 82885 | 0.91% |  | 10161 | 1532 | 256 | 0 | 0 | 11463 | capacity | card-bound-skill-aware |
| 1889-no-event__120000ms__anchor-slot | 9128583 | false | bounded | 9208865 | 80282 |  | 0.00% | 121049 |  |  |  |  | 122299 | capacity | card-bound-skill-aware |
| 1889-no-event__120000ms__baseline | 9128583 | false | bounded | 9208865 | 80282 |  |  | 120057 |  |  |  |  | 121332 | capacity | card-bound-skill-aware |
| 1889-no-event__120000ms__conflict-bnb-2048 | 9128583 | false | bounded | 9208865 | 80282 |  | 0.00% | 120133 |  |  |  |  | 121367 | capacity | card-bound-skill-aware |
| 1889-no-event__120000ms__conflict-bnb-8192 | 9128583 | false | bounded | 9208865 | 80282 |  | 0.00% | 120927 |  |  |  |  | 122226 | capacity | card-bound-skill-aware |
| 1889-no-event__120000ms__exact-candidate-join | 9128583 | false | bounded | 9208865 | 80282 |  | 0.00% | 120719 |  |  |  |  | 121983 | capacity | card-bound-skill-aware |
| 1889-no-event__120000ms__opportunity-cost | 9128583 | false | bounded | 9208865 | 80282 |  | 0.00% | 120339 |  |  |  |  | 121595 | capacity | card-bound-skill-aware |
| 1889-no-event__120000ms__team-shared | 9128583 | false | bounded | 9208865 | 80282 |  | 0.00% | 120369 |  |  |  |  | 121590 | capacity | card-bound-skill-aware |
| 1889-no-event__30000ms__anchor-slot | 9128583 | false | bounded | 9208865 | 80282 |  | 0.00% | 30471 |  |  |  |  | 31643 | capacity | card-bound-skill-aware |
| 1889-no-event__30000ms__baseline | 9128583 | false | bounded | 9208865 | 80282 | 0.88% |  | 31453 | 11319 | 256 | 0 | 0 | 32761 | capacity | card-bound-skill-aware |
| 1889-no-event__30000ms__conflict-bnb-2048 | 9128583 | false | bounded | 9208865 | 80282 |  | 0.00% | 30517 |  |  |  |  | 31675 | capacity | card-bound-skill-aware |
| 1889-no-event__30000ms__conflict-bnb-8192 | 9128583 | false | bounded | 9208865 | 80282 |  | 0.00% | 32318 |  |  |  |  | 33500 | capacity | card-bound-skill-aware |
| 1889-no-event__30000ms__exact-candidate-join | 9128583 | false | bounded | 9208865 | 80282 |  | 0.00% | 30378 |  |  |  |  | 31638 | capacity | card-bound-skill-aware |
| 1889-no-event__30000ms__opportunity-cost | 9128583 | false | bounded | 9208865 | 80282 |  | 0.00% | 31214 |  |  |  |  | 32344 | capacity | card-bound-skill-aware |
| 1889-no-event__30000ms__team-shared | 9128583 | false | bounded | 9208865 | 80282 |  | 0.00% | 31703 |  |  |  |  | 32913 | capacity | card-bound-skill-aware |

