# Bandori Medley 组队算法笔记

这份文档记录 HHWX 组曲组队搜索的历史实验、阶段性结论、proof-gap 复盘和维护上下文。组曲算法的 canonical specification 已迁移到 `medley-algorithm.md`；前端接入契约见 `medley-frontend-contract.md`。本文件用于帮助维护者在上下文压缩或长期间隔后快速恢复实验背景，不作为产品 UI 或算法正确性契约。

## 当前结论

- 组曲搜索已经能稳定给出强 `bounded` 结果；当前主要瓶颈是快速证明全局最优，而不是找到强解。
- 只有 `isExhaustive=true` 且 `searchMode="exact"` 才能称为已证明全局最优。
- `bounded` 结果必须同时暴露 `observedScoreUpperBound` 和 `observedScoreUpperBoundGap`，不能写成 exact。
- 优化评估以 proof gap 为主：`relativeGap`、`gapClosureFromBaseline`、time-to-gap、upper replay 和 witness 归因比最终 score 是否变化更重要。
- locked band/attribute 是当前最现实的产品路径：先锁定 `(bandKey, attribute)`，再搜索 parameter、三队卡片分配和技能顺序。
- 大池默认无 coarse filter 时会进入 auto coarse，因此结果只能是 bounded；若要验证“全配置”意义上的全局最优，benchmark 需要显式传 `coarseAreaItemFilter.mode = "all"` 以禁用 auto coarse 但不锁定 band/attribute。
- locked proof 只能证明该 `(bandKey, attribute)` 子空间的全局最优，不能等同于所有 area item configuration 的全局最优。
- 1000+ 大卡池的默认目标是 1s/3s/10s/30s/120s 阶梯内给出可比较的 bounded 结果；exact proof 只在搜索空间实际耗尽时成立。
- 2026-05-31 真实 `user_game_profiles` 抽样显示：5 个 1167-1469 卡真实档案、4 个 all-config 场景共 20 个 case 中，60s exact 只有 `1/20`，120s exact 只有 `5/20`；当前不能把 60s 全配置 exact 视为稳定能力。
- 真实样本的主要瓶颈是单个 area item configuration 的 exact proof：60s 下 `19/20` case 结束时存在未完成/中止配置，120s 补跑后仍有 `15/19` 存在未完成/中止配置。优化重点应放在 exact-candidate-join 的 per-configuration candidate fill，而不是只做配置排序。
- 2026-06-01 固定 hard-case gate 已达到当前 120s 阶段目标：10 个真实样本 all-mode 在 300s 内 `10/10` exact，已知 locked/single hard cases 在 120s 内 exact。最新前端接入契约见 `documents/bandori-team-builder/medley-frontend-contract.md`。

## 当前可执行 gate

完整 120s 阶段 gate：

```powershell
node .\scripts\bandori-medley-hard-case-benchmark.cjs gate-120
```

该 gate 覆盖：

- `all-300`：固定 10 个真实样本，`coarseAreaItemFilter.mode="all"`，每个 profile 300s 内证明 exact。
- `p01-locked`：P01 `PoppinParty/cool` locked band/attribute hard scope，120s 内证明 exact。
- `p01-visual`、`p01-performance`、`p01-technique`、`p05-visual`、`p09-visual`：已知 single locked / single configuration hard cases，120s 内证明 exact。

开发中较短 spot check：

```powershell
node .\scripts\bandori-medley-hard-case-benchmark.cjs p05-visual
node .\scripts\bandori-medley-hard-case-benchmark.cjs p01-locked
```

最新记录：`documents/bandori-team-builder/medley-real-profile-benchmark-2026-05-31.md` 的 `2026-06-01 Typed Third-Shortlist Revalidation` 小节。

## 当前模块边界

- `search.ts`：公开 medley 搜索入口、配置排序、exact/bounded 状态汇总、跨配置 orchestration。
- `slots.ts` / `candidates.ts` / `results.ts`：slot 构建、候选队伍评价、结果排序和结果对象构造。
- `upper/`：proof upper-bound families。返回值必须保持 optimistic；任何收紧都要能解释为安全上界。
- `experiments/exact-candidate-join.ts`：当前 120s gate 的核心 exact proof path，负责候选填充、pair upper、final triple solve 和证明状态。
- `experiments/exact-candidate-join-constants.ts`：candidate-join 常量集中入口。
- `experiments/exact-candidate-join-heap.ts`：slot candidate generator 的 heap helper。
- `experiments/exact-candidate-join-bitsets.ts`：候选卡牌冲突 bitset、重叠检测和 third-candidate lookup helper。

