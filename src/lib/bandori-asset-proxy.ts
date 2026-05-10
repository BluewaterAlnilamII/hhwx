export type BandoriAssetRegion = "jp" | "cn";

const BESTDORI_ASSET_ORIGIN = "https://bestdori.com/assets";
const BESTDORI_RES_ICON_ORIGIN = "https://bestdori.com/res/icon";
const BESTDORI_RES_IMAGE_ORIGIN = "https://bestdori.com/res/image";
const BANDORI_ASSET_OBJECT_KEY_PREFIX = "bandori/assets";
const BANDORI_RES_ICON_OBJECT_KEY_PREFIX = "bandori/res/icon";
const BANDORI_RES_IMAGE_OBJECT_KEY_PREFIX = "bandori/res/image";
const SAFE_ASSET_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const CARD_TRAIN_TYPES = new Set(["normal", "after_training"]);

function normalizeBandoriAssetSegment(value: string): string {
  return value.replace(/\.png$/i, "").trim();
}

function normalizeBandoriAssetBaseUrl(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return null;
  }

  return trimmedValue.replace(/\/+$/, "");
}

function encodeBandoriAssetKeyPath(assetKey: string): string {
  return assetKey
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
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

export function buildBandoriEventBannerAssetKey(region: BandoriAssetRegion, bundleName: string): string {
  const normalizedBundleName = normalizeBandoriAssetSegment(bundleName);
  return `${BANDORI_ASSET_OBJECT_KEY_PREFIX}/${region}/event/${normalizedBundleName}/images_rip/banner.png`;
}

export function buildBandoriAssetCdnUrl(assetKey: string, baseUrl?: string | null): string | null {
  const normalizedBaseUrl = normalizeBandoriAssetBaseUrl(
    baseUrl ?? process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL,
  );
  if (!normalizedBaseUrl) {
    return null;
  }

  return `${normalizedBaseUrl}/${encodeBandoriAssetKeyPath(assetKey)}`;
}

export function buildBandoriResIconPublicUrl(iconName: string): string {
  const normalizedIconName = iconName.trim().replace(/^\/+/, "");
  const assetKey = `${BANDORI_RES_ICON_OBJECT_KEY_PREFIX}/${normalizedIconName}`;
  return buildBandoriAssetCdnUrl(assetKey) ?? `${BESTDORI_RES_ICON_ORIGIN}/${encodeURIComponent(normalizedIconName)}`;
}

export function buildBandoriResImagePublicUrl(imageName: string): string {
  const normalizedImageName = imageName.trim().replace(/^\/+/, "");
  const assetKey = `${BANDORI_RES_IMAGE_OBJECT_KEY_PREFIX}/${normalizedImageName}`;
  return buildBandoriAssetCdnUrl(assetKey) ?? `${BESTDORI_RES_IMAGE_ORIGIN}/${encodeURIComponent(normalizedImageName)}`;
}

export function buildBandoriEventBannerProxyPath(region: BandoriAssetRegion, bundleName: string): string {
  const normalizedBundleName = encodeURIComponent(normalizeBandoriAssetSegment(bundleName));
  // 代理路径显式保留 banner.png 后缀，
  // 这样 URL 语义会更接近 Bestdori 原始资源结构，也更方便排查缓存与资源来源问题。
  return `/api/bandori/assets/${region}/event/${normalizedBundleName}/images_rip/banner.png`;
}

export function buildBandoriEventBannerPublicUrl(region: BandoriAssetRegion, bundleName: string): string {
  const assetKey = buildBandoriEventBannerAssetKey(region, bundleName);
  return buildBandoriAssetCdnUrl(assetKey) ?? buildBandoriEventBannerProxyPath(region, bundleName);
}

export function normalizeBandoriCardTrainType(value: string | null | undefined): "normal" | "after_training" {
  return value === "after_training" ? "after_training" : "normal";
}

export function isBandoriCardTrainType(value: string): value is "normal" | "after_training" {
  return CARD_TRAIN_TYPES.has(value);
}

export function buildBandoriCardResourceSetAssetKey(
  region: BandoriAssetRegion,
  resourceSetName: string,
  assetType: "card" | "trim",
  trainType: "normal" | "after_training",
): string {
  const normalizedResourceSetName = normalizeBandoriAssetSegment(resourceSetName);
  return `${BANDORI_ASSET_OBJECT_KEY_PREFIX}/${region}/characters/resourceset/${normalizedResourceSetName}_rip/${assetType}_${trainType}.png`;
}

export function buildBandoriCardThumbnailAssetKey(
  region: BandoriAssetRegion,
  cardId: number,
  resourceSetName: string,
  trainType: "normal" | "after_training",
): string {
  const normalizedResourceSetName = normalizeBandoriAssetSegment(resourceSetName);
  const bundleIndex = Math.floor(Math.max(0, Math.trunc(cardId)) / 50).toString().padStart(5, "0");
  return `${BANDORI_ASSET_OBJECT_KEY_PREFIX}/${region}/thumb/chara/card${bundleIndex}_rip/${normalizedResourceSetName}_${trainType}.png`;
}

function buildBandoriAssetProxyPath(assetKey: string): string {
  return `/api/bandori/assets/${encodeBandoriAssetKeyPath(assetKey.replace(`${BANDORI_ASSET_OBJECT_KEY_PREFIX}/`, ""))}`;
}

export function buildBandoriCardResourceSetPublicUrl(
  region: BandoriAssetRegion,
  resourceSetName: string,
  assetType: "card" | "trim",
  trainType: "normal" | "after_training",
): string {
  const assetKey = buildBandoriCardResourceSetAssetKey(region, resourceSetName, assetType, trainType);
  return buildBandoriAssetCdnUrl(assetKey) ?? buildBandoriAssetProxyPath(assetKey);
}

export function buildBandoriCardThumbnailPublicUrl(
  region: BandoriAssetRegion,
  cardId: number,
  resourceSetName: string,
  trainType: "normal" | "after_training",
): string {
  const assetKey = buildBandoriCardThumbnailAssetKey(region, cardId, resourceSetName, trainType);
  return buildBandoriAssetCdnUrl(assetKey) ?? buildBandoriAssetProxyPath(assetKey);
}

export function buildBestdoriAssetOriginUrl(region: BandoriAssetRegion, assetPath: string[]): string {
  return `${BESTDORI_ASSET_ORIGIN}/${region}/${assetPath.map((segment) => encodeURIComponent(segment)).join("/")}`;
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
