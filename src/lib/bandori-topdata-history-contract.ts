import {
  BANDORI_TOPDATA_MAX_POINTS,
  BANDORI_TOPDATA_MAX_USERS,
  BANDORI_TOPDATA_SCHEMA_VERSION,
  countBandoriTopDataSamples,
  parseBandoriTopDataPayload,
  requireBandoriTopDataSafeInteger,
  type BandoriTopDataPayload,
} from "@/lib/bandori-topdata-contract";

export const BANDORI_TOPDATA_HISTORY_PREFIX = "bandori/trackerdata/topdata";
export const BANDORI_TOPDATA_MAX_MANIFEST_BYTES = 64 * 1024;
export const BANDORI_TOPDATA_MAX_COMPRESSED_BYTES = 2 * 1024 * 1024;
export const BANDORI_TOPDATA_MAX_DECOMPRESSED_BYTES = 16 * 1024 * 1024;

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const TIMEZONE_SUFFIX_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/u;

export type BandoriTopDataPackDescriptor = {
  key: string;
  semanticSha256: string;
  compressedSha256: string;
  compressedSize: number;
  pointCount: number;
  userCount: number;
  sampleCount: number;
  hasFinalSample: boolean;
};

export type BandoriTopDataManifest = {
  generation: number;
  publishedAt: string;
  hasFinalSample: boolean;
  descriptor: BandoriTopDataPackDescriptor;
  recentPackKeys: string[];
};

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const expected = new Set(keys);
  const actual = Object.keys(value);
  if (actual.length !== expected.size || actual.some((key) => !expected.has(key))) {
    throw new Error(`${label} fields are invalid`);
  }
}

function requireSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

export function buildBandoriTopDataTargetPrefix(eventId: number, server = "cn"): string {
  requireBandoriTopDataSafeInteger(eventId, "Bandori topdata event ID", 1);
  if (eventId > 2_147_483_647 || server !== "cn") {
    throw new Error(`Unsupported Bandori topdata target: ${server}/${eventId}`);
  }
  return `${BANDORI_TOPDATA_HISTORY_PREFIX}/events/${eventId}/${server}`;
}

export function buildBandoriTopDataManifestKey(eventId: number, server = "cn"): string {
  return `${buildBandoriTopDataTargetPrefix(eventId, server)}/manifest.json`;
}

