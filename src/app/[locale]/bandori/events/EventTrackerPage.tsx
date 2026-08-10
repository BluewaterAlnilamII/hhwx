"use client";

import { Suspense, startTransition, useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import * as Tabs from "@radix-ui/react-tabs";

import { useRouter } from "@/i18n/navigation";
import { useBandoriEventsAssetIndex } from "@/hooks/useBandoriPublicAssetIndex";
import { useBandoriMusicMaster } from "@/hooks/useBandoriMusicMaster";
import {
  DEFAULT_BANDORI_PREFERRED_SERVER,
  getBandoriRegionalDisplayOrder,
  getBandoriServerCode,
  pickBandoriRegionalText,
  type BandoriServer,
} from "@/lib/bandori-server";
import { remapBandoriMonthlyRankingId } from "@/lib/bandori/event-tracker/monthly-ranking-calendar";
import { MONTHLY_TIERS } from "@/lib/bandori/event-tracker/tiers";
import {
  useBandoriPreferredServer,
  useBandoriPreferencesStore,
} from "@/store/useBandoriPreferencesStore";
import { cn } from "@/lib/utils";
import {
  buildBandoriPublicAssetUrl,
  lookupBandoriEventBanner,
} from "@/lib/bandori-public-asset-index";
import type { ComparisonConfig, ComparisonTargetType, TrackerMouseState, TrackerTooltipPayloadEntry, TrackingMode } from "./_tracker/types";
import {
  BESTDORI_PREDICTION_STORAGE_KEY,
  EVENT_TRACKER_TIERS,
  INSTANT_PROJECTION_STORAGE_KEY,
  DAY_PROJECTION_STORAGE_KEY,
  MAX_COMPARISON_LINES,
} from "./_tracker/constants";
import { useTrackerData } from "./_tracker/useTrackerData";
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
} from "./_tracker/useChartData";
import { useProjectionPreference } from "./_tracker/useProjectionPreference";
import { useComparisonPreferences } from "./_tracker/useComparisonPreferences";
import {
  getDefaultTierForMode,
  normalizeTierForMode,
  normalizeTrackerRankingForMode,
  readTrackerRankingPreference,
  TOP10_RANKING_SELECTION,
  writeTrackerRankingPreference,
  type TrackerRankingSelection,
} from "./_tracker/tracker-tier-preference";
import {
  buildEventTrackerRouteStateKey,
  buildEventTrackerHref,
  parseTrackingModeSearchParam,
  parseEventTrackerViewSearchParam,
  readEventTrackerSearchParams,
  replaceEventTrackerUrlQuery,
  resolveEventTrackerServerSelection,
  type EventTrackerView,
} from "./urlQuery";
import { buildBandoriEventsPath, parseBandoriEventRouteId } from "@/lib/bandori/events/route";
import { mergeComparisonLines, useComparisonTrackerData } from "./_tracker/useComparisonTrackerData";
import { mergeBestdoriPredictionData, useBestdoriPrediction } from "./_tracker/useBestdoriPrediction";
import { buildTooltipSignature, type HoverTooltipState } from "./_tracker/useTrackerHoverTooltip";
import { ComparisonControls } from "./_tracker/ComparisonControls";
import { TrackerChartPanel } from "./_tracker/TrackerChartPanel";
import { TrackerModeTierControls } from "./_tracker/TrackerModeTierControls";
import { TrackerStatusSummary } from "./_tracker/TrackerStatusSummary";
import { Top10Panel } from "./_tracker/Top10Panel";
import BandoriPageShell from "../BandoriPageShell";
import BandoriEventSwitcher from "../BandoriEventSwitcher";
import EventComments from "./EventComments";
import EventInfoPanel from "./_info/EventInfoPanel";
import EventRelativeCountdown from "./_info/EventRelativeCountdown";
import { useBandoriEventDetail } from "./_info/useBandoriEventDetail";
import { buildChinaMainlandHolidayLookup } from "@/lib/bandori-china-mainland-holiday-calendar";
import {
  buildComparisonPointMap,
  buildComparisonTooltipPointIndex,
  buildMainTooltipPointIndex,
  buildNonWorkingDayBands,
  collectNearbyComparisonPoints,
  createComparisonConfigId,
  findNearestMainTooltipPoint,
  findPreviousMonthlyComparisonTarget,
  findPreviousSameTypeEventComparisonTarget,
  formatBandoriDateTime,
  getComparisonConfigKey,
  getComparisonTierOptions,
  getMainTrackerTierOptions,
  getTooltipPointTime,
  isActualTrackerPoint,
  isComparisonTierSelectable,
  isSongRankingDisabledEventType,
  normalizeComparisonConfigTier,
  resolveMainTrackerRanking,
  resolveMainTrackerTier,
  resolveTrackingModeForEventType,
  ZOOM_WIDTH_MULTIPLIERS,
  type ComparisonTargetOption,
} from "./_tracker/tracker-model";

