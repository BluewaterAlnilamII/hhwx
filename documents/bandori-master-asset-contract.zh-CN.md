# Bandori Master 与 Asset 统一契约

English version: [bandori-master-asset-contract.md](bandori-master-asset-contract.md).

本文统一说明 HHWX 对外提供的 Events、Cards、Degrees、Stamps、Music 数据契约。各数据集的业务字段可以不同，但传输格式、四服槽位、发布方式和资源查找规则应当遵循同一套约定。领域名称统一使用 `degree`；“称号/title”只作为 UI 文案。

## 共通规则

- 公开 Master API 成功响应为 `{ "success": true, "data": { id: record } }`；错误响应为 `{ "success": false, "error": { "code", "message" } }` 并使用非 2xx 状态码。
- 区服数组固定为 `jp`、`en`、`tw`、`cn` 四槽。API 与 index 的具名区服 map 使用这些名称；数字 `0`、`1`、`2`、`3` 只用于 Cards 的 `server` 查询参数及用户/档案设置。
- 缺失的区服字符串使用 `""`；Degree 数字槽缺失时使用 `0`；业务上允许“未知”的标量（例如 Stamp `characterId`）使用 `null`；缺失的可选结构直接省略。
- Master API 只承载游戏语义数据；公开 asset index 只承载构造 CDN URL 所需的内容 hash。API 不公开 pointer、pack key、generation、来源 hash 或私有对象路径。
- 可变 API 与 index 使用 snapshot 缓存；所有被 index 引用的媒体对象（包括 Music 媒体和谱面 JSON）都以 SHA-256 命名并使用一年 immutable 缓存。读取失败时关闭，不回退 Bestdori 或旧公开 artifact。
- 未支持的查询参数统一返回 `400 BANDORI_MASTER_QUERY_INVALID`，不重定向，也不静默忽略。

## 数据集矩阵

| 数据集 | Master API | 详情 API | 公开 asset index | 主要关联键 | 区服结构 | 缓存档位 |
| --- | --- | --- | --- | --- | --- | --- |
| Events | `/api/bandori/master/events` | `/api/bandori/master/events/{eventId}` | `/bandori/events/index.json` | 数字 event ID | Master 四槽字段及本地 `stampRewardId`；标量 `stampCharacterId`；banner/team image 四槽 | fast-mutable API；snapshot index |
| Cards | `/api/bandori/master/cards` | `/api/bandori/master/cards/{cardId}` | `/bandori/cards/index.json` | `resourceSetName` | 四槽文本和显式 `serverExtensions`；图片按内容 hash 跨服共享 | snapshot API 与 index |
| Degrees | `/api/bandori/master/degrees` | 无 | `/bandori/degrees/index.json` | 元数据使用数字 degree ID；资源使用派生资源名 | 八个固定四槽 Master 字段及可选四槽 `serverExtensions`，缺服 `null`、有服无扩展 `{}`、仅 CN 可含 `degreeEffect`；独立选择 base、rank、icon 与 effect 资源 | snapshot API 与 schema 2 index |
| Stamps | `/api/bandori/master/stamps` | 无 | `/bandori/stamps/index.json` | 数字 stamp ID | 四槽 `imageName`、`characterId`、图片、语音与 Changed variant | snapshot API 与 index |
| Music | `/api/bandori/master/music` | `/api/bandori/master/music/{musicId}` | `/bandori/music/index.json` | 数字 music ID | 四槽区服元数据与共享的谱面/音频派生字段；使用 `0` 到 `4` 的数字难度 key | snapshot API 与 index |

Cards 与 Music 列表都采用一次下载、整个 SPA 会话复用的完整 map；只有 Cards 支持可选的 `server=0|1|2|3` 物化查询。Event 的 `cnSchedule` 保持为可选 overlay，因为它可能独立于 immutable event snapshot 变化。Music 的 `difficulty`、`notes` 与 `bpm` 键表示谱面难度，而不是服务器槽位。

Event `stampRewardId` 固定为 `[jp, en, tw, cn]` 四槽，因为它是服务器本地外键；该服不存在活动时保留 `null`，不得用其他服 ID 补位。历史来源中的十进制字符串 ID 会规范化为整数。`stampCharacterId` 使用单个标量，因为所有已存在区服的奖励必须通过 Stamps API 解析成相同的语义图片和角色；出现分歧时拒绝发布 snapshot。

