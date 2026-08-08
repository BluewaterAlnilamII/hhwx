"use client";

import { useEffect, useRef } from "react";
import {
  MUSIC_PLAYER_PREFERENCES_STORAGE_KEY,
  MUSIC_PLAYER_QUEUE_STORAGE_KEY,
  parseMusicPlayerPreferencesSnapshot,
  parseMusicPlayerQueueSnapshot,
} from "@/lib/music-player-contract";
import {
  createMusicPlayerPlaybackCoordinator,
  createMusicPlayerTabId,
} from "@/lib/music-player-tab-coordinator";
import {
  selectMusicPlayerCurrentTrack,
  useMusicPlayerStore,
} from "@/store/useMusicPlayerStore";

type PlaybackCoordinator = ReturnType<typeof createMusicPlayerPlaybackCoordinator>;

function updateMediaSessionPosition(audio: HTMLAudioElement): void {
  if (!("mediaSession" in navigator) || !Number.isFinite(audio.duration) || audio.duration <= 0) {
    return;
  }
  try {
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      playbackRate: audio.playbackRate,
      position: Math.min(audio.duration, Math.max(0, audio.currentTime)),
    });
  } catch {
    // Media Session support differs across browsers; playback does not depend on it.
  }
}

export default function MusicPlayerHost() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const coordinatorRef = useRef<PlaybackCoordinator | null>(null);
  const handledCommandIdRef = useRef(0);
  const playAttemptIdRef = useRef(0);
  const tabIdRef = useRef<string>("");
  const currentTrack = useMusicPlayerStore(selectMusicPlayerCurrentTrack);
  const command = useMusicPlayerStore((state) => state.command);
  const volume = useMusicPlayerStore((state) => state.volume);
  const muted = useMusicPlayerStore((state) => state.muted);
  const repeatMode = useMusicPlayerStore((state) => state.repeatMode);
  const hydrate = useMusicPlayerStore((state) => state.hydrate);
  const applyExternalQueueSnapshot = useMusicPlayerStore(
    (state) => state.applyExternalQueueSnapshot,
  );
  const applyExternalPreferencesSnapshot = useMusicPlayerStore(
    (state) => state.applyExternalPreferencesSnapshot,
  );

  useEffect(() => {
    hydrate();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === MUSIC_PLAYER_QUEUE_STORAGE_KEY) {
        const snapshot = parseMusicPlayerQueueSnapshot(event.newValue);
        if (snapshot || event.newValue === null) {
          applyExternalQueueSnapshot(snapshot);
        }
      } else if (event.key === MUSIC_PLAYER_PREFERENCES_STORAGE_KEY) {
        const snapshot = parseMusicPlayerPreferencesSnapshot(event.newValue);
        if (snapshot || event.newValue === null) {
          applyExternalPreferencesSnapshot(snapshot);
        }
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [applyExternalPreferencesSnapshot, applyExternalQueueSnapshot, hydrate]);

  useEffect(() => {
    tabIdRef.current = createMusicPlayerTabId();
    coordinatorRef.current = createMusicPlayerPlaybackCoordinator(
      tabIdRef.current,
      () => {
        playAttemptIdRef.current += 1;
        const audio = audioRef.current;
        if (audio && !audio.paused) {
          audio.pause();
        }
        const state = useMusicPlayerStore.getState();
        if (state.currentIndex !== null && state.status !== "error") {
          state.setPlaybackStatus("paused");
        }
      },
    );

    return () => {
      coordinatorRef.current?.dispose();
      coordinatorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    playAttemptIdRef.current += 1;
    audio.pause();
    audio.currentTime = 0;

    if (!currentTrack) {
      audio.removeAttribute("src");
      audio.load();
      return;
    }

    audio.src = currentTrack.sourceUrl;
    audio.load();
  }, [currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
      audio.muted = muted;
    }
  }, [muted, volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.loop = repeatMode === "one";
    }
  }, [repeatMode]);

  useEffect(() => {
    if (!command || handledCommandIdRef.current === command.requestId) {
      return;
    }
    handledCommandIdRef.current = command.requestId;

    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (command.type === "clear") {
      playAttemptIdRef.current += 1;
      audio.pause();
      audio.currentTime = 0;
      audio.removeAttribute("src");
      audio.load();
      return;
    }

    if (command.type === "pause") {
      playAttemptIdRef.current += 1;
      audio.pause();
      return;
    }

    if (command.type === "seek") {
      audio.currentTime = Math.max(0, command.positionSeconds ?? 0);
      updateMediaSessionPosition(audio);
      return;
    }

    if (!currentTrack) {
      return;
    }

    const attemptId = playAttemptIdRef.current + 1;
    playAttemptIdRef.current = attemptId;
    const play = async () => {
      if (audio.getAttribute("src") !== currentTrack.sourceUrl) {
        audio.src = currentTrack.sourceUrl;
      }
      if (command.type === "restart") {
        audio.pause();
        audio.load();
        audio.currentTime = 0;
      }

      coordinatorRef.current?.claimPlayback();
      useMusicPlayerStore.getState().setPlaybackStatus("loading");
      try {
        await audio.play();
        if (playAttemptIdRef.current !== attemptId) {
          audio.pause();
        }
      } catch {
        if (playAttemptIdRef.current === attemptId) {
          useMusicPlayerStore.getState().setPlaybackStatus("error");
        }
      }
    };

    void play();
  }, [command, currentTrack]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) {
      return;
    }

    const state = useMusicPlayerStore.getState();
    const safeSetActionHandler = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Ignore actions that the current browser does not implement.
      }
    };

    safeSetActionHandler("play", () => state.requestTogglePlayback());
    safeSetActionHandler("pause", () => useMusicPlayerStore.getState().requestPause());
    safeSetActionHandler("previoustrack", () => useMusicPlayerStore.getState().requestPrevious());
    safeSetActionHandler("nexttrack", () => useMusicPlayerStore.getState().requestNext());
    safeSetActionHandler("seekto", (details) => {
      if (details.seekTime !== undefined) {
        useMusicPlayerStore.getState().requestSeek(details.seekTime);
      }
    });

    return () => {
      safeSetActionHandler("play", null);
      safeSetActionHandler("pause", null);
      safeSetActionHandler("previoustrack", null);
      safeSetActionHandler("nexttrack", null);
      safeSetActionHandler("seekto", null);
    };
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) {
      return;
    }

    navigator.mediaSession.metadata = currentTrack
      ? new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist ?? undefined,
        artwork: currentTrack.artworkUrl
          ? [{ src: currentTrack.artworkUrl }]
          : undefined,
      })
      : null;
  }, [currentTrack]);

  return (
    <audio
      ref={audioRef}
      className="hidden"
      preload="metadata"
      onLoadedMetadata={(event) => {
        const audio = event.currentTarget;
        useMusicPlayerStore.getState().setPlaybackTime(audio.currentTime, audio.duration);
        updateMediaSessionPosition(audio);
      }}
      onDurationChange={(event) => {
        const audio = event.currentTarget;
        useMusicPlayerStore.getState().setPlaybackTime(audio.currentTime, audio.duration);
      }}
      onTimeUpdate={(event) => {
        const audio = event.currentTarget;
        useMusicPlayerStore.getState().setPlaybackTime(audio.currentTime, audio.duration);
        updateMediaSessionPosition(audio);
      }}
      onWaiting={(event) => {
        if (!event.currentTarget.paused) {
          useMusicPlayerStore.getState().setPlaybackStatus("loading");
        }
      }}
      onPlaying={() => {
        useMusicPlayerStore.getState().setPlaybackStatus("playing");
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "playing";
        }
      }}
      onPause={() => {
        const state = useMusicPlayerStore.getState();
        if (state.currentIndex !== null && state.status !== "error" && state.status !== "ended") {
          state.setPlaybackStatus("paused");
        }
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "paused";
        }
      }}
      onEnded={() => useMusicPlayerStore.getState().handleTrackEnded()}
      onError={() => useMusicPlayerStore.getState().setPlaybackStatus("error")}
    />
  );
}
