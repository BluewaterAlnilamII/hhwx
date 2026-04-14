import { NextResponse } from "next/server";
import {
  BESTDORI_ASSET_PROXY_CACHE_CONTROL,
  BESTDORI_ASSET_PROXY_REVALIDATE_SECONDS,
  LIVE_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import {
  buildBestdoriEventBannerOriginUrl,
  isBandoriAssetRegion,
  isSafeBandoriAssetSegment,
} from "@/lib/bandori-asset-proxy";

export const dynamic = "force-dynamic";

/**
 * GET /api/bandori/assets/event-banner/[region]/[bundleName]
 * 同域代理 Bestdori 活动横幅。
 *
 * 为什么先做成“专用横幅代理”而不是开放任意 assets 透传：
 * 1. 当前仓库里真正稳定高频的外链资源只有活动横幅，先收窄范围更安全。
 * 2. 横幅 URL 完全由 region + bundleName 推导，适合单独配置长时间 CDN 缓存。
 * 3. 未来如果要代理更多 Bestdori 静态资源，可以在同一命名空间下继续扩展，
 *    但前端不需要再改回第三方域名。
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ region: string; bundleName: string }> },
) {
  try {
    const { region, bundleName } = await context.params;

    if (!isBandoriAssetRegion(region) || !isSafeBandoriAssetSegment(bundleName)) {
      return NextResponse.json({ error: "无效的横幅资源参数" }, {
        status: 400,
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
      });
    }

    const upstreamUrl = buildBestdoriEventBannerOriginUrl(region, bundleName);
    const upstreamResponse = await fetch(upstreamUrl, {
      headers: {
        Accept: "image/png,image/*;q=0.9,*/*;q=0.8",
      },
      next: { revalidate: BESTDORI_ASSET_PROXY_REVALIDATE_SECONDS },
    });

    if (!upstreamResponse.ok) {
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: withCacheControl(LIVE_API_CACHE_CONTROL, {
          "Content-Type": upstreamResponse.headers.get("Content-Type") ?? "text/plain; charset=utf-8",
        }),
      });
    }

    return new Response(upstreamResponse.body, {
      status: 200,
      headers: withCacheControl(BESTDORI_ASSET_PROXY_CACHE_CONTROL, {
        "Content-Type": upstreamResponse.headers.get("Content-Type") ?? "image/png",
      }),
    });
  } catch (error) {
    console.error("Bandori event banner proxy API 错误:", error);
    return NextResponse.json({ error: "读取活动横幅失败" }, {
      status: 500,
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}