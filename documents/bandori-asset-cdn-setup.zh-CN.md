# Bandori Asset CDN 契约

Events/Cards/Degrees/Music/Stamps API 与 index 的统一约定见 [bandori-master-asset-contract.zh-CN.md](bandori-master-asset-contract.zh-CN.md)。

English version: [bandori-asset-cdn-setup.md](bandori-asset-cdn-setup.md)

本文档说明 HHWX Web 应用对 Bandori 静态资源的公开 URL 契约。它不是 tracker 设置指南。

HHWX 生产环境使用私有采集和镜像服务填充 CDN 与 R2 bucket。这些服务不包含在本仓库中。自托管运营者如果希望同样依赖资源较多的工作流可用，需要提供自己的资源主机、兼容的私有采集流程和已填充的 R2 bucket。

本文档不是素材许可证、公开再分发授权，也不允许复用 HHWX 生产基础设施。缓存、镜像或展示第三方游戏数据和媒体前，请阅读 [../NOTICE.zh-CN.md](../NOTICE.zh-CN.md)。

## Web 配置

卡牌 UI 内建资源使用稳定、非内容寻址路径，并保留游戏原始资源名。完整卡框位于 `bandori/resources/images/card-frame/{resourceName}.png`，独立 MenuAtlas sprite 位于 `bandori/resources/atlases/menu-atlas/{spriteName}.png`。这些对象只从 JP base APK 一次性提取，使用一年 `immutable` 缓存发布，不通过公开 index 发现。Web 应用按固定 allowlist 组装 URL；未配置资源 CDN 时失败关闭，不回退 Bestdori。卡牌渲染组件使用已有的矢量叠层：`bandori/res/icon/band_{bandId}.svg`、`bandori/res/icon/{attribute}.svg` 与 `bandori/res/icon/master.svg`；缩略图和完整卡面均使用对应的 SVG 乐团与属性标记，Master 标记则在需要显示该叠层的位置使用。五张组合稀有度预览也保持不变，仍位于 `bandori/res/icon/star_1.png` 至 `star_5.png`。这些固定遗留对象由自有 R2 提供，运行时不会请求 Bestdori。

Web 应用从以下环境变量读取 Bandori 资源 URL：

```dotenv
NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL=https://your-bandori-asset-cdn.example.com
BANDORI_R2_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com
# BANDORI_R2_ACCESS_KEY_ID=your_r2_access_key_id
# BANDORI_R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
BANDORI_PUBLIC_R2_BUCKET=your_public_asset_bucket
BANDORI_PRIVATE_R2_BUCKET=hhwx-private
# BANDORI_MUSIC_API_LOCAL_STORE_ROOT=/path/to/music/store
# BANDORI_DEGREES_API_LOCAL_STORE_ROOT=/path/to/degrees/store
# BANDORI_STAMPS_API_LOCAL_STORE_ROOT=/path/to/stamps/store
```

`NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL` 是浏览器与服务端渲染公开 URL 共用的资源主机。Cards、Events、Degrees 与 Stamps 资源通过下文各自的公开 index 发现；浏览器使用正常 HTTP 缓存且不携带凭据读取这些 index。Degree 与 Stamp 使用同一个 Bandori asset CDN 下的 `/bandori/degrees` 和 `/bandori/stamps` 路径，不提供数据集专属 CDN 配置。Web 应用通过 `/api/bandori/master/degrees` 或 `/api/bandori/master/stamps` 读取私有 Master 元数据，直接从公开 CDN 读取对应 index，再在浏览器内存中合并。图片、动画 manifest、动画 atlas、voice audio 与卡牌招募语音随后直接从 CDN 读取，因此 CDN 必须允许 HHWX Web origin 跨域读取。Stamp voice 与卡牌招募语音共用 Web Audio 一次性音效通道，而不是作为媒体元素播放，从而沿用旨在避免 iOS 把它们当作音乐并打断后台播放的浏览器音频会话策略。

