# OurNotes master API

[简体中文](ournotes-master-api.zh-CN.md)

These public, read-only routes follow the existing Bandori response, private snapshot reader and HTTP cache conventions. No login is required. `member` and `support` are metadata terms; the game displays support cards as snapshots.

## Routes and selection

All paths below start with `/api/ournotes/master`.

| GET path | `data` | Query |
|---|---|---|
| `/cards/member` | Member summary ID map | Optional `server=0..4` |
| `/cards/member/{cardId}` | One member detail | Optional `server=0..4` |
| `/cards/support` | Support summary ID map | Optional `server=0..4` |
| `/cards/support/{cardId}` | One support detail | Optional `server=0..4` |
| `/characters` | Shared character ID map | None |
| `/bands` | Shared band ID map | None |
| `/skills` | Five skill-kind ID maps, described below | None |
| `/events` | Event summary ID map | Optional `server=0..4` |
| `/events/{eventId}` | One event detail | Optional `server=0..4` |
| `/music` | Music summary ID map | Optional `server=0..4` |
| `/music/{musicId}` | One music detail | Optional `server=0..4` |

Success uses `{ "success": true, "data": ... }`. Map keys are positive decimal IDs. Member and support IDs are separate namespaces. Card, event and music IDs must be positive safe integers without leading zeros. There are no `all`/`main` aliases, directory details, pagination, language selectors or arbitrary field expansion.

Without `server`, cards merge all four actual sources. With exactly one numeric `server`, only cards present in that source remain, and `serverExtensions` is removed. Localized fields and raw times retain all five slots. `characters`, `bands` and `skills` remain shared catalogs and reject queries.

| Slot / `server` | Public identity | Actual master source | Text column |
|---|---|---|---|
| 0 | `jp` | JP | `ja` |
| 1 | `en` | EN | `en` |
| 2 | `tw` | TW | `zh-TW` |
| 3 | `cn_intl` | TW | `zh-CN` |
| 4 | `kr` | KR | `ko` |

`cn_intl` is the international Simplified Chinese view of TW, not a native CN game server. Slots 2 and 3 select the same records and times, with separate text columns. Missing records or translations produce `""` text slots; there is no cross-language or cross-source fallback. Missing translation does not hide a card. A future native CN source requires an explicit contract decision.

## Card fields

| Summary field | Meaning |
|---|---|
| `assetId` | Asset ID; the card ID comes from the map key or detail URL and is not repeated in the record. Do not substitute one ID for the other |
| `rarity`, `cardType` | Original integer codes, without Bandori enum conversion |
| `name` | Five localized strings; always present for support, optional for member as described below |
| `startAt` | Five original `_startAt` strings; no inferred time zone or release availability |
| `powerMax` | Original `{performance, technic, visual}` values; Member uses additive power, Snapshot uses basis points (`3500` displays as `35.00%`). Not a computed final power; no total is defined for Snapshot percentages |
| `serverExtensions` | Unfiltered responses only: five `{}` / `null` slots for master presence / absence |
| `characterId`, `subtitle` | Member only: one character and five subtitle strings |
| `characterIds`, `description` | Support only: ordered character IDs and five description strings |
| `leaderSkillId`, `liveSkillId`, `gekisouSkillId` | Member only: original skill references, also present in details |
| `supportSkillId01`, `supportSkillId02`, `gekisouSupportSkillId01`, `gekisouSupportSkillId02` | Support only: original numbered skill references, also present in details |

Member `name` is omitted only when every present source uses the same `_nameTextID` as its referenced character. When absent, resolve `characterId` through Characters and use `characterName`. If any source uses a card-specific name reference (for example a stage name), retain all five `name` slots; an empty slot stays empty and does not fall back to the character name. Support names are independent card text and are always retained, including multi-character names. Card presence still comes from `serverExtensions` or server selection.

Nonregional fields must agree across records with the same kind/ID. Conflicts fail the affected read instead of silently selecting one source. There is no speculative field override registry. Missing source records are allowed; failure to read a required source is not treated as absence.

Lists and details contain the same top-level skill ID fields. Unset references remain `0`; numbered support slots are neither removed nor reordered. Resolve nonzero IDs through the corresponding Skills namespace; skill records are not copied into cards.

Details include the summary fields plus `growth`:

| Field | Member | Support |
|---|---|---|
| `growth.level` | Level rows | Level rows |
| `growth.awake` | Awake rows | Omitted |
| `growth.awakeResource` | Awake resource rows | Omitted |
| `growth.rank` | Member rank rows | Support rank rows |

Growth rows preserve source order and raw numbers, without percentage conversion. Empty optional groups are `[]`; broken references are errors. Each growth row contains only these fields:

- Level: `level`, `exp`, `performanceRate`, `technicRate`, `visualRate`.
- Awake: `awakeCount`, `performanceRate`, `technicRate`, `visualRate`.
- Awake resource: `awakeCount`, `itemId`, `count`.
- Member rank: `rank`, `requiredRankUpItemCount`, `performanceRate`, `technicRate`, `visualRate`, `leaderSkillLevel`, `musicTypeBonusRate`, `musicTagBonusRate`.
- Support rank: `rank`, `limitLevel`, `requiredRankUpItemCount`, `supportSkill01Level`, `supportSkill02Level`, `gekisouSupportSkill01Level`, `gekisouSupportSkill02Level`, `cardTypeLinkBonusRate`.

Lists exclude growth rows and full skill records. Raw master rows, private paths, source descriptors and credentials never enter public responses. The public `startAt` name and flat skill IDs are Web projections; the private card pack schema and its `startAtRaw`, `skills` and `id` fields remain unchanged.

## Skills

`GET /api/ournotes/master/skills` returns `data` with five independent ID maps: `leader`, `live`, `gekisou`, `support`, and `gekisouSupport`. IDs can repeat across these namespaces. Member references select the first three; the numbered support references select the last two. Records do not repeat their ID or kind.

Skill record fields are emitted in the order listed below; fields outside a kind's scope are omitted. Consumers read by field name.

| Field | Scope / meaning |
|---|---|
| `skillName` | Five localized names, resolved from the original name text reference |
| `description` | Five localized plain-text templates with numbered `{n}` placeholders |
| `descriptionParameters` | Parameter index to five display strings in grade 1–5 order |
| `effects` | `(SkillEffect \| SkillEffectByLevel)[]`, ordered effects with original game values and expanded conditions/targets |
| `skillIconId` | Original integer icon ID; no image URL or availability guarantee |
| `skillCategories` | Original array; live and gekisou only |
| `displaySkillCategories` | Original array; all except leader |
| `gekisouMissionType` | Original integer; gekisou and gekisouSupport only |
| `gekisouSupportSkillExecTiming` | Original integer; gekisouSupport only |

Templates use the authoritative source text: JP-ja, EN-en, TW-zh-TW/zh-CN, KR-ko. The producer processes native expressions and recognized color tags; newlines become `\n`. Results that stay constant across grades are inlined. Varying results become display-string arrays; identical arrays can share a parameter across language slots. To render grade `level`, replace each `{n}` with `descriptionParameters[n][level - 1]`. Web only combines slots and remaps parameter indices; it does not evaluate game expressions. Missing translations remain `""`.

