# Supabase Setup

This document describes the current repository-local SQL layout for a fresh HHWX deployment.

## Files

- `supabase/schema/auth_schema.sql`: profiles, comments, basic account roles, and auth user bootstrap trigger.
- `supabase/schema/auth_legacy_patch.sql`: compatibility patch for older auth/profile deployments.
- `supabase/schema/bandori_calendar_schema.sql`: Bandori character, event, CN schedule, event bonus, and calendar editor-role tables.
- `supabase/schema/bandori_tracker_data_schema.sql`: tracker ranking data table and indexes.
- `documents/account-status-schema.sql`: application-side email verification state.
- `documents/account-status-backfill-auth-confirmed.sql`: optional backfill from Supabase Auth confirmation state.
- `documents/profile-public-uid-schema.sql`: public numeric profile UID support.
- `documents/game-profile-schema.sql`: persisted user game profiles.
- `documents/game-account-binding-schema.sql`: game-account binding challenges and bindings.
- `supabase/maintenance/bandori_tracker_maintenance.sql`: manual observation and maintenance queries only. Do not treat this as a migration.

## Suggested Order

For a new project, run these in the Supabase SQL editor or your migration system:

1. `supabase/schema/auth_schema.sql`
2. `supabase/schema/auth_legacy_patch.sql` if you are upgrading an older deployment
3. `supabase/schema/bandori_calendar_schema.sql`
4. `supabase/schema/bandori_tracker_data_schema.sql`
5. `documents/account-status-schema.sql`
6. `documents/profile-public-uid-schema.sql`
7. `documents/game-profile-schema.sql`
8. `documents/game-account-binding-schema.sql`

Then run `documents/account-status-backfill-auth-confirmed.sql` only when migrating users from an existing Supabase Auth project where confirmed users should become application-verified users.

## Review Notes

- Keep row-level security enabled on user-owned tables.
- Treat `security definer` functions as privileged code: verify argument checks, ownership checks, grants, and `search_path` behavior before production use.
- Grant direct table or function access only where the application requires it.
- Keep service-role operations server-side. Browser code must use only public Supabase keys and authenticated user sessions.

## Environment

The web app needs:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`

`SUPABASE_SECRET_KEY` is required only on the server and must never use a `NEXT_PUBLIC_` prefix.
