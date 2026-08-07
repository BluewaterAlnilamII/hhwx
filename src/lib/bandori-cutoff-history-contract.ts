import { bandoriMonthlyRankingIdToPeriod } from "@/lib/bandori-monthly-ranking-calendar";
import type { BandoriServerCode } from "@/lib/bandori-server";

export const BANDORI_CUTOFF_HISTORY_PREFIX = "bandori/trackerdata";
export const BANDORI_CUTOFF_HISTORY_SCHEMA_VERSION = 1;
export const BANDORI_CUTOFF_HISTORY_MAX_ROWS = 5_000;
// These are rejection ceilings for corrupt or unexpectedly large artifacts;
// they do not allocate memory up front. Production packs are currently much
// smaller, and raising a ceiling requires a new inventory of published data.
export const BANDORI_CUTOFF_HISTORY_MAX_MANIFEST_BYTES = 64 * 1024;
export const BANDORI_CUTOFF_HISTORY_MAX_COMPRESSED_BYTES = 2 * 1024 * 1024;
export const BANDORI_CUTOFF_HISTORY_MAX_DECOMPRESSED_BYTES = 16 * 1024 * 1024;
export const BANDORI_CUTOFF_HISTORY_MAX_PACK_RECORDS = 200_000;

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const POSITIVE_INTEGER_KEY_PATTERN = /^[1-9]\d*$/u;
const NONNEGATIVE_INTEGER_KEY_PATTERN = /^(?:0|[1-9]\d*)$/u;
const TIMEZONE_SUFFIX_PATTERN = /(?:Z|[+-]\d{2}:\d{2})$/u;

export type BandoriCutoffHistoryType = "event" | "song" | "monthly";

export type BandoriCutoffHistoryQuery = {
  server: BandoriServerCode;
  targetId: number;
  tier: number;
  type: BandoriCutoffHistoryType;
};

export type BandoriCutoffHistoryPoint = {
  time: number;
  ep: number;
  isFinal?: true;
};

export type BandoriCutoffHistorySongMap = Record<string, BandoriCutoffHistoryPoint[]>;
export type BandoriCutoffHistoryCutoffs = BandoriCutoffHistoryPoint[] | BandoriCutoffHistorySongMap;

export type BandoriCutoffHistoryPackDescriptor = {
  key: string;
  semanticSha256: string;
  compressedSha256: string;
  compressedSize: number;
  recordCount: number;
  tierCount: number;
  hasFinalPoint: boolean;
};

export type BandoriCutoffHistoryManifestSelection = {
  generation: number;
  publishedAt: string;
  descriptor: BandoriCutoffHistoryPackDescriptor | null;
};

type ParsedSimplePack = {
  kind: "event" | "monthly";
  tiers: Map<number, BandoriCutoffHistoryPoint[]>;
};

type ParsedSongPack = {
  kind: "song";
  tiers: Map<number, Map<number, BandoriCutoffHistoryPoint[]>>;
};

export type ParsedBandoriCutoffHistoryPack = ParsedSimplePack | ParsedSongPack;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireNonemptyRecord(value: unknown, label: string): Record<string, unknown> {
  const record = requireRecord(value, label);
  if (Object.keys(record).length === 0) {
    throw new Error(`${label} must not be empty`);
  }
  return record;
}

function requireSafeInteger(value: unknown, label: string, minimum = 0): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < minimum
  ) {
    throw new Error(`${label} must be a safe integer greater than or equal to ${minimum}`);
  }
  return value;
}

function requireSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function expectedNamespace(query: BandoriCutoffHistoryQuery): "events" | "monthly" {
  return query.type === "monthly" ? "monthly" : "events";
}

function requireCanonicalKey(value: string, pattern: RegExp, label: string): number {
  if (!pattern.test(value)) {
    throw new Error(`${label} is invalid: ${value}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} is outside the supported integer range: ${value}`);
  }
  return parsed;
}

export function bandoriCutoffHistoryMonthIdToPeriod(
  monthId: number,
  server: BandoriServerCode = "cn",
): string {
  requireSafeInteger(monthId, "Bandori cutoff history month ID", 1);
  return bandoriMonthlyRankingIdToPeriod(server, monthId);
}

