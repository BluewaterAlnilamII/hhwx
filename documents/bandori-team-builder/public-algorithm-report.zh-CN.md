# HHWX Bandori 单曲组队算法

本文从四个角度说明 HHWX Bandori 单曲组队计算器：

1. 综合力、分数、活动 PT 和支援队伍使用的游戏模型；
2. exact 搜索策略；
3. 让 exact 搜索能在大卡池上实际运行的性能设计；
4. 正确性论证和验证结果。

## 问题定义

给定：

- 玩家持有卡；
- 卡牌等级、训练状态、剧情解锁、Master Rank 和技能等级；
- 区域道具、角色潜能和角色任务加成；
- 歌曲谱面和难度；
- 活动加成条件；
- LIVE 类型和优化目标；

目标是找到最优合法队伍。

一个合法主队必须满足：

- 正好五张卡；
- 不重复角色；
- 不包含被排除卡；
- 整个队伍使用同一套全局区域道具配置。

当前单曲搜索支持三类目标：

- `score`：最大化歌曲分数。
- `eventPoint`：最大化活动 PT。
- `mission_live + eventPoint`：最大化任务 LIVE 活动 PT，包含支援队伍。

## 分数和活动模型

### 卡牌综合力

搜索前，每张候选卡会先转换为静态卡牌状态：

1. 按稀有度成长曲线计算当前等级三维基础值。
2. 加上训练、剧情和 Master Rank 加成。
3. 加上角色潜能和角色任务加成。
4. 当活动类型会影响歌曲分数时，加上活动参数加成。
5. 在每一种全局区域道具配置下计算有效综合力。

区域道具不是按每个道具组独立取最大值。算法枚举一套全局配置：

```text
(optional band item configuration, optional attribute item configuration, optional parameter item configuration)
```

每一层配置都可以为空，表示该全局配置不从这一类区域道具中选择道具。实现上，如果玩家拥有可用的 band 或 attribute 道具，空 band/attribute 配置通常会被非负加成配置支配，因此不会显式保留；parameter 层会先显式枚举一个空选项，再交给同一套支配剪枝处理。候选队伍中的每张卡都会在同一套配置下评估。

### 谱面和单 note 分数

谱面会预处理成可复用的 note timeline：

- 统计所有计分 note；
- 计算 note 时间、combo 倍率和 fever 倍率；
- 根据技能 note 和技能持续时间计算六个技能窗口。

单 note 分数公式为：

```text
inner = floor(base * judge * combo * fever)
noteScore = floor(inner * skill)
```

歌曲总分是所有 `noteScore` 的和。

协力 LIVE 中，房间分使用未取整的自身平均分，并且只在加上其他玩家分数后统一向下取整：

```text
roomScore = floor(rawAverageScore + otherTeamScore)
```

这避免了过早对自身平均分取整导致的稳定 1 分误差。

## 技能解析

技能必须在完整五卡队伍确定后解析，因为有些技能依赖队伍上下文，例如：

- 全队属于同一乐队；
- 全队具有同一属性；
- 只在 PERFECT note 上加分；
- 每次 PERFECT 后递增分数倍率。

因此，技能缓存 key 不能只有 `skillId + skillLevel`。HHWX 至少包含：

```text
skillId, skillLevel, server, sameBandId, sameAttribute
```

当 `perfectRate < 1` 时，当前模型把所有非 PERFECT note 视为 GREAT。GOOD、BAD 和 MISS 不会被模拟。因此，在当前模型下，“直到 GREAT 或以下为止”的中断效果不会触发，而 “PERFECT only” 效果仍然会区分 PERFECT 和 GREAT。

## 活动 PT 模型

活动大体分为两类。

### 参数加成活动

有些活动会把加成直接加到卡牌综合力上。在这种情况下，活动 PT 最大化等价于分数最大化，因为活动加成影响的是产生分数的综合力。

### PT 加成活动

另一些活动会先计算歌曲分数或房间分，再计算基础 PT 和主队加成：

```text
eventPointBase = floor(basePt(score, roomScore) * (1 + mainPointBonusRate))
```

`basePt(score, roomScore)` 是对不同活动类型公式的抽象。具体公式由实现根据活动类型和活动数据选择。本文保持抽象，是因为组队搜索算法只需要分数、房间分与基础 PT 之间的单调关系。

Live Boost、挑战 CP、名次、胜负等展示参数不会改变队伍排序。它们可以在结果视图中切换，而不需要重新搜索。

### 任务 LIVE 支援队伍

对于 `mission_live + eventPoint`，支援队伍会在主队 PT 加成后追加：

