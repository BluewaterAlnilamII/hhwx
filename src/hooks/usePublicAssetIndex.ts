"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { PublicAssetIndexStore, PublicAssetIndexStoreState } from "@/lib/public-asset-index-client";

const EMPTY_INDEX_STATE: PublicAssetIndexStoreState<never> = {
  value: null,
  loadedAt: null,
  inFlight: null,
  error: null,
};

export type PublicAssetIndexHookResult<T> = {
  value: T | null;
  loadedAt: number | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
};

export function usePublicAssetIndex<T>(
  indexUrl: string | null,
  store: PublicAssetIndexStore<T>,
): PublicAssetIndexHookResult<T> {
  const subscribe = useCallback((listener: () => void) => (
    indexUrl ? store.subscribe(indexUrl, listener) : () => undefined
  ), [indexUrl, store]);
  const getSnapshot = useCallback(() => (
    indexUrl
      ? store.getState(indexUrl)
      : EMPTY_INDEX_STATE as PublicAssetIndexStoreState<T>
  ), [indexUrl, store]);
  // Hydration must start from the server's empty state, even with a warm browser cache.
  const state = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY_INDEX_STATE as PublicAssetIndexStoreState<T>,
  );

  useEffect(() => {
    if (!indexUrl) {
      return;
    }
    void store.load(indexUrl).catch(() => undefined);
  }, [indexUrl, store]);

  const refresh = useCallback(() => {
    if (indexUrl) {
      void store.load(indexUrl, { refresh: true }).catch(() => undefined);
    }
  }, [indexUrl, store]);

  return {
    value: state.value,
    loadedAt: state.loadedAt,
    loading: Boolean(indexUrl) && state.value === null && state.error === null,
    error: state.error,
    refresh,
  };
}
