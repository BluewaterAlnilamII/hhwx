"use client";

import {
  useCallback,
  useMemo,
  type RefObject,
} from "react";

import type { BandoriServer } from "@/lib/bandori-server";
import { buildBandoriTop10View } from "@/lib/bandori-top10-view";
import {
  TrackerChartPanel,
  type TrackerChartLineSeries,
  type TrackerChartPanelProps,
} from "./TrackerChartPanel";
import { TrackerStatusSummary } from "./TrackerStatusSummary";
import { Top10PlayerList } from "./Top10PlayerList";
import { Top10Tooltip } from "./Top10Tooltip";
import type {
  TrackerMouseState,
  TrackerTooltipPayloadEntry,
} from "./types";
import { generateYTicks } from "./useChartData";
import type { HoverTooltipState } from "./useTrackerHoverTooltip";
import { useBandoriTop10Data } from "./useBandoriTop10Data";

type Top10PanelProps = {
  chartContainerKey: string;
  chartViewportHeight: number;
  chartViewportRef: RefObject<HTMLDivElement | null>;
  domainStart: number | "auto";
  domainEnd: number | "auto";
  eventId: number | null;
  maxZoomIndex: number;
  midnights: number[];
  nonWorkingDayBands: TrackerChartPanelProps["nonWorkingDayBands"];
  onZoomIn: () => void;
  onZoomOut: () => void;
  scheduleTooltipPositionUpdateRef: RefObject<() => void>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  server: BandoriServer;
  status: string;
  tooltipRef: RefObject<HTMLDivElement | null>;
  zoomIndex: number;
  zoomWidthMultiplier: number;
};

const DISABLED_BESTDORI_PREDICTION = {
  latestPrediction: null,
  status: "idle",
};

