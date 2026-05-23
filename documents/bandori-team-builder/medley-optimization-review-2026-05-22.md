# Medley Optimization Review - 2026-05-22

## Summary

- Raw JSONL: `D:\Workspace\hhwx\temp\bandori-team-builder\medley-optimization-review-runs.jsonl`
- Planned runs: 90 (6 scenarios x 2 durations x 7 variants + 6 witness runs).
- Successful runs: 90; errors: 0; missing: 0.
- Source state recorded before run: yes.
- Git status at start: `M src/lib/bandori-medley-team-search.ts`.

## Baseline

| scenario | ms | score | exact | mode | upper | gap | limiter | capacityMode |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 119-event323 | 30000 | 1504051 | false | bounded | 1606221 | 102170 | capacity | context-bound-mccormick |
| 119-event323 | 120000 | 1504051 | false | bounded | 1606221 | 102170 | capacity | context-bound-mccormick |
| 119-no-event | 30000 | 1407785 | false | bounded | 1494225 | 86440 | capacity | context-bound-mccormick |
| 119-no-event | 120000 | 1407785 | false | bounded | 1494225 | 86440 | capacity | context-bound-mccormick |
| 1329-event323-locked-hhw-happy | 30000 | 9299588 | false | bounded | 9582667 | 283079 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy | 120000 | 9299588 | false | bounded | 9582667 | 283079 | capacity | card-bound-lagrangian |
| 1329-no-event | 30000 | 8533987 | false | bounded | 8840726 | 306739 | capacity | card-bound-skill-aware |
| 1329-no-event | 120000 | 8533987 | false | bounded | 8840726 | 306739 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful | 30000 | 11146635 | false | bounded | 11183342 | 36707 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful | 120000 | 11146635 | false | bounded | 11183342 | 36707 | capacity | card-bound-skill-aware |
| 1889-no-event | 30000 | 9128583 | false | bounded | 9208865 | 80282 | capacity | card-bound-skill-aware |
| 1889-no-event | 120000 | 9128583 | false | bounded | 9208865 | 80282 | capacity | card-bound-skill-aware |

## Direction Verdicts

| direction | runs | verdict counts | best score | best gap |
| --- | --- | --- | --- | --- |
| anchor-slot | 12 | neutral: 12 | 11146635 | 36707 |
| opportunity-cost | 12 | neutral: 12 | 11146635 | 36707 |
| team-shared | 12 | neutral: 4, not applicable: 8 | 11146635 | 36707 |
| exact-candidate-join | 12 | neutral: 5, not applicable: 4, regressive: 3 | 11146635 | 80282 |
| conflict-bnb-2048 | 12 | neutral: 7, not applicable: 4, regressive: 1 | 11146635 | 36707 |
| conflict-bnb-8192 | 12 | neutral: 4, not applicable: 4, regressive: 4 | 11146635 | 36707 |

### baseline/current default bundle

- Exact proofs: 0/12.
- Baseline limiter distribution: capacity / card-bound-lagrangian: 2, capacity / card-bound-skill-aware: 6, capacity / context-bound-mccormick: 4.
- A bounded result remains only a bounded incumbent; the report treats exact proof as `isExhaustive=true` and `searchMode=exact` only.

### anchor-slot

- Verdicts: neutral: 12.
- Counters: calls=12, completed=12, aborts=0, improvements=0, bestImprovement=0.
- Sample classifications: 119-no-event__30000ms__anchor-slot: neutral (ran but did not materially improve score, proof, or gap); 119-no-event__120000ms__anchor-slot: neutral (ran but did not materially improve score, proof, or gap); 119-event323__30000ms__anchor-slot: neutral (ran but did not materially improve score, proof, or gap); 119-event323__120000ms__anchor-slot: neutral (ran but did not materially improve score, proof, or gap); 1329-no-event__30000ms__anchor-slot: neutral (ran but did not materially improve score, proof, or gap).

### opportunity-cost

- Verdicts: neutral: 12.
- Counters: calls=12, completed=12, aborts=0, improvements=0, bestImprovement=0.
- Sample classifications: 119-no-event__30000ms__opportunity-cost: neutral (ran but did not materially improve score, proof, or gap); 119-no-event__120000ms__opportunity-cost: neutral (ran but did not materially improve score, proof, or gap); 119-event323__30000ms__opportunity-cost: neutral (ran but did not materially improve score, proof, or gap); 119-event323__120000ms__opportunity-cost: neutral (ran but did not materially improve score, proof, or gap); 1329-no-event__30000ms__opportunity-cost: neutral (ran but did not materially improve score, proof, or gap).

