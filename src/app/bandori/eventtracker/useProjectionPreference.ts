"use client";

import { useCallback, useSyncExternalStore } from "react";
import { readProjectionPreference, writeProjectionPreference } from "./constants";

const PROJECTION_PREFERENCE_CHANGE_EVENT = "eventtracker:projection-preference-change";

type ProjectionPreferenceUpdater = boolean | ((previous: boolean) => boolean);

function subscribeProjectionPreference(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  window.addEventListener("storage", onStoreChange);
  window.addEventListener(PROJECTION_PREFERENCE_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(PROJECTION_PREFERENCE_CHANGE_EVENT, onStoreChange);
  };
}

export function useProjectionPreference(storageKey: string, fallbackValue: boolean) {
  const value = useSyncExternalStore(
    subscribeProjectionPreference,
    () => readProjectionPreference(storageKey) ?? fallbackValue,
    () => fallbackValue,
  );

  const setValue = useCallback((nextValue: ProjectionPreferenceUpdater) => {
    const previousValue = readProjectionPreference(storageKey) ?? fallbackValue;
    const resolvedValue = typeof nextValue === "function"
      ? nextValue(previousValue)
      : nextValue;

    writeProjectionPreference(storageKey, resolvedValue);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(PROJECTION_PREFERENCE_CHANGE_EVENT));
    }
  }, [fallbackValue, storageKey]);

  return [value, setValue] as const;
}