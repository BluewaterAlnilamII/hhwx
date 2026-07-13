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
# BANDORI_STAMP_CATALOG_OBJECT_KEY=bandori/stamps/index.json
# BANDORI_STAMP_R2_ACCOUNT_ID=your_cloudflare_account_id
# BANDORI_STAMP_R2_BUCKET=your_r2_bucket
# BANDORI_STAMP_R2_ACCESS_KEY_ID=your_r2_access_key_id
# BANDORI_STAMP_R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
```

`NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL` is exposed to browsers. `BANDORI_ASSET_CDN_BASE_URL` is available to server-side code. In most deployments they should point to the same asset host. Stamp assets are served from the same Bandori asset CDN under `/bandori/stamps`; there is no separate stamp CDN setting. The web app reads the unified stamp catalog through `/api/bandori/stamps`, while stamp images, animation manifests, animation atlases, and voice audio are read directly from the CDN in browsers, so the CDN must allow browser CORS reads from the HHWX web origins. Stamp voices are played through Web Audio as short sound effects instead of media elements, avoiding iOS media-session behavior that can interrupt background music.

Server-side HHWX APIs that aggregate CDN-published Bandori assets must read the backing object storage directly through R2/S3 signed requests. They must not fetch HHWX-owned public CDN URLs such as `cdn.hhwx.org` from the server path because Cloudflare bot mitigation may challenge server-to-CDN traffic. `/api/bandori/stamps` reads `bandori/stamps/index.json` from object storage using `BANDORI_STAMP_R2_*`, `BANDORI_ASSET_R2_*`, or shared `BANDORI_R2_*` credentials. `BANDORI_MASTER_R2_*` is accepted only when it points at the same bucket that contains Bandori asset objects. Browsers still read stamp images, animation manifests, atlases, and voice audio directly from the public CDN.

For HHWX production, configure CORS for `https://hhwx.org` on `/bandori/stamps/*` objects. If multiple exact origins are allowed, include `Vary: Origin`. The web app does not send credentials for stamp CDN reads, so do not enable credentialed CORS unless the request model changes. A fully public, no-credentials asset bucket may use `Access-Control-Allow-Origin: *`; do not combine `*` with credentialed requests.

`BANDORI_CHART_SOURCE=bestdori` keeps the default web-only behavior. Set `BANDORI_CHART_SOURCE=assets` only after a private asset builder has populated the music chart objects documented below. `BANDORI_MUSIC_CDN_BASE_URL` can point charts at a separate host; when omitted, chart reads use `BANDORI_ASSET_CDN_BASE_URL`. `BANDORI_CHART_BESTDORI_FALLBACK=1` permits a temporary Bestdori fallback when a self-hosted chart object is missing.

`BANDORI_SONG_NOTES_SOURCE=bestdori` keeps `songs.notes` aligned with Bestdori while the music asset pipeline is incomplete. After `bandori/music/index.json` contains chart-derived `notes` for every published song, set `BANDORI_SONG_NOTES_SOURCE=assets` to source `/api/bandori/master/songs` note counts from the HHWX music index. `BANDORI_SONG_NOTES_BESTDORI_FALLBACK=1` fills missing asset note counts from Bestdori during a temporary rollout. With fallback disabled, assets mode fails closed with `503` when the music index is unreadable or does not cover every song record.

The Events list and detail APIs read `bandori/event-history-v3/api/active.json` and its grouped packs directly from the private bucket configured by `BANDORI_PRIVATE_R2_BUCKET`. The server accepts v3 only and fails closed when the pointer or pack is missing, unauthorized, malformed, corrupt, or oversized. `BANDORI_EVENT_API_LOCAL_STORE_ROOT` can point to a tracker-generated content store during local development, but production rejects it. This Events-only source does not change the cards, songs, music, profile, comments, or general master artifact readers. `songs.notes` continues to default to Bestdori and can switch to HHWX music asset chart counts as described above.

## Tracker History API

`GET /api/bandori/tracker/data` can read CN cutoff history directly from the object-storage keys under `bandori/trackerdata`. The server uses signed R2/S3 requests and never routes these aggregate reads through the public CDN. Configure the source and the explicit public-artifact bucket as follows; endpoint and credentials continue to come from the server-only `BANDORI_R2_*` variables:

```dotenv
BANDORI_TRACKER_HISTORY_SOURCE=supabase
BANDORI_TRACKER_HISTORY_R2_BUCKET=your_public_artifact_bucket
```

The accepted source values are:

- `supabase`: retain the legacy database-only behavior.
- `r2-with-supabase-fallback`: use R2 first and repeat the complete query against Supabase only when R2 is unavailable, corrupt, oversized, or fails validation.
- `r2`: use R2 and a verified in-memory stale snapshot when available; otherwise return `503 TRACKER_HISTORY_UNAVAILABLE` without a request-time database fallback.