维护规则：前端应依赖 `BandoriMedleyTeamSearchInput` / `BandoriMedleyTeamSearchResponse` 的稳定字段，不依赖 `profiling.configurationTrace` 或 exact-join 内部计数器。debug/profiling 字段只用于 benchmark 和诊断。

## 2026-05-31 真实档案 all-config 基准

详细报告：`documents/bandori-team-builder/medley-real-profile-benchmark-2026-05-31.md`。

本轮从 live `public.user_game_profiles` 抽 5 个真实档案，使用 seed `2026-05-31-real-profile-medley-v1`，卡数为 `1308,1229,1218,1469,1167`。随机 expert 歌曲为 `625`、`225`、`76`。场景为 no event、event `294`、event `305`、event `323`，搜索范围显式设为 `coarseAreaItemFilter.mode="all"`。

完成情况：

| 场景 | case | exact <=60s | exact <=120s | 120s 后仍 bounded |
| --- | ---: | ---: | ---: | ---: |
| no event | 5 | 0 | 1 | 4 |
| event 294 | 5 | 0 | 1 | 4 |
| event 305 | 5 | 1 | 1 | 4 |
| event 323 | 5 | 0 | 2 | 3 |
| total | 20 | 1 | 5 | 15 |

配置级瓶颈：

- 60s：`19/20` case 有未完成或中止的配置；`5/20` case 的第一个配置就吃满 60s。
- 120s：`15/19` rerun 仍有未完成或中止的配置；`4/19` rerun 的第一个配置吃满 120s。
- 120s 后仍 bounded 的 15 个 case 全部有 `exactCandidateJoinAbortCount=1`。
- 120s bounded case 的 `exactCandidateJoinCandidateFillElapsedMs` 最高达到 `110324ms`，`evaluatedTeamCount` 最高达到 `767013`。

结论：真实 1100-1500 卡池的 all-config proof 失败主要来自单配置内高密度 slot-candidate frontier。root pruning 很有价值，但只有在能跳过大量配置时才足以让 exact proof 成立；无法跳过的 hard configuration 仍会把 60/120s 预算耗尽。

## 2026-05-30 locked 1889 proof gap 复核

目标场景：`large-1889-card-pool`、event `323`、locked `PastelPalettes / powerful`、songs `295,300,703` expert、30s、`resultLimit=1`。

复核结果：

- top score 仍为 `11146635`，`searchMode="bounded"`，`timedOut=true`。
- `observedScoreUpperBound=11183342`，`observedScoreUpperBoundGap=36707`，`relativeGap=0.329%`。
- limiting upper 是 `dfs-remaining` / 3 remaining slots / `capacity` / `card-bound-skill-aware`。
- capacity witness 没有跨 slot 重复 card：`overlapCardIds=[]`。因此当前 36,707 gap 不是主要由显式卡片冲突造成。
- 120s 历史复盘仍停在同一 top score 和同一 36,707 gap；单纯加时间没有证明该 locked 场景。

本轮验证过但没有缩小该 gap 的方向：

- 解开 root context-bound McCormick：能运行，但没有压过 `card-bound-skill-aware`。
- 开启 team-shared coefficient：没有压过当前 root upper。
- dominance-pruned Pareto / bucketed / dual-objective：安全剪枝思路成立，但在该卡池根状态触发状态预算中止，不能作为默认上界。
- `card-specific-lagrangian`：完成但没有 improvement。
- anchor-slot decomposition：完成但 root upper 没有 improvement。
- exact-candidate join 和 conflict BnB：30s 内不能证明；conflict BnB 的 observed upper 反而更松。

本轮已落地的安全改动：

