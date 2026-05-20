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
  type BandoriAssetRegion,
} from "@/lib/bandori-asset-proxy";
import { fetchBandoriEventRecords } from "@/lib/bandori-events-server";

type UpstreamBannerFailure = {
  upstreamUrl: string;
  status: number;
  contentType: string | null;
  reason: "http_error" | "non_image" | "empty";
  snippet?: string;
};

// 这里按“真实 event bundle -> 当前请求 bundle -> legacy homebanner”排序尝试，
// 是为了优先命中更稳定的原始活动资源路径，同时保留 banner_eventXXX 旧值的回退能力。
// 老活动往往只有 event/{bundle}/images_rip/banner.png；
// 如果一开始就把 banner_eventXXX 当主资源名，更容易命中上游返回的 HTML 占位页。
async function resolveEventBannerCandidateUrls(region: BandoriAssetRegion, bundleName: string): Promise<string[]> {
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

// 这里必须把“200 但不是 image/*”和“空 body”都当成失败，
// 因为上游对不存在的资源经常返回 HTML 页面而不是 404。
// 如果把这类响应当成功图片透传，再叠加长缓存头，就会把错误页面缓存成稳定静态资源。
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

// 共享代理逻辑单独抽到 lib，是为了让原始语义主路径只维护一份上游判定逻辑。
// 这样未来如果调整 candidate 顺序、错误降级或缓存策略，不会再出现多个路由各改一半的分叉。
export async function proxyBandoriEventBanner({ region, bundleName }: { region: string; bundleName: string }) {
  try {
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