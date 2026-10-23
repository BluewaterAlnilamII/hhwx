# Account Registration and Management Flow

中文说明见 [account-auth-flow.zh-CN.md](account-auth-flow.zh-CN.md).

HHWX uses Supabase's native email OTPs. The local changes require a coordinated Auth configuration and database cutover before deployment; the repository alone does not update the hosted project.

## Account state and trust boundaries

Supabase owns email ownership, credentials and sessions. `app_metadata.hhwx_registration` is a server-written completion marker, not another email-verification mechanism. A complete account requires both native `email_confirmed_at` and this marker. User-editable metadata cannot grant permissions. `account_status.email_verified_at` remains a completion projection for existing SQL consumers, including chat. The custom `account_email_verifications` token table and link-consumption endpoints are retired.

New accounts remain restricted after email verification until final registration succeeds. Authenticated profile reads remain available; profile writes and existing restricted APIs require completion. Identity-only comment and notification reads use verified JWT claims without fetching email/account state. The calendar Data API retains its editor policy and additionally requires completion; other browser write grants remain unchanged.

## User flows

1. **Register:** enter email and password and complete Turnstile → native OTP email → enter the 8-digit code → choose a display username → submit final registration → log in with that password and Turnstile. Usernames may repeat. The password stays in component memory until final registration and is not sent with the OTP request or stored in browser storage. An unfinished registration can restart at the same entry point. Resending is inline with a 60-second cooldown.
2. **Final registration:** `/api/auth/signup` requires a live Auth user and an OTP/recovery authentication within 15 minutes. It writes the password and protected completion marker through a single Auth admin transaction. A database trigger writes the final profile/completion projection and prevents a concurrent second submission from replacing the winner. Admin password updates revoke temporary sessions; registration therefore returns to normal login. A verified email's already-complete account is directed to login/recovery without overwriting its information.
3. **Login:** email/password plus a Turnstile token passed directly to Supabase. A retained incomplete legacy account goes to the same email-proof/account-setup flow.
4. **Change or recover password:** request a recovery code → verify it → set a new password. Account settings and Forgot password use the same component. No old password field is shown. Both native password security flags are enabled: regular sessions cannot omit the old password, while genuine recovery sessions remain exempt. `Secure password change` alone only challenges older sessions, so it does not enforce this boundary by itself.
5. **Change email:** verify the current email using native OTP (`shouldCreateUser: false`) → enter the new email → receive and verify its code → complete the change. The first step uses Supabase SMTP; only the new-address code is sent by HHWX through Resend. Current-email proof authorizes requests/resends for **15 minutes after OTP authentication**; refreshing the JWT does not extend it. A previously authorized new-address code remains valid for **one hour after issuance**, even after the proof window ends. An expired proof requires verifying the current email again before resending or editing the target, but never disables the pending code input. Native Auth remains authoritative for both confirmations and the final email change.
6. **Old links:** `/auth/confirm` explains the new flow. It never consumes old custom tokens or establishes a session from a URL hash. Users request a new code from registration, recovery or email settings.

Temporary OTP sessions use independent in-memory Auth clients with distinct storage keys. Recovery and completed email changes establish the main session only after success.

The registration steps keep one form and the original email/password controls mounted, hidden and read-only when inactive, to preserve password-manager context. Registration and recovery each use a single password field with a show/hide button. Fields have stable identifiers, names and appropriate autocomplete values: `nickname` for the display name and `username` for the login email. `/.well-known/change-password` redirects to `/account/password`, preserving the destination through sign-in. Password generation, saving and autofill still require acceptance testing in the target browsers/password managers.

### Sequential email-change implementation

`/api/auth/email` accepts the existing login bearer token plus the separate OTP session's `proofToken` and `newEmail`. The server checks a live user, the signed proof's issuer/audience/role, matching account/current email and the OTP authentication timestamp. Password-only or recovery sessions cannot substitute for this step. The proof is a normal native Auth session, not a specially scoped token; HHWX keeps it only in memory for this flow.

With **Secure email change still enabled**, the server generates `email_change_current` first, then `email_change_new`. Both must be generated before confirming the current side because each generation resets native confirmation progress. Generating the new side last keeps its token paired with the destination. The server consumes the current-side code on the strength of the checked proof; this must return no completed user/session. Only the new-side OTP is emailed, and neither code is returned by the HHWX API. The user's new-side verification completes the native change. Native direct email changes still require both sides.

The private `account_private.email_change_dispatches` table stores only attempt timestamps, never OTPs or proof tokens. A service-only invoker RPC atomically reserves a per-account 60-second interval and an application-wide 60 new-address dispatches/hour budget across processes. Attempts, including failures, consume this budget and records older than one hour are pruned on reservation. The entire server operation has a 30-second deadline. This budget is separate from Supabase SMTP's existing quota. Auth owns pending addresses/tokens, so no custom verification table or persistent UI workflow is introduced. Failed delivery is shown explicitly; a later resend creates fresh native codes and invalidates the prior attempt.

## Hosted settings to apply at cutover

