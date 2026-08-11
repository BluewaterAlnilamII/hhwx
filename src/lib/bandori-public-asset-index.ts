const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const RESOURCE_SET_NAME_PATTERN = /^[A-Za-z0-9_-]+$/u;
const DEGREE_RESOURCE_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/u;
const POSITIVE_INTEGER_ID_PATTERN = /^[1-9]\d*$/u;

export const BANDORI_PUBLIC_ASSET_SERVERS = ["jp", "en", "tw", "cn"] as const;
export const BANDORI_CARDS_INDEX_KEY = "bandori/cards/index.json";
export const BANDORI_DEGREES_INDEX_KEY = "bandori/degrees/index.json";
export const BANDORI_EVENTS_INDEX_KEY = "bandori/events/index.json";
export const BANDORI_MUSIC_INDEX_KEY = "bandori/music/index.json";
export const BANDORI_STAMPS_INDEX_KEY = "bandori/stamps/index.json";
export const BANDORI_PUBLIC_ASSET_INDEX_SCHEMA_VERSION = 2;
export const BANDORI_DEGREES_ASSET_INDEX_SCHEMA_VERSION = 1;

export type BandoriPublicAssetServer = (typeof BANDORI_PUBLIC_ASSET_SERVERS)[number];
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

export type BandoriJsonAssetDescriptor = {
  key: string;
  sha256: string;
};

export const BANDORI_MUSIC_DIFFICULTIES = [
  "easy",
  "normal",
  "hard",
  "expert",
  "special",
] as const;

export type BandoriMusicDifficultyIndex = "0" | "1" | "2" | "3" | "4";

export type BandoriMusicBpmSegment = {
  bpm: number;
  start: number;
  end: number;
};

export type BandoriMusicAssetEntry = {
  files: {
    jacket: BandoriPngAssetDescriptor;
    thumb: BandoriPngAssetDescriptor;
    audio?: BandoriAudioAssetDescriptor;
    charts: Partial<Record<BandoriMusicDifficultyIndex, BandoriJsonAssetDescriptor>>;
  };
  notes: Partial<Record<BandoriMusicDifficultyIndex, number>>;
  bpm: Partial<Record<BandoriMusicDifficultyIndex, BandoriMusicBpmSegment[]>>;
  length: number;
};

