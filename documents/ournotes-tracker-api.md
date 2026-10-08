# OurNotes tracker API

The Web app serves published activity-ranking history and participation/reward counts. `hhwx-ournotes-backend`
owns collection, local history and publication; requests to these APIs never
query the game, write storage, or start backend work. See the backend's
`docs/cutoff-tracker.md` for its producer contract.

## Requests

```text
GET /api/ournotes/tracker/data?server=0&eventId=1&tier=100
GET /api/ournotes/tracker/topdata?server=0&eventId=1
GET /api/ournotes/tracker/participation
```

All three endpoints are public, read-only and require no login. Participation accepts
no query parameters and returns all events and servers. Ordinary/TOP10 accept only
the listed parameters, each exactly once. `eventId` and `tier` must be canonical
positive decimal safe integers (no leading zeros, signs, fractions or exponents).
`server` is exactly `0` (JP), `1` (EN), `2` (TW), or `4` (KR). `3` is not a tracker
server; the master API's `cn_intl` projection does not define a separate ranking
source or tracker alias.

The ordinary endpoint requires one of these 16 tiers:

```text
100,101,1000,1001,5000,5001,10000,10001,
20000,20001,30000,30001,50000,50001,100000,100001
```

These APIs provide event rankings only. There are no `event`, `type`, `song`,
pagination or locale parameters. TOP10 includes all actually returned T1–T11
records, with at most 11 distinct players per sample. Missing ranks are not filled.

## Responses

Success is always `{ "success": true, "data": ... }`, without `meta`. Bandori's
compatibility wrappers do not apply. The following values are illustrative.

Ordinary history:

```json
{
  "success": true,
  "data": {
    "cutoffs": [
      { "time": 1791288000000, "value": 123456 },
      { "time": 1791289800000, "value": 128900 }
    ]
  }
}
```

Points are ordered by ascending Unix milliseconds. `value` is the collected
score, including zero. The response contains the earliest 5,000 points for the
requested tier; this response limit does not remove records from storage.

TOP10 history (one player shown, with every field):

```json
{
  "success": true,
  "data": {
    "points": [
      { "time": 1791288000000, "id": "player-a", "value": 1500000 },
      { "time": 1791289800000, "id": "player-a", "value": 1550000 }
    ],
    "users": [
      {
        "id": "player-a",
        "profileId": 900001,
        "name": "Player A",
        "rankExp": 4320900,
        "lastUpdatedAt": 1791289700,
        "favoriteMemberCardMasterId": 53
      }
    ]
  }
}
```

`points` preserves ascending sample time and the producer's ranking order within
each sample, including ties. It does not infer missing positions or add a rank
field. `users` is sorted by string `id`, covers exactly the players referenced by
history, and contains each player's latest published profile, not a profile per
historical sample.

| Public field | Published field | Meaning |
| --- | --- | --- |
| `id` | `id` | String identity referenced by points |
| `profileId` | `profile_id` | Independent integer profile ID, not a conversion of `id` |
| `name` | `name` | Name, including an empty string |
| `rankExp` | `rank_exp` | Integer experience; not converted to a player level |
| `lastUpdatedAt` | `last_updated_at` | Game profile timestamp, preserved without conversion; not sample time |
| `favoriteMemberCardMasterId` | `favorite_member_card_master_id` | Integer member-card master ID, including zero |

All exposed numeric values must be safe JavaScript integers; invalid or unsafe
artifact values cause a read failure, never rounded identities or scores. Stored
snake_case profile fields are mapped only at the Web service boundary. No raw
decks or other profile fields are exposed. The backend still collects its closing
sample, but neither points nor manifests have finality flags.

A missing manifest, or a supported tier absent from a valid ordinary pack, returns
HTTP 200 with `{ "success": true, "data": { "cutoffs": [] } }`. Missing TOP10
history returns `{ "success": true, "data": { "points": [], "users": [] } }`.
An empty result means no published history, not proof that an event does not exist.

