"use client";

import { Activity, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { EventTrackerView } from "./urlQuery";

const views = ["tracker", "info"] as const;

export const getEventTabsCollapseProgress = (markerTop: number, headerBottom: number, normalHeight: number, compactHeight: number) =>
  Math.max(0, Math.min(1, (headerBottom - markerTop) / (normalHeight - compactHeight)));

export function bindEventViewTabsSwipe(bar: HTMLElement, value: EventTrackerView, callbacks: {
  onStart: () => number;
  onProgress: (position: number) => void;
  onEnd: (view: EventTrackerView) => void;
}) {
  let pointer: { id: number; x: number; y: number; horizontal: boolean; origin: number } | null = null;
  let suppressClick = false;
  const clear = () => {
    const id = pointer?.id;
    pointer = null;
    if (id !== undefined && bar.hasPointerCapture(id)) bar.releasePointerCapture(id);
  };
  const cancel = () => {
    const horizontal = pointer?.horizontal;
    clear();
    if (horizontal) callbacks.onEnd(value);
  };
  const down = (event: PointerEvent) => {
    if (event.pointerType === "mouse" || !bar.ownerDocument.defaultView?.matchMedia("(max-width: 1279px)").matches) return;
    if (!event.isPrimary) { cancel(); suppressClick = true; return; }
    suppressClick = false;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false, origin: views.indexOf(value) };
  };
  const move = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const x = event.clientX - pointer.x;
    const y = event.clientY - pointer.y;
    if (!pointer.horizontal) {
      if (Math.max(Math.abs(x), Math.abs(y)) < 8) return;
      if (Math.abs(x) <= Math.abs(y) * 1.2) { clear(); return; }
      pointer.horizontal = true;
      suppressClick = true;
      bar.setPointerCapture(event.pointerId);
      pointer.origin = callbacks.onStart();
    }
    callbacks.onProgress(Math.max(0, Math.min(1, pointer.origin - x / bar.getBoundingClientRect().width)));
  };
  const end = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const x = event.clientX - pointer.x;
    const y = event.clientY - pointer.y;
    const horizontal = pointer.horizontal;
    const change = event.type === "pointerup" && horizontal
      && Math.abs(x) >= Math.min(64, bar.getBoundingClientRect().width * 0.2)
      && Math.abs(x) > Math.abs(y) * 1.2;
    clear();
    if (horizontal) callbacks.onEnd(change ? x < 0 ? "info" : "tracker" : value);
  };
  const click = (event: MouseEvent) => {
    if (suppressClick && event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
    suppressClick = false;
  };
  bar.addEventListener("pointerdown", down);
  bar.addEventListener("pointermove", move);
  bar.addEventListener("pointerup", end);
  bar.addEventListener("pointercancel", end);
  bar.addEventListener("lostpointercapture", cancel);
  bar.addEventListener("click", click, true);
  return () => {
    clear();
    bar.removeEventListener("pointerdown", down);
    bar.removeEventListener("pointermove", move);
    bar.removeEventListener("pointerup", end);
    bar.removeEventListener("pointercancel", end);
    bar.removeEventListener("lostpointercapture", cancel);
    bar.removeEventListener("click", click, true);
  };
}

