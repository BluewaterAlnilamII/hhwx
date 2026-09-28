# OurNotes master API

[简体中文](ournotes-master-api.zh-CN.md)

Implemented for the first OurNotes API release; production activation is a separate deployment step. These public, read-only routes follow the existing Bandori response, private snapshot reader and HTTP cache conventions. No login is required. `member` and `support` are metadata terms; the game displays support cards as snapshots.

## Routes and selection

All paths below start with `/api/ournotes/master`.

| GET path | `data` | Query |
|---|---|---|
| `/cards/member` | Member summary ID map | Optional `server=0..4` |
| `/cards/member/{cardId}` | One member detail | Optional `server=0..4` |
| `/cards/support` | Support summary ID map | Optional `server=0..4` |
| `/cards/support/{cardId}` | One support detail | Optional `server=0..4` |
| `/characters` | Shared character ID map | None |
| `/bands` | Shared band ID map | None |

Success uses `{ "success": true, "data": ... }`. Map keys are positive decimal IDs. Member and support IDs are separate namespaces. Card IDs must be positive safe integers without leading zeros. There are no `all`/`main` aliases, directory details, pagination, language selectors or arbitrary field expansion.

Without `server`, cards merge all four actual sources. With exactly one numeric `server`, only cards present in that source remain, and `serverExtensions` is removed. Localized fields and raw times retain all five slots. `characters` and `bands` remain shared catalogs and reject queries.

| Slot / `server` | Public identity | Actual master source | Text column |
|---|---|---|---|
| 0 | `jp` | JP | `ja` |
| 1 | `en` | EN | `en` |
| 2 | `tw` | TW | `zh-TW` |
| 3 | `cn_intl` | TW | `zh-CN` |
| 4 | `kr` | KR | `ko` |

`cn_intl` is the international Simplified Chinese view of TW, not a native CN game server. Slots 2 and 3 select the same records and times, with separate text columns. Missing records or translations produce `""` text slots; there is no cross-language or cross-source fallback. Missing translation does not hide a card. A future native CN source requires an explicit contract decision.

## Card fields

| Summary field | Meaning |
|---|---|
| `assetId` | Asset ID; the card ID comes from the map key or detail URL and is not repeated in the record. Do not substitute one ID for the other |
| `rarity`, `cardType` | Original integer codes, without Bandori enum conversion |
| `name` | Five localized strings; always present for support, optional for member as described below |
| `startAt` | Five original `_startAt` strings; no inferred time zone or release availability |
| `powerMax` | Original `{performance, technic, visual}` values; not a computed final power |
| `serverExtensions` | Unfiltered responses only: five `{}` / `null` slots for master presence / absence |
| `characterId`, `subtitle` | Member only: one character and five subtitle strings |
| `characterIds`, `description` | Support only: ordered character IDs and five description strings |
| `leaderSkillId`, `liveSkillId`, `gekisouSkillId` | Member only: original skill references, also present in details |
| `supportSkillId01`, `supportSkillId02`, `gekisouSupportSkillId01`, `gekisouSupportSkillId02` | Support only: original numbered skill references, also present in details |

Member `name` is omitted only when every present source uses the same `_nameTextID` as its referenced character. When absent, resolve `characterId` through Characters and use `characterName`. If any source uses a card-specific name reference (for example a stage name), retain all five `name` slots; an empty slot stays empty and does not fall back to the character name. Support names are independent card text and are always retained, including multi-character names. Card presence still comes from `serverExtensions` or server selection.

Nonregional fields must agree across records with the same kind/ID. Conflicts fail the affected read instead of silently selecting one source. There is no speculative field override registry. Missing source records are allowed; failure to read a required source is not treated as absence.

Lists and details contain the same top-level skill ID fields. Unset references remain `0`; numbered support slots are neither removed nor reordered. This release does not provide full skill descriptions, effect formulas or a skills API.

Details include the summary fields plus `growth`:

| Field | Member | Support |
|---|---|---|
| `growth.level` | Level rows | Level rows |
| `growth.awake` | Awake rows | Omitted |
| `growth.awakeResource` | Awake resource rows | Omitted |
| `growth.rank` | Member rank rows | Support rank rows |

Growth rows preserve source order and raw numbers, without percentage conversion. Empty optional groups are `[]`; broken references are errors. Each growth row contains only these fields:

- Level: `level`, `exp`, `performanceRate`, `technicRate`, `visualRate`.
- Awake: `awakeCount`, `performanceRate`, `technicRate`, `visualRate`.
- Awake resource: `awakeCount`, `itemId`, `count`.
- Member rank: `rank`, `requiredRankUpItemCount`, `performanceRate`, `technicRate`, `visualRate`, `leaderSkillLevel`, `musicTypeBonusRate`, `musicTagBonusRate`.
- Support rank: `rank`, `limitLevel`, `requiredRankUpItemCount`, `supportSkill01Level`, `supportSkill02Level`, `gekisouSupportSkill01Level`, `gekisouSupportSkill02Level`, `cardTypeLinkBonusRate`.

Lists exclude growth rows and full skill records. Raw master rows, private paths, source descriptors and credentials never enter public responses. The public `startAt` name and flat skill IDs are Web projections; the private card pack schema and its `startAtRaw`, `skills` and `id` fields remain unchanged.

## Shared catalogs and images

Character records contain `characterName[5]`, `shortName[5]`, `bandId`, `displayOrder`, and `colorCode`. Band records contain `bandName[5]` and `colorCode`. Names use the same fixed source/locale mapping. Structural fields must agree across sources. Cards reference characters, and characters reference bands; cards do not embed these catalogs.

Images are independent. `kind` and `assetId` associate a card with the existing `ournotes/cards/index.json`; these APIs neither return image URLs nor fetch the image index. Image availability does not filter cards, change `serverExtensions`, or gate API readiness. Frontend pages, new media categories and database changes are outside this release.

## Errors and caching

Errors use `{ "success": false, "error": { "code": "...", "message": "..." } }` and `NO_STORE_HTTP_CACHE_POLICY`.

| Status | Condition |
|---|---|
| 400 | Unknown, duplicate or invalid query parameter; any directory query |
| 404 | Unknown kind, invalid ID, or card absent from the requested view |
| 503 | Missing configuration/source, corrupt snapshot, invalid references or conflicting data |
| 500 | Unclassified application error |

Success reuses `SNAPSHOT_HTTP_CACHE_POLICY`: browser `max-age=300, stale-while-revalidate=1800`; Cloudflare `max-age=1800, stale-while-revalidate=86400`. Edge cache keys must distinguish the card `server` query. Source pointers have a 60-second process cache. Immutable objects use bounded caches and shared in-flight reads; merged views are reused while input identities remain unchanged. TW and `cn_intl` share one input. Separate requests do not promise an atomic release across all servers or images.

## Server configuration and verification

Use server-only, read-only private R2 credentials from `.env.example`: `OURNOTES_R2_ENDPOINT`, `OURNOTES_PRIVATE_R2_BUCKET`, `OURNOTES_R2_ACCESS_KEY_ID`, and `OURNOTES_R2_SECRET_ACCESS_KEY`. No Bandori credential or public CDN fallback is used. `OURNOTES_MASTER_LOCAL_STORE_ROOT` is for development/tests only and is rejected in production.

Cards pin each source's `ournotes/master/cards-v1/{server}/api/active.json` and verify their own immutable packs (schema, compressed hash/size, semantic hash, decompression limit and record count). Characters/bands discover their named normalized files through `ournotes/master/{server}/active/manifest.json` and verify compressed/plain byte hashes and sizes. Neither reader requires a producer recipe revision or an exact source-table/file inventory. Shared readers own storage and bounded content caches; Cards and catalogs own their respective validation, merging and response caches. Identical verified dataset content can be reused across archive generations. Web never downloads raw `MasterText`.

The generic master roots must be initialized before deploying these readers. Public URLs, fields and five-slot semantics are unchanged. New independent datasets do not require changing existing readers; missing required data and unknown data schemas still fail. This structural correction does not add a skills API.

Run `npm run test:ournotes-master` for the bounded local fixture, route contracts, corruption failures, five-slot selection and cache reuse. Shared-reader changes also require the relevant Bandori tests, typecheck, lint and build. The fixture contains selected metadata with version/hash provenance, no complete master tables or credentials.

Deployment order is compatible assets consumer, producer publication of all four v3 master artifacts, then Web activation. Verify signed reads from the Web host, all six endpoints, query-aware edge caching and no-store errors. Master readiness is independent of image jobs. Local tests do not replace production verification.
