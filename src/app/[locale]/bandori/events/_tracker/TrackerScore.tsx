"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function TrackerScore({ value, className, children }: {
  value: number | null;
  className: string;
  children: ReactNode;
}) {
  const highlightRef = useRef<HTMLSpanElement>(null);
  const previousValue = useRef(value);

  useEffect(() => {
    const previous = previousValue.current;
    previousValue.current = value;
    if (previous === null || value === null || previous === value) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animation = highlightRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: reducedMotion ? 500 : 800,
      easing: reducedMotion ? "steps(1, end)" : "ease-out",
    });
    return () => animation?.cancel();
  }, [value]);

  return <span className={`relative isolate inline-block ${className}`}>
    <span ref={highlightRef} aria-hidden="true" className="event-score-update" />
    {children}
  </span>;
}
