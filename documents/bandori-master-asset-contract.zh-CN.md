# Bandori Master 与 Asset 统一契约

English version: [bandori-master-asset-contract.md](bandori-master-asset-contract.md).

本文统一说明 HHWX 对外提供的 Events、Cards、Stamps 数据契约。各数据集的业务字段可以不同，但传输格式、四服槽位、发布方式和资源查找规则应当遵循同一套约定。

## 共通规则

- 公开 Master API 成功响应为 `{ "success": true, "data": { id: record } }`；错误响应为 `{ "success": false, "error": { "code", "message" } }` 并使用非 2xx 状态码。
- 区服数组固定为 `jp`、`en`、`tw`、`cn` 四槽。API 与 index 的具名区服 map 使用这些名称；数字 `0`、`1`、`2`、`3` 只用于 Cards 的 `server` 查询参数及用户/档案设置。
- 缺失的区服字符串使用 `""`；业务上允许“未知”的标量（例如 Stamp `characterId`）使用 `null`；缺失的可选结构直接省略。
- Master API 只承载游戏语义数据；公开 asset index 只承载构造 CDN URL 所需的内容 hash。API 不公开 pointer、pack key、generation、来源 hash 或私有对象路径。
- 可变 API 与 index 使用 snapshot 缓存；按 hash 命名的媒体对象使用一年 immutable 缓存。读取失败时关闭，不回退 Bestdori 或旧公开 artifact。
- 未支持的查询参数统一返回 `400 BANDORI_MASTER_QUERY_INVALID`，不重定向，也不静默忽略。

## 数据集矩阵

| 数据集 | Master API | 详情 API | 公开 asset index | 主要关联键 | 区服结构 | 缓存档位 |
| --- | --- | --- | --- | --- | --- | --- |
| Events | `/api/bandori/master/events` | `/api/bandori/master/events/{eventId}` | `/bandori/events/index.json` | 数字 event ID | Master 四槽字段及本地 `stampRewardId`；标量 `stampCharacterId`；banner/team image 四槽 | fast-mutable API；snapshot index |
| Cards | `/api/bandori/master/cards` | `/api/bandori/master/cards/{cardId}` | `/bandori/cards/index.json` | `resourceSetName` | 四槽文本和显式 `serverExtensions`；图片按内容 hash 跨服共享 | snapshot API 与 index |
| Stamps | `/api/bandori/master/stamps` | 无 | `/bandori/stamps/index.json` | 数字 stamp ID | 四槽 `imageName`、`characterId`、图片、语音与 Changed variant | snapshot API 与 index |

Cards 列表刻意采用一次下载、整个 SPA 会话复用的完整 map；只有它支持可选的 `server=0|1|2|3` 物化查询。Event 的 `cnSchedule` 保持为可选 overlay，因为它可能独立于 immutable event snapshot 变化。

Event `stampRewardId` 固定为 `[jp, en, tw, cn]` 四槽，因为它是服务器本地外键；该服不存在活动时保留 `null`，不得用其他服 ID 补位。历史来源中的十进制字符串 ID 会规范化为整数。`stampCharacterId` 使用单个标量，因为所有已存在区服的奖励必须通过 Stamps API 解析成相同的语义图片和角色；出现分歧时拒绝发布 snapshot。

## 固定 JSON 顺序

公开 index 使用确定性序列化，便于 hash 稳定和人工检查：

- 根字段为 `schemaVersion`、`updatedAt`，然后是数据集 map；
- Cards 先排列标准 resource name，再排列 `bili_` 名称；
- Stamps 根字段为 `schemaVersion`、`updatedAt`、`stamps`、`changedStampGroups`；
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
npm run test:bandori-stamps
npm run test:bandori-public-assets
npm run audit:bandori-contracts
```

审计会验证响应 envelope、固定四槽、Event 与 Stamp 的语义对应、index 字段顺序、API 与 index 覆盖关系、Changed Stamp 位置数组长度、缓存头，以及未知 Master 查询参数必须被拒绝。可通过 `HHWX_BANDORI_API_BASE_URL` 与 `HHWX_BANDORI_ASSET_BASE_URL` 审计其他环境。