type InitialTrackerQueryState = {
  currentEventId: number | null;
  trackingMode: TrackingMode;
  selectedRanking: TrackerRankingSelection;
  selectedServer: BandoriServer;
  activeView: EventTrackerView;
};

function readInitialTrackerQueryState(
  preferredServer: BandoriServer,
  initialEventId: number | null,
): InitialTrackerQueryState {
  const params = readEventTrackerSearchParams();
  const trackingMode = parseTrackingModeSearchParam(params.get("type")) ?? "event";
  const queryRanking = params.get("tier");
  const selectedServer = resolveEventTrackerServerSelection(params.get("server"), preferredServer);
  const activeView = parseEventTrackerViewSearchParam(params.get("view")) ?? "tracker";
  const selectedRanking = queryRanking !== null
    ? normalizeTrackerRankingForMode(trackingMode, queryRanking) ?? readTrackerRankingPreference(trackingMode)
    : readTrackerRankingPreference(trackingMode);

  return {
    currentEventId: initialEventId,
    trackingMode,
    selectedRanking: resolveMainTrackerRanking(
      selectedServer,
      trackingMode,
      initialEventId,
      selectedRanking,
    ),
    selectedServer,
    activeView,
  };
}

// ─────────────────────────── 展示子组件 ───────────────────────────

/**
 * EventProgressBar —— 活动进度条与倒计时展示组件。
 * 将每秒的 Date.now() 调用隔离在此组件内部，
 * 防止父组件每秒触发包含 Recharts 图表的全量重渲染。
 */
function EventProgressBar({ startDate, endDate }: { startDate: number; endDate: number }) {
  const t = useTranslations("bandori.events.progress");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const hasStarted = now >= startDate;
  const durationMs = Math.max(1, endDate - startDate);
  const progress = hasStarted ? Math.min(100, Math.max(0, ((now - startDate) / durationMs) * 100)) : 0;

  const summaryContent = hasStarted
    ? (
        <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
          <span className="text-[var(--theme-color-progress-foreground)] tabular-nums">{progress.toFixed(1)}%</span>
          <span>{t("completed")}</span>
        </span>
      )
    : <EventRelativeCountdown target="start" remainingMs={startDate - now} />;

  const subSummaryContent = (
    <EventRelativeCountdown target="end" remainingMs={endDate - now} />
  );

  return (
    <div className="rounded-2xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-6 shadow-[var(--theme-shadow-surface-raised)] dark:border-slate-700/80 dark:bg-[#111827] dark:shadow-[0_18px_44px_rgba(0,0,0,0.22)]">
      <div className="mb-2 flex items-start justify-between gap-3 text-sm font-semibold">
        <span className="shrink-0 whitespace-nowrap font-bold text-[var(--theme-color-progress-foreground)]">{t("title")}</span>
        <span className="min-w-0 flex flex-col items-end gap-0.5 text-right leading-tight">
          <span className="inline-flex justify-end">{summaryContent}</span>
          <span className="inline-flex justify-end">{subSummaryContent}</span>
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--theme-color-progress-track-background)] dark:bg-slate-950/70">
        <div
          className="h-full rounded-full bg-[var(--theme-color-progress-indicator-background)] transition-all duration-1000 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────── 页面主组件 ───────────────────────────

type EventTrackerPageProps = {
  initialEventId: number | null;
};

