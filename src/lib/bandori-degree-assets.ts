import {
  BANDORI_PUBLIC_ASSET_SERVERS,
  type BandoriAnimationAssetDescriptor,
  type BandoriDegreesAssetIndex,
  type BandoriPngAssetDescriptor,
  type BandoriPublicAssetServer,
} from "@/lib/bandori-public-asset-index";
import type {
  BandoriAtlasAnimation,
  BandoriAtlasAnimationFrame,
  BandoriAtlasDimensions,
  BandoriAtlasFrameRect,
} from "@/lib/bandori-atlas-animation";

export const BANDORI_DEGREE_ANIMATION_SCHEMA_VERSION =
  "hhwx-bandori-degree-animation-v1";
export const BANDORI_DEGREE_EFFECT_SCHEMA_VERSION =
  "hhwx-bandori-degree-effect-v1";
export const BANDORI_DEGREE_REGIONS = BANDORI_PUBLIC_ASSET_SERVERS;
export type BandoriDegreeRegion = BandoriPublicAssetServer;

export type BandoriDegreeStringSlots = [string, string, string, string];
export type BandoriDegreeNumberSlots = [number, number, number, number];

export type BandoriDegreeMasterEntry = {
  degreeType: BandoriDegreeStringSlots;
  iconImageName: BandoriDegreeStringSlots;
  baseImageName: BandoriDegreeStringSlots;
  rank: BandoriDegreeStringSlots;
  degreeName: BandoriDegreeStringSlots;
  description: BandoriDegreeStringSlots;
  seq: BandoriDegreeNumberSlots;
  characterId: BandoriDegreeNumberSlots;
  serverExtensions?: BandoriDegreeServerExtensionSlots;
};

export type BandoriDegreeEffectMaster = {
  biliDegreeEffectId: number;
  seq: number;
  degreeEffectType: string;
  assetBundleName: string;
  description: string;
};

export type BandoriDegreeServerExtension = {
  degreeEffect: BandoriDegreeEffectMaster;
};

export type BandoriDegreeEmptyServerExtension = {
  degreeEffect?: never;
};

export type BandoriDegreeServerExtensionSlot =
  | BandoriDegreeServerExtension
  | BandoriDegreeEmptyServerExtension
  | null;

export type BandoriDegreeServerExtensionSlots = [
  BandoriDegreeServerExtensionSlot,
  BandoriDegreeServerExtensionSlot,
  BandoriDegreeServerExtensionSlot,
  BandoriDegreeServerExtensionSlot,
];

export type BandoriDegreeMasterMap = Record<string, BandoriDegreeMasterEntry>;

export type BandoriDegreeCatalog = {
  master: BandoriDegreeMasterMap;
  assets: BandoriDegreesAssetIndex;
};

export type BandoriDegreeAnimationSummary = BandoriAnimationAssetDescriptor;
export type BandoriDegreeEffectSummary = BandoriDegreeEffectMaster & {
  animation?: BandoriAnimationAssetDescriptor;
};

export type BandoriDegreeCatalogItem = {
  id: number;
  region: BandoriDegreeRegion;
  degreeType: string;
  iconImageName: string;
  baseImageName: string;
  rank: string;
  degreeName: string;
  description: string;
  seq: number;
  characterId: number;
  rankImageName: string;
  iconImageResourceName: string;
  baseImage: BandoriPngAssetDescriptor | null;
  rankImage: BandoriPngAssetDescriptor | null;
  iconImage: BandoriPngAssetDescriptor | null;
  animation?: BandoriDegreeAnimationSummary;
  degreeEffect?: BandoriDegreeEffectSummary;
};

export type BandoriDegreeAnimationResponse = BandoriAtlasAnimation & {
  manifestUrl: string;
};

export type BandoriDegreeEffectResponse = BandoriAtlasAnimation & {
  manifestUrl: string;
};

