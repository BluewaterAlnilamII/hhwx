---
paths:
  - "messages/**/*.json"
  - "src/**/*.{ts,tsx}"
  - "scripts/check-i18n-messages.mjs"
  - "next.config.mjs"
  - "documents/localization*.md"
---

# Localization and UI Copy Rules

- Treat `messages/zh-CN` as the source locale and key baseline. Every locale must keep the same namespace files and key shape; update affected locale catalogs and call sites together when adding, deleting, or renaming a key.
- Use stable semantic message keys rather than source text as keys. Keep each key in the narrowest existing namespace that owns the UI or workflow.
- Keep ICU placeholder names and argument semantics consistent across locales. Do not translate placeholder identifiers, and preserve the corresponding plural or select structure when a message uses it.
- Run `npm run i18n:check` after changing message catalogs, namespace configuration, or the localization pipeline. Resolve missing or extra keys and placeholder mismatches instead of bypassing the check.
- New or task-touched short UI copy (labels, buttons, one-sentence descriptions, errors, helper text, empty states, and statuses) must not end with `。` or `.`. Multi-sentence prose may use full stops; meaningful question marks, exclamation marks, and ellipses are allowed. User-authored text, protocols, logs, SEO metadata, legal text, and documentation are exempt. Do not bulk-clean historical copy.