Degree Master 记录按 degree ID 组织，且恰好包含八个四槽字段：字符串字段 `degreeType`、`iconImageName`、`baseImageName`、`rank`、`degreeName`、`description`，以及非负整数字段 `seq`、`characterId`。`rank` 保持字符串类型。公开资源 index 按资源名组织：base 使用 `baseImageName`；rank 使用 `rank_none` 或 `{degreeType}_{rank}`；icon 使用 `icon_none` 或 `{iconImageName}_{rank}`。这样多个 degree ID 或多个角色共享媒体时不会重复记录 hash。资源类型由名称在所有区服固定：`ani_degree*` 资源只能包含 `animations: { server: { manifest, atlas } }`，其他资源只能包含 `images: [jp, en, tw, cn]`。即使静态和动态形式出现在不同区服也会被拒绝，同时不允许跨服回退。浏览器 catalog resolver 返回这些资源名和 `{key, sha256}` descriptor；只有实际读取图片、manifest 或 atlas 时才构造 URL。

Degree 动画 manifest 固定使用 `hhwx-bandori-degree-animation-v1`，显式包含 `frameRate: 30`、`loop: true`、图集尺寸，以及使用左上角坐标的有序 `{ name, rect }` 帧。帧名必须零填充、按字典序排列且连续。Stamp 动画使用独立的精简 `hhwx-bandori-stamp-animation-v1` 合约，显式包含正数 `frameRate`、图集尺寸和有序 `{ name, cssRect }` 帧；不再使用 12 FPS 或 `unityRect` fallback。Bundle 来源只属于诊断元数据，不进入不可变播放 manifest。新写入的 Stamp 根描述符只包含 `manifest` 与 `atlas`；Web reader 仅为旧根描述符兼容而校验并丢弃可选的 `frameRate`、`frameCount`。

## 固定 JSON 顺序

公开 index 使用确定性序列化，便于 hash 稳定和人工检查：

- 根字段为 `schemaVersion`、`updatedAt`，然后是数据集 map；
- Cards 先排列标准 resource name，再排列 `bili_` 名称；
- Degrees 先排列普通资源名，再排列 `ani_degree` 名称；单个资源先写 `images`，再写 `animations`；
- Stamps 根字段为 `schemaVersion`、`updatedAt`、`stamps`、`changedStampGroups`；
- Music 单曲字段为 `files`、`notes`、`bpm`、`length`；文件字段依次为 `jacket`、`thumb`、可选 `audio`、`charts`；
- 具名区服 map 固定按 `jp`、`en`、`tw`、`cn`；
- 数字 ID 按数值升序。

字段顺序不是应用身份，但如果 mutable index 的规范字节发生变化，即使解析后的语义相同，builder 也会重写该 index。

## Changed Stamp 关联

Changed Stamp 的语义与媒体刻意分开：

- 私有 Master snapshot 把 variant 发布为有序的 `{ imageName, soundName }`；
- 公开 index 把对应媒体发布为有序的 `{ image?, audio? }`；
- 两个 builder 都在发布前按 `(imageName, soundName)` 排列每个区服槽内的 variant；
- 浏览器按 stamp ID、区服槽和数组下标关联；若两侧长度不一致，则不展示 Changed 形态。

这种紧凑的位置身份避免在公开 index 中重复规则 ID 或资源名。完整 Changed manifest 仍会被 index 收录，但当前 picker 不依赖它。

## 验证

修改后运行对应单元测试；部署后运行只读线上审计：

```bash
npm run test:bandori-events
npm run test:bandori-cards
npm run test:bandori-degrees
npm run test:bandori-stamps
npm run test:bandori-music
npm run test:music-player
npm run test:bandori-public-assets
npm run audit:bandori-contracts
```

Music Player 测试会验证 Music 到播放器的适配、可持久化队列与偏好快照、从头重播和循环行为，以及工具栏输入决策。线上审计会验证响应 envelope、固定四槽、Event 与 Stamp 的语义对应、index 字段顺序、API 与 index 覆盖关系、Changed Stamp 位置数组长度、缓存头，以及未知 Master 查询参数必须被拒绝。可通过 `HHWX_BANDORI_API_BASE_URL` 与 `HHWX_BANDORI_ASSET_BASE_URL` 审计其他环境。