Display strings and structured numbers are separate. For example, support/1 retains `effects[0].effectValue: [250,500,750,1000,1500]`; the native description displays `["0.25","0.5","0.75","1","1.5"]`. Formatting never changes raw values. Native branch wording, including a grade switching to “during JUST gekisou”, is also a display parameter. There are no added unit, scale, precision, permanent or bonus fields.

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

Field names follow the game metadata and existing client relationship properties in camelCase. Values and enum codes remain unchanged. Effects present at all five grades use SkillEffect: grade-dependent numeric fields are five-item arrays in grade 1–5 order, including constant arrays such as `[2,2,2,2,2]`. Each skill source with bound effects must have all five grades, but effect counts may differ. Effect order is preserved, including repeated effect types. `skillEffectType` and target selectors remain scalar identities.

An effect position missing at some grades uses SkillEffectByLevel with exactly the keys `"1"`–`"5"`: a complete SkillEffectAtLevel where present, JSON `null` where absent, with at least one present and one absent entry. Single-grade objects use scalar values and SkillConditionAtLevel groups, without nested grade arrays or maps. Positions follow each grade's source order; a zero-valued record is not missing, and invalid fields or broken references still fail. Restoring all five source records restores the ordinary SkillEffect form.

In the 2026-10-10 source, the second effect of gekisou/22 retains its complete records and raw value 2000 at grades 1–4 but is absent at grade 5, so `effects[1]["5"]` is null. Descriptions retain the source wording and existing missing-value display string `"null"`, distinct from structural JSON null; the previous 20% is not restored. This does not establish the current game client's behavior or the operator's intent.

Leader effects omit timing/release fields. All other kinds include `activationTimeSecond`, `maxEffectValue`, `effectLimitCount` and `skillReleaseConditions`. Gekisou, support and gekisouSupport additionally include `skillTriggerType` and `skillTriggerConditions`; live has neither. Zero-valued effects, empty relationships and null cumulative conditions remain present.

### Effect field responsibilities

The following table explains existing game fields without changing their names, types, kind-specific scope or raw values. Numeric arrays select the corresponding skill grade from 1 through 5.

| Field | Meaning and zero/empty values |
|---|---|
| `skillEffectType` | Effect kind, which determines how its values and targets are interpreted; native codes are listed below. `0` is the game's `None` and its record is retained |
| `effectValue` | Native magnitude, increment or result code, as determined by the effect kind. For example, `15000` stores extension milliseconds. `0` does not mean that an effect is absent: the `13005` kind itself specifies conversion to JUST |
| `activationTimeSecond` | Execution duration of this effect, in the original seconds. A positive value supplies a duration; `0` imposes no positive-duration timer limit. Its behavior still depends on triggers, release conditions and effect kind, so it cannot universally mean permanent. This is separate from the extension amount of `15000` |
| `maxEffectValue` | Native magnitude cap for effects that use one, typically cumulative score increases; it uses the same native representation as that effect's `effectValue`. In the current catalog, `0` configures no additional cap and must not clamp `effectValue` to zero |
| `effectLimitCount` | Number of effect applications that can be consumed during one execution, such as three gekisou COMBO protections. `0` sets no such limit; this is separate from the number of effect executions |
| `effectExecuteLimitCount` | Number of executions allowed for the same effect. Positive values limit the execution count, which configured reset conditions can reset; `0` sets no execution-count cap. This remains separate from `effectLimitCount` and `maxCumulativeCount` |
| `effectExecuteLimitResetConditions` | Condition groups that reset the execution count, such as a gekisou section starting or completing. `[]` configures no additional reset conditions; it does not indicate that a reset event has occurred |
| `skillTargets` | Explicit selectors for the effect itself. `[]` supplies no explicit filter; the effect kind and owning skill determine the actual target. An empty array does not imply the whole team. `15000` affects the member equipping that support skill |
| `skillConditions` | Eligibility conditions for the effect, such as a LIFE threshold, formation requirement or equipped member's band. `[]` adds no eligibility conditions; skill activation and other configuration still apply |
| `skillTriggerType` | Event-driven execution or sustained checking. Current values are `1 = OneShot` and `2 = Sustained`, as described below |
| `skillTriggerConditions` | Triggers for conditional skills, such as the member's own live skill activating, a gekisou section starting or a target judgement count. `[]` configures no trigger condition and supplies no new default trigger event |
| `skillReleaseConditions` | Conditions that release the effect, such as a gekisou section completing. `[]` adds no release conditions; duration, application count and the owning skill's lifecycle can still end the effect |
| `skillCumulativeCondition` | Cumulative configuration: what is counted, its numeric requirements and the maximum accumulation count. `null` means that this configuration is absent |

### Condition, cumulative and target fields

| Field | Meaning and empty values |
|---|---|
| `conditionType` | Condition kind, which determines the check and parameter meanings; native codes are listed below |
| `conditionValues` | Native numeric parameters in their original positional order, such as a LIFE threshold, judgement count or N in an every-N accumulation. `[]` means that the condition requires no additional numeric parameters, not that the condition is absent. Grade arrays follow the axis rule below |
| `conditionTargets` | Explicit selectors checked by this condition, separate from the effect's `skillTargets`. `[]` adds no filter; the condition kind determines the subject. For example, `4010` already identifies the equipped member's own live skill |
| `isPositive` | `true` requires the entire condition check to be true; `false` requires it to be false. Negating “all formation members match” means “not all match”, not “all do not match” |
| `skillCumulativeConditionType` | Accumulation method, such as every N target judgements, every N matching formation members, or every N distinct bands or attributes; native codes are listed below |
| `maxCumulativeCount` | Native accumulation-count cap, separate from execution and application counts. Original values such as `4`, `5` and `999999` remain unchanged; large values do not become infinity flags |
| `skillTargetType` | Selector kind. Current values are `3 = Member`, `4 = Judgement` and `5 = GekisouMission` |
| `bandId` | Band ID resolved through the Bands catalog; for example, `2` is Ave Mujica. This is neither a skill ID nor a skill grade |
| `cardType` | Member attribute selector using the native CardType integers listed below |
| `judgement` | Native judgement selector: `1 = Miss`, `2 = Bad`, `3 = Good`, `4 = Great`, `5 = Perfect`, `6 = Just`. Do not substitute another simulator's enum order |
| `liveMusicType` | Song attribute selector from the game's `LiveMusicType`; current targets use `1 = Red`. This remains separate from live modes, bands and judgements |
| `gekisouMissionType` | Gekisou type selector: `1 = Combo`, `2 = Luck`, `3 = JustCount`, corresponding to COMBO, LUCK and JUST gekisou |
| `liveSkillCategories` | Live-skill category selector array from the game's `SkillCategory`: `1 = Score`, `2 = Life`, `3 = Judgement`. This is separate from `displaySkillCategories` |

### Game codes used by the current catalog

These are the codes and native enum names actually present in the catalog verified on 2026-10-01, rather than a speculative expansion to all game enums. Meanings follow the metadata and corresponding behavior. The API neither renumbers codes nor adds enum-name fields.

| `skillTriggerType` | Native enum | Meaning |
|---|---|---|
| 1 | `OneShot` | Execute an effect once per trigger event. It may remain active after execution; executions across the song depend on execution limits and reset conditions |
| 2 | `Sustained` | Maintain the effect while its configured trigger conditions remain satisfied, subject to eligibility, duration and release conditions |

