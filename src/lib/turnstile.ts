"use client";

import { useEffect, useState } from "react";

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";

let cachedTurnstileEnabled: boolean | null = TURNSTILE_SITE_KEY ? null : false;
let turnstileAvailabilityPromise: Promise<boolean> | null = null;

async function loadTurnstileAvailability(): Promise<boolean> {
  if (!TURNSTILE_SITE_KEY) {
    return false;
  }

  if (cachedTurnstileEnabled !== null) {
    return cachedTurnstileEnabled;
  }

  if (!turnstileAvailabilityPromise) {
    turnstileAvailabilityPromise = fetch("/api/turnstile/config", {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          return true;
        }

        const payload = await response.json().catch(() => null) as { enabled?: unknown } | null;
        return payload?.enabled === true;
      })
      .catch(() => true)
      .then((enabled) => {
        cachedTurnstileEnabled = enabled;
        turnstileAvailabilityPromise = null;
        return enabled;
      });
  }

  return turnstileAvailabilityPromise;
}

export function useTurnstileAvailability() {
  const [isTurnstileEnabled, setIsTurnstileEnabled] = useState<boolean>(() => cachedTurnstileEnabled ?? false);
  const [isTurnstileLoading, setIsTurnstileLoading] = useState<boolean>(() => Boolean(TURNSTILE_SITE_KEY && cachedTurnstileEnabled === null));

  useEffect(() => {
    let active = true;

    if (!TURNSTILE_SITE_KEY) {
      setIsTurnstileEnabled(false);
      setIsTurnstileLoading(false);
      return () => {
        active = false;
      };
    }

    if (cachedTurnstileEnabled !== null) {
      setIsTurnstileEnabled(cachedTurnstileEnabled);
      setIsTurnstileLoading(false);
      return () => {
        active = false;
      };
    }

    loadTurnstileAvailability().then((enabled) => {
      if (!active) {
        return;
      }

      setIsTurnstileEnabled(enabled);
      setIsTurnstileLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  return { isTurnstileEnabled, isTurnstileLoading };
}