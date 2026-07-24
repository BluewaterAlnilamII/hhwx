# Bandori Asset CDN 契约

English version: [bandori-asset-cdn-setup.md](bandori-asset-cdn-setup.md)

本文档说明 HHWX Web 应用对 Bandori 静态资源的公开 URL 契约。它不是 tracker 设置指南。

HHWX 生产环境使用私有采集和镜像服务填充 CDN。这些服务不包含在本仓库中。自托管运营者如果希望同样依赖资源较多的工作流可用，需要提供自己的资源主机或兼容的私有采集流程。

本文档不是素材许可证、公开再分发授权，也不允许复用 HHWX 生产基础设施。缓存、镜像或展示第三方游戏数据和媒体前，请阅读 [../NOTICE.zh-CN.md](../NOTICE.zh-CN.md)。

## Web 配置

Web 应用从以下环境变量读取 Bandori 资源 URL：

```dotenv
NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL=https://your-bandori-asset-cdn.example.com
BANDORI_ASSET_CDN_BASE_URL=https://your-bandori-asset-cdn.example.com
BANDORI_CHART_SOURCE=bestdori
# BANDORI_CHART_SOURCE=assets
# BANDORI_MUSIC_CDN_BASE_URL=https://your-bandori-asset-cdn.example.com
# BANDORI_CHART_BESTDORI_FALLBACK=0
BANDORI_SONG_NOTES_SOURCE=bestdori
# BANDORI_SONG_NOTES_SOURCE=assets
# BANDORI_SONG_NOTES_BESTDORI_FALLBACK=0
# BANDORI_STAMP_CATALOG_OBJECT_KEY=bandori/stamps/index.json
# BANDORI_STAMP_R2_ACCOUNT_ID=your_cloudflare_account_id
# BANDORI_STAMP_R2_BUCKET=your_r2_bucket
# BANDORI_STAMP_R2_ACCESS_KEY_ID=your_r2_access_key_id
# BANDORI_STAMP_R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
```

`NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL` 会暴露给浏览器。`BANDORI_ASSET_CDN_BASE_URL` 可供服务端代码使用。大多数部署中两者应指向同一个资源主机。卡图和活动图片通过下文的公开 Cards/Events index 发现；浏览器使用正常 HTTP 缓存且不携带凭据读取这两个 index。Stamp 资源使用同一个 Bandori asset CDN 下的 `/bandori/stamps` 路径；没有单独的 stamp CDN 配置。Web 应用会通过 `/api/bandori/stamps` 读取统一 stamp catalog，而 stamp 图片、动画 manifest、动画 atlas 和 voice audio 会在浏览器中直接从 CDN 读取，因此 CDN 必须允许 HHWX Web origin 跨域读取。Stamp voice 会通过 Web Audio 作为短音效播放，而不是作为媒体元素播放，以避免 iOS media session 把它当作音乐并打断后台音乐。

服务端 HHWX API 聚合已发布到 CDN 的 Bandori 资源时，必须通过 R2/S3 签名请求直接读取背后的对象存储。服务端路径不要再请求 `cdn.hhwx.org` 等 HHWX 自有公网 CDN URL，因为 Cloudflare bot mitigation 可能会对 server-to-CDN 流量返回 challenge。`/api/bandori/stamps` 会使用 `BANDORI_STAMP_R2_*`、`BANDORI_ASSET_R2_*` 或共享的 `BANDORI_R2_*` 凭据读取对象存储中的 `bandori/stamps/index.json`。只有当 `BANDORI_MASTER_R2_*` 指向同一个包含 Bandori 资源对象的 bucket 时，才可以作为兼容兜底。浏览器仍然直接从公网 CDN 读取 stamp 图片、动画 manifest、atlas 和 voice audio。

HHWX 生产环境应在 `/bandori/stamps/*` 对象上为 `https://hhwx.org` 配置 CORS。如果允许多个精确 origin，请同时返回 `Vary: Origin`。Web 应用读取 stamp CDN 时不会携带 credentials，除非请求模型发生变化，否则不要启用带凭据 CORS。完全公开且不带 credentials 的资源桶可以使用 `Access-Control-Allow-Origin: *`；不要把 `*` 和带凭据请求搭配使用。

