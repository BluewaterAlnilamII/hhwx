# Bandori 谱面模拟器重建

## 状态与目标

谱面模拟器正在 `dev/chart-simulator-rebuild` 上作为仅供开发的页面重建。目标是得到一套无损、自动按时间推进的谱面模拟器；只有输入与行为经过游戏原生效果核验后，对应的原生演出能力才可以加入。

开发路由为 `/bandori/songs/{songId}`。生产导航中不会出现该入口；当前阶段也不包含部署、上传或演出资源包发布。

三层基础舞台已经锁定的源对象、运行时推导、完成边界与变更准入规则记录在 [Bandori 谱面模拟器静态舞台证据账本](bandori-chart-simulator-static-stage.zh-CN.md) 中。另行批准的 Note 语义、运动、效果、音效、设置、Habahiro、判定与 Combo 记录在 [Bandori 谱面模拟器原生 Note 证据账本](bandori-chart-simulator-native-notes.zh-CN.md) 中。

## 当前白名单

当前已批准的可运行切片只启用：

- 现有 Music master 详情与 Music asset index 契约；
- 现有同源谱面 API 与共享歌曲音频；
- 对每个源谱面实体的无损克隆；
- 通过带版本的 Worker 编译 BPM、音符、长条与曲线控制点表；
- 由音频主导的播放、暂停、回到开头、固定步长跳转、拖动定位，以及获批的 Web 自有 `0.50×...1.00×` 音乐慢放与可选的 Note 下落速度同步；
- 在任意时间点确定性重建 combo 与活动长条；
- 面向产品分析的完整谱面视图；
- 固定 `1334×750`、随容器整体等比缩放的 Pixi 内部坐标；
- 位于 `left=-216.2`、`top=-131`、`width=1766.4`、`height=1324.8` 的已确认 JP 正常播放阶段 `liveBG` 布局；
- 位于 `left=87`、`top=5`、`width=1160`、`height=610` 的已确认 JP 原生 `bg_line_rhythm` 轨道底板；
- 由用户在 15 种已核验 `MasterSkin.skinLaneMap` 底板间选择，默认使用 Hello, Happy World! master ID `10`（`skin09`），不从谱面特征推断；
- 与所选底板配对、中心位于 `667,615.239`、宽度固定为 `1798.389`、高度来自已核验 Sprite rect 的普通判定条；
- 在固定 `NoteSize=100`、已确认可调 `NoteSpeed=1.00...12.00`、`SuddenLane=false` 下，Single／Skill 点 Sprite、普通与已准入 Habahiro 多轨 Point／Skill／Flick／Long／Slide Sprite 和连接带几何（含原生 hidden 曲线转换与已确认复合端点），以及 `width=1...7` Directional 组合；
- 由用户在七种已核验 `MasterSkin.skinNotesMap` 节奏标志与五种已核验 `MasterSkin.skinDirectionalFlickMap` 左右 Flick 标志间选择；
- 与 Note 本体共用同一演出时钟采样的普通及方向 Flick 图标运动；
- 已准入普通与多轨语义的自动 Perfect 轨道闪光、有界近似点击／侧滑／持续演出、可切换 skin00...03 且固定 100% 音量的 AutoPerfect 音效、Perfect 判定文字、普通／All Perfect Combo、同时点击线、节奏辅助及其已批准开关；
- 复用普通 seek 路径的精确时间或一基 Note 区间循环；
- 只作用于谱面数据的镜像控制。

完整谱面的布局尺寸和颜色属于明确标注的产品 UI。它们不能作为游戏原生轨道投影、运动、判定窗口、特效或其他演出参数的依据。

## 演出能力默认拒绝

未列入上述白名单的能力一律禁用。已准入的自动 Perfect 反馈包含普通及已批准多轨 normal、Skill、Flick、Directional、Long、Slide 的头部、可见 checkpoint、持续与尾端生命周期；Note 音效可在 JP TapSE skin00...03 间切换，音量固定为 100%。`laneChange` 只用于识别多轨谱面合同，不触发底板、判定条、背景、闪光或整套皮肤切换。延期行为包括 `cont_force` 控制、失败／断 Hold 与真实多触点交互、交互式 Slide 接触运动、病理性重叠多轨同时点击线归属、非 Perfect 判定文字、非 AutoPerfect 音效、TapSE 音量控件、片头／fever 演出、非默认 Note Size／Sudden Lane 行为，以及其它未确认原生参数。编译器保留作为标量锚点的 `lane` 与作为权威覆盖的 `lanes ?? [lane]`，不会使用 `width` 判断 Habahiro。

