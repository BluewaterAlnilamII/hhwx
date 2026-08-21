# Bandori 谱面模拟器原生 Note 证据账本

## 完成边界

已确认的下落 Note 切片在以下固定正常播放状态下已经闭合：

- 参考画布 `1334×750`；
- `NoteSize=100`；
- `NoteSpeed=1.00...12.00`、最小步长 `0.01`、模拟器默认值 `10.00`；
- `SuddenLane=false`；
- JP `MasterSkin.skinNotesMap` 中七种节奏标志皮肤之一；已确认的 Habahiro 多宽 Sprite 按多轨 Note 单独选用，不作为另一种样式；
- JP `MasterSkin.skinDirectionalFlickMap` 中五种左右 Flick 标志皮肤之一；
- 只作用于谱面数据的镜像。

本账本准入下落中的 Single、普通及由 `laneChange` 标记启用的多轨 Long/Slide 几何、`width=1...7` 的 Directional 组合，以及普通和已准入多轨 normal/Skill/Flick/Long/Slide Note 的自动 Perfect 反馈、Perfect 判定文字、普通／All Perfect Combo、同时点击线／节奏辅助／轨道效果／All Perfect 状态显示开关和 Note 音效。Habahiro 不是节奏标志样式：只有具体的多轨 Note 会选用已确认的多宽 Sprite，单轨 Note 继续使用当前 `TYPE1...TYPE7` 样式；谱面不会触发整套换肤或 lane-change 演出。交互式触摸/断 Hold 分支、TapSE 音量控件和其它未确认设置继续排除。

以下数值均为 `confirmed-static-plus-code`。截图与浏览器输出不能作为参数来源。JP `NoteUtility.CalcNotePosition` 先用时间进度计算指数位置进度，再以同一个指数值计算 X 与 Y；因此轨迹严格位于 Launcher 起点到判定点的直线上。不得把原始时间进度直接用于 X，也不得把指数值从 `p=0` 位置再次归一化到终点。

## 源对象

JP `ingameskin/noteskin/skin00` bundle 对应 serialized file `CAB-77a4d16d885ff6e15832dabe4903fe45`。本切片准入的 `note_normal`、`note_skill`、`note_flick`、`note_long` 各 lane 家族使用 `308×120` Sprite rect、中心 pivot `(0.5,0.5)` 与 `pixelsToUnits=100`；`note_slide_among` 也是 `308×120`，`note_flick_top` 为 `171×138`。同一 bundle 提供 `longNoteLine` 与 `longNoteLine2`，两者都是 `146×205`、RGBA32、Bilinear、Clamp。

JP `ingameskin/noteskin/directionalflickskin00` bundle 对应 serialized file `CAB-5a6a5782278c3e743a201eb818d85fae`。左右方向各 lane 家族为 `308×120`；`note_flick_top_l` 为 `138×171`，`note_flick_top_r` 为 `138×170`。所有准入 Sprite 都是中心 pivot、PPU `100`；`FlickNoteLine_l/r` 是 `10×78` 的连接纹理。

运行时直接加载原始纹理图集：

- `.../noteskin/skin00/rhythmgamesprites.png`（`2048×1024`）；
- `.../noteskin/directionalflickskin00/directionalflicksprites.png`（`1024×1024`）。

已经核验的 Unity Sprite `m_Rect` 固定在路由私有源码中。Unity rect Y 从图集底边起算，所以传给 Pixi 的坐标为 `top = atlasHeight - y - height`。分别导出的 Sprite PNG 不作为运行时输入：它们已经裁掉透明边缘，无法单独继续承载原始 rect 与 pivot。

节奏标志选择器严格遵循 master ID，而不是 bundle 名称顺序：

| UI 类型 | Master ID | bundle | 已核验 rect 表布局 |
|---|---:|---|---|
| TYPE1 | `1` | `skin00` | A |
| TYPE2 | `2` | `skin01` | A |
| TYPE3 | `3` | `skin02` | B |
| TYPE4 | `4` | `skin03` | B |
| TYPE5 | `5` | `skin04` | A |
| TYPE6 | `6` | `skin06` | C |
| TYPE7 | `7` | `skin05` | B |

A、B、C 三种布局分别保留所有已准入 `note_normal`、`note_skill`、`note_flick`、`note_long`、`note_slide_among` 与 `note_flick_top` Sprite 的精确 Unity `m_Rect` 表。所有已准入本体仍为 `308×120`、Center pivot、PPU `100`；布局只改变图集坐标，不改变放置或运动。TYPE7 master 的 `noteSyncEdgeMargin=1.1` 会存入 `NoteManager`，并且只传给 `SetupSyncLine`；已追踪的 arm64 路径不会把它传入 Note 本体渲染。

Habahiro 不是第八种 UI 类型。多轨本体按覆盖 lane 选择 JP 直接 Sprite，单轨本体继续使用当前 TYPE1...TYPE7 样式。已批准的多轨 Flick 顶部契约分为三档：宽 1 使用 `note_flick_top`，宽 2 使用 `note_flick_top_2`，宽 3...7 使用 `note_flick_top_3`。

