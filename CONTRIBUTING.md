# Contributing

中文说明见 [CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md).

Thanks for taking the time to improve HHWX.

## Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Before submitting changes, run:

```bash
npm run lint
npm run build
```

## Guidelines

- Keep secrets and private deployment details out of commits.
- Keep user-facing behavior in Chinese unless a feature already has an English-specific surface.
- Keep internal route names, API paths, and database identifiers stable unless a change explicitly requires a migration.
- Prefer small, focused changes with documentation updates when behavior changes.
- When touching Supabase SQL, review row-level security, grants, `security definer` functions, and service-role-only assumptions.
- When touching Bandori or Bestdori compatibility logic, document the data source and compatibility boundary.

## Pull Requests

- Keep pull requests focused on one bug fix, feature, or documentation update.
- Explain user-visible behavior changes and any migration or deployment steps.
- Include screenshots or short recordings for meaningful UI changes.
- Do not include generated build output, local caches, real environment files, or private deployment scripts.
- Update README, setup notes, or schema documentation when commands, environment variables, database objects, API contracts, or external service assumptions change.

## Documentation Language

Public project documentation and deployment notes should default to English. Important collaboration documents also keep Chinese translations with a `.zh-CN.md` suffix. User-facing product copy, China-region operational notes, and historical Chinese-only design notes may remain Chinese when that better serves the target audience.

If a topic needs both languages, keep English as the canonical public document and place the Chinese translation next to it with a `.zh-CN.md` suffix, for example `guide.md` and `guide.zh-CN.md`.

When changing important public documents, update or explicitly review the matching Chinese document in the same change. The Chinese version does not need to be a word-for-word translation, but it must preserve the same license, security, deployment, and compatibility boundaries.

## Issues and Security

Use normal issues for bugs, feature requests, and documentation gaps. Report security problems privately using [SECURITY.md](SECURITY.md).