const DEGREE_SLOT_COUNT = BANDORI_DEGREE_REGIONS.length;
const DEGREE_RESOURCE_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/u;
const DEGREE_STRING_FIELDS = [
  "degreeType",
  "iconImageName",
  "baseImageName",
  "rank",
  "degreeName",
  "description",
] as const;
const DEGREE_NUMBER_FIELDS = ["seq", "characterId"] as const;
const DEGREE_EFFECT_STRING_FIELDS = [
  "degreeEffectType",
  "assetBundleName",
  "description",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  label: string,
): void {
  if (
    Object.keys(value).length !== requiredKeys.length
    || requiredKeys.some((key) => !Object.hasOwn(value, key))
  ) {
    throw new Error(`${label} has unsupported fields`);
  }
}

function parseStringSlots(
  value: unknown,
  field: (typeof DEGREE_STRING_FIELDS)[number],
): BandoriDegreeStringSlots | null {
  if (!Array.isArray(value) || value.length !== DEGREE_SLOT_COUNT) return null;
  const maxLength = field === "description" ? 4096 : 255;
  if (value.some((slot) => (
    typeof slot !== "string"
    || slot.length > maxLength
    || (
      (field === "iconImageName" || field === "baseImageName")
      && slot !== ""
      && !DEGREE_RESOURCE_NAME_PATTERN.test(slot)
    )
  ))) return null;
  return [...value] as BandoriDegreeStringSlots;
}

function parseNumberSlots(value: unknown): BandoriDegreeNumberSlots | null {
  if (
    !Array.isArray(value)
    || value.length !== DEGREE_SLOT_COUNT
    || value.some((slot) => !Number.isSafeInteger(slot) || slot < 0)
  ) return null;
  return [...value] as BandoriDegreeNumberSlots;
}

function parseDegreeEffect(value: unknown): BandoriDegreeEffectMaster | null {
  if (!isRecord(value)) return null;
  const fields = ["biliDegreeEffectId", "seq", ...DEGREE_EFFECT_STRING_FIELDS] as const;
  if (
    Object.keys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))
    || !isDisplayPositiveInteger(value.biliDegreeEffectId)
    || !isDisplayPositiveInteger(value.seq)
    || typeof value.degreeEffectType !== "string"
    || !value.degreeEffectType
    || value.degreeEffectType.length > 255
    || typeof value.assetBundleName !== "string"
    || !DEGREE_RESOURCE_NAME_PATTERN.test(value.assetBundleName)
    || typeof value.description !== "string"
    || value.description.length > 4096
  ) return null;
  return {
    biliDegreeEffectId: value.biliDegreeEffectId,
    seq: value.seq,
    degreeEffectType: value.degreeEffectType,
    assetBundleName: value.assetBundleName,
    description: value.description,
  };
}

function isDisplayPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function parseDegreeServerExtensions(
  value: unknown,
  baseImageName: BandoriDegreeStringSlots,
): BandoriDegreeServerExtensionSlots | null {
  if (!Array.isArray(value) || value.length !== DEGREE_SLOT_COUNT) return null;
  const slots: BandoriDegreeServerExtensionSlot[] = [];
  let hasDegreeEffect = false;
  for (let slot = 0; slot < DEGREE_SLOT_COUNT; slot += 1) {
    const extension = value[slot];
    const isPopulated = baseImageName[slot] !== "";
    if (!isPopulated) {
      if (extension !== null) return null;
      slots.push(null);
      continue;
    }
    if (!isRecord(extension)) return null;
    if (Object.keys(extension).length === 0) {
      slots.push({});
      continue;
    }
    if (
      slot !== 3
      || Object.keys(extension).length !== 1
      || !Object.hasOwn(extension, "degreeEffect")
    ) return null;
    const degreeEffect = parseDegreeEffect(extension.degreeEffect);
    if (!degreeEffect) return null;
    slots.push({ degreeEffect });
    hasDegreeEffect = true;
  }
  return hasDegreeEffect ? slots as BandoriDegreeServerExtensionSlots : null;
}

