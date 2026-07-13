import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  EVENT_API_POINTER_KEY,
  MAX_EVENT_API_COMPRESSED_BYTES,
  MAX_EVENT_API_DECOMPRESSED_BYTES,
  MAX_EVENT_API_RECORDS,
  parseEventApiPointer,
  type EventApiDatasetDescriptor,
  type EventApiDatasetName,
  type EventApiPointer,
} from "@/lib/bandori-events-api-contract";
import {
  fetchR2Object,
  type R2ObjectResponse,
  type R2S3ReaderConfig,
} from "@/lib/r2-s3-reader";

const EVENT_API_POINTER_TTL_MS = 60_000;
const EVENT_ID_PATTERN = /^\d+$/u;

type EventApiRecord = Record<string, unknown>;
export type BandoriEventApiRecordMap = Record<string, EventApiRecord>;

type MemoryCacheEntry<T> = {
  expiresAt: number;
  promise: Promise<T>;
};

type EventApiObjectSource = {
  scope: string;
  read: (objectKey: string) => Promise<R2ObjectResponse>;
};

let pointerCache: { key: string; entry: MemoryCacheEntry<EventApiPointer> } | null = null;
const datasetCache = new Map<
  EventApiDatasetName,
  { compressedSha256: string; scope: string; promise: Promise<BandoriEventApiRecordMap> }
>();

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

function readRequiredEnv(names: readonly string[], label: string): string {
  const value = readFirstEnv(names);
  if (!value) {
    throw new Error(`Bandori private events R2 read is missing ${label}: ${names.join(", ")}`);
  }
  return value;
}

function getPrivateR2Config(): R2S3ReaderConfig {
  const accountId = readFirstEnv(["BANDORI_R2_ACCOUNT_ID", "BANDORI_MASTER_R2_ACCOUNT_ID"]);
  const endpoint = readFirstEnv(["BANDORI_R2_ENDPOINT", "BANDORI_MASTER_R2_ENDPOINT"])
    ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  if (!endpoint) {
    throw new Error(
      "Bandori private events R2 read is missing BANDORI_R2_ENDPOINT, "
      + "BANDORI_MASTER_R2_ENDPOINT, BANDORI_R2_ACCOUNT_ID, or BANDORI_MASTER_R2_ACCOUNT_ID",
    );
  }

  return {
    endpoint,
    bucket: readRequiredEnv(["BANDORI_PRIVATE_R2_BUCKET"], "private bucket"),
    accessKeyId: readRequiredEnv(
      ["BANDORI_R2_ACCESS_KEY_ID", "BANDORI_MASTER_R2_ACCESS_KEY_ID"],
      "access key ID",
    ),
    secretAccessKey: readRequiredEnv(
      ["BANDORI_R2_SECRET_ACCESS_KEY", "BANDORI_MASTER_R2_SECRET_ACCESS_KEY"],
      "secret access key",
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

async function readLocalObject(root: string, objectKey: string): Promise<R2ObjectResponse> {
  if (
    !objectKey
    || objectKey.includes("\\")
    || objectKey.split("/").some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("Bandori local event API object key is invalid");
  }
  const absoluteRoot = resolve(root);
  const objectPath = resolve(absoluteRoot, ...objectKey.split("/"));
  const relativePath = relative(absoluteRoot, objectPath);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error("Bandori local event API object escaped its store root");
  }
  try {
    return objectResponse(await readFile(objectPath), 200);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return objectResponse(Buffer.alloc(0), 404);
    }
    throw error;
  }
}

function getEventApiObjectSource(): EventApiObjectSource {
  const localRoot = process.env.BANDORI_EVENT_API_LOCAL_STORE_ROOT?.trim();
  if (localRoot) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("BANDORI_EVENT_API_LOCAL_STORE_ROOT is restricted to local development");
    }
    const resolvedRoot = resolve(localRoot);
    return {
      scope: `local:${resolvedRoot}`,
      read: (objectKey) => readLocalObject(resolvedRoot, objectKey),
    };
  }
  const config = getPrivateR2Config();
  return {
    scope: `r2:${configScope(config)}`,
    read: (objectKey) => fetchR2Object(config, objectKey),
  };
}

async function readPointer(source: EventApiObjectSource): Promise<EventApiPointer> {
  const now = Date.now();
  if (pointerCache?.key === source.scope && pointerCache.entry.expiresAt > now) {
    return pointerCache.entry.promise;
  }

  const promise = (async () => {
    const response = await source.read(EVENT_API_POINTER_KEY);
    if (!response.ok) {
      throw new Error(`Bandori events API pointer read failed: HTTP ${response.status}`);
    }
    return parseEventApiPointer(await response.json<unknown>());
  })();
  pointerCache = {
    key: source.scope,
    entry: { expiresAt: now + EVENT_API_POINTER_TTL_MS, promise },
  };
  promise.catch(() => {
    if (pointerCache?.key === source.scope && pointerCache.entry.promise === promise) {
      pointerCache = null;
    }
  });
  return promise;
}

