# Bandori Asset CDN Contract

The shared Events/Cards/Degrees/Music/Stamps API and index conventions are documented in [bandori-master-asset-contract.md](bandori-master-asset-contract.md).

中文说明见 [bandori-asset-cdn-setup.zh-CN.md](bandori-asset-cdn-setup.zh-CN.md).

This document describes the public URL contract that the HHWX web application expects for Bandori static assets. It is intentionally not a tracker setup guide.

HHWX production uses private ingestion and mirroring services to populate its CDN and R2 buckets. Those services are not included in this repository. Self-hosted operators must provide their own asset host, compatible private ingestion pipeline, and populated R2 buckets if they want the same asset-heavy workflows to work.

This document is not an asset license, a public redistribution grant, or permission to reuse HHWX production infrastructure. See [../NOTICE.md](../NOTICE.md) before caching, mirroring, or displaying third-party game data and media.

## Web Configuration

Built-in card UI resources use stable, non-content-addressed paths that preserve the official game resource names. Full card frames are under `bandori/resources/images/card-frame/{resourceName}.png`; individual MenuAtlas sprites are under `bandori/resources/atlases/menu-atlas/{spriteName}.png`. These objects are extracted once from a JP base APK, published with a one-year immutable cache policy, and never discovered through a public index. The web app builds their URLs from a fixed allowlist and fails closed when the asset CDN is not configured; it does not fall back to Bestdori. Card renderers use the pre-existing vector overlays at `bandori/res/icon/band_{bandId}.svg`, `bandori/res/icon/{attribute}.svg`, and `bandori/res/icon/master.svg`; both thumbnails and full-card surfaces use SVG for the applicable band and attribute marks, while the master-rank badge is used where that overlay is rendered. The five composite rarity previews also remain unchanged at `bandori/res/icon/star_1.png` through `star_5.png`. These fixed legacy objects are served from owned R2 and never fetched from Bestdori at runtime.

The web app reads Bandori asset URLs from these environment variables:

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

`NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL` is the shared public asset host used by browser and server-rendered public URLs. Card, Event, Degree, and Stamp assets are discovered from their public indexes described below; browsers read those indexes with the normal HTTP cache and without credentials. Degree and Stamp assets use the same Bandori asset CDN under `/bandori/degrees` and `/bandori/stamps`; there are no dataset-specific CDN settings. The web app reads private master metadata through `/api/bandori/master/degrees` or `/api/bandori/master/stamps`, reads the matching public index from the CDN, and joins both maps in browser memory. Images, animation manifests, animation atlases, voice audio, and Card recruitment voices are then read directly from the CDN, so the CDN must allow browser CORS reads from the HHWX web origins. Stamp voices and Card recruitment voices share the Web Audio one-shot sound-effect channel instead of using media elements, so they follow the same browser audio-session policy intended to keep iOS from treating them as music and interrupting background playback.

Server-side HHWX APIs that consume CDN-published Bandori assets must read the backing object storage directly through R2/S3 signed requests. They must not fetch HHWX-owned public CDN URLs such as `cdn.hhwx.org` from the server path because Cloudflare bot mitigation may challenge server-to-CDN traffic. Configure the complete shared endpoint as `BANDORI_R2_ENDPOINT`, credentials with the remaining `BANDORI_R2_*` variables, the public bucket with `BANDORI_PUBLIC_R2_BUCKET`, and the private snapshot bucket with `BANDORI_PRIVATE_R2_BUCKET`. The application does not derive an endpoint from a separate account-ID variable, and dataset-specific legacy R2 names are not accepted. R2 request signing always uses Cloudflare's `auto` region. The Music metadata and chart readers use this path for `bandori/music/index.json` and content-addressed chart JSON; the chart reader verifies the object SHA-256 before parsing. The Degrees and Stamps master APIs read independent content-addressed snapshots from `BANDORI_PRIVATE_R2_BUCKET`; they do not read public asset indexes. Browsers read public indexes and assets directly from the CDN.

