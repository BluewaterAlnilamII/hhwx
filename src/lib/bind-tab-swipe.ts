import { pulseTouch } from "./touch-feedback";

export function bindTabSwipe(bar: HTMLElement, index: number, count: number, callbacks: {
  viewport?: HTMLElement;
  ignore: (target: Element, root: HTMLElement, event: PointerEvent) => boolean;
  onStart: () => number;
  onProgress: (position: number) => void;
  onEnd: (index: number) => void;
}) {
  let pointer: { id: number; x: number; y: number; horizontal: boolean; origin: number } | null = null;
  let width = 0;
  let suppressClick = false;
  const clear = () => {
    const id = pointer?.id;
    pointer = null;
    if (id !== undefined && bar.hasPointerCapture(id)) bar.releasePointerCapture(id);
  };
  const cancel = () => {
    const horizontal = pointer?.horizontal;
    clear();
    if (horizontal) callbacks.onEnd(index);
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
    if (typeof Element !== "undefined" && event.target instanceof Element && callbacks.ignore(event.target, bar, event)) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false, origin: index };
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
      width = (callbacks.viewport ?? bar).getBoundingClientRect().width;
      pointer.origin = callbacks.onStart();
    }
    callbacks.onProgress(Math.max(0, Math.min(count - 1, pointer.origin - x / width)));
  };
  const end = (event: PointerEvent) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    const x = event.clientX - pointer.x;
    const y = event.clientY - pointer.y;
    const horizontal = pointer.horizontal;
    const change = event.type === "pointerup" && horizontal
      && Math.abs(x) >= Math.min(64, width * 0.2)
      && Math.abs(x) > Math.abs(y) * 1.2;
    clear();
    if (horizontal) {
      const next = change ? Math.max(0, Math.min(count - 1, index + (x < 0 ? 1 : -1))) : index;
      if (next !== index) pulseTouch(event);
      callbacks.onEnd(next);
    }
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
    if (event.cancelable && (pointer.horizontal || (x >= 8 && x > y * 1.2))) event.preventDefault();
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
