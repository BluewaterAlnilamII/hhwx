import { NextResponse } from "next/server";

import {
  buildBandoriAssetCdnUrl,
  buildBandoriEventBannerAssetKey,
  extractBandoriEventIdFromLegacyBannerBundleName,
  isBandoriAssetRegion,
} from "@/lib/bandori-asset-proxy";
import { proxyBandoriEventBanner } from "@/lib/bandori-event-banner-proxy";

// Next 的 segment config 必须保持字面量，不能引用导入常量。
export const revalidate = 2592000;

export async function GET(
  _request: Request,
  context: { params: Promise<{ region: string; bundleName: string }> },
) {
  const { region, bundleName } = await context.params;

  if (isBandoriAssetRegion(region) && extractBandoriEventIdFromLegacyBannerBundleName(bundleName) === null) {
    const redirectUrl = buildBandoriAssetCdnUrl(
      buildBandoriEventBannerAssetKey(region, bundleName),
      process.env.BANDORI_ASSET_CDN_BASE_URL ?? process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL,
    );
    if (redirectUrl) {
      return NextResponse.redirect(redirectUrl, 307);
    }
  }

  return proxyBandoriEventBanner({ region, bundleName });
}