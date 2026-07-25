import {
  MAX_STAMPS_API_COMPRESSED_BYTES,
  MAX_STAMPS_API_DECOMPRESSED_BYTES,
  MAX_STAMPS_API_RECORDS,
  STAMPS_API_POINTER_KEY,
  parseStampsApiPointer,
} from "@/lib/bandori-stamps-api-contract";
import type {
  BandoriStampMasterEntry,
  BandoriStampMasterMap,
} from "@/lib/bandori-stamp-assets";
import {
  createBandoriSnapshotObjectSource,
  createBandoriSnapshotPointerCache,
  createBandoriSnapshotRecordMapCache,
  type BandoriSnapshotRecord,
} from "@/lib/bandori-snapshot-api-server";

const STAMPS_API_POINTER_TTL_MS = 60_000;
const STAMP_SLOT_COUNT = 4;
const STAMP_IMAGE_NAME_PATTERN = /^[A-Za-z0-9_-]+$/u;
const STAMP_RESOURCE_NAME_PATTERN = STAMP_IMAGE_NAME_PATTERN;

function validateStampRecord(
  _cacheKey: string,
  stampId: string,
  record: BandoriSnapshotRecord,
): void {
  const keys = Object.keys(record);
  if (
    (keys.length !== 2 && keys.length !== 3)
    || !Object.hasOwn(record, "imageName")
    || !Object.hasOwn(record, "characterId")
    || keys.some(
      (key) => (
        key !== "imageName"
        && key !== "characterId"
        && key !== "changedStamps"
      ),
    )
  ) {
    throw new Error(`Bandori stamps API record has unsupported fields: ${stampId}`);
  }
  if (
    !Array.isArray(record.imageName)
    || record.imageName.length !== STAMP_SLOT_COUNT
    || !Array.isArray(record.characterId)
    || record.characterId.length !== STAMP_SLOT_COUNT
  ) {
    throw new Error(`Bandori stamps API record must have exactly four slots: ${stampId}`);
  }
  for (let index = 0; index < STAMP_SLOT_COUNT; index += 1) {
    const imageName = record.imageName[index];
    const characterId = record.characterId[index];
    if (
      typeof imageName !== "string"
      || (
        imageName !== ""
        && (
          imageName.length > 255
          || !STAMP_IMAGE_NAME_PATTERN.test(imageName)
        )
      )
    ) {
      throw new Error(`Bandori stamps API record has an invalid imageName: ${stampId}`);
    }
    if (
      (
        characterId !== null
        && (
          !Number.isSafeInteger(characterId)
          || (characterId as number) <= 0
        )
      )
      || (imageName === "" && characterId !== null)
    ) {
      throw new Error(`Bandori stamps API record has an invalid characterId: ${stampId}`);
    }
  }
  if (Object.hasOwn(record, "changedStamps")) {
    if (
      !Array.isArray(record.changedStamps)
      || record.changedStamps.length !== STAMP_SLOT_COUNT
    ) {
      throw new Error(
        `Bandori stamps API changedStamps must have exactly four slots: ${stampId}`,
      );
    }
    let hasChangedStamp = false;
    for (const slot of record.changedStamps) {
      if (!Array.isArray(slot)) {
        throw new Error(`Bandori stamps API changedStamps is invalid: ${stampId}`);
      }
      let previousSignature: string | null = null;
      for (const variant of slot) {
        if (
          typeof variant !== "object"
          || variant === null
          || Array.isArray(variant)
        ) {
          throw new Error(`Bandori stamps API changedStamps is invalid: ${stampId}`);
        }
        const rawVariant = variant as Record<string, unknown>;
        if (
          Object.keys(rawVariant).length !== 2
          || !Object.hasOwn(rawVariant, "imageName")
          || !Object.hasOwn(rawVariant, "soundName")
          || typeof rawVariant.imageName !== "string"
          || typeof rawVariant.soundName !== "string"
          || (
            rawVariant.imageName
            && !STAMP_RESOURCE_NAME_PATTERN.test(rawVariant.imageName)
          )
          || (
            rawVariant.soundName
            && !STAMP_RESOURCE_NAME_PATTERN.test(rawVariant.soundName)
          )
          || (!rawVariant.imageName && !rawVariant.soundName)
        ) {
          throw new Error(`Bandori stamps API changedStamps is invalid: ${stampId}`);
        }
        const signature = `${rawVariant.imageName}\0${rawVariant.soundName}`;
        if (previousSignature !== null && previousSignature >= signature) {
          throw new Error(
            `Bandori stamps API changedStamps must be unique and sorted: ${stampId}`,
          );
        }
        previousSignature = signature;
        hasChangedStamp = true;
      }
    }
    if (!hasChangedStamp) {
      throw new Error(
        `Bandori stamps API changedStamps must be omitted when empty: ${stampId}`,
      );
    }
  }
}

const readStampsApiPointer = createBandoriSnapshotPointerCache({
  pointerKey: STAMPS_API_POINTER_KEY,
  pointerTtlMs: STAMPS_API_POINTER_TTL_MS,
  pointerReadLabel: "Bandori stamps API pointer",
  parse: parseStampsApiPointer,
});

const readStampsApiRecordMap = createBandoriSnapshotRecordMapCache({
  maxEntries: 1,
  maxCompressedBytes: MAX_STAMPS_API_COMPRESSED_BYTES,
  maxDecompressedBytes: MAX_STAMPS_API_DECOMPRESSED_BYTES,
  maxRecords: MAX_STAMPS_API_RECORDS,
  datasetLabel: "Bandori stamps API dataset",
  validateRecord: validateStampRecord,
});

function getStampsApiObjectSource() {
  return createBandoriSnapshotObjectSource({
    localStoreEnvironmentName: "BANDORI_STAMPS_API_LOCAL_STORE_ROOT",
    privateR2ReadLabel: "Bandori private stamps R2 read",
    localObjectLabel: "Bandori local stamps API object",
  });
}

export async function readBandoriStampsApiDataset(): Promise<BandoriStampMasterMap> {
  const source = getStampsApiObjectSource();
  const pointer = await readStampsApiPointer(source);
  const records = await readStampsApiRecordMap(
    source,
    "stamps",
    pointer.datasets.stamps,
  );
  return records as Record<string, BandoriStampMasterEntry>;
}
