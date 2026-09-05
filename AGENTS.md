# hhwx Agent Project Rules

This is the shared rule entry point for `hhwx`. Codex reads it directly; Claude Code imports it through `.claude/CLAUDE.md`. Load topic rules from the map below only when relevant.

## Scope and Authorization

- Follow the user's request and established authorization while preserving security, privacy, license, and data-integrity boundaries. Discussion, review, or planning requests authorize investigation and requested reports, not implementation. Interpret approval in context; once implementation is authorized, finish that scope without repeated confirmation.
- Explain material trade-offs before a decision that remains with the user. Ask only when scope, a destructive action, or an external operation needs authorization that the conversation has not already provided.
- Production writes, broad live synchronization, large uploads, and remote configuration/history changes require explicit operational scope and a verified target. Credentials or a dry run do not provide authorization. Read-only checks may use configured access within the task; keep private data and secrets out of output.

## Project Invariants

- `hhwx` owns the public Web app, public APIs, canonical Supabase schema/migrations, and public documentation. `../hhwx-bandori-backend` owns scraping, synchronization, master artifacts, maintenance jobs, and private user-fetchers; `../hhwx-assets-builder` owns asset extraction, indexes, and publication. Modify siblings only when in scope, read their own rules, and identify any rollout order.
- Preserve data sources, their owners, and access layers unless the task changes that contract. Public URLs, API shapes, persisted identifiers, environment variables, and external protocols require a compatibility or migration plan for breaking changes.
- Keep secrets, private deployment details, signing capabilities, and RLS-bypass access server-only. Browser Supabase access uses the configured publishable key and normal user sessions. Apply this boundary by responsibility, even before a new file is listed in a topic rule.
- Server readers of HHWX-owned catalogs, manifests, indexes, and aggregate metadata use private object storage. Public CDN URLs serve browsers and external clients; they are not a server-side fallback for failed private reads.
- Content changes to `public/res/**` or other explicitly immutable resources require new URLs and updated consumers. Other `public/**` files are not automatically immutable.
- Communicate in the user's language. Public documentation and code comments default to English; localized copy and operational material use their intended language. Update affected command, configuration, deployment, and contract documentation and review established English/`.zh-CN.md` pairs together. Update `documents/layout.md` and its translation only when directory responsibilities change.

## Professional Skills

- Follow relevant installed skills for their applicable workflows and quality requirements: Ponytail for minimal engineering, Supabase for its products, and build-web-apps for frontend design, browser verification, React performance, and Shadcn composition. Load only the relevant skills and references; do not copy their manuals into repository rules.
- Evaluate existing code against that guidance instead of rejecting better approaches solely to preserve current practice. Resolve factual or version conflicts using official documentation and installed tools; preserve security and compatibility contracts, and explain material adaptations.
- Apply workflows within their intended scope: design/concepts for new visual surfaces and redesigns, focused browser verification for targeted UI fixes. Judge completion against the accepted design and observable behavior.
- If a skill is unavailable, use official documentation and project constraints, reporting material limitations. Keep machine-specific skill paths and plugin versions out of these rules.

## Implementation

- Trace affected callers and contracts before choosing a fix. Prefer the platform, standard library, existing packages, and suitable shared code. Fix the common cause; add abstractions or files only for clear responsibilities or meaningful reuse.
- Preserve the established Next.js App Router architecture. Keep shared domain, fetching/cache, and compatibility policies at their owning boundaries. Small local helpers may stay local; a pure function does not automatically need a new module. Keep expensive browser computation off the main thread.
- Follow the language's idioms and nearby naming conventions. Project-owned TypeScript domain/API fields use camelCase; SQL identifiers and database rows use snake_case. Map at the service boundary, preserving registered wire contracts. Do not rename unrelated legacy code to enforce style.
- Choose mature components or dependencies when they materially improve correctness, accessibility, performance, or maintenance. Explain a new runtime dependency or replacement before adding it if that decision is not already authorized. Use npm to update the manifest and lockfile together, keep tooling in devDependencies, and avoid unrelated dependency churn.
- Keep changes within the task. Avoid speculative configuration, broad formatting, structural migrations, and commentary that merely restates code.

## Verification and Handoff

- Select the smallest set of checks covering changed behavior and independent risks; use current `package.json` scripts for commands and topic rules for specialized requirements. Cover affected authorization, compatibility, and primary/fallback paths; never weaken a useful assertion to obtain a pass.
- Run typecheck for TypeScript behavior or shared-type changes, and applicable lint/build checks when build inputs or application integration are affected. Prose/rule-only changes need diff, link, path/import, and bilingual review, not application tests or builds. Required CI checks still apply.
- Reuse existing tests. Add a focused runnable regression check when meaningful changed behavior is otherwise unprotected; ordinary prose, naming, or CSS edits do not automatically need new tests. Prefer observable behavior over assertions tied to incidental source text or class strings.
- Reuse successful local or CI evidence when the relevant code, dependencies, configuration, and environment are equivalent. Once necessary checks pass, stop; rerun or broaden only for new changes, failures, or an unresolved risk. Performance claims need measurements suited to the claim, not an automatic full benchmark campaign.
- Report unavailable verification and use the strongest safe available check. Static inspection, builds, and manual UI checks prove only what they actually exercise.
- Report the outcome, material design/dependency or compatibility changes, checks performed, and remaining limitations. Include file links and rollout steps when useful; scale the handoff to the task.

## Topic Rules and Maintenance

Before inspecting or editing implementation, Codex and Claude Code load the rules matching the task's responsibilities or file paths, including existing files outside the globs. Claude Code also uses `paths` for automatic loading. Reuse unchanged rule contents while available in context; reread after changes or loss from context. On scope expansion, load newly relevant rules and correct path gaps without enumerating every caller.

| Task scope | Rule |
| --- | --- |
| HTTP handlers and shared request/response contracts | [api-routes.md](.claude/rules/api-routes.md) |
| React pages, components, and styles | [frontend-components.md](.claude/rules/frontend-components.md) |
| Hooks and shared client state | [react-hooks.md](.claude/rules/react-hooks.md) |
| Server services, privileged access, private storage | [server-services.md](.claude/rules/server-services.md) |
| Localized messages, UI copy, locale configuration | [localization.md](.claude/rules/localization.md) |
| Supabase products, including schema, clients, Auth, Realtime, Storage, and privileged scripts | [supabase.md](.claude/rules/supabase.md) |
| Medley normalization, scoring, search, Worker/WASM delivery | [medley.md](.claude/rules/medley.md) |

Keep durable Agent instructions here and path-specific constraints in topic rules. CONTRIBUTING and setup guides serve human contributors; consult relevant procedures and contracts as needed, without requiring whole-document loading or moving Agent policy into them. Delete obsolete or inferable guidance; keep `.claude/CLAUDE.md` as a short import, not a duplicate rulebook.