function EventTrackerRouteStateSync({
  initialEventId,
  preferredServer,
  onRouteUrlStateKeyChange,
}: {
  initialEventId: number | null;
  preferredServer: BandoriServer;
  onRouteUrlStateKeyChange: (routeUrlStateKey: string) => void;
}) {
  const searchParams = useSearchParams();
  const routeUrlStateKey = buildEventTrackerRouteStateKey(
    initialEventId,
    searchParams,
    preferredServer,
  );

  useEffect(() => {
    onRouteUrlStateKeyChange(routeUrlStateKey);
  }, [onRouteUrlStateKeyChange, routeUrlStateKey]);

  return null;
}

function EventTrackerPageContent({ initialEventId }: EventTrackerPageProps) {
  const locale = useLocale();
  const commonT = useTranslations("bandori.events.common");
  const viewT = useTranslations("bandori.events.view");
  const router = useRouter();
  const preferredServer = useBandoriPreferredServer();
  const hasHydratedPreferredServer = useBandoriPreferencesStore((state) => state.hydrated);
  const { music: masterMusic } = useBandoriMusicMaster();
  const { value: eventAssetIndex } = useBandoriEventsAssetIndex();
  const [currentEventId, setCurrentEventId] = useState<number | null>(null);
  const [trackingMode, setTrackingMode] = useState<TrackingMode>("event");
  const [selectedRanking, setSelectedRanking] = useState<TrackerRankingSelection>(() => getDefaultTierForMode("event"));
  const [selectedSongId, setSelectedSongId] = useState<number>(0);
  const [selectedMonthlyMonthId, setSelectedMonthlyMonthId] = useState<number>(
    () => getCurrentMonthlyRankingWindow(DEFAULT_BANDORI_PREFERRED_SERVER).monthId,
  );
  const [selectedServer, setSelectedServer] = useState<BandoriServer>(DEFAULT_BANDORI_PREFERRED_SERVER);
  const [activeView, setActiveView] = useState<EventTrackerView>("tracker");
  const [chartRenderRevision, setChartRenderRevision] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(0);
  const appliedRouteUrlStateKeyRef = useRef<string | null>(null);
  const appliedSelectedServerRef = useRef<BandoriServer | null>(null);
  const pendingRecommendedEventHrefRef = useRef<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const chartViewportRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const scheduleTooltipPositionUpdateRef = useRef<() => void>(() => {});
  const isUserScrollingRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [chartViewportHeight, setChartViewportHeight] = useState(400);
  const [hasAppliedInitialUrlState, setHasAppliedInitialUrlState] = useState(false);
  const [routeUrlStateKey, setRouteUrlStateKey] = useState<string | null>(null);
  const monthlyRankingOptions = useMemo(
    () => getMonthlyRankingOptions(selectedServer, locale),
    [locale, selectedServer],
  );
  const isTop10Selected = selectedRanking === TOP10_RANKING_SELECTION;
  const selectedTier = typeof selectedRanking === "number"
    ? selectedRanking
    : getDefaultTierForMode(trackingMode);

  // ===== 数据获取层 =====
  const {
    allEvents,
    currentEventId: resolvedCurrentEventId,
    recommendedEventId,
    eventMeta,
    selectedSongId: resolvedSelectedSongId,
    startDate,
    endDate,
    eventTimeServer,
    eventStatusStartDate,
    eventStatusEndDate,
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
    selectedServer,
    hasAppliedInitialUrlState && activeView === "tracker" && !isTop10Selected,
  );

  // ===== 投影偏好持久化 =====
  const [showInstantProjection, setShowInstantProjection] = useProjectionPreference(INSTANT_PROJECTION_STORAGE_KEY, true);
  const [showDayProjection, setShowDayProjection] = useProjectionPreference(DAY_PROJECTION_STORAGE_KEY, true);
  const [showBestdoriPrediction, setShowBestdoriPrediction] = useProjectionPreference(BESTDORI_PREDICTION_STORAGE_KEY, false);
  const eventComparisonPreferences = useComparisonPreferences(selectedServer, "event");
  const monthlyComparisonPreferences = useComparisonPreferences(selectedServer, "monthly");
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
    const nextEventId = parseBandoriEventRouteId(eventId);
    if (nextEventId === null || nextEventId === resolvedCurrentEventId) {
      return;
    }

    const nextTrackingMode = resolveTrackingModeForEventType(trackingMode, eventTypeById.get(nextEventId));
    const preferredRanking = normalizeTrackerRankingForMode(nextTrackingMode, selectedRanking)
      ?? readTrackerRankingPreference(nextTrackingMode);
    const nextRanking = resolveMainTrackerRanking(
      selectedServer,
      nextTrackingMode,
      nextEventId,
      preferredRanking,
    );

    setZoomIndex(0);
    router.push(
      buildEventTrackerHref(buildBandoriEventsPath(nextEventId), {
        trackingMode: nextTrackingMode,
        tier: nextRanking,
        commentPage: null,
        commentId: null,
      }),
      { scroll: false },
    );
  }, [eventTypeById, resolvedCurrentEventId, router, selectedRanking, selectedServer, trackingMode]);

  const handleServerChange = useCallback((server: BandoriServer) => {
    setSelectedMonthlyMonthId((previousMonthId) => {
      try {
        return remapBandoriMonthlyRankingId(
          getBandoriServerCode(selectedServer),
          getBandoriServerCode(server),
          previousMonthId,
        );
      } catch {
        return getCurrentMonthlyRankingWindow(server).monthId;
      }
    });
    const nextRanking = resolveMainTrackerRanking(
      server,
      trackingMode,
      resolvedCurrentEventId,
      selectedRanking,
    );
    setSelectedRanking(nextRanking);
    setSelectedServer(server);
    appliedSelectedServerRef.current = server;
    setZoomIndex(0);
    replaceEventTrackerUrlQuery({
      server,
      tier: nextRanking,
      commentPage: null,
      commentId: null,
    });
  }, [resolvedCurrentEventId, selectedRanking, selectedServer, trackingMode]);

  const handleViewChange = useCallback((view: EventTrackerView) => {
    setActiveView(view);
    replaceEventTrackerUrlQuery({ view });
  }, []);

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

    const nextRanking = resolveMainTrackerRanking(
      selectedServer,
      nextMode,
      resolvedCurrentEventId,
      readTrackerRankingPreference(nextMode),
    );

    setTrackingMode(nextMode);
    setSelectedRanking(nextRanking);
    setZoomIndex(0);
    replaceEventTrackerUrlQuery({
      trackingMode: nextMode,
      tier: nextRanking,
    });
  }, [isSongModeDisabled, resolvedCurrentEventId, selectedServer, trackingMode]);

  const handleTierChange = useCallback((tier: number) => {
    const normalizedTier = normalizeTierForMode(trackingMode, tier);
    if (normalizedTier === null) {
      return;
    }

    const nextTier = resolveMainTrackerTier(
      selectedServer,
      trackingMode,
      resolvedCurrentEventId,
      normalizedTier,
    );

    if (nextTier === selectedRanking) {
      return;
    }

    setSelectedRanking(nextTier);
    writeTrackerRankingPreference(trackingMode, nextTier);
    replaceEventTrackerUrlQuery({ tier: nextTier });
  }, [resolvedCurrentEventId, selectedRanking, selectedServer, trackingMode]);

  const handleTop10Change = useCallback(() => {
    if (selectedRanking === TOP10_RANKING_SELECTION) {
      return;
    }

    setSelectedRanking(TOP10_RANKING_SELECTION);
    writeTrackerRankingPreference(trackingMode, TOP10_RANKING_SELECTION);
    setZoomIndex(0);
    replaceEventTrackerUrlQuery({ tier: TOP10_RANKING_SELECTION });
  }, [selectedRanking, trackingMode]);

  const handleMonthlyMonthChange = useCallback((monthId: number) => {
    setSelectedMonthlyMonthId(monthId);
    setZoomIndex(0);
  }, []);

  useEffect(() => {
    if (
      !hasHydratedPreferredServer ||
      routeUrlStateKey === null ||
      appliedRouteUrlStateKeyRef.current === routeUrlStateKey
    ) {
      return;
    }

    let cancelled = false;

    window.queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      const nextState = readInitialTrackerQueryState(preferredServer, initialEventId);
      const previousServer = appliedSelectedServerRef.current;
      appliedRouteUrlStateKeyRef.current = routeUrlStateKey;
      appliedSelectedServerRef.current = nextState.selectedServer;
      setCurrentEventId(nextState.currentEventId);
      setTrackingMode(nextState.trackingMode);
      setSelectedRanking(nextState.selectedRanking);
      setSelectedServer(nextState.selectedServer);
      if (previousServer === null) {
        setSelectedMonthlyMonthId(
          getCurrentMonthlyRankingWindow(nextState.selectedServer).monthId,
        );
      } else if (previousServer !== nextState.selectedServer) {
        setSelectedMonthlyMonthId((previousMonthId) => {
          try {
            return remapBandoriMonthlyRankingId(
              getBandoriServerCode(previousServer),
              getBandoriServerCode(nextState.selectedServer),
              previousMonthId,
            );
          } catch {
            return getCurrentMonthlyRankingWindow(nextState.selectedServer).monthId;
          }
        });
      }
      setActiveView(nextState.activeView);
      setHasAppliedInitialUrlState(true);
      replaceEventTrackerUrlQuery({
        trackingMode: nextState.trackingMode,
        tier: nextState.selectedRanking,
        server: nextState.selectedServer,
        view: nextState.activeView,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [hasHydratedPreferredServer, initialEventId, preferredServer, routeUrlStateKey]);

  useEffect(() => {
    if (!hasAppliedInitialUrlState || trackingMode !== "song" || !isSongModeDisabled) {
      return;
    }

    let cancelled = false;

    window.queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      const nextRanking = resolveMainTrackerRanking(
        selectedServer,
        "event",
        resolvedCurrentEventId,
        readTrackerRankingPreference("event"),
      );
      setTrackingMode("event");
      setSelectedRanking(nextRanking);
      setZoomIndex(0);
      replaceEventTrackerUrlQuery({
        trackingMode: "event",
        tier: nextRanking,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [hasAppliedInitialUrlState, isSongModeDisabled, resolvedCurrentEventId, selectedServer, trackingMode]);

  useEffect(() => {
    if (
      !hasAppliedInitialUrlState ||
      initialEventId !== null ||
      resolvedCurrentEventId === null
    ) {
      pendingRecommendedEventHrefRef.current = null;
      return;
    }

    const nextHref = buildEventTrackerHref(
      buildBandoriEventsPath(resolvedCurrentEventId),
      {
        trackingMode,
        tier: selectedRanking,
        server: selectedServer,
        view: activeView,
      },
    );
    if (pendingRecommendedEventHrefRef.current === nextHref) {
      return;
    }

    pendingRecommendedEventHrefRef.current = nextHref;
    router.replace(nextHref, { scroll: false });
  }, [
    activeView,
    hasAppliedInitialUrlState,
    initialEventId,
    resolvedCurrentEventId,
    router,
    selectedRanking,
    selectedServer,
    trackingMode,
  ]);

  const availableChallengeSongIds = useMemo(() => {
    if (eventMeta?.eventType !== "challenge") {
      return [];
    }

    const challengeSongIds = eventMeta.musicIds[getBandoriServerCode(selectedServer)];

    if (challengeSongIds.length === 0) {
      return [];
    }

    const songIds = challengeSongIds
      .map((musicId) => Number(musicId))
      .filter((musicId) => Number.isFinite(musicId) && musicId > 0);

    return Array.from(new Set(songIds)).sort((left, right) => left - right);
  }, [eventMeta, selectedServer]);

  const mainTierOptions = useMemo(
    () => getMainTrackerTierOptions(selectedServer, trackingMode, resolvedCurrentEventId),
    [resolvedCurrentEventId, selectedServer, trackingMode],
  );

  const challengeSongTitleMap = useMemo(() => Object.fromEntries(
    availableChallengeSongIds.flatMap((songId) => {
      const title = pickBandoriRegionalText(
        masterMusic?.[String(songId)]?.musicTitle,
        selectedServer,
      );
      return title ? [[String(songId), title]] : [];
    }),
  ), [availableChallengeSongIds, masterMusic, selectedServer]);
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
          label: commonT("eventOption", { eventId: event.id, eventName: event.name }),
          isSameEventType: (
            currentEventType !== null &&
            event.id !== resolvedCurrentEventId &&
            event.eventType === currentEventType
          ),
        })),
    [commonT, comparisonEventOptions, comparisonTargetType, currentEventType, monthlyRankingOptions, resolvedCurrentEventId],
  );
  const comparisonTargetLabelMap = useMemo(
    () => new Map(comparisonTargetOptions.map((option) => [option.id, option.label])),
    [comparisonTargetOptions],
  );
  const comparisonTargetIdSet = useMemo(
    () => new Set(comparisonTargetOptions.map((option) => option.id)),
    [comparisonTargetOptions],
  );
  const comparisonTierOptions = comparisonTargetType === "monthly"
    ? MONTHLY_TIERS
    : EVENT_TRACKER_TIERS;
  const comparisonTierOptionsByConfigId = useMemo(
    () => new Map(comparisonConfigs.map((config) => [
      config.id,
      getComparisonTierOptions(selectedServer, config, comparisonTierOptions),
    ])),
    [comparisonConfigs, comparisonTierOptions, selectedServer],
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
        isComparisonTierSelectable(selectedServer, config, comparisonTierOptions)
      ))
      .map((config, colorIndex) => ({ ...config, colorIndex })),
    [comparisonConfigs, comparisonTargetIdSet, comparisonTargetType, comparisonTierOptions, selectedServer],
  );
  const activeComparisonConfigs = useMemo(
    () => resolvedComparisonConfigs.filter((config) => config.enabled),
    [resolvedComparisonConfigs],
  );
  const canAddComparisonRow = (
    !isTop10Selected &&
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
        const normalizedConfig = normalizeComparisonConfigTier(selectedServer, config);
        const configKey = getComparisonConfigKey(normalizedConfig);

        if (
          normalizedConfig.targetType !== comparisonTargetType ||
          normalizedConfig.targetId === null ||
          normalizedConfig.tier === null ||
          !comparisonTargetIdSet.has(normalizedConfig.targetId) ||
          !isComparisonTierSelectable(selectedServer, normalizedConfig, comparisonTierOptions) ||
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
    selectedServer,
    setComparisonConfigs,
  ]);

  const handleAddComparison = useCallback(() => {
    if (!canAddComparisonRow) return;

    setComparisonConfigs((previous) => {
      const comparisonTarget = comparisonTargetType === "monthly"
        ? findPreviousMonthlyComparisonTarget(monthlyRankingOptions, selectedMonthlyMonthId, defaultComparisonTier, previous)
        : findPreviousSameTypeEventComparisonTarget(selectedServer, comparisonEventOptions, resolvedCurrentEventId, currentEventType, defaultComparisonTier, previous);

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
    selectedServer,
    setComparisonConfigs,
  ]);

  const handleUpdateComparison = useCallback((id: string, patch: Partial<ComparisonConfig>) => {
    setComparisonConfigs((previous) => previous.map((config) => {
      if (config.id !== id) return config;

      const nextConfig = normalizeComparisonConfigTier(selectedServer, { ...config, ...patch });
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
  }, [selectedServer, setComparisonConfigs]);

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
  const selectedEventName = eventMeta
    ? pickBandoriRegionalText(
        [eventMeta.name.jp, eventMeta.name.en, eventMeta.name.tw, eventMeta.name.cn],
        selectedServer,
        selectedServer,
      ) ?? commonT("eventFallback", { eventId: eventMeta.eventId })
    : commonT("loadingEvent");
  const bannerAsset = getBandoriRegionalDisplayOrder(selectedServer)
    .map((candidateServer) => lookupBandoriEventBanner(
      eventAssetIndex,
      resolvedCurrentEventId,
      getBandoriServerCode(candidateServer),
    ))
    .find((candidate) => candidate !== null) ?? null;
  const bannerUrl = buildBandoriPublicAssetUrl(
    bannerAsset,
  ) ?? "";
  const eventDetail = useBandoriEventDetail(
    resolvedCurrentEventId,
    hasAppliedInitialUrlState && activeView === "info",
  );

  const { domainStart, domainEnd, cutoffEnd, midnights } = useChartDomain(
    trackingMode,
    startDate,
    endDate,
    selectedMonthlyMonthId,
    selectedServer,
  );
  const hasActualTrackerData = useMemo(
    () => chartData.some((point) => isActualTrackerPoint(point, domainStart, trackingMode, chartData.length)),
    [chartData, domainStart, trackingMode],
  );
  const fullProcessedData = useProcessedData(chartData, apiHasResult, domainStart, trackingMode);
  const status = useEventStatus(
    eventStatusStartDate ?? "auto",
    eventStatusEndDate ?? "auto",
  );
  const finalDisplayedData = useFinalDisplayedData(fullProcessedData, cutoffEnd, status, showInstantProjection, showDayProjection);
  const bestdoriPrediction = useBestdoriPrediction({
    enabled: hasAppliedInitialUrlState && selectedServer === 3 && activeView === "tracker" && trackingMode === "event" && !isTop10Selected && status === "ongoing" && showBestdoriPrediction,
    eventId: resolvedCurrentEventId,
    tier: selectedTier,
  });
  const { comparisonLines } = useComparisonTrackerData({
    enabled: hasAppliedInitialUrlState && activeView === "tracker" && !isTop10Selected && (trackingMode === "event" || trackingMode === "monthly"),
    configs: activeComparisonConfigs,
    events: allEvents,
    monthlyOptions: monthlyRankingOptions,
    alignment: comparisonAlignment,
    currentStart: typeof domainStart === "number" ? domainStart : null,
    currentEnd: typeof domainEnd === "number" ? domainEnd : null,
    liveTarget,
    server: selectedServer,
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
    () => selectedServer === 3
      ? buildNonWorkingDayBands(domainStart, domainEnd, holidayLookup)
      : [],
    [domainEnd, domainStart, holidayLookup, selectedServer],
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

  const { ticks: yTicks, domain: yDomainInfo } = useMemo(
    () => generateYTicks(displayedChartData),
    [displayedChartData],
  );
  const comparisonChartKey = comparisonConfigs.map((config) => `${config.targetType}:${config.targetId}:${config.tier}`).join(",");
  const chartContainerKey = `${selectedServer}-${resolvedCurrentEventId ?? "none"}-${trackingMode}-${selectedMonthlyMonthId}-${selectedTier}-${resolvedSelectedSongId}-${comparisonChartKey}-${comparisonAlignment}-${showBestdoriPrediction}-${bestdoriPrediction.status}-${chartRenderRevision}`;

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

      if (status === "ended") {
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
        <Suspense fallback={null}>
          <EventTrackerRouteStateSync
            initialEventId={initialEventId}
            preferredServer={preferredServer}
            onRouteUrlStateKeyChange={setRouteUrlStateKey}
          />
        </Suspense>

        {/* ========== 页头：活动名称、切换器、活动横幅 ========== */}
        <BandoriEventSwitcher
          title={selectedEventName}
          events={allEvents}
          selectedEventId={resolvedCurrentEventId ? String(resolvedCurrentEventId) : ""}
          onSelectedEventIdChange={handleSelectedEventIdChange}
          server={selectedServer}
          onServerChange={handleServerChange}
          bannerUrl={bannerUrl}
          startText={startDate ? `${formatBandoriDateTime(startDate, eventTimeServer, locale)} (${getBandoriServerCode(eventTimeServer).toUpperCase()})` : null}
          endText={endDate ? `${formatBandoriDateTime(endDate, eventTimeServer, locale)} (${getBandoriServerCode(eventTimeServer).toUpperCase()})` : null}
          recommendedEventId={recommendedEventId !== null ? String(recommendedEventId) : null}
        />

        <div role="tablist" aria-label={viewT("label")} className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-surface-background)] shadow-sm dark:border-slate-700 dark:bg-[#111827]">
          {(["tracker", "info"] as const).map((view) => {
            const active = view === activeView;
            return (
              <button
                key={view}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => handleViewChange(view)}
                className={cn(
                  "relative h-14 text-base font-black outline-hidden transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-color-control-border-accent)]",
                  active
                    ? "text-[var(--theme-color-tab-foreground-selected)]"
                    : "text-[var(--theme-color-tab-foreground)] hover:bg-[var(--theme-color-tab-background-hover)] hover:text-[var(--theme-color-tab-foreground-hover)] dark:text-slate-300 dark:hover:bg-slate-800",
                  view === "tracker" && "border-r border-[var(--theme-color-border-subtle)] dark:border-slate-700",
                )}
              >
                {viewT(view)}
                {active ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--theme-color-tab-indicator-selected)]" /> : null}
              </button>
            );
          })}
        </div>

        {activeView === "tracker" ? (
          <>
            {/* ========== 进度条 ========== */}
            {eventStatusStartDate !== null && eventStatusEndDate !== null ? (
              <EventProgressBar startDate={eventStatusStartDate} endDate={eventStatusEndDate} />
            ) : null}

            {/* ========== 导航与控制区 ========== */}
            <div className="rounded-3xl border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-3 shadow-[var(--theme-shadow-surface-raised)] sm:p-5 dark:border-slate-700/80 dark:bg-[#111827] dark:shadow-[0_24px_60px_rgba(0,0,0,0.24)]">
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
              isTop10Selected={isTop10Selected}
              monthlyRankingOptions={monthlyRankingOptions}
              onMonthlyMonthChange={handleMonthlyMonthChange}
              onSongChange={setSelectedSongId}
              onTierChange={handleTierChange}
              onTop10Change={handleTop10Change}
              resolvedSelectedSongId={resolvedSelectedSongId}
              selectedMonthlyMonthId={selectedMonthlyMonthId}
              selectedTier={selectedTier}
              tierOptions={mainTierOptions}
              trackingMode={trackingMode}
            />

            {/* ========== 图表区域 ========== */}
            <Tabs.Content value={trackingMode} className="outline-hidden focus:outline-hidden w-full animate-in fade-in zoom-in-95 duration-500">
              <div className="mt-3 relative rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-surface-background)] p-2 shadow-[var(--theme-shadow-surface-raised)] sm:p-4 dark:border-slate-800/80 dark:bg-[#0C111C] dark:shadow-[0_24px_60px_rgba(0,0,0,0.28)]">

                {!isTop10Selected && loading && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--theme-color-surface-background)_75%,transparent)] dark:bg-[#0C111C]/75">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 border-4 border-[var(--theme-color-semantic-info-border)] border-t-transparent rounded-full animate-spin" />
                      <p className="mt-4 text-sm font-semibold text-[var(--theme-color-semantic-info-foreground)] animate-pulse">{commonT("loadingLatestData")}</p>
                    </div>
                  </div>
                )}

                {isTop10Selected ? (
                  <Top10Panel
                    chartContainerKey={chartContainerKey}
                    chartViewportHeight={chartViewportHeight}
                    chartViewportRef={chartViewportRef}
                    domainStart={domainStart}
                    domainEnd={domainEnd}
                    eventId={resolvedCurrentEventId}
                    monthlyRankingId={selectedMonthlyMonthId}
                    maxZoomIndex={ZOOM_WIDTH_MULTIPLIERS.length - 1}
                    midnights={midnights}
                    nonWorkingDayBands={nonWorkingDayBands}
                    onZoomIn={handleZoomIn}
                    onZoomOut={handleZoomOut}
                    scheduleTooltipPositionUpdateRef={scheduleTooltipPositionUpdateRef}
                    scrollContainerRef={scrollContainerRef}
                    server={selectedServer}
                    songId={resolvedSelectedSongId}
                    status={status}
                    tooltipRef={tooltipRef}
                    trackingMode={trackingMode}
                    zoomIndex={zoomIndex}
                    zoomWidthMultiplier={zoomWidthMultiplier}
                  />
                ) : (
                  <>
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
                  server={selectedServer}
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
                  </>
                )}
              </div>
            </Tabs.Content>
          </Tabs.Root>
            </div>
          </>
        ) : (
          <EventInfoPanel
            eventId={resolvedCurrentEventId}
            server={selectedServer}
            eventRecord={eventDetail.data}
            musicMaster={masterMusic}
            loading={eventDetail.loading}
          />
        )}
        <EventComments eventId={resolvedCurrentEventId} server={selectedServer} />
    </BandoriPageShell>
  );
}

export default function EventTrackerPage(props: EventTrackerPageProps) {
  return <EventTrackerPageContent {...props} />;
}