- `card-bound-skill-aware` 的 skill contribution 从连续的 `cardBoundPowerUpper * skillRate` 收紧为 note-level floor-aware skill score upper，并对 context-free / context-resolved rate upper 继续取安全的较小上界。
- 同一 floor-aware skill upper 也接入 root-only `card-bound-bucketed-joint` 备选模型；该模型在主样本中仍没有压过 `card-bound-skill-aware`。
- 30s locked 1889 复测：top score 仍为 `11146635`，`observedScoreUpperBound=11182097`，`observedScoreUpperBoundGap=35462`，`relativeGap=0.318%`。相对本节 baseline gap `36707`，关闭 `1245` 分，gap closure 约 `3.39%`。
- 该改动不改变计分语义，不把 bounded 标成 exact；但没有达到本页 `>=10%` proof-gap acceptance threshold。
- locked coarse 大池现在会在 `resultLimit=1`、已有 incumbent、`maxSearchDurationMs >= 30000` 时启用 inclusion upper 剪卡。该剪枝对每张候选卡计算“强制包含此卡”的安全上界；若该上界低于当前 incumbent，则该卡不可能出现在更优解中，可以从三个 slot 同时删除。
- 显式 `mode="all"` 的 proof run 也启用同一 inclusion upper，但 forced-card 循环会在 deadline 前停止；已经分析过的卡仍可安全剪枝，未分析的卡保持原样，避免 proof run 因剪枝本身明显超过预算。
- inclusion upper 在主样本 30s 档完成了 `522` 次 forced-card 分析，安全删除 `446` 张候选卡，让 visual 配置完成并开始第二个 parameter 配置；但 30s 仍为 `bounded`，reported gap 仍是 `35462`。
- inclusion upper 在主样本 60s 档完成 `782` 次 forced-card 分析，安全删除 `669` 张候选卡，三个 locked parameter 配置全部完成：`searchMode="exact"`、`timedOut=false`、elapsed `50953ms`、top score `11146635`、`observedScoreUpperBound=null`、gap `0`。这是当前最有效的 locked 子空间最优证明路径。

本轮继续验证但不保留默认路径的方向：

- root-only min-power McCormick：无 improvement。
- root-only card-bound power threshold：无 improvement。
- root-only base-score floor-loss lower bound：该样本收益为 `0`。
- root-only structured/context capacity upper：触发 context/McCormick 族但仍未压过 `card-bound-skill-aware`，且增加额外计算。
- anchor-slot upper with candidate limit `200`：完成但 root upper 无 improvement。
- exact-candidate join with candidate soft limit `20000` / node soft limit `200000`：30s timeout，不能给 observed upper。
- inclusion 后再启用 exact-candidate join：30s 内能完成 2 个配置，但第三个配置 timeout，且不会给 observed upper；暂不作为默认路径。
- inclusion 后再启用 conflict BnB：30s 内仍 timeout，observed gap 无改善；暂不作为默认路径。

结论：30s 档的主要瓶颈仍在 remaining-slot capacity upper，具体是 `card-bound-skill-aware` 对同一 slot 内 `teamPower * skillRate` 的乘积关联过松；但 60s 档已经可以通过 inclusion upper 把 locked 1889 主样本证明到 exact。下一步若要证明全配置全局最优，必须使用 `mode="all"` 的矩阵验证；若要把 locked 证明压回 30s，应优先优化 inclusion 后的小池 exact proof，而不是继续默认打开全量 heavy upper。

## 2026-05-30 proof matrix 范围复核

新增 runner：`temp/bandori-team-builder/run-medley-proof-matrix.cjs`。

runner 用 `HHWX_MEDLEY_PROOF_MATRIX_PROFILES`、`HHWX_MEDLEY_PROOF_MATRIX_EVENTS`、`HHWX_MEDLEY_PROOF_MATRIX_SONG_SETS`、`HHWX_MEDLEY_PROOF_MATRIX_SCOPES` 和 `HHWX_MEDLEY_PROOF_MATRIX_MS` 生成可复跑矩阵，输出：

- raw JSONL：`temp/bandori-team-builder/medley-proof-matrix-runs.jsonl`
- summary JSON：`temp/bandori-team-builder/medley-proof-matrix-summary.json`
- summary Markdown：`temp/bandori-team-builder/medley-proof-matrix-summary.md`

本轮新增证据：

- `1889__event323__295-300-703__all__60000ms`：top score `12002847`，`searchMode="bounded"`，`timedOut=true`，gap `92713`，elapsed `60811ms`，completed configurations `1/2`，inclusion pruned `220`，limiter `capacity/card-bound-skill-aware`。这说明 60s exact 目前只覆盖 locked 子空间，尚不能证明 event323 全配置全局最优；但把 inclusion upper 扩展到 `mode="all"` 后，已经能在预算附近完成第一个全配置候选配置。
- `1329/event323/locked HelloHappyWorld-happy/60s`：top score `9299588`，gap `283079`，completed configurations `0/1`，inclusion pruned `0`。inclusion upper 对该 locked 样本没有产生剪卡收益，瓶颈仍是 `card-bound-lagrangian` / remaining-slot capacity upper。
- `119/no-event/295-300-703/60s + exact-candidate-join`：默认 `20000` 候选上限会中止；提高到 `100000` 仍在生成阶段触顶，不能进入 pair join proof。单纯提高 exact join 候选预算不是合理的 60s 证明路线。