| `skillEffectType` | Native enum | Meaning |
|---|---|---|
| 0 | `None` | Original record with no effect kind |
| 1000 | `BPMemberAllParameterUp` | Increase all member parameters |
| 1001 | `BPMemberTechniqueUp` | Increase member technique |
| 1002 | `BPMemberVisualUp` | Increase member visual |
| 1003 | `BPMemberPerformanceUp` | Increase member performance |
| 1503 | `BPCumulativeMemberPerformanceUp` | Current records increase performance for members with LUCK-type gekisou skills. Their `skillCumulativeCondition` is null; the enum name alone must not create cumulative configuration |
| 2000 | `BPNoteScoreFactorUp` | Increase note score |
| 2001 | `BPCumulativeNoteScoreFactorUp` | Cumulatively increase note score |
| 2004 | `BPTargetJudgementNoteScoreFactorUp` | Increase score for target note judgements |
| 3001 | `IntLifeRecoveryFixed` | Recover a fixed amount of LIFE |
| 3003 | `LifeGuard` | Protect LIFE |
| 3004 | `LifeDamageReductionPercent` | Reduce LIFE damage |
| 4004 | `BPJudgementRelaxPercentGreaterEquals` | Widen the judgement window for the selected judgement and better |
| 11001 | `BPGekisouLuckGaugeFactorUp` | Increase the LUCK draw-gauge accumulation multiplier |
| 11002 | `IntAddGekisouLuckPoint` | Add LUCK points |
| 11003 | `BPGekisouLuckGaugePercentUp` | Add a proportion of the LUCK draw gauge |
| 11005 | `GekisouLuckMinimumResult` | Set a minimum LUCK draw result |
| 12000 | `IntGekisouComboBonusUp` | Add gekisou COMBO |
| 12004 | `GekisouComboProtect` | Prevent target judgements from resetting gekisou COMBO |
| 12006 | `TargetJudgementConvert` | Convert target judgements to the native judgement specified by `effectValue` |
| 13000 | `IntJustCountBonusUp` | Increase JUST gain |
| 13002 | `IntCumulativeJustCountBonusUp` | Cumulatively increase JUST gain |
| 13005 | `NoteJudgementConvertToJust` | Convert target judgements to JUST; the effect kind specifies the result |
| 15000 | `MSLiveSkillDurationExtension` | Extend the equipped member's own live-skill duration |

Native `BP` values use a denominator of 10000: for example, raw `10000` displays as `100%`. `Int` kinds retain native integer increments. Kind `15000` stores milliseconds, so `1250` displays as `1.25` seconds. `12006` uses native judgement codes, such as `5` for PERFECT; current `11005` result codes `2` and `3` mean LUCKY and SUPER LUCKY and are not replaced with internal client result enums. Native description rounding and wording come from `description` and `descriptionParameters`. Current `3004` raw value `2000` displays as `20%`. These explanations neither change structured values nor add unit or conversion fields.

| `conditionType` | Native enum | Check |
|---|---|---|
| 1030 | `NoteJudgementTargetCount` | Reach the configured count of target judgements |
| 2001 | `LifeGreaterEqual` | LIFE is greater than or equal to the configured value |
| 2003 | `LifeLessEqual` | LIFE is less than or equal to the configured value |
| 3000 | `FormationMemberTargetAny` | At least one formation member matches the targets |
| 3001 | `FormationMemberTargetAll` | All formation members match the targets |
| 4010 | `SameMemberLiveSkillActivated` | The equipped member's own live skill activates |
| 4011 | `ProbabilityExecute` | Check the configured percentage probability: raw `10` means `10%`, rather than a BP value with denominator 10000 |
| 4012 | `PlayTargetMusicType` | Play a song with a matching attribute |
| 5000 | `SnapMemberTarget` | The member equipping the support skill matches the targets |
| 7000 | `GekisouLuckLotResult` | The LUCK draw result matches the configuration |
| 7005 | `GekisouComboCountGreaterEqual` | Gekisou COMBO is greater than or equal to the configured count |
| 7010 | `GekisouRangeStart` | The corresponding gekisou section starts |
| 7013 | `GekisouRangeComplete` | A gekisou section completes |
| 7020 | `GekisouRangePlaying` | The corresponding gekisou section is in progress |
| 7021 | `GekisouLuckRushPlaying` | LUCK RUSH is in progress |
| 8000 | `ScoreRankUp` | The score rank increases |

| `skillCumulativeConditionType` | Native enum | Accumulation |
|---|---|---|
| 1000 | `NoteJudgementTargetEqualsPerN` | Once per N target judgements |
| 3000 | `FormationMemberTargetMemberPerN` | Once per N formation members matching the targets |
| 3004 | `FormationMemberBandPerN` | Once per N distinct bands in the formation |
| 3005 | `FormationMemberMemberTypePerN` | Once per N distinct member attributes in the formation |
| 7001 | `GekisouComboPerN` | Once per N gekisou COMBO |

For `support/12`, both `15000` effects have eligibility condition `5000` with target `skillTargetType: 3, bandId: 2`. The first uses `isPositive: false` for non-Ave Mujica members; the second uses `true` for Ave Mujica members. These branches are mutually exclusive. Both use trigger `4010` with `OneShot`. Grade 1 extends the duration by `1250` / `2500` milliseconds, and grade 5 by `2500` / `5000` milliseconds; only the matching branch applies, rather than adding both. Its `activationTimeSecond: 0` adds no positive-duration timer for the support effect, `effectExecuteLimitCount: 0` does not cap executions, and `15000` still identifies the equipped member despite empty explicit targets.

The same `activationTimeSecond: 0` at grade 5 of gekisou/2 accompanies `Sustained` and a JUST-gekisou-in-progress condition, maintaining the effect during that section. `effectLimitCount: 3` on gekisouSupport/86 allows three COMBO protections during one execution. `effectExecuteLimitCount: 4` on gekisouSupport/76 permits at most four conversions and resets on its configured gekisou-start condition. These remain distinct counts and do not imply a shared permanent rule.

Condition groups retain the native outer OR / inner AND order and `isPositive`. In `conditionValues: [[10,20,30,40,60]]`, the outer axis is the original condition-value position and the inner axis is grade. When native condition structure/order changes across grades, `skillConditions` or `skillReleaseConditions` becomes a map with keys `"1"` through `"5"`; each entry contains native single-grade conditions. This is required by gekisouSupport/67 and /72 for `skillConditions`, and by JP 1.0.4 gekisou/22 for `skillReleaseConditions` (empty at grades 1–4; condition type 7013 at grade 5). Other fields do not use override maps. Targets preserve used selectors and omit unrelated defaults such as `judgement=-1`; unused character/tag/gekisou-category selectors are not added.

Shared icon/category/timing fields and projected effects must agree across present sources. Names, templates and display parameters may differ. Missing IDs in a source are allowed. There is no cross-source comparison of raw rows, relationship IDs, versions, hashes or a second grade set. Validated input identity reuses the existing merge cache.

