---
paths:
  - "src/app/api/**/route.ts"
  - "src/lib/api-cache.ts"
  - "src/lib/api-contracts.ts"
  - "src/lib/api-response.ts"
  - "src/lib/auth-server.ts"
  - "src/lib/bandori/cards/api-query.ts"
  - "src/lib/bandori/cards/comment-target.ts"
  - "src/lib/bandori/events/comment-target.ts"
  - "src/lib/bandori/events/banner-proxy-server.ts"
  - "src/lib/bandori-master-api.ts"
  - "src/lib/bandori/event-tracker/api-server.ts"
  - "src/lib/bandori/event-tracker/topdata-api-server.ts"
  - "src/lib/bandori/event-tracker/bestdori-prediction-server.ts"
  - "src/lib/game-account-binding.ts"
---

# API Route Rules

- Routes parse and validate requests, enforce server authorization, call services, and format responses. Keep shared domain logic in its owning module. Register shared HTTP parsing, response, cache/error, or compatibility handlers in the paths above; ordinary domain utilities do not need registration.
- Validate input type, shape, size, format, and range at the trust boundary. Numeric text must match the complete accepted syntax before conversion; reject non-finite values and require safe integers where applicable. Coercion or `parseInt()` alone is not validation.
- New JSON APIs use success `{ success: true, data, meta? }` and failure `{ success: false, error: { code, message, details? } }` with an appropriate non-2xx failure status. Downloads, images, streams/SSE, ICS, and bodyless responses follow their protocol.
- Keep the registered success contracts below. Unless specified otherwise, their failures use the unified error envelope and non-2xx status. Document the compatibility reason at the handler; changing a registered contract or adding an exception requires an agreed caller migration or compatibility plan and an updated registration.

| Path | Preserved success contract and constraint |
| --- | --- |
| `/api/account/game-profiles/[profileId]/export` | Unwrapped Bestdori profile JSON with documented HHWX extensions; preserve export and re-import compatibility together. |
| `/api/bandori/bestdori-prediction` | Unwrapped `{ enabled, result, source: "bestdori", cutoffs, predictionPoints, latestPrediction, latestCutoff, updatedAt }`; migrate the event-tracker caller before changing it. |
| `/api/bandori/tracker/data` | `{ result, cutoffs }`; a supported cutoff type with no data returns `200 + { result: true, cutoffs: [] }`. |
| `/api/bandori/tracker/topdata` | Exactly `{ points, users }`; an available target without history returns `200 + { points: [], users: [] }`. Expose documented TOP10 fields only, never raw deck/card data. |
| `/api/turnstile/config` | `{ enabled: boolean }` with `Cache-Control: no-store`; preserve the availability probe without adding a failure path. |

- Return understandable, sanitized errors. Internal logs must also exclude secrets; expose only controlled error details.
- Reuse central cache policies and tags, and invalidate affected data on writes. Apply the server-service rules to backing storage and authenticated fetches.
