"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { getBandoriCardTooltipPosition } from "@/components/bandori/BandoriCardHoverTooltip";

const EXAMPLE_KEYS = {
  cards: ["band", "character", "attribute", "rarity", "skillRate", "skillType", "cardType", "server", "id", "name"],
  songs: ["band", "difficulty", "difficultyRange", "level", "songType", "server", "id", "name"],
} as const;

export default function BandoriSearchHelp({ kind }: { kind: keyof typeof EXAMPLE_KEYS }) {
  const t = useTranslations(kind === "cards" ? "bandori.cardFilters.searchHelp" : "bandori.songs.filters.searchHelp");
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
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={t("label")}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-control-background)] text-lg font-semibold text-[var(--theme-color-text-default)] transition hover:border-[var(--theme-color-semantic-info-border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--theme-color-semantic-info-border)]"
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={() => {
          if (!pinnedRef.current) setOpen(false);
        }}
        onClick={() => {
          pinnedRef.current = !pinnedRef.current;
          setOpen(pinnedRef.current);
        }}
      >
        <span aria-hidden="true">?</span>
      </button>
      <div
        ref={popoverRef}
        id={id}
        popover="auto"
        role="dialog"
        aria-labelledby={`${id}-title`}
        tabIndex={0}
        className="hhwx-floating-surface fixed inset-auto m-0 max-h-[calc(100dvh-24px)] w-max max-w-[calc(100vw-24px)] overflow-auto rounded-xl border p-4 text-sm leading-7 focus-visible:outline-2 focus-visible:outline-[color:var(--theme-color-semantic-info-border)]"
        onToggle={(event) => {
          if (event.newState === "closed") {
            pinnedRef.current = false;
            setOpen(false);
          }
        }}
      >
        <p id={`${id}-title`} className="mb-2 font-semibold">{t("title")}</p>
        {EXAMPLE_KEYS[kind].map((key) => (
          <p key={key}>
            {t.rich(key, {
              rate: "<=130%",
              difficulty: ">=hd",
              level: "<=26",
              code: (chunks) => (
                <code className="rounded-sm bg-[var(--theme-color-control-background-muted)] px-1.5 py-0.5 text-xs whitespace-nowrap">{chunks}</code>
              ),
            })}
          </p>
        ))}
      </div>
    </>
  );
}
