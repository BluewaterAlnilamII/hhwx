# Bandori Medley 组队算法笔记

这份文档用于在上下文压缩后快速恢复 medley 组队计算器的当前状态。它只记录当前实现、默认策略、已验证结论和下一步方向，不保存长篇实验流水账。

## 当前结论

- 算法已经能稳定找到优于人工 `第 3 曲 -> 第 2 曲 -> 第 1 曲` 贪心的三队解。
- 当前主要瓶颈不是找不到强解，而是很难快速证明全局最优。
- 119 小卡池 30 秒仍是 `bounded`；最高未证明分支来自 root/high-level 的 3-slot remaining upper。
- locked band/attribute 是当前最现实的产品路径：用户或系统先锁定 `(bandKey, attribute)`，算法再搜索该组合下的 parameter、15 卡分配和三曲队伍。
- 1000+ 大卡池的目标应先是 10-60 秒内给出强 bounded 结果，不承诺 exact。

## 计分规则

- Medley 固定 3 首歌顺序，搜索目标是三曲总分 `target = "score"`。
- Medley 固定无 fever：slot input 强制 `useFever = false`。
- Medley 固定按活动模式计分：slot input 强制 `eventType = "medley"`、`liveType = "free"`、`useSpecialRoomBonus = false`。
- 未传 `eventBonus` 时等价于活动 bonus 为空；传入活动 bonus 时，参数加成进入综合力与歌曲得分。
- 第 1 曲 `startCombo = 0`；第 2 曲继承第 1 曲 note 数；第 3 曲继承前两曲累计 note 数。
- Combo 使用 medley carry-over，combo 加成上限为 `1.34`。
- 每队 5 张卡，同队内不能重复角色。
- 跨队允许同角色不同卡，但三队不能重复同一张卡。

## 文件边界

- Medley 主实现：`src/lib/bandori-medley-team-search.ts`
- 单队共享逻辑：`src/lib/bandori-team-search.ts`
- 兼容导出：`bandori-team-search.ts` 继续 re-export medley 类型和 `searchBandoriBestMedleyTeams()`
- Benchmark：`temp/bandori-team-builder/benchmark-medley-team-search.cjs`
- 计分一致性校验：`temp/bandori-team-builder/verify-medley-scoring-consistency.cjs`
- 本文档：`documents/bandori-team-builder/medley-algorithm-notes.md`

## 分数一致性

Medley 不重新实现音符计分。所有完整 5 卡队伍都复用单队 `evaluateTeam()`。

每个 medley slot 调用共享计分时会传入：

```ts
ScoreComboOptions {
  startCombo,
  useMedleyCombo: true,
}
```

直接校验命令：

```powershell
node temp\bandori-team-builder\verify-medley-scoring-consistency.cjs
$env:HHWX_MEDLEY_EVENT_ID='323'; node temp\bandori-team-builder\verify-medley-scoring-consistency.cjs
node temp\bandori-team-builder\validate-bestdori-hhwx-scoring.cjs
```

最近结果：

- Medley 无活动一致性：`ok: true`
- Medley event 323 一致性：`ok: true`
- 单队 Bestdori-compatible validation：`failureCount = 0`

## 搜索流程

1. 构造 3 个 medley slot。每个 slot 包含 chart、combo options、当前道具配置下的 `SearchCard[]`、score cache 和 upper-bound index。
2. 枚举区域道具配置。locked coarse 模式只保留指定 `(bandKey, attribute)`，但仍枚举该组合下的 3 个 parameter。
3. 对同角色卡做 exact-safe skyline dominance，删除在所有 slot 的 power/skill upper 都被另一张同角色卡支配的卡。
4. 用 greedy seed、reverse song order seed、固定 15 卡重排和少量局部卡池优化提升 incumbent。
5. DFS 逐 slot 选队：
   - 节点记录 `currentScore`、`bannedCardIds` 和剩余 slot。
   - 动态选择下一个 slot，优先处理更可能收紧 proof 的分支。
   - 完整 5 卡后调用 `evaluateTeam()`，精确处理队长、区域道具、活动参数加成和 5! 技能顺序。
6. 对剩余 slot 计算 safe upper。如果 `currentScore + remainingUpper <= incumbent`，则安全剪枝。

## 证明模型

外层是 branch and bound：

```text
如果 upper(remaining) >= 真实剩余最优
且 currentScore + upper(remaining) <= incumbent
则该分支不可能超过当前最优，可以剪掉。
```

多个 safe upper 可以取最小值：

```text
U1 >= OPT, U2 >= OPT  =>  min(U1, U2) >= OPT
```

因此证明效率取决于 root/high-level remaining upper 是否足够紧。

## 当前有效上界

