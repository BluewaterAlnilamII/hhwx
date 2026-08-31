# 全新 Bandori 组曲基础设施

English version: [bandori-medley-foundation.md](bandori-medley-foundation.md)

## 检查点与语义权威

本文档定义新组曲组队计算器的第一个独立检查点。实现位于从 `origin/main` 起始的 `dev/medley-v2-greenfield`，但没有导入、包装、重构或以其他方式复用现有 team-builder 的计分器与搜索实现；递归 source guard 会持续约束 `src/lib/bandori/medley-foundation/` 的这条边界。

本检查点刻意固定在极小规模：

- 恰好 15 张已经选定、确实拥有的卡；
- 恰好三支显式五人队；
- 恰好三首显式歌曲及谱面；
- 三队共享一套显式选定的区域道具配置；
- 只进行透明的固定队计分，不进行组队搜索。

本检查点没有候选生成、卡池枚举、区域道具搜索、排序、剪枝、取消或结果协议。接近 2,000 张卡的卡池属于未来的困难验收场景，不是早期或默认测试；早期正确性测试必须刻意保持极小规模。对未来的困难场景，300 秒是性能目标，200–300 MiB 是内存竞争目标，单次计算的增量峰值必须低于 1 GiB；超时属于未完成，不算成功。这些是验收要求，不代表已经选定搜索架构。

每个已经完成的基础设施模块都有独立、可追溯的提交。后续也应当在每个可审查模块完成后立即提交，保证未来审计与回退不需要从大型混合 patch 中反推改动。

可执行计算器以 Bestdori 语义为权威。原生客户端审计结果只保留在下文的差异记录中；除非产品语义被明确重新决定，否则不得进入代码。

## 来源输入边界

`hhwx-medley-foundation-source-v1` 接受真实固定输入所需的原始资料，不接受调用方算好的卡牌或队伍总值：

- 解压后的 HHWX 用户档案：其中 `bestdoriProfile` 子对象以 Bestdori compression v2 保存卡牌等级、突破等级、技能等级、剧情、训练／卡面／排除状态和区域道具等级；角色潜能与角色任务加成则只读取 HHWX 档案顶层的 `characterPotentials` 和 `characterMissionBonuses`；
- 原始 card、character、skill、area-item、song 和 event-bonus 记录；读取参数或技能前，Cards `serverExtensions` 会按档案区服解析，区服不存在时沿用既有的 JP 存在性 fallback；
- 一份由三队共享的显式区域道具 ID 列表；
- 三份有序的五卡 ID，其中成员索引 2 是 leader；
- 三个歌曲 ID 文本、难度和 Bestdori 形态谱面；歌曲 ID 只有通过严格正数 u32 解析后才转成数字；
- PERFECT 百分比文本，只有在边界内才转成规范的精确概率。

15 张已选卡必须都由档案拥有，同一物理卡在整套组曲里只能出现一次；按照规范化 Rust 契约，每支固定队还必须由五个不同角色组成。未来搜索必须在构造候选前硬排除带有排除标记的卡；该标记不改变一支已经显式给定队伍的分数。缺失选中 master 行、档案压缩损坏、引用无效、十进制不规范、foundation 自有 envelope 出现未知字段或 schema 版本不支持，都会以稳定错误码和字段路径失败；原始 master 行中未使用的字段仍被容忍。它们是输入错误，绝不是“无解”。本检查点没有临时卡或搜索候选。

规范化 Rust 契约版本是 `hhwx-medley-scoring-input-v1`。其中只有连续的 `0..14` 实例 ID、三队最终综合力、已解析计分技能、三张规范谱面和精确准率，不含 UI、网络、档案压缩或搜索状态。

## 已锁定的搜索侧合同

固定计分 DTO 不是未来的搜索请求，但以下产品规则已经确定：

- “完全新写”是指不复用或重构旧求解器代码与架构，不是否定已经确立的 Bestdori／当前 main 输入和计算合同；旧求解思路不具有权威性。
- 搜索使用三个严格有序的歌曲槽，允许歌曲重复，绝不自动换序。三支队伍及各自 leader 都是输出；成员索引 2 仍是 leader。
- 搜索按既有规则枚举已拥有道具：一个乐团组、一个属性组和一个可选参数道具。三队共享算法选出的同一配置；前端不输入最终道具 ID 列表。仅存在于国服元数据中的 59、68、72 刻意不进入 Bestdori 兼容计算器。
- 正式目标只有一个已证明的平均分总和 Top-1。并列时只需稳定地选择一个可复现代表；理论最高分不是第二目标。
- 搜索可以被动保留最多十个已经发现的高平均分方案，其中包括正式最优结果；它们不是经证明的全局 Top-10。搜索结束后只为这组少量方案补算理论最高分，并标记其中最高者。
- 只有完整空间已经枚举或被安全剪枝，才存在正式结果。取消、时间、内存、数据或运行时失败都属于未完成；`bestSoFar` 最多用于诊断，不存在 bounded 或 gap 成功模式。
- 计分保留既有的成员与区域道具运算顺序；搜索不得重排进入计分的数据。