For HHWX production, configure CORS for `https://hhwx.org` on `/bandori/degrees/*`, `/bandori/stamps/*`, and `/bandori/cards/*/voice/*` objects. If multiple exact origins are allowed, include `Vary: Origin`. The web app does not send credentials for these CDN reads, so do not enable credentialed CORS unless the request model changes. A fully public, no-credentials asset bucket may use `Access-Control-Allow-Origin: *`; do not combine `*` with credentialed requests. Local browser validation should use `http://localhost:3000` when that exact origin is allowlisted; `http://127.0.0.1:3000` is a different origin and requires its own explicit CORS entry.

HHWX application responses use `Cache-Control` for browser and downstream-cache TTLs and `Cloudflare-CDN-Cache-Control` for Cloudflare edge TTLs and stale behavior. Public API responses use four mutable tiers: fast mutable (`1m + 5m` browser SWR, `5m + 15m` edge SWR), snapshot (`5m + 30m` browser SWR, `30m + 1d` edge SWR), reference (`1h + 12h` browser SWR, `12h + 1d` edge SWR), and long asset (`1d + 7d` browser SWR, `30d + 90d` edge SWR). Private, real-time, and error responses use `no-store`; content-addressed objects use a one-year immutable policy. Do not add `s-maxage` to these response headers because it conflicts with stale-while-revalidate semantics.

A Cloudflare Cache Rule may mark the intended public `GET`/`HEAD` paths as eligible while continuing to honor origin headers. Objects served directly by R2 or the asset CDN, including the Cards, Degrees, Events, Music, and Stamps `index.json` files, do not pass through the Next.js policies. Their object metadata uses the snapshot browser policy. To extend only Cloudflare's copy to the snapshot edge policy, use a Cache Response Rule with `cloudflare_only` `max-age=1800` and `stale-while-revalidate=86400`; a Cache Response Rule takes precedence over origin `Cloudflare-CDN-Cache-Control`.

The chart API always reads `bandori/music/index.json` and its content-addressed chart objects from `BANDORI_PUBLIC_R2_BUCKET` through signed R2 requests. The Music score-meta API uses the same signed reader for `bandori/music/meta.json`, then verifies the exact `bandori/music/index.json` bytes named by `musicIndexSha256`. These source and object roots are fixed application contracts: missing, unreadable, or mismatched data fails closed and never falls back to Bestdori. Browser-facing Music assets use `NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL`; there is no separate Music CDN setting.

The Events, Cards, Degrees, Music, and Stamps master APIs read their content-addressed snapshots directly from the private bucket configured by `BANDORI_PRIVATE_R2_BUCKET`. The remaining master datasets always merge the fixed JP, EN, TW, and CN artifacts under `bandori/master` from `BANDORI_PUBLIC_R2_BUCKET`. All readers fail closed when a pointer, manifest, dataset, or pack is missing, unauthorized, malformed, corrupt, or oversized; none falls back to Bestdori, public asset indexes, public CDN reads, or Supabase pointers. `BANDORI_EVENT_API_LOCAL_STORE_ROOT`, `BANDORI_CARDS_API_LOCAL_STORE_ROOT`, `BANDORI_DEGREES_API_LOCAL_STORE_ROOT`, `BANDORI_MUSIC_API_LOCAL_STORE_ROOT`, and `BANDORI_STAMPS_API_LOCAL_STORE_ROOT` can point to tracker-generated content stores during local development, but production rejects them.

The browser reads the complete canonical Cards map once from `GET /api/bandori/master/cards` and reuses the parsed map for the lifetime of the SPA. It materializes server-specific scalar extensions locally for the profile's numeric gameplay server. Public Cards list/detail requests accept an optional exact `server=0|1|2|3` query in fixed JP/EN/TW/CN order; string server codes are rejected. The former sparse `GET /api/bandori/cards?ids=...` endpoint has been removed. Serverless display surfaces resolve four-slot text as preferred server, then JP, EN, TW, CN, with duplicate slots removed. Card-profile and team-builder profile surfaces put the profile's gameplay server before that order, so the profile identity controls names and skill descriptions without changing the user's global preference. Team Builder additionally admits a JP card when that card is absent from the profile server: this fallback is based only on snapshot slot presence, never on `releasedAt`, and does not borrow an EN, TW, or CN-only card for another server. Public server-filtered API responses and other profile surfaces remain strict. Same-ID Cards `10001`–`10010` remain numeric for calculation and persistence; serverless avatar selection expands their EN and CN entities with UI-only scoped references and stores the chosen entity in the nullable `profiles.avatar_card_server` field.