export function parseBandoriDegreeMasterEntry(
  value: unknown,
): BandoriDegreeMasterEntry | null {
  if (!isRecord(value)) return null;
  const fields = [...DEGREE_STRING_FIELDS, ...DEGREE_NUMBER_FIELDS];
  const allowedFields = new Set([...fields, "serverExtensions"]);
  if (
    (Object.keys(value).length !== fields.length
      && Object.keys(value).length !== fields.length + 1)
    || fields.some((field) => !Object.hasOwn(value, field))
    || Object.keys(value).some((field) => !allowedFields.has(field))
  ) return null;
  const degreeType = parseStringSlots(value.degreeType, "degreeType");
  const iconImageName = parseStringSlots(value.iconImageName, "iconImageName");
  const baseImageName = parseStringSlots(value.baseImageName, "baseImageName");
  const rank = parseStringSlots(value.rank, "rank");
  const degreeName = parseStringSlots(value.degreeName, "degreeName");
  const description = parseStringSlots(value.description, "description");
  const seq = parseNumberSlots(value.seq);
  const characterId = parseNumberSlots(value.characterId);
  const serverExtensions = Object.hasOwn(value, "serverExtensions") && baseImageName
    ? parseDegreeServerExtensions(value.serverExtensions, baseImageName)
    : undefined;
  if (
    !degreeType
    || !iconImageName
    || !baseImageName
    || !rank
    || !degreeName
    || !description
    || !seq
    || !characterId
    || (Object.hasOwn(value, "serverExtensions") && !serverExtensions)
  ) return null;
  const entry = {
    degreeType,
    iconImageName,
    baseImageName,
    rank,
    degreeName,
    description,
    seq,
    characterId,
    ...(serverExtensions ? { serverExtensions } : {}),
  };
  let hasPopulatedSlot = false;
  for (let slot = 0; slot < DEGREE_SLOT_COUNT; slot += 1) {
    const isPopulated = baseImageName[slot] !== "";
    if (isPopulated) {
      if (
        DEGREE_STRING_FIELDS.some((field) => entry[field][slot] === "")
        || seq[slot] <= 0
      ) return null;
      hasPopulatedSlot = true;
    } else if (
      DEGREE_STRING_FIELDS.some((field) => entry[field][slot] !== "")
      || seq[slot] !== 0
      || characterId[slot] !== 0
    ) {
      return null;
    }
  }
  return hasPopulatedSlot ? entry : null;
}

function readApiSuccessData(raw: unknown): unknown {
  return isRecord(raw) && raw.success === true && "data" in raw ? raw.data : null;
}

export function normalizeBandoriDegreeId(value: string | number): number | null {
  const degreeId = typeof value === "number"
    ? value
    : /^[1-9]\d*$/u.test(value.trim())
      ? Number(value)
      : Number.NaN;
  return Number.isSafeInteger(degreeId) && degreeId > 0 ? degreeId : null;
}

export function buildBandoriDegreeMasterApiUrl(): string {
  return "/api/bandori/master/degrees";
}

export function parseBandoriDegreeMasterApiResponse(raw: unknown): BandoriDegreeMasterMap {
  const data = readApiSuccessData(raw);
  if (!isRecord(data)) {
    throw new Error("Bandori degrees master API response is invalid");
  }
  const master: BandoriDegreeMasterMap = {};
  for (const [degreeId, value] of Object.entries(data)) {
    const entry = parseBandoriDegreeMasterEntry(value);
    if (normalizeBandoriDegreeId(degreeId) === null || !entry) {
      throw new Error(`Bandori degrees master API record is invalid: ${degreeId}`);
    }
    master[degreeId] = entry;
  }
  if (Object.keys(master).length === 0) {
    throw new Error("Bandori degrees master API dataset is empty");
  }
  return master;
}

