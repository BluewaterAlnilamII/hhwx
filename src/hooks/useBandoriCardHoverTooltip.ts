"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type MouseEventHandler,
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

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
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
  const handleMouseEnter = () => {
    isPointerInsideRef.current = true;
    openTooltip();
  };
  const handleMouseLeave: MouseEventHandler<TElement> = (event) => {
    if (anchorRef.current?.contains(event.relatedTarget as Node | null)) {
      return;
    }
    isPointerInsideRef.current = false;
    closeIfInactive();
  };
  const handleTooltipMouseLeave: MouseEventHandler<HTMLDivElement> = (event) => {
    if (anchorRef.current?.contains(event.relatedTarget as Node | null)) {
      return;
    }
    isPointerInsideRef.current = false;
    closeIfInactive();
  };
  const handleFocus = () => {
    isFocusInsideRef.current = true;
    openTooltip();
  };
  const handleKeyDown: KeyboardEventHandler<TElement> = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeTooltip();
    }
  };

  return {
    anchorRef,
    tooltipId,
    isOpen,
    openTooltip,
    closeTooltip,
    onMouseEnter: handleMouseEnter,
    onMouseLeave: handleMouseLeave,
    onFocus: handleFocus,
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
    tooltipInteractionProps: {
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleTooltipMouseLeave,
      onFocus: handleFocus,
      onBlur: handleTooltipBlur,
    },
  };
}