## 暂定搜索架构方向

以下内容是目前经过审查的工程方向，不属于游戏规则或产品语义，后续完整架构审查可以修改。本文只保留耐久的决策；原型细节和基准历史应放在其他材料中，避免基础文档无限膨胀。

- 按角色组织卡池，在完整五卡候选产生之前，同时缩小三支部分队伍所代表的组合范围。核心判断是整套三曲目标的安全上界，不是候选生成后的配对优化。
- 上界由 HHWX 自己的乐观计分器产生。它保留真实的有序谱面与 combo 起点、综合力相加及其单调性、仍可达成的全队同团／同属性条件、前五次固定 120 顺序、leader 第六次触发和技能重叠直接相加；未知选择只能向更有利方向放宽。单一的“卡牌预估分”不能代替精确计分。
- 早期及搜索过程中限量尝试补全三队，精确计分后提高当前最高分，但不限制正式搜索范围。把完整三队空间划分为短期保存、完整遍历的小块，用固定容量、仅当前配置有效的缓存复用完整队伍计分，完整输出只为最终少量保留结果还原。
- 无法证明覆盖全部可能补全方案的上界不得剪枝。禁止候选上限、随机保留、近似比较和虚假的 exact 成功；在没有上界命中的小输入上，搜索仍应完整穷举。

对 calc 的反向研究只用于说明剪枝应放在哪里、紧凑数据应存活多久；它不定义 HHWX 的计分、候选布局、替代关系或证明语义。已经批准的首版整体设计记录在[全新 Bandori 组曲搜索](bandori-medley-search.zh-CN.md)中。其中的工程做法仍然可以复核，不会因此变成游戏语义。

## 参数推导

来源适配器从原始记录完整推导固定队参数：

1. 从 Cards 聚合读取 1 级与总满级 P/T/V 行；若选择中间等级，则使用 Bestdori 稀有度成长曲线和 JavaScript `Math.round` 还原。
2. 每项加入 `50 * rarity * masterRank`。
3. 加入训练值和档案中已完成数量对应的剧情加成。
4. 先把 compact 任务单位从十分之一百分点转换为百分比；角色潜能贡献单独 floor，收集任务与训练任务倍率先相加，再对合并后的任务贡献 floor 一次。P/T/V 数值是否恰好相同不会改变这条规则。
5. 按档案等级、区服等级倍率、目标属性和目标乐团计算每个显式选中且拥有的区域道具。
6. 按原始活动属性、角色、规范 `situationId` 成员、突破、匹配参数与协力房参数计算活动加成；这些 JavaScript-number 贡献在这里不额外取整，与当前 Bestdori 计算器一致。
7. 用 JavaScript `Number` 直接相加 card power、selected area-item power 和 event power，得到 `deckTotalParameter`。

