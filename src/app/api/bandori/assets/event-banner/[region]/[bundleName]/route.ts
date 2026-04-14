import { NextResponse } from "next/server";
import {
  BESTDORI_ASSET_PROXY_CACHE_CONTROL,
  BESTDORI_ASSET_PROXY_REVALIDATE_SECONDS,
  LIVE_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import {
  buildBestdoriEventBannerOriginUrl,
  buildBestdoriLegacyHomeBannerOriginUrl,
  extractBandoriEventIdFromLegacyBannerBundleName,
  isBandoriAssetRegion,
  isSafeBandoriAssetSegment,
} from "@/lib/bandori-asset-proxy";
import { fetchBandoriEventRecords } from "@/lib/bandori-events-server";

export const dynamic = "force-dynamic";

type UpstreamBannerFailure = {
  upstreamUrl: string;
  status: number;
  contentType: string | null;
  reason: "http_error" | "non_image" | "empty";
  snippet?: string;
};

async function resolveEventBannerCandidateUrls(region: "jp" | "cn", bundleName: string): Promise<string[]> {
  const candidateUrls = new Set<string>();
  const legacyEventId = extractBandoriEventIdFromLegacyBannerBundleName(bundleName);

  if (legacyEventId !== null) {
    try {
      const [record] = await fetchBandoriEventRecords({ eventId: legacyEventId });
      const resolvedBundleName = record?.asset_bundle_name?.trim();
      if (resolvedBundleName) {
        candidateUrls.add(buildBestdoriEventBannerOriginUrl(region, resolvedBundleName));
      }
    } catch (error) {
      console.warn("Bandori event banner proxy 解析 legacy banner bundle 失败:", {
        bundleName,
        legacyEventId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  candidateUrls.add(buildBestdoriEventBannerOriginUrl(region, bundleName));

  if (legacyEventId !== null) {
    candidateUrls.add(buildBestdoriLegacyHomeBannerOriginUrl(region, bundleName));
  }

  return Array.from(candidateUrls);
}

async function fetchUpstreamBannerImage(upstreamUrl: string): Promise<
  | { ok: true; contentType: string; buffer: ArrayBuffer }
  | { ok: false; failure: UpstreamBannerFailure }
> {
  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      Accept: "image/png,image/*;q=0.9,*/*;q=0.8",
    },
    next: { revalidate: BESTDORI_ASSET_PROXY_REVALIDATE_SECONDS },
  });

  const upstreamContentType = upstreamResponse.headers.get("Content-Type");

  if (!upstreamResponse.ok) {
    return {
      ok: false,
      failure: {
        upstreamUrl,
        status: upstreamResponse.status,
        contentType: upstreamContentType,
        reason: "http_error",
      },
    };
  }

  if (!upstreamContentType?.toLowerCase().startsWith("image/")) {
    const upstreamText = await upstreamResponse.text();
    return {
      ok: false,
      failure: {
        upstreamUrl,
        status: upstreamResponse.status,
        contentType: upstreamContentType,
        reason: "non_image",
        snippet: upstreamText.slice(0, 200),
      },
    };
  }

  const upstreamBuffer = await upstreamResponse.arrayBuffer();
  if (upstreamBuffer.byteLength === 0) {
    return {
      ok: false,
      failure: {
        upstreamUrl,
        status: upstreamResponse.status,
        contentType: upstreamContentType,
        reason: "empty",
      },
    };
  }

  return {
    ok: true,
    contentType: upstreamContentType,
    buffer: upstreamBuffer,
  };
}

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

    const candidateUrls = await resolveEventBannerCandidateUrls(region, bundleName);
    const failures: UpstreamBannerFailure[] = [];

    for (const upstreamUrl of candidateUrls) {
      const upstreamResult = await fetchUpstreamBannerImage(upstreamUrl);
      if (upstreamResult.ok) {
        return new Response(upstreamResult.buffer, {
          status: 200,
          headers: withCacheControl(BESTDORI_ASSET_PROXY_CACHE_CONTROL, {
            "Content-Type": upstreamResult.contentType,
          }),
        });
      }

      failures.push(upstreamResult.failure);
    }

    console.error("Bandori event banner proxy 未找到可用横幅资源:", {
      region,
      bundleName,
      candidateUrls,
      failures,
    });
    return NextResponse.json({ error: "上游横幅资源不存在或返回了非图片内容" }, {
      status: 502,
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori event banner proxy API 错误:", error);
    return NextResponse.json({ error: "读取活动横幅失败" }, {
      status: 500,
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}