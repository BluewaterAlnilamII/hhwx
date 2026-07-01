# Supabase Setup

中文说明见 [supabase-setup.zh-CN.md](supabase-setup.zh-CN.md).

This document describes HHWX's Supabase schema workflow. New schema changes should use Supabase CLI migrations as the source of truth. The older standalone SQL files remain as legacy references and compatibility scripts during the transition.

## Files

- `supabase/schema/auth_schema.sql`: profiles, comments, basic account roles, and auth user bootstrap trigger.
- `supabase/schema/auth_legacy_patch.sql`: compatibility patch for older auth/profile deployments.
- `supabase/schema/bandori_calendar_schema.sql`: Bandori character, event, CN schedule, event bonus, and calendar editor-role tables.
- `supabase/schema/bandori_tracker_data_schema.sql`: tracker ranking data table and indexes.
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
- `documents/profile-public-uid-schema.sql`: public numeric profile UID support.
- `documents/game-profile-schema.sql`: persisted user game profiles.
- `documents/game-account-binding-schema.sql`: game-account binding challenges and bindings.
- `supabase/maintenance/bandori_tracker_maintenance.sql`: manual observation and maintenance queries only. Do not treat this as a migration.

## Migration Workflow

Use the project-local Supabase CLI. It is installed as a development dependency, so global installation is not required.

```powershell
npm exec -- supabase --version
npm exec -- supabase migration new <name>
```

For new schema work:

1. Create a migration with `npm exec -- supabase migration new <name>`.
2. Put the SQL change in the generated `supabase/migrations/<timestamp>_<name>.sql` file.
3. Review grants, RLS policies, function `search_path`, and service-role boundaries before applying it.
4. If Docker is available, test against a local Supabase stack with `npm exec -- supabase db reset`.
5. For a linked remote project, review with `npm exec -- supabase db push --dry-run` before running `npm exec -- supabase db push`.

The current baseline migration is for new empty projects. Do not run it directly against the existing production HHWX project. For the linked production project, keep the historical no-op records for already-applied remote versions and mark the baseline version as applied only after verifying that the live schema already matches it. Run `npm exec -- supabase db push --dry-run` before any production push.

## Legacy Manual Order

For older manual setup, run these in the Supabase SQL editor or your migration system:

1. `supabase/schema/auth_schema.sql`
2. `supabase/schema/auth_legacy_patch.sql` if you are upgrading an older deployment
3. `supabase/schema/bandori_calendar_schema.sql`
4. `supabase/schema/bandori_tracker_data_schema.sql`
5. `documents/account-status-schema.sql`
6. `documents/profile-public-uid-schema.sql`
7. `documents/game-account-binding-schema.sql`
8. `documents/game-profile-schema.sql`

Then run `documents/account-status-backfill-auth-confirmed.sql` only when migrating users from an existing Supabase Auth project where confirmed users should become application-verified users.

If an existing project still has the historical `comment_likes` table, apply the CLI migrations from `supabase/migrations/20260630053053_comment_reactions.sql` through `supabase/migrations/20260701131822_remove_legacy_like_notifications.sql` in order. The final supported state is `comment_reactions` plus reply and reaction `comment_notifications`; the standalone like-notification bridge is no longer supported.

## Review Notes

- Keep row-level security enabled on user-owned tables.
- Use `supabase/migrations/` for new schema changes. Treat the older standalone SQL files as compatibility references unless a migration explicitly reuses them.
- Supabase no longer automatically exposes new public tables/functions to the Data API for new projects from May 30, 2026, and applies the same default to existing projects from October 30, 2026. Keep explicit `GRANT`/`REVOKE` statements next to RLS policies in every SQL file that creates Data API objects.
- For comment interaction tables, keep direct Data API writes disabled unless the browser really needs them. Route profile edits, comment writes, reactions, notifications, and reports through the Next.js API so validation and side effects stay server-side.
- Treat `security definer` functions as privileged code: verify argument checks, ownership checks, grants, and `search_path` behavior before production use.
- Grant direct table or function access only where the application requires it.
- Keep service-role operations server-side. Browser code must use only public Supabase keys and authenticated user sessions.
- Keep Supabase Auth email provider enabled, but keep Dashboard Confirm email disabled (`mailer_autoconfirm: true`). HHWX uses application-side email verification; Supabase's built-in signup confirmation email does not complete `account_status.email_verified_at`.
- Docker is needed only for local Supabase stack commands such as `db reset`, `db diff`, or `start`. Creating migration files and generating remote types can use the project-local CLI without Docker.

## Environment

The web app needs:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

`SUPABASE_SECRET_KEY` is required only on the server and must never use a `NEXT_PUBLIC_` prefix.
