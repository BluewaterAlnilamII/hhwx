"use client";

import { startTransition, useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from "react";
import { format } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import * as Tabs from "@radix-ui/react-tabs";
import { Plus, X, ZoomIn, ZoomOut } from "lucide-react";

import { useCachedFetch } from "@/hooks/useCachedFetch";
import { parseApiSuccessData } from "@/lib/api-contracts";
import {
  buildBandoriEventBannerPublicUrl,
  resolveBandoriEventBannerBundleName,
} from "@/lib/bandori-asset-proxy";
import { resolveBandoriEventAssetRegion } from "@/lib/bandori-event-region";
import type { ComparisonConfig, ComparisonLine, ComparisonLinePoint, TrackerData, TrackerDotProps, TrackerMouseState, TrackerTooltipPayloadEntry, TrackingMode } from "./types";
import {
  COMPARISON_LINE_COLORS,
  EVENT_TIERS,
  INSTANT_PROJECTION_STORAGE_KEY,
  DAY_PROJECTION_STORAGE_KEY,
  MAX_COMPARISON_LINES,
  getTiersForMode,
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
} from "./useChartData";
import { TrackerTooltip } from "./TrackerTooltip";
import FixedYAxis from "./FixedYAxis";
import { useProjectionPreference } from "./useProjectionPreference";
import { useComparisonPreferences } from "./useComparisonPreferences";
import { mergeComparisonLines, useComparisonTrackerData } from "./useComparisonTrackerData";
import BandoriPageShell from "../BandoriPageShell";
import BandoriEventSwitcher from "../BandoriEventSwitcher";
import {
  buildChinaMainlandHolidayLookup,
  isChinaMainlandRestDay,
} from "../calendar/chinaMainlandHolidayCalendar";

type NonWorkingDayBand = {
  key: string;
  start: number;
  end: number;
};

const ZOOM_WIDTH_MULTIPLIERS = [1, 2, 4, 8, 16, 32] as const;
const TOOLTIP_OFFSET = 12;
const TOOLTIP_EDGE_PADDING = 8;
const TOOLTIP_TIME_TOLERANCE_MS = 30_000;
const FIXED_Y_AXIS_WIDTH = 38;
const CHART_MARGIN = { top: 20, right: 5, left: 0, bottom: 20 } as const;
const X_AXIS_HEIGHT = 30;

type HoverTooltipState = {
  active: boolean;
  coordinate: { x: number; y: number };
  label?: number;
  payload?: TrackerTooltipPayloadEntry[];
  signature?: string;
};

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

function isInvalidMarkerPosition(cx?: number, cy?: number): boolean {
  return typeof cx !== "number" || Number.isNaN(cx) || typeof cy !== "number" || Number.isNaN(cy);
}

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

function renderHiddenMarker(key?: string) {
  return <circle key={key} cx={0} cy={0} r={0} stroke="none" />;
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

function buildTooltipSignature(label: number | undefined, payload: TrackerTooltipPayloadEntry[]): string {
  const payloadSignature = payload
    .map((entry) => {
      const dataKey = String(entry.dataKey ?? "");
      const point = entry.payload;
      const comparisonSignature = Object.entries(point?.comparisonPoints ?? {})
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, comparisonPoint]) => `${key}:${comparisonPoint.shiftedTime}:${comparisonPoint.ep}`)
        .join(",");
      return `${dataKey}:${point?.time ?? ""}:${point?.projectionType ?? ""}:${comparisonSignature}`;
    })
    .join("|");

  return `${label ?? ""}:${payloadSignature}`;
}

function isComparisonPointActive(
  hoverTooltip: HoverTooltipState | null,
  dataKey: `compare_${number}_ep`,
  point: ComparisonLinePoint | undefined,
): boolean {
  if (!hoverTooltip?.active || !point) return false;

  return hoverTooltip.payload?.some((entry) => {
    const activePoint = entry.payload?.comparisonPoints?.[dataKey];
    return activePoint?.shiftedTime === point.shiftedTime;
  }) ?? false;
}

function isMainPointActive(hoverTooltip: HoverTooltipState | null, point: TrackerData | undefined): boolean {
  if (!hoverTooltip?.active || !point) return false;

  const activePoint = hoverTooltip.payload?.find((entry) => entry.dataKey === "ep" || entry.dataKey === "instantEp")?.payload;
  if (!activePoint) return false;

  if (point.isProjection || activePoint.isProjection) {
    return Boolean(point.isProjection && activePoint.isProjection && point.time === activePoint.time);
  }

  return point.time === activePoint.time;
}

function getComparisonStatusLabel(status: string): string {
  if (status === "loading") return "加载中";
  if (status === "no-data") return "无数据";
  if (status === "time-missing") return "时间缺失";
  return "正常";
}

