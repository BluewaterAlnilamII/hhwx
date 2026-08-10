"use client";

import { useCachedFetch } from "@/hooks/useCachedFetch";
import { SESSION_CLIENT_CACHE_POLICY } from "@/lib/api-cache";
import { parseBandoriEventDetailResponse } from "./eventInfo";

export function useBandoriEventDetail(
  eventId: number | null,
  enabled: boolean,
) {
  return useCachedFetch<Record<string, unknown>>(
    enabled && eventId ? `bandori-master-event-detail-${eventId}` : null,
    enabled && eventId ? `/api/bandori/master/events/${eventId}` : null,
    parseBandoriEventDetailResponse,
    SESSION_CLIENT_CACHE_POLICY,
  );
}
