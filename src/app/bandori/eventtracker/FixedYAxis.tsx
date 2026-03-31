"use client";

interface FixedYAxisProps {
  ticks: number[] | undefined;
  domain: [number | string, number | string];
  chartHeight: number;
  scrollbarHeight: number;
  axisWidth: number;
  topMargin: number;
  bottomMargin: number;
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

/**
 * 固定纵坐标组件。
 *
 * 设计原因：主图已经承担了刻度与网格线计算，左侧固定坐标只需要复用同一套刻度结果，
 * 无需再额外渲染一张图表，从而减少不必要的重绘和布局计算。
 */
export default function FixedYAxis({
  ticks,
  domain,
  chartHeight,
  scrollbarHeight,
  axisWidth,
  topMargin,
  bottomMargin,
}: FixedYAxisProps) {
  const axisTicks = ticks ?? [];
  const domainMin = normalizeNumericBoundary(domain[0], axisTicks[0] ?? 0);
  const domainMax = normalizeNumericBoundary(domain[1], axisTicks[axisTicks.length - 1] ?? domainMin);
  const usableHeight = Math.max(0, chartHeight - scrollbarHeight - topMargin - bottomMargin);
  const domainSpan = domainMax - domainMin;

  return (
    <div
      className="relative h-full shrink-0 border-r border-gray-300/70 bg-white/60 dark:bg-[#111827]/70 select-none"
      style={{ width: `${axisWidth}px` }}
      aria-hidden="true"
    >
      <div
        className="absolute right-0 w-px bg-gray-300/70"
        style={{
          top: `${topMargin}px`,
          height: `${usableHeight}px`,
        }}
      />

      {axisTicks.map((tickValue) => {
        const progress = domainSpan <= 0 ? 1 : (tickValue - domainMin) / domainSpan;
        const top = topMargin + usableHeight * (1 - progress);

        return (
          <span
            key={tickValue}
            className="absolute right-2 -translate-y-1/2 text-[11px] leading-none text-gray-700 dark:text-gray-300"
            style={{ top: `${top}px` }}
          >
            {formatTrackerYAxisTick(tickValue)}
          </span>
        );
      })}
    </div>
  );
}