# OurNotes master API

[English](ournotes-master-api.md)

公开只读接口沿用 Bandori 的响应、私有快照读取与 HTTP 缓存规范，无需登录。`member/support` 是元数据术语，游戏将 support 卡显示为 snapshot。

## 路径与筛选

以下路径的共同前缀为 `/api/ournotes/master`。

| GET 路径 | `data` | 查询参数 |
|---|---|---|
| `/cards/member` | Member 摘要 ID map | 可选 `server=0..4` |
| `/cards/member/{cardId}` | 单张 member 详情 | 可选 `server=0..4` |
| `/cards/support` | Support 摘要 ID map | 可选 `server=0..4` |
| `/cards/support/{cardId}` | 单张 support 详情 | 可选 `server=0..4` |
| `/characters` | 共享角色 ID map | 无 |
| `/bands` | 共享乐队 ID map | 无 |
| `/skills` | 下述五种技能 ID map | 无 |

成功响应为 `{ "success": true, "data": ... }`。Map key 是正整数十进制 ID；member/support 的 ID 空间独立。卡 ID 必须是无前导零的正安全整数。不提供 `all/main` 别名、目录详情、分页、语言选择或任意字段展开。

无 `server` 时合并四个实际来源；指定唯一数字 `server` 时，只保留对应来源收录的卡并移除 `serverExtensions`。本地化字段和原始时间仍保留五槽。`characters/bands/skills` 是共享目录，拒绝查询参数。

| 槽位 / `server` | 公开身份 | 实际 master 来源 | 文本列 |
|---|---|---|---|
| 0 | `jp` | JP | `ja` |
| 1 | `en` | EN | `en` |
| 2 | `tw` | TW | `zh-TW` |
| 3 | `cn_intl` | TW | `zh-CN` |
| 4 | `kr` | KR | `ko` |

`cn_intl` 是 TW 数据的国际服简中视图，不是原生 CN 游戏服。2、3 两槽选择相同记录和时间，文本分别取繁中、简中。缺卡或缺译填 `""`，不跨语言、跨来源补缺；缺译不隐藏卡。未来原生 CN 来源需另行确定合同。

## 卡牌字段

| 摘要字段 | 含义 |
|---|---|
| `assetId` | 资源 ID；卡 ID 由列表 key 或详情 URL 提供，不在记录中重复。两种 ID 不可互相替代 |
| `rarity`、`cardType` | 原始整数码，不套用 Bandori 枚举 |
| `name` | 五个本地化字符串；support 始终提供，member 按下述规则可省略 |
| `startAt` | 五个原始 `_startAt` 字符串，不推断时区或当前开放状态 |
| `powerMax` | 原始 `{performance, technic, visual}`，不是计算后的最终战力 |
| `serverExtensions` | 仅无筛选响应：五槽 `{}` / `null`，表示来源 master 收录 / 未收录 |
| `characterId`、`subtitle` | 仅 member：单个角色、五槽副标题 |
| `characterIds`、`description` | 仅 support：有序角色 ID、五槽描述 |
| `leaderSkillId`、`liveSkillId`、`gekisouSkillId` | 仅 member：原始技能引用，详情同样提供 |
| `supportSkillId01`、`supportSkillId02`、`gekisouSupportSkillId01`、`gekisouSupportSkillId02` | 仅 support：保留原编号的技能引用，详情同样提供 |

只有所有已收录来源的 member `_nameTextID` 都与关联角色相同时，才省略 `name`；缺少整个字段时，通过 `characterId` 取 Characters 的 `characterName`。任一来源使用卡牌专属名称引用（例如舞台名），便保留完整五槽 `name`；其中的空槽仍为空，不自动回退角色名称。support 名称属于独立卡牌文本，包含多人名称，始终保留。卡牌存在性仍由 `serverExtensions` 或服筛选决定。

同 kind/ID 的非区域字段必须跨服一致；冲突时受影响读取失败，不静默优先取一服，也不预建字段覆盖注册表。允许某服未收录记录，但不能把必需来源读取失败当作缺卡。

