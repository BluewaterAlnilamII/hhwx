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
  showStateLabel?: boolean;
  uncheckedLabel: string;
};

export default function Switch({
  checked,
  checkedLabel,
  className,
  disabled,
  label,
  onCheckedChange,
  showStateLabel = true,
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
      aria-label={label}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-xl px-1.5 pr-3 text-[13px] font-semibold text-[var(--theme-color-text-default)] outline-hidden transition focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--theme-color-panel-background)] disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2.5 sm:text-sm",
        !showStateLabel && "pr-1.5",
        className,
      )}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-5 w-9 shrink-0 rounded-full p-0.5 ring-1 ring-inset transition-colors motion-reduce:transition-none sm:h-5.5 sm:w-10",
          checked
            ? "bg-[var(--theme-color-selection-strong-background)] ring-[var(--theme-color-selection-strong-ring)]"
            : "bg-[var(--theme-color-switch-off-background)] ring-[var(--theme-color-switch-off-background)]",
        )}
      >
        <span
          className={cn(
            "aspect-square h-full shrink-0 rounded-full bg-white transition-transform duration-150 ease-out motion-reduce:transition-none",
            checked ? "translate-x-full" : "translate-x-0",
          )}
        />
      </span>
      {showStateLabel ? <span className="min-w-4 text-left">{stateLabel}</span> : null}
    </button>
  );
}