| Setting | Value |
| --- | --- |
| Email provider / new signups | Enabled |
| Confirm email | Enabled (`mailer_autoconfirm: false`) |
| Secure email change | Enabled |
| Secure password change | Enabled |
| Require current password when updating | Enabled |
| Anonymous sign-ins / manual linking | Disabled |
| Password policy | At least 8 characters, letters and digits; keep the application's existing length/character validation |
| Email OTP | 8 digits, 3600 seconds |
| Email send limit / per-user minimum interval | 60 emails/hour / 60 seconds |
| Turnstile | Enable natively in Supabase Auth using the site's existing widget secret; retain the same site key/server secret in HHWX |
| SMTP | Resend host `smtp.resend.com`, port 465, user `resend`; password is an API key with sending access to `mail.hhwx.org` |
| Sender | `accounts@mail.hhwx.org` / `HHWX Accounts` |
| Site URL | `https://hhwx.org` |
| Redirect allowlist | Keep exact required production/local paths; OTP flows do not need wildcard redirects |
| Password changed / email changed notifications | Enabled, use the repository templates |

Other existing Auth rate limits can remain as configured. Every code send or resend offered by HHWX requires a fresh Turnstile token; login also remains protected. Signup/recovery/current-email verification pass the token directly to Auth. HHWX validates a separate fresh token for new-address sends and resends before checking recent OTP proof and reserving dispatch capacity. Missing either application Turnstile key returns a service-unavailable error without generating or sending a code. Each token is consumed once by the service responsible for that request. Entering an email code needs no additional CAPTCHA, and automatic security notifications add no user step.

This boundary does not add CAPTCHA to Supabase's native authenticated `updateUser({ email })` endpoint. Direct requests can still send native email-change messages, subject to native rate limits and confirmation of both addresses. Retain Secure email change and SMTP; do not claim that every direct Auth email request requires Turnstile. A Send Email Hook would replace SMTP delivery and is outside this rollout.

Initial sends display the widget. Resends keep the 60-second cooldown and run Turnstile automatically with `interaction-only` appearance. Users normally click resend directly; the request waits if a token is still pending, and a challenge appears only when interaction is required. Failed or timed-out verification sends no email; retries obtain a fresh token. This preserves native Supabase resend verification without introducing a separate resend grant or mail proxy.

Use `supabase/templates/auth/subjects.json` and all eight HTML templates. Authentication templates display `.Token`, never a consumable verification URL. Current-email proof uses the neutral Magic link/OTP template; the application-generated new-email message has a separate title/body in `src/lib/account-email-delivery-server.ts`. The native email-change template retains separate old/new wording for native direct requests. No custom mail hook is needed. The template-update script supports `-DryRun` without a Management API credential; applying templates remains an explicitly authorized remote operation.

Set **`RESEND_API_KEY` on the application server**, with sending permission restricted to `mail.hhwx.org`. The new-address sender is `HHWX Accounts <accounts@mail.hhwx.org>`. Configure Supabase's SMTP sender and password separately with the same sending domain and API key. The application calls the Resend HTTP API using native `fetch`; no new runtime dependency is added. Never set `AUTH_EMAIL_TEST_INBOX_URL` in production.

Email templates follow the account pages' warm canvas, neutral headings, Chinese system sans-serif fonts and blue actions. Inline styles and presentation tables keep the message readable without remote assets; responsive and dark-mode styles enhance supported clients. Table-cell padding controls vertical spacing, with fonts set on text cells and an Outlook width/line-height fallback. The notification button uses a table background and a clickable link border; clients without rounded corners may show a rectangular button. Compact Chinese/English instructions share one copyable OTP. Security notifications state the actual change; the email-change notification uses `OldEmail` and `Email`. Keep the application-generated new-email HTML and plain text aligned with this presentation. Template subjects in `config.toml` and `subjects.json` must agree. Sync the isolated test stack's template copies and Auth subjects before capturing fresh Mailpit messages; existing messages do not update. Review individual HTML Check warnings and mobile rendering instead of treating the percentage as a delivery or rendering success rate.

Use the verified Resend `mail.hhwx.org` domain in Tokyo with Forge enabled, Enforced TLS, and click/open tracking disabled. Keep its SPF/DKIM records. `accounts@mail.hhwx.org` does not receive replies; security notices direct users to contact the website maintainer and must not promise reply-based support. Retire the old root-domain Resend configuration only after both Supabase SMTP and application API delivery work with the new sender and key. OTP emails remove the cross-domain verification links without a paid Supabase custom domain. SMTP delivery, spam placement, DNS and real Turnstile challenges require hosted acceptance checks; the local inbox cannot prove them.

## Historical accounts and rollout

The previous audit counts (896 verified / 88 pending, including 5 pending email changes) are historical observations, not a deletion list. Re-audit at cutover. Do not use native confirmation alone to backfill trust: the old deployment auto-confirmed users. The old `account-status-backfill-auth-confirmed.sql` now refuses execution.

The new migration preserves existing IDs, public UIDs, profiles and bindings. It marks only existing HHWX-verified accounts complete. For legacy pending accounts, it cancels unfinished native email changes and their tokens while retaining the current login email. These accounts use the same recovery/registration component to prove the current email and choose a password; no separate migration-only UI is introduced. Any deletion of truly abandoned registrations requires a reviewed candidate list and separate operational authorization. This migration deletes no accounts.