左右 Flick 标志选择器按照 master ID 将 TYPE1...TYPE5 映射到 `directionalflickskin00...04`。五组本体 rect 表完全相同。`note_flick_top_r` 在 TYPE1 中为 `138×170`，在 TYPE2...TYPE5 中为 `138×171`；运行时只切换这个已核验高度，继续保留共同的 Center pivot 与 PPU `100`。

## 原生语义解析

JP `NoteBase.setupNoteType` 先选择具体 Note 类与基础 Sprite，之后才进入可选 Skill 路径。本切片准入以下语义：

| 编译点 | 优先级 | 本体 Sprite | 图标 |
|---|---|---|---|
| Single | `flick > skill > normal` | `note_flick_{lane}`、`note_skill_{lane}` 或 `note_normal_{lane}` | Flick 时为 `note_flick_top` |
| Long 起点/终点 | 普通或 Skill 端点 | `note_long_{lane}` 或 `note_skill_{lane}` | 存在 Flick/Directional 端点标志时保留对应图标 |
| Slide 起点/终点 | 普通或 Skill 端点 | `note_long_{lane}` 或 `note_skill_{lane}` | 存在 Flick/Directional 端点标志时保留对应图标 |
| Slide 可见中间点 | 非端点 | `note_slide_among` | 无 |
| Directional 宽 1...7 | 相邻每轨一个本体 | `note_flick_l/r_{lane}` | 只在方向外侧保留一个 `note_flick_top_l/r` |

Single 同时带 Flick 与 Skill 时仍为 Flick。Long/Slide 的 Skill 端点会把端点本体替换为 `note_skill`，但保留 Flick 或 Directional 图标。普通 Slide 终点保持 `note_long`；只有可见且非端点的 Slide 节点使用 `note_slide_among`。隐藏 Slide 节点保留 Transform 与连接拓扑，但不绘制点 Sprite。

转换后的 `charge` 标志表示 JP fever additional type，不会替换下落本体 Sprite。`note_long_flash` 是独立子节点，初始隐藏，只在成功触摸开始后激活。因此本下落切片中 charge 是视觉 no-op；尚未闭合的 `charge + skill` 组合则失败关闭。

## 纯表现设置

同时押线、节奏辅助和轨道效果均不改变谱面、判定窗、分数、输入、音效或 Note 轨迹。游戏无存档首启默认分别为开、关、关；按用户明确要求，本模拟器三项均默认开启。

同时押线连接同刻且已准入的普通前端 Note 和 Long/Slide 端点。`width=1...7` 的 Directional 组合折叠为一个逻辑目标并取面向相邻逻辑目标的最外本体；Flick 图标不作为端点。多轨非 Directional Note 只提供一个位于覆盖 lane 算术平均位置的根 Transform，Sprite 边缘不作为端点；Slide 中间点仍不参与。线使用当前 Note 皮肤的 `simultaneous_line`；普通端点应用该皮肤 margin，Directional 使用零 margin；线宽为左目标 `worldScale × 0.28 × 375`。

节奏辅助仅作用于普通、非技能的 Point Note 前端本体。原生对小节内分数计算 `((numerator × 8) % denominator) > 0`；导入后的 BMS beat 改以四分音符计数（`beat = measure × 4 + numerator × 4 / denominator`），所以 Web 中的等价条件是 `!Number.isInteger(beat × 2)`。条件成立即表示 Note 不在八分音符网格上，此时把 `note_normal` 替换为当前皮肤同 lane 的 `note_normal_16`；Skill、Flick、Directional、Long 与 Slide 不变。关闭时恢复 `note_normal`。

轨道效果开关只门控 `NoteLaneEffectOn`，不影响普通、Skill、Flick 或 Directional 的主点击粒子。七条 lane 使用 `NoteLaneEffect_1,2,3,4,3,2,1`、PPU `69`、底部中心 pivot，右侧三条镜像。普通谱面开启后等待两个演出更新，再于 `0.16666667 s` 内把颜色从 `(1,1,1,1)` 线性变为 `(0.7,0.7,1,0)`，尺寸保持不变，最后隐藏。由 lane-change 标记启用的多轨谱面中，`NoteLaneEffectOn` 会在启用 Animator 前直接返回，所以即使开关开启，整首谱面所有 Note 的标准轨道高亮可见数也恒为零。关闭设置时会立即清除普通谱面中正在显示的 lane highlight，并忽略后续开启事件。

## Perfect 击打反馈

本能力的近似边界经过有意收窄。

