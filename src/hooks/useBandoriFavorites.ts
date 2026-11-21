"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { ApiRouteError, getApiErrorCode, parseApiSuccessData } from "@/lib/api-contracts";
import { parseFavoriteKey, type FavoriteChange, type FavoriteGroup } from "@/lib/bandori/favorites";
import { getSafeSession } from "@/lib/supabase";
import { useGameStore } from "@/store/useGameStore";

export async function favoritesRequest<T>(url: string, viewer: string | null, init?: RequestInit): Promise<T> {
  const session = viewer ? await getSafeSession() : null;
  if (viewer && session?.user.id !== viewer) throw new Error("Session changed");
  const headers = new Headers(init?.headers);
  if (session) headers.set("Authorization", `Bearer ${session.access_token}`);
  const response = await fetch(url, { ...init, cache: "no-store", headers });
  const payload: unknown = await response.json();
  if (!response.ok) throw new ApiRouteError(response.status, getApiErrorCode(payload) ?? "FAVORITE_FAILED", "Favorite request failed");
  const data = parseApiSuccessData<T>(payload);
  if (data === null || viewer !== useGameStore.getState().userId) throw new Error("Invalid favorite response or session changed");
  return data;
}

type State = { viewer: string | null; keys: ReadonlySet<string> | null; failed: boolean };
const empty: State = { viewer: null, keys: null, failed: false };
const useFavorites = create<State>(() => empty);
const listeners = new Set<(viewer: string, change: FavoriteChange) => void>();
export function subscribeFavoriteChanges(viewer: string, listener: (change: FavoriteChange) => void) {
  const handle = (owner: string, change: FavoriteChange) => { if (owner === viewer) listener(change); };
  listeners.add(handle);
  return () => { listeners.delete(handle); };
}

function applyToKeys(keys: Set<string>, change: FavoriteChange) {
  const key = change.kind + ":" + change.target;
  if (change.selected) keys.add(key); else keys.delete(key);
}

function notifyChange(viewer: string, key: string, selected: boolean) {
  if (useGameStore.getState().userId !== viewer) return;
  const parsed = parseFavoriteKey(key);
  if (!parsed) return;
  const change = { kind: parsed.kind, target: parsed.target, selected };
  const state = useFavorites.getState();
  if (state.viewer === viewer && state.keys && state.keys.has(key) !== selected) {
    const keys = new Set(state.keys);
    applyToKeys(keys, change);
    useFavorites.setState({ keys });
  }
  for (const listener of listeners) listener(viewer, change);
}

const channel = typeof window !== "undefined" && "BroadcastChannel" in window ? new BroadcastChannel("hhwx-bandori-favorites") : null;
channel?.addEventListener("message", ({ data }) => {
  if (typeof data?.viewer === "string" && typeof data.key === "string" && typeof data.selected === "boolean") {
    notifyChange(data.viewer, data.key, data.selected);
  }
});
if (typeof window !== "undefined") useGameStore.subscribe((state, previous) => {
  if (state.userId !== previous.userId) useFavorites.setState(empty);
});

async function loadKeys(viewer: string) {
  if (useGameStore.getState().userId !== viewer) return;
  const state = useFavorites.getState();
  if (state.viewer === viewer && !state.failed) return;
  useFavorites.setState({ viewer, keys: null, failed: false });
  const loading = useFavorites.getState();
  const changes: FavoriteChange[] = [];
  const unsubscribe = subscribeFavoriteChanges(viewer, change => changes.push(change));
  try {
    const keys = new Set(await favoritesRequest<string[]>("/api/bandori/favorites?view=keys", viewer));
    if (useFavorites.getState() !== loading) return;
    for (const change of changes) applyToKeys(keys, change);
    useFavorites.setState({ viewer, keys });
  } catch {
    if (useFavorites.getState() === loading) useFavorites.setState({ failed: true });
  } finally {
    unsubscribe();
  }
}

export function syncOwnFavoriteKeys(viewer: string, groups: FavoriteGroup[]) {
  if (useGameStore.getState().userId !== viewer) return;
  useFavorites.setState({ viewer, failed: false, keys: new Set(groups.flatMap(g => g.items.map(item => g.kind + ":" + item.target))) });
}

export async function setBandoriFavorite(viewer: string, key: string, selected: boolean, onSaved?: () => void) {
  await favoritesRequest("/api/bandori/favorites/" + key, viewer, { method: selected ? "PUT" : "DELETE" });
  onSaved?.();
  notifyChange(viewer, key, selected);
  channel?.postMessage({ viewer, key, selected });
}

function useFavoriteViewer(enabled = true) {
  const viewer = useGameStore(s => enabled ? s.userId : null);
  const authReady = useGameStore(s => s.authReady);
  useEffect(() => { if (viewer && authReady) void loadKeys(viewer); }, [authReady, viewer]);
  return { viewer, authReady };
}

export function useBandoriFavoriteKeys(enabled: boolean) {
  const { viewer } = useFavoriteViewer(enabled);
  return useFavorites(s => viewer && s.viewer === viewer ? s.keys : null);
}

export function useBandoriFavorite(key: string) {
  const { viewer, authReady } = useFavoriteViewer();
  const selected = useFavorites(s => viewer && s.viewer === viewer ? s.keys?.has(key) : false);
  const failed = useFavorites(s => viewer === s.viewer && s.failed);
  const ready = useFavorites(s => !viewer || (s.viewer === viewer && s.keys !== null));
  async function toggle() {
    if (!viewer || !ready) throw new Error("Favorites unavailable");
    await setBandoriFavorite(viewer, key, !selected);
  }
  return { viewer, selected: Boolean(selected), ready: authReady && ready, failed, toggle, retry: () => viewer && loadKeys(viewer) };
}
