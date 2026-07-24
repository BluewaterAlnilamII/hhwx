import assert from "node:assert/strict";
import test from "node:test";

import {
  FAST_MUTABLE_HTTP_CACHE_POLICY,
  IMMUTABLE_HTTP_CACHE_POLICY,
  LIVE_CLIENT_CACHE_POLICY,
  LONG_ASSET_HTTP_CACHE_POLICY,
  LONG_CLIENT_CACHE_POLICY,
  NO_STORE_HTTP_CACHE_POLICY,
  REFERENCE_HTTP_CACHE_POLICY,
  SESSION_CLIENT_CACHE_POLICY,
  SHORT_CLIENT_CACHE_POLICY,
  SNAPSHOT_HTTP_CACHE_POLICY,
  withHttpCachePolicy,
} from "../src/lib/api-cache.ts";

const publicPolicies = [
  FAST_MUTABLE_HTTP_CACHE_POLICY,
  SNAPSHOT_HTTP_CACHE_POLICY,
  REFERENCE_HTTP_CACHE_POLICY,
  LONG_ASSET_HTTP_CACHE_POLICY,
  IMMUTABLE_HTTP_CACHE_POLICY,
];

test("public HTTP cache policies separate browser and Cloudflare edge lifetimes", () => {
  for (const policy of publicPolicies) {
    assert.match(policy.cacheControl, /^public, max-age=\d+/);
    assert.doesNotMatch(policy.cacheControl, /s-maxage/);
    assert.match(policy.cloudflareCdnCacheControl, /^public, max-age=\d+/);
    assert.doesNotMatch(policy.cloudflareCdnCacheControl, /s-maxage/);
  }

  assert.equal(
    SNAPSHOT_HTTP_CACHE_POLICY.cacheControl,
    "public, max-age=300, stale-while-revalidate=1800",
  );
  assert.equal(
    SNAPSHOT_HTTP_CACHE_POLICY.cloudflareCdnCacheControl,
    "public, max-age=1800, stale-while-revalidate=86400",
  );
});

test("withHttpCachePolicy emits both cache layers and preserves response metadata", () => {
  const headers = withHttpCachePolicy(SNAPSHOT_HTTP_CACHE_POLICY, {
    "Content-Type": "application/json",
  });

  assert.equal(
    headers.get("Cache-Control"),
    "public, max-age=300, stale-while-revalidate=1800",
  );
  assert.equal(
    headers.get("Cloudflare-CDN-Cache-Control"),
    "public, max-age=1800, stale-while-revalidate=86400",
  );
  assert.equal(headers.get("Content-Type"), "application/json");
});

test("real-time responses explicitly bypass browser and Cloudflare caches", () => {
  const headers = withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY);

  assert.equal(headers.get("Cache-Control"), "no-store, max-age=0");
  assert.equal(headers.get("Cloudflare-CDN-Cache-Control"), "no-store");
});

test("client policies stay independent from HTTP cache tiers", () => {
  assert.deepEqual(LIVE_CLIENT_CACHE_POLICY, {
    staleTimeMs: 0,
    refreshOnVisible: true,
  });
  assert.deepEqual(SHORT_CLIENT_CACHE_POLICY, {
    staleTimeMs: 60 * 1000,
    refreshOnVisible: true,
  });
  assert.deepEqual(LONG_CLIENT_CACHE_POLICY, {
    staleTimeMs: 12 * 60 * 60 * 1000,
    refreshOnVisible: false,
  });
  assert.equal(SESSION_CLIENT_CACHE_POLICY.staleTimeMs, Number.POSITIVE_INFINITY);
  assert.equal(SESSION_CLIENT_CACHE_POLICY.refreshOnVisible, false);
});
