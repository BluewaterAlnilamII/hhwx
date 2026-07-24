const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const RESOURCE_SET_NAME_PATTERN = /^[A-Za-z0-9_-]+$/u;
const POSITIVE_INTEGER_ID_PATTERN = /^[1-9]\d*$/u;

export const BANDORI_PUBLIC_ASSET_SERVERS = ["jp", "en", "tw", "cn"] as const;
export const BANDORI_CARDS_INDEX_KEY = "bandori/cards/index.json";
export const BANDORI_EVENTS_INDEX_KEY = "bandori/events/index.json";
export const BANDORI_PUBLIC_ASSET_INDEX_SCHEMA_VERSION = 2;

export type BandoriPublicAssetServer = (typeof BANDORI_PUBLIC_ASSET_SERVERS)[number];
export type BandoriAssetRegion = Extract<BandoriPublicAssetServer, "jp" | "cn">;
export type BandoriCardAssetVariant = "normal" | "after_training";
export type BandoriCardImageRole = "thumb" | "full" | "trim";

export type BandoriPngAssetDescriptor = {
  key: string;
  sha256: string;
};

export type BandoriAudioAssetDescriptor = {
  key: string;
  sha256: string;
};

export type BandoriCardImageSet = Record<BandoriCardImageRole, BandoriPngAssetDescriptor>;

export type BandoriCardAssetResource = {
  images: {
    normal?: BandoriCardImageSet;
    after_training?: BandoriCardImageSet;
  };
  gachaVoice?: BandoriAudioAssetDescriptor;
};

export type BandoriCardsAssetIndex = {
  schemaVersion: typeof BANDORI_PUBLIC_ASSET_INDEX_SCHEMA_VERSION;
  updatedAt: string;
  resources: Record<string, BandoriCardAssetResource>;
};

export type BandoriEventTeamIcon = {
  teamId: number;
  iconFileName: string;
  images: BandoriRegionalPngSlots;
};

export type BandoriEventAssetEntry = {
  banners: BandoriRegionalPngSlots;
  teamIcons: BandoriEventTeamIcon[];
};

export type BandoriEventsAssetIndex = {
  schemaVersion: typeof BANDORI_PUBLIC_ASSET_INDEX_SCHEMA_VERSION;
  updatedAt: string;
  events: Record<string, BandoriEventAssetEntry>;
};

export type BandoriRegionalPngSlots = [
  BandoriPngAssetDescriptor | null,
  BandoriPngAssetDescriptor | null,
  BandoriPngAssetDescriptor | null,
  BandoriPngAssetDescriptor | null,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  label: string,
): void {
  const allowedKeys = new Set([...requiredKeys, ...optionalKeys]);
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) {
      throw new Error(`${label} is missing ${key}`);
    }
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${label} has an unsupported field: ${key}`);
    }
  }
}

function parseUpdatedAt(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || !value.trim()
    || !Number.isFinite(Date.parse(value))
  ) {
    throw new Error(`${label} has an invalid updatedAt`);
  }
  return value;
}

function parseSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} has an invalid SHA-256`);
  }
  return value;
}

function createPngDescriptor(
  value: unknown,
  expectedPrefix: string,
  label: string,
): BandoriPngAssetDescriptor {
  const sha256 = parseSha256(value, label);
  return {
    key: `${expectedPrefix}/${sha256}.png`,
    sha256,
  };
}

function createAudioDescriptor(
  value: unknown,
  expectedPrefix: string,
  label: string,
): BandoriAudioAssetDescriptor {
  const sha256 = parseSha256(value, label);
  return {
    key: `${expectedPrefix}/${sha256}.mp3`,
    sha256,
  };
}

function parseCardImageSet(
  value: unknown,
  resourceSetName: string,
  variant: BandoriCardAssetVariant,
): BandoriCardImageSet {
  const label = `Bandori cards index resource ${resourceSetName} ${variant}`;
  if (!isRecord(value)) {
    throw new Error(`${label} images must be an object`);
  }
  assertExactKeys(value, ["thumb", "full", "trim"], [], `${label} images`);
  const parseRole = (role: BandoriCardImageRole) => createPngDescriptor(
    value[role],
    `bandori/cards/${resourceSetName}/${variant}/${role}`,
    `${label} ${role}`,
  );
  return {
    thumb: parseRole("thumb"),
    full: parseRole("full"),
    trim: parseRole("trim"),
  };
}

