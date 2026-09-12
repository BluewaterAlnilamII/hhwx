# Bandori player search

[简体中文](bandori-player-search.zh-CN.md)

The BANDORI navigation entry opens `/bandori/player`. Results use the shareable
`/bandori/player/{jp|en|tw|cn}/{uid}` route, with the normal locale prefix.
UIDs remain strings of 4–16 decimal digits with no leading zero.

The browser calls the existing `GET /api/bandori/player/{server}/{uid}` endpoint.
It preserves the `{ success, data: { server, uid, mode, cache, fetchedAt, profile } }`
envelope and profile field names. TW now joins JP, EN and CN; KR remains unsupported.
Binding verification continues to read the public `profile.introduction` field.

The page uses mode `2`: refresh synchronously, with the backend's cached response
when refresh fails or is busy. It shows the response acquisition time and cache
indicator. Repeating the query refreshes it; there is no automatic polling.
Modes `0` (cache only), `1` (cache with background refresh), and `3` (synchronous
refresh without cache fallback) remain available to API clients.

Both successful and failed API responses are `no-store`. The private backend
origin and token remain server-only. Requests have a 30-second timeout, disallow
redirects, limit response bodies to 1 MiB, and verify the returned player identity.
Errors exclude backend response bodies. A 404 means unavailable and can also
represent a cache miss; the page does not claim that the account does not exist.

## Privacy and presentation

The API removes values protected by `publish*Flg` before returning the profile.
Section headings remain visible with “Private” when their flag is false or absent.
CLEAR, FULL COMBO and ALL PERFECT each use their own flag. Public fields with
missing data show “No data”; explicit zero is retained. The queried UID is always
shown, irrespective of `publishUserIdFlg`.

Sections follow the game profile order: profile with the main deck, band ranks, clear
counts, expanded Rating songs, main stage challenges, deck ranks, and character
ranks, followed by Current Items and Bonuses. Main-band power appears inline with
its heading. The selected profile
illustration supplies the large portrait; otherwise the deck leader is used.
The top area places this portrait on the left and a bordered profile box on the
right. The centered combination is capped at 944px: a square portrait up to 448px,
a 32px horizontal gap and a 464px profile box. Below the existing 52rem content breakpoint,
the two stack with a 16px vertical gap. The box contains the name/rank, degrees, introduction, server/UID, main deck
and acquisition time. There is no small profile avatar or UID copy button.
Band ranks have their own section heading below this area.
Deck display slots are `member3, member1, leader, member2, member4`. Card training
and the selected illustration are independent, so a trained card may show normal
art while retaining trained stars.

Rating and character rows share `BandoriDetailRow` and `BandoriDetailColumns`
with Cards/Event information: 14px text with 20px line height, muted labels on the
left, right-aligned values, and 12px vertical row padding. At a 54rem content width,
character information uses two columns with a central divider. Band ranks, stage
progress and deck ranks use compact, centered items with the band logo above the
values. Groups of four stay together: all items share one centered row when they
fit; otherwise the second group moves to a centered row after the fourth item.
Deck ranks stack logo, rank symbol and score vertically. Main-deck cards use `BandoriCardTile` (compact
56px mobile / 76px desktop), including its existing leader label and card details
popover. Card level is not displayed; the popover receives only the standard skill label. Informational
logos and character icons are 28px high. CLEAR/FC/AP share a compact table, and
Rating keeps three song entries per group with 40px `files.thumb` covers.
The total label sits above its value with a 4px gap; both share the horizontal
center of the 80px band-total column below. Each band logo and its total are
centered in that column, separated from songs by 16px. Other uses text without an icon.
Song text runs title, difficulty, then rating; only the cover and title link to
song details. The title is the keyboard tab stop for this shared destination.
On narrow screens each cover moves above its text while retaining three columns;
long titles truncate on one line with the full title available as a tooltip.

The song-record table is centered and capped at 640px, with a 160px desktop label
column and five centered 96px difficulty columns. Character rows are capped at
336px: an 80px band column, a 16px gap and the existing 240px character group.
Character icons remain 28px with the existing five-column grid and 8px gaps;
the group only shrinks when the viewport requires it. The existing 54rem
two-column breakpoint is unchanged.

