import type { OurNotesSourceServer } from "../master-contract";

export const OURNOTES_TRACKER_SERVERS = { 0: "jp", 1: "en", 2: "tw", 4: "kr" } as const;
export const OURNOTES_TRACKER_TIERS = [100, 101, 1000, 5000, 10000, 20000, 30000, 50000, 100000] as const;
export const OURNOTES_TRACKER_MAX_MANIFEST_BYTES = 64 * 1024;
export const OURNOTES_TRACKER_MAX_COMPRESSED_BYTES = 2 * 1024 * 1024;
export const OURNOTES_TRACKER_MAX_JSON_BYTES = 16 * 1024 * 1024;
export const OURNOTES_TRACKER_MAX_RECORDS = 200_000;
export const OURNOTES_TRACKER_MAX_ROWS = 5_000;
export const OURNOTES_TOPDATA_MAX_RECORDS = 20_000;

export type OurNotesTrackerKind = "data" | "topdata";
export type OurNotesTrackerTarget = { kind: OurNotesTrackerKind; server: OurNotesSourceServer; eventId: number };
export type OurNotesCutoffPoint = { time: number; value: number };
export type OurNotesTopDataPoint = OurNotesCutoffPoint & { id: string };
export type OurNotesTopDataUser = {
  id: string; profileId: number; name: string; rankExp: number;
  lastUpdatedAt: number; favoriteMemberCardMasterId: number;
};
export type OurNotesTrackerPack =
  | { kind: "data"; tiers: Map<number, OurNotesCutoffPoint[]> }
  | { kind: "topdata"; points: OurNotesTopDataPoint[]; users: OurNotesTopDataUser[] };
export type OurNotesTrackerDescriptor = OurNotesTrackerTarget & {
  key: string; semanticSha256: string; compressedSha256: string; compressedSize: number;
} & (
  | { kind: "data"; recordCount: number; tierCount: number }
  | { kind: "topdata"; pointCount: number; userCount: number; sampleCount: number }
);
export type OurNotesTrackerManifest = {
  generation: number; publishedAt: string; descriptor: OurNotesTrackerDescriptor;
};

function requireArtifact(condition: unknown): asserts condition {
  if (!condition) throw new Error("Invalid OurNotes tracker artifact");
}
function record(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  requireArtifact(value !== null && typeof value === "object" && !Array.isArray(value));
  const row = value as Record<string, unknown>;
  if (keys) requireArtifact(Object.keys(row).length === keys.length && keys.every((key) => Object.hasOwn(row, key)));
  return row;
}
function integer(value: unknown, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER): number {
  requireArtifact(typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum);
  return value;
}
function text(value: unknown): string {
  requireArtifact(typeof value === "string");
  return value;
}
function hash(value: unknown): string {
  const result = text(value);
  requireArtifact(/^[a-f0-9]{64}$/u.test(result));
  return result;
}
export function ourNotesTrackerPrefix(target: OurNotesTrackerTarget): string {
  return `ournotes/trackerdata/${target.kind === "topdata" ? "topdata/" : ""}events/${target.eventId}/${target.server}`;
}

