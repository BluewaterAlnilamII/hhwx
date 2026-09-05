---
paths:
  - "src/hooks/**/*.{ts,tsx}"
  - "src/app/**/use*.{ts,tsx}"
  - "src/store/**/*.{ts,tsx}"
  - "src/lib/**/*-store.ts"
---

# Hooks and State Management Rules

- Keep state with its owner. Share orchestration through a focused hook or store when multiple consumers need it; avoid duplicate effects and unrelated domains in one store.
- Reuse suitable request/cache infrastructure. Review deduplication, cache identity, invalidation, and user-session isolation before adding another fetching layer; apply the relevant React performance guidance.
- Requests, subscriptions, timers, and async callbacks need cleanup or race protection so parameter changes, identity changes, and unmounts cannot commit stale state. Explain non-obvious concurrency or refresh decisions.
- Keep small pure helpers local when cohesive. Extract them for actual reuse, independent verification, or clearer boundaries; lack of a React lifecycle dependency alone does not require relocation.