`BANDORI_CHART_SOURCE=bestdori` 保留默认的 web-only 行为。只有在私有资源构建器已经发布下方 music chart 对象后，才应切换到 `BANDORI_CHART_SOURCE=assets`。`BANDORI_MUSIC_CDN_BASE_URL` 可以让谱面读取使用单独主机；省略时使用 `BANDORI_ASSET_CDN_BASE_URL`。`BANDORI_CHART_BESTDORI_FALLBACK=1` 允许自建谱面对象缺失时临时回退 Bestdori。

`BANDORI_SONG_NOTES_SOURCE=bestdori` 会在音乐资源管线尚未完整时保持 `songs.notes` 与 Bestdori 对齐。当 `bandori/music/index.json` 已包含所有已发布歌曲的谱面派生 `notes` 后，可以切换到 `BANDORI_SONG_NOTES_SOURCE=assets`，让 `/api/bandori/master/songs` 从 HHWX music index 读取 note 数。`BANDORI_SONG_NOTES_BESTDORI_FALLBACK=1` 允许临时发布期间用 Bestdori 补齐缺失的 asset note count。关闭 fallback 后，assets 模式会在 music index 不可读或未覆盖全部歌曲时以 `503` fail closed。

Events 与 Cards 的列表/详情 API 会通过 `BANDORI_PRIVATE_R2_BUCKET` 配置的私有桶，直接读取各自的内容寻址 snapshot。pointer 或 pack 缺失、无权限、格式错误、损坏或超限时都会失败关闭，且不会回退到 Bestdori 或公开 master artifacts。`BANDORI_EVENT_API_LOCAL_STORE_ROOT` 与 `BANDORI_CARDS_API_LOCAL_STORE_ROOT` 可在本地开发时指向 tracker 生成的 content store，生产环境会拒绝这些设置。其他 master 数据集继续使用现有来源。`songs.notes` 默认继续使用 Bestdori，但可以按上面的配置切换到 HHWX music asset chart counts。

## 榜线历史 API

`GET /api/bandori/tracker/data` 可以从 `bandori/trackerdata` 下的对象直接读取 CN 榜线历史。服务端使用带签名的 R2/S3 请求，不会通过公共 CDN 绕行读取聚合数据。按下面配置数据源和明确的公共 artifact bucket；endpoint 与凭据继续使用仅限服务端的 `BANDORI_R2_*`：

```dotenv
BANDORI_TRACKER_HISTORY_SOURCE=supabase
BANDORI_TRACKER_HISTORY_R2_BUCKET=your_public_artifact_bucket
```

可选数据源为：

- `supabase`：保持旧的纯数据库行为。
- `r2-with-supabase-fallback`：优先读取 R2；只有 R2 不可用、损坏、超限或校验失败时，才把整个请求重新交给 Supabase。
- `r2`：读取 R2；存在已验证的内存 stale snapshot 时可以使用，否则返回 `503 TRACKER_HISTORY_UNAVAILABLE`，不做请求级数据库 fallback。

manifest 不存在、manifest 没有请求的 pack 类型，或有效 pack 中没有请求档位，都属于正常空数据，继续返回现有的 `200 + { result: true, cutoffs: [] }`。manifest 已经引用但 pack 缺失或无效则属于运行故障，不能伪装为空结果。公开请求参数、5000 行上限、响应格式、API `no-store` 策略和 Supabase Realtime 订阅都保持不变。

对象根路径固定为数据契约 `bandori/trackerdata`，不会通过环境变量修改。下面的限制是损坏对象和资源耗尽保护，不会预留相应内存，也不是正常对象应达到的目标：

