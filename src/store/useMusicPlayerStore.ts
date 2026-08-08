"use client";

import { create } from "zustand";
import {
  DEFAULT_MUSIC_PLAYER_MUTED,
  DEFAULT_MUSIC_PLAYER_REPEAT_MODE,
  DEFAULT_MUSIC_PLAYER_VOLUME,
  MUSIC_PLAYER_TEMPORARY_QUEUE_ID,
  type MusicPlayerItem,
  type MusicPlayerPreferencesSnapshot,
  type MusicPlayerQueueSnapshot,
  type MusicPlayerRepeatMode,
  type MusicPlayerStatus,
} from "@/lib/music-player-contract";
import {
  clearMusicPlayerQueueSnapshot,
  readMusicPlayerPreferencesSnapshot,
  readMusicPlayerQueueSnapshot,
  writeMusicPlayerPreferencesSnapshot,
  writeMusicPlayerQueueSnapshot,
} from "@/lib/music-player-persistence";

export type MusicPlayerCommand = {
  requestId: number;
  restartRequestId: number;
  type: "restart" | "resume" | "pause" | "seek" | "clear";
  positionSeconds?: number;
};

type MusicPlayerStore = {
  queueId: string;
  queue: MusicPlayerItem[];
  currentIndex: number | null;
  status: MusicPlayerStatus;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  repeatMode: MusicPlayerRepeatMode;
  hydrated: boolean;
  command: MusicPlayerCommand | null;
  hydrate: () => void;
  applyExternalQueueSnapshot: (snapshot: MusicPlayerQueueSnapshot | null) => void;
  applyExternalPreferencesSnapshot: (snapshot: MusicPlayerPreferencesSnapshot | null) => void;
  refreshQueueArtwork: (artworkUrlsByItemId: Readonly<Record<string, string>>) => void;
  playQueueFromStart: (items: MusicPlayerItem[], currentIndex: number) => void;
  requestTogglePlayback: () => void;
  requestPause: () => void;
  requestSeek: (positionSeconds: number) => void;
  requestPrevious: () => void;
  requestNext: () => void;
  clear: () => void;
  cycleRepeatMode: () => void;
  setVolume: (volume: number) => void;
  toggleMuted: () => void;
  setPlaybackStatus: (status: MusicPlayerStatus) => void;
  setPlaybackTime: (currentTime: number, duration?: number) => void;
  handleTrackEnded: () => void;
};

function getBrowserStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function clampVolume(volume: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : DEFAULT_MUSIC_PLAYER_VOLUME));
}

function createCommand(
  previousCommand: MusicPlayerCommand | null,
  type: MusicPlayerCommand["type"],
  positionSeconds?: number,
): MusicPlayerCommand {
  const requestId = (previousCommand?.requestId ?? 0) + 1;
  return {
    requestId,
    restartRequestId: type === "restart"
      ? requestId
      : previousCommand?.restartRequestId ?? 0,
    type,
    ...(positionSeconds === undefined ? {} : { positionSeconds }),
  };
}

function persistQueue(state: Pick<MusicPlayerStore, "queue" | "currentIndex">): void {
  const storage = getBrowserStorage();
  if (storage) {
    writeMusicPlayerQueueSnapshot(storage, state.queue, state.currentIndex);
  }
}

function persistPreferences(
  state: Pick<MusicPlayerStore, "volume" | "muted" | "repeatMode">,
): void {
  const storage = getBrowserStorage();
  if (storage) {
    writeMusicPlayerPreferencesSnapshot(storage, state.volume, state.muted, state.repeatMode);
  }
}

function hasSameActiveTrack(
  state: Pick<MusicPlayerStore, "queue" | "currentIndex">,
  queue: readonly MusicPlayerItem[],
  currentIndex: number | null,
): boolean {
  const activeItem = state.currentIndex === null
    ? null
    : state.queue[state.currentIndex] ?? null;
  const incomingActiveItem = currentIndex === null
    ? null
    : queue[currentIndex] ?? null;

  return activeItem !== null
    && incomingActiveItem !== null
    && activeItem.id === incomingActiveItem.id
    && activeItem.sourceUrl === incomingActiveItem.sourceUrl;
}

