const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const MUSIC_DETAIL_SHARD_PATTERN = /^music\d{5}$/u;

export const MUSIC_API_POINTER_KEY = "bandori/master/music/api/active.json";
export const MUSIC_API_POINTER_SCHEMA_VERSION = "bandori-music-api-pointer-v1";
export const MUSIC_API_PACK_PREFIX = "bandori/master/music/api";
export const MUSIC_DETAIL_LAYOUT = "numeric-id-range";
export const MUSIC_DETAIL_RANGE_SIZE = 50;
export const MAX_MUSIC_API_COMPRESSED_BYTES = 4 * 1024 * 1024;
export const MAX_MUSIC_API_DECOMPRESSED_BYTES = 32 * 1024 * 1024;
export const MAX_MUSIC_DETAILS_SHARD_COMPRESSED_BYTES = 1024 * 1024;
export const MAX_MUSIC_DETAILS_SHARD_DECOMPRESSED_BYTES = 8 * 1024 * 1024;
export const MAX_MUSIC_API_RECORDS = 10_000;
export const MAX_MUSIC_DETAIL_SHARDS = 1_000;

export type MusicApiPackDescriptor = {
  key: string;
  semanticSha256: string;
  compressedSha256: string;
  compressedSize: number;
  recordCount: number;
};

export type MusicDetailsApiDataset = {
  layout: typeof MUSIC_DETAIL_LAYOUT;
  rangeSize: typeof MUSIC_DETAIL_RANGE_SIZE;
  recordCount: number;
  shards: Record<string, MusicApiPackDescriptor>;
};

export type MusicApiPointer = {
  generation: number;
  datasets: {
    music: MusicApiPackDescriptor;
    musicDetails: MusicDetailsApiDataset;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`Bandori Music API pointer has an invalid ${label}`);
  }
  return value;
}

function validateNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`Bandori Music API pointer has an invalid ${label}`);
  }
  return value as number;
}

function parsePackDescriptor(
  value: unknown,
  options: {
    label: string;
    expectedKey: (compressedSha256: string) => string;
    maxCompressedBytes: number;
    maxRecords: number;
  },
): MusicApiPackDescriptor {
  if (!isRecord(value)) {
    throw new Error(`Bandori Music API pointer is missing ${options.label}`);
  }
  const semanticSha256 = validateSha256(value.semanticSha256, `${options.label} semantic SHA-256`);
  const compressedSha256 = validateSha256(
    value.compressedSha256,
    `${options.label} compressed SHA-256`,
  );
  const expectedKey = options.expectedKey(compressedSha256);
  if (value.key !== expectedKey) {
    throw new Error(`Bandori Music API pointer has an invalid ${options.label} pack key`);
  }
  const compressedSize = validateNonNegativeInteger(
    value.compressedSize,
    `${options.label} compressed size`,
  );
  if (compressedSize < 1 || compressedSize > options.maxCompressedBytes) {
    throw new Error(`Bandori Music API pointer has an unsupported ${options.label} compressed size`);
  }
  const recordCount = validateNonNegativeInteger(
    value.recordCount,
    `${options.label} record count`,
  );
  if (recordCount > options.maxRecords) {
    throw new Error(`Bandori Music API pointer has too many ${options.label} records`);
  }
  return {
    key: expectedKey,
    semanticSha256,
    compressedSha256,
    compressedSize,
    recordCount,
  };
}

function parseMusicDetailsDataset(value: unknown): MusicDetailsApiDataset {
  if (
    !isRecord(value)
    || value.layout !== MUSIC_DETAIL_LAYOUT
    || value.rangeSize !== MUSIC_DETAIL_RANGE_SIZE
    || !isRecord(value.shards)
  ) {
    throw new Error("Bandori Music API pointer has an invalid musicDetails layout");
  }
  const recordCount = validateNonNegativeInteger(value.recordCount, "musicDetails record count");
  if (recordCount > MAX_MUSIC_API_RECORDS) {
    throw new Error("Bandori Music API pointer has too many musicDetails records");
  }
  const entries = Object.entries(value.shards);
  if (entries.length > MAX_MUSIC_DETAIL_SHARDS) {
    throw new Error("Bandori Music API pointer has too many musicDetails shards");
  }
  const shards: Record<string, MusicApiPackDescriptor> = {};
  let shardRecordCount = 0;
  for (const [shardKey, descriptorValue] of entries) {
    if (!MUSIC_DETAIL_SHARD_PATTERN.test(shardKey)) {
      throw new Error(`Bandori Music API pointer has an invalid musicDetails shard: ${shardKey}`);
    }
    const descriptor = parsePackDescriptor(descriptorValue, {
      label: `musicDetails shard ${shardKey}`,
      expectedKey: (compressedSha256) => (
        `${MUSIC_API_PACK_PREFIX}/packs/musicDetails/${shardKey}/${compressedSha256}.json.gz`
      ),
      maxCompressedBytes: MAX_MUSIC_DETAILS_SHARD_COMPRESSED_BYTES,
      maxRecords: MUSIC_DETAIL_RANGE_SIZE,
    });
    if (descriptor.recordCount < 1) {
      throw new Error(`Bandori Music API pointer has an empty musicDetails shard: ${shardKey}`);
    }
    shardRecordCount += descriptor.recordCount;
    shards[shardKey] = descriptor;
  }
  if (shardRecordCount !== recordCount) {
    throw new Error("Bandori Music API pointer has an inconsistent musicDetails record count");
  }
  return {
    layout: MUSIC_DETAIL_LAYOUT,
    rangeSize: MUSIC_DETAIL_RANGE_SIZE,
    recordCount,
    shards,
  };
}

export function parseMusicApiPointer(value: unknown): MusicApiPointer {
  if (!isRecord(value) || value.schemaVersion !== MUSIC_API_POINTER_SCHEMA_VERSION) {
    throw new Error("Unsupported Bandori Music API pointer schema");
  }
  const generation = validateNonNegativeInteger(value.generation, "generation");
  if (generation < 1 || !isRecord(value.datasets)) {
    throw new Error("Bandori Music API pointer is incomplete");
  }
  const music = parsePackDescriptor(value.datasets.music, {
    label: "music",
    expectedKey: (compressedSha256) => (
      `${MUSIC_API_PACK_PREFIX}/packs/music/${compressedSha256}.json.gz`
    ),
    maxCompressedBytes: MAX_MUSIC_API_COMPRESSED_BYTES,
    maxRecords: MAX_MUSIC_API_RECORDS,
  });
  const musicDetails = parseMusicDetailsDataset(value.datasets.musicDetails);
  if (music.recordCount !== musicDetails.recordCount) {
    throw new Error("Bandori Music API pointer has inconsistent music and musicDetails counts");
  }
  return { generation, datasets: { music, musicDetails } };
}

export function musicApiDetailShardKey(musicId: string): string {
  if (!isMusicApiDetailIdSupported(musicId)) {
    throw new Error("Bandori Music ID is outside the supported range");
  }
  const shardNumber = Math.floor(Number(musicId) / MUSIC_DETAIL_RANGE_SIZE);
  return `music${String(shardNumber).padStart(5, "0")}`;
}

export function isMusicApiDetailIdSupported(musicId: string): boolean {
  if (!/^[1-9]\d*$/u.test(musicId)) {
    return false;
  }
  const numericMusicId = Number(musicId);
  return Number.isSafeInteger(numericMusicId)
    && Math.floor(numericMusicId / MUSIC_DETAIL_RANGE_SIZE) <= 99_999;
}