| 保护项 | 限制 | 依据 |
| --- | ---: | --- |
| manifest 与 pack 共享对象读取预算 | 3 秒 | 在 fallback 或稳定 `503` 前约束两次签名 S3 读取；后续 hash、解压、JSON 解析和契约校验分别由下方字节数与记录数上限约束。 |
| manifest | 64 KiB | 足以容纳当前 descriptor 和每类最多 8 个保留 pack key，并留有大量余量。 |
| gzip pack | 2 MiB | 约为实测 event 315 pack（61.7 KiB）的 33 倍。 |
| 解压 JSON | 16 MiB | 约为实测 event 315 payload（255 KiB）的 64 倍，同时限制异常 gzip 膨胀。 |
| 单 pack 记录数 | 200,000 | 约为实测 event 315 记录数（10,723）的 19 倍；每分钟实时推送不会写入这些历史 pack。 |
| parsed cache | 16 项 / 估算 32 MiB | 覆盖主图和比较目标，同时避免浏览大量历史活动后无限保留 pack。 |
| 失败冷却 | 每目标 15 秒 | 防止 R2 故障时每个 API 请求都再次触发失败对象读取。 |

parsed cache 权重按“解压字节 + 每个点 64 字节 + 少量 Map/分组开销”保守估算。解析完成后不会保留压缩 Buffer、解压 Buffer 或 JSON 文本。对象超过保护上限时不会被截断：fallback 模式会执行完整 Supabase 查询，纯 R2 模式返回 `503`。只有新的生产盘点证明数据规模确实增长后，才应人工调整限制。

为了提供切流证据，每个 Web 进程对于同一目标类型和 manifest generation 最多记录一次结构化 `Bandori tracker history R2 read succeeded` 日志，其中包含 generation、读取耗时和返回记录数，但不包含凭据或对象正文。降级读取仍按独立规则限频。

生产切换到 R2-first 前，使用只读命令对照代表性目标；命令不会写入任何数据源：

```bash
npm run compare:bandori-tracker-history -- --event 315 --type event --tier 1000
npm run compare:bandori-tracker-history -- --event 316 --type event --tier 1000
npm run compare:bandori-tracker-history -- --event 316 --type song --tier 1000
npm run compare:bandori-tracker-history -- --event 18 --type monthly --tier 1000
```

对照命令会固定一次 manifest generation，验证 gzip、hash 和 pack 契约，应用现有响应上限及分组语义，再逐点比较 Supabase；还应额外选择一个已知在两侧都为空的受支持档位。验证时 R2 空结果会临时查询 Supabase 核对；生产请求中的正常 R2 空结果不会访问 Supabase。回滚只需恢复 `BANDORI_TRACKER_HISTORY_SOURCE=supabase`，不要删除 tracker artifact 或数据库记录。

自托管部署不要指向 `cdn.hhwx.org`，除非你明确希望依赖 HHWX 生产资源托管。该域名只是部署细节，不授予任何第三方游戏素材权利。

## 公开路径契约

公开 URL path 和 object key 应完全一致。正常运行不应依赖 CDN rewrite 规则。

Cards 使用一个公开发现文档：

```http
GET {CDN_BASE}/bandori/cards/index.json
```

浏览器请求语义固定为 `fetch(indexUrl, { cache: "default", credentials: "omit" })`。

