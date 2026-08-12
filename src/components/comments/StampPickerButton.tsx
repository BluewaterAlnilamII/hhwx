"use client";

import type { CSSProperties } from "react";
import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Sticker, Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { BandoriStampAnimationCanvas } from "@/components/bandori/BandoriStampView";
import {
  useCommentStampAnimation,
  useCommentStampsForRegion,
} from "@/hooks/useCommentStamps";
import {
  COMMENT_STAMP_REGION_LABELS,
  COMMENT_STAMP_REGIONS,
  type CommentStamp,
  type CommentStampRegion,
} from "@/lib/comments/stamps";
import { cn } from "@/lib/utils";
import { buildStampShortcode } from "@/lib/comments/comment-content";

type StampPickerButtonProps = {
  open: boolean;
  selectedRegion: CommentStampRegion;
  onOpenChange: (open: boolean) => void;
  onRegionChange: (region: CommentStampRegion) => void;
  onSelect: (stamp: CommentStamp) => void;
};

const StampPickerOption = memo(function StampPickerOption({
  stamp,
  onSelect,
}: {
  stamp: CommentStamp;
  onSelect: (stamp: CommentStamp) => void;
}) {
  const shortcode = buildStampShortcode(stamp);
  const hasVoice = Boolean(stamp.voiceUrl);
  const [previewActive, setPreviewActive] = useState(false);
  const [animationFailed, setAnimationFailed] = useState(false);
  const shouldLoadAnimation = previewActive && Boolean(stamp.animation) && !animationFailed;
  const { animation } = useCommentStampAnimation(
    stamp.region,
    stamp.id,
    stamp.animation,
    shouldLoadAnimation,
  );

  const handleAnimationError = useCallback(() => {
    setAnimationFailed(true);
  }, []);

  return (
    <button
      type="button"
      onClick={() => onSelect(stamp)}
      onPointerEnter={() => setPreviewActive(true)}
      onPointerLeave={() => setPreviewActive(false)}
      onFocus={() => setPreviewActive(true)}
      onBlur={() => setPreviewActive(false)}
      className="relative flex h-20 w-full min-w-0 items-center justify-center rounded-lg p-1 transition hover:bg-[var(--theme-color-control-background-hover)] focus:bg-[var(--theme-color-control-background-hover)] focus:outline-hidden focus:ring-2 focus:ring-[var(--theme-color-focus-ring)] dark:hover:bg-rose-500/10 dark:focus:bg-rose-500/10 dark:focus:ring-rose-500/30"
      aria-label={shortcode}
      title={shortcode}
    >
      {animation ? (
        <BandoriStampAnimationCanvas
          animation={animation}
          label={shortcode}
          active={previewActive}
          onError={handleAnimationError}
          className="h-full max-h-18 w-full object-contain"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={stamp.imageUrl}
          alt={shortcode}
          loading="lazy"
          decoding="async"
          referrerPolicy="strict-origin-when-cross-origin"
          className="h-full max-h-18 w-full object-contain"
        />
      )}
      {hasVoice ? (
        <span className="absolute bottom-1 right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white shadow-xs ring-2 ring-white dark:ring-slate-900">
          <Volume2 size={10} aria-hidden="true" />
        </span>
      ) : null}
    </button>
  );
});

export const StampPickerButton = memo(function StampPickerButton({
  open,
  selectedRegion,
  onOpenChange,
  onRegionChange,
  onSelect,
}: StampPickerButtonProps) {
  const t = useTranslations("comments");
  const pickerLabel = t("pickers.stamp");
  const popoverId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const { stamps } = useCommentStampsForRegion(selectedRegion, open);

  const updatePopoverPosition = useCallback(() => {
    if (!open || !buttonRef.current || !containerRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const horizontalPadding = 16;
    const width = Math.min(456, Math.max(0, viewportWidth - horizontalPadding * 2));
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
        onClick={() => onOpenChange(!open)}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-full border text-[var(--theme-color-text-muted)] transition hover:bg-[var(--theme-color-action-secondary-background-hover)] hover:text-[var(--theme-color-action-secondary-foreground)] dark:hover:bg-rose-500/10 dark:hover:text-rose-300",
          open
            ? "border-[var(--theme-color-semantic-info-border)] bg-[var(--theme-color-semantic-info-background)] text-[var(--theme-color-semantic-info-foreground)] dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-300"
            : "border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] dark:border-slate-700 dark:bg-slate-900",
        )}
        aria-haspopup="dialog"
        aria-controls={popoverId}
        aria-expanded={open}
        aria-label={pickerLabel}
        title={pickerLabel}
      >
        <Sticker size={15} />
      </button>
      {open ? (
        <div
          id={popoverId}
          role="dialog"
          aria-label={pickerLabel}
          style={popoverStyle}
          className="absolute bottom-10 z-20 overflow-hidden rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="mb-2 grid grid-cols-4 gap-1">
            {COMMENT_STAMP_REGIONS.map((region) => (
              <button
                key={region}
                type="button"
                onClick={() => onRegionChange(region)}
                className={cn(
                  "h-7 rounded-full text-xs font-bold transition focus:outline-hidden focus:ring-2 focus:ring-[var(--theme-color-focus-ring)] dark:focus:ring-rose-500/30",
                  selectedRegion === region
                    ? "bg-[var(--theme-color-selection-strong-background)] text-[var(--theme-color-selection-strong-foreground)] shadow-xs"
                    : "bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)] hover:text-[var(--theme-color-text-default)] dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-rose-500/10 dark:hover:text-rose-200",
                )}
              >
                {COMMENT_STAMP_REGION_LABELS[region]}
              </button>
            ))}
          </div>
          <div className="grid max-h-80 grid-cols-4 gap-1 overflow-x-hidden overflow-y-auto pr-1 [scrollbar-color:var(--theme-color-shell-scrollbar-thumb)_var(--theme-color-shell-scrollbar-track)] scrollbar-thin [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--theme-color-shell-scrollbar-thumb)] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[var(--theme-color-shell-scrollbar-track)]">
            {stamps.map((stamp) => (
              <StampPickerOption
                key={`${stamp.region}-${stamp.id}-${stamp.kind}`}
                stamp={stamp}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
});
