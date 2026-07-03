"use client";

import type { CSSProperties } from "react";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Smile } from "lucide-react";
import { COMMENT_EMOJI_NAMES, getCommentEmojiSrc } from "@/lib/comment-emojis";
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
  label = "选择表情",
}: EmojiPickerButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});

  const updatePopoverPosition = useCallback(() => {
    if (!open || !buttonRef.current || !containerRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const horizontalPadding = 16;
    const width = Math.min(384, Math.max(0, viewportWidth - horizontalPadding * 2));
    const viewportLeft = Math.min(
      Math.max(horizontalPadding, rect.left + rect.width / 2 - width / 2),
      viewportWidth - width - horizontalPadding,
    );

    setPopoverStyle({
      width,
      left: viewportLeft - containerRect.left,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      onOpenChange(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onOpenChange, open]);

  useLayoutEffect(() => {
    if (!open) return;

    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);

    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
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
          "inline-flex items-center justify-center rounded-full border text-slate-500 transition hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-sky-500/10 dark:hover:text-sky-300",
          compact ? "h-7 w-7" : "h-8 w-8",
          open
            ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-500/50 dark:bg-sky-500/10 dark:text-sky-300"
            : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900",
        )}
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        <Smile size={15} />
      </button>
      {open ? (
        <div
          style={popoverStyle}
          className="absolute bottom-10 z-20 overflow-x-hidden rounded-2xl border border-sky-100 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="grid max-h-64 grid-cols-[repeat(9,minmax(0,1fr))] gap-1 overflow-x-hidden overflow-y-auto pr-1 [scrollbar-color:#94a3b8_#e5e7eb] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-200">
            {COMMENT_EMOJI_NAMES.map((name) => {
              const src = getCommentEmojiSrc(name);
              if (!src) return null;

              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onSelect(name)}
                  className="flex aspect-square w-full min-w-0 items-center justify-center rounded-lg transition hover:bg-sky-50 focus:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-200 dark:hover:bg-sky-500/10 dark:focus:bg-sky-500/10 dark:focus:ring-sky-500/30"
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
