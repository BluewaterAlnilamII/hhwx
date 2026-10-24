# Realtime message board execution plan

中文说明见 [realtime-message-board-plan.zh-CN.md](realtime-message-board-plan.zh-CN.md).

2026-10-24: local implementation is authorized. This scope supersedes the three-second cooldown, single pending send and chat email-status queries. Production operations are not authorized. See [integration](realtime-message-board.md) and [validation](realtime-message-board-validation.md).

## Approved audit follow-up (2026-10-25)

Implemented bounded retention and explicit room context. The later approved follow-up stops retrying terminal SDK disconnections and removes the temporary 32 MiB audio cache and persistent atlas-image cache: only in-flight loads are shared, with browser HTTP caching retained. Migration `20261024162353_chat_rooms_and_bounded_retention.sql` adds the default `main` room and scoped index/RPCs; current HTTP access still allows only `main`. Connection tokens, client filtering and text/image/delete/stamp broadcasts use the selected channel. Keep account-wide mutes/quotas and the shared publisher gate. No room switcher, room metadata table, immediate-unmute event, extra RPC round trip, polling or R2 operation is added. See the integration document for upgrade/rollback compatibility and the validation record for evidence. The prior unmute-sync suggestion is explicitly declined.

## Scope and references

- Keep site login, registration, session restoration and legacy-account compatibility unchanged. Chat requires a valid non-anonymous identity, without a separate email-verification condition/query.
- Hide the launcher while signed out or authentication is unresolved. Guests load no chat UI/SDK and request no history, credentials or socket. Connect only while an authenticated user's panel is open and the page visible. Mutes retain reading and deletion of one's own messages.
- Reuse comment counting/truncation from `comments/comment-contract.ts`, existing server identity validation and `useChatSession` lifecycle, Toolbar, Radix Dialog, theme and avatar caches.
- Text with the existing comment emoji picker/rendering, author deletion and moderator deletion/mutes. Independent image messages are supported. Ephemeral stamps are supported. No editing, reactions, member lists or read receipts.
- Hardware is deployment context, not an acceptance criterion. The frontend adds Radix Context Menu, aligned with the existing Dialog's focus/dismissal dependencies; no new services, Redis or other repositories.

## Accepted frontend design

- Keep only the title and close action in the header. No generic error strip or manual reconnect action above the composer. Failed saved messages retain their own retry icon; transient stamp failures add no notice. Quota/mute feedback remains tied to sending restrictions.
- Others' bubbles appear on the left with the existing avatar and comment UID symbol following the username. Own bubbles appear on the right without an avatar, username or UID. Group consecutive messages by author.
- Center a shared time separator at the start, after a five-minute gap or on a date change. Use time alone today, yesterday plus time, and a date for older messages.
- Copy, Save as for images, permitted deletion and moderation use the existing right-click/long-press menu, also available with Shift+F10. Copy keeps the PNG clipboard representation without modifying source files. Save as opens the system save picker when supported, before reading original bytes; cancellation ends the action. Unsupported browsers retain ordinary downloads. No transcoding or saving/success/failure/retry UI is added. Failed images use their local Blob, and saved images read the public CDN directly. Saving a file on mobile does not guarantee photo-library placement. Both sent and failed messages use the Delete label; failed-message deletion is local, while saved-message deletion uses the existing confirmation and API. Do not add an action-notice row above the composer.
- Sent and pending/failed images open the same viewer. Keep chat actions on message long-press and allow the native browser image menu in the viewer. Image taps and drag release keep it open; background clicks, close and Esc dismiss it. Preserve pinch/wheel zoom and local Blob reuse without additional business requests.
- Show the floating latest-message arrow only when away from the bottom or the bounded history window no longer contains the latest messages. Keep scroll position while reading older content.
- Use one composer row: plus on the left; `输入消息...` placeholder; emoji and stamp controls inside the input at its end; send on the right. The plus menu opens image selection and a local preview. The stamp control sends an independent ephemeral effect, described below.
- Reuse comment emoji selection, cursor replacement, shortcode storage and inline/jumbo rendering. Selecting an emoji edits the draft and does not send. Chat preloads the shared stamp catalog on opening; individual media stays on demand. Stamps are separate transient animations, never text/history entries.
- Grow multiline input to its height limit; keep IME, whitespace/counting, sequential requests, independent pending messages and retry behavior. Only show the character counter near the limit.
- Support desktop dialogs, mobile viewport/keyboard resizing, theme roles and accessible names/focus. This UI scope adds no database or authentication queries and needs no schema migration.

## Input and sending

1. Count raw Unicode code points including whitespace, capped at 1,000. Trim on submission; ignore whitespace-only input. IME selection must not send; Enter sends, Shift+Enter inserts a line.
2. Each submission immediately clears the composer and appends a pending message with its own request UUID. Further typing/submission remains available.
3. HTTP sends run sequentially. WebSocket readiness, reconnection, history synchronization and another outstanding send do not lock the composer.
4. Each message displays queued/sending/failed state. API fetches time out after 30 seconds and image PUTs after five minutes, releasing the queue into existing manual-retry behavior. Retry keeps its request ID and never replaces a newer draft. A new message with identical text gets a new ID.
5. Merge HTTP acknowledgements and publications by UUID. HTTP success remains visible without the socket, and an older history response cannot erase a newly confirmed message.
6. Known quota, mute, authentication/network failures stop further ineffective queued requests and retain them for manual retry. No durable offline outbox or unlimited automatic retries.

