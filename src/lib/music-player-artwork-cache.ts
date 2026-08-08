const MAX_SHARED_ARTWORK_ENTRIES = 32;

type ArtworkCacheStatus = "loading" | "ready" | "error";
type ArtworkCacheListener = () => void;

interface ArtworkCacheEntry {
  sourceUrl: string;
  status: ArtworkCacheStatus;
  resolvedUrl: string | null;
  listeners: Set<ArtworkCacheListener>;
  abortController: AbortController;
  lastAccess: number;
}

const artworkCache = new Map<string, ArtworkCacheEntry>();
let accessSequence = 0;

function touchEntry(entry: ArtworkCacheEntry): void {
  accessSequence += 1;
  entry.lastAccess = accessSequence;
}

function releaseEntry(entry: ArtworkCacheEntry): void {
  entry.abortController.abort();
  if (entry.status === "ready" && entry.resolvedUrl) {
    URL.revokeObjectURL(entry.resolvedUrl);
  }
  artworkCache.delete(entry.sourceUrl);
}

function trimUnusedEntries(): void {
  if (artworkCache.size <= MAX_SHARED_ARTWORK_ENTRIES) {
    return;
  }

  const unusedEntries = [...artworkCache.values()]
    .filter((entry) => entry.listeners.size === 0)
    .sort((left, right) => left.lastAccess - right.lastAccess);

  for (const entry of unusedEntries) {
    if (artworkCache.size <= MAX_SHARED_ARTWORK_ENTRIES) {
      break;
    }
    releaseEntry(entry);
  }
}

function notifyEntry(entry: ArtworkCacheEntry): void {
  for (const listener of entry.listeners) {
    listener();
  }
}

function createEntry(sourceUrl: string): ArtworkCacheEntry {
  const entry: ArtworkCacheEntry = {
    sourceUrl,
    status: "loading",
    resolvedUrl: null,
    listeners: new Set(),
    abortController: new AbortController(),
    lastAccess: 0,
  };
  touchEntry(entry);
  artworkCache.set(sourceUrl, entry);

  void fetch(sourceUrl, {
    cache: "force-cache",
    credentials: "omit",
    signal: entry.abortController.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Artwork request failed with status ${response.status}`);
      }
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) {
        throw new Error("Artwork response is not an image");
      }
      return blob;
    })
    .then((blob) => {
      if (artworkCache.get(sourceUrl) !== entry) {
        return;
      }
      entry.status = "ready";
      entry.resolvedUrl = URL.createObjectURL(blob);
      touchEntry(entry);
      notifyEntry(entry);
      trimUnusedEntries();
    })
    .catch((error: unknown) => {
      if (artworkCache.get(sourceUrl) !== entry || entry.abortController.signal.aborted) {
        return;
      }
      // Preserve image availability when an origin does not permit CORS-backed blob reuse.
      entry.status = "error";
      entry.resolvedUrl = sourceUrl;
      touchEntry(entry);
      notifyEntry(entry);
      if (process.env.NODE_ENV === "development") {
        console.warn("Shared music artwork cache fell back to the source URL", error);
      }
      trimUnusedEntries();
    });

  return entry;
}

function getOrCreateEntry(sourceUrl: string): ArtworkCacheEntry {
  const existingEntry = artworkCache.get(sourceUrl);
  if (existingEntry) {
    touchEntry(existingEntry);
    return existingEntry;
  }
  return createEntry(sourceUrl);
}

export function getSharedMusicArtworkUrl(sourceUrl: string | null): string | null {
  if (!sourceUrl) {
    return null;
  }
  const entry = artworkCache.get(sourceUrl);
  if (!entry) {
    return null;
  }
  touchEntry(entry);
  return entry.resolvedUrl;
}

export function subscribeSharedMusicArtworkUrl(
  sourceUrl: string | null,
  listener: ArtworkCacheListener,
): () => void {
  if (!sourceUrl) {
    return () => undefined;
  }

  // One CORS fetch is shared by the page artwork, toolbar, panel, and Media Session.
  // Blob URLs keep repeated mounts and playback-state renders out of the network log.
  const entry = getOrCreateEntry(sourceUrl);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
    touchEntry(entry);
    trimUnusedEntries();
  };
}

export function clearSharedMusicArtworkCache(): void {
  for (const entry of [...artworkCache.values()]) {
    releaseEntry(entry);
  }
}
