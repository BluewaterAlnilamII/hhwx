# Bandori Event TOP10 Backend and API

This document defines the CN event TOP10 producer and the four-server history adapter. The public history API
preserves Bestdori's successful `eventtop` JSON shape so existing chart callers
can consume it without an HHWX success envelope. Errors remain explicit HHWX
errors. This is a registered compatibility adapter, not a template for other APIs.

## Public history API

```text
GET /api/bandori/tracker/topdata?server={0|1|2|3}&event=318&type=event
```

- A numeric `server=0|1|2|3` and a positive `event` no greater than `2147483647` are required. Server codes in object storage are `jp|en|tw|cn`.
- `type` defaults to `event`; no other type is currently supported.
- Only `server`, `event`, and `type` are read. `interval`, `latest`, `mid`, and
  all other query parameters are ignored. Supplying `latest=1` still returns
  the complete sparse history.
- Success is exactly `{ "points": [...], "users": [...] }`. An event with no
  published manifest returns `200 + { "points": [], "users": [] }`.
- Invalid contract parameters return `400 INVALID_REQUEST`. Unavailable,
  missing referenced, corrupt, oversized, or timed-out history returns
  `503 TRACKER_HISTORY_UNAVAILABLE`; unexpected failures return
  `500 INTERNAL_SERVER_ERROR`. Error bodies use `{ success: false, error }`.
- Every response is dynamic and uses the shared no-store cache policy.

Each point contains only `time`, `uid`, and `value`. Users contain only `uid`,
`name`, `introduction`, `rank`, `sid`, `strained`, and `degrees`. Raw deck,
card, and lineup fields are neither stored nor returned.
Names and introductions are preserved as Unicode text: BBCode is not transformed,
real line feeds remain line feeds, and a literal backslash followed by `n` remains
two ordinary characters.

## Private history storage

The tracker publishes immutable gzip packs and a conditional manifest to the
bucket configured by `BANDORI_PRIVATE_R2_BUCKET`:

```text
bandori/trackerdata/topdata/events/{eventId}/{server}/manifest.json
bandori/trackerdata/topdata/events/{eventId}/{server}/packs/event/{sha256}.json.gz
```

The Web API reads these objects through the shared private S3/R2 reader. It
does not fetch `cdn.hhwx.org` and has no Bestdori runtime fallback. Local
development may set `BANDORI_TOPDATA_HISTORY_LOCAL_STORE_ROOT`; production
rejects that override.

The reader enforces a 64 KiB manifest limit, 2 MiB compressed pack limit,
16 MiB decompressed limit, 20,000 points, 20,000 users, SHA-256 identity,
descriptor counts, and complete one-to-ten-point samples grouped by timestamp.
An empty ranking does not publish a history snapshot or manifest. Manifest reads have a
60-second TTL and in-flight deduplication. The whole manifest-plus-pack read
has a 3-second request budget and a 15-second failure cooldown. A previously
validated active result can serve stale for six hours; a result whose manifest
contains a final sample can serve stale while it remains in the bounded cache.

## Frontend integration boundary

The Event Tracker exposes TOP10 instead of the old event-ranking T1/T10 entries
on every regional shell. Song and monthly T1/T10 entries remain available. TOP10
is mutually exclusive with T20+ cutoff panels, so the page uses only one ranking
protocol at a time. Old `tier=1` and `tier=10` event URLs and browser preferences
are not migrated. The compatibility cutoff API still accepts those tiers.

The TOP10 panel selects the UIDs from the newest sample, draws only those users'
history, and breaks a line while a UID is absent from a sample. The ordered newest
sample defines the displayed rank. Player rows show the card avatar from `sid` and
`strained`, plain-text `name`, the unlabeled `uid`, and the score in `P`. They do not render `introduction`,
`degrees`, or the player-level `rank` field. Empty history uses the shared tracker
message, `暂无该排名档位的追踪数据`.

TOP10 history is requested on all four servers. JP, EN, and TW retain the same
selection and empty panel; a missing regional manifest returns the exact empty
success body rather than suppressing the request or falling back to another source.
The public Bestdori-compatible history API continues to ignore `latest`.
HTTP history is loaded on first use, event changes, and foreground resume, using
the same policy as cutoff history. It is never polled every 30 seconds. Prediction,
projection, and comparison remain cutoff-only.

## Phase-two live integration

The frontend enforces the required mutual exclusion: selecting
TOP10 disables the cutoff data hook, comparisons, and projections, while leaving
the TOP10 panel mounted as the only ranking consumer. `useBandoriTop10Data` owns
the TOP10 history/live composition; `Top10Panel` remains presentation-only.

Cutoff and TOP10 adapters share the protocol-agnostic lifecycle in
`bandori-tracker-live-connection`: restore the authenticated session, join a
private topic, buffer Broadcast messages until the latest-row SELECT completes,
merge by revision, retry the bootstrap read with a bound, disconnect on unmount or
prolonged tab hiding, and retain a bounded cache. Each adapter supplies only its
topic, event, latest-row query, parser, and revision merge rule.

The CN-only TOP10 live adapter uses
`bandori_tracker_topdata_latest_snapshots`, event `topdata_snapshot`, and topic
`bandori:topdata:cn:events:{eventId}`. Its current snapshot is merged into the
cached HTTP history only for rendering: replace the same timestamp, append a newer
timestamp, ignore an older snapshot, and let latest user profiles override matching
UIDs while retaining historical users. It must never write the 30-second samples
back into the session history cache. A foreground history refresh updates only the
sparse R2 baseline and remains independent of the live connection. Existing
unauthenticated behavior remains the sparse HTTP history only. The adapter is active only when
`NEXT_PUBLIC_BANDORI_TRACKER_LIVE_SOURCE=broadcast` and the restored session has a
real user. JP, EN, and TW never query the TOP10 latest table or create a TOP10
Broadcast channel; if a compliant regional R2 manifest is published later, the
existing history API and panel can read it without a frontend change.

## Release and rollback

For phase two, apply and verify the additive Supabase migration first, deploy the
frontend in history-only-compatible mode second, deploy the tracker in `snapshot`
mode third, and enable `broadcast` only after authenticated bootstrap and private
topic authorization pass. Keep the public history API unchanged throughout.

Rollback removes or reverts application code only. Keep the additive latest table,
RPC, policies, R2 objects, and tracker ledger so already collected state remains
recoverable.