因此当前目标的真实缺口是：

1. `119` 小池也还没有 60s exact proof；瓶颈不是找解，而是全配置 DFS/slot-candidate 证明。
2. `1329` locked 和 all scope 都未证明；inclusion upper 不一定能剪卡。
3. `1889/event323` 已有 locked 子空间 60s exact，但 all scope 仍 bounded，且 all scope 的 incumbent 高于 locked `PastelPalettes/powerful` 样本。

## 2026-05-25 当前复测结论

本轮复测使用 3 个无活动卡池，组曲搜索不预设 band/attribute；大池会默认进入 auto coarse，选 3 个 coarse groups / 9 个共享道具配置。strict greedy baseline 是“枚举共享道具配置后，按同一最优道具组合做 3 次单曲贪心，并按组曲 combo 重新验算”的结果。

| 场景 | strict greedy | 10s x3 组曲结果 | 30s 组曲结果 | 结论 |
| --- | ---: | --- | --- | --- |
| 119-no-event | 1542003 | 1693959 / 1693959 / 1693959，time-to-best 0.77-0.82s | 1693959，gap 115628，relGap 6.83% | 稳定高于 greedy 151956 |
| 1329-no-event | 8448069 | 8533987 / 8533987 / 8533987，time-to-best 约 10.05-10.09s；10s 未稳定产出 gap | 8533987，gap 306739，relGap 3.59% | 稳定高于 greedy 85918，但 proof 主要要到 30s |
| 1889-no-event | 9055290 | 9125980 / 9125980 / 9125980，time-to-best 1.52-1.64s，relGap 0.91% | 9128583，gap 80282，relGap 0.88% | 稳定高于 greedy 70690-73293 |

因此当前可以回答为：在这 3 个卡池上，组曲已能稳定在 10-30s 内找到不劣于 strict 3x 单曲贪心的结果。后续主要瓶颈不是找不到强解，而是 proof gap：10s 档在 1329 大池仍可能只有 incumbent 没有 observed upper/gap；30s 档能给出 gap，但仍是 `bounded`，不能标 exact。

## 文件边界

- 通用核心：`src/lib/bandori/team-builder/core/`
- 单曲搜索：`src/lib/bandori/team-builder/single/`
- 组曲搜索：`src/lib/bandori/team-builder/medley/`
- 公开兼容入口：`src/lib/bandori-team-search.ts`
- 组曲公开兼容入口：`src/lib/bandori-medley-team-search.ts`
- Benchmark runner：`temp/bandori-team-builder/benchmark-medley-team-search.cjs`
- Proof matrix runner：`temp/bandori-team-builder/run-medley-proof-matrix.cjs`
- 复盘 runner：`temp/bandori-team-builder/run-medley-optimization-review.cjs`
- 3x 单曲贪心基线 runner：`temp/bandori-team-builder/benchmark-medley-three-single-greedy.cjs`
- 真实档案抽样 runner：`temp/bandori-team-builder/benchmark-real-profiles-medley.cjs`
- 真实档案基准报告：`documents/bandori-team-builder/medley-real-profile-benchmark-2026-05-31.md`

依赖方向必须保持：

```text
medley -> core
single -> core
core -> no single / medley imports
```

## 计分规则

- 组曲固定 3 首歌，目标是三曲总分 `target = "score"`。
- 组曲固定无 fever；slot input 强制 `useFever = false`。
- slot input 强制 `eventType = "medley"`、`liveType = "free"`、`useSpecialRoomBonus = false`。
- 第 1 曲 `startCombo = 0`；第 2 曲继承第 1 曲 note 数；第 3 曲继承前两曲累计 note 数。
- Combo 使用 medley carry-over，combo 加成上限为 `1.34`。
- 每队 5 张卡，同队不能重复角色。
- 跨队允许同角色不同卡，但三队不能重复同一张卡。
- 因为组曲固定 3 队，且同队不能重复角色，所以每个角色跨三队最多只能出现 3 次；再叠加三队不能重复同一张卡，可等价理解为每个角色最多贡献 3 张不同卡。
- 完整五人队伍评分必须复用 core 的 `evaluateTeam()`，不要在 medley 内重写音符或技能顺序计分。

每个 medley slot 传入 core scoring 的 combo options：

```ts
{
  startCombo,
  useMedleyCombo: true,
}
```

