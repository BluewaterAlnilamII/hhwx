"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type SwitchProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-checked" | "onChange" | "onClick" | "role" | "type"
> & {
  checked: boolean;
  checkedLabel: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
  uncheckedLabel: string;
};

export default function Switch({
  checked,
  checkedLabel,
  className,
  disabled,
  label,
  onCheckedChange,
  uncheckedLabel,
  ...buttonProps
}: SwitchProps) {
  const stateLabel = checked ? checkedLabel : uncheckedLabel;

  return (
    <button
      {...buttonProps}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${label}: ${stateLabel}`}
      className={cn(
        "inline-flex min-h-11 items-center gap-2.5 rounded-xl px-1.5 pr-3 text-sm font-semibold text-[var(--theme-color-text-default)] outline-hidden transition focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-color-surface-background)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 rounded-full shadow-[var(--theme-shadow-control-inset-highlight)] ring-1 ring-inset transition-colors",
          checked
            ? "bg-[var(--theme-color-semantic-info-foreground)] ring-[var(--theme-color-semantic-info-border)]"
            : "bg-[var(--theme-color-control-background-disabled)] ring-[var(--theme-color-control-border-disabled)]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </span>
      <span className="min-w-4 text-left">{stateLabel}</span>
    </button>
  );
}
