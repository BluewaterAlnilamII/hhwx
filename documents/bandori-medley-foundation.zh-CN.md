# 全新 Bandori 组曲基础设施

English version: [bandori-medley-foundation.md](bandori-medley-foundation.md)

## 检查点范围

本文档约束新组曲组队计算器的第一个独立检查点。该检查点只包含严格的规范化输入模型，以及对三支已显式指定五卡队伍进行计算的透明参考计分器；不包含队伍生成、候选搜索、剪枝、排序、证明协议或部分结果，也不导入 `src/lib/bandori/team-builder/` 下任何旧计分器或求解器。

保留的可执行 fixture 只有已经选定的 15 张卡，每首歌只有 7 个规范化音符。这是跑通三队完整流程的最小固定输入，不是 15 张卡的搜索。未来约 2,000 张卡只属于最终困难验收场景，不是本阶段的正常或早期输入。

审计基线是 JP 10.1.3 arm64 客户端和 JP master artifact `20260805110509`；技能 effect artifact 的 SHA-256 为 `d98e76c0198a6a714be1d38e4696a044242c8384b905426a311c8c2b0961aebc`。[游戏官方 FAQ](https://bang-dream.bushimo.jp/faq/) 还独立确认了每曲六次技能、成员随机顺序、从下一音符开始生效、continued 技能打断条件，以及生命条件只在触发时判断。

## 来自游戏的计分链

计分链显式使用 IEEE-754 单精度；下列每一行都产生一次 `f32`，正数转整数时向零截断：

```text
playRate = f32(1 + f32((playLevel - 5) * f32(0.01)))

baseScore = f32(
  f32(
    f32(deckTotalParameter * playRate) / f32(noteCount)
  ) * f32(3)
)

corrected = f32(baseScore * judgeRate)
innerScore = floor(f32(corrected * comboRate))
scoreUpRate = f32(feverRate * skillMultiplier)
noteScore = floor(f32(f32(innerScore) * scoreUpRate))
```

PERFECT 与 GREAT 的 `f32` 判定倍率分别是 `1.1` 和 `0.8`。两个逐音符截断点都属于契约；测试保留了两组 Float64 改写会差 1 分的反例。

固定队评估器直接接收游戏计分工具最终消费的 deck-level `f32` 参数。上游规范化层必须按审计确认的顺序生成它：

```text
OriginalAll = f32(f32(originalP + originalT) + originalV)
AreaItemAll = f32(f32(areaP + areaT) + areaV)
EventBuffAll = f32(f32(eventP + eventT) + eventV)
deckTotal = f32(f32(OriginalAll + AreaItemAll) + EventBuffAll)
```

参考计分器不会用另一种顺序重新组合每卡数值。未来搜索输入必须有一套经过独立审查、能够为任意候选队伍重现该 deck total 的表示；本检查点刻意不提前猜测这项架构。

组曲 combo 按成功音符数跨三曲继承。由于模型只有 PERFECT 和 GREAT，combo 不会中断。组曲倍率表使用 `startCombo + noteIndex + 1`，并保留了 20→21 边界测试。

## PERFECT/GREAT-only 期望分

`hhwx-medley-pg-expected-v1` 明确排除 GOOD、BAD、MISS、断 combo、生命损失和生命继承随机性。但它仍然是两种真实整数计分结果的期望，而不是在截断前先平均判定倍率：

```text
E[noteScore] =
  p * integerScore(PERFECT, state)
  + (1 - p) * integerScore(GREAT, state)
```

输入准率是最多九位小数的规范十进制。参考 oracle 使用固定顺序的 `f64` 状态分布；每条实际 P/G 分支都先完整经过 `f32` 链和两次整数截断。continued 与 Crescendo 状态也进入该分布。输出按 `f64` bits 序列化，期望值最后不再额外 floor。

前五次技能等概率遍历成员索引 `0..4` 的全部排列；第六次固定使用成员索引 `2`，即中央 leader。单曲结果是这 120 个期望分按稳定顺序求均值，组曲目标是三曲均值之和；最高分不会作为隐藏的第二优化目标。

## 已解析技能行为

计分器只接受一套刻意缩小、已经按队伍上下文解析完成的技能契约：

- `score`：在受支持的 P/G 条件下使用同一加分行为；
- `score_on_perfect`：PERFECT 获得加分，GREAT 保留普通分数；
- `perfect_only`：PERFECT 使用 `1 + value / 100`，GREAT 使用绝对倍率 `0`；
- `continued_perfect`：当前 GREAT 当场从高倍率切到普通 fallback，之后所有音符继续使用 fallback；
- `great_or_worse_half`：PERFECT 使用 `1 + value / 100`，GREAT 使用绝对倍率 `0.5`；
- 可选 `rate_up_with_perfect`：当前 PERFECT 先增加输入给出的叠层值，受输入给出的总加分上限约束，再计算当前音符；GREAT 保留已有叠层但不增加。

计分器不接受 raw master effect。实际输入规范化器必须先解析来源顺序、地区 scalar fallback、队伍统一条件和生命分支。v1 的 P/G-only 模型把触发生命固定为 1,000：`over_life` 使用 `life >= threshold`，`under_life` 使用 `life < threshold`。统一 continued 技能必须保留普通 fallback；不能因为来源 fallback 行也携带 unified scalar，就把统一高倍率泄漏到 GREAT 后的 fallback。未知或尚未支持的来源形态一律失败。

## 技能窗口策略

黄色触发音符自身以及所有规范化时间完全相同的其他音符，都不吃新技能。只有 `note.timeMicros > trigger.timeMicros` 时，新技能才开始生效。

当前计算器采用确定性的时间戳结束策略：`note.timeMicros <= trigger.timeMicros + durationMicros` 时纳入技能。它是 HHWX calculator policy，不宣称逐帧复刻客户端。客户端会在音符处理后递减 `f32` timer，并在后续帧结束技能；若要替换当前策略，必须先补 native 临界帧 capture。

客户端实际上会排队处理冲突技能窗口，但计算器按已经确认的 HHWX 覆盖规则执行。每个 active skill 独立推进内部状态并得到 `m_i`，随后按稳定触发顺序组合：

```text
skillMultiplier = f32(1 + sum(f32(m_i - 1)))
skillMultiplier = max(0, skillMultiplier)
```

之后只乘一次 fever，并只执行一次第二截断；不能把每个技能分别取整成分数增量再相加。保留 fixture 同时覆盖普通正加分重叠，以及 GREAT 绝对倍率 `0.5` 与正加分技能重叠。

## 输入与结果边界

规范化固定输入使用：

- `0..14` 连续 card `instanceId`；
- 正数 master card、character 和 skill ID；
- 三队之间物理卡实例唯一；
- 单队内角色唯一；
- bit-exact、finite、非负的 `f32` deck total 与技能倍率；
- 严格三首有序歌曲，每曲严格六个技能触发；
- 使用整数微秒、ID 连续、按时间排序的音符；
- 不包含搜索控制或 UI／网络对象。

未知 JSON 字段、不支持的版本、非规范准率、引用缺失、实例重复、谱面顺序异常、非有限值和算术溢出都 fail closed。校验失败属于输入错误，绝不是“无解”。

trace 会记录 deck total、play rate 与 base score 的 `f32` bits，每个音符 P/G 第一次截断后的整数分，全部 120 个技能顺序期望分的 `f64` bits、平均分 bits、combo offset，以及参考状态峰值。它是 oracle 审计产物，不是紧凑生产结果。

## 明确延后的决策

在讨论任何搜索算法前，后续基础设施检查点还必须完成并审计：实际 UI/source snapshot、地区解析、卡参／区域道具／活动加成的 deck-total 管线、谱面规范化，以及来源与语义 fingerprint。浏览器 WASM glue 也需要单独的 bundler spike 和版本化 Worker protocol。上述任何工作都不授权提前决定候选布局、剪枝、缓存、支配关系或搜索空间切分。
