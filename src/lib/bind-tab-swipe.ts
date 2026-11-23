export function getTabSlideTiming(remainingPages: number) {
  return { duration: Math.round(150 + 190 * Math.sqrt(remainingPages)), easing: "cubic-bezier(.32,.24,.32,1)" };
}

export type TabSwipeMotion = {
  onStart: () => number;
  onProgress: (position: number) => void;
  onEnd: (index: number) => void;
};

export function bindTabSwipe(bar: HTMLElement, count: number, { viewport = bar, ignore, motion }: {
  viewport?: HTMLElement;
  ignore: (target: Element, root: HTMLElement, event: PointerEvent) => boolean;
  motion: () => TabSwipeMotion;
}) {
  let pointer: { id: number; x: number; y: number; origin: number | null } | null = null;
  let width = 0;
  let suppressClick = false;
  const clear = () => {
    const id = pointer?.id;
    pointer = null;
    if (id !== undefined && bar.hasPointerCapture(id)) bar.releasePointerCapture(id);
  };
  const cancel = () => {
    const gesture = pointer;
    clear();
    if (gesture && gesture.origin !== null) motion().onEnd(Math.round(gesture.origin));
  };
  const lostCapture = (event: PointerEvent) => {
    // Taking capture from the touched child also bubbles its lost-capture event here.
    if (event.target === bar) cancel();
  };
  const down = (event: PointerEvent) => {
    if (!event.isPrimary) { cancel(); suppressClick = true; return; }
    suppressClick = false;
    const view = bar.ownerDocument.defaultView;
    if (event.pointerType === "mouse" || !view?.matchMedia("(max-width: 1279px)").matches
      || (view.visualViewport?.scale ?? 1) > 1) return;
    if (typeof Element !== "undefined" && event.target instanceof Element && ignore(event.target, bar, event)) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: null };
  };
  const move = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const x = event.clientX - pointer.x;
    const y = event.clientY - pointer.y;
    if (pointer.origin === null) {
      if (Math.max(Math.abs(x), Math.abs(y)) < 8) return;
      if (Math.abs(x) <= Math.abs(y) * 1.2) { clear(); return; }
      suppressClick = true;
      bar.setPointerCapture(event.pointerId);
      width = viewport.getBoundingClientRect().width;
      // A tab can finish settling between touch-down and the first horizontal move.
      pointer.origin = motion().onStart();
    }
    motion().onProgress(Math.max(0, Math.min(count - 1, pointer.origin - x / width)));
  };
  const end = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const x = event.clientX - pointer.x;
    const y = event.clientY - pointer.y;
    const origin = pointer.origin;
    clear();
    if (origin === null) return;
    // The previous slide may still be settling when the finger takes over.
    const startPage = Math.round(origin);
    const change = event.type === "pointerup"
      && Math.abs(x) >= Math.min(64, width * 0.2)
      && Math.abs(x) > Math.abs(y) * 1.2;
    const next = change ? Math.max(0, Math.min(count - 1, startPage + (x < 0 ? 1 : -1))) : startPage;
    motion().onEnd(next);
  };
  const click = (event: MouseEvent) => {
    if (suppressClick && event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
    suppressClick = false;
  };
  // Cancel only a claimed horizontal gesture; descendants retain native scrolling and pinch zoom.
  const touchMove = (event: TouchEvent) => {
    if (!pointer || event.touches.length !== 1) return;
    const x = Math.abs(event.touches[0].clientX - pointer.x);
    const y = Math.abs(event.touches[0].clientY - pointer.y);
    if (event.cancelable && (pointer.origin !== null || (x >= 8 && x > y * 1.2))) event.preventDefault();
  };
  bar.addEventListener("pointerdown", down);
  bar.addEventListener("pointermove", move);
  bar.addEventListener("pointerup", end);
  bar.addEventListener("pointercancel", end);
  bar.addEventListener("lostpointercapture", lostCapture);
  bar.addEventListener("click", click, true);
  bar.addEventListener("touchmove", touchMove, { passive: false });
  return () => {
    clear();
    bar.removeEventListener("pointerdown", down);
    bar.removeEventListener("pointermove", move);
    bar.removeEventListener("pointerup", end);
    bar.removeEventListener("pointercancel", end);
    bar.removeEventListener("lostpointercapture", lostCapture);
    bar.removeEventListener("click", click, true);
    bar.removeEventListener("touchmove", touchMove);
  };
}
