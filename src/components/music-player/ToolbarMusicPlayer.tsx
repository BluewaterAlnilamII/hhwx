"use client";

import {
  Disc3,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, type MouseEvent, type PointerEvent } from "react";
import OverflowMarqueeText from "@/components/music-player/OverflowMarqueeText";
import SharedMusicArtwork from "@/components/music-player/SharedMusicArtwork";
import {
  toolbarIconButtonClassName,
  toolbarIconInnerClassName,
  toolbarMenuAppearanceClassName,
} from "@/components/toolbar/toolbar-styles";
import { resolveMusicPlayerToolbarAction } from "@/lib/music-player-toolbar-input";
import {
  selectMusicPlayerCurrentTrack,
  useMusicPlayerStore,
} from "@/store/useMusicPlayerStore";

interface ToolbarMusicPlayerProps {
  isOpen: boolean;
  onToggle: () => void;
  onRequestClose: () => void;
}

const TOOLBAR_PLAYER_MOUSE_LEAVE_CLOSE_DELAY_MS = 180;

function formatPlaybackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

function ToolbarMusicPlayerButton({ isOpen, onToggle }: Pick<ToolbarMusicPlayerProps, "isOpen" | "onToggle">) {
  const t = useTranslations("navigation.toolbar.player");
  const currentTrack = useMusicPlayerStore(selectMusicPlayerCurrentTrack);
  const isPlaying = useMusicPlayerStore((state) => state.status === "playing");
  const restartRequestId = useMusicPlayerStore(
    (state) => state.command?.restartRequestId ?? 0,
  );
  const requestTogglePlayback = useMusicPlayerStore((state) => state.requestTogglePlayback);
  const lastPointerTypeRef = useRef<string | null>(null);
  const artworkAnimationKey = `${currentTrack?.id ?? "empty"}:${restartRequestId}`;
  const rotationPlaybackClassName = isPlaying
    ? "[animation-play-state:running]"
    : "[animation-play-state:paused]";

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    lastPointerTypeRef.current = event.pointerType;
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    const action = resolveMusicPlayerToolbarAction({
      eventDetail: event.detail,
      pointerType: lastPointerTypeRef.current,
      hasCurrentTrack: currentTrack !== null,
      isOpen,
    });
    if (action === "toggle-playback") {
      requestTogglePlayback();
    } else if (action === "toggle-panel") {
      onToggle();
    }
  };

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className={toolbarIconButtonClassName}
      aria-label={currentTrack ? t("openPlayer") : t("openEmptyPlayer")}
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      aria-controls="toolbar-music-player-panel"
    >
      <span className={`${toolbarIconInnerClassName} overflow-hidden rounded-full`}>
        {currentTrack?.artworkUrl ? (
          <SharedMusicArtwork
            key={artworkAnimationKey}
            src={currentTrack.artworkUrl}
            alt=""
            aria-hidden="true"
            className={`h-full w-full animate-spin object-cover [animation-duration:10s] motion-reduce:animate-none ${rotationPlaybackClassName}`}
            fallback={<Music2 className={`h-4 w-4 animate-spin [animation-duration:10s] motion-reduce:animate-none ${rotationPlaybackClassName}`} aria-hidden="true" />}
          />
        ) : currentTrack ? (
          <Music2 key={artworkAnimationKey} className={`h-4 w-4 animate-spin [animation-duration:10s] motion-reduce:animate-none ${rotationPlaybackClassName}`} aria-hidden="true" />
        ) : (
          <Disc3 className="h-4 w-4" aria-hidden="true" />
        )}
      </span>
    </button>
  );
}

function EmptyMusicPlayerPanel() {
  const t = useTranslations("navigation.toolbar.player");

  return (
    <div className="grid min-h-36 place-items-center px-7 py-8 text-center text-sm font-medium text-[var(--theme-color-text-muted)]">
      <div>
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[18px] bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-action-secondary-foreground)]">
          <Music2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <span>{t("empty")}</span>
      </div>
    </div>
  );
}

