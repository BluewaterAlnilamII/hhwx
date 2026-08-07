"use client";

import { useMemo } from "react";
import { useCachedFetch } from "@/hooks/useCachedFetch";
import { LIVE_CLIENT_CACHE_POLICY } from "@/lib/api-cache";
import type { BandoriServer } from "@/lib/bandori-server";
import {
  parseBandoriTopDataPayload,
  type BandoriTopDataPayload,
} from "@/lib/bandori-topdata-contract";
import {
  BANDORI_TRACKER_TOPDATA_LIVE_EVENT,
  buildBandoriTrackerTopDataLiveTopic,
  mergeBandoriTopDataHistoryWithLiveSnapshot,
  mergeBandoriTrackerTopDataLiveSnapshots,
  parseBandoriTrackerTopDataLiveSnapshot,
  type BandoriTrackerTopDataLiveSnapshot,
} from "@/lib/bandori-tracker-topdata-live-contract";
import type { BandoriTrackerLiveSubscription } from "@/lib/bandori-tracker-live-connection";
import { BANDORI_TRACKER_TOPDATA_LATEST_TABLE } from "@/lib/supabase-table-names";
import { supabase } from "@/lib/supabase";
import { useBandoriTrackerLiveSubscriptionSnapshot } from "./useBandoriTrackerLive";

function useTopDataLiveSubscription(
  eventId: number | null,
  enabled: boolean,
): BandoriTrackerLiveSubscription<BandoriTrackerTopDataLiveSnapshot> | null {
  return useMemo(() => {
    if (!enabled || eventId === null) return null;
    return {
      topic: buildBandoriTrackerTopDataLiveTopic(eventId),
      event: BANDORI_TRACKER_TOPDATA_LIVE_EVENT,
      label: "bandoriTrackerTopDataLive",
      client: supabase,
      loadSnapshot: async () => {
        const { data, error } = await supabase
          .from(BANDORI_TRACKER_TOPDATA_LATEST_TABLE)
          .select("payload")
          .eq("server", "cn")
          .eq("event_id", eventId)
          .maybeSingle();
        if (error) throw error;
        return data?.payload ?? null;
      },
      parseSnapshot: (value: unknown) => {
        const snapshot = parseBandoriTrackerTopDataLiveSnapshot(value);
        if (snapshot.targetId !== eventId) {
          throw new Error("Bandori tracker topdata snapshot target does not match the subscription");
        }
        return snapshot;
      },
      mergeSnapshots: mergeBandoriTrackerTopDataLiveSnapshots,
      getRevision: (snapshot: BandoriTrackerTopDataLiveSnapshot) => snapshot.revision,
    };
  }, [enabled, eventId]);
}

export function useBandoriTop10Data(
  eventId: number | null,
  server: BandoriServer,
  enabled: boolean,
) {
  const canReadTopDataHistory = enabled && eventId !== null;
  const canUseTopDataLive = canReadTopDataHistory && server === 3;
  const cacheKey = canReadTopDataHistory ? `bandori-top10-history-${server}-${eventId}` : null;
  const url = canReadTopDataHistory
    ? `/api/bandori/tracker/topdata?server=${server}&event=${eventId}&type=event`
    : null;
  const history = useCachedFetch<BandoriTopDataPayload>(
    cacheKey,
    url,
    parseBandoriTopDataPayload,
    { ...LIVE_CLIENT_CACHE_POLICY },
  );
  const liveSubscription = useTopDataLiveSubscription(eventId, canUseTopDataLive);
  const liveSnapshot = useBandoriTrackerLiveSubscriptionSnapshot(
    liveSubscription,
    canUseTopDataLive,
  );
  const data = useMemo(() => (
    liveSnapshot
      ? mergeBandoriTopDataHistoryWithLiveSnapshot(history.data, liveSnapshot)
      : history.data
  ), [history.data, liveSnapshot]);

  return { ...history, data };
}