`BandoriDeckRank` renders only the rank symbol and its digit overlay, independently
of player data, band logos or scores: `<BandoriDeckRank rank="ss" level={5} size={28} />`.
`size` is the square symbol box in pixels (default 28); changing it scales every
internal position. `deck-rank-layout.ts` restores MenuAtlas/RankNumberAtlas padding
from the JP 10.1.3 APK and applies the `BandDeckRankLevel.adjustLevelUI`/UIGrid
positions in a 50×50 coordinate space. Digit boxes are placed at `(31.5,22,25,25)`
for one digit, `(26,22,25,25)` and `(37,22,25,25)` for two, and
`(24.67,27.5,19.5,19.5)`, `(33.25,27.5,19.5,19.5)`, `(41.83,27.5,19.5,19.5)`
for three (x, y, width, height). Digits paint above the fixed, centered symbol and
may overflow right; zero levels and hyphens have no digits. The SSS 140×90 canvas
fills the same 50×50 box, preserving the game's nonuniform scaling. R2 PNGs remain
unchanged. The score below is ordinary text outside the reusable component.

Rating includes all eight bands and Other. The total is only reported when every
group is available. Stage progress keys are **challenge IDs**, not band IDs:
main IDs `1,2,3,4,5,6,7` map to bands `1,2,4,5,3,21,18` in the official
`masterStageChallengeList`. The present progress map is sparse: an absent main
challenge means zero earned stars. A missing entire map remains “No data”. Special
challenge IDs are excluded; MyGO has no entry among these seven main challenges.
Future main challenges require updating this small mapping from Master.

Cards, degrees, music jackets and character icons reuse existing catalogs and
components: portraits use `BandoriCardArtImage`, song covers use `MusicArtwork`,
and degrees use `BandoriDegreeView`. Additional fixed objects use
`bandori/resources/images/band-logo/{id}/logoS.png`, MenuAtlas rank symbols,
RankNumberAtlas rank digits, and SpotAtlas `icon_stagechallenge`.
The published `label_ribbon_pink`, `icon_character015_2` and original
Master Rank badge/digits are retained for later consumers; no new upload is needed
for this page. Missing images show the existing placeholder without Bestdori fallback.

## Profile field audit (2026-09-11)

The audit compared the backend's four regional `UserProfile` schema artifacts,
`project_user_profile`, this page's parser, and the retained deidentified profile
fixtures captured on 2026-08-29. The fixture manifest reports zero unknown source
fields for all four profiles. These are re-encoded, deidentified real responses,
not unchanged packets or a new live capture; optional fields are not guaranteed
to appear for every player.

`UserProfile` has `publishUpdatedAtFlg` (field 18, boolean), but no `lastLoginAt`
or profile-level `updatedAt` value in any of the four schemas or fixtures.
The inspected client dump instead declares `UserFriend.lastLoginAt` (field 8),
`friendUpdatedAt` (field 9), and `publishUpdatedAtFlg` (field 10). A login time
would therefore require a separate source; availability for arbitrary queried
players has not been established. The page's `fetchedAt` is the acquisition time,
not a login timestamp. Nested card `createdAt` is also unrelated to player login.

The following registered fields are not displayed. The backend preserves them
when present and allowed by the applicable privacy flag, except where noted.

| Area | Unused data | Current treatment |
| --- | --- | --- |
| Deck ranks | `lowerRating`, `upperRating` | Shows only rank, level and score; no rating bounds. |
| Character ranks | `exp`, `addExp`, `nextExp`, `totalExp`, `releasedPotentialLevel` | Shows only rank. |
| Main deck | `deckId`, `deckName`, `deckType`, `bondsEffectIds` | Uses member IDs and leader for card order. |
| Main-deck cards | `level`, `exp`, `addExp`, `createdAt`, `duplicateCount`, `skillExp` | Card level was deliberately removed from display; other metadata is unused. |
| Power inputs | `enabledUserAreaItems` IDs/categories/levels; card `userAppendParameter` performance, technique, visual, potential and character bonuses | The subsequent frontend extension uses these for power and current items/bonuses. They remain protected by the power publication flag and are not a direct total-power field. |
| Twitter | `twitterId`, `twitterName`, `screenName`, `url`, `profileImageUrl` | No social block; this object is empty in all four retained fixtures. |
| Settings | `searchableFlg`, `friendApplicableFlg`, `publishUpdatedAtFlg`, `publishStageChallengeFriendRankingFlg` | No settings display. Other publication flags control their corresponding sections; the queried UID remains visible. |
| Stage challenges | Entries outside the seven mapped main challenge IDs | Only main challenges are displayed; the raw map is keyed by challenge ID. |
| CN special screen | `specialScreenSetting` (field 900): profile/decorative screen IDs and enable flags, decorative offset and scale | Registered only in the CN schema, absent from the retained fixtures, and not forwarded by `project_user_profile`. Using it requires extending the backend projection first. |

