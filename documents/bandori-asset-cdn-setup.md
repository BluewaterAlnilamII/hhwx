# Bandori Asset CDN Contract

中文说明见 [bandori-asset-cdn-setup.zh-CN.md](bandori-asset-cdn-setup.zh-CN.md).

This document describes the public URL contract that the HHWX web application expects for Bandori static assets. It is intentionally not a tracker setup guide.

HHWX production uses private ingestion and mirroring services to populate its CDN. Those services are not included in this repository. Self-hosted operators must provide their own asset host or compatible private ingestion pipeline if they want the same asset-heavy workflows to work.

This document is not an asset license, a public redistribution grant, or permission to reuse HHWX production infrastructure. See [../NOTICE.md](../NOTICE.md) before caching, mirroring, or displaying third-party game data and media.

## Web Configuration

The web app reads Bandori asset URLs from these environment variables:

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

`NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL` is exposed to browsers. `BANDORI_ASSET_CDN_BASE_URL` is available to server-side code. In most deployments they should point to the same asset host.

`BANDORI_CHART_SOURCE=bestdori` keeps the default web-only behavior. Set `BANDORI_CHART_SOURCE=assets` only after a private asset builder has populated the music chart objects documented below. `BANDORI_MUSIC_CDN_BASE_URL` can point charts at a separate host; when omitted, chart reads use `BANDORI_ASSET_CDN_BASE_URL`. `BANDORI_CHART_BESTDORI_FALLBACK=1` permits a temporary Bestdori fallback when a self-hosted chart object is missing.

`BANDORI_SONG_NOTES_SOURCE=bestdori` keeps `songs.notes` aligned with Bestdori while the music asset pipeline is incomplete. After `bandori/music/index.json` contains chart-derived `notes` for every published song, set `BANDORI_SONG_NOTES_SOURCE=assets` to source `/api/bandori/master/songs` note counts from the HHWX music index. `BANDORI_SONG_NOTES_BESTDORI_FALLBACK=1` fills missing asset note counts from Bestdori during a temporary rollout. With fallback disabled, assets mode fails closed with `503` when the music index is unreadable or does not cover every song record.

When Bandori master artifact mode is enabled, HHWX still reads Bestdori for `events`. `songs.notes` defaults to Bestdori but can switch to HHWX music asset chart counts as described above.

Do not point self-hosted deployments at `cdn.hhwx.org` unless you intentionally depend on HHWX production asset hosting. That domain is a deployment detail and does not grant rights to third-party game assets.

## Public Path Contract

Public URL paths and object keys should match exactly. Do not rely on CDN rewrite rules for normal operation.

Event banners:

```text
{CDN_BASE}/bandori/assets/{region}/event/{assetBundleName}/images_rip/banner.png
bandori/assets/{region}/event/{assetBundleName}/images_rip/banner.png
```

Legacy event banner aliases may also exist when an ingestion service can resolve them:

```text
{CDN_BASE}/bandori/assets/{region}/event/banner_event13/images_rip/banner.png
bandori/assets/{region}/event/banner_event13/images_rip/banner.png
```

Card thumbnails:

```text
{CDN_BASE}/bandori/assets/{region}/thumb/chara/card{floor(cardId / 50).padStart(5, "0")}_rip/{resourceSetName}_{normal|after_training}.png
bandori/assets/{region}/thumb/chara/card{floor(cardId / 50).padStart(5, "0")}_rip/{resourceSetName}_{normal|after_training}.png
```

Full card art and transparent card art are not required by the default public setup. Add them only if the product surface requires them:

```text
{CDN_BASE}/bandori/assets/{region}/characters/resourceset/{resourceSetName}_rip/card_{normal|after_training}.png
{CDN_BASE}/bandori/assets/{region}/characters/resourceset/{resourceSetName}_rip/trim_{normal|after_training}.png
```

Shared Bestdori resource icons and card frame images:

```text
{CDN_BASE}/bandori/res/icon/{iconName}
bandori/res/icon/{iconName}

{CDN_BASE}/bandori/res/image/card-{rarity}.png
bandori/res/image/card-{rarity}.png
```

Music assets and chart JSON:

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

`bandori/music/index.json` should include `songs[].notes` in the Bestdori-compatible shape, with difficulty indexes `"0"` through `"4"` mapping to chart-derived note counts.

## Self-Hosted Expectations

The open-source web repository can render pages that use public metadata and configured asset URLs. It does not ship:

- the HHWX production tracker;
- asset prefetch or mirroring jobs;
- Cloudflare R2 credentials or bucket configuration;
- Bilibili session credentials;
- the HHWX user-fetcher service used for game-account binding and manual game data sync.

If a deployment does not provide compatible private services or a populated asset host, asset-dependent pages may show missing images or unavailable sync workflows. That is expected for a web-only self-hosted deployment.

## Verification

After configuring an asset host, verify representative URLs with a browser or HTTP client:

```text
https://your-bandori-asset-cdn.example.com/bandori/assets/cn/event/ranmoca_note/images_rip/banner.png
https://your-bandori-asset-cdn.example.com/bandori/assets/cn/event/banner_event13/images_rip/banner.png
https://your-bandori-asset-cdn.example.com/bandori/assets/cn/thumb/chara/card00000_rip/res001001_normal.png
https://your-bandori-asset-cdn.example.com/bandori/res/icon/chara_icon_1.png
https://your-bandori-asset-cdn.example.com/bandori/res/image/card-5.png
https://your-bandori-asset-cdn.example.com/bandori/music/1/charts/expert.json
```

Then open the relevant HHWX pages and confirm image requests go directly to the configured CDN base URL instead of through Next.js image optimization routes.