export function getBandoriDegreeCatalogItemsForRegion(
  catalog: BandoriDegreeCatalog | null,
  region: BandoriDegreeRegion,
): BandoriDegreeCatalogItem[] {
  if (!catalog) return [];
  const slot = BANDORI_DEGREE_REGIONS.indexOf(region);
  const items: BandoriDegreeCatalogItem[] = [];
  for (const [degreeId, master] of Object.entries(catalog.master).sort(
    ([left], [right]) => Number(left) - Number(right),
  )) {
    const id = normalizeBandoriDegreeId(degreeId);
    const baseImageName = master.baseImageName[slot];
    const degreeType = master.degreeType[slot];
    const iconImageName = master.iconImageName[slot];
    const rank = master.rank[slot];
    const hasRegionalRecord = hasBandoriDegreeMasterRegion(master, region);
    if (id === null || !hasRegionalRecord) continue;

    const rankImageName = rank === "none"
      ? "rank_none"
      : degreeType && rank
        ? `${degreeType}_${rank}`
        : "";
    const iconImageResourceName = iconImageName === "none"
      ? "icon_none"
      : iconImageName && rank
        ? `${iconImageName}_${rank}`
        : "";
    const baseResource = baseImageName
      ? catalog.assets.resources[baseImageName]
      : undefined;
    const rankResource = rankImageName && rank !== "none"
      ? catalog.assets.resources[rankImageName]
      : undefined;
    const iconResource = iconImageResourceName && iconImageName !== "none"
      ? catalog.assets.resources[iconImageResourceName]
      : undefined;
    const animation = baseResource?.animations?.[region];
    const extension = master.serverExtensions?.[slot];
    const effectResource = extension?.degreeEffect
      ? catalog.assets.resources[extension.degreeEffect.assetBundleName]
      : undefined;
    const effectAnimation = effectResource?.effects?.[region];
    items.push({
      id,
      region,
      degreeType,
      iconImageName,
      baseImageName,
      rank,
      degreeName: master.degreeName[slot],
      description: master.description[slot],
      seq: master.seq[slot],
      characterId: master.characterId[slot],
      rankImageName,
      iconImageResourceName,
      baseImage: baseResource?.images?.[slot] ?? null,
      rankImage: rankResource?.images?.[slot] ?? null,
      iconImage: iconResource?.images?.[slot] ?? null,
      ...(animation ? { animation } : {}),
      ...(extension?.degreeEffect ? {
        degreeEffect: {
          ...extension.degreeEffect,
          ...(effectAnimation ? { animation: effectAnimation } : {}),
        },
      } : {}),
    });
  }
  return items;
}

export function hasBandoriDegreeMasterRegion(
  entry: BandoriDegreeMasterEntry,
  region: BandoriDegreeRegion,
): boolean {
  const slot = BANDORI_DEGREE_REGIONS.indexOf(region);
  return DEGREE_STRING_FIELDS.some((field) => entry[field][slot] !== "")
    || DEGREE_NUMBER_FIELDS.some((field) => entry[field][slot] !== 0);
}

function parsePositiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`Bandori degree animation manifest has an invalid ${label}`);
  }
  return value as number;
}

function parseAtlasDimensions(value: unknown): BandoriAtlasDimensions {
  if (!isRecord(value)) {
    throw new Error("Bandori degree animation manifest has invalid atlasDimensions");
  }
  assertExactKeys(value, ["width", "height"], "Bandori degree atlasDimensions");
  return {
    width: parsePositiveInteger(value.width, "atlas width"),
    height: parsePositiveInteger(value.height, "atlas height"),
  };
}

function parseFrameRect(
  value: unknown,
  dimensions: BandoriAtlasDimensions,
  label: string,
): BandoriAtlasFrameRect {
  if (!isRecord(value)) {
    throw new Error(`${label} has an invalid rect`);
  }
  assertExactKeys(value, ["x", "y", "width", "height"], `${label} rect`);
  const x = Number.isSafeInteger(value.x) && (value.x as number) >= 0
    ? value.x as number
    : -1;
  const y = Number.isSafeInteger(value.y) && (value.y as number) >= 0
    ? value.y as number
    : -1;
  const width = parsePositiveInteger(value.width, "frame width");
  const height = parsePositiveInteger(value.height, "frame height");
  if (x < 0 || y < 0 || x + width > dimensions.width || y + height > dimensions.height) {
    throw new Error(`${label} rect is outside the atlas`);
  }
  return { x, y, width, height };
}

