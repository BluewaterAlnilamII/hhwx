export const BANDORI_TRACKER_LIVE_SCHEMA_VERSION = 1;
export const BANDORI_TRACKER_LIVE_EVENT = "cutoff_snapshot";

export type BandoriTrackerLiveServer = "jp" | "en" | "tw" | "cn";
export type BandoriTrackerLiveNamespace = "events" | "monthly";

export type BandoriTrackerLiveTarget = {
  server: BandoriTrackerLiveServer;
  namespace: BandoriTrackerLiveNamespace;
  targetId: number;
  period?: string;
};

export type BandoriTrackerLivePoint = {
  tier: number;
  time: number;
  ep: number;
  isFinal?: true;
};

export type BandoriTrackerLiveSongPoint = BandoriTrackerLivePoint & {
  songId: number;
};

export type BandoriTrackerLiveSnapshot = BandoriTrackerLiveTarget & {
  schemaVersion: 1;
  revision: number;
  sampleId: string;
  publishedAt: number;
  event: BandoriTrackerLivePoint[];
  songs: BandoriTrackerLiveSongPoint[];
  monthly: BandoriTrackerLivePoint[];
};

const SUPPORTED_SERVERS = new Set<BandoriTrackerLiveServer>(["jp", "en", "tw", "cn"]);
const MONTH_PERIOD_PATTERN = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function parseFlags(value: unknown): true | undefined {
  if (value === undefined) return undefined;
  if (!isPositiveInteger(value)) {
    throw new Error("tracker live flags must be a positive integer when present");
  }
  return (value & 1) === 1 ? true : undefined;
}

function parsePoint(value: unknown): BandoriTrackerLivePoint {
  if (!Array.isArray(value) || (value.length !== 3 && value.length !== 4)) {
    throw new Error("tracker live event/monthly point must have three or four items");
  }
  const [tier, time, ep, flags] = value;
  if (!isPositiveInteger(tier) || !isPositiveInteger(time) || !isPositiveInteger(ep)) {
    throw new Error("tracker live point values must be positive integers");
  }
  const isFinal = parseFlags(flags);
  return { tier, time, ep, ...(isFinal ? { isFinal } : {}) };
}

function parseSongPoint(value: unknown): BandoriTrackerLiveSongPoint {
  if (!Array.isArray(value) || (value.length !== 4 && value.length !== 5)) {
    throw new Error("tracker live song point must have four or five items");
  }
  const [songId, tier, time, ep, flags] = value;
  if (
    !isPositiveInteger(songId)
    || !isPositiveInteger(tier)
    || !isPositiveInteger(time)
    || !isPositiveInteger(ep)
  ) {
    throw new Error("tracker live song point values must be positive integers");
  }
  const isFinal = parseFlags(flags);
  return { songId, tier, time, ep, ...(isFinal ? { isFinal } : {}) };
}

function parsePointArray(
  value: unknown,
  parser: (point: unknown) => BandoriTrackerLivePoint,
  keyForPoint: (point: BandoriTrackerLivePoint) => string,
): BandoriTrackerLivePoint[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("tracker live points section must be an array");

  const seen = new Set<string>();
  return value.map((rawPoint) => {
    const point = parser(rawPoint);
    const key = keyForPoint(point);
    if (seen.has(key)) throw new Error(`tracker live points contain duplicate key: ${key}`);
    seen.add(key);
    return point;
  });
}

export function buildBandoriTrackerLiveTopic(target: BandoriTrackerLiveTarget): string {
  if (!SUPPORTED_SERVERS.has(target.server)) throw new Error(`unsupported tracker live server: ${target.server}`);
  if (!isPositiveInteger(target.targetId) && !(target.namespace === "monthly" && target.targetId === 0)) {
    throw new Error(`invalid tracker live target id: ${target.targetId}`);
  }

  if (target.namespace === "events") {
    return `bandori:cutoff:${target.server}:events:${target.targetId}`;
  }
  if (!target.period || !MONTH_PERIOD_PATTERN.test(target.period)) {
    throw new Error(`invalid tracker live monthly period: ${target.period ?? ""}`);
  }
  return `bandori:cutoff:${target.server}:monthly:${target.period}`;
}

