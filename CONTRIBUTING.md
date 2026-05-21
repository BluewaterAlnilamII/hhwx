# Contributing

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

## Issues and Security

Use normal issues for bugs, feature requests, and documentation gaps. Report security problems privately using [SECURITY.md](SECURITY.md).