```text
eventPoint =
  floor(basePt(score, roomScore) * (1 + mainPointBonusRate))
  + floor(supportBandPower / 3000)
```

支援队伍规则：

- 支援卡不能复用主队中完全相同的 cardId；
- 支援队伍内部不能重复角色；
- 允许使用与主队同角色的另一张卡；
- 支援综合力不吃区域道具加成；
- 支援只影响活动 PT，不改变歌曲分数、主队综合力或技能上下文。

主队固定后，支援队伍可以用贪心精确求解：按支援综合力降序扫描卡牌，跳过主队 cardId 和支援队伍内重复角色，取前五张合法卡。

## 搜索算法

HHWX 使用 exact branch-and-bound 搜索，而不是固定 Top-K 启发式裁剪。

高层流程：

1. 枚举全局区域道具配置。
2. 为每个配置预计算卡牌有效综合力。
3. 删除被支配的区域道具配置。
4. 应用安全候选压缩。
5. 先评估高潜力 seed 队伍，以尽早提高 top-N 阈值。
6. 递归枚举五张不同角色的卡。
7. 对所有通过上界检查的完整队伍解析真实技能上下文并精确评分。
8. 按目标值排序返回结果。

DFS 状态会增量维护：

- 已选卡；
- 已用角色 bitset；
- 当前综合力；
- 当前活动 PT 加成；
- 当前支援机会成本；
- 当前已证明上界。

只有当一个分支的上界已经低于当前 top-N 阈值时，才会剪掉该分支。

## 性能设计

主要提速点不是把分数公式本身算得更快，而是在需要昂贵完整队伍评分前，把搜索树变得小得多。

简化来说，HHWX 会尽早、尽量低成本地回答这个问题：

```text
即使按最乐观方式补完整个分支，
它还有机会进入当前 top-N 结果吗？
```

如果答案是否定的，就直接丢弃该分支，不再解析最终技能、支援队伍、详细分数区间或结果展示字段。

### 早期剪枝层级

HHWX 会在多个深度应用剪枝和缩减：

1. 区域道具配置层；
2. DFS 前的候选卡压缩；
3. 同团、同属性、both、mixed 的搜索范围层；
4. DFS 半成品队伍分支；
5. 构造详细结果前的完整队伍候选；
6. 真实支援队伍选择前的任务 LIVE 队伍。

这很重要，因为主要成本不是单次算术运算。昂贵路径包括完整队伍上下文解析、队长枚举、技能窗口评分、活动 PT 计算、支援队选择和详细结果构造。尽早避免弱分支走到这条路径，是最大的性能收益。

### 低成本后缀上界索引

上界被设计成足够便宜，可以高频调用。对每个搜索范围，HHWX 会按遍历位置预计算后缀数组：

```text
best effectivePower still available per character
best skillAverageRate upper still available per character
best skillLeaderRate upper still available per character
best pointBonusRate still available per character
```

DFS 到某个分支时，bound 检查大致变成：

```text
look up suffix arrays
skip already-used character masks
take the best remaining character-level values
combine them with the current partial-team state
```

这样就不需要在递归热路径里反复扫描复杂卡牌对象、重算技能估值或重新排序剩余候选。一个稍微松一些但极便宜的上界，通常比不能高频使用的昂贵上界更有价值。

### 候选压缩的乘法收益

候选压缩会在五卡 DFS 开始前减少搜索宽度。即使每个角色下的候选只减少一部分，也会因为队伍有五个位置而产生较大的组合收益。

例如，如果压缩后每个位置保留 70% 的可搜索选择，粗略五槽估计为：

```text
0.7^5 = 0.16807
```

也就是在其他剪枝层还没参与前，五卡组合数大约只剩原来的六分之一。真实缩减取决于角色分布、区域道具配置和活动目标，但关键是候选压缩会跨队伍位置复合放大。

HHWX 通过“可替换等价”而不是宽泛强弱估值来保持这一步 exact-safe。只有当一张卡在合法性和技能搜索行为上可以替换另一张卡，并且在当前目标相关维度上不差时，才可以删除被替换卡。

### 目标感知上界

上界不是单一的“高综合力就好” proxy。它会按选定目标适配：

```text
score:
  score upper bound

eventPoint:
  score upper bound
  point bonus upper bound

mission_live + eventPoint:
  score upper bound
  point bonus upper bound
  global support point upper bound
  support opportunity cost in candidate compression
```

