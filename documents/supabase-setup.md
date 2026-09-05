# Supabase Setup

中文说明见 [supabase-setup.zh-CN.md](supabase-setup.zh-CN.md).

This document describes HHWX's Supabase schema workflow. New schema changes should use Supabase CLI migrations as the source of truth. The older standalone SQL files remain as legacy references and compatibility scripts during the transition.

## Files

- `supabase/schema/auth_schema.sql`: profiles, comments, basic account roles, and auth user bootstrap trigger.
- `supabase/schema/auth_legacy_patch.sql`: compatibility patch for older auth/profile deployments.
- `supabase/schema/bandori_calendar_schema.sql`: Bandori character, event, CN schedule, event bonus, and calendar editor-role tables.
- `supabase/schema/bandori_tracker_data_schema.sql`: tracker ranking data table and indexes.
- `supabase/schema/bandori_tracker_latest_schema.sql`: authenticated latest snapshots, service-role merge RPC, and private cutoff Broadcast read policy.
- `supabase/schema/bandori_tracker_topdata_latest_schema.sql`: authenticated event TOP10 latest snapshots, service-role merge RPC, and anchored Private Broadcast read policy.
- `supabase/config.toml`: Supabase CLI local project configuration.
- `supabase/migrations/*_baseline_schema.sql`: current migration baseline for new empty HHWX Supabase projects.
- `supabase/migrations/20260602*_*.sql`, `supabase/migrations/202606030*_*.sql`, and `supabase/migrations/20260610030939_*.sql`: historical production migration records from the pre-baseline MCP/manual transition. These files are intentionally no-op locally because the baseline migration builds the empty-project schema.
- `documents/account-status-schema.sql`: application-side email verification state.
- `documents/account-status-backfill-auth-confirmed.sql`: optional backfill from Supabase Auth confirmation state.
- `documents/account-auth-flow.md`: account registration, email verification, resend, and account-management behavior.
- `supabase/migrations/20260630053053_comment_reactions.sql`: comment reaction migration that backfills historical `comment_likes` rows into a reaction key on deployments that still have that table.
- `supabase/migrations/20260630055412_retarget_legacy_comment_reaction_kokoro_yay.sql`: retargets migrated legacy likes to the default `KokoroYay` reaction.
- `supabase/migrations/20260630071740_remove_legacy_comment_likes.sql`: removes the legacy `comment_likes` table and `comments.like_count` compatibility counter after reaction backfill verification.
- `supabase/migrations/20260701131822_remove_legacy_like_notifications.sql`: removes legacy `comment_like` notification rows and constrains `comment_notifications` to reply and reaction notifications.
- `supabase/migrations/20260728185041_scope_bandori_event_comments_by_server.sql`: rewrites legacy numeric Bandori event comment and notification targets to the canonical `<server-code>:<event-id>` form, treating all pre-migration discussions as CN.
- `supabase/migrations/20260812043505_add_bandori_card_comment_targets.sql`: allows the generic comment and notification tables to store `bandori_card` targets without changing their read-only browser grants or RLS policies. Ordinary cards use one cross-server `<card-id>` target; registered EN/CN numeric-ID collisions use `<server-code>:<card-id>`.
- `supabase/migrations/20260812053202_expand_comment_content_length.sql`: raises the shared Bandori comment, reply, and edit limit from 500 to 1,000 Unicode characters without changing the legacy Othello guestbook limit, grants, or RLS policies.
- `supabase/migrations/20260815211415_add_profile_display_degree.sql`: stores the selected public Degree, restricts writes to a service-role RPC, and restores JP Degree 100 when the final owning CN binding is removed or transferred.
- `supabase/migrations/20260801185414_accept_manual_profile_server.sql`: makes the service-role manual-profile RPC persist the profile payload's explicit Bandori server.
- `scripts/backfill-user-game-profile-servers.mjs`: audits or repairs manual-profile summary servers from their checksummed compressed payloads.
- `scripts/update-supabase-auth-email-templates.ps1`: previews or updates remote Auth email templates; see the operational scope below.
- `documents/profile-public-uid-schema.sql`: public numeric profile UID support.
- `documents/game-profile-schema.sql`: persisted user game profiles.
- `documents/game-account-binding-schema.sql`: game-account binding challenges and bindings.
- `supabase/maintenance/bandori_tracker_maintenance.sql`: manual observation and maintenance queries only. Do not treat this as a migration.

## Migration Workflow

Use the project-local Supabase CLI. It is installed as a development dependency, so global installation is not required. Check the relevant command's `--help` and current [Supabase migration guidance](https://supabase.com/docs/guides/deployment/database-migrations) before relying on version-sensitive behavior.

```powershell
npm exec -- supabase --version
npm exec -- supabase migration new --help
```

For new schema work:

1. Either create a migration with `npm exec -- supabase migration new <name>` and write the SQL there, or experiment through a SQL connection explicitly targeting the local Supabase stack. Capture a successful local experiment with the CLI, for example `npm exec -- supabase db pull <name> --local`. Keep the final change in `supabase/migrations/`; do not invent timestamped filenames or leave uncaptured local drift.
2. Review the generated SQL for constraints, indexes, grants, RLS, function `search_path`, service-role boundaries, and rollout/data-migration requirements. A generated diff is not a complete security review; check whether required objects or data changes need explicit SQL.
3. On a disposable local stack, replay with `npm exec -- supabase db reset --local` and verify affected SQL behavior. For changed RLS, grants, or privileged SQL, reuse or extend retained SQL tests for allowed and denied access under the intended roles and ownership/session states, not only the database owner or service role. Temporary queries help iteration but do not preserve regression coverage. Use query-plan evidence when changing performance-sensitive SQL. Docker is required for the local stack; report checks that could not run.
4. Run the applicable [Supabase Advisors](https://supabase.com/docs/guides/observability/advisors), for example `npm exec -- supabase db advisors --local --type all`. Assess security/performance findings in the changed scope; they complement role-based tests and do not require unrelated historical cleanup.
5. For an authorized linked-project review, verify the project target and inspect `npm exec -- supabase db push --dry-run`. Apply with `npm exec -- supabase db push` only within explicitly authorized remote-write scope and the required rollout order.

`db pull` defaults to the linked database and can update migration history; always select `--local` for local experimentation. `db reset --local` destroys local database contents, so capture intended changes and preserve needed local data first. Local SQL experiments, dry runs, and available credentials do not authorize remote SQL execution, history repair, configuration changes, or production writes. Reuse explicit operational authorization already given for the target and action.

The current baseline migration is for new empty projects. Do not run it directly against the existing production HHWX project. For the linked production project, keep the historical no-op records for already-applied remote versions and mark the baseline version as applied only after verifying that the live schema already matches it. Run `npm exec -- supabase db push --dry-run` before any production push.

`20260728185041_scope_bandori_event_comments_by_server.sql` is a coordinated application and data release. Deploy the server-aware comment API first so concurrent writes already use canonical targets, then push the migration immediately. Existing legacy discussions can be temporarily absent between those two steps, but the migration preserves every comment and notification row.

The card-comment target constraint change is migration-first. Push `20260812043505_add_bandori_card_comment_targets.sql` before deploying the application that can write `bandori_card` rows. The previous application remains compatible with the expanded constraints. Rollback to the event-only constraints is safe only after confirming that both `comments` and `comment_notifications` contain no `bandori_card` rows.

The shared comment length change is also migration-first. Push `20260812053202_expand_comment_content_length.sql` before deploying the application that accepts 1,000-character comments. The previous application remains compatible because it still submits at most 500 characters. Restoring the old constraint requires first confirming that `comments` contains no non-null content longer than 500 characters.

The profile display Degree change is migration-first. Push `20260815211415_add_profile_display_degree.sql` before deploying the account-center selector because the new profile read and save routes require the columns and service-role RPC. Older application builds ignore the new defaulted columns. The migration also replaces bind-transfer and unbind RPCs so a selected Degree falls back atomically when its final owning binding disappears.

CN Degree effects are also migration-first. Push `20260816024443_add_game_binding_degree_effects.sql`
before deploying effect-aware sync or Web readers. It adds the private monotonic
`owned_degree_effect_ids` binding column and the service-role-only
`merge_game_uid_binding_degree_effects` RPC. Public profile selection and rendering
remain a separate application and schema release.

Public Degree effect selection is a subsequent migration-first release. Push
`20260816092425_add_profile_display_degree_effect.sql` before deploying the
effect-aware selector and renderer. It adds nullable `display_degree_effect_id`,
keeps the three-argument `set_profile_display_degree` contract for older builds,
and adds the four-argument contract used to select an owned effect variant. Bind
transfer and unbind preserve the standard Degree when it remains owned and clear
only an invalid effect; they restore JP Degree 100 when the base Degree is also lost.

The manual-profile server fix is backward-compatible only in the migration-first direction. Push `20260801185414_accept_manual_profile_server.sql`, deploy the application immediately afterward, and then audit historical rows:

```powershell
node --import tsx scripts/backfill-user-game-profile-servers.mjs
```

The audit is read-only and reports only aggregate transitions. If it reports no unreadable or invalid payloads, apply the repair and verify that a second dry run reports zero mismatches:

```powershell
node --import tsx scripts/backfill-user-game-profile-servers.mjs --apply
node --import tsx scripts/backfill-user-game-profile-servers.mjs
```

The repair only considers manual profiles, treats the checksummed payload's `bestdoriProfile.server` as authoritative, and conditionally updates rows whose original `server` and `payload_sha256` are unchanged. It refuses to apply if any manual payload cannot be validated.

## Privileged Scripts

The profile backfill above defaults to a read-only audit; its `--apply` requires remote-write authorization. The email-template script behaves differently: use `scripts/update-supabase-auth-email-templates.ps1 -DryRun` for a local preview. It requires the project ref and Management API token but exits before network calls. Without `-DryRun`, it can read a backup and PATCH the project's Auth configuration; `-WhatIf` alone does not skip the backup read. Verify the target and authorized operation, retain the backup, and keep tokens and private output out of commits and logs.

## Legacy Manual Order

The following order is a compatibility reference for older manual deployments, not an alternative to migrations for new schema work. Use it only within an explicitly scoped legacy setup or repair:

1. `supabase/schema/auth_schema.sql`
2. `supabase/schema/auth_legacy_patch.sql` if you are upgrading an older deployment
3. `supabase/schema/bandori_calendar_schema.sql`
4. `supabase/schema/bandori_tracker_data_schema.sql`
5. `supabase/schema/bandori_tracker_latest_schema.sql`
6. `supabase/schema/bandori_tracker_topdata_latest_schema.sql`
7. `documents/account-status-schema.sql`
8. `documents/profile-public-uid-schema.sql`
9. `documents/game-account-binding-schema.sql`
10. `documents/game-profile-schema.sql`

Then run `documents/account-status-backfill-auth-confirmed.sql` only when migrating users from an existing Supabase Auth project where confirmed users should become application-verified users.

If an existing project still has the historical `comment_likes` table, apply the CLI migrations from `supabase/migrations/20260630053053_comment_reactions.sql` through `supabase/migrations/20260701131822_remove_legacy_like_notifications.sql` in order. The final supported state is `comment_reactions` plus reply and reaction `comment_notifications`; the standalone like-notification bridge is no longer supported.

## Review Notes

- Keep RLS enabled on every table in an exposed schema. Review grants and row policies separately: object access does not establish row ownership. `TO authenticated` also includes anonymous sign-ins; do not authorize from mutable `user_metadata`, and account for stale JWT claims when changing Auth rules. See [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).
- Use `supabase/migrations/` for new schema changes. Treat the older standalone SQL files as compatibility references unless a migration explicitly reuses them.
- Keep explicit least-privilege `GRANT`/`REVOKE` statements next to policies for Data API objects rather than depending on project creation dates or default exposure settings.
- For user-owned UPDATE policies, explicitly state `USING` and `WITH CHECK` and supply the required SELECT policy. PostgreSQL reuses `USING` when `WITH CHECK` is omitted; explicit predicates make the intended old/new ownership clear. See [CREATE POLICY](https://www.postgresql.org/docs/current/sql-createpolicy.html).
- For comment interaction tables, keep direct Data API writes disabled unless the browser really needs them. Route profile edits, comment writes, reactions, notifications, and reports through the Next.js API so validation and side effects stay server-side.
- Treat `security definer` functions as privileged code: verify argument checks, ownership checks, grants, and `search_path` behavior before production use.
- Grant direct table or function access only where the application requires it.
- Keep service-role operations server-side. Browser code uses the configured publishable key and authenticated user sessions, without a legacy anon-key fallback.
- `bandori_tracker_latest` is authenticated read-only and is not a Postgres Changes source. The tracker writes it through the service-role-only `upsert_bandori_tracker_latest` RPC, then publishes to a matching Private Broadcast topic. Do not grant browser `INSERT` on `realtime.messages`.
- Event TOP10 high-frequency snapshots use `bandori_tracker_topdata_latest_snapshots` and the service-role-only `upsert_bandori_tracker_topdata_latest` RPC. Registered non-anonymous users may SELECT the latest row and receive the anchored `bandori:topdata:cn:events:{eventId}` Private Broadcast topic. The table is not a Postgres Changes source; browsers cannot mutate it, execute the RPC, or insert Broadcast messages.
- Clients order and deduplicate live data by `(topic, revision)`. `sampleId` identifies the newest observation time, but an older partial patch may fill a missing ranking line while preserving that top-level `sampleId` and incrementing `revision`.
- The event tracker subscribes before the exact snapshot query, buffers Broadcast messages during that query, and retries a transient snapshot failure with bounded backoff. Private minute points stay in session memory and are hidden when live access is not active.
- Keep Supabase Auth email provider enabled, but keep Dashboard Confirm email disabled (`mailer_autoconfirm: true`). HHWX uses application-side email verification; Supabase's built-in signup confirmation email does not complete `account_status.email_verified_at`.
- Docker is needed only for local Supabase stack commands such as `db reset`, `db diff`, or `start`. Creating migration files and generating remote types can use the project-local CLI without Docker.

## Environment

The web app needs:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

Before deploying tracker-live migrations, run `npm run test:supabase` against the local Supabase stack (or an isolated Supabase branch). `supabase/tests/bandori_tracker_latest.sql` covers cutoff latest, while `supabase/tests/bandori_tracker_topdata_latest.sql` covers the TOP10 table, RPC, RLS, concurrency, payload limits, and anchored Broadcast policy.

Bandori tracker live delivery is a fixed Private Broadcast contract. The browser subscribes only after the restored session has completed authenticated bootstrap; there is no environment-variable transport switch.

`SUPABASE_SECRET_KEY` is required only on the server and must never use a `NEXT_PUBLIC_` prefix.
