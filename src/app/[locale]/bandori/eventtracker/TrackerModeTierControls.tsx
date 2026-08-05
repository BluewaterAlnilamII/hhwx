"use client";

import { memo, type MutableRefObject, type RefObject } from "react";
import * as Tabs from "@radix-ui/react-tabs";

import type { TrackingMode } from "./types";
import type { MonthlyRankingOption } from "./useChartData";

type ModeIndicatorStyle = {
  width: number;
  height: number;
  x: number;
  y: number;
  ready: boolean;
};

type TrackerModeTierControlsProps = {
  availableChallengeSongIds: number[];
  challengeSongGridClassName: string;
  challengeSongTitleMap: Record<string, string> | null | undefined;
  isSongModeDisabled: boolean;
  isTop10Selected: boolean;
  modeIndicatorStyle: ModeIndicatorStyle;
  modeTabsListRef: RefObject<HTMLDivElement | null>;
  modeTriggerRefs: MutableRefObject<Record<TrackingMode, HTMLButtonElement | null>>;
  monthlyRankingOptions: MonthlyRankingOption[];
  onMonthlyMonthChange: (monthId: number) => void;
  onSongChange: (songId: number) => void;
  onTierChange: (tier: number) => void;
  onTop10Change: () => void;
  resolvedSelectedSongId: number;
  selectedMonthlyMonthId: number;
  selectedTier: number;
  tierOptions: readonly number[];
  trackingMode: TrackingMode;
};

const TRACKING_MODE_OPTIONS = [
  { id: "event", label: "活动排行" },
  { id: "song", label: "歌曲排行" },
  { id: "monthly", label: "月度排行" },
] as const;