这对任务 LIVE 搜索尤其重要。一张卡可能主队价值很高，同时也是强支援候选。如果把它放进主队会损失太多支援综合力，它未必是好的活动 PT 选择。HHWX 会显式建模这个影响，而不是把支援只当作展示后的后处理。

### 相关性第二层上界

便宜的第一层上界故意乐观。它可能把某张卡的最高剩余综合力、另一张卡的最高技能值、第三张卡的最高 PT 加成拼在一起。这是安全的，但有时太松。

当分支接近当前 top-N 阈值时，HHWX 可以计算更紧的相关上界。它会在如下状态上保留一个小型 Pareto frontier：

```text
power
skillAverageRate
skillLeaderRate
pointBonusRate
```

这能移除“假希望”分支：单独看每个维度都很强，但没有任何真实剩余卡集合能同时提供这些最大值。如果相关上界太昂贵，它会被放弃，分支继续留在搜索中；正确性不依赖完成这层更紧上界。

### 早期 top-N 阈值

只有在存在有意义的第 N 名结果后，branch-and-bound 才会有效。因此 HHWX 会先评估高潜力 seed 队伍。这些 seed 队伍不删除候选，也不影响正确性，只是更早提高 top-N 阈值，让后续上界检查更容易剪枝。

剪枝阈值是当前排序结果列表中的第 N 名结果，其中 N 是 `resultLimit`。在结果列表还没有达到 `resultLimit` 个结果之前，搜索不会按分数或目标值阈值剪枝，因为此时还不存在完整的 top-N 边界。

一旦结果列表已满，每个候选分支会计算两个乐观值：

```text
scoreUpperBound
targetUpperBound
```

`scoreUpperBound` 是该分支仍可能达到的最好歌曲分数上界。`targetUpperBound` 会把这个分数上界转换成当前优化目标，例如活动 PT 或任务 LIVE 活动 PT。分支会在以下情况下被剪掉：

- `targetUpperBound` 严格低于当前第 N 名结果的 `targetValue`；
- 或者，对非活动 PT 的分数 tie-break 场景，`targetUpperBound` 等于阈值目标值，但 `scoreUpperBound` 低于阈值结果的分数。

对活动 PT 目标，不会仅因为 `targetUpperBound` 相等且分数较低就剪枝，因为活动 PT 的展示和 tie 行为可能依赖活动特定结果字段。这种情况下，只有目标上界严格低于阈值时才剪枝。

实际效果可以概括为：

```text
better early threshold
+ cheap frequent bounds
+ narrower DFS width
+ target-aware upper bounds
= far fewer full-team evaluations
```

### 延迟昂贵工作

完整队伍评分和详细结果构造会被有意延迟。多数队伍只需要只计算目标值的轻量评估，很多分支甚至不会走到这一步。

被延迟的工作包括：

- 最终同团和同属性技能解析；
- 队长枚举；
- 技能窗口 max/min 细节；
- 支援队卡牌细节；
- 展示用卡牌对象和已解析技能对象。

这也是为什么大卡池和任务 LIVE 场景下提速更明显：弱分支更多，支援敏感候选也更多，它们能在昂贵路径前被拒绝。

## 实现细节

本节以便于代码评审或重新实现的粒度描述实现方式。

### 核心数据结构

搜索会先把卡牌归一化为内部候选记录。每条记录同时保存游戏展示字段和搜索专用字段：

```text
cardId
characterId
bandId
attribute
skillId
skillLevel
rawPower
effectivePower
pointBonusRate
supportPower
skillSignature
skill upper-bound profiles
```

`rawPower` 是区域道具前的卡牌综合力。`effectivePower` 会在每个区域道具配置下重新计算。`supportPower` 是任务 LIVE 支援队选择使用的值，并且有意排除区域道具。

区域道具配置表示为紧凑配置对象：

```text
{
  bandKey,
  attribute,
  parameter,
  selectedAreaItemIds
}
```

对每个配置，实现会预计算一个按候选卡索引的 power vector。这样 DFS 热路径中不需要重复计算区域道具效果。

### 搜索执行流水线

运行时实现可以拆成一串便宜的准备步骤，然后进入很小的热循环：

1. 归一化请求输入、谱面数据、活动设置、玩家持有卡和可选支援队上下文。
2. 构造所有区域道具配置，然后删除被另一配置在所有相关候选上支配的区域道具配置。
3. 预计算每张卡的静态数据：原始综合力、活动 PT 加成、支援综合力、技能签名和技能贡献率 profile。
4. 对每个剩余区域道具配置，用预计算 power vector 重写每张候选卡的 `effectivePower`。
5. 在该配置下压缩被支配的候选卡。
6. 把候选卡排序成遍历组，通常每个角色一个组，并把更强的组放在前面。
7. 启用上下文分区时，把遍历拆成多个上下文 scope。
8. 为当前 scope 构建 suffix 上界索引。
9. 执行 DFS。DFS 只修改小型数值状态、card-id 数组和角色 mask。
10. 对完整五卡队伍先执行轻量目标值评估；只有队伍能进入 top-N 时才构造详细结果对象。
11. 对等价结果去重，按公开 comparator 排序，并截断到 `resultLimit`。

