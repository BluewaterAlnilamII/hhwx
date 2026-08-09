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
- Short UI copy, including labels, buttons, single-sentence descriptions, errors, helper text, empty states, and status messages, must not end with a Chinese full stop (`。`) or ASCII period (`.`).
- Full stops are allowed for genuinely multi-sentence long-form UI prose. Question marks, exclamation marks, and ellipses remain allowed when they carry the intended meaning.
- The UI punctuation rule does not apply to user-authored text, protocol payloads, logs, SEO metadata, legal text, or formal documentation.
- Apply the punctuation rule to new or task-touched copy. Do not perform a bulk cleanup of historical text solely to enforce it.
