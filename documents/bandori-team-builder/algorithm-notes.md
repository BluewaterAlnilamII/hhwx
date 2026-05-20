# Bandori 单曲组队搜索算法说明

本文档说明 HHWX 当前单曲组队计算器的核心算法、分数公式、活动 PT 处理、任务活动支援队伍、正确性证明和验证边界。实现入口主要在 `src/lib/bandori-team-search.ts`，卡牌基础综合力和技能解析复用 `src/lib/bandori-team-calculator.ts`。

## 目标范围

当前单曲搜索支持三类目标：

- `score`：最大化单曲得分。若活动类型的参数加成直接作用在卡牌综合力上，则活动 PT 最大化与出分最大化等价，也走这一目标。
- `eventPoint`：最大化普通活动 PT。目标值由歌曲分数、房间分数、主队 PT 加成共同决定。
- `mission_live + eventPoint`：最大化任务活动 PT。它在普通 PT 目标外追加支援队伍分。

当前不处理停车路线、控分、协力玩家真实队伍搜索、组曲三队联动和 Festival 支援队伍。`perfectRate < 1` 时只模拟 PERFECT/GREAT，非 PERFECT 统一按 GREAT，不模拟 GOOD/BAD/MISS 打断。

## 输入数据

搜索依赖以下数据：

- 用户档案：持有卡牌、等级、技能等级、Master Rank、训练状态、剧情解锁、排除标记、区域道具、角色潜能、角色任务加成。
- Master 数据：卡牌、角色、乐团、属性、技能、区域道具、歌曲、谱面。
- 活动加成：优先使用数据库 `bandori_event_bonuses`，也支持手动 `bonusOverride` 合并到同一加成模型。
- 请求参数：歌曲、难度、活动、LIVE 类型、目标、准率、房间综合力、协力外部技能、Live Boost/CP 的默认显示档位。

## 卡牌综合力

每张候选卡先计算静态状态：

- 按稀有度成长曲线计算当前等级三维基础值，非满级不使用线性插值。
- 叠加训练、剧情、Master Rank、角色潜能和角色任务加成。
- 过滤 `isExcluded` 卡。
- 最终队伍禁止重复角色。

区域道具不是逐项独立取最大值，而是枚举全局配置：

```text
(optional bandSet, optional attributeSet, optional parameterSet)
```

每个配置层都可以为空，表示本次全局配置不选择该类区域道具。实现上，若玩家拥有 band 或 attribute 道具，空 band/attribute 配置通常会被非负加成配置支配，因此不需要显式保留；parameter 层会先显式枚举空配置，再交给支配剪枝处理。同一支队伍必须在同一个区域道具配置下计算有效综合力。活动参数加成若作用于综合力，也叠加到每张卡的有效综合力上。

## 谱面预处理与分数公式

谱面会先转换成 note timeline：

- 解析 Single、Directional、Long、Slide 中实际计分的 note。
- 计算每个 note 的时间、combo 倍率、fever 倍率。
- 根据技能 note 和技能持续时间生成 6 个技能窗口。
- 游戏设计保证 6 个技能窗口不重叠，因此窗口贡献可以加和。

单 note 公式为：

```text
inner = floor(base * judge * combo * fever)
noteScore = floor(inner * skill)
```

整首歌得分为所有 `noteScore` 之和。协力 LIVE 的 `roomScore` 使用未取整的自己平均分参与房间总分计算，最后整体向下取整：

```text
roomScore = floor(rawAverageScore + otherTeamScore)
```

这点很重要；如果先把自己的 `averageScore` 取整再加房间分，部分队伍会稳定差 1 分。

## 技能解析

技能必须在完整五卡队伍确定后解析，不能只按 `skillId + skillLevel` 缓存。技能缓存 key 至少包含：

- `skillId`
- `skillLevel`
- `server`
- `sameBandId`
- `sameAttribute`

当前支持：

- 普通分数提升；
- 同团、同属性条件提升；
- 仅 PERFECT 生效；
- GREAT 以下减半；
- GREAT 以下打断；
- 每次 PERFECT 递增倍率。

在当前 PERFECT/GREAT-only 准率模型下：

- GREAT 以下打断不会发生；
- GREAT 以下减半只影响 GOOD/BAD/MISS，因此当前模型下等价忽略；
- 仅 PERFECT 生效仍会区分 PERFECT 和 GREAT；
- 常量倍率技能会走快速路径，递增倍率技能按 note 内部状态计算。

## 完整队伍评分

完整五卡队伍评分流程：

1. 根据五张卡重新判断同团、同属性上下文。
2. 解析每张卡的真实技能。
3. 枚举 5 个队长选择。
4. 单人 LIVE 第 6 次技能按队长技能处理。
5. 协力 LIVE 的 4 个外部玩家技能由请求固定，候选队伍相关的主要是当前队长技能；再按选择的 encore 来源处理第 6 次技能。
6. 计算平均分、最高分、最低分、最高分技能顺序和方案数。

需要输出最高/最低分时，协力 LIVE 仍会把队长技能与 4 个外部技能组成 5 个触发技能。因为技能窗口不重叠，5 个触发技能与 5 个触发窗口的最大/最小贡献可以用 bitmask DP 精确求解，而不必枚举 120 个排列。输出仍保留代表顺序和最高分方案数。

## 活动 PT

活动分两类：

- 参数活动：活动加成进入卡牌综合力，影响歌曲出分。队伍排序等价于出分最大化。
- PT 加成活动：先得到歌曲分数或房间分数，再计算基础 PT 和主队 PT 加成。

