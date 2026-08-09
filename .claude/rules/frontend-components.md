---
paths:
  - "src/components/**/*.tsx"
  - "src/app/**/*.tsx"
---

# React Component and Page Rules

- Inspect existing shared components, primitives, and nearby page patterns before creating a new component. Prefer composing or extending an existing component when its semantics and interaction contract fit the task.
- Components should primarily handle view composition and interaction orchestration. Do not stack large amounts of data cleanup, protocol compatibility, or database semantics inside components.
- Name reusable component prop types `ComponentNameProps` and keep them near the component where possible for readability and refactoring. Entry files such as `page.tsx` and `layout.tsx` are not required to follow this props naming convention.
- Add `"use client"` only when browser APIs, interactive state, event handlers, or client hooks are actually needed. Keep pure presentation and pure server logic as server components by default.
- Move complex derived state into hooks or pure `lib` functions. Avoid large conditional branches and mapping transformations inside JSX.
- Pages and components must not directly assemble database protocols or historical API compatibility logic. When legacy protocol compatibility is needed, map it at the service, adapter, or route boundary.
- For UI with expensive computation, complex animation timing, or presentation state-machine behavior, explicitly split phase state and flow functions. Do not scatter timing logic across anonymous callbacks.
