"use client";

import {
  parseBandoriCardsAssetIndex,
  parseBandoriEventsAssetIndex,
  type BandoriCardsAssetIndex,
  type BandoriEventsAssetIndex,
} from "@/lib/bandori-public-asset-index";

export type BandoriPublicAssetIndexStoreState<T> = {
  value: T | null;
  loadedAt: number | null;
  inFlight: Promise<T> | null;
};

type StoreEntry<T> = {
  state: BandoriPublicAssetIndexStoreState<T>;
  listeners: Set<() => void>;
  requestSequence: number;
};

export type BandoriPublicAssetIndexStore<T> = {
  getState: (indexUrl: string) => BandoriPublicAssetIndexStoreState<T>;
  subscribe: (indexUrl: string, listener: () => void) => () => void;
  load: (indexUrl: string, options?: { refresh?: boolean }) => Promise<T>;
};

type CreateBandoriPublicAssetIndexStoreOptions<T> = {
  parse: (value: unknown) => T;
  fetcher?: typeof fetch;
  now?: () => number;
  freshnessMs?: number;
};

function createEmptyState<T>(): BandoriPublicAssetIndexStoreState<T> {
  return {
    value: null,
    loadedAt: null,
    inFlight: null,
  };
}

/**
 * Browser-only index cache. Each URL owns one first-load promise, while a
 * failed promise is evicted so a later mount or explicit refresh can retry.
 * Refresh failures retain the last parsed index instead of rolling the UI
 * back to placeholders.
 */
export function createBandoriPublicAssetIndexStore<T>({
  parse,
  fetcher = fetch,
  now = Date.now,
  freshnessMs = 60_000,
}: CreateBandoriPublicAssetIndexStoreOptions<T>): BandoriPublicAssetIndexStore<T> {
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
    state: BandoriPublicAssetIndexStoreState<T>,
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
    const isFresh = (
      entry.state.loadedAt !== null
      && now() - entry.state.loadedAt < freshnessMs
    );
    if (entry.state.value && !options?.refresh && isFresh) {
      return Promise.resolve(entry.state.value);
    }

    const requestSequence = entry.requestSequence + 1;
    entry.requestSequence = requestSequence;
    const request: Promise<T> = fetcher(indexUrl, {
      cache: "default",
      credentials: "omit",
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Bandori public asset index request failed: HTTP ${response.status}`);
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
          });
        }
        return value;
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
          });
        }
      });

    publish(entry, {
      value: entry.state.value,
      loadedAt: entry.state.loadedAt,
      inFlight: request,
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

export const bandoriCardsAssetIndexStore = createBandoriPublicAssetIndexStore<BandoriCardsAssetIndex>({
  parse: parseBandoriCardsAssetIndex,
});

export const bandoriEventsAssetIndexStore = createBandoriPublicAssetIndexStore<BandoriEventsAssetIndex>({
  parse: parseBandoriEventsAssetIndex,
});
