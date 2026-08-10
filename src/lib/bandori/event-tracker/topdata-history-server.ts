import {
  createBandoriSnapshotJsonObjectCache,
  createBandoriSnapshotObjectSource,
  createBandoriSnapshotVerifiedGzipJsonCache,
} from "@/lib/bandori-snapshot-api-server";
import type { BandoriServerCode } from "@/lib/bandori-server";
import type { BandoriTopDataPayload } from "@/lib/bandori/event-tracker/topdata-contract";
import {
  BANDORI_TOPDATA_MAX_COMPRESSED_BYTES,
  BANDORI_TOPDATA_MAX_DECOMPRESSED_BYTES,
  BANDORI_TOPDATA_MAX_MANIFEST_BYTES,
  buildBandoriTopDataManifestKey,
  parseBandoriTopDataManifest,
  validateBandoriTopDataPack,
  type BandoriTopDataPackDescriptor,
} from "@/lib/bandori/event-tracker/topdata-history-contract";

const MANIFEST_TTL_MS = 60_000;
const READ_BUDGET_MS = 3_000;
const FAILURE_COOLDOWN_MS = 15_000;
const ACTIVE_STALE_WINDOW_MS = 6 * 60 * 60 * 1_000;
const MAX_TARGET_STATES = 64;
const MAX_PACK_CACHE_ENTRIES = 16;
const MAX_PACK_CACHE_BYTES = 32 * 1024 * 1024;

type ManifestHeader = {
  generation: number;
  publishedAt: string;
  hasFinalSample: boolean;
};

type SelectedPack = {
  descriptor: BandoriTopDataPackDescriptor | null;
  cacheKey: string;
};

type CachedTarget = ManifestHeader & {
  descriptor: BandoriTopDataPackDescriptor;
  packCacheKey: string;
  sourceScope: string;
  completedAt: number;
};

type BandoriTopDataTargetReadOptions<TManifest extends ManifestHeader> = {
  manifestKey: string;
  targetDiscriminator?: string;
  parseManifest: (value: unknown) => TManifest;
  selectPack: (manifest: TManifest) => SelectedPack;
  isExpectedSelectionError?: (error: unknown) => boolean;
  logContext: Record<string, string | number>;
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
  if (remaining <= 0) {
    throw new BandoriTopDataHistoryReadError("Bandori TOP10 history read timed out");
  }
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
  if (!cached.hasFinalSample && Date.now() - cached.completedAt > ACTIVE_STALE_WINDOW_MS) {
    return null;
  }
  const payload = readPackObject.peek(
    cached.sourceScope,
    cached.packCacheKey,
    cached.descriptor,
  );
  if (!payload) {
    lastSuccessByTarget.delete(targetKey);
    return null;
  }
  retainMostRecent(lastSuccessByTarget, targetKey, cached);
  return {
    payload,
    generation: cached.generation,
    publishedAt: cached.publishedAt,
    isStale: true,
  };
}

function targetStateKey(
  sourceScope: string,
  manifestKey: string,
  discriminator?: string,
): string {
  return [sourceScope, manifestKey, discriminator ?? "manifest"].join("\u0000");
}

/**
 * Shared bounded reader for event, song, and monthly TOP10 history. Callers own
 * manifest identity validation and target selection; this layer owns transport,
 * the end-to-end read deadline, failure cooldown, and stale-last-success policy.
 */
export async function readBandoriTopDataTarget<TManifest extends ManifestHeader>(
  options: BandoriTopDataTargetReadOptions<TManifest>,
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

  const targetKey = targetStateKey(
    source.scope,
    options.manifestKey,
    options.targetDiscriminator,
  );
  if ((cooldownUntilByTarget.get(targetKey) ?? 0) > Date.now()) {
    const stale = staleResult(targetKey);
    if (stale) return stale;
    throw new BandoriTopDataHistoryReadError("Bandori TOP10 history is in failure cooldown");
  }

  const deadline = Date.now() + READ_BUDGET_MS;
  try {
    const manifestValue = await withinDeadline(
      readManifestObject(source, options.manifestKey, {
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

    const manifest = options.parseManifest(manifestValue);
    let selected: SelectedPack;
    try {
      selected = options.selectPack(manifest);
    } catch (error) {
      if (!options.isExpectedSelectionError?.(error)) throw error;
      lastSuccessByTarget.delete(targetKey);
      cooldownUntilByTarget.delete(targetKey);
      throw error;
    }
    if (selected.descriptor === null) {
      lastSuccessByTarget.delete(targetKey);
      cooldownUntilByTarget.delete(targetKey);
      return {
        payload: { points: [], users: [] },
        generation: manifest.generation,
        publishedAt: manifest.publishedAt,
        isStale: false,
      };
    }

    const payload = await withinDeadline(
      readPackObject(source, selected.cacheKey, selected.descriptor, {
        timeoutMs: remainingBudget(deadline),
      }),
      deadline,
    );
    retainMostRecent(lastSuccessByTarget, targetKey, {
      generation: manifest.generation,
      publishedAt: manifest.publishedAt,
      // The shared manifest is authoritative for finality. In particular, a
      // Challenge manifest may temporarily contain a mix of final/non-final
      // descriptors while its aggregate hasFinalSample remains false.
      hasFinalSample: manifest.hasFinalSample,
      descriptor: selected.descriptor,
      packCacheKey: selected.cacheKey,
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
    if (options.isExpectedSelectionError?.(error)) throw error;
    retainMostRecent(cooldownUntilByTarget, targetKey, Date.now() + FAILURE_COOLDOWN_MS);
    const stale = staleResult(targetKey);
    if (stale) {
      console.warn(JSON.stringify({
        event: "bandori_topdata_history_stale",
        ...options.logContext,
        generation: stale.generation,
        publishedAt: stale.publishedAt,
        reason: error instanceof BandoriTopDataHistoryReadError ? "timeout" : "object_unavailable",
        cooldownMs: FAILURE_COOLDOWN_MS,
      }));
      return stale;
    }
    console.warn(JSON.stringify({
      event: "bandori_topdata_history_read_failure",
      ...options.logContext,
      reason: error instanceof BandoriTopDataHistoryReadError ? "timeout" : "object_unavailable",
      cooldownMs: FAILURE_COOLDOWN_MS,
    }));
    if (error instanceof BandoriTopDataHistoryReadError) throw error;
    throw new BandoriTopDataHistoryReadError("Bandori TOP10 history is unavailable", {
      cause: error,
    });
  }
}

export async function readBandoriTopDataHistory(
  server: BandoriServerCode,
  eventId: number,
): Promise<BandoriTopDataHistoryReadResult> {
  const manifestKey = buildBandoriTopDataManifestKey(eventId, server);
  return readBandoriTopDataTarget({
    manifestKey,
    parseManifest: (value) => parseBandoriTopDataManifest(value, eventId, server),
    selectPack: (manifest) => ({
      descriptor: manifest.descriptor,
      cacheKey: manifestKey,
    }),
    logContext: { kind: "event", server, eventId },
  });
}

export function resetBandoriTopDataTargetStatesForTests(): void {
  lastSuccessByTarget.clear();
  cooldownUntilByTarget.clear();
}

export function inspectBandoriTopDataTargetStateSizesForTests(): {
  lastSuccess: number;
  cooldown: number;
} {
  return {
    lastSuccess: lastSuccessByTarget.size,
    cooldown: cooldownUntilByTarget.size,
  };
}
