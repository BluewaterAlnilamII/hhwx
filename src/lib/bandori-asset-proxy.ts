export type BandoriAssetRegion = "jp" | "cn";

const BESTDORI_ASSET_ORIGIN = "https://bestdori.com/assets";
const SAFE_ASSET_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;

// 为什么这里要严格限制 path segment：
// 资源代理会把前端提供的路径片段拼进上游 URL；如果不在入口处收紧允许字符集，
// 未来一旦扩展到更多 assets，最容易先出现的问题就是把代理路由变成任意路径透传。
// 先把 segment 限死为 Bestdori 当前 bundle 命名实际会出现的安全字符，
// 能在保留可扩展性的同时，避免这层代理失去边界。
export function isSafeBandoriAssetSegment(value: string): boolean {
  return SAFE_ASSET_SEGMENT_PATTERN.test(value);
}

export function isBandoriAssetRegion(value: string): value is BandoriAssetRegion {
  return value === "jp" || value === "cn";
}

// 为什么优先使用 bannerBundleName：
// 当前大多数活动横幅路径和事件 bundleName 一致，但数据层已经预留了 bannerBundleName，
// 说明未来可能出现“活动资源包名”和“横幅资源包名”分离的情况。
// 前端统一在这里做一次回退，后续即使数据库开始填写 bannerBundleName，
// 页面和代理路由也不需要再分别改一轮。
export function resolveBandoriEventBannerBundleName(asset: {
  bundleName: string;
  bannerBundleName: string | null;
}): string | null {
  const preferredBundleName = asset.bannerBundleName?.trim();
  if (preferredBundleName) {
    return preferredBundleName;
  }

  const fallbackBundleName = asset.bundleName.trim();
  return fallbackBundleName || null;
}

export function buildBandoriEventBannerProxyPath(region: BandoriAssetRegion, bundleName: string): string {
  return `/api/bandori/assets/event-banner/${region}/${encodeURIComponent(bundleName)}`;
}

export function buildBestdoriEventBannerOriginUrl(region: BandoriAssetRegion, bundleName: string): string {
  const encodedBundleName = encodeURIComponent(bundleName);
  return `${BESTDORI_ASSET_ORIGIN}/${region}/event/${encodedBundleName}/images_rip/banner.png`;
}