`NoteFrontBase.judgeFrontNote`（`0x30E0FEC`）进入 `GamePlayButton.PlayAnimation`（`0x387D94C`），后者选择普通、Skill、Flick 或 Directional 分支，并经 `playParticle`（`0x387F118`）重启所选根节点。自动播放通过 `NoteFlickBase.forcePerfect`（`0x3A77768`）进入相同的 Perfect 接受路径。普通 Flick 调用 `playFlickNoteParticle`（`0x387F37C`）并播放 `effect_tap_swipe`。Directional 调用 `playDirectionalFlickNoteParticle`（`0x387F21C`），随后 `NoteDirectionalFlick.onFinishJudgeFrontNote`（`0x30EA084`）经 `PlayDirectionalFlickFingerEffect`（`0x387EFA0`）播放同方向 finger 根。对于前端/Single 击打，Skill Flick 用 Skill 根替换 swipe 主根；Skill Directional 用 Skill 根替换 Directional 主根，但仍保留同方向 finger 根。

Long/Slide 的 Flick 或 Directional 尾端进入相同的终端粒子分支。Long 头部此前已重置 skill 属性，Slide 尾端分派固定 `isSkill=false`，所以即使尾端外观带 skill 标记，仍播放 Flick 或 Directional 终端粒子而不是 Skill 根。其外围 `ExecTouchEnded` 也会开启根标量 lane 的按钮闪光：Long 在 `judgeAfterNote` 前调用 `NoteLaneEffectOn` / `NoteLaneEffectOffReserve`；Slide 先关闭此前跟踪的 lane，再在 `afterNoteJudge` 前后开启并预约关闭当前尾端 lane。因此宽 2/3 Directional 尾端的主效果和 lane 闪光仍放在标量根 lane。主 prefab 的 `notes` 子发射器采用下文单独批准的手动定位。镜像在事件分派前同时解析 lane、方向、根端与远端。

Web 只在正向播放越过已接受的击打时间时触发。拖动定位、固定跳转、重开、难度切换、`MoveTime` 重建或时钟倒退都会清除活动反馈，不构造历史击打；`PlayAnimation` 与 `PlayDirectionalFlickFingerEffect` 在 `MoveTime` 中都会明确早退。

普通根节点 `effect_tap_perfect` 有六个活动子系统：`star`、`Smatt_1`、`Sring_2`、`ring_2`、`kira_par_2` 与 `ring_3`。Skill 根节点 `effect_tap_skill_perfect` 包含 `Sring_2`、`Smatt_1`、`star`、`Sring_1`、`kira` 与 `Star_center`。重复播放执行已确认的 Stop/Clear/Play 重启，不叠加残留粒子。两者均来自 JP `ingameskin/tapeffect/skin00`，并使用 `1024×1024` 的原始 `Tex_parSet_1/2` 图集及其 `4×4` 网格。运行时精确保留图集格、Additive 材质、源 order `5`/`50`、全部在时间零发射、静态系统起始大小与源曲线、Kira 数量 `25`、起始 lifetime `0.3...0.6 s`、speed `1...40`、size `0.2...0.6`、Box shape `2.5×0×0.72`、Limit Velocity `0.7`、dampen `0.2`、颜色及最长 `0.9 s` 可见生命周期。

按钮闪光不是近似。APK `level3` 提供 `NoteLaneEffect_1...4`、源 PPU `69`、底部中心 pivot，以及对称 lane 映射 `1,2,3,4,3,2,1`；物理 lane 4...6 执行 X 翻转。它等待两次演出更新，随后在 `0.1666667 s` 内保持尺寸不变，并令颜色从 `(1,1,1,1)` 线性变为 `(0.7,0.7,1,0)`。

经用户批准的有界近似只覆盖在 Pixi 中表达 Unity 粒子模块所需的引擎求值：用每个 Note 的确定性 seed 代替 Unity 自动随机流；从数据中执行已恢复的 MinMaxCurve、MinMaxGradient、burst、Box/Circle/Cone shape、gravity、Size/Rotation/Color over lifetime、Limit Velocity、UV sheet、Billboard 与 Stretched Billboard 契约。普通与 Skill `Smatt_1` 都保留源效果在屏幕上的 `-90°` 朝向，并把纹理长度轴的 `U=0` 原点放在击打点，不再把完整长度居中分到击打点两侧；Skill 根节点精确的 `localScale.x=0.5` 缩窄其横轴。Flick 使用 `effect_tap_swipe` 的全部序列化 active 子节点；Directional 分别使用左右 span-1/2/3 主根和左右 finger 根，并保留 JP 图集格、Additive 混合、order `1`/`5`/`50`、burst 数、颜色、曲线与 lifetime 包络。该近似不允许人工调整触发类型、位置、图集格、层数、burst 数量、范围、颜色、曲线、混合、排序或生命周期。截图只用于结构 smoke check，不是数值参数来源。