等级曲线与当前计算器行为已独立对照 Bestdori 的 `app.d390adb1.js` bundle（模块 `c0f0`，2026-08-30 获取，SHA-256 `ac84605d7889e53c0144ab7c41e379c174b94b8dc31edae07f3483b8a0610778`）。这也与 [Bestdori Cards API 契约](https://github.com/windowssov8forus/bestdori-api/blob/main/docs/api/cards.md)一致：compact Cards 响应提供最小／最大参数，而不是每个所选等级的独立行。

技能标量优先使用档案区服；只有该槽缺失时才回退 JP，区服槽中显式的零仍然是零。区域道具倍率则始终留在档案的精确区服，并向下查找到不高于已拥有等级的最近可用行，不会横向借用其他区服倍率。适配器不会接受调用方预计算的卡牌 P/T/V、区域道具总值、活动总值或队伍综合力。

## 不含生命状态的技能归一化

计分器只接受已经结合完整队伍上下文解析后的这些行为：

- `neutral`；
- `score`；
- `score_on_perfect`；
- `perfect_only`；
- `continued_perfect`，分别保留 active 与普通 fallback；
- `great_or_worse_half`；
- 仅附着在无条件 `score` 上的可选 `rate_up_with_perfect`。

来源适配器按 Bestdori 原始顺序读取 score effect，并采用第一个被识别的计分行，包括显式的零值。只有五张卡全部确定后，才可能按同团或同属性条件替换这个首个数值。continued 技能把后续普通 score 行保留为 fallback。PERFECT 叠层在当前 PERFECT 上先增加 `0.5` 个百分点；GREAT 保留而不增加累积值；总 score-up 上限是基础值加 `50`。

这里没有生命模型，也没有生命输入。原始 Bestdori 键名 `score_over_life` 与 `score_under_life` 仍保留来源顺序，并与当前 Bestdori 计算器相同地归一化为普通 score 行；计分契约中没有阈值、假定生命、继承生命或生命状态。

## 谱面归一化

谱面适配器遵循 Bestdori 的实体与属性存在语义：

- `Single`、`Directional` 各贡献一个计分音符；
- `Long` 贡献首尾两个 connection；
- `Slide` 贡献两个端点，以及所有不携带 `hidden` 属性的中间 connection；
- `BPM` 控制 beat 到秒的积分；
- 其他实体（包括 `System`）不计分并被忽略；
- 只要存在 `skill` 属性就视为技能触发，即使值是 `false`。

音符按 beat 排序，同 beat 时触发音符优先。输出使用 finite、非负的 JavaScript-number 秒数和连续 note ID。每曲必须严格有六个技能触发。难度和 `playLevel` 来自原始 song master；等级 5 也是合法输入。

## Bestdori 兼容计分

转成整数分数之前，所有运算都采用兼容 JavaScript `Number` 的 IEEE-754 binary64 行为：

```text
playLevelRate = 1 + (playLevel - 5) / 100
baseScorePerNote = deckTotalParameter * playLevelRate / noteCount * 3

innerScore(PERFECT) = floor(baseScorePerNote * 1.1 * comboRate)
innerScore(GREAT)   = floor(baseScorePerNote * 0.8 * comboRate)

finalNoteScore = floor(innerScore * combinedSkillMultiplier)
```

两次整数 floor 都属于契约。每条实际整数音符分必须能装入无符号 32 位值；非 finite、负数或溢出的中间结果会使计算失败，而不是回绕。由于模型只有 PERFECT 与 GREAT，combo 会跨三曲继承：

```text
combo <= 20    : 1.00
combo <= 50    : 1.01
combo <= 100   : 1.02
combo <= 300   : 1.01 + floor((combo - 1) / 50)  * 0.01
combo <= 3000  : 1.04 + floor((combo - 1) / 100) * 0.01
其他           : 1.34
```

`hhwx-medley-pg-expected-v1` 明确定义为仅含 PERFECT／GREAT 的期望分模型，排除 GOOD、BAD、MISS、断 combo、生命损失与生命继承。每条 P/G 分支先算出整数音符分，再求期望；不能在 floor 前塞入平均判定倍率。continued 与 PERFECT 叠层状态通过确定顺序的状态分布传播。

前五次技能把 `5! = 120` 种成员顺序全部按等概率处理；第六次固定再次使用成员索引 2，也就是 leader。单曲结果是 120 个 P/G 期望分按稳定顺序求均值，组曲目标是三曲均值之和。

新技能不作用于触发音符，也不作用于时间戳完全相同的其他音符。结束时间是 `triggerSeconds + durationSeconds + 0.00001`，与 Bestdori 计算边界一致。多个技能窗口重叠时，每个 active skill 独立推进状态，各自倍率差值直接相加，最后只 floor 一次：

```text
combinedSkillMultiplier = max(0, 1 + sum(skillMultiplier_i - 1))
```

这里没有替换、优先级或生命相关的重叠分支。

## 原生游戏差异记录

先前原生审计使用 JP 10.1.3 客户端、JP master artifact `20260805110509`，以及 SHA-256 为 `d98e76c0198a6a714be1d38e4696a044242c8384b905426a311c8c2b0961aebc` 的 skill-effect artifact。审计发现了以下差异，但它们刻意不进入这个 Bestdori 兼容计算器：

- 原生技能顺序采用有偏的 1,024 路径过程，前五人只有 96 种排列可达；当前计算器采用已确认的 120 种等概率排列；
- 原生计分链与 combo 来源使用单精度和 master table；当前计算器使用上文的 Bestdori JavaScript-number 公式；
- 原生游戏存在生命条件触发；当前计算器完全没有生命语义；
- 原生技能窗口时机和冲突处理属于逐帧／运行时行为；当前计算器采用 Bestdori 时间戳与直接叠加。

这些只属于来源记录，不是实现 TODO。若没有新的产品级语义决定与完整架构审查，任何原生差异都不得以局部“精度优化”的名义复制进计分器。

## 可执行证据与停线

保留的来源 fixture 是合成的 wiring golden，只有 15 张档案卡、原始 card／character／skill／song 记录、三支显式队伍和每曲 7 个音符。TypeScript 测试要求其规范化结果逐字段等于 Rust JSON fixture，随后 Rust 再严格校验并计算三首歌。第二个极小来源路径用例加入一个已拥有区域道具与规范活动行，证明非零原始 area/event 输入可以端到端进入计分器，而没有扩张到搜索。其他测试覆盖档案 RLE 损坏、Bestdori 中间等级还原、Cards 区服覆盖与 JP fallback、原始参数推导、谱面属性存在语义、卡牌复用、leader 第六次触发、continued 与叠层状态、combo 继承、两次 floor、120 顺序确定性，以及技能重叠直接相加。

参考计分器返回可审计 trace，其中包含 P/G 基础整数音符分、每个顺序的期望分、combo offset、状态峰值，以及浮点结果的精确 binary64 words。它优先可审查性，不追求搜索吞吐量。

固定队基础检查点本身保持不变。独立搜索检查点现在接受 `hhwx-medley-search-source-v1`：仍然使用同一份 HHWX 档案、原始 master、三首有序歌曲、活动行和 PERFECT 文本，但调用方不提供队伍、leader 或最终区域道具选择。它向独立 Rust 搜索输出完整规范化卡池和既有规则生成的已拥有道具配置。前端／API 接入仍不属于本检查点。
