---
paths:
  - "src/hooks/**/*.{ts,tsx}"
  - "src/app/**/use*.{ts,tsx}"
---

# Hooks and State Management Rules

- Organize hooks around a single responsibility, such as data fetching and caching, interaction flow orchestration, or a domain state machine. Do not bundle unrelated responsibilities into one hook.
- Hook return values, callback names, and state fields exposed to callers use camelCase.
- Shared state orchestration across components should move into hooks or a Zustand store. Do not copy the same `useEffect` / `useState` logic across pages.
- When caching, subscription merging, concurrency races, or visibility refresh behavior is involved, comments must explain the key design reason, especially why the approach avoids state rollback or duplicate requests.
- Network requests, subscriptions, timers, and async callbacks inside hooks must include cleanup or race protection so parameter changes, identity changes, or component unmounts do not write stale state.
- Zustand stores may group state and actions by responsibility, but do not put unrelated business domains into the same store.
- Hook boundaries should stay clear. If logic no longer depends on React lifecycle or state, move it further down into a pure `lib` function or service module.