服务端 HHWX API 消费已发布到 CDN 的 Bandori 资源时，必须通过 R2/S3 签名请求直接读取背后的对象存储。服务端路径不要再请求 `cdn.hhwx.org` 等 HHWX 自有公网 CDN URL，因为 Cloudflare bot mitigation 可能会对 server-to-CDN 流量返回 challenge。完整共享 endpoint 固定使用 `BANDORI_R2_ENDPOINT`，凭据使用其余 `BANDORI_R2_*`，公开 bucket 使用 `BANDORI_PUBLIC_R2_BUCKET`，私有 snapshot bucket 使用 `BANDORI_PRIVATE_R2_BUCKET`。应用不会再从单独的 account-ID 变量推导 endpoint，也不接受数据集专属的旧 R2 名称。R2 请求签名固定使用 Cloudflare 的 `auto` region。Music metadata 与 chart reader 通过这条路径读取 `bandori/music/index.json` 和内容寻址的谱面 JSON；chart reader 会先校验对象 SHA-256 再解析。Degrees 与 Stamps master API 从 `BANDORI_PRIVATE_R2_BUCKET` 读取各自独立的内容寻址 snapshot，不读取公开 asset index；浏览器则直接从 CDN 读取公开 index 与资源。

HHWX 生产环境应在 `/bandori/degrees/*`、`/bandori/stamps/*` 与 `/bandori/cards/*/voice/*` 对象上为 `https://hhwx.org` 配置 CORS。如果允许多个精确 origin，请同时返回 `Vary: Origin`。Web 应用读取这些 CDN 对象时不会携带 credentials，除非请求模型发生变化，否则不要启用带凭据 CORS。完全公开且不带 credentials 的资源桶可以使用 `Access-Control-Allow-Origin: *`；不要把 `*` 和带凭据请求搭配使用。本地浏览器验证应使用已列入允许范围的精确 origin `http://localhost:3000`；`http://127.0.0.1:3000` 属于另一个 origin，需要单独配置 CORS。

HHWX 应用响应使用 `Cache-Control` 控制浏览器及下游缓存 TTL，并使用 `Cloudflare-CDN-Cache-Control` 单独控制 Cloudflare 边缘 TTL 与 stale 行为。公开 API 使用四个可变缓存档位：fast mutable（浏览器 `1 分钟 + 5 分钟 SWR`，边缘 `5 分钟 + 15 分钟 SWR`）、snapshot（浏览器 `5 分钟 + 30 分钟 SWR`，边缘 `30 分钟 + 1 天 SWR`）、reference（浏览器 `1 小时 + 12 小时 SWR`，边缘 `12 小时 + 1 天 SWR`）和 long asset（浏览器 `1 天 + 7 天 SWR`，边缘 `30 天 + 90 天 SWR`）。私有、实时及错误响应使用 `no-store`；内容寻址对象使用一年 `immutable`。不要再加入 `s-maxage`，因为它会与 stale-while-revalidate 语义冲突。

Cloudflare Cache Rule 可以只把目标公开 `GET`/`HEAD` 路径标记为符合缓存条件，同时继续接受源站响应头。由 R2 或资源 CDN 直接提供的对象（包括 Cards、Degrees、Events、Music 和 Stamps 的 `index.json`）不会经过 Next.js policy；其对象 metadata 使用 snapshot 浏览器档位。若需要仅把 Cloudflare 副本延长到 snapshot 边缘档位，应使用 Cache Response Rule 配置 `cloudflare_only` 的 `max-age=1800` 和 `stale-while-revalidate=86400`；Cache Response Rule 的结果优先于源站 `Cloudflare-CDN-Cache-Control`。

谱面 API 始终通过带签名的 R2 请求，从 `BANDORI_PUBLIC_R2_BUCKET` 读取 `bandori/music/index.json` 及其内容寻址谱面对象；Music 计分 meta API 使用同一签名 reader 读取 `bandori/music/meta.json`，再校验 `musicIndexSha256` 指定的精确 `bandori/music/index.json` bytes。这些数据源和对象根路径属于固定应用契约；缺失、不可读或 hash 不匹配时会失败关闭，绝不会回退 Bestdori。浏览器侧 Music 资源使用 `NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL`，不再提供单独的 Music CDN 配置。

