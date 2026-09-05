# Contributing

中文说明见 [CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md).

Thanks for taking the time to improve HHWX.

## Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Verification

Choose checks for the affected behavior and risks. Use the current scripts in `package.json`; the table describes when to use them, not a requirement to run every suite locally. Required CI checks still apply.

| Change | Appropriate verification |
| --- | --- |
| Documentation or agent rules only | Check the diff, links, rule paths/imports, and affected bilingual content. Application tests and builds are unnecessary unless executable behavior/configuration also changes. |
| Message catalogs or localization configuration | Run `npm run i18n:check`; inspect affected rendered copy when applicable. |
| Application logic, types, or API contracts | Run focused existing behavior/contract tests and `npm run typecheck` for TypeScript behavior or shared-type changes. Cover affected authorization and fallback paths. |
| Rendered UI or interactions | Check the affected page and interaction in a browser, including relevant viewports, accessibility, and runtime errors. A manual check does not replace useful automated regression coverage. |
| Supabase schema, RLS, grants, or privileged SQL | Follow [Supabase Setup](documents/supabase-setup.md): review/replay changed migrations, retain affected allow/deny regression tests under intended roles, and review applicable Advisors findings. |
| Supabase Auth, session, or Realtime client behavior | Verify the affected flow and authorization/session transitions. Migration replay and new SQL tests apply only if database behavior also changes. |
| Build, dependency, or application integration changes | Use the applicable lint and production-build checks; broaden behavior tests to the affected consumers. |

Reuse existing tests before adding new ones. Add a focused regression check for otherwise unprotected behavior; avoid tests that merely freeze incidental source text, naming, or CSS classes. Preserve checks that protect security, compatibility, accessibility, and independent scoring/search correctness.

Successful local or CI results can be reused when the relevant code, dependencies, configuration, and environment are equivalent. Stop once the necessary checks pass; repeat or broaden only after a relevant change, failure, or unresolved risk. State what ran and any material coverage limitation. Performance claims require suitable before/after evidence; large private benchmarks are not a routine prerequisite.

### Rust and WebAssembly

For Rust changes, select native tests and formatting/lint checks for the affected crates and behavior, preserving independent scoring/search reference checks. Test/reference-only edits do not automatically require WASM checks; include WASM compilation when production code, dependencies, configuration, or toolchain changes affect that target. Prose-only edits need documentation review. The full workspace check commands are:

```bash
npm run format:medley-foundation
npm run lint:medley-foundation
npm run test:medley-foundation
npm run check:medley-foundation:wasm
```

When shipped Rust behavior or its build inputs change, run `npm run build:medley-foundation:wasm` and include the updated package under `src/lib/bandori/medley-wasm/pkg/`. Verify affected source-normalization and browser-delivery behavior as described in [Medley Testing](documents/bandori-team-builder/medley-testing.md). A Next.js build does not regenerate or execute that package. Required CI and release checks still apply.

## Guidelines

- Keep secrets and private deployment details out of commits.
- Use the surface's active locale for product copy. Keep `messages/zh-CN` as the catalog/key baseline and update affected locale catalogs together.
- Keep internal route names, API paths, and database identifiers stable unless a change explicitly requires a migration.
- Prefer small, focused changes with documentation updates when behavior changes.
- When touching Supabase SQL, review row-level security, grants, `security definer` functions, and service-role-only assumptions.
- When touching Bandori or Bestdori compatibility logic, document the data source and compatibility boundary.

## Pull Requests

- Keep pull requests focused on one bug fix, feature, or documentation update.
- Explain user-visible behavior changes and any migration or deployment steps.
- Include screenshots or short recordings for meaningful UI changes.
- Do not include generated build output, local caches, real environment files, or private deployment scripts. The versioned WebAssembly package under `src/lib/bandori/medley-wasm/pkg/` is the deliberate exception because the application imports it directly.
- Update README, setup notes, or schema documentation when commands, environment variables, database objects, API contracts, or external service assumptions change.

## Documentation Language

Public project documentation and deployment notes should default to English. Important collaboration documents also keep Chinese translations with a `.zh-CN.md` suffix. User-facing product copy, China-region operational notes, and historical Chinese-only design notes may remain Chinese when that better serves the target audience.

If a topic needs both languages, keep English as the canonical public document and place the Chinese translation next to it with a `.zh-CN.md` suffix, for example `guide.md` and `guide.zh-CN.md`.

When changing important public documents, update or explicitly review the matching Chinese document in the same change. The Chinese version does not need to be a word-for-word translation, but it must preserve the same license, security, deployment, and compatibility boundaries.

## Issues and Security

Use normal issues for bugs, feature requests, and documentation gaps. Report security problems privately using [SECURITY.md](SECURITY.md).
