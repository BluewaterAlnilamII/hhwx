"use client";

import type { CSSProperties } from "react";
import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Sticker, Volume2 } from "lucide-react";
import LoadingIndicator from "@/components/LoadingIndicator";
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
import { getCommentPopoverHorizontalPosition } from "@/lib/comments/comment-popover-position";

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
      onClick={() => {
        setPreviewActive(false);
        onSelect(stamp);
      }}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") setPreviewActive(true); }}
      onPointerLeave={() => setPreviewActive(false)}
      onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) setPreviewActive(true); }}
      onBlur={() => setPreviewActive(false)}
      className="relative flex h-20 w-full min-w-0 items-center justify-center rounded-lg p-1 transition hover:bg-[var(--theme-color-control-background-hover)] focus-visible:bg-[var(--theme-color-control-background-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]"
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
        <span className="absolute bottom-1 right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white shadow-xs ring-2 ring-white dark:ring-[var(--theme-color-control-background)]">
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
  const commonT = useTranslations("common");
  const popoverId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const { stamps, loading, error, refresh } = useCommentStampsForRegion(selectedRegion, open);

  const updatePopoverPosition = useCallback(() => {
    if (!open || !buttonRef.current || !containerRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const viewport = window.visualViewport;

    setPopoverStyle(getCommentPopoverHorizontalPosition({
      anchorRect: rect,
      containerLeft: containerRect.left,
      preferredWidth: 456,
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
        onClick={() => onOpenChange(!open)}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-full border text-[var(--theme-color-text-muted)] transition hover:bg-[var(--theme-color-action-secondary-background-hover)] hover:text-[var(--theme-color-action-secondary-foreground)]",
          open
            ? "border-[var(--theme-color-selection-subtle-ring)] bg-[var(--theme-color-selection-subtle-background)] text-[var(--theme-color-selection-subtle-foreground)] hover:bg-[var(--theme-color-selection-subtle-background)] hover:text-[var(--theme-color-selection-subtle-foreground)]"
            : "border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)]",
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
          className="absolute bottom-10 z-20 overflow-hidden rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-floating-background)] p-2 shadow-xl"
        >
          <div className="mb-2 grid grid-cols-4 gap-1">
            {COMMENT_STAMP_REGIONS.map((region) => (
              <button
                key={region}
                type="button"
                onClick={() => onRegionChange(region)}
                className={cn(
                  "h-7 rounded-full text-xs font-bold transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]",
                  selectedRegion === region
                    ? "bg-[var(--theme-color-selection-strong-background)] text-[var(--theme-color-selection-strong-foreground)] shadow-xs"
                    : "bg-[var(--theme-color-control-background-muted)] text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)] hover:text-[var(--theme-color-text-default)]",
                )}
              >
                {COMMENT_STAMP_REGION_LABELS[region]}
              </button>
            ))}
          </div>
          <div className="grid max-h-80 grid-cols-4 gap-1 overflow-x-hidden overflow-y-auto pr-1 [scrollbar-color:var(--theme-color-shell-scrollbar-thumb)_var(--theme-color-shell-scrollbar-track)] scrollbar-thin [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--theme-color-shell-scrollbar-thumb)] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-[var(--theme-color-shell-scrollbar-track)]">
            {loading ? <LoadingIndicator label={t("states.loading")} className="col-span-4 min-h-40" /> : null}
            {error ? (
              <div role="alert" className="col-span-4 flex min-h-20 items-center justify-center gap-2 text-sm text-[var(--theme-color-text-muted)]">
                {commonT("states.loadFailed")}
                <button type="button" className="hhwx-text-link" onClick={refresh}>{commonT("actions.retry")}</button>
              </div>
            ) : !loading && stamps.length === 0 ? (
              <p className="col-span-4 py-10 text-center text-sm text-[var(--theme-color-text-muted)]">{t("pickers.stampEmpty")}</p>
            ) : null}
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