export function buildBandoriCutoffHistoryTargetPrefix(query: BandoriCutoffHistoryQuery): string {
  if (query.type === "monthly") {
    return `${BANDORI_CUTOFF_HISTORY_PREFIX}/monthly/${bandoriCutoffHistoryMonthIdToPeriod(query.targetId, query.server)}/${query.server}`;
  }
  return `${BANDORI_CUTOFF_HISTORY_PREFIX}/events/${query.targetId}/${query.server}`;
}

export function buildBandoriCutoffHistoryManifestKey(query: BandoriCutoffHistoryQuery): string {
  return `${buildBandoriCutoffHistoryTargetPrefix(query)}/manifest.json`;
}

function parsePackDescriptor(
  value: unknown,
  query: BandoriCutoffHistoryQuery,
  kind: BandoriCutoffHistoryType,
): BandoriCutoffHistoryPackDescriptor {
  const descriptor = requireRecord(value, "Bandori cutoff history pack descriptor");
  const semanticSha256 = requireSha256(
    descriptor.semanticSha256,
    "Bandori cutoff history semantic hash",
  );
  const compressedSha256 = requireSha256(
    descriptor.compressedSha256,
    "Bandori cutoff history compressed hash",
  );
  const expectedKey = `${buildBandoriCutoffHistoryTargetPrefix(query)}/packs/${kind}/${compressedSha256}.json.gz`;
  if (descriptor.key !== expectedKey) {
    throw new Error("Bandori cutoff history pack key does not match the requested target");
  }
  const compressedSize = requireSafeInteger(
    descriptor.compressedSize,
    "Bandori cutoff history compressed size",
    1,
  );
  if (compressedSize > BANDORI_CUTOFF_HISTORY_MAX_COMPRESSED_BYTES) {
    throw new Error("Bandori cutoff history pack exceeds the compressed size limit");
  }
  const recordCount = requireSafeInteger(
    descriptor.recordCount,
    "Bandori cutoff history record count",
    1,
  );
  if (recordCount > BANDORI_CUTOFF_HISTORY_MAX_PACK_RECORDS) {
    throw new Error("Bandori cutoff history pack exceeds the record limit");
  }
  const tierCount = requireSafeInteger(
    descriptor.tierCount,
    "Bandori cutoff history tier count",
    1,
  );
  if (typeof descriptor.hasFinalPoint !== "boolean") {
    throw new Error("Bandori cutoff history final-point summary must be boolean");
  }
  return {
    key: expectedKey,
    semanticSha256,
    compressedSha256,
    compressedSize,
    recordCount,
    tierCount,
    hasFinalPoint: descriptor.hasFinalPoint,
  };
}

