# Realtime message board

中文说明见 [realtime-message-board.zh-CN.md](realtime-message-board.zh-CN.md).

The local implementation is opt-in. Production migration, role assignment and deployment require separate operational scope. See the [execution plan](realtime-message-board-plan.md) and [validation record](realtime-message-board-validation.md).

## Activity, unread state and native recovery

A signed-in tab owns one chat connection. `chat_activity:main` stays subscribed while the dialog is closed; `chat:main` is a token-authorized client subscription enabled only while the dialog is open. Personal account notifications retain their existing implementation. Guests create neither subscription.

- Login subscribes to activity before reading `GET /api/chat/activity`. It returns only `{latest,latestOther}` cursors, without bodies, author profiles or unread counts. Creates publish a cursor and author ID; deletes publish an ID. Text and image messages from other accounts can light the launcher's red dot; own messages and stamps cannot.
- The durable `(createdAt,id)` read cursor lives in `localStorage`, scoped to account and room. First use initializes at the current latest position without flagging old history. Other tabs in the same browser accept monotonic storage updates; cross-device read synchronization is outside scope. A read advances only after the visible, focused dialog renders the latest bottom. Opening an older reading position does not mark it read. Broker offsets are never used as read cursors.
- First opening subscribes to full messages before requesting `GET /api/chat/messages?activity=1`. One service-only `read_chat_snapshot` RPC returns the latest 50 messages plus the activity summary from one database snapshot; incoming publications are buffered during that read.
- A valid cached baseline plus `recovered:true` uses SDK replay directly, with **zero history requests**. The retained subscription object carries its recovery position across close/reopen. Create/delete application is idempotent; ephemeral stamps use `skip_history:true` and never replay.
- If recovery fails or no valid baseline exists, fetch one fresh latest page, replace the old loaded history and return to latest. Preserve drafts, pending uploads, failures and the local read cursor. Do not validate retained IDs, stitch disconnected history or page forward to close a gap. A closed dialog refreshes only its summary; message history waits until opening.
- Closing preserves loaded message records, pagination and the scroll anchor, releases confirmed media previews and unsubscribes full messages. Pending attachments/uploads remain owned by the account. Hiding or blurring pauses read acknowledgements without disconnecting. Stamp playback requires only an open dialog, regardless of page focus or visibility. Hiding the page neither drops new effects nor clears current effects/audio; their existing lifetime continues without queuing for the foreground. Closing still cancels playback. Browser background scheduling and audio policies still apply. Logout/account change disposes the account's memory and transport.
- Cached reading, navigation and HTTP send confirmations remain usable during reconnect. A history failure retries that read without tearing down a healthy socket. Healthy connections do not poll. A deletion of a current summary marker triggers one coalesced summary refresh; ordinary arrivals do not query.

Both namespaces retain at most **256 events for 300 seconds** in Centrifugo's memory engine, with forced recovery. Either count or age can exhaust the window; restart loses it. These are short-disconnection bounds, not durable delivery. A database commit whose publication fails is outside this guarantee and becomes visible at a later fresh snapshot. An outbox remains deferred.

Apply `20261026072628_chat_activity_and_snapshot.sql`, then the new broker configuration, then the app. The migration only adds two service-role invoker RPCs with a fixed empty search path; it adds no table or read-state writes. New tabs opt into the activity connection with `POST /api/chat/connection?activity=1`; legacy requests retain their old full server subscription. Existing before/after history APIs remain compatible, although the new client no longer uses forward recovery. Rollback can keep the additive RPCs/history configuration and restore the old app. No production operation is part of this local change.

The reference is Discord's separation of passive activity and active message delivery, and its resume-or-initialize lifecycle, not a copy of its private web-client protocol: [passive sessions](https://discord.com/blog/how-discord-reduced-websocket-traffic-by-40-percent), [Gateway resuming](https://docs.discord.com/developers/events/gateway#resuming), [Centrifugo recovery](https://centrifugal.dev/docs/server/history_and_recovery). The actual implementation uses the installed Centrifuge SDK.

