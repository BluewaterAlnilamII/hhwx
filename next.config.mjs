const FAVICON_SITE_ASSET_CACHE_CONTROL = "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400";
const STATIC_SITE_ASSET_CACHE_CONTROL = "public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=604800";
// manifest 会影响安装态名称、主题色与图标入口，
// 因此这里单独缩短浏览器 TTL，避免发布后长时间拿到旧元数据。
const MANIFEST_SITE_ASSET_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
const SITE_SECURITY_HEADERS = [
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), display-capture=(), geolocation=(), microphone=(), payment=(), usb=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
    poweredByHeader: false,
    images: {
        remotePatterns: [],
    },
    async headers() {
        return [
            {
                source: "/:path*",
                headers: SITE_SECURITY_HEADERS,
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
            {
                source: "/res/bandori/icon/:path*",
                headers: [
                    { key: "Cache-Control", value: STATIC_SITE_ASSET_CACHE_CONTROL },
                ],
            },
        ];
    },
};

export default nextConfig;
