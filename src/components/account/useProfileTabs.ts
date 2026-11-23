import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { bindTabSwipe, getTabSlideTiming, type TabSwipeMotion } from "@/lib/bind-tab-swipe";

function ignoreSwipe(target: Element, root: HTMLElement, event: PointerEvent) {
  // Leave the screen edges to browser history, and editing controls to their own gestures.
  if (event.clientX < 20 || event.clientX > document.documentElement.clientWidth - 20 ||
      target.closest("input, textarea, select, summary, [contenteditable=true], [role=slider], [role=dialog], header[data-editing=true], [data-sort-id], [data-edit-draggable], button:not([role=tab]):not([data-song-title])")) return true;
  for (let el: Element | null = target; el && el !== root; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
  }
  return false;
}

export function useProfileTabs(hasDetails: boolean, isOwner: boolean) {
  const tabs = useMemo(() => ["home", ...(hasDetails ? ["details"] : []), ...(isOwner ? ["settings"] : [])], [hasDetails, isOwner]);
  const [tab, setTab] = useState("home");
  const [tapTarget, setTapTarget] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[]>([]);
  const originTab = tabs.includes(tab) ? tab : "home";
  const selectedTab = tapTarget && tabs.includes(tapTarget) ? tapTarget : originTab;
  const root = useRef<HTMLDivElement>(null);
  const scrollOffsets = useRef(new Map<string, number>());
  const pendingScroll = useRef<number | null>(null);
  const select = useRef<(name: string, immediate?: boolean) => void>(() => {});
  const swipeMotion = useRef<TabSwipeMotion>(null);
  useLayoutEffect(() => {
    const main = root.current;
    if (!main || tabs.length < 2) return;
    const viewport = main.querySelector<HTMLElement>("[data-tab-panels]")!;
    const panels = Array.from(viewport.children) as HTMLElement[];
    const buttons = Array.from(main.querySelectorAll<HTMLButtonElement>('[role="tablist"] > button'));
    const indicator = main.querySelector<HTMLElement>("[data-tab-indicator]")!;
    const index = tabs.indexOf(originTab);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const scrollOrigin = () => window.scrollY + main.getBoundingClientRect().top - (document.querySelector("header")?.getBoundingClientRect().height ?? 0);
    let clampedScroll: number | null = null;
    if (pendingScroll.current !== null) {
      if (Math.abs(window.scrollY - pendingScroll.current) > 1) window.scrollTo({ top: pendingScroll.current, behavior: "instant" });
      if (window.scrollY < pendingScroll.current - 1) clampedScroll = window.scrollY;
      pendingScroll.current = null;
    }
    const targetScroll = (name: string) => {
      const origin = scrollOrigin();
      if (window.scrollY < origin && window.scrollY !== clampedScroll) return window.scrollY;
      return origin + (scrollOffsets.current.get(name) ?? 0);
    };

    let position = index;
    let first = index;
    let last = index;
    let animations: Animation[] = [];
    const measureTabs = () => buttons.map(button => ({ left: button.offsetLeft, width: button.offsetWidth }));
    let bounds = measureTabs();
    const underline = (at: number) => {
      const a = bounds[Math.floor(at)], b = bounds[Math.ceil(at)];
      const part = at - Math.floor(at);
      const left = a.left + (b.left - a.left) * part - bounds[0].left;
      const width = a.width + (b.width - a.width) * part;
      return `translateX(${left}px) scaleX(${width / bounds[0].width})`;
    };
    const panelTransform = (i: number, at: number) => `translateX(${(i - at) * 100}%)`;
    const paint = (at: number) => {
      position = at;
      panels.forEach((panel, i) => { panel.style.transform = panelTransform(i, at); });
      indicator.style.transform = underline(at);
    };
    const stop = () => { animations.forEach(animation => animation.cancel()); animations = []; };
    const reset = () => {
      stop();
      delete viewport.dataset.sliding;
      delete panels[index].dataset.slideOrigin;
      viewport.style.removeProperty("--swipe-visible-height");
      panels.forEach(panel => { panel.style.transform = ""; panel.style.top = ""; });
      first = last = position = index;
    };
    const resize = new ResizeObserver(() => {
      bounds = measureTabs();
      if (!animations.length) indicator.style.transform = underline(position);
    });
    buttons.forEach(button => resize.observe(button));
    indicator.style.transform = underline(index);

    const begin = () => {
      if (animations.length) {
        // A new drag or tap takes over at the frame currently on screen.
        const x = new DOMMatrixReadOnly(getComputedStyle(panels[index]).transform).m41;
        const at = Math.max(0, Math.min(tabs.length - 1, index - x / viewport.clientWidth));
        stop();
        paint(at);
      }
      if (!viewport.hasAttribute("data-sliding")) {
        viewport.style.setProperty("--swipe-visible-height", Math.max(0, window.innerHeight - Math.max(0, viewport.getBoundingClientRect().top)) + "px");
        panels.forEach((panel, i) => {
          if (i !== index) panel.style.top = `${window.scrollY - targetScroll(tabs[i])}px`;
        });
        viewport.dataset.sliding = "true";
        panels[index].dataset.slideOrigin = "";
        paint(index);
      }
      return position;
    };
    const expose = (at: number) => {
      if (at >= first && at <= last) return;
      first = Math.min(first, Math.floor(at));
      last = Math.max(last, Math.ceil(at));
      setPreview(tabs.slice(first, last + 1));
    };
    const commit = (next: number) => {
      if (next !== index) {
        const origin = scrollOrigin();
        scrollOffsets.current.set(originTab, Math.max(0, window.scrollY - origin));
        pendingScroll.current = targetScroll(tabs[next]);
        // A short destination must leave room for the portion of the header already scrolled away.
        const aboveTabs = main.getBoundingClientRect().top + window.scrollY - Math.min(origin, pendingScroll.current);
        main.style.minHeight = `max(0px, calc(100dvh - ${Math.max(0, aboveTabs)}px))`;
        if (panels[index].contains(document.activeElement)) buttons[next].focus({ preventScroll: true });
      }
      // Exchange the in-flow panel before releasing the animation's final frame.
      flushSync(() => { setTab(tabs[next]); setTapTarget(null); setPreview([]); });
      if (next === index) { reset(); indicator.style.transform = underline(index); }
    };
    const settle = (next: number, immediate = false) => {
      if (next === index && !viewport.hasAttribute("data-sliding")) return;
      if (immediate || reduced.matches) { commit(next); return; }
      begin();
      const distance = Math.abs(next - position);
      if (distance < .002) { commit(next); return; }
      expose(next);
      const timing: KeyframeAnimationOptions = { ...getTabSlideTiming(distance), fill: "forwards" };
      animations = panels.map((panel, i) => panel.animate([
        { transform: panelTransform(i, position) }, { transform: panelTransform(i, next) },
      ], timing));
      // Cross each label at its own position, including when localized labels differ in width.
      const stops = [position];
      const step = Math.sign(next - position);
      for (let i = step > 0 ? Math.floor(position) + 1 : Math.ceil(position) - 1; i !== next; i += step) stops.push(i);
      stops.push(next);
      animations.push(indicator.animate(stops.map(at => ({
        transform: underline(at), offset: Math.abs(at - position) / distance,
      })), timing));
      const slide = animations[index];
      void slide.finished.then(() => { if (animations[index] === slide) commit(next); }, () => {});
    };
    select.current = (name, immediate) => {
      const next = tabs.indexOf(name);
      if (next < 0) return;
      setTapTarget(next === index ? null : name);
      settle(next, immediate);
    };
    swipeMotion.current = {
      onStart: () => reduced.matches ? index : begin(),
      onProgress: at => { if (!reduced.matches) { expose(at); paint(at); } },
      onEnd: settle,
    };
    return () => { resize.disconnect(); reset(); indicator.style.transform = ""; };
  }, [tabs, originTab]);
  useLayoutEffect(() => {
    const main = root.current;
    if (!main || tabs.length < 2) return;
    return bindTabSwipe(main.closest("main") ?? main, tabs.length, {
      viewport: main.querySelector<HTMLElement>("[data-tab-panels]")!, ignore: ignoreSwipe, motion: () => swipeMotion.current!,
    });
  }, [tabs]);
  return { root, tabs, selectedTab, isVisible: (name: string) => name === originTab || preview.includes(name),
    selectTab: (name: string, immediate?: boolean) => select.current(name, immediate) };
}
