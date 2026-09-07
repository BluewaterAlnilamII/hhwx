# Service status API

中文说明见 [service-status.zh-CN.md](service-status.zh-CN.md).

`GET /api/status` is a public, read-only endpoint. It returns the current in-memory status of 16 backend components. Collection starts with the Node server and runs every 60 seconds, independently of visitors. It does not store history or use a database or object storage.

## Response

The existing success envelope contains `data.hhwxBandoriBackend`, with these service keys. Every service always contains `jp`, `en`, `tw`, and `cn` in that order.

| Public key | Private source service | Meaning |
| --- | --- | --- |
| `cutoffTracker` | `scoreTracking` | Score tracking |
| `userFetcher` | `userFetch` | User fetching |
| `masterBuilder` | `dataBuild` | Data building |
| `assetsBuilder` | `assetBuild` | Resource building, including coordination and execution |

Example excerpt; the full response includes all four services and all four regions:

```json
{
  "success": true,
  "data": {
    "hhwxBandoriBackend": {
      "cutoffTracker": {
        "jp": {
          "status": "error",
          "observedAt": "2026-09-07T06:00:00.000Z",
          "reasonCode": "update_required"
        }
      }
    }
  },
  "meta": {
    "checkedAt": "2026-09-07T06:00:02.000Z"
  }
}
```

| Field | Contract |
| --- | --- |
| `status` | `operational`, `maintenance`, `error`, or `null` before the first confirmation |
| `reasonCode` | Optional; only `update_required`, and only with `status: "error"` |
| `observedAt` | Backend time of the last confirmation of this component, normalized to UTC; `null` if never confirmed |
| `meta.checkedAt` | HHWX time of the last completed collection attempt, including failed attempts; `null` while the first attempt is pending |

`observedAt` is not the last successful business task time. A backend may confirm normal idle readiness or a continuing maintenance/error condition. API reads do not refresh either timestamp. Upstream details, addresses, credentials and diagnostics are never copied into this response.

Maintenance and component errors return HTTP 200 with `success: true`: the status query succeeded. Missing/invalid private configuration returns HTTP 503 with `success: false` and `error.code: "SERVICE_STATUS_NOT_CONFIGURED"`. If the collector is unavailable despite valid configuration, the code is `SERVICE_STATUS_UNAVAILABLE`. These errors use the existing sanitized API error envelope.

## Confirmation and cache behavior

- Confirmed normal, maintenance and error reports take effect immediately. Recovery replaces the previous result, including its reason code.
- A failed request, missing/duplicate component, invalid status or invalid observation timestamp cannot renew that component's confirmation. Other valid components still update.
- Until 180 seconds of continuous uncertainty have elapsed, keep the last confirmed value. On startup, an item without a confirmation has `status: null` and `observedAt: null`; its grace period starts when collection starts.
- At 180 seconds, return `status: "error"` without a reason code. Keep the last `observedAt`, or `null` if none exists; do not invent a backend observation time. Time is measured with a monotonic clock, not a failure counter or the age of the last business success.
- A stopped/delayed collection loop cannot preserve a confirmation indefinitely: its missed next interval starts the same grace period. A later unsuccessful poll does not restart that period.

The route reads memory and applies the elapsed-time threshold; it performs no upstream request or persistence. Both browser and CDN cache headers use the existing no-store policy, so a second cache does not delay transitions. Browser consumers should read the public endpoint every 60 seconds.

## Configuration and deployment

Use `HHWX_USER_FETCHER_BASE_URL` and `HHWX_BANDORI_BACKEND_TOKEN` from [.env.example](../.env.example). User fetching and status collection share the backend token. During migration, the nonempty trimmed new value takes precedence; otherwise `HHWX_USER_FETCHER_TOKEN` remains a compatibility fallback. Keep the existing token value while renaming the configuration, and remove the old name once all consumers support the new name. The URL is an HTTP(S) base, optionally with a path prefix, without embedded credentials, a query, or a fragment. The collector appends `/internal/service-health` and sends the token only in the server-side Bearer authorization header. Redirects are rejected. Each attempt has a five-second total fetch/body timeout and a 64 KiB response limit; there is no immediate retry or overlapping poll.

The private response uses `{ schemaVersion: 1, components: [...] }`. Each component identifies `service` and `server`; confirmed entries carry `reportState: "confirmed"`, a supported status, and a UTC `observedAt`. Unconfirmed entries cannot clear a previous fault. Unknown private fields are discarded. HHWX groups these existing reports without changing the private API.

Deploy the compatible backend health endpoints first, then the HHWX application. Ensure the configured base exposes the aggregate health path in addition to its existing user-fetcher paths; update proxy routing only if the connection uses a proxy. Never forward the private token to a browser. No private deployment addresses are required in this repository.

`src/instrumentation.ts` starts collection through Next.js's Node startup hook in `next dev` and `next start`; build workers and Edge execution do not start it. An unconfigured installation keeps the rest of the site running, emits a configuration notice at startup, and returns the explicit 503 from this API. Restart the Node server after changing configuration.

The collector and cache are per Node process. A single long-lived Node instance needs no extra scheduler; multiple instances each poll and hold their own cache. Frozen/serverless instances cannot guarantee a background 60-second schedule. Restarting discards this health cache and starts a new initial grace period. The aggregate also depends on the private user-fetcher process: if that process becomes unreachable, all 16 items become unconfirmed.

## Verification

Run `npm run test:service-status`, `npm run typecheck`, `npm run lint`, and `npm run build`. The focused tests use synthetic reports and a controlled clock; they make no game requests. The status page, navigation entry and additional explanations for generic errors are separate work.
