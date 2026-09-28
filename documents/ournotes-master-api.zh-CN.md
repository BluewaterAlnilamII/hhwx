# OurNotes master API

[English](ournotes-master-api.md)

首轮 OurNotes API 已实现，生产启用仍是独立部署步骤。公开只读接口沿用 Bandori 的响应、私有快照读取与 HTTP 缓存规范，无需登录。`member/support` 是元数据术语，游戏将 support 卡显示为 snapshot。

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

成功响应为 `{ "success": true, "data": ... }`。Map key 是正整数十进制 ID；member/support 的 ID 空间独立。卡 ID 必须是无前导零的正安全整数。不提供 `all/main` 别名、目录详情、分页、语言选择或任意字段展开。

无 `server` 时合并四个实际来源；指定唯一数字 `server` 时，只保留对应来源收录的卡并移除 `serverExtensions`。本地化字段和原始时间仍保留五槽。`characters/bands` 是共享目录，拒绝查询参数。

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

列表和详情提供相同的顶层技能 ID 字段。未设置的引用仍为 `0`，support 编号槽不删除、不重排。首轮不提供完整技能说明、效果公式或 skills API。

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

Cards 固定各服 `ournotes/master/cards-v1/{server}/api/active.json`，直接验证自己的不可变 pack：schema、压缩 hash/size、semantic hash、解压限制和数量。角色/乐队通过 `ournotes/master/{server}/active/manifest.json` 定位自己的 normalized 文件，分别验证压缩与解压后的字节 hash/size。两类 reader 均不限制 producer 配方修订或完整原始表/文件集合。共用层负责存储和有界内容缓存，Cards 与 catalogs 各自负责验证、合并和响应缓存；相同已验证数据内容可跨归档 generation 复用。Web 不下载原始 `MasterText`。

启用此 reader 前须先初始化通用 master 入口。公开 URL、字段及五槽语义保持不变；新增独立数据集无需修改既有 reader，实际依赖缺失或未知数据 schema 仍失败。本次结构纠正不新增技能 API。

运行 `npm run test:ournotes-master` 检查小型本地 fixture、路由合同、损坏失败、五槽筛选与缓存复用。公共读取工具改动还需相关 Bandori 回归及 typecheck、lint、build。Fixture 仅保留带版本/hash 来源的选定元数据，不含完整 master 表或凭据。

部署顺序为兼容 assets 消费者、producer 发布四服 v3 主数据、Web 启用。核实 Web 主机签名读取、六路响应、区分查询的边缘缓存和错误 no-store。主数据就绪独立于图片任务；离线检查不能替代生产验收。
