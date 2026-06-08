# Localization Workflow

中文说明见 [localization.zh-CN.md](localization.zh-CN.md).

HHWX uses `next-intl` message catalogs stored in `messages/<locale>/<namespace>.json`.

## Source Locale

- `zh-CN` is the source locale and key baseline.
- Other locales must keep the same namespace files, key shape, and ICU-style placeholders as `zh-CN`.
- Chinese default URLs stay unprefixed. Non-default locales use a prefix such as `/en`.

## Key Rules

- Use stable semantic keys, not source text as keys.
- Keep namespace ownership narrow:
  - `common`: shared actions and generic states.
  - `navigation`: toolbar and sidebar labels.
  - `metadata`: page metadata and manifest text.
  - `auth`: sign-in, registration, password recovery, email confirmation, and auth validation.
  - `account`: account center, public profile, profile/password/email/notification pages.
  - `othello`: home-page game strings.
  - `errors`: frontend mappings for stable API `error.code` values.
- Do not rename existing keys unless all locale files and call sites are updated in the same change.

## Placeholders

- Keep placeholders identical across locales. Example: `{username}`, `{status}`, `{count}`.
- Do not translate placeholder names.
- Preserve the same placeholder count and meaning even if sentence order changes.

## Stale Translations

- If source text changes but a translator cannot update every locale immediately, keep the existing translation and add a follow-up issue or PR note.
- Do not delete target-locale keys to signal staleness; deletion breaks runtime lookups and `npm run i18n:check`.
- Prefer small namespace-scoped translation PRs so reviewers can compare source and target changes directly.

## Validation

Run this after editing messages:

```bash
npm run i18n:check
```

The check compares every locale against `messages/zh-CN`, reports missing or extra keys, and verifies placeholder parity.

## Future Translation Platform

The JSON structure is intentionally compatible with later Crowdin or Weblate import/export. External TMS integration is not required for the first i18n version.