另有一组与 JP 原生证据分开记录的用户明确批准手动覆盖；它们属于渲染器全局 Web 补偿，会应用于普通与限定演出 recipe 中语义等价的节点。swipe 粒子的尺寸均以运行时完整求值后的宽高按 `1.0` 绘制，Web 不再对 `slash`、`notes`、`burtst` 或 `spark_*` 叠加额外倍率。普通 Flick 的 `effect_tap_swipe/slash`、Persona Flick 的 `effect_tap_swipe/line1`，以及普通或 Persona 左右 Directional finger 的 `/slash` 都覆盖纵向定位：最终 quad 的求值后纵向范围有三分之一位于判定条上方、三分之二位于判定条下方。Directional main 根仍位于标量 lane。在普通与 Persona recipe 中，`/notes` 的视觉目标均在 width 1 时为唯一一个本体外一轨，在 width 2/3 时为最外侧本体／尖端区域。由于纹理从固定内侧边向外增长，而不再以该视觉目标为中心，固定根部必须从此前的居中位置向内退一轨：width 1 锚定最外侧本体 lane，width 2/3 锚定尖端向内一轨。中心再随当前求值后的源长度向外移动半个长度，从而保留原始 size 与 color 曲线，同时不重复叠加目标轨道。width 3 保留源数据中 `t=0` 与 `t=0.1` 的两次 burst，二者共用修正后的固定根部。各子系统的原始颜色来源与确定性 seed 保持不变，包括白色的 `notes`、`spark_*` 与 finger `Sring_1`，不新增颜色随机器。

每个 Note 的确定性 seed 仍是明确保留的 Web 近似，同一个 Note 重复播放会得到完全相同的排布。在这条固定随机流内部，Unity Fixed Random Color 的 key 按序列化的累计选择边界解释，不再误用普通的 Fixed 生命周期插值，因此所有原始离散颜色都可被选中，且没有增加新的随机源。shape 发射方向也保留 Transform 的有符号手性：右向 Directional 根的负 X 缩放会镜像对应的左向粒子路径，但不改变已恢复的锥角、速度、lifetime、正缩放幅度或 Limit Velocity 数值。对全部已纳入的 swipe 与 hold 配方清点后，Fixed Random Color 只出现在 Directional `star_*` 系统；带运动的负缩放发射只出现在右向 Directional 的 `spark_*` / `star_*` 系统。其余负缩放节点的起始速度为零，不受此次修复影响。

## Long、Slide 与多宽 Directional 几何

普通 Long 只在两个同轨端点之间生成一条纹理带。普通 Slide 会先在编译阶段复现 JP `MusicScoreBezierConverter`：每个 connection-control-connection 三元组按二次 Bézier 以 `i/200`（`i=1...199`）采样，按 48 tick 时间合并，量化为原生 lane 加 `DiffVolume`，再应用已确认的“平坦或方向差小于 2°”简化规则。控制点随后被消费为隐藏 Slide 节点。已发布的谱面资源也可能已包含该转换结果，因此仅允许带 `hidden` 标记且不是首尾端点的 Slide connection 使用小数 lane；该连续位置按原生 midpoint-to-even 得到的标量基准 lane 必须仍在 0...6 内，边缘 `DiffVolume` 偏移（例如 `-0.4` 或 `6.4`）会原样保留而不会被夹取。其他源 connection 仍必须使用整数 lane。运行时仍只在相邻节点间画直线分段，不再计算样条。只要任一生成或源 Slide 节点为 hidden，整条 Slide 的全部段都使用 `longNoteLine2`，否则全部使用 `longNoteLine`。

普通 `NoteMesh` 有 22 个顶点、11 个横截面、20 个三角形；UV V 为 `0,0.1,...,1`，九个内部横截面按 0.1 线性插值。速度严格大于 `11.010000228881836` 时——在已准入控件上即 `11.02...12.00`——原生 `NoteMeshAdvanced` 使用 42 个顶点、21 个横截面、40 个三角形、0.05 的 UV V 步长及已核验的 `/40` 端点权重。Prefab 中序列化的网格 scale `0.8` 不进入运行时，因为 `Activate` 会将其重置为 1。

普通链的 `NoteMesh.GetMeshWidthRate` 为 `1.0`。由 lane-change 标记启用的多轨链，每个横截面取覆盖 lane 的算术平均中心，半宽为 `N × rate(N) × projected.worldScale × 375`：`rate(1)=1`、`rate(2)=1.0499999523162842`、`rate(3...7)=1.05 + 0.03000009059906006 × min(0.996,1)`。隐藏多轨节点仍是两侧相邻直线段的真实端点，并使整条 Slide 选择 `longNoteLine2`。Directional 尾端始终保持标量根 lane 和一轨 mesh 宽度；add 本体与背线不进入 `NoteMesh`。未来节点保留 Launcher mesh 位置以避免绿条过早截断，但 Note 本体仍等到自己的 Move 时间窗才显示。

宽 1...7 Directional 都不是横向拉伸一张 Sprite。宽 `N` 展开为 `N` 个相邻标量本体、方向外侧唯一一个 icon，以及 `N-1` 条中心到中心的背线；既有背线宽度、UV、插入顺序和排序契约不变。

