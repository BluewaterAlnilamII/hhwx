# OurNotes 卡牌页面

[English](ournotes-cards.md)

图鉴沿用现有 Bandori 卡牌列表与活动页标签布局，两边共用页面壳、列表行、详情页头、服务器控件、信息行、能力值栏、筛选基础控件、计数、帮助浮层、加载状态和大图查看器。OurNotes 保持自己的卡牌语义与五槽区域；现有 Bandori 入口转发至抽出的共享实现。

## 路由与状态

- `/ournotes/cards` 默认显示成员，`?kind=support` 显示留影（Snapshot）。两个等宽标签共用一份列表实现。角色筛选按钮按角色 ID 数值升序排列。
- `/ournotes/cards/{member|support}/{cardId}` 打开详情。非法类型、ID 和不存在的卡牌返回 not-found；读取失败使用路由错误与重试界面。
- 筛选使用 `q`、`available`（槽位代码）、`bands`、`attributes`、`rarities`、`characters`、`direction`。未提供选择参数表示全选，显式空值表示不选。组内取 OR、组间取 AND；Snapshot 可匹配关联的任一角色或乐队。
- 切换标签保留通用筛选并重置稀有度；清除筛选保留当前标签。首批 40 张，每次再显示 40 张，查询变化重置批次。排序仅保留卡牌 ID，默认倒序；不提供稀有度、属性或能力参数排序。旧的非法 `sort` 值按 ID 处理，重建筛选、标签或返回链接时移除。不把来源 `startAt` 当作已确认的发行日期。
- 工具栏分别提供 Bandori 和 OurNotes 首选服务器，默认均显示 CN，与网页语言无关；OurNotes 的 CN 对应原有 CN_INTL 槽位。用户主动选择后，分别保存到浏览器存储（保留 `hhwx:bandori:preferred-server:v1`，新增 `hhwx:ournotes:preferred-server:v1`）；读取默认值不写入存储。两者共用持久化实现。存储不可读或值非法时使用默认值，写入失败时当前页面内的选择仍生效。
- 图鉴每张卡优先使用 OurNotes 首选服务器，未收录时按 JP、EN、TW、CN_INTL、KR 顺序选择首个可用槽位；标题、名称、技能摘要与详情链接统一使用该结果。单条卡牌／技能文本缺失时保持缺失，通用角色／乐队筛选标签允许回退。服务器可用性筛选只决定列表收录，不改变展示偏好。旧列表 `server` 参数会被移除，同时保留其他查询参数和 hash。
- 详情使用 `server=jp|en|tw|cn_intl|kr`，同时接受 `server=cn` 指向相同槽位。URL 中合法且可用的服务器优先于偏好。参数缺失、非法或未收录时，等待偏好读取完成，再选出可用槽位并替换 URL，保留列表查询与 hash。详情切服只修改当前 URL，不覆盖已保存偏好。内部标识保持 `cn_intl`；界面标签、图标提示及搜索统一按 CN 表述。没有合法且可用的显式服务器时，metadata 先使用本地化图鉴通用标题，解析完成后随 URL 更新。网页语言只控制界面文案与格式，不决定区域数据。
- 详情的 `list` 参数携带之前的列表查询；返回链接只接受已知筛选键，并重新构建本站图鉴 URL。筛选状态保留在 URL，仅两套显式服务器偏好需要持久化。

## 数据与展示

共用参数栏中，成员展示三项整数能力值与综合力；留影仅展示三项独立百分比加成，固定两位小数、三列均分，不将它们相加为综合力。API 的 `powerMax` 保持原值：`3500 / 10000` 格式化为 `35.00%`。换算已核对 JP 原生 `UISupportCardDetailView.UpdateView`（RVA `0x5cd5288`），其调用的三个格式化方法（`0x53c7068`、`0x53c7100`、`0x53c7198`）均先将原参数除以 100，再显示百分数。这里仍展示卡牌定义的最大参数，不添加玩家养成控件或队伍加成。

