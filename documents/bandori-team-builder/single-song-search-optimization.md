# 单曲搜索优化设计

本文档记录 HHWX 单曲 exact 搜索的优化结构。所有优化必须满足一个约束：不能牺牲最优性证明。启发式只能用于排序、建立更高阈值或 bounded 兜底，不能用于 exact 剪枝。

## 三种目标共用同一内核

三种单曲目标都走同一个 branch-and-bound 内核，只由目标适配器提供不同维度：

- `score`：目标维度是有效综合力和技能贡献。
- `eventPoint`：在 `score` 维度上追加主队 PT 加成。
- `mission_live + eventPoint`：再追加支援队伍机会成本和支援 PT 上界。

共享内核带来的好处：

- 区域配置枚举、卡牌综合力矩阵、谱面预处理、技能贡献缓存可以复用。
- 安全压缩和上界逻辑只写一套，再由目标适配器补充维度。
- 性能改进可以自然覆盖三种模式，避免只优化某一条分支。

## 请求级和 worker 级缓存

当前缓存内容：

- 谱面 timeline：按 `chartCacheKey + fever` 复用。
- inner score rate：按谱面、准率、combo 设置复用。
- 技能窗口贡献：按技能、技能等级、上下文、准率复用。
- skill rate profile：按谱面、server、技能、上下文复用。
- 区域配置下的卡牌综合力矩阵：同一请求内复用。
- Master、chart、event bonus 的 fetch promise：浏览器 worker 生命周期内复用，失败时失效。

这些缓存不改变搜索空间，只减少重复计算。

## Seed 队伍

Seed 只用于尽早建立 top-N 阈值，不参与剪枝正确性：

- `score`：优先高综合力、高技能潜力。
- `eventPoint`：综合力和 PT 加成混合排序。
- `mission_live + eventPoint`：在上面基础上惩罚高支援机会成本主卡。

即使 seed 选得不好，后续 DFS 仍会枚举完整空间；只会影响速度，不影响正确性。

## 区域配置预剪

每个区域配置先计算 root upper bound。处理顺序按 root bound 降序：

1. 高潜力配置先搜索，尽早提高 top-N 阈值。
2. 若后续配置 root bound 已低于阈值，则整个配置跳过。

root bound 是高估，因此跳过安全。

## 候选压缩

压缩目标是减少 DFS 候选数。规则按目标适配器扩展：

| 目标 | 支配条件 |
| --- | --- |
| `score` | 同角色、同技能签名、同 band、同 attribute，且有效综合力不低于 |
| `eventPoint` | `score` 条件 + PT 加成不低于 |
| `mission_live + eventPoint` | `eventPoint` 条件 + `supportPower` 不高于 |

`supportPower` 条件的含义是：如果 A 替换 B 进入主队，A 对支援池的损害不能比 B 更大。这样压缩不会误删任务活动 PT 最优解。

## 两级上界

第一层上界便宜，递归中频繁调用：

- 当前综合力；
- 剩余角色最大综合力；
- 剩余技能上界；
- 剩余 PT 加成上界；
- 全局支援 PT 上界。

第二层上界只在接近 top-N 阈值时启用：

- 用小型 Pareto/DP 联合估计剩余综合力、技能贡献和 PT 加成。
- 避免把不同角色上的最高综合力、最高技能和最高 PT 加成错误相乘，导致上界过宽。
- 第二层仍只允许高估；若无法证明安全，回退第一层。

## 评分热路径

完整队伍评分拆成两层：

- target-only 轻量评分：只算排序目标需要的分数、房间分、PT、队长。
- hydrate 详细结果：只有可能进入 top-N 的队伍才构造技能详情、最高分顺序、支援卡等展示字段。

任务活动支援也有同样的延迟：

1. 先用全局最大支援上界做乐观 PT 判断。
2. 若乐观值低于阈值，跳过真实支援选择。
3. 只有可能进入 top-N 时，才线性扫描支援候选并构造结果对象。

## 协力 LIVE 评分优化

协力 LIVE 本身不一定比自由 LIVE 更慢。自由 LIVE 中五张主队卡的技能都会随候选队伍变化；协力 LIVE 中 4 个外部玩家技能由请求固定，候选相关的主要是当前队长技能和 encore 来源。因此从技能变化维度看，协力 LIVE 往往更窄。

当前 benchmark 中最慢的是 `mission_live + multi + eventPoint` 组合路径，原因是它同时包含房间分、PT 目标、主队 PT 加成、支援队伍上界与支援队伍真实选择，而不是因为“协力 LIVE 技能评分天然更慢”。当前优化：

- 外部技能按请求解析并缓存。
- 每个候选队伍只需要随队长选择切换自己的队长技能；外部技能贡献可复用。
- 5 个技能触发窗口与 5 个触发技能的最大/最小分配用 bitmask DP 精确求解。
- 常量倍率技能使用窗口贡献缓存。
- `roomScore` 使用 raw average score 与 room score rate 直接计算，避免重复逐 note 计算其他玩家分。

bitmask DP 的状态数约为 `5 * 2^5`，比枚举 120 个排列更稳定；由于技能窗口不重叠，DP 与全排列枚举等价。

## bounded 模式

bounded 保留为浏览器超时兜底：

- 默认目标始终是 exact。
- bounded 结果必须显式标记 `searchMode = "bounded"`、`isExhaustive = false` 或 `timedOut = true`。
- UI 不能把 bounded 结果当作最优解展示。

## 后续可优化方向

1. 更强 per-character skyline：比较每个技能窗口贡献向量，而不只比较综合力和标量技能上界。
2. 更细的 band/attribute suffix index：为同团、同属性、both、mixed 分支建立专用上界。
3. top1-first UI 路径：先证明第一名，再继续填充 top-N；结果需要标注每个阶段的 exact 状态。
4. 长矩阵自动重试：Supabase 抽样长矩阵曾因网络 `ECONNABORTED` 中断，验证脚本可加入只读重试和断点续跑。

## 性能目标

- 1000-1900 张真实卡池：三种核心模式稳定 exact，常规场景低于 10 秒。
- `mission_live + multi + eventPoint`：当前最慢主路径，目标稳定低于 8.5 秒。
- 2000+ 模拟池：必须 exact；若超过 10 秒，记录容量风险，不能退化为 bounded 通过。