关键性能点是昂贵对象创建得很晚。绝大多数被拒绝的分支不会构造已解析技能对象、支援队结果对象或 max/min 技能顺序展示数据。

### 技能贡献率 Profile

搜索不会把一张卡的技能估成一个孤立分数。实现会先把技能转换成“每点综合力贡献率”，这样它就可以和队伍综合力一起进入上界公式。

对每个 note，先计算 1 点队伍综合力在该 note 上贡献的分数率：

```text
baseScorePerPower = 3 * (1 + (playLevel - 5) / 100) / notesCount

noteRate =
  baseScorePerPower
  * judgeRate
  * comboMultiplier
  * feverMultiplier
```

对一个技能窗口，贡献率是技能持续时间覆盖的 note rate 之和，再乘技能额外分数倍率：

```text
windowRate =
  sum(noteRate * max(0, skillMultiplier(note) - 1))
  for each note covered by the skill duration
```

对简单常量加分技能，它可以化简为：

```text
windowRate =
  sum(noteRate for covered notes)
  * valuePercent / 100
```

实现会评估全部六个技能窗口：

```text
slots 0..4  regular trigger windows
slot 5      leader / encore-related window
```

profile 保存三个 rate：

```text
maxRate:
  best single-window contribution

averageRate:
  average contribution across the five regular trigger windows

leaderRate:
  contribution of the leader / encore-related window
```

这些 rate 用于分支排序和乐观上界，不作为最终分数。

实现会预计算两类 profile：

1. **通用上界 profile。** 使用技能最大可能加分值和基于 PERFECT 的 note rate。它刻意保持乐观，适用于最终队伍上下文还不知道的阶段。
2. **已解析上下文 profile。** 分别在 `mixed`、`same-band`、`same-attribute` 和 `both` 上下文中解析技能，再为每个上下文计算对应的 `averageRate` 和 `leaderRate`。

因此候选记录会携带这些字段：

```text
skillAverageRate
skillLeaderRate
skillSameBandAverageRate
skillSameBandLeaderRate
skillSameAttributeAverageRate
skillSameAttributeLeaderRate
skillBothAverageRate
skillBothLeaderRate
skillMixedAverageRate
skillMixedLeaderRate
```

DFS 过程中，当前搜索 scope 会选择匹配上下文的 rate。完整队伍真正评分时，HHWX 不依赖这些近似值：它会解析真实五卡上下文，并用带 note 级 floor 的整数评分路径重新计算。

### 队伍上下文分区

很多技能效果依赖最终队伍是否全同团或全同属性。实现会把完整队伍划分到精确上下文 scope：

```text
both           all same band and all same attribute
same-band      all same band, mixed attributes
same-attribute all same attribute, mixed bands
mixed          neither all same band nor all same attribute
```

对大卡池，搜索可以分别处理这些 scope。这能减少重复精确评分，并允许更紧的 suffix upper bounds，同时不改变合法队伍集合。

### 候选压缩

候选压缩按角色和区域道具配置执行。实现只比较在合法性上可互换的卡：

```text
same character
same band
same attribute
same skill signature
same context-relevant skill behavior
```

技能签名有意比 `skillId` 更具体。它包含技能持续时间、统一条件类型、统一条件乐队、统一效果值，以及相关分数效果类型、效果值、触发条件和生命阈值。这样可以避免把两个只是 ID 或等级看起来相近、但评分行为不同的技能误判为可互换。

支配维度取决于目标：

```text
score:
  effectivePower

eventPoint:
  effectivePower
  pointBonusRate

mission_live + eventPoint:
  effectivePower
  pointBonusRate
  -supportPower
```

负的 `supportPower` 维度表示：一张卡只有在不会比被替换卡消耗更强支援候选时，才是更好的主队替换卡。

### DFS 状态

递归搜索不会反复分配集合或重算总和。它携带紧凑的增量状态：

```text
selectedCardIds[0..depth)
usedCharacterMaskLow
usedCharacterMaskHigh
currentPower
currentPointBonusRate
currentSupportOpportunityCost
currentBandState
currentAttributeState
```

