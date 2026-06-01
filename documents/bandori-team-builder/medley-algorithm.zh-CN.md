# HHWX Bandori 组曲组队算法

本文档说明 HHWX Bandori 组曲组队计算器的优化问题、计分模型、精确搜索契约、证明策略、验证门禁和实现归属。

单曲搜索是独立问题，见 `single-song-algorithm.zh-CN.md`。组曲历史实验和 benchmark 笔记保存在 `medley-algorithm-notes.md` 和带日期的 benchmark 报告中。

本文档是 `medley-algorithm.md` 的中文版本；组曲算法契约变化时应同步更新两份文档。

## 问题定义

给定：

- 玩家持有卡；
- 卡牌等级、训练状态、剧情解锁、Master Rank 和技能等级；
- 区域道具、角色潜能和角色任务加成；
- 正好三首歌曲的谱面和难度；
- 可选活动加成数据；
- 一个准率模型和一个共享区域道具搜索范围；

目标是找到最优合法三队组曲分配。

合法组曲结果必须满足：

- 正好三支队伍；
- 每队正好五张卡；
- 同一队伍内不重复角色；
- 三队之间不重复 `cardId`；
- 三队使用同一套全局区域道具配置；
- 三首歌各分配给一支队伍。

同一角色的不同卡可以出现在不同组曲队伍中。由于每支单队不允许重复角色，一个角色在每个歌曲 slot 中最多出现一次，在整个组曲中最多出现三次。

当前组曲搜索只优化分数。不处理控分路线、协力玩家真实队伍搜索或活动 PT 目标。

## 输入数据

搜索依赖：

- 用户档案：持有卡牌、等级、技能等级、Master Rank、训练状态、剧情解锁、排除标记、区域道具、角色潜能和角色任务加成；
- Master 数据：卡牌、角色、乐团、属性、技能、区域道具、歌曲和谱面；
- 三个歌曲输入，每个输入包含歌曲 master、谱面、难度和缓存 key；
- 可选活动加成数据，通过与单曲搜索相同的共享计分 primitive 合并；
- 请求参数：结果数量、准率、服务器、最大搜索时长和区域道具 coarse filter。

新代码应从以下入口导入组曲搜索：

```ts
import { searchBandoriBestMedleyTeams } from "@/lib/bandori/team-builder/medley";
```

旧兼容 facade 仍保留：

- `@/lib/bandori-medley-team-search`
- `@/lib/bandori-team-search`

## 计分模型

### 共享区域道具

区域道具是全局组曲决策。搜索枚举一套共享配置：

```text
(可选乐团区域道具配置, 可选属性区域道具配置, 可选参数区域道具配置)
```

三队中的每张卡都在同一套配置下评估。这是组曲和三次独立单曲搜索的主要差别：对某一首歌/某一队最优的道具选择，放到三队互斥的全局问题里可能不是最优。

### Slot 构造

组曲会构造三个歌曲 slot。每个 slot 复用单曲计分模型，但使用组曲专用 LIVE 设置：

- `target = "score"`；
- `eventType = "medley"`；
- `liveType = "free"`；
- `useFever = false`；
- `useSpecialRoomBonus = false`；
- `comboOptions.useMedleyCombo = true`。

Combo 按顺序继承：

```text
slot 1 startCombo = 0
slot 2 startCombo = slot 1 note count
slot 3 startCombo = slot 1 note count + slot 2 note count
```

单 note 分数公式与单曲相同：

```text
inner = floor(base * judge * combo * fever)
noteScore = floor(inner * skill)
```

组曲禁用 fever，但仍使用组曲 combo carry-over。组曲总分是三个 slot 分数之和。

### 队伍评价

完整五卡队伍评价委托给共享 core evaluator。组曲代码不能重新实现 note 计分、技能上下文解析、队长枚举或技能窗口分配。

对每个候选队伍，core evaluator 会：

1. 在完整队伍确定后解析同团和同属性技能上下文；
2. 枚举可用队长；
3. 计算平均分、最高分、最低分、代表性技能顺序和展示字段。

### 继承的单曲规则

组曲分数模式继承以下单曲规则，公式本身不变化：

- 卡牌 power 准备，包括等级成长、训练、剧情、Master Rank、角色潜能、角色任务加成，以及会影响分数的活动参数加成；
- 在选定的一套全局区域道具配置下计算 area-item effective power；
- 谱面 note timeline 预处理和单 note 的 floor 顺序；
- 完整五卡队伍确定后再解析同团和同属性技能上下文；
- 队长枚举和技能窗口分配；
- 平均分、最高分、最低分和展示字段 hydration。