列表和详情提供相同的顶层技能 ID 字段。未设置的引用仍为 `0`，support 编号槽不删除、不重排。非零 ID 通过 Skills 的对应类别关联，不在卡牌中复制技能记录。

详情包含摘要字段，并增加 `growth`：

| 字段 | Member | Support |
|---|---|---|
| `growth.level` | 等级行 | 等级行 |
| `growth.awake` | 觉醒行 | 不提供 |
| `growth.awakeResource` | 觉醒消耗行 | 不提供 |
| `growth.rank` | Member rank 行 | Support rank 行 |

成长行保留原顺序和数值，不自行换算百分比。可选空组为 `[]`，引用断裂则报错。每行仅含以下字段：

- Level：`level`、`exp`、`performanceRate`、`technicRate`、`visualRate`。
- Awake：`awakeCount`、`performanceRate`、`technicRate`、`visualRate`。
- Awake resource：`awakeCount`、`itemId`、`count`。
- Member rank：`rank`、`requiredRankUpItemCount`、`performanceRate`、`technicRate`、`visualRate`、`leaderSkillLevel`、`musicTypeBonusRate`、`musicTagBonusRate`。
- Support rank：`rank`、`limitLevel`、`requiredRankUpItemCount`、`supportSkill01Level`、`supportSkill02Level`、`gekisouSupportSkill01Level`、`gekisouSupportSkill02Level`、`cardTypeLinkBonusRate`。

列表不携带成长行或完整技能记录。原始 master 行、私有路径、来源描述符和凭据不进入公开响应。公开的 `startAt` 名称和顶层技能 ID 是 Web 投影；私有卡包 schema 及其 `startAtRaw`、`skills`、`id` 字段保持不变。

## 技能

`GET /api/ournotes/master/skills` 的 `data` 包含五个独立 ID map：`leader`、`live`、`gekisou`、`support`、`gekisouSupport`。不同类别可以有相同 ID；member 引用前三类，support 的编号引用对应后两类。记录不重复 ID 或 kind。

技能记录按下表顺序输出字段；不适用于该类别的字段省略。调用者按字段名读取。

| 字段 | 范围 / 含义 |
|---|---|
| `skillName` | 通过原始名称文本引用获得的五槽名称 |
| `description` | 五槽纯文本模板，使用普通编号占位符 `{n}` |
| `descriptionParameters` | 参数编号到五个显示字符串的数组，按等级 1–5 排列 |
| `effects` | 按来源顺序保留的效果，包含游戏原值及展开的条件、目标 |
| `skillIconId` | 原始整数图标 ID，不含图片 URL 或可用性保证 |
| `skillCategories` | 原始数组，仅 live、gekisou |
| `displaySkillCategories` | 原始数组，除 leader 外均提供 |
| `gekisouMissionType` | 原始整数，仅 gekisou、gekisouSupport |
| `gekisouSupportSkillExecTiming` | 原始整数，仅 gekisouSupport |

模板使用权威来源文本：JP-ja、EN-en、TW-zh-TW/zh-CN、KR-ko。后端处理游戏表达式和已识别的颜色标签，换行统一为 `\n`。五级相同的表达式结果直接写进模板；变化的结果保存为显示字符串数组，相同数组可跨语言槽共用。显示等级 `level` 时，将 `{n}` 替换成 `descriptionParameters[n][level - 1]`。Web 只组合槽位和重映射参数编号，不执行游戏表达式。缺译保持 `""`。

说明显示值与结构化数值分别保留。例如 support/1 的 `effects[0].effectValue` 仍为 `[250,500,750,1000,1500]`，原说明则显示 `["0.25","0.5","0.75","1","1.5"]`。格式化不改变游戏原值。等级切换为“JUST 激奏期间”等原生分支措辞也保存为显示参数。不增加单位、scale、precision、permanent 或 bonus 字段。