function parseCardResource(
  value: unknown,
  resourceSetName: string,
): BandoriCardAssetResource {
  const label = `Bandori cards index resource ${resourceSetName}`;
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  assertExactKeys(value, ["images"], ["gachaVoice"], label);
  if (!isRecord(value.images)) {
    throw new Error(`${label} images must be an object`);
  }
  assertExactKeys(value.images, [], ["normal", "after_training"], `${label} images`);

  const resource: BandoriCardAssetResource = {
    images: {},
  };
  if (Object.hasOwn(value.images, "normal")) {
    resource.images.normal = parseCardImageSet(
      value.images.normal,
      resourceSetName,
      "normal",
    );
  }
  if (Object.hasOwn(value.images, "after_training")) {
    resource.images.after_training = parseCardImageSet(
      value.images.after_training,
      resourceSetName,
      "after_training",
    );
  }
  if (!resource.images.normal && !resource.images.after_training) {
    throw new Error(`${label} must have at least one complete image variant`);
  }
  if (Object.hasOwn(value, "gachaVoice")) {
    resource.gachaVoice = createAudioDescriptor(
      value.gachaVoice,
      `bandori/cards/${resourceSetName}/voice/gacha`,
      `${label} gachaVoice`,
    );
  }
  return resource;
}

export function parseBandoriCardsAssetIndex(value: unknown): BandoriCardsAssetIndex {
  if (!isRecord(value)) {
    throw new Error("Bandori cards index must be an object");
  }
  assertExactKeys(
    value,
    ["schemaVersion", "updatedAt", "resources"],
    [],
    "Bandori cards index",
  );
  if (value.schemaVersion !== BANDORI_PUBLIC_ASSET_INDEX_SCHEMA_VERSION) {
    throw new Error("Unsupported Bandori cards index schema");
  }
  if (!isRecord(value.resources)) {
    throw new Error("Bandori cards index resources must be an object");
  }

  const resources: Record<string, BandoriCardAssetResource> = Object.create(null);
  for (const [resourceSetName, resourceValue] of Object.entries(value.resources)) {
    if (!RESOURCE_SET_NAME_PATTERN.test(resourceSetName)) {
      throw new Error(`Bandori cards index has an invalid resourceSetName: ${resourceSetName}`);
    }
    resources[resourceSetName] = parseCardResource(resourceValue, resourceSetName);
  }
  return {
    schemaVersion: BANDORI_PUBLIC_ASSET_INDEX_SCHEMA_VERSION,
    updatedAt: parseUpdatedAt(value.updatedAt, "Bandori cards index"),
    resources,
  };
}

function parseRegionalPngSlots(
  value: unknown,
  label: string,
): BandoriRegionalPngSlots {
  if (!Array.isArray(value) || value.length !== BANDORI_PUBLIC_ASSET_SERVERS.length) {
    throw new Error(`${label} must have exactly four regional slots`);
  }
  return value.map((descriptor, index) => (
    descriptor === null
      ? null
      : createPngDescriptor(
        descriptor,
        "bandori/events/images",
        `${label} ${BANDORI_PUBLIC_ASSET_SERVERS[index]}`,
      )
  )) as BandoriRegionalPngSlots;
}

function parseEventEntry(value: unknown, eventId: string): BandoriEventAssetEntry {
  const label = `Bandori events index event ${eventId}`;
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  assertExactKeys(value, ["banners", "teamIcons"], [], label);
  if (!Array.isArray(value.teamIcons)) {
    throw new Error(`${label} teamIcons must be an array`);
  }
  const seenTeamIds = new Set<number>();
  const teamIcons = value.teamIcons.map((teamIconValue, index): BandoriEventTeamIcon => {
    const teamIconLabel = `${label} teamIcons[${index}]`;
    if (!isRecord(teamIconValue)) {
      throw new Error(`${teamIconLabel} must be an object`);
    }
    assertExactKeys(teamIconValue, ["teamId", "iconFileName", "images"], [], teamIconLabel);
    const rawTeamId = teamIconValue.teamId;
    if (!Number.isSafeInteger(rawTeamId) || (rawTeamId as number) < 1) {
      throw new Error(`${teamIconLabel} teamId must be a positive integer`);
    }
    const teamId = rawTeamId as number;
    if (seenTeamIds.has(teamId)) {
      throw new Error(`${label} has duplicate teamId ${teamId}`);
    }
    seenTeamIds.add(teamId);
    const iconFileName = teamIconValue.iconFileName;
    if (
      typeof iconFileName !== "string"
      || !iconFileName
      || iconFileName.length > 255
      || /[\/\\\0]/u.test(iconFileName)
    ) {
      throw new Error(`${teamIconLabel} has an invalid iconFileName`);
    }
    return {
      teamId,
      iconFileName,
      images: parseRegionalPngSlots(teamIconValue.images, `${teamIconLabel} images`),
    };
  });
  return {
    banners: parseRegionalPngSlots(value.banners, `${label} banners`),
    teamIcons,
  };
}