function parseRecordMap(value: unknown, descriptor: EventApiDatasetDescriptor): BandoriEventApiRecordMap {
  if (!isRecord(value)) {
    throw new Error("Bandori events API dataset must be an object");
  }
  const entries = Object.entries(value);
  if (entries.length !== descriptor.recordCount || entries.length > MAX_EVENT_API_RECORDS) {
    throw new Error("Bandori events API dataset record count mismatch");
  }
  const records: BandoriEventApiRecordMap = {};
  for (const [recordId, record] of entries) {
    if (!EVENT_ID_PATTERN.test(recordId) || !isRecord(record)) {
      throw new Error(`Bandori events API dataset record is invalid: ${recordId}`);
    }
    records[recordId] = record;
  }
  return records;
}

function advertisedUncompressedSize(compressed: Buffer): number {
  if (compressed.length < 4) {
    throw new Error("Bandori events API dataset has an invalid gzip envelope");
  }
  return compressed.readUInt32LE(compressed.length - 4);
}

function decodeDataset(
  dataset: EventApiDatasetName,
  compressed: Buffer,
  descriptor: EventApiDatasetDescriptor,
): BandoriEventApiRecordMap {
  if (
    compressed.length > MAX_EVENT_API_COMPRESSED_BYTES
    || compressed.length !== descriptor.compressedSize
  ) {
    throw new Error(`Bandori events API dataset compressed size mismatch: ${dataset}`);
  }
  const compressedSha256 = createHash("sha256").update(compressed).digest("hex");
  if (compressedSha256 !== descriptor.compressedSha256) {
    throw new Error(`Bandori events API dataset compressed hash mismatch: ${dataset}`);
  }
  if (advertisedUncompressedSize(compressed) > MAX_EVENT_API_DECOMPRESSED_BYTES) {
    throw new Error(`Bandori events API dataset is too large after decompression: ${dataset}`);
  }

  let decompressed: Buffer;
  try {
    decompressed = gunzipSync(compressed, {
      maxOutputLength: MAX_EVENT_API_DECOMPRESSED_BYTES,
    });
  } catch (error) {
    throw new Error(`Bandori events API dataset is corrupt: ${dataset}`, { cause: error });
  }
  if (decompressed.length > MAX_EVENT_API_DECOMPRESSED_BYTES) {
    throw new Error(`Bandori events API dataset is too large after decompression: ${dataset}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(decompressed.toString("utf8"));
  } catch (error) {
    throw new Error(`Bandori events API dataset is not valid JSON: ${dataset}`, { cause: error });
  }
  return parseRecordMap(payload, descriptor);
}

async function readDataset(
  source: EventApiObjectSource,
  dataset: EventApiDatasetName,
  descriptor: EventApiDatasetDescriptor,
): Promise<BandoriEventApiRecordMap> {
  const existing = datasetCache.get(dataset);
  if (
    existing?.scope === source.scope
    && existing.compressedSha256 === descriptor.compressedSha256
  ) {
    return existing.promise;
  }

  const promise = (async () => {
    const response = await source.read(descriptor.key);
    if (!response.ok) {
      throw new Error(`Bandori events API dataset read failed: HTTP ${response.status} ${dataset}`);
    }
    const contentLength = response.headers.get("content-length");
    const declaredLength = contentLength === null ? null : Number(contentLength);
    if (
      declaredLength !== null
      && (
        !Number.isSafeInteger(declaredLength)
        || declaredLength < 0
        || declaredLength > MAX_EVENT_API_COMPRESSED_BYTES
        || declaredLength !== descriptor.compressedSize
      )
    ) {
      throw new Error(`Bandori events API dataset compressed size mismatch: ${dataset}`);
    }
    return decodeDataset(
      dataset,
      Buffer.from(await response.arrayBuffer()),
      descriptor,
    );
  })();
  datasetCache.set(dataset, {
    compressedSha256: descriptor.compressedSha256,
    scope: source.scope,
    promise,
  });
  promise.catch(() => {
    if (datasetCache.get(dataset)?.promise === promise) {
      datasetCache.delete(dataset);
    }
  });
  return promise;
}

export async function readBandoriEventApiDataset(
  dataset: EventApiDatasetName,
): Promise<BandoriEventApiRecordMap> {
  const source = getEventApiObjectSource();
  const pointer = await readPointer(source);
  return readDataset(source, dataset, pointer.datasets[dataset]);
}

export async function readBandoriEventApiDetail(eventId: string): Promise<EventApiRecord | null> {
  const details = await readBandoriEventApiDataset("eventDetails");
  return Object.hasOwn(details, eventId) ? details[eventId] : null;
}