A skill with no effect records uses `effects: []` while retaining its name and processing its authoritative description; no effect slots are inferred or invented from the text. This applies to gekisou/23 and /24 in the 2026-10-10 source. Missing references and expressions depending on them use the existing fallback; adjacent expressions can produce `nullnull` without guessing a conditional branch. Restoring source records restores normal effects. Reserved headers with no description still retain five empty description slots and `descriptionParameters: []`. Unreferenced skills and native None effects remain. Supported null references or out-of-range description indices use the client's explicit fallback, or literal text `null`. GekisouSupport 67 (grades 4–5) and 72 (grades 2–5) retain those substitutions without changing conditions. Unsupported syntax, unknown projected target fields and broken required references from existing records still fail construction. This catalog describes configuration; it does not promise a full client simulation or add detail/level/attributes endpoints.

The effects/template format began with `ournotes-skills-v2`; the current recipe including Events is `ournotes-events-v1`. Historical artifact layouts remain verifiable; the Skills reader cannot read old grade-to-description artifacts. For missing-effect support, deploy Web accepting both complete and missing effects before updating the producer. Old-input bytes remain unchanged; this does not change recipe identity or overwrite old artifacts. Rollback must match the reader and private format: old Web cannot read grade maps containing null. Local verification does not imply production deployment.

The existing `cardType` integer has these official labels; it is separate from Skills:

| Value | English | Simplified Chinese |
|---|---|---|
| 1 | Ruby | 绯红 |
| 2 | Azure | 绀碧 |
| 3 | Jade | 翡翠 |
| 4 | Amber | 琉金 |
| 5 | Violet | 紫苑 |

## Events

The backend preserves regional differences in the four event asset fields as base strings and existing `serverExtensions` overrides in private packs. Web validates their string types and retains the overrides. Only differing fields appear; empty strings remain valid, absent regions remain `null`, and TW and `cn_intl` share resource values. Deploy the Web reader, which also accepts old empty-object slots, before publishing backend `ournotes-events-api-v4` artifacts. This change does not fetch or publish event images.

The backend preserves one confirmed first-party history and produces the final summary/detail maps. A later master omitting an event or region does not delete its confirmed record. Web reads those final maps, validates their consumer structure, selects a server and formats HTTP responses; it does not rebuild history, join master tables or repeat cross-source consistency checks.

Music, time, event reward and the four event asset fields use one base value from the first historically present slot in fixed `jp/en/tw/cn_intl/kr` order. Without `server`, records always include five-slot `serverExtensions` for presence and regional differences: `null` means absent, `{}` means present with the base values, and an object supplies only differing `startAt`, `endAt`, `displayEndAt`, `imageAsset`, `logoAsset`, `backgroundAsset`, `bannerAsset`, `musics` or detail `stories`, `pointRewards`, `pointLoopRewards`, `rankingRewards`. When all five slots are present and identical, the field is `[{}, {}, {}, {}, {}]`. Arrays replace the complete base array; they do not merge by ID. A server query filters on presence, applies that slot's overrides, then removes `serverExtensions`. Explicit `null` times, `[]` collections and empty asset strings override base values. Localized text retains its five slots. TW and `cn_intl` share records and times, with distinct Traditional/Simplified Chinese text. Missing text is `""`; missing time is `null`, and a present region's genuinely empty collection is `[]`.

All Events time fields are decimal-string Unix timestamps in milliseconds or `null`, matching the Bandori Events timestamp representation. Web interprets private dates as JST (UTC+9), independently of the host timezone, and converts them after verifying the original pack. The shared Events/Music parser accepts `yyyy/MM/dd H:mm:ss` or `yyyy-MM-dd H:mm:ss`, with one- or two-digit hours. Empty strings and the literal `"null"` become `null`; invalid dates fail the read. For example, `2026/09/30 18:00:00` becomes `"1790758800000"`. A timestamp identifies the same instant in every timezone; clients format it in their selected display timezone. No raw-date or ISO companion fields are added, and no release/availability state is inferred.

| Summary fields | Contract |
|---|---|
| `eventType`, `eventName` | Native enum name (`None`, `ChallengeLive`); unknown codes retain their integer value. Five-slot name |
| `startAt`, `endAt`, `displayEndAt` | Scalar decimal-string Unix milliseconds or `null`; regional differences use `serverExtensions` |
| `imageAsset`, `logoAsset`, `backgroundAsset`, `bannerAsset` | Native resource strings from the first present source, with differences in `serverExtensions`; empty values remain, with no media URLs or availability promise |
| `memberBonuses`, `supportBonuses` | Member/support target groups with rank 1–5 configuration percentages |
| `effects` | Optional remaining rules that cannot be represented losslessly by those groups |
| `musics` | One integer music ID array, preserving order and repeated IDs; regional differences use `serverExtensions` |
| `pickUpCards`, `rewardCards` | Arrays of `{resourceType,resourceId}`; pickup references and actual point-reward cards remain distinct |
| `serverExtensions` | Required five-slot presence and overrides in unfiltered responses; removed by server selection |

`pickUpCards` comes from `MasterEventPickUpCard` rows associated through `_eventId`; each reference retains its card resource kind and ID. It declares an activity-associated Pickup list, not gacha probability or acquisition instructions. `rewardCards` contains distinct member/support references extracted from actual point rewards. These lists can overlap and neither replaces the complete bonus rules. Resolve `MemberCard` through `/cards/member/{id}` and `SupportCard` through `/cards/support/{id}`; their ID spaces are independent.

`memberBonuses` and `supportBonuses` are arrays in first-target-appearance order within each card kind. Each row retains its complete nonzero target selectors (`characterId`, `bandId`, `cardType`, `tagId`, `memberCardId`, `supportCardId`) and the percentage fields for its actual rules. An omitted selector means no target was specified for it; multiple selectors stay together as one condition. Member/support ID spaces remain distinct.

| Native bonus type | Public group field |
|---|---|
| `0 = EventPoint` | `pointPercent` |
| `1 = EventItem` | `itemPercent` |
| `2 = ParameterAll` | `parameterPercent` |
| `3 = ParameterPfm` | `performancePercent` |
| `4 = ParameterTec` | `technicPercent` |
| `5 = ParameterVis` | `visualPercent` |

Every percentage field is a complete five-number array for ranks 1–5, separate from the regional axis. Values are the original configuration divided by 100 without display rounding: `[1500,1750,2000,2250,2500]` becomes `[15,17.5,20,22.5,25]`. Zero and negative values remain. The game percentage display floors these values; callers may floor for matching presentation, but these arrays do not compute a player's final score, items or power. Only actual bonus fields are emitted; absent rules do not become five zeros.

Rules merge only within the same card kind and identical complete target. If the current target row already has that bonus field, a new row preserves the duplicate instead of overwriting or summing it. Unknown bonus types, resource kinds outside member/support, or values that cannot recover the original integer by rounding `percent * 100` remain in optional `effects` with their original five-value `effectValue`. Those remaining rules expose the named or unknown integer `resourceTypeConstraint/eventBonusType` and nonzero targets. A rule appears in exactly one representation; `effects` is omitted when all rules are grouped. The two group arrays remain present, including when genuinely empty. IDs and quantities stay numeric; resource ID `0` in rewards remains valid. No top-level event ID is repeated.

`resourceType` in every resource/reward row and `resourceTypeConstraint` in effects share the following `GameResourceType` mapping. Code `0` has no declared name and remains numeric. International-only entries are included without changing the common codes.

