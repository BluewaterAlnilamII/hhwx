"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  BANDORI_TRACKER_LIVE_EVENT,
  buildBandoriTrackerLiveTopic,
  mergeBandoriTrackerLiveSnapshots,
  parseBandoriTrackerLiveSnapshot,
  type BandoriTrackerLiveSnapshot,
  type BandoriTrackerLiveTarget,
} from "@/lib/bandori-tracker-live-contract";
import { BANDORI_TRACKER_LATEST_TABLE } from "@/lib/supabase-table-names";
import { authorizeBandoriTrackerRealtimeConnection } from "@/lib/bandori-tracker-live-connection";
import { supabase } from "@/lib/supabase";
import { useGameStore } from "@/store/useGameStore";

type SnapshotListener = (snapshot: BandoriTrackerLiveSnapshot) => void;

type LiveEntry = {
  target: BandoriTrackerLiveTarget;
  topic: string;
  listeners: Set<SnapshotListener>;
  snapshot: BandoriTrackerLiveSnapshot | null;
  buffered: BandoriTrackerLiveSnapshot[];
  channel: RealtimeChannel | null;
  connectionGeneration: number;
  isConnecting: boolean;
  isSnapshotLoaded: boolean;
  isSnapshotLoading: boolean;
  snapshotRetryCount: number;
  snapshotRetryTimer: number | null;
  lastAccessedAt: number;
};

const MAX_CACHED_LIVE_ENTRIES = 16;
const HIDDEN_DISCONNECT_DELAY_MS = 60_000;
const MAX_SNAPSHOT_RETRIES = 3;
const entries = new Map<string, LiveEntry>();
let visibilityListenerInstalled = false;
let hiddenDisconnectTimer: number | null = null;

export function isBandoriTrackerBroadcastEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BANDORI_TRACKER_LIVE_SOURCE === "broadcast";
}

function notify(entry: LiveEntry) {
  if (!entry.snapshot) return;
  for (const listener of entry.listeners) listener(entry.snapshot);
}

function applySnapshot(entry: LiveEntry, snapshot: BandoriTrackerLiveSnapshot) {
  let next: BandoriTrackerLiveSnapshot;
  try {
    next = mergeBandoriTrackerLiveSnapshots(entry.snapshot, snapshot);
  } catch (error) {
    console.error(`[bandoriTrackerLive] revision conflict for ${entry.topic}:`, error);
    return;
  }
  if (next === entry.snapshot) return;
  entry.snapshot = next;
  entry.lastAccessedAt = Date.now();
  notify(entry);
}

function parseIncomingSnapshot(entry: LiveEntry, value: unknown): BandoriTrackerLiveSnapshot | null {
  try {
    return parseBandoriTrackerLiveSnapshot(value, entry.target);
  } catch (error) {
    console.error(`[bandoriTrackerLive] rejected payload for ${entry.topic}:`, error);
    return null;
  }
}

async function loadSnapshot(entry: LiveEntry, channel: RealtimeChannel) {
  if (entry.isSnapshotLoading) return;
  entry.isSnapshotLoading = true;

  const query = supabase
    .from(BANDORI_TRACKER_LATEST_TABLE)
    .select("payload")
    .eq("server", entry.target.server)
    .eq("namespace", entry.target.namespace)
    .eq("target_id", entry.target.targetId);
  if (entry.target.namespace === "monthly") {
    query.eq("period", entry.target.period ?? "");
  }

  const { data, error } = await query.maybeSingle();
  if (entry.channel !== channel) return;

  const candidates: BandoriTrackerLiveSnapshot[] = [];
  if (error) {
    console.error(`[bandoriTrackerLive] snapshot query failed for ${entry.topic}:`, error);
  } else if (data?.payload) {
    const snapshot = parseIncomingSnapshot(entry, data.payload);
    if (snapshot) candidates.push(snapshot);
  }
  candidates.push(...entry.buffered);
  entry.buffered = [];
  entry.isSnapshotLoaded = true;
  entry.isSnapshotLoading = false;

  candidates
    .sort((left, right) => left.revision - right.revision)
    .forEach((snapshot) => applySnapshot(entry, snapshot));

  if (error && entry.snapshotRetryCount < MAX_SNAPSHOT_RETRIES) {
    entry.snapshotRetryCount += 1;
    const delayMs = 1_000 * 2 ** (entry.snapshotRetryCount - 1);
    entry.snapshotRetryTimer = window.setTimeout(() => {
      entry.snapshotRetryTimer = null;
      if (entry.channel === channel && entry.listeners.size > 0) {
        void loadSnapshot(entry, channel);
      }
    }, delayMs);
  } else if (!error) {
    entry.snapshotRetryCount = 0;
    if (entry.snapshotRetryTimer !== null) {
      window.clearTimeout(entry.snapshotRetryTimer);
      entry.snapshotRetryTimer = null;
    }
  }
}

function disconnectEntry(entry: LiveEntry) {
  entry.connectionGeneration += 1;
  entry.isConnecting = false;
  const channel = entry.channel;
  entry.channel = null;
  entry.isSnapshotLoaded = false;
  entry.isSnapshotLoading = false;
  entry.buffered = [];
  entry.snapshotRetryCount = 0;
  if (entry.snapshotRetryTimer !== null) {
    window.clearTimeout(entry.snapshotRetryTimer);
    entry.snapshotRetryTimer = null;
  }
  if (channel) void supabase.removeChannel(channel);
}

