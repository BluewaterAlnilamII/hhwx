"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  buildBandoriPublicAssetIndexUrl,
  type BandoriCardsAssetIndex,
  type BandoriEventsAssetIndex,
} from "@/lib/bandori-public-asset-index";
import {
  bandoriCardsAssetIndexStore,
  bandoriEventsAssetIndexStore,
  type BandoriPublicAssetIndexStore,
  type BandoriPublicAssetIndexStoreState,
} from "@/lib/bandori-public-asset-index-client";

const EMPTY_INDEX_STATE: BandoriPublicAssetIndexStoreState<never> = {
  value: null,
  loadedAt: null,
  inFlight: null,
};

export type BandoriPublicAssetIndexHookResult<T> = {
  value: T | null;
  loadedAt: number | null;
  loading: boolean;
  refresh: () => void;
};

function useBandoriPublicAssetIndex<T>(
  indexUrl: string | null,
  store: BandoriPublicAssetIndexStore<T>,
): BandoriPublicAssetIndexHookResult<T> {
  const subscribe = useCallback((listener: () => void) => (
    indexUrl ? store.subscribe(indexUrl, listener) : () => undefined
  ), [indexUrl, store]);
  const getSnapshot = useCallback(() => (
    indexUrl
      ? store.getState(indexUrl)
      : EMPTY_INDEX_STATE as BandoriPublicAssetIndexStoreState<T>
  ), [indexUrl, store]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

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
    loading: state.value === null && state.inFlight !== null,
    refresh,
  };
}

export function useBandoriCardsAssetIndex(
  enabled = true,
): BandoriPublicAssetIndexHookResult<BandoriCardsAssetIndex> {
  return useBandoriPublicAssetIndex(
    enabled ? buildBandoriPublicAssetIndexUrl("cards") : null,
    bandoriCardsAssetIndexStore,
  );
}

export function useBandoriEventsAssetIndex(
  enabled = true,
): BandoriPublicAssetIndexHookResult<BandoriEventsAssetIndex> {
  return useBandoriPublicAssetIndex(
    enabled ? buildBandoriPublicAssetIndexUrl("events") : null,
    bandoriEventsAssetIndexStore,
  );
}
