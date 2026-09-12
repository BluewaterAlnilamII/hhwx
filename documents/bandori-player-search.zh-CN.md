# Bandori 玩家查询

[English](bandori-player-search.md)

BANDORI 导航入口为 `/bandori/player`。结果使用可分享的
`/bandori/player/{jp|en|tw|cn}/{uid}` 路径，并遵循现有语言前缀规则。
UID 全程保持字符串，接受不以零开头的 4–16 位十进制数字。

浏览器调用现有 `GET /api/bandori/player/{server}/{uid}` 接口，保留
`{ success, data: { server, uid, mode, cache, fetchedAt, profile } }` 外层结构和
profile 字段名。TW 加入 JP、EN、CN 的支持列表；KR 仍不支持。
账号绑定验证继续读取公开的 `profile.introduction` 字段。

页面使用模式 `2`：同步刷新，暂时性服务故障或繁忙时允许后端返回缓存，并显示获取时间和缓存标记。
再次查询同一玩家会刷新，不自动轮询。API 客户端仍可使用模式 `0`（只读缓存）、
`1`（缓存存在时立即返回并后台刷新）和 `3`（同步刷新、不回退缓存）。绑定验证使用模式 `3`，
最多等待该服查询通道 5 秒。模式 `1` 的后台刷新仅尽力执行，通道繁忙时可能跳过。

后端进程内缓存最多保留 1,000 份资料，抓取成功后 10 分钟过期，读取不续期。
模式 `2` 即使已有近期缓存也会尝试实时请求。暂时性故障回退缓存时返回 `200`、
`cache: true` 和可选的 `refreshError: { code }`，`fetchedAt` 保留原始抓取时间。
明确不存在会删除旧缓存，后台刷新也遵循此规则；响应无效或未预期的程序错误不回退后端缓存。
浏览器失败时保留的旧资料同样按获取时间过期，明确不存在时清除旧结果。

API 成功和失败响应均为 `no-store`。私有后端地址及 token 仅保留在服务端。
请求超时为 30 秒，不允许重定向，响应正文上限为 1 MiB，并核对返回的玩家身份。
错误响应不包含后端正文。明确的 `BANDORI_PLAYER_NOT_FOUND` 返回 `404`，缓存未命中用独立的
`BANDORI_PLAYER_CACHE_MISS`（`404`）。旧后端没有错误码的 `404` 仍映射为中性的
`BANDORI_PLAYER_UNAVAILABLE`。繁忙、维护、bot 会话不可用使用不同错误码和 `503`；
超时为 `504`，响应无效和其他上游故障为 `502`。内部认证失败属于服务故障，不误报成访客权限问题。
公开 API 和本地开发代理仅转发允许列表内的错误码。

先部署兼容新旧响应的 Web，再部署后端。已有成功字段和模式编号不变，旧后端可以不返回
`refreshError`。Web 超时不会强制终止已发出的游戏请求；后端仍持有账号锁，直到 Token／RequestID
链安全收尾。本次不改变游戏请求重试、版本恢复或独立的 `/suite/user` 流程。

## 隐私和展示

API 返回前删除受 `publish*Flg` 保护的值。开关为 false 或缺失时，保留栏目标题，
显示“不公开”。CLEAR、FULL COMBO、ALL PERFECT 分别遵守各自开关。
公开但缺失的数据显示“暂无数据”，明确的零值保留。查询 UID 始终显示，
不受 `publishUserIdFlg` 影响。

栏目顺序为：玩家资料（含主乐队）、乐队等级、歌曲成绩、最高分排行榜（直接展开歌曲明细）、
舞台挑战达成情况、编队等级、角色评级、当前道具及加成参数。顶部同一行显示主乐队综合力。
自选资料卡图用于左侧大卡面，未选择时使用队长。
顶部组合居中、最大宽度 944px：左侧正方形卡面最大 448px，水平间距 32px，右侧资料框宽 464px。
低于原有 52rem 内容宽度断点时上下排列，垂直间距仍为 16px。
资料框依次包含名称和等级、称号、留言、服务器和 ID、主乐队、获取时间。
不显示小头像或 ID 复制按钮。乐队等级位于顶部区域下方，使用独立栏目标题。
编成按 `member3, member1, leader, member2, member4` 展示，队长居中。
卡片特训状态与所选卡图独立，已特训卡选择普通卡图时仍显示特训星标。

