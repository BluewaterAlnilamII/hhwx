"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import type { FavoriteGroup } from "@/lib/bandori/favorites";
import type { ProfileModuleId } from "@/lib/profile-homepage";

type CollectionView = ProfileModuleId | "cards/edit" | "events/edit";
type ReturnPosition = { url: string; top: number; selector: string };
type InlinePosition = { selector: string; edge?: "bottom"; y: number; focus: string; eventServer?: string };

function visibleCollectionParts(root: HTMLElement) {
  const parts = new Map<string, { element: HTMLElement; className: string; x: number; y: number }>();
  for (const section of root.querySelectorAll<HTMLElement>("[data-collection]")) {
    const bounds = section.getBoundingClientRect();
    if (bounds.bottom <= 0 || bounds.top >= innerHeight) continue;
    for (const element of section.querySelectorAll<HTMLElement>("[data-heading-part], [data-card], [data-event], [data-song]")) {
      const rect = element.getBoundingClientRect();
      if (rect.height && rect.bottom > 0 && rect.top < innerHeight) {
        const { headingPart, card, event, song } = element.dataset;
        parts.set(section.dataset.collection + ":" + (headingPart ?? card ?? event ?? song),
          { element, className: element.className, x: rect.left, y: rect.top });
      }
    }
  }
  return parts;
}

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
function readHash() {
  return (window.location.hash.match(/^#collection\/((?:cards|events)(?:\/edit)?|songs)$/u)?.[1] ?? "") as CollectionView | "";
}
const noCollection = () => "" as const;
const readSongMode = () => readHash() === "songs" && history.state?.editingSongs === true;
const notify = () => window.dispatchEvent(new HashChangeEvent("hashchange"));

function remember(selector: string) {
  const position: ReturnPosition = { url: location.href, top: window.scrollY, selector };
  history.replaceState({ ...history.state, collectionPosition: position }, "");
}
function leaveSharedView() {
  history.replaceState({ ...history.state, collectionFromHome: false, collectionDepth: 0, fromCollection: null, fromAllCards: false, collectionPosition: null }, "", location.pathname + location.search);
  notify();
}
export default function useCollectionNavigation(groups: FavoriteGroup[] | null, editable: boolean) {
  const hash = useSyncExternalStore(subscribe, readHash, noCollection);
  const editingSongs = useSyncExternalStore(subscribe, readSongMode, () => false) && editable;
  const kind = hash === "cards/edit" ? "cards" : hash === "events/edit" ? "events" : hash;
  const expanded = kind && (!groups || groups.some(group => group.kind === kind)) ? kind : undefined;
  const editing = editable && Boolean(expanded) && hash.endsWith("/edit");
  const loaded = groups !== null;
  const root = useRef<HTMLDivElement>(null);
  const start = useRef<HTMLSpanElement>(null);
  const inlinePosition = useRef<InlinePosition | null>(null);
  const previousParts = useRef<ReturnType<typeof visibleCollectionParts> | null>(null);
  const exitAnimations = useRef<Animation[]>([]);
  const [stuck, setStuck] = useState<ReadonlySet<string>>(new Set());

  // Collection transitions and detail returns both restore their own viewport anchor.
  useEffect(() => {
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => { history.scrollRestoration = previous; };
  }, []);

  function toTop(behavior: ScrollBehavior) {
    start.current?.parentElement?.querySelector<HTMLElement>("[data-collection-heading] button")?.focus({ preventScroll: true });
    start.current?.scrollIntoView({ block: "start", behavior });
  }

  useLayoutEffect(() => {
    if (!loaded) return;
    if (hash && !expanded) { leaveSharedView(); return; }
    const anchor = inlinePosition.current;
    const collections = root.current;
    if (anchor && collections) {
      inlinePosition.current = null;
      if (anchor.eventServer && history.state?.collectionEventServer !== anchor.eventServer) {
        history.replaceState({ ...history.state, collectionEventServer: anchor.eventServer }, "");
      }
      const { selector, edge = "top", y } = anchor;
      // Only one scroll anchor should compensate for a collection layout change.
      const stop = new AbortController();
      collections.style.overflowAnchor = "none";
      let alignedScroll = window.scrollY;
      const align = () => {
        if (stop.signal.aborted) return;
        const element = collections.querySelector(selector);
        if (!element?.getClientRects().length) return;
        const distance = element.getBoundingClientRect()[edge] - y;
        if (Math.abs(distance) > 1) window.scrollBy({ top: distance, behavior: "instant" });
        alignedScroll = window.scrollY;
      };
      align();
      const focusTarget = collections.querySelector<HTMLElement>(anchor.focus);
      focusTarget?.focus({ preventScroll: true });
      const animations: Animation[] = [];
      if (previousParts.current) {
        const anchorElement = collections.querySelector(selector);
        for (const [key, part] of visibleCollectionParts(collections)) {
          const old = previousParts.current.get(key);
          if (!old && !part.element.hasAttribute("data-collection-extra") && part.element.dataset.headingPart !== "more-footer") continue;
          const dx = old ? Math.max(-80, Math.min(80, old.x - part.x)) : 0;
          const dy = part.element === anchorElement ? 0 : old ? Math.max(-32, Math.min(32, old.y - part.y)) : 6;
          const changedView = old && old.className !== part.className;
          if (old && !changedView && Math.abs(dx) + Math.abs(dy) < 1) continue;
          animations.push(part.element.animate([{ transform: `translate(${dx}px, ${dy}px)`, opacity: changedView ? 0.6 : old ? 1 : 0 }, { transform: "none", opacity: 1 }],
            { id: "collection-enter", duration: 180, easing: "cubic-bezier(.2,.7,.2,1)" }));
        }
        previousParts.current = null;
      }
      // Rows above the anchor may reflow after the first successful alignment.
      const observer = new ResizeObserver(align);
      observer.observe(collections);
      observer.observe(document.body);
      window.addEventListener("scroll", () => {
        if (Math.abs(window.scrollY - alignedScroll) > 1) stop.abort();
      }, { signal: stop.signal, passive: true });
      for (const event of ["wheel", "pointerdown", "touchstart", "keydown", "resize"]) {
        window.addEventListener(event, () => stop.abort(), { signal: stop.signal, passive: true, capture: true });
      }
      stop.signal.addEventListener("abort", () => {
        observer.disconnect();
        collections.style.removeProperty("overflow-anchor");
      }, { once: true });
      if (animations.length) void Promise.allSettled(animations.map(animation => animation.finished)).then(align);
      return () => { stop.abort(); animations.forEach(animation => animation.cancel()); };
    }
    const position: ReturnPosition | undefined = history.state?.collectionPosition;
    if (position?.url !== location.href) {
      if (expanded) toTop("instant");
      return;
    }
    // A detail page can return before the catalog has rendered the original link.
    const restore = () => {
      const target = Array.from(document.querySelectorAll<HTMLElement>(position.selector)).find(el => el.getClientRects().length);
      if (!target) return false;
      target.focus({ preventScroll: true });
      window.scrollTo({ top: position.top, behavior: "instant" });
      history.replaceState({ ...history.state, collectionPosition: null }, "");
      return true;
    };
    if (restore() || !root.current) return;
    const observer = new ResizeObserver(() => { if (restore()) observer.disconnect(); });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [expanded, hash, loaded]);

  const sectionCount = groups?.length;
  useEffect(() => {
    if (!root.current || !sectionCount) return;
    const observer = new IntersectionObserver(entries => {
      setStuck(previous => {
        const next = new Set(previous);
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.collectionStart!;
          if (!entry.isIntersecting && entry.boundingClientRect.top < 59) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    }, { rootMargin: "-59px 0px 0px" });
    root.current.querySelectorAll("[data-collection-start]").forEach(marker => observer.observe(marker));
    return () => observer.disconnect();
  }, [sectionCount, editing, expanded]);

  useEffect(() => () => { exitAnimations.current.forEach(animation => animation.cancel()); }, [hash]);

  function transition(change: () => void) {
    exitAnimations.current.forEach(animation => animation.cancel());
    exitAnimations.current = [];
    previousParts.current = null;
    if (!root.current || matchMedia("(prefers-reduced-motion: reduce)").matches) { change(); return; }
    const parts = visibleCollectionParts(root.current);
    for (const { element } of parts.values()) {
      if (element.hasAttribute("data-collection-extra")) {
        exitAnimations.current.push(element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: "forwards" }));
      }
    }
    if (!exitAnimations.current.length) { previousParts.current = parts; change(); return; }
    const url = location.href;
    void Promise.all(exitAnimations.current.map(animation => animation.finished)).then(() => {
      if (!root.current || location.href !== url) return;
      if (!root.current.getClientRects().length) {
        exitAnimations.current.forEach(animation => animation.cancel());
        return;
      }
      previousParts.current = visibleCollectionParts(root.current);
      change();
    }, () => { /* A newer navigation superseded the fade. */ });
  }

  function open(view: CollectionView, source: "more" | "more-footer" | "edit" = view.endsWith("/edit") ? "edit" : "more") {
    transition(() => openView(view, source));
  }
  function anchorSection(kind: string, source: "more" | "more-footer" | "edit", toPreview = false) {
    const section = `[data-collection="${kind}"]`;
    const container = root.current?.querySelector(section);
    const heading = container?.querySelector<HTMLElement>("[data-collection-heading]");
    if (!container || !heading) return;
    const bar = heading.getBoundingClientRect();
    const focus = section + (source === "edit" ? " [data-edit]" : " [data-collection-heading] button");
    const startY = container.querySelector("[data-collection-start]")!.getBoundingClientRect().top;
    let anchor: InlinePosition = { selector: section + " [data-collection-start]", y: toPreview ? bar.top : startY, focus,
      eventServer: history.state?.collectionEventServer };
    let item = source === "more-footer" ? container.querySelector<HTMLElement>("[data-song]:last-child, [data-size]:last-child [data-card]:last-child") : null;
    if (kind === "events" || (kind === "cards" && (source === "edit" || toPreview))) {
      const attr = kind === "events" ? "data-event" : "data-card";
      const candidates = Array.from(container.querySelectorAll<HTMLElement>(`[${attr}]${toPreview ? ":not([data-collection-extra])" : ""}`));
      item = candidates.find(el => {
        const rect = el.getBoundingClientRect();
        return rect.bottom > bar.bottom && rect.top < innerHeight;
      }) ?? null;
      if (!item && candidates.length) {
        const last = candidates[candidates.length - 1];
        if (toPreview && last.getBoundingClientRect().bottom <= bar.bottom) {
          const selector = kind === "cards" ? section + " [data-size]" : `${section} [${attr}="${CSS.escape(last.getAttribute(attr)!)}"]`;
          anchor = { ...anchor, selector, edge: "bottom", y: bar.bottom };
        } else if (!toPreview) item = candidates[0];
      }
    }
    if (item) {
      const attr = kind === "events" ? "data-event" : kind === "cards" ? "data-card" : "data-song";
      const y = item.getBoundingClientRect().top;
      anchor = { ...anchor, selector: `${section} [${attr}="${CSS.escape(item.getAttribute(attr)!)}"]`,
        y: source === "edit" ? Math.max(y, bar.bottom) : y };
    }
    inlinePosition.current = anchor;
  }
  function openView(view: CollectionView, source: "more" | "more-footer" | "edit") {
    const [kind] = view.split("/");
    anchorSection(kind, source);
    const nested = expanded === kind && view.endsWith("/edit");
    const switching = Boolean(expanded) && !nested;
    const depth = history.state?.collectionDepth ?? (history.state?.collectionFromHome ? 1 : 0);
    const state = { collectionFromHome: expanded ? Boolean(history.state?.collectionFromHome) : true,
      collectionDepth: switching ? depth : depth + 1, fromCollection: nested ? kind : null,
      editingSongs: view === "songs" && source === "edit", collectionEventServer: history.state?.collectionEventServer };
    if (switching) history.replaceState(state, "", "#collection/" + view);
    else {
      remember(`[data-${source}="${kind}"]`);
      history.pushState(state, "", "#collection/" + view);
    }
    notify();
  }
  function close() {
    transition(() => closeView(false));
  }
  function finishEditing() {
    transition(() => closeView(true));
  }
  function closeView(finished: boolean) {
    if (!expanded) return;
    const state = history.state;
    const toFull = finished && (state?.fromCollection === expanded || (expanded === "cards" && state?.fromAllCards));
    anchorSection(expanded, finished ? "edit" : "more", !toFull);
    if (toFull) history.back();
    else if (state?.collectionFromHome) history.go(-(state.collectionDepth || 1));
    else leaveSharedView();
  }
  function toggleSongMode() {
    if (expanded !== "songs") { open("songs", "edit"); return; }
    history.replaceState({ ...history.state, editingSongs: !editingSongs }, "");
    notify();
  }
  function rememberDetail(event: MouseEvent) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const href = event.target instanceof Element && event.target.closest("a[href]")?.getAttribute("href");
    if (href) remember(`a[href="${CSS.escape(href)}"]`);
  }
  return { expanded, editing, editingSongs, toggleSongMode, finishEditing, root, start, stuck, open, close, rememberDetail,
    returnToTop: () => toTop(matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth") };
}
