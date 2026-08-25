export const BANDORI_CHART_SIMULATOR_TEXTURE_RELEASE_DELAY_MS = 15_000;

type ReleaseTimer = ReturnType<typeof setTimeout>;

type TextureLeaseEntry<T> = {
  readonly resource: Promise<T>;
  referenceCount: number;
  releaseTimer: ReleaseTimer | null;
};

export type BandoriChartSimulatorTextureLease<T> = {
  readonly resource: Promise<T>;
  release(): void;
};

type BandoriChartSimulatorTextureLeaseCacheOptions<T> = {
  readonly load: (url: string) => Promise<T>;
  readonly unload: (url: string) => Promise<void>;
  readonly releaseDelayMs: number;
  readonly scheduleRelease?: (callback: () => void, delayMs: number) => ReleaseTimer;
  readonly cancelRelease?: (timer: ReleaseTimer) => void;
};

export type BandoriChartSimulatorTextureLeaseCache<T> = {
  acquire(url: string): BandoriChartSimulatorTextureLease<T>;
  releaseUnusedNow(): void;
};

/**
 * Owns decoded texture resources by resolved immutable URL. A short
 * zero-reference delay absorbs rapid skin changes while serialized unloads
 * prevent an older stage from destroying a texture acquired by its replacement.
 */
export function createBandoriChartSimulatorTextureLeaseCache<T>({
  load,
  unload,
  releaseDelayMs,
  scheduleRelease = (callback, delayMs) => setTimeout(callback, delayMs),
  cancelRelease = (timer) => clearTimeout(timer),
}: BandoriChartSimulatorTextureLeaseCacheOptions<T>): BandoriChartSimulatorTextureLeaseCache<T> {
  if (!Number.isFinite(releaseDelayMs) || releaseDelayMs < 0) {
    throw new Error("Chart-simulator texture release delay must be non-negative");
  }

  const entries = new Map<string, TextureLeaseEntry<T>>();
  const pendingUnloads = new Map<string, Promise<void>>();

  const beginUnload = (url: string, entry: TextureLeaseEntry<T>): void => {
    if (entries.get(url) !== entry || entry.referenceCount !== 0) return;
    if (entry.releaseTimer !== null) {
      cancelRelease(entry.releaseTimer);
      entry.releaseTimer = null;
    }
    entries.delete(url);

    const unloadRequest = entry.resource.then(
      () => unload(url),
      () => undefined,
    ).then(
      () => undefined,
      () => undefined,
    );
    pendingUnloads.set(url, unloadRequest);
    void unloadRequest.then(() => {
      if (pendingUnloads.get(url) === unloadRequest) pendingUnloads.delete(url);
    });
  };

  const scheduleUnusedRelease = (url: string, entry: TextureLeaseEntry<T>): void => {
    if (entry.releaseTimer !== null || entry.referenceCount !== 0) return;
    entry.releaseTimer = scheduleRelease(() => {
      entry.releaseTimer = null;
      beginUnload(url, entry);
    }, releaseDelayMs);
  };

  return {
    acquire(url) {
      if (!url) throw new Error("Chart-simulator texture URL is required");
      let entry = entries.get(url);
      if (!entry) {
        const precedingUnload = pendingUnloads.get(url) ?? Promise.resolve();
        entry = {
          referenceCount: 0,
          releaseTimer: null,
          resource: precedingUnload.then(() => load(url)),
        };
        entries.set(url, entry);
        const createdEntry = entry;
        void createdEntry.resource.catch(() => {
          if (entries.get(url) !== createdEntry) return;
          if (createdEntry.releaseTimer !== null) {
            cancelRelease(createdEntry.releaseTimer);
          }
          entries.delete(url);
        });
      }
      if (entry.releaseTimer !== null) {
        cancelRelease(entry.releaseTimer);
        entry.releaseTimer = null;
      }
      entry.referenceCount += 1;

      let isReleased = false;
      return {
        resource: entry.resource,
        release() {
          if (isReleased) return;
          isReleased = true;
          if (entries.get(url) !== entry) return;
          entry.referenceCount -= 1;
          scheduleUnusedRelease(url, entry);
        },
      };
    },
    releaseUnusedNow() {
      for (const [url, entry] of entries) {
        if (entry.referenceCount === 0) beginUnload(url, entry);
      }
    },
  };
}
