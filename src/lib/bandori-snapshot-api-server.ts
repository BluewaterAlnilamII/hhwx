import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  fetchR2Object,
  type R2ObjectReadOptions,
  type R2ObjectResponse,
  type R2S3ReaderConfig,
} from "@/lib/r2-s3-reader";

const MAX_SNAPSHOT_POINTER_BYTES = 1024 * 1024;
const SNAPSHOT_OBJECT_TIMEOUT_MS = 15_000;
const NUMERIC_ID_PATTERN = /^\d+$/u;

export type BandoriSnapshotPackDescriptor = {
  key: string;
  semanticSha256: string;
  compressedSha256: string;
  compressedSize: number;
  recordCount: number;
};

export type BandoriSnapshotRecord = Record<string, unknown>;
export type BandoriSnapshotRecordMap = Record<string, BandoriSnapshotRecord>;

export type BandoriSnapshotObjectSource = {
  scope: string;
  read: (objectKey: string, options?: R2ObjectReadOptions) => Promise<R2ObjectResponse>;
};

type SnapshotObjectSourceOptions = {
  localStoreEnvironmentName: string;
  privateR2ReadLabel: string;
  localObjectLabel: string;
};

type SnapshotPointerCacheOptions<T> = {
  pointerKey: string;
  pointerTtlMs: number;
  pointerReadLabel: string;
  parse: (value: unknown) => T;
};

type SnapshotRecordMapCacheOptions = {
  maxEntries: number;
  maxCompressedBytes: number;
  maxDecompressedBytes: number;
  maxRecords: number;
  datasetLabel: string;
  validateRecord?: (
    cacheKey: string,
    recordId: string,
    record: BandoriSnapshotRecord,
  ) => void;
};

type SnapshotJsonObjectCacheOptions<T> = {
  maxEntries: number;
  maxBytes: number;
  ttlMs: number;
  readLabel: string;
  allowNotFound?: boolean;
  parse: (value: unknown) => T;
};

export type BandoriVerifiedGzipDescriptor = {
  key: string;
  semanticSha256: string;
  compressedSha256: string;
  compressedSize: number;
};

type SnapshotVerifiedGzipCacheOptions<T, TDescriptor extends BandoriVerifiedGzipDescriptor> = {
  maxEntries: number;
  maxCacheBytes: number;
  maxCompressedBytes: number;
  maxDecompressedBytes: number;
  datasetLabel: string;
  verifySemanticHash?: boolean;
  parse: (value: unknown, descriptor: TDescriptor, cacheKey: string) => T;
  estimateBytes?: (value: T, decompressedBytes: number) => number;
};

export type BandoriVerifiedGzipJsonCacheReader<
  T,
  TDescriptor extends BandoriVerifiedGzipDescriptor,
