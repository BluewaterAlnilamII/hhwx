"use client";

import { useCachedFetch } from "@/hooks/useCachedFetch";
import { SESSION_CLIENT_CACHE_POLICY } from "@/lib/api-cache";
import {
  parseBandoriTopDataPayload,
  type BandoriTopDataPayload,
} from "@/lib/bandori-topdata-contract";
import type { BandoriServer } from "@/lib/bandori-server";

export function useBandoriTop10Data(
  eventId: number | null,
  server: BandoriServer,
  enabled: boolean,
) {
  // Phase one only has CN history. Other regional tracker shells deliberately
  // render the same empty state without issuing a request the API must reject.
  const canReadHistory = enabled && server === 3 && eventId !== null;
  const cacheKey = canReadHistory ? `bandori-top10-history-${server}-${eventId}` : null;
  const url = canReadHistory
    ? `/api/bandori/tracker/topdata?server=${server}&event=${eventId}&type=event`
    : null;

  return useCachedFetch<BandoriTopDataPayload>(
    cacheKey,
    url,
    parseBandoriTopDataPayload,
    { ...SESSION_CLIENT_CACHE_POLICY },
  );
}