两个整数 mask 用于记录角色成员关系，因此重复角色检查是常数时间且无分配的。递归深度最多为五。

循环结构接近下面的伪代码：

```text
visit(groupIndex):
  remainingSlots = 5 - selectedCount
  remainingGroups = groups.length - groupIndex

  if remainingSlots == 0:
    evaluateCompleteTeam()
    return

  if remainingGroups < remainingSlots:
    return

  if topNIsFull:
    upper = bound(selectedState, groupIndex, remainingSlots)
    if upper cannot beat threshold:
      return

  if remainingGroups > remainingSlots:
    visit(groupIndex + 1)          // skip this character group

  for card in groups[groupIndex]:
    if card.character already used:
      continue
    push card
    update power, bonus, skill-rate, band/attribute state, masks
    visit(groupIndex + 1)
    pop card
```

按角色分组是重复角色规则变便宜的原因：一个组被跳过，或从中选择一张卡后，递归就会移动到下一个组。

### 分支排序

分支排序是启发式的，但不影响正确性。候选组会按更容易早出强队的顺序排列：

- 高 effective power；
- 高技能上界；
- PT 目标下的高活动 PT 加成；
- 任务 LIVE PT 目标下的低支援机会成本。

这能通过更早提高 top-N 阈值来提速。它本身不会删除任何候选。

### 上界

实现使用多个上界，它们都刻意保持乐观。

第一层上界很便宜，并且会高频使用：

```text
current contribution
+ best possible remaining character powers
+ best possible remaining skill contribution
+ best possible remaining point bonus
+ global support point upper bound, if applicable
```

第二层上界会在分支接近当前阈值时使用。它会联合估计剩余选择，而不是把来自不同卡的独立最大值直接相乘。概念上，它会构建一个小型 Pareto frontier：

```text
remainingPower
remainingSkillPotential
remainingPointBonus
remainingSupportOpportunityCost
```

第二层上界仍然是乐观的。如果它无法证明分支不可能，分支就继续留在搜索中。

### 上界索引构造

高频使用的第一层上界由 suffix 索引支撑。对每个遍历位置，HHWX 会按角色保存后续仍可选择卡牌中的最佳值，维度包括：

```text
effectivePower
pointBonusRate
skillAverageRate
skillLeaderRate
context-specific average skill rate
context-specific leader skill rate
supportOpportunityCost
```

索引是 suffix-based：位置 `i` 对应的行只包含从 `i..end` 的组里仍能选择的卡。DFS 走到位置 `i` 时，可以直接询问“还没用过的角色里，剩余最佳值是多少”，而不需要重新扫描所有后续卡。

随后上界会为每个维度选择最好的 `remainingSlots` 个角色代表。第一层版本有意允许“最高剩余综合力来自一组卡、最高剩余技能贡献来自另一组卡”。这可能高估真实队伍，但便宜且安全。相关性第二层上界就是可选的更紧一层检查，用来尝试把这些维度绑定回同一批假想卡牌。

对任务 LIVE 的 PT 目标，`supportOpportunityCost` 会进入索引，因为把一张高支援综合力卡放进主队，可能会让它不能再进入支援队。因此乐观分支值不只是“主队综合力加全局最佳支援”，还会记录当前主队选择可能消耗了多少支援潜力。

### 阈值应用位置

阈值检查会应用在三个层级：

1. **根配置 / 搜索范围。** 在进入某个区域道具配置和上下文搜索范围的 DFS 前，HHWX 会估计该整个范围下可能达到的最好结果。如果这个上界无法进入当前 top-N，就跳过整个范围。
2. **DFS 半成品分支。** 递归过程中，会对当前已选半队加上剩余卡的最好可能补全做上界估计。如果该分支无法进入 top-N，就跳过这个半队下的所有补全。
3. **昂贵工作前的完整五卡队伍。** 即使已经选出五张卡，如果该队伍的乐观目标上界无法达到阈值，HHWX 仍然可以避免真实评分或支援队详细结果构造。

相关性第二层上界不会在每个分支上都使用。只有当第一层上界足够接近当前阈值、更紧检查值得付出成本时才会触发：

- 对 PT 加成目标，当第一层目标上界最多只比当前阈值高约 `120` 点，或该上界不是有限值时触发；
- 对分数目标，当第一层上界最多只比当前阈值高约 `8%` 时触发。