```ts
type LevelNumber = [number, number, number, number, number];
type SkillTarget = {
  skillTargetType: number;
  bandId?: number;
  cardType?: number;
  judgement?: number;
  liveMusicType?: number;
  gekisouMissionType?: number;
  liveSkillCategories?: number[];
};
type SkillConditionAtLevel = {
  conditionType: number;
  conditionValues: number[];
  conditionTargets: SkillTarget[];
  isPositive: boolean;
};
type SkillCondition = {
  conditionType: LevelNumber;
  conditionValues: LevelNumber[];
  conditionTargets: SkillTarget[];
  isPositive: boolean;
};
type ConditionGroup = SkillCondition[][];
type SkillEffect = {
  skillEffectType: number;
  effectValue: LevelNumber;
  effectExecuteLimitCount: LevelNumber;
  effectExecuteLimitResetConditions: ConditionGroup;
  skillTargets: SkillTarget[];
  skillConditions: ConditionGroup | Record<string, SkillConditionAtLevel[][]>;
  skillCumulativeCondition: {
    skillCumulativeConditionType: LevelNumber;
    conditionValues: LevelNumber[];
    conditionTargets: SkillTarget[];
    maxCumulativeCount: LevelNumber;
  } | null;
  activationTimeSecond?: LevelNumber;
  maxEffectValue?: LevelNumber;
  effectLimitCount?: LevelNumber;
  skillReleaseConditions?: ConditionGroup | Record<string, SkillConditionAtLevel[][]>;
  skillTriggerType?: LevelNumber;
  skillTriggerConditions?: ConditionGroup;
};
```

字段采用游戏元数据与客户端既有展开属性的名称，只统一为 camelCase；原数值及枚举码不改变。等级数值固定按原始等级 1–5 排列为五项数组，相同值也保持 `[2,2,2,2,2]`。每份来源须有完整五级且每级效果项数相同，不重复输出等级列表。效果顺序不改变，相同类型的多项效果不会覆盖。`skillEffectType` 和目标筛选字段仍是标识对象的原标量。

Leader 效果不输出 timing/release 字段；其余类别提供 `activationTimeSecond`、`maxEffectValue`、`effectLimitCount`、`skillReleaseConditions`。Gekisou、support、gekisouSupport 还提供 `skillTriggerType` 和 `skillTriggerConditions`，live 没有这两项。原零值效果、空关系和 null 累计关系均保留。

### 效果字段的职责

下表解释游戏已有字段；不改变上面的字段名称、类型、适用类别或原值。数值数组均按技能等级 1–5 取对应项。

| 字段 | 含义与零值、空值 |
|---|---|
| `skillEffectType` | 效果种类，决定如何解释数值及作用对象；原编码见下表。`0` 是游戏的 `None`，仍保留原记录 |
| `effectValue` | 该效果的原始幅度、增量或结果编码，由效果类型决定。例如 `15000` 保存延长的毫秒数。`0` 不表示效果不存在：`13005` 的转换为 JUST 行为由类型决定 |
| `activationTimeSecond` | 本项效果自身的执行时长，原单位为秒。正值是配置时长；`0` 没有正时长计时限制，具体行为还取决于触发、解除条件和效果类型，不能统一解释成永久。它与 `15000` 的延长量是不同配置 |
| `maxEffectValue` | 使用幅度上限的效果的原始上限，典型用途是累计得分提升的封顶值；与该效果的 `effectValue` 使用相同原始数值表示。`0` 在当前目录中未配置这项额外上限，不能把原 `effectValue` 截成零 |
| `effectLimitCount` | 一次效果生效期间可消耗的作用次数。例如激奏 COMBO 保护可作用三次。`0` 未设置这项次数限制；它不是允许发动多少次效果 |
| `effectExecuteLimitCount` | 同一效果允许执行的次数，作用于执行计数。正值限制执行次数，配置的重置条件可重置计数；`0` 不设这项执行次数上限。与 `effectLimitCount`、`maxCumulativeCount` 分别保留 |
| `effectExecuteLimitResetConditions` | 重置上述执行计数的条件组。例如激奏区间开始或完成。`[]` 表示没有配置额外重置条件，不表示重置事件已经发生 |
| `skillTargets` | 效果本身的显式目标筛选。`[]` 表示没有显式筛选，实际对象由效果类型及所属技能决定；不能据空数组推断作用于全队。`15000` 作用于装配该辅助技能的成员 |
| `skillConditions` | 效果生效所需的资格条件，例如 LIFE 门槛、编队条件或装配成员归属。`[]` 表示没有附加资格条件，仍受技能发动及其他配置约束 |
| `skillTriggerType` | 按事件执行或持续检查的方式。当前实际值为 `1 = OneShot`、`2 = Sustained`，见下表 |
| `skillTriggerConditions` | 条件型技能的触发条件，例如自己的演出技能发动、激奏区间开始或指定判定次数。`[]` 仅表示未配置触发条件，不提供新的默认触发事件 |
| `skillReleaseConditions` | 效果解除条件，例如激奏区间完成。`[]` 表示没有额外解除条件；时长、作用次数及所属技能生命周期仍可结束效果 |
| `skillCumulativeCondition` | 累计机制的配置。非 null 时定义累计什么、以什么数值条件累计，以及最多累计几次；`null` 表示没有该累计配置 |

