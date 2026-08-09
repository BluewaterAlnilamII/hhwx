---
paths:
  - "src/app/api/**/route.ts"
  - "src/lib/api-cache.ts"
  - "src/lib/api-contracts.ts"
  - "src/lib/api-response.ts"
  - "src/lib/bandori-card-server-extensions.ts"
  - "src/lib/bandori-comment-target.ts"
  - "src/lib/bandori-event-banner-proxy.ts"
  - "src/lib/bandori-master-api.ts"
  - "src/lib/bandori-tracker-server.ts"
  - "src/lib/bandori-tracker-topdata-server.ts"
  - "src/lib/bestdori-prediction.ts"
  - "src/lib/game-account-binding.ts"
---

# API Route Rules

- Keep API routes lightweight: parse requests, enforce authorization, call services, and format responses. Do not stack large queries or domain rules in `route.ts`.
- When a route delegates HTTP request parsing or validation, API response construction, cache or error policy, or registered compatibility handling to a shared module, add that module's exact path to the registry above. Shared domain policies, codecs, storage or artifact contracts, and browser/server-neutral types remain governed by repository-wide compatibility rules unless they themselves own that HTTP-boundary behavior. Do not broaden the registry to all of `src/lib/**`.
- API routes that aggregate HHWX-owned CDN-published resources must call server service modules that read the backing object storage directly. Do not implement these routes by fetching public CDN URLs from the server path.
- Validate every input against its contract at the entry point: type and shape, length or size, enum membership, format, and required or optional semantics as applicable. Do not pass unvalidated values directly into database queries or service layers.
- For numeric parsing introduced or touched by the current task, validate numeric text as a complete token before conversion. For decimal integers, apply a domain-appropriate full-string pattern after any explicitly allowed normalization, convert with `Number()`, then require `Number.isFinite()`, `Number.isSafeInteger()`, and the domain range. `parseInt()` may be used only after full-token validation; never use it as validation because it accepts trailing garbage such as `"12px"`. Non-decimal formats must likewise validate their complete syntax before conversion. Untouched historical parsing is outside this rule's cleanup scope, but must not be copied into new or modified parsing.
- For non-integer numeric parsing introduced or touched by the current task, require the complete accepted syntax and `Number.isFinite()` plus domain range checks. Do not let JavaScript coercion implicitly admit empty strings, whitespace-only strings, hexadecimal notation, or exponent notation unless the API contract explicitly accepts them.
- Except for binary responses, file downloads, image proxies, streaming responses, SSE, ICS, 204/304 responses without bodies, and compatibility APIs registered below, JSON APIs should use the unified response shape: success `{ success: true, data, meta? }`; failure `{ success: false, error: { code, message, details? } }`.
- A third-party wire-compatible adapter or historical compatibility JSON API must be an existing public contract with existing callers and must be registered below. Registrations preserve only the documented success contract; unless a row says otherwise, failures use unified `{ success: false, error }` with a non-2xx status. The route or shared handler must comment why compatibility is kept. Registrations do not authorize opportunistic behavior changes or provide templates for new APIs; migrate callers or create a versioned API before changing or extending a registered shape.

| Path | Existing success contract | Compatibility reason and constraints |
| --- | --- | --- |
| `/api/account/game-profiles/[profileId]/export` | Unwrapped Bestdori-compatible game profile JSON with documented HHWX top-level extensions | Existing clipboard/export and re-import contract; migrate both directions before wrapping or changing the shape. |
| `/api/bandori/bestdori-prediction` | Unwrapped `{ enabled, result, source: "bestdori", cutoffs, predictionPoints, latestPrediction, latestCutoff, updatedAt }` | Existing event-tracker caller; migrate that caller before wrapping or changing the shape. |
| `/api/bandori/tracker/data` | Existing `{ result, cutoffs }`; a supported cutoff type with no data returns `200 + { result: true, cutoffs: [] }` | Historical public contract; use a versioned API or migration plan for shape changes. |
| `/api/bandori/tracker/topdata` | Exactly `{ points, users }`; an available target with no history returns `200 + { points: [], users: [] }` | Bestdori wire-compatible adapter backed by HHWX private object storage; expose only documented TOP10 fields, never raw deck or card data. |
| `/api/turnstile/config` | `{ enabled: boolean }` with `Cache-Control: no-store` | Existing authentication availability probe; this registration preserves current behavior and does not introduce a new failure path. |

- New JSON APIs must use the unified envelope. A new compatibility exception requires review and registration here with its path, success body, any nonstandard failure body, and compatibility reason before implementation.
- Failure responses from new JSON APIs must use semantically correct non-2xx HTTP status codes. `200 + success: false` is only allowed for registered historical compatibility public contracts.
- Error `message` values should be understandable to callers. Prefer logging internal exception details; expose them only through `code` and controlled `details` when necessary.
- Routes that need caching should reuse centralized cache policies and cache tags. When data is written, handle cache invalidation or tag refresh in the same flow.
- Write operations involving authentication or role permissions must revalidate authorization on the server. Do not rely on role state passed from the frontend.
