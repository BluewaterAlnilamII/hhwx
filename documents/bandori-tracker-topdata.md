# Bandori Event TOP10 Backend and API

This document defines the first CN event TOP10 backend. The public history API
preserves Bestdori's successful `eventtop` JSON shape so existing chart callers
can consume it without an HHWX success envelope. Errors remain explicit HHWX
errors. This is a registered compatibility adapter, not a template for other APIs.

## Public history API

```text
GET /api/bandori/tracker/topdata?server=3&event=318&type=event
```

- `server=3` and a positive `event` no greater than `2147483647` are required.
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
bandori/trackerdata/topdata/events/{eventId}/cn/manifest.json
bandori/trackerdata/topdata/events/{eventId}/cn/packs/event/{sha256}.json.gz
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

Phase one history is available only for `server=3`. The JP, EN, and TW frontend
shells expose the same TOP10 selection but do not issue a request until their
backend histories exist. The public Bestdori-compatible history API continues to
ignore `latest`. HTTP history is loaded once per browser session for each event;
there is no 30-second polling, Supabase subscription, Private Broadcast, prediction,
projection, or comparison path in the TOP10 panel.

## Release and rollback

Deploy the history reader first so a missing manifest returns the empty protocol,
then deploy the tracker R2 writer. Verify one normal sparse history point, one
idempotent retry, and the public API response before enabling future consumers.

Rollback removes or reverts application code only. Keep R2 objects and the tracker
ledger so already collected history remains recoverable.
