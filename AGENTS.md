# hhwx Agent Project Rules

This file is the canonical shared rule entry point for the `hhwx` repository. Codex reads it directly. Claude Code imports it through `.claude/CLAUDE.md`. Topic-specific details live in `.claude/rules/*.md`; Codex must read the matching files from the rule map below, while Claude Code applies them through its rule loader.

## Rule Priority

- The user's current explicit request takes priority over repository preferences, but it must not bypass security, authorization, privacy, license, or data-integrity boundaries.
- Existing public contracts and production-compatible behavior take priority over stylistic preferences. Breaking changes require an explicit migration or compatibility plan.
- Rules in a target repository apply to files in that repository. Do not carry private tracker operations, deployment details, or credentials into the public Web repository.
- Do not perform broad formatting, renaming, dependency replacement, or structural migration as part of an unrelated task.

## Decision Discussion Mode

- When the user explicitly asks to discuss, review, audit, compare, or decide a plan before implementation, or says not to implement yet, enter decision discussion mode.
- In decision discussion mode, inspect the repository and gather read-only evidence, but do not edit files, install dependencies, change external state, or start implementation.
- Present one user-owned decision at a time. Explain the evidence, give a recommendation, and state the material trade-offs before asking for confirmation.
- Replies such as "可以", "同意", or "继续" confirm only the current decision. They do not authorize implementation.
- Start implementation only after an explicit instruction such as "开始实施", "按方案实施", or another unambiguous request to make the changes.
- After implementation is authorized, continue through the agreed scope without repeatedly asking for confirmation unless a new material decision, destructive action, production operation, or scope expansion appears.

## Greenfield Medley Work

- Before working on or delegating the greenfield medley calculator, read `documents/bandori-team-builder/medley-foundation.md` and the current greenfield foundation implementation. Require every delegated reviewer to do the same before offering conclusions.
- Delegated conclusions are evidence, not authority. The primary agent must independently verify them against the documented contract, greenfield code, and authoritative calculation sources before adoption; old solver and experiment code is not architectural authority.
- Keep changes within the established contract and current phase. Do not add speculative optimization, fallback, validation, abstraction, or compatibility behavior without a concrete requirement and a reviewed need.

## Repository and Cross-Repository Boundaries

- `hhwx` owns the public Web application, frontend and public API contracts, the canonical Supabase schema and migrations, and public project documentation.
- `../hhwx-bandori-backend` owns scraping, synchronization, master-artifact production, maintenance jobs, and private user-fetcher services.
- `../hhwx-assets-builder` owns AssetBundle extraction, generated asset indexes, object publication, and publication verification.
- Choose the task's starting repository by the primary contract or source of truth: Web UI, public API, or schema-led work normally starts in `hhwx`; scraping or synchronization-led work normally starts in `hhwx-bandori-backend`.
- Do not modify a sibling repository merely because it is related. The user's request or an explicitly confirmed plan must place that repository in scope.
- Before modifying an in-scope sibling repository, read its root `AGENTS.md` when present and the relevant ownership, README, deployment, or contract documentation. If no `AGENTS.md` exists, the repository documentation and existing implementation remain the evidence source; do not invent missing policy.
- Apply each repository's rules only to its own files. Inspect, validate, and report each repository separately, and state any required rollout or deployment order.

## Shared Engineering Requirements

### Reuse, Change Scope, and Dependencies