A missing manifest, a missing requested pack kind, or a missing tier in a valid pack is a normal empty dataset and returns the existing `200 + { result: true, cutoffs: [] }` response. A manifest that references a missing or invalid pack is an operational failure, not an empty dataset. The public request parameters, 5,000-row cap, result shape, `no-store` API policy, and Supabase Realtime subscriptions remain unchanged.

The object root is the fixed data contract `bandori/trackerdata`; it is intentionally not an environment variable. The reader's limits are corruption and resource-exhaustion guards, not reserved memory or expected object sizes:

| Guard | Limit | Rationale |
| --- | ---: | --- |
| Shared manifest-plus-pack object-read budget | 3 seconds | Bounds the two signed S3 reads before fallback or a stable `503`; hash, gunzip, JSON parsing, and contract validation are separately bounded by the byte and record ceilings below. |
| Manifest | 64 KiB | Allows the current descriptors and up to eight retained pack keys per kind with substantial headroom. |
| Compressed pack | 2 MiB | About 33 times the measured 61.7 KiB event-315 pack. |
| Decompressed JSON | 16 MiB | About 64 times the measured 255 KiB event-315 payload and limits malformed gzip expansion. |
| Records in one pack | 200,000 | About 19 times the measured 10,723 event-315 records; one-minute live delivery is not persisted into these history packs. |
| Parsed cache | 16 entries / estimated 32 MiB | Covers the main chart plus comparison targets while preventing unbounded history browsing from retaining every pack. |
| Failure cooldown | 15 seconds per target | Prevents an R2 fault from producing one failed object read per incoming API request. |

The parsed-cache weight is conservatively estimated as decompressed bytes plus 64 bytes per point and small Map/group overhead. Compressed bytes, decompressed buffers, and JSON text are not retained after parsing. If an object exceeds a guard, the API does not truncate it: fallback mode runs the full Supabase query, while pure R2 mode returns `503`. Raising a guard should follow a new production inventory rather than happen automatically.

For rollout evidence, a Web process logs at most one structured `Bandori tracker history R2 read succeeded` event per target kind and manifest generation. It includes the generation, elapsed read time, and returned record count without logging credentials or object bodies. Degraded reads remain rate-limited separately.

Before switching production to R2-first mode, compare representative targets without writing either source:

```bash
npm run compare:bandori-tracker-history -- --event 315 --type event --tier 1000
npm run compare:bandori-tracker-history -- --event 316 --type event --tier 1000
npm run compare:bandori-tracker-history -- --event 316 --type song --tier 1000
npm run compare:bandori-tracker-history -- --event 18 --type monthly --tier 1000
```

The comparison fixes one manifest generation, validates the gzip/hash/pack contract, applies the existing response limit and grouping semantics, then compares every returned point with Supabase. Also compare at least one supported tier known to be empty in both sources. An empty R2 result is checked against Supabase during this validation command; Supabase is not queried for a normal empty R2 result in the production request path. Roll back by restoring `BANDORI_TRACKER_HISTORY_SOURCE=supabase`; do not delete tracker artifacts or database rows.

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

Stamp catalog, static images, voice audio, and animation assets:

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

`bandori/stamps/index.json` is the public compact stamp catalog. Its `payload` is keyed by stamp ID and uses four fixed slots in `[jp, en, tw, cn]` order for `imageName`, `imageUrl`, and optional `voiceUrl`; missing slots are empty strings, not `null`. Optional animation summaries are keyed by server and point at the animation manifest and atlas. Standard per-stamp manifests are not part of the public contract. Animation manifests should use `hhwx-bandori-stamp-animation-v1` and include `atlasDimensions`, `frameRate`, and frame rectangles so the web app can render atlas-based animated stamps without Unity runtime logic. Current HHWX atlas PNGs use `frames[].unityRect` as the physical PNG crop rectangle; the web app normalizes that into its in-memory `frames[].cssRect`, with source `frames[].cssRect` used only as a fallback when `unityRect` is absent.

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
https://your-bandori-asset-cdn.example.com/bandori/stamps/index.json
https://your-bandori-asset-cdn.example.com/bandori/stamps/cn/10131/image.png
https://your-bandori-asset-cdn.example.com/bandori/stamps/cn/10131/animation/manifest.json
https://your-bandori-asset-cdn.example.com/bandori/stamps/cn/10131/animation/atlas.png
```

For stamp CORS, verify at least one JSON object and one voice object with an `Origin` header:

```bash
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/stamps/index.json
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/stamps/cn/10131/voice/<voiceName>.mp3
```

Both responses should include `Access-Control-Allow-Origin: https://hhwx.org` or `Access-Control-Allow-Origin: *` for a public no-credentials bucket. Then open the relevant HHWX pages and confirm the stamp catalog is read through `/api/bandori/stamps`, while animation manifests, atlas images, and voice audio requests go directly to the configured CDN base URL.
