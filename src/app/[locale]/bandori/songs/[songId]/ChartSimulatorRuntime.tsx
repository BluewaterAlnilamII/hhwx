"use client";

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  FastForward,
  Maximize,
  Minimize,
  Pause,
  Play,
  Rewind,
  RotateCcw,
  StepBack,
  StepForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import BandoriFullChartView from "./BandoriFullChartView";
import ChartSimulatorLoadingIndicator from "./ChartSimulatorLoadingIndicator";
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
  MUSIC_PLAYER_PLAYBACK_BUTTON_CLASS_NAME,
  MUSIC_PLAYER_SEEK_BUTTON_CLASS_NAME,
} from "@/components/music-player/transport-control-styles";
import {
  BANDORI_NATIVE_BACKGROUND_SKIN,
  BANDORI_NATIVE_BACKGROUND_SKINS,
  BANDORI_NATIVE_FIELD_SKIN,
  BANDORI_NATIVE_FIELD_SKIN_CHOICES,
  BANDORI_NATIVE_STAGE_SIZE,
  type BandoriNativeBackgroundSkin,
  type BandoriNativeFieldSkin,
} from "./native-stage-contract";
import {
  BANDORI_NATIVE_DIRECTIONAL_FLICK_SKIN,
  BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS,
  BANDORI_NATIVE_NOTE_SKIN,
  BANDORI_NATIVE_NOTE_SKINS,
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
  BANDORI_NATIVE_NOTE_SPEED_MAX,
  BANDORI_NATIVE_NOTE_SPEED_MIN,
} from "@/lib/bandori/chart-simulator/native-note-presentation";
import {
  collectBandoriNativeNoteSoundEvents,
  createBandoriNativeNoteSoundTimeline,
  getBandoriNativeActiveNoteSoundLoops,
  getBandoriNativeNoteSoundCueUrls,
  getBandoriNativeTapSeCueBankId,
  BANDORI_NATIVE_TAP_SE_SKIN,
  BANDORI_NATIVE_TAP_SE_SKINS,
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
  clearBandoriChartLoopPoint,
  createBandoriChartLoopPoints,
  getBandoriChartLoopRange,
  setBandoriChartLoopPoint,
  type BandoriChartLoopPointKind,
  type BandoriChartLoopPoints,
  type BandoriChartLoopRange,
} from "@/lib/bandori/chart-simulator/loop-range";
import {
  adjustBandoriSimulatorPlaybackRate,
  BANDORI_SIMULATOR_PLAYBACK_RATE_MAX_HUNDREDTHS,
  BANDORI_SIMULATOR_PLAYBACK_RATE_MIN_HUNDREDTHS,
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
  stepBandoriChartTransport,
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
import {
  BANDORI_LIMITED_PERFORMANCE_SKINS,
  type BandoriLimitedPerformanceSkin,
} from "./limited-performance-skins";
import {
  BANDORI_NATIVE_TAP_EFFECT_SKIN,
  BANDORI_NATIVE_TAP_EFFECT_SKINS,
  type BandoriNativeTapEffectSkin,
} from "./native-tap-effect-assets";
import type {
  NativeSimulatorStageLoadProgress,
} from "./NativeSimulatorStage";
import {
  BANDORI_NATIVE_NOTE_SIZE_MAX,
  BANDORI_NATIVE_NOTE_SIZE_MIN,
  BANDORI_NATIVE_NOTE_SIZE_STEP,
  BANDORI_NATIVE_SUDDEN_RATE_ADJUSTMENTS,
  BANDORI_NATIVE_SUDDEN_RATE_MAX,
  BANDORI_NATIVE_SUDDEN_RATE_MIN,
  BANDORI_NATIVE_VOLUME_MAX,
  BANDORI_NATIVE_VOLUME_MIN,
  BANDORI_NATIVE_VOLUME_STEP,
  adjustBandoriNativeNoteSize,
  adjustBandoriNativeSuddenRate,
  getBandoriNativeBgmGain,
  getBandoriNativeSeGain,
  type BandoriNativeDirectionalEffectVariant,
} from "./native-live-settings";
import {
  readBandoriChartSimulatorPreferences,
  writeBandoriChartSimulatorPreferences,
} from "./chart-simulator-preferences";
import { cn } from "@/lib/utils";

const loadNativeSimulatorStageModule = () => import("./NativeSimulatorStage");
const NativeSimulatorStage = dynamic(loadNativeSimulatorStageModule, {
  ssr: false,
});
// The whole simulator is already lazy. Start its default stage chunk as soon as
// the runtime opens instead of waiting for chart and manifest requests to finish.
void loadNativeSimulatorStageModule();

type SimulatorTab = "stage" | "fullChart";
const IS_FULL_CHART_VIEW_ENABLED: boolean = false;
const PLAYBACK_RATE_DECREASES = [-10, -1] as const;
const PLAYBACK_RATE_INCREASES = [1, 10] as const;
const NOTE_SPEED_DECREASES = [-0.5, -0.1, -0.01] as const;
const NOTE_SPEED_INCREASES = [0.01, 0.1, 0.5] as const;
const NOTE_SIZE_ADJUSTMENTS = [BANDORI_NATIVE_NOTE_SIZE_STEP] as const;
const TRANSPORT_UI_UPDATE_RATE_PER_SECOND = 30;
const TRANSPORT_UI_UPDATE_INTERVAL_MS = 1000 / TRANSPORT_UI_UPDATE_RATE_PER_SECOND;
const FULLSCREEN_STAGE_WIDTH_DVH = BANDORI_NATIVE_STAGE_SIZE.width
  / BANDORI_NATIVE_STAGE_SIZE.height
  * 100;
const FULLSCREEN_STAGE_HEIGHT_DVW = BANDORI_NATIVE_STAGE_SIZE.height
  / BANDORI_NATIVE_STAGE_SIZE.width
  * 100;
const FULLSCREEN_OVERLAY_BUTTON_CLASS_NAME =
  "pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-slate-950/65 text-white shadow-lg outline-hidden backdrop-blur-sm transition hover:bg-slate-950/80 focus-visible:ring-2 focus-visible:ring-white/85 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-slate-950/65";
const FULLSCREEN_OVERLAY_ACTIVE_BUTTON_CLASS_NAME =
  "bg-[var(--theme-color-progress-indicator-background)] text-white hover:bg-[var(--theme-color-progress-indicator-background)]";
// Frame stepping follows a stable simulator clock instead of the display's
// variable refresh rate, while hold repetition stays slow enough for inspection.
const FRAME_STEP_HOLD_DELAY_MS = 350;
const FRAME_STEP_REPEAT_RATE_PER_SECOND = 15;
const FRAME_STEP_REPEAT_INTERVAL_MS = 1000 / FRAME_STEP_REPEAT_RATE_PER_SECOND;
const LOOP_POINT_CLEAR_HOLD_DELAY_MS = 500;
const NATIVE_RANGE_NAVIGATION_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
]);

type FrameStepDirection = -1 | 1;

type ActiveFrameStepHold = {
  source: string;
  delayTimer: number;
  repeatTimer: number | null;
};

type ActiveLoopPointClearHold = {
  delayTimer: number;
  didClear: boolean;
  kind: BandoriChartLoopPointKind;
  source: string;
};

function isSimulatorShortcutInput(target: EventTarget | null): boolean {
  return target instanceof Element
    && target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox'], [role='slider']") !== null;
}

function getBandoriChartSimulatorPreferenceStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function findSkinById<TSkin extends Readonly<{ id: number | string }>>(
  skins: readonly TSkin[],
  id: number | string,
  fallback: TSkin,
): TSkin {
  return skins.find((skin) => skin.id === id) ?? fallback;
}

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

