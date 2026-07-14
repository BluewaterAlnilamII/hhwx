"use client";

import { memo, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { formatBandoriTrackerUpdateAge } from "@/lib/bandori-tracker-time";
import { BESTDORI_PREDICTION_COLOR } from "./constants";
import type { TrackingMode } from "./types";

const TRACKER_STATUS_NUMBER_FORMATTER = new Intl.NumberFormat();

export type TrackerScoreSummary = {
  latestScore: number | null;
  latestUpdateTime: number | null;
  endScore: number | null;
  finalScore: number | null;
};

type TrackerStatusSummaryProps = {
  bestdoriPrediction: {
    latestPrediction: number | null;
    status: string;
  };
  scoreSummary: TrackerScoreSummary;
  isRefreshing: boolean;
  showBestdoriPrediction: boolean;
  status: string;
  trackingMode: TrackingMode;
};

function TimeAgo({ timestamp }: { timestamp: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { isStale, label } = formatBandoriTrackerUpdateAge(timestamp, now);

  return isStale ? (
    <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-1 py-0.5 text-xs font-semibold tabular-nums text-red-600 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-200">
      {label}
    </span>
  ) : (
    <span className="text-[13px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
      {label}
    </span>
  );
}

export const TrackerStatusSummary = memo(function TrackerStatusSummary({
  bestdoriPrediction,
  scoreSummary,
  isRefreshing,
  showBestdoriPrediction,
  status,
  trackingMode,
}: TrackerStatusSummaryProps) {
  return (
    <div className="mb-3 flex flex-col gap-2.5 border-b border-slate-200/75 px-1.5 pb-3.5 pt-0.5 dark:border-slate-800/80 sm:flex-row sm:items-center sm:justify-between sm:px-0 sm:pb-3 sm:pt-0">
      <div className="flex items-center gap-1.5 px-0.5 text-[13px] leading-5 sm:gap-2 sm:px-0 sm:text-sm">
        <span className="font-medium text-slate-500 dark:text-slate-400">活动状态</span>
        <span className={`font-bold ${status === "进行中" ? "text-emerald-500 dark:text-emerald-300" : status === "已结束" ? "text-slate-500 dark:text-slate-300" : "text-blue-500 dark:text-sky-300"}`}>
          {status}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] leading-5 sm:gap-x-5 sm:text-sm">
        {status === "进行中" && (
          <>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-medium text-slate-500 dark:text-slate-400">最新分数</span>
              <span className="font-bold text-blue-500 dark:text-sky-300">
                {scoreSummary.latestScore !== null ? TRACKER_STATUS_NUMBER_FORMATTER.format(scoreSummary.latestScore) : "-"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-medium text-slate-500 dark:text-slate-400">更新时间</span>
              <span
                className="grid w-[4.875rem] shrink-0 grid-cols-[3.75rem_0.875rem] items-center gap-1"
                data-testid="tracker-update-status"
              >
                {scoreSummary.latestUpdateTime !== null
                  ? <TimeAgo timestamp={scoreSummary.latestUpdateTime} />
                  : <span className="text-[13px] font-medium text-slate-400 dark:text-slate-500">-</span>
                }
                <Loader2
                  aria-hidden={!isRefreshing}
                  aria-label={isRefreshing ? "正在更新分数线" : undefined}
                  className={`h-3.5 w-3.5 text-blue-500 transition-opacity dark:text-sky-300 ${
                    isRefreshing
                      ? "animate-spin opacity-100 motion-reduce:animate-none"
                      : "opacity-0"
                  }`}
                />
              </span>
            </div>
            {trackingMode === "event" && showBestdoriPrediction && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-medium text-slate-500 dark:text-slate-400">Bestdori预测</span>
                <span className="font-bold" style={{ color: BESTDORI_PREDICTION_COLOR }}>
                  {bestdoriPrediction.status === "loading"
                    ? "加载中"
                    : bestdoriPrediction.latestPrediction !== null
                      ? TRACKER_STATUS_NUMBER_FORMATTER.format(bestdoriPrediction.latestPrediction)
                      : "不可用"}
                </span>
              </div>
            )}
          </>
        )}
        {status === "已结束" && (
          <>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-slate-500 dark:text-slate-400">结束分数</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {scoreSummary.endScore !== null ? TRACKER_STATUS_NUMBER_FORMATTER.format(scoreSummary.endScore) : "结算中"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-slate-500 dark:text-slate-400">最终分数</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">
                {scoreSummary.finalScore !== null ? TRACKER_STATUS_NUMBER_FORMATTER.format(scoreSummary.finalScore) : "结算中"}
              </span>
              {scoreSummary.finalScore !== null && scoreSummary.endScore !== null && scoreSummary.finalScore < scoreSummary.endScore && (
                <span className="font-bold text-red-500">
                  (-{TRACKER_STATUS_NUMBER_FORMATTER.format(scoreSummary.endScore - scoreSummary.finalScore)})
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
});