export function parseBandoriCutoffHistoryManifest(
  value: unknown,
  query: BandoriCutoffHistoryQuery,
): BandoriCutoffHistoryManifestSelection {
  const manifest = requireRecord(value, "Bandori cutoff history manifest");
  if (manifest.schemaVersion !== BANDORI_CUTOFF_HISTORY_SCHEMA_VERSION) {
    throw new Error("Unsupported Bandori cutoff history manifest schema");
  }
  if (manifest.kind !== expectedNamespace(query) || manifest.server !== query.server) {
    throw new Error("Bandori cutoff history manifest identity mismatch");
  }
  if (manifest.preserveIrregularPoints !== true) {
    throw new Error("Bandori cutoff history manifest must preserve irregular points");
  }
  if (typeof manifest.hasFinalPoint !== "boolean") {
    throw new Error("Bandori cutoff history manifest final-point summary must be boolean");
  }
  if (query.type === "monthly") {
    const expectedPeriod = bandoriCutoffHistoryMonthIdToPeriod(query.targetId, query.server);
    if (manifest.period !== expectedPeriod || manifest.sourceMonthId !== query.targetId) {
      throw new Error("Bandori cutoff history monthly manifest identity mismatch");
    }
  } else if (manifest.eventId !== query.targetId) {
    throw new Error("Bandori cutoff history event manifest identity mismatch");
  }

  const generation = requireSafeInteger(
    manifest.generation,
    "Bandori cutoff history generation",
    1,
  );
  if (
    typeof manifest.publishedAt !== "string"
    || !TIMEZONE_SUFFIX_PATTERN.test(manifest.publishedAt)
    || !Number.isFinite(Date.parse(manifest.publishedAt))
  ) {
    throw new Error("Bandori cutoff history publishedAt is invalid");
  }
  const packs = requireNonemptyRecord(manifest.packs, "Bandori cutoff history manifest packs");
  const allowedKinds: readonly BandoriCutoffHistoryType[] = query.type === "monthly"
    ? ["monthly"]
    : ["event", "song"];
  const descriptors = new Map<BandoriCutoffHistoryType, BandoriCutoffHistoryPackDescriptor>();
  for (const [kind, descriptorValue] of Object.entries(packs)) {
    if (!allowedKinds.includes(kind as BandoriCutoffHistoryType)) {
      throw new Error(`Bandori cutoff history manifest pack kind is invalid: ${kind}`);
    }
    const typedKind = kind as BandoriCutoffHistoryType;
    descriptors.set(typedKind, parsePackDescriptor(descriptorValue, query, typedKind));
  }
  const hasFinalPoint = Array.from(descriptors.values()).some((descriptor) => descriptor.hasFinalPoint);
  if (manifest.hasFinalPoint !== hasFinalPoint) {
    throw new Error("Bandori cutoff history manifest final-point summary mismatch");
  }
  return {
    generation,
    publishedAt: manifest.publishedAt,
    descriptor: descriptors.get(query.type) ?? null,
  };
}

