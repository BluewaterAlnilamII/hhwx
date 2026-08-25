"use client";

import type { ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Minus,
  Plus,
} from "lucide-react";

export type SimulatorAdjustmentLevel = 1 | 2 | 3;

type SimulatorAdjustmentButtonProps = {
  ariaLabel: string;
  direction: "decrease" | "increase";
  disabled?: boolean;
  level: SimulatorAdjustmentLevel;
  onClick: () => void;
};

function AdjustmentIcon({
  direction,
  level,
}: Pick<SimulatorAdjustmentButtonProps, "direction" | "level">) {
  const iconProps = {
    "aria-hidden": true,
    className: "h-[18px] w-[18px] sm:h-5 sm:w-5",
    strokeWidth: 3,
  } as const;

  if (direction === "decrease") {
    if (level === 3) return <ChevronsLeft {...iconProps} />;
    if (level === 2) return <ChevronLeft {...iconProps} />;
    return <Minus {...iconProps} />;
  }
  if (level === 3) return <ChevronsRight {...iconProps} />;
  if (level === 2) return <ChevronRight {...iconProps} />;
  return <Plus {...iconProps} />;
}

export function SimulatorAdjustmentButton({
  ariaLabel,
  direction,
  disabled = false,
  level,
  onClick,
}: SimulatorAdjustmentButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--theme-color-action-secondary-border)] bg-[var(--theme-color-action-secondary-background)] text-[var(--theme-color-action-secondary-foreground)] shadow-xs outline-hidden transition hover:bg-[var(--theme-color-action-secondary-background-hover)] active:translate-y-px focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-color-surface-background)] disabled:cursor-not-allowed disabled:border-[var(--theme-color-control-border-disabled)] disabled:bg-[var(--theme-color-control-background-disabled)] disabled:text-[var(--theme-color-control-foreground-disabled)] disabled:opacity-50 disabled:active:translate-y-0 sm:h-10 sm:w-10"
      disabled={disabled}
      onClick={onClick}
    >
      <AdjustmentIcon direction={direction} level={level} />
    </button>
  );
}

type SimulatorAdjustmentValueProps = {
  ariaLabel: string;
  children: ReactNode;
};

export function SimulatorAdjustmentValue({
  ariaLabel,
  children,
}: SimulatorAdjustmentValueProps) {
  return (
    <output
      aria-label={ariaLabel}
      aria-live="polite"
      className="inline-flex h-9 min-w-14 shrink-0 items-center justify-center rounded-xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background-muted)] px-2 text-sm font-bold tabular-nums text-[var(--theme-color-text-default)] sm:h-10 sm:min-w-24 sm:px-4 sm:text-base sm:font-black"
    >
      {children}
    </output>
  );
}
