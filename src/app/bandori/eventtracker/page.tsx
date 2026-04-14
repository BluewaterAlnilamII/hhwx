"use client";

import { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from "react";
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
import { ZoomIn, ZoomOut, Search, History, X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

import { useCachedFetch } from "@/hooks/useCachedFetch";
import {
  buildBandoriEventBannerProxyPath,
  resolveBandoriEventBannerBundleName,
} from "@/lib/bandori-asset-proxy";
import type { MinimalEvent, TrackingMode } from "./types";
import {
  INSTANT_PROJECTION_STORAGE_KEY,
  DAY_PROJECTION_STORAGE_KEY,
  getTiersForMode,
  readProjectionPreference,
  writeProjectionPreference,
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
const FIXED_Y_AXIS_WIDTH = 38;
const CHART_MARGIN = { top: 20, right: 5, left: 0, bottom: 20 } as const;
const X_AXIS_HEIGHT = 30;

type HoverTooltipState = {
  active: boolean;
  coordinate: { x: number; y: number };
  label?: number;
  payload?: any[];
};

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

  const progress = Math.min(100, Math.max(0, ((now - startDate) / (endDate - startDate)) * 100));
  const remainingMs = endDate - now;

  const timeRemaining = () => {
    if (remainingMs <= 0) return <span>活动已结束</span>;
    const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
    return (
      <>
        距结束
        <span className="text-blue-500">{days}</span>天
        <span className="text-blue-500">{hours}</span>小时
        <span className="text-blue-500">{minutes}</span>分
        <span className="text-blue-500">{seconds}</span>秒
      </>
    );
  };

  return (
    <div className="bg-white dark:bg-[#131A2B] rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
      <div className="flex justify-between text-sm font-semibold mb-2">
        <span className="text-blue-500 font-bold">活动进度</span>
        <span>
          <span className="text-blue-500">{progress.toFixed(1)}%</span>已完成 {timeRemaining()}
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

  const [zoomIndex, setZoomIndex] = useState(0);
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
  const { allEvents, eventMeta, startDate, endDate, chartData, holidayData, loading, apiHasResult } = useTrackerData(
    currentEventId,
    trackingMode,
    selectedTier,
    selectedSongId,
  );

  // ===== 投影偏好持久化 =====
  const [showInstantProjection, setShowInstantProjection] = useState(true);
  const [showDayProjection, setShowDayProjection] = useState(true);
  const [projectionPrefLoaded, setProjectionPrefLoaded] = useState(false);

  useEffect(() => {
    const instantPref = readProjectionPreference(INSTANT_PROJECTION_STORAGE_KEY);
    const dayPref = readProjectionPreference(DAY_PROJECTION_STORAGE_KEY);
    if (instantPref !== null) setShowInstantProjection(instantPref);
    if (dayPref !== null) setShowDayProjection(dayPref);
    setProjectionPrefLoaded(true);
  }, []);

  useEffect(() => {
    if (!projectionPrefLoaded) return;
    writeProjectionPreference(INSTANT_PROJECTION_STORAGE_KEY, showInstantProjection);
  }, [projectionPrefLoaded, showInstantProjection]);

  useEffect(() => {
    if (!projectionPrefLoaded) return;
    writeProjectionPreference(DAY_PROJECTION_STORAGE_KEY, showDayProjection);
  }, [projectionPrefLoaded, showDayProjection]);

  // ===== 活动列表首次加载后自动选择当前活动（仅执行一次） =====
  const autoSelectDoneRef = useRef(false);
  useEffect(() => {
    if (allEvents.length === 0 || autoSelectDoneRef.current) return;
    const best = findBestEvent(allEvents);
    if (best) {
      setCurrentEventId(best.id);
      autoSelectDoneRef.current = true;
    }
  }, [allEvents]);

  /**
   * 自动选择活动的优先级策略：
   * 1. 进行中的活动 —— 用户最可能关注正在进行的活动
   * 2. 最近即将开始（ID 最小的未来活动） —— 活动尚未开始时提前展示
   * 3. 最近结束（ID 最大的已结束活动） —— 所有活动都结束时展示最近的
   */
  const findBestEvent = useCallback((events: MinimalEvent[]): MinimalEvent | null => {
    const now = Date.now();
    const ongoing = events.find(ev => ev.startAt !== null && ev.endAt !== null && now >= ev.startAt && now <= ev.endAt);
    if (ongoing) return ongoing;
    const upcoming = events
      .filter(ev => ev.startAt === null || ev.startAt > now)
      .sort((a, b) => a.id - b.id);
    if (upcoming.length > 0) return upcoming[0];
    const finished = events
      .filter(ev => ev.endAt !== null && ev.endAt < now)
      .sort((a, b) => b.id - a.id);
    if (finished.length > 0) return finished[0];
    return null;
  }, []);

  const jumpToLatest = () => {
    if (allEvents.length === 0) return;
    const best = findBestEvent(allEvents);
    if (best) setCurrentEventId(best.id);
  };

  // 切换追踪模式时重置缩放，并将 tier 修正到目标模式的合法值
  useEffect(() => {
    setZoomIndex(0);
    const targetTiers = getTiersForMode(trackingMode);
    if (!targetTiers.includes(selectedTier)) {
      const validTiers = targetTiers.filter(t => t <= selectedTier);
      setSelectedTier(validTiers.length > 0 ? validTiers[validTiers.length - 1] : targetTiers[0]);
    }
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
    (data: any) => (data?.songs ?? {}) as Record<string, string>,
    { refreshOnVisible: false, staleTimeMs: 24 * 60 * 60 * 1000 },
  );

  useEffect(() => {
    if (trackingMode !== "song") {
      if (selectedSongId !== 0) {
        setSelectedSongId(0);
      }
      return;
    }

    if (eventMeta?.eventType !== "challenge" || availableChallengeSongIds.length === 0) {
      if (selectedSongId !== 0) {
        setSelectedSongId(0);
      }
      return;
    }

    if (!availableChallengeSongIds.includes(selectedSongId)) {
      setSelectedSongId(availableChallengeSongIds[0]);
    }
  }, [availableChallengeSongIds, eventMeta?.eventType, selectedSongId, trackingMode]);

  // ===== 数据派生层 =====
  const cnEventName = eventMeta?.name.cn?.trim() || eventMeta?.name.jp.trim() || "Loading Event...";
  const bannerPath = eventMeta?.name.cn?.trim() ? "cn" : "jp";
  const bannerAssetSegment = eventMeta ? resolveBandoriEventBannerBundleName(eventMeta.asset) : null;
  const bannerUrl = bannerAssetSegment
    ? buildBandoriEventBannerProxyPath(bannerPath, bannerAssetSegment)
    : "";

  const { domainStart, domainEnd, cutoffEnd, midnights } = useChartDomain(trackingMode, startDate, endDate);
  const fullProcessedData = useProcessedData(chartData, apiHasResult, domainStart, trackingMode);
  const status = useEventStatus(domainStart, domainEnd);
  const finalDisplayedData = useFinalDisplayedData(fullProcessedData, cutoffEnd, status, showInstantProjection, showDayProjection);
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

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
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
  }, [focusViewportNearLatestDataPoint, zoomWidthMultiplier, currentEventId, trackingMode, selectedTier, scheduleTooltipPositionUpdate, syncScrollbarMetrics]);

  useLayoutEffect(() => {
    if (!hoverTooltip?.active) {
      return;
    }
    scheduleTooltipPositionUpdate();
  }, [hoverTooltip, zoomWidthMultiplier, scheduleTooltipPositionUpdate]);

  const { ticks: yTicks, domain: yDomainInfo } = useMemo(
    () => generateYTicks(finalDisplayedData),
    [finalDisplayedData],
  );

  // ===== 分数摘要 =====
  const scoreSummary = useMemo(() => {
    let latestScore: number | null = null;
    let latestUpdateTime: number | null = null;
    let endScore: number | null = null;
    let finalScore: number | null = null;

    if (fullProcessedData.length > 0) {
      const latestPt = fullProcessedData[fullProcessedData.length - 1];
      latestScore = latestPt.ep;
      latestUpdateTime = latestPt.time;

      if (status === "已结束") {
        if (trackingMode === "monthly" && typeof domainEnd === "number") {
          const nextMonth1st0000 = domainEnd + 1;
          const nextMonth1st0015 = nextMonth1st0000 + 15 * 60 * 1000;
          endScore = getScoreAtTime(fullProcessedData, nextMonth1st0000);
          finalScore = getFinalScore(fullProcessedData) ?? getScoreAtTime(fullProcessedData, nextMonth1st0015);
        } else if (endDate) {
          const ed = new Date(endDate);
          const endDay2300 = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate(), 23, 0, 0).getTime();
          const endDay2315 = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate(), 23, 15, 0).getTime();
          endScore = getScoreAtTime(fullProcessedData, endDay2300);
          finalScore = getFinalScore(fullProcessedData) ?? getScoreAtTime(fullProcessedData, endDay2315);
        }
      }
    }

    return { latestScore, latestUpdateTime, endScore, finalScore };
  }, [fullProcessedData, status, trackingMode, domainEnd, endDate]);

  // ===== 活动搜索对话框 =====
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ===== 渲染 =====
  return (
    <div className="min-h-screen text-gray-800 dark:text-gray-100 p-2 sm:p-6 lg:p-10 font-sans relative z-10">
      <div className="max-w-5xl mx-auto space-y-4 lg:space-y-8 relative z-10">

        {/* ========== 页头：活动名称、切换器、活动横幅 ========== */}
        <div className="flex flex-col md:flex-row justify-between items-center bg-white dark:bg-[#131A2B] rounded-3xl shadow-xl shadow-blue-500/5 dark:shadow-blue-500/10 border border-gray-100 dark:border-gray-800 p-4 sm:p-8 relative z-20">
          <div className="flex-1 space-y-4">
            <h1 className="text-3xl font-extrabold text-[#f43f5e] block w-full">{cnEventName}</h1>

            {allEvents.length > 0 && (
              <div className="flex items-center gap-2">
                <select
                  className="bg-gray-100 dark:bg-[#0C111C] border border-gray-200 dark:border-gray-700/50 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-[#f43f5e] focus:outline-none cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors shadow-sm w-full max-w-[400px] text-ellipsis sm:min-w-[320px]"
                  value={currentEventId || ""}
                  onChange={(e) => setCurrentEventId(parseInt(e.target.value))}
                >
                  <option disabled value="">切换往期活动...</option>
                  {allEvents.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.id}期 : {ev.name}</option>
                  ))}
                </select>

                <button
                  onClick={jumpToLatest}
                  className="p-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all border border-blue-200/50 dark:border-blue-800/50 shadow-sm group flex-shrink-0"
                  title="最新活动"
                >
                  <History size={22} className="group-hover:rotate-[-45deg] transition-transform duration-500" />
                </button>

                <Dialog.Root open={isPickerOpen} onOpenChange={setIsPickerOpen}>
                  <Dialog.Trigger asChild>
                    <button
                      className="p-2.5 bg-gray-50 dark:bg-gray-900/50 text-gray-500 border border-gray-200 dark:border-gray-800 rounded-xl hover:text-blue-500 hover:border-blue-300 transition-all shadow-sm flex-shrink-0"
                      title="搜索活动"
                    >
                      <Search size={22} />
                    </button>
                  </Dialog.Trigger>

                  <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[100] animate-in fade-in duration-200" />
                    <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white dark:bg-[#131A2B] rounded-2xl shadow-2xl z-[101] flex flex-col overflow-hidden animate-in zoom-in-95 fade-in duration-200">
                      <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
                        <Dialog.Title className="text-xl font-bold text-gray-800 dark:text-white">选择活动</Dialog.Title>
                        <Dialog.Close asChild>
                          <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-400"><X size={22} /></button>
                        </Dialog.Close>
                      </div>

                      <div className="p-4 border-b border-gray-50 dark:border-gray-800/50 flex gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500" size={18} />
                          <input
                            autoFocus
                            type="text"
                            placeholder="搜索"
                            className="w-full bg-white dark:bg-[#0C111C] border border-blue-400 dark:border-blue-500 rounded px-10 py-1.5 shadow-[0_0_8px_rgba(59,130,246,0.3)] text-sm font-medium text-gray-700 dark:text-gray-200 outline-none"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
                          {searchQuery && (
                            <button
                              onClick={() => setSearchQuery("")}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 bg-gray-200 dark:bg-gray-800 rounded-md text-gray-500"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                        <Dialog.Close asChild>
                          <button className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-50 dark:hover:bg-gray-800">
                            <X size={18} />
                          </button>
                        </Dialog.Close>
                      </div>

                      <div className="flex-1 overflow-y-auto max-h-[60vh] py-2">
                        {allEvents
                          .filter(ev => !searchQuery || ev.name.toLowerCase().includes(searchQuery.toLowerCase()) || ev.id.toString().includes(searchQuery))
                          .map(ev => (
                            <button
                              key={ev.id}
                              onClick={() => { setCurrentEventId(ev.id); setIsPickerOpen(false); setSearchQuery(""); }}
                              className="w-full px-6 py-3.5 flex items-center justify-between hover:bg-blue-50/50 dark:hover:bg-blue-500/5 transition-colors group"
                            >
                              <span className={`text-sm font-bold ${ev.id === currentEventId ? "text-blue-500" : "text-gray-600 dark:text-gray-300"}`}>
                                {ev.id}期 : {ev.name}
                              </span>
                              <div className="flex gap-2">
                                {ev.hasCn && <span className="px-1.5 py-0.5 border border-gray-200 dark:border-gray-700 rounded text-[10px] font-bold text-gray-400 group-hover:text-blue-500 group-hover:border-blue-200 transition-colors">CN</span>}
                                {ev.hasJp && <span className="px-1.5 py-0.5 border border-gray-200 dark:border-gray-700 rounded text-[10px] font-bold text-gray-400 group-hover:text-blue-500 group-hover:border-blue-200 transition-colors">JP</span>}
                              </div>
                            </button>
                          ))}
                      </div>
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>
              </div>
            )}

            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {startDate && endDate ? (
                <>
                  <p>开始: {format(startDate, "MMM do yyyy, HH:mm")} (CN)</p>
                  <p>结束: {format(endDate, "MMM do yyyy, HH:mm")} (CN)</p>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex-1 pt-6 md:pt-0 flex justify-end">
            {bannerUrl ? (
              <img
                src={bannerUrl}
                alt="活动横幅"
                className="rounded-2xl shadow-lg ring-1 ring-black/5 hover:scale-105 transition-transform duration-500 max-h-[140px] object-cover"
              />
            ) : (
              <div className="w-[300px] h-[100px] bg-gray-200 dark:bg-gray-800 rounded-2xl animate-pulse" />
            )}
          </div>
        </div>

        {/* ========== 进度条 ========== */}
        {startDate && endDate && <EventProgressBar startDate={startDate} endDate={endDate} />}

        {/* ========== 导航与控制区 ========== */}
        <div className="bg-white/80 dark:bg-[#131A2B]/80 backdrop-blur-xl rounded-3xl p-3 sm:p-6 shadow-xl border border-white/20 dark:border-gray-800">
          <Tabs.Root
            value={trackingMode}
            onValueChange={(val: string) => setTrackingMode(val as TrackingMode)}
            className="w-full flex flex-col gap-4 sm:gap-6"
          >
            <div className="flex flex-col xl:flex-row gap-4 items-stretch">
              {/* 追踪模式切换 */}
              <Tabs.List className="flex flex-row xl:flex-col justify-center gap-1 sm:gap-2 p-1.5 sm:p-2 bg-gray-100/80 dark:bg-gray-900/50 rounded-2xl shadow-inner flex-shrink-0 overflow-x-auto">
                {([
                  { id: "event", label: "活动排行" },
                  { id: "song", label: "歌曲排行" },
                  { id: "monthly", label: "月度排行" },
                ] as const).map((mode) => (
                  <Tabs.Trigger
                    key={mode.id}
                    value={mode.id}
                    className="px-4 py-2 sm:px-6 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-300 whitespace-nowrap
                      data-[state=active]:bg-white data-[state=active]:dark:bg-gray-800
                      data-[state=active]:text-blue-600 data-[state=active]:dark:text-blue-400
                      data-[state=active]:shadow-md data-[state=inactive]:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 w-full text-center tracking-wide"
                  >
                    {mode.label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              <div className="flex-1 min-w-0 flex flex-col gap-4 xl:max-w-[42rem] xl:mx-auto">
                {trackingMode === "song" && availableChallengeSongIds.length > 0 && (
                  <div className="bg-gray-50/50 dark:bg-[#0C111C]/50 rounded-2xl p-3 sm:p-4 border border-gray-100 dark:border-gray-800/60 shadow-inner overflow-hidden flex flex-col justify-center">
                    <div
                      className="grid gap-2.5 sm:gap-3 w-full"
                      style={{
                        gridTemplateColumns: `repeat(${Math.min(Math.max(availableChallengeSongIds.length, 1), 3)}, minmax(0, 1fr))`,
                      }}
                    >
                      {availableChallengeSongIds.map(songId => (
                        <button
                          key={songId}
                          onClick={() => setSelectedSongId(songId)}
                          title={`song_id : ${songId}`}
                          className={`w-full min-w-0 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl text-xs sm:text-[13px] font-semibold text-center leading-snug transition-all duration-300 ${
                            selectedSongId === songId
                              ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 ring-2 ring-blue-600 ring-offset-2 dark:ring-offset-[#131A2B] scale-105"
                              : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:scale-105 border border-gray-200 dark:border-gray-700 shadow-sm"
                          }`}
                        >
                          {challengeSongTitleMap?.[String(songId)] ?? `曲目 ${songId}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 排名档位选择 */}
                <div className="bg-gray-50/50 dark:bg-[#0C111C]/50 rounded-2xl p-3 sm:p-4 border border-gray-100 dark:border-gray-800/60 shadow-inner overflow-hidden flex flex-col justify-center">
                  <div className="hidden xl:block text-xs sm:text-sm font-bold tracking-wider text-gray-400 mb-2 ml-1">选择排名</div>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {getTiersForMode(trackingMode).map(tier => (
                      <button
                        key={tier}
                        onClick={() => setSelectedTier(tier)}
                        className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-semibold transition-all duration-300 ${
                          selectedTier === tier
                            ? "bg-blue-600 text-white shadow-lg shadow-blue-500/30 ring-2 ring-blue-600 ring-offset-2 dark:ring-offset-[#131A2B] scale-105"
                            : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:scale-105 border border-gray-200 dark:border-gray-700 shadow-sm"
                        }`}
                      >
                        T{tier}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 状态信息面板 */}
              <div className="flex flex-col justify-center bg-gray-50 dark:bg-[#0C111C] rounded-2xl border border-gray-100 dark:border-gray-800/60 shadow-inner min-w-[280px] divide-y divide-gray-200 dark:divide-gray-800 flex-shrink-0">
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
                  <div className="absolute inset-0 bg-white/50 dark:bg-[#0C111C]/50 backdrop-blur-sm z-30 flex items-center justify-center rounded-2xl">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <p className="mt-4 text-sm font-semibold text-blue-600 animate-pulse">正在获取最新数据...</p>
                    </div>
                  </div>
                )}

                <div className="h-[400px] w-full relative group">
                  {finalDisplayedData.length > 0 ? (
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
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart
                                data={finalDisplayedData}
                                margin={CHART_MARGIN}
                                onMouseMove={(state: any) => {
                                  if (!state?.isTooltipActive || !state?.activeCoordinate || !state?.activePayload?.length) {
                                    hoverTooltipRef.current = null;
                                    setHoverTooltip(null);
                                    return;
                                  }

                                  const nextHoverTooltip = {
                                    active: true,
                                    coordinate: {
                                      x: state.activeCoordinate.x,
                                      y: state.activeCoordinate.y,
                                    },
                                    label: state.activeLabel,
                                    payload: state.activePayload,
                                  };

                                  hoverTooltipRef.current = nextHoverTooltip;
                                  scheduleTooltipPositionUpdate();

                                  setHoverTooltip((previous) => {
                                    if (
                                      previous?.active &&
                                      previous.label === nextHoverTooltip.label &&
                                      previous.payload?.[0]?.payload?.time === nextHoverTooltip.payload?.[0]?.payload?.time &&
                                      previous.payload?.[0]?.payload?.projectionType === nextHoverTooltip.payload?.[0]?.payload?.projectionType
                                    ) {
                                      return previous;
                                    }

                                    return nextHoverTooltip;
                                  });
                                }}
                                onMouseLeave={() => {
                                  hoverTooltipRef.current = null;
                                  setHoverTooltip(null);
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
                              <Line
                                type="linear"
                                dataKey="ep"
                                stroke="#3B82F6"
                                strokeWidth={2}
                                strokeOpacity={0.6}
                                dot={{ r: 2.5, fill: "#3B82F6", strokeWidth: 0 }}
                                activeDot={(props: any) => {
                                  const { cx, cy, payload } = props;
                                  if (payload.isProjection || isNaN(cx) || isNaN(cy)) return <circle cx={0} cy={0} r={0} stroke="none" />;
                                  return <circle cx={cx} cy={cy} r={6} fill="#3B82F6" stroke="none" />;
                                }}
                                isAnimationActive={false}
                              />

                              {showInstantProjection && (
                                <Line
                                  type="linear"
                                  dataKey="instantEp"
                                  stroke="#ef4444"
                                  strokeWidth={2}
                                  strokeDasharray="6 4"
                                  dot={(props: any) => {
                                    const { cx, cy, payload, index } = props;
                                    if (payload.isProjection) return <circle key={`dot-instant-${index}`} cx={cx} cy={cy} r={2.5} fill="#ef4444" stroke="none" />;
                                    return <circle key={`dot-hidden-instant-${index}`} cx={cx} cy={cy} r={0} stroke="none" />;
                                  }}
                                  activeDot={(props: any) => {
                                    const { cx, cy, payload } = props;
                                    if (!payload.isProjection || isNaN(cx) || isNaN(cy)) return <circle cx={0} cy={0} r={0} stroke="none" />;
                                    return <circle cx={cx} cy={cy} r={6} fill="#ef4444" stroke="none" />;
                                  }}
                                  isAnimationActive={false}
                                />
                              )}

                              {showDayProjection && (
                                <Line
                                  type="linear"
                                  dataKey="dayEp"
                                  stroke="#3b82f6"
                                  strokeWidth={2}
                                  strokeDasharray="6 4"
                                  dot={(props: any) => {
                                    const { cx, cy, payload, index } = props;
                                    if (payload.isProjection) return <circle key={`dot-day-${index}`} cx={cx} cy={cy} r={2.5} fill="#3b82f6" stroke="none" />;
                                    return <circle key={`dot-hidden-day-${index}`} cx={cx} cy={cy} r={0} stroke="none" />;
                                  }}
                                  activeDot={(props: any) => {
                                    const { cx, cy, payload } = props;
                                    if (!payload.isProjection || isNaN(cx) || isNaN(cy)) return <circle cx={0} cy={0} r={0} stroke="none" />;
                                    return <circle cx={cx} cy={cy} r={6} fill="#3b82f6" stroke="none" />;
                                  }}
                                  isAnimationActive={false}
                                />
                              )}
                              </LineChart>
                            </ResponsiveContainer>
                            {hoverTooltip?.active && hoverTooltip.payload?.length ? (
                              <div
                                ref={tooltipRef}
                                className="pointer-events-none absolute z-20"
                                style={{ left: "-9999px", top: 0 }}
                              >
                                <TrackerTooltip
                                  active={hoverTooltip.active}
                                  payload={hoverTooltip.payload}
                                  label={hoverTooltip.label}
                                  trackingMode={trackingMode}
                                  displayedData={finalDisplayedData}
                                />
                              </div>
                            ) : null}
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
                      onClick={() => setZoomIndex(prev => Math.min(ZOOM_WIDTH_MULTIPLIERS.length - 1, prev + 1))}
                      className={`p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 rounded-full transition-transform hover:scale-110 active:scale-95 bg-white/20 dark:bg-black/20 backdrop-blur-sm ${zoomIndex >= ZOOM_WIDTH_MULTIPLIERS.length - 1 ? "invisible pointer-events-none" : ""}`}
                      disabled={zoomIndex >= ZOOM_WIDTH_MULTIPLIERS.length - 1}
                      title="放大"
                    >
                      <ZoomIn size={22} strokeWidth={2.5} />
                    </button>
                    <button
                      onClick={() => setZoomIndex(prev => Math.max(0, prev - 1))}
                      className={`p-1.5 rounded-full transition-all hover:scale-110 active:scale-95 bg-white/20 dark:bg-black/20 backdrop-blur-sm ${zoomIndex <= 0 ? "invisible pointer-events-none" : "text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400"}`}
                      disabled={zoomIndex <= 0}
                      title="缩小"
                    >
                      <ZoomOut size={22} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>

                {/* 投影开关 */}
                {status === "进行中" && (
                  <div className="px-1 pt-4 sm:px-2">
                    <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
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
                    </div>
                  </div>
                )}
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </div>
      </div>
    </div>
  );
}