Events、Cards、Degrees、Music 与 Stamps master API 会通过 `BANDORI_PRIVATE_R2_BUCKET` 配置的私有桶，直接读取各自的内容寻址 snapshot。其余 master 数据集始终从 `BANDORI_PUBLIC_R2_BUCKET` 的 `bandori/master` 路径合并固定 JP、EN、TW、CN 四服 artifact。pointer、manifest、dataset 或 pack 缺失、无权限、格式错误、损坏或超限时都会失败关闭，且不会回退到 Bestdori、公开 asset index、公开 CDN 读取或 Supabase pointer。`BANDORI_EVENT_API_LOCAL_STORE_ROOT`、`BANDORI_CARDS_API_LOCAL_STORE_ROOT`、`BANDORI_DEGREES_API_LOCAL_STORE_ROOT`、`BANDORI_MUSIC_API_LOCAL_STORE_ROOT` 与 `BANDORI_STAMPS_API_LOCAL_STORE_ROOT` 可在本地开发时指向 tracker 生成的 content store，生产环境会拒绝这些设置。

浏览器只从 `GET /api/bandori/master/cards` 读取一次完整 canonical Cards map，并在整个 SPA 生命周期内复用解析后的 map；账号所在服务器对应的标量扩展在浏览器本地物化。公开 Cards 列表/详情请求可选使用精确的 `server=0|1|2|3`，固定对应 JP/EN/TW/CN，字符串区服代码会被拒绝。旧的稀疏接口 `GET /api/bandori/cards?ids=...` 已删除。无服务器上下文的展示界面按“首选服务器、JP、EN、TW、CN”去重回退；卡牌档案和组队计算器中的档案卡牌则把档案所在服务器放在这个顺序之前，因此卡牌名和技能描述都优先服从档案身份，同时不修改用户的全局首选服务器。组队计算器还会在档案所在服务器缺少某张卡、但 JP 槽存在时纳入该 JP 卡；此规则只判断 snapshot 槽位是否存在，不读取 `releasedAt`，也不会把仅存在于 EN、TW 或 CN 的卡横向借给其他服务器。公开的按服务器过滤 API 与其他档案界面仍保持严格隔离。ID `10001`–`10010` 的冲突卡在计算和持久化中仍使用数字 ID；无服务器上下文的头像选择会将 EN/CN 实体展开成仅供 UI 使用的带区服引用，并把实际选择写入可空的 `profiles.avatar_card_server` 字段。

浏览器同样只从 `GET /api/bandori/master/events` 读取一次完整 Events map，并在 SPA 会话内供 Event Tracker、Calendar 和组队计算器共享。活动记录包含原始四服 master 字段，以及 `band`、四槽服务器本地 `stampRewardId`、标量 `stampCharacterId`；仅在官方 CN 时间范围不完整时按需包含顶层 `cnSchedule`。组队计算器直接使用这些记录内的 bonus 字段。旧 Events 列表和 bonus API 已删除；`/api/bandori/events/{eventId}/comments` 下的评论路由保持独立。

浏览器只从 `GET /api/bandori/master/music` 读取一次完整 Music map，并在整个 SPA 会话内复用；`GET /api/bandori/master/music/{musicId}` 提供对应详情。`difficulty`、`notes` 与 `bpm` 下的数字键 `0` 至 `4` 表示谱面难度而非服务器，服务器本地发布时间仍使用固定四槽数组。组队计算器从该 map 读取 `difficulty.playLevel`，并从自有谱面 API 读取计分所需的 note 时序。独立的 `GET /api/bandori/master/music/meta` 只返回供前端实时计算分数与排名的 `{durations,songs}`。每个难度为 `{total,covered}`：`total` 是全谱面的 `[普通,FEVER]`，每个 `covered[时长]` 是六个技能窗口内的 `[普通,FEVER]`。API 不暴露歌曲展示字段、已计算分数、排名或 Bestdori 回退数据。旧 `/api/bandori/master/songs`、`/api/bandori/master/songs/{songId}` 与 `/api/bandori/songs?ids=...` 路由已经删除。

