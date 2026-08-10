import type { RealtimeChannel } from "@supabase/supabase-js";

type BandoriTrackerLiveClient = {
  realtime: {
    setAuth: () => Promise<void>;
  };
  channel: (
    topic: string,
    options: { config: { private: true } },
  ) => RealtimeChannel;
  removeChannel: (channel: RealtimeChannel) => Promise<unknown>;
};

export type BandoriTrackerLiveSubscription<TSnapshot> = {
  topic: string;
  event: string;
  label: string;
  client: BandoriTrackerLiveClient;
  loadSnapshot: () => Promise<unknown | null>;
  parseSnapshot: (value: unknown) => TSnapshot;
  mergeSnapshots: (
    current: TSnapshot | null,
    incoming: TSnapshot,
  ) => TSnapshot;
  getRevision: (snapshot: TSnapshot) => number;
};

export type BandoriTrackerLiveListener<TSnapshot> = (snapshot: TSnapshot) => void;

type LiveEntry = {
  topic: string;
  event: string;
  label: string;
  client: BandoriTrackerLiveClient;
  loadSnapshot: () => Promise<unknown | null>;
  parseSnapshot: (value: unknown) => unknown;
  mergeSnapshots: (current: unknown | null, incoming: unknown) => unknown;
  getRevision: (snapshot: unknown) => number;
  listeners: Set<BandoriTrackerLiveListener<unknown>>;
  snapshot: unknown | null;
  buffered: unknown[];
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

export async function authorizeBandoriTrackerRealtimeConnection(
  setAuth: () => Promise<void>,
  isCurrent: () => boolean,
): Promise<boolean> {
  await setAuth();
  return isCurrent();
}

function notify(entry: LiveEntry): void {
  if (!entry.snapshot) return;
  for (const listener of entry.listeners) listener(entry.snapshot);
}

function applySnapshot(entry: LiveEntry, snapshot: unknown): void {
  let next: unknown;
  try {
    next = entry.mergeSnapshots(entry.snapshot, snapshot);
  } catch (error) {
    console.error(`[${entry.label}] revision conflict for ${entry.topic}:`, error);
    return;
  }
  if (next === entry.snapshot) return;
  entry.snapshot = next;
  entry.lastAccessedAt = Date.now();
  notify(entry);
}

function parseIncomingSnapshot(entry: LiveEntry, value: unknown): unknown | null {
  try {
    return entry.parseSnapshot(value);
  } catch (error) {
    console.error(`[${entry.label}] rejected payload for ${entry.topic}:`, error);
    return null;
  }
}

async function loadSnapshot(entry: LiveEntry, channel: RealtimeChannel): Promise<void> {
  if (entry.isSnapshotLoading) return;
  entry.isSnapshotLoading = true;

  const candidates: unknown[] = [];
  let snapshotError: unknown = null;
  try {
    const rawSnapshot = await entry.loadSnapshot();
    if (entry.channel !== channel) return;
    if (rawSnapshot !== null) {
      const snapshot = parseIncomingSnapshot(entry, rawSnapshot);
      if (snapshot) candidates.push(snapshot);
    }
  } catch (error) {
    if (entry.channel !== channel) return;
    snapshotError = error;
    console.error(`[${entry.label}] snapshot query failed for ${entry.topic}:`, error);
  }

  candidates.push(...entry.buffered);
  entry.buffered = [];
  entry.isSnapshotLoaded = true;
  entry.isSnapshotLoading = false;
  candidates
    .sort((left, right) => entry.getRevision(left) - entry.getRevision(right))
    .forEach((snapshot) => applySnapshot(entry, snapshot));

  if (snapshotError && entry.snapshotRetryCount < MAX_SNAPSHOT_RETRIES) {
    entry.snapshotRetryCount += 1;
    const delayMs = 1_000 * 2 ** (entry.snapshotRetryCount - 1);
    entry.snapshotRetryTimer = window.setTimeout(() => {
      entry.snapshotRetryTimer = null;
      if (entry.channel === channel && entry.listeners.size > 0) {
        void loadSnapshot(entry, channel);
      }
    }, delayMs);
  } else if (!snapshotError) {
    entry.snapshotRetryCount = 0;
    if (entry.snapshotRetryTimer !== null) {
      window.clearTimeout(entry.snapshotRetryTimer);
      entry.snapshotRetryTimer = null;
    }
  }
}

function disconnectEntry(entry: LiveEntry): void {
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
  if (channel) void entry.client.removeChannel(channel);
}

async function connectEntry(entry: LiveEntry): Promise<void> {
  if (entry.channel || entry.isConnecting || entry.listeners.size === 0) return;
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;

  const connectionGeneration = entry.connectionGeneration + 1;
  entry.connectionGeneration = connectionGeneration;
  entry.isConnecting = true;

  try {
    // Private Realtime authorization must use the restored user session rather
    // than the publishable-key fallback that exists when the client is created.
    const isCurrent = await authorizeBandoriTrackerRealtimeConnection(
      () => entry.client.realtime.setAuth(),
      () => entry.connectionGeneration === connectionGeneration && entry.listeners.size > 0,
    );
    if (!isCurrent || (typeof document !== "undefined" && document.visibilityState === "hidden")) {
      return;
    }

    entry.isSnapshotLoaded = false;
    entry.buffered = [];
    const channel = entry.client
      .channel(entry.topic, { config: { private: true } })
      .on("broadcast", { event: entry.event }, (message) => {
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
        // Subscribe before SELECT and buffer broadcasts until the bootstrap
        // completes so a slower database read cannot roll the UI backwards.
        void loadSnapshot(entry, channel);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error(`[${entry.label}] channel ${status} for ${entry.topic}:`, error);
      }
    });
  } catch (error) {
    if (entry.connectionGeneration === connectionGeneration) {
      console.error(`[${entry.label}] failed to authorize ${entry.topic}:`, error);
    }
  } finally {
    if (entry.connectionGeneration === connectionGeneration) {
      entry.isConnecting = false;
    }
  }
}