export function parseBandoriEventsAssetIndex(value: unknown): BandoriEventsAssetIndex {
  if (!isRecord(value)) {
    throw new Error("Bandori events index must be an object");
  }
  assertExactKeys(
    value,
    ["schemaVersion", "updatedAt", "events"],
    [],
    "Bandori events index",
  );
  if (value.schemaVersion !== BANDORI_PUBLIC_ASSET_INDEX_SCHEMA_VERSION) {
    throw new Error("Unsupported Bandori events index schema");
  }
  if (!isRecord(value.events)) {
    throw new Error("Bandori events index events must be an object");
  }

  const events: Record<string, BandoriEventAssetEntry> = Object.create(null);
  for (const [eventId, eventValue] of Object.entries(value.events)) {
    if (!POSITIVE_INTEGER_ID_PATTERN.test(eventId) || !Number.isSafeInteger(Number(eventId))) {
      throw new Error(`Bandori events index has an invalid event ID: ${eventId}`);
    }
    events[eventId] = parseEventEntry(eventValue, eventId);
  }
  return {
    schemaVersion: BANDORI_PUBLIC_ASSET_INDEX_SCHEMA_VERSION,
    updatedAt: parseUpdatedAt(value.updatedAt, "Bandori events index"),
    events,
  };
}

export function lookupBandoriCardImage(
  index: BandoriCardsAssetIndex | null | undefined,
  resourceSetName: string | null | undefined,
  variant: BandoriCardAssetVariant,
  role: BandoriCardImageRole,
): BandoriPngAssetDescriptor | null {
  const normalizedResourceSetName = resourceSetName?.trim();
  if (!index || !normalizedResourceSetName) {
    return null;
  }
  const images = index.resources[normalizedResourceSetName]?.images;
  if (!images) {
    return null;
  }
  const requestedImages = images[variant];
  if (requestedImages) {
    return requestedImages[role];
  }
  const availableImageSets = [images.normal, images.after_training].filter(
    (imageSet): imageSet is BandoriCardImageSet => Boolean(imageSet),
  );
  return availableImageSets.length === 1 ? availableImageSets[0][role] : null;
}

export function lookupBandoriEventBanner(
  index: BandoriEventsAssetIndex | null | undefined,
  eventId: number | string | null | undefined,
  server: BandoriPublicAssetServer,
): BandoriPngAssetDescriptor | null {
  const normalizedEventId = String(eventId ?? "");
  const serverIndex = BANDORI_PUBLIC_ASSET_SERVERS.indexOf(server);
  if (!index || serverIndex < 0 || !POSITIVE_INTEGER_ID_PATTERN.test(normalizedEventId)) {
    return null;
  }
  return index.events[normalizedEventId]?.banners[serverIndex] ?? null;
}

export function lookupBandoriEventTeamIcon(
  index: BandoriEventsAssetIndex | null | undefined,
  eventId: number | string | null | undefined,
  teamId: number,
  server: BandoriPublicAssetServer,
): BandoriPngAssetDescriptor | null {
  const normalizedEventId = String(eventId ?? "");
  const serverIndex = BANDORI_PUBLIC_ASSET_SERVERS.indexOf(server);
  if (!index || serverIndex < 0 || !POSITIVE_INTEGER_ID_PATTERN.test(normalizedEventId)) {
    return null;
  }
  return index.events[normalizedEventId]?.teamIcons
    .find((teamIcon) => teamIcon.teamId === teamId)
    ?.images[serverIndex] ?? null;
}

function normalizeBandoriAssetBaseUrl(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue.replace(/\/+$/u, "") : null;
}

function appendBandoriAssetKey(baseUrl: string, key: string): string {
  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${baseUrl}/${encodedKey}`;
}

export function getBandoriPublicAssetBaseUrl(
  baseUrl: string | null | undefined = process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL,
): string | null {
  return normalizeBandoriAssetBaseUrl(baseUrl);
}

export function buildBandoriPublicAssetIndexUrl(
  kind: "cards" | "events",
  baseUrl?: string | null,
): string | null {
  const normalizedBaseUrl = getBandoriPublicAssetBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    return null;
  }
  return appendBandoriAssetKey(
    normalizedBaseUrl,
    kind === "cards" ? BANDORI_CARDS_INDEX_KEY : BANDORI_EVENTS_INDEX_KEY,
  );
}

export function buildBandoriPublicAssetUrl(
  descriptor: Pick<BandoriPngAssetDescriptor | BandoriAudioAssetDescriptor, "key"> | null | undefined,
  baseUrl?: string | null,
): string | null {
  const normalizedBaseUrl = getBandoriPublicAssetBaseUrl(baseUrl);
  if (!descriptor || !normalizedBaseUrl) {
    return null;
  }
  return appendBandoriAssetKey(normalizedBaseUrl, descriptor.key);
}