function validateFrameSequence(frames: readonly BandoriAtlasAnimationFrame[]): void {
  frames.forEach((frame, index) => {
    const match = /^ani_degree_(\d{4})$/u.exec(frame.name);
    if (!match) {
      throw new Error("Bandori degree animation frame name is invalid");
    }
    if (
      Number.parseInt(match[1], 10) !== index
      || (index > 0 && frames[index - 1].name >= frame.name)
    ) {
      throw new Error("Bandori degree animation frames must be sorted and contiguous");
    }
  });
}

function validateEffectFrameSequence(frames: readonly BandoriAtlasAnimationFrame[]): void {
  frames.forEach((frame, index) => {
    const match = /^effect_degree_(\d{4})$/u.exec(frame.name);
    if (!match) {
      throw new Error("Bandori degree effect frame name is invalid");
    }
    if (
      Number.parseInt(match[1], 10) !== index
      || (index > 0 && frames[index - 1].name >= frame.name)
    ) {
      throw new Error("Bandori degree effect frames must be sorted and contiguous");
    }
  });
}

export function parseBandoriDegreeAnimationManifest(
  raw: unknown,
  manifestUrl: string,
  atlasUrl: string,
): BandoriDegreeAnimationResponse {
  if (!isRecord(raw) || !manifestUrl || !atlasUrl) {
    throw new Error("Bandori degree animation manifest is invalid");
  }
  assertExactKeys(
    raw,
    ["schemaVersion", "frameRate", "loop", "atlasDimensions", "frames"],
    "Bandori degree animation manifest",
  );
  if (
    raw.schemaVersion !== BANDORI_DEGREE_ANIMATION_SCHEMA_VERSION
    || raw.frameRate !== 30
    || raw.loop !== true
    || !Array.isArray(raw.frames)
    || raw.frames.length < 1
  ) {
    throw new Error("Bandori degree animation manifest contract is unsupported");
  }
  const atlasDimensions = parseAtlasDimensions(raw.atlasDimensions);
  const frames = raw.frames.map((frame, index): BandoriAtlasAnimationFrame => {
    const label = `Bandori degree animation frame ${index}`;
    if (!isRecord(frame)) throw new Error(`${label} is invalid`);
    assertExactKeys(frame, ["name", "rect"], label);
    if (typeof frame.name !== "string" || !frame.name) {
      throw new Error(`${label} has an invalid name`);
    }
    return {
      name: frame.name,
      rect: parseFrameRect(frame.rect, atlasDimensions, label),
    };
  });
  validateFrameSequence(frames);
  return {
    manifestUrl,
    atlasUrl,
    atlasDimensions,
    frameRate: 30,
    loop: true,
    frames,
  };
}

export function parseBandoriDegreeEffectManifest(
  raw: unknown,
  manifestUrl: string,
  atlasUrl: string,
): BandoriDegreeEffectResponse {
  if (!isRecord(raw) || !manifestUrl || !atlasUrl) {
    throw new Error("Bandori degree effect manifest is invalid");
  }
  assertExactKeys(
    raw,
    ["schemaVersion", "frameRate", "loop", "atlasDimensions", "frames"],
    "Bandori degree effect manifest",
  );
  if (
    raw.schemaVersion !== BANDORI_DEGREE_EFFECT_SCHEMA_VERSION
    || !isDisplayPositiveInteger(raw.frameRate)
    || raw.loop !== true
    || !Array.isArray(raw.frames)
    || raw.frames.length < 1
  ) {
    throw new Error("Bandori degree effect manifest contract is unsupported");
  }
  const atlasDimensions = parseAtlasDimensions(raw.atlasDimensions);
  const frames = raw.frames.map((frame, index): BandoriAtlasAnimationFrame => {
    const label = `Bandori degree effect frame ${index}`;
    if (!isRecord(frame)) throw new Error(`${label} is invalid`);
    assertExactKeys(frame, ["name", "rect"], label);
    if (typeof frame.name !== "string" || !frame.name) {
      throw new Error(`${label} has an invalid name`);
    }
    return {
      name: frame.name,
      rect: parseFrameRect(frame.rect, atlasDimensions, label),
    };
  });
  validateEffectFrameSequence(frames);
  return {
    manifestUrl,
    atlasUrl,
    atlasDimensions,
    frameRate: raw.frameRate,
    loop: true,
    frames,
  };
}
