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
  const accountId = readFirstEnv(["BANDORI_R2_ACCOUNT_ID", "BANDORI_MASTER_R2_ACCOUNT_ID"]);
  const endpoint = readFirstEnv(["BANDORI_R2_ENDPOINT", "BANDORI_MASTER_R2_ENDPOINT"])
    ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  if (!endpoint) {
    throw new Error(
      `${serviceLabel} is missing BANDORI_R2_ENDPOINT, `
      + "BANDORI_MASTER_R2_ENDPOINT, BANDORI_R2_ACCOUNT_ID, or BANDORI_MASTER_R2_ACCOUNT_ID",
    );
  }

  return {
    endpoint,
    bucket: readRequiredEnv(["BANDORI_PRIVATE_R2_BUCKET"], "private bucket", serviceLabel),
    accessKeyId: readRequiredEnv(
      ["BANDORI_R2_ACCESS_KEY_ID", "BANDORI_MASTER_R2_ACCESS_KEY_ID"],
      "access key ID",
      serviceLabel,
    ),
    secretAccessKey: readRequiredEnv(
      ["BANDORI_R2_SECRET_ACCESS_KEY", "BANDORI_MASTER_R2_SECRET_ACCESS_KEY"],
      "secret access key",
      serviceLabel,
    ),
    region: readFirstEnv(["BANDORI_R2_REGION", "BANDORI_MASTER_R2_REGION"]) || "auto",
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

function decodeRecordMap(
  cacheKey: string,
  compressed: Buffer,
  descriptor: BandoriSnapshotPackDescriptor,
  options: SnapshotRecordMapCacheOptions,
): BandoriSnapshotRecordMap {
  if (
    compressed.length > options.maxCompressedBytes
    || compressed.length !== descriptor.compressedSize
  ) {
    throw new Error(`${options.datasetLabel} compressed size mismatch: ${cacheKey}`);
  }
  const compressedSha256 = createHash("sha256").update(compressed).digest("hex");
  if (compressedSha256 !== descriptor.compressedSha256) {
    throw new Error(`${options.datasetLabel} compressed hash mismatch: ${cacheKey}`);
  }
  if (advertisedUncompressedSize(compressed, options.datasetLabel) > options.maxDecompressedBytes) {
    throw new Error(`${options.datasetLabel} is too large after decompression: ${cacheKey}`);
  }

  let decompressed: Buffer;
  try {
    decompressed = gunzipSync(compressed, {
      maxOutputLength: options.maxDecompressedBytes,
    });
  } catch (error) {
    throw new Error(`${options.datasetLabel} is corrupt: ${cacheKey}`, { cause: error });
  }
  if (decompressed.length > options.maxDecompressedBytes) {
    throw new Error(`${options.datasetLabel} is too large after decompression: ${cacheKey}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(decompressed.toString("utf8"));
  } catch (error) {
    throw new Error(`${options.datasetLabel} is not valid JSON: ${cacheKey}`, { cause: error });
  }
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
  if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1) {
    throw new Error("Bandori snapshot record cache must retain at least one entry");
  }
  type CacheEntry = {
    promise: Promise<BandoriSnapshotRecordMap>;
    isResolved: boolean;
  };
  const cache = new Map<string, CacheEntry>();

  const trimResolvedEntries = () => {
    let resolvedCount = 0;
    for (const entry of cache.values()) {
      if (entry.isResolved) {
        resolvedCount += 1;
      }
    }
    if (resolvedCount <= options.maxEntries) {
      return;
    }
    for (const [key, entry] of cache) {
      if (!entry.isResolved) {
        continue;
      }
      cache.delete(key);
      resolvedCount -= 1;
      if (resolvedCount <= options.maxEntries) {
        return;
      }
    }
  };

  return async (source, cacheKey, descriptor) => {
    const scopedCacheKey = [
      source.scope,
      cacheKey,
      descriptor.key,
      descriptor.compressedSha256,
    ].join("\u0000");
    const existing = cache.get(scopedCacheKey);
    if (existing) {
      if (existing.isResolved) {
        cache.delete(scopedCacheKey);
        cache.set(scopedCacheKey, existing);
      }
      return existing.promise;
    }

    const promise = (async () => {
      const response = await source.read(descriptor.key, {
        maxBytes: Math.min(options.maxCompressedBytes, descriptor.compressedSize),
        timeoutMs: SNAPSHOT_OBJECT_TIMEOUT_MS,
      });
      if (!response.ok) {
        throw new Error(
          `${options.datasetLabel} read failed: HTTP ${response.status} ${cacheKey}`,
        );
      }
      validateDeclaredLength(
        response,
        descriptor.compressedSize,
        options.maxCompressedBytes,
        `${options.datasetLabel} compressed size mismatch: ${cacheKey}`,
      );
      return decodeRecordMap(
        cacheKey,
        Buffer.from(await response.arrayBuffer()),
        descriptor,
        options,
      );
    })();
    const entry: CacheEntry = { promise, isResolved: false };
    cache.set(scopedCacheKey, entry);
    void promise.then(
      () => {
        if (cache.get(scopedCacheKey) !== entry) {
          return;
        }
        entry.isResolved = true;
        cache.delete(scopedCacheKey);
        cache.set(scopedCacheKey, entry);
        trimResolvedEntries();
      },
      () => undefined,
    );
    void promise.catch(() => {
      if (cache.get(scopedCacheKey) === entry) {
        cache.delete(scopedCacheKey);
      }
    });
    return promise;
  };
}
