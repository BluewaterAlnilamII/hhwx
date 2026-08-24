import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const FAVICON_SITE_ASSET_CACHE_PROFILE = {
    cacheControl: "public, max-age=604800, stale-while-revalidate=86400",
    cloudflareCdnCacheControl: "public, max-age=604800, stale-while-revalidate=86400",
};
const STATIC_SITE_ASSET_CACHE_PROFILE = {
    cacheControl: "public, max-age=2592000, stale-while-revalidate=604800",
    cloudflareCdnCacheControl: "public, max-age=2592000, stale-while-revalidate=604800",
};
const LONG_LIVED_SITE_RES_CACHE_PROFILE = {
    cacheControl: "public, max-age=31536000, immutable",
    cloudflareCdnCacheControl: "public, max-age=31536000, immutable",
};
// The manifest controls installed app metadata, theme color, and icon entry points.
// Keep its browser TTL shorter so deployed metadata updates are not held for too long.
const MANIFEST_SITE_ASSET_CACHE_PROFILE = {
    cacheControl: "public, max-age=3600, stale-while-revalidate=43200",
    cloudflareCdnCacheControl: "public, max-age=43200, stale-while-revalidate=86400",
};
const CSP_REPORT_ENDPOINT = "/api/security/csp-report";
const DEFAULT_SITE_ASSET_CDN_BASE_URL = "https://cdn.hhwx.org";
const CLOUDFLARE_INSIGHTS_SCRIPT_ORIGIN = "https://static.cloudflareinsights.com";
const BESTDORI_ASSET_ORIGIN = "https://bestdori.com";

function normalizeOrigin(value) {
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }

    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

function buildSupabaseConnectSources() {
    const supabaseOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (!supabaseOrigin) {
        return [];
    }

    const websocketOrigin = supabaseOrigin.replace(/^http/, "ws");
    return [...new Set([supabaseOrigin, websocketOrigin])];
}

function buildImageSources() {
    const origins = [
        DEFAULT_SITE_ASSET_CDN_BASE_URL,
        process.env.NEXT_PUBLIC_SITE_ASSET_CDN_BASE_URL,
        process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL,
    ]
        .map(normalizeOrigin)
        .filter(Boolean);

    return [...new Set(origins)];
}

function buildRemoteImagePatterns() {
    return buildImageSources().map((origin) => {
        const url = new URL(origin);
        return {
            protocol: url.protocol.replace(":", ""),
            hostname: url.hostname,
            port: url.port,
            pathname: "/**",
        };
    });
}

function buildContentSecurityPolicyReportOnly() {
    const directives = [
        ["default-src", ["'self'"]],
        ["base-uri", ["'self'"]],
        ["form-action", ["'self'"]],
        ["frame-ancestors", ["'self'"]],
        ["frame-src", ["'none'"]],
        ["object-src", ["'none'"]],
        ["manifest-src", ["'self'"]],
        ["worker-src", ["'self'", "blob:"]],
        ["img-src", ["'self'", "data:", "blob:", BESTDORI_ASSET_ORIGIN, ...buildImageSources()]],
        ["media-src", ["'self'", ...buildImageSources()]],
        ["font-src", ["'self'", "data:"]],
        ["style-src", ["'self'", "'unsafe-inline'"]],
        // Signalsmith performs WebAssembly compilation inside its same-origin
        // AudioWorklet. Keep eval disallowed while permitting WASM explicitly.
        ["script-src", ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", CLOUDFLARE_INSIGHTS_SCRIPT_ORIGIN]],
        ["connect-src", ["'self'", ...buildSupabaseConnectSources(), ...buildImageSources()]],
        ["report-uri", [CSP_REPORT_ENDPOINT]],
    ];

    return directives
        .map(([directive, values]) => `${directive} ${values.join(" ")}`)
        .join("; ");
}

const HTML_ACCEPT_MATCHERS = [
    { type: "header", key: "accept", value: ".*text/html.*" },
];

const BASE_SECURITY_HEADERS = [
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
    { key: "X-Content-Type-Options", value: "nosniff" },
];

const PAGE_SECURITY_HEADERS = [
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), display-capture=(), geolocation=(), microphone=(), payment=(), usb=()" },
    { key: "Content-Security-Policy-Report-Only", value: buildContentSecurityPolicyReportOnly() },
];

function buildCacheHeaders(profile) {
    return [
        { key: "Cache-Control", value: profile.cacheControl },
        { key: "Cloudflare-CDN-Cache-Control", value: profile.cloudflareCdnCacheControl },
    ];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
    poweredByHeader: false,
    images: {
        remotePatterns: buildRemoteImagePatterns(),
    },
    async headers() {
        return [
            {
                source: "/:path*",
                headers: BASE_SECURITY_HEADERS,
            },
            {
                source: "/",
                has: HTML_ACCEPT_MATCHERS,
                headers: PAGE_SECURITY_HEADERS,
            },
            {
                source: "/:path((?!api(?:/|$)).*)",
                has: HTML_ACCEPT_MATCHERS,
                headers: PAGE_SECURITY_HEADERS,
            },
            {
                source: "/favicon.ico",
                headers: buildCacheHeaders(FAVICON_SITE_ASSET_CACHE_PROFILE),
            },
            {
                source: "/favicon/:path*",
                headers: buildCacheHeaders(STATIC_SITE_ASSET_CACHE_PROFILE),
            },
            {
                source: "/apple-icon.png",
                headers: buildCacheHeaders(STATIC_SITE_ASSET_CACHE_PROFILE),
            },
            {
                source: "/res/:path*",
                headers: buildCacheHeaders(LONG_LIVED_SITE_RES_CACHE_PROFILE),
            },
            {
                source: "/manifest.webmanifest",
                headers: buildCacheHeaders(MANIFEST_SITE_ASSET_CACHE_PROFILE),
            },
        ];
    },
};

export default withNextIntl(nextConfig);
