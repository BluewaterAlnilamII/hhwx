"use client";

interface FixedYAxisProps {
  ticks: number[] | undefined;
  domain: [number | string, number | string];
  chartHeight: number;
  axisWidth: number;
  topMargin: number;
  bottomMargin: number;
  xAxisHeight: number;
}

function formatTrackerYAxisTick(value: number): string {
  if (value === 0) {
    return "0";
  }

  if (value % 1000000 === 0 && value >= 1000000) {
    return `${value / 1000000}M`;
  }

  if (value % 100000 === 0 && value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }

  if (value >= 1000) {
    return `${value / 1000}K`;
  }

  return value.toString();
}

function normalizeNumericBoundary(value: number | string, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

// Reuse the plot's ticks instead of rendering another chart for the fixed axis.
export default function FixedYAxis({
  ticks,
  domain,
  chartHeight,
  axisWidth,
  topMargin,
  bottomMargin,
  xAxisHeight,
}: FixedYAxisProps) {
  const axisTicks = ticks ?? [];
  const domainMin = normalizeNumericBoundary(domain[0], axisTicks[0] ?? 0);
  const domainMax = normalizeNumericBoundary(domain[1], axisTicks[axisTicks.length - 1] ?? domainMin);
  const usableHeight = Math.max(0, chartHeight - topMargin - bottomMargin - xAxisHeight);
  const domainSpan = domainMax - domainMin;

  return (
    <div
      className="relative z-0 h-full shrink-0 select-none"
      style={{ width: `${axisWidth}px`, touchAction: "pan-y pinch-zoom" }}
      data-testid="tracker-y-axis"
      aria-hidden="true"
    >
      <div
        className="absolute left-0 w-px bg-[var(--theme-color-border-subtle)]"
        style={{
          top: `${topMargin}px`,
          height: `${usableHeight}px`,
        }}
      />

      {axisTicks.map((tickValue) => {
        const progress = domainSpan <= 0 ? 1 : (tickValue - domainMin) / domainSpan;
        const top = Math.round(topMargin + usableHeight * (1 - progress));

        return (
          <span
            key={tickValue}
            className="absolute left-2 -translate-y-1/2 text-[11px] leading-none text-[var(--theme-color-text-muted)]"
            style={{ top: `${top}px` }}
          >
            {formatTrackerYAxisTick(tickValue)}
          </span>
        );
      })}
    </div>
  );
}
