const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export const STAMPS_API_POINTER_KEY = "bandori/master/stamps/api/active.json";
export const STAMPS_API_POINTER_SCHEMA_VERSION = "bandori-stamps-api-pointer-v1";
export const STAMPS_API_PACK_PREFIX = "bandori/master/stamps/api";
export const MAX_STAMPS_API_COMPRESSED_BYTES = 4 * 1024 * 1024;
export const MAX_STAMPS_API_DECOMPRESSED_BYTES = 32 * 1024 * 1024;
export const MAX_STAMPS_API_RECORDS = 100_000;

export type StampsApiDatasetDescriptor = {
  key: string;
  semanticSha256: string;
  compressedSha256: string;
  compressedSize: number;
  recordCount: number;
};

export type StampsApiPointer = {
  generation: number;
  datasets: {
    stamps: StampsApiDatasetDescriptor;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`Bandori stamps API pointer has an invalid ${label}`);
  }
  return value;
}

function validateNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`Bandori stamps API pointer has an invalid ${label}`);
  }
  return value as number;
}

function parseDatasetDescriptor(value: unknown): StampsApiDatasetDescriptor {
  if (!isRecord(value)) {
    throw new Error("Bandori stamps API pointer is missing dataset stamps");
  }
  const semanticSha256 = validateSha256(value.semanticSha256, "stamps semantic SHA-256");
  const compressedSha256 = validateSha256(
    value.compressedSha256,
    "stamps compressed SHA-256",
  );
  const expectedKey = `${STAMPS_API_PACK_PREFIX}/packs/stamps/${compressedSha256}.json.gz`;
  if (value.key !== expectedKey) {
    throw new Error("Bandori stamps API pointer has an invalid stamps pack key");
  }
  const compressedSize = validateNonNegativeInteger(
    value.compressedSize,
    "stamps compressed size",
  );
  if (
    compressedSize < 1
    || compressedSize > MAX_STAMPS_API_COMPRESSED_BYTES
  ) {
    throw new Error("Bandori stamps API pointer has an unsupported stamps compressed size");
  }
  const recordCount = validateNonNegativeInteger(
    value.recordCount,
    "stamps record count",
  );
  if (recordCount < 1 || recordCount > MAX_STAMPS_API_RECORDS) {
    throw new Error("Bandori stamps API pointer has an unsupported stamps record count");
  }
  return {
    key: expectedKey,
    semanticSha256,
    compressedSha256,
    compressedSize,
    recordCount,
  };
}

export function parseStampsApiPointer(value: unknown): StampsApiPointer {
  if (!isRecord(value) || value.schemaVersion !== STAMPS_API_POINTER_SCHEMA_VERSION) {
    throw new Error("Unsupported Bandori stamps API pointer schema");
  }
  const generation = validateNonNegativeInteger(value.generation, "generation");
  if (generation < 1 || !isRecord(value.datasets)) {
    throw new Error("Bandori stamps API pointer is incomplete");
  }
  return {
    generation,
    datasets: {
      stamps: parseDatasetDescriptor(value.datasets.stamps),
    },
  };
}
