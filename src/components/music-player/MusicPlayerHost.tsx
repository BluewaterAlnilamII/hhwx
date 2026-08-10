"use client";

import { useEffect, useRef } from "react";
import { useBandoriMusicAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import { buildBandoriMusicPlayerArtworkUpdates } from "@/lib/bandori-music-player";
import { setMusicPlaybackAudioSessionActive } from "@/lib/browser-audio-session";
import {
  MUSIC_PLAYER_PREFERENCES_STORAGE_KEY,
  MUSIC_PLAYER_QUEUE_STORAGE_KEY,
  parseMusicPlayerPreferencesSnapshot,
  parseMusicPlayerQueueSnapshot,
  type MusicPlayerItem,
} from "@/lib/music-player-contract";
import {
  createMusicPlayerPlaybackCoordinator,
  createMusicPlayerTabId,
} from "@/lib/music-player-tab-coordinator";
import { seekMusicPlayerAudio } from "@/lib/music-player-seek";
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

function updateMediaSessionMetadata(track: MusicPlayerItem | null): void {
  if (!("mediaSession" in navigator)) {
    return;
  }

  navigator.mediaSession.metadata = track
    ? new MediaMetadata({
        title: track.title,
        artist: track.artist ?? undefined,
        // Keep a durable network URL here: iOS may consume Media Session
        // artwork outside the page context where blob URLs are valid.
        artwork: track.artworkUrl
          ? [{ src: track.artworkUrl, type: "image/png" }]
          : undefined,
      })
    : null;
}

function applyAudioSeek(
  audio: HTMLAudioElement,
  positionSeconds: number,
  preferFastSeek = false,
): void {
  const nextPosition = seekMusicPlayerAudio(audio, positionSeconds, preferFastSeek);
  useMusicPlayerStore.getState().setPlaybackTime(nextPosition, audio.duration);
  updateMediaSessionPosition(audio);
}

export default function MusicPlayerHost() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const coordinatorRef = useRef<PlaybackCoordinator | null>(null);
  const handledCommandIdRef = useRef(0);
  const playAttemptIdRef = useRef(0);
  const hasPlayedMusicInDocumentRef = useRef(false);
  const tabIdRef = useRef<string>("");
  const currentTrack = useMusicPlayerStore(selectMusicPlayerCurrentTrack);
  const queue = useMusicPlayerStore((state) => state.queue);
  const refreshQueueArtwork = useMusicPlayerStore((state) => state.refreshQueueArtwork);
  const hasBandoriQueueItems = queue.some((item) => item.provider === "bandori");
  const { value: musicAssetIndex } = useBandoriMusicAssetIndex(hasBandoriQueueItems);
  const currentTrackId = currentTrack?.id ?? null;
  const currentTrackSourceUrl = currentTrack?.sourceUrl ?? null;
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
    if (!musicAssetIndex) {
      return;
    }
    refreshQueueArtwork(buildBandoriMusicPlayerArtworkUpdates(queue, musicAssetIndex));
  }, [musicAssetIndex, queue, refreshQueueArtwork]);

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
      setMusicPlaybackAudioSessionActive(false);
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

    if (!currentTrackSourceUrl) {
      setMusicPlaybackAudioSessionActive(false);
      audio.removeAttribute("src");
      audio.load();
      return;
    }

    audio.src = currentTrackSourceUrl;
    audio.load();
  }, [currentTrackId, currentTrackSourceUrl]);

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
      setMusicPlaybackAudioSessionActive(false);
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
      applyAudioSeek(audio, command.positionSeconds ?? 0);
      return;
    }

    if (!currentTrack) {
      return;
    }

    const attemptId = playAttemptIdRef.current + 1;
    playAttemptIdRef.current = attemptId;
    const play = async () => {
      // WebKit uses the playback audio-session category to keep music eligible
      // for iOS lock-screen controls and background playback.
      setMusicPlaybackAudioSessionActive(true);
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
      const audio = audioRef.current;
      if (audio && details.seekTime !== undefined) {
        applyAudioSeek(audio, details.seekTime, details.fastSeek === true);
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
    if (!currentTrack) {
      hasPlayedMusicInDocumentRef.current = false;
      updateMediaSessionMetadata(null);
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "none";
      }
      return;
    }

    // Hydration restores a persisted queue paused at zero. Keep that queue in
    // the in-page player without claiming a system media session until music
    // has actually played in this document.
    if (hasPlayedMusicInDocumentRef.current) {
      updateMediaSessionMetadata(currentTrack);
    }
  }, [currentTrack]);

  return (
    <audio
      ref={audioRef}
      className="pointer-events-none fixed left-0 top-0 h-px w-px opacity-0"
      aria-hidden="true"
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
        const audio = audioRef.current;
        const activeTrack = selectMusicPlayerCurrentTrack(useMusicPlayerStore.getState());
        if (
          !audio
          || audio.paused
          || !activeTrack
          || audio.getAttribute("src") !== activeTrack.sourceUrl
        ) {
          return;
        }

        if (!hasPlayedMusicInDocumentRef.current) {
          hasPlayedMusicInDocumentRef.current = true;
          updateMediaSessionMetadata(activeTrack);
        }
        useMusicPlayerStore.getState().setPlaybackStatus("playing");
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "playing";
        }
      }}
      onPause={() => {
        const state = useMusicPlayerStore.getState();
        const hasActiveTrack = state.currentIndex !== null;
        if (hasActiveTrack && state.status !== "error" && state.status !== "ended") {
          state.setPlaybackStatus("paused");
        }
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = hasActiveTrack ? "paused" : "none";
        }
      }}
      onEnded={() => useMusicPlayerStore.getState().handleTrackEnded()}
      onError={() => useMusicPlayerStore.getState().setPlaybackStatus("error")}
    />
  );
}
