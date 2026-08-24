"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import BandoriFullChartView from "./BandoriFullChartView";
import ChartSimulatorLoadingIndicator from "./ChartSimulatorLoadingIndicator";
import SimulatorLoopControls from "./SimulatorLoopControls";
import {
  SimulatorAdjustmentButton,
  SimulatorAdjustmentValue,
  type SimulatorAdjustmentLevel,
} from "./SimulatorAdjustmentControl";
import SimulatorSettingsCard from "./SimulatorSettingsCard";
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
import { createMusicPlaybackBrowserAudioSession } from "@/lib/browser-audio-session";
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
  createBandoriNativeAudioRuntime,
  type BandoriNativeNoteSoundCueBank,
  type BandoriNativeAudioRuntime,
} from "@/lib/bandori/chart-simulator/native-audio-runtime";
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
import {
  BANDORI_NATIVE_DIRECTIONAL_EFFECT_VARIANT_DEFAULT,
  BANDORI_NATIVE_NOTE_SIZE_DEFAULT,
  BANDORI_NATIVE_NOTE_SIZE_MAX,
  BANDORI_NATIVE_NOTE_SIZE_MIN,
  BANDORI_NATIVE_NOTE_SIZE_STEP,
  BANDORI_NATIVE_SUDDEN_RATE_ADJUSTMENTS,
  BANDORI_NATIVE_SUDDEN_RATE_DEFAULT,
  BANDORI_NATIVE_SUDDEN_RATE_MAX,
  BANDORI_NATIVE_SUDDEN_RATE_MIN,
  adjustBandoriNativeNoteSize,
  adjustBandoriNativeSuddenRate,
  type BandoriNativeDirectionalEffectVariant,
} from "./native-live-settings";

const loadNativeSimulatorStageModule = () => import("./NativeSimulatorStage");
const NativeSimulatorStage = dynamic(loadNativeSimulatorStageModule, {
  ssr: false,
});
// The whole simulator is already lazy. Start its default stage chunk as soon as
// the runtime opens instead of waiting for chart and manifest requests to finish.
void loadNativeSimulatorStageModule();

type SimulatorTab = "stage" | "fullChart";
const PLAYBACK_RATE_DECREASES = [-10, -1] as const;
const PLAYBACK_RATE_INCREASES = [1, 10] as const;
const NOTE_SPEED_DECREASES = [-0.5, -0.1, -0.01] as const;
const NOTE_SPEED_INCREASES = [0.01, 0.1, 0.5] as const;
const NOTE_SIZE_ADJUSTMENTS = [BANDORI_NATIVE_NOTE_SIZE_STEP] as const;
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

type ReadyChart = {
  readonly compiled: CompiledBandoriChart;
  readonly difficulty: ChartSimulatorClientShellProps["difficulty"];
};

type LoadState =
  | {
      status: "loading";
      difficulty: ChartSimulatorClientShellProps["difficulty"];
      previous: ReadyChart | null;
    }
  | ({ status: "ready" } & ReadyChart)
  | {
      status: "error";
      difficulty: ChartSimulatorClientShellProps["difficulty"];
      message: string;
      previous: ReadyChart | null;
    };

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
  return `inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold outline-hidden transition focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-color-surface-background)] disabled:cursor-not-allowed disabled:border-[var(--theme-color-control-border-disabled)] disabled:bg-[var(--theme-color-control-background-disabled)] disabled:text-[var(--theme-color-control-foreground-disabled)] disabled:opacity-50 ${
    isPrimary
      ? "border-transparent bg-[var(--theme-color-action-primary-background)] text-[var(--theme-color-action-primary-foreground)] shadow-[var(--theme-shadow-action-primary)] hover:bg-[var(--theme-color-action-primary-background-hover)]"
      : "border-[var(--theme-color-action-secondary-border)] bg-[var(--theme-color-action-secondary-background)] text-[var(--theme-color-action-secondary-foreground)] shadow-xs hover:bg-[var(--theme-color-action-secondary-background-hover)]"
  }`;
}

function formatPlaybackTime(timeSeconds: number): string {
  const totalMilliseconds = Math.max(0, Math.round(timeSeconds * 1000));
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const remainingSeconds = (totalMilliseconds % 60_000) / 1000;
  return `${minutes}:${remainingSeconds.toFixed(3).padStart(6, "0")}`;
}

function getTimelinePercentage(timeSeconds: number, durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  return Math.min(100, Math.max(0, (timeSeconds / durationSeconds) * 100));
}

function getNoteSpeedAdjustmentLevel(adjustment: number): SimulatorAdjustmentLevel {
  const magnitude = Math.abs(adjustment);
  if (magnitude === 0.5) return 3;
  if (magnitude === 0.1) return 2;
  return 1;
}

function getPlaybackRateAdjustmentLevel(
  adjustmentHundredths: number,
): SimulatorAdjustmentLevel {
  return Math.abs(adjustmentHundredths) === 10 ? 2 : 1;
}

type SimulatorIntegerAdjustmentControlProps = {
  adjustments: readonly number[];
  currentAriaLabel: string;
  decreaseAriaLabel: (amount: number) => string;
  increaseAriaLabel: (amount: number) => string;
  maximum: number;
  minimum: number;
  onAdjust: (adjustment: number) => void;
  suffix?: string;
  value: number;
};