export function bandoriTrackerMonthIdToPeriod(monthId: number): string {
  if (!Number.isInteger(monthId) || monthId < 0) {
    throw new Error(`invalid tracker live month id: ${monthId}`);
  }
  const year = 2025 + Math.floor(monthId / 12);
  const month = monthId % 12 + 1;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}`;
}

export function parseBandoriTrackerLiveSnapshot(
  value: unknown,
  expectedTarget?: BandoriTrackerLiveTarget,
): BandoriTrackerLiveSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("tracker live snapshot must be an object");
  }
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== BANDORI_TRACKER_LIVE_SCHEMA_VERSION) {
    throw new Error(`unsupported tracker live schema version: ${String(raw.schemaVersion)}`);
  }
  if (typeof raw.server !== "string" || !SUPPORTED_SERVERS.has(raw.server as BandoriTrackerLiveServer)) {
    throw new Error(`unsupported tracker live server: ${String(raw.server)}`);
  }
  if (raw.namespace !== "events" && raw.namespace !== "monthly") {
    throw new Error(`unsupported tracker live namespace: ${String(raw.namespace)}`);
  }
  if (!isPositiveInteger(raw.targetId) && !(raw.namespace === "monthly" && raw.targetId === 0)) {
    throw new Error(`invalid tracker live target id: ${String(raw.targetId)}`);
  }
  if (!isPositiveInteger(raw.revision) || !isPositiveInteger(raw.publishedAt)) {
    throw new Error("tracker live revision and publishedAt must be positive integers");
  }

  const target: BandoriTrackerLiveTarget = {
    server: raw.server as BandoriTrackerLiveServer,
    namespace: raw.namespace,
    targetId: raw.targetId,
    ...(raw.namespace === "monthly" && typeof raw.period === "string" ? { period: raw.period } : {}),
  };
  if (raw.namespace === "events" && raw.period !== undefined) {
    throw new Error("event tracker live snapshot must not contain period");
  }
  buildBandoriTrackerLiveTopic(target);

  const expectedSampleId = `${target.server}:${target.namespace}:${target.targetId}:${raw.publishedAt}`;
  if (raw.sampleId !== expectedSampleId) {
    throw new Error(`invalid tracker live sampleId: ${String(raw.sampleId)}`);
  }
  if (expectedTarget && buildBandoriTrackerLiveTopic(target) !== buildBandoriTrackerLiveTopic(expectedTarget)) {
    throw new Error("tracker live snapshot target does not match the subscription");
  }

  const event = parsePointArray(raw.event, parsePoint, (point) => String(point.tier));
  const songs = parsePointArray(
    raw.songs,
    parseSongPoint,
    (point) => `${(point as BandoriTrackerLiveSongPoint).songId}:${point.tier}`,
  ) as BandoriTrackerLiveSongPoint[];
  const monthly = parsePointArray(raw.monthly, parsePoint, (point) => String(point.tier));
  const eventIsSorted = event.every((point, index) => index === 0 || event[index - 1].tier < point.tier);
  const songsAreSorted = songs.every((point, index) => (
    index === 0
    || songs[index - 1].tier < point.tier
    || (songs[index - 1].tier === point.tier && songs[index - 1].songId < point.songId)
  ));
  const monthlyIsSorted = monthly.every((point, index) => index === 0 || monthly[index - 1].tier < point.tier);
  if (!eventIsSorted || !songsAreSorted || !monthlyIsSorted) {
    throw new Error("tracker live points must use canonical tier/song ordering");
  }
  const newestPointTime = Math.max(
    0,
    ...event.map((point) => point.time),
    ...songs.map((point) => point.time),
    ...monthly.map((point) => point.time),
  );
  if (newestPointTime > raw.publishedAt) {
    throw new Error("tracker live point time cannot exceed publishedAt");
  }

  if (target.namespace === "events") {
    if (monthly.length > 0 || (event.length === 0 && songs.length === 0)) {
      throw new Error("event tracker live snapshot has invalid sections");
    }
  } else if (event.length > 0 || songs.length > 0 || monthly.length === 0) {
    throw new Error("monthly tracker live snapshot has invalid sections");
  }

  return {
    schemaVersion: BANDORI_TRACKER_LIVE_SCHEMA_VERSION,
    ...target,
    revision: raw.revision,
    sampleId: expectedSampleId,
    publishedAt: raw.publishedAt,
    event,
    songs,
    monthly,
  };
}

export function mergeBandoriTrackerLiveSnapshots(
  current: BandoriTrackerLiveSnapshot | null,
  incoming: BandoriTrackerLiveSnapshot,
): BandoriTrackerLiveSnapshot {
  if (!current) return incoming;
  if (buildBandoriTrackerLiveTopic(current) !== buildBandoriTrackerLiveTopic(incoming)) {
    throw new Error("cannot merge tracker live snapshots from different topics");
  }
  if (incoming.revision === current.revision) {
    if (JSON.stringify(incoming) !== JSON.stringify(current)) {
      throw new Error("tracker live snapshots conflict at the same revision");
    }
    return current;
  }
  return incoming.revision > current.revision ? incoming : current;
}
