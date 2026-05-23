# Bandori Medley 组队算法笔记

这份文档记录 HHWX 组曲组队搜索的当前实现边界、正确性约束、上界策略和常用验证命令。它用于帮助维护者在上下文压缩或长期间隔后快速恢复设计意图，不保存原始实验流水账。

## 当前结论

- 组曲搜索已经能稳定给出强 `bounded` 结果；当前主要瓶颈是快速证明全局最优，而不是找到强解。
- 只有 `isExhaustive=true` 且 `searchMode="exact"` 才能称为已证明全局最优。
- `bounded` 结果必须同时暴露 `observedScoreUpperBound` 和 `observedScoreUpperBoundGap`，不能写成 exact。
- locked band/attribute 是当前最现实的产品路径：先锁定 `(bandKey, attribute)`，再搜索 parameter、三队卡片分配和技能顺序。
- 1000+ 大卡池的默认目标是 30s/120s 内给出高质量 bounded 结果；exact proof 只在搜索空间实际耗尽时成立。

## 文件边界

- 通用核心：`src/lib/bandori/team-builder/core/`
- 单曲搜索：`src/lib/bandori/team-builder/single/`
- 组曲搜索：`src/lib/bandori/team-builder/medley/`
- 旧兼容 facade：`src/lib/bandori/team-builder/shared/`
- 公开兼容入口：`src/lib/bandori-team-search.ts`
- 组曲公开兼容入口：`src/lib/bandori-medley-team-search.ts`
- Benchmark runner：`temp/bandori-team-builder/benchmark-medley-team-search.cjs`
- 复盘 runner：`temp/bandori-team-builder/run-medley-optimization-review.cjs`

依赖方向必须保持：

```text
medley -> core
single -> core
core -> no single / medley / shared imports
shared -> compatibility facade only
```

## 计分规则

- 组曲固定 3 首歌，目标是三曲总分 `target = "score"`。
- 组曲固定无 fever；slot input 强制 `useFever = false`。
- slot input 强制 `eventType = "medley"`、`liveType = "free"`、`useSpecialRoomBonus = false`。
- 第 1 曲 `startCombo = 0`；第 2 曲继承第 1 曲 note 数；第 3 曲继承前两曲累计 note 数。
- Combo 使用 medley carry-over，combo 加成上限为 `1.34`。
- 每队 5 张卡，同队不能重复角色。
- 跨队允许同角色不同卡，但三队不能重复同一张卡。
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
2. 枚举共享 area item configuration。locked coarse 模式只保留指定 `(bandKey, attribute)`，但仍枚举该组合下的 parameter。
3. 对每个 slot 做同角色 skyline dominance 剪枝。剪枝必须 exact-safe：只有当一张卡在所有 slot 的 power/skill upper 都被另一张同角色卡支配时才能删除。
4. 用 slot candidate join、greedy order、reverse song order、固定 15 卡重排和小规模邻域优化提升 incumbent。
5. 主 DFS 在三个 slot 间搜索互斥卡片分配。节点状态包含 `currentScore`、`bannedCardIds` 和剩余 slot。
6. 每个 DFS 节点计算 safe remaining upper。若 `currentScore + remainingUpper < incumbentThreshold`，才允许剪枝。
7. 最后一个 slot 可用 constrained single-slot solve 快速补全，但仍必须满足卡片互斥和角色约束。

## 上界与证明

- `upper/capacity-assignment.ts` 是剩余 slot 上界的 dispatcher，负责选择当前最紧的 safe upper。
- `upper/capacity-core.ts` 保存容量状态 DP 的通用转移和 Pareto/bucketed 基础结构。
- `upper/card-bound.ts` 处理 card-bound、card-specific coefficient 和 Lagrangian 类模型。
- `upper/context-bound.ts` 处理 band/attribute context 分组、McCormick 和 team-shared coefficient 类模型。
- `upper/card-min.ts` 保存 card-min coefficient 实验模型。
- `upper/common.ts` 保存模型中立的卡片 bucketing helper，避免上界模型之间互相 import。
- `upper/witness.ts` 只负责解释 gap 来源；witness 不参与剪枝。
- `experiments/exact-candidate-join.ts` 和 `experiments/conflict-bnb.ts` 保持 opt-in，不能默认影响 baseline。

任何 upper-bound 改动都必须说明：

- 为什么它不会低估任何可行完成解；
- 它是否只是 heuristic ordering，还是参与 proof pruning；
- 它的 profiling counter 如何证明路径实际触发；
- 它在 timeout 时如何影响 `observedScoreUpperBoundGap`。

## 维护规则

- `search.ts` 只负责组曲总流程：准备、seed、DFS、exact/bounded 结论。
- `slots.ts` 负责 slot 构建、combo carry-over、slot 内枚举和 constrained slot solve。
- `configurations.ts` 负责共享道具配置排序和 coarse filter；auto coarse 会缩小搜索空间，因此最终必须保持 bounded。
- `seeds.ts` 只负责提升 incumbent，不能决定 exact proof。
- `results.ts` 只负责组曲结果组装和排序。
- `profiling.ts` 集中初始化 counters，避免 `search.ts` 被默认值淹没。
- 新 medley 代码应从 `core` 导入通用评分/卡片/谱面能力，不应从 `shared` 或 `single` 导入。

## 验证命令

静态检查：

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint
```

依赖边界检查应满足：

```text
core -> single / medley / shared imports: 0
medley -> single / shared imports: 0
single -> shared/seeds or ../shared imports: 0
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

期望 spot check：top score `1407785`，gap `86440`。

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

期望 spot check：top score `11146635`，gap `36707`。
