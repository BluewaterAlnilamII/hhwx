import {
  MAX_MUSIC_API_COMPRESSED_BYTES,
  MAX_MUSIC_API_DECOMPRESSED_BYTES,
  MAX_MUSIC_API_RECORDS,
  MAX_MUSIC_DETAILS_SHARD_COMPRESSED_BYTES,
  MAX_MUSIC_DETAILS_SHARD_DECOMPRESSED_BYTES,
  MUSIC_API_POINTER_KEY,
  MUSIC_DETAIL_RANGE_SIZE,
  isMusicApiDetailIdSupported,
  musicApiDetailShardKey,
  parseMusicApiPointer,
} from "@/lib/bandori-music-api-contract";
import {
  createBandoriSnapshotObjectSource,
  createBandoriSnapshotPointerCache,
  createBandoriSnapshotRecordMapCache,
  type BandoriSnapshotRecord,
  type BandoriSnapshotRecordMap,
} from "@/lib/bandori-snapshot-api-server";

const MUSIC_API_POINTER_TTL_MS = 60_000;
const MUSIC_DETAIL_CACHE_ENTRIES = 16;
const REGION_SLOT_COUNT = 4;
const DIFFICULTY_KEYS = new Set(["0", "1", "2", "3", "4"]);
const SUMMARY_FIELDS = new Set([
  "tag",
  "bandId",
  "bandName",
  "jacketImage",
  "musicTitle",
  "publishedAt",
  "closedAt",
  "difficulty",
  "musicVideos",
  "length",
  "notes",
  "bpm",
]);
const DETAIL_FIELDS = new Set([
  "bgmId",
  "bgmFile",
  "tag",
  "bandId",
  "bandName",
  "achievements",
  "jacketImage",
  "seq",
  "musicTitle",
  "ruby",
  "phonetic",
  "lyricist",
  "composer",
  "arranger",
  "howToGet",
  "publishedAt",
  "closedAt",
  "description",
  "difficulty",
  "musicVideos",
  "length",
  "notes",
  "bpm",
  "serverExtensions",
]);

export type BandoriMusicApiRecord = BandoriSnapshotRecord;
export type BandoriMusicApiRecordMap = BandoriSnapshotRecordMap;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateRegionalArray(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length !== REGION_SLOT_COUNT) {
    throw new Error(`${label} must have exactly four slots`);
  }
}

function validateMusicVideos(
  value: unknown,
  label: string,
  options: { detail: boolean },
): void {
  if (!isRecord(value) || Object.keys(value).length < 1) {
    throw new Error(`${label} is invalid`);
  }
  const summaryFields = new Set(["startAt"]);
  const detailFields = new Set([
    "assetBundleName",
    "musicStartDelayMilliseconds",
    "thumbAssetBundleName",
    "title",
    "description",
    "startAt",
    "endAt",
  ]);
  for (const [name, rawVideo] of Object.entries(value)) {
    if (!isRecord(rawVideo)) {
      throw new Error(`${label}.${name} is invalid`);
    }
    const allowedFields = options.detail ? detailFields : summaryFields;
    if (
      Object.keys(rawVideo).length !== allowedFields.size
      || Object.keys(rawVideo).some((field) => !allowedFields.has(field))
    ) {
      throw new Error(`${label}.${name} has unsupported fields`);
    }
    validateRegionalArray(rawVideo.startAt, `${label}.${name}.startAt`);
    if (!options.detail) {
      continue;
    }
    if (
      rawVideo.assetBundleName !== name
      || typeof rawVideo.thumbAssetBundleName !== "string"
      || rawVideo.thumbAssetBundleName.length < 1
      || !Number.isSafeInteger(rawVideo.musicStartDelayMilliseconds)
    ) {
      throw new Error(`${label}.${name} has invalid identity fields`);
    }
    for (const field of ["title", "description", "endAt"]) {
      validateRegionalArray(rawVideo[field], `${label}.${name}.${field}`);
    }
  }
}

