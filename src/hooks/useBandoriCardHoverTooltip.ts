"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEventHandler,
  type PointerEventHandler,
} from "react";

export function useBandoriCardHoverTooltip<TElement extends HTMLElement>() {
  const anchorRef = useRef<TElement | null>(null);
  const tooltipId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const isPointerInsideRef = useRef(false);
  const isFocusInsideRef = useRef(false);

  const openTooltip = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeIfInactive = useCallback(() => {
    if (isPointerInsideRef.current || isFocusInsideRef.current) {
      return;
    }
    setIsOpen(false);
  }, []);

  const closeTooltip = useCallback(() => {
    isPointerInsideRef.current = false;
    isFocusInsideRef.current = false;
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !anchorRef.current?.contains(target)) {
        closeTooltip();
      }
    };
    const handleScroll = (event: Event) => {
      if (!(event.target instanceof Node) || !anchorRef.current?.contains(event.target)) {
        closeTooltip();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        const trigger = anchorRef.current?.querySelector("button");
        if (anchorRef.current?.contains(document.activeElement) && document.activeElement !== trigger) {
          trigger?.focus({ preventScroll: true });
        }
        closeTooltip();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("scroll", handleScroll, true);
    // Close the preview before a parent dialog handles Escape at the document.
    window.addEventListener("keydown", handleEscape, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("keydown", handleEscape, true);
    };
  }, [closeTooltip, isOpen]);

  const handleBlur: FocusEventHandler<TElement> = (event) => {
    if (!anchorRef.current?.contains(event.relatedTarget as Node | null)) {
      isFocusInsideRef.current = false;
      closeIfInactive();
    }
  };
  const handleTooltipBlur: FocusEventHandler<HTMLDivElement> = (event) => {
    if (!anchorRef.current?.contains(event.relatedTarget as Node | null)) {
      isFocusInsideRef.current = false;
      closeIfInactive();
    }
  };
  const handlePointerEnter: PointerEventHandler<HTMLElement> = (event) => {
    if (event.pointerType !== "mouse") return;
    isPointerInsideRef.current = true;
    openTooltip();
  };
  const handlePointerLeave: PointerEventHandler<TElement> = (event) => {
    if (event.pointerType !== "mouse") return;
    if (anchorRef.current?.contains(event.relatedTarget as Node | null)) {
      return;
    }
    isPointerInsideRef.current = false;
    closeIfInactive();
  };
  const handleTooltipPointerLeave: PointerEventHandler<HTMLDivElement> = (event) => {
    if (event.pointerType !== "mouse") return;
    if (anchorRef.current?.contains(event.relatedTarget as Node | null)) {
      return;
    }
    isPointerInsideRef.current = false;
    closeIfInactive();
  };
  const handleFocus: FocusEventHandler<HTMLElement> = (event) => {
    if (!event.target.matches(":focus-visible")) return;
    isFocusInsideRef.current = true;
    openTooltip();
  };

  return {
    anchorRef,
    tooltipId,
    isOpen,
    openTooltip,
    closeTooltip,
    onPointerEnter: handlePointerEnter,
    onPointerLeave: handlePointerLeave,
    onFocus: handleFocus,
    onBlur: handleBlur,
    tooltipInteractionProps: {
      onPointerEnter: handlePointerEnter,
      onPointerLeave: handleTooltipPointerLeave,
      onFocus: handleFocus,
      onBlur: handleTooltipBlur,
    },
  };
}
