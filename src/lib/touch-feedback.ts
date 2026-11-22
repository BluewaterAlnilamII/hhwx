type TouchActivation = { event: MouseEvent; claimed: boolean };
let activation: TouchActivation | null = null;

function isTouch(event: Event) {
  return event.isTrusted && ("pointerType" in event ? event.pointerType === "touch" : event.type.startsWith("touch"));
}

export function pulseTouch(event: Event, duration = 8) {
  if (isTouch(event) && document.visibilityState === "visible" && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    navigator.vibrate?.(duration);
  }
}

// Claim this tap before the first await. Only the action that actually saves calls the returned function.
export function confirmTouchOnSuccess(source?: Event) {
  if (!source && activation && !activation.claimed) {
    activation.claimed = true;
    source = activation.event;
  }
  if (!source || !isTouch(source)) return () => {};
  const event = source;
  const path = location.pathname;
  return () => { if (location.pathname === path) pulseTouch(event, 12); };
}

export function bindTouchFeedback() {
  if (typeof navigator.vibrate !== "function") return;
  function onClick(event: MouseEvent) {
    activation = null;
    if (!event.detail || !isTouch(event) || !(event.target instanceof Element)) return;
    let control = event.target.closest("button, summary, input, [role=button], [role=tab], [role=switch], [role=checkbox], label, a");
    if (control instanceof HTMLLabelElement) control = control.control;
    if (!control || control.matches("a, input:not([type=checkbox],[type=radio],[type=submit],[type=button]), [role=tab][aria-selected=true], [aria-roledescription=sortable], [data-haptic=manual]") ||
        control.closest(":disabled, [aria-disabled=true], [aria-busy=true], [inert]")) return;
    const tap = { event, claimed: false };
    activation = tap;
    // React, forms and drag handlers can consume the activation during this same event dispatch.
    window.setTimeout(() => {
      if (activation === tap) activation = null;
      if (!tap.claimed && !event.defaultPrevented) pulseTouch(event);
    }, 0);
  }
  document.addEventListener("click", onClick, true);
  return () => { document.removeEventListener("click", onClick, true); activation = null; };
}