function parsePoints(
  value: unknown,
  label: string,
  maximumPoints: number,
): { points: BandoriCutoffHistoryPoint[]; hasFinalPoint: boolean } {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a nonempty array`);
  }
  if (value.length > maximumPoints) {
    throw new Error("Bandori cutoff history pack exceeds the record limit");
  }
  const points: BandoriCutoffHistoryPoint[] = [];
  let previousTime = -1;
  let hasFinalPoint = false;
  for (const item of value) {
    if (!Array.isArray(item) || (item.length !== 2 && item.length !== 3)) {
      throw new Error(`${label} point must have two or three items`);
    }
    const time = requireSafeInteger(item[0], `${label} time`, 1);
    const ep = requireSafeInteger(item[1], `${label} EP`, 1);
    if (time <= previousTime) {
      throw new Error(`${label} times must be strictly increasing`);
    }
    previousTime = time;
    let flags = 0;
    if (item.length === 3) {
      flags = requireSafeInteger(item[2], `${label} flags`, 1);
    }
    const point: BandoriCutoffHistoryPoint = { time, ep };
    if ((flags & 1) === 1) {
      point.isFinal = true;
      hasFinalPoint = true;
    }
    points.push(point);
  }
  return { points, hasFinalPoint };
}

function validatePackIdentity(
  payload: Record<string, unknown>,
  query: BandoriCutoffHistoryQuery,
): void {
  if (payload.schemaVersion !== BANDORI_CUTOFF_HISTORY_SCHEMA_VERSION) {
    throw new Error("Unsupported Bandori cutoff history pack schema");
  }
  if (payload.kind !== query.type || payload.server !== query.server) {
    throw new Error("Bandori cutoff history pack identity mismatch");
  }
  if (query.type === "monthly") {
    const expectedPeriod = bandoriCutoffHistoryMonthIdToPeriod(query.targetId, query.server);
    if (payload.period !== expectedPeriod || payload.sourceMonthId !== query.targetId) {
      throw new Error("Bandori cutoff history monthly pack identity mismatch");
    }
  } else if (payload.eventId !== query.targetId) {
    throw new Error("Bandori cutoff history event pack identity mismatch");
  }
}

export function parseBandoriCutoffHistoryPack(
  value: unknown,
  query: BandoriCutoffHistoryQuery,
  descriptor: BandoriCutoffHistoryPackDescriptor,
): ParsedBandoriCutoffHistoryPack {
  const payload = requireRecord(value, "Bandori cutoff history pack");
  validatePackIdentity(payload, query);
  const tiersValue = requireNonemptyRecord(payload.tiers, "Bandori cutoff history tiers");
  const tierEntries = Object.entries(tiersValue);
  if (tierEntries.length !== descriptor.tierCount) {
    throw new Error("Bandori cutoff history tier count mismatch");
  }
  let recordCount = 0;
  let hasFinalPoint = false;

  let parsed: ParsedBandoriCutoffHistoryPack;
  if (query.type === "song") {
    const tiers = new Map<number, Map<number, BandoriCutoffHistoryPoint[]>>();
    for (const [tierKey, songsValue] of tierEntries) {
      const tier = requireCanonicalKey(tierKey, POSITIVE_INTEGER_KEY_PATTERN, "Bandori cutoff history tier");
      const songsRecord = requireNonemptyRecord(
        songsValue,
        `Bandori cutoff history tier ${tier} songs`,
      );
      const songs = new Map<number, BandoriCutoffHistoryPoint[]>();
      const sortedSongEntries = Object.entries(songsRecord).sort(
        ([left], [right]) => Number(left) - Number(right),
      );
      for (const [songKey, pointsValue] of sortedSongEntries) {
        const songId = requireCanonicalKey(
          songKey,
          NONNEGATIVE_INTEGER_KEY_PATTERN,
          "Bandori cutoff history song ID",
        );
        const result = parsePoints(
          pointsValue,
          `Bandori cutoff history tier ${tier} song ${songId}`,
          BANDORI_CUTOFF_HISTORY_MAX_PACK_RECORDS - recordCount,
        );
        recordCount += result.points.length;
        hasFinalPoint ||= result.hasFinalPoint;
        songs.set(songId, result.points);
      }
      tiers.set(tier, songs);
    }
    parsed = { kind: "song", tiers };
  } else {
    const tiers = new Map<number, BandoriCutoffHistoryPoint[]>();
    for (const [tierKey, pointsValue] of tierEntries) {
      const tier = requireCanonicalKey(tierKey, POSITIVE_INTEGER_KEY_PATTERN, "Bandori cutoff history tier");
      const result = parsePoints(
        pointsValue,
        `Bandori cutoff history tier ${tier}`,
        BANDORI_CUTOFF_HISTORY_MAX_PACK_RECORDS - recordCount,
      );
      recordCount += result.points.length;
      hasFinalPoint ||= result.hasFinalPoint;
      tiers.set(tier, result.points);
    }
    parsed = { kind: query.type, tiers };
  }

  if (recordCount !== descriptor.recordCount) {
    throw new Error("Bandori cutoff history record count mismatch");
  }
  if (hasFinalPoint !== descriptor.hasFinalPoint) {
    throw new Error("Bandori cutoff history final-point summary mismatch");
  }
  return parsed;
}

export function selectBandoriCutoffHistoryCutoffs(
  pack: ParsedBandoriCutoffHistoryPack,
  tier: number,
): BandoriCutoffHistoryCutoffs {
  if (pack.kind !== "song") {
    return (pack.tiers.get(tier) ?? []).slice(0, BANDORI_CUTOFF_HISTORY_MAX_ROWS);
  }

  const songs = pack.tiers.get(tier);
  if (!songs) {
    return [];
  }
  const selected: Array<[number, BandoriCutoffHistoryPoint[]]> = [];
  let remaining = BANDORI_CUTOFF_HISTORY_MAX_ROWS;
  for (const [songId, points] of Array.from(songs.entries()).sort(([left], [right]) => left - right)) {
    if (remaining === 0) break;
    const cutoffs = points.slice(0, remaining);
    remaining -= cutoffs.length;
    if (cutoffs.length > 0) {
      selected.push([songId, cutoffs]);
    }
  }
  if (selected.length === 0) {
    return [];
  }
  if (selected.length === 1 && selected[0][0] === 0) {
    return selected[0][1];
  }
  return Object.fromEntries(selected.map(([songId, cutoffs]) => [String(songId), cutoffs]));
}
