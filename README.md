# HHWX

HHWX is a Next.js App Router application for a small set of community tools and experiments:

- an Othello-style home page with character interactions;
- Bandori CN event calendar views;
- Bandori event tracker data display;
- Bandori game profile import, sync, card, item, and team-builder tools;
- account, email, password, comments, and verified-user workflows backed by Supabase.

This is an unofficial fan/tool project. It is not affiliated with, endorsed by, or sponsored by BanG Dream!, Bushiroad, Craft Egg, Bestdori, Bilibili, Cloudflare, Supabase, or any other referenced third party. Third-party names, trademarks, game data, and media remain the property of their respective owners.

## Status

The repository is suitable for local development and self-hosted deployment, but some production services are intentionally external:

- Supabase provides auth, database, realtime, and server-side service access.
- Cloudflare Turnstile is optional and protects sensitive flows when configured.
- `cdn.hhwx.org` is the current production CDN for static site and Bandori asset mirrors. Self-hosted deployments should use their own CDN or asset host, and must not treat the production domain as part of the open-source license.
- `hhwx-tracker` is a separate service used for tracker data ingestion and game-account sync. This repository only contains the web application.

## Requirements

- Node.js 20.9 or newer
- npm
- A Supabase project for account-backed features
- Optional: Cloudflare Turnstile site and secret keys
- Optional: a deployed HHWX user fetcher service for game-account binding and manual sync

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

The default local URL is `http://localhost:3000`.

Public Bandori metadata pages can render with only the public environment values. Account-backed pages and write APIs require the Supabase schema and service key described below.

## Environment

Copy [.env.example](.env.example) to `.env.local` and fill in the values for your own deployment.

Important rules:

- `NEXT_PUBLIC_*` values are exposed to browsers.
- `SUPABASE_SECRET_KEY`, `TURNSTILE_SECRET_KEY`, and `HHWX_USER_FETCHER_TOKEN` are server-side secrets and must not be committed.
- `NEXT_PUBLIC_SITE_ASSET_CDN_BASE_URL` and `NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL` should point to your own CDN. The production `cdn.hhwx.org` value is only a public static asset host and does not grant rights to third-party game assets.
- Asset and CDN examples are deployment configuration only. See [NOTICE.md](NOTICE.md) before mirroring, caching, or redistributing third-party game content.

## Scripts

```bash
npm run dev
npm run lint
npm run build
npm run start
```

## Supabase Setup

The canonical schema files are under [supabase/schema](supabase/schema), with older incremental SQL still kept under [documents](documents). See [documents/supabase-setup.md](documents/supabase-setup.md) for the recommended execution order and notes on RLS and service-role-only functions.

## Repository Layout

```text
hhwx/
├── documents/      # product notes, setup notes, and historical SQL
├── public/         # static assets served directly by Next.js
├── src/
│   ├── app/        # App Router pages, layouts, metadata, and API routes
│   ├── components/ # shared React UI components
│   ├── hooks/      # reusable hooks
│   ├── lib/        # server and shared business logic
│   └── store/      # client state
├── supabase/       # canonical schema and manual maintenance SQL
└── package.json    # scripts and dependencies
```

More detail is available in [documents/layout.md](documents/layout.md).

## Security

Please report security issues privately instead of opening a public issue. See [SECURITY.md](SECURITY.md).

## Contributing

Contributions should keep secrets out of the repository, keep public docs free of private deployment details, and run `npm run lint` plus `npm run build` before review. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Copyright (c) 2026 BluewaterAlnilamII.

The code, documentation, and original project materials in this repository are licensed under the GNU Affero General Public License v3.0 only. See [LICENSE](LICENSE).

The AGPL permits study, modification, redistribution, and self-hosted deployment under its terms. If you modify the software and make it available to users over a network, the AGPL requires you to offer the corresponding source code to those users.

This license does not grant any rights to third-party game assets, media, trademarks, or CDN-hosted content that are not part of this repository. See [NOTICE.md](NOTICE.md).