### team-shared

- Verdicts: neutral: 4, not applicable: 8.
- Counters: calls=8, completed=8, aborts=0, states=586, bestImprovement=0.
- Sample classifications: 119-no-event__30000ms__team-shared: neutral (ran but did not materially improve score, proof, or gap); 119-no-event__120000ms__team-shared: neutral (ran but did not materially improve score, proof, or gap); 119-event323__30000ms__team-shared: neutral (ran but did not materially improve score, proof, or gap); 119-event323__120000ms__team-shared: neutral (ran but did not materially improve score, proof, or gap); 1329-no-event__30000ms__team-shared: not applicable (optimization gate did not run).

### exact-candidate-join

- Verdicts: neutral: 5, not applicable: 4, regressive: 3.
- Counters: calls=9, completed=1, aborts=8, generated=128248, maxCandidateCount=20000, pairs=1253073, thirdQueries=248137.
- Sample classifications: 119-no-event__30000ms__exact-candidate-join: neutral (ran but did not materially improve score, proof, or gap); 119-no-event__120000ms__exact-candidate-join: neutral (ran but did not materially improve score, proof, or gap); 119-event323__30000ms__exact-candidate-join: neutral (ran but did not materially improve score, proof, or gap); 119-event323__120000ms__exact-candidate-join: neutral (ran but did not materially improve score, proof, or gap); 1329-no-event__30000ms__exact-candidate-join: not applicable (optimization gate did not run).

### conflict-bnb-2048

- Verdicts: neutral: 7, not applicable: 4, regressive: 1.
- Counters: calls=8, completed=0, aborts=8, nodes=15595, slotSolves=12018, solvedNodes=0, bestUpper=11486406, bestGap=919337.
- Sample classifications: 119-no-event__30000ms__conflict-bnb-2048: neutral (ran but did not materially improve score, proof, or gap); 119-no-event__120000ms__conflict-bnb-2048: neutral (ran but did not materially improve score, proof, or gap); 119-event323__30000ms__conflict-bnb-2048: neutral (ran but did not materially improve score, proof, or gap); 119-event323__120000ms__conflict-bnb-2048: neutral (ran but did not materially improve score, proof, or gap); 1329-no-event__30000ms__conflict-bnb-2048: not applicable (optimization gate did not run).
- If this remains neutral/regressive, the immediate reason is that independent per-slot best-team upper bounds did not reach solved disjoint nodes.

### conflict-bnb-8192

- Verdicts: neutral: 4, not applicable: 4, regressive: 4.
- Counters: calls=8, completed=0, aborts=8, nodes=49589, slotSolves=27696, solvedNodes=0, bestUpper=11486406, bestGap=919337.
- Sample classifications: 119-no-event__30000ms__conflict-bnb-8192: regressive (gap increased by 832897); 119-no-event__120000ms__conflict-bnb-8192: neutral (ran but did not materially improve score, proof, or gap); 119-event323__30000ms__conflict-bnb-8192: regressive (gap increased by 775240); 119-event323__120000ms__conflict-bnb-8192: neutral (ran but did not materially improve score, proof, or gap); 1329-no-event__30000ms__conflict-bnb-8192: not applicable (optimization gate did not run).
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

- No mismatch found for comparable previously recorded 30s baseline rows.

## Run Completeness

- All planned runs completed successfully.

## Raw Benchmark Rows

