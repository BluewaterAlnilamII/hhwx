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

在大型 all-scope 运行中，如果 exact join 已经留下安全的 observed upper bound，调用方可以有意跳过 DFS。这个策略只是运行时间控制，不是证明捷径：该配置仍然是未关闭配置，会贡献最终 bounded gap，并且除非其上界之后低于 incumbent，否则整体结果不能报告 exact。

All-scope exact-join pre-skip 必须保持显式 opt-in。不能因为档案持卡很多，或因为配置是 `Everyone`，就在默认路径中启用它。2026-06-04 的回归审计显示，默认启用 pre-skip 会让 `P02` 和 `P07` 在本应进入 exact join 并恢复 exact 的配置上快速返回 bounded；这些 case 在 2026-06-02 矩阵中已经证明过 exact。恢复操作是：默认保持 `enableAllScopeExactJoinPreSkip` 为 false，只有明确的 benchmark experiment 才能打开；在跑完整 40-case 矩阵前，先用 `p02-p07-default-300` 验证默认路径。

2026-06-04 的 solve 恢复保持 exact 语义不变，但降低第三候选查询成本。常规 third shortlist 仍有固定上限；只有 shortlist miss 后才为该查询懒构建 extended shortlist。Extended cache 和单次 solve 查询数都有上限，避免优化变成无界内存或时间消耗。如果两个 shortlist 都 miss 且候选列表不是 exhaustive，solver 仍回退到既有 bitset word scan。这个路径只加速寻找兼容候选；只有既有 exhaustive/frontier 检查才允许证明不存在更优候选。

### 候选和内存软上限

候选数量和工作量软上限是证明预算控制，不是正确性捷径。如果上限触发时某个配置尚未关闭，该配置仍然未被证明；除非另一条证明路径关闭它，否则最终响应必须保持 bounded。

默认 exact candidate-join 候选软上限是 `20000`，对小型搜索保持保守。对于至少 60s 预算且 calculated cards 达到 900+ 的 locked/all scope，solver 会自动把候选软上限提高到 `400000`。前端预览不应默认压低这个上限；过低的前端覆盖会导致过早 bounded，诊断到的是覆盖参数本身，而不是真实证明前沿。

Hard all-scope proof 可以对当前配置使用一次 guarded candidate extension：只有 abort reason 是 `candidate-fill-soft-limit`、剩余预算充足、memory guard 未触发、且卡牌数仍在配置的大型档案范围内时，才把候选上限从 `400000` 提高到 `600000`。这不是全局默认提高。如果扩展后仍不能关闭配置，结果继续保持 bounded，并在 trace 中记录 extension limit、remaining budget 和 observed memory。

另有一个更严格的 staged extension 路径，用于 frontier-tight single-slot case。它只有在当前 slot 已达到 `600000`、另外两个 slot 较窄、peek 和 cutoff 的差距很小、且剩余预算至少 `270000ms` 时，才允许把当前配置提高到 `800000`。2026-06-04 的 `P10:244` 试跑说明该路径必须保持保守：扩展第一个 `HelloHappyWorld/happy` sibling 可以关闭该配置，但会暴露另一个接近的 sibling，导致耗时和 working set 上升，而全局 bounded gap 几乎没有下降。

Staged extension 现在只作为诊断/实验路径保留。默认 `focus-6-300` 和完整矩阵不会触发它；只有显式设置 `enableExperimentalStagedCandidateExtension === true` 时才启用。benchmark harness 保留 `p10-244-staged-trace-300` 用于复现实验；默认路径只使用 guarded `400000` 到 `600000` 扩展。

Small-gap solve retry 也是局部策略。它只在 `solve-workload-limit`、upper gap `<= 100000`、calculated cards `<= 1300`、剩余预算充足、memory guard 未触发，且同 `(band, attribute)` 没有仍高于 incumbent 的未闭合 sibling 时，把 smallest solve candidate cap 从 `100000` 局部放宽到 `200000`；每个配置 timebox `35000ms`，每次运行最多重试 3 个配置。默认 exact solve cap 不变。加入 same-coarse guard 是因为 `P04:260` 证明一个 `Everyone/happy` parameter 会消耗足够多预算，导致另一个 parameter 以更松的 near-deadline upper 接管最终 bounded gap。

Small-gap DFS fallback 是当前 hard all-scope 小 gap 闭合的默认路径。对于 calculated cards 不超过 `1600` 的 all-scope high-card exact join，solver 会启用局部上界 helper：`enableAnchorSlotUpper`、`enableOpportunityCostUpper` 和 `enableTeamSharedCoefficientUpper`。如果 exact candidate join 留下有限 upper gap `<= 100000`，且剩余预算至少 `45000ms`，同 coarse group 的前两个 sibling 配置可以在 unproved join 后继续进入 DFS，而不是停在 `exact-unproved-skip-dfs`。当同一个 `(band, attribute)` group 已经有两个 sibling 通过“unproved exact join 后的 DFS”证明，最后一个 trailing sibling 可以在剩余预算至少 `30000ms` 时跳过 exact candidate join，直接进入 DFS。该策略仍保持 exact-safe：必须由 DFS 实际证明配置，否则结果继续 bounded 或 timeout。Trace 会记录 `smallGapDfsFallbackAfterUnprovedExactJoin`、`smallGapDfsFallbackObservedUpperGap`、`smallGapDfsFallbackRemainingMs`、`trailingSameCoarseDfsOnly`、`sameCoarseClosedSiblingCount` 和 `sameCoarseDfsAfterUnprovedProofCount`。

