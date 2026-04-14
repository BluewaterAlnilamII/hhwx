export type BandoriAssetRegion = "jp" | "cn";

const BESTDORI_ASSET_ORIGIN = "https://bestdori.com/assets";
const SAFE_ASSET_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;

function normalizeBandoriAssetSegment(value: string): string {
  return value.replace(/\.png$/i, "").trim();
}

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

// 为什么优先使用 bundleName：
// Bestdori 的活动横幅更稳定的主路径是 /event/{bundleName}/images_rip/banner.png，
// 老活动普遍只有这一套资源；bannerBundleName 更像是部分活动额外存在的 homebanner 名。
// 因此前端默认传活动 bundleName，代理层再按需兼容 legacy banner_eventXXX 请求，
// 才不会把老活动横幅错误地导向 homebanner 路径。
export function resolveBandoriEventBannerBundleName(asset: {
  bundleName: string;
  bannerBundleName: string | null;
}): string | null {
  const preferredBundleName = normalizeBandoriAssetSegment(asset.bundleName);
  if (preferredBundleName) {
    return preferredBundleName;
  }

  const fallbackBundleName = normalizeBandoriAssetSegment(asset.bannerBundleName ?? "");
  return fallbackBundleName || null;
}

export function buildBandoriEventBannerProxyPath(region: BandoriAssetRegion, bundleName: string): string {
  return `/api/bandori/assets/event-banner/${region}/${encodeURIComponent(bundleName)}`;
}

export function buildBestdoriEventBannerOriginUrl(region: BandoriAssetRegion, bundleName: string): string {
  const normalizedBundleName = normalizeBandoriAssetSegment(bundleName);
  const encodedBundleName = encodeURIComponent(normalizedBundleName);
  return `${BESTDORI_ASSET_ORIGIN}/${region}/event/${encodedBundleName}/images_rip/banner.png`;
}

export function buildBestdoriLegacyHomeBannerOriginUrl(region: BandoriAssetRegion, bundleName: string): string {
  const normalizedBundleName = normalizeBandoriAssetSegment(bundleName);
  const encodedBundleName = encodeURIComponent(normalizedBundleName);
  return `${BESTDORI_ASSET_ORIGIN}/${region}/homebanner_rip/${encodedBundleName}.png`;
}

export function extractBandoriEventIdFromLegacyBannerBundleName(bundleName: string): number | null {
  const matched = /^banner_event(\d+)$/i.exec(normalizeBandoriAssetSegment(bundleName));
  if (!matched) {
    return null;
  }

  const eventId = Number(matched[1]);
  return Number.isFinite(eventId) && eventId > 0 ? eventId : null;
}