| Code | API name | Code | API name |
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

| Field | API mapping |
|---|---|
| Effect `cardType` | `1 = Ruby`, `2 = Azure`, `3 = Jade`, `4 = Amber`, `5 = Violet`; original `0 = None` is an unset target and is omitted |
| Music `musicType` | `0 = None`, the same `1..5 = Ruby/Azure/Jade/Amber/Violet`, `99 = All` |
| Music `gekisouMission1/2/3` | `0 = None`, `1 = Combo`, `2 = Luck`, `3 = JustCount`, `4 = All` |

Card/music names are public display aliases for native `Red/Blue/Green/Yellow/Purple`, as explicitly agreed. The two enums remain separate: only `LiveMusicType` declares `All = 99`. Every known mapping above is applied in HTTP output; no numeric/name pair is duplicated in a record.

This grouping, compact representation, timestamp conversion and enum naming are HTTP projections: private packs retain their original integer codes, `{musicId}` summary items, five regional music/time/reward slots, raw date strings, effect values and complete effect targets. Web verifies the original pack hashes before projecting the response. No backend recipe, pointer schema or stored object changes are required; detail music objects keep `musicId` and their other fields. Summary fields follow the summary table. Detail uses its own explicit order below instead of appending its fields after the entire summary. Server selection applies overrides and removes `serverExtensions` without reordering the remaining fields. Consumers of the earlier development response must replace `musics[serverSlot]`, time-slot and event-reward-slot access with these scalar/base fields plus extension materialization, or request `?server=n`. Consumers access object fields by name; presentation order does not change field meaning or array-item order.

| Detail field order | Fields, in order |
|---|---|
| Identity | `eventType`, `eventName` |
| Times | `startAt`, `endAt`, `displayEndAt` |
| References | `storyChapterId`, `eventItemId`, `musicId` |
| Ranking configuration | `isRankingDisabled`, `isMusicRankingDisabled`, `isTotalMusicRankingDisabled` |
| Assets | `imageAsset`, `logoAsset`, `backgroundAsset`, `bannerAsset` |
| Bonuses | `memberBonuses`, `supportBonuses`, optional `effects` |
| Card references | `pickUpCards`, `rewardCards` |
| Challenges | `musics` |
| Event rewards | `pointRewards`, `pointLoopRewards`, `rankingRewards` |
| Episodes | `stories` |
| Regional presence/overrides | `serverExtensions`, always last in unfiltered responses |

Summary extension types admit, in order, `startAt`, `endAt`, `displayEndAt`, `imageAsset`, `logoAsset`, `backgroundAsset`, `bannerAsset` and integer-array `musics`. Detail extension types additionally admit `pointRewards`, `pointLoopRewards`, `rankingRewards` and `stories`, with full music objects in `musics`. Extension objects follow that field order, excluding absent fields. A slot-level `null` means the event is absent; a timestamp field's `null` remains an explicit unset-time override, not field deletion. The public types keep the extension field optional to also describe server-selected responses, while unfiltered records always provide all five slots.

Nested point-reward rows emit `point` before `resourceType/resourceId/resourceCount`; loop-reward rows emit `loopStartEventPoint/loopEventPoint` first; both event and music ranking rows emit `fromRank/toRank` first. Resource references emit type then ID, and ordinary reward rows add quantity last. Music items follow the music-field list below, with ranking rewards last. Story items emit identity/number/adv reference, description and times, flags, unlock settings, assets, then their two reward arrays. Bonus rows emit target selectors in the order stated above, then existing `pointPercent`, `itemPercent`, `parameterPercent`, `performancePercent`, `technicPercent`, `visualPercent`. Optional fields are omitted without removing zero, false, null or empty-array values.

Detail retains summary fields, with full music items, and adds:

| Detail fields | Contract |
|---|---|
| `storyChapterId`, `eventItemId`, `musicId` | Native references; the event's own music reference is separate from its challenges |
| `isRankingDisabled`, `isMusicRankingDisabled`, `isTotalMusicRankingDisabled` | Independent native booleans, not ranking RPC availability |
| `pointRewards` | One array of `{point,resourceType,resourceId,resourceCount}`; full-array regional overrides |
| `pointLoopRewards` | One array of `{loopStartEventPoint,loopEventPoint,resourceType,resourceId,resourceCount}`; full-array regional overrides |
| `rankingRewards` | One array of `{fromRank,toRank,resourceType,resourceId,resourceCount}`; full-array regional overrides |
| `musics` | One challenge array, using the item structure below; full-array regional overrides |
| `stories` | Referenced episode metadata, using the item structure below |

The three event reward collections remain distinct arrays. Regional comparison includes every row, threshold/rank range, resource type, ID and quantity in order. Repeated rows, zero quantities and genuinely empty arrays remain; a nonempty reward from another source does not replace an empty base array. A missing region remains `null` in `serverExtensions` instead of receiving another region's rewards. Only the differing collection is overridden. Song ranking rewards and the two story reward collections keep their existing locations.

A detail music item contains `musicId`, `challengeMusicId`, `musicType`, `gekisouMission1`, `gekisouMission2`, `gekisouMission3`, `startAt`, `endAt` and `musicRankingRewards`. All three gekisou fields remain present even when their value is `None`; they are inside `data.musics[musicIndex]`, not in the summary's ID array. `None` means that this challenge configuration does not specify a mission type; it does not prove the underlying song has no gekisou gameplay. Its times are scalar timestamp strings or `null`; unset values are not filled from event times. Its ranking rewards are a flat array with the same row fields as `rankingRewards`. Regional comparison covers the complete music array, including challenge configuration, times and ranking rewards, even when music IDs are equal. There is no additional regional axis inside a music item, embedded song catalog or inferred music achievement.

A story contains `episodeId`, `episodeNumber`, `advId`, five-slot `description`, scalar timestamp-string-or-null `startAt/endAt`, `unlockEpisodeNumber`, `eventPoint`, `characterId`, `characterRank`, `playerRank`, `bandRank`, `storyFriendshipEpisodeId`, `isAnotherEpisode`, `isExtraEpisode`, `banner`, `image`, `rewards` and `eventRewards`. Differing regional story times produce a complete `stories` array override on the event; localized descriptions remain five-slot text. The two reward arrays independently contain `{resourceType,resourceId,resourceCount}`. These are native unlock settings and resource references, not player unlock state, story text or playable media. References and zero/false/empty values are preserved; internal relationship IDs and raw source rows are not exposed.

Events discover `ournotes/master/events-v1/api/active.json` with schema `ournotes-events-api-pointer-v3` and consume only the `events/eventDetails` descriptors and packs. Web validates the schema, generation, safe content-addressed pack keys, compressed/semantic hashes, sizes, record count and public structure. Producer `revision`, `sourceIdentity`, master/history provenance and `recentPackKeys` belong to backend publication/verification: Web does not recompute them or require exactly two `datasets` entries. Private dependencies do not become public endpoints. The reader accepts up to 32 MiB compressed, 128 MiB JSON and 10,000 records per pack, with bounded two-entry content caching and a 15-second read deadline. Producer capacity is independent; these reader limits alone do not raise the backend's current 16 MiB pack budget.

