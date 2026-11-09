---
paths:
  - "messages/**/*.json"
  - "src/**/*.{ts,tsx}"
  - "scripts/check-i18n-messages.mjs"
  - "next.config.mjs"
  - "documents/localization*.md"
---

# Localization and UI Copy Rules

- Default to no additional UI copy. Add text only when it is necessary to identify content, operate a control, or recover from a blocking failure; use the shortest clear wording and reuse existing shared labels. Do not create resource-specific or initial-load/refresh variants of generic errors, expose implementation details such as cached-data fallbacks, or repeat a message already conveyed by the module state. Review task-touched copy against this rule before handoff.
- Action feedback must use the same verb as the user-facing action: posting fails to post, saving fails to save. Do not substitute implementation terms such as submit or request for the product action.
- Do not render raw exception messages or HTTP details as action feedback. Use the shared presentation with the action's concise result; preserve specific guidance only for recognized, actionable validation or permission errors mapped to localized messages.
- Treat `messages/zh-CN` as the source locale and key baseline. Every locale must keep the same namespace files and key shape; update affected locale catalogs and call sites together when adding, deleting, or renaming a key.
- Use stable semantic message keys rather than source text as keys. Keep each key in the narrowest existing namespace that owns the UI or workflow.
- Keep ICU placeholder names and argument semantics consistent across locales. Do not translate placeholder identifiers, and preserve the corresponding plural or select structure when a message uses it.
- Run `npm run i18n:check` after changing message catalogs, namespace configuration, or the localization pipeline. Resolve missing or extra keys and placeholder mismatches instead of bypassing the check.
- New or task-touched short UI copy (labels, buttons, one-sentence descriptions, errors, helper text, empty states, and statuses) must not end with `。` or `.`. Multi-sentence prose may use full stops; meaningful question marks, exclamation marks, and ellipses are allowed. User-authored text, protocols, logs, SEO metadata, legal text, and documentation are exempt. Do not bulk-clean historical copy.
