"use client";

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import { favoritePreviewLimit, type FavoriteGroup } from "@/lib/bandori/favorites";
import type { ProfileModuleId } from "@/lib/profile-homepage";

type CollectionView = ProfileModuleId | `${ProfileModuleId}/edit`;
type FavoriteAnchor = { section: string; id: string };
type ReturnPosition = { url: string; top: number; selector?: string; offset?: number; focus?: boolean; item?: FavoriteAnchor };
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
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener("hashchange", listener);
    window.removeEventListener("popstate", listener);
  };
}
function readView() {
  const editor = history.state?.collectionEditor;
  if (editor === "cards" || editor === "events" || editor === "songs") return `${editor}/edit` as const;
  if (location.hash === "#collection/songs" && history.state?.editingSongs) return "songs/edit";
  return (window.location.hash.match(/^#collection\/((?:cards|events)(?:\/edit)?|songs)$/u)?.[1] ?? "") as CollectionView | "";
}
const noCollection = () => "" as const;
const notify = () => window.dispatchEvent(new HashChangeEvent("hashchange"));

function remember(selector?: string, focus = true) {
  const target = selector ? Array.from(document.querySelectorAll<HTMLElement>(selector)).find(el => el.getClientRects().length) : undefined;
  const row = target?.closest<HTMLElement>("[data-card], [data-event], [data-song]");
  const id = row?.dataset.card ?? row?.dataset.event ?? row?.dataset.song;
  const section = row?.closest<HTMLElement>("[data-collection]")?.dataset.collection;
  const position: ReturnPosition = { url: location.href, top: window.scrollY, selector, offset: target?.getBoundingClientRect().top,
    focus, item: section && id ? { section, id } : undefined };
  history.replaceState({ ...history.state, collectionPosition: position }, "");
}
function replaceView(hash: string, editor?: string) {
  const state = { ...history.state, collectionEditor: editor, editingSongs: false, collectionPosition: null };
  if (hash === location.hash) history.replaceState(state, "");
  else history.replaceState(state, "", location.pathname + location.search + hash);
  notify();
}

let checkedDocumentLoad = false;
export function resetCollectionOnReload() {
  if (checkedDocumentLoad) return;
  checkedDocumentLoad = true;
  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (navigation?.type !== "reload" || new URL(navigation.name).pathname !== location.pathname) return;
  if (readView()) replaceView("");
  else if (history.state?.collectionPosition) history.replaceState({ ...history.state, collectionPosition: null }, "");
}

export default function useCollectionNavigation(groups: FavoriteGroup[] | null, editable: boolean | undefined) {
  const view = useSyncExternalStore(subscribe, readView, noCollection);
  const kind = view.split("/")[0];
  const group = groups?.find(group => group.kind === kind);
  const editing = Boolean(group) && editable === true && view.endsWith("/edit");
  const awaitingEditPermission = editable === undefined && view.endsWith("/edit");
  const expanded = group && (editing || group.items.length > favoritePreviewLimit(group)) ? group.kind : undefined;
  const loaded = groups !== null;
  const root = useRef<HTMLDivElement>(null);
  const start = useRef<HTMLSpanElement>(null);
  const inlinePosition = useRef<InlinePosition | null>(null);
  const waitingForReturn = useRef(false);
  const previousParts = useRef<ReturnType<typeof visibleCollectionParts> | null>(null);
  const exitAnimations = useRef<Animation[]>([]);
  const [stuck, setStuck] = useState<ReadonlySet<string>>(new Set());
  const stillInCollection = useEffectEvent(({ section, id }: FavoriteAnchor) =>
    groups?.some(group => group.kind === section && group.items.some(item => item.target === id)));

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
    if (view && !expanded) {
      if (awaitingEditPermission) return;
      replaceView("");
      return;
    }
    const anchor = inlinePosition.current;
    const collections = root.current;
    if (anchor && collections) {
      inlinePosition.current = null;
      if (history.state?.collectionPosition) history.replaceState({ ...history.state, collectionPosition: null }, "");
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
      if (expanded) start.current?.scrollIntoView({ block: "start", behavior: "instant" });
      return;
    }
    // A detail page can return before the catalog has rendered the original link.
    const restore = () => {
      const target = position.selector && Array.from(document.querySelectorAll<HTMLElement>(position.selector)).find(el => el.getClientRects().length);
      if (position.selector && !target) {
        if (!position.item || stillInCollection(position.item)) return false;
        const selector = `[data-collection-start="${CSS.escape(position.item.section)}"]`;
        const marker = root.current?.querySelector<HTMLElement>(selector);
        (marker ?? root.current)?.scrollIntoView({ block: "start", behavior: "instant" });
        if (position.focus !== false) marker?.parentElement?.querySelector<HTMLElement>("[data-collection-heading]")?.focus({ preventScroll: true });
        waitingForReturn.current = false;
        remember(marker ? selector : undefined, false);
        return true;
      }
      if (target && position.focus !== false) target.focus({ preventScroll: true });
      const top = position.top > 0 && target && position.offset !== undefined ? window.scrollY + target.getBoundingClientRect().top - position.offset : position.top;
      window.scrollTo({ top, behavior: "instant" });
      waitingForReturn.current = false;
      history.replaceState({ ...history.state, collectionPosition: { ...position, focus: false } }, "");
      return true;
    };
    if (restore() || !root.current) return;
    waitingForReturn.current = true;
    const input = new AbortController();
    const observer = new ResizeObserver(() => { if (restore()) input.abort(); });
    observer.observe(root.current);
    input.signal.addEventListener("abort", () => { observer.disconnect(); waitingForReturn.current = false; }, { once: true });
    for (const event of ["wheel", "touchmove", "pointerdown", "keydown"]) {
      window.addEventListener(event, () => input.abort(), { passive: true, capture: true, signal: input.signal });
    }
    return () => input.abort();
  }, [expanded, view, loaded, awaitingEditPermission]);

  useEffect(() => {
    if (!loaded) return;
    const url = location.href;
    function rememberReadingPosition() {
      if (!root.current?.getClientRects().length || waitingForReturn.current || location.href !== url) return;
      if (history.state?.collectionPosition?.top === window.scrollY) return;
      const row = Array.from(root.current.querySelectorAll<HTMLElement>("[data-card], [data-event], [data-song]")).find(el => {
        const rect = el.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < innerHeight && rect.height > 0;
      });
      const attr = row?.hasAttribute("data-card") ? "data-card" : row?.hasAttribute("data-event") ? "data-event" : "data-song";
      remember(row && `[${attr}="${CSS.escape(row.getAttribute(attr)!)}"]`, false);
    }
    window.addEventListener("scrollend", rememberReadingPosition);
    return () => window.removeEventListener("scrollend", rememberReadingPosition);
  }, [loaded, view]);

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

  useEffect(() => () => { exitAnimations.current.forEach(animation => animation.cancel()); }, [view]);

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
    if (view.endsWith("/edit")) replaceView(location.hash, kind);
    else replaceView("#collection/" + kind);
  }
  function close() {
    transition(() => closeView(false));
  }
  function finishEditing(hasMore: boolean) {
    transition(() => closeView(true, hasMore));
  }
  function closeView(finished: boolean, hasMore = true) {
    if (!expanded) return;
    const original = location.hash;
    const legacyEditor = original.endsWith("/edit") || history.state?.editingSongs;
    const returnHash = finished && !legacyEditor && (hasMore || original !== "#collection/" + expanded) ? original : "";
    anchorSection(expanded, finished ? "edit" : "more", returnHash !== "#collection/" + expanded);
    replaceView(returnHash);
  }
  function rememberDetail(event: MouseEvent) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!link) return;
    const song = link.closest<HTMLElement>("[data-song-menu]")?.dataset.songMenu;
    remember(song ? `[data-song="${CSS.escape(song)}"] button[aria-haspopup="dialog"]` : `a[href="${CSS.escape(link.getAttribute("href")!)}"]`);
  }
  return { expanded, editing, finishEditing, root, start, stuck, open, close, rememberDetail,
    returnToTop: () => toTop(matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth") };
}
