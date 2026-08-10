"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import type { BandoriEventStatus } from "@/lib/bandori/events/status";
import { formatBandoriTrackerUpdateAge } from "@/lib/bandori/event-tracker/time";
import { BESTDORI_PREDICTION_COLOR } from "./constants";
import type { TrackingMode } from "./types";

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
  status: BandoriEventStatus;
  trackingMode: TrackingMode;
};

function getStatusColorClass(status: BandoriEventStatus): string {
  if (status === "ongoing") {
    return "text-[var(--theme-color-status-ongoing-foreground)] dark:text-[var(--theme-color-status-ongoing-foreground-on-dark)]";
  }

  if (status === "ended") {
    return "text-[var(--theme-color-status-ended-foreground)] dark:text-[var(--theme-color-status-ended-foreground-on-dark)]";
  }

  return "text-[var(--theme-color-status-upcoming-foreground)] dark:text-[var(--theme-color-status-upcoming-foreground-on-dark)]";
}

function TimeAgo({ timestamp }: { timestamp: number }) {
  const t = useTranslations("bandori.events.tracker.summary");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { isStale } = formatBandoriTrackerUpdateAge(timestamp, now);
  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const label = elapsedSeconds < 60
    ? t("secondsAgo", { count: elapsedSeconds })
    : t("minutesAgo", { count: elapsedMinutes });

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
  const locale = useLocale();
  const t = useTranslations("bandori.events.tracker.summary");
  const statusT = useTranslations("bandori.events.status");
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  return (
    <div className="mb-3 flex flex-col gap-2.5 border-b border-[var(--theme-color-border-subtle)] px-1.5 pb-3.5 pt-0.5 sm:flex-row sm:items-center sm:justify-between sm:px-0 sm:pb-3 sm:pt-0 dark:border-slate-800/80">
      <div className="flex items-center gap-1.5 px-0.5 text-[13px] leading-5 sm:gap-2 sm:px-0 sm:text-sm">
        <span className="font-medium text-[var(--theme-color-text-muted)] dark:text-slate-400">{t("eventStatus")}</span>
        <span className={`font-bold ${getStatusColorClass(status)}`}>
          {statusT(status)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] leading-5 sm:gap-x-5 sm:text-sm">
        {status === "ongoing" && (
          <>
            {showScoreValues ? (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-medium text-[var(--theme-color-text-muted)] dark:text-slate-400">{t("latestScore")}</span>
                <span className="font-bold text-[var(--theme-color-semantic-info-foreground)] dark:text-[var(--theme-color-action-secondary-foreground-on-dark)]">
                  {scoreSummary.latestScore !== null ? numberFormatter.format(scoreSummary.latestScore) : "-"}
                </span>
              </div>
            ) : null}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-medium text-[var(--theme-color-text-muted)] dark:text-slate-400">{t("updateTime")}</span>
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
                  aria-label={isRefreshing ? t("updatingScore") : undefined}
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
                <span className="font-medium text-[var(--theme-color-text-muted)] dark:text-slate-400">{t("prediction")}</span>
                <span className="font-bold" style={{ color: BESTDORI_PREDICTION_COLOR }}>
                  {bestdoriPrediction.status === "loading"
                    ? t("loading")
                    : bestdoriPrediction.latestPrediction !== null
                      ? numberFormatter.format(bestdoriPrediction.latestPrediction)
                      : t("unavailable")}
                </span>
              </div>
            )}
          </>
        )}
        {status === "ended" && showScoreValues && (
          <>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-[var(--theme-color-text-muted)] dark:text-slate-400">{t("endScore")}</span>
              <span className="font-bold text-[var(--theme-color-text-default)] dark:text-slate-200">
                {scoreSummary.endScore !== null ? numberFormatter.format(scoreSummary.endScore) : t("settling")}
              </span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="text-[var(--theme-color-text-muted)] dark:text-slate-400">{t("finalScore")}</span>
              <span className="font-bold text-[var(--theme-color-text-default)] dark:text-slate-200">
                {scoreSummary.finalScore !== null ? numberFormatter.format(scoreSummary.finalScore) : t("settling")}
              </span>
              {scoreSummary.finalScore !== null && scoreSummary.endScore !== null && scoreSummary.finalScore < scoreSummary.endScore && (
                <span className="font-bold text-[var(--theme-color-semantic-danger-foreground)]">
                  (-{numberFormatter.format(scoreSummary.endScore - scoreSummary.finalScore)})
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
});
