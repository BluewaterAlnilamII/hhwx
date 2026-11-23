export function bindSongSheetDrag(panel: HTMLElement, layer: HTMLElement, onDismiss: () => void) {
  let pointer: { id: number; x: number; y: number; scrollTop: number; scrollRoomBelow: number } | null = null;
  let dragging = false;
  let travel = 0;
  let initialOffset = 0;
  let suppressClick = false;

  function reset() {
    pointer = null;
    dragging = false;
    delete layer.dataset.dragging;
    layer.style.removeProperty("--hhwx-song-sheet-reveal");
    panel.style.removeProperty("--sheet-stretch");
  }

  function down(event: PointerEvent) {
    if (!event.isPrimary) { reset(); return; }
    suppressClick = false;
    if (event.button !== 0 || (window.visualViewport?.scale ?? 1) > 1) return;
    const fromGrip = event.target instanceof Element && event.target.closest("[data-sheet-grip]");
    const nativeScroll = event.pointerType !== "mouse" && !fromGrip;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY,
      scrollTop: nativeScroll ? panel.scrollTop : 0,
      scrollRoomBelow: nativeScroll ? panel.scrollHeight - panel.clientHeight - panel.scrollTop : 0 };
  }

  function wantsDrag(x: number, y: number) {
    if (!pointer || Math.abs(y) <= Math.abs(x) || Math.abs(y) < 5) return false;
    return (y > 0 ? pointer.scrollTop : pointer.scrollRoomBelow) <= 1;
  }

  function move(event: PointerEvent) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const y = event.clientY - pointer.y;
    if (!dragging) {
      if (!wantsDrag(event.clientX - pointer.x, y)) return;
      dragging = true;
      suppressClick = true;
      travel = panel.getBoundingClientRect().height + parseFloat(getComputedStyle(panel).bottom);
      initialOffset = travel * (1 - Number(getComputedStyle(layer).getPropertyValue("--hhwx-song-sheet-reveal")));
      layer.dataset.gripped = "true";
      layer.dataset.dragging = "true";
      panel.setPointerCapture(event.pointerId);
    }
    const offset = initialOffset + y;
    const pull = Math.max(0, -offset);
    panel.style.setProperty("--sheet-stretch", (40 * Math.log1p(pull / 120)) + "px");
    layer.style.setProperty("--hhwx-song-sheet-reveal", String(Math.max(0, 1 - Math.max(0, offset) / travel)));
  }

  // Let an overflowing sheet scroll natively until a new gesture starts at its edge.
  function touchMove(event: TouchEvent) {
    if (!pointer || !event.cancelable || event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (dragging || wantsDrag(touch.clientX - pointer.x, touch.clientY - pointer.y)) event.preventDefault();
  }

  function end(event: PointerEvent) {
    if (pointer?.id !== event.pointerId) return;
    if (event.type === "pointerup" && dragging && event.clientY - pointer.y >= 56) {
      pointer = null;
      onDismiss();
    } else reset();
  }

  function lostCapture(event: PointerEvent) {
    if (event.target === panel && pointer?.id === event.pointerId) reset();
  }

  function click(event: MouseEvent) {
    if (suppressClick && event.detail > 0) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  const controller = new AbortController();
  const { signal } = controller;
  panel.addEventListener("pointerdown", down, { signal });
  panel.addEventListener("pointermove", move, { signal });
  panel.addEventListener("pointerup", end, { signal });
  panel.addEventListener("pointercancel", end, { signal });
  panel.addEventListener("lostpointercapture", lostCapture, { signal });
  panel.addEventListener("touchmove", touchMove, { signal, passive: false });
  panel.addEventListener("click", click, { signal, capture: true });
  return () => controller.abort();
}
