# Bandori 谱面模拟器

## 范围

谱面模拟器是 `/bandori/songs/{songId}` 下仅供开发使用的歌曲详情界面。它在不改变现有 Music API、谱面与音频契约的前提下，显示完整源谱面及由音频计时的演出舞台。

模拟器内部使用固定的 `1334 x 750` 舞台，再整体等比缩放。音乐音频是演出时间的唯一时钟。播放、暂停、重新开始、固定跳转、拖动、音乐慢放、镜像、seek 重建及区间循环回卷都复用同一条 transport 路径。

## 文档职责

本文档及其英文版本是 Web 谱面模拟器当前已准入行为、设置、渲染及资源消费方式的主产品契约。相关私有 assets-builder 文档各自负责更窄的范围：

- `hhwx-assets-builder/docs/music-charts.md` 定义源谱面转换与发布；
- `hhwx-assets-builder/docs/chart-simulator-release.md` 定义演出资源打包与发布；
- `hhwx-assets-builder/docs/research/chart-simulator/` 保存逆向证据、分析方法、快照身份及准入决定。

原生证据应保存在该私有档案中；本公开文档只记录已经由 Web 实现并受测试保护的最终行为。

## 已支持演出

当前产品契约包括：

- 普通 JP 背景 `skin00`、分层的 `skin02` 与 `skin03`、`practice`，以及来自 `skin_teamlivefestival` 的判定／Combo／Life 三种固定团队演出背景，并可选择纯黑的“关”背景；
- 全部 15 种普通按键条与判定线样式；
- 7 种普通节奏标志／Note 样式及 5 种普通 Directional Flick 样式；
- 普通及 Habahiro 多轨 Point、Skill、Flick、Directional、Long、Slide 演出，包括连接带、曲线节点、节奏辅助、同时线与镜像行为；
- `1.00...12.00` 的 Note Speed，产品默认值为 `10.00`；
- `10%...200%` 的节奏图标大小；Habahiro 谱面保留选择值，但实际渲染大小限制在 `80%...150%`；
- `0...100` 的节奏图标出现位置，并可独立选择是否同步隐藏边界上方的按键条；
- 可开关并跨歌曲保存的 Perfect 与 Great-only 诊断判定色带及实际边界偏移标签，覆盖普通点按、Directional 点按、Long 头尾及全部谱面计分 Slide 节点；
- 5 种普通样式及 Persona 限定覆盖均支持大／小／关三种 Directional 效果选择；
- 自动 Perfect 的按键闪光、判定、Combo、点击／Flick／Directional／保持效果，其中普通点击特效可单独关闭，以及按需加载的 TapSE／Web Audio；
- 与原生演出舞台彼此独立的完整谱面分析视图。

当前实现与测试没有列入的能力一律禁用。交互失败与断 Hold、交互式非 Perfect 判定、非 AutoPerfect 音效路由、Fever 与动态舞台切换、角色承载组件、MV／Live2D／3D 背景及未经确认的设置都不会静默回退到猜测行为。

## 诊断判定区间

“显示 Perfect 判定区间”和“显示 Great 判定区间”默认关闭。开启 Great 时，若 Perfect 尚未开启则会先将其开启，但不会锁定 Perfect 开关；关闭 Perfect 会同时关闭 Great，而单独关闭 Great 不影响 Perfect。最终的有效组合会跨歌曲保存在浏览器中。它们是在判定线固定高度上表达“时间 × 横向触摸位置”的二维可视化，不增加触摸输入，也不改变模拟器的 AutoPerfect 行为。设一个原生帧为 `F = float32(1 / 60)` 秒，标准点按在 `abs(delta) <= 2.5F` 时属于 Perfect；两侧 Great-only 区间为 `2.5F < abs(delta) < 5.5F`。

“显示区间最大偏移帧”会跨歌曲保存且默认开启。判定色带显示时，它会在横向归属与时间裁剪后的实际 Perfect／Great 外边界标出带符号、保留两位小数的帧偏移；这些标签仅用于诊断，不改变任何判定行为。

Long 释放使用已确认的 `sweetFrame=1` 扩展：`abs(delta) < 3.5F` 属于 Perfect，Great-only 两侧为 `3.5F <= abs(delta) <= 6.5F`。该规则同时适用于普通 Long 松手以及 Flick／Directional Long 尾端。