The browser likewise reads the complete Events map once from `GET /api/bandori/master/events` and reuses it across Event Tracker, Calendar, and Team Builder during the SPA session. Event records contain the original four-region master fields plus `band`, four-slot server-local `stampRewardId`, scalar `stampCharacterId`, and an optional top-level `cnSchedule` only when the official CN time range is incomplete. Team Builder consumes bonus fields directly from these records. The former Events list and bonus endpoints have been removed; event comment routes under `/api/bandori/events/{eventId}/comments` remain independent.

The browser reads the complete Music map once from `GET /api/bandori/master/music` and reuses it for the SPA session. `GET /api/bandori/master/music/{musicId}` exposes the corresponding detail record. Numeric keys `0` through `4` under `difficulty`, `notes`, and `bpm` identify chart difficulties, not servers; server-local publication timestamps remain fixed four-slot arrays. Team Builder reads `difficulty.playLevel` from this map and reads score-note timing from the owned chart API. `GET /api/bandori/master/music/meta` separately returns only `{durations,songs}` for client-side score/rank calculation. Each difficulty is `{total,covered}`: `total` is `[normal,fever]` for the whole chart and every `covered[duration]` is `[normal,fever]` inside the six skill windows. It does not expose song display fields, stored scores, ranks, or Bestdori fallback data. The former `/api/bandori/master/songs`, `/api/bandori/master/songs/{songId}`, and `/api/bandori/songs?ids=...` routes have been removed.

## Tracker History API

`GET /api/bandori/tracker/data` reads JP, EN, TW, and CN cutoff history directly from the object-storage keys under `bandori/trackerdata`. The public numeric `server=0|1|2|3` parameter maps to the `jp|en|tw|cn` object path segment. The server uses signed R2/S3 requests and never routes these aggregate reads through the public CDN. Configure the shared public-artifact bucket as follows; endpoint and credentials continue to come from the server-only `BANDORI_R2_*` variables:

```dotenv
BANDORI_PUBLIC_R2_BUCKET=cdn
```

The production API is R2-only. It may use a previously validated in-memory stale snapshot within the documented bounds; otherwise an operational R2 failure returns `503 TRACKER_HISTORY_UNAVAILABLE`. The production route does not import or query the frozen Supabase history table, and there is no runtime source switch or database fallback.

A missing manifest, a missing requested pack kind, or a missing tier in a valid pack is a normal empty dataset and returns the existing `200 + { result: true, cutoffs: [] }` response. A manifest that references a missing or invalid pack is an operational failure, not an empty dataset. The public request parameters, 5,000-row cap, result shape, and `no-store` API policy remain unchanged. CN active-event live delivery remains a separate latest-snapshot and Private Broadcast capability; JP, EN, and TW never create tracker latest queries or tracker Broadcast subscriptions.

Monthly ranking IDs are server-local continuous month numbers and must never be copied between servers. The shared Web/R2 calendar uses JP `2024-10/id=1` at UTC+9 15:00, EN `2025-10/id=1` at fixed UTC-8 00:00, TW `2025-06/id=1` at UTC+8 15:00, and CN `2025-02/id=1` at UTC+8 13:00. Monthly object paths use the resulting natural `YYYY-MM`; switching the selected server remaps the current period to that server's ID.

The object root is the fixed data contract `bandori/trackerdata`; it is intentionally not an environment variable. The reader's limits are corruption and resource-exhaustion guards, not reserved memory or expected object sizes:

| Guard | Limit | Rationale |
| --- | ---: | --- |
| Shared manifest-plus-pack object-read budget | 3 seconds | Bounds the two signed S3 reads before a stable `503`; hash, gunzip, JSON parsing, and contract validation are separately bounded by the byte and record ceilings below. |
| Manifest | 64 KiB | Allows the current descriptors and up to eight retained pack keys per kind with substantial headroom. |
| Compressed pack | 2 MiB | About 33 times the measured 61.7 KiB event-315 pack. |
| Decompressed JSON | 16 MiB | About 64 times the measured 255 KiB event-315 payload and limits malformed gzip expansion. |
| Records in one pack | 200,000 | About 19 times the measured 10,723 event-315 records; one-minute live delivery is not persisted into these history packs. |
| Parsed cache | 16 entries / estimated 32 MiB | Covers the main chart plus comparison targets while preventing unbounded history browsing from retaining every pack. |
| Failure cooldown | 15 seconds per target | Prevents an R2 fault from producing one failed object read per incoming API request. |

