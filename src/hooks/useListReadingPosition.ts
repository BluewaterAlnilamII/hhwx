"use client";

import { useEffectEvent, useLayoutEffect, type RefObject } from "react";
import { readEntryValue, writeEntryValue } from "./useHistoryEntryState";

const field = "listReadingPosition";
type Position = { top: number; row?: string; index: number; offset?: number; focusHref?: string };

export function useListReadingPosition(
  root: RefObject<HTMLElement | null>, scope: string | undefined, ready: boolean,
  virtualRowTop?: (id: string, index: number) => number | undefined,
) {
  const locateVirtualRow = useEffectEvent((id: string, index: number) => virtualRowTop?.(id, index));
  useLayoutEffect(() => {
    if (scope === undefined) return;
    const url = location.href;
    const list = root.current;
    const position = readEntryValue<Position>(field, scope);
    const input = new AbortController();
    if (position) {
      const stop = (event: Event) => {
        // A retry can make the missing row available. Keep its position while
        // the visitor activates the retry button, unless they start scrolling.
        if (!ready && (event.type === "pointerdown" || (event instanceof KeyboardEvent
          && !["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)))) return;
        if (!ready && event instanceof KeyboardEvent && event.key === " " && event.target instanceof HTMLButtonElement) return;
        if (!ready && location.href === url) writeEntryValue(field, scope, null);
        input.abort();
      };
      for (const event of ["wheel", "touchmove", "pointerdown", "keydown"]) {
        window.addEventListener(event, stop, { passive: true, capture: true, signal: input.signal });
      }
    }
    if (!list) return () => input.abort();
    const rows = () => Array.from(list.querySelectorAll<HTMLElement>("[data-reading-row]"));
    if (ready && position) {
      const align = () => {
        if (input.signal.aborted || location.href !== url) return;
        const target = position.row ? list.querySelector<HTMLElement>(`[data-reading-row="${CSS.escape(position.row)}"]`) : null;
        const virtualTop = position.row ? locateVirtualRow(position.row, position.index) : undefined;
        const neighbors = !target && virtualTop === undefined && position.row ? rows() : [];
        const row = target ?? neighbors[Math.min(position.index, neighbors.length - 1)];
        const rowTop = virtualTop ?? (row ? window.scrollY + row.getBoundingClientRect().top : undefined);
        const top = rowTop !== undefined && position.offset !== undefined && (position.top > 0 || position.focusHref)
          ? rowTop - position.offset : position.top;
        if (Math.abs(window.scrollY - top) > 0.5) window.scrollTo({ top, behavior: "instant" });
        if (target && position.focusHref) {
          const selector = `a[href="${CSS.escape(position.focusHref)}"]`;
          const link = target.matches(selector) ? target : target.querySelector<HTMLElement>(selector);
          link?.focus({ preventScroll: true });
        }
      };
      align();
      const observer = new ResizeObserver(align);
      observer.observe(document.body);
      observer.observe(list);
      input.signal.addEventListener("abort", () => observer.disconnect(), { once: true });
    }
    const remember = (link?: Element) => {
      if (location.href !== url || !list.getClientRects().length || (!ready && !link)) return;
      const clicked = link?.closest<HTMLElement>("[data-reading-row]");
      const last = readEntryValue<Position>(field, scope);
      if (!clicked && last?.top === window.scrollY) return;
      const items = rows();
      const headerBottom = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      const row = clicked && list.contains(clicked) ? clicked : items.find(item => {
        const rect = item.getBoundingClientRect();
        return rect.bottom > headerBottom && rect.top < innerHeight;
      });
      writeEntryValue<Position>(field, scope, { top: window.scrollY, row: row?.dataset.readingRow,
        index: row?.dataset.readingIndex !== undefined ? Number(row.dataset.readingIndex) : row ? items.indexOf(row) : -1,
        offset: row?.getBoundingClientRect().top,
        focusHref: clicked && row === clicked ? link?.getAttribute("href") ?? undefined : undefined });
    };
    const onLink = (event: MouseEvent) => {
      const link = event.target instanceof Element && event.target.closest("a[href]");
      if (link && !event.button && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) remember(link);
    };
    const onScrollEnd = () => remember();
    document.addEventListener("click", onLink, true);
    window.addEventListener("scrollend", onScrollEnd);
    window.addEventListener("pagehide", onScrollEnd);
    return () => {
      input.abort();
      document.removeEventListener("click", onLink, true);
      window.removeEventListener("scrollend", onScrollEnd);
      window.removeEventListener("pagehide", onScrollEnd);
    };
  }, [root, scope, ready]);
}
