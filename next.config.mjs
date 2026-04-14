const FAVICON_CACHE_CONTROL = "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400";
const STATIC_ICON_CACHE_CONTROL = "public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=604800";

/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [],
    },
    async headers() {
        return [
            {
                source: "/favicon.ico",
                headers: [
                    { key: "Cache-Control", value: FAVICON_CACHE_CONTROL },
                ],
            },
            {
                source: "/favicon/:path*",
                headers: [
                    { key: "Cache-Control", value: STATIC_ICON_CACHE_CONTROL },
                ],
            },
            {
                source: "/apple-icon.png",
                headers: [
                    { key: "Cache-Control", value: STATIC_ICON_CACHE_CONTROL },
                ],
            },
            {
                source: "/res/bandori/icon/:path*",
                headers: [
                    { key: "Cache-Control", value: STATIC_ICON_CACHE_CONTROL },
                ],
            },
        ];
    },
};

export default nextConfig;
