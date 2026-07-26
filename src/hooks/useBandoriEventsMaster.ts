"use client";

import { useCachedFetch } from "@/hooks/useCachedFetch";
import { LONG_CLIENT_CACHE_POLICY } from "@/lib/api-cache";
import {
  BANDORI_EVENTS_MASTER_CACHE_KEY,
  BANDORI_EVENTS_MASTER_URL,
  parseBandoriEventSummaries,
  type BandoriEventSummary,
} from "@/lib/bandori-events";

const EMPTY_EVENTS: BandoriEventSummary[] = [];

export function useBandoriEventsMaster(): {
  events: BandoriEventSummary[];
  loaded: boolean;
  loading: boolean;
  refreshing: boolean;
  error: Error | null;
  refresh: () => void;
} {
  const result = useCachedFetch(
    BANDORI_EVENTS_MASTER_CACHE_KEY,
    BANDORI_EVENTS_MASTER_URL,
    parseBandoriEventSummaries,
    LONG_CLIENT_CACHE_POLICY,
  );

  return {
    events: result.data?.events ?? EMPTY_EVENTS,
    loaded: result.data !== null,
    loading: result.loading,
    refreshing: result.refreshing,
    error: result.error,
    refresh: result.refresh,
  };
}