缩略图保持原始比例：视口小于 640px 时，成员宽 64px、留影宽 128px；640px 起分别为 88px、160px。OurNotes 启用共享 `CardCatalogRow` 的手机排布，上方为卡面与基本信息，下方技能通栏显示；桌面保持左图右文。字体、面板、内边距和箭头继续共用，Bandori 保持默认排布。

图鉴列表按实际存在的技能逐项分行，只显示满级效果正文，不加技能类别前缀。成员按队长技能、演出技能、激奏技能的顺序；留影先展示演出支援，再展示激奏支援，同类技能保留来源槽位顺序，跳过 ID 为零的槽位。即使两个技能同属支援，也分别占一行；缺少某类技能不补占位行。技能有引用但缺少当前区域说明时，仍显示说明不可用。每行沿用共享列表的文字规范并独立截断，避免某行过长时遮掉后续行。

浏览器通过现有 [master API](ournotes-master-api.zh-CN.md) 读取当前卡牌类型，以及角色、乐队和技能；独立请求通过 `useCachedFetch` 并行读取。公开图片索引使用现有按 URL 缓存的索引设施。依赖初次加载时统一显示页面级状态；只重试失败依赖，不重读已成功的数据；刷新失败保留最近的有效数据。服务端详情与 metadata 使用现有私有读取器，不请求 CDN 元数据或本站 HTTP API。

搜索与 Bandori 共用工具栏、条件示例排版、分词、比较边界及服务器别名。NFKC／大小写归一化、不同条件取交集、删空立即清除查询和输入法保护遵循 Bandori 契约。正式乐队名、角色全名及短名按身份匹配，不推导缩写或昵称。`/名称` 或英文／中文双引号仅搜索各语言卡牌标题，排除角色名和技能文字；未知文字搜索卡牌标题、显示名称、角色名及乐队名。裸正安全整数和 `#ID` 仅查询卡牌 ID；非法显式条件不回退文字搜索。稀有度使用明确的 **R < SR < EX < BD < SSR**，不比较内部数值编号。筛选按钮与搜索共用这个顺序；成员省略 EX，留影提供五项，包括当前尚无卡牌的稀有度。`SR+`／`>=SR`、`EX-`／`<=EX`、`>BD`、`<SSR` 仅比较稀有度。服务器搜索沿用 Bandori 的 JP／EN／TW／CN 别名，兼容 `cn_intl`，并提供 KR／Korea／韩服等别名。`available=cn` 与 `available=cn_intl` 选择相同的原有槽位；生成的链接继续使用内部代码。

已审核乐队别名按身份匹配：MyGO 复用 Bandori 的 `mygo!!!!! / mygo / mg / go`；Ave Mujica 补充 `avemujica / mujica / ave`；梦限大MewType 补充 `mewtype / 梦限大 / 夢限大 / ゆめみた / yumemita`；一家Dumb Rock! 补充 `一家 / ikka / dumb rock / dumbrock`。millsage 使用正式名称，不登记 `am / ms / idr` 或新的单字母乐队别名。已识别别名对应身份没有结果时，不回退卡牌文字搜索。

角色搜索还会从全名末尾移除同语言短名以提取姓氏；英文等名在前的形式，则移除开头的短名及其后的空格。以斜杠分隔的艺名和本名分别登记：`Doloris` 和 `三角初华` 都是完整名称，`三角` 是姓氏，`初华` 是短名。它们均匹配同一角色 ID，包括该角色登场的留影，不因其他卡牌标题包含这些文字而命中。已知本名额外支持姓／名两种顺序的连写及空格形式，例如 `千石ユノ` 和 `minetsukiritsu`；不对普通搜索文字做全局去标点处理。原始组合名称仍可使用；斜杠前缀或引号查询继续仅搜索卡牌标题。

MyGO 五人的已审核别名直接复用 Bandori 数据，通过 `36→1、37→2、38→3、39→4、40→5` 显式映射角色 ID，包含 `tmr`、`rana / raana`、`素世`、`shina` 及原有已审核昵称。祐天寺额外支持 `yutenji / yuutenji`，以及两种姓名顺序的连写和空格形式。原始长音符号拼写继续有效，不引入全局去音标、昵称推导或新的首字母缩写。