The parsed-cache weight is conservatively estimated as decompressed bytes plus 64 bytes per point and small Map/group overhead. Compressed bytes, decompressed buffers, and JSON text are not retained after parsing. If an object exceeds a guard, the API does not truncate it and returns `503`. Raising a guard should follow a new production inventory rather than happen automatically.

For rollout evidence, a Web process logs at most one structured `Bandori tracker history R2 read succeeded` event per server, target kind, and manifest generation. It includes the server, generation, elapsed read time, and returned record count without logging credentials or object bodies. Degraded reads are also rate-limited per server and target.

Before switching production to R2-first mode, compare representative targets without writing either source:

```bash
npm run compare:bandori-tracker-history -- --event 315 --type event --tier 1000
npm run compare:bandori-tracker-history -- --event 316 --type event --tier 1000
npm run compare:bandori-tracker-history -- --event 316 --type song --tier 1000
npm run compare:bandori-tracker-history -- --event 18 --type monthly --tier 1000
```

The explicit offline comparison fixes one manifest generation, validates the gzip/hash/pack contract, applies the existing response limit and grouping semantics, then compares every returned point with Supabase. Also compare at least one supported tier known to be empty in both sources. Supabase is never queried by the production request path, including normal empty results and R2 failures. The old rows remain frozen audit evidence, not a rollback source; repair R2 or roll back the coordinated writer/application cutover without deleting artifacts or database rows.

Do not point self-hosted deployments at `cdn.hhwx.org` unless you intentionally depend on HHWX production asset hosting. That domain is a deployment detail and does not grant rights to third-party game assets.

## Public Path Contract

Public URL paths and object keys should match exactly. Do not rely on CDN rewrite rules for normal operation.

Cards use one public discovery document:

```http
GET {CDN_BASE}/bandori/cards/index.json
```

The browser request semantics are `fetch(indexUrl, { cache: "default", credentials: "omit" })`.

The response is JSON with this shape:

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

`resources` is keyed by `resourceSetName`. Public resource references are complete lowercase SHA-256 strings; clients derive image keys as `bandori/cards/{resourceSetName}/{variant}/{role}/{sha256}.png` and the optional acquisition-voice key as `bandori/cards/{resourceSetName}/voice/gacha/{sha256}.mp3`. Each declared image variant must contain all three roles: `thumb`, `full`, and `trim`. A resource may declare only `normal`, only `after_training`, or both. When exactly one complete variant exists, both UI art states use it; when both exist, clients use the requested variant exactly. This preserves the game's `after_training` naming for trainingless Birthday and KiraFes art without duplicating objects. Builder-only extraction provenance, byte sizes, media types, image dimensions, and audio duration are not part of the public index.

Events use a separate public discovery document:

```http
GET {CDN_BASE}/bandori/events/index.json
```

The response root is `{ "schemaVersion": 2, "updatedAt": "...", "events": { ... } }`. Regional arrays always use the implicit fixed order `[jp, en, tw, cn]`. Each `events[eventId]` value contains:

- `banners`: exactly four SHA-256-or-`null` slots.
- `teamIcons`: entries shaped as `{ "teamId": 1, "iconFileName": "...", "images": [sha256-or-null, sha256-or-null, sha256-or-null, sha256-or-null] }`.

Event image keys are derived as `bandori/events/images/{sha256}.png`. Missing regional assets are represented only by `null` in their own slot; clients do not borrow another server's asset.

All derived object keys are relative to `{CDN_BASE}`. The filename stem equals the index's complete lowercase SHA-256. The web app validates the index before using it and never reconstructs Cards or Events paths from master-data bundle names. If an index or referenced object is unavailable, the affected image remains a placeholder; master data and team calculations continue without an external fallback. Card thumbnails never fall back to full-size art, and Cards/Events do not fall back to Bestdori or the legacy `/api/bandori/assets` proxy.

Fixed official card UI resources:

```text
{CDN_BASE}/bandori/resources/images/card-frame/{resourceName}.png
bandori/resources/images/card-frame/{resourceName}.png

{CDN_BASE}/bandori/resources/atlases/menu-atlas/{spriteName}.png
bandori/resources/atlases/menu-atlas/{spriteName}.png
```

Fixed legacy thumbnail vector overlays:

```text
{CDN_BASE}/bandori/res/icon/band_{bandId}.svg
{CDN_BASE}/bandori/res/icon/{attribute}.svg
{CDN_BASE}/bandori/res/icon/master.svg

bandori/res/icon/band_{bandId}.svg
bandori/res/icon/{attribute}.svg
bandori/res/icon/master.svg
```

The fixed band allowlist is `1`, `2`, `3`, `4`, `5`, `18`, `21`, and `45`; attributes are `powerful`, `cool`, `happy`, and `pure`. These owned R2 objects are not periodically synchronized and have no Bestdori runtime fallback.

Music assets and chart JSON:

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

`bandori/music/index.json` uses the same compact mutable-index root as Cards, Events, and Stamps:

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

Song IDs and difficulty indexes are numeric-string keys in ascending numeric order. Difficulty indexes `"0"` through `"4"` mean `easy`, `normal`, `hard`, `expert`, and `special`. Each file value is its complete lowercase SHA-256; clients derive the content-addressed paths listed above and may verify the received content. No query-string version token is needed. `notes`, `bpm`, and `files.charts` must have identical difficulty coverage. `audio` is optional for an intentionally audio-free local build, but production readiness verification requires it. Per-song extraction manifests under `bandori/music/manifests` retain source servers and bundle provenance for the builder, but are not part of the public index contract.

`bandori/music/meta.json` is a separate schema-2 mutable root with `schemaVersion`, `updatedAt`, `musicIndexSha256`, sorted `durations`, and `songs`. Its song/difficulty coverage matches `music/index.json`; every difficulty contains one whole-chart `[normal,fever]` total and complete `[normal,fever]` covered coefficients for every published duration. Each published value is independently accumulated in chart order using binary64 unrounded note weights, then rounded with `floor(value * 10000 + 0.5) / 10000`.

Skill coverage requires `noteIndex > triggerIndex` and `noteTime <= triggerTime + duration`, with no time epsilon. The trigger note is excluded from its own new skill; other notes at the same time follow the trigger in normalized order and are covered. Chart timing, note order, and these window boundaries follow the current medley calculator. The coefficients still use ordinary single-song combo and optional FEVER weights, counting overlapping windows once; they are ranking inputs, not the complete medley score calculation.

Music publication commits `index.json` first, then writes and verifies a `meta.json` that names the exact index bytes. Signed R2 reads allow **8 MiB for Meta** and the shared default **4 MiB for the paired Music index**. The API rejects a hash mismatch and projects only `{durations,songs}`. A full Music sync performs the schema-1 to schema-2 migration; partial root updates cannot perform it. A fresh read between the two root writes fails closed until the publisher retry repairs `meta.json`; an already cached successful response may remain available under the snapshot policy.

### Music Meta schema cutover

The old reader accepts only schema 1 and this reader accepts only schema 2. Neither deployment order alone provides continuous availability. There is no legacy conversion or Bestdori fallback. A cutover without a compatibility reader requires an explicitly approved maintenance window; do not publish until that window, the writer controls, and paired rollback are ready.

1. Pause automated Music writers and drain in-flight work before changing builder code or roots. Retain the exact old `index.json` and `meta.json` bytes, their hashes, and the compatible Web/builder revisions. Preserve runtime checkpoints and recovery state.
2. Within the approved window, prevent traffic from reaching a mismatched reader/root pair. Deploy the builder and perform one controlled full Music rebuild from frozen inputs, then verify schema 2, the paired-index hash, and complete song/difficulty coverage. Reposting an already successful frozen job is not a rebuild.
3. Deploy the schema-2 Web reader before restoring traffic. Verify its signed-storage read from every application instance, clear affected edge caches, and check the public API against the verified artifact. The new server cache key isolates schema 2; it does not invalidate old edge or browser responses. Clients holding the old response must refresh, and any browser-cache expiry requirement must be included in the window.
4. Re-enable writers only after acceptance. If cutover fails, keep traffic gated and writers paused while restoring the compatible code revisions and **both exact old roots**; verify their hash pairing and refresh affected caches before reopening. Do not roll back only Web or only Meta, overwrite immutable assets, or reset job ledgers to force a retry.