Candidate-fill bounded 的 same-coarse group 会使用保守的 root-tightening skip，而不是在第一个 sibling 已经未闭合、当前 run 已经 bounded 后继续把预算花在同组 sibling exact join 上。对于 calculated cards 不超过 `1300` 的档案，candidate-fill abort 后可以触发 post-exact root upper 检查；同 `(band, attribute)` 的后续 sibling 会复用同一类 root-level capacity proof，并记录为 `bounded-same-coarse-tight-root-skip`。更大的档案中，只要同 coarse sibling 已经有 remembered unclosed upper，现有 memory-root skip 也可以触发，不再依赖进程内存采样恰好越过脆弱阈值。这些路径只会降低 remembered upper 或保持 bounded，不会把未证明配置转成 exact。

`optimization.memorySoftLimitMiB` 是 best-effort 运行时保护。在浏览器 worker 中，solver 每 50ms 采样一次 `performance.memory.usedJSHeapSize`，并使用“配置 MiB 上限”和“浏览器报告 JS heap 上限的 65%”两者中的较低值。保护触发时，响应会设置 `memoryLimited = true`，把运行标记为非 exhaustive，并返回 bounded，而不是声称已完成证明。

浏览器内存 API 并不完整。JS heap 计数可能低于 Chrome 任务管理器中看到的标签页或 dedicated worker working set。因此该保护可以降低 OOM 风险，但不能视为严格的进程内存硬上限。

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

当前大型 all-scope 路径可以在没有 timeout 的情况下返回 bounded。触发原因是它已经记录了未证明配置的上界，并跳过了无法在本轮运行中恢复 exact 状态的额外工作。常见 trace status 是：

- `exact-unproved-skip-dfs`：exact candidate join 中止或未证明；高持卡 all-scope 路径保留 observed exact-join upper，而不是进入 DFS fallback；
- `bounded-dominated-root-skip`：此前已有未关闭配置的上界不低于当前 root upper；证明当前配置也无法关闭全局 bounded gap；
- `bounded-same-coarse-memory-root-skip`：高持卡 all-scope 运行中，同一 `(band, attribute)` 下已有 unresolved sibling 的 root upper 支配当前 sibling，且采样内存接近软上限；solver 会为当前 sibling 记录 tight root upper，并保持 bounded，而不是继续消耗内存启动另一个 exact join；
- `bounded-near-deadline-root-skip`：同一 coarse group 的证明耗时预测显示新的 exact join 很可能耗尽剩余预算，因此记录 root upper，并让响应保持 bounded 而不是 timeout。

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

前端预览包含一个临时的 `legacy-greedy-single` 对照模式。它仍会枚举共享区域道具配置，但会先按低成本静态潜力排序，让较强贪心 incumbent 更早出现；只有当安全上界无法超过当前贪心结果时才跳过配置。跳过条件包括每个 slot root upper 总和，以及固定 `3/2/1` strict greedy seed 过程中考虑已禁用卡牌后的剩余 slot upper。该 seed 会先为第 3 个 slot 找当前剩余卡池下的最优队伍，排除这些 card ID 后再依次处理第 2 个和第 1 个 slot。它强制跨 slot 卡牌互斥和组曲 combo carry-over。它只适合作为用户可见的对照，不是证明路径，不报告 bounded/exact 状态，并且应保持可在不修改公开组曲搜索 API 的情况下干净删除。

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

当前证据分两层：

- tracked wrapper gate 仍要求固定 none-event all-mode 样本在 300s/profile 内 exact，并要求已知 locked/single hard cases 在 120s 内 exact；
- 更宽的 2026-06-02 event matrix 覆盖 10 个真实档案和 `none`、`323`、`244`、`260` 四个场景，300s 限制下没有 timeout，`36/40` 个 all-scope case 证明 exact；all-scope elapsed median 为 `51919ms`，P95 为 `231981ms`，max 为 `295714ms`。