| run id | score | exact | mode | upper | gap | elapsed | wall | limiter | capacityMode |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 119-event323__120000ms__anchor-slot | 1504051 | false | bounded | 1606221 | 102170 | 120105 | 121239 | capacity | context-bound-mccormick |
| 119-event323__120000ms__baseline | 1504051 | false | bounded | 1606221 | 102170 | 120141 | 121247 | capacity | context-bound-mccormick |
| 119-event323__120000ms__conflict-bnb-2048 | 1504051 | false | bounded | 1606221 | 102170 | 120000 | 121154 | capacity | context-bound-mccormick |
| 119-event323__120000ms__conflict-bnb-8192 | 1504051 | false | bounded | 1606221 | 102170 | 120000 | 121154 | capacity | context-bound-mccormick |
| 119-event323__120000ms__exact-candidate-join | 1504051 | false | bounded | 1606221 | 102170 | 120000 | 121124 | capacity | context-bound-mccormick |
| 119-event323__120000ms__opportunity-cost | 1504051 | false | bounded | 1606221 | 102170 | 120041 | 121160 | capacity | context-bound-mccormick |
| 119-event323__120000ms__team-shared | 1504051 | false | bounded | 1606221 | 102170 | 120071 | 121099 | capacity | context-bound-mccormick |
| 119-event323__30000ms__anchor-slot | 1504051 | false | bounded | 1606221 | 102170 | 30164 | 31170 | capacity | context-bound-mccormick |
| 119-event323__30000ms__baseline | 1504051 | false | bounded | 1606221 | 102170 | 30179 | 31207 | capacity | context-bound-mccormick |
| 119-event323__30000ms__conflict-bnb-2048 | 1504051 | false | bounded | 1606221 | 102170 | 33199 | 34356 | capacity | context-bound-mccormick |
| 119-event323__30000ms__conflict-bnb-8192 | 1504051 | false | bounded | 2381461 | 877410 | 30000 | 31203 | capacity | card-bound-skill-aware |
| 119-event323__30000ms__exact-candidate-join | 1504051 | false | bounded | 1606221 | 102170 | 31010 | 32071 | capacity | context-bound-mccormick |
| 119-event323__30000ms__opportunity-cost | 1504051 | false | bounded | 1606221 | 102170 | 30058 | 31071 | capacity | context-bound-mccormick |
| 119-event323__30000ms__team-shared | 1504051 | false | bounded | 1606221 | 102170 | 30046 | 31053 | capacity | context-bound-mccormick |
| 119-no-event__120000ms__anchor-slot | 1407785 | false | bounded | 1494225 | 86440 | 120103 | 121423 | capacity | context-bound-mccormick |
| 119-no-event__120000ms__baseline | 1407785 | false | bounded | 1494225 | 86440 | 120158 | 121351 | capacity | context-bound-mccormick |
| 119-no-event__120000ms__conflict-bnb-2048 | 1407785 | false | bounded | 1494225 | 86440 | 120000 | 121137 | capacity | context-bound-mccormick |
| 119-no-event__120000ms__conflict-bnb-8192 | 1407785 | false | bounded | 1494225 | 86440 | 120001 | 121228 | capacity | context-bound-mccormick |
| 119-no-event__120000ms__exact-candidate-join | 1407785 | false | bounded | 1494225 | 86440 | 120000 | 121069 | capacity | context-bound-mccormick |
| 119-no-event__120000ms__opportunity-cost | 1407785 | false | bounded | 1494225 | 86440 | 120134 | 121284 | capacity | context-bound-mccormick |
| 119-no-event__120000ms__team-shared | 1407785 | false | bounded | 1494225 | 86440 | 120040 | 121140 | capacity | context-bound-mccormick |
| 119-no-event__30000ms__anchor-slot | 1407785 | false | bounded | 1494225 | 86440 | 30213 | 31243 | capacity | context-bound-mccormick |
| 119-no-event__30000ms__baseline | 1407785 | false | bounded | 1494225 | 86440 | 30040 | 30990 | capacity | context-bound-mccormick |
| 119-no-event__30000ms__conflict-bnb-2048 | 1407785 | false | bounded | 1494225 | 86440 | 30000 | 31061 | capacity | context-bound-mccormick |
| 119-no-event__30000ms__conflict-bnb-8192 | 1407785 | false | bounded | 2327122 | 919337 | 30000 | 31153 | capacity | card-bound-skill-aware |
| 119-no-event__30000ms__exact-candidate-join | 1407785 | false | bounded | 1494225 | 86440 | 30001 | 31226 | capacity | context-bound-mccormick |
| 119-no-event__30000ms__opportunity-cost | 1407785 | false | bounded | 1494225 | 86440 | 30076 | 31202 | capacity | context-bound-mccormick |
| 119-no-event__30000ms__team-shared | 1407785 | false | bounded | 1494225 | 86440 | 30168 | 31267 | capacity | context-bound-mccormick |
| 1329-event323-locked-hhw-happy__120000ms__anchor-slot | 9299588 | false | bounded | 9582667 | 283079 | 120077 | 121160 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy__120000ms__baseline | 9299588 | false | bounded | 9582667 | 283079 | 120092 | 121199 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy__120000ms__conflict-bnb-2048 | 9299588 | false | bounded | 9582667 | 283079 | 120000 | 121293 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy__120000ms__conflict-bnb-8192 | 9299588 | false | bounded | 9582667 | 283079 | 120000 | 121387 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy__120000ms__exact-candidate-join | 9299588 | false | bounded | 9582667 | 283079 | 120000 | 121218 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy__120000ms__opportunity-cost | 9299588 | false | bounded | 9582667 | 283079 | 120050 | 121136 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy__120000ms__team-shared | 9299588 | false | bounded | 9582667 | 283079 | 120035 | 121177 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy__30000ms__anchor-slot | 9299588 | false | bounded | 9582667 | 283079 | 30057 | 31197 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy__30000ms__baseline | 9299588 | false | bounded | 9582667 | 283079 | 30098 | 31122 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy__30000ms__conflict-bnb-2048 | 9299588 | false | bounded | 10154948 | 855360 | 30000 | 31216 |  |  |
| 1329-event323-locked-hhw-happy__30000ms__conflict-bnb-8192 | 9299588 | false | bounded | 10154948 | 855360 | 30000 | 31315 |  |  |
| 1329-event323-locked-hhw-happy__30000ms__exact-candidate-join | 9299588 | false | bounded |  |  | 30000 | 31229 | capacity | card-bound-skill-aware |
| 1329-event323-locked-hhw-happy__30000ms__opportunity-cost | 9299588 | false | bounded | 9582667 | 283079 | 30032 | 31134 | capacity | card-bound-lagrangian |
| 1329-event323-locked-hhw-happy__30000ms__team-shared | 9299588 | false | bounded | 9582667 | 283079 | 30031 | 31058 | capacity | card-bound-lagrangian |
| 1329-no-event__120000ms__anchor-slot | 8533987 | false | bounded | 8840726 | 306739 | 120796 | 122048 | capacity | card-bound-skill-aware |
| 1329-no-event__120000ms__baseline | 8533987 | false | bounded | 8840726 | 306739 | 120631 | 121856 | capacity | card-bound-skill-aware |
| 1329-no-event__120000ms__conflict-bnb-2048 | 8533987 | false | bounded | 8840726 | 306739 | 120140 | 121509 | capacity | card-bound-skill-aware |
| 1329-no-event__120000ms__conflict-bnb-8192 | 8533987 | false | bounded | 8840726 | 306739 | 120433 | 121808 | capacity | card-bound-skill-aware |
| 1329-no-event__120000ms__exact-candidate-join | 8533987 | false | bounded | 8840726 | 306739 | 120112 | 121469 | capacity | card-bound-skill-aware |
| 1329-no-event__120000ms__opportunity-cost | 8533987 | false | bounded | 8840726 | 306739 | 120242 | 121648 | capacity | card-bound-skill-aware |
| 1329-no-event__120000ms__team-shared | 8533987 | false | bounded | 8840726 | 306739 | 120211 | 121582 | capacity | card-bound-skill-aware |
| 1329-no-event__30000ms__anchor-slot | 8533987 | false | bounded | 8840726 | 306739 | 32040 | 33168 | capacity | card-bound-skill-aware |
| 1329-no-event__30000ms__baseline | 8533987 | false | bounded | 8840726 | 306739 | 30441 | 31621 | capacity | card-bound-skill-aware |
| 1329-no-event__30000ms__conflict-bnb-2048 | 8533987 | false | bounded | 8840726 | 306739 | 30148 | 31211 | capacity | card-bound-skill-aware |
| 1329-no-event__30000ms__conflict-bnb-8192 | 8533987 | false | bounded | 8840726 | 306739 | 31102 | 32307 | capacity | card-bound-skill-aware |
| 1329-no-event__30000ms__exact-candidate-join | 8533987 | false | bounded | 8840726 | 306739 | 30999 | 32048 | capacity | card-bound-skill-aware |
| 1329-no-event__30000ms__opportunity-cost | 8533987 | false | bounded | 8840726 | 306739 | 30522 | 31644 | capacity | card-bound-skill-aware |
| 1329-no-event__30000ms__team-shared | 8533987 | false | bounded | 8840726 | 306739 | 31720 | 32875 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__120000ms__anchor-slot | 11146635 | false | bounded | 11183342 | 36707 | 120001 | 121142 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__120000ms__baseline | 11146635 | false | bounded | 11183342 | 36707 | 120494 | 121586 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__120000ms__conflict-bnb-2048 | 11146635 | false | bounded | 11183342 | 36707 | 120002 | 121201 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__120000ms__conflict-bnb-8192 | 11146635 | false | bounded | 11183342 | 36707 | 120003 | 121390 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__120000ms__exact-candidate-join | 11146635 | false | bounded |  |  | 120000 | 121675 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__120000ms__opportunity-cost | 11146635 | false | bounded | 11183342 | 36707 | 120169 | 121326 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__120000ms__team-shared | 11146635 | false | bounded | 11183342 | 36707 | 120012 | 121142 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__30000ms__anchor-slot | 11146635 | false | bounded | 11183342 | 36707 | 30236 | 31341 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__30000ms__baseline | 11146635 | false | bounded | 11183342 | 36707 | 30212 | 31317 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__30000ms__conflict-bnb-2048 | 11146635 | false | bounded | 11183342 | 36707 | 30002 | 31153 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__30000ms__conflict-bnb-8192 | 11146635 | false | bounded | 11486406 | 339771 | 30001 | 31193 |  |  |
| 1889-event323-locked-pasupare-powerful__30000ms__exact-candidate-join | 11146635 | false | bounded |  |  | 30000 | 31193 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__30000ms__opportunity-cost | 11146635 | false | bounded | 11183342 | 36707 | 30140 | 31146 | capacity | card-bound-skill-aware |
| 1889-event323-locked-pasupare-powerful__30000ms__team-shared | 11146635 | false | bounded | 11183342 | 36707 | 30227 | 31342 | capacity | card-bound-skill-aware |
| 1889-no-event__120000ms__anchor-slot | 9128583 | false | bounded | 9208865 | 80282 | 121049 | 122299 | capacity | card-bound-skill-aware |
| 1889-no-event__120000ms__baseline | 9128583 | false | bounded | 9208865 | 80282 | 120057 | 121332 | capacity | card-bound-skill-aware |
| 1889-no-event__120000ms__conflict-bnb-2048 | 9128583 | false | bounded | 9208865 | 80282 | 120133 | 121367 | capacity | card-bound-skill-aware |
| 1889-no-event__120000ms__conflict-bnb-8192 | 9128583 | false | bounded | 9208865 | 80282 | 120927 | 122226 | capacity | card-bound-skill-aware |
| 1889-no-event__120000ms__exact-candidate-join | 9128583 | false | bounded | 9208865 | 80282 | 120719 | 121983 | capacity | card-bound-skill-aware |
| 1889-no-event__120000ms__opportunity-cost | 9128583 | false | bounded | 9208865 | 80282 | 120339 | 121595 | capacity | card-bound-skill-aware |
| 1889-no-event__120000ms__team-shared | 9128583 | false | bounded | 9208865 | 80282 | 120369 | 121590 | capacity | card-bound-skill-aware |
| 1889-no-event__30000ms__anchor-slot | 9128583 | false | bounded | 9208865 | 80282 | 30471 | 31643 | capacity | card-bound-skill-aware |
| 1889-no-event__30000ms__baseline | 9128583 | false | bounded | 9208865 | 80282 | 30799 | 31977 | capacity | card-bound-skill-aware |
| 1889-no-event__30000ms__conflict-bnb-2048 | 9128583 | false | bounded | 9208865 | 80282 | 30517 | 31675 | capacity | card-bound-skill-aware |
| 1889-no-event__30000ms__conflict-bnb-8192 | 9128583 | false | bounded | 9208865 | 80282 | 32318 | 33500 | capacity | card-bound-skill-aware |
| 1889-no-event__30000ms__exact-candidate-join | 9128583 | false | bounded | 9208865 | 80282 | 30378 | 31638 | capacity | card-bound-skill-aware |
| 1889-no-event__30000ms__opportunity-cost | 9128583 | false | bounded | 9208865 | 80282 | 31214 | 32344 | capacity | card-bound-skill-aware |
| 1889-no-event__30000ms__team-shared | 9128583 | false | bounded | 9208865 | 80282 | 31703 | 32913 | capacity | card-bound-skill-aware |

