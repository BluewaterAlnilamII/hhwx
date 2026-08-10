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
|-- messages/         # Locale message catalogs for UI translations
|-- public/           # Static assets served directly by Next.js
|-- scripts/          # Local maintenance and validation scripts
|-- src/
|   |-- app/          # App Router pages, layouts, metadata, and API routes
|   |-- components/   # Shared UI components and site shell components
|   |-- hooks/        # Reusable state and data-fetching hooks
|   |-- i18n/         # Locale routing, request config, and navigation wrappers
|   |-- lib/          # Server logic, business services, validation, and utilities
|   `-- store/        # Shared client-side state
|-- supabase/         # Supabase CLI config, migrations, legacy schema SQL, and maintenance SQL
`-- package.json      # Frontend dependencies and script entry points
```

## src/app

- `[locale]/`: localized application routes. The default `zh-CN` locale is served without a URL prefix; non-default locales use a locale prefix such as `/en`.
- `[locale]/account/`: account center, profile, email, and password pages.
- `[locale]/bandori/game-profiles/`: game profile card and item views.
- `[locale]/auth/`: sign-in, registration, and password recovery pages.
- `[locale]/bandori/events/`: event tracker entry and event-ID routes. Route-local event information and tracker implementations are grouped under `_info/` and `_tracker/`; the former `/bandori/eventtracker` URL is a permanent redirect handled by `src/proxy.ts`.
- `[locale]/bandori/cards/`: server-aware Card catalog and per-card detail routes, with page-private UI grouped under `_components/`.
- `[locale]/bandori/calendar/`: regional event calendar pages.
- `api/`: same-origin API routes used by the frontend.
- `api/account/game-bind/`: game account binding challenge, verification, listing, and unlinking APIs.
- `api/account/game-profiles/`: game profile sync, import, export, copy, and deletion APIs.
- `api/bandori/`: public Bandori metadata APIs for characters, songs, area items, and related data.
- `manifest.ts`: default-locale web app manifest kept at `/manifest.webmanifest`.
- `globals.css`: global styles, animations, and shared visual rules.

## messages

- `zh-CN/`: source locale and key baseline for all namespaces.
- `en/`: English translations with the same namespace files and key shape as `zh-CN/`.
- Namespace files use stable semantic keys and ICU-style placeholders. Run `npm run i18n:check` after message changes.

## src/i18n

- `routing.ts`: supported locales, default locale, prefix behavior, and locale path helpers.
- `navigation.ts`: locale-aware wrappers for `Link`, router, pathname, and path generation.
- `request.ts`: next-intl request configuration and message namespace loading.
- `src/proxy.ts`: locale negotiation proxy that excludes API routes, Next internals, Vercel internals, and static files.

## src/components

- `AppChrome.tsx`: site layout shell for shared header and sidebar state.
- `Toolbar.tsx`: top toolbar.
- `SectionSidebarShell.tsx`: shared sidebar container.
- `TurnstileChallenge.tsx`: security verification component for sensitive actions.
- `comments/`: target-agnostic comment thread, composer, item, emoji, and stamp-picker UI.
- `bandori/`: reusable Bandori media and selection UI shared across routes, including Card art and stamp rendering.
- Other components are grouped by home-page game, account, and reuse contexts.

## src/hooks

- Shared hooks own reusable browser state and request orchestration. Target-specific route/query adapters stay with their route; for example, `useCommentThread.ts` is generic while the Bandori event URL adapter remains under the events route.

## src/lib

- `auth-*.ts`, `supabase-*.ts`, `turnstile-server.ts`, and `turnstile-public.ts`: authentication, security verification, and server/public wrappers.
- Remaining root-level `bandori-*.ts` and `calendar-*.ts`: shared cross-domain infrastructure and compatibility entry points that do not belong to one feature folder.
- `bandori/cards/`: Card catalogs, regional materialization, API contracts/services, release/training rules, generated Card metadata, layouts, and profile-card helpers.
- `bandori/events/`: event catalogs, API contracts/services, route/region/status helpers, banner proxy logic, and event-specific comment target validation.
- `bandori/event-tracker/`: Event Tracker cutoff, TOP10, live-series, projection, history, and prediction contracts/services shared by event, song, and monthly tracker modes.
- `bandori/team-builder/`: team-search implementation. `core/` contains shared calculation primitives, `single/` contains single-song exact search orchestration, and `medley/` contains medley exact/bounded search orchestration behind the public compatibility facades.
- `comments/`: target-agnostic comment contracts, emoji/stamp catalogs, content parsing, and privileged comment persistence service. Each target type keeps its existence and visibility validation in its own domain.
- `api-*.ts`: API response conventions and cache policies.
- `bestdori-profile-codec.ts` and `user-game-*-server.ts`: game profile compatibility, sync, and server-side persistence logic.
- `characters.ts`, `othello.ts`, and `ai/`: home-page Othello and character logic.

## scripts

- `check-i18n-messages.mjs`: validates locale namespace parity and placeholder parity against `messages/zh-CN`.

## supabase

- `config.toml`: Supabase CLI local project configuration. It mirrors HHWX's Data API posture by keeping automatic exposure for new public tables disabled.
- `migrations/`: canonical versioned database migrations for new Supabase schema changes.
- `schema/`: legacy baseline and compatibility SQL retained during the migration-first transition.
- `maintenance/`: manual observation and maintenance queries only. Do not treat files here as migrations.

## Maintenance Rules

- `README.md` is the project-level entry point.
- This file keeps only stable directory responsibilities.
- When adding a page or service, update this file only if the change modifies directory responsibility boundaries.