### 条件、累计与目标字段的含义

| 字段 | 含义与空值 |
|---|---|
| `conditionType` | 条件种类，决定本项检查及参数含义；原编码见下表 |
| `conditionValues` | 条件所用的原数值参数，保留位置顺序。例如 LIFE 门槛、判定次数或每 N 次累计中的 N。`[]` 表示该条件不需要额外数值参数；不能理解成条件缺失。五级数值组织仍遵循下面的数组轴规则 |
| `conditionTargets` | 本项条件所检查的显式目标筛选，与效果的 `skillTargets` 是不同职责。`[]` 表示无额外筛选，检查对象由条件类型决定；例如 `4010` 已指定装配成员自己的演出技能 |
| `isPositive` | `true` 要求该项条件检查为真，`false` 要求为假。取反作用于完整条件检查；对“编队全部成员符合目标”的取反是“并非全部符合”，不能改成“全部不符合” |
| `skillCumulativeConditionType` | 累计方式，例如指定判定每 N 次、符合目标的编队成员每 N 人、每 N 种乐队或属性；原编码见下表 |
| `maxCumulativeCount` | 原累计次数上限，独立于效果执行次数和作用次数。保留 `4`、`5`、`999999` 等原配置，不将大数改成无限标志 |
| `skillTargetType` | 目标筛选种类。当前实际值为 `3 = Member`、`4 = Judgement`、`5 = GekisouMission` |
| `bandId` | 乐队 ID，通过 Bands 目录关联乐队名称；例如 `2` 对应 Ave Mujica。不是技能 ID，也不是技能等级 |
| `cardType` | 成员属性筛选，沿用下方 CardType 的原整数码 |
| `judgement` | 原判定筛选码：`1 = Miss`、`2 = Bad`、`3 = Good`、`4 = Great`、`5 = Perfect`、`6 = Just`。不能套用其他模拟器的枚举顺序 |
| `liveMusicType` | 乐曲属性筛选，来自游戏 `LiveMusicType`；当前目标实际使用 `1 = Red`。与演出模式、乐队及判定字段分别保留 |
| `gekisouMissionType` | 激奏类型筛选：`1 = Combo`、`2 = Luck`、`3 = JustCount`，对应 COMBO、LUCK、JUST 激奏 |
| `liveSkillCategories` | 演出技能分类筛选数组，来自游戏 `SkillCategory`：`1 = Score`、`2 = Life`、`3 = Judgement`，对应得分、LIFE、判定类。不是 `displaySkillCategories` |

### 当前实际使用的游戏编码

以下是 2026-10-01 已验证目录中实际出现的编码及游戏枚举名，不是游戏全部枚举的预先扩展。编码含义来自元数据和对应行为，API 不重编号，也不增加枚举名称字段。

| `skillTriggerType` | 游戏枚举 | 含义 |
|---|---|---|
| 1 | `OneShot` | 每次触发事件执行一次效果。效果可以在执行后持续一段时间；全曲次数由执行次数限制及重置条件决定 |
| 2 | `Sustained` | 在配置的触发条件持续满足时维护效果；仍遵循资格条件、时长及解除条件 |

