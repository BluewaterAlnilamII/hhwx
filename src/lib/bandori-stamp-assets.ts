import { MUTABLE_DIRECTORY_CACHE_PROFILE } from "@/lib/api-cache";

export type BandoriStampRegion = "jp" | "en" | "tw" | "cn";

export type BandoriStampCatalogItem = {
  id: number;
  region: BandoriStampRegion;
  imageName: string | null;
  imageUrl: string;
  manifestUrl: string;
  seq: number | null;
  stampType: string | null;
  withVoice: boolean;
  hasVoiceAudio: boolean;
  hasAnimation: boolean;
};

export type BandoriStampIndexResponse = {
  region: BandoriStampRegion;
  generatedAt: string | null;
  masterVersion: string | null;
  count: number;
  missingImageCount: number;
  missingVoiceCount: number;
  changedStampCount: number;
  stamps: BandoriStampCatalogItem[];
};

export type BandoriStampAssetResponse = {
  id: number;
  region: BandoriStampRegion;
  imageName: string | null;
  imageUrl: string;
  manifestUrl: string;
  dimensions: { width: number; height: number } | null;
  voiceUrl: string | null;
  voiceName: string | null;
  withVoice: boolean;
  hasVoiceAudio: boolean;
  hasAnimation: boolean;
  animation: {
    manifestUrl: string;
    atlasUrl: string | null;
    frameRate: number | null;
    frameCount: number | null;
  } | null;
};

type BandoriStampAnimationFrameRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BandoriStampAnimationFrame = {
  name: string;
  cssRect: BandoriStampAnimationFrameRect;
};

export type BandoriStampAnimationResponse = {
  id: number;
  region: BandoriStampRegion;
  manifestUrl: string;
  atlasUrl: string;
  atlasDimensions: { width: number; height: number };
  frameRate: number;
  frames: BandoriStampAnimationFrame[];
};

type RawStampIndexItem = {
  stampId?: unknown;
  seq?: unknown;
  imageName?: unknown;
  stampType?: unknown;
  withVoice?: unknown;
  hasVoiceAudio?: unknown;
  hasAnimation?: unknown;
  image?: unknown;
  manifest?: unknown;
};

type RawStampIndex = {
  generatedAt?: unknown;
  masterVersion?: unknown;
  count?: unknown;
  missingImageCount?: unknown;
  missingVoiceCount?: unknown;
  changedStampCount?: unknown;
  stamps?: unknown;
};

type RawStampAssetManifest = {
  stampId?: unknown;
  imageName?: unknown;
  dimensions?: unknown;
  image?: unknown;
  voice?: unknown;
  voiceName?: unknown;
  withVoice?: unknown;
  animation?: unknown;
};

type RawStampAnimationManifest = {
  frameRate?: unknown;
  atlas?: unknown;
  atlasDimensions?: unknown;
  frames?: unknown;
};

const STAMP_VOICE_FILE_NAME_PATTERN = /^[A-Za-z0-9_-]+\.mp3$/u;

export const BANDORI_STAMP_CLIENT_STALE_TIME_MS =
  MUTABLE_DIRECTORY_CACHE_PROFILE.client?.staleTimeMs ?? 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeCdnBaseUrl(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue.replace(/\/+$/u, "") : null;
}

