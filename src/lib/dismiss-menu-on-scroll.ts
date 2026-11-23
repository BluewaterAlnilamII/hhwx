export function dismissMenuOnScroll(trigger: HTMLElement, dismiss: () => void) {
  const document = trigger.ownerDocument;
  const onScroll = (event: Event) => {
    if (event.target instanceof Node && event.target.contains(trigger)) dismiss();
  };
  document.addEventListener("scroll", onScroll, true);
  return () => document.removeEventListener("scroll", onScroll, true);
}
