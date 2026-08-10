export const BANDORI_SERVER_COUNT = 4;
export const BANDORI_SERVERS = [0, 1, 2, 3] as const;
export const BANDORI_SERVER_CODES = ["jp", "en", "tw", "cn"] as const;
export const BANDORI_SERVER_LANGUAGE_TAGS = ["ja", "en", "zh-Hant", "zh-Hans"] as const;
export const DEFAULT_BANDORI_PREFERRED_SERVER = 3;
export const BANDORI_SERVER_FALLBACK_ORDER = [0, 1, 2, 3] as const;

export type BandoriServer = typeof BANDORI_SERVERS[number];
export type BandoriServerCode = typeof BANDORI_SERVER_CODES[number];
export type BandoriServerLanguageTag = typeof BANDORI_SERVER_LANGUAGE_TAGS[number];

export type BandoriRegionalTextSelection = {
  text: string;
  server: BandoriServer;
};

export function isBandoriServer(value: unknown): value is BandoriServer {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value < BANDORI_SERVER_COUNT;
}

export function normalizeBandoriServer(value: unknown): BandoriServer | null {
  if (isBandoriServer(value)) {
    return value;
  }
  if (typeof value !== "string" || !/^[0-3]$/u.test(value)) {
    return null;
  }
  return Number(value) as BandoriServer;
}

export function getBandoriServerCode(server: BandoriServer): BandoriServerCode {
  return BANDORI_SERVER_CODES[server];
}

export function getBandoriServerLanguageTag(server: BandoriServer): BandoriServerLanguageTag {
  return BANDORI_SERVER_LANGUAGE_TAGS[server];
}

export function readBandoriRegionalTextAt(
  value: unknown,
  server: BandoriServer,
): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const text = value[server];
  return typeof text === "string" && text.trim() ? text.trim() : null;
}

export function readBandoriRegionalNumberAt(
  value: unknown,
  server: BandoriServer,
): number | null {
  const candidate = Array.isArray(value) ? value[server] : value;
  if (candidate === null || candidate === undefined || candidate === "") {
    return null;
  }
  const numberValue = Number(candidate);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function getBandoriServerFromCode(value: unknown): BandoriServer | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  const index = BANDORI_SERVER_CODES.indexOf(normalized as BandoriServerCode);
  return index >= 0 ? index as BandoriServer : null;
}

export function parseBandoriServerParam(value: unknown): BandoriServer | null {
  return getBandoriServerFromCode(value) ?? normalizeBandoriServer(value);
}

export function getBandoriRegionalPreferenceOrder(
  preferredServer: BandoriServer,
): readonly BandoriServer[] {
  return getBandoriRegionalDisplayOrder(preferredServer);
}

export function getBandoriRegionalDisplayOrder(
  preferredServer: BandoriServer,
  contextServer?: BandoriServer | null,
): readonly BandoriServer[] {
  return [
    ...(contextServer === null || contextServer === undefined ? [] : [contextServer]),
    preferredServer,
    ...BANDORI_SERVER_FALLBACK_ORDER,
  ].filter((server, index, order) => order.indexOf(server) === index);
}

export function pickAvailableBandoriServer(
  availableServers: readonly BandoriServer[],
  preferredServer: BandoriServer,
): BandoriServer | null {
  const availableSet = new Set(availableServers);
  return getBandoriRegionalDisplayOrder(preferredServer).find(
    (server) => availableSet.has(server),
  ) ?? null;
}

function findBandoriRegionalValueServer<T>(
  slots: readonly T[] | null | undefined,
  preferredServer: BandoriServer,
  isAvailable: (value: T | undefined) => boolean,
  contextServer?: BandoriServer | null,
): BandoriServer | null {
  if (!Array.isArray(slots)) {
    return null;
  }
  for (const server of getBandoriRegionalDisplayOrder(preferredServer, contextServer)) {
    if (isAvailable(slots[server])) {
      return server;
    }
  }
  return null;
}

const isBandoriRegionalTextAvailable = (value: unknown): value is string => (
  typeof value === "string" && value.trim().length > 0
);

export function pickBandoriRegionalValue<T>(
  slots: readonly T[] | null | undefined,
  preferredServer: BandoriServer,
  isAvailable: (value: T | undefined) => boolean = (value) => value !== null && value !== undefined,
  contextServer?: BandoriServer | null,
): T | null {
  const server = findBandoriRegionalValueServer(slots, preferredServer, isAvailable, contextServer);
  return server === null ? null : slots?.[server] as T;
}

export function pickBandoriRegionalText(
  slots: readonly unknown[] | null | undefined,
  preferredServer: BandoriServer,
  contextServer?: BandoriServer | null,
): string | null {
  const value = pickBandoriRegionalValue(
    slots,
    preferredServer,
    isBandoriRegionalTextAvailable,
    contextServer,
  );
  return typeof value === "string" ? value.trim() : null;
}

export function pickBandoriRegionalTextWithServer(
  slots: readonly unknown[] | null | undefined,
  preferredServer: BandoriServer,
  contextServer?: BandoriServer | null,
): BandoriRegionalTextSelection | null {
  const server = findBandoriRegionalValueServer(
    slots,
    preferredServer,
    isBandoriRegionalTextAvailable,
    contextServer,
  );
  if (server === null) {
    return null;
  }
  return {
    text: String(slots?.[server]).trim(),
    server,
  };
}
