import {
  BANDORI_TOPDATA_SCHEMA_VERSION,
  parseBandoriTopDataPayload,
  requireBandoriTopDataSafeInteger,
  type BandoriTopDataPayload,
} from "@/lib/bandori-topdata-contract";

export const BANDORI_TRACKER_TOPDATA_LIVE_EVENT = "topdata_snapshot";

export type BandoriTrackerTopDataLiveSnapshot = BandoriTopDataPayload & {
  schemaVersion: 1;
  server: "cn";
  namespace: "events";
  targetId: number;
  revision: number;
  sampleId: string;
  publishedAt: number;
};

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

export function buildBandoriTrackerTopDataLiveTopic(eventId: number): string {
  requireBandoriTopDataSafeInteger(eventId, "Bandori tracker topdata live event ID", 1);
  if (eventId > 2_147_483_647) {
    throw new Error("Bandori tracker topdata live event ID is too large");
  }
  return `bandori:topdata:cn:events:${eventId}`;
}

export function parseBandoriTrackerTopDataLiveSnapshot(
  value: unknown,
): BandoriTrackerTopDataLiveSnapshot {
  const snapshot = requireRecord(value, "Bandori tracker topdata live snapshot");
  const expectedKeys = new Set([
    "schemaVersion",
    "server",
    "namespace",
    "targetId",
    "revision",
    "sampleId",
    "publishedAt",
    "points",
    "users",
  ]);
  if (
    Object.keys(snapshot).length !== expectedKeys.size
    || Object.keys(snapshot).some((key) => !expectedKeys.has(key))
    || snapshot.schemaVersion !== BANDORI_TOPDATA_SCHEMA_VERSION
    || snapshot.server !== "cn"
    || snapshot.namespace !== "events"
  ) {
    throw new Error("Bandori tracker topdata live snapshot identity is invalid");
  }
  const targetId = requireBandoriTopDataSafeInteger(
    snapshot.targetId,
    "Bandori tracker topdata targetId",
    1,
  );
  if (targetId > 2_147_483_647) {
    throw new Error("Bandori tracker topdata targetId is too large");
  }
  const revision = requireBandoriTopDataSafeInteger(
    snapshot.revision,
    "Bandori tracker topdata revision",
    1,
  );
  const publishedAt = requireBandoriTopDataSafeInteger(
    snapshot.publishedAt,
    "Bandori tracker topdata publishedAt",
    1,
  );
  const expectedSampleId = `cn:topdata:events:${targetId}:${publishedAt}`;
  if (snapshot.sampleId !== expectedSampleId) {
    throw new Error("Bandori tracker topdata live sampleId is invalid");
  }
  const payload = parseBandoriTopDataPayload({
    points: snapshot.points,
    users: snapshot.users,
  });
  if (
    payload.points.length < 1
    || payload.points.length > 10
    || payload.users.length !== payload.points.length
    || payload.points.some((point) => point.time !== publishedAt)
  ) {
    throw new Error("Bandori tracker topdata live snapshot must contain one complete current sample");
  }
  return {
    schemaVersion: 1,
    server: "cn",
    namespace: "events",
    targetId,
    revision,
    sampleId: expectedSampleId,
    publishedAt,
    ...payload,
  };
}

export function mergeBandoriTrackerTopDataLiveSnapshots(
  current: BandoriTrackerTopDataLiveSnapshot | null,
  incoming: BandoriTrackerTopDataLiveSnapshot,
): BandoriTrackerTopDataLiveSnapshot {
  if (!current) return incoming;
  if (current.targetId !== incoming.targetId) {
    throw new Error("Cannot merge Bandori tracker topdata snapshots for different targets");
  }
  if (incoming.revision < current.revision) return current;
  if (incoming.revision === current.revision) {
    if (JSON.stringify(incoming) !== JSON.stringify(current)) {
      throw new Error("Conflicting Bandori tracker topdata snapshots share one revision");
    }
    return current;
  }
  return incoming;
}

export function mergeBandoriTopDataHistoryWithLiveSnapshot(
  history: BandoriTopDataPayload | null,
  liveSnapshot: BandoriTrackerTopDataLiveSnapshot,
): BandoriTopDataPayload {
  if (!history || history.points.length === 0) {
    return {
      points: liveSnapshot.points,
      users: liveSnapshot.users,
    };
  }
  const lastHistoryTime = history.points.at(-1)!.time;
  if (liveSnapshot.publishedAt < lastHistoryTime) {
    return history;
  }

  const retainedPoints = history.points.filter(
    (point) => point.time < liveSnapshot.publishedAt,
  );
  const points = [...retainedPoints, ...liveSnapshot.points];
  const usersByUid = new Map(
    history.users.map((user) => [user.uid, user]),
  );
  for (const user of liveSnapshot.users) usersByUid.set(user.uid, user);
  if (liveSnapshot.publishedAt === lastHistoryTime) {
    const referencedUids = new Set(points.map((point) => point.uid));
    for (const uid of usersByUid.keys()) {
      if (!referencedUids.has(uid)) usersByUid.delete(uid);
    }
  }

  return {
    points,
    users: Array.from(usersByUid.values())
      .sort((left, right) => left.uid - right.uid),
  };
}
