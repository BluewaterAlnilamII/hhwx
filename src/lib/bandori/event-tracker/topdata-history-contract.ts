import {
  BANDORI_TOPDATA_MAX_POINTS,
  BANDORI_TOPDATA_MAX_USERS,
  BANDORI_TOPDATA_SCHEMA_VERSION,
  countBandoriTopDataSamples,
  parseBandoriTopDataPayload,
  requireBandoriTopDataSafeInteger,
  type BandoriTopDataPayload,
} from "@/lib/bandori/event-tracker/topdata-contract";
import { getBandoriServerFromCode, type BandoriServerCode } from "@/lib/bandori-server";

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

export type BandoriSongTopDataManifest = {
  generation: number;
  publishedAt: string;
  hasFinalSample: boolean;
  songIds: number[];
  descriptors: Map<number, BandoriTopDataPackDescriptor | null>;
};

export type BandoriMonthlyTopDataManifest = {
  generation: number;
  publishedAt: string;
  hasFinalSample: boolean;
  descriptor: BandoriTopDataPackDescriptor;
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

export function buildBandoriTopDataTargetPrefix(
  eventId: number,
  server: BandoriServerCode = "cn",
): string {
  requireBandoriTopDataSafeInteger(eventId, "Bandori topdata event ID", 1);
  if (eventId > 2_147_483_647 || getBandoriServerFromCode(server) === null) {
    throw new Error(`Unsupported Bandori topdata target: ${server}/${eventId}`);
  }
  return `${BANDORI_TOPDATA_HISTORY_PREFIX}/events/${eventId}/${server}`;
}

export function buildBandoriTopDataManifestKey(
  eventId: number,
  server: BandoriServerCode = "cn",
): string {
  return `${buildBandoriTopDataTargetPrefix(eventId, server)}/manifest.json`;
}

export function buildBandoriSongTopDataManifestKey(
  eventId: number,
  server: BandoriServerCode,
): string {
  requireBandoriTopDataSafeInteger(eventId, "Bandori song topdata event ID", 1);
  return `${BANDORI_TOPDATA_HISTORY_PREFIX}/songs/${eventId}/${server}/manifest.json`;
}

export function buildBandoriMonthlyTopDataManifestKey(
  period: string,
  server: BandoriServerCode,
): string {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(period)) {
    throw new Error("Bandori monthly topdata period is invalid");
  }
  return `${BANDORI_TOPDATA_HISTORY_PREFIX}/monthly/${period}/${server}/manifest.json`;
}

function parseScopedDescriptor(
  value: unknown,
  expectedKeyPrefix: string,
): BandoriTopDataPackDescriptor {
  const descriptor = requireRecord(value, "Bandori topdata pack descriptor");
  requireExactKeys(descriptor, [
    "key", "semanticSha256", "compressedSha256", "compressedSize",
    "pointCount", "userCount", "sampleCount", "hasFinalSample",
  ], "Bandori topdata pack descriptor");
  const compressedSha256 = requireSha256(descriptor.compressedSha256, "Bandori topdata compressed SHA-256");
  const key = `${expectedKeyPrefix}/${compressedSha256}.json.gz`;
  if (descriptor.key !== key || typeof descriptor.hasFinalSample !== "boolean") {
    throw new Error("Bandori topdata pack identity is invalid");
  }
  const parsed = {
    key,
    semanticSha256: requireSha256(descriptor.semanticSha256, "Bandori topdata semantic SHA-256"),
    compressedSha256,
    compressedSize: requireBandoriTopDataSafeInteger(descriptor.compressedSize, "Bandori topdata compressed size", 1),
    pointCount: requireBandoriTopDataSafeInteger(descriptor.pointCount, "Bandori topdata point count", 1),
    userCount: requireBandoriTopDataSafeInteger(descriptor.userCount, "Bandori topdata user count", 1),
    sampleCount: requireBandoriTopDataSafeInteger(descriptor.sampleCount, "Bandori topdata sample count", 1),
    hasFinalSample: descriptor.hasFinalSample,
  };
  if (
    parsed.compressedSize > BANDORI_TOPDATA_MAX_COMPRESSED_BYTES
    || parsed.pointCount > BANDORI_TOPDATA_MAX_POINTS
    || parsed.userCount > BANDORI_TOPDATA_MAX_USERS
    || parsed.pointCount < parsed.sampleCount
    || parsed.pointCount > parsed.sampleCount * 10
    || parsed.userCount > parsed.pointCount
  ) {
    throw new Error("Bandori topdata scoped pack descriptor exceeds contract limits");
  }
  return parsed;
}

function parseScopedHeader(manifest: Record<string, unknown>) {
  if (
    typeof manifest.publishedAt !== "string"
    || !TIMEZONE_SUFFIX_PATTERN.test(manifest.publishedAt)
    || !Number.isFinite(Date.parse(manifest.publishedAt))
    || typeof manifest.hasFinalSample !== "boolean"
  ) {
    throw new Error("Bandori topdata manifest header is invalid");
  }
  return {
    generation: requireBandoriTopDataSafeInteger(manifest.generation, "Bandori topdata generation", 1),
    publishedAt: manifest.publishedAt,
    hasFinalSample: manifest.hasFinalSample,
  };
}

