"use client";

import { format } from "date-fns";
import { BESTDORI_PREDICTION_DATA_KEY } from "./constants";
import type { ComparisonPointInfo, TrackerData, TrackerTooltipPayloadEntry, TrackingMode } from "./types";

function getComparisonPointsFromPayload(payload: TrackerTooltipPayloadEntry[]): ComparisonPointInfo[] {
  const byKey = new Map<string, ComparisonPointInfo>();

  for (const entry of payload) {
    const comparisonPoints = entry.payload?.comparisonPoints;
    if (!comparisonPoints) continue;

    for (const [key, point] of Object.entries(comparisonPoints)) {
      byKey.set(key, point);
    }
  }

  return Array.from(byKey.entries())
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey, undefined, { numeric: true }))
    .map(([, point]) => point);
}

function ComparisonPointRows({
  points,
  unit,
}: {
  points: ComparisonPointInfo[];
  unit: string;
}) {
  if (points.length === 0) return null;

  return (
    <div className="mt-3 border-t border-gray-100 pt-2 dark:border-gray-700/50">
      {points.map((point) => (
        <div key={`${point.eventId}-${point.tier}-${point.shiftedTime}`} className="mt-1.5">
          <div className="flex items-center justify-between gap-5">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-bold" style={{ color: point.color }}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: point.color }} />
              <span className="truncate">{point.eventId}期 T{point.tier}</span>
            </span>
            <span className="shrink-0 text-sm font-bold" style={{ color: point.color }}>
              {new Intl.NumberFormat().format(point.ep)} {unit}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500">
            {format(point.originalTime, "yyyy/MM/dd HH:mm:ss")}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * TrackerTooltip —— 图表悬浮提示组件。
 *
 * 根据悬停点是真实数据还是投影虚拟点，展示不同内容：
 * - 投影点：显示投影终点时间和预测分数
 * - 真实点：显示时间、分数、瞬时速度、24h 速度及速度变化率
 */
export function TrackerTooltip({
  active,
  payload,
  label,
  trackingMode,
  displayedData,
}: {
  active?: boolean;
  payload?: TrackerTooltipPayloadEntry[];
  label?: number;
  trackingMode: TrackingMode;
  displayedData: TrackerData[];
}) {
  if (!active || !payload || payload.length === 0) return null;

  const visiblePayload = payload.filter((entry) => entry.dataKey !== BESTDORI_PREDICTION_DATA_KEY);
  if (visiblePayload.length === 0) return null;

  const unit = trackingMode === "song" ? "Pt" : "P";
  const comparisonPoints = getComparisonPointsFromPayload(visiblePayload);
  // ===== 投影点的悬浮提示 =====
  if (visiblePayload[0]?.payload?.isProjection) {
    const p = visiblePayload[0].payload;
    if (!p) return null;
    const projectionLabelTime = p.projectionEndTime ?? label;
    if (projectionLabelTime === undefined) return null;

    return (
      <div className="bg-white/95 p-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/40 dark:bg-[#131A2B]/95 dark:border-gray-800 min-w-[210px]">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
          {format(projectionLabelTime, "yyyy/MM/dd HH:mm:ss")}
        </p>

        {p.instantEp !== undefined && (
          <div className="mt-1 flex justify-between items-center gap-6">
            <span className="text-xs font-bold text-[#ef4444]">线性投影（瞬时）</span>
            <span className="text-sm font-bold text-[#ef4444]">
              {new Intl.NumberFormat().format(p.instantEp)} {unit}
            </span>
          </div>
        )}

        {p.dayEp !== undefined && (
          <div className="mt-1 flex justify-between items-center gap-6">
            <span className="text-xs font-bold text-[#3b82f6]">线性投影（24h）</span>
            <span className="text-sm font-bold text-[#3b82f6]">
              {new Intl.NumberFormat().format(p.dayEp)} {unit}
            </span>
          </div>
        )}

        <ComparisonPointRows points={comparisonPoints} unit={unit} />
      </div>
    );
  }

  // ===== 真实数据点的悬浮提示 =====
  const mainEntry = visiblePayload.find(
    (entry: TrackerTooltipPayloadEntry) => (
      entry?.dataKey === "ep" &&
      !entry?.payload?.isProjection &&
      entry?.payload?.ep !== undefined &&
      Number.isFinite(entry.payload.ep)
    )
  );
  if (label === undefined) return null;

  if (!mainEntry?.payload) {
    if (comparisonPoints.length === 0) return null;

    return (
      <div className="bg-white/95 p-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/40 dark:bg-[#131A2B]/95 dark:border-gray-800 min-w-[220px]">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          {format(label, "yyyy/MM/dd HH:mm:ss")}
        </p>
        <p className="mt-1 text-[11px] font-semibold text-gray-400 dark:text-gray-500">
          对比参考
        </p>
        <ComparisonPointRows points={comparisonPoints} unit={unit} />
      </div>
    );
  }

  const currentPoint = mainEntry.payload;
  const currentIndex = displayedData.findIndex((d: TrackerData) => d.time === currentPoint.time);
  const pointWithSpeeds = currentIndex !== -1 ? displayedData[currentIndex] : currentPoint;

  let speedRender = null;
  let speed24Render = null;

  if (pointWithSpeeds.speed !== undefined) {
    speedRender = (
      <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/50 flex justify-between items-center">
        <span className="text-xs font-bold text-gray-400">瞬时速度</span>
        <span className="text-[#f43f5e] font-bold text-sm">
          +{new Intl.NumberFormat().format(pointWithSpeeds.speed)} {unit}/h
        </span>
      </div>
    );
  }

  if (pointWithSpeeds.speed24 !== undefined) {
    let diffRender = null;
    if (pointWithSpeeds.refSpeed24 !== undefined && pointWithSpeeds.refSpeed24 !== 0) {
      let diffPercent = ((pointWithSpeeds.speed24 - pointWithSpeeds.refSpeed24) / pointWithSpeeds.refSpeed24) * 100;
      if (Math.abs(diffPercent) < 0.005) diffPercent = 0;
      const sign = diffPercent >= 0 ? "+" : "";
      const colorClass = diffPercent < 0 ? "text-red-500" : "text-blue-500";
      diffRender = (
        <div className="mt-0.5 flex justify-end">
          <span className={`${colorClass} font-bold text-xs`}>({sign}{diffPercent.toFixed(2)}%)</span>
        </div>
      );
    }

    speed24Render = (
      <div>
        <div className="mt-1 flex justify-between items-center">
          <span className="text-xs font-bold text-gray-400">24h速度</span>
          <span className="text-blue-500 font-bold text-sm">
            +{new Intl.NumberFormat().format(pointWithSpeeds.speed24)} {unit}/d
          </span>
        </div>
        {diffRender}
      </div>
    );
  }

  return (
    <div className="bg-white/95 p-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/40 dark:bg-[#131A2B]/95 dark:border-gray-800 min-w-[180px]">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
        {format(label, "yyyy/MM/dd HH:mm:ss")}
      </p>
      <div className="flex items-end gap-2">
        <span className="text-blue-500 font-extrabold text-2xl leading-none">
          {new Intl.NumberFormat().format(currentPoint.ep)}
        </span>
        <span className="text-sm font-bold text-blue-500/70 mb-0.5">{unit}</span>
      </div>
      {speedRender}
      {speed24Render}
      <ComparisonPointRows points={comparisonPoints} unit={unit} />
    </div>
  );
}