原生演出能力只有在素材来源与行为参数分别核验后才能启用，其实现必须附带记录证据的聚焦 fixture 或 audit。输入缺失或未确认时，该能力保持禁用；不得用猜测参数、占位素材或近似回退替代。

## 演出资源来源

模拟器的演出资源只允许来自官方 JP 资源包。模拟器不得加入 CN 资源包、区服选择器、按服务器分支的资源加载，也不得提供 CN 到 JP 或 JP 到 CN 的回退。JP 包缺少必要资源时，对应能力保持禁用。

本地开发可以把已经解包的 JP 资源文件直接放在 `public/local/chart-simulator/`。这个被 Git 忽略的目录不包含地区层级、版本层级、生成索引或内容寻址契约；普通资源和已核验限定演出的 recipe 都使用由路由代码持有的固定直接路径。文件被放入目录并不代表模拟器可以加载它；对应原生行为核验完成前，演出能力仍保持禁用。

当前舞台使用的代表性直接文件根包括：

- `/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/bgskin/skin00/livebg_normal.png`；
- `/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/fieldskin/{skin00...skin14}/bg_line_rhythm.png`；
- `/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/fieldskin/{skin00...skin14}/game_play_line.png`；
- `/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/noteskin/{skin00...skin06}/rhythmgamesprites.png`；
- `/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/noteskin/{skin00...skin06}/longnoteline{,2}.png`；
- `/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/noteskin/directionalflick{skin00...skin04}/directionalflicksprites.png`；
- `/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/noteskin/directionalflick{skin00...skin04}/flicknoteline_{l,r}.png`；
- `/local/chart-simulator/ingameskin/tapeffect/skin00/textures/Tex_parSet_{1,2}.png`；
- `/local/chart-simulator/apk/textures/NoteLaneEffect_{1...4}.png`。

渲染器从两张 JP 原始图集中按已确认的 Unity Sprite 矩形切片。它不会加载分别导出的 Sprite PNG，因为这些文件已经移除了透明边缘像素，单独使用时无法继续保留原始 Sprite 矩形与中心 pivot。

运行时不经过 manifest、API、hash 门槛、版本选择、地区目录，也不提供资源回退。任一必要文件缺失时，页面会明确显示资源不可用。

Music 区域元数据仍可沿用应用既有的本地化偏好。它只负责描述文本与难度信息，并不是模拟器演出资源来源。

## 限定演出皮肤

限定演出皮肤是叠加在普通皮肤控件之上的独立稀疏覆盖控件。选中后仍保留全部普通选择，只覆盖该已核验家族实际拥有的槽位；被覆盖的普通控件继续可见，但会禁用并标明覆盖来源。清除限定皮肤后立即恢复此前保留的普通选择。限定皮肤不会自动选择歌曲或谱面。

界面只列出浏览器合同已经完整闭合的家族。首个准入项为 Persona：它覆盖底板及配对判定条、Note 与 Directional Flick Sprite、点击／持续及 Directional Flick 粒子 recipe，以及六个已核验 TapSE cue；它不覆盖正常播放背景。合同承诺的任一直接文件缺失时必须失败关闭；家族未声明拥有的槽位不算缺失。

构建器注册表记录 21 个已知家族和 113 个精确 JP bundle，但 pending 或 blocked 家族不会出现在选择器中。April 2019 的普通点击特效依赖当前有界浏览器求值器尚未实现的 Velocity over Lifetime profile，因此继续 blocked。`teamlivefestival` 从限定注册表排除，延期到普通复合背景设置；其它限定背景也统一等普通背景选择器完成后再处理。这里不引入运行时 catalog 或逐家族 manifest。

## 架构边界

