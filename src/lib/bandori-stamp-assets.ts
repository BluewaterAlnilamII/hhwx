import { MUTABLE_DIRECTORY_CACHE_PROFILE } from "@/lib/api-cache";

export type BandoriStampRegion = "jp" | "en" | "tw" | "cn";

export const BANDORI_STAMP_REGIONS = ["jp", "en", "tw", "cn"] as const satisfies readonly BandoriStampRegion[];
const BANDORI_STAMP_SLOT_COUNT = BANDORI_STAMP_REGIONS.length;
const BANDORI_STAMP_REGION_SLOT: Record<BandoriStampRegion, number> = {
  jp: 0,
  en: 1,
  tw: 2,
  cn: 3,
};

export type BandoriStampAnimationSummary = {
  manifestUrl: string;
  atlasUrl: string;
  frameRate?: number;
  frameCount?: number;
};

export type BandoriStampCatalogPayloadEntry = {
  imageName: string[];
  imageUrl: string[];
  voiceUrl?: string[];
  animation?: Partial<Record<BandoriStampRegion, BandoriStampAnimationSummary>>;
};

export type BandoriStampCatalogPayload = Record<string, BandoriStampCatalogPayloadEntry>;

export type BandoriStampCatalogApiResponse = {
  payload: BandoriStampCatalogPayload;
};