function MusicPlayerPanel({ onRequestClose }: Pick<ToolbarMusicPlayerProps, "onRequestClose">) {
  const t = useTranslations("navigation.toolbar.player");
  const currentTrack = useMusicPlayerStore(selectMusicPlayerCurrentTrack);
  const status = useMusicPlayerStore((state) => state.status);
  const currentTime = useMusicPlayerStore((state) => state.currentTime);
  const duration = useMusicPlayerStore((state) => state.duration);
  const volume = useMusicPlayerStore((state) => state.volume);
  const muted = useMusicPlayerStore((state) => state.muted);
  const repeatMode = useMusicPlayerStore((state) => state.repeatMode);
  const requestTogglePlayback = useMusicPlayerStore((state) => state.requestTogglePlayback);
  const requestSeek = useMusicPlayerStore((state) => state.requestSeek);
  const requestPrevious = useMusicPlayerStore((state) => state.requestPrevious);
  const requestNext = useMusicPlayerStore((state) => state.requestNext);
  const cycleRepeatMode = useMusicPlayerStore((state) => state.cycleRepeatMode);
  const setVolume = useMusicPlayerStore((state) => state.setVolume);
  const toggleMuted = useMusicPlayerStore((state) => state.toggleMuted);
  const clear = useMusicPlayerStore((state) => state.clear);

  if (!currentTrack) {
    return <EmptyMusicPlayerPanel />;
  }

  const isPlaying = status === "playing" || status === "loading";
  const isError = status === "error";
  const safeDuration = duration > 0 ? duration : currentTrack.durationSeconds ?? 0;
  const safeCurrentTime = Math.min(safeDuration || currentTime, Math.max(0, currentTime));
  const progressPercent = safeDuration > 0 ? (safeCurrentTime / safeDuration) * 100 : 0;
  const repeatModeLabel = repeatMode === "one"
    ? t("repeatOne")
    : repeatMode === "all"
      ? t("repeatAll")
      : t("repeatOff");
  const playbackLabel = isError
    ? t("retry")
    : isPlaying
      ? t("pause")
      : t("play");

  return (
    <>
      <div className="grid grid-cols-[5.125rem_minmax(0,1fr)] gap-4 px-[18px] pb-3 pt-[18px]">
        <div className={`flex aspect-square w-[5.125rem] items-center justify-center overflow-hidden rounded-[18px] bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-action-secondary-foreground)] shadow-[var(--theme-shadow-surface-raised)] ${isError ? "ring-2 ring-[var(--theme-color-semantic-danger-border)]" : ""}`}>
          {currentTrack.artworkUrl ? (
            <SharedMusicArtwork
              src={currentTrack.artworkUrl}
              alt=""
              className="h-full w-full object-cover"
              fallback={<Music2 className="h-7 w-7" aria-hidden="true" />}
            />
          ) : (
            <Music2 className="h-7 w-7" aria-hidden="true" />
          )}
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-1.5">
          <OverflowMarqueeText
            text={currentTrack.title}
            className="text-base font-semibold text-[var(--theme-color-text-default)]"
          />
          {currentTrack.artist ? (
            <OverflowMarqueeText
              text={currentTrack.artist}
              className="text-sm text-[var(--theme-color-text-muted)]"
            />
          ) : null}
        </div>
      </div>

      <div className="px-[18px] pb-3">
        <div className="mb-1.5 flex justify-between text-xs tabular-nums text-[var(--theme-color-text-muted)]">
          <span>{formatPlaybackTime(isError ? 0 : safeCurrentTime)}</span>
          <span>{formatPlaybackTime(safeDuration)}</span>
        </div>
        <div className={`relative h-5 ${isError ? "cursor-not-allowed" : ""}`}>
          <div className={`absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full ${isError ? "bg-[var(--theme-color-semantic-danger-background)]" : "bg-[var(--theme-color-progress-track-background)]"}`}>
            <div
              className="h-full rounded-full bg-[var(--theme-color-progress-indicator-background)] transition-[width] duration-150"
              style={{ width: isError ? "0%" : `${progressPercent}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={safeDuration || 0}
            step={0.1}
            value={isError ? 0 : safeCurrentTime}
            disabled={isError || safeDuration <= 0}
            onChange={(event) => requestSeek(Number(event.currentTarget.value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            aria-label={t("progress")}
          />
        </div>
      </div>

      <div className="relative flex items-center justify-center px-[18px] pb-4 pt-1">
        <div className="absolute left-[18px] flex items-center">
          <button
            type="button"
            onClick={cycleRepeatMode}
            aria-label={repeatModeLabel}
            aria-pressed={repeatMode !== "off"}
            data-repeat-mode={repeatMode}
            className={`flex h-9 w-9 items-center justify-center rounded-[14px] outline-hidden transition focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] ${repeatMode !== "off" ? "bg-[var(--theme-color-control-background-pressed)] text-[var(--theme-color-progress-foreground)]" : "text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)]"}`}
          >
            {repeatMode === "one" ? (
              <Repeat1 className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Repeat className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={requestPrevious}
            aria-label={t("previous")}
            className="flex h-9 w-9 items-center justify-center rounded-[14px] text-[var(--theme-color-text-muted)] outline-hidden transition hover:bg-[var(--theme-color-control-background-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]"
          >
            <SkipBack className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={requestTogglePlayback}
            aria-label={playbackLabel}
            className={`flex h-[52px] w-[52px] items-center justify-center rounded-full outline-hidden transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-color-surface-background)] ${isError ? "bg-[var(--theme-color-semantic-danger-border)] text-[var(--theme-color-semantic-danger-foreground-on-dark)] shadow-[var(--theme-shadow-action-primary)] focus-visible:ring-[var(--theme-color-semantic-danger-border)]" : "bg-[var(--theme-color-progress-indicator-background)] text-[var(--theme-color-surface-background)] shadow-[var(--theme-shadow-action-primary)] focus-visible:ring-[var(--theme-color-focus-ring)]"}`}
          >
            {isPlaying ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="ml-0.5 h-5 w-5" aria-hidden="true" />}
          </button>

          <button
            type="button"
            onClick={requestNext}
            aria-label={t("next")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] text-[var(--theme-color-text-muted)] outline-hidden transition hover:bg-[var(--theme-color-control-background-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]"
          >
            <SkipForward className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="absolute right-[18px] flex items-center gap-1">
          <button
            type="button"
            onClick={toggleMuted}
            aria-label={muted ? t("unmute") : t("mute")}
            aria-pressed={muted}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] outline-hidden transition focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] ${muted ? "bg-[var(--theme-color-control-background-pressed)] text-[var(--theme-color-progress-foreground)]" : "text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)]"}`}
          >
            {muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(event) => setVolume(Number(event.currentTarget.value))}
            className="hidden w-12 accent-[var(--theme-color-progress-indicator-background)] sm:block"
            aria-label={t("volume")}
          />
        </div>
      </div>

      <div className="flex justify-end border-t border-[var(--theme-color-border-subtle)] px-[18px] py-2.5">
        <button
          type="button"
          onClick={() => {
            clear();
            onRequestClose();
          }}
          className="rounded-lg px-1 py-1 text-xs font-medium text-[var(--theme-color-text-muted)] outline-hidden transition hover:text-[var(--theme-color-action-destructive-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]"
        >
          {t("clear")}
        </button>
      </div>
    </>
  );
}

