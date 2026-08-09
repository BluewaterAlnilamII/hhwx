---
paths:
  - "supabase/**"
  - "documents/**/*.sql"
  - "documents/supabase-setup*.md"
  - "src/lib/**/*supabase*.ts"
  - "scripts/backfill-user-game-profile-servers.mjs"
---

# Supabase Schema and Security Rules

- Use the project-local Supabase CLI and inspect the installed command's `--help` before relying on flags. Do not assume a globally installed CLI or a remembered command shape.
- `supabase/migrations/**` is the sole history and source of truth for new schema changes. Create migrations through the project-local CLI instead of inventing migration filenames, and keep each migration focused, ordered, and reviewable.
- Treat `supabase/schema/**` as legacy/reference snapshots and `documents/**/*.sql` as maintenance, backfill, compatibility, or reference artifacts. When a migration changes a contract mirrored by one of those files, update or explicitly review the matching artifact and `documents/supabase-setup*.md` in the same change; never make either area an independent schema authority.
- Schema changes must include the necessary indexes, constraints, ownership assumptions, grants, RLS state, policies, and migration or rollback considerations. Do not hide production-only drift in application code or an unrelated repository.
- For every table, view, sequence, or function reachable through the Data API, define least-privilege `GRANT`/`REVOKE` behavior explicitly and review row authorization separately. Grants determine whether a role can reach an object; RLS determines which table rows it may access, so neither control substitutes for the other.
- Enable RLS on every exposed table and write policies for the actual ownership and authorization model. A `TO authenticated` clause alone is not row authorization. Use `USING` for `SELECT` and `DELETE`, `WITH CHECK` for `INSERT`, and both predicates for user-owned `UPDATE`; updates also require the corresponding readable-row policy.
- Views do not receive table RLS directly. On PostgreSQL 15 or later, prefer `security_invoker = true` when a view should obey the invoking role and the underlying tables' RLS. Otherwise revoke client access or place the view in an unexposed schema; any deliberate elevated view contract must be narrowly granted and documented.
- For functions, prefer `SECURITY INVOKER`. A new or changed `SECURITY DEFINER` function must have a documented need, validate caller and ownership assumptions, set an explicit restricted `search_path` (prefer `set search_path = ''` with schema-qualified references), and pair default `PUBLIC` execute revocation with only the required explicit grants.
- Browser clients may be initialized only with a publishable key and may carry a normal authenticated Supabase user session. Do not add or fall back to a legacy anon key. Secret keys, service-role keys, RLS-bypass behavior, and other privileged access are server-only and must stay in narrowly scoped modules. Never expose them through `NEXT_PUBLIC_*`, browser bundles, client logs, response payloads, or documentation examples, and do not use privileged access as a substitute for correct user-facing RLS.
- `scripts/backfill-user-game-profile-servers.mjs` is registered because it uses a secret key and can update remote rows only after an explicit `--apply`. Preserve its default dry-run, target/configuration validation, fail-closed apply checks, and secret-safe logging. Register any future privileged or remote-write script by exact path before changing it; do not broaden this rule to ordinary consumer hooks or unprivileged Supabase modules.
- Verify schema work with the narrowest applicable checks. Review the generated SQL and diff, use the local Supabase stack and repository SQL tests when available, and run the documented linked-project `db push --dry-run` only after confirming the target project and current CLI syntax.
- A dry run is a verification step, not authorization to apply anything. These rules do not authorize `db push`, SQL Editor execution, migration-history repair, remote configuration changes, remote-write script apply modes, or any other production write; those actions require explicit user approval and target confirmation.