| `skillEffectType` | 游戏枚举 | 含义 |
|---|---|---|
| 0 | `None` | 无效果类型的原记录 |
| 1000 | `BPMemberAllParameterUp` | 成员全部能力值提升 |
| 1001 | `BPMemberTechniqueUp` | 成员技巧提升 |
| 1002 | `BPMemberVisualUp` | 成员形象提升 |
| 1003 | `BPMemberPerformanceUp` | 成员表演提升 |
| 1503 | `BPCumulativeMemberPerformanceUp` | 当前记录提升持有 LUCK 类型激奏技能的成员的表演；这些记录的 `skillCumulativeCondition` 为 null，不能仅凭枚举名补造累计配置 |
| 2000 | `BPNoteScoreFactorUp` | 音符得分提升 |
| 2001 | `BPCumulativeNoteScoreFactorUp` | 累计音符得分提升 |
| 2004 | `BPTargetJudgementNoteScoreFactorUp` | 指定判定的音符得分提升 |
| 3001 | `IntLifeRecoveryFixed` | 固定数值 LIFE 回复 |
| 3003 | `LifeGuard` | LIFE 保护 |
| 3004 | `LifeDamageReductionPercent` | LIFE 损失减轻 |
| 4004 | `BPJudgementRelaxPercentGreaterEquals` | 扩大指定判定及以上的判定范围 |
| 11001 | `BPGekisouLuckGaugeFactorUp` | 提升 LUCK 抽选条累积倍率 |
| 11002 | `IntAddGekisouLuckPoint` | 增加 LUCK 点数 |
| 11003 | `BPGekisouLuckGaugePercentUp` | 按比例增加 LUCK 抽选条 |
| 11005 | `GekisouLuckMinimumResult` | LUCK 抽选结果保底 |
| 12000 | `IntGekisouComboBonusUp` | 增加激奏 COMBO |
| 12004 | `GekisouComboProtect` | 保护激奏 COMBO 不因指定判定而重置 |
| 12006 | `TargetJudgementConvert` | 将指定判定转换为原 `effectValue` 指定的判定 |
| 13000 | `IntJustCountBonusUp` | 增加 JUST 获得量 |
| 13002 | `IntCumulativeJustCountBonusUp` | 累计增加 JUST 获得量 |
| 13005 | `NoteJudgementConvertToJust` | 将目标判定转换为 JUST；转换结果由类型确定 |
| 15000 | `MSLiveSkillDurationExtension` | 延长装配成员自己的演出技能时长 |

游戏 `BP` 数值使用万分比编码，例如原值 `10000` 对应说明中的 `100%`；`Int` 类型保留原整数增量。`15000` 的原值是毫秒，例如 `1250` 对应说明中的 `1.25` 秒。`12006` 使用原判定码，例如 `5` 是 PERFECT；`11005` 当前使用的原结果码 `2`、`3` 分别是 LUCKY、SUPER LUCKY，不替换成客户端内部结果枚举。完整游戏说明的舍入与措辞由 `description` 和 `descriptionParameters` 提供。`3004` 的当前原值 `2000` 对应说明中的 `20%`。这些解释不改变结构化值，也不增加单位或换算字段。

| `conditionType` | 游戏枚举 | 检查内容 |
|---|---|---|
| 1030 | `NoteJudgementTargetCount` | 指定目标判定达到配置次数 |
| 2001 | `LifeGreaterEqual` | LIFE 大于等于配置值 |
| 2003 | `LifeLessEqual` | LIFE 小于等于配置值 |
| 3000 | `FormationMemberTargetAny` | 编队中至少一名成员符合目标 |
| 3001 | `FormationMemberTargetAll` | 编队全部成员符合目标 |
| 4010 | `SameMemberLiveSkillActivated` | 装配成员自己的演出技能发动 |
| 4011 | `ProbabilityExecute` | 按配置的百分数概率检查执行，例如原值 `10` 表示 `10%`；不是 BP 万分比 |
| 4012 | `PlayTargetMusicType` | 演奏符合目标属性的乐曲 |
| 5000 | `SnapMemberTarget` | 装配辅助技能的成员符合目标 |
| 7000 | `GekisouLuckLotResult` | LUCK 抽选结果符合配置 |
| 7005 | `GekisouComboCountGreaterEqual` | 激奏 COMBO 大于等于配置次数 |
| 7010 | `GekisouRangeStart` | 对应激奏区间开始 |
| 7013 | `GekisouRangeComplete` | 激奏区间完成 |
| 7020 | `GekisouRangePlaying` | 正在对应激奏区间中 |
| 7021 | `GekisouLuckRushPlaying` | 正在 LUCK RUSH 中 |
| 8000 | `ScoreRankUp` | 得分评级提升 |

