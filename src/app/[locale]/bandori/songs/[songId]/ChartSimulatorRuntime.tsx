"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  ChevronRight,
  FlipHorizontal2,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import BandoriFullChartView from "./BandoriFullChartView";
import SimulatorLoopControls from "./SimulatorLoopControls";
import SimulatorSkinControls, {
  SimulatorBooleanControl,
  SimulatorControlRow,
} from "./SimulatorSkinControls";
import {
  BANDORI_NATIVE_BACKGROUND_SKIN,
  BANDORI_NATIVE_BACKGROUND_SKINS,
  BANDORI_NATIVE_FIELD_SKIN,
  BANDORI_NATIVE_FIELD_SKINS,
  type BandoriNativeBackgroundSkin,
  type BandoriNativeFieldSkin,
} from "./native-stage-contract";
import {
  BANDORI_NATIVE_DIRECTIONAL_FLICK_SKIN,
  BANDORI_NATIVE_NOTE_SKIN,
  type BandoriNativeDirectionalFlickSkin,
  type BandoriNativeNoteSkin,
} from "./native-note-assets";
import type { ChartSimulatorClientShellProps } from "./ChartSimulatorClientShell";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import {
  parseBandoriChartForSimulator,
  type BandoriChartEntity,
} from "@/lib/bandori-chart-simulator-contract";
import { setMusicPlaybackAudioSessionActive } from "@/lib/browser-audio-session";
import {
  type CompiledBandoriChart,
} from "@/lib/bandori/chart-simulator/compiler";
import { compileBandoriChartInWorker } from "@/lib/bandori/chart-simulator/compiler-client";
import {
  adjustBandoriSimulatorNoteSpeed,
  BANDORI_NATIVE_NOTE_SPEED_DEFAULT,
  BANDORI_NATIVE_NOTE_SPEED_MAX,
  BANDORI_NATIVE_NOTE_SPEED_MIN,
} from "@/lib/bandori/chart-simulator/native-note-presentation";
import {
  collectBandoriNativeNoteSoundEvents,
  createBandoriNativeNoteSoundTimeline,
  getBandoriNativeActiveNoteSoundLoops,
  getBandoriNativeNoteSoundCueUrls,
  getBandoriNativeTapSeCueBankId,
  BANDORI_NATIVE_NOTE_SOUND_VOLUME,
  BANDORI_NATIVE_TAP_SE_SKIN,
  type BandoriNativeNoteSoundTimeline,
  type BandoriNativeTapSeSkin,
} from "@/lib/bandori/chart-simulator/native-note-sound-presentation";
import {
  BANDORI_NATIVE_NOTE_SOUND_SCHEDULE_AHEAD_SECONDS,
  createBandoriNativeNoteSoundRuntime,
  type BandoriNativeNoteSoundCueBank,
  type BandoriNativeNoteSoundRuntime,
} from "@/lib/bandori/chart-simulator/native-note-sound-runtime";
import {
  createBandoriMediaOperationSequencer,
} from "@/lib/bandori/chart-simulator/media-operation-sequencer";
import {
  playBandoriMediaElement,
  seekBandoriMediaElement,
} from "@/lib/bandori/chart-simulator/media-seek";
import {
  createBandoriFullSongLoopRange,
  isBandoriTimeInsideLoopRange,
  type BandoriChartLoopRange,
} from "@/lib/bandori/chart-simulator/loop-range";
import {
  adjustBandoriSimulatorPlaybackRate,
  BANDORI_SIMULATOR_PLAYBACK_RATE_DEFAULT_HUNDREDTHS,
  BANDORI_SIMULATOR_PLAYBACK_RATE_MAX_HUNDREDTHS,
  BANDORI_SIMULATOR_PLAYBACK_RATE_MIN_HUNDREDTHS,
  BANDORI_SIMULATOR_SYNC_NOTE_SPEED_SLOWDOWN_DEFAULT,
  getBandoriSimulatorNoteApproachTimeScale,
  getBandoriSimulatorPlaybackRate,
} from "@/lib/bandori/chart-simulator/playback-rate";
import {
  beginBandoriChartScrub,
  commitBandoriChartScrub,
  createBandoriChartTransportState,
  getBandoriChartPresentationTime,
  jumpBandoriChartTransport,
  pauseBandoriChartTransport,
  playBandoriChartTransport,
  previewBandoriChartScrub,
  restartBandoriChartTransport,
  syncBandoriChartMediaTime,
  type BandoriChartTransportState,
} from "@/lib/bandori/chart-simulator/transport";
import {
  createMusicPlayerPlaybackCoordinator,
  createMusicPlayerTabId,
} from "@/lib/music-player-tab-coordinator";
import { useMusicPlayerStore } from "@/store/useMusicPlayerStore";
import { loadBandoriChartSimulatorAssets } from "@/lib/bandori/chart-simulator/asset-manifest-client";
import type {
  BandoriChartSimulatorAssetResolver,
} from "@/lib/bandori/chart-simulator/asset-manifest";
import type { BandoriLimitedPerformanceSkin } from "./limited-performance-skins";

const NativeSimulatorStage = dynamic(() => import("./NativeSimulatorStage"), {
  ssr: false,
});

type SimulatorTab = "stage" | "fullChart";
const PLAYBACK_RATE_DECREASES = [-10, -1] as const;
const PLAYBACK_RATE_INCREASES = [1, 10] as const;
const NOTE_SPEED_DECREASES = [-0.5, -0.1, -0.01] as const;
const NOTE_SPEED_INCREASES = [0.01, 0.1, 0.5] as const;
const MEDIA_HAVE_FUTURE_DATA = 3;
const MEDIA_ERROR_ABORTED = 1;
function createResolvedNoteSoundCueBank(
  skin: BandoriNativeTapSeSkin,
  resolveAssetUrl: BandoriChartSimulatorAssetResolver,
): BandoriNativeNoteSoundCueBank {
  return {
    id: getBandoriNativeTapSeCueBankId(skin),
    cueUrls: Object.fromEntries(
      Object.entries(getBandoriNativeNoteSoundCueUrls(skin)).map(
        ([cue, logicalUrl]) => [cue, resolveAssetUrl(logicalUrl)],
      ),
    ) as BandoriNativeNoteSoundCueBank["cueUrls"],
  };
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; compiled: CompiledBandoriChart }
  | { status: "error"; message: string };

