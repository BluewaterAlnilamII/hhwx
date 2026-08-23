import {
  getBandoriPublicAssetBaseUrl,
} from "@/lib/bandori-public-asset-index";

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const BUNDLE_KEY_PATTERN = /^(?:apk|sound\/common|sound\/tapseskin\/[A-Za-z0-9_]+|ingameskin\/(?:bgskin|fieldskin|judgeskin|noteskin|tapeffect)\/[A-Za-z0-9_]+)$/u;
const LOGICAL_ASSET_PREFIX = "/local/chart-simulator/";

export const BANDORI_CHART_SIMULATOR_INDEX_SCHEMA_VERSION = 1;
export const BANDORI_CHART_SIMULATOR_MANIFEST_SCHEMA =
  "hhwx-bandori-chart-simulator-assets-v1";

export type BandoriChartSimulatorAssetIndex = {
  readonly schemaVersion: typeof BANDORI_CHART_SIMULATOR_INDEX_SCHEMA_VERSION;
  readonly updatedAt: string;
  readonly manifest: string;
};

export type BandoriChartSimulatorAssetManifest = {
  readonly schemaVersion: typeof BANDORI_CHART_SIMULATOR_MANIFEST_SCHEMA;
  readonly packs: Readonly<Record<string, string>>;
};

export type BandoriChartSimulatorAssetResolver = (logicalUrl: string) => string;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const expected = new Set(keys);
  if (
    Object.keys(value).length !== expected.size
    || keys.some((key) => !Object.hasOwn(value, key))
    || Object.keys(value).some((key) => !expected.has(key))
  ) {
    throw new Error(`${label} has unsupported fields`);
  }
}

function parseSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`${label} has an invalid SHA-256`);
  }
  return value;
}

export function parseBandoriChartSimulatorAssetIndex(
  value: unknown,
): BandoriChartSimulatorAssetIndex {
  if (!isRecord(value)) {
    throw new Error("Bandori chart-simulator asset index must be an object");
  }
  assertExactKeys(
    value,
    ["schemaVersion", "updatedAt", "manifest"],
    "Bandori chart-simulator asset index",
  );
  if (value.schemaVersion !== BANDORI_CHART_SIMULATOR_INDEX_SCHEMA_VERSION) {
    throw new Error("Unsupported Bandori chart-simulator asset index schema");
  }
  if (
    typeof value.updatedAt !== "string"
    || !value.updatedAt.trim()
    || !Number.isFinite(Date.parse(value.updatedAt))
  ) {
    throw new Error("Bandori chart-simulator asset index has an invalid updatedAt");
  }
  return {
    schemaVersion: BANDORI_CHART_SIMULATOR_INDEX_SCHEMA_VERSION,
    updatedAt: value.updatedAt,
    manifest: parseSha256(
      value.manifest,
      "Bandori chart-simulator asset index manifest",
    ),
  };
}

export function parseBandoriChartSimulatorAssetManifest(
  value: unknown,
): BandoriChartSimulatorAssetManifest {
  if (!isRecord(value)) {
    throw new Error("Bandori chart-simulator asset manifest must be an object");
  }
  assertExactKeys(
    value,
    ["schemaVersion", "packs"],
    "Bandori chart-simulator asset manifest",
  );
  if (value.schemaVersion !== BANDORI_CHART_SIMULATOR_MANIFEST_SCHEMA) {
    throw new Error("Unsupported Bandori chart-simulator asset manifest schema");
  }
  if (!isRecord(value.packs) || Object.keys(value.packs).length === 0) {
    throw new Error("Bandori chart-simulator asset manifest packs must be an object");
  }
  const packs: Record<string, string> = Object.create(null);
  for (const [bundleKey, packHash] of Object.entries(value.packs)) {
    if (
      !BUNDLE_KEY_PATTERN.test(bundleKey)
      || bundleKey === "ingameskin/bgskin/skinteamlivefestival"
    ) {
      throw new Error(`Bandori chart-simulator asset manifest has an invalid bundle: ${bundleKey}`);
    }
    packs[bundleKey] = parseSha256(
      packHash,
      `Bandori chart-simulator asset manifest pack ${bundleKey}`,
    );
  }
  return {
    schemaVersion: BANDORI_CHART_SIMULATOR_MANIFEST_SCHEMA,
    packs,
  };
}

