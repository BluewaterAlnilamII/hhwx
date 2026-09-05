---
paths:
  - "src/lib/**/*-server.ts"
  - "src/lib/bandori-area-items.ts"
  - "src/lib/bandori-master-api.ts"
  - "src/lib/bandori-master-artifacts.ts"
  - "src/lib/bandori-music-assets.ts"
  - "src/lib/bandori-player-fetcher.ts"
  - "src/lib/game-account-binding.ts"
  - "src/lib/r2-s3-reader.ts"
  - "src/lib/user-game-snapshot-fetcher.ts"
---

# Server Module and Database Boundary Rules

- Existing modules covered here remain server-only except `bandori-server.ts`, the browser-safe region-domain module. The non-suffix entries include `bandori-area-items.ts` and its cached upstream fetch. `bandori-asset-proxy.ts` is also browser-safe. Paths route instructions; classify new modules by runtime responsibility rather than suffix alone. Change established boundaries only with a deliberate consumer migration.
- New privileged modules default to `*-server.ts`. Add exact coverage for an unavoidable non-suffix boundary or a privileged module outside the glob. Enforce the server boundary by runtime responsibility, regardless of registration.
- Browser code must not runtime-import server-only modules. Erased type imports are allowed for existing contracts; prefer neutral modules for new shared types. Validate upstream payloads and project out private/internal fields before exposing results. Never expose credentials, configuration secrets, authorization headers, or privileged error details.
- Centralize shared queries, domain mapping, and compatibility handling. Apply database guidance only to modules that access databases; an image proxy still needs input validation and secure error handling.
- Fail clearly when required configuration is absent. Optional, disabled, and fallback paths must follow an explicit contract rather than silently hiding configuration failures.
- Read HHWX-owned catalog and aggregate metadata through private R2/S3 access; server-to-public-CDN traffic can receive bot challenges. Preserve signatures and bucket boundaries, validate object keys, and retain caller byte/timeout limits. Add missing limits where the operation requires them. A failed private read does not authorize a public or unsigned fallback.
- Internal fetchers send credentials only to the configured trusted origin and never log or return them. Preserve authentication and error contracts, and re-check caller authorization for writes, including RLS-bypassing operations.
- Reuse readers when their cache, timeout, size, authorization, and retry contracts fit. Retry only transient failures of operations safe to repeat, with bounded backoff. Verify affected failure paths when changing these boundaries.