## 搜索流程

1. 为三首歌构造三个 medley slot。每个 slot 包含 chart、combo options、当前共享道具配置下的 `SearchCard[]`、score cache 和 upper-bound index。
2. 枚举共享 area item configuration。locked coarse 模式只保留指定 `(bandKey, attribute)`，但仍枚举该组合下的 parameter。大池无显式 coarse filter 时默认进入 auto coarse，避免 10s 预算被 100+ 道具配置耗尽。
3. 对每个 slot 做同角色 skyline dominance 剪枝。剪枝必须 exact-safe：只有当一张卡在所有 slot 的 power/skill upper 都被另一张同角色卡支配时才能删除。
4. 用 slot candidate join、greedy order、reverse song order、固定 15 卡重排和小规模邻域优化提升 incumbent。
5. 主 DFS 在三个 slot 间搜索互斥卡片分配。节点状态包含 `currentScore`、`bannedCardIds` 和剩余 slot。
6. 每个 DFS 节点计算 safe remaining upper。若 `currentScore + remainingUpper < incumbentThreshold`，才允许剪枝。
7. 最后一个 slot 可用 constrained single-slot solve 快速补全，但仍必须满足卡片互斥和角色约束。
8. DFS upper cache miss 会抽样做 upper-state replay：同一状态对比当前 tight upper 和基础 coefficient upper，只记录 upper 降幅、可转化剪枝率和耗时，不参与剪枝决策。

## 上界与证明

- `upper/capacity-assignment.ts` 是剩余 slot 上界的 dispatcher，负责选择当前最紧的 safe upper。
- `upper/capacity-core.ts` 保存容量状态 DP 的通用转移和 Pareto/bucketed 基础结构。
- `upper/card-bound.ts` 处理 card-bound、card-specific coefficient 和 Lagrangian 类模型。
- `upper/context-bound.ts` 处理 band/attribute context 分组、McCormick 和 team-shared coefficient 类模型。
- `upper/card-min.ts` 保存 card-min coefficient 实验模型。
- `upper/common.ts` 保存模型中立的卡片 bucketing helper，避免上界模型之间互相 import。
- `upper/witness.ts` 只负责解释 gap 来源；witness 不参与剪枝。
- `experiments/exact-candidate-join.ts` 和 `experiments/conflict-bnb.ts` 保持 opt-in，不能默认影响 baseline。
- “每角色最多 3 张不同卡”已经在 capacity assignment 中被结构性利用：`cardsByCharacter -> cardsById -> slot mask` 让同一 character bucket 最多向 3 个 slot 各贡献一张不同 card；configuration potential 的 15 卡估计也按 character 计数上限取卡。
- 但该约束还没有充分进入 `card-bound-skill-aware` 的隐式队友 power 模型：每张卡的 skill contribution 使用自己的 `cardBoundPowerUpper`，这个 power upper 可以引用未被状态显式占用的高 power 队友，因此仍可能跨 slot 重复使用同一批隐式高 power 卡。这是当前最值得收紧的证明缺口。
- `profiling.relativeGap` 记录 `observedScoreUpperBoundGap / score`；`gapClosureFromBaseline` 由 benchmark runner 按同场景 baseline 回填。
- `upperReplayStateCount`、`upperReplayPrunableStateCount`、`upperReplayAverageImprovement` 和 `upperReplayElapsedMs` 用于判断新 upper 是否值得进入完整矩阵。
- `rootUpperPrunedConfigurationCount` 记录共享道具配置 root upper 低于 incumbent 后被安全跳过的次数。

任何 upper-bound 改动都必须说明：

- 为什么它不会低估任何可行完成解；
- 它是否只是 heuristic ordering，还是参与 proof pruning；
- 它的 profiling counter 如何证明路径实际触发；
- 它在 timeout 时如何影响 `observedScoreUpperBoundGap`。

评估门槛：

- proof 类优化：目标场景 `gapClosureFromBaseline >= 10%` 或 replay 可剪枝率 `>= 5%`。
- speed 类优化：同 score/gap 下 elapsed 或 evaluated count 降低 `>= 10%`。
- incumbent 类优化：在 `<= 10s` 档提升 score 或缩短 `timeToBestScoreMs`。
- 任一方案不得把 bounded 结果标成 exact。

下一步优化计划：

