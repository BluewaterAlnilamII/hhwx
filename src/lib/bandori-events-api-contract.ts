const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export const EVENT_API_POINTER_KEY = "bandori/event-history-v3/api/active.json";
export const EVENT_API_POINTER_SCHEMA_VERSION = "bandori-events-api-pointer-v2";
export const EVENT_API_PACK_PREFIX = "bandori/event-history-v3/api";
export const EVENT_API_DATASETS = ["events", "eventDetails"] as const;
export const MAX_EVENT_API_COMPRESSED_BYTES = 32 * 1024 * 1024;
export const MAX_EVENT_API_DECOMPRESSED_BYTES = 128 * 1024 * 1024;
export const MAX_EVENT_API_RECORDS = 10_000;

export type EventApiDatasetName = (typeof EVENT_API_DATASETS)[number];

export type EventApiDatasetDescriptor = {
  key: string;
  semanticSha256: string;
  compressedSha256: string;
  compressedSize: number;
  recordCount: number;
};

export type EventApiPointer = {
  generation: number;
  datasets: Record<EventApiDatasetName, EventApiDatasetDescriptor>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`Bandori events API pointer has an invalid ${label}`);
  }
  return value;
}

function validateNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`Bandori events API pointer has an invalid ${label}`);
  }
  return value as number;
}

function parseDatasetDescriptor(
  dataset: EventApiDatasetName,
  value: unknown,
): EventApiDatasetDescriptor {
  if (!isRecord(value)) {
    throw new Error(`Bandori events API pointer is missing dataset ${dataset}`);
  }
  const semanticSha256 = validateSha256(value.semanticSha256, `${dataset} semantic SHA-256`);
  const compressedSha256 = validateSha256(value.compressedSha256, `${dataset} compressed SHA-256`);
  const expectedKey = `${EVENT_API_PACK_PREFIX}/packs/${dataset}/${compressedSha256}.json.gz`;
  if (value.key !== expectedKey) {
    throw new Error(`Bandori events API pointer has an invalid ${dataset} pack key`);
  }
  const compressedSize = validateNonNegativeInteger(value.compressedSize, `${dataset} compressed size`);
  if (compressedSize < 1 || compressedSize > MAX_EVENT_API_COMPRESSED_BYTES) {
    throw new Error(`Bandori events API pointer has an unsupported ${dataset} compressed size`);
  }
  const recordCount = validateNonNegativeInteger(value.recordCount, `${dataset} record count`);
  if (recordCount > MAX_EVENT_API_RECORDS) {
    throw new Error(`Bandori events API pointer has too many ${dataset} records`);
  }

  return {
    key: expectedKey,
    semanticSha256,
    compressedSha256,
    compressedSize,
    recordCount,
  };
}

export function parseEventApiPointer(value: unknown): EventApiPointer {
  if (!isRecord(value) || value.schemaVersion !== EVENT_API_POINTER_SCHEMA_VERSION) {
    throw new Error("Unsupported Bandori events API pointer schema");
  }
  const generation = validateNonNegativeInteger(value.generation, "generation");
  if (generation < 1 || !isRecord(value.datasets)) {
    throw new Error("Bandori events API pointer is incomplete");
  }

  return {
    generation,
    datasets: {
      events: parseDatasetDescriptor("events", value.datasets.events),
      eventDetails: parseDatasetDescriptor("eventDetails", value.datasets.eventDetails),
    },
  };
}
