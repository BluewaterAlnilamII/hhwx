# Bandori 谱面模拟器静态舞台证据账本

## 完成边界

固定正常播放状态下的基础静态舞台已经完成。本文档中的“完成”严格指 `1334×750` 参考画布内以下三层可见内容：

1. 放在原生 Stage 承载节点上的已批准 JP `skin00/livebg_normal` 背景内容；
2. JP `MasterSkin.skinLaneMap` 中 15 种 `bg_line_rhythm` 轨道底板之一；
3. 与所选底板皮肤配对的 `game_play_line` 判定条。

这不代表将来所有看起来属于静态画面的元素都已完成。Note、长条、原生 HUD、`BgCover`、fever 内容、技能判定演出、判定反馈与特殊模式装饰仍不在本次完成边界内。

浏览器只会整体等比缩放完整的 `1334×750` 舞台，不会分别重排、拉伸或视觉微调这三层内容。

## 证据准入规则

参数只有在满足以下任一证据等级时，才能进入原生演出白名单：

- `confirmed-static`：JP APK 或 JP AssetBundle 的序列化对象直接确定该值；
- `confirmed-static-plus-code`：序列化值会被 JP IL2CPP 运行时代码修改或连接，且最终结果可以在不进行视觉校准的前提下推导闭合；
- `unresolved`：证据链尚未闭合，对应能力继续禁用。

以下内容不能作为原生参数来源：

- CN 资源或 CN/JP 对照；
- Bestdori 布局常量；
- 截图、录屏或像素测量；
- 人工偏移、视觉调参或“看起来接近”的值；
- 现有生成 recipe、behavior report 或 Web contract，除非其结论被独立追溯回 JP 对象或 JP 代码。

Bestdori 仍然是产品效果的最低比较目标，但它的参数不能覆盖不同的 JP 原生值。

本地视觉检查只用于发现明显的实现错误。通过视觉检查不会产生新证据，也不会批准未经确认的参数。

## 已锁定的运行时合同

以下坐标均以固定参考画布左上角为原点。

| 图层 | 矩形或中心 | 来源资源 | 状态 |
|---|---|---|---|
| 舞台 | `0,0,1334,750` | 无 | 已锁定 |
| 背景 | `left=-216.2`、`top=-131`、`width=1766.4`、`height=1324.8` | `bgskin/skin00/livebg_normal` | 已锁定 |
| 轨道底板 | `left=87`、`top=5`、`width=1160`、`height=610` | 所选 `fieldskin/skin00...skin14/bg_line_rhythm` | 承载矩形锁定、来源可选 |
| 判定条 | 中心 `(667,615.239)`、宽度 `1798.389`；高度由所选 Sprite rect 推导 | 配对的 `fieldskin/skin00...skin14/game_play_line` | 公式锁定、来源可选 |

固定合成顺序为：

```text
liveBG
└─ bg_line_rhythm
   └─ game_play_line
```

画布会裁掉 `0..1334 × 0..750` 以外的全部内容。舞台本身绝不水平镜像；镜像模式只变换谱面 lane 与方向数据。

## 证据账本

### 参考画布与 UI 坐标系

JP APK entry `assets/bin/Data/level3` 包含两个 NGUI `UIRoot` 组件：

- `UI_Root_Back`：MonoBehaviour pathId `1059`；
- `UI_Root`：MonoBehaviour pathId `1060`；
- `mScalingStyle=Constrained`；
- `manualWidth=1334`；
- `manualHeight=750`；
- `fitWidth=true`；
- `fitHeight=false`；
- `adjustByDPI=false`。

JP IL2CPP 证据闭合了运行时部分：

- `StarUIManager::.cctor`，RVA `0x393F21C`，设置 `1334×750` 基准值；
- `UIRoot::get_activeHeight`，RVA `0x3087308`，从固定宽度计算活动高度；
- `UIRoot::UpdateScale`，RVA `0x3087B74`，应用最终根节点缩放。

模拟器刻意固定这个内部画布，并把它作为一个整体在浏览器中缩放。原生安全区与高宽比改写不会应用到这个固定舞台内部。

### 背景承载节点与纹理