JP APK 的连接网格材质使用 `star/Star Transparent Colored` Shader，采用 `SrcAlpha` / `OneMinusSrcAlpha` 混合且不写入深度。序列化材质中的阈值数值仍作为证据保留：普通 Long 绿带为 `2000`、曲线 Slide 绿带为 `704.72900390625`、左右 Directional 背线均为 `750`，但 Web 不会把它们用作额外的舞台 Y 裁切。若按这种方式应用曲线 Slide 数值，网格会在 `y=45.27099609375` 被截断，而 Note 已在约 `y=28.4633423021` 进入已确认的 Move 时间窗。普通 `SuddenLane=false` 路径只由舞台 viewport 裁切。该 Shader 首先将采样纹理乘以网格顶点颜色；`NoteMesh.initMesh` 将每个 Long/Slide 顶点初始化为 RGB `1,1,1`、alpha `LongNoteLineBrightness / 100`。原生默认按钮选择 `80`，准入范围为 `10...100`，每次调整 `10`。这些数值继续作为原生证据保留，但暂不接入 Long/Slide 的 Web 运行时。

由于当前原生 Android Shader 变体、颜色空间与最终 GPU 合成尚未形成可复核的像素级闭环，Long/Slide 暂时退回到 Pixi 默认 `MeshSimple` 材质：直接使用解包 PNG 自带的 alpha 和标准纹理混合，不再额外应用顶点 alpha `0.8`、非线性 alpha 变换或 `no-premultiply-alpha` 上传覆盖。这是用户批准的临时原始纹理基线，不声明为原生材质还原。Directional 背线继续使用已实现的 straight-alpha 自定义 Shader，并保持顶点 alpha `1`；它不受此次回退影响。

背景、轨道底板、判定条、Note 本体和方向 icon 仍使用普通 Sprite 合成。Habahiro 直接读取解包后的 JP Sprite 并保留渲染后 pivot，不使用 CSS 拉伸，也不与特定谱面自动绑定；多轨点击与长按的选择和生命周期在下文动态部分中单独定义，不从本静态 Sprite 契约推测。

## 固定投影与生命周期

参考画布上的原生相机换算为：

```text
screenX = 667 + 375 × worldX
screenY = 375 - 375 × worldY
```

按钮 local X 为 `[-6.6,-4.4,-2.2,0,2.2,4.4,6.6]`，终点 local Y 为 `-3.4500000477`。定义：

```text
r = (1334 / 750) / 9.578571319580078
goalX = buttonX[lane] × r
goalY = -3.4500000477 × r
leftGoalX = -6.6 × r
launcherY = goalY + leftGoalX × -1.3439395427703857
startX = 0.05 × goalX
startY = goalY + 0.95 × (launcherY - goalY)
```

JP `LiveSettingsHiSpeed` 已闭合设置契约：构造函数写入上限 `12.00`，默认按钮写入 `5.00`，三组按钮分别执行 `±0.50`、`±0.10` 与 `±0.01`。APK 会在一次调整越界时直接循环；经批准的 Web 交互有意不同：全部调整都会吸附并停在 `1.00` 或 `12.00`，已经处于边界时继续向外调整不会产生变化。控件使用普通文字按钮，不宣称复刻游戏按钮图案。

对于准入的速度 `s`，原生到达时长为：

```text
A = s > 11.01 ? 1.6 - 0.1 × s : 6 - 0.5 × s
```

APK 默认按钮值 `s=5.00` 对应 `A=3.5 seconds`；用户指定的模拟器默认值 `s=10.00` 对应 `A=1.0 second`。确定性 Web 投影只在 `hitTime-A <= presentationTime <= hitTime` 时返回点；原生 `Activate` 的精确首帧单独使用 `(startX,startY)`，随后 `CalcNotePosition` 使用：

```text
p = clamp(1 - (hitTime - presentationTime) / A, 0, 1)
e = 1.1 ^ ((p - 1) × 50)
x = startX + e × (goalX - startX)
y = startY - abs((startY - goalY) × e)
d = abs(launcherY - y) / abs(launcherY - goalY)
```

固定 `NoteSize=100` 与普通高宽比状态下：

```text
q = r × d
worldScale = q × 0.996 + 0.004
spritePixelScale = worldScale × 375 / 100
```

七个终点 X 约为 `[207.4116,360.6078,513.8039,667,820.1961,973.3922,1126.5884]`，终点 Y 约为 `615.23938`。lane 0 的 `CalcNotePosition(p=0)` 屏幕坐标约为 `(640.3013,33.4618)`，`p=0.5` 约为 `(603.7233,82.6204)`；原生 `Activate` 首帧起点约为 `(644.0206,28.4633)`。出现时的 world scale 约为 `0.01474420`，到判定条时约为 `0.18894950`。

Note 时间不由独立 tween 持有。播放时 Pixi ticker 每帧读取 audio 元素的 `currentTime`；暂停、拖动、重开或跳转时读取可确定重建的 transport 状态。

