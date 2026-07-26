import { LONG_CLIENT_CACHE_POLICY } from "@/lib/api-cache";
import {
  BANDORI_PUBLIC_ASSET_SERVERS,
  buildBandoriPublicAssetUrl,
  type BandoriStampsAssetIndex,
} from "@/lib/bandori-public-asset-index";

export type BandoriStampRegion = "jp" | "en" | "tw" | "cn";

export const BANDORI_STAMP_REGIONS = BANDORI_PUBLIC_ASSET_SERVERS;
const BANDORI_STAMP_SLOT_COUNT = BANDORI_STAMP_REGIONS.length;
const BANDORI_STAMP_REGION_SLOT: Record<BandoriStampRegion, number> = {
  jp: 0,
  en: 1,
  tw: 2,
  cn: 3,
};

export type BandoriStampStringSlots = [string, string, string, string];
export type BandoriStampCharacterSlots = [
  number | null,
  number | null,
  number | null,
  number | null,
];
export type BandoriChangedStampMasterEntry = {
  imageName: string;
  soundName: string;
};
export type BandoriChangedStampMasterSlots = [
  BandoriChangedStampMasterEntry[],
  BandoriChangedStampMasterEntry[],
  BandoriChangedStampMasterEntry[],
  BandoriChangedStampMasterEntry[],
];

export type BandoriStampMasterEntry = {
  imageName: BandoriStampStringSlots;
  characterId: BandoriStampCharacterSlots;
  changedStamps?: BandoriChangedStampMasterSlots;
};

export type BandoriStampMasterMap = Record<string, BandoriStampMasterEntry>;

export type BandoriStampCatalog = {
  master: BandoriStampMasterMap;
  assets: BandoriStampsAssetIndex;
};

export type BandoriStampAnimationSummary = {
  manifestUrl: string;
  atlasUrl: string;
  frameRate?: number;
  frameCount?: number;
};

export type BandoriStampCatalogItem = {
  id: number;
  region: BandoriStampRegion;
  kind: "normal" | "changed";
  imageName: string;
  characterId: number | null;
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

export const BANDORI_STAMP_CLIENT_STALE_TIME_MS =
  LONG_CLIENT_CACHE_POLICY.staleTimeMs ?? 12 * 60 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  return width !== null && height !== null && width > 0 && height > 0
    ? { width, height }
    : null;
}

function readAnimationFrameRect(value: unknown): BandoriStampAnimationFrameRect | null {
  if (!isRecord(value)) {
    return null;
  }
  const x = readInteger(value.x);
  const y = readInteger(value.y);
  const width = readInteger(value.width);
  const height = readInteger(value.height);
  return x !== null
    && y !== null
    && width !== null
    && height !== null
    && width > 0
    && height > 0
    ? { x, y, width, height }
    : null;
}

function readApiSuccessData(raw: unknown): unknown {
  return isRecord(raw) && raw.success === true && "data" in raw ? raw.data : null;
}

function parseChangedMasterSlots(
  value: unknown,
): BandoriChangedStampMasterSlots | null {
  if (!Array.isArray(value) || value.length !== BANDORI_STAMP_SLOT_COUNT) {
    return null;
  }
  const slots: BandoriChangedStampMasterEntry[][] = [];
  for (const rawSlot of value) {
    if (!Array.isArray(rawSlot)) {
      return null;
    }
    const slot: BandoriChangedStampMasterEntry[] = [];
    for (const rawVariant of rawSlot) {
      if (
        !isRecord(rawVariant)
        || Object.keys(rawVariant).some(
          (key) => key !== "imageName" && key !== "soundName",
        )
        || typeof rawVariant.imageName !== "string"
        || typeof rawVariant.soundName !== "string"
        || (!rawVariant.imageName && !rawVariant.soundName)
      ) {
        return null;
      }
      slot.push({
        imageName: rawVariant.imageName,
        soundName: rawVariant.soundName,
      });
    }
    slots.push(slot);
  }
  return slots as BandoriChangedStampMasterSlots;
}

function parseMasterEntry(value: unknown): BandoriStampMasterEntry | null {
  if (
    !isRecord(value)
    || Object.keys(value).some(
      (key) => (
        key !== "imageName"
        && key !== "characterId"
        && key !== "changedStamps"
      ),
    )
    || !Array.isArray(value.imageName)
    || value.imageName.length !== BANDORI_STAMP_SLOT_COUNT
    || !Array.isArray(value.characterId)
    || value.characterId.length !== BANDORI_STAMP_SLOT_COUNT
  ) {
    return null;
  }
  const imageName = value.imageName;
  const characterId = value.characterId;
  for (let index = 0; index < BANDORI_STAMP_SLOT_COUNT; index += 1) {
    if (
      typeof imageName[index] !== "string"
      || (
        characterId[index] !== null
        && (
          !Number.isSafeInteger(characterId[index])
          || characterId[index] <= 0
        )
      )
      || (imageName[index] === "" && characterId[index] !== null)
    ) {
      return null;
    }
  }
  const entry: BandoriStampMasterEntry = {
    imageName: [...imageName] as BandoriStampStringSlots,
    characterId: [...characterId] as BandoriStampCharacterSlots,
  };
  if (Object.hasOwn(value, "changedStamps")) {
    const changedStamps = parseChangedMasterSlots(value.changedStamps);
    if (!changedStamps || !changedStamps.some((slot) => slot.length > 0)) {
      return null;
    }
    entry.changedStamps = changedStamps;
  }
  return entry;
}

