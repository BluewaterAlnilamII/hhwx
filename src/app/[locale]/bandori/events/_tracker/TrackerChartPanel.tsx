"use client";

import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";
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

import {
  getBandoriServerTimeZone,
  type BandoriServer,
} from "@/lib/bandori-server";
import {
  BESTDORI_PREDICTION_COLOR,
  BESTDORI_PREDICTION_DATA_KEY,
  NON_WORKING_DAY_BAND_FILL,
  NON_WORKING_DAY_BAND_STROKE,
} from "./constants";
import FixedYAxis from "./FixedYAxis";
import {
  TrackerActiveMarkerOverlay,
  selectChartSampleMarkers,
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
import type { NonWorkingDayBand } from "./tracker-model";
import type { EventPtProjection } from "./event-pt-calculator";
import { generateYTicks } from "./useChartData";
import { bindTrackerChartPointer } from "./tracker-chart-pointer";
import { chartZoomTicks, useTrackerChartZoom } from "./useTrackerChartZoom";

const FIXED_Y_AXIS_WIDTH = 38;
const CHART_MARGIN = { top: 20, right: 12, left: 0, bottom: 20 } as const;
const X_AXIS_HEIGHT = 30;

function findNearestChartTime(times: number[], targetTime: number, visibleStart: number, visibleEnd: number): number | null {
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

  const nextTime = times[low] >= visibleStart && times[low] <= visibleEnd ? times[low] : null;
  const previousTime = low > 0 && times[low - 1] >= visibleStart && times[low - 1] <= visibleEnd ? times[low - 1] : null;
  if (previousTime === null) return nextTime;
  if (nextTime === null) return previousTime;
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

export type TrackerChartLineSeries = {
  color: string;
  connectNulls?: boolean;
  dataKey: string;
  name: string;
  strokeOpacity?: number;
  strokeWidth?: number;
};

export type TrackerChartPanelProps = {
  chartAnchorRef: RefObject<HTMLDivElement | null>;
  calculatorProjection?: EventPtProjection;
  bestdoriPredictionPointCount: number;
  buildHoverTooltip: (state: TrackerMouseState) => HoverTooltipState | null;
  chartContainerKey: string;
  chartViewportHeight: number;
  chartViewportRef: RefObject<HTMLDivElement | null>;
  comparisonLines: ComparisonLine[];
  displayedChartData: Array<{ time: number; ep?: number; isProjection?: boolean; isBaseline?: boolean; isFinal?: boolean }>;
  domainEnd: number | "auto";
  domainStart: number | "auto";
  hasRenderableChartData: boolean;
  isLoading: boolean;
  hasError?: boolean;
  lineSeries?: readonly TrackerChartLineSeries[];
  midnights: number[];
  nonWorkingDayBands: NonWorkingDayBand[];
  scheduleTooltipPositionUpdateRef: RefObject<() => void>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  server: BandoriServer;
  showBestdoriPrediction: boolean;
  showDayProjection: boolean;
  showInstantProjection: boolean;
  tooltipRef: RefObject<HTMLDivElement | null>;
  trackingMode: TrackingMode;
  renderTooltip?: (tooltip: HoverTooltipState) => ReactNode;
  renderControls?: () => ReactNode;
  zoomEnabled?: boolean;
  zoomKey?: string;
  yDomainInfo: [number | string, number | string];
  yTicks: number[] | undefined;
};

type TrackerChartCanvasProps = Pick<
  TrackerChartPanelProps,
  | "bestdoriPredictionPointCount"
  | "calculatorProjection"
  | "chartContainerKey"
  | "comparisonLines"
  | "displayedChartData"
  | "domainEnd"
  | "domainStart"
  | "midnights"
  | "nonWorkingDayBands"
  | "server"
  | "lineSeries"
  | "showBestdoriPrediction"
  | "showDayProjection"
  | "showInstantProjection"
  | "yDomainInfo"
  | "yTicks"
>;

function bindChartSurface(surface: SVGSVGElement | null) {
  // ResizeObserver may commit a frame late; width changes must not scale the score axis.
  surface?.setAttribute("preserveAspectRatio", "none");
}

const TrackerChartCanvas = memo(function TrackerChartCanvas({
  calculatorProjection,
  bestdoriPredictionPointCount,
  chartContainerKey,
  comparisonLines,
  displayedChartData,
  domainEnd,
  domainStart,
  midnights,
  nonWorkingDayBands,
  server,
  lineSeries,
  showBestdoriPrediction,
  showDayProjection,
  showInstantProjection,
  yDomainInfo,
  yTicks,
}: TrackerChartCanvasProps) {
  const locale = useLocale();
  const calculatorT = useTranslations("bandori.events.calculator");
  const compactNumber = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, {
    timeZone: getBandoriServerTimeZone(server),
    month: "2-digit",
    day: "2-digit",
  }), [locale, server]);
  const hasTimeDomain = typeof domainStart === "number" && typeof domainEnd === "number" && domainEnd > domainStart;
  const hasTimeValues = hasTimeDomain || displayedChartData.length > 0;
  const dataByKey = useMemo(() => {
    const series = lineSeries ?? [
      ...["ep", "instantEp", "dayEp", BESTDORI_PREDICTION_DATA_KEY].map(dataKey => ({ dataKey, connectNulls: true })),
      ...comparisonLines.map(line => ({ dataKey: line.dataKey, connectNulls: true })),
    ];
    // Each line needs its own samples; merged timestamps otherwise multiply Recharts' point work.
    return new Map(series.map(({ dataKey, connectNulls }) => [dataKey,
      displayedChartData.filter(point => !connectNulls || typeof Reflect.get(point, dataKey) === "number")
        .map(point => ({ time: point.time, [dataKey]: Reflect.get(point, dataKey) })),
    ]));
  }, [comparisonLines, displayedChartData, lineSeries]);

  return (
    <ResponsiveContainer key={chartContainerKey} width="100%" height="100%">
      <LineChart
        ref={bindChartSurface}
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
          allowDataOverflow={displayedChartData.length === 0}
        />

        <CartesianGrid vertical={false} stroke="var(--theme-color-border-subtle)" opacity={0.55} />

        {midnights.map((midnight) => (
          <ReferenceLine className="event-chart-midnight" key={midnight} x={midnight} stroke="var(--theme-color-border-subtle)" opacity={0.75} />
        ))}

        <XAxis
          dataKey="time"
          domain={hasTimeValues ? [domainStart, domainEnd] : [0, 1]}
          type="number"
          allowDataOverflow={hasTimeDomain || displayedChartData.length === 0}
          ticks={midnights}
          height={X_AXIS_HEIGHT}
          tickFormatter={(unixTime) => dateFormatter.format(unixTime)}
          tick={hasTimeValues}
          stroke="var(--theme-color-text-muted)"
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
                data={dataByKey.get("instantEp")}
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
              data={dataByKey.get("ep")}
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
                data={dataByKey.get(BESTDORI_PREDICTION_DATA_KEY)}
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
                  data={dataByKey.get(line.dataKey)}
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
                data={dataByKey.get("dayEp")}
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
              data={dataByKey.get(series.dataKey)}
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
        {calculatorProjection ? <>
          <ReferenceLine x={calculatorProjection.baselineAt} stroke="var(--theme-color-action-secondary-foreground)" strokeDasharray="3 4" />
          {calculatorProjection.targetPt !== null ? <ReferenceLine y={calculatorProjection.targetPt}
            stroke="var(--theme-color-text-muted)" strokeDasharray="6 4"
            label={{ value: `${calculatorT("targetLine")} ${compactNumber.format(calculatorProjection.targetPt)}`, position: "insideTopLeft", dy: -18, fill: "var(--theme-color-text-muted)", fontSize: 11 }} /> : null}
          {calculatorProjection.limitPt !== null ? <ReferenceLine y={calculatorProjection.limitPt}
            stroke="var(--theme-color-semantic-danger-foreground)" strokeDasharray="6 4"
            label={{ value: `${calculatorT("limitLine")} ${compactNumber.format(calculatorProjection.limitPt)}`, position: "insideTopLeft", fill: "var(--theme-color-semantic-danger-foreground)", fontSize: 11 }} /> : null}
          <ReferenceLine segment={[{ x: calculatorProjection.baselineAt, y: calculatorProjection.currentPt }, { x: calculatorProjection.endAt, y: calculatorProjection.finalPt }]}
            ifOverflow="hidden" stroke="var(--theme-color-semantic-success-foreground)" strokeWidth={2} strokeDasharray="4 4" />
        </> : null}
      </LineChart>
    </ResponsiveContainer>
  );
});