## 榜线历史 API

`GET /api/bandori/tracker/data` 可以从 `bandori/trackerdata` 下的对象直接读取 JP、EN、TW、CN 四服榜线历史。公开数字参数 `server=0|1|2|3` 对应对象路径中的 `jp|en|tw|cn`。服务端使用带签名的 R2/S3 请求，不会通过公共 CDN 绕行读取聚合数据。共享 public artifact bucket 按下面配置；endpoint 与凭据继续使用仅限服务端的 `BANDORI_R2_*`：

```dotenv
BANDORI_PUBLIC_R2_BUCKET=cdn
```

生产 API 固定为纯 R2。存在仍在允许范围内的已验证内存 stale snapshot 时可以使用，否则 R2 运行故障返回 `503 TRACKER_HISTORY_UNAVAILABLE`。生产 route 不 import 或查询已冻结的 Supabase 历史表，也不存在运行时数据源开关或数据库 fallback。

manifest 不存在、manifest 没有请求的 pack 类型，或有效 pack 中没有请求档位，都属于正常空数据，继续返回现有的 `200 + { result: true, cutoffs: [] }`。manifest 已经引用但 pack 缺失或无效则属于运行故障，不能伪装为空结果。公开请求参数、5000 行上限、响应格式和 API `no-store` 策略保持不变。CN 进行中活动榜的 live delivery 仍是独立的 latest snapshot 与 Private Broadcast 能力；JP、EN、TW 不会创建 tracker latest 查询或 tracker Broadcast 订阅。

月榜 ID 是各服独立、按自然月连续递增的编号，不能把旧服数字 ID 直接复制到新服。Web 与 R2 共用同一日历：JP `2024-10/id=1`、UTC+9 15:00 开放；EN `2025-10/id=1`、固定 UTC-8 00:00 开放；TW `2025-06/id=1`、UTC+8 15:00 开放；CN `2025-02/id=1`、UTC+8 13:00 开放。月榜对象路径使用换算后的自然月 `YYYY-MM`；切换服务器时先保留 period，再映射为目标服 ID。

对象根路径固定为数据契约 `bandori/trackerdata`，不会通过环境变量修改。下面的限制是损坏对象和资源耗尽保护，不会预留相应内存，也不是正常对象应达到的目标：

| 保护项 | 限制 | 依据 |
| --- | ---: | --- |
| manifest 与 pack 共享对象读取预算 | 3 秒 | 在稳定 `503` 前约束两次签名 S3 读取；后续 hash、解压、JSON 解析和契约校验分别由下方字节数与记录数上限约束。 |
| manifest | 64 KiB | 足以容纳当前 descriptor 和每类最多 8 个保留 pack key，并留有大量余量。 |
| gzip pack | 2 MiB | 约为实测 event 315 pack（61.7 KiB）的 33 倍。 |
| 解压 JSON | 16 MiB | 约为实测 event 315 payload（255 KiB）的 64 倍，同时限制异常 gzip 膨胀。 |
| 单 pack 记录数 | 200,000 | 约为实测 event 315 记录数（10,723）的 19 倍；每分钟实时推送不会写入这些历史 pack。 |
| parsed cache | 16 项 / 估算 32 MiB | 覆盖主图和比较目标，同时避免浏览大量历史活动后无限保留 pack。 |
| 失败冷却 | 每目标 15 秒 | 防止 R2 故障时每个 API 请求都再次触发失败对象读取。 |

parsed cache 权重按“解压字节 + 每个点 64 字节 + 少量 Map/分组开销”保守估算。解析完成后不会保留压缩 Buffer、解压 Buffer 或 JSON 文本。对象超过保护上限时不会被截断，而是返回 `503`。只有新的生产盘点证明数据规模确实增长后，才应人工调整限制。

