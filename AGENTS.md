# hhwx Codex Project Rules

This file is the Codex rule entry point for the hhwx repository. Long-lived repository rules are stored in `.claude/`; when working in this repository, follow this file first, then read `.claude/CLAUDE.md` and matching `.claude/rules/*.md` files as needed.

## Rule Priority

- The user's current explicit request takes priority over repository rules, but it must not bypass security, authorization, privacy, or data-integrity boundaries.
- This file and `.claude/CLAUDE.md` are global rule entry points. Path-matched `.claude/rules/*.md` files provide more specific execution constraints.
- If a rule conflicts with an existing public license or contract, keep compatibility first and explain why. Breaking changes require a migration plan.
- If a rule conflicts with local code style, prefer the rule, but do not perform broad formatting, renaming, or structural migrations in unrelated tasks.

## Global Defaults

- Use the user's current language when talking with the user. Public project documentation, design notes, and code comments default to English.
- Existing Chinese documentation and comments do not require a one-time bulk migration. When a related file is substantially edited, migrate touched long-lived documentation or comments to English where practical.
- User-facing Chinese product copy, Chinese operational notes, and historical Chinese-only materials may remain Chinese. External protocols, API fields, error codes, and deployment documentation should prefer English.
- Important public collaboration documents keep Chinese translations with `.zh-CN.md` siblings. When editing README, contributing, security, notice, setup, CDN, or layout docs, update or explicitly review the matching Chinese document in the same change.
- The technical stack is Next.js App Router, React, TypeScript strict mode, Tailwind CSS, and Supabase.
- Prefer `@/*` imports that point to `src/` to reduce deep relative paths.
- New features and refactors must keep module boundaries clear. Avoid coupling multiple responsibilities into the same component, hook, route, or service module.
- Page components compose UI. API routes parse parameters, enforce authorization, and format responses. Business rules should live in hooks, `src/lib`, or `src/lib/*-server.ts`.
- Browser code must only use anonymous publishable clients. Service role keys, private environment variables, and RLS-bypass logic are only allowed in server-side modules.
- When script commands, deployment flow, environment variables, data contracts, or external dependency constraints change, update the related documentation in the same change.
- Verify changes with the narrowest relevant check. For broad code, schema, route, or open-source-readiness changes, run `npm run lint` and `npm run build` when feasible.

## `.claude` Rule Map

- Global foundation rules: read `.claude/rules/core.md`.
- Documentation and comments: read `.claude/rules/documentation.md`.
- API routes under `src/app/api/**/route.ts`: read `.claude/rules/api-routes.md`.
- React components and pages under `src/components/**/*.tsx` and `src/app/**/*.tsx`: read `.claude/rules/frontend-components.md`.
- Hooks and state management under `src/hooks/**/*.{ts,tsx}` and `src/app/**/use*.{ts,tsx}`: read `.claude/rules/react-hooks.md`.
- Server-side modules under `src/lib/**/*-server.ts` and asset proxy modules: read `.claude/rules/server-services.md`.
- Naming, file organization, API JSON keys, and database naming: read `.claude/rules/naming-and-contracts.md`.

## Maintenance

- Do not copy the full `.claude` rule set into this file. Keep this file limited to the entry point, summary, and rule map needed by Codex to avoid duplicated rules drifting apart.
- When `.claude` changes in a way that affects Codex execution, update the relevant summary or mapping in this file.
- When adding, deleting, or renaming top-level directories, major business directories, or shared module directories, update `documents/layout.md`. Ordinary component files, local style files, and test files do not require layout documentation updates.
