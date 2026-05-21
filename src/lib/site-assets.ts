const DEFAULT_SITE_ASSET_CDN_BASE_URL = "https://cdn.hhwx.org";
const HHWX_SITE_RES_OBJECT_KEY_PREFIX = "hhwx/res";

function normalizeCdnBaseUrl(value: string | null | undefined): string {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return DEFAULT_SITE_ASSET_CDN_BASE_URL;
  }

  return trimmedValue.replace(/\/+$/, "");
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
  return `${normalizeCdnBaseUrl(baseUrl ?? process.env.NEXT_PUBLIC_SITE_ASSET_CDN_BASE_URL)}/${encodeAssetKeyPath(assetKey)}`;
}
