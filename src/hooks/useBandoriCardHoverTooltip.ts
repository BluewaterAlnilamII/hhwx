"use client";

import { useRef, useState, type FocusEventHandler } from "react";

export function useBandoriCardHoverTooltip<TElement extends HTMLElement>() {
  const anchorRef = useRef<TElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const handleBlur: FocusEventHandler<TElement> = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsOpen(false);
    }
  };

  return {
    anchorRef,
    isOpen,
    onMouseEnter: () => setIsOpen(true),
    onMouseLeave: () => setIsOpen(false),
    onFocus: () => setIsOpen(true),
    onBlur: handleBlur,
  };
}
