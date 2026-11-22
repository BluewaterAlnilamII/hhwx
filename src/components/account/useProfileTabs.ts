import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { bindTabSwipe } from "@/lib/bind-tab-swipe";

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
  const [preview, setPreview] = useState<string | null>(null);
  const selectedTab = tabs.includes(tab) ? tab : "home";
  const root = useRef<HTMLDivElement>(null);
  const scrollOffsets = useRef(new Map<string, number>());
  const pendingScroll = useRef<number | null>(null);
  const arrival = useRef(0);
  const select = useRef<(name: string) => void>(() => {});
  useLayoutEffect(() => {
    const main = root.current;
    if (!main || tabs.length < 2) return;
    const viewport = main.querySelector<HTMLElement>("[data-tab-panels]")!;
    const panels = Array.from(viewport.children) as HTMLElement[];
    const index = tabs.indexOf(selectedTab);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let clampedScroll: number | null = null;
    const scrollOrigin = () => window.scrollY + main.getBoundingClientRect().top - (document.querySelector("header")?.getBoundingClientRect().height ?? 0);
    const targetScroll = (name: string) => {
      const origin = scrollOrigin();
      if (window.scrollY < origin && window.scrollY !== clampedScroll) return window.scrollY;
      return origin + (scrollOffsets.current.get(name) ?? 0);
    };
    let animations: Animation[] = [];
    let position = index;
    let neighbor = index;

    if (pendingScroll.current !== null) {
      window.scrollTo({ top: pendingScroll.current, behavior: "instant" });
      // A short tab can force the shared header back onscreen without the reader scrolling up.
      if (window.scrollY < pendingScroll.current - 1) clampedScroll = window.scrollY;
      pendingScroll.current = null;
    }
    if (arrival.current && !reduced.matches) {
      animations.push(panels[index].animate([{ opacity: .65, translate: `${arrival.current * 18}px` }, { opacity: 1, translate: "0" }], { duration: 165, easing: "ease-out" }));
    }
    arrival.current = 0;
    const stopAnimations = () => { animations.forEach(a => a.cancel()); animations = []; };
    const reset = () => {
      stopAnimations();
      delete viewport.dataset.sliding;
      viewport.style.removeProperty("--swipe-visible-height");
      panels.forEach(panel => { panel.style.transform = ""; panel.style.top = ""; });
    };
    const commit = (next: number) => {
      if (next !== index) {
        scrollOffsets.current.set(selectedTab, Math.max(0, window.scrollY - scrollOrigin()));
        pendingScroll.current = targetScroll(tabs[next]);
        if (panels[index].contains(document.activeElement)) document.getElementById("profile-tab-" + tabs[next])?.focus({preventScroll: true});
      }
      const selectPanel = () => { setTab(tabs[next]); setPreview(null); };
      // Keep the finished slide visible until React has hidden the outgoing panel.
      if (viewport.hasAttribute("data-sliding")) flushSync(selectPanel);
      else selectPanel();
      reset();
      position = neighbor = index;
    };
    select.current = name => {
      const next = tabs.indexOf(name);
      if (next < 0) return;
      arrival.current = Math.sign(next - index);
      commit(next);
    };
    const surface = main.closest("main") ?? main;
    const unbind = bindTabSwipe(surface, index, tabs.length, {
      viewport,
      ignore: ignoreSwipe,
      onStart: () => {
        if (!reduced.matches) {
          const visibleHeight = window.innerHeight - Math.max(0, viewport.getBoundingClientRect().top);
          viewport.style.setProperty("--swipe-visible-height", Math.max(0, visibleHeight) + "px");
        }
        const transform = getComputedStyle(panels[index]).transform;
        const origin = transform === "none" ? index : index - new DOMMatrixReadOnly(transform).m41 / viewport.clientWidth;
        stopAnimations();
        return origin;
      },
      onProgress: next => {
        position = next;
        const adjacent = index + Math.sign(next - index);
        if (adjacent !== neighbor) {
          neighbor = adjacent;
          if (!reduced.matches && neighbor !== index) panels[neighbor].style.top = `${window.scrollY - targetScroll(tabs[neighbor])}px`;
          setPreview(reduced.matches || adjacent === index ? null : tabs[adjacent]);
        }
        if (reduced.matches) return;
        viewport.dataset.sliding = "true";
        panels[index].style.transform = `translateX(${(index - next) * 100}%)`;
        if (neighbor !== index) {
          panels[neighbor].style.transform = `translateX(${(neighbor - next) * 100}%)`;
        }
      },
      onEnd: next => {
        if (neighbor === index || reduced.matches || !viewport.hasAttribute("data-sliding")) { commit(next); return; }
        animations = [index, neighbor].map(i => panels[i].animate(
          [{ transform: `translateX(${(i - position) * 100}%)` }, { transform: `translateX(${(i - next) * 100}%)` }],
          { duration: 180, easing: "cubic-bezier(.2,.75,.25,1)", fill: "forwards" },
        ));
        void Promise.all(animations.map(a => a.finished)).then(() => commit(next), () => {});
      },
    });
    return () => { unbind(); reset(); };
  }, [tabs, selectedTab]);
  return { root, tabs, selectedTab, preview, selectTab: (name: string) => select.current(name) };
}