`searchSuccessFlg` is handled by the backend as query status. Repeated identity
fields and degree-slot metadata do not represent additional visible profile data.
The original audit does not change the API contract; the subsequent frontend extension is described below.

## Current items, bonus parameters and power

`publishTotalDeckPowerFlg` controls both main-band power and the final section.
When disabled, both show "Private" without parsing or rendering protected bonuses.
The public API and private backend contracts are unchanged.

Current Items lists only `enabledUserAreaItems`. Its `areaItemCategory` matches the
existing `/api/bandori/master/areaItems` catalog; `areaItemId` identifies
the game's specific level record. Unreturned items are not filled in. An empty
list means no items are currently enabled, not an empty inventory.

Items keep response order without categories or tabs. Existing `BandoriDetailRow`
rows show the item name, level and queried region's `description[level]`, without
substituting another region's effect. The character bonus table follows directly
below and reuses the song-results table style and existing character icons. Each
main-band character appears once in ascending character-ID order; card names and
editing controls are omitted. Parameter headers use full Chinese names and English abbreviations.

The API append values are stat points. Display parameters use the game-profile
convention of one unit per 0.1%, rendered as percentages such as `5.5%`: add ordinary append stats to the level-based card
stats, then find the unique integer rate consistent with the returned bonus.
Potential allows one floor operation; mission totals allow both combined and
separately floored training/collection values. Ambiguous or inconsistent rates,
or missing card masters, display `—` instead of an estimate. Zero denotes no
effective bonus, not proof of an actual potential level of zero. Mission totals
cannot be split into training and collection from this response.

The JP example yields potential 55 (5.5%), confirmed against its returned bonus
points; this view does not clamp values to the game-profile editor's existing
50-level input limit. The editor and its components are unchanged. Omitted
protobuf append messages and uint fields default to zero; malformed values do not.

The main-band heading displays its power inline; private profiles replace only the
value with "Private". Card powers include the selected area items and reuse the
existing `BandoriCardTile` power overlay. Private or unavailable powers have no
card overlay. The obsolete `showLevel` component option has been removed; only
`showPower` controls this display.

Power reuses `calculateBandoriCard` for level-based stats with reconstructed training,
episode, Master Rank and character bonuses disabled, then adds all three groups of
profile append values exactly once. Medley's `selectedAreaItemPower` applies the
enabled items with the same accumulation order and without intermediate flooring.
The total retains fractional contributions and uses the same `formatLocalizedInteger`
rounding as the medley results; individual card overlays round independently for
display and are never summed to compute the team total. Missing regional level effects,
missing card metadata or an incomplete band produce a calculation error, not zero
or an estimate. A 2026-09-12 comparison using the cached public JP example and current
masters yielded approximately 396739.59 before display rounding. The former floor
produced 396739, matching the supplied game screenshot; aligning display with medley
produces 396740. This is not an exhaustive in-game comparison across regions or card states.

## Verification and rollout

Run `npm run test:bandori-player`, `npm run typecheck`, `npm run i18n:check`,
applicable ESLint checks, and `npm run build`. Browser checks should cover a public
profile, separate privacy flags, an invalid/long UID, refresh failure, and mobile
layout. Synthetic tests must not include real player records or credentials.

Deploy the compatible four-server user-fetcher and the fixed resource objects
before this Web change. No database migration or new production setting is required.

For local player lookup without starting the private user-fetcher, set
`HHWX_DEV_PLAYER_API_PROXY=1` in `.env.local` and run `npm run dev`. Only in
`NODE_ENV=development`, the public player GET route forwards to the fixed
`https://hhwx.org/api/bandori/player/{server}/{uid}` endpoint. It preserves mode,
validates the public response envelope and player identity, applies local privacy
redaction, and retains the same timeout/body/cache policy. It sends no backend
token, cookies, or browser request headers. Failures do not switch sources.

Production ignores this flag; binding verification, sync, and status collection
continue to use the private backend. Remove the flag or set it to `0` when testing
the configured local user-fetcher. This setting does not proxy Master or asset APIs.
