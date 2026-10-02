"use client";

export type PublicAssetIndexStoreState<T> = {
  value: T | null;
  loadedAt: number | null;
  inFlight: Promise<T> | null;
  error: Error | null;
};

type StoreEntry<T> = {
  state: PublicAssetIndexStoreState<T>;
  listeners: Set<() => void>;
  requestSequence: number;
};

export type PublicAssetIndexStore<T> = {
  getState: (indexUrl: string) => PublicAssetIndexStoreState<T>;
  subscribe: (indexUrl: string, listener: () => void) => () => void;
  load: (indexUrl: string, options?: { refresh?: boolean }) => Promise<T>;
};

type CreatePublicAssetIndexStoreOptions<T> = {
  parse: (value: unknown) => T;
  fetcher?: typeof fetch;
  now?: () => number;
};

function createEmptyState<T>(): PublicAssetIndexStoreState<T> {
  return {
    value: null,
    loadedAt: null,
    inFlight: null,
    error: null,
  };
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Browser-only index cache. Each URL owns one first-load promise, while a
 * failed promise is evicted so a later mount or explicit refresh can retry.
 * A successful value remains stable for the current page lifetime. Explicit
 * refreshes revalidate the HTTP cache, and failures retain the last parsed
 * index instead of rolling the UI back to placeholders.
 */
export function createPublicAssetIndexStore<T>({
  parse,
  fetcher = fetch,
  now = Date.now,
}: CreatePublicAssetIndexStoreOptions<T>): PublicAssetIndexStore<T> {
  const entries = new Map<string, StoreEntry<T>>();

  const getEntry = (indexUrl: string): StoreEntry<T> => {
    const existing = entries.get(indexUrl);
    if (existing) {
      return existing;
    }
    const created: StoreEntry<T> = {
      state: createEmptyState<T>(),
      listeners: new Set(),
      requestSequence: 0,
    };
    entries.set(indexUrl, created);
    return created;
  };

  const publish = (
    entry: StoreEntry<T>,
    state: PublicAssetIndexStoreState<T>,
  ): void => {
    entry.state = state;
    entry.listeners.forEach((listener) => listener());
  };

  const load = (
    indexUrl: string,
    options?: { refresh?: boolean },
  ): Promise<T> => {
    const entry = getEntry(indexUrl);
    if (entry.state.inFlight) {
      return entry.state.inFlight;
    }
    if (entry.state.value && !options?.refresh) {
      return Promise.resolve(entry.state.value);
    }

    const requestSequence = entry.requestSequence + 1;
    entry.requestSequence = requestSequence;
    const request: Promise<T> = fetcher(indexUrl, {
      cache: options?.refresh ? "no-cache" : "default",
      credentials: "omit",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Public asset index request failed: HTTP ${response.status}`);
        }
        return parse(await response.json());
      })
      .then((value) => {
        if (
          entry.requestSequence === requestSequence
          && entry.state.inFlight === request
        ) {
          publish(entry, {
            value,
            loadedAt: now(),
            inFlight: request,
            error: null,
          });
        }
        return value;
      })
      .catch((error: unknown) => {
        if (
          entry.requestSequence === requestSequence
          && entry.state.inFlight === request
        ) {
          publish(entry, {
            value: entry.state.value,
            loadedAt: entry.state.loadedAt,
            inFlight: request,
            error: normalizeError(error),
          });
        }
        throw error;
      })
      .finally(() => {
        if (
          entry.requestSequence === requestSequence
          && entry.state.inFlight === request
        ) {
          publish(entry, {
            value: entry.state.value,
            loadedAt: entry.state.loadedAt,
            inFlight: null,
            error: entry.state.error,
          });
        }
      });

    publish(entry, {
      value: entry.state.value,
      loadedAt: entry.state.loadedAt,
      inFlight: request,
      error: null,
    });
    return request;
  };

  return {
    getState: (indexUrl) => getEntry(indexUrl).state,
    subscribe: (indexUrl, listener) => {
      const entry = getEntry(indexUrl);
      entry.listeners.add(listener);
      return () => entry.listeners.delete(listener);
    },
    load,
  };
}
