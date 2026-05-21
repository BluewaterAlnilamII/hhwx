---
paths:
  - "src/app/api/**/route.ts"
---

# API Route Rules

- Keep API routes lightweight: parse requests, enforce authorization, call services, and format responses. Do not stack large queries or domain rules in `route.ts`.
- All request parameters, query strings, and request bodies must be parsed, normalized, and range-checked at the entry point. Do not pass unvalidated values directly into database queries or service layers.
- Prefer `Number.parseInt(value, 10)` or `Number(value)` for numeric parsing, together with `Number.isFinite()` and domain range checks.
- Except for binary responses, file downloads, image proxies, streaming responses, SSE, ICS, 204/304 responses without bodies, and explicitly pass-through third-party protocols, JSON APIs should use the unified response shape: success `{ success: true, data, meta? }`; failure `{ success: false, error: { code, message, details? } }`.
- An "explicitly pass-through third-party protocol" is only a boundary route whose purpose is upstream protocol compatibility. If fields are renamed, filtered, aggregated, converted to cache DTOs, or errors are reshaped, it is no longer pass-through and must return to the project JSON convention.
- Historical compatibility JSON APIs must be existing public contracts in the repository with existing callers. The route or shared handler must comment why compatibility is kept. When fields are added or breaking changes are needed, migrate to the unified envelope instead of extending the legacy shape.
- New historical compatibility exceptions must be registered in this file with the path, success body shape, failure body shape, and reason for keeping them. Any new unregistered JSON API must use the unified response shape.
- `/api/bandori/tracker/data` is a registered exception: successful responses continue using the existing `result`/`cutoffs` contract; supported cutoff types with no data return `200 + { result: true, cutoffs: [] }`; failure responses use unified `{ success: false, error }` with a non-2xx status code. Do not change its successful response field shape unless a new versioned API or migration plan is provided.
- Historical compatibility exceptions must not be used as templates for new APIs. New JSON APIs must not copy legacy shapes such as `result`/`cutoffs`.
- Failure responses from new JSON APIs must use semantically correct non-2xx HTTP status codes. `200 + success: false` is only allowed for registered historical compatibility public contracts.
- Error `message` values should be understandable to callers. Prefer logging internal exception details; expose them only through `code` and controlled `details` when necessary.
- Routes that need caching should reuse centralized cache policies and cache tags. When data is written, handle cache invalidation or tag refresh in the same flow.
- Write operations involving authentication or role permissions must revalidate authorization on the server. Do not rely on role state passed from the frontend.