function trimUnusedEntries(): void {
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

function installVisibilityListener(): void {
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

function createEntry<TSnapshot>(
  subscription: BandoriTrackerLiveSubscription<TSnapshot>,
): LiveEntry {
  return {
    topic: subscription.topic,
    event: subscription.event,
    label: subscription.label,
    client: subscription.client,
    loadSnapshot: subscription.loadSnapshot,
    parseSnapshot: subscription.parseSnapshot as (value: unknown) => unknown,
    mergeSnapshots: subscription.mergeSnapshots as (
      current: unknown | null,
      incoming: unknown,
    ) => unknown,
    getRevision: subscription.getRevision as (snapshot: unknown) => number,
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
}

export function subscribeBandoriTrackerLive<TSnapshot>(
  subscription: BandoriTrackerLiveSubscription<TSnapshot>,
  listener: BandoriTrackerLiveListener<TSnapshot>,
): () => void {
  installVisibilityListener();
  let entry = entries.get(subscription.topic);
  if (!entry) {
    entry = createEntry(subscription);
    entries.set(subscription.topic, entry);
  } else if (entry.event !== subscription.event || entry.client !== subscription.client) {
    throw new Error(`Conflicting Bandori tracker live subscription for ${subscription.topic}`);
  }

  const untypedListener = listener as BandoriTrackerLiveListener<unknown>;
  entry.listeners.add(untypedListener);
  entry.lastAccessedAt = Date.now();
  if (entry.snapshot) untypedListener(entry.snapshot);
  void connectEntry(entry);

  return () => {
    entry?.listeners.delete(untypedListener);
    if (entry && entry.listeners.size === 0) disconnectEntry(entry);
    trimUnusedEntries();
  };
}
