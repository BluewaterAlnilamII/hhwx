"use client";

import { Activity, useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { bindTabSwipe, getTabSlideTiming, type TabSwipeMotion } from "@/lib/bind-tab-swipe";
import type { EventTrackerView } from "./urlQuery";

const views = ["tracker", "info"] as const;

export const getEventTabsCollapseProgress = (markerTop: number, headerBottom: number, normalHeight: number, compactHeight: number) =>
  Math.max(0, Math.min(1, (headerBottom - markerTop) / (normalHeight - compactHeight)));

export const getEventViewScrollTarget = (origin: number, current: number, saved?: number) =>
  Math.max(0, current < Math.round(origin) ? current : origin + Math.max(0, saved ?? 0));

function ownsSwipe(target: Element, root: HTMLElement) {
  if (target.closest(".event-view-tabs-bar")) return false;
  if (target.closest("input, textarea, select, button, a, [contenteditable=true], [role=slider], [role=dialog], [data-event-swipe-ignore], #event-pt-calculator")) return true;
  for (let element: Element | null = target; element && element !== root; element = element.parentElement) {
    if (element.scrollWidth > element.clientWidth && /auto|scroll/.test(getComputedStyle(element).overflowX)) return true;
  }
  return false;
}

export function EventViewTabs({ value, onChange, onPreviewChange, plannerOpen, scrollKey, children }: {
  value: EventTrackerView;
  onChange: (view: EventTrackerView) => void;
  onPreviewChange: (view: EventTrackerView | null) => void;
  plannerOpen: boolean;
  scrollKey: string;
  children: (view: EventTrackerView) => ReactNode;
}) {
  const t = useTranslations("bandori.events.view");
  const id = useId();
  const section = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const selectView = useRef<(view: EventTrackerView, immediate?: boolean) => void>(onChange);
  const swipeMotion = useRef<TabSwipeMotion>(null);
  const scroll = useRef<{ key: string; positions: Partial<Record<EventTrackerView, number>>; pending: number | null }>({
    key: scrollKey, positions: {}, pending: null,
  });
  const [previewFrom, setPreviewFrom] = useState<{ view: EventTrackerView; key: string } | null>(null);
  const moving = previewFrom?.view === value && previewFrom.key === scrollKey;
  const scrollOrigin = useCallback(() => (viewport.current?.getBoundingClientRect().top ?? 0) + window.scrollY
    - (document.querySelector("header")?.getBoundingClientRect().height ?? 0)
    - parseFloat(getComputedStyle(bar.current!.querySelector("button")!).minHeight), []);
  useLayoutEffect(() => {
    if (moving || !section.current) return;
    // Keep the animation's final frame until React has committed the active panel.
    delete section.current.dataset.moving;
    delete section.current.dataset.settling;
    if (scroll.current.key !== scrollKey) {
      scroll.current = { key: scrollKey, positions: {}, pending: Math.min(0, window.scrollY - scrollOrigin()) };
    }
    if (scroll.current.pending !== null) {
      window.scrollTo({ top: getEventViewScrollTarget(scrollOrigin(), window.scrollY, scroll.current.pending), behavior: "instant" });
      scroll.current.pending = null;
    }
  }, [moving, value, scrollKey, scrollOrigin]);
  useLayoutEffect(() => {
    const root = section.current;
    const marker = sentinel.current;
    const strip = bar.current;
    const button = strip?.querySelector("button");
    if (!root || !marker || !strip || !button) return;
    const header = document.querySelector("header");
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = header?.getBoundingClientRect().height ?? 0;
      const markerBounds = marker.getBoundingClientRect();
      // Keep the shrinking bar's bottom aligned with its original position until fully compact.
      const progress = getEventTabsCollapseProgress(markerBounds.top, top,
        markerBounds.height,
        parseFloat(getComputedStyle(button).minHeight));
      root.style.setProperty("--event-tabs-top", `${top}px`);
      // Scroll progress must not invalidate styles in the chart and information panels.
      strip.style.setProperty("--event-tabs-progress", String(progress));
      root.toggleAttribute("data-stuck", markerBounds.top <= top);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const resize = new ResizeObserver(schedule);
    resize.observe(marker);
    if (header) resize.observe(header);
    if (root.parentElement) resize.observe(root.parentElement);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  useLayoutEffect(() => {
    const root = section.current;
    const strip = bar.current;
    const body = viewport.current;
    if (!root || !strip || !body) return;
    let frame = 0;
    let timer = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const index = views.indexOf(value);
    const target = (view: EventTrackerView) => getEventViewScrollTarget(scrollOrigin(), window.scrollY, scroll.current.positions[view]);
    const position = (next: number) => {
      // A changing inherited variable invalidates styles throughout both panels.
      body.querySelectorAll<HTMLElement>(".event-view-panel").forEach((panel, panelIndex) => {
        panel.style.transform = `translateX(${(panelIndex - next) * 100}%)`;
      });
      const indicator = strip.querySelector<HTMLElement>(".event-view-indicator");
      if (indicator) indicator.style.transform = `translateX(${next * 100}%)`;
    };
    const stop = () => { cancelAnimationFrame(frame); window.clearTimeout(timer); };
    const rememberPosition = () => {
      // The heading is shared; only the content below the tabs has a per-view position.
      scroll.current.positions[value] = Math.max(0, window.scrollY - scrollOrigin());
    };
    const prepare = () => {
      const panel = body.querySelector<HTMLElement>("[data-active=true]");
      const transform = panel && root.hasAttribute("data-moving") ? getComputedStyle(panel).transform : "none";
      const current = transform === "none" ? index : index - new DOMMatrixReadOnly(transform).m41 / body.clientWidth;
      stop();
      delete root.dataset.settling;
      if (!root.hasAttribute("data-moving")) {
        rememberPosition();
        body.style.setProperty("--event-view-height", `${body.getBoundingClientRect().height}px`);
      }
      root.dataset.moving = "true";
      body.style.setProperty("--event-preview-top", `${window.scrollY - target(views[1 - index])}px`);
      position(current);
      setPreviewFrom(previous => previous?.view === value && previous.key === scrollKey ? previous : { view: value, key: scrollKey });
      onPreviewChange(views[1 - index]);
      return current;
    };
    const settle = (next: EventTrackerView, immediate = false) => {
      if (next === value && !root.hasAttribute("data-moving")) return;
      const finish = () => {
        if (next !== value) scroll.current.pending = target(next) - scrollOrigin();
        setPreviewFrom(null);
        onChange(next);
        onPreviewChange(null);
      };
      if (immediate || reduced.matches) {
        stop();
        if (!root.hasAttribute("data-moving")) rememberPosition();
        delete root.dataset.settling;
        position(views.indexOf(next));
        finish();
        return;
      }
      const remaining = Math.abs(views.indexOf(next) - prepare());
      if (remaining < .002) { position(views.indexOf(next)); finish(); return; }
      const { duration, easing } = getTabSlideTiming(remaining);
      root.style.setProperty("--event-slide-motion", `${duration}ms ${easing}`);
      frame = requestAnimationFrame(() => {
        // Measure the mounted preview before transitioning from its current offset.
        body.getBoundingClientRect();
        root.dataset.settling = "true";
        position(views.indexOf(next));
        timer = window.setTimeout(finish, duration + 20);
      });
    };
    position(index);
    selectView.current = settle;
    swipeMotion.current = {
      onStart: () => reduced.matches ? index : prepare(),
      onProgress: next => { if (!reduced.matches) position(next); },
      onEnd: next => settle(views[next]),
    };
    return () => {
      stop();
      delete root.dataset.moving;
      delete root.dataset.settling;
      onPreviewChange(null);
    };
  }, [value, onChange, onPreviewChange, scrollKey, scrollOrigin]);
  useLayoutEffect(() => {
    const root = section.current;
    if (root) return bindTabSwipe(root, views.length, { ignore: ownsSwipe, motion: () => swipeMotion.current! });
  }, [scrollKey]);

  return <div ref={section} className="event-view-section hhwx-panel border" data-planner-open={plannerOpen || undefined}>
    <span ref={sentinel} className="event-view-sentinel" aria-hidden />
    <div ref={bar} role="tablist" aria-label={t("label")} className="event-view-tabs-bar">
      <span className="event-view-indicator" style={{ transform: `translateX(${views.indexOf(value) * 100}%)` }} aria-hidden />
      {views.map((view, index) => <button key={view} type="button" role="tab" id={`${id}-${view}`}
        aria-selected={value === view} aria-controls={`${id}-${view}-panel`} tabIndex={value === view ? 0 : -1}
        onClick={event => selectView.current(view, event.detail === 0)}
        onKeyDown={event => {
          const next = event.key === "ArrowLeft" || event.key === "ArrowRight" ? 1 - index
            : event.key === "Home" ? 0 : event.key === "End" ? 1 : null;
          if (next === null) return;
          event.preventDefault();
          selectView.current(views[next], true);
          bar.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus({ preventScroll: true });
        }}>{t(view)}</button>)}
    </div>
    <div ref={viewport} className="event-view-viewport">
      {/* Keep chart layout/effects intact; the tracker pauses its data work separately. */}
      {views.map((view, index) => <Activity key={view} mode={view === "tracker" || value === view || moving ? "visible" : "hidden"}>
        <div id={`${id}-${view}-panel`}
        role="tabpanel" aria-labelledby={`${id}-${view}`} aria-hidden={value !== view} inert={value !== view}
        className="event-view-panel" data-active={value === view}
        style={{ transform: `translateX(${(index - views.indexOf(value)) * 100}%)` }}>{children(view)}</div>
      </Activity>)}
    </div>
  </div>;
}
