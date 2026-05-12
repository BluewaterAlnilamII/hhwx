export const BESTDORI_PROFILE_COMPRESSION_VERSION = "2";
export const BESTDORI_CN_SERVER_ID = 3;

export type BestdoriCardProfile = {
  ids: string;
  levels: unknown[];
  masters: unknown[];
  skills: unknown[];
  eps: unknown[];
  trains: unknown[];
  arts?: unknown[];
  excludes: unknown[];
};

export type BestdoriItemsProfile = Record<string, unknown> & {
  potentials?: unknown;
};

export type BestdoriProfile = {
  name: string;
  server: number;
  compression: string;
  data: {
    cards: BestdoriCardProfile;
    items: BestdoriItemsProfile;
  };
  hhwx?: unknown;
};

export type NormalizedBestdoriCard = {
  cardId: number;
  level: number;
  masterRank: number;
  skillLevel: number;
  episodeCount: number;
  isTrained: boolean;
  hasTrainedArt: boolean;
  isExcluded: boolean;
};

export type NormalizedBestdoriProfile = {
  name: string;
  server: number;
  cards: NormalizedBestdoriCard[];
  items: Record<string, Array<number | null>>;
  potentials: number[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toFiniteInteger(value: unknown, fallback = 0): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : fallback;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function decodeBase64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

export function decodeRunLengthPairs<T = unknown>(pairs: unknown[], expectedLength?: number): T[] {
  const decoded: T[] = [];
  for (let index = 0; index < pairs.length; index += 2) {
    const count = toFiniteInteger(pairs[index]);
    const value = pairs[index + 1] as T;
    if (count <= 0) {
      continue;
    }

    for (let offset = 0; offset < count; offset += 1) {
      decoded.push(value);
    }
  }

  if (expectedLength !== undefined && decoded.length < expectedLength) {
    const lastValue = decoded[decoded.length - 1] as T | undefined;
    while (decoded.length < expectedLength) {
      decoded.push(lastValue as T);
    }
  }

  return expectedLength === undefined ? decoded : decoded.slice(0, expectedLength);
}

export function encodeRunLengthPairs<T>(values: T[]): unknown[] {
  if (values.length === 0) {
    return [];
  }

  const encoded: unknown[] = [];
  let count = 1;
  let currentValue = values[0];

  for (let index = 1; index < values.length; index += 1) {
    if (Object.is(values[index], currentValue)) {
      count += 1;
      continue;
    }

    encoded.push(count, currentValue);
    currentValue = values[index];
    count = 1;
  }

  encoded.push(count, currentValue);
  return encoded;
}

function encodeRunLengthNumberPairs(values: number[]): unknown[] {
  return encodeRunLengthPairs(values.map((value) => toFiniteInteger(value)));
}

function encodeRunLengthBooleanPairs(values: boolean[]): unknown[] {
  return encodeRunLengthPairs(values.map((value) => (value ? 1 : 0)));
}

export function decodeBestdoriCardIds(ids: string): number[] {
  const bytes = decodeBase64ToBytes(ids);
  const cardIds: number[] = [];
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    cardIds.push(bytes[index] + (bytes[index + 1] << 8));
  }
  return cardIds;
}

export function encodeBestdoriCardIds(cardIds: number[]): string {
  const bytes = new Uint8Array(cardIds.length * 2);
  cardIds.forEach((cardId, index) => {
    const normalizedCardId = toFiniteInteger(cardId);
    bytes[index * 2] = normalizedCardId & 0xff;
    bytes[index * 2 + 1] = (normalizedCardId >> 8) & 0xff;
  });
  return encodeBytesToBase64(bytes);
}

export function parseBestdoriProfile(value: unknown): BestdoriProfile {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.data.cards) || !isRecord(value.data.items)) {
    throw new Error("Bestdori profile 格式无效");
  }

  const profile = value as BestdoriProfile;
  if (profile.compression !== BESTDORI_PROFILE_COMPRESSION_VERSION) {
    throw new Error(`不支持的 Bestdori profile compression: ${String(profile.compression)}`);
  }

  if (typeof profile.data.cards.ids !== "string") {
    throw new Error("Bestdori profile 缺少 cards.ids");
  }

  return profile;
}

