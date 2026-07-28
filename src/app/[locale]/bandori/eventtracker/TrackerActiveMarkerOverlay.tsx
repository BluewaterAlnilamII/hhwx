"use client";

import { memo, type CSSProperties } from "react";

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
export const TrackerActiveMarkerOverlay = memo(function TrackerActiveMarkerOverlay({
  markers,
  domainEnd,
  domainStart,
  margin,
  xAxisHeight,
  yDomain,
}: TrackerActiveMarkerOverlayProps) {
  const yDomainStart = yDomain[0];
  const yDomainEnd = yDomain[1];
  if (
    markers.length === 0 ||
    !isFiniteNumber(domainStart) ||
    !isFiniteNumber(domainEnd) ||
    domainEnd <= domainStart ||
    !isFiniteNumber(yDomainStart) ||
    !isFiniteNumber(yDomainEnd) ||
    yDomainEnd <= yDomainStart
  ) {
    return null;
  }

  const xSpan = domainEnd - domainStart;
  const ySpan = yDomainEnd - yDomainStart;
  const markerElements = markers.flatMap((marker) => {
    const xProgress = (marker.x - domainStart) / xSpan;
    const yProgress = (yDomainEnd - marker.y) / ySpan;
    if (xProgress < 0 || xProgress > 1 || yProgress < 0 || yProgress > 1) {
      return [];
    }

    const diameter = marker.radius * 2;
    const style: CSSProperties = {
      backgroundColor: marker.color,
      borderRadius: "9999px",
      height: diameter,
      left: toAxisPosition(xProgress, margin.left, margin.right),
      top: toAxisPosition(yProgress, margin.top, margin.bottom + xAxisHeight),
      transform: "translate3d(-50%, -50%, 0)",
      width: diameter,
    };

    return [
      <span
        key={marker.key}
        className="absolute"
        data-tracker-active-marker={marker.key}
        style={style}
      />,
    ];
  });

  if (markerElements.length === 0) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      data-testid="tracker-active-marker-overlay"
    >
      {markerElements}
    </div>
  );
});