为了提供切流证据，每个 Web 进程对于同一区服、目标类型和 manifest generation 最多记录一次结构化 `Bandori tracker history R2 read succeeded` 日志，其中包含 server、generation、读取耗时和返回记录数，但不包含凭据或对象正文。降级读取同样按区服与目标独立限频。

生产切换到 R2-first 前，使用只读命令对照代表性目标；命令不会写入任何数据源：

```bash
npm run compare:bandori-tracker-history -- --event 315 --type event --tier 1000
npm run compare:bandori-tracker-history -- --event 316 --type event --tier 1000
npm run compare:bandori-tracker-history -- --event 316 --type song --tier 1000
npm run compare:bandori-tracker-history -- --event 18 --type monthly --tier 1000
```

显式离线对照命令会固定一次 manifest generation，验证 gzip、hash 和 pack 契约，应用现有响应上限及分组语义，再逐点比较 Supabase；还应额外选择一个已知在两侧都为空的受支持档位。生产请求路径在正常空结果和 R2 故障时都不会访问 Supabase。旧记录只保留为冻结审计证据，不能作为生产回滚数据源；应修复 R2 或回滚协调后的 writer/application 切换，但不要删除 tracker artifact 或数据库记录。

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

固定的官方卡牌 UI 资源：

```text
{CDN_BASE}/bandori/resources/images/card-frame/{resourceName}.png
bandori/resources/images/card-frame/{resourceName}.png

{CDN_BASE}/bandori/resources/atlases/menu-atlas/{spriteName}.png
bandori/resources/atlases/menu-atlas/{spriteName}.png
```

固定的遗留缩略图矢量叠层：

```text
{CDN_BASE}/bandori/res/icon/band_{bandId}.svg
{CDN_BASE}/bandori/res/icon/{attribute}.svg
{CDN_BASE}/bandori/res/icon/master.svg

bandori/res/icon/band_{bandId}.svg
bandori/res/icon/{attribute}.svg
bandori/res/icon/master.svg
```

乐团固定 allowlist 为 `1`、`2`、`3`、`4`、`5`、`18`、`21`、`45`；属性固定为 `powerful`、`cool`、`happy`、`pure`。这些自有 R2 对象不做定期同步，也不提供 Bestdori 运行时回退。

音乐资源和谱面 JSON：