获批的 Web 慢放控件明确位于原生证据契约之外。它在保留音乐音高的同时把媒体元素设为 `0.50×...1.00×`。默认关闭“同步慢放谱面速度”：判定时刻继续由放慢后的媒体时钟决定，但预判定 Note/ribbon 的谱面到达窗口会乘以当前播放倍率，使其现实时间下落速度保持与 `1.00×` 相同，并自然拉大 Note 间距；开启开关后，到达窗口不再缩短，下落才随音乐一起变慢。已经判定的 Long/Slide 根部移动仍按谱面拍点推进。另一个效果动画时钟只在 transport 播放时按 ticker 的真实秒数推进；点击、侧滑、轨道、TapKeep 与 TouchingFlash 动画因此始终保持普通 `1×` 速度，只由放慢后的谱面时钟决定触发时刻。

## Flick 图标运动与绘制顺序

令 `tau = mod(max(0, presentationTime - (hitTime-A)), 1/3)`，图标 local position 为：

```text
普通 Flick：(0, 0.7 + 1.8 × tau, 0)
左 Flick：  (-1.6 - 2.1 × tau, 0, 0)
右 Flick：  ( 1.6 + 2.1 × tau, 0, 0)
```

图标与父 Note 共用移动和 world scale；世界坐标正 Y 换算为屏幕负 Y。本体先于图标插入。这保留了本体 sorting order `70`；方向图标使用更高的 `71`，普通 Flick 图标与本体同为 `70` 并沿用原生子节点顺序。

舞台 viewport 负责裁切。普通 `SuddenLane=false` 状态不增加额外 mask。Single、处于 Move 的 Long/Slide 节点和所有展开后的 Directional 本体共用同一套“时间→进度→投影”函数。Ribbon 节点只额外增加上文已确认的 Launcher/Move/Stop 生命周期状态，不引入第二套下落路径。

## Long 与 Slide 的 AutoPerfect 反馈

准入的动态路径遵循 JP 10.1.3 AutoPerfect 生命周期。Long 头部发出 normal 或 Skill Perfect 一次性效果，同时启动 `effect_TapKeep` 并开启 `TouchingFlash`；尾端先停止并清空两个持续效果，再发出 normal、Flick 或 Directional 终端效果。Slide 头部执行相同启动流程；每个可见中间点只发出一次 normal Perfect，不重启持续效果；隐藏控制点不发判定粒子。Slide 始终复用同一个无后缀池化持续粒子实例，根节点沿判定线使用已确认的 ribbon Stop 阶段插值，从当前 connection 连续移动到下一个 connection；Slide 节点宽度变化不会替换或重启该实例。已接受的起点 Note 本体在尾端前复用同一个移动根节点；可见中间点和尾点的 Note 本体在各自判定时刻之后退场。独立 Directional 与 Long/Slide 的 Directional 尾端都只在标量根 lane 各触发一次 main 和同方向 finger；width 1、2、3...7 分别选择 main prefab 桶 1、2、3，width 4...7 直接复用 width-3 prefab，不拉伸、不重复，也不把触发点移到展开组的最外侧本体。

普通谱面的轨道效果是经过两次更新后进入淡出的离散脉冲，不是由 hold 状态维持的常亮。Long 只在头部和尾部点亮一次标量 lane。AutoPerfect Slide 在头部先点亮 head lane，随后立即点亮 first-after 的标量 lane；first-after 即使隐藏也不会被跳过，同 lane 时只是重启同一个 GamePlayButton，不会产生第二个对象。之后每个可见 checkpoint 先关闭 tracker 记录的旧 lane，再点亮当前标量 lane；隐藏 checkpoint 不触发也不更新 tracker。尾部先关闭 tracker，再只点亮尾点的标量根 lane。Flick/Directional 的 width 不会扩展轨道效果范围。多轨谱面则由原生 `IsMultiRangeNotes` guard 阻止每一次成功启用，因此 Point、Long 与 Slide 全生命周期的可见标准轨道高亮均为零。

单轨根的 `TouchingFlash` 直接使用所选 JP Note 皮肤解包后的 `note_long_flash_0...6` Sprite；多轨根则按连续 covered lanes 精确选择 28 张 Habahiro Sprite 中的一张，从 `note_long_flash_0_1` 到 `note_long_flash_0_1_2_3_4_5_6`，逻辑宽度为 `524...1596`、高度仍为 `120`，并保留解包后的渲染 pivot。持有本体与闪光只按 ribbon 头部覆盖范围选择一次 Sprite。同一个根可以沿 Slide 路径移动——包括谱面层跨轨／曲线 Long 被原生转换成 `NoteSlide` 的情况——但之后的可见或隐藏 connection 都不会重新选择任何 Sprite。Web 精确保留循环 `LongNoteFlash` 颜色曲线：周期 `0.8333333135 s`，RGB 在两端为 `0.2`、在 `0.4166666567 s` 为 `0.6`，alpha 恒为 `1`，两段均使用已恢复的 Unity Hermite 多项式。它在 Note 上方使用原生等价的 additive `SrcAlpha/One` 合成，因此只能加亮本体，不会用灰色椭圆覆盖本体。闪光在头部成功接受时开始，跟随同一个 Slide 插值根节点，并在成功尾端移除。