function SimulatorIntegerAdjustmentControl({
  adjustments,
  currentAriaLabel,
  decreaseAriaLabel,
  increaseAriaLabel,
  maximum,
  minimum,
  onAdjust,
  suffix = "",
  value,
}: SimulatorIntegerAdjustmentControlProps) {
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {[...adjustments].reverse().map((amount, index) => (
        <SimulatorAdjustmentButton
          key={-amount}
          ariaLabel={decreaseAriaLabel(amount)}
          direction="decrease"
          disabled={value === minimum}
          level={(adjustments.length - index) as SimulatorAdjustmentLevel}
          onClick={() => onAdjust(-amount)}
        />
      ))}
      <SimulatorAdjustmentValue ariaLabel={currentAriaLabel}>
        {value}{suffix}
      </SimulatorAdjustmentValue>
      {adjustments.map((amount, index) => (
        <SimulatorAdjustmentButton
          key={amount}
          ariaLabel={increaseAriaLabel(amount)}
          direction="increase"
          disabled={value === maximum}
          level={(index + 1) as SimulatorAdjustmentLevel}
          onClick={() => onAdjust(amount)}
        />
      ))}
    </div>
  );
}

export default function ChartSimulatorRuntime({
  songId,
  difficulty,
  difficulties,
  audioUrl,
  durationSeconds,
  isActive,
  onDifficultyChange,
}: ChartSimulatorClientShellProps) {
  const t = useTranslations("bandori.songs.simulator");
  const songsT = useTranslations("bandori.songs");
  const playbackRateHundredthsRef = useRef(
    BANDORI_SIMULATOR_PLAYBACK_RATE_DEFAULT_HUNDREDTHS,
  );
  const playbackAudioSessionRef = useRef<ReturnType<
    typeof createMusicPlaybackBrowserAudioSession
  > | null>(null);
  playbackAudioSessionRef.current ??= createMusicPlaybackBrowserAudioSession();
  const transportRef = useRef(createBandoriChartTransportState(durationSeconds));
  const effectTimelineVersionRef = useRef(0);
  const nativeAudioRuntimeRef = useRef<BandoriNativeAudioRuntime | null>(null);
  const noteSoundTimelineRef = useRef<BandoriNativeNoteSoundTimeline | null>(null);
  const noteSoundCursorRef = useRef(-1e-7);
  const noteSoundLastMediaTimeRef = useRef(0);
  const noteSoundNeedsLoopSyncRef = useRef(false);
  const isMediaPlaybackReadyRef = useRef(false);
  const shouldMediaPlayRef = useRef(false);
  const pendingPlaybackResumeRef = useRef(false);
  const loopRangeRef = useRef(createBandoriFullSongLoopRange(durationSeconds));
  const isLoopEnabledRef = useRef(false);
  const loopSeekPendingRef = useRef(false);
  const loopSeekPromiseRef = useRef<Promise<unknown> | null>(null);
  const coordinatorRef = useRef<ReturnType<typeof createMusicPlayerPlaybackCoordinator> | null>(null);
  const [mediaOperationSequencer] = useState(createBandoriMediaOperationSequencer);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [chartLoadAttempt, setChartLoadAttempt] = useState(0);
  const compiledChartsRef = useRef(new Map<
    ChartSimulatorClientShellProps["difficulty"],
    CompiledBandoriChart
  >());
  const chartLoadPromisesRef = useRef(new Map<string, Promise<CompiledBandoriChart>>());
  const [loadState, setLoadState] = useState<LoadState>({
    status: "loading",
    difficulty,
    previous: null,
  });
  const [assetLoadState, setAssetLoadState] = useState<AssetLoadState>({
    status: "loading",
  });
  const [transport, setTransport] = useState(transportRef.current);
  const [activeTab, setActiveTab] = useState<SimulatorTab>("stage");
  const [hasOpenedFullChart, setHasOpenedFullChart] = useState(false);
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
  const [noteSize, setNoteSize] = useState(BANDORI_NATIVE_NOTE_SIZE_DEFAULT);
  const [suddenRate, setSuddenRate] = useState(BANDORI_NATIVE_SUDDEN_RATE_DEFAULT);
  const [isSuddenLaneEnabled, setIsSuddenLaneEnabled] = useState(false);
  const [directionalEffectVariant, setDirectionalEffectVariant] = useState<
    BandoriNativeDirectionalEffectVariant
  >(
    BANDORI_NATIVE_DIRECTIONAL_EFFECT_VARIANT_DEFAULT,
  );
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
  const [hasPlaybackError, setHasPlaybackError] = useState(false);
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
  const selectedDifficultyOption = difficulties.find(
    (option) => option.difficulty === difficulty,
  );
  if (!selectedDifficultyOption) {
    throw new Error(`Unknown Bandori chart difficulty: ${difficulty}`);
  }
  const displayedChart: ReadyChart | null = loadState.status === "ready"
    ? loadState
    : loadState.previous;
  const isSelectedChartReady = loadState.status === "ready"
    && loadState.difficulty === difficulty;
  const stageLoadId = assetLoadState.status === "ready"
    && displayedChart
    ? `${loadAttempt}:${assetLoadState.manifestSha256}:${songId}:${effectiveBackgroundSkin.id}:${effectiveFieldSkin.id}:${effectiveNoteSkin.id}:${effectiveDirectionalFlickSkin.id}:${limitedPerformanceSkin?.id ?? "ordinary"}:${displayedChart.difficulty}`
    : "unavailable";
  const musicLoadId = assetLoadState.status === "ready" && audioUrl
    ? `${loadAttempt}:${assetLoadState.manifestSha256}:${audioUrl}`
    : "unavailable";
  const soundLoadId = assetLoadState.status === "ready"
    ? `${musicLoadId}:${getBandoriNativeTapSeCueBankId(effectiveTapSeSkin)}`
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
    if (!displayedChart) return null;
    try {
      return createBandoriNativeNoteSoundTimeline(displayedChart.compiled);
    } catch {
      // Sound follows the same renderability contract as visual presentation.
      return null;
    }
  }, [displayedChart]);

  const updateTransport = useCallback((next: BandoriChartTransportState) => {
    transportRef.current = next;
    setTransport(next);
  }, []);

  const cancelPendingMediaOperation = useCallback(() => {
    pendingPlaybackResumeRef.current = false;
    mediaOperationSequencer.cancel();
  }, [mediaOperationSequencer]);

  const pauseAudioInternally = useCallback(() => {
    shouldMediaPlayRef.current = false;
    return nativeAudioRuntimeRef.current?.pauseMusic() ?? null;
  }, []);

  const getStagePresentationTime = useCallback(() => {
    const currentTransport = transportRef.current;
    const runtime = nativeAudioRuntimeRef.current;
    if (
      currentTransport.phase === "playing"
      && isMediaPlaybackReadyRef.current
      && runtime
      && (runtime.isMusicPlaying || pendingPlaybackResumeRef.current)
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
      && nativeAudioRuntimeRef.current?.isMusicPlaying === true,
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
    nativeAudioRuntimeRef.current?.stopAll();
    noteSoundCursorRef.current = includeBoundary
      ? timeSeconds - 1e-7
      : timeSeconds;
    noteSoundLastMediaTimeRef.current = timeSeconds;
    noteSoundNeedsLoopSyncRef.current = rebuildActiveLoops;
  }, []);

  const flushNoteSoundsThrough = useCallback((
    timeSeconds: number,
    scheduleDuringPresentationTransition = false,
  ) => {
    const runtime = nativeAudioRuntimeRef.current;
    const timeline = noteSoundTimelineRef.current;
    const currentTimeSeconds = Math.max(0, timeSeconds);
    if (!runtime || !timeline || !runtime.isPrepared) {
      noteSoundCursorRef.current = currentTimeSeconds;
      noteSoundLastMediaTimeRef.current = currentTimeSeconds;
      return;
    }
    if (
      (runtime.isMusicPresentationTransitioning || pendingPlaybackResumeRef.current)
      && !scheduleDuringPresentationTransition
    ) return;
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
          runtime.getMusicContextTime(currentTimeSeconds) ?? undefined,
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
        + runtime.getNoteSoundScheduleAheadMediaSeconds(currentPlaybackRate),
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
      || nativeAudioRuntimeRef.current?.isMusicPlaying !== true
    ) {
      return current;
    }
    return syncBandoriChartMediaTime(current, getStagePresentationTime());
  }, [getStagePresentationTime]);

  const pauseAudioAndTransport = useCallback(() => {
    cancelPendingMediaOperation();
    const presentationSnapshot = snapshotTransportAtAudioTime();
    const continuationTimeSeconds = pauseAudioInternally();
    const snapshot = continuationTimeSeconds === null
      ? presentationSnapshot
      : syncBandoriChartMediaTime(
          presentationSnapshot,
          continuationTimeSeconds,
        );
    isMediaPlaybackReadyRef.current = false;
    const next = pauseBandoriChartTransport(snapshot);
    updateTransport(next);
    stopAndResetNoteSounds(
      snapshot.currentTimeSeconds,
      snapshot.currentTimeSeconds > 0,
    );
    nativeAudioRuntimeRef.current?.stopAll();
    playbackAudioSessionRef.current?.setActive(false);
  }, [
    cancelPendingMediaOperation,
    pauseAudioInternally,
    snapshotTransportAtAudioTime,
    stopAndResetNoteSounds,
    updateTransport,
  ]);

  const seekAudioAndTransport = useCallback(async (
    requestedTransport: BandoriChartTransportState,
    { includeStartBoundary = false }: { includeStartBoundary?: boolean } = {},
  ) => {
    const shouldResume = requestedTransport.phase === "playing";
    const requestedTimeSeconds = requestedTransport.currentTimeSeconds;
    const runtime = nativeAudioRuntimeRef.current;
    const previousPresentationTimeSeconds = shouldResume && runtime?.isMusicPlaying
      ? runtime.getMusicTime()
      : getBandoriChartPresentationTime(transportRef.current);

    pauseAudioInternally();
    const isPresentationTailDraining = shouldResume
      && runtime?.isMusicPlaying === true;
    const pendingTransport: BandoriChartTransportState = {
      ...requestedTransport,
      phase: shouldResume
        ? "playing"
        : requestedTransport.phase === "ready" ? "ready" : "paused",
      currentTimeSeconds: isPresentationTailDraining
        ? previousPresentationTimeSeconds
        : requestedTimeSeconds,
      previewTimeSeconds: null,
      shouldResumeAfterInteraction: false,
    };

    isMediaPlaybackReadyRef.current = isPresentationTailDraining;
    pendingPlaybackResumeRef.current = shouldResume;
    shouldMediaPlayRef.current = shouldResume;
    playbackAudioSessionRef.current?.setActive(false);
    invalidateStageEffects();
    stopAndResetNoteSounds(
      requestedTimeSeconds,
      requestedTimeSeconds > 0,
      requestedTimeSeconds === 0 || includeStartBoundary,
    );
    updateTransport(pendingTransport);

    if (!runtime?.isMusicPrepared) {
      pendingPlaybackResumeRef.current = false;
      shouldMediaPlayRef.current = false;
      isMediaPlaybackReadyRef.current = false;
      if (shouldResume) {
        updateTransport({ ...pendingTransport, phase: "paused" });
        setHasPlaybackError(true);
      }
      return;
    }
    setHasPlaybackError(false);

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
      if (nativeAudioRuntimeRef.current !== runtime) {
        throw new Error("Native audio runtime changed during playback start");
      }
      const started = await runtime.startMusic(
        settledTimeSeconds,
        getBandoriSimulatorPlaybackRate(playbackRateHundredthsRef.current),
      );
      operation.throwIfSuperseded();
      if (nativeAudioRuntimeRef.current !== runtime) {
        runtime.pauseMusic();
        throw new Error("Native audio runtime changed during playback start");
      }
      if (runtime.getContextState() !== "running" || !runtime.isMusicPlaying) {
        throw new Error("Audio output is not running");
      }
      return {
        settledTransport,
        startedTimeSeconds: Math.max(
          0,
          Math.min(requestedTransport.durationSeconds, started.mediaTimeSeconds),
        ),
      };
    }, {
      commit: ({ settledTransport, startedTimeSeconds }) => {
        pendingPlaybackResumeRef.current = false;
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
          startedTimeSeconds === 0 || includeStartBoundary,
        );
        flushNoteSoundsThrough(startedTimeSeconds, true);
        const presentationTimeSeconds = runtime.getMusicTime();
        updateTransport({
          ...settledTransport,
          phase: "playing",
          currentTimeSeconds: presentationTimeSeconds,
        });
        playbackAudioSessionRef.current?.setActive(true);
      },
      reportError: () => {
        pendingPlaybackResumeRef.current = false;
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
        playbackAudioSessionRef.current?.setActive(false);
        setHasPlaybackError(true);
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
    const request = seekAudioAndTransport(
      requested,
      { includeStartBoundary: true },
    );
    loopSeekPromiseRef.current = request;
    const finish = () => {
      if (loopSeekPromiseRef.current !== request) return;
      loopSeekPromiseRef.current = null;
      loopSeekPendingRef.current = false;
    };
    void request.then(finish, finish);
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

  const wrapLoopAfterBoundary = useCallback((): boolean => {
    const presentationTimeSeconds = getStagePresentationTime();
    if (
      !isLoopEnabledRef.current
      || loopSeekPendingRef.current
      || transportRef.current.phase !== "playing"
      || presentationTimeSeconds < loopRangeRef.current.endTimeSeconds
    ) {
      return false;
    }
    // Range looping intentionally uses the serialized seek handoff. The old
    // device-queued tail finishes first, then the chart and Note SE restart
    // together at the range start; a short gap is preferable to clock drift.
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
    playbackAudioSessionRef.current?.setActive(false);
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

  const handleMusicPlaybackError = useCallback((
    _error: Error,
    continuationTimeSeconds: number,
  ) => {
    cancelPendingMediaOperation();
    shouldMediaPlayRef.current = false;
    isMediaPlaybackReadyRef.current = false;
    invalidateStageEffects();
    const current = transportRef.current;
    const settledTimeSeconds = Math.max(
      0,
      Math.min(current.durationSeconds, continuationTimeSeconds),
    );
    updateTransport({
      ...current,
      phase: settledTimeSeconds >= current.durationSeconds ? "ended" : "paused",
      currentTimeSeconds: settledTimeSeconds,
      previewTimeSeconds: null,
      shouldResumeAfterInteraction: false,
    });
    stopAndResetNoteSounds(
      settledTimeSeconds,
      settledTimeSeconds > 0,
      settledTimeSeconds === 0,
    );
    nativeAudioRuntimeRef.current?.stopAll();
    playbackAudioSessionRef.current?.setActive(false);
    setHasPlaybackError(true);
  }, [
    cancelPendingMediaOperation,
    invalidateStageEffects,
    stopAndResetNoteSounds,
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
    const runtime = createBandoriNativeAudioRuntime(
      [initialCueBank],
      initialCueBank.id,
      BANDORI_NATIVE_NOTE_SOUND_VOLUME,
    );
    nativeAudioRuntimeRef.current = runtime;
    const unsubscribeContextState = runtime.subscribeContextState((state) => {
      if (
        state === "running"
        || transportRef.current.phase !== "playing"
        || !shouldMediaPlayRef.current
      ) return;
      pauseAudioAndTransport();
      if (state === "closed") setHasPlaybackError(true);
    });
    const unsubscribeMusicEnded = runtime.subscribeMusicEnded(handleMusicEnded);
    const unsubscribeMusicPlaybackError = runtime.subscribeMusicPlaybackError(
      handleMusicPlaybackError,
    );
    if (audioUrl) {
      setMusicLoadProgress({
        completedResources: 0,
        loadId: musicLoadId,
        status: "loading",
        totalResources: 1,
      });
      void runtime.prepareMusic(audioUrl, controller.signal).then(() => {
        if (!isCurrent || nativeAudioRuntimeRef.current !== runtime) return;
        setMusicLoadProgress({
          completedResources: 1,
          loadId: musicLoadId,
          status: "ready",
          totalResources: 1,
        });
      }).catch(() => {
        if (
          controller.signal.aborted
          || !isCurrent
          || nativeAudioRuntimeRef.current !== runtime
        ) return;
        setMusicLoadProgress({
          completedResources: 0,
          loadId: musicLoadId,
          status: "error",
          totalResources: 1,
        });
        setHasPlaybackError(true);
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
      unsubscribeMusicPlaybackError();
      runtime.dispose();
      if (nativeAudioRuntimeRef.current === runtime) nativeAudioRuntimeRef.current = null;
    };
  }, [
    assetLoadState,
    audioUrl,
    cancelPendingMediaOperation,
    handleMusicEnded,
    handleMusicPlaybackError,
    musicLoadId,
    pauseAudioAndTransport,
  ]);

  useEffect(() => {
    if (assetLoadState.status !== "ready") return;
    const runtime = nativeAudioRuntimeRef.current;
    if (!runtime) return;
    const controller = new AbortController();
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
        || nativeAudioRuntimeRef.current !== runtime
        || completedResourceUrls.has(url)
      ) return;
      completedResourceUrls.add(url);
      setSoundLoadProgress({
        completedResources: completedResourceUrls.size,
        loadId: soundLoadId,
        status: "loading",
        totalResources: resourceUrls.size,
      });
    }, controller.signal).then(() => {
      if (!isCurrent || nativeAudioRuntimeRef.current !== runtime) return;
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
    }).catch(() => {
      if (
        !controller.signal.aborted
        && isCurrent
        && nativeAudioRuntimeRef.current === runtime
      ) {
        setSoundLoadProgress({
          completedResources: completedResourceUrls.size,
          loadId: soundLoadId,
          status: "error",
          totalResources: resourceUrls.size,
        });
        setHasPlaybackError(true);
      }
    });
    return () => {
      isCurrent = false;
      controller.abort();
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
    nativeAudioRuntimeRef.current?.stopAll();
    setTransport(next);
    setLoopRange(nextLoopRange);
    setIsLoopEnabled(false);
    setHasPlaybackError(false);
    playbackAudioSessionRef.current?.setActive(false);
  }, [
    cancelPendingMediaOperation,
    difficulty,
    durationSeconds,
    pauseAudioInternally,
    songId,
    stopAndResetNoteSounds,
  ]);

  useEffect(() => {
    if (!isActive) pauseAudioAndTransport();
  }, [isActive, pauseAudioAndTransport]);

  useEffect(
    () => () => cancelPendingMediaOperation(),
    [cancelPendingMediaOperation],
  );

  useEffect(() => {
    let isCurrent = true;
    setAssetLoadState({ status: "loading" });
    void loadBandoriChartSimulatorAssets({
      refresh: loadAttempt > 0,
    }).then(
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
    let isCurrent = true;
    const cached = compiledChartsRef.current.get(difficulty);
    if (cached) {
      setLoadState({ status: "ready", difficulty, compiled: cached });
      return () => {
        isCurrent = false;
      };
    }
    setLoadState((current) => ({
      status: "loading",
      difficulty,
      previous: current.status === "ready" ? current : current.previous,
    }));
    const requestKey = `${chartLoadAttempt}:${difficulty}`;
    let request = chartLoadPromisesRef.current.get(requestKey);
    if (!request) {
      request = (async () => {
        const response = await fetch(selectedDifficultyOption.chartUrl, {
          cache: chartLoadAttempt > 0 ? "reload" : "default",
          credentials: "same-origin",
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(getApiErrorMessage(payload) ?? `Chart request failed with HTTP ${response.status}`);
        }
        const chart = parseChartResponse(payload, songId, difficulty);
        const compiled = await compileBandoriChartInWorker({
          chart,
          mediaDurationSeconds: durationSeconds,
        });
        if (compiled.maxCombo !== selectedDifficultyOption.expectedCombo) {
          throw new Error(`Compiled combo ${compiled.maxCombo} does not match Music metadata ${selectedDifficultyOption.expectedCombo}`);
        }
        compiledChartsRef.current.set(difficulty, compiled);
        chartLoadPromisesRef.current.delete(requestKey);
        return compiled;
      })().catch((error: unknown) => {
        chartLoadPromisesRef.current.delete(requestKey);
        throw error;
      });
      chartLoadPromisesRef.current.set(requestKey, request);
    }
    void request.then(
      (compiled) => {
        if (!isCurrent) return;
        setLoadState({ status: "ready", difficulty, compiled });
      },
      (error: unknown) => {
        if (!isCurrent) return;
        setLoadState((current) => ({
          status: "error",
          difficulty,
          message: error instanceof Error ? error.message : String(error),
          previous: current.status === "ready" ? current : current.previous,
        }));
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [
    chartLoadAttempt,
    difficulty,
    durationSeconds,
    selectedDifficultyOption,
    songId,
  ]);

  useEffect(() => {
    const coordinator = createMusicPlayerPlaybackCoordinator(
      createMusicPlayerTabId(),
      pauseAudioAndTransport,
    );
    coordinatorRef.current = coordinator;
    return () => {
      shouldMediaPlayRef.current = false;
      isMediaPlaybackReadyRef.current = false;
      nativeAudioRuntimeRef.current?.pauseMusic();
      nativeAudioRuntimeRef.current?.stopAll();
      coordinator.dispose();
      coordinatorRef.current = null;
      playbackAudioSessionRef.current?.setActive(false);
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
    if (!isActive) return;
    let animationFrame = 0;
    let lastUiUpdateMs = 0;
    const updatePlayback = (nowMs: number) => {
      const runtime = nativeAudioRuntimeRef.current;
      if (
        transportRef.current.phase === "playing"
        && isMediaPlaybackReadyRef.current
        && runtime
        && (runtime.isMusicPlaying || pendingPlaybackResumeRef.current)
      ) {
        if (!wrapLoopAfterBoundary()) {
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
    isActive,
    noteSoundTimeline,
    updateTransport,
    wrapLoopAfterBoundary,
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
      || nativeAudioRuntimeRef.current?.isMusicPrepared !== true
      || nativeAudioRuntimeRef.current?.isPrepared !== true
      || !isSelectedChartReady
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
    nativeAudioRuntimeRef.current?.stopAll();
    playbackAudioSessionRef.current?.setActive(false);
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

  const changeDifficulty = (
    nextDifficulty: ChartSimulatorClientShellProps["difficulty"],
  ) => {
    if (nextDifficulty === difficulty) return;
    pauseAudioAndTransport();
    setActiveTab("stage");
    onDifficultyChange(nextDifficulty);
  };

  const changeTab = (tab: SimulatorTab) => {
    if (tab === "fullChart") setHasOpenedFullChart(true);
    setActiveTab(tab);
  };

  const changePlaybackRate = (adjustmentHundredths: number) => {
    const nextHundredths = adjustBandoriSimulatorPlaybackRate(
      playbackRateHundredthsRef.current,
      adjustmentHundredths,
    );
    if (nextHundredths === playbackRateHundredthsRef.current) return;
    const currentTransport = snapshotTransportAtAudioTime();
    const runtime = nativeAudioRuntimeRef.current;
    const shouldResume = currentTransport.phase === "playing"
      || pendingPlaybackResumeRef.current;
    playbackRateHundredthsRef.current = nextHundredths;
    setPlaybackRateHundredths(nextHundredths);
    if (shouldResume) {
      // Native and Signalsmith use different playback nodes, and Signalsmith
      // keeps rate-dependent history. Rebuild every live rate change from one
      // continuation point so music, chart, effects, and Note SE share one anchor.
      const continuationTimeSeconds = runtime?.pauseMusic();
      void seekAudioAndTransport(
        {
          ...currentTransport,
          ...(continuationTimeSeconds === undefined
            ? {}
            : { currentTimeSeconds: continuationTimeSeconds }),
          phase: "playing",
        },
        { includeStartBoundary: true },
      );
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
  const chartLoadingError = loadState.status === "error"
    && loadState.difficulty === difficulty
    ? loadState.message
    : null;
  const audioLoadingError = currentSoundLoadProgress?.status === "error"
    ? t("audioLoadingFailed")
    : currentMusicLoadProgress?.status === "error"
      ? t("audioLoadingFailed")
      : null;
  const simulatorLoadingLabel = currentStageLoadProgress?.phase === "error"
    || audioLoadingError
    || chartLoadingError
    ? null
    : !isSelectedChartReady
      ? t("loading.chart")
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
  const hasResourceCount = isSelectedChartReady
    && currentStageLoadProgress?.totalResources !== null
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
  const isSimulatorReady = isSelectedChartReady
    && isStageReady
    && isSoundReady
    && isMusicReady;
  const retryChartLoading = () => {
    pauseAudioAndTransport();
    setHasPlaybackError(false);
    setChartLoadAttempt((value) => value + 1);
  };
  const retryLoading = () => {
    pauseAudioAndTransport();
    nativeAudioRuntimeRef.current?.stopAll();
    setHasPlaybackError(false);
    setStageLoadProgress(null);
    setSoundLoadProgress(null);
    setMusicLoadProgress(null);
    setLoadAttempt((value) => value + 1);
  };

  if (!displayedChart && loadState.status === "error") {
    return (
      <section className="rounded-3xl border border-[var(--theme-color-semantic-danger-border)] bg-[var(--theme-color-semantic-danger-background)] p-6">
        <h2 className="text-lg font-bold text-[var(--theme-color-semantic-danger-foreground)]">{t("unavailableTitle")}</h2>
        <p className="mt-2 text-sm text-[var(--theme-color-semantic-danger-foreground)]">{loadState.message}</p>
        <button
          type="button"
          className={`${controlClassName()} mt-4`}
          onClick={retryChartLoading}
        >
          {t("retry")}
        </button>
      </section>
    );
  }

  if (assetLoadState.status === "error") {
    return (
      <section className="rounded-3xl border border-[var(--theme-color-semantic-danger-border)] bg-[var(--theme-color-semantic-danger-background)] p-6">
        <h2 className="text-lg font-bold text-[var(--theme-color-semantic-danger-foreground)]">{t("unavailableTitle")}</h2>
        <p className="mt-2 text-sm text-[var(--theme-color-semantic-danger-foreground)]">{assetLoadState.message}</p>
        <button type="button" className={`${controlClassName()} mt-4`} onClick={retryLoading}>
          {t("retry")}
        </button>
      </section>
    );
  }

  if (assetLoadState.status === "loading" || !displayedChart) {
    const loadingLabel = !displayedChart ? t("loading.chart") : t("loading.manifest");
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

  const isPlaying = transport.phase === "playing";
  const playbackPercentage = getTimelinePercentage(
    presentationTime,
    durationSeconds,
  );
  const loopStartPercentage = getTimelinePercentage(
    loopRange.startTimeSeconds,
    durationSeconds,
  );
  const loopEndPercentage = getTimelinePercentage(
    loopRange.endTimeSeconds,
    durationSeconds,
  );
  return (
    <section className="rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-4 shadow-[var(--theme-shadow-surface-raised)] sm:p-6 dark:border-slate-700 dark:bg-[#111827]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-[var(--theme-color-text-default)]">{t("title")}</h2>
        </div>
        <div className="inline-flex rounded-xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background-muted)] p-1">
          {(["stage", "fullChart"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              aria-pressed={activeTab === tab}
              onClick={() => changeTab(tab)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold outline-hidden transition focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] ${activeTab === tab ? "bg-[var(--theme-color-selection-subtle-background)] text-[var(--theme-color-selection-subtle-foreground)] shadow-sm ring-1 ring-inset ring-[var(--theme-color-selection-subtle-ring)]" : "text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)] hover:text-[var(--theme-color-text-default)]"}`}
            >
              {t(`tabs.${tab}`)}
            </button>
          ))}
        </div>
      </div>

      <div
        aria-label={songsT("difficultyLabel")}
        className="mt-4 flex max-w-full gap-2 overflow-x-auto pb-1"
      >
        {difficulties.map((option) => {
          const selected = option.difficulty === difficulty;
          return (
            <button
              key={option.difficulty}
              type="button"
              aria-pressed={selected}
              onClick={() => changeDifficulty(option.difficulty)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold outline-hidden transition focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] ${selected ? "border-[var(--theme-color-action-secondary-border)] bg-[var(--theme-color-control-background-pressed)] text-[var(--theme-color-control-foreground-pressed)]" : "border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)]"}`}
            >
              {songsT(`difficulties.${option.difficulty}`)}
            </button>
          );
        })}
      </div>

      <div className="mt-5">
        <div
          className="relative"
          aria-busy={simulatorLoadingLabel !== null}
          hidden={activeTab !== "stage"}
        >
          <NativeSimulatorStage
            key={stageLoadId}
            allPerfectStatusEnabled={isAllPerfectStatusEnabled}
            ariaLabel={t("stageAria")}
            backgroundSkin={effectiveBackgroundSkin}
            compiled={displayedChart.compiled}
            directionalEffectVariant={directionalEffectVariant}
            directionalFlickSkin={effectiveDirectionalFlickSkin}
            fieldSkin={effectiveFieldSkin}
            getEffectPlaybackState={getStageEffectPlaybackState}
            getPresentationTime={getStagePresentationTime}
            isActive={isActive && activeTab === "stage" && isSelectedChartReady}
            isMirrored={isMirrored}
            laneEffectEnabled={isLaneEffectEnabled}
            limitedPerformanceSkin={limitedPerformanceSkin}
            loadId={stageLoadId}
            noteApproachTimeScale={noteApproachTimeScale}
            noteSpeed={noteSpeed}
            noteSize={noteSize}
            noteSkin={effectiveNoteSkin}
            noteContractErrorLabel={t("stageNoteContractUnavailable")}
            onLoadProgress={handleStageLoadProgress}
            rendererErrorLabel={t("rendererUnavailable")}
            resourceErrorLabel={t("stageResourceUnavailable")}
            resolveAssetUrl={assetLoadState.resolveAssetUrl}
            rhythmSupportEnabled={isRhythmSupportEnabled}
            syncLineEnabled={isSyncLineEnabled}
            suddenLaneEnabled={isSuddenLaneEnabled}
            suddenRate={suddenRate}
          />
          {chartLoadingError || audioLoadingError ? (
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
                  {chartLoadingError ?? audioLoadingError}
                </p>
                <button
                  type="button"
                  className={`${controlClassName()} mt-4`}
                  onClick={chartLoadingError ? retryChartLoading : retryLoading}
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
                completedResources={isSelectedChartReady ? completedResources : null}
                label={simulatorLoadingLabel}
                totalResources={isSelectedChartReady ? totalResources : null}
              />
            </div>
          ) : null}
        </div>
        {hasOpenedFullChart ? (
          <div hidden={activeTab !== "fullChart"}>
            <BandoriFullChartView
              compiled={displayedChart.compiled}
              isMirrored={isMirrored}
              ariaLabel={t("fullChartAria")}
              description={t("fullChartDescription")}
              analysisLabel={t("fullChartAnalysisLabel")}
            />
          </div>
        ) : null}
      </div>

      <div className="mt-5 rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background-muted)] p-4 shadow-sm">
        <div className="mb-2 flex justify-end">
          <output
            aria-live="polite"
            className="text-sm font-black tabular-nums text-[var(--theme-color-text-default)]"
          >
            {formatPlaybackTime(presentationTime)} / {formatPlaybackTime(durationSeconds)}
          </output>
        </div>
        <div className="relative h-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-visible rounded-full bg-[var(--theme-color-control-background-disabled)]"
          >
            <span
              className="absolute inset-y-0 rounded-full bg-[color-mix(in_srgb,var(--theme-color-semantic-info-foreground)_18%,transparent)]"
              style={{
                left: `${loopStartPercentage}%`,
                width: `${Math.max(0, loopEndPercentage - loopStartPercentage)}%`,
              }}
            />
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-[var(--theme-color-progress-indicator-background)]"
              style={{ width: `${playbackPercentage}%` }}
            />
            <span
              className="absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--theme-color-semantic-info-foreground)] ring-2 ring-[var(--theme-color-surface-background)]"
              style={{ left: `${loopStartPercentage}%` }}
            />
            <span
              className="absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--theme-color-semantic-info-foreground)] ring-2 ring-[var(--theme-color-surface-background)]"
              style={{ left: `${loopEndPercentage}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={durationSeconds}
            step={0.001}
            value={presentationTime}
            aria-label={t("controls.timeline")}
            onPointerDown={beginScrub}
            onKeyDown={beginScrub}
            onChange={(event) => previewScrub(Number(event.currentTarget.value))}
            onPointerUp={commitScrub}
            onKeyUp={commitScrub}
            onBlur={commitScrub}
            className="absolute inset-0 z-10 h-8 w-full cursor-pointer appearance-none rounded-full bg-transparent outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[var(--theme-color-semantic-info-foreground)] [&::-moz-range-thumb]:shadow-md [&::-moz-range-track]:h-2 [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[var(--theme-color-semantic-info-foreground)] [&::-webkit-slider-thumb]:shadow-md"
          />
        </div>
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
          key={`${songId}:${displayedChart.difficulty}:${durationSeconds}`}
          compiled={displayedChart.compiled}
          isEnabled={isLoopEnabled}
          onEnabledChange={changeLoopEnabled}
          onRangeApply={applyLoopRange}
          range={loopRange}
        />

        <SimulatorSettingsCard title={t("effectControlsTitle")}>
            <SimulatorControlRow label={t("controls.noteSpeed")}>
              <div className="flex items-center gap-1 sm:gap-2">
                  {NOTE_SPEED_DECREASES.map((adjustment) => (
                    <SimulatorAdjustmentButton
                      key={adjustment}
                      ariaLabel={t("controls.decreaseNoteSpeed", {
                        amount: Math.abs(adjustment).toFixed(2),
                      })}
                      direction="decrease"
                      disabled={noteSpeed === BANDORI_NATIVE_NOTE_SPEED_MIN}
                      level={getNoteSpeedAdjustmentLevel(adjustment)}
                      onClick={() => setNoteSpeed((current) => (
                        adjustBandoriSimulatorNoteSpeed(current, adjustment)
                      ))}
                    />
                  ))}
                  <SimulatorAdjustmentValue ariaLabel={t("controls.currentNoteSpeed")}>
                    {noteSpeed.toFixed(2)}
                  </SimulatorAdjustmentValue>
                  {NOTE_SPEED_INCREASES.map((adjustment) => (
                    <SimulatorAdjustmentButton
                      key={adjustment}
                      ariaLabel={t("controls.increaseNoteSpeed", {
                        amount: adjustment.toFixed(2),
                      })}
                      direction="increase"
                      disabled={noteSpeed === BANDORI_NATIVE_NOTE_SPEED_MAX}
                      level={getNoteSpeedAdjustmentLevel(adjustment)}
                      onClick={() => setNoteSpeed((current) => (
                        adjustBandoriSimulatorNoteSpeed(current, adjustment)
                      ))}
                    />
                  ))}
              </div>
            </SimulatorControlRow>

            <SimulatorControlRow label={t("controls.noteSize")}>
              <SimulatorIntegerAdjustmentControl
                adjustments={NOTE_SIZE_ADJUSTMENTS}
                currentAriaLabel={t("controls.currentNoteSize")}
                decreaseAriaLabel={(amount) => t("controls.decreaseNoteSize", { amount })}
                increaseAriaLabel={(amount) => t("controls.increaseNoteSize", { amount })}
                maximum={BANDORI_NATIVE_NOTE_SIZE_MAX}
                minimum={BANDORI_NATIVE_NOTE_SIZE_MIN}
                onAdjust={(adjustment) => setNoteSize((current) => (
                  adjustBandoriNativeNoteSize(current, adjustment)
                ))}
                suffix="%"
                value={noteSize}
              />
            </SimulatorControlRow>

            <SimulatorControlRow label={t("controls.suddenRate")}>
              <SimulatorIntegerAdjustmentControl
                adjustments={BANDORI_NATIVE_SUDDEN_RATE_ADJUSTMENTS}
                currentAriaLabel={t("controls.currentSuddenRate")}
                decreaseAriaLabel={(amount) => t("controls.decreaseSuddenRate", { amount })}
                increaseAriaLabel={(amount) => t("controls.increaseSuddenRate", { amount })}
                maximum={BANDORI_NATIVE_SUDDEN_RATE_MAX}
                minimum={BANDORI_NATIVE_SUDDEN_RATE_MIN}
                onAdjust={(adjustment) => setSuddenRate((current) => (
                  adjustBandoriNativeSuddenRate(current, adjustment)
                ))}
                suffix="%"
                value={suddenRate}
              />
              <div className="flex basis-full flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[var(--theme-color-text-muted)]">
                  {t("controls.suddenLane")}
                </span>
                <SimulatorBooleanControl
                  disabledLabel={t("skinControls.off")}
                  enabledLabel={t("skinControls.on")}
                  isEnabled={isSuddenLaneEnabled}
                  label={t("controls.suddenLane")}
                  onChange={setIsSuddenLaneEnabled}
                />
              </div>
            </SimulatorControlRow>

            <SimulatorControlRow label={t("controls.playbackRate")}>
              <div className="flex items-center gap-1 sm:gap-2">
                  {PLAYBACK_RATE_DECREASES.map((adjustmentHundredths) => (
                    <SimulatorAdjustmentButton
                      key={adjustmentHundredths}
                      ariaLabel={t("controls.decreasePlaybackRate", {
                        amount: (Math.abs(adjustmentHundredths) / 100).toFixed(2),
                      })}
                      direction="decrease"
                      disabled={
                        playbackRateHundredths
                        === BANDORI_SIMULATOR_PLAYBACK_RATE_MIN_HUNDREDTHS
                      }
                      level={getPlaybackRateAdjustmentLevel(adjustmentHundredths)}
                      onClick={() => changePlaybackRate(adjustmentHundredths)}
                    />
                  ))}
                  <SimulatorAdjustmentValue ariaLabel={t("controls.currentPlaybackRate")}>
                    {playbackRate.toFixed(2)}×
                  </SimulatorAdjustmentValue>
                  {PLAYBACK_RATE_INCREASES.map((adjustmentHundredths) => (
                    <SimulatorAdjustmentButton
                      key={adjustmentHundredths}
                      ariaLabel={t("controls.increasePlaybackRate", {
                        amount: (adjustmentHundredths / 100).toFixed(2),
                      })}
                      direction="increase"
                      disabled={
                        playbackRateHundredths
                        === BANDORI_SIMULATOR_PLAYBACK_RATE_MAX_HUNDREDTHS
                      }
                      level={getPlaybackRateAdjustmentLevel(adjustmentHundredths)}
                      onClick={() => changePlaybackRate(adjustmentHundredths)}
                    />
                  ))}
              </div>
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
              <SimulatorBooleanControl
                disabledLabel={t("skinControls.off")}
                enabledLabel={t("skinControls.on")}
                isEnabled={isMirrored}
                label={t("controls.mirrorData")}
                onChange={setIsMirrored}
              />
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
        </SimulatorSettingsCard>

        <SimulatorSkinControls
          backgroundSkin={backgroundSkin}
          backgroundSkins={BANDORI_NATIVE_BACKGROUND_SKINS}
          directionalFlickSkin={directionalFlickSkin}
          directionalEffectVariant={directionalEffectVariant}
          fieldSkin={fieldSkin}
          fieldSkins={BANDORI_NATIVE_FIELD_SKINS}
          limitedPerformanceSkin={limitedPerformanceSkin}
          noteSkin={noteSkin}
          onBackgroundSkinChange={setBackgroundSkin}
          onDirectionalFlickSkinChange={setDirectionalFlickSkin}
          onDirectionalEffectVariantChange={setDirectionalEffectVariant}
          onFieldSkinChange={setFieldSkin}
          onLimitedPerformanceSkinChange={changeLimitedPerformanceSkin}
          onNoteSkinChange={setNoteSkin}
          onTapSeSkinChange={changeTapSeSkin}
          tapSeSkin={tapSeSkin}
        />
      </div>

      {!audioUrl ? <p className="mt-2 text-sm text-[var(--theme-color-semantic-warning-foreground)]">{t("audioUnavailable")}</p> : null}
      {hasPlaybackError ? (
        <p className="mt-2 text-sm text-[var(--theme-color-semantic-danger-foreground)]">
          {t("audioPlaybackFailed")}
        </p>
      ) : null}
    </section>
  );
}