```text
{CDN_BASE}/bandori/music/index.json
{CDN_BASE}/bandori/music/meta.json
{CDN_BASE}/bandori/music/jackets/{sha256}.png
{CDN_BASE}/bandori/music/thumbs/{sha256}.png
{CDN_BASE}/bandori/music/audio/{sha256}.mp3
{CDN_BASE}/bandori/music/charts/{sha256}.json

bandori/music/index.json
bandori/music/meta.json
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

`bandori/music/meta.json` 是独立的 schema 2 可变 root，包含 `schemaVersion`、`updatedAt`、`musicIndexSha256`、排序后的 `durations` 与 `songs`。其歌曲/难度覆盖必须与 `music/index.json` 一致；每个难度包含一组全谱面的 `[普通,FEVER]` total，以及完整覆盖所有已发布时长的 `[普通,FEVER]` covered 系数。每个公开值都使用 binary64 未舍入 note 权重，按谱面顺序独立逐项累加，再按 `floor(value * 10000 + 0.5) / 10000` 舍入。

技能覆盖同时要求 `noteIndex > triggerIndex` 与 `noteTime <= triggerTime + duration`，不添加时间 epsilon。触发 note 不受自身新技能加成；同时刻的其他 note 在规范化序列中排在触发 note 后，因此受到覆盖。谱面时间、note 顺序和技能窗口边界以当前组曲计算器为准。系数仍使用普通单曲 combo 与可选 FEVER 权重，重叠窗口只计一次；它们是排名输入，不是完整的组曲计分结果。

Music 发布先提交 `index.json`，再写入并回读绑定其精确 bytes 的 `meta.json`。签名 R2 读取的上限分别为 **Meta 8 MiB**、**配对 Music index 使用共享默认 4 MiB**。API 拒绝 hash 不匹配，并只投影 `{durations,songs}`。全量 Music 同步负责从 schema 1 迁移到 schema 2，局部 root 更新不能执行迁移。两个 root 写入之间的新读取会失败关闭，直到发布重试补齐 `meta.json`；已缓存的成功响应仍可能按 snapshot 策略继续提供。

### Music Meta schema 切换

旧 reader 只接受 schema 1，当前 reader 只接受 schema 2。任何单纯的部署先后顺序都不能保证连续可用；不提供旧格式转换或 Bestdori fallback。不引入兼容 reader 的切换需要明确批准的维护窗口；窗口、写入者控制和配对回滚准备完成前不得发布。

1. 修改 builder 代码或 root 前，暂停自动 Music 写入者并等待在途工作完成。保留旧 `index.json`、`meta.json` 的精确 bytes、hash 和匹配的 Web/builder 版本，保留 runtime checkpoint 与恢复状态。
2. 在已批准的窗口内，阻止流量进入不匹配的 reader/root 组合。部署 builder，从冻结输入执行一次受控的全量 Music 重建，验证 schema 2、配对 index hash 和完整歌曲/难度覆盖。重新提交已成功的 frozen job 不等于重建。
3. 恢复流量前部署 schema 2 Web reader。逐个应用实例验证签名存储读取，清除受影响的边缘缓存，并全量核对公开 API 与已验证 artifact。新的服务端 cache key 隔离 schema 2，但不会清除旧边缘或浏览器响应；持有旧响应的客户端必须刷新，所需浏览器缓存到期时间也须纳入窗口。
4. 验收后再恢复自动写入。切换失败时保持流量隔离与写入暂停，恢复匹配的代码版本和**两个旧 root 的精确 bytes**；确认 hash 配对、刷新受影响缓存后再开放。禁止只回滚 Web 或 Meta、覆盖不可变资源，或重置 job ledger 强迫重试。

私有操作命令和窗口时长记录在部署专属 runbook。以上是协调维护切换要求，不是零停机保证。

谱面模拟器演出资源：

```text
{CDN_BASE}/bandori/chart-simulator/index.json
{CDN_BASE}/bandori/chart-simulator/manifests/{manifestSha256}.json
{CDN_BASE}/bandori/chart-simulator/packs/{packTreeHash}/{projectionRelativePath}
```

可变 index 严格只含 `{schemaVersion, updatedAt, manifest}`，schema version 为 `1`；`manifest` 是不可变总 manifest 原字节的完整小写 SHA-256。Manifest 严格只含 `{schemaVersion, packs}`，schema 为 `hhwx-bandori-chart-simulator-assets-v1`；`packs` 把 `ingameskin/noteskin/skin00`、`sound/tapseskin/skin00` 等原游戏 bundle 名映射到一个确定性 tree hash，不包含 kind、ordinary/limited 分类、URL、size、逐文件 hash 或审计元数据。固定 APK HUD 派生资源使用唯一的合成 pack key `apk`。

Pack 成员保留 `/local/chart-simulator/` 之后的既有路径以及最终 PNG、WAV、JSON 原字节，不重新编码、不预合并，也不包入 ZIP。Tree hash 覆盖一个源 bundle 完整投影中排序并规范化的成员路径与字节，因此成员目录整体不可变，无需公开逐成员描述符。浏览器校验并固定总 manifest 后，按逻辑路径与原游戏 bundle 推导成员 URL，只请求当前普通或限定背景、按键条／判定线、节奏标志、Directional、点击效果与 TapSE 设置真正需要的资源。任一条目缺失都会失败关闭，不回退本地文件、Bestdori 或其它 pack。`skin_teamlivefestival` 是规范 bundle 与逻辑目录名。

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

`bandori/stamps/index.json` 是公开 asset index，根结构与 Cards/Events 一致：`schemaVersion`、`updatedAt`、`stamps` 领域 map 和 `changedStampGroups`。每个 Stamp 条目包含四槽 `images` SHA-256、可选四槽 `voices` SHA-256、可选四槽 Changed 图片/音频 hash，以及只含 `manifest` 与 `atlas` SHA-256 的可选 `animations`。`changedStampGroups` 按服务器和规则 ID 列出所有已发布 Changed manifest，即使当前前端未展示对应资源也不会从 index 省略。标准缺失槽位使用 `""`，Changed 缺失槽位使用空数组；复用普通图片的 Changed 条目可以省略 `image`，没有可用转码音频时可以省略 `audio`。客户端直接推导不可变路径：`bandori/stamps/images/{sha256}.png`、`bandori/stamps/voices/{sha256}.mp3`、`bandori/stamps/changed/manifests/{sha256}.json`、`bandori/stamps/animation/manifests/{sha256}.json` 和 `bandori/stamps/animation/atlases/{sha256}.png`，不再需要查询字符串版本参数。源语音名称和原始 Changed 规则元数据保留在内部提取元数据中，不进入精简根 index。标准单个 stamp manifest 不属于公开 index 合约。动画 manifest 严格使用精简 `hhwx-bandori-stamp-animation-v1` 结构：`schemaVersion`、显式正数 `frameRate`、`atlasDimensions` 和有序 `frames: [{ name, cssRect }]`。`cssRect` 使用 atlas PNG 的左上角坐标且不能越界；不再提供 12 FPS 或 `unityRect` fallback，bundle 审计字段只保留在各区服诊断 index。Web reader 仍会为兼容旧根描述符而校验并丢弃可选的 `frameRate`、`frameCount`。重新发布时先写入并验证新的不可变对象，再写区服诊断 index 和 root；root 切换后再部署仅使用 cssRect 的 Web reader，因此无需回滚或原地覆盖不可变对象。

Degree 元数据、静态图与动画资源：

```text
GET /api/bandori/master/degrees
{CDN_BASE}/bandori/degrees/index.json
{CDN_BASE}/bandori/degrees/images/{sha256}.png
{CDN_BASE}/bandori/degrees/animation/manifests/{sha256}.json
{CDN_BASE}/bandori/degrees/animation/atlases/{sha256}.png
{CDN_BASE}/bandori/degrees/effect/manifests/{sha256}.json
{CDN_BASE}/bandori/degrees/effect/atlases/{sha256}.png