组曲只覆盖 slot 的 LIVE 上下文：分数目标、组曲活动类型、free-live 计分、无 fever、无 special-room bonus，以及顺序继承 combo。由于当前组曲目标只支持分数，point-bonus 活动 PT 换算、任务 LIVE support band 选择、控分路线和协力玩家建模都不属于本文档的算法契约范围。

## 区域道具搜索范围

组曲请求接受 `coarseAreaItemFilter`：

- `mode = "all"`：搜索完整区域道具配置空间。这是全配置意义上的 exact proof 模式，在大型真实档案上可能需要数分钟。
- `mode = "locked"`：只搜索指定 band/attribute 和可选 parameter 子空间。exact 结果只证明该 locked 子空间。
- `mode = "auto"`：允许引擎为响应速度选择少量有希望的 coarse group。auto 会缩小请求空间，因此除非返回的 stats 明确证明请求范围，否则必须显示为 bounded。

如果大型卡池没有提供 coarse filter，搜索可能应用 auto coarse 行为，避免把全部预算花在大量区域道具配置上。产品 UI 不能把 auto-coarse 结果标为完整区域道具空间的全局 exact proof。

## 搜索算法

组曲搜索的高层流程：

1. 准备 calculated cards 和共享区域道具配置。
2. 剪掉被支配的区域道具配置。
3. 为当前共享配置构造三个组曲 slot。
4. 通过 slot candidate seeding、greedy orders、reverse song order、固定卡组优化和局部邻域优化生成 incumbent。
5. 用 root upper bounds 跳过乐观分数不可能超过 incumbent 的配置。
6. 对 hard exact-proof scope，在 seeding 前或后运行 exact candidate join。
7. 回退到带 safe remaining-slot upper bounds 的跨 slot DFS。
8. 返回 exact 结果，或返回带 observed upper bound gap 的 bounded 结果。

Seeding 只用于提升 incumbent，本身绝不能作为证明。

### 速度来源

昂贵的操作不是单次 note 分数计算。真正困难的是证明：在所有仍被请求的区域道具配置下，不存在任何互斥三队组合能超过当前 incumbent。

当前加速主要来自：

- 在证明工作前先建立强 incumbent，让上界有可用阈值；
- 在 root 用乐观分数剪掉不可能超过 incumbent 的整套区域道具配置；
- 按分数顺序生成高价值 slot 候选，并证明 unseen candidate frontier，而不是盲目枚举所有合法三队组合；
- 用 bitset 表示跨 slot 卡牌冲突，让 candidate-join 检查保持低成本；
- 只有 exact candidate join 无法关闭配置时，才用 remaining-slot upper bound DFS 继续证明；
- 超时时暴露 bounded gap，而不是把剩余不确定性隐藏成启发式“最佳结果”。

因此当前主要瓶颈是最大未证明的 locked band/attribute/parameter 子空间，而不是找到强组曲队伍本身。

### 候选压缩

组曲 slot 搜索使用与单曲压缩相同的安全原则：只有当保留的替代对象在所有相关 slot 和证明上下文中都支配被删除对象时，才允许删除卡牌或候选。

当前大型卡池 proof path 更多依赖候选生成和上界证明，而不是激进的有损压缩。任何用于 exact path 的压缩都必须说明其 exact-safe 原因。

### 上界和剪枝

所有剪枝决策都必须使用乐观上界。上界可以偏松，但不能低估任何可行完成解。

主要上界族位于 `src/lib/bandori/team-builder/medley/upper/`：

- `capacity-assignment.ts`：remaining-slot upper bounds dispatcher；
- `capacity-core.ts`：共享 capacity DP 与 Pareto/bucketed 状态工具；
- `card-bound.ts`：card-bound、card-specific coefficient 和 Lagrangian 模型；
- `context-bound.ts`：band/attribute context 分组和 context-bound 模型；
- `skill-context.ts`：带技能上下文的 slot branch score upper bounds；
- `witness.ts`：proof gap 的诊断解释。

Witness 和 replay counter 用于解释 gap。除非搜索显式使用对应 upper-bound function，否则它们不参与剪枝。

### Exact Candidate Join

Exact candidate-join path 是当前大型 locked/all scope hard-case 的证明引擎。主实现位于 `experiments/exact-candidate-join.ts`，支持 helper 拆分为：

- `exact-candidate-join-constants.ts`；
- `exact-candidate-join-heap.ts`；
- `exact-candidate-join-bitsets.ts`。

该路径分三阶段：

1. 在当前区域道具配置下，为每个组曲 slot 生成按分数排序的候选。
2. 证明 pair/frontier upper bounds，使未生成候选不可能隐藏更优 triple。
3. 使用卡牌冲突 bitset 和按分数排序的候选列表搜索互斥 triple。