export type BandoriStampCatalogItem = {
  id: number;
  region: BandoriStampRegion;
  imageName: string;
  imageUrl: string;
  voiceUrl: string;
  animation?: BandoriStampAnimationSummary;
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

function readPublicUrl(value: unknown): string {
  const url = readString(value);
  if (!url) {
    return "";
  }

  return /^(?:https?:)?\/\//u.test(url) || url.startsWith("/") ? url : "";
}

function readStampSlots(value: unknown): string[] {
  const slots = new Array<string>(BANDORI_STAMP_SLOT_COUNT).fill("");
  if (!Array.isArray(value)) {
    return slots;
  }

  value.slice(0, BANDORI_STAMP_SLOT_COUNT).forEach((item, index) => {
    slots[index] = readString(item) ?? "";
  });
  return slots;
}

function readUrlSlots(value: unknown): string[] {
  const slots = new Array<string>(BANDORI_STAMP_SLOT_COUNT).fill("");
  if (!Array.isArray(value)) {
    return slots;
  }

  value.slice(0, BANDORI_STAMP_SLOT_COUNT).forEach((item, index) => {
    slots[index] = readPublicUrl(item);
  });
  return slots;
}

function appendAssetVersion(url: string, versionToken: string | null | undefined): string {
  const token = readString(versionToken);
  if (!token || !/^[0-9a-f]{64}$/iu.test(token)) {
    return url;
  }

  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(token)}`;
}

function buildBandoriStampPath(region: BandoriStampRegion, stampId: number, path: string): string {
  return `bandori/stamps/${region}/${Math.trunc(stampId)}/${path.replace(/^\/+/u, "")}`;
}

function readApiSuccessData(raw: unknown): unknown {
  return isRecord(raw) && raw.success === true && "data" in raw ? raw.data : raw;
}

function readAnimationSummary(value: unknown): BandoriStampAnimationSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const manifestUrl = readPublicUrl(value.manifestUrl);
  const atlasUrl = readPublicUrl(value.atlasUrl);
  if (!manifestUrl || !atlasUrl) {
    return null;
  }

  const summary: BandoriStampAnimationSummary = {
    manifestUrl,
    atlasUrl,
  };
  const frameRate = readNumber(value.frameRate);
  const frameCount = readInteger(value.frameCount);
  if (frameRate !== null) {
    summary.frameRate = frameRate;
  }
  if (frameCount !== null) {
    summary.frameCount = frameCount;
  }
  return summary;
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

export function buildBandoriStampCdnUrl(
  assetKey: string,
  baseUrl = getPublicBandoriStampCdnBaseUrl(),
  versionToken?: string | null,
): string {
  if (!baseUrl) {
    throw new Error("Bandori stamp CDN base URL is not configured");
  }

  return appendAssetVersion(`${baseUrl}/${encodeAssetKeyPath(assetKey.replace(/^\/+/u, ""))}`, versionToken);
}

export function buildBandoriStampPublicUrl(assetKey: string, versionToken?: string | null): string {
  const baseUrl = getPublicBandoriStampCdnBaseUrl();
  return baseUrl
    ? buildBandoriStampCdnUrl(assetKey, baseUrl, versionToken)
    : appendAssetVersion(buildBandoriStampRelativeUrl(assetKey), versionToken);
}

export function buildBandoriStampCdnRequestUrl(assetKey: string): string | null {
  const baseUrl = getPublicBandoriStampCdnBaseUrl();
  return baseUrl ? buildBandoriStampCdnUrl(assetKey, baseUrl) : null;
}

export function buildBandoriStampCatalogCdnUrl(): string | null {
  return buildBandoriStampCdnRequestUrl("bandori/stamps/index.json");
}

export function buildBandoriStampCatalogApiUrl(): string {
  return "/api/bandori/stamps";
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
  versionToken?: string | null,
): string | null {
  const normalizedFileName = normalizeBandoriStampVoiceFileName(voiceFileName);
  if (!normalizedFileName) {
    return null;
  }

  return buildBandoriStampPublicUrl(buildBandoriStampPath(region, stampId, `voice/${normalizedFileName}`), versionToken);
}

export function buildBandoriStampImagePublicUrl(
  region: BandoriStampRegion,
  stampId: number,
  versionToken?: string | null,
): string {
  return buildBandoriStampPublicUrl(buildBandoriStampPath(region, stampId, "image.png"), versionToken);
}

export function buildBandoriStampAssetKey(region: BandoriStampRegion, stampId: number, path: string): string {
  return buildBandoriStampPath(region, stampId, path);
}

export function readBandoriStampCatalogPayload(rawPayload: unknown): BandoriStampCatalogPayload {
  if (!isRecord(rawPayload)) {
    return {};
  }

  const payload: BandoriStampCatalogPayload = {};
  for (const [stampId, rawEntry] of Object.entries(rawPayload)) {
    if (normalizeBandoriStampId(stampId) === null || !isRecord(rawEntry)) {
      continue;
    }

    const imageName = readStampSlots(rawEntry.imageName);
    const imageUrl = readUrlSlots(rawEntry.imageUrl);
    if (!imageName.some(Boolean) && !imageUrl.some(Boolean)) {
      continue;
    }

    const entry: BandoriStampCatalogPayloadEntry = { imageName, imageUrl };
    const voiceUrl = readUrlSlots(rawEntry.voiceUrl);
    if (voiceUrl.some(Boolean)) {
      entry.voiceUrl = voiceUrl;
    }

    if (isRecord(rawEntry.animation)) {
      const animation: Partial<Record<BandoriStampRegion, BandoriStampAnimationSummary>> = {};
      for (const region of BANDORI_STAMP_REGIONS) {
        const summary = readAnimationSummary(rawEntry.animation[region]);
        if (summary) {
          animation[region] = summary;
        }
      }
      if (Object.keys(animation).length > 0) {
        entry.animation = animation;
      }
    }

    payload[stampId] = entry;
  }

  return payload;
}

export function getBandoriStampCatalogItemsForRegion(
  catalog: BandoriStampCatalogApiResponse | null,
  region: BandoriStampRegion,
): BandoriStampCatalogItem[] {
  const slot = BANDORI_STAMP_REGION_SLOT[region];
  return Object.entries(catalog?.payload ?? {})
    .map(([stampId, entry]): BandoriStampCatalogItem | null => {
      const id = normalizeBandoriStampId(stampId);
      const imageUrl = entry.imageUrl[slot] ?? "";
      if (id === null || !imageUrl) {
        return null;
      }

      return {
        id,
        region,
        imageName: entry.imageName[slot] ?? "",
        imageUrl,
        voiceUrl: entry.voiceUrl?.[slot] ?? "",
        animation: entry.animation?.[region],
      };
    })
    .filter((item): item is BandoriStampCatalogItem => item !== null)
    .sort((left, right) => left.id - right.id);
}

export function parseBandoriStampCatalogApiResponse(raw: unknown): BandoriStampCatalogApiResponse | null {
  const data = readApiSuccessData(raw);
  if (!isRecord(data) || !isRecord(data.payload)) {
    return null;
  }

  return {
    payload: readBandoriStampCatalogPayload(data.payload),
  };
}

export function toBandoriStampAnimationResponse(
  region: BandoriStampRegion,
  stampId: number,
  rawManifest: RawStampAnimationManifest,
  manifestUrl: string,
  atlasUrl: string,
): BandoriStampAnimationResponse {
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
    manifestUrl,
    atlasUrl,
    atlasDimensions,
    frameRate: Math.max(1, readNumber(rawManifest.frameRate) ?? 12),
    frames,
  };
}

export function parseBandoriStampAnimationCdnResponse(
  region: BandoriStampRegion,
  stampId: number,
  raw: unknown,
  manifestUrl: string,
  atlasUrl: string,
): BandoriStampAnimationResponse | null {
  if (!isRecord(raw) || !manifestUrl || !atlasUrl) {
    return null;
  }

  return toBandoriStampAnimationResponse(region, stampId, raw, manifestUrl, atlasUrl);
}
