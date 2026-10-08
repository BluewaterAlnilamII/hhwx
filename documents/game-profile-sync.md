# CN profile import with manual login confirmation

Users choose a bound game UID, accept the notice, and click sync. The browser reserves a blank window during that click, then requests an official Bilibili login link. Users sign in on the official page and click **I've signed in** in HHWX. Android and iOS roles are checked automatically; only the matching UID is imported.

## Request flow

Normally the browser makes two requests to `POST /api/account/game-profiles/sync`:

| Action | JSON fields | Success data |
| --- | --- | --- |
| `start` | `action`, `gameUid` | `taskId`, `gameUid`, `status=waiting`, `loginUrl`, `expiresIn` |
| `confirm` | `action`, `gameUid`, `taskId` | Saved game-profile summary |

All replies use the existing success/error envelope and `Cache-Control: no-store`. Unknown fields, client-supplied owners, passwords, cookies and tokens are rejected. The browser receives neither the Bilibili/game credentials nor the raw suite. The official TV-protocol login page may display its own TV branding; HHWX does not handle its password or verification fields.

1. **Start:** HHWX verifies the account and email and checks the target binding once. Its server forwards the authenticated owner and UID to the private user-fetcher. The private service creates the official login request and stores one in-memory waiting record per owner. A new start replaces that owner's idle record; an executing record cannot be replaced.
2. **Wait:** There is no browser, HHWX-server, user-fetcher or database status polling. Each waiting record expires 300 seconds after creation, independently of the browser; retries do not extend it. The official login code may expire earlier. The browser has one local expiry timer for the interface; the backend remains authoritative. Closing the official window does not trigger an unreliable cross-origin window check. The waiting UID only shows "I've signed in" and "Cancel sync". Cancel clears the pending UI without an API request or token claim; the backend record retains its original expiry. Starting again after cancellation replaces the idle record.
3. **Confirm:** HHWX verifies the request's signed session identity, without rereading account/email/binding tables. The private service checks record ownership, UID, expiry and duplicate execution. It then tries to acquire one of four fetch slots. If full, it returns `429 LOGIN_TASK_BUSY` before contacting Bilibili, and preserves the idle record until its original expiry. There is no queue.
4. **Fetch:** An admitted request checks the official login result once. If login is incomplete, it returns `409 LOGIN_NOT_COMPLETED`, releases the slot and preserves the idle record. Otherwise it claims and exchanges the token, checks Android/iOS roles against the selected UID, then strictly decodes suite and self-profile. The existing channel-account exclusion, request-ID checks and response-size limits apply. Unknown session/version state stops the operation instead of guessing or retrying a game chain.
5. **Save:** After the private result arrives, HHWX reads the private card master and uses the existing normalization, gzip/SHA storage and profile/title RPCs. The upsert checks current binding ownership after taking the existing transaction locks. Unbind and ownership transfer take the same UID lock: an earlier save is removed by unbind; a later save rejects the previous owner. It returns the saved row directly. Required title/effect merge failures return failure; an earlier successful upsert is not rolled back. The next sync uses the existing idempotent upsert.
6. **Finish:** The UI updates its profile list from the returned summary without rereading account/profile lists. Other failures clear the pending UI and show the error. Tokens, channel keys and session headers are cleared/closed when the private operation exits; there is no result cache or save-only retry. A private fetch slot remains occupied through response sending and is released in `finally`, including disconnection. Idle-record expiry does not cancel an active operation or release its slot prematurely.

Private fetch work has a 120-second operation deadline and bounded individual network requests. The internal adapter permits 150 seconds for work plus response sending; the browser confirmation request permits 180 seconds including saving. Reverse-proxy timeout configuration must support this bounded request. Waiting records are cleaned in the existing HTTP server lifecycle, without per-record timer threads or a database cleanup job.

The consent checkbox defaults off. Only the checkbox itself changes consent. The manual confirmation button also requires consent. While waiting, that UID cannot be resynced or unbound, and another UID cannot start a login task. An active confirmation displays the syncing label and disables both confirmation and cancellation. No extra login-opening or save-retry button is used.