这个更宽矩阵说明多数抽样场景已经能在合理的 300s 预算内完成，但它不是任意 event/profile 组合都能 exact 的保证。剩余 4 个 bounded case 保留为 bounded，是因为未关闭配置的上界仍足够接近 incumbent，需要更多证明工作才能消除。

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
node .\scripts\bandori-medley-hard-case-benchmark.cjs focus-6-300
node .\scripts\bandori-medley-hard-case-benchmark.cjs p02-p07-default-300
node .\scripts\bandori-medley-hard-case-benchmark.cjs p05-visual
node .\scripts\bandori-medley-hard-case-benchmark.cjs p01-locked
```

`focus-6-300` 是当前 all-scope 优化工作优先使用的全矩阵前检查。它运行 6 个保留重点 case：`P02:260`、`P04:260`、`P08:323`、`P10:244`、`P04:244`、`P08:260`，记录 exact-join 诊断，并以 MiB 采样进程 peak working set。只有该 focus set 可接受后，才应运行完整 40-case `all-40-focus-300` 矩阵。

`p02-p07-default-300` 是 all-scope exact-join pre-skip 恢复后的回归保护场景。它必须使用默认 optimizer 路径，不传 optimization JSON 覆盖。期望形态是：`P02:none`、`P02:244`、`P02:323` 和 `P07` 的四个 event case 均为 exact；`P02:260` 可以继续 bounded，这与 2026-06-02 基线类别一致。如果这些 case 变成 exact-join 调用数为 0 的快速 bounded，应先检查是否重新默认开启了 pre-skip 或新的未闭合配置 shortcut，再考虑跑完整矩阵。

最新详细证据记录在 `medley-real-profile-benchmark-2026-05-31.md`。

2026-06-02 event matrix 仍作为基线比较：`temp/bandori-team-builder/real-profile-medley-scope-matrix-2026-06-02T04-06-27-272Z.json`。300s 限制下它证明 `36/40` 个 all-scope case exact，且没有 timeout。

最新的恢复后 40-case 证据是 `temp/bandori-team-builder/focus-medley-cases-2026-06-04T23-49-44-396Z.json`。该轮证明 `38/40` exact，没有 failed 或 timeout；bounded gap 总量从 `1534986` 降到 `798416`；P95 为 `213990ms`，max 为 `292425ms`，采样到的 peak working set 为 `3935.8 MiB`。剩余 bounded row 是 `P02:260` 和 `P10:244`；进程 working set 是诊断采样，不是引擎内部硬内存上限。

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
当前预览可以把诊断 counter 和 configuration trace 放入调试报告，方便维护者定位问题，但这些字段不应成为稳定 UI 契约。

UI 发布前至少运行：

```powershell
node .\scripts\bandori-medley-hard-case-benchmark.cjs focus-6-300
node .\scripts\bandori-medley-hard-case-benchmark.cjs p05-visual
node .\scripts\bandori-medley-hard-case-benchmark.cjs p01-locked
```

并手动确认 UI 暴露运行状态、已用时间、取消能力、证明状态、提前结束原因、内存/调试信息和 bounded gap 展示，同时不要把原始 `exact` / `bounded` 字符串作为用户可见标签。

## 剩余风险和后续工作

- 固定 hard-case 样本集已经满足 120s gate，但 60s 尚未保证。
- Hard real profile 的 full all-mode proof 可能接近 300s review budget，因此前端接入需要取消能力和清晰状态显示。
- 部分 all-scope event/profile 组合在 300s 预算内仍会返回 bounded，原因是多个配置上界仍接近 incumbent。
- 截至 2026-06-04T23-49 完整矩阵，剩余 bounded row 是 `P02:260` 和 `P10:244`；`P04:260` 已在默认路径证明 exact。
  - `P02:260`：same-coarse memory-root skip 继续降低内存压力。最新完整矩阵中它仍是 candidate-fill bounded，gap `382812`，slot `0`，soft limit `400000`，candidate counts `[400000, 212825, 134977]`，elapsed `48618ms`，peak working set 约 `3100.0 MiB`。
  - `P10:244`：即使 guarded extension 到 `600000`，仍是 candidate-fill soft-limit bounded。最新完整矩阵 gap 为 `415604`，slot `0`，candidate counts `[600000, 46599, 29117]`，elapsed `45469ms`，peak working set 约 `3100.1 MiB`。same-coarse root tightening 降低了该 row 的 gap，但还没有把它推进到 exact。
- `P04:260` 已通过 small-gap DFS fallback 闭合，但仍接近 300s review budget：最新完整矩阵用 `292425ms` 证明 exact，且是矩阵 peak working-set 行，约 `3935.8 MiB`。仍应保留在 `focus-6-300` 中，避免 same-coarse fallback 静默回退。
- `P08:260`、`P08:323` 和 `P10:260` 在固定矩阵中已不再是当前回退点。仍应保留在 `focus-6-300` 中，避免 third-shortlist 和 guarded-fill 相关修改静默回退。
- 最大的剩余证明机会是为 `P02:260` 提供更紧的 pair/frontier upper closure，并为 `P10:244` 设计更有选择性的同 coarse sibling 策略。
- `medley-algorithm-notes.md` 仍包含历史实验，应视为维护上下文，而不是 canonical contract。