普通 PT 的核心顺序为：

```text
basePt = basePtFormula(score, roomScore)
eventPointBase = floor(basePt * (1 + mainPointBonusRate))
eventPoint = floor(eventPointBase * liveBoostMultiplier)
```

挑战 LIVE、竞演 LIVE、Team Festival 的 Live Boost、CP、排名、胜负只影响结果展示，不改变队伍优劣。结果中会返回 `eventPointOptions`，前端切换显示值时不重新搜索。

## 任务活动支援队伍

仅 `mission_live + eventPoint` 启用支援队伍。规则：

- 支援候选来自用户持有且未排除的卡。
- 支援卡不能与主队使用同一张卡。
- 支援队伍内部不能重复角色。
- 允许主队同角色的其他卡进入支援。
- 支援综合力按卡牌自身综合力加任务活动加成计算，不吃区域道具。
- 支援只影响 PT，不影响主队歌曲分数、主队综合力、技能上下文或区域道具。

完整主队确定后，按支援综合力降序贪心取前 5 张合法支援卡。该贪心是最优的，因为支援目标只是 5 张不同角色卡的综合力求和，且主队只排除同 cardId，不引入额外耦合。

任务活动 PT 顺序为：

```text
eventPoint =
  floor(basePt(score, roomScore) * (1 + mainPointBonusRate))
  + floor(supportBandPower / 3000)
```

## Exact 搜索框架

每个区域配置独立进入搜索：

1. 预计算该配置下每张卡的有效综合力。
2. 删除被全局支配的区域配置。
3. 对候选卡做安全压缩。
4. 用高潜力 seed 队伍先提高 top-N 阈值。
5. 对 5 张不同角色卡做 branch-and-bound。
6. 每个完整五卡队伍重新解析真实技能上下文并精确评分。
7. 结果按目标值降序排序，同分时用综合力、队长技能强度、卡牌 ID 稳定排序。

搜索状态增量维护：

- 已选卡；
- 已用角色 bitset；
- 当前综合力；
- 当前 PT 加成；
- 当前支援机会成本；
- 上下文状态；
- 当前可证明上界。

不会使用会丢最优解的固定 Top-K 裁剪。

## 安全压缩

候选压缩只删除可证明不可能成为最优的卡。基础规则：

- 同一角色；
- 同一技能签名；
- 同 band；
- 同 attribute；
- 同一区域配置下有效综合力不低于另一张卡。

普通 PT 目标还要求 `pointBonusRate` 不低于被删除卡。任务活动 PT 目标还要求 `supportPower <= 被删除卡.supportPower`，这样把支配卡放进主队时不会比被支配卡更伤害支援队伍可用性。

## 上界与剪枝

剪枝只使用不会低估的上界。当前上界包括：

- 剩余角色最大可能综合力；
- 剩余角色技能贡献上界；
- 剩余角色 PT 加成上界；
- 区分 `both`、`same-band`、`same-attribute`、`mixed` 的上下文上界；
- 区域配置 root bound；
- 任务活动的全局支援 PT 上界；
- 完整叶子评分前的最终乐观目标值。

只有当上界低于当前第 `resultLimit` 名结果时才剪枝。

## 正确性证明

### 1. 搜索空间覆盖

所有合法解由三部分组成：

```text
areaConfig + 5 张不同角色主队卡 + 队长选择 + 技能触发顺序 + 支援队伍
```

算法枚举所有区域配置，并在每个配置下通过 DFS 枚举所有不同角色五卡组合。完整五卡评分时枚举所有队长，并用精确 DP 求出技能窗口分配的最优结果。任务活动支援队伍在主队确定后按支援规则求精确最优支援。因此未被剪枝的完整解评分等于该解的真实目标值。

### 2. 压缩安全

若卡 A 支配卡 B，则二者同角色，不能同队出现。对任何包含 B 的合法队伍，将 B 替换为 A 后：

- 队伍角色集合不变；
- 技能签名和上下文相关身份不变；
- 综合力不降低；
- PT 加成不降低；
- 任务支援模式下，A 进入主队造成的支援机会成本不高于 B。

因此替换后的目标值不低于原队伍。删除 B 不会删除唯一最优解。

### 3. 剪枝安全

分支上界由当前部分队伍真实值加剩余位置的逐角色最大可能贡献构成，并对技能、PT 和支援使用乐观高估。它可能高于真实可达值，但不会低于真实可达值。若该上界仍低于当前 top-N 阈值，则该分支下没有任何完整队伍可以进入结果集，剪枝安全。

### 4. 支援贪心最优

主队固定后，支援问题变为：在排除主队 cardId 后，从候选卡中选择最多 5 张不同角色卡，最大化 `supportPower` 总和。对每个角色只需要该角色最高 `supportPower` 的可用卡，再取全局前 5 个角色。按单卡降序扫描并跳过重复角色等价于这个选择，因此最优。

### 5. 结果 exact 判定

只有 DFS 完整结束且所有剪枝均由安全上界证明时，返回 `searchMode = "exact"`。若时间预算中断，则返回 `bounded`，不能标称最优。

## 验证命令

```powershell
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
node temp\bandori-team-builder\validate-bestdori-hhwx-scoring.cjs
```

Supabase 实际卡池主矩阵：

```powershell
$env:HHWX_VALIDATE_INCLUDE_SUPABASE='1'
$env:HHWX_VALIDATE_SUPABASE_PROFILE_LIMIT='12'
node temp\bandori-team-builder\validate-bestdori-hhwx-scoring.cjs
```
