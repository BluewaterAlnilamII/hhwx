"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

function parsePixelValue(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getHeightLimits(textarea: HTMLTextAreaElement) {
  const styles = window.getComputedStyle(textarea);
  return {
    minHeight: parsePixelValue(styles.minHeight, 0),
    maxHeight: parsePixelValue(styles.maxHeight, Number.POSITIVE_INFINITY),
  };
}

function resizeToContent(textarea: HTMLTextAreaElement, manualHeight: number) {
  textarea.style.height = "auto";

  const borderHeight = textarea.offsetHeight - textarea.clientHeight;
  const contentHeight = textarea.scrollHeight + borderHeight;
  const { minHeight, maxHeight } = getHeightLimits(textarea);
  const nextHeight = Math.min(maxHeight, Math.max(minHeight, contentHeight, manualHeight));

  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = contentHeight > nextHeight ? "auto" : "hidden";
}

/**
 * Grows a textarea with its content on every viewport while retaining desktop
 * vertical-resize choices as a height floor until the field is cleared.
 */
export function useAutoResizeTextarea(value: string, active = true) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const manualHeightRef = useRef(0);
  const previousValueRef = useRef(value);

  useLayoutEffect(() => {
    if (!active) return;

    const textarea = textareaRef.current;
    if (!textarea) return;

    if (value.length === 0 && previousValueRef.current.length > 0) {
      manualHeightRef.current = 0;
    }
    previousValueRef.current = value;
    resizeToContent(textarea, manualHeightRef.current);
  }, [active, value]);

  useEffect(() => {
    if (!active) {
      manualHeightRef.current = 0;
      return;
    }

    const textarea = textareaRef.current;
    if (!textarea || typeof ResizeObserver === "undefined") return;

    let isMousePointerDown = false;
    let previousWidth = textarea.clientWidth;

    const rememberManualHeight = () => {
      const { minHeight, maxHeight } = getHeightLimits(textarea);
      manualHeightRef.current = Math.min(maxHeight, Math.max(minHeight, textarea.offsetHeight));
    };

    const handlePointerDown = (event: PointerEvent) => {
      isMousePointerDown = event.pointerType === "mouse";
    };
    const handlePointerEnd = () => {
      isMousePointerDown = false;
    };

    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = textarea.clientWidth;
      if (nextWidth !== previousWidth) {
        previousWidth = nextWidth;
        resizeToContent(textarea, manualHeightRef.current);
      } else if (isMousePointerDown) {
        rememberManualHeight();
      }
    });

    textarea.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    resizeObserver.observe(textarea);

    return () => {
      textarea.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
      resizeObserver.disconnect();
    };
  }, [active]);

  return textareaRef;
}