function encodeAssetKeyPath(assetKey: string): string {
  return assetKey
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildBandoriStampRelativeUrl(assetKey: string): string {
  return `/${encodeAssetKeyPath(assetKey.replace(/^\/+/u, ""))}`;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readInteger(value: unknown): number | null {
  const numericValue = readNumber(value);
  return numericValue !== null ? Math.trunc(numericValue) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readDimensions(value: unknown): { width: number; height: number } | null {
  if (!isRecord(value)) {
    return null;
  }

  const width = readInteger(value.width);
  const height = readInteger(value.height);
  return width !== null && height !== null && width > 0 && height > 0 ? { width, height } : null;
}

function readAnimationFrameRect(value: unknown): BandoriStampAnimationFrameRect | null {
  if (!isRecord(value)) {
    return null;
  }

  const x = readInteger(value.x);
  const y = readInteger(value.y);
  const width = readInteger(value.width);
  const height = readInteger(value.height);
  return x !== null && y !== null && width !== null && height !== null && width > 0 && height > 0
    ? { x, y, width, height }
    : null;
}

function readObjectKey(value: unknown): string | null {
  const key = readString(value);
  if (!key) {
    return null;
  }

  const normalizedKey = key.replace(/^\/+/u, "");
  return normalizedKey.startsWith("bandori/stamps/") ? normalizedKey : null;
}

function readChecksumKey(value: unknown): string | null {
  return isRecord(value) ? readObjectKey(value.key) : null;
}

function readAssetKeyFileName(value: string | null): string | null {
  const fileName = value?.split("/").filter(Boolean).at(-1);
  return fileName ? normalizeBandoriStampVoiceFileName(fileName) : null;
}

function buildBandoriStampPath(region: BandoriStampRegion, stampId: number, path: string): string {
  return `bandori/stamps/${region}/${Math.trunc(stampId)}/${path.replace(/^\/+/u, "")}`;
}

export function isBandoriStampRegion(value: string): value is BandoriStampRegion {
  return value === "jp" || value === "en" || value === "tw" || value === "cn";
}

export function normalizeBandoriStampId(value: string | number): number | null {
  const stampId = typeof value === "number"
    ? Math.trunc(value)
    : /^\d+$/u.test(value.trim())
      ? Number.parseInt(value, 10)
      : Number.NaN;
  return Number.isSafeInteger(stampId) && stampId > 0 && stampId <= 999999 ? stampId : null;
}

export function normalizeBandoriStampVoiceFileName(value: string): string | null {
  const trimmedValue = value.trim();
  return STAMP_VOICE_FILE_NAME_PATTERN.test(trimmedValue) ? trimmedValue : null;
}

export function getPublicBandoriStampCdnBaseUrl(): string | null {
  return normalizeCdnBaseUrl(process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL);
}

export function buildBandoriStampCdnUrl(assetKey: string, baseUrl = getPublicBandoriStampCdnBaseUrl()): string {
  if (!baseUrl) {
    throw new Error("Bandori stamp CDN base URL is not configured");
  }

  return `${baseUrl}/${encodeAssetKeyPath(assetKey.replace(/^\/+/u, ""))}`;
}

export function buildBandoriStampPublicUrl(assetKey: string): string {
  const baseUrl = getPublicBandoriStampCdnBaseUrl();
  return baseUrl ? buildBandoriStampCdnUrl(assetKey, baseUrl) : buildBandoriStampRelativeUrl(assetKey);
}

export function buildBandoriStampCdnRequestUrl(assetKey: string): string | null {
  const baseUrl = getPublicBandoriStampCdnBaseUrl();
  return baseUrl ? buildBandoriStampCdnUrl(assetKey, baseUrl) : null;
}

export function buildBandoriStampIndexCdnUrl(region: BandoriStampRegion): string | null {
  return buildBandoriStampCdnRequestUrl(`bandori/stamps/${region}/index.json`);
}

export function buildBandoriStampManifestPublicUrl(region: BandoriStampRegion, stampId: number): string {
  return buildBandoriStampPublicUrl(buildBandoriStampPath(region, stampId, "manifest.json"));
}

export function buildBandoriStampManifestCdnUrl(region: BandoriStampRegion, stampId: number): string | null {
  return buildBandoriStampCdnRequestUrl(buildBandoriStampPath(region, stampId, "manifest.json"));
}

export function buildBandoriStampAnimationManifestPublicUrl(region: BandoriStampRegion, stampId: number): string {
  return buildBandoriStampPublicUrl(buildBandoriStampPath(region, stampId, "animation/manifest.json"));
}

export function buildBandoriStampAnimationManifestCdnUrl(region: BandoriStampRegion, stampId: number): string | null {
  return buildBandoriStampCdnRequestUrl(buildBandoriStampPath(region, stampId, "animation/manifest.json"));
}

export function buildBandoriStampVoicePublicUrl(
  region: BandoriStampRegion,
  stampId: number,
  voiceFileName: string,
): string | null {
  const normalizedFileName = normalizeBandoriStampVoiceFileName(voiceFileName);
  if (!normalizedFileName) {
    return null;
  }

  return buildBandoriStampPublicUrl(buildBandoriStampPath(region, stampId, `voice/${normalizedFileName}`));
}

export function buildBandoriStampImagePublicUrl(region: BandoriStampRegion, stampId: number, imageKey?: string | null): string {
  const assetKey = imageKey ?? buildBandoriStampPath(region, stampId, "image.png");
  return buildBandoriStampPublicUrl(assetKey);
}

export function buildBandoriStampAssetKey(region: BandoriStampRegion, stampId: number, path: string): string {
  return buildBandoriStampPath(region, stampId, path);
}

export function toBandoriStampCatalogItem(
  region: BandoriStampRegion,
  rawItem: RawStampIndexItem,
): BandoriStampCatalogItem | null {
  const stampId = readInteger(rawItem.stampId);
  if (stampId === null || normalizeBandoriStampId(stampId) === null) {
    return null;
  }

  const imageKey = readObjectKey(rawItem.image);
  return {
    id: stampId,
    region,
    imageName: readString(rawItem.imageName),
    imageUrl: buildBandoriStampImagePublicUrl(region, stampId, imageKey),
    manifestUrl: buildBandoriStampManifestPublicUrl(region, stampId),
    seq: readInteger(rawItem.seq),
    stampType: readString(rawItem.stampType),
    withVoice: rawItem.withVoice === true,
    hasVoiceAudio: rawItem.hasVoiceAudio === true,
    hasAnimation: rawItem.hasAnimation === true,
  };
}

export function toBandoriStampIndexResponse(
  region: BandoriStampRegion,
  rawIndex: RawStampIndex,
): BandoriStampIndexResponse {
  const rawStamps = Array.isArray(rawIndex.stamps) ? rawIndex.stamps : [];
  const stamps = rawStamps
    .filter(isRecord)
    .map((item) => toBandoriStampCatalogItem(region, item))
    .filter((item): item is BandoriStampCatalogItem => item !== null);

  return {
    region,
    generatedAt: readString(rawIndex.generatedAt),
    masterVersion: readString(rawIndex.masterVersion),
    count: readInteger(rawIndex.count) ?? stamps.length,
    missingImageCount: readInteger(rawIndex.missingImageCount) ?? 0,
    missingVoiceCount: readInteger(rawIndex.missingVoiceCount) ?? 0,
    changedStampCount: readInteger(rawIndex.changedStampCount) ?? 0,
    stamps,
  };
}

export function toBandoriStampAssetResponse(
  region: BandoriStampRegion,
  stampId: number,
  rawManifest: RawStampAssetManifest,
): BandoriStampAssetResponse {
  const imageKey = isRecord(rawManifest.image) ? readChecksumKey(rawManifest.image) : null;
  const voice = isRecord(rawManifest.voice) ? rawManifest.voice : null;
  const voiceAudioKey = voice ? readChecksumKey(voice.audio) : null;
  const voiceName = readString(rawManifest.voiceName) ?? (voice ? readString(voice.voiceName) : null);
  const voiceFileName = readAssetKeyFileName(voiceAudioKey) ?? (voiceName ? normalizeBandoriStampVoiceFileName(`${voiceName}.mp3`) : null);
  const animation = isRecord(rawManifest.animation) ? rawManifest.animation : null;
  const animationManifestKey = animation ? readObjectKey(animation.manifest) : null;
  const atlasKey = animation ? readChecksumKey(animation.atlas) : null;

  return {
    id: stampId,
    region,
    imageName: readString(rawManifest.imageName),
    imageUrl: buildBandoriStampImagePublicUrl(region, stampId, imageKey),
    manifestUrl: buildBandoriStampManifestPublicUrl(region, stampId),
    dimensions: readDimensions(rawManifest.dimensions),
    voiceUrl: voiceFileName ? buildBandoriStampVoicePublicUrl(region, stampId, voiceFileName) : null,
    voiceName,
    withVoice: rawManifest.withVoice === true,
    hasVoiceAudio: Boolean(voiceAudioKey && voiceFileName),
    hasAnimation: Boolean(animationManifestKey),
    animation: animationManifestKey
      ? {
        manifestUrl: buildBandoriStampAnimationManifestPublicUrl(region, stampId),
        atlasUrl: atlasKey ? buildBandoriStampPublicUrl(atlasKey) : null,
        frameRate: animation ? readNumber(animation.frameRate) : null,
        frameCount: animation ? readInteger(animation.frameCount) : null,
      }
      : null,
  };
}

export function toBandoriStampAnimationResponse(
  region: BandoriStampRegion,
  stampId: number,
  rawManifest: RawStampAnimationManifest,
): BandoriStampAnimationResponse {
  const atlasName = readString(rawManifest.atlas) ?? "atlas.png";
  const atlasDimensions = readDimensions(rawManifest.atlasDimensions);
  const rawFrames = Array.isArray(rawManifest.frames) ? rawManifest.frames : [];
  const frames = rawFrames
    .filter(isRecord)
    .map((frame, index): BandoriStampAnimationFrame | null => {
      const atlasRect = readAnimationFrameRect(frame.unityRect) ?? readAnimationFrameRect(frame.cssRect);
      if (!atlasRect) {
        return null;
      }

      return {
        name: readString(frame.name) ?? String(index),
        cssRect: atlasRect,
      };
    })
    .filter((frame): frame is BandoriStampAnimationFrame => frame !== null);

  if (!atlasDimensions || frames.length === 0) {
    throw new Error("Bandori stamp animation manifest is incomplete");
  }

  return {
    id: stampId,
    region,
    manifestUrl: buildBandoriStampAnimationManifestPublicUrl(region, stampId),
    atlasUrl: buildBandoriStampPublicUrl(buildBandoriStampPath(region, stampId, `animation/${atlasName}`)),
    atlasDimensions,
    frameRate: Math.max(1, readNumber(rawManifest.frameRate) ?? 12),
    frames,
  };
}

export function parseBandoriStampIndexCdnResponse(
  region: BandoriStampRegion,
  raw: unknown,
): BandoriStampIndexResponse | null {
  if (!isRecord(raw)) {
    return null;
  }

  return toBandoriStampIndexResponse(region, raw);
}

export function parseBandoriStampManifestCdnResponse(
  region: BandoriStampRegion,
  stampId: number,
  raw: unknown,
): BandoriStampAssetResponse | null {
  if (!isRecord(raw)) {
    return null;
  }

  return toBandoriStampAssetResponse(region, stampId, raw);
}

export function parseBandoriStampAnimationCdnResponse(
  region: BandoriStampRegion,
  stampId: number,
  raw: unknown,
): BandoriStampAnimationResponse | null {
  if (!isRecord(raw)) {
    return null;
  }

  return toBandoriStampAnimationResponse(region, stampId, raw);
}
