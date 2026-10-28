"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import AccountCardAvatar from "@/components/account/AccountCardAvatar";
import type { CommentReactionSummary } from "@/lib/comments/comment-contract";
import { getCommentPopoverHorizontalPosition, getCommentPopoverVerticalPosition } from "@/lib/comments/comment-popover-position";
import { cn } from "@/lib/utils";
import { CommentReactionEmoji } from "./CommentReactionEmoji";
import { CommentPublicUid } from "./CommentPublicUid";

export type ReactionChipProps = {
  reaction: CommentReactionSummary;
  disabled: boolean;
  onToggle: (emojiKey: string, reactedByViewer: boolean) => Promise<void>;
  onViewAll: (emojiKey: string) => void;
  onPreview?: (emojiKey: string) => void;
};

export function ReactionChip({ reaction, disabled, onToggle, onViewAll, onPreview }: ReactionChipProps) {
  const t = useTranslations("comments");
  const containerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties | null>(null);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearLongPressTimer, [clearLongPressTimer]);

  useEffect(() => {
    if (!tooltipOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      setTooltipOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (tooltipRef.current?.contains(document.activeElement)) {
        containerRef.current?.querySelector("button")?.focus({ preventScroll: true });
      }
      setTooltipOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [tooltipOpen]);

  const updateTooltipPosition = useCallback(() => {
    const container = containerRef.current;
    const tooltip = tooltipRef.current;
    if (!container || !tooltip) return;

    const rect = container.getBoundingClientRect();
    const viewport = window.visualViewport;
    setTooltipStyle({
      ...getCommentPopoverHorizontalPosition({
        anchorRect: rect,
        containerLeft: 0,
        preferredWidth: 256,
        viewportLeft: viewport?.offsetLeft ?? 0,
        viewportWidth: viewport?.width ?? window.innerWidth,
      }),
      ...getCommentPopoverVerticalPosition({
        anchorRect: rect,
        tooltipHeight: tooltip.scrollHeight + tooltip.offsetHeight - tooltip.clientHeight,
        viewportTop: viewport?.offsetTop ?? 0,
        viewportHeight: viewport?.height ?? window.innerHeight,
      }),
    });
  }, []);

  const showTooltip = useCallback(() => {
    updateTooltipPosition();
    onPreview?.(reaction.emojiKey);
    setTooltipOpen(true);
  }, [updateTooltipPosition, onPreview, reaction.emojiKey]);

  useLayoutEffect(() => {
    if (!tooltipOpen) return;
    const tooltip = tooltipRef.current;
    if (!tooltip) return;

    tooltip.showPopover?.();

    let frame = window.requestAnimationFrame(updateTooltipPosition);
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateTooltipPosition);
    };
    const viewport = window.visualViewport;
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(tooltip);

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    viewport?.addEventListener("resize", scheduleUpdate);
    viewport?.addEventListener("scroll", scheduleUpdate);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      tooltip.hidePopover?.();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
      viewport?.removeEventListener("resize", scheduleUpdate);
      viewport?.removeEventListener("scroll", scheduleUpdate);
    };
  }, [tooltipOpen, updateTooltipPosition]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "mouse") return;
    clearLongPressTimer();
    suppressClickRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = true;
      showTooltip();
    }, 450);
  };

  const handlePointerEnd = () => {
    clearLongPressTimer();
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    void onToggle(reaction.emojiKey, reaction.reactedByViewer);
  };

  return (
    <span
      ref={containerRef}
      className="relative inline-flex select-none [-webkit-touch-callout:none]"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") showTooltip();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setTooltipOpen(false);
      }}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) showTooltip();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setTooltipOpen(false);
        }
      }}
    >
      <button
        type="button"
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerMove={handlePointerEnd}
        onContextMenu={(event) => {
          if (tooltipOpen) event.preventDefault();
        }}
        disabled={disabled}
        aria-pressed={reaction.reactedByViewer}
        aria-label={`:${reaction.emojiKey}: ${reaction.count}`}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-full border px-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 sm:h-7",
          reaction.reactedByViewer
            ? "border-[var(--theme-color-selection-subtle-ring)] bg-[var(--theme-color-selection-subtle-background)] text-[var(--theme-color-selection-subtle-foreground)] hover:brightness-95"
            : "border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)]",
        )}
      >
        <CommentReactionEmoji emojiKey={reaction.emojiKey} size={18} />
        {reaction.count}
      </button>
      {tooltipOpen ? (
        <div
          ref={tooltipRef}
          popover="manual"
          role="dialog"
          aria-label={t("reactions.previewLabel", {
            emoji: reaction.emojiKey,
            count: reaction.count,
          })}
          style={tooltipStyle ?? undefined}
          className={cn(
            "fixed inset-auto z-30 m-0 w-64 overflow-y-auto overscroll-contain rounded-lg border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-comment-reaction-background)] p-2.5 text-left text-xs text-[var(--theme-color-text-muted)] shadow-2xl",
            !tooltipStyle && "invisible",
          )}
        >
          <div className="mb-2 flex items-center gap-1.5 font-semibold text-[var(--theme-color-text-default)]">
            <CommentReactionEmoji emojiKey={reaction.emojiKey} size={20} />
            <span>{t("reactions.count", { count: reaction.count })}</span>
          </div>
          <div className="space-y-1.5">
            {reaction.users.map((user) => (
              <div key={`${reaction.emojiKey}-${user.userId}`} className="flex items-center gap-2">
                <AccountCardAvatar
                  username={user.username}
                  cardId={user.avatar.cardId}
                  entityServer={user.avatar.entityServer}
                  trainType={user.avatar.trainType}
                  size="toolbar"
                  className="ring-1 ring-[var(--theme-color-border-subtle)]"
                />
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-semibold text-[var(--theme-color-text-default)]">
                    {user.username ?? t("states.anonymous")}
                  </span>
                  <CommentPublicUid publicUid={user.publicUid} />
                </div>
              </div>
            ))}
          </div>
          {reaction.remainingUserCount > 0 ? (
            <button
              type="button"
              onClick={() => {
                setTooltipOpen(false);
                onViewAll(reaction.emojiKey);
              }}
              className="mt-2 flex w-full items-center justify-between border-t border-[var(--theme-color-border-subtle)] pt-2 font-semibold text-[var(--theme-color-action-secondary-foreground)] transition hover:text-[var(--theme-color-text-default)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[var(--theme-color-focus-ring)]"
            >
              {t("reactions.viewAll")}
              <ChevronRight size={13} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}