Events add no media extraction, cutoff collection, database, locale/expand/page query or unverified Bandori-derived fields. Lists read the summary pack and details read the detail pack; filtered directories are not separately cached. Both views are pinned by one backend root, while separate HTTP requests can observe a later publication.

## Music

Music follows the Bandori summary/detail organization, unified envelopes, private readers and cache policy. Its fields describe OurNotes rules: multiple bands/vocals, native levels and combo counts, three gekisou task positions, acquisition paths, rewards and performance configuration. It does not infer Bandori note counts, `closedAt`, release status or unlock state. Music IDs are positive safe integers without leading zeros; the ID is the map key or detail URL and is not repeated in the record.

Both routes accept optional `server=0..4`: `GET /api/ournotes/master/music` returns the summary ID map, and `GET /api/ournotes/master/music/{musicId}` returns one song's detail.

### Fields and order

Summary order is `sortOrder, musicTitle, bandIds, bandName, vocalCharacterIds, musicType, musicCategories, bestMusicTagIds, startAt, gekisouMission1, gekisouMission2, gekisouMission3, difficulty, length, bpm, serverExtensions`.

Both views expose the three ordered gekisou mission fields with the shared enum mapping (`None`, `Combo`, `Luck`, `JustCount`, `All`); preserve repeated values, zero as `None`, unknown numeric codes and regional differences. The summary reads these fields from the backend `music` pack, introduced in `ournotes-music-api-v3`. Older packs omit them; the reader does not invent defaults or fetch details to fill them. Publish a snapshot containing these fields before relying on them in the public summary. The same v3 recipe removes `defaultUnlock` from the private summary and its regional overrides while retaining it in detail; HTTP already excludes it from summaries, so that private reduction does not block HTTP verification.

`defaultUnlock` and `acquisition` are detail-only fields; they are absent from both summary records and summary `serverExtensions`. The root `unlockConditionId` is excluded from both HTTP views and their regional overrides; its private source value remains intact. `startAt` remains in the summary as the song's opening time.

Detail order follows this table. Optional source fields are omitted when absent; present `0`, `false`, `""` and empty arrays are retained.

| Group | Fields in order |
|---|---|
| Identity and credits | `sortOrder, musicTitle, ruby, phonetic, lyricist, composer, arranger, bandIds, bandName, vocalCharacterIds` |
| Classification | `musicType, musicCategories, bestMusicTagIds` |
| Access | `startAt, defaultUnlock, acquisition` |
| Gameplay | `difficulty, gekisouMission1, gekisouMission2, gekisouMission3` |
| Rewards | `scoreRanks, scoreRewards, comboRewards` |
| Media references | `resources, anotherVocalIds, anotherVocals, musicVideoIds, musicVideos, releaseEffects` |
| Performance and chart metadata | `performance, length, bpm, serverExtensions` |

Root text fields (`musicTitle,bandName,ruby,phonetic,lyricist,composer,arranger`) are five-string arrays. `bandName` is a resolved display name: for each present region/language, use the song-specific name when nonempty; otherwise resolve that region's `bandIds` through the existing Bands catalog and join names in source order with ` / `. Preserve repeated IDs. If any required name/translation is unavailable, leave that slot empty rather than presenting a partial name or borrowing another language. Absent songs keep empty slots. CRYCHIC's song-specific name takes precedence even with empty `bandIds`. `ruby` preserves official markup as text, without rendering HTML. `musicCategories` contains classification codes, not category row IDs. `bestMusicTagIds` references Tag rows. Neither view embeds `tags`, `categories` or `resourceItems`; shared catalog names and item configuration are outside Music. No Tags, Categories or Items HTTP catalog is introduced by this projection.

`difficulty` keys `0/1/2/3` mean Easy/Normal/Hard/Expert. Each referenced difficulty contains `scoreId,musicScoreLevel?,musicScoreDisplayLevel?,fullComboCount?`; detail additionally includes `musicScoreTextFileName` when present. Levels such as `20` and `20.5` remain distinct, without conversion to `20+`. `fullComboCount` is the official combo count, not a count of chart objects. A missing score row is `{scoreId,missing:true}`; an unreferenced difficulty has no key. Shared BPM may still exist when a region lacks that score row.

`musicScoreLevel` is the native integer level. `musicScoreDisplayLevel` is a separate native float: the inspected client uses the full value as a song-list sort key, but its list/detail difficulty labels use `GetMusicScoreDisplayLevelInt`, which truncates that float toward zero. For example, `20.5` displays as `20` while retaining its fractional ordering value. The fraction does not establish a `+` label or a rating formula. The API preserves both source values.

Both summary and detail expose complete `bpm`: difficulty keys map to `{events:[{t,bpm,...}]}`. The `t` unit is fixed at 480 integer ticks per beat; the reader still validates the private `ticksPerBeat:480` value but omits that constant from both HTTP views. Event order, equal-tick events and additional event fields are preserved. `length` is the positive duration in seconds without rounding, omitted when unavailable. Requests use published metadata without downloading chart/audio files.

| Reward field | Entry fields in order |
|---|---|
| `scoreRanks` | `liveScoreRank,requiredScore,battleLiveRequiredScore`; both thresholds are official configuration |
| `scoreRewards` | `liveScoreRank,resourceType,resourceId,resourceCount` |
| `comboRewards` | `difficulty,comboRateType,requiredCombo?,resourceType,resourceId,resourceCount`; thresholds are not recomputed |

The HTTP views and their regional overrides exclude `rewardIds` and the nine original song-master reward IDs. The resolved `scoreRewards` and `comboRewards`, together with `scoreRanks`, already provide reward categories, contents and thresholds without relying on those IDs. Private source references remain available for tracing; no foreign-key joins or player claim states are inferred. The root `unlockConditionId` is also excluded because its business meaning remains unverified; its zero value must not be interpreted as unconditional access. This does not alter the separate `anotherVocals[].unlockConditionId` field.

`acquisition[]` preserves all sources in their original order, with acquisition identities, names and native conditions. It omits store presentation settings, chapter synopsis/cast/music and artwork, episode artwork, and mission list priority/grouping. Reward and payment item references remain without embedded item definitions. Reward objects contain `resourceType,resourceId,resourceCount`, omitting join-only row/group IDs.

| Type | Nested fields in order |
|---|---|
| `exchange` | `product`: `id,exchangeId,resourceType,resourceId,resourceCount,paymentResourceCount,paymentSteps,paymentStepResourceCounts,limitCount,resetType,startAt,endAt`; optional `exchange`: `id,name[5],paymentResourceType,paymentResourceId,startAt,endAt` |
| `story` | `reward,chapters,episodes`. Chapters: `chapterId,name[5],bandId,isSpecialStory,startAt,endAt`. Episodes: `episodeId,chapterId,episodeNumber,advId,description[5],startAt,endAt,isAnotherEpisode,isExtraEpisode,unlockEpisodeNumber,eventPoint,characterId,characterRank,playerRank,bandRank,storyFriendshipEpisodeId` |
| `mission` | `reward,missions`. Missions: `missionId,description[5],missionCategory,missionType,achievementCount,initialValue,value`, target fields below, then `startAt,endAt,loginTimeStartAt,loginTimeEndAt` |

