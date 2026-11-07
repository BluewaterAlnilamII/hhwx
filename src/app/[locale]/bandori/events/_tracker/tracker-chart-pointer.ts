type ChartPointerCallbacks = {
  onPoint: (x: number, y: number, contact: boolean) => void;
  onClear: (reason: "leave" | "outside" | "gesture" | "cancel") => void;
  isControlTarget?: (target: EventTarget | null) => boolean;
  canPan?: () => boolean;
  canZoom?: () => boolean;
  interactionRoot?: HTMLElement;
  onDoubleTap?: (x: number) => void;
  onWheel?: (x: number, delta: number) => void;
  onWheelActive?: (active: boolean) => void;
  onGestureStart?: (centerX: number) => void;
  onGesture?: (centerX: number, ratio: number) => void;
  onGestureEnd?: () => void;
};

export function bindTrackerChartPointer(layer: HTMLElement, callbacks: ChartPointerCallbacks) {
  const document = layer.ownerDocument;
  const contacts = new Map<number, { x: number; y: number }>();
  let activePointer: number | null = null;
  let multipleContacts = false;
  let pinch: { center: number; distance: number } | null = null;
  let mouse: { id: number; x: number; dragging: boolean } | null = null;
  let lastTap: { x: number; y: number; time: number } | null = null;
  let tap: { x: number; y: number; time: number; second: boolean; moved: boolean; dragging: boolean } | null = null;
  let wheelActive = false;
  const root = callbacks.interactionRoot ?? layer;
  const armWheel = (active: boolean) => {
    wheelActive = active;
    callbacks.onWheelActive?.(active);
  };

  const clear = (reason: Parameters<ChartPointerCallbacks["onClear"]>[0]) => {
    activePointer = null;
    callbacks.onClear(reason);
  };
  const localX = (x: number) => x - layer.getBoundingClientRect().left;
  const pair = () => {
    const [a, b] = [...contacts.values()];
    return { center: (a.x + b.x) / 2, distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) };
  };
  const point = (event: PointerEvent, contact: boolean) => {
    const bounds = layer.getBoundingClientRect();
    callbacks.onPoint(event.clientX - bounds.left, event.clientY - bounds.top, contact);
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (event.pointerType === "mouse") {
      armWheel(true);
      point(event, true);
      if (callbacks.canPan?.()) {
        mouse = { id: event.pointerId, x: event.clientX, dragging: false };
        layer.setPointerCapture(event.pointerId);
      }
      return;
    }
    const startedHere = activePointer !== null;
    contacts.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!event.isPrimary || contacts.size > 1) {
      if (tap?.dragging) callbacks.onGestureEnd?.();
      tap = lastTap = null;
      multipleContacts = true;
      clear("gesture");
      if (contacts.size === 2 && startedHere && callbacks.onGestureStart) {
        pinch = pair();
        layer.setPointerCapture(event.pointerId);
        callbacks.onGestureStart(localX(pinch.center));
      } else if (contacts.size > 2) {
        pinch = null;
        callbacks.onGestureEnd?.();
      }
      return;
    }
    if (multipleContacts) return;
    activePointer = event.pointerId;
    layer.setPointerCapture(event.pointerId);
    const second = !!callbacks.canZoom?.() && lastTap !== null && event.timeStamp - lastTap.time < 300
      && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 24;
    tap = { x: event.clientX, y: event.clientY, time: event.timeStamp, second, moved: false, dragging: false };
    lastTap = null;
    if (second) callbacks.onClear("gesture");
    else point(event, true);
  };
  const move = (event: PointerEvent) => {
    if (tap && event.pointerId === activePointer && !multipleContacts) {
      if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8) tap.moved = true;
      if (tap.second) {
        if (!tap.dragging && Math.abs(event.clientY - tap.y) > 6) {
          tap.dragging = true;
          callbacks.onGestureStart?.(localX(tap.x));
        }
        if (tap.dragging) callbacks.onGesture?.(localX(tap.x), 2 ** ((tap.y - event.clientY) / 120));
        return;
      }
    }
    if (mouse && event.pointerId === mouse.id) {
      if (!mouse.dragging && Math.abs(event.clientX - mouse.x) > 4) {
        mouse.dragging = true;
        clear("gesture");
        callbacks.onGestureStart?.(localX(mouse.x));
      }
      if (mouse.dragging) callbacks.onGesture?.(localX(event.clientX), 1);
      return;
    }
    if (contacts.has(event.pointerId)) contacts.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && contacts.size === 2) {
      const next = pair();
      callbacks.onGesture?.(localX(Math.abs(next.center - pinch.center) < 2 ? pinch.center : next.center),
        Math.abs(next.distance - pinch.distance) < 2 ? 1 : next.distance / pinch.distance);
    } else if (event.pointerType === "mouse" && contacts.size === 0) point(event, false);
    else if (event.pointerId === activePointer && !multipleContacts) point(event, true);
  };
  const end = (event: PointerEvent) => {
    if (mouse?.id === event.pointerId) {
      if (mouse.dragging) callbacks.onGestureEnd?.();
      if (event.type === "pointercancel" || event.type === "lostpointercapture") clear("cancel");
      mouse = null;
      if (layer.hasPointerCapture(event.pointerId)) layer.releasePointerCapture(event.pointerId);
      return;
    }
    if (!contacts.delete(event.pointerId)) return;
    if (pinch) { pinch = null; callbacks.onGestureEnd?.(); }
    if (event.pointerId === activePointer) {
      if (tap?.dragging) callbacks.onGestureEnd?.();
      else if (event.type === "pointerup") {
        const shortTap = tap && !tap.moved && event.timeStamp - tap.time < 300;
        if (tap && shortTap && tap.second) callbacks.onDoubleTap?.(localX(tap.x));
        else {
          point(event, true);
          if (tap && shortTap) lastTap = { x: tap.x, y: tap.y, time: event.timeStamp };
        }
      } else callbacks.onClear("cancel");
      tap = null;
      activePointer = null;
    }
    if (contacts.size === 0) multipleContacts = false;
    if (layer.hasPointerCapture(event.pointerId)) layer.releasePointerCapture(event.pointerId);
  };
  const leave = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && !mouse) clear("leave");
  };
  const outside = (event: PointerEvent) => {
    if (callbacks.isControlTarget?.(event.target)) {
      if (event.pointerType === "mouse") armWheel(true);
    } else if (!layer.contains(event.target as Node | null)) {
      clear("outside");
      armWheel(false);
      lastTap = null;
    }
  };
  const wheel = (event: WheelEvent) => {
    if (!wheelActive || !callbacks.canZoom?.() || !callbacks.onWheel || contacts.size || mouse
      || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !event.cancelable) return;
    event.preventDefault();
    clear("gesture");
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? layer.clientHeight : 1;
    callbacks.onWheel(localX(event.clientX), Math.max(-240, Math.min(240, event.deltaY * unit)));
  };
  const leaveRoot = () => armWheel(false);
  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape") blur();
  };
  const blur = () => {
    armWheel(false);
    tap = lastTap = null;
    clear("cancel");
    pinch = null;
    callbacks.onGestureEnd?.();
    if (mouse && layer.hasPointerCapture(mouse.id)) layer.releasePointerCapture(mouse.id);
    mouse = null;
    for (const id of contacts.keys()) {
      if (layer.hasPointerCapture(id)) layer.releasePointerCapture(id);
    }
    contacts.clear();
    multipleContacts = false;
  };

  layer.addEventListener("pointerdown", down);
  layer.addEventListener("pointermove", move);
  layer.addEventListener("pointerup", end);
  layer.addEventListener("pointercancel", end);
  layer.addEventListener("lostpointercapture", end);
  layer.addEventListener("pointerleave", leave);
  layer.addEventListener("wheel", wheel, { passive: false });
  root.addEventListener("pointerleave", leaveRoot);
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", escape);
  document.defaultView?.addEventListener("blur", blur);
  return () => {
    layer.removeEventListener("pointerdown", down);
    layer.removeEventListener("pointermove", move);
    layer.removeEventListener("pointerup", end);
    layer.removeEventListener("pointercancel", end);
    layer.removeEventListener("lostpointercapture", end);
    layer.removeEventListener("pointerleave", leave);
    layer.removeEventListener("wheel", wheel);
    root.removeEventListener("pointerleave", leaveRoot);
    armWheel(false);
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", escape);
    document.defaultView?.removeEventListener("blur", blur);
    if (mouse && layer.hasPointerCapture(mouse.id)) layer.releasePointerCapture(mouse.id);
    callbacks.onGestureEnd?.();
    for (const id of contacts.keys()) {
      if (layer.hasPointerCapture(id)) layer.releasePointerCapture(id);
    }
    contacts.clear();
  };
}