JP APK `globalgamemanagers` 的 ResourceManager container 条目 `prefabs/bms/background/stage` 将 Stage prefab 指向 APK 序列化 entry `assets/bin/Data/7c743c7e811ed4af2b1f94e02f0c4b63`。

相关层级为：

```text
Stage          GO 157 / Transform 298
└─ TRSRoot     GO 153 / Transform 294
   └─ bgImage  GO 155 / Transform 296
      ├─ UITexture 454
      ├─ ColorFader 455
      └─ BgManager 456
```

背景承载节点的序列化字段确定了：

- `bgImage.localPosition=(0,-170,0)`；
- Center pivot；
- `UITexture.width=1920`、`height=1440`；
- 完整 UV `(0,0,1,1)`；
- 白色 widget 乘色；
- 没有 anchor；
- `mFixedAspect=false`；
- 没有自定义材质。

正常播放状态由以下代码路径确定：

- `StandardBackgroundModule.<InitBeforeLoadResources>d__18.MoveNext`，RVA `0x3875450`，在玩法 UI 下方实例化 Stage prefab；
- `InGameStageManager::introAnimation`，RVA `0x32E7220`；
- `InGameStageManager::moveStageTRS`，RVA `0x32E7398`；
- `InGameStageManager::updateStageTransform`，RVA `0x32E6CF4`。

片头完成后，`TRSRoot.localPosition=(0,0,0)`、`TRSRoot.localScale=(0.92,0.92,1)`。初始 `0.7` 缩放、初始 y 偏移与过渡过程明确排除在固定正常播放舞台之外。

在 `1334×750` 下，原生承载矩形为：

```text
width   = 1920 × 0.92 = 1766.4
height  = 1440 × 0.92 = 1324.8
centerX = 667
centerY = 375 - (-170 × 0.92) = 531.4
left    = -216.2
top     = -131
```

放置分析使用的 JP AssetBundle 对象为：

- bundle `ingameskin/bgskin/habahiro`；
- serialized file `CAB-3a3dfee2b32df3d0ac2c461ce40d5705`；
- `Texture2D liveBG`，pathId `-7262366926435180544`；
- `2048×1024`、Bilinear、一个 mip level；
- 本地解包路径 `assets/star/forassetbundle/asneeded/ingameskin/bgskin/habahiro/livebg.png`。

运行时改用普通背景的规范文件 `assets/star/forassetbundle/startapp/ingameskin/bgskin/skin00/livebg_normal.png`。它与上述用于分析的 Habahiro 文件逐字节相同（SHA-256 `5269DC460FE19B0C8F9B23BEBAC9B4D7691B6288B58A82754AAF720E3B3517C6`），因此来源路径整理不会改变画面或放置。背景当前只准入一个 `skin00` 选择。

完整的 2:1 纹理会被绘入原生 4:3 承载节点，不存在 CSS 式 `cover` 计算；最终可见裁切来自 Camera viewport。正常播放最终乘色为白色、alpha `1`。

### 普通轨道底板

JP APK entry `assets/bin/Data/level3` 包含：

- `RhythmGameLines`：UIPanel pathId `1444`；
- `NoteLane`：GameObject pathId `147`；
- `NoteLane` Transform pathId `580`，local position `(0,-240,0)`；
- `NoteLane` UITexture pathId `1200`，`1160×610`、Bottom pivot、完整 UV、白色、无 anchor。

把 NGUI 参考平面换算到固定左上原点坐标后，得到精确底板矩形：

```text
left=87, top=5, width=1160, height=610, bottom=615
```

当前活动的普通底板资源为：

- bundle `ingameskin/fieldskin/skin00`；
- serialized file `CAB-0796b45ad7120b116ef51c20b5df5ecd`；
- `Texture2D bg_line_rhythm`，pathId `-1923623216807757824`；
- `1160×610`；
- 本地解包路径 `assets/star/forassetbundle/startapp/ingameskin/fieldskin/skin00/bg_line_rhythm.png`。

15 种 master 底板皮肤全部使用同一个 `NoteLane` 承载节点。运行时固定使用 `1160×610` 承载矩形；其中 `skin14` 的源纹理为 `1160×608`，原生固定 UITexture 承载节点会将其拉伸到承载矩形。准入选择器严格遵循 master ID 顺序：

