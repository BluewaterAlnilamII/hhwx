export const BANDORI_TOPDATA_SCHEMA_VERSION = 1;
export const BANDORI_TOPDATA_MAX_POINTS = 20_000;
export const BANDORI_TOPDATA_MAX_USERS = 20_000;

export type BandoriTopDataPoint = {
  time: number;
  uid: number;
  value: number;
};

export type BandoriTopDataUser = {
  uid: number;
  name: string;
  introduction: string;
  rank: number;
  sid: number;
  strained: 0 | 1;
  degrees: number[];
};

export type BandoriTopDataPayload = {
  points: BandoriTopDataPoint[];
  users: BandoriTopDataUser[];
};

function groupBandoriTopDataPoints(
  points: readonly BandoriTopDataPoint[],
): BandoriTopDataPoint[][] {
  const groups: BandoriTopDataPoint[][] = [];
  let previousTime = 0;
  for (const point of points) {
    const currentGroup = groups.at(-1);
    if (!currentGroup || point.time !== currentGroup[0].time) {
      if (point.time <= previousTime) {
        throw new Error("Bandori topdata sample times must be strictly increasing");
      }
      groups.push([]);
      previousTime = point.time;
    }
    const group = groups.at(-1)!;
    group.push(point);
    if (group.length > 10) {
      throw new Error("Bandori topdata samples must contain between one and ten points");
    }
  }
  return groups;
}

export function countBandoriTopDataSamples(
  points: readonly BandoriTopDataPoint[],
): number {
  return groupBandoriTopDataPoints(points).length;
}

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

export function requireBandoriTopDataSafeInteger(
  value: unknown,
  label: string,
  minimum: number,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be a safe integer >= ${minimum}`);
  }
  return value as number;
}

function parsePoint(value: unknown, index: number): BandoriTopDataPoint {
  const point = requireRecord(value, `Bandori topdata point ${index}`);
  requireExactKeys(point, ["time", "uid", "value"], `Bandori topdata point ${index}`);
  return {
    time: requireBandoriTopDataSafeInteger(point.time, `Bandori topdata point ${index} time`, 1),
    uid: requireBandoriTopDataSafeInteger(point.uid, `Bandori topdata point ${index} uid`, 1),
    value: requireBandoriTopDataSafeInteger(point.value, `Bandori topdata point ${index} value`, 1),
  };
}

function parseUser(value: unknown, index: number): BandoriTopDataUser {
  const user = requireRecord(value, `Bandori topdata user ${index}`);
  requireExactKeys(
    user,
    ["uid", "name", "introduction", "rank", "sid", "strained", "degrees"],
    `Bandori topdata user ${index}`,
  );
  if (typeof user.name !== "string" || typeof user.introduction !== "string") {
    throw new Error(`Bandori topdata user ${index} text fields are invalid`);
  }
  if (user.strained !== 0 && user.strained !== 1) {
    throw new Error(`Bandori topdata user ${index} strained must be 0 or 1`);
  }
  if (!Array.isArray(user.degrees) || user.degrees.length > 2) {
    throw new Error(`Bandori topdata user ${index} degrees must contain at most two entries`);
  }
  return {
    uid: requireBandoriTopDataSafeInteger(user.uid, `Bandori topdata user ${index} uid`, 1),
    name: user.name,
    introduction: user.introduction,
    rank: requireBandoriTopDataSafeInteger(user.rank, `Bandori topdata user ${index} rank`, 1),
    sid: requireBandoriTopDataSafeInteger(user.sid, `Bandori topdata user ${index} sid`, 0),
    strained: user.strained,
    degrees: user.degrees.map((degree, degreeIndex) => requireBandoriTopDataSafeInteger(
      degree,
      `Bandori topdata user ${index} degree ${degreeIndex}`,
      1,
    )),
  };
}

export function parseBandoriTopDataPayload(value: unknown): BandoriTopDataPayload {
  const payload = requireRecord(value, "Bandori topdata payload");
  requireExactKeys(payload, ["points", "users"], "Bandori topdata payload");
  if (!Array.isArray(payload.points) || !Array.isArray(payload.users)) {
    throw new Error("Bandori topdata points and users must be arrays");
  }
  if (
    payload.points.length > BANDORI_TOPDATA_MAX_POINTS
    || payload.users.length > BANDORI_TOPDATA_MAX_USERS
  ) {
    throw new Error("Bandori topdata payload exceeds complete history limits");
  }

  const points = payload.points.map(parsePoint);
  const referencedUids = new Set<number>();
  for (const group of groupBandoriTopDataPoints(points)) {
    const time = group[0].time;
    const groupUids = new Set<number>();
    for (let position = 0; position < group.length; position += 1) {
      const point = group[position];
      if (point.time !== time || groupUids.has(point.uid)) {
        throw new Error("Bandori topdata sample identity is invalid");
      }
      if (position > 0 && point.value > group[position - 1].value) {
        throw new Error("Bandori topdata sample values must be non-increasing");
      }
      groupUids.add(point.uid);
      referencedUids.add(point.uid);
    }
  }

  const users = payload.users.map(parseUser);
  const userUids = users.map((user) => user.uid);
  const userUidSet = new Set(userUids);
  if (
    userUids.some((uid, index) => index > 0 && uid <= userUids[index - 1])
    || userUidSet.size !== referencedUids.size
    || [...referencedUids].some((uid) => !userUidSet.has(uid))
  ) {
    throw new Error("Bandori topdata users must be unique, sorted, and cover every point UID");
  }
  return { points, users };
}
