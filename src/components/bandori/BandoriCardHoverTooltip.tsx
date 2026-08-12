"use client";

import { forwardRef, useCallback, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type {
  CSSProperties,
  FocusEventHandler,
  MouseEventHandler,
  ReactNode,
  RefObject,
} from "react";
import { Link } from "@/i18n/navigation";
import type { BandoriServerLanguageTag } from "@/lib/bandori-server";
import { cn } from "@/lib/utils";

export const BANDORI_CARD_TOOLTIP_GAP = 4;
export const BANDORI_CARD_TOOLTIP_MARGIN = 12;

export type BandoriCardHoverTooltipProps = {
  id?: string;
  open?: boolean;
  cardName: string;
  characterName: string;
  detailLanguageTag?: BandoriServerLanguageTag;
  detailHref?: string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  onMouseEnter?: MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: MouseEventHandler<HTMLDivElement>;
  onFocus?: FocusEventHandler<HTMLDivElement>;
  onBlur?: FocusEventHandler<HTMLDivElement>;
};

export type BandoriCardHoverPopoverProps = {
  id: string;
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  cardName: string;
  characterName: string;
  detailLanguageTag?: BandoriServerLanguageTag;
  detailHref?: string;
  children?: ReactNode;
  className?: string;
  onMouseEnter?: MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: MouseEventHandler<HTMLDivElement>;
  onFocus?: FocusEventHandler<HTMLDivElement>;
  onBlur?: FocusEventHandler<HTMLDivElement>;
};

type TooltipPosition = {
  left: number;
  top: number;
  placement: "above" | "below";
};

type BandoriCardTooltipPositionInput = {
  anchorRect: Pick<DOMRectReadOnly, "bottom" | "height" | "left" | "right" | "top" | "width">;
  tooltipHeight: number;
  tooltipWidth: number;
  viewportHeight: number;
  viewportWidth: number;
  gap?: number;
  margin?: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function getBandoriCardTooltipPosition({
  anchorRect,
  tooltipHeight,
  tooltipWidth,
  viewportHeight,
  viewportWidth,
  gap = BANDORI_CARD_TOOLTIP_GAP,
  margin = BANDORI_CARD_TOOLTIP_MARGIN,
}: BandoriCardTooltipPositionInput): TooltipPosition {
  const availableBelow = viewportHeight - margin - anchorRect.bottom - gap;
  const availableAbove = anchorRect.top - gap - margin;
  const placement = tooltipHeight <= availableBelow || availableBelow >= availableAbove
    ? "below"
    : "above";
  const preferredTop = placement === "below"
    ? anchorRect.bottom + gap
    : anchorRect.top - gap - tooltipHeight;
  const maximumTop = Math.max(margin, viewportHeight - margin - tooltipHeight);
  const maximumLeft = Math.max(margin, viewportWidth - margin - tooltipWidth);

  return {
    left: clamp(
      anchorRect.left + anchorRect.width / 2 - tooltipWidth / 2,
      margin,
      maximumLeft,
    ),
    top: clamp(preferredTop, margin, maximumTop),
    placement,
  };
}

const BandoriCardHoverTooltip = forwardRef<HTMLDivElement, BandoriCardHoverTooltipProps>(function BandoriCardHoverTooltip({
  id,
  open = true,
  cardName,
  characterName,
  detailLanguageTag,
  detailHref,
  children,
  className,
  style,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}: BandoriCardHoverTooltipProps, ref) {
  const t = useTranslations("bandori.cards.common");

  return (
    <div
      ref={ref}
      id={id}
      popover="manual"
      role="dialog"
      aria-label={cardName}
      className={cn(
        "pointer-events-auto m-0 max-h-[calc(100vh-24px)] w-64 max-w-[calc(100vw-24px)] overflow-y-auto rounded-[18px] border border-white/90 bg-white p-3 text-center shadow-[0_18px_48px_rgba(15,23,42,0.22)] ring-1 ring-slate-950/5",
        !open && "hidden",
        className,
      )}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div className="whitespace-normal wrap-break-word text-sm font-black leading-snug text-slate-900">{cardName}</div>
      <div className="mt-1 whitespace-normal wrap-break-word text-xs font-semibold leading-snug text-slate-500">
        {characterName}
      </div>
      {children ? (
        <div lang={detailLanguageTag} className="mt-2 flex flex-wrap justify-center gap-2 text-[11px] font-black">
          {children}
        </div>
      ) : null}
      {detailHref ? (
        <Link
          href={detailHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex rounded-sm text-xs font-black text-sky-700 underline decoration-sky-300 underline-offset-4 transition hover:text-sky-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
        >
          {t("cardDetails")}
        </Link>
      ) : null}
    </div>
  );
});

export default BandoriCardHoverTooltip;

export function BandoriCardHoverPopover({
  id,
  anchorRef,
  open,
  cardName,
  characterName,
  detailLanguageTag,
  detailHref,
  children,
  className,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}: BandoriCardHoverPopoverProps) {
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip || typeof window === "undefined") {
      setPosition(null);
      return;
    }

    const tooltipRect = tooltip.getBoundingClientRect();
    setPosition(getBandoriCardTooltipPosition({
      anchorRect: anchor.getBoundingClientRect(),
      tooltipHeight: tooltipRect.height,
      tooltipWidth: tooltipRect.width,
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      viewportWidth: window.visualViewport?.width ?? window.innerWidth,
    }));
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const tooltip = tooltipRef.current;
    if (!tooltip) {
      return;
    }

    if (typeof tooltip.showPopover === "function") {
      try {
        tooltip.showPopover();
      } catch {
        // A repeated layout effect may observe an already-open native popover.
      }
    }

    let frame = window.requestAnimationFrame(updatePosition);
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updatePosition);
    };

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleUpdate);
    const anchor = anchorRef.current;
    if (anchor) {
      resizeObserver?.observe(anchor);
      anchor.addEventListener("transitionend", scheduleUpdate);
      anchor.addEventListener("transitioncancel", scheduleUpdate);
    }
    resizeObserver?.observe(tooltip);

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("scroll", scheduleUpdate);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      anchor?.removeEventListener("transitionend", scheduleUpdate);
      anchor?.removeEventListener("transitioncancel", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener("scroll", scheduleUpdate);
      if (typeof tooltip.hidePopover === "function") {
        try {
          tooltip.hidePopover();
        } catch {
          // Removing an already-closed popover is harmless during teardown.
        }
      }
    };
  }, [anchorRef, open, updatePosition]);

  if (!open) {
    return null;
  }

  return (
    <BandoriCardHoverTooltip
      ref={tooltipRef}
      id={id}
      open={open}
      cardName={cardName}
      characterName={characterName}
      detailLanguageTag={detailLanguageTag}
      detailHref={detailHref}
      className={cn(
        "fixed inset-auto z-1000",
        !position && "invisible",
        className,
      )}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0 }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      {children}
    </BandoriCardHoverTooltip>
  );
}