Slide 使用可跨歌曲保存的手动判定帧补正 `c`：范围为 `+0.0F...+1.0F`，步长 `0.1F`，默认 `+0.0F`。谱面起点和普通终点的 Fast 侧 Perfect 宽度为 `(2+c)F`，谱面中间计分点仅为 `cF`；起点和普通终点在其外侧另有三帧 Great-only，即从 `(5+c)F` 到 `(2+c)F`，中间点不显示 Great。Flick 与 Directional Slide 尾端不能提前完成，因此 Fast 侧长度为 0，也没有 Fast Great。该诊断设置不会再根据 Note Speed、设备场地几何或 float32 位置表累加自动推断相位。不变调慢放时，只有这些 Fast 帧偏移随画面接近时钟缩放。

每个计分 Slide 节点的 Slow 侧只有 Perfect。起点和中间点的名义截止点取 `T + float32(13 / 60)` 秒与“到下一个可见计分节点的谱面位置中点”两者中的较早值；普通或 Directional 终点没有后继中点，只使用 `0.2166666687s` 期限，Flick 终点则使用 `float32(7 / 60)` 秒。中点先在 Beat／`AbsolutePos` 域计算，再通过 BPM 时间轴换算为秒，不能直接平均两端秒数；隐藏曲线样本会被跳过。手动补正只影响 Fast 侧。

在判定线上，每个整数按键中心都有一个严格小于 `1.168` 倍轨道间距的命中半径。单宽 Note 的横向范围因此为 `lane - 1.168` 到 `lane + 1.168`；连续宽 Note 使用全部覆盖按键命中圆的并集。渲染器以固定横向分区结合时间归属切点，不逐像素采样，并用高对比度边框圈出同一 Note 的每块连续实际区域。Perfect／Great 仍分别填色，但两者的公共边以及其它内部矩形接缝不再描边；不连通区域和 Good／Bad 空洞仍各自保留外边框。普通 Note 与 Long 显示 Fast、Slow 双侧；Slide 在接近判定线时也会显示名义 Slow Perfect 范围，但整条色带仍会在所属 Note 于 `T` 被 AutoPerfect 触发时一起消失，包括恰好位于 `T` 的渲染帧。

新触摸的实际归属按原生层级处理：先按触摸距离从近到远检查命中圆内的按键；每个按键先且只选出一个候选。标准按下候选比较 Beat／`AbsolutePos` 距离，所以时间分界是 Beat 中点经 BPM 时间轴换算后的结果；尚未绑定的 Slide 头部比较当前投影位置到判定线的距离。候选归属受原生移动激活时刻约束：色带仍只为已经进入场地的 Note 绘制；按按钮预计算的整谱索引也可以纳入在色带所显示的未来输入时间域内才激活的标准按下或 Slide 头部，但该候选只能从 `T - arrivalSeconds` 起参与竞争，其中到达时长使用当前 Note Speed 和画面接近时间缩放。每帧通过二分时间范围查询，只纳入能在显示时间域结束前激活的候选；更晚的候选不能提前裁剪前一个 Note。跨类型也比较投影距离，固定使用原生 `JudgementAdjustValueB = 0`，完全等距时普通候选优先。选出唯一候选后才判断它是否可触发：不可触发时继续检查下一个命中按键；可触发的 Good／Bad 会占有该触摸位置但不绘制色带，因此能在更远按键的 Perfect／Great 区域上切出空白。标准按下的可触发范围仍为 `abs(delta) < 7.5F`；Slide 头部覆盖 Fast 侧直到 Bad，以及既有 Slow 超时／中点截止范围。前一个 Note 被 AutoPerfect 并清除后，后一个 Note 会在下一渲染帧恢复仍位于未来的实际区域。

Long 释放以及已经绑定的 Slide 中间点／尾端不重新进入新触摸优先级选择；它们各自使用覆盖按键命中圆的并集，彼此可以重叠。Slide 节点仍保持顺序约束：每个节点的诊断范围不得早于同一 Slide 上前一个可见计分节点的谱面时刻开始。该 AutoPerfect 专用下限表示前一个节点固定在其谱面时刻完成；隐藏几何样本不会形成前驱边界。每条 Slide 区域始终固定在所属计分节点自己的覆盖按键上，不沿连接带插值；隐藏几何样本本身不会获得区域。镜像正常映射横向区域，不另设隐藏规则；色带也不受 Sudden 遮罩影响。

谱面模拟器只用 Slide 的适用期限与中点边界裁剪诊断用 Slow Perfect 色带，不实际执行 Miss 状态，也不模拟触摸或 finger 状态、尾端重新接入、滑动位移与方向、抬手失败或手势完成。临轨命中圆与新触摸优先级只改变诊断区域，不改变播放逻辑。判定公式仍保留开闭区间语义，但零宽度的单个边界点不会另画一个像素色带。同一按键、同一时刻的重复标准按下 Note 属于无效谱面输入，不增加模拟器专用的同刻优先逻辑。

