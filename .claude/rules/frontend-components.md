---
paths:
  - "src/components/**/*.tsx"
  - "src/app/**/*.tsx"
---

# React Component and Page Rules

- Components should primarily handle view composition and interaction orchestration. Do not stack large amounts of data cleanup, protocol compatibility, or database semantics inside components.
- Name reusable component prop types `ComponentNameProps` and keep them near the component where possible for readability and refactoring. Entry files such as `page.tsx` and `layout.tsx` are not required to follow this props naming convention.
- Add `"use client"` only when browser APIs, interactive state, event handlers, or client hooks are actually needed. Keep pure presentation and pure server logic as server components by default.
- Move complex derived state into hooks or pure `lib` functions. Avoid large conditional branches and mapping transformations inside JSX.
- When a component consumes server-returned data, prefer DTOs that have already been mapped to camelCase. Do not handle `snake_case` data directly at the component layer.
- Pages and components must not directly assemble database protocols or historical API compatibility logic. When legacy protocol compatibility is needed, map it at the service, adapter, or route boundary.
- For UI with expensive computation, complex animation timing, or presentation state-machine behavior, explicitly split phase state and flow functions. Do not scatter timing logic across anonymous callbacks.