| ID | bundle | 类型 |
|---|---|---|
| `1...5` | `skin00...skin04` | 普通 |
| `6...12` | `skin05...skin11` | 乐队 mission 皮肤 |
| `13` | `skin12` | 用户显示为皮肤 05 的普通皮肤 |
| `14` | `skin13` | 用户显示为皮肤 06 的普通皮肤 |
| `15` | `skin14` | MyGO!!!!! mission 皮肤 |

选择只由用户控件驱动，不从谱面元数据推断。经用户批准的模拟器默认值为 Hello, Happy World! master ID `10`（`skin09`）。`Meta.isMultiRangeNotes` 透传与自动宽底板选择继续延期。

### 普通判定条

JP APK entry `assets/bin/Data/level3` 包含共用场景节点：

```text
Button4  GO 55 / Transform 488
├─ judgeLine                   GO 116 / Transform 549 / SpriteRenderer 1054
└─ judgeLineAdjustSkillEffect  GO 64  / Transform 497 / SpriteRenderer 1047
```

普通判定条证据为：

- `Button4.localPosition=(0,-3.4500000477,15)`；
- `judgeLine.localPosition=(0,0,0)`；
- 屏幕适配前 `judgeLine.localScale=(0.99,0.99,1)`；
- Sprite 使用 Center pivot；
- SpriteRenderer sorting order `20`；
- 序列化颜色为白色；
- Sprite 在运行时由 field-skin loader 注入。

JP IL2CPP 调用链为：

```text
ButtonManager.ExecAwakeStart
  → execMultiResolution
  → setupGameButtonPosition
  → 使用屏幕宽度系数缩放 Button4 位置
  → 使用相同系数缩放 judgeLine

FadeInLineUI
  → 加载 "game_play_line"
  → 写入 SpriteRenderer.sprite
  → 激活 judgeLine
  → 最终 alpha=1
```

对于 viewport `W×H`、Sprite rect `spriteRectWidth×spriteRectHeight`、PPU `69`，已确认的正常播放公式为：

```text
centerX = W / 2
centerY = H / 2 + 0.180089489996874 × W

width  = spriteRectWidth  × 0.99 / (69 × 2 × 9.578571319580078) × W
height = spriteRectHeight × 0.99 / (69 × 2 × 9.578571319580078) × W
```

选用的 `skin00` 对象为：

- bundle `ingameskin/fieldskin/skin00`；
- serialized file `CAB-0796b45ad7120b116ef51c20b5df5ecd`；
- `Sprite game_play_line`，pathId `3141674654239334496`；
- rect `1800×38`、Center pivot、PPU `69`；
- 本地解包路径 `assets/star/forassetbundle/startapp/ingameskin/fieldskin/skin00/game_play_line.png`。

在 `1334×750` 下，未取整结果为：

```text
center  = (667, 615.2393796558299)
size    = (1798.3892822082348, 37.965995957729405)
left    = -232.1946411041174
top     = 596.2563816769652
right   = 1566.1946411041174
bottom  = 634.2223776346946
```

运行时合同只取到舞台常量当前保留的精度。判定条中心覆盖 `y=615` 的底板末端，而不是把判定条上沿放在底板下方。

所有已准入 `game_play_line` Sprite 的宽度均为 `1800`、Center pivot、PPU `69`。高度分别为：`skin00...skin02` 为 `38`，`skin03` 为 `18`，`skin04` 与 `skin13` 为 `40`，`skin05...skin12` 与 `skin14` 为 `56`。运行时因此保留相同中心与宽度公式，只从所选 Sprite rect 推导高度与 top。

### 合成、过滤与裁切

固定正常播放合成关系由以下 JP 设置支持：

| 内容 | 承载节点 | 相关顺序 |
|---|---|---:|
| `liveBG` | `UI_Root_Back` UIPanel pathId `1439` | render queue `3000` |
| 轨道底板 | `RhythmGameLines` UIPanel pathId `1444` | render queue 从 `3690` 开始、Renderer order `0` |
| 普通判定条 | SpriteRenderer pathId `1054` | sorting order `20` |