export function EventViewTabs({ value, onChange, onPreviewChange, plannerOpen, children }: {
  value: EventTrackerView;
  onChange: (view: EventTrackerView) => void;
  onPreviewChange: (view: EventTrackerView | null) => void;
  plannerOpen: boolean;
  children: (view: EventTrackerView) => ReactNode;
}) {
  const t = useTranslations("bandori.events.view");
  const id = useId();
  const section = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const selectView = useRef(onChange);
  const [previewFrom, setPreviewFrom] = useState<EventTrackerView | null>(null);
  const moving = previewFrom === value;
  useLayoutEffect(() => {
    if (moving || !section.current) return;
    // Keep the animation's final frame until React has committed the active panel.
    delete section.current.dataset.moving;
    delete section.current.dataset.settling;
  }, [moving]);
  useLayoutEffect(() => {
    const root = section.current;
    const marker = sentinel.current;
    const tabs = bar.current?.parentElement;
    const button = bar.current?.querySelector("button");
    if (!root || !marker || !tabs || !button) return;
    const header = document.querySelector("header");
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = header?.getBoundingClientRect().height ?? 0;
      const markerTop = marker.getBoundingClientRect().top;
      // Keep the shrinking bar's bottom aligned with its original position until fully compact.
      const progress = getEventTabsCollapseProgress(markerTop, top,
        tabs.getBoundingClientRect().height,
        parseFloat(getComputedStyle(button).minHeight));
      root.style.setProperty("--event-tabs-top", `${top}px`);
      root.style.setProperty("--event-tabs-progress", String(progress));
      root.toggleAttribute("data-stuck", markerTop <= top);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const resize = new ResizeObserver(schedule);
    resize.observe(tabs);
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
    const index = views.indexOf(value);
    const position = (next: number) => {
      // A changing inherited variable invalidates styles throughout both panels.
      body.querySelectorAll<HTMLElement>(".event-view-panel").forEach((panel, panelIndex) => {
        panel.style.transform = `translateX(${(panelIndex - next) * 100}%)`;
      });
      const indicator = strip.querySelector<HTMLElement>(".event-view-indicator");
      if (indicator) indicator.style.transform = `translateX(${next * 100}%)`;
    };
    const stop = () => { cancelAnimationFrame(frame); window.clearTimeout(timer); };
    const prepare = () => {
      const panel = body.querySelector<HTMLElement>("[data-active=true]");
      const transform = panel && root.hasAttribute("data-moving") ? getComputedStyle(panel).transform : "none";
      const current = transform === "none" ? index : index - new DOMMatrixReadOnly(transform).m41 / body.clientWidth;
      stop();
      delete root.dataset.settling;
      if (!root.hasAttribute("data-moving")) body.style.setProperty("--event-view-height", `${body.getBoundingClientRect().height}px`);
      position(current);
      root.dataset.moving = "true";
      setPreviewFrom(value);
      onPreviewChange(views[1 - index]);
      return current;
    };
    const settle = (next: EventTrackerView) => {
      if (next === value && !root.hasAttribute("data-moving")) return;
      prepare();
      frame = requestAnimationFrame(() => {
        // Measure the mounted preview before transitioning from its current offset.
        body.getBoundingClientRect();
        root.dataset.settling = "true";
        position(views.indexOf(next));
        const finish = () => {
          setPreviewFrom(null);
          onChange(next);
          onPreviewChange(null);
        };
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) finish();
        else timer = window.setTimeout(finish, 220);
      });
    };
    position(index);
    selectView.current = settle;
    const unbind = bindEventViewTabsSwipe(strip, value, { onStart: prepare, onProgress: position, onEnd: settle });
    return () => {
      stop();
      unbind();
      delete root.dataset.moving;
      delete root.dataset.settling;
      onPreviewChange(null);
    };
  }, [value, onChange, onPreviewChange]);

  return <div ref={section} className="event-view-section hhwx-panel border" data-planner-open={plannerOpen || undefined}>
    <span ref={sentinel} className="event-view-sentinel" aria-hidden />
    <div className="event-view-tabs">
      <div ref={bar} role="tablist" aria-label={t("label")} className="event-view-tabs-bar">
        <span className="event-view-indicator" style={{ transform: `translateX(${views.indexOf(value) * 100}%)` }} aria-hidden />
        {views.map((view, index) => <button key={view} type="button" role="tab" id={`${id}-${view}`}
          aria-selected={value === view} aria-controls={`${id}-${view}-panel`} tabIndex={value === view ? 0 : -1}
          onClick={() => selectView.current(view)}
          onKeyDown={event => {
            const next = event.key === "ArrowLeft" || event.key === "ArrowRight" ? 1 - index
              : event.key === "Home" ? 0 : event.key === "End" ? 1 : null;
            if (next === null) return;
            event.preventDefault();
            selectView.current(views[next]);
            bar.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus({ preventScroll: true });
          }}>{t(view)}</button>)}
      </div>
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