| 上界 | 默认状态 | 作用 | 结论 |
| --- | --- | --- | --- |
| `correlated slot upper` | 启用 | 每首歌单独乐观估计再求和 | safe 但很松，主要兜底 |
| `coefficient` | 启用 | 线性分配 `power * K_slot` | 便宜，是短时限默认 limiter |
| `character-distinct coefficient` | 启用 | 技能系数按角色去重 | 安全修正，root 改善小 |
| `card-specific-coefficient` | tight proof | 每卡使用包含该卡时的 slot 系数上界 | 低成本有效收紧 |
| `context-fixed-card-specific-coefficient` | 小池 proof | 固定部分 skill context | 有效 |
| `context-group-card-specific-coefficient` | 小池 proof | 枚举三 slot 的 context group 组合 | 119 小池早期最强 root upper |
| `context-bound-mccormick` | 小池 proof | 用 McCormick relaxation 绑定同一 slot 的 power 和 skill rate | 当前 119 30s gap 的主要改进来源 |
| `card-bound-skill-aware` | tight proof | 技能贡献绑定到包含该卡时的最大队伍 power | 对 locked 大池有效 |
| `card-bound-lagrangian` | tight proof | 绑定 coefficient 与 card-bound 的同一 assignment | 对 1329 locked 有小收益 |
| `relaxed best slot upper` | 局部分支 | 剩余 slot 的真实单曲最佳和，忽略剩余 slot 抢卡 | 局部有效 |

## 默认关闭或暂停方向

| 方向 | 当前状态 | 原因 |
| --- | --- | --- |
| `card-bound-dual-objective` | 关闭 | 2D frontier 状态膨胀 |
| `card-bound-bucketed-joint` | 关闭 | 未压过当前 limiter |
| `card-min-coefficient` | 关闭 | bucket 合并太松，细化后状态膨胀 |
| `card-specific-lagrangian` | 关闭 | 119/event root improvement 为 0 |
| leader fixed/group | 关闭 | root improvement 为 0 |
| `context-bound-lagrangian` | 关闭 | 收益为 0，event 场景拖慢 |
| power-split McCormick | 关闭 | 状态预算内仍 abort |
| anchor-slot decomposition | 显式实验 | anchor tail 覆盖过松，119 30s improvement 为 0 |
| opportunity-cost | 显式实验 | 119 30s improvement 为 0 |
| 当前轻量 team-shared coefficient | 显式实验 | 完成但未降低 root max |

## 关键开关

默认有效方向：

```ts
MEDLEY_ENABLE_CONTEXT_FIXED_CARD_SPECIFIC_UPPER = true
MEDLEY_ENABLE_CONTEXT_GROUP_CARD_SPECIFIC_UPPER = true
MEDLEY_ENABLE_CONTEXT_BOUND_MCCORMICK_UPPER = true
MEDLEY_ENABLE_CONTEXT_BOUND_SPLIT_SKILL_MCCORMICK_UPPER = true
MEDLEY_ENABLE_CONTEXT_BOUND_CARD_BOUND_UPPER = true
```

默认关闭方向：

```ts
MEDLEY_ENABLE_CARD_BOUND_DUAL_OBJECTIVE_UPPER = false
MEDLEY_ENABLE_CARD_MIN_COEFFICIENT_UPPER = false
MEDLEY_ENABLE_CARD_SPECIFIC_LAGRANGIAN_UPPER = false
MEDLEY_ENABLE_LEADER_FIXED_CARD_SPECIFIC_UPPER = false
MEDLEY_ENABLE_LEADER_GROUP_CARD_SPECIFIC_UPPER = false
MEDLEY_ENABLE_CONTEXT_BOUND_LAGRANGIAN_UPPER = false
MEDLEY_ENABLE_CONTEXT_BOUND_BUCKETED_JOINT_UPPER = false
MEDLEY_ENABLE_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_UPPER = false
```

显式实验输入：

```ts
optimization.captureCapacityUpperWitness?: boolean
optimization.enableOpportunityCostUpper?: boolean
optimization.opportunityAnchorLimit?: number
optimization.enableTeamSharedCoefficientUpper?: boolean
```

对应 benchmark env：

```powershell
$env:HHWX_MEDLEY_CAPTURE_CAPACITY_WITNESS='1'
$env:HHWX_MEDLEY_ENABLE_OPPORTUNITY_UPPER='1'
$env:HHWX_MEDLEY_OPPORTUNITY_ANCHOR_LIMIT='16'
$env:HHWX_MEDLEY_ENABLE_TEAM_SHARED_COEFFICIENT_UPPER='1'
```

## 最新基准