export const TrackerChartPanel = memo(function TrackerChartPanel({
  chartAnchorRef,
  calculatorProjection,
  bestdoriPredictionPointCount,
  buildHoverTooltip,
  chartContainerKey,
  chartViewportHeight,
  chartViewportRef,
  comparisonLines,
  displayedChartData,
  domainEnd: fullDomainEnd,
  domainStart: fullDomainStart,
  hasRenderableChartData,
  isLoading,
  hasError = false,
  lineSeries,
  midnights,
  nonWorkingDayBands,
  scheduleTooltipPositionUpdateRef,
  scrollContainerRef,
  server,
  showBestdoriPrediction,
  showDayProjection,
  showInstantProjection,
  tooltipRef,
  trackingMode,
  renderTooltip,
  renderControls,
  zoomEnabled = true,
  zoomKey = chartContainerKey,
  yDomainInfo: providedYDomain,
  yTicks: providedYTicks,
}: TrackerChartPanelProps) {
  const t = useTranslations("bandori.events.tracker.chart");
  const calculatorT = useTranslations("bandori.events.calculator");
  const locale = useLocale();
  const hasScoreData = hasRenderableChartData && displayedChartData.length > 0;
  const hasChartContent = hasScoreData || !!calculatorProjection;
  const { domain: yDomainInfo, ticks: yTicks } = useMemo(() => calculatorProjection
    ? generateYTicks([{ time: 0, ep: Math.max(
      hasScoreData && typeof providedYDomain[1] === "number" ? providedYDomain[1] : 0,
      calculatorProjection.currentPt, calculatorProjection.finalPt, calculatorProjection.targetPt ?? 0, calculatorProjection.limitPt ?? 0,
    ) }])
    : hasScoreData ? { domain: providedYDomain, ticks: providedYTicks } : generateYTicks([]),
  [calculatorProjection, hasScoreData, providedYDomain, providedYTicks]);
  const chartTimes = useMemo(
    () => (hasScoreData ? displayedChartData : [])
      .map((point) => point.time)
      .filter((time): time is number => Number.isFinite(time))
      .sort((left, right) => left - right),
    [displayedChartData, hasScoreData],
  );
  const zoom = useTrackerChartZoom(zoomKey);
  const fullStart = typeof fullDomainStart === "number" ? fullDomainStart : chartTimes[0];
  const fullEnd = typeof fullDomainEnd === "number" ? fullDomainEnd : chartTimes.at(-1);
  const canZoom = zoomEnabled && fullStart !== undefined && fullEnd !== undefined && fullEnd > fullStart && hasChartContent;
  const domainStart = canZoom ? fullStart + zoom.view.start * (fullEnd - fullStart) : fullDomainStart;
  const domainEnd = canZoom ? fullStart + zoom.view.end * (fullEnd - fullStart) : fullDomainEnd;
  const zoomed = canZoom && zoom.scale > 1.001;
  const [plotWidth, setPlotWidth] = useState(0);
  const [timeLabelWidth, setTimeLabelWidth] = useState(0);
  const measureTimeLabel = useCallback((label: HTMLSpanElement | null) => {
    if (!label) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setTimeLabelWidth(entry.contentRect.width);
    });
    observer.observe(label);
    return () => observer.disconnect();
  }, []);
  const timeTicks = useMemo(() => zoomed && typeof domainStart === "number" && typeof domainEnd === "number"
    ? chartZoomTicks(domainStart, domainEnd, midnights[0] ?? domainStart, plotWidth, timeLabelWidth) : [],
  [domainEnd, domainStart, midnights, plotWidth, timeLabelWidth, zoomed]);
  const showHours = typeof domainStart === "number" && typeof domainEnd === "number" && domainEnd - domainStart < 3 * 86400000;
  const timeFormatter = useMemo(() => new Intl.DateTimeFormat(locale, {
    timeZone: getBandoriServerTimeZone(server), month: "2-digit", day: "2-digit",
    ...(showHours ? { hour: "2-digit", minute: "2-digit", hour12: false } as const : {}),
  }), [locale, server, showHours]);
  const timeLabelSample = useMemo(() => timeFormatter.format(Date.UTC(2000, 8, 28, 12, 58)), [timeFormatter]);
  const latestActualDataTime = useMemo(() => displayedChartData.findLast(point =>
    Number.isFinite(point.ep) && !point.isProjection && !point.isBaseline && !point.isFinal)?.time ?? null,
  [displayedChartData]);
  const sampleSeries = useMemo(() => {
    if (!hasScoreData) return [];
    const series = lineSeries ?? [{ dataKey: "ep", color: "#3B82F6" }];
    const samples = series.map(series => displayedChartData.flatMap(point => {
      const score = Reflect.get(point, series.dataKey);
      return typeof score === "number" && Number.isFinite(score) && !point.isProjection && !point.isBaseline && !point.isFinal
        ? [{ key: `${series.dataKey}-${point.time}`, x: point.time, y: score, color: series.color, radius: 3 }] : [];
    }));
    for (const line of comparisonLines) samples.push(line.points.map(point => ({
      key: `${line.dataKey}-${point.shiftedTime}`, x: point.shiftedTime, y: point.ep, color: line.color, radius: 3,
    })));
    return samples;
  }, [comparisonLines, displayedChartData, hasScoreData, lineSeries]);
  const sampleMarkers = useMemo(() => typeof domainStart === "number" && typeof domainEnd === "number"
    ? sampleSeries.flatMap(points => selectChartSampleMarkers(points, domainStart, domainEnd, plotWidth)) : [],
  [domainEnd, domainStart, plotWidth, sampleSeries]);
  const selectedTimeRef = useRef<number | null>(null);
  const zoomControlsRef = useRef<HTMLDivElement>(null);
  const stepZoom = (direction: -1 | 1) => {
    if (!canZoom) return;
    const view = zoom.current.current;
    const selected = selectedTimeRef.current;
    const anchor = selected !== null ? (selected - fullStart) / (fullEnd - fullStart)
      : latestActualDataTime !== null ? (latestActualDataTime - fullStart) / (fullEnd - fullStart)
        : (view.start + view.end) / 2;
    const position = selected !== null ? Math.max(0, Math.min(1, (anchor - view.start) / (view.end - view.start)))
      : latestActualDataTime !== null ? 0.76 : 0.5;
    zoom.step(direction, anchor, position);
  };
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
    onHoverFrame: handleHoverFrame,
    scrollContainerRef,
    tooltipRef,
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
    if (activeProgress < 0 || activeProgress > 1) {
      clearHoverTooltip();
      return;
    }
    const activeX = CHART_MARGIN.left + activeProgress * (plotRight - CHART_MARGIN.left);
    scheduleHoverTooltipUpdate({
      isTooltipActive: true,
      activeLabel: activePointer.activeLabel,
      activeCoordinate: { x: activeX, y: activePointer.pointerY },
    });
  }, [clearHoverTooltip, domainEnd, domainStart, scheduleHoverTooltipUpdate]);
  const activePositionRef = useRef(scheduleActivePointerPosition);
  useLayoutEffect(() => { activePositionRef.current = scheduleActivePointerPosition; }, [scheduleActivePointerPosition]);
  useLayoutEffect(() => {
    const viewport = chartViewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      chartPointerSizeRef.current = {
        height: entry.contentRect.height,
        width: entry.contentRect.width,
      };
      setPlotWidth(Math.max(0, entry.contentRect.width - CHART_MARGIN.left - CHART_MARGIN.right));
      activePositionRef.current();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [chartViewportRef]);
  useLayoutEffect(() => {
    scheduleActivePointerPosition();
  }, [scheduleActivePointerPosition]);
  const clearActiveHover = useCallback((reason: "leave" | "outside" | "gesture" | "cancel" = "outside") => {
    if (reason !== "leave") selectedTimeRef.current = null;
    activePointerRef.current = null;
    clearHoverTooltip();
  }, [clearHoverTooltip]);
  useLayoutEffect(() => {
    if (!hasScoreData) clearActiveHover();
  }, [clearActiveHover, hasScoreData]);
  const handleChartPointerPosition = useCallback((x: number, y: number, contact: boolean) => {
    let { height: chartHeight, width: chartWidth } = chartPointerSizeRef.current;
    if (chartWidth <= 0 || chartHeight <= 0) {
      chartWidth = chartViewportRef.current?.clientWidth ?? 0;
      chartHeight = chartViewportRef.current?.clientHeight ?? 0;
      chartPointerSizeRef.current = { height: chartHeight, width: chartWidth };
    }
    const plotLeft = CHART_MARGIN.left;
    const plotRight = chartWidth - CHART_MARGIN.right;
    const plotBottom = chartHeight - CHART_MARGIN.bottom - X_AXIS_HEIGHT;
    const pointerX = Math.max(plotLeft, Math.min(x, plotRight));
    const pointerY = contact ? Math.max(CHART_MARGIN.top, Math.min(y, plotBottom)) : y;

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
    const activeLabel = findNearestChartTime(chartTimes, pointerTime, domainStart, domainEnd);
    if (activeLabel === null) {
      clearActiveHover();
      return;
    }

    activePointerRef.current = { activeLabel, pointerY };
    if (contact) selectedTimeRef.current = activeLabel;
    scheduleActivePointerPosition();
  }, [chartTimes, chartViewportRef, clearActiveHover, domainEnd, domainStart, scheduleActivePointerPosition]);
  const { beginGesture, updateGesture, endGesture: endChartGesture } = zoom;
  const beginChartGesture = useCallback((x: number) => {
    beginGesture(x / Math.max(1, chartPointerSizeRef.current.width - CHART_MARGIN.left - CHART_MARGIN.right));
  }, [beginGesture]);
  const moveChartGesture = useCallback((x: number, ratio: number) => {
    updateGesture(x / Math.max(1, chartPointerSizeRef.current.width - CHART_MARGIN.left - CHART_MARGIN.right), ratio);
  }, [updateGesture]);
  const doubleTapZoom = (x: number) => {
    if (!canZoom) return;
    const position = x / Math.max(1, plotWidth);
    const view = zoom.current.current;
    zoom.step(1, view.start + position * (view.end - view.start), position);
  };
  const wheelZoom = (x: number, delta: number) => {
    if (canZoom) zoom.wheel(x / Math.max(1, plotWidth), delta);
  };
  const pointerHandlersRef = useRef({ point: handleChartPointerPosition, clear: clearActiveHover, beginChartGesture, moveChartGesture, endChartGesture, doubleTapZoom, wheelZoom, canZoom, scale: zoom.scale });
  useLayoutEffect(() => {
    pointerHandlersRef.current = { point: handleChartPointerPosition, clear: clearActiveHover, beginChartGesture, moveChartGesture, endChartGesture, doubleTapZoom, wheelZoom, canZoom, scale: zoom.scale };
  });
  useLayoutEffect(() => {
    pointerHandlersRef.current.clear();
  }, [chartContainerKey]);
  const bindPointerLayer = useCallback((layer: HTMLDivElement | null) => {
    if (!layer) return;
    return bindTrackerChartPointer(layer, {
      onPoint: (x, y, contact) => pointerHandlersRef.current.point(x + CHART_MARGIN.left, y + CHART_MARGIN.top, contact),
      onClear: reason => pointerHandlersRef.current.clear(reason),
      isControlTarget: target => zoomControlsRef.current?.contains(target as Node | null) ?? false,
      canPan: () => pointerHandlersRef.current.canZoom && pointerHandlersRef.current.scale > 1,
      canZoom: () => pointerHandlersRef.current.canZoom,
      onDoubleTap: x => pointerHandlersRef.current.doubleTapZoom(x),
      onWheel: (x, delta) => pointerHandlersRef.current.wheelZoom(x, delta),
      onGestureStart: x => { if (pointerHandlersRef.current.canZoom) pointerHandlersRef.current.beginChartGesture(x); },
      onGesture: (x, ratio) => { if (pointerHandlersRef.current.canZoom) pointerHandlersRef.current.moveChartGesture(x, ratio); },
      onGestureEnd: () => pointerHandlersRef.current.endChartGesture(),
    });
  }, []);
  const projectionEndpointMarkers = useMemo(
    () => {
      const markers = buildProjectionEndpointMarkers(displayedChartData, showInstantProjection, showDayProjection);
      if (calculatorProjection) {
        const color = "var(--theme-color-semantic-success-foreground)";
        markers.push({ key: "calculator-start", x: calculatorProjection.baselineAt, y: calculatorProjection.currentPt, radius: 5, color });
        markers.push({ key: "calculator-end", x: calculatorProjection.endAt, y: calculatorProjection.finalPt, radius: 5, color,
          label: `${calculatorT("reachablePoint")} ${new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(calculatorProjection.finalPt)}` });
      }
      return markers;
    },
    [calculatorProjection, calculatorT, displayedChartData, locale, showDayProjection, showInstantProjection],
  );
  useLayoutEffect(() => {
    scheduleTooltipPositionUpdateRef.current = scheduleTooltipPositionUpdate;

    return () => {
      scheduleTooltipPositionUpdateRef.current = () => {};
    };
  }, [scheduleTooltipPositionUpdate, scheduleTooltipPositionUpdateRef]);

  const zoomControls = zoomEnabled ? <div ref={zoomControlsRef} className="event-chart-zoom" data-tracker-zoom-controls role="group" aria-label={t("zoom")}>
    <button type="button" className="hhwx-control" aria-label={t("zoomOut")} title={t("zoomOut")} disabled={!canZoom || zoom.scale <= 1.001} onClick={() => stepZoom(-1)}><Minus size={13} aria-hidden /></button>
    <span className="tabular-nums" data-testid="tracker-zoom-scale">{new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(zoom.scale)}×</span>
    <button type="button" className="hhwx-control" aria-label={t("zoomIn")} title={t("zoomIn")} disabled={!canZoom || zoom.scale >= 31.999} onClick={() => stepZoom(1)}><Plus size={13} aria-hidden /></button>
  </div> : null;

  return (<>
    <div ref={chartAnchorRef} data-event-swipe-ignore data-testid="tracker-chart" data-zoom-enabled={zoomEnabled} data-zoom={zoom.scale} data-view-start={domainStart} data-view-end={domainEnd} className="h-[270px] max-h-[270px] sm:h-[360px] sm:max-h-[360px] motion-safe:transition-[max-height] motion-safe:duration-240 motion-safe:ease-out w-full relative rounded-xl bg-[var(--theme-color-chart-background)] select-none">
        <div className="flex h-full w-full overflow-hidden rounded-xl">
          <div
            ref={scrollContainerRef}
            className="min-w-0 flex-1 h-full relative"
          >
              <div ref={chartViewportRef} className="event-chart-canvas pointer-events-none relative z-[1] h-full overflow-hidden" data-zoomed={zoomed}
                style={{ width: `calc(100% + ${CHART_MARGIN.right}px)`, "--tracker-x-scale": zoom.scale, "--tracker-x-offset": `${-zoom.view.start * plotWidth * zoom.scale}px` } as CSSProperties}>
                {zoomEnabled && <span ref={measureTimeLabel} aria-hidden="true"
                  className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap text-xs">{timeLabelSample}</span>}
                {!hasError && <TrackerChartCanvas
                  calculatorProjection={calculatorProjection}
                  bestdoriPredictionPointCount={bestdoriPredictionPointCount}
                  chartContainerKey={chartContainerKey}
                  comparisonLines={comparisonLines}
                  displayedChartData={hasScoreData ? displayedChartData : []}
                  domainEnd={fullDomainEnd}
                  domainStart={fullDomainStart}
                  lineSeries={lineSeries}
                  midnights={midnights}
                  nonWorkingDayBands={nonWorkingDayBands}
                  server={server}
                  showBestdoriPrediction={showBestdoriPrediction}
                  showDayProjection={showDayProjection}
                  showInstantProjection={showInstantProjection}
                  yDomainInfo={yDomainInfo}
                  yTicks={yTicks}
                />}
                {timeTicks.map(({ time, labeled }) => typeof domainStart === "number" && typeof domainEnd === "number" ? <div key={time}
                  className="pointer-events-none absolute inset-y-0" style={{ left: (time - domainStart) / (domainEnd - domainStart) * plotWidth + CHART_MARGIN.left }}>
                  <span className="event-chart-time-grid absolute border-l border-[var(--theme-color-border-subtle)]"
                    style={{ top: CHART_MARGIN.top, bottom: CHART_MARGIN.bottom + X_AXIS_HEIGHT, opacity: labeled ? 0.55 : 0.28 }} />
                  {labeled && <span className="event-chart-time-tick absolute bottom-3 -translate-x-1/2 whitespace-nowrap text-xs text-[var(--theme-color-text-muted)]">{timeFormatter.format(time)}</span>}
                </div> : null)}
                <div
                  ref={bindPointerLayer}
                  aria-hidden="true"
                  // Include the endpoint's right half without covering the score labels.
                  className="pointer-events-auto absolute z-[15] after:absolute after:inset-y-0 after:left-full after:w-1.5 after:content-['']"
                  style={{ top: CHART_MARGIN.top, bottom: CHART_MARGIN.bottom + X_AXIS_HEIGHT, left: CHART_MARGIN.left, right: CHART_MARGIN.right, touchAction: zoomEnabled ? "none" : "pinch-zoom" }}
                  data-testid="tracker-chart-pointer-layer"
                >
                  <span
                    ref={hoverCursorRef}
                    className="pointer-events-none absolute left-0 border-l border-dashed border-[var(--theme-color-border-subtle)] opacity-0 will-change-transform"
                    style={{
                      bottom: 0,
                      top: 0,
                      transform: "translate3d(0, 0, 0)",
                      visibility: "hidden",
                    }}
                  />
                </div>
                <TrackerActiveMarkerOverlay
                  ref={activeMarkerOverlayRef}
                  markers={projectionEndpointMarkers}
                  sampleMarkers={sampleMarkers}
                  domainEnd={domainEnd}
                  domainStart={domainStart}
                  margin={CHART_MARGIN}
                  xAxisHeight={X_AXIS_HEIGHT}
                  yDomain={yDomainInfo}
                />

              </div>
          </div>
          <FixedYAxis
            ticks={hasChartContent ? yTicks : [0]}
            domain={yDomainInfo}
            chartHeight={chartViewportHeight}
            axisWidth={FIXED_Y_AXIS_WIDTH}
            topMargin={CHART_MARGIN.top}
            bottomMargin={CHART_MARGIN.bottom}
            xAxisHeight={X_AXIS_HEIGHT}
          />
        </div>
      <div
        ref={tooltipRef}
        className="event-chart-tooltip pointer-events-none absolute top-0 z-20 transform-gpu transition-opacity duration-75 will-change-transform"
        data-testid="tracker-hover-tooltip"
        style={{
          left: 0,
          maxWidth: `calc(100% - ${FIXED_Y_AXIS_WIDTH + 16}px)`,
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
              server={server}
              trackingMode={trackingMode}
            />
          )
        ) : null}
      </div>
      {!hasChartContent && !isLoading && !hasError ? (
        <div data-testid="tracker-chart-empty" className="pointer-events-none absolute z-10 flex flex-col items-center justify-center text-[var(--theme-color-text-muted)]"
          style={{ top: CHART_MARGIN.top, bottom: CHART_MARGIN.bottom + X_AXIS_HEIGHT, left: CHART_MARGIN.left, right: FIXED_Y_AXIS_WIDTH }}>
              <svg className="w-16 h-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="px-3 text-center">{t("noTierData")}</p>
        </div>
      ) : null}

      {zoomControls}
    </div>
    {renderControls?.()}
    </>
  );
});
