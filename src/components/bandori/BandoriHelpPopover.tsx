"use client";

import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { getBandoriCardTooltipPosition } from "@/components/bandori/BandoriCardHoverTooltip";

export default function BandoriHelpPopover({
  label,
  title,
  variant = "info",
  preferredPlacement = "below",
  children,
}: {
  label: string;
  title?: string;
  variant?: "info" | "search";
  preferredPlacement?: "above" | "below";
  children: ReactNode;
}) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeHelp = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      pinnedRef.current = false;
      setOpen(false);
      if (popoverRef.current?.contains(document.activeElement)) buttonRef.current?.focus();
    };
    window.addEventListener("keydown", closeHelp, true);
    return () => window.removeEventListener("keydown", closeHelp, true);
  }, [open]);

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    const button = buttonRef.current;
    if (!popover || !button || !open) return;

    popover.showPopover();
    function updatePosition() {
      if (!popover || !button) return;
      const rect = popover.getBoundingClientRect();
      const position = getBandoriCardTooltipPosition({
        anchorRect: button.getBoundingClientRect(),
        tooltipHeight: rect.height,
        tooltipWidth: rect.width,
        viewportHeight: window.visualViewport?.height ?? window.innerHeight,
        viewportWidth: window.visualViewport?.width ?? window.innerWidth,
        preferredPlacement,
      });
      popover.style.left = `${position.left}px`;
      popover.style.top = `${position.top}px`;
    }
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(button);
    observer.observe(popover);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
      popover.hidePopover();
    };
  }, [open, preferredPlacement]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        popoverTarget={id}
        className={`inline-flex shrink-0 items-center justify-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--theme-color-focus-ring)] ${variant === "search"
          ? "h-10 w-10 rounded-xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-lg font-semibold text-[var(--theme-color-text-default)] hover:border-[var(--theme-color-action-secondary-border)]"
          : "-my-0.5 h-6 w-6 rounded-full text-[var(--theme-color-semantic-info-foreground)]"}`}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={() => {
          if (!pinnedRef.current) setOpen(false);
        }}
        onClick={(event) => {
          // Keep hover-to-pin behavior instead of the native toggle action.
          event.preventDefault();
          pinnedRef.current = !pinnedRef.current;
          setOpen(pinnedRef.current);
        }}
      >
        {variant === "search" ? <span aria-hidden="true">?</span> : <Info className="h-4 w-4" aria-hidden="true" />}
      </button>
      <div
        ref={popoverRef}
        id={id}
        popover="auto"
        role="dialog"
        aria-labelledby={title ? `${id}-title` : undefined}
        aria-label={title ? undefined : label}
        tabIndex={0}
        className="hhwx-floating-surface fixed inset-auto m-0 max-h-[calc(100dvh-24px)] w-max max-w-[calc(100vw-24px)] overflow-auto rounded-xl border p-4 text-sm leading-7 font-normal focus-visible:outline-2 focus-visible:outline-[color:var(--theme-color-focus-ring)]"
        onToggle={(event) => {
          if (event.newState === "closed") {
            pinnedRef.current = false;
            setOpen(false);
          }
        }}
      >
        {title ? <p id={`${id}-title`} className="mb-2 font-semibold">{title}</p> : null}
        {children}
      </div>
    </>
  );
}