export const TrackerModeTierControls = memo(function TrackerModeTierControls({
  availableChallengeSongIds,
  challengeSongGridClassName,
  challengeSongTitleMap,
  isSongModeDisabled,
  isTop10Selected,
  modeIndicatorStyle,
  modeTabsListRef,
  modeTriggerRefs,
  monthlyRankingOptions,
  onMonthlyMonthChange,
  onSongChange,
  onTierChange,
  onTop10Change,
  resolvedSelectedSongId,
  selectedMonthlyMonthId,
  selectedTier,
  tierOptions,
  trackingMode,
}: TrackerModeTierControlsProps) {
  return (
    <div className="flex flex-col gap-3.5 items-stretch xl:flex-row xl:items-start xl:gap-4">
      <Tabs.List
        ref={modeTabsListRef}
        className="relative flex w-full flex-row justify-center gap-1 overflow-x-auto rounded-[20px] border border-[var(--theme-color-border-default)] bg-[var(--theme-color-surface-background)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] xl:w-[7.1rem] xl:flex-none xl:flex-col xl:self-start xl:overflow-visible dark:border-slate-700/80 dark:bg-slate-950/70 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 z-0 rounded-[16px] bg-[var(--theme-color-selection-subtle-background)] shadow-[0_8px_18px_rgba(0,102,153,0.14)] ring-1 ring-inset ring-[var(--theme-color-selection-subtle-ring)] transition-[transform,width,height,opacity] duration-300 ease-out dark:bg-slate-800 dark:ring-sky-400/30"
          style={{
            width: `${modeIndicatorStyle.width}px`,
            height: `${modeIndicatorStyle.height}px`,
            transform: `translate(${modeIndicatorStyle.x}px, ${modeIndicatorStyle.y}px)`,
            opacity: modeIndicatorStyle.ready ? 1 : 0,
          }}
        />
        {TRACKING_MODE_OPTIONS.map((mode) => {
          const disabled = mode.id === "song" && isSongModeDisabled;
          const toneClassName = disabled
            ? "cursor-not-allowed text-[var(--theme-color-text-muted)] opacity-40 hover:text-[var(--theme-color-text-muted)] dark:text-slate-600 dark:hover:text-slate-600"
            : "data-[state=active]:text-[var(--theme-color-selection-subtle-foreground)] data-[state=inactive]:text-[var(--theme-color-text-muted)] hover:text-[var(--theme-color-text-default)] dark:data-[state=active]:text-[var(--theme-color-action-secondary-foreground-on-dark)] dark:data-[state=inactive]:text-slate-300 dark:hover:text-white";

          return (
            <Tabs.Trigger
              key={mode.id}
              ref={(node) => {
                modeTriggerRefs.current[mode.id] = node;
              }}
              value={mode.id}
              disabled={disabled}
              aria-disabled={disabled}
              title={disabled ? "该活动类型没有歌曲排行" : undefined}
              className={`relative z-10 min-h-[2.85rem] flex-1 rounded-[16px] px-3 py-1.5 text-[14px] font-semibold tracking-[0.01em] text-center whitespace-nowrap outline-hidden transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-color-focus-ring)] ${toneClassName} xl:flex-none`}
            >
              {mode.label}
            </Tabs.Trigger>
          );
        })}
      </Tabs.List>

      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {trackingMode === "song" && availableChallengeSongIds.length > 0 && (
          <div className="overflow-visible rounded-none border border-transparent bg-transparent p-2 sm:p-2.5 shadow-none">
            <div className="mb-2 px-1 text-xs font-bold tracking-[0.1em] text-[var(--theme-color-feedback-info-foreground)] sm:text-[13px] dark:text-[var(--theme-color-action-secondary-foreground-on-dark)]">
              挑战曲目
            </div>
            <div className={`grid w-full gap-2 sm:gap-2.5 ${challengeSongGridClassName}`}>
              {availableChallengeSongIds.map((songId) => {
                const songLabel = challengeSongTitleMap?.[String(songId)] ?? `曲目 ${songId}`;

                return (
                  <button
                    key={songId}
                    type="button"
                    onClick={() => onSongChange(songId)}
                    title={`曲目 ${songId}`}
                    className={`group relative flex min-h-[2.75rem] w-full items-center justify-center overflow-hidden rounded-[17px] border px-3 py-1.5 text-center outline-hidden transition-all duration-300 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-color-focus-ring)] sm:min-h-[3.35rem] sm:px-3.5 sm:py-2 ${
                      resolvedSelectedSongId === songId
                        ? "border-transparent bg-[var(--theme-color-selection-strong-background)] text-[var(--theme-color-selection-strong-foreground)] shadow-sm ring-2 ring-[var(--theme-color-selection-strong-ring)] ring-offset-1 ring-offset-[var(--theme-color-surface-background)]"
                        : "border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-text-muted)] shadow-sm hover:border-[var(--theme-color-action-secondary-border)] hover:bg-[var(--theme-color-control-background-hover)] hover:text-[var(--theme-color-text-default)] hover:shadow-md dark:border-slate-600/80 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-sky-400/60 dark:hover:bg-slate-700 dark:hover:text-sky-100"
                    }`}
                  >
                    <span className="eventtracker-song-button-label text-[13px] font-semibold tracking-[0.005em] sm:text-sm">
                      {songLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {trackingMode === "monthly" && (
          <div className="overflow-visible rounded-none border border-transparent bg-transparent px-2 pt-1 pb-0 shadow-none sm:px-2.5 sm:pt-1 sm:pb-0">
            <div className="mb-2 px-1 text-xs font-bold tracking-[0.1em] text-[var(--theme-color-feedback-info-foreground)] sm:text-[13px] dark:text-[var(--theme-color-action-secondary-foreground-on-dark)]">
              选择月份
            </div>
            <select
              className="h-8 w-full max-w-[12rem] rounded-full border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] px-3 text-xs font-semibold text-[var(--theme-color-text-muted)] outline-none transition-colors hover:border-[var(--theme-color-action-secondary-border)] focus:ring-2 focus:ring-[var(--theme-color-focus-ring)] sm:h-9 sm:text-sm dark:border-gray-700 dark:bg-[#131A2B] dark:text-gray-300"
              value={selectedMonthlyMonthId}
              onChange={(event) => onMonthlyMonthChange(Number(event.target.value))}
            >
              {monthlyRankingOptions.map((option) => (
                <option key={option.monthId} value={option.monthId}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="overflow-visible rounded-none border border-transparent bg-transparent px-2 pt-1 pb-2 shadow-none sm:px-2.5 sm:pt-1 sm:pb-2.5">
          <div className="mb-2 px-1 text-xs font-bold tracking-[0.1em] text-[var(--theme-color-feedback-info-foreground)] sm:text-[13px] dark:text-[var(--theme-color-action-secondary-foreground-on-dark)]">
            选择排名
          </div>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {trackingMode === "event" ? (
              <button
                type="button"
                onClick={onTop10Change}
                aria-pressed={isTop10Selected}
                className={`h-8 min-w-[3.7rem] rounded-[12px] border px-2 text-[11px] font-semibold tracking-[0.01em] outline-hidden transition-all duration-300 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-color-focus-ring)] sm:h-9 sm:min-w-[4.1rem] sm:rounded-[14px] sm:px-2.5 sm:text-[12px] ${
                  isTop10Selected
                    ? "border-transparent bg-[var(--theme-color-selection-strong-background)] text-[var(--theme-color-selection-strong-foreground)] shadow-sm ring-2 ring-[var(--theme-color-selection-strong-ring)] ring-offset-1 ring-offset-[var(--theme-color-surface-background)]"
                    : "border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-text-muted)] shadow-sm hover:border-[var(--theme-color-action-secondary-border)] hover:bg-[var(--theme-color-control-background-hover)] hover:text-[var(--theme-color-text-default)] hover:shadow-md dark:border-slate-600/80 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-sky-400/60 dark:hover:bg-slate-700 dark:hover:text-sky-100"
                }`}
              >
                TOP10
              </button>
            ) : null}
            {tierOptions.map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => onTierChange(tier)}
                aria-pressed={!isTop10Selected && selectedTier === tier}
                className={`h-8 min-w-[2.9rem] rounded-[12px] border px-2 text-[11px] font-semibold tracking-[0.01em] outline-hidden transition-all duration-300 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-color-focus-ring)] sm:h-9 sm:min-w-[3.15rem] sm:rounded-[14px] sm:px-2.5 sm:text-[12px] ${
                  !isTop10Selected && selectedTier === tier
                    ? "border-transparent bg-[var(--theme-color-selection-strong-background)] text-[var(--theme-color-selection-strong-foreground)] shadow-sm ring-2 ring-[var(--theme-color-selection-strong-ring)] ring-offset-1 ring-offset-[var(--theme-color-surface-background)]"
                    : "border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-text-muted)] shadow-sm hover:border-[var(--theme-color-action-secondary-border)] hover:bg-[var(--theme-color-control-background-hover)] hover:text-[var(--theme-color-text-default)] hover:shadow-md dark:border-slate-600/80 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-sky-400/60 dark:hover:bg-slate-700 dark:hover:text-sky-100"
                }`}
              >
                T{tier}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});