## 不变调慢放

播放会自动选择音频路径。恰好 `1.00x` 时使用原生 `AudioBufferSourceNode`，保留确定性的 seek 与调度；低于 `1.00x` 时自动使用 Signalsmith Stretch 保持音高，不再提供手动后端选择器。Signalsmith 初始化或处理失败时会暂停 transport 并显示明确错误，不会静默回退到会改变音高的原生慢放。首次启用慢放时，模块与整曲 PCM 副本准备期间可能会短暂显示“准备中”。

区间循环不承诺无缝或采样级精确的边界。输出呈现时钟到达区间终点后，模拟器会复用手动跳转的串行 seek 交接：先让已经进入设备队列的旧音频播放完，谱面跟随这段尾音并在区间起点等待，然后让音乐与 Note SE 从同一个新映射重新开始。因此缓冲输出、蓝牙设备或 Signalsmith 准备可能在每轮边界产生短暂停顿，但每轮都会重新同步，不会累计漂移。

音乐、谱面与 Note SE 调度共用同一个按 generation 隔离的映射：

```text
mediaTime = M0 + max(0, outputContextTime - C0) * playbackRate
```

在未来输出锚点 `C0` 之前，谱面固定在 `M0`。两条活动路径都在可用时读取 `AudioContext.getOutputTimestamp()`，使画面时钟跟随到达输出设备的 context 时间。暂停、跳转与倍率重建则单独保存基于 `AudioContext.currentTime` 的较后渲染游标，避免重放已经渲染进设备队列的音频。Note SE 仍在同一 AudioContext 的精确调度坐标上触发，其预排窗口在原生路径也会纳入实测或浏览器报告的输出设备渲染领先量。

Signalsmith 接收整曲 PCM 副本，报告处理延迟，并接受明确的输入／输出／倍率调度点；适配层从同源、带版本且不可变的 URL 加载原样 `1.3.2` 模块，不依赖运行时生成的 Blob 自举，并使用文档公开的未来 `output` 锚点。缓冲模式保留一个未连接的输入槽（Chrome 会把它暴露为空声道数组），使 `1.3.2` 从 `addBuffers()` 读取 PCM。每一代只提交活动段；暂停、跳转和自然结束才提交非活动 FIFO 栅栏，因为提前排入结束段会让 `1.3.2` 过早推进时间映射。DSP 初始化、PCM 传输与调度 RPC 均设有 10 秒有界等待，让失效 Worklet 明确报错，而不是使 transport 永久停在准备状态。已准备的 Signalsmith 节点只在慢放活动期间连接；停止或回到 `1.00x` 时会断开连接以避免空转，同时可保留解码后的 PCM 与节点供之后复用。节点重新连接前必须等待非活动 FIFO 栅栏确认；栅栏失败或超时就丢弃该节点，避免旧 generation 的时间映射泄漏到下一次启动。按 generation 绑定的 `processorerror` 会冻结 transport，并在之后重试前丢弃失效节点。每次跳转或倍率变化都会捕获同一个渲染截止点，但旧代的呈现映射会一直保留到该截止点真正到达输出设备；Signalsmith 可在旧输出尾排空期间并行准备，之后只允许用户最后一次请求的 generation 启动。画面先跟随旧尾，到 DSP 启动空隙时停在续播点，再按新映射继续，因此快速连续切换不会堆积多代未听见的音频，原生／Signalsmith 在蓝牙等高延迟输出上也能保持交接同步。

## 资源加载

演出资源只允许来自官方 JP 资源集。Web 不得加入 CN 演出资源包、跨地区 fallback、Bestdori fallback 或本地文件 fallback。

浏览器加载：

```text
bandori/chart-simulator/index.json
bandori/chart-simulator/manifests/{manifestSha256}.json
bandori/chart-simulator/packs/{packTreeHash}/{logicalPath}
```

可变 index 严格只含 `schemaVersion`、`updatedAt` 与总 manifest SHA-256；不可变 manifest 严格只含自身 schema 和 `游戏 bundle key -> pack tree hash` 映射。PNG、WAV、JSON 成员保留逻辑路径与原字节，不增加 ZIP、公开逐文件校验表、地区选择器或运行时提取。

以 `/local/chart-simulator/` 开头的路径只是通过固定 CDN manifest 解析的逻辑资源标识，并不是 Web 仓库提供的实体文件。渲染器只加载当前背景、按键条、Note、Directional、效果、限定覆盖及 TapSE 选择需要的 pack 与成员。Index、manifest、pack 或成员缺失或无效时都会明确失败。

