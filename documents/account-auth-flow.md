# Account Registration and Management Flow

中文说明见 [account-auth-flow.zh-CN.md](account-auth-flow.zh-CN.md).

This document describes HHWX account registration, email verification, login-state boundaries, and account-management behavior. The application intentionally separates Supabase Auth login from HHWX application-side email verification.

## Source of Truth

- Supabase Auth owns user identity, password login, password recovery, and the login session.
- `public.account_status.email_verified_at` is the HHWX application-side email verification source of truth.
- `public.account_email_verifications` stores one-time verification token hashes. Raw tokens are only sent through email redirect URLs and are never stored.
- Server-side restricted actions use `requireVerifiedAccount(request)`. Account-management and verification flows use `requireAuthenticatedUser(request)` so unverified users can still manage their account and resend verification email.

## Required Supabase Auth Configuration

- Email provider must stay enabled.
- Supabase Dashboard **Confirm email** must stay disabled for this application-side flow. In the public Auth settings endpoint this appears as `mailer_autoconfirm: true`.
- If Confirm email is re-enabled, Supabase may send its own signup confirmation email in addition to HHWX's application verification email. That built-in signup email does not carry HHWX's application verification token and cannot complete `account_status.email_verified_at`.
- Browser code must use only the publishable Supabase key. Service-role or secret-key operations must stay server-side.

## Registration Flow

1. The registration page posts username, email, password, Turnstile token, and callback URL to `/api/auth/signup`.
2. The API validates username/password/email, checks username and email availability, and calls Supabase `auth.signUp`.
3. After Supabase returns a user, the API ensures an `account_status` row exists.
4. The API creates a HHWX application verification token and sends a Supabase magic-link email with a redirect URL containing:
   - `verify_email=1`
   - `verification_token=<raw one-time token>`
5. The response still reports `requiresEmailVerification: true`. If Supabase returns a session, the frontend may establish an unverified login session.

Operational note: if Supabase user creation succeeds but sending the HHWX verification email fails, the user may already exist. The user should log in and use account email settings to resend the verification email.

## Login, Resend, and Confirmation

- Login is allowed before email verification.
- Unverified users can access account-management pages, including `/account/email`.
- `/account/email` shows "resend verification email" while `emailVerified` is false.
- Resend uses `/api/auth/email` with `action: "resend-verification"`. The route requires authentication, not verified email.
- Each new verification email deletes previous verification tokens for the same user and creates a new 24-hour token.
- `/auth/confirm` handles Supabase magic-link callback state, then posts `action: "confirm"` and the HHWX `verificationToken` to `/api/auth/email`.
- Confirmation consumes the token and writes `account_status.email_verified_at`.

## Account Management

- Email update uses `/api/auth/email` with `action: "update"`.
- Email update sets a Supabase session from the supplied access and refresh tokens, calls Supabase `updateUser({ email })`, and sends a callback URL containing a fresh HHWX verification token.
- After requesting an email change, HHWX clears application-side email verification until the confirmation flow writes `email_verified_at` again.
- Password reset uses Supabase password recovery and does not mark HHWX email verification complete.
- Profile reads and profile edits are allowed for authenticated users. Comments, game-account binding, cloud game profiles, game-profile sync, and Bandori schedule writes require verified email.

## Known Risks and Improvement Backlog

- Verification tokens are currently bound to `user_id`, but not explicitly bound to `purpose` or target email. This is acceptable for the current single-token-per-user flow, but future hardening should add `purpose` and `email` columns and validate them during confirmation.
- `/auth/confirm` can complete HHWX verification with an existing session plus a valid HHWX `verification_token`, even if the Supabase callback no longer contains `token_hash` or URL hash session fields. This is intentional for the current flow but should be revisited if verification must require a fresh Supabase OTP callback every time.
- Registration is not transactional across Supabase user creation and HHWX verification email delivery. If email delivery fails after user creation, the account remains and the user must resend verification after login.
- Confirm email must remain disabled in Supabase. Treat any change to `mailer_autoconfirm` as a compatibility-sensitive auth change and retest signup, login, resend, and confirmation.

## Smoke Tests

- Register a new email and confirm that `/api/auth/signup` returns success and sends one HHWX verification email.
- Log in before verification and confirm `/account/email` is reachable.
- Resend verification from `/account/email` and confirm the previous token no longer works.
- Open the newest verification link and confirm `account_status.email_verified_at` is set.
- Verify an unverified session receives `EMAIL_VERIFICATION_REQUIRED` from restricted APIs, while account-management APIs remain available.
