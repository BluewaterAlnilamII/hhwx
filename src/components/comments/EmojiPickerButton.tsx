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
  variant?: "default" | "composer";
};

export const EmojiPickerButton = memo(function EmojiPickerButton({
  open,
  onOpenChange,
  onSelect,
  compact = false,
  disabled = false,
  label,
  variant = "default",
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
    const panelElement = variant === "composer" ? containerRef.current.closest("[data-chat-panel]") : null;
    const panel = panelElement?.getBoundingClientRect();
    const left = Math.max(viewport?.offsetLeft ?? 0, panel?.left ?? 0);
    const right = Math.min((viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth), panel?.right ?? window.innerWidth);
    const top = Math.max(viewport?.offsetTop ?? 0, panelElement?.querySelector("header")?.getBoundingClientRect().bottom ?? panel?.top ?? 0);
    const inputTop = containerRef.current.closest("[data-chat-input]")?.getBoundingClientRect().top ?? rect.top;
    // Leave room for the trigger gap, viewport inset, and popover padding/border.
    const gridHeight = Math.max(0, Math.min(256, inputTop - top - 8 - 16 - 18));

    setPopoverStyle({ ...getCommentPopoverHorizontalPosition({
      anchorRect: rect,
      containerLeft: containerRect.left,
      preferredWidth: 384,
      viewportLeft: left,
      viewportWidth: right - left,
    }), ...(panel ? { bottom: containerRect.bottom - inputTop + 8, "--emoji-picker-max-height": `${gridHeight}px` } : {}) } as CSSProperties);
  }, [open, variant]);

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
    const composer = variant === "composer" ? containerRef.current?.closest("form") : null;
    const observer = composer ? new ResizeObserver(updatePopoverPosition) : null;
    if (composer) observer?.observe(composer);

    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      viewport?.removeEventListener("resize", updatePopoverPosition);
      viewport?.removeEventListener("scroll", updatePopoverPosition);
      observer?.disconnect();
    };
  }, [open, updatePopoverPosition, variant]);

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
          "inline-flex shrink-0 items-center justify-center rounded-full text-[var(--theme-color-text-muted)] transition hover:bg-[var(--theme-color-action-secondary-background-hover)] hover:text-[var(--theme-color-action-secondary-foreground)] focus-visible:outline-2 focus-visible:outline-[var(--theme-color-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60",
          variant === "composer" ? "size-11" : compact ? "h-8 w-8 border sm:h-7 sm:w-7" : "h-8 w-8 border",
          open
            ? "border-[var(--theme-color-selection-subtle-ring)] bg-[var(--theme-color-selection-subtle-background)] text-[var(--theme-color-selection-subtle-foreground)] hover:bg-[var(--theme-color-selection-subtle-background)] hover:text-[var(--theme-color-selection-subtle-foreground)]"
            : variant === "composer" ? "bg-transparent" : "border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)]",
        )}
        aria-haspopup="dialog"
        aria-controls={popoverId}
        aria-expanded={open}
        aria-label={pickerLabel}
        title={pickerLabel}
      >
        <Smile size={variant === "composer" ? 20 : 15} aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={popoverId}
          role="dialog"
          aria-label={pickerLabel}
          style={popoverStyle}
          className={cn("absolute z-20 overflow-x-hidden rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-floating-background)] p-2 shadow-xl", variant === "composer" ? "bottom-full" : "bottom-10")}
        >
          <div className="grid max-h-[var(--emoji-picker-max-height,16rem)] grid-cols-9 gap-1 overflow-x-hidden overflow-y-auto pr-1 [scrollbar-color:var(--theme-color-shell-scrollbar-thumb)_var(--theme-color-shell-scrollbar-track)] scrollbar-thin [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--theme-color-shell-scrollbar-thumb)] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[var(--theme-color-shell-scrollbar-track)]">
            {COMMENT_EMOJI_NAMES.map((name) => {
              const src = getCommentEmojiSrc(name);
              if (!src) return null;

              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onSelect(name)}
                  className="flex aspect-square w-full min-w-0 items-center justify-center rounded-lg transition hover:bg-[var(--theme-color-control-background-hover)] focus-visible:bg-[var(--theme-color-control-background-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]"
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