解码后的 Pixi 纹理按解析后的不可变 URL 管理。共享舞台通过引用计数租约持有纹理；最后一个租约释放后，纹理会保温 15 秒，随后从 Pixi 缓存及解码／GPU 内存中卸载。替代舞台重新取得同一 URL 时会取消待执行的释放；同一 URL 的卸载会串行执行，避免旧舞台销毁替代舞台正在使用的资源。离开模拟器时会加速释放所有零引用纹理。这个生命周期不会删除浏览器 HTTP 缓存，因此不可变 pack 对象仍可由内存或磁盘缓存提供，只在之后重新选中时再次解码并上传。

Web Audio 运行时在音效皮肤切换后只保留当前 TapSE Cue Bank。旧 Note SE 音源停止后，其余已解码 `AudioBuffer` 及 URL Promise 引用都会被移除；再次选择时会先复用正常的 HTTP 缓存，再重新解码。当前歌曲 Buffer 以及按需准备的 Signalsmith PCM 副本会保留到模拟器音频运行时销毁。

## 普通控件与限定覆盖

背景、按键条／判定线、节奏标志／Note、Directional Flick、点击效果与 TapSE 是彼此独立的普通控件。Habahiro 不是另一种皮肤控件：谱面级 `laneChange=true` 标志启用其多轨演出，之后每个 Note 或连接带节点仍使用自身编译后的覆盖范围。当一个点提供 `lanes` 时，这段连续范围就是完整的位置合同：编译器不会读取旧的标量 `lane`，而会直接从范围派生画面中心和原生整数按键位。Long 或 Slide 可以让连续覆盖范围横向移动，但同一次按压中的覆盖宽度保持不变。

BGM 与 SE 音量条、各自的静音状态，以及“演出效果设定”和“演出皮肤设定”内的全部控件会作为一份浏览器本地偏好共同保存。持久层只保存经过校验的基础值与皮肤 ID；过期或不存在的选项会分别回退到当前默认值。循环开关与循环区间仍是当前歌曲会话状态。

限定演出皮肤是单独的稀疏覆盖层。选择后会保留普通选项，只覆盖该家族实际拥有的槽位；清除后立即恢复之前保留的普通选项。

当前选择器按首次 JP 启用时间排列，共有且只有 20 项：

```text
april2018, persona, miku, april2019, cafe, maid, gbp2020, coin, witch,
april2021, stage, delta, 5th, bike, satan, collabo23_summer_g,
collabo23_winter_d, april2024, collabo24_autumn_i, collabo25_autumn_s
```

April 2018 只拥有 Note 与音效槽位，因此 20 项中有 19 项提供背景。`practice` 与 `skin_teamlivefestival` 的三种选择都是普通背景，不属于限定覆盖。

Hololive 联动第二弹使用新的 `skin_collabo23_winter_d` 背景，并复用 Delta 的按键条、Note、点击效果与 TapSE 契约。Miku、Cafe、Coin、Witch 没有第二条 Long 带纹理，因此曲线 Slide 复用各自唯一的 `longNoteLine`；Delta、Maid、Stage 使用其原有第二条带纹理。

## 还原边界

资源身份、逻辑路径、稀疏槽位归属、Sprite 元数据、舞台与 Note 几何、事件路由及确定性 transport 属于精确产品契约。浏览器粒子和音频保留已准入源参数，但仍是对 Unity 随机求值、自定义 shader 与 CRI voice-limit 行为的有界近似。Witch 的 mesh、CustomData U 滚动与 orbital profile 只在明确白名单内启用。Persona 的动画 Flick 光束保留原出生位置与生命周期，只对向上位移应用已确认的 `4.0` 倍率。

未知 recipe 字段、shape、mesh、shader、curve、音效路由或缺失资源都必须失败关闭。视觉检查可以指出实现错误，但替换原生常量仍需要独立验证的证据。

## 架构与校验

- `src/lib/bandori/chart-simulator/` 负责纯编译、transport、演出计算、效果、音效、不变调变速适配及 CDN manifest 解析；
- `src/app/[locale]/bandori/songs/[songId]/` 负责开发路由、控件、固定 Pixi 舞台及渲染生命周期；
- 私有 assets-builder 负责发布已审查的资源投影并保存逆向证据；公开 Web 仓库只保留产品行为与加载契约。

运行聚焦校验：

```bash
npm run test:bandori-chart-simulator
npm run typecheck
npm run i18n:check
```

如需校验临时准备的资源投影，可在运行模拟器测试前把 `HHWX_CHART_SIMULATOR_PROJECTION_ROOT` 指向明确的临时投影目录。普通开发与测试不再需要实体 `public/local/chart-simulator` 目录。
