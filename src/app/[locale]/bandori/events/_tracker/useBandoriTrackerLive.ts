"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BANDORI_TRACKER_LIVE_EVENT,
  buildBandoriTrackerLiveTopic,
  mergeBandoriTrackerLiveSnapshots,
  parseBandoriTrackerLiveSnapshot,
  type BandoriTrackerLiveSnapshot,
  type BandoriTrackerLiveTarget,
} from "@/lib/bandori-tracker-live-contract";
import {
  subscribeBandoriTrackerLive,
  type BandoriTrackerLiveListener,
  type BandoriTrackerLiveSubscription,
} from "@/lib/bandori-tracker-live-connection";
import { BANDORI_TRACKER_LATEST_TABLE } from "@/lib/supabase-table-names";
import { supabase } from "@/lib/supabase";
import { useGameStore } from "@/store/useGameStore";

type SnapshotListener = BandoriTrackerLiveListener<BandoriTrackerLiveSnapshot>;

function useBandoriTrackerLiveSubscription<TSnapshot>(
  subscription: BandoriTrackerLiveSubscription<TSnapshot> | null,
  enabled: boolean,
  listener: BandoriTrackerLiveListener<TSnapshot>,
): boolean {
  const userId = useGameStore((state) => state.userId);
  const authReady = useGameStore((state) => state.authReady);
  const shouldSubscribe = enabled
    && authReady
    && userId !== null
    && subscription !== null;

  useEffect(() => {
    if (!shouldSubscribe || !subscription) return;
    return subscribeBandoriTrackerLive(subscription, listener);
  }, [listener, shouldSubscribe, subscription, userId]);

  return shouldSubscribe;
}

export function useBandoriTrackerLiveSubscriptionSnapshot<TSnapshot>(
  subscription: BandoriTrackerLiveSubscription<TSnapshot> | null,
  enabled: boolean,
): TSnapshot | null {
  const [state, setState] = useState<{
    topic: string;
    snapshot: TSnapshot;
  } | null>(null);
  const topic = subscription?.topic ?? null;
  const handleSnapshot = useCallback((snapshot: TSnapshot) => {
    if (topic) setState({ topic, snapshot });
  }, [topic]);
  const hasLiveAccess = useBandoriTrackerLiveSubscription(
    subscription,
    enabled,
    handleSnapshot,
  );

  return hasLiveAccess && topic !== null && state?.topic === topic ? state.snapshot : null;
}

function useCutoffLiveSubscription(
  target: BandoriTrackerLiveTarget | null,
): BandoriTrackerLiveSubscription<BandoriTrackerLiveSnapshot> | null {
  const server = target?.server;
  const namespace = target?.namespace;
  const targetId = target?.targetId;
  const period = target?.period;

  return useMemo(() => {
    if (!server || !namespace || targetId === undefined) return null;
    const stableTarget: BandoriTrackerLiveTarget = {
      server,
      namespace,
      targetId,
      ...(namespace === "monthly" ? { period } : {}),
    };
    return {
      topic: buildBandoriTrackerLiveTopic(stableTarget),
      event: BANDORI_TRACKER_LIVE_EVENT,
      label: "bandoriTrackerLive",
      client: supabase,
      loadSnapshot: async () => {
        const query = supabase
          .from(BANDORI_TRACKER_LATEST_TABLE)
          .select("payload")
          .eq("server", stableTarget.server)
          .eq("namespace", stableTarget.namespace)
          .eq("target_id", stableTarget.targetId);
        if (stableTarget.namespace === "monthly") {
          query.eq("period", stableTarget.period ?? "");
        }
        const { data, error } = await query.maybeSingle();
        if (error) throw error;
        return data?.payload ?? null;
      },
      parseSnapshot: (value: unknown) => parseBandoriTrackerLiveSnapshot(value, stableTarget),
      mergeSnapshots: mergeBandoriTrackerLiveSnapshots,
      getRevision: (snapshot: BandoriTrackerLiveSnapshot) => snapshot.revision,
    };
  }, [namespace, period, server, targetId]);
}

export function useBandoriTrackerLiveListener(
  target: BandoriTrackerLiveTarget | null,
  enabled: boolean,
  listener: SnapshotListener,
): boolean {
  return useBandoriTrackerLiveSubscription(
    useCutoffLiveSubscription(target),
    enabled,
    listener,
  );
}