响应 JSON 结构如下：

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-07-23T00:00:00Z",
  "gachaVoiceProvenance": "gacha-spin-v2",
  "resources": {
    "res001001": {
      "artPlan": { "normalSourceVariant": "normal", "hasAfterTraining": false },
      "images": {
        "normal": {
          "thumb": { "key": "bandori/cards/res001001/normal/thumb/<sha256>.png", "sha256": "<sha256>", "byteSize": 1, "contentType": "image/png", "width": 1, "height": 1 },
          "full": { "key": "bandori/cards/res001001/normal/full/<sha256>.png", "sha256": "<sha256>", "byteSize": 1, "contentType": "image/png", "width": 1, "height": 1 },
          "trim": { "key": "bandori/cards/res001001/normal/trim/<sha256>.png", "sha256": "<sha256>", "byteSize": 1, "contentType": "image/png", "width": 1, "height": 1 }
        }
      }
    }
  }
}
```

`resources` 以 `resourceSetName` 为 key。`artPlan` 记录公开 `normal` 图片实际取自游戏的 `normal` 还是 `after_training` 源纹理，并声明是否应存在独立训练后图片组；`hasAfterTraining` 必须与公开 `after_training` 图片组是否存在一致。`gachaVoiceProvenance` 把可接受的抽卡语音提取规则固定为 GachaSpin v2，避免旧 cue 或 ACB 规则生成的 descriptor 被静默复用。`normal` 图片组及其中的 `thumb`、`full`、`trim` descriptor 必需存在。`after_training` 是可选的完整图片组；一旦存在，三个 descriptor 都必须存在。并非每张卡都有抽卡语音，所以 `gachaVoice` 在结构上可选；但 Master 声明了抽卡语音时，builder 必须找到与完整 `resourceSetName` 精确匹配的 cue，包括来自 `biliGachaVoice*.acb` 的国服 `bili_` cue。descriptor 使用 `contentType: "audio/mpeg"` 和 `durationMs`，不使用图片尺寸；key 为 `bandori/cards/{resourceSetName}/voice/gacha/{sha256}.mp3`。

Events 使用另一个公开发现文档：

```http
GET {CDN_BASE}/bandori/events/index.json
```

响应根对象为 `{ "schemaVersion": 1, "updatedAt": "...", "servers": ["jp", "en", "tw", "cn"], "events": { ... } }`。每个 `events[eventId]` 包含：

- `banners`：严格四槽 PNG descriptor 或 `null`，顺序与 `servers` 一致。
- `teamIcons`：每项为 `{ "teamId": 1, "iconFileName": "...", "images": [descriptor-or-null, descriptor-or-null, descriptor-or-null, descriptor-or-null] }`。

每个 PNG descriptor 都是 `{ key, sha256, byteSize, contentType: "image/png", width, height }`。活动图片 key 采用 `bandori/events/images/{sha256}.png`。某区域素材缺失时，只能在自己的槽位使用 `null`；客户端不会借用其他服务器的素材。

所有 descriptor key 都相对于 `{CDN_BASE}`。文件名 stem 必须等于 descriptor 中完整的小写 SHA-256。Web 应用会先校验 index，再使用其中资源，不会从 master data 的 bundle name 猜测 Cards/Events 路径。index 或 descriptor 不可用时，相关图片保留占位，但 master data 与队伍计算继续工作。卡牌缩略图不会用 full 图兜底，Cards/Events 也不会回退 Bestdori 或旧 `/api/bandori/assets` proxy。

Bestdori 通用图标和卡框：

```text
{CDN_BASE}/bandori/res/icon/{iconName}
bandori/res/icon/{iconName}

{CDN_BASE}/bandori/res/image/card-{rarity}.png
bandori/res/image/card-{rarity}.png
```

音乐资源和谱面 JSON：

```text
{CDN_BASE}/bandori/music/{musicId}/jacket.png
{CDN_BASE}/bandori/music/{musicId}/thumb.png
{CDN_BASE}/bandori/music/{musicId}/audio.mp3
{CDN_BASE}/bandori/music/{musicId}/charts/{difficulty}.json
{CDN_BASE}/bandori/music/{musicId}/manifest.json
{CDN_BASE}/bandori/music/index.json

bandori/music/{musicId}/jacket.png
bandori/music/{musicId}/thumb.png
bandori/music/{musicId}/audio.mp3
bandori/music/{musicId}/charts/{difficulty}.json
bandori/music/{musicId}/manifest.json
bandori/music/index.json
```

`bandori/music/index.json` 应包含 Bestdori 兼容形态的 `songs[].notes`，用难度 index `"0"` 到 `"4"` 映射从谱面派生出的 note 数。

Stamp 目录、静态图、语音与动画资源：

```text
{CDN_BASE}/bandori/stamps/index.json
{CDN_BASE}/bandori/stamps/{server}/{stampId}/image.png
{CDN_BASE}/bandori/stamps/{server}/{stampId}/voice/{voiceName}.mp3
{CDN_BASE}/bandori/stamps/{server}/{stampId}/animation/manifest.json
{CDN_BASE}/bandori/stamps/{server}/{stampId}/animation/atlas.png

