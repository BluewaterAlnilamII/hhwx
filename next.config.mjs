const FAVICON_SITE_ASSET_CACHE_CONTROL = "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400";
const STATIC_SITE_ASSET_CACHE_CONTROL = "public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=604800";
// manifest 会影响安装态名称、主题色与图标入口，
// 因此这里单独缩短浏览器 TTL，避免发布后长时间拿到旧元数据。
const MANIFEST_SITE_ASSET_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
const CSP_REPORT_ENDPOINT = "/api/security/csp-report";

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
        ["img-src", ["'self'", "data:", "blob:", ...buildImageSources()]],
        ["font-src", ["'self'", "data:"]],
        ["style-src", ["'self'", "'unsafe-inline'"]],
        ["script-src", ["'self'", "'unsafe-inline'"]],
        ["connect-src", ["'self'", ...buildSupabaseConnectSources()]],
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
                headers: [
                    { key: "Cache-Control", value: FAVICON_SITE_ASSET_CACHE_CONTROL },
                ],
            },
            {
                source: "/favicon/:path*",
                headers: [
                    { key: "Cache-Control", value: STATIC_SITE_ASSET_CACHE_CONTROL },
                ],
            },
            {
                source: "/apple-icon.png",
                headers: [
                    { key: "Cache-Control", value: STATIC_SITE_ASSET_CACHE_CONTROL },
                ],
            },
            {
                source: "/manifest.webmanifest",
                headers: [
                    { key: "Cache-Control", value: MANIFEST_SITE_ASSET_CACHE_CONTROL },
                ],
            },
        ];
    },
};

export default nextConfig;