当前不提供获取类型、技能类型或技能效果搜索，不将技能名称／说明、效果分类、得分倍率或时间数值加入搜索索引。原有技能展示保留：说明按 `{n}` 替换 `descriptionParameters[n][level - 1]`，以纯文本展示。技能 ID 为零时不显示；来源槽位在内部保留独立标识，显示的类别名不带 1／2 编号。同类的两个技能仍分别展示，使用相同类别名。仅当成员卡没有 `name` 字段时才使用角色名；某语言为空不触发回填。

详情使用一个主面板，依次包含共享页头、卡面、带满级能力值栏的卡牌信息，以及独立的技能栏目。技能栏目是明确允许的布局差异，提供 1–5 级切换并默认显示 5 级；技能名称和效果仍使用与 Bandori 相同的详情行和文字层级。技能名称仅显示所选区域的文本，不附加日文名称。低于共享详情两列布局的 54rem 容器断点时，每个技能上方为左侧类别与右对齐名称，下方为通栏右对齐效果；仅技能组之间有分隔线，重复的效果标签在视觉上隐藏，但保留给辅助技术。宽屏保持两列布局。图鉴与详情的技能说明均按普通空白处理、自然折行，不改写原始文本或参数替换结果。不展示成长表、升级花费或资源清单，API 中相应字段保持不变。不从缺失数据推断获取方式、发行时区、玩家等级／Rank、组队计算、服装／语音链接或评论。

技能类别名与国际服 MasterText 的 `leader_skill`、`live_skill`、`gekisou_skill`、`live_support`、`gekisou_support` 对齐：队长技能 / Leader Skill、演出技能 / LIVE Skill、激奏技能 / GEKISO Skill、演出支援 / LIVE Support、激奏支援 / GEKISO Support。留影 / Snapshot 也由 `ui_bili_formation_power_snap` 确认。核对来源为留存的 2026-10-01 EN 原始 MasterText，SHA-256 为 `7f8a55dc415d0cb4b5f8eb79c1a024090511a4b3685e9ccf035bf9149f14a751`。`gekisou`、`supportSkillId01`、`supportSkillId02` 等 API 标识不变。

## 卡面依据

详情页直接展示完整卡图，不叠加缩略图边框、阴影或属性角标，保持图片比例；图鉴首页缩略图保留这些装饰。两种模式共用图片加载／失败处理，继续使用现有大图查看器。

卡图按 **assetId**、类型和版本，从 `https://cdn.hhwx.org/ournotes/cards/index.json` 解析；缺少版本时保持不可用。索引描述符必须使用规定的 SHA-256 内容寻址路径。图片失败状态跟随来源 URL，换卡后不会沿用上张图片的失败状态。

固定 UI 使用 assets-builder 已核对的 JP Sprite 与 prefab 尺寸，依据保存在 `hhwx-assets-builder/docs/research/ournotes-card-ui-2026-09-28.md` 及同名 JSON。卡框参考尺寸为成员 224×294、Snapshot 326×184，卡图内缩 6 单位；50×50 属性图标中心位于 (16,18)，允许越过边框。`FrameSquare_6px`、`FormationSupportCardOutline`、`FrameMemberThumShadow_9slice` 保留九宫格边界。两类稀有度色表独立，角度为 90°／128°。固定图形不进入卡图索引，也不另建配置 API。稀有度与玩家 Rank 不同，图鉴不显示玩家等级或 Rank。

