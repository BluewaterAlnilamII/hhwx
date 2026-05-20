# 组队搜索验证与性能对比

本文档记录 HHWX 单曲组队搜索的当前验证结果、和 Bestdori 兼容基线的性能对比，以及发布前剩余风险。

## 验证基线

本地验证脚本：

```powershell
node temp\bandori-team-builder\validate-bestdori-hhwx-scoring.cjs
```

Supabase 真实卡池主矩阵：

```powershell
$env:HHWX_VALIDATE_INCLUDE_SUPABASE='1'
$env:HHWX_VALIDATE_SUPABASE_PROFILE_LIMIT='12'
node temp\bandori-team-builder\validate-bestdori-hhwx-scoring.cjs
```

最新通过报告：

- `temp/bandori-team-builder/fix-pass2-fixed-report.json`
- `temp/bandori-team-builder/fix-pass2-supabase-main-report.json`

## 当前结论

Supabase 主矩阵最新结果：

| 指标 | 值 |
| --- | ---: |
| caseCount | 46 |
| supabaseProfileCount | 10 |
| failureCount | 0 |
| strictFailureCount | 0 |
| fixedScoringFailureCount | 0 |
| searchWorseThanBaselineCount | 0 |
| boundedCount | 0 |
| eventPointOptionsFailureCount | 0 |
| uiDisplaySwitchFailureCount | 0 |
| performanceGateFailureCount | 0 |
| productionReady | true |

这表示：

- 固定队伍评分与兼容基线整数一致。
- HHWX exact 搜索结果不劣于兼容基线。
- 没有 bounded 结果。
- 活动 PT 结果后切换字段通过验证。
- 任务活动支援队伍通过真实卡池验证。

## 最新性能数据

以下数据来自 `fix-pass2-supabase-main-report.json`。时间单位为毫秒。

| 场景 | HHWX max | 兼容基线 max | 约提升 |
| --- | ---: | ---: | ---: |
| 1329 卡池，595 expert，无活动 | 1613 | 9638 | 6.0x |
| 1889 卡池，686 expert，无活动 | 2061 | 11753 | 5.7x |
| 1889 卡池，306 challenge | 1857 | 8238 | 4.4x |
| 1889 卡池，307 mission multi | 7922 | 89377 | 11.3x |
| 1889 卡池，versus 展示 | 1915 | 12251 | 6.4x |
| 1889 卡池，festival 展示 | 2356 | 12936 | 5.5x |
| Supabase 抽样 free perfect | 2440 | 24640 | 10.1x |
| Supabase 抽样 free perfect 95% | 2291 | 19707 | 8.6x |
| Supabase 抽样 challenge 306 | 1901 | 10903 | 5.7x |
| Supabase 抽样 mission 307 multi | 8106 | 90351 | 11.1x |

Supabase 抽样均值：

| 场景 | HHWX avg | 兼容基线 avg |
| --- | ---: | ---: |
| free perfect | 1385 | 8570 |
| free perfect 95% | 1281 | 7888 |
| challenge 306 | 1159 | 6012 |
| mission 307 multi | 4558 | 45415 |

## 与 Bestdori 算法的差异

本项目保留了一个本地 Bestdori-compatible 基线，用于回归测试和性能对照。它绑定当前网页资源 hash，并复刻网页端核心计算口径。

Bestdori Team Builder 的主要特点：

- 使用启发式搜索和剪枝，速度通常可接受，但不提供 exact 证明。
- 技能估值历史上以 `skillId + skillLevel` 一类无上下文 key 作为核心缓存，无法天然表达同团、同属性等完整队伍上下文。
- 对条件技能可能产生高估或低估。例如某些同团技能在混队中不应触发高倍率，但无上下文估值可能仍按高倍率参与优化。
- 支援队伍、协力房间分和活动 PT 的展示口径可作为兼容参考，但搜索策略不能作为 exact 依据。

HHWX 当前算法的差异：

- 完整枚举合法搜索空间，并只用安全上界剪枝。
- 完整五卡确定后重新解析技能上下文。
- 支援队伍纳入 exact 目标和上界。
- 区域道具按全局配置枚举，而不是逐 group 独立最大化。
- 协力 LIVE 使用 raw average score 参与 roomScore，避免 1 分取整差异。
- 结果明确返回 `exact` 或 `bounded`，不会把未证明结果标成最优。

因此，HHWX 的目标不是复刻 Bestdori 的搜索启发式，而是在相同公式口径下提供可证明 exact 的搜索结果。兼容基线只作为公式和性能对照。

## 最近修复记录

### 协力 roomScore 取整

问题：部分任务协力样本中 `roomScore` 与兼容基线差 1。

原因：先对自己的平均分取整，再加房间分；正确口径应使用未取整平均分加房间分后整体 `floor`。

修复：在评分结果中保留 `rawAverageScore`，用于 `roomScore` 和活动 PT 内部计算；展示分数仍使用整数。

### 上下文技能基线误差

问题：某个真实卡池中兼容基线 top 队伍比 HHWX 高 10 PT。

原因：该队伍包含同团条件技能，但实际队伍为混队。兼容基线沿用无上下文技能估值，高估了该队伍。

处理：验证脚本识别此类已知上下文技能 mismatch，并用 HHWX 精确公式重算基线队伍后再比较搜索结果。重算后 HHWX 与基线队伍目标值相同，搜索不劣。

## 发布门禁

发布前必须通过：

```powershell
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
node temp\bandori-team-builder\validate-bestdori-hhwx-scoring.cjs
```

并至少跑一次 Supabase 主矩阵：

```powershell
$env:HHWX_VALIDATE_INCLUDE_SUPABASE='1'
$env:HHWX_VALIDATE_SUPABASE_PROFILE_LIMIT='12'
node temp\bandori-team-builder\validate-bestdori-hhwx-scoring.cjs
```

阻断条件：

- `assetGate.ok !== true`
- `strictFailureCount > 0`
- `fixedScoringFailureCount > 0`
- `searchWorseThanBaselineCount > 0`
- `boundedCount > 0`
- `eventPointOptionsFailureCount > 0`
- `uiDisplaySwitchFailureCount > 0`
- `performanceGateFailureCount > 0`
- `productionReady !== true`

## 剩余风险

- Supabase 长矩阵曾因网络 `fetch failed / ECONNABORTED` 中断；这是验证环境稳定性问题，不是算法失败，但发布前应补一次完整长矩阵。
- 2000+ 全卡模拟池仍需要定期跑压力测试，确认 exact 不退化。
- Medley 是独立搜索问题，不由本文档的单曲 exact 证明覆盖。
