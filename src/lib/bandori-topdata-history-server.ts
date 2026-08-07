import {
  createBandoriSnapshotJsonObjectCache,
  createBandoriSnapshotObjectSource,
  createBandoriSnapshotVerifiedGzipJsonCache,
} from "@/lib/bandori-snapshot-api-server";
import {
  type BandoriTopDataPayload,
} from "@/lib/bandori-topdata-contract";
import type { BandoriServerCode } from "@/lib/bandori-server";
import {
  BANDORI_TOPDATA_MAX_COMPRESSED_BYTES,
  BANDORI_TOPDATA_MAX_DECOMPRESSED_BYTES,
  BANDORI_TOPDATA_MAX_MANIFEST_BYTES,
  buildBandoriTopDataManifestKey,
  parseBandoriTopDataManifest,
  validateBandoriTopDataPack,
  type BandoriTopDataManifest,
} from "@/lib/bandori-topdata-history-contract";

const MANIFEST_TTL_MS = 60_000;
const READ_BUDGET_MS = 3_000;
const FAILURE_COOLDOWN_MS = 15_000;
const ACTIVE_STALE_WINDOW_MS = 6 * 60 * 60 * 1_000;
const MAX_TARGET_STATES = 64;
const MAX_PACK_CACHE_ENTRIES = 16;
const MAX_PACK_CACHE_BYTES = 32 * 1024 * 1024;

type CachedTarget = {
  manifest: BandoriTopDataManifest;
  sourceScope: string;
  completedAt: number;
};

export type BandoriTopDataHistoryReadResult = {
  payload: BandoriTopDataPayload;
  generation: number | null;
  publishedAt: string | null;
  isStale: boolean;
};

export class BandoriTopDataHistoryReadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BandoriTopDataHistoryReadError";
  }
}

const readManifestObject = createBandoriSnapshotJsonObjectCache<unknown>({
  maxEntries: MAX_TARGET_STATES,
  maxBytes: BANDORI_TOPDATA_MAX_MANIFEST_BYTES,
  ttlMs: MANIFEST_TTL_MS,
  readLabel: "Bandori TOP10 history manifest",
  allowNotFound: true,
  parse: (value) => {
    if (value === null) {
      throw new Error("Bandori TOP10 history manifest must be a JSON object");
    }
    return value;
  },
});

const readPackObject = createBandoriSnapshotVerifiedGzipJsonCache({
  maxEntries: MAX_PACK_CACHE_ENTRIES,
  maxCacheBytes: MAX_PACK_CACHE_BYTES,
  maxCompressedBytes: BANDORI_TOPDATA_MAX_COMPRESSED_BYTES,
  maxDecompressedBytes: BANDORI_TOPDATA_MAX_DECOMPRESSED_BYTES,
  datasetLabel: "Bandori TOP10 history pack",
  parse: validateBandoriTopDataPack,
  estimateBytes: (payload, decompressedBytes) => (
    decompressedBytes
    + payload.points.length * 64
    + payload.users.length * 256
  ),
});

const lastSuccessByTarget = new Map<string, CachedTarget>();
const cooldownUntilByTarget = new Map<string, number>();

function retainMostRecent<T>(map: Map<string, T>, key: string, value: T): void {
  map.delete(key);
  map.set(key, value);
  while (map.size > MAX_TARGET_STATES) {
    const oldest = map.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function remainingBudget(deadline: number): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new BandoriTopDataHistoryReadError("Bandori TOP10 history read timed out");
  return remaining;
}

async function withinDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const remaining = remainingBudget(deadline);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new BandoriTopDataHistoryReadError("Bandori TOP10 history read timed out")),
          remaining,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function staleResult(targetKey: string): BandoriTopDataHistoryReadResult | null {
  const cached = lastSuccessByTarget.get(targetKey);
  if (!cached) return null;
  if (
    !cached.manifest.hasFinalSample
    && Date.now() - cached.completedAt > ACTIVE_STALE_WINDOW_MS
  ) {
    return null;
  }
  const payload = readPackObject.peek(
    cached.sourceScope,
    targetKey,
    cached.manifest.descriptor,
  );
  if (!payload) {
    lastSuccessByTarget.delete(targetKey);
    return null;
  }
  retainMostRecent(lastSuccessByTarget, targetKey, cached);
  return {
    payload,
    generation: cached.manifest.generation,
    publishedAt: cached.manifest.publishedAt,
    isStale: true,
  };
}

export async function readBandoriTopDataHistory(
  server: BandoriServerCode,
  eventId: number,
): Promise<BandoriTopDataHistoryReadResult> {
  let source;
  try {
    source = createBandoriSnapshotObjectSource({
      localStoreEnvironmentName: "BANDORI_TOPDATA_HISTORY_LOCAL_STORE_ROOT",
      privateR2ReadLabel: "Bandori TOP10 history private R2 reader",
      localObjectLabel: "Bandori TOP10 history local object",
    });
  } catch (error) {
    throw new BandoriTopDataHistoryReadError("Bandori TOP10 history is unavailable", {
      cause: error,
    });
  }
  const manifestKey = buildBandoriTopDataManifestKey(eventId, server);
  const targetKey = `${source.scope}:${manifestKey}`;
  if ((cooldownUntilByTarget.get(targetKey) ?? 0) > Date.now()) {
    const stale = staleResult(targetKey);
    if (stale) return stale;
    throw new BandoriTopDataHistoryReadError("Bandori TOP10 history is in failure cooldown");
  }

  const deadline = Date.now() + READ_BUDGET_MS;
  try {
    const manifestValue = await withinDeadline(
      readManifestObject(source, manifestKey, {
        timeoutMs: remainingBudget(deadline),
      }),
      deadline,
    );
    if (manifestValue === null) {
      lastSuccessByTarget.delete(targetKey);
      cooldownUntilByTarget.delete(targetKey);
      return {
        payload: { points: [], users: [] },
        generation: null,
        publishedAt: null,
        isStale: false,
      };
    }

    const manifest = parseBandoriTopDataManifest(manifestValue, eventId, server);
    const payload = await withinDeadline(
      readPackObject(source, targetKey, manifest.descriptor, {
        timeoutMs: remainingBudget(deadline),
      }),
      deadline,
    );
    retainMostRecent(lastSuccessByTarget, targetKey, {
      manifest,
      sourceScope: source.scope,
      completedAt: Date.now(),
    });
    cooldownUntilByTarget.delete(targetKey);
    return {
      payload,
      generation: manifest.generation,
      publishedAt: manifest.publishedAt,
      isStale: false,
    };
  } catch (error) {
    retainMostRecent(cooldownUntilByTarget, targetKey, Date.now() + FAILURE_COOLDOWN_MS);
    const stale = staleResult(targetKey);
    if (stale) {
      console.warn(JSON.stringify({
        event: "bandori_topdata_history_stale",
        server,
        eventId,
        generation: stale.generation,
        publishedAt: stale.publishedAt,
        reason: error instanceof BandoriTopDataHistoryReadError ? "timeout" : "object_unavailable",
        cooldownMs: FAILURE_COOLDOWN_MS,
      }));
      return stale;
    }
    console.warn(JSON.stringify({
      event: "bandori_topdata_history_read_failure",
      server,
      eventId,
      reason: error instanceof BandoriTopDataHistoryReadError ? "timeout" : "object_unavailable",
      cooldownMs: FAILURE_COOLDOWN_MS,
    }));
    if (error instanceof BandoriTopDataHistoryReadError) throw error;
    throw new BandoriTopDataHistoryReadError("Bandori TOP10 history is unavailable", {
      cause: error,
    });
  }
}
