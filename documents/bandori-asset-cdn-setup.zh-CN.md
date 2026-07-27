# Bandori Asset CDN 契约

Events/Cards/Stamps API 与 index 的统一约定见 [bandori-master-asset-contract.zh-CN.md](bandori-master-asset-contract.zh-CN.md)。

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
# BANDORI_ASSET_R2_BUCKET=your_public_asset_bucket
# BANDORI_PRIVATE_R2_BUCKET=hhwx-private
# BANDORI_STAMPS_API_LOCAL_STORE_ROOT=/path/to/stamps/store
```

`NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL` 会暴露给浏览器。`BANDORI_ASSET_CDN_BASE_URL` 可供服务端代码使用。大多数部署中两者应指向同一个资源主机。Cards、Events 与 Stamps 资源通过下文各自的公开 index 发现；浏览器使用正常 HTTP 缓存且不携带凭据读取这些 index。Stamp 资源使用同一个 Bandori asset CDN 下的 `/bandori/stamps` 路径；没有单独的 stamp CDN 配置。Web 应用通过 `/api/bandori/master/stamps` 读取 Stamp master 元数据，直接从公开 CDN 读取 `bandori/stamps/index.json`，再在浏览器内存中按 stamp ID 合并两者。Stamp 图片、动画 manifest、动画 atlas 和 voice audio 随后直接从 CDN 读取，因此 CDN 必须允许 HHWX Web origin 跨域读取。Stamp voice 会通过 Web Audio 作为短音效播放，而不是作为媒体元素播放，以避免 iOS media session 把它当作音乐并打断后台音乐。

服务端 HHWX API 消费已发布到 CDN 的 Bandori 资源时，必须通过 R2/S3 签名请求直接读取背后的对象存储。服务端路径不要再请求 `cdn.hhwx.org` 等 HHWX 自有公网 CDN URL，因为 Cloudflare bot mitigation 可能会对 server-to-CDN 流量返回 challenge。公开资源桶使用 `BANDORI_ASSET_R2_BUCKET` 配置；endpoint 与凭据默认复用 `BANDORI_R2_*`，也可以用 `BANDORI_ASSET_R2_*` 单独覆盖。Music metadata 与 chart reader 通过这条路径读取 `bandori/music/index.json` 和内容寻址的谱面 JSON；chart reader 会先校验对象 SHA-256 再解析。Stamps master API 从 `BANDORI_PRIVATE_R2_BUCKET` 读取独立的内容寻址 snapshot，不读取公开 asset index；浏览器则直接从 CDN 读取公开 index 与资源。

HHWX 生产环境应在 `/bandori/stamps/*` 对象上为 `https://hhwx.org` 配置 CORS。如果允许多个精确 origin，请同时返回 `Vary: Origin`。Web 应用读取 stamp CDN 时不会携带 credentials，除非请求模型发生变化，否则不要启用带凭据 CORS。完全公开且不带 credentials 的资源桶可以使用 `Access-Control-Allow-Origin: *`；不要把 `*` 和带凭据请求搭配使用。

HHWX 应用响应使用 `Cache-Control` 控制浏览器及下游缓存 TTL，并使用 `Cloudflare-CDN-Cache-Control` 单独控制 Cloudflare 边缘 TTL 与 stale 行为。公开 API 使用四个可变缓存档位：fast mutable（浏览器 `1 分钟 + 5 分钟 SWR`，边缘 `5 分钟 + 15 分钟 SWR`）、snapshot（浏览器 `5 分钟 + 30 分钟 SWR`，边缘 `30 分钟 + 1 天 SWR`）、reference（浏览器 `1 小时 + 12 小时 SWR`，边缘 `12 小时 + 1 天 SWR`）和 long asset（浏览器 `1 天 + 7 天 SWR`，边缘 `30 天 + 90 天 SWR`）。私有、实时及错误响应使用 `no-store`；内容寻址对象使用一年 `immutable`。不要再加入 `s-maxage`，因为它会与 stale-while-revalidate 语义冲突。

Cloudflare Cache Rule 可以只把目标公开 `GET`/`HEAD` 路径标记为符合缓存条件，同时继续接受源站响应头。由 R2 或资源 CDN 直接提供的对象（包括 Cards、Events、Music 和 Stamps 的 `index.json`）不会经过 Next.js policy；其对象 metadata 使用 snapshot 浏览器档位。若需要仅把 Cloudflare 副本延长到 snapshot 边缘档位，应使用 Cache Response Rule 配置 `cloudflare_only` 的 `max-age=1800` 和 `stale-while-revalidate=86400`；Cache Response Rule 的结果优先于源站 `Cloudflare-CDN-Cache-Control`。

`BANDORI_CHART_SOURCE=bestdori` 保留默认的 web-only 行为。只有在私有资源构建器已经发布下方 music chart 对象后，才应切换到 `BANDORI_CHART_SOURCE=assets`。`BANDORI_MUSIC_CDN_BASE_URL` 可以让谱面读取使用单独主机；省略时使用 `BANDORI_ASSET_CDN_BASE_URL`。`BANDORI_CHART_BESTDORI_FALLBACK=1` 允许自建谱面对象缺失时临时回退 Bestdori。

`BANDORI_SONG_NOTES_SOURCE=bestdori` 会在音乐资源管线尚未完整时保持 `songs.notes` 与 Bestdori 对齐。当 `bandori/music/index.json` 已包含所有已发布歌曲的谱面派生 `notes` 后，可以切换到 `BANDORI_SONG_NOTES_SOURCE=assets`，让 `/api/bandori/master/songs` 从 HHWX music index 读取 note 数。`BANDORI_SONG_NOTES_BESTDORI_FALLBACK=1` 允许临时发布期间用 Bestdori 补齐缺失的 asset note count。关闭 fallback 后，assets 模式会在 music index 不可读或未覆盖全部歌曲时以 `503` fail closed。

Events、Cards 与 Stamps master API 会通过 `BANDORI_PRIVATE_R2_BUCKET` 配置的私有桶，直接读取各自的内容寻址 snapshot。pointer 或 pack 缺失、无权限、格式错误、损坏或超限时都会失败关闭，且不会回退到 Bestdori、公开 asset index 或公开 master artifacts。`BANDORI_EVENT_API_LOCAL_STORE_ROOT`、`BANDORI_CARDS_API_LOCAL_STORE_ROOT` 与 `BANDORI_STAMPS_API_LOCAL_STORE_ROOT` 可在本地开发时指向 tracker 生成的 content store，生产环境会拒绝这些设置。其他 master 数据集继续使用现有来源。`songs.notes` 默认继续使用 Bestdori，但可以按上面的配置切换到 HHWX music asset chart counts。

浏览器只从 `GET /api/bandori/master/cards` 读取一次完整 canonical Cards map，并在整个 SPA 生命周期内复用解析后的 map；账号所在服务器对应的标量扩展在浏览器本地物化。公开 Cards 列表/详情请求可选使用精确的 `server=0|1|2|3`，固定对应 JP/EN/TW/CN，字符串区服代码会被拒绝。旧的稀疏接口 `GET /api/bandori/cards?ids=...` 已删除。无服务器上下文的展示界面按“首选服务器、JP、EN、TW、CN”去重回退；卡牌档案和组队计算器中的档案卡牌则把档案所在服务器放在这个顺序之前，因此卡牌名和技能描述都优先服从档案身份，同时不修改用户的全局首选服务器。组队计算器还会在档案所在服务器缺少某张卡、但 JP 槽存在时纳入该 JP 卡；此规则只判断 snapshot 槽位是否存在，不读取 `releasedAt`，也不会把仅存在于 EN、TW 或 CN 的卡横向借给其他服务器。公开的按服务器过滤 API 与其他档案界面仍保持严格隔离。ID `10001`–`10010` 的冲突卡在计算和持久化中仍使用数字 ID；无服务器上下文的头像选择会将 EN/CN 实体展开成仅供 UI 使用的带区服引用，并把实际选择写入可空的 `profiles.avatar_card_server` 字段。

浏览器同样只从 `GET /api/bandori/master/events` 读取一次完整 Events map，并在 SPA 会话内供 Event Tracker、Calendar 和组队计算器共享。活动记录包含原始四服 master 字段，以及 `band`、四槽服务器本地 `stampRewardId`、标量 `stampCharacterId`；仅在官方 CN 时间范围不完整时按需包含顶层 `cnSchedule`。组队计算器直接使用这些记录内的 bonus 字段。旧 Events 列表和 bonus API 已删除；`/api/bandori/events/{eventId}/comments` 下的评论路由保持独立。

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
  "schemaVersion": 2,
  "updatedAt": "2026-07-23T00:00:00Z",
  "resources": {
    "res001001": {
      "images": {
        "normal": {
          "thumb": "<sha256>",
          "full": "<sha256>",
          "trim": "<sha256>"
        }
      },
      "gachaVoice": "<sha256>"
    }
  }
}
```

`resources` 以 `resourceSetName` 为 key。公开资源引用均为完整的小写 SHA-256 字符串；客户端将图片 key 推导为 `bandori/cards/{resourceSetName}/{variant}/{role}/{sha256}.png`，可选抽卡语音 key 推导为 `bandori/cards/{resourceSetName}/voice/gacha/{sha256}.mp3`。每个已声明的图片 variant 都必须完整包含 `thumb`、`full`、`trim`。资源可以只声明 `normal`、只声明 `after_training`，或者同时声明两者：只有一个完整 variant 时，特训前后两个 UI 状态共用它；两者都存在时，客户端严格使用所请求的 variant。这样既保留无特训生日卡和 KiraFes 卡在游戏中的 `after_training` 命名，也不复制对象。构建器内部的提取 provenance、字节大小、媒体类型、图片尺寸和音频时长不属于公开 index。

Events 使用另一个公开发现文档：

```http
GET {CDN_BASE}/bandori/events/index.json
```

响应根对象为 `{ "schemaVersion": 2, "updatedAt": "...", "events": { ... } }`。区域数组固定采用隐式顺序 `[jp, en, tw, cn]`。每个 `events[eventId]` 包含：

- `banners`：严格四槽 SHA-256 或 `null`。
- `teamIcons`：每项为 `{ "teamId": 1, "iconFileName": "...", "images": [sha256-or-null, sha256-or-null, sha256-or-null, sha256-or-null] }`。

活动图片 key 推导为 `bandori/events/images/{sha256}.png`。某区域素材缺失时，只能在自己的槽位使用 `null`；客户端不会借用其他服务器的素材。

所有推导出的对象 key 都相对于 `{CDN_BASE}`。文件名 stem 等于 index 中完整的小写 SHA-256。Web 应用会先校验 index，再使用其中资源，不会从 master data 的 bundle name 猜测 Cards/Events 路径。index 或所引用对象不可用时，相关图片保留占位，但 master data 与队伍计算继续工作。卡牌缩略图不会用 full 图兜底，Cards/Events 也不会回退 Bestdori 或旧 `/api/bandori/assets` proxy。

Bestdori 通用图标和卡框：

```text
{CDN_BASE}/bandori/res/icon/{iconName}
bandori/res/icon/{iconName}

{CDN_BASE}/bandori/res/image/card-{rarity}.png
bandori/res/image/card-{rarity}.png
```

音乐资源和谱面 JSON：

```text
{CDN_BASE}/bandori/music/index.json
{CDN_BASE}/bandori/music/jackets/{sha256}.png
{CDN_BASE}/bandori/music/thumbs/{sha256}.png
{CDN_BASE}/bandori/music/audio/{sha256}.mp3
{CDN_BASE}/bandori/music/charts/{sha256}.json

bandori/music/index.json
bandori/music/manifests/{musicId}.json
bandori/music/jackets/{sha256}.png
bandori/music/thumbs/{sha256}.png
bandori/music/audio/{sha256}.mp3
bandori/music/charts/{sha256}.json
```

`bandori/music/index.json` 与 Cards、Events、Stamps 使用相同的紧凑可变 index 根结构：

```json
{
  "schemaVersion": 2,
  "updatedAt": "2026-07-27T00:00:00Z",
  "songs": {
    "1": {
      "files": {
        "jacket": "<sha256>",
        "thumb": "<sha256>",
        "audio": "<sha256>",
        "charts": { "3": "<sha256>" }
      },
      "notes": { "3": 459 },
      "bpm": { "3": [{ "bpm": 185, "start": 0, "end": 119.995 }] },
      "length": 119.995
    }
  }
}
```

歌曲 ID 与难度 index 都使用按数值升序排列的数字字符串 key。难度 index `"0"` 到 `"4"` 依次表示 `easy`、`normal`、`hard`、`expert`、`special`。每个文件值都是完整的小写 SHA-256；客户端按上面的内容寻址路径推导对象 key，也可以校验收到的内容，不再需要查询参数版本。`notes`、`bpm` 与 `files.charts` 必须覆盖完全相同的难度。刻意不含音频的本地构建可以省略 `audio`，但生产就绪校验要求它存在。`bandori/music/manifests` 下的单曲提取 manifest 保留来源服务器及 bundle 溯源信息供 builder 使用，但不属于公开 index 契约。

Stamp 目录、静态图、语音与动画资源：

```text
{CDN_BASE}/bandori/stamps/index.json
{CDN_BASE}/bandori/stamps/images/{sha256}.png
{CDN_BASE}/bandori/stamps/voices/{sha256}.mp3
{CDN_BASE}/bandori/stamps/changed/manifests/{sha256}.json
{CDN_BASE}/bandori/stamps/animation/manifests/{sha256}.json
{CDN_BASE}/bandori/stamps/animation/atlases/{sha256}.png

bandori/stamps/index.json
bandori/stamps/images/{sha256}.png
bandori/stamps/voices/{sha256}.mp3
bandori/stamps/changed/manifests/{sha256}.json
bandori/stamps/animation/manifests/{sha256}.json
bandori/stamps/animation/atlases/{sha256}.png
```

`GET /api/bandori/master/stamps` 返回 `{ success: true, data }`，其中 `data` 以 stamp ID 为 key。每条记录都包含固定 `[jp, en, tw, cn]` 四槽的 `imageName` 与 nullable `characterId`；缺失名称使用 `""`，缺失或无法解析的角色 ID 使用 `null`。存在 Changed Stamp 的记录还会包含可选四槽 `changedStamps`；每服内部按 `(imageName, soundName)` 排序去重，不公开原始 Changed 规则 ID、时间或概率。此 API 不公开存储 pointer、来源元数据、资源 URL 或资源 hash。

`bandori/stamps/index.json` 是公开 asset index，根结构与 Cards/Events 一致：`schemaVersion`、`updatedAt`、`stamps` 领域 map 和 `changedStampGroups`。每个 Stamp 条目包含四槽 `images` SHA-256、可选四槽 `voices` SHA-256、可选四槽 Changed 图片/音频 hash，以及可选的 `animations`。`changedStampGroups` 按服务器和规则 ID 列出所有已发布 Changed manifest，即使当前前端未展示对应资源也不会从 index 省略。标准缺失槽位使用 `""`，Changed 缺失槽位使用空数组；复用普通图片的 Changed 条目可以省略 `image`，没有可用转码音频时可以省略 `audio`。客户端直接推导不可变路径：`bandori/stamps/images/{sha256}.png`、`bandori/stamps/voices/{sha256}.mp3`、`bandori/stamps/changed/manifests/{sha256}.json`、`bandori/stamps/animation/manifests/{sha256}.json` 和 `bandori/stamps/animation/atlases/{sha256}.png`，不再需要查询字符串版本参数。源语音名称和原始 Changed 规则元数据保留在内部提取 manifest 中，不进入精简根 index。标准单个 stamp manifest 不属于公开 index 合约。动画 manifest 使用 `hhwx-bandori-stamp-animation-v1`，并包含 `atlasDimensions`、`frameRate` 和帧裁剪矩形，使 Web 应用不依赖 Unity runtime 即可渲染基于 atlas 的动画 stamp。当前 HHWX atlas PNG 以 `frames[].unityRect` 作为实际 PNG 裁剪矩形；Web 应用会将它归一化为内存中的 `frames[].cssRect`，仅在缺少 `unityRect` 时回退使用源 `frames[].cssRect`。

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
https://your-bandori-asset-cdn.example.com/bandori/music/charts/<chartSha256>.json
https://your-bandori-asset-cdn.example.com/bandori/stamps/index.json
https://your-bandori-asset-cdn.example.com/bandori/stamps/images/<imageSha256>.png
https://your-bandori-asset-cdn.example.com/bandori/stamps/animation/manifests/<manifestSha256>.json
https://your-bandori-asset-cdn.example.com/bandori/stamps/animation/atlases/<atlasSha256>.png
```

Cards/Events 应从下载到的 index 中各选代表性 hash，按照上面的契约推导 key，再验证 `{CDN_BASE}/{derivedKey}`。不要验证猜测的游戏 bundle 路径；它们不是公开 HTTP 契约。

Cards/Events index 响应及其引用的对象都必须允许 HHWX Web origin 无凭据跨域读取：

```bash
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/cards/index.json
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/events/index.json
```

针对 stamp CORS，至少用 `Origin` header 验证一个 JSON 对象和一个 voice 对象：

```bash
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/stamps/index.json
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/stamps/voices/<voiceSha256>.mp3
```

两者都应返回 `Access-Control-Allow-Origin: https://hhwx.org`；如果是完全公开且不带 credentials 的资源桶，也可以返回 `Access-Control-Allow-Origin: *`。然后打开相关 HHWX 页面，确认 Stamp master map 只通过 `/api/bandori/master/stamps` 读取一次，公开 hash index 只从 `/bandori/stamps/index.json` 读取一次，而动画 manifest、atlas 图片和 voice audio 请求都直接访问配置的 CDN base URL。
