import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  BANDORI_CUTOFF_HISTORY_MAX_COMPRESSED_BYTES,
  BANDORI_CUTOFF_HISTORY_MAX_DECOMPRESSED_BYTES,
  BANDORI_CUTOFF_HISTORY_MAX_MANIFEST_BYTES,
  buildBandoriCutoffHistoryManifestKey,
  parseBandoriCutoffHistoryManifest,
  parseBandoriCutoffHistoryPack,
  selectBandoriCutoffHistoryCutoffs,
  type BandoriCutoffHistoryCutoffs,
  type BandoriCutoffHistoryManifestSelection,
  type BandoriCutoffHistoryQuery,
  type ParsedBandoriCutoffHistoryPack,
} from "@/lib/bandori-cutoff-history-contract";
import {
  fetchR2Object,
  type R2ObjectResponse,
  type R2S3ReaderConfig,
} from "@/lib/r2-s3-reader";

const MANIFEST_TTL_MS = 60_000;
const R2_TOTAL_BUDGET_MS = 3_000;
const FAILURE_COOLDOWN_MS = 15_000;
const ACTIVE_STALE_LIMIT_MS = 6 * 60 * 60 * 1_000;
const MAX_MANIFEST_CACHE_ENTRIES = 64;
const MAX_PARSED_PACK_CACHE_ENTRIES = 16;
const MAX_PARSED_PACK_CACHE_BYTES = 32 * 1024 * 1024;
const MAX_FAILURE_COOLDOWNS = 256;

export type BandoriTrackerHistorySource =
  | "supabase"
  | "r2-with-supabase-fallback"
  | "r2";

export type BandoriCutoffHistoryReadResult = {
  cutoffs: BandoriCutoffHistoryCutoffs;
  generation: number | null;
  publishedAt: string | null;
  isStale: boolean;
};

export type BandoriCutoffHistoryErrorReason =
  | "cooldown"
  | "invalid"
  | "oversized"
  | "timeout"
  | "unavailable"
  | "unconfigured";

export class BandoriCutoffHistoryReadError extends Error {
  constructor(
    public readonly reason: BandoriCutoffHistoryErrorReason,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BandoriCutoffHistoryReadError";
  }
}

type CutoffHistoryObjectSource = {
  scope: string;
  read: (
    objectKey: string,
    options: { maxBytes: number; timeoutMs: number },
  ) => Promise<R2ObjectResponse>;
};

type ManifestCacheEntry = {
  expiresAt: number;
  hasValue: boolean;
  lastSuccessAt: number;
  value: unknown | null;
  inFlight?: Promise<unknown | null>;
};

type ParsedPackCacheEntry = {
  promise: Promise<ParsedBandoriCutoffHistoryPack>;
  estimatedBytes: number;
};

type SuccessfulSnapshot = {
  completedAt: number;
  generation: number | null;
  publishedAt: string | null;
  hasFinalPoint: boolean;
  packCacheKey: string | null;
};

const manifestCache = new Map<string, ManifestCacheEntry>();
const parsedPackCache = new Map<string, ParsedPackCacheEntry>();
const successfulSnapshots = new Map<string, SuccessfulSnapshot>();
const failureCooldowns = new Map<string, number>();
let parsedPackCacheEstimatedBytes = 0;

function manifestTtlMs(): number {
  if (process.env.NODE_ENV !== "production") {
    const override = Number(process.env.BANDORI_TRACKER_HISTORY_TEST_MANIFEST_TTL_MS);
    if (Number.isSafeInteger(override) && override > 0) return override;
  }
  return MANIFEST_TTL_MS;
}

function testDurationMs(name: string, fallback: number): number {
  if (process.env.NODE_ENV !== "production") {
    const override = Number(process.env[name]);
    if (Number.isSafeInteger(override) && override > 0) return override;
  }
  return fallback;
}