Mission targets are ordered `arenaRankId,bandId,bandRank,cardType,characterId,episodeId,eventId,exchangeId,gachaId,memberCardId,missionLiveChapterId,missionLiveStageId,musicDifficulty,musicId,notesJudgement,scoreRank,storyChapterId,supportCardId`. Descriptions retain placeholders such as `{BandId}` with native parameters. There is no template executor or player-state evaluation. Story/exchange end times do not become song `closedAt`.

The following condition meanings are verified in the inspected base client; they describe static configuration, not an account's eligibility:

- Exchange `paymentResourceCount` is the base unit price. `paymentSteps[i]` is the one-based purchase occurrence at which `paymentStepResourceCounts[i]` becomes the unit price; the two arrays pair by index. A tier ends immediately before the next tier starts, with a positive `limitCount` capping its range. Empty tier arrays use the base price. The client's current-price lookup uses the purchase counter plus one, not a batch quantity. `resetType` is `1=NoReset, 2=Daily, 3=Weekly, 4=Monthly`; this API does not calculate reset boundaries.
- Story conditions depend on the chapter and current event branch. An already viewed episode or a chapter marked `isSpecialStory` bypasses the usual condition list. During the relevant active event, the client checks `eventPoint`; outside that branch it checks configured character/player/band ranks and friendship-episode viewing. `characterRank`, `playerRank`, `eventPoint`, `unlockEpisodeNumber` and `storyFriendshipEpisodeId` activate at positive values; a character-rank condition also needs a positive `characterId`, and a zero `bandRank` skips that rank check. `bandRank` applies to the chapter's `bandId`. `unlockEpisodeNumber` identifies a non-Another episode with that number in the same chapter, not an episode ID. The common previous-episode viewing check is skipped for `isExtraEpisode`. Applicable unmet conditions accumulate; all fields must not be treated as an unconditional AND expression.
- Mission `missionType` selects which target parameters form its counter key. Current Music acquisition missions use `missionCategory=15` (`UnlockMusic`) and `missionType=30` (`BandEvaluation`), with `bandId` selecting the band and `achievementCount` setting the progress target. `initialValue` is the `MissionInitialValue` policy enum (`0=Zero, 1=Minus1, 2=Current`), not the numeric baseline. For an active unfinished task, the inspected progress calculation clamps `counter - playerMission.startCount` to the progress range; `startCount` comes from player state. `value` is a type-dependent counter parameter, unused by the current BandEvaluation key branch. Other zero-valued targets are not additional requirements for that type. Completion and reward-receipt flags remain player/server state.

Story chapters retain `bandId` and `isSpecialStory` as condition context: the former identifies the band for `bandRank`, and the latter changes the unlock branch. Preserve present zero/false values, omit absent fields, and retain regional differences. This does not expand the full chapter catalog or evaluate player eligibility.

`resources` groups `jacketAssetName` and `audio`: `musicSoundId,soundCueSheetId,cueSheetName,cueName`. Missing sound/sheet rows do not manufacture configuration. Chart references already live in `difficulty`. No private descriptors, files map or media URLs are exposed; media consumers can use the separate music index.

`anotherVocalIds` and `musicVideoIds` retain references even when related rows are missing. `anotherVocals[]` contains `id,vocalCharacterIds,musicSoundId,unlockConditionId,startAt`, excluding `jingleSoundID`. Nonempty AnotherVocal projection has synthetic coverage; the current production dataset has no nonempty sample. `musicVideos[]` contains only `id,displayName[5],assetName`; generic video dimensions, audio/stop flags and shader configuration are not exposed. `releaseEffects[]` contains `id,difficulty,releaseEffectType,startAt,endAt`.

`releaseEffects` configures song-release notices. `releaseEffectType` is `0=Music, 1=Difficulty, 2=AnotherBand`; the inspected title branch reads `difficulty` only for type 1. Type 0 with difficulty 0 does not mean Easy-only access. Playback checks the notice's time window and locally recorded played ID, then marks it played after the notice. Its `endAt` ends that notice window, not song availability. The API does not derive whether a notice will currently play.

`performance` contains the song's native `liveMusicPenLightColorId,musicLightColorIdNormal,musicLightColorIdChorus,lazerLightMotionNormal,lazerLightMotionChorus,stageLightMotionNormal,stageLightMotionChorus,vjVideoPattern,backgroundCameraType,gekisouCallSe`. Keep the official `lazer` spelling and zero values. The shared `penLight,normalLight,chorusLight,stageVideos,videos` expansions stay private. `resources.audio` likewise omits generic sound cache, timing and pitch configuration.

### Enums, time, regions and missing data

`musicType` uses `None/Ruby/Azure/Jade/Amber/Violet/All`; gekisou fields use `None/Combo/Luck/JustCount/All`. Resource types and mission `cardType` share the Events mappings above. Score rank codes `0..7` map to `None,E,D,C,B,A,S,SS`; combo rate codes `0..3` map to `Quarter,Half,ThreeQuarters,Full`. Unknown valid integer codes stay integers. Other types/conditions retain native numbers.

Numeric `musicCategories` codes mean `0=All, 1=Original, 2=Virtual, 3=JPop, 4=Anime, 5=Game, 6=AnotherBand`. The numeric meanings documented for categories, acquisition parameters and release effects do not introduce additional string-enum conversions.

All Music date fields use decimal-string Unix milliseconds or `null`, following the Events public JST (UTC+9) interpretation. This includes root `startAt`, acquisition product/exchange/chapter/episode/mission dates (including login windows), AnotherVocal dates and release-effect windows. The shared parser accepts slash/hyphen dates and one- or two-digit hours, normalizes empty strings/literal `"null"` to null, and rejects invalid calendar values without depending on the host timezone. Root `startAt` is always present (null if unset or removed in the private region); absent optional nested date fields remain omitted. Regional differences remain scalar overrides. No raw/ISO companion fields, open-state inference or private-pack rewrite is introduced. Cards' existing raw-time contract is unchanged.

Five slots are `[jp,en,tw,cn_intl,kr]`, from `[JP,EN,TW,TW,KR]`. Root texts retain five slots. Related texts align by entity type and stable ID across materialized regions, never array position. An absent entity/translation yields `""`, without language fallback. Arrays retain source order, duplicates and positional meaning.

Private extensions apply before renaming/grouping: a `null` slot means absent song, a `null` field deletes that optional field, and arrays/objects replace the whole value. Public records use the first present region as base and always emit five `serverExtensions` slots, including all-`{}` cases. Extensions contain only projected top-level differences; a field value of `null` deletes a whole optional field except `startAt`, whose null means an explicitly unset time and remains present after server selection, matching Events. Root texts and shared `length/bpm` are not overridden. With `server`, absent songs are excluded, differences/deletions applied, and `serverExtensions` removed; five-string texts stay intact. Historical presence does not mean open, unlocked or playable.

Producer table/reference diagnostics in root `missing[]` remain private. Public `difficulty.*.missing:true` still identifies an explicitly referenced but missing score row. Official partial data stays readable without borrowing another region's score or fabricating zero values. Required object absence, corruption or invalid consumed structures fail the read. Source rows, history, text reference keys, pointers and storage paths are excluded; new source fields are not automatically exposed.

