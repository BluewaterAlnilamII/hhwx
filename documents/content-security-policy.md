# Content Security Policy observation and rollout

[简体中文](content-security-policy.zh-CN.md)

Production builds (`NODE_ENV=production`, including local `next build` / `next start`) send `Content-Security-Policy` and block disallowed resources while retaining violation reports. Development and test environments send `Content-Security-Policy-Report-Only` so debugging and hot reload are not blocked. Deploying this change switches production to enforcement; do not run production in development mode to roll it back.

## Compatibility boundaries

`next.config.mjs` sends the selected policy on non-API responses regardless of the request's `Accept` header, including pages and same-origin Worker/Worklet scripts. API responses retain their existing headers. Asset cache policies are unchanged.

The policy uses same-origin defaults and grants external sources only the resource permissions their consumers need. It retains inline scripts/styles for Next.js bootstrap and dynamic styles; this is an allowlist policy, not a nonce/hash strict CSP. `'wasm-unsafe-eval'` permits the simulator's Signalsmith AudioWorklet to compile WebAssembly without enabling JavaScript `eval`.

- The chart simulator imports `pixi.js/unsafe-eval`, Pixi's compatibility implementation that **avoids** dynamic JavaScript generation. The policy does not permit `'unsafe-eval'`.
- `connect-src data:` supports the Pixi image Worker's capability probe; `connect-src blob:` supports saving a local pending chat image through the file picker.
- The exact Turnstile origin is permitted for scripts, frames, and feedback connections. Existing configured Supabase, chat, upload, and CDN origins remain in place.
- Images allow the same origin, `data:`, `blob:`, and configured asset CDNs. Bestdori is not a browser image source; retained legacy proxies fetch upstream images on the server and return them from the same origin. Fonts allow only the same origin: the application uses system fonts and has no embedded `data:` font dependency.
- These connection permissions do not permit `data:` or `blob:` scripts. Unrecognized browser/extension telemetry origins are not added to the policy merely because they appear in reports.

## Report delivery and records

Page responses also send `Reporting-Endpoints: csp="/api/security/csp-report"`. Their policy selects it with `report-to csp` and retains `report-uri /api/security/csp-report` for browsers without `report-to` support. Supporting browsers use `report-to` and ignore `report-uri`; the two directives do not request duplicate delivery. Both formats use the same collector.

Asset responses under `/_next/` and `/res/`, including the application's Worker/Worklet scripts, keep `report-uri` without `report-to`. A controlled Chrome 156 HTTPS check blocked Worker `eval` under both policies, but only the `report-uri` configuration delivered the Worker report; document Reporting API delivery succeeded. Keep the resource restrictions identical and revisit this reporting distinction after Worker delivery is verified. New Worker entry points must stay within these paths or receive the same reporting treatment.

The root-relative endpoint stays on the response's origin, including localized pages and Worker scripts. Reporting API delivery requires a trustworthy context/endpoint; use HTTPS for deployment verification. Browsers may batch or delay reports, so compare normalized report records rather than expecting one immediate request per violation. Retaining `report-uri` does not make it a retry path when a browser selects `report-to` but cannot deliver its report.

`POST /api/security/csp-report` accepts legacy CSP reports and Reporting API payloads, responds with `204` and `no-store`, and writes one JSON array to application stderr after `CSP report received:`. With PM2, these records share the application's error log; there is no separate database or retention mechanism in this route.

Each normalized report includes:

| Field | Meaning |
| --- | --- |
| `receivedAt` | Server receipt time in UTC ISO format, not the time the browser originally encountered the violation. |
| `originalPolicyHash` | SHA-256 of the exact UTF-8 `original-policy` / `originalPolicy` string supplied by the browser; `null` if absent. It identifies reported policy content, not an application build or an authenticated client. |
| `source`, directives, disposition | Report format, affected resource rule, and reported mode. |
| `documentUri`, `blockedUri`, `sourceFile` | HTTP(S)/WebSocket URLs without credentials, query strings or fragments. Other URL schemes are reduced to their scheme name; tokens such as `inline`, `eval` and `wasm-eval` are preserved. Paths can still contain identifiers, so logs remain private operational data. |
| line/column, status, user agent | Available diagnostic context. |
| `sample` | Always `null`; script sample contents are not persisted. |

The original policy text and raw unsupported payloads are not logged. Unsupported payload diagnostics also include receipt time. Reports are untrusted client input and are not proof of a vendor's behavior or of successful user activity.

## Deployment and verification

1. Run `npm run test:csp`, the affected simulator/chat checks, typecheck, lint, and build. In an isolated browser, enforce the candidate policy against the production build and exercise simulator playback/rate changes, Worker/WASM initialization, authentication/Turnstile, and chat/image flows. Passing report-only browsing alone does not demonstrate enforcement compatibility.
2. After local verification, deploy the approved production build with enforcement. Verify that representative pages and Worker scripts return `Content-Security-Policy` without the Report-Only header, both with `Accept: text/html` and with `Accept: */*`. Pages must include the matching `Reporting-Endpoints` mapping and `report-to`; Worker assets must keep `report-uri` without `report-to`. Record the release revision, deployment time, and SHA-256 of each served policy as the baseline. Confirm controlled document and Worker reports reach the collector through Reporting API and legacy delivery respectively, with `disposition: enforce` and the expected provenance fields.
3. Archive the old raw logs and the investigation summary before any log rotation or removal. The PM2 error log contains non-CSP errors too: do not truncate it just to reset CSP counts. Use the deployment time and policy hash to select the new window; perform archive/rotation only under an explicitly scoped production operation.
4. Keep old-policy and unknown-policy reports separate. Old tabs and cached documents can keep reporting after deployment. If browser serialization changes the exact policy string, verify and record the equivalent hash rather than treating it as the current policy without evidence.
5. Review after an initial 7–14 days, extending the window if important flows lack traffic. This is an operational checkpoint, not a time-based guarantee. Investigate first-party violations and unresolved sources; expected browser/extension reports do not need to reach zero.

If enforcement causes a confirmed application regression, redeploy the previous approved Report-Only build while investigating the affected directive and dependency. Keep reporting enabled. This rollout does not implement nonce-based strict CSP or remove the existing inline-script/style permissions; unnecessary sources can still be removed after checking their consumers.

## Existing caches

No cache purge, deployment ID, resource URL change, or forced page reload is required for this switch. A newly loaded document applies its CSP even when its ordinary scripts, styles, or images come from cache. Already open documents retain their original policy until reloaded. A same-origin Worker loaded from an old cached response can retain its old internal policy; the new document's `worker-src` still controls whether it may start.

This accepted delay affects enforcement coverage, not a known functionality regression. Immutable resources can remain cached for up to a year, so immediate coverage of every Worker is not claimed. Coverage advances with normal resource version changes or cache expiry. Revisit cache handling only for an actual compatibility problem or an explicit requirement for immediate complete enforcement.