export function parseBandoriTopDataManifest(
  value: unknown,
  eventId: number,
  server = "cn",
): BandoriTopDataManifest {
  const manifest = requireRecord(value, "Bandori topdata manifest");
  requireExactKeys(
    manifest,
    [
      "schemaVersion",
      "kind",
      "server",
      "eventId",
      "generation",
      "publishedAt",
      "hasFinalSample",
      "pack",
      "recentPackKeys",
    ],
    "Bandori topdata manifest",
  );
  if (
    manifest.schemaVersion !== BANDORI_TOPDATA_SCHEMA_VERSION
    || manifest.kind !== "eventTop10"
    || manifest.server !== server
    || manifest.eventId !== eventId
  ) {
    throw new Error("Bandori topdata manifest identity mismatch");
  }
  if (
    typeof manifest.publishedAt !== "string"
    || !TIMEZONE_SUFFIX_PATTERN.test(manifest.publishedAt)
    || !Number.isFinite(Date.parse(manifest.publishedAt))
  ) {
    throw new Error("Bandori topdata manifest publishedAt is invalid");
  }
  if (typeof manifest.hasFinalSample !== "boolean") {
    throw new Error("Bandori topdata manifest hasFinalSample must be boolean");
  }

  const descriptor = requireRecord(manifest.pack, "Bandori topdata pack descriptor");
  requireExactKeys(
    descriptor,
    [
      "key",
      "semanticSha256",
      "compressedSha256",
      "compressedSize",
      "pointCount",
      "userCount",
      "sampleCount",
      "hasFinalSample",
    ],
    "Bandori topdata pack descriptor",
  );
  const compressedSha256 = requireSha256(
    descriptor.compressedSha256,
    "Bandori topdata compressed SHA-256",
  );
  const expectedKey = `${buildBandoriTopDataTargetPrefix(eventId, server)}/packs/event/${compressedSha256}.json.gz`;
  if (descriptor.key !== expectedKey) {
    throw new Error("Bandori topdata pack key mismatch");
  }
  const parsedDescriptor: BandoriTopDataPackDescriptor = {
    key: expectedKey,
    semanticSha256: requireSha256(
      descriptor.semanticSha256,
      "Bandori topdata semantic SHA-256",
    ),
    compressedSha256,
    compressedSize: requireBandoriTopDataSafeInteger(
      descriptor.compressedSize,
      "Bandori topdata compressed size",
      1,
    ),
    pointCount: requireBandoriTopDataSafeInteger(
      descriptor.pointCount,
      "Bandori topdata point count",
      1,
    ),
    userCount: requireBandoriTopDataSafeInteger(
      descriptor.userCount,
      "Bandori topdata user count",
      1,
    ),
    sampleCount: requireBandoriTopDataSafeInteger(
      descriptor.sampleCount,
      "Bandori topdata sample count",
      1,
    ),
    hasFinalSample: descriptor.hasFinalSample as boolean,
  };
  if (
    typeof descriptor.hasFinalSample !== "boolean"
    || descriptor.hasFinalSample !== manifest.hasFinalSample
    || parsedDescriptor.compressedSize > BANDORI_TOPDATA_MAX_COMPRESSED_BYTES
    || parsedDescriptor.pointCount > BANDORI_TOPDATA_MAX_POINTS
    || parsedDescriptor.userCount > BANDORI_TOPDATA_MAX_USERS
    || parsedDescriptor.pointCount < parsedDescriptor.sampleCount
    || parsedDescriptor.pointCount > parsedDescriptor.sampleCount * 10
    || parsedDescriptor.userCount > parsedDescriptor.pointCount
  ) {
    throw new Error("Bandori topdata pack descriptor exceeds contract limits");
  }

  if (
    !Array.isArray(manifest.recentPackKeys)
    || manifest.recentPackKeys.length < 1
    || manifest.recentPackKeys.length > 8
    || manifest.recentPackKeys.some((key) => typeof key !== "string")
  ) {
    throw new Error("Bandori topdata recent pack keys are invalid");
  }
  const recentPackKeys = manifest.recentPackKeys as string[];
  const packPrefix = `${buildBandoriTopDataTargetPrefix(eventId, server)}/packs/event/`;
  if (
    recentPackKeys[0] !== expectedKey
    || new Set(recentPackKeys).size !== recentPackKeys.length
    || recentPackKeys.some((key) => (
      !key.startsWith(packPrefix)
      || !/^[0-9a-f]{64}\.json\.gz$/u.test(key.slice(packPrefix.length))
    ))
  ) {
    throw new Error("Bandori topdata active pack retention is invalid");
  }
  return {
    generation: requireBandoriTopDataSafeInteger(
      manifest.generation,
      "Bandori topdata generation",
      1,
    ),
    publishedAt: manifest.publishedAt,
    hasFinalSample: manifest.hasFinalSample,
    descriptor: parsedDescriptor,
    recentPackKeys: [...recentPackKeys],
  };
}

export function validateBandoriTopDataPack(
  value: unknown,
  descriptor: BandoriTopDataPackDescriptor,
): BandoriTopDataPayload {
  const payload = parseBandoriTopDataPayload(value);
  if (
    payload.points.length !== descriptor.pointCount
    || payload.users.length !== descriptor.userCount
    || countBandoriTopDataSamples(payload.points) !== descriptor.sampleCount
  ) {
    throw new Error("Bandori topdata pack count mismatch");
  }
  return payload;
}
