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
- Validate at the boundary responsible for a guarantee. Reuse validated internal contracts; validate again when a transformation or new trust boundary invalidates that guarantee. Extra checks, readbacks, or fallbacks need a concrete failure mode, not an imagined future input. Preserve integrity and authorization checks even for privately stored data.
- Fail clearly when required configuration is absent. Optional, disabled, and fallback paths must follow an explicit contract rather than silently hiding configuration failures.
- Read HHWX-owned catalog and aggregate metadata through private R2/S3 access; server-to-public-CDN traffic can receive bot challenges. Preserve signatures and bucket boundaries and validate object keys. A failed private read does not authorize a public or unsigned fallback.
- Keep necessary byte, timeout, and decompression safeguards, with limits justified by the protocol, resource budget, or measurements. Distinguish business capacity, request/decompression limits, and cache budgets; do not impose arbitrary lifetime data caps. When changing a limit, check affected producers, readers, archive validation, and recovery paths together; retain checks for descriptor mismatches, corrupt content, and decompression beyond declared bounds.
- Internal fetchers send credentials only to the configured trusted origin and never log or return them. Preserve authentication and error contracts, and re-check caller authorization for writes, including RLS-bypassing operations.
- Reuse readers when their cache, timeout, size, authorization, and retry contracts fit. Retry only identified transient failures of operations safe to repeat, with bounded backoff; account for SDK retries rather than stacking retry loops. Unknown write outcomes require reconciliation under the owning contract, not blind retries. Reuse contract-confirmed success instead of adding unconditional readbacks; retain required verification for existing objects, uncertain outcomes, and mutable-pointer commits. Verify affected failure paths when changing these boundaries.
