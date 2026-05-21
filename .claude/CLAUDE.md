# hhwx Claude Rules

This directory centralizes hhwx project rules for Claude Code. The compatible Codex entry point is `AGENTS.md` at the repository root. Rule changes that affect Codex behavior must also update that file.

## Rule Priority

- The user's current explicit request takes priority over repository rules, but it must not bypass security, authorization, privacy, or data-integrity boundaries.
- `.claude/CLAUDE.md` and rule files without `paths` frontmatter apply globally. Rule files with `paths` frontmatter apply only when handling matching files.
- If a rule conflicts with an existing public license or contract, keep compatibility first and explain why. Breaking changes require a migration plan.
- If a rule conflicts with local code style, prefer the rule, but do not perform broad formatting, renaming, or structural migrations in unrelated tasks.

## Global Requirements

- Use the user's current language when talking with the user. Public project documentation, design notes, and code comments default to English.
- Existing Chinese documentation and comments do not require a one-time bulk migration. When a related file is substantially edited, migrate touched long-lived documentation or comments to English where practical.
- User-facing Chinese product copy, Chinese operational notes, and historical Chinese-only materials may remain Chinese. External protocols, API fields, error codes, and deployment documentation should prefer English.
- Important public collaboration documents keep Chinese translations with `.zh-CN.md` siblings. When editing README, contributing, security, notice, setup, CDN, or layout docs, update or explicitly review the matching Chinese document in the same change.
- New features and refactors must keep module boundaries clear. Avoid coupling multiple responsibilities into the same component, hook, route, or service module.
- New code must follow the naming rules. If code touched by the current task clearly violates them, it may be corrected as part of the same change.
- When adding, deleting, or renaming top-level directories, major business directories, or shared module directories, update `documents/layout.md`. Ordinary component files, local style files, and test files do not require layout documentation updates.
- Verify changes with the narrowest relevant check. For broad code, schema, route, or open-source-readiness changes, run `npm run lint` and `npm run build` when feasible.

## Rule Organization

- Rules are split by topic under `.claude/rules/`; each file should cover one topic.
- Rules should describe requirements, defaults, and allowed exceptions. Avoid vague slogans.
- If a new rule conflicts with an existing rule, consolidate the old rule instead of layering another exception on top.

## Maintenance Constraints

- Keep only long-lived, reusable, and verifiable project rules here.
- If a rule only serves a one-off task, do not write it into `.claude`.
- If a rule is obsolete, update or delete it directly instead of preserving outdated guidance.
