"use client";

import { useEffect, useState } from "react";

const BOUNDARY_TIMER_GRACE_MS = 48;

function isFiniteBoundary(boundary: number | null | undefined): boundary is number {
  return typeof boundary === "number" && Number.isFinite(boundary);
}

export function useBoundaryClock(boundaries: ReadonlyArray<number | null | undefined>): number {
  const [now, setNow] = useState(() => Date.now());

  const boundaryKey = boundaries
    .map((boundary) => (isFiniteBoundary(boundary) ? String(boundary) : "null"))
    .join("|");

  useEffect(() => {
    let timeoutId: number | null = null;
    const normalizedBoundaries = boundaryKey
      .split("|")
      .map((token) => Number(token))
      .filter((boundary) => Number.isFinite(boundary))
      .sort((left, right) => left - right);

    const scheduleNextTick = (referenceNow: number) => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }

      const nextBoundary = normalizedBoundaries.find((boundary) => boundary > referenceNow) ?? null;

      if (nextBoundary !== null) {
        timeoutId = window.setTimeout(() => {
          const nextNow = Date.now();
          setNow(nextNow);
          scheduleNextTick(nextNow);
        }, Math.max(0, nextBoundary - referenceNow + BOUNDARY_TIMER_GRACE_MS));
      }
    };

    const syncBoundaryClock = () => {
      const nextNow = Date.now();
      setNow(nextNow);
      scheduleNextTick(nextNow);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncBoundaryClock();
      }
    };

    scheduleNextTick(Date.now());
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", syncBoundaryClock);

    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", syncBoundaryClock);
    };
  }, [boundaryKey]);

  return now;
}