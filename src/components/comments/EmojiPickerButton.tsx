"use client";

import type { CSSProperties } from "react";
import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";
import { useTranslations } from "next-intl";
import { COMMENT_EMOJI_NAMES, getCommentEmojiSrc } from "@/lib/comments/emoji";
import { getCommentPopoverHorizontalPosition } from "@/lib/comments/comment-popover-position";
import { cn } from "@/lib/utils";

type EmojiPickerButtonProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (name: string) => void;
  compact?: boolean;
  disabled?: boolean;
  label?: string;
};

export const EmojiPickerButton = memo(function EmojiPickerButton({
  open,
  onOpenChange,
  onSelect,
  compact = false,
  disabled = false,
  label,
}: EmojiPickerButtonProps) {
  const t = useTranslations("comments");
  const pickerLabel = label ?? t("pickers.emoji");
  const popoverId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});

  const updatePopoverPosition = useCallback(() => {
    if (!open || !buttonRef.current || !containerRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const viewport = window.visualViewport;

    setPopoverStyle(getCommentPopoverHorizontalPosition({
      anchorRect: rect,
      containerLeft: containerRect.left,
      preferredWidth: 384,
      viewportLeft: viewport?.offsetLeft ?? 0,
      viewportWidth: viewport?.width ?? window.innerWidth,
    }));
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      onOpenChange(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      event.preventDefault();
      onOpenChange(false);
      window.requestAnimationFrame(() => buttonRef.current?.focus());
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onOpenChange, open]);

  useLayoutEffect(() => {
    if (!open) return;

    updatePopoverPosition();
    const viewport = window.visualViewport;
    window.addEventListener("resize", updatePopoverPosition);
    viewport?.addEventListener("resize", updatePopoverPosition);
    viewport?.addEventListener("scroll", updatePopoverPosition);

    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      viewport?.removeEventListener("resize", updatePopoverPosition);
      viewport?.removeEventListener("scroll", updatePopoverPosition);
    };
  }, [open, updatePopoverPosition]);

  return (
    <div ref={containerRef} className="relative flex items-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!disabled) onOpenChange(!open);
        }}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center rounded-full border text-[var(--theme-color-text-muted)] transition hover:bg-[var(--theme-color-action-secondary-background-hover)] hover:text-[var(--theme-color-action-secondary-foreground)] disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-sky-500/10 dark:hover:text-sky-300",
          compact ? "h-8 w-8 sm:h-7 sm:w-7" : "h-8 w-8",
          open
            ? "border-[var(--theme-color-semantic-info-border)] bg-[var(--theme-color-semantic-info-background)] text-[var(--theme-color-semantic-info-foreground)] dark:border-sky-500/50 dark:bg-sky-500/10 dark:text-sky-300"
            : "border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] dark:border-slate-700 dark:bg-slate-900",
        )}
        aria-haspopup="dialog"
        aria-controls={popoverId}
        aria-expanded={open}
        aria-label={pickerLabel}
        title={pickerLabel}
      >
        <Smile size={15} />
      </button>
      {open ? (
        <div
          id={popoverId}
          role="dialog"
          aria-label={pickerLabel}
          style={popoverStyle}
          className="absolute bottom-10 z-20 overflow-x-hidden rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="grid max-h-64 grid-cols-9 gap-1 overflow-x-hidden overflow-y-auto pr-1 [scrollbar-color:var(--theme-color-shell-scrollbar-thumb)_var(--theme-color-shell-scrollbar-track)] scrollbar-thin [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--theme-color-shell-scrollbar-thumb)] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[var(--theme-color-shell-scrollbar-track)]">
            {COMMENT_EMOJI_NAMES.map((name) => {
              const src = getCommentEmojiSrc(name);
              if (!src) return null;

              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onSelect(name)}
                  className="flex aspect-square w-full min-w-0 items-center justify-center rounded-lg transition hover:bg-[var(--theme-color-control-background-hover)] focus:bg-[var(--theme-color-control-background-hover)] focus:outline-hidden focus:ring-2 focus:ring-[var(--theme-color-focus-ring)] dark:hover:bg-sky-500/10 dark:focus:bg-sky-500/10 dark:focus:ring-sky-500/30"
                  aria-label={`:${name}:`}
                  title={`:${name}:`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`:${name}:`}
                    width={32}
                    height={32}
                    loading="lazy"
                    decoding="async"
                    className="h-full max-h-8 w-full max-w-8 object-contain"
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
});