type AssetLoadState =
  | { status: "loading" }
  | {
      status: "ready";
      manifestSha256: string;
      resolveAssetUrl: BandoriChartSimulatorAssetResolver;
    }
  | { status: "error"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseChartResponse(
  payload: unknown,
  songId: number,
  difficulty: string,
): BandoriChartEntity[] {
  const data = parseApiSuccessData<unknown>(payload);
  if (
    !isRecord(data)
    || data.songId !== songId
    || data.difficulty !== difficulty
  ) {
    throw new Error("Chart API identity does not match the request");
  }
  return parseBandoriChartForSimulator(data.chart);
}

function applySimulatorPlaybackRate(
  audio: HTMLAudioElement,
  playbackRate: number,
): void {
  audio.defaultPlaybackRate = playbackRate;
  audio.playbackRate = playbackRate;
  audio.preservesPitch = true;
}

function createLoopSeekTransport(
  state: BandoriChartTransportState,
  startTimeSeconds: number,
  shouldResume: boolean,
): BandoriChartTransportState {
  return {
    ...state,
    currentTimeSeconds: startTimeSeconds,
    phase: shouldResume
      ? "playing"
      : state.phase === "ready" ? "ready" : "paused",
    previewTimeSeconds: null,
    shouldResumeAfterInteraction: false,
  };
}

function controlClassName(isPrimary = false): string {
  return `inline-flex h-10 items-center justify-center gap-2 rounded-full border px-4 text-sm font-semibold outline-hidden transition focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] disabled:cursor-not-allowed disabled:opacity-45 ${
    isPrimary
      ? "border-[var(--theme-color-action-primary-border)] bg-[var(--theme-color-action-primary-background)] text-[var(--theme-color-action-primary-foreground)] hover:bg-[var(--theme-color-action-primary-background-hover)]"
      : "border-[var(--theme-color-border-default)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-text-default)] hover:bg-[var(--theme-color-control-background-hover)]"
  }`;
}

export default function ChartSimulatorRuntime({
  songId,
  difficulty,
  chartUrl,
  audioUrl,
  durationSeconds,
  expectedCombo,
}: ChartSimulatorClientShellProps) {
  const t = useTranslations("bandori.songs.simulator");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackRateHundredthsRef = useRef(
    BANDORI_SIMULATOR_PLAYBACK_RATE_DEFAULT_HUNDREDTHS,
  );
  const transportRef = useRef(createBandoriChartTransportState(durationSeconds));
  const effectTimelineVersionRef = useRef(0);
  const noteSoundRuntimeRef = useRef<BandoriNativeNoteSoundRuntime | null>(null);
  const noteSoundTimelineRef = useRef<BandoriNativeNoteSoundTimeline | null>(null);
  const noteSoundCursorRef = useRef(-1e-7);
  const noteSoundLastMediaTimeRef = useRef(0);
  const noteSoundNeedsLoopSyncRef = useRef(false);
  const frozenMediaTimeRef = useRef(0);
  const isMediaPlaybackReadyRef = useRef(false);
  const shouldMediaPlayRef = useRef(false);
  const loopRangeRef = useRef(createBandoriFullSongLoopRange(durationSeconds));
  const isLoopEnabledRef = useRef(false);
  const loopSeekPendingRef = useRef(false);
  const loopSeekPromiseRef = useRef<Promise<unknown> | null>(null);
  const coordinatorRef = useRef<ReturnType<typeof createMusicPlayerPlaybackCoordinator> | null>(null);
  const [mediaOperationSequencer] = useState(createBandoriMediaOperationSequencer);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [assetLoadState, setAssetLoadState] = useState<AssetLoadState>({
    status: "loading",
  });
  const [transport, setTransport] = useState(transportRef.current);
  const [activeTab, setActiveTab] = useState<SimulatorTab>("stage");
  const [isMirrored, setIsMirrored] = useState(false);
  const [playbackRateHundredths, setPlaybackRateHundredths] = useState(
    BANDORI_SIMULATOR_PLAYBACK_RATE_DEFAULT_HUNDREDTHS,
  );
  const [loopRange, setLoopRange] = useState<BandoriChartLoopRange>(
    () => createBandoriFullSongLoopRange(durationSeconds),
  );
  const [isLoopEnabled, setIsLoopEnabled] = useState(false);
  const [isNoteSpeedSlowdownSynchronized, setIsNoteSpeedSlowdownSynchronized] =
    useState(BANDORI_SIMULATOR_SYNC_NOTE_SPEED_SLOWDOWN_DEFAULT);
  const [noteSpeed, setNoteSpeed] = useState(BANDORI_NATIVE_NOTE_SPEED_DEFAULT);
  const [backgroundSkin, setBackgroundSkin] = useState<BandoriNativeBackgroundSkin>(
    BANDORI_NATIVE_BACKGROUND_SKIN,
  );
  const [fieldSkin, setFieldSkin] = useState<BandoriNativeFieldSkin>(
    BANDORI_NATIVE_FIELD_SKIN,
  );
  const [noteSkin, setNoteSkin] = useState<BandoriNativeNoteSkin>(
    BANDORI_NATIVE_NOTE_SKIN,
  );
  const [directionalFlickSkin, setDirectionalFlickSkin] =
    useState<BandoriNativeDirectionalFlickSkin>(
      BANDORI_NATIVE_DIRECTIONAL_FLICK_SKIN,
    );
  const [tapSeSkin, setTapSeSkin] = useState<BandoriNativeTapSeSkin>(
    BANDORI_NATIVE_TAP_SE_SKIN,
  );
  const [limitedPerformanceSkin, setLimitedPerformanceSkin] =
    useState<BandoriLimitedPerformanceSkin | null>(null);
  const [isSyncLineEnabled, setIsSyncLineEnabled] = useState(true);
  const [isRhythmSupportEnabled, setIsRhythmSupportEnabled] = useState(true);
  const [isLaneEffectEnabled, setIsLaneEffectEnabled] = useState(true);
  const [isAllPerfectStatusEnabled, setIsAllPerfectStatusEnabled] = useState(true);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const playbackRate = getBandoriSimulatorPlaybackRate(playbackRateHundredths);
  const noteApproachTimeScale = getBandoriSimulatorNoteApproachTimeScale(
    playbackRateHundredths,
    isNoteSpeedSlowdownSynchronized,
  );
  const effectiveBackgroundSkin =
    limitedPerformanceSkin?.backgroundSkin ?? backgroundSkin;
  const effectiveFieldSkin = limitedPerformanceSkin?.fieldSkin ?? fieldSkin;
  const effectiveNoteSkin = limitedPerformanceSkin?.noteSkin ?? noteSkin;
  const effectiveDirectionalFlickSkin =
    limitedPerformanceSkin?.directionalFlickSkin ?? directionalFlickSkin;
  const effectiveTapSeSkin = limitedPerformanceSkin?.tapSeSkin ?? tapSeSkin;

  const noteSoundTimeline = useMemo(() => {
    if (loadState.status !== "ready") return null;
    try {
      return createBandoriNativeNoteSoundTimeline(loadState.compiled);
    } catch {
      // Sound follows the same renderability contract as visual presentation.
      return null;
    }
  }, [loadState]);

  const updateTransport = useCallback((next: BandoriChartTransportState) => {
    transportRef.current = next;
    setTransport(next);
  }, []);

  const cancelPendingMediaOperation = useCallback(() => {
    mediaOperationSequencer.cancel();
  }, [mediaOperationSequencer]);

  const pauseAudioInternally = useCallback((audio: HTMLAudioElement | null) => {
    shouldMediaPlayRef.current = false;
    if (!audio) return;
    audio.pause();
  }, []);

  const getStagePresentationTime = useCallback(() => {
    const currentTransport = transportRef.current;
    const audio = audioRef.current;
    if (currentTransport.phase === "playing" && audio && Number.isFinite(audio.currentTime)) {
      if (!isMediaPlaybackReadyRef.current) {
        return Math.max(
          0,
          Math.min(currentTransport.durationSeconds, frozenMediaTimeRef.current),
        );
      }
      const presentationTimeSeconds = Math.max(
        0,
        Math.min(currentTransport.durationSeconds, audio.currentTime),
      );
      frozenMediaTimeRef.current = presentationTimeSeconds;
      return presentationTimeSeconds;
    }
    return getBandoriChartPresentationTime(currentTransport);
  }, []);

  const getStageEffectPlaybackState = useCallback(() => ({
    isPlaying: transportRef.current.phase === "playing"
      && isMediaPlaybackReadyRef.current,
    playbackRate: getBandoriSimulatorPlaybackRate(playbackRateHundredthsRef.current),
    timelineVersion: effectTimelineVersionRef.current,
  }), []);

  const invalidateStageEffects = useCallback(() => {
    effectTimelineVersionRef.current += 1;
  }, []);

  const stopAndResetNoteSounds = useCallback((
    timeSeconds: number,
    rebuildActiveLoops: boolean,
    includeBoundary = false,
  ) => {
    noteSoundRuntimeRef.current?.stopAll();
    noteSoundCursorRef.current = includeBoundary
      ? timeSeconds - 1e-7
      : timeSeconds;
    noteSoundLastMediaTimeRef.current = timeSeconds;
    noteSoundNeedsLoopSyncRef.current = rebuildActiveLoops;
  }, []);

  const flushNoteSoundsThrough = useCallback((timeSeconds: number) => {
    const runtime = noteSoundRuntimeRef.current;
    const timeline = noteSoundTimelineRef.current;
    const currentTimeSeconds = Math.max(0, timeSeconds);
    if (!runtime || !timeline || !runtime.isPrepared) {
      noteSoundCursorRef.current = currentTimeSeconds;
      noteSoundLastMediaTimeRef.current = currentTimeSeconds;
      return;
    }
    if (currentTimeSeconds < noteSoundLastMediaTimeRef.current - 1e-7) {
      runtime.stopAll();
      noteSoundCursorRef.current = currentTimeSeconds;
      noteSoundNeedsLoopSyncRef.current = true;
    }
    if (noteSoundNeedsLoopSyncRef.current) {
      const currentPlaybackRate = getBandoriSimulatorPlaybackRate(
        playbackRateHundredthsRef.current,
      );
      for (const loop of getBandoriNativeActiveNoteSoundLoops(
        timeline,
        currentTimeSeconds,
      )) {
        // The chart clock is slowed, but the admitted JP Note SE sample stays at 1x.
        runtime.startLoop(
          loop.voiceKey,
          loop.cue,
          loop.offsetSeconds / currentPlaybackRate,
        );
      }
      noteSoundNeedsLoopSyncRef.current = false;
    }
    const currentPlaybackRate = getBandoriSimulatorPlaybackRate(
      playbackRateHundredthsRef.current,
    );
    const scheduledThroughTimeSeconds = Math.min(
      transportRef.current.durationSeconds,
      isLoopEnabledRef.current
        ? loopRangeRef.current.endTimeSeconds
        : transportRef.current.durationSeconds,
      currentTimeSeconds
        + BANDORI_NATIVE_NOTE_SOUND_SCHEDULE_AHEAD_SECONDS * currentPlaybackRate,
    );
    const pendingEvents = collectBandoriNativeNoteSoundEvents(
      timeline,
      noteSoundCursorRef.current,
      scheduledThroughTimeSeconds,
    );
    runtime.dispatch(
      isLoopEnabledRef.current
        ? pendingEvents.filter((event) => event.timeSeconds < loopRangeRef.current.endTimeSeconds)
        : pendingEvents,
      currentTimeSeconds,
      currentPlaybackRate,
    );
    noteSoundCursorRef.current = Math.max(
      noteSoundCursorRef.current,
      scheduledThroughTimeSeconds,
    );
    noteSoundLastMediaTimeRef.current = currentTimeSeconds;
  }, []);

  const snapshotTransportAtAudioTime = useCallback((audio: HTMLAudioElement | null) => {
    const current = transportRef.current;
    if (!audio || current.phase !== "playing" || !Number.isFinite(audio.currentTime)) {
      return current;
    }
    return syncBandoriChartMediaTime(current, getStagePresentationTime());
  }, [getStagePresentationTime]);

  const pauseAudioAndTransport = useCallback((audio: HTMLAudioElement | null) => {
    cancelPendingMediaOperation();
    const snapshot = snapshotTransportAtAudioTime(audio);
    frozenMediaTimeRef.current = snapshot.currentTimeSeconds;
    isMediaPlaybackReadyRef.current = false;
    const next = pauseBandoriChartTransport(snapshot);
    updateTransport(next);
    pauseAudioInternally(audio);
    stopAndResetNoteSounds(
      snapshot.currentTimeSeconds,
      snapshot.currentTimeSeconds > 0,
    );
    void noteSoundRuntimeRef.current?.pause();
    setMusicPlaybackAudioSessionActive(false);
  }, [
    cancelPendingMediaOperation,
    pauseAudioInternally,
    snapshotTransportAtAudioTime,
    stopAndResetNoteSounds,
    updateTransport,
  ]);

  const seekAudioAndTransport = useCallback(async (
    audio: HTMLAudioElement,
    requestedTransport: BandoriChartTransportState,
  ) => {
    const shouldResume = requestedTransport.phase === "playing";
    const requestedTimeSeconds = requestedTransport.currentTimeSeconds;
    const pendingTransport: BandoriChartTransportState = {
      ...requestedTransport,
      phase: requestedTransport.phase === "ready" ? "ready" : "paused",
      previewTimeSeconds: null,
      shouldResumeAfterInteraction: false,
    };

    setPlaybackError(null);
    frozenMediaTimeRef.current = requestedTimeSeconds;
    isMediaPlaybackReadyRef.current = false;
    pauseAudioInternally(audio);
    setMusicPlaybackAudioSessionActive(false);
    invalidateStageEffects();
    stopAndResetNoteSounds(
      requestedTimeSeconds,
      requestedTimeSeconds > 0,
      requestedTimeSeconds === 0,
    );
    updateTransport(pendingTransport);

    return mediaOperationSequencer.runLatest(async (operation) => {
      await noteSoundRuntimeRef.current?.pause();
      operation.throwIfSuperseded();

      const committedMediaTime = await seekBandoriMediaElement(
        audio,
        requestedTimeSeconds,
        operation.signal,
      );
      operation.throwIfSuperseded();

      const settledTimeSeconds = Math.max(
        0,
        Math.min(requestedTransport.durationSeconds, committedMediaTime),
      );
      const settledTransport: BandoriChartTransportState = {
        ...pendingTransport,
        phase: settledTimeSeconds >= requestedTransport.durationSeconds
          ? "ended"
          : pendingTransport.phase,
        currentTimeSeconds: settledTimeSeconds,
      };
      if (!shouldResume || settledTransport.phase === "ended") {
        return { settledTransport, startedTimeSeconds: null };
      }

      noteSoundRuntimeRef.current?.attachMediaElement(audio);
      await noteSoundRuntimeRef.current?.resume();
      operation.throwIfSuperseded();
      shouldMediaPlayRef.current = true;
      const startedMediaTime = await playBandoriMediaElement(audio, operation.signal);
      operation.throwIfSuperseded();
      if (noteSoundRuntimeRef.current?.getContextState() !== "running") {
        throw new Error("Audio output is not running");
      }
      return {
        settledTransport,
        startedTimeSeconds: Math.max(
          0,
          Math.min(requestedTransport.durationSeconds, startedMediaTime),
        ),
      };
    }, {
      commit: ({ settledTransport, startedTimeSeconds }) => {
        const settledTimeSeconds = settledTransport.currentTimeSeconds;
        frozenMediaTimeRef.current = settledTimeSeconds;
        invalidateStageEffects();
        if (startedTimeSeconds === null) {
          // A superseded play() may still complete at the browser layer even
          // though its state commit was rejected. Reassert the latest paused
          // intent after this seek has settled.
          pauseAudioInternally(audio);
          isMediaPlaybackReadyRef.current = false;
          stopAndResetNoteSounds(
            settledTimeSeconds,
            settledTimeSeconds > 0,
            settledTimeSeconds === 0,
          );
          updateTransport(settledTransport);
          return;
        }

        isMediaPlaybackReadyRef.current = true;
        stopAndResetNoteSounds(
          startedTimeSeconds,
          startedTimeSeconds > 0,
          startedTimeSeconds === 0,
        );
        updateTransport({
          ...settledTransport,
          phase: "playing",
          currentTimeSeconds: settledTimeSeconds,
        });
        setMusicPlaybackAudioSessionActive(true);
      },
      reportError: (error) => {
        shouldMediaPlayRef.current = false;
        isMediaPlaybackReadyRef.current = false;
        pauseAudioInternally(audio);
        const fallbackTimeSeconds = Number.isFinite(audio.currentTime)
          ? Math.max(0, Math.min(requestedTransport.durationSeconds, audio.currentTime))
          : requestedTimeSeconds;
        frozenMediaTimeRef.current = fallbackTimeSeconds;
        updateTransport({
          ...pendingTransport,
          phase: fallbackTimeSeconds >= requestedTransport.durationSeconds
            ? "ended"
            : "paused",
          currentTimeSeconds: fallbackTimeSeconds,
        });
        stopAndResetNoteSounds(
          fallbackTimeSeconds,
          fallbackTimeSeconds > 0,
          fallbackTimeSeconds === 0,
        );
        void noteSoundRuntimeRef.current?.pause();
        setMusicPlaybackAudioSessionActive(false);
        setPlaybackError(error instanceof Error ? error.message : String(error));
      },
    });
  }, [
    invalidateStageEffects,
    mediaOperationSequencer,
    pauseAudioInternally,
    stopAndResetNoteSounds,
    updateTransport,
  ]);

  const seekToLoopStart = useCallback((
    range: BandoriChartLoopRange,
    onlyWhenOutside: boolean,
  ) => {
    const audio = audioRef.current;
    const current = snapshotTransportAtAudioTime(audio);
    const currentTimeSeconds = current.phase === "playing"
      && audio
      && Number.isFinite(audio.currentTime)
      ? audio.currentTime
      : getBandoriChartPresentationTime(current);
    if (onlyWhenOutside && isBandoriTimeInsideLoopRange(range, currentTimeSeconds)) return;

    const requested = createLoopSeekTransport(
      current,
      range.startTimeSeconds,
      shouldMediaPlayRef.current,
    );
    if (!audio) {
      invalidateStageEffects();
      stopAndResetNoteSounds(range.startTimeSeconds, range.startTimeSeconds > 0);
      updateTransport(requested);
      return;
    }

    loopSeekPendingRef.current = true;
    const request = seekAudioAndTransport(audio, requested);
    loopSeekPromiseRef.current = request;
    void request.finally(() => {
      if (loopSeekPromiseRef.current !== request) return;
      loopSeekPromiseRef.current = null;
      loopSeekPendingRef.current = false;
    });
  }, [
    invalidateStageEffects,
    seekAudioAndTransport,
    snapshotTransportAtAudioTime,
    stopAndResetNoteSounds,
    updateTransport,
  ]);

  const applyLoopRange = useCallback((range: BandoriChartLoopRange) => {
    loopRangeRef.current = range;
    setLoopRange(range);
    if (isLoopEnabledRef.current) seekToLoopStart(range, true);
  }, [seekToLoopStart]);

  const changeLoopEnabled = useCallback((isEnabled: boolean) => {
    isLoopEnabledRef.current = isEnabled;
    setIsLoopEnabled(isEnabled);
    if (isEnabled) seekToLoopStart(loopRangeRef.current, true);
  }, [seekToLoopStart]);

  const wrapLoopAtBoundary = useCallback((audio: HTMLAudioElement): boolean => {
    if (
      !isLoopEnabledRef.current
      || loopSeekPendingRef.current
      || transportRef.current.phase !== "playing"
      || !Number.isFinite(audio.currentTime)
      || audio.currentTime < loopRangeRef.current.endTimeSeconds
    ) {
      return false;
    }
    seekToLoopStart(loopRangeRef.current, false);
    return true;
  }, [seekToLoopStart]);

  useEffect(() => {
    if (assetLoadState.status !== "ready") return;
    const initialCueBank = createResolvedNoteSoundCueBank(
      BANDORI_NATIVE_TAP_SE_SKIN,
      assetLoadState.resolveAssetUrl,
    );
    const runtime = createBandoriNativeNoteSoundRuntime(
      [initialCueBank],
      initialCueBank.id,
      BANDORI_NATIVE_NOTE_SOUND_VOLUME,
    );
    noteSoundRuntimeRef.current = runtime;
    const unsubscribeContextState = runtime.subscribeContextState((state) => {
      if (
        state === "running"
        || transportRef.current.phase !== "playing"
        || !shouldMediaPlayRef.current
      ) return;
      pauseAudioAndTransport(audioRef.current);
      if (state === "closed") setPlaybackError("Audio output became unavailable");
    });
    return () => {
      unsubscribeContextState();
      runtime.dispose();
      if (noteSoundRuntimeRef.current === runtime) noteSoundRuntimeRef.current = null;
    };
  }, [assetLoadState, pauseAudioAndTransport]);

  useEffect(() => {
    if (assetLoadState.status !== "ready") return;
    const runtime = noteSoundRuntimeRef.current;
    if (!runtime) return;
    const cueBank = createResolvedNoteSoundCueBank(
      effectiveTapSeSkin,
      assetLoadState.resolveAssetUrl,
    );
    let isCurrent = true;
    void runtime.prepareCueBank(cueBank).then(() => {
      if (!isCurrent || noteSoundRuntimeRef.current !== runtime) return;
      runtime.selectCueBank(cueBank.id);
      const audio = audioRef.current;
      const currentTimeSeconds = transportRef.current.phase === "playing"
        && audio
        && Number.isFinite(audio.currentTime)
        ? audio.currentTime
        : getBandoriChartPresentationTime(transportRef.current);
      stopAndResetNoteSounds(
        currentTimeSeconds,
        currentTimeSeconds > 0,
        currentTimeSeconds === 0,
      );
    }).catch((error: unknown) => {
      if (isCurrent && noteSoundRuntimeRef.current === runtime) {
        setPlaybackError(error instanceof Error ? error.message : String(error));
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [assetLoadState, effectiveTapSeSkin, stopAndResetNoteSounds]);

  useEffect(() => {
    cancelPendingMediaOperation();
    const next = createBandoriChartTransportState(durationSeconds);
    const nextLoopRange = createBandoriFullSongLoopRange(durationSeconds);
    transportRef.current = next;
    loopRangeRef.current = nextLoopRange;
    isLoopEnabledRef.current = false;
    loopSeekPendingRef.current = false;
    loopSeekPromiseRef.current = null;
    frozenMediaTimeRef.current = 0;
    isMediaPlaybackReadyRef.current = false;
    shouldMediaPlayRef.current = false;
    pauseAudioInternally(audioRef.current);
    effectTimelineVersionRef.current += 1;
    stopAndResetNoteSounds(0, false, true);
    void noteSoundRuntimeRef.current?.pause();
    setTransport(next);
    setLoopRange(nextLoopRange);
    setIsLoopEnabled(false);
    setIsMirrored(false);
    setPlaybackError(null);
    setMusicPlaybackAudioSessionActive(false);
  }, [
    cancelPendingMediaOperation,
    difficulty,
    durationSeconds,
    pauseAudioInternally,
    songId,
    stopAndResetNoteSounds,
  ]);

  useEffect(
    () => () => cancelPendingMediaOperation(),
    [cancelPendingMediaOperation],
  );

  useEffect(() => {
    let isCurrent = true;
    setAssetLoadState({ status: "loading" });
    void loadBandoriChartSimulatorAssets({ refresh: loadAttempt > 0 }).then(
      (loaded) => {
        if (!isCurrent) return;
        setAssetLoadState({
          status: "ready",
          manifestSha256: loaded.manifestSha256,
          resolveAssetUrl: loaded.resolveAssetUrl,
        });
      },
      (error: unknown) => {
        if (!isCurrent) return;
        setAssetLoadState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [loadAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState({ status: "loading" });
    const load = async () => {
      try {
        const response = await fetch(chartUrl, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(getApiErrorMessage(payload) ?? `Chart request failed with HTTP ${response.status}`);
        }
        const chart = parseChartResponse(payload, songId, difficulty);
        const compiled = await compileBandoriChartInWorker({
          chart,
          mediaDurationSeconds: durationSeconds,
          signal: controller.signal,
        });
        if (compiled.maxCombo !== expectedCombo) {
          throw new Error(`Compiled combo ${compiled.maxCombo} does not match Music metadata ${expectedCombo}`);
        }
        setLoadState({ status: "ready", compiled });
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };
    void load();
    return () => controller.abort();
  }, [chartUrl, difficulty, durationSeconds, expectedCombo, loadAttempt, songId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      applySimulatorPlaybackRate(
        audio,
        getBandoriSimulatorPlaybackRate(playbackRateHundredthsRef.current),
      );
      noteSoundRuntimeRef.current?.attachMediaElement(audio);
    } catch (error) {
      setPlaybackError(error instanceof Error ? error.message : String(error));
    }
    const coordinator = createMusicPlayerPlaybackCoordinator(
      createMusicPlayerTabId(),
      () => {
        pauseAudioAndTransport(audio);
      },
    );
    coordinatorRef.current = coordinator;
    return () => {
      shouldMediaPlayRef.current = false;
      isMediaPlaybackReadyRef.current = false;
      audio.pause();
      coordinator.dispose();
      coordinatorRef.current = null;
      setMusicPlaybackAudioSessionActive(false);
    };
  }, [audioUrl, loadState.status, pauseAudioAndTransport]);

  useEffect(() => {
    const pauseWhenDocumentBecomesHidden = () => {
      if (
        document.visibilityState !== "hidden"
        || transportRef.current.phase !== "playing"
      ) return;
      // Browser media can outlive a throttled animation frame. Reuse the exact
      // transport pause path before either the visual or SE cursor falls behind.
      pauseAudioAndTransport(audioRef.current);
    };
    document.addEventListener("visibilitychange", pauseWhenDocumentBecomesHidden);
    return () => {
      document.removeEventListener(
        "visibilitychange",
        pauseWhenDocumentBecomesHidden,
      );
    };
  }, [pauseAudioAndTransport]);

  useEffect(() => {
    noteSoundTimelineRef.current = noteSoundTimeline;
    const timeSeconds = getBandoriChartPresentationTime(transportRef.current);
    stopAndResetNoteSounds(timeSeconds, timeSeconds > 0, timeSeconds === 0);
  }, [noteSoundTimeline, stopAndResetNoteSounds]);

  useEffect(() => {
    let animationFrame = 0;
    const enforceLoopBoundary = () => {
      const audio = audioRef.current;
      if (audio) wrapLoopAtBoundary(audio);
      animationFrame = window.requestAnimationFrame(enforceLoopBoundary);
    };
    animationFrame = window.requestAnimationFrame(enforceLoopBoundary);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [wrapLoopAtBoundary]);

  useEffect(() => {
    if (!noteSoundTimeline) return;
    let animationFrame = 0;
    const updateNoteSounds = () => {
      const audio = audioRef.current;
      if (
        transportRef.current.phase === "playing"
        && isMediaPlaybackReadyRef.current
        && audio
        && !audio.paused
        && !audio.seeking
        && audio.readyState >= MEDIA_HAVE_FUTURE_DATA
        && Number.isFinite(audio.currentTime)
      ) {
        flushNoteSoundsThrough(audio.currentTime);
      }
      animationFrame = window.requestAnimationFrame(updateNoteSounds);
    };
    animationFrame = window.requestAnimationFrame(updateNoteSounds);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [flushNoteSoundsThrough, noteSoundTimeline]);

  const presentationTime = getBandoriChartPresentationTime(transport);
  const play = async () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl || loadState.status !== "ready") return;
    const next = playBandoriChartTransport(transportRef.current);
    useMusicPlayerStore.getState().requestPause();
    coordinatorRef.current?.claimPlayback();
    await seekAudioAndTransport(audio, next);
  };

  const pause = () => {
    pauseAudioAndTransport(audioRef.current);
  };

  const handleMediaWaiting = (audio: HTMLAudioElement) => {
    if (
      transportRef.current.phase !== "playing"
      || !shouldMediaPlayRef.current
      || !isMediaPlaybackReadyRef.current
      || audio.paused
      || audio.ended
    ) return;

    const frozenTimeSeconds = getStagePresentationTime();
    frozenMediaTimeRef.current = frozenTimeSeconds;
    isMediaPlaybackReadyRef.current = false;
    invalidateStageEffects();
    if (Number.isFinite(audio.currentTime)) {
      stopAndResetNoteSounds(
        audio.currentTime,
        audio.currentTime > 0,
        audio.currentTime === 0,
      );
    } else {
      noteSoundRuntimeRef.current?.stopAll();
    }
    updateTransport(syncBandoriChartMediaTime(
      transportRef.current,
      frozenTimeSeconds,
    ));
  };

  const handleMediaPlaying = (audio: HTMLAudioElement) => {
    if (
      transportRef.current.phase !== "playing"
      || !shouldMediaPlayRef.current
      || isMediaPlaybackReadyRef.current
      || audio.paused
      || audio.seeking
      || audio.ended
      || audio.readyState < MEDIA_HAVE_FUTURE_DATA
    ) return;

    isMediaPlaybackReadyRef.current = true;
    invalidateStageEffects();
    if (Number.isFinite(audio.currentTime)) {
      stopAndResetNoteSounds(
        audio.currentTime,
        audio.currentTime > 0,
        audio.currentTime === 0,
      );
    }
    updateTransport(syncBandoriChartMediaTime(
      transportRef.current,
      getStagePresentationTime(),
    ));
    setMusicPlaybackAudioSessionActive(true);
  };

  const handleMediaError = (audio: HTMLAudioElement) => {
    const mediaError = audio.error;
    if (!mediaError || mediaError.code === MEDIA_ERROR_ABORTED) return;
    cancelPendingMediaOperation();
    const currentTransport = transportRef.current;
    const sourceTimeSeconds = Number.isFinite(audio.currentTime)
      ? Math.max(0, Math.min(currentTransport.durationSeconds, audio.currentTime))
      : currentTransport.currentTimeSeconds;
    frozenMediaTimeRef.current = sourceTimeSeconds;
    isMediaPlaybackReadyRef.current = false;
    pauseAudioInternally(audio);
    invalidateStageEffects();
    stopAndResetNoteSounds(
      sourceTimeSeconds,
      sourceTimeSeconds > 0,
      sourceTimeSeconds === 0,
    );
    updateTransport({
      ...currentTransport,
      phase: sourceTimeSeconds >= currentTransport.durationSeconds
        ? "ended"
        : currentTransport.phase === "ready" ? "ready" : "paused",
      currentTimeSeconds: sourceTimeSeconds,
      previewTimeSeconds: null,
      shouldResumeAfterInteraction: false,
    });
    setMusicPlaybackAudioSessionActive(false);
    const detail = mediaError.message || `code ${mediaError.code}`;
    setPlaybackError(`Media playback failed: ${detail}`);
  };

  const restart = () => {
    const audio = audioRef.current;
    const next = restartBandoriChartTransport(transportRef.current);
    if (!audio) {
      invalidateStageEffects();
      stopAndResetNoteSounds(0, false, true);
      updateTransport(next);
      return;
    }
    void seekAudioAndTransport(audio, next);
  };

  const jump = (delta: -5 | 5) => {
    const audio = audioRef.current;
    const next = jumpBandoriChartTransport(snapshotTransportAtAudioTime(audio), delta);
    if (!audio) {
      invalidateStageEffects();
      stopAndResetNoteSounds(next.currentTimeSeconds, true);
      updateTransport(next);
      return;
    }
    void seekAudioAndTransport(audio, next);
  };

  const beginScrub = () => {
    const audio = audioRef.current;
    cancelPendingMediaOperation();
    const current = snapshotTransportAtAudioTime(audio);
    frozenMediaTimeRef.current = current.currentTimeSeconds;
    isMediaPlaybackReadyRef.current = false;
    if (current.phase !== "scrubbing") invalidateStageEffects();
    stopAndResetNoteSounds(current.currentTimeSeconds, false);
    updateTransport(beginBandoriChartScrub(current));
    pauseAudioInternally(audio);
    void noteSoundRuntimeRef.current?.pause();
    setMusicPlaybackAudioSessionActive(false);
  };

  const previewScrub = (value: number) => {
    updateTransport(previewBandoriChartScrub(transportRef.current, value));
  };

  const commitScrub = () => {
    const current = transportRef.current;
    if (current.phase !== "scrubbing") return;
    const next = commitBandoriChartScrub(current);
    const audio = audioRef.current;
    if (!audio) {
      stopAndResetNoteSounds(next.currentTimeSeconds, true);
      updateTransport(next);
      return;
    }
    void seekAudioAndTransport(audio, next);
  };

  const changeTapSeSkin = (skin: BandoriNativeTapSeSkin) => {
    setTapSeSkin(skin);
  };

  const changeLimitedPerformanceSkin = (
    skin: BandoriLimitedPerformanceSkin | null,
  ) => {
    setLimitedPerformanceSkin(skin);
  };

  const changePlaybackRate = (adjustmentHundredths: number) => {
    const nextHundredths = adjustBandoriSimulatorPlaybackRate(
      playbackRateHundredthsRef.current,
      adjustmentHundredths,
    );
    if (nextHundredths === playbackRateHundredthsRef.current) return;
    const audio = audioRef.current;
    const presentationTimeSeconds = getStagePresentationTime();
    const noteSoundTimeSeconds = transportRef.current.phase === "playing"
      && audio
      && Number.isFinite(audio.currentTime)
      ? audio.currentTime
      : getBandoriChartPresentationTime(transportRef.current);
    frozenMediaTimeRef.current = presentationTimeSeconds;
    playbackRateHundredthsRef.current = nextHundredths;
    setPlaybackRateHundredths(nextHundredths);

    if (audio) {
      applySimulatorPlaybackRate(
        audio,
        getBandoriSimulatorPlaybackRate(nextHundredths),
      );
    }
    // Future triggers need new real-time timestamps. Active keep SE is rebuilt
    // at its 1x sample phase while the chart/media clock stays untouched.
    stopAndResetNoteSounds(
      noteSoundTimeSeconds,
      noteSoundTimeSeconds > 0,
      noteSoundTimeSeconds === 0,
    );
  };

  if (loadState.status === "loading" || assetLoadState.status === "loading") {
    return (
      <section className="rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-6 shadow-[var(--theme-shadow-surface-raised)] dark:border-slate-700 dark:bg-[#111827]">
        <p aria-live="polite" className="text-sm text-[var(--theme-color-text-muted)]">{t("loading")}</p>
      </section>
    );
  }

  if (loadState.status === "error" || assetLoadState.status === "error") {
    const message = loadState.status === "error"
      ? loadState.message
      : assetLoadState.status === "error" ? assetLoadState.message : "";
    return (
      <section className="rounded-3xl border border-[var(--theme-color-semantic-danger-border)] bg-[var(--theme-color-semantic-danger-background)] p-6">
        <h2 className="text-lg font-bold text-[var(--theme-color-semantic-danger-foreground)]">{t("unavailableTitle")}</h2>
        <p className="mt-2 text-sm text-[var(--theme-color-semantic-danger-foreground)]">{message}</p>
        <button type="button" className={`${controlClassName()} mt-4`} onClick={() => setLoadAttempt((value) => value + 1)}>
          {t("retry")}
        </button>
      </section>
    );
  }

  const isPlaying = transport.phase === "playing";
  return (
    <section className="rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-4 shadow-[var(--theme-shadow-surface-raised)] sm:p-6 dark:border-slate-700 dark:bg-[#111827]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-[var(--theme-color-text-default)]">{t("title")}</h2>
        </div>
        <div className="inline-flex rounded-full border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background-muted)] p-1">
          {(["stage", "fullChart"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              aria-pressed={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-2 text-sm font-semibold outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] ${activeTab === tab ? "bg-[var(--theme-color-control-background-pressed)] text-[var(--theme-color-control-foreground-pressed)]" : "text-[var(--theme-color-text-muted)]"}`}
            >
              {t(`tabs.${tab}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {activeTab === "stage" ? (
          <NativeSimulatorStage
            key={`${assetLoadState.manifestSha256}:${effectiveBackgroundSkin.id}:${effectiveFieldSkin.id}:${effectiveNoteSkin.id}:${effectiveDirectionalFlickSkin.id}:${limitedPerformanceSkin?.id ?? "ordinary"}:${difficulty}:${isMirrored ? "mirror" : "normal"}`}
            allPerfectStatusEnabled={isAllPerfectStatusEnabled}
            ariaLabel={t("stageAria")}
            backgroundSkin={effectiveBackgroundSkin}
            compiled={loadState.compiled}
            directionalFlickSkin={effectiveDirectionalFlickSkin}
            fieldSkin={effectiveFieldSkin}
            getEffectPlaybackState={getStageEffectPlaybackState}
            getPresentationTime={getStagePresentationTime}
            isMirrored={isMirrored}
            laneEffectEnabled={isLaneEffectEnabled}
            limitedPerformanceSkin={limitedPerformanceSkin}
            loadingLabel={t("stageLoading")}
            noteApproachTimeScale={noteApproachTimeScale}
            noteSpeed={noteSpeed}
            noteSkin={effectiveNoteSkin}
            noteContractErrorLabel={t("stageNoteContractUnavailable")}
            rendererErrorLabel={t("rendererUnavailable")}
            resourceErrorLabel={t("stageResourceUnavailable")}
            resolveAssetUrl={assetLoadState.resolveAssetUrl}
            rhythmSupportEnabled={isRhythmSupportEnabled}
            syncLineEnabled={isSyncLineEnabled}
          />
        ) : (
          <BandoriFullChartView
            compiled={loadState.compiled}
            isMirrored={isMirrored}
            ariaLabel={t("fullChartAria")}
            description={t("fullChartDescription")}
            analysisLabel={t("fullChartAnalysisLabel")}
          />
        )}
      </div>

      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        src={audioUrl ?? undefined}
        preload="auto"
        onTimeUpdate={(event) => {
          if (wrapLoopAtBoundary(event.currentTarget)) return;
          updateTransport(syncBandoriChartMediaTime(
            transportRef.current,
            getStagePresentationTime(),
          ));
        }}
        onPause={(event) => {
          if (
            event.currentTarget.paused
            && shouldMediaPlayRef.current
            && transportRef.current.phase === "playing"
            && !event.currentTarget.ended
          ) {
            pauseAudioAndTransport(event.currentTarget);
          }
        }}
        onWaiting={(event) => handleMediaWaiting(event.currentTarget)}
        onPlaying={(event) => handleMediaPlaying(event.currentTarget)}
        onError={(event) => handleMediaError(event.currentTarget)}
        onEnded={(event) => {
          if (!event.currentTarget.ended) return;
          if (isLoopEnabledRef.current && shouldMediaPlayRef.current) {
            if (!loopSeekPendingRef.current) {
              seekToLoopStart(loopRangeRef.current, false);
            }
            return;
          }
          cancelPendingMediaOperation();
          shouldMediaPlayRef.current = false;
          isMediaPlaybackReadyRef.current = false;
          frozenMediaTimeRef.current = durationSeconds;
          flushNoteSoundsThrough(durationSeconds);
          setMusicPlaybackAudioSessionActive(false);
          updateTransport({
            ...transportRef.current,
            phase: "ended",
            currentTimeSeconds: durationSeconds,
            previewTimeSeconds: null,
            shouldResumeAfterInteraction: false,
          });
        }}
      />

      <div className="mt-5 space-y-3">
        <input
          type="range"
          min={0}
          max={durationSeconds}
          step={0.01}
          value={presentationTime}
          aria-label={t("controls.timeline")}
          onPointerDown={beginScrub}
          onKeyDown={beginScrub}
          onChange={(event) => previewScrub(Number(event.currentTarget.value))}
          onPointerUp={commitScrub}
          onKeyUp={commitScrub}
          onBlur={commitScrub}
          className="w-full accent-[var(--theme-color-action-primary-background)]"
        />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" className={controlClassName()} onClick={restart}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {t("controls.restart")}
          </button>
          <button type="button" className={controlClassName()} onClick={() => jump(-5)}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {t("controls.backFive")}
          </button>
          <button
            type="button"
            className={controlClassName(true)}
            disabled={!audioUrl}
            onClick={isPlaying ? pause : () => void play()}
          >
            {isPlaying ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
            {t(isPlaying ? "controls.pause" : "controls.play")}
          </button>
          <button type="button" className={controlClassName()} onClick={() => jump(5)}>
            {t("controls.forwardFive")}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <SimulatorLoopControls
          key={`${songId}:${difficulty}:${durationSeconds}`}
          compiled={loadState.compiled}
          isEnabled={isLoopEnabled}
          onEnabledChange={changeLoopEnabled}
          onRangeApply={applyLoopRange}
          range={loopRange}
        />

        <fieldset className="rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background-muted)] px-4 pb-4 pt-2">
          <legend className="px-2 text-sm font-semibold text-[var(--theme-color-text-default)]">
            {t("effectControlsTitle")}
          </legend>
          <div className="space-y-3">
            <SimulatorControlRow label={t("controls.noteSpeed")}>
              {NOTE_SPEED_DECREASES.map((adjustment) => (
                <button
                  key={adjustment}
                  type="button"
                  className={controlClassName()}
                  disabled={noteSpeed === BANDORI_NATIVE_NOTE_SPEED_MIN}
                  aria-label={t("controls.decreaseNoteSpeed", {
                    amount: Math.abs(adjustment).toFixed(2),
                  })}
                  onClick={() => setNoteSpeed((current) => (
                    adjustBandoriSimulatorNoteSpeed(current, adjustment)
                  ))}
                >
                  −{Math.abs(adjustment).toFixed(2)}
                </button>
              ))}
              <output
                aria-label={t("controls.currentNoteSpeed")}
                aria-live="polite"
                className="inline-flex h-10 min-w-24 items-center justify-center rounded-xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-control-background)] px-4 text-base font-black tabular-nums text-[var(--theme-color-text-default)]"
              >
                {noteSpeed.toFixed(2)}
              </output>
              {NOTE_SPEED_INCREASES.map((adjustment) => (
                <button
                  key={adjustment}
                  type="button"
                  className={controlClassName()}
                  disabled={noteSpeed === BANDORI_NATIVE_NOTE_SPEED_MAX}
                  aria-label={t("controls.increaseNoteSpeed", {
                    amount: adjustment.toFixed(2),
                  })}
                  onClick={() => setNoteSpeed((current) => (
                    adjustBandoriSimulatorNoteSpeed(current, adjustment)
                  ))}
                >
                  +{adjustment.toFixed(2)}
                </button>
              ))}
            </SimulatorControlRow>

            <SimulatorControlRow label={t("controls.playbackRate")}>
              {PLAYBACK_RATE_DECREASES.map((adjustmentHundredths) => (
                <button
                  key={adjustmentHundredths}
                  type="button"
                  className={controlClassName()}
                  disabled={
                    playbackRateHundredths
                    === BANDORI_SIMULATOR_PLAYBACK_RATE_MIN_HUNDREDTHS
                  }
                  aria-label={t("controls.decreasePlaybackRate", {
                    amount: (Math.abs(adjustmentHundredths) / 100).toFixed(2),
                  })}
                  onClick={() => changePlaybackRate(adjustmentHundredths)}
                >
                  −{(Math.abs(adjustmentHundredths) / 100).toFixed(2)}
                </button>
              ))}
              <output
                aria-label={t("controls.currentPlaybackRate")}
                aria-live="polite"
                className="inline-flex h-10 min-w-24 items-center justify-center rounded-xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-control-background)] px-4 text-base font-black tabular-nums text-[var(--theme-color-text-default)]"
              >
                {playbackRate.toFixed(2)}×
              </output>
              {PLAYBACK_RATE_INCREASES.map((adjustmentHundredths) => (
                <button
                  key={adjustmentHundredths}
                  type="button"
                  className={controlClassName()}
                  disabled={
                    playbackRateHundredths
                    === BANDORI_SIMULATOR_PLAYBACK_RATE_MAX_HUNDREDTHS
                  }
                  aria-label={t("controls.increasePlaybackRate", {
                    amount: (adjustmentHundredths / 100).toFixed(2),
                  })}
                  onClick={() => changePlaybackRate(adjustmentHundredths)}
                >
                  +{(adjustmentHundredths / 100).toFixed(2)}
                </button>
              ))}
              <div className="flex basis-full flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[var(--theme-color-text-muted)]">
                  {t("controls.syncNoteSpeedSlowdown")}
                </span>
                <SimulatorBooleanControl
                  disabledLabel={t("controls.syncNoteSpeedSlowdownOff")}
                  enabledLabel={t("controls.syncNoteSpeedSlowdownOn")}
                  isEnabled={isNoteSpeedSlowdownSynchronized}
                  label={t("controls.syncNoteSpeedSlowdown")}
                  onChange={setIsNoteSpeedSlowdownSynchronized}
                />
              </div>
              <p className="basis-full text-xs text-[var(--theme-color-text-muted)]">
                {t("controls.syncNoteSpeedSlowdownDescription")}
              </p>
            </SimulatorControlRow>

            <SimulatorControlRow label={t("skinControls.syncLine")}>
              <SimulatorBooleanControl
                disabledLabel={t("skinControls.off")}
                enabledLabel={t("skinControls.on")}
                isEnabled={isSyncLineEnabled}
                label={t("skinControls.syncLine")}
                onChange={setIsSyncLineEnabled}
              />
            </SimulatorControlRow>

            <SimulatorControlRow label={t("skinControls.rhythmSupport")}>
              <SimulatorBooleanControl
                disabledLabel={t("skinControls.off")}
                enabledLabel={t("skinControls.on")}
                isEnabled={isRhythmSupportEnabled}
                label={t("skinControls.rhythmSupport")}
                onChange={setIsRhythmSupportEnabled}
              />
            </SimulatorControlRow>

            <SimulatorControlRow label={t("controls.mirrorData")}>
              <button
                type="button"
                aria-pressed={isMirrored}
                className={controlClassName()}
                onClick={() => setIsMirrored((value) => !value)}
              >
                <FlipHorizontal2 className="h-4 w-4" aria-hidden="true" />
                {t(isMirrored ? "diagnostics.mirrorOn" : "diagnostics.mirrorOff")}
              </button>
            </SimulatorControlRow>

            <SimulatorControlRow label={t("skinControls.laneEffect")}>
              <SimulatorBooleanControl
                disabledLabel={t("skinControls.off")}
                enabledLabel={t("skinControls.on")}
                isEnabled={isLaneEffectEnabled}
                label={t("skinControls.laneEffect")}
                onChange={setIsLaneEffectEnabled}
              />
            </SimulatorControlRow>

            <SimulatorControlRow label={t("skinControls.allPerfectStatus")}>
              <SimulatorBooleanControl
                disabledLabel={t("skinControls.off")}
                enabledLabel={t("skinControls.on")}
                isEnabled={isAllPerfectStatusEnabled}
                label={t("skinControls.allPerfectStatus")}
                onChange={setIsAllPerfectStatusEnabled}
              />
            </SimulatorControlRow>
          </div>
        </fieldset>

        <SimulatorSkinControls
          backgroundSkin={backgroundSkin}
          backgroundSkins={BANDORI_NATIVE_BACKGROUND_SKINS}
          directionalFlickSkin={directionalFlickSkin}
          fieldSkin={fieldSkin}
          fieldSkins={BANDORI_NATIVE_FIELD_SKINS}
          limitedPerformanceSkin={limitedPerformanceSkin}
          noteSkin={noteSkin}
          onBackgroundSkinChange={setBackgroundSkin}
          onDirectionalFlickSkinChange={setDirectionalFlickSkin}
          onFieldSkinChange={setFieldSkin}
          onLimitedPerformanceSkinChange={changeLimitedPerformanceSkin}
          onNoteSkinChange={setNoteSkin}
          onTapSeSkinChange={changeTapSeSkin}
          tapSeSkin={tapSeSkin}
        />
      </div>

      {!audioUrl ? <p className="mt-2 text-sm text-[var(--theme-color-semantic-warning-foreground)]">{t("audioUnavailable")}</p> : null}
      {playbackError ? <p className="mt-2 text-sm text-[var(--theme-color-semantic-danger-foreground)]">{playbackError}</p> : null}
    </section>
  );
}