Private operator commands and the window duration belong in the deployment-specific runbook. These steps describe a coordinated maintenance cutover, not a zero-downtime guarantee.

Chart-simulator presentation resources:

```text
{CDN_BASE}/bandori/chart-simulator/index.json
{CDN_BASE}/bandori/chart-simulator/manifests/{manifestSha256}.json
{CDN_BASE}/bandori/chart-simulator/packs/{packTreeHash}/{projectionRelativePath}
```

The mutable index is exactly `{schemaVersion, updatedAt, manifest}` with schema version `1`; `manifest` is the complete lowercase SHA-256 of the immutable manifest bytes. The manifest is exactly `{schemaVersion, packs}` with schema `hhwx-bandori-chart-simulator-assets-v1`; `packs` maps each original game bundle name, such as `ingameskin/noteskin/skin00` or `sound/tapseskin/skin00`, to one deterministic tree hash. It contains no kind, ordinary/limited classification, URL, size, per-file hash, or audit metadata. `apk` is the only synthetic pack key for fixed APK-derived HUD resources.

Pack members retain their exact existing path below `/local/chart-simulator/` and their exact final PNG, WAV, or JSON bytes. They are not re-encoded, merged, or wrapped in ZIP files. The tree hash covers the sorted normalized member paths and bytes for the complete source bundle projection, so the member directory is immutable even though individual public member descriptors are unnecessary. The browser validates and pins the total manifest, then derives a member URL from the logical path and its original game bundle. It fetches only resources required by the selected ordinary or limited background, field/judgment line, note, Directional, tap-effect, and TapSE settings. Missing entries fail closed without a local-file, Bestdori, or cross-pack fallback. `skin_teamlivefestival` is the canonical bundle and logical directory name.

Stamp catalog, static images, voice audio, and animation assets:

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

`GET /api/bandori/master/stamps` returns `{ success: true, data }`, where `data` is keyed by stamp ID. Each record contains fixed `[jp, en, tw, cn]` `imageName` and nullable `characterId` arrays. Missing names use `""`; missing or unresolved character IDs use `null`. Records with Changed Stamp variants also contain an optional four-slot `changedStamps` array. Each regional variant list is sorted and deduplicated by `(imageName, soundName)`; raw Changed rule IDs, schedules, and probabilities are omitted. Storage pointers, source metadata, asset URLs, and asset hashes are not exposed by this API.

`bandori/stamps/index.json` is the public asset index with the same root convention as Cards and Events: `schemaVersion`, `updatedAt`, the `stamps` domain map, and `changedStampGroups`. Each Stamp entry contains four-slot `images` SHA-256 values, optional four-slot `voices` SHA-256 values, optional four-slot Changed variant image/audio hashes, and optional `animations` entries containing only `manifest` and `atlas` SHA-256 values. `changedStampGroups` lists every published Changed rule manifest by server and rule ID, including resources that the current UI does not display. Missing standard slots use `""`, while missing Changed slots use empty arrays. A Changed variant may omit `image` when it reuses the ordinary image and may omit `audio` when no converted cue is available. Clients derive immutable paths as `bandori/stamps/images/{sha256}.png`, `bandori/stamps/voices/{sha256}.mp3`, `bandori/stamps/changed/manifests/{sha256}.json`, `bandori/stamps/animation/manifests/{sha256}.json`, and `bandori/stamps/animation/atlases/{sha256}.png`; no query-string version token is needed. Source voice names and raw Changed rule metadata remain in internal extraction metadata rather than the compact root index. Standard per-stamp manifests are not part of the public index contract. Animation manifests use the exact minimal `hhwx-bandori-stamp-animation-v1` shape: `schemaVersion`, explicit positive `frameRate`, `atlasDimensions`, and ordered `frames: [{ name, cssRect }]`. `cssRect` uses the atlas PNG's top-left coordinates and must stay in bounds. There is no 12 FPS or `unityRect` fallback, and bundle audit fields are kept only in per-server diagnostic indexes. Web readers still validate and discard legacy root-descriptor `frameRate` and `frameCount` fields. Re-publication writes and verifies new immutable objects first, then server diagnostic indexes and the root; deploy the css-only Web reader after that root switch, so no rollback or in-place immutable-object replacement is required.