function validateDifficulty(
  value: unknown,
  label: string,
  options: { detail: boolean },
): void {
  if (!isRecord(value) || Object.keys(value).length < 1) {
    throw new Error(`${label} is invalid`);
  }
  for (const [difficulty, rawEntry] of Object.entries(value)) {
    if (!DIFFICULTY_KEYS.has(difficulty) || !isRecord(rawEntry)) {
      throw new Error(`${label}.${difficulty} is invalid`);
    }
    if (!Number.isSafeInteger(rawEntry.playLevel) || (rawEntry.playLevel as number) < 1) {
      throw new Error(`${label}.${difficulty}.playLevel is invalid`);
    }
    if (Object.hasOwn(rawEntry, "publishedAt")) {
      validateRegionalArray(rawEntry.publishedAt, `${label}.${difficulty}.publishedAt`);
    }
    if (!options.detail) {
      const allowed = new Set(["playLevel", "publishedAt"]);
      if (Object.keys(rawEntry).some((field) => !allowed.has(field))) {
        throw new Error(`${label}.${difficulty} has detail-only fields`);
      }
      continue;
    }
    for (const field of [
      "notesQuantity",
      "scoreC",
      "scoreB",
      "scoreA",
      "scoreS",
      "scoreSS",
    ]) {
      if (
        Object.hasOwn(rawEntry, field)
        && (!Number.isSafeInteger(rawEntry[field]) || (rawEntry[field] as number) < 0)
      ) {
        throw new Error(`${label}.${difficulty}.${field} is invalid`);
      }
    }
    if (Object.hasOwn(rawEntry, "multiLiveScoreMap") && !isRecord(rawEntry.multiLiveScoreMap)) {
      throw new Error(`${label}.${difficulty}.multiLiveScoreMap is invalid`);
    }
  }
}

function validateDerivedFields(record: BandoriSnapshotRecord, musicId: string): void {
  if (!isFiniteNumber(record.length) || record.length <= 0) {
    throw new Error(`Bandori Music API record has an invalid length: ${musicId}`);
  }
  if (!isRecord(record.notes) || !isRecord(record.bpm)) {
    throw new Error(`Bandori Music API record has invalid chart metadata: ${musicId}`);
  }
  const difficultyKeys = Object.keys(record.difficulty as Record<string, unknown>);
  if (
    Object.keys(record.notes).join("\0") !== difficultyKeys.join("\0")
    || Object.keys(record.bpm).join("\0") !== difficultyKeys.join("\0")
  ) {
    throw new Error(`Bandori Music API record has inconsistent difficulty metadata: ${musicId}`);
  }
  for (const difficulty of difficultyKeys) {
    const notes = record.notes[difficulty];
    const bpm = record.bpm[difficulty];
    if (!Number.isSafeInteger(notes) || (notes as number) < 0 || !Array.isArray(bpm) || bpm.length < 1) {
      throw new Error(`Bandori Music API record has invalid derived metadata: ${musicId}.${difficulty}`);
    }
  }
}

function validateCommonRecord(
  record: BandoriSnapshotRecord,
  musicId: string,
  options: { detail: boolean },
): void {
  const allowedFields = options.detail ? DETAIL_FIELDS : SUMMARY_FIELDS;
  if (Object.keys(record).some((field) => !allowedFields.has(field))) {
    throw new Error(`Bandori Music API record has unsupported fields: ${musicId}`);
  }
  if (
    typeof record.tag !== "string"
    || !Number.isSafeInteger(record.bandId)
    || !Array.isArray(record.jacketImage)
    || record.jacketImage.length < 1
  ) {
    throw new Error(`Bandori Music API record has invalid identity fields: ${musicId}`);
  }
  for (const field of ["bandName", "musicTitle", "publishedAt", "closedAt"]) {
    validateRegionalArray(record[field], `Bandori Music API ${musicId}.${field}`);
  }
  validateDifficulty(record.difficulty, `Bandori Music API ${musicId}.difficulty`, options);
  if (Object.hasOwn(record, "musicVideos")) {
    validateMusicVideos(
      record.musicVideos,
      `Bandori Music API ${musicId}.musicVideos`,
      options,
    );
  }
  validateDerivedFields(record, musicId);
}

function validateMusicRecord(
  _cacheKey: string,
  musicId: string,
  record: BandoriSnapshotRecord,
): void {
  if (!isMusicApiDetailIdSupported(musicId)) {
    throw new Error(`Bandori Music API dataset has an invalid Music ID: ${musicId}`);
  }
  validateCommonRecord(record, musicId, { detail: false });
}

