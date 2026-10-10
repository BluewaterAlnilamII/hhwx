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
| `/events` | 活动摘要 ID map | 可选 `server=0..4` |
| `/events/{eventId}` | 单个活动详情 | 可选 `server=0..4` |

成功响应为 `{ "success": true, "data": ... }`。Map key 是正整数十进制 ID；member/support 的 ID 空间独立。卡及活动 ID 必须是无前导零的正安全整数。不提供 `all/main` 别名、目录详情、分页、语言选择或任意字段展开。

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
| `powerMax` | 原始 `{performance, technic, visual}`；成员为能力数值，留影为万分比（`3500` 显示为 `35.00%`）。不是计算后的最终战力，留影百分比不定义合计 |
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
| `effects` | `(SkillEffect \| SkillEffectByLevel)[]`，按来源顺序保留的效果，包含游戏原值及展开的条件、目标 |
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
type SkillEffectAtLevel = {
  skillEffectType: number;
  effectValue: number;
  effectExecuteLimitCount: number;
  effectExecuteLimitResetConditions: SkillConditionAtLevel[][];
  skillTargets: SkillTarget[];
  skillConditions: SkillConditionAtLevel[][];
  skillCumulativeCondition: {
    skillCumulativeConditionType: number;
    conditionValues: number[];
    conditionTargets: SkillTarget[];
    maxCumulativeCount: number;
  } | null;
  activationTimeSecond?: number;
  maxEffectValue?: number;
  effectLimitCount?: number;
  skillReleaseConditions?: SkillConditionAtLevel[][];
  skillTriggerType?: number;
  skillTriggerConditions?: SkillConditionAtLevel[][];
};
type SkillEffectByLevel = Record<"1" | "2" | "3" | "4" | "5", SkillEffectAtLevel | null>;
```

字段采用游戏元数据与客户端既有展开属性的名称，只统一为 camelCase；原数值及枚举码不改变。五级均存在的效果使用 SkillEffect，等级数值按原始等级 1–5 排列为五项数组，相同值也保持 `[2,2,2,2,2]`。每份有绑定效果的技能来源须有完整五级，各级效果项数可以不同。效果顺序不改变，相同类型的多项效果不会覆盖。`skillEffectType` 和目标筛选字段仍是标识对象的原标量。

某效果位置在部分等级缺失时，该项使用 SkillEffectByLevel，完整包含 `"1"`–`"5"` 五个 key；存在的等级保存完整 SkillEffectAtLevel，缺失等级为 JSON `null`，至少一项存在且至少一项缺失。单等级对象直接使用数值和 SkillConditionAtLevel 条件组，不再包含等级数组或映射。效果位置按各级原表顺序确定；有记录的零值不是缺失，非法字段和断开引用仍被拒绝。所有等级恢复记录时恢复普通 SkillEffect 形式。

2026-10-10 来源中的 gekisou/22 第二项效果在 1–4 级保留原值 2000 及完整记录，第 5 级缺失，因此 `effects[1]["5"]` 为 null。说明仍保留来源措辞；其缺值显示字符串 `"null"` 沿用既有规则，与结构化 JSON null 区分，不填回旧版的 20%。这不能证明当前游戏客户端的实际行为或运营方意图。

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

整个技能没有效果记录时输出 `effects: []`，仍保留名称并处理权威说明，不根据说明猜测或补造效果槽。2026-10-10 来源中的 gekisou/23、24 使用此形式；缺失引用及依赖它的表达式沿用替代文本，连续表达式可得到 `nullnull`，不猜选条件分支。上游补回记录后自然恢复正常效果。原本没有说明的预留头继续保留五个空说明槽和 `descriptionParameters: []`；未引用技能及原 None 效果也保留。已支持说明路径的空引用或越界沿用客户端指定的替代文本，未指定则保留字面文本 `null`。GekisouSupport 67（4–5 级）、72（2–5 级）保留这些结果，不修改条件。未知语法、未登记的实际目标筛选或已有记录的必要关联引用断开仍使构建失败。该目录描述游戏配置，不承诺完整模拟客户端，也不增加详情、等级或属性端点。

效果/模板格式始于 `ournotes-skills-v2`，当前包含 Events 的构建配方为 `ournotes-events-v1`，历史产物集合仍可验证。Skills 读取器不能读取旧逐等级正文产物。缺项兼容更新先部署同时接受完整和缺项效果的 Web，再部署后端；旧输入 bytes 不变，不改现有配方身份或覆盖旧产物。回滚须匹配读者与私有格式，旧 Web 不能读取按等级带 null 的效果。本地验证不代表生产已部署。

既有 `cardType` 整数对应以下官方名称，与 Skills 独立：

| 值 | 英文 | 简体中文 |
|---|---|---|
| 1 | Ruby | 绯红 |
| 2 | Azure | 绀碧 |
| 3 | Jade | 翡翠 |
| 4 | Amber | 琉金 |
| 5 | Violet | 紫苑 |

## Events

四个活动资源字段的区域差异由 backend 在私有包中保存为基础字符串与既有 `serverExtensions` 覆盖，Web 验证字符串类型并保留覆盖。仅字段实际不同时提供覆盖，空字符串有效；未开放服仍为 `null`，TW 与 `cn_intl` 共用资源值。发布顺序为先更新兼容旧空对象槽的 Web，再发布 backend `ournotes-events-api-v4` 产物。此变更不触发活动图片抓取或发布。

后端保存一份已确认第一方历史，生成最终摘要／详情 map。后续 master 缺少旧活动或区域时不删除已确认记录。Web 读取最终 map，验证消费结构、按服筛选并包装 HTTP 响应，不重建历史、关联 master 表或重复跨服一致性校验。

曲目、时间、活动奖励及四个活动资源字段统一取固定 `jp/en/tw/cn_intl/kr` 顺序中第一个历史存在槽的值作为基础值。无 `server` 时，记录始终提供五槽 `serverExtensions` 保存存在性和区域差异：`null` 表示不存在，`{}` 表示存在且沿用基础值，对象只提供有差异的 `startAt`、`endAt`、`displayEndAt`、`imageAsset`、`logoAsset`、`backgroundAsset`、`bannerAsset`、`musics` 或详情 `stories`、`pointRewards`、`pointLoopRewards`、`rankingRewards`。五槽全部存在且内容相同时，仍提供 `[{}, {}, {}, {}, {}]`。数组整体替换，不按 ID 合并。指定服时按存在性筛选，应用该槽覆盖，然后移除 `serverExtensions`；显式 `null` 时间、`[]` 集合及空资源字符串均覆盖基础值。本地化文本仍保留五槽。TW 与 `cn_intl` 共用记录和时间，繁中／简中文本分别保留。缺失文本为 `""`，缺失时间为 `null`，活动存在但集合真实为空为 `[]`。

Events 的所有时间字段统一为十进制字符串形式的 Unix 毫秒时间戳或 `null`，与 Bandori Events 的时间戳表示一致。Web 在核验原始包后，将私有 `yyyy/MM/dd HH:mm:ss` 字符串按 JST（UTC+9）解释并转换，不依赖宿主机时区。源时间为空时输出 `null`，非法日期使读取失败。例如 `2026/09/30 18:00:00` 转为 `"1790758800000"`。时间戳在各时区表示同一时刻，调用者按选定显示时区格式化。不增加原日期／ISO 伴随字段，也不推断开放或可用状态。

| 摘要字段 | 合同 |
|---|---|
| `eventType`、`eventName` | 原生枚举名称（`None`、`ChallengeLive`），未知码保留整数；五槽名称 |
| `startAt`、`endAt`、`displayEndAt` | 单值十进制字符串 Unix 毫秒时间戳或 `null`；区域差异使用 `serverExtensions` |
| `imageAsset`、`logoAsset`、`backgroundAsset`、`bannerAsset` | 基础值为首个存在服的原生资源字符串，差异放入 `serverExtensions`；保留空值，不提供媒体 URL 或可用性承诺 |
| `memberBonuses`、`supportBonuses` | 成员／留影的完整目标条件及 rank 1–5 配置百分比 |
| `effects` | 可选，仅保留无法在上述分组中无损表达的规则 |
| `musics` | 单个整数曲目 ID 数组，保留原顺序及重复 ID；区域差异使用 `serverExtensions` |
| `pickUpCards`、`rewardCards` | `{resourceType,resourceId}` 数组，活动 pickup 与实际积分奖励卡分别保留 |
| `serverExtensions` | 无筛选响应必带五槽存在性及覆盖；指定服时移除 |

`pickUpCards` 来自按 `_eventId` 关联的 `MasterEventPickUpCard`，每项保留卡牌资源种类及 ID，表达活动配置登记的 Pickup 引用，不声明抽卡概率或获取方式。`rewardCards` 是从实际积分奖励中提取并去重的成员／留影引用。两份列表可以重叠，也不能替代完整加成规则。`MemberCard` 关联 `/cards/member/{id}`，`SupportCard` 关联 `/cards/support/{id}`，两个 ID 空间独立。

`memberBonuses`、`supportBonuses` 是数组，组内按目标首次出现的顺序排列。每条保留完整的非零目标字段（`characterId`、`bandId`、`cardType`、`tagId`、`memberCardId`、`supportCardId`）和实际存在的加成字段；省略目标表示未指定该目标，多项条件始终留在同一条记录。成员／留影的 ID 空间保持独立。

| 原生加成类型 | 公开分组字段 |
|---|---|
| `0 = EventPoint` | `pointPercent` |
| `1 = EventItem` | `itemPercent` |
| `2 = ParameterAll` | `parameterPercent` |
| `3 = ParameterPfm` | `performancePercent` |
| `4 = ParameterTec` | `technicPercent` |
| `5 = ParameterVis` | `visualPercent` |

每个百分比字段都是 rank 1–5 的完整五项数值数组，与区域轴独立。使用原配置除以 100，不做显示取整：`[1500,1750,2000,2250,2500]` 变为 `[15,17.5,20,22.5,25]`，零值及负值仍保留。游戏的百分比展示会向下取整，调用者可在显示时对齐；这些数组不计算玩家最终积分、道具或战力。只输出实际存在的加成字段，不将不存在的规则填成五个零。

只有同一卡种、完整目标条件相同的规则才合并。当前目标行已经含有同种加成字段时新增一条记录，保留重复规则，不覆盖或求和。未知加成类型、成员／留影以外的资源种类，以及无法通过对 `percent * 100` 取最近整数恢复原值的配置，继续放在可选 `effects` 中，保留原始五项 `effectValue`、名称或未知整数形式的 `resourceTypeConstraint/eventBonusType` 和非零目标。一条规则只出现于一种表示；全部成功分组时省略 `effects`。两个分组数组始终提供，真实空组为 `[]`。ID、数量仍为原始整数，奖励中的资源 ID `0` 合法。记录不重复顶层活动 ID。

所有资源／奖励行的 `resourceType` 与加成的 `resourceTypeConstraint` 共用以下 `GameResourceType` 映射。`0` 没有已声明名称，保留整数。国际服额外项同样提供，共通编码不变。

| 码 | API 名称 | 码 | API 名称 |
|---|---|---|---|
| 1 | `Item` | 2 | `MemberCard` |
| 3 | `SupportCard` | 4 | `Voice` |
| 5 | `LoginBonus` | 6 | `Subscription` |
| 7 | `GachaPoint` | 8 | `Music` |
| 9 | `Stamp` | 10 | `PremiumPass` |
| 11 | `EventMedal` | 12 | `LiveLaneSkin` |
| 13 | `LiveNoteSkin` | 14 | `LiveNoteEffectSkin` |
| 15 | `LiveNoteSEGroup` | 16 | `VipPoint` |
| 17 | `Degree` | 18 | `Background` |
| 19 | `Spot` | 1001 | `BiliChatTheme` |
| 1002 | `BiliChatBubble` | 1003 | `BiliChatFrame` |

| 字段 | API 映射 |
|---|---|
| 加成 `cardType` | `1 = Ruby`、`2 = Azure`、`3 = Jade`、`4 = Amber`、`5 = Violet`；原 `0 = None` 表示未指定目标，省略 |
| 曲目 `musicType` | `0 = None`，同样的 `1..5 = Ruby/Azure/Jade/Amber/Violet`，`99 = All` |
| 曲目 `gekisouMission1/2/3` | `0 = None`、`1 = Combo`、`2 = Luck`、`3 = JustCount`、`4 = All` |

卡牌／曲目名称按明确约定使用原生 `Red/Blue/Green/Yellow/Purple` 的上述公开展示别名。两个枚举仍独立，只有 `LiveMusicType` 声明 `All = 99`。上述已知类型均在 HTTP 输出中映射，不在记录里重复提供数字／名称两份字段。

上述分组、精简、时间戳转换和枚举名称映射只在 HTTP 输出投影中完成：私有包继续保留整数码、原 `{musicId}` 摘要项、五槽曲目／时间／奖励、原始日期字符串、原加成数值及完整目标，Web 先核验原始包 hash 再投影响应。不更改后端构建配方、pointer schema 或已存对象；详情曲目对象仍保留 `musicId` 及其他字段。摘要按摘要表顺序输出；详情独立使用下表顺序，不再先输出完整摘要再追加详情字段。按服筛选应用覆盖并移除 `serverExtensions`，其余字段不重排。使用早期开发响应的调用者须将 `musics[服槽]`、时间槽和活动奖励槽访问改为单值／基础字段加扩展物化，或直接请求 `?server=n`。调用者按字段名读取；展示顺序不改变字段含义或数组元素顺序。

| 详情字段顺序 | 按序排列的字段 |
|---|---|
| 身份 | `eventType`、`eventName` |
| 时间 | `startAt`、`endAt`、`displayEndAt` |
| 关联引用 | `storyChapterId`、`eventItemId`、`musicId` |
| 排名配置 | `isRankingDisabled`、`isMusicRankingDisabled`、`isTotalMusicRankingDisabled` |
| 资源 | `imageAsset`、`logoAsset`、`backgroundAsset`、`bannerAsset` |
| 加成 | `memberBonuses`、`supportBonuses`、可选 `effects` |
| 卡牌引用 | `pickUpCards`、`rewardCards` |
| 挑战曲目 | `musics` |
| 活动奖励 | `pointRewards`、`pointLoopRewards`、`rankingRewards` |
| 剧情 | `stories` |
| 区域存在性／覆盖 | `serverExtensions`，无筛选时始终放在最后 |

摘要扩展类型按序允许 `startAt`、`endAt`、`displayEndAt`、`imageAsset`、`logoAsset`、`backgroundAsset`、`bannerAsset` 和整数数组形式的 `musics`。详情扩展类型额外允许 `pointRewards`、`pointLoopRewards`、`rankingRewards`、`stories`，其中 `musics` 使用完整曲目对象。扩展对象按上述字段顺序排列，省略未覆盖的字段。整个槽为 `null` 表示活动不存在；时间字段的 `null` 表示显式未设置时间，保留该字段，不表示删除字段。公开类型为兼容指定服后的响应保留可选扩展字段，无筛选记录仍始终提供五槽。

积分奖励项先输出 `point`，再输出 `resourceType/resourceId/resourceCount`；循环奖励项先输出 `loopStartEventPoint/loopEventPoint`；活动及歌曲排名奖励项先输出 `fromRank/toRank`。资源引用先类型后 ID，普通奖励最后增加数量。曲目项遵循下文曲目字段列表，排名奖励放最后。剧情项依次输出身份／编号／adv 引用、描述和时间、标记、解锁配置、资源、两组奖励。加成项先按上文顺序输出完整目标，再按 `pointPercent`、`itemPercent`、`parameterPercent`、`performancePercent`、`technicPercent`、`visualPercent` 排列实际存在的字段。省略可选字段时，不删除零值、false、null 或空数组。

详情保留摘要字段，曲目项使用完整结构，并增加：

| 详情字段 | 合同 |
|---|---|
| `storyChapterId`、`eventItemId`、`musicId` | 原生引用；活动主曲目与挑战集合分别表达 |
| `isRankingDisabled`、`isMusicRankingDisabled`、`isTotalMusicRankingDisabled` | 三个独立原生 bool，不表示排名 RPC 可用性 |
| `pointRewards` | 单个 `{point,resourceType,resourceId,resourceCount}` 数组；区域差异整体覆盖数组 |
| `pointLoopRewards` | 单个 `{loopStartEventPoint,loopEventPoint,resourceType,resourceId,resourceCount}` 数组；区域差异整体覆盖数组 |
| `rankingRewards` | 单个 `{fromRank,toRank,resourceType,resourceId,resourceCount}` 数组；区域差异整体覆盖数组 |
| `musics` | 单个挑战曲目数组，项结构如下；区域差异整体覆盖数组 |
| `stories` | 活动引用的剧情元数据，项结构如下 |

三组活动奖励继续分别保存为数组。区域比较包含每一条记录的门槛／排名区间、资源类型、ID、数量及原顺序，保留重复行、零数量及真实空数组；不使用其他来源的非空奖励替换空的基础数组。缺服仍在 `serverExtensions` 中标记为 `null`，不借用其他服奖励。仅覆盖有差异的那组集合。歌曲排名奖励及两组剧情奖励继续保留原位置。

曲目详情含 `musicId`、`challengeMusicId`、`musicType`、`gekisouMission1`、`gekisouMission2`、`gekisouMission3`、`startAt`、`endAt`、`musicRankingRewards`。三个激奏字段即使值为 `None` 也始终提供，位于 `data.musics[曲目下标]`，不在摘要的 ID 数组中。`None` 表示该挑战配置未指定激奏类型，不能据此判断曲目本身没有激奏玩法。时间为单值时间戳字符串或 `null`，空值不补成活动时间；歌曲排名奖励为与 `rankingRewards` 同字段的平面数组。区域比较覆盖完整曲目数组，包括挑战配置、时间及歌曲排名奖励，即使曲目 ID 相同也保留这些差异。曲目内部不增加区域轴、完整曲目目录或推导的成就字段。

剧情含 `episodeId`、`episodeNumber`、`advId`、五槽 `description`、单值时间戳字符串或 `null` 的 `startAt/endAt`、`unlockEpisodeNumber`、`eventPoint`、`characterId`、`characterRank`、`playerRank`、`bandRank`、`storyFriendshipEpisodeId`、`isAnotherEpisode`、`isExtraEpisode`、`banner`、`image`、`rewards`、`eventRewards`。剧情时间存在区域差异时，在活动的扩展中整体覆盖 `stories` 数组，本地化描述仍保留五槽。两组奖励独立保存 `{resourceType,resourceId,resourceCount}` 数组。这些是原生解锁配置及资源引用，不代表玩家解锁状态、剧情正文或可播放媒体。引用及零值、false、空值保留；内部关系 ID 和原始行不公开。

Events 通过 `ournotes/master/events-v1/api/active.json`（schema `ournotes-events-api-pointer-v3`）发现，仅消费 `events/eventDetails` 描述符及包。Web 校验 schema、generation、安全内容寻址 key、压缩／semantic hash、大小、数量和公开结构。producer 的 `revision`、`sourceIdentity`、master/history 来源及 `recentPackKeys` 由后端发布／验收负责；Web 不重算，也不要求 `datasets` 恰好只有两项。私有依赖不成为公开接口。reader 每包最多压缩 32 MiB、JSON 128 MiB、10,000 条记录，使用有界两项内容缓存及 15 秒读取期限。producer 容量独立；reader 放宽本身不会提高后端当前的 16 MiB pack 预算。

Events 不增加媒体提取、cutoff 抓取、数据库、locale/expand/page 查询或未确认的 Bandori 派生字段。列表只读摘要包，详情只读详情包，不单独缓存各服目录。两个视图由同一后端根固定，独立 HTTP 请求仍可能跨越一次新发布。

## 共享目录与图片

角色记录包含 `characterName[5]`、`shortName[5]`、`bandId`、`displayOrder`、`colorCode`；乐队记录包含 `bandName[5]`、`colorCode`。名称使用同一固定来源/语言映射，结构字段必须跨服一致。卡牌关联角色，角色关联乐队，不在卡牌中重复内嵌目录。

图片独立提供。`kind/assetId` 用于关联现有 `ournotes/cards/index.json`；这些 API 不返回图片 URL，也不读取图片 index。图片存在性不参与卡牌筛选、`serverExtensions` 或 API readiness。前端页面、新图片类别和数据库变更不在本轮范围。

## 错误与缓存

错误响应为 `{ "success": false, "error": { "code": "...", "message": "..." } }`，使用 `NO_STORE_HTTP_CACHE_POLICY`。

| 状态码 | 条件 |
|---|---|
| 400 | 未知、重复或非法查询参数；目录携带任何查询参数 |
| 404 | 未知卡种、非法 ID，或卡／活动不在请求视图中 |
| 503 | 配置/来源缺失、快照损坏、引用无效或数据冲突 |
| 500 | 未归类程序错误 |

成功响应复用 `SNAPSHOT_HTTP_CACHE_POLICY`：浏览器 `max-age=300, stale-while-revalidate=1800`；Cloudflare `max-age=1800, stale-while-revalidate=86400`。边缘缓存键必须区分卡牌／活动 `server` 查询。来源 pointer 的进程缓存为 60 秒；不可变对象使用有界缓存与并发请求合并，输入身份不变时复用聚合结果。TW/cn_intl 共用输入。独立请求不承诺跨服或主数据/图片原子切换。

## 服务端配置与验证

按 `.env.example` 配置仅服务端使用的私有 R2 只读凭据：`OURNOTES_R2_ENDPOINT`、`OURNOTES_PRIVATE_R2_BUCKET`、`OURNOTES_R2_ACCESS_KEY_ID`、`OURNOTES_R2_SECRET_ACCESS_KEY`。不回退 Bandori 凭据或公开 CDN。`OURNOTES_MASTER_LOCAL_STORE_ROOT` 仅用于开发/测试，生产拒绝启用。

Cards 固定各服 `ournotes/master/cards-v1/{server}/api/active.json`，直接验证自己的不可变 pack：schema、压缩 hash/size、semantic hash、解压限制和数量。角色/乐队/技能通过 `ournotes/master/{server}/active/manifest.json` 定位自己的 normalized 文件，分别验证压缩与解压后的字节 hash/size。两类 reader 均不限制 producer 配方修订或完整原始表/文件集合。共用层负责存储和有界内容缓存，Cards、catalogs、Skills 各自负责验证、合并和响应缓存；相同已验证数据内容可跨归档 generation 复用。Web 不下载原始 `MasterText`。

启用此 reader 前须先初始化通用 master 入口。既有 URL、字段及五槽语义保持不变；新增独立数据集无需修改既有 reader，实际依赖缺失或未知数据 schema 仍失败。Skills 读取失败不使 Cards、Characters、Bands 读取失败。

运行 `npm run test:ournotes-master` 检查小型本地 fixture、路由合同、损坏失败、五槽筛选与缓存复用。公共读取工具改动还需相关 Bandori 回归及 typecheck、lint、build。Fixture 仅保留带版本/hash 来源的选定元数据，不含完整 master 表或凭据。

Skills 首次启用前须先完成四服产物及签名回读；已有读者的缺项兼容更新则先升级 Web，再更新后端，并核验四服技能合并与实际 API。本数据集不要求更新既有 assets 消费者或媒体。主数据就绪独立于图片任务；离线检查不能替代生产验收。

Events 先确认后端最终根及两包，再启用 Web。现有测试命令覆盖最终字段、五槽历史筛选、错误 no-store、损坏拒绝、消费端容量和内容缓存刷新。仅修改 Events HTTP 投影时，用 `node --import tsx --test --test-name-pattern '^Events ' tests/ournotes-master-api.test.mjs` 选取相关用例，运行 typecheck 和改动模块的 lint，再将 dev 两路及服筛选与已发布包对照；该范围不要求完整 build 或无关测试组。部署后将两个 HTTP 路由及全部服筛选与准确已发布包对照，并验证边缘查询缓存。本轮不重跑后端历史／CAS／回滚／GC 测试，也不重建 master 或媒体输入。
