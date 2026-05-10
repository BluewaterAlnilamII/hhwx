import { BESTDORI_ASSET_PROXY_CACHE_CONTROL, BESTDORI_ASSET_PROXY_REVALIDATE_SECONDS } from "@/lib/api-cache";
import { buildBestdoriAssetOriginUrl, isBandoriAssetRegion } from "@/lib/bandori-asset-proxy";

const SAFE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9_.-]+$/;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function isSafeAssetPath(assetPath: string[]): boolean {
  return assetPath.length > 0 && assetPath.every((segment) => SAFE_PATH_SEGMENT_PATTERN.test(segment));
}

function isSupportedCardAssetPath(assetPath: string[]): boolean {
  if (
    assetPath.length === 4
    && assetPath[0] === "characters"
    && assetPath[1] === "resourceset"
    && /^res\d{6}_rip$/.test(assetPath[2])
    && /^(card|trim)_(normal|after_training)\.png$/.test(assetPath[3])
  ) {
    return true;
  }

  return (
    assetPath.length === 4
    && assetPath[0] === "thumb"
    && assetPath[1] === "chara"
    && /^card\d{5}_rip$/.test(assetPath[2])
    && /^res\d{6}_(normal|after_training)\.png$/.test(assetPath[3])
  );
}

function hasPngSignature(body: ArrayBuffer): boolean {
  if (body.byteLength < PNG_SIGNATURE.length) {
    return false;
  }

  const bytes = new Uint8Array(body, 0, PNG_SIGNATURE.length);
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ region: string; assetPath: string[] }> },
) {
  const { region, assetPath } = await context.params;

  if (!isBandoriAssetRegion(region) || !isSafeAssetPath(assetPath) || !isSupportedCardAssetPath(assetPath)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const response = await fetch(buildBestdoriAssetOriginUrl(region, assetPath), {
      headers: { "User-Agent": "hhwx-tracker/1.0" },
      next: { revalidate: BESTDORI_ASSET_PROXY_REVALIDATE_SECONDS },
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok) {
      return new Response("Not found", { status: 404 });
    }

    const body = await response.arrayBuffer();
    if (!contentType.toLowerCase().startsWith("image/png") && !hasPngSignature(body)) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(body, {
      status: 200,
      headers: {
        "Cache-Control": BESTDORI_ASSET_PROXY_CACHE_CONTROL,
        "Content-Type": "image/png",
      },
    });
  } catch (error) {
    console.error("Bandori card asset proxy error:", error);
    return new Response("Asset proxy failed", { status: 502 });
  }
}
