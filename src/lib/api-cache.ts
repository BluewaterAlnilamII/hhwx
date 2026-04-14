// 统一管理 API 与资源代理的缓存层级，避免每个 route 各自硬编码不同口径的 Cache-Control。
// 这里的分层原则是：
// - tracker 这类实时数据一律 no-store
// - 目录/元数据接口允许浏览器短缓存、CDN 更长缓存
// - 第三方静态资源代理按“路径稳定、变更极少”的资源来配置长时间 CDN 缓存
export const LIVE_API_CACHE_CONTROL = "no-store, max-age=0";
export const PUBLIC_SHORT_API_CACHE_CONTROL = "public, max-age=300, s-maxage=900, stale-while-revalidate=3600";
export const PUBLIC_METADATA_API_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
export const HOLIDAY_API_CACHE_CONTROL = "public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400";
export const HOLIDAY_FALLBACK_API_CACHE_CONTROL = "public, max-age=600, s-maxage=3600, stale-while-revalidate=43200";
export const SUBSCRIPTION_API_CACHE_CONTROL = "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400";
export const BESTDORI_ASSET_PROXY_CACHE_CONTROL = "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=7776000";
export const BESTDORI_ASSET_PROXY_REVALIDATE_SECONDS = 2592000;

export const BANDORI_EVENTS_CACHE_TAG = "bandori:events";
export const BANDORI_SCHEDULE_CACHE_TAG = "bandori:schedule";
export const BANDORI_CHARACTERS_CACHE_TAG = "bandori:characters";
export const BANDORI_EVENT_BONUS_CACHE_TAG = "bandori:event-bonus";

export function withCacheControl(cacheControl: string, headers?: HeadersInit): Headers {
  const nextHeaders = new Headers(headers ?? {});
  nextHeaders.set("Cache-Control", cacheControl);
  return nextHeaders;
}