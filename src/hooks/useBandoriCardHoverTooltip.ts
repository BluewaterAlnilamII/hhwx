"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEventHandler,
  type KeyboardEventHandler,
} from "react";

const CLOSE_DELAY_MS = 120;

export function useBandoriCardHoverTooltip<TElement extends HTMLElement>() {
  const anchorRef = useRef<TElement | null>(null);
  const tooltipId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPointerInsideRef = useRef(false);
  const isFocusInsideRef = useRef(false);

  const cancelScheduledClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openTooltip = useCallback(() => {
    cancelScheduledClose();
    setIsOpen(true);
  }, [cancelScheduledClose]);

  const scheduleClose = useCallback(() => {
    cancelScheduledClose();
    if (isPointerInsideRef.current || isFocusInsideRef.current) {
      return;
    }
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      if (!isPointerInsideRef.current && !isFocusInsideRef.current) {
        setIsOpen(false);
      }
    }, CLOSE_DELAY_MS);
  }, [cancelScheduledClose]);

  const closeTooltip = useCallback(() => {
    cancelScheduledClose();
    isPointerInsideRef.current = false;
    isFocusInsideRef.current = false;
    setIsOpen(false);
  }, [cancelScheduledClose]);

  useEffect(() => cancelScheduledClose, [cancelScheduledClose]);

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
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      isFocusInsideRef.current = false;
      scheduleClose();
    }
  };
  const handleTooltipBlur: FocusEventHandler<HTMLDivElement> = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      isFocusInsideRef.current = false;
      scheduleClose();
    }
  };
  const handleMouseEnter = () => {
    isPointerInsideRef.current = true;
    openTooltip();
  };
  const handleMouseLeave = () => {
    isPointerInsideRef.current = false;
    scheduleClose();
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
      onMouseLeave: handleMouseLeave,
      onFocus: handleFocus,
      onBlur: handleTooltipBlur,
    },
  };
}
