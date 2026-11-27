"use client";

import { useCallback, useSyncExternalStore } from "react";

export function readEntryValue<T>(field: string, scope: string): T | undefined {
  const saved = history.state?.[field];
  return saved?.url === location.href && saved.scope === scope ? saved.value : undefined;
}

export function writeEntryValue<T>(field: string, scope: string, value: T) {
  history.replaceState({ ...history.state, [field]: { url: location.href, scope, value } }, "");
}

export function useHistoryEntryState<T>(field: string, scope: string | undefined, initial: T) {
  const subscribe = useCallback((listener: () => void) => {
    if (scope === undefined) return () => {};
    window.addEventListener("popstate", listener);
    window.addEventListener(field, listener);
    return () => {
      window.removeEventListener("popstate", listener);
      window.removeEventListener(field, listener);
    };
  }, [field, scope]);
  const value = useSyncExternalStore(subscribe, () => (scope !== undefined ? readEntryValue<T>(field, scope) : undefined) ?? initial, () => initial);
  const save = useCallback((next: T) => {
    if (scope === undefined) return;
    writeEntryValue(field, scope, next);
    window.dispatchEvent(new Event(field));
  }, [field, scope]);
  return [value, save] as const;
}
