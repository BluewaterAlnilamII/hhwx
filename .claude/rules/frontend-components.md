---
paths:
  - "src/components/**/*.tsx"
  - "src/app/**/*.tsx"
  - "src/**/*.css"
---

# React Component and Page Rules

- Follow applicable build-web-apps React and Shadcn guidance. Inherit the reference page's applicable information scope, defaults, search/filter/sort semantics, state behavior, composition, and responsive interaction; reusing primitives alone does not establish consistency.
- Compose suitable existing components and design tokens; adopt mature primitives when they improve the requested interaction or accessibility. Keep the established visual language and page pattern unless a change is in scope. Do not add controls or displayed information solely because the underlying data makes them possible; locale, game server, and resource identity retain their own contracts.
- Follow the current [Theme Guide](../../documents/theme-guide.md). Keep palette and decorative effects in `src/app/visual-theme/`; components consume semantic tokens, not theme seeds or private palette variables. Shared recipes derive defaults; theme-specific and color-scheme overrides belong in the theme file.
- Use the Theme Guide's shared appearance classes, paired color roles, loading components, and interaction rules. Remove local classes that compete with a shared role; preserve documented domain-artwork exceptions and actual logo geometry. Keep detailed role mappings and exceptions in that guide rather than duplicating them here.
- Keep the client boundary as small as practical. Add `"use client"` for browser APIs, client hooks, or interaction. Keep secrets and privileged logic server-side; pass only the authorized fields the UI needs as React-serializable props from Server Components.
- Components own presentation and interaction. Map database and historical wire contracts at their service or adapter boundary. Extract complex derivation or orchestration when it improves clarity or reuse, without requiring a hook or file for every helper.
- Make timing, cancellation, and UI transitions understandable and race-safe. Use explicit phases when the interaction needs them, rather than imposing a state-machine structure on every component.
- For rendered changes, use the focused browser workflow on the affected page, interaction, and relevant viewport. Compare affected composition, defaults, and loading/empty/error/refresh behavior with the reference, including applicable keyboard/touch access and runtime errors. Passing tests or builds does not establish visual or behavioral parity.