多轨一次性效果按 `ButtonTypesArray.Length-1` 选择，并放在 `GetEffectTargetButton`——即覆盖范围的下中位 lane，而不是 Note Sprite 的算术平均中心。普通 Perfect 只有 active `star` 发射器的 X 起始尺寸改为 `2.5 × width`；Skill Perfect 的宽 1...7 序列化树完全相同，但仍保留宽度选择；Flick 只有 `square` 的 X 起始尺寸改为 `2.5 × width`，`slash` 与其它发射器不变。这些宽度规则继续运行于上文同一个有界 Web 粒子近似中，不授权新增全局缩放倍率。

`effect_TapKeep` 由 JP prefab 解释执行，不是手绘替代。Long 按头部宽度选择按钮 prefab：`par_square` 的 X 起始尺寸为 `2.5 × width`；width 2...7 关闭 `par_parOnpu_a/b`；宽 1...7 的 Size-over-Lifetime 首 key 分别为 `0.4882629216, 0.4882629216, 0.5859267712, 0.6114089489, 0.6496245861, 0.6496245861, 0.7005774379`，并使用各自已恢复斜率。Slide 则始终从八实例池取得无后缀 `effect_TapKeep`，只在头部启动一次，并跨越宽度变化和 hidden 控制点保持同一个对象。准入层级排除序列化为 inactive 的 `par_parStar`，保留原始 Transform、模块、sorting order `50`、图集帧选择，以及基于 `Tex_parSet_1` / `Tex_parSet_2` 的 additive 材质。原生 `autoRandomSeed=true` 本身不定义可复现的逐粒子排布，因此 Web 使用按 ribbon 固定的种子，同时保留已恢复的分布与范围；不宣称随机结果逐帧像素一致。

seek、重开和时间回退会先清除全部瞬时效果，不回放历史一次性效果或 Directional finger 粒子。若目标时间严格位于已准入 ribbon 的头尾之间，只重建 TapKeep、TouchingFlash 与 Slide lane 持续状态。普通速度下其相位仍是原生谱面 elapsed time；启用 Web 慢放时，初始相位由谱面 elapsed time 除以当前倍率得到，随后按播放中的真实秒数推进。长按期间改变倍率不会重置已有的效果时钟；暂停则冻结效果时钟。

## Perfect 判定与 Combo

每次已准入的 AutoPerfect 判定都会在固定 `1334×750` 舞台的屏幕坐标 `(667,535)` 重新触发解包后的 JP `judge_perfect`。居中 widget 为 `286×78`，父级 scale 为 `0.8`；已恢复的非 additive 动画从子级 scale／alpha `0.8/0.6` 开始，在 `0.04 s` 到达 `1.1/1`，于 `0.08 s` 回到 `1/1`，并保持显示至 `1.0 s`。实现直接求值已恢复的 Unity Hermite 曲线，不在关键点之间做线性猜测。暂停会冻结该效果时钟；seek、重开与时间回退会清除瞬时判定文字，且不会补播跨过的判定。

普通 Combo 与 All Perfect Combo 是位于原生 RightCenter 坐标 `(1101.7,292.2)` 的两棵独立叠加树。两者都使用解包后的 `82×116` 数字 Sprite、`70` 的内部步长、`22` 的数字标签偏移，以及 Web 屏幕坐标 `(-6,72)` 上的 `150×42` unit Sprite。数字变化会重新播放已恢复的 `0.8→1.1→1` 缩放动画；All Perfect 叠加层还会运行已恢复的 `0.833333313 s` alpha 循环，从 `1` 降至 `0.5` 后返回。模拟器对所有已准入事件均作 Perfect 判定，因此 All Perfect 状态持续成立；其开关默认开启，并且只隐藏 AP 叠加层，不影响普通 Combo。seek 会直接按目标时刻重建 Combo 数值，不补播历史缩放或判定动画。

## AutoPerfect Note 音效

音效路径独立于 Pixi 舞台并跟随 audio 元素的媒体时钟，所以切换到完整谱面标签不会中断音效。它直接读取 `public/local/chart-simulator/sound/` 下已经解包的 JP 文件；不经过 API、manifest、版本层、hash 查询、CN 资源分支或回退。当前契约允许 TapSE `skin00...03`、默认选择 `skin00`，同时固定 DirectionalFlickSE 为 `skin00`、主音量为 `1.0`（100%）。切换 TapSE 会替换 `perfect.wav`、`flick.wav` 与 `SE_RHYTHM_TAP_LONG.wav`；Directional 和 Skill 继续使用已确认的共用资源。四套 TapSE 音效库都在既有的共享 `AudioContext` 内准备，因此切换不会产生第二套媒体时钟。

