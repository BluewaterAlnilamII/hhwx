---
paths:
  - "supabase/**"
  - "documents/**/*.sql"
  - "documents/supabase-setup*.md"
  - "src/lib/**/*supabase*.ts"
  - "scripts/backfill-user-game-profile-servers.mjs"
  - "scripts/update-supabase-auth-email-templates.ps1"
---

# Supabase Schema and Security Rules

- Use the Supabase skill and relevant Postgres references. Verify version-sensitive behavior against official docs and the project-local CLI's `--help`. When changing Supabase package versions, pin tested versions and update the lockfile through npm.
- `supabase/migrations/**` is the canonical schema history. Either author a CLI-created migration or experiment on the local stack and capture the final change as a CLI-generated migration. Review and replay the result; local iteration never authorizes remote SQL or history changes. Follow [Supabase Setup](../../documents/supabase-setup.md).
- `supabase/schema/**` and `documents/**/*.sql` are legacy/reference or maintenance artifacts, not independent schema authorities. Review affected mirrors and bilingual setup docs when their contracts change.
- Review constraints, indexes for actual access patterns, ownership, grants, RLS, and safe rollout together. Define least-privilege object grants separately from row authorization; `TO authenticated` alone does not establish ownership or exclude anonymous sign-ins.
- Enable RLS on every table in an exposed schema. For user-owned updates, explicitly express old-row access and allowed new-row ownership with `USING` and `WITH CHECK`, and provide the necessary SELECT policy. Do not authorize from mutable `user_metadata`; account for stale JWT claims and session invalidation requirements when changing Auth behavior.
- Prefer invoker views/functions. Views intended to honor table RLS use `security_invoker` on supported PostgreSQL versions; otherwise restrict exposure. A definer function needs a justified privilege boundary, caller/argument checks, a restricted `search_path` with schema-qualified references, revoked default PUBLIC execution, and only necessary grants. Service-only RPCs must remain inaccessible to client roles.
- Browser access uses the publishable key and normal user sessions; no legacy anon fallback. Secret/service-role keys and Management API tokens stay server-side. Privileged access is not a substitute for user-facing RLS.
- Preserve the profile backfill script's default dry-run and fail-closed `--apply` checks. The email-template script requires explicit `-DryRun` for a local preview; without it, it can PATCH remote Auth configuration. Preserve its backup and target checks. New remote-write scripts default to preview with an explicit write mode; register them by exact path and apply the boundary even before registration.
- Verify affected SQL behavior under actual client roles and relevant ownership/session states, not only a database owner or service role. For changed RLS, grants, or privileged SQL, reuse or extend retained SQL tests for allowed and denied cases; temporary queries alone do not preserve regression coverage. Replay/review changed migrations and measure query plans when performance is affected.
- For schema, database security, or SQL performance changes, run applicable Supabase Advisors against the local stack or an authorized target and assess findings in the changed scope. Advisors complement role-based tests; do not automatically fix unrelated historical findings. Report unavailable runtime checks.
- Auth, session, or Realtime client changes require checks of the affected flow; they do not trigger migration replay or new SQL tests unless database behavior also changes.
- Confirm the target and operational scope before linked-project checks or applies. A dry run grants no permission for remote writes, SQL Editor execution, migration repair, or configuration changes; reuse explicit authorization already established for that operation.
