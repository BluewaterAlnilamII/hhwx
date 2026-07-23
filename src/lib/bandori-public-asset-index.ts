const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const RESOURCE_SET_NAME_PATTERN = /^[A-Za-z0-9_-]+$/u;
const POSITIVE_INTEGER_ID_PATTERN = /^[1-9]\d*$/u;

export const BANDORI_PUBLIC_ASSET_SERVERS = ["jp", "en", "tw", "cn"] as const;
export const BANDORI_CARDS_INDEX_KEY = "bandori/cards/index.json";
export const BANDORI_EVENTS_INDEX_KEY = "bandori/events/index.json";
export const BANDORI_PUBLIC_ASSET_INDEX_SCHEMA_VERSION = 1;
export const BANDORI_CARD_GACHA_VOICE_PROVENANCE = "gacha-spin-v1";

export type BandoriPublicAssetServer = (typeof BANDORI_PUBLIC_ASSET_SERVERS)[number];
export type BandoriAssetRegion = Extract<BandoriPublicAssetServer, "jp" | "cn">;
export type BandoriCardAssetVariant = "normal" | "after_training";
export type BandoriCardImageRole = "thumb" | "full" | "trim";

export type BandoriPngAssetDescriptor = {
  key: string;
  sha256: string;
  byteSize: number;
  contentType: "image/png";
  width: number;
  height: number;
};

export type BandoriAudioAssetDescriptor = {
  key: string;
  sha256: string;
  byteSize: number;
  contentType: "audio/mpeg";
  durationMs: number;
};

export type BandoriCardImageSet = Record<BandoriCardImageRole, BandoriPngAssetDescriptor>;

export type BandoriCardArtPlan = {
  normalSourceVariant: BandoriCardAssetVariant;
  hasAfterTraining: boolean;
};

export type BandoriCardAssetResource = {
  artPlan: BandoriCardArtPlan;
  images: {
    normal: BandoriCardImageSet;
    after_training?: BandoriCardImageSet;
  };
  gachaVoice?: BandoriAudioAssetDescriptor;
};

export type BandoriCardsAssetIndex = {
  schemaVersion: typeof BANDORI_PUBLIC_ASSET_INDEX_SCHEMA_VERSION;
  updatedAt: string;
  gachaVoiceProvenance: typeof BANDORI_CARD_GACHA_VOICE_PROVENANCE;
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
  servers: typeof BANDORI_PUBLIC_ASSET_SERVERS;
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

function parsePositiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value as number;
}

function parseSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} has an invalid SHA-256`);
  }
  return value;
}

function parsePngDescriptor(
  value: unknown,
  expectedPrefix: string,
  label: string,
): BandoriPngAssetDescriptor {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  assertExactKeys(
    value,
    ["key", "sha256", "byteSize", "contentType", "width", "height"],
    [],
    label,
  );
  const sha256 = parseSha256(value.sha256, label);
  const expectedKey = `${expectedPrefix}/${sha256}.png`;
  if (value.key !== expectedKey) {
    throw new Error(`${label} has an invalid content-addressed key`);
  }
  if (value.contentType !== "image/png") {
    throw new Error(`${label} has an invalid content type`);
  }
  return {
    key: expectedKey,
    sha256,
    byteSize: parsePositiveInteger(value.byteSize, `${label} byteSize`),
    contentType: "image/png",
    width: parsePositiveInteger(value.width, `${label} width`),
    height: parsePositiveInteger(value.height, `${label} height`),
  };
}

function parseAudioDescriptor(
  value: unknown,
  expectedPrefix: string,
  label: string,
): BandoriAudioAssetDescriptor {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  assertExactKeys(
    value,
    ["key", "sha256", "byteSize", "contentType", "durationMs"],
    [],
    label,
  );
  const sha256 = parseSha256(value.sha256, label);
  const expectedKey = `${expectedPrefix}/${sha256}.mp3`;
  if (value.key !== expectedKey) {
    throw new Error(`${label} has an invalid content-addressed key`);
  }
  if (value.contentType !== "audio/mpeg") {
    throw new Error(`${label} has an invalid content type`);
  }
  return {
    key: expectedKey,
    sha256,
    byteSize: parsePositiveInteger(value.byteSize, `${label} byteSize`),
    contentType: "audio/mpeg",
    durationMs: parsePositiveInteger(value.durationMs, `${label} durationMs`),
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
  const parseRole = (role: BandoriCardImageRole) => parsePngDescriptor(
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
  assertExactKeys(value, ["artPlan", "images"], ["gachaVoice"], label);
  if (!isRecord(value.artPlan)) {
    throw new Error(`${label} artPlan must be an object`);
  }
  assertExactKeys(
    value.artPlan,
    ["normalSourceVariant", "hasAfterTraining"],
    [],
    `${label} artPlan`,
  );
  const normalSourceVariant = value.artPlan.normalSourceVariant;
  if (normalSourceVariant !== "normal" && normalSourceVariant !== "after_training") {
    throw new Error(`${label} artPlan normalSourceVariant is invalid`);
  }
  if (typeof value.artPlan.hasAfterTraining !== "boolean") {
    throw new Error(`${label} artPlan hasAfterTraining must be boolean`);
  }
  if (!isRecord(value.images)) {
    throw new Error(`${label} images must be an object`);
  }
  assertExactKeys(value.images, ["normal"], ["after_training"], `${label} images`);

  const resource: BandoriCardAssetResource = {
    artPlan: {
      normalSourceVariant,
      hasAfterTraining: value.artPlan.hasAfterTraining,
    },
    images: {
      normal: parseCardImageSet(value.images.normal, resourceSetName, "normal"),
    },
  };
  if (Object.hasOwn(value.images, "after_training")) {
    resource.images.after_training = parseCardImageSet(
      value.images.after_training,
      resourceSetName,
      "after_training",
    );
  }
  if (
    resource.artPlan.hasAfterTraining
    !== Object.hasOwn(resource.images, "after_training")
  ) {
    throw new Error(`${label} artPlan does not match image variants`);
  }
  if (Object.hasOwn(value, "gachaVoice")) {
    resource.gachaVoice = parseAudioDescriptor(
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
    ["schemaVersion", "updatedAt", "gachaVoiceProvenance", "resources"],
    [],
    "Bandori cards index",
  );
  if (value.schemaVersion !== BANDORI_PUBLIC_ASSET_INDEX_SCHEMA_VERSION) {
    throw new Error("Unsupported Bandori cards index schema");
  }
  if (value.gachaVoiceProvenance !== BANDORI_CARD_GACHA_VOICE_PROVENANCE) {
    throw new Error("Unsupported Bandori cards gacha voice provenance");
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
    gachaVoiceProvenance: BANDORI_CARD_GACHA_VOICE_PROVENANCE,
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
      : parsePngDescriptor(
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
    const teamId = parsePositiveInteger(teamIconValue.teamId, `${teamIconLabel} teamId`);
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
    ["schemaVersion", "updatedAt", "servers", "events"],
    [],
    "Bandori events index",
  );
  if (value.schemaVersion !== BANDORI_PUBLIC_ASSET_INDEX_SCHEMA_VERSION) {
    throw new Error("Unsupported Bandori events index schema");
  }
  if (
    !Array.isArray(value.servers)
    || value.servers.length !== BANDORI_PUBLIC_ASSET_SERVERS.length
    || value.servers.some((server, index) => server !== BANDORI_PUBLIC_ASSET_SERVERS[index])
  ) {
    throw new Error("Bandori events index has an invalid regional slot order");
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
    servers: BANDORI_PUBLIC_ASSET_SERVERS,
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
  return index.resources[normalizedResourceSetName]?.images[variant]?.[role] ?? null;
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
