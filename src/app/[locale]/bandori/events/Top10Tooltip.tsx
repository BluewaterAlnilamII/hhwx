"use client";

import { useMemo } from "react";

import type { BandoriServer } from "@/lib/bandori-server";
import type { BandoriTop10Player } from "@/lib/bandori-top10-view";
import type { HoverTooltipState } from "./useTrackerHoverTooltip";

const SERVER_TIME_ZONES = ["Asia/Tokyo", "UTC", "Asia/Taipei", "Asia/Shanghai"] as const;
const SCORE_FORMATTER = new Intl.NumberFormat("zh-CN");

type Top10TooltipProps = {
  players: BandoriTop10Player[];
  server: BandoriServer;
  tooltip: HoverTooltipState;
};

export function Top10Tooltip({ players, server, tooltip }: Top10TooltipProps) {
  const playerByDataKey = useMemo(
    () => new Map(players.map((player) => [player.dataKey, player])),
    [players],
  );
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat("zh-CN", {
    timeZone: SERVER_TIME_ZONES[server],
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }), [server]);
  const rows = (tooltip.payload ?? []).flatMap((entry) => {
    const player = playerByDataKey.get(String(entry.dataKey ?? ""));
    const score = entry.payload?.ep;
    return player && typeof score === "number" && Number.isFinite(score)
      ? [{ player, score }]
      : [];
  });

  if (tooltip.label === undefined || rows.length === 0) {
    return null;
  }

  return (
    <div className="min-w-[220px] rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-surface-background)]/95 p-4 shadow-[var(--theme-shadow-floating)] dark:border-gray-800 dark:bg-[#131A2B]/95">
      <p className="mb-2 text-xs font-semibold text-[var(--theme-color-text-muted)] dark:text-gray-400">
        {dateFormatter.format(tooltip.label)}
      </p>
      <div className="space-y-1.5">
        {rows.map(({ player, score }) => (
          <div key={player.uid} className="flex items-center justify-between gap-5">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-bold" style={{ color: player.color }}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: player.color }} />
              <span className="max-w-40 whitespace-pre-line break-words">{player.name || String(player.uid)}</span>
            </span>
            <span className="shrink-0 text-sm font-bold" style={{ color: player.color }}>
              {SCORE_FORMATTER.format(score)} P
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