function r2TotalBudgetMs(): number {
  return testDurationMs("BANDORI_TRACKER_HISTORY_TEST_R2_BUDGET_MS", R2_TOTAL_BUDGET_MS);
}

function failureCooldownMs(): number {
  return testDurationMs(
    "BANDORI_TRACKER_HISTORY_TEST_FAILURE_COOLDOWN_MS",
    FAILURE_COOLDOWN_MS,
  );
}

function maxParsedPackCacheBytes(): number {
  return testDurationMs(
    "BANDORI_TRACKER_HISTORY_TEST_MAX_PARSED_CACHE_BYTES",
    MAX_PARSED_PACK_CACHE_BYTES,
  );
}

function readFirstEnv(names: readonly string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

function readRequiredEnv(names: readonly string[], label: string): string {
  const value = readFirstEnv(names);
  if (!value) {
    throw new BandoriCutoffHistoryReadError(
      "unconfigured",
      `Bandori cutoff history R2 read is missing ${label}: ${names.join(", ")}`,
    );
  }
  return value;
}

export function getBandoriTrackerHistorySource(): BandoriTrackerHistorySource {
  const value = process.env.BANDORI_TRACKER_HISTORY_SOURCE?.trim() || "r2";
  if (
    value !== "supabase"
    && value !== "r2-with-supabase-fallback"
    && value !== "r2"
  ) {
    throw new Error(`Unsupported BANDORI_TRACKER_HISTORY_SOURCE: ${value}`);
  }
  return value;
}

function getR2Config(): R2S3ReaderConfig {
  const accountId = readFirstEnv(["BANDORI_R2_ACCOUNT_ID"]);
  const endpoint = readFirstEnv(["BANDORI_R2_ENDPOINT"])
    ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  if (!endpoint) {
    throw new BandoriCutoffHistoryReadError(
      "unconfigured",
      "Bandori cutoff history R2 read requires BANDORI_R2_ENDPOINT or BANDORI_R2_ACCOUNT_ID",
    );
  }
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(endpoint);
  } catch (error) {
    throw new BandoriCutoffHistoryReadError(
      "unconfigured",
      "Bandori cutoff history R2 endpoint is not a valid URL",
      { cause: error },
    );
  }
  if (process.env.NODE_ENV === "production" && endpointUrl.protocol !== "https:") {
    throw new BandoriCutoffHistoryReadError(
      "unconfigured",
      "Bandori cutoff history R2 endpoint must use HTTPS in production",
    );
  }
  return {
    endpoint,
    bucket: readRequiredEnv(
      ["BANDORI_TRACKER_HISTORY_R2_BUCKET"],
      "tracker-history bucket",
    ),
    accessKeyId: readRequiredEnv(["BANDORI_R2_ACCESS_KEY_ID"], "access key ID"),
    secretAccessKey: readRequiredEnv(["BANDORI_R2_SECRET_ACCESS_KEY"], "secret access key"),
    region: readFirstEnv(["BANDORI_R2_REGION"]) || "auto",
  };
}

function configScope(config: R2S3ReaderConfig): string {
  return JSON.stringify({
    endpoint: config.endpoint,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    region: config.region ?? "auto",
  });
}

function objectResponse(body: Buffer, status: number): R2ObjectResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-length": String(body.length) }),
    buffer: async () => body,
    arrayBuffer: async () => body.buffer.slice(
      body.byteOffset,
      body.byteOffset + body.byteLength,
    ) as ArrayBuffer,
    json: async <T = unknown>() => JSON.parse(body.toString("utf8")) as T,
    text: async () => body.toString("utf8"),
  };
}

