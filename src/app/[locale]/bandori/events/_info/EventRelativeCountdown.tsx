"use client";

import { useTranslations } from "next-intl";

type EventRelativeCountdownProps = {
  target: "start" | "end";
  remainingMs: number;
};

export default function EventRelativeCountdown({
  target,
  remainingMs,
}: EventRelativeCountdownProps) {
  const t = useTranslations("bandori.events.countdown");

  if (remainingMs <= 0) {
    return <span>{t(target === "start" ? "started" : "ended")}</span>;
  }

  const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000).toString().padStart(2, "0");

  return (
    <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
      <span>{t(target === "start" ? "untilStart" : "untilEnd")}</span>
      <span className="inline-flex items-baseline gap-0.5">
        <span className="text-[var(--theme-color-semantic-info-foreground)]">{days}</span>
        <span>{t("days")}</span>
        <span className="text-[var(--theme-color-semantic-info-foreground)]">{hours}</span>
        <span>{t("hours")}</span>
        <span className="text-[var(--theme-color-semantic-info-foreground)]">{minutes}</span>
        <span>{t("minutes")}</span>
        <span className="inline-flex min-w-[2ch] justify-end text-[var(--theme-color-semantic-info-foreground)] tabular-nums">{seconds}</span>
        <span>{t("seconds")}</span>
      </span>
    </span>
  );
}