- Before adding a component, hook, service, utility, script, cache, fixture, or operational flow, inspect nearby implementations, current callers, and contracts. Reuse or extend a mature implementation when its responsibility, lifecycle, security boundary, and data contract are a semantic fit; do not introduce a parallel abstraction merely to avoid a small adaptation.
- Do not force reuse when those semantics differ. When a new abstraction is necessary, keep its boundary explicit and explain why the existing implementation is unsuitable.
- Preserve the current data source, source owner, source of truth, and access layer unless the task explicitly changes them. Do not move data to Supabase, R2/CDN, tracker, or an external API merely for local convenience.
- For ordinary fixes and features, keep structural changes local to what the task requires. Discuss broad or cross-domain refactors before implementation. Report every task-required local refactor concretely in the final handoff, including what moved or changed and why.
- Prefer the platform, the established framework, and already-installed packages over a new dependency when they meet the requirement. Treat a new runtime dependency or replacement of an established dependency as a material design decision: explain why current capabilities are insufficient and discuss it before adding unless the user has already approved it. Add a development-only dependency only for a task-required test, build, code-generation, or tooling need, and report it in the final handoff.
- Put packages imported by application runtime code in `dependencies`; packages used only for tests, linting, type checking, builds, code generation, or other development tooling belong in `devDependencies`. Use the repository's existing package manager, update the manifest and lockfile together, do not hand-edit the lockfile, and avoid unrelated lockfile churn.

### Architecture and Established Stack

- Stay within the established Next.js App Router, React, strict TypeScript, and Tailwind stack. Prefer the repository's existing Shadcn/Radix primitives, Zustand stores, Recharts, dnd-kit, `clsx` plus `tailwind-merge`, and `@/*` imports over parallel replacements when they fit.
- Keep pages and API routes thin: they compose UI or parse requests, enforce authorization, call services, and format responses. Put shared business rules in focused hooks, pure utilities, or service modules.
- Keep pure computation independent of JSX, DOM events, and network requests. Centralize shared data fetching, cache policies, subscriptions, DTO mapping, and compatibility logic instead of duplicating them across pages or routes.
- Keep expensive browser computation off the main thread through the established worker or asynchronous-isolation patterns. Reuse centralized cache policies and tags rather than scattering TTLs, `revalidate` values, or tag names.

### Naming and Compatibility Contracts

- Follow nearby naming and directory conventions. New variables, functions, ordinary internal object keys, hook names, and internal DTO fields use camelCase. Components, types, interfaces, and enums use PascalCase; module-level immutable constants normally use UPPER_SNAKE_CASE; booleans use readable prefixes such as `is`, `has`, `should`, or `can`. Avoid unclear abbreviations beyond established terms such as API, DTO, URL, and ID.
- New standalone component files use `PascalCase.tsx`, hook files use `useCamelCase.ts` or `useCamelCase.tsx`, and shared utilities, services, cache modules, and adapters use `kebab-case.ts`. Keep Next.js framework-reserved names such as `page.tsx`, `layout.tsx`, and `route.ts` unchanged.
- New database tables, views, materialized views, and join tables use plural `snake_case` noun phrases; columns, SQL result fields, and Row types use `snake_case`. Map database and third-party fields to camelCase domain objects and project-owned API JSON at the service boundary, except at a registered compatibility or wire-protocol boundary.
- Keep names for the same entity traceable across layers. Do not opportunistically rename existing legacy files, singular tables, symbols, or fields merely to match preferred style.
- Treat public URLs, API paths, App Router dynamic segments, persisted identifiers, environment variables, external protocol fields, and registered API response shapes as compatibility contracts. Rename or break them only with an explicit migration or compatibility plan.

### Security and Asset Boundaries

- Browser code may use only the configured Supabase publishable key and normal authenticated user sessions. Secret or service-role keys, private environment variables, RLS-bypass logic, signing capabilities, and private storage credentials must remain server-only.
- New modules with private credentials, RLS-bypass access, private object-storage access, or other privileged server capabilities use the `*-server.ts` suffix by default and must be added by exact path to `.claude/rules/server-services.md`. A suffix alone does not classify an existing module: `bandori-server.ts` is the shared Bandori region-domain module and remains browser-safe.
- Server-side code must not fetch HHWX-owned public CDN URLs for catalogs, manifests, indexes, or aggregate metadata. Use the established private object-storage path; public CDN reads are for browsers and external clients.
- Static resources under `public/res/**`, and any other resources explicitly served with immutable caching, must use a new file name or path when their content changes. Update consumers instead of overwriting different content at an existing URL. This does not make every file under `public/**` immutable.