AutoPerfect 将普通成功判定映射至 `perfect.wav`，普通 Flick 映射至 `flick.wav`，Directional width 1 映射至 `directional_fl.wav`、width 2 映射至 `directional_fl_2.wav`、width 3...7 映射至 `directional_fl_3.wav`；左右共用同一 width 音效。成功的 Skill 头部会在 Note 类型音效之上叠加 `SE_RHYTHM_TAP_SKILL.wav`。Long/Slide 头部启动对应皮肤的循环 `SE_RHYTHM_TAP_LONG.wav`；每个可见 Slide checkpoint 发出普通 Perfect，隐藏 checkpoint 不发声；尾部发出普通、Flick 或 Directional 音效，并在 `0.3000000119 s` 内把循环音淡出至零。同一谱面位置的相同基础音效按 `TapSEStatusData` 语义合并；不同音效与 Skill 叠加音仍可同时播放。空按键、Great/Good/Bad/Miss、clear、full-combo、cut-in、audience 与 voice 音效继续禁用。

模拟器使用专用的多声部 Web Audio 图，而不复用应用中会截断前一个声音的单声部 UI 音效 helper。音乐媒体元素与 Note voice 接入同一个 `AudioContext`；`0.1 s` 真实时间调度窗口只负责把每个 Note 事件登记到准确的 context 时间点，不构成听觉偏移。启用 Web 慢放时，媒体时间窗口乘以所选倍率，未来的每个媒体时间差再除以该倍率后才换算成 `AudioContext` 时间戳。任何 Note voice 都不会设置 `AudioBufferSourceNode.playbackRate`，所以一次性音效、keep 循环和淡出保持普通声音与时长，只有开始/停止触发跟随放慢后的谱面。倍率变化会丢弃未来已调度 voice，并按对应的 `1×` 样本偏移重建正在活动的 keep 循环。暂停、重开和时间跳转同样会先丢弃已调度的 voice，再重新锚定调度器，且绝不补发跨过的历史一次性音效。重开、固定跳转和拖动提交会先暂停媒体及音效图，等待媒体元素通过 `seeked` 真正提交位置，再按实际提交的媒体时间重建画面与音效状态，最后才恢复播放；新的时间跳转会中止尚未完成的旧跳转，模拟器为 seek 主动暂停所产生的迟到 `pause` 事件也不能再把已经恢复的 transport 错误冻结为暂停。document 可见性变成 `hidden` 时，会在浏览器限频动画帧前复用同一条精确媒体时间暂停路径；恢复可见后仍保持暂停，必须由用户明确点击播放。若恢复播放或 seek 目标位于已准入 Long/Slide 内部，只按对应源偏移重建持续的 keep 循环。未准入 Note/ribbon 与视觉层共用失败关闭判断，不会在画面外偷偷发声。

Web 区间循环只在 transport 层增加半开媒体时间范围 `[A,B)`，每次回环仍调用上述同一 seek。时间输入不吸附；Note 输入按一基 Combo 顺序选择并扩展完整同时组，`A` 使用上一不同时间组与首组的中点或 `0`，`B` 使用下一不同时间组的判定时间或歌曲末尾。Long/Slide 横跨边界时不改变范围，现有 seek 直接重建目标时刻的持续状态。为防止下一组声音在回环前被提前登记，Web Audio 的预调度窗口不得越过 `B`，且时间恰好等于 `B` 的事件必须排除。

## 失败关闭契约

编译器按 v7 谱面契约保留数据，并且不使用 `width` 判断多轨覆盖：`lane` 是标量锚点，`lanes ?? [lane]` 才是权威覆盖。按项目策略，保留数据中的任一 `laneChange: true` 会启用多轨表现，但不会换肤或播放 lane-change 演出。Directional 的 `width` 准入整数 1...7。Long 仍要求两个同锚点端点且没有 curve control；普通 Slide 控制点会被消费，多轨 hidden 节点则保留为显式直线分段端点。Directional 尾端不改变 ribbon 根或一轨 mesh 宽度。旧 `multiRangeWidth` 字段继续拒绝。

出现以下其它任一输入时，点 Note 图层禁用，但已经批准的静态舞台仍然保留：

- 非整数 lane、lane 不在 `0...6`、畸形 width、无效覆盖或锚点不匹配；
- Directional 缺少 left/right direction；
- `charge + skill`；
- 未知 kind、direction 或 flag；
- 两个已准入点 Sprite 具有完全相同的 hit time 与 lane，而相同 order 下的绘制行为尚未闭合。

镜像先于素材选择执行：lane `0↔6`、`1↔5`、`2↔4`、lane `3` 不变，left/right 交换。舞台与图集绝不做全局变换。

## 延期项目

延期项为 `cont_force` 控制、失败／断 Hold 交互分支、交互式 Slide 接触运动、全部 `laneChange` 底板／判定条／背景／闪光切换、病理性重叠多轨同时押线归属、非 Perfect 判定文字、非 AutoPerfect 音效、TapSE 音量控件、其它未确认 Note 设置，以及宽屏／安全区布局。Unity 随机粒子的逐像素完全一致仍不在范围内，材质 `_Threshold` 也不会从序列化默认值照搬。
