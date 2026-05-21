---
paths:
  - "src/lib/**/*-server.ts"
  - "src/lib/bandori-asset-proxy.ts"
  - "src/lib/bandori-event-banner-proxy.ts"
---

# Server Module and Database Boundary Rules

- Server modules bridge databases, external APIs, cache tags, and domain transformations. Exposed results should usually be normalized domain objects with standardized naming.
- Asset proxy modules such as `bandori-asset-proxy.ts` and `bandori-event-banner-proxy.ts` mainly use the security validation and error-handling rules in this file. Database Row/DTO mapping rules do not apply to them.
- Database Row types may keep `snake_case` to accurately map table fields. DTOs and shared objects returned from server modules should be converted to camelCase.
- Server modules that depend on environment variables must fail fast with clear error messages. Do not silently degrade when required configuration is missing.
- Modules containing service role usage, private environment variables, RLS-bypass logic, or other privileged capabilities must keep a server-only boundary. Client components, hooks, and browser-executable modules must not import `*-server.ts`.
- All write operations must re-check authentication and authorization on the server path. RLS-bypass behavior must be limited to explicit server-side modules.
- Use limited retries and backoff only when a call is known to be a transient failure and the operation is idempotent or safe to retry. Do not retry non-idempotent writes or calls with external side effects by default. After the retry limit is reached, return a stable, handleable error result.
- Server modules should centralize shared queries, DTO mapping, and compatibility logic. Avoid each API route maintaining its own similar implementation.
- When adding database entities, follow the layered boundary of plural `snake_case` table names, `snake_case` column names, and camelCase DTO fields. Do not mix naming conventions.