export default function ToolbarMusicPlayer({ isOpen, onToggle, onRequestClose }: ToolbarMusicPlayerProps) {
  const t = useTranslations("navigation.toolbar.player");
  const pendingMouseLeaveCloseRef = useRef<number | null>(null);

  const cancelPendingMouseLeaveClose = () => {
    if (pendingMouseLeaveCloseRef.current !== null) {
      window.clearTimeout(pendingMouseLeaveCloseRef.current);
      pendingMouseLeaveCloseRef.current = null;
    }
  };

  useEffect(() => () => cancelPendingMouseLeaveClose(), []);

  const handlePointerEnter = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") {
      return;
    }
    cancelPendingMouseLeaveClose();
    if (!isOpen) {
      onToggle();
    }
  };

  const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") {
      return;
    }
    cancelPendingMouseLeaveClose();
    pendingMouseLeaveCloseRef.current = window.setTimeout(() => {
      pendingMouseLeaveCloseRef.current = null;
      onRequestClose();
    }, TOOLBAR_PLAYER_MOUSE_LEAVE_CLOSE_DELAY_MS);
  };

  return (
    <div
      className="relative"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <ToolbarMusicPlayerButton isOpen={isOpen} onToggle={onToggle} />
      {isOpen ? (
        <div
          id="toolbar-music-player-panel"
          role="dialog"
          aria-label={t("panelLabel")}
          className={`fixed right-3 top-[59px] w-[min(22.5rem,calc(100vw-1.5rem))] text-[var(--theme-color-text-default)] sm:absolute sm:right-0 sm:top-full sm:mt-3 ${toolbarMenuAppearanceClassName}`}
        >
          <MusicPlayerPanel onRequestClose={onRequestClose} />
        </div>
      ) : null}
    </div>
  );
}