async function readLocalObject(
  root: string,
  objectKey: string,
  maxBytes: number,
): Promise<R2ObjectResponse> {
  if (
    !objectKey
    || objectKey.includes("\\")
    || objectKey.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new BandoriCutoffHistoryReadError("invalid", "Invalid local cutoff-history object key");
  }
  const absoluteRoot = resolve(root);
  const objectPath = resolve(absoluteRoot, ...objectKey.split("/"));
  const relativePath = relative(absoluteRoot, objectPath);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new BandoriCutoffHistoryReadError("invalid", "Local cutoff-history object escaped its root");
  }
  try {
    const body = await readFile(objectPath);
    if (body.length > maxBytes) {
      throw new BandoriCutoffHistoryReadError("oversized", "Local cutoff-history object is too large");
    }
    return objectResponse(body, 200);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return objectResponse(Buffer.alloc(0), 404);
    }
    throw error;
  }
}

function getObjectSource(): CutoffHistoryObjectSource {
  const localRoot = process.env.BANDORI_TRACKER_HISTORY_LOCAL_STORE_ROOT?.trim();
  if (localRoot) {
    if (process.env.NODE_ENV === "production") {
      throw new BandoriCutoffHistoryReadError(
        "unconfigured",
        "BANDORI_TRACKER_HISTORY_LOCAL_STORE_ROOT is restricted to local development",
      );
    }
    const resolvedRoot = resolve(localRoot);
    return {
      scope: `local:${resolvedRoot}`,
      read: (objectKey, options) => readLocalObject(resolvedRoot, objectKey, options.maxBytes),
    };
  }
  const config = getR2Config();
  return {
    scope: `r2:${configScope(config)}`,
    read: (objectKey, options) => fetchR2Object(config, objectKey, undefined, options),
  };
}

function normalizeReadError(error: unknown, fallbackReason: BandoriCutoffHistoryErrorReason) {
  if (error instanceof BandoriCutoffHistoryReadError) return error;
  if ((error as NodeJS.ErrnoException | null)?.code === "ETIMEDOUT") {
    return new BandoriCutoffHistoryReadError("timeout", "Bandori cutoff history R2 read timed out", {
      cause: error,
    });
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("exceeds the") && message.includes("byte limit")) {
    return new BandoriCutoffHistoryReadError("oversized", message, { cause: error });
  }
  return new BandoriCutoffHistoryReadError(
    fallbackReason,
    `Bandori cutoff history R2 read failed: ${message}`,
    { cause: error },
  );
}

function remainingBudget(deadline: number): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new BandoriCutoffHistoryReadError("timeout", "Bandori cutoff history R2 budget expired");
  }
  return remaining;
}

function touchManifestCache(key: string, entry: ManifestCacheEntry): void {
  manifestCache.delete(key);
  manifestCache.set(key, entry);
  while (manifestCache.size > MAX_MANIFEST_CACHE_ENTRIES) {
    const oldestKey = manifestCache.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    manifestCache.delete(oldestKey);
  }
}

async function readManifest(
  source: CutoffHistoryObjectSource,
  manifestKey: string,
  deadline: number,
): Promise<unknown | null> {
  const cacheKey = `${source.scope}:${manifestKey}`;
  const now = Date.now();
  const existing = manifestCache.get(cacheKey);
  if (existing?.hasValue && existing.expiresAt > now) {
    touchManifestCache(cacheKey, existing);
    return existing.value;
  }
  if (existing?.inFlight) {
    touchManifestCache(cacheKey, existing);
    return existing.inFlight;
  }

  const entry = existing ?? {
    expiresAt: 0,
    hasValue: false,
    lastSuccessAt: 0,
    value: null,
  };
  const promise = (async () => {
    let response: R2ObjectResponse;
    try {
      response = await source.read(manifestKey, {
        maxBytes: BANDORI_CUTOFF_HISTORY_MAX_MANIFEST_BYTES,
        timeoutMs: remainingBudget(deadline),
      });
    } catch (error) {
      throw normalizeReadError(error, "unavailable");
    }
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new BandoriCutoffHistoryReadError(
        "unavailable",
        `Bandori cutoff history manifest read failed with HTTP ${response.status}`,
      );
    }
    try {
      return await response.json<unknown>();
    } catch (error) {
      throw new BandoriCutoffHistoryReadError(
        "invalid",
        "Bandori cutoff history manifest is not valid JSON",
        { cause: error },
      );
    }
  })();
  entry.inFlight = promise;
  touchManifestCache(cacheKey, entry);
  try {
    const value = await promise;
    entry.value = value;
    entry.hasValue = true;
    entry.lastSuccessAt = Date.now();
    entry.expiresAt = entry.lastSuccessAt + manifestTtlMs();
    return value;
  } finally {
    if (entry.inFlight === promise) entry.inFlight = undefined;
  }
}