| 场景 | 时限 | top1 | gap | limiter | 结论 |
| --- | ---: | ---: | ---: | --- | --- |
| 119 无活动默认 | 9.5s | `1,407,785` | `132,012` | `coefficient` | heavy upper 调用 `0` |
| 119 event 323 默认 | 9.5s | `1,504,051` | `149,630` | `coefficient` | heavy upper 调用 `0` |
| 119 无活动 proof | 30s | `1,407,785` | `86,440` | `context-bound-mccormick` | 当前默认 30s proof |
| 119 event 323 proof | 30s | `1,504,051` | `102,170` | `context-bound-mccormick` | opportunity/team-shared 实验无提升 |
| 1329 HHW + happy event 323 locked | 10s | `9,299,588` | `283,079` | `card-bound-lagrangian` | 不退化 |
| 1889 PasuPare + powerful event 323 locked | 10s | `11,146,635` | `36,707` | `card-bound-skill-aware` | 不退化 |
| 单队 song 686 / 1889 pool | 60s | `3,190,617` | `0` | n/a | exact |

## Witness 结论

最近 capacity witness：

- witness upper：`1,494,224`
- 同一批 witness 卡重新真实 evaluate：`1,367,917`
- cross-slot duplicate card count：`0`

解释：

- 当前 root gap 不是主要来自同一强卡被多个 slot 重复使用。
- 主要虚高来自 team-shared/product relaxation：上界仍允许同一 slot 的 power、skill、context 质量以比真实 5 卡队伍更乐观的方式组合。
- 因此 opportunity-cost card split 暂停；下一步应做更强的 team-shared/product-binding upper。

## 下一步方向

优先级从高到低：

1. 真正的 team-shared/product-binding upper
   - 目标是绑定一个 slot 内 5 张卡共享的 team power、average skill、leader skill 和 context。
   - 不能继续让每张卡各自借用不同的最佳队友解释。
2. reduced-cost 上界
   - 给高价值卡进入高 combo slot 的机会成本定价。
   - 但 witness 已显示简单 anchor card split 收益为 0，需要比 v1 更结构化。
3. locked band/attribute 产品路径
   - UI/API 支持用户手动锁定或系统推荐 `(bandKey, attribute)`。
   - 大卡池优先强 bounded，而不是 exact。
4. 常数级工程优化
   - remaining upper cache key bitset 化。
   - 减少 root/tight upper 中的 Map 和 Array clone。
   - 只在新的强上界出现后再做，避免优化错瓶颈。

## 验证命令

基础回归：

```powershell
npx.cmd tsc --noEmit --pretty false
npm.cmd run lint
node temp\bandori-team-builder\benchmark-team-search.cjs
```

Medley 计分一致性：

```powershell
node temp\bandori-team-builder\verify-medley-scoring-consistency.cjs
$env:HHWX_MEDLEY_EVENT_ID='323'; node temp\bandori-team-builder\verify-medley-scoring-consistency.cjs
node temp\bandori-team-builder\validate-bestdori-hhwx-scoring.cjs
```

Medley 小池：

```powershell
node temp\bandori-team-builder\benchmark-medley-team-search.cjs
$env:HHWX_MEDLEY_BENCHMARK_MS='30000'; node temp\bandori-team-builder\benchmark-medley-team-search.cjs
$env:HHWX_MEDLEY_BENCHMARK_MS='30000'; $env:HHWX_MEDLEY_EVENT_ID='323'; node temp\bandori-team-builder\benchmark-medley-team-search.cjs
```

Medley locked 大池：

```powershell
$env:HHWX_MEDLEY_BENCHMARK_MS='10000'; $env:HHWX_MEDLEY_EVENT_ID='323'; $env:HHWX_MEDLEY_PROFILE_NAME='large-1329-card-pool'; $env:HHWX_MEDLEY_COARSE_MODE='locked'; $env:HHWX_MEDLEY_COARSE_BAND='HelloHappyWorld'; $env:HHWX_MEDLEY_COARSE_ATTRIBUTE='happy'; node temp\bandori-team-builder\benchmark-medley-team-search.cjs

$env:HHWX_MEDLEY_BENCHMARK_MS='10000'; $env:HHWX_MEDLEY_EVENT_ID='323'; $env:HHWX_MEDLEY_PROFILE_NAME='large-1889-card-pool'; $env:HHWX_MEDLEY_COARSE_MODE='locked'; $env:HHWX_MEDLEY_COARSE_BAND='PastelPalettes'; $env:HHWX_MEDLEY_COARSE_ATTRIBUTE='powerful'; node temp\bandori-team-builder\benchmark-medley-team-search.cjs
```

## 文档维护规则

- 本文档只保留当前状态和结论，不追加长篇流水账。
- 新实验只记录：
  - 是否默认启用。
  - 对 119 小池和 locked 大池的关键影响。
  - 为什么继续或停止该方向。
- 可再生成的 benchmark JSON、last-run log 和 validation report 不需要长期保存。