边框着色遵循原生 `UIGradientImage` 的网格行为，不再输出 SVG 硬色带。JP ARM64 实现（`ModifyMesh` RVA `0x6314cf8`、`CreateGradientMesh` `0x6314d98`、`SetVertexColor` `0x6314f58`）在轴向对齐时按渐变关键点切分网格，在顶点取色，再由光栅化插值顶点颜色。SSR 的 [Fixed 模式](https://docs.unity3d.com/ScriptReference/GradientMode.Fixed.html) 控制顶点取色，不代表最终图像呈阶跃色带。成员在关键点／切片顶点间使用平滑渐变；128° 的留影保留九宫格三角形，按实际 326×184 范围投影坐标。SVG 渐变表达各三角形的顶点颜色，三个颜色不同的三角形通过独立 RGB 层合成。成员原生 Replace 与留影 Multiply 模式对这些 prefab 的白色顶点色结果相同。各列表行复用着色几何，素材、遮罩和卡图保持原样。不宣称 Unity 颜色量化、色彩空间配置和浏览器边缘光栅化逐像素一致。

服务器控件复用现有本地 JP／EN／TW／CN 图标，`CN_INTL` 使用 CN 图标。KR 图标于 2026-10-02 从 [Bestdori 同套服务器图标](https://bestdori.com/res/icon/kr.svg) 复制到 `public/res/server-icons/kr.svg`，SHA-256 为 `b5defb8a0aed8a9ca429e6cdcb1ecb9590ede92bcdf2edf5d6ee6eda4cf6df37`；原有不可变图标未修改。

## 验证

2026-10-02 边框修正：OurNotes 全部 10 项测试、typecheck、定向 lint 和生产构建通过。边框回归检查覆盖成员 SSR 平滑插值、留影角点／三色三角形采样、两类独立 SR 色表和 R 纯色。Chromium 定向检查覆盖桌面成员列表／详情、留影列表，以及 375px 留影列表；渐变正常显示，未观察到相关控制台错误。完整页面视觉验收按要求留待统一进行。

留存的 `hhwx-assets-builder/runtime/ournotes-ui-20260928/card-components.json` 中，成员卡图的 fitter 为 mode 0，Snapshot 为 mode 4（16:9）。成员填满卡图矩形；Snapshot 保持比例并覆盖矩形，与 [Unity AspectMode 枚举定义](https://docs.unity.cn/Packages/com.unity.ugui%401.0/api/UnityEngine.UI.AspectRatioFitter.AspectMode.html) 对应。

`npm run test:ournotes-cards` 覆盖目录归属、五槽文本缺失、技能替换／单位／槽位、安全 URL 恢复、图片描述符校验、偏好独立持久化和逐卡区域回退。共享部分继续由现有 Bandori 搜索、tooltip、帮助浮层、详情布局和公开索引缓存测试覆盖。集成修改执行 `npm run typecheck`、`npm run lint`、`npm run i18n:check`、`npm run build`。浏览器验证使用 `http://localhost:3000`，以匹配 CDN 配置的开发环境 CORS 来源。

2026-10-02 服务器偏好验收：Bandori 图鉴／详情及 OurNotes 合计 30 项测试通过，typecheck、生产构建、定向 lint 和文案校验通过；全量 lint 保留 21 条无关警告，无错误。浏览器已验证独立默认值与用户选择、刷新及语言切换后保持偏好、英文界面仍默认 CN／CN_INTL、键盘选择、375px 亮色和 1440px 暗色菜单、可用性筛选不改变展示、留影 #70 从 JP 回退至 EN、详情显式 URL 优先、缺失／非法参数规范化、查询与 hash 保留，以及详情切服不改写偏好。未发现相关控制台错误或菜单溢出。

此前的功能检查不能证明页面符合 Bandori 展示契约。本次纠正删除成长 UI 和额外排序，将分岔的展示块改为共享实现，仅保留明确允许的技能等级栏目。验收除功能测试外，还直接对照两边渲染页面及实际字体样式。

2026-10-02 修正验收：typecheck、生产构建、文案校验及 60 项相关测试通过。全量 lint 无错误，保留修改范围外的 21 条既有警告；定向 lint 通过。使用 Chrome DevTools 在 localhost 的 1440×960 和 390×844 视口检查中英文及明暗主题。两边列表行高均为 138px，标题／角色名／技能摘要字体样式一致，详情标题、信息行及服务器按钮也一致。已验证成员技能 5→1→5、键盘标签切换、Snapshot #70 的 JP 禁用与 KR 选中、返回保留筛选、五个服务器图标正常加载、仅 ID 排序，以及 40→63 张分页。未发现相关控制台错误或横向溢出。以上是本地验证，不代表部署。