export function Top10Panel({
  chartContainerKey,
  chartViewportHeight,
  chartViewportRef,
  domainStart,
  domainEnd,
  eventId,
  maxZoomIndex,
  midnights,
  nonWorkingDayBands,
  onZoomIn,
  onZoomOut,
  scheduleTooltipPositionUpdateRef,
  scrollContainerRef,
  server,
  status,
  tooltipRef,
  zoomIndex,
  zoomWidthMultiplier,
}: Top10PanelProps) {
  const { data, loading, refreshing, error, refresh } = useBandoriTop10Data(eventId, server, true);
  const view = useMemo(
    () => data ? buildBandoriTop10View(data) : null,
    [data],
  );
  const lineSeries = useMemo<TrackerChartLineSeries[]>(
    () => (view?.players ?? []).map((player) => ({
      color: player.color,
      connectNulls: false,
      dataKey: player.dataKey,
      name: player.name || String(player.uid),
      strokeWidth: 2.4,
    })),
    [view],
  );
  const chartPointByTime = useMemo(
    () => new Map((view?.chartData ?? []).map((point) => [point.time, point])),
    [view],
  );
  const yAxis = useMemo(
    () => generateYTicks((view?.scores ?? []).map((ep, index) => ({ time: index, ep }))),
    [view],
  );
  const buildHoverTooltip = useCallback((state: TrackerMouseState): HoverTooltipState | null => {
    if (!state.isTooltipActive || !state.activeCoordinate || !view) {
      return null;
    }

    const activeLabel = typeof state.activeLabel === "number"
      ? state.activeLabel
      : Number(state.activeLabel);
    const point = chartPointByTime.get(activeLabel);
    if (!point) {
      return null;
    }

    const payload: TrackerTooltipPayloadEntry[] = [];
    const markers: NonNullable<HoverTooltipState["markers"]> = [];
    for (const player of view.players) {
      const score = point[player.dataKey];
      if (typeof score !== "number" || !Number.isFinite(score)) {
        continue;
      }
      payload.push({
        dataKey: player.dataKey,
        payload: { time: activeLabel, ep: score },
      });
      markers.push({
        key: `${player.dataKey}-${activeLabel}`,
        x: activeLabel,
        y: score,
        color: player.color,
        radius: 5.5,
      });
    }
    if (payload.length === 0) {
      return null;
    }

    return {
      active: true,
      coordinate: state.activeCoordinate,
      label: activeLabel,
      markers,
      payload,
      signature: `${activeLabel}:${payload.map((entry) => `${entry.dataKey}:${entry.payload?.ep}`).join("|")}`,
    };
  }, [chartPointByTime, view]);
  const renderTooltip = useCallback(
    (tooltip: HoverTooltipState) => view
      ? <Top10Tooltip players={view.players} server={server} tooltip={tooltip} />
      : null,
    [server, view],
  );
  const scoreSummary = useMemo(() => ({
    latestScore: null,
    latestUpdateTime: view?.latestTime ?? null,
    endScore: null,
    finalScore: null,
  }), [view?.latestTime]);
  const hasRenderableChartData = Boolean(view && view.players.length > 0 && view.chartData.length > 0);
  const isBlockingLoading = loading || (refreshing && data === null);

  return (
    <div className="relative">
      {isBlockingLoading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center rounded-xl bg-[var(--theme-color-surface-background)]/75 dark:bg-[#0C111C]/75">
          <div className="flex flex-col items-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--theme-color-feedback-info-border)] border-t-transparent" />
            <p className="mt-4 text-sm font-semibold text-[var(--theme-color-feedback-info-foreground)] dark:text-[var(--theme-color-action-secondary-foreground-on-dark)]">正在获取最新数据...</p>
          </div>
        </div>
      )}

      <TrackerStatusSummary
        bestdoriPrediction={DISABLED_BESTDORI_PREDICTION}
        scoreSummary={scoreSummary}
        isRefreshing={refreshing}
        showBestdoriPrediction={false}
        showScoreValues={false}
        status={status}
        trackingMode="event"
      />

      {error && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--theme-color-feedback-error-border)] bg-[var(--theme-color-feedback-error-background)] px-3 py-2 text-sm text-[var(--theme-color-feedback-error-foreground)] dark:text-red-200">
          <span className="font-semibold">TOP10 追踪数据加载失败</span>
          <button
            type="button"
            onClick={refresh}
            className="shrink-0 rounded-full border border-[var(--theme-color-feedback-error-border)] bg-[var(--theme-color-control-background)] px-3 py-1 text-xs font-bold transition hover:bg-[var(--theme-color-feedback-error-background)] dark:bg-slate-900 dark:hover:bg-slate-800"
          >
            重新加载
          </button>
        </div>
      )}

      <TrackerChartPanel
        bestdoriPredictionPointCount={0}
        buildHoverTooltip={buildHoverTooltip}
        chartContainerKey={`${chartContainerKey}-top10-${server}`}
        chartViewportHeight={chartViewportHeight}
        chartViewportRef={chartViewportRef}
        comparisonLines={[]}
        displayedChartData={view?.chartData ?? []}
        domainEnd={domainEnd}
        domainStart={domainStart}
        hasRenderableChartData={hasRenderableChartData}
        isLoading={isBlockingLoading}
        lineSeries={lineSeries}
        midnights={midnights}
        nonWorkingDayBands={nonWorkingDayBands}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        renderTooltip={renderTooltip}
        scheduleTooltipPositionUpdateRef={scheduleTooltipPositionUpdateRef}
        scrollContainerRef={scrollContainerRef}
        showBestdoriPrediction={false}
        showDayProjection={false}
        showInstantProjection={false}
        tooltipRef={tooltipRef}
        trackingMode="event"
        yDomainInfo={yAxis.domain}
        yTicks={yAxis.ticks}
        zoomIndex={zoomIndex}
        zoomWidthMultiplier={zoomWidthMultiplier}
        zoomEnabled={false}
        maxZoomIndex={maxZoomIndex}
      />

      {view && view.players.length > 0 ? (
        <>
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-2 px-1" aria-label="TOP10 玩家图例">
            {view.players.map((player) => (
              <div key={player.uid} className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--theme-color-text-muted)] dark:text-slate-300">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-4 shrink-0 rounded-sm"
                  style={{ backgroundColor: player.color }}
                />
                <span className="max-w-40 whitespace-pre-line break-words">{player.name || String(player.uid)}</span>
              </div>
            ))}
          </div>
          <Top10PlayerList players={view.players} server={server} />
        </>
      ) : null}
    </div>
  );
}