function touchParsedPackCache(key: string, entry: ParsedPackCacheEntry): void {
  parsedPackCache.delete(key);
  parsedPackCache.set(key, entry);
}

function rememberSuccessfulSnapshot(key: string, snapshot: SuccessfulSnapshot): void {
  successfulSnapshots.delete(key);
  successfulSnapshots.set(key, snapshot);
  while (successfulSnapshots.size > MAX_PARSED_PACK_CACHE_ENTRIES) {
    const oldestKey = successfulSnapshots.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    successfulSnapshots.delete(oldestKey);
  }
}

function rememberFailureCooldown(key: string): void {
  const now = Date.now();
  for (const [existingKey, expiresAt] of failureCooldowns) {
    if (expiresAt <= now) failureCooldowns.delete(existingKey);
  }
  failureCooldowns.delete(key);
  failureCooldowns.set(key, now + failureCooldownMs());
  while (failureCooldowns.size > MAX_FAILURE_COOLDOWNS) {
    const oldestKey = failureCooldowns.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    failureCooldowns.delete(oldestKey);
  }
}

function evictParsedPackCache(): void {
  while (
    parsedPackCache.size > MAX_PARSED_PACK_CACHE_ENTRIES
    || parsedPackCacheEstimatedBytes > maxParsedPackCacheBytes()
  ) {
    const oldest = parsedPackCache.entries().next().value as
      | [string, ParsedPackCacheEntry]
      | undefined;
    if (!oldest) break;
    parsedPackCache.delete(oldest[0]);
    parsedPackCacheEstimatedBytes -= oldest[1].estimatedBytes;
  }
}

function estimateParsedPackBytes(
  pack: ParsedBandoriCutoffHistoryPack,
  decompressedBytes: number,
): number {
  let tierCount = 0;
  let songGroupCount = 0;
  let pointCount = 0;
  if (pack.kind === "song") {
    for (const songs of pack.tiers.values()) {
      tierCount += 1;
      for (const points of songs.values()) {
        songGroupCount += 1;
        pointCount += points.length;
      }
    }
  } else {
    for (const points of pack.tiers.values()) {
      tierCount += 1;
      pointCount += points.length;
    }
  }

  // The decompressed JSON accounts for strings and numeric payloads. The
  // additional weights conservatively budget retained Maps, arrays, and point
  // objects so the 32 MiB cache limit is a heap guard rather than a file-size
  // counter. Exact V8 object sizes are runtime-dependent.
  return decompressedBytes
    + (pointCount * 64)
    + (tierCount * 128)
    + (songGroupCount * 128);
}

function packCacheKey(
  source: CutoffHistoryObjectSource,
  descriptor: NonNullable<BandoriCutoffHistoryManifestSelection["descriptor"]>,
): string {
  return `${source.scope}:${descriptor.key}:${descriptor.compressedSha256}`;
}