Image acceptance now requires width × height ≤ 16,777,216 and both sides ≤ 16,383, alongside the unchanged 20 MiB file limit. Static resizing uses the minimum of the pixel-area and side-length scale factors, rounded down. In-limit originals pass through; oversized animation is rejected. At 4 bytes/pixel the pixel cap represents 64 MiB for one decoded RGBA surface; decoding, canvas, encoding and animation frames can coexist. The original is decoded before resizing, so this is not a peak-memory guarantee. Server HEAD still verifies stored bytes/type rather than decoding pixels.

## Application contract

The message list disables native selection for text, images, names, UIDs and timestamps; the context menu supplies copying. Image thumbnails also suppress native touch callouts. Draft text remains selectable/editable, and the separate image viewer retains native image actions.

Message menus and dialogs share compatible Radix focus/layer dependencies. Escape closes only the top menu; keyboard navigation enters its items and closing returns focus to the message.

The frontend uses grouped left/right bubbles and shared time separators, with contextual copy/delete/moderation actions. Own identity is hidden; others reuse the comment avatar and UID presentation. Emoji selection and rendering reuse comments, storing existing shortcodes in the text field with the same raw character count. Pure emoji messages use the existing jumbo rendering. The composer supports independent image uploads; transient stamps use the actual send/quota/broadcast flow described in [the plan](realtime-message-board-plan.md#stamp-delivery-and-playback-2026-10-24). Emoji use adds no profile, permission or database reads; chat preloads the shared stamp catalog and common resources once, with individual media on demand. The floating latest-message action appears when the reader is away from the latest bottom .

The launcher is hidden until site authentication resolves to a signed-in user. Guests load no chat UI/SDK and request no credentials or history. Authenticated non-anonymous accounts can read and send; chat has no separate email-verification tier. Login, registration and legacy-account compatibility remain unchanged. Server handlers still verify Auth credentials and determine the author. Authors can delete their own messages; `user_roles.role = 'chat_moderator'` enables deletion and mute management. Muted users retain read access and deletion of their own messages.

Plain-text input uses the comment counter/truncation helpers: 1,000 Unicode code points, whitespace included in the counter, trimmed on submission, whitespace-only submissions ignored. History returns 50 messages with a microsecond-preserving `(createdAt,id)` cursor. Each account can send 20 messages per 60-second window starting at its first successful send. This is a fixed window, not a strict sliding limit; devices/tabs share the counter. Retries do not spend quota again, failed saves spend nothing, deletion does not refund, and failed publication still counts a saved message. Deletion clears the body and excludes it from history; request IDs remain until 30-day expiry.

Events carry IDs, timestamps, content and compact author display fields. Existing avatar components and resource caches supply the images; publications do not fetch profiles or transmit image binaries, decorations, permissions or emails. Message UUIDs identify saved rows; request UUIDs deduplicate retries.

HTTP responses retain the existing envelope and no-store policy. Each text send calls Auth `getUser` once and one transactional RPC, with no `account_status` read or additional email-verification request. The transaction handles author data, idempotency, mute, quota and insertion, locking only that account. A normal successful text send inserts one message and updates one state row; the state row is created on first use. Image authorization and completion use the two-step flow below. Quota is not calculated by counting message history; no scheduled counter reset or quota polling is added. Reads/credentials validate claims; the SDK may contact Auth depending on signing mode. Existing comment authorization is unchanged.

JWT issuer validation prefers `NEXT_PUBLIC_SUPABASE_URL`, falling back to `SUPABASE_URL` only when the public URL is absent, matching shared account authentication. The server client still uses `SUPABASE_URL` first for network requests, allowing an internal address without rejecting publicly issued tokens.

After commit, return the saved result and use Next.js `after()` to publish once to each of the full and activity channels, with two-second timeouts and event/message ID deduplication. Stamps publish only to the full channel with history skipped. Failure produces sanitized logs without changing saved success. There is no outbox, database consumer or durable retry.

Subscribe before the initial snapshot and buffer events during the read. Subsequent subscriptions prefer native history recovery; fallback and lifecycle rules are specified above.

The composer accepts up to ten files through selection or paste, including files still processing; further additions fill remaining slots and identify excluded filenames. Processing is sequential in a browser Worker and makes no server requests. Previews have an upper-right remove action, and a single send button submits images followed by the optional text. Acceptance immediately moves every item into the pending list and clears that draft. Each image saves before the next image and the final text; later independent text submissions need not wait for this batch. Batch identity exists only in client memory, not in the API or database.

Image confirmation replaces the pending row and inserts its saved message in one state update. While the panel is visible, the sender keeps that image's existing Blob URL for display, copying and preview instead of immediately fetching the CDN copy. Upload jobs and receipts are released separately. These URLs belong to retained messages, survive duplicate acknowledgements and native recovery, and are revoked when their messages leave those collections through deletion, replacement after failed recovery, panel closure or account disposal. An upload completing after closure does not retain a confirmed preview. Reopened history and other clients use the persisted CDN URL; no wire or database fields change.

If an image fails, the failed image and all unattempted items in that submission remain individually retryable; unattempted items are described as not sent. A red circular exclamation beside each pending message retries only that item, preserving its request UUID and any completed upload. Error details use a native hover title and accessible description; the context menu can remove failed images or text without a server request. Explicit retries may change final order. Active items show a small loading indicator. HTTP acknowledgements update the visible window and are buffered during history loading so an older snapshot cannot erase them. Failures preserve newer drafts; quota, mute, authentication or network failures retain unsent content without automatic offline delivery. Each saved image and text counts separately toward the existing quota.

Closing retains all loaded records, scroll anchors and account drafts, unsubscribes full messages and releases recreatable media. Hiding does not disconnect; logout/account changes clear memory. Only the read cursor is persisted locally.

Business API fetches have a 30-second deadline; direct image PUTs have a five-minute deadline. A send timeout enters the existing failed/manual-retry state with the same request UUID, releasing the active queue instead of waiting indefinitely. A lost PUT response still uses the existing conditional PUT/HEAD recovery. No polling or automatic delivery retry is added.

The saved-message list is memoized so draft typing does not rerender it; an own live publication is applied once, while early confirmations during history loading retain their buffered reconciliation path.

The bounded deletion marker set protects against stale HTTP responses. Crossing 1,000 markers triggers one reconciliation, cancels stale reads and compacts to 500 markers after merging, avoiding a history request on every subsequent deletion. This is event-driven maintenance, not polling.

Sent and failed messages share the Copy action. Text copies its body; images copy an image representation, not URL text. The clipboard path uses PNG for compatibility, without requiring the browser to accept the source file's MIME type. This representation can be static for animation; it never changes uploaded image bytes or chat playback. Failed images and confirmed messages with an active local preview reuse their Blob; other saved images are fetched directly from the public CDN on demand. Copy adds no application API/database requests or storage writes. Success closes the menu silently; failures stay in the menu, with no generic notice above the composer.

Image menus also offer Save as. Where `showSaveFilePicker` is available, clicking opens the system save dialog before reading the image. Cancelling ends the action without reading or downloading. After selection, the original local Blob or CDN bytes are written to the selected file; a failed write aborts without starting a second download. Touch devices without this picker hand an original-format File to the native share sheet. If sharing is unavailable or activation has expired, open the existing image viewer for native long-press actions; cancellation does nothing. The browser and operating system determine available photo-library actions. Other browsers retain ordinary downloads, reusing local Blob URLs or releasing a temporary URL for CDN bytes. No image conversion, compression or reupload occurs; GIF/WebP/APNG animation is preserved. Suggested names are image.jpg/png/webp/gif. The app adds no saving/success/failure/retry interface, business API/database request or remote storage write. Both saved and failed message menus say Delete; deleting failed content only removes the local pending item.

Chat images and their viewer load with anonymous CORS from their first display, so subsequent copy/save fetches do not reuse an incompatible non-CORS browser-cache response. The fixed `?cors=1` URL version leaves existing pre-fix browser caches behind once; object keys and bytes do not change, and normal immutable HTTP caching remains enabled. Closing message menus returns focus to the message; sending a message/stamp or deleting content does not explicitly focus the composer. Enter submission preserves the input's existing focus. A long press does not also open the image viewer on release. On mobile, the opaque outer dialog covers the layout viewport while the inner conversation follows the visual viewport's height and offset, keeping the composer above the keyboard without revealing the underlying page. Autocomplete is disabled on the chat form/input, but native browser keyboard accessories remain under browser control.

Sent and pending images, including failures, open the shared large-image viewer. Pending images reuse the local Blob and unmount with their message, without a separate upload or business request. Message long-press keeps the chat actions; the large image permits the browser's native image menu. Touch pointers stay on the image, mouse capture starts only after dragging, and a native context-menu event ends the active gesture without preventing the browser action. Tapping the image does not close it; background clicks, the close button and Esc do. This shared viewer behavior also applies to card artwork. Native photo-saving choices remain browser/system behavior, not a custom album-writing feature.

## Setup

1. Disable chat, then apply `supabase/migrations/20261012155337_realtime_message_board.sql` through the normal migration workflow to an explicitly selected authorized target. Test on an isolated local stack first. It creates two private tables, service-only RPCs and a ten-minute retention job deleting at most 1,000 expired rows per run. It grants no actual account moderation permissions. This unpublished draft was simplified in place; if an earlier draft has been applied outside a disposable test target, use a forward migration rather than silently rewriting that target's history.
   Then apply `20261023205032_chat_sending_and_query_cleanup.sql`, deploy the matching app, and enable chat. This forward migration preserves messages/mutes, replaces quota fields, removes viewer `emailVerified`, and batches author reads. Do not keep the old chat build running against the updated RPCs.
2. Use **Centrifugo 6.9.7** with [the repository config](../deploy/chat/centrifugo.json). Browser SDK **centrifuge 5.7.4** and signing library **jose 6.2.12** remain pinned. Run one instance with the memory engine, with bounded in-memory history recovery and no PostgreSQL connection. Channel history is optional in [Centrifugo's channel model](https://centrifugal.dev/docs/server/channels).
3. Configure the Centrifugo process:
   - `CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY`: the same random secret as application `CHAT_TOKEN_SECRET`, at least 32 bytes.
   - `CENTRIFUGO_HTTP_API_KEY`: the same value as application `CHAT_PUBLISH_API_KEY`, separate from the signing secret.
   - `CENTRIFUGO_CLIENT_ALLOWED_ORIGINS`: exact space-separated site origins, without wildcards.
4. Run `centrifugo checkconfig --config deploy/chat/centrifugo.json`, then start it with the host's existing service manager. Both listeners bind loopback. Proxy only port 8000's `/connection/websocket` through WSS with WebSocket upgrade and an idle timeout longer than the heartbeat. Port 9000 serves the private publish API, health and metrics; never expose it through the public proxy. The admin UI remains disabled.
5. Configure the application:
   - `CHAT_TOKEN_SECRET` and `CHAT_WEBSOCKET_URL`; production requires WSS, local development permits `ws://localhost:8000/connection/websocket`.
   - `CHAT_PUBLISH_URL=http://127.0.0.1:9000/api/publish` and `CHAT_PUBLISH_API_KEY`, server-only.
   - After target checks pass, enable runtime `CHAT_ENABLED=true` and rebuild with `NEXT_PUBLIC_CHAT_ENABLED=true`. Both flags default false.

Set `CHAT_WEBSOCKET_URL` at build and runtime: the enabled build adds its WebSocket origin to the existing CSP report-only connect policy. Secrets remain server-only and are never logged. Per-client queued output is bounded at 2 MiB; slow clients exceeding it disconnect. Compression remains off. Neither this queue setting nor local smoke measurements establish hosting capacity.

## Checks and operations

- `npm run test:chat`: authorization, bounded parsing, token expiry, post-response publication failures, UUID retries, deadlines, draft cleanup, pagination, lifecycle races and request counts without external services. CI runs this suite and all six chat SQL files (`realtime_message_board.sql`, `chat_images.sql`, `chat_stamps.sql`, `chat_rooms.sql`, `chat_reading.sql`, `chat_activity.sql`) in the existing disposable database job alongside account tests.
- `npm run test:supabase`: SQL permissions, removal of email-status reads, mute/20-message quota, retries, deletion, pagination and retention on an isolated migrated local stack.
- Set `CHAT_TEST_CENTRIFUGO` to the pinned executable and run `npm run test:chat:realtime`. It uses temporary keys and its own loopback process to exercise 200 clients, publication deduplication, native message recovery after reconnect/reopen, exclusion of ephemeral stamps from replay and denied client publishing. It reports local latency and payload bytes, not TLS bandwidth or production capacity.
- Also set `CHAT_TEST_DB_CONTAINER` to a fresh migrated disposable `supabase_db_hhwx-chat-verify-<suffix>` container for `npm run test:chat:postgres`. Production route handlers, publisher, SQL RPCs, ChatSession and the real SDK/server exercise concurrent sends/mutes, rollback, failed publication followed by database reconciliation, stale-deletion recovery and server restart. Auth identity is synthetic and RPC transport uses local psql, so this does not prove Auth/PostgREST integration. The script requires an empty chat table, rejects the ordinary local container, uses no application credentials and removes its own fixtures/process.
- Run relevant typecheck, lint, build and localization checks. Evidence and boundaries are in the [validation record](realtime-message-board-validation.md).

Monitor publication failures and reconnect/history request counts using existing logs and metrics. There is no durable queue or backlog to drain. This release does not guarantee complete offline delivery; older retained messages remain available through pagination.

Rollback disables the runtime flag and rebuilds without the launcher. Existing credentials expire within one hour, never later than their authorizing access token; stop Centrifugo for immediate disconnection. Preserve saved data rather than dropping tables. Retention continues unless separately changed.

Before deployment, verify private API isolation/key wiring, the public WSS path and real account UI states. Hardware model, architecture, CPU credits and upgrade decisions are deployment context, not acceptance requirements.

## Image integration and rollout

Apply forward migration `20261024065425_chat_images.sql`. The text RPC signature stays compatible; new image/authorization RPCs are service-role-only. History returns metadata in its existing query; UUIDs, pagination indexes and cleanup remain unchanged. Configure image uploads after deploying the image-aware app; older open pages need a refresh to render images.

Set server-only `CHAT_R2_ENDPOINT`, `CHAT_R2_BUCKET` (default `cdn`), `CHAT_R2_ACCESS_KEY_ID`, and `CHAT_R2_SECRET_ACCESS_KEY` with dedicated read/write credentials restricted to the public bucket. Browser reads reuse `NEXT_PUBLIC_SITE_ASSET_CDN_BASE_URL`. Server HEAD uses the private S3 API; upload/download bodies bypass the website server. Receipts reuse CHAT_TOKEN_SECRET with a separate issuer/audience from WebSocket tokens.

Merge these settings into the explicitly authorized public bucket, preserving existing rules:

- CORS: real website origins, methods PUT and GET, allowed headers Content-Type, Cache-Control and If-None-Match, optionally MaxAgeSeconds 3600. The browser produces signed Content-Length automatically; JS must not set this forbidden header. Public CDN GET responses must also permit the website origin so the image-copy action can read pixels; ordinary image display alone does not establish this permission.
- Lifecycle: prefix `user/images/temporary/`, Expiration Days 31. R2 cleanup is asynchronous, not precise to the second.
- Object headers: `Cache-Control: public, max-age=31536000, immutable`; conditional writes prevent overwriting an existing key. Public-domain cache rules should honor this policy.

POST `/api/chat/images/upload` accepts clientRequestId and metadata, checks mute/upload allowance in one RPC and returns a PUT URL, required headers and a completion receipt. POST `/api/chat/images` accepts the same ID and receipt, verifies HEAD and performs deduplication, mute/shared-quota checks and save in one RPC, then publishes. After a lost PUT response, retry can receive 412 and proceed to HEAD verification. Commit failures reuse the uploaded object. Expired pending uploads must be removed and selected again.

Ordinary files retain their bytes and embedded metadata. Oversized stills encode to WebP (or verified PNG output when unsupported). Animations are never transcoded. No extra thumbnail/original, upload table, bucket scan or client polling is added.

Before rollout, verify real browser PUT/CORS, signed length/type enforcement, conditional overwrite rejection and public CDN headers against the target bucket. SDK signing tests and controlled browser responses cannot replace these checks. Disable uploads before rollback; retain database fields. A text-only client cannot display saved images.

Stamp rollout additionally requires `20261024124049_chat_stamps.sql` before the matching app. The room-wide five-per-second stamp gate assumes one Next.js publishing process, not one gate per worker or replica. Common assets must already be published by assets-builder. Stamp events never enter the message table, history, replay or retry path.

### R2 dashboard configuration

In Cloudflare's R2 dashboard, select the existing public CDN bucket. Under **Settings > CORS policy**, preserve existing rules and add the site's exact origins with `PUT` and `GET`, allowed headers `Content-Type`, `Cache-Control`, and `If-None-Match`, and optionally `MaxAgeSeconds: 3600`. See [CORS configuration](https://developers.cloudflare.com/r2/buckets/cors/). Test a new object URL to avoid old cached CORS headers.

Under **Settings > Object lifecycle rules**, add an enabled rule for the exact prefix `user/images/temporary/`, deleting objects after **31 days**. Preserve other rules. An empty prefix would delete unrelated bucket objects. No storage-class transition or application-side object scan is needed. See [object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).

Use an existing **Object Read & Write** credential authorized for the public bucket, or create one under **R2 > Manage API tokens** if none exists. Put its **Access Key ID** and **Secret Access Key** in server-only `CHAT_R2_ACCESS_KEY_ID` and `CHAT_R2_SECRET_ACCESS_KEY`; these are S3 credentials, not the API token string. Set `CHAT_R2_ENDPOINT` to the account's S3 endpoint and `CHAT_R2_BUCKET` to the bucket name. A separate token and bucket-administration permission are not required for normal image operations. See [S3 setup](https://developers.cloudflare.com/r2/get-started/s3/).

When the endpoint was present at build time, adding credentials only requires restarting the app. Changing the endpoint also requires rebuilding its browser CSP. Keep the existing public custom domain; no `r2.dev` domain is needed. Verify a real browser upload, display, copy, original-format save and conditional overwrite rejection before declaring image sending available.

## Room scope and bounded resources (2026-10-25)

Apply `20261024162353_chat_rooms_and_bounded_retention.sql` before the matching application. It adds `messages.room_id NOT NULL DEFAULT 'main'`, preserves every existing message field, and replaces the visible-history index with `(room_id, created_at DESC, id DESC) WHERE deleted_at IS NULL`. Keep the independent retention index for cleanup across rooms. Room identifiers use 1–64 lowercase ASCII letters/digits, underscores or hyphens, starting with a letter/digit. There is no room metadata table yet.

Public connection, history, text/image, upload and stamp endpoints accept the optional `roomId` query parameter; absent means `main`, and only `main` is currently open. Unknown rooms are rejected before chat RPCs or R2 work. Private read/save/delete RPCs receive `p_room_id`, defaulting to `main` for old callers. Their old signatures are replaced, not retained as ambiguous overloads, and the new signatures remain service-role-only. Deletes match both message UUID and room. The existing `(user_id, client_request_id)` uniqueness remains account-wide; a retry in a different room conflicts even for a deleted message.

The server signs only the allowed room: a `chat_activity:<roomId>` connection subscription and a `chat:<roomId>` client-subscription token. Both validate subject, issuer, audience and expiry. Browsers cannot publish; the channel limit is two.

Cleanup materializes at most 1,000 expired IDs once, then deletes only those rows with `DELETE USING`, retaining `FOR UPDATE SKIP LOCKED`. The ten-minute schedule and thirty-day retention remain unchanged; there is no per-room cleanup job or additional database round trip. Roll back the application without dropping the room column or restoring old RPC signatures; omitted room arguments continue to resolve to `main`.

Sound effects and animation atlases retain only in-flight load records, removed on success or failure. No application cache keeps completed audio bytes, decoded buffers or atlas image objects. Audio preloading warms the browser HTTP cache without decoding or opening an AudioContext; playback fetches through the same HTTP cache and decodes on demand. Playing sources and visible animations retain only what they use; sound completion/cancellation disconnects the source and clears its buffer. Common-image preloads no longer remain in a global array. The browser controls its own memory/disk HTTP cache and garbage-collection timing. Metadata/catalog caches, pending image drafts, comment/card single-sound behavior and independent stamp cancellation remain unchanged.

The shared sound context resumes interrupted as well as suspended states and replaces a closed context. Independent chat audio claims its audio session before attempting resumption, and waits for asynchronous recovery only until its current effect's start deadline or cancellation. Cached audio may finish loading first without being discarded. A browser waiting for a new playback gesture does not queue expired stamp audio for later. No persistent audio cache or music-player policy change is introduced.

Early unmute does not broadcast a state update: an already-open client may wait until credential refresh or the cached deadline. This is an accepted product limitation, not a pending fix.

## Current database layout and request costs

The five chat migrations leave two private tables. This describes their final shape, not the superseded initial three-second quota or email-verification implementation.

| Table | Columns | Purpose |
| --- | --- | --- |
| `chat_private.messages` | `id uuid`, `user_id uuid`, `client_request_id uuid`, `room_id text`, `created_at timestamptz`, `deleted_at timestamptz?` | Message identity, author, room, request deduplication, cursor and retention |
| Same table | `content text?` | Text/emoji shortcode body, at most 1,000 code points |
| Same table | `image_key text?`, `image_width integer?`, `image_height integer?`, `image_bytes integer?`, `image_content_type text?` | Image metadata only; file bytes stay in R2; hash is derived from the key |
| `chat_private.user_state` | `user_id uuid`, `muted_until timestamptz?`, `moderated_by uuid?`, `moderated_at timestamptz?` | One row per account that sends or is moderated |
| Same table | `send_window_started_at timestamptz?`, `send_count smallint` | Shared text/image fixed-window quota |
| Same table | `upload_window_started_at timestamptz?`, `upload_count smallint` | Image upload authorization quota, separate from saved messages |
| Same table | `stamp_window_started_at timestamptz?`, `stamp_count smallint` | Independent ephemeral stamp quota |

Message constraints permit exactly a live text body, a live image, or a tombstone whose content and image columns are null. Image metadata is limited to supported MIME types, 20 MiB, dimensions 1–16,383 with at most 16,777,216 total pixels and an actor/request-bound object key. Browser processing supplies pixel metadata; server HEAD checks stored length/type/cache headers, not decoded pixels. Counters are 0–20. User IDs reference existing profiles with cascading deletion; deleting a moderator sets `moderated_by` null.

There are four message indexes: primary UUID, unique `(user_id,client_request_id)`, visible `(room_id,created_at DESC,id DESC)`, and retention `created_at`. User state has its primary user ID plus a partial `moderated_by` index for its foreign key. The existing compound unique index already supports lookup by message author; no extra author-only index is needed.

Both private tables have RLS enabled and no client schema/table grants. Eleven public chat RPCs are invoker functions restricted to service_role. Existing profiles and user_roles supply author presentation and moderator authorization. There is no chat-specific profile, upload, online-status, receipt, stamp-history or outbox table.

| Action | Business RPCs | Normal database writes | R2 operations |
| --- | --- | --- | --- |
| Login and activity baseline | Viewer + activity: 2 | None | None |
| First open / unavailable recovery | Combined page and activity: 1 | None | Cached/CDN assets on demand |
| Successful recovery / reopen | 0 | None | Cached/CDN assets on demand |
| Receive publication | 0 | None | Only uncached media, directly from CDN |
| Send text | 1 | Insert message + update account counter | None |
| Send image | Upload authorization + save: 2 | Update upload counter, then insert message + update send counter | Browser PUT + server HEAD; CDN serves viewers |
| Send stamp | 1 | Update stamp counter only | Cached private master validation; media goes directly to viewers |
| Delete message | 1 | Clear body/image fields + set deleted_at | No immediate object delete/cache purge |
| Set/clear mute | 1 | Upsert one state row | None |
| Renew connection token | 1 | None | None |

RPC counts are network calls, not the number of SQL statements: writes also perform indexed account/state/request checks inside their transaction. First use inserts the account state row once. Every text/stamp write performs one Auth getUser request; image authorization and completion each perform one. Reads/connection issuance use getClaims; asymmetric keys allow cached local verification, while symmetric signing may require Auth requests. No chat operation separately queries email verification.

The room's five-stamp-per-second gate limits broadcasts, not incoming HTTP/Auth/database work: an otherwise accepted event dropped by the room gate still spends its account quota. This preserves the agreed accounting. Per-account row locks do not serialize every sender behind one room row.

Credential bootstrap failures back off up to 30 seconds; failed snapshot reads retry independently without interrupting a healthy connection. SDK handles network reconnects; terminal disconnects stop automatic retries, while an explicit reopen may connect again. Hiding does not cancel the connection, and healthy sessions do not poll.

