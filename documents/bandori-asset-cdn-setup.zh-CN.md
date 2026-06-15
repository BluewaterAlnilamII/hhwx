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
```

`NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL` 会暴露给浏览器。`BANDORI_ASSET_CDN_BASE_URL` 可供服务端代码使用。大多数部署中两者应指向同一个资源主机。

`BANDORI_CHART_SOURCE=bestdori` 保留默认的 web-only 行为。只有在私有资源构建器已经发布下方 music chart 对象后，才应切换到 `BANDORI_CHART_SOURCE=assets`。`BANDORI_MUSIC_CDN_BASE_URL` 可以让谱面读取使用单独主机；省略时使用 `BANDORI_ASSET_CDN_BASE_URL`。`BANDORI_CHART_BESTDORI_FALLBACK=1` 允许自建谱面对象缺失时临时回退 Bestdori。

`BANDORI_SONG_NOTES_SOURCE=bestdori` 会在音乐资源管线尚未完整时保持 `songs.notes` 与 Bestdori 对齐。当 `bandori/music/index.json` 已包含所有已发布歌曲的谱面派生 `notes` 后，可以切换到 `BANDORI_SONG_NOTES_SOURCE=assets`，让 `/api/bandori/master/songs` 从 HHWX music index 读取 note 数。`BANDORI_SONG_NOTES_BESTDORI_FALLBACK=1` 允许临时发布期间用 Bestdori 补齐缺失的 asset note count。关闭 fallback 后，assets 模式会在 music index 不可读或未覆盖全部歌曲时以 `503` fail closed。

启用 Bandori master artifact 模式时，HHWX 仍会从 Bestdori 读取 `events`。`songs.notes` 默认继续使用 Bestdori，但可以按上面的配置切换到 HHWX music asset chart counts。

自托管部署不要指向 `cdn.hhwx.org`，除非你明确希望依赖 HHWX 生产资源托管。该域名只是部署细节，不授予任何第三方游戏素材权利。

## 公开路径契约

公开 URL path 和 object key 应完全一致。正常运行不应依赖 CDN rewrite 规则。

活动 banner：

```text
{CDN_BASE}/bandori/assets/{region}/event/{assetBundleName}/images_rip/banner.png
bandori/assets/{region}/event/{assetBundleName}/images_rip/banner.png
```

如果采集服务能解析，也可能存在 legacy event banner alias：

```text
{CDN_BASE}/bandori/assets/{region}/event/banner_event13/images_rip/banner.png
bandori/assets/{region}/event/banner_event13/images_rip/banner.png
```

卡牌缩略图：

```text
{CDN_BASE}/bandori/assets/{region}/thumb/chara/card{floor(cardId / 50).padStart(5, "0")}_rip/{resourceSetName}_{normal|after_training}.png
bandori/assets/{region}/thumb/chara/card{floor(cardId / 50).padStart(5, "0")}_rip/{resourceSetName}_{normal|after_training}.png
```

完整卡面和透明卡面不是默认公开设置的必需项。只有产品界面需要时才添加：

```text
{CDN_BASE}/bandori/assets/{region}/characters/resourceset/{resourceSetName}_rip/card_{normal|after_training}.png
{CDN_BASE}/bandori/assets/{region}/characters/resourceset/{resourceSetName}_rip/trim_{normal|after_training}.png
```

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
https://your-bandori-asset-cdn.example.com/bandori/assets/cn/event/ranmoca_note/images_rip/banner.png
https://your-bandori-asset-cdn.example.com/bandori/assets/cn/event/banner_event13/images_rip/banner.png
https://your-bandori-asset-cdn.example.com/bandori/assets/cn/thumb/chara/card00000_rip/res001001_normal.png
https://your-bandori-asset-cdn.example.com/bandori/res/icon/chara_icon_1.png
https://your-bandori-asset-cdn.example.com/bandori/res/image/card-5.png
https://your-bandori-asset-cdn.example.com/bandori/music/1/charts/expert.json
```

然后打开相关 HHWX 页面，确认图片请求直接访问配置的 CDN base URL，而不是经过 Next.js image optimization route。
