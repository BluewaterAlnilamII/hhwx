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
  showScoreValues?: boolean;
  status: string;
  trackingMode: TrackingMode;
};

function getStatusColorClass(status: string): string {
  if (status === "进行中") {
    return "text-[var(--theme-color-status-ongoing-foreground)] dark:text-[var(--theme-color-status-ongoing-foreground-on-dark)]";
  }

  if (status === "已结束") {
    return "text-[var(--theme-color-status-ended-foreground)] dark:text-[var(--theme-color-status-ended-foreground-on-dark)]";
  }

  return "text-[var(--theme-color-status-upcoming-foreground)] dark:text-[var(--theme-color-status-upcoming-foreground-on-dark)]";
}

function TimeAgo({ timestamp }: { timestamp: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { isStale, label } = formatBandoriTrackerUpdateAge(timestamp, now);

  return isStale ? (
    <span className="inline-flex items-center rounded-full border border-[var(--theme-color-semantic-warning-border)] bg-[var(--theme-color-semantic-warning-background)] px-1 py-0.5 text-xs font-semibold tabular-nums text-[var(--theme-color-semantic-warning-foreground)] dark:text-[var(--theme-color-semantic-warning-foreground-on-dark)]">
      {label}
    </span>
  ) : (
    <span className="text-[13px] font-medium tabular-nums text-[var(--theme-color-text-muted)] dark:text-slate-400">
      {label}
    </span>
  );
}

export const TrackerStatusSummary = memo(function TrackerStatusSummary({
  bestdoriPrediction,
  scoreSummary,
  isRefreshing,
  showBestdoriPrediction,
  showScoreValues = true,
  status,
  trackingMode,
}: TrackerStatusSummaryProps) {
  return (
    <div className="mb-3 flex flex-col gap-2.5 border-b border-[var(--theme-color-border-subtle)] px-1.5 pb-3.5 pt-0.5 sm:flex-row sm:items-center sm:justify-between sm:px-0 sm:pb-3 sm:pt-0 dark:border-slate-800/80">
      <div className="flex items-center gap-1.5 px-0.5 text-[13px] leading-5 sm:gap-2 sm:px-0 sm:text-sm">
        <span className="font-medium text-[var(--theme-color-text-muted)] dark:text-slate-400">活动状态</span>
        <span className={`font-bold ${getStatusColorClass(status)}`}>
          {status}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] leading-5 sm:gap-x-5 sm:text-sm">
        {status === "进行中" && (
          <>
            {showScoreValues ? (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-medium text-[var(--theme-color-text-muted)] dark:text-slate-400">最新分数</span>
                <span className="font-bold text-[var(--theme-color-semantic-info-foreground)] dark:text-[var(--theme-color-action-secondary-foreground-on-dark)]">
                  {scoreSummary.latestScore !== null ? TRACKER_STATUS_NUMBER_FORMATTER.format(scoreSummary.latestScore) : "-"}
                </span>
              </div>
            ) : null}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-medium text-[var(--theme-color-text-muted)] dark:text-slate-400">更新时间</span>
              <span
                className="grid w-19.5 shrink-0 grid-cols-[3.75rem_0.875rem] items-center gap-1"
                data-testid="tracker-update-status"
              >
                {scoreSummary.latestUpdateTime !== null
                  ? <TimeAgo timestamp={scoreSummary.latestUpdateTime} />
                  : <span className="text-[13px] font-medium text-[var(--theme-color-text-muted)] opacity-60 dark:text-slate-500">-</span>
                }
                <Loader2
                  aria-hidden={!isRefreshing}
                  aria-label={isRefreshing ? "正在更新分数线" : undefined}
                  className={`h-3.5 w-3.5 text-[var(--theme-color-semantic-info-foreground)] transition-opacity dark:text-[var(--theme-color-action-secondary-foreground-on-dark)] ${
                    isRefreshing
                      ? "animate-spin opacity-100 motion-reduce:animate-none"
                      : "opacity-0"
                  }`}
                />
              </span>
            </div>
            {trackingMode === "event" && showBestdoriPrediction && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-medium text-[var(--theme-color-text-muted)] dark:text-slate-400">Bestdori预测</span>
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
        {status === "已结束" && showScoreValues && (
          <>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-[var(--theme-color-text-muted)] dark:text-slate-400">结束分数</span>
              <span className="font-bold text-[var(--theme-color-text-default)] dark:text-slate-200">
                {scoreSummary.endScore !== null ? TRACKER_STATUS_NUMBER_FORMATTER.format(scoreSummary.endScore) : "结算中"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-[var(--theme-color-text-muted)] dark:text-slate-400">最终分数</span>
              <span className="font-bold text-[var(--theme-color-text-default)] dark:text-slate-200">
                {scoreSummary.finalScore !== null ? TRACKER_STATUS_NUMBER_FORMATTER.format(scoreSummary.finalScore) : "结算中"}
              </span>
              {scoreSummary.finalScore !== null && scoreSummary.endScore !== null && scoreSummary.finalScore < scoreSummary.endScore && (
                <span className="font-bold text-[var(--theme-color-semantic-danger-foreground)]">
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