bandori/master/degrees/api/active.json
bandori/master/degrees/api/packs/degrees/{sha256}.json.gz
bandori/degrees/index.json
bandori/degrees/images/{sha256}.png
bandori/degrees/animation/manifests/{sha256}.json
bandori/degrees/animation/atlases/{sha256}.png
bandori/degrees/effect/manifests/{sha256}.json
bandori/degrees/effect/atlases/{sha256}.png
```

前两个对象存储路径为私有对象，其余 Degree index 和内容寻址媒体路径为公开对象。Master 响应按 degree ID 组织，包含八个 `[jp, en, tw, cn]` canonical 字段：`degreeType`、`iconImageName`、`baseImageName`、`rank`、`degreeName`、`description`、`seq`、`characterId`；只有 CN 动态效果存在时才增加四槽 `serverExtensions`。它沿用 Cards/Music 的共享槽位语义：该服不存在 Degree 时为 `null`，存在但没有扩展时为 `{}`，只有 CN 槽可以包含 `degreeEffect`。缺失字符串使用 `""`，缺失数字槽使用 `0`，`rank` 保持字符串。公开 schema 2 index 按资源名组织：base 使用 `baseImageName`；rank 使用 `rank_none` 或 `{degreeType}_{rank}`；icon 使用 `icon_none` 或 `{iconImageName}_{rank}`；effect 直接使用 master `assetBundleName`，并位于该资源的 `effects.cn`。`ani_degree*` 动画、普通图片和 effect 资源不能混用；浏览器可在发布过渡期读取 schema 1。公开资料选择和视觉渲染属于独立的应用合同。

Degree 动画 manifest 必须恰好使用 `schemaVersion: "hhwx-bandori-degree-animation-v1"`、`frameRate: 30`、`loop: true`、`atlasDimensions` 和有序 `frames: [{ name, rect }]`。矩形使用图集左上角坐标且不能越界；零填充帧名按字典序连续排列。内容 hash 针对最终 PNG 或 JSON 字节计算，因此即使区服描述符分开，完全相同的字节也会自然复用同一个不可变对象。

Degree effect manifest 使用 `schemaVersion: "hhwx-bandori-degree-effect-v1"`、bundle 内显式的正整数 `frameRate`、`loop: true` 和连续的 `effect_degree_0000...` 帧。

## 自托管预期

开源 Web 仓库可以渲染依赖公开元数据和已配置资源 URL 的页面。它不包含：

- HHWX 生产 tracker；
- 资源预抓取或镜像任务；
- Cloudflare R2 凭据或 bucket 配置；
- Bilibili session 凭据；
- 用于游戏账号绑定和手动游戏数据同步的 HHWX user-fetcher 服务。

自托管部署必须为 master 与谱面 API 配置兼容的 R2 endpoint 凭据，以及已填充的公开/私有 bucket。R2 数据缺失时会返回 API 故障，不会转而请求 Bestdori。公开资源主机缺失时，浏览器渲染的图片仍可能不可用；私有服务缺失时，对应同步工作流也会不可用。

## 验证

配置资源主机后，可以用浏览器或 HTTP client 验证代表性 URL：

```text
https://your-bandori-asset-cdn.example.com/bandori/cards/index.json
https://your-bandori-asset-cdn.example.com/bandori/events/index.json
https://your-bandori-asset-cdn.example.com/bandori/degrees/index.json
https://your-bandori-asset-cdn.example.com/bandori/degrees/images/<imageSha256>.png
https://your-bandori-asset-cdn.example.com/bandori/degrees/animation/manifests/<manifestSha256>.json
https://your-bandori-asset-cdn.example.com/bandori/resources/atlases/menu-atlas/icon_character001.png
https://your-bandori-asset-cdn.example.com/bandori/resources/images/card-frame/frame_ss_rainbow.png
https://your-bandori-asset-cdn.example.com/bandori/music/charts/<chartSha256>.json
https://your-bandori-asset-cdn.example.com/bandori/stamps/index.json
https://your-bandori-asset-cdn.example.com/bandori/stamps/images/<imageSha256>.png
https://your-bandori-asset-cdn.example.com/bandori/stamps/animation/manifests/<manifestSha256>.json
https://your-bandori-asset-cdn.example.com/bandori/stamps/animation/atlases/<atlasSha256>.png
```

Cards/Events/Degrees 应从下载到的 index 中各选代表性 hash，按照上面的契约推导 key，再验证 `{CDN_BASE}/{derivedKey}`。不要验证猜测的游戏 bundle 路径；它们不是公开 HTTP 契约。

Cards/Events index 响应及其引用的对象都必须允许 HHWX Web origin 无凭据跨域读取：

```bash
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/cards/index.json
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/events/index.json
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/degrees/index.json
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/degrees/animation/manifests/<manifestSha256>.json
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/cards/<resourceSetName>/voice/gacha/<voiceSha256>.mp3
```

针对 stamp CORS，至少用 `Origin` header 验证一个 JSON 对象和一个 voice 对象：

```bash
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/stamps/index.json
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/stamps/voices/<voiceSha256>.mp3
```

这些响应都应返回 `Access-Control-Allow-Origin: https://hhwx.org`；如果是完全公开且不带 credentials 的资源桶，也可以返回 `Access-Control-Allow-Origin: *`。然后打开相关 HHWX 页面，确认 Stamp master map 只通过 `/api/bandori/master/stamps` 读取一次，各公开 hash index 从配置的 CDN 路径读取，而动画 manifest、atlas 图片、Stamp voice 与卡牌招募语音都直接请求配置 CDN base URL 下的内容寻址对象。