export function parseOurNotesTrackerManifest(value: unknown, target: OurNotesTrackerTarget): OurNotesTrackerManifest {
  const top = target.kind === "topdata";
  const row = record(value, ["schemaVersion", "kind", "server", "eventId", "generation", "publishedAt", "recentPackKeys",
    ...(top ? ["pack"] : ["preserveIrregularPoints", "packs"])]);
  requireArtifact(row.schemaVersion === 1 && row.kind === (top ? "eventTop10" : "events")
    && row.server === target.server && row.eventId === target.eventId);
  const generation = integer(row.generation, 1);
  const publishedAt = text(row.publishedAt);
  requireArtifact(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(publishedAt) && Number.isFinite(Date.parse(publishedAt)));
  if (!top) requireArtifact(row.preserveIrregularPoints === true);
  const raw = record(top ? row.pack : record(row.packs, ["event"]).event,
    ["key", "semanticSha256", "compressedSha256", "compressedSize", ...(top ? ["pointCount", "userCount", "sampleCount"] : ["recordCount", "tierCount"])]);
  const prefix = `${ourNotesTrackerPrefix(target)}/packs/event/`;
  const compressedSha256 = hash(raw.compressedSha256);
  const key = `${prefix}${compressedSha256}.json.gz`;
  requireArtifact(raw.key === key);
  const common = { server: target.server, eventId: target.eventId, key, compressedSha256,
    semanticSha256: hash(raw.semanticSha256), compressedSize: integer(raw.compressedSize, 1, OURNOTES_TRACKER_MAX_COMPRESSED_BYTES) };
  let descriptor: OurNotesTrackerDescriptor;
  if (top) {
    const pointCount = integer(raw.pointCount, 1, OURNOTES_TOPDATA_MAX_RECORDS);
    const userCount = integer(raw.userCount, 1, OURNOTES_TOPDATA_MAX_RECORDS);
    const sampleCount = integer(raw.sampleCount, 1, pointCount);
    requireArtifact(pointCount <= sampleCount * 11 && userCount <= pointCount);
    descriptor = { ...common, kind: "topdata", pointCount, userCount, sampleCount };
  } else {
    const recordCount = integer(raw.recordCount, 1, OURNOTES_TRACKER_MAX_RECORDS);
    descriptor = { ...common, kind: "data", recordCount, tierCount: integer(raw.tierCount, 1, OURNOTES_TRACKER_TIERS.length) };
    requireArtifact(descriptor.tierCount <= recordCount);
  }
  const recent = top ? row.recentPackKeys : record(row.recentPackKeys, ["event"]).event;
  requireArtifact(Array.isArray(recent) && recent.length >= 1 && recent.length <= 8
    && recent[0] === key && new Set(recent).size === recent.length);
  for (const item of recent) {
    requireArtifact(typeof item === "string" && item.startsWith(prefix) && /^[a-f0-9]{64}\.json\.gz$/u.test(item.slice(prefix.length)));
  }
  return { generation, publishedAt, descriptor };
}

export function parseOurNotesTrackerPack(value: unknown, descriptor: OurNotesTrackerDescriptor): OurNotesTrackerPack {
  if (descriptor.kind === "data") {
    const row = record(value, ["schemaVersion", "kind", "server", "eventId", "tiers"]);
    requireArtifact(row.schemaVersion === 1 && row.kind === "event" && row.server === descriptor.server && row.eventId === descriptor.eventId);
    const entries = Object.entries(record(row.tiers));
    requireArtifact(entries.length === descriptor.tierCount);
    const tiers = new Map<number, OurNotesCutoffPoint[]>();
    let count = 0;
    for (const [key, items] of entries) {
      const tier = Number(key);
      requireArtifact(String(tier) === key && OURNOTES_TRACKER_TIERS.some((supported) => supported === tier));
      requireArtifact(Array.isArray(items) && items.length > 0);
      count += items.length;
      requireArtifact(count <= OURNOTES_TRACKER_MAX_RECORDS);
      let previous = -1;
      tiers.set(tier, items.map((item) => {
        requireArtifact(Array.isArray(item) && item.length === 2);
        const time = integer(item[0], 0);
        requireArtifact(time > previous);
        previous = time;
        return { time, value: integer(item[1]) };
      }));
    }
    requireArtifact(count === descriptor.recordCount);
    return { kind: "data", tiers };
  }

  const row = record(value, ["points", "users"]);
  requireArtifact(Array.isArray(row.points) && row.points.length === descriptor.pointCount
    && Array.isArray(row.users) && row.users.length === descriptor.userCount);
  const referenced = new Set<string>();
  const sampleIds = new Set<string>();
  let previousTime = -1;
  let sampleCount = 0;
  const points = row.points.map((item) => {
    const point = record(item, ["time", "id", "value"]);
    const time = integer(point.time, 0);
    const id = text(point.id);
    requireArtifact(id.length > 0 && time >= previousTime);
    if (time !== previousTime) {
      sampleCount++;
      sampleIds.clear();
      previousTime = time;
    }
    requireArtifact(sampleIds.size < 11 && !sampleIds.has(id));
    sampleIds.add(id);
    referenced.add(id);
    return { time, id, value: integer(point.value) };
  });
  requireArtifact(sampleCount === descriptor.sampleCount);
  let previousId: string | undefined;
  const users = row.users.map((item) => {
    const user = record(item, ["id", "profile_id", "name", "rank_exp", "last_updated_at", "favorite_member_card_master_id"]);
    const id = text(user.id);
    requireArtifact(id.length > 0 && (previousId === undefined || id > previousId) && referenced.delete(id));
    previousId = id;
    return { id, profileId: integer(user.profile_id), name: text(user.name),
      rankExp: integer(user.rank_exp, -2_147_483_648, 2_147_483_647), lastUpdatedAt: integer(user.last_updated_at),
      favoriteMemberCardMasterId: integer(user.favorite_member_card_master_id) };
  });
  requireArtifact(referenced.size === 0);
  return { kind: "topdata", points, users };
}
