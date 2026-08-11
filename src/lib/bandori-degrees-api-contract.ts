const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export const DEGREES_API_POINTER_KEY = "bandori/master/degrees/api/active.json";
export const DEGREES_API_POINTER_SCHEMA_VERSION = "bandori-degrees-api-pointer-v1";
export const DEGREES_API_PACK_PREFIX = "bandori/master/degrees/api";
export const MAX_DEGREES_API_COMPRESSED_BYTES = 8 * 1024 * 1024;
export const MAX_DEGREES_API_DECOMPRESSED_BYTES = 32 * 1024 * 1024;
export const MAX_DEGREES_API_RECORDS = 100_000;

export type DegreesApiDatasetDescriptor = {
  key: string;
  semanticSha256: string;
  compressedSha256: string;
  compressedSize: number;
  recordCount: number;
};

export type DegreesApiPointer = {
  generation: number;
  datasets: {
    degrees: DegreesApiDatasetDescriptor;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`Bandori degrees API pointer has an invalid ${label}`);
  }
  return value;
}

function validateNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`Bandori degrees API pointer has an invalid ${label}`);
  }
  return value as number;
}

function parseDatasetDescriptor(value: unknown): DegreesApiDatasetDescriptor {
  if (!isRecord(value)) {
    throw new Error("Bandori degrees API pointer is missing dataset degrees");
  }
  const semanticSha256 = validateSha256(value.semanticSha256, "degrees semantic SHA-256");
  const compressedSha256 = validateSha256(
    value.compressedSha256,
    "degrees compressed SHA-256",
  );
  const expectedKey = `${DEGREES_API_PACK_PREFIX}/packs/degrees/${compressedSha256}.json.gz`;
  if (value.key !== expectedKey) {
    throw new Error("Bandori degrees API pointer has an invalid degrees pack key");
  }
  const compressedSize = validateNonNegativeInteger(
    value.compressedSize,
    "degrees compressed size",
  );
  if (
    compressedSize < 1
    || compressedSize > MAX_DEGREES_API_COMPRESSED_BYTES
  ) {
    throw new Error("Bandori degrees API pointer has an unsupported degrees compressed size");
  }
  const recordCount = validateNonNegativeInteger(
    value.recordCount,
    "degrees record count",
  );
  if (recordCount < 1 || recordCount > MAX_DEGREES_API_RECORDS) {
    throw new Error("Bandori degrees API pointer has an unsupported degrees record count");
  }
  return {
    key: expectedKey,
    semanticSha256,
    compressedSha256,
    compressedSize,
    recordCount,
  };
}

export function parseDegreesApiPointer(value: unknown): DegreesApiPointer {
  if (!isRecord(value) || value.schemaVersion !== DEGREES_API_POINTER_SCHEMA_VERSION) {
    throw new Error("Unsupported Bandori degrees API pointer schema");
  }
  const generation = validateNonNegativeInteger(value.generation, "generation");
  if (generation < 1 || !isRecord(value.datasets)) {
    throw new Error("Bandori degrees API pointer is incomplete");
  }
  return {
    generation,
    datasets: {
      degrees: parseDatasetDescriptor(value.datasets.degrees),
    },
  };
}
