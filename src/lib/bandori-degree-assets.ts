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
};

export type BandoriDegreeMasterMap = Record<string, BandoriDegreeMasterEntry>;

export type BandoriDegreeCatalog = {
  master: BandoriDegreeMasterMap;
  assets: BandoriDegreesAssetIndex;
};

export type BandoriDegreeAnimationSummary = BandoriAnimationAssetDescriptor;

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
};

export type BandoriDegreeAnimationResponse = BandoriAtlasAnimation & {
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

export function parseBandoriDegreeMasterEntry(
  value: unknown,
): BandoriDegreeMasterEntry | null {
  if (!isRecord(value)) return null;
  const fields = [...DEGREE_STRING_FIELDS, ...DEGREE_NUMBER_FIELDS];
  if (
    Object.keys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))
    || Object.keys(value).some((field) => !fields.includes(
      field as (typeof fields)[number],
    ))
  ) return null;
  const degreeType = parseStringSlots(value.degreeType, "degreeType");
  const iconImageName = parseStringSlots(value.iconImageName, "iconImageName");
  const baseImageName = parseStringSlots(value.baseImageName, "baseImageName");
  const rank = parseStringSlots(value.rank, "rank");
  const degreeName = parseStringSlots(value.degreeName, "degreeName");
  const description = parseStringSlots(value.description, "description");
  const seq = parseNumberSlots(value.seq);
  const characterId = parseNumberSlots(value.characterId);
  if (
    !degreeType
    || !iconImageName
    || !baseImageName
    || !rank
    || !degreeName
    || !description
    || !seq
    || !characterId
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
    const rankResource = rankImageName
      ? catalog.assets.resources[rankImageName]
      : undefined;
    const iconResource = iconImageResourceName
      ? catalog.assets.resources[iconImageResourceName]
      : undefined;
    const animation = baseResource?.animations?.[region];
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