bandori/stamps/index.json
bandori/stamps/{server}/{stampId}/image.png
bandori/stamps/{server}/{stampId}/voice/{voiceName}.mp3
bandori/stamps/{server}/{stampId}/animation/manifest.json
bandori/stamps/{server}/{stampId}/animation/atlas.png
```

`bandori/stamps/index.json` 是公开的 compact stamp catalog。它的 `payload` 以 stamp ID 为 key，`imageName`、`imageUrl` 和可选 `voiceUrl` 都固定使用 `[jp, en, tw, cn]` 四槽；缺失槽位使用空字符串，不使用 `null`。可选动画摘要按 server 分组，并指向动画 manifest 与 atlas。标准单个 stamp manifest 不再是公开合约的一部分。动画 manifest 应使用 `hhwx-bandori-stamp-animation-v1`，并包含 `atlasDimensions`、`frameRate` 和帧裁剪矩形，使 Web 应用不依赖 Unity runtime 即可渲染基于 atlas 的动画 stamp。当前 HHWX atlas PNG 以 `frames[].unityRect` 作为实际 PNG 裁剪矩形；Web 应用会将它归一化为内存中的 `frames[].cssRect`，仅在缺少 `unityRect` 时回退使用源 `frames[].cssRect`。

## 自托管预期

开源 Web 仓库可以渲染依赖公开元数据和已配置资源 URL 的页面。它不包含：

- HHWX 生产 tracker；
- 资源预抓取或镜像任务；
- Cloudflare R2 凭据或 bucket 配置；
- Bilibili session 凭据；
- 用于游戏账号绑定和手动游戏数据同步的 HHWX user-fetcher 服务。

如果某个部署没有提供兼容私有服务或已填充的资源主机，依赖资源的页面可能会缺图，或同步工作流不可用。这是 Web-only 自托管部署的预期状态。

## 验证

配置资源主机后，可以用浏览器或 HTTP client 验证代表性 URL：

```text
https://your-bandori-asset-cdn.example.com/bandori/cards/index.json
https://your-bandori-asset-cdn.example.com/bandori/events/index.json
https://your-bandori-asset-cdn.example.com/bandori/res/icon/chara_icon_1.png
https://your-bandori-asset-cdn.example.com/bandori/res/image/card-5.png
https://your-bandori-asset-cdn.example.com/bandori/music/1/charts/expert.json
https://your-bandori-asset-cdn.example.com/bandori/stamps/index.json
https://your-bandori-asset-cdn.example.com/bandori/stamps/cn/10131/image.png
https://your-bandori-asset-cdn.example.com/bandori/stamps/cn/10131/animation/manifest.json
https://your-bandori-asset-cdn.example.com/bandori/stamps/cn/10131/animation/atlas.png
```

Cards/Events 应从下载到的 index 中各选代表性 descriptor，再验证 `{CDN_BASE}/{descriptor.key}`。不要验证猜测的 bundle 路径；它们不是公开 HTTP 契约。

Cards/Events index 响应及 descriptor 指向的资源都必须允许 HHWX Web origin 无凭据跨域读取：

```bash
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/cards/index.json
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/events/index.json
```

针对 stamp CORS，至少用 `Origin` header 验证一个 JSON 对象和一个 voice 对象：

```bash
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/stamps/index.json
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/stamps/cn/10131/voice/<voiceName>.mp3
```

两者都应返回 `Access-Control-Allow-Origin: https://hhwx.org`；如果是完全公开且不带 credentials 的资源桶，也可以返回 `Access-Control-Allow-Origin: *`。然后打开相关 HHWX 页面，确认 stamp catalog 通过 `/api/bandori/stamps` 读取，而动画 manifest、atlas 图片和 voice audio 请求都直接访问配置的 CDN base URL。