## Language and Documentation

- Use the user's current language when communicating with the user.
- Public project documentation, design notes, and code comments default to English. User-facing localized copy and audience-specific operational material may use their intended language.
- Do not bulk-translate existing documentation or comments. When a file is substantially edited, migrate touched long-lived documentation or comments to English where practical.
- Important public collaboration documents, including README, contributing, security, notice, setup, CDN, and layout documentation, keep their established English canonical file and `.zh-CN.md` counterpart. Update or explicitly review both when their contract changes; the translation need not be word-for-word but must preserve license, security, deployment, and compatibility boundaries.
- Comments for critical logic, complex algorithms, and business rules explain why the design exists rather than restating the code. Add a short responsibility and constraint header to a complex hook, core service, or key API route only when that context is not otherwise obvious; avoid low-value commentary.
- When package scripts, deployment flow, environment variables, data contracts, or external dependency constraints change, update the related documentation in the same change.
- When adding, deleting, or renaming top-level directories, major business directories, or shared module directories, update `documents/layout.md`. Ordinary component, style, and test files do not require a layout update.

## Verification and Handoff

- Treat the current scripts in `package.json` as the command source of truth; inspect them instead of relying on a duplicated dev/start/build command list in Agent rules.
- Start with the narrowest existing test, retained fixture, audit, type check, or dry-run that proves the changed behavior. Add or update a focused fixture when a regression cannot otherwise be demonstrated reliably, and never weaken an assertion or audit merely to make a change pass.
- Add `npm run typecheck` when TypeScript behavior, shared types, or cross-module contracts change. Add `npm run i18n:check` when message catalogs, namespace configuration, or the localization pipeline changes. Expand to the current lint and production-build scripts for broad or cross-cutting application code, public API route, build configuration, or open-source-readiness changes when feasible.
- Preserve established compatibility and fallback behavior unless the task explicitly changes that contract. When source selection or fallback logic changes, verify both the primary and fallback paths when feasible and report any path that could not be exercised.
- Do not treat unavailable infrastructure, credentials, or production access as permission to substitute a destructive or lower-confidence check. Report the limitation and the strongest safe verification completed.
- Do not run production writes, broad live synchronization, large uploads, or credential-dependent validation unless the user explicitly authorizes that operational scope.
- Final handoff must identify changed files and behavior, every local refactor, dependency changes, verification performed and omitted, compatibility or fallback decisions, and cross-repository rollout order when applicable.

## `.claude` Rule Map

- Codex preflight: before inspecting or modifying repository files, inspect the `paths` frontmatter in all six topic rule files below and read every rule whose paths match any file in the task scope. Repeat this check whenever the scope expands.
- API routes and related contract checks covered by the paths in `.claude/rules/api-routes.md`: read that file.
- React components and pages covered by the paths in `.claude/rules/frontend-components.md`: read that file.
- Hooks and state modules covered by the paths in `.claude/rules/react-hooks.md`: read that file.
- Server-side service modules covered by the paths in `.claude/rules/server-services.md`: read that file.
- Localization messages, UI source, checks, and documentation covered by the paths in `.claude/rules/localization.md`: read that file.
- Supabase schema, migrations, setup SQL, and service modules covered by the paths in `.claude/rules/supabase.md`: read that file.

## Maintenance

- Keep this file focused on repository-wide behavior and hard boundaries. Put detailed path-specific implementation rules in the matching `.claude/rules/*.md` file.
- Do not duplicate this file in `.claude/CLAUDE.md`, and do not direct Codex to read `.claude/CLAUDE.md`.
- Keep only long-lived, reusable, and verifiable rules. Update or remove obsolete guidance instead of layering exceptions.