## Errors and task handling

The backend returns controlled error codes, which Web maps to localized messages. Recognized confirmation
errors are no longer replaced by the generic sync failure. `LOGIN_NOT_COMPLETED`, `LOGIN_TASK_ACTIVE`
and `LOGIN_TASK_BUSY` preserve the pending confirmation task; other terminal errors end the flow.
`LOGIN_ACCOUNT_BUSY` requires waiting for the other sync to finish before starting a new sync.
`LOGIN_TASK_NOT_FOUND` means the task is unavailable, not necessarily expired. The message for
`LOGIN_GAME_MAINTENANCE` says the game service is unavailable; an upstream status alone does not prove maintenance.

The following classifications retain all existing network, concurrency, size and lifecycle limits:

| Code | HTTP | English message |
| --- | --- | --- |
| `LOGIN_UPSTREAM_TIMEOUT` | 502 | The official service timed out; start a new sync later |
| `LOGIN_UPSTREAM_CONNECTION_FAILED` | 502 | Unable to connect to the official service; start a new sync later |
| `LOGIN_OPERATION_TIMEOUT` | 410 | This sync took too long; start a new sync later |
| `LOGIN_DATA_INVALID` | 502 | The retrieved game data failed validation; sync cannot be completed |
| `LOGIN_RESPONSE_TOO_LARGE` | 502 | The returned data exceeds the sync service’s processing limit; sync is currently unavailable |

Individual upstream timeouts are distinct from the whole operation deadline. A recognized network timeout
is classified as `LOGIN_OPERATION_TIMEOUT` when the operation budget is exhausted, preserving the underlying
exception type. Non-timeout failures retain their classification even after the deadline. `LOGIN_TASK_EXPIRED` remains
the code for expired waiting or invalid official login results. Unclassified failures keep
`LOGIN_UPSTREAM_UNAVAILABLE` / `LOGIN_VERIFICATION_FAILED`; elapsed time is not used to guess a cause.
Local schema-file failures are not classified as invalid player data. `TRACKER_SERVICE_FAILED` no longer
promises that the original task can be retried. Shared messages live in `messages/{zh-CN,en}/errors.json`;
popup, sync-specific invalid JSON and the three `TRACKER_SERVICE_*` sync messages live in
`messages/{zh-CN,en}/bandori.json`. Both start and confirm use these sync messages. Binding verification
and other flows use the shared messages, which do not tell users to start a new sync.

Diagnostics record codes and necessary context, not prose or upstream bodies. A successful start is not
a completed sync, and a successful backend confirmation is not a successful Web save. Both backend and
Web must support the new codes; an older Web build still shows generic failures during the rollout.

## Rollout and compatibility

- Keep `NEXT_PUBLIC_GAME_PROFILE_SYNC_ENABLED=false` until the matching backend and database migration are deployed. This is a build-time flag for both UI and API.
- Apply `20261001040725_snapshot_binding_lock_check.sql` and `20261001064438_lock_game_uid_unbind.sql` before enabling the Web build. They correct the upsert lock/check order and serialize unbind with save/transfer, preserving service-only grants and the schema.
- Deploy the private backend first, then the matching Web build. The internal endpoint is `/internal/hhwx-user-fetcher/user-snapshot` with `start/confirm`. The interim `/snapshot-login` endpoint and `poll/result/cancel` actions are retired. The old UID-only internal body remains unavailable; it cannot fall back to bot credentials. Old Web bodies without an action are rejected.
- Private connectivity and backend credentials remain server-only. SDK signing configuration stays in the private backend. No new runtime dependency, queue, table or RLS policy is introduced.
- Turning the public flag off requires a rebuild. Withholding the private SDK configuration disables the private snapshot capability.

The 2026-09-30 real Android login/suite verification is historical protocol evidence, not a validation of this changed HTTP/UI workflow. Current offline and browser checks are reported separately; mock browser tests do not prove live Bilibili or production database behavior.