function createComparisonConfigId(): string {
  return `comparison-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
    <div className="rounded-2xl border border-[#ffe16c]/90 bg-[#fffef0]/94 p-6 shadow-[0_18px_44px_rgba(232,176,0,0.16),0_2px_10px_rgba(88,69,0,0.07)] dark:border-gray-800 dark:bg-[#131A2B]">
      <div className="mb-2 flex items-start justify-between gap-3 text-sm font-semibold">
        <span className="shrink-0 whitespace-nowrap text-blue-500 font-bold">活动进度</span>
        <span className="min-w-0 flex flex-col items-end gap-0.5 text-right leading-tight">
          <span className="inline-flex justify-end">{summaryContent}</span>
          <span className="inline-flex justify-end">{subSummaryContent}</span>
        </span>
      </div>
      <div className="h-3 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

/**
 * MinutesAgo —— "N分钟前更新"实时展示组件。
 * 每秒自主更新，超过 30 分钟则高亮警告色。
 * 同样隔离在子组件内以避免父组件全量重渲染。
 */
function MinutesAgo({ timestamp }: { timestamp: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const minutesAgo = Math.floor((now - timestamp) / 60000);

  return (
    <span className={`text-base font-medium ${minutesAgo > 30 ? "text-red-500" : "text-gray-600 dark:text-gray-300"}`}>
      {minutesAgo >= 0 ? `${minutesAgo}分钟前` : "-"}
    </span>
  );
}

// ─────────────────────────── 页面主组件 ───────────────────────────

export default function EventTrackerPage() {
  const [currentEventId, setCurrentEventId] = useState<number | null>(null);
  const [trackingMode, setTrackingMode] = useState<TrackingMode>("event");
  const [selectedTier, setSelectedTier] = useState<number>(1000);
  const [selectedSongId, setSelectedSongId] = useState<number>(0);
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
  const hoverTooltipRef = useRef<HoverTooltipState | null>(null);
  const tooltipAnimationFrameRef = useRef<number | null>(null);
  const isUserScrollingRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltipState | null>(null);
  const [chartViewportHeight, setChartViewportHeight] = useState(400);

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
    apiHasResult,
  } = useTrackerData(
    currentEventId,
    trackingMode,
    selectedTier,
    selectedSongId,
  );

  // ===== 投影偏好持久化 =====
  const [showInstantProjection, setShowInstantProjection] = useProjectionPreference(INSTANT_PROJECTION_STORAGE_KEY, true);
  const [showDayProjection, setShowDayProjection] = useProjectionPreference(DAY_PROJECTION_STORAGE_KEY, true);
  const {
    comparisonConfigs,
    setComparisonConfigs,
    comparisonAlignment,
    setComparisonAlignment,
  } = useComparisonPreferences();

  const handleTrackingModeChange = useCallback((value: string) => {
    const nextMode = value as TrackingMode;

    setTrackingMode(nextMode);
    setZoomIndex(0);
    const targetTiers = getTiersForMode(nextMode);

    setSelectedTier((previousTier) => {
      if (targetTiers.includes(previousTier)) {
        return previousTier;
      }

      const validTiers = targetTiers.filter((tier) => tier <= previousTier);
      return validTiers.length > 0 ? validTiers[validTiers.length - 1] : targetTiers[0];
    });
  }, []);

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

  const challengeSongIdsQuery = useMemo(
    () => availableChallengeSongIds.join(","),
    [availableChallengeSongIds],
  );

  const { data: challengeSongTitleMap } = useCachedFetch<Record<string, string>>(
    availableChallengeSongIds.length > 0 ? `bandori-song-titles-${challengeSongIdsQuery}` : null,
    availableChallengeSongIds.length > 0 ? `/api/bandori/songs?ids=${challengeSongIdsQuery}` : null,
    (data: unknown) => {
      const payload = parseApiSuccessData<{ songs?: Record<string, string> }>(data) ?? data as { songs?: Record<string, string> } | null;
      if (!payload || typeof payload !== "object") {
        return {};
      }

      const songs = payload.songs;
      return songs ?? {};
    },
    { refreshOnVisible: false, staleTimeMs: 24 * 60 * 60 * 1000 },
  );
  // 1/2/3 首歌的布局密度差异很大，按数量限制容器宽度可以减少横向留白。
  const challengeSongGridClassName = availableChallengeSongIds.length <= 1
    ? "max-w-[12rem] grid-cols-1"
    : availableChallengeSongIds.length === 2
      ? "max-w-[23.5rem] grid-cols-1 sm:grid-cols-2"
      : "max-w-[31.5rem] grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";

  const comparisonEventOptions = useMemo(
    () => allEvents.filter((event) => event.startAt !== null && event.endAt !== null),
    [allEvents],
  );
  const resolvedComparisonConfigs = useMemo(
    () => comparisonConfigs
      .filter((config) => config.eventId !== null && config.tier !== null)
      .map((config, colorIndex) => ({ ...config, colorIndex })),
    [comparisonConfigs],
  );
  const activeComparisonConfigs = useMemo(
    () => resolvedComparisonConfigs.filter((config) => config.enabled),
    [resolvedComparisonConfigs],
  );
  const canAddComparisonRow = trackingMode === "event" && comparisonConfigs.length < MAX_COMPARISON_LINES;

  const handleAddComparison = useCallback(() => {
    if (!canAddComparisonRow) return;

    setComparisonConfigs((previous) => [
      ...previous,
      { id: createComparisonConfigId(), eventId: resolvedCurrentEventId, tier: selectedTier, enabled: true },
    ]);
  }, [canAddComparisonRow, resolvedCurrentEventId, selectedTier, setComparisonConfigs]);

  const handleUpdateComparison = useCallback((id: string, patch: Partial<ComparisonConfig>) => {
    setComparisonConfigs((previous) => previous.map((config) => {
      if (config.id !== id) return config;

      const nextConfig = { ...config, ...patch };
      const nextKey = nextConfig.eventId !== null && nextConfig.tier !== null
        ? `${nextConfig.eventId}:${nextConfig.tier}`
        : null;
      const isDuplicate = nextKey !== null && previous.some((other) => (
        other.id !== id &&
        other.eventId === nextConfig.eventId &&
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

  // ===== 数据派生层 =====
  const cnEventName = eventMeta?.name.cn?.trim() || eventMeta?.name.jp.trim() || "Loading Event...";
  const bannerPath = eventMeta ? resolveBandoriEventAssetRegion(eventMeta) : "jp";
  const bannerAssetSegment = eventMeta ? resolveBandoriEventBannerBundleName(eventMeta.asset) : null;
  const bannerUrl = bannerAssetSegment
    ? buildBandoriEventBannerPublicUrl(bannerPath, bannerAssetSegment)
    : "";

  const { domainStart, domainEnd, cutoffEnd, midnights } = useChartDomain(trackingMode, startDate, endDate);
  const hasActualTrackerData = useMemo(
    () => chartData.some((point) => isActualTrackerPoint(point, domainStart, trackingMode, chartData.length)),
    [chartData, domainStart, trackingMode],
  );
  const fullProcessedData = useProcessedData(chartData, apiHasResult, domainStart, trackingMode);
  const status = useEventStatus(domainStart, domainEnd);
  const finalDisplayedData = useFinalDisplayedData(fullProcessedData, cutoffEnd, status, showInstantProjection, showDayProjection);
  const { comparisonLines } = useComparisonTrackerData({
    enabled: trackingMode === "event",
    configs: activeComparisonConfigs,
    events: allEvents,
    alignment: comparisonAlignment,
    currentStart: typeof domainStart === "number" ? domainStart : null,
    currentEnd: typeof domainEnd === "number" ? domainEnd : null,
  });
  const comparisonLineById = useMemo(
    () => new Map(comparisonLines.map((line) => [line.config.id, line])),
    [comparisonLines],
  );
  const displayedChartData = useMemo(
    () => mergeComparisonLines(finalDisplayedData, comparisonLines),
    [comparisonLines, finalDisplayedData],
  );
  const mainTooltipPointIndex = useMemo(
    () => buildMainTooltipPointIndex(finalDisplayedData),
    [finalDisplayedData],
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
      payload = [{ dataKey: mainPoint.isProjection ? "instantEp" : "ep", payload: payloadPoint }];
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
  const hasRenderableChartData = hasActualTrackerData || comparisonLines.some((line) => line.points.length > 0);
  const scoreData = useMemo(
    () => fullProcessedData.filter((point) => isActualTrackerPoint(point, domainStart, trackingMode, fullProcessedData.length)),
    [domainStart, fullProcessedData, trackingMode],
  );
  const holidayLookup = useMemo(() => buildChinaMainlandHolidayLookup(holidayData), [holidayData]);
  const nonWorkingDayBands = useMemo(
    () => buildNonWorkingDayBands(domainStart, domainEnd, holidayLookup),
    [domainEnd, domainStart, holidayLookup],
  );
  const zoomWidthMultiplier = ZOOM_WIDTH_MULTIPLIERS[zoomIndex];
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

  const updateTooltipPosition = useCallback(() => {
    const currentHoverTooltip = hoverTooltipRef.current;
    if (!currentHoverTooltip?.active || !chartViewportRef.current || !tooltipRef.current || !scrollContainerRef.current) {
      return;
    }

    const container = chartViewportRef.current;
    const viewport = scrollContainerRef.current;
    const tooltip = tooltipRef.current;
    const containerHeight = container.clientHeight;
    const tooltipWidth = tooltip.offsetWidth;
    const tooltipHeight = tooltip.offsetHeight;
    const visibleLeft = viewport.scrollLeft;
    const visibleRight = viewport.scrollLeft + viewport.clientWidth;

    let left = currentHoverTooltip.coordinate.x + TOOLTIP_OFFSET;
    if (left + tooltipWidth > visibleRight - TOOLTIP_EDGE_PADDING) {
      left = currentHoverTooltip.coordinate.x - tooltipWidth - TOOLTIP_OFFSET;
    }
    left = Math.max(
      visibleLeft + TOOLTIP_EDGE_PADDING,
      Math.min(left, visibleRight - tooltipWidth - TOOLTIP_EDGE_PADDING),
    );

    let top = currentHoverTooltip.coordinate.y - tooltipHeight / 2;
    top = Math.max(TOOLTIP_EDGE_PADDING, Math.min(top, containerHeight - tooltipHeight - TOOLTIP_EDGE_PADDING));

    tooltip.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
  }, []);

  const scheduleTooltipPositionUpdate = useCallback(() => {
    if (tooltipAnimationFrameRef.current !== null) {
      return;
    }

    tooltipAnimationFrameRef.current = requestAnimationFrame(() => {
      tooltipAnimationFrameRef.current = null;
      updateTooltipPosition();
    });
  }, [updateTooltipPosition]);

  const flushTooltipPositionUpdate = useCallback(() => {
    if (tooltipAnimationFrameRef.current !== null) {
      cancelAnimationFrame(tooltipAnimationFrameRef.current);
      tooltipAnimationFrameRef.current = null;
    }

    updateTooltipPosition();
  }, [updateTooltipPosition]);

  // ===== 图表容器尺寸变化时默认将视角聚焦到最新真实数据点附近 =====
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
      if (tooltipAnimationFrameRef.current !== null) {
        cancelAnimationFrame(tooltipAnimationFrameRef.current);
        tooltipAnimationFrameRef.current = null;
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
    if (!hoverTooltip?.active) {
      return;
    }

    // 悬浮内容切换为更宽的投影提示时，需要在首帧绘制前同步重算尺寸与位置，
    // 否则绝对定位元素会先按旧宽度发生 shrink-to-fit 换行。
    flushTooltipPositionUpdate();
    scheduleTooltipPositionUpdate();
  }, [flushTooltipPositionUpdate, hoverTooltip, zoomWidthMultiplier, scheduleTooltipPositionUpdate]);

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

    window.addEventListener("resize", updateModeIndicator);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateModeIndicator);
    };
  }, [trackingMode, updateModeIndicator]);

  const { ticks: yTicks, domain: yDomainInfo } = useMemo(
    () => generateYTicks(displayedChartData),
    [displayedChartData],
  );
  const comparisonChartKey = comparisonConfigs.map((config) => `${config.eventId}:${config.tier}`).join(",");
  const chartContainerKey = `${resolvedCurrentEventId ?? "none"}-${trackingMode}-${selectedTier}-${resolvedSelectedSongId}-${comparisonChartKey}-${comparisonAlignment}-${chartRenderRevision}`;

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
    <BandoriPageShell>

        {/* ========== 页头：活动名称、切换器、活动横幅 ========== */}
        <BandoriEventSwitcher
          title={cnEventName}
          events={allEvents}
          selectedEventId={resolvedCurrentEventId ? String(resolvedCurrentEventId) : ""}
          onSelectedEventIdChange={(eventId) => setCurrentEventId(parseInt(eventId, 10))}
          bannerUrl={bannerUrl}
          startText={startDate ? `${formatBandoriCnDateTime(startDate)} (CN)` : null}
          endText={endDate ? `${formatBandoriCnDateTime(endDate)} (CN)` : null}
          recommendedEventId={recommendedEventId !== null ? String(recommendedEventId) : null}
          recommendedLabel="最新活动"
        />

        {/* ========== 进度条 ========== */}
        {startDate && endDate && <EventProgressBar startDate={startDate} endDate={endDate} />}

        {/* ========== 导航与控制区 ========== */}
        <div className="rounded-3xl border border-[#ffe16c]/82 bg-[#fff9d7]/86 p-3 shadow-[0_24px_60px_rgba(232,176,0,0.14),0_4px_18px_rgba(88,69,0,0.07)] dark:border-gray-800 dark:bg-[#131A2B]/94 sm:p-6">
          <Tabs.Root
            value={trackingMode}
            onValueChange={handleTrackingModeChange}
            className="w-full flex flex-col gap-3.5 sm:gap-4"
          >
            <div className="flex flex-col gap-3.5 items-stretch xl:flex-row xl:items-start xl:gap-4">
              {/* 追踪模式切换 */}
              <Tabs.List
                ref={modeTabsListRef}
                className="relative flex w-full flex-row justify-center gap-1 overflow-x-auto rounded-[20px] border border-white/70 bg-white/65 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-gray-800/70 dark:bg-[#0F1728]/84 xl:w-[7.1rem] xl:flex-none xl:flex-col xl:self-start xl:overflow-visible"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 top-0 z-0 rounded-[16px] bg-white shadow-[0_8px_18px_rgba(59,130,246,0.14)] ring-1 ring-blue-100 transition-[transform,width,height,opacity] duration-300 ease-out dark:bg-[#182133] dark:ring-blue-500/20"
                  style={{
                    width: `${modeIndicatorStyle.width}px`,
                    height: `${modeIndicatorStyle.height}px`,
                    transform: `translate(${modeIndicatorStyle.x}px, ${modeIndicatorStyle.y}px)`,
                    opacity: modeIndicatorStyle.ready ? 1 : 0,
                  }}
                />
                {([
                  { id: "event", label: "活动排行" },
                  { id: "song", label: "歌曲排行" },
                  { id: "monthly", label: "月度排行" },
                ] as const).map((mode) => (
                  <Tabs.Trigger
                    key={mode.id}
                    ref={(node) => {
                      modeTriggerRefs.current[mode.id] = node;
                    }}
                    value={mode.id}
                    className="relative z-10 min-h-[2.85rem] flex-1 rounded-[16px] px-3 py-1.5 text-[14px] font-semibold tracking-[0.01em] text-center whitespace-nowrap transition-colors duration-300
                      data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-300
                      data-[state=inactive]:text-gray-500 hover:text-gray-700 dark:data-[state=inactive]:text-gray-400 dark:hover:text-gray-200 xl:flex-none"
                  >
                    {mode.label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              <div className="flex-1 min-w-0 flex flex-col gap-3 xl:max-w-[41rem] xl:mx-auto">
                {trackingMode === "song" && availableChallengeSongIds.length > 0 && (
                  <div className="overflow-visible rounded-none border border-transparent bg-transparent p-2 sm:p-2.5 shadow-none">
                    <div className="mb-2 px-1 text-xs font-bold tracking-[0.1em] text-blue-500/85 dark:text-blue-300/85 sm:text-[13px]">
                      挑战曲目
                    </div>
                    <div className={`grid w-full gap-2 sm:gap-2.5 ${challengeSongGridClassName}`}>
                      {availableChallengeSongIds.map(songId => {
                        const songLabel = challengeSongTitleMap?.[String(songId)] ?? `曲目 ${songId}`;

                        return (
                          <button
                            key={songId}
                            type="button"
                            onClick={() => setSelectedSongId(songId)}
                            title={`曲目 ${songId}`}
                            className={`group relative flex min-h-[2.75rem] w-full items-center justify-center overflow-hidden rounded-[17px] border px-3 py-1.5 text-center transition-all duration-300 sm:min-h-[3.35rem] sm:px-3.5 sm:py-2 ${
                              resolvedSelectedSongId === songId
                                ? "border-blue-500 bg-blue-600 text-white shadow-[0_10px_20px_rgba(37,99,235,0.2)] ring-2 ring-blue-500/85 ring-offset-2 ring-offset-white dark:ring-offset-[#131A2B]"
                                : "border-slate-300/90 bg-slate-50 text-slate-800 shadow-[0_6px_16px_rgba(15,23,42,0.06)] hover:border-blue-300 hover:bg-white hover:text-blue-700 hover:shadow-[0_10px_24px_rgba(59,130,246,0.14)] dark:border-slate-600/80 dark:bg-[#1B2436] dark:text-slate-100 dark:hover:border-blue-400/45 dark:hover:text-blue-200"
                            }`}
                          >
                            <span className="eventtracker-song-button-label text-[13px] font-semibold tracking-[0.005em] sm:text-sm">
                              {songLabel}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 排名档位选择 */}
                <div className="overflow-visible rounded-none border border-transparent bg-transparent p-2 sm:p-2.5 shadow-none">
                  <div className="mb-2 px-1 text-xs font-bold tracking-[0.1em] text-blue-500/85 dark:text-blue-300/85 sm:text-[13px]">
                    选择排名
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {getTiersForMode(trackingMode).map(tier => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setSelectedTier(tier)}
                        className={`h-8 min-w-[2.9rem] rounded-[12px] border px-2 text-[11px] font-semibold tracking-[0.01em] transition-all duration-300 sm:h-9 sm:min-w-[3.15rem] sm:rounded-[14px] sm:px-2.5 sm:text-[12px] ${
                          selectedTier === tier
                            ? "border-blue-500 bg-blue-600 text-white shadow-[0_8px_18px_rgba(37,99,235,0.2)] ring-2 ring-blue-500/85 ring-offset-2 ring-offset-white dark:ring-offset-[#131A2B]"
                            : "border-slate-300/90 bg-slate-50 text-slate-700 shadow-[0_4px_12px_rgba(15,23,42,0.06)] hover:border-blue-300 hover:bg-white hover:text-blue-700 hover:shadow-[0_8px_18px_rgba(59,130,246,0.14)] dark:border-slate-600/80 dark:bg-[#1B2436] dark:text-slate-100 dark:hover:border-blue-400/45 dark:hover:text-blue-200"
                        }`}
                      >
                        T{tier}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 状态信息面板 */}
              <div className="flex min-w-[280px] flex-col justify-center divide-y divide-gray-200 rounded-none border border-transparent bg-transparent px-2 py-2 shadow-none dark:divide-gray-800 sm:px-2.5 sm:py-2.5 xl:w-[17.25rem] xl:flex-shrink-0">
                <div className="flex justify-between items-center p-4">
                  <span className="text-base font-bold text-gray-500 dark:text-gray-400">活动状态</span>
                  <span className={`text-base font-bold tracking-wider ${status === "进行中" ? "text-green-500" : status === "已结束" ? "text-gray-500" : "text-blue-500"}`}>
                    {status}
                  </span>
                </div>
                {status === "进行中" && (
                  <>
                    <div className="flex justify-between items-center p-4">
                      <span className="text-base text-gray-500 dark:text-gray-400">最新分数</span>
                      <span className="text-base font-bold text-blue-500">
                        {scoreSummary.latestScore !== null ? new Intl.NumberFormat().format(scoreSummary.latestScore) : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-4">
                      <span className="text-base text-gray-500 dark:text-gray-400">更新时间</span>
                      {scoreSummary.latestUpdateTime !== null
                        ? <MinutesAgo timestamp={scoreSummary.latestUpdateTime} />
                        : <span className="text-base font-medium text-gray-600 dark:text-gray-300">-</span>
                      }
                    </div>
                  </>
                )}
                {status === "已结束" && (
                  <>
                    <div className="flex justify-between items-center p-4">
                      <span className="text-base text-gray-500 dark:text-gray-400">结束分数</span>
                      <span className="text-base font-bold text-gray-700 dark:text-gray-300">
                        {scoreSummary.endScore !== null ? new Intl.NumberFormat().format(scoreSummary.endScore) : "结算中"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-4">
                      <span className="text-base text-gray-500 dark:text-gray-400">最终分数</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-base font-bold text-gray-700 dark:text-gray-300">
                          {scoreSummary.finalScore !== null ? new Intl.NumberFormat().format(scoreSummary.finalScore) : "结算中"}
                        </span>
                        {scoreSummary.finalScore !== null && scoreSummary.endScore !== null && scoreSummary.finalScore < scoreSummary.endScore && (
                          <span className="text-sm font-bold text-red-500">
                            (-{new Intl.NumberFormat().format(scoreSummary.endScore - scoreSummary.finalScore)})
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ========== 图表区域 ========== */}
            <Tabs.Content value={trackingMode} className="outline-none focus:outline-none w-full animate-in fade-in zoom-in-95 duration-500">
              <div className="mt-2 relative bg-[#F9FBFC] dark:bg-[#0C111C] p-1 sm:p-4 rounded-2xl border border-gray-100 dark:border-gray-800/60 shadow-inner">

                {loading && (
                  <div className="absolute inset-0 bg-white/75 dark:bg-[#0C111C]/75 z-30 flex items-center justify-center rounded-2xl">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <p className="mt-4 text-sm font-semibold text-blue-600 animate-pulse">正在获取最新数据...</p>
                    </div>
                  </div>
                )}

                <div className="h-[400px] w-full relative group">
                  {hasRenderableChartData && displayedChartData.length > 0 ? (
                    <div className="flex h-full w-full overflow-hidden rounded-xl">
                      <FixedYAxis
                        ticks={yTicks}
                        domain={yDomainInfo}
                        chartHeight={chartViewportHeight}
                        axisWidth={FIXED_Y_AXIS_WIDTH}
                        topMargin={CHART_MARGIN.top}
                        bottomMargin={CHART_MARGIN.bottom}
                        xAxisHeight={X_AXIS_HEIGHT}
                      />

                      <div
                        ref={scrollContainerRef}
                        className="min-w-0 flex-1 h-full overflow-x-auto overflow-y-hidden styling-scrollbar relative"
                      >
                        <div style={{ minWidth: `${zoomWidthMultiplier * 100}%`, height: "100%", transition: "min-width 0.3s ease-out" }}>
                          <div ref={chartViewportRef} className="relative h-full overflow-hidden">
                            <ResponsiveContainer key={chartContainerKey} width="100%" height="100%">
                              <LineChart
                                data={displayedChartData}
                                margin={CHART_MARGIN}
                                onMouseMove={(state: TrackerMouseState) => {
                                  const nextHoverTooltip = buildHoverTooltip(state);

                                  if (!nextHoverTooltip) {
                                    hoverTooltipRef.current = null;
                                    setHoverTooltip((previous) => previous === null ? previous : null);
                                    return;
                                  }

                                  hoverTooltipRef.current = nextHoverTooltip;
                                  scheduleTooltipPositionUpdate();

                                  setHoverTooltip((previous) => {
                                    if (
                                      previous?.active &&
                                      previous.signature === nextHoverTooltip.signature
                                    ) {
                                      return previous;
                                    }

                                    return nextHoverTooltip;
                                  });
                                }}
                                onMouseLeave={() => {
                                  hoverTooltipRef.current = null;
                                  setHoverTooltip((previous) => previous === null ? previous : null);
                                }}
                              >
                              {nonWorkingDayBands.map((band) => (
                                <ReferenceArea
                                  key={band.key}
                                  x1={band.start}
                                  x2={band.end}
                                  fill="#FFD966"
                                  fillOpacity={0.7}
                                  strokeOpacity={0}
                                  ifOverflow="extendDomain"
                                />
                              ))}

                              <YAxis
                                hide
                                width={0}
                                ticks={yTicks}
                                type="number"
                                domain={yDomainInfo}
                              />

                              <CartesianGrid vertical={false} stroke="#374151" opacity={0.15} />

                              {midnights.map(m => (
                                <ReferenceLine key={m} x={m} stroke="#D1D5DB" opacity={0.6} />
                              ))}

                              <XAxis
                                dataKey="time"
                                domain={[domainStart, domainEnd]}
                                type="number"
                                ticks={midnights}
                                height={X_AXIS_HEIGHT}
                                tickFormatter={(unixTime) => format(unixTime, "MM/dd")}
                                stroke="#6B7280"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                dy={10}
                              />
                              <Tooltip
                                content={() => null}
                                wrapperStyle={{ display: "none" }}
                                cursor={{ stroke: "#9CA3AF", strokeWidth: 1, strokeDasharray: "4 4" }}
                                isAnimationActive={false}
                              />
                              {showInstantProjection && (
                                <Line
                                  type="linear"
                                  dataKey="instantEp"
                                  stroke="#ef4444"
                                  strokeWidth={2}
                                  strokeDasharray="6 4"
                                  dot={(props: TrackerDotProps) => {
                                    const { cx, cy, payload, index } = props;
                                    if (!payload?.isProjection || isInvalidMarkerPosition(cx, cy)) {
                                      return renderHiddenMarker(`dot-hidden-instant-${index}`);
                                    }
                                    return (
                                      <circle
                                        key={`dot-instant-${index}`}
                                        cx={cx}
                                        cy={cy}
                                        r={isMainPointActive(hoverTooltip, payload) ? 6 : 2.5}
                                        fill="#ef4444"
                                        stroke="none"
                                      />
                                    );
                                  }}
                                  activeDot={(props: TrackerDotProps) => {
                                    const { cx, cy, payload } = props;
                                    if (!payload?.isProjection || isInvalidMarkerPosition(cx, cy)) return renderHiddenMarker();
                                    return <circle cx={cx} cy={cy} r={6} fill="#ef4444" stroke="none" />;
                                  }}
                                  connectNulls
                                  isAnimationActive={false}
                                />
                              )}
                              <Line
                                type="linear"
                                dataKey="ep"
                                stroke="#3B82F6"
                                strokeWidth={2}
                                strokeOpacity={0.6}
                                dot={(props: TrackerDotProps) => {
                                  const { cx, cy, payload, index } = props;
                                  if (payload?.isProjection || isInvalidMarkerPosition(cx, cy)) {
                                    return renderHiddenMarker(`dot-hidden-main-${index}`);
                                  }

                                  return (
                                    <circle
                                      key={`dot-main-${index}`}
                                      cx={cx}
                                      cy={cy}
                                      r={isMainPointActive(hoverTooltip, payload) ? 6 : 2.5}
                                      fill="#3B82F6"
                                      stroke="none"
                                    />
                                  );
                                }}
                                activeDot={(props: TrackerDotProps) => {
                                  const { cx, cy, payload } = props;
                                  if (payload?.isProjection || isInvalidMarkerPosition(cx, cy)) return renderHiddenMarker();
                                  return <circle cx={cx} cy={cy} r={6} fill="#3B82F6" stroke="none" />;
                                }}
                                connectNulls
                                isAnimationActive={false}
                              />

                              {comparisonLines.map((line) => (
                                line.points.length > 0 ? (
                                  <Line
                                    key={line.dataKey}
                                    type="linear"
                                    dataKey={line.dataKey}
                                    stroke={line.color}
                                    strokeWidth={2}
                                    strokeOpacity={0.82}
                                    strokeDasharray="5 4"
                                    dot={(props: TrackerDotProps) => {
                                      const { cx, cy, payload, index } = props;
                                      const point = payload?.comparisonPoints?.[line.dataKey] as ComparisonLinePoint | undefined;
                                      if (
                                        !isComparisonPointActive(hoverTooltip, line.dataKey, point) ||
                                        isInvalidMarkerPosition(cx, cy)
                                      ) {
                                        return renderHiddenMarker(`dot-hidden-${line.dataKey}-${index}`);
                                      }

                                      return <circle key={`dot-${line.dataKey}-${index}`} cx={cx} cy={cy} r={5.5} fill={line.color} stroke="none" />;
                                    }}
                                    activeDot={(props: TrackerDotProps) => {
                                      const { cx, cy, payload } = props;
                                      if (!payload?.comparisonPoints?.[line.dataKey] || isInvalidMarkerPosition(cx, cy)) return renderHiddenMarker();
                                      return <circle cx={cx} cy={cy} r={5.5} fill={line.color} stroke="none" />;
                                    }}
                                    connectNulls
                                    isAnimationActive={false}
                                  />
                                ) : null
                              ))}

                              {showDayProjection && (
                                <Line
                                  type="linear"
                                  dataKey="dayEp"
                                  stroke="#3b82f6"
                                  strokeWidth={2}
                                  strokeDasharray="6 4"
                                  dot={(props: TrackerDotProps) => {
                                    const { cx, cy, payload, index } = props;
                                    if (!payload?.isProjection || isInvalidMarkerPosition(cx, cy)) {
                                      return renderHiddenMarker(`dot-hidden-day-${index}`);
                                    }
                                    return (
                                      <circle
                                        key={`dot-day-${index}`}
                                        cx={cx}
                                        cy={cy}
                                        r={isMainPointActive(hoverTooltip, payload) ? 6 : 2.5}
                                        fill="#3b82f6"
                                        stroke="none"
                                      />
                                    );
                                  }}
                                  activeDot={(props: TrackerDotProps) => {
                                    const { cx, cy, payload } = props;
                                    if (!payload?.isProjection || isInvalidMarkerPosition(cx, cy)) return renderHiddenMarker();
                                    return <circle cx={cx} cy={cy} r={6} fill="#3b82f6" stroke="none" />;
                                  }}
                                  connectNulls
                                  isAnimationActive={false}
                                />
                              )}
                              </LineChart>
                            </ResponsiveContainer>
                            <div
                              ref={tooltipRef}
                              className="pointer-events-none absolute left-0 top-0 z-20 transform-gpu transition-opacity duration-75 will-change-transform"
                              style={{
                                opacity: hoverTooltip?.active && hoverTooltip.payload?.length ? 1 : 0,
                                transform: "translate3d(0, 0, 0)",
                                visibility: hoverTooltip?.active && hoverTooltip.payload?.length ? "visible" : "hidden",
                              }}
                            >
                              {hoverTooltip?.active && hoverTooltip.payload?.length ? (
                                <TrackerTooltip
                                  active={hoverTooltip.active}
                                  payload={hoverTooltip.payload}
                                  label={hoverTooltip.label}
                                  trackingMode={trackingMode}
                                  displayedData={displayedChartData}
                                />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400">
                          {loading ? null : (
                            <>
                              <svg className="w-16 h-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                              </svg>
                              <p>暂无该排名档位的追踪数据</p>
                            </>
                          )}
                        </div>
                      )}

                  {/* 缩放控制浮层 */}
                  <div className="absolute top-[70%] right-4 -translate-y-1/2 flex flex-col gap-2 z-20 transition-opacity opacity-70 hover:opacity-100 mix-blend-difference dark:mix-blend-normal">
                    <button
                      onClick={() => startTransition(() => setZoomIndex(prev => Math.min(ZOOM_WIDTH_MULTIPLIERS.length - 1, prev + 1)))}
                      className={`p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 rounded-full transition-transform hover:scale-110 active:scale-95 bg-white/72 dark:bg-black/45 ${zoomIndex >= ZOOM_WIDTH_MULTIPLIERS.length - 1 ? "invisible pointer-events-none" : ""}`}
                      disabled={zoomIndex >= ZOOM_WIDTH_MULTIPLIERS.length - 1}
                      title="放大"
                    >
                      <ZoomIn size={22} strokeWidth={2.5} />
                    </button>
                    <button
                      onClick={() => startTransition(() => setZoomIndex(prev => Math.max(0, prev - 1)))}
                      className={`p-1.5 rounded-full transition-transform hover:scale-110 active:scale-95 bg-white/72 dark:bg-black/45 ${zoomIndex <= 0 ? "invisible pointer-events-none" : "text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400"}`}
                      disabled={zoomIndex <= 0}
                      title="缩小"
                    >
                      <ZoomOut size={22} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>

                {/* 投影与对比开关 */}
                {trackingMode === "event" && (
                  <div className="px-1 pt-4 sm:px-2">
                    <div className="flex flex-col items-center gap-3.5">
                      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                        {status === "进行中" && (
                          <>
                            <button
                              type="button"
                              aria-pressed={showInstantProjection}
                              onClick={() => setShowInstantProjection(prev => !prev)}
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs sm:text-sm font-semibold transition-all ${
                                showInstantProjection
                                  ? "border-red-300 bg-red-50 text-red-600 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-300"
                                  : "border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-400"
                              }`}
                            >
                              <span className={`h-2.5 w-2.5 rounded-full ${showInstantProjection ? "bg-red-500" : "bg-gray-300 dark:bg-gray-600"}`} />
                              线性投影（瞬时）
                            </button>

                            <button
                              type="button"
                              aria-pressed={showDayProjection}
                              onClick={() => setShowDayProjection(prev => !prev)}
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs sm:text-sm font-semibold transition-all ${
                                showDayProjection
                                  ? "border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300"
                                  : "border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-400"
                              }`}
                            >
                              <span className={`h-2.5 w-2.5 rounded-full ${showDayProjection ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"}`} />
                              线性投影（24h）
                            </button>
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                        {resolvedComparisonConfigs.map((config) => {
                          const line = comparisonLineById.get(config.id);
                          const color = line?.color ?? COMPARISON_LINE_COLORS[(config.colorIndex ?? 0) % COMPARISON_LINE_COLORS.length];
                          const label = `${config.eventId}期 T${config.tier}`;
                          const statusLabel = config.enabled ? getComparisonStatusLabel(line?.status ?? "loading") : "隐藏";

                          return (
                            <button
                              key={config.id}
                              type="button"
                              aria-pressed={config.enabled}
                              onClick={() => handleToggleComparison(config.id)}
                              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all sm:text-sm ${
                                config.enabled
                                  ? "text-gray-700 shadow-sm dark:text-gray-200"
                                  : "border-gray-200 bg-white text-gray-400 dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-500"
                              }`}
                              style={config.enabled ? {
                                borderColor: `${color}66`,
                                backgroundColor: `${color}14`,
                              } : undefined}
                              title={`${label}: ${statusLabel}`}
                            >
                              <span
                                className={`h-2.5 w-2.5 rounded-full ${config.enabled ? "" : "opacity-35"}`}
                                style={{ backgroundColor: color }}
                              />
                              <span>{label}</span>
                              <span className="text-[11px] text-gray-400 dark:text-gray-500">{statusLabel}</span>
                            </button>
                          );
                        })}

                        {resolvedComparisonConfigs.length > 0 && (
                          <div className="inline-flex overflow-hidden rounded-full border border-gray-200 bg-white text-xs font-semibold shadow-sm dark:border-gray-700 dark:bg-[#131A2B] sm:text-sm">
                          <button
                            type="button"
                            aria-pressed={comparisonAlignment === "start"}
                            onClick={() => setComparisonAlignment("start")}
                            className={`px-3 py-1.5 transition-colors ${
                              comparisonAlignment === "start"
                                ? "bg-blue-600 text-white"
                                : "text-gray-500 hover:bg-blue-50 hover:text-blue-600 dark:text-gray-400 dark:hover:bg-blue-500/10"
                            }`}
                          >
                            左对齐
                          </button>
                          <button
                            type="button"
                            aria-pressed={comparisonAlignment === "end"}
                            onClick={() => setComparisonAlignment("end")}
                            className={`px-3 py-1.5 transition-colors ${
                              comparisonAlignment === "end"
                                ? "bg-blue-600 text-white"
                                : "text-gray-500 hover:bg-blue-50 hover:text-blue-600 dark:text-gray-400 dark:hover:bg-blue-500/10"
                            }`}
                          >
                            右对齐
                          </button>
                          </div>
                        )}
                      </div>

                      <div className="flex w-full flex-col items-center gap-2">
                        {comparisonConfigs.map((config) => (
                          <div key={config.id} className="flex max-w-full flex-wrap items-center justify-center gap-2">
                            <select
                              className="h-8 min-w-[13rem] rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 outline-none transition-colors hover:border-blue-300 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-300 sm:h-9 sm:text-sm"
                              value={config.eventId ?? ""}
                              onChange={(event) => {
                                const nextEventId = event.target.value ? Number(event.target.value) : null;
                                handleUpdateComparison(config.id, { eventId: nextEventId });
                              }}
                            >
                              {comparisonEventOptions.map((event) => (
                                <option key={event.id} value={event.id}>
                                  {event.id}期: {event.name}
                                </option>
                              ))}
                            </select>

                            <select
                              className="h-8 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-600 outline-none transition-colors hover:border-blue-300 focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-300 sm:h-9 sm:text-sm"
                              value={config.tier ?? ""}
                              onChange={(event) => {
                                const nextTier = event.target.value ? Number(event.target.value) : null;
                                handleUpdateComparison(config.id, { tier: nextTier });
                              }}
                            >
                              {EVENT_TIERS.map((tier) => (
                                <option key={tier} value={tier}>
                                  T{tier}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              onClick={() => handleRemoveComparison(config.id)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-400 dark:hover:border-red-500/30 dark:hover:bg-red-500/10 dark:hover:text-red-300 sm:h-9 sm:text-sm"
                              aria-label="移除对比行"
                            >
                              <X size={13} />
                              移除
                            </button>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={handleAddComparison}
                          disabled={!canAddComparisonRow}
                          title={comparisonConfigs.length >= MAX_COMPARISON_LINES ? "最多添加 5 条对比线" : "添加一条空白对比线"}
                          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 transition-all hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-white disabled:text-gray-300 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300 dark:disabled:border-gray-700 dark:disabled:bg-[#131A2B] dark:disabled:text-gray-500 sm:h-9 sm:text-sm"
                        >
                          <Plus size={15} />
                          添加对比
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </div>
    </BandoriPageShell>
  );
}