export function parseBandoriSongTopDataManifest(
  value: unknown,
  eventId: number,
  server: BandoriServerCode,
): BandoriSongTopDataManifest {
  const manifest = requireRecord(value, "Bandori song topdata manifest");
  requireExactKeys(manifest, [
    "schemaVersion", "kind", "server", "eventId", "songIds", "generation",
    "publishedAt", "hasFinalSample", "packs", "recentPackKeys",
  ], "Bandori song topdata manifest");
  if (manifest.schemaVersion !== BANDORI_TOPDATA_SCHEMA_VERSION || manifest.kind !== "songTop10" || manifest.server !== server || manifest.eventId !== eventId) {
    throw new Error("Bandori song topdata manifest identity mismatch");
  }
  if (!Array.isArray(manifest.songIds) || ![1, 3].includes(manifest.songIds.length)) {
    throw new Error("Bandori song topdata targets are invalid");
  }
  const songIds = manifest.songIds.map((id) => requireBandoriTopDataSafeInteger(id, "Bandori song ID", 0));
  if (
    new Set(songIds).size !== songIds.length
    || songIds.some((id, index) => index > 0 && id <= songIds[index - 1])
    || (songIds.length === 3 && songIds.some((id) => id === 0))
  ) {
    throw new Error("Bandori song topdata targets must be unique and sorted");
  }
  const packs = requireRecord(manifest.packs, "Bandori song topdata packs");
  const recent = requireRecord(manifest.recentPackKeys, "Bandori song topdata recent packs");
  if (new Set([...Object.keys(packs), ...Object.keys(recent)]).size !== songIds.length || songIds.some((id) => !(String(id) in packs) || !(String(id) in recent))) {
    throw new Error("Bandori song topdata target maps are invalid");
  }
  const prefix = `${BANDORI_TOPDATA_HISTORY_PREFIX}/songs/${eventId}/${server}/packs`;
  const descriptors = new Map<number, BandoriTopDataPackDescriptor | null>();
  for (const songId of songIds) {
    const raw = packs[String(songId)];
    const descriptor = raw === null ? null : parseScopedDescriptor(raw, `${prefix}/${songId}`);
    const keys = recent[String(songId)];
    const keyPrefix = `${prefix}/${songId}/`;
    if (
      !Array.isArray(keys)
      || keys.length > 8
      || keys.some((key) => typeof key !== "string")
      || new Set(keys).size !== keys.length
      || keys.some((key) => (
        typeof key !== "string"
        || !key.startsWith(keyPrefix)
        || !/^[0-9a-f]{64}\.json\.gz$/u.test(key.slice(keyPrefix.length))
      ))
      || (descriptor ? keys[0] !== descriptor.key : keys.length !== 0)
    ) {
      throw new Error("Bandori song topdata retention is invalid");
    }
    descriptors.set(songId, descriptor);
  }
  const header = parseScopedHeader(manifest);
  const allFinal = songIds.every((songId) => descriptors.get(songId)?.hasFinalSample === true);
  if (header.hasFinalSample !== allFinal) {
    throw new Error("Bandori song topdata final summary mismatch");
  }
  return { ...header, songIds, descriptors };
}

export function parseBandoriMonthlyTopDataManifest(
  value: unknown,
  period: string,
  monthlyRankingId: number,
  server: BandoriServerCode,
): BandoriMonthlyTopDataManifest {
  const manifest = requireRecord(value, "Bandori monthly topdata manifest");
  requireExactKeys(manifest, [
    "schemaVersion", "kind", "server", "period", "monthlyRankingId", "generation",
    "publishedAt", "hasFinalSample", "pack", "recentPackKeys",
  ], "Bandori monthly topdata manifest");
  if (manifest.schemaVersion !== BANDORI_TOPDATA_SCHEMA_VERSION || manifest.kind !== "monthlyTop10" || manifest.server !== server || manifest.period !== period || manifest.monthlyRankingId !== monthlyRankingId) {
    throw new Error("Bandori monthly topdata manifest identity mismatch");
  }
  const descriptor = parseScopedDescriptor(
    manifest.pack,
    `${BANDORI_TOPDATA_HISTORY_PREFIX}/monthly/${period}/${server}/packs/monthly`,
  );
  const packPrefix = `${BANDORI_TOPDATA_HISTORY_PREFIX}/monthly/${period}/${server}/packs/monthly/`;
  if (
    !Array.isArray(manifest.recentPackKeys)
    || manifest.recentPackKeys.length < 1
    || manifest.recentPackKeys.length > 8
    || manifest.recentPackKeys[0] !== descriptor.key
    || new Set(manifest.recentPackKeys).size !== manifest.recentPackKeys.length
    || manifest.recentPackKeys.some((key) => (
      typeof key !== "string"
      || !key.startsWith(packPrefix)
      || !/^[0-9a-f]{64}\.json\.gz$/u.test(key.slice(packPrefix.length))
    ))
  ) {
    throw new Error("Bandori monthly topdata retention is invalid");
  }
  const header = parseScopedHeader(manifest);
  if (header.hasFinalSample !== descriptor.hasFinalSample) {
    throw new Error("Bandori monthly topdata final summary mismatch");
  }
  return { ...header, descriptor };
}

export function parseBandoriTopDataManifest(
  value: unknown,
  eventId: number,
  server: BandoriServerCode = "cn",
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
