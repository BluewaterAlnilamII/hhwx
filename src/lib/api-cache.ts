// 统一管理 API 与资源代理的缓存层级，避免每个 route 与 client hook 各自硬编码不同口径。
// 这里刻意把“HTTP 缓存”和“前端内存缓存”放进同一组 profile，
// 这样可以让页面请求时机、浏览器缓存寿命与 Next 数据缓存寿命更容易同步调参。
export type ClientCacheProfile = {
  staleTimeMs?: number;
  refreshOnVisible?: boolean;
};

export type CacheProfile = {
  cacheControl: string;
  nextRevalidateSeconds?: number;
  client?: ClientCacheProfile;
};

export const REALTIME_HOT_CACHE_PROFILE: CacheProfile = {
  cacheControl: "no-store, max-age=0",
  client: {
    // tracker data 不走轮询；这里将 staleTime 设为 0，
    // 让页面切回前台时总会补查一次，补上后台期间遗漏的变更。
    staleTimeMs: 0,
  },
};

export const MUTABLE_DIRECTORY_CACHE_PROFILE: CacheProfile = {
  cacheControl: "public, max-age=60, s-maxage=300, stale-while-revalidate=900",
  nextRevalidateSeconds: 300,
  client: {
    staleTimeMs: 60 * 1000,
  },
};

export const REFERENCE_METADATA_CACHE_PROFILE: CacheProfile = {
  cacheControl: "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  nextRevalidateSeconds: 86400,
  client: {
    staleTimeMs: 12 * 60 * 60 * 1000,
    refreshOnVisible: false,
  },
};

export const EXTERNAL_REFERENCE_CACHE_PROFILE: CacheProfile = {
  cacheControl: "public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400",
  nextRevalidateSeconds: 43200,
  client: {
    // 节假日这类外部参考数据在单次会话内几乎不会变化，
    // 因此前端内存缓存可以比 HTTP 缓存更宽松，减少页面间重复请求。
    staleTimeMs: 24 * 60 * 60 * 1000,
    refreshOnVisible: false,
  },
};

export const EXTERNAL_REFERENCE_FALLBACK_CACHE_PROFILE: CacheProfile = {
  cacheControl: "public, max-age=600, s-maxage=3600, stale-while-revalidate=43200",
  client: {
    staleTimeMs: 60 * 60 * 1000,
    refreshOnVisible: false,
  },
};

export const SUBSCRIPTION_FEED_CACHE_PROFILE: CacheProfile = {
  cacheControl: "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400",
};

export const STATIC_ASSET_PROXY_CACHE_PROFILE: CacheProfile = {
  cacheControl: "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=7776000",
  nextRevalidateSeconds: 2592000,
};

export const STATIC_SITE_ASSET_CACHE_CONTROL = "public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=604800";
export const FAVICON_SITE_ASSET_CACHE_CONTROL = "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400";
// HTML 页面本身只是应用壳，真正高频变化的数据走各自 API。
// 因此这里把共享缓存收敛到 15 分钟，既避免版本更新后页面壳长期滞留，
// 也避免每次请求都回源重复生成几乎不变的静态 HTML。
export const HTML_SHELL_REVALIDATE_SECONDS = 15 * 60;

// 兼容现有 route 导入，避免一次性重写整片 API 文件。
export const LIVE_API_CACHE_CONTROL = REALTIME_HOT_CACHE_PROFILE.cacheControl;
export const PUBLIC_SHORT_API_CACHE_CONTROL = MUTABLE_DIRECTORY_CACHE_PROFILE.cacheControl;
export const PUBLIC_METADATA_API_CACHE_CONTROL = REFERENCE_METADATA_CACHE_PROFILE.cacheControl;
export const HOLIDAY_API_CACHE_CONTROL = EXTERNAL_REFERENCE_CACHE_PROFILE.cacheControl;
export const HOLIDAY_FALLBACK_API_CACHE_CONTROL = EXTERNAL_REFERENCE_FALLBACK_CACHE_PROFILE.cacheControl;
export const SUBSCRIPTION_API_CACHE_CONTROL = SUBSCRIPTION_FEED_CACHE_PROFILE.cacheControl;
export const BESTDORI_ASSET_PROXY_CACHE_CONTROL = STATIC_ASSET_PROXY_CACHE_PROFILE.cacheControl;
export const BESTDORI_ASSET_PROXY_REVALIDATE_SECONDS = STATIC_ASSET_PROXY_CACHE_PROFILE.nextRevalidateSeconds ?? 2592000;

export const BANDORI_EVENTS_CACHE_TAG = "bandori:events";
export const BANDORI_SCHEDULE_CACHE_TAG = "bandori:schedule";
export const BANDORI_CHARACTERS_CACHE_TAG = "bandori:characters";
export const BANDORI_EVENT_BONUS_CACHE_TAG = "bandori:event-bonus";

export function withCacheControl(cacheControl: string, headers?: HeadersInit): Headers {
  const nextHeaders = new Headers(headers ?? {});
  nextHeaders.set("Cache-Control", cacheControl);
  return nextHeaders;
}