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
import ChartSimulatorLoadingIndicator from "./ChartSimulatorLoadingIndicator";
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
  BANDORI_NATIVE_STAGE_SIZE,
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
import type {
  NativeSimulatorStageLoadProgress,
} from "./NativeSimulatorStage";

const NativeSimulatorStage = dynamic(() => import("./NativeSimulatorStage"), {
  ssr: false,
});

type SimulatorTab = "stage" | "fullChart";
const PLAYBACK_RATE_DECREASES = [-10, -1] as const;
const PLAYBACK_RATE_INCREASES = [1, 10] as const;
const NOTE_SPEED_DECREASES = [-0.5, -0.1, -0.01] as const;
const NOTE_SPEED_INCREASES = [0.01, 0.1, 0.5] as const;
const TRANSPORT_UI_UPDATE_INTERVAL_MS = 100;
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

type AudioResourceLoadProgress = {
  readonly completedResources: number;
  readonly loadId: string;
  readonly message?: string;
  readonly status: "loading" | "ready" | "error";
  readonly totalResources: number;
};

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
  const [stageLoadProgress, setStageLoadProgress] =
    useState<NativeSimulatorStageLoadProgress | null>(null);
  const [soundLoadProgress, setSoundLoadProgress] =
    useState<AudioResourceLoadProgress | null>(null);
  const [musicLoadProgress, setMusicLoadProgress] =
    useState<AudioResourceLoadProgress | null>(null);
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
  const stageLoadId = assetLoadState.status === "ready"
    ? `${loadAttempt}:${assetLoadState.manifestSha256}:${songId}:${effectiveBackgroundSkin.id}:${effectiveFieldSkin.id}:${effectiveNoteSkin.id}:${effectiveDirectionalFlickSkin.id}:${limitedPerformanceSkin?.id ?? "ordinary"}:${difficulty}:${isMirrored ? "mirror" : "normal"}`
    : "unavailable";
  const soundLoadId = assetLoadState.status === "ready"
    ? `${loadAttempt}:${assetLoadState.manifestSha256}:${getBandoriNativeTapSeCueBankId(effectiveTapSeSkin)}`
    : "unavailable";
  const musicLoadId = assetLoadState.status === "ready" && audioUrl
    ? `${loadAttempt}:${assetLoadState.manifestSha256}:${audioUrl}`
    : "unavailable";
  const stageLoadIdRef = useRef(stageLoadId);
  stageLoadIdRef.current = stageLoadId;

  const handleStageLoadProgress = useCallback(
    (progress: NativeSimulatorStageLoadProgress) => {
      if (progress.loadId !== stageLoadIdRef.current) return;
      setStageLoadProgress(progress);
    },
    [],
  );

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

  const pauseAudioInternally = useCallback(() => {
    shouldMediaPlayRef.current = false;
    return noteSoundRuntimeRef.current?.pauseMusic() ?? null;
  }, []);

  const getStagePresentationTime = useCallback(() => {
    const currentTransport = transportRef.current;
    const runtime = noteSoundRuntimeRef.current;
    if (
      currentTransport.phase === "playing"
      && isMediaPlaybackReadyRef.current
      && runtime?.isMusicPlaying
    ) {
      return Math.max(
        0,
        Math.min(currentTransport.durationSeconds, runtime.getMusicTime()),
      );
    }
    return getBandoriChartPresentationTime(currentTransport);
  }, []);

  const getStageEffectPlaybackState = useCallback(() => ({
    isPlaying: transportRef.current.phase === "playing"
      && isMediaPlaybackReadyRef.current
      && noteSoundRuntimeRef.current?.isMusicPlaying === true,
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

  const snapshotTransportAtAudioTime = useCallback(() => {
    const current = transportRef.current;
    if (
      current.phase !== "playing"
      || !isMediaPlaybackReadyRef.current
      || noteSoundRuntimeRef.current?.isMusicPlaying !== true
    ) {
      return current;
    }
    return syncBandoriChartMediaTime(current, getStagePresentationTime());
  }, [getStagePresentationTime]);

  const pauseAudioAndTransport = useCallback(() => {
    cancelPendingMediaOperation();
    const snapshot = snapshotTransportAtAudioTime();
    isMediaPlaybackReadyRef.current = false;
    const next = pauseBandoriChartTransport(snapshot);
    updateTransport(next);
    pauseAudioInternally();
    stopAndResetNoteSounds(
      snapshot.currentTimeSeconds,
      snapshot.currentTimeSeconds > 0,
    );
    noteSoundRuntimeRef.current?.stopAll();
    setMusicPlaybackAudioSessionActive(false);
  }, [
    cancelPendingMediaOperation,
    pauseAudioInternally,
    snapshotTransportAtAudioTime,
    stopAndResetNoteSounds,
    updateTransport,
  ]);

  const seekAudioAndTransport = useCallback(async (
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

    isMediaPlaybackReadyRef.current = false;
    pauseAudioInternally();
    setMusicPlaybackAudioSessionActive(false);
    invalidateStageEffects();
    stopAndResetNoteSounds(
      requestedTimeSeconds,
      requestedTimeSeconds > 0,
      requestedTimeSeconds === 0,
    );
    updateTransport(pendingTransport);

    const runtime = noteSoundRuntimeRef.current;
    if (!runtime?.isMusicPrepared) {
      if (shouldResume) setPlaybackError("Native music is not prepared");
      return;
    }
    setPlaybackError(null);

    return mediaOperationSequencer.runLatest(async (operation) => {
      const settledTimeSeconds = Math.max(
        0,
        Math.min(requestedTransport.durationSeconds, requestedTimeSeconds),
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

      await runtime.resume();
      operation.throwIfSuperseded();
      if (noteSoundRuntimeRef.current !== runtime) {
        throw new Error("Native audio runtime changed during playback start");
      }
      const startedMediaTime = runtime.startMusic(
        settledTimeSeconds,
        getBandoriSimulatorPlaybackRate(playbackRateHundredthsRef.current),
      );
      if (runtime.getContextState() !== "running" || !runtime.isMusicPlaying) {
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
        invalidateStageEffects();
        if (startedTimeSeconds === null) {
          pauseAudioInternally();
          isMediaPlaybackReadyRef.current = false;
          stopAndResetNoteSounds(
            settledTimeSeconds,
            settledTimeSeconds > 0,
            settledTimeSeconds === 0,
          );
          updateTransport(settledTransport);
          return;
        }

        shouldMediaPlayRef.current = true;
        isMediaPlaybackReadyRef.current = true;
        stopAndResetNoteSounds(
          startedTimeSeconds,
          startedTimeSeconds > 0,
          startedTimeSeconds === 0,
        );
        flushNoteSoundsThrough(runtime.getMusicTime());
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
        const fallbackTimeSeconds = Math.max(
          0,
          Math.min(requestedTransport.durationSeconds, runtime.pauseMusic()),
        );
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
        runtime.stopAll();
        setMusicPlaybackAudioSessionActive(false);
        setPlaybackError(error instanceof Error ? error.message : String(error));
      },
    });
  }, [
    flushNoteSoundsThrough,
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
    const current = snapshotTransportAtAudioTime();
    const currentTimeSeconds = getBandoriChartPresentationTime(current);
    if (onlyWhenOutside && isBandoriTimeInsideLoopRange(range, currentTimeSeconds)) return;

    const requested = createLoopSeekTransport(
      current,
      range.startTimeSeconds,
      shouldMediaPlayRef.current,
    );
    loopSeekPendingRef.current = true;
    const request = seekAudioAndTransport(requested);
    loopSeekPromiseRef.current = request;
    void request.finally(() => {
      if (loopSeekPromiseRef.current !== request) return;
      loopSeekPromiseRef.current = null;
      loopSeekPendingRef.current = false;
    });
  }, [
    seekAudioAndTransport,
    snapshotTransportAtAudioTime,
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

  const wrapLoopAtBoundary = useCallback((): boolean => {
    const presentationTimeSeconds = getStagePresentationTime();
    if (
      !isLoopEnabledRef.current
      || loopSeekPendingRef.current
      || transportRef.current.phase !== "playing"
      || presentationTimeSeconds < loopRangeRef.current.endTimeSeconds
    ) {
      return false;
    }
    seekToLoopStart(loopRangeRef.current, false);
    return true;
  }, [getStagePresentationTime, seekToLoopStart]);

  const handleMusicEnded = useCallback(() => {
    if (
      !shouldMediaPlayRef.current
      || transportRef.current.phase !== "playing"
    ) return;
    if (isLoopEnabledRef.current) {
      if (!loopSeekPendingRef.current) {
        seekToLoopStart(loopRangeRef.current, false);
      }
      return;
    }
    cancelPendingMediaOperation();
    shouldMediaPlayRef.current = false;
    isMediaPlaybackReadyRef.current = false;
    flushNoteSoundsThrough(durationSeconds);
    setMusicPlaybackAudioSessionActive(false);
    updateTransport({
      ...transportRef.current,
      phase: "ended",
      currentTimeSeconds: durationSeconds,
      previewTimeSeconds: null,
      shouldResumeAfterInteraction: false,
    });
  }, [
    cancelPendingMediaOperation,
    durationSeconds,
    flushNoteSoundsThrough,
    seekToLoopStart,
    updateTransport,
  ]);

  useEffect(() => {
    if (assetLoadState.status !== "ready") return;
    const controller = new AbortController();
    let isCurrent = true;
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
      pauseAudioAndTransport();
      if (state === "closed") setPlaybackError("Audio output became unavailable");
    });
    const unsubscribeMusicEnded = runtime.subscribeMusicEnded(handleMusicEnded);
    if (audioUrl) {
      setMusicLoadProgress({
        completedResources: 0,
        loadId: musicLoadId,
        status: "loading",
        totalResources: 1,
      });
      void runtime.prepareMusic(audioUrl, controller.signal).then(() => {
        if (!isCurrent || noteSoundRuntimeRef.current !== runtime) return;
        setMusicLoadProgress({
          completedResources: 1,
          loadId: musicLoadId,
          status: "ready",
          totalResources: 1,
        });
      }).catch((error: unknown) => {
        if (
          controller.signal.aborted
          || !isCurrent
          || noteSoundRuntimeRef.current !== runtime
        ) return;
        const message = error instanceof Error ? error.message : String(error);
        setMusicLoadProgress({
          completedResources: 0,
          loadId: musicLoadId,
          message,
          status: "error",
          totalResources: 1,
        });
        setPlaybackError(message);
      });
    } else {
      setMusicLoadProgress(null);
    }
    return () => {
      isCurrent = false;
      controller.abort();
      cancelPendingMediaOperation();
      unsubscribeContextState();
      unsubscribeMusicEnded();
      runtime.dispose();
      if (noteSoundRuntimeRef.current === runtime) noteSoundRuntimeRef.current = null;
    };
  }, [
    assetLoadState,
    audioUrl,
    cancelPendingMediaOperation,
    handleMusicEnded,
    musicLoadId,
    pauseAudioAndTransport,
  ]);

  useEffect(() => {
    if (assetLoadState.status !== "ready") return;
    const runtime = noteSoundRuntimeRef.current;
    if (!runtime) return;
    const cueBank = createResolvedNoteSoundCueBank(
      effectiveTapSeSkin,
      assetLoadState.resolveAssetUrl,
    );
    let isCurrent = true;
    const resourceUrls = new Set(Object.values(cueBank.cueUrls));
    const completedResourceUrls = new Set<string>();
    setSoundLoadProgress({
      completedResources: 0,
      loadId: soundLoadId,
      status: "loading",
      totalResources: resourceUrls.size,
    });
    void runtime.prepareCueBank(cueBank, (url) => {
      if (
        !isCurrent
        || noteSoundRuntimeRef.current !== runtime
        || completedResourceUrls.has(url)
      ) return;
      completedResourceUrls.add(url);
      setSoundLoadProgress({
        completedResources: completedResourceUrls.size,
        loadId: soundLoadId,
        status: "loading",
        totalResources: resourceUrls.size,
      });
    }).then(() => {
      if (!isCurrent || noteSoundRuntimeRef.current !== runtime) return;
      runtime.selectCueBank(cueBank.id);
      setSoundLoadProgress({
        completedResources: resourceUrls.size,
        loadId: soundLoadId,
        status: "ready",
        totalResources: resourceUrls.size,
      });
      const currentTimeSeconds = getStagePresentationTime();
      stopAndResetNoteSounds(
        currentTimeSeconds,
        currentTimeSeconds > 0,
        currentTimeSeconds === 0,
      );
    }).catch((error: unknown) => {
      if (isCurrent && noteSoundRuntimeRef.current === runtime) {
        const message = error instanceof Error ? error.message : String(error);
        setSoundLoadProgress({
          completedResources: completedResourceUrls.size,
          loadId: soundLoadId,
          message,
          status: "error",
          totalResources: resourceUrls.size,
        });
        setPlaybackError(message);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [
    assetLoadState,
    effectiveTapSeSkin,
    getStagePresentationTime,
    soundLoadId,
    stopAndResetNoteSounds,
  ]);

  useEffect(() => {
    cancelPendingMediaOperation();
    const next = createBandoriChartTransportState(durationSeconds);
    const nextLoopRange = createBandoriFullSongLoopRange(durationSeconds);
    transportRef.current = next;
    loopRangeRef.current = nextLoopRange;
    isLoopEnabledRef.current = false;
    loopSeekPendingRef.current = false;
    loopSeekPromiseRef.current = null;
    isMediaPlaybackReadyRef.current = false;
    shouldMediaPlayRef.current = false;
    pauseAudioInternally();
    effectTimelineVersionRef.current += 1;
    stopAndResetNoteSounds(0, false, true);
    noteSoundRuntimeRef.current?.stopAll();
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
    const coordinator = createMusicPlayerPlaybackCoordinator(
      createMusicPlayerTabId(),
      pauseAudioAndTransport,
    );
    coordinatorRef.current = coordinator;
    return () => {
      shouldMediaPlayRef.current = false;
      isMediaPlaybackReadyRef.current = false;
      noteSoundRuntimeRef.current?.pauseMusic();
      noteSoundRuntimeRef.current?.stopAll();
      coordinator.dispose();
      coordinatorRef.current = null;
      setMusicPlaybackAudioSessionActive(false);
    };
  }, [pauseAudioAndTransport]);

  useEffect(() => {
    const pauseWhenDocumentBecomesHidden = () => {
      if (
        document.visibilityState !== "hidden"
        || transportRef.current.phase !== "playing"
      ) return;
      // The audio render thread can outlive a throttled animation frame. Freeze
      // the shared clock before either the visual or SE cursor falls behind.
      pauseAudioAndTransport();
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
    if (activeTab === "fullChart") setStageLoadProgress(null);
  }, [activeTab]);

  useEffect(() => {
    let animationFrame = 0;
    let lastUiUpdateMs = 0;
    const updatePlayback = (nowMs: number) => {
      const runtime = noteSoundRuntimeRef.current;
      if (
        transportRef.current.phase === "playing"
        && isMediaPlaybackReadyRef.current
        && runtime?.isMusicPlaying
      ) {
        if (!wrapLoopAtBoundary()) {
          const presentationTimeSeconds = getStagePresentationTime();
          if (noteSoundTimeline) flushNoteSoundsThrough(presentationTimeSeconds);
          if (nowMs - lastUiUpdateMs >= TRANSPORT_UI_UPDATE_INTERVAL_MS) {
            lastUiUpdateMs = nowMs;
            updateTransport(syncBandoriChartMediaTime(
              transportRef.current,
              presentationTimeSeconds,
            ));
          }
        }
      }
      animationFrame = window.requestAnimationFrame(updatePlayback);
    };
    animationFrame = window.requestAnimationFrame(updatePlayback);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [
    flushNoteSoundsThrough,
    getStagePresentationTime,
    noteSoundTimeline,
    updateTransport,
    wrapLoopAtBoundary,
  ]);

  const presentationTime = getBandoriChartPresentationTime(transport);
  const play = async () => {
    if (
      !audioUrl
      || musicLoadProgress?.loadId !== musicLoadId
      || musicLoadProgress.status !== "ready"
      || soundLoadProgress?.loadId !== soundLoadId
      || soundLoadProgress.status !== "ready"
      || stageLoadProgress?.loadId !== stageLoadId
      || stageLoadProgress.phase !== "ready"
      || noteSoundRuntimeRef.current?.isMusicPrepared !== true
      || loadState.status !== "ready"
    ) return;
    const next = playBandoriChartTransport(transportRef.current);
    useMusicPlayerStore.getState().requestPause();
    coordinatorRef.current?.claimPlayback();
    await seekAudioAndTransport(next);
  };

  const pause = () => {
    pauseAudioAndTransport();
  };

  const restart = () => {
    const next = restartBandoriChartTransport(transportRef.current);
    void seekAudioAndTransport(next);
  };

  const jump = (delta: -5 | 5) => {
    const next = jumpBandoriChartTransport(snapshotTransportAtAudioTime(), delta);
    void seekAudioAndTransport(next);
  };

  const beginScrub = () => {
    cancelPendingMediaOperation();
    const current = snapshotTransportAtAudioTime();
    isMediaPlaybackReadyRef.current = false;
    if (current.phase !== "scrubbing") invalidateStageEffects();
    stopAndResetNoteSounds(current.currentTimeSeconds, false);
    updateTransport(beginBandoriChartScrub(current));
    pauseAudioInternally();
    noteSoundRuntimeRef.current?.stopAll();
    setMusicPlaybackAudioSessionActive(false);
  };

  const previewScrub = (value: number) => {
    updateTransport(previewBandoriChartScrub(transportRef.current, value));
  };

  const commitScrub = () => {
    const current = transportRef.current;
    if (current.phase !== "scrubbing") return;
    const next = commitBandoriChartScrub(current);
    void seekAudioAndTransport(next);
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
    const currentTransport = snapshotTransportAtAudioTime();
    const runtime = noteSoundRuntimeRef.current;
    playbackRateHundredthsRef.current = nextHundredths;
    setPlaybackRateHundredths(nextHundredths);
    const nextPlaybackRate = getBandoriSimulatorPlaybackRate(nextHundredths);
    const noteSoundTimeSeconds = currentTransport.phase === "playing"
      && runtime?.isMusicPlaying
      ? runtime.setMusicPlaybackRate(nextPlaybackRate)
      : getBandoriChartPresentationTime(currentTransport);
    if (currentTransport.phase === "playing") {
      updateTransport(syncBandoriChartMediaTime(currentTransport, noteSoundTimeSeconds));
    }
    // Future triggers need new real-time timestamps. Active keep SE is rebuilt
    // at its 1x sample phase while the chart/media clock stays untouched.
    stopAndResetNoteSounds(
      noteSoundTimeSeconds,
      noteSoundTimeSeconds > 0,
      noteSoundTimeSeconds === 0,
    );
    if (currentTransport.phase === "playing") {
      flushNoteSoundsThrough(noteSoundTimeSeconds);
    }
  };

  const currentStageLoadProgress = stageLoadProgress?.loadId === stageLoadId
    ? stageLoadProgress
    : null;
  const currentSoundLoadProgress = soundLoadProgress?.loadId === soundLoadId
    ? soundLoadProgress
    : null;
  const currentMusicLoadProgress = musicLoadProgress?.loadId === musicLoadId
    ? musicLoadProgress
    : null;
  const isStageReady = currentStageLoadProgress?.phase === "ready";
  const isSoundReady = currentSoundLoadProgress?.status === "ready";
  const isMusicReady = !audioUrl || currentMusicLoadProgress?.status === "ready";
  const audioLoadingError = currentSoundLoadProgress?.status === "error"
    ? currentSoundLoadProgress.message ?? t("unavailableTitle")
    : currentMusicLoadProgress?.status === "error"
      ? currentMusicLoadProgress.message ?? t("unavailableTitle")
      : null;
  const simulatorLoadingLabel = currentStageLoadProgress?.phase === "error"
    || audioLoadingError
    ? null
    : !currentStageLoadProgress
      || currentStageLoadProgress.phase === "resources"
      ? t("loading.performance")
      : !isSoundReady
        ? t("loading.sound")
        : !isMusicReady
          ? t("loading.music")
          : !isStageReady
            ? t("loading.stage")
            : null;
  const hasResourceCount = currentStageLoadProgress?.totalResources !== null
    && currentStageLoadProgress?.totalResources !== undefined
    && currentSoundLoadProgress !== null
    && (!audioUrl || currentMusicLoadProgress !== null);
  const completedResources = hasResourceCount
    ? currentStageLoadProgress.completedResources
      + currentSoundLoadProgress.completedResources
      + (currentMusicLoadProgress?.completedResources ?? 0)
    : null;
  const totalResources = hasResourceCount
    ? currentStageLoadProgress.totalResources
      + currentSoundLoadProgress.totalResources
      + (currentMusicLoadProgress?.totalResources ?? 0)
    : null;
  const isSimulatorReady = isStageReady && isSoundReady && isMusicReady;

  if (loadState.status === "loading" || assetLoadState.status === "loading") {
    const loadingLabel = loadState.status === "loading"
      ? t("loading.chart")
      : t("loading.manifest");
    return (
      <section
        aria-busy="true"
        className="rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-4 shadow-[var(--theme-shadow-surface-raised)] sm:p-6 dark:border-slate-700 dark:bg-[#111827]"
      >
        <h2 className="text-xl font-black text-[var(--theme-color-text-default)]">
          {t("title")}
        </h2>
        <div
          className="mt-5 flex w-full items-center justify-center rounded-2xl bg-[var(--theme-color-control-background-muted)] ring-1 ring-inset ring-[var(--theme-color-border-subtle)]"
          style={{
            aspectRatio: `${BANDORI_NATIVE_STAGE_SIZE.width} / ${BANDORI_NATIVE_STAGE_SIZE.height}`,
          }}
        >
          <ChartSimulatorLoadingIndicator label={loadingLabel} />
        </div>
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
          <div className="relative" aria-busy={simulatorLoadingLabel !== null}>
            <NativeSimulatorStage
              key={stageLoadId}
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
              loadId={stageLoadId}
              noteApproachTimeScale={noteApproachTimeScale}
              noteSpeed={noteSpeed}
              noteSkin={effectiveNoteSkin}
              noteContractErrorLabel={t("stageNoteContractUnavailable")}
              onLoadProgress={handleStageLoadProgress}
              rendererErrorLabel={t("rendererUnavailable")}
              resourceErrorLabel={t("stageResourceUnavailable")}
              resolveAssetUrl={assetLoadState.resolveAssetUrl}
              rhythmSupportEnabled={isRhythmSupportEnabled}
              syncLineEnabled={isSyncLineEnabled}
            />
            {audioLoadingError ? (
              <div
                className="absolute inset-x-0 top-0 z-20 flex items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--theme-color-surface-background)_94%,transparent)] p-6 text-center backdrop-blur-sm"
                style={{
                  aspectRatio: `${BANDORI_NATIVE_STAGE_SIZE.width} / ${BANDORI_NATIVE_STAGE_SIZE.height}`,
                }}
              >
                <div>
                  <h3 className="text-base font-bold text-[var(--theme-color-semantic-danger-foreground)]">
                    {t("unavailableTitle")}
                  </h3>
                  <p className="mt-2 text-sm text-[var(--theme-color-semantic-danger-foreground)]">
                    {audioLoadingError}
                  </p>
                  <button
                    type="button"
                    className={`${controlClassName()} mt-4`}
                    onClick={() => setLoadAttempt((value) => value + 1)}
                  >
                    {t("retry")}
                  </button>
                </div>
              </div>
            ) : simulatorLoadingLabel ? (
              <div
                className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--theme-color-surface-background)_90%,transparent)] p-6 backdrop-blur-sm"
                style={{
                  aspectRatio: `${BANDORI_NATIVE_STAGE_SIZE.width} / ${BANDORI_NATIVE_STAGE_SIZE.height}`,
                }}
              >
                <ChartSimulatorLoadingIndicator
                  completedResources={completedResources}
                  label={simulatorLoadingLabel}
                  totalResources={totalResources}
                />
              </div>
            ) : null}
          </div>
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
            disabled={!audioUrl || (!isPlaying && !isSimulatorReady)}
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