| `skillCumulativeConditionType` | 游戏枚举 | 累计内容 |
|---|---|---|
| 1000 | `NoteJudgementTargetEqualsPerN` | 指定目标判定每 N 次累计一次 |
| 3000 | `FormationMemberTargetMemberPerN` | 编队中符合目标的成员每 N 人累计一次 |
| 3004 | `FormationMemberBandPerN` | 编队中每 N 种乐队累计一次，按乐队种类计数 |
| 3005 | `FormationMemberMemberTypePerN` | 编队中每 N 种成员属性累计一次，按属性种类计数 |
| 7001 | `GekisouComboPerN` | 激奏 COMBO 每 N 次累计一次 |

以 `support/12` 为例，两条 `15000` 效果的资格条件都是 `5000`，目标为 `skillTargetType: 3, bandId: 2`。第一条 `isPositive: false` 适用于非 Ave Mujica 成员，第二条 `true` 适用于 Ave Mujica 成员，两者互斥。两条都由 `4010` 触发，采用 `OneShot`。1 级分别延长 `1250` / `2500` 毫秒，5 级分别延长 `2500` / `5000` 毫秒，选择符合条件的一条，不相加。其 `activationTimeSecond: 0` 未另设本项辅助效果的正时长，`effectExecuteLimitCount: 0` 未限制执行次数，空目标筛选仍由 `15000` 指定装配成员。

同为 `activationTimeSecond: 0`，gekisou/2 的 5 级则采用 `Sustained` 和“正在 JUST 激奏”的条件，在对应区间持续作用。gekisouSupport/86 的 `effectLimitCount: 3` 表示一次生效期间保护三次 COMBO；gekisouSupport/76 的 `effectExecuteLimitCount: 4` 表示最多执行四次转换，并在配置的激奏开始条件下重置。它们不能归并为同一种次数或“永久”规则。

条件组保留原外层 OR、内层 AND 顺序与 `isPositive`。`conditionValues: [[10,20,30,40,60]]` 的外层仍是原条件值位置，内层才是等级轴。原条件结构或顺序跨等级变化时，`skillConditions` 或 `skillReleaseConditions` 使用 `"1"` 至 `"5"` 的完整条件组 map，内部保留该级的原始数值。GekisouSupport/67、72 的 `skillConditions` 需要这种形式；JP 1.0.4 新增的 gekisou/22 则是 `skillReleaseConditions` 在 1–4 级为空、5 级具有类型 7013 的释放条件。其他字段没有覆盖 map。目标保留实际使用的筛选，省略 `judgement=-1` 等无关默认值；不添加未使用的角色、标签或激奏分类筛选。

实际存在的同 ID 来源间，只比较共享图标、分类、时机字段与投影后的 effects；名称、模板、显示参数允许不同。允许某服缺少某 ID。不比较原始行、关联 ID、版本、hash，也不额外比较第二份等级集合。已校验输入身份不变时，复用既有合并缓存。

没有效果且权威说明为空的预留头保留 `effects: []`、五个空说明槽和 `descriptionParameters: []`；未引用技能及原 None 效果也保留。已支持说明路径的空引用或越界沿用客户端指定的替代文本，未指定则保留字面文本 `null`。GekisouSupport 67（4–5 级）、72（2–5 级）保留这些结果，不修改条件。未知语法、未登记的实际目标筛选或必需记录缺失使构建失败。该目录描述游戏配置，不承诺完整模拟客户端，也不增加详情、等级或属性端点。

构建配方为 `ournotes-skills-v2`，历史产物集合仍可验证。Skills 读取器要求私有效果/模板格式，不能读取旧逐等级正文产物。先发布四服新 generation 并验证签名私有回读，再部署 Web；回滚也须匹配读者与私有格式。本地验证不代表生产已部署。

