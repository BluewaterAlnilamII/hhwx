# Bandori Master and Asset Contract

Chinese version: [bandori-master-asset-contract.zh-CN.md](bandori-master-asset-contract.zh-CN.md).

This document is the cross-dataset contract for the Events, Cards, Degrees, Stamps, and Music data exposed by HHWX. Dataset-specific fields may differ, but their transport, regional slots, publication, and asset lookup rules should follow this matrix. `degree` is the canonical domain term; “title” is UI copy only.

## Common Rules

- Public master APIs use `{ "success": true, "data": { id: record } }`. Errors use `{ "success": false, "error": { "code", "message" } }` and a non-2xx status.
- Regional arrays always have four slots in `jp`, `en`, `tw`, `cn` order. API and index JSON use these names for keyed regional maps; numeric `0`, `1`, `2`, `3` values are only accepted by the Cards `server` query and user/profile settings.
- Missing regional strings use `""`. Degree numeric slots use `0` when absent. Fields whose domain explicitly permits an unknown scalar, such as Stamp `characterId`, use `null`. Missing optional structures are omitted.
- Master APIs contain gameplay metadata. Public asset-discovery indexes contain content hashes needed to construct CDN URLs; the separate Music meta root contains derived score coefficients plus the exact paired-index identity. Storage pointers, pack keys, generations, source hashes, and private object layouts are never exposed by the APIs.
- Mutable APIs and indexes use cached snapshots. Every indexed media object, including Music media and chart JSON, is named by its SHA-256 and immutable for one year. Readers fail closed instead of falling back to Bestdori or legacy public artifacts.
- Unsupported query parameters return `400 BANDORI_MASTER_QUERY_INVALID`; they are never redirected or silently ignored.

## Dataset Matrix

| Dataset | Master API | Detail API | Public asset index | Primary join | Regional representation | Intended cache tier |
| --- | --- | --- | --- | --- | --- | --- |
| Events | `/api/bandori/master/events` | `/api/bandori/master/events/{eventId}` | `/bandori/events/index.json` | numeric event ID | four-slot master fields and local `stampRewardId`; scalar `stampCharacterId`; four-slot banner/team images | fast-mutable API; snapshot index |
| Cards | `/api/bandori/master/cards` | `/api/bandori/master/cards/{cardId}` | `/bandori/cards/index.json` | `resourceSetName` | four-slot text plus explicit `serverExtensions`; images are shared by content hash | snapshot API and index |
| Degrees | `/api/bandori/master/degrees` | none | `/bandori/degrees/index.json` | numeric degree ID for metadata; derived resource names for assets | eight fixed four-slot master fields plus optional four-slot `serverExtensions` using absent `null`, present `{}`, and CN-only `degreeEffect`; base, rank, icon, and effect resources selected independently | snapshot API and schema 2 index |
| Stamps | `/api/bandori/master/stamps` | none | `/bandori/stamps/index.json` | numeric stamp ID | four-slot `imageName`, `characterId`, images, voices, and Changed variants | snapshot API and index |
| Music | `/api/bandori/master/music` | `/api/bandori/master/music/{musicId}` | `/bandori/music/index.json` | numeric music ID | four-slot regional metadata plus shared derived chart/audio fields; numeric difficulty keys `0` through `4` | snapshot API and index |
| Music score meta | `/api/bandori/master/music/meta` | none | `/bandori/music/meta.json` | music ID, difficulty, then skill duration | no regional slots; each leaf is `[normalOutside, normalCovered, feverOutside, feverCovered]` | snapshot API and index |

The Cards and Music lists are intentionally downloaded as reusable SPA-session maps. The optional Cards `server=0|1|2|3` materialization is the only supported master query. Event `cnSchedule` remains an optional overlay because it can change independently of the immutable event snapshot. Music `difficulty`, `notes`, and `bpm` keys identify chart difficulty rather than server slots. Music score meta is a separate minimal dataset for client-side score/rank calculation; it omits song display fields, precomputed scores, ranks, and internal publication metadata.