export type BandoriMusicAssetIndex = {
  schemaVersion: typeof BANDORI_PUBLIC_ASSET_INDEX_SCHEMA_VERSION;
  updatedAt: string;
  songs: Record<string, BandoriMusicAssetEntry>;
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

export type BandoriAnimationAssetDescriptor = {
  manifest: BandoriJsonAssetDescriptor;
  atlas: BandoriPngAssetDescriptor;
};

export type BandoriStampAnimationAsset = BandoriAnimationAssetDescriptor;

export type BandoriStampChangedAsset = {
  image?: BandoriPngAssetDescriptor;
  audio?: BandoriAudioAssetDescriptor;
};

export type BandoriStampChangedAssetSlots = [
  BandoriStampChangedAsset[],
  BandoriStampChangedAsset[],
  BandoriStampChangedAsset[],
  BandoriStampChangedAsset[],
];

export type BandoriStampAssetEntry = {
  images: BandoriRegionalPngSlots;
  voices: BandoriRegionalAudioSlots;
  changedStamps?: BandoriStampChangedAssetSlots;
  animations?: Partial<Record<BandoriPublicAssetServer, BandoriStampAnimationAsset>>;
};

export type BandoriStampsAssetIndex = {
  schemaVersion: typeof BANDORI_PUBLIC_ASSET_INDEX_SCHEMA_VERSION;
  updatedAt: string;
  stamps: Record<string, BandoriStampAssetEntry>;
  changedStampGroups: Record<
    BandoriPublicAssetServer,
    Record<string, BandoriJsonAssetDescriptor>
  >;
};

export type BandoriDegreeAssetResource = {
  images?: BandoriRegionalPngSlots;
  animations?: Partial<
    Record<BandoriPublicAssetServer, BandoriAnimationAssetDescriptor>
  >;
};

export type BandoriDegreesAssetIndex = {
  schemaVersion: typeof BANDORI_DEGREES_ASSET_INDEX_SCHEMA_VERSION;
  updatedAt: string;
  resources: Record<string, BandoriDegreeAssetResource>;
};

export type BandoriRegionalPngSlots = [
  BandoriPngAssetDescriptor | null,
  BandoriPngAssetDescriptor | null,
  BandoriPngAssetDescriptor | null,
  BandoriPngAssetDescriptor | null,
];

export type BandoriRegionalAudioSlots = [
  BandoriAudioAssetDescriptor | null,
  BandoriAudioAssetDescriptor | null,
  BandoriAudioAssetDescriptor | null,
  BandoriAudioAssetDescriptor | null,
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

function createJsonDescriptor(
  value: unknown,
  expectedPrefix: string,
  label: string,
): BandoriJsonAssetDescriptor {
  const sha256 = parseSha256(value, label);
  return {
    key: `${expectedPrefix}/${sha256}.json`,
    sha256,
  };
}

function parseMusicDifficultyIndex(value: string, label: string): BandoriMusicDifficultyIndex {
  if (!/^[0-4]$/u.test(value)) {
    throw new Error(`${label} has an invalid difficulty index: ${value}`);
  }
  return value as BandoriMusicDifficultyIndex;
}

function parseMusicEntry(value: unknown, musicId: string): BandoriMusicAssetEntry {
  const label = `Bandori music index song ${musicId}`;
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  assertExactKeys(value, ["files", "notes", "bpm", "length"], [], label);
  if (!isRecord(value.files)) {
    throw new Error(`${label} files must be an object`);
  }
  assertExactKeys(value.files, ["jacket", "thumb", "charts"], ["audio"], `${label} files`);
  if (!isRecord(value.files.charts) || Object.keys(value.files.charts).length === 0) {
    throw new Error(`${label} charts must be a non-empty object`);
  }
  if (!isRecord(value.notes) || !isRecord(value.bpm)) {
    throw new Error(`${label} notes and bpm must be objects`);
  }

  const charts: BandoriMusicAssetEntry["files"]["charts"] = Object.create(null);
  const notes: BandoriMusicAssetEntry["notes"] = Object.create(null);
  const bpm: BandoriMusicAssetEntry["bpm"] = Object.create(null);
  const chartDifficultyIndexes = Object.keys(value.files.charts);
  if (
    Object.keys(value.notes).length !== chartDifficultyIndexes.length
    || Object.keys(value.bpm).length !== chartDifficultyIndexes.length
  ) {
    throw new Error(`${label} chart metadata coverage does not match files`);
  }
  for (const rawDifficultyIndex of chartDifficultyIndexes) {
    const difficultyIndex = parseMusicDifficultyIndex(rawDifficultyIndex, label);
    if (!Object.hasOwn(value.notes, difficultyIndex) || !Object.hasOwn(value.bpm, difficultyIndex)) {
      throw new Error(`${label} is missing chart metadata for difficulty ${difficultyIndex}`);
    }
    charts[difficultyIndex] = createJsonDescriptor(
      value.files.charts[difficultyIndex],
      "bandori/music/charts",
      `${label} chart ${difficultyIndex}`,
    );
    const rawNoteCount = value.notes[difficultyIndex];
    if (!Number.isSafeInteger(rawNoteCount) || (rawNoteCount as number) < 0) {
      throw new Error(`${label} has an invalid note count for difficulty ${difficultyIndex}`);
    }
    notes[difficultyIndex] = rawNoteCount as number;
    const rawSegments = value.bpm[difficultyIndex];
    if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
      throw new Error(`${label} has invalid BPM data for difficulty ${difficultyIndex}`);
    }
    bpm[difficultyIndex] = rawSegments.map((rawSegment, segmentIndex) => {
      const segmentLabel = `${label} BPM ${difficultyIndex}[${segmentIndex}]`;
      if (!isRecord(rawSegment)) {
        throw new Error(`${segmentLabel} must be an object`);
      }
      assertExactKeys(rawSegment, ["bpm", "start", "end"], [], segmentLabel);
      const rawBpm = rawSegment.bpm;
      const rawStart = rawSegment.start;
      const rawEnd = rawSegment.end;
      if (
        typeof rawBpm !== "number"
        || !Number.isFinite(rawBpm)
        || rawBpm <= 0
        || typeof rawStart !== "number"
        || !Number.isFinite(rawStart)
        || rawStart < 0
        || typeof rawEnd !== "number"
        || !Number.isFinite(rawEnd)
        || rawEnd < rawStart
      ) {
        throw new Error(`${segmentLabel} has invalid values`);
      }
      return { bpm: rawBpm, start: rawStart, end: rawEnd };
    });
  }
  const rawLength = value.length;
  if (typeof rawLength !== "number" || !Number.isFinite(rawLength) || rawLength <= 0) {
    throw new Error(`${label} has an invalid length`);
  }

  const files: BandoriMusicAssetEntry["files"] = {
    jacket: createPngDescriptor(
      value.files.jacket,
      "bandori/music/jackets",
      `${label} jacket`,
    ),
    thumb: createPngDescriptor(
      value.files.thumb,
      "bandori/music/thumbs",
      `${label} thumb`,
    ),
    charts,
  };
  if (Object.hasOwn(value.files, "audio")) {
    files.audio = createAudioDescriptor(
      value.files.audio,
      "bandori/music/audio",
      `${label} audio`,
    );
  }
  return { files, notes, bpm, length: rawLength };
}

export function parseBandoriMusicAssetIndex(value: unknown): BandoriMusicAssetIndex {
  if (!isRecord(value)) {
    throw new Error("Bandori music index must be an object");
  }
  assertExactKeys(
    value,
    ["schemaVersion", "updatedAt", "songs"],
    [],
    "Bandori music index",
  );
  if (value.schemaVersion !== BANDORI_PUBLIC_ASSET_INDEX_SCHEMA_VERSION) {
    throw new Error("Unsupported Bandori music index schema");
  }
  if (!isRecord(value.songs)) {
    throw new Error("Bandori music index songs must be an object");
  }
  const songs: Record<string, BandoriMusicAssetEntry> = Object.create(null);
  for (const [musicId, song] of Object.entries(value.songs)) {
    if (!POSITIVE_INTEGER_ID_PATTERN.test(musicId) || !Number.isSafeInteger(Number(musicId))) {
      throw new Error(`Bandori music index has an invalid music ID: ${musicId}`);
    }
    songs[musicId] = parseMusicEntry(song, musicId);
  }
  return {
    schemaVersion: BANDORI_PUBLIC_ASSET_INDEX_SCHEMA_VERSION,
    updatedAt: parseUpdatedAt(value.updatedAt, "Bandori music index"),
    songs,
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

function parseStampHashSlots(
  value: unknown,
  stampId: string,
): BandoriRegionalPngSlots {
  const label = `Bandori stamps index stamp ${stampId} images`;
  if (!Array.isArray(value) || value.length !== BANDORI_PUBLIC_ASSET_SERVERS.length) {
    throw new Error(`${label} must have exactly four regional slots`);
  }
  return value.map((sha256, index) => {
    if (sha256 === "") {
      return null;
    }
    const server = BANDORI_PUBLIC_ASSET_SERVERS[index];
    const normalizedSha256 = parseSha256(sha256, `${label} ${server}`);
    return {
      key: `bandori/stamps/images/${normalizedSha256}.png`,
      sha256: normalizedSha256,
    };
  }) as BandoriRegionalPngSlots;
}

function parseStampVoiceSlots(
  value: unknown,
  stampId: string,
): BandoriRegionalAudioSlots {
  const label = `Bandori stamps index stamp ${stampId} voices`;
  if (
    !Array.isArray(value)
    || value.length !== BANDORI_PUBLIC_ASSET_SERVERS.length
  ) {
    throw new Error(`${label} must have exactly four regional slots`);
  }
  return value.map((sha256, index) => {
    const server = BANDORI_PUBLIC_ASSET_SERVERS[index];
    if (sha256 === "") {
      return null;
    }
    const normalizedSha256 = parseSha256(sha256, `${label} ${server}`);
    return {
      key: `bandori/stamps/voices/${normalizedSha256}.mp3`,
      sha256: normalizedSha256,
    };
  }) as BandoriRegionalAudioSlots;
}

function parseStampChangedSlots(
  value: unknown,
  stampId: string,
): BandoriStampChangedAssetSlots {
  const label = `Bandori stamps index stamp ${stampId} changedStamps`;
  if (
    !Array.isArray(value)
    || value.length !== BANDORI_PUBLIC_ASSET_SERVERS.length
  ) {
    throw new Error(`${label} must have exactly four regional slots`);
  }
  const slots = value.map((rawVariants, slotIndex) => {
    const server = BANDORI_PUBLIC_ASSET_SERVERS[slotIndex];
    if (!Array.isArray(rawVariants)) {
      throw new Error(`${label} ${server} must be an array`);
    }
    return rawVariants.map((rawVariant, variantIndex): BandoriStampChangedAsset => {
      const variantLabel = `${label} ${server}[${variantIndex}]`;
      if (!isRecord(rawVariant)) {
        throw new Error(`${variantLabel} must be an object`);
      }
      assertExactKeys(rawVariant, [], ["image", "audio"], variantLabel);
      const variant: BandoriStampChangedAsset = {};
      if (Object.hasOwn(rawVariant, "image")) {
        variant.image = createPngDescriptor(
          rawVariant.image,
          "bandori/stamps/images",
          `${variantLabel} image`,
        );
      }
      if (Object.hasOwn(rawVariant, "audio")) {
        variant.audio = createAudioDescriptor(
          rawVariant.audio,
          "bandori/stamps/voices",
          `${variantLabel} audio`,
        );
      }
      return variant;
    });
  }) as BandoriStampChangedAssetSlots;
  if (!slots.some((slot) => slot.length > 0)) {
    throw new Error(`${label} must be omitted when empty`);
  }
  return slots;
}

function parseStampAnimation(
  value: unknown,
  stampId: string,
  server: BandoriPublicAssetServer,
): BandoriStampAnimationAsset {
  const label = `Bandori stamps index stamp ${stampId} animation ${server}`;
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  assertExactKeys(value, ["manifest", "atlas"], ["frameRate", "frameCount"], label);
  const manifestSha256 = parseSha256(value.manifest, `${label} manifest`);
  const atlasSha256 = parseSha256(value.atlas, `${label} atlas`);
  const animation: BandoriStampAnimationAsset = {
    manifest: {
      key: `bandori/stamps/animation/manifests/${manifestSha256}.json`,
      sha256: manifestSha256,
    },
    atlas: {
      key: `bandori/stamps/animation/atlases/${atlasSha256}.png`,
      sha256: atlasSha256,
    },
  };
  if (Object.hasOwn(value, "frameRate")) {
    if (
      typeof value.frameRate !== "number"
      || !Number.isFinite(value.frameRate)
      || value.frameRate <= 0
    ) {
      throw new Error(`${label} has an invalid frameRate`);
    }
  }
  if (Object.hasOwn(value, "frameCount")) {
    if (!Number.isSafeInteger(value.frameCount) || (value.frameCount as number) < 1) {
      throw new Error(`${label} has an invalid frameCount`);
    }
  }
  return animation;
}

function parseStampAssetEntry(
  value: unknown,
  stampId: string,
): BandoriStampAssetEntry {
  const label = `Bandori stamps index stamp ${stampId}`;
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  assertExactKeys(
    value,
    ["images"],
    ["voices", "changedStamps", "animations"],
    label,
  );
  const hasVoices = Object.hasOwn(value, "voices");
  const entry: BandoriStampAssetEntry = {
    images: parseStampHashSlots(value.images, stampId),
    voices: hasVoices
      ? parseStampVoiceSlots(value.voices, stampId)
      : [null, null, null, null],
  };
  if (Object.hasOwn(value, "changedStamps")) {
    entry.changedStamps = parseStampChangedSlots(value.changedStamps, stampId);
  }
  if (Object.hasOwn(value, "animations")) {
    if (!isRecord(value.animations)) {
      throw new Error(`${label} animations must be an object`);
    }
    const animations: Partial<
      Record<BandoriPublicAssetServer, BandoriStampAnimationAsset>
    > = {};
    for (const [server, animation] of Object.entries(value.animations)) {
      if (!BANDORI_PUBLIC_ASSET_SERVERS.includes(server as BandoriPublicAssetServer)) {
        throw new Error(`${label} has an unsupported animation server: ${server}`);
      }
      const normalizedServer = server as BandoriPublicAssetServer;
      animations[normalizedServer] = parseStampAnimation(
        animation,
        stampId,
        normalizedServer,
      );
    }
    if (Object.keys(animations).length > 0) {
      entry.animations = animations;
    }
  }
  return entry;
}

function parseChangedStampGroups(
  value: unknown,
): BandoriStampsAssetIndex["changedStampGroups"] {
  if (!isRecord(value)) {
    throw new Error("Bandori stamps index changedStampGroups must be an object");
  }
  assertExactKeys(
    value,
    BANDORI_PUBLIC_ASSET_SERVERS,
    [],
    "Bandori stamps index changedStampGroups",
  );
  return Object.fromEntries(
    BANDORI_PUBLIC_ASSET_SERVERS.map((server) => {
      const rawGroups = value[server];
      if (!isRecord(rawGroups)) {
        throw new Error(
          `Bandori stamps index changedStampGroups ${server} must be an object`,
        );
      }
      const groups: Record<string, BandoriJsonAssetDescriptor> = Object.create(null);
      for (const [changedStampId, rawSha256] of Object.entries(rawGroups)) {
        if (
          !POSITIVE_INTEGER_ID_PATTERN.test(changedStampId)
          || !Number.isSafeInteger(Number(changedStampId))
        ) {
          throw new Error(
            `Bandori stamps index has an invalid changed stamp ID: ${changedStampId}`,
          );
        }
        const sha256 = parseSha256(
          rawSha256,
          `Bandori stamps index changedStampGroups ${server} ${changedStampId}`,
        );
        groups[changedStampId] = {
          key: `bandori/stamps/changed/manifests/${sha256}.json`,
          sha256,
        };
      }
      return [server, groups];
    }),
  ) as BandoriStampsAssetIndex["changedStampGroups"];
}

export function parseBandoriStampsAssetIndex(value: unknown): BandoriStampsAssetIndex {
  if (!isRecord(value)) {
    throw new Error("Bandori stamps index must be an object");
  }
  assertExactKeys(
    value,
    ["schemaVersion", "updatedAt", "stamps", "changedStampGroups"],
    [],
    "Bandori stamps index",
  );
  if (value.schemaVersion !== BANDORI_PUBLIC_ASSET_INDEX_SCHEMA_VERSION) {
    throw new Error("Unsupported Bandori stamps index schema");
  }
  if (!isRecord(value.stamps)) {
    throw new Error("Bandori stamps index stamps must be an object");
  }
  const stamps: Record<string, BandoriStampAssetEntry> = Object.create(null);
  for (const [stampId, entry] of Object.entries(value.stamps)) {
    if (!POSITIVE_INTEGER_ID_PATTERN.test(stampId) || !Number.isSafeInteger(Number(stampId))) {
      throw new Error(`Bandori stamps index has an invalid stamp ID: ${stampId}`);
    }
    stamps[stampId] = parseStampAssetEntry(entry, stampId);
  }
  return {
    schemaVersion: BANDORI_PUBLIC_ASSET_INDEX_SCHEMA_VERSION,
    updatedAt: parseUpdatedAt(value.updatedAt, "Bandori stamps index"),
    stamps,
    changedStampGroups: parseChangedStampGroups(value.changedStampGroups),
  };
}

function parseDegreeImageSlots(
  value: unknown,
  resourceName: string,
): BandoriRegionalPngSlots {
  const label = `Bandori degrees index resource ${resourceName} images`;
  if (!Array.isArray(value) || value.length !== BANDORI_PUBLIC_ASSET_SERVERS.length) {
    throw new Error(`${label} must have exactly four regional slots`);
  }
  return value.map((sha256, index) => {
    if (sha256 === "") return null;
    const server = BANDORI_PUBLIC_ASSET_SERVERS[index];
    const normalizedSha256 = parseSha256(sha256, `${label} ${server}`);
    return {
      key: `bandori/degrees/images/${normalizedSha256}.png`,
      sha256: normalizedSha256,
    };
  }) as BandoriRegionalPngSlots;
}

function parseDegreeAnimation(
  value: unknown,
  resourceName: string,
  server: BandoriPublicAssetServer,
): BandoriAnimationAssetDescriptor {
  const label = `Bandori degrees index resource ${resourceName} animation ${server}`;
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  assertExactKeys(value, ["manifest", "atlas"], [], label);
  const manifestSha256 = parseSha256(value.manifest, `${label} manifest`);
  const atlasSha256 = parseSha256(value.atlas, `${label} atlas`);
  return {
    manifest: {
      key: `bandori/degrees/animation/manifests/${manifestSha256}.json`,
      sha256: manifestSha256,
    },
    atlas: {
      key: `bandori/degrees/animation/atlases/${atlasSha256}.png`,
      sha256: atlasSha256,
    },
  };
}

function parseDegreeResource(
  value: unknown,
  resourceName: string,
): BandoriDegreeAssetResource {
  const label = `Bandori degrees index resource ${resourceName}`;
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  assertExactKeys(value, [], ["images", "animations"], label);
  const resource: BandoriDegreeAssetResource = {};
  if (Object.hasOwn(value, "images")) {
    const images = parseDegreeImageSlots(value.images, resourceName);
    if (!images.some(Boolean)) {
      throw new Error(`${label} images must be omitted when empty`);
    }
    resource.images = images;
  }
  if (Object.hasOwn(value, "animations")) {
    if (!isRecord(value.animations)) {
      throw new Error(`${label} animations must be an object`);
    }
    if (Object.keys(value.animations).length === 0) {
      throw new Error(`${label} animations must be omitted when empty`);
    }
    const animations: Partial<
      Record<BandoriPublicAssetServer, BandoriAnimationAssetDescriptor>
    > = {};
    for (const [server, animation] of Object.entries(value.animations)) {
      if (!BANDORI_PUBLIC_ASSET_SERVERS.includes(server as BandoriPublicAssetServer)) {
        throw new Error(`${label} has an unsupported animation server: ${server}`);
      }
      const normalizedServer = server as BandoriPublicAssetServer;
      animations[normalizedServer] = parseDegreeAnimation(
        animation,
        resourceName,
        normalizedServer,
      );
    }
    resource.animations = animations;
  }
  if (!resource.images && !resource.animations) {
    throw new Error(`${label} has no regional resource`);
  }
  const isAnimationResource = resourceName.startsWith("ani_degree");
  if (isAnimationResource && resource.images) {
    throw new Error(`${label} must not contain images`);
  }
  if (!isAnimationResource && resource.animations) {
    throw new Error(`${label} must not contain animations`);
  }
  for (let slot = 0; slot < BANDORI_PUBLIC_ASSET_SERVERS.length; slot += 1) {
    const server = BANDORI_PUBLIC_ASSET_SERVERS[slot];
    if (resource.images?.[slot] && resource.animations?.[server]) {
      throw new Error(`${label} has both an image and animation for ${server}`);
    }
  }
  return resource;
}

export function parseBandoriDegreesAssetIndex(value: unknown): BandoriDegreesAssetIndex {
  if (!isRecord(value)) {
    throw new Error("Bandori degrees index must be an object");
  }
  assertExactKeys(
    value,
    ["schemaVersion", "updatedAt", "resources"],
    [],
    "Bandori degrees index",
  );
  if (value.schemaVersion !== BANDORI_DEGREES_ASSET_INDEX_SCHEMA_VERSION) {
    throw new Error("Unsupported Bandori degrees index schema");
  }
  if (!isRecord(value.resources)) {
    throw new Error("Bandori degrees index resources must be an object");
  }
  const resources: Record<string, BandoriDegreeAssetResource> = Object.create(null);
  for (const [resourceName, resource] of Object.entries(value.resources)) {
    if (!DEGREE_RESOURCE_NAME_PATTERN.test(resourceName)) {
      throw new Error(`Bandori degrees index has an invalid resource name: ${resourceName}`);
    }
    resources[resourceName] = parseDegreeResource(resource, resourceName);
  }
  return {
    schemaVersion: BANDORI_DEGREES_ASSET_INDEX_SCHEMA_VERSION,
    updatedAt: parseUpdatedAt(value.updatedAt, "Bandori degrees index"),
    resources,
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

export function listBandoriCardAssetVariants(
  index: BandoriCardsAssetIndex | null | undefined,
  resourceSetName: string | null | undefined,
): BandoriCardAssetVariant[] {
  const normalizedResourceSetName = resourceSetName?.trim();
  if (!index || !normalizedResourceSetName) {
    return [];
  }
  const images = index.resources[normalizedResourceSetName]?.images;
  if (!images) {
    return [];
  }
  const variants: BandoriCardAssetVariant[] = [];
  if (images.normal) variants.push("normal");
  if (images.after_training) variants.push("after_training");
  return variants;
}

/**
 * Returns the variant that actually supplies a requested image. Single-art
 * cards intentionally fall back to their only stored variant, but consumers
 * still need the resolved variant to choose the matching trained-star style.
 */
export function resolveBandoriCardAssetVariant(
  index: BandoriCardsAssetIndex | null | undefined,
  resourceSetName: string | null | undefined,
  requestedVariant: BandoriCardAssetVariant,
): BandoriCardAssetVariant | null {
  const variants = listBandoriCardAssetVariants(index, resourceSetName);
  if (variants.includes(requestedVariant)) {
    return requestedVariant;
  }
  return variants.length === 1 ? variants[0] : null;
}

export function lookupBandoriCardGachaVoice(
  index: BandoriCardsAssetIndex | null | undefined,
  resourceSetName: string | null | undefined,
): BandoriAudioAssetDescriptor | null {
  const normalizedResourceSetName = resourceSetName?.trim();
  return index && normalizedResourceSetName
    ? index.resources[normalizedResourceSetName]?.gachaVoice ?? null
    : null;
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

export function lookupBandoriMusicChart(
  index: BandoriMusicAssetIndex | null | undefined,
  musicId: number | string | null | undefined,
  difficulty: (typeof BANDORI_MUSIC_DIFFICULTIES)[number],
): BandoriJsonAssetDescriptor | null {
  const normalizedMusicId = String(musicId ?? "");
  const difficultyIndex = BANDORI_MUSIC_DIFFICULTIES.indexOf(difficulty);
  if (
    !index
    || difficultyIndex < 0
    || !POSITIVE_INTEGER_ID_PATTERN.test(normalizedMusicId)
  ) {
    return null;
  }
  return index.songs[normalizedMusicId]?.files.charts[
    String(difficultyIndex) as BandoriMusicDifficultyIndex
  ] ?? null;
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
  kind: "cards" | "degrees" | "events" | "music" | "stamps",
  baseUrl?: string | null,
): string | null {
  const normalizedBaseUrl = getBandoriPublicAssetBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    return null;
  }
  const indexKeys = {
    cards: BANDORI_CARDS_INDEX_KEY,
    degrees: BANDORI_DEGREES_INDEX_KEY,
    events: BANDORI_EVENTS_INDEX_KEY,
    music: BANDORI_MUSIC_INDEX_KEY,
    stamps: BANDORI_STAMPS_INDEX_KEY,
  } as const;
  return appendBandoriAssetKey(normalizedBaseUrl, indexKeys[kind]);
}

export function buildBandoriPublicAssetUrl(
  descriptor: Pick<
    BandoriPngAssetDescriptor | BandoriAudioAssetDescriptor | BandoriJsonAssetDescriptor,
    "key"
  > | null | undefined,
  baseUrl?: string | null,
): string | null {
  const normalizedBaseUrl = getBandoriPublicAssetBaseUrl(baseUrl);
  if (!descriptor || !normalizedBaseUrl) {
    return null;
  }
  return appendBandoriAssetKey(normalizedBaseUrl, descriptor.key);
}