> = ((
  source: BandoriSnapshotObjectSource,
  cacheKey: string,
  descriptor: TDescriptor,
  readOptions?: R2ObjectReadOptions,
) => Promise<T>) & {
  peek: (
    sourceScope: string,
    cacheKey: string,
    descriptor: TDescriptor,
  ) => T | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFirstEnv(names: readonly string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

function readRequiredEnv(names: readonly string[], label: string, serviceLabel: string): string {
  const value = readFirstEnv(names);
  if (!value) {
    throw new Error(`${serviceLabel} is missing ${label}: ${names.join(", ")}`);
  }
  return value;
}

function getPrivateR2Config(serviceLabel: string): R2S3ReaderConfig {
  const accountId = readFirstEnv(["BANDORI_R2_ACCOUNT_ID"]);
  const endpoint = readFirstEnv(["BANDORI_R2_ENDPOINT"])
    ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  if (!endpoint) {
    throw new Error(
      `${serviceLabel} is missing BANDORI_R2_ENDPOINT or BANDORI_R2_ACCOUNT_ID`,
    );
  }

  return {
    endpoint,
    bucket: readRequiredEnv(["BANDORI_PRIVATE_R2_BUCKET"], "private bucket", serviceLabel),
    accessKeyId: readRequiredEnv(
      ["BANDORI_R2_ACCESS_KEY_ID"],
      "access key ID",
      serviceLabel,
    ),
    secretAccessKey: readRequiredEnv(
      ["BANDORI_R2_SECRET_ACCESS_KEY"],
      "secret access key",
      serviceLabel,
    ),
  };
}

function configScope(config: R2S3ReaderConfig): string {
  return JSON.stringify({
    endpoint: config.endpoint,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
  });
}

function objectResponse(body: Buffer, status: number): R2ObjectResponse {
  const arrayBuffer = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-length": String(body.length) }),
    buffer: async () => body,
    arrayBuffer: async () => arrayBuffer,
    json: async <T = unknown>() => JSON.parse(body.toString("utf8")) as T,
    text: async () => body.toString("utf8"),
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(",")}}`;
}

function validateObjectKey(objectKey: string, localObjectLabel: string): string[] {
  const parts = objectKey.split("/");
  if (
    !objectKey
    || objectKey.includes("\\")
    || parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`${localObjectLabel} key is invalid`);
  }
  return parts;
}

async function readLocalObject(
  root: string,
  objectKey: string,
  localObjectLabel: string,
  options: R2ObjectReadOptions,
): Promise<R2ObjectResponse> {
  const parts = validateObjectKey(objectKey, localObjectLabel);
  const absoluteRoot = resolve(root);
  const objectPath = resolve(absoluteRoot, ...parts);
  const relativePath = relative(absoluteRoot, objectPath);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`${localObjectLabel} escaped its store root`);
  }
  try {
    if (options.maxBytes !== undefined) {
      const objectStats = await stat(objectPath);
      if (objectStats.size > options.maxBytes) {
        throw new Error(`R2 object exceeds the ${options.maxBytes} byte limit`);
      }
    }
    const body = await readFile(objectPath);
    if (options.maxBytes !== undefined && body.length > options.maxBytes) {
      throw new Error(`R2 object exceeds the ${options.maxBytes} byte limit`);
    }
    return objectResponse(body, 200);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return objectResponse(Buffer.alloc(0), 404);
    }
    throw error;
  }
}

export function createBandoriSnapshotObjectSource(
  options: SnapshotObjectSourceOptions,
): BandoriSnapshotObjectSource {
  const localRoot = process.env[options.localStoreEnvironmentName]?.trim();
  if (localRoot) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`${options.localStoreEnvironmentName} is restricted to local development`);
    }
    const resolvedRoot = resolve(localRoot);
    return {
      scope: `local:${resolvedRoot}`,
      read: (objectKey, readOptions = {}) => readLocalObject(
        resolvedRoot,
        objectKey,
        options.localObjectLabel,
        readOptions,
      ),
    };
  }

  const config = getPrivateR2Config(options.privateR2ReadLabel);
  return {
    scope: `r2:${configScope(config)}`,
    read: (objectKey, readOptions = {}) => fetchR2Object(
      config,
      objectKey,
      undefined,
      readOptions,
    ),
  };
}

export function createBandoriSnapshotJsonObjectCache<T>(
  options: SnapshotJsonObjectCacheOptions<T>,
): (
  source: BandoriSnapshotObjectSource,
  objectKey: string,
  readOptions?: R2ObjectReadOptions,
) => Promise<T | null> {
  if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1) {
    throw new Error("Bandori JSON object cache must retain at least one entry");
  }
  if (
    !Number.isSafeInteger(options.maxBytes)
    || options.maxBytes < 1
    || !Number.isSafeInteger(options.ttlMs)
    || options.ttlMs < 1
  ) {
    throw new Error("Bandori JSON object cache limits are invalid");
  }
  type JsonCacheEntry = {
    expiresAt: number;
    promise: Promise<T | null>;
    isResolved: boolean;
  };
  const cache = new Map<string, JsonCacheEntry>();
  const trim = () => {
    while (cache.size > options.maxEntries) {
      const oldest = [...cache.entries()].find(([, candidate]) => candidate.isResolved);
      if (!oldest) return;
      cache.delete(oldest[0]);
    }
  };
  return async (source, objectKey, readOptions = {}) => {
    const cacheKey = `${source.scope}\u0000${objectKey}`;
    const existing = cache.get(cacheKey);
    if (existing && (!existing.isResolved || existing.expiresAt > Date.now())) {
      cache.delete(cacheKey);
      cache.set(cacheKey, existing);
      return existing.promise;
    }
    if (existing) cache.delete(cacheKey);
    const promise = (async () => {
      const response = await source.read(objectKey, {
        ...readOptions,
        maxBytes: options.maxBytes,
      });
      if (response.status === 404 && options.allowNotFound) return null;
      if (!response.ok) {
        throw new Error(`${options.readLabel} read failed: HTTP ${response.status}`);
      }
      validateDeclaredLength(
        response,
        null,
        options.maxBytes,
        `${options.readLabel} is too large`,
      );
      return options.parse(await response.json<unknown>());
    })();
    const entry: JsonCacheEntry = {
      expiresAt: Date.now() + options.ttlMs,
      promise,
      isResolved: false,
    };
    cache.set(cacheKey, entry);
    trim();
    void promise.then(() => {
      if (cache.get(cacheKey) !== entry) return;
      entry.isResolved = true;
      trim();
    }, () => undefined);
    void promise.catch(() => {
      if (cache.get(cacheKey) === entry) cache.delete(cacheKey);
    });
    return promise;
  };
}

export function createBandoriSnapshotVerifiedGzipJsonCache<
  T,
  TDescriptor extends BandoriVerifiedGzipDescriptor,
>(
  options: SnapshotVerifiedGzipCacheOptions<T, TDescriptor>,
): BandoriVerifiedGzipJsonCacheReader<T, TDescriptor> {
  if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1) {
    throw new Error("Bandori verified gzip cache must retain at least one entry");
  }
  if (
    !Number.isSafeInteger(options.maxCacheBytes)
    || options.maxCacheBytes < 1
    || !Number.isSafeInteger(options.maxCompressedBytes)
    || options.maxCompressedBytes < 1
    || !Number.isSafeInteger(options.maxDecompressedBytes)
    || options.maxDecompressedBytes < 1
  ) {
    throw new Error("Bandori verified gzip cache limits are invalid");
  }
  type CacheEntry = {
    promise: Promise<T>;
    isResolved: boolean;
    estimatedBytes: number;
    value?: T;
  };
  const cache = new Map<string, CacheEntry>();
  let cacheBytes = 0;

  const trim = () => {
    while (cache.size > options.maxEntries || cacheBytes > options.maxCacheBytes) {
      const oldest = [...cache.entries()].find(([, candidate]) => candidate.isResolved);
      if (!oldest) return;
      cache.delete(oldest[0]);
      cacheBytes -= oldest[1].estimatedBytes;
    }
  };

  const scopedKey = (
    sourceScope: string,
    cacheKey: string,
    descriptor: TDescriptor,
  ) => [
    sourceScope,
    cacheKey,
    canonicalJson(descriptor),
  ].join("\u0000");

  const read: BandoriVerifiedGzipJsonCacheReader<T, TDescriptor> = async (
    source,
    cacheKey,
    descriptor,
    readOptions = {},
  ) => {
    if (
      !Number.isSafeInteger(descriptor.compressedSize)
      || descriptor.compressedSize < 1
      || descriptor.compressedSize > options.maxCompressedBytes
    ) {
      throw new Error(`${options.datasetLabel} compressed size is invalid: ${cacheKey}`);
    }
    const scopedCacheKey = scopedKey(source.scope, cacheKey, descriptor);
    const existing = cache.get(scopedCacheKey);
    if (existing) {
      if (existing.isResolved) {
        cache.delete(scopedCacheKey);
        cache.set(scopedCacheKey, existing);
      }
      return existing.promise;
    }

    const entry: CacheEntry = {
      promise: Promise.resolve(null as T),
      isResolved: false,
      estimatedBytes: 0,
    };
    const promise = (async () => {
      const response = await source.read(descriptor.key, {
        ...readOptions,
        maxBytes: Math.min(options.maxCompressedBytes, descriptor.compressedSize),
      });
      if (!response.ok) {
        throw new Error(`${options.datasetLabel} read failed: HTTP ${response.status} ${cacheKey}`);
      }
      validateDeclaredLength(
        response,
        descriptor.compressedSize,
        options.maxCompressedBytes,
        `${options.datasetLabel} compressed size mismatch: ${cacheKey}`,
      );
      const compressed = Buffer.from(await response.arrayBuffer());
      if (compressed.length !== descriptor.compressedSize) {
        throw new Error(`${options.datasetLabel} compressed size mismatch: ${cacheKey}`);
      }
      if (createHash("sha256").update(compressed).digest("hex") !== descriptor.compressedSha256) {
        throw new Error(`${options.datasetLabel} compressed hash mismatch: ${cacheKey}`);
      }
      if (advertisedUncompressedSize(compressed, options.datasetLabel) > options.maxDecompressedBytes) {
        throw new Error(`${options.datasetLabel} is too large after decompression: ${cacheKey}`);
      }
      let decompressed: Buffer;
      try {
        decompressed = gunzipSync(compressed, { maxOutputLength: options.maxDecompressedBytes });
      } catch (error) {
        throw new Error(`${options.datasetLabel} is corrupt: ${cacheKey}`, { cause: error });
      }
      let raw: unknown;
      try {
        raw = JSON.parse(decompressed.toString("utf8"));
      } catch (error) {
        throw new Error(`${options.datasetLabel} is not valid JSON: ${cacheKey}`, { cause: error });
      }
      const value = options.parse(raw, descriptor, cacheKey);
      if (options.verifySemanticHash !== false) {
        const semanticSha256 = createHash("sha256").update(canonicalJson(raw)).digest("hex");
        if (semanticSha256 !== descriptor.semanticSha256) {
          throw new Error(`${options.datasetLabel} semantic hash mismatch: ${cacheKey}`);
        }
      }
      const estimatedBytes = options.estimateBytes?.(value, decompressed.length)
        ?? decompressed.length;
      if (!Number.isSafeInteger(estimatedBytes) || estimatedBytes < 0) {
        throw new Error(`${options.datasetLabel} cache size estimate is invalid: ${cacheKey}`);
      }
      entry.estimatedBytes = estimatedBytes;
      entry.value = value;
      return value;
    })();
    entry.promise = promise;
    cache.set(scopedCacheKey, entry);
    void promise.then(
      () => {
        if (cache.get(scopedCacheKey) !== entry) return;
        entry.isResolved = true;
        cacheBytes += entry.estimatedBytes;
        cache.delete(scopedCacheKey);
        cache.set(scopedCacheKey, entry);
        trim();
      },
      () => undefined,
    );
    void promise.catch(() => {
      if (cache.get(scopedCacheKey) === entry) cache.delete(scopedCacheKey);
    });
    return promise;
  };
  read.peek = (sourceScope, cacheKey, descriptor) => {
    const entry = cache.get(scopedKey(sourceScope, cacheKey, descriptor));
    if (!entry?.isResolved || entry.value === undefined) return null;
    cache.delete(scopedKey(sourceScope, cacheKey, descriptor));
    cache.set(scopedKey(sourceScope, cacheKey, descriptor), entry);
    return entry.value;
  };
  return read;
}

function validateDeclaredLength(
  response: R2ObjectResponse,
  expectedSize: number | null,
  maxBytes: number,
  mismatchMessage: string,
): void {
  const contentLength = response.headers.get("content-length");
  if (contentLength === null) {
    return;
  }
  const declaredLength = Number(contentLength);
  if (
    !Number.isSafeInteger(declaredLength)
    || declaredLength < 0
    || declaredLength > maxBytes
    || (expectedSize !== null && declaredLength !== expectedSize)
  ) {
    throw new Error(mismatchMessage);
  }
}

export function createBandoriSnapshotPointerCache<T>(
  options: SnapshotPointerCacheOptions<T>,
): (source: BandoriSnapshotObjectSource) => Promise<T> {
  let cached: {
    scope: string;
    expiresAt: number;
    promise: Promise<T>;
  } | null = null;

  return async (source) => {
    const now = Date.now();
    if (cached?.scope === source.scope && cached.expiresAt > now) {
      return cached.promise;
    }

    const promise = (async () => {
      const response = await source.read(options.pointerKey, {
        maxBytes: MAX_SNAPSHOT_POINTER_BYTES,
        timeoutMs: SNAPSHOT_OBJECT_TIMEOUT_MS,
      });
      if (!response.ok) {
        throw new Error(`${options.pointerReadLabel} read failed: HTTP ${response.status}`);
      }
      validateDeclaredLength(
        response,
        null,
        MAX_SNAPSHOT_POINTER_BYTES,
        `${options.pointerReadLabel} is too large`,
      );
      return options.parse(await response.json<unknown>());
    })();
    cached = {
      scope: source.scope,
      expiresAt: now + options.pointerTtlMs,
      promise,
    };
    void promise.catch(() => {
      if (cached?.scope === source.scope && cached.promise === promise) {
        cached = null;
      }
    });
    return promise;
  };
}

function advertisedUncompressedSize(compressed: Buffer, datasetLabel: string): number {
  if (compressed.length < 4) {
    throw new Error(`${datasetLabel} has an invalid gzip envelope`);
  }
  return compressed.readUInt32LE(compressed.length - 4);
}

function parseRecordMap(
  cacheKey: string,
  payload: unknown,
  descriptor: BandoriSnapshotPackDescriptor,
  options: SnapshotRecordMapCacheOptions,
): BandoriSnapshotRecordMap {
  if (!isRecord(payload)) {
    throw new Error(`${options.datasetLabel} must be an object`);
  }
  const entries = Object.entries(payload);
  if (entries.length !== descriptor.recordCount || entries.length > options.maxRecords) {
    throw new Error(`${options.datasetLabel} record count mismatch`);
  }
  const records: BandoriSnapshotRecordMap = {};
  for (const [recordId, record] of entries) {
    if (!NUMERIC_ID_PATTERN.test(recordId) || !isRecord(record)) {
      throw new Error(`${options.datasetLabel} record is invalid: ${recordId}`);
    }
    options.validateRecord?.(cacheKey, recordId, record);
    records[recordId] = record;
  }
  return records;
}

export function createBandoriSnapshotRecordMapCache(
  options: SnapshotRecordMapCacheOptions,
): (
  source: BandoriSnapshotObjectSource,
  cacheKey: string,
  descriptor: BandoriSnapshotPackDescriptor,
) => Promise<BandoriSnapshotRecordMap> {
  const maxCacheBytes = Math.min(
    Number.MAX_SAFE_INTEGER,
    options.maxEntries * options.maxDecompressedBytes,
  );
  const read = createBandoriSnapshotVerifiedGzipJsonCache<
    BandoriSnapshotRecordMap,
    BandoriSnapshotPackDescriptor
  >({
    maxEntries: options.maxEntries,
    maxCacheBytes,
    maxCompressedBytes: options.maxCompressedBytes,
    maxDecompressedBytes: options.maxDecompressedBytes,
    datasetLabel: options.datasetLabel,
    // Legacy master packs exposed this field but the established reader never
    // enforced it. Keep that behavior while sharing all transport, gzip, hash,
    // in-flight, and LRU mechanics; newer datasets opt into semantic checking.
    verifySemanticHash: false,
    parse: (payload, descriptor, cacheKey) => parseRecordMap(
      cacheKey,
      payload,
      descriptor,
      options,
    ),
  });
  return (source, cacheKey, descriptor) => read(
    source,
    cacheKey,
    descriptor,
    { timeoutMs: SNAPSHOT_OBJECT_TIMEOUT_MS },
  );
}