function buildAnimationSummary(
  catalog: BandoriStampCatalog,
  stampId: string,
  region: BandoriStampRegion,
): BandoriStampAnimationSummary | undefined {
  const animation = catalog.assets.stamps[stampId]?.animations?.[region];
  if (!animation) {
    return undefined;
  }
  const manifestUrl = buildBandoriPublicAssetUrl(animation.manifest);
  const atlasUrl = buildBandoriPublicAssetUrl(animation.atlas);
  if (!manifestUrl || !atlasUrl) {
    return undefined;
  }
  return {
    manifestUrl,
    atlasUrl,
    ...(animation.frameRate === undefined ? {} : { frameRate: animation.frameRate }),
    ...(animation.frameCount === undefined ? {} : { frameCount: animation.frameCount }),
  };
}

export function isBandoriStampRegion(value: string): value is BandoriStampRegion {
  return BANDORI_STAMP_REGIONS.includes(value as BandoriStampRegion);
}

export function normalizeBandoriStampId(value: string | number): number | null {
  const stampId = typeof value === "number"
    ? Math.trunc(value)
    : /^\d+$/u.test(value.trim())
      ? Number.parseInt(value, 10)
      : Number.NaN;
  return Number.isSafeInteger(stampId) && stampId > 0 && stampId <= 999999
    ? stampId
    : null;
}

export function buildBandoriStampMasterApiUrl(): string {
  return "/api/bandori/master/stamps";
}

export function parseBandoriStampMasterApiResponse(
  raw: unknown,
): BandoriStampMasterMap {
  const data = readApiSuccessData(raw);
  if (!isRecord(data)) {
    throw new Error("Bandori stamps master API response is invalid");
  }
  const master: BandoriStampMasterMap = {};
  for (const [stampId, value] of Object.entries(data)) {
    const entry = parseMasterEntry(value);
    if (normalizeBandoriStampId(stampId) === null || !entry) {
      throw new Error(`Bandori stamps master API record is invalid: ${stampId}`);
    }
    master[stampId] = entry;
  }
  if (Object.keys(master).length === 0) {
    throw new Error("Bandori stamps master API dataset is empty");
  }
  return master;
}

export function getBandoriStampCatalogItemsForRegion(
  catalog: BandoriStampCatalog | null,
  region: BandoriStampRegion,
): BandoriStampCatalogItem[] {
  if (!catalog) {
    return [];
  }
  const slot = BANDORI_STAMP_REGION_SLOT[region];
  const items: BandoriStampCatalogItem[] = [];
  for (const [stampId, masterEntry] of Object.entries(catalog.master).sort(
    ([leftId], [rightId]) => Number(leftId) - Number(rightId),
  )) {
      const id = normalizeBandoriStampId(stampId);
      const image = catalog.assets.stamps[stampId]?.images[slot] ?? null;
      const imageUrl = buildBandoriPublicAssetUrl(image) ?? "";
      if (id === null || !masterEntry.imageName[slot] || !imageUrl) {
        continue;
      }
      const voice = catalog.assets.stamps[stampId]?.voices[slot] ?? null;
      items.push({
        id,
        region,
        kind: "normal",
        imageName: masterEntry.imageName[slot],
        characterId: masterEntry.characterId[slot],
        imageUrl,
        voiceUrl: buildBandoriPublicAssetUrl(voice) ?? "",
        animation: buildAnimationSummary(catalog, stampId, region),
      });

      const masterChanged = masterEntry.changedStamps?.[slot] ?? [];
      const assetChanged = catalog.assets.stamps[stampId]?.changedStamps?.[slot] ?? [];
      // These arrays are a parallel contract: both producers sort variants by
      // imageName and soundName before publication, so an array offset is the
      // identity shared by private master metadata and the public asset index.
      if (masterChanged.length !== assetChanged.length) {
        continue;
      }
      const changedIndex = assetChanged.findIndex(
        (variant) => (
          variant.image !== undefined
          && variant.image.sha256 !== image?.sha256
        ),
      );
      if (changedIndex < 0) {
        continue;
      }
      const changedMaster = masterChanged[changedIndex];
      const changedAsset = assetChanged[changedIndex];
      const changedImageUrl = buildBandoriPublicAssetUrl(changedAsset.image);
      if (!changedImageUrl) {
        continue;
      }
      items.push({
        id,
        region,
        kind: "changed",
        imageName: changedMaster.imageName,
        characterId: masterEntry.characterId[slot],
        imageUrl: changedImageUrl,
        voiceUrl: buildBandoriPublicAssetUrl(changedAsset.audio) ?? "",
      });
  }
  return items;
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
      const atlasRect = readAnimationFrameRect(frame.unityRect)
        ?? readAnimationFrameRect(frame.cssRect);
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
  return toBandoriStampAnimationResponse(
    region,
    stampId,
    raw,
    manifestUrl,
    atlasUrl,
  );
}
