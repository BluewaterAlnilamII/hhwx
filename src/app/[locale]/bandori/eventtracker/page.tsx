"use client";

import { startTransition, useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from "react";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import * as Tabs from "@radix-ui/react-tabs";

import { useBandoriEventsAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import { useBandoriMusicMaster } from "@/hooks/useBandoriMusicMaster";
import { pickBandoriRegionalText } from "@/lib/bandori-server";
import { useBandoriPreferredServer } from "@/store/useBandoriPreferencesStore";
import {
  buildBandoriPublicAssetUrl,
  lookupBandoriEventBanner,
} from "@/lib/bandori-public-asset-index";
import { resolveBandoriEventAssetRegion } from "@/lib/bandori-event-region";
import type { ComparisonConfig, ComparisonLine, ComparisonLinePoint, ComparisonTargetType, MinimalEvent, TrackerData, TrackerMouseState, TrackerTooltipPayloadEntry, TrackingMode } from "./types";
import {
  BESTDORI_PREDICTION_STORAGE_KEY,
  EVENT_TIERS,
  getTiersForMode,
  INSTANT_PROJECTION_STORAGE_KEY,
  DAY_PROJECTION_STORAGE_KEY,
  MAX_COMPARISON_LINES,
  MONTHLY_TIERS,
} from "./constants";
import { useTrackerData } from "./useTrackerData";
import {
  useChartDomain,
  useProcessedData,
  useEventStatus,
  useFinalDisplayedData,
  generateYTicks,
  getScoreAtTime,
  getFinalScore,
  getCurrentMonthlyRankingWindow,
  getMonthlyRankingOptions,
} from "./useChartData";
import { useProjectionPreference } from "./useProjectionPreference";
import { useComparisonPreferences } from "./useComparisonPreferences";
import { getDefaultTierForMode, normalizeTierForMode, readTrackerTierPreference, writeTrackerTierPreference } from "./tracker-tier-preference";
import {
  parseTrackingModeSearchParam,
  readEventTrackerSearchParams,
  readPositiveIntegerSearchParam,
  replaceEventTrackerUrlQuery,
} from "./urlQuery";
import { mergeComparisonLines, useComparisonTrackerData } from "./useComparisonTrackerData";
import { mergeBestdoriPredictionData, useBestdoriPrediction } from "./useBestdoriPrediction";
import { buildTooltipSignature, type HoverTooltipState } from "./useTrackerHoverTooltip";
import { ComparisonControls } from "./ComparisonControls";
import { TrackerChartPanel } from "./TrackerChartPanel";
import { TrackerModeTierControls } from "./TrackerModeTierControls";
import { TrackerStatusSummary } from "./TrackerStatusSummary";
import BandoriPageShell from "../BandoriPageShell";
import BandoriCnExclusiveNotice from "../BandoriCnExclusiveNotice";
import BandoriEventSwitcher from "../BandoriEventSwitcher";
import EventComments from "./EventComments";
import {
  buildChinaMainlandHolidayLookup,
  isChinaMainlandRestDay,
} from "@/lib/bandori-china-mainland-holiday-calendar";

type NonWorkingDayBand = {
  key: string;
  start: number;
  end: number;
};

type ComparisonTargetOption = {
  id: number;
  label: string;
  isSameEventType?: boolean;
};

type AutomaticComparisonTarget = {
  targetId: number;
  tier: number;
};

const ZOOM_WIDTH_MULTIPLIERS = [1, 2, 4, 8, 16, 32] as const;
// Absorb collection-time jitter without merging adjacent 15/30-minute tracker snapshots.
const TOOLTIP_TIME_TOLERANCE_MS = 5 * 60_000;
const EVENT_TIER_1000 = 1000;
const EVENT_TIER_1500 = 1500;
const CN_T1500_BACKFILL_EVENT_ID = 311;
const CN_T1500_LEGACY_EVENT_ID_LIMIT = 313;
const EVENT_TYPES_WITHOUT_SONG_RANKING = new Set(["story", "mission_live", "live_try", "festival"]);

type ModeIndicatorStyle = {
  width: number;
  height: number;
  x: number;
  y: number;
  ready: boolean;
};

type MainTooltipPointIndexEntry = {
  time: number;
  point: TrackerData;
};

type ComparisonTooltipPointIndexEntry = {
  dataKey: `compare_${number}_ep`;
  points: ComparisonLinePoint[];
};

function isActualTrackerPoint(
  point: TrackerData,
  domainStart: number | "auto",
  trackingMode: TrackingMode,
  seriesLength: number,
): boolean {
  if (point.isBaseline) {
    return false;
  }

  if (
    seriesLength === 1 &&
    trackingMode !== "song" &&
    typeof domainStart === "number" &&
    point.time === domainStart &&
    point.ep === 0 &&
    !point.isFinal
  ) {
    return false;
  }

  return true;
}

function getTooltipPointTime(point: TrackerData): number {
  return point.isProjection ? point.projectionEndTime ?? point.time : point.time;
}

function isMainTooltipPoint(point: TrackerData): boolean {
  if (point.isProjection) {
    return (
      (point.instantEp !== undefined && Number.isFinite(point.instantEp)) ||
      (point.dayEp !== undefined && Number.isFinite(point.dayEp))
    );
  }

  return (
    !point.isBaseline &&
    !point.isFinal &&
    point.ep !== undefined &&
    Number.isFinite(point.ep)
  );
}

function findNearestSortedPoint<T>(
  points: T[],
  targetTime: number,
  getTime: (point: T) => number,
): T | null {
  if (points.length === 0) return null;

  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (getTime(points[mid]) < targetTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const candidates = [points[low]];
  if (low > 0) candidates.push(points[low - 1]);
  if (low + 1 < points.length) candidates.push(points[low + 1]);

  let nearestPoint: T | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const point of candidates) {
    const distance = Math.abs(getTime(point) - targetTime);
    if (distance <= TOOLTIP_TIME_TOLERANCE_MS && distance < nearestDistance) {
      nearestPoint = point;
      nearestDistance = distance;
    }
  }

  return nearestPoint;
}

function buildMainTooltipPointIndex(points: TrackerData[]): MainTooltipPointIndexEntry[] {
  return points
    .filter(isMainTooltipPoint)
    .map((point) => ({ time: getTooltipPointTime(point), point }))
    .sort((left, right) => left.time - right.time);
}

function buildComparisonTooltipPointIndex(lines: ComparisonLine[]): ComparisonTooltipPointIndexEntry[] {
  return lines.map((line) => ({
    dataKey: line.dataKey,
    points: [...line.points].sort((left, right) => left.shiftedTime - right.shiftedTime),
  }));
}

function findNearestMainTooltipPoint(index: MainTooltipPointIndexEntry[], targetTime: number): TrackerData | null {
  return findNearestSortedPoint(index, targetTime, (entry) => entry.time)?.point ?? null;
}

function collectNearbyComparisonPoints(index: ComparisonTooltipPointIndexEntry[], targetTime: number): ComparisonLinePoint[] {
  return index.flatMap((entry) => {
    const nearestPoint = findNearestSortedPoint(entry.points, targetTime, (point) => point.shiftedTime);
    return nearestPoint ? [nearestPoint] : [];
  });
}

function buildComparisonPointMap(points: ComparisonLinePoint[]) {
  return Object.fromEntries(points.map((point) => [point.dataKey, point]));
}

function createComparisonConfigId(): string {
  return `comparison-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function hasComparisonConfig(
  configs: ComparisonConfig[],
  targetType: ComparisonTargetType,
  targetId: number,
  tier: number,
): boolean {
  return configs.some((config) => (
    config.targetType === targetType &&
    config.targetId === targetId &&
    config.tier === tier
  ));
}

function isLegacyCnEventWithoutT1500(targetId: number): boolean {
  return targetId <= CN_T1500_LEGACY_EVENT_ID_LIMIT && targetId !== CN_T1500_BACKFILL_EVENT_ID;
}

function resolveLegacyCnEventTier(targetId: number, tier: number): number {
  if (
    tier === EVENT_TIER_1500 &&
    isLegacyCnEventWithoutT1500(targetId)
  ) {
    return EVENT_TIER_1000;
  }

  return tier;
}

function getComparisonTierOptions(config: ComparisonConfig, tierOptions: readonly number[]): readonly number[] {
  if (
    config.targetType !== "event" ||
    config.targetId === null ||
    !isLegacyCnEventWithoutT1500(config.targetId)
  ) {
    return tierOptions;
  }

  return tierOptions.filter((tier) => tier !== EVENT_TIER_1500);
}

function getMainTrackerTierOptions(trackingMode: TrackingMode, eventId: number | null): readonly number[] {
  const tierOptions = getTiersForMode(trackingMode);
  if (trackingMode !== "event" || eventId === null || !isLegacyCnEventWithoutT1500(eventId)) {
    return tierOptions;
  }

  return tierOptions.filter((tier) => tier !== EVENT_TIER_1500);
}

function isSongRankingDisabledEventType(eventType: string | null | undefined): boolean {
  return typeof eventType === "string" && EVENT_TYPES_WITHOUT_SONG_RANKING.has(eventType);
}

function resolveTrackingModeForEventType(trackingMode: TrackingMode, eventType: string | null | undefined): TrackingMode {
  return trackingMode === "song" && isSongRankingDisabledEventType(eventType) ? "event" : trackingMode;
}

function isComparisonTierSelectable(config: ComparisonConfig, tierOptions: readonly number[]): boolean {
  return config.tier !== null && getComparisonTierOptions(config, tierOptions).includes(config.tier);
}

function normalizeComparisonConfigTier(config: ComparisonConfig): ComparisonConfig {
  if (config.targetType !== "event" || config.targetId === null || config.tier === null) {
    return config;
  }

  const tier = resolveLegacyCnEventTier(config.targetId, config.tier);
  return tier === config.tier ? config : { ...config, tier };
}

function resolveMainTrackerTier(trackingMode: TrackingMode, eventId: number | null, tier: number): number {
  if (trackingMode !== "event" || eventId === null) {
    return tier;
  }

  return resolveLegacyCnEventTier(eventId, tier);
}

function getComparisonConfigKey(config: ComparisonConfig): string | null {
  return config.targetId !== null && config.tier !== null
    ? `${config.targetType}:${config.targetId}:${config.tier}`
    : null;
}

function findPreviousSameTypeEventComparisonTarget(
  events: MinimalEvent[],
  currentEventId: number | null,
  currentEventType: string | null,
  tier: number,
  configs: ComparisonConfig[],
): AutomaticComparisonTarget | null {
  if (currentEventId === null || currentEventType === null) {
    return null;
  }

  const target = events.find((event) => {
    const comparisonTier = resolveLegacyCnEventTier(event.id, tier);

    return (
      event.id < currentEventId &&
      event.eventType === currentEventType &&
      !hasComparisonConfig(configs, "event", event.id, comparisonTier)
    );
  });

  return target
    ? {
        targetId: target.id,
        tier: resolveLegacyCnEventTier(target.id, tier),
      }
    : null;
}

function findPreviousMonthlyComparisonTarget(
  monthlyOptions: Array<{ monthId: number }>,
  selectedMonthlyMonthId: number,
  tier: number,
  configs: ComparisonConfig[],
): AutomaticComparisonTarget | null {
  const target = monthlyOptions.find((option) => (
    option.monthId < selectedMonthlyMonthId &&
    !hasComparisonConfig(configs, "monthly", option.monthId, tier)
  ));

  return target
    ? {
        targetId: target.monthId,
        tier,
      }
    : null;
}

type InitialTrackerQueryState = {
  currentEventId: number | null;
  trackingMode: TrackingMode;
  selectedTier: number;
};

function readInitialTrackerQueryState(): InitialTrackerQueryState {
  const params = readEventTrackerSearchParams();
  const trackingMode = parseTrackingModeSearchParam(params.get("type")) ?? "event";
  const queryTier = readPositiveIntegerSearchParam(params, "tier");
  const currentEventId = readPositiveIntegerSearchParam(params, "event");
  const selectedTier = queryTier !== null
    ? normalizeTierForMode(trackingMode, queryTier) ?? readTrackerTierPreference(trackingMode)
    : readTrackerTierPreference(trackingMode);

  return {
    currentEventId,
    trackingMode,
    selectedTier: resolveMainTrackerTier(trackingMode, currentEventId, selectedTier),
  };
}

function formatBandoriCnDateTime(timestamp: number) {
  return format(timestamp, "yyyy年M月d日 HH:mm");
}

function renderRelativeCountdown(
  prefix: "距开始" | "距结束",
  remainingMs: number,
  completedLabel: string,
) {
  if (remainingMs <= 0) {
    return <span>{completedLabel}</span>;
  }

  const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000).toString().padStart(2, "0");

  return (
    <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
      <span>{prefix}</span>
      <span className="inline-flex items-baseline gap-0.5">
        <span className="text-blue-500">{days}</span>
        <span>天</span>
        <span className="text-blue-500">{hours}</span>
        <span>小时</span>
        <span className="text-blue-500">{minutes}</span>
        <span>分</span>
        <span className="inline-flex min-w-[2ch] justify-end text-blue-500 tabular-nums">{seconds}</span>
        <span>秒</span>
      </span>
    </span>
  );
}

function buildNonWorkingDayBands(
  domainStart: number | "auto",
  domainEnd: number | "auto",
  holidayLookup: ReturnType<typeof buildChinaMainlandHolidayLookup>,
): NonWorkingDayBand[] {
  if (typeof domainStart !== "number" || typeof domainEnd !== "number") {
    return [];
  }

  const bands: NonWorkingDayBand[] = [];
  const cursor = new Date(domainStart);
  cursor.setHours(0, 0, 0, 0);

  while (cursor.getTime() < domainEnd) {
    const nextDay = new Date(cursor);
    nextDay.setDate(nextDay.getDate() + 1);

    if (isChinaMainlandRestDay(cursor, holidayLookup)) {
      const bandStart = Math.max(cursor.getTime(), domainStart);
      const bandEnd = Math.min(nextDay.getTime(), domainEnd);

      if (bandStart < bandEnd) {
        const year = cursor.getFullYear();
        const month = String(cursor.getMonth() + 1).padStart(2, "0");
        const day = String(cursor.getDate()).padStart(2, "0");
        bands.push({
          key: `${year}-${month}-${day}`,
          start: bandStart,
          end: bandEnd,
        });
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return bands;
}

// ─────────────────────────── 展示子组件 ───────────────────────────

/**
 * EventProgressBar —— 活动进度条与倒计时展示组件。
 * 将每秒的 Date.now() 调用隔离在此组件内部，
 * 防止父组件每秒触发包含 Recharts 图表的全量重渲染。
 */
function EventProgressBar({ startDate, endDate }: { startDate: number; endDate: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const hasStarted = now >= startDate;
  const hasEnded = now >= endDate;
  const durationMs = Math.max(1, endDate - startDate);
  const progress = hasStarted ? Math.min(100, Math.max(0, ((now - startDate) / durationMs) * 100)) : 0;

  const summaryContent = hasStarted
    ? (
        <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
          <span className="text-blue-500 tabular-nums">{progress.toFixed(1)}%</span>
          <span>已完成</span>
        </span>
      )
    : renderRelativeCountdown("距开始", startDate - now, "活动已开始");

  const subSummaryContent = renderRelativeCountdown("距结束", endDate - now, hasEnded ? "活动已结束" : "活动已结束");

  return (
    <div className="rounded-2xl border border-[#ffe16c]/90 bg-[#fffef0]/94 p-6 shadow-[0_18px_44px_rgba(232,176,0,0.16),0_2px_10px_rgba(88,69,0,0.07)] dark:border-slate-700/80 dark:bg-[#111827] dark:shadow-[0_18px_44px_rgba(0,0,0,0.22)]">
      <div className="mb-2 flex items-start justify-between gap-3 text-sm font-semibold">
        <span className="shrink-0 whitespace-nowrap text-blue-500 font-bold">活动进度</span>
        <span className="min-w-0 flex flex-col items-end gap-0.5 text-right leading-tight">
          <span className="inline-flex justify-end">{summaryContent}</span>
          <span className="inline-flex justify-end">{subSummaryContent}</span>
        </span>
      </div>
      <div className="h-3 w-full bg-gray-100 dark:bg-slate-950/70 rounded-full overflow-hidden">
        <div
          className="h-full bg-linear-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────── 页面主组件 ───────────────────────────

export default function EventTrackerPage() {
  const cnExclusiveT = useTranslations("bandori.notices.cnExclusive");
  const preferredServer = useBandoriPreferredServer();
  const { music: masterMusic } = useBandoriMusicMaster();
  const { value: eventAssetIndex } = useBandoriEventsAssetIndex();
  const [currentEventId, setCurrentEventId] = useState<number | null>(null);
  const [trackingMode, setTrackingMode] = useState<TrackingMode>("event");
  const [selectedTier, setSelectedTier] = useState<number>(() => getDefaultTierForMode("event"));
  const [selectedSongId, setSelectedSongId] = useState<number>(0);
  const [selectedMonthlyMonthId, setSelectedMonthlyMonthId] = useState<number>(() => getCurrentMonthlyRankingWindow().monthId);
  const [chartRenderRevision, setChartRenderRevision] = useState(0);
  const [modeIndicatorStyle, setModeIndicatorStyle] = useState<ModeIndicatorStyle>({
    width: 0,
    height: 0,
    x: 0,
    y: 0,
    ready: false,
  });

  const [zoomIndex, setZoomIndex] = useState(0);
  const modeTabsListRef = useRef<HTMLDivElement>(null);
  const modeTriggerRefs = useRef<Record<TrackingMode, HTMLButtonElement | null>>({
    event: null,
    song: null,
    monthly: null,
  });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const chartViewportRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const scheduleTooltipPositionUpdateRef = useRef<() => void>(() => {});
  const isUserScrollingRef = useRef(false);
  const modeIndicatorViewportWidthRef = useRef<number | null>(null);
  const isProgrammaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [chartViewportHeight, setChartViewportHeight] = useState(400);
  const [hasAppliedInitialUrlState, setHasAppliedInitialUrlState] = useState(false);
  const monthlyRankingOptions = useMemo(() => getMonthlyRankingOptions(), []);

  // ===== 数据获取层 =====
  const {
    allEvents,
    currentEventId: resolvedCurrentEventId,
    recommendedEventId,
    eventMeta,
    selectedSongId: resolvedSelectedSongId,
    startDate,
    endDate,
    chartData,
    holidayData,
    loading,
    refreshing,
    apiHasResult,
    liveTarget,
  } = useTrackerData(
    currentEventId,
    trackingMode,
    selectedTier,
    selectedSongId,
    selectedMonthlyMonthId,
    hasAppliedInitialUrlState,
  );

  // ===== 投影偏好持久化 =====
  const [showInstantProjection, setShowInstantProjection] = useProjectionPreference(INSTANT_PROJECTION_STORAGE_KEY, true);
  const [showDayProjection, setShowDayProjection] = useProjectionPreference(DAY_PROJECTION_STORAGE_KEY, true);
  const [showBestdoriPrediction, setShowBestdoriPrediction] = useProjectionPreference(BESTDORI_PREDICTION_STORAGE_KEY, false);
  const eventComparisonPreferences = useComparisonPreferences("event");
  const monthlyComparisonPreferences = useComparisonPreferences("monthly");
  const comparisonTargetType: ComparisonTargetType = trackingMode === "monthly" ? "monthly" : "event";
  const activeComparisonPreferences = comparisonTargetType === "monthly"
    ? monthlyComparisonPreferences
    : eventComparisonPreferences;
  const {
    comparisonConfigs,
    setComparisonConfigs,
    comparisonAlignment,
    setComparisonAlignment,
  } = activeComparisonPreferences;
  const eventTypeById = useMemo(
    () => new Map(allEvents.map((event) => [event.id, event.eventType])),
    [allEvents],
  );
  const isSongModeDisabled = isSongRankingDisabledEventType(eventMeta?.eventType);

  const handleSelectedEventIdChange = useCallback((eventId: string) => {
    const nextEventId = Number.parseInt(eventId, 10);
    if (!Number.isInteger(nextEventId) || nextEventId <= 0) {
      return;
    }

    const nextTrackingMode = resolveTrackingModeForEventType(trackingMode, eventTypeById.get(nextEventId));
    const preferredTier = normalizeTierForMode(nextTrackingMode, selectedTier) ?? readTrackerTierPreference(nextTrackingMode);
    const nextTier = resolveMainTrackerTier(nextTrackingMode, nextEventId, preferredTier);

    setCurrentEventId(nextEventId);
    setTrackingMode(nextTrackingMode);
    setSelectedTier(nextTier);
    setZoomIndex(0);
    replaceEventTrackerUrlQuery({
      eventId: nextEventId,
      trackingMode: nextTrackingMode,
      tier: nextTier,
      commentPage: null,
      commentId: null,
    });
  }, [eventTypeById, selectedTier, trackingMode]);

  const handleTrackingModeChange = useCallback((value: string) => {
    const nextMode = parseTrackingModeSearchParam(value);
    if (nextMode === null) {
      return;
    }

    if (nextMode === trackingMode) {
      return;
    }

    if (nextMode === "song" && isSongModeDisabled) {
      return;
    }

    const nextTier = resolveMainTrackerTier(nextMode, resolvedCurrentEventId, readTrackerTierPreference(nextMode));

    setTrackingMode(nextMode);
    setSelectedTier(nextTier);
    setZoomIndex(0);
  }, [isSongModeDisabled, resolvedCurrentEventId, trackingMode]);

  const handleTierChange = useCallback((tier: number) => {
    const normalizedTier = normalizeTierForMode(trackingMode, tier);
    if (normalizedTier === null) {
      return;
    }

    const nextTier = resolveMainTrackerTier(trackingMode, resolvedCurrentEventId, normalizedTier);

    if (nextTier === selectedTier) {
      return;
    }

    setSelectedTier(nextTier);
    writeTrackerTierPreference(trackingMode, nextTier);
  }, [resolvedCurrentEventId, selectedTier, trackingMode]);

  const handleMonthlyMonthChange = useCallback((monthId: number) => {
    setSelectedMonthlyMonthId(monthId);
    setZoomIndex(0);
  }, []);

  useEffect(() => {
    let cancelled = false;

    window.queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      const nextState = readInitialTrackerQueryState();
      setCurrentEventId(nextState.currentEventId);
      setTrackingMode(nextState.trackingMode);
      setSelectedTier(nextState.selectedTier);
      setHasAppliedInitialUrlState(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasAppliedInitialUrlState || trackingMode !== "song" || !isSongModeDisabled) {
      return;
    }

    let cancelled = false;

    window.queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      const nextTier = resolveMainTrackerTier("event", resolvedCurrentEventId, readTrackerTierPreference("event"));
      setTrackingMode("event");
      setSelectedTier(nextTier);
      setZoomIndex(0);
    });

    return () => {
      cancelled = true;
    };
  }, [hasAppliedInitialUrlState, isSongModeDisabled, resolvedCurrentEventId, trackingMode]);

  useEffect(() => {
    if (!hasAppliedInitialUrlState) {
      return;
    }

    if (resolvedCurrentEventId === null) {
      return;
    }

    replaceEventTrackerUrlQuery({
      eventId: resolvedCurrentEventId,
      trackingMode,
      tier: selectedTier,
    });
  }, [hasAppliedInitialUrlState, resolvedCurrentEventId, selectedTier, trackingMode]);

  const updateModeIndicator = useCallback(() => {
    const listElement = modeTabsListRef.current;
    const activeTrigger = modeTriggerRefs.current[trackingMode];
    if (!listElement || !activeTrigger) {
      return;
    }

    const listRect = listElement.getBoundingClientRect();
    const activeRect = activeTrigger.getBoundingClientRect();

    // 指示器直接跟随真实按钮几何信息，可以同时兼容横排与竖排布局，
    // 避免为不同断点手写两套动画逻辑。
    const nextStyle = {
      width: activeRect.width,
      height: activeRect.height,
      x: activeRect.left - listRect.left,
      y: activeRect.top - listRect.top,
      ready: true,
    };

    setModeIndicatorStyle((previous) => {
      if (
        previous.width === nextStyle.width &&
        previous.height === nextStyle.height &&
        previous.x === nextStyle.x &&
        previous.y === nextStyle.y &&
        previous.ready === nextStyle.ready
      ) {
        return previous;
      }

      return nextStyle;
    });
  }, [trackingMode]);

  const availableChallengeSongIds = useMemo(() => {
    if (eventMeta?.eventType !== "challenge") {
      return [];
    }

    const challengeSongIds = eventMeta.musicIds.jp.length > 0
      ? eventMeta.musicIds.jp
      : eventMeta.musicIds.cn;

    if (challengeSongIds.length === 0) {
      return [];
    }

    const songIds = challengeSongIds
      .map((musicId) => Number(musicId))
      .filter((musicId) => Number.isFinite(musicId) && musicId > 0);

    return Array.from(new Set(songIds)).sort((left, right) => left - right);
  }, [eventMeta]);

  const mainTierOptions = useMemo(
    () => getMainTrackerTierOptions(trackingMode, resolvedCurrentEventId),
    [resolvedCurrentEventId, trackingMode],
  );

  const challengeSongTitleMap = useMemo(() => Object.fromEntries(
    availableChallengeSongIds.flatMap((songId) => {
      const title = pickBandoriRegionalText(
        masterMusic?.[String(songId)]?.musicTitle,
        preferredServer,
      );
      return title ? [[String(songId), title]] : [];
    }),
  ), [availableChallengeSongIds, masterMusic, preferredServer]);
  // 1/2/3 首歌的布局密度差异很大，按数量限制容器宽度可以减少横向留白。
  const challengeSongGridClassName = availableChallengeSongIds.length <= 1
    ? "max-w-48 grid-cols-1"
    : availableChallengeSongIds.length === 2
      ? "max-w-94 grid-cols-1 sm:grid-cols-2"
      : "max-w-126 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";

  const comparisonEventOptions = useMemo(
    () => allEvents.filter((event) => event.startAt !== null && event.endAt !== null),
    [allEvents],
  );
  const currentEventType = eventMeta?.eventType ?? null;
  const comparisonTargetOptions = useMemo<ComparisonTargetOption[]>(
    () => comparisonTargetType === "monthly"
      ? monthlyRankingOptions.map((option) => ({ id: option.monthId, label: option.label }))
      : comparisonEventOptions.map((event) => ({
          id: event.id,
          label: `${event.id}期: ${event.name}`,
          isSameEventType: (
            currentEventType !== null &&
            event.id !== resolvedCurrentEventId &&
            event.eventType === currentEventType
          ),
        })),
    [comparisonEventOptions, comparisonTargetType, currentEventType, monthlyRankingOptions, resolvedCurrentEventId],
  );
  const comparisonTargetLabelMap = useMemo(
    () => new Map(comparisonTargetOptions.map((option) => [option.id, option.label])),
    [comparisonTargetOptions],
  );
  const comparisonTargetIdSet = useMemo(
    () => new Set(comparisonTargetOptions.map((option) => option.id)),
    [comparisonTargetOptions],
  );
  const comparisonTierOptions = comparisonTargetType === "monthly" ? MONTHLY_TIERS : EVENT_TIERS;
  const comparisonTierOptionsByConfigId = useMemo(
    () => new Map(comparisonConfigs.map((config) => [
      config.id,
      getComparisonTierOptions(config, comparisonTierOptions),
    ])),
    [comparisonConfigs, comparisonTierOptions],
  );
  const defaultComparisonTier = comparisonTierOptions.includes(selectedTier) ? selectedTier : comparisonTierOptions[0];
  const defaultComparisonTargetId = comparisonTargetType === "monthly"
    ? selectedMonthlyMonthId
    : resolvedCurrentEventId;
  const resolvedComparisonConfigs = useMemo(
    () => comparisonConfigs
      .filter((config) => (
        config.targetType === comparisonTargetType &&
        config.targetId !== null &&
        config.tier !== null &&
        comparisonTargetIdSet.has(config.targetId) &&
        isComparisonTierSelectable(config, comparisonTierOptions)
      ))
      .map((config, colorIndex) => ({ ...config, colorIndex })),
    [comparisonConfigs, comparisonTargetIdSet, comparisonTargetType, comparisonTierOptions],
  );
  const activeComparisonConfigs = useMemo(
    () => resolvedComparisonConfigs.filter((config) => config.enabled),
    [resolvedComparisonConfigs],
  );
  const canAddComparisonRow = (
    (trackingMode === "event" || trackingMode === "monthly") &&
    defaultComparisonTargetId !== null &&
    comparisonConfigs.length < MAX_COMPARISON_LINES
  );

  useEffect(() => {
    if (comparisonTargetOptions.length === 0) {
      return;
    }

    setComparisonConfigs((previous) => {
      const seenConfigKeys = new Set<string>();
      const nextConfigs: ComparisonConfig[] = [];

      for (const config of previous) {
        const normalizedConfig = normalizeComparisonConfigTier(config);
        const configKey = getComparisonConfigKey(normalizedConfig);

        if (
          normalizedConfig.targetType !== comparisonTargetType ||
          normalizedConfig.targetId === null ||
          normalizedConfig.tier === null ||
          !comparisonTargetIdSet.has(normalizedConfig.targetId) ||
          !isComparisonTierSelectable(normalizedConfig, comparisonTierOptions) ||
          configKey === null ||
          seenConfigKeys.has(configKey)
        ) {
          continue;
        }

        seenConfigKeys.add(configKey);
        nextConfigs.push(normalizedConfig);
      }

      const hasChanged = nextConfigs.length !== previous.length || nextConfigs.some((config, index) => config !== previous[index]);
      return hasChanged ? nextConfigs : previous;
    });
  }, [
    comparisonTargetIdSet,
    comparisonTargetOptions.length,
    comparisonTargetType,
    comparisonTierOptions,
    setComparisonConfigs,
  ]);

  const handleAddComparison = useCallback(() => {
    if (!canAddComparisonRow) return;

    setComparisonConfigs((previous) => {
      const comparisonTarget = comparisonTargetType === "monthly"
        ? findPreviousMonthlyComparisonTarget(monthlyRankingOptions, selectedMonthlyMonthId, defaultComparisonTier, previous)
        : findPreviousSameTypeEventComparisonTarget(comparisonEventOptions, resolvedCurrentEventId, currentEventType, defaultComparisonTier, previous);

      if (comparisonTarget === null) {
        return previous;
      }

      return [
        ...previous,
        {
          id: createComparisonConfigId(),
          targetType: comparisonTargetType,
          targetId: comparisonTarget.targetId,
          tier: comparisonTarget.tier,
          enabled: true,
        },
      ];
    });
  }, [
    canAddComparisonRow,
    comparisonEventOptions,
    comparisonTargetType,
    currentEventType,
    defaultComparisonTier,
    monthlyRankingOptions,
    resolvedCurrentEventId,
    selectedMonthlyMonthId,
    setComparisonConfigs,
  ]);

  const handleUpdateComparison = useCallback((id: string, patch: Partial<ComparisonConfig>) => {
    setComparisonConfigs((previous) => previous.map((config) => {
      if (config.id !== id) return config;

      const nextConfig = normalizeComparisonConfigTier({ ...config, ...patch });
      const nextKey = getComparisonConfigKey(nextConfig);
      const isDuplicate = nextKey !== null && previous.some((other) => (
        other.id !== id &&
        other.targetType === nextConfig.targetType &&
        other.targetId === nextConfig.targetId &&
        other.tier === nextConfig.tier
      ));

      if (isDuplicate) {
        return config;
      }

      return nextConfig;
    }));
  }, [setComparisonConfigs]);

  const handleToggleComparison = useCallback((id: string) => {
    setComparisonConfigs((previous) => previous.map((config) => (
      config.id === id ? { ...config, enabled: !config.enabled } : config
    )));
  }, [setComparisonConfigs]);

  const handleRemoveComparison = useCallback((id: string) => {
    setComparisonConfigs((previous) => previous.filter((config) => config.id !== id));
  }, [setComparisonConfigs]);

  const handleRemoveAllComparisons = useCallback(() => {
    setComparisonConfigs([]);
  }, [setComparisonConfigs]);

  // ===== 数据派生层 =====
  const cnEventName = eventMeta?.name.cn?.trim() || eventMeta?.name.jp.trim() || "Loading Event...";
  const bannerServer = eventMeta ? resolveBandoriEventAssetRegion(eventMeta) : "jp";
  const bannerUrl = buildBandoriPublicAssetUrl(
    lookupBandoriEventBanner(eventAssetIndex, resolvedCurrentEventId, bannerServer),
  ) ?? "";

  const { domainStart, domainEnd, cutoffEnd, midnights } = useChartDomain(trackingMode, startDate, endDate, selectedMonthlyMonthId);
  const hasActualTrackerData = useMemo(
    () => chartData.some((point) => isActualTrackerPoint(point, domainStart, trackingMode, chartData.length)),
    [chartData, domainStart, trackingMode],
  );
  const fullProcessedData = useProcessedData(chartData, apiHasResult, domainStart, trackingMode);
  const status = useEventStatus(domainStart, domainEnd);
  const finalDisplayedData = useFinalDisplayedData(fullProcessedData, cutoffEnd, status, showInstantProjection, showDayProjection);
  const bestdoriPrediction = useBestdoriPrediction({
    enabled: hasAppliedInitialUrlState && trackingMode === "event" && status === "进行中" && showBestdoriPrediction,
    eventId: resolvedCurrentEventId,
    tier: selectedTier,
  });
  const { comparisonLines } = useComparisonTrackerData({
    enabled: hasAppliedInitialUrlState && (trackingMode === "event" || trackingMode === "monthly"),
    configs: activeComparisonConfigs,
    events: allEvents,
    monthlyOptions: monthlyRankingOptions,
    alignment: comparisonAlignment,
    currentStart: typeof domainStart === "number" ? domainStart : null,
    currentEnd: typeof domainEnd === "number" ? domainEnd : null,
    liveTarget,
  });
  const comparisonLineById = useMemo(
    () => new Map(comparisonLines.map((line) => [line.config.id, line])),
    [comparisonLines],
  );
  const bestdoriDisplayedData = useMemo(
    () => mergeBestdoriPredictionData(finalDisplayedData, bestdoriPrediction.predictionPoints),
    [bestdoriPrediction.predictionPoints, finalDisplayedData],
  );
  const displayedChartData = useMemo(
    () => mergeComparisonLines(bestdoriDisplayedData, comparisonLines),
    [bestdoriDisplayedData, comparisonLines],
  );
  const zoomWidthMultiplier = ZOOM_WIDTH_MULTIPLIERS[zoomIndex];
  const handleZoomIn = useCallback(() => {
    startTransition(() => setZoomIndex((previous) => Math.min(ZOOM_WIDTH_MULTIPLIERS.length - 1, previous + 1)));
  }, []);
  const handleZoomOut = useCallback(() => {
    startTransition(() => setZoomIndex((previous) => Math.max(0, previous - 1)));
  }, []);
  const mainTooltipPointIndex = useMemo(
    () => buildMainTooltipPointIndex(bestdoriDisplayedData),
    [bestdoriDisplayedData],
  );
  const comparisonTooltipPointIndex = useMemo(
    () => buildComparisonTooltipPointIndex(comparisonLines),
    [comparisonLines],
  );
  const buildHoverTooltip = useCallback((state: TrackerMouseState): HoverTooltipState | null => {
    if (!state?.isTooltipActive || !state?.activeCoordinate) {
      return null;
    }

    const activeLabel = typeof state.activeLabel === "number"
      ? state.activeLabel
      : Number(state.activeLabel);
    if (!Number.isFinite(activeLabel)) {
      return null;
    }

    const mainPoint = findNearestMainTooltipPoint(mainTooltipPointIndex, activeLabel);
    const targetTime = mainPoint ? getTooltipPointTime(mainPoint) : activeLabel;
    const nearbyComparisonPoints = collectNearbyComparisonPoints(comparisonTooltipPointIndex, targetTime);

    let payload: TrackerTooltipPayloadEntry[] = [];
    let label = targetTime;

    if (mainPoint) {
      const comparisonPointMap = buildComparisonPointMap(nearbyComparisonPoints);
      const payloadPoint = {
        ...mainPoint,
        comparisonPoints: {
          ...(mainPoint.comparisonPoints ?? {}),
          ...comparisonPointMap,
        },
      };
      const dataKey = mainPoint.isProjection ? "instantEp" : "ep";
      payload = [{ dataKey, payload: payloadPoint }];
      label = getTooltipPointTime(mainPoint);
    } else if (nearbyComparisonPoints.length > 0) {
      const comparisonPointMap = buildComparisonPointMap(nearbyComparisonPoints);
      const firstPoint = nearbyComparisonPoints[0];
      payload = [{
        dataKey: firstPoint.dataKey,
        payload: {
          time: activeLabel,
          ep: 0,
          comparisonPoints: comparisonPointMap,
          tooltipMode: "comparison",
        },
      }];
    } else {
      return null;
    }

    return {
      active: true,
      coordinate: {
        x: state.activeCoordinate.x,
        y: state.activeCoordinate.y,
      },
      label,
      payload,
      signature: buildTooltipSignature(label, payload),
    };
  }, [comparisonTooltipPointIndex, mainTooltipPointIndex]);
  const scheduleTooltipPositionUpdate = useCallback(() => {
    scheduleTooltipPositionUpdateRef.current();
  }, []);
  const hasRenderableChartData = hasActualTrackerData ||
    bestdoriPrediction.predictionPoints.length > 0 ||
    comparisonLines.some((line) => line.points.length > 0);
  const scoreData = useMemo(
    () => fullProcessedData.filter((point) => isActualTrackerPoint(point, domainStart, trackingMode, fullProcessedData.length)),
    [domainStart, fullProcessedData, trackingMode],
  );
  const holidayLookup = useMemo(() => buildChinaMainlandHolidayLookup(holidayData), [holidayData]);
  const nonWorkingDayBands = useMemo(
    () => buildNonWorkingDayBands(domainStart, domainEnd, holidayLookup),
    [domainEnd, domainStart, holidayLookup],
  );
  const latestActualDataTime = useMemo(() => {
    for (let index = finalDisplayedData.length - 1; index >= 0; index -= 1) {
      const point = finalDisplayedData[index];
      if (!point.isProjection) {
        return point.time;
      }
    }

    return null;
  }, [finalDisplayedData]);

  const focusViewportNearLatestDataPoint = useCallback(() => {
    const viewport = scrollContainerRef.current;
    if (!viewport) {
      return;
    }

    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    if (
      maxScrollLeft <= 0 ||
      typeof domainStart !== "number" ||
      typeof domainEnd !== "number" ||
      latestActualDataTime === null ||
      domainEnd <= domainStart
    ) {
      viewport.scrollLeft = maxScrollLeft;
      return;
    }

    const latestProgress = (latestActualDataTime - domainStart) / (domainEnd - domainStart);
    const clampedProgress = Math.max(0, Math.min(1, latestProgress));
    const latestPointX = clampedProgress * viewport.scrollWidth;
    const desiredViewportAnchor = viewport.clientWidth * 0.76;
    const desiredScrollLeft = latestPointX - desiredViewportAnchor;

    isProgrammaticScrollRef.current = true;
    viewport.scrollLeft = Math.max(0, Math.min(desiredScrollLeft, maxScrollLeft));
    requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false;
    });
  }, [domainEnd, domainStart, latestActualDataTime]);

  const syncScrollbarMetrics = useCallback(() => {
    const viewport = scrollContainerRef.current;
    if (!viewport) {
      return;
    }

    const nextChartViewportHeight = viewport.offsetHeight;
    setChartViewportHeight((prev) => (prev === nextChartViewportHeight ? prev : nextChartViewportHeight));
  }, []);

  // Chart container resize and scroll handling.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleScroll = () => {
      if (isProgrammaticScrollRef.current) {
        scheduleTooltipPositionUpdate();
        return;
      }

      isUserScrollingRef.current = true;
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 200);
      scheduleTooltipPositionUpdate();
    };

    el.addEventListener("scroll", handleScroll);

    const resizeObserver = new ResizeObserver(() => {
      syncScrollbarMetrics();
      scheduleTooltipPositionUpdate();
      if (!isUserScrollingRef.current) {
        focusViewportNearLatestDataPoint();
      }
    });
    if (el.firstElementChild) {
      resizeObserver.observe(el.firstElementChild);
    }

    return () => {
      el.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
  }, [focusViewportNearLatestDataPoint, scheduleTooltipPositionUpdate, syncScrollbarMetrics]);

  useEffect(() => {
    if (!isUserScrollingRef.current) {
      focusViewportNearLatestDataPoint();
    }
    syncScrollbarMetrics();
    scheduleTooltipPositionUpdate();
  }, [focusViewportNearLatestDataPoint, zoomWidthMultiplier, resolvedCurrentEventId, trackingMode, selectedTier, scheduleTooltipPositionUpdate, syncScrollbarMetrics]);

  useEffect(() => {
    const rebuildChart = () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      setChartRenderRevision((previous) => previous + 1);

      requestAnimationFrame(() => {
        syncScrollbarMetrics();
        if (!isUserScrollingRef.current) {
          focusViewportNearLatestDataPoint();
        }
        scheduleTooltipPositionUpdate();
      });
    };

    document.addEventListener("visibilitychange", rebuildChart);
    window.addEventListener("pageshow", rebuildChart);

    return () => {
      document.removeEventListener("visibilitychange", rebuildChart);
      window.removeEventListener("pageshow", rebuildChart);
    };
  }, [focusViewportNearLatestDataPoint, scheduleTooltipPositionUpdate, syncScrollbarMetrics]);

  useLayoutEffect(() => {
    const listElement = modeTabsListRef.current;
    if (!listElement) {
      return;
    }

    updateModeIndicator();

    const resizeObserver = new ResizeObserver(() => {
      updateModeIndicator();
    });
    resizeObserver.observe(listElement);

    const activeTrigger = modeTriggerRefs.current[trackingMode];
    if (activeTrigger) {
      resizeObserver.observe(activeTrigger);
    }

    const animationFrame = requestAnimationFrame(() => {
      updateModeIndicator();
    });

    modeIndicatorViewportWidthRef.current = window.innerWidth;
    const handleWindowResize = () => {
      const nextViewportWidth = window.innerWidth;
      if (modeIndicatorViewportWidthRef.current === nextViewportWidth) {
        return;
      }

      modeIndicatorViewportWidthRef.current = nextViewportWidth;
      updateModeIndicator();
    };

    window.addEventListener("resize", handleWindowResize);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [trackingMode, updateModeIndicator]);

  const { ticks: yTicks, domain: yDomainInfo } = useMemo(
    () => generateYTicks(displayedChartData),
    [displayedChartData],
  );
  const comparisonChartKey = comparisonConfigs.map((config) => `${config.targetType}:${config.targetId}:${config.tier}`).join(",");
  const chartContainerKey = `${resolvedCurrentEventId ?? "none"}-${trackingMode}-${selectedMonthlyMonthId}-${selectedTier}-${resolvedSelectedSongId}-${comparisonChartKey}-${comparisonAlignment}-${showBestdoriPrediction}-${bestdoriPrediction.status}-${chartRenderRevision}`;

  // ===== 分数摘要 =====
  const scoreSummary = useMemo(() => {
    let latestScore: number | null = null;
    let latestUpdateTime: number | null = null;
    let endScore: number | null = null;
    let finalScore: number | null = null;

    if (scoreData.length > 0) {
      const latestPt = scoreData[scoreData.length - 1];
      latestScore = latestPt.ep;
      latestUpdateTime = latestPt.time;

      if (status === "已结束") {
        if (trackingMode === "monthly" && typeof domainEnd === "number") {
          const nextMonth1st0000 = domainEnd + 1;
          const nextMonth1st0015 = nextMonth1st0000 + 15 * 60 * 1000;
          endScore = getScoreAtTime(scoreData, nextMonth1st0000);
          finalScore = getFinalScore(scoreData) ?? getScoreAtTime(scoreData, nextMonth1st0015);
        } else if (endDate) {
          const ed = new Date(endDate);
          const endDay2300 = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate(), 23, 0, 0).getTime();
          const endDay2315 = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate(), 23, 15, 0).getTime();
          endScore = getScoreAtTime(scoreData, endDay2300);
          finalScore = getFinalScore(scoreData) ?? getScoreAtTime(scoreData, endDay2315);
        }
      }
    }

    return { latestScore, latestUpdateTime, endScore, finalScore };
  }, [scoreData, status, trackingMode, domainEnd, endDate]);

  // ===== 渲染 =====
  return (
    <BandoriPageShell contentClassName="max-w-6xl">

        {/* ========== 页头：活动名称、切换器、活动横幅 ========== */}
        <BandoriEventSwitcher
          title={cnEventName}
          events={allEvents}
          selectedEventId={resolvedCurrentEventId ? String(resolvedCurrentEventId) : ""}
          onSelectedEventIdChange={handleSelectedEventIdChange}
          bannerUrl={bannerUrl}
          startText={startDate ? `${formatBandoriCnDateTime(startDate)} (CN)` : null}
          endText={endDate ? `${formatBandoriCnDateTime(endDate)} (CN)` : null}
          recommendedEventId={recommendedEventId !== null ? String(recommendedEventId) : null}
        />

        <BandoriCnExclusiveNotice
          label={cnExclusiveT("label")}
          description={cnExclusiveT("eventtrackerDescription")}
        />

        {/* ========== 进度条 ========== */}
        {startDate && endDate && <EventProgressBar startDate={startDate} endDate={endDate} />}

        {/* ========== 导航与控制区 ========== */}
        <div className="rounded-3xl border border-white/80 bg-[#fffef4] p-3 shadow-[0_18px_48px_rgba(65,54,0,0.10),0_3px_14px_rgba(15,23,42,0.05)] dark:border-slate-700/80 dark:bg-[#111827] dark:shadow-[0_24px_60px_rgba(0,0,0,0.24)] sm:p-5">
          <Tabs.Root
            value={trackingMode}
            onValueChange={handleTrackingModeChange}
            className="w-full flex flex-col gap-3.5 sm:gap-4"
          >
            <TrackerModeTierControls
              availableChallengeSongIds={availableChallengeSongIds}
              challengeSongGridClassName={challengeSongGridClassName}
              challengeSongTitleMap={challengeSongTitleMap}
              isSongModeDisabled={isSongModeDisabled}
              modeIndicatorStyle={modeIndicatorStyle}
              modeTabsListRef={modeTabsListRef}
              modeTriggerRefs={modeTriggerRefs}
              monthlyRankingOptions={monthlyRankingOptions}
              onMonthlyMonthChange={handleMonthlyMonthChange}
              onSongChange={setSelectedSongId}
              onTierChange={handleTierChange}
              resolvedSelectedSongId={resolvedSelectedSongId}
              selectedMonthlyMonthId={selectedMonthlyMonthId}
              selectedTier={selectedTier}
              tierOptions={mainTierOptions}
              trackingMode={trackingMode}
            />

            {/* ========== 图表区域 ========== */}
            <Tabs.Content value={trackingMode} className="outline-hidden focus:outline-hidden w-full animate-in fade-in zoom-in-95 duration-500">
              <div className="mt-3 relative rounded-2xl border border-slate-200/80 bg-[#fffef4] p-2 shadow-[0_18px_48px_rgba(15,23,42,0.10)] dark:border-slate-800/80 dark:bg-[#0C111C] dark:shadow-[0_24px_60px_rgba(0,0,0,0.28)] sm:p-4">

                {loading && (
                  <div className="absolute inset-0 bg-white/75 dark:bg-[#0C111C]/75 z-30 flex items-center justify-center rounded-2xl">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <p className="mt-4 text-sm font-semibold text-blue-600 animate-pulse">正在获取最新数据...</p>
                    </div>
                  </div>
                )}

                <TrackerStatusSummary
                  bestdoriPrediction={bestdoriPrediction}
                  scoreSummary={scoreSummary}
                  isRefreshing={refreshing}
                  showBestdoriPrediction={showBestdoriPrediction}
                  status={status}
                  trackingMode={trackingMode}
                />

                <TrackerChartPanel
                  bestdoriPredictionPointCount={bestdoriPrediction.predictionPoints.length}
                  buildHoverTooltip={buildHoverTooltip}
                  chartContainerKey={chartContainerKey}
                  chartViewportHeight={chartViewportHeight}
                  chartViewportRef={chartViewportRef}
                  comparisonLines={comparisonLines}
                  displayedChartData={displayedChartData}
                  domainEnd={domainEnd}
                  domainStart={domainStart}
                  hasRenderableChartData={hasRenderableChartData}
                  isLoading={loading}
                  midnights={midnights}
                  nonWorkingDayBands={nonWorkingDayBands}
                  onZoomIn={handleZoomIn}
                  onZoomOut={handleZoomOut}
                  scheduleTooltipPositionUpdateRef={scheduleTooltipPositionUpdateRef}
                  scrollContainerRef={scrollContainerRef}
                  showBestdoriPrediction={showBestdoriPrediction}
                  showDayProjection={showDayProjection}
                  showInstantProjection={showInstantProjection}
                  tooltipRef={tooltipRef}
                  trackingMode={trackingMode}
                  yDomainInfo={yDomainInfo}
                  yTicks={yTicks}
                  zoomIndex={zoomIndex}
                  zoomWidthMultiplier={zoomWidthMultiplier}
                  maxZoomIndex={ZOOM_WIDTH_MULTIPLIERS.length - 1}
                />

                <ComparisonControls
                  bestdoriPrediction={bestdoriPrediction}
                  canAddComparisonRow={canAddComparisonRow}
                  comparisonAlignment={comparisonAlignment}
                  comparisonConfigs={comparisonConfigs}
                  comparisonLineById={comparisonLineById}
                  comparisonTargetLabelMap={comparisonTargetLabelMap}
                  comparisonTargetOptions={comparisonTargetOptions}
                  comparisonTargetType={comparisonTargetType}
                  comparisonTierOptions={comparisonTierOptions}
                  comparisonTierOptionsByConfigId={comparisonTierOptionsByConfigId}
                  onAddComparison={handleAddComparison}
                  onAlignmentChange={setComparisonAlignment}
                  onRemoveAllComparisons={handleRemoveAllComparisons}
                  onRemoveComparison={handleRemoveComparison}
                  onToggleComparison={handleToggleComparison}
                  onUpdateComparison={handleUpdateComparison}
                  resolvedComparisonConfigs={resolvedComparisonConfigs}
                  setShowBestdoriPrediction={setShowBestdoriPrediction}
                  setShowDayProjection={setShowDayProjection}
                  setShowInstantProjection={setShowInstantProjection}
                  showBestdoriPrediction={showBestdoriPrediction}
                  showDayProjection={showDayProjection}
                  showInstantProjection={showInstantProjection}
                  status={status}
                  trackingMode={trackingMode}
                />
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </div>
        <EventComments eventId={resolvedCurrentEventId} />
    </BandoriPageShell>
  );
}