Rating 和角色信息与卡牌、活动详情页共用 `BandoriDetailRow` 和 `BandoriDetailColumns`：
14px 字号、20px 行高，左侧弱化标签、右侧对齐数值，
每行上下各 12px 留白。内容宽度达到 54rem 时，角色信息分为两栏，以竖线分隔。
乐队 Rank、舞台挑战和编成 Rank 采用紧凑居中排列，Logo 在上、数值在下；
每四项为一组，实际宽度放得下时保持一行，放不下才在第四项后换行，两行分别居中。
编成 Rank 从上到下依次为 Logo、等级图标和分数。
主乐队直接使用 `BandoriCardTile` 的 compact 尺寸（手机 56px、桌面 76px），
沿用其队长标记和卡牌详情弹层，不显示卡片等级，弹层只传入标准技能文案。
信息行的 Logo 和角色头像高 28px。
CLEAR／FC／AP 使用紧凑表格，Rating 每组保持三首歌曲并使用 40px 的 `files.thumb` 封面。
“合计”在数值上方，间距 4px，两者与下方乐队总分在同一个 80px 列内居中。
乐队 Logo 与总分共用水平中心线，与歌曲区域间隔 16px；“其他”仅显示文字，不带图标。
歌曲文字从上到下为歌名、难度、分数；
只有封面和歌名链接到歌曲详情，键盘通过歌名聚焦该跳转入口。
窄屏维持三列，每首封面移到文字上方；长歌名单行省略，并通过提示保留完整名称。

歌曲成绩表格居中、最大宽度 640px，桌面名称列 160px，五个难度列各 96px 且内容居中。
角色评级每行最大 336px：乐队列 80px、间距 16px、角色组沿用 240px。
角色图标仍为 28px，保留原有五列和 8px 列间距，仅在窄屏空间不足时收缩角色组。
双栏切换仍使用原有 54rem 内容宽度断点。

`BandoriDeckRank` 仅负责等级字母和叠加的小数字，不依赖玩家资料、乐队 Logo 或评分：
`<BandoriDeckRank rank="ss" level={5} size={28} />`。`size` 为字母方形框的像素大小，
默认 28，修改时内部位置同步缩放。`deck-rank-layout.ts` 根据 JP 10.1.3 APK 恢复
MenuAtlas／RankNumberAtlas 的透明留白，并在 50×50 坐标系中应用
`BandDeckRankLevel.adjustLevelUI`／UIGrid 的定位。一位数字框为 `(31.5,22,25,25)`；
两位为 `(26,22,25,25)`、`(37,22,25,25)`；三位为 `(24.67,27.5,19.5,19.5)`、
`(33.25,27.5,19.5,19.5)`、`(41.83,27.5,19.5,19.5)`，依次表示 x、y、宽、高。
数字叠在固定居中的字母上方，允许向右溢出；等级为零或横线时不显示数字。
SSS 的 140×90 画布映射到同一个 50×50 框，保留游戏的非等比缩放。
R2 PNG 不变，下方评分继续作为组件外的普通文字。

Rating 包括八个乐队和“其他”，只有所有分组均可用时才显示总和。
舞台进度的键是**挑战 ID**，不是乐队 ID：官方 `masterStageChallengeList` 中，
常规挑战 `1,2,3,4,5,6,7` 对应乐队 `1,2,4,5,3,21,18`。
已提供的进度表为稀疏映射，未出现的常规挑战表示零颗已获得星星；
整个映射缺失时仍显示“暂无数据”。不混入特殊挑战，这七项中没有 MyGO 常规挑战。
未来新增常规挑战时需按 Master 更新这一小份映射。