async function connectEntry(entry: LiveEntry) {
  if (entry.channel || entry.isConnecting || entry.listeners.size === 0) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

  const connectionGeneration = entry.connectionGeneration + 1;
  entry.connectionGeneration = connectionGeneration;
  entry.isConnecting = true;

  try {
    // Private Realtime authorization must use the restored user session rather
    // than the publishable-key fallback that exists when the client is created.
    const isCurrent = await authorizeBandoriTrackerRealtimeConnection(
      () => supabase.realtime.setAuth(),
      () => (
        entry.connectionGeneration === connectionGeneration
        && entry.listeners.size > 0
      ),
    );
    if (!isCurrent || (typeof document !== "undefined" && document.visibilityState === "hidden")) {
      return;
    }

    entry.isSnapshotLoaded = false;
    entry.buffered = [];
    const channel = supabase
      .channel(entry.topic, { config: { private: true } })
      .on("broadcast", { event: BANDORI_TRACKER_LIVE_EVENT }, (message) => {
        const rawPayload = message && typeof message === "object" && "payload" in message
          ? message.payload
          : message;
        const snapshot = parseIncomingSnapshot(entry, rawPayload);
        if (!snapshot) return;
        if (!entry.isSnapshotLoaded) {
          entry.buffered.push(snapshot);
          return;
        }
        applySnapshot(entry, snapshot);
      });
    entry.channel = channel;
    channel.subscribe((status, error) => {
      if (entry.channel !== channel) return;
      if (status === "SUBSCRIBED") {
        void loadSnapshot(entry, channel);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error(`[bandoriTrackerLive] channel ${status} for ${entry.topic}:`, error);
      }
    });
  } catch (error) {
    if (entry.connectionGeneration === connectionGeneration) {
      console.error(`[bandoriTrackerLive] failed to authorize ${entry.topic}:`, error);
    }
  } finally {
    if (entry.connectionGeneration === connectionGeneration) {
      entry.isConnecting = false;
    }
  }
}

function trimUnusedEntries() {
  const unused = Array.from(entries.values())
    .filter((entry) => entry.listeners.size === 0)
    .sort((left, right) => left.lastAccessedAt - right.lastAccessedAt);
  while (entries.size > MAX_CACHED_LIVE_ENTRIES && unused.length > 0) {
    const entry = unused.shift();
    if (!entry) break;
    disconnectEntry(entry);
    entries.delete(entry.topic);
  }
}

function installVisibilityListener() {
  if (visibilityListenerInstalled || typeof document === "undefined") return;
  visibilityListenerInstalled = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (hiddenDisconnectTimer !== null) window.clearTimeout(hiddenDisconnectTimer);
      hiddenDisconnectTimer = window.setTimeout(() => {
        hiddenDisconnectTimer = null;
        for (const entry of entries.values()) disconnectEntry(entry);
      }, HIDDEN_DISCONNECT_DELAY_MS);
      return;
    }

    if (hiddenDisconnectTimer !== null) {
      window.clearTimeout(hiddenDisconnectTimer);
      hiddenDisconnectTimer = null;
    }
    for (const entry of entries.values()) void connectEntry(entry);
  });
}

function subscribeToTarget(target: BandoriTrackerLiveTarget, listener: SnapshotListener): () => void {
  installVisibilityListener();
  const topic = buildBandoriTrackerLiveTopic(target);
  let entry = entries.get(topic);
  if (!entry) {
    entry = {
      target,
      topic,
      listeners: new Set(),
      snapshot: null,
      buffered: [],
      channel: null,
      connectionGeneration: 0,
      isConnecting: false,
      isSnapshotLoaded: false,
      isSnapshotLoading: false,
      snapshotRetryCount: 0,
      snapshotRetryTimer: null,
      lastAccessedAt: Date.now(),
    };
    entries.set(topic, entry);
  }

  entry.listeners.add(listener);
  entry.lastAccessedAt = Date.now();
  if (entry.snapshot) listener(entry.snapshot);
  void connectEntry(entry);

  return () => {
    entry?.listeners.delete(listener);
    if (entry && entry.listeners.size === 0) disconnectEntry(entry);
    trimUnusedEntries();
  };
}

export function useBandoriTrackerLive(
  target: BandoriTrackerLiveTarget | null,
  enabled = true,
): BandoriTrackerLiveSnapshot | null {
  const userId = useGameStore((state) => state.userId);
  const authReady = useGameStore((state) => state.authReady);
  const [state, setState] = useState<{
    topic: string;
    snapshot: BandoriTrackerLiveSnapshot;
  } | null>(null);
  const topic = target ? buildBandoriTrackerLiveTopic(target) : null;
  const shouldSubscribe = enabled
    && isBandoriTrackerBroadcastEnabled()
    && authReady
    && userId !== null
    && target !== null;

  useEffect(() => {
    if (!shouldSubscribe || !target) return;
    const subscribedTopic = buildBandoriTrackerLiveTopic(target);
    return subscribeToTarget(target, (snapshot) => {
      setState({ topic: subscribedTopic, snapshot });
    });
  }, [shouldSubscribe, target, topic, userId]);

  return shouldSubscribe && topic !== null && state?.topic === topic ? state.snapshot : null;
}

export function useBandoriTrackerLiveListener(
  target: BandoriTrackerLiveTarget | null,
  enabled: boolean,
  listener: SnapshotListener,
): boolean {
  const userId = useGameStore((state) => state.userId);
  const authReady = useGameStore((state) => state.authReady);
  const topic = target ? buildBandoriTrackerLiveTopic(target) : null;
  const shouldSubscribe = enabled
    && isBandoriTrackerBroadcastEnabled()
    && authReady
    && userId !== null
    && target !== null;

  useEffect(() => {
    if (!shouldSubscribe || !target) return;
    return subscribeToTarget(target, listener);
  }, [listener, shouldSubscribe, target, topic, userId]);

  return shouldSubscribe;
}