1. 保留 locked 大池 inclusion upper 作为默认的 30s+ proof pass；它不改变计分语义，也不会把 bounded 标成 exact。
2. 为 inclusion 后的小池增加更直接的 exact proof：优先考虑按 pruned character/card set 生成 slot team candidates，并用更强的 disjoint join 或 per-character DP 替代当前 DFS 的大量 repeated remaining-upper 调用。
3. 修正或补充 observed upper 诊断：已完成配置的历史 root upper 不应继续主导“剩余未证明空间”的 gap；未开始配置则需要以 root/configuration upper 进入 bounded 诊断，避免 gap 偏松或偏紧。
4. 若仍要进一步收紧 30s root gap，再做 root-only 的共享 team-power upper，显式限制 `cardBoundPowerUpper` 里的隐式 teammate 不能跨 slot 无限复用。
5. benchmark 接受标准保持：30s locked 1889 的 `observedScoreUpperBoundGap` 至少下降 10%，或 60s 内 `searchMode="exact"` 且三个 locked parameter 配置全部完成。

## 维护规则

- `search.ts` 只负责组曲总流程：准备、seed、DFS、exact/bounded 结论。
- `slots.ts` 负责 slot 构建、combo carry-over、slot 内枚举和 constrained slot solve。
- `configurations.ts` 负责共享道具配置排序和 coarse filter；auto coarse 会缩小搜索空间，因此最终必须保持 bounded。
- `seeds.ts` 只负责提升 incumbent，不能决定 exact proof。
- `results.ts` 只负责组曲结果组装和排序。
- `profiling.ts` 集中初始化 counters，避免 `search.ts` 被默认值淹没。
- 新 medley 代码应从 `core` 导入通用评分/卡片/谱面能力，不应从 `single` 导入。

## 验证命令

静态检查：

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint
```

依赖边界检查应满足：

```text
core -> single / medley imports: 0
medley -> single imports: 0
```

组曲小池 baseline：

```powershell
$env:HHWX_MEDLEY_PROFILE_NAME='small-119-card-pool'
$env:HHWX_MEDLEY_SONG_IDS='295,300,703'
$env:HHWX_MEDLEY_DIFFICULTIES='expert,expert,expert'
$env:HHWX_MEDLEY_RESULT_LIMIT='1'
$env:HHWX_MEDLEY_BENCHMARK_MS='30000'
node .\temp\bandori-team-builder\benchmark-medley-team-search.cjs
```

期望 spot check：top score `1693959`，gap 约 `115628`。

组曲 locked 大池 event：

```powershell
$env:HHWX_MEDLEY_PROFILE_NAME='large-1889-card-pool'
$env:HHWX_MEDLEY_EVENT_ID='323'
$env:HHWX_MEDLEY_COARSE_MODE='locked'
$env:HHWX_MEDLEY_COARSE_BAND='PastelPalettes'
$env:HHWX_MEDLEY_COARSE_ATTRIBUTE='powerful'
$env:HHWX_MEDLEY_BENCHMARK_MS='30000'
node .\temp\bandori-team-builder\benchmark-medley-team-search.cjs
```

期望 spot check：top score `11146635`，gap `35462`。

若验证 exact proof，把同一命令的 `HHWX_MEDLEY_BENCHMARK_MS` 改为 `60000`。

期望 60s spot check：top score `11146635`，`searchMode="exact"`，`timedOut=false`，gap `0`，`completedAreaItemConfigurationCount=3`。

全配置 proof matrix 单项验证：

```powershell
$env:HHWX_MEDLEY_PROOF_MATRIX_MS='60000'
$env:HHWX_MEDLEY_PROOF_MATRIX_SCOPES='all'
node .\temp\bandori-team-builder\run-medley-proof-matrix.cjs --only=1889__event323__295-300-703__all__60000ms --force
```

当前期望：top score `12002847`，`searchMode="bounded"`，gap `92713`，completed configurations `1/2`。这不是通过条件，而是后续优化的全配置基线。

真实档案抽样基准：

```powershell
$env:HHWX_REAL_PROFILE_SAMPLE_COUNT='5'
$env:HHWX_REAL_PROFILE_BENCHMARK_SEED='2026-05-31-real-profile-medley-v1'
node .\temp\bandori-team-builder\benchmark-real-profiles-medley.cjs
```

当前 spot check：live `user_game_profiles` 抽样卡数 `1308,1229,1218,1469,1167`，歌曲 `625,225,76` expert；20 个 all-config case 中 60s exact `1/20`，120s exact `5/20`。若该命令用于后续对比，必须同时报告 60s 和 120s 完成数，并保留 bounded gap。