function controlClassName(): string {
  return "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--theme-color-action-secondary-border)] bg-[var(--theme-color-action-secondary-background)] px-4 text-sm font-semibold text-[var(--theme-color-action-secondary-foreground)] shadow-xs outline-hidden transition hover:bg-[var(--theme-color-action-secondary-background-hover)] focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-color-surface-background)] disabled:cursor-not-allowed disabled:border-[var(--theme-color-control-border-disabled)] disabled:bg-[var(--theme-color-control-background-disabled)] disabled:text-[var(--theme-color-control-foreground-disabled)] disabled:opacity-50";
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

type SimulatorVolumeControlProps = {
  inputId: string;
  isMuted: boolean;
  label: string;
  muteLabel: string;
  onChange: (value: number) => void;
  onMuteToggle: () => void;
  unmuteLabel: string;
  value: number;
};

function SimulatorVolumeControl({
  inputId,
  isMuted,
  label,
  muteLabel,
  onChange,
  onMuteToggle,
  unmuteLabel,
  value,
}: SimulatorVolumeControlProps) {
  return (
    <div className="grid grid-cols-[max-content_2.25rem_5rem] items-center gap-x-1 text-sm font-semibold text-[var(--theme-color-text-muted)]">
      <label htmlFor={inputId}>{label}</label>
      <button
        type="button"
        onClick={onMuteToggle}
        aria-label={isMuted ? unmuteLabel : muteLabel}
        aria-pressed={isMuted}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] outline-hidden transition focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] ${isMuted ? "bg-[var(--theme-color-control-background-pressed)] text-[var(--theme-color-progress-foreground)]" : "text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-pressed)]"}`}
      >
        {isMuted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
      </button>
      <input
        id={inputId}
        type="range"
        min={BANDORI_NATIVE_VOLUME_MIN}
        max={BANDORI_NATIVE_VOLUME_MAX}
        step={BANDORI_NATIVE_VOLUME_STEP}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        className="min-w-0 accent-[var(--theme-color-progress-indicator-background)]"
      />
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
  const playerT = useTranslations("navigation.toolbar.player");
  const [initialPreferences] = useState(() => readBandoriChartSimulatorPreferences(
    getBandoriChartSimulatorPreferenceStorage(),
  ));
  const playbackRateHundredthsRef = useRef(
    initialPreferences.playbackRateHundredths,
  );
  const playbackAudioSessionRef = useRef<ReturnType<
    typeof createMusicPlaybackBrowserAudioSession
  > | null>(null);
  playbackAudioSessionRef.current ??= createMusicPlaybackBrowserAudioSession();
  const transportRef = useRef(createBandoriChartTransportState(durationSeconds));
  const fullscreenRootRef = useRef<HTMLDivElement | null>(null);
  const frameStepHoldRef = useRef<ActiveFrameStepHold | null>(null);
  const loopPointClearHoldRef = useRef<ActiveLoopPointClearHold | null>(null);
  const suppressedLoopPointClickRef = useRef<BandoriChartLoopPointKind | null>(null);
  const effectTimelineVersionRef = useRef(0);
  const nativeAudioRuntimeRef = useRef<BandoriNativeAudioRuntime | null>(null);
  const bgmVolumeRef = useRef(initialPreferences.bgmVolume);
  const seVolumeRef = useRef(initialPreferences.seVolume);
  const isBgmMutedRef = useRef(initialPreferences.isBgmMuted);
  const isSeMutedRef = useRef(initialPreferences.isSeMuted);
  const noteSoundTimelineRef = useRef<BandoriNativeNoteSoundTimeline | null>(null);
  const noteSoundCursorRef = useRef(-1e-7);
  const noteSoundLastMediaTimeRef = useRef(0);
  const noteSoundNeedsLoopSyncRef = useRef(false);
  const isMediaPlaybackReadyRef = useRef(false);
  const shouldMediaPlayRef = useRef(false);
  const pendingPlaybackResumeRef = useRef(false);
  const loopPointsRef = useRef<BandoriChartLoopPoints>(
    createBandoriChartLoopPoints(),
  );
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
  const [isStageFullscreen, setIsStageFullscreen] = useState(false);
  const [isFullscreenSupported, setIsFullscreenSupported] = useState(false);
  const [stageRenderFps, setStageRenderFps] = useState<number | null>(null);
  const [hasOpenedFullChart, setHasOpenedFullChart] = useState(false);
  const [isMirrored, setIsMirrored] = useState(initialPreferences.isMirrored);
  const [playbackRateHundredths, setPlaybackRateHundredths] = useState(
    initialPreferences.playbackRateHundredths,
  );
  const [loopPoints, setLoopPoints] = useState<BandoriChartLoopPoints>(
    createBandoriChartLoopPoints,
  );
  const [noteSpeed, setNoteSpeed] = useState(initialPreferences.noteSpeed);
  const [noteSize, setNoteSize] = useState(initialPreferences.noteSize);
  const [suddenRate, setSuddenRate] = useState(initialPreferences.suddenRate);
  const [isSuddenLaneEnabled, setIsSuddenLaneEnabled] = useState(
    initialPreferences.isSuddenLaneEnabled,
  );
  const [bgmVolume, setBgmVolume] = useState(initialPreferences.bgmVolume);
  const [seVolume, setSeVolume] = useState(initialPreferences.seVolume);
  const [isBgmMuted, setIsBgmMuted] = useState(initialPreferences.isBgmMuted);
  const [isSeMuted, setIsSeMuted] = useState(initialPreferences.isSeMuted);
  const [directionalEffectVariant, setDirectionalEffectVariant] = useState<
    BandoriNativeDirectionalEffectVariant
  >(
    initialPreferences.directionalEffectVariant,
  );
  const [backgroundSkin, setBackgroundSkin] = useState<BandoriNativeBackgroundSkin>(
    () => findSkinById(
      BANDORI_NATIVE_BACKGROUND_SKINS,
      initialPreferences.backgroundSkinId,
      BANDORI_NATIVE_BACKGROUND_SKIN,
    ),
  );
  const [fieldSkin, setFieldSkin] = useState<BandoriNativeFieldSkin>(
    () => findSkinById(
      BANDORI_NATIVE_FIELD_SKIN_CHOICES,
      initialPreferences.fieldSkinId,
      BANDORI_NATIVE_FIELD_SKIN,
    ),
  );
  const [noteSkin, setNoteSkin] = useState<BandoriNativeNoteSkin>(
    () => findSkinById(
      BANDORI_NATIVE_NOTE_SKINS,
      initialPreferences.noteSkinId,
      BANDORI_NATIVE_NOTE_SKIN,
    ),
  );
  const [directionalFlickSkin, setDirectionalFlickSkin] =
    useState<BandoriNativeDirectionalFlickSkin>(
      () => findSkinById(
        BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS,
        initialPreferences.directionalFlickSkinId,
        BANDORI_NATIVE_DIRECTIONAL_FLICK_SKIN,
      ),
    );
  const [tapSeSkin, setTapSeSkin] = useState<BandoriNativeTapSeSkin>(
    () => findSkinById(
      BANDORI_NATIVE_TAP_SE_SKINS,
      initialPreferences.tapSeSkinId,
      BANDORI_NATIVE_TAP_SE_SKIN,
    ),
  );
  const [tapEffectSkin, setTapEffectSkin] = useState<BandoriNativeTapEffectSkin>(
    () => findSkinById(
      BANDORI_NATIVE_TAP_EFFECT_SKINS,
      initialPreferences.tapEffectSkinId,
      BANDORI_NATIVE_TAP_EFFECT_SKIN,
    ),
  );
  const [limitedPerformanceSkin, setLimitedPerformanceSkin] =
    useState<BandoriLimitedPerformanceSkin | null>(() => (
      BANDORI_LIMITED_PERFORMANCE_SKINS.find(
        (skin) => skin.id === initialPreferences.limitedPerformanceSkinId,
      ) ?? null
    ));
  const [isSyncLineEnabled, setIsSyncLineEnabled] = useState(
    initialPreferences.isSyncLineEnabled,
  );
  const [isRhythmSupportEnabled, setIsRhythmSupportEnabled] = useState(
    initialPreferences.isRhythmSupportEnabled,
  );
  const [isLaneEffectEnabled, setIsLaneEffectEnabled] = useState(
    initialPreferences.isLaneEffectEnabled,
  );
  const [stageLoadProgress, setStageLoadProgress] =
    useState<NativeSimulatorStageLoadProgress | null>(null);
  const [soundLoadProgress, setSoundLoadProgress] =
    useState<AudioResourceLoadProgress | null>(null);
  const [musicLoadProgress, setMusicLoadProgress] =
    useState<AudioResourceLoadProgress | null>(null);
  const [hasPlaybackError, setHasPlaybackError] = useState(false);
  useEffect(() => {
    const updateFullscreenState = () => {
      const fullscreenRoot = fullscreenRootRef.current;
      setIsStageFullscreen(
        fullscreenRoot !== null && document.fullscreenElement === fullscreenRoot,
      );
    };
    setIsFullscreenSupported(document.fullscreenEnabled);
    document.addEventListener("fullscreenchange", updateFullscreenState);
    updateFullscreenState();
    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreenState);
    };
  }, []);
  useEffect(() => {
    writeBandoriChartSimulatorPreferences(
      getBandoriChartSimulatorPreferenceStorage(),
      {
        backgroundSkinId: backgroundSkin.id,
        bgmVolume,
        directionalEffectVariant,
        directionalFlickSkinId: directionalFlickSkin.id,
        fieldSkinId: fieldSkin.id,
        isBgmMuted,
        isLaneEffectEnabled,
        isMirrored,
        isRhythmSupportEnabled,
        isSeMuted,
        isSuddenLaneEnabled,
        isSyncLineEnabled,
        limitedPerformanceSkinId: limitedPerformanceSkin?.id ?? null,
        noteSize,
        noteSkinId: noteSkin.id,
        noteSpeed,
        playbackRateHundredths,
        seVolume,
        suddenRate,
        tapEffectSkinId: tapEffectSkin.id,
        tapSeSkinId: tapSeSkin.id,
      },
    );
  }, [
    backgroundSkin,
    bgmVolume,
    directionalEffectVariant,
    directionalFlickSkin,
    fieldSkin,
    isBgmMuted,
    isLaneEffectEnabled,
    isMirrored,
    isRhythmSupportEnabled,
    isSeMuted,
    isSuddenLaneEnabled,
    isSyncLineEnabled,
    limitedPerformanceSkin,
    noteSize,
    noteSkin,
    noteSpeed,
    playbackRateHundredths,
    seVolume,
    suddenRate,
    tapEffectSkin,
    tapSeSkin,
  ]);
  const playbackRate = getBandoriSimulatorPlaybackRate(playbackRateHundredths);
  const noteApproachTimeScale = getBandoriSimulatorNoteApproachTimeScale(
    playbackRateHundredths,
  );
  const effectiveBackgroundSkin =
    limitedPerformanceSkin?.backgroundSkin ?? backgroundSkin;
  const effectiveFieldSkin = limitedPerformanceSkin?.fieldSkin ?? fieldSkin;
  const effectiveNoteSkin = limitedPerformanceSkin?.noteSkin ?? noteSkin;
  const effectiveDirectionalFlickSkin =
    limitedPerformanceSkin?.directionalFlickSkin ?? directionalFlickSkin;
  const effectiveTapSeSkin = limitedPerformanceSkin?.tapSeSkin ?? tapSeSkin;
  const isLimitedTapEffectOverridden = limitedPerformanceSkin?.coverage.includes(
    "tapEffect",
  ) === true;
  if (isLimitedTapEffectOverridden && !limitedPerformanceSkin.effects) {
    throw new Error("Limited performance tap-effect contract is absent");
  }
  const effectiveTapEffectContract = isLimitedTapEffectOverridden
    ? limitedPerformanceSkin.effects
    : tapEffectSkin.effects;
  const isTapEffectEnabled = isLimitedTapEffectOverridden
    || tapEffectSkin.id !== "off";
  const isDirectionalEffectEnabled = directionalEffectVariant !== "off";
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
    ? `${loadAttempt}:${assetLoadState.manifestSha256}:${songId}:${effectiveBackgroundSkin.id}:${effectiveFieldSkin.id}:${effectiveNoteSkin.id}:${effectiveDirectionalFlickSkin.id}:${tapEffectSkin.id}:${isDirectionalEffectEnabled ? "directional-on" : "directional-off"}:${limitedPerformanceSkin?.id ?? "ordinary"}:${displayedChart.difficulty}`
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

  const changeBgmVolume = (volume: number) => {
    bgmVolumeRef.current = volume;
    setBgmVolume(volume);
    nativeAudioRuntimeRef.current?.setBgmVolume(
      isBgmMutedRef.current ? 0 : getBandoriNativeBgmGain(volume),
    );
  };

  const changeSeVolume = (volume: number) => {
    seVolumeRef.current = volume;
    setSeVolume(volume);
    nativeAudioRuntimeRef.current?.setSeVolume(
      isSeMutedRef.current ? 0 : getBandoriNativeSeGain(volume),
    );
  };

  const toggleBgmMuted = () => {
    const nextMuted = !isBgmMutedRef.current;
    isBgmMutedRef.current = nextMuted;
    setIsBgmMuted(nextMuted);
    nativeAudioRuntimeRef.current?.setBgmVolume(
      nextMuted ? 0 : getBandoriNativeBgmGain(bgmVolumeRef.current),
    );
  };

  const toggleSeMuted = () => {
    const nextMuted = !isSeMutedRef.current;
    isSeMutedRef.current = nextMuted;
    setIsSeMuted(nextMuted);
    nativeAudioRuntimeRef.current?.setSeVolume(
      nextMuted ? 0 : getBandoriNativeSeGain(seVolumeRef.current),
    );
  };

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
    const loopRange = getBandoriChartLoopRange(loopPointsRef.current);
    const scheduledThroughTimeSeconds = Math.min(
      transportRef.current.durationSeconds,
      loopRange?.endTimeSeconds ?? transportRef.current.durationSeconds,
      currentTimeSeconds
        + runtime.getNoteSoundScheduleAheadMediaSeconds(currentPlaybackRate),
    );
    const pendingEvents = collectBandoriNativeNoteSoundEvents(
      timeline,
      noteSoundCursorRef.current,
      scheduledThroughTimeSeconds,
    );
    runtime.dispatch(
      loopRange
        ? pendingEvents.filter((event) => event.timeSeconds < loopRange.endTimeSeconds)
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

  const seekToLoopStart = useCallback((range: BandoriChartLoopRange) => {
    const current = snapshotTransportAtAudioTime();
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

  const setLoopPointAtPresentationTime = useCallback((
    kind: BandoriChartLoopPointKind,
  ) => {
    const current = snapshotTransportAtAudioTime();
    const currentTimeSeconds = getBandoriChartPresentationTime(current);
    const nextPoints = setBandoriChartLoopPoint(
      loopPointsRef.current,
      durationSeconds,
      kind,
      currentTimeSeconds,
    );
    loopPointsRef.current = nextPoints;
    setLoopPoints(nextPoints);

    const range = getBandoriChartLoopRange(nextPoints);
    if (
      range
      && current.phase === "playing"
      && currentTimeSeconds >= range.endTimeSeconds
    ) {
      seekToLoopStart(range);
    }
  }, [durationSeconds, seekToLoopStart, snapshotTransportAtAudioTime]);

  const resetLoopPoints = useCallback(() => {
    const nextPoints = createBandoriChartLoopPoints();
    loopPointsRef.current = nextPoints;
    setLoopPoints(nextPoints);
  }, []);

  const clearLoopPoint = useCallback((kind: BandoriChartLoopPointKind) => {
    const nextPoints = clearBandoriChartLoopPoint(loopPointsRef.current, kind);
    if (nextPoints === loopPointsRef.current) return;
    loopPointsRef.current = nextPoints;
    setLoopPoints(nextPoints);
  }, []);

  const wrapLoopAfterBoundary = useCallback((): boolean => {
    const range = getBandoriChartLoopRange(loopPointsRef.current);
    const presentationTimeSeconds = getStagePresentationTime();
    if (
      !range
      || loopSeekPendingRef.current
      || transportRef.current.phase !== "playing"
      || presentationTimeSeconds < range.endTimeSeconds
    ) {
      return false;
    }
    // Range looping intentionally uses the serialized seek handoff. The old
    // device-queued tail finishes first, then the chart and Note SE restart
    // together at the range start; a short gap is preferable to clock drift.
    seekToLoopStart(range);
    return true;
  }, [getStagePresentationTime, seekToLoopStart]);

  const handleMusicEnded = useCallback(() => {
    if (
      !shouldMediaPlayRef.current
      || transportRef.current.phase !== "playing"
    ) return;
    const range = getBandoriChartLoopRange(loopPointsRef.current);
    if (range) {
      if (!loopSeekPendingRef.current) {
        seekToLoopStart(range);
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
      {
        bgmVolume: isBgmMutedRef.current
          ? 0
          : getBandoriNativeBgmGain(bgmVolumeRef.current),
        seVolume: isSeMutedRef.current
          ? 0
          : getBandoriNativeSeGain(seVolumeRef.current),
      },
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
    const nextLoopPoints = createBandoriChartLoopPoints();
    transportRef.current = next;
    loopPointsRef.current = nextLoopPoints;
    loopSeekPendingRef.current = false;
    loopSeekPromiseRef.current = null;
    isMediaPlaybackReadyRef.current = false;
    shouldMediaPlayRef.current = false;
    pauseAudioInternally();
    effectTimelineVersionRef.current += 1;
    stopAndResetNoteSounds(0, false, true);
    nativeAudioRuntimeRef.current?.stopAll();
    setTransport(next);
    setLoopPoints(nextLoopPoints);
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
  const play = useCallback(async () => {
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
    const current = transportRef.current;
    const loopRange = getBandoriChartLoopRange(loopPointsRef.current);
    const playableTransport = loopRange
      && getBandoriChartPresentationTime(current) >= loopRange.endTimeSeconds
      ? createLoopSeekTransport(current, loopRange.startTimeSeconds, false)
      : current;
    const next = playBandoriChartTransport(playableTransport);
    useMusicPlayerStore.getState().requestPause();
    coordinatorRef.current?.claimPlayback();
    await seekAudioAndTransport(next);
  }, [
    audioUrl,
    isSelectedChartReady,
    musicLoadId,
    musicLoadProgress,
    seekAudioAndTransport,
    soundLoadId,
    soundLoadProgress,
    stageLoadId,
    stageLoadProgress,
  ]);

  const pause = useCallback(() => {
    pauseAudioAndTransport();
  }, [pauseAudioAndTransport]);

  const jump = useCallback((delta: -5 | 5) => {
    const next = jumpBandoriChartTransport(snapshotTransportAtAudioTime(), delta);
    void seekAudioAndTransport(next);
  }, [seekAudioAndTransport, snapshotTransportAtAudioTime]);

  const stepFrame = useCallback((direction: FrameStepDirection) => {
    if (transportRef.current.phase === "scrubbing") return false;
    if (transportRef.current.phase === "playing") pauseAudioAndTransport();
    const next = stepBandoriChartTransport(transportRef.current, direction);
    void seekAudioAndTransport(next);
    return direction === -1
      ? next.currentTimeSeconds > 0
      : next.currentTimeSeconds < next.durationSeconds;
  }, [pauseAudioAndTransport, seekAudioAndTransport]);

  const stopFrameStepHold = useCallback((source?: string) => {
    const activeHold = frameStepHoldRef.current;
    if (!activeHold || (source !== undefined && activeHold.source !== source)) return;
    window.clearTimeout(activeHold.delayTimer);
    if (activeHold.repeatTimer !== null) {
      window.clearInterval(activeHold.repeatTimer);
    }
    frameStepHoldRef.current = null;
  }, []);

  const startFrameStepHold = useCallback((
    direction: FrameStepDirection,
    source: string,
  ) => {
    stopFrameStepHold();
    if (!stepFrame(direction)) return;
    const activeHold: ActiveFrameStepHold = {
      source,
      delayTimer: 0,
      repeatTimer: null,
    };
    frameStepHoldRef.current = activeHold;
    activeHold.delayTimer = window.setTimeout(() => {
      if (frameStepHoldRef.current !== activeHold) return;
      if (!stepFrame(direction)) {
        stopFrameStepHold(source);
        return;
      }
      activeHold.repeatTimer = window.setInterval(
        () => {
          if (!stepFrame(direction)) stopFrameStepHold(source);
        },
        FRAME_STEP_REPEAT_INTERVAL_MS,
      );
    }, FRAME_STEP_HOLD_DELAY_MS);
  }, [stepFrame, stopFrameStepHold]);

  const stopLoopPointClearHold = useCallback((source?: string) => {
    const activeHold = loopPointClearHoldRef.current;
    if (!activeHold || (source !== undefined && activeHold.source !== source)) return;
    window.clearTimeout(activeHold.delayTimer);
    loopPointClearHoldRef.current = null;
  }, []);

  const startLoopPointClearHold = useCallback((
    kind: BandoriChartLoopPointKind,
    source: string,
  ) => {
    stopLoopPointClearHold();
    suppressedLoopPointClickRef.current = null;
    const activeHold: ActiveLoopPointClearHold = {
      delayTimer: 0,
      didClear: false,
      kind,
      source,
    };
    loopPointClearHoldRef.current = activeHold;
    activeHold.delayTimer = window.setTimeout(() => {
      if (loopPointClearHoldRef.current !== activeHold) return;
      activeHold.didClear = true;
      suppressedLoopPointClickRef.current = kind;
      clearLoopPoint(kind);
    }, LOOP_POINT_CLEAR_HOLD_DELAY_MS);
  }, [clearLoopPoint, stopLoopPointClearHold]);

  const togglePlayback = useCallback(() => {
    if (transportRef.current.phase === "playing") {
      pause();
      return;
    }
    void play();
  }, [pause, play]);

  const handleSimulatorShortcutKeyDown = useCallback((
    event: KeyboardEvent,
    allowInputTarget = false,
  ): boolean => {
    if (
      event.defaultPrevented
      || event.isComposing
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || (!allowInputTarget && isSimulatorShortcutInput(event.target))
    ) return false;

    if (event.shiftKey) {
      if (event.code !== "BracketLeft" && event.code !== "BracketRight") {
        return false;
      }
      event.preventDefault();
      if (!event.repeat) {
        clearLoopPoint(event.code === "BracketLeft" ? "start" : "end");
      }
      return true;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      if (!event.repeat) jump(event.key === "ArrowLeft" ? -5 : 5);
      return true;
    }

    if (event.code === "KeyD" || event.code === "KeyF") {
      event.preventDefault();
      if (!event.repeat) {
        startFrameStepHold(
          event.code === "KeyD" ? -1 : 1,
          `keyboard:${event.code}`,
        );
      }
      return true;
    }

    if (event.code === "BracketLeft" || event.code === "BracketRight") {
      event.preventDefault();
      if (!event.repeat) {
        setLoopPointAtPresentationTime(
          event.code === "BracketLeft" ? "start" : "end",
        );
      }
      return true;
    }

    if (event.code === "KeyR") {
      event.preventDefault();
      if (!event.repeat) resetLoopPoints();
      return true;
    }

    if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat) togglePlayback();
      return true;
    }

    return false;
  }, [
    clearLoopPoint,
    jump,
    resetLoopPoints,
    setLoopPointAtPresentationTime,
    startFrameStepHold,
    togglePlayback,
  ]);

  const handleTimelineKeyDown = useCallback((
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => {
    if (handleSimulatorShortcutKeyDown(event.nativeEvent, true)) return;
    if (NATIVE_RANGE_NAVIGATION_KEYS.has(event.key)) event.preventDefault();
  }, [handleSimulatorShortcutKeyDown]);

  useEffect(() => {
    if (!isActive) {
      stopFrameStepHold();
      stopLoopPointClearHold();
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      handleSimulatorShortcutKeyDown(event);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "KeyD" || event.code === "KeyF") {
        stopFrameStepHold(`keyboard:${event.code}`);
      }
    };

    const stopActiveHold = () => {
      stopFrameStepHold();
      stopLoopPointClearHold();
    };
    const stopHiddenHold = () => {
      if (document.visibilityState !== "visible") stopActiveHold();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", stopActiveHold);
    document.addEventListener("visibilitychange", stopHiddenHold);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", stopActiveHold);
      document.removeEventListener("visibilitychange", stopHiddenHold);
      stopFrameStepHold();
      stopLoopPointClearHold();
    };
  }, [
    handleSimulatorShortcutKeyDown,
    isActive,
    stopFrameStepHold,
    stopLoopPointClearHold,
  ]);

  const startFrameStepPointerHold = (
    event: ReactPointerEvent<HTMLButtonElement>,
    direction: FrameStepDirection,
  ) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    startFrameStepHold(direction, `pointer:${event.pointerId}`);
  };

  const stopFrameStepPointerHold = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    stopFrameStepHold(`pointer:${event.pointerId}`);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const startLoopPointClearPointerHold = (
    event: ReactPointerEvent<HTMLButtonElement>,
    kind: BandoriChartLoopPointKind,
  ) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    startLoopPointClearHold(kind, `pointer:${event.pointerId}`);
  };

  const stopLoopPointClearPointerHold = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    stopLoopPointClearHold(`pointer:${event.pointerId}`);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const cancelLoopPointClearPointerHold = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const activeHold = loopPointClearHoldRef.current;
    const didClear = activeHold?.source === `pointer:${event.pointerId}`
      && activeHold.didClear;
    stopLoopPointClearPointerHold(event);
    if (didClear) suppressedLoopPointClickRef.current = null;
  };

  const handleLoopPointClick = (kind: BandoriChartLoopPointKind) => {
    if (suppressedLoopPointClickRef.current === kind) {
      suppressedLoopPointClickRef.current = null;
      return;
    }
    setLoopPointAtPresentationTime(kind);
  };

  const handleLoopPointContextMenu = (
    event: ReactMouseEvent<HTMLButtonElement>,
    kind: BandoriChartLoopPointKind,
  ) => {
    event.preventDefault();
    stopLoopPointClearHold();
    clearLoopPoint(kind);
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
    if (tab === "fullChart" && !IS_FULL_CHART_VIEW_ENABLED) return;
    if (tab === "fullChart") setHasOpenedFullChart(true);
    setActiveTab(tab);
  };

  const enterStageFullscreen = useCallback(async () => {
    const fullscreenRoot = fullscreenRootRef.current;
    if (
      !fullscreenRoot
      || !document.fullscreenEnabled
      || document.fullscreenElement !== null
    ) return;
    try {
      await fullscreenRoot.requestFullscreen({ navigationUI: "hide" });
    } catch {
      return;
    }
    if (document.fullscreenElement !== fullscreenRoot) return;
    const orientation = window.screen.orientation as ScreenOrientation & {
      lock?: (orientation: "landscape") => Promise<void>;
    };
    if (typeof orientation.lock !== "function") return;
    try {
      await orientation.lock("landscape");
    } catch {
      // Orientation locking is a preference: keep fullscreen in the user's
      // current orientation when the browser or operating system rejects it.
    }
  }, []);

  const exitStageFullscreen = useCallback(async () => {
    if (document.fullscreenElement !== fullscreenRootRef.current) return;
    try {
      await document.exitFullscreen();
    } catch {
      // The browser may already be completing an Escape-initiated exit.
    }
  }, []);

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
  const loopStartPercentage = loopPoints.startTimeSeconds === null
    ? null
    : getTimelinePercentage(loopPoints.startTimeSeconds, durationSeconds);
  const loopEndPercentage = loopPoints.endTimeSeconds === null
    ? null
    : getTimelinePercentage(loopPoints.endTimeSeconds, durationSeconds);
  const stageRenderFpsText = stageRenderFps === null
    ? "—"
    : String(stageRenderFps);
  const stageRenderFpsAriaLabel = t("controls.renderFps", {
    fps: stageRenderFpsText,
  });
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
              disabled={tab === "fullChart" && !IS_FULL_CHART_VIEW_ENABLED}
              onClick={() => changeTab(tab)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold outline-hidden transition focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] disabled:cursor-not-allowed disabled:text-[var(--theme-color-control-foreground-disabled)] disabled:opacity-60 ${activeTab === tab ? "bg-[var(--theme-color-selection-subtle-background)] text-[var(--theme-color-selection-subtle-foreground)] shadow-sm ring-1 ring-inset ring-[var(--theme-color-selection-subtle-ring)]" : "text-[var(--theme-color-text-muted)] enabled:hover:bg-[var(--theme-color-control-background-hover)] enabled:hover:text-[var(--theme-color-text-default)]"}`}
            >
              {t(`tabs.${tab}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex max-w-full items-center gap-2">
        <div
          aria-label={songsT("difficultyLabel")}
          className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1"
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
        <button
          type="button"
          aria-label={t("controls.enterFullscreen")}
          title={t("controls.enterFullscreen")}
          className={cn(
            MUSIC_PLAYER_SEEK_BUTTON_CLASS_NAME,
            "border border-[var(--theme-color-action-secondary-border)] bg-[var(--theme-color-action-secondary-background)] text-[var(--theme-color-action-secondary-foreground)] hover:bg-[var(--theme-color-action-secondary-background-hover)] disabled:cursor-not-allowed disabled:border-[var(--theme-color-control-border-disabled)] disabled:bg-[var(--theme-color-control-background-disabled)] disabled:text-[var(--theme-color-control-foreground-disabled)] disabled:hover:bg-[var(--theme-color-control-background-disabled)]",
          )}
          disabled={!isFullscreenSupported || activeTab !== "stage"}
          onClick={() => void enterStageFullscreen()}
        >
          <Maximize className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-5">
        <div
          ref={fullscreenRootRef}
          data-chart-simulator-fullscreen-root
          className={cn(
            "relative",
            isStageFullscreen
              ? "flex h-full w-full items-center justify-center overflow-hidden bg-black"
              : null,
          )}
          aria-busy={simulatorLoadingLabel !== null}
          hidden={activeTab !== "stage"}
        >
          <div
            className={cn(
              "relative w-full",
              isStageFullscreen
                ? "shrink-0 [&_[role=img]]:rounded-none [&_[role=img]]:ring-0"
                : null,
            )}
            style={isStageFullscreen ? {
              aspectRatio: `${BANDORI_NATIVE_STAGE_SIZE.width} / ${BANDORI_NATIVE_STAGE_SIZE.height}`,
              height: `min(100dvh, ${FULLSCREEN_STAGE_HEIGHT_DVW}dvw)`,
              width: `min(100vw, ${FULLSCREEN_STAGE_WIDTH_DVH}dvh)`,
            } : undefined}
          >
            <NativeSimulatorStage
              key={stageLoadId}
              ariaLabel={t("stageAria")}
              backgroundSkin={effectiveBackgroundSkin}
              compiled={displayedChart.compiled}
              directionalEffectEnabled={isDirectionalEffectEnabled}
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
              onRenderFpsChange={setStageRenderFps}
              rendererErrorLabel={t("rendererUnavailable")}
              resourceErrorLabel={t("stageResourceUnavailable")}
              resolveAssetUrl={assetLoadState.resolveAssetUrl}
              rhythmSupportEnabled={isRhythmSupportEnabled}
              syncLineEnabled={isSyncLineEnabled}
              suddenLaneEnabled={isSuddenLaneEnabled}
              suddenRate={suddenRate}
              tapEffectContract={effectiveTapEffectContract}
              tapEffectEnabled={isTapEffectEnabled}
            />
            {chartLoadingError || audioLoadingError ? (
              <div
                className={cn(
                  "absolute inset-x-0 top-0 z-20 flex items-center justify-center bg-[color-mix(in_srgb,var(--theme-color-surface-background)_94%,transparent)] p-6 text-center backdrop-blur-sm",
                  isStageFullscreen ? null : "rounded-2xl",
                )}
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
                className={cn(
                  "pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-center bg-[color-mix(in_srgb,var(--theme-color-surface-background)_90%,transparent)] p-6 backdrop-blur-sm",
                  isStageFullscreen ? null : "rounded-2xl",
                )}
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
            {isStageFullscreen ? (
              <div
                data-chart-simulator-fullscreen-controls
                className="pointer-events-none absolute inset-0 z-30 select-none portrait:fixed portrait:grid portrait:grid-cols-1"
                style={{
                  gridTemplateRows: `minmax(0, 1fr) min(100dvh, ${FULLSCREEN_STAGE_HEIGHT_DVW}dvw) minmax(0, 1fr)`,
                }}
              >
                <div className="absolute left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] flex flex-col items-start gap-1.5 portrait:static portrait:col-start-1 portrait:row-start-1 portrait:mb-3 portrait:ml-[max(0.75rem,env(safe-area-inset-left))] portrait:self-end portrait:justify-self-start">
                  <div
                    role="group"
                    aria-label={t("loopControls.ariaLabel")}
                    className="pointer-events-auto flex items-center gap-1"
                  >
                  <button
                    type="button"
                    aria-label={t("loopControls.setStart")}
                    aria-keyshortcuts="[ Shift+["
                    aria-pressed={loopPoints.startTimeSeconds !== null}
                    title={t("controls.shortcutHint", {
                      action: t("loopControls.setStart"),
                      shortcut: "[",
                    })}
                    className={cn(
                      FULLSCREEN_OVERLAY_BUTTON_CLASS_NAME,
                      "text-sm font-black",
                      loopPoints.startTimeSeconds !== null
                        ? FULLSCREEN_OVERLAY_ACTIVE_BUTTON_CLASS_NAME
                        : null,
                    )}
                    onPointerDown={(event) => startLoopPointClearPointerHold(event, "start")}
                    onPointerUp={stopLoopPointClearPointerHold}
                    onPointerCancel={cancelLoopPointClearPointerHold}
                    onPointerLeave={cancelLoopPointClearPointerHold}
                    onLostPointerCapture={(event) => stopLoopPointClearHold(`pointer:${event.pointerId}`)}
                    onContextMenu={(event) => handleLoopPointContextMenu(event, "start")}
                    onClick={() => handleLoopPointClick("start")}
                  >
                    A
                  </button>
                  <button
                    type="button"
                    aria-label={t("loopControls.setEnd")}
                    aria-keyshortcuts="] Shift+]"
                    aria-pressed={loopPoints.endTimeSeconds !== null}
                    title={t("controls.shortcutHint", {
                      action: t("loopControls.setEnd"),
                      shortcut: "]",
                    })}
                    className={cn(
                      FULLSCREEN_OVERLAY_BUTTON_CLASS_NAME,
                      "text-sm font-black",
                      loopPoints.endTimeSeconds !== null
                        ? FULLSCREEN_OVERLAY_ACTIVE_BUTTON_CLASS_NAME
                        : null,
                    )}
                    onPointerDown={(event) => startLoopPointClearPointerHold(event, "end")}
                    onPointerUp={stopLoopPointClearPointerHold}
                    onPointerCancel={cancelLoopPointClearPointerHold}
                    onPointerLeave={cancelLoopPointClearPointerHold}
                    onLostPointerCapture={(event) => stopLoopPointClearHold(`pointer:${event.pointerId}`)}
                    onContextMenu={(event) => handleLoopPointContextMenu(event, "end")}
                    onClick={() => handleLoopPointClick("end")}
                  >
                    B
                  </button>
                  <button
                    type="button"
                    aria-label={t("loopControls.reset")}
                    aria-keyshortcuts="r"
                    title={t("controls.shortcutHint", {
                      action: t("loopControls.reset"),
                      shortcut: "R",
                    })}
                    className={FULLSCREEN_OVERLAY_BUTTON_CLASS_NAME}
                    disabled={
                      loopPoints.startTimeSeconds === null
                      && loopPoints.endTimeSeconds === null
                    }
                    onClick={resetLoopPoints}
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  </button>
                  </div>
                  <output
                    aria-label={stageRenderFpsAriaLabel}
                    title={stageRenderFpsAriaLabel}
                    className="inline-flex min-w-[7ch] justify-center rounded-xl bg-slate-950/65 px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums text-white shadow-lg backdrop-blur-sm"
                  >
                    {stageRenderFpsText} FPS
                  </output>
                </div>

                <div className="absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] flex flex-col items-end gap-1.5 portrait:static portrait:col-start-1 portrait:row-start-1 portrait:mb-3 portrait:mr-[max(0.75rem,env(safe-area-inset-right))] portrait:self-end portrait:justify-self-end">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={t(isPlaying ? "controls.pause" : "controls.play")}
                      aria-keyshortcuts="Space"
                      title={t("controls.shortcutHint", {
                        action: t(isPlaying ? "controls.pause" : "controls.play"),
                        shortcut: t("controls.spaceKey"),
                      })}
                      className={FULLSCREEN_OVERLAY_BUTTON_CLASS_NAME}
                      disabled={!audioUrl || (!isPlaying && !isSimulatorReady)}
                      onClick={isPlaying ? pause : () => void play()}
                    >
                      {isPlaying ? (
                        <Pause className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <Play className="ml-0.5 h-5 w-5" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label={t("controls.exitFullscreen")}
                      aria-keyshortcuts="Escape"
                      title={t("controls.exitFullscreen")}
                      className={FULLSCREEN_OVERLAY_BUTTON_CLASS_NAME}
                      onClick={() => void exitStageFullscreen()}
                    >
                      <Minimize className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>
                  <output
                    aria-label={`${formatPlaybackTime(presentationTime)} / ${formatPlaybackTime(durationSeconds)}`}
                    className="grid grid-cols-[9ch_auto_9ch] items-center gap-1 rounded-xl bg-slate-950/65 px-2.5 py-1.5 font-mono text-xs font-black tabular-nums text-white shadow-lg backdrop-blur-sm portrait:px-2 portrait:text-[10px] sm:text-sm"
                  >
                    <span className="text-right">
                      {formatPlaybackTime(presentationTime)}
                    </span>
                    <span>/</span>
                    <span className="text-left">
                      {formatPlaybackTime(durationSeconds)}
                    </span>
                  </output>
                </div>

                <div
                  data-chart-simulator-fullscreen-backward-controls
                  className="absolute left-[max(0.75rem,env(safe-area-inset-left))] top-[42%] flex -translate-y-1/2 flex-col gap-1.5 portrait:static portrait:col-start-1 portrait:row-start-3 portrait:mt-3 portrait:ml-[max(0.75rem,env(safe-area-inset-left))] portrait:translate-y-0 portrait:self-start portrait:justify-self-start"
                >
                  <button
                    type="button"
                    aria-label={t("controls.backOneFrame")}
                    aria-keyshortcuts="d"
                    title={t("controls.shortcutHint", {
                      action: t("controls.backOneFrame"),
                      shortcut: "D",
                    })}
                    className={cn(
                      FULLSCREEN_OVERLAY_BUTTON_CLASS_NAME,
                      "touch-manipulation",
                    )}
                    onPointerDown={(event) => startFrameStepPointerHold(event, -1)}
                    onPointerUp={stopFrameStepPointerHold}
                    onPointerCancel={stopFrameStepPointerHold}
                    onPointerLeave={stopFrameStepPointerHold}
                    onLostPointerCapture={(event) => stopFrameStepHold(`pointer:${event.pointerId}`)}
                    onContextMenu={(event) => event.preventDefault()}
                    onClick={(event) => {
                      if (event.detail === 0) stepFrame(-1);
                    }}
                  >
                    <StepBack className="h-[18px] w-[18px]" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("controls.backFive")}
                    aria-keyshortcuts="ArrowLeft"
                    title={t("controls.shortcutHint", {
                      action: t("controls.backFive"),
                      shortcut: "←",
                    })}
                    className={FULLSCREEN_OVERLAY_BUTTON_CLASS_NAME}
                    onClick={() => jump(-5)}
                  >
                    <Rewind className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>

                <div
                  data-chart-simulator-fullscreen-forward-controls
                  className="absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[42%] flex -translate-y-1/2 flex-col gap-1.5 portrait:static portrait:col-start-1 portrait:row-start-3 portrait:mt-3 portrait:mr-[max(0.75rem,env(safe-area-inset-right))] portrait:translate-y-0 portrait:self-start portrait:justify-self-end"
                >
                  <button
                    type="button"
                    aria-label={t("controls.forwardOneFrame")}
                    aria-keyshortcuts="f"
                    title={t("controls.shortcutHint", {
                      action: t("controls.forwardOneFrame"),
                      shortcut: "F",
                    })}
                    className={cn(
                      FULLSCREEN_OVERLAY_BUTTON_CLASS_NAME,
                      "touch-manipulation",
                    )}
                    onPointerDown={(event) => startFrameStepPointerHold(event, 1)}
                    onPointerUp={stopFrameStepPointerHold}
                    onPointerCancel={stopFrameStepPointerHold}
                    onPointerLeave={stopFrameStepPointerHold}
                    onLostPointerCapture={(event) => stopFrameStepHold(`pointer:${event.pointerId}`)}
                    onContextMenu={(event) => event.preventDefault()}
                    onClick={(event) => {
                      if (event.detail === 0) stepFrame(1);
                    }}
                  >
                    <StepForward className="h-[18px] w-[18px]" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("controls.forwardFive")}
                    aria-keyshortcuts="ArrowRight"
                    title={t("controls.shortcutHint", {
                      action: t("controls.forwardFive"),
                      shortcut: "→",
                    })}
                    className={FULLSCREEN_OVERLAY_BUTTON_CLASS_NAME}
                    onClick={() => jump(5)}
                  >
                    <FastForward className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
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
        <div className="relative h-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-visible rounded-full bg-[var(--theme-color-control-background-disabled)]"
          >
            {/* The native 16px range thumb travels between centers inset 8px
                from each edge. Keep every time-based overlay on that axis. */}
            <div className="absolute inset-y-0 left-2 right-2">
              {loopStartPercentage !== null && loopEndPercentage !== null ? (
                <span
                  className="absolute inset-y-0 rounded-full bg-[color-mix(in_srgb,var(--theme-color-semantic-info-foreground)_18%,transparent)]"
                  style={{
                    left: `${loopStartPercentage}%`,
                    width: `${Math.max(0, loopEndPercentage - loopStartPercentage)}%`,
                  }}
                />
              ) : null}
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-[var(--theme-color-progress-indicator-background)]"
                style={{ width: `${playbackPercentage}%` }}
              />
              {loopStartPercentage !== null ? (
                <span
                  className="absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--theme-color-semantic-info-foreground)] ring-2 ring-[var(--theme-color-surface-background)]"
                  style={{ left: `${loopStartPercentage}%` }}
                />
              ) : null}
              {loopEndPercentage !== null ? (
                <span
                  className="absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--theme-color-semantic-info-foreground)] ring-2 ring-[var(--theme-color-surface-background)]"
                  style={{ left: `${loopEndPercentage}%` }}
                />
              ) : null}
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={durationSeconds}
            step={0.001}
            value={presentationTime}
            aria-label={t("controls.timeline")}
            aria-keyshortcuts="ArrowLeft ArrowRight d f [ ] Shift+[ Shift+] Space r"
            onPointerDown={beginScrub}
            onKeyDown={handleTimelineKeyDown}
            onChange={(event) => previewScrub(Number(event.currentTarget.value))}
            onPointerUp={commitScrub}
            onBlur={commitScrub}
            className="absolute inset-0 z-10 h-8 w-full cursor-pointer appearance-none rounded-full bg-transparent outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[var(--theme-color-semantic-info-foreground)] [&::-moz-range-thumb]:shadow-md [&::-moz-range-track]:h-2 [&::-moz-range-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[var(--theme-color-semantic-info-foreground)] [&::-webkit-slider-thumb]:shadow-md"
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <output
              aria-live="polite"
              className="grid shrink-0 grid-cols-[9ch_auto_9ch] items-center gap-1 whitespace-nowrap font-mono text-sm font-black tabular-nums text-[var(--theme-color-text-default)]"
            >
              <span className="text-right">
                {formatPlaybackTime(presentationTime)}
              </span>
              <span>/</span>
              <span className="text-left">
                {formatPlaybackTime(durationSeconds)}
              </span>
            </output>
            <output
              aria-label={stageRenderFpsAriaLabel}
              title={stageRenderFpsAriaLabel}
              className="inline-flex w-[7ch] shrink-0 justify-end whitespace-nowrap font-mono text-sm font-bold tabular-nums text-[var(--theme-color-text-muted)]"
            >
              {stageRenderFpsText} FPS
            </output>
            <div
              role="group"
              aria-label={t("loopControls.ariaLabel")}
              className="flex items-center gap-0"
            >
            <button
              type="button"
              aria-label={t("loopControls.setStart")}
              aria-keyshortcuts="[ Shift+["
              aria-pressed={loopPoints.startTimeSeconds !== null}
              title={t("controls.shortcutHint", {
                action: t("loopControls.setStart"),
                shortcut: "[",
              })}
              className={cn(
                MUSIC_PLAYER_SEEK_BUTTON_CLASS_NAME,
                "touch-manipulation select-none text-sm font-black",
                loopPoints.startTimeSeconds !== null
                  ? "bg-[var(--theme-color-selection-subtle-background)] text-[var(--theme-color-selection-subtle-foreground)]"
                  : null,
              )}
              onPointerDown={(event) => startLoopPointClearPointerHold(event, "start")}
              onPointerUp={stopLoopPointClearPointerHold}
              onPointerCancel={cancelLoopPointClearPointerHold}
              onPointerLeave={cancelLoopPointClearPointerHold}
              onLostPointerCapture={(event) => stopLoopPointClearHold(`pointer:${event.pointerId}`)}
              onContextMenu={(event) => handleLoopPointContextMenu(event, "start")}
              onClick={() => handleLoopPointClick("start")}
            >
              A
            </button>
            <button
              type="button"
              aria-label={t("loopControls.setEnd")}
              aria-keyshortcuts="] Shift+]"
              aria-pressed={loopPoints.endTimeSeconds !== null}
              title={t("controls.shortcutHint", {
                action: t("loopControls.setEnd"),
                shortcut: "]",
              })}
              className={cn(
                MUSIC_PLAYER_SEEK_BUTTON_CLASS_NAME,
                "touch-manipulation select-none text-sm font-black",
                loopPoints.endTimeSeconds !== null
                  ? "bg-[var(--theme-color-selection-subtle-background)] text-[var(--theme-color-selection-subtle-foreground)]"
                  : null,
              )}
              onPointerDown={(event) => startLoopPointClearPointerHold(event, "end")}
              onPointerUp={stopLoopPointClearPointerHold}
              onPointerCancel={cancelLoopPointClearPointerHold}
              onPointerLeave={cancelLoopPointClearPointerHold}
              onLostPointerCapture={(event) => stopLoopPointClearHold(`pointer:${event.pointerId}`)}
              onContextMenu={(event) => handleLoopPointContextMenu(event, "end")}
              onClick={() => handleLoopPointClick("end")}
            >
              B
            </button>
            <button
              type="button"
              aria-label={t("loopControls.reset")}
              aria-keyshortcuts="r"
              title={t("controls.shortcutHint", {
                action: t("loopControls.reset"),
                shortcut: "R",
              })}
              className={cn(
                MUSIC_PLAYER_SEEK_BUTTON_CLASS_NAME,
                "disabled:cursor-not-allowed disabled:text-[var(--theme-color-control-foreground-disabled)] disabled:hover:bg-transparent",
              )}
              disabled={
                loopPoints.startTimeSeconds === null
                && loopPoints.endTimeSeconds === null
              }
              onClick={resetLoopPoints}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1.5 sm:col-start-2 sm:row-start-1">
          <button
            type="button"
            aria-label={t("controls.backFive")}
            aria-keyshortcuts="ArrowLeft"
            title={t("controls.shortcutHint", {
              action: t("controls.backFive"),
              shortcut: "←",
            })}
            className={MUSIC_PLAYER_SEEK_BUTTON_CLASS_NAME}
            onClick={() => jump(-5)}
          >
            <Rewind className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t("controls.backOneFrame")}
            aria-keyshortcuts="d"
            title={t("controls.shortcutHint", {
              action: t("controls.backOneFrame"),
              shortcut: "D",
            })}
            className={`${MUSIC_PLAYER_SEEK_BUTTON_CLASS_NAME} touch-manipulation select-none`}
            onPointerDown={(event) => startFrameStepPointerHold(event, -1)}
            onPointerUp={stopFrameStepPointerHold}
            onPointerCancel={stopFrameStepPointerHold}
            onPointerLeave={stopFrameStepPointerHold}
            onLostPointerCapture={(event) => stopFrameStepHold(`pointer:${event.pointerId}`)}
            onContextMenu={(event) => event.preventDefault()}
            onClick={(event) => {
              if (event.detail === 0) stepFrame(-1);
            }}
          >
            <StepBack className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t(isPlaying ? "controls.pause" : "controls.play")}
            aria-keyshortcuts="Space"
            title={t("controls.shortcutHint", {
              action: t(isPlaying ? "controls.pause" : "controls.play"),
              shortcut: t("controls.spaceKey"),
            })}
            className={MUSIC_PLAYER_PLAYBACK_BUTTON_CLASS_NAME}
            disabled={!audioUrl || (!isPlaying && !isSimulatorReady)}
            onClick={isPlaying ? pause : () => void play()}
          >
            {isPlaying ? <Pause className="h-5 w-5" aria-hidden="true" /> : <Play className="ml-0.5 h-5 w-5" aria-hidden="true" />}
          </button>
          <button
            type="button"
            aria-label={t("controls.forwardOneFrame")}
            aria-keyshortcuts="f"
            title={t("controls.shortcutHint", {
              action: t("controls.forwardOneFrame"),
              shortcut: "F",
            })}
            className={`${MUSIC_PLAYER_SEEK_BUTTON_CLASS_NAME} touch-manipulation select-none`}
            onPointerDown={(event) => startFrameStepPointerHold(event, 1)}
            onPointerUp={stopFrameStepPointerHold}
            onPointerCancel={stopFrameStepPointerHold}
            onPointerLeave={stopFrameStepPointerHold}
            onLostPointerCapture={(event) => stopFrameStepHold(`pointer:${event.pointerId}`)}
            onContextMenu={(event) => event.preventDefault()}
            onClick={(event) => {
              if (event.detail === 0) stepFrame(1);
            }}
          >
            <StepForward className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={t("controls.forwardFive")}
            aria-keyshortcuts="ArrowRight"
            title={t("controls.shortcutHint", {
              action: t("controls.forwardFive"),
              shortcut: "→",
            })}
            className={MUSIC_PLAYER_SEEK_BUTTON_CLASS_NAME}
            onClick={() => jump(5)}
          >
            <FastForward className="h-5 w-5" aria-hidden="true" />
          </button>
          </div>
          <div className="grid justify-center gap-y-1 sm:col-start-3 sm:row-start-1 sm:justify-self-end lg:grid-cols-2 lg:gap-x-6">
            <SimulatorVolumeControl
              inputId="bandori-simulator-bgm-volume"
              isMuted={isBgmMuted}
              label={t("controls.bgmVolume")}
              muteLabel={playerT("mute")}
              onChange={changeBgmVolume}
              onMuteToggle={toggleBgmMuted}
              unmuteLabel={playerT("unmute")}
              value={bgmVolume}
            />
            <SimulatorVolumeControl
              inputId="bandori-simulator-se-volume"
              isMuted={isSeMuted}
              label={t("controls.seVolume")}
              muteLabel={playerT("mute")}
              onChange={changeSeVolume}
              onMuteToggle={toggleSeMuted}
              unmuteLabel={playerT("unmute")}
              value={seVolume}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <SimulatorSettingsCard title={t("effectControlsTitle")}>
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
            </SimulatorControlRow>

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

        </SimulatorSettingsCard>

        <SimulatorSkinControls
          backgroundSkin={backgroundSkin}
          backgroundSkins={BANDORI_NATIVE_BACKGROUND_SKINS}
          directionalFlickSkin={directionalFlickSkin}
          directionalEffectVariant={directionalEffectVariant}
          fieldSkin={fieldSkin}
          fieldSkins={BANDORI_NATIVE_FIELD_SKIN_CHOICES}
          limitedPerformanceSkin={limitedPerformanceSkin}
          noteSkin={noteSkin}
          onBackgroundSkinChange={setBackgroundSkin}
          onDirectionalFlickSkinChange={setDirectionalFlickSkin}
          onDirectionalEffectVariantChange={setDirectionalEffectVariant}
          onFieldSkinChange={setFieldSkin}
          onLimitedPerformanceSkinChange={changeLimitedPerformanceSkin}
          onNoteSkinChange={setNoteSkin}
          onTapEffectSkinChange={setTapEffectSkin}
          onTapSeSkinChange={changeTapSeSkin}
          tapEffectSkin={tapEffectSkin}
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