Degree metadata, static images, and animations:

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

The first two object-store paths are private; the remaining Degree index and content-addressed media paths are public. The master response is keyed by a positive JavaScript-safe degree ID and has eight canonical `[jp, en, tw, cn]` fields: `degreeType`, `iconImageName`, `baseImageName`, `rank`, `degreeName`, `description`, `seq`, and `characterId`. An optional four-slot `serverExtensions` is emitted only for actual CN effects. It follows the shared Cards/Music slot semantics: `null` means the Degree is absent on that server, `{}` means it is present without an extension, and only the CN slot may contain `degreeEffect`. A non-empty `baseImageName` marks a populated server slot: all six strings must then be non-empty and `seq` positive. A missing slot uses `""` for every string and `0` for both numbers. The public schema-2 index is keyed by resource name; readers accept schema 1 during rollout. Base uses `baseImageName`; rank uses `rank_none` or `{degreeType}_{rank}`; icon uses `icon_none` or `{iconImageName}_{rank}`; CN effects use their master `assetBundleName` with `effects.cn`. Images, ordinary `ani_degree` animations, and effect resources cannot mix. Browser joins retain names and `{key, sha256}` descriptors. Public profile selection and visual rendering are a separate application contract.

Degree animation manifests use exactly `schemaVersion: "hhwx-bandori-degree-animation-v1"`, `frameRate: 30`, `loop: true`, `atlasDimensions`, and ordered `frames: [{ name, rect }]`. Rectangles use top-left atlas coordinates and must remain in bounds; zero-padded frame names are sorted and contiguous. Content hashes cover final PNG or JSON bytes, so identical bytes naturally reuse the same immutable object even when server descriptors remain separate.

Degree effect manifests use `schemaVersion: "hhwx-bandori-degree-effect-v1"`, the bundle's explicit positive integer `frameRate`, `loop: true`, and contiguous `effect_degree_0000...` frames.

## Self-Hosted Expectations

The open-source web repository can render pages that use public metadata and configured asset URLs. It does not ship:

- the HHWX production tracker;
- asset prefetch or mirroring jobs;
- Cloudflare R2 credentials or bucket configuration;
- Bilibili session credentials;
- the HHWX user-fetcher service used for game-account binding and manual game data sync.

Self-hosted deployments must configure compatible R2 endpoint credentials and populated public/private buckets for the master and chart APIs. Missing R2 data is reported as an API failure rather than being fetched from Bestdori. A missing public asset host may still leave browser-rendered images unavailable, and missing private services leave their synchronization workflows unavailable.

## Verification

After configuring an asset host, verify representative URLs with a browser or HTTP client:

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

For Cards, Events, and Degrees, choose representative hashes from the downloaded indexes, derive their keys using the contracts above, and verify `{CDN_BASE}/{derivedKey}`. Do not verify guessed game bundle paths: they are not part of the public HTTP contract.

The Cards and Events index responses and their referenced objects must allow credential-free browser reads from the HHWX web origins:

```bash
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/cards/index.json
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/events/index.json
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/degrees/index.json
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/degrees/animation/manifests/<manifestSha256>.json
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/cards/<resourceSetName>/voice/gacha/<voiceSha256>.mp3
```

For stamp CORS, verify at least one JSON object and one voice object with an `Origin` header:

```bash
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/stamps/index.json
curl -I -H "Origin: https://hhwx.org" https://your-bandori-asset-cdn.example.com/bandori/stamps/voices/<voiceSha256>.mp3
```

The responses should include `Access-Control-Allow-Origin: https://hhwx.org` or `Access-Control-Allow-Origin: *` for a public no-credentials bucket. Then open the relevant HHWX pages and confirm the Stamp master map is read once through `/api/bandori/master/stamps`, the public hash indexes are read from their configured CDN paths, and animation manifests, atlas images, Stamp voices, and Card recruitment voices request their content-addressed objects directly from the configured CDN base URL.
