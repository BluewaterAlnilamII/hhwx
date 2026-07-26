// HTTP cache policies describe transport and server-cache behavior only.
// Client request lifetimes are separate because the same HTTP snapshot can
// have different in-page reuse needs without inventing another HTTP tier.
export type ClientCachePolicy = {
  staleTimeMs?: number;
  refreshOnVisible?: boolean;
};

export type HttpCachePolicy = {
  /** Browser and downstream-cache policy. */
  cacheControl: string;
  /** Cloudflare edge-only policy. Cloudflare removes this header downstream. */
  cloudflareCdnCacheControl: string;
  nextRevalidateSeconds?: number;
};

export const NO_STORE_HTTP_CACHE_POLICY: HttpCachePolicy = {
  cacheControl: "no-store, max-age=0",
  cloudflareCdnCacheControl: "no-store",
};

export const FAST_MUTABLE_HTTP_CACHE_POLICY: HttpCachePolicy = {
  cacheControl: "public, max-age=60, stale-while-revalidate=300",
  cloudflareCdnCacheControl: "public, max-age=300, stale-while-revalidate=900",
  nextRevalidateSeconds: 300,
};

export const SNAPSHOT_HTTP_CACHE_POLICY: HttpCachePolicy = {
  cacheControl: "public, max-age=300, stale-while-revalidate=1800",
  cloudflareCdnCacheControl: "public, max-age=1800, stale-while-revalidate=86400",
  nextRevalidateSeconds: 1800,
};

export const REFERENCE_HTTP_CACHE_POLICY: HttpCachePolicy = {
  cacheControl: "public, max-age=3600, stale-while-revalidate=43200",
  cloudflareCdnCacheControl: "public, max-age=43200, stale-while-revalidate=86400",
  nextRevalidateSeconds: 43200,
};

export const LONG_ASSET_HTTP_CACHE_POLICY: HttpCachePolicy = {
  cacheControl: "public, max-age=86400, stale-while-revalidate=604800",
  cloudflareCdnCacheControl: "public, max-age=2592000, stale-while-revalidate=7776000",
  nextRevalidateSeconds: 2592000,
};

export const IMMUTABLE_HTTP_CACHE_POLICY: HttpCachePolicy = {
  cacheControl: "public, max-age=31536000, immutable",
  cloudflareCdnCacheControl: "public, max-age=31536000, immutable",
};

export const LIVE_CLIENT_CACHE_POLICY: ClientCachePolicy = {
  // Tracker data does not poll. Recheck it when the page returns to the
  // foreground so changes missed while suspended can be recovered.
  staleTimeMs: 0,
  refreshOnVisible: true,
};

export const SHORT_CLIENT_CACHE_POLICY: ClientCachePolicy = {
  staleTimeMs: 60 * 1000,
  refreshOnVisible: true,
};

export const LONG_CLIENT_CACHE_POLICY: ClientCachePolicy = {
  staleTimeMs: 12 * 60 * 60 * 1000,
  refreshOnVisible: false,
};

export const SESSION_CLIENT_CACHE_POLICY: ClientCachePolicy = {
  // A successful value remains fresh for the current page lifetime. A full
  // reload creates a new module instance; explicit refresh still bypasses this.
  staleTimeMs: Number.POSITIVE_INFINITY,
  refreshOnVisible: false,
};

export const BESTDORI_ASSET_PROXY_REVALIDATE_SECONDS =
  LONG_ASSET_HTTP_CACHE_POLICY.nextRevalidateSeconds ?? 2592000;

export const BANDORI_EVENTS_CACHE_TAG = "bandori:events";
export const BANDORI_SCHEDULE_CACHE_TAG = "bandori:schedule";
export const BANDORI_CHARACTERS_CACHE_TAG = "bandori:characters";

export function withHttpCachePolicy(policy: HttpCachePolicy, headers?: HeadersInit): Headers {
  const nextHeaders = new Headers(headers ?? {});
  nextHeaders.set("Cache-Control", policy.cacheControl);
  nextHeaders.set("Cloudflare-CDN-Cache-Control", policy.cloudflareCdnCacheControl);
  return nextHeaders;
}
