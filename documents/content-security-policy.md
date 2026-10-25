# Content Security Policy observation and rollout

[简体中文](content-security-policy.zh-CN.md)

The application currently sends `Content-Security-Policy-Report-Only`. It reports violations without blocking resources. Keep this mode during the compatibility observation period; enforcement is a separate deployment decision.

## Compatibility boundaries

`next.config.mjs` sends the report-only policy on non-API responses regardless of the request's `Accept` header, including pages and same-origin Worker/Worklet scripts. API responses retain their existing headers. Asset cache policies are unchanged.

- The chart simulator imports `pixi.js/unsafe-eval`, Pixi's compatibility implementation that **avoids** dynamic JavaScript generation. The policy does not permit `'unsafe-eval'`.
- `connect-src data:` supports the Pixi image Worker's capability probe; `connect-src blob:` supports saving a local pending chat image through the file picker.
- The exact Turnstile origin is permitted for scripts, frames, and feedback connections. Existing configured Supabase, chat, upload, and CDN origins remain in place.
- These connection permissions do not permit `data:` or `blob:` scripts. Unrecognized browser/extension telemetry origins are not added to the policy merely because they appear in reports.

## Report records

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

## Starting a new observation period

1. Run `npm run test:csp`, the affected simulator/chat checks, typecheck, lint, and build. In an isolated browser, enforce the candidate policy against the production build and exercise simulator playback/rate changes, Worker/WASM initialization, authentication/Turnstile, and chat/image flows. Passing report-only browsing alone does not demonstrate enforcement compatibility.
2. Deploy the repaired build in **Report-Only** mode. Verify the served header on representative pages both with `Accept: text/html` and with `Accept: */*`. Record the release revision, deployment time, and SHA-256 of the served policy as the baseline. Confirm a controlled report reaches the collector and carries the expected provenance fields.
3. Archive the old raw logs and the investigation summary before any log rotation or removal. The PM2 error log contains non-CSP errors too: do not truncate it just to reset CSP counts. Use the deployment time and policy hash to select the new window; perform archive/rotation only under an explicitly scoped production operation.
4. Keep old-policy and unknown-policy reports separate. Old tabs and cached documents can keep reporting after deployment. If browser serialization changes the exact policy string, verify and record the equivalent hash rather than treating it as the current policy without evidence.
5. Review after an initial 7–14 days, extending the window if important flows lack traffic. This is an operational checkpoint, not a time-based guarantee. Investigate first-party violations and unresolved sources; expected browser/extension reports do not need to reach zero.

Enable enforcement only after the critical flows pass under enforcement and new-policy reports reveal no unexplained application breakage. Keep reporting enabled after the switch and retain a deployment rollback to Report-Only. This rollout does not implement nonce-based strict CSP or remove the existing inline-script/style permissions.
