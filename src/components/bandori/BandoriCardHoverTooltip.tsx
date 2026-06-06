"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { cn } from "@/lib/utils";

const TOOLTIP_WIDTH = 256;
const TOOLTIP_ESTIMATED_HEIGHT = 148;
const TOOLTIP_GAP = 8;
const TOOLTIP_MARGIN = 12;

export type BandoriCardHoverTooltipProps = {
  cardName: string;
  characterName: string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export type BandoriCardHoverTooltipPortalProps = {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  cardName: string;
  characterName: string;
  children?: ReactNode;
  className?: string;
};

type TooltipPosition = {
  left: number;
  top: number;
};

export default function BandoriCardHoverTooltip({
  cardName,
  characterName,
  children,
  className,
  style,
}: BandoriCardHoverTooltipProps) {
  return (
    <span
      className={cn(
        "pointer-events-none block w-64 rounded-[18px] border border-white/90 bg-white p-3 text-center shadow-[0_18px_48px_rgba(15,23,42,0.22)] ring-1 ring-slate-950/5",
        className,
      )}
      style={style}
    >
      <span className="block whitespace-normal break-words text-sm font-black leading-snug text-slate-900">{cardName}</span>
      <span className="mt-1 block whitespace-normal break-words text-xs font-semibold leading-snug text-slate-500">
        {characterName}
      </span>
      {children ? <span className="mt-2 flex flex-wrap justify-center gap-2 text-[11px] font-black">{children}</span> : null}
    </span>
  );
}

export function BandoriCardHoverTooltipPortal({
  anchorRef,
  open,
  cardName,
  characterName,
  children,
  className,
}: BandoriCardHoverTooltipPortalProps) {
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor || typeof window === "undefined") {
      setPosition(null);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const minLeft = TOOLTIP_MARGIN + TOOLTIP_WIDTH / 2;
    const maxLeft = Math.max(minLeft, viewportWidth - TOOLTIP_MARGIN - TOOLTIP_WIDTH / 2);
    const preferredLeft = rect.left + rect.width / 2;
    const left = Math.min(maxLeft, Math.max(minLeft, preferredLeft));
    const preferredTop = rect.bottom + TOOLTIP_GAP;
    const top = preferredTop + TOOLTIP_ESTIMATED_HEIGHT <= viewportHeight - TOOLTIP_MARGIN
      ? preferredTop
      : Math.max(TOOLTIP_MARGIN, rect.top - TOOLTIP_GAP - TOOLTIP_ESTIMATED_HEIGHT);

    setPosition({ left, top });
  }, [anchorRef]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let frame = window.requestAnimationFrame(updatePosition);
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updatePosition);
    };

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (open) {
      return;
    }

    const frame = window.requestAnimationFrame(() => setPosition(null));
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  if (!open || !position || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <BandoriCardHoverTooltip
      cardName={cardName}
      characterName={characterName}
      className={cn("fixed z-[1000] -translate-x-1/2", className)}
      style={{ left: position.left, top: position.top }}
    >
      {children}
    </BandoriCardHoverTooltip>,
    document.body,
  );
}