卡片、称号、歌曲封面和角色头像复用已有目录与组件。立绘使用 `BandoriCardArtImage`，
歌曲封面使用 `MusicArtwork`，称号使用 `BandoriDegreeView`。新增固定资源使用
`bandori/resources/images/band-logo/{id}/logoS.png`、MenuAtlas 的
编成等级符号、RankNumberAtlas 的等级数字，以及
SpotAtlas 的 `icon_stagechallenge`。已发布的 `label_ribbon_pink`、`icon_character015_2` 和原生
Master Rank 徽章、数字留给后续消费者，本页面无需再次上传。
图片缺失时使用已有占位，不回退 Bestdori。

## Profile 字段核对（2026-09-11）

本次对照了后端四服 `UserProfile` 协议定义、`project_user_profile`、页面解析器，
以及 2026-08-29 抓取并保留的四服 profile 脱敏样本。样本清单记录四份原始响应的
未知字段数均为零。样本经过脱敏、重新编码，属于真实响应的派生数据，
不是原封不动的数据包，也不是本次新抓取；可选字段不保证每位玩家都提供。

四服协议和样本中的 `UserProfile` 都只有 `publishUpdatedAtFlg`（字段 18，布尔值），
没有 `lastLoginAt` 或 profile 顶层的 `updatedAt` 时间值。
实际检查的客户端 dump 中，`UserFriend` 另有 `lastLoginAt`（字段 8）、
`friendUpdatedAt`（字段 9）和 `publishUpdatedAtFlg`（字段 10）。
因此最近登录时间需要另一个数据来源；尚未确认能否为任意查询玩家取得。
页面的 `fetchedAt` 是资料获取时间，不是最近登录时间；卡片内部的 `createdAt` 也不代表玩家登录。

以下为协议已定义、页面未展示的信息。除特别说明外，后端会在字段存在、且适用的
隐私开关允许时保留这些字段。

| 范围 | 未使用的数据 | 当前处理 |
| --- | --- | --- |
| 编队等级 | `lowerRating`、`upperRating` | 只显示等级字母、小等级和分数，不显示评级上下界。 |
| 角色评级 | `exp`、`addExp`、`nextExp`、`totalExp`、`releasedPotentialLevel` | 只显示角色等级。 |
| 主乐队 | `deckId`、`deckName`、`deckType`、`bondsEffectIds` | 只使用成员 ID 和队长确定卡片顺序。 |
| 主乐队卡片 | `level`、`exp`、`addExp`、`createdAt`、`duplicateCount`、`skillExp` | 卡片等级按已确定方案不显示，其余元数据未使用。 |
| 综合力计算输入 | `enabledUserAreaItems` 的道具 ID、类别、等级；卡片 `userAppendParameter` 的 Performance、Technique、Visual、潜能和角色加成 | 后续前端扩展已用于综合力和当前道具、加成参数展示；这些数据受综合力公开开关保护，并不是直接的综合力总值。 |
| Twitter | `twitterId`、`twitterName`、`screenName`、`url`、`profileImageUrl` | 没有社交资料栏；四服保留样本中该对象都为空。 |
| 设置 | `searchableFlg`、`friendApplicableFlg`、`publishUpdatedAtFlg`、`publishStageChallengeFriendRankingFlg` | 不显示设置本身。其余公开开关用于对应栏目，查询 UID 始终显示。 |
| 舞台挑战 | 七个已映射常规挑战 ID 以外的条目 | 只展示常规挑战；原始映射的键是挑战 ID。 |
| 国服特殊画面 | `specialScreenSetting`（字段 900）：资料／装饰画面 ID 和启用开关、装饰偏移与缩放 | 仅国服协议定义，保留样本未出现，且 `project_user_profile` 尚未转发；使用前需要扩展后端字段映射。 |

`searchSuccessFlg` 已由后端用于判断查询状态。重复的身份字段和称号槽位元数据
不构成额外的展示内容。原始核对不修改 API 合约；后续前端扩展如下。

## 当前道具、加成参数与综合力

`publishTotalDeckPowerFlg` 同时控制主乐队综合力和末尾新栏目。关闭时显示“不公开”，
不解析或渲染受保护的加成。API 与私有后端合约不变。