这些数字是成本控制启发式，不是正确性假设。相关性上界比第一层上界更贵，如果分支上界远高于当前阈值，即使算出更紧估计，也通常很难证明该分支不可能进入 top-N，容易浪费时间。对 PT 加成目标，目标值是整数活动 PT，真正有剪枝价值的分支通常贴近当前临界线，因此使用较小的绝对窗口。对分数目标，数值规模更大，并且会随歌曲和卡池变化，所以使用相对窗口。调整这些窗口只会影响尝试更紧上界的频率和速度，不会改变 exact 保证。

如果相关性上界超过内部工作预算，它会返回无结果并保留该分支。这保持了正确性：更紧上界可以提升速度，但算不出更紧上界时绝不会删除分支。

### 完整队伍评分

对完整队伍，实现执行精确评分：

1. 解析最终队伍上下文。
2. 在该上下文下解析五张卡技能。
3. 评估每一种队长选择。
4. 计算六个技能窗口。
5. 计算平均分、最高分、最低分和一个代表性最高分技能顺序。

因为六个技能窗口互不重叠，把技能分配到窗口的贡献可以相加。自由 LIVE 中，五张主队卡技能都依赖候选队伍。协力 LIVE 中，四个外部玩家技能由请求固定；候选相关部分是选定队长技能，以及根据 encore 设置确定的 encore 来源。

当需要详细 max/min 输出时，五个触发技能仍然会精确分配到五个触发窗口。实现不枚举所有 `5! = 120` 个排列，而是使用 bitmask 动态规划：

```text
dp[mask] = best contribution after filling popcount(mask) windows
transition: add one unused skill to the next window
```

这个 DP 只有 `2^5` 个 mask，并保留：

- 最大贡献；
- 最小贡献；
- 达到最大贡献的顺序数量；
- 一个代表性最大顺序。

它在数学上等价于枚举全部 120 个分配，因为每个排列都对应 DP 中唯一一条路径。

### 轻量目标评估和详细结果构造

大多数完整队伍不会进入结果列表。为了减少分配成本，评分被拆成两个阶段。第一阶段只计算能决定排序的目标值，第二阶段才构造展示所需的详细结果：

```text
target-only evaluation:
  target value
  average score
  room score
  event point base
  best leader

hydration:
  card details
  resolved skills
  support cards
  max/min score display fields
  skill order display fields
```

只有当队伍能够进入当前 top-N 列表时，才会执行详细结果构造。这不会改变分数，只是延迟构造结果对象。

### 支援队伍评估

支援候选会按 `supportPower` 排序一次。对每个完整主队，支援选择是一次线性扫描：

```text
for card in sortedSupportCandidates:
  skip if cardId is in main team
  skip if support character already used
  take card
  stop after five cards
```

在执行真实支援扫描前，搜索会先检查即使使用全局最大可能支援点数，该队伍是否仍然无法进入 top-N。如果无法进入，就跳过真实支援选择。

### 结果排序

结果按以下顺序排序：

1. 目标值；
2. 平均分或总综合力，取决于目标；
3. 队长技能强度；
4. 稳定 cardId 排序。

稳定 tie-breaker 让重复运行结果确定。

结果插入有两层去重。评估阶段用 `areaItemConfigurationKey + sortedCardIds` 避免在同一区域道具配置下重复评估同一卡组。结果插入阶段再次使用 `sortedCardIds`，因此同一个可见五卡队伍即使通过多个 scope 或配置被找到，也只保留评分更好的结果。

每次插入后，结果列表都会重新排序并截断到 `resultLimit`。一旦列表已满，最后一个结果就成为后续根 scope、半成品分支和完整队伍检查使用的剪枝阈值。

### 缓存层

多个缓存用于降低重复精确评分成本：

- 谱面和 note-rate 准备数据会在队伍之间复用；
- judge-rate 列表按准确率设置缓存；
- base score-rate 列表和 no-floor score-rate 列表按谱面和游玩条件缓存；
- skill multiplier 列表按已解析技能窗口缓存；
- 同一个 skill/context pair 反复出现时，会复用已解析技能 profile；
- 支援队选择按排序后的主队 card ids 缓存。

这些缓存有意放在公开结果层之下。它们不会改变排序语义，只是避免重复计算确定性的中间值。

## 正确性论证

### 搜索空间覆盖

每个合法结果都可以表示为：

```text
area-item configuration
+ five distinct-character main-team cards
+ leader choice
+ skill-window assignment
+ support band
```

算法枚举每个区域道具配置，并在该配置下枚举每个合法五卡队伍。对完整队伍，它评估每个队长选择，并计算精确技能窗口贡献。对任务 LIVE，主队固定后，支援队伍会被最优求解。因此，每个未被剪枝的合法队伍都会被精确评分。

