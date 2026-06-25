import { LIVE_API_CACHE_CONTROL, STATIC_ASSET_PROXY_CACHE_PROFILE, withCacheControl } from "@/lib/api-cache";
import { jsonError, jsonRouteError } from "@/lib/api-response";
import {
  buildBandoriStampAssetKey,
  buildBandoriStampCdnUrl,
  isBandoriStampRegion,
  normalizeBandoriStampId,
  normalizeBandoriStampVoiceFileName,
} from "@/lib/bandori-stamp-assets";

export const dynamic = "force-dynamic";

const MP3_ID3_SIGNATURE = [0x49, 0x44, 0x33] as const;

type RouteContext = {
  params: Promise<{
    region: string;
    stampId: string;
    voiceName: string;
  }>;
};

function hasMp3Signature(body: ArrayBuffer): boolean {
  if (body.byteLength < 3) {
    return false;
  }

  const bytes = new Uint8Array(body, 0, 3);
  const hasId3Header = MP3_ID3_SIGNATURE.every((value, index) => bytes[index] === value);
  const hasFrameSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  return hasId3Header || hasFrameSync;
}

function decodeRouteSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const { region: rawRegion, stampId: rawStampId, voiceName: rawVoiceName } = await context.params;
  const stampId = normalizeBandoriStampId(rawStampId);
  const voiceName = normalizeBandoriStampVoiceFileName(decodeRouteSegment(rawVoiceName));

  if (!isBandoriStampRegion(rawRegion)) {
    return jsonError(400, "INVALID_STAMP_REGION", "Invalid stamp region", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  if (stampId === null) {
    return jsonError(400, "INVALID_STAMP_ID", "Invalid stamp id", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  if (!voiceName) {
    return jsonError(400, "INVALID_STAMP_VOICE", "Invalid stamp voice file name", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  try {
    const response = await fetch(
      buildBandoriStampCdnUrl(buildBandoriStampAssetKey(rawRegion, stampId, `voice/${voiceName}`)),
      {
        headers: { Accept: "audio/mpeg,*/*;q=0.8" },
        next: { revalidate: STATIC_ASSET_PROXY_CACHE_PROFILE.nextRevalidateSeconds },
      },
    );

    if (!response.ok) {
      return jsonError(404, "BANDORI_STAMP_VOICE_NOT_FOUND", "Bandori stamp voice was not found", {
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
      });
    }

    const body = await response.arrayBuffer();
    const contentType = response.headers.get("Content-Type") ?? "";
    if (body.byteLength === 0 || (!contentType.toLowerCase().startsWith("audio/mpeg") && !hasMp3Signature(body))) {
      return jsonError(502, "BANDORI_STAMP_VOICE_INVALID", "Bandori stamp voice response was not MP3 audio", {
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
      });
    }

    return new Response(body, {
      status: 200,
      headers: withCacheControl(STATIC_ASSET_PROXY_CACHE_PROFILE.cacheControl, {
        "Content-Type": "audio/mpeg",
        "X-Content-Type-Options": "nosniff",
      }),
    });
  } catch (error) {
    const isMissingConfiguration = error instanceof Error && error.message.includes("not configured");
    return jsonRouteError(error, {
      status: isMissingConfiguration ? 503 : 502,
      code: "BANDORI_STAMP_VOICE_READ_FAILED",
      message: "Failed to fetch Bandori stamp voice",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