该 solver 一次证明一个区域道具配置。一个 locked band/attribute scope 仍可能需要证明同一 band/attribute 下的多个 parameter 配置。

为了报告 exact，candidate-join path 必须保持以下不变量：

- 每个 slot candidate list 都按当前 slot 和区域道具配置下的精确评价分数排序；
- 已生成候选要么覆盖所有仍可能参与 winning triple 的队伍，要么 slot/pair frontier upper 已证明所有省略候选都低于 incumbent threshold；
- pair/frontier upper bound 必须覆盖最优可兼容完成，即使这个 bound 很松；
- 最终 triple 搜索必须精确检查 card-disjointness，不能用分数或角色 proxy 代替；
- 只有当所有可能超过 incumbent 的 candidate frontier 都被耗尽或安全上界证明后，一个配置才算被证明。

候选生成不够不是正确性失败，而是证明失败。该配置会保持 bounded，必须由 DFS 完成，或通过最终 observed upper-bound gap 报告。

### Bounded DFS

当 exact candidate join 不能证明某个配置时，DFS 会搜索剩余跨 slot 分配空间。DFS 状态包含：

- 已选择的 slot candidates；
- 当前分数；
- banned card IDs；
- 剩余 slot indices。

每个节点会计算 safe remaining upper。如果：

```text
currentScore + remainingUpper < incumbentThreshold
```

该分支可以剪枝。否则分支仍然可行，必须继续搜索；如果时间耗尽，则它会进入 bounded gap 的未证明空间。

## Exact 和 Bounded 结果

组曲响应包含：

- `results`：排序后的组曲结果；
- `stats`：证明和耗时状态。

只有满足以下条件时，结果才是请求搜索范围内的已证明最优：

```text
stats.searchMode === "exact"
stats.isExhaustive === true
stats.timedOut === false
stats.observedScoreUpperBoundGap === 0
```

如果运行超时、应用 auto coarse 缩小范围，或留下任何请求空间未证明，结果都必须视为 bounded。bounded 结果应展示当前最佳分数，并在可用时展示 `observedScoreUpperBoundGap`。

Locked scope 的 exact 不等于完整区域道具空间 exact。它只证明请求的 locked 子空间。

## 正确性论证

### 搜索空间覆盖

对于请求的 `all` 或 `locked` scope，搜索会在 exact-safe 支配剪枝后枚举相关区域道具配置。每个配置都在同一套共享区域道具选择下构造三个组曲 slot。

在一个配置内部，exact candidate join 和 DFS 都会强制满足：

- 每队五张卡；
- 同队不重复角色；
- 跨 slot 不重复卡；
- 共享区域道具配置；
- 每个 slot 使用组曲 combo carry-over。

### 剪枝安全性

只有当乐观上界低于 incumbent threshold 时，才允许剪掉分支或配置。上界代码必须说明为什么该上界不会低估任何可行完成解。

如果一个 bound 只是诊断、启发式或排序用途，它不能贡献 exact proof 状态。

### Exact Candidate Join 安全性

Exact candidate join 安全需要同时满足：

1. 已生成候选覆盖所有仍可能参与更优 triple 的候选，或者 unseen frontier upper 证明被省略候选不可能超过 incumbent；
2. 最终 triple 搜索精确检查卡牌互斥。

如果候选生成中止、deadline 触发，或 unseen upper 仍高于 incumbent threshold，该配置就未被证明；除非另一个证明路径完成它，否则整体运行保持 bounded。

### Exact 结果条件

最终响应只有在所有请求配置都被耗尽或安全剪枝，并且没有 timeout 时才报告 exact。Auto-coarse 缩小了请求搜索空间，因此会阻止 full-scope exact reporting。

## 与基线的差异

三次独立单曲搜索可以作为性能和公式参考，但不是组曲最优性的 oracle。它们不会共同选择一套共享区域道具配置，也不会求解全局跨 slot `cardId` 互斥约束。

Strict 3x greedy baseline 也只是参考材料。贪心分配可以快速找到强 incumbent，但不能证明在共享道具和卡牌冲突共同作用下，某个局部看起来较弱的 slot 队伍不会带来更好的全局三队组合。

保存的 Bestdori-compatible 材料仍然适合做公式兼容和历史比较。它不能为 HHWX 组曲搜索提供 exact proof，因为组曲问题包含共享道具耦合、顺序 combo carry-over 和全局 card-disjoint 队伍分配。

HHWX 组曲的差异是：