既有 `cardType` 整数对应以下官方名称，与 Skills 独立：

| 值 | 英文 | 简体中文 |
|---|---|---|
| 1 | Ruby | 绯红 |
| 2 | Azure | 绀碧 |
| 3 | Jade | 翡翠 |
| 4 | Amber | 琉金 |
| 5 | Violet | 紫苑 |

## 共享目录与图片

角色记录包含 `characterName[5]`、`shortName[5]`、`bandId`、`displayOrder`、`colorCode`；乐队记录包含 `bandName[5]`、`colorCode`。名称使用同一固定来源/语言映射，结构字段必须跨服一致。卡牌关联角色，角色关联乐队，不在卡牌中重复内嵌目录。

图片独立提供。`kind/assetId` 用于关联现有 `ournotes/cards/index.json`；这些 API 不返回图片 URL，也不读取图片 index。图片存在性不参与卡牌筛选、`serverExtensions` 或 API readiness。前端页面、新图片类别和数据库变更不在本轮范围。

## 错误与缓存

错误响应为 `{ "success": false, "error": { "code": "...", "message": "..." } }`，使用 `NO_STORE_HTTP_CACHE_POLICY`。

| 状态码 | 条件 |
|---|---|
| 400 | 未知、重复或非法查询参数；目录携带任何查询参数 |
| 404 | 未知卡种、非法 ID，或卡不在请求视图中 |
| 503 | 配置/来源缺失、快照损坏、引用无效或数据冲突 |
| 500 | 未归类程序错误 |

成功响应复用 `SNAPSHOT_HTTP_CACHE_POLICY`：浏览器 `max-age=300, stale-while-revalidate=1800`；Cloudflare `max-age=1800, stale-while-revalidate=86400`。边缘缓存键必须区分卡牌 `server` 查询。来源 pointer 的进程缓存为 60 秒；不可变对象使用有界缓存与并发请求合并，输入身份不变时复用聚合结果。TW/cn_intl 共用输入。独立请求不承诺跨服或主数据/图片原子切换。

## 服务端配置与验证

按 `.env.example` 配置仅服务端使用的私有 R2 只读凭据：`OURNOTES_R2_ENDPOINT`、`OURNOTES_PRIVATE_R2_BUCKET`、`OURNOTES_R2_ACCESS_KEY_ID`、`OURNOTES_R2_SECRET_ACCESS_KEY`。不回退 Bandori 凭据或公开 CDN。`OURNOTES_MASTER_LOCAL_STORE_ROOT` 仅用于开发/测试，生产拒绝启用。

Cards 固定各服 `ournotes/master/cards-v1/{server}/api/active.json`，直接验证自己的不可变 pack：schema、压缩 hash/size、semantic hash、解压限制和数量。角色/乐队/技能通过 `ournotes/master/{server}/active/manifest.json` 定位自己的 normalized 文件，分别验证压缩与解压后的字节 hash/size。两类 reader 均不限制 producer 配方修订或完整原始表/文件集合。共用层负责存储和有界内容缓存，Cards、catalogs、Skills 各自负责验证、合并和响应缓存；相同已验证数据内容可跨归档 generation 复用。Web 不下载原始 `MasterText`。

启用此 reader 前须先初始化通用 master 入口。既有 URL、字段及五槽语义保持不变；新增独立数据集无需修改既有 reader，实际依赖缺失或未知数据 schema 仍失败。Skills 读取失败不使 Cards、Characters、Bands 读取失败。

运行 `npm run test:ournotes-master` 检查小型本地 fixture、路由合同、损坏失败、五槽筛选与缓存复用。公共读取工具改动还需相关 Bandori 回归及 typecheck、lint、build。Fixture 仅保留带版本/hash 来源的选定元数据，不含完整 master 表或凭据。

Skills 先发布四服已验收产物并完成签名回读，最后启用 Web。本数据集不要求更新既有 assets 消费者或媒体。核实七路响应、区分卡牌查询的边缘缓存和错误 no-store。主数据就绪独立于图片任务；离线检查不能替代生产验收。
