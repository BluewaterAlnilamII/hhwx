type ChartPointerCallbacks = {
  onPoint: (x: number, y: number, contact: boolean) => void;
  onClear: () => void;
};

export function bindTrackerChartPointer(layer: HTMLElement, callbacks: ChartPointerCallbacks) {
  const document = layer.ownerDocument;
  const contacts = new Set<number>();
  let activePointer: number | null = null;
  let multipleContacts = false;

  const clear = () => {
    activePointer = null;
    callbacks.onClear();
  };
  const point = (event: PointerEvent, contact: boolean) => {
    const bounds = layer.getBoundingClientRect();
    callbacks.onPoint(event.clientX - bounds.left, event.clientY - bounds.top, contact);
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (event.pointerType === "mouse") {
      point(event, false);
      return;
    }
    contacts.add(event.pointerId);
    if (!event.isPrimary || contacts.size > 1) {
      multipleContacts = true;
      clear();
      return;
    }
    if (multipleContacts) return;
    activePointer = event.pointerId;
    layer.setPointerCapture(event.pointerId);
    point(event, true);
  };
  const move = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && contacts.size === 0) point(event, false);
    else if (event.pointerId === activePointer && !multipleContacts) point(event, true);
  };
  const end = (event: PointerEvent) => {
    if (!contacts.delete(event.pointerId)) return;
    if (event.pointerId === activePointer) {
      if (event.type === "pointerup") point(event, true);
      else callbacks.onClear();
      activePointer = null;
    }
    if (contacts.size === 0) multipleContacts = false;
    if (layer.hasPointerCapture(event.pointerId)) layer.releasePointerCapture(event.pointerId);
  };
  const leave = (event: PointerEvent) => {
    if (event.pointerType === "mouse") clear();
  };
  const outside = (event: PointerEvent) => {
    if (!layer.contains(event.target as Node | null)) clear();
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape") clear();
  };
  const blur = () => {
    clear();
    for (const id of contacts) {
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
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", escape);
    document.defaultView?.removeEventListener("blur", blur);
    for (const id of contacts) {
      if (layer.hasPointerCapture(id)) layer.releasePointerCapture(id);
    }
    contacts.clear();
  };
}