function validateMusicDetailRecord(
  shardKey: string,
  musicId: string,
  record: BandoriSnapshotRecord,
): void {
  if (musicApiDetailShardKey(musicId) !== shardKey) {
    throw new Error(`Bandori musicDetails API shard contains an out-of-range record: ${musicId}`);
  }
  validateCommonRecord(record, musicId, { detail: true });
  if (
    typeof record.bgmId !== "string"
    || record.bgmId.length < 1
    || typeof record.bgmFile !== "string"
    || record.bgmFile.length < 1
    || !Number.isSafeInteger(record.seq)
    || !Array.isArray(record.achievements)
  ) {
    throw new Error(`Bandori Music API detail has invalid identity fields: ${musicId}`);
  }
  for (const field of [
    "ruby",
    "phonetic",
    "lyricist",
    "composer",
    "arranger",
    "howToGet",
  ]) {
    validateRegionalArray(record[field], `Bandori Music API ${musicId}.${field}`);
  }
  if (Object.hasOwn(record, "description")) {
    validateRegionalArray(record.description, `Bandori Music API ${musicId}.description`);
  }
  if (Object.hasOwn(record, "serverExtensions")) {
    if (!Array.isArray(record.serverExtensions) || record.serverExtensions.length !== REGION_SLOT_COUNT) {
      throw new Error(`Bandori Music API serverExtensions are invalid: ${musicId}`);
    }
    let hasOverride = false;
    for (const extension of record.serverExtensions) {
      if (extension === null) {
        continue;
      }
      if (
        !isRecord(extension)
        || Object.keys(extension).some((field) => field !== "seq" && field !== "difficulty")
      ) {
        throw new Error(`Bandori Music API serverExtensions are invalid: ${musicId}`);
      }
      if (Object.hasOwn(extension, "seq") && !Number.isSafeInteger(extension.seq)) {
        throw new Error(`Bandori Music API serverExtensions seq is invalid: ${musicId}`);
      }
      if (Object.hasOwn(extension, "difficulty")) {
        validateDifficulty(
          extension.difficulty,
          `Bandori Music API ${musicId}.serverExtensions.difficulty`,
          { detail: true },
        );
      }
      hasOverride ||= Object.keys(extension).length > 0;
    }
    if (!hasOverride) {
      throw new Error(`Bandori Music API empty serverExtensions must be omitted: ${musicId}`);
    }
  }
}

const readMusicApiPointer = createBandoriSnapshotPointerCache({
  pointerKey: MUSIC_API_POINTER_KEY,
  pointerTtlMs: MUSIC_API_POINTER_TTL_MS,
  pointerReadLabel: "Bandori Music API pointer",
  parse: parseMusicApiPointer,
});

const readMusicApiRecordMap = createBandoriSnapshotRecordMapCache({
  maxEntries: 1,
  maxCompressedBytes: MAX_MUSIC_API_COMPRESSED_BYTES,
  maxDecompressedBytes: MAX_MUSIC_API_DECOMPRESSED_BYTES,
  maxRecords: MAX_MUSIC_API_RECORDS,
  datasetLabel: "Bandori Music API dataset",
  validateRecord: validateMusicRecord,
});

const readMusicDetailsShard = createBandoriSnapshotRecordMapCache({
  maxEntries: MUSIC_DETAIL_CACHE_ENTRIES,
  maxCompressedBytes: MAX_MUSIC_DETAILS_SHARD_COMPRESSED_BYTES,
  maxDecompressedBytes: MAX_MUSIC_DETAILS_SHARD_DECOMPRESSED_BYTES,
  maxRecords: MUSIC_DETAIL_RANGE_SIZE,
  datasetLabel: "Bandori musicDetails API shard",
  validateRecord: validateMusicDetailRecord,
});

function getMusicApiObjectSource() {
  return createBandoriSnapshotObjectSource({
    localStoreEnvironmentName: "BANDORI_MUSIC_API_LOCAL_STORE_ROOT",
    privateR2ReadLabel: "Bandori private Music R2 read",
    localObjectLabel: "Bandori local Music API object",
  });
}

export async function readBandoriMusicApiDataset(): Promise<BandoriMusicApiRecordMap> {
  const source = getMusicApiObjectSource();
  const pointer = await readMusicApiPointer(source);
  return readMusicApiRecordMap(source, "music", pointer.datasets.music);
}

export async function readBandoriMusicApiDetail(
  musicId: string,
): Promise<BandoriMusicApiRecord | null> {
  if (!isMusicApiDetailIdSupported(musicId)) {
    return null;
  }
  const shardKey = musicApiDetailShardKey(musicId);
  const source = getMusicApiObjectSource();
  const pointer = await readMusicApiPointer(source);
  const descriptor = pointer.datasets.musicDetails.shards[shardKey];
  if (!descriptor) {
    return null;
  }
  const details = await readMusicDetailsShard(source, shardKey, descriptor);
  return Object.hasOwn(details, musicId) ? details[musicId] : null;
}
