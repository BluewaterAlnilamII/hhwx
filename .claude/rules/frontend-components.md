---
paths:
  - "src/components/**/*.tsx"
  - "src/app/**/*.tsx"
  - "src/**/*.css"
---

# React Component and Page Rules

- Follow applicable build-web-apps React and Shadcn guidance. Compose suitable existing components and design tokens; adopt mature primitives when they improve the requested interaction or accessibility. Keep the site's established visual language unless a redesign is in scope.
- Keep palette and decorative effects in `src/app/visual-theme/`; components consume semantic tokens, not theme seeds or private palette variables. Shared recipes derive defaults; theme-specific and color-scheme overrides belong in the theme file.
- Page panels and nested content containers share `--theme-color-panel-background`. Use `hhwx-panel` for page-level shape, border and elevation; nested containers consume the background token directly and retain their own geometry. Loading scrims and selection ring offsets follow their containing surface. Chart plotting areas, floating surfaces and individual controls retain their own tokens; do not recolor them through a shared seed change.
- Derive decorative site logos from the actual icon asset, preserving its contour and negative space.
- Keep the client boundary as small as practical. Add `"use client"` for browser APIs, client hooks, or interaction. Keep secrets and privileged logic server-side; pass only the authorized fields the UI needs as React-serializable props from Server Components.
- Components own presentation and interaction. Map database and historical wire contracts at their service or adapter boundary. Extract complex derivation or orchestration when it improves clarity or reuse, without requiring a hook or file for every helper.
- Make timing, cancellation, and UI transitions understandable and race-safe. Use explicit phases when the interaction needs them, rather than imposing a state-machine structure on every component.
- For rendered changes, use the focused browser workflow on the affected page, interaction, and relevant viewport. Check visual results and accessibility as well as runtime errors. New surfaces or redesigns also follow the applicable concept/design workflow; routine fixes do not trigger it.