function parseLogicalAssetPath(logicalUrl: string): string {
  if (!logicalUrl.startsWith(LOGICAL_ASSET_PREFIX)) {
    throw new Error(`Unsupported Bandori chart-simulator logical asset URL: ${logicalUrl}`);
  }
  const relativePath = logicalUrl.slice(LOGICAL_ASSET_PREFIX.length);
  const parts = relativePath.split("/");
  if (
    !relativePath
    || parts.some((part) => !part || part === "." || part === "..")
    || relativePath.includes("\\")
    || relativePath.includes("?")
    || relativePath.includes("#")
  ) {
    throw new Error(`Invalid Bandori chart-simulator logical asset URL: ${logicalUrl}`);
  }
  return relativePath;
}

export function inferBandoriChartSimulatorBundleKey(logicalUrl: string): string {
  const relativePath = parseLogicalAssetPath(logicalUrl);
  const parts = relativePath.split("/");
  if (parts[0] === "apk") return "apk";
  if (parts[0] === "sound" && parts[1] === "common" && parts.length >= 3) {
    return "sound/common";
  }
  if (
    parts[0] === "sound"
    && parts[1] === "tapseskin"
    && parts.length >= 4
  ) {
    return parts.slice(0, 3).join("/");
  }
  if (parts[0] === "ingameskin" && parts.length >= 4) {
    if (parts[1] === "bgskin" && parts[2] === "skinteamlivefestival") {
      throw new Error(
        "Bandori team-live assets must use skin_teamlivefestival",
      );
    }
    return parts.slice(0, 3).join("/");
  }
  if (
    parts.length >= 8
    && parts[0] === "assets"
    && parts[1] === "star"
    && parts[2] === "forassetbundle"
    && (parts[3] === "startapp" || parts[3] === "asneeded")
    && parts[4] === "ingameskin"
  ) {
    if (parts[5] === "bgskin" && parts[6] === "skinteamlivefestival") {
      throw new Error(
        "Bandori team-live assets must use skin_teamlivefestival",
      );
    }
    return `ingameskin/${parts[5]}/${parts[6]}`;
  }
  throw new Error(`Cannot infer Bandori chart-simulator source bundle: ${logicalUrl}`);
}

function appendEncodedPath(baseUrl: string, path: string): string {
  return `${baseUrl}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function buildBandoriChartSimulatorManifestUrl(
  manifestSha256: string,
  baseUrl?: string | null,
): string | null {
  const normalizedBaseUrl = getBandoriPublicAssetBaseUrl(baseUrl);
  if (!normalizedBaseUrl) return null;
  const hash = parseSha256(
    manifestSha256,
    "Bandori chart-simulator asset manifest",
  );
  return appendEncodedPath(
    normalizedBaseUrl,
    `bandori/chart-simulator/manifests/${hash}.json`,
  );
}

export function createBandoriChartSimulatorAssetResolver(
  manifest: BandoriChartSimulatorAssetManifest,
  baseUrl?: string | null,
): BandoriChartSimulatorAssetResolver {
  const normalizedBaseUrl = getBandoriPublicAssetBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    throw new Error("Bandori asset CDN is not configured");
  }
  return (logicalUrl) => {
    const relativePath = parseLogicalAssetPath(logicalUrl);
    const bundleKey = inferBandoriChartSimulatorBundleKey(logicalUrl);
    const packHash = manifest.packs[bundleKey];
    if (!packHash) {
      throw new Error(`Bandori chart-simulator asset pack is unavailable: ${bundleKey}`);
    }
    return appendEncodedPath(
      normalizedBaseUrl,
      `bandori/chart-simulator/packs/${packHash}/${relativePath}`,
    );
  };
}