export function decodeBestdoriProfile(value: unknown): NormalizedBestdoriProfile {
  const profile = parseBestdoriProfile(value);
  const cards = profile.data.cards;
  const cardIds = decodeBestdoriCardIds(cards.ids);
  const expectedLength = cardIds.length;
  const levels = decodeRunLengthPairs<number>(cards.levels, expectedLength).map((item) => toFiniteInteger(item));
  const masters = decodeRunLengthPairs<number>(cards.masters, expectedLength).map((item) => toFiniteInteger(item));
  const skills = decodeRunLengthPairs<number>(cards.skills, expectedLength).map((item) => toFiniteInteger(item) + 1);
  const eps = decodeRunLengthPairs<number>(cards.eps, expectedLength).map((item) => toFiniteInteger(item));
  const trains = decodeRunLengthPairs<unknown>(cards.trains, expectedLength).map(toBoolean);
  const arts = decodeRunLengthPairs<unknown>(cards.arts ?? cards.trains, expectedLength).map(toBoolean);
  const excludes = decodeRunLengthPairs<unknown>(cards.excludes, expectedLength).map(toBoolean);
  const items: Record<string, Array<number | null>> = {};

  Object.entries(profile.data.items).forEach(([key, rawValue]) => {
    if (key === "potentials" || !Array.isArray(rawValue)) {
      return;
    }

    items[key] = decodeRunLengthPairs<number | null>(rawValue)
      .map((item) => (item === null ? null : toFiniteInteger(item)));
  });

  const rawPotentials = Array.isArray(profile.data.items.potentials) ? profile.data.items.potentials : [];

  return {
    name: typeof profile.name === "string" && profile.name.trim() ? profile.name.trim() : "档案",
    server: toFiniteInteger(profile.server, BESTDORI_CN_SERVER_ID),
    cards: cardIds.map((cardId, index) => ({
      cardId,
      level: levels[index] ?? 1,
      masterRank: masters[index] ?? 0,
      skillLevel: skills[index] ?? 1,
      episodeCount: eps[index] ?? 0,
      isTrained: trains[index] ?? false,
      hasTrainedArt: arts[index] ?? false,
      isExcluded: excludes[index] ?? false,
    })),
    items,
    potentials: decodeRunLengthPairs<number>(rawPotentials).map((item) => toFiniteInteger(item)),
  };
}

export function encodeBestdoriProfile(profile: NormalizedBestdoriProfile): BestdoriProfile {
  const cards = [...profile.cards].sort((left, right) => (
    right.level - left.level
    || right.masterRank - left.masterRank
    || right.skillLevel - left.skillLevel
    || right.episodeCount - left.episodeCount
    || Number(right.isTrained) - Number(left.isTrained)
    || Number(right.hasTrainedArt) - Number(left.hasTrainedArt)
    || Number(right.isExcluded) - Number(left.isExcluded)
    || left.cardId - right.cardId
  ));
  const items: BestdoriItemsProfile = Object.fromEntries(
    Object.entries(profile.items).map(([key, levels]) => [key, encodeRunLengthPairs(levels)]),
  );
  items.potentials = encodeRunLengthNumberPairs(profile.potentials);

  return {
    name: profile.name || "档案",
    server: profile.server || BESTDORI_CN_SERVER_ID,
    compression: BESTDORI_PROFILE_COMPRESSION_VERSION,
    data: {
      cards: {
        ids: encodeBestdoriCardIds(cards.map((card) => card.cardId)),
        levels: encodeRunLengthNumberPairs(cards.map((card) => card.level)),
        masters: encodeRunLengthNumberPairs(cards.map((card) => card.masterRank)),
        skills: encodeRunLengthNumberPairs(cards.map((card) => Math.max(0, card.skillLevel - 1))),
        eps: encodeRunLengthNumberPairs(cards.map((card) => card.episodeCount)),
        trains: encodeRunLengthBooleanPairs(cards.map((card) => card.isTrained)),
        arts: encodeRunLengthBooleanPairs(cards.map((card) => card.hasTrainedArt)),
        excludes: encodeRunLengthBooleanPairs(cards.map((card) => card.isExcluded)),
      },
      items,
    },
  };
}
