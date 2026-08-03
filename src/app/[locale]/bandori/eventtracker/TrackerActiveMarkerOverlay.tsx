"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type CSSProperties,
} from "react";

import { BANDORI_TOPDATA_MAX_SAMPLE_SIZE } from "@/lib/bandori-topdata-contract";
import type { ActiveChartMarker } from "./useTrackerHoverTooltip";

type ChartMargin = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type TrackerActiveMarkerOverlayProps = {
  markers: ActiveChartMarker[];
  domainEnd: number | "auto";
  domainStart: number | "auto";
  margin: ChartMargin;
  xAxisHeight: number;
  yDomain: [number | string, number | string];
};

export type TrackerActiveMarkerOverlayHandle = {
  clearMarkers: () => void;
  updateMarkers: (markers: ActiveChartMarker[]) => void;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toAxisPosition(
  progress: number,
  startInset: number,
  endInset: number,
): string {
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const offset = startInset * (1 - clampedProgress) - endInset * clampedProgress;
  return `calc(${clampedProgress * 100}% + ${offset}px)`;
}

/**
 * Renders transient hover markers outside Recharts' component tree.
 *
 * Recharts 3 coordinates z-indexed reference elements through its internal store. Keeping rapidly
 * changing markers in a lightweight overlay avoids re-coordinating every static line on hover.
 */
export const TrackerActiveMarkerOverlay = memo(forwardRef<
  TrackerActiveMarkerOverlayHandle,
  TrackerActiveMarkerOverlayProps
>(function TrackerActiveMarkerOverlay({
  markers,
  domainEnd,
  domainStart,
  margin,
  xAxisHeight,
  yDomain,
}, ref) {
  const yDomainStart = yDomain[0];
  const yDomainEnd = yDomain[1];
  const overlayRef = useRef<HTMLDivElement>(null);
  const overlaySizeRef = useRef({ height: 0, width: 0 });
  const activeMarkerRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const hasValidDomain = (
    isFiniteNumber(domainStart) &&
    isFiniteNumber(domainEnd) &&
    domainEnd > domainStart &&
    isFiniteNumber(yDomainStart) &&
    isFiniteNumber(yDomainEnd) &&
    yDomainEnd > yDomainStart
  );
  const xSpan = hasValidDomain ? domainEnd - domainStart : 0;
  const ySpan = hasValidDomain ? yDomainEnd - yDomainStart : 0;

  const getMarkerStyle = useCallback((marker: ActiveChartMarker): CSSProperties | null => {
    if (!hasValidDomain) return null;

    const xProgress = (marker.x - domainStart) / xSpan;
    const yProgress = (yDomainEnd - marker.y) / ySpan;
    if (xProgress < 0 || xProgress > 1 || yProgress < 0 || yProgress > 1) {
      return null;
    }

    const diameter = marker.radius * 2;
    return {
      backgroundColor: marker.color,
      borderRadius: "9999px",
      height: diameter,
      left: toAxisPosition(xProgress, margin.left, margin.right),
      top: toAxisPosition(yProgress, margin.top, margin.bottom + xAxisHeight),
      transform: "translate3d(-50%, -50%, 0)",
      visibility: "visible",
      width: diameter,
    };
  }, [domainStart, hasValidDomain, margin, xAxisHeight, xSpan, yDomainEnd, ySpan]);

  const getActiveMarkerStyle = useCallback((marker: ActiveChartMarker): CSSProperties | null => {
    if (!hasValidDomain) return null;

    const { height, width } = overlaySizeRef.current;
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom - xAxisHeight;
    if (plotWidth <= 0 || plotHeight <= 0) return null;

    const xProgress = (marker.x - domainStart) / xSpan;
    const yProgress = (yDomainEnd - marker.y) / ySpan;
    if (xProgress < 0 || xProgress > 1 || yProgress < 0 || yProgress > 1) {
      return null;
    }

    const diameter = marker.radius * 2;
    const x = margin.left + xProgress * plotWidth;
    const y = margin.top + yProgress * plotHeight;
    return {
      backgroundColor: marker.color,
      borderRadius: "9999px",
      height: `${diameter}px`,
      transform: `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate3d(-50%, -50%, 0)`,
      visibility: "visible",
      width: `${diameter}px`,
    };
  }, [domainStart, hasValidDomain, margin, xAxisHeight, xSpan, yDomainEnd, ySpan]);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      overlaySizeRef.current = {
        height: entry.contentRect.height,
        width: entry.contentRect.width,
      };
    });
    observer.observe(overlay);
    return () => observer.disconnect();
  }, [hasValidDomain]);

  useImperativeHandle(ref, () => ({
    clearMarkers: () => {
      for (const markerElement of activeMarkerRefs.current) {
        if (!markerElement) continue;
        markerElement.style.visibility = "hidden";
        markerElement.removeAttribute("data-tracker-active-marker");
      }
    },
    updateMarkers: (activeMarkers) => {
      for (let index = 0; index < BANDORI_TOPDATA_MAX_SAMPLE_SIZE; index += 1) {
        const markerElement = activeMarkerRefs.current[index];
        const marker = activeMarkers[index];
        const style = marker ? getActiveMarkerStyle(marker) : null;
        if (!markerElement || !marker || !style) {
          if (markerElement) {
            markerElement.style.visibility = "hidden";
          }
          continue;
        }

        Object.assign(markerElement.style, style);
      }
    },
  }), [getActiveMarkerStyle]);

  if (!hasValidDomain) return null;

  const markerElements = markers.flatMap((marker) => {
    const style = getMarkerStyle(marker);
    if (!style) return [];

    return [
      <span
        key={marker.key}
        className="absolute"
        data-tracker-active-marker={marker.key}
        style={style}
      />,
    ];
  });

  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      data-testid="tracker-active-marker-overlay"
    >
      {markerElements}
      {Array.from({ length: BANDORI_TOPDATA_MAX_SAMPLE_SIZE }, (_, index) => (
        <span
          key={`active-marker-slot-${index}`}
          ref={(element) => {
            activeMarkerRefs.current[index] = element;
          }}
          className="absolute left-0 top-0 will-change-transform"
          data-tracker-hover-marker=""
          style={{ visibility: "hidden" }}
        />
      ))}
    </div>
  );
}));