- 枚举或安全剪掉每个被请求的区域道具配置；
- 用共享 core score evaluator 评价每个完整 slot 队伍；
- 精确证明跨 slot 卡牌互斥；
- 只有所有请求配置都被耗尽或安全上界证明低于 incumbent 时，才返回 `exact`；
- 证明不完整时返回 `bounded`，并携带 observed upper-bound gap。

## 性能设计

当前性能设计主要面向 1000+ 持有卡的大型真实档案：

- 尽早找到强 incumbent；
- 尽可能在 root 跳过区域道具配置；
- 对 hard large locked/all scope 使用 exact candidate join；
- 只有在收益足够时才启用可选 heavy upper-bound families；
- 暴露 proof gap，而不是隐藏 bounded 不确定性。

当前 120s 里程碑是有意保守的：

- 固定 10-profile all-mode 样本必须在每个 profile 300s 内证明 exact；
- 已知 single locked / single configuration hard cases 必须在 120s 内证明 exact；
- 已知 locked band/attribute hard cases 必须在 120s 内证明 exact。

60s 还不是所有 tracked hard cases 的稳定保证。

## 实现归属

组曲实现文件：

- `search.ts`：公开 orchestration、配置排序、exact/bounded finalization；
- `slots.ts`：组曲 slot 构造、combo carry-over、slot candidate helper；
- `candidates.ts`：候选评价、分数排序、候选缓存行为；
- `configurations.ts`：共享区域道具配置排序和 coarse filters；
- `results.ts`：组曲结果组装和排序；
- `profiling.ts`：诊断 counter 初始化；
- `upper/`：safe proof upper-bound models 和 witnesses；
- `experiments/exact-candidate-join.ts`：exact candidate-join proof path；
- `experiments/conflict-bnb.ts`：替代 exact subsolver 实验。

依赖方向必须保持：

```text
medley -> core
single -> core
core -> no single / medley imports
```

新的组曲代码应从 `core` 导入共享计分和队伍评价能力，不应从 `single` 导入。

## 验证门禁

### 可移植项目检查

结构或类型契约变更后运行：

```powershell
npx.cmd tsc --noEmit --pretty false
node --check scripts\bandori-medley-hard-case-benchmark.cjs
git diff --check
```

Windows 下 `git diff --check` 可能输出 LF/CRLF warning；这些不是 whitespace error。

### Hard-Case Benchmark Gate

运行当前固定 120s gate：

```powershell
node .\scripts\bandori-medley-hard-case-benchmark.cjs gate-120
```

重要的较短 spot check：

```powershell
node .\scripts\bandori-medley-hard-case-benchmark.cjs p05-visual
node .\scripts\bandori-medley-hard-case-benchmark.cjs p01-locked
```

最新详细证据记录在 `medley-real-profile-benchmark-2026-05-31.md`。

通过该 gate 表示：

- tracked all-mode 样本在 wrapper 的 300s/profile 限制内证明 exact；
- tracked locked/single hard cases 在 120s 内证明 exact；
- wrapper 期望 exact 的场景没有 timeout，也没有正的 observed upper-bound gap。

这不表示任意真实档案都已经保证 60s 内完成。

### 前端契约检查

前端接入前，应对照 `medley-frontend-contract.md` 检查 UI 假设。产品 UI 只应依赖稳定请求和响应字段：

- `BandoriMedleyTeamSearchInput`；
- `BandoriMedleyAreaItemCoarseFilter`；
- `BandoriMedleyTeamSearchResponse`；
- `stats.searchMode`、`stats.isExhaustive`、`stats.timedOut`、`stats.observedScoreUpperBoundGap` 和 `stats.elapsedMs`。

不要围绕单个 profiling counter 或 `configurationTrace` 构建产品行为。

UI 发布前至少运行：

```powershell
node .\scripts\bandori-medley-hard-case-benchmark.cjs p05-visual
node .\scripts\bandori-medley-hard-case-benchmark.cjs p01-locked
```

并手动确认 UI 暴露运行状态、已用时间、取消能力、exact/bounded 状态、locked scope 文案和 bounded gap 展示。

## 剩余风险和后续工作

- 固定 hard-case 样本集已经满足 120s gate，但 60s 尚未保证。
- Hard real profile 的 full all-mode proof 可能接近三分钟，因此前端接入需要取消能力和清晰状态显示。
- 最大的剩余证明机会是 locked band/attribute scope 内的跨 parameter 证明共享，或更紧的 post-incumbent upper，用于在不完整运行 exact candidate join 的情况下证明非 winning parameter 配置。
- `medley-algorithm-notes.md` 仍包含历史实验，应视为维护上下文，而不是 canonical contract。