Rollout must be coordinated because old code depends on the retired custom token table:

1. Prepare and approve the exact target, migration, templates and settings; re-audit pending accounts and dependencies.
2. Pause account mutations during cutover. Apply `20261022111732_native_auth_otp_registration.sql` and `20261022125530_account_email_change_dispatch.sql`, set hosted Auth options/templates and the application Resend key, then deploy the matching application as one maintenance operation. Do not run the old app after dropping its token table.
3. Verify new registration, repeat unfinished registration, normal login with CAPTCHA, recovery, sequential email change/resend, a verified historical account and a retained pending account. Confirm that native direct email changes still require both mailboxes.
4. Resume mutations only after those checks pass. Rollback requires a coordinated database/application/configuration plan; do not simply deploy the previous app against the new schema.

No production configuration or account deletion is performed by local tests.

## Local checks

The isolated test stack uses project ID `hhwx-auth-test`, API port **55321**, database **55322**, inbox **55324**. Keep the existing `hhwx` stack/data intact. Copy `supabase/config.toml`, migrations and templates to `temp/auth-otp-local/supabase`, change only the project ID and port prefix `543` → `553`, then:

```powershell
npx --no-install supabase start --workdir temp/auth-otp-local -x realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
$authTest = npx --no-install supabase status --workdir temp/auth-otp-local -o json | ConvertFrom-Json
$env:NEXT_PUBLIC_SUPABASE_URL = $authTest.API_URL
$env:SUPABASE_URL = $authTest.API_URL
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = $authTest.PUBLISHABLE_KEY
$env:SUPABASE_SECRET_KEY = $authTest.SECRET_KEY
$env:NEXT_PUBLIC_SITE_URL = 'http://localhost:3100'
$env:NEXT_PUBLIC_TURNSTILE_SITE_KEY = '1x00000000000000000000AA'
$env:TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA'
$env:AUTH_EMAIL_TEST_INBOX_URL = $authTest.MAILPIT_URL
$env:RESEND_API_KEY = ''
npm run dev -- --port 3100
```

Use a separate terminal for tests. Do not print or commit the local credential object. `scripts/test-auth-local.mjs` refuses nonlocal endpoints and the wrong test port, recreates only the disposable stateless Auth container to enable `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true` (missing from CLI 2.117's config schema) and the official Turnstile test secret, runs tests with generated users and cleans those users up. Run it before manual interaction tests; it leaves CAPTCHA enabled in the local Auth service. It does not reset a database or contact production. Local SMTP captures Auth mail; `AUTH_EMAIL_TEST_INBOX_URL` captures the application's new-address mail through Mailpit's API. This override rejects production and nonlocal Auth/inbox URLs. Tests adjust only their disposable fixtures' timestamps to exercise expiry and resend without long waits.

```powershell
npm run test:auth
node --import tsx --test tests/user-game-profile-sync.test.mjs
node scripts/test-auth-local.mjs
npx --no-install supabase test db --workdir temp/auth-otp-local D:/Workspace/hhwx/supabase/tests/auth_registration.sql
npx --no-install supabase test db --workdir temp/auth-otp-local D:/Workspace/hhwx/supabase/tests/account_email_change.sql
npx --no-install supabase db advisors --workdir temp/auth-otp-local --local --type security
npm run typecheck
npm run i18n:check
npm run lint
npm run build
```

CI runs `npm run test:auth` for registration, email change, identity checks, form transitions and localized errors. A separate `auth-database` job starts an ephemeral database with `supabase db start`, applies the canonical migrations and runs `auth_registration.sql`, `account_email_change.sql` and `auto_game_profile_ownership.sql`. It uses no hosted credentials or email provider. The full local Auth/Mailpit script remains a pre-release check; actual Turnstile challenges and public Resend delivery require separate acceptance. Run the production dependency gate with `npm audit --omit=dev --audit-level=moderate` before release.

The integration checks cover wrong/replayed OTPs, pending authorization, concurrent finalization, immutable completed registration, duplicate usernames, native recovery exceptions, native direct dual confirmation and retained legacy identity. Sequential checks cover missing/password/other-account/stale proof rejection, concurrent dispatch, no second old-address email, pending completion after proof expiry, OTP expiry, changed-target/same-target resend and rejection of proof for the former email. SQL tests cover role-based authorization, protected completion and dispatch quotas. Local tests use [Cloudflare's official test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) with a visible, automatically passing widget and real Siteverify calls. Integration checks reject missing CAPTCHA on native signup/recovery/login and application new-address dispatch. Test keys are local-only; production must use real keys. Hosted challenge acceptance and actual Resend delivery remain rollout gates. For browser CDN resources, prefer `localhost:3000` when available; alternate ports may be outside CDN CORS rules.

Calendar Data API writes require a JWT issued after registration completion. Existing verified users do not need email verification again; direct Data API clients should refresh their session after cutover. Server calendar APIs continue to validate the live Auth user.
