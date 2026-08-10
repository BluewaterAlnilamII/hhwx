"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  getBandoriEventStatusAt,
  type BandoriEventStatus,
} from "@/lib/bandori/events/status";
import { cn } from "@/lib/utils";
import EventRelativeCountdown from "./EventRelativeCountdown";

const EVENT_STATUS_TONES: Record<BandoriEventStatus, string> = {
  upcoming: "border border-[var(--theme-color-status-upcoming-border)] bg-[var(--theme-color-status-upcoming-background)] text-[var(--theme-color-status-upcoming-foreground)] dark:text-[var(--theme-color-status-upcoming-foreground-on-dark)]",
  ongoing: "border border-[var(--theme-color-status-ongoing-border)] bg-[var(--theme-color-status-ongoing-background)] text-[var(--theme-color-status-ongoing-foreground)] dark:text-[var(--theme-color-status-ongoing-foreground-on-dark)]",
  ended: "border border-[var(--theme-color-status-ended-border)] bg-[var(--theme-color-status-ended-background)] text-[var(--theme-color-status-ended-foreground)] dark:text-[var(--theme-color-status-ended-foreground-on-dark)]",
};

type EventStatusSummaryProps = {
  startAt: number | null;
  endAt: number | null;
};

export default function EventStatusSummary({
  startAt,
  endAt,
}: EventStatusSummaryProps) {
  const t = useTranslations("bandori.events.status");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const status = getBandoriEventStatusAt(now, startAt, endAt);

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className={cn("inline-flex rounded-full px-3 py-1", EVENT_STATUS_TONES[status])}>
        {t(status)}
      </span>
      {status === "upcoming" && startAt !== null ? (
        <span className="text-sm font-semibold text-[var(--theme-color-text-default)] dark:text-slate-100">
          <EventRelativeCountdown target="start" remainingMs={startAt - now} />
        </span>
      ) : null}
      {status === "ongoing" && endAt !== null ? (
        <span className="text-sm font-semibold text-[var(--theme-color-text-default)] dark:text-slate-100">
          <EventRelativeCountdown target="end" remainingMs={endAt - now} />
        </span>
      ) : null}
    </span>
  );
}