## Quota and database

- Each account has 20 successful new sends per 60-second window beginning with its first save. Devices/tabs share quota; bursts are allowed, including at fixed-window boundaries.
- Retries spend no additional quota; failed saves spend nothing; deletion does not refund; a saved message counts even if publication fails. Display the returned retry time locally without polling.
- CLI-created forward migration `20261023205032_chat_sending_and_query_cleanup.sql` replaces `user_state.next_send_at` with a window start/counter, preserving messages and mutes. The existing `nextSendAt` response becomes the exhausted window's deadline, otherwise null.
- One Auth `getUser` call followed by one save RPC. Lock only the actor's state, check idempotency/mute/quota, insert and update quota in the same transaction. Existing state rows are not repeatedly inserted.
- No `account_status` reads, history counting for quota, scheduled reset or separate quota request. Read author existence/display fields together, read viewer state once, and join authors after limiting the history page.
- Keep two private tables, service-only invoker RPCs, RLS/grants, request UUID uniqueness and cursor/retention indexes. Browser roles cannot access tables/RPCs directly.
- Deletion/moderation still check ownership/roles in SQL; removing email queries does not remove these business permissions.

## Synchronization and lifecycle

- Subscribe before fetching the latest 50 messages; buffer concurrent publications. Reopen, actual reconnect and revisibility fetch one page. Normal credential renewal does not reconnect or reread history.
- Sending is independent of history. Closing disconnects/clears history while retaining account-local text/image drafts and preparation; submitted requests finish normally. Hiding disconnects while retaining the window; logout/account change disposes drafts/pending sends, terminates preparation, revokes previews, stops unsent requests and ignores old responses. Drafts remain memory-only.
- Keep a 300-message window, preserve the reader's scroll position and provide pagination/jump-to-latest. When newer messages evict old rows, move the older-page cursor to the first retained row without an extra read. Known deletes reject late stale responses; crossing 1,000 markers reconciles once and compacts to 500, without per-delete polling.
- Isolate saved-message rendering from draft updates with a memoized list and stable callbacks. Apply an own live publication once; preserve early-confirmation buffering during history loading.
- Keep message/request UUIDs, no business sequence counter. Events contain required IDs, text, timestamps and compact author fields; receiving does not fetch profiles or permissions.
- Return the saved result after commit, then publish once to Centrifugo's private HTTP API using Next.js `after()`, with a two-second timeout. The response does not wait for publishing. Failure logs remain; no outbox, consumer, durable publication retry or polling for gaps.
- A connected peer can miss a committed create/delete until reopen, reconnect or an explicit history read. No per-recipient acknowledgement, final-message gap detection or strict global deletion guarantee.
- Retain 30 days, prune up to 1,000 expired rows every ten minutes, and do not broadcast natural expiry individually.
- Keep Centrifugo 6.9.7 memory engine, SDK 5.7.4 and jose 6.2.12. No database credentials or history replay; SDK heartbeats/reconnection remain. Connection JWTs last at most an hour and never outlive the authorizing access token.

## Verification and rollout

- CI runs the chat JavaScript suite and both chat SQL suites in the existing application/database jobs; it adds no new service or database job. Focused regressions cover window cursors, timeout/retry, attachment ownership, own-event merging and response-before-publication behavior.

- Verify zero guest chat requests, lazy loading, logout/account isolation, consecutive submissions, per-message retry, IME/count/paste and saving without WebSocket.
- Verify quota, concurrency, window expiry, no deletion refunds, rollback, role grants, chat working with account-status SELECT revoked and the paginated author-join plan.
- Run chat/auth tests, isolated migration replay and applicable SQL tests, Advisors, real PostgreSQL/Centrifugo integration, typecheck, scoped lint, i18n and build; exercise desktop/mobile browser flows.
- Update paired integration, plan, validation, Supabase setup and account documentation for the changed chat status source.
- Production rollout needs separate authorization. Disable chat while applying the baseline/forward migration and matching app, then enable it. The viewer no longer returns emailVerified; old chat builds must not be mixed with new RPCs. Roll back by disabling chat, preserving saved data rather than dropping tables.

## Image extension (2026-10-24)