Object field order is for readability; callers use field names. Numeric ID maps do not promise song order. Select a region and sort by its `sortOrder`, then numeric ID for ties. There is no `sort/order/page` query or `orderedIds`; native arrays and BPM events are never resorted.

The Web field reductions apply to the HTTP projection, including `serverExtensions`; regional differences solely in excluded fields do not produce public overrides. Existing consumers must use the retained references instead of removed catalog expansions, the resolved reward arrays instead of `rewardIds`, and the fixed BPM unit instead of a per-chart constant. No current repository UI consumes the removed Music fields. These HTTP reductions can be verified against existing v2 packs without rebuilding them.

Separately, backend `ournotes-music-api-v3` removes the five shared definition groups `bands`, `vocalCharacters`, `tags`, `categories` and `resourceItems` from final `musicDetails` records and their regional overrides. These definitions remain in raw archives, per-server normalized data and unified history. Final details retain native references, actual rewards, acquisition and performance configuration, private reward/unlock references, source diagnostics and complete `assets.files/bpm/length`; media indexes are unchanged. The Web reader accepts both older packs containing these definitions and v3 packs without them, so this private reduction requires no further HTTP adaptation.

### Reader and activation

Music discovers `ournotes/master/music-v1/api/active.json` (`ournotes-music-api-pointer-v1`). Lists read the `music` pack; details read `musicDetails`. Both also reuse the existing private Bands catalog reader to resolve names. This catalog has its own verified four-source roots/cache, and is not pinned to the Music generation; a catalog refresh can update names without rebuilding Music packs. No public API/CDN request or additional full detail-pack read is used for name completion. Catalog read failures fail the Music read; a missing referenced band/translation leaves the display slot empty. Validate schema, generation, content-addressed keys, compressed/original JSON byte hashes and sizes, descriptor counts and consumed structure. The producer's `semanticSha256` is the original JSON digest for these packs; use existing byte verification without JavaScript reserialization. Additional datasets/history and producer revisions do not alter this contract.

Pointers have a 60-second TTL; reads have a 15-second deadline. Compressed and decompressed packs are limited to 16 MiB each. The content cache holds two entries with a 32 MiB total budget estimated from serialized public projections, not actual JavaScript heap size. Five temporary regional copies are not retained as five caches. There is no arbitrary song-count ceiling. Separate HTTP requests may observe different publications.

For full activation, publish backend v3 snapshots before enabling the Web API with the agreed summary fields. The backend can build both final packs from the existing resource checkpoint without fetching master data again, rebuilding or uploading media, adding credentials or migrating the database. The summary's three gekisou fields are the only public field changes whose actual-data acceptance depends on that publication. `npm run test:ournotes-master` covers fields/order, regions, partial data, HTTP errors and pack/cache integrity; typecheck, lint and build cover integration. Dev acceptance compares both routes and all five selections with actual private packs and the verified Bands catalog, including normalized timestamps, ordinary band names and the CRYCHIC override. Production deployment/edge-cache verification are separate operational steps. Web rollback does not move the backend pointer or remove media. Invalid/absent music IDs return `404 OURNOTES_MUSIC_NOT_FOUND`; source errors follow the shared sanitized, no-store policy below. Edge cache keys must distinguish Music `server` queries.

## Shared catalogs and images

Character records contain `characterName[5]`, `shortName[5]`, `bandId`, `displayOrder`, and `colorCode`. Band records contain `bandName[5]` and `colorCode`. Names use the same fixed source/locale mapping. Structural fields must agree across sources. Cards reference characters, and characters reference bands; cards do not embed these catalogs.

Images are independent. `kind` and `assetId` associate a card with the existing `ournotes/cards/index.json`; these APIs neither return image URLs nor fetch the image index. Image availability does not filter cards, change `serverExtensions`, or gate API readiness. Frontend pages, new media categories and database changes are outside this release.

## Errors and caching

Errors use `{ "success": false, "error": { "code": "...", "message": "..." } }` and `NO_STORE_HTTP_CACHE_POLICY`.

| Status | Condition |
|---|---|
| 400 | Unknown, duplicate or invalid query parameter; any directory query |
| 404 | Unknown card kind, invalid ID, or card/event/music absent from the requested view |
| 503 | Missing configuration/source, corrupt snapshot, invalid references or conflicting data |
| 500 | Unclassified application error |

Success reuses `SNAPSHOT_HTTP_CACHE_POLICY`: browser `max-age=300, stale-while-revalidate=1800`; Cloudflare `max-age=1800, stale-while-revalidate=86400`. Edge cache keys must distinguish card/event/music `server` queries. Source pointers have a 60-second process cache. Immutable objects use bounded caches and shared in-flight reads; merged views are reused while input identities remain unchanged. TW and `cn_intl` share one input. Separate requests do not promise an atomic release across all servers or images.

## Server configuration and verification

Use server-only, read-only private R2 credentials from `.env.example`: `OURNOTES_R2_ENDPOINT`, `OURNOTES_PRIVATE_R2_BUCKET`, `OURNOTES_R2_ACCESS_KEY_ID`, and `OURNOTES_R2_SECRET_ACCESS_KEY`. No Bandori credential or public CDN fallback is used. `OURNOTES_MASTER_LOCAL_STORE_ROOT` is for development/tests only and is rejected in production.

Cards pin each source's `ournotes/master/cards-v1/{server}/api/active.json` and verify their own immutable packs (schema, compressed hash/size, semantic hash, decompression limit and record count). Characters/bands/skills discover their named normalized files through `ournotes/master/{server}/active/manifest.json` and verify compressed/plain byte hashes and sizes. Neither reader requires a producer recipe revision or an exact source-table/file inventory. Shared readers own storage and bounded content caches; Cards, catalogs and Skills own their respective validation, merging and response caches. Identical verified dataset content can be reused across archive generations. Web never downloads raw `MasterText`.

The generic master roots must be initialized before deploying these readers. Existing URLs, fields and five-slot semantics are unchanged. New independent datasets do not require changing existing readers; missing required data and unknown data schemas still fail. A failed Skills read does not fail Cards, Characters or Bands reads.

Run `npm run test:ournotes-master` for the bounded local fixture, route contracts, corruption failures, five-slot selection and cache reuse. Shared-reader changes also require the relevant Bandori tests, typecheck, lint and build. The fixture contains selected metadata with version/hash provenance, no complete master tables or credentials.

Initial Skills activation requires verified artifacts and signed reads from all four sources. Updating an existing reader for missing effects instead requires Web first, then the producer, followed by verification of the four-source merge and actual API. Existing assets consumers and media need no update for this dataset. Master readiness is independent of image jobs. Local tests do not replace production verification.

For Events, verify the backend's final root and two packs before activating Web. The existing test command also covers final-view fields, five-slot historical selection, no-store errors, corruption failures, consumer capacity and content-cache refresh. For an Events-only HTTP projection change, select its cases with `node --import tsx --test --test-name-pattern '^Events ' tests/ournotes-master-api.test.mjs`, run typecheck and lint the changed modules, then verify both dev routes and server selections against the published packs. This scope does not require a full build or unrelated suites. After deployment, verify both HTTP routes and all server selections against the exact published packs, including query-aware edge caching. This release does not require rerunning backend history/CAS/rollback/GC tests or rebuilding master/media inputs.