- `src/lib/bandori-chart-simulator-contract.ts` 只校验无损谱面外层结构。
- `src/lib/bandori/chart-simulator/` 负责纯编译、带版本的 Worker 协议、定位重建和播放状态；不负责演出素材或区域来源选择。
- `src/app/[locale]/bandori/songs/[songId]/` 负责开发路由、路由私有产品 UI、固定原生舞台契约、渲染器生命周期和完整谱面分析投影。
- 现有 Music API 与公开 Music asset index 继续提供歌曲元数据、谱面描述符、音频、封面、时长、BPM 摘要和预期 combo 数。

未知谱面实体类型与不一致的 combo 元数据都会失败关闭。编译器会保留原始实体数组，不会静默归一化并丢弃不支持的数据。

## 本切片锁定的原生证据

- JP APK `level3` 中的 `NoteLane` 对象及其 `UITexture` 确定了 `1334×750` 参考画布和 `87,5,1160,610` 底板矩形。
- 15 种 JP 底板皮肤共用固定 `1160×610` 原生承载矩形；`skin14` 源纹理为 `1160×608`，会由固定承载节点拉伸，页面仍只整体缩放完整舞台。
- JP `Stage/TRSRoot/bgImage` 链确定了 Center pivot 的 `1920×1440` UITexture、`y=-170` 与正常播放阶段的 `0.92` 缩放；换算到参考画布后即为 `-216.2,-131,1766.4,1324.8`，超出部分由 viewport 裁切。
- 背景内容与布局是两个独立契约。运行时使用规范的 `skin00/livebg_normal`；它与此前用于分析的 Habahiro 文件逐字节相同，且当前只准入这一个背景选择。
- 源 `laneChange` 标记用于识别多轨谱面合同；自动宽谱面底板选择与全部 lane-change 底板／判定条／背景／闪光切换仍然延期。活动底板皮肤只由用户控件选择。
- 所有已准入普通 `game_play_line` Sprite 均为 `1800` 像素宽、Center pivot、PPU `69`；不同皮肤的已核验高度为 `18`、`38`、`40` 或 `56`。原生 `Button4/judgeLine` 公式保留共同中心和宽度，并从所选 Sprite rect 推导高度。
- `Button4/judgeLineAdjustSkillEffect` 是独立且层级更高的技能演出；它与全部判定条动画、反馈均继续保持禁用。
- 镜像在谱面数据中执行：轨道映射为 `0↔6`、`1↔5`、`2↔4`，`3` 不变，并交换左右方向；舞台、相机和资源本身都不会镜像。
- 普通点 Note 在 `NoteSpeed=1.00...12.00` 下使用原生分段到达窗口，用户指定的模拟器默认值 `10.00` 对应 `1.0 s`；APK 默认按钮值仍记录为 `5.00`。控件保留已经确认的三组调整（`±0.50`、`±0.10`、`±0.01`），但不复制游戏按钮图案。其经用户批准的边界行为固定停在 `1.00` 或 `12.00`，不再循环。已确认的七个按钮终点、原生纵深运动与缩放曲线、`PPU=100` 的中心 pivot JP Sprite，以及音频主导的演出时间保持不变。精确推导与语义优先级表锁定在原生点 Note 证据账本中。
- 节奏标志 TYPE1...TYPE7 与左右 Flick 标志 TYPE1...TYPE5 严格遵循 JP master ID。它们只切换已核验图集来源与 Unity rect 表，不改变 Note 投影、运动、缩放或时间。
- Persona 限定演出覆盖使用已核验的直接 Sprite PNG，不假定它们共享普通 atlas 合同。有效底板、Note、Directional Flick、特效与音效选择都在渲染时派生，因此不会覆写保留的普通设置状态。
- 原生 `GameNoteType.Long` 只在两个同轨端点之间使用一条 11 横截面连接带。谱面层 Long 若跨轨、含三个以上节点或曲线，则转换为 `NoteSlide` 运行路径：同一持有 root 沿路径移动，但主 Sprite 和闪光只按头部覆盖选择一次。Slide curve control 会转换并简化为原生 hidden 节点；每对相邻节点生成一段，任一 hidden 节点会为整条链选择曲线纹理族。速度 `11.02...12.00` 切换到已核验的 21 横截面高速网格；未来节点停在 Launcher、Move 节点使用共享投影、已通过节点停在判定线并向下一节点横向插值。
- 宽 1...7 Directional 展开为相邻本体、一个外侧 icon 与 `N-1` 条中心到中心背线；宽 4...7 复用已确认的 width-3 主效果与音效桶，任何宽度都绝不横向拉伸单张 Sprite。
- 自动播放在镜像后的标量根部为全部已准入普通或多轨 Note 生命周期触发 Perfect 反馈。轨道闪光保留 APK Sprite 映射、PPU `69`、等待两次更新、`0.1666667 s` 淡出、scale `1→0.7` 与 alpha `1→0`；多轨谱面保留原生调用目标，但抑制标准轨道高亮的可见输出。点击、侧滑和持续效果保留已准入 JP 纹理、recipe、burst 数量、颜色、源曲线、范围与混合／order 合同。只有 Pixi 无法逐字节复现的 Unity 粒子引擎求值属于有界近似；触发条件和序列化输入保持精确。Perfect 判定与普通／All Perfect Combo 使用已恢复位置和曲线。拖动、跳转、重开或更换谱面状态会清除瞬时反馈，不补播历史击打，并直接重建持久 Combo／hold 状态。
- 手动暂停、协调暂停、开始拖动与固定步长跳转都会先记录精确的 `audio.currentTime`，之后才离开或重定位 playing 状态。因此暂停舞台会冻结在同一个由音频主导的演出帧，不会退回到较低频率的上一次 `timeupdate` 快照。
- `0.50×...1.00×` 播放倍率是用户明确批准的 Web 功能，不是从游戏还原出的 Live 设置。它保留音乐音高并放慢音乐媒体时钟；默认关闭“同步慢放谱面速度”，此时到达判定点的谱面时刻仍随音乐放慢，但 Note/ribbon 的预判定下落保持与 `1.00×` 相同的现实时间速度，因此 Note 间距增大。开启开关后，下落速度才随音乐倍率同步变慢。Long/Slide 判定后的移动仍跟随谱面时钟；Note SE 样本、点击/侧滑粒子、轨道反馈、TapKeep 与 TouchingFlash 均维持正常实时速度。控件内部保存整数百分位，提供 `±0.10` 与 `±0.01`，默认 `1.00×`，并在两端停止。
- Web 自有区间循环支持精确媒体时间与一基 Combo Note 编号两种输入。时间模式严格保留 `0 <= A < B <= duration` 的输入；Note 模式把首尾扩展到完整的同时判定组，首组从 `0` 开始，否则 `A` 取上一组与所选首组判定时间的中点，`B` 取所选末组之后下一组的判定时间或歌曲末尾。运行区间固定为半开 `[A,B)`，因此 `B` 组不触发。回环复用普通 seek 的暂停、提交位置、持续状态重建和恢复播放流程；Long/Slide 不改变边界，也不使用额外分支。Note SE 的预调度终点同样限制在 `B` 之前。

正常播放背景使用完整 UV、Bilinear、白色乘色和标准 alpha 混合，并位于轨道底板下方。普通判定条、Note 图集、连接带与 Directional 背线使用 Linear、白色乘色和标准 alpha 混合；已准入点击／侧滑／持续效果分别使用其已确认的 Additive 或标准混合合同。片头状态、可见 `BgCover`、fever 切换、技能专属判定条演出、未列入白名单的特效时序、非 Perfect HUD 分支与非 AutoPerfect 音效在分别讨论并批准前继续留在白名单之外。

## 验证门槛

改动在进入就绪状态前应运行：

```bash
npm run test:bandori-chart-simulator
npm run test:bandori-music
npm run i18n:check
npm run typecheck
npm run build
```

浏览器验证只用于 smoke check，不能反推原生参数。应检查正常播放背景、底板与普通判定条合成、点 Note 生命周期与镜像、完整谱面标签页、固定步长跳转、音频播放、拖动/重开行为、难度切换、资源缺失及不支持 Note 的失败状态和相关控制台日志。