- Authorized local implementation: one image per message, public CDN reads and browser Presigned PUT uploads under `user/images/temporary/`. Images render independently without text-bubble padding.
- Final limit: 20 MiB (UI label 20 MB), 4096 pixels per side. Ordinary static JPEG/PNG/WebP remain byte-identical. Only oversized static images enter a Worker for proportional resizing/encoding with transparency preserved. GIF, animated WebP and APNG pass through within limits; oversized animations are rejected without transcoding.
- Selection/paste appends up to ten files, including processing items; overflow names are reported. Sequential Worker processing and previews make no server requests. Each preview has an upper-right remove action. One submit accepts the images and optional text together, clearing only the accepted draft; images save in preview order, followed by that text. Separate later text remains independent of image upload.
- On image failure, retain that item and unattempted items in its submission with per-item red-exclamation retry and contextual removal. Retry acts only on the selected item, so manual retries can change order. Successful PUTs are reused for commit retries. No persistent batch record, new endpoint or extra request is needed. Logout releases resources; pending uploads do not survive reload.
- Keep the two existing tables: add image key/type/dimensions/bytes to messages and upload-window/count to user state. Upload authorization allows 20 per account per 60 seconds; successful text/image saves share the existing 20-message allowance. No history COUNT for limiting.
- Normal success: two business RPCs, one R2 PUT, one HEAD; Auth calls are separate. HEAD checks stored byte length/type/cache headers, not decoded pixels. Sign length/type/cache and conditional-write headers. Actual R2 length rejection and CORS require target verification.
- Public image URLs have no download credential expiry; use one-year immutable caching. A prefix-scoped 31-day lifecycle reclaims source files without bucket scans, per-message object deletes or cache purges. Upload URLs last one hour; completion receipts last at most 23 hours, and completion checks object age to protect the 30-day message window.
- Reuse ImageViewer with zoom up to native image resolution. Inline images retain aspect ratio, never upscale, reserve layout size and lazy-load. Inline/viewer use one object; CSS shrinking does not reduce downloaded bytes.
- References: existing chat identity/save/delete and comment author display, ImageViewer and LoadingImage. Server-only AWS S3 SDK handles writes with dedicated credentials, preserving game readers. No production configuration or deployment is authorized.

## Stamp delivery and playback (2026-10-24)

- Scope: complete HTTP authorization, independent quota, Centrifugo delivery, client playback and fixed CDN resources. Local validation must exercise the actual server and two clients; a visual preview alone does not establish delivery.
- Reuse comment catalog/region selection and its 96×64 / 114×76 image frames. The complete image/nameplate/voice-badge group is placed randomly inside the visible message viewport, independently of scrolling. Resize observers keep its bounds inside the viewport; scale down only when the viewport cannot fit it.
- The public UID maps remainders 1/2/3/4/0 to P1/P2/P3/P4/P5. Read the already-loaded account profile; no per-stamp identity fetch. Truncate the single-line name.
- Show the nameplate immediately, leaving the image region blank until the image or atlas arrives. Scale in over 200 ms with the game's quadratic ease-out, begin scaling out at 3000 ms and remove at 3200 ms. Loading never restarts that clock. Dynamic media plays once; cached comment animation metadata retains its looping behavior. Reduced motion skips scaling and uses the existing static animation treatment.
- One active visual per sender and at most five total. Replace the sender's previous visual/audio; a sixth sender replaces the oldest visible group. No playback queue or receiver rate limiter. Late asynchronous completion cannot restore a removed effect.
- Ordinary stamps use `SE_UI_STUMP`; voiced and changed stamps use their own audio without layering the common sound. Only normal voiced stamps get the voice badge. Natural visual expiry permits the voice tail to finish. Replacement, eviction, closing, hiding the page and logout cancel the appropriate audio.
- Reuse the Web Audio context; preload encoded audio into the browser HTTP cache and decode only for playback, without retaining completed buffers. Opening chat preloads three common assets; hover/focus warms only that stamp's voice, while the existing picker warms animation media. Browser audio denial leaves the visuals usable. Preserve the comment player's single-sound behavior.
- Send: POST `/api/chat/stamps` validates Auth once and resolves only a region/id/kind against the cached private master. One `authorize_chat_stamp` RPC reads the existing profile, locks the account state, checks mute and spends the independent 20-per-60-second fixed-window quota. It adds two columns to `chat_private.user_state`, no table/history/outbox. The author fields come from that same RPC; no separate profile or email verification query.
- After authorization, the shared publishing process admits at most five stamp events in a rolling second. Excess is silently discarded, still spending account quota. The HTTP response does not reveal room suppression. There is no queue, retry or replay. This memory gate requires one Next.js publishing process; move it into a shared publisher before adding application replicas/workers.
- Events contain only type/event UUID, user UUID/public UID/name and stamp region/id/kind. Receivers resolve media through the shared comment catalog cache; no per-event profile/permission/history reads. Sender plays immediately and suppresses its own echo. Transient failures add no notice or failed-stamp history row. Reconnect only reloads saved text/images.
- Common badge/nameplate use `bandori/resources/atlases/menu-atlas/{icon_voice_stamp,label_round_white}.png`; the common sound uses `bandori/resources/audio/common/SE_UI_STUMP.wav`. URLs come from the existing CDN helper. APK extraction supplies the two PNGs; the sound is from JP `sound/common` → `LiveMenu.acb`, not the APK. Builder retains source/hash reports locally, skips identical objects and refuses changed bytes at existing keys. No public manifest or periodic sync is added.
- Rollout order: publish the two new fixed resources (reuse the existing badge), apply `20261024124049_chat_stamps.sql`, then deploy the matching app with the existing chat flags. This task authorizes fixed resource publication and local implementation/testing, not website or remote database deployment.