export const useMusicPlayerStore = create<MusicPlayerStore>((set, get) => ({
  queueId: MUSIC_PLAYER_TEMPORARY_QUEUE_ID,
  queue: [],
  currentIndex: null,
  status: "idle",
  currentTime: 0,
  duration: 0,
  volume: DEFAULT_MUSIC_PLAYER_VOLUME,
  muted: DEFAULT_MUSIC_PLAYER_MUTED,
  repeatMode: DEFAULT_MUSIC_PLAYER_REPEAT_MODE,
  hydrated: false,
  command: null,

  hydrate: () => {
    if (get().hydrated) {
      return;
    }

    const storage = getBrowserStorage();
    const queueSnapshot = storage ? readMusicPlayerQueueSnapshot(storage) : null;
    const preferencesSnapshot = storage ? readMusicPlayerPreferencesSnapshot(storage) : null;
    const queue = queueSnapshot?.items ?? [];
    const currentIndex = queueSnapshot?.currentIndex ?? null;
    const currentItem = currentIndex === null ? null : queue[currentIndex] ?? null;

    set({
      queueId: queueSnapshot?.queueId ?? MUSIC_PLAYER_TEMPORARY_QUEUE_ID,
      queue,
      currentIndex: currentItem ? currentIndex : null,
      status: currentItem ? "paused" : "idle",
      currentTime: 0,
      duration: currentItem?.durationSeconds ?? 0,
      volume: preferencesSnapshot?.volume ?? DEFAULT_MUSIC_PLAYER_VOLUME,
      muted: preferencesSnapshot?.muted ?? DEFAULT_MUSIC_PLAYER_MUTED,
      repeatMode: preferencesSnapshot?.repeatMode ?? DEFAULT_MUSIC_PLAYER_REPEAT_MODE,
      hydrated: true,
      command: null,
    });
  },

  applyExternalQueueSnapshot: (snapshot) => {
    const queue = snapshot?.items ?? [];
    const currentIndex = snapshot?.currentIndex ?? null;
    const currentItem = currentIndex === null ? null : queue[currentIndex] ?? null;
    const state = get();

    if (hasSameActiveTrack(state, queue, currentIndex)) {
      set({
        queueId: snapshot?.queueId ?? MUSIC_PLAYER_TEMPORARY_QUEUE_ID,
        queue,
        currentIndex,
      });
      return;
    }

    set({
      queueId: snapshot?.queueId ?? MUSIC_PLAYER_TEMPORARY_QUEUE_ID,
      queue,
      currentIndex: currentItem ? currentIndex : null,
      status: currentItem ? "paused" : "idle",
      currentTime: 0,
      duration: currentItem?.durationSeconds ?? 0,
      command: null,
    });
  },

  applyExternalPreferencesSnapshot: (snapshot) => {
    if (!snapshot) {
      set({
        volume: DEFAULT_MUSIC_PLAYER_VOLUME,
        muted: DEFAULT_MUSIC_PLAYER_MUTED,
        repeatMode: DEFAULT_MUSIC_PLAYER_REPEAT_MODE,
      });
      return;
    }
    set({
      volume: snapshot.volume,
      muted: snapshot.muted,
      repeatMode: snapshot.repeatMode,
    });
  },

  refreshQueueArtwork: (artworkUrlsByItemId) => {
    const state = get();
    let changed = false;
    const queue = state.queue.map((item) => {
      const artworkUrl = artworkUrlsByItemId[item.id];
      if (!artworkUrl || artworkUrl === item.artworkUrl) {
        return item;
      }
      changed = true;
      return { ...item, artworkUrl };
    });
    if (!changed) {
      return;
    }
    set({ queue });
    persistQueue({ queue, currentIndex: state.currentIndex });
  },

  playQueueFromStart: (items, currentIndex) => {
    if (
      items.length === 0
      || currentIndex < 0
      || currentIndex >= items.length
      || !Number.isSafeInteger(currentIndex)
    ) {
      return;
    }

    set((state) => ({
      queueId: MUSIC_PLAYER_TEMPORARY_QUEUE_ID,
      queue: [...items],
      currentIndex,
      status: "loading",
      currentTime: 0,
      duration: items[currentIndex]?.durationSeconds ?? 0,
      command: createCommand(state.command, "restart"),
    }));
    persistQueue(get());
  },

  requestTogglePlayback: () => {
    const state = get();
    if (state.currentIndex === null || !state.queue[state.currentIndex]) {
      return;
    }
    const type = state.status === "playing" || state.status === "loading"
      ? "pause"
      : state.status === "ended" || state.status === "error"
        ? "restart"
        : "resume";
    set({
      status: type === "pause" ? "paused" : "loading",
      command: createCommand(state.command, type),
    });
  },

  requestPause: () => {
    const state = get();
    if (state.currentIndex === null) {
      return;
    }
    set({
      status: "paused",
      command: createCommand(state.command, "pause"),
    });
  },

  requestSeek: (positionSeconds) => {
    const state = get();
    if (state.currentIndex === null || state.status === "error") {
      return;
    }
    const duration = Math.max(0, state.duration);
    const nextPosition = Math.min(duration, Math.max(0, positionSeconds));
    set({
      currentTime: nextPosition,
      command: createCommand(state.command, "seek", nextPosition),
    });
  },

  requestPrevious: () => {
    const state = get();
    if (state.currentIndex === null || state.queue.length === 0) {
      return;
    }
    const isFirst = state.currentIndex <= 0;
    const nextIndex = isFirst ? state.queue.length - 1 : state.currentIndex - 1;
    set({
      currentIndex: nextIndex,
      status: "loading",
      currentTime: 0,
      duration: state.queue[nextIndex]?.durationSeconds ?? 0,
      command: createCommand(state.command, "restart"),
    });
    persistQueue(get());
  },

  requestNext: () => {
    const state = get();
    if (state.currentIndex === null || state.queue.length === 0) {
      return;
    }
    const isLast = state.currentIndex >= state.queue.length - 1;
    const nextIndex = isLast ? 0 : state.currentIndex + 1;
    set({
      currentIndex: nextIndex,
      status: "loading",
      currentTime: 0,
      duration: state.queue[nextIndex]?.durationSeconds ?? 0,
      command: createCommand(state.command, "restart"),
    });
    persistQueue(get());
  },

  clear: () => {
    const state = get();
    set({
      queueId: MUSIC_PLAYER_TEMPORARY_QUEUE_ID,
      queue: [],
      currentIndex: null,
      status: "idle",
      currentTime: 0,
      duration: 0,
      command: createCommand(state.command, "clear"),
    });
    const storage = getBrowserStorage();
    if (storage) {
      clearMusicPlayerQueueSnapshot(storage);
    }
  },

  cycleRepeatMode: () => {
    const state = get();
    const repeatMode: MusicPlayerRepeatMode = state.repeatMode === "off"
      ? "all"
      : state.repeatMode === "all"
        ? "one"
        : "off";
    set({ repeatMode });
    persistPreferences(get());
  },

  setVolume: (volume) => {
    set({ volume: clampVolume(volume) });
    persistPreferences(get());
  },

  toggleMuted: () => {
    set((state) => ({ muted: !state.muted }));
    persistPreferences(get());
  },

  setPlaybackStatus: (status) => set({ status }),

  setPlaybackTime: (currentTime, duration) => set((state) => ({
    currentTime: Math.max(0, Number.isFinite(currentTime) ? currentTime : 0),
    duration: duration === undefined
      ? state.duration
      : Math.max(0, Number.isFinite(duration) ? duration : state.duration),
  })),

  handleTrackEnded: () => {
    const state = get();
    if (state.currentIndex === null) {
      return;
    }
    if (state.repeatMode === "one") {
      set({
        status: "loading",
        currentTime: 0,
        command: createCommand(state.command, "restart"),
      });
      return;
    }
    if (state.currentIndex < state.queue.length - 1 || state.repeatMode === "all") {
      const nextIndex = state.currentIndex < state.queue.length - 1 ? state.currentIndex + 1 : 0;
      set({
        currentIndex: nextIndex,
        status: "loading",
        currentTime: 0,
        duration: state.queue[nextIndex]?.durationSeconds ?? 0,
        command: createCommand(state.command, "restart"),
      });
      persistQueue(get());
      return;
    }
    set({
      status: "ended",
      currentTime: state.duration,
    });
  },
}));

export function selectMusicPlayerCurrentTrack(state: MusicPlayerStore): MusicPlayerItem | null {
  return state.currentIndex === null ? null : state.queue[state.currentIndex] ?? null;
}