### 候选压缩安全性

只有当满足以下条件时，卡 A 才能删除卡 B：

- A 和 B 角色相同；
- A 和 B 在所有相关上下文中技能等价；
- A 的 effective power 不低；
- 对活动 PT 目标，A 的 point bonus 不低；
- 对任务 LIVE 活动 PT 目标，A 的支援机会成本不高。

任何包含 B 的合法队伍，都可以把 B 替换为 A，而不改变角色合法性、不削弱技能上下文、不降低目标值。因此，删除 B 不会删除唯一最优解。

### 上界剪枝安全性

每个分支上界都是当前精确部分值加上乐观剩余贡献。它可以高估该分支真实可达值，但绝不能低估。如果连这个乐观值都低于当前第 N 名结果，那么该分支没有任何补全方式可以进入 top-N，剪枝就是安全的。

例如，便宜的第一层上界可能把某张卡的最高剩余综合力、另一张卡的最高剩余技能贡献、第三张卡的最高剩余 PT 加成组合在一起。这个组合未必能由任何真实队伍达到。但它仍然安全，因为它是高估。相关性第二层上界用于在分支接近 top-N 阈值时移除一部分这种不可能组合；但即使这层更紧上界不可用，正确性也不依赖它。

### 支援队伍贪心最优性

主队固定后，支援选择问题是在支援队伍内角色不重复的前提下，选择最多五张支援卡，并最大化总 `supportPower`。

对每个角色，只有该角色可用支援综合力最高的卡可能有意义。取剩余角色代表中的前五名就是最优解。按支援综合力排序所有支援候选并跳过重复角色，等价于这个最优选择。

### Exact 结果条件

结果只有在以下条件满足时才标记为：

```text
searchMode = "exact"
```

搜索完整结束，并且每个跳过分支都由安全上界证明。

面向用户的含义：

- `exact`：返回的 top-N 结果在给定输入模型下已证明最优。
- `bounded`：返回结果是时间预算结束前已经找到的最佳队伍，不能展示为已证明最优。任何上界 gap 都应理解为剩余不确定性，而不是列表中队伍额外获得的分数。

## 与 Bestdori Team Builder 的差异

Bestdori Team Builder 是重要参考，但它的队伍搜索是启发式的，不提供 exact 最优性证明。它也围绕紧凑 skill tag 和 skill matrix 做优化，历史上 key 接近 `skillId + skillLevel`，这无法在半成品队伍优化阶段完整表达同团、同属性条件。

下方 benchmark 比较的是本地 Bestdori-compatible baseline，不是对 Bestdori 当前或未来线上部署的普遍结论。这个本地基线来自验证时保存的 Bestdori Team Builder 资源包，目前对应 `ToolTeamBuilder.6367a448.js`，并被包装成可以使用与 HHWX 相同的本地 fixture 和 master data 运行。原始 fixture、本地包装器和验证脚本不随本仓库发布，因此这些数字是设计论证材料，不是公开可复现测试套件。

Bestdori 也使用重要的性能技术：

- 预计算技能贡献矩阵；
- 候选排序；
- top-N 阈值存在后的递归剪枝；
- 粗略剩余综合力和分数估计；
- 请求固定 center skill 时的早期拒绝。

因此，HHWX 的提速不能解释为“HHWX 有剪枝而 Bestdori 没有”。差异在于，HHWX 的分支上界检查更便宜、应用更早，并且更贴近真实目标值。

HHWX 的主要差异包括：

- 枚举完整合法搜索空间，并且只用安全上界剪枝。
- 在完整五卡队伍确定后解析技能。
- 在真实队伍上下文中正确处理同团、同属性、PERFECT-only 和递增倍率技能。
- 区域道具作为一套全局队伍配置枚举。
- 在 exact 评分和上界中都纳入任务 LIVE 支援队伍。
- 明确报告结果是 exact 还是 bounded。

因此，HHWX 不是 Bestdori 启发式搜索的重实现，而是在可兼容的分数公式口径下实现的 exact 搜索引擎。

### 提速来自哪里

与本地 Bestdori 兼容基线相比，HHWX 的速度收益来自这些实现选择：

