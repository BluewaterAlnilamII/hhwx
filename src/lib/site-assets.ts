const DEFAULT_SITE_ASSET_CDN_BASE_URL = "https://cdn.hhwx.org";
const HHWX_SITE_RES_OBJECT_KEY_PREFIX = "hhwx/res";

function normalizeCdnBaseUrl(value: string | null | undefined): string {
  const trimmedValue = value?.trim().replace(/\/+$/, "");
  if (!trimmedValue) {
    return DEFAULT_SITE_ASSET_CDN_BASE_URL;
  }

  try {
    const url = new URL(trimmedValue);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return trimmedValue;
    }
  } catch {
    return DEFAULT_SITE_ASSET_CDN_BASE_URL;
  }

  return DEFAULT_SITE_ASSET_CDN_BASE_URL;
}

function encodeAssetKeyPath(assetKey: string): string {
  return assetKey
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function buildHhwxSiteResCdnUrl(assetName: string, baseUrl?: string | null): string {
  const normalizedAssetName = assetName.trim().replace(/^\/+/, "");
  const assetKey = `${HHWX_SITE_RES_OBJECT_KEY_PREFIX}/${normalizedAssetName}`;
  const normalizedBaseUrl = normalizeCdnBaseUrl(baseUrl ?? process.env.NEXT_PUBLIC_SITE_ASSET_CDN_BASE_URL);
  const encodedAssetKey = encodeAssetKeyPath(assetKey);
  return `${normalizedBaseUrl}/${encodedAssetKey}`;
}