async function readPack(
  source: CutoffHistoryObjectSource,
  query: BandoriCutoffHistoryQuery,
  selection: BandoriCutoffHistoryManifestSelection,
  deadline: number,
): Promise<ParsedBandoriCutoffHistoryPack> {
  const descriptor = selection.descriptor;
  if (!descriptor) {
    throw new BandoriCutoffHistoryReadError("invalid", "Missing cutoff-history pack descriptor");
  }
  const cacheKey = packCacheKey(source, descriptor);
  const existing = parsedPackCache.get(cacheKey);
  if (existing) {
    touchParsedPackCache(cacheKey, existing);
    return existing.promise;
  }

  const entry: ParsedPackCacheEntry = {
    estimatedBytes: 0,
    promise: Promise.resolve(null as never),
  };
  const promise = (async () => {
    let response: R2ObjectResponse;
    try {
      response = await source.read(descriptor.key, {
        maxBytes: BANDORI_CUTOFF_HISTORY_MAX_COMPRESSED_BYTES,
        timeoutMs: remainingBudget(deadline),
      });
    } catch (error) {
      throw normalizeReadError(error, "unavailable");
    }
    if (!response.ok) {
      throw new BandoriCutoffHistoryReadError(
        "unavailable",
        `Bandori cutoff history pack read failed with HTTP ${response.status}`,
      );
    }
    let compressed: Buffer;
    try {
      compressed = await response.buffer();
    } catch (error) {
      throw normalizeReadError(error, "unavailable");
    }
    if (compressed.length !== descriptor.compressedSize) {
      throw new BandoriCutoffHistoryReadError("invalid", "Bandori cutoff history pack size mismatch");
    }
    const compressedSha256 = createHash("sha256").update(compressed).digest("hex");
    if (compressedSha256 !== descriptor.compressedSha256) {
      throw new BandoriCutoffHistoryReadError("invalid", "Bandori cutoff history pack hash mismatch");
    }

    let decompressed: Buffer;
    try {
      decompressed = gunzipSync(compressed, {
        maxOutputLength: BANDORI_CUTOFF_HISTORY_MAX_DECOMPRESSED_BYTES,
      });
    } catch (error) {
      throw new BandoriCutoffHistoryReadError(
        (error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE" ? "oversized" : "invalid",
        "Bandori cutoff history pack is not a valid bounded gzip payload",
        { cause: error },
      );
    }
    let payload: unknown;
    try {
      payload = JSON.parse(decompressed.toString("utf8"));
    } catch (error) {
      throw new BandoriCutoffHistoryReadError(
        "invalid",
        "Bandori cutoff history pack is not valid JSON",
        { cause: error },
      );
    }
    let parsed: ParsedBandoriCutoffHistoryPack;
    try {
      parsed = parseBandoriCutoffHistoryPack(payload, query, descriptor);
    } catch (error) {
      throw new BandoriCutoffHistoryReadError(
        "invalid",
        "Bandori cutoff history pack contract validation failed",
        { cause: error },
      );
    }
    if (parsedPackCache.get(cacheKey) === entry) {
      entry.estimatedBytes = estimateParsedPackBytes(parsed, decompressed.length);
      parsedPackCacheEstimatedBytes += entry.estimatedBytes;
      evictParsedPackCache();
    }
    return parsed;
  })();
  entry.promise = promise;
  parsedPackCache.set(cacheKey, entry);
  promise.catch(() => {
    if (parsedPackCache.get(cacheKey) === entry) {
      parsedPackCache.delete(cacheKey);
      parsedPackCacheEstimatedBytes -= entry.estimatedBytes;
    }
  });
  return promise;
}

async function readCachedSnapshot(
  source: CutoffHistoryObjectSource,
  query: BandoriCutoffHistoryQuery,
): Promise<BandoriCutoffHistoryReadResult | null> {
  const manifestKey = buildBandoriCutoffHistoryManifestKey(query);
  const targetKey = `${source.scope}:${manifestKey}:${query.type}`;
  const snapshot = successfulSnapshots.get(targetKey);
  if (!snapshot) return null;
  if (!snapshot.hasFinalPoint && Date.now() - snapshot.completedAt > ACTIVE_STALE_LIMIT_MS) {
    return null;
  }
  if (!snapshot.packCacheKey) {
    return {
      cutoffs: [],
      generation: snapshot.generation,
      publishedAt: snapshot.publishedAt,
      isStale: true,
    };
  }
  const packEntry = parsedPackCache.get(snapshot.packCacheKey);
  if (!packEntry) return null;
  try {
    const pack = await packEntry.promise;
    touchParsedPackCache(snapshot.packCacheKey, packEntry);
    return {
      cutoffs: selectBandoriCutoffHistoryCutoffs(pack, query.tier),
      generation: snapshot.generation,
      publishedAt: snapshot.publishedAt,
      isStale: true,
    };
  } catch {
    return null;
  }
}

export async function readBandoriCutoffHistoryFromR2(
  query: BandoriCutoffHistoryQuery,
  options: { allowStale?: boolean } = {},
): Promise<BandoriCutoffHistoryReadResult> {
  const source = getObjectSource();
  const manifestKey = buildBandoriCutoffHistoryManifestKey(query);
  const targetKey = `${source.scope}:${manifestKey}:${query.type}`;
  const cooldownUntil = failureCooldowns.get(targetKey) ?? 0;
  if (cooldownUntil > Date.now()) {
    if (options.allowStale) {
      const stale = await readCachedSnapshot(source, query);
      if (stale) return stale;
    }
    throw new BandoriCutoffHistoryReadError("cooldown", "Bandori cutoff history target is cooling down");
  }

  const deadline = Date.now() + r2TotalBudgetMs();
  try {
    const manifestValue = await readManifest(source, manifestKey, deadline);
    if (manifestValue === null) {
      failureCooldowns.delete(targetKey);
      rememberSuccessfulSnapshot(targetKey, {
        completedAt: Date.now(),
        generation: null,
        publishedAt: null,
        hasFinalPoint: false,
        packCacheKey: null,
      });
      return { cutoffs: [], generation: null, publishedAt: null, isStale: false };
    }
    let selection: BandoriCutoffHistoryManifestSelection;
    try {
      selection = parseBandoriCutoffHistoryManifest(manifestValue, query);
    } catch (error) {
      throw new BandoriCutoffHistoryReadError(
        "invalid",
        "Bandori cutoff history manifest contract validation failed",
        { cause: error },
      );
    }
    if (!selection.descriptor) {
      failureCooldowns.delete(targetKey);
      rememberSuccessfulSnapshot(targetKey, {
        completedAt: Date.now(),
        generation: selection.generation,
        publishedAt: selection.publishedAt,
        hasFinalPoint: false,
        packCacheKey: null,
      });
      return {
        cutoffs: [],
        generation: selection.generation,
        publishedAt: selection.publishedAt,
        isStale: false,
      };
    }
    const pack = await readPack(source, query, selection, deadline);
    failureCooldowns.delete(targetKey);
    rememberSuccessfulSnapshot(targetKey, {
      completedAt: Date.now(),
      generation: selection.generation,
      publishedAt: selection.publishedAt,
      hasFinalPoint: selection.descriptor.hasFinalPoint,
      packCacheKey: packCacheKey(source, selection.descriptor),
    });
    return {
      cutoffs: selectBandoriCutoffHistoryCutoffs(pack, query.tier),
      generation: selection.generation,
      publishedAt: selection.publishedAt,
      isStale: false,
    };
  } catch (error) {
    const normalized = normalizeReadError(error, "unavailable");
    rememberFailureCooldown(targetKey);
    if (options.allowStale) {
      const stale = await readCachedSnapshot(source, query);
      if (stale) return stale;
    }
    throw normalized;
  }
}

export function resetBandoriCutoffHistoryCachesForTests(): void {
  manifestCache.clear();
  parsedPackCache.clear();
  successfulSnapshots.clear();
  failureCooldowns.clear();
  parsedPackCacheEstimatedBytes = 0;
}