Failures use `{ "success": false, "error": { "code", "message", "details"? } }`:

| HTTP status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | Missing, repeated, unknown or malformed parameters, including `server=3` |
| 404 | `TRACKER_TIER_NOT_SUPPORTED` | A valid positive integer tier outside the supported set |
| 503 | `TRACKER_HISTORY_UNAVAILABLE` | Configuration, transport or artifact failure without usable verified history |
| 500 | `INTERNAL_SERVER_ERROR` | Unexpected handler failure |

Errors expose no credentials, storage endpoints or internal exception messages.
For example, a storage failure returns:

```json
{
  "success": false,
  "error": {
    "code": "TRACKER_HISTORY_UNAVAILABLE",
    "message": "Tracker history is temporarily unavailable."
  }
}
```

## Participation and reward counts

`GET /api/ournotes/tracker/participation` returns event ID → five fields → five slots.
The slot order is always `[JP, EN, TW, CN, KR]`; CN is currently always `null`.
The following counts are illustrative:

```json
{
  "success": true,
  "data": {
    "1": {
      "firstCardRewardCount": [12000, 8000, 3000, null, 2000],
      "lastCardRewardCount": [9000, 5000, 2000, null, 1000],
      "allNonEventItemRewardsCount": [7000, 3000, 1500, null, 800],
      "allPointRewardsCount": [5000, 2000, 1000, null, 600],
      "participantCount": [50000, 30000, 10000, null, 7000]
    }
  }
}
```

| Field | Meaning |
| --- | --- |
| `firstCardRewardCount` | Players reaching the first cumulative card reward threshold, including MemberCard and SupportCard |
| `lastCardRewardCount` | Players reaching the highest positive-quantity MemberCard / SupportCard point reward, including repeated copies |
| `allNonEventItemRewardsCount` | Players reaching every positive-quantity ordinary point reward other than this event's item; exclude Item rows whose resourceId equals detail.eventItemId |
| `allPointRewardsCount` | Players reaching all ordinary cumulative rewards, excluding Loop |
| `participantCount` | Players represented in the event leaderboard during that closing observation, including present zero-score entries |

Thresholds come from each event/server's `pointRewards`; neither scores nor item IDs are hardcoded.
Both added metrics exclude Loop. Filter mixed reward tiers per resource row; an empty selection
means an inapplicable threshold. Missing added fields in early packs become five null slots,
preserving the original counts. New publications and HTTP responses contain all five fields.

Reward counts prove score eligibility, not that rewards were claimed. `null` means
unfinished, unverified, or an inapplicable threshold; never convert it to zero.
`0` means nobody reached a reward threshold on a verified leaderboard. An empty
leaderboard is not yet sufficient evidence for zero participants and remains null.
Counts depend on unique contiguous ranks and omission only beyond the leaderboard's
end. Unranked players are outside this count, and later player removals may change it.
Non-null counts are integers in `0..2147483647`; when present, all-reward count ≤
non-event-item reward count ≤ last-card count ≤ first-card count ≤ participant count.
Compare remaining known counts even when intermediate metrics are null.

Each server fills its own slots when complete, without waiting for the other servers.
Unfinished slots remain null. No published root returns `{ "success": true, "data": {} }`;
actual read failures use the 503 and stale-cache rules above. The complete map is
returned without filtering, pagination or truncation. Threshold scores and internal
observation times are not response fields.

## Reading and caching

All three artifacts live in the same public artifact bucket, accessed by signed S3
requests from the server. The server never falls back to a public CDN or another
game's configuration. Configure server-only `OURNOTES_R2_ENDPOINT`,
`OURNOTES_R2_ACCESS_KEY_ID`, `OURNOTES_R2_SECRET_ACCESS_KEY` and
`OURNOTES_PUBLIC_R2_BUCKET`; the credentials must have read access to that bucket.
The independent master API continues to use `OURNOTES_PRIVATE_R2_BUCKET`.

