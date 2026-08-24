# Bandori 谱面模拟器

## 范围

谱面模拟器是 `/bandori/songs/{songId}` 下仅供开发使用的歌曲详情界面。它在不改变现有 Music API、谱面与音频契约的前提下，显示完整源谱面及由音频计时的演出舞台。

模拟器内部使用固定的 `1334 x 750` 舞台，再整体等比缩放。音乐音频是演出时间的唯一时钟。播放、暂停、重新开始、固定跳转、拖动、音乐慢放、精确时间循环、Note 范围循环、镜像及 seek 重建都复用同一条 transport 路径。

## 已支持演出

当前产品契约包括：

- 普通 JP 背景 `skin00`、分层的 `skin02` 与 `skin03`、`practice`，以及来自 `skin_teamlivefestival` 的判定／Combo／Life 三种固定团队演出背景；
- 全部 15 种普通按键条与判定线样式；
- 7 种普通节奏标志／Note 样式及 5 种普通 Directional Flick 样式；
- 普通及 Habahiro 多轨 Point、Skill、Flick、Directional、Long、Slide 演出，包括连接带、曲线节点、节奏辅助、同时线与镜像行为；
- `1.00...12.00` 的 Note Speed，产品默认值为 `10.00`；
- `10%...200%` 的节奏图标大小；Habahiro 谱面保留选择值，但实际渲染大小限制在 `80%...150%`；
- `0...100` 的节奏图标出现位置，并可独立选择是否同步隐藏边界上方的按键条；
- 5 种普通样式及 Persona 限定覆盖均支持大／小两种 Directional 效果；
- 自动 Perfect 的按键闪光、判定、Combo、点击／Flick／Directional／保持效果，以及按需加载的 TapSE／Web Audio；
- 与原生演出舞台彼此独立的完整谱面分析视图。

当前实现与测试没有列入的能力一律禁用。交互失败与断 Hold、非 Perfect 判定、非 AutoPerfect 音效路由、Fever 与动态舞台切换、角色承载组件、MV／Live2D／3D 背景及未经确认的设置都不会静默回退到猜测行为。

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

## 普通控件与限定覆盖

背景、按键条／判定线、节奏标志／Note、Directional Flick、点击效果与 TapSE 是彼此独立的普通控件。Habahiro 不是另一种皮肤控件：谱面级 `laneChange=true` 标志启用其多轨演出，之后每个 Note 或连接带节点仍使用自身编译后的覆盖范围。

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

- `src/lib/bandori/chart-simulator/` 负责纯编译、transport、演出计算、效果、音效及 CDN manifest 解析；
- `src/app/[locale]/bandori/songs/[songId]/` 负责开发路由、控件、固定 Pixi 舞台及渲染生命周期；
- 私有 assets-builder 负责发布已审查的资源投影并保存逆向证据；公开 Web 仓库只保留产品行为与加载契约。

运行聚焦校验：

```bash
npm run test:bandori-chart-simulator
npm run typecheck
```

如需校验临时准备的资源投影，可在运行模拟器测试前把 `HHWX_CHART_SIMULATOR_PROJECTION_ROOT` 指向明确的临时投影目录。普通开发与测试不再需要实体 `public/local/chart-simulator` 目录。
