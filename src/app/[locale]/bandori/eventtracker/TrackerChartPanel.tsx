"use client";

import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { format } from "date-fns";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { ZoomIn, ZoomOut } from "lucide-react";

import {
  BESTDORI_PREDICTION_COLOR,
  BESTDORI_PREDICTION_DATA_KEY,
  NON_WORKING_DAY_BAND_FILL,
  NON_WORKING_DAY_BAND_STROKE,
} from "./constants";
import FixedYAxis from "./FixedYAxis";
import {
  TrackerActiveMarkerOverlay,
  type TrackerActiveMarkerOverlayHandle,
} from "./TrackerActiveMarkerOverlay";
import { TrackerTooltip } from "./TrackerTooltip";
import {
  useTrackerHoverTooltip,
  buildActiveChartMarkers,
  type ActiveChartMarker,
  type HoverTooltipState,
} from "./useTrackerHoverTooltip";
import type { ComparisonLine, TrackerMouseState, TrackingMode } from "./types";

const FIXED_Y_AXIS_WIDTH = 38;
const CHART_MARGIN = { top: 20, right: 5, left: 0, bottom: 20 } as const;
const X_AXIS_HEIGHT = 30;

function findNearestChartTime(times: number[], targetTime: number): number | null {
  if (times.length === 0) return null;

  let low = 0;
  let high = times.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (times[mid] < targetTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const nextTime = times[low];
  const previousTime = low > 0 ? times[low - 1] : nextTime;
  return Math.abs(previousTime - targetTime) <= Math.abs(nextTime - targetTime)
    ? previousTime
    : nextTime;
}

function buildProjectionEndpointMarkers(
  points: Array<{ dayEp?: number; instantEp?: number; time: number }>,
  showInstantProjection: boolean,
  showDayProjection: boolean,
): ActiveChartMarker[] {
  let instantMarker: ActiveChartMarker | null = null;
  let dayMarker: ActiveChartMarker | null = null;

  for (const point of points) {
    if (
      showInstantProjection &&
      Number.isFinite(point.instantEp) &&
      (!instantMarker || point.time > instantMarker.x)
    ) {
      instantMarker = {
        key: `projection-instant-${point.time}`,
        x: point.time,
        y: point.instantEp as number,
        color: "#ef4444",
        radius: 6,
      };
    }

    if (
      showDayProjection &&
      Number.isFinite(point.dayEp) &&
      (!dayMarker || point.time > dayMarker.x)
    ) {
      dayMarker = {
        key: `projection-day-${point.time}`,
        x: point.time,
        y: point.dayEp as number,
        color: "#3b82f6",
        radius: 6,
      };
    }
  }

  return [instantMarker, dayMarker].filter((marker): marker is ActiveChartMarker => marker !== null);
}

type NonWorkingDayBand = {
  key: string;
  start: number;
  end: number;
};

export type TrackerChartLineSeries = {
  color: string;
  connectNulls?: boolean;
  dataKey: string;
  name: string;
  strokeOpacity?: number;
  strokeWidth?: number;
};

export type TrackerChartPanelProps = {
  bestdoriPredictionPointCount: number;
  buildHoverTooltip: (state: TrackerMouseState) => HoverTooltipState | null;
  chartContainerKey: string;
  chartViewportHeight: number;
  chartViewportRef: RefObject<HTMLDivElement | null>;
  comparisonLines: ComparisonLine[];
  displayedChartData: Array<{ time: number }>;
  domainEnd: number | "auto";
  domainStart: number | "auto";
  hasRenderableChartData: boolean;
  isLoading: boolean;
  lineSeries?: readonly TrackerChartLineSeries[];
  midnights: number[];
  nonWorkingDayBands: NonWorkingDayBand[];
  onZoomIn: () => void;
  onZoomOut: () => void;
  scheduleTooltipPositionUpdateRef: RefObject<() => void>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  showBestdoriPrediction: boolean;
  showDayProjection: boolean;
  showInstantProjection: boolean;
  tooltipRef: RefObject<HTMLDivElement | null>;
  trackingMode: TrackingMode;
  renderTooltip?: (tooltip: HoverTooltipState) => ReactNode;
  yDomainInfo: [number | string, number | string];
  yTicks: number[] | undefined;
  zoomEnabled?: boolean;
  zoomIndex: number;
  zoomWidthMultiplier: number;
  maxZoomIndex: number;
};

type TrackerChartCanvasProps = Pick<
  TrackerChartPanelProps,
  | "bestdoriPredictionPointCount"
  | "chartContainerKey"
  | "comparisonLines"
  | "displayedChartData"
  | "domainEnd"
  | "domainStart"
  | "midnights"
  | "nonWorkingDayBands"
  | "lineSeries"
  | "showBestdoriPrediction"
  | "showDayProjection"
  | "showInstantProjection"
  | "yDomainInfo"
  | "yTicks"
>;

const TrackerChartCanvas = memo(function TrackerChartCanvas({
  bestdoriPredictionPointCount,
  chartContainerKey,
  comparisonLines,
  displayedChartData,
  domainEnd,
  domainStart,
  midnights,
  nonWorkingDayBands,
  lineSeries,
  showBestdoriPrediction,
  showDayProjection,
  showInstantProjection,
  yDomainInfo,
  yTicks,
}: TrackerChartCanvasProps) {
  return (
    <ResponsiveContainer key={chartContainerKey} width="100%" height="100%">
      <LineChart
        data={displayedChartData}
        margin={CHART_MARGIN}
      >
        {nonWorkingDayBands.map((band) => (
          <ReferenceArea
            key={band.key}
            x1={band.start}
            x2={band.end}
            fill={NON_WORKING_DAY_BAND_FILL}
            stroke={NON_WORKING_DAY_BAND_STROKE}
            strokeOpacity={1}
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

        {midnights.map((midnight) => (
          <ReferenceLine key={midnight} x={midnight} stroke="#D1D5DB" opacity={0.6} />
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
        {lineSeries === undefined ? (
          <>
            {showInstantProjection && (
              <Line
                type="linear"
                dataKey="instantEp"
                tooltipType="none"
                stroke="#ef4444"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}
            <Line
              type="linear"
              dataKey="ep"
              stroke="#3B82F6"
              strokeWidth={5}
              strokeOpacity={1}
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />

            {showBestdoriPrediction && bestdoriPredictionPointCount > 0 && (
              <Line
                type="linear"
                dataKey={BESTDORI_PREDICTION_DATA_KEY}
                tooltipType="none"
                stroke={BESTDORI_PREDICTION_COLOR}
                strokeWidth={2.25}
                strokeOpacity={0.96}
                strokeDasharray="6 5"
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}

            {comparisonLines.map((line) => (
              line.points.length > 0 ? (
                <Line
                  key={line.dataKey}
                  type="linear"
                  dataKey={line.dataKey}
                  tooltipType="none"
                  stroke={line.color}
                  strokeWidth={1.6}
                  strokeOpacity={0.68}
                  dot={false}
                  activeDot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ) : null
            ))}

            {showDayProjection && (
              <Line
                type="linear"
                dataKey="dayEp"
                tooltipType="none"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}
          </>
        ) : (
          lineSeries.map((series) => (
            <Line
              key={series.dataKey}
              type="linear"
              dataKey={series.dataKey}
              name={series.name}
              tooltipType="none"
              stroke={series.color}
              strokeWidth={series.strokeWidth ?? 2.4}
              strokeOpacity={series.strokeOpacity ?? 1}
              dot={false}
              activeDot={false}
              connectNulls={series.connectNulls ?? false}
              isAnimationActive={false}
            />
          ))
        )}
      </LineChart>
    </ResponsiveContainer>
  );
});

export const TrackerChartPanel = memo(function TrackerChartPanel({
  bestdoriPredictionPointCount,
  buildHoverTooltip,
  chartContainerKey,
  chartViewportHeight,
  chartViewportRef,
  comparisonLines,
  displayedChartData,
  domainEnd,
  domainStart,
  hasRenderableChartData,
  isLoading,
  lineSeries,
  midnights,
  nonWorkingDayBands,
  onZoomIn,
  onZoomOut,
  scheduleTooltipPositionUpdateRef,
  scrollContainerRef,
  showBestdoriPrediction,
  showDayProjection,
  showInstantProjection,
  tooltipRef,
  trackingMode,
  renderTooltip,
  yDomainInfo,
  yTicks,
  zoomEnabled = true,
  zoomIndex,
  zoomWidthMultiplier,
  maxZoomIndex,
}: TrackerChartPanelProps) {
  const effectiveZoomWidthMultiplier = zoomEnabled ? zoomWidthMultiplier : 1;
  const chartTimes = useMemo(
    () => displayedChartData
      .map((point) => point.time)
      .filter((time): time is number => Number.isFinite(time))
      .sort((left, right) => left - right),
    [displayedChartData],
  );
  const activeMarkerIndex = useMemo(() => {
    const index = new Map<number, ActiveChartMarker[]>();
    for (const activeLabel of chartTimes) {
      const hoverTooltip = buildHoverTooltip({
        isTooltipActive: true,
        activeLabel,
        activeCoordinate: { x: 0, y: 0 },
      });
      index.set(activeLabel, buildActiveChartMarkers(hoverTooltip));
    }
    return index;
  }, [buildHoverTooltip, chartTimes]);
  const hoverCursorRef = useRef<HTMLSpanElement>(null);
  const activeMarkerOverlayRef = useRef<TrackerActiveMarkerOverlayHandle>(null);
  const hideHoverCursor = useCallback(() => {
    if (hoverCursorRef.current) {
      hoverCursorRef.current.style.opacity = "0";
      hoverCursorRef.current.style.visibility = "hidden";
    }
  }, []);
  const handleHoverFrame = useCallback((state: TrackerMouseState | null) => {
    const cursor = hoverCursorRef.current;
    const activeX = state?.activeCoordinate?.x;
    if (cursor && typeof activeX === "number" && Number.isFinite(activeX)) {
      cursor.style.opacity = "1";
      cursor.style.visibility = "visible";
      cursor.style.transform = `translate3d(${Math.round(activeX)}px, 0, 0)`;
    } else {
      hideHoverCursor();
    }

    const activeLabel = typeof state?.activeLabel === "number" ? state.activeLabel : null;
    activeMarkerOverlayRef.current?.updateMarkers(
      activeLabel === null ? [] : (activeMarkerIndex.get(activeLabel) ?? []),
    );
  }, [activeMarkerIndex, hideHoverCursor]);
  const {
    clearHoverTooltip,
    hoverTooltip,
    scheduleHoverTooltipUpdate,
    scheduleTooltipPositionUpdate,
  } = useTrackerHoverTooltip({
    buildHoverTooltip,
    chartViewportRef,
    isChartRendered: hasRenderableChartData && displayedChartData.length > 0,
    onHoverFrame: handleHoverFrame,
    scrollContainerRef,
    tooltipRef,
    zoomWidthMultiplier: effectiveZoomWidthMultiplier,
  });
  const activePointerRef = useRef<{ activeLabel: number; pointerY: number } | null>(null);
  const chartPointerSizeRef = useRef({ height: 0, width: 0 });
  const scheduleActivePointerPosition = useCallback(() => {
    const activePointer = activePointerRef.current;
    const { height: chartHeight, width: chartWidth } = chartPointerSizeRef.current;
    if (
      !activePointer ||
      chartWidth <= 0 ||
      chartHeight <= 0 ||
      typeof domainStart !== "number" ||
      typeof domainEnd !== "number" ||
      domainEnd <= domainStart
    ) {
      return;
    }

    const plotRight = chartWidth - CHART_MARGIN.right;
    const activeProgress = (activePointer.activeLabel - domainStart) / (domainEnd - domainStart);
    const activeX = CHART_MARGIN.left + activeProgress * (plotRight - CHART_MARGIN.left);
    scheduleHoverTooltipUpdate({
      isTooltipActive: true,
      activeLabel: activePointer.activeLabel,
      activeCoordinate: { x: activeX, y: activePointer.pointerY },
    });
  }, [domainEnd, domainStart, scheduleHoverTooltipUpdate]);
  useLayoutEffect(() => {
    const viewport = chartViewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      chartPointerSizeRef.current = {
        height: entry.contentRect.height,
        width: entry.contentRect.width,
      };
      scheduleActivePointerPosition();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [chartViewportRef, scheduleActivePointerPosition]);
  useLayoutEffect(() => {
    scheduleActivePointerPosition();
  }, [effectiveZoomWidthMultiplier, scheduleActivePointerPosition]);
  const clearActiveHover = useCallback(() => {
    activePointerRef.current = null;
    clearHoverTooltip();
  }, [clearHoverTooltip]);
  const handleChartMouseMove = useCallback((event: MouseEvent<HTMLDivElement>) => {
    let { height: chartHeight, width: chartWidth } = chartPointerSizeRef.current;
    if (chartWidth <= 0 || chartHeight <= 0) {
      chartWidth = event.currentTarget.clientWidth;
      chartHeight = event.currentTarget.clientHeight;
      chartPointerSizeRef.current = { height: chartHeight, width: chartWidth };
    }
    const pointerX = event.nativeEvent.offsetX;
    const pointerY = event.nativeEvent.offsetY;
    const plotLeft = CHART_MARGIN.left;
    const plotRight = chartWidth - CHART_MARGIN.right;
    const plotBottom = chartHeight - CHART_MARGIN.bottom - X_AXIS_HEIGHT;

    if (
      typeof domainStart !== "number" ||
      typeof domainEnd !== "number" ||
      domainEnd <= domainStart ||
      plotRight <= plotLeft ||
      pointerX < plotLeft ||
      pointerX > plotRight ||
      pointerY < CHART_MARGIN.top ||
      pointerY > plotBottom
    ) {
      clearActiveHover();
      return;
    }

    const pointerTime = domainStart + ((pointerX - plotLeft) / (plotRight - plotLeft)) * (domainEnd - domainStart);
    const activeLabel = findNearestChartTime(chartTimes, pointerTime);
    if (activeLabel === null) {
      clearActiveHover();
      return;
    }

    activePointerRef.current = { activeLabel, pointerY };
    scheduleActivePointerPosition();
  }, [chartTimes, clearActiveHover, domainEnd, domainStart, scheduleActivePointerPosition]);
  const handleChartMouseLeave = useCallback(() => {
    clearActiveHover();
  }, [clearActiveHover]);
  const projectionEndpointMarkers = useMemo(
    () => buildProjectionEndpointMarkers(displayedChartData, showInstantProjection, showDayProjection),
    [displayedChartData, showDayProjection, showInstantProjection],
  );
  useLayoutEffect(() => {
    scheduleTooltipPositionUpdateRef.current = scheduleTooltipPositionUpdate;

    return () => {
      scheduleTooltipPositionUpdateRef.current = () => {};
    };
  }, [scheduleTooltipPositionUpdate, scheduleTooltipPositionUpdateRef]);

  return (
    <div className="h-[400px] w-full relative group rounded-xl bg-slate-50/80 dark:bg-slate-950/35">
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
            <div style={{ minWidth: `${effectiveZoomWidthMultiplier * 100}%`, height: "100%", transition: "min-width 0.3s ease-out" }}>
              <div ref={chartViewportRef} className="relative h-full overflow-hidden">
                <TrackerChartCanvas
                  bestdoriPredictionPointCount={bestdoriPredictionPointCount}
                  chartContainerKey={chartContainerKey}
                  comparisonLines={comparisonLines}
                  displayedChartData={displayedChartData}
                  domainEnd={domainEnd}
                  domainStart={domainStart}
                  lineSeries={lineSeries}
                  midnights={midnights}
                  nonWorkingDayBands={nonWorkingDayBands}
                  showBestdoriPrediction={showBestdoriPrediction}
                  showDayProjection={showDayProjection}
                  showInstantProjection={showInstantProjection}
                  yDomainInfo={yDomainInfo}
                  yTicks={yTicks}
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 z-[15]"
                  data-testid="tracker-chart-pointer-layer"
                  onMouseLeave={handleChartMouseLeave}
                  onMouseMove={handleChartMouseMove}
                >
                  <span
                    ref={hoverCursorRef}
                    className="pointer-events-none absolute left-0 border-l border-dashed border-gray-400 opacity-0 will-change-transform"
                    style={{
                      bottom: CHART_MARGIN.bottom + X_AXIS_HEIGHT,
                      top: CHART_MARGIN.top,
                      transform: "translate3d(0, 0, 0)",
                      visibility: "hidden",
                    }}
                  />
                </div>
                <TrackerActiveMarkerOverlay
                  ref={activeMarkerOverlayRef}
                  markers={projectionEndpointMarkers}
                  domainEnd={domainEnd}
                  domainStart={domainStart}
                  margin={CHART_MARGIN}
                  xAxisHeight={X_AXIS_HEIGHT}
                  yDomain={yDomainInfo}
                />
                <div
                  ref={tooltipRef}
                  className="pointer-events-none absolute left-0 top-0 z-20 transform-gpu transition-opacity duration-75 will-change-transform"
                  data-testid="tracker-hover-tooltip"
                  style={{
                    opacity: hoverTooltip?.active && hoverTooltip.payload?.length ? 1 : 0,
                    transform: "translate3d(0, 0, 0)",
                    visibility: hoverTooltip?.active && hoverTooltip.payload?.length ? "visible" : "hidden",
                  }}
                >
                  {hoverTooltip?.active && hoverTooltip.payload?.length ? (
                    renderTooltip ? renderTooltip(hoverTooltip) : (
                      <TrackerTooltip
                        active={hoverTooltip.active}
                        payload={hoverTooltip.payload}
                        label={hoverTooltip.label}
                        trackingMode={trackingMode}
                      />
                    )
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="h-full flex flex-col items-center justify-center text-gray-400">
          {isLoading ? null : (
            <>
              <svg className="w-16 h-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p>暂无该排名档位的追踪数据</p>
            </>
          )}
        </div>
      )}

      {zoomEnabled ? (
        <div className="absolute top-[70%] right-4 -translate-y-1/2 flex flex-col gap-2 z-20 transition-opacity opacity-70 hover:opacity-100 mix-blend-difference dark:mix-blend-normal">
          <button
            onClick={onZoomIn}
            className={`p-1.5 text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 rounded-full transition-transform hover:scale-110 active:scale-95 bg-white/72 dark:bg-black/45 ${zoomIndex >= maxZoomIndex ? "invisible pointer-events-none" : ""}`}
            disabled={zoomIndex >= maxZoomIndex}
            title="放大"
          >
            <ZoomIn size={22} strokeWidth={2.5} />
          </button>
          <button
            onClick={onZoomOut}
            className={`p-1.5 rounded-full transition-transform hover:scale-110 active:scale-95 bg-white/72 dark:bg-black/45 ${zoomIndex <= 0 ? "invisible pointer-events-none" : "text-gray-500 dark:text-gray-400 hover:text-blue-500 dark:hover:text-blue-400"}`}
            disabled={zoomIndex <= 0}
            title="缩小"
          >
            <ZoomOut size={22} strokeWidth={2.5} />
          </button>
        </div>
      ) : null}
    </div>
  );
});
