"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";

import type { TrackerMouseState, TrackerTooltipPayloadEntry } from "./types";

const TOOLTIP_OFFSET = 12;
const TOOLTIP_EDGE_PADDING = 8;
const HOVER_TOOLTIP_UPDATE_INTERVAL_MS = 50;

export type HoverTooltipState = {
  active: boolean;
  coordinate: { x: number; y: number };
  label?: number;
  payload?: TrackerTooltipPayloadEntry[];
  signature?: string;
};

export type ActiveChartMarker = {
  key: string;
  x: number;
  y: number;
  color: string;
  radius: number;
};

type UseTrackerHoverTooltipArgs = {
  buildHoverTooltip: (state: TrackerMouseState) => HoverTooltipState | null;
  chartViewportRef: RefObject<HTMLDivElement | null>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  tooltipRef: RefObject<HTMLDivElement | null>;
  zoomWidthMultiplier: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function buildTooltipSignature(label: number | undefined, payload: TrackerTooltipPayloadEntry[]): string {
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

function buildActiveChartMarkers(hoverTooltip: HoverTooltipState | null): ActiveChartMarker[] {
  if (!hoverTooltip?.active) return [];

  const markers: ActiveChartMarker[] = [];
  const seen = new Set<string>();
  const addMarker = (marker: ActiveChartMarker) => {
    if (!isFiniteNumber(marker.x) || !isFiniteNumber(marker.y) || seen.has(marker.key)) {
      return;
    }

    seen.add(marker.key);
    markers.push(marker);
  };

  for (const entry of hoverTooltip.payload ?? []) {
    const point = entry.payload;
    if (!point) continue;

    if (!point.isProjection && entry.dataKey === "ep") {
      addMarker({
        key: `main-${point.time}`,
        x: point.time,
        y: point.ep,
        color: "#3B82F6",
        radius: 6,
      });
    }

    if (point.isProjection) {
      if (isFiniteNumber(point.instantEp)) {
        addMarker({
          key: `projection-instant-${point.time}`,
          x: point.time,
          y: point.instantEp,
          color: "#ef4444",
          radius: 6,
        });
      }

      if (isFiniteNumber(point.dayEp)) {
        addMarker({
          key: `projection-day-${point.time}`,
          x: point.time,
          y: point.dayEp,
          color: "#3b82f6",
          radius: 6,
        });
      }
    }

    for (const [dataKey, comparisonPoint] of Object.entries(point.comparisonPoints ?? {})) {
      addMarker({
        key: `comparison-${dataKey}-${comparisonPoint.shiftedTime}`,
        x: comparisonPoint.shiftedTime,
        y: comparisonPoint.ep,
        color: comparisonPoint.color,
        radius: 5.5,
      });
    }
  }

  return markers;
}

export function useTrackerHoverTooltip({
  buildHoverTooltip,
  chartViewportRef,
  scrollContainerRef,
  tooltipRef,
  zoomWidthMultiplier,
}: UseTrackerHoverTooltipArgs) {
  const hoverTooltipRef = useRef<HoverTooltipState | null>(null);
  const tooltipAnimationFrameRef = useRef<number | null>(null);
  const hoverTooltipTimeoutRef = useRef<number | null>(null);
  const lastHoverTooltipUpdateRef = useRef(0);
  const pendingHoverStateRef = useRef<TrackerMouseState | null>(null);
  const layoutMetricsRef = useRef({
    containerHeight: 0,
    tooltipHeight: 0,
    tooltipWidth: 0,
    viewportWidth: 0,
  });
  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltipState | null>(null);

  const updateTooltipPosition = useCallback(() => {
    const currentHoverTooltip = hoverTooltipRef.current;
    if (!currentHoverTooltip?.active || !chartViewportRef.current || !tooltipRef.current || !scrollContainerRef.current) {
      return;
    }

    const viewport = scrollContainerRef.current;
    const tooltip = tooltipRef.current;
    const {
      containerHeight,
      tooltipHeight,
      tooltipWidth,
      viewportWidth,
    } = layoutMetricsRef.current;
    if (containerHeight <= 0 || tooltipWidth <= 0 || tooltipHeight <= 0 || viewportWidth <= 0) {
      return;
    }

    const visibleLeft = viewport.scrollLeft;
    const visibleRight = visibleLeft + viewportWidth;

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
  }, [chartViewportRef, scrollContainerRef, tooltipRef]);

  const scheduleTooltipPositionUpdate = useCallback(() => {
    if (tooltipAnimationFrameRef.current !== null) {
      return;
    }

    tooltipAnimationFrameRef.current = requestAnimationFrame(() => {
      tooltipAnimationFrameRef.current = null;
      updateTooltipPosition();
    });
  }, [updateTooltipPosition]);

  useLayoutEffect(() => {
    const container = chartViewportRef.current;
    const viewport = scrollContainerRef.current;
    const tooltip = tooltipRef.current;
    if (!container || !viewport || !tooltip) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const borderBox = entry.borderBoxSize[0];
        const width = borderBox?.inlineSize ?? entry.contentRect.width;
        const height = borderBox?.blockSize ?? entry.contentRect.height;
        if (entry.target === container) {
          layoutMetricsRef.current.containerHeight = height;
        } else if (entry.target === viewport) {
          layoutMetricsRef.current.viewportWidth = width;
        } else if (entry.target === tooltip) {
          layoutMetricsRef.current.tooltipWidth = width;
          layoutMetricsRef.current.tooltipHeight = height;
        }
      }
      scheduleTooltipPositionUpdate();
    });

    observer.observe(container);
    observer.observe(viewport);
    observer.observe(tooltip);
    return () => observer.disconnect();
  }, [chartViewportRef, scheduleTooltipPositionUpdate, scrollContainerRef, tooltipRef]);

  const flushTooltipPositionUpdate = useCallback(() => {
    if (tooltipAnimationFrameRef.current !== null) {
      cancelAnimationFrame(tooltipAnimationFrameRef.current);
      tooltipAnimationFrameRef.current = null;
    }

    updateTooltipPosition();
  }, [updateTooltipPosition]);

  const applyHoverTooltipState = useCallback((nextHoverTooltip: HoverTooltipState | null) => {
    if (!nextHoverTooltip) {
      hoverTooltipRef.current = null;
      setHoverTooltip((previous) => previous === null ? previous : null);
      return;
    }

    hoverTooltipRef.current = nextHoverTooltip;
    scheduleTooltipPositionUpdate();

    setHoverTooltip((previous) => {
      if (previous?.active && previous.signature === nextHoverTooltip.signature) {
        return previous;
      }

      return nextHoverTooltip;
    });
  }, [scheduleTooltipPositionUpdate]);

  const flushHoverTooltipUpdate = useCallback(() => {
    hoverTooltipTimeoutRef.current = null;
    lastHoverTooltipUpdateRef.current = performance.now();
    const pendingState = pendingHoverStateRef.current;
    pendingHoverStateRef.current = null;
    applyHoverTooltipState(pendingState ? buildHoverTooltip(pendingState) : null);
  }, [applyHoverTooltipState, buildHoverTooltip]);

  const scheduleHoverTooltipUpdate = useCallback((state: TrackerMouseState) => {
    pendingHoverStateRef.current = {
      isTooltipActive: state.isTooltipActive,
      activeLabel: state.activeLabel,
      activeCoordinate: state.activeCoordinate
        ? { x: state.activeCoordinate.x, y: state.activeCoordinate.y }
        : undefined,
    };

    if (hoverTooltipTimeoutRef.current !== null) {
      return;
    }

    // The cursor is updated directly by the chart pointer layer. Limiting the heavier tooltip and
    // marker reconciliation keeps dense multi-line charts responsive without dropping the latest point.
    const elapsed = performance.now() - lastHoverTooltipUpdateRef.current;
    const delay = Math.max(0, HOVER_TOOLTIP_UPDATE_INTERVAL_MS - elapsed);
    hoverTooltipTimeoutRef.current = window.setTimeout(flushHoverTooltipUpdate, delay);
  }, [flushHoverTooltipUpdate]);

  const clearHoverTooltip = useCallback(() => {
    pendingHoverStateRef.current = null;
    if (hoverTooltipTimeoutRef.current !== null) {
      window.clearTimeout(hoverTooltipTimeoutRef.current);
      hoverTooltipTimeoutRef.current = null;
    }

    applyHoverTooltipState(null);
  }, [applyHoverTooltipState]);

  useEffect(() => {
    return () => {
      if (hoverTooltipTimeoutRef.current !== null) {
        window.clearTimeout(hoverTooltipTimeoutRef.current);
        hoverTooltipTimeoutRef.current = null;
      }
      if (tooltipAnimationFrameRef.current !== null) {
        cancelAnimationFrame(tooltipAnimationFrameRef.current);
        tooltipAnimationFrameRef.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (!hoverTooltip?.active) {
      return;
    }

    // Tooltip content width can change between normal and projection payloads, so position it once before paint.
    flushTooltipPositionUpdate();
    scheduleTooltipPositionUpdate();
  }, [flushTooltipPositionUpdate, hoverTooltip, scheduleTooltipPositionUpdate, zoomWidthMultiplier]);

  const activeChartMarkers = useMemo(
    () => buildActiveChartMarkers(hoverTooltip),
    [hoverTooltip],
  );

  return {
    activeChartMarkers,
    clearHoverTooltip,
    hoverTooltip,
    scheduleHoverTooltipUpdate,
    scheduleTooltipPositionUpdate,
  };
}