Event `stampRewardId` is a fixed `[jp, en, tw, cn]` array because it is a server-local foreign key; unavailable events keep `null`, and another server's ID is never copied into that slot. Decimal string IDs in historical input are normalized to integers. `stampCharacterId` is one scalar because all available regional rewards must resolve through the Stamps API to the same semantic image and character; disagreement fails snapshot publication.

Degree master records are keyed by degree ID and contain exactly eight four-slot fields: string fields `degreeType`, `iconImageName`, `baseImageName`, `rank`, `degreeName`, and `description`, plus non-negative integer fields `seq` and `characterId`. `rank` remains a string. The public asset index is keyed by resource name: base uses `baseImageName`; rank uses `rank_none` or `{degreeType}_{rank}`; icon uses `icon_none` or `{iconImageName}_{rank}`. This avoids repeated hashes when degree IDs or roles share media. Resource type is fixed across servers by name: an `ani_degree*` resource contains only `animations: { server: { manifest, atlas } }`, while every other resource contains only `images: [jp, en, tw, cn]`. Mixed resource types are rejected even when they occur on different servers, and no cross-server fallback is allowed. Browser catalog resolution returns these names and `{key, sha256}` descriptors; URL construction remains at the actual image, manifest, or atlas fetch boundary.

Degree animation manifests use schema `hhwx-bandori-degree-animation-v1` with explicit `frameRate: 30`, `loop: true`, atlas dimensions, and ordered `{ name, rect }` frames in top-left coordinates. Frame names must be zero-padded, lexicographically sorted, and contiguous. Stamp animation manifests use the separate minimal `hhwx-bandori-stamp-animation-v1` contract with an explicit positive `frameRate`, atlas dimensions, and ordered `{ name, cssRect }` frames; there is no 12 FPS or `unityRect` fallback. Bundle provenance is diagnostic metadata and is not part of the immutable playback manifest. Newly written Stamp root descriptors contain only `manifest` and `atlas`. Web readers accept legacy optional root `frameRate` and `frameCount` fields long enough to validate and discard them.

## Stable JSON Order

Public indexes are serialized for deterministic hashing and human review:

- root fields: `schemaVersion`, `updatedAt`, then the dataset map;
- Cards resources: standard names first, then `bili_` names;
- Degrees resources: ordinary names first, then `ani_degree` names; each resource writes `images` before `animations`;
- Stamps root: `schemaVersion`, `updatedAt`, `stamps`, `changedStampGroups`;
- Music songs: `files`, `notes`, `bpm`, `length`; file fields are `jacket`, `thumb`, optional `audio`, then `charts`;
- Music score meta root: `schemaVersion`, `updatedAt`, `musicIndexSha256`, `durations`, `songs`; the server verifies the exact paired Music index bytes and the API projects only `durations` and `songs`;
- keyed server maps: `jp`, `en`, `tw`, `cn`;
- numeric IDs: ascending numeric order.

Field order is not an application identity, but builders rewrite a mutable index when its canonical bytes differ even if its parsed meaning is unchanged.

## Changed Stamp Join

Changed Stamp metadata and media are deliberately split:

- the private master snapshot publishes ordered variants as `{ imageName, soundName }`;
- the public index publishes the corresponding ordered variants as `{ image?, audio? }`;
- both builders sort each regional variant list by `(imageName, soundName)` before publication;
- the browser joins the two arrays by stamp ID, server slot, and array offset, and ignores the Changed display when the lengths diverge.

This compact positional identity avoids duplicating rule IDs or names in the public index. The full Changed manifest remains indexed for completeness but is not required by the current picker.

## Verification

Run the unit suites for the changed dataset, then run the read-only production audit after deployment:

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

The Music Player suite verifies the Music-to-player adapter, durable queue and preference snapshots, restart and repeat behavior, and toolbar input decisions. The production audit verifies envelopes, fixed server slots, Event-to-Stamp semantic identity, index field order, API-to-index coverage, Changed Stamp positional lengths, cache headers, and rejection of unsupported master queries. Override `HHWX_BANDORI_API_BASE_URL` or `HHWX_BANDORI_ASSET_BASE_URL` to audit another deployment.