背景与底板使用 `Unlit/Transparent Colored`，混合为 `SrcAlpha / OneMinusSrcAlpha`。判定条使用 `Sprites/Default`，混合为 `One / OneMinusSrcAlpha`；这是标准的预乘 alpha Sprite 路径，不是 additive。三层均使用 Linear/Bilinear、白色乘色、普通 alpha，并由最终 viewport 裁切。

`BgCover` 在正常播放过渡完成后为透明，不属于固定舞台。`StageBack`、`StageFront`、fever 内容与特效对象不会改变当前三层白名单。

## 当前实现映射

锁定值实现于 `src/app/[locale]/bandori/songs/[songId]/native-stage-contract.ts`。`NativeSimulatorStage.tsx` 会把三张静态舞台纹理与已准入的 Note 资源放入同一个并行加载批次，并按锁定的合成顺序添加显示层。

本地开发资源直接从 `public/local/chart-simulator/` 下的 JP 解包原路径加载。运行时没有资源 API、manifest、地区层级、版本选择、hash 门槛、catalog 或 fallback。分析快照标识只用于证据溯源，不会建立运行时版本或 hash 管理合同。

运行时可见的 URL 族为：

- `/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/bgskin/skin00/livebg_normal.png`；
- `/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/fieldskin/{skin00...skin14}/bg_line_rhythm.png`；
- `/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/fieldskin/{skin00...skin14}/game_play_line.png`。

## 明确延期或禁用

静态舞台完成不批准以下内容：

- 普通点 Note 的渲染与运动不由本静态舞台账本准入；其后续证据独立记录在[原生点 Note 证据账本](bandori-chart-simulator-native-notes.zh-CN.md)；
- Long/Slide 渲染不由本静态舞台账本单独准入；其后续证据与失败关闭边界隔离记录在[原生 Note 证据账本](bandori-chart-simulator-native-notes.zh-CN.md)中；
- `game_play_line_skill_adjust_effect` 的显示时机或技能状态接入；
- 判定文字、击打反馈、tap effect、粒子或声音；
- 片头淡入、缩放、移动或常驻可见 `BgCover`；
- fever 背景切换；
- Light、practice、versus、team-live、MV、Live2D 或 Star3D 背景分支；
- `Meta.isMultiRangeNotes` 透传或自动宽底板选择；
- 固定参考舞台内部的原生高宽比或安全区改写；
- 整体舞台镜像；
- 任何 Bestdori-compatible 或人工调参演出 profile。

技能判定条已知会共用普通判定条的位置和最终缩放、sorting order 为 `21`，其 AnimationClip 也没有 position 或 scale 曲线。由于触发状态和显示生命周期尚未进入模拟器白名单，它仍保持延期。

## 变更控制规则

以后修改这份静态舞台合同时，必须同时提供：

1. JP APK entry 或 JP bundle 名；
2. serialized file、Unity type、对象名、pathId 与相关字段路径；
3. 序列化值被运行时代码修改时的 JP IL2CPP 方法或调用链；
4. `confirmed-static`、`confirmed-static-plus-code` 或 `unresolved` 分类；
5. 新增可见演出能力前的用户明确确认；
6. 当已准入数值、来源路径或图层顺序漂移时会失败的聚焦契约测试。

证据冲突或不完整时必须失败关闭。视觉检查可以否决错误实现，但不能提供替换数值。

## 分析输入

证据通过只读方式来自：

- JP client `10.1.3` 的 base APK 与 arm64 split APK；
- JP `AssetBundleInfo` data `10.1.0.221`；
- APK 序列化 entry，包括 `level3`、`globalgamemanagers`、Stage prefab entry 与 shared asset splits；
- JP `ingameskin/bgskin/skin00`、与其逐字节相同且用于分析的 `ingameskin/bgskin/habahiro` 文件，以及 `ingameskin/fieldskin/skin00...skin14` bundle；
- JP IL2CPP metadata 与 arm64 代码。

分析使用了序列化对象检查、UnityPy、IL2CPP metadata、ARM64 反汇编、relocation 检查与确定性坐标计算，没有进行视觉校准。
