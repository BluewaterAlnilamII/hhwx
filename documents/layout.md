# Project Layout

中文说明见 [layout.zh-CN.md](layout.zh-CN.md).

This document records long-lived directory responsibilities only. It intentionally avoids listing every file so it does not become stale as pages and components evolve.

These local artifacts are not part of the source layout:

- `.next/`
- `node_modules/`
- `tsconfig.tsbuildinfo`

## Top-Level Layout

```text
hhwx/
|-- .claude/          # Project rules and collaboration constraints
|-- documents/        # Product notes, setup notes, and feature SQL
|-- public/           # Static assets served directly by Next.js
|-- src/
|   |-- app/          # App Router pages, layouts, metadata, and API routes
|   |-- components/   # Shared UI components and site shell components
|   |-- hooks/        # Reusable state and data-fetching hooks
|   |-- lib/          # Server logic, business services, validation, and utilities
|   `-- store/        # Shared client-side state
|-- supabase/         # Base Supabase schema and manual maintenance SQL
`-- package.json      # Frontend dependencies and script entry points
```

## src/app

- `account/`: account center, profile, email, and password pages.
- `bandori/game-profiles/`: game profile card and item views.
- `auth/`: sign-in, registration, and password recovery pages.
- `bandori/`: calendar and event tracker pages.
- `api/`: same-origin API routes used by the frontend.
- `api/account/game-bind/`: game account binding challenge, verification, listing, and unlinking APIs.
- `api/account/game-profiles/`: game profile sync, import, export, copy, and deletion APIs.
- `api/bandori/`: public Bandori metadata APIs for characters, songs, area items, and related data.
- `layout.tsx`: root layout and site shell entry point.
- `globals.css`: global styles, animations, and shared visual rules.

## src/components

- `AppChrome.tsx`: site layout shell for shared header and sidebar state.
- `Toolbar.tsx`: top toolbar.
- `SectionSidebarShell.tsx`: shared sidebar container.
- `TurnstileChallenge.tsx`: security verification component for sensitive actions.
- Other components are grouped by home-page game, account, and Bandori reuse contexts.

## src/lib

- `auth-*.ts`, `supabase-*.ts`, and `turnstile-*.ts`: authentication, security verification, and server/client wrappers.
- `bandori-*.ts` and `calendar-*.ts`: compatibility entry points and service logic for Bandori pages and public metadata.
- `bandori/`: domain-organized Bandori modules. `bandori/team-builder/shared/` contains single/medley team-search calculation helpers, and `bandori/team-builder/single/` contains the single-song exact search orchestration behind the legacy `bandori-team-search.ts` facade.
- `api-*.ts`: API response conventions and cache policies.
- `bestdori-profile-codec.ts` and `user-game-*-server.ts`: game profile compatibility, sync, and server-side persistence logic.
- `characters.ts`, `othello.ts`, and `ai/`: home-page Othello and character logic.

## Maintenance Rules

- `README.md` is the project-level entry point.
- This file keeps only stable directory responsibilities.
- When adding a page or service, update this file only if the change modifies directory responsibility boundaries.
