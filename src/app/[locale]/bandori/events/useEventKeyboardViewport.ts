"use client";

import { useEffect } from "react";

const scope = ".event-page, .event-search-dialog, #event-pt-calculator";

// One owner for the page, its portaled search, and the planner's keyboard viewport.
export function observeEventKeyboardViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  const root = document.documentElement;
  let frame = 0;
  let restoreTimer = 0;
  let session: {
    height: number; width: number; x: number; y: number; opened: boolean;
    input: HTMLElement; body: HTMLElement | null; bodyTop: number;
    pageScrolled: boolean; bodyScrolled: boolean;
  } | null = null;

  const inputTarget = (target: EventTarget | null) => target instanceof HTMLElement
    && target.matches("input:not([type=checkbox]):not([type=radio]):not(:disabled):not([readonly]), textarea:not(:disabled):not([readonly])")
    && target.closest(scope) ? target : null;

  const remember = (event: Event) => {
    const input = inputTarget(event.target);
    if (!input || window.matchMedia("(min-width: 1280px)").matches || viewport.scale !== 1) return;
    if (session?.opened) {
      if (session.input !== input) session.bodyScrolled = true;
      return;
    }
    // Pointerdown precedes the browser's focus-induced page scroll.
    if (event.type === "focusin" && session?.input === input) return;
    const body = input.closest<HTMLElement>(".event-pt-calculator-fields");
    session = { height: viewport.height, width: viewport.width, x: window.scrollX, y: window.scrollY,
      opened: false, input, body, bodyTop: body?.scrollTop ?? 0, pageScrolled: false, bodyScrolled: false };
  };

  const userScroll = (event: Event) => {
    if (!session?.opened || !(event.target instanceof HTMLElement)) return;
    if (event.target.closest(".event-pt-calculator-fields")) session.bodyScrolled = true;
    else if (event.target.closest(".event-page") && !event.target.closest("[role=dialog]")) session.pageScrolled = true;
  };

  const update = () => {
    root.style.setProperty("--event-viewport-height", `${viewport.height}px`);
    root.style.setProperty("--event-viewport-top", `${viewport.offsetTop}px`);
    root.style.setProperty("--event-viewport-bottom", `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`);
    window.clearTimeout(restoreTimer);
    if (session && (Math.abs(viewport.width - session.width) > 80 || viewport.scale !== 1)) session = null;
    const keyboard = !!session && session.height - viewport.height > 120;
    root.toggleAttribute("data-event-keyboard", keyboard);
    const panel = document.getElementById("event-pt-calculator");
    if (panel) delete panel.dataset.sizeMotion;
    if (!session) return;
    if (keyboard) session.opened = true;
    else if (session.opened) {
      // Wait for the browser's viewport animation, then restore without smooth scrolling.
      restoreTimer = window.setTimeout(() => {
        const previous = session;
        session = null;
        if (!previous) return;
        if (previous.body?.isConnected && !previous.bodyScrolled) previous.body.scrollTop = previous.bodyTop;
        if (!previous.pageScrolled) window.scrollTo({ left: previous.x, top: previous.y, behavior: "instant" });
      }, 120);
    }
  };
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
  update();
  document.addEventListener("pointerdown", remember, true);
  document.addEventListener("focusin", remember, true);
  document.addEventListener("touchmove", userScroll, { passive: true, capture: true });
  document.addEventListener("wheel", userScroll, { passive: true, capture: true });
  viewport.addEventListener("resize", schedule);
  viewport.addEventListener("scroll", schedule);
  window.addEventListener("resize", schedule);
  return () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(restoreTimer);
    document.removeEventListener("pointerdown", remember, true);
    document.removeEventListener("focusin", remember, true);
    document.removeEventListener("touchmove", userScroll, true);
    document.removeEventListener("wheel", userScroll, true);
    viewport.removeEventListener("resize", schedule);
    viewport.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    root.removeAttribute("data-event-keyboard");
    for (const name of ["height", "top", "bottom"]) root.style.removeProperty(`--event-viewport-${name}`);
  };
}

export function useEventKeyboardViewport() {
  useEffect(observeEventKeyboardViewport, []);
}