1. **DFS 前候选压缩。** 可证明安全的替换规则减少进入 DFS 的卡牌数量。因为队伍包含五张卡，这种减少会跨位置复合放大。
2. **后缀上界索引。** HHWX 按遍历位置和角色预计算剩余最佳值，因此高频分支检查不需要昂贵重扫或重排。
3. **目标专用上界。** 分数、活动 PT、任务 LIVE 活动 PT 使用不同上界维度，而不是单一综合力代理指标。
4. **支援感知建模。** 任务 LIVE 支援综合力会进入压缩和上界，因此很多支援敏感分支能在真实支援选择前被拒绝。
5. **相关性第二层上界。** 接近 top-N 阈值时，HHWX 可以把综合力、技能潜力和 PT 加成绑定在一起，而不是组合不相关的单维最大值。
6. **延迟详细结果构造。** HHWX 只为能够进入 top-N 列表的队伍构造详细结果对象。
7. **Bitmask 技能窗口 DP。** 详细 max/min 技能顺序输出使用 32 状态分配 DP，而不是反复枚举所有 `5!` 技能顺序。

最重要的模式是：本地 Bestdori 兼容基线倾向于用快速启发式继续评估更深的半成品队伍和大量完整队伍；而 HHWX 倾向于用低成本、贴近目标值的上界，在完整队伍评分前拒绝更多分支。

这就是为什么 HHWX 能更快，同时在搜索未超时时仍能保持 exact 搜索契约。

## 聚合性能对比

以下 benchmark 数字比较了 HHWX 和本地 Bestdori 兼容基线在同一机器、可比输入下的表现。

### Benchmark 方法

benchmark 矩阵使用：

- 同一台本地机器运行 HHWX 和兼容基线；
- 相同的缓存 Bestdori master data 和谱面数据；
- 相同的玩家卡池 fixture 和活动设置；
- 可比的优化目标，因此基线作为公式和性能参考，而不是 exact 搜索正确性基准。

`HHWX max` 和 `Baseline max` 列表示验证矩阵中每个场景组记录到的最慢样例。抽样卡池平均耗时表表示该矩阵使用的抽样卡池集合上的平均耗时。

因为 baseline 是围绕已保存 Bestdori 资源包构建的本地兼容包装，所以这些耗时应理解为受控输入下的工程对比，而不是对 Bestdori 线上服务性能的通用判断。

| Scenario | HHWX max | Baseline max | Approx. speedup |
| --- | ---: | ---: | ---: |
| 1329-card pool, no event | 1.6s | 9.6s | 6.0x |
| 1889-card pool, no event | 2.1s | 11.8s | 5.7x |
| 1889-card pool, challenge event | 1.9s | 8.2s | 4.4x |
| 1889-card pool, mission multi | 7.9s | 89.4s | 11.3x |
| 1889-card pool, versus display | 1.9s | 12.3s | 6.4x |
| 1889-card pool, Team Festival display | 2.4s | 12.9s | 5.5x |
| Sampled card pools, no event | 2.4s | 24.6s | 10.1x |
| Sampled card pools, 95% perfect rate | 2.3s | 19.7s | 8.6x |
| Sampled card pools, challenge event | 1.9s | 10.9s | 5.7x |
| Sampled card pools, mission multi | 8.1s | 90.4s | 11.1x |

抽样卡池平均耗时：

| Scenario | HHWX average | Baseline average |
| --- | ---: | ---: |
| No event, full PERFECT | 1.4s | 8.6s |
| No event, 95% perfect rate | 1.3s | 7.9s |
| Challenge event | 1.2s | 6.0s |
| Mission multi | 4.6s | 45.4s |

## 已知限制

当前公开报告描述的是单曲组队计算器，不把组曲或其他多队伍优化纳入同一个搜索问题。

`perfectRate` 模型只模拟 PERFECT 和 GREAT。GOOD、BAD、MISS、断连以及主动控分路线不会被模拟。因此，真实行为依赖这些结果的技能不会被表示为完整的 LIVE 游玩概率模型。

对 PT 加成活动，本文把活动公式抽象为 `basePt(score, roomScore)`。具体公式取决于实现和活动数据。

性能数字比较的是 HHWX 与上文定义的本地 Bestdori 兼容基线。它们不应被理解为对所有 Bestdori 版本或运行环境的通用 benchmark。

如果搜索超过时间预算，HHWX 会返回 `bounded` 而不是 `exact`；这类结果是有用的候选列表，但不是全局 top-N 最优性的证明。

## 验证总结

当前主验证矩阵满足：

- 固定队伍整数分数与兼容基线一致；
- 在可比目标下，HHWX exact 搜索不劣于兼容基线；
- 主矩阵中没有返回 bounded 结果；
- 活动 PT 展示选项一致；
- 任务 LIVE 支援队伍处理已验证；
- 常见大卡池路径保持在 10 秒以内。

发布验证应继续包含自动公式检查、exact 搜索检查，以及周期性的 2000+ 卡池压力测试。