```text
ournotes/trackerdata/events/{eventId}/{server}/manifest.json
ournotes/trackerdata/events/{eventId}/{server}/packs/event/{compressedSha256}.json.gz
ournotes/trackerdata/topdata/events/{eventId}/{server}/manifest.json
ournotes/trackerdata/topdata/events/{eventId}/{server}/packs/event/{compressedSha256}.json.gz
ournotes/trackerdata/participation/manifest.json
ournotes/trackerdata/participation/packs/{compressedSha256}.json.gz
```

The reader verifies schema, target identity, exact paths, required descriptors,
recent references, compressed size/hash, bounded decompression, semantic hash and
record counts. Hash validation uses the original stored JSON, before public field
mapping. An ordinary manifest must contain `packs.event`. A missing required
descriptor, a missing referenced pack or invalid content is a failure, not empty
history. Ordinary/TOP10 manifests commit independently; their generations need not match.
Participation has one root shared by every event and server. Its pack is
`{schemaVersion:1,kind:"eventParticipation",events}`; the root uses the same kind,
with generation, publishedAt, pack and recentPackKeys. Its descriptor contains key,
both hashes, compressedSize, jsonSize and recordCount (number of events). The reader
checks exact JSON size, event count, fixed slots and count relationships, then
projects `events` into the response.

Both success and error responses send `Cache-Control: no-store, max-age=0` and
`Cloudflare-CDN-Cache-Control: no-store`. Server-side manifest caching is 60 seconds,
with 64 targets; verified pack caching is limited to 16 entries and an estimated
32 MiB across all three kinds. Concurrent reads share in-flight work. The read deadline
is 3 seconds, and failures have a 15-second cooldown.

After a read failure, a still-resident verified pack may be reused for up to six
hours after its last successful validated read. Every target uses that bound;
there is no final-history exemption. A missing root clears previous success.
Generation, publication time and degraded reads remain internal diagnostics,
not response fields.

| Reader limit | Value |
| --- | --- |
| Manifest bytes | 64 KiB |
| Compressed pack bytes | 2 MiB |
| Decompressed JSON bytes | 16 MiB |
| Complete ordinary pack records | 200,000 |
| Ordinary response rows | 5,000 |
| TOP10 points / users | 20,000 each; returned in full |
| Participation events | No event-count cap; the byte budgets above apply, with a complete response |

These are reader/response limits, not backend retention limits. Changing them
requires checking producer, reader and recovery contracts together.

## Verification and rollout

`npm run test:ournotes-tracker` covers the HTTP handler, parsers, real retained Rust
publication bytes with synthetic players, signed reads, cache refresh, cooldown,
stale expiry, corruption, missing data and response projection. The retained
fixture records its provenance. Participation tests use actual Rust gzip bytes with
synthetic counts, checking fields, slot order, nulls, hashes, refresh and failures.
Run `npm run typecheck`, `npm run lint` and
`npm run build` for integration changes.

For local acceptance, configure the verified R2 binding above and run `npm run dev`.
Compare the four servers' HTTP responses with the current signed R2 manifests and
referenced packs. Keep `OURNOTES_TRACKER_LOCAL_STORE_ROOT` unset for this check.
Offline tests may instead set it to an object directory whose child is `ournotes/`;
that override is rejected in production. Neither mode invokes a backend command.

Before production rollout, verify the explicit public-bucket binding and signed
read access from the Web host. After deploying Web, compare both endpoints against
the referenced packs for JP/EN/TW/KR, check error/empty responses, and observe a
new publication after the manifest TTL. For participation, compare all four slots
with the aggregate pack. Verify rank ties and
leaderboard-end semantics within an explicitly authorized event/server scope before
launch. API rollback does not rewrite backend
history, manifests or pending publications.