“当前道具”只展示 `enabledUserAreaItems` 中的条目，使用 `areaItemCategory` 对应
现有 `/api/bandori/master/areaItems` 目录；`areaItemId` 是游戏的具体等级记录 ID。
不补齐未返回的道具。空列表表示当前没有启用道具，不能用它推断完整持有情况。

道具按响应顺序展示，不分类、不使用标签切换。复用 `BandoriDetailRow` 展示名称、
等级与查询服的 `description[level]`，不以其他服的效果替代。角色参数表直接接在
道具下方，沿用歌曲成绩的表格样式和现有角色图标；主乐队每名角色只出现一次，
按角色 ID 升序排列，不显示卡牌名称或编辑控件。参数表头中文使用全称，英文保留简写。

API 的追加参数是实际属性点。换算沿用档案页每 1 点对应 0.1% 的参数单位，
界面显示为 `5.5%` 等百分比：先把
等级基础属性与普通追加属性相加，再寻找能产生返回加成的唯一整数参数。
潜能按一次取整，任务合计兼容培养与收集合并取整和分别取整。无法唯一确定、
数值不一致或缺少卡片主数据时显示 `—`，不估算；0 表示没有有效加成，不证明
实际潜能等级为零。任务合计不能从当前响应拆分为培养和收集两部分。

JP 示例的潜能加成对应 55（5.5%），可与返回的属性点相互核对；不截断到档案
编辑器现有的 50 级输入上限。档案编辑器及其组件保持原样。缺省的 protobuf
追加对象或 uint 字段按游戏规则视为零；类型错误不能当作零。

主乐队标题与综合力显示在同一行，不公开时只把数值替换为“不公开”。单卡综合力
计入当前道具，复用 `BandoriCardTile` 原有数字覆盖层；不公开或不可用时不显示。
已删除组件中失去实际用途的 `showLevel` 开关，只由 `showPower` 控制综合力显示。

综合力复用 `calculateBandoriCard` 的等级基础属性计算，关闭由档案状态重建的特训、
故事、Master Rank 和角色加成，再加上 profile 的三组追加属性，避免重复计入。
最后复用组曲的 `selectedAreaItemPower` 应用当前启用道具，保持相同的累加顺序，
不对中间贡献取整。总值保留小数，展示时复用组曲的 `formatLocalizedInteger` 四舍五入；
单卡只为展示独立四舍五入，不将取整后的单卡数值相加作为队伍总值。
只使用查询服对应等级的道具效果；缺少主数据或队伍不完整时显示计算失败，不估算或显示零。
2026-09-12 使用公开缓存 JP 示例和当前主数据进行一次对照，未取整值约为 396739.59。
此前向下取整得到 396739，与游戏截图一致；按组曲的显示规则四舍五入后为 396740。
这不代表所有服、所有卡片状态都已完成实机对照。

## 验证和发布

运行 `npm run test:bandori-player`、`npm run typecheck`、`npm run i18n:check`、
适用的 ESLint 检查和 `npm run build`。浏览器检查覆盖公开资料、独立隐私开关、
非法及长 UID、刷新失败和手机布局。合成测试不得包含真实玩家记录或凭据。

先提供兼容四服的 user-fetcher 和固定资源对象，再发布本次 Web 改动。
无需数据库迁移或新增生产配置。

本地开发可在 `.env.local` 设置 `HHWX_DEV_PLAYER_API_PROXY=1`，再运行 `npm run dev`，
无需启动私有 user-fetcher 即可查询玩家。仅在 `NODE_ENV=development` 时，公开玩家 GET
路由会转发到固定的 `https://hhwx.org/api/bandori/player/{server}/{uid}`，保留 mode 参数，
校验公开响应结构和玩家身份，再执行本地隐私过滤，沿用超时、正文上限和缓存策略。
转发不携带后端 token、Cookie 或浏览器请求头，失败时不自动切换来源。

生产环境忽略该开关；账号绑定验证、同步和服务状态仍使用私有后端。
需要联调本地 user-fetcher 时删除开关或设为 `0`。该设置不转发 Master 或素材 API